import { db } from "./firebase-config.js";
import { doc, updateDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// =========================================================================
//  IVALIS - MOTEUR DE RÉSOLUTION DES COMBATS (CIBLAGE ET DÉGÂTS)
// =========================================================================

window.ETAT_CIBLAGE = {
    actif: false,
    idCarte: null,
    attaques: [], 
    alterations: [],
    cibleUnique: null,
    isZone: false,
    zoneHexesBase: [],
    zoneCenterHex: null,
    zoneRotationStep: 0,
    initialTwistAngle: 0,
    initialZoneStep: 0
};

// --- OUTILS MATHÉMATIQUES ---
function getHexDistance(a, b) {
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

// =========================================================================
//  ATTAQUES D'OPPORTUNITÉ
//  Déclenchées depuis mouvement.js quand un personnage quitte le corps-à-corps
//  d'un adversaire (camp opposé uniquement). 10 dégâts fixes, ignorant l'armure
//  et les compétences équipées, mais toujours soumis à un jet d'esquive/parade
//  et absorbés par un bouclier magique actif comme une attaque normale.
// =========================================================================
// Le jet est calculé UNE SEULE FOIS, sur l'écran de celui qui déplace le pion (seul client
// à connaître le avant/après du mouvement). Le résultat déjà tranché (pas juste "il se passe
// un truc, chacun relance son dé") est ensuite diffusé via Action_Opportunite : tous les
// clients (celui qui a bougé y compris) le rejouent à l'identique via jouerAnimationOpportunite.
window.resoudreAttaqueOpportunite = async function(idAttaquant, idCible) {
    const attaquantData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idAttaquant);
    const cibleData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idCible);
    if (!attaquantData || !cibleData) return;
    if (attaquantData.statut === "Mort" || cibleData.statut === "Mort") return;
    if (!window.ID_PARTIE_COURANTE) return;

    const esquive = (parseInt(cibleData.Esquive) || 0) + (parseInt(cibleData.Dev_Mod_Esquive) || 0);
    const parade = (parseInt(cibleData.Parade) || 0) + (parseInt(cibleData.Dev_Mod_Parade) || 0);
    const jetDef = Math.floor(Math.random() * 100) + 1;
    const statDef = Math.max(esquive, parade);
    const motDef = parade > esquive ? "Paré 🛡️" : "Esquivé 💨";
    const dodged = jetDef <= statDef;

    let degats = 0;
    let viaBouclier = false;

    if (!dodged) {
        degats = 10; // Fixe : ignore l'armure et les compétences/références de l'attaquant
        const oldShield = parseInt(cibleData.Bouclier_Actuel) || 0;

        try {
            const refPerso = doc(db, "Personnages", idCible);
            if (oldShield > 0) {
                viaBouclier = true;
                const shieldNew = Math.max(0, oldShield - degats); // L'overkill part dans le vide, comme une attaque normale
                cibleData.Bouclier_Actuel = shieldNew;
                await updateDoc(refPerso, { Bouclier_Actuel: shieldNew });
            } else {
                const oldPv = parseInt(cibleData.PV_Actuels) || 0;
                const newPv = Math.max(0, oldPv - degats);
                cibleData.PV_Actuels = newPv;
                await updateDoc(refPerso, { PV_Actuels: newPv });
            }
        } catch (e) {
            console.error("Erreur attaque d'opportunité :", e);
        }
    }

    try {
        await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), {
            Action_Opportunite: { idAttaquant, idCible, dodged, motDef, degats, viaBouclier, timestamp: Date.now() }
        });
    } catch (e) {
        console.error("Erreur diffusion attaque d'opportunité :", e);
    }

    // Laisse le temps à l'animation diffusée de se jouer avant d'enchaîner sur l'ennemi suivant
    // (s'il y en a plusieurs) : sinon deux écritures trop rapprochées se marchent dessus.
    await new Promise(r => setTimeout(r, dodged ? 1800 : 2000));
};

// Rejoue le résultat déjà tranché (par resoudreAttaqueOpportunite) chez CHAQUE joueur connecté,
// y compris celui qui a déplacé le pion. Ne relance jamais le dé et n'écrit rien : uniquement
// de l'affichage, la vraie donnée (PV/bouclier) arrive séparément via la sync habituelle des persos.
window.jouerAnimationOpportunite = async function(data) {
    if (!data || !data.idCible) return;
    const tkCible = window.TOKENS_VTT_DATA ? window.TOKENS_VTT_DATA[data.idCible] : null;
    if (!tkCible || typeof window.afficherMessageFlottantHex !== "function") return;

    window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "⚔️ Attaque d'opportunité !", "#ffaa00");
    await new Promise(r => setTimeout(r, 500));

    if (data.dodged) {
        window.afficherMessageFlottantHex(tkCible.q, tkCible.r, data.motDef, "#cccccc");
        return;
    }

    const couleur = data.viaBouclier ? "#00ffff" : "#ff4c4c";
    const icone = data.viaBouclier ? "🛡️" : "🩸";
    window.afficherMessageFlottantHex(tkCible.q, tkCible.r, `-${data.degats} ${icone}`, couleur);

    const tokenDiv = document.getElementById("token-" + data.idCible);
    if (tokenDiv) {
        tokenDiv.style.transition = "filter 0.1s";
        tokenDiv.style.filter = "sepia(1) hue-rotate(-50deg) saturate(5) brightness(1.2)";
        setTimeout(() => { tokenDiv.style.filter = ""; }, 300);
    }
};

// Retourne la liste des idPersonnage adverses (camp opposé, vivants) au contact (distance 1)
// d'un pion place en (q,r). Utilisée par mouvement.js pour comparer avant/après un déplacement.
window.listerEnnemisAuContact = function(idPersonnage, hexPosition) {
    const perso = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPersonnage);
    if (!perso || !hexPosition) return [];

    const resultat = [];
    for (let idAutre in (window.TOKENS_VTT_DATA || {})) {
        if (idAutre === idPersonnage) continue;
        const autre = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idAutre);
        if (!autre || autre.statut === "Mort" || autre.camp === perso.camp) continue;
        if (getHexDistance(hexPosition, window.TOKENS_VTT_DATA[idAutre]) === 1) {
            resultat.push(idAutre);
        }
    }
    return resultat;
};

function verifierLigneDeVue(hexA, hexB) {
    if (!window.PLATEAU_VTT) return true;
    let dist = getHexDistance(hexA, hexB);
    if (dist <= 1) return true; 

    const lerp = (a, b, t) => a + (b - a) * t;
    const cubeRound = (q, r, s) => {
        let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
        let q_diff = Math.abs(rq - q), r_diff = Math.abs(rr - r), s_diff = Math.abs(rs - s);
        if (q_diff > r_diff && q_diff > s_diff) rq = -rr - rs;
        else if (r_diff > s_diff) rr = -rq - rs;
        return { q: rq, r: rr };
    };

    let aCube = { q: hexA.q + 1e-6, r: hexA.r + 1e-6, s: -hexA.q - hexA.r - 2e-6 };
    let bCube = { q: hexB.q + 1e-6, r: hexB.r + 1e-6, s: -hexB.q - hexB.r - 2e-6 };

    for (let i = 1; i < dist; i++) { 
        let t = i / dist;
        let q = lerp(aCube.q, bCube.q, t);
        let r = lerp(aCube.r, bCube.r, t);
        let s = lerp(aCube.s, bCube.s, t);
        let pt = cubeRound(q, r, s);
        
        const state = window.PLATEAU_VTT.getCaseState(pt.q, pt.r);
        if (state && state.isBlocked) return false;
    }
    return true;
}

// =========================================================================
//  BOND
//  Saut de 1 à `portee` cases (pas un déplacement classique : aucune fatigue de mouvement,
//  seul le coût de la carte s'applique). Peut survoler cases supprimées, alliés, ennemis et
//  terrain difficile ; ne peut pas franchir un mur (même check que la ligne de vue). Ne
//  déclenche jamais d'attaque d'opportunité et n'y est jamais sujet (cf. mouvement.js, qui
//  n'appelle pas resoudreAttaqueOpportunite pour ce type d'action).
// =========================================================================
window.resoudreBondInteractif = function(idPerso, portee) {
    return new Promise((resolve) => {
        const tkDepart = window.TOKENS_VTT_DATA ? window.TOKENS_VTT_DATA[idPerso] : null;
        if (!tkDepart || !window.PLATEAU_VTT) return resolve(false);

        const hexDepart = { q: tkDepart.q, r: tkDepart.r };

        // 1. Cases d'arrivée valides : à portée, ni mur, ni case supprimée, ni occupée,
        //    et joignables sans franchir un mur (les autres obstacles se survolent).
        const candidats = window.PLATEAU_VTT.getHexesInRadius(hexDepart.q, hexDepart.r, portee);
        const hexesValides = candidats.filter(h => {
            if (h.q === hexDepart.q && h.r === hexDepart.r) return false;

            const state = window.PLATEAU_VTT.getCaseState(h.q, h.r);
            if (state.isBlocked || state.isDeleted) return false;

            for (let idAutre in window.TOKENS_VTT_DATA) {
                if (idAutre === idPerso) continue;
                const autre = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idAutre);
                if (!autre || autre.statut === "Mort") continue;
                const tkAutre = window.TOKENS_VTT_DATA[idAutre];
                if (tkAutre.q === h.q && tkAutre.r === h.r) return false;
            }

            return verifierLigneDeVue(hexDepart, h);
        });

        if (hexesValides.length === 0) {
            alert("Aucune case d'atterrissage disponible pour le Bond.");
            return resolve(false);
        }

        // 2. Assombrit tout l'écran sauf la case de départ et les cases d'arrivée valides.
        // SVG placé DANS #transform-plateau : il hérite du pan/zoom sans aucun recalcul JS.
        const conteneurTransform = document.getElementById("transform-plateau");
        const conteneur = document.getElementById("conteneur-plateau-vtt");
        if (!conteneurTransform || !conteneur) return resolve(false);

        const ancienOverlay = document.getElementById("svg-bond-assombrissement");
        if (ancienOverlay) ancienOverlay.remove();

        const hexSize = window.PLATEAU_VTT.hexSize;
        const pointsHex = (q, r) => {
            const px = window.PLATEAU_VTT.hexToPixel(q, r);
            let pts = "";
            for (let i = 0; i < 6; i++) {
                const angle = Math.PI / 180 * (60 * i);
                pts += (px.x + hexSize * Math.cos(angle)) + "," + (px.y + hexSize * Math.sin(angle)) + " ";
            }
            return pts.trim();
        };

        const maskId = "masque-bond-" + Date.now();
        let trous = `<polygon points="${pointsHex(hexDepart.q, hexDepart.r)}" fill="black"/>`;
        hexesValides.forEach(h => { trous += `<polygon points="${pointsHex(h.q, h.r)}" fill="black"/>`; });

        const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        overlay.id = "svg-bond-assombrissement";
        overlay.style.cssText = "position:absolute; top:0; left:0; overflow:visible; z-index:4; pointer-events:none;";
        overlay.innerHTML = `
            <defs>
                <mask id="${maskId}">
                    <rect x="-20000" y="-20000" width="40000" height="40000" fill="white"/>
                    ${trous}
                </mask>
            </defs>
            <rect x="-20000" y="-20000" width="40000" height="40000" fill="rgba(0,0,0,0.6)" mask="url(#${maskId})"/>
        `;
        conteneurTransform.appendChild(overlay);
        window.surlignerEffetCarteActif("Bond");

        // 3. Un tap sur une case valide confirme le saut.
        //    Un tap sur soi-même annule le saut (la carte reste quand même consommée).
        //    Un tap sur un autre personnage affiche "Cible invalide" et reste en attente.
        //    Un tap hors de portée ne fait rien : on reste en attente d'un clic valide.
        const nettoyer = () => {
            overlay.remove();
            window.surlignerEffetCarteActif(null);
            window.removeEventListener("click", onClick, { capture: true });
        };

        const onClick = async (e) => {
            if (!conteneur.contains(e.target)) return;
            e.stopPropagation();

            const tokenClique = e.target.closest ? e.target.closest(".token-vtt") : null;
            if (tokenClique) {
                const idClique = tokenClique.id.replace("token-", "");

                if (idClique === idPerso) {
                    nettoyer();
                    return resolve(false); // Annulé, mais la carte reste consommée par l'appelant
                }

                const tkClique = window.TOKENS_VTT_DATA[idClique];
                if (tkClique && typeof window.afficherMessageFlottantHex === "function") {
                    window.afficherMessageFlottantHex(tkClique.q, tkClique.r, "Cible invalide", "#aaaaaa");
                }
                return;
            }

            const canvasX = (e.clientX - window.VTT_POS_X) / window.VTT_SCALE;
            const canvasY = (e.clientY - window.VTT_POS_Y) / window.VTT_SCALE;
            const hex = window.PLATEAU_VTT.pixelToHex(canvasX, canvasY);
            const cible = hexesValides.find(h => h.q === hex.q && h.r === hex.r);

            if (!cible) return; // Hors de portée : ne fait rien

            nettoyer();

            const hexArrivee = { q: cible.q, r: cible.r };
            window.TOKENS_VTT_DATA[idPerso].q = hexArrivee.q;
            window.TOKENS_VTT_DATA[idPerso].r = hexArrivee.r;

            try {
                await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), {
                    Action_Bond: { idToken: idPerso, depart: hexDepart, arrivee: hexArrivee, timestamp: Date.now() }
                });
                await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
                    Tokens: window.TOKENS_VTT_DATA
                }, { merge: true });
            } catch (err) {
                console.error("Erreur Bond :", err);
            }

            // On attend la durée de l'animation locale du saut (voir jouerAnimationBond) avant de
            // rendre la main : sinon la suite de la carte (ex. ciblage d'une attaque) construit son
            // affichage AVANT le rafraîchissement complet des pions qui clôt l'animation, et se fait
            // aussitôt effacer par lui.
            await new Promise(r => setTimeout(r, 750));
            resolve(true);
        };

        window.addEventListener("click", onClick, { capture: true });
    });
};

// =========================================================================
//  POUSSÉE
//  Déplacement forcé de 2 cases en ligne droite depuis le lanceur, à travers la cible.
//  La chance est extraite dans demarrerCiblage ; le jet lui-même est fait UNE SEULE FOIS,
//  par le lanceur uniquement (voir l'appel dans jouerAnimationMoteur), puis diffusé via
//  Action_Poussee (même principe que le Bond) pour que tous les joueurs voient le même
//  résultat plutôt que de rejouer chacun leur propre jet. Bloquée par un mur, une case
//  supprimée ou une case occupée : la poussée s'arrête alors à la dernière case libre (1
//  case), ou ne bouge pas du tout si la première l'est déjà. Ne déclenche jamais d'attaque
//  d'opportunité (déplacement subi, pas un mouvement volontaire du joueur).
// =========================================================================
window.declencherPousseeCible = async function(idLanceur, idCible) {
    const tkLanceur = window.TOKENS_VTT_DATA ? window.TOKENS_VTT_DATA[idLanceur] : null;
    const tkCible = window.TOKENS_VTT_DATA ? window.TOKENS_VTT_DATA[idCible] : null;
    if (!tkLanceur || !tkCible || !window.PLATEAU_VTT || !window.ID_PARTIE_COURANTE) return;

    const dist = getHexDistance(tkLanceur, tkCible);
    if (dist === 0) return;

    const lerp = (a, b, t) => a + (b - a) * t;
    const cubeRound = (q, r, s) => {
        let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
        let qd = Math.abs(rq - q), rd = Math.abs(rr - r), sd = Math.abs(rs - s);
        if (qd > rd && qd > sd) rq = -rr - rs;
        else if (rd > sd) rr = -rq - rs;
        return { q: rq, r: rr };
    };
    const aCube = { q: tkLanceur.q + 1e-6, r: tkLanceur.r + 1e-6, s: -tkLanceur.q - tkLanceur.r - 2e-6 };
    const bCube = { q: tkCible.q + 1e-6, r: tkCible.r + 1e-6, s: -tkCible.q - tkCible.r - 2e-6 };

    // Bloquée par un mur, une case supprimée, OU une case occupée (règle demandée pour la
    // Poussée : contrairement au Bond, on ne survole pas les personnages ni les cases rouges).
    const estLibre = (q, r) => {
        const state = window.PLATEAU_VTT.getCaseState(q, r);
        if (state.isBlocked || state.isDeleted) return false;
        for (let idAutre in window.TOKENS_VTT_DATA) {
            if (idAutre === idCible) continue;
            const autre = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idAutre);
            if (!autre || autre.statut === "Mort") continue;
            const tkAutre = window.TOKENS_VTT_DATA[idAutre];
            if (tkAutre.q === q && tkAutre.r === r) return false;
        }
        return true;
    };

    const hexDepart = { q: tkCible.q, r: tkCible.r };
    let arrivee = null;
    for (let i = 1; i <= 2; i++) {
        const t = (dist + i) / dist;
        const pt = cubeRound(lerp(aCube.q, bCube.q, t), lerp(aCube.r, bCube.r, t), lerp(aCube.s, bCube.s, t));
        if (!estLibre(pt.q, pt.r)) break;
        arrivee = pt;
    }

    if (!arrivee) {
        if (typeof window.afficherMessageFlottantHex === "function") {
            window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Poussée (bloquée)", "#aaaaaa");
        }
        return;
    }

    window.TOKENS_VTT_DATA[idCible].q = arrivee.q;
    window.TOKENS_VTT_DATA[idCible].r = arrivee.r;

    try {
        await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), {
            Action_Poussee: { idToken: idCible, depart: hexDepart, arrivee: arrivee, timestamp: Date.now() }
        });
        await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
            Tokens: window.TOKENS_VTT_DATA
        }, { merge: true });
    } catch (err) {
        console.error("Erreur Poussée :", err);
    }
};

function rotateHex(hex, steps) {
    let q = hex.q, r = hex.r;
    for(let i = 0; i < steps; i++) {
        let nq = -r;
        let nr = q + r;
        q = nq;
        r = nr;
    }
    return {q, r};
}

// =========================================================================
//  1. ÉVÉNEMENTS GLOBAUX
// =========================================================================

window.VTT_CIBLAGE_MOUSEMOVE = function(e) {
    if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;
    const state = window.ETAT_CIBLAGE;
    if (!state || !state.actif || !state.isZone) return;

    const idLanceur = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage;
    const tkLanceur = window.TOKENS_VTT_DATA[idLanceur];
    const lanceurData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idLanceur);
    const configSort = state.attaques[0] || state.alterations[0]; 

    const canvasX = (e.clientX - window.VTT_POS_X) / window.VTT_SCALE;
    const canvasY = (e.clientY - window.VTT_POS_Y) / window.VTT_SCALE;
    const hoverHex = window.PLATEAU_VTT.pixelToHex(canvasX, canvasY);

    if (configSort && configSort.isRanged) {
        const dist = getHexDistance(tkLanceur, hoverHex);
        
        let estEngage = false;
        for (let idToken in window.TOKENS_VTT_DATA) {
            if (idToken === idLanceur) continue; 
            const d = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idToken);
            if (d && d.camp !== lanceurData.camp && d.statut !== "Mort" && getHexDistance(tkLanceur, window.TOKENS_VTT_DATA[idToken]) === 1) {
                estEngage = true; break;
            }
        }

        if (estEngage && dist > 1) state.zoneCenterHex = null; 
        else if (dist > configSort.rangeMax) state.zoneCenterHex = null; 
        else if (!verifierLigneDeVue(tkLanceur, hoverHex)) state.zoneCenterHex = null; 
        else state.zoneCenterHex = hoverHex; 

    } else {
        state.zoneCenterHex = { q: tkLanceur.q, r: tkLanceur.r };
        const pxLanceur = window.PLATEAU_VTT.hexToPixel(tkLanceur.q, tkLanceur.r);
        const screenPxX = window.VTT_POS_X + pxLanceur.x * window.VTT_SCALE;
        const screenPxY = window.VTT_POS_Y + pxLanceur.y * window.VTT_SCALE;
        const dy = e.clientY - screenPxY;
        const dx = e.clientX - screenPxX;
        let angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
        let step = Math.round(angleDeg / 60);
        if (step < 0) step += 6;
        state.zoneRotationStep = step % 6;
    }
    window.actualiserVisuelCiblage();
};

window.VTT_CIBLAGE_WHEEL = function(e) {
    const state = window.ETAT_CIBLAGE;
    if (!state || !state.actif || !state.isZone) return;
    const configSort = state.attaques[0] || state.alterations[0];
    
    if (configSort && configSort.isRanged) {
        e.preventDefault();
        e.stopPropagation(); 
        let delta = Math.sign(e.deltaY);
        state.zoneRotationStep = (state.zoneRotationStep + delta + 6) % 6;
        window.actualiserVisuelCiblage();
    }
};

window.VTT_CIBLAGE_CLICK = function(e) {
    const state = window.ETAT_CIBLAGE;
    if (!state || !state.actif || !state.isZone) return;
    const conteneur = document.getElementById("conteneur-plateau-vtt");
    if (!conteneur || !conteneur.contains(e.target)) return;
    e.stopPropagation(); 

    const configSort = state.attaques[0] || state.alterations[0];

    if (configSort && configSort.isRanged) {
        const canvasX = (e.clientX - window.VTT_POS_X) / window.VTT_SCALE;
        const canvasY = (e.clientY - window.VTT_POS_Y) / window.VTT_SCALE;
        const targetHex = window.PLATEAU_VTT.pixelToHex(canvasX, canvasY);
        
        const idLanceur = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage;
        const tkLanceur = window.TOKENS_VTT_DATA[idLanceur];
        const lanceurData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idLanceur);
        const dist = getHexDistance(tkLanceur, targetHex);
        
        let estEngage = false;
        for (let idToken in window.TOKENS_VTT_DATA) {
            if (idToken === idLanceur) continue; 
            const d = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idToken);
            if (d && d.camp !== lanceurData.camp && d.statut !== "Mort" && getHexDistance(tkLanceur, window.TOKENS_VTT_DATA[idToken]) === 1) {
                estEngage = true; break;
            }
        }

        if (estEngage && dist > 1) state.zoneCenterHex = null; 
        else if (dist > configSort.rangeMax) state.zoneCenterHex = null; 
        else if (!verifierLigneDeVue(tkLanceur, targetHex)) state.zoneCenterHex = null; 
        else state.zoneCenterHex = targetHex; 
    }

    window.actualiserVisuelCiblage();

    if (state.zoneCenterHex && window.matchMedia("(hover: hover)").matches) {
        window.validerZoneAoE();
    }
};

window.VTT_CIBLAGE_TOUCHSTART = function(e) {
    const state = window.ETAT_CIBLAGE;
    if (!state || !state.actif || !state.isZone) return;
    if (e.touches.length === 2) {
        e.preventDefault();
        e.stopPropagation();
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        state.initialTwistAngle = Math.atan2(dy, dx) * 180 / Math.PI;
        state.initialZoneStep = state.zoneRotationStep;
    }
};

window.VTT_CIBLAGE_TOUCHMOVE = function(e) {
    const state = window.ETAT_CIBLAGE;
    if (!state || !state.actif || !state.isZone) return;
    if (e.touches.length === 2) {
        e.preventDefault(); 
        e.stopPropagation();
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const currentAngle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        let diff = currentAngle - state.initialTwistAngle;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        
        let stepDelta = Math.round((diff * 2) / 60);
        let newStep = (state.initialZoneStep + stepDelta) % 6;
        if (newStep < 0) newStep += 6;
        
        if (state.zoneRotationStep !== newStep) {
            state.zoneRotationStep = newStep;
            window.actualiserVisuelCiblage();
        }
    }
};

// =========================================================================
//  2. DÉMARRAGE ET UI DU CIBLAGE
// =========================================================================

window.demarrerCiblage = async function(idCarte) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    // Le cache des effets n'est chargé qu'une fois, au tout premier chargement de la page.
    // S'il a raté (réseau lent/instable) ou est resté vide, on le recharge ici avant de continuer :
    // sinon, aucun effet de la carte n'est reconnu et elle se valide à vide, sans jamais proposer de cible.
    if (!window.EFFETS_BDD_CACHE || Object.keys(window.EFFETS_BDD_CACHE).length === 0) {
        if (typeof window.chargerCacheEffetsBDD === "function") {
            await window.chargerCacheEffetsBDD();
        }
    }
    if (!window.EFFETS_BDD_CACHE || Object.keys(window.EFFETS_BDD_CACHE).length === 0) {
        return alert("Grimoire non synchronisé. Vérifie ta connexion et réessaie.");
    }

    const dataCarte = window.COMPETENCES_CACHE[idCarte];
    if (!dataCarte) return;

    // DEBUG POUR NICO (Pour comprendre la structure si ça rate un jour)
    console.log("=== STRUCTURE DE LA CARTE ===", JSON.parse(JSON.stringify(dataCarte)));

    const attaquesExtraites = [];
    const alterationsExtraites = [];
    let isZone = false;
    let zoneHexesBase = [];
    let isBond = false;
    let porteeBond = 2;
    // Pour que la carte se résolve dans l'ordre où elle est construite : on retient à quel
    // rang du tableau se trouve le Bond, et à quel rang apparaît le premier autre effet
    // (attaque/soin/altération). Si le Bond est après, on le joue après la résolution de l'attaque.
    let indexBond = -1;
    let indexPremierAutreEffet = -1;

    const parseFrFloat = (val) => {
        if (val === undefined || val === null || val === "") return 0;
        const res = parseFloat(val.toString().replace(',', '.'));
        return isNaN(res) ? 0 : res;
    };

    // 🔻 L'EXTRACTEUR UNIVERSEL (Comprend tous les formats de sauvegarde de la Forge) 🔻
    const extraireMods = (modsBruts) => {
        let liste = [];
        if (!modsBruts) return liste;
        if (Array.isArray(modsBruts)) {
            modsBruts.forEach(m => {
                if (typeof m === "string") liste.push({ id: m, count: 1 });
                else if (m.id) liste.push({ id: m.id, count: m.count || 1 });
                else if (m.effetId) liste.push({ id: m.effetId, count: m.count || 1 });
            });
        } else if (typeof modsBruts === "object") {
            Object.keys(modsBruts).forEach(k => {
                liste.push({ id: k, count: modsBruts[k] });
            });
        }
        return liste;
    };

    // La Forge stocke les tours du bouton ⏳ dans act.baseDuree / act.modsDuree,
    // et jamais comme un effet "Durée +" dans act.mods.
    const estEtatEtourdi = (eff) => {
        if (!eff) return false;
        const champs = [eff.Nom, eff.Cible_Etat, eff.Type_Mecanique, eff.Type_Mecanique_2];
        return champs.some(v => {
            const s = (v || "").toLowerCase();
            return s.includes("étourdi") || s.includes("etourdi") || s.includes("immobilis");
        });
    };

    if (dataCarte.Composants && dataCarte.Composants.actions) {
        dataCarte.Composants.actions.forEach((act, idxAction) => {
            if (act.zoneHexes && act.zoneHexes.length > 0) {
                isZone = true;
                zoneHexesBase = act.zoneHexes;
            }

            const effBase = window.EFFETS_BDD_CACHE[act.baseEffetId];
            if (!effBase) return;

            const nomLower = (effBase.Nom || "").toLowerCase();
            const listeMods = extraireMods(act.mods);
            const modsDuree = act.modsDuree || {};

            // Bond : pas une attaque/alteration, traité à part avant tout le reste de la carte.
            if (nomLower.includes("bond")) {
                isBond = true;
                indexBond = idxAction;
                porteeBond = Math.round(parseFrFloat(effBase.Valeur) * (act.count || 1)) || 2;
                return;
            }

            let isRanged = false;
            let rangeMax = 1;
            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (modEff && modEff.Nom === "Distance") {
                    isRanged = true;
                    rangeMax = 1 + ((parseFrFloat(modEff.Valeur) || 0) * m.count);
                }
            });

            // A. Détection Attaques, Soins & Purifications
            let isPurification = false;
            let purifChance = 0;

            if (nomLower.includes("purification")) {
                isPurification = true;
                purifChance += (parseFrFloat(effBase.Pourcent_Base) || 0) * (act.count || 1);
            }
            
            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (modEff && (modEff.Nom || "").toLowerCase().includes("purification")) {
                    isPurification = true;
                    purifChance += (parseFrFloat(modEff.Pourcent_Base) || 0) * m.count;
                }
            });

            let isShield = nomLower.includes("bouclier");

            if (nomLower.includes("attaque") || nomLower.includes("pouvoir") || nomLower.includes("soin") || nomLower.includes("guérison") || isPurification || isShield) {
                let isHeal = nomLower.includes("soin") || nomLower.includes("guérison") || isPurification || isShield;

                if (indexPremierAutreEffet === -1) indexPremierAutreEffet = idxAction;
                attaquesExtraites.push({
                    nom: effBase.Nom,
                    typeRes: (nomLower.includes("magique") || nomLower.includes("pouvoir") || isHeal) ? "Magique" : "Physique",
                    valeurBrute: (parseFrFloat(effBase.Valeur) || 0) * (act.count || 1),
                    isRanged: isRanged,
                    rangeMax: rangeMax,
                    isHeal: isHeal,
                    isShield: isShield,
                    purifChance: purifChance,
                    cibles: []
                });
            }

            // B. Détection États Altérés
            let isStun = false;
            let stunChance = 0;
            let stunDuree = 0;

            if (estEtatEtourdi(effBase)) {
                isStun = true;
                stunChance += parseFrFloat(effBase.Pourcent_Base) * (act.count || 1);
                const bonus = parseFrFloat(act.baseDuree);
                const d = parseFrFloat(effBase.Tours) + bonus;
                if (d > stunDuree) stunDuree = d;
                console.log(`⏱️ Étourdi (effet de base ${effBase.Nom}) : Tours(${parseFrFloat(effBase.Tours)}) + ⏳Forge(${bonus}) = ${d}`);
            }

            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (!estEtatEtourdi(modEff)) return;

                isStun = true;
                const baseChance = parseFrFloat(modEff.Pourcent_Base) || parseFrFloat(modEff.Pourcent_Max);
                stunChance += baseChance * m.count;

                const bonus = parseFrFloat(modsDuree[m.id]);
                const d = parseFrFloat(modEff.Tours) + bonus;
                if (d > stunDuree) stunDuree = d;
                console.log(`⏱️ Étourdi (mod ${modEff.Nom}) : Tours(${parseFrFloat(modEff.Tours)}) + ⏳Forge(${bonus}) = ${d}`);
            });

            if (isStun) {
                if (stunDuree <= 0) stunDuree = 2; // Sécurité si la BDD n'a pas de durée
                console.log(`⚡ État Étourdi configuré : ${stunDuree} tours (chance ${stunChance}%).`);

                if (indexPremierAutreEffet === -1) indexPremierAutreEffet = idxAction;
                alterationsExtraites.push({
                    nom: "Étourdi",
                    icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1787381297/ETOURDIT_2_j7w36h.png",
                    desc: "-20% Esquive/Parade, 10% de chance d'échec d'attaque.",
                    chance: stunChance,
                    duree: stunDuree,
                    isRanged: isRanged,
                    rangeMax: rangeMax,
                    cibles: []
                });
            }

            // 🔻 NOUVEAU : DÉTECTION POUSSÉE 🔻
            // Chance de repousser la cible de 2 cases en ligne droite depuis le lanceur. Pas un état
            // persistant (aucune entrée dans Etats_Alteres) : résolue et animée à part dans
            // jouerAnimationMoteur / declencherPousseeCible, avec sa propre diffusion (comme le Bond)
            // pour que tous les joueurs voient le même résultat.
            let isPoussee = false;
            let pousseeChance = 0;

            if (nomLower.includes("pouss")) {
                isPoussee = true;
                pousseeChance += (parseFrFloat(effBase.Pourcent_Base) || 0) * (act.count || 1);
            }

            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (modEff && (modEff.Nom || "").toLowerCase().includes("pouss")) {
                    isPoussee = true;
                    pousseeChance += (parseFrFloat(modEff.Pourcent_Base) || 0) * m.count;
                }
            });

            if (isPoussee) {
                if (pousseeChance > 50) pousseeChance = 50; // Cap à 50%

                if (indexPremierAutreEffet === -1) indexPremierAutreEffet = idxAction;
                alterationsExtraites.push({
                    nom: "Poussée",
                    icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png",
                    desc: `${pousseeChance}% de chance de repousser la cible de 2 cases en ligne droite.`,
                    chance: pousseeChance,
                    duree: 0, // Instantané : jamais ajouté à Etats_Alteres
                    isRanged: isRanged,
                    rangeMax: rangeMax,
                    cibles: [],
                    estPoussee: true
                });
            }

            // 🔻 NOUVEAU : DÉTECTION ABSORPTION 🔻
            let isAbsorption = false;
            let absorptionValeur = 0;

            if (nomLower.includes("absorption")) {
                isAbsorption = true;
                absorptionValeur += (parseFrFloat(effBase.Valeur) || 20) * (act.count || 1);
            }

            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (modEff && (modEff.Nom || "").toLowerCase().includes("absorption")) {
                    isAbsorption = true;
                    absorptionValeur += (parseFrFloat(modEff.Valeur) || 20) * m.count;
                }
            });

            if (isAbsorption) {
                if (absorptionValeur > 100) absorptionValeur = 100; // Cap à 100% d'annulation

                if (indexPremierAutreEffet === -1) indexPremierAutreEffet = idxAction;
                alterationsExtraites.push({
                    nom: "Absorption",
                    icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png", // NOTE: Remplace par le lien d'une belle icône Cloudinary !
                    desc: `Annule ${absorptionValeur}% des dégâts subis et soigne de 10% de la frappe.`,
                    chance: 100, // Toujours 100% d'application pour un buff
                    duree: 1, // Dure uniquement le tour en cours !
                    valeurAbs: absorptionValeur,
                    isRanged: isRanged,
                    rangeMax: rangeMax,
                    isHeal: true, // ✅ IMPORTANT : Permet de cibler un allié ou soi-même
                    cibles: []
                });
            }
        });
    }

    // Bond : résolu à part (choix de la case, animation). On respecte l'ordre de la carte :
    // si le Bond est avant le premier autre effet (ou qu'il n'y a rien d'autre), il se joue
    // maintenant ; s'il est après une attaque/altération, on le reporte après leur résolution
    // (voir declencherResolutionAvecBondEventuel plus bas). Dans tous les cas la carte reste
    // consommée, saut annulé ou pas.
    const idLanceurBond = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage;
    const bondEnPremier = isBond && (indexPremierAutreEffet === -1 || indexBond < indexPremierAutreEffet);
    const bondApresLeReste = isBond && !bondEnPremier;

    if (bondEnPremier) {
        await window.resoudreBondInteractif(idLanceurBond, porteeBond);
    }

    if (attaquesExtraites.length === 0 && alterationsExtraites.length === 0) {
        window.validerCarteCombat(idCarte, document.getElementById("btn-appliquer-carte"));
        return;
    }

    const configSort = attaquesExtraites[0] || alterationsExtraites[0];

    if (isZone && configSort && configSort.isRanged) {
        let sumQ = 0, sumR = 0;
        zoneHexesBase.forEach(h => { sumQ += h.q; sumR += h.r; });
        let avgQ = sumQ / zoneHexesBase.length;
        let avgR = sumR / zoneHexesBase.length;
        
        let s = -avgQ - avgR;
        let rq = Math.round(avgQ), rr = Math.round(avgR), rs = Math.round(s);
        let qDiff = Math.abs(rq - avgQ), rDiff = Math.abs(rr - avgR), sDiff = Math.abs(rs - s);
        if (qDiff > rDiff && qDiff > sDiff) rq = -rr - rs;
        else if (rDiff > sDiff) rr = -rq - rs;
        
        zoneHexesBase = zoneHexesBase.map(h => ({ q: h.q - rq, r: h.r - rr }));
    }

    const tkLanceur = window.TOKENS_VTT_DATA[window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage];

    window.ETAT_CIBLAGE = {
        actif: true,
        idCarte: idCarte,
        attaques: attaquesExtraites,
        alterations: alterationsExtraites,
        cibleUnique: null,
        isZone: isZone,
        zoneHexesBase: zoneHexesBase,
        zoneCenterHex: isZone && configSort && !configSort.isRanged ? {q: tkLanceur.q, r: tkLanceur.r} : null,
        zoneRotationStep: 0,
        initialTwistAngle: 0,
        initialZoneStep: 0,
        bondApresAttaque: bondApresLeReste ? { idLanceur: idLanceurBond, portee: porteeBond } : null
    };

    if (configSort) window.surlignerEffetCarteActif(configSort.nom);

    const btnAppliquer = document.getElementById("btn-appliquer-carte");
    if (btnAppliquer) btnAppliquer.style.display = "none";

    if (isZone) {
        const estPC = window.matchMedia("(hover: hover)").matches;

        let bulleZone = document.getElementById("bulle-validation-zone");
        if (!bulleZone) {
            bulleZone = document.createElement("div");
            bulleZone.id = "bulle-validation-zone";
            bulleZone.style.cssText = "position: fixed; top: 100px; left: 50%; transform: translateX(-50%); z-index: 10000; background: linear-gradient(180deg, #2a1a0f, #1a0f08); border: 2px solid #c2a878; border-radius: 30px; padding: 10px 25px; display: flex; align-items: center; gap: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.9);";
            bulleZone.innerHTML = `
                <div style="color: white; font-family: 'Cinzel', serif; font-size: 18px; font-weight: bold; text-shadow: 1px 1px 3px black;">Valider la Zone</div>
                <div style="display:flex; gap: 15px;">
                    <div id="btn-valider-zone-ok" style="width: 35px; height: 35px; background: #1b6e3a; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: white; font-weight: bold; font-size: 18px; border: 2px solid white; box-shadow: 0 0 10px #1b6e3a; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">✔️</div>
                    <div id="btn-valider-zone-ko" style="width: 35px; height: 35px; background: #d32f2f; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; color: white; font-weight: bold; font-size: 18px; border: 2px solid white; box-shadow: 0 0 10px #d32f2f; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">✖</div>
                </div>
            `;
            document.body.appendChild(bulleZone);
        }
        bulleZone.style.display = estPC ? "none" : "flex";
        
        document.getElementById("btn-valider-zone-ok").onclick = () => window.validerZoneAoE();
        document.getElementById("btn-valider-zone-ko").onclick = () => window.nettoyerCiblage();

        let msgZone = document.getElementById("msg-zone-ciblage");
        if (!msgZone) {
            msgZone = document.createElement("div");
            msgZone.id = "msg-zone-ciblage";
            msgZone.style.cssText = "position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 1000; font-family: 'Cinzel', serif; font-size: 18px; color: #ff4c4c; font-weight: bold; text-shadow: 1px 1px 3px black, 0 0 10px #ffaa00; background: rgba(0,0,0,0.8); padding: 10px 20px; border-radius: 12px; pointer-events: none;";
            document.getElementById("conteneur-plateau-vtt").appendChild(msgZone);
        }
        if (estPC) {
            msgZone.innerText = (configSort && configSort.isRanged)
                ? "Déplacez la souris pour viser. Molette pour pivoter. Clic pour valider."
                : "Molette pour pivoter la zone. Clic n'importe où pour valider.";
        } else {
            msgZone.innerText = (configSort && configSort.isRanged)
                ? "Placez la zone (1 doigt). Pivotez la zone (2 doigts)."
                : "Faites pivoter la zone (Rotation à 2 doigts).";
        }

        window.addEventListener("mousemove", window.VTT_CIBLAGE_MOUSEMOVE, {capture: true});
        window.addEventListener("wheel", window.VTT_CIBLAGE_WHEEL, {passive: false, capture: true});
        window.addEventListener("click", window.VTT_CIBLAGE_CLICK, {capture: true});
        window.addEventListener("touchstart", window.VTT_CIBLAGE_TOUCHSTART, {capture: true, passive: false});
        window.addEventListener("touchmove", window.VTT_CIBLAGE_TOUCHMOVE, {capture: true, passive: false});
        
    } else {
        let btnResoudre = document.getElementById("btn-resoudre-carte");
        if (!btnResoudre) {
            btnResoudre = document.createElement("div");
            btnResoudre.id = "btn-resoudre-carte";
            btnResoudre.style.cssText = "position: absolute; bottom: -30px; left: 50%; transform: translateX(-50%); z-index: 5; font-family: 'Cinzel', serif; font-size: 16px; font-weight: bold; cursor: pointer; letter-spacing: 2px; text-transform: uppercase; text-shadow: 1px 1px 2px black, 0 0 10px #00ffff; color: #00ffff; transition: transform 0.2s;";
            btnResoudre.onmouseover = () => btnResoudre.style.transform = "translateX(-50%) scale(1.1)";
            btnResoudre.onmouseout = () => btnResoudre.style.transform = "translateX(-50%) scale(1)";
            document.getElementById("apercu-carte-hd-competence").appendChild(btnResoudre);
        }
        btnResoudre.innerText = "RÉSOUDRE";
        btnResoudre.style.pointerEvents = "auto";
        btnResoudre.onclick = () => window.declencherResolutionAvecBondEventuel();
    }
    window.actualiserVisuelCiblage();
};

window.validerZoneAoE = function() {
    const state = window.ETAT_CIBLAGE;
    if (!state || !state.actif || !state.isZone) return;
    if (!state.zoneCenterHex) return alert("Zone invalide (hors de portée ou obstruée).");
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    const finalHexes = state.zoneHexesBase.map(h => {
        const rot = rotateHex(h, state.zoneRotationStep);
        return { q: state.zoneCenterHex.q + rot.q, r: state.zoneCenterHex.r + rot.r };
    });

    let ciblesTouchees = [];
    const idLanceur = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage;
    const configSort = state.attaques[0] || state.alterations[0];
    const lanceurData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idLanceur);

    for (let idToken in window.TOKENS_VTT_DATA) {
        const cibleData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idToken);
        if (!cibleData || cibleData.statut === "Mort") continue;

        if (configSort && configSort.isHeal) {
            if (cibleData.camp !== lanceurData.camp) continue;
        } else if (idToken === idLanceur) {
            continue;
        }

        const tk = window.TOKENS_VTT_DATA[idToken];
        if (finalHexes.some(h => h.q === tk.q && h.r === tk.r)) ciblesTouchees.push(idToken);
    }

    state.attaques.forEach(a => a.cibles = ciblesTouchees);
    state.alterations.forEach(alt => alt.cibles = ciblesTouchees);
    window.declencherResolutionAvecBondEventuel();
};

window.actualiserVisuelCiblage = function() {
    if (!window.ETAT_CIBLAGE || !window.ETAT_CIBLAGE.actif) return;
    if (window.ETAT_CIBLAGE.isZone) window.dessinerZoneAoE();
    else window.dessinerAnneauxCiblage();
};

window.dessinerZoneAoE = function() {
    let svg = document.getElementById("svg-zone-ciblage");
    if (!svg) {
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = "svg-zone-ciblage";
        svg.style.position = "absolute";
        svg.style.top = "0";
        svg.style.left = "0";
        svg.style.width = "100%";
        svg.style.height = "100%";
        svg.style.zIndex = "4"; 
        svg.style.pointerEvents = "none";
        svg.style.overflow = "visible";
        document.getElementById("transform-plateau").appendChild(svg);
    }
    svg.innerHTML = ""; 
    
    const state = window.ETAT_CIBLAGE;
    if (!state.zoneCenterHex) return;
    const hexRadius = window.PLATEAU_VTT.hexSize;

    const configSort = state.attaques[0] || state.alterations[0];
    const estSoin = configSort && configSort.isHeal;
    const couleurRemplissage = estSoin ? "rgba(27, 110, 58, 0.35)" : "rgba(255, 76, 76, 0.35)";
    const couleurBordure = estSoin ? "#1b6e3a" : "#ff4c4c";

    const finalHexes = state.zoneHexesBase.map(h => {
        const rot = rotateHex(h, state.zoneRotationStep);
        return { q: state.zoneCenterHex.q + rot.q, r: state.zoneCenterHex.r + rot.r };
    });

    finalHexes.forEach(h => {
        const px = window.PLATEAU_VTT.hexToPixel(h.q, h.r);
        const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        let points = "";
        for(let i=0; i<6; i++) {
            let angle_rad = Math.PI / 180 * (60 * i);
            points += `${px.x + hexRadius * Math.cos(angle_rad)},${px.y + hexRadius * Math.sin(angle_rad)} `;
        }
        polygon.setAttribute("points", points.trim());
        polygon.setAttribute("fill", couleurRemplissage);
        polygon.setAttribute("stroke", couleurRemplissage);
        polygon.setAttribute("stroke-width", "1");
        svg.appendChild(polygon);
    });

    const dirs = [ {q: 1, r: 0}, {q: 0, r: 1}, {q: -1, r: 1}, {q: -1, r: 0}, {q: 0, r: -1}, {q: 1, r: -1} ];

    finalHexes.forEach(h => {
        const px = window.PLATEAU_VTT.hexToPixel(h.q, h.r);
        const corners = [];
        for(let i=0; i<6; i++) {
            let angle_rad = Math.PI / 180 * (60 * i);
            corners.push({ x: px.x + hexRadius * Math.cos(angle_rad), y: px.y + hexRadius * Math.sin(angle_rad) });
        }

        for(let i=0; i<6; i++) {
            const nQ = h.q + dirs[i].q;
            const nR = h.r + dirs[i].r;
            if (!finalHexes.some(fh => fh.q === nQ && fh.r === nR)) {
                const c1 = corners[i];
                const c2 = corners[(i + 1) % 6];
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("x1", c1.x); line.setAttribute("y1", c1.y);
                line.setAttribute("x2", c2.x); line.setAttribute("y2", c2.y);
                line.setAttribute("stroke", couleurBordure);
                line.setAttribute("stroke-width", "3");
                line.setAttribute("stroke-linecap", "round");
                svg.appendChild(line);
            }
        }
    });
};

// Fait clignoter en doré, sur l'aperçu HD de la carte, la ligne de l'effet en cours de
// résolution (ex. "Bond" pendant le choix de la case, ou l'attaque pendant son ciblage).
// Passe null pour tout éteindre.
window.surlignerEffetCarteActif = function(nomEffet) {
    const conteneur = document.getElementById("apercu-carte-hd-competence");
    if (!conteneur) return;
    const lignes = conteneur.querySelectorAll('[id^="effet-hd-ligne-"]');
    lignes.forEach(el => el.classList.remove("effet-hd-actif"));
    if (!nomEffet) return;
    const cible = Array.from(lignes).find(el => el.textContent.toLowerCase().includes(nomEffet.toLowerCase()));
    if (cible) cible.classList.add("effet-hd-actif");
};

window.dessinerAnneauxCiblage = function() {
    if (!window.ETAT_CIBLAGE || !window.ETAT_CIBLAGE.actif) {
        document.querySelectorAll(".anneau-ciblage, .bulle-validation-cible").forEach(el => el.remove());
        return;
    }

    const configSort = window.ETAT_CIBLAGE.attaques[0] || window.ETAT_CIBLAGE.alterations[0]; 
    if (!configSort) return;

    const idLanceur = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage;
    const tkLanceur = window.TOKENS_VTT_DATA[idLanceur];
    const lanceurData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idLanceur);
    
    if (!tkLanceur || !lanceurData) return;

    let estEngage = false;
    for (let idToken in window.TOKENS_VTT_DATA) {
        if (idToken === idLanceur) continue; 
        const cibleData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idToken);
        if (cibleData && cibleData.camp !== lanceurData.camp && cibleData.statut !== "Mort") {
            if (getHexDistance(tkLanceur, window.TOKENS_VTT_DATA[idToken]) === 1) {
                estEngage = true; break;
            }
        }
    }

    const couleurAnneau = configSort.isHeal ? '#1b6e3a' : '#ff4c4c';

    const ciblesValides = new Set();
    for (let idToken in window.TOKENS_VTT_DATA) {
        const cibleData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idToken);
        if (!cibleData || cibleData.statut === "Mort") continue;

        if (configSort.isHeal) {
            if (cibleData.camp !== lanceurData.camp) continue;
        } else {
            if (idToken === idLanceur) continue;
            if (cibleData.camp === lanceurData.camp) continue;
        }

        const tk = window.TOKENS_VTT_DATA[idToken];
        const dist = getHexDistance(tkLanceur, tk);

        if (dist > configSort.rangeMax) continue;
        if (!configSort.isHeal && estEngage && dist > 1) continue;
        if (!verifierLigneDeVue(tkLanceur, tk)) continue;

        ciblesValides.add(idToken);
        
        const estSelectionne = window.ETAT_CIBLAGE.cibleUnique === idToken;
        const divToken = document.getElementById("token-" + idToken);
        
        if (divToken) {
            let anneau = divToken.querySelector(".anneau-ciblage");
            if (!anneau) {
                anneau = document.createElement("div");
                anneau.className = "anneau-ciblage";
                anneau.style.position = "absolute";
                anneau.style.top = "50%";
                anneau.style.left = "50%";
                anneau.style.width = "110%";
                anneau.style.height = "110%";
                anneau.style.transform = "translate(-50%, -50%)";
                anneau.style.borderRadius = "50%";
                anneau.style.pointerEvents = "none";
                anneau.style.zIndex = "-1";
                anneau.style.transition = "width 0.3s ease, height 0.3s ease, border 0.3s ease";
                divToken.appendChild(anneau);
                void anneau.offsetWidth; 
            }

            let malusLabel = anneau.querySelector(".malus-cac");
            if (configSort.isRanged && dist === 1 && window.ETAT_CIBLAGE.attaques.length > 0 && !configSort.isHeal) {
                if (!malusLabel) {
                    malusLabel = document.createElement("div");
                    malusLabel.className = "malus-cac";
                    malusLabel.innerText = "-30% Dégâts";
                    malusLabel.style.position = "absolute";
                    malusLabel.style.top = "-20px";
                    malusLabel.style.left = "50%";
                    malusLabel.style.transform = "translateX(-50%)";
                    malusLabel.style.color = "#ff4c4c";
                    malusLabel.style.fontWeight = "bold";
                    malusLabel.style.fontSize = "14px";
                    malusLabel.style.textShadow = "1px 1px 2px black";
                    malusLabel.style.whiteSpace = "nowrap";
                    anneau.appendChild(malusLabel);
                }
            } else if (malusLabel) {
                malusLabel.remove();
            }

            if (estSelectionne) {
                anneau.style.width = "85%";
                anneau.style.height = "85%";
                anneau.style.border = `4px solid ${couleurAnneau}`;
                anneau.style.animation = "none"; 
                
                let bulle = divToken.querySelector(".bulle-validation-cible");
                if (!bulle) {
                    bulle = document.createElement("div");
                    bulle.className = "bulle-validation-cible";
                    bulle.style.position = "absolute";
                    bulle.style.bottom = "-25px"; 
                    bulle.style.left = "50%";
                    bulle.style.transform = "translateX(-50%)";
                    bulle.style.width = "28px";
                    bulle.style.height = "28px";
                    bulle.style.backgroundColor = "#1b6e3a";
                    bulle.style.borderRadius = "50%";
                    bulle.style.border = "2px solid #e8d5a5";
                    bulle.style.boxShadow = "0 0 10px #1b6e3a, 0 4px 6px rgba(0,0,0,0.5)";
                    bulle.style.display = "flex";
                    bulle.style.justifyContent = "center";
                    bulle.style.alignItems = "center";
                    bulle.style.cursor = "pointer";
                    bulle.style.zIndex = "100";
                    bulle.style.color = "white";
                    bulle.style.fontWeight = "bold";
                    bulle.style.fontSize = "16px";
                    bulle.innerHTML = "✔"; 
                    bulle.style.animation = "popBulle 0.3s ease-out forwards";
                    
                    bulle.onclick = function(e) {
                        e.stopPropagation();
                        window.declencherResolutionAvecBondEventuel();
                    };
                    divToken.appendChild(bulle);
                }
            } else {
                anneau.style.width = "110%";
                anneau.style.height = "110%";
                anneau.style.border = `3px dashed ${couleurAnneau}`;
                anneau.style.animation = "pulsationCible 1.2s infinite alternate ease-in-out";
                const bulle = divToken.querySelector(".bulle-validation-cible");
                if (bulle) bulle.remove();
            }
        }
    }
    
    document.querySelectorAll(".anneau-ciblage, .bulle-validation-cible").forEach(el => {
        const tokenId = el.parentElement.id.replace("token-", "");
        if (!ciblesValides.has(tokenId)) el.remove();
    });
};

window.ajouterCibleCiblage = function(idCible) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    const state = window.ETAT_CIBLAGE;
    const configSort = state.attaques[0] || state.alterations[0];
    
    const idLanceur = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage;
    const tkLanceur = window.TOKENS_VTT_DATA[idLanceur];
    const tkCible = window.TOKENS_VTT_DATA[idCible];

    const lanceurData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idLanceur);
    const cibleData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idCible);

    if (!tkLanceur || !tkCible || !lanceurData || !cibleData) return;

    if (cibleData.statut === "Mort") {
        window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Cible invalide", "#aaaaaa");
        return;
    }

    if (configSort.isHeal) {
        if (cibleData.camp !== lanceurData.camp) {
            window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Cible invalide", "#aaaaaa");
            return;
        }
    } else {
        if (idCible === idLanceur || cibleData.camp === lanceurData.camp) {
            window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Cible invalide", "#aaaaaa");
            return;
        }
    }
    
    const dist = getHexDistance(tkLanceur, tkCible);

    if (dist > configSort.rangeMax) {
        window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Hors de portée", "#aaaaaa");
        return;
    }

    let estEngage = false;
    for (let idToken in window.TOKENS_VTT_DATA) {
        if (idToken === idLanceur) continue; 
        const d = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idToken);
        if (d && d.camp !== lanceurData.camp && d.statut !== "Mort") {
            if (getHexDistance(tkLanceur, window.TOKENS_VTT_DATA[idToken]) === 1) {
                estEngage = true; break;
            }
        }
    }

    if (!configSort.isHeal && estEngage && dist > 1) {
        window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Engagé au CAC !", "#aaaaaa");
        return;
    }

    if (!verifierLigneDeVue(tkLanceur, tkCible)) {
        window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Vue obstruée", "#aaaaaa");
        return;
    }

    if (state.cibleUnique === idCible) {
        state.cibleUnique = null; 
        state.attaques.forEach(a => a.cibles = []);
        state.alterations.forEach(alt => alt.cibles = []);
    } else {
        state.cibleUnique = idCible; 
        state.attaques.forEach(a => a.cibles = [idCible]);
        state.alterations.forEach(alt => alt.cibles = [idCible]);
    }
    window.dessinerAnneauxCiblage();
};

window.nettoyerCiblage = function() {
    window.ETAT_CIBLAGE.actif = false;
    window.surlignerEffetCarteActif(null);
    document.querySelectorAll(".anneau-ciblage, .bulle-validation-cible").forEach(el => el.remove());
    
    const svgZone = document.getElementById("svg-zone-ciblage");
    if (svgZone) svgZone.remove();
    const msgZone = document.getElementById("msg-zone-ciblage");
    if (msgZone) msgZone.remove();
    const bulleZone = document.getElementById("bulle-validation-zone");
    if (bulleZone) bulleZone.style.display = "none";

    window.removeEventListener("mousemove", window.VTT_CIBLAGE_MOUSEMOVE, {capture: true});
    window.removeEventListener("wheel", window.VTT_CIBLAGE_WHEEL, {capture: true});
    window.removeEventListener("click", window.VTT_CIBLAGE_CLICK, {capture: true});
    window.removeEventListener("touchstart", window.VTT_CIBLAGE_TOUCHSTART, {capture: true, passive: false});
    window.removeEventListener("touchmove", window.VTT_CIBLAGE_TOUCHMOVE, {capture: true, passive: false});

    const btnAppliquer = document.getElementById("btn-appliquer-carte");
    const btnResoudre = document.getElementById("btn-resoudre-carte");
    if (btnAppliquer) btnAppliquer.style.display = "block";
    if (btnResoudre) btnResoudre.remove();
};

window.declencherResolution = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    const state = window.ETAT_CIBLAGE;

    document.querySelectorAll(".bulle-validation-cible").forEach(el => el.style.display = "none");
    const bulleZone = document.getElementById("bulle-validation-zone");
    if (bulleZone) bulleZone.style.display = "none";

    const actionData = {
        type: "ATTAQUES",
        idLanceur: window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage,
        idCarte: state.idCarte,
        attaques: state.attaques,
        alterations: state.alterations,
        isZone: state.isZone,
        zoneCenterHex: state.zoneCenterHex,
        timestamp: new Date().getTime()
    };

    try {
        await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), {
            Action_Moteur: actionData
        });
        window.nettoyerCiblage();
    } catch (e) {
        console.error("Erreur résolution :", e);
        alert("Interférence magique, impossible de frapper.");
    }
};

// Si la carte porte un Bond placé APRÈS l'attaque/altération, on le déclenche juste après
// avoir lancé la résolution de celle-ci (le jet est déjà figé côté serveur) : l'ordre de la
// carte est respecté, et le saut interactif ne bloque jamais le lancement de l'attaque.
window.declencherResolutionAvecBondEventuel = async function() {
    const bondEnAttente = window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.bondApresAttaque;
    await window.declencherResolution();
    if (bondEnAttente) {
        await window.resoudreBondInteractif(bondEnAttente.idLanceur, bondEnAttente.portee);
    }
};

// =========================================================================
//  MOTEUR D'ANIMATION ET DÉGÂTS
// =========================================================================

window.jouerAnimationMoteur = async function(action) {
    if (action.type !== "ATTAQUES") return;

    const lanceur = action.idLanceur;
    const tkLanceur = window.TOKENS_VTT_DATA[lanceur];
    const lanceurData = window.PERSOS_PARTIE.find(p => p.idPersonnage === lanceur);
    
    // 🔻 NOUVEAU : Jet d'Échec si le Lanceur est Étourdi 🔻
    let attaqueRatee = false;
    if (lanceurData && lanceurData.Etats_Alteres && lanceurData.Etats_Alteres.some(e => e.nom === "Étourdi")) {
        let echecRoll = Math.floor(Math.random() * 100) + 1;
        if (echecRoll <= 10) {
            attaqueRatee = true;
            if (tkLanceur) window.afficherMessageFlottantHex(tkLanceur.q, tkLanceur.r, "Échec technique !", "#ffaa00");
            await new Promise(r => setTimeout(r, 1200));
        }
    }

    let ciblesToucheesValides = new Set(); // Mémoire des cibles qui n'ont pas esquivé

    if (!attaqueRatee) {
        // Les pions ne pivotent plus jamais pour se tourner vers une zone/cible : ils restent dans leur orientation initiale.

        for (let attaque of action.attaques) {
            if (attaque.cibles.length === 0) continue;

            for (let idCible of attaque.cibles) {
                const cibleData = window.PERSOS_PARTIE.find(p => p.idPersonnage === idCible);
                if (!cibleData) continue;

                const tkCible = window.TOKENS_VTT_DATA[idCible];
                let dx = 0; let dy = 0;
                const dist = getHexDistance(tkLanceur, tkCible);

                if (!action.isZone && tkLanceur && tkCible) {
                    // Le pion ne pivote plus vers sa cible : on garde seulement dx/dy pour le recul en cas d'esquive.
                    const pxLanceur = window.PLATEAU_VTT.hexToPixel(tkLanceur.q, tkLanceur.r);
                    const pxCible = window.PLATEAU_VTT.hexToPixel(tkCible.q, tkCible.r);
                    dx = pxCible.x - pxLanceur.x;
                    dy = pxCible.y - pxLanceur.y;
                } else if (action.isZone) {
                    const pxLanceur = window.PLATEAU_VTT.hexToPixel(tkLanceur.q, tkLanceur.r);
                    const pxCible = window.PLATEAU_VTT.hexToPixel(tkCible.q, tkCible.r);
                    dx = pxCible.x - pxLanceur.x;
                    dy = pxCible.y - pxLanceur.y;
                }

                let esquive = (parseInt(cibleData.Esquive) || 0) + (parseInt(cibleData.Dev_Mod_Esquive) || 0);
                let parade = (parseInt(cibleData.Parade) || 0) + (parseInt(cibleData.Dev_Mod_Parade) || 0);
                
                const jetDef = Math.floor(Math.random() * 100) + 1;
                const statDef = Math.max(esquive, parade);
                const motDef = parade > esquive ? "Paré 🛡️" : "Esquivé 💨";

                if (!attaque.isHeal && jetDef <= statDef) {
                    if (tkCible) {
                        window.afficherMessageFlottantHex(tkCible.q, tkCible.r, motDef, "#cccccc");

                        // La cible ne pivote plus pour faire face à l'attaquant lors d'une esquive/parade.
                        await new Promise(r => setTimeout(r, 150));

                        const tokenDiv = document.getElementById("token-" + idCible);
                        if (tokenDiv) {
                            const mag = Math.sqrt(dx * dx + dy * dy) || 1;
                            const reculX = (dx / mag) * 25 * window.VTT_SCALE; 
                            const reculY = (dy / mag) * 25 * window.VTT_SCALE;
                            tokenDiv.style.transition = "transform 0.15s cubic-bezier(0.25, 0.8, 0.25, 1)";
                            tokenDiv.style.transform = `translate(calc(-50% + ${reculX}px), calc(-50% + ${reculY}px))`;
                            
                            setTimeout(() => {
                                tokenDiv.style.transition = "transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)"; 
                                tokenDiv.style.transform = `translate(-50%, -50%)`;
                                setTimeout(() => { tokenDiv.style.transition = "none"; }, 250);
                            }, 150);
                        }
                    }
                    await new Promise(r => setTimeout(r, 1000));
                    continue; 
                }

                // Si on arrive ici, c'est que l'attaque a touché, OU que c'est un soin / bouclier !
                ciblesToucheesValides.add(idCible);

                let oldPv = parseInt(cibleData.PV_Actuels) || 0;
                let maxPv = (parseInt(cibleData.PV_Max) || 1) + (parseInt(cibleData.Dev_Mod_PV) || 0);
                let newPv;

                // ======================================================
                //  1. CRÉATION DU BOUCLIER MAGIQUE
                // ======================================================
                if (attaque.isShield) {
                    if (oldPv < 30) {
                        if (tkCible) window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Échec (PV < 30)", "#ffaa00");
                        await new Promise(r => setTimeout(r, 1200));
                    } else {
                        let shieldValue = Math.floor(oldPv * attaque.valeurBrute / 100);
                        if (shieldValue > 20) shieldValue = 20;

                        cibleData.Bouclier_Max = shieldValue;
                        cibleData.Bouclier_Actuel = shieldValue;

                        if (tkCible) {
                            window.afficherMessageFlottantHex(tkCible.q, tkCible.r, `+${shieldValue} 🛡️`, "#00ffff");
                        }

                        // Force le rafraîchissement immédiat du VTT pour afficher le halo bleu
                        if (typeof window.appliquerTokensVTT === "function") window.appliquerTokensVTT(window.TOKENS_VTT_DATA);

                        const currentUserId = localStorage.getItem("ID_JOUEUR_COURANT");
                        if (lanceurData && lanceurData.idJoueur === currentUserId) {
                            updateDoc(doc(db, "Personnages", idCible), {
                                Bouclier_Max: shieldValue,
                                Bouclier_Actuel: shieldValue
                            }).catch(e => console.error(e));
                        }
                        await new Promise(r => setTimeout(r, 1200));
                    }
                } 
                // ======================================================
                //  2. SOINS ET PURIFICATION
                // ======================================================
                else if (attaque.isHeal) {
                    newPv = oldPv;

                    if (attaque.valeurBrute > 0) {
                        let soinBrut = attaque.valeurBrute;
                        if (cibleData.race === "Ethéré") soinBrut = Math.floor(soinBrut * 1.3);
                        cibleData.PV_Actuels = Math.min(maxPv, oldPv + soinBrut);
                        newPv = cibleData.PV_Actuels;
                        const soinsEffectifs = newPv - oldPv;

                        if (tkCible && soinsEffectifs > 0) {
                            window.afficherMessageFlottantHex(tkCible.q, tkCible.r, `+${soinsEffectifs} ✚`, "#1b6e3a");
                            const tokenDiv = document.getElementById("token-" + idCible);
                            if (tokenDiv) {
                                tokenDiv.style.transition = "filter 0.1s";
                                tokenDiv.style.filter = "sepia(1) hue-rotate(90deg) saturate(5) brightness(1.2)";
                                
                                const oldPct = Math.max(0, Math.min(100, (oldPv / maxPv) * 100));
                                const newPct = Math.max(0, Math.min(100, (newPv / maxPv) * 100));
                                
                                const jaugeContainer = document.createElement("div");
                                jaugeContainer.style.position = "absolute";
                                jaugeContainer.style.bottom = "-12px"; 
                                jaugeContainer.style.left = "50%";
                                jaugeContainer.style.transform = "translateX(-50%)";
                                jaugeContainer.style.width = "75%";
                                jaugeContainer.style.height = "6px";
                                jaugeContainer.style.backgroundColor = "#111";
                                jaugeContainer.style.border = "1px solid #c2a878";
                                jaugeContainer.style.borderRadius = "3px";
                                jaugeContainer.style.zIndex = "5";
                                jaugeContainer.style.opacity = "0"; 
                                jaugeContainer.style.transition = "opacity 0.3s ease";
                                jaugeContainer.style.boxShadow = "0 2px 4px rgba(0,0,0,0.8)";
                                
                                const jaugeFill = document.createElement("div");
                                jaugeFill.style.height = "100%";
                                jaugeFill.style.width = oldPct + "%";
                                jaugeFill.style.backgroundColor = "#1b6e3a"; 
                                jaugeFill.style.borderRadius = "2px";
                                jaugeFill.style.transition = "width 0.5s ease-out";
                                
                                jaugeContainer.appendChild(jaugeFill);
                                tokenDiv.appendChild(jaugeContainer);
                                
                                void jaugeContainer.offsetWidth;
                                jaugeContainer.style.opacity = "1";
                                
                                setTimeout(() => { tokenDiv.style.filter = ""; }, 300);
                                setTimeout(() => { jaugeFill.style.width = newPct + "%"; }, 400);
                                setTimeout(() => {
                                    jaugeContainer.style.opacity = "0";
                                    setTimeout(() => jaugeContainer.remove(), 300);
                                }, 1500); 
                            }
                        }
                    }

                    if (attaque.purifChance > 0) {
                        const rollPurif = Math.floor(Math.random() * 100) + 1;
                        if (rollPurif <= attaque.purifChance) {
                            cibleData.Etats_Alteres = [];
                            let delaiAffichage = attaque.valeurBrute > 0 ? 800 : 0;

                            setTimeout(() => {
                                if (tkCible) window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Purifié ✨", "#ffffff");
                            }, delaiAffichage);

                            const currentUserId = localStorage.getItem("ID_JOUEUR_COURANT");
                            if (lanceurData && lanceurData.idJoueur === currentUserId) {
                                updateDoc(doc(db, "Personnages", idCible), { Etats_Alteres: [] }).catch(e => console.error(e));
                            }
                            if (window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO]?.idPersonnage === idCible) {
                                if (typeof window.afficherPersoCombatActuel === "function") window.afficherPersoCombatActuel();
                            }
                        }
                    }

                    const currentUserId = localStorage.getItem("ID_JOUEUR_COURANT");
                    if (lanceurData && lanceurData.idJoueur === currentUserId) {
                        const refPerso = doc(db, "Personnages", idCible);
                        updateDoc(refPerso, { PV_Actuels: cibleData.PV_Actuels }).catch(e => console.error(e));
                    }
                    if (window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO]?.idPersonnage === idCible) {
                        window.COMBAT_PV_ACTUELS = cibleData.PV_Actuels;
                        if (typeof window.mettreAJourJaugePV === "function") window.mettreAJourJaugePV();
                    }
                    await new Promise(r => setTimeout(r, 1200));
                } 
                // ======================================================
                //  3. DÉGÂTS NORMAUX (Vérifie le bouclier d'abord)
                // ======================================================
                else {
                    const defPhys = (parseInt(cibleData.Def_Physique) || 0) + (parseInt(cibleData.Dev_Mod_DefPhys) || 0);
                    const defMag = (parseInt(cibleData.Def_Magique) || 0) + (parseInt(cibleData.Dev_Mod_DefMag) || 0);
                    let degats = attaque.valeurBrute;
                    if (attaque.isRanged && dist === 1) degats = Math.floor(degats * 0.7); 

                    // 🔻 NOUVEAU : ABSORPTION RÉACTIVE 🔻
                    const etatAbsorption = (cibleData.Etats_Alteres || []).find(e => e.nom === "Absorption");
                    if (etatAbsorption) {
                        const pctAnnule = etatAbsorption.valeurAbs || 20;
                        const degatsAAnnuler = Math.floor(degats * (pctAnnule / 100));
                        const soinAbsorption = Math.floor(degats * 0.10); // Toujours 10% du brut

                        degats -= degatsAAnnuler;
                        if (degats < 0) degats = 0;

                        if (soinAbsorption > 0) {
                            let maxPv = (parseInt(cibleData.PV_Max) || 1) + (parseInt(cibleData.Dev_Mod_PV) || 0);
                            let tempPv = Math.min(maxPv, oldPv + soinAbsorption);
                            
                            cibleData.PV_Actuels = tempPv;
                            oldPv = tempPv; // Mise à jour pour que le reste des dégâts tape sur cette nouvelle valeur !

                            if (tkCible) {
                                // Petit flash violet pour le drain de vie
                                window.afficherMessageFlottantHex(tkCible.q, tkCible.r, `+${soinAbsorption} 🩸 (Drain)`, "#9b59b6");
                                // ⏱️ On attend 600ms pour laisser ce texte monter avant d'afficher les dégâts rouges
                                await new Promise(r => setTimeout(r, 600));
                            }
                        }
                    }

                    // Suite classique du calcul d'armure...
                    let resistance = attaque.typeRes === "Magique" ? defMag : defPhys;
                    let reduction = resistance / 100;
                    if (reduction > 1) reduction = 1; 
                    let degatsFinaux = Math.round(degats * (1 - reduction));
                    if (degatsFinaux < 0) degatsFinaux = 0;

                    let oldShield = parseInt(cibleData.Bouclier_Actuel) || 0;
                    let maxShield = parseInt(cibleData.Bouclier_Max) || oldShield || 1;
                    let shieldDestroyed = false;

                    // Si la cible a un bouclier actif, c'est lui qui absorbe !
                    if (oldShield > 0) {
                        let shieldNew = oldShield - degatsFinaux;
                        if (shieldNew <= 0) shieldNew = 0; // L'overkill part dans le vide !

                        cibleData.Bouclier_Actuel = shieldNew;
                        newPv = oldPv;
                        shieldDestroyed = shieldNew === 0;

                        if (tkCible) {
                            window.afficherMessageFlottantHex(tkCible.q, tkCible.r, `-${degatsFinaux} 🛡️`, "#00ffff");
                            const tokenDiv = document.getElementById("token-" + idCible);
                            if (tokenDiv) {
                                tokenDiv.style.transition = "filter 0.1s";
                                // Flash bleu clair pour le bouclier
                                tokenDiv.style.filter = "sepia(1) hue-rotate(180deg) saturate(5) brightness(1.2)";

                                const oldShieldPct = Math.max(0, Math.min(100, (oldShield / maxShield) * 100));
                                const newShieldPct = Math.max(0, Math.min(100, (shieldNew / maxShield) * 100));

                                // On dessine la barre Bleue du Bouclier
                                const jaugeContainer = document.createElement("div");
                                jaugeContainer.style.position = "absolute";
                                jaugeContainer.style.bottom = "-12px";
                                jaugeContainer.style.left = "50%";
                                jaugeContainer.style.transform = "translateX(-50%)";
                                jaugeContainer.style.width = "75%";
                                jaugeContainer.style.height = "6px";
                                jaugeContainer.style.backgroundColor = "#111";
                                jaugeContainer.style.border = "1px solid #00ffff";
                                jaugeContainer.style.borderRadius = "3px";
                                jaugeContainer.style.zIndex = "5";
                                jaugeContainer.style.opacity = "0";
                                jaugeContainer.style.transition = "opacity 0.3s ease";
                                jaugeContainer.style.boxShadow = "0 2px 4px rgba(0,0,0,0.8)";

                                const jaugeFill = document.createElement("div");
                                jaugeFill.style.height = "100%";
                                jaugeFill.style.width = oldShieldPct + "%";
                                jaugeFill.style.backgroundColor = "#00ffff";
                                jaugeFill.style.borderRadius = "2px";
                                jaugeFill.style.transition = "width 0.5s ease-out";

                                jaugeContainer.appendChild(jaugeFill);
                                tokenDiv.appendChild(jaugeContainer);

                                void jaugeContainer.offsetWidth;
                                jaugeContainer.style.opacity = "1";

                                setTimeout(() => { tokenDiv.style.filter = ""; }, 300);
                                setTimeout(() => { jaugeFill.style.width = newShieldPct + "%"; }, 400);
                                setTimeout(() => {
                                    jaugeContainer.style.opacity = "0";
                                    setTimeout(() => {
                                        jaugeContainer.remove();
                                        // Si le bouclier est détruit, on efface le halo !
                                        if (shieldDestroyed && typeof window.appliquerTokensVTT === "function") {
                                            window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
                                        }
                                    }, 300);
                                }, 1500);
                            }
                        }
                    } else {
                        // Pas de bouclier : Dégâts rouges normaux sur les PV
                        cibleData.PV_Actuels = oldPv - degatsFinaux;
                        if(cibleData.PV_Actuels < 0) cibleData.PV_Actuels = 0;
                        newPv = cibleData.PV_Actuels;

                        if (tkCible) {
                            window.afficherMessageFlottantHex(tkCible.q, tkCible.r, `-${degatsFinaux} 🩸`, "#ff4c4c");
                            const tokenDiv = document.getElementById("token-" + idCible);
                            if (tokenDiv) {
                                tokenDiv.style.transition = "filter 0.1s";
                                tokenDiv.style.filter = "sepia(1) hue-rotate(-50deg) saturate(5) brightness(1.2)";
                                
                                const oldPct = Math.max(0, Math.min(100, (oldPv / maxPv) * 100));
                                const newPct = Math.max(0, Math.min(100, (newPv / maxPv) * 100));
                                
                                const jaugeContainer = document.createElement("div");
                                jaugeContainer.style.position = "absolute";
                                jaugeContainer.style.bottom = "-12px"; 
                                jaugeContainer.style.left = "50%";
                                jaugeContainer.style.transform = "translateX(-50%)";
                                jaugeContainer.style.width = "75%";
                                jaugeContainer.style.height = "6px";
                                jaugeContainer.style.backgroundColor = "#111";
                                jaugeContainer.style.border = "1px solid #c2a878";
                                jaugeContainer.style.borderRadius = "3px";
                                jaugeContainer.style.zIndex = "5";
                                jaugeContainer.style.opacity = "0"; 
                                jaugeContainer.style.transition = "opacity 0.3s ease";
                                jaugeContainer.style.boxShadow = "0 2px 4px rgba(0,0,0,0.8)";
                                
                                const jaugeFill = document.createElement("div");
                                jaugeFill.style.height = "100%";
                                jaugeFill.style.width = oldPct + "%";
                                jaugeFill.style.backgroundColor = "#ff4c4c"; 
                                jaugeFill.style.borderRadius = "2px";
                                jaugeFill.style.transition = "width 0.5s ease-out";
                                
                                jaugeContainer.appendChild(jaugeFill);
                                tokenDiv.appendChild(jaugeContainer);
                                
                                void jaugeContainer.offsetWidth;
                                jaugeContainer.style.opacity = "1";
                                
                                setTimeout(() => { tokenDiv.style.filter = ""; }, 300);
                                setTimeout(() => { jaugeFill.style.width = newPct + "%"; }, 400);
                                setTimeout(() => {
                                    jaugeContainer.style.opacity = "0";
                                    setTimeout(() => jaugeContainer.remove(), 300);
                                }, 1500); 
                            }
                        }
                    }

                    const currentUserId = localStorage.getItem("ID_JOUEUR_COURANT");
                    if (lanceurData && lanceurData.idJoueur === currentUserId) {
                        const refPerso = doc(db, "Personnages", idCible);
                        const updatePayload = { PV_Actuels: cibleData.PV_Actuels };
                        if (oldShield > 0) {
                            updatePayload.Bouclier_Actuel = cibleData.Bouclier_Actuel;
                            if (shieldDestroyed) updatePayload.Bouclier_Max = cibleData.Bouclier_Max;
                        }
                        updateDoc(refPerso, updatePayload).catch(e => console.error(e));
                    }
                    if (window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO]?.idPersonnage === idCible) {
                        window.COMBAT_PV_ACTUELS = cibleData.PV_Actuels;
                        if (typeof window.mettreAJourJaugePV === "function") window.mettreAJourJaugePV();
                    }
                    await new Promise(r => setTimeout(r, 1200));
                }
            }
        }
    }

    // 🔻 NOUVEAU BLOC : Application des États Altérés sur les cibles 🔻
    if (action.alterations && action.alterations.length > 0 && !attaqueRatee) {
        let ciblesPourAlterations = new Set();
        
        if (action.attaques && action.attaques.length > 0) {
            // Si le sort a fait des dégâts, on ne met l'état qu'à ceux qui n'ont PAS esquivé
            ciblesToucheesValides.forEach(c => ciblesPourAlterations.add(c));
        } else {
            // Si c'est un sort pur (que du débuff, 0 dégât), on cible tout le monde
            action.alterations.forEach(alt => alt.cibles.forEach(c => ciblesPourAlterations.add(c)));
        }

        for (let idCible of ciblesPourAlterations) {
            const cData = window.PERSOS_PARTIE.find(p => p.idPersonnage === idCible);
            if (!cData || cData.PV_Actuels <= 0) continue;
            
            // Si c'est un sort pur (sans dégâts), il faut calculer l'esquive ICI
            if (!action.attaques || action.attaques.length === 0) {
                let esquive = (parseInt(cData.Esquive) || 0) + (parseInt(cData.Dev_Mod_Esquive) || 0);
                let parade = (parseInt(cData.Parade) || 0) + (parseInt(cData.Dev_Mod_Parade) || 0);
                const statDef = Math.max(esquive, parade);
                const jetDef = Math.floor(Math.random() * 100) + 1;
                
                if (jetDef <= statDef) {
                    const tkCible = window.TOKENS_VTT_DATA[idCible];
                    if (tkCible) window.afficherMessageFlottantHex(tkCible.q, tkCible.r, parade > esquive ? "Paré 🛡️" : "Esquivé 💨", "#cccccc");
                    await new Promise(r => setTimeout(r, 1000));
                    continue; // Il a esquivé l'altération !
                }
            }
            
            let cibleModifiee = false;
            let nouveauxEtats = cData.Etats_Alteres ? [...cData.Etats_Alteres] : [];

            for (let alt of action.alterations) {
                // Poussée : pas un état persistant. Le jet et le déplacement ne sont faits qu'une
                // seule fois, par le lanceur, puis diffusés (Action_Poussee) pour que tous les
                // joueurs voient le même résultat — les autres clients ne font rien ici.
                if (alt.estPoussee) {
                    const currentUserIdPoussee = localStorage.getItem("ID_JOUEUR_COURANT");
                    const lDataPoussee = window.PERSOS_PARTIE.find(p => p.idPersonnage === lanceur);
                    if (lDataPoussee && lDataPoussee.idJoueur === currentUserIdPoussee) {
                        const rollPoussee = Math.floor(Math.random() * 100) + 1;
                        console.log(`🎲 Jet de Poussée sur ${cData.nom} : Résultat ${rollPoussee} (Chance: ${alt.chance}%)`);
                        if (rollPoussee <= alt.chance && typeof window.declencherPousseeCible === "function") {
                            await window.declencherPousseeCible(lanceur, idCible);
                        }
                    }
                    continue;
                }

                let roll = Math.floor(Math.random() * 100) + 1;
                console.log(`🎲 Jet d'application [${alt.nom}] sur ${cData.nom} : Résultat ${roll} (Chance: ${alt.chance}%)`);

                if (roll <= alt.chance) {
                    let existing = nouveauxEtats.find(e => e.nom === alt.nom);
                    if (existing) {
                        existing.duree = Math.max(existing.duree, alt.duree); // Rafraîchit la durée
                    } else {
                        nouveauxEtats.push({...alt});
                    }
                    cibleModifiee = true;
                    
                    const tkC = window.TOKENS_VTT_DATA[idCible];
                    if (tkC) {
                        // ⏱️ Pause d'une demi-seconde pour laisser les dégâts rouges disparaître
                        await new Promise(r => setTimeout(r, 600)); 
                        window.afficherMessageFlottantHex(tkC.q, tkC.r, `${alt.nom} !`, "#9333ea");
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
            }

            if (cibleModifiee) {
                cData.Etats_Alteres = nouveauxEtats; // MAJ locale immédiate
                
                const currentUserId = localStorage.getItem("ID_JOUEUR_COURANT");
                const lData = window.PERSOS_PARTIE.find(p => p.idPersonnage === lanceur);
                
                // Envoi à la BDD
                if (!lData || lData.idJoueur === currentUserId || !currentUserId) {
                    await updateDoc(doc(db, "Personnages", idCible), { Etats_Alteres: nouveauxEtats }).catch(e=>console.error(e));
                }
                
                // 🔄 RAFRAÎCHISSEMENT DE L'UI EN TEMPS RÉEL (Adapté à ta structure)
                if (window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO]?.idPersonnage === idCible) {
                    if (typeof window.afficherPersoCombatActuel === "function") window.afficherPersoCombatActuel();
                }
                
                // Force le re-dessin de TA piste d'initiative
                if (typeof window.afficherPisteInitiative === "function") {
                    window.afficherPisteInitiative();
                }
            }
        }
    }

    const currentUserId = localStorage.getItem("ID_JOUEUR_COURANT");
    if (lanceurData && lanceurData.idJoueur === currentUserId) {
        window.validerCarteCombat(action.idCarte, null);
    }
};