// =========================================================================
//  IVALIS - MODULE DES COMPÉTENCES DE COMBAT
// =========================================================================
import { db } from "./firebase-config.js";
import { collection, getDocs, doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Variables globales pour le Deck interactif
window.COMPETENCES_CACHE = {};
window.CARTES_SELECTIONNEES = [];
window.COULEUR_PERSO_COURANT = "#4a1c1c";
window.ID_PERSONNAGE_DECK = null;
window.CARTES_MAX_PERSO = 0;
window.CARTE_EN_APERCU = null;

const IMAGE_CADRE_NORMAL = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png";
const IMAGE_CADRE_SELECTIONNE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1783286721/ban_cible_pdpnad.png";

window.chargerOngletCompetences = async function(idPersonnage, competencesMax = 6) {
    const spanMax = document.getElementById("affichage-competences-max");
    const spanRestantes = document.getElementById("affichage-competences-restantes");
    const btnCreer = document.getElementById("btn-creer-competence");
    const listeDiv = document.getElementById("liste-competences-perso");

    if (spanMax) spanMax.innerText = competencesMax;

    // Initialisation des variables du personnage pour le Deck
    window.ID_PERSONNAGE_DECK = idPersonnage;
    window.CARTES_MAX_PERSO = competencesMax; 
    window.CARTES_SELECTIONNEES = [];
    window.COULEUR_PERSO_COURANT = "#4a1c1c";

    try {
        // 1. Récupération de la couleur et du deck actuel du Héros
        const persoRef = doc(db, "Personnages", idPersonnage);
        const persoSnap = await getDoc(persoRef);
        if (persoSnap.exists()) {
            const dataPerso = persoSnap.data();
            window.COULEUR_PERSO_COURANT = dataPerso.Couleur || "#4a1c1c";
            window.CARTES_SELECTIONNEES = dataPerso.Deck_Equipe || [];
        }

        // 2. Récupération des compétences forgées
        const colRef = collection(db, "Personnages", idPersonnage, "Competences");
        const snap = await getDocs(colRef);

        const nbCreees = snap.size;
        const nbRestantes = competencesMax - nbCreees;

        // Gestion du bouton de Forge
        if (spanRestantes) {
            spanRestantes.innerText = Math.max(0, nbRestantes);
            spanRestantes.style.color = nbRestantes > 0 ? "#1b6e3a" : "#ff4c4c";
        }

        if (btnCreer) {
            if (nbRestantes > 0) {
                btnCreer.disabled = false;
                btnCreer.style.opacity = "1";
                btnCreer.style.filter = "none";
                btnCreer.style.cursor = "pointer";
            } else {
                btnCreer.disabled = true;
                btnCreer.style.opacity = "0.4";
                btnCreer.style.filter = "grayscale(100%)";
                btnCreer.style.cursor = "not-allowed";
            }
        }

        listeDiv.innerHTML = "";
        
        if (nbCreees === 0) {
            listeDiv.innerHTML = `<p style="text-align: center; font-style: italic; color: #5c3a21; margin-top: 20px;">Le héros n'a pas encore forgé ses techniques de combat.</p>`;
            return;
        }

        // 3. AFFICHAGE DES BANNIÈRES (Styles CSS injectés en dur avec les proportions EXACTES)
        let htmlDeck = `
            <div style="position: sticky; top: -20px; z-index: 50; background: rgba(232, 213, 165, 0.95); backdrop-filter: blur(5px); border-bottom: 3px solid #5c3a21; padding: 12px 20px; margin: 10px -20px 20px -20px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 5px 15px rgba(0,0,0,0.5); font-family: 'Cinzel', serif; font-size: 18px; color: #2c1e16; font-weight: bold;">
                <span>Grimoire de Combat</span>
                <span>Mémorisées : <span id="compteur-cartes-actuel" style="color: ${window.CARTES_SELECTIONNEES.length >= window.CARTES_MAX_PERSO ? '#ff4c4c' : '#1b6e3a'}">${window.CARTES_SELECTIONNEES.length}</span> / ${window.CARTES_MAX_PERSO}</span>
            </div>
            
            <!-- Le conteneur retrouve sa largeur d'origine (max 580px) -->
            <div style="display: flex; flex-direction: column; gap: 0px; width: 100%; max-width: 580px; margin: 15px 0; padding-bottom: 80px;">
        `;

        window.COMPETENCES_CACHE = {}; // On vide le cache à l'ouverture
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const idCarte = docSnap.id;
            // On sauvegarde toutes les infos de la carte pour l'aperçu HD !
            window.COMPETENCES_CACHE[idCarte] = data;
            const titre = data.Nom || "Technique Inconnue";
            const initiative = data.Initiative || 0;
            
            const estSelectionnee = window.CARTES_SELECTIONNEES.includes(idCarte);
            let isSelStr = estSelectionnee ? "true" : "false";
            let decalageX = estSelectionnee ? "80px" : "0px";
            let urlCadre = estSelectionnee ? IMAGE_CADRE_SELECTIONNE : IMAGE_CADRE_NORMAL;

            htmlDeck += `
                <div id="ui-carte-${idCarte}" class="banniere-carte" data-selectionnee="${isSelStr}"
                     onclick="window.gererClicCarte('${idCarte}')"
                     style="position: relative; width: 100%; height: 160px; display: flex; align-items: center; cursor: pointer; transition: transform 0.2s ease; margin-bottom: -75px; z-index: 2; transform: translateX(${decalageX});"
                     onmouseover="this.style.transform = this.dataset.selectionnee === 'true' ? 'translateX(95px)' : 'translateX(12px)'; this.style.zIndex='100';"
                     onmouseout="this.style.transform = this.dataset.selectionnee === 'true' ? 'translateX(80px)' : 'translateX(0px)'; this.style.zIndex='2';">
                     
                    <!-- Le Rectangle de Couleur de fond -->
                    <div style="position: absolute; top: 47px; bottom: 55px; left: 115px; right: 57px; z-index: 1; border-radius: 0 15px 15px 0; background-color: ${window.COULEUR_PERSO_COURANT};"></div>
                    
                    <!-- L'Image du Cadre (Restaurée avec "contain" pour éviter l'écrasement) -->
                    <div id="cadre-carte-${idCarte}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: url('${urlCadre}'); background-size: contain; background-position: center; background-repeat: no-repeat; z-index: 2; filter: drop-shadow(0px 6px 4px rgba(0,0,0,0.6));"></div>
                    
                    <!-- Initiative (Bulle de gauche) -->
                    <div style="position: absolute; top: 44%; transform: translateY(-50%); left: 57px; width: 69px; text-align: center; color: #e0d0b0; font-family: 'Cinzel', serif; font-size: 30px; font-weight: bold; z-index: 3; text-shadow: 2px 2px 5px black; pointer-events: none;">${initiative}</div>
                    
                    <!-- Titre de la carte -->
                    <div style="position: absolute; top: 48%; transform: translateY(-50%); left: 120px; right: 20px; text-align: center; color: #e0d0b0; font-family: 'Cinzel', serif; font-size: 17px; text-transform: uppercase; font-weight: bold; z-index: 3; text-shadow: 1px 1px 3px black; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;">${titre}</div>
                </div>
            `;
        });
        
        htmlDeck += `</div>`;
        listeDiv.innerHTML = htmlDeck;

    } catch (e) {
        console.error("Erreur de lecture des compétences :", e);
    }
};

// =========================================================================
//  LOGIQUE DES CLICS (Aperçu vs Équiper)
// =========================================================================

window.gererClicCarte = function(idCarte) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    if (window.CARTE_EN_APERCU !== idCarte) {
        // --- 1ER CLIC : FOCUS & APERÇU ---
        window.CARTE_EN_APERCU = idCarte;

        // Nettoyage du surlignage des autres bannières
        document.querySelectorAll('.banniere-carte').forEach(el => {
            el.style.filter = "none";
        });
        
        // Surlignage de la bannière cliquée
        const carteDiv = document.getElementById(`ui-carte-${idCarte}`);
        if (carteDiv) {
            carteDiv.style.filter = "drop-shadow(0px 0px 8px rgba(0, 255, 255, 0.8)) brightness(1.1)";
        }
        
        // Affichage de la carte HD sur le côté
        window.afficherApercuCarteHD(idCarte);
        
    } else {
        // --- 2ÈME CLIC : ÉQUIPER / DÉSÉQUIPER ---
        window.basculerSelectionCarte(idCarte);
    }
};

window.afficherApercuCarteHD = function(idCarte) {
    let conteneurCarte = document.getElementById("apercu-carte-hd-competence");
    
    if (!conteneurCarte) {
        conteneurCarte = document.createElement("div");
        conteneurCarte.id = "apercu-carte-hd-competence";
        conteneurCarte.style.cssText = "position: fixed; top: 50%; right: 8vw; transform: translateY(-50%); width: 340px; height: 476px; z-index: 9999; display: none; border-radius: 12px; box-shadow: 0px 20px 40px rgba(0,0,0,0.9); transition: opacity 0.2s ease;";
        document.body.appendChild(conteneurCarte);

        const style = document.createElement("style");
        style.innerHTML = `
            #apercu-carte-hd-competence .zone-effets::-webkit-scrollbar { width: 4px; }
            #apercu-carte-hd-competence .zone-effets::-webkit-scrollbar-track { background: transparent; }
            #apercu-carte-hd-competence .zone-effets::-webkit-scrollbar-thumb { background: rgba(232, 213, 165, 0.3); border-radius: 4px; }
        `;
        document.head.appendChild(style);
    }

    const data = window.COMPETENCES_CACHE[idCarte];
    if (!data) return;

    const titre = data.Nom || "Inconnue";
    const initiative = data.Initiative || 0;
    const fatigue = data.Fatigue || 0;
    const effets = data.Effets_Compiles || [];

    // Récupération des données de la Zone
    let allZoneHexes = [];
    if (data.Composants && data.Composants.actions) {
        data.Composants.actions.forEach(act => {
            if (act.zoneHexes && act.zoneHexes.length > 0) {
                allZoneHexes = act.zoneHexes;
            }
        });
    }

    let htmlEffets = "";
    let htmlZoneAbsolue = ""; // Nouveau conteneur pour la zone flottante

    effets.forEach(eff => {
        // --- RÈGLE D'EXCLUSION : On ignore totalement "Initiative +" ---
        if (typeof eff === 'string' && eff.includes("Initiative +")) return;
        if (typeof eff === 'object' && eff.nom === "Initiative +") return;

        if (typeof eff === 'string') {
            if (eff.includes("Zone")) {
                // On ne fait plus rien ici pour le texte
            } else if (eff.startsWith("  ↳")) {
                htmlEffets += `<div style="margin-left: 20px; color: #a89f91; font-size: 13px; padding: 2px 0;">${eff}</div>`;
            } else {
                htmlEffets += `<div style="margin-top: 8px; color: #e8d5a5; font-size: 15px; font-weight: bold;">${eff}</div>`;
            }
        } 
        else {
            if (eff.isZone) {
                // On ne fait plus rien ici pour le texte
            } else {
                let padding = eff.isMod ? "margin-left: 15px; margin-top: 6px;" : "margin-top: 12px;";
                let colorNom = eff.isMod ? "#c2a878" : "#e8d5a5";
                let prefix = eff.isMod ? "↳ " : "• ";
                
                htmlEffets += `
                    <div style="${padding}">
                        <div style="color: ${colorNom}; font-size: 15px; font-weight: bold; text-shadow: 1px 1px 2px black;">${prefix}${eff.nom}</div>
                        <div style="color: #a89f91; font-size: 13px; margin-top: 2px; line-height: 1.3; font-style: italic;">${eff.desc}</div>
                    </div>
                `;
            }
        }
    });

    // Dessin du mini-SVG tactique avec bords BIEN BLANCS
    if (allZoneHexes.length > 0) {
        let svgPolygons = "";
        const hexRadius = 8;
        const cx = 60;
        const cy = 60;
        
        for (let q = -2; q <= 2; q++) {
            let r1 = Math.max(-2, -q - 2);
            let r2 = Math.min(2, -q + 2);
            for (let r = r1; r <= r2; r++) {
                const isCenter = (q === 0 && r === 0);
                const isSelected = allZoneHexes.some(h => h.q === q && h.r === r);

                const x = cx + hexRadius * Math.sqrt(3) * (q + r / 2.0);
                const y = cy + hexRadius * 3.0 / 2.0 * r;

                // Couleurs de la grille
                let fillColor = "rgba(255, 255, 255, 0.05)";
                if (isCenter) fillColor = "rgba(150, 150, 150, 0.8)";
                if (isSelected) fillColor = "rgba(255, 76, 76, 0.8)";

                let points = "";
                for(let i=0; i<6; i++) {
                    let angle = Math.PI / 3 * i - Math.PI / 6;
                    points += `${x + hexRadius * Math.cos(angle)},${y + hexRadius * Math.sin(angle)} `;
                }
                
                // MODIFICATION : stroke="#ffffff" et stroke-width="1.5" pour que ça ressorte !
                svgPolygons += `<polygon points="${points.trim()}" fill="${fillColor}" stroke="#ffffff" stroke-width="1.5" />`;
            }
        }
        
        // MODIFICATION : Position absolue en bas à droite
        htmlZoneAbsolue = `
            <div style="position: absolute; bottom: -15px; right: -15px; z-index: 10; filter: drop-shadow(0px 5px 10px rgba(0,0,0,0.9)); pointer-events: none;">
                <svg width="120" height="120" viewBox="0 0 120 120">
                    ${svgPolygons}
                </svg>
            </div>
        `;
    }

    conteneurCarte.innerHTML = `
        <!-- COUCHE 1 : FOND DE COULEUR -->
        <div style="position: absolute; top: 12px; left: 12px; right: 12px; bottom: 12px; background-color: ${window.COULEUR_PERSO_COURANT}; border-radius: 8px; z-index: 1;"></div>
        
        <!-- COUCHE 2 : L'IMAGE DE LA CARTE -->
        <img src="https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1785866318/competance_carte_vy8omh.png" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; pointer-events: none;">
        
        <!-- COUCHE 3 : LES DONNÉES -->
        
        <!-- Titre : Avec tes marges personnalisées -->
        <div style="position: absolute; top: 18px; left: 50px; right: 80px; text-align: center; font-family: 'Cinzel', serif; font-size: 16px; font-weight: bold; color: #e0d0b0; text-transform: uppercase; text-shadow: 2px 2px 4px black; z-index: 3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;">
            ${titre}
        </div>

        <!-- Initiative : AJOUT DU PADDING-LEFT pour décaler le texte sans casser la boîte -->
        <div style="position: absolute; top: 7px; right: 9px; width: 75px; height: 72px; display: flex; justify-content: center; align-items: center; padding-left: 8px; box-sizing: border-box; font-family: 'Cinzel', serif; font-size: 34px; font-weight: bold; color: white; text-shadow: 2px 2px 6px black; z-index: 3; pointer-events: none;">
            ${initiative}
        </div>

        <!-- Fatigue : Avec tes marges personnalisées -->
        <div style="position: absolute; top: 50.7%; left: 50%; transform: translate(-50%, -50%); font-family: 'Cinzel', serif; font-size: 20px; font-weight: bold; color: #ff8b8b; text-shadow: 1px 1px 4px black; z-index: 3; pointer-events: none;">
            ${fatigue}
        </div>

        <!-- Section des Effets : Avec tes marges personnalisées (débarrassée de la zone) -->
        <div class="zone-effets" style="position: absolute; top: 54%; left: 16%; right: 8%; bottom: 6%; z-index: 3; overflow-y: auto; font-family: 'Almendra', serif; display: flex; flex-direction: column; justify-content: flex-start;">
            <div style="flex-grow: 1;">
                ${htmlEffets}
            </div>
        </div>
        
        <!-- COUCHE 4 : LA ZONE FLOTTANTE -->
        ${htmlZoneAbsolue}
    `;

    conteneurCarte.style.display = "block";
    setTimeout(() => conteneurCarte.style.opacity = "1", 10);
};

// Fonction utile pour cacher la carte (lorsqu'on ferme la fiche perso)
window.masquerApercuCarteHD = function() {
    const conteneurCarte = document.getElementById("apercu-carte-hd-competence");
    if (conteneurCarte) {
        conteneurCarte.style.display = "none";
    }
    window.CARTE_EN_APERCU = null;
};

window.basculerSelectionCarte = async function(idCarte) {
    const elementBanniere = document.getElementById(`ui-carte-${idCarte}`);
    const elementCadre = document.getElementById(`cadre-carte-${idCarte}`);
    const compteurAffichage = document.getElementById("compteur-cartes-actuel");

    if (!elementBanniere || !elementCadre) return;

    let indexDansSelection = window.CARTES_SELECTIONNEES.indexOf(idCarte);

    if (indexDansSelection > -1) {
        // ACTION : RETIRER LA CARTE
        window.CARTES_SELECTIONNEES.splice(indexDansSelection, 1);
        elementBanniere.dataset.selectionnee = "false";
        elementBanniere.style.transform = "translateX(0px)";
        elementCadre.style.backgroundImage = `url('${IMAGE_CADRE_NORMAL}')`;
    } else {
        // ACTION : AJOUTER LA CARTE
        if (window.CARTES_SELECTIONNEES.length >= window.CARTES_MAX_PERSO) {
            // Limite Max Atteinte (Message immersif)
            let msgErreur = document.getElementById("erreur-deck-immersif");

            if (!msgErreur) {
                msgErreur = document.createElement("div");
                msgErreur.id = "erreur-deck-immersif";
                msgErreur.style.cssText = "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(40, 10, 10, 0.95); color: #e8d5a5; padding: 20px 40px; border: 2px solid #ff4c4c; border-radius: 12px; font-weight: bold; font-size: 22px; text-shadow: 0 0 10px red; box-shadow: 0 0 40px rgba(255, 0, 0, 0.9); z-index: 2000; text-align: center; pointer-events: none; opacity: 0; transition: opacity 0.3s ease; white-space: nowrap;";
                document.body.appendChild(msgErreur);
            }

            msgErreur.innerHTML = `L'esprit est saturé.<br><span style="font-size: 16px; color: #e8d5a5;">Vous ne pouvez retenir que ${window.CARTES_MAX_PERSO} actions.</span>`;
            msgErreur.style.opacity = "1";
            setTimeout(() => { if (msgErreur) msgErreur.style.opacity = "0"; }, 2500);

            // Tremblement de refus
            elementBanniere.style.transform = "translateX(-5px)";
            setTimeout(() => elementBanniere.style.transform = "translateX(5px)", 50);
            setTimeout(() => elementBanniere.style.transform = elementBanniere.dataset.selectionnee === "true" ? "translateX(80px)" : "translateX(0px)", 100); 

            return; 
        }

        window.CARTES_SELECTIONNEES.push(idCarte);
        elementBanniere.dataset.selectionnee = "true";
        elementBanniere.style.transform = "translateX(80px)";
        elementCadre.style.backgroundImage = `url('${IMAGE_CADRE_SELECTIONNE}')`;
    }

    // Mise à jour visuelle du compteur
    if (compteurAffichage) {
        compteurAffichage.innerText = window.CARTES_SELECTIONNEES.length;
        compteurAffichage.style.color = window.CARTES_SELECTIONNEES.length >= window.CARTES_MAX_PERSO ? '#ff4c4c' : '#1b6e3a';
    }

    // Sauvegarde silencieuse Firebase
    if (window.ID_PERSONNAGE_DECK) {
        try {
            await updateDoc(doc(db, "Personnages", window.ID_PERSONNAGE_DECK), {
                Deck_Equipe: window.CARTES_SELECTIONNEES
            });
        } catch (e) {
            console.error("Erreur de synchronisation du deck :", e);
        }
    }
};

// =========================================================================
//  MOTEUR ALGORITHMIQUE : FORGE DE COMPÉTENCES
// =========================================================================

window.forgeState = {
    idPersonnage: null,
    statsPerso: {},
    caracs: {},
    effetsBDD: [],
    actions: [],
    isCapReached: false,
    armePrincipale: null,
    zoneActionIdEnCours: null,
    selectedZoneHexes: [] 
};

const ORDRE_CARACS = ["FORCE", "DEXTÉRITÉ", "CONSTITUTION", "INTELLIGENCE", "SAGESSE", "CHARISME", "AUCUN"];
const ORDRE_MODS = ["FORCE", "DEXTÉRITÉ", "CONSTITUTION", "INTELLIGENCE", "SAGESSE", "CHARISME", "GÉNÉRAL", "AUCUN"];

const LEGACY_TYPE_MAP = {
    Degats: "Action/Global", Soin: "Action/Global", Defense: "Action/Global", Special: "Action/Global",
    Action: "Action/Global", Global: "Action/Global",
    Alteration: "Magique", Deplacement: "Spatial", Portee: "Spatial", Bonus: "Action/Global"
};

// Fonction vitale pour comprendre les virgules de la BDD (ex: 1,5 -> 1.5)
function parseFrenchFloat(val) {
    if (val === undefined || val === null || val === "") return 0;
    const str = String(val).replace(',', '.');
    const parsed = parseFloat(str);
    return isNaN(parsed) ? 0 : parsed;
}

function normalizeForgeType(type, fallback = "Aucun") {
    if (!type) return fallback;
    return LEGACY_TYPE_MAP[type] || type;
}

function getMaxStacks(effet) {
    const pBase = parseFrenchFloat(effet.Pourcent_Base);
    const pMax = parseFrenchFloat(effet.Pourcent_Max);
    const valBase = parseFrenchFloat(effet.Valeur);

    if (pBase > 0 && pMax > 0) return Math.floor(pMax / pBase);
    if (valBase > 0 && pMax > 0) return Math.floor(pMax / valBase);
    if (pMax > 0 && pBase === 0 && valBase === 0) return Math.floor(pMax);

    if (["Persistance terrain", "Durée +", "Durée étalement dégâts", "DOT", "Illusion"].includes(effet.Nom)) return 1;
    if (effet.Nom === "Initiative +") return 6;
    if (effet.Nom === "Zone") return 15;
    return 25;
}

// Remplacement intelligent dans le texte selon les valeurs BDD en temps réel
function formatterTexteEffet(effet, stacks) {
    let texte = effet.Effet_Base || "";
    const val = parseFrenchFloat(effet.Valeur);
    const pBase = parseFrenchFloat(effet.Pourcent_Base);
    const pMax = parseFrenchFloat(effet.Pourcent_Max);

    // 1. Remplacement du % de base et du Max
    if (pBase > 0) {
        const calcP = pBase * stacks;
        if (/\d+(?:[.,]\d+)?\s*%/.test(texte)) {
            texte = texte.replace(/\d+(?:[.,]\d+)?\s*%/, calcP + "%");
        }
        if (pMax > 0 && /[Mm]ax\s*\d+(?:[.,]\d+)?\s*%?/.test(texte)) {
            texte = texte.replace(/([Mm]ax\s*)\d+(?:[.,]\d+)?(\s*%?)/i, `$1${pMax}$2`);
        }
    }
    
    // 2. Remplacement de la Valeur (Dégâts, Initiative, etc.)
    if (val > 0) {
        const calcV = val * stacks;
        if (pBase === 0) {
            // Remplace le 1er chiffre s'il n'y a pas de pourcentage dans l'effet
            texte = texte.replace(/\b\d+(?:[.,]\d+)?\b/, calcV);
        } else {
            // S'il y a un %, on remplace le 1er chiffre qui n'est PAS collé à un % (ex: "35" dans ton Electrifié)
            texte = texte.replace(/\b\d+(?:[.,]\d+)?\b(?!\s*%)/, calcV);
        }
    }

    // 3. Fallback générique
    if (pBase === 0 && val === 0 && !["Persistance terrain", "Durée +", "DOT"].includes(effet.Nom)) {
        if (!texte.includes(`(x${stacks})`)) texte += ` (x${stacks})`;
    }
    
    return texte;
}

function estIncompatibleAvecArme(nomEffet, arme) {
    if (!arme || !nomEffet) return false;
    const nom = nomEffet.toLowerCase();
    
    if (arme === "Sans arme / Arme rp") {
        if (nom.includes("attaque magique") || nom.includes("mot de pouvoir") || nom.includes("mots de pouvoir") || nom.includes("attaque légère") || nom.includes("attaque legere")) return true;
    } else if (arme === "Arme légère CAC") {
        if (nom.includes("attaque lourde")) return true;
    } else if (arme === "Arme lourde CAC") {
        if (nom.includes("attaque légère") || nom.includes("attaque legere")) return true;
    } else if (arme === "Arme polyvalente") {
        if (nom.includes("attaque légère") || nom.includes("attaque legere")) return true;
    } else if (arme === "Arme légère Distance") {
        if (nom.includes("attaque lourde")) return true;
    } else if (arme === "Magie") {
        if (nom.includes("attaque lourde") || nom.includes("attaque légère") || nom.includes("attaque legere")) return true;
    }
    return false;
}

// === OUTILS POUR LA ZONE ===
function actionHasDistance(act) {
    if (act.baseEffet.Nom === "Distance") return true;
    let hasDist = false;
    Object.keys(act.mods).forEach(modId => {
        const modEff = window.forgeState.effetsBDD.find(e => e.id === modId);
        if (modEff && modEff.Nom === "Distance") hasDist = true;
    });
    return hasDist;
}

function hexDistance(h1, h2) {
    return (Math.abs(h1.q - h2.q) + Math.abs(h1.q + h1.r - h2.q - h2.r) + Math.abs(h1.r - h2.r)) / 2;
}

function isConnectedToCenter(hexes, targetHex, hasDistance) {
    if (hasDistance) return true; 
    if (targetHex.q === 0 && targetHex.r === 0) return true;

    const neighbors = [
        {q: targetHex.q + 1, r: targetHex.r}, {q: targetHex.q + 1, r: targetHex.r - 1},
        {q: targetHex.q, r: targetHex.r - 1}, {q: targetHex.q - 1, r: targetHex.r},
        {q: targetHex.q - 1, r: targetHex.r + 1}, {q: targetHex.q, r: targetHex.r + 1}
    ];

    return neighbors.some(n => 
        (n.q === 0 && n.r === 0) || hexes.some(h => h.q === n.q && h.r === n.r)
    );
}

function purgeDisconnectedZoneHexes(hexes, hasDistance) {
    if (hasDistance) return hexes;
    
    let connected = [];
    let queue = [{q: 0, r: 0}];
    let visited = new Set(["0,0"]);

    while (queue.length > 0) {
        let current = queue.shift();
        const neighbors = [
            {q: current.q + 1, r: current.r}, {q: current.q + 1, r: current.r - 1},
            {q: current.q, r: current.r - 1}, {q: current.q - 1, r: current.r},
            {q: current.q - 1, r: current.r + 1}, {q: current.q, r: current.r + 1}
        ];

        neighbors.forEach(n => {
            const key = `${n.q},${n.r}`;
            if (hexes.some(h => h.q === n.q && h.r === n.r) && !visited.has(key)) {
                visited.add(key);
                connected.push(n);
                queue.push(n);
            }
        });
    }
    return connected;
}

// =========================================================================

window.ouvrirCreationCompetence = async function() {
    window.forgeState.actions = [];
    window.forgeState.isCapReached = false;
    window.forgeState.armePrincipale = null;

    document.getElementById("forge-nom").value = "";
    const selectElement = document.getElementById("forge-element");
    if (selectElement) selectElement.value = "Aucun";

    const idPerso = document.getElementById("champ-id-personnage").value;
    window.forgeState.idPersonnage = idPerso;

    const snapPerso = await getDoc(doc(db, "Personnages", idPerso));
    if (snapPerso.exists()) window.forgeState.statsPerso = snapPerso.data();

    const snapCaracs = await getDoc(doc(db, "Caracteristiques", idPerso));
    window.forgeState.caracs = snapCaracs.exists() ? snapCaracs.data() : {};

    // Forçage de lecture Firebase à chaque ouverture pour toujours avoir les dernières modifications !
    const snap = await getDocs(collection(db, "Combat_Effets"));
    window.forgeState.effetsBDD = snap.docs.map(d => {
        const data = d.data();
        return {
            id: d.id,
            ...data,
            Type_Mecanique: normalizeForgeType(data.Type_Mecanique, "Action/Global"),
            Type_Mecanique_2: data.Type_Mecanique_2 ? normalizeForgeType(data.Type_Mecanique_2) : "Aucun"
        };
    });

    document.getElementById("overlay-jeu-modale").style.display = "block";
    document.getElementById("modale-creation-competence").style.display = "block";
    window.rafraichirForge();
};

window.fermerForgeCompetence = function() {
    document.getElementById("modale-creation-competence").style.display = "none";
    document.getElementById("modale-menu-ajout").style.display = "none";
    document.getElementById("modale-menu-arme").style.display = "none";
    document.getElementById("modale-editeur-zone").style.display = "none";
    document.getElementById("overlay-jeu-modale").style.display = "none";
};

window.ouvrirMenuArme = function() {
    document.getElementById("modale-menu-arme").style.display = "block";
};

window.ouvrirMenuAjoutForge = function() {
    if (!window.forgeState.armePrincipale) {
        window.ouvrirMenuArme();
        return;
    }

    const conteneurMenu = document.getElementById("forge-menu-caracs");
    conteneurMenu.innerHTML = "";

    const activeTags = getActiveTags();
    document.getElementById("forge-tags-count").innerText = `${activeTags.size}/2 Tags`;
    document.getElementById("forge-tags-count").style.color = activeTags.size >= 2 ? "red" : "green";

    const capAtteint = window.forgeState.isCapReached;

    ORDRE_CARACS.forEach(carac => {
        const effets = window.forgeState.effetsBDD.filter(e => {
            const mod = e.Modificateur ? e.Modificateur.toUpperCase() : "AUCUN";
            const estRacine = e.Type_Mecanique === "Action/Global" || e.Type_Mecanique_2 === "Action/Global";
            return mod === carac && estRacine;
        });

        if (effets.length > 0) {
            let htmlLignes = "";
            effets.forEach(eff => {
                const isLocked = (activeTags.size >= 2 && eff.Modificateur !== "AUCUN" && !activeTags.has(eff.Modificateur.toUpperCase()));
                const isArmeIncompatible = estIncompatibleAvecArme(eff.Nom, window.forgeState.armePrincipale);
                
                const isDisabled = isLocked || capAtteint || isArmeIncompatible;
                const bgColor = isDisabled ? 'gray' : '#3b82f6';
                
                // Calcul de la fatigue
                const coutFatigue = parseFrenchFloat(eff.Cout_PT) * 5;

                htmlLignes += `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid rgba(0,0,0,0.05); opacity: ${isDisabled ? 0.4 : 1};">
                        <div style="display: flex; flex-direction: column;">
                            <div>
                                <strong style="color: #2a1a0f; font-size: 16px;">${eff.Nom}</strong>
                                ${eff.Modificateur !== "AUCUN" ? `<span style="font-size: 12px; color: #9333ea; font-weight: bold; margin-left: 4px;">[${eff.Modificateur}]</span>` : ""}
                                <span style="font-size: 13px; font-weight: bold; color: #ff4c4c; margin-left: 6px;">⚡ ${coutFatigue}</span>
                            </div>
                            <span style="font-size: 13px; color: gray;">${formatterTexteEffet(eff, 1)}</span>
                        </div>
                        <button class="btn-rond-plus" style="width: 34px; height: 34px; font-size: 18px; background-color: ${bgColor}; color: white; border: none; border-radius: 50%;"
                                onclick="window.ajouterComposantPrincipal('${eff.id}')" ${isDisabled ? "disabled" : ""}>+</button>
                    </div>
                `;
            });

            if (htmlLignes !== "") {
                conteneurMenu.innerHTML += `
                    <div style="background: white; border-radius: 12px; border: 1px solid rgba(0,0,0,0.1); overflow: hidden; margin-bottom: 10px;">
                        ${htmlLignes}
                    </div>
                `;
            }
        }
    });

    document.getElementById("modale-menu-ajout").style.display = "block";
};

window.fermerMenuAjoutForge = function() {
    document.getElementById("modale-menu-ajout").style.display = "none";
};

function isEffetPhysique(effet) {
    return effet && (effet.Type_Mecanique === "Physique" || effet.Type_Mecanique_2 === "Physique");
}

function purgerIncompatibilitesArme() {
    if (!window.forgeState.armePrincipale) return;

    window.forgeState.actions = window.forgeState.actions.filter(
        act => !estIncompatibleAvecArme(act.baseEffet.Nom, window.forgeState.armePrincipale)
    );

    if (window.forgeState.armePrincipale === "Magie") {
        window.forgeState.actions.forEach(act => {
            Object.keys(act.mods).forEach(modId => {
                const modEff = window.forgeState.effetsBDD.find(e => e.id === modId);
                if (isEffetPhysique(modEff)) delete act.mods[modId];
            });
        });
    }
}

window.selectionnerArme = function(arme) {
    window.forgeState.armePrincipale = arme;
    document.getElementById("modale-menu-arme").style.display = "none";
    purgerIncompatibilitesArme();
    window.rafraichirForge();

    if (window.forgeState.actions.length === 0) {
        window.ouvrirMenuAjoutForge();
    }
};

window.ajouterComposantPrincipal = function(effetId) {
    const eff = window.forgeState.effetsBDD.find(e => e.id === effetId);
    window.forgeState.actions.push({
        idInst: "ACT_" + Math.random().toString(36).substring(2, 9),
        baseEffet: eff, 
        count: 1, 
        mods: {},
        zoneHexes: [],
        baseDuree: 0,
        modsDuree: {}
    });

    window.fermerMenuAjoutForge();
    window.rafraichirForge();
};

window.modifierActionCount = function(idInst, delta) {
    const act = window.forgeState.actions.find(a => a.idInst === idInst);
    act.count += delta;
    if (act.count <= 0) {
        window.forgeState.actions = window.forgeState.actions.filter(a => a.idInst !== idInst);
    } else if (act.count > getMaxStacks(act.baseEffet)) {
        act.count = getMaxStacks(act.baseEffet);
    }
    window.rafraichirForge();
};

window.modifierModCount = function(idInst, modId, delta) {
    const act = window.forgeState.actions.find(a => a.idInst === idInst);
    act.mods[modId] = (act.mods[modId] || 0) + delta;

    if (act.mods[modId] <= 0) {
        delete act.mods[modId];
        if (act.modsDuree && act.modsDuree[modId] !== undefined) delete act.modsDuree[modId];
        const modEffet = window.forgeState.effetsBDD.find(e => e.id === modId);
        if (modEffet && modEffet.Nom === "Zone") act.zoneHexes = [];
    } else {
        const modEffet = window.forgeState.effetsBDD.find(e => e.id === modId);
        if (act.mods[modId] > getMaxStacks(modEffet)) act.mods[modId] = getMaxStacks(modEffet);
    }
    
    const modEffet = window.forgeState.effetsBDD.find(e => e.id === modId);
    if (modEffet && modEffet.Nom === "Zone") {
        if (act.zoneHexes.length === 0 && act.mods[modId] > 0) act.zoneHexes = [];
    }

    window.rafraichirForge();
};

window.modifierDuree = function(idInst, modId, delta) {
    const act = window.forgeState.actions.find(a => a.idInst === idInst);
    if (!act) return;
    
    const effetDureePlus = window.forgeState.effetsBDD.find(e => e.Nom === "Durée +");
    const max = effetDureePlus ? getMaxStacks(effetDureePlus) : 1;

    if (modId === null) {
        act.baseDuree = (act.baseDuree || 0) + delta;
        if (act.baseDuree < 0) act.baseDuree = 0;
        if (act.baseDuree > max) act.baseDuree = max;
    } else {
        if (!act.modsDuree) act.modsDuree = {};
        act.modsDuree[modId] = (act.modsDuree[modId] || 0) + delta;
        if (act.modsDuree[modId] < 0) act.modsDuree[modId] = 0;
        if (act.modsDuree[modId] > max) act.modsDuree[modId] = max;
    }
    
    window.rafraichirForge();
};

window.attacherModificateur = function(selectElement, idInst) {
    const modId = selectElement.value;
    if (!modId) return;
    if (window.forgeState.isCapReached) { selectElement.value = ""; return; }
    window.modifierModCount(idInst, modId, 1);
    selectElement.value = "";
};

function getActiveTags() {
    let tags = new Set();
    window.forgeState.actions.forEach(a => {
        if (a.baseEffet.Modificateur && a.baseEffet.Modificateur !== "AUCUN") tags.add(a.baseEffet.Modificateur.toUpperCase());
        Object.keys(a.mods).forEach(modId => {
            const eff = window.forgeState.effetsBDD.find(e => e.id === modId);
            if (eff && eff.Modificateur && eff.Modificateur !== "AUCUN") tags.add(eff.Modificateur.toUpperCase());
        });
    });
    return tags;
}

function compilerEffetsTexte() {
    let descriptions = [];
    window.forgeState.actions.forEach(act => {
        let descBase = formatterTexteEffet(act.baseEffet, act.count);
        if (act.baseDuree > 0) descBase += ` <span style="color:#9333ea;">(+ ⏳ ${act.baseDuree} Trs)</span>`;
        
        // On sauvegarde un objet propre au lieu d'une simple phrase
        descriptions.push({
            nom: act.baseEffet.Nom,
            desc: descBase,
            isMod: false
        });

        Object.keys(act.mods).forEach(modId => {
            const modEff = window.forgeState.effetsBDD.find(e => e.id === modId);
            if (modEff) {
                if (modEff.Nom === "Zone") {
                    let zoneLen = (act.zoneHexes && act.zoneHexes.length > 0) ? act.zoneHexes.length : act.mods[modId];
                    descriptions.push({
                        nom: "Zone",
                        desc: `${zoneLen} hexagone(s)`,
                        isMod: true,
                        isZone: true
                    });
                } else {
                    let descMod = formatterTexteEffet(modEff, act.mods[modId]);
                    if (act.modsDuree && act.modsDuree[modId] > 0) descMod += ` <span style="color:#9333ea;">(+ ⏳ ${act.modsDuree[modId]} Trs)</span>`;
                    descriptions.push({
                        nom: modEff.Nom,
                        desc: descMod,
                        isMod: true
                    });
                }
            }
        });
    });
    return descriptions;
}

// === ÉDITEUR DE ZONE ===
window.ouvrirEditeurZone = function(idInst) {
    window.forgeState.zoneActionIdEnCours = idInst;
    const act = window.forgeState.actions.find(a => a.idInst === idInst);
    window.forgeState.selectedZoneHexes = [...(act.zoneHexes || [])];
    
    document.getElementById("modale-editeur-zone").style.display = "block";
    window.dessinerGrilleZone();
};

window.fermerEditeurZone = function(valider) {
    if (valider && window.forgeState.zoneActionIdEnCours) {
        const act = window.forgeState.actions.find(a => a.idInst === window.forgeState.zoneActionIdEnCours);
        act.zoneHexes = [...window.forgeState.selectedZoneHexes];
        
        const modZone = window.forgeState.effetsBDD.find(e => e.Nom === "Zone");
        if (modZone) {
            act.mods[modZone.id] = act.zoneHexes.length > 0 ? act.zoneHexes.length : 1;
        }
    }
    document.getElementById("modale-editeur-zone").style.display = "none";
    window.forgeState.zoneActionIdEnCours = null;
    window.rafraichirForge();
};

window.clicHexagoneZone = function(q, r) {
    const act = window.forgeState.actions.find(a => a.idInst === window.forgeState.zoneActionIdEnCours);
    const hasDist = actionHasDistance(act);
    const isPlayer = (q === 0 && r === 0 && !hasDist);

    if (isPlayer) return; 

    const isSelected = window.forgeState.selectedZoneHexes.some(h => h.q === q && h.r === r);

    if (isSelected) {
        window.forgeState.selectedZoneHexes = window.forgeState.selectedZoneHexes.filter(h => h.q !== q || h.r !== r);
        window.forgeState.selectedZoneHexes = purgeDisconnectedZoneHexes(window.forgeState.selectedZoneHexes, hasDist);
    } else {
        const target = {q, r};
        if (isConnectedToCenter(window.forgeState.selectedZoneHexes, target, hasDist)) {
            if (window.forgeState.selectedZoneHexes.length < 15) {
                window.forgeState.selectedZoneHexes.push(target);
            }
        }
    }

    window.dessinerGrilleZone();
};

window.dessinerGrilleZone = function() {
    const svg = document.getElementById("zone-hex-grid");
    svg.innerHTML = "";

    const act = window.forgeState.actions.find(a => a.idInst === window.forgeState.zoneActionIdEnCours);
    const hasDist = actionHasDistance(act);

    document.getElementById("zone-description-texte").innerText = hasDist ? 
        "Cible à distance. N'importe quel hexagone est cliquable." : 
        "Sort au corps-à-corps. Les hexagones doivent toucher le lanceur (centre).";

    const modZone = window.forgeState.effetsBDD.find(e => e.Nom === "Zone");
    const costPC = modZone ? parseFrenchFloat(modZone.Cout_PT) : 1.5;

    const currentZoneCount = window.forgeState.selectedZoneHexes.length;
    // On remet la gratuité pour le 1er hexagone
    const finalCost = Math.max(0, (currentZoneCount - 1) * costPC);
    
    const affichage = document.getElementById("zone-cout-affichage");
    affichage.innerText = finalCost === 0 ? "Gratuit" : `${finalCost} PC`;
    affichage.style.color = finalCost === 0 ? "#1b6e3a" : "#ff4c4c";

    const hexRadius = 25;
    const cx = 150;
    const cy = 150;

    for (let q = -2; q <= 2; q++) {
        let r1 = Math.max(-2, -q - 2);
        let r2 = Math.min(2, -q + 2);

        for (let r = r1; r <= r2; r++) {
            const isCenter = (q === 0 && r === 0);
            const isPlayer = isCenter && !hasDist;
            const isSelected = window.forgeState.selectedZoneHexes.some(h => h.q === q && h.r === r);

            const x = cx + hexRadius * Math.sqrt(3) * (q + r / 2.0);
            const y = cy + hexRadius * 3.0 / 2.0 * r;

            let fillColor = "transparent";
            if (isPlayer) fillColor = "gray";
            else if (isSelected) fillColor = "rgba(255, 76, 76, 0.8)";
            else fillColor = "rgba(59, 130, 246, 0.1)";

            const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            
            let points = "";
            for(let i=0; i<6; i++) {
                let angle = Math.PI / 3 * i - Math.PI / 6;
                points += `${x + hexRadius * Math.cos(angle)},${y + hexRadius * Math.sin(angle)} `;
            }
            
            polygon.setAttribute("points", points.trim());
            polygon.setAttribute("fill", fillColor);
            polygon.setAttribute("stroke", "rgba(0,0,0,0.2)");
            polygon.setAttribute("stroke-width", "1");
            polygon.style.cursor = isPlayer ? "default" : "pointer";
            
            polygon.onclick = () => window.clicHexagoneZone(q, r);

            svg.appendChild(polygon);

            if (isPlayer) {
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                text.setAttribute("x", x);
                text.setAttribute("y", y + 4);
                text.setAttribute("text-anchor", "middle");
                text.setAttribute("fill", "white");
                text.setAttribute("font-size", "12");
                text.textContent = "⚔️";
                text.style.pointerEvents = "none";
                svg.appendChild(text);
            }
        }
    }
};

window.rafraichirForge = function() {
    let totalPC = 0;
    let initBonusNet = 0;
    const activeTags = getActiveTags();

    // Récupération dynamique de la BDD pour Durée+
    const effetDureePlus = window.forgeState.effetsBDD.find(e => e.Nom === "Durée +");
    const coutDureePlus = effetDureePlus ? parseFrenchFloat(effetDureePlus.Cout_PT) : 5;
    const maxDureeStacks = effetDureePlus ? getMaxStacks(effetDureePlus) : 1;

    window.forgeState.actions.forEach(act => {
        let baseActionCost = parseFrenchFloat(act.baseEffet.Cout_PT) * act.count;
        let coutDureeBase = (act.baseDuree || 0) * coutDureePlus;
        
        let coutMods = 0;
        let aDOT = false;

        if (act.baseEffet.Nom === "Initiative +") {
            const baseVal = parseFrenchFloat(act.baseEffet.Valeur) || 8;
            initBonusNet += act.count * (baseVal + parseFrenchFloat(act.baseEffet.Cout_PT) * 5);
        }

        Object.keys(act.mods).forEach(modId => {
            const modCount = act.mods[modId];
            const modEff = window.forgeState.effetsBDD.find(e => e.id === modId);

            if (modEff) {
                if (modEff.Nom === "Initiative +") {
                    const baseVal = parseFrenchFloat(modEff.Valeur) || 8;
                    initBonusNet += modCount * (baseVal + parseFrenchFloat(modEff.Cout_PT) * 5);
                }

                if (modEff.Nom === "Zone") {
                    let zoneLen = (act.zoneHexes && act.zoneHexes.length > 0) ? act.zoneHexes.length : modCount;
                    // On remet le premier hexagone gratuit ici aussi !
                    coutMods += parseFrenchFloat(modEff.Cout_PT) * Math.max(0, zoneLen - 1);
                } else if (modEff.Nom === "DOT" || modEff.Nom === "Durée étalement dégâts") {
                    aDOT = true;
                } else {
                    coutMods += parseFrenchFloat(modEff.Cout_PT) * modCount;
                }

                // Surcoût lié au bouton ⏳ de CE sous-effet
                let currentModDuree = (act.modsDuree && act.modsDuree[modId]) || 0;
                coutMods += currentModDuree * coutDureePlus;
            }
        });

        let coutActionTotale = baseActionCost + coutDureeBase + coutMods;
        if (aDOT) coutActionTotale /= 1.2;
        totalPC += coutActionTotale;
    });

    const caracs = window.forgeState.caracs || {};
    let statsTable = {
        "FORCE": caracs.force ?? 8, "DEXTÉRITÉ": caracs.dex ?? 8,
        "CONSTITUTION": caracs.con ?? 8, "INTELLIGENCE": caracs.int ?? 8,
        "SAGESSE": caracs.sag ?? 8, "CHARISME": caracs.cha ?? 8
    };

    let capFatigue = 30;
    if (activeTags.size > 0) {
        let somme = 0;
        activeTags.forEach(c => { somme += statsTable[c] || 8; });
        capFatigue = (Math.floor(somme / activeTags.size) - 5) * 10;
    }

    const fatigueConsommee = Math.floor(totalPC * 5);
    const initiative = Math.max(0, 100 - fatigueConsommee) + initBonusNet;

    const capDepasse = fatigueConsommee >= capFatigue;
    const capErreur = fatigueConsommee > capFatigue;
    window.forgeState.isCapReached = capDepasse;

    const armeContainer = document.getElementById("forge-weapon-tag-container");
    if (armeContainer) {
        if (window.forgeState.armePrincipale) {
            armeContainer.innerHTML = `<span onclick="jouerSonClic(); window.ouvrirMenuArme()" style="background: #2563eb; color: white; padding: 6px 16px; border-radius: 12px; font-size: 15px; font-weight: bold; letter-spacing: 1px; display: inline-block; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: transform 0.1s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" title="Changer l'arme de la technique">${window.forgeState.armePrincipale.toUpperCase()} 🔄</span>`;
        } else {
            armeContainer.innerHTML = ``;
        }
    }

    const tagsDiv = document.getElementById("forge-active-tags");
    if (tagsDiv) {
        if (activeTags.size === 0) {
            tagsDiv.innerHTML = `<span style="color: gray; font-size: 14px; font-style: italic;">Aucune caractéristique cible</span>`;
        } else {
            tagsDiv.innerHTML = Array.from(activeTags).map(t => `<span style="background: #9333ea; color: white; padding: 4px 10px; border-radius: 6px; font-size: 13px; font-weight: bold; letter-spacing: 1px;">[${t}]</span>`).join("");
        }
    }

    const selectElement = document.getElementById("forge-element");
    if (selectElement) {
        const element = selectElement.value;
        document.getElementById("forge-element-affichage").innerText = element === "Aucun" ? "" : "• " + element.toUpperCase();
    }

    document.getElementById("forge-cout-pc").innerText = totalPC.toFixed(1) + " PC";
    document.getElementById("forge-fatigue-val").innerText = fatigueConsommee;

    document.getElementById("forge-fatigue-val").style.color = capErreur ? "red" : "#d97706";
    document.getElementById("forge-cap-fatigue").innerText = capFatigue;
    document.getElementById("forge-initiative-val").innerText = initiative;

    const conteneurCarte = document.getElementById("forge-contenu-carte");
    conteneurCarte.innerHTML = "";

    const renderSelectMenu = (type, label, color, actionId) => {
        if (type === "Physique" && window.forgeState.armePrincipale === "Magie") return "";

        let modsDispos = window.forgeState.effetsBDD.filter(e => 
            (e.Type_Mecanique === type || e.Type_Mecanique_2 === type) && e.Nom !== "Durée +"
        );
        let options = `<option value="">+ ${label}</option>`;
        
        let groupesMods = {};
        modsDispos.forEach(mod => {
            const isLocked = activeTags.size >= 2 && mod.Modificateur !== "AUCUN" && !activeTags.has(mod.Modificateur.toUpperCase());
            if (!isLocked) {
                const carac = (mod.Modificateur && mod.Modificateur !== "AUCUN") ? mod.Modificateur.toUpperCase() : "GÉNÉRAL";
                if (!groupesMods[carac]) groupesMods[carac] = [];
                
                // Calcul de la fatigue pour l'affichage
                const coutFatigue = parseFrenchFloat(mod.Cout_PT) * 5;
                groupesMods[carac].push(`<option value="${mod.id}">${mod.Nom} (⚡ ${coutFatigue})</option>`);
            }
        });

        ORDRE_MODS.forEach(carac => {
            if (groupesMods[carac] && groupesMods[carac].length > 0) {
                options += `<optgroup label="-- ${carac} --">`;
                options += groupesMods[carac].join("");
                options += `</optgroup>`;
            }
        });

        Object.keys(groupesMods).forEach(carac => {
            if (!ORDRE_MODS.includes(carac)) {
                options += `<optgroup label="-- ${carac} --">`;
                options += groupesMods[carac].join("");
                options += `</optgroup>`;
            }
        });

        return `<select ${capDepasse ? "disabled" : ""} style="font-size: 13px; font-weight: bold; color: ${color}; background: transparent; border: none; outline: none; cursor: ${capDepasse ? "not-allowed" : "pointer"}; max-width: 100px; opacity: ${capDepasse ? 0.4 : 1};" onchange="window.attacherModificateur(this, '${actionId}')">${options}</select>`;
    };

    if (window.forgeState.actions.length > 0) {
        window.forgeState.actions.forEach(act => {

            const isActMaxed = act.count >= getMaxStacks(act.baseEffet);
            const btnPlusActDisabled = (isActMaxed || capDepasse) ? `disabled style="opacity: 0.3; cursor: not-allowed; border:none; background:none; font-weight:bold; font-size:18px;"` : `style="color: green; cursor: pointer; border:none; background:none; font-weight:bold; font-size:18px;"`;

            const baseHasDuree = parseFrenchFloat(act.baseEffet.Tours) > 0;
            const currentBaseDuree = act.baseDuree || 0;
            const btnPlusBaseDureeDisabled = (currentBaseDuree >= maxDureeStacks || capDepasse) ? `disabled style="opacity: 0.3; cursor: not-allowed; border:none; background:none; font-weight:bold; font-size:16px;"` : `style="color: green; cursor: pointer; border:none; background:none; font-weight:bold; font-size:16px;"`;

            let htmlMods = "";
            Object.keys(act.mods).forEach(modId => {
                const modCount = act.mods[modId];
                const modEff = window.forgeState.effetsBDD.find(e => e.id === modId);

                const isModMaxed = modCount >= getMaxStacks(modEff);
                const btnPlusModDisabled = (isModMaxed || capDepasse) ? `disabled style="opacity: 0.3; cursor: not-allowed; border:none; background:none; font-weight:bold; font-size:16px;"` : `style="color: green; cursor: pointer; border:none; background:none; font-weight:bold; font-size:16px;"`;

                let boutonEditerZone = "";
                if (modEff.Nom === "Zone") {
                    boutonEditerZone = `<button class="btn-parametres" style="padding: 3px 8px; font-size: 12px; margin-right: 5px; background: #3b82f6; color: white;" onclick="window.ouvrirEditeurZone('${act.idInst}')">Éditer</button>`;
                }

                const modHasDuree = parseFrenchFloat(modEff.Tours) > 0;
                const currentModDuree = (act.modsDuree && act.modsDuree[modId]) || 0;
                const btnPlusModDureeDisabled = (currentModDuree >= maxDureeStacks || capDepasse) ? `disabled style="opacity: 0.3; cursor: not-allowed; border:none; background:none; font-weight:bold; font-size:16px;"` : `style="color: green; cursor: pointer; border:none; background:none; font-weight:bold; font-size:16px;"`;

                htmlMods += `
                    <div style="display: flex; justify-content: space-between; margin-left: 20px; padding: 4px 0;">
                        <div>
                            <span style="color: gray; font-size: 14px;">↳</span> <b style="font-size: 14px;">${modEff.Nom}</b>
                            ${modEff.Modificateur !== "AUCUN" ? `<span style="font-size: 12px; color: #9333ea; font-weight: bold; margin-left: 4px;">[${modEff.Modificateur}]</span>` : ""}
                            <div style="font-size: 13px; color: gray; margin-left: 15px;">
                                ${formatterTexteEffet(modEff, modCount)}
                                ${currentModDuree > 0 ? `<br><span style="color: #9333ea;">↳ ⏳ +${currentModDuree} Tour(s) (+${(currentModDuree * coutDureePlus).toFixed(1).replace(/\.0$/, '')} PC)</span>` : ""}
                            </div>
                        </div>
                        <div style="display: flex; gap: 6px; align-items: flex-start;">
                            ${modHasDuree ? `
                                <div style="display: flex; gap: 4px; align-items: center; background: rgba(147, 51, 234, 0.1); border-radius: 12px; padding: 3px 6px; margin-right: 5px;">
                                    <button onclick="window.modifierDuree('${act.idInst}', '${modId}', -1)" style="border:none; background:none; color:red; font-weight:bold; cursor:pointer; font-size:16px;">-</button>
                                    <span style="font-size:13px; font-weight:bold; color:#9333ea;" title="Augmenter la durée">⏳ ${currentModDuree}</span>
                                    <button onclick="window.modifierDuree('${act.idInst}', '${modId}', 1)" ${btnPlusModDureeDisabled}>+</button>
                                </div>
                            ` : ""}
                            ${boutonEditerZone}
                            <button onclick="window.modifierModCount('${act.idInst}', '${modId}', -1)" style="border:none; background:none; color:red; cursor:pointer; font-weight:bold; font-size:16px;">-</button>
                            <b style="font-size: 15px;">${modCount}</b>
                            <button onclick="window.modifierModCount('${act.idInst}', '${modId}', 1)" ${btnPlusModDisabled}>+</button>
                        </div>
                    </div>
                `;
            });

            conteneurCarte.innerHTML += `
                <div style="margin-bottom: 15px; background: rgba(0,0,0,0.02); padding: 12px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <b style="font-size: 16px;">• ${act.baseEffet.Nom}</b> ${act.baseEffet.Modificateur !== "AUCUN" ? `<span style="font-size: 12px; color: #9333ea; font-weight: bold; margin-left: 4px;">[${act.baseEffet.Modificateur}]</span>` : ""}
                            <div style="font-size: 13px; color: gray; margin-left: 10px; margin-top: 2px;">
                                ${formatterTexteEffet(act.baseEffet, act.count)}
                                ${currentBaseDuree > 0 ? `<br><span style="color: #9333ea;">↳ ⏳ +${currentBaseDuree} Tour(s) (+${(currentBaseDuree * coutDureePlus).toFixed(1).replace(/\.0$/, '')} PC)</span>` : ""}
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px; align-items: center; background: white; border: 1px solid rgba(0,0,0,0.1); border-radius: 12px; padding: 4px 8px;">
                            ${baseHasDuree ? `
                                <div style="display: flex; gap: 4px; align-items: center; background: rgba(147, 51, 234, 0.1); border-radius: 12px; padding: 3px 6px; margin-right: 5px;">
                                    <button onclick="window.modifierDuree('${act.idInst}', null, -1)" style="border:none; background:none; color:red; font-weight:bold; cursor:pointer; font-size:16px;">-</button>
                                    <span style="font-size:14px; font-weight:bold; color:#9333ea;" title="Augmenter la durée">⏳ ${currentBaseDuree}</span>
                                    <button onclick="window.modifierDuree('${act.idInst}', null, 1)" ${btnPlusBaseDureeDisabled}>+</button>
                                </div>
                            ` : ""}
                            <button onclick="window.modifierActionCount('${act.idInst}', -1)" style="border:none; background:none; color:red; font-weight:bold; cursor:pointer; font-size:18px;">-</button>
                            <b style="font-size: 18px;">${act.count}</b>
                            <button onclick="window.modifierActionCount('${act.idInst}', 1)" ${btnPlusActDisabled}>+</button>
                        </div>
                    </div>
                    ${htmlMods}

                    <div style="display: flex; gap: 15px; margin-left: 20px; margin-top: 12px; padding-top: 8px; border-top: 1px dashed rgba(0,0,0,0.1);">
                        ${renderSelectMenu("Spatial", "Spatial", "#3b82f6", act.idInst)}
                        ${renderSelectMenu("Physique", "Physique", "#ef4444", act.idInst)}
                        ${renderSelectMenu("Magique", "Magique", "#a855f7", act.idInst)}
                        ${renderSelectMenu("Duree", "Durée", "#9333ea", act.idInst)}
                    </div>
                </div>
            `;
        });
    }

    const btnValider = document.getElementById("btn-valider-forge");
    const nomSaisi = document.getElementById("forge-nom").value.trim();

    btnValider.disabled = capErreur || fatigueConsommee === 0 || nomSaisi === "" || !window.forgeState.armePrincipale;
};

window.sauvegarderCompetence = async function() {
    const nomCompetence = document.getElementById("forge-nom").value.trim();
    const arme = window.forgeState.armePrincipale || "Non spécifié";

    const selectElement = document.getElementById("forge-element");
    const element = selectElement ? selectElement.value : "Aucun";

    const fatigue = parseInt(document.getElementById("forge-fatigue-val").innerText);
    const initiative = parseInt(document.getElementById("forge-initiative-val").innerText);
    const coutPc = parseFrenchFloat(document.getElementById("forge-cout-pc").innerText.replace(" PC", ""));

    const btn = document.getElementById("btn-valider-forge");
    btn.innerText = "Forge en cours...";
    btn.disabled = true;

    const composantsSerialises = {
        actions: window.forgeState.actions.map(a => ({
            idInst: a.idInst,
            baseEffetId: a.baseEffet.id,
            count: a.count,
            mods: { ...a.mods },
            zoneHexes: a.zoneHexes || [],
            baseDuree: a.baseDuree || 0,
            modsDuree: { ...(a.modsDuree || {}) }
        }))
    };

    const dataCompetence = {
        Nom: nomCompetence,
        Arme: arme,
        Element: element,
        Fatigue: fatigue,
        Initiative: initiative,
        Cout_PC: coutPc,
        Effets_Compiles: compilerEffetsTexte(),
        Composants: composantsSerialises,
        Date_Creation: new Date().toISOString()
    };

    try {
        const idPerso = window.forgeState.idPersonnage;
        const idComp = "COMP_" + Math.random().toString(36).substring(2, 9);
        await setDoc(doc(db, "Personnages", idPerso, "Competences", idComp), dataCompetence);

        window.fermerForgeCompetence();

        if (typeof window.chargerOngletCompetences === "function") {
            window.chargerOngletCompetences(idPerso, window.forgeState.statsPerso.Competences_Max || 6);
        }
    } catch (e) {
        console.error("Erreur de sauvegarde :", e);
        alert("Échec de la forge.");
        btn.innerText = "✔️ VALIDER LA COMPÉTENCE";
        btn.disabled = false;
    }
};