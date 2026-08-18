import { db } from "./firebase-config.js";
import { doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// =========================================================================
//  MOTEUR DE DÉPLACEMENT TACTIQUE (PATHFINDING & ANIMATION)
// =========================================================================

window.CHEMIN_MOUVEMENT = [];
window.CHEMIN_START_NODE = null;
window.MOUVEMENT_COUT_TOTAL = 0;

window.COUT_COMPETENCE_SELECTIONNEE = 0; 
window.ANIMATION_VTT_EN_COURS = false;

// Fonction de message flottant (UI)
window.afficherMessageFlottantHex = function(q, r, texte, couleur = "#ff4c4c") {
    const conteneur = document.getElementById("conteneur-plateau-vtt");
    if (!conteneur || !window.PLATEAU_VTT) return;
    
    const px = window.PLATEAU_VTT.hexToPixel(q, r);
    
    const msg = document.createElement("div");
    msg.innerText = texte;
    msg.style.position = "absolute";
    msg.style.left = px.x + "px";
    msg.style.top = (px.y - 30) + "px";
    msg.style.transform = "translate(-50%, -50%)";
    msg.style.color = couleur;
    msg.style.fontWeight = "bold";
    msg.style.fontSize = "18px";
    msg.style.fontFamily = "'Cinzel', serif";
    msg.style.textShadow = "0 0 5px black, 0 0 10px black, 2px 2px 2px black";
    msg.style.pointerEvents = "none";
    msg.style.zIndex = "1000";
    msg.style.whiteSpace = "nowrap";
    msg.style.transition = "top 1s ease-out, opacity 1s ease-out";
    
    conteneur.appendChild(msg);
    
    setTimeout(() => {
        msg.style.top = (px.y - 100) + "px";
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
            
            let isOccupied = false;
            for (let id in window.TOKENS_VTT_DATA) {
                if (window.TOKENS_VTT_DATA[id].q === neighbor.q && window.TOKENS_VTT_DATA[id].r === neighbor.r) {
                    isOccupied = true; break;
                }
            }
            if (isOccupied) continue;

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
    
    let isOccupied = false;
    for (let id in window.TOKENS_VTT_DATA) {
        if (window.TOKENS_VTT_DATA[id].q === q && window.TOKENS_VTT_DATA[id].r === r) {
            isOccupied = true; break;
        }
    }
    if (isOccupied) {
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

    for (let i = 0; i < segment.length; i++) {
        let step = segment[i];
        
        let numeroCase = window.CHEMIN_MOUVEMENT.length + 1;
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
    
    const bulle = document.getElementById("bulle-validation-mouvement");
    const texteCout = document.getElementById("mouvement-cout-total");
    if (bulle && texteCout) {
        texteCout.innerText = window.MOUVEMENT_COUT_TOTAL + " ⚡";
        bulle.style.display = "flex";
        texteCout.style.color = "#ffaa00"; 
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

    const bulle = document.getElementById("bulle-validation-mouvement");
    if (bulle) bulle.style.display = "none";
    const svg = document.getElementById("svg-chemin-mouvement");
    if (svg) svg.innerHTML = "";

    // Déduction locale
    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
    let nvlFatigue = persoActuel.fatigueActuelle - window.MOUVEMENT_COUT_TOTAL;
    persoActuel.fatigueActuelle = nvlFatigue;
    window.COMBAT_FATIGUE_ACTUELLE = nvlFatigue;
    
    // 🔻 NOUVEAU : Désélection automatique de la carte si on n'a plus l'énergie après avoir marché 🔻
    if (window.COUT_COMPETENCE_SELECTIONNEE > 0 && window.COUT_COMPETENCE_SELECTIONNEE > nvlFatigue) {
        window.COUT_COMPETENCE_SELECTIONNEE = 0;
        // Rafraîchit l'UI des cartes pour la dé-sélectionner visuellement
        if (typeof window.actualiserEtatCarteCombat === "function") window.actualiserEtatCarteCombat();
    }

    if (typeof window.mettreAJourJaugeFatigue === "function") window.mettreAJourJaugeFatigue(0);
    // Rafraîchit toute la fiche du perso
    if (typeof window.afficherPersoCombatActuel === "function") window.afficherPersoCombatActuel();

    let pathAvecAngles = [];
    let currentPx = window.PLATEAU_VTT.hexToPixel(window.CHEMIN_START_NODE.q, window.CHEMIN_START_NODE.r);
    let finalAngle = window.TOKENS_VTT_DATA[idPerso].angle || 0;

    window.CHEMIN_MOUVEMENT.forEach(step => {
        let nextPx = window.PLATEAU_VTT.hexToPixel(step.q, step.r);
        let dx = nextPx.x - currentPx.x;
        let dy = nextPx.y - currentPx.y;
        
        let angle = Math.atan2(dy, dx) * (180 / Math.PI) - 90;
        
        pathAvecAngles.push({ q: step.q, r: step.r, angle: angle });
        finalAngle = angle;
        currentPx = nextPx;
    });

    try {
        const partieRef = doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE);
        const snap = await getDoc(partieRef);
        
        let file = snap.data().File_Attente_Combat || [];
        if (file.length > 0 && file[0].idPersonnage === idPerso) {
            file[0].aFaitSonMouvement = true;
        }

        window.TOKENS_VTT_DATA[idPerso].q = finalStep.q;
        window.TOKENS_VTT_DATA[idPerso].r = finalStep.r;
        window.TOKENS_VTT_DATA[idPerso].angle = finalAngle;

        await updateDoc(partieRef, {
            File_Attente_Combat: file,
            Action_Mouvement: {
                idToken: idPerso,
                path: pathAvecAngles,
                timestamp: new Date().getTime()
            }
        });

        const persoRef = doc(db, "Personnages", idPerso);
        await updateDoc(persoRef, { Fatigue_Actuelle: nvlFatigue });
        
        await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
            Tokens: window.TOKENS_VTT_DATA
        }, { merge: true });

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
    
    const glow = tokenDiv.querySelector("div[style*='rotationAnneauMagique']");
    if (glow) glow.style.opacity = "0";

    // 🔻 CORRECTION : Le parent ne gère plus que les coordonnées X/Y
    tokenDiv.style.transition = "left 0.4s linear, top 0.4s linear";
    
    // 🔻 CORRECTION : On prépare les enfants (Pion + Ombres) pour la rotation
    const imgMain = tokenDiv.querySelector(".token-img-main");
    if (imgMain) imgMain.style.transition = "transform 0.2s ease";
    const shadows = tokenDiv.querySelectorAll(".token-shadow");
    shadows.forEach(sh => sh.style.transition = "transform 0.2s ease");

    for (let i = 0; i < actionMouvement.path.length; i++) {
        let step = actionMouvement.path[i];
        let px = window.PLATEAU_VTT.hexToPixel(step.q, step.r);
        
        tokenDiv.style.left = px.x + "px";
        tokenDiv.style.top = px.y + "px";
        
        // On fait tourner le pion principal
        if (imgMain) imgMain.style.transform = `rotate(${step.angle}deg)`;
        
        // On fait tourner les ombres sans altérer leur décalage X/Y directionnel
        shadows.forEach(sh => {
            sh.style.transform = `translate(${sh.dataset.tx}px, ${sh.dataset.ty}px) rotate(${step.angle}deg)`;
        });
        
        await new Promise(r => setTimeout(r, 400));
    }
    
    window.ANIMATION_VTT_EN_COURS = false;
    if (typeof window.appliquerTokensVTT === "function") {
        window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    }
};