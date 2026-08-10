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

    const btnEngrenage = document.getElementById('btn-engrenage-combat');
    if (btnEngrenage) {
        const valeurDevIvalis = localStorage.getItem("ivalis_DEV_MODE");
        const valeurDevLocal = localStorage.getItem("MODE_DEV");
        
        const modeDevActif = (
            valeurDevIvalis === "on" ||
            valeurDevLocal === "true" ||
            valeurDevLocal === "1" ||
            window.MODE_DEV === true
        );
        
        if (modeDevActif) {
            btnEngrenage.style.display = 'block';
        } else {
            btnEngrenage.style.display = 'none';
        }
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
    const btnEngrenage = document.getElementById('btn-engrenage-combat');
    if (btnEngrenage) btnEngrenage.style.display = 'none';
    if (typeof window.fermerMenusCoulissantsCombat === "function") {
        window.fermerMenusCoulissantsCombat();
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
        divNom.style.color = "#888";
        document.getElementById("combat-liste-competences").innerHTML = "";
        if (imgPerso) imgPerso.style.opacity = "0"; 
        return;
    }

    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
    const prenom = persoActuel.prenom || "";
    const nom = persoActuel.nom || "";
    
    divNom.innerText = (prenom + " " + nom).trim();
    divNom.style.color = persoActuel.couleur || "#e8d5a5";

    if (imgPerso) {
        if (persoActuel.urlCloudinary && persoActuel.urlCloudinary !== "") {
            imgPerso.src = persoActuel.urlCloudinary;
            imgPerso.style.opacity = "1";
        } else {
            imgPerso.style.opacity = "0";
        }
    }

    window.chargerCompetencesCombat(persoActuel.idPersonnage, persoActuel.couleur);
};

// =========================================================================
//  CHARGEMENT ET AFFICHAGE DU DECK (ZÉRO LATENCE)
// =========================================================================

window.chargerCompetencesCombat = function(idPersonnage, couleur) {
    const listeDiv = document.getElementById("combat-liste-competences");
    
    try {
        const persoActuel = window.PERSOS_PARTIE.find(p => p.idPersonnage === idPersonnage);
        if (!persoActuel) return;
        
        // --- MISE EN MÉMOIRE DES STATS DE FATIGUE ---
        window.COMBAT_FATIGUE_MAX = parseInt(persoActuel.fatigueMax) || 100;
        window.COMBAT_FATIGUE_ACTUELLE = parseInt(persoActuel.fatigueActuelle) || window.COMBAT_FATIGUE_MAX;
        
        // On affiche le conteneur de la jauge et on la met à 0 (coût)
        document.getElementById("combat-jauge-fatigue-container").style.opacity = "1";
        window.mettreAJourJaugeFatigue(0);

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

        competencesToRender.forEach(comp => {
            const data = comp.data;
            const idCarte = comp.id;
            const titre = data.Nom || "Technique";
            const initiative = data.Initiative || 0;

            htmlDeck += `
            <div style="height: 100px; margin-bottom: -20px;">
                <div id="combat-carte-${idCarte}" class="banniere-carte-combat"
                     onclick="event.stopPropagation(); window.gererClicCarteCombat('${idCarte}')"
                     data-actif="false"
                     style="position: relative; width: 450px; height: 160px; display: flex; align-items: center; cursor: pointer; transition: filter 0.2s ease; transform: scale(0.75); transform-origin: left top; z-index: 2;"
                     onmouseover="this.style.zIndex='100';"
                     onmouseout="this.style.zIndex='2';">
                     
                    <div style="position: absolute; top: 49px; bottom: 58px; left: 63px; right: 7px; z-index: 1; border-radius: 0 15px 15px 0; background-color: ${window.COULEUR_PERSO_COURANT};"></div>
                    <div id="cadre-combat-${idCarte}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: url('${IMAGE_CADRE_NORMAL}'); background-size: contain; background-position: left center; background-repeat: no-repeat; z-index: 2; filter: drop-shadow(0px 6px 4px rgba(0,0,0,0.6)); transition: background-image 0.2s ease;"></div>
                    <div style="position: absolute; top: 44%; transform: translateY(-50%); left: 6px; width: 69px; text-align: center; color: #e0d0b0; font-family: 'Cinzel', serif; font-size: 30px; font-weight: bold; z-index: 3; text-shadow: 2px 2px 5px black; pointer-events: none;">${initiative}</div>
                    <div style="position: absolute; top: 48%; transform: translateY(-50%); left: 76px; right: 120px; text-align: left; color: #e0d0b0; font-family: 'Cinzel', serif; font-size: 17px; text-transform: uppercase; font-weight: bold; z-index: 3; text-shadow: 1px 1px 3px black; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;">${titre}</div>
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
    // 🔇 Son volontairement supprimé ici

    const IMAGE_CADRE_NORMAL = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png";
    const IMAGE_CADRE_SELECTIONNE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1783286721/ban_cible_pdpnad.png";

    document.querySelectorAll('.banniere-carte-combat').forEach(el => {
        el.dataset.actif = "false";
        const cadre = el.querySelector('[id^="cadre-combat-"]');
        if (cadre) cadre.style.backgroundImage = `url('${IMAGE_CADRE_NORMAL}')`;
    });

    if (window.CARTE_EN_APERCU !== idCarte) {
        window.CARTE_EN_APERCU = idCarte;
        
        // 1. Allumage de la bannière
        const carteDiv = document.getElementById(`combat-carte-${idCarte}`);
        const cadreDiv = document.getElementById(`cadre-combat-${idCarte}`);
        if (carteDiv && cadreDiv) {
            carteDiv.dataset.actif = "true";
            cadreDiv.style.backgroundImage = `url('${IMAGE_CADRE_SELECTIONNE}')`;
        }
        
        // 2. Récupération du coût de fatigue et animation de la jauge
        const cout = window.COMPETENCES_CACHE[idCarte]?.Fatigue || 0;
        window.mettreAJourJaugeFatigue(cout);
        
        // 3. Affichage HD
        if (typeof window.afficherApercuCarteHD === "function") {
            window.afficherApercuCarteHD(idCarte);
            setTimeout(() => {
                const hdCard = document.getElementById("apercu-carte-hd-competence");
                if (hdCard) {
                    hdCard.style.left = "calc(3vw + 350px)"; 
                    hdCard.style.top = "15vh";               
                    hdCard.style.transform = "none";         
                }
            }, 10); 
        }
    } else {
        // Si on reclique sur la même, on referme tout
        window.mettreAJourJaugeFatigue(0);
        if (typeof window.masquerApercuCarteHD === "function") {
            window.masquerApercuCarteHD();
        }
    }
};

// Clic global (Fermeture dans le vide)
document.addEventListener("click", function(event) {
    const btnFermer = document.getElementById('btn-fermer-combat');
    if (!btnFermer || btnFermer.style.display === 'none') return;

    const clicSurBanniere = event.target.closest('.banniere-carte-combat');
    const clicSurCarteHD = event.target.closest('#apercu-carte-hd-competence');
    const clicSurFleche = event.target.closest('.btn-combat-switch'); 
    
    if (!clicSurBanniere && !clicSurCarteHD && !clicSurFleche && window.CARTE_EN_APERCU) {
        window.mettreAJourJaugeFatigue(0); // Réinitialise la jauge
        
        if (typeof window.masquerApercuCarteHD === "function") {
            window.masquerApercuCarteHD();
        }
        
        const IMAGE_CADRE_NORMAL = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png";
        document.querySelectorAll('.banniere-carte-combat').forEach(el => {
            el.dataset.actif = "false";
            const cadre = el.querySelector('[id^="cadre-combat-"]');
            if (cadre) cadre.style.backgroundImage = `url('${IMAGE_CADRE_NORMAL}')`;
        });
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
        window.PLATEAU_VTT.renderMap();
        window.centrerPlateau();
        window.activerPanZoom();
    }
};

window.centrerPlateau = function() {
    const conteneur = document.getElementById("transform-plateau");
    if (!conteneur) return;
    
    // On s'adapte à la taille physique du conteneur (qui va changer selon l'image)
    const w = conteneur.offsetWidth || 1800;
    const h = conteneur.offsetHeight || 1800;
    
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    
    window.VTT_SCALE = Math.min(winW / w, winH / h) * 0.9; 
    
    window.VTT_POS_X = (winW - (w * window.VTT_SCALE)) / 2;
    window.VTT_POS_Y = (winH - (h * window.VTT_SCALE)) / 2;
    
    window.appliquerTransformPlateau();
};

window.appliquerTransformPlateau = function() {
    const conteneur = document.getElementById("transform-plateau");
    if (conteneur) {
        conteneur.style.transform = `translate(${window.VTT_POS_X}px, ${window.VTT_POS_Y}px) scale(${window.VTT_SCALE})`;
    }
};

window.activerPanZoom = function() {
    const conteneur = document.getElementById("conteneur-plateau-vtt");
    if (!conteneur) return;

    // --- ZOOM (Molette PC) ---
    conteneur.addEventListener("wheel", (e) => {
        e.preventDefault();
        const zoomIntensity = 0.08;
        const wheel = e.deltaY < 0 ? 1 : -1;
        const zoomFactor = Math.exp(wheel * zoomIntensity);
        
        // Cible de la souris pour zoomer vers le curseur (et non vers le coin)
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        window.VTT_POS_X = mouseX - (mouseX - window.VTT_POS_X) * zoomFactor;
        window.VTT_POS_Y = mouseY - (mouseY - window.VTT_POS_Y) * zoomFactor;
        window.VTT_SCALE *= zoomFactor;
        
        window.appliquerTransformPlateau();
    }, { passive: false });

    // --- PANNING SOURIS (Glisser sur PC) ---
    conteneur.addEventListener("mousedown", (e) => {
        // Clic anywhere dans le conteneur VTT (fond, canvas, transform…)
        if (conteneur.contains(e.target)) {
            isDraggingVTT = true;
            startDragX = e.clientX - window.VTT_POS_X;
            startDragY = e.clientY - window.VTT_POS_Y;
            conteneur.style.cursor = "grabbing";
        }
    });

    window.addEventListener("mousemove", (e) => {
        if (!isDraggingVTT) return;
        window.VTT_POS_X = e.clientX - startDragX;
        window.VTT_POS_Y = e.clientY - startDragY;
        window.appliquerTransformPlateau();
    });

    window.addEventListener("mouseup", () => {
        isDraggingVTT = false;
        if (conteneur) conteneur.style.cursor = "grab";
    });

    // --- PANNING TACTILE (Glisser 1 doigt sur iPad) ---
    conteneur.addEventListener("touchstart", (e) => {
        if (e.touches.length === 1 && conteneur.contains(e.target)) {
            isDraggingVTT = true;
            startDragX = e.touches[0].clientX - window.VTT_POS_X;
            startDragY = e.touches[0].clientY - window.VTT_POS_Y;
        }
    }, { passive: false });

    conteneur.addEventListener("touchmove", (e) => {
        if (!isDraggingVTT || e.touches.length !== 1) return;
        if (e.cancelable) e.preventDefault(); // Bloque le rebond natif d'Apple Safari
        window.VTT_POS_X = e.touches[0].clientX - startDragX;
        window.VTT_POS_Y = e.touches[0].clientY - startDragY;
        window.appliquerTransformPlateau();
    }, { passive: false });

    conteneur.addEventListener("touchend", () => {
        isDraggingVTT = false;
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
        menuDev.classList.add("ouvert");
    }
};

window.fermerMenusCoulissantsCombat = function(e) {
    // Petit son optionnel lors de la fermeture avec le bouton "Fermer"
    const evt = e || (typeof window.event !== 'undefined' ? window.event : null);
    if (evt && evt.target && evt.target.tagName === 'BUTTON' && typeof window.jouerSonClic === "function") {
        window.jouerSonClic();
    }
    const menuDev = document.getElementById("menu-dev-combat");
    if (menuDev) menuDev.classList.remove("ouvert");
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
    
    // On force la création du canevas en arrière-plan dès le début
    if (typeof window.initialiserPlateau === "function") {
        window.initialiserPlateau();
    }

    window.UNSUBSCRIBE_VTT = onSnapshot(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), (snap) => {
        if (snap.exists()) {
            const data = snap.data();
            if (data.URL_Map && data.Taille_Hex) {
                // Va télécharger l'image et tracer les hexagones en silence
                window.appliquerTerrain(data.URL_Map, data.Taille_Hex);
            }
        }
    });
};

// La fonction qui peint l'image et l'échelle (Appelée par l'écouteur)
window.appliquerTerrain = function(url, scale) {
    if (!window.PLATEAU_VTT) return;
    const imgEl = document.getElementById("image-map-vtt");
    const conteneurTransform = document.getElementById("transform-plateau");
    if (!imgEl || !conteneurTransform) return;
    
    // Anti-scintillement : si on est déjà à la bonne image et bonne taille, on ignore
    if (urlsVTTIdentiques(imgEl.src, url) && window.PLATEAU_VTT.hexSize === scale) return;

    // 1. On applique mathématiquement l'échelle
    window.PLATEAU_VTT.hexSize = scale;
    window.PLATEAU_VTT.hexWidth = 2 * scale;
    window.PLATEAU_VTT.hexHeight = Math.sqrt(3) * scale;
    
    const label = document.getElementById("label-taille-hexa");
    if (label) label.innerText = scale;

    const appliquerMapChargee = function() {
        imgEl.style.display = "block";
        const w = imgEl.naturalWidth;
        const h = imgEl.naturalHeight;
        conteneurTransform.style.width = w + "px";
        conteneurTransform.style.height = h + "px";
        window.PLATEAU_VTT.resize(w, h);
        window.PLATEAU_VTT.renderMap();
        window.centrerPlateau();
    };

    // 2. Si l'image a changé, on la charge
    if (!urlsVTTIdentiques(imgEl.src, url) && url !== "") {
        imgEl.onload = appliquerMapChargee;
        imgEl.src = url;
        // Si elle est déjà en cache, on bypass le onload
        if (imgEl.complete && imgEl.naturalWidth > 0) appliquerMapChargee();
    } else if (url !== "") {
        // 3. Si c'est juste un changement d'échelle, on repeint direct
        window.PLATEAU_VTT.renderMap();
    }
};

// Pousse la Map dans la BDD (qui déclenchera l'écouteur chez tout le monde)
window.chargerMapTest = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE) return;
    
    const imgUrl = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1786366789/port_ntpq8p.png";
    const scale = window.PLATEAU_VTT ? window.PLATEAU_VTT.hexSize : 60;
    
    console.log("[VTT] Envoi de la map en base de données...");

    try {
        await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
            URL_Map: imgUrl,
            Taille_Hex: scale
        }, { merge: true });
    } catch(e) {
        console.error("Erreur synchro map :", e);
    }
};

// Pousse l'échelle sélectionnée dans la BDD
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
        
        // Retour visuel pour le MJ
        if (btn) {
            btn.innerText = "✔️";
            setTimeout(() => btn.innerText = "OK", 1500);
        }
    } catch(e) {
        console.error("Erreur synchro échelle :", e);
        if (btn) btn.innerText = "❌";
    }
};

window.changerTailleHexa = function(delta) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.PLATEAU_VTT) return;
    
    let nouvelleTaille = window.PLATEAU_VTT.hexSize + delta;
    
    if (nouvelleTaille < 20) nouvelleTaille = 20; 
    if (nouvelleTaille > 250) nouvelleTaille = 250; 
    
    // Modification locale uniquement (pour visualiser avant de valider)
    window.PLATEAU_VTT.hexSize = nouvelleTaille;
    window.PLATEAU_VTT.hexWidth = 2 * nouvelleTaille;
    window.PLATEAU_VTT.hexHeight = Math.sqrt(3) * nouvelleTaille;
    
    const label = document.getElementById("label-taille-hexa");
    if (label) label.innerText = nouvelleTaille;
    window.PLATEAU_VTT.renderMap();
};
