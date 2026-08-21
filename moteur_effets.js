import { db } from "./firebase-config.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// =========================================================================
//  IVALIS - MOTEUR DE RÉSOLUTION DES COMBATS (CIBLAGE ET DÉGÂTS)
// =========================================================================

window.ETAT_CIBLAGE = {
    actif: false,
    idCarte: null,
    attaques: [], 
    cibleUnique: null,
    isZone: false,
    zoneHexesBase: [],
    zoneCenterHex: null,
    zoneRotationStep: 0,
    initialTwistAngle: 0, // 🔻 CORRECTION : Renommé en Twist (Rotation)
    initialZoneStep: 0
};

// --- OUTILS MATHÉMATIQUES (Distances et Lignes de Vue) ---

function getHexDistance(a, b) {
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

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
//  1. ÉVÉNEMENTS GLOBAUX (SOURIS ET TACTILE IPAD)
// =========================================================================

window.VTT_CIBLAGE_MOUSEMOVE = function(e) {
    if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;

    const state = window.ETAT_CIBLAGE;
    if (!state || !state.actif || !state.isZone) return;

    const tkLanceur = window.TOKENS_VTT_DATA[window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage];
    const lanceurData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage);
    const attaqueCourante = state.attaques[0]; 

    const canvasX = (e.clientX - window.VTT_POS_X) / window.VTT_SCALE;
    const canvasY = (e.clientY - window.VTT_POS_Y) / window.VTT_SCALE;
    const hoverHex = window.PLATEAU_VTT.pixelToHex(canvasX, canvasY);

    if (attaqueCourante.isRanged) {
        const dist = getHexDistance(tkLanceur, hoverHex);
        
        let estEngage = false;
        for (let idToken in window.TOKENS_VTT_DATA) {
            if (idToken === tkLanceur) continue; 
            const d = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idToken);
            if (d && d.camp !== lanceurData.camp && d.statut !== "Mort" && getHexDistance(tkLanceur, window.TOKENS_VTT_DATA[idToken]) === 1) {
                estEngage = true; break;
            }
        }

        if (estEngage && dist > 1) state.zoneCenterHex = null; 
        else if (dist > attaqueCourante.rangeMax) state.zoneCenterHex = null; 
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
    
    if (state.attaques[0].isRanged) {
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

    if (state.attaques[0].isRanged) {
        const canvasX = (e.clientX - window.VTT_POS_X) / window.VTT_SCALE;
        const canvasY = (e.clientY - window.VTT_POS_Y) / window.VTT_SCALE;
        const targetHex = window.PLATEAU_VTT.pixelToHex(canvasX, canvasY);
        
        const tkLanceur = window.TOKENS_VTT_DATA[window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage];
        const lanceurData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage);
        const dist = getHexDistance(tkLanceur, targetHex);
        
        let estEngage = false;
        for (let idToken in window.TOKENS_VTT_DATA) {
            if (idToken === tkLanceur) continue; 
            const d = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idToken);
            if (d && d.camp !== lanceurData.camp && d.statut !== "Mort" && getHexDistance(tkLanceur, window.TOKENS_VTT_DATA[idToken]) === 1) {
                estEngage = true; break;
            }
        }

        if (estEngage && dist > 1) state.zoneCenterHex = null; 
        else if (dist > state.attaques[0].rangeMax) state.zoneCenterHex = null; 
        else if (!verifierLigneDeVue(tkLanceur, targetHex)) state.zoneCenterHex = null; 
        else state.zoneCenterHex = targetHex; 

        window.actualiserVisuelCiblage();
    }
};

// 🔻 ÉVÉNEMENTS TACTILES IPAD (2 DOIGTS = ROTATION TWIST) 🔻
window.VTT_CIBLAGE_TOUCHSTART = function(e) {
    const state = window.ETAT_CIBLAGE;
    if (!state || !state.actif || !state.isZone) return;

    if (e.touches.length === 2) {
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
        // 🔻 CORRECTION : On ne met plus de e.stopPropagation() ni de e.preventDefault() ici.
        // Ainsi, l'iPad peut continuer d'interpréter le pinch (écartement) pour zoomer la carte, 
        // tout en exécutant notre rotation de zone en même temps !

        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const currentAngle = Math.atan2(dy, dx) * 180 / Math.PI;
        
        let diff = currentAngle - state.initialTwistAngle;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        
        let stepDelta = Math.round(diff / 60);
        
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

    if (!window.EFFETS_BDD_CACHE) {
        alert("Le grimoire du moteur n'est pas encore synchronisé.");
        return;
    }

    const dataCarte = window.COMPETENCES_CACHE[idCarte];
    if (!dataCarte) return;

    const attaquesExtraites = [];
    let isZone = false;
    let zoneHexesBase = [];

    dataCarte.Composants.actions.forEach(act => {
        if (act.zoneHexes && act.zoneHexes.length > 0) {
            isZone = true;
            zoneHexesBase = act.zoneHexes;
        }

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
            let isRanged = false;
            let rangeMax = 1;

            Object.keys(act.mods).forEach(modId => {
                const modEff = window.EFFETS_BDD_CACHE[modId];
                if (modEff && modEff.Nom === "Distance") {
                    isRanged = true;
                    rangeMax = 1 + ((parseFloat(modEff.Valeur) || 0) * act.mods[modId]); 
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

    if (isZone && attaquesExtraites[0] && attaquesExtraites[0].isRanged) {
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
        cibleUnique: null,
        isZone: isZone,
        zoneHexesBase: zoneHexesBase,
        zoneCenterHex: isZone && !attaquesExtraites[0].isRanged ? {q: tkLanceur.q, r: tkLanceur.r} : null,
        zoneRotationStep: 0,
        initialTwistAngle: 0,
        initialZoneStep: 0
    };

    const btnAppliquer = document.getElementById("btn-appliquer-carte");
    if (btnAppliquer) btnAppliquer.style.display = "none";

    // INJECTION CSS (Anneaux et Bulles)
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

    if (isZone) {
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
        bulleZone.style.display = "flex";
        
        document.getElementById("btn-valider-zone-ok").onclick = () => window.validerZoneAoE();
        document.getElementById("btn-valider-zone-ko").onclick = () => window.nettoyerCiblage();

        let msgZone = document.getElementById("msg-zone-ciblage");
        if (!msgZone) {
            msgZone = document.createElement("div");
            msgZone.id = "msg-zone-ciblage";
            msgZone.style.cssText = "position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); z-index: 1000; font-family: 'Cinzel', serif; font-size: 18px; color: #ff4c4c; font-weight: bold; text-shadow: 1px 1px 3px black, 0 0 10px #ffaa00; background: rgba(0,0,0,0.8); padding: 10px 20px; border-radius: 12px; pointer-events: none;";
            document.getElementById("conteneur-plateau-vtt").appendChild(msgZone);
        }
        
        // 🔻 CORRECTION DU MESSAGE D'AIDE 🔻
        msgZone.innerText = attaquesExtraites[0].isRanged ? "Placez la zone (1 doigt). Pivotez la zone (2 doigts)." : "Faites pivoter la zone (Rotation à 2 doigts).";

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
        btnResoudre.onclick = () => window.declencherResolution();
    }

    window.actualiserVisuelCiblage();
};

window.validerZoneAoE = function() {
    const state = window.ETAT_CIBLAGE;
    if (!state || !state.actif || !state.isZone) return;
    
    if (!state.zoneCenterHex) {
        alert("Zone invalide (hors de portée, obstruée ou non placée).");
        return;
    }
    
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    const finalHexes = state.zoneHexesBase.map(h => {
        const rot = rotateHex(h, state.zoneRotationStep);
        return { q: state.zoneCenterHex.q + rot.q, r: state.zoneCenterHex.r + rot.r };
    });

    let ciblesTouchees = [];
    const idLanceur = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO].idPersonnage;

    for (let idToken in window.TOKENS_VTT_DATA) {
        if (idToken === idLanceur) continue; 
        const tk = window.TOKENS_VTT_DATA[idToken];
        if (finalHexes.some(h => h.q === tk.q && h.r === tk.r)) {
            ciblesTouchees.push(idToken);
        }
    }

    state.attaques.forEach(a => a.cibles = ciblesTouchees);
    window.declencherResolution();
};

window.actualiserVisuelCiblage = function() {
    if (!window.ETAT_CIBLAGE || !window.ETAT_CIBLAGE.actif) return;
    
    if (window.ETAT_CIBLAGE.isZone) {
        window.dessinerZoneAoE();
    } else {
        window.dessinerAnneauxCiblage();
    }
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
        polygon.setAttribute("fill", "rgba(255, 76, 76, 0.35)");
        polygon.setAttribute("stroke", "rgba(255, 76, 76, 0.35)");
        polygon.setAttribute("stroke-width", "1");
        svg.appendChild(polygon);
    });

    const dirs = [
        {q: 1, r: 0}, {q: 0, r: 1}, {q: -1, r: 1},
        {q: -1, r: 0}, {q: 0, r: -1}, {q: 1, r: -1}
    ];

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
            
            const aUnVoisinRouge = finalHexes.some(fh => fh.q === nQ && fh.r === nR);
            
            if (!aUnVoisinRouge) {
                const c1 = corners[i];
                const c2 = corners[(i + 1) % 6];
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("x1", c1.x);
                line.setAttribute("y1", c1.y);
                line.setAttribute("x2", c2.x);
                line.setAttribute("y2", c2.y);
                line.setAttribute("stroke", "#ff4c4c");
                line.setAttribute("stroke-width", "3");
                line.setAttribute("stroke-linecap", "round");
                svg.appendChild(line);
            }
        }
    });
};

window.dessinerAnneauxCiblage = function() {
    if (!window.ETAT_CIBLAGE || !window.ETAT_CIBLAGE.actif) {
        document.querySelectorAll(".anneau-ciblage, .bulle-validation-cible").forEach(el => el.remove());
        return;
    }

    const attaqueCourante = window.ETAT_CIBLAGE.attaques[0]; 
    if (!attaqueCourante) return;

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

        if (dist > attaqueCourante.rangeMax) continue;
        if (estEngage && dist > 1) continue;
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

    if (dist > attaqueCourante.rangeMax) {
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

    if (estEngage && dist > 1) {
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
    } else {
        state.cibleUnique = idCible; 
        state.attaques.forEach(a => a.cibles = [idCible]);
    }

    window.dessinerAnneauxCiblage();
};

window.nettoyerCiblage = function() {
    window.ETAT_CIBLAGE.actif = false;
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

// =========================================================================
//  MOTEUR D'ANIMATION (Se joue chez TOUS les joueurs en même temps)
// =========================================================================

window.jouerAnimationMoteur = async function(action) {
    if (action.type !== "ATTAQUES") return;

    const lanceur = action.idLanceur;
    const tkLanceur = window.TOKENS_VTT_DATA[lanceur];

    if (action.isZone && action.zoneCenterHex && tkLanceur) {
        if (tkLanceur.q !== action.zoneCenterHex.q || tkLanceur.r !== action.zoneCenterHex.r) {
            const pxLanceur = window.PLATEAU_VTT.hexToPixel(tkLanceur.q, tkLanceur.r);
            const pxCible = window.PLATEAU_VTT.hexToPixel(action.zoneCenterHex.q, action.zoneCenterHex.r);
            const dx = pxCible.x - pxLanceur.x;
            const dy = pxCible.y - pxLanceur.y;
            
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
    }

    for (let attaque of action.attaques) {
        if (attaque.cibles.length === 0) continue;

        for (let idCible of attaque.cibles) {
            
            const cibleData = window.PERSOS_PARTIE.find(p => p.idPersonnage === idCible);
            if (!cibleData) continue;

            const tkCible = window.TOKENS_VTT_DATA[idCible];

            let dx = 0; let dy = 0;
            const dist = getHexDistance(tkLanceur, tkCible);

            if (!action.isZone && tkLanceur && tkCible) {
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
            } else if (action.isZone) {
                const pxLanceur = window.PLATEAU_VTT.hexToPixel(tkLanceur.q, tkLanceur.r);
                const pxCible = window.PLATEAU_VTT.hexToPixel(tkCible.q, tkCible.r);
                dx = pxCible.x - pxLanceur.x;
                dy = pxCible.y - pxLanceur.y;
            }

            const esquive = (parseInt(cibleData.Esquive) || 0) + (parseInt(cibleData.Dev_Mod_Esquive) || 0);
            const parade = (parseInt(cibleData.Parade) || 0) + (parseInt(cibleData.Dev_Mod_Parade) || 0);
            
            const jetDef = Math.floor(Math.random() * 100) + 1;
            const statDef = Math.max(esquive, parade);
            const motDef = parade > esquive ? "Paré 🛡️" : "Esquivé 💨";

            if (jetDef <= statDef) {
                if (tkCible) {
                    window.afficherMessageFlottantHex(tkCible.q, tkCible.r, motDef, "#cccccc");
                    
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

            const defPhys = (parseInt(cibleData.Def_Physique) || 0) + (parseInt(cibleData.Dev_Mod_DefPhys) || 0);
            const defMag = (parseInt(cibleData.Def_Magique) || 0) + (parseInt(cibleData.Dev_Mod_DefMag) || 0);

            let degats = attaque.valeurBrute;

            if (attaque.isRanged && dist === 1) {
                degats = Math.floor(degats * 0.7); 
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

    const currentUserId = localStorage.getItem("ID_JOUEUR_COURANT");
    const lanceurData = window.PERSOS_PARTIE.find(p => p.idPersonnage === lanceur);
    if (lanceurData && lanceurData.idJoueur === currentUserId) {
        window.validerCarteCombat(action.idCarte, null);
    }
};