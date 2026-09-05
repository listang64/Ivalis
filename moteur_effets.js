import { db } from "./firebase-config.js";
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

// --- OUTILS MATHÉMATIQUES ---
function getHexDistance(a, b) {
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

// Affiche le message flottant de dégâts/soin + le flash coloré + la mini-barre qui se vide (ou se
// remplit) sur le pion, exactement comme pour une attaque classique (voir jouerAnimationMoteur).
// Réutilisée par les attaques d'opportunité et les tics d'Empoisonnement, qui n'avaient jusqu'ici
// que le message flottant générique, sans le retour visuel de la barre.
window.afficherFlashDegatToken = function(idCible, ancienneValeur, nouvelleValeur, valeurMax, texte, couleurTexte, couleurBarre) {
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

// Construite par le lanceur uniquement (declencherResolution ne tourne que chez lui), puis
// diffusée à tous via Combat_VTT.
window.creerZonePersistante = async function(state, idLanceur) {
    if (!window.ID_PARTIE_COURANTE || !state) return;

    // 1. Emprise : l'AoE complète si la carte porte un mod Zone, sinon la seule case visée.
    let hexes = [];
    if (state.isZone && Array.isArray(state.zoneHexesFinaux) && state.zoneHexesFinaux.length > 0) {
        hexes = state.zoneHexesFinaux.map(h => ({ q: h.q, r: h.r }));
    } else {
        const idsCibles = new Set();
        (state.attaques || []).forEach(a => (a.cibles || []).forEach(c => idsCibles.add(c)));
        (state.alterations || []).forEach(a => (a.cibles || []).forEach(c => idsCibles.add(c)));
        idsCibles.forEach(id => {
            const tk = window.TOKENS_VTT_DATA ? window.TOKENS_VTT_DATA[id] : null;
            if (tk) hexes.push({ q: tk.q, r: tk.r });
        });
    }
    const vues = new Set();
    hexes = hexes.filter(h => {
        const cle = h.q + "," + h.r;
        if (vues.has(cle)) return false;
        vues.add(cle);
        return true;
    });
    if (hexes.length === 0) return;

    // 2. Ce que la zone rejoue à chaque entrée : les dégâts de la carte (jamais les boucliers,
    //    qui n'ont pas de sens en piège au sol), OU le soin d'une carte de soin (zone verte,
    //    bienfaisante), et l'état élémentaire embarqué.
    const attaqueDegats = (state.attaques || []).find(a => !a.isHeal && !a.isShield && (a.valeurBrute || 0) > 0);
    const degats = attaqueDegats
        ? { valeurBrute: attaqueDegats.valeurBrute, typeRes: attaqueDegats.typeRes }
        : null;

    const attaqueSoin = (state.attaques || []).find(a => a.isHeal && (a.valeurBrute || 0) > 0);
    const soin = attaqueSoin ? { valeurBrute: attaqueSoin.valeurBrute } : null;

    const altPersistante = (state.alterations || []).find(a => window.TYPES_ZONES_PERSISTANTES[a.nom]);
    const etat = altPersistante ? {
        nom: altPersistante.nom,
        icone: altPersistante.icone,
        desc: altPersistante.desc || "",
        chance: altPersistante.chance,
        duree: altPersistante.duree,
        estPoison: !!altPersistante.estPoison,
        tickFait: false
    } : null;

    if (!degats && !soin && !etat) return; // Rien à faire persister : pas de zone fantôme

    const type = etat ? (window.TYPES_ZONES_PERSISTANTES[etat.nom] || "neutre")
        : soin ? "soin"
        : "neutre";
    const id = "zp_" + Date.now() + "_" + Math.floor(Math.random() * 10000);

    // Pas de superposition : la nouvelle zone REMPLACE les anciennes sur les cases qu'elle
    // recouvre. Une ancienne zone qui garde des cases ailleurs survit, amputée ; celle qui se
    // fait entièrement recouvrir disparaît.
    const casesPrises = new Set(hexes.map(h => h.q + "," + h.r));
    const zonesConservees = {};
    Object.values(window.ZONES_PERSISTANTES || {}).forEach(z => {
        const restantes = (z.hexes || []).filter(h => !casesPrises.has(h.q + "," + h.r));
        if (restantes.length > 0) zonesConservees[z.id] = { ...z, hexes: restantes };
    });

    zonesConservees[id] = {
        id: id,
        hexes: hexes,
        type: type,
        degats: degats,
        soin: soin,
        etat: etat,
        dureeRestante: 3, // Fixe : la Forge masque le bouton ⏳ sur ce mod
        idLanceur: idLanceur || null
    };

    window.ZONES_PERSISTANTES = zonesConservees;
    if (typeof window.appliquerZonesPersistantes === "function") window.appliquerZonesPersistantes();
    await window.sauvegarderZonesPersistantes(zonesConservees);
};

// Résout l'entrée d'un personnage sur UNE case. Appelée uniquement par le client qui pilote le
// déplacement (comme les attaques d'opportunité) : le jet est tranché et persisté une seule
// fois, puis le résultat est embarqué dans la diffusion du mouvement pour être rejoué à
// l'identique chez tout le monde. Retourne un tableau de résultats (une zone peut en recouvrir
// une autre) ou null.
window.resoudreZonesPersistantesSurCase = async function(idPerso, hex) {
    if (!hex) return null;
    const zones = Object.values(window.ZONES_PERSISTANTES || {});
    if (zones.length === 0) return null;

    const zonesIci = zones.filter(z => (z.hexes || []).some(h => h.q === hex.q && h.r === hex.r));
    if (zonesIci.length === 0) return null;

    const cibleData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPerso);
    if (!cibleData || cibleData.statut === "Mort") return null;

    const resultats = [];

    for (const zone of zonesIci) {
        const esquive = window.esquiveCombattant(cibleData);
        const parade = window.paradeCombattant(cibleData);
        const statDef = Math.max(esquive, parade);
        const jetDef = Math.floor(Math.random() * 100) + 1;
        const motDef = parade > esquive ? "Paré 🛡️" : "Esquivé 💨";
        const dodged = jetDef <= statDef;

        let degatsFinaux = 0;
        let soinFinal = 0;
        let viaBouclier = false;
        let etatApplique = null;

        if (!dodged) {
            if (zone.degats) {
                const defPhys = window.defPhysiqueCombattant(cibleData);
                const defMag = window.defMagiqueCombattant(cibleData);
                const resistance = zone.degats.typeRes === "Magique" ? defMag : defPhys;
                let reduction = resistance / 100;
                if (reduction > 1) reduction = 1;
                degatsFinaux = Math.round((zone.degats.valeurBrute || 0) * (1 - reduction));
                if (degatsFinaux < 0) degatsFinaux = 0;

                if (degatsFinaux > 0) {
                    try {
                        const refPerso = window.refCombattant(idPerso);
                        const oldShield = parseInt(cibleData.Bouclier_Actuel) || 0;
                        if (oldShield > 0) {
                            viaBouclier = true;
                            cibleData.Bouclier_Actuel = Math.max(0, oldShield - degatsFinaux);
                            await updateDoc(refPerso, { Bouclier_Actuel: cibleData.Bouclier_Actuel });
                        } else {
                            const oldPv = parseInt(cibleData.PV_Actuels) || 0;
                            cibleData.PV_Actuels = Math.max(0, oldPv - degatsFinaux);
                            await updateDoc(refPerso, { PV_Actuels: cibleData.PV_Actuels });
                        }
                    } catch (e) {
                        console.error("Erreur dégâts zone persistante :", e);
                    }
                }
            }

            // Zone de soin : soigne quiconque marche dessus, ami ou ennemi — la Persistance
            // de terrain n'a jamais distingué les camps, un remous bienfaisant pas plus qu'un
            // brasier. Jamais au-delà des PV max.
            if (zone.soin) {
                const pvMax = (parseInt(cibleData.PV_Max) || 0) + (parseInt(cibleData.Dev_Mod_PV) || 0);
                const pvActuels = parseInt(cibleData.PV_Actuels) || 0;
                soinFinal = Math.min(zone.soin.valeurBrute || 0, Math.max(0, pvMax - pvActuels));

                if (soinFinal > 0) {
                    try {
                        cibleData.PV_Actuels = pvActuels + soinFinal;
                        await updateDoc(window.refCombattant(idPerso), { PV_Actuels: cibleData.PV_Actuels });
                    } catch (e) {
                        console.error("Erreur soin zone persistante :", e);
                    }
                }
            }

            // L'état garde le pourcentage calculé au moment où le sort a été lancé.
            if (zone.etat) {
                const roll = Math.floor(Math.random() * 100) + 1;
                // Un peuple immunisé traverse la zone sans rien attraper.
                if (roll <= (zone.etat.chance || 0) && !window.estImmunise(cibleData, zone.etat.nom)) {
                    const etats = cibleData.Etats_Alteres ? [...cibleData.Etats_Alteres] : [];
                    const existant = etats.find(e => e.nom === zone.etat.nom);
                    if (existant) {
                        existant.duree = Math.max(existant.duree, zone.etat.duree);
                        if (zone.etat.estPoison) existant.tickFait = false;
                    } else {
                        etats.push({ ...zone.etat });
                    }
                    cibleData.Etats_Alteres = etats;
                    etatApplique = zone.etat.nom;
                    try {
                        await updateDoc(window.refCombattant(idPerso), { Etats_Alteres: etats });
                    } catch (e) {
                        console.error("Erreur état zone persistante :", e);
                    }
                }
            }
        }

        resultats.push({
            idCible: idPerso,
            type: zone.type || "neutre",
            dodged: dodged,
            motDef: motDef,
            degats: degatsFinaux,
            soin: soinFinal,
            viaBouclier: viaBouclier,
            etatApplique: etatApplique
        });
    }

    return resultats.length > 0 ? resultats : null;
};

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
// Le jet est calculé UNE SEULE FOIS, sur l'écran de celui qui déplace le pion (seul client
// à connaître le avant/après du mouvement). Le résultat déjà tranché (pas juste "il se passe
// un truc, chacun relance son dé") est ensuite diffusé via Action_Opportunite : tous les
// clients (celui qui a bougé y compris) le rejouent à l'identique via jouerAnimationOpportunite.
// Ne diffuse plus rien elle-même : le jet et les dégâts/bouclier sont tranchés et persistés
// UNE SEULE FOIS ici (par le personnage qui bouge), et le résultat est retourné à l'appelant
// (validerMouvement, dans mouvement.js) pour être embarqué dans Action_Mouvement à l'étape du
// trajet où l'ennemi est quitté. C'est ce qui permet à l'animation de marquer une vraie pause
// pile à cet endroit chez tous les joueurs, au lieu de se jouer après coup une fois arrivé.
window.resoudreAttaqueOpportunite = async function(idAttaquant, idCible) {
    const attaquantData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idAttaquant);
    const cibleData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idCible);
    if (!attaquantData || !cibleData) return null;
    if (attaquantData.statut === "Mort" || cibleData.statut === "Mort") return null;

    // Atout du Vargen : une chance de se dérober AVANT même le jet de défense.
    // C'est une esquive supplémentaire, pas un remplacement — il garde ensuite
    // sa chance ordinaire.
    const chanceDerobade = window.atoutRace(cibleData).esquiveOpportunite || 0;
    // Le résultat est seulement tranché ici : c'est jouerAnimationOpportunite qui
    // l'affiche, chez tous les joueurs à la fois, à la bonne étape du trajet.
    if (chanceDerobade > 0 && Math.floor(Math.random() * 100) + 1 <= chanceDerobade) {
        return { idAttaquant, idCible, dodged: true, motDef: "Dérobade 🐾", degats: 0, viaBouclier: false };
    }

    const esquive = window.esquiveCombattant(cibleData);
    const parade = window.paradeCombattant(cibleData);
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
            const refPerso = window.refCombattant(idCible);
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

    return { idAttaquant, idCible, dodged, motDef, degats, viaBouclier };
};

// Rejoue le résultat déjà tranché (par resoudreAttaqueOpportunite) chez CHAQUE joueur connecté,
// y compris celui qui a déplacé le pion. Ne relance jamais le dé et n'écrit rien : uniquement
// de l'affichage. Appelée directement (et attendue) DEPUIS jouerAnimationMouvement, à l'étape du
// trajet où l'attaque a lieu : data.hexPosition (la case du trajet à ce moment-là, pas forcément
// la position finale) doit être fournie pour que le message apparaisse au bon endroit.
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
//  ASSOMBRISSEMENT DU PLATEAU
// =========================================================================
//  Le même voile noir partout : tout l'écran s'assombrit sauf les cases où l'on
//  peut cliquer. Le SVG est posé DANS #transform-plateau, donc il suit le pan et
//  le zoom sans le moindre recalcul.
// Les cases où l'on peut poser une zone à distance : c'est la règle du survol
// (VTT_CIBLAGE_MOUSEMOVE), mise au propre pour pouvoir aussi la DESSINER.
window.casesPosablesZone = function(idLanceur, configSort) {
    const tkLanceur = (window.TOKENS_VTT_DATA || {})[idLanceur];
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
    const limite = estEngage ? 1 : portee;

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

        // Immobilisation et Paralysie bloquent tout mouvement volontaire, y compris le Bond
        // (mais pas les déplacements subis comme Poussée/Traction/Peur).
        const lanceurBond = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPerso);
        if (lanceurBond && lanceurBond.Etats_Alteres && lanceurBond.Etats_Alteres.some(e => e.nom === "Immobilisation" || e.nom === "Paralysie")) {
            const estParalyseBond = lanceurBond.Etats_Alteres.some(e => e.nom === "Paralysie");
            if (typeof window.afficherMessageFlottantHex === "function") {
                window.afficherMessageFlottantHex(tkDepart.q, tkDepart.r, estParalyseBond ? "Paralysé !" : "Immobilisé !", "#aaaaaa");
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

            // Atterrir dans une zone persistante la déclenche, exactement comme y entrer à pied.
            let zonesBond = null;
            if (typeof window.resoudreZonesPersistantesSurCase === "function") {
                zonesBond = await window.resoudreZonesPersistantesSurCase(idPerso, hexArrivee);
            }

            window.TOKENS_VTT_DATA[idPerso].q = hexArrivee.q;
            window.TOKENS_VTT_DATA[idPerso].r = hexArrivee.r;

            try {
                await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), {
                    Action_Bond: { idToken: idPerso, depart: hexDepart, arrivee: hexArrivee, zones: zonesBond, timestamp: Date.now() }
                });
                await window.enregistrerPionsVTT(idPerso);
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
        await setDoc(doc(db, "Personnages", idIllusion), dataIllusion);

        window.TOKENS_VTT_DATA[idIllusion] = { q, r, url: imgUrl, taille };
        await window.enregistrerPionsVTT(idIllusion);
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

    if (typeof window.appliquerTokensVTT === "function") window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    if (typeof window.afficherPisteInitiative === "function") window.afficherPisteInitiative();
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

    let zonesPoussee = null;
    if (typeof window.resoudreZonesPersistantesSurCase === "function") {
        zonesPoussee = await window.resoudreZonesPersistantesSurCase(idCible, arrivee);
    }

    window.TOKENS_VTT_DATA[idCible].q = arrivee.q;
    window.TOKENS_VTT_DATA[idCible].r = arrivee.r;

    try {
        await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), {
            Action_Poussee: { idToken: idCible, depart: hexDepart, arrivee: arrivee, zones: zonesPoussee, timestamp: Date.now() }
        });
        await window.enregistrerPionsVTT(idCible);
    } catch (err) {
        console.error("Erreur Poussée :", err);
    }
};

// =========================================================================
//  TRACTION
//  L'inverse de la Poussée : tire la cible vers le lanceur, jusqu'à 3 cases, sans jamais
//  atterrir sur sa propre case (elle s'arrête au plus près à 1 case du lanceur). Même règles
//  de blocage (mur, case supprimée, case occupée), même diffusion pour que tous les joueurs
//  voient le même résultat, et même animation que la Poussée (voir jouerAnimationPoussee dans
//  mouvement.js — la trajectoire suffit à donner l'impression inverse). La portée de ciblage
//  (3 cases, ligne de vue) et le fait que Traction partage sa cible avec une éventuelle attaque
//  sont gérés en amont dans demarrerCiblage/ajouterCibleCiblage.
// =========================================================================
window.declencherTractionCible = async function(idLanceur, idCible) {
    const tkLanceur = window.TOKENS_VTT_DATA ? window.TOKENS_VTT_DATA[idLanceur] : null;
    const tkCible = window.TOKENS_VTT_DATA ? window.TOKENS_VTT_DATA[idCible] : null;
    if (!tkLanceur || !tkCible || !window.PLATEAU_VTT || !window.ID_PARTIE_COURANTE) return;

    const dist = getHexDistance(tkLanceur, tkCible);
    if (dist <= 1) return; // Déjà au contact : rien à tirer

    const lerp = (a, b, t) => a + (b - a) * t;
    const cubeRound = (q, r, s) => {
        let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
        let qd = Math.abs(rq - q), rd = Math.abs(rr - r), sd = Math.abs(rs - s);
        if (qd > rd && qd > sd) rq = -rr - rs;
        else if (rd > sd) rr = -rq - rs;
        return { q: rq, r: rr };
    };
    // On part de la cible et on avance vers le lanceur (sens inverse de la Poussée).
    const aCube = { q: tkCible.q + 1e-6, r: tkCible.r + 1e-6, s: -tkCible.q - tkCible.r - 2e-6 };
    const bCube = { q: tkLanceur.q + 1e-6, r: tkLanceur.r + 1e-6, s: -tkLanceur.q - tkLanceur.r - 2e-6 };

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
    const maxPas = Math.min(3, dist - 1); // Ne jamais atterrir sur la case du lanceur
    let arrivee = null;
    for (let i = 1; i <= maxPas; i++) {
        const t = i / dist;
        const pt = cubeRound(lerp(aCube.q, bCube.q, t), lerp(aCube.r, bCube.r, t), lerp(aCube.s, bCube.s, t));
        if (!estLibre(pt.q, pt.r)) break;
        arrivee = pt;
    }

    if (!arrivee) {
        if (typeof window.afficherMessageFlottantHex === "function") {
            window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Traction (bloquée)", "#aaaaaa");
        }
        return;
    }

    let zonesTraction = null;
    if (typeof window.resoudreZonesPersistantesSurCase === "function") {
        zonesTraction = await window.resoudreZonesPersistantesSurCase(idCible, arrivee);
    }

    window.TOKENS_VTT_DATA[idCible].q = arrivee.q;
    window.TOKENS_VTT_DATA[idCible].r = arrivee.r;

    try {
        await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), {
            Action_Traction: { idToken: idCible, depart: hexDepart, arrivee: arrivee, zones: zonesTraction, timestamp: Date.now() }
        });
        await window.enregistrerPionsVTT(idCible);
    } catch (err) {
        console.error("Erreur Traction :", err);
    }
};

// Diffuse un simple message d'échec (ni déplacement ni animation) quand le jet de Poussée/Traction
// rate, pour que tous les joueurs comprennent que rien ne s'est passé volontairement, et non par bug.
// Réutilise le même champ que le déplacement réussi : jouerAnimationPoussee sait afficher les deux.
window.diffuserEchecDeplacementForce = async function(champFirestore, idCible, nomEffet) {
    if (!window.ID_PARTIE_COURANTE) return;
    try {
        await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), {
            [champFirestore]: { idToken: idCible, echec: true, nomEffet, timestamp: Date.now() }
        });
    } catch (err) {
        console.error(`Erreur diffusion échec ${nomEffet} :`, err);
    }
};

// =========================================================================
//  PEUR
//  Fait fuir la cible sur 4 cases : à chaque case, on ne garde que les directions qui
//  l'éloignent VRAIMENT du lanceur (jamais une ligne droite imposée comme la Poussée), et on en
//  tire une au hasard parmi elles. Mêmes règles de blocage que Poussée/Traction (mur, case
//  supprimée, case occupée) : si toutes les directions valides sont bloquées, la fuite s'arrête
//  net (avant les 4 cases). Déclenche une attaque d'opportunité par ennemi quitté en chemin,
//  SAUF celle du lanceur (c'est lui qui fait peur, il n'en profite pas d'un coup en plus) — même
//  mécanique de résolution que pour un déplacement normal (une seule fois, par le lanceur,
//  embarquée dans la diffusion pour que tous les joueurs voient le même résultat). Contrairement
//  à Poussée/Traction, ce déplacement forcé coûte de la fatigue à la cible (coût de base d'un
//  déplacement normal, 2 par case), comme une vraie fuite panique l'épuiserait.
// =========================================================================
window.declencherPeurCible = async function(idLanceur, idCible) {
    const tkLanceur = window.TOKENS_VTT_DATA ? window.TOKENS_VTT_DATA[idLanceur] : null;
    const tkCibleDepart = window.TOKENS_VTT_DATA ? window.TOKENS_VTT_DATA[idCible] : null;
    if (!tkLanceur || !tkCibleDepart || !window.PLATEAU_VTT || !window.ID_PARTIE_COURANTE) return;

    const DIRECTIONS_HEX = [
        { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
        { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
    ];

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

    const chemin = [];
    const dejaVisite = new Set([`${tkCibleDepart.q},${tkCibleDepart.r}`]);
    let hexActuel = { q: tkCibleDepart.q, r: tkCibleDepart.r };
    for (let i = 0; i < 4; i++) {
        const distActuelle = getHexDistance(tkLanceur, hexActuel);
        const voisinsLibres = DIRECTIONS_HEX
            .map(d => ({ q: hexActuel.q + d.q, r: hexActuel.r + d.r }))
            .filter(c => estLibre(c.q, c.r) && !dejaVisite.has(`${c.q},${c.r}`));

        // On préfère les cases qui éloignent vraiment du lanceur ; si elles sont toutes
        // bloquées (mur, case supprimée, occupée), on cherche un autre chemin plutôt que de
        // s'arrêter net contre l'obstacle — la seule contrainte est de ne jamais repasser sur
        // une case déjà prise pendant cette fuite.
        let candidats = voisinsLibres.filter(c => getHexDistance(tkLanceur, c) > distActuelle);
        if (candidats.length === 0) candidats = voisinsLibres;

        if (candidats.length === 0) break; // Vraiment coincée : plus aucune case libre inexplorée

        hexActuel = candidats[Math.floor(Math.random() * candidats.length)];
        dejaVisite.add(`${hexActuel.q},${hexActuel.r}`);
        chemin.push({ q: hexActuel.q, r: hexActuel.r });
    }

    if (chemin.length === 0) {
        if (typeof window.afficherMessageFlottantHex === "function") {
            window.afficherMessageFlottantHex(tkCibleDepart.q, tkCibleDepart.r, "Peur (bloquée)", "#aaaaaa");
        }
        return;
    }

    // Attaques d'opportunité déclenchées en fuyant, case par case (même principe que pour un
    // déplacement volontaire), sauf de la part du lanceur lui-même.
    let contactPrecedent = new Set(
        (typeof window.listerEnnemisAuContact === "function"
            ? window.listerEnnemisAuContact(idCible, tkCibleDepart)
            : []
        ).filter(id => id !== idLanceur)
    );
    const opportunitesResolues = [];
    for (let i = 0; i < chemin.length; i++) {
        const contactActuel = new Set(
            (typeof window.listerEnnemisAuContact === "function"
                ? window.listerEnnemisAuContact(idCible, chemin[i])
                : []
            ).filter(id => id !== idLanceur)
        );
        for (const idEnnemi of contactPrecedent) {
            if (!contactActuel.has(idEnnemi) && typeof window.resoudreAttaqueOpportunite === "function") {
                const resultat = await window.resoudreAttaqueOpportunite(idEnnemi, idCible);
                if (resultat) opportunitesResolues.push({ apresEtape: i, ...resultat });
            }
        }
        contactPrecedent = contactActuel;
    }

    // Une fuite paniquée traverse les zones persistantes comme n'importe quel déplacement.
    const zonesResoluesPeur = [];
    if (typeof window.resoudreZonesPersistantesSurCase === "function") {
        for (let i = 0; i < chemin.length; i++) {
            const resZone = await window.resoudreZonesPersistantesSurCase(idCible, chemin[i]);
            if (resZone) zonesResoluesPeur.push({ apresEtape: i, resultats: resZone });
        }
    }

    // La fuite coûte de la fatigue à la cible, comme un déplacement normal (coût de base : 2/case).
    const cibleData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idCible);
    if (cibleData) {
        const fatigueMax = window.fatigueMaxCombattant(cibleData);
        const fatigueActuelle = cibleData.fatigueActuelle !== undefined ? parseInt(cibleData.fatigueActuelle) : fatigueMax;
        const nouvelleFatigue = Math.max(0, fatigueActuelle - chemin.length * 2);
        cibleData.fatigueActuelle = nouvelleFatigue;
        try {
            await updateDoc(window.refCombattant(idCible), { Fatigue_Actuelle: nouvelleFatigue });
        } catch (err) {
            console.error("Erreur fatigue Peur :", err);
        }
    }

    window.TOKENS_VTT_DATA[idCible].q = hexActuel.q;
    window.TOKENS_VTT_DATA[idCible].r = hexActuel.r;

    try {
        await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), {
            Action_Peur: { idToken: idCible, path: chemin, opportunites: opportunitesResolues, zones: zonesResoluesPeur, timestamp: Date.now() }
        });
        await window.enregistrerPionsVTT(idCible);
    } catch (err) {
        console.error("Erreur Peur :", err);
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

    // Le cache d'affichage n'est rempli que pour le combattant montré dans le
    // panneau gauche. Quand une créature joue, c'est l'IA qui l'y met — et si ce
    // chargement a pris du retard, la carte manquait ici et le sort partait…
    // nulle part, sans un mot : la créature passait son tour sans rien faire.
    // Le cache global, lui, contient les techniques de TOUS les combattants.
    const idPourCache = (window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO] || {}).idPersonnage;
    const dataCarte = window.COMPETENCES_CACHE[idCarte]
        || ((window.CACHE_COMPETENCES_GLOBAL || {})[idPourCache] || {})[idCarte];
    if (!dataCarte) {
        console.warn(`Ciblage impossible : la technique ${idCarte} de ${idPourCache} est introuvable.`);
        return;
    }

    // 🔻 NOUVEAU : PARALYSIE 🔻
    // Empêche tout mouvement ET toute compétence : on intercepte ici, avant même le ciblage, le
    // personnage paralysé perd quand même la fatigue prévue de la carte (comme s'il l'avait
    // jouée), mais aucun de ses effets ne se déclenche jamais — on réutilise directement
    // validerCarteCombat (déduction de fatigue + fin de tour), sans jamais construire d'action.
    // Le lanceur de cette carte : sa paralysie l'empêche d'agir, sa race peut
    // aussi allonger la portée de ses sorts (cf. plus bas).
    const lanceurCarte = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
    const casterParalyse = lanceurCarte;
    if (casterParalyse && casterParalyse.Etats_Alteres && casterParalyse.Etats_Alteres.some(e => e.nom === "Paralysie")) {
        const tkCaster = window.TOKENS_VTT_DATA ? window.TOKENS_VTT_DATA[casterParalyse.idPersonnage] : null;
        if (tkCaster && typeof window.afficherMessageFlottantHex === "function") {
            window.afficherMessageFlottantHex(tkCaster.q, tkCaster.r, "Paralysé !", "#aaaaaa");
        }
        window.validerCarteCombat(idCarte, document.getElementById("btn-appliquer-carte"));
        return;
    }

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
    let indexTraction = -1;
    let indexPremiereAttaque = -1;
    let isIllusion = false;
    let porteeIllusion = 1;
    // Persistance de terrain : le sort laisse derrière lui une zone dangereuse sur la ou les
    // cases visées (voir creerZonePersistante). Détecté ici, appliqué après la résolution.
    let aPersistanceTerrain = false;

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

            // Persistance de terrain : simple drapeau de carte (mod ou effet de base). La zone
            // qu'elle laisse derrière elle est construite après la résolution, à partir des
            // dégâts/états de la carte (voir declencherResolution).
            if (nomLower.includes("persistance")) aPersistanceTerrain = true;
            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (modEff && (modEff.Nom || "").toLowerCase().includes("persistance")) aPersistanceTerrain = true;
            });

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
            // attaques et altérations partent donc avec la bonne portée, et
            // une attaque devenue tir encaisse bien le malus au contact.
            ({ isRanged, rangeMax } = window.porteeAvecArme(lanceurCarte, isRanged, rangeMax));

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

            // Étalement des dégâts (mod "DOT" / "Durée étalement dégâts") : la carte coûte moins
            // de fatigue (déjà géré par la Forge, coutActionTotale /= 1.2) mais ses dégâts sont
            // coupés en deux — une moitié tout de suite, l'autre au début du tour suivant.
            let aEtalement = false;
            const estModEtalement = (nom) => {
                const n = (nom || "").toLowerCase().trim();
                return n === "dot" || n.includes("étalement") || n.includes("etalement");
            };
            if (estModEtalement(effBase.Nom)) aEtalement = true;
            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (modEff && estModEtalement(modEff.Nom)) aEtalement = true;
            });

            if (nomLower.includes("attaque") || nomLower.includes("pouvoir") || nomLower.includes("soin") || nomLower.includes("guérison") || isPurification || isShield) {
                let isHeal = nomLower.includes("soin") || nomLower.includes("guérison") || isPurification || isShield;
                // Un soin ou un bouclier ne s'étale pas : seuls les dégâts sont concernés. La
                // coupe en deux se fait sur les dégâts FINAUX (après résistances), pas ici :
                // diviser la valeur brute gonflerait le total sur les valeurs impaires
                // (5 → 3 + 3 = 6 après arrondi de chaque moitié).
                const etalementActif = aEtalement && !isHeal;

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

                attaquesExtraites.push({
                    nom: effBase.Nom,
                    typeRes: typeRes,
                    valeurBrute: (parseFrFloat(effBase.Valeur) || 0) * (act.count || 1),
                    isRanged: isRanged,
                    rangeMax: porteeReelle,
                    isHeal: isHeal,
                    isShield: isShield,
                    purifChance: purifChance,
                    estEtalement: etalementActif,
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

            // 🔻 NOUVEAU : DÉTECTION PARALYSIE 🔻
            // Contrairement aux autres états, pas de jet de pourcentage : elle s'applique
            // automatiquement dès que la cible est touchée (chance fixée à 100, la cible garde
            // quand même sa chance d'esquive/parade normale, gérée en amont comme pour tous les
            // autres effets). Durée fixe de 4 tours, jamais prolongeable par Durée+ (bouton
            // masqué en Forge, comme pour Immobilisation).
            let isParalysie = nomLower.includes("paralys");
            listeMods.forEach(m => {
                const modEff = window.EFFETS_BDD_CACHE[m.id];
                if (modEff && (modEff.Nom || "").toLowerCase().includes("paralys")) {
                    isParalysie = true;
                }
            });

            if (isParalysie) {
                if (indexPremierAutreEffet === -1) indexPremierAutreEffet = idxAction;
                alterationsExtraites.push({
                    nom: "Paralysie",
                    icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1788182779/IMG_2091_tf3xnx.png",
                    desc: "Empêche tout mouvement volontaire et toute compétence pendant 4 tours (la fatigue de la carte tentée est quand même perdue).",
                    chance: 100,
                    duree: 4,
                    isRanged: isRanged,
                    rangeMax: rangeMax,
                    cibles: []
                });
            }

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
                    desc: "-50% de soins reçus.",
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
                    desc: "Coût en fatigue du mouvement doublé.",
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
                    desc: "La prochaine carte jouée perd 35 en initiative, puis l'état disparaît.",
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
            // monstres dans choisirCibleMonstre, monstres_ia.js). L'idProvocateur est fixé UNE FOIS
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
        // Illusion seule sur la carte (ou dernière chose restante après le Bond) : elle se résout
        // ici, immédiatement, puisqu'il n'y a rien d'autre après elle.
        if (isIllusion) {
            await window.resoudreIllusionInteractif(idLanceurBond, porteeIllusion);
        }
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

    // Traction impose sa propre portée (3, ligne de vue dégagée) à toute la carte, même si
    // l'attaque qui l'accompagne est en mêlée : comme les deux visent obligatoirement la même
    // cible unique, la portée effective de ciblage doit être au moins celle de Traction.
    const tractionAlt = alterationsExtraites.find(a => a.estTraction);
    const porteeMinTraction = tractionAlt ? tractionAlt.rangeMax : 0;
    // Si Traction est écrite avant la première attaque sur la carte, elle doit se résoudre avant
    // elle (on tire la cible avant de la frapper) au lieu de toujours s'appliquer après, comme le
    // fait une altération classique. Voir jouerAnimationMoteur qui lit ce drapeau.
    const tractionAvantAttaque = !!tractionAlt && (indexPremiereAttaque === -1 || indexTraction < indexPremiereAttaque);

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
        bondApresAttaque: bondApresLeReste ? { idLanceur: idLanceurBond, portee: porteeBond } : null,
        porteeMinTraction: porteeMinTraction,
        tractionAvantAttaque: tractionAvantAttaque,
        illusionEnAttente: isIllusion ? { idLanceur: idLanceurBond, portee: porteeIllusion } : null,
        persistanceTerrain: aPersistanceTerrain,
        zoneHexesFinaux: null
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

    // Mémorisé pour la Persistance de terrain : c'est exactement l'emprise que gardera la zone
    // résiduelle, sans avoir à refaire le calcul de rotation ailleurs.
    state.zoneHexesFinaux = finalHexes;

    let ciblesTouchees = [];
    const idLanceur = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage;
    const configSort = state.attaques[0] || state.alterations[0];
    const lanceurData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idLanceur);

    // Une Illusion encaisse les dégâts (même en zone) mais reste insensible à tout le reste.
    const carteEstAttaqueSimple = !!configSort && !configSort.isHeal && !configSort.isShield
        && (state.alterations || []).length === 0;

    for (let idToken in window.TOKENS_VTT_DATA) {
        const cibleData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idToken);
        if (!cibleData || cibleData.statut === "Mort") continue;
        if (cibleData.estIllusion && !carteEstAttaqueSimple) continue;

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
    if (!window.ETAT_CIBLAGE || !window.ETAT_CIBLAGE.actif) {
        document.querySelectorAll(".anneau-ciblage, .bulle-validation-cible, .jauge-cible-ciblage").forEach(el => el.remove());
        return;
    }

    const configSort = window.ETAT_CIBLAGE.attaques[0] || window.ETAT_CIBLAGE.alterations[0];
    if (!configSort) return;

    const idLanceur = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage;
    const tkLanceur = window.TOKENS_VTT_DATA[idLanceur];
    const lanceurData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idLanceur);

    if (!tkLanceur || !lanceurData) return;

    // Une Illusion encaisse les dégâts (même en zone) mais reste insensible à tout le reste : ni
    // soin, ni bouclier, ni aucune autre altération accrochée à la carte (Poussée, Traction, Peur,
    // Étourdi...). La zone en elle-même n'est donc plus disqualifiante, seulement ces effets-là.
    const carteEstAttaqueSimple = !configSort.isHeal && !configSort.isShield
        && (window.ETAT_CIBLAGE.alterations || []).length === 0;

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
        if (cibleData.estIllusion && !carteEstAttaqueSimple) continue;

        if (configSort.isHeal) {
            if (cibleData.camp !== lanceurData.camp) continue;
        } else {
            if (idToken === idLanceur) continue;
            if (cibleData.camp === lanceurData.camp) continue;
        }

        const tk = window.TOKENS_VTT_DATA[idToken];
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
    
    document.querySelectorAll(".anneau-ciblage, .bulle-validation-cible, .jauge-cible-ciblage").forEach(el => {
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

    // Une Illusion encaisse les dégâts (même en zone) mais reste insensible à tout le reste : ni
    // soin, ni bouclier, ni aucune autre altération accrochée à la carte.
    const carteEstAttaqueSimple = !configSort.isHeal && !configSort.isShield
        && (state.alterations || []).length === 0;
    if (cibleData.estIllusion && !carteEstAttaqueSimple) {
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
    document.querySelectorAll(".anneau-ciblage, .bulle-validation-cible, .jauge-cible-ciblage").forEach(el => el.remove());
    
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

    const btnAppliquer = document.getElementById("btn-appliquer-carte");
    const btnResoudre = document.getElementById("btn-resoudre-carte");
    if (btnAppliquer) btnAppliquer.style.display = "block";
    if (btnResoudre) btnResoudre.remove();

    // Le bandeau du bas suit le même sort que le bouton "Appliquer" de la carte :
    // ciblage annulé, la compétence est de nouveau lançable.
    if (typeof window.actualiserBandeauAction === "function") window.actualiserBandeauAction();
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
window.porteeAvecArme = function(lanceur, isRanged, rangeMax) {
    if (!lanceur || typeof window.bonusEquip !== "function") return { isRanged, rangeMax };
    const portee = window.bonusEquip(lanceur, "portee");
    const allonge = window.bonusEquip(lanceur, "allonge");
    if (portee > 0) return { isRanged: true, rangeMax: rangeMax + portee + allonge };
    return { isRanged, rangeMax: rangeMax + allonge };
};

const GABARITS_ETATS_EQUIPEMENT = {
    "Étourdi":        { duree: 2, icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1787381297/ETOURDIT_2_j7w36h.png", desc: "-20% Esquive/Parade, 10% de chance d'échec d'attaque." },
    "Immobilisation": { duree: 2, icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1788081285/IMG_2076_vze0an.png", desc: "Ne peut plus se déplacer volontairement, gagne 20 fatigue par tour immobilisé." },
    "Empoisonnement": { duree: 2, icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1788096401/IMG_2083_pebnup.png", desc: "15 fatigue et 8% des PV max perdus immédiatement, puis à nouveau au début du tour suivant. Pas de cumul.", estPoison: true, estDot: true },
    "Brûlé":          { duree: 2, icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1788181101/IMG_2087_q6chof.png", desc: "-50% de soins reçus." },
    "Glacé":          { duree: 2, icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1788181888/IMG_2089_isgcrs.png", desc: "Coût en fatigue du mouvement doublé." },
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

window.appliquerEquipementALaCarte = function(state, lanceur) {
    if (!state || !lanceur || state.equipementApplique) return;
    if (typeof window.bonusEquip !== "function") return;
    state.equipementApplique = true;   // une carte relancée ne doit pas cumuler deux fois

    const degatsTous = window.bonusEquip(lanceur, "degats");
    const degatsPhys = window.bonusEquip(lanceur, "degatsPhys");
    const degatsMag  = window.bonusEquip(lanceur, "degatsMag");
    const soin       = window.bonusEquip(lanceur, "soin");
    const bonusDegatsPct = window.bonusEquip(lanceur, "degatsPct");

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

    // Les états de l'arme visent exactement ce que la carte a frappé.
    const etatsArme = typeof window.etatsEquipement === "function" ? window.etatsEquipement(lanceur) : [];
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
        state.alterations.push({
            nom: e.etat, ...gabarit, chance: e.chance || 0,
            venuDeLEquipement: true, isRanged: false, rangeMax: 1,
            // La provocation retient QUI a provoqué : c'est ce que l'IA lit
            // pour n'avoir plus d'yeux que pour lui (monstres_ia.js).
            idProvocateur: e.etat === "Provocation" ? lanceur.idPersonnage : undefined,
            cibles: [...cibles]
        });
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

function tirerLesDesDeLaCarte(state, lanceurData, critique) {
    const d100 = () => Math.floor(Math.random() * 100) + 1;
    const jets = { attaqueRatee: false, parCible: {} };

    // Étourdi : une chance sur dix de rater complètement sa technique.
    if (lanceurData && (lanceurData.Etats_Alteres || []).some(e => e.nom === "Étourdi")) {
        jets.attaqueRatee = d100() <= 10;
    }

    const pourCible = (id) => {
        if (!jets.parCible[id]) jets.parCible[id] = { etats: {} };
        return jets.parCible[id];
    };
    const jetDeDefense = (id) => {
        const cible = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === id);
        const statDef = Math.max(window.esquiveCombattant(cible), window.paradeCombattant(cible));
        return d100() <= statDef;
    };

    (state.attaques || []).forEach(attaque => {
        (attaque.cibles || []).forEach(id => {
            const c = pourCible(id);
            // Un soin ne s'esquive pas.
            if (c.esquive === undefined) c.esquive = attaque.isHeal ? false : jetDeDefense(id);
            if ((attaque.purifChance || 0) > 0 && c.purifie === undefined) {
                c.purifie = critique || d100() <= attaque.purifChance;
            }
        });
    });

    (state.alterations || []).forEach(alt => {
        (alt.cibles || []).forEach(id => {
            const c = pourCible(id);
            // Carte sans dégâts : c'est ici que se joue l'esquive de la cible.
            if (c.esquive === undefined) c.esquive = jetDeDefense(id);
            // Un coup critique impose les effets de la carte, sans jet.
            if (c.etats[alt.nom] === undefined) {
                c.etats[alt.nom] = critique || d100() <= (alt.chance || 0);
            }
        });
    });

    // --- Les jets de l'équipement -----------------------------------------
    // Percer une armure ou ignorer les résistances se joue une fois, ici, et
    // par cible : sans ça, un poste verrait le coup passer et l'autre non.
    if (typeof window.bonusEquip === "function") {
        const ignoreArmure = window.bonusEquip(lanceurData, "ignoreArmure");
        const ignoreResistances = window.bonusEquip(lanceurData, "ignoreResistances");
        if (ignoreArmure > 0 || ignoreResistances > 0) {
            attaquesFrappantes(state).forEach(attaque => {
                (attaque.cibles || []).forEach(id => {
                    const c = pourCible(id);
                    c.equip = c.equip || {};
                    if (ignoreArmure > 0 && c.equip.ignoreArmure === undefined) {
                        c.equip.ignoreArmure = d100() <= ignoreArmure;
                    }
                    if (ignoreResistances > 0 && c.equip.ignoreResistances === undefined) {
                        c.equip.ignoreResistances = d100() <= ignoreResistances;
                    }
                });
            });
        }

        // Les effets qui portent sur le lanceur ou sur la cible d'un soin :
        // élan d'initiative, bénédictions des bagues de soin.
        const speciaux = typeof window.effetsSpeciauxEquipement === "function"
            ? window.effetsSpeciauxEquipement(lanceurData) : [];
        const frappe = attaquesFrappantes(state).length > 0;
        const soigne = (state.attaques || []).some(a => a.isHeal && (a.valeurBrute || 0) > 0);
        jets.equipLanceur = [];
        jets.equipBenedictions = [];
        speciaux.forEach(e => {
            // "10% de chance de gagner +15 d'initiative" : lié à une attaque.
            if (e.buff && frappe && d100() <= (e.chance || 0)) jets.equipLanceur.push(e.buff);
            // Les effets des bagues de soin ne se déclenchent que sur un soin.
            if (e.buffSoi && soigne) jets.equipLanceur.push(e.buffSoi);
            if (e.beniSoin && soigne) jets.equipBenedictions.push(e.beniSoin);
        });

        // "Gagne 1 hexagone de mouvement après l'attaque" : sans jet, mais
        // seulement si la carte a bien frappé quelqu'un.
        jets.equipPasOfferts = frappe ? window.bonusEquip(lanceurData, "hexApresAttaque") : 0;
    }

    return jets;
}

window.declencherResolution = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    const state = window.ETAT_CIBLAGE;

    document.querySelectorAll(".bulle-validation-cible").forEach(el => el.style.display = "none");
    const bulleZone = document.getElementById("bulle-validation-zone");
    if (bulleZone) bulleZone.style.display = "none";

    const idLanceur = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage;

    // 🔻 NOUVEAU : CONFUSION — jet unique pour toute la carte, au moment de la jouer 🔻
    // Le lanceur confus a 20% de s'infliger sa propre compétence, 20% de la lancer sur une cible
    // au hasard à portée (alliés ET ennemis), 10% de dissiper la confusion (carte normale), sinon
    // (50%) rien ne change. Les effets de déplacement forcé (Poussée/Traction/Peur) sur soi-même
    // n'ont pas de sens (distance nulle) : on les neutralise plutôt que de les rediriger sur soi.
    let confusionResultat = null;
    let isZoneFinal = state.isZone;
    const lanceurDataConf = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idLanceur);
    const estConfus = lanceurDataConf && (lanceurDataConf.Etats_Alteres || []).some(e => e.nom === "Confusion");

    if (estConfus) {
        const rollConf = Math.floor(Math.random() * 100) + 1;
        const carteAUneAttaque = (state.attaques || []).length > 0;

        const redirigerVersSoi = () => {
            state.attaques.forEach(a => a.cibles = [idLanceur]);
            state.alterations.forEach(alt => {
                alt.cibles = (alt.estPoussee || alt.estTraction || alt.estPeur) ? [] : [idLanceur];
            });
            isZoneFinal = false;
        };

        if (rollConf <= 20 || (rollConf <= 40 && !carteAUneAttaque)) {
            redirigerVersSoi();
            confusionResultat = { type: "auto" };
        } else if (rollConf <= 40) {
            const configSortConf = state.attaques[0] || state.alterations[0];
            const tkLanceurConf = window.TOKENS_VTT_DATA[idLanceur];
            const porteeConf = Math.max((configSortConf && configSortConf.rangeMax) || 1, state.porteeMinTraction || 0);
            const carteEstAttaqueSimpleConf = configSortConf && !configSortConf.isHeal && !configSortConf.isShield
                && (state.alterations || []).length === 0;

            const ciblesPossibles = Object.keys(window.TOKENS_VTT_DATA).filter(id => {
                if (id === idLanceur) return false;
                const d = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === id);
                if (!d || d.statut === "Mort") return false;
                if (d.estIllusion && !carteEstAttaqueSimpleConf) return false;
                const tk = window.TOKENS_VTT_DATA[id];
                if (!tk || getHexDistance(tkLanceurConf, tk) > porteeConf) return false;
                if (!verifierLigneDeVue(tkLanceurConf, tk)) return false;
                return true;
            });

            if (ciblesPossibles.length === 0) {
                redirigerVersSoi();
                confusionResultat = { type: "auto" };
            } else {
                const idCibleHasard = ciblesPossibles[Math.floor(Math.random() * ciblesPossibles.length)];
                state.attaques.forEach(a => a.cibles = [idCibleHasard]);
                state.alterations.forEach(alt => alt.cibles = [idCibleHasard]);
                isZoneFinal = false;
                confusionResultat = { type: "aleatoire", idCible: idCibleHasard };
            }
        } else if (rollConf <= 50) {
            const nouveauxEtatsConf = (lanceurDataConf.Etats_Alteres || []).filter(e => e.nom !== "Confusion");
            lanceurDataConf.Etats_Alteres = nouveauxEtatsConf;
            await updateDoc(window.refCombattant(idLanceur), { Etats_Alteres: nouveauxEtatsConf }).catch(e => console.error(e));
            confusionResultat = { type: "annulee" };
        }
        // 51-100 : comportement normal, la carte se résout comme choisi par le joueur.
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
    window.appliquerEquipementALaCarte(state, lanceurCrit);

    const jets = tirerLesDesDeLaCarte(state, lanceurCrit, critique);

    const actionData = {
        type: "ATTAQUES",
        idLanceur,
        critique,
        jets,
        idCarte: state.idCarte,
        attaques: state.attaques,
        alterations: state.alterations,
        isZone: isZoneFinal,
        zoneCenterHex: state.zoneCenterHex,
        tractionAvantAttaque: state.tractionAvantAttaque || false,
        confusion: confusionResultat,
        timestamp: new Date().getTime()
    };

    // C'est CE poste qui vient de résoudre la carte. Tous les navigateurs vont
    // rejouer l'animation en recevant Action_Moteur, mais un seul doit écrire le
    // résultat en base — sinon ils s'écriraient dessus. On retient donc l'instant
    // exact de la résolution : celui qui le reconnaît est l'auteur.
    window.RESOLUTIONS_LOCALES = window.RESOLUTIONS_LOCALES || [];
    window.RESOLUTIONS_LOCALES.push(actionData.timestamp);
    if (window.RESOLUTIONS_LOCALES.length > 40) window.RESOLUTIONS_LOCALES.shift();

    try {
        await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), {
            Action_Moteur: actionData
        });

        // Persistance de terrain : la carte s'est résolue normalement ci-dessus, on laisse
        // maintenant la zone résiduelle sur les cases visées (3 tours).
        if (state.persistanceTerrain && typeof window.creerZonePersistante === "function") {
            await window.creerZonePersistante(state, idLanceur);
        }

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
    const illusionEnAttente = window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.illusionEnAttente;
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
//  MOTEUR D'ANIMATION ET DÉGÂTS
// =========================================================================

window.jouerAnimationMoteur = async function(action) {
    if (action.type !== "ATTAQUES") return;

    const lanceur = action.idLanceur;
    const tkLanceur = window.TOKENS_VTT_DATA[lanceur];
    const lanceurData = window.PERSOS_PARTIE.find(p => p.idPersonnage === lanceur);

    // Qui écrit le résultat en base ? Le poste qui a résolu la carte, et lui seul.
    // C'était jusqu'ici « le propriétaire du lanceur » — ce qui marche pour la
    // carte d'un joueur, mais PAS pour une créature : son ID_Joueur vaut "MJ", ne
    // correspond à personne, et plus rien n'était écrit. Les dégâts, les états et
    // la fatigue restaient donc dans la mémoire du navigateur, et le premier
    // snapshot venu les effaçait — « mes points de vie restent bloqués à 12 ».
    const jeSuisLAuteur = Array.isArray(window.RESOLUTIONS_LOCALES)
        && window.RESOLUTIONS_LOCALES.includes(action.timestamp);

    // 🔻 NOUVEAU : message de confusion, affiché à tous avant que la carte (déjà redirigée
    // côté Firestore par declencherResolution) ne se résolve, pour que la redirection soit lisible.
    if (action.confusion && tkLanceur) {
        let msgConf = "", couleurConf = "#ffaa00";
        if (action.confusion.type === "auto") msgConf = "Confus : s'inflige sa propre compétence !";
        else if (action.confusion.type === "aleatoire") msgConf = "Confus : cible au hasard !";
        else if (action.confusion.type === "annulee") { msgConf = "Confusion dissipée !"; couleurConf = "#33cc66"; }
        if (msgConf) {
            window.afficherMessageFlottantHex(tkLanceur.q, tkLanceur.r, msgConf, couleurConf);
            await new Promise(r => setTimeout(r, 1200));
        }
    }

    // 🔻 COUP CRITIQUE : le jet a été tranché par le poste qui a lancé la carte
    // (cf. declencherResolution) ; ici on ne fait que le rejouer à l'identique.
    // Deuxième verrou, au point d'effet : une créature ne critique jamais, même
    // si l'action reçue le prétend. Le premier verrou est au lancement, mais il
    // vit sur le poste qui a résolu la carte — celui-ci peut être en retard d'une
    // mise à jour, ou avoir lu une liste de combattants incomplète. La règle,
    // elle, doit tenir sur tous les écrans.
    const critique = !!action.critique && !window.estUneCreature(lanceurData, lanceur);
    if (!!action.critique && !critique) {
        console.warn("Critique refusé : " + lanceur + " est une créature.");
    }
    if (critique && tkLanceur) {
        window.afficherMessageFlottantHex(tkLanceur.q, tkLanceur.r, "Critique !", "#ff2d2d",
                                          { taille: 30, eclat: true });
        await new Promise(r => setTimeout(r, 900));
    }

    // Les dés de la carte ont été tirés une seule fois, par le poste qui l'a
    // lancée (cf. tirerLesDesDeLaCarte) : ici on ne fait que les relire, pour
    // que les trois écrans voient exactement le même combat. Le repli local ne
    // sert qu'à une action venue d'un poste pas encore à jour.
    const jets = action.jets || null;
    const desDe = (id) => (jets && jets.parCible && jets.parCible[id]) || null;

    // 🔻 NOUVEAU : Jet d'Échec si le Lanceur est Étourdi 🔻
    let attaqueRatee = false;
    if (lanceurData && lanceurData.Etats_Alteres && lanceurData.Etats_Alteres.some(e => e.nom === "Étourdi")) {
        const rate = jets ? !!jets.attaqueRatee : (Math.floor(Math.random() * 100) + 1) <= 10;
        if (rate) {
            attaqueRatee = true;
            if (tkLanceur) window.afficherMessageFlottantHex(tkLanceur.q, tkLanceur.r, "Échec technique !", "#ffaa00");
            await new Promise(r => setTimeout(r, 1200));
        }
    }

    let ciblesToucheesValides = new Set(); // Mémoire des cibles qui n'ont pas esquivé

    // 🔻 NOUVEAU : Traction écrite AVANT l'attaque sur la carte se résout avant elle (on tire la
    // cible avant de la frapper), au lieu de toujours s'appliquer après comme une altération
    // classique. La cible étant unique, c'est la même pour l'attaque qui suit. Le jet lui-même
    // n'est fait que par le lanceur (voir declencherTractionCible), mais TOUT LE MONDE attend le
    // même délai avant d'enchaîner sur l'attaque, pour que la séquence reste lisible pour tous.
    let tractionDejaResolue = false;
    if (action.tractionAvantAttaque && !attaqueRatee) {
        const tractionAlt = (action.alterations || []).find(a => a.estTraction);
        const idCibleTraction = tractionAlt && tractionAlt.cibles && tractionAlt.cibles[0];
        if (tractionAlt && idCibleTraction) {
            if (jeSuisLAuteur) {
                const rollTractionTot = Math.floor(Math.random() * 100) + 1;
                console.log(`🎲 Jet de Traction (avant attaque) : Résultat ${rollTractionTot} (Chance: ${tractionAlt.chance}%)`);
                if ((critique || rollTractionTot <= tractionAlt.chance) && typeof window.declencherTractionCible === "function") {
                    await window.declencherTractionCible(lanceur, idCibleTraction);
                } else if (typeof window.diffuserEchecDeplacementForce === "function") {
                    await window.diffuserEchecDeplacementForce("Action_Traction", idCibleTraction, "Traction");
                }
            }
            await new Promise(r => setTimeout(r, 900));
            tractionDejaResolue = true;
        }
    }

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

                // 🔻 NOUVEAU : vérification de portée au moment de résoudre, pas seulement au
                // ciblage. Nécessaire depuis Traction : la cible peut être choisie à sa portée
                // élargie (3) en pariant sur le tirage, mais si le jet de Traction échoue, la
                // cible reste hors de portée réelle de l'attaque (souvent en mêlée, portée 1) et
                // celle-ci ne doit pas se déclencher quand même.
                if (!action.isZone && dist > attaque.rangeMax) {
                    if (tkCible) window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Hors de portée", "#aaaaaa");
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }

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

                // 🔻 NOUVEAU : petite ruée de l'attaquant pour l'Attaque légère/lourde 🔻
                // Il avance très légèrement vers sa cible puis reprend sa place initiale, juste
                // avant que le résultat (esquive/dégâts) ne s'affiche.
                const nomAttaqueLower = (attaque.nom || "").toLowerCase();
                const estAttaqueLegereOuLourde = nomAttaqueLower.includes("attaque légère")
                    || nomAttaqueLower.includes("attaque legere")
                    || nomAttaqueLower.includes("attaque lourde");
                if (estAttaqueLegereOuLourde && tkLanceur && tkCible) {
                    const tokenDivLanceur = document.getElementById("token-" + lanceur);
                    if (tokenDivLanceur) {
                        const magRuee = Math.sqrt(dx * dx + dy * dy) || 1;
                        const avanceX = (dx / magRuee) * 18 * window.VTT_SCALE;
                        const avanceY = (dy / magRuee) * 18 * window.VTT_SCALE;
                        tokenDivLanceur.style.transition = "transform 0.1s ease-out";
                        tokenDivLanceur.style.transform = `translate(calc(-50% + ${avanceX}px), calc(-50% + ${avanceY}px))`;
                        await new Promise(r => setTimeout(r, 100));
                        tokenDivLanceur.style.transition = "transform 0.15s ease-in";
                        tokenDivLanceur.style.transform = `translate(-50%, -50%)`;
                        await new Promise(r => setTimeout(r, 150));
                        tokenDivLanceur.style.transition = "none";
                    }
                }

                let esquive = window.esquiveCombattant(cibleData);
                let parade = window.paradeCombattant(cibleData);
                
                const statDef = Math.max(esquive, parade);
                const motDef = parade > esquive ? "Paré 🛡️" : "Esquivé 💨";
                const desCible = desDe(idCible);
                const aEsquive = desCible
                    ? !!desCible.esquive
                    : (Math.floor(Math.random() * 100) + 1) <= statDef;

                if (!attaque.isHeal && aEsquive) {
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

                        if (jeSuisLAuteur) {
                            updateDoc(window.refCombattant(idCible), {
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
                        let soinBrut = attaque.valeurBrute * (critique ? 2 : 1);
                        soinBrut = Math.floor(soinBrut * window.multiplicateurSoinsRecus(cibleData));
                        // Brûlé : -50% sur tous les soins reçus tant que l'état est actif.
                        if ((cibleData.Etats_Alteres || []).some(e => e.nom === "Brûlé")) {
                            soinBrut = Math.floor(soinBrut * 0.5);
                        }
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
jaugeContainer.className = "jauge-flash-token";
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
                        const purifie = (desCible && desCible.purifie !== undefined)
                            ? desCible.purifie
                            : (critique || (Math.floor(Math.random() * 100) + 1) <= attaque.purifChance);
                        if (purifie) {
                            cibleData.Etats_Alteres = [];
                            let delaiAffichage = attaque.valeurBrute > 0 ? 800 : 0;

                            setTimeout(() => {
                                if (tkCible) window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Purifié ✨", "#ffffff");
                            }, delaiAffichage);

                            if (jeSuisLAuteur) {
                                updateDoc(window.refCombattant(idCible), { Etats_Alteres: [] }).catch(e => console.error(e));
                            }
                            if (window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO]?.idPersonnage === idCible) {
                                if (typeof window.afficherPersoCombatActuel === "function") window.afficherPersoCombatActuel();
                            }
                        }
                    }

                    if (jeSuisLAuteur) {
                        const refPerso = window.refCombattant(idCible);
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
                    const defPhys = window.defPhysiqueCombattant(cibleData);
                    const defMag = window.defMagiqueCombattant(cibleData);
                    // Un critique double la frappe à la source : tout ce qui suit
                    // (malus au contact, absorption, résistances, étalement,
                    // bouclier) travaille ensuite sur ce montant doublé.
                    let degats = attaque.valeurBrute * (critique ? 2 : 1);
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

                    // Percer l'armure : le jet a été tranché au lancement, comme
                    // tous les autres. "Ignorer l'armure" ne vaut que contre la
                    // résistance PHYSIQUE (c'est ce que porte une armure) ;
                    // "ignorer les résistances" balaie les deux.
                    const desEquip = (desDe(idCible) || {}).equip || {};
                    const percee = desEquip.ignoreResistances === true
                                || (desEquip.ignoreArmure === true && attaque.typeRes !== "Magique");
                    if (percee) {
                        resistance = 0;
                        const tkPercee = window.TOKENS_VTT_DATA[idCible];
                        if (tkPercee) window.afficherMessageFlottantHex(tkPercee.q, tkPercee.r, "Armure percée !", "#ffd700");
                    }

                    let reduction = resistance / 100;
                    if (reduction > 1) reduction = 1;
                    let degatsFinaux = Math.round(degats * (1 - reduction));
                    if (degatsFinaux < 0) degatsFinaux = 0;

                    // Étalement des dégâts : on coupe le total en deux ici, une fois les
                    // résistances appliquées. Le reste (arrondi) part sur le premier tic, pour
                    // que les deux moitiés fassent exactement le total d'une attaque normale.
                    let degatsSecondTic = 0;
                    if (attaque.estEtalement && degatsFinaux > 0) {
                        degatsSecondTic = Math.floor(degatsFinaux / 2);
                        degatsFinaux = degatsFinaux - degatsSecondTic;
                    }

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
jaugeContainer.className = "jauge-flash-token";
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
jaugeContainer.className = "jauge-flash-token";
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

                    // 🔻 ÉTALEMENT DES DÉGÂTS : la moitié vient de tomber, on programme la seconde
                    // pour le début du tour suivant. Interdit si la cible porte déjà un DoT
                    // (Empoisonnement ou un autre étalement) : dans ce cas le second tic est
                    // simplement perdu, elle n'encaisse que la moitié.
                    let dotAjoute = false;
                    if (attaque.estEtalement && degatsSecondTic > 0) {
                        const dotDejaPresent = (cibleData.Etats_Alteres || []).some(e => e.estDot);
                        if (!dotDejaPresent) {
                            const etats = cibleData.Etats_Alteres ? [...cibleData.Etats_Alteres] : [];
                            etats.push({
                                nom: "Étalement",
                                icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1788096401/IMG_2083_pebnup.png",
                                desc: `Subira ${degatsSecondTic} dégâts au début du tour suivant.`,
                                chance: 100,
                                duree: 1, // Disparaît juste après avoir infligé son second tic
                                estDot: true,
                                degatsRestants: degatsSecondTic,
                                tickFait: false
                            });
                            cibleData.Etats_Alteres = etats;
                            dotAjoute = true;

                            if (tkCible) {
                                await new Promise(r => setTimeout(r, 500));
                                window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Dégâts étalés…", "#c2a878");
                            }
                        }
                    }

                    if (jeSuisLAuteur) {
                        const refPerso = window.refCombattant(idCible);
                        const updatePayload = { PV_Actuels: cibleData.PV_Actuels };
                        if (oldShield > 0) {
                            updatePayload.Bouclier_Actuel = cibleData.Bouclier_Actuel;
                            if (shieldDestroyed) updatePayload.Bouclier_Max = cibleData.Bouclier_Max;
                        }
                        if (dotAjoute) updatePayload.Etats_Alteres = cibleData.Etats_Alteres;
                        updateDoc(refPerso, updatePayload).catch(e => console.error(e));
                    }
                    if (dotAjoute) {
                        if (window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO]?.idPersonnage === idCible
                            && typeof window.afficherPersoCombatActuel === "function") {
                            window.afficherPersoCombatActuel();
                        }
                        if (typeof window.afficherPisteInitiative === "function") window.afficherPisteInitiative();
                    }
                    if (window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO]?.idPersonnage === idCible) {
                        window.COMBAT_PV_ACTUELS = cibleData.PV_Actuels;
                        if (typeof window.mettreAJourJaugePV === "function") window.mettreAJourJaugePV();
                    }
                    await new Promise(r => setTimeout(r, 1200));

                    // Une illusion n'a qu'un seul PV : le moindre coup encaissé la dissipe. On
                    // attend que les dégâts se soient affichés avant de la faire disparaître, et
                    // seul le client du lanceur écrit — les autres la voient s'effacer via les
                    // écouteurs Firestore déjà en place.
                    if (cibleData.estIllusion && (parseInt(cibleData.PV_Actuels) || 0) <= 0
                        && jeSuisLAuteur
                        && typeof window.detruireIllusion === "function") {
                        if (tkCible) window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Illusion dissipée", "#c2a878");
                        await window.detruireIllusion(idCible);
                        await new Promise(r => setTimeout(r, 600));
                    }

                    // Un monstre tombé à 0 PV est marqué Mort (son cadavre reste sur la carte
                    // jusqu'à la fin du combat, qui efface tout de la base), et un éventuel
                    // renfort prend sa place sur le terrain. Seul le client du lanceur écrit.
                    if (!cibleData.estIllusion && cibleData.estMonstre && cibleData.statut !== "Mort"
                        && (parseInt(cibleData.PV_Actuels) || 0) <= 0
                        && jeSuisLAuteur
                        && typeof window.marquerMonstreMort === "function") {
                        cibleData.statut = "Mort";
                        if (tkCible) window.afficherMessageFlottantHex(tkCible.q, tkCible.r, "Terrassé !", "#ff6b6b");
                        await window.marquerMonstreMort(idCible).catch(e => console.error(e));
                        await new Promise(r => setTimeout(r, 600));
                    }
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
                let esquive = window.esquiveCombattant(cData);
                let parade = window.paradeCombattant(cData);
                const statDef = Math.max(esquive, parade);
                const desSort = desDe(idCible);
                const esquiveLeSort = desSort
                    ? !!desSort.esquive
                    : (Math.floor(Math.random() * 100) + 1) <= statDef;
                
                if (esquiveLeSort) {
                    const tkCible = window.TOKENS_VTT_DATA[idCible];
                    if (tkCible) window.afficherMessageFlottantHex(tkCible.q, tkCible.r, parade > esquive ? "Paré 🛡️" : "Esquivé 💨", "#cccccc");
                    await new Promise(r => setTimeout(r, 1000));
                    continue; // Il a esquivé l'altération !
                }
            }
            
            let cibleModifiee = false;
            let poisonTickApplique = false;
            let nouveauxEtats = cData.Etats_Alteres ? [...cData.Etats_Alteres] : [];

            for (let alt of action.alterations) {
                // Poussée : pas un état persistant. Le jet et le déplacement ne sont faits qu'une
                // seule fois, par le lanceur, puis diffusés (Action_Poussee) pour que tous les
                // joueurs voient le même résultat — les autres clients ne font rien ici.
                if (alt.estPoussee) {
                    if (jeSuisLAuteur) {
                        const rollPoussee = Math.floor(Math.random() * 100) + 1;
                        console.log(`🎲 Jet de Poussée sur ${cData.nom} : Résultat ${rollPoussee} (Chance: ${alt.chance}%)`);
                        if ((critique || rollPoussee <= alt.chance) && typeof window.declencherPousseeCible === "function") {
                            await window.declencherPousseeCible(lanceur, idCible);
                        } else if (typeof window.diffuserEchecDeplacementForce === "function") {
                            await window.diffuserEchecDeplacementForce("Action_Poussee", idCible, "Poussée");
                        }
                    }
                    continue;
                }

                // Traction : même principe que la Poussée, sens inverse. Pas un état persistant.
                // Déjà résolue plus haut si elle précédait l'attaque sur la carte (tractionDejaResolue).
                if (alt.estTraction) {
                    if (tractionDejaResolue) continue;
                    if (jeSuisLAuteur) {
                        const rollTraction = Math.floor(Math.random() * 100) + 1;
                        console.log(`🎲 Jet de Traction sur ${cData.nom} : Résultat ${rollTraction} (Chance: ${alt.chance}%)`);
                        if ((critique || rollTraction <= alt.chance) && typeof window.declencherTractionCible === "function") {
                            await window.declencherTractionCible(lanceur, idCible);
                        } else if (typeof window.diffuserEchecDeplacementForce === "function") {
                            await window.diffuserEchecDeplacementForce("Action_Traction", idCible, "Traction");
                        }
                    }
                    continue;
                }

                // Peur : pas un état persistant. Même principe que Poussée/Traction (jet et
                // résolution une seule fois, par le lanceur, puis diffusés).
                if (alt.estPeur) {
                    if (jeSuisLAuteur) {
                        const rollPeur = Math.floor(Math.random() * 100) + 1;
                        console.log(`🎲 Jet de Peur sur ${cData.nom} : Résultat ${rollPeur} (Chance: ${alt.chance}%)`);
                        if ((critique || rollPeur <= alt.chance) && typeof window.declencherPeurCible === "function") {
                            await window.declencherPeurCible(lanceur, idCible);
                        } else if (typeof window.diffuserEchecDeplacementForce === "function") {
                            await window.diffuserEchecDeplacementForce("Action_Peur", idCible, "Peur");
                        }
                    }
                    continue;
                }

                // Le sort du jet d'application a été tranché au lancement de la
                // carte, critique compris : on le relit, on ne le rejoue pas.
                const desEtat = desDe(idCible);
                const etatPasse = (desEtat && desEtat.etats && desEtat.etats[alt.nom] !== undefined)
                    ? desEtat.etats[alt.nom]
                    : (critique || (Math.floor(Math.random() * 100) + 1) <= alt.chance);
                console.log(`🎲 [${alt.nom}] sur ${cData.nom} : ${etatPasse ? "appliqué" : "raté"}`
                            + ` (Chance: ${alt.chance}%)` + (critique ? " — imposé par le critique" : ""));

                // Un peuple immunisé ne l'attrape jamais : le jet a beau réussir,
                // et le critique a beau l'imposer, l'état ne prend pas sur lui.
                if (window.estImmunise(cData, alt.nom)) {
                    const tkImmun = window.TOKENS_VTT_DATA[idCible];
                    if (tkImmun) window.afficherMessageFlottantHex(tkImmun.q, tkImmun.r, "Immunisé", "#7fd4ff");
                    continue;
                }

                if (etatPasse) {
                    let existing = nouveauxEtats.find(e => e.nom === alt.nom);
                    if (existing) {
                        existing.duree = Math.max(existing.duree, alt.duree); // Rafraîchit la durée
                        // Pas de cumul, mais une nouvelle application redonne un tic de début de
                        // tour (voir la transition de round dans combat.js).
                        if (alt.estPoison) existing.tickFait = false;
                    } else {
                        nouveauxEtats.push({...alt});
                    }
                    cibleModifiee = true;

                    // Empoisonnement : tic immédiat de 15 fatigue + 8% des PV max, indépendant du
                    // jet de chance déjà validé ci-dessus (le 2e tic se joue au début du tour
                    // suivant, voir la transition de round dans combat.js). Même retour visuel
                    // (flash + barre qui se vide) qu'une attaque classique, sur demande de Nico.
                    if (alt.estPoison) {
                        const pvMaxPoison = window.pvMaxCombattant(cData);
                        const pvActuelsPoison = cData.PV_Actuels !== undefined ? parseInt(cData.PV_Actuels) : pvMaxPoison;
                        const nouveauPvPoison = Math.max(0, pvActuelsPoison - Math.ceil(pvMaxPoison * 0.08));
                        const perteViePoison = pvActuelsPoison - nouveauPvPoison;
                        cData.PV_Actuels = nouveauPvPoison;

                        const fatigueMaxPoison = window.fatigueMaxCombattant(cData);
                        const fatigueActuellePoison = cData.fatigueActuelle !== undefined ? parseInt(cData.fatigueActuelle) : fatigueMaxPoison;
                        const nouvelleFatiguePoison = Math.max(0, fatigueActuellePoison - 15);
                        const perteFatiguePoison = fatigueActuellePoison - nouvelleFatiguePoison;
                        cData.fatigueActuelle = nouvelleFatiguePoison;

                        poisonTickApplique = true;

                        if (window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO]?.idPersonnage === idCible) {
                            window.COMBAT_PV_ACTUELS = cData.PV_Actuels;
                            window.COMBAT_FATIGUE_ACTUELLE = cData.fatigueActuelle;
                            // Le poison mord la vie ET l'énergie : les deux jauges du panneau
                            // doivent suivre, pas seulement celle de l'énergie.
                            if (typeof window.mettreAJourJaugeFatigue === "function") window.mettreAJourJaugeFatigue(0);
                            if (typeof window.mettreAJourJaugePV === "function") window.mettreAJourJaugePV();
                        }

                        const tkPoison = window.TOKENS_VTT_DATA[idCible];
                        if (tkPoison && perteFatiguePoison > 0) {
                            window.afficherMessageFlottantHex(tkPoison.q, tkPoison.r, `-${perteFatiguePoison} ⚡`, "#ffaa00");
                            await new Promise(r => setTimeout(r, 600));
                        }
                        if (perteViePoison > 0 && typeof window.afficherFlashDegatToken === "function") {
                            window.afficherFlashDegatToken(idCible, pvActuelsPoison, nouveauPvPoison, pvMaxPoison, `-${perteViePoison} 🩸`, "#ff4c4c");
                            await new Promise(r => setTimeout(r, 900));
                        }
                    }

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

                // Envoi à la BDD
                if (jeSuisLAuteur) {
                    const payloadAlterations = { Etats_Alteres: nouveauxEtats };
                    if (poisonTickApplique) {
                        payloadAlterations.PV_Actuels = cData.PV_Actuels;
                        payloadAlterations.Fatigue_Actuelle = cData.fatigueActuelle;
                    }
                    await updateDoc(window.refCombattant(idCible), payloadAlterations).catch(e=>console.error(e));
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

    // Ce que l'équipement laisse derrière la carte, une fois toutes les cibles
    // résolues : élan, bénédictions, pas de retraite.
    await window.appliquerSuitesEquipement(action, jeSuisLAuteur);

    if (jeSuisLAuteur) {
        if (lanceurData && lanceurData.estMonstre) {
            // Une créature paie sa carte comme tout le monde — sans quoi elle ne
            // se fatiguait jamais et ne soufflait jamais. Mais c'est l'IA qui rend
            // la main : validerCarteCombat enchaînerait une seconde fin de tour.
            if (typeof window.deduireFatigueCarte === "function") {
                window.deduireFatigueCarte(lanceur, action.idCarte);
            }
        } else {
            // Le lanceur de l'action, pas le combattant affiché : c'est SON tour
            // qui s'achève, et lui seul que la file doit laisser passer.
            window.validerCarteCombat(action.idCarte, null, action.idLanceur);
        }
    }
};

// Lancer une carte ne suffit pas à la faire finir : le moteur rejoue ensuite
// l'animation cible par cible, et c'est LÀ que tombent les dégâts, les états et
// les déplacements forcés — une fuite de Peur dure plusieurs secondes. L'IA, qui
// n'attendait que sa propre pause, enchaînait le tour suivant pendant ce
// temps-là : la créature d'après se déplaçait sur des positions périmées et
// récoltait une attaque d'opportunité d'un joueur qui, à l'écran, avait déjà fui.
// Ce drapeau et ce marqueur de fin lui donnent de quoi attendre la fin réelle.
const resolutionCarte = window.jouerAnimationMoteur;
window.jouerAnimationMoteur = async function(action) {
    window.ANIMATION_MOTEUR_EN_COURS = true;
    try {
        return await resolutionCarte(action);
    } finally {
        window.ANIMATION_MOTEUR_EN_COURS = false;
        window.DERNIERE_RESOLUTION_TERMINEE = action && action.timestamp;
    }
};