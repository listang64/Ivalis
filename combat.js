// =========================================================================
//  IVALIS - MODULE DE COMBAT (INTERFACE DE BASE)
// =========================================================================

import { db } from "./firebase-config.js";
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

window.COMBAT_PERSOS_JOUEUR = [];
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

    window.initialiserPersosCombat();
};

window.fermerCombat = function() {
    if (typeof window.jouerSonSurvolParchemin === "function") {
        window.jouerSonSurvolParchemin();
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

window.afficherPersoCombatActuel = async function() {
    const divNom = document.getElementById("combat-nom-perso");
    if (!divNom) return;

    if (window.COMBAT_PERSOS_JOUEUR.length === 0) {
        divNom.innerText = "Aucun héros lié";
        divNom.style.color = "#888";
        document.getElementById("combat-liste-competences").innerHTML = "";
        return;
    }

    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
    const prenom = persoActuel.prenom || "";
    const nom = persoActuel.nom || "";
    
    divNom.innerText = (prenom + " " + nom).trim();
    divNom.style.color = persoActuel.couleur || "#e8d5a5";

    // Chargement de ses compétences équipées
    await window.chargerCompetencesCombat(persoActuel.idPersonnage, persoActuel.couleur);
};

// =========================================================================
//  CHARGEMENT ET AFFICHAGE DU DECK (BANNIÈRES)
// =========================================================================

window.chargerCompetencesCombat = async function(idPersonnage, couleur) {
    const listeDiv = document.getElementById("combat-liste-competences");
    listeDiv.innerHTML = "<div style='color:#a89f91; font-family: Almendra, serif; font-size:16px; margin-top: 10px; font-style: italic;'>Feuilletage du grimoire...</div>";

    try {
        const persoSnap = await getDoc(doc(db, "Personnages", idPersonnage));
        if (!persoSnap.exists()) return;
        const deck = persoSnap.data().Deck_Equipe || [];

        if (deck.length === 0) {
            listeDiv.innerHTML = "<div style='color:#a89f91; font-family: Almendra, serif; font-size:16px; margin-top: 10px; font-style: italic;'>Aucune compétence mémorisée.</div>";
            return;
        }

        const compSnap = await getDocs(collection(db, "Personnages", idPersonnage, "Competences"));
        let competencesToRender = [];
        
        if (!window.COMPETENCES_CACHE) window.COMPETENCES_CACHE = {};

        compSnap.forEach(docSnap => {
            const data = docSnap.data();
            window.COMPETENCES_CACHE[docSnap.id] = data; 
            if (deck.includes(docSnap.id)) {
                competencesToRender.push({ id: docSnap.id, data: data });
            }
        });

        competencesToRender.sort((a, b) => (b.data.Initiative || 0) - (a.data.Initiative || 0));

        window.COULEUR_PERSO_COURANT = couleur || "#4a1c1c";

        let htmlDeck = "";
        const IMAGE_CADRE_NORMAL = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png";

        // 4. Génération du HTML avec TES réglages au pixel près
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
                     style="position: relative; width: 450px; height: 160px; display: flex; align-items: center; cursor: pointer; transform: scale(0.75); transform-origin: left top; z-index: 2;"
                     onmouseover="this.style.zIndex='100';"
                     onmouseout="this.style.zIndex='2';">
                     
                    <!-- 🟥 1. LE BLOC DE COULEUR -->
                    <div style="position: absolute; top: 49px; bottom: 58px; left: 63px; right: 7px; z-index: 1; border-radius: 0 15px 15px 0; background-color: ${window.COULEUR_PERSO_COURANT};"></div>
                    
                    <!-- L'image de fond de la bannière (AVEC UN ID POUR CHANGER L'IMAGE) -->
                    <div id="cadre-combat-${idCarte}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: url('${IMAGE_CADRE_NORMAL}'); background-size: contain; background-position: left center; background-repeat: no-repeat; z-index: 2; filter: drop-shadow(0px 6px 4px rgba(0,0,0,0.6)); transition: background-image 0.2s ease;"></div>
                    
                    <!-- 🟩 2. LE CHIFFRE D'INITIATIVE -->
                    <div style="position: absolute; top: 44%; transform: translateY(-50%); left: 6px; width: 69px; text-align: center; color: #e0d0b0; font-family: 'Cinzel', serif; font-size: 30px; font-weight: bold; z-index: 3; text-shadow: 2px 2px 5px black; pointer-events: none;">${initiative}</div>
                    
                    <!-- 🟦 3. LE NOM DE LA COMPÉTENCE -->
                    <div style="position: absolute; top: 48%; transform: translateY(-50%); left: 76px; right: 120px; text-align: left; color: #e0d0b0; font-family: 'Cinzel', serif; font-size: 17px; text-transform: uppercase; font-weight: bold; z-index: 3; text-shadow: 1px 1px 3px black; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;">${titre}</div>
                </div>
            </div>
            `;
        });

        listeDiv.innerHTML = htmlDeck;

    } catch (e) {
        console.error("Erreur lors du chargement des compétences de combat :", e);
        listeDiv.innerHTML = "<div style='color:red; font-size:14px;'>Interférence magique.</div>";
    }
};

// =========================================================================
//  INTERACTIONS AVEC LES CARTES (IMAGE ET DÉPLACEMENT CARTE HD)
// =========================================================================

window.gererClicCarteCombat = function(idCarte) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    const IMAGE_CADRE_NORMAL = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png";
    const IMAGE_CADRE_SELECTIONNE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1783286721/ban_cible_pdpnad.png";

    // 1. On nettoie toutes les bannières (remise à zéro de l'image)
    document.querySelectorAll('.banniere-carte-combat').forEach(el => {
        el.dataset.actif = "false";
        const cadre = el.querySelector('[id^="cadre-combat-"]');
        if (cadre) cadre.style.backgroundImage = `url('${IMAGE_CADRE_NORMAL}')`;
    });

    if (window.CARTE_EN_APERCU !== idCarte) {
        // 2. On allume la nouvelle bannière
        window.CARTE_EN_APERCU = idCarte;
        const carteDiv = document.getElementById(`combat-carte-${idCarte}`);
        const cadreDiv = document.getElementById(`cadre-combat-${idCarte}`);
        
        if (carteDiv && cadreDiv) {
            carteDiv.dataset.actif = "true";
            cadreDiv.style.backgroundImage = `url('${IMAGE_CADRE_SELECTIONNE}')`;
        }
        
        // 3. On affiche la carte HD et on la positionne manuellement
        if (typeof window.afficherApercuCarteHD === "function") {
            window.afficherApercuCarteHD(idCarte);
            
            // Un mini timeout permet d'attendre que la carte soit injectée dans le DOM avant de la bouger
            setTimeout(() => {
                const hdCard = document.getElementById("apercu-carte-hd-competence");
                if (hdCard) {
                    hdCard.style.left = "calc(3vw + 350px)"; // Se cale parfaitement à droite des bannières
                    hdCard.style.top = "15vh";               // Aligné vers le haut
                    hdCard.style.transform = "none";         // Enlève l'ancien centrage Y
                }
            }, 10); 
        }
    } else {
        // 3. Si on clique sur la même bannière, on referme
        if (typeof window.masquerApercuCarteHD === "function") {
            window.masquerApercuCarteHD();
        }
    }
};

// Écouteur global pour fermer la carte si on clique n'importe où ailleurs sur l'écran
document.addEventListener("click", function(event) {
    const btnFermer = document.getElementById('btn-fermer-combat');
    if (!btnFermer || btnFermer.style.display === 'none') return;

    const clicSurBanniere = event.target.closest('.banniere-carte-combat');
    const clicSurCarteHD = event.target.closest('#apercu-carte-hd-competence');
    const clicSurFleche = event.target.closest('.btn-combat-switch'); // On ignore le clic sur les flèches
    
    // Si on clique dans le vide ET qu'une carte est affichée, on la ferme
    if (!clicSurBanniere && !clicSurCarteHD && !clicSurFleche && window.CARTE_EN_APERCU) {
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
