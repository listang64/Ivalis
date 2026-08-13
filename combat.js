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
        
        // On cache le nouveau conteneur
        const jauges = document.getElementById("combat-jauges-container");
        if (jauges) jauges.style.opacity = "0";
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
            imgPerso.style.opacity = "0.5"; // L'avatar s'affiche à 50%
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
        
        window.COMBAT_FATIGUE_MAX = parseInt(persoActuel.fatigueMax) || 100;
        window.COMBAT_FATIGUE_ACTUELLE = parseInt(persoActuel.fatigueActuelle) || window.COMBAT_FATIGUE_MAX;
        
        // Initialisation des PV Actuels (Liés à la BDD + Modificateurs DEV)
        window.COMBAT_PV_MAX = (parseInt(persoActuel.PV_Max) || 1) + (parseInt(persoActuel.Dev_Mod_PV) || 0);
        window.COMBAT_PV_ACTUELS = persoActuel.PV_Actuels !== undefined ? parseInt(persoActuel.PV_Actuels) : window.COMBAT_PV_MAX;

        // Affichage de la boîte superposée
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

        // =========================================================================
        // 🔻 RÉGLAGE DE LA DISTANCE ENTRE LES BANNIÈRES 🔻
        // Modifie cette valeur manuellement pour écarter ou resserrer les bannières.
        // =========================================================================
        const ESPACEMENT_BANNIERES = -45;

        competencesToRender.forEach(comp => {
            const data = comp.data;
            const idCarte = comp.id;
            const titre = data.Nom || "Technique";
            const initiative = data.Initiative || 0;

            htmlDeck += `
            <div style="position: relative; height: 100px; margin-bottom: ${ESPACEMENT_BANNIERES}px; transition: margin 0.2s ease;">
                
                <!-- ========================================================================= -->
                <!-- 🔻 HITBOX (ZONE DE CLIC INVISIBLE) 🔻                                     -->
                <!-- ========================================================================= -->
                <div onclick="event.stopPropagation(); window.gererClicCarteCombat('${idCarte}')"
                     onmouseover="document.getElementById('combat-carte-${idCarte}').style.transform='scale(0.75) translateX(15px)'; document.getElementById('combat-carte-${idCarte}').style.zIndex='100';"
                     onmouseout="document.getElementById('combat-carte-${idCarte}').style.transform='scale(0.75) translateX(0px)'; document.getElementById('combat-carte-${idCarte}').style.zIndex='2';"
                     style="position: absolute; top: 35px; left: 0; width: 335px; height: 40px; z-index: 10; cursor: pointer;">
                </div>

                <!-- ========================================================================= -->
                <!-- 🎨 VISUELS : NE MODIFIE PLUS LES DIMENSIONS ICI (Elles fixent l'image)    -->
                <!-- ========================================================================= -->
                <div id="combat-carte-${idCarte}" class="banniere-carte-combat" data-actif="false"
                     style="position: absolute; top: 0; left: 0; width: 450px; height: 160px; pointer-events: none; transition: filter 0.2s ease, transform 0.2s ease; transform: scale(0.75); transform-origin: left top; z-index: 2;">
                     
                    <div style="position: absolute; top: 49px; bottom: 58px; left: 63px; right: 7px; z-index: 1; border-radius: 0 15px 15px 0; background-color: ${window.COULEUR_PERSO_COURANT};"></div>
                    <div id="cadre-combat-${idCarte}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: url('${IMAGE_CADRE_NORMAL}'); background-size: contain; background-position: left center; background-repeat: no-repeat; z-index: 2; filter: drop-shadow(0px 6px 4px rgba(0,0,0,0.6)); transition: background-image 0.2s ease;"></div>
                    <div style="position: absolute; top: 44%; transform: translateY(-50%); left: 6px; width: 69px; text-align: center; color: #e0d0b0; font-family: 'Cinzel', serif; font-size: 30px; font-weight: bold; z-index: 3; text-shadow: 2px 2px 5px black;">${initiative}</div>
                    <div style="position: absolute; top: 48%; transform: translateY(-50%); left: 76px; right: 120px; text-align: left; color: #e0d0b0; font-family: 'Cinzel', serif; font-size: 17px; text-transform: uppercase; font-weight: bold; z-index: 3; text-shadow: 1px 1px 3px black; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${titre}</div>
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
        
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        window.VTT_POS_X = mouseX - (mouseX - window.VTT_POS_X) * zoomFactor;
        window.VTT_POS_Y = mouseY - (mouseY - window.VTT_POS_Y) * zoomFactor;
        window.VTT_SCALE *= zoomFactor;
        
        window.appliquerTransformPlateau();
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
                } else {
                    isDraggingVTT = true;
                    startDragX = e.touches[0].clientX - window.VTT_POS_X;
                    startDragY = e.touches[0].clientY - window.VTT_POS_Y;
                }
            } else if (e.touches.length === 2) {
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
                const zoomFactor = currentDist / lastPinchDist;
                window.VTT_POS_X += currentCenter.x - lastPinchCenter.x;
                window.VTT_POS_Y += currentCenter.y - lastPinchCenter.y;
                window.VTT_POS_X = currentCenter.x - (currentCenter.x - window.VTT_POS_X) * zoomFactor;
                window.VTT_POS_Y = currentCenter.y - (currentCenter.y - window.VTT_POS_Y) * zoomFactor;
                window.VTT_SCALE *= zoomFactor;
                
                if (window.VTT_SCALE < 0.1) window.VTT_SCALE = 0.1;
                if (window.VTT_SCALE > 5) window.VTT_SCALE = 5;

                window.appliquerTransformPlateau();
            }

            lastPinchDist = currentDist;
            lastPinchCenter = currentCenter;
        }
    }, { passive: false });

    conteneur.addEventListener("touchend", (e) => {
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
    
    // NOUVEAU : Application de l'opacité
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
    };

    if (!urlsVTTIdentiques(imgEl.src, url) && url !== "") {
        imgEl.onload = appliquerMapChargee;
        imgEl.src = url;
        if (imgEl.complete && imgEl.naturalWidth > 0) appliquerMapChargee();
    } else {
        // Changement d'échelle/opacité seul, ou repeinture sans nouvelle image
        window.PLATEAU_VTT.renderMap();
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
