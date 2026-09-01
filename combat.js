import { db } from "./firebase-config.js";
import { doc, setDoc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

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

    // Aucune des scenes surveillees par cette veille n'est visible en combat : on la coupe
    if (typeof window.suspendreSynchroCanvas === "function") window.suspendreSynchroCanvas();

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

    // On quitte le combat : la veille redevient utile pour les autres scenes
    if (typeof window.reprendreSynchroCanvas === "function") window.reprendreSynchroCanvas();
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
        // Ce texte est plus long que les prénoms habituels : taille réduite pour ne pas être tronqué
        divNom.style.fontSize = "24px";
        divNom.style.letterSpacing = "1px";

        const divTypeVide = document.getElementById("combat-type-monstre");
        if (divTypeVide) divTypeVide.style.display = "none";

        document.getElementById("combat-liste-competences").innerHTML = "";
        if (imgPerso) {
            imgPerso.style.opacity = "0";
            imgPerso.style.height = "100%"; // Sinon reste figé à 40vh si "Repos Long" était affiché avant
        }

        // Le panneau "Repos Long" est un aperçu lié au personnage affiché : sans personnage, il ne
        // doit plus rester visible (sinon il reste figé à l'écran, superposé au texte "Aucun héros lié").
        const divReposVide = document.getElementById("apercu-repos-long-ui");
        if (divReposVide) {
            divReposVide.style.opacity = "0";
            divReposVide.style.left = "50px";
        }

        const jauges = document.getElementById("combat-jauges-container");
        if (jauges) jauges.style.opacity = "0";
        const divEtatsVide = document.getElementById("combat-etats-alteres");
        if (divEtatsVide) divEtatsVide.innerHTML = "";
        return;
    }

    const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
    const prenom = persoActuel.prenom || "";
    const nom = persoActuel.nom || "";
    const nomComplet = (prenom + " " + nom).trim();

    divNom.innerText = nomComplet;

    // Type d'ennemi sous le nom : n'a de sens que pour un monstre (DPS CAC, TANK CAC...).
    const divTypeMonstre = document.getElementById("combat-type-monstre");
    if (divTypeMonstre) {
        if (persoActuel.estMonstre && persoActuel.Archetype) {
            const palier = persoActuel.Palier ? ` — ${persoActuel.Palier}` : "";
            divTypeMonstre.innerText = persoActuel.Archetype + palier;
            divTypeMonstre.style.display = "block";
        } else {
            divTypeMonstre.style.display = "none";
        }
    }

    if (!document.getElementById("combat-etats-alteres")) {
        const divEtats = document.createElement("div");
        divEtats.id = "combat-etats-alteres";
        divNom.parentElement.parentElement.insertBefore(divEtats, divNom.parentElement.nextSibling);
    }

    // On restaure l'effet doré, au cas où "Aucun héros" l'aurait modifié
    divNom.style.background = "linear-gradient(135deg, #fbf5bd 0%, #c2a878 25%, #5c3a21 50%, #e8d5a5 75%, #ffffff 100%)";
    divNom.style.webkitBackgroundClip = "text";
    divNom.style.webkitTextFillColor = "transparent";

    // Taille et espacement des lettres réduits pour les noms longs (ex: "Illusion de X") : sinon
    // le texte se tronque avec "..." (white-space: nowrap + text-overflow: ellipsis sur ce bloc).
    const longueur = nomComplet.length;
    if (longueur > 26) {
        divNom.style.fontSize = "22px";
        divNom.style.letterSpacing = "0.5px";
    } else if (longueur > 20) {
        divNom.style.fontSize = "28px";
        divNom.style.letterSpacing = "1px";
    } else if (longueur > 14) {
        divNom.style.fontSize = "36px";
        divNom.style.letterSpacing = "2px";
    } else {
        divNom.style.fontSize = "46px";
        divNom.style.letterSpacing = "3px";
    }

    if (imgPerso) {
        if (persoActuel.urlCloudinary && persoActuel.urlCloudinary !== "") {
            imgPerso.src = typeof window.redimensionnerImageCloudinary === "function"
                ? window.redimensionnerImageCloudinary(persoActuel.urlCloudinary, 900)
                : persoActuel.urlCloudinary;
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

    // 🔻 AFFICHAGE DES ÉTATS ALTÉRÉS DANS LA DIV DÉDIÉE 🔻
    const conteneurEtats = document.getElementById("combat-etats-alteres");
    if (conteneurEtats) {
        if (persoActuel.Etats_Alteres && persoActuel.Etats_Alteres.length > 0) {
            let etatsHtml = `<div style="display: flex; gap: 15px; justify-content: center; margin-top: 5px;">`;
            persoActuel.Etats_Alteres.forEach(etat => {
                etatsHtml += `
                    <div style="position: relative; cursor: pointer;" 
                         onmouseenter="if(window.matchMedia('(hover: hover)').matches) this.querySelector('.popup-etat').style.display='block'" 
                         onmouseleave="if(window.matchMedia('(hover: hover)').matches) this.querySelector('.popup-etat').style.display='none'"
                         onclick="const p = this.querySelector('.popup-etat'); document.querySelectorAll('.popup-etat').forEach(el => { if(el !== p) el.style.display='none'; }); p.style.display = p.style.display === 'block' ? 'none' : 'block'; event.stopPropagation();">
                        <img src="${etat.icone}" style="width: 72px; height: auto; border: none; background: transparent; box-shadow: none; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.8));">
                        <div class="popup-etat" style="display: none; position: absolute; top: 80px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.95); border: 1px solid #c2a878; padding: 10px; border-radius: 6px; width: max-content; z-index: 1000; color: white; font-size: 13px; font-family: 'Almendra', serif; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.8);">
                            <strong style="color: #ffaa00; font-family: 'Cinzel', serif;">${etat.nom} (${etat.duree} tours)</strong><br>
                            <span style="color: #ccc;">${etat.desc}</span>
                        </div>
                    </div>
                `;
            });
            etatsHtml += `</div>`;
            conteneurEtats.innerHTML = etatsHtml;
        } else {
            conteneurEtats.innerHTML = "";
        }
    }
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
                    <div class="texte-nom-banniere titre-auto-reduit" data-taille-max="17" style="position: absolute; top: 48%; transform: translateY(-50%); left: 76px; right: 120px; text-align: left; color: ${couleurTexte}; font-family: 'Cinzel', serif; font-size: 17px; text-transform: uppercase; font-weight: bold; z-index: 3; text-shadow: 1px 1px 3px black; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${titre}</div>
                </div>
            </div>
            `;
        });

        listeDiv.innerHTML = htmlDeck;
        // Les noms de technique trop longs rétrécissent au lieu d'être coupés.
        if (typeof window.ajusterTitresBannieres === "function") window.ajusterTitresBannieres(listeDiv);

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

    // 🔻 NOUVEAU : Fermeture des popups d'états altérés tactiles si on clique dans le vide
    if (!event.target.closest('#combat-etats-alteres')) {
        document.querySelectorAll('.popup-etat').forEach(el => el.style.display = 'none');
    }

    const clicSurBanniere = event.target.closest('.banniere-carte-combat');
    const clicSurCarteHD = event.target.closest('#apercu-carte-hd-competence');
    const clicSurFleche = event.target.closest('.btn-combat-switch'); 
    
    if (!clicSurBanniere && !clicSurCarteHD && !clicSurFleche && window.CARTE_EN_APERCU) {
        
        // 🔻 NOUVEAU : Annule le ciblage en cours si on clique dans le vide
        if (typeof window.nettoyerCiblage === "function") window.nettoyerCiblage();

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
    
    window.VTT_POS_X = winW - (w * window.VTT_SCALE); // Bord droit de la carte collé au bord droit de l'écran à l'entrée
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
let dernierHexPeint = null;
let framePeintureVTT = null;

// Regroupe tous les renderMap() d'un même geste en un seul par frame (au lieu d'un par
// evenement pointer/touch, qui peut arriver a 60+ fois/seconde pendant qu'on peint).
function demanderRenderPeintureVTT() {
    if (framePeintureVTT) return;
    framePeintureVTT = requestAnimationFrame(() => {
        framePeintureVTT = null;
        if (window.PLATEAU_VTT) window.PLATEAU_VTT.renderMap();
    });
}

// Applique l'outil actif (gomme/murs/difficile) sur une case, en ignorant les evenements
// repetes sur la MEME case (le doigt qui bouge de quelques pixels sans changer d'hexagone).
function peindreHexVTT(hex, forcer) {
    if (!hex) return;
    const cle = hex.q + "," + hex.r;
    if (!forcer && cle === dernierHexPeint) return;
    dernierHexPeint = cle;

    if (window.VTT_MODE_EFFACEMENT) {
        window.PLATEAU_VTT.setCaseState(hex.q, hex.r, { isDeleted: currentPaintAction === 'delete' });
    } else if (window.VTT_MODE_MURS) {
        window.PLATEAU_VTT.setCaseState(hex.q, hex.r, { isBlocked: currentPaintAction === 'block' });
    } else if (window.VTT_MODE_DIFFICILE) {
        window.PLATEAU_VTT.setCaseState(hex.q, hex.r, { isDifficult: currentPaintAction === 'difficult' });
    }
    demanderRenderPeintureVTT();
}

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
                dernierHexPeint = null;
                const hex = getHexFromMouse(e.clientX, e.clientY);
                if (hex) {
                    const state = window.PLATEAU_VTT.getCaseState(hex.q, hex.r);
                    if (window.VTT_MODE_EFFACEMENT) currentPaintAction = state.isDeleted ? 'restore' : 'delete';
                    else if (window.VTT_MODE_MURS) currentPaintAction = state.isBlocked ? 'unblock' : 'block';
                    else if (window.VTT_MODE_DIFFICILE) currentPaintAction = state.isDifficult ? 'undifficult' : 'difficult';
                    peindreHexVTT(hex, true);
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
            peindreHexVTT(getHexFromMouse(e.clientX, e.clientY), false);
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
                    dernierHexPeint = null;

                    // NOUVEAU : Délai de 100ms pour laisser le temps au 2ème doigt de se poser (Pinch to zoom)
                    window.vttPaintTimeout = setTimeout(() => {
                        if (isPaintingVTT && window.PLATEAU_VTT) {
                            const hex = getHexFromMouse(e.touches[0].clientX, e.touches[0].clientY);
                            if (hex) {
                                const state = window.PLATEAU_VTT.getCaseState(hex.q, hex.r);
                                if (window.VTT_MODE_EFFACEMENT) currentPaintAction = state.isDeleted ? 'restore' : 'delete';
                                else if (window.VTT_MODE_MURS) currentPaintAction = state.isBlocked ? 'unblock' : 'block';
                                else if (window.VTT_MODE_DIFFICILE) currentPaintAction = state.isDifficult ? 'undifficult' : 'difficult';
                                peindreHexVTT(hex, true);
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
                peindreHexVTT(getHexFromMouse(e.touches[0].clientX, e.touches[0].clientY), false);
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

            // 🔻 NOUVEAU : Zones persistantes (Persistance de terrain) 🔻
            window.ZONES_PERSISTANTES = data.Zones_Persistantes || {};
            if (typeof window.appliquerZonesPersistantes === "function") {
                window.appliquerZonesPersistantes();
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

    // Fond de carte de combat : souvent une image generee en tres haute resolution, inutile
    // de la faire decoder a taille reelle par l'iPad. On compare/assigne toujours CETTE
    // version (jamais l'URL brute) pour que le test anti-rechargement reste cohérent.
    const url2 = url && typeof window.redimensionnerImageCloudinary === "function"
        ? window.redimensionnerImageCloudinary(url, 2200)
        : url;

    // Anti-scintillement global (URL, Taille, Opacité)
    if (urlsVTTIdentiques(imgEl.src, url2) && window.PLATEAU_VTT.hexSize === scale && Math.abs(window.PLATEAU_VTT.gridOpacity - opacity) < 0.001) return;

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

    if (!urlsVTTIdentiques(imgEl.src, url2) && url !== "") {
        imgEl.onload = appliquerMapChargee;
        imgEl.src = url2;
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
    
    const imgUrl = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1787867966/IMG_2048_fhzyrz.png";
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

        // Immobilisation et Paralysie bloquent tout déplacement volontaire (mais pas les
        // déplacements subis comme Poussée/Traction/Peur, qui ne passent pas par ce clic de
        // tracé de chemin).
        const estImmobilise = persoSelectionne && persoSelectionne.Etats_Alteres
            && persoSelectionne.Etats_Alteres.some(e => e.nom === "Immobilisation" || e.nom === "Paralysie");

        if (estMonTour && estImmobilise && !window.VTT_MODE_DEPLACEMENT) {
            const tk = window.TOKENS_VTT_DATA[window.TOKEN_SELECTIONNE];
            const estParalyse = persoSelectionne.Etats_Alteres.some(e => e.nom === "Paralysie");
            if (tk && typeof window.afficherMessageFlottantHex === "function") {
                window.afficherMessageFlottantHex(tk.q, tk.r, estParalyse ? "Paralysé !" : "Immobilisé !", "#aaaaaa");
            }
            return;
        }

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
    
    let taille = tokenData.taille || 55;
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
    window.TOKEN_SELECTIONNE = idPersonnage;
    
    if (window.TOKENS_VTT_DATA && window.TOKENS_VTT_DATA[idPersonnage]) {
        const dataToken = window.TOKENS_VTT_DATA[idPersonnage];
        const label = document.getElementById("label-taille-token");
        if (label) label.innerText = dataToken.taille || 55;
        
        window.centrerMapSurToken(idPersonnage);
    }
    
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    window.afficherDansPanneauGauche(idPersonnage);
};

// =========================================================================
//  SUPPRESSION D'UN PION (TOKEN) ET AUTO-DESTRUCTION DES ENNEMIS
// =========================================================================
window.supprimerTokenVTT = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    if (!window.TOKEN_SELECTIONNE) {
        alert("Sélectionnez d'abord un pion sur la carte en cliquant dessus.");
        return;
    }
    if (!confirm("Voulez-vous vraiment retirer ce pion de la carte tactique ?")) return;

    const idSupprime = window.TOKEN_SELECTIONNE;
    const persoCible = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idSupprime);
    const estEnnemi = persoCible && persoCible.camp === "Ennemi";

    // 1. Suppression dans la mémoire locale
    delete window.TOKENS_VTT_DATA[idSupprime];
    window.TOKEN_SELECTIONNE = null;
    window.restaurerPanneauGauche();
    
    const label = document.getElementById("label-taille-token");
    if (label) label.innerText = "--";
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);

    if (!window.ID_PARTIE_COURANTE) return;
    try {
        const { doc, getDoc, updateDoc, deleteDoc, deleteField } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
        
        // 2. On le retire du plateau partagé
        await updateDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), {
            ["Tokens." + idSupprime]: deleteField()
        });

        // 3. Si c'est un Ennemi, on purge l'initiative et la Base de données !
        if (estEnnemi) {
            const partieRef = doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE);
            const partieSnap = await getDoc(partieRef);
            
            if (partieSnap.exists()) {
                let ordre = partieSnap.data().Ordre_Initiative || [];
                let file = partieSnap.data().File_Attente_Combat || [];
                let phase = partieSnap.data().Phase_Combat || "Preparation";
                
                ordre = ordre.filter(id => id !== idSupprime);
                file = file.filter(item => item.idPersonnage !== idSupprime);
                
                // 🔻 CORRECTION : On se base sur l'initiative restante
                const nbJoueursRestants = ordre.filter(id => {
                    const p = (window.PERSOS_PARTIE || []).find(perso => perso.idPersonnage === id);
                    return p && p.statut !== "Mort";
                }).length;
                
                if (phase === "Preparation" && file.length >= nbJoueursRestants && nbJoueursRestants > 0) {
                    phase = "Resolution";
                }
                
                await updateDoc(partieRef, { 
                    Ordre_Initiative: ordre,
                    File_Attente_Combat: file,
                    Phase_Combat: phase
                });
            }
            
            // refCombattant : l'ennemi vit désormais dans la collection Monstres, mais un
            // pion retiré peut aussi être une illusion restée dans Personnages.
            await deleteDoc(window.refCombattant(idSupprime));
            if (window.SOURCE_COMBATTANTS) delete window.SOURCE_COMBATTANTS[idSupprime];
            console.log(`💀 L'ennemi ${idSupprime} a été incinéré pour garder la BDD propre.`);
        }
        
    } catch (e) {
        console.error("Erreur lors de la suppression du token :", e);
    }
};

window.genererTokensCombat = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT || !window.PERSOS_PARTIE) return;

    let tokensData = { ...window.TOKENS_VTT_DATA };
    let updated = false;

    window.PERSOS_PARTIE.forEach(perso => {
        if (perso.statut === "Mort") return;

        const imgToUse = perso.urlToken || perso.urlCloudinary;
        if (!imgToUse) return;

        if (!tokensData[perso.idPersonnage]) {
            const hexLibre = window.trouverHexLibreVTT(tokensData);
            tokensData[perso.idPersonnage] = {
                q: hexLibre.q,
                r: hexLibre.r,
                url: imgToUse,
                taille: 55
            };
            updated = true;
        }
    });

    if (updated) {
        try {
            const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
            await setDoc(doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE), { Tokens: tokensData }, { merge: true });
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

    const taille = parseFloat(divToken.dataset.taille) || 55;

    divToken.style.width = (taille * echelle) + "px";
    divToken.style.height = (taille * echelle) + "px";

    // L'ombre au sol et le halo de sélection sont en %/scale : ils se redimensionnent seuls
    // avec le pion, sans aucun recalcul JS ici.
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

// =========================================================================
//  HALO VECTORIEL GÉNÉRIQUE (sélection, bouclier magique...) : nappe diffuse
//  + filaments qui tournent en pointillés décalés + étincelles. Purement en
//  SVG (viewBox) : suit le zoom nativement, le flou vient du SVG en unités
//  de viewBox (jamais un filtre CSS en pixels) donc aucun artefact iPad.
// =========================================================================
function construireHaloVTT(options) {
    const idFiltre = options.idFiltre;
    const vitesse = options.vitesse || 1; // >1 = plus lent

    if (!document.getElementById("anim-halo-vtt")) {
        const styleHalo = document.createElement("style");
        styleHalo.id = "anim-halo-vtt";
        styleHalo.innerHTML = `
            @keyframes haloTourne     { from { transform: rotate(0deg); }   to { transform: rotate(360deg); } }
            @keyframes haloTourneInv  { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
            @keyframes haloRespire    { 0%, 100% { opacity: 0.55; } 50% { opacity: 0.95; } }
            @keyframes haloScintille  { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
            /* L'origine des rotations est le centre du viewBox, pas la boite de l'element */
            .halo-couche { transform-box: view-box; transform-origin: 50px 50px; }
        `;
        document.head.appendChild(styleHalo);
    }

    const halo = document.createElement("div");
    halo.style.position = "absolute";
    halo.style.top = "0";
    halo.style.left = "0";
    halo.style.width = "100%";
    halo.style.height = "100%";
    halo.style.pointerEvents = "none";

    let etincellesSvg = "";
    for (let e = 0; e < options.nbEtincelles; e++) {
        const rad = (Math.random() * 360) * Math.PI / 180;
        const dist = 50 + Math.random() * 4;
        const cx = (50 + dist * Math.cos(rad)).toFixed(1);
        const cy = (50 + dist * Math.sin(rad)).toFixed(1);
        const rayon = (0.5 + Math.random() * 0.9).toFixed(2);
        const duree = ((1.1 + Math.random() * 1.9) * vitesse).toFixed(2);
        const delai = (-Math.random() * 3).toFixed(2);
        etincellesSvg += `<circle cx="${cx}" cy="${cy}" r="${rayon}" fill="${options.couleurEtincelle}"
            filter="url(#halo-flou-${idFiltre})" style="animation: haloScintille ${duree}s ease-in-out ${delai}s infinite;"/>`;
    }

    halo.innerHTML = `
        <svg viewBox="0 0 100 100" width="100%" height="100%" style="overflow: visible;">
            <defs>
                <filter id="halo-flou-${idFiltre}" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="1.1"/>
                </filter>
                <filter id="halo-flou-large-${idFiltre}" x="-70%" y="-70%" width="240%" height="240%">
                    <feGaussianBlur stdDeviation="4.5"/>
                </filter>
            </defs>

            <!-- Nappe de lumière diffuse qui déborde du bord du médaillon -->
            <circle cx="50" cy="50" r="49" fill="none" stroke="${options.couleurNappe}" stroke-width="7"
                    filter="url(#halo-flou-large-${idFiltre})"
                    style="animation: haloRespire ${(3.4 * vitesse).toFixed(1)}s ease-in-out infinite;"/>

            <!-- Filaments : pointillés décalés, vitesses/sens différents = tressage lumineux -->
            <g class="halo-couche" style="animation: haloTourne ${(7 * vitesse).toFixed(1)}s linear infinite;">
                <circle cx="50" cy="50" r="50.5" fill="none" stroke="${options.couleursFilaments[0]}" stroke-width="1.2"
                        stroke-linecap="round" stroke-dasharray="16 11 5 21 9 26"
                        filter="url(#halo-flou-${idFiltre})"/>
            </g>
            <g class="halo-couche" style="animation: haloTourneInv ${(11 * vitesse).toFixed(1)}s linear infinite;">
                <circle cx="50" cy="50" r="48.5" fill="none" stroke="${options.couleursFilaments[1]}" stroke-width="0.9"
                        stroke-linecap="round" stroke-dasharray="9 17 22 8 13 19"
                        filter="url(#halo-flou-${idFiltre})"/>
            </g>
            <g class="halo-couche" style="animation: haloTourne ${(16 * vitesse).toFixed(1)}s linear infinite;">
                <circle cx="50" cy="50" r="52" fill="none" stroke="${options.couleursFilaments[2]}" stroke-width="0.6"
                        stroke-linecap="round" stroke-dasharray="5 27 11 33 7 24"
                        filter="url(#halo-flou-${idFiltre})" opacity="0.95"/>
            </g>
            <g class="halo-couche" style="animation: haloTourneInv ${(5.5 * vitesse).toFixed(1)}s linear infinite;">
                <circle cx="50" cy="50" r="47" fill="none" stroke="${options.couleursFilaments[3]}" stroke-width="0.7"
                        stroke-linecap="round" stroke-dasharray="7 23 14 29"
                        filter="url(#halo-flou-${idFiltre})" opacity="0.88"/>
            </g>

            <!-- Étincelles -->
            <g class="halo-couche" style="animation: haloTourne ${(26 * vitesse).toFixed(1)}s linear infinite;">
                ${etincellesSvg}
            </g>
        </svg>
    `;

    return halo;
}

// =========================================================================
//  LES COMBATTANTS À TERRE
// =========================================================================
//  Un combattant mort disparaît complètement du plateau : plus de pion, donc
//  rien à cliquer, et sa case redevient libre. Ces deux fonctions sont le seul
//  endroit qui décide "qui est mort", pour que l'affichage, les clics et les
//  déplacements ne puissent jamais se contredire.
// =========================================================================
window.estCombattantMort = function(idCombattant) {
    const p = (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === idCombattant);
    if (!p) return false;
    // PV_Max est vérifié avant de conclure : un combattant dont les PV ne sont pas
    // encore chargés vaut 0 et passerait à tort pour un cadavre.
    const pvMax = parseInt(p.PV_Max) || 0;
    const pv = parseInt(p.PV_Actuels) || 0;
    return p.statut === "Mort" || (pvMax > 0 && pv <= 0);
};

// Vrai seulement si un combattant ENCORE DEBOUT occupe la case.
window.caseOccupeeParVivant = function(q, r, tokensData) {
    const tokens = tokensData || window.TOKENS_VTT_DATA || {};
    for (let id in tokens) {
        if (tokens[id].q === q && tokens[id].r === r && !window.estCombattantMort(id)) return true;
    }
    return false;
};

window.appliquerTokensVTT = function(tokensMap) {
    if (!window.PLATEAU_VTT) return;
    
    // 🔻 NOUVEAU : VERROU ANTI-TÉLÉPORTATION 🔻
    // Si une animation de marche est en cours, on bloque le redessin de la carte !
    if (window.ANIMATION_VTT_EN_COURS) return;
    
    const conteneur = document.getElementById("conteneur-tokens-vtt");
    if (!conteneur) return;

    // Filet de sécurité : si le plateau a été (re)construit après la dernière synchro, le calque
    // des zones persistantes a disparu avec lui — on le redessine sans attendre un nouveau
    // snapshot Firestore (et sans rien refaire s'il est déjà là).
    if (Object.keys(window.ZONES_PERSISTANTES || {}).length > 0
        && !document.getElementById("svg-zones-persistantes")
        && typeof window.appliquerZonesPersistantes === "function") {
        window.appliquerZonesPersistantes();
    }

    conteneur.innerHTML = "";

    for (let idPerso in tokensMap) {
        const data = tokensMap[idPerso];
        const taille = data.taille || 55;
        const pData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPerso);

        // Un combattant à terre disparaît purement et simplement du plateau : pas de pion,
        // donc rien à cliquer et rien qui barre le passage. Son entrée reste dans les Tokens
        // (sa case est mémorisée) mais elle n'est plus dessinée. Toutes les animations qui
        // cherchent un pion par son id gèrent déjà son absence.
        if (window.estCombattantMort(idPerso)) continue;

        const divToken = document.createElement("div");
        divToken.className = "token-vtt";
        divToken.style.position = "absolute";

        // La case et la taille de référence sont mémorisées : la position écran en découle à chaque zoom.
        // Les pions ne pivotent plus jamais : aucun angle n'est stocké ni appliqué.
        divToken.dataset.q = data.q;
        divToken.dataset.r = data.r;
        divToken.dataset.taille = taille;

        // Le conteneur reste fixe
        divToken.style.transform = `translate(-50%, -50%)`; 
        
        // Seuls des combattants debout arrivent ici : les morts ont été écartés plus haut.
        divToken.style.pointerEvents = "auto";
        divToken.style.cursor = "pointer";
        divToken.style.zIndex = "10";
        divToken.style.borderRadius = "50%";
        divToken.id = "token-" + idPerso;

        // 1️⃣ L'OMBRE PORTÉE : jeton posé à plat sur la table, lumière venant du haut.
        // C'est un disque de la taille du jeton, simplement décalé vers le bas : le médaillon
        // opaque en recouvre la majeure partie, et il n'en dépasse qu'un croissant au sud.
        // Dégradé radial plutôt qu'un filtre "blur" : ce dernier doit être recalculé en pixels à
        // chaque étape du zoom, ce qui laissait des résidus visuels sur iPad (Safari) pendant un
        // pincement rapide. Un dégradé se redimensionne nativement avec l'élément, sans recalcul JS.
        // Une Illusion n'en projette pas : ce n'est qu'un leurre immatériel, pas un vrai jeton posé.
        if (!pData || !pData.estIllusion) {
            const ombreSol = document.createElement("div");
            ombreSol.className = "token-ombre-sol";
            ombreSol.style.position = "absolute";
            ombreSol.style.top = "56%";  // Décalage vers le sud : c'est lui qui fait apparaître le croissant
            ombreSol.style.left = "50%";
            ombreSol.style.transform = "translate(-50%, -50%)";
            ombreSol.style.width = "97%";
            ombreSol.style.height = "97%";
            ombreSol.style.borderRadius = "50%";
            // Coeur dense et opaque, puis long fondu vers les bords : donne le flou du contact sans filtre CSS.
            // "closest-side" est indispensable ici : sans lui, un dégradé radial va par défaut jusqu'au
            // coin le plus éloigné (bien au-delà du cercle visible découpé par border-radius), donc le
            // fondu n'atteint jamais 0 avant d'être tronqué net par le border-radius. Avec closest-side,
            // le dégradé est calé sur le bord du cercle réellement visible : le fondu se termine pile là.
            // Coeur franchement opaque jusqu'à 75% du rayon, puis fondu concentré sur le dernier quart :
            // la zone visible (le croissant qui dépasse du médaillon) reste bien sombre, et seule
            // l'extrémité du dégradé s'estompe en douceur au lieu d'être coupée net.
            ombreSol.style.background = "radial-gradient(circle closest-side at 50% 50%, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.9) 75%, rgba(0,0,0,0.65) 90%, rgba(0,0,0,0) 100%)";
            ombreSol.style.zIndex = "-2";
            ombreSol.style.pointerEvents = "none";
            divToken.appendChild(ombreSol);
        }

        // 2️⃣ LE HALO DE SÉLECTION : couronne d'énergie dorée qui épouse le bord du médaillon.
        if (window.TOKEN_SELECTIONNE === idPerso) {
            const haloSelection = construireHaloVTT({
                idFiltre: "select-" + idPerso,
                vitesse: 1,
                nbEtincelles: 9,
                couleurNappe: "#ffdb94",
                couleursFilaments: ["#fff6dc", "#ffe9b4", "#ffffff", "#ffd589"],
                couleurEtincelle: "#fffaf0"
            });
            haloSelection.className = "token-halo-selection";
            haloSelection.style.zIndex = "-1"; // Derrière le médaillon : ne dépasse qu'au-delà de son bord
            divToken.appendChild(haloSelection);
        }

        // 3️⃣ LE HALO DU BOUCLIER MAGIQUE : même effet, en cyan et deux fois plus lent.
        // Placé devant le médaillon (contrairement au halo de sélection) : les deux se
        // superposent proprement quand un personnage protégé est sélectionné.
        if (pData && (parseInt(pData.Bouclier_Actuel) || 0) > 0) {
            const haloBouclier = construireHaloVTT({
                idFiltre: "bouclier-" + idPerso,
                vitesse: 2,
                nbEtincelles: 7,
                couleurNappe: "#5be8ff",
                couleursFilaments: ["#e0ffff", "#99f6ff", "#ffffff", "#5be8ff"],
                couleurEtincelle: "#eafeff"
            });
            haloBouclier.className = "token-halo-bouclier";
            haloBouclier.style.zIndex = "3"; // Devant le médaillon
            haloBouclier.style.opacity = "0.8"; // Un tout petit peu plus transparent que le rendu de base
            divToken.appendChild(haloBouclier);
        }

        // Gestion du Clic
        divToken.onclick = function(e) {
            e.stopPropagation();

            // 🔻 NOUVEAU : INTERCEPTION POUR LE CIBLAGE 🔻
            if (window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif) {
                if (typeof window.ajouterCibleCiblage === "function") window.ajouterCibleCiblage(idPerso);
                return;
            }

            window.TOKEN_SELECTIONNE = idPerso;
            const label = document.getElementById("label-taille-token");
            if (label) label.innerText = taille;
            window.appliquerTokensVTT(window.TOKENS_VTT_DATA); 
            window.afficherDansPanneauGauche(idPerso);
        };


        // 4️⃣ LE PION LUI-MÊME
        // Un monstre n'a pas de portrait : son pion est un simple disque rouge portant
        // son nom en petit. On le construit à la place de l'image plutôt qu'en plus,
        // sinon l'<img> vide afficherait l'icône de fichier cassé du navigateur.
        if (pData && pData.estMonstre) {
            const disque = document.createElement("div");
            disque.className = "token-disque-monstre";
            disque.style.position = "absolute";
            disque.style.top = "0";
            disque.style.left = "0";
            disque.style.width = "100%";
            disque.style.height = "100%";
            disque.style.borderRadius = "50%";
            disque.style.zIndex = "2";
            disque.style.background = "radial-gradient(circle at 38% 32%, #ff6b6b 0%, #c62828 55%, #7a1414 100%)";
            disque.style.border = "2px solid #ffb4b4";
            disque.style.boxSizing = "border-box";
            disque.style.display = "flex";
            disque.style.alignItems = "center";
            disque.style.justifyContent = "center";
            disque.style.overflow = "hidden";
            // Rien de particulier pour un monstre mort : l'opacité de 50 % est déjà
            // appliquée plus haut sur le pion entier, comme pour tous les combattants.

            const nomAffiche = ((pData.prenom || "") + " " + (pData.nom || "")).trim() || "Créature";

            const nomToken = document.createElement("div");
            // La taille du pion est réglable : le texte doit suivre, sinon il déborde sur les
            // petits pions et se perd sur les gros. On part de 15 % du diamètre, puis on rétrécit
            // juste ce qu'il faut pour que le mot le plus long tienne sur une ligne : sans ça, un
            // nom d'un seul tenant ("Nécromancien") se coupe en plein milieu ("Nécroman-cien").
            const motLePlusLong = nomAffiche.split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), "");
            const largeurUtile = taille * 0.8; // le texte a 10 % de marge de chaque côté
            const taillePourMot = largeurUtile / Math.max(1, motLePlusLong.length * 0.58); // Cinzel gras ≈ 0.58 em/caractère
            nomToken.style.fontSize = Math.max(6, Math.min(Math.round(taille * 0.15), Math.round(taillePourMot))) + "px";
            nomToken.style.fontFamily = "'Cinzel', serif";
            nomToken.style.fontWeight = "bold";
            nomToken.style.color = "#fff4f4";
            nomToken.style.textShadow = "1px 1px 3px rgba(0,0,0,0.95)";
            nomToken.style.textAlign = "center";
            nomToken.style.lineHeight = "1.1";
            nomToken.style.padding = "0 10%";
            nomToken.style.pointerEvents = "none";
            // Un nom d'un seul mot long ("Nécromancien") est plus large que le disque :
            // sans coupure autorisée, il déborderait de part et d'autre du pion.
            nomToken.style.overflowWrap = "anywhere";
            nomToken.style.wordBreak = "break-word";
            nomToken.style.maxWidth = "100%";
            nomToken.innerText = nomAffiche;
            disque.appendChild(nomToken);

            divToken.appendChild(disque);
            window.positionnerTokenVTT(divToken, true);
            conteneur.appendChild(divToken);
            continue;
        }

        const img = document.createElement("img");
        img.className = "token-img-main";
        img.src = typeof window.redimensionnerImageCloudinary === "function"
            ? window.redimensionnerImageCloudinary(data.url, 700)
            : data.url;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        // 🔻 CORRECTION DU BUG D'AFFICHAGE : On force la position absolue comme les ombres 🔻
        img.style.position = "absolute";
        img.style.top = "0";
        img.style.left = "0";
        img.style.zIndex = "2";
        img.onerror = () => { img.style.display = "none"; };
        // L'Illusion reprend le token du lanceur mais à 50% d'opacité, pour rester reconnaissable
        // comme un leurre plutôt qu'un vrai personnage.
        if (pData && pData.estIllusion) img.style.opacity = "0.4";

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
//  RENDU DES ZONES PERSISTANTES (Persistance de terrain)
//  Un calque SVG dédié, glissé DANS #transform-plateau (donc il suit le zoom et le pan comme
//  le reste du plateau) et posé sous les pions (z-index 3 contre 10). Tout est vu du dessus :
//  pas de flammes "de profil", mais un lit de braises, du givre qui s'étale, des arcs qui
//  claquent au sol et une nappe de gaz qui dérive.
// =========================================================================
function injecterStyleZonesPersistantes() {
    if (document.getElementById("style-zones-persistantes")) return;
    const style = document.createElement("style");
    style.id = "style-zones-persistantes";
    style.textContent = `
        #svg-zones-persistantes .zp-anim { transform-box: fill-box; transform-origin: center; }
        @keyframes zpBraise {
            0%, 100% { transform: scale(0.88); opacity: 0.55; }
            50%      { transform: scale(1.18); opacity: 0.95; }
        }
        @keyframes zpLangue {
            0%, 100% { transform: scaleY(0.75) scaleX(1.05); opacity: 0.65; }
            35%      { transform: scaleY(1.35) scaleX(0.85); opacity: 1; }
            70%      { transform: scaleY(0.95) scaleX(1.1);  opacity: 0.8; }
        }
        @keyframes zpEtincelle {
            0%   { transform: translateX(0) scale(1);   opacity: 0; }
            20%  { opacity: 0.95; }
            100% { transform: translateX(14px) scale(0.2); opacity: 0; }
        }
        @keyframes zpGivre {
            0%, 100% { transform: scale(0.94); opacity: 0.5; }
            50%      { transform: scale(1.06); opacity: 0.95; }
        }
        @keyframes zpGivreTour { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes zpArc {
            0%, 34%, 46%, 80%, 100% { opacity: 0; }
            36%  { opacity: 1; }
            38%  { opacity: 0.2; }
            40%  { opacity: 0.95; }
            44%  { opacity: 0; }
            84%  { opacity: 1; }
            86%  { opacity: 0.15; }
            88%  { opacity: 1; }
            94%  { opacity: 0; }
        }
        @keyframes zpNappe {
            0%, 100% { transform: translate(0px, 0px) scale(1);      opacity: 0.30; }
            50%      { transform: translate(7px, -6px) scale(1.18);  opacity: 0.55; }
        }
        @keyframes zpBulle {
            0%   { transform: scale(0.3); opacity: 0; }
            30%  { opacity: 0.8; }
            100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes zpSocle { 0%, 100% { opacity: 0.45; } 50% { opacity: 0.72; } }
    `;
    document.head.appendChild(style);
}

// Aléatoire déterministe : le décor d'une case reste identique d'un rendu à l'autre (sinon il
// "sauterait" à chaque zoom, chaque déplacement de pion ou chaque snapshot Firestore).
function graineZone(q, r, k) {
    const x = Math.sin(q * 127.1 + r * 311.7 + k * 74.7) * 43758.5453;
    return x - Math.floor(x);
}

function pointsHexZone(cx, cy, rayon) {
    let s = "";
    for (let i = 0; i < 6; i++) {
        const a = Math.PI / 180 * (60 * i);
        s += `${(cx + rayon * Math.cos(a)).toFixed(1)},${(cy + rayon * Math.sin(a)).toFixed(1)} `;
    }
    return s.trim();
}

// Tout est dessiné en coordonnées LOCALES (case centrée sur 0,0) dans un groupe translaté puis
// découpé à l'hexagone : rien ne bave sur les cases voisines, et le contour reste lisible pour
// que les joueurs voient exactement où le terrain est piégé.
// `leger` : mode allégé automatique sur les très grandes emprises (moins d'éléments, pas de
// flou) — un iPad ne doit pas ramer parce qu'un joueur a posé une AoE de 19 cases en feu.
function dessinerHexZonePersistante(type, hex, R, leger) {
    const px = window.PLATEAU_VTT.hexToPixel(hex.q, hex.r);
    const rnd = (k) => graineZone(hex.q, hex.r, k);
    const flouDoux = leger ? "" : ` filter="url(#zp-flou-doux)"`;
    const flouFort = leger ? "" : ` filter="url(#zp-flou-fort)"`;
    const halo = leger ? "" : ` filter="url(#zp-glow)"`;

    let deco = "";
    let contour = "#ff4c4c";

    if (type === "feu") {
        contour = "#ff8a2e";
        deco += `<polygon points="${pointsHexZone(0, 0, R)}" fill="url(#zp-grad-feu)" class="zp-anim" style="animation: zpSocle 2.4s ease-in-out infinite; animation-delay:-${(rnd(1) * 2).toFixed(2)}s"/>`;
        // Cœur incandescent : c'est lui qui donne la chaleur, les langues ne font que danser autour.
        deco += `<ellipse rx="${(R * 0.42).toFixed(1)}" ry="${(R * 0.34).toFixed(1)}" fill="url(#zp-grad-coeur)"${flouDoux} class="zp-anim"
            style="animation: zpBraise 2.1s ease-in-out infinite"/>`;

        // Lit de braises : de larges taches chaudes qui respirent, vues du dessus.
        const nbBraises = leger ? 2 : 3;
        for (let k = 0; k < nbBraises; k++) {
            const ang = (k * (360 / nbBraises) + rnd(k + 2) * 40) * Math.PI / 180;
            const d = R * (0.08 + rnd(k + 8) * 0.30);
            const rx = R * (0.30 + rnd(k + 14) * 0.14);
            deco += `<g transform="translate(${(Math.cos(ang) * d).toFixed(1)},${(Math.sin(ang) * d).toFixed(1)})">
                <ellipse rx="${rx.toFixed(1)}" ry="${(rx * 0.80).toFixed(1)}" fill="url(#zp-grad-braise)"${flouDoux} class="zp-anim"
                    style="animation: zpBraise ${(1.3 + rnd(k + 20) * 1.1).toFixed(2)}s ease-in-out infinite; animation-delay:-${(rnd(k + 26) * 2).toFixed(2)}s"/></g>`;
        }

        // Langues de feu : de petites pointes claires qui lèchent vers l'extérieur.
        const nbLangues = leger ? 2 : 4;
        for (let k = 0; k < nbLangues; k++) {
            // Angles franchement dispersés : réparties trop régulièrement, les langues dessinent
            // une fleur au lieu d'un feu.
            const ang = k * (360 / nbLangues) + rnd(k + 32) * 90 - 25;
            const d = R * (0.10 + rnd(k + 38) * 0.34);
            const t = R * (0.075 + rnd(k + 44) * 0.055);
            const rad = ang * Math.PI / 180;
            deco += `<g transform="translate(${(Math.cos(rad) * d).toFixed(1)},${(Math.sin(rad) * d).toFixed(1)}) rotate(${(ang + 90).toFixed(0)})">
                <path d="M 0,${t.toFixed(1)} C ${(-t * 0.80).toFixed(1)},${(t * 0.15).toFixed(1)} ${(-t * 0.40).toFixed(1)},${(-t * 1.50).toFixed(1)} 0,${(-t * 2.60).toFixed(1)} C ${(t * 0.40).toFixed(1)},${(-t * 1.50).toFixed(1)} ${(t * 0.80).toFixed(1)},${(t * 0.15).toFixed(1)} 0,${t.toFixed(1)} Z"
                    fill="url(#zp-grad-langue)"${halo} class="zp-anim"
                    style="animation: zpLangue ${(0.7 + rnd(k + 50) * 0.5).toFixed(2)}s ease-in-out infinite; animation-delay:-${(rnd(k + 56) * 1.4).toFixed(2)}s"/></g>`;
        }

        // Escarbilles qui filent vers l'extérieur.
        if (!leger) {
            for (let k = 0; k < 3; k++) {
                const ang = rnd(k + 62) * 360;
                deco += `<g transform="rotate(${ang.toFixed(0)})">
                    <circle r="${(R * 0.05).toFixed(1)}" fill="#ffe6ac"${halo} class="zp-anim"
                        style="animation: zpEtincelle ${(1.6 + rnd(k + 68) * 1.2).toFixed(2)}s linear infinite; animation-delay:-${(rnd(k + 74) * 2.4).toFixed(2)}s"/></g>`;
            }
        }

    } else if (type === "glace") {
        contour = "#d6f4ff";
        deco += `<polygon points="${pointsHexZone(0, 0, R)}" fill="url(#zp-grad-glace)"/>`;
        deco += `<polygon points="${pointsHexZone(0, 0, R * 0.68)}" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1.6" stroke-dasharray="5 9" class="zp-anim"
            style="animation: zpGivreTour 26s linear infinite"/>`;

        const nbCristaux = leger ? 3 : 5;
        for (let k = 0; k < nbCristaux; k++) {
            const ang = k * (360 / nbCristaux) + rnd(k + 3) * 35;
            const d = R * (0.12 + rnd(k + 9) * 0.40);
            const L = R * (0.17 + rnd(k + 15) * 0.13);
            const rad = ang * Math.PI / 180;
            deco += `<g transform="translate(${(Math.cos(rad) * d).toFixed(1)},${(Math.sin(rad) * d).toFixed(1)}) rotate(${(rnd(k + 21) * 360).toFixed(0)})">
                <polygon points="0,${(-L).toFixed(1)} ${(L * 0.30).toFixed(1)},0 0,${L.toFixed(1)} ${(-L * 0.30).toFixed(1)},0"
                    fill="url(#zp-grad-cristal)" stroke="rgba(255,255,255,0.9)" stroke-width="0.8" class="zp-anim"
                    style="animation: zpGivre ${(2.6 + rnd(k + 27) * 2).toFixed(2)}s ease-in-out infinite; animation-delay:-${(rnd(k + 33) * 3).toFixed(2)}s"/></g>`;
        }

    } else if (type === "electrique") {
        contour = "#9fdcff";
        deco += `<polygon points="${pointsHexZone(0, 0, R)}" fill="url(#zp-grad-elec)" class="zp-anim" style="animation: zpSocle 3s ease-in-out infinite"/>`;

        // Un arc se construit d'un bord à l'autre, en zigzag.
        const arc = (k, largeur) => {
            const angDep = rnd(k + 4) * 360;
            const angArr = angDep + 120 + rnd(k + 10) * 120;
            const radD = angDep * Math.PI / 180, radA = angArr * Math.PI / 180;
            const x1 = Math.cos(radD) * R * 0.85, y1 = Math.sin(radD) * R * 0.85;
            const x2 = Math.cos(radA) * R * 0.85, y2 = Math.sin(radA) * R * 0.85;
            let d = `M ${x1.toFixed(1)},${y1.toFixed(1)}`;
            const seg = 4;
            for (let s = 1; s <= seg; s++) {
                const t = s / seg;
                const bx = x1 + (x2 - x1) * t;
                const by = y1 + (y2 - y1) * t;
                const ecart = s === seg ? 0 : (rnd(k * 10 + s + 16) - 0.5) * R * 0.5;
                const nx = -(y2 - y1), ny = (x2 - x1);
                const norme = Math.hypot(nx, ny) || 1;
                d += ` L ${(bx + nx / norme * ecart).toFixed(1)},${(by + ny / norme * ecart).toFixed(1)}`;
            }
            return { d: d, largeur: largeur };
        };

        // Deux arcs de fond toujours visibles : la case reste "sous tension" même entre deux
        // décharges, sinon elle a l'air éteinte les trois quarts du temps.
        for (let k = 0; k < 2; k++) {
            const a = arc(k + 90, R * 0.035);
            deco += `<path d="${a.d}" fill="none" stroke="#7fc9ff" stroke-width="${a.largeur.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity="0.30"/>`;
        }
        // Puis les décharges franches qui claquent chacune sur son tempo.
        const nbArcs = leger ? 2 : 3;
        for (let k = 0; k < nbArcs; k++) {
            const a = arc(k, R * 0.055);
            deco += `<path d="${a.d}" fill="none" stroke="#eaf7ff" stroke-width="${a.largeur.toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"${halo}
                style="animation: zpArc ${(1.8 + rnd(k + 40) * 1.6).toFixed(2)}s linear infinite; animation-delay:-${(rnd(k + 46) * 3).toFixed(2)}s"/>`;
        }
        // Étincelles au sol entre deux décharges.
        const nbEclats = leger ? 2 : 4;
        for (let k = 0; k < nbEclats; k++) {
            const ang = rnd(k + 52) * 360 * Math.PI / 180;
            const d = R * (0.15 + rnd(k + 58) * 0.55);
            deco += `<circle cx="${(Math.cos(ang) * d).toFixed(1)}" cy="${(Math.sin(ang) * d).toFixed(1)}" r="${(R * 0.05).toFixed(1)}"
                fill="#ffffff"${halo}
                style="animation: zpArc ${(1.4 + rnd(k + 64) * 1.6).toFixed(2)}s linear infinite; animation-delay:-${(rnd(k + 70) * 2).toFixed(2)}s"/>`;
        }

    } else if (type === "poison") {
        contour = "#8fdc4c";
        deco += `<polygon points="${pointsHexZone(0, 0, R)}" fill="url(#zp-grad-poison)" class="zp-anim" style="animation: zpSocle 4s ease-in-out infinite"/>`;

        const nbBouillons = leger ? 2 : 4;
        for (let k = 0; k < nbBouillons; k++) {
            const ang = (k * (360 / nbBouillons) + rnd(k + 5) * 45) * Math.PI / 180;
            const d = R * (0.06 + rnd(k + 11) * 0.34);
            const rr = R * (0.28 + rnd(k + 17) * 0.16);
            deco += `<g transform="translate(${(Math.cos(ang) * d).toFixed(1)},${(Math.sin(ang) * d).toFixed(1)})">
                <circle r="${rr.toFixed(1)}" fill="url(#zp-grad-vapeur)"${flouFort} class="zp-anim"
                    style="animation: zpNappe ${(4.5 + rnd(k + 23) * 3).toFixed(2)}s ease-in-out infinite; animation-delay:-${(rnd(k + 29) * 5).toFixed(2)}s"/></g>`;
        }
        const nbBulles = leger ? 1 : 3;
        for (let k = 0; k < nbBulles; k++) {
            const ang = rnd(k + 35) * 360 * Math.PI / 180;
            const d = R * (0.12 + rnd(k + 41) * 0.48);
            deco += `<g transform="translate(${(Math.cos(ang) * d).toFixed(1)},${(Math.sin(ang) * d).toFixed(1)})">
                <circle r="${(R * 0.11).toFixed(1)}" fill="none" stroke="#c9f79e" stroke-width="1.5" class="zp-anim"
                    style="animation: zpBulle ${(2.4 + rnd(k + 47) * 1.8).toFixed(2)}s ease-out infinite; animation-delay:-${(rnd(k + 53) * 3).toFixed(2)}s"/></g>`;
        }

    } else {
        deco += `<polygon points="${pointsHexZone(0, 0, R)}" fill="rgba(255,76,76,0.22)" class="zp-anim" style="animation: zpSocle 2.6s ease-in-out infinite"/>`;
    }

    return `<g transform="translate(${px.x.toFixed(1)},${px.y.toFixed(1)})">
        <g clip-path="url(#zp-clip-hex)">${deco}</g>
        <polygon points="${pointsHexZone(0, 0, R * 0.985)}" fill="none" stroke="${contour}" stroke-width="2.2" opacity="0.8"/>
    </g>`;
}

window.appliquerZonesPersistantes = function() {
    const conteneur = document.getElementById("transform-plateau");
    if (!conteneur || !window.PLATEAU_VTT) return;

    let svg = document.getElementById("svg-zones-persistantes");
    if (!svg) {
        svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = "svg-zones-persistantes";
        svg.style.position = "absolute";
        svg.style.top = "0";
        svg.style.left = "0";
        svg.style.width = "100%";
        svg.style.height = "100%";
        svg.style.zIndex = "3"; // Sous les pions (10), au-dessus du fond de carte
        svg.style.pointerEvents = "none";
        svg.style.overflow = "visible";
        conteneur.appendChild(svg);
    }

    injecterStyleZonesPersistantes();

    const zones = Object.values(window.ZONES_PERSISTANTES || {});
    if (zones.length === 0) {
        svg.innerHTML = "";
        return;
    }

    const R = window.PLATEAU_VTT.hexSize;

    const defs = `<defs>
        <clipPath id="zp-clip-hex"><polygon points="${pointsHexZone(0, 0, R)}"/></clipPath>
        <filter id="zp-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="${(R * 0.11).toFixed(2)}" result="flou"/>
            <feMerge><feMergeNode in="flou"/><feMergeNode in="flou"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
        <filter id="zp-flou-doux" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="${(R * 0.10).toFixed(2)}"/>
        </filter>
        <filter id="zp-flou-fort" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="${(R * 0.20).toFixed(2)}"/>
        </filter>
        <radialGradient id="zp-grad-feu">
            <stop offset="0%"   stop-color="#ffa53c" stop-opacity="0.62"/>
            <stop offset="55%"  stop-color="#d63a08" stop-opacity="0.50"/>
            <stop offset="100%" stop-color="#4d1000" stop-opacity="0.40"/>
        </radialGradient>
        <radialGradient id="zp-grad-coeur">
            <stop offset="0%"   stop-color="#fff6d2" stop-opacity="0.90"/>
            <stop offset="45%"  stop-color="#ffab3a" stop-opacity="0.55"/>
            <stop offset="100%" stop-color="#ff6a12" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="zp-grad-braise">
            <stop offset="0%"   stop-color="#fff2b0" stop-opacity="0.95"/>
            <stop offset="45%"  stop-color="#ff9d2e" stop-opacity="0.75"/>
            <stop offset="100%" stop-color="#e03a05" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="zp-grad-langue" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%"   stop-color="#ff7a1e" stop-opacity="0.90"/>
            <stop offset="50%"  stop-color="#ffcf5c" stop-opacity="0.98"/>
            <stop offset="100%" stop-color="#fffbe6" stop-opacity="1"/>
        </linearGradient>
        <radialGradient id="zp-grad-glace">
            <stop offset="0%"   stop-color="#eafaff" stop-opacity="0.45"/>
            <stop offset="70%"  stop-color="#8fd8f7" stop-opacity="0.38"/>
            <stop offset="100%" stop-color="#4aa6cf" stop-opacity="0.32"/>
        </radialGradient>
        <linearGradient id="zp-grad-cristal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="#8fd8f7" stop-opacity="0.55"/>
        </linearGradient>
        <radialGradient id="zp-grad-elec">
            <stop offset="0%"   stop-color="#9fd8ff" stop-opacity="0.30"/>
            <stop offset="100%" stop-color="#1b4c7a" stop-opacity="0.22"/>
        </radialGradient>
        <radialGradient id="zp-grad-poison">
            <stop offset="0%"   stop-color="#a8ef6c" stop-opacity="0.38"/>
            <stop offset="100%" stop-color="#2f6b1f" stop-opacity="0.34"/>
        </radialGradient>
        <radialGradient id="zp-grad-vapeur">
            <stop offset="0%"   stop-color="#e2ffb8" stop-opacity="0.92"/>
            <stop offset="55%"  stop-color="#9ae04f" stop-opacity="0.50"/>
            <stop offset="100%" stop-color="#4d9b32" stop-opacity="0"/>
        </radialGradient>
    </defs>`;

    let totalHexes = 0;
    zones.forEach(z => { totalHexes += (z.hexes || []).length; });
    const leger = totalHexes > 12;

    let corps = "";
    zones.forEach(zone => {
        (zone.hexes || []).forEach(hex => {
            corps += dessinerHexZonePersistante(zone.type || "neutre", hex, R, leger);
        });
    });

    // On passe par DOMParser plutôt que par innerHTML : l'affectation de balisage SVG via
    // innerHTML est capricieuse selon les moteurs, et le jeu tourne sur iPad (WebKit).
    svg.innerHTML = "";
    try {
        const docSvg = new DOMParser().parseFromString(
            `<svg xmlns="http://www.w3.org/2000/svg">${defs}${corps}</svg>`, "image/svg+xml"
        );
        if (docSvg.querySelector("parsererror")) throw new Error("SVG des zones illisible");
        Array.from(docSvg.documentElement.childNodes).forEach(n => svg.appendChild(document.importNode(n, true)));
    } catch (e) {
        console.error("Erreur rendu zones persistantes :", e);
    }
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

    const phase = (window.PARTIE_DATA || {}).Phase_Combat || "Preparation";
    if (phase !== "Preparation") return;

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

            // Électrifié : consommé sur la toute prochaine carte jouée, quelle qu'elle soit —
            // -35 en initiative sur CETTE carte (la piste se retrie automatiquement puisque
            // file.sort() ci-dessous relit la valeur qu'on vient d'écrire), puis l'état disparaît.
            let initiativeCarte = dataCarte.Initiative || 0;
            const etatElectrifie = persoActuel.Etats_Alteres && persoActuel.Etats_Alteres.find(e => e.nom === "Électrifié");
            if (etatElectrifie) {
                initiativeCarte = Math.max(0, initiativeCarte - 35);
                const nouveauxEtatsElec = persoActuel.Etats_Alteres.filter(e => e !== etatElectrifie);
                persoActuel.Etats_Alteres = nouveauxEtatsElec;

                const persoPartieElec = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === persoActuel.idPersonnage);
                if (persoPartieElec) persoPartieElec.Etats_Alteres = nouveauxEtatsElec;

                updateDoc(window.refCombattant(persoActuel.idPersonnage), { Etats_Alteres: nouveauxEtatsElec }).catch(e => console.error(e));
            }

            file.push({
                idPersonnage: persoActuel.idPersonnage,
                idCarte: idCarte, // NOUVEAU : Sauvegarde la carte choisie !
                initiative: initiativeCarte,
                timestamp: new Date().getTime()
            });

            file.sort((a, b) => {
                if (b.initiative !== a.initiative) return b.initiative - a.initiative;
                return a.timestamp - b.timestamp;
            });

            let phase = snap.data().Phase_Combat || "Preparation";
            
            // 🔻 CORRECTION : On ne compte QUE les combattants présents dans l'Initiative !
            let ordreInit = snap.data().Ordre_Initiative || [];
            const nbJoueursActifs = ordreInit.filter(id => {
                const p = (window.PERSOS_PARTIE || []).find(perso => perso.idPersonnage === id);
                return p && p.statut !== "Mort";
            }).length;
            
            if (file.length >= nbJoueursActifs && nbJoueursActifs > 0) phase = "Resolution";

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
        const btn = document.getElementById("btn-choisir-action");
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
        const { getDoc } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
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
            
            // 🔻 CORRECTION : Idem pour le Repos Long
            let ordreInit = snap.data().Ordre_Initiative || [];
            const nbJoueursActifs = ordreInit.filter(id => {
                const p = (window.PERSOS_PARTIE || []).find(perso => perso.idPersonnage === id);
                return p && p.statut !== "Mort";
            }).length;
            
            if (file.length >= nbJoueursActifs && nbJoueursActifs > 0) newPhase = "Resolution";

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

    // Le tour d'un monstre appartient à l'IA, et à elle seule : le bouton reste
    // éteint. Il se rallume quand même si l'IA n'a plus donné signe de vie
    // depuis vingt secondes — mieux vaut une fin de tour à la main qu'une table
    // bloquée devant une créature qui ne joue pas.
    const teteEstMonstre = queue.length > 0 && typeof window.estMonstre === "function"
                           && window.estMonstre(queue[0].idPersonnage);
    const iaDonneSigneDeVie = (Date.now() - (window.IA_DERNIER_SIGNE || 0)) < 20000;
    if (phase === "Resolution" && teteEstMonstre && iaDonneSigneDeVie) {
        imgBtn.src = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1786565146/FinTourEteind_exjtxp.png";
        window.PEUT_PASSER_TOUR = false;
        return;
    }

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
                            
                            // Les monstres ont leur propre rendement de repos dans le
                            // bestiaire (Repos_Long, en % de la jauge) : un petit gobelin
                            // récupère tout, un boss beaucoup moins. Les personnages
                            // joueurs, eux, gardent les 35% historiques.
                            const pctRepos = parseInt(persoAction.Repos_Long);
                            const tauxRepos = (!isNaN(pctRepos) && pctRepos > 0) ? pctRepos / 100 : 0.35;
                            const recup = Math.floor(fatigueMax * tauxRepos);
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

                        // 🔻 Zones persistantes : un tour de moins à vivre à chaque nouveau tour.
                        // L'écriture passe par sauvegarderZonesPersistantes (updateDoc) : un
                        // setDoc en merge fusionnerait les clés et les zones expirées ne
                        // disparaîtraient jamais.
                        const zonesActuelles = window.ZONES_PERSISTANTES || {};
                        if (Object.keys(zonesActuelles).length > 0) {
                            const zonesRestantes = {};
                            Object.values(zonesActuelles).forEach(z => {
                                const reste = (parseInt(z.dureeRestante) || 0) - 1;
                                if (reste > 0) zonesRestantes[z.id] = { ...z, dureeRestante: reste };
                            });
                            window.ZONES_PERSISTANTES = zonesRestantes;
                            if (typeof window.appliquerZonesPersistantes === "function") window.appliquerZonesPersistantes();
                            if (typeof window.sauvegarderZonesPersistantes === "function") {
                                window.sauvegarderZonesPersistantes(zonesRestantes).catch(e => console.error(e));
                            }
                        }

                        if (window.PERSOS_PARTIE && window.PERSOS_PARTIE.length > 0) {
                            const batch = writeBatch(db);
                            let regenAjoutee = false;
                            
                            window.PERSOS_PARTIE.forEach(perso => {
                                if (perso.statut !== "Mort") {
                                    let modifsFirebase = {};
                                    let majRequise = false;

                                    // 1. Régénération
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

                                        modifsFirebase.Fatigue_Actuelle = fatigue;
                                        majRequise = true;
                                    }

                                    // 2. 🔻 DÉCRÉMENTATION DES ÉTATS ALTÉRÉS AU NOUVEAU TOUR 🔻
                                    if (perso.Etats_Alteres && perso.Etats_Alteres.length > 0) {
                                        // Immobilisation : +20 fatigue à chaque tour où le personnage est encore
                                        // immobilisé (donc jusqu'à 2 fois sur ses 2 tours de durée), avant que la
                                        // durée ne soit décrémentée plus bas.
                                        if (perso.Etats_Alteres.some(e => e.nom === "Immobilisation" && e.duree > 0)) {
                                            fatigue = Math.min(fatigueMax, fatigue + 20);
                                            perso.fatigueActuelle = fatigue;

                                            const persoJoueurImmo = (window.COMBAT_PERSOS_JOUEUR || []).find(p => p.idPersonnage === perso.idPersonnage);
                                            if (persoJoueurImmo) persoJoueurImmo.fatigueActuelle = fatigue;

                                            const persoActuelImmo = window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
                                            if (persoActuelImmo && persoActuelImmo.idPersonnage === perso.idPersonnage) {
                                                window.COMBAT_FATIGUE_ACTUELLE = fatigue;
                                            }

                                            modifsFirebase.Fatigue_Actuelle = fatigue;
                                            majRequise = true;
                                        }

                                        // Empoisonnement : 2e et dernier tic (15 fatigue + 8% des PV max), une
                                        // seule fois au début du tour suivant l'application — jamais retenté
                                        // ensuite (tickFait), même si l'état reste affiché encore un tour.
                                        const etatPoison = perso.Etats_Alteres.find(e => e.nom === "Empoisonnement" && !e.tickFait);
                                        if (etatPoison) {
                                            const ancienneFatiguePoison = fatigue;
                                            fatigue = Math.max(0, fatigue - 15);
                                            perso.fatigueActuelle = fatigue;

                                            const pvMaxPoison = parseInt(perso.PV_Max) || 0;
                                            const pvActuelsPoison = perso.PV_Actuels !== undefined ? parseInt(perso.PV_Actuels) : pvMaxPoison;
                                            const nouveauPvPoison = Math.max(0, pvActuelsPoison - Math.ceil(pvMaxPoison * 0.08));
                                            perso.PV_Actuels = nouveauPvPoison;
                                            etatPoison.tickFait = true;

                                            const persoJoueurPoison = (window.COMBAT_PERSOS_JOUEUR || []).find(p => p.idPersonnage === perso.idPersonnage);
                                            if (persoJoueurPoison) {
                                                persoJoueurPoison.fatigueActuelle = fatigue;
                                                persoJoueurPoison.PV_Actuels = perso.PV_Actuels;
                                            }

                                            const persoActuelPoison = window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
                                            if (persoActuelPoison && persoActuelPoison.idPersonnage === perso.idPersonnage) {
                                                window.COMBAT_FATIGUE_ACTUELLE = fatigue;
                                                window.COMBAT_PV_ACTUELS = perso.PV_Actuels;
                                                if (typeof window.mettreAJourJaugeFatigue === "function") window.mettreAJourJaugeFatigue(0);
                                            }

                                            // Même retour visuel qu'une attaque classique (flash + barre qui se
                                            // vide), pour que le tic de début de tour soit visible de tous.
                                            if (ancienneFatiguePoison - fatigue > 0 && typeof window.afficherMessageFlottantHex === "function" && window.TOKENS_VTT_DATA && window.TOKENS_VTT_DATA[perso.idPersonnage]) {
                                                const tkPoisonTour = window.TOKENS_VTT_DATA[perso.idPersonnage];
                                                window.afficherMessageFlottantHex(tkPoisonTour.q, tkPoisonTour.r, `-${ancienneFatiguePoison - fatigue} ⚡`, "#ffaa00");
                                            }
                                            if (pvActuelsPoison - nouveauPvPoison > 0 && typeof window.afficherFlashDegatToken === "function") {
                                                window.afficherFlashDegatToken(perso.idPersonnage, pvActuelsPoison, nouveauPvPoison, pvMaxPoison, `-${pvActuelsPoison - nouveauPvPoison} 🩸`, "#ff4c4c");
                                            }

                                            modifsFirebase.Fatigue_Actuelle = fatigue;
                                            modifsFirebase.PV_Actuels = perso.PV_Actuels;
                                            majRequise = true;
                                        }

                                        // Étalement des dégâts : second et dernier tic, du même
                                        // montant que le premier. Le coup a déjà touché, donc pas
                                        // de nouveau jet d'esquive — mais le bouclier encaisse en
                                        // priorité, comme pour une attaque normale.
                                        const etatEtalement = perso.Etats_Alteres.find(e => e.nom === "Étalement" && !e.tickFait);
                                        if (etatEtalement) {
                                            const montant = parseInt(etatEtalement.degatsRestants) || 0;
                                            etatEtalement.tickFait = true;

                                            if (montant > 0) {
                                                const bouclierAvant = parseInt(perso.Bouclier_Actuel) || 0;
                                                if (bouclierAvant > 0) {
                                                    perso.Bouclier_Actuel = Math.max(0, bouclierAvant - montant);
                                                    modifsFirebase.Bouclier_Actuel = perso.Bouclier_Actuel;
                                                    if (typeof window.afficherFlashDegatToken === "function") {
                                                        const bMax = parseInt(perso.Bouclier_Max) || bouclierAvant || 1;
                                                        window.afficherFlashDegatToken(perso.idPersonnage, bouclierAvant, perso.Bouclier_Actuel, bMax, `-${montant} 🛡️`, "#00ffff", "#00ffff");
                                                    }
                                                } else {
                                                    const pvMaxEtal = parseInt(perso.PV_Max) || 0;
                                                    const pvAvantEtal = perso.PV_Actuels !== undefined ? parseInt(perso.PV_Actuels) : pvMaxEtal;
                                                    perso.PV_Actuels = Math.max(0, pvAvantEtal - montant);
                                                    modifsFirebase.PV_Actuels = perso.PV_Actuels;

                                                    const persoJoueurEtal = (window.COMBAT_PERSOS_JOUEUR || []).find(p => p.idPersonnage === perso.idPersonnage);
                                                    if (persoJoueurEtal) persoJoueurEtal.PV_Actuels = perso.PV_Actuels;

                                                    const persoActuelEtal = window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
                                                    if (persoActuelEtal && persoActuelEtal.idPersonnage === perso.idPersonnage) {
                                                        window.COMBAT_PV_ACTUELS = perso.PV_Actuels;
                                                        if (typeof window.mettreAJourJaugePV === "function") window.mettreAJourJaugePV();
                                                    }
                                                    if (typeof window.afficherFlashDegatToken === "function") {
                                                        window.afficherFlashDegatToken(perso.idPersonnage, pvAvantEtal, perso.PV_Actuels, pvMaxEtal, `-${montant} 🩸`, "#ff4c4c");
                                                    }
                                                }
                                            }
                                            majRequise = true;
                                        }

                                        let etatsAJour = perso.Etats_Alteres.map(e => {
                                            e.duree -= 1;
                                            return e;
                                        }).filter(e => e.duree > 0);

                                        perso.Etats_Alteres = etatsAJour; // MAJ locale
                                        
                                        const persoJoueur = (window.COMBAT_PERSOS_JOUEUR || []).find(p => p.idPersonnage === perso.idPersonnage);
                                        if (persoJoueur) persoJoueur.Etats_Alteres = etatsAJour;

                                        modifsFirebase.Etats_Alteres = etatsAJour;
                                        majRequise = true;
                                    }

                                    if (majRequise) {
                                        const persoRef = window.refCombattant(perso.idPersonnage);
                                        batch.update(persoRef, modifsFirebase);
                                        regenAjoutee = true; // Trigger le commit global
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
                        const persoRef = window.refCombattant(idPersoRepos);
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
    if (queue === undefined && window.PARTIE_DATA) {
        queue = window.PARTIE_DATA.File_Attente_Combat || [];
        phase = window.PARTIE_DATA.Phase_Combat || "Preparation";
    }
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
    piste.style.padding = "0 8px 0 12px";
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

        let etatsHtml = "";
        if (perso.Etats_Alteres && perso.Etats_Alteres.length > 0) {
            etatsHtml = `<div style="position: absolute; bottom: -22px; left: 50%; transform: translateX(-50%); display: flex; gap: 2px; justify-content: center; z-index: 5;">`;
            perso.Etats_Alteres.forEach(etat => {
                etatsHtml += `<img src="${etat.icone}" style="width: 16px; height: auto; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8));">`;
            });
            etatsHtml += `</div>`;
        }

        html += `
        <div ${attributId} class="${classeBulle}" style="position: relative; width: 55px; height: 63px; flex-shrink: 0; margin-top: 0px; margin-bottom: 22px; transition: all 0.4s ease; transform-origin: left center; margin-right: 8px; cursor: pointer;" onclick="window.selectionnerEtCentrerPerso('${item.idPersonnage}')">
            <div style="position: absolute; inset: 0; background: linear-gradient(135deg, #fbf5bd 0%, #c2a878 30%, #5c3a21 50%, #e8d5a5 80%, #ffffff 100%); clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%); display: flex; align-items: center; justify-content: center;">
                <div style="width: 51px; height: 59px; background-color: #1a0f08; clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%); position: relative;">
                    <img src="${imgUrl}" style="width: 100%; height: 100%; object-fit: cover; object-position: top center;">
                    <div style="position: absolute; bottom: 0; left: 0; width: 100%; height: 40%; background: linear-gradient(to top, rgba(0,0,0,0.9), transparent);"></div>
                </div>
            </div>

            <div style="position: absolute; top: -3px; left: -4px; width: 19px; height: 19px; border-radius: 50%; border: 1px solid #e8d5a5; background: #1a0f08; box-shadow: 0 2px 5px rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center; z-index: 2;">
                <span style="color: #e8d5a5; font-family: 'Cinzel', serif; font-size: 10px; font-weight: bold; text-shadow: 1px 1px 3px black, 0 0 5px rgba(232, 213, 165, 0.5);">${affichageInit}</span>
            </div>

            <div style="position: absolute; bottom: 4px; left: -5px; width: 25px; height: 4px; background: #000; border: 1px solid #1a0f08; border-radius: 2px; transform: rotate(30deg); transform-origin: center; box-shadow: 0 2px 4px rgba(0,0,0,0.8); overflow: hidden; z-index: 2;">
                <div style="position: absolute; top: 0; right: 0; width: ${pctPv}%; height: 100%; background: linear-gradient(to right, #e63946, #ff8b8b); transition: width 0.3s ease;"></div>
            </div>

            <div style="position: absolute; bottom: 4px; right: -5px; width: 25px; height: 4px; background: #000; border: 1px solid #1a0f08; border-radius: 2px; transform: rotate(-30deg); transform-origin: center; box-shadow: 0 2px 4px rgba(0,0,0,0.8); overflow: hidden; z-index: 2;">
                <div style="position: absolute; top: 0; left: 0; width: ${pctFatigue}%; height: 100%; background: linear-gradient(to right, #c2a878, #fbf5bd); transition: width 0.3s ease;"></div>
            </div>
            ${etatsHtml}
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
    const phase = partie.Phase_Combat || "Preparation";
    
    const persoInQueue = simulationAction ? { idCarte: simulationAction } : queue.find(q => q.idPersonnage === persoActuel.idPersonnage);

    // Dé-sélection visuelle si la carte en aperçu n'est plus finançable
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
    
    if (deckEl) deckEl.style.transition = "opacity 0.3s ease, filter 0.3s ease";

    let divRepos = document.getElementById("apercu-repos-long-ui");
    if (!divRepos) {
        divRepos = document.createElement("div");
        divRepos.id = "apercu-repos-long-ui";
        divRepos.style.cssText = "position: absolute; top: 9vh; left: 50px; width: 340px; height: 300px; z-index: 100; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; opacity: 0; transition: opacity 0.3s ease, left 0.4s cubic-bezier(0.25, 0.8, 0.25, 1); pointer-events: none;";
        divRepos.innerHTML = `
            <div style="font-size: 72px; filter: drop-shadow(0 0 20px rgba(194, 168, 120, 0.8)); animation: levitation 3s infinite alternate ease-in-out;">⏳</div>
            <div style="font-family: 'Cinzel', serif; font-size: 24px; font-weight: bold; color: #e8d5a5; text-shadow: 2px 2px 5px black; margin-top: 10px; text-transform: uppercase; letter-spacing: 2px;">Repos Long</div>
            <div style="font-family: 'Almendra', serif; font-size: 17px; color: #c2a878; text-shadow: 1px 1px 3px black; margin-top: 10px; text-align: center; max-width: 80%;">Concentration et souffle.<br><br><span style="color:#1b6e3a;">+35% Énergie Max</span> à la fin du tour.</div>
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
        // 🔻 CORRECTION 2 : Si la phase est "Resolution", c'est qu'il a déjà joué et n'est plus dans la file ! On grise son deck.
        if (deckEl) {
            if (phase === "Resolution") {
                deckEl.style.opacity = "0.4";
                deckEl.style.pointerEvents = "none";
                deckEl.style.filter = "grayscale(100%)";
            } else {
                deckEl.style.opacity = "1";
                deckEl.style.pointerEvents = "auto";
                deckEl.style.filter = "none";
            }
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
            const persoRef = window.refCombattant(persoActuel.idPersonnage);
            
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
        const { doc, deleteDoc, updateDoc, deleteField } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");

        // A. Reset de la Partie (Tour 1, file vide)
        if (window.ID_PARTIE_COURANTE) {
            const partieRef = doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE);
            await updateDoc(partieRef, {
                File_Attente_Combat: [],
                Phase_Combat: "Preparation",
                Tour_Combat: 1
            });
        }

        // A bis. Les Illusions ne survivent pas au combat : c'est le seul vrai "fin de combat"
        // disponible dans le jeu (pas de bouton dédié pour ça), donc leur nettoyage est accroché ici.
        // Les zones persistantes ne survivent pas à une réinitialisation de combat. Là encore,
        // updateDoc et pas setDoc/merge : sinon la map vide ne supprimerait rien du tout.
        if (window.ID_PARTIE_COURANTE) {
            window.ZONES_PERSISTANTES = {};
            if (typeof window.sauvegarderZonesPersistantes === "function") {
                await window.sauvegarderZonesPersistantes({}).catch(e => console.error(e));
            }
            if (typeof window.appliquerZonesPersistantes === "function") window.appliquerZonesPersistantes();
        }

        // A ter. Les monstres non plus ne survivent pas au combat : documents, pions,
        // initiative et réserve de renforts sont effacés d'un bloc (cf. monstres.js).
        if (typeof window.nettoyerMonstresCombat === "function") {
            await window.nettoyerMonstresCombat().catch(e => console.error(e));
        }

        const illusions = (window.PERSOS_PARTIE || []).filter(p => p.estIllusion);
        if (illusions.length > 0 && window.ID_PARTIE_COURANTE) {
            const vttRef = doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE);
            for (const illusion of illusions) {
                delete window.TOKENS_VTT_DATA[illusion.idPersonnage];
                await deleteDoc(doc(db, "Personnages", illusion.idPersonnage)).catch(e => console.error(e));
                await updateDoc(vttRef, { ["Tokens." + illusion.idPersonnage]: deleteField() }).catch(e => console.error(e));
            }
            if (typeof window.appliquerTokensVTT === "function") window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
        }

        // B. Reset des Personnages (Soin total de la Vie et de l'Énergie)
        if (window.PERSOS_PARTIE && window.PERSOS_PARTIE.length > 0) {
            for (let perso of window.PERSOS_PARTIE) {
                // Les illusions viennent d'être supprimées juste au-dessus, mais PERSOS_PARTIE
                // les contient encore (le snapshot Firestore n'est pas revenu). Les soigner
                // reviendrait à écrire dans un document effacé : updateDoc lève alors une
                // erreur qui interrompait TOUTE la boucle, laissant les personnages suivants
                // sans soin. On les saute donc explicitement.
                if (perso.estIllusion) continue;

                const pvMax = (parseInt(perso.PV_Max) || 1) + (parseInt(perso.Dev_Mod_PV) || 0);
                const fatigueMax = parseInt(perso.Fatigue_Max) || parseInt(perso.fatigueMax) || 100;

                // Mise à jour locale immédiate (évite d'attendre le snapshot)
                perso.PV_Actuels = pvMax;
                perso.fatigueActuelle = fatigueMax;
                perso.Bouclier_Max = 0;
                perso.Bouclier_Actuel = 0;

                const persoActuel = window.COMBAT_PERSOS_JOUEUR && window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
                if (persoActuel && persoActuel.idPersonnage === perso.idPersonnage) {
                    window.COMBAT_PV_MAX = pvMax;
                    window.COMBAT_PV_ACTUELS = pvMax;
                    window.COMBAT_FATIGUE_MAX = fatigueMax;
                    window.COMBAT_FATIGUE_ACTUELLE = fatigueMax;
                }

                // Un échec sur un combattant (document supprimé entre-temps, coupure réseau)
                // ne doit jamais empêcher les suivants d'être soignés.
                const persoRef = window.refCombattant(perso.idPersonnage);
                await updateDoc(persoRef, {
                    PV_Actuels: pvMax,
                    Fatigue_Actuelle: fatigueMax,
                    Bouclier_Max: 0,
                    Bouclier_Actuel: 0
                }).catch(e => console.error(`Reset de ${perso.idPersonnage} :`, e));
            }
        }

        if (typeof window.mettreAJourJaugePV === "function") window.mettreAJourJaugePV();
        if (typeof window.mettreAJourJaugeFatigue === "function") window.mettreAJourJaugeFatigue(0);
        if (typeof window.appliquerTokensVTT === "function") window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
        
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

// =========================================================================
//  GESTION DES ENNEMIS (SPAWN & RESET)
// =========================================================================

// Outil mutualisé : Cherche la case vide la plus proche du centre
window.trouverHexLibreVTT = function(tokensData) {
    function estHexLibre(q, r) {
        if (!window.PLATEAU_VTT) return false;
        const state = window.PLATEAU_VTT.getCaseState(q, r);
        if (state.isDeleted || state.isBlocked) return false;
        for (let id in tokensData) {
            if (tokensData[id].q === q && tokensData[id].r === r) return false;
        }
        return true;
    }

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
};

// Le bouton 💀 des options de combat ouvre désormais la fenêtre de génération de
// rencontre (window.ouvrirGenerationRencontre, cf. monstres.js) : composition tirée
// au sort d'après le tableau des rencontres, noms trouvés par l'IA, stats héritées
// des gabarits. L'ancien ennemi de test générique (Sbire 50 PV) n'existe plus.

// 2. Bouton "Reset" : Soigne tous les ennemis à 100%
window.resetEnnemisTest = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (!window.ID_PARTIE_COURANTE || !window.PERSOS_PARTIE) return;

    // Ne cible que les ennemis vivants
    const ennemis = window.PERSOS_PARTIE.filter(p => p.camp === "Ennemi" && p.statut !== "Mort");
    if (ennemis.length === 0) return;

    try {
        const { doc, writeBatch } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
        const batch = writeBatch(db);

        ennemis.forEach(ennemi => {
            const ref = window.refCombattant(ennemi.idPersonnage);
            batch.update(ref, {
                PV_Actuels: (parseInt(ennemi.PV_Max) || 50) + (parseInt(ennemi.Dev_Mod_PV) || 0),
                Fatigue_Actuelle: parseInt(ennemi.Fatigue_Max) || 100
            });
        });

        await batch.commit();
        console.log("🔄 Les ennemis ont récupéré toute leur santé et énergie !");
        
    } catch(e) {
        console.error("Erreur reset ennemis :", e);
    }
};
