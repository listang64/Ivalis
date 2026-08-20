import { db } from "./firebase-config.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// =========================================================================
//  IVALIS - MOTEUR DE RÉSOLUTION DES COMBATS (CIBLAGE ET DÉGÂTS)
// =========================================================================

window.ETAT_CIBLAGE = {
    actif: false,
    idCarte: null,
    attaques: [], 
    cibleUnique: null
};

// --- OUTILS MATHÉMATIQUES (Distances et Lignes de Vue) ---

function getHexDistance(a, b) {
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

// 🔻 CORRECTION : Algorithme strict de Ligne de Vue (Bresenham pour hexagones) 🔻
function verifierLigneDeVue(hexA, hexB) {
    if (!window.PLATEAU_VTT) return true;
    let dist = getHexDistance(hexA, hexB);
    
    if (dist <= 1) return true; // Le corps-à-corps n'est jamais bloqué par la ligne de vue

    const lerp = (a, b, t) => a + (b - a) * t;
    
    const cubeRound = (q, r, s) => {
        let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
        let q_diff = Math.abs(rq - q), r_diff = Math.abs(rr - r), s_diff = Math.abs(rs - s);
        if (q_diff > r_diff && q_diff > s_diff) rq = -rr - rs;
        else if (r_diff > s_diff) rr = -rq - rs;
        return { q: rq, r: rr };
    };

    // On trace une ligne stricte de Centre à Centre.
    // L'epsilon (1e-6) est vital : il empêche le rayon de passer EXACTEMENT sur une arête 
    // parfaite entre deux hexagones, ce qui créerait des faux positifs.
    let aCube = { q: hexA.q + 1e-6, r: hexA.r + 1e-6, s: -hexA.q - hexA.r - 2e-6 };
    let bCube = { q: hexB.q + 1e-6, r: hexB.r + 1e-6, s: -hexB.q - hexB.r - 2e-6 };

    // On inspecte CHAQUE case traversée par la ligne (sauf le lanceur et la cible)
    for (let i = 1; i < dist; i++) { 
        let t = i / dist;
        let q = lerp(aCube.q, bCube.q, t);
        let r = lerp(aCube.r, bCube.r, t);
        let s = lerp(aCube.s, bCube.s, t);
        
        let pt = cubeRound(q, r, s);
        
        const state = window.PLATEAU_VTT.getCaseState(pt.q, pt.r);
        if (state && state.isBlocked) {
            return false; // 💥 Le rayon a percuté un mur noir ! Tir impossible.
        }
    }

    return true; // La voie est dégagée
}


// 1. Lancement du Ciblage quand on clique sur "Appliquer"
window.demarrerCiblage = async function(idCarte) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    if (!window.EFFETS_BDD_CACHE) {
        alert("Le grimoire du moteur n'est pas encore synchronisé.");
        return;
    }

    const dataCarte = window.COMPETENCES_CACHE[idCarte];
    if (!dataCarte) return;

    const attaquesExtraites = [];

    dataCarte.Composants.actions.forEach(act => {
        const effBase = window.EFFETS_BDD_CACHE[act.baseEffetId];
        if (!effBase) return;
        
        const nomLower = effBase.Nom.toLowerCase();
        const estUneAttaque = nomLower.includes("attaque magique") || 
                              nomLower.includes("attaque légère") || 
                              nomLower.includes("attaque legere") || 
                              nomLower.includes("attaque lourde") || 
                              nomLower.includes("mots de pouvoir") || 
                              nomLower.includes("mot de pouvoir");

        if (estUneAttaque) {
            let typeRes = (nomLower.includes("magique") || nomLower.includes("pouvoir")) ? "Magique" : "Physique";
            
            // 🔻 NOUVEAU : Détection de la Distance 🔻
            let isRanged = false;
            let rangeMax = 1; // 1 = Corps-à-Corps par défaut

            Object.keys(act.mods).forEach(modId => {
                const modEff = window.EFFETS_BDD_CACHE[modId];
                if (modEff && modEff.Nom === "Distance") {
                    isRanged = true;
                    let val = parseFloat(modEff.Valeur) || 0;
                    rangeMax = 1 + (val * act.mods[modId]); // La valeur du modificateur s'ajoute à la base (1)
                }
            });

            attaquesExtraites.push({
                nom: effBase.Nom,
                typeRes: typeRes,
                valeurBrute: (parseFloat(effBase.Valeur) || 0) * (act.count || 1),
                isRanged: isRanged,
                rangeMax: rangeMax,
                cibles: []
            });
        }
    });

    if (attaquesExtraites.length === 0) {
        window.validerCarteCombat(idCarte, document.getElementById("btn-appliquer-carte"));
        return;
    }

    window.ETAT_CIBLAGE = {
        actif: true,
        idCarte: idCarte,
        attaques: attaquesExtraites,
        cibleUnique: null
    };

    const btnAppliquer = document.getElementById("btn-appliquer-carte");
    if (btnAppliquer) btnAppliquer.style.display = "none";

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
    btnResoudre.onclick = () => window.declencherResolution();

    if (!document.getElementById("anim-ciblage-vtt")) {
        const style = document.createElement("style");
        style.id = "anim-ciblage-vtt";
        style.innerHTML = `
            @keyframes pulsationCible {
                0% { transform: translate(-50%, -50%) scale(1); opacity: 0.5; box-shadow: 0 0 5px #ff4c4c; }
                100% { transform: translate(-50%, -50%) scale(1.15); opacity: 1; box-shadow: 0 0 15px #ff4c4c; }
            }
            @keyframes popBulle {
                0% { transform: translateX(-50%) scale(0); }
                70% { transform: translateX(-50%) scale(1.2); }
                100% { transform: translateX(-50%) scale(1); }
            }
        `;
        document.head.appendChild(style);
    }

    window.dessinerAnneauxCiblage();
};

// 2. Dessine (ou met à jour) les anneaux autour des cibles valides
window.dessinerAnneauxCiblage = function() {
    if (!window.ETAT_CIBLAGE || !window.ETAT_CIBLAGE.actif) {
        document.querySelectorAll(".anneau-ciblage, .bulle-validation-cible").forEach(el => el.remove());
        return;
    }

    const attaqueCourante = window.ETAT_CIBLAGE.attaques[0]; // Comme la cible est unique, on lit la config de la première attaque
    if (!attaqueCourante) return;

    const idLanceur = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage;
    const tkLanceur = window.TOKENS_VTT_DATA[idLanceur];
    const lanceurData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idLanceur);
    
    if (!tkLanceur || !lanceurData) return;

    // 🔻 NOUVEAU : On vérifie si le lanceur est engagé au Corps-à-Corps 🔻
    let estEngage = false;
    for (let idToken in window.TOKENS_VTT_DATA) {
        if (idToken === idLanceur) continue; 
        const cibleData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idToken);
        
        if (cibleData && cibleData.camp !== lanceurData.camp && cibleData.statut !== "Mort") {
            if (getHexDistance(tkLanceur, window.TOKENS_VTT_DATA[idToken]) === 1) {
                estEngage = true;
                break;
            }
        }
    }

    const ciblesValides = new Set();

    for (let idToken in window.TOKENS_VTT_DATA) {
        if (idToken === idLanceur) continue; 

        const cibleData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idToken);
        if (!cibleData || cibleData.camp === lanceurData.camp || cibleData.statut === "Mort") continue;

        const tk = window.TOKENS_VTT_DATA[idToken];
        const dist = getHexDistance(tkLanceur, tk);

        // 🔻 LES 3 RÈGLES D'OR DU CIBLAGE 🔻
        
        // 1. Règle de Portée
        if (dist > attaqueCourante.rangeMax) continue;

        // 2. Règle d'Engagement (Bloqué au CAC)
        if (estEngage && dist > 1) continue;

        // 3. Règle de la Ligne de Vue (Murs)
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

            // 🔻 NOUVEAU : Affichage de la pénalité de Tir dans la mêlée 🔻
            let malusLabel = anneau.querySelector(".malus-cac");
            if (attaqueCourante.isRanged && dist === 1) {
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
                anneau.style.border = "4px solid #ff4c4c";
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
                        window.declencherResolution();
                    };
                    divToken.appendChild(bulle);
                }
            } else {
                anneau.style.width = "110%";
                anneau.style.height = "110%";
                anneau.style.border = "3px dashed #ff4c4c";
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

// 3. Lorsqu'on clique sur un pion pendant le ciblage
window.ajouterCibleCiblage = function(idCible) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    const state = window.ETAT_CIBLAGE;
    const attaqueCourante = state.attaques[0];
    
    const idLanceur = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage;
    const tkLanceur = window.TOKENS_VTT_DATA[idLanceur];
    const tkCible = window.TOKENS_VTT_DATA[idCible];

    const lanceurData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idLanceur);
    const cibleData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idCible);

    if (!tkLanceur || !tkCible || !lanceurData || !cibleData) return;

    if (cibleData.camp === lanceurData.camp) {
        window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Cible invalide", "#aaaaaa");
        return;
    }
    
    const dist = getHexDistance(tkLanceur, tkCible);

    // Vérification Portée
    if (dist > attaqueCourante.rangeMax) {
        window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Hors de portée", "#aaaaaa");
        return;
    }

    // Vérification Engagement
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

    if (estEngage && dist > 1) {
        window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Engagé au CAC !", "#aaaaaa");
        return;
    }

    // Vérification Ligne de Vue
    if (!verifierLigneDeVue(tkLanceur, tkCible)) {
        window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Vue obstruée", "#aaaaaa");
        return;
    }

    // Assigne ou Désélectionne la cible unique
    if (state.cibleUnique === idCible) {
        state.cibleUnique = null; 
        state.attaques.forEach(a => a.cibles = []);
    } else {
        state.cibleUnique = idCible; 
        state.attaques.forEach(a => a.cibles = [idCible]);
    }

    window.dessinerAnneauxCiblage();
};

// 4. Nettoyage si on clique dans le vide ou si on annule
window.nettoyerCiblage = function() {
    window.ETAT_CIBLAGE.actif = false;
    document.querySelectorAll(".anneau-ciblage, .bulle-validation-cible").forEach(el => el.remove());
    
    const btnAppliquer = document.getElementById("btn-appliquer-carte");
    if (btnAppliquer) btnAppliquer.style.display = "block";
};

// 5. Envoi de l'action de Dégâts à Firebase
window.declencherResolution = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    const state = window.ETAT_CIBLAGE;

    document.querySelectorAll(".bulle-validation-cible").forEach(el => el.style.display = "none");

    const actionData = {
        type: "ATTAQUES",
        idLanceur: window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage,
        idCarte: state.idCarte,
        attaques: state.attaques,
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

// =========================================================================
//  MOTEUR D'ANIMATION (Se joue chez TOUS les joueurs en même temps)
// =========================================================================

window.jouerAnimationMoteur = async function(action) {
    if (action.type !== "ATTAQUES") return;

    const lanceur = action.idLanceur;

    // On séquence les animations des attaques
    for (let attaque of action.attaques) {
        if (attaque.cibles.length === 0) continue;

        for (let idCible of attaque.cibles) {
            
            const cibleData = window.PERSOS_PARTIE.find(p => p.idPersonnage === idCible);
            if (!cibleData) continue;

            const tkLanceur = window.TOKENS_VTT_DATA[lanceur];
            const tkCible = window.TOKENS_VTT_DATA[idCible];

            let dx = 0; let dy = 0;
            const dist = getHexDistance(tkLanceur, tkCible);

            // 2. ROTATION DU LANCEUR VERS SA CIBLE
            if (tkLanceur && tkCible) {
                const pxLanceur = window.PLATEAU_VTT.hexToPixel(tkLanceur.q, tkLanceur.r);
                const pxCible = window.PLATEAU_VTT.hexToPixel(tkCible.q, tkCible.r);
                
                dx = pxCible.x - pxLanceur.x;
                dy = pxCible.y - pxLanceur.y;
                
                const targetAngle = Math.atan2(dy, dx) * (180 / Math.PI) - 90;
                let currentAngle = tkLanceur.angle || 0;
                
                let diff = (targetAngle - currentAngle) % 360;
                if (diff > 180) diff -= 360;
                if (diff < -180) diff += 360;
                const nouvelAngle = currentAngle + diff;
                
                tkLanceur.angle = nouvelAngle;
                window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
                
                const currentUserId = localStorage.getItem("ID_JOUEUR_COURANT");
                const lanceurData = window.PERSOS_PARTIE.find(p => p.idPersonnage === lanceur);
                if (lanceurData && lanceurData.idJoueur === currentUserId) {
                    updateDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
                        [`Tokens.${lanceur}.angle`]: nouvelAngle
                    }).catch(e => console.error(e));
                }
                
                await new Promise(r => setTimeout(r, 200)); 
            }

            const esquive = (parseInt(cibleData.Esquive) || 0) + (parseInt(cibleData.Dev_Mod_Esquive) || 0);
            const parade = (parseInt(cibleData.Parade) || 0) + (parseInt(cibleData.Dev_Mod_Parade) || 0);
            
            const jetDef = Math.floor(Math.random() * 100) + 1;
            const statDef = Math.max(esquive, parade);
            const motDef = parade > esquive ? "Paré 🛡️" : "Esquivé 💨";

            // 3. VÉRIFICATION DE LA DÉFENSE (Esquive / Parade)
            if (jetDef <= statDef) {
                if (tkCible) {
                    window.afficherMessageFlottantHex(tkCible.q, tkCible.r, motDef, "#cccccc");
                    
                    // ROTATION DE LA CIBLE VERS L'ATTAQUANT AVANT D'ESQUIVER
                    const targetAngleCible = Math.atan2(-dy, -dx) * (180 / Math.PI) - 90;
                    let currentAngleCible = tkCible.angle || 0;
                    
                    let diffCible = (targetAngleCible - currentAngleCible) % 360;
                    if (diffCible > 180) diffCible -= 360;
                    if (diffCible < -180) diffCible += 360;
                    const nouvelAngleCible = currentAngleCible + diffCible;
                    
                    tkCible.angle = nouvelAngleCible;
                    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
                    
                    const currentUserId = localStorage.getItem("ID_JOUEUR_COURANT");
                    const lanceurData = window.PERSOS_PARTIE.find(p => p.idPersonnage === lanceur);
                    if (lanceurData && lanceurData.idJoueur === currentUserId) {
                        updateDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
                            [`Tokens.${idCible}.angle`]: nouvelAngleCible
                        }).catch(e => console.error(e));
                    }
                    
                    await new Promise(r => setTimeout(r, 150));

                    // ANIMATION DE RECUL
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

            // 4. Calcul des Dégâts (avec la pénalité de Tir dans la Mêlée)
            const defPhys = (parseInt(cibleData.Def_Physique) || 0) + (parseInt(cibleData.Dev_Mod_DefPhys) || 0);
            const defMag = (parseInt(cibleData.Def_Magique) || 0) + (parseInt(cibleData.Dev_Mod_DefMag) || 0);

            let degats = attaque.valeurBrute;

            // 🔻 NOUVEAU : Application du Malus -30% si Tir au CAC 🔻
            if (attaque.isRanged && dist === 1) {
                degats = Math.floor(degats * 0.7); // 70% des dégâts originaux
            }

            let resistance = attaque.typeRes === "Magique" ? defMag : defPhys;
            
            let reduction = resistance / 100;
            if (reduction > 1) reduction = 1; 
            
            let degatsFinaux = Math.round(degats * (1 - reduction));
            if (degatsFinaux < 0) degatsFinaux = 0;

            let oldPv = parseInt(cibleData.PV_Actuels) || 0;
            let maxPv = (parseInt(cibleData.PV_Max) || 1) + (parseInt(cibleData.Dev_Mod_PV) || 0);

            cibleData.PV_Actuels = oldPv - degatsFinaux;
            if(cibleData.PV_Actuels < 0) cibleData.PV_Actuels = 0;
            let newPv = cibleData.PV_Actuels;

            // 5. Animations Visuelles de l'impact
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

            // 6. Mise à jour de Firebase et UI
            const currentUserId = localStorage.getItem("ID_JOUEUR_COURANT");
            const lanceurData = window.PERSOS_PARTIE.find(p => p.idPersonnage === lanceur);
            
            if (lanceurData && lanceurData.idJoueur === currentUserId) {
                const refPerso = doc(db, "Personnages", idCible);
                updateDoc(refPerso, { PV_Actuels: cibleData.PV_Actuels }).catch(e => console.error(e));
            }

            if (window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR.length > 0 && window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO]?.idPersonnage === idCible) {
                window.COMBAT_PV_ACTUELS = cibleData.PV_Actuels;
                if (typeof window.mettreAJourJaugePV === "function") window.mettreAJourJaugePV();
            }

            await new Promise(r => setTimeout(r, 1200));
        }
    }

    // 7. Fin de la Séquence globale
    const currentUserId = localStorage.getItem("ID_JOUEUR_COURANT");
    const lanceurData = window.PERSOS_PARTIE.find(p => p.idPersonnage === lanceur);
    if (lanceurData && lanceurData.idJoueur === currentUserId) {
        window.validerCarteCombat(action.idCarte, null);
    }
};