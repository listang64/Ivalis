import { db } from "./firebase-config.js";
import { doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// =========================================================================
//  IVALIS - MODULE DE COMBAT (INTERFACE DE BASE)
// =========================================================================

window.COMBAT_PERSOS_JOUEUR = [];

// =========================================================================
//  GESTION DU POPUP DE PRÉ-RENCONTRE
// =========================================================================

window.ouvrirPopupRencontre = function() {
    const modale = document.getElementById("modale-pre-combat");
    if (modale) {
        modale.style.display = "flex"; // Utilise flexbox pour centrer le contenu
    }
};

window.fermerPopupRencontre = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    const modale = document.getElementById("modale-pre-combat");
    if (modale) {
        modale.style.display = "none";
    }
};

window.validerPopupRencontre = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    // 1. On ferme le popup
    window.fermerPopupRencontre();
    // 2. On lance l'interface de combat
    window.ouvrirCombat();
};

window.COMBAT_INDEX_PERSO = 0;

window.ouvrirCombat = function() {
    if (typeof window.fermerToutesLesFenetres === "function") {
        window.fermerToutesLesFenetres();
    }

    const menuLat = document.getElementById('menu-lateral');
    const menuNav = document.getElementById('menu-navigation-bas');
    if (menuLat) menuLat.style.display = 'none';
    if (menuNav) menuNav.style.display = 'none';

    const btnFermer = document.getElementById('btn-fermer-combat');
    if (btnFermer) btnFermer.style.display = 'block';

    const fenetreCombat = document.getElementById('fenetre-combat');
    if (fenetreCombat) fenetreCombat.style.display = 'block';

    // Annonce le tour actuel dès l'ouverture (Tour 1 au lancement)
    if (typeof window.verifierChangementTour === "function") {
        window.verifierChangementTour((window.PARTIE_DATA && window.PARTIE_DATA.Tour_Combat) || 1);
    }

    // On charge juste l'UI de gauche
    window.initialiserPersosCombat();
    
    // Le plateau a déjà été chargé en arrière-plan, on s'assure juste qu'il est bien centré
    if (typeof window.centrerPlateau === "function") {
        window.centrerPlateau();
    }
};

window.fermerCombat = function() {
    if (typeof window.jouerSonSurvolParchemin === "function") {
        window.jouerSonSurvolParchemin();
    }
    if (typeof window.fermerMenusCoulissantsCombat === "function") {
        window.fermerMenusCoulissantsCombat();
    }
    // Désactive la gomme sans sauvegarder (le MJ doit valider via le losange)
    if (window.VTT_MODE_EFFACEMENT) {
        window.VTT_MODE_EFFACEMENT = false;
        isPaintingVTT = false;
        const btnGomme = document.getElementById("btn-gomme-vtt");
        if (btnGomme) btnGomme.classList.remove("actif");
        if (window.PLATEAU_VTT) window.PLATEAU_VTT.renderMap();
    }
    if (window.VTT_MODE_MURS) {
        window.VTT_MODE_MURS = false;
        isPaintingVTT = false;
        const btnMurs = document.getElementById("btn-murs-vtt");
        if (btnMurs) btnMurs.classList.remove("actif");
        if (window.PLATEAU_VTT) window.PLATEAU_VTT.renderMap();
    }
    if (window.VTT_MODE_DIFFICILE) {
        window.VTT_MODE_DIFFICILE = false;
        isPaintingVTT = false;
        const btnDifficile = document.getElementById("btn-difficile-vtt");
        if (btnDifficile) btnDifficile.classList.remove("actif");
        if (window.PLATEAU_VTT) window.PLATEAU_VTT.renderMap();
    }
    if (typeof window.fermerToutesLesFenetres === "function") {
        window.fermerToutesLesFenetres();
    }
};

window.initialiserPersosCombat = function() {
    const currentUserId = localStorage.getItem("ID_JOUEUR_COURANT");
    
    if (window.PERSOS_PARTIE && currentUserId) {
        window.COMBAT_PERSOS_JOUEUR = window.PERSOS_PARTIE.filter(p => p.idJoueur === currentUserId);
    } else {
        window.COMBAT_PERSOS_JOUEUR = [];
    }
    
    window.COMBAT_INDEX_PERSO = 0;
    window.afficherPersoCombatActuel();
};

window.changerPersoCombat = function(direction) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (window.COMBAT_PERSOS_JOUEUR.length === 0) return;

    // Fermeture de la carte HD si on change de personnage
    window.COUT_COMPETENCE_SELECTIONNEE = 0;
    if (typeof window.masquerApercuCarteHD === "function") {
        window.masquerApercuCarteHD();
    }

    window.COMBAT_INDEX_PERSO += direction;
    
    if (window.COMBAT_INDEX_PERSO < 0) {
        window.COMBAT_INDEX_PERSO = window.COMBAT_PERSOS_JOUEUR.length - 1;
    } else if (window.COMBAT_INDEX_PERSO >= window.COMBAT_PERSOS_JOUEUR.length) {
        window.COMBAT_INDEX_PERSO = 0;
    }

    window.afficherPersoCombatActuel();
};

window.afficherPersoCombatActuel = function() { 
    const divNom = document.getElementById("combat-nom-perso");
    const imgPerso = document.getElementById("combat-portrait-perso");
    
    if (!divNom) return;

    if (window.COMBAT_PERSOS_JOUEUR.length === 0) {
        divNom.innerText = "Aucun héros lié";
        // Enlève l'effet doré si y'a personne pour remettre un gris classique
        divNom.style.background = "none";
        divNom.style.webkitTextFillColor = "inherit";
        divNom.style.color = "#888";
        
        document.getElementById("combat-liste-competences").innerHTML = "";
        if (imgPerso) imgPerso.style.opacity = "0"; 
        
        const jauges = document.getElementById("combat-jauges-container");
        if (jauges) jauges.style.opacity = "0";
        return;
    }

    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
    const prenom = persoActuel.prenom || "";
    const nom = persoActuel.nom || "";
    
    divNom.innerText = (prenom + " " + nom).trim();
    
    // On restaure l'effet doré s'il a été désactivé par "Aucun héros"
    divNom.style.background = "linear-gradient(135deg, #fbf5bd 0%, #c2a878 25%, #5c3a21 50%, #e8d5a5 75%, #ffffff 100%)";
    divNom.style.webkitBackgroundClip = "text";
    divNom.style.webkitTextFillColor = "transparent";

    if (imgPerso) {
        if (persoActuel.urlCloudinary && persoActuel.urlCloudinary !== "") {
            imgPerso.src = persoActuel.urlCloudinary;
            imgPerso.style.opacity = "1"; // Rétablit l'avatar à 100% d'opacité !
        } else {
            imgPerso.style.opacity = "0";
        }
    }

    window.chargerCompetencesCombat(persoActuel.idPersonnage, persoActuel.couleur);
    
    // NOUVEAU : Met à jour le bouton de fin de tour selon le héros affiché
    if (typeof window.actualiserBoutonFinTour === "function") window.actualiserBoutonFinTour();

    // NOUVEAU : Affiche la carte lockée si le perso est dans la file d'attente
    window.actualiserEtatCarteCombat();
};

// =========================================================================
//  CHARGEMENT ET AFFICHAGE DU DECK (ZÉRO LATENCE)
// =========================================================================

window.chargerCompetencesCombat = function(idPersonnage, couleur) {
    const listeDiv = document.getElementById("combat-liste-competences");
    
    try {
        const persoActuel = window.PERSOS_PARTIE.find(p => p.idPersonnage === idPersonnage);
        if (!persoActuel) return;
        
        window.COMBAT_FATIGUE_MAX = parseInt(persoActuel.Fatigue_Max) || parseInt(persoActuel.fatigueMax) || 100;
        window.COMBAT_FATIGUE_ACTUELLE = persoActuel.fatigueActuelle !== undefined ? parseInt(persoActuel.fatigueActuelle) : window.COMBAT_FATIGUE_MAX;
        
        window.COMBAT_PV_MAX = (parseInt(persoActuel.PV_Max) || 1) + (parseInt(persoActuel.Dev_Mod_PV) || 0);
        window.COMBAT_PV_ACTUELS = persoActuel.PV_Actuels !== undefined ? parseInt(persoActuel.PV_Actuels) : window.COMBAT_PV_MAX;

        document.getElementById("combat-jauges-container").style.opacity = "1";
        
        window.mettreAJourJaugeFatigue(0);
        window.mettreAJourJaugePV();

        const deck = persoActuel.deckEquipe || [];

        if (deck.length === 0) {
            listeDiv.innerHTML = "<div style='color:#a89f91; font-family: Almendra, serif; font-size:16px; margin-top: 10px; font-style: italic;'>Aucune compétence mémorisée.</div>";
            return;
        }

        const competencesDuPerso = window.CACHE_COMPETENCES_GLOBAL[idPersonnage] || {};
        let competencesToRender = [];
        
        if (!window.COMPETENCES_CACHE) window.COMPETENCES_CACHE = {};

        deck.forEach(idCarte => {
            if (competencesDuPerso[idCarte]) {
                const data = competencesDuPerso[idCarte];
                window.COMPETENCES_CACHE[idCarte] = data; 
                competencesToRender.push({ id: idCarte, data: data });
            }
        });

        competencesToRender.sort((a, b) => (b.data.Initiative || 0) - (a.data.Initiative || 0));
        window.COULEUR_PERSO_COURANT = couleur || "#4a1c1c";

        let htmlDeck = "";
        const IMAGE_CADRE_NORMAL = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png";
        const IMAGE_CADRE_EPUISE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1783286721/ban_epuis%C3%A9_otc70l.png";

        const ESPACEMENT_BANNIERES = -45;

        competencesToRender.forEach(comp => {
            const data = comp.data;
            const idCarte = comp.id;
            const titre = data.Nom || "Technique";
            const initiative = data.Initiative || 0;
            const coutFatigue = parseInt(data.Fatigue) || 0;
            const estEpuise = coutFatigue > window.COMBAT_FATIGUE_ACTUELLE;

            const urlCadre = estEpuise ? IMAGE_CADRE_EPUISE : IMAGE_CADRE_NORMAL;
            const classeEpuise = estEpuise ? "banniere-epuisee" : "";
            const couleurTexte = estEpuise ? "#888888" : "#e0d0b0";

            htmlDeck += `
            <div style="position: relative; height: 100px; margin-bottom: ${ESPACEMENT_BANNIERES}px; transition: margin 0.2s ease;">
                <div onclick="event.stopPropagation(); window.gererClicCarteCombat('${idCarte}')"
                     onmouseover="document.getElementById('combat-carte-${idCarte}').style.transform='scale(0.75) translateX(15px)'; document.getElementById('combat-carte-${idCarte}').style.zIndex='100';"
                     onmouseout="document.getElementById('combat-carte-${idCarte}').style.transform='scale(0.75) translateX(0px)'; document.getElementById('combat-carte-${idCarte}').style.zIndex='2';"
                     style="position: absolute; top: 35px; left: 0; width: 335px; height: 40px; z-index: 10; cursor: pointer;">
                </div>

                <div id="combat-carte-${idCarte}" class="banniere-carte-combat ${classeEpuise}" data-actif="false" data-card-id="${idCarte}"
                     style="position: absolute; top: 0; left: 0; width: 450px; height: 160px; pointer-events: none; transition: filter 0.2s ease, transform 0.2s ease; transform: scale(0.75); transform-origin: left top; z-index: 2;">
                     
                    <div style="position: absolute; top: 49px; bottom: 58px; left: 63px; right: 7px; z-index: 1; border-radius: 0 15px 15px 0; background-color: ${window.COULEUR_PERSO_COURANT};"></div>
                    <div id="cadre-combat-${idCarte}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: url('${urlCadre}'); background-size: contain; background-position: left center; background-repeat: no-repeat; z-index: 2; filter: drop-shadow(0px 6px 4px rgba(0,0,0,0.6)); transition: background-image 0.2s ease;"></div>
                    <div class="texte-init-banniere" style="position: absolute; top: 44%; transform: translateY(-50%); left: 6px; width: 69px; text-align: center; color: ${couleurTexte}; font-family: 'Cinzel', serif; font-size: 30px; font-weight: bold; z-index: 3; text-shadow: 2px 2px 5px black;">${initiative}</div>
                    <div class="texte-nom-banniere" style="position: absolute; top: 48%; transform: translateY(-50%); left: 76px; right: 120px; text-align: left; color: ${couleurTexte}; font-family: 'Cinzel', serif; font-size: 17px; text-transform: uppercase; font-weight: bold; z-index: 3; text-shadow: 1px 1px 3px black; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${titre}</div>
                </div>
            </div>
            `;
        });

        listeDiv.innerHTML = htmlDeck;

    } catch (e) {
        console.error("Erreur cache :", e);
    }
};

// =========================================================================
//  LOGIQUE DE LA JAUGE DE PV
// =========================================================================
window.mettreAJourJaugePV = function() {
    const max = window.COMBAT_PV_MAX || 1;
    const actuelle = window.COMBAT_PV_ACTUELS || 0;
    
    // On bloque entre 0 et 100% visuellement
    const pctActuel = Math.min(100, Math.max(0, (actuelle / max) * 100));

    const barre = document.getElementById('barre-pv-rouge');
    if (barre) barre.style.width = pctActuel + '%';

    const labelActuelle = document.getElementById('label-pv-actuel');
    if (labelActuelle) {
        labelActuelle.innerText = actuelle;
        labelActuelle.style.left = pctActuel + '%';
    }
};

// =========================================================================
//  LOGIQUE DE LA JAUGE DE FATIGUE
// =========================================================================
window.mettreAJourJaugeFatigue = function(coutFatigueBrut) {
    const max = window.COMBAT_FATIGUE_MAX || 1;
    const actuelle = window.COMBAT_FATIGUE_ACTUELLE || 0;
    
    const coutFatigue = parseInt(coutFatigueBrut) || 0; 
    const coutReel = Math.min(coutFatigue, actuelle); 
    const reste = actuelle - coutReel;

    const pctGris = (reste / max) * 100;
    const pctRouge = (coutReel / max) * 100;
    const pctActuel = (actuelle / max) * 100;

    // Mise à jour visuelle des barres avec leurs dégradés
    document.getElementById('barre-fatigue-grise').style.width = pctGris + '%';
    document.getElementById('barre-fatigue-rouge').style.width = pctRouge + '%';

    // Mise à jour du texte Doré (Fatigue actuelle)
    const labelActuelle = document.getElementById('label-fatigue-actuelle');
    if (labelActuelle) {
        labelActuelle.innerText = actuelle;
        labelActuelle.style.left = pctActuel + '%';
    }

    // Mise à jour du texte Rouge (Fatigue restante si on utilise le sort)
    const labelRestante = document.getElementById('label-fatigue-restante');
    if (labelRestante) {
        if (coutFatigue > 0) {
            labelRestante.innerText = reste;
            labelRestante.style.left = pctGris + '%'; 
            labelRestante.style.opacity = '1';
            document.getElementById('barre-fatigue-rouge').style.opacity = '1';
        } else {
            labelRestante.style.opacity = '0';
            document.getElementById('barre-fatigue-rouge').style.opacity = '0';
        }
    }
};

// =========================================================================
//  INTERACTIONS AVEC LES CARTES (IMAGE ET JAUGE)
// =========================================================================
window.gererClicCarteCombat = function(idCarte) {
    const IMAGE_CADRE_NORMAL = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png";
    const IMAGE_CADRE_SELECTIONNE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1783286721/ban_cible_pdpnad.png";
    const IMAGE_CADRE_EPUISE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1783286721/ban_epuis%C3%A9_otc70l.png";

    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
    const fatigueMax = persoActuel ? (parseInt(persoActuel.Fatigue_Max) || 100) : 100;
    const fatiguePerso = (persoActuel && persoActuel.fatigueActuelle !== undefined) ? parseInt(persoActuel.fatigueActuelle) : fatigueMax;

    const dataCarte = window.COMPETENCES_CACHE[idCarte];
    const cout = parseInt(dataCarte?.Fatigue) || 0;

    if (window.CARTE_EN_APERCU !== idCarte) {
        // A. On vérifie si la carte + le trajet tracé ne dépassent pas l'énergie max
        if (cout + (window.MOUVEMENT_COUT_TOTAL || 0) > (window.COMBAT_FATIGUE_ACTUELLE || 0)) {
            alert("Vous n'avez pas assez d'énergie pour lancer cette compétence avec ce déplacement.");
            return; // On bloque le clic sur la carte !
        }

        // B. Si c'est bon, on prévient le moteur de déplacement du prix de la carte !
        window.COUT_COMPETENCE_SELECTIONNEE = cout;
    } else {
        window.COUT_COMPETENCE_SELECTIONNEE = 0;
    }

    // Réinitialise tout en gardant l'état épuisé si nécessaire
    document.querySelectorAll('.banniere-carte-combat').forEach(el => {
        el.dataset.actif = "false";
        const cId = el.id.replace("combat-carte-", "");
        const cData = window.COMPETENCES_CACHE[cId];
        const estEp = cData && (parseInt(cData.Fatigue) || 0) > fatiguePerso;
        const cadre = document.getElementById(`cadre-combat-${cId}`);
        if (cadre) cadre.style.backgroundImage = `url('${estEp ? IMAGE_CADRE_EPUISE : IMAGE_CADRE_NORMAL}')`;
    });

    if (window.CARTE_EN_APERCU !== idCarte) {
        window.CARTE_EN_APERCU = idCarte;
        
        const estEpuise = cout > fatiguePerso;

        const carteDiv = document.getElementById(`combat-carte-${idCarte}`);
        const cadreDiv = document.getElementById(`cadre-combat-${idCarte}`);
        if (carteDiv && cadreDiv) {
            carteDiv.dataset.actif = "true";
            // Si la carte est épuisée, on affiche pas la cible rouge, on garde la bannière usée
            cadreDiv.style.backgroundImage = `url('${estEpuise ? IMAGE_CADRE_EPUISE : IMAGE_CADRE_SELECTIONNE}')`;
        }
        
        window.mettreAJourJaugeFatigue(cout);
        
        if (typeof window.afficherApercuCarteHD === "function") {
            window.afficherApercuCarteHD(idCarte);
        }
    } else {
        window.mettreAJourJaugeFatigue(0);
        if (typeof window.masquerApercuCarteHD === "function") {
            window.masquerApercuCarteHD();
        }
    }
    
    // Force la réactualisation visuelle des couleurs grises
    if (typeof window.actualiserBannieresEpuisees === "function") window.actualiserBannieresEpuisees();
};

// Clic global (Fermeture dans le vide)
document.addEventListener("click", function(event) {
    const btnFermer = document.getElementById('btn-fermer-combat');
    if (!btnFermer || btnFermer.style.display === 'none') return;

    const clicSurBanniere = event.target.closest('.banniere-carte-combat');
    const clicSurCarteHD = event.target.closest('#apercu-carte-hd-competence');
    const clicSurFleche = event.target.closest('.btn-combat-switch'); 
    
    if (!clicSurBanniere && !clicSurCarteHD && !clicSurFleche && window.CARTE_EN_APERCU) {
        window.COUT_COMPETENCE_SELECTIONNEE = 0;
        window.mettreAJourJaugeFatigue(0); 
        
        if (typeof window.masquerApercuCarteHD === "function") {
            window.masquerApercuCarteHD();
        }
        
        document.querySelectorAll('.banniere-carte-combat').forEach(el => {
            el.dataset.actif = "false";
        });
        if (typeof window.actualiserBannieresEpuisees === "function") window.actualiserBannieresEpuisees();
    }
});

// =========================================================================
//  GESTION DE LA CAMÉRA (TABLE VIRTUELLE - VTT)
// =========================================================================

window.PLATEAU_VTT = null;
window.VTT_SCALE = 1;
window.VTT_POS_X = 0;
window.VTT_POS_Y = 0;
let isDraggingVTT = false;
let startDragX = 0;
let startDragY = 0;

window.initialiserPlateau = function() {
    if (!window.PLATEAU_VTT) {
        window.PLATEAU_VTT = new Plateau('plateau-canvas');
        
        // 🔻 AJOUT ICI : Coupe définitivement le glissement natif de l'écran sur cette zone
        const conteneur = document.getElementById("conteneur-plateau-vtt");
        if (conteneur) {
            conteneur.style.touchAction = "none";
        }

        window.PLATEAU_VTT.renderMap();
        window.centrerPlateau();
        window.activerPanZoom();
    }
};

window.VTT_SCALE_MIN = 0.1;
window.VTT_SCALE_MAX = 5;

window.centrerPlateau = function() {
    const conteneur = document.getElementById("transform-plateau");
    if (!conteneur) return;
    
    // On s'adapte à la taille physique du conteneur (qui va changer selon l'image)
    const w = conteneur.offsetWidth || 1800;
    const h = conteneur.offsetHeight || 1800;
    
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    
    window.VTT_SCALE = Math.min(winW / w, winH / h) * 0.9; 
    
    // Les bornes de zoom sont relatives au cadrage d'origine (une petite map ne se bloquait plus au bon moment)
    window.VTT_SCALE_MIN = window.VTT_SCALE * 0.5;
    window.VTT_SCALE_MAX = window.VTT_SCALE * 8;
    
    window.VTT_POS_X = (winW - (w * window.VTT_SCALE)) / 2;
    window.VTT_POS_Y = (winH - (h * window.VTT_SCALE)) / 2;
    
    window.appliquerTransformPlateau();
};

// Zoom autour d'un point d'ancrage. Le facteur est recalculé APRÈS bridage :
// sinon, une fois la limite atteinte, la carte continuait de glisser sans zoomer.
window.appliquerZoomVTT = function(facteurDemande, ancreX, ancreY) {
    const echelleVoulue = window.VTT_SCALE * facteurDemande;
    const nouvelleEchelle = Math.min(Math.max(echelleVoulue, window.VTT_SCALE_MIN), window.VTT_SCALE_MAX);
    const facteurReel = nouvelleEchelle / window.VTT_SCALE;

    window.VTT_POS_X = ancreX - (ancreX - window.VTT_POS_X) * facteurReel;
    window.VTT_POS_Y = ancreY - (ancreY - window.VTT_POS_Y) * facteurReel;
    window.VTT_SCALE = nouvelleEchelle;

    window.appliquerTransformPlateau();
};

let frameTransformVTT = null;

window.appliquerTransformPlateau = function() {
    const conteneur = document.getElementById("transform-plateau");
    if (conteneur) {
        conteneur.style.transform = `translate(${window.VTT_POS_X}px, ${window.VTT_POS_Y}px) scale(${window.VTT_SCALE})`;
    }

    // Les pions ne subissent pas ce scale : on les repositionne à la main, une fois par frame
    if (frameTransformVTT) return;
    frameTransformVTT = requestAnimationFrame(() => {
        frameTransformVTT = null;
        window.repositionnerTokensVTT();
    });
};

window.VTT_MODE_EFFACEMENT = false;
window.VTT_MODE_MURS = false;
window.VTT_MODE_DIFFICILE = false;
let isPaintingVTT = false;
let currentPaintAction = null; // 'delete', 'restore', 'block', 'unblock', 'difficult', 'undifficult'

window.activerPanZoom = function() {
    const conteneur = document.getElementById("conteneur-plateau-vtt");
    if (!conteneur) return;

    function getHexFromMouse(clientX, clientY) {
        if (!window.PLATEAU_VTT) return null;
        const canvasX = (clientX - window.VTT_POS_X) / window.VTT_SCALE;
        const canvasY = (clientY - window.VTT_POS_Y) / window.VTT_SCALE;
        return window.PLATEAU_VTT.pixelToHex(canvasX, canvasY);
    }

    // --- ZOOM SOURIS (Molette PC) ---
    conteneur.addEventListener("wheel", (e) => {
        e.preventDefault();
        const zoomIntensity = 0.08;
        const wheel = e.deltaY < 0 ? 1 : -1;
        const zoomFactor = Math.exp(wheel * zoomIntensity);
        
        window.appliquerZoomVTT(zoomFactor, e.clientX, e.clientY);
    }, { passive: false });

    // --- SOURIS (Pan & Peinture PC) ---
    conteneur.addEventListener("mousedown", (e) => {
        if (conteneur.contains(e.target)) {
            if (window.VTT_MODE_EFFACEMENT || window.VTT_MODE_MURS || window.VTT_MODE_DIFFICILE) {
                isPaintingVTT = true;
                const hex = getHexFromMouse(e.clientX, e.clientY);
                if (hex) {
                    const state = window.PLATEAU_VTT.getCaseState(hex.q, hex.r);
                    if (window.VTT_MODE_EFFACEMENT) {
                        currentPaintAction = state.isDeleted ? 'restore' : 'delete';
                        window.PLATEAU_VTT.setCaseState(hex.q, hex.r, { isDeleted: currentPaintAction === 'delete' });
                    } else if (window.VTT_MODE_MURS) {
                        currentPaintAction = state.isBlocked ? 'unblock' : 'block';
                        window.PLATEAU_VTT.setCaseState(hex.q, hex.r, { isBlocked: currentPaintAction === 'block' });
                    } else if (window.VTT_MODE_DIFFICILE) {
                        currentPaintAction = state.isDifficult ? 'undifficult' : 'difficult';
                        window.PLATEAU_VTT.setCaseState(hex.q, hex.r, { isDifficult: currentPaintAction === 'difficult' });
                    }
                    window.PLATEAU_VTT.renderMap();
                }
            } else {
                isDraggingVTT = true;
                startDragX = e.clientX - window.VTT_POS_X;
                startDragY = e.clientY - window.VTT_POS_Y;
                conteneur.style.cursor = "grabbing";
            }
        }
    });

    window.addEventListener("mousemove", (e) => {
        if (isPaintingVTT && (window.VTT_MODE_EFFACEMENT || window.VTT_MODE_MURS || window.VTT_MODE_DIFFICILE)) {
            const hex = getHexFromMouse(e.clientX, e.clientY);
            if (hex) {
                if (window.VTT_MODE_EFFACEMENT) {
                    window.PLATEAU_VTT.setCaseState(hex.q, hex.r, { isDeleted: currentPaintAction === 'delete' });
                } else if (window.VTT_MODE_MURS) {
                    window.PLATEAU_VTT.setCaseState(hex.q, hex.r, { isBlocked: currentPaintAction === 'block' });
                } else if (window.VTT_MODE_DIFFICILE) {
                    window.PLATEAU_VTT.setCaseState(hex.q, hex.r, { isDifficult: currentPaintAction === 'difficult' });
                }
                window.PLATEAU_VTT.renderMap(); 
            }
            return;
        }

        if (!isDraggingVTT) return;
        window.VTT_POS_X = e.clientX - startDragX;
        window.VTT_POS_Y = e.clientY - startDragY;
        window.appliquerTransformPlateau();
    });

    window.addEventListener("mouseup", () => {
        isDraggingVTT = false;
        isPaintingVTT = false;
        if (conteneur) conteneur.style.cursor = "grab";
    });

    // --- TACTILE AVANCÉ IPAD (Pinch & Pan & Paint) ---
    let lastPinchDist = 0;
    let lastPinchCenter = { x: 0, y: 0 };

    conteneur.addEventListener("touchstart", (e) => {
        if (conteneur.contains(e.target)) {
            if (e.touches.length === 1) {
                if (window.VTT_MODE_EFFACEMENT || window.VTT_MODE_MURS || window.VTT_MODE_DIFFICILE) {
                    isPaintingVTT = true;
                    
                    // NOUVEAU : Délai de 100ms pour laisser le temps au 2ème doigt de se poser (Pinch to zoom)
                    window.vttPaintTimeout = setTimeout(() => {
                        if (isPaintingVTT && window.PLATEAU_VTT) {
                            const hex = getHexFromMouse(e.touches[0].clientX, e.touches[0].clientY);
                            if (hex) {
                                const state = window.PLATEAU_VTT.getCaseState(hex.q, hex.r);
                                if (window.VTT_MODE_EFFACEMENT) {
                                    currentPaintAction = state.isDeleted ? 'restore' : 'delete';
                                    window.PLATEAU_VTT.setCaseState(hex.q, hex.r, { isDeleted: currentPaintAction === 'delete' });
                                } else if (window.VTT_MODE_MURS) {
                                    currentPaintAction = state.isBlocked ? 'unblock' : 'block';
                                    window.PLATEAU_VTT.setCaseState(hex.q, hex.r, { isBlocked: currentPaintAction === 'block' });
                                } else if (window.VTT_MODE_DIFFICILE) {
                                    currentPaintAction = state.isDifficult ? 'undifficult' : 'difficult';
                                    window.PLATEAU_VTT.setCaseState(hex.q, hex.r, { isDifficult: currentPaintAction === 'difficult' });
                                }
                                window.PLATEAU_VTT.renderMap();
                            }
                        }
                    }, 100);

                } else {
                    isDraggingVTT = true;
                    startDragX = e.touches[0].clientX - window.VTT_POS_X;
                    startDragY = e.touches[0].clientY - window.VTT_POS_Y;
                }
            } else if (e.touches.length === 2) {
                // C'est un zoom ! On annule immédiatement le pinceau du 1er doigt
                if (e.cancelable) e.preventDefault();
                clearTimeout(window.vttPaintTimeout);
                isDraggingVTT = false;
                isPaintingVTT = false;
                lastPinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
                lastPinchCenter = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
            }
        }
    }, { passive: false });

    conteneur.addEventListener("touchmove", (e) => {
        if (isDraggingVTT || isPaintingVTT || e.touches.length === 2) {
            if (e.cancelable) e.preventDefault(); 
        }

        if (e.touches.length === 1) {
            if (isPaintingVTT && (window.VTT_MODE_EFFACEMENT || window.VTT_MODE_MURS || window.VTT_MODE_DIFFICILE)) {
                const hex = getHexFromMouse(e.touches[0].clientX, e.touches[0].clientY);
                if (hex) {
                    if (window.VTT_MODE_EFFACEMENT) {
                        window.PLATEAU_VTT.setCaseState(hex.q, hex.r, { isDeleted: currentPaintAction === 'delete' });
                    } else if (window.VTT_MODE_MURS) {
                        window.PLATEAU_VTT.setCaseState(hex.q, hex.r, { isBlocked: currentPaintAction === 'block' });
                    } else if (window.VTT_MODE_DIFFICILE) {
                        window.PLATEAU_VTT.setCaseState(hex.q, hex.r, { isDifficult: currentPaintAction === 'difficult' });
                    }
                    window.PLATEAU_VTT.renderMap();
                }
                return;
            }

            if (isDraggingVTT) {
                window.VTT_POS_X = e.touches[0].clientX - startDragX;
                window.VTT_POS_Y = e.touches[0].clientY - startDragY;
                window.appliquerTransformPlateau();
            }
        } else if (e.touches.length === 2) {
            const currentDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
            const currentCenter = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };

            if (lastPinchDist > 0) {
                // 1. On suit le déplacement des deux doigts
                window.VTT_POS_X += currentCenter.x - lastPinchCenter.x;
                window.VTT_POS_Y += currentCenter.y - lastPinchCenter.y;
                // 2. Puis on zoome autour de leur centre (bridage géré dans appliquerZoomVTT)
                window.appliquerZoomVTT(currentDist / lastPinchDist, currentCenter.x, currentCenter.y);
            }

            lastPinchDist = currentDist;
            lastPinchCenter = currentCenter;
        }
    }, { passive: false });

    conteneur.addEventListener("touchend", (e) => {
        clearTimeout(window.vttPaintTimeout);
        isPaintingVTT = false;
        
        if (e.touches.length === 1) {
            lastPinchDist = 0;
            if (!window.VTT_MODE_EFFACEMENT && !window.VTT_MODE_MURS && !window.VTT_MODE_DIFFICILE) {
                isDraggingVTT = true;
                startDragX = e.touches[0].clientX - window.VTT_POS_X;
                startDragY = e.touches[0].clientY - window.VTT_POS_Y;
            }
        } else if (e.touches.length === 0) {
            isDraggingVTT = false;
            lastPinchDist = 0;
        }
    });

    // iOS coupe parfois le geste (appel, geste système…) : sans ça l'état restait bloqué et la carte partait en glissade
    conteneur.addEventListener("touchcancel", () => {
        clearTimeout(window.vttPaintTimeout);
        isPaintingVTT = false;
        isDraggingVTT = false;
        lastPinchDist = 0;
    });
};

// =========================================================================
//  GESTION DU MENU DÉVELOPPEUR (COMBAT)
// =========================================================================

window.toggleMenuCombat = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    const menuDev = document.getElementById("menu-dev-combat");
    if (!menuDev) return;
    
    if (menuDev.classList.contains("ouvert")) {
        window.fermerMenusCoulissantsCombat();
    } else {
        // Fermeture automatique du panneau latéral gauche si ouvert
        if (window.PANNEAU_GAUCHE_OUVERT && typeof window.togglePanneauGauche === "function") {
            window.togglePanneauGauche();
        }
        
        menuDev.classList.add("ouvert");
        menuDev.style.top = "0"; // Glisse depuis le haut
    }
};

window.fermerMenusCoulissantsCombat = function(e) {
    const evt = e || (typeof window.event !== 'undefined' ? window.event : null);
    if (evt && evt.target && evt.target.tagName === 'BUTTON' && typeof window.jouerSonClic === "function") {
        window.jouerSonClic();
    }
    const menuDev = document.getElementById("menu-dev-combat");
    if (menuDev) {
        menuDev.classList.remove("ouvert");
        menuDev.style.top = "-150px"; // Repart se cacher en haut
    }
};

// =========================================================================
//  GESTION DEV : MAPS ET ÉCHELLES (SYNCHRONISÉES EN BDD)
// =========================================================================

window.UNSUBSCRIBE_VTT = null;

function urlsVTTIdentiques(currentSrc, targetUrl) {
    if (!targetUrl) return !currentSrc;
    try {
        return new URL(currentSrc, window.location.href).href === new URL(targetUrl, window.location.href).href;
    } catch {
        return currentSrc === targetUrl;
    }
}

// L'écouteur qui tourne en arrière-plan chez tous les joueurs
window.ecouterTerrainVTT = function() {
    if (!window.ID_PARTIE_COURANTE) return;
    if (window.UNSUBSCRIBE_VTT) window.UNSUBSCRIBE_VTT(); 
    
    if (typeof window.initialiserPlateau === "function") {
        window.initialiserPlateau();
    }

    window.UNSUBSCRIBE_VTT = onSnapshot(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            
            // NOUVEAU : On applique les trous d'abord...
            if (data.Tuiles_Supprimees !== undefined) {
                window.appliquerTuilesSupprimees(data.Tuiles_Supprimees);
            }

            // NOUVEAU : ...puis les murs
            if (data.Tuiles_Murs !== undefined) {
                window.appliquerMurs(data.Tuiles_Murs);
            }

            // NOUVEAU : Application du terrain difficile
            if (data.Tuiles_Difficiles !== undefined) {
                window.appliquerTerrainDifficile(data.Tuiles_Difficiles);
            }

            // ...puis on gère la grille en elle-même !
            if (data.URL_Map !== undefined && data.Taille_Hex !== undefined) {
                const opacite = data.Opacite_Grille !== undefined ? data.Opacite_Grille : 0.8;
                window.appliquerTerrain(data.URL_Map, data.Taille_Hex, opacite);
            }

            // 🔻 NOUVEAU : Lecture des Pions (Tokens) depuis Firebase 🔻
            if (data.Tokens !== undefined) {
                window.TOKENS_VTT_DATA = data.Tokens;
                if (typeof window.appliquerTokensVTT === "function") {
                    window.appliquerTokensVTT(data.Tokens);
                }
            } else {
                window.TOKENS_VTT_DATA = {};
                if (typeof window.appliquerTokensVTT === "function") window.appliquerTokensVTT({});
            }
        }
    });
};

// La fonction qui peint l'image, l'échelle ET L'OPACITÉ
window.appliquerTerrain = function(url, scale, opacity) {
    if (!window.PLATEAU_VTT) return;
    const imgEl = document.getElementById("image-map-vtt");
    const conteneurTransform = document.getElementById("transform-plateau");
    if (!imgEl || !conteneurTransform) return;
    
    // Anti-scintillement global (URL, Taille, Opacité)
    if (urlsVTTIdentiques(imgEl.src, url) && window.PLATEAU_VTT.hexSize === scale && Math.abs(window.PLATEAU_VTT.gridOpacity - opacity) < 0.001) return;

    window.PLATEAU_VTT.hexSize = scale;
    window.PLATEAU_VTT.hexWidth = 2 * scale;
    window.PLATEAU_VTT.hexHeight = Math.sqrt(3) * scale;
    
    // Application de l'opacité
    window.PLATEAU_VTT.gridOpacity = opacity;
    
    const labelTaille = document.getElementById("label-taille-hexa");
    if (labelTaille) labelTaille.innerText = scale;
    
    const labelOpa = document.getElementById("label-opacite-hexa");
    if (labelOpa) labelOpa.innerText = opacity.toFixed(1);

    const appliquerMapChargee = function() {
        imgEl.style.display = "block";
        const w = imgEl.naturalWidth;
        const h = imgEl.naturalHeight;
        conteneurTransform.style.width = w + "px";
        conteneurTransform.style.height = h + "px";
        window.PLATEAU_VTT.resize(w, h);
        window.PLATEAU_VTT.renderMap();
        window.centrerPlateau();
        
        // 🔻 CORRECTION : On place les pions UNE FOIS que l'image a donné ses dimensions !
        if (typeof window.appliquerTokensVTT === "function") {
            window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
        }
    };

    if (!urlsVTTIdentiques(imgEl.src, url) && url !== "") {
        imgEl.onload = appliquerMapChargee;
        imgEl.src = url;
        if (imgEl.complete && imgEl.naturalWidth > 0) appliquerMapChargee();
    } else {
        // Changement d'échelle/opacité seul, ou repeinture sans nouvelle image
        window.PLATEAU_VTT.renderMap();
        
        // 🔻 CORRECTION : On replace les pions si le MJ change la taille de la grille en direct !
        if (typeof window.appliquerTokensVTT === "function") {
            window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
        }
    }
};

window.chargerMapTest = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE) return;
    
    const imgUrl = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1786366789/port_ntpq8p.png";
    const scale = window.PLATEAU_VTT ? window.PLATEAU_VTT.hexSize : 60;
    const opacity = window.PLATEAU_VTT ? window.PLATEAU_VTT.gridOpacity : 0.8;
    
    console.log("[VTT] Envoi de la map en base de données...");

    try {
        await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
            URL_Map: imgUrl,
            Taille_Hex: scale,
            Opacite_Grille: opacity
        }, { merge: true });
    } catch(e) {
        console.error("Erreur synchro map :", e);
    }
};

window.sauvegarderEchelleVTT = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT) return;
    
    const imgEl = document.getElementById("image-map-vtt");
    const url = imgEl ? imgEl.src || "" : "";
    const btn = document.getElementById("btn-ok-echelle");
    if (btn) btn.innerText = "⏳";

    try {
        await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
            URL_Map: url,
            Taille_Hex: window.PLATEAU_VTT.hexSize
        }, { merge: true });
        
        if (btn) {
            btn.innerText = "✔️";
            setTimeout(() => btn.innerText = "OK", 1500);
        }
    } catch(e) {
        console.error("Erreur synchro échelle :", e);
        if (btn) btn.innerText = "❌";
    }
};

// =========================================================================
//  GESTION DEV : PIONS (TOKENS) SUR LA TABLE VIRTUELLE
// =========================================================================
window.TOKENS_VTT_DATA = window.TOKENS_VTT_DATA || {};
window.TOKEN_SELECTIONNE = window.TOKEN_SELECTIONNE ?? null;
window.VTT_MODE_DEPLACEMENT = false;

let vttClicStartX = 0;
let vttClicStartY = 0;

document.addEventListener("mousedown", e => { vttClicStartX = e.clientX; vttClicStartY = e.clientY; });
document.addEventListener("touchstart", e => { if (e.touches.length > 0) { vttClicStartX = e.touches[0].clientX; vttClicStartY = e.touches[0].clientY; } });

window.toggleModeDeplacementToken = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    window.VTT_MODE_DEPLACEMENT = !window.VTT_MODE_DEPLACEMENT;
    
    const btn = document.getElementById("btn-move-token");
    if (btn) {
        if (window.VTT_MODE_DEPLACEMENT) {
            btn.classList.add("actif");
            btn.style.filter = "drop-shadow(0 0 15px rgba(255, 215, 0, 0.9))";
        } else {
            btn.classList.remove("actif");
            btn.style.filter = "drop-shadow(0 0 8px rgba(255,255,255,0.3))";
            window.TOKEN_SELECTIONNE = null;
            const label = document.getElementById("label-taille-token");
            if (label) label.innerText = "--";
            window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
            window.restaurerPanneauGauche(); // 🔻 NOUVEAU
        }
    }
};

// Clic global (Sélection, Déplacement ou Désélection)
document.addEventListener("click", async function(event) {
    if (Math.abs(event.clientX - vttClicStartX) > 10 || Math.abs(event.clientY - vttClicStartY) > 10) return;

    // 🔻 NOUVEAU : On ignore le clic s'il est sur la piste d'initiative
    if (event.target.closest(".token-vtt") || event.target.closest("#menu-dev-combat") || event.target.closest("#piste-initiative")) return;

    if (window.TOKEN_SELECTIONNE) {
        
        // 🔻 NOUVEAU : VERIFIER SI C'EST MON TOUR POUR TRACER UN CHEMIN 🔻
        const partie = window.PARTIE_DATA || {};
        const queue = partie.File_Attente_Combat || [];
        const phase = partie.Phase_Combat || "Preparation";
        const monId = localStorage.getItem("ID_JOUEUR_COURANT");
        const persoSelectionne = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === window.TOKEN_SELECTIONNE);
        
        const estMonTour = (
            phase === "Resolution" && 
            queue.length > 0 && 
            queue[0].idPersonnage === window.TOKEN_SELECTIONNE && 
            persoSelectionne && persoSelectionne.idJoueur === monId &&
            !queue[0].aFaitSonMouvement
        );

        if (estMonTour && !window.VTT_MODE_DEPLACEMENT) {
            const conteneur = document.getElementById("conteneur-plateau-vtt");
            if (conteneur && conteneur.contains(event.target) && window.PLATEAU_VTT) {
                const canvasX = (event.clientX - window.VTT_POS_X) / window.VTT_SCALE;
                const canvasY = (event.clientY - window.VTT_POS_Y) / window.VTT_SCALE;
                const hex = window.PLATEAU_VTT.pixelToHex(canvasX, canvasY);
                
                // Initialise le point de départ du chemin
                if (window.CHEMIN_MOUVEMENT.length === 0) {
                    window.CHEMIN_START_NODE = {
                        q: window.TOKENS_VTT_DATA[window.TOKEN_SELECTIONNE].q,
                        r: window.TOKENS_VTT_DATA[window.TOKEN_SELECTIONNE].r
                    };
                }
                
                window.ajouterEtapeMouvement(hex.q, hex.r);
                return;
            }
        }

        if (window.VTT_MODE_DEPLACEMENT) {
            const conteneur = document.getElementById("conteneur-plateau-vtt");
            if (conteneur && conteneur.contains(event.target) && window.PLATEAU_VTT) {
                
                const canvasX = (event.clientX - window.VTT_POS_X) / window.VTT_SCALE;
                const canvasY = (event.clientY - window.VTT_POS_Y) / window.VTT_SCALE;
                const hex = window.PLATEAU_VTT.pixelToHex(canvasX, canvasY);
                
                const state = window.PLATEAU_VTT.getCaseState(hex.q, hex.r);
                let isOccupied = false;
                for (let id in window.TOKENS_VTT_DATA) {
                    if (window.TOKENS_VTT_DATA[id].q === hex.q && window.TOKENS_VTT_DATA[id].r === hex.r) {
                        isOccupied = true;
                        break;
                    }
                }

                if (!state.isDeleted && !state.isBlocked && !isOccupied) {
                    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
                    
                    window.TOKENS_VTT_DATA[window.TOKEN_SELECTIONNE].q = hex.q;
                    window.TOKENS_VTT_DATA[window.TOKEN_SELECTIONNE].r = hex.r;
                    
                    window.TOKEN_SELECTIONNE = null;
                    const label = document.getElementById("label-taille-token");
                    if (label) label.innerText = "--";
                    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
                    window.restaurerPanneauGauche(); // 🔻 NOUVEAU

                    try {
                        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
                        await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
                            Tokens: window.TOKENS_VTT_DATA
                        }, { merge: true });
                    } catch (e) {}
                    
                    return; 
                }
            }
        }

        window.TOKEN_SELECTIONNE = null;
        const label = document.getElementById("label-taille-token");
        if (label) label.innerText = "--";
        window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
        window.restaurerPanneauGauche(); // 🔻 NOUVEAU
    }
});

window.changerTailleToken = function(delta) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    if (!window.TOKEN_SELECTIONNE) {
        alert("Sélectionnez d'abord un pion sur la carte en cliquant dessus.");
        return;
    }
    
    let tokenData = window.TOKENS_VTT_DATA[window.TOKEN_SELECTIONNE];
    if (!tokenData) return;
    
    let taille = tokenData.taille || 80;
    taille += delta;
    if (taille < 20) taille = 20; 
    if (taille > 400) taille = 400; 
    
    tokenData.taille = taille;
    const label = document.getElementById("label-taille-token");
    if (label) label.innerText = taille;
    
    // Redessine localement et instantanément
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
};

window.sauvegarderTailleToken = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE || !window.TOKEN_SELECTIONNE) return;
    
    const btn = document.getElementById("btn-ok-taille-token");
    if (btn) btn.innerText = "⏳";

    try {
        const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
        await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
            Tokens: window.TOKENS_VTT_DATA
        }, { merge: true });
        
        if (btn) {
            btn.innerText = "✔️";
            setTimeout(() => btn.innerText = "OK", 1500);
        }
    } catch(e) {
        console.error("Erreur synchro taille token :", e);
        if (btn) btn.innerText = "❌";
    }
};

// =========================================================================
//  GESTION DU FOCUS ET DE LA CAMÉRA (PANNEAU ET CARTE)
// =========================================================================

window.COMBAT_PERSOS_JOUEUR_BACKUP = null;

window.afficherDansPanneauGauche = function(idPersonnage) {
    const indexLocal = window.COMBAT_PERSOS_JOUEUR.findIndex(p => p.idPersonnage === idPersonnage);
    
    if (indexLocal !== -1) {
        // C'est un perso du joueur, on se positionne dessus normalement
        if (window.COMBAT_PERSOS_JOUEUR_BACKUP) {
            window.COMBAT_PERSOS_JOUEUR = [...window.COMBAT_PERSOS_JOUEUR_BACKUP];
            window.COMBAT_PERSOS_JOUEUR_BACKUP = null;
        }
        window.COMBAT_INDEX_PERSO = indexLocal;
        window.afficherPersoCombatActuel();
    } else {
        // C'est un PNJ ou un autre joueur, on l'injecte temporairement
        const persoGlobal = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPersonnage);
        if (persoGlobal) {
            if (!window.COMBAT_PERSOS_JOUEUR_BACKUP) {
                window.COMBAT_PERSOS_JOUEUR_BACKUP = [...window.COMBAT_PERSOS_JOUEUR];
            }
            window.COMBAT_PERSOS_JOUEUR = [persoGlobal];
            window.COMBAT_INDEX_PERSO = 0;
            window.afficherPersoCombatActuel();
        }
    }
};

window.restaurerPanneauGauche = function() {
    if (window.COMBAT_PERSOS_JOUEUR_BACKUP) {
        window.COMBAT_PERSOS_JOUEUR = [...window.COMBAT_PERSOS_JOUEUR_BACKUP];
        window.COMBAT_PERSOS_JOUEUR_BACKUP = null;
        window.COMBAT_INDEX_PERSO = 0;
        window.afficherPersoCombatActuel();
    }
};

window.centrerMapSurToken = function(idPersonnage) {
    if (!window.PLATEAU_VTT || !window.TOKENS_VTT_DATA || !window.TOKENS_VTT_DATA[idPersonnage]) return;
    
    const data = window.TOKENS_VTT_DATA[idPersonnage];
    const px = window.PLATEAU_VTT.hexToPixel(data.q, data.r);
    
    const conteneur = document.getElementById("conteneur-plateau-vtt");
    if (!conteneur) return;
    
    const winW = conteneur.offsetWidth || window.innerWidth;
    const winH = conteneur.offsetHeight || window.innerHeight;
    
    // Ajout d'une transition CSS temporaire pour un mouvement de caméra fluide
    const conteneurTransform = document.getElementById("transform-plateau");
    if (conteneurTransform) {
        conteneurTransform.style.transition = "transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)";
        setTimeout(() => { if (conteneurTransform) conteneurTransform.style.transition = "none"; }, 400);
    }

    // Les pions vivent hors du calque zoomé : ils doivent glisser au même rythme que la caméra
    if (!window.ANIMATION_VTT_EN_COURS) {
        const calqueTokens = document.getElementById("conteneur-tokens-vtt");
        if (calqueTokens) {
            calqueTokens.querySelectorAll(".token-vtt").forEach(div => {
                div.style.transition = "left 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), top 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)";
                setTimeout(() => { div.style.transition = "none"; }, 400);
            });
        }
    }

    // Calcul pour centrer le point exact au milieu de l'écran
    window.VTT_POS_X = (winW / 2) - (px.x * window.VTT_SCALE);
    window.VTT_POS_Y = (winH / 2) - (px.y * window.VTT_SCALE);
    
    window.appliquerTransformPlateau();
};

window.selectionnerEtCentrerPerso = function(idPersonnage) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    window.TOKEN_SELECTIONNE = idPersonnage;
    
    if (window.TOKENS_VTT_DATA && window.TOKENS_VTT_DATA[idPersonnage]) {
        const dataToken = window.TOKENS_VTT_DATA[idPersonnage];
        const label = document.getElementById("label-taille-token");
        if (label) label.innerText = dataToken.taille || 80;
        
        window.centrerMapSurToken(idPersonnage);
    }
    
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    window.afficherDansPanneauGauche(idPersonnage);
};

// =========================================================================
//  SUPPRESSION D'UN PION (TOKEN)
// =========================================================================
window.supprimerTokenVTT = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    // 1. Sécurité : vérifier qu'un pion est bien "ciblé" (halo bleu)
    if (!window.TOKEN_SELECTIONNE) {
        alert("Sélectionnez d'abord un pion sur la carte en cliquant dessus.");
        return;
    }
    
    if (!confirm("Voulez-vous vraiment retirer ce pion de la carte tactique ?")) return;

    const idSupprime = window.TOKEN_SELECTIONNE;

    // 2. Suppression dans la mémoire locale
    delete window.TOKENS_VTT_DATA[idSupprime];
    window.TOKEN_SELECTIONNE = null;
    window.restaurerPanneauGauche();
    
    // 3. Mise à jour visuelle de l'interface (Remet l'affichage de taille à zéro)
    const label = document.getElementById("label-taille-token");
    if (label) label.innerText = "--";
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);

    // 4. Pousse la mise à jour vers Firebase (deleteField pour vraiment retirer la clé)
    if (!window.ID_PARTIE_COURANTE) return;
    try {
        const { doc, updateDoc, deleteField } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
        
        await updateDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
            ["Tokens." + idSupprime]: deleteField()
        });
        
    } catch (e) {
        console.error("Erreur lors de la suppression du token :", e);
    }
};

window.genererTokensCombat = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT || !window.PERSOS_PARTIE) return;

    let tokensData = { ...window.TOKENS_VTT_DATA };
    let updated = false;

    // Algorithme en spirale : Cherche la première case vide autour du centre !
    function trouverHexLibre() {
        let radius = 0;
        while (radius < 20) {
            if (radius === 0) {
                if (estHexLibre(0, 0)) return { q: 0, r: 0 };
            } else {
                let q = -radius, r = radius;
                const directions = [ {dq: 1, dr: 0}, {dq: 0, dr: -1}, {dq: -1, dr: -1}, {dq: -1, dr: 0}, {dq: 0, dr: 1}, {dq: 1, dr: 1} ];
                for (let i = 0; i < 6; i++) {
                    for (let j = 0; j < radius; j++) {
                        if (estHexLibre(q, r)) return { q, r };
                        q += directions[i].dq; r += directions[i].dr;
                    }
                }
            }
            radius++;
        }
        return { q: 0, r: 0 }; 
    }

    function estHexLibre(q, r) {
        const state = window.PLATEAU_VTT.getCaseState(q, r);
        if (state.isDeleted || state.isBlocked) return false;
        for (let id in tokensData) {
            if (tokensData[id].q === q && tokensData[id].r === r) return false;
        }
        return true;
    }

    window.PERSOS_PARTIE.forEach(perso => {
        if (perso.statut === "Mort") return;

        const imgToUse = perso.urlToken || perso.urlCloudinary;
        if (!imgToUse) return;

        if (!tokensData[perso.idPersonnage]) {
            const hexLibre = trouverHexLibre();
            tokensData[perso.idPersonnage] = {
                q: hexLibre.q,
                r: hexLibre.r,
                url: imgToUse,
                taille: 80 // Taille par défaut de ce pion
            };
            updated = true;
        }
    });

    if (updated) {
        try {
            const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
            await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
                Tokens: tokensData
            }, { merge: true });
        } catch (e) {}
    }
};

// =========================================================================
//  L'AFFICHAGE DES TOKENS, DE L'OMBRE AU SOL ET DE L'ANNEAU MAGIQUE
// =========================================================================

// Le pion vit hors du calque zoomé : sa position ET sa taille sont recalculées
// en pixels écran. C'est ce qui garde l'image nette au zoom sur iPad.
window.positionnerTokenVTT = function(divToken, majEchelle) {
    if (!divToken || !window.PLATEAU_VTT) return;

    const echelle = window.VTT_SCALE;
    const px = window.PLATEAU_VTT.hexToPixel(parseFloat(divToken.dataset.q), parseFloat(divToken.dataset.r));

    divToken.style.left = (window.VTT_POS_X + px.x * echelle) + "px";
    divToken.style.top = (window.VTT_POS_Y + px.y * echelle) + "px";

    if (!majEchelle) return;

    const taille = parseFloat(divToken.dataset.taille) || 80;
    const angle = parseFloat(divToken.dataset.angle) || 0;

    divToken.style.width = (taille * echelle) + "px";
    divToken.style.height = (taille * echelle) + "px";

    const ombreSol = divToken.querySelector(".token-ombre-sol");
    if (ombreSol) ombreSol.style.filter = `blur(${8 * echelle}px)`;

    const anneau = divToken.querySelector(".token-anneau");
    if (anneau) anneau.style.marginTop = (8 * echelle) + "px";

    divToken.querySelectorAll(".token-shadow").forEach(sh => {
        const decalageX = parseFloat(sh.dataset.tx) * echelle;
        const decalageY = parseFloat(sh.dataset.ty) * echelle;
        sh.style.transform = `translate(${decalageX}px, ${decalageY}px) rotate(${angle}deg)`;
        sh.style.filter = `brightness(0) blur(${parseFloat(sh.dataset.blur) * echelle}px) opacity(${sh.dataset.opacite})`;
    });

    const img = divToken.querySelector(".token-img-main");
    if (img) img.style.transform = `rotate(${angle}deg)`;
};

let echelleTokensAppliquee = null;

window.repositionnerTokensVTT = function() {
    const conteneur = document.getElementById("conteneur-tokens-vtt");
    if (!conteneur) return;

    // Le simple déplacement ne touche qu'à left/top : on évite de recalculer les flous à chaque frame
    const echelleModifiee = echelleTokensAppliquee !== window.VTT_SCALE;
    conteneur.querySelectorAll(".token-vtt").forEach(div => window.positionnerTokenVTT(div, echelleModifiee));
    echelleTokensAppliquee = window.VTT_SCALE;
};

window.appliquerTokensVTT = function(tokensMap) {
    if (!window.PLATEAU_VTT) return;
    
    // 🔻 NOUVEAU : VERROU ANTI-TÉLÉPORTATION 🔻
    // Si une animation de marche est en cours, on bloque le redessin de la carte !
    if (window.ANIMATION_VTT_EN_COURS) return;
    
    const conteneur = document.getElementById("conteneur-tokens-vtt");
    if (!conteneur) return;

    conteneur.innerHTML = "";

    // 🔻 INJECTION DE L'ANIMATION CSS POUR LA ROTATION DE L'ANNEAU 🔻
    if (!document.getElementById("anim-anneau-vtt")) {
        const style = document.createElement("style");
        style.id = "anim-anneau-vtt";
        style.innerHTML = `
            @keyframes rotationAnneauMagique {
                0% { transform: translate(-50%, -50%) rotate(0deg) scale(1); filter: brightness(1); }
                50% { transform: translate(-50%, -50%) rotate(45deg) scale(1.05); filter: brightness(1.2); }
                100% { transform: translate(-50%, -50%) rotate(90deg) scale(1); filter: brightness(1); }
            }
        `;
        document.head.appendChild(style);
    }

    for (let idPerso in tokensMap) {
        const data = tokensMap[idPerso];
        const taille = data.taille || 80;
        const angle = data.angle || 0;

        const divToken = document.createElement("div");
        divToken.className = "token-vtt"; 
        divToken.style.position = "absolute";

        // La case et la taille de référence sont mémorisées : la position écran en découle à chaque zoom
        divToken.dataset.q = data.q;
        divToken.dataset.r = data.r;
        divToken.dataset.taille = taille;
        divToken.dataset.angle = angle;
        
        // Le conteneur reste fixe
        divToken.style.transform = `translate(-50%, -50%)`; 
        
        divToken.style.pointerEvents = "auto"; 
        divToken.style.cursor = "pointer";
        divToken.style.zIndex = "10";
        divToken.style.borderRadius = "50%";
        divToken.id = "token-" + idPerso;

        // 1️⃣ L'OMBRE PORTÉE AU SOL (Brouillard de base)
        const ombreSol = document.createElement("div");
        ombreSol.className = "token-ombre-sol";
        ombreSol.style.position = "absolute";
        ombreSol.style.top = "50%";
        ombreSol.style.left = "50%";
        ombreSol.style.transform = "translate(-50%, -50%)";
        ombreSol.style.width = "60%";   
        ombreSol.style.height = "60%";  
        ombreSol.style.backgroundColor = "rgba(0, 0, 0, 0.85)"; 
        ombreSol.style.borderRadius = "50%";
        ombreSol.style.filter = "blur(8px)"; 
        ombreSol.style.zIndex = "-2"; 
        divToken.appendChild(ombreSol);

        // 2️⃣ L'ANNEAU DORÉ DE SÉLECTION
        if (window.TOKEN_SELECTIONNE === idPerso) {
            const anneauSelection = document.createElement("div");
            anneauSelection.className = "token-anneau";
            anneauSelection.style.position = "absolute";
            anneauSelection.style.top = "50%";
            anneauSelection.style.left = "50%";
            
            // VALEURS GRAVÉES DANS LE MARBRE (en % du pion, pour suivre le zoom)
            anneauSelection.style.width = "90%";
            anneauSelection.style.height = "90%"; 
            
            anneauSelection.style.zIndex = "-1"; 
            anneauSelection.style.pointerEvents = "none";
            anneauSelection.style.animation = "rotationAnneauMagique 8s linear infinite";
            
            // 🔻 NOUVEAU : Opacité globale à 65% 🔻
            anneauSelection.style.opacity = "0.65"; 

            // Le code vectoriel du cercle (Couleurs adoucies et flou plus diffus)
            anneauSelection.innerHTML = `
                <svg viewBox="0 0 100 100" width="100%" height="100%" style="overflow: visible;">
                    <defs>
                        <filter id="glow-or" x="-50%" y="-50%" width="200%" height="200%">
                            <!-- 🔻 Flou augmenté (3.5 au lieu de 2.5) -->
                            <feGaussianBlur stdDeviation="3.5" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>
                    <!-- Cercle Extérieur Lumineux (Couleur : Or très pâle / Blanc chaud) -->
                    <circle cx="50" cy="50" r="46" fill="none" stroke="#fff5cc" stroke-width="1.5" filter="url(#glow-or)"/>
                    <!-- Cercle Central (Netteté) -->
                    <circle cx="50" cy="50" r="46" fill="none" stroke="#ffffff" stroke-width="0.5" opacity="0.9"/>
                    <!-- Cercle Intérieur (Profondeur - Couleur : Or doux) -->
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#ffe699" stroke-width="0.5" filter="url(#glow-or)" opacity="0.6"/>

                    <!-- Les 4 Étoiles directionnelles -->
                    <path d="M50,0 L51.5,2.5 L55,3 L51.5,3.5 L50,6 L48.5,3.5 L45,3 L48.5,2.5 Z" fill="#ffffff" filter="url(#glow-or)"/>
                    <path d="M50,94 L51.5,96.5 L55,97 L51.5,97.5 L50,100 L48.5,97.5 L45,97 L48.5,96.5 Z" fill="#ffffff" filter="url(#glow-or)"/>
                    <path d="M0,50 L2.5,48.5 L3,45 L3.5,48.5 L6,50 L3.5,51.5 L3,55 L2.5,51.5 Z" fill="#ffffff" filter="url(#glow-or)"/>
                    <path d="M94,50 L96.5,48.5 L97,45 L97.5,48.5 L100,50 L97.5,51.5 L97,55 L96.5,51.5 Z" fill="#ffffff" filter="url(#glow-or)"/>
                </svg>
            `;
            
            divToken.appendChild(anneauSelection);
        }

        // Gestion du Clic
        divToken.onclick = function(e) {
            e.stopPropagation();
            if (typeof window.jouerSonClic === "function") window.jouerSonClic();
            window.TOKEN_SELECTIONNE = idPerso;
            const label = document.getElementById("label-taille-token");
            if (label) label.innerText = taille;
            window.appliquerTokensVTT(window.TOKENS_VTT_DATA); 
            window.afficherDansPanneauGauche(idPerso);
        };

        // Les ombres directionnelles (Images Fantômes)
        // Décalages et flous sont exprimés à l'échelle 1 : positionnerTokenVTT les convertit en pixels écran
        const createShadow = (x, y, blur, opacity) => {
            const sh = document.createElement("img");
            sh.src = data.url;
            sh.className = "token-shadow";
            sh.dataset.tx = x; 
            sh.dataset.ty = y;
            sh.dataset.blur = blur;
            sh.dataset.opacite = opacity;
            sh.style.width = "100%";
            sh.style.height = "100%";
            sh.style.objectFit = "contain";
            sh.style.position = "absolute";
            sh.style.top = "0";
            sh.style.left = "0";
            sh.style.zIndex = "1";
            sh.style.pointerEvents = "none";
            return sh;
        };

        divToken.appendChild(createShadow(-2, 5, 4, 0.8));
        divToken.appendChild(createShadow(-25, 35, 15, 0.65));

        // L'IMAGE DU PION (Nette)
        const img = document.createElement("img");
        img.className = "token-img-main";
        img.src = data.url;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        img.style.position = "relative";
        img.style.zIndex = "2"; 
        img.onerror = () => { img.style.display = "none"; };

        divToken.appendChild(img);

        window.positionnerTokenVTT(divToken, true);
        conteneur.appendChild(divToken);
    }

    echelleTokensAppliquee = window.VTT_SCALE;
};

// =========================================================================
//  NOUVEAU : CONTRÔLE ET SAUVEGARDE DE L'OPACITÉ
// =========================================================================

window.changerOpaciteGrille = function(delta) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.PLATEAU_VTT) return;
    
    let nouvelleOpa = window.PLATEAU_VTT.gridOpacity + delta;
    
    // On bloque entre 0.0 (Invisible) et 1.0 (Noir pur)
    if (nouvelleOpa < 0) nouvelleOpa = 0;
    if (nouvelleOpa > 1) nouvelleOpa = 1;
    
    window.PLATEAU_VTT.gridOpacity = nouvelleOpa;
    
    const label = document.getElementById("label-opacite-hexa");
    if (label) label.innerText = nouvelleOpa.toFixed(1);
    
    window.PLATEAU_VTT.renderMap();
};

window.sauvegarderOpaciteVTT = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT) return;
    
    const btn = document.getElementById("btn-ok-opacite");
    if (btn) btn.innerText = "⏳";

    try {
        await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
            Opacite_Grille: window.PLATEAU_VTT.gridOpacity
        }, { merge: true });
        
        if (btn) {
            btn.innerText = "✔️";
            setTimeout(() => btn.innerText = "OK", 1500);
        }
    } catch(e) {
        console.error("Erreur synchro opacité :", e);
        if (btn) btn.innerText = "❌";
    }
};

window.changerTailleHexa = function(delta) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.PLATEAU_VTT) return;
    
    let nouvelleTaille = window.PLATEAU_VTT.hexSize + delta;
    
    if (nouvelleTaille < 20) nouvelleTaille = 20; 
    if (nouvelleTaille > 250) nouvelleTaille = 250; 
    
    window.PLATEAU_VTT.hexSize = nouvelleTaille;
    window.PLATEAU_VTT.hexWidth = 2 * nouvelleTaille;
    window.PLATEAU_VTT.hexHeight = Math.sqrt(3) * nouvelleTaille;
    
    const label = document.getElementById("label-taille-hexa");
    if (label) label.innerText = nouvelleTaille;
    window.PLATEAU_VTT.renderMap();
};

// =========================================================================
//  GESTION DU PANNEAU LATÉRAL DE COMBAT (RÉTRACTABLE)
// =========================================================================
window.PANNEAU_GAUCHE_OUVERT = true;

window.togglePanneauGauche = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    const panneau = document.getElementById("panneau-combat-gauche");
    const fleche = document.getElementById("fleche-toggle-panneau");
    if (!panneau || !fleche) return;
    
    window.PANNEAU_GAUCHE_OUVERT = !window.PANNEAU_GAUCHE_OUVERT;
    
    if (window.PANNEAU_GAUCHE_OUVERT) {
        panneau.style.transform = "translateX(0)";
        fleche.innerText = "◄";
    } else {
        // Rétracte le panneau en laissant dépasser 5px (pour voir un fin liseret) + l'onglet
        panneau.style.transform = "translateX(calc(-100% + 5px))";
        fleche.innerText = "►";
    }
};

// =========================================================================
//  GESTION DES PINCEAUX VTT (MURS, GOMME, DIFFICILE) ET EXCLUSIVITÉ
// =========================================================================

window.toggleModeEffacementHex = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    if (window.VTT_MODE_MURS) { window.VTT_MODE_MURS = false; document.getElementById("btn-murs-vtt")?.classList.remove("actif"); window.sauvegarderMurs(); }
    if (window.VTT_MODE_DIFFICILE) { window.VTT_MODE_DIFFICILE = false; document.getElementById("btn-difficile-vtt")?.classList.remove("actif"); window.sauvegarderTerrainDifficile(); }

    window.VTT_MODE_EFFACEMENT = !window.VTT_MODE_EFFACEMENT;
    const btn = document.getElementById("btn-gomme-vtt");
    if (btn) {
        if (window.VTT_MODE_EFFACEMENT) btn.classList.add("actif");
        else { btn.classList.remove("actif"); window.sauvegarderTuilesSupprimees(); }
    }
    if (window.PLATEAU_VTT) window.PLATEAU_VTT.renderMap();
};

window.toggleModeMursHex = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    if (window.VTT_MODE_EFFACEMENT) { window.VTT_MODE_EFFACEMENT = false; document.getElementById("btn-gomme-vtt")?.classList.remove("actif"); window.sauvegarderTuilesSupprimees(); }
    if (window.VTT_MODE_DIFFICILE) { window.VTT_MODE_DIFFICILE = false; document.getElementById("btn-difficile-vtt")?.classList.remove("actif"); window.sauvegarderTerrainDifficile(); }

    window.VTT_MODE_MURS = !window.VTT_MODE_MURS;
    const btn = document.getElementById("btn-murs-vtt");
    if (btn) {
        if (window.VTT_MODE_MURS) btn.classList.add("actif");
        else { btn.classList.remove("actif"); window.sauvegarderMurs(); }
    }
    if (window.PLATEAU_VTT) window.PLATEAU_VTT.renderMap();
};

window.toggleModeTerrainDifficileHex = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    if (window.VTT_MODE_EFFACEMENT) { window.VTT_MODE_EFFACEMENT = false; document.getElementById("btn-gomme-vtt")?.classList.remove("actif"); window.sauvegarderTuilesSupprimees(); }
    if (window.VTT_MODE_MURS) { window.VTT_MODE_MURS = false; document.getElementById("btn-murs-vtt")?.classList.remove("actif"); window.sauvegarderMurs(); }

    window.VTT_MODE_DIFFICILE = !window.VTT_MODE_DIFFICILE;
    const btn = document.getElementById("btn-difficile-vtt");
    if (btn) {
        if (window.VTT_MODE_DIFFICILE) btn.classList.add("actif");
        else { btn.classList.remove("actif"); window.sauvegarderTerrainDifficile(); }
    }
    if (window.PLATEAU_VTT) window.PLATEAU_VTT.renderMap();
};

// --- SYNC FIREBASE ---
window.sauvegarderTuilesSupprimees = async function() {
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT) return;
    const deletedHexes = Object.keys(window.PLATEAU_VTT.gridState).filter(key => window.PLATEAU_VTT.gridState[key].isDeleted);
    try { await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), { Tuiles_Supprimees: deletedHexes }, { merge: true }); } catch(e) {}
};

window.sauvegarderMurs = async function() {
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT) return;
    const blockedHexes = Object.keys(window.PLATEAU_VTT.gridState).filter(key => window.PLATEAU_VTT.gridState[key].isBlocked);
    try { await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), { Tuiles_Murs: blockedHexes }, { merge: true }); } catch(e) {}
};

window.sauvegarderTerrainDifficile = async function() {
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT) return;
    const diffHexes = Object.keys(window.PLATEAU_VTT.gridState).filter(key => window.PLATEAU_VTT.gridState[key].isDifficult);
    try { await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), { Tuiles_Difficiles: diffHexes }, { merge: true }); } catch(e) {}
};

window.appliquerTuilesSupprimees = function(tuilesList) {
    if (!window.PLATEAU_VTT) return;
    for (const key in window.PLATEAU_VTT.gridState) window.PLATEAU_VTT.gridState[key].isDeleted = false;
    if (Array.isArray(tuilesList)) tuilesList.forEach(key => { if (!window.PLATEAU_VTT.gridState[key]) window.PLATEAU_VTT.gridState[key] = {}; window.PLATEAU_VTT.gridState[key].isDeleted = true; });
    window.PLATEAU_VTT.renderMap();
};

window.appliquerMurs = function(tuilesList) {
    if (!window.PLATEAU_VTT) return;
    for (const key in window.PLATEAU_VTT.gridState) window.PLATEAU_VTT.gridState[key].isBlocked = false;
    if (Array.isArray(tuilesList)) tuilesList.forEach(key => { if (!window.PLATEAU_VTT.gridState[key]) window.PLATEAU_VTT.gridState[key] = {}; window.PLATEAU_VTT.gridState[key].isBlocked = true; });
    window.PLATEAU_VTT.renderMap();
};

window.appliquerTerrainDifficile = function(tuilesList) {
    if (!window.PLATEAU_VTT) return;
    for (const key in window.PLATEAU_VTT.gridState) window.PLATEAU_VTT.gridState[key].isDifficult = false;
    if (Array.isArray(tuilesList)) tuilesList.forEach(key => { if (!window.PLATEAU_VTT.gridState[key]) window.PLATEAU_VTT.gridState[key] = {}; window.PLATEAU_VTT.gridState[key].isDifficult = true; });
    window.PLATEAU_VTT.renderMap();
};

// =========================================================================
//  NOUVEAU : CONTRÔLE DE L'ESPACEMENT DES BANNIÈRES
// =========================================================================

window.changerEspacementBannieres = function(delta) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    // Récupération de l'espacement actuel (ou valeur par défaut)
    let espacementActuel = parseInt(localStorage.getItem("ivalis_espacement_bannieres")) || -85;
    let nouvelEspacement = espacementActuel + delta;
    
    // On met des limites raisonnables (-120px très serré, 0px très espacé)
    if (nouvelEspacement < -120) nouvelEspacement = -120;
    if (nouvelEspacement > 0) nouvelEspacement = 0;
    
    // Sauvegarde dans le navigateur
    localStorage.setItem("ivalis_espacement_bannieres", nouvelEspacement);
    window.ESPACEMENT_BANNIERES_COMBAT = nouvelEspacement;
    
    const label = document.getElementById("label-espacement-bannieres");
    if (label) label.innerText = nouvelEspacement;
    
    // On force le rafraîchissement immédiat de l'UI
    if (window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR.length > 0) {
        window.afficherPersoCombatActuel();
    }
};

// --- INITIALISATION VISUELLE DU LABEL AU DÉMARRAGE ---
document.addEventListener("DOMContentLoaded", function () {
    const label = document.getElementById("label-espacement-bannieres");
    if (label) {
        label.innerText = parseInt(localStorage.getItem("ivalis_espacement_bannieres")) || -85;
    }
});

// =========================================================================
//  GESTION DU TOUR PAR TOUR ET PISTE D'INITIATIVE
// =========================================================================

// 1. Le Joueur choisit sa carte
window.jouerCarteCombat = async function(idCarte) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE) return;

    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
    if (!persoActuel) return;

    const dataCarte = window.COMPETENCES_CACHE[idCarte];
    if (!dataCarte) return;

    const btn = document.getElementById("btn-choisir-action");
    if(btn) { btn.innerText = "Préparation..."; btn.disabled = true; }

    // 🔻 EFFET VISUEL IMMÉDIAT (N'attend pas le réseau)
    const deckEl = document.getElementById("combat-liste-competences");
    if (deckEl) {
        deckEl.style.transition = "opacity 0.3s ease";
        deckEl.style.opacity = "0";
        deckEl.style.pointerEvents = "none";
    }
    window.mettreAJourJaugeFatigue(0); // Cache la jauge rouge
    // 🔻 CORRECTION : Shrink immédiat en "vh"
    const imgPerso = document.getElementById("combat-portrait-perso");
    if (imgPerso) {
        imgPerso.style.transition = "height 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.4s ease";
        imgPerso.style.height = "40vh"; /* Doit être identique à la valeur au-dessus */
    }
    if (typeof window.afficherApercuCarteHD === "function") {
        window.afficherApercuCarteHD(idCarte, true); // Lock immédiat
    }

    try {
        const { doc, getDoc, updateDoc } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
        const partieRef = doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE);
        const snap = await getDoc(partieRef);

        if (snap.exists()) {
            let file = snap.data().File_Attente_Combat || [];
            file = file.filter(item => item.idPersonnage !== persoActuel.idPersonnage);

            file.push({
                idPersonnage: persoActuel.idPersonnage,
                idCarte: idCarte, // NOUVEAU : Sauvegarde la carte choisie !
                initiative: dataCarte.Initiative || 0,
                timestamp: new Date().getTime()
            });

            file.sort((a, b) => {
                if (b.initiative !== a.initiative) return b.initiative - a.initiative;
                return a.timestamp - b.timestamp;
            });

            let phase = snap.data().Phase_Combat || "Preparation";
            const nbJoueursVivants = (window.PERSOS_PARTIE || []).filter(p => p.statut !== "Mort").length;
            
            if (file.length >= nbJoueursVivants && nbJoueursVivants > 0) phase = "Resolution";

            await updateDoc(partieRef, { 
                File_Attente_Combat: file,
                Phase_Combat: phase 
            });
        }
    } catch (e) {
        console.error("Erreur jouerCarteCombat:", e);
        if (deckEl) {
            deckEl.style.opacity = "1";
            deckEl.style.pointerEvents = "auto";
        }
        if (typeof window.masquerApercuCarteHD === "function") window.masquerApercuCarteHD(true);
        if (btn) { btn.innerText = "Choisir"; btn.disabled = false; }
        window.mettreAJourJaugeFatigue(0);
    }
};

// =========================================================================
//  MÉCANIQUE DE REPOS LONG
// =========================================================================
window.jouerReposLong = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE) return;

    const partie = window.PARTIE_DATA || {};
    const phase = partie.Phase_Combat || "Preparation";
    
    if (phase !== "Preparation") return;

    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
    if (!persoActuel) return;

    const deckEl = document.getElementById("combat-liste-competences");
    if (deckEl) {
        deckEl.style.transition = "opacity 0.3s ease";
        deckEl.style.opacity = "0";
        deckEl.style.pointerEvents = "none";
    }
    window.mettreAJourJaugeFatigue(0);
    
    const imgPerso = document.getElementById("combat-portrait-perso");
    if (imgPerso) {
        imgPerso.style.transition = "height 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.4s ease";
        imgPerso.style.height = "40vh"; 
    }
    
    window.actualiserEtatCarteCombat("REPOS_LONG");

    try {
        const { doc, getDoc, updateDoc } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
        const partieRef = doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE);
        const snap = await getDoc(partieRef);

        if (snap.exists()) {
            let file = snap.data().File_Attente_Combat || [];
            
            file = file.filter(item => item.idPersonnage !== persoActuel.idPersonnage);

            file.push({
                idPersonnage: persoActuel.idPersonnage,
                idCarte: "REPOS_LONG", 
                initiative: 0,
                timestamp: new Date().getTime()
            });

            file.sort((a, b) => {
                if (b.initiative !== a.initiative) return b.initiative - a.initiative;
                return a.timestamp - b.timestamp;
            });

            let newPhase = snap.data().Phase_Combat || "Preparation";
            const nbJoueursVivants = (window.PERSOS_PARTIE || []).filter(p => p.statut !== "Mort").length;
            
            if (file.length >= nbJoueursVivants && nbJoueursVivants > 0) newPhase = "Resolution";

            await updateDoc(partieRef, { 
                File_Attente_Combat: file,
                Phase_Combat: newPhase 
            });
        }
    } catch (e) {
        console.error("Erreur jouerReposLong:", e);
        window.actualiserEtatCarteCombat();
    }
};

// =========================================================================
//  GESTION VISUELLE DU BOUTON "FIN DU TOUR"
// =========================================================================

window.PEUT_PASSER_TOUR = false;

window.actualiserBoutonFinTour = function(queueParam, phaseParam) {
    const imgBtn = document.getElementById("img-hud-fintour");
    if (!imgBtn) return;

    // Récupération des données (Paramètres en priorité, fallback sur PARTIE_DATA si on change juste de perso)
    const partie = window.PARTIE_DATA || {};
    const queue = queueParam !== undefined ? queueParam : (partie.File_Attente_Combat || []);
    const phase = phaseParam !== undefined ? phaseParam : (partie.Phase_Combat || "Preparation");
    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];

    // C'est au tour du perso SI :
    const estMonTour = (
        phase === "Resolution" && 
        queue.length > 0 && 
        persoActuel && 
        queue[0].idPersonnage === persoActuel.idPersonnage
    );

    if (estMonTour) {
        imgBtn.src = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1786565146/finTourAllum_gmn7ln.png";
        window.PEUT_PASSER_TOUR = true;
    } else {
        imgBtn.src = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1786565146/FinTourEteind_exjtxp.png";
        window.PEUT_PASSER_TOUR = false;
    }
};

window.ANIMATION_TOUR_EN_COURS = false;

window.finDeTourCombat = async function(forcer = false) {
    if (!window.PEUT_PASSER_TOUR && !forcer) return; 

    window.COUT_COMPETENCE_SELECTIONNEE = 0;

    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE) return;

    window.ANIMATION_TOUR_EN_COURS = true;

    const premiereBulle = document.getElementById("premiere-bulle-initiative");
    if (premiereBulle) {
        premiereBulle.style.opacity = "0";
        premiereBulle.style.width = "0px";
        premiereBulle.style.minWidth = "0px"; 
        premiereBulle.style.marginRight = "0px";
        premiereBulle.style.transform = "scale(0.5)";
    }

    setTimeout(async () => {
        try {
            const { doc, getDoc, updateDoc, writeBatch } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
            const partieRef = doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE);
            const snap = await getDoc(partieRef);

            let file = [];
            let phase = "Preparation";

            if (snap.exists()) {
                file = snap.data().File_Attente_Combat || [];
                phase = snap.data().Phase_Combat || "Resolution";
                let tour = snap.data().Tour_Combat || 1;

                if (file.length > 0) {
                    const actionCourante = file[0];
                    let reposLongEffectue = false;
                    let nvFatigueRepos = null;
                    let idPersoRepos = null;

                    if (actionCourante.idCarte === "REPOS_LONG") {
                        const persoAction = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === actionCourante.idPersonnage);
                        if (persoAction && persoAction.statut !== "Mort") {
                            const fatigueMax = parseInt(persoAction.Fatigue_Max) || parseInt(persoAction.fatigueMax) || 100;
                            let fatigueActuelle = persoAction.fatigueActuelle !== undefined ? parseInt(persoAction.fatigueActuelle) : fatigueMax;
                            
                            const recup = Math.floor(fatigueMax * 0.35);
                            fatigueActuelle = Math.min(fatigueMax, fatigueActuelle + recup);

                            persoAction.fatigueActuelle = fatigueActuelle;
                            const persoJoueur = (window.COMBAT_PERSOS_JOUEUR || []).find(p => p.idPersonnage === actionCourante.idPersonnage);
                            if (persoJoueur) persoJoueur.fatigueActuelle = fatigueActuelle;

                            if (window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO]?.idPersonnage === actionCourante.idPersonnage) {
                                window.COMBAT_FATIGUE_ACTUELLE = fatigueActuelle;
                                if (typeof window.mettreAJourJaugeFatigue === "function") window.mettreAJourJaugeFatigue(0);
                            }
                            
                            reposLongEffectue = true;
                            nvFatigueRepos = fatigueActuelle;
                            idPersoRepos = actionCourante.idPersonnage;
                        }
                    }

                    file.shift();
                    
                    if (file.length === 0) {
                        phase = "Preparation";
                        tour++;
                        
                        if (window.PERSOS_PARTIE && window.PERSOS_PARTIE.length > 0) {
                            const batch = writeBatch(db);
                            let regenAjoutee = false;
                            
                            window.PERSOS_PARTIE.forEach(perso => {
                                if (perso.statut !== "Mort") {
                                    const fatigueMax = parseInt(perso.Fatigue_Max) || parseInt(perso.fatigueMax) || 100;
                                    let fatigue = perso.fatigueActuelle !== undefined ? parseInt(perso.fatigueActuelle) : fatigueMax;
                                    
                                    const regenPct = parseInt(perso.Regeneration) || 0;

                                    if (regenPct > 0) {
                                        const montantRegen = Math.floor((regenPct / 100) * fatigueMax);
                                        fatigue = Math.min(fatigueMax, fatigue + montantRegen);

                                        perso.fatigueActuelle = fatigue;

                                        const persoJoueur = (window.COMBAT_PERSOS_JOUEUR || []).find(p => p.idPersonnage === perso.idPersonnage);
                                        if (persoJoueur) persoJoueur.fatigueActuelle = fatigue;

                                        const persoActuel = window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
                                        if (persoActuel && persoActuel.idPersonnage === perso.idPersonnage) {
                                            window.COMBAT_FATIGUE_ACTUELLE = fatigue;
                                        }

                                        const persoRef = doc(db, "Personnages", perso.idPersonnage);
                                        batch.update(persoRef, { Fatigue_Actuelle: fatigue });
                                        regenAjoutee = true;
                                    }
                                }
                            });
                            
                            if (regenAjoutee) await batch.commit();
                            if (typeof window.mettreAJourJaugeFatigue === "function") window.mettreAJourJaugeFatigue(0);
                        }
                    }
                    
                    await updateDoc(partieRef, { 
                        File_Attente_Combat: file,
                        Phase_Combat: phase,
                        Tour_Combat: tour
                    });

                    if (file.length > 0 && reposLongEffectue) {
                        const persoRef = doc(db, "Personnages", idPersoRepos);
                        updateDoc(persoRef, { Fatigue_Actuelle: nvFatigueRepos }).catch(e => console.error(e));
                    }
                }
            }
            
            window.ANIMATION_TOUR_EN_COURS = false;
            if (typeof window.afficherPisteInitiative === "function") {
                window.afficherPisteInitiative(file, phase);
            }

        } catch (e) {
            window.ANIMATION_TOUR_EN_COURS = false;
            console.error("Erreur finDeTourCombat:", e);
        }
    }, 350); 
};

window.afficherPisteInitiative = function(queue, phase) {
    if (window.ANIMATION_TOUR_EN_COURS) return;

    const piste = document.getElementById("piste-initiative");
    if (!piste) return;

    if (!queue || queue.length === 0 || phase === "Preparation") {
        piste.style.opacity = "0";
        piste.style.padding = "0px";
        setTimeout(() => piste.innerHTML = "", 400);
        if (typeof window.actualiserBoutonFinTour === "function") window.actualiserBoutonFinTour(queue || [], phase);
        return;
    }

    piste.style.opacity = "1";
    piste.style.padding = "0 15px 0 25px";
    let html = "";

    queue.forEach((item, index) => {
        const perso = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === item.idPersonnage);
        if (!perso) return;

        const pvMax = (parseInt(perso.PV_Max) || 1) + (parseInt(perso.Dev_Mod_PV) || 0);
        const pvActuels = perso.PV_Actuels !== undefined ? parseInt(perso.PV_Actuels) : pvMax;
        const pctPv = Math.min(100, Math.max(0, (pvActuels / pvMax) * 100));

        const fatigueMax = parseInt(perso.Fatigue_Max) || parseInt(perso.fatigueMax) || 100;
        const fatigue = perso.fatigueActuelle !== undefined ? parseInt(perso.fatigueActuelle) : fatigueMax;
        const pctFatigue = Math.min(100, Math.max(0, (fatigue / fatigueMax) * 100));

        const imgUrl = perso.urlCloudinary || "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1786114507/Les_humains_h0ubwh.png";
        const attributId = index === 0 ? 'id="premiere-bulle-initiative"' : '';
        const classeBulle = (index === 0 && phase === "Resolution") ? "halo-tour-actif" : "bulle-initiative-base";
        const affichageInit = item.idCarte === "REPOS_LONG" ? "⏳" : item.initiative;

        html += `
        <div ${attributId} class="${classeBulle}" style="position: relative; width: 110px; height: 126px; flex-shrink: 0; margin-top: 0px; transition: all 0.4s ease; transform-origin: left center; margin-right: 15px; cursor: pointer;" onclick="window.selectionnerEtCentrerPerso('${item.idPersonnage}')">
            <div style="position: absolute; inset: 0; background: linear-gradient(135deg, #fbf5bd 0%, #c2a878 30%, #5c3a21 50%, #e8d5a5 80%, #ffffff 100%); clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%); display: flex; align-items: center; justify-content: center;">
                <div style="width: 102px; height: 118px; background-color: #1a0f08; clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%); position: relative;">
                    <img src="${imgUrl}" style="width: 100%; height: 100%; object-fit: cover; object-position: top center;">
                    <div style="position: absolute; bottom: 0; left: 0; width: 100%; height: 40%; background: linear-gradient(to top, rgba(0,0,0,0.9), transparent);"></div>
                </div>
            </div>

            <div style="position: absolute; top: -6px; left: -8px; width: 38px; height: 38px; border-radius: 50%; border: 2px solid #e8d5a5; background: #1a0f08; box-shadow: 0 2px 5px rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; z-index: 2;">
                <span style="color: #e8d5a5; font-family: 'Cinzel', serif; font-size: 18px; font-weight: bold; text-shadow: 1px 1px 3px black, 0 0 5px rgba(232, 213, 165, 0.5);">${affichageInit}</span>
            </div>

            <div style="position: absolute; bottom: 8px; left: -10px; width: 50px; height: 8px; background: #000; border: 1px solid #1a0f08; border-radius: 4px; transform: rotate(30deg); transform-origin: center; box-shadow: 0 2px 4px rgba(0,0,0,0.8); overflow: hidden; z-index: 2;">
                <div style="position: absolute; top: 0; right: 0; width: ${pctPv}%; height: 100%; background: linear-gradient(to right, #e63946, #ff8b8b); transition: width 0.3s ease;"></div>
            </div>

            <div style="position: absolute; bottom: 8px; right: -10px; width: 50px; height: 8px; background: #000; border: 1px solid #1a0f08; border-radius: 4px; transform: rotate(-30deg); transform-origin: center; box-shadow: 0 2px 4px rgba(0,0,0,0.8); overflow: hidden; z-index: 2;">
                <div style="position: absolute; top: 0; left: 0; width: ${pctFatigue}%; height: 100%; background: linear-gradient(to right, #c2a878, #fbf5bd); transition: width 0.3s ease;"></div>
            </div>
        </div>`;
    });

    piste.innerHTML = html;
    if (typeof window.actualiserBoutonFinTour === "function") window.actualiserBoutonFinTour(queue, phase);
};

// =========================================================================
//  GESTION VISUELLE DE LA CARTE DANS LE PANNEAU GAUCHE
// =========================================================================
window.actualiserEtatCarteCombat = function(simulationAction = null) {
    if (document.getElementById("fenetre-combat")?.style.display !== "block") return;
    
    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
    if (!persoActuel) return;

    const partie = window.PARTIE_DATA || {};
    const queue = partie.File_Attente_Combat || [];
    
    const persoInQueue = simulationAction ? { idCarte: simulationAction } : queue.find(q => q.idPersonnage === persoActuel.idPersonnage);

    // Dé-sélection visuelle si la carte en aperçu n'est plus finançable (ex. après un déplacement)
    if (window.CARTE_EN_APERCU && !(persoInQueue && persoInQueue.idCarte)) {
        const dataSel = window.COMPETENCES_CACHE[window.CARTE_EN_APERCU];
        const coutSel = parseInt(dataSel?.Fatigue) || 0;
        const fatigueRestante = persoActuel.fatigueActuelle !== undefined
            ? parseInt(persoActuel.fatigueActuelle)
            : (window.COMBAT_FATIGUE_ACTUELLE || 0);
        if (coutSel > fatigueRestante) {
            window.COUT_COMPETENCE_SELECTIONNEE = 0;
            document.querySelectorAll('.banniere-carte-combat').forEach(el => {
                el.dataset.actif = "false";
            });
            if (typeof window.masquerApercuCarteHD === "function") window.masquerApercuCarteHD();
        }
    }
    
    const deckEl = document.getElementById("combat-liste-competences");
    const imgPerso = document.getElementById("combat-portrait-perso");
    
    if (deckEl) deckEl.style.transition = "opacity 0.3s ease";

    let divRepos = document.getElementById("apercu-repos-long-ui");
    if (!divRepos) {
        divRepos = document.createElement("div");
        divRepos.id = "apercu-repos-long-ui";
        divRepos.style.cssText = "position: absolute; top: 15vh; left: 50px; width: 340px; height: 476px; z-index: 100; display: flex; flex-direction: column; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.3s ease, left 0.4s cubic-bezier(0.25, 0.8, 0.25, 1); pointer-events: none;";
        divRepos.innerHTML = `
            <div style="font-size: 120px; filter: drop-shadow(0 0 20px rgba(194, 168, 120, 0.8)); animation: levitation 3s infinite alternate ease-in-out;">⏳</div>
            <div style="font-family: 'Cinzel', serif; font-size: 26px; font-weight: bold; color: #e8d5a5; text-shadow: 2px 2px 5px black; margin-top: 20px; text-transform: uppercase; letter-spacing: 2px;">Repos Long</div>
            <div style="font-family: 'Almendra', serif; font-size: 18px; color: #c2a878; text-shadow: 1px 1px 3px black; margin-top: 15px; text-align: center; max-width: 80%;">Concentration et souffle.<br><br><span style="color:#1b6e3a;">+35% Énergie Max</span> à la fin du tour.</div>
        `;
        const panneauGauche = document.getElementById("panneau-combat-gauche");
        if (panneauGauche) panneauGauche.appendChild(divRepos);
    }

    if (persoInQueue && persoInQueue.idCarte) {
        if (deckEl) {
            deckEl.style.opacity = "0";
            deckEl.style.pointerEvents = "none";
        }
        window.mettreAJourJaugeFatigue(0);
        if (imgPerso) {
            imgPerso.style.transition = "height 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.4s ease";
            imgPerso.style.height = "40vh"; 
        }
        
        if (persoInQueue.idCarte === "REPOS_LONG") {
            if (typeof window.masquerApercuCarteHD === "function") window.masquerApercuCarteHD(true);
            divRepos.style.left = "20px";
            divRepos.style.opacity = "1";
        } else {
            divRepos.style.left = "50px";
            divRepos.style.opacity = "0";
            if (typeof window.afficherApercuCarteHD === "function") window.afficherApercuCarteHD(persoInQueue.idCarte, true); 
        }
    } else {
        if (deckEl) {
            deckEl.style.opacity = "1";
            deckEl.style.pointerEvents = "auto";
        }
        if (imgPerso && !window.CARTE_EN_APERCU) {
            imgPerso.style.transition = "height 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.4s ease";
            imgPerso.style.height = "100%";
        }
        
        divRepos.style.left = "50px";
        divRepos.style.opacity = "0";

        const conteneurCarte = document.getElementById("apercu-carte-hd-competence");
        if (conteneurCarte && conteneurCarte.dataset.locked === "true") {
            conteneurCarte.dataset.locked = "false";
            if (typeof window.masquerApercuCarteHD === "function") window.masquerApercuCarteHD(true); 
        }
    }

    if (typeof window.actualiserBannieresEpuisees === "function") {
        window.actualiserBannieresEpuisees();
    }
};

window.actualiserBannieresEpuisees = function() {
    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
    if (!persoActuel) return;
    
    const fatigueMax = parseInt(persoActuel.Fatigue_Max) || parseInt(persoActuel.fatigueMax) || 100;
    const fatiguePerso = persoActuel.fatigueActuelle !== undefined ? parseInt(persoActuel.fatigueActuelle) : fatigueMax;

    const liste = document.getElementById("combat-liste-competences");
    if (!liste) return;

    const IMAGE_CADRE_NORMAL = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png";
    const IMAGE_CADRE_EPUISE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1783286721/ban_epuis%C3%A9_otc70l.png";

    Array.from(liste.querySelectorAll('.banniere-carte-combat')).forEach(ban => {
        const idCarte = ban.id.replace("combat-carte-", "");
        const dataCarte = window.COMPETENCES_CACHE[idCarte];
        
        if (dataCarte) {
            const coutFatigue = parseInt(dataCarte.Fatigue) || 0;
            const cadre = document.getElementById(`cadre-combat-${idCarte}`);
            
            if (coutFatigue > fatiguePerso) {
                ban.classList.add("banniere-epuisee");
                if (cadre) cadre.style.backgroundImage = `url('${IMAGE_CADRE_EPUISE}')`;
            } else {
                ban.classList.remove("banniere-epuisee");
                if (cadre && ban.dataset.actif !== "true") cadre.style.backgroundImage = `url('${IMAGE_CADRE_NORMAL}')`;
            }
        }
    });
};

window.validerCarteCombat = async function(idCarte, elementTexte) {
    if (elementTexte && elementTexte.innerText === "Validé") return;

    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    if (elementTexte) {
        elementTexte.innerText = "Validé";
        elementTexte.style.opacity = "0.5";
        elementTexte.style.pointerEvents = "none";
    }

    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
    if (!persoActuel) return;

    const dataCarte = window.COMPETENCES_CACHE[idCarte];
    if (!dataCarte) return;

    const coutFatigue = parseInt(dataCarte.Fatigue) || 0;
    const fatigueMax = parseInt(persoActuel.Fatigue_Max) || parseInt(persoActuel.fatigueMax) || 100;
    let fatigue = persoActuel.fatigueActuelle !== undefined ? parseInt(persoActuel.fatigueActuelle) : fatigueMax;

    fatigue = Math.max(0, fatigue - coutFatigue);

    persoActuel.fatigueActuelle = fatigue;
    window.COMBAT_FATIGUE_ACTUELLE = fatigue;

    const persoPartie = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === persoActuel.idPersonnage);
    if (persoPartie) persoPartie.fatigueActuelle = fatigue;

    if (typeof window.mettreAJourJaugeFatigue === "function") window.mettreAJourJaugeFatigue(0);

    if (typeof window.finDeTourCombat === "function") {
        window.finDeTourCombat(true);
    }

    setTimeout(async () => {
        try {
            const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
            const persoRef = doc(db, "Personnages", persoActuel.idPersonnage);
            
            await updateDoc(persoRef, { 
                Fatigue_Actuelle: fatigue 
            });
            
        } catch (e) {
            console.error("Erreur lors de la déduction de la fatigue :", e);
        }
    }, 350);
};

// =========================================================================
//  GESTION DES TOURS ET DE LA RÉINITIALISATION
// =========================================================================

window.DERNIER_TOUR_AFFICHE = 0; // Mémoire locale pour ne pas rejouer l'animation en boucle

// 1. Détecte le changement de tour et lance l'animation
window.verifierChangementTour = function(nouveauTour) {
    const fenetreCombat = document.getElementById("fenetre-combat");
    if (!fenetreCombat || fenetreCombat.style.display !== "block") return;
    
    // Au lancement du combat (Tour 1) ou si le tour change
    if (window.DERNIER_TOUR_AFFICHE !== nouveauTour) {
        window.DERNIER_TOUR_AFFICHE = nouveauTour;
        window.animerTexteTour(nouveauTour);
    }
};

// 2. Joue l'animation CSS centrale
window.animerTexteTour = function(tour) {
    const divAnnonce = document.getElementById("annonce-tour-combat");
    if (!divAnnonce) return;
    
    divAnnonce.innerHTML = `<span>Tour</span> <span style="font-size: 2em; line-height: 0.8; margin-top: -15px;">${tour}</span>`;
    
    divAnnonce.classList.remove("anim-tour-pop");
    void divAnnonce.offsetWidth; 
    divAnnonce.classList.add("anim-tour-pop");
};

// 3. Le super bouton RESET
window.reinitialiserCombat = async function() {
    if (!confirm("Voulez-vous vraiment réinitialiser ce combat ? Tous les PV et la Fatigue seront restaurés, et le combat repassera au Tour 1.")) return;
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    try {
        const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
        
        // A. Reset de la Partie (Tour 1, file vide)
        if (window.ID_PARTIE_COURANTE) {
            const partieRef = doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE);
            await updateDoc(partieRef, {
                File_Attente_Combat: [],
                Phase_Combat: "Preparation",
                Tour_Combat: 1
            });
        }

        // B. Reset des Personnages (Soin total de la Vie et de l'Énergie)
        if (window.PERSOS_PARTIE && window.PERSOS_PARTIE.length > 0) {
            for (let perso of window.PERSOS_PARTIE) {
                const pvMax = (parseInt(perso.PV_Max) || 1) + (parseInt(perso.Dev_Mod_PV) || 0);
                const fatigueMax = parseInt(perso.Fatigue_Max) || parseInt(perso.fatigueMax) || 100;

                // Mise à jour locale immédiate (évite d'attendre le snapshot)
                perso.PV_Actuels = pvMax;
                perso.fatigueActuelle = fatigueMax;

                const persoActuel = window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
                if (persoActuel && persoActuel.idPersonnage === perso.idPersonnage) {
                    window.COMBAT_PV_MAX = pvMax;
                    window.COMBAT_PV_ACTUELS = pvMax;
                    window.COMBAT_FATIGUE_MAX = fatigueMax;
                    window.COMBAT_FATIGUE_ACTUELLE = fatigueMax;
                }

                const persoRef = doc(db, "Personnages", perso.idPersonnage);
                await updateDoc(persoRef, {
                    PV_Actuels: pvMax,
                    Fatigue_Actuelle: fatigueMax
                });
            }
        }

        if (typeof window.mettreAJourJaugePV === "function") window.mettreAJourJaugePV();
        if (typeof window.mettreAJourJaugeFatigue === "function") window.mettreAJourJaugeFatigue(0);
        
        // Forcer la remise à zéro de la mémoire locale pour rejouer l'animation "Tour 1"
        window.DERNIER_TOUR_AFFICHE = 0;
        if (typeof window.verifierChangementTour === "function") {
            window.verifierChangementTour(1);
        }
        console.log("Le combat a été entièrement réinitialisé !");
        
    } catch (e) {
        console.error("Erreur lors de la réinitialisation du combat :", e);
    }
};
