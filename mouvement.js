import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// =========================================================================
//  MOTEUR DE DÉPLACEMENT TACTIQUE (PATHFINDING & ANIMATION)
// =========================================================================

window.CHEMIN_MOUVEMENT = [];
window.CHEMIN_START_NODE = null;

// Un personnage peut repartir tant qu'il n'a pas lancé sa carte : il faut donc
// se souvenir du nombre de cases DÉJÀ parcourues ce tour-ci, sinon le barème
// (2 ⚡ pour les trois premières, 4 ⚡ jusqu'à la sixième, 6 ⚡ ensuite) repartirait
// à zéro à chaque reprise et marcher en plusieurs fois coûterait moins cher.
// La valeur de référence vit dans la file d'attente en base — elle survit à un
// rechargement et vaut pour tous les postes ; la copie locale prend le relais
// pendant le temps d'aller-retour du réseau.
window.PAS_PARCOURUS_TOUR = { id: null, tour: null, pas: 0 };

window.pasDejaParcourus = function(idPerso) {
    const partie = window.PARTIE_DATA || {};
    const queue = partie.File_Attente_Combat || [];
    const tour = partie.Tour_Combat || 0;

    const enBase = (queue.length > 0 && queue[0].idPersonnage === idPerso)
        ? (parseInt(queue[0].pasParcourus) || 0) : 0;
    const memoire = window.PAS_PARCOURUS_TOUR;
    const enLocal = (memoire.id === idPerso && memoire.tour === tour) ? memoire.pas : 0;

    // Le plus élevé des deux : la base peut être en retard juste après une
    // validation, la copie locale peut l'être juste après un rechargement.
    return Math.max(enBase, enLocal);
};
window.MOUVEMENT_COUT_TOTAL = 0;

window.COUT_COMPETENCE_SELECTIONNEE = 0; 
window.ANIMATION_VTT_EN_COURS = false;

// Fonction de message flottant (UI)
// "options" permet de sortir un message du lot — un coup critique, par exemple —
// sans toucher aux dizaines d'appels existants, qui gardent les valeurs par défaut.
window.afficherMessageFlottantHex = function(q, r, texte, couleur = "#ff4c4c", options = {}) {
    const conteneur = document.getElementById("conteneur-plateau-vtt");
    if (!conteneur || !window.PLATEAU_VTT) return;
    
    const px = window.PLATEAU_VTT.hexToPixel(q, r);
    
    // Le conteneur n'est pas zoomé : on convertit la case en position écran
    const ecranX = window.VTT_POS_X + px.x * window.VTT_SCALE;
    const ecranY = window.VTT_POS_Y + px.y * window.VTT_SCALE;
    
    const msg = document.createElement("div");
    msg.innerText = texte;
    msg.style.position = "absolute";
    msg.style.left = ecranX + "px";
    msg.style.top = (ecranY - 30) + "px";
    msg.style.transform = "translate(-50%, -50%)";
    msg.style.color = couleur;
    msg.style.fontWeight = "bold";
    msg.style.fontSize = (options.taille || 18) + "px";
    msg.style.fontFamily = "'Cinzel', serif";
    msg.style.textShadow = options.eclat
        ? "0 0 6px black, 0 0 12px black, 0 0 20px " + couleur + ", 2px 2px 3px black"
        : "0 0 5px black, 0 0 10px black, 2px 2px 2px black";
    if (options.eclat) msg.style.letterSpacing = "2px";
    msg.style.pointerEvents = "none";
    msg.style.zIndex = "1000";
    msg.style.whiteSpace = "nowrap";
    msg.style.transition = "top 1s ease-out, opacity 1s ease-out";
    
    conteneur.appendChild(msg);
    
    setTimeout(() => {
        msg.style.top = (ecranY - 100) + "px";
        msg.style.opacity = "0";
    }, 50);
    
    setTimeout(() => msg.remove(), 1050);
};

function hexDistance(a, b) {
    let aq = a.q, ar = a.r, as = -a.q - a.r;
    let bq = b.q, br = b.r, bs = -b.q - b.r;
    return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
}

// 🔻 CORRECTION 1 : Algorithme A* prenant en compte le surcoût des terrains difficiles
function calculerCheminAStar(startHex, endHex) {
    let openSet = [startHex];
    let cameFrom = new Map();
    let gScore = new Map();
    let fScore = new Map();

    const hash = (hex) => `${hex.q},${hex.r}`;
    gScore.set(hash(startHex), 0);
    fScore.set(hash(startHex), hexDistance(startHex, endHex));

    while (openSet.length > 0) {
        openSet.sort((a, b) => fScore.get(hash(a)) - fScore.get(hash(b)));
        let current = openSet.shift();

        if (current.q === endHex.q && current.r === endHex.r) {
            let path = [current];
            while (cameFrom.has(hash(current))) {
                current = cameFrom.get(hash(current));
                path.push(current);
            }
            return path.reverse().slice(1); 
        }

        const directions = [ {q:1, r:0}, {q:1, r:-1}, {q:0, r:-1}, {q:-1, r:0}, {q:-1, r:1}, {q:0, r:1} ];
        
        for (let d of directions) {
            let neighbor = { q: current.q + d.q, r: current.r + d.r };
            
            const state = window.PLATEAU_VTT.getCaseState(neighbor.q, neighbor.r);
            if (state.isBlocked || state.isDeleted) continue;
            
            // Un cadavre ne barre plus la route : on lui passe dessus (cf. window.estCombattantMort).
            if (window.caseOccupeeParVivant(neighbor.q, neighbor.r)) continue;

            let inPath = window.CHEMIN_MOUVEMENT.some(step => step.q === neighbor.q && step.r === neighbor.r);
            if (inPath || (window.CHEMIN_START_NODE && window.CHEMIN_START_NODE.q === neighbor.q && window.CHEMIN_START_NODE.r === neighbor.r)) {
                continue; 
            }

            // Poids cognitif pour l'A* : Si c'est difficile, l'IA pèse le pas à 2 au lieu de 1
            let costStep = state.isDifficult ? 2 : 1;
            let tentativeGScore = gScore.get(hash(current)) + costStep;

            if (!gScore.has(hash(neighbor)) || tentativeGScore < gScore.get(hash(neighbor))) {
                cameFrom.set(hash(neighbor), current);
                gScore.set(hash(neighbor), tentativeGScore);
                fScore.set(hash(neighbor), tentativeGScore + hexDistance(neighbor, endHex));
                if (!openSet.some(h => h.q === neighbor.q && h.r === neighbor.r)) {
                    openSet.push(neighbor);
                }
            }
        }
    }
    return []; 
}

// Exposés pour l'IA des monstres (monstres_ia.js) : elle a besoin de MESURER des
// distances et d'ESSAYER des trajets pour choisir où aller, sans rien dessiner ni
// modifier l'état du déplacement en cours. Le déplacement réel, lui, passe comme
// pour un joueur par ajouterEtapeMouvement() puis validerMouvement().
window.hexDistanceVTT = hexDistance;
window.calculerCheminVTT = calculerCheminAStar;

window.ajouterEtapeMouvement = function(q, r) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    // 🔻 CORRECTION 2 : Clic d'annulation (Undo / Effaceur) 🔻
    // Si on clique sur le perso lui-même, on annule tout
    if (window.CHEMIN_START_NODE && window.CHEMIN_START_NODE.q === q && window.CHEMIN_START_NODE.r === r) {
        window.annulerMouvement();
        return;
    }
    
    // Si on clique sur une case du chemin déjà tracé, on coupe la route à cet endroit !
    let inPathIndex = window.CHEMIN_MOUVEMENT.findIndex(step => step.q === q && step.r === r);
    if (inPathIndex !== -1) {
        // On coupe le tableau (slice) pour ne garder que le chemin jusqu'au clic
        window.CHEMIN_MOUVEMENT = window.CHEMIN_MOUVEMENT.slice(0, inPathIndex + 1);
        
        // Recalcul de l'énergie totale (en lisant les coûts déjà enregistrés dans le tableau)
        window.MOUVEMENT_COUT_TOTAL = 0;
        window.CHEMIN_MOUVEMENT.forEach(step => {
            window.MOUVEMENT_COUT_TOTAL += step.cost;
        });
        
        window.dessinerCheminMouvement();
        
        const bulle = document.getElementById("bulle-validation-mouvement");
        const texteCout = document.getElementById("mouvement-cout-total");
        if (bulle && texteCout) {
            texteCout.innerText = window.MOUVEMENT_COUT_TOTAL + " ⚡";
            texteCout.style.color = "#ffaa00";
        }
        return;
    }

    // Le reste du script de tracé
    const state = window.PLATEAU_VTT.getCaseState(q, r);
    if (state.isBlocked || state.isDeleted) {
        window.afficherMessageFlottantHex(q, r, "Passage bloqué");
        return;
    }
    
    // Seul un combattant debout occupe vraiment la case : on peut finir son
    // déplacement sur le cadavre d'un mort.
    if (window.caseOccupeeParVivant(q, r)) {
        window.afficherMessageFlottantHex(q, r, "Case occupée");
        return;
    }

    let startHex = window.CHEMIN_MOUVEMENT.length > 0 
        ? window.CHEMIN_MOUVEMENT[window.CHEMIN_MOUVEMENT.length - 1] 
        : window.CHEMIN_START_NODE;

    let segment = calculerCheminAStar(startHex, {q, r});
    
    if (segment.length === 0) {
        window.afficherMessageFlottantHex(q, r, "Aucun chemin praticable");
        return;
    }

    const persoActuel = window.COMBAT_PERSOS_JOUEUR ? window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO] : null;
    const fatigueBrute = persoActuel ? persoActuel.fatigueActuelle : (window.COMBAT_FATIGUE_ACTUELLE || 0);
    const coutCompetence = window.COUT_COMPETENCE_SELECTIONNEE || 0;
    const fatigueDispo = fatigueBrute - coutCompetence;

    // Glacé : le coût en fatigue du mouvement (à pied) est doublé tant que l'état est actif,
    // cumulable avec le doublement du terrain difficile.
    const estGlace = persoActuel && persoActuel.Etats_Alteres
        && persoActuel.Etats_Alteres.some(e => e.nom === "Glacé");

    // Cases gratuites accumulées en frappant (état "Repli", cf. moteur_effets.js).
    const casesOffertes = typeof window.bonusEquip === "function"
        ? window.bonusEquip(persoActuel, "hexApresAttaque") : 0;

    for (let i = 0; i < segment.length; i++) {
        let step = segment[i];

        let numeroCase = window.pasDejaParcourus(window.TOKEN_SELECTIONNE)
                       + window.CHEMIN_MOUVEMENT.length + 1;
        let baseCost = 2;
        let couleur = "#ffffff";

        if (numeroCase >= 4 && numeroCase <= 6) {
            baseCost = 4;
            couleur = "#ff8c00";
        } else if (numeroCase >= 7) {
            baseCost = 6;
            couleur = "#ff4c4c";
        }

        const stepState = window.PLATEAU_VTT.getCaseState(step.q, step.r);
        if (stepState.isDifficult) {
            baseCost *= 2;
            couleur = "#b366ff";
        }

        if (estGlace) baseCost *= 2;

        // Atout du Vargen : il se déplace pour deux fois moins cher. Appliqué en
        // dernier, donc APRÈS le terrain difficile et le Glacé : le prédateur
        // garde son avantage même sur un sol qui coûte double.
        const diviseur = window.atoutRace(persoActuel).diviseurDeplacement || 1;
        if (diviseur > 1) baseCost = Math.max(1, Math.round(baseCost / diviseur));

        // L'équipement alourdit ou allège chaque case : le bouclier lourd coûte
        // une énergie de plus, le couteau une de moins. Une case ne descend
        // jamais sous 1 : se déplacer coûte toujours quelque chose.
        const modEquip = typeof window.bonusEquip === "function"
            ? window.bonusEquip(persoActuel, "coutDeplacement") : 0;
        if (modEquip) baseCost = Math.max(1, baseCost + modEquip);

        // Le pas de retraite offert par une arme : les premières cases du
        // prochain déplacement sont gratuites. Elles sont comptées sur le
        // chemin en cours de tracé, et l'état est consommé à la validation.
        if (window.CHEMIN_MOUVEMENT.length < casesOffertes) {
            baseCost = 0;
            couleur = "#ffd700";
        }

        if (window.MOUVEMENT_COUT_TOTAL + baseCost > fatigueDispo) {
            window.afficherMessageFlottantHex(step.q, step.r, "Énergie insuffisante");
            break; 
        }

        window.CHEMIN_MOUVEMENT.push({
            q: step.q, r: step.r,
            cost: baseCost,
            color: couleur
        });
        window.MOUVEMENT_COUT_TOTAL += baseCost;
    }

    window.dessinerCheminMouvement();
    
    // La bulle est en position fixe au-dessus de TOUT l'écran : si la fenêtre de
    // combat n'est pas ouverte, elle viendrait se poser par-dessus l'écran où se
    // trouve le joueur (création de personnage, carte du monde...). On ne
    // l'affiche donc que si le combat est bien à l'écran.
    const combatOuvert = document.getElementById("fenetre-combat")?.style.display === "block";
    const bulle = document.getElementById("bulle-validation-mouvement");
    const texteCout = document.getElementById("mouvement-cout-total");
    if (bulle && texteCout && combatOuvert) {
        texteCout.innerText = window.MOUVEMENT_COUT_TOTAL + " ⚡";
        bulle.style.display = "flex";
        texteCout.style.color = "#ffaa00"; 
    } else if (bulle && !combatOuvert) {
        bulle.style.display = "none";
    }
};

window.dessinerCheminMouvement = function() {
    let svg = document.getElementById("svg-chemin-mouvement");
    if (!svg) return;
    svg.innerHTML = "";

    if (window.CHEMIN_MOUVEMENT.length === 0) return;

    let defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    svg.appendChild(defs);

    let groupeLignes = document.createElementNS("http://www.w3.org/2000/svg", "g");
    let groupeBulles = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.appendChild(groupeLignes);
    svg.appendChild(groupeBulles);

    let currentPx = window.PLATEAU_VTT.hexToPixel(window.CHEMIN_START_NODE.q, window.CHEMIN_START_NODE.r);
    let previousColor = "#ffffff"; 

    window.CHEMIN_MOUVEMENT.forEach((step, index) => {
        let nextPx = window.PLATEAU_VTT.hexToPixel(step.q, step.r);
        let currentColor = step.color;
        let gradId = `grad-mouv-${index}`;

        let linearGradient = document.createElementNS("http://www.w3.org/2000/svg", "linearGradient");
        linearGradient.setAttribute("id", gradId);
        linearGradient.setAttribute("gradientUnits", "userSpaceOnUse");
        linearGradient.setAttribute("x1", currentPx.x);
        linearGradient.setAttribute("y1", currentPx.y);
        linearGradient.setAttribute("x2", nextPx.x);
        linearGradient.setAttribute("y2", nextPx.y);

        let stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop1.setAttribute("offset", "0%");
        stop1.setAttribute("stop-color", previousColor);

        let stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
        stop2.setAttribute("offset", "100%");
        stop2.setAttribute("stop-color", currentColor);

        linearGradient.appendChild(stop1);
        linearGradient.appendChild(stop2);
        defs.appendChild(linearGradient);

        let line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", currentPx.x); 
        line.setAttribute("y1", currentPx.y);
        line.setAttribute("x2", nextPx.x); 
        line.setAttribute("y2", nextPx.y);
        
        line.setAttribute("stroke", `url(#${gradId})`);
        line.setAttribute("stroke-width", "5");
        line.setAttribute("opacity", "0.85"); 
        
        line.setAttribute("stroke-dasharray", "0, 12"); 
        line.setAttribute("stroke-linecap", "round"); 
        line.style.filter = "drop-shadow(0px 3px 5px rgba(0,0,0,0.8))";
        
        groupeLignes.appendChild(line);

        // 🔻 CORRECTION 3 : Recadrage mathématique parfait au pixel de la bulle SVG
        let rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", nextPx.x - 14); // Élargi de 1px à gauche
        rect.setAttribute("y", nextPx.y - 11); // Élargi de 1px en haut
        rect.setAttribute("width", "28");      // Plus de marge horizontale
        rect.setAttribute("height", "22");     // Plus de marge verticale
        rect.setAttribute("rx", "11");
        rect.setAttribute("fill", "rgba(20, 15, 10, 0.95)");
        rect.setAttribute("stroke", currentColor);
        rect.setAttribute("stroke-width", "1.5");
        groupeBulles.appendChild(rect);

        let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", nextPx.x - 1); // Pousse très légèrement l'ensemble à gauche
        text.setAttribute("y", nextPx.y + 1); // Ajustement optique vers le bas pour le "baseline"
        text.setAttribute("dominant-baseline", "central"); 
        text.setAttribute("fill", currentColor);
        text.setAttribute("font-family", "Arial");
        text.setAttribute("font-weight", "bold");
        text.setAttribute("text-anchor", "middle");

        let tspanIcon = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        tspanIcon.setAttribute("font-size", "10"); 
        tspanIcon.textContent = "⚡";

        let tspanCost = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        tspanCost.setAttribute("font-size", "13"); // Léger grossissement pour équilibrer l'éclair
        tspanCost.setAttribute("dx", "1.5");
        tspanCost.textContent = step.cost;

        text.appendChild(tspanIcon);
        text.appendChild(tspanCost);
        groupeBulles.appendChild(text);

        currentPx = nextPx;
        previousColor = currentColor;
    });
};

window.annulerMouvement = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    window.CHEMIN_MOUVEMENT = [];
    window.MOUVEMENT_COUT_TOTAL = 0;
    
    const svg = document.getElementById("svg-chemin-mouvement");
    if (svg) svg.innerHTML = "";
    
    const bulle = document.getElementById("bulle-validation-mouvement");
    if (bulle) bulle.style.display = "none";
};

window.validerMouvement = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    const idPerso = window.TOKEN_SELECTIONNE;
    const finalStep = window.CHEMIN_MOUVEMENT[window.CHEMIN_MOUVEMENT.length - 1];
    if (!finalStep) return;

    // La copie locale est posée AVANT l'écriture réseau : le joueur peut repartir
    // dans la seconde qui suit, sans attendre le retour de la base.
    const nbPas = window.CHEMIN_MOUVEMENT.length;
    const tourCourant = (window.PARTIE_DATA || {}).Tour_Combat || 0;
    window.PAS_PARCOURUS_TOUR = {
        id: idPerso,
        tour: tourCourant,
        pas: window.pasDejaParcourus(idPerso) + nbPas
    };

    // Les pions ne pivotent plus jamais : le chemin ne porte plus que les coordonnées de chaque étape.
    let pathAvecAngles = window.CHEMIN_MOUVEMENT.map(step => ({ q: step.q, r: step.r }));

    // ATTAQUES D'OPPORTUNITÉ : on suit le contact adversaire (corps-à-corps) case par case le
    // long du trajet, pas juste avant/après le déplacement entier, pour savoir PRÉCISÉMENT à
    // quelle étape chaque ennemi est quitté. Le jet et les dégâts sont tranchés ici (une seule
    // fois, avant même d'écrire le déplacement) et embarqués dans Action_Mouvement : l'animation
    // pourra alors marquer une vraie pause à cet endroit chez tous les joueurs, au lieu de jouer
    // l'attaque après coup une fois le déplacement terminé.
    const hexDepart = { q: window.TOKENS_VTT_DATA[idPerso].q, r: window.TOKENS_VTT_DATA[idPerso].r };
    const opportunitesResolues = [];
    if (typeof window.listerEnnemisAuContact === "function" && typeof window.resoudreAttaqueOpportunite === "function") {
        let contactPrecedent = new Set(window.listerEnnemisAuContact(idPerso, hexDepart));
        for (let i = 0; i < pathAvecAngles.length; i++) {
            const contactActuel = new Set(window.listerEnnemisAuContact(idPerso, pathAvecAngles[i]));
            for (const idEnnemi of contactPrecedent) {
                if (!contactActuel.has(idEnnemi)) {
                    const resultat = await window.resoudreAttaqueOpportunite(idEnnemi, idPerso);
                    if (resultat) opportunitesResolues.push({ apresEtape: i, ...resultat });
                }
            }
            contactPrecedent = contactActuel;
        }
    }

    // ZONES PERSISTANTES : chaque case de zone franchie déclenche son propre jet (« s'il
    // continue dans la zone, ça continue »). Tranché ici une seule fois, comme les attaques
    // d'opportunité, puis embarqué dans Action_Mouvement pour être rejoué à l'identique partout.
    const zonesResolues = [];
    if (typeof window.resoudreZonesPersistantesSurCase === "function") {
        for (let i = 0; i < pathAvecAngles.length; i++) {
            const resultats = await window.resoudreZonesPersistantesSurCase(idPerso, pathAvecAngles[i]);
            if (resultats) zonesResolues.push({ apresEtape: i, resultats: resultats });
        }
    }

    const bulle = document.getElementById("bulle-validation-mouvement");
    if (bulle) bulle.style.display = "none";
    const svg = document.getElementById("svg-chemin-mouvement");
    if (svg) svg.innerHTML = "";

    // Déduction locale
    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
    let nvlFatigue = persoActuel.fatigueActuelle - window.MOUVEMENT_COUT_TOTAL;
    persoActuel.fatigueActuelle = nvlFatigue;
    window.COMBAT_FATIGUE_ACTUELLE = nvlFatigue;

    // COMBAT_PERSOS_JOUEUR et PERSOS_PARTIE sont deux copies distinctes du même personnage :
    // sans cette synchronisation, afficherPersoCombatActuel() (via chargerCompetencesCombat)
    // relit l'ancienne fatigue depuis PERSOS_PARTIE juste après et écrase la jauge, donnant
    // l'impression que le déplacement n'a rien coûté.
    const persoPartie = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === persoActuel.idPersonnage);
    if (persoPartie) persoPartie.fatigueActuelle = nvlFatigue;

    // 🔻 NOUVEAU : Désélection automatique de la carte si on n'a plus l'énergie après avoir marché 🔻
    if (window.COUT_COMPETENCE_SELECTIONNEE > 0 && window.COUT_COMPETENCE_SELECTIONNEE > nvlFatigue) {
        window.COUT_COMPETENCE_SELECTIONNEE = 0;
        // Rafraîchit l'UI des cartes pour la dé-sélectionner visuellement
        if (typeof window.actualiserEtatCarteCombat === "function") window.actualiserEtatCarteCombat();
    }

    if (typeof window.mettreAJourJaugeFatigue === "function") window.mettreAJourJaugeFatigue(0);
    // Rafraîchit toute la fiche du perso
    if (typeof window.afficherPersoCombatActuel === "function") window.afficherPersoCombatActuel();

    try {
        window.TOKENS_VTT_DATA[idPerso].q = finalStep.q;
        window.TOKENS_VTT_DATA[idPerso].r = finalStep.r;

        // Sous transaction : la file d'attente est partagée par tous les postes, et
        // la réécrire à partir d'une lecture périmée effacerait la carte qu'un
        // autre joueur vient d'y poser (cf. window.modifierPartie).
        await window.modifierPartie((data) => {
            const file = data.File_Attente_Combat || [];
            if (file.length > 0 && file[0].idPersonnage === idPerso) {
                // Le déplacement ne se ferme plus au premier arrêt : on cumule les pas,
                // et c'est le lancement de la carte (qui met fin au tour) qui l'arrête.
                file[0].pasParcourus = (parseInt(file[0].pasParcourus) || 0) + nbPas;
            }
            return { maj: {
                File_Attente_Combat: file,
                Action_Mouvement: {
                    idToken: idPerso,
                    path: pathAvecAngles,
                    opportunites: opportunitesResolues,
                    zones: zonesResolues,
                    timestamp: new Date().getTime()
                }
            } };
        });

        const persoRef = window.refCombattant(idPerso);
        await updateDoc(persoRef, { Fatigue_Actuelle: nvlFatigue });

        await window.enregistrerPionsVTT(idPerso);

    } catch (e) {
        console.error("Erreur de Validation Mouvement :", e);
    }

    window.CHEMIN_MOUVEMENT = [];
    window.MOUVEMENT_COUT_TOTAL = 0;
};

// =========================================================================
//  L'ANIMATION SYNCHRONISÉE CHEZ TOUS LES JOUEURS
// =========================================================================

window.jouerAnimationMouvement = async function(actionMouvement) {
    const tokenDiv = document.getElementById("token-" + actionMouvement.idToken);
    if (!tokenDiv) return;

    window.ANIMATION_VTT_EN_COURS = true;

    tokenDiv.style.transition = "left 0.4s linear, top 0.4s linear";

    const imgMain = tokenDiv.querySelector(".token-img-main");
    // Petit "bond" à chaque case : le pion grandit légèrement en s'élançant vers la case
    // suivante, puis retombe (rétréci) pile au moment où il l'atteint. Purement cosmétique
    // (sur l'image, pas le pion lui-même) : ça n'a aucun impact sur la position/le timing du
    // déplacement, qui reste calé sur les mêmes 400ms par case qu'avant.
    if (imgMain) imgMain.style.transition = "transform 0.15s ease-out";

    for (let i = 0; i < actionMouvement.path.length; i++) {
        let step = actionMouvement.path[i];

        // Attaque(s) d'opportunité déclenchée(s) en quittant le corps-à-corps à CETTE étape : le
        // personnage s'arrête sur sa case actuelle (encore au contact, avant de la quitter),
        // l'attaque se joue là (même résultat chez tous les joueurs, déjà tranché par
        // validerMouvement), puis seulement ensuite il avance vers la case suivante.
        const positionActuelle = { q: parseFloat(tokenDiv.dataset.q), r: parseFloat(tokenDiv.dataset.r) };
        const opportunitesIci = (actionMouvement.opportunites || []).filter(o => o.apresEtape === i);
        for (const opp of opportunitesIci) {
            if (typeof window.jouerAnimationOpportunite === "function") {
                await window.jouerAnimationOpportunite({ ...opp, hexPosition: positionActuelle });
            }
        }
        if (opportunitesIci.length > 0) {
            // jouerAnimationOpportunite change tokenDiv.style.transition (teinte rouge sur le
            // dégât) : on la restaure avant de reprendre la marche.
            tokenDiv.style.transition = "left 0.4s linear, top 0.4s linear";
        }

        if (imgMain) imgMain.style.transform = "scale(1.12)";

        // On met à jour la case de référence : le pion suit le zoom et le pan même en pleine marche
        tokenDiv.dataset.q = step.q;
        tokenDiv.dataset.r = step.r;
        window.positionnerTokenVTT(tokenDiv, true);

        await new Promise(r => setTimeout(r, 250));

        if (imgMain) imgMain.style.transform = "scale(1)";

        await new Promise(r => setTimeout(r, 150));

        // Zone persistante franchie : contrairement à l'attaque d'opportunité (qui se joue avant
        // de quitter la case), le piège se déclenche une fois le pion ARRIVÉ sur la case.
        const zonesIci = (actionMouvement.zones || []).filter(z => z.apresEtape === i);
        for (const entree of zonesIci) {
            for (const res of (entree.resultats || [])) {
                if (typeof window.jouerAnimationZonePersistante === "function") {
                    await window.jouerAnimationZonePersistante(res, step);
                }
            }
        }
        if (zonesIci.length > 0) tokenDiv.style.transition = "left 0.4s linear, top 0.4s linear";
    }

    tokenDiv.style.transition = "none";
    if (imgMain) {
        imgMain.style.transition = "none";
        imgMain.style.transform = "";
    }

    window.ANIMATION_VTT_EN_COURS = false;
    if (typeof window.appliquerTokensVTT === "function") {
        window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    }
};

// Le Bond : pas un déplacement classique, un saut à vol d'oiseau vers la case d'arrivée.
// Rétréci -> grandi pendant le trajet -> rétréci à l'atterrissage -> taille normale.
window.jouerAnimationBond = async function(data) {
    const tokenDiv = document.getElementById("token-" + data.idToken);
    if (!tokenDiv || !window.PLATEAU_VTT) return;

    const imgMain = tokenDiv.querySelector(".token-img-main");

    window.ANIMATION_VTT_EN_COURS = true;

    tokenDiv.style.transition = "left 0.25s ease-in-out, top 0.25s ease-in-out";
    if (imgMain) imgMain.style.transition = "transform 0.12s ease-in-out";

    if (imgMain) imgMain.style.transform = "scale(0.85)";
    await new Promise(r => setTimeout(r, 120));

    tokenDiv.dataset.q = data.arrivee.q;
    tokenDiv.dataset.r = data.arrivee.r;
    window.positionnerTokenVTT(tokenDiv, false);
    if (imgMain) imgMain.style.transform = "scale(1.15)";
    await new Promise(r => setTimeout(r, 250));

    if (imgMain) imgMain.style.transform = "scale(0.85)";
    await new Promise(r => setTimeout(r, 120));

    if (imgMain) imgMain.style.transform = "scale(1)";
    await new Promise(r => setTimeout(r, 150));

    tokenDiv.style.transition = "none";
    if (imgMain) {
        imgMain.style.transition = "none";
        imgMain.style.transform = "";
    }

    // Zone persistante sur la case d'arrivée (saut ou déplacement forcé) : déjà tranchée par
    // celui qui a déclenché l'effet, on ne fait que la rejouer ici.
    for (const res of (data.zones || [])) {
        if (typeof window.jouerAnimationZonePersistante === "function") {
            await window.jouerAnimationZonePersistante(res, data.arrivee);
        }
    }

    window.ANIMATION_VTT_EN_COURS = false;
    if (typeof window.appliquerTokensVTT === "function") {
        window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    }
};

// Peur : réutilise telle quelle l'animation de marche classique (même "bond" par case, même
// pause pour les attaques d'opportunité en chemin) — declencherPeurCible construit son chemin
// exactement dans le même format qu'un déplacement normal (path + opportunites).
window.jouerAnimationPeur = async function(data) {
    if (data.echec) {
        const tk = window.TOKENS_VTT_DATA ? window.TOKENS_VTT_DATA[data.idToken] : null;
        if (tk && typeof window.afficherMessageFlottantHex === "function") {
            window.afficherMessageFlottantHex(tk.q, tk.r, `${data.nomEffet || "Peur"} loupée`, "#aaaaaa");
        }
        return;
    }
    await window.jouerAnimationMouvement(data);
};

// La Poussée : même animation que le Bond, sans le rétrécissement de départ (la cible ne
// s'y attend pas, l'impact est immédiat) — grandi pendant le trajet -> rétréci à
// l'atterrissage -> taille normale.
window.jouerAnimationPoussee = async function(data) {
    // Jet raté : rien ne bouge, juste un petit message pour que tout le monde comprenne que
    // l'effet a été tenté mais n'a pas fonctionné (et que ce n'est pas un bug).
    if (data.echec) {
        const tk = window.TOKENS_VTT_DATA ? window.TOKENS_VTT_DATA[data.idToken] : null;
        if (tk && typeof window.afficherMessageFlottantHex === "function") {
            window.afficherMessageFlottantHex(tk.q, tk.r, `${data.nomEffet || "Effet"} loupée`, "#aaaaaa");
        }
        return;
    }

    const tokenDiv = document.getElementById("token-" + data.idToken);
    if (!tokenDiv || !window.PLATEAU_VTT) return;

    const imgMain = tokenDiv.querySelector(".token-img-main");

    window.ANIMATION_VTT_EN_COURS = true;

    tokenDiv.style.transition = "left 0.25s ease-in-out, top 0.25s ease-in-out";
    if (imgMain) imgMain.style.transition = "transform 0.12s ease-in-out";

    tokenDiv.dataset.q = data.arrivee.q;
    tokenDiv.dataset.r = data.arrivee.r;
    window.positionnerTokenVTT(tokenDiv, false);
    if (imgMain) imgMain.style.transform = "scale(1.15)";
    await new Promise(r => setTimeout(r, 250));

    if (imgMain) imgMain.style.transform = "scale(0.85)";
    await new Promise(r => setTimeout(r, 120));

    if (imgMain) imgMain.style.transform = "scale(1)";
    await new Promise(r => setTimeout(r, 150));

    tokenDiv.style.transition = "none";
    if (imgMain) {
        imgMain.style.transition = "none";
        imgMain.style.transform = "";
    }

    // Zone persistante sur la case d'arrivée (saut ou déplacement forcé) : déjà tranchée par
    // celui qui a déclenché l'effet, on ne fait que la rejouer ici.
    for (const res of (data.zones || [])) {
        if (typeof window.jouerAnimationZonePersistante === "function") {
            await window.jouerAnimationZonePersistante(res, data.arrivee);
        }
    }

    window.ANIMATION_VTT_EN_COURS = false;
    if (typeof window.appliquerTokensVTT === "function") {
        window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    }
};