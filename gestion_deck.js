// =========================================================================
//  IVALIS - GESTION DU DECK INTERACTIF (Sélection & Affichage)
// =========================================================================

import { db } from "./firebase-config.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Variables globales du module
window.DECK_COURANT = [];
window.COULEUR_PERSO_COURANT = "#4a1c1c";
window.CARTES_SELECTIONNEES = [];
window.CARTES_MAX_PERSO = 0;
window.ID_PERSONNAGE_DECK = null;

// Images des cadres
const IMAGE_CADRE_NORMAL = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png";
const IMAGE_CADRE_SELECTIONNE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1783286721/ban_cible_pdpnad.png";

// =========================================================================
// 1. GÉNÉRATION DE L'INTERFACE
// =========================================================================

window.afficherDeckInteractif = async function(idPersonnage, deckProcedural, couleurPerso, themeDeck) {
    const divResultat = document.getElementById("resultat-profil-deck");
    const conteneurAffichage = document.getElementById("json-affichage-deck");
    const titreTheme = document.getElementById("titre-theme-deck");
    const divCartesVide = document.getElementById("cartes-vide");

    window.DECK_COURANT = deckProcedural;
    window.COULEUR_PERSO_COURANT = couleurPerso;
    window.ID_PERSONNAGE_DECK = idPersonnage;

    titreTheme.innerText = themeDeck;
    divCartesVide.style.display = "none";
    divResultat.style.display = "block";

    // 1. Récupération des informations du personnage depuis Firebase
    window.CARTES_SELECTIONNEES = [];
    window.CARTES_MAX_PERSO = 9; // Valeur de secours par défaut absolue

    try {
        // A. On récupère le Deck mémorisé (Les cartes déjà cliquées)
        const persoRef = doc(db, "Personnages", idPersonnage);
        const persoSnap = await getDoc(persoRef);
        if (persoSnap.exists()) {
            window.CARTES_SELECTIONNEES = persoSnap.data().Deck_Equipe || [];
        }

        // B. On calcule la Limite de Cartes EXACTE depuis la vraie base de caractéristiques
        const caracsRef = doc(db, "Caracteristiques", idPersonnage);
        const caracsSnap = await getDoc(caracsRef);
        if (caracsSnap.exists()) {
            const intValue = caracsSnap.data().int || 8; // 8 par défaut si non renseigné
            const modInt = Math.floor((intValue - 10) / 2);
            window.CARTES_MAX_PERSO = 10 + modInt; // Formule absolue (Ex: 10 + 0 = 10)
        }
    } catch (e) {
        console.warn("Impossible de récupérer la fiche du personnage pour le deck :", e);
    }

    // 2. Construction de l'en-tête collant (Sticky Header)
    let htmlDeck = `
        <div id="compteur-deck-sticky">
            <span>Grimoire de Combat</span>
            <span>Cartes mémorisées : <span id="compteur-cartes-actuel" style="color: ${window.CARTES_SELECTIONNEES.length === window.CARTES_MAX_PERSO ? '#1b6e3a' : '#2c1e16'}">${window.CARTES_SELECTIONNEES.length}</span> / ${window.CARTES_MAX_PERSO}</span>
        </div>
        <div class="deck-visuel-container">
    `;
    
    // 3. Dessin des cartes
    deckProcedural.forEach((carte, index) => {
        let titre = carte.titre || "Action Inconnue";
        let estSelectionnee = window.CARTES_SELECTIONNEES.includes(carte.id);
        
        let classeSelection = estSelectionnee ? "selectionnee" : "";
        let urlCadre = estSelectionnee ? IMAGE_CADRE_SELECTIONNE : IMAGE_CADRE_NORMAL;
        
        htmlDeck += `
            <div id="ui-carte-${carte.id}" class="banniere-carte ${classeSelection}" 
                 onmouseenter="window.afficherCarteZoom(${index}, event)" 
                 onmouseleave="window.masquerCarteZoom()"
                 onclick="window.basculerSelectionCarte('${carte.id}')">
                
                <div class="fond-couleur" style="background-color: ${couleurPerso};"></div>
                <div id="cadre-carte-${carte.id}" class="image-cadre" style="background-image: url('${urlCadre}');"></div>
                <div class="initiative-bulle">${carte.initiative}</div>
                <div class="titre-carte">${titre}</div>
            </div>
        `;
    });
    
    htmlDeck += `</div>`;
    conteneurAffichage.innerHTML = htmlDeck;
};

// =========================================================================
// 2. LOGIQUE DE SÉLECTION (CLIC)
// =========================================================================

window.basculerSelectionCarte = async function(idCarte) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    const elementBanniere = document.getElementById(`ui-carte-${idCarte}`);
    const elementCadre = document.getElementById(`cadre-carte-${idCarte}`);
    const compteurAffichage = document.getElementById("compteur-cartes-actuel");

    if (!elementBanniere || !elementCadre) return;

    let indexDansSelection = window.CARTES_SELECTIONNEES.indexOf(idCarte);

    if (indexDansSelection > -1) {
        // --- ACTION : RETIRER LA CARTE ---
        window.CARTES_SELECTIONNEES.splice(indexDansSelection, 1);
        
        elementBanniere.classList.remove("selectionnee");
        elementCadre.style.backgroundImage = `url('${IMAGE_CADRE_NORMAL}')`;

    } else {
        // --- ACTION : AJOUTER LA CARTE ---
        
        // VÉRIFICATION DE LA LIMITE MAXIMALE !
        if (window.CARTES_SELECTIONNEES.length >= window.CARTES_MAX_PERSO) {
            
            // Le petit message immersif
            const onglet = document.getElementById("onglet-cartes");
            let msgErreur = document.getElementById("erreur-deck-immersif");

            if (!msgErreur) {
                msgErreur = document.createElement("div");
                msgErreur.id = "erreur-deck-immersif";
                onglet.appendChild(msgErreur);
            }

            msgErreur.innerHTML = `L'esprit est saturé.<br><span style="font-size: 16px; color: #e8d5a5;">Vous ne pouvez retenir que ${window.CARTES_MAX_PERSO} actions.</span>`;
            msgErreur.style.opacity = "1";

            setTimeout(() => { if (msgErreur) msgErreur.style.opacity = "0"; }, 2500);
            
            // Effet visuel de blocage (tremblement)
            elementBanniere.style.transform = "translateX(-5px)";
            setTimeout(() => elementBanniere.style.transform = "translateX(5px)", 50);
            
            // 🔻 CORRECTION : On vide le style au lieu de forcer un 0, pour rendre la main au CSS ! 🔻
            setTimeout(() => elementBanniere.style.transform = "", 100); 
            
            return; // Bloque la suite du code
        }

        window.CARTES_SELECTIONNEES.push(idCarte);
        
        elementBanniere.classList.add("selectionnee");
        elementCadre.style.backgroundImage = `url('${IMAGE_CADRE_SELECTIONNE}')`;
    }

    // Mise à jour visuelle du compteur
    if (compteurAffichage) {
        compteurAffichage.innerText = window.CARTES_SELECTIONNEES.length;
        compteurAffichage.style.color = window.CARTES_SELECTIONNEES.length === window.CARTES_MAX_PERSO ? '#1b6e3a' : '#2c1e16';
    }

    // Sauvegarde en temps réel dans la base de données !
    if (window.ID_PERSONNAGE_DECK) {
        try {
            await updateDoc(doc(db, "Personnages", window.ID_PERSONNAGE_DECK), {
                Deck_Equipe: window.CARTES_SELECTIONNEES
            });
        } catch (e) {
            console.error("Erreur de synchronisation du deck en base :", e);
        }
    }
};

// =========================================================================
// 3. APERÇU FLOTTANT (ZOOM)
// =========================================================================

window.afficherCarteZoom = function(indexCarte, evenement) {
    const carte = window.DECK_COURANT[indexCarte];
    const couleur = window.COULEUR_PERSO_COURANT;
    if (!carte) return;

    let apercu = document.getElementById("apercu-carte-zoom");
    if (!apercu) {
        apercu = document.createElement("div");
        apercu.id = "apercu-carte-zoom";
        document.body.appendChild(apercu);
    }

    // Formatage HAUT
    let effetsHaut = carte.haut.effets.length > 0 ? carte.haut.effets.join("<br>") : "";
    let texteElementHaut = carte.haut.element ? `<br><span style="color:#00ffff">${carte.haut.element}</span>` : "";
    let croixHaut = carte.haut.isBurn ? `<div class="icone-carte-perdue">✖</div>` : "";
    
    let htmlHaut = `
        <div class="carte-action-titre">${carte.haut.nom} ${carte.haut.valeur > 0 ? carte.haut.valeur : ''}</div>
        <div class="carte-action-effets">
            ${carte.haut.portee > 0 ? `Portée : ${carte.haut.portee}<br>` : ''}
            ${effetsHaut}
            ${texteElementHaut}
        </div>
        ${croixHaut}
    `;

    // Formatage BAS
    let effetsBas = carte.bas.effets.length > 0 ? carte.bas.effets.join("<br>") : "";
    let texteElementBas = carte.bas.element ? `<br><span style="color:#00ffff">${carte.bas.element}</span>` : "";
    let croixBas = carte.bas.isBurn ? `<div class="icone-carte-perdue">✖</div>` : "";

    let htmlBas = `
        <div class="carte-action-titre">${carte.bas.nom} ${carte.bas.valeur > 0 ? carte.bas.valeur : ''}</div>
        <div class="carte-action-effets">
            ${carte.bas.portee > 0 ? `Portée : ${carte.bas.portee}<br>` : ''}
            ${effetsBas}
            ${texteElementBas}
        </div>
        ${croixBas}
    `;

    let titrePopUp = carte.titre || "Action Inconnue";

    apercu.innerHTML = `
        <div class="carte-zoom-fond-couleur" style="background-color: ${couleur};"></div>
        <div class="carte-zoom-image"></div>
        
        <div class="carte-zoom-niveau">1</div>
        <div class="carte-zoom-titre">${titrePopUp}</div>
        <div class="carte-zoom-initiative">${carte.initiative}</div>
        
        <div class="carte-zoom-haut">${htmlHaut}</div>
        <div class="carte-zoom-bas">${htmlBas}</div>
    `;

    // Gestion de la position fixe au-dessus du menu
    const rectangleBanniere = evenement.currentTarget.getBoundingClientRect();
    
    // Le décalage prend en compte le fait que la carte puisse être "sélectionnée" (et donc décalée à droite)
    let decalageExtra = evenement.currentTarget.classList.contains("selectionnee") ? 80 : 0;
    
    let posX = rectangleBanniere.left - 320 - decalageExtra; 
    let posY = rectangleBanniere.top + (rectangleBanniere.height / 2) - (418 / 2);

    if (posY < 10) posY = 10;
    if (posY + 418 > window.innerHeight) posY = window.innerHeight - 428;

    apercu.style.left = posX + "px";
    apercu.style.top = posY + "px";
    apercu.style.display = "block";
};

window.masquerCarteZoom = function() {
    const apercu = document.getElementById("apercu-carte-zoom");
    if (apercu) {
        apercu.style.display = "none";
    }
};
