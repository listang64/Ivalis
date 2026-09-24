import { db } from "./firebase-config.js?v=2";
import { doc, updateDoc, setDoc, deleteDoc, deleteField } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// =========================================================================
//  IVALIS - MOTEUR DE RÉSOLUTION DES COMBATS (CIBLAGE ET DÉGÂTS)
// =========================================================================

// Les cartes résolues par CE poste : c'est ce qui lui permet de se reconnaître
// comme auteur en rejouant l'animation, et à l'IA de savoir quand une carte a
// vraiment fini de s'appliquer.
window.RESOLUTIONS_LOCALES = [];

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

// =========================================================================
//  QUI LANCE LA CARTE EN COURS DE CIBLAGE
// =========================================================================
//  CE N'EST PAS CELUI QU'ON REGARDE. Six endroits de ce fichier lisaient le
//  combattant AFFICHÉ DANS LE PANNEAU LATÉRAL pour savoir d'où part le sort :
//  les anneaux de ciblage, la portée, les cibles, la résolution. Or ce panneau
//  était une visionneuse — un clic sur un portrait y installait ce
//  combattant-là, créature comprise, en remplaçant COMBAT_PERSOS_JOUEUR.
//
//  Consulter la fiche d'un ennemi au milieu de son tour suffisait donc à
//  déplacer l'origine du sort sur lui : les anneaux se redessinaient depuis sa
//  case, les portées se mesuraient depuis lui, et la carte serait partie à son
//  nom. Depuis que la piste d'initiative est permanente et montre un médaillon
//  par créature, ce geste est devenu le plus naturel du monde.
//
//  Le ciblage sait qui l'a ouvert (demarrerCiblage l'inscrit dans l'état) : on
//  le lui demande. Le repli sur le panneau ne sert qu'aux appels d'avant, quand
//  aucun ciblage n'est ouvert.
window.lanceurDuCiblage = function() {
    const state = window.ETAT_CIBLAGE;
    if (state && state.idLanceur) return state.idLanceur;
    const affiche = (window.COMBAT_PERSOS_JOUEUR || [])[window.COMBAT_INDEX_PERSO];
    return (affiche && affiche.idPersonnage) || null;
};

// D'OÙ PART LE SORT. Après un Bond joué en tête de carte, le lanceur n'est
// plus sur sa case — mais son pion, lui, y est encore : le saut est une
// demande au cerveau, et le plateau ne le montre qu'une fois le cerveau revenu
// (sur iPad, bien après). Tout le ciblage se mesurait pourtant depuis ce pion :
// signalé en partie, « compétence avec bond puis une zone, la sélection de
// zone s'est faite sur mon emplacement avant le bond ». Le ciblage retient
// donc la case d'atterrissage (origineLanceur), et c'est elle qu'on lit pour
// le lanceur — portée, ligne de vue, zone collée à lui, soin sur soi.
window.positionCiblage = function(idCombattant) {
    const state = window.ETAT_CIBLAGE;
    if (state && state.origineLanceur && idCombattant && idCombattant === state.idLanceur) {
        return state.origineLanceur;
    }
    return (window.TOKENS_VTT_DATA || {})[idCombattant];
};

// UNE CARTE QUI FRAPPE ET SOUTIENT SE VISE EN DEUX TEMPS. Un soin, un bouclier
// ou une absorption posés sur la même technique qu'une attaque prenaient la
// cible de l'attaque — on soignait l'ennemi qu'on venait de frapper. Signalé en
// partie : « ça devrait soigner soi-même ou un allié après avoir attaqué ».
//
// Le ciblage a donc deux phases. La première vise ce qui frappe (attaques,
// états) — et, sur une zone, le soutien posé DANS la zone, qui soigne les
// alliés qu'elle couvre. La seconde vise le soutien restant : soi-même ou un
// allié. Une carte qui ne fait que l'un ou l'autre n'a qu'une phase, comme avant.
const estEffetDeSoutien = (e) => !!(e && e.isHeal);
const effetDeLaPhaseSoutien = (state, e) =>
    estEffetDeSoutien(e) && !(state.isZone && e.enZone);

window.effetsDeLaPhase = function(state) {
    state = state || window.ETAT_CIBLAGE;
    if (!state) return { attaques: [], alterations: [] };
    const attaques = state.attaques || [], alterations = state.alterations || [];
    if (!state.soutienDiffere) return { attaques, alterations };
    const enSoutien = state.phaseCiblage === "soutien";
    const garder = (e) => effetDeLaPhaseSoutien(state, e) === enSoutien;
    return { attaques: attaques.filter(garder), alterations: alterations.filter(garder) };
};

// L'effet qui dicte les règles de la phase (portée, camp visé, couleur).
window.configCiblage = function(state) {
    state = state || window.ETAT_CIBLAGE;
    const e = window.effetsDeLaPhase(state);
    // En phase d'attaque, c'est l'attaque qui commande — même si un soin posé
    // dans la zone la précède sur la carte.
    if (state && state.soutienDiffere && state.phaseCiblage !== "soutien") {
        return [...e.attaques, ...e.alterations].find(x => !estEffetDeSoutien(x))
            || e.attaques[0] || e.alterations[0];
    }
    return e.attaques[0] || e.alterations[0];
};

// Une carte a-t-elle besoin de la seconde phase ?
window.soutienADiffere = function(state) {
    const tous = [...(state.attaques || []), ...(state.alterations || [])];
    const seconde = tous.filter(e => effetDeLaPhaseSoutien(state, e));
    const offensifs = tous.filter(e => !estEffetDeSoutien(e));
    return offensifs.length > 0 && seconde.length > 0;
};

// --- OUTILS MATHÉMATIQUES ---
function getHexDistance(a, b) {
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

// Affiche le message flottant de dégâts/soin + le flash coloré + la mini-barre qui se vide (ou se
// remplit) sur le pion, exactement comme pour une attaque classique (voir jouerAnimationMoteur).
// Réutilisée par les attaques d'opportunité et les tics d'Empoisonnement, qui n'avaient jusqu'ici
// que le message flottant générique, sans le retour visuel de la barre.
window.afficherFlashDegatToken = function(idCible, ancienneValeur, nouvelleValeur, valeurMax, texte, couleurTexte, couleurBarre) {
    // Même règle que pour les messages flottants : pendant qu'une créature
    // calcule son tour, le plateau ne clignote pas. Le coup se verra à son tour.
    if (window.CALCUL_IA_SILENCIEUX) return;
    const tkCible = window.TOKENS_VTT_DATA ? window.TOKENS_VTT_DATA[idCible] : null;
    if (tkCible && typeof window.afficherMessageFlottantHex === "function") {
        window.afficherMessageFlottantHex(tkCible.q, tkCible.r, texte, couleurTexte || "#ff4c4c");
    }

    const tokenDiv = document.getElementById("token-" + idCible);
    if (!tokenDiv || !valeurMax) return;

    const couleur = couleurBarre || "#ff4c4c";
    const bordure = couleur === "#00ffff" ? "#00ffff" : "#c2a878";
    const hueRotate = couleur === "#00ffff" ? "180deg" : (couleur === "#1b6e3a" ? "90deg" : "-50deg");

    tokenDiv.style.transition = "filter 0.1s";
    tokenDiv.style.filter = `sepia(1) hue-rotate(${hueRotate}) saturate(5) brightness(1.2)`;

    const oldPct = Math.max(0, Math.min(100, (ancienneValeur / valeurMax) * 100));
    const newPct = Math.max(0, Math.min(100, (nouvelleValeur / valeurMax) * 100));

    const jaugeContainer = document.createElement("div");
jaugeContainer.className = "jauge-flash-token";
    jaugeContainer.style.position = "absolute";
    jaugeContainer.style.bottom = "-12px";
    jaugeContainer.style.left = "50%";
    jaugeContainer.style.transform = "translateX(-50%)";
    jaugeContainer.style.width = "75%";
    jaugeContainer.style.height = "6px";
    jaugeContainer.style.backgroundColor = "#111";
    jaugeContainer.style.border = `1px solid ${bordure}`;
    jaugeContainer.style.borderRadius = "3px";
    jaugeContainer.style.zIndex = "5";
    jaugeContainer.style.opacity = "0";
    jaugeContainer.style.transition = "opacity 0.3s ease";
    jaugeContainer.style.boxShadow = "0 2px 4px rgba(0,0,0,0.8)";

    const jaugeFill = document.createElement("div");
    jaugeFill.style.height = "100%";
    jaugeFill.style.width = oldPct + "%";
    jaugeFill.style.backgroundColor = couleur;
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
};

// =========================================================================
//  ZONES PERSISTANTES (Persistance de terrain)
//  Une carte portant le mod "Persistance de terrain" laisse, APRÈS s'être résolue
//  normalement sur sa cible, une zone dangereuse sur la case visée (ou sur toute l'emprise
//  de l'AoE si un mod Zone est présent). Elle dure 3 tours (jamais prolongeable), frappe
//  TOUT LE MONDE sans distinction de camp, et se déclenche à CHAQUE case de la zone qu'un
//  personnage franchit (pas une seule fois par déplacement).
//  Les zones vivent dans Combat_VTT.Zones_Persistantes : tous les clients les reçoivent via
//  le listener déjà en place, comme les Tokens.
// =========================================================================
window.ZONES_PERSISTANTES = window.ZONES_PERSISTANTES || {};

// Quel visuel pour quel état embarqué par le sort d'origine.
window.TYPES_ZONES_PERSISTANTES = {
    "Brûlé": "feu",
    "Glacé": "glace",
    "Électrifié": "electrique",
    "Empoisonnement": "poison"
};

window.HABILLAGE_ZONES_PERSISTANTES = {
    feu:         { message: "🔥 Brasier !",         couleur: "#ff7a1a" },
    glace:       { message: "❄️ Gel mordant !",     couleur: "#7fd8ff" },
    electrique:  { message: "⚡ Décharge !",         couleur: "#bfe8ff" },
    poison:      { message: "☠️ Nappe toxique !",   couleur: "#8fdc4c" },
    soin:        { message: "✨ Zone bienfaisante !", couleur: "#4caf50" },
    neutre:      { message: "💥 Terrain piégé !",    couleur: "#ff4c4c" }
};

// ⚠️ Toujours passer par ici pour écrire les zones : setDoc(..., {merge:true}) FUSIONNE les clés
// des maps imbriquées, donc retirer une zone de l'objet ne la supprimait jamais côté Firestore
// (zones éternelles, et bouton "Réinitialiser le combat" sans effet). updateDoc, lui, remplace
// bien la valeur complète du champ.
window.sauvegarderZonesPersistantes = async function(zones) {
    if (!window.ID_PARTIE_COURANTE) return;
    const ref = doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE);
    try {
        await updateDoc(ref, { Zones_Persistantes: zones });
    } catch (e) {
        // Document pas encore créé (début de partie) : on le crée avec le champ.
        try {
            await setDoc(ref, { Zones_Persistantes: zones }, { merge: true });
        } catch (err) {
            console.error("Erreur sauvegarde zones persistantes :", err);
        }
    }
};

// GRANDE SUPPRESSION : window.creerZonePersistante et window.resoudreZonesPersistantesSurCase
// (l'ancien moteur, écriture directe dans Combat_VTT/ZONES_PERSISTANTES depuis le poste qui
// joue la carte ou qui déplace le pion) ont disparu d'ici. La zone entre maintenant dans
// l'état du cerveau au moment de résoudre la carte (voir creerZonePersistante et
// resoudreZonesPersistantesSurCase, moteur_pur.js) : plus aucun poste ne la pose ou n'y
// marche dans son coin. sauvegarderZonesPersistantes, elle, reste : reinitialiserCombat
// (combat.js) l'appelle encore pour vider Combat_VTT.Zones_Persistantes à la fin d'un combat.
// Rejoue chez CHAQUE joueur le résultat déjà tranché ci-dessus. N'écrit rien, ne relance aucun dé.
window.jouerAnimationZonePersistante = async function(res, hexPosition) {
    if (!res || !res.idCible) return;
    const tk = hexPosition || (window.TOKENS_VTT_DATA ? window.TOKENS_VTT_DATA[res.idCible] : null);
    if (!tk || typeof window.afficherMessageFlottantHex !== "function") return;

    const habillage = window.HABILLAGE_ZONES_PERSISTANTES[res.type] || window.HABILLAGE_ZONES_PERSISTANTES.neutre;
    window.afficherMessageFlottantHex(tk.q, tk.r, habillage.message, habillage.couleur);
    await new Promise(r => setTimeout(r, 500));

    if (res.dodged) {
        window.afficherMessageFlottantHex(tk.q, tk.r, res.motDef, "#cccccc");
        await new Promise(r => setTimeout(r, 700));
        return;
    }

    if (res.degats > 0) {
        const cibleData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === res.idCible);
        const couleur = res.viaBouclier ? "#00ffff" : "#ff4c4c";
        const texte = `-${res.degats} ${res.viaBouclier ? "🛡️" : "🩸"}`;
        if (cibleData && typeof window.afficherFlashDegatToken === "function") {
            if (res.viaBouclier) {
                const maxShield = parseInt(cibleData.Bouclier_Max) || 1;
                const newShield = parseInt(cibleData.Bouclier_Actuel) || 0;
                window.afficherFlashDegatToken(res.idCible, newShield + res.degats, newShield, maxShield, texte, couleur, "#00ffff");
            } else {
                const maxPv = (parseInt(cibleData.PV_Max) || 1) + (parseInt(cibleData.Dev_Mod_PV) || 0);
                const newPv = parseInt(cibleData.PV_Actuels) || 0;
                window.afficherFlashDegatToken(res.idCible, newPv + res.degats, newPv, maxPv, texte, couleur);
            }
        } else {
            window.afficherMessageFlottantHex(tk.q, tk.r, texte, couleur);
        }
        await new Promise(r => setTimeout(r, 900));
    }

    if (res.soin > 0) {
        const cibleData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === res.idCible);
        const texte = `+${res.soin} ✚`;
        if (cibleData && typeof window.afficherFlashDegatToken === "function") {
            const maxPv = (parseInt(cibleData.PV_Max) || 1) + (parseInt(cibleData.Dev_Mod_PV) || 0);
            const newPv = parseInt(cibleData.PV_Actuels) || 0;
            window.afficherFlashDegatToken(res.idCible, newPv - res.soin, newPv, maxPv, texte, "#1b6e3a", "#1b6e3a");
        } else {
            window.afficherMessageFlottantHex(tk.q, tk.r, texte, "#1b6e3a");
        }
        await new Promise(r => setTimeout(r, 900));
    }

    if (res.etatApplique) {
        window.afficherMessageFlottantHex(tk.q, tk.r, `${res.etatApplique} !`, "#9333ea");
        await new Promise(r => setTimeout(r, 900));
    }
};

// =========================================================================
//  ATTAQUES D'OPPORTUNITÉ
//  Déclenchées depuis mouvement.js quand un personnage quitte le corps-à-corps
//  d'un adversaire (camp opposé uniquement). 10 dégâts fixes, ignorant l'armure
//  et les compétences équipées, mais toujours soumis à un jet d'esquive/parade
//  et absorbés par un bouclier magique actif comme une attaque normale.
// =========================================================================
// GRANDE SUPPRESSION : window.resoudreAttaqueOpportunite (le jet et les dégâts fixes, tranchés
// et écrits ici par le poste qui déplace le pion) a disparu — c'est resoudreOpportunite
// (mouvement_pur.js) qui tranche maintenant l'attaque, dans le cerveau, avec ses propres dés.
// jouerAnimationOpportunite reste : elle ne fait qu'AFFICHER un résultat déjà tranché, que ce
// résultat vienne d'ici (mort) ou du cerveau (vivant) — regime_cerveau.js et jouerAnimationPas
// (mouvement.js) l'appellent encore pour ça.
window.jouerAnimationOpportunite = async function(data) {
    if (!data || !data.idCible) return;
    const tkCible = data.hexPosition || (window.TOKENS_VTT_DATA ? window.TOKENS_VTT_DATA[data.idCible] : null);
    if (!tkCible || typeof window.afficherMessageFlottantHex !== "function") return;

    window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "⚔️ Attaque d'opportunité !", "#ffaa00");
    await new Promise(r => setTimeout(r, 500));

    if (data.dodged) {
        window.afficherMessageFlottantHex(tkCible.q, tkCible.r, data.motDef, "#cccccc");
        return;
    }

    const couleur = data.viaBouclier ? "#00ffff" : "#ff4c4c";
    const icone = data.viaBouclier ? "🛡️" : "🩸";
    const texte = `-${data.degats} ${icone}`;

    // Barre qui se vide sur le pion, comme pour une attaque classique. On reconstruit l'ancienne
    // valeur à partir de l'actuelle + les dégâts déjà connus (évite toute course avec le listener
    // Firestore qui a pu déjà appliquer la nouvelle valeur chez ce client au moment du rejeu).
    const cibleData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === data.idCible);
    if (cibleData && typeof window.afficherFlashDegatToken === "function") {
        if (data.viaBouclier) {
            const maxShield = parseInt(cibleData.Bouclier_Max) || 1;
            const newShield = parseInt(cibleData.Bouclier_Actuel) || 0;
            window.afficherFlashDegatToken(data.idCible, newShield + data.degats, newShield, maxShield, texte, couleur, "#00ffff");
        } else {
            const maxPv = (parseInt(cibleData.PV_Max) || 1) + (parseInt(cibleData.Dev_Mod_PV) || 0);
            const newPv = parseInt(cibleData.PV_Actuels) || 0;
            window.afficherFlashDegatToken(data.idCible, newPv + data.degats, newPv, maxPv, texte, couleur);
        }
    } else {
        window.afficherMessageFlottantHex(tkCible.q, tkCible.r, texte, couleur);
        const tokenDiv = document.getElementById("token-" + data.idCible);
        if (tokenDiv) {
            tokenDiv.style.transition = "filter 0.1s";
            tokenDiv.style.filter = "sepia(1) hue-rotate(-50deg) saturate(5) brightness(1.2)";
            setTimeout(() => { tokenDiv.style.filter = ""; }, 300);
        }
    }
};

// GRANDE SUPPRESSION : window.listerEnnemisAuContact ne servait qu'à l'ancien
// validerMouvement (mouvement.js) pour repérer, pas à pas, quel ennemi quitte le
// corps-à-corps. Le cerveau tranche maintenant les opportunités lui-même
// (resoudreOpportunite, mouvement_pur.js) à partir de son propre état.

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
//  ASSOMBRISSEMENT DU PLATEAU
// =========================================================================
//  Le même voile noir partout : tout l'écran s'assombrit sauf les cases où l'on
//  peut cliquer. Le SVG est posé DANS #transform-plateau, donc il suit le pan et
//  le zoom sans le moindre recalcul.
// Les cases où l'on peut poser une zone à distance : c'est la règle du survol
// (VTT_CIBLAGE_MOUSEMOVE), mise au propre pour pouvoir aussi la DESSINER.
window.casesPosablesZone = function(idLanceur, configSort) {
    const tkLanceur = window.positionCiblage(idLanceur);
    const lanceurData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idLanceur);
    if (!tkLanceur || !lanceurData || !window.PLATEAU_VTT || !configSort) return [];

    const portee = Math.max(1, parseInt(configSort.rangeMax) || 1);

    // Au corps-à-corps, on ne vise plus qu'à une case : c'est déjà la règle du jeu.
    let estEngage = false;
    for (let idAutre in window.TOKENS_VTT_DATA) {
        if (idAutre === idLanceur) continue;
        const autre = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idAutre);
        if (!autre || autre.camp === lanceurData.camp || autre.statut === "Mort") continue;
        if (getHexDistance(tkLanceur, window.TOKENS_VTT_DATA[idAutre]) === 1) { estEngage = true; break; }
    }
    // Le corps-à-corps n'empêche que de FRAPPER plus loin : un soin, un
    // bouclier se posent à leur pleine portée même avec un ennemi au contact
    // (la règle est déjà celle du ciblage d'une cible unique).
    const limite = (estEngage && !configSort.isHeal) ? 1 : portee;

    return window.PLATEAU_VTT.getHexesInRadius(tkLanceur.q, tkLanceur.r, limite)
        .filter(h => getHexDistance(tkLanceur, h) <= limite && verifierLigneDeVue(tkLanceur, h));
};

window.assombrirCasesJouables = function(idOverlay, hexes) {
    const conteneurTransform = document.getElementById("transform-plateau");
    if (!conteneurTransform || !window.PLATEAU_VTT || !Array.isArray(hexes)) return null;

    window.retirerAssombrissement(idOverlay);

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

    const maskId = "masque-" + idOverlay + "-" + Date.now();
    const trous = hexes.map(h => `<polygon points="${pointsHex(h.q, h.r)}" fill="black"/>`).join("");

    const overlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    overlay.id = idOverlay;
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
    return overlay;
};

window.retirerAssombrissement = function(idOverlay) {
    const ancien = document.getElementById(idOverlay);
    if (ancien) ancien.remove();
};

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

        // L'Immobilisation bloque tout mouvement volontaire, y compris le Bond
        // (mais pas les déplacements subis comme Poussée/Traction/Peur).
        const lanceurBond = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPerso);
        if (lanceurBond && lanceurBond.Etats_Alteres && lanceurBond.Etats_Alteres.some(e => e.nom === "Immobilisation")) {
            if (typeof window.afficherMessageFlottantHex === "function") {
                window.afficherMessageFlottantHex(tkDepart.q, tkDepart.r, "Immobilisé !", "#aaaaaa");
            }
            return resolve(false);
        }

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
        const conteneur = document.getElementById("conteneur-plateau-vtt");
        if (!conteneur) return resolve(false);

        // La case de départ reste éclairée : c'est elle qu'on tape pour renoncer.
        const overlay = window.assombrirCasesJouables("svg-bond-assombrissement",
            [hexDepart, ...hexesValides]);
        if (!overlay) return resolve(false);
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

            // ON DEMANDE — ON N'ÉCRIT PAS. La case choisie, elle, reste
            // choisie ici : c'est du ciblage.
            if (window.regimeDemande && window.regimeDemande.actif()) {
                try {
                    await window.regimeDemande.bond(idPerso, hexArrivee, portee);
                } catch (err) {
                    console.error("Demande de bond :", err);
                }
                // Le cerveau rejouera le saut chez tout le monde, animation
                // comprise : on attend le même temps qu'avant pour que la suite
                // de la carte ne construise pas son ciblage par-dessus.
                await new Promise(r => setTimeout(r, 750));
                // On rend la case d'arrivée : la suite de la carte se vise
                // depuis là (voir positionCiblage), sans attendre que le pion
                // l'ait rejointe à l'écran.
                return resolve(hexArrivee);
            }

            resolve(false);
        };

        window.addEventListener("click", onClick, { capture: true });
    });
};

// =========================================================================
//  REPLI — OÙ SE REPLIER ?
//  Même écran que le Bond : tout s'assombrit, sauf la case du lanceur et les
//  cases qu'il peut atteindre à pied en `portee` pas (ni mur, ni vivant
//  traversé — la marche, pas le saut). Un tap sur une case éclairée la choisit ;
//  un tap sur son propre pion renonce au repli (la carte part quand même).
//  Les cases viennent de la même fonction que celle du cerveau
//  (mouvementPur.cheminsDeRepli), appliquée à ce que l'écran connaît.
// =========================================================================
window.casesDeRepliEcran = function(idPerso, portee, depart) {
    const mp = window.mouvementPur;
    const tk = depart || (window.TOKENS_VTT_DATA || {})[idPerso];
    if (!mp || typeof mp.cheminsDeRepli !== "function" || !tk) return [];
    const combattants = {};
    Object.entries(window.TOKENS_VTT_DATA || {}).forEach(([id, t]) => {
        const p = (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === id);
        const aTerre = !!(p && (p.statut === "Mort" || p.statut === "KO"));
        combattants[id] = { id, q: Number(t.q), r: Number(t.r), aTerre };
    });
    combattants[idPerso] = { ...(combattants[idPerso] || { id: idPerso }), q: Number(tk.q), r: Number(tk.r), aTerre: false };
    const plateau = { etatCase: (q, r) => {
        const e = (window.PLATEAU_VTT && window.PLATEAU_VTT.getCaseState) ? (window.PLATEAU_VTT.getCaseState(q, r) || {}) : {};
        return { bloquee: !!e.isBlocked, supprimee: !!e.isDeleted, difficile: !!e.isDifficult };
    } };
    const chemins = mp.cheminsDeRepli({ combattants }, idPerso, portee, plateau);
    return [...chemins.keys()].map(k => { const [q, r] = k.split(",").map(Number); return { q, r }; });
};

window.choisirCaseRepli = function(idPerso, portee, depart) {
    return new Promise((resolve) => {
        const tk = depart || (window.TOKENS_VTT_DATA ? window.TOKENS_VTT_DATA[idPerso] : null);
        if (!tk || !window.PLATEAU_VTT) return resolve(null);
        const hexDepart = { q: Number(tk.q), r: Number(tk.r) };

        const lanceur = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPerso);
        if (lanceur && (lanceur.Etats_Alteres || []).some(e => e.nom === "Immobilisation")) {
            if (typeof window.afficherMessageFlottantHex === "function") {
                window.afficherMessageFlottantHex(hexDepart.q, hexDepart.r, "Immobilisé !", "#aaaaaa");
            }
            return resolve(null);
        }

        const cases = window.casesDeRepliEcran(idPerso, portee, hexDepart);
        if (cases.length === 0) {
            if (typeof window.afficherMessageFlottantHex === "function") {
                window.afficherMessageFlottantHex(hexDepart.q, hexDepart.r, "Aucune case de repli", "#aaaaaa");
            }
            return resolve(null);
        }

        const conteneur = document.getElementById("conteneur-plateau-vtt");
        if (!conteneur || typeof window.assombrirCasesJouables !== "function") return resolve(null);
        const overlay = window.assombrirCasesJouables("svg-repli-assombrissement", [hexDepart, ...cases]);
        if (!overlay) return resolve(null);
        if (typeof window.surlignerEffetCarteActif === "function") window.surlignerEffetCarteActif("Repli");
        if (typeof window.afficherMessageFlottantHex === "function") {
            window.afficherMessageFlottantHex(hexDepart.q, hexDepart.r, "↩️ Où te replier ?", "#ffaa00");
        }

        const nettoyer = () => {
            overlay.remove();
            if (typeof window.surlignerEffetCarteActif === "function") window.surlignerEffetCarteActif(null);
            window.removeEventListener("click", onClick, { capture: true });
        };

        const onClick = (e) => {
            if (!conteneur.contains(e.target)) return;
            e.stopPropagation();

            const tokenClique = e.target.closest ? e.target.closest(".token-vtt") : null;
            if (tokenClique) {
                const idClique = tokenClique.id.replace("token-", "");
                if (idClique === idPerso) { nettoyer(); return resolve(null); }   // on reste
                const t = window.TOKENS_VTT_DATA[idClique];
                if (t && typeof window.afficherMessageFlottantHex === "function") {
                    window.afficherMessageFlottantHex(t.q, t.r, "Case occupée", "#aaaaaa");
                }
                return;
            }

            const x = (e.clientX - window.VTT_POS_X) / window.VTT_SCALE;
            const y = (e.clientY - window.VTT_POS_Y) / window.VTT_SCALE;
            const hex = window.PLATEAU_VTT.pixelToHex(x, y);
            if (hex.q === hexDepart.q && hex.r === hexDepart.r) { nettoyer(); return resolve(null); }
            const choisie = cases.find(h => h.q === hex.q && h.r === hex.r);
            if (!choisie) return;   // hors d'atteinte : on attend
            nettoyer();
            resolve({ q: choisie.q, r: choisie.r });
        };

        window.addEventListener("click", onClick, { capture: true });
    });
};

// =========================================================================
//  ILLUSION
//  Crée un leurre statique de 1 PV, avec l'image du lanceur (affichée à 50% d'opacité, voir
//  appliquerTokensVTT), sur une case libre choisie interactivement (même écran assombri que le
//  Bond) dans la portée de l'action (1 par défaut, plus si un mod Distance est posé dessus).
//  N'entre jamais dans la file d'initiative : c'est un pion purement statique, jamais son tour.
//  Toujours résolue en dernier sur la carte (voir demarrerCiblage / declencherResolutionAvecBondEventuel).
// =========================================================================
window.resoudreIllusionInteractif = function(idLanceur, portee) {
    return new Promise((resolve) => {
        const tkLanceur = window.TOKENS_VTT_DATA ? window.TOKENS_VTT_DATA[idLanceur] : null;
        if (!tkLanceur || !window.PLATEAU_VTT) return resolve(false);

        const candidats = window.PLATEAU_VTT.getHexesInRadius(tkLanceur.q, tkLanceur.r, portee);
        const hexesValides = candidats.filter(h => {
            if (h.q === tkLanceur.q && h.r === tkLanceur.r) return false;

            const state = window.PLATEAU_VTT.getCaseState(h.q, h.r);
            if (state.isBlocked || state.isDeleted) return false;

            for (let idAutre in window.TOKENS_VTT_DATA) {
                const autre = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idAutre);
                if (!autre || autre.statut === "Mort") continue;
                const tkAutre = window.TOKENS_VTT_DATA[idAutre];
                if (tkAutre.q === h.q && tkAutre.r === h.r) return false;
            }

            return verifierLigneDeVue(tkLanceur, h);
        });

        if (hexesValides.length === 0) {
            alert("Aucune case libre pour poser l'illusion.");
            return resolve(false);
        }

        const conteneur = document.getElementById("conteneur-plateau-vtt");
        if (!conteneur) return resolve(false);

        const overlay = window.assombrirCasesJouables("svg-illusion-assombrissement", hexesValides);
        if (!overlay) return resolve(false);
        window.surlignerEffetCarteActif("Illusion");

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
                const tkClique = window.TOKENS_VTT_DATA[tokenClique.id.replace("token-", "")];
                if (tkClique && typeof window.afficherMessageFlottantHex === "function") {
                    window.afficherMessageFlottantHex(tkClique.q, tkClique.r, "Case invalide", "#aaaaaa");
                }
                return;
            }

            const canvasX = (e.clientX - window.VTT_POS_X) / window.VTT_SCALE;
            const canvasY = (e.clientY - window.VTT_POS_Y) / window.VTT_SCALE;
            const hex = window.PLATEAU_VTT.pixelToHex(canvasX, canvasY);
            const cible = hexesValides.find(h => h.q === hex.q && h.r === hex.r);

            if (!cible) return; // Hors zone valide : ne fait rien

            nettoyer();

            if (typeof window.creerIllusion === "function") {
                await window.creerIllusion(idLanceur, cible.q, cible.r);
            }

            resolve(true);
        };

        window.addEventListener("click", onClick, { capture: true });
    });
};

// Crée le personnage "Illusion" en base (comme un monstre posé sur le plateau) et
// son pion sur le plateau : les écouteurs déjà en place sur Personnages/Combat_VTT propagent la
// création à tous les joueurs, sans diffusion dédiée nécessaire.
window.creerIllusion = async function(idLanceur, q, r) {
    if (!window.ID_PARTIE_COURANTE) return;
    const lanceurData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idLanceur);
    if (!lanceurData) return;

    // L'identifiant est tiré ici, une seule fois, par le seul poste qui pose le
    // leurre : ce n'est pas un jet de dé, c'est un nom propre. Le cerveau le
    // reçoit tel quel et refuse une illusion qui porterait un nom déjà pris.
    const idIllusion = "ILLUSION_" + Math.random().toString(36).substring(2, 9);
    // L'image du TOKEN de combat, pas le portrait du personnage.
    const imgUrl = (window.TOKENS_VTT_DATA[idLanceur] && window.TOKENS_VTT_DATA[idLanceur].url) || lanceurData.urlCloudinary || "";
    const taille = (window.TOKENS_VTT_DATA[idLanceur] && window.TOKENS_VTT_DATA[idLanceur].taille) || 55;

    const dataIllusion = {
        ID_Partie: window.ID_PARTIE_COURANTE,
        ID_Joueur: lanceurData.idJoueur || "MJ",
        // Qui l'a créée : c'est ce qui permet d'effacer ses leurres avec elle
        // quand on supprime un personnage.
        ID_Lanceur: idLanceur,
        Camp: lanceurData.camp,
        Prenom_Personnage: "Illusion de",
        Nom_Personnage: (lanceurData.prenom || lanceurData.nom || "").trim(),
        Statut: "Vivant",
        PV_Max: 1,
        PV_Actuels: 1,
        Fatigue_Max: 0,
        Fatigue_Actuelle: 0,
        URL_Cloudinary: imgUrl,
        URL_Token: imgUrl,
        Couleur: lanceurData.couleur || "#c2a878",
        Initiative: 0,
        Esquive: 0,
        Parade: 0,
        Critique: 0,
        Def_Physique: 0,
        Def_Magique: 0,
        Competences_Max: 0,
        Est_Illusion: true
    };

    try {
        // LA FICHE D'ABORD, LE COMBATTANT ENSUITE — et dans cet ordre.
        //
        // Le document Personnages porte son IDENTITÉ : le nom, l'image, la
        // couleur. C'est une fiche, comme celle d'un héros, et les écouteurs
        // déjà en place la propagent à tous les écrans. Le pion, de même : sans
        // lui, le plateau n'aurait rien à dessiner (il ne fabrique jamais un
        // pion qu'il ne connaît pas — trois pions fantômes l'ont appris).
        //
        // Mais sa VIE DE COMBAT — son point de vie unique, sa case, le fait
        // qu'on puisse la viser et la faire tomber — appartient au cerveau. Il
        // arrête sa liste de combattants à l'ouverture du combat : un leurre né
        // après, écrit seulement ici, n'existait pour lui à aucun moment. On
        // pouvait le voir sur le plateau et le traverser sans le toucher.
        await setDoc(doc(db, "Personnages", idIllusion), dataIllusion);

        window.TOKENS_VTT_DATA[idIllusion] = { q, r, url: imgUrl, taille };
        await window.enregistrerPionsVTT(idIllusion);

        if (window.regimeDemande && window.regimeDemande.actif()) {
            await window.regimeDemande.illusion(idLanceur, idIllusion, { q, r });
        }
    } catch (err) {
        console.error("Erreur création Illusion :", err);
    }
};

// Défait exactement ce que creerIllusion a fait : le document, le pion sur le plateau, et
// l'entrée dans Combat_VTT. Appelée quand l'illusion tombe à 0 PV (elle n'en a qu'un seul)
// et lors de la réinitialisation du combat, pour qu'il ne reste jamais de leurre fantôme
// ni en base ni sur la carte. N'est exécutée que par un seul client (voir les appels) : les
// autres voient l'illusion disparaître via les écouteurs Firestore déjà en place.
window.detruireIllusion = async function(idIllusion) {
    if (!idIllusion || !window.ID_PARTIE_COURANTE) return;

    if (window.TOKENS_VTT_DATA) delete window.TOKENS_VTT_DATA[idIllusion];
    if (window.SOURCE_COMBATTANTS) delete window.SOURCE_COMBATTANTS[idIllusion];
    if (Array.isArray(window.PERSOS_JOUEURS_PARTIE)) {
        window.PERSOS_JOUEURS_PARTIE = window.PERSOS_JOUEURS_PARTIE.filter(p => p.idPersonnage !== idIllusion);
    }
    if (Array.isArray(window.PERSOS_PARTIE)) {
        window.PERSOS_PARTIE = window.PERSOS_PARTIE.filter(p => p.idPersonnage !== idIllusion);
    }

    await deleteDoc(doc(db, "Personnages", idIllusion)).catch(e => console.error("Suppression illusion :", e));
    await updateDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
        ["Tokens." + idIllusion]: deleteField()
    }).catch(e => console.error("Retrait du pion illusion :", e));

    if (typeof window.redessinerPions === "function") window.redessinerPions();
    if (typeof window.afficherPisteInitiative === "function") window.afficherPisteInitiative();
};

// GRANDE SUPPRESSION : window.declencherPousseeCible, window.declencherTractionCible,
// window.diffuserEchecDeplacementForce et window.declencherPeurCible n'existent plus.
// C'étaient les déplacements forcés de l'ancien moteur — calculés en local par le
// lanceur, écrits dans Action_Poussee/Action_Traction/Action_Peur, puis rejoués par
// jouerAnimationPoussee/jouerAnimationPeur (mouvement.js) chez chacun. Le cerveau les
// calcule maintenant lui-même, une fois pour tout le monde (destinationTraction et
// resoudreCarte pour la Poussée/Traction, resoudrePeur pour la Peur — moteur_pur.js /
// mouvement_pur.js), et les diffuse comme des étapes de son journal — plus aucun
// Action_Poussee/Action_Traction/Action_Peur n'est écrit. jouerAnimationPoussee et
// jouerAnimationPeur restent, elles : ce sont des fonctions d'AFFICHAGE, réutilisées
// par le pont du cerveau (pont_combat.js / regime_cerveau.js) pour montrer le résultat.

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

// Partagées avec l'IA des monstres : elle doit poser ses zones exactement comme
// un joueur le fait à la souris (même rotation, même règle de ligne de vue).
window.rotateHexVTT = rotateHex;
window.verifierLigneDeVueVTT = verifierLigneDeVue;
window.hexDistanceCiblage = getHexDistance;

// =========================================================================
//  1. ÉVÉNEMENTS GLOBAUX
// =========================================================================

window.VTT_CIBLAGE_MOUSEMOVE = function(e) {
    if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;
    const state = window.ETAT_CIBLAGE;
    if (!state || !state.actif || !state.isZone || state.phaseCiblage === "soutien") return;

    const idLanceur = window.lanceurDuCiblage();
    const tkLanceur = window.positionCiblage(idLanceur);
    const lanceurData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idLanceur);
    const configSort = window.configCiblage(state);

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

        if (estEngage && dist > 1 && !configSort.isHeal) state.zoneCenterHex = null; 
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
    if (!state || !state.actif || !state.isZone || state.phaseCiblage === "soutien") return;
    const configSort = window.configCiblage(state);
    
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
    if (!state || !state.actif || !state.isZone || state.phaseCiblage === "soutien") return;
    // LA CROIX D'ANNULATION N'EST PAS UNE VISÉE. Elle est posée sur le pion du
    // lanceur, donc DANS le plateau : sans cette ligne, ce guetteur — qui court
    // en phase de capture, avant tout le monde — avalerait son clic, et la
    // seule sortie d'un ciblage de zone resterait la fin du tour.
    if (e.target && e.target.closest && e.target.closest(".croix-annuler-ciblage")) return;
    const conteneur = document.getElementById("conteneur-plateau-vtt");
    if (!conteneur || !conteneur.contains(e.target)) return;
    e.stopPropagation(); 

    const configSort = window.configCiblage(state);

    if (configSort && configSort.isRanged) {
        const canvasX = (e.clientX - window.VTT_POS_X) / window.VTT_SCALE;
        const canvasY = (e.clientY - window.VTT_POS_Y) / window.VTT_SCALE;
        const targetHex = window.PLATEAU_VTT.pixelToHex(canvasX, canvasY);
        
        const idLanceur = window.lanceurDuCiblage();
        const tkLanceur = window.positionCiblage(idLanceur);
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

        if (estEngage && dist > 1 && !configSort.isHeal) state.zoneCenterHex = null; 
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
    if (!state || !state.actif || !state.isZone || state.phaseCiblage === "soutien") return;
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
    if (!state || !state.actif || !state.isZone || state.phaseCiblage === "soutien") return;
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

// `options` ouvre une seconde porte à cette fonction, sans rien changer à la
// première : `{ extraire: true, idLanceur }` fait TOUT le travail d'extraction —
// les sept cents lignes qui lisent la carte forgée et en tirent des attaques,
// des altérations, une zone, un bond — puis rend le résultat SANS toucher à
// l'écran ni au ciblage.
//
// C'est ce dont le cerveau a besoin. Une créature lance une carte forgée par la
// Forge : sans cette extraction, elle lançait une carte VIDE, marchait, et
// « renonçait » — aucune animation, aucun dégât, exactement ce qu'on voyait à la
// table. Réécrire l'extracteur en pur aurait été le dupliquer, donc le laisser
// dériver ; on lui ouvre une porte au lieu d'en faire une copie.
window.demarrerCiblage = async function(idCarte, options) {
    const extraireSeulement = !!(options && options.extraire);
    if (!extraireSeulement && typeof window.jouerSonClic === "function") window.jouerSonClic();

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

    // Le cache d'affichage n'est rempli que pour le combattant montré dans le
    // panneau gauche. Quand une créature joue, c'est l'IA qui l'y met — et si ce
    // chargement a pris du retard, la carte manquait ici et le sort partait…
    // nulle part, sans un mot : la créature passait son tour sans rien faire.
    // Le cache global, lui, contient les techniques de TOUS les combattants.
    // QUI LANCE. Le panneau gauche le dit pour un joueur ; pour une extraction
    // demandée par le cerveau, c'est l'appelant qui le nomme — on ne va pas
    // déplacer le panneau d'un joueur pour lire la carte d'une créature.
    const persoLanceur = (options && options.idLanceur)
        ? ((window.PERSOS_PARTIE || []).find(p => p.idPersonnage === options.idLanceur) || null)
        : (window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO] || null);
    const idPourCache = (persoLanceur || {}).idPersonnage;
    const dataCarte = window.COMPETENCES_CACHE[idCarte]
        || ((window.CACHE_COMPETENCES_GLOBAL || {})[idPourCache] || {})[idCarte];
    if (!dataCarte) {
        console.warn(`Ciblage impossible : la technique ${idCarte} de ${idPourCache} est introuvable.`);
        return;
    }

    // La Paralysie a été retirée du jeu : plus personne n'est empêché de jouer
    // sa carte par un état. Le lanceur, lui, sert encore juste après (sa race
    // peut allonger la portée de ses sorts).
    const lanceurCarte = persoLanceur;

    // DEBUG POUR NICO (Pour comprendre la structure si ça rate un jour)
    console.log("=== STRUCTURE DE LA CARTE ===", JSON.parse(JSON.stringify(dataCarte)));

    const attaquesExtraites = [];
    const alterationsExtraites = [];
    let isZone = false;
    let zoneHexesBase = [];
    // La portée de placement de la zone, lue sur l'action qui la dessine.
    let zoneEstADistance = false;
    let zonePortee = 0;
    // LA PLUS LONGUE PORTÉE DE TOUTE LA CARTE, quelle que soit l'action qui la
    // porte. La carte, elle, se lit en entier : afficherApercuCarteHD décide de
    // détacher la zone du lanceur dès qu'un effet « Distance » apparaît
    // N'IMPORTE OÙ dans la carte. L'extraction, elle, ne regardait que l'action
    // qui dessine la zone — d'où « un soin à distance 3 avec persistance
    // terrain, mais je ne peux poser la zone qu'au corps-à-corps ».
    let porteeDeLaCarte = 0;
    let isBond = false;
    let porteeBond = 2;
    // LE REPLI : une marche de quelques cases APRÈS l'attaque. Il ne frappe ni
    // ne soigne ; la carte l'emporte avec elle jusqu'au cerveau, case d'arrivée
    // choisie juste avant l'envoi (voir choisirCaseRepli).
    let repliCarte = null;
    // Pour que la carte se résolve dans l'ordre où elle est construite : on retient à quel
    // rang du tableau se trouve le Bond, et à quel rang apparaît le premier autre effet
    // (attaque/soin/altération). Si le Bond est après, on le joue après la résolution de l'attaque.
    let indexBond = -1;
    let indexPremierAutreEffet = -1;
    let indexTraction = -1;
    let indexPremiereAttaque = -1;
    let isIllusion = false;
    let porteeIllusion = 1;
    // Persistance de terrain : le sort laisse derrière lui une zone dangereuse sur la ou les
    // cases visées (voir creerZonePersistante). Détecté ici, appliqué après la résolution.
    let aPersistanceTerrain = false;
    // Un Étalement posé sur une action Distance ou Zone ne frappe ni ne soigne
    // lui-même : il étale ce que CETTE CARTE fait passer par sa portée ou sa
    // zone. On le retient ici, et il se reporte sur les dégâts et les soins de
    // la carte une fois toutes les actions lues (plus bas).
    let toursEtalementDeLaCarte = 0;

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
            return s.includes("étourdi") || s.includes("etourdi");
        });
    };

    // Même principe que estEtatEtourdi, pour l'état Confusion.
    const estEtatConfusion = (eff) => {
        if (!eff) return false;
        const champs = [eff.Nom, eff.Cible_Etat, eff.Type_Mecanique, eff.Type_Mecanique_2];
        return champs.some(v => (v || "").toLowerCase().includes("confus"));
    };

    if (dataCarte.Composants && dataCarte.Composants.actions) {
        // Chaque effet retient si l'action qui l'a produit porte la zone. C'est
        // ce qui départage, sur une carte qui frappe ET soigne, un soin posé
        // DANS la zone (il soigne les alliés qu'elle couvre) d'un soin posé à
        // côté (il se vise à part, une fois l'attaque ciblée).
        const lireAction = (act, idxAction) => {
            if (act.zoneHexes && act.zoneHexes.length > 0) {
                isZone = true;
                zoneHexesBase = act.zoneHexes;
            }

            const effBase = window.EFFETS_BDD_CACHE[act.baseEffetId];
            if (!effBase) return;

            const nomLower = (effBase.Nom || "").toLowerCase();
            const listeMods = extraireMods(act.mods);
            const modsDuree = act.modsDuree || {};

            // Persistance de terrain : simple drapeau de carte (mod ou effet de base). La zone
            // qu'elle laisse derrière elle est construite après la résolution, à partir des
            // dégâts/états de la carte (voir declencherResolution).
            if (nomLower.includes("persistance")) aPersistanceTerrain = true;
            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (modEff && (modEff.Nom || "").toLowerCase().includes("persistance")) aPersistanceTerrain = true;
            });

            // Repli : sa Valeur est le nombre de cases, son Pourcentage de base
            // la chance d'éviter chaque attaque d'opportunité (un seul cran,
            // plafonné par le Pourcentage max). Posé en modificateur d'une
            // attaque, l'attaque reste ; posé en effet de base, il n'est que ça.
            const lireRepli = (eff, n) => {
                const portee = Math.max(1, Math.round(parseFrFloat(eff.Valeur) || 3));
                let chance = (parseFrFloat(eff.Pourcent_Base) || 60) * (n || 1);
                const plafond = parseFrFloat(eff.Pourcent_Max);
                if (plafond > 0) chance = Math.min(chance, plafond);
                repliCarte = { portee: Math.max((repliCarte || {}).portee || 0, portee),
                               chance: Math.min(100, Math.max((repliCarte || {}).chance || 0, chance)) };
            };
            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (modEff && (modEff.Nom || "").trim().toLowerCase() === "repli") lireRepli(modEff, m.count);
            });
            if (nomLower.trim() === "repli") {
                lireRepli(effBase, act.count);
                return;
            }

            // Bond : pas une attaque/alteration, traité à part avant tout le reste de la carte.
            if (nomLower.includes("bond")) {
                isBond = true;
                indexBond = idxAction;
                porteeBond = Math.round(parseFrFloat(effBase.Valeur) * (act.count || 1)) || 2;
                return;
            }

            // LA DISTANCE A DEUX SOURCES, ET LE COMBAT N'EN LISAIT QU'UNE.
            //
            // La Forge, elle, en reconnaît deux (voir actionHasDistance,
            // competences.js) : « Distance » posée comme MOD sur une action, ou
            // « Distance » choisie comme EFFET DE BASE d'une action à part
            // entière. Les deux sont des façons normales de construire une
            // carte, et la Forge dessine la zone de la même manière dans les
            // deux cas.
            //
            // Ici, seule la première comptait. Une carte dont la portée vient
            // d'une action « Distance » repartait donc en combat avec une portée
            // de 1 — et une zone à portée 1 se colle au lanceur. C'est très
            // exactement « il ne prend pas en compte la distance mise sur la
            // capacité ».
            let isRanged = false;
            let rangeMax = 1;
            const porteeDe = (eff, count) => 1 + ((parseFrFloat(eff.Valeur) || 0) * (count || 1));

            if ((effBase.Nom || "") === "Distance") {
                isRanged = true;
                rangeMax = porteeDe(effBase, act.count);
            }
            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (modEff && modEff.Nom === "Distance") {
                    isRanged = true;
                    // Deux sources sur la même action : on garde la plus longue
                    // plutôt que d'écraser l'une par l'autre.
                    rangeMax = Math.max(rangeMax, porteeDe(modEff, m.count));
                }
            });

            // Illusion : pas une attaque/altération, pas de cible ennemie — un effet auto-centré
            // traité à part, comme le Bond, mais toujours résolu en DERNIER sur la carte (voir plus
            // bas). Sa portée de placement suit la portée normale de l'action (1 par défaut, plus
            // si un mod Distance est posé dessus).
            if (nomLower.includes("illusion")) {
                isIllusion = true;
                porteeIllusion = rangeMax;
                return;
            }

            // L'arme équipée peut transformer l'action en tir, et allonger sa
            // portée. Posé ICI, avant que isRanged et rangeMax ne servent :
            // attaques et altérations partent donc avec la bonne portée, et une
            // attaque devenue tir encaisse bien le malus au contact.
            ({ isRanged, rangeMax } = window.porteeAvecArme(lanceurCarte, isRanged, rangeMax,
                                                            dataCarte.Arme));

            // LA ZONE PORTE SA PROPRE DISTANCE. C'est l'action qui dessine la
            // zone qui dit à quelle distance on peut la poser — pas forcément
            // celle qui soigne ou qui frappe. Sur une carte où la Distance est
            // une action à part et le soin une autre, la zone n'avait aucune
            // portée à elle : elle héritait de celle du soin, c'est-à-dire une
            // case, et restait collée au lanceur.
            if (act.zoneHexes && act.zoneHexes.length > 0 && isRanged) {
                zoneEstADistance = true;
                zonePortee = Math.max(zonePortee, rangeMax);
            }
            if (isRanged) porteeDeLaCarte = Math.max(porteeDeLaCarte, rangeMax);

            // A. Détection Attaques, Soins & Purifications
            //
            // LA PURIFICATION ENLÈVE UN NOMBRE D'ÉTATS, À COUP SÛR. Le grimoire
            // la décrit ainsi (« Enlève un état aléatoire sur la cible ») : sa
            // Valeur est le nombre d'états retirés (1), sans pourcentage, pour
            // un coût fixe. Elle se lisait autrefois comme une CHANCE de tout
            // purger (Pourcent_Base) — avec la base actuelle, ce pourcentage
            // vaut 0 et la purification ne se serait plus jamais déclenchée.
            // Un Pourcent_Base encore renseigné reste lu comme une chance.
            let isPurification = false;
            let purifChance = 0;
            let purifNombre = 0;
            const lirePurification = (eff, n) => {
                isPurification = true;
                const pct = parseFrFloat(eff.Pourcent_Base) || 0;
                purifChance = Math.min(100, purifChance + (pct > 0 ? pct * n : 100));
                purifNombre += Math.max(1, Math.round(parseFrFloat(eff.Valeur) || 1)) * n;
            };

            if (nomLower.includes("purification")) lirePurification(effBase, act.count || 1);

            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (modEff && (modEff.Nom || "").toLowerCase().includes("purification")) {
                    lirePurification(modEff, m.count || 1);
                }
            });

            let isShield = nomLower.includes("bouclier");

            // Étalement (mod "DOT" / "Durée étalement dégâts") : la carte coûte moins de
            // fatigue (déjà géré par la Forge, coutActionTotale /= 1.3), mais ses dégâts — ou
            // ses soins — ne tombent plus d'un coup : ils sont DIVISÉS PAR LE NOMBRE DE TOURS
            // de l'étalement, une part à chaque fin de manche. 10 dégâts étalés sur 2 tours,
            // c'est 5 puis 5. Le nombre de tours est celui de l'effet (colonne Tours, 2), plus
            // les crans du bouton ⏳ posés dessus dans la Forge.
            let toursEtalement = 0;
            const estModEtalement = (nom) => {
                const n = (nom || "").toLowerCase().trim();
                return n === "dot" || n.includes("étalement") || n.includes("etalement");
            };
            const toursDe = (eff, crans) => Math.max(2, Math.round(parseFrFloat(eff.Tours) || 2) + Math.round(parseFrFloat(crans)));
            if (estModEtalement(effBase.Nom)) toursEtalement = Math.max(toursEtalement, toursDe(effBase, act.baseDuree));
            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (modEff && estModEtalement(modEff.Nom)) toursEtalement = Math.max(toursEtalement, toursDe(modEff, modsDuree[m.id]));
            });
            if (toursEtalement > 0 && (effBase.Nom === "Distance" || nomLower.includes("zone")
                    || listeMods.some(m => ((window.EFFETS_BDD_CACHE[m.id] || {}).Nom || "") === "Zone")
                    || (act.zoneHexes && act.zoneHexes.length > 0))) {
                toursEtalementDeLaCarte = Math.max(toursEtalementDeLaCarte, toursEtalement);
            }

            if (nomLower.includes("attaque") || nomLower.includes("pouvoir") || nomLower.includes("soin") || nomLower.includes("guérison") || isPurification || isShield) {
                let isHeal = nomLower.includes("soin") || nomLower.includes("guérison") || isPurification || isShield;
                // Les dégâts et les SOINS s'étalent ; un bouclier ou une purification, non —
                // ce ne sont pas des montants qui tombent sur la vie. La division se fait sur le
                // montant FINAL (après résistances, ou après ce que la cible fait d'un soin),
                // pas ici : diviser la valeur brute gonflerait le total à l'arrondi.
                const etalementActif = toursEtalement > 0 && !isShield && !isPurification;

                if (indexPremierAutreEffet === -1) indexPremierAutreEffet = idxAction;
                if (indexPremiereAttaque === -1) indexPremiereAttaque = idxAction;
                const typeRes = (nomLower.includes("magique") || nomLower.includes("pouvoir") || isHeal)
                    ? "Magique" : "Physique";
                // Atout de l'Ondari : ses sorts magiques portent une case plus loin,
                // dès lors qu'un cran de Distance est posé dessus.
                // rangeMax porte déjà ce que l'arme apporte (window.porteeAvecArme,
                // plus haut) : il ne reste que l'atout de l'Ondari.
                const porteeReelle = rangeMax + window.bonusPorteeMagique(
                    lanceurCarte, typeRes === "Magique", isRanged);

                // LE BOUCLIER EST UN POURCENTAGE, PAS UN NOMBRE DE POINTS. Sa
                // « Valeur » dans le grimoire est la part des PV RESTANTS de la
                // cible qu'il couvre, par cran (« Créer un bouclier de X % des
                // pv restants »), plafonnée par son « Pourcentage max ». Le
                // moteur la lisait comme des points : 30 de bouclier, quelle
                // que soit la cible. Le calcul se fait à la résolution, sur les
                // PV de la cible à cet instant (moteur_pur.js).
                let pourcentPV = 0;
                if (isShield) {
                    pourcentPV = (parseFrFloat(effBase.Valeur) || 0) * (act.count || 1);
                    const plafond = parseFrFloat(effBase.Pourcent_Max);
                    if (plafond > 0) pourcentPV = Math.min(pourcentPV, plafond);
                }

                attaquesExtraites.push({
                    nom: effBase.Nom,
                    typeRes: typeRes,
                    // La Valeur d'une Purification est un nombre d'états, pas
                    // des points de vie : elle ne soigne rien.
                    valeurBrute: nomLower.includes("purification")
                        ? 0 : (parseFrFloat(effBase.Valeur) || 0) * (act.count || 1),
                    pourcentPV: pourcentPV,
                    isRanged: isRanged,
                    rangeMax: porteeReelle,
                    isHeal: isHeal,
                    isShield: isShield,
                    purifChance: purifChance,
                    purifNombre: purifNombre,
                    estEtalement: etalementActif,
                    toursEtalement: etalementActif ? toursEtalement : 0,
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
                    desc: "-30% Esquive/Parade, 20% de chance d'échec d'attaque.",
                    chance: stunChance,
                    duree: stunDuree,
                    isRanged: isRanged,
                    rangeMax: rangeMax,
                    cibles: []
                });
            }

            // 🔻 NOUVEAU : DÉTECTION IMMOBILISATION 🔻
            // État persistant classique (comme Étourdi), mais durée FIXE de 2 tours : contrairement
            // à Étourdi, on ignore volontairement tout bonus de durée (act.baseDuree/modsDuree) —
            // la Forge masque de toute façon le bouton ⏳ pour cet effet, mais on se protège aussi
            // ici au cas où. Pas de cumul : la fusion par nom dans la boucle d'altérations (déjà en
            // place pour tous les états) prend simplement le max des deux durées, jamais l'addition.
            let isImmobilisation = false;
            let immobilisationChance = 0;

            if (nomLower.includes("immobil")) {
                isImmobilisation = true;
                immobilisationChance += (parseFrFloat(effBase.Pourcent_Base) || 0) * (act.count || 1);
            }

            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (modEff && (modEff.Nom || "").toLowerCase().includes("immobil")) {
                    isImmobilisation = true;
                    immobilisationChance += (parseFrFloat(modEff.Pourcent_Base) || 0) * m.count;
                }
            });

            if (isImmobilisation) {
                if (immobilisationChance > 40) immobilisationChance = 40; // Cap à 40%

                if (indexPremierAutreEffet === -1) indexPremierAutreEffet = idxAction;
                alterationsExtraites.push({
                    nom: "Immobilisation",
                    icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1788081285/IMG_2076_vze0an.png",
                    desc: "Ne peut plus se déplacer volontairement, gagne 20 fatigue par tour immobilisé.",
                    chance: immobilisationChance,
                    duree: 2, // Fixe, jamais modifiable par un bonus de durée
                    isRanged: isRanged,
                    rangeMax: rangeMax,
                    cibles: []
                });
            }

            // 🔻 NOUVEAU : DÉTECTION CONFUSION 🔻
            // État persistant classique (comme Étourdi), avec le même bonus de durée standard
            // (act.baseDuree/modsDuree, +1 par Durée+). Ici on ne fait que détecter l'effet et
            // calculer sa chance/durée : le jet "auto-cible / cible au hasard / dissipée" se joue
            // une seule fois pour toute la carte au moment de la résoudre (voir declencherResolution).
            let isConfusion = false;
            let confusionChance = 0;
            let confusionDuree = 0;

            if (estEtatConfusion(effBase)) {
                isConfusion = true;
                confusionChance += parseFrFloat(effBase.Pourcent_Base) * (act.count || 1);
                const bonus = parseFrFloat(act.baseDuree);
                const d = parseFrFloat(effBase.Tours) + bonus;
                if (d > confusionDuree) confusionDuree = d;
            }

            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (!estEtatConfusion(modEff)) return;

                isConfusion = true;
                const baseChance = parseFrFloat(modEff.Pourcent_Base) || parseFrFloat(modEff.Pourcent_Max);
                confusionChance += baseChance * m.count;

                const bonus = parseFrFloat(modsDuree[m.id]);
                const d = parseFrFloat(modEff.Tours) + bonus;
                if (d > confusionDuree) confusionDuree = d;
            });

            if (isConfusion) {
                if (confusionChance > 40) confusionChance = 40; // Cap à 40%
                if (confusionDuree <= 0) confusionDuree = 2; // Sécurité si la BDD n'a pas de durée

                if (indexPremierAutreEffet === -1) indexPremierAutreEffet = idxAction;
                alterationsExtraites.push({
                    nom: "Confusion",
                    icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1788081823/IMG_2078_mi79mz.png",
                    desc: "20% de s'infliger sa propre compétence, 20% de cibler au hasard à portée, 10% de dissiper la confusion.",
                    chance: confusionChance,
                    duree: confusionDuree,
                    isRanged: isRanged,
                    rangeMax: rangeMax,
                    cibles: []
                });
            }

            // LA PARALYSIE A ÉTÉ RETIRÉE DU JEU (demande de Nico). Elle bloquait
            // tout — mouvement ET technique — pendant quatre tours : trop long,
            // et un joueur privé de son tour n'a plus de jeu du tout. Son effet
            // a disparu de la base ; il n'y a donc plus rien à extraire ici.

            // 🔻 NOUVEAU : DÉTECTION EMPOISONNEMENT 🔻
            // Doit toujours accompagner une attaque à dégâts quelque part sur la carte (voir
            // verrouillage en Forge) : c'est cette attaque qui détermine le type de dégât du
            // poison, résolu plus tard dans jouerAnimationMoteur (via state.attaques[0]). Chance
            // cumulable comme les autres états (10%/action, cap 70%), durée fixe de 2 tours,
            // jamais prolongeable. Deux tics fixes de 15 fatigue + 8% des PV max chacun : un
            // immédiat à l'application, un au début du tour suivant (voir la transition de round).
            let isPoison = nomLower.includes("poison");
            let poisonChance = 0;
            if (isPoison) {
                poisonChance += (parseFrFloat(effBase.Pourcent_Base) || 0) * (act.count || 1);
            }
            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (modEff && (modEff.Nom || "").toLowerCase().includes("poison")) {
                    isPoison = true;
                    poisonChance += (parseFrFloat(modEff.Pourcent_Base) || 0) * m.count;
                }
            });

            if (isPoison) {
                if (poisonChance > 70) poisonChance = 70; // Cap à 70%
                if (indexPremierAutreEffet === -1) indexPremierAutreEffet = idxAction;
                alterationsExtraites.push({
                    nom: "Empoisonnement",
                    icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1788096401/IMG_2083_pebnup.png",
                    desc: "15 fatigue et 8% des PV max perdus immédiatement, puis à nouveau au début du tour suivant. Pas de cumul.",
                    chance: poisonChance,
                    duree: 2,
                    isRanged: isRanged,
                    rangeMax: rangeMax,
                    cibles: [],
                    estPoison: true,
                    estDot: true, // Bloque l'Étalement des dégâts : pas deux DoT sur la même cible
                    tickFait: false
                });
            }

            // 🔻 NOUVEAU : DÉTECTION BRÛLURE 🔻
            // État persistant classique (comme Étourdi/Confusion) : chance cumulable (10%/action,
            // cap 60%), durée de base 2 tours + bonus Durée+ normal (act.baseDuree/modsDuree).
            // Pas de dégâts propres : -50% sur les soins reçus tant que l'état est actif (voir la
            // branche SOINS de jouerAnimationMoteur).
            let isBrule = false;
            let bruleChance = 0;
            let bruleDuree = 0;

            if (nomLower.includes("brûl") || nomLower.includes("brul")) {
                isBrule = true;
                bruleChance += parseFrFloat(effBase.Pourcent_Base) * (act.count || 1);
                const bonus = parseFrFloat(act.baseDuree);
                const d = parseFrFloat(effBase.Tours) + bonus;
                if (d > bruleDuree) bruleDuree = d;
            }

            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                const modNomLower = (modEff && modEff.Nom || "").toLowerCase();
                if (!modEff || !(modNomLower.includes("brûl") || modNomLower.includes("brul"))) return;

                isBrule = true;
                const baseChance = parseFrFloat(modEff.Pourcent_Base) || parseFrFloat(modEff.Pourcent_Max);
                bruleChance += baseChance * m.count;

                const bonus = parseFrFloat(modsDuree[m.id]);
                const d = parseFrFloat(modEff.Tours) + bonus;
                if (d > bruleDuree) bruleDuree = d;
            });

            if (isBrule) {
                if (bruleChance > 60) bruleChance = 60; // Cap à 60%
                if (bruleDuree <= 0) bruleDuree = 2; // Sécurité si la BDD n'a pas de durée

                if (indexPremierAutreEffet === -1) indexPremierAutreEffet = idxAction;
                alterationsExtraites.push({
                    nom: "Brûlé",
                    icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1788181101/IMG_2087_q6chof.png",
                    desc: "-50% de soins reçus, et 3 dégâts à chaque fin de manche tant que la brûlure dure.",
                    chance: bruleChance,
                    duree: bruleDuree,
                    isRanged: isRanged,
                    rangeMax: rangeMax,
                    cibles: []
                });
            }

            // 🔻 NOUVEAU : DÉTECTION GLACÉ 🔻
            // Même formule que Brûlé (10%/action, cap 60%, durée de base 2 tours + bonus Durée+).
            // Pas de dégâts propres : double le coût en fatigue du mouvement à pied tant que
            // l'état est actif (voir estGlace dans ajouterEtapeMouvement, mouvement.js).
            let isGlace = false;
            let glaceChance = 0;
            let glaceDuree = 0;

            if (nomLower.includes("glac")) {
                isGlace = true;
                glaceChance += parseFrFloat(effBase.Pourcent_Base) * (act.count || 1);
                const bonus = parseFrFloat(act.baseDuree);
                const d = parseFrFloat(effBase.Tours) + bonus;
                if (d > glaceDuree) glaceDuree = d;
            }

            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                const modNomLower = (modEff && modEff.Nom || "").toLowerCase();
                if (!modEff || !modNomLower.includes("glac")) return;

                isGlace = true;
                const baseChance = parseFrFloat(modEff.Pourcent_Base) || parseFrFloat(modEff.Pourcent_Max);
                glaceChance += baseChance * m.count;

                const bonus = parseFrFloat(modsDuree[m.id]);
                const d = parseFrFloat(modEff.Tours) + bonus;
                if (d > glaceDuree) glaceDuree = d;
            });

            if (isGlace) {
                if (glaceChance > 60) glaceChance = 60; // Cap à 60%
                if (glaceDuree <= 0) glaceDuree = 2; // Sécurité si la BDD n'a pas de durée

                if (indexPremierAutreEffet === -1) indexPremierAutreEffet = idxAction;
                alterationsExtraites.push({
                    nom: "Glacé",
                    icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1788181888/IMG_2089_isgcrs.png",
                    desc: "Coût en fatigue du mouvement doublé, et 20% de dégâts subis en plus.",
                    chance: glaceChance,
                    duree: glaceDuree,
                    isRanged: isRanged,
                    rangeMax: rangeMax,
                    cibles: []
                });
            }

            // 🔻 NOUVEAU : DÉTECTION ÉLECTRIFIÉ 🔻
            // Même formule que Brûlé/Glacé (10%/action, cap 60%, durée de base 2 tours + bonus
            // Durée+). Consommé en un seul jet : la TOUTE PROCHAINE carte jouée par la cible
            // électrifiée perd 35 en initiative (voir jouerCarteCombat, combat.js), puis l'état
            // disparaît immédiatement, que la durée soit écoulée ou non.
            let isElectrifie = false;
            let electrifieChance = 0;
            let electrifieDuree = 0;

            if (nomLower.includes("électrif") || nomLower.includes("electrif")) {
                isElectrifie = true;
                electrifieChance += parseFrFloat(effBase.Pourcent_Base) * (act.count || 1);
                const bonus = parseFrFloat(act.baseDuree);
                const d = parseFrFloat(effBase.Tours) + bonus;
                if (d > electrifieDuree) electrifieDuree = d;
            }

            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                const modNomLower = (modEff && modEff.Nom || "").toLowerCase();
                if (!modEff || !(modNomLower.includes("électrif") || modNomLower.includes("electrif"))) return;

                isElectrifie = true;
                const baseChance = parseFrFloat(modEff.Pourcent_Base) || parseFrFloat(modEff.Pourcent_Max);
                electrifieChance += baseChance * m.count;

                const bonus = parseFrFloat(modsDuree[m.id]);
                const d = parseFrFloat(modEff.Tours) + bonus;
                if (d > electrifieDuree) electrifieDuree = d;
            });

            if (isElectrifie) {
                if (electrifieChance > 60) electrifieChance = 60; // Cap à 60%
                if (electrifieDuree <= 0) electrifieDuree = 2; // Sécurité si la BDD n'a pas de durée

                if (indexPremierAutreEffet === -1) indexPremierAutreEffet = idxAction;
                alterationsExtraites.push({
                    nom: "Électrifié",
                    icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1788088220/IMG_2081_p5xenm.png",
                    desc: "La prochaine carte jouée perd 35 en initiative, puis l'état disparaît. Subit 20% de dégâts magiques en plus.",
                    chance: electrifieChance,
                    duree: electrifieDuree,
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
                // Plafond de chance : celui du grimoire (Pourcentage max), que la
                // Forge affiche aussi ; 50 % si la base n'en donne pas. La distance,
                // elle, reste de 2 cases quel que soit le nombre de points.
                const effPoussee = Object.values(window.EFFETS_BDD_CACHE || {})
                    .find(x => x && (x.Nom || "").toLowerCase().includes("pouss"));
                const plafondPoussee = effPoussee ? parseFrFloat(effPoussee.Pourcent_Max) : 0;
                pousseeChance = Math.min(pousseeChance, plafondPoussee > 0 ? Math.min(100, plafondPoussee) : 50);

                if (indexPremierAutreEffet === -1) indexPremierAutreEffet = idxAction;
                alterationsExtraites.push({
                    nom: "Poussée",
                    icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png",
                    desc: `${pousseeChance}% de chance de repousser la cible de 2 cases en ligne droite, `
                        + `dont 15% de la bousculer (-20% d'énergie).`,
                    chance: pousseeChance,
                    duree: 0, // Instantané : jamais ajouté à Etats_Alteres
                    isRanged: isRanged,
                    rangeMax: rangeMax,
                    cibles: [],
                    estPoussee: true
                });
            }

            // 🔻 NOUVEAU : DÉTECTION TRACTION 🔻
            // Chance de tirer la cible de 3 cases vers le lanceur (l'inverse de la Poussée). Porte
            // la portée NORMALE de la carte (1 par défaut, comme un contact), qui s'étend avec le
            // mod "Distance" tout à fait normalement — plus de portée fixe imposée, c'est au joueur
            // de la poser lui-même s'il veut tirer une cible de loin. Pas un état persistant :
            // résolue et diffusée à part comme la Poussée (même animation, sens inverse), voir
            // declencherTractionCible / jouerAnimationPoussee.
            let isTraction = false;
            let tractionChance = 0;

            if (nomLower.includes("traction")) {
                isTraction = true;
                tractionChance += (parseFrFloat(effBase.Pourcent_Base) || 0) * (act.count || 1);
            }

            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (modEff && (modEff.Nom || "").toLowerCase().includes("traction")) {
                    isTraction = true;
                    tractionChance += (parseFrFloat(modEff.Pourcent_Base) || 0) * m.count;
                }
            });

            if (isTraction) {
                if (tractionChance > 60) tractionChance = 60; // Cap à 60%

                if (indexPremierAutreEffet === -1) indexPremierAutreEffet = idxAction;
                indexTraction = idxAction;
                alterationsExtraites.push({
                    nom: "Traction",
                    icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png",
                    desc: `${tractionChance}% de chance de tirer la cible de 3 cases vers soi.`,
                    chance: tractionChance,
                    duree: 0, // Instantané : jamais ajouté à Etats_Alteres
                    isRanged: isRanged,
                    rangeMax: rangeMax,
                    cibles: [],
                    estTraction: true
                });
            }

            // 🔻 NOUVEAU : DÉTECTION PEUR 🔻
            // Chance de faire fuir la cible de 4 cases dans un sens aléatoire, en s'éloignant
            // toujours du lanceur (jamais de ligne droite imposée comme la Poussée). Pas un état
            // persistant. Déclenche les attaques d'opportunité de tous les ennemis quittés SAUF
            // celle du lanceur (c'est lui qui fait peur, il n'en profite pas d'un coup en plus).
            // Coûte de la fatigue à la cible (comme un déplacement normal), contrairement à
            // Poussée/Traction qui sont gratuites. Voir declencherPeurCible / jouerAnimationPeur.
            let isPeur = false;
            let peurChance = 0;

            if (nomLower.includes("peur")) {
                isPeur = true;
                peurChance += (parseFrFloat(effBase.Pourcent_Base) || 0) * (act.count || 1);
            }

            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (modEff && (modEff.Nom || "").toLowerCase().includes("peur")) {
                    isPeur = true;
                    peurChance += (parseFrFloat(modEff.Pourcent_Base) || 0) * m.count;
                }
            });

            if (isPeur) {
                if (peurChance > 60) peurChance = 60; // Cap à 60%

                if (indexPremierAutreEffet === -1) indexPremierAutreEffet = idxAction;
                alterationsExtraites.push({
                    nom: "Peur",
                    icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png",
                    desc: `${peurChance}% de chance de faire fuir la cible de 4 cases.`,
                    chance: peurChance,
                    duree: 0, // Instantané : jamais ajouté à Etats_Alteres
                    isRanged: isRanged,
                    rangeMax: rangeMax,
                    cibles: [],
                    estPeur: true
                });
            }

            // 🔻 NOUVEAU : DÉTECTION PROVOCATION 🔻
            // État persistant classique (comme Étourdi/Immobilisation), durée fixe de 2 tours.
            // Oblige la cible à n'attaquer QUE le lanceur tant que l'état dure (lu par l'IA des
            // monstres dans choisirCible, ia_pure.js). L'idProvocateur est fixé UNE FOIS
            // ici, au moment où la carte est composée : c'est lui que l'IA compare à ses candidats.
            // Interdite aux monstres eux-mêmes (⚖️ règle Forge répercutée dans
            // monstres_competences.js) : seuls les joueurs peuvent la lancer.
            let isProvocation = false;
            let provocationChance = 0;

            if (nomLower.includes("provocation")) {
                isProvocation = true;
                provocationChance += (parseFrFloat(effBase.Pourcent_Base) || 0) * (act.count || 1);
            }

            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (modEff && (modEff.Nom || "").toLowerCase().includes("provocation")) {
                    isProvocation = true;
                    provocationChance += (parseFrFloat(modEff.Pourcent_Base) || 0) * m.count;
                }
            });

            if (isProvocation) {
                if (provocationChance > 40) provocationChance = 40; // Cap à 40%

                if (indexPremierAutreEffet === -1) indexPremierAutreEffet = idxAction;
                alterationsExtraites.push({
                    nom: "Provocation",
                    icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png",
                    desc: "Ne peut viser que celui qui l'a provoqué tant que l'état dure.",
                    chance: provocationChance,
                    duree: 2, // Fixe, jamais modifiable par un bonus de durée
                    isRanged: isRanged,
                    rangeMax: rangeMax,
                    cibles: [],
                    idProvocateur: lanceurCarte.idPersonnage
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

            // Le plafond est celui du grimoire (« Pourcentage max »), jamais
            // plus de 100 % de toute façon.
            const plafondDe = (nom) => {
                const e = Object.values(window.EFFETS_BDD_CACHE || {})
                    .find(x => x && (x.Nom || "").toLowerCase().includes(nom));
                const p = e ? parseFrFloat(e.Pourcent_Max) : 0;
                return p > 0 ? Math.min(100, p) : 100;
            };

            if (isAbsorption) {
                absorptionValeur = Math.min(absorptionValeur, plafondDe("absorption"));

                if (indexPremierAutreEffet === -1) indexPremierAutreEffet = idxAction;
                alterationsExtraites.push({
                    nom: "Absorption",
                    icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png", // NOTE: Remplace par le lien d'une belle icône Cloudinary !
                    desc: `Annule ${absorptionValeur}% des dégâts magiques subis et soigne de 10% de la frappe.`,
                    chance: 100, // Toujours 100% d'application pour un buff
                    duree: 1, // Dure uniquement le tour en cours !
                    valeurAbs: absorptionValeur,
                    isRanged: isRanged,
                    rangeMax: rangeMax,
                    isHeal: true, // ✅ IMPORTANT : Permet de cibler un allié ou soi-même
                    cibles: []
                });
            }

            // CONTRE — le pendant physique de l'Absorption. Il n'existait nulle
            // part dans le moteur : une carte « Contre » ne faisait rien. Il
            // annule sa part des dégâts PHYSIQUES reçus, et renvoie 10 % de la
            // frappe à celui qui l'a portée (moteur_pur.js, chaineDeDegats).
            let isContre = false;
            let contreValeur = 0;
            const estContre = (nom) => (nom || "").toLowerCase().trim() === "contre";
            if (estContre(effBase.Nom)) {
                isContre = true;
                contreValeur += (parseFrFloat(effBase.Valeur) || 20) * (act.count || 1);
            }
            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (modEff && estContre(modEff.Nom)) {
                    isContre = true;
                    contreValeur += (parseFrFloat(modEff.Valeur) || 20) * m.count;
                }
            });
            if (isContre) {
                contreValeur = Math.min(contreValeur, plafondDe("contre"));
                if (indexPremierAutreEffet === -1) indexPremierAutreEffet = idxAction;
                alterationsExtraites.push({
                    nom: "Contre",
                    icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png",
                    desc: `Annule ${contreValeur}% des dégâts physiques subis et renvoie 10% de la frappe à l'attaquant.`,
                    chance: 100,
                    duree: 1,
                    valeurContre: contreValeur,
                    isRanged: isRanged,
                    rangeMax: rangeMax,
                    isHeal: true, // se pose sur soi ou un allié, comme l'Absorption
                    cibles: []
                });
            }
        };
        dataCarte.Composants.actions.forEach((act, idxAction) => {
            const avantA = attaquesExtraites.length, avantAlt = alterationsExtraites.length;
            lireAction(act, idxAction);
            const enZone = !!(act.zoneHexes && act.zoneHexes.length > 0);
            attaquesExtraites.slice(avantA).forEach(a => { a.enZone = enZone; });
            alterationsExtraites.slice(avantAlt).forEach(a => { a.enZone = enZone; });
        });
    }

    // Bond : résolu à part (choix de la case, animation). On respecte l'ordre de la carte :
    // si le Bond est avant le premier autre effet (ou qu'il n'y a rien d'autre), il se joue
    // maintenant ; s'il est après une attaque/altération, on le reporte après leur résolution
    // (voir declencherResolutionAvecBondEventuel plus bas). Dans tous les cas la carte reste
    // consommée, saut annulé ou pas.
    // L'étalement posé sur la Distance ou la Zone gagne tous les dégâts et soins
    // de la carte (jamais un bouclier, une purification, ni un état).
    if (toursEtalementDeLaCarte > 0) {
        attaquesExtraites.forEach(a => {
            if (a.isShield || a.purifChance > 0) return;
            a.estEtalement = true;
            a.toursEtalement = Math.max(a.toursEtalement || 0, toursEtalementDeLaCarte);
        });
    }

    const idLanceurBond = (persoLanceur || {}).idPersonnage;
    const bondEnPremier = isBond && (indexPremierAutreEffet === -1 || indexBond < indexPremierAutreEffet);
    const bondApresLeReste = isBond && !bondEnPremier;

    // EXTRAIRE NE DOIT JAMAIS OUVRIR UN CIBLAGE. `{ extraire: true }` sert à
    // regime_cerveau.js (preparerLesCartes) pour lire la STRUCTURE d'une
    // carte de créature à l'avance, en arrière-plan, bien avant que ce soit
    // son tour — jamais pour la jouer. resoudreBondInteractif, lui, assombrit
    // l'écran et ATTEND UN CLIC : appelé ici, il attendait un clic qui ne
    // viendrait jamais, et `preparerLesCartes` (une boucle `for…await`)
    // restait pendue dessus pour de bon — non seulement cette créature ne
    // recevait jamais sa carte, mais AUCUNE créature suivante dans la liste
    // n'en recevait une non plus, le tour entier suivant restant bloqué. Un
    // Bond en tête de carte est un cas parmi d'autres, comme une Paralysie ou
    // une technique sans effet : « pas de carte jouable ce tour-ci », pas un
    // blocage pour tout le monde.
    let arriveeBond = null;
    if (bondEnPremier) {
        if (extraireSeulement) return null;
        const saut = await window.resoudreBondInteractif(idLanceurBond, porteeBond);
        if (saut && typeof saut === "object" && saut.q !== undefined) arriveeBond = { q: saut.q, r: saut.r };
    }

    if (attaquesExtraites.length === 0 && alterationsExtraites.length === 0) {
        // Illusion seule sur la carte (ou dernière chose restante après le Bond) : elle se résout
        // ici, immédiatement, puisqu'il n'y a rien d'autre après elle.
        if (extraireSeulement) return null;   // rien à frapper : pas de carte
        if (isIllusion) {
            await window.resoudreIllusionInteractif(idLanceurBond, porteeIllusion);
        }
        // Un Repli seul sur la carte : on choisit quand même où se replier.
        let repliSeul = null;
        if (repliCarte) {
            const vers = await window.choisirCaseRepli(idLanceurBond, repliCarte.portee, arriveeBond);
            if (vers) repliSeul = { ...repliCarte, vers };
        }
        window.validerCarteCombat(idCarte, undefined, repliSeul ? { repli: repliSeul } : undefined);
        return;
    }

    // La phase de l'attaque dicte la portée et le placement de la zone : sur une
    // carte qui frappe ET soigne, c'est l'attaque qui se vise d'abord.
    const enDeuxTemps = window.soutienADiffere({ attaques: attaquesExtraites,
                                                 alterations: alterationsExtraites, isZone });
    const configSort = enDeuxTemps
        ? (attaquesExtraites.find(e => !e.isHeal) || alterationsExtraites.find(e => !e.isHeal))
        : (attaquesExtraites[0] || alterationsExtraites[0]);

    // La portée de la zone l'emporte sur celle de l'effet, quand elle est plus
    // longue. Pour une carte de zone, `rangeMax` ne sert QU'au placement — la
    // résolution ignore la portée (voir « if (!action.isZone && dist >
    // attaque.rangeMax) » dans jouerAnimationMoteur) —, donc la reporter ici ne
    // change rien d'autre que l'endroit où la zone peut se poser.
    //  Et si AUCUNE action portant la zone n'est à distance, mais qu'une autre
    //  action de la carte l'est, c'est la carte qui gagne : c'est ce que le
    //  joueur lit dessus, et c'est ce que l'aperçu lui montre.
    if (isZone && configSort && (zoneEstADistance || porteeDeLaCarte > 1)) {
        configSort.isRanged = true;
        configSort.rangeMax = Math.max(parseInt(configSort.rangeMax) || 1,
                                       zonePortee, porteeDeLaCarte);
    }

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

    // Après un Bond en tête de carte, le sort part de la case d'arrivée.
    const tkLanceur = arriveeBond || window.TOKENS_VTT_DATA[(persoLanceur || {}).idPersonnage] || { q: 0, r: 0 };

    // Traction impose sa propre portée (3, ligne de vue dégagée) à toute la carte, même si
    // l'attaque qui l'accompagne est en mêlée : comme les deux visent obligatoirement la même
    // cible unique, la portée effective de ciblage doit être au moins celle de Traction.
    const tractionAlt = alterationsExtraites.find(a => a.estTraction);
    const porteeMinTraction = tractionAlt ? tractionAlt.rangeMax : 0;
    // Si Traction est écrite avant la première attaque sur la carte, elle doit se résoudre avant
    // elle (on tire la cible avant de la frapper) au lieu de toujours s'appliquer après, comme le
    // fait une altération classique. Voir jouerAnimationMoteur qui lit ce drapeau.
    const tractionAvantAttaque = !!tractionAlt && (indexPremiereAttaque === -1 || indexTraction < indexPremiereAttaque);

    const carteConstruite = {
        actif: true,
        idCarte: idCarte,
        // LA CATÉGORIE D'ARME DE LA CARTE VOYAGE AVEC ELLE, pour la même raison
        // que son coût : au moment de la résolution, il n'y a plus de dataCarte
        // sous la main, et c'est pourtant là que l'équipement enrichit la carte.
        // Sans elle, une technique « Sans arme / Arme rp » reprendrait les
        // dégâts de l'épée qu'elle n'utilise pas (voir objets.js).
        armeDeLaCarte: dataCarte.Arme || "",
        // LE COÛT DE LA CARTE VOYAGE AVEC LA CARTE, et c'est tout le correctif.
        //
        // Il était lu dans window.COUT_COMPETENCE_SELECTIONNEE, une globale que
        // pose le clic sur la bannière d'une carte. Ça tenait tant que le
        // ciblage démarrait par « Appliquer », posé SUR la carte qu'on venait
        // de cliquer : les deux gestes se suivaient. Depuis que la carte part
        // du bouton fin de tour, en pleine résolution, il s'écoule toute une
        // phase de préparation entre les deux — et finDeTourCombat remet cette
        // globale à zéro à chaque tour clos. Le cerveau recevait donc
        // `coutFatigue: 0` et l'énergie ne descendait plus jamais.
        //
        // La fiche de la carte est là, à portée de main, depuis le début de
        // cette fonction. On la lit.
        coutFatigue: parseInt(dataCarte.Fatigue) || 0,
        // QUI LANCE, retenu au moment où le ciblage s'ouvre. Tout le moteur le
        // relit ensuite par lanceurDuCiblage : les anneaux, les portées, les
        // cibles, la résolution. Sans ce champ, chacun retombait sur le panneau
        // gauche — le combattant qu'on REGARDE — et un clic sur le portrait
        // d'un ennemi déplaçait l'origine du sort sur lui.
        idLanceur: (persoLanceur || {}).idPersonnage || null,
        // La case d'où part le sort quand un Bond vient de la changer
        // (null sinon : on lit alors le pion). Voir positionCiblage.
        origineLanceur: arriveeBond,
        attaques: attaquesExtraites,
        alterations: alterationsExtraites,
        cibleUnique: null,
        isZone: isZone,
        zoneHexesBase: zoneHexesBase,
        zoneCenterHex: isZone && configSort && !configSort.isRanged ? {q: tkLanceur.q, r: tkLanceur.r} : null,
        zoneRotationStep: 0,
        initialTwistAngle: 0,
        initialZoneStep: 0,
        bondApresAttaque: bondApresLeReste ? { idLanceur: idLanceurBond, portee: porteeBond } : null,
        porteeMinTraction: porteeMinTraction,
        tractionAvantAttaque: tractionAvantAttaque,
        illusionEnAttente: isIllusion ? { idLanceur: idLanceurBond, portee: porteeIllusion } : null,
        // { portee, chance } si la carte porte un Repli ; la case, elle, est
        // choisie au moment de résoudre (repliChoisi).
        repli: repliCarte,
        repliChoisi: null,
        persistanceTerrain: aPersistanceTerrain,
        zoneHexesFinaux: null,
        // Attaque ET soutien sur la même carte : deux phases de ciblage.
        phaseCiblage: "offensive",
        soutienDiffere: false
    };
    carteConstruite.soutienDiffere = window.soutienADiffere(carteConstruite);

    // ICI, ET NULLE PART AILLEURS. La carte est lue, ses effets sont extraits,
    // et rien n'a encore touché l'écran. C'est exactement ce que le cerveau
    // demande : la carte, sans le ciblage.
    if (extraireSeulement) return carteConstruite;

    // LE VOLET S'EFFACE DEVANT LE CIBLAGE. On va viser sur le plateau : la
    // lanière remonte d'elle-même, et le clic suivant sur la carte est un clic
    // de cible, pas une fermeture de volet.
    if (typeof window.fermerVoletCompetences === "function") window.fermerVoletCompetences();

    window.ETAT_CIBLAGE = carteConstruite;

    // LES PIONS SE REDESSINENT : c'est ce qui fait apparaître la croix rouge
    // sous le lanceur (combat.js, appliquerTokensVTT). Elle ne naît pas toute
    // seule — les pions ne se refont qu'à la demande.
    if (typeof window.appliquerTokensVTT === "function" && window.TOKENS_VTT_DATA) {
        window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    }

    if (configSort) window.surlignerEffetCarteActif(configSort.nom);

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

        // Zone à distance : on montre noir sur blanc où elle peut se poser. Sans ça
        // le joueur tâtonne, et la zone disparaît dès qu'il sort de la portée ou
        // de la ligne de vue sans qu'il sache pourquoi.
        if (configSort && configSort.isRanged) {
            const posables = window.casesPosablesZone(idLanceurBond, configSort);
            if (posables.length > 0) window.assombrirCasesJouables("svg-zone-assombrissement", posables);
        }

        window.addEventListener("mousemove", window.VTT_CIBLAGE_MOUSEMOVE, {capture: true});
        window.addEventListener("wheel", window.VTT_CIBLAGE_WHEEL, {passive: false, capture: true});
        window.addEventListener("click", window.VTT_CIBLAGE_CLICK, {capture: true});
        window.addEventListener("touchstart", window.VTT_CIBLAGE_TOUCHSTART, {capture: true, passive: false});
        window.addEventListener("touchmove", window.VTT_CIBLAGE_TOUCHMOVE, {capture: true, passive: false});

    } else {
        window.poserBoutonsCibleUnique(idCarte);
    }

    // Le ciblage est ouvert : le bouton fin de tour passe en « fin de tour » —
    // la seule chose qu'il propose encore est de renoncer à la carte.
    if (typeof window.actualiserBoutonFinTour === "function") window.actualiserBoutonFinTour();
    window.actualiserVisuelCiblage();
};

// RÉSOUDRE et ANNULER, posés sur l'aperçu de la carte : le ciblage d'une cible
// unique les ouvre, et la phase du soin (voir passerAuCiblageDuSoutien) aussi —
// même quand l'attaque, elle, s'est visée en zone et ne les avait pas posés.
window.poserBoutonsCibleUnique = function(idCarte) {
    // LES DEUX BOUTONS VIVENT SUR L'APERÇU DE LA CARTE, et cet aperçu naît
    // paresseusement (competences.js) : il peut ne pas être là. Il l'était
    // forcément du temps où l'on cliquait « Appliquer », qui était posé
    // dessus ; depuis que c'est le bouton fin de tour qui lance le ciblage,
    // plus rien ne le garantit. Un appendChild sur `null` levait alors une
    // exception EN PLEIN MILIEU du ciblage : l'état était posé, mais ni les
    // anneaux ni les boutons n'arrivaient — la carte ne partait jamais et
    // rien à l'écran ne disait pourquoi.
    const hoteBoutons = document.getElementById("apercu-carte-hd-competence");
    if (!hoteBoutons) {
        console.error("Ciblage : l'aperçu de la carte est absent, RÉSOUDRE et ANNULER n'ont nulle part où se poser.");
        if (typeof window.tracerCombat === "function") {
            window.tracerCombat("🧊", `ciblage sans aperçu de carte (${idCarte})`,
                                "RÉSOUDRE/ANNULER introuvables — la carte ne peut pas être résolue");
        }
    } else {
        let btnResoudre = document.getElementById("btn-resoudre-carte");
        if (!btnResoudre) {
            btnResoudre = document.createElement("div");
            btnResoudre.id = "btn-resoudre-carte";
            btnResoudre.style.cssText = "position: absolute; bottom: -30px; left: 50%; transform: translateX(10px); z-index: 5; font-family: 'Cinzel', serif; font-size: 16px; font-weight: bold; cursor: pointer; letter-spacing: 2px; text-transform: uppercase; text-shadow: 1px 1px 2px black, 0 0 10px #00ffff; color: #00ffff; transition: transform 0.2s;";
            btnResoudre.onmouseover = () => btnResoudre.style.transform = "translateX(10px) scale(1.1)";
            btnResoudre.onmouseout = () => btnResoudre.style.transform = "translateX(10px) scale(1)";
            hoteBoutons.appendChild(btnResoudre);
        }
        btnResoudre.innerText = "RÉSOUDRE";
        btnResoudre.style.pointerEvents = "auto";
        btnResoudre.onclick = () => window.declencherResolutionAvecBondEventuel();

        // Annuler le ciblage sans perdre son tour : la carte revient au repos et le
        // joueur peut continuer son déplacement, exactement comme le ✖ déjà offert
        // en mode zone (bulle-validation-zone, plus haut). À ne pas confondre avec
        // le bouton fin de tour, qui affiche « fin de tour » pendant le ciblage et
        // termine le tour pour de bon (voir combat.js, actionBoutonFinTour).
        let btnAnnuler = document.getElementById("btn-annuler-ciblage");
        if (!btnAnnuler) {
            btnAnnuler = document.createElement("div");
            btnAnnuler.id = "btn-annuler-ciblage";
            btnAnnuler.style.cssText = "position: absolute; bottom: -30px; left: 50%; transform: translateX(calc(-100% - 10px)); z-index: 5; font-family: 'Cinzel', serif; font-size: 16px; font-weight: bold; cursor: pointer; letter-spacing: 2px; text-transform: uppercase; text-shadow: 1px 1px 2px black, 0 0 10px #ff4c4c; color: #ff4c4c; transition: transform 0.2s;";
            btnAnnuler.onmouseover = () => btnAnnuler.style.transform = "translateX(calc(-100% - 10px)) scale(1.1)";
            btnAnnuler.onmouseout = () => btnAnnuler.style.transform = "translateX(calc(-100% - 10px)) scale(1)";
            hoteBoutons.appendChild(btnAnnuler);
        }
        btnAnnuler.innerText = "ANNULER";
        btnAnnuler.style.pointerEvents = "auto";
        btnAnnuler.onclick = () => window.nettoyerCiblage();
    }
};

// LA SECONDE PHASE : LE SOUTIEN SE VISE À PART. Appelée juste avant de
// résoudre ; si la carte porte un soin (ou un bouclier, une absorption) resté
// sans cible pendant l'attaque, on démonte le ciblage de l'attaque — zone
// comprise — et on ouvre celui du soin : soi-même ou un allié. Le lanceur est
// présélectionné (un tap sur ✔ se soigne soi-même), un tap sur un allié
// change la cible. Rend `true` si la phase s'est ouverte : la résolution
// attend alors le prochain ✔.
window.passerAuCiblageDuSoutien = function() {
    const state = window.ETAT_CIBLAGE;
    if (!state || !state.actif || !state.soutienDiffere || state.phaseCiblage === "soutien") return false;

    state.phaseCiblage = "soutien";
    state.cibleUnique = null;

    // Le ciblage de zone s'efface : son dessin, son voile, son message, ses
    // écoutes. Ce qui a été touché par la zone, lui, reste retenu.
    if (state.isZone) {
        const svgZone = document.getElementById("svg-zone-ciblage");
        if (svgZone) svgZone.remove();
        window.retirerAssombrissement("svg-zone-assombrissement");
        const msgZone = document.getElementById("msg-zone-ciblage");
        if (msgZone) msgZone.remove();
        const bulleZone = document.getElementById("bulle-validation-zone");
        if (bulleZone) bulleZone.style.display = "none";
        window.removeEventListener("mousemove", window.VTT_CIBLAGE_MOUSEMOVE, {capture: true});
        window.removeEventListener("wheel", window.VTT_CIBLAGE_WHEEL, {capture: true});
        window.removeEventListener("click", window.VTT_CIBLAGE_CLICK, {capture: true});
        window.removeEventListener("touchstart", window.VTT_CIBLAGE_TOUCHSTART, {capture: true, passive: false});
        window.removeEventListener("touchmove", window.VTT_CIBLAGE_TOUCHMOVE, {capture: true, passive: false});
    }
    document.querySelectorAll(".anneau-ciblage, .bulle-validation-cible, .jauge-cible-ciblage").forEach(el => el.remove());

    window.poserBoutonsCibleUnique(state.idCarte);
    const config = window.configCiblage(state);
    if (config) window.surlignerEffetCarteActif(config.nom);

    const hote = document.getElementById("conteneur-plateau-vtt");
    if (hote) {
        let msg = document.getElementById("msg-ciblage-soutien");
        if (!msg) {
            msg = document.createElement("div");
            msg.id = "msg-ciblage-soutien";
            msg.style.cssText = "position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 1000; font-family: 'Cinzel', serif; font-size: 18px; color: #7bd66a; font-weight: bold; text-shadow: 1px 1px 3px black, 0 0 10px #1b6e3a; background: rgba(0,0,0,0.8); padding: 10px 20px; border-radius: 12px; pointer-events: none; text-align: center;";
            hote.appendChild(msg);
        }
        msg.innerText = "Qui reçoit le soin ? Toi-même ou un allié.";
    }

    // Le lanceur d'abord : c'est le cas le plus courant, un seul tap le confirme.
    const idLanceur = state.idLanceur || window.lanceurDuCiblage();
    if (idLanceur) {
        state.cibleUnique = idLanceur;
        const phase = window.effetsDeLaPhase(state);
        phase.attaques.forEach(a => a.cibles = [idLanceur]);
        phase.alterations.forEach(alt => alt.cibles = [idLanceur]);
    }
    if (typeof window.actualiserBoutonFinTour === "function") window.actualiserBoutonFinTour();
    window.actualiserVisuelCiblage();
    return true;
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

    // Mémorisé pour la Persistance de terrain : c'est exactement l'emprise que gardera la zone
    // résiduelle, sans avoir à refaire le calcul de rotation ailleurs.
    state.zoneHexesFinaux = finalHexes;

    const idLanceur = window.lanceurDuCiblage();
    const configSort = window.configCiblage(state);
    const lanceurData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idLanceur);
    const phase = window.effetsDeLaPhase(state);

    // Une Illusion encaisse les dégâts (même en zone) mais reste insensible à tout le reste.
    const carteEstAttaqueSimple = !!configSort && !configSort.isHeal && !configSort.isShield
        && phase.alterations.length === 0 && phase.attaques.every(a => !a.isHeal);

    // DEUX LISTES, UNE PAR SORTE D'EFFET. Ce qui frappe touche tout ce que la
    // zone couvre, sauf le lanceur ; ce qui soutient (soin, bouclier,
    // absorption) ne touche que son camp, lanceur compris. Une zone qui frappe
    // ET soigne blesse donc les ennemis et soigne les alliés — elle ne soigne
    // plus jamais un ennemi parce que l'attaque passait en premier.
    const touchesFrappe = [], touchesSoutien = [];
    for (let idToken in window.TOKENS_VTT_DATA) {
        const cibleData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idToken);
        if (!cibleData || cibleData.statut === "Mort") continue;

        const tk = window.positionCiblage(idToken);
        if (!tk || !finalHexes.some(h => h.q === tk.q && h.r === tk.r)) continue;

        if (cibleData.camp === lanceurData.camp && !cibleData.estIllusion) touchesSoutien.push(idToken);
        if (idToken !== idLanceur && (!cibleData.estIllusion || carteEstAttaqueSimple)) touchesFrappe.push(idToken);
    }

    const ciblesPour = (e) => e.isHeal ? [...touchesSoutien] : [...touchesFrappe];
    phase.attaques.forEach(a => a.cibles = ciblesPour(a));
    phase.alterations.forEach(alt => alt.cibles = ciblesPour(alt));
    window.declencherResolutionAvecBondEventuel();
};

window.actualiserVisuelCiblage = function() {
    if (!window.ETAT_CIBLAGE || !window.ETAT_CIBLAGE.actif) return;
    // Pendant qu'une créature CALCULE son tour, viser ne se voit pas : le
    // spectacle appartient à la relecture du journal, à son tour de jouer.
    if (window.CALCUL_IA_SILENCIEUX) return;
    if (window.ETAT_CIBLAGE.isZone && window.ETAT_CIBLAGE.phaseCiblage !== "soutien") window.dessinerZoneAoE();
    else window.dessinerAnneauxCiblage();
};

window.dessinerZoneAoE = function() {
    if (window.CALCUL_IA_SILENCIEUX) return;
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

    const configSort = window.configCiblage(state);
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

// La petite jauge de vie sous une cible potentielle : elle dit d'un coup d'œil
// s'il reste de quoi l'achever, ou s'il vaut mieux viser ailleurs. Même dessin
// que la jauge qui apparaît quand un coup porte, mais celle-ci reste affichée
// tant qu'on choisit sa cible.
function dessinerJaugeCible(divToken, cibleData) {
    const pvMax = (parseInt(cibleData.PV_Max) || 0) + (parseInt(cibleData.Dev_Mod_PV) || 0);
    if (pvMax <= 0) return;
    const pv = cibleData.PV_Actuels !== undefined ? parseInt(cibleData.PV_Actuels) : pvMax;
    const pct = Math.max(0, Math.min(100, (pv / pvMax) * 100));

    let jauge = divToken.querySelector(".jauge-cible-ciblage");
    if (!jauge) {
        // Enveloppe SANS "overflow:hidden" : le chiffre des points de vie est posé
        // au-dessus de la barre, donc en dehors de ses limites. S'il était placé dans
        // l'élément qui découpe le remplissage, il serait purement et simplement rogné.
        jauge = document.createElement("div");
        jauge.className = "jauge-cible-ciblage";
        jauge.style.cssText = "position:absolute; bottom:-12px; left:50%; transform:translateX(-50%);"
            + " width:75%; height:6px; z-index:20; pointer-events:none;";
        jauge.innerHTML = `<div class="fond-jauge-cible" style="position:absolute; inset:0;`
            + ` background-color:#111; border:1px solid #c2a878; border-radius:3px;`
            + ` overflow:hidden; box-shadow:0 2px 4px rgba(0,0,0,0.8);">`
            + `<div class="remplissage-jauge-cible" style="height:100%; width:100%;`
            + ` background:linear-gradient(to right, #e63946, #ff8b8b); transition:width 0.3s ease;"></div>`
            + `</div>`
            + `<div class="texte-jauge-cible" style="position:absolute; bottom:9px; left:50%;`
            + ` transform:translateX(-50%); font-family:'Cinzel', serif; font-size:11px; font-weight:bold;`
            + ` color:#ffffff; text-shadow:0 0 3px black, 0 0 5px black, 1px 1px 2px black; white-space:nowrap;`
            + ` line-height:1;"></div>`;
        divToken.appendChild(jauge);
    }
    jauge.querySelector(".remplissage-jauge-cible").style.width = pct + "%";
    jauge.querySelector(".texte-jauge-cible").innerText = pv + " / " + pvMax;
}

window.dessinerAnneauxCiblage = function() {
    // Une créature qui calcule son tour ne montre pas sa visée : cette
    // animation-là se joue au moment du tour, pas avant.
    if (window.CALCUL_IA_SILENCIEUX) return;
    if (!window.ETAT_CIBLAGE || !window.ETAT_CIBLAGE.actif) {
        document.querySelectorAll(".anneau-ciblage, .bulle-validation-cible, .jauge-cible-ciblage").forEach(el => el.remove());
        return;
    }

    const configSort = window.configCiblage(window.ETAT_CIBLAGE);
    if (!configSort) return;
    const phase = window.effetsDeLaPhase(window.ETAT_CIBLAGE);

    const idLanceur = window.lanceurDuCiblage();
    const tkLanceur = window.positionCiblage(idLanceur);
    const lanceurData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idLanceur);

    if (!tkLanceur || !lanceurData) return;

    // Une Illusion encaisse les dégâts (même en zone) mais reste insensible à tout le reste : ni
    // soin, ni bouclier, ni aucune autre altération accrochée à la carte (Poussée, Traction, Peur,
    // Étourdi...). La zone en elle-même n'est donc plus disqualifiante, seulement ces effets-là.
    const carteEstAttaqueSimple = !configSort.isHeal && !configSort.isShield
        && phase.alterations.length === 0;

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

    // Poussée et Traction peuvent aussi viser un allié (l'écarter d'un danger, le
    // ramener vers soi) : seule une carte SANS attaque qui les porte l'autorise —
    // une carte qui frappe ET pousse reste une agression, donc réservée aux ennemis.
    const cartePousseeOuTraction = phase.attaques.length === 0
        && phase.alterations.some(a => a.estPoussee || a.estTraction);

    const ciblesValides = new Set();
    for (let idToken in window.TOKENS_VTT_DATA) {
        const cibleData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idToken);
        if (!cibleData || cibleData.statut === "Mort") continue;
        if (cibleData.estIllusion && !carteEstAttaqueSimple) continue;

        if (configSort.isHeal) {
            if (cibleData.camp !== lanceurData.camp) continue;
        } else if (cartePousseeOuTraction) {
            if (idToken === idLanceur) continue;
        } else {
            if (idToken === idLanceur) continue;
            if (cibleData.camp === lanceurData.camp) continue;
        }

        const tk = window.positionCiblage(idToken);
        const dist = getHexDistance(tkLanceur, tk);

        // Traction impose sa portée de 3 à toute la carte (même cible unique pour l'attaque
        // éventuelle), sans jamais réduire la portée normale de l'attaque elle-même.
        const porteeEffective = Math.max(configSort.rangeMax, window.ETAT_CIBLAGE.porteeMinTraction || 0);

        if (dist > porteeEffective) continue;
        if (!configSort.isHeal && estEngage && dist > 1) continue;
        if (!verifierLigneDeVue(tkLanceur, tk)) continue;

        ciblesValides.add(idToken);
        
        const estSelectionne = window.ETAT_CIBLAGE.cibleUnique === idToken;
        const divToken = document.getElementById("token-" + idToken);
        
        if (divToken) {
            dessinerJaugeCible(divToken, cibleData);

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
            if (configSort.isRanged && dist === 1 && phase.attaques.length > 0 && !configSort.isHeal) {
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
    
    document.querySelectorAll(".anneau-ciblage, .bulle-validation-cible, .jauge-cible-ciblage").forEach(el => {
        const tokenId = el.parentElement.id.replace("token-", "");
        if (!ciblesValides.has(tokenId)) el.remove();
    });
};

window.ajouterCibleCiblage = function(idCible) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    const state = window.ETAT_CIBLAGE;
    const configSort = window.configCiblage(state);
    const phase = window.effetsDeLaPhase(state);
    if (!configSort) return;
    
    const idLanceur = window.lanceurDuCiblage();
    const tkLanceur = window.positionCiblage(idLanceur);
    const tkCible = window.positionCiblage(idCible);

    const lanceurData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idLanceur);
    const cibleData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idCible);

    if (!tkLanceur || !tkCible || !lanceurData || !cibleData) return;

    if (cibleData.statut === "Mort") {
        window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Cible invalide", "#aaaaaa");
        return;
    }

    // Une Illusion encaisse les dégâts (même en zone) mais reste insensible à tout le reste : ni
    // soin, ni bouclier, ni aucune autre altération accrochée à la carte.
    const carteEstAttaqueSimple = !configSort.isHeal && !configSort.isShield
        && phase.alterations.length === 0;
    if (cibleData.estIllusion && !carteEstAttaqueSimple) {
        window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Cible invalide", "#aaaaaa");
        return;
    }

    // Poussée et Traction peuvent aussi viser un allié (voir dessinerAnneauxCiblage) :
    // seule une carte SANS attaque qui les porte l'autorise.
    const cartePousseeOuTraction = phase.attaques.length === 0
        && phase.alterations.some(a => a.estPoussee || a.estTraction);

    if (configSort.isHeal) {
        if (cibleData.camp !== lanceurData.camp) {
            window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Cible invalide", "#aaaaaa");
            return;
        }
    } else if (cartePousseeOuTraction) {
        if (idCible === idLanceur) {
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

    // Traction impose sa portée de 3 à toute la carte (voir demarrerCiblage)
    const porteeEffective = Math.max(configSort.rangeMax, window.ETAT_CIBLAGE.porteeMinTraction || 0);

    if (dist > porteeEffective) {
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

    // Seuls les effets de la phase en cours prennent cette cible : en phase
    // d'attaque, le soin de la carte n'est pas concerné (il se vise ensuite).
    if (state.cibleUnique === idCible) {
        state.cibleUnique = null; 
        phase.attaques.forEach(a => a.cibles = []);
        phase.alterations.forEach(alt => alt.cibles = []);
    } else {
        state.cibleUnique = idCible; 
        phase.attaques.forEach(a => a.cibles = [idCible]);
        phase.alterations.forEach(alt => alt.cibles = [idCible]);
    }
    window.dessinerAnneauxCiblage();
};

window.nettoyerCiblage = function() {
    window.ETAT_CIBLAGE.actif = false;
    window.surlignerEffetCarteActif(null);
    document.querySelectorAll(".anneau-ciblage, .bulle-validation-cible, .jauge-cible-ciblage").forEach(el => el.remove());
    
    const svgZone = document.getElementById("svg-zone-ciblage");
    if (svgZone) svgZone.remove();
    window.retirerAssombrissement("svg-zone-assombrissement");
    const msgZone = document.getElementById("msg-zone-ciblage");
    if (msgZone) msgZone.remove();
    const msgSoutien = document.getElementById("msg-ciblage-soutien");
    if (msgSoutien) msgSoutien.remove();
    const bulleZone = document.getElementById("bulle-validation-zone");
    if (bulleZone) bulleZone.style.display = "none";

    window.removeEventListener("mousemove", window.VTT_CIBLAGE_MOUSEMOVE, {capture: true});
    window.removeEventListener("wheel", window.VTT_CIBLAGE_WHEEL, {capture: true});
    window.removeEventListener("click", window.VTT_CIBLAGE_CLICK, {capture: true});
    window.removeEventListener("touchstart", window.VTT_CIBLAGE_TOUCHSTART, {capture: true, passive: false});
    window.removeEventListener("touchmove", window.VTT_CIBLAGE_TOUCHMOVE, {capture: true, passive: false});

    const btnResoudre = document.getElementById("btn-resoudre-carte");
    const btnAnnuler = document.getElementById("btn-annuler-ciblage");
    if (btnResoudre) btnResoudre.remove();
    if (btnAnnuler) btnAnnuler.remove();

    // Et les pions avec, pour que la croix rouge du lanceur s'en aille en même
    // temps que le ciblage qu'elle annulait.
    if (typeof window.appliquerTokensVTT === "function" && window.TOKENS_VTT_DATA) {
        window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    }

    // La fenêtre de tour et le bouton fin de tour suivent le même sort que les
    // boutons de ciblage : ciblage annulé (ou résolu), l'écran doit refléter
    // tout de suite le nouvel état — le bouton repasse alors sur « lancer »
    // si la carte attend toujours d'être jouée.
    if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
    if (typeof window.actualiserBoutonFinTour === "function") window.actualiserBoutonFinTour();
};

// =========================================================================
//  TOUS LES DÉS D'UNE CARTE, TIRÉS UNE SEULE FOIS
// =========================================================================
//  Chaque navigateur rejoue l'animation de la carte de son côté. Tant qu'il
//  relançait ses propres dés, deux postes voyaient deux combats différents :
//  chez l'un la cible esquivait, chez l'autre elle encaissait ; un état
//  s'appliquait ici et pas là. Seul le poste qui a lancé la carte écrivait le
//  résultat en base, si bien que les autres affichaient une scène qui n'avait
//  jamais eu lieu — et gardaient en mémoire des points de vie et des états faux
//  jusqu'à la notification suivante. D'où « le bouclier ne se fait pas » ou
//  « l'effet n'est pas passé » à trois postes, jamais en solo.
//
//  Les dés sont donc tirés ICI, une fois, et embarqués dans l'action diffusée.
// =========================================================================
//  CE QUE L'ÉQUIPEMENT AJOUTE À UNE CARTE
// =========================================================================
//  Une arme ne joue pas de carte à part : elle enrichit celle que le héros
//  vient de lancer. Deux greffes, faites AU MOMENT DE LA RÉSOLUTION (donc
//  avant la diffusion de l'action, pour que les trois postes rejouent les
//  mêmes chiffres) :
//    - ses dégâts plats s'ajoutent à la valeur brute des attaques ;
//    - les états qu'elle inflige sont injectés dans la liste des altérations
//      de la carte, avec la même forme que ceux de la Forge. Ils empruntent
//      ensuite TOUT le circuit existant : jet partagé, immunités de race,
//      tic de poison, résolution particulière de Peur/Poussée/Traction,
//      icône sur le pion. Rien n'est réécrit en parallèle.

// Une arme qui TIRE (fronde, arc) tire toujours, même quand la technique n'a
// aucune portée : elle ajoute d'office l'équivalent d'un cran de Distance.
// C'est autant une contrainte qu'un avantage — l'attaque devient un tir, elle
// encaisse donc le malus de tir à bout portant si l'ennemi est au contact.
// Sa portée S'AJOUTE à celle que le joueur a posée sur la carte.
//
// L'allonge, elle, ne transforme rien : l'attaque reste au contact (pas de
// malus à bout portant), elle atteint simplement une case de plus.
// =========================================================================
//  LA PORTÉE D'UNE CARTE, TELLE QU'ELLE SERA VRAIMENT
// =========================================================================
//  UNE CARTE DOIT DIRE CE QU'ELLE FAIT. Une arme à distance — fronde, arc —
//  donne une portée de base à CHAQUE technique de son porteur : une carte
//  écrite au corps à corps devient un tir, avec tout ce que ça implique (elle
//  atteint plus loin, et elle perd trente pour cent au contact). La carte, elle,
//  n'en disait pas un mot : elle n'affichait une portée que si le joueur avait
//  posé un effet « Distance » dessus. On lisait donc « attaque lourde, 10 dégâts
//  physiques » sur une technique qui tirait à deux cases et se prenait un malus.
//
//  Cette fonction dit la vérité, et elle la dit en refaisant EXACTEMENT le
//  calcul du moteur (voir demarrerCiblage) : les deux sources de Distance de la
//  carte, puis l'arme, puis l'atout de portée magique. Une seule règle, deux
//  lecteurs — sans quoi la carte finirait par annoncer autre chose que ce que
//  le combat applique, et ce serait pire que de ne rien dire.
window.porteeReelleCarte = function(dataCarte, lanceur) {
    const vide = { portee: 1, isRanged: false, porteeCarte: 1, apportArme: 0 };
    if (!dataCarte || !dataCarte.Composants || !Array.isArray(dataCarte.Composants.actions)) return vide;
    const effets = window.EFFETS_BDD_CACHE || {};
    if (Object.keys(effets).length === 0) return vide;

    const nombreFr = (v) => {
        const n = parseFloat(String(v === undefined || v === null ? "" : v).replace(",", "."));
        return Number.isFinite(n) ? n : 0;
    };
    const porteeDe = (eff, count) => 1 + (nombreFr(eff.Valeur) * (count || 1));
    const mods = (bruts) => {
        if (!bruts) return [];
        if (Array.isArray(bruts)) {
            return bruts.map(m => (typeof m === "string" ? { id: m, count: 1 }
                                 : { id: m.id || m.effetId, count: m.count || 1 }))
                        .filter(m => m.id);
        }
        return Object.keys(bruts).map(k => ({ id: k, count: bruts[k] }));
    };

    let meilleure = vide;
    dataCarte.Composants.actions.forEach(act => {
        const effBase = effets[act.baseEffetId];
        if (!effBase) return;
        const nomLower = (effBase.Nom || "").toLowerCase();
        // Le Bond a sa propre portée de saut, qui n'est pas une portée de tir.
        if (nomLower.includes("bond")) return;

        let isRanged = false;
        let rangeMax = 1;
        if ((effBase.Nom || "") === "Distance") { isRanged = true; rangeMax = porteeDe(effBase, act.count); }
        mods(act.mods).forEach(m => {
            const modEff = effets[m.id];
            if (modEff && modEff.Nom === "Distance") {
                isRanged = true;
                rangeMax = Math.max(rangeMax, porteeDe(modEff, m.count));
            }
        });

        const porteeCarte = rangeMax;
        ({ isRanged, rangeMax } = window.porteeAvecArme(lanceur, isRanged, rangeMax,
                                                       dataCarte.Arme));

        // L'atout de portée magique, comme dans demarrerCiblage : il ne joue
        // que sur une action magique qui a déjà de la distance.
        const estMagique = nomLower.includes("magique") || nomLower.includes("pouvoir");
        const totale = rangeMax + (typeof window.bonusPorteeMagique === "function"
            ? window.bonusPorteeMagique(lanceur, estMagique, isRanged) : 0);

        if (totale > meilleure.portee) {
            meilleure = { portee: totale, isRanged, porteeCarte, apportArme: totale - porteeCarte };
        }
    });
    return meilleure;
};

// UNE ARME NE PRÊTE RIEN À UNE TECHNIQUE QUI NE S'EN SERT PAS.
//
// La règle entière — quels objets profitent à quelle carte — vit dans
// objets.js (`bonusEquipPourCarte`), parce que c'est le module qui sait ce
// qu'est une arme tenue en main, par opposition à une bague, un bouclier ou une
// armure. Ici on ne fait que lire.
//
// Sans elle, le porteur d'arc voyait TOUTES ses cartes devenir des tirs, y
// compris celle qui décrit un coup de coude — et elle encaissait au passage le
// malus de tir à bout portant, ce qui est exactement l'inverse de ce qu'une
// technique de corps-à-corps doit faire.
window.porteeAvecArme = function(lanceur, isRanged, rangeMax, armeDeLaCarte) {
    if (!lanceur || typeof window.bonusEquip !== "function") return { isRanged, rangeMax };
    const bonus = (cle) => (typeof window.bonusEquipPourCarte === "function")
        ? window.bonusEquipPourCarte(lanceur, cle, armeDeLaCarte)
        : window.bonusEquip(lanceur, cle);
    const portee = bonus("portee");
    const allonge = bonus("allonge");
    if (portee > 0) return { isRanged: true, rangeMax: rangeMax + portee + allonge };
    return { isRanged, rangeMax: rangeMax + allonge };
};

// =========================================================================
//  CE QU'IL FAUT ÉCRIRE SUR LA LIGNE « DISTANCE » D'UNE CARTE
// =========================================================================
//  La portée d'une carte se lisait à DEUX endroits sur le même écran : la
//  ligne « Distance » de la carte, qui annonçait ce que le joueur avait posé
//  dans la Forge, et une ligne bleue ajoutée au-dessus, qui annonçait la portée
//  vraie. Deux nombres différents pour une seule et même chose.
//
//  Il n'y en a plus qu'un : la ligne existante est RÉÉCRITE avec la portée que
//  la carte aura vraiment, arme et atout de peuple compris. Et quand la carte
//  n'a pas de ligne de Distance alors qu'elle porte loin — c'est l'arme qui le
//  fait — la ligne est ajoutée, dans le même format que si elle y était.
//
//  Les deux fonctions ci-dessous sont la SEULE source de ce texte, et elles
//  servent aux deux lecteurs : la carte en grand (competences.js) et l'encart
//  de tour (combat.js). Deux copies finiraient par annoncer deux portées.
// =========================================================================

// Rien à annoncer quand la carte reste au contact : on ne va pas écrire
// « 1 hexagone » sur toutes les techniques du jeu.
window.distanceAAfficher = function(dataCarte, lanceur) {
    if (typeof window.porteeReelleCarte !== "function") return null;
    const p = window.porteeReelleCarte(dataCarte, lanceur);
    if (!p || p.portee <= 1) return null;
    return p;
};

// La formulation vient de la base, jamais d'ici : le jour où l'effet Distance
// dira « 1 case » au lieu de « 1 hexagone », la ligne ajoutée suivra.
window.gabaritTexteDistance = function() {
    const effets = window.EFFETS_BDD_CACHE || {};
    const distance = Object.keys(effets).map(k => effets[k])
                           .find(e => e && e.Nom === "Distance");
    return (distance && distance.Effet_Base) || "1 hexagone";
};

// Le texte d'origine est conservé mot pour mot : on n'y remplace que le NOMBRE.
// C'est ce qui garantit que la ligne réécrite ressemble à s'y méprendre à celle
// qu'elle remplace — et que la ligne ajoutée ressemble aux vraies.
window.texteDistanceReelle = function(texteOrigine, p) {
    const base = String(texteOrigine || window.gabaritTexteDistance());
    const avecNombre = /\d/.test(base)
        ? base.replace(/\d+(?:[.,]\d+)?/, String(p.portee))
        : (p.portee + " " + base).trim();
    return p.apportArme > 0
        ? avecNombre + " (dont " + p.apportArme + " de l'arme)"
        : avecNombre;
};

const GABARITS_ETATS_EQUIPEMENT = {
    "Étourdi":        { duree: 2, icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1787381297/ETOURDIT_2_j7w36h.png", desc: "-30% Esquive/Parade, 20% de chance d'échec d'attaque." },
    "Immobilisation": { duree: 2, icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1788081285/IMG_2076_vze0an.png", desc: "Ne peut plus se déplacer volontairement, gagne 20 fatigue par tour immobilisé." },
    "Empoisonnement": { duree: 2, icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1788096401/IMG_2083_pebnup.png", desc: "15 fatigue et 8% des PV max perdus immédiatement, puis à nouveau au début du tour suivant. Pas de cumul.", estPoison: true, estDot: true },
    "Brûlé":          { duree: 2, icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1788181101/IMG_2087_q6chof.png", desc: "-50% de soins reçus, et 3 dégâts par manche." },
    "Glacé":          { duree: 2, icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1788181888/IMG_2089_isgcrs.png", desc: "Coût en fatigue du mouvement doublé, et 20% de dégâts subis en plus." },
    "Poussée":        { duree: 0, icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png", desc: "", estPoussee: true },
    "Traction":       { duree: 0, icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png", desc: "", estTraction: true },
    "Peur":           { duree: 0, icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png", desc: "", estPeur: true },
    "Provocation":    { duree: 2, icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png", desc: "Ne peut viser que celui qui l'a provoqué tant que l'état dure.", estProvocation: true }
};
window.GABARITS_ETATS_EQUIPEMENT = GABARITS_ETATS_EQUIPEMENT;

// Les attaques qui portent réellement un coup : ni soin, ni bouclier, ni
// purification. Ce sont les seules que l'arme peut enrichir.
function attaquesFrappantes(state) {
    return (state.attaques || []).filter(a => !a.isHeal && !a.isShield && (a.valeurBrute || 0) > 0);
}

// `armeDeLaCarte` est la catégorie d'arme de la technique (dataCarte.Arme).
// Elle décide de ce que la carte a le droit d'emprunter : une technique
// « Sans arme / Arme rp » ne prend ni les dégâts plats de l'épée qu'on ne
// dégaine pas, ni l'état que le gourdin resté à la ceinture inflige en
// frappant. L'armure, le bouclier, les bagues et les états du personnage, eux,
// continuent de compter — voir objets.js, qui porte la règle.
window.appliquerEquipementALaCarte = function(state, lanceur, armeDeLaCarte) {
    if (!state || !lanceur || state.equipementApplique) return;
    if (typeof window.bonusEquip !== "function") return;
    state.equipementApplique = true;   // une carte relancée ne doit pas cumuler deux fois

    const bonus = (cle) => (typeof window.bonusEquipPourCarte === "function")
        ? window.bonusEquipPourCarte(lanceur, cle, armeDeLaCarte)
        : window.bonusEquip(lanceur, cle);

    const degatsTous = bonus("degats");
    const degatsPhys = bonus("degatsPhys");
    const degatsMag  = bonus("degatsMag");
    const soin       = bonus("soin");
    const bonusDegatsPct = bonus("degatsPct");

    (state.attaques || []).forEach(attaque => {
        if (attaque.isShield) return;
        if (attaque.isHeal) {
            if (soin > 0 && (attaque.valeurBrute || 0) > 0) attaque.valeurBrute += soin;
            return;
        }
        if ((attaque.valeurBrute || 0) <= 0) return;
        attaque.valeurBrute += degatsTous + (attaque.typeRes === "Magique" ? degatsMag : degatsPhys);
        // Bénédiction offensive d'une bague de soin : un pourcentage en plus,
        // appliqué APRÈS les dégâts plats, comme un dernier multiplicateur.
        if (bonusDegatsPct > 0) attaque.valeurBrute = Math.round(attaque.valeurBrute * (1 + bonusDegatsPct / 100));
    });

    // Les états de l'arme visent exactement ce que la carte a frappé — et seule
    // une carte qui se sert de l'arme y a droit.
    const etatsArme = typeof window.etatsEquipementPourCarte === "function"
        ? window.etatsEquipementPourCarte(lanceur, armeDeLaCarte)
        : (typeof window.etatsEquipement === "function" ? window.etatsEquipement(lanceur) : []);
    if (etatsArme.length === 0) return;

    const frappees = attaquesFrappantes(state);
    if (frappees.length === 0) return;
    const cibles = [...new Set(frappees.flatMap(a => a.cibles || []))];
    if (cibles.length === 0) return;

    state.alterations = state.alterations || [];
    etatsArme.forEach(e => {
        const gabarit = GABARITS_ETATS_EQUIPEMENT[e.etat];
        if (!gabarit) return;
        // Si la carte inflige DÉJÀ cet état, l'arme ne le double pas : elle
        // améliore simplement ses chances, en gardant la meilleure des deux.
        const dejaLa = state.alterations.find(a => a.nom === e.etat);
        if (dejaLa) {
            dejaLa.chance = Math.max(dejaLa.chance || 0, e.chance || 0);
            return;
        }
        const alteration = {
            nom: e.etat, ...gabarit, chance: e.chance || 0,
            venuDeLEquipement: true, isRanged: false, rangeMax: 1,
            cibles: [...cibles]
        };
        // La provocation retient QUI a provoqué : c'est ce que l'IA lit pour
        // n'avoir plus d'yeux que pour lui (monstres_ia.js). Pour tout autre
        // état, le champ n'existe PAS — surtout pas « undefined » : Firestore
        // refuse toute valeur undefined, et l'intention de la carte partait
        // en erreur. Une arme qui brûle ou qui gèle empêchait de jouer.
        if (e.etat === "Provocation") alteration.idProvocateur = lanceur.idPersonnage;
        state.alterations.push(alteration);
    });
};

// Ce que l'équipement laisse DERRIÈRE une carte : l'élan d'initiative gagné en
// frappant, les bénédictions posées sur ceux qu'on vient de soigner, et le pas
// de retraite offert par certaines armes. Tous des états temporaires ordinaires
// : ils portent un "bonusEquip" que window.bonusEquip additionne aux stats, et
// s'éteignent tout seuls quand la transition de round épuise leur durée.
window.appliquerSuitesEquipement = async function(action, jeSuisLAuteur) {
    const jets = (action && action.jets) || {};
    const buffs = jets.equipLanceur || [];
    const benedictions = jets.equipBenedictions || [];
    const pasOfferts = jets.equipPasOfferts || 0;
    if (buffs.length === 0 && benedictions.length === 0 && pasOfferts === 0) return;

    const poser = async (idCombattant, etat) => {
        const cible = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idCombattant);
        if (!cible) return;
        const etats = [...(cible.Etats_Alteres || [])];
        const existant = etats.find(e => e.nom === etat.nom);
        if (existant) {
            existant.duree = Math.max(existant.duree || 0, etat.duree);
            existant.bonusEquip = etat.bonusEquip;
        } else {
            etats.push(etat);
        }
        cible.Etats_Alteres = etats;
        if (jeSuisLAuteur) {
            await updateDoc(window.refCombattant(idCombattant), { Etats_Alteres: etats })
                .catch(e => console.error("État d'équipement :", e));
        }
        const tk = window.TOKENS_VTT_DATA[idCombattant];
        if (tk) window.afficherMessageFlottantHex(tk.q, tk.r, etat.nom + " !", "#ffd700");
    };

    for (const buff of buffs) {
        await poser(action.idLanceur, {
            nom: "Élan", duree: buff.tours || 2,
            bonusEquip: { initiative: buff.initiative || 0 },
            icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png",
            desc: `+${buff.initiative || 0} d'initiative sur les prochaines cartes.`
        });
    }

    if (benedictions.length > 0) {
        const soignes = [...new Set((action.attaques || [])
            .filter(a => a.isHeal).flatMap(a => a.cibles || []))];
        for (const beni of benedictions) {
            const bonus = {};
            if (beni.resPhys) bonus.resPhys = beni.resPhys;
            if (beni.resMag) bonus.resMag = beni.resMag;
            if (beni.degatsPct) bonus.degatsPct = beni.degatsPct;
            const detail = [beni.resPhys ? `+${beni.resPhys}% résistance physique` : null,
                            beni.resMag ? `+${beni.resMag}% résistance magique` : null,
                            beni.degatsPct ? `+${beni.degatsPct}% de dégâts` : null].filter(Boolean).join(", ");
            for (const id of soignes) {
                await poser(id, { nom: "Béni", duree: beni.tours || 1, bonusEquip: bonus,
                                  icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png", desc: detail });
            }
        }
    }

    // Le pas de retraite : les premières cases du prochain déplacement ne
    // coûtent rien (cf. mouvement.js). L'état dure le tour, pas plus.
    if (pasOfferts > 0) {
        await poser(action.idLanceur, {
            nom: "Repli", duree: 1, bonusEquip: { hexApresAttaque: pasOfferts },
            icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png",
            desc: `${pasOfferts} case(s) de déplacement gratuite(s) après avoir frappé.`
        });
    }
};

window.declencherResolution = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    const state = window.ETAT_CIBLAGE;

    document.querySelectorAll(".bulle-validation-cible").forEach(el => el.style.display = "none");
    const bulleZone = document.getElementById("bulle-validation-zone");
    if (bulleZone) bulleZone.style.display = "none";

    const idLanceur = window.lanceurDuCiblage();
    if (!idLanceur) {
        console.error("Résolution sans lanceur : le ciblage ne dit pas qui joue.");
        return;
    }

    // 🔻 COUP CRITIQUE — un jet invisible par carte jouée, réservé aux héros 🔻
    // Tiré ICI, une seule fois, puis embarqué dans l'action : chaque navigateur
    // rejoue l'animation de son côté, et s'il relançait son propre dé, les
    // joueurs ne verraient pas tous le même coup partir.
    // Les créatures n'y ont pas droit : elles frappent toujours normalement.
    let critique = false;
    const lanceurCrit = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idLanceur);
    if (lanceurCrit && !window.estUneCreature(lanceurCrit, idLanceur)) {
        const chanceCrit = window.critiqueCombattant(lanceurCrit);
        const jetCrit = Math.floor(Math.random() * 100) + 1;
        critique = jetCrit <= chanceCrit;
        console.log(`🎲 Jet de critique de ${lanceurCrit.prenom || idLanceur} : ${jetCrit} (Chance : ${chanceCrit}%)`
                    + (critique ? " → CRITIQUE !" : ""));
    }

    // L'arme et l'armure enrichissent la carte AVANT que les dés ne tombent et
    // avant la diffusion : les dégâts plats et les états ajoutés partent donc
    // dans l'action, identiques pour tous les postes.
    window.appliquerEquipementALaCarte(state, lanceurCrit, state.armeDeLaCarte);

    // ON DEMANDE, ON NE RÉSOUT PAS.
    //
    // Le point de coupure est ici, et il est choisi : la carte est enrichie par
    // l'équipement et ses cibles sont arrêtées (y compris redirigées par la
    // Confusion), mais AUCUN dé n'est encore tombé. Les dés, le critique, les
    // esquives, les dégâts et les états sont tirés par le cerveau — une fois,
    // pour les trois écrans.
    //
    // C'est ce qui tue les dégâts doublés à la racine : il n'y a plus de
    // « poste auteur » à distinguer d'un poste qui rejoue, plus de
    // RESOLUTIONS_LOCALES, plus de timestamp à reconnaître. Personne ne résout
    // deux fois, parce qu'un seul résout.
    //
    // L'enrichissement par l'équipement, lui, reste ici : il ne dépend que de
    // la fiche du joueur qui joue sa propre carte, un seul poste l'exécute, et
    // il ne peut donc pas diverger. C'est une couture assumée, à ramener dans
    // le noyau avec le reste.
    if (window.regimeDemande && window.regimeDemande.actif()) {
        try {
            // LA ZONE PERSISTANTE PART AVEC LA CARTE, elle ne s'écrit plus à
            // côté. creerZonePersistante posait la nappe directement dans
            // Combat_VTT et dans ZONES_PERSISTANTES, sans passer par le
            // cerveau : l'état du combat ne la connaissait donc pas, et
            // personne ne pouvait marcher dedans — le feu était un décor.
            //
            // On marque ici les altérations qui font zone (la table vit côté
            // jeu, le noyau ne la connaît pas) et on envoie les cases visées.
            const TYPES = window.TYPES_ZONES_PERSISTANTES || {};
            const alterations = (state.alterations || []).map(a => (
                TYPES[a.nom] ? { ...a, persistante: true, typeZone: TYPES[a.nom] } : a
            ));

            // L'emprise : l'AoE complète si la carte porte un mod Zone, sinon la
            // seule case de chaque cible.
            let zoneHexes = [];
            if (state.persistanceTerrain) {
                if (state.isZone && Array.isArray(state.zoneHexesFinaux) && state.zoneHexesFinaux.length > 0) {
                    zoneHexes = state.zoneHexesFinaux.map(h => ({ q: h.q, r: h.r }));
                } else {
                    const ids = new Set();
                    (state.attaques || []).forEach(a => (a.cibles || []).forEach(c => ids.add(c)));
                    (state.alterations || []).forEach(a => (a.cibles || []).forEach(c => ids.add(c)));
                    ids.forEach(id => {
                        const tk = (window.TOKENS_VTT_DATA || {})[id];
                        if (tk) zoneHexes.push({ q: tk.q, r: tk.r });
                    });
                }
            }

            await window.regimeDemande.carte(idLanceur, {
                idCarte: state.idCarte,
                attaques: state.attaques,
                alterations,
                // La carte dit son coût (voir carteConstruite). Les deux
                // sources d'avant restent en secours, pour un état de ciblage
                // fabriqué ailleurs — mais la première est désormais toujours
                // renseignée, y compris à zéro, d'où le test explicite : un
                // `||` ferait retomber une carte gratuite sur la globale.
                coutFatigue: parseInt(state.coutFatigue !== undefined && state.coutFatigue !== null
                                      ? state.coutFatigue
                                      : (state.fatigue || window.COUT_COMPETENCE_SELECTIONNEE)) || 0,
                persistanceTerrain: !!state.persistanceTerrain,
                zoneHexes,
                repli: (state.repli && state.repliChoisi)
                    ? { ...state.repli, vers: state.repliChoisi } : null
            });
        } catch (e) {
            console.error("Demande de carte :", e);
        }
        window.nettoyerCiblage();
    }
};

// Si la carte porte un Bond placé APRÈS l'attaque/altération, on le déclenche juste après
// avoir lancé la résolution de celle-ci (le jet est déjà figé côté serveur) : l'ordre de la
// carte est respecté, et le saut interactif ne bloque jamais le lancement de l'attaque.
window.declencherResolutionAvecBondEventuel = async function() {
    // L'attaque est visée, mais la carte porte aussi un soin à viser à part :
    // on ouvre la seconde phase au lieu de résoudre.
    if (window.passerAuCiblageDuSoutien()) return;
    const bondEnAttente = window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.bondApresAttaque;
    const illusionEnAttente = window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.illusionEnAttente;
    // LE REPLI SE CHOISIT AVANT D'ENVOYER LA CARTE. Il se joue après l'attaque,
    // mais la carte clôt le tour : une demande envoyée après elle serait
    // refusée. La case part donc avec la carte, et le cerveau fait marcher le
    // lanceur une fois l'attaque jouée.
    const etatRepli = window.ETAT_CIBLAGE;
    if (etatRepli && etatRepli.repli && !etatRepli.repliChoisi) {
        const idRepli = etatRepli.idLanceur;
        etatRepli.repliChoisi = await window.choisirCaseRepli(idRepli, etatRepli.repli.portee,
                                                              etatRepli.origineLanceur);
    }
    await window.declencherResolution();
    if (bondEnAttente) {
        await window.resoudreBondInteractif(bondEnAttente.idLanceur, bondEnAttente.portee);
    }
    // L'Illusion se crée toujours en dernier sur la carte, après tout le reste (attaque, Bond...).
    if (illusionEnAttente) {
        await window.resoudreIllusionInteractif(illusionEnAttente.idLanceur, illusionEnAttente.portee);
    }
};

// =========================================================================
//  GRANDE SUPPRESSION — l'ancien moteur d'animation et de dégâts
// =========================================================================
//  Ici vivait window.jouerAnimationMoteur (828 lignes) : le tirage des dés en
//  local, l'application des dégâts/soins/états, l'écriture Personnages et
//  Monstres, et l'animation à l'écran — tout ce que declencherResolution
//  écrivait autrefois dans Action_Moteur pour que chaque poste le rejoue de
//  son côté. Le régime cerveau a remplacé cette étape entière : resoudreCarte
//  (moteur_pur.js) calcule une fois, pour tout le monde, et appliquerEtape /
//  appliquerEntree (combat_etat.js) rejouent le résultat sans un seul dé —
//  ce que cette fonction essayait d'imiter avec RESOLUTIONS_LOCALES et des
//  jets partagés est aujourd'hui garanti par construction.
//
//  window.RESOLUTIONS_LOCALES et window.ANIMATION_MOTEUR_EN_COURS restent
//  déclarés (plus haut dans ce fichier / dans app.js) mais ne sont plus
//  jamais alimentés : leurs derniers lecteurs vivants (monstres_ia.js,
//  attendreFinResolution) étaient déjà inatteignables sous le régime cerveau
//  avant cette suppression — RESOLUTIONS_LOCALES ne grossit plus depuis que
//  declencherResolution ne l'utilise plus (voir plus haut).

