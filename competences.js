// =========================================================================
//  IVALIS - MODULE DES COMPÉTENCES DE COMBAT
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { collection, getDocs, doc, setDoc, getDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Variables globales pour le Deck interactif
window.COMPETENCES_CACHE = {};

// =========================================================================
//  TITRES DE BANNIÈRE : ILS RÉTRÉCISSENT AU LIEU D'ÊTRE COUPÉS
// =========================================================================
//  Un nom de technique trop long finissait en "Souffle corrom…" : la bannière
//  a une largeur fixe et le texte était tronqué. On mesure plutôt le débordement
//  et on réduit la taille du texte jusqu'à ce qu'il tienne, comme le fait déjà
//  le nom du personnage dans le panneau de combat. L'ellipse reste en dernier
//  recours, pour un nom qui déborderait encore au plancher de lisibilité.
window.TAILLE_MIN_TITRE_BANNIERE = 9;

window.ajusterTitresBannieres = function(racine) {
    const zone = racine || document;
    const titres = zone.querySelectorAll ? zone.querySelectorAll(".titre-auto-reduit") : [];
    if (!titres || titres.length === 0) return;

    const ajuster = () => {
        titres.forEach(el => {
            const maxi = parseFloat(el.dataset.tailleMax) || 17;
            // Invisible ou pas encore disposé : rien à mesurer, on repassera.
            if (!el.clientWidth) return;
            let taille = maxi;
            el.style.fontSize = taille + "px";
            // Une demi-graduation à la fois : l'œil ne voit pas la marche, et on
            // ne descend jamais sous le plancher de lisibilité.
            while (el.scrollWidth > el.clientWidth + 1 && taille > window.TAILLE_MIN_TITRE_BANNIERE) {
                taille = Math.max(window.TAILLE_MIN_TITRE_BANNIERE, taille - 0.5);
                el.style.fontSize = taille + "px";
            }
        });
    };

    ajuster();
    // La police Cinzel arrive souvent après le premier rendu : ce qui tenait
    // avec la police de repli peut déborder une fois la vraie police posée.
    requestAnimationFrame(ajuster);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajuster).catch(() => {});
};
window.CARTES_SELECTIONNEES = [];
window.COULEUR_PERSO_COURANT = "#4a1c1c";
window.ID_PERSONNAGE_DECK = null;
window.CARTES_MAX_PERSO = 0;
window.CARTE_EN_APERCU = null;

const IMAGE_CADRE_NORMAL = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png";
const IMAGE_CADRE_SELECTIONNE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1783286721/ban_cible_pdpnad.png";
// La bannière grisée du combat (combat.js) : une technique que l'arme en main
// empêche de lancer.
const IMAGE_CADRE_EPUISE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1783286721/ban_epuis%C3%A9_otc70l.png";

// UNE TECHNIQUE QUE L'ARME EMPÊCHE NE RESTE PAS MÉMORISÉE. Retire du deck
// équipé de ce héros toutes celles que ses armes en main bloquent, l'écrit en
// base et en mémoire, et rend ce qui a été retiré ({ id, nom, arme, raison }).
window.retirerCartesBloqueesDuDeck = async function(idPersonnage) {
    const perso = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPersonnage);
    if (!perso || typeof window.competencesBloqueesParArme !== "function") return [];
    const bloquees = window.competencesBloqueesParArme(perso);
    const ficheOuverte = window.ID_PERSONNAGE_DECK === idPersonnage && Array.isArray(window.CARTES_SELECTIONNEES);
    const deck = ficheOuverte ? window.CARTES_SELECTIONNEES : (perso.deckEquipe || []);
    const retirees = bloquees.filter(c => deck.includes(c.id));
    if (retirees.length === 0) return [];
    const reste = deck.filter(id => !retirees.some(c => c.id === id));
    perso.deckEquipe = reste;
    if (ficheOuverte) window.CARTES_SELECTIONNEES = [...reste];
    try {
        await updateDoc(doc(db, "Personnages", idPersonnage), { Deck_Equipe: reste });
    } catch (e) {
        console.error("Deck après changement d'arme :", e);
    }
    return retirees;
};

window.chargerOngletCompetences = async function(idPersonnage, competencesMax = 6) {
    const spanMax = document.getElementById("affichage-competences-max");
    const spanRestantes = document.getElementById("affichage-competences-restantes");
    const btnCreer = document.getElementById("btn-creer-competence");
    const listeDiv = document.getElementById("liste-competences-perso");

    if (spanMax) spanMax.innerText = competencesMax;

    window.ID_PERSONNAGE_DECK = idPersonnage;
    window.CARTES_MAX_PERSO = competencesMax; 
    window.CARTES_SELECTIONNEES = [];
    window.COULEUR_PERSO_COURANT = "#4a1c1c";

    try {
        // 🔻 1. LECTURE ZÉRO LATENCE : Deck et Couleur depuis la RAM 🔻
        let persoData = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPersonnage);

        if (persoData) {
            window.COULEUR_PERSO_COURANT = persoData.couleur || "#4a1c1c";
            window.CARTES_SELECTIONNEES = persoData.deckEquipe || [];
        } else {
            // Fallback BDD si non trouvé en RAM
            const persoRef = doc(db, "Personnages", idPersonnage);
            const persoSnap = await getDoc(persoRef);
            if (persoSnap.exists()) {
                const dataPerso = persoSnap.data();
                window.COULEUR_PERSO_COURANT = dataPerso.Couleur || "#4a1c1c";
                window.CARTES_SELECTIONNEES = dataPerso.Deck_Equipe || [];
                // Son expérience, pour les compétences que son niveau permet de créer.
                persoData = { idPersonnage, XP: dataPerso.XP, Classe: dataPerso.Classe, Race: dataPerso.Race };
            }
        }

        // 🔻 2. LECTURE ZÉRO LATENCE : Compétences depuis la RAM 🔻
        let competencesObject = window.CACHE_COMPETENCES_GLOBAL[idPersonnage];

        // Fallback BDD si l'écouteur n'a pas encore eu le temps de remplir le cache
        if (!competencesObject) {
            const colRef = collection(db, "Personnages", idPersonnage, "Competences");
            const snap = await getDocs(colRef);
            competencesObject = {};
            snap.forEach(docSnap => {
                competencesObject[docSnap.id] = docSnap.data();
            });
            window.CACHE_COMPETENCES_GLOBAL[idPersonnage] = competencesObject;
        }

        window.COMPETENCES_CACHE = {}; // On vide le cache d'affichage à l'ouverture

        // On stocke tout dans un tableau pour pouvoir les trier
        let competencesArray = [];
        Object.keys(competencesObject).forEach(key => {
            const data = competencesObject[key];
            window.COMPETENCES_CACHE[key] = data; // Mise en cache HD
            competencesArray.push({ id: key, data: data });
        });

        // NOUVEAU : Tri par Initiative (de la plus grande à la plus petite)
        competencesArray.sort((a, b) => {
            const initA = a.data.Initiative || 0;
            const initB = b.data.Initiative || 0;
            return initB - initA;
        });

        // LE NIVEAU DONNE DES COMPÉTENCES À CRÉER, PAS DE LA PLACE EN MAIN.
        // Chaque « +1 compétence » de la grille d'expérience (experience.js)
        // ouvre une création de plus dans la Forge ; la limite des cartes
        // mémorisées pour le combat (competencesMax) ne bouge pas.
        const fichePerso = persoData || (window.PERSOS_JOUEURS_PARTIE || []).find(p => p.idPersonnage === idPersonnage);
        const niveauPerso = (typeof window.niveauDepuisXP === "function")
            ? window.niveauDepuisXP(window.xpDuPerso(fichePerso || {})) : 1;
        const bonusNiveau = (typeof window.competencesDeNiveau === "function")
            ? window.competencesDeNiveau(niveauPerso) : 0;
        window.CREATIONS_MAX_PERSO = competencesMax + bonusNiveau;
        const detailNiveau = document.getElementById("affichage-competences-niveau");
        if (detailNiveau) {
            detailNiveau.textContent = bonusNiveau > 0
                ? `dont ${bonusNiveau} gagnée${bonusNiveau > 1 ? "s" : ""} au niveau ${niveauPerso}` : "";
        }

        // LES TECHNIQUES QUE L'ARME EN MAIN EMPÊCHE : grisées comme en combat,
        // et retirées des compétences mémorisées si elles l'étaient.
        const persoArmes = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPersonnage);
        const bloqueesParArme = new Map((typeof window.competencesBloqueesParArme === "function" && persoArmes
            ? window.competencesBloqueesParArme(persoArmes) : []).map(c => [c.id, c.raison]));
        // Pas attendu : le deck est corrigé en mémoire tout de suite (avant le
        // premier await de la fonction), l'écriture en base suit.
        if (window.CARTES_SELECTIONNEES.some(id => bloqueesParArme.has(id))) {
            window.retirerCartesBloqueesDuDeck(idPersonnage);
        }

        const nbCreees = competencesArray.length;
        const nbRestantes = window.CREATIONS_MAX_PERSO - nbCreees;

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

        // LES TECHNIQUES DE CLASSE (Hoplite), sous une séparation : elles ne
        // se forgent ni ne se mémorisent — la classe les donne, hors limite.
        // Celles d'un palier pas encore atteint restent grisées, avec leur niveau.
        const sectionClasse = typeof htmlTechniquesDeClasse === "function" ? htmlTechniquesDeClasse(fichePerso) : "";

        // LES TECHNIQUES DE CLASSE ATTENDENT LA PREMIÈRE COMPÉTENCE (Nico) :
        // tant que le joueur n'a rien forgé, l'onglet ne montre que l'invitation
        // à forger — la classe se découvre ensuite, sous ses compétences.
        if (nbCreees === 0) {
            listeDiv.innerHTML = `<p style="text-align: center; font-style: italic; color: #5c3a21; margin-top: 20px;">Le héros n'a pas encore forgé ses techniques de combat.</p>`;
            return;
        }

        // 3. AFFICHAGE DES BANNIÈRES
        let htmlDeck = `
            <div style="position: sticky; top: -20px; z-index: 50; background: rgba(232, 213, 165, 0.95); backdrop-filter: blur(5px); border-bottom: 3px solid #5c3a21; padding: 12px 20px; margin: 10px -20px 20px -20px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 5px 15px rgba(0,0,0,0.5); font-family: 'Cinzel', serif; font-size: 18px; color: #2c1e16; font-weight: bold;">
                <span>Grimoire de Combat</span>
                <span>Mémorisées : <span id="compteur-cartes-actuel" style="color: ${window.CARTES_SELECTIONNEES.length >= window.CARTES_MAX_PERSO ? '#ff4c4c' : '#1b6e3a'}">${window.CARTES_SELECTIONNEES.length}</span> / ${window.CARTES_MAX_PERSO}</span>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 0px; width: 100%; max-width: 580px; margin: 15px 0; padding-bottom: 80px;">
        `;

        // NOUVEAU : Récupération de l'espacement personnalisé (ou valeur par défaut plus resserrée : -85px)
        window.ESPACEMENT_BANNIERES_COMBAT = parseInt(localStorage.getItem("ivalis_espacement_bannieres")) || -85;

        // La croix rouge d'effacement : outil de développement, donc réservée au
        // mode développeur des paramètres. Posée à droite de la bannière, hors du
        // calque de clic qui sert à équiper la carte, pour qu'un doigt un peu
        // large n'efface jamais une technique en croyant l'équiper.
        const modeDev = localStorage.getItem("ivalis_DEV_MODE") === "on";
        // Le nom n'est pas passé en attribut : un titre contenant un guillemet ou
        // un chevron casserait le HTML. La fonction le relit dans le cache.
        const croixSuppression = (idCarte) => modeDev ? `
                    <div onclick="event.stopPropagation(); window.supprimerCompetencePerso('${idCarte}')"
                         title="Effacer définitivement cette technique"
                         style="position: absolute; top: 34px; right: 4px; width: 30px; height: 30px; z-index: 6;
                                display: flex; align-items: center; justify-content: center; cursor: pointer;
                                pointer-events: auto; border-radius: 50%; background: rgba(20, 8, 8, 0.92);
                                border: 1px solid #ff4c4c; color: #ff4c4c; font-family: 'Cinzel', serif;
                                font-size: 17px; font-weight: bold; line-height: 1;
                                box-shadow: 0 2px 6px rgba(0,0,0,0.8); transition: transform 0.15s ease;"
                         onmouseover="this.style.transform='scale(1.2)'; this.style.color='#ffffff'; this.style.background='#7a1414';"
                         onmouseout="this.style.transform='scale(1)'; this.style.color='#ff4c4c'; this.style.background='rgba(20, 8, 8, 0.92)';">✕</div>` : "";

        // Boucle sur le tableau TRIÉ
        competencesArray.forEach((comp, indexCarte) => {
            const data = comp.data;
            const idCarte = comp.id;
            const titre = data.Nom || "Technique Inconnue";
            const initiative = data.Initiative || 0;

            const estSelectionnee = window.CARTES_SELECTIONNEES.includes(idCarte);
            const raisonArme = bloqueesParArme.get(idCarte) || null;
            let isSelStr = estSelectionnee ? "true" : "false";
            let decalageX = estSelectionnee ? "80px" : "0px";
            let urlCadre = raisonArme ? IMAGE_CADRE_EPUISE : (estSelectionnee ? IMAGE_CADRE_SELECTIONNE : IMAGE_CADRE_NORMAL);
            const classeArme = raisonArme ? " banniere-epuisee banniere-bloquee-arme" : "";
            const survolArme = raisonArme ? ` title="${raisonArme.replace(/"/g, "&quot;")}"` : "";

            const zIndexBase = 2;

            // pointer-events: none sur le conteneur : les bannières se chevauchent volontairement
            // (marge négative) et le rectangle plein d'une carte débordait sur la zone de clic de
            // la carte suivante, même dans ses zones visuellement vides — il volait alors une
            // partie de son clic quel que soit l'ordre d'empilement (z-index) choisi. En rendant
            // le conteneur transparent aux clics et en ne réactivant pointer-events que sur le
            // calque de clic réel (dimensions exactes du rectangle de couleur), seul ce calque
            // peut être touché : plus aucun risque qu'une carte en vole une autre.
            htmlDeck += `
                <div id="ui-carte-${idCarte}" class="banniere-carte${classeArme}" data-selectionnee="${isSelStr}"${raisonArme ? ` data-bloquee-arme="true"` : ""}
                     style="position: relative; width: 100%; height: 160px; display: flex; align-items: center; transition: transform 0.2s ease; margin-bottom: ${window.ESPACEMENT_BANNIERES_COMBAT}px; z-index: ${zIndexBase}; transform: translateX(${decalageX}); pointer-events: none;"
                     onmouseover="this.style.transform = this.dataset.selectionnee === 'true' ? 'translateX(95px)' : 'translateX(12px)';"
                     onmouseout="this.style.transform = this.dataset.selectionnee === 'true' ? 'translateX(80px)' : 'translateX(0px)';">

                    <div style="position: absolute; top: 47px; bottom: 55px; left: 115px; right: 57px; z-index: 1; border-radius: 0 15px 15px 0; background-color: ${window.COULEUR_PERSO_COURANT};"></div>

                    <div id="cadre-carte-${idCarte}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: url('${urlCadre}'); background-size: contain; background-position: center; background-repeat: no-repeat; z-index: 2; filter: drop-shadow(0px 6px 4px rgba(0,0,0,0.6));"></div>

                    <div style="position: absolute; top: 44%; transform: translateY(-50%); left: 57px; width: 69px; text-align: center; color: #e0d0b0; font-family: 'Cinzel', serif; font-size: 30px; font-weight: bold; z-index: 3; text-shadow: 2px 2px 5px black; pointer-events: none;">${initiative}</div>

                    <div class="titre-auto-reduit" data-taille-max="17" style="position: absolute; top: 48%; transform: translateY(-50%); left: 120px; right: 20px; text-align: center; color: #e0d0b0; font-family: 'Cinzel', serif; font-size: 17px; text-transform: uppercase; font-weight: bold; z-index: 3; text-shadow: 1px 1px 3px black; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;">${titre}</div>

                    <div onclick="window.gererClicCarte('${idCarte}')"${survolArme} style="position: absolute; top: 47px; bottom: 55px; left: 115px; right: 57px; z-index: 4; cursor: pointer; pointer-events: auto;"></div>
                    ${croixSuppression(idCarte)}
                </div>
            `;
        });

        htmlDeck += sectionClasse + `</div>`;
        listeDiv.innerHTML = htmlDeck;
        window.ajusterTitresBannieres(listeDiv);

    } catch (e) {
        console.error("Erreur de lecture des compétences :", e);
    }
};

// La section « Techniques de classe » de l'onglet Compétences : vide pour une
// classe qui n'en a pas. Mêmes bannières que les techniques forgées (cadre,
// couleur du héros, initiative, titre) ; celles d'un palier pas encore atteint
// prennent le cadre grisé et disent leur niveau au survol. Elles ne se
// mémorisent pas : un clic ouvre seulement la carte en grand.
function htmlTechniquesDeClasse(perso) {
    if (!perso || typeof window.toutesTechniquesDeClasse !== "function") return "";
    const toutes = window.toutesTechniquesDeClasse(perso);
    if (toutes.length === 0) return "";
    const acquises = window.techniquesDeClasse(perso);
    const echapper = (t) => String(t || "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    const espacement = window.ESPACEMENT_BANNIERES_COMBAT || -85;
    const bannieres = toutes.map(({ id, niveau }) => {
        const t = window.TECHNIQUES_CLASSE[id];
        const acquise = acquises.includes(id);
        const statut = acquise ? "Une fois par combat" : `Niveau ${niveau} requis`;
        const couleurTexte = acquise ? "#e0d0b0" : "#888888";
        return `
            <div id="ui-carte-${id}" class="banniere-carte technique-classe${acquise ? "" : " banniere-epuisee technique-classe-verrouillee"}" data-technique="${id}" data-statut="${statut}"
                 style="position: relative; width: 100%; height: 160px; display: flex; align-items: center; transition: transform 0.2s ease; margin-bottom: ${espacement}px; z-index: 2; pointer-events: none;"
                 onmouseover="this.style.transform='translateX(12px)';" onmouseout="this.style.transform='translateX(0px)';">
                <div style="position: absolute; top: 47px; bottom: 55px; left: 115px; right: 57px; z-index: 1; border-radius: 0 15px 15px 0; background-color: ${window.COULEUR_PERSO_COURANT};"></div>
                <div id="cadre-carte-${id}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background-image: url('${acquise ? IMAGE_CADRE_NORMAL : IMAGE_CADRE_EPUISE}'); background-size: contain; background-position: center; background-repeat: no-repeat; z-index: 2; filter: drop-shadow(0px 6px 4px rgba(0,0,0,0.6));"></div>
                <div style="position: absolute; top: 44%; transform: translateY(-50%); left: 57px; width: 69px; text-align: center; color: ${couleurTexte}; font-family: 'Cinzel', serif; font-size: 30px; font-weight: bold; z-index: 3; text-shadow: 2px 2px 5px black; pointer-events: none;">${t.Initiative}</div>
                <div class="titre-auto-reduit" data-taille-max="17" style="position: absolute; top: 48%; transform: translateY(-50%); left: 120px; right: 20px; text-align: center; color: ${couleurTexte}; font-family: 'Cinzel', serif; font-size: 17px; text-transform: uppercase; font-weight: bold; z-index: 3; text-shadow: 1px 1px 3px black; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;">${echapper(t.Nom)}</div>
                <div onclick="window.apercuTechniqueClasse('${id}')" title="${echapper(t.Nom)} — ${statut}" style="position: absolute; top: 47px; bottom: 55px; left: 115px; right: 57px; z-index: 4; cursor: pointer; pointer-events: auto;"></div>
            </div>`;
    }).join("");
    return `
        <div class="separation-techniques-classe" id="section-techniques-classe">
            <span>Techniques de classe</span>
        </div>
        <p class="techniques-classe-aide">Données par la classe : toujours disponibles en combat, sans compter dans les compétences mémorisées.</p>
        ${bannieres}`;
}

// Un clic sur une technique de classe : la même mise en avant et la même
// carte en grand qu'une technique forgée, sans le second clic qui mémorise.
window.apercuTechniqueClasse = function(idCarte) {
    window.CARTE_EN_APERCU = idCarte;
    document.querySelectorAll('.banniere-carte').forEach(el => { el.style.filter = "none"; });
    const carteDiv = document.getElementById(`ui-carte-${idCarte}`);
    if (carteDiv) carteDiv.style.filter = "drop-shadow(0px 0px 8px rgba(0, 255, 255, 0.8)) brightness(1.1)";
    window.afficherApercuCarteHD(idCarte);
};

// =========================================================================
//  EFFACER UNE TECHNIQUE (OUTIL DE DÉVELOPPEMENT)
// =========================================================================
//  La croix rouge des bannières, visible seulement en mode développeur.
//  Une technique ne vit pas qu'à un seul endroit : son document dans la
//  sous-collection du personnage, son identifiant dans le deck équipé, les
//  deux caches en mémoire, et — si un combat tourne — l'entrée de la file
//  d'attente qui la désigne. En oublier un laisse une carte fantôme : la
//  piste d'initiative annonce un tour qui ne pourra jamais se jouer.

window.supprimerCompetencePerso = async function(idCarte, titre) {
    const idPersonnage = window.ID_PERSONNAGE_DECK;
    if (!idPersonnage || !idCarte) return;

    const nom = titre || (window.COMPETENCES_CACHE[idCarte] || {}).Nom || "cette technique";
    if (!confirm(`Effacer définitivement « ${nom} » ?\n\nLa carte disparaîtra de la base : c'est irréversible.`)) return;
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    // La bannière s'efface tout de suite : le réseau peut prendre une seconde.
    const banniere = document.getElementById("ui-carte-" + idCarte);
    if (banniere) {
        banniere.style.transition = "opacity 0.25s ease, transform 0.25s ease";
        banniere.style.opacity = "0";
        banniere.style.transform = "translateX(-40px)";
    }

    // Son illustration (illustration_competence.js), lue AVANT d'effacer le
    // document : c'est lui qui en garde l'adresse.
    let urlImage = ((window.COMPETENCES_CACHE || {})[idCarte] || {}).URL_Image
        || (((window.CACHE_COMPETENCES_GLOBAL || {})[idPersonnage] || {})[idCarte] || {}).URL_Image || "";
    if (!urlImage) {
        try {
            const snap = await getDoc(doc(db, "Personnages", idPersonnage, "Competences", idCarte));
            if (snap.exists()) urlImage = snap.data().URL_Image || "";
        } catch (e) { /* sans réseau, l'effacement ci-dessous échouera de toute façon */ }
    }

    try {
        // 1. Le document de la technique.
        await deleteDoc(doc(db, "Personnages", idPersonnage, "Competences", idCarte));

        // 1 bis. Son illustration quitte Cloudinary (sans faire attendre le MJ),
        //        et si elle était encore en file ou en train de se dessiner,
        //        la commande est annulée.
        if (typeof window.annulerIllustration === "function") window.annulerIllustration(idPersonnage, idCarte);
        if (urlImage && typeof window.supprimerImageCloudinary === "function") {
            window.supprimerImageCloudinary(urlImage);
        }

        // 2. Le deck équipé, s'il la portait.
        if (Array.isArray(window.CARTES_SELECTIONNEES) && window.CARTES_SELECTIONNEES.includes(idCarte)) {
            window.CARTES_SELECTIONNEES = window.CARTES_SELECTIONNEES.filter(id => id !== idCarte);
            await updateDoc(doc(db, "Personnages", idPersonnage), {
                Deck_Equipe: window.CARTES_SELECTIONNEES
            }).catch(e => console.error("Deck après suppression :", e));
        }

        // 3. Les caches en mémoire, pour que rien ne la ressuscite au prochain rendu.
        if (window.CACHE_COMPETENCES_GLOBAL && window.CACHE_COMPETENCES_GLOBAL[idPersonnage]) {
            delete window.CACHE_COMPETENCES_GLOBAL[idPersonnage][idCarte];
        }
        if (window.COMPETENCES_CACHE) delete window.COMPETENCES_CACHE[idCarte];
        const persoRam = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idPersonnage);
        if (persoRam && Array.isArray(persoRam.deckEquipe)) {
            persoRam.deckEquipe = persoRam.deckEquipe.filter(id => id !== idCarte);
        }

        // 4. La file d'attente du combat, si la carte y était déjà posée : sans ça
        //    son tour arriverait avec une technique introuvable.
        if (window.ID_PARTIE_COURANTE && typeof window.modifierPartie === "function") {
            await window.modifierPartie((data) => {
                const file = data.File_Attente_Combat || [];
                const propre = file.filter(f => f.idCarte !== idCarte);
                if (propre.length === file.length) return null;
                return { maj: { File_Attente_Combat: propre } };
            });
        }

        console.log(`🗑️ Technique « ${nom} » effacée pour ${idPersonnage}.`);
    } catch (e) {
        console.error("Erreur de suppression d'une compétence :", e);
        alert("La technique n'a pas pu être effacée. Vérifie ta connexion.");
        if (banniere) { banniere.style.opacity = "1"; banniere.style.transform = "translateX(0)"; }
        return;
    }

    // Le compteur de cartes restantes et la liste se redessinent.
    if (typeof window.chargerOngletCompetences === "function") {
        window.chargerOngletCompetences(idPersonnage, window.CARTES_MAX_PERSO || 6);
    }
};

// =========================================================================
//  LOGIQUE DES CLICS (Aperçu vs Équiper)
// =========================================================================

window.gererClicCarte = function(idCarte) {
    // if (typeof window.jouerSonClic === "function") window.jouerSonClic();

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

// OÙ SE POSE LA CARTE EN GRAND, PENDANT UN COMBAT.
//
// Elle se posait à 400 px en simple aperçu, et glissait à 20 px une fois
// retenue — c'est-à-dire pile sur les bannières. Tant que celles-ci vivaient
// dans le panneau de gauche, ça n'avait aucune importance : la carte était
// posée DANS ce panneau et passait devant. Depuis que les bannières pendent du
// volet, la carte se retrouvait dessous, illisible et à moitié cachée.
//
// Elle reste donc à droite du volet dans les deux cas. Le volet occupe les
// 380 premiers pixels, les bannières s'arrêtent à 360 : à 400, la carte ne
// touche rien. Et sa petite glissade de disparition s'arrête à 365 au lieu de
// filer jusqu'à 50, pour ne pas traverser les bannières en s'effaçant.
const APERCU_CARTE_X = "400px";
const APERCU_CARTE_X_CACHE = "365px";

// À QUI EST CETTE CARTE ? Son propriétaire dans le cache des compétences s'il
// est connu ; sinon, sur une fiche ouverte, le personnage de la fiche ; sinon,
// en combat, le héros affiché. Un propriétaire introuvable rend null : mieux
// vaut aucune portée d'arme que celle d'un autre.
window.porteurPourApercu = function(idCarte) {
    const parId = (id) => id ? ((window.PERSOS_PARTIE || []).find(p => p && p.idPersonnage === id)
        || (window.COMBAT_PERSOS_JOUEUR || []).find(p => p && p.idPersonnage === id) || null) : null;
    const proprio = typeof window.proprietaireDeLaCarte === "function" ? window.proprietaireDeLaCarte(idCarte) : null;
    if (proprio) return parId(proprio);
    const fiche = document.getElementById("fenetre-fiche-perso");
    const champ = document.getElementById("champ-id-personnage");
    if (fiche && fiche.style.display !== "none" && champ && champ.value) return parId(champ.value);
    return (window.COMBAT_PERSOS_JOUEUR || [])[window.COMBAT_INDEX_PERSO] || null;
};

// =========================================================================
//  L'ÉNERGIE DU HÉROS SOUS LA CARTE (combat)
// =========================================================================
//  Quand on choisit une compétence à jouer, la jauge d'énergie du héros
//  s'affiche sous la carte : l'énergie actuelle, et en rouge clignotant ce que
//  la carte (et le trajet déjà tracé) va coûter, avec le chiffre qui restera.
//  Pour le repos long, l'encart du repos prend la place de la carte, et la même
//  jauge montre en vert clignotant l'énergie regagnée.
window.energieHerosApercu = function(perso) {
    if (!perso) return null;
    const max = typeof window.fatigueMaxCombattant === "function" ? window.fatigueMaxCombattant(perso) : 100;
    const actuelle = perso.fatigueActuelle !== undefined ? (parseInt(perso.fatigueActuelle) || 0) : max;
    return { max: Math.max(1, max), actuelle: Math.max(0, Math.min(actuelle, max)) };
};

// Ce que le repos long rend, avec la règle du cerveau (reposLongDuTour) : le
// rendement propre au combattant (Repos_Long, en %) ou 35 % de sa jauge, sans
// dépasser le plein.
window.gainReposLong = function(perso) {
    const e = window.energieHerosApercu(perso);
    if (!e) return 0;
    const pct = parseFloat((perso.stats && perso.stats.Repos_Long) || perso.Repos_Long) || 0;
    const taux = pct > 0 ? pct / 100 : 0.35;
    return Math.max(0, Math.min(e.max - e.actuelle, Math.floor(e.max * taux)));
};

// La jauge : `delta` négatif = une dépense (rouge), positif = un gain (vert).
window.htmlJaugeEnergieApercu = function(e, delta) {
    const pct = (v) => Math.max(0, Math.min(100, (v / e.max) * 100)).toFixed(2);
    const apres = e.actuelle + delta;
    const manque = apres < 0 ? -apres : 0;
    const resteAffiche = Math.max(0, Math.min(e.max, apres));
    const gain = delta > 0;
    const base = gain ? e.actuelle : resteAffiche;              // la partie qui reste pleine
    const largeurDelta = Math.abs((gain ? resteAffiche : e.actuelle) - base);
    return `
        <div class="jauge-energie-apercu${gain ? " gain" : " perte"}${manque ? " insuffisante" : ""}">
            <div class="jauge-energie-libelle">
                <span>⚡ Énergie <b>${e.actuelle}</b></span>
                <span class="jauge-energie-fleche">→ <b class="jauge-energie-apres">${resteAffiche}</b><small>/ ${e.max}</small>${manque ? ` <em>(il manque ${manque})</em>` : ""}</span>
            </div>
            <div class="jauge-energie-barre">
                <div class="jauge-energie-pleine" style="width: ${pct(base)}%"></div>
                <div class="jauge-energie-delta" style="left: ${pct(base)}%; width: ${pct(largeurDelta)}%"></div>
            </div>
        </div>`;
};

// L'encart du repos long, à la place de la carte.
window.afficherApercuReposLong = function(perso) {
    const conteneur = document.getElementById("apercu-carte-hd-competence");
    const fenetreCombat = document.getElementById("fenetre-combat");
    const e = window.energieHerosApercu(perso);
    if (!conteneur || !fenetreCombat || !e) return;
    if (conteneur.parentNode !== fenetreCombat) fenetreCombat.appendChild(conteneur);
    const gain = window.gainReposLong(perso);
    const pct = parseFloat((perso.stats && perso.stats.Repos_Long) || perso.Repos_Long) || 35;
    conteneur.dataset.cardId = "REPOS_LONG";
    conteneur.dataset.locked = "false";
    conteneur.innerHTML = `
        <div class="encart-repos-long">
            <div class="encart-repos-titre">🌙 Repos long</div>
            <div class="encart-repos-texte">${gain > 0
                ? `Tu reprends ton souffle : <b>+${gain}</b> d'énergie <small>(${pct} % de ta jauge)</small>.`
                : `Ton énergie est déjà pleine : le repos n'en rendra pas.`}</div>
        </div>
        ${window.htmlJaugeEnergieApercu(e, gain)}`;
    Object.assign(conteneur.style, { zIndex: "15", pointerEvents: "auto", top: "15vh", left: APERCU_CARTE_X,
                                     transform: "none", width: "340px", height: "150px", display: "block", opacity: "1" });
};

window.afficherApercuCarteHD = function(idCarte, isLocked = false) {
    let conteneurCarte = document.getElementById("apercu-carte-hd-competence");
    
    if (!conteneurCarte) {
        conteneurCarte = document.createElement("div");
        conteneurCarte.id = "apercu-carte-hd-competence";
        // NOUVEAU : Transition super fluide sur Left
        conteneurCarte.style.cssText = "position: fixed; border-radius: 12px; box-shadow: 0px 20px 40px rgba(0,0,0,0.9); transition: left 0.4s cubic-bezier(0.25, 0.8, 0.25, 1), opacity 0.3s ease; display: none; opacity: 0; pointer-events: auto;";
        document.body.appendChild(conteneurCarte);

        const style = document.createElement("style");
        style.innerHTML = `
            #apercu-carte-hd-competence .zone-effets::-webkit-scrollbar { width: 4px; }
            #apercu-carte-hd-competence .zone-effets::-webkit-scrollbar-track { background: transparent; }
            #apercu-carte-hd-competence .zone-effets::-webkit-scrollbar-thumb { background: rgba(232, 213, 165, 0.3); border-radius: 4px; }
        `;
        document.head.appendChild(style);
    }

    const isCombatMode = document.getElementById("fenetre-combat")?.style.display === "block";
    const currentDisplayedId = conteneurCarte.dataset.cardId;
    
    // CHANGEMENT DE COUCHE.
    //
    // La carte était accrochée au panneau latéral gauche, et son z-index de 100
    // était un leurre : le panneau est lui-même à 10, il ouvre son propre
    // contexte d'empilement, et rien de ce qu'il contient ne peut monter
    // au-dessus du volet des compétences (14). La carte passait donc SOUS les
    // bannières quoi qu'on écrive dessus.
    //
    // Elle est maintenant accrochée à la fenêtre de combat elle-même, au même
    // niveau que le volet, avec 15 pour passer juste devant lui — et toujours
    // derrière l'annonce de tour et le menu de développement, qui doivent
    // continuer de la recouvrir.
    if (isCombatMode) {
        const fenetreCombat = document.getElementById("fenetre-combat");
        if (fenetreCombat && conteneurCarte.parentNode !== fenetreCombat) fenetreCombat.appendChild(conteneurCarte);

        conteneurCarte.style.zIndex = "15";
        conteneurCarte.style.pointerEvents = "auto";
        
        // Si on change de carte en mode Aperçu
        if (currentDisplayedId && currentDisplayedId !== idCarte && conteneurCarte.style.opacity === "1" && !isLocked) {
            conteneurCarte.style.left = APERCU_CARTE_X_CACHE;
            conteneurCarte.style.opacity = "0";
            setTimeout(() => { window.afficherApercuCarteHD(idCarte, isLocked); }, 300);
            return;
        }
    } else {
        if (conteneurCarte.parentNode !== document.body) document.body.appendChild(conteneurCarte);
        conteneurCarte.style.zIndex = "9999";
    }

    // Mémorise l'état actuel
    conteneurCarte.dataset.cardId = idCarte;
    conteneurCarte.dataset.locked = isLocked ? "true" : "false";

    // LE DERNIER RETOUR MUET DE LA CHAÎNE, et il est sur le chemin du bouton
    // « Appliquer » — le SEUL par lequel un joueur lance sa carte pendant son
    // tour. COMPETENCES_CACHE ne contient que le deck du héros AFFICHÉ dans le
    // panneau : dès qu'on regarde un autre personnage, ou qu'un rendu arrive
    // avant que le deck ne soit chargé, la carte du tour n'y est plus. La
    // fonction rendait alors la main sans un mot, le bouton n'apparaissait
    // jamais, et le joueur cliquait dans le vide devant un plateau figé.
    //
    // On va donc la chercher là où elle est de toute façon : le cache global,
    // rangé par personnage. Et si elle n'y est vraiment pas, on le DIT.
    let data = window.COMPETENCES_CACHE[idCarte];
    if (!data) {
        const global = window.CACHE_COMPETENCES_GLOBAL || {};
        for (const idPerso of Object.keys(global)) {
            if (global[idPerso] && global[idPerso][idCarte]) { data = global[idPerso][idCarte]; break; }
        }
        if (data) window.COMPETENCES_CACHE[idCarte] = data;
    }
    // Une technique de classe n'est dans aucun deck : elle se fabrique.
    if (!data && typeof window.carteTechniqueClasse === "function") {
        data = window.carteTechniqueClasse(idCarte);
        if (data) window.COMPETENCES_CACHE[idCarte] = data;
    }
    if (!data) {
        if (typeof window.tracerCombat === "function") {
            window.tracerCombat("💣", `technique ${idCarte} introuvable`,
                                "aucune carte à afficher — le bouton Appliquer ne peut pas exister");
        }
        return;
    }
    window.CARTE_EN_APERCU = idCarte;

    const titre = data.Nom || "Inconnue";
    const initiative = data.Initiative || 0;
    const fatigue = data.Fatigue || 0;
    const effets = data.Effets_Compiles || [];

    let allZoneHexes = [];
    let hasDist = false; 

    if (data.Composants && data.Composants.actions) {
        data.Composants.actions.forEach(act => {
            if (act.zoneHexes && act.zoneHexes.length > 0) {
                allZoneHexes = act.zoneHexes;
            }
        });
    }

    let htmlEffets = "";
    let htmlZoneAbsolue = "";

    // LA PORTÉE RÉELLE DE CETTE CARTE, POUR CE PORTEUR-LÀ.
    //
    // Elle est calculée une fois ici, et elle sert à DEUX choses plus bas :
    // réécrire la ligne « Distance » de la carte avec ce qu'elle vaut vraiment
    // (l'arme et l'atout de peuple compris), et, s'il n'y a pas de ligne de
    // Distance alors que la carte porte loin, en ajouter une dans le même
    // format. Une seule ligne, un seul nombre : il n'y a plus la ligne bleue
    // qui annonçait la portée vraie à côté de la ligne qui annonçait l'autre.
    // LA PORTÉE QUE L'ARME DONNE EST CELLE DU PROPRIÉTAIRE DE LA CARTE. Elle se
    // calculait toujours avec le héros de CE poste : un joueur à l'arc voyait
    // une Distance sur les cartes d'un autre personnage qui n'en ont pas.
    const lanceurDeLaCarte = typeof window.porteurPourApercu === "function"
        ? window.porteurPourApercu(idCarte)
        : ((window.COMBAT_PERSOS_JOUEUR || [])[window.COMBAT_INDEX_PERSO] || null);
    const porteeVraie = typeof window.distanceAAfficher === "function"
        ? window.distanceAAfficher(data, lanceurDeLaCarte) : null;
    const reecrireDistance = (texte) => (porteeVraie && typeof window.texteDistanceReelle === "function")
        ? window.texteDistanceReelle(texte, porteeVraie) : texte;

    // LE FORMAT D'UNE LIGNE D'EFFET, À UN SEUL ENDROIT. La ligne de Distance
    // ajoutée doit être indiscernable d'une vraie : elle passe donc par la même
    // fonction, et non par une copie de son HTML qui finirait par diverger.
    const ligneEffetHD = (nom, desc, estMod) => `
                    <div style="${estMod ? "margin-left: 15px; margin-top: 6px;" : "margin-top: 12px;"}">
                        <div class="titre-effet-hd" style="color: ${estMod ? "#c2a878" : "#e8d5a5"}; font-size: 15px; font-weight: bold; text-shadow: 1px 1px 2px black; transition: all 0.3s;">${estMod ? "↳ " : "• "}${nom}</div>
                        <div style="color: #a89f91; font-size: 13px; margin-top: 2px; line-height: 1.3; font-style: italic;">${desc}</div>
                    </div>
                `;

    // 🔻 CORRECTION : On encapsule chaque effet dans une div avec un ID précis pour pouvoir le cibler (Surbrillance Dorée)
    effets.forEach((eff, indexEffet) => {
        let textToCheck = typeof eff === 'string' ? eff : eff.nom;
        const estLigneDistance = (textToCheck || "").includes("Distance");
        if (estLigneDistance) hasDist = true;

        if (typeof eff === 'string' && eff.includes("Initiative +")) return;
        if (typeof eff === 'object' && eff.nom === "Initiative +") return;

        let content = "";

        if (typeof eff === 'string') {
            if (eff.includes("Zone")) {
            } else if (eff.startsWith("  ↳")) {
                content = `<div style="margin-left: 20px; color: #a89f91; font-size: 13px; padding: 2px 0;">${estLigneDistance ? reecrireDistance(eff) : eff}</div>`;
            } else {
                content = `<div style="margin-top: 8px; color: #e8d5a5; font-size: 15px; font-weight: bold;">${estLigneDistance ? reecrireDistance(eff) : eff}</div>`;
            }
        } 
        else {
            if (eff.isZone) {
            } else {
                content = ligneEffetHD(eff.nom,
                                       estLigneDistance ? reecrireDistance(eff.desc) : eff.desc,
                                       eff.isMod);
            }
        }
        
        // On englobe le contenu avec l'ID
        if (content !== "") {
            htmlEffets += `<div id="effet-hd-ligne-${indexEffet}" style="transition: all 0.3s ease;">${content}</div>`;
        }
    });

    // AUCUNE LIGNE DE DISTANCE, ET POURTANT LA CARTE PORTE LOIN.
    //
    // C'est l'arme qui le fait : une arme à distance donne une portée de base à
    // CHAQUE technique de son porteur, et une carte écrite au corps à corps
    // devient un tir — avec tout ce que ça implique, elle atteint plus loin et
    // elle perd trente pour cent au contact. La carte n'en disait pas un mot.
    //
    // On l'ajoute donc, en tête, AVEC LA MÊME FABRIQUE DE LIGNE que les vraies :
    // même puce, mêmes couleurs, même formulation prise dans la base. Elle n'a
    // pas d'identifiant `effet-hd-ligne-N`, et c'est voulu — ces identifiants
    // numérotent les effets réels de la carte, que la surbrillance dorée met en
    // valeur un par un pendant la résolution.
    if (porteeVraie && !hasDist) {
        htmlEffets = ligneEffetHD("Distance", reecrireDistance(window.gabaritTexteDistance()), false)
                   + htmlEffets;
    }

    // LA SURPUISSANCE (app.js) : une technique de 70 de fatigue ou plus frappe
    // et soigne plus fort. Dite sur la carte, dans le format des autres lignes,
    // et calculée à l'affichage : une carte forgée avant la règle la montre aussi.
    const surpuissance = typeof window.texteSurpuissance === "function" ? window.texteSurpuissance(fatigue) : "";
    if (surpuissance) {
        htmlEffets += `<div class="ligne-surpuissance">${ligneEffetHD("Surpuissance " + surpuissance,
            `Dégâts et soins ${surpuissance} (technique à ${fatigue} de fatigue)`, false)}</div>`;
    }

    // NOUVEAU : Dessin avec Bounding Box Dynamique (Rognage auto)
    if (allZoneHexes.length > 0) {
        let svgPolygons = "";
        const hexRadius = 11;
        const cx = 60;
        const cy = 60;
        
        // Variables pour tracker les dimensions exactes du dessin
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        
        for (let q = -2; q <= 2; q++) {
            let r1 = Math.max(-2, -q - 2);
            let r2 = Math.min(2, -q + 2);
            for (let r = r1; r <= r2; r++) {
                const isCenter = (q === 0 && r === 0);
                const isPlayer = isCenter && !hasDist;
                const isSelected = allZoneHexes.some(h => h.q === q && h.r === r);

                if (!isSelected && !isPlayer) continue;

                // MÊME GÉOMÉTRIE QUE LA MAP DE COMBAT (Plateau.js, hexToPixel) :
                // hexagones à bord plat en haut. La zone dessinée ici a donc
                // exactement la forme qu'elle aura sur le plateau.
                const x = cx + hexRadius * 1.5 * q;
                const y = cy + hexRadius * Math.sqrt(3) * (r + q / 2.0);

                let fillColor = "rgba(255, 76, 76, 0.8)";
                if (isPlayer && !isSelected) {
                    fillColor = "rgba(150, 150, 150, 0.8)";
                }

                let points = "";
                for(let i=0; i<6; i++) {
                    let angle = Math.PI / 3 * i;          // coins à 0°, 60°… : bord plat en haut
                    let px = x + hexRadius * Math.cos(angle);
                    let py = y + hexRadius * Math.sin(angle);
                    points += `${px},${py} `;
                    
                    // On met à jour les frontières extrêmes de notre dessin
                    minX = Math.min(minX, px);
                    maxX = Math.max(maxX, px);
                    minY = Math.min(minY, py);
                    maxY = Math.max(maxY, py);
                }
                
                svgPolygons += `<polygon points="${points.trim()}" fill="${fillColor}" stroke="#ffffff" stroke-width="1.5" />`;
            }
        }
        
        // Si on a dessiné quelque chose, on génère le SVG aux dimensions exactes
        if (minX !== Infinity) {
            let padding = 3; // Marge pour ne pas couper la bordure blanche
            let viewBoxWidth = maxX - minX + (padding * 2);
            let viewBoxHeight = maxY - minY + (padding * 2);
            
            htmlZoneAbsolue = `
                <div style="position: absolute; bottom: 18px; right: 15px; z-index: 10; filter: drop-shadow(0px 5px 10px rgba(0,0,0,0.9)); pointer-events: none;">
                    <svg width="${viewBoxWidth}" height="${viewBoxHeight}" viewBox="${minX - padding} ${minY - padding} ${viewBoxWidth} ${viewBoxHeight}">
                        ${svgPolygons}
                    </svg>
                </div>
            `;
        }
    }

    // NOUVEAU : VÉRIFICATION DE LA FATIGUE POUR LA CARTE HD
    let estEpuise = false;
    if (isCombatMode && window.COMBAT_PERSOS_JOUEUR && window.COMBAT_INDEX_PERSO !== undefined) {
        const persoActuel = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
        if (persoActuel) {
            const fatigueMax = window.fatigueMaxCombattant(persoActuel);
            // (Retour arrière de l'Oracle : le repos à venir compte déjà.)
            const fatiguePerso = (persoActuel.fatigueActuelle !== undefined ? parseInt(persoActuel.fatigueActuelle) : fatigueMax)
                + (typeof window.bonusRetourArriere === "function" ? window.bonusRetourArriere(persoActuel) : 0);
            // Le trajet déjà tracé mord aussi sur le budget : une carte abordable
            // seule mais pas une fois le déplacement compté doit perdre "Choisir"
            // exactement comme gererClicCarteCombat (combat.js) le décide déjà.
            if (parseInt(fatigue) + (window.MOUVEMENT_COUT_TOTAL || 0) > fatiguePerso) {
                estEpuise = true;
            }
        }
    }

    const partieTemp = window.PARTIE_DATA || {};
    const phaseTemp = partieTemp.Phase_Combat || "Preparation";
    const persoActuelTemp = (window.COMBAT_PERSOS_JOUEUR || [])[window.COMBAT_INDEX_PERSO];

    // Les monstres ne se pilotent pas à la main : leurs cartes s'affichent pour
    // être consultées, mais sans « Choisir ». C'est l'IA de combat qui décidera
    // de ce qu'ils jouent.
    //
    // LA QUESTION PORTE SUR LA CARTE, PAS SUR CE QUI EST AFFICHÉ. Elle se lisait
    // dans le combattant montré par le panneau latéral — une visionneuse où
    // l'IA comme le joueur pouvaient installer une créature, auquel cas
    // COMBAT_PERSOS_JOUEUR devenait [elle]. Le deck affiché, lui, mettait un
    // instant à suivre. Le joueur voyait donc SA carte, la cliquait, et
    // « choisir compétence » restait mort sans un mot : à la table, trois
    // minutes d'attente, jusqu'à ce que l'IA renonce à attendre les joueurs et
    // engage les créatures toute seule. Le panneau n'existe plus ; la question
    // se pose toujours, et elle se pose à la carte.
    //
    // herosPourCarte (combat.js) répond sur la carte elle-même : son
    // propriétaire dans le cache global, s'il est des miens.
    const porteurDeLaCarte = typeof window.herosPourCarte === "function"
        ? window.herosPourCarte(idCarte) : persoActuelTemp;
    const estCarteDeMonstre = !!(porteurDeLaCarte && porteurDeLaCarte.estMonstre);

    // 🔻 CORRECTION 1 : On bloque le choix de la carte si les combats ont commencé !
    //
    // LES DEUX BOUTONS FLOTTANTS SONT PARTIS (refonte du bouton fin de tour) :
    // « Choisir » (retenir la carte pour la manche) et « Appliquer » (démarrer
    // le ciblage) vivent maintenant sur le bouton fin de tour, sous ses images
    // « choisir compétence » et « lancer » (combat.js, actualiserBoutonFinTour).
    // Ce qui reste ici, c'est ce que le bouton ne peut pas dire : POURQUOI la
    // carte ne peut pas être retenue.
    let boutonChoisirHtml = "";
    let choisissable = false;
    if (isCombatMode && !isLocked && !estCarteDeMonstre) {
        if (phaseTemp === "Resolution") {
            boutonChoisirHtml = `
            <div style="position: absolute; bottom: -65px; left: 50%; transform: translateX(-50%); z-index: 5; color: #a89f91; font-family: 'Cinzel', serif; font-size: 16px; font-weight: bold; text-transform: uppercase; white-space: nowrap; text-shadow: 2px 2px 4px black; letter-spacing: 1px;">
                Combat en cours
            </div>`;
        } else if (data.techniqueClasse && typeof window.techniqueClasseUtilisee === "function"
                   && window.techniqueClasseUtilisee(porteurDeLaCarte, idCarte)) {
            boutonChoisirHtml = `
            <div style="position: absolute; bottom: -65px; left: 50%; transform: translateX(-50%); z-index: 5; color: #a89f91; font-family: 'Cinzel', serif; font-size: 16px; font-weight: bold; text-transform: uppercase; white-space: nowrap; text-shadow: 2px 2px 4px black; letter-spacing: 1px;">
                Déjà utilisée ce combat
            </div>`;
        } else if (estEpuise) {
            boutonChoisirHtml = `
            <div style="position: absolute; bottom: -65px; left: 50%; transform: translateX(-50%); z-index: 5; color: #ff4c4c; font-family: 'Cinzel', serif; font-size: 16px; font-weight: bold; text-transform: uppercase; white-space: nowrap; text-shadow: 2px 2px 4px black; letter-spacing: 1px;">
                Énergie Insuffisante
            </div>`;
        } else {
            choisissable = true;
        }
    }

    // Ce que le bouton fin de tour a besoin de savoir : quelle carte est sous
    // les yeux du joueur, et s'il peut la retenir pour la manche.
    window.CARTE_APERCU = { idCarte, choisissable };

    // L'ÉNERGIE DU HÉROS SOUS LA CARTE, pendant qu'il choisit : ce que la carte
    // et le trajet déjà tracé vont coûter clignote en rouge, et le chiffre dit
    // ce qui restera.
    let jaugeEnergieHtml = "";
    if (isCombatMode && !isLocked && !estCarteDeMonstre && phaseTemp !== "Resolution") {
        const heros = (porteurDeLaCarte && !porteurDeLaCarte.estMonstre) ? porteurDeLaCarte : persoActuelTemp;
        const energie = window.energieHerosApercu(heros);
        // Retour arrière : la jauge part de l'énergie APRÈS le repos.
        const bonusRA = (energie && typeof window.bonusRetourArriere === "function") ? window.bonusRetourArriere(heros) : 0;
        if (energie && bonusRA > 0) energie.actuelle = Math.min(energie.max, energie.actuelle + bonusRA);
        if (energie) {
            const cout = (parseInt(fatigue) || 0) + (window.MOUVEMENT_COUT_TOTAL || 0);
            jaugeEnergieHtml = window.htmlJaugeEnergieApercu(energie, -cout);
            // Le message (« Énergie insuffisante »…) descend sous la jauge.
            boutonChoisirHtml = boutonChoisirHtml.replace("bottom: -65px", "bottom: -98px");
        }
    }

    conteneurCarte.innerHTML = `
        <!-- COUCHE 1 : FOND DE COULEUR -->
        <div style="position: absolute; top: 12px; left: 12px; right: 12px; bottom: 12px; background-color: ${window.COULEUR_PERSO_COURANT}; border-radius: 8px; z-index: 1;"></div>
        
        <!-- COUCHE 1 bis : L'ILLUSTRATION DE LA TECHNIQUE (illustration_competence.js) -->
        ${typeof window.htmlIllustrationCarte === "function" ? window.htmlIllustrationCarte(data) : ""}

        <!-- COUCHE 2 : L'IMAGE DE LA CARTE (CONSERVÉE PROPREMENT) -->
        <img src="https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1785866318/competance_carte_vy8omh.png" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2; pointer-events: none;">
        
        <!-- COUCHE 3 : LES DONNÉES -->
        <div class="titre-auto-reduit" data-taille-max="16" style="position: absolute; top: 18px; left: 50px; right: 80px; text-align: center; font-family: 'Cinzel', serif; font-size: 16px; font-weight: bold; color: #e0d0b0; text-transform: uppercase; text-shadow: 2px 2px 4px black; z-index: 3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;">
            ${titre}
        </div>

        <div style="position: absolute; top: 7px; right: 9px; width: 75px; height: 72px; display: flex; justify-content: center; align-items: center; padding-left: 8px; box-sizing: border-box; font-family: 'Cinzel', serif; font-size: 34px; font-weight: bold; color: white; text-shadow: 2px 2px 6px black; z-index: 3; pointer-events: none;">
            ${initiative}
        </div>

        <div style="position: absolute; top: 50.7%; left: 50%; transform: translate(-50%, -50%); font-family: 'Cinzel', serif; font-size: 20px; font-weight: bold; color: #ff8b8b; text-shadow: 1px 1px 4px black; z-index: 3; pointer-events: none;">
            ${fatigue}
        </div>

        <div class="zone-effets" style="position: absolute; top: 54%; left: 16%; right: 8%; bottom: 6%; z-index: 3; overflow-y: auto; font-family: 'Almendra', serif; display: flex; flex-direction: column; justify-content: flex-start;">
            <div style="flex-grow: 1;">
                ${htmlEffets}
            </div>
        </div>

        <!-- COUCHE 4 : LA ZONE FLOTTANTE -->
        ${htmlZoneAbsolue}

        ${jaugeEnergieHtml}

        ${boutonChoisirHtml}
    `;

    conteneurCarte.style.display = "block";
    // Le titre se mesure une fois la carte affichée : avant, elle a une largeur nulle.
    window.ajusterTitresBannieres(conteneurCarte);
    
    if (isCombatMode) {
        if (conteneurCarte.style.opacity === "0" || conteneurCarte.style.top !== "15vh") {
            conteneurCarte.style.top = "15vh";
            conteneurCarte.style.left = APERCU_CARTE_X; // Apparait à droite du volet
            conteneurCarte.style.transform = "none";
            void conteneurCarte.offsetWidth; 
        }
        // Toujours la taille d'une carte : l'encart du repos long, plus petit,
        // a pu occuper le même cadre juste avant.
        conteneurCarte.style.width = "340px";
        conteneurCarte.style.height = "476px";
        // Retenue ou simplement survolée, elle ne bouge plus : autrefois la
        // carte choisie glissait à 20 px pour venir couvrir les bannières, ce
        // qui n'a plus de sens maintenant que le volet se referme tout seul dès
        // qu'une carte est retenue.
        conteneurCarte.style.left = APERCU_CARTE_X;
        conteneurCarte.style.opacity = "1";
    } else {
        // Positionnement Fiche Perso (Centré)
        conteneurCarte.style.top = "50%";
        conteneurCarte.style.left = "59vw";
        conteneurCarte.style.transform = "translateY(-50%)";
        conteneurCarte.style.width = "340px";
        conteneurCarte.style.height = "476px";
        void conteneurCarte.offsetWidth;
        conteneurCarte.style.opacity = "1";
    }

    // La carte vient de s'ouvrir : le bouton fin de tour doit passer en
    // « choisir compétence » (ou rester éteint si elle n'est pas retenable).
    if (typeof window.actualiserBoutonFinTour === "function") window.actualiserBoutonFinTour();
};

window.masquerApercuCarteHD = function(force = false) {
    const conteneurCarte = document.getElementById("apercu-carte-hd-competence");
    if (conteneurCarte) {

        // Bloque la disparition si la carte est verrouillée par un choix
        if (!force && conteneurCarte.dataset.locked === "true") {
            return;
        }

        // Plus de carte sous les yeux : le bouton fin de tour n'a plus rien à
        // retenir pour la manche.
        window.CARTE_APERCU = null;
        if (typeof window.actualiserBoutonFinTour === "function") window.actualiserBoutonFinTour();

        const isCombatMode = document.getElementById("fenetre-combat")?.style.display === "block";
        
        if (isCombatMode) {
            conteneurCarte.style.left = APERCU_CARTE_X_CACHE; // Glisse en se cachant
            conteneurCarte.style.opacity = "0";

            setTimeout(() => {
                if (conteneurCarte.style.opacity === "0") {
                    conteneurCarte.style.display = "none";
                }
            }, 400); 
        } else {
            conteneurCarte.style.display = "none";
            conteneurCarte.style.opacity = "0";
            conteneurCarte.style.left = "59vw";
            conteneurCarte.style.top = "50%";
            conteneurCarte.style.transform = "translateY(-50%)";
        }
        
        conteneurCarte.dataset.cardId = ""; 
        conteneurCarte.dataset.locked = "false";
    }
    
    window.CARTE_EN_APERCU = null;
    document.querySelectorAll('.banniere-carte').forEach(el => el.style.filter = "none");
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
        // ACTION : AJOUTER LA CARTE — pas si l'arme en main l'empêche.
        if (elementBanniere.dataset.bloqueeArme === "true") {
            let msgArme = document.getElementById("erreur-deck-arme");
            if (!msgArme) {
                msgArme = document.createElement("div");
                msgArme.id = "erreur-deck-arme";
                msgArme.style.cssText = "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(40, 10, 10, 0.95); color: #e8d5a5; padding: 20px 34px; border: 2px solid #ff4c4c; border-radius: 12px; font-weight: bold; font-size: 20px; text-shadow: 0 0 10px red; box-shadow: 0 0 40px rgba(255, 0, 0, 0.9); z-index: 2000; text-align: center; pointer-events: none; opacity: 0; transition: opacity 0.3s ease; max-width: 80vw;";
                document.body.appendChild(msgArme);
            }
            const raison = (elementBanniere.querySelector("[title]") || {}).title || "L'arme en main ne permet pas cette technique.";
            msgArme.innerHTML = `Arme inadaptée<br><span style="font-size: 15px; color: #e8d5a5;">${raison}</span>`;
            msgArme.style.opacity = "1";
            setTimeout(() => { if (msgArme) msgArme.style.opacity = "0"; }, 2500);
            elementBanniere.style.transform = "translateX(-5px)";
            setTimeout(() => elementBanniere.style.transform = "translateX(5px)", 50);
            setTimeout(() => elementBanniere.style.transform = "translateX(0px)", 100);
            return;
        }
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

// Simple garde-fou d'affichage : neutralise les espaces parasites (y compris "&nbsp;" littéral
// et les espaces insécables ou de largeur nulle) qu'un nom saisi en base pourrait traîner.
// ⚠️ Ne pas confondre avec le décalage des titres du Grimoire, longtemps mis sur le dos de ces
// caractères : il venait en réalité du text-align:center de .modale-parchemin-jeu, hérité par
// la liste (voir #forge-menu-caracs dans index.html). Les noms n'y étaient pour rien.
const REGEX_ESPACES_INVISIBLES = new RegExp(
    "[\\u0000-\\u001F\\u007F\\u00A0\\u1680\\u2000-\\u200F\\u2028\\u2029\\u202F\\u205F\\u2060\\u3000\\uFEFF]",
    "g"
);
function nettoyerNomEffet(nom) {
    return (nom || "")
        .replace(/&nbsp;/gi, " ")
        .replace(REGEX_ESPACES_INVISIBLES, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeForgeType(type, fallback = "Aucun") {
    if (!type) return fallback;
    return LEGACY_TYPE_MAP[type] || type;
}

// 🔻 FONCTION : Identifie les attaques de base 🔻
function estUneAttaqueDeBase(nom) {
    if (!nom) return false;
    const n = nom.toLowerCase();
    return n.includes("attaque magique") || 
           n.includes("ténèbres") || n.includes("tenebres") ||   // Nécromancien
           n.includes("vampirisme") ||                           // Vampire
           n.includes("attaque légère") || 
           n.includes("attaque legere") || 
           n.includes("attaque lourde") || 
           n.includes("mots de pouvoir") || 
           n.includes("mot de pouvoir");
}

// LA RISTOURNE DE L'ÉTALEMENT se lit dans son coût au grimoire : « Cout / 1.2 »
// divise le coût de l'action par 1,2. 1,2 reste le secours si la base ne dit
// rien de lisible (c'était 1,3 : le diviseur du seul Profanateur).
//
// LE PROFANATEUR divise par 1,3 (atout diviseurEtalement, app.js) : le plus
// avantageux des deux l'emporte, pour lui seul.
function diviseurEtalement(effet, perso) {
    const m = /\/\s*([\d.,]+)/.exec(String((effet && effet.Cout_PT) || ""));
    const d = m ? parseFloat(m[1].replace(",", ".")) : NaN;
    const base = d > 1 ? d : 1.2;
    const atout = (perso && typeof window.atoutRace === "function") ? (window.atoutRace(perso) || {}) : {};
    const classe = Number(atout.diviseurEtalement) || 0;
    return Math.max(base, classe);
}
window.diviseurEtalement = diviseurEtalement;

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
// L'atout de portée du personnage pour qui la carte est forgée, s'il s'applique
// à CETTE action : la règle du magique est celle du moteur (window.actionEstMagique),
// pour que la carte n'annonce jamais une portée que le sort n'aura pas.
function bonusPorteeDeRace(action) {
    if (!action || typeof window.bonusPorteeMagique !== "function") return 0;
    const nomBase = action.baseEffet ? action.baseEffet.Nom : "";
    return window.bonusPorteeMagique(
        window.forgeState.statsPerso,
        window.actionEstMagique(nomBase),
        true /* on est justement en train d'afficher l'effet Distance */);
}

// "action" est facultatif : quand il est fourni (une carte en construction ou
// affichée), la portée tient compte de l'atout de race du personnage — l'Ondari
// voit donc dans la Forge la portée que son sort aura vraiment en combat.
function formatterTexteEffet(effet, stacks, action) {
    // L'Étalement dit son vrai nombre de tours, ⏳ compris : c'est le diviseur.
    const nomEtal = (effet.Nom || "").toLowerCase().trim();
    if (nomEtal === "dot" || nomEtal.includes("étalement") || nomEtal.includes("etalement")) {
        const crans = parseFrenchFloat(((action && action.modsDuree) || {})[effet.id]);
        const tours = Math.max(2, Math.round(parseFrenchFloat(effet.Tours) || 2) + Math.round(crans));
        return `Dégâts ou soins divisés par ${tours} : rien au lancement, une part à chaque fin de manche pendant ${tours} tours.`;
    }
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
    // Poussée et Traction font exception : leur Valeur est une DISTANCE fixe
    // (2 cases pour la Poussée, 3 pour la Traction), que le moteur applique telle
    // quelle quel que soit le nombre de points. Les points n'augmentent que la
    // chance ; la Forge ne doit donc jamais annoncer 4 ou 6 hexagones.
    const nomFixe = (effet.Nom || "").toLowerCase();
    // L'Électrifié aussi : l'initiative qu'il retire est FIXE (35, la Valeur du
    // grimoire) — le moteur ne la multiplie jamais par les crans, seule la
    // chance monte. La Forge l'annonçait multipliée (Nico l'a vu).
    const valeurEstDistanceFixe = nomFixe.includes("pouss") || nomFixe.includes("traction")
        || nomFixe.includes("électrif") || nomFixe.includes("electrif");
    if (val > 0 && !valeurEstDistanceFixe) {
        let calcV = val * stacks;
        
        // 🔻 NOUVEAU : Si c'est l'effet Distance, on affiche +1 case (car 1 = CAC)
        if (effet.Nom === "Distance") {
            calcV += 1;
            calcV += bonusPorteeDeRace(action);
        }

        // Une valeur à virgule (« 1,5 » par cran) s'écrit à la française et
        // sans décimales parasites (1,1 × 3 donne 3,3, pas 3.3000000000000003).
        const calcTexte = String(Math.round(calcV * 100) / 100).replace(".", ",");
        if (pBase === 0) {
            // Remplace le 1er chiffre s'il n'y a pas de pourcentage dans l'effet
            texte = texte.replace(/\b\d+(?:[.,]\d+)?\b/, calcTexte);
        } else {
            // S'il y a un %, on remplace le 1er chiffre qui n'est PAS collé à un %
            texte = texte.replace(/\b\d+(?:[.,]\d+)?\b(?!\s*%)/, calcTexte);
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
    
    // Ténèbres suit la règle de l'Attaque Magique : un sort, qui ne se lance
    // pas « sans arme ».
    const tenebres = typeof window.estSortDeClasse === "function" && window.estSortDeClasse(nom);
    if (arme === "Sans arme / Arme rp") {
        if (tenebres || nom.includes("attaque magique") || nom.includes("mot de pouvoir") || nom.includes("mots de pouvoir") || nom.includes("attaque légère") || nom.includes("attaque legere")) return true;
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

// LA VALEUR QU'AURA VRAIMENT L'ACTION EN COMBAT, surpuissance comprise
// (app.js) : « → 26 avec la surpuissance ». Dégâts et soins seulement — ni
// bouclier ni purification, comme au moment de l'extraction (moteur_effets.js).
function texteValeurSurpuissante(act, fatigue) {
    if (typeof window.multiplicateurSurpuissance !== "function") return "";
    const m = window.multiplicateurSurpuissance(fatigue);
    const nom = ((act && act.baseEffet && act.baseEffet.Nom) || "").toLowerCase();
    const soigne = nom.includes("soin") || nom.includes("guérison");
    if (m <= 1 || !(estUneAttaqueDeBase(nom) || soigne) || nom.includes("bouclier") || nom.includes("purification")) return "";
    const valeur = (parseFrenchFloat(act.baseEffet.Valeur) || 0) * (act.count || 1);
    if (valeur <= 0) return "";
    return `<span class="forge-valeur-surpuissante">→ ${Math.round(valeur * m)} ${soigne ? "de soin" : "de dégâts"} avec la surpuissance</span>`;
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
    // Garde-fou anti double-appui : le bouton était réputé "buggé" (il fallait cliquer plusieurs
    // fois, ou fermer/rouvrir la fiche). La vraie cause : la fonction relançait 3 lectures
    // Firestore SÉQUENTIELLES à chaque clic — dont un getDocs() qui retéléphonait TOUTE la
    // collection Combat_Effets alors qu'elle est déjà mise en cache une fois pour toutes au
    // démarrage (chargerCacheEffetsBDD, voir app.js). Sur une connexion iPad instable, la modale
    // mettait donc plusieurs secondes à apparaître sans le moindre retour visuel entre-temps :
    // l'utilisateur cliquait à nouveau en pensant que rien ne s'était passé, ce qui relançait
    // tout depuis zéro en parallèle. On court-circuite maintenant les clics pendant le chargement,
    // et on réutilise le cache global au lieu de le reconstruire.
    if (window.OUVERTURE_FORGE_EN_COURS) return;
    window.OUVERTURE_FORGE_EN_COURS = true;

    // Le bouton lui-même fait patienter : son "+" devient un sablier le temps que
    // la Forge lise la fiche et les caractéristiques. Sur une connexion iPad
    // capricieuse, ces lectures prennent parfois une seconde ou deux, et rien à
    // l'écran ne disait que quelque chose se passait.
    const btnCreer = document.getElementById("btn-creer-competence");
    const etatBouton = btnCreer
        ? { texte: btnCreer.innerHTML, taille: btnCreer.style.fontSize, curseur: btnCreer.style.cursor }
        : null;
    if (btnCreer) {
        btnCreer.innerHTML = "⏳";
        btnCreer.style.fontSize = "22px";   // l'émoji est plus large qu'un "+"
        btnCreer.style.cursor = "wait";
    }

    try {
        // NOUVEAU : On nettoie la carte et on désélectionne la bannière
        if (typeof window.masquerApercuCarteHD === "function") {
            window.masquerApercuCarteHD();
        }

        window.forgeState.actions = [];
        window.forgeState.isCapReached = false;
        window.forgeState.armePrincipale = null;
        // Le récit RP d'une technique forgée avec LIA (lia_forge.js) : il part
        // avec la compétence, pour en dessiner l'image plus tard.
        window.forgeState.recitRP = "";
        // Une Forge neuve : le bouton dit ce qu'il fera, pas ce qu'il faisait.
        const btnValiderForge = document.getElementById("btn-valider-forge");
        if (btnValiderForge) btnValiderForge.innerText = LIBELLE_VALIDER_FORGE;

        document.getElementById("forge-nom").value = "";
        const selectElement = document.getElementById("forge-element");
        if (selectElement) selectElement.value = "Aucun";

        const idPerso = document.getElementById("champ-id-personnage").value;
        window.forgeState.idPersonnage = idPerso;

        // Le cache des effets n'est chargé qu'une fois, au tout premier chargement de la page.
        // S'il a raté (réseau lent/instable) ou est resté vide, on le recharge ici avant de
        // continuer, mais sans jamais retéléphoner la collection quand il est déjà disponible.
        if (!window.EFFETS_BDD_CACHE || Object.keys(window.EFFETS_BDD_CACHE).length === 0) {
            if (typeof window.chargerCacheEffetsBDD === "function") {
                await window.chargerCacheEffetsBDD();
            }
        }

        const [snapPerso, snapCaracs] = await Promise.all([
            getDoc(doc(db, "Personnages", idPerso)),
            getDoc(doc(db, "Caracteristiques", idPerso))
        ]);

        if (snapPerso.exists()) window.forgeState.statsPerso = snapPerso.data();
        window.forgeState.caracs = snapCaracs.exists() ? snapCaracs.data() : {};

        // Un effet de classe (Ténèbres) n'apparaît qu'au héros qui y a droit.
        window.forgeState.effetsBDD = Object.keys(window.EFFETS_BDD_CACHE || {})
            .filter(id => typeof window.effetAccessible !== "function"
                || window.effetAccessible(id, window.EFFETS_BDD_CACHE[id], window.forgeState.statsPerso))
            .map(id => {
            const data = window.EFFETS_BDD_CACHE[id];
            return {
                id: id,
                ...data,
                Type_Mecanique: normalizeForgeType(data.Type_Mecanique, "Action/Global"),
                Type_Mecanique_2: data.Type_Mecanique_2 ? normalizeForgeType(data.Type_Mecanique_2) : "Aucun"
            };
        });

        document.getElementById("overlay-jeu-modale").style.display = "block";
        document.getElementById("modale-creation-competence").style.display = "block";
        window.rafraichirForge();
    } catch (e) {
        console.error("Erreur ouverture Forge :", e);
        alert("Impossible d'ouvrir la Forge. Vérifie ta connexion et réessaie.");
    } finally {
        window.OUVERTURE_FORGE_EN_COURS = false;
        if (btnCreer && etatBouton) {
            btnCreer.innerHTML = etatBouton.texte;
            btnCreer.style.fontSize = etatBouton.taille;
            btnCreer.style.cursor = etatBouton.curseur;
        }
    }
};

window.fermerForgeCompetence = function() {
    document.getElementById("modale-creation-competence").style.display = "none";
    document.getElementById("modale-menu-ajout").style.display = "none";
    document.getElementById("modale-menu-arme").style.display = "none";
    document.getElementById("modale-editeur-zone").style.display = "none";
    document.getElementById("overlay-jeu-modale").style.display = "none";
};

// LES QUATRE ARMES PHYSIQUES DU MENU, chacune reliée au bouton qui la propose.
// Magie et Sans arme / Arme rp n'y figurent pas : elles restent toujours
// proposées, quelle que soit l'arme réellement en main (voir plus bas).
const BOUTONS_TYPE_ARME = {
    "Arme légère CAC": "btn-arme-legere-cac",
    "Arme lourde CAC": "btn-arme-lourde-cac",
    "Arme polyvalente": "btn-arme-polyvalente",
    "Arme légère Distance": "btn-arme-legere-distance"
};

// Les types d'armes physiques que le héros porte VRAIMENT, d'après la fiche
// chargée à l'ouverture de la Forge (forgeState.statsPerso, un document brut
// "Personnages" — d'où le passage par persoDocVersFront avant armesEnMain, qui
// attend le format front-end). `null` dit "on ne sait pas" : sur une fiche
// absente ou une lecture ratée, mieux vaut proposer les quatre plutôt que de
// bloquer tout net la création d'une technique de corps à corps ou de tir —
// même principe que window.peutEquiper (objets.js).
function typesArmesEquipeesPourForge() {
    const brut = window.forgeState.statsPerso;
    if (!brut || typeof window.persoDocVersFront !== "function" || typeof window.armesEnMain !== "function") {
        return null;
    }
    try {
        const perso = window.persoDocVersFront(window.forgeState.idPersonnage, brut);
        return new Set(window.armesEnMain(perso).map(o => o.type));
    } catch (e) {
        return null;
    }
}

// Nico : « n'afficher que le type d'arme qui correspond avec l'arme que l'on
// a équipé ». Une arme légère CAC en main ne propose donc plus de forger une
// technique d'arme lourde ou de tir — Magie et Sans arme, elles, restent
// toujours là, l'une ne dépendant d'aucune arme et l'autre étant justement
// faite pour s'en passer.
window.ouvrirMenuArme = function() {
    const typesEquipes = typesArmesEquipeesPourForge();
    Object.keys(BOUTONS_TYPE_ARME).forEach(type => {
        const bouton = document.getElementById(BOUTONS_TYPE_ARME[type]);
        if (!bouton) return;
        bouton.style.display = (!typesEquipes || typesEquipes.has(type)) ? "block" : "none";
    });
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
    document.getElementById("forge-tags-count").style.color = activeTags.size >= 2 ? "#9b2c2c" : "#1b6e3a";

    const capAtteint = window.forgeState.isCapReached;

    // 🔻 On vérifie si une attaque a déjà été posée sur le parchemin
    const aDejaUneAttaque = window.forgeState.actions.some(act => estUneAttaqueDeBase(act.baseEffet.Nom));

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
                
                // 🔻 On verrouille si c'est une attaque et qu'il y en a déjà une sur la carte
                const isAttackLocked = aDejaUneAttaque && estUneAttaqueDeBase(eff.Nom);

                // Empoisonnement doit toujours être lié à une source de dégât (une attaque
                // quelque part sur la carte détermine son type de dégât) : verrouillé tant
                // qu'aucune attaque n'a été posée.
                const isPoisonLocked = !aDejaUneAttaque && (eff.Nom || "").toLowerCase().includes("poison");

                const isDisabled = isLocked || capAtteint || isArmeIncompatible || isAttackLocked || isPoisonLocked;
                
                // Calcul de la fatigue
                const coutFatigue = parseFrenchFloat(eff.Cout_PT) * 5;

                htmlLignes += `
                    <div class="forge-grimoire-ligne${isDisabled ? " desactive" : ""}" data-bulle-effet="${eff.id}">
                        <div>
                            <span class="forge-grimoire-nom">${nettoyerNomEffet(eff.Nom)}</span>${eff.Modificateur !== "AUCUN" ? `<span class="forge-tag-mini">${eff.Modificateur}</span>` : ""}<span class="forge-grimoire-cout">⚡ ${coutFatigue}</span>
                            <span class="forge-grimoire-desc">${formatterTexteEffet(eff, 1)}</span>
                        </div>
                        <button class="btn-rond-plus" onclick="window.ajouterComposantPrincipal('${eff.id}')" ${isDisabled ? "disabled" : ""}>+</button>
                    </div>
                `;
            });

            if (htmlLignes !== "") {
                conteneurMenu.innerHTML += `<div class="forge-grimoire-groupe">${htmlLignes}</div>`;
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
// Un sous-effet SEULEMENT physique : la Magie n'a pas de menu Physique, mais
// un effet rangé aussi au menu Magique (Lumière, Confusion, Peur,
// Empoisonnement…) s'y pose très bien — il ne doit pas tomber au changement
// d'arme.
function estSeulementPhysique(effet) {
    if (!isEffetPhysique(effet)) return false;
    return ![effet.Type_Mecanique, effet.Type_Mecanique_2].some(t => ["Magique", "Spatial", "Duree"].includes(t));
}

// LE SOUS-EFFET DISTANCE N'EST PAS POUR TOUTES LES ARMES (règle de Nico) :
// seulement une arme polyvalente, une arme à distance, la magie — ou, quelle
// que soit l'arme, une action de soin (un soin se lance de loin).
window.armePermetDistance = function(arme) {
    const a = String(arme || "");
    return a === "Arme polyvalente" || a === "Magie" || a.includes("Distance");
};
window.distancePermiseSurAction = function distancePermiseSurAction(act, arme) {
    if (window.armePermetDistance(arme)) return true;
    const nom = ((act && act.baseEffet && act.baseEffet.Nom) || "").toLowerCase();
    return (nom.includes("soin") || nom.includes("guérison") || nom.includes("guerison")) && !nom.includes("bouclier");
};
const distancePermiseSurAction = window.distancePermiseSurAction;

function purgerIncompatibilitesArme() {
    if (!window.forgeState.armePrincipale) return;

    window.forgeState.actions = window.forgeState.actions.filter(
        act => !estIncompatibleAvecArme(act.baseEffet.Nom, window.forgeState.armePrincipale)
    );

    if (window.forgeState.armePrincipale === "Magie") {
        window.forgeState.actions.forEach(act => {
            Object.keys(act.mods).forEach(modId => {
                const modEff = window.forgeState.effetsBDD.find(e => e.id === modId);
                if (estSeulementPhysique(modEff)) delete act.mods[modId];
            });
        });
    }

    // Une Distance posée avant de changer d'arme tombe si la nouvelle ne la
    // permet pas (sauf sur un soin).
    window.forgeState.actions.forEach(act => {
        if (distancePermiseSurAction(act, window.forgeState.armePrincipale)) return;
        Object.keys(act.mods).forEach(modId => {
            const modEff = window.forgeState.effetsBDD.find(e => e.id === modId);
            if (modEff && modEff.Nom === "Distance") {
                delete act.mods[modId];
                if (act.modsDuree) delete act.modsDuree[modId];
            }
        });
    });
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
    // La Distance refusée par l'arme ne passe pas, même par un menu d'avant.
    const modEff = window.forgeState.effetsBDD.find(e => e.id === modId);
    const act = window.forgeState.actions.find(a => a.idInst === idInst);
    if (modEff && modEff.Nom === "Distance" && !distancePermiseSurAction(act, window.forgeState.armePrincipale)) {
        selectElement.value = ""; return;
    }
    window.modifierModCount(idInst, modId, 1);
    selectElement.value = "";
};

// =========================================================================
//  LES BULLES D'EXPLICATION DES EFFETS (Forge)
// =========================================================================
//  Nico : « pour tous les sous-effets listés : sur PC, au survol de la souris,
//  une petite bulle s'affiche à côté pour expliquer le détail de cet effet ;
//  sur iPad, si on reste le doigt dessus 2 secondes la bulle apparaît, et
//  disparaît si on appuie ailleurs. » Tout élément qui porte
//  data-bulle-effet="<id>" en a une : les sous-effets des menus, les effets
//  posés sur la carte, ceux du grimoire d'ajout. Le détail vient du grimoire
//  lui-même — son texte, et ses Notes (ce que fait l'état).
window.DELAI_APPUI_LONG_BULLE = 2000;
window.texteBulleEffet = function(idEffet, idAction) {
    const eff = ((window.forgeState || {}).effetsBDD || []).find(e => e.id === idEffet)
        || (window.EFFETS_BDD_CACHE || {})[idEffet];
    if (!eff) return "";
    const echapper = (t) => String(t || "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    const act = idAction ? ((window.forgeState || {}).actions || []).find(a => a.idInst === idAction) : null;
    let base = "";
    try { base = formatterTexteEffet(eff, (act && act.mods && act.mods[idEffet]) || 1, act || undefined); } catch (e) { base = eff.Effet_Base || ""; }
    const carac = eff.Modificateur && eff.Modificateur !== "AUCUN" ? eff.Modificateur : "";
    const cout = parseFrenchFloat(eff.Cout_PT) * 5;
    const notes = String(eff.Notes || "").replace(/^\s*EFFET\s+[ÉE]TAT\s+[^=]*=\s*/i, "").trim();
    return `<div class="bulle-effet-titre">${echapper(nettoyerNomEffet(eff.Nom))}${carac ? `<span class="bulle-effet-carac">${echapper(carac)}</span>` : ""}</div>`
        + (base ? `<div class="bulle-effet-base">${base}</div>` : "")
        + (notes ? `<div class="bulle-effet-notes">${echapper(notes)}</div>` : "")
        + `<div class="bulle-effet-cout">⚡ ${cout} de fatigue par cran</div>`;
};
function bulleEffet() {
    let b = document.getElementById("bulle-effet-forge");
    if (!b) {
        b = document.createElement("div");
        b.id = "bulle-effet-forge";
        b.className = "bulle-effet-forge";
        document.body.appendChild(b);
    }
    return b;
}
window.montrerBulleEffet = function(cible) {
    const html = cible && window.texteBulleEffet(cible.dataset.bulleEffet, cible.dataset.action);
    if (!html) return;
    const b = bulleEffet();
    b.innerHTML = html;
    b.style.display = "block";
    b.dataset.pour = cible.dataset.bulleEffet;
    // À côté de l'effet : à droite s'il y a la place, sinon à gauche ; jamais
    // hors de l'écran.
    const r = cible.getBoundingClientRect();
    const l = b.offsetWidth, h = b.offsetHeight, marge = 8;
    let x = r.right + marge;
    if (x + l > window.innerWidth - marge) x = Math.max(marge, r.left - l - marge);
    const y = Math.min(Math.max(marge, r.top + r.height / 2 - h / 2), window.innerHeight - h - marge);
    b.style.left = Math.round(x) + "px";
    b.style.top = Math.round(y) + "px";
};
window.cacherBulleEffet = function() {
    const b = document.getElementById("bulle-effet-forge");
    if (b) { b.style.display = "none"; b.dataset.pour = ""; }
};
window.fermerMenusSousEffets = function() {
    document.querySelectorAll(".forge-menu.ouvert").forEach(m => m.classList.remove("ouvert"));
    const ouverte = document.getElementById("forge-menu-liste-ouverte");
    if (ouverte) ouverte.remove();
};
window.basculerMenuSousEffets = function(bouton) {
    const menu = bouton && bouton.closest(".forge-menu");
    if (!menu) return;
    const ouvrir = !menu.classList.contains("ouvert");
    window.fermerMenusSousEffets();
    window.cacherBulleEffet();
    if (!ouvrir) return;
    menu.classList.add("ouvert");
    // LA LISTE SORT DU PARCHEMIN. Dans la carte, elle était coupée par son
    // bas (la carte défile) ; et la fenêtre de la Forge, centrée par un
    // `transform`, retient aussi ce qui s'y pose en fixe. Une copie de la liste
    // s'ouvre donc sur la page elle-même, sous le bouton s'il y a la place,
    // au-dessus sinon, jamais plus haute que l'écran.
    const modele = menu.querySelector(".forge-menu-liste");
    if (!modele) return;
    const liste = modele.cloneNode(true);
    liste.id = "forge-menu-liste-ouverte";
    liste.style.setProperty("--couleur", menu.style.getPropertyValue("--couleur"));
    document.body.appendChild(liste);
    const r = bouton.getBoundingClientRect(), marge = 10;
    const dessous = window.innerHeight - r.bottom - marge, dessus = r.top - marge;
    const enHaut = dessous < 220 && dessus > dessous;
    liste.style.left = Math.round(Math.min(r.left, window.innerWidth - 230)) + "px";
    liste.style.maxHeight = Math.round(Math.max(120, (enHaut ? dessus : dessous) - 4)) + "px";
    liste.style.top = enHaut ? "auto" : Math.round(r.bottom + 4) + "px";
    liste.style.bottom = enHaut ? Math.round(window.innerHeight - r.top + 4) + "px" : "auto";
};
(function installerBullesEffets() {
    if (typeof document === "undefined" || window.__bullesEffetsInstallees) return;
    window.__bullesEffetsInstallees = true;
    let minuteur = null, depart = null, appuiLong = false;
    const annuler = () => { clearTimeout(minuteur); minuteur = null; depart = null; };
    // LA SOURIS : la bulle suit le survol.
    document.addEventListener("pointerover", (e) => {
        if (e.pointerType !== "mouse") return;
        const cible = e.target.closest && e.target.closest("[data-bulle-effet]");
        if (cible) window.montrerBulleEffet(cible);
    });
    document.addEventListener("pointerout", (e) => {
        if (e.pointerType !== "mouse") return;
        const cible = e.target.closest && e.target.closest("[data-bulle-effet]");
        if (cible && !cible.contains(e.relatedTarget)) window.cacherBulleEffet();
    });
    // LE DOIGT : deux secondes sans bouger, et la bulle s'ouvre ; elle reste
    // jusqu'au prochain appui ailleurs.
    document.addEventListener("pointerdown", (e) => {
        const b = document.getElementById("bulle-effet-forge");
        if (b && b.style.display === "block" && !b.contains(e.target)) window.cacherBulleEffet();
        if (!e.target.closest || (!e.target.closest(".forge-menu") && !e.target.closest("#forge-menu-liste-ouverte"))) {
            window.fermerMenusSousEffets();
        }
        if (e.pointerType === "mouse") return;
        const cible = e.target.closest && e.target.closest("[data-bulle-effet]");
        if (!cible) return;
        annuler();
        appuiLong = false;
        depart = { x: e.clientX, y: e.clientY };
        minuteur = setTimeout(() => { appuiLong = true; window.montrerBulleEffet(cible); }, window.DELAI_APPUI_LONG_BULLE);
    }, true);
    document.addEventListener("pointermove", (e) => {
        if (depart && Math.hypot(e.clientX - depart.x, e.clientY - depart.y) > 10) annuler();
    }, true);
    document.addEventListener("pointerup", annuler, true);
    document.addEventListener("pointercancel", annuler, true);
    // La carte défile : la liste, posée en fixe, ne la suivrait pas — on la
    // referme (sauf quand c'est la liste elle-même qui défile).
    document.addEventListener("scroll", (e) => {
        if (e.target && e.target.closest && e.target.closest("#forge-menu-liste-ouverte")) return;
        window.fermerMenusSousEffets();
    }, true);
    // Pas de menu de copie d'iOS sur un appui long.
    document.addEventListener("contextmenu", (e) => {
        if (e.target.closest && e.target.closest("[data-bulle-effet]")) e.preventDefault();
    });
    // LE CHOIX D'UN SOUS-EFFET. Un appui long a ouvert la bulle : il ne
    // choisit pas l'effet en plus.
    document.addEventListener("click", (e) => {
        const option = e.target.closest && e.target.closest(".forge-menu-option");
        if (!option) return;
        if (appuiLong) { appuiLong = false; e.preventDefault(); e.stopPropagation(); return; }
        if (option.classList.contains("incompatible") || !option.dataset.mod) return;
        window.cacherBulleEffet();
        window.fermerMenusSousEffets();
        window.attacherModificateur({ value: option.dataset.mod }, option.dataset.action);
    });
})();

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
        let descBase = formatterTexteEffet(act.baseEffet, act.count, act);
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
                    let descMod = formatterTexteEffet(modEff, act.mods[modId], act);
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

// Les cases de zone qui se paient, pour le héros qui forge.
function casesZoneAPayer(nbCases) {
    return typeof window.casesZonePayantes === "function"
        ? window.casesZonePayantes(nbCases, window.forgeState && window.forgeState.statsPerso)
        : Math.max(0, nbCases - 1);
}

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
    // On remet la gratuité pour le 1er hexagone — et pour le Géomancien, la
    // 5e case payante est offerte aussi (casesZonePayantes, app.js).
    const finalCost = Math.max(0, casesZoneAPayer(currentZoneCount) * costPC);
    
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

            // MÊME GÉOMÉTRIE QUE LA MAP DE COMBAT (Plateau.js, hexToPixel) :
            // hexagones à bord plat en haut. On choisit la zone sur la forme
            // exacte qu'elle aura sur le plateau.
            const x = cx + hexRadius * 1.5 * q;
            const y = cy + hexRadius * Math.sqrt(3) * (r + q / 2.0);

            let fillColor = "transparent";
            if (isPlayer) fillColor = "gray";
            else if (isSelected) fillColor = "rgba(255, 76, 76, 0.8)";
            else fillColor = "rgba(59, 130, 246, 0.1)";

            const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
            
            let points = "";
            for(let i=0; i<6; i++) {
                let angle = Math.PI / 3 * i;          // coins à 0°, 60°… : bord plat en haut
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

// =========================================================================
//  LE CAP DE FATIGUE D'UNE COMPÉTENCE
// =========================================================================
//  Combien une technique peut coûter, selon la caractéristique qu'elle
//  mobilise. Ce n'était qu'une droite ((carac-5)*10) : chaque point valait
//  toujours dix de plus. La vraie table n'est pas une droite — un 15 vaut
//  bien plus qu'un 14 (75 → 90, +15 au lieu de +10), pendant qu'un 16 ne
//  reprend que dix (90 → 100). On la fige donc telle quelle plutôt que de
//  chercher une formule qui la retomberait par hasard.
//
//  Elle ne connaît aucune race elle-même : l'écart humain (110 au lieu de 100
//  à carac 16) n'est pas un cas à part ici, il vient tout seul de l'atout de
//  peuple déjà existant (voir bonusRaceFatigue, app.js) qu'on rajoute
//  par-dessus, exactement comme sur le reste de la réserve d'énergie d'un
//  personnage. Un Humain a plus de coffre partout ; ses techniques n'y
//  échappent pas.
window.TABLE_CAP_FATIGUE = { 8: 15, 9: 25, 10: 35, 11: 45, 12: 55, 13: 65, 14: 75, 15: 90, 16: 100 };

window.capFatigueDeCarac = function(caracMoyenne, perso) {
    const table = window.TABLE_CAP_FATIGUE;
    const c = Math.floor(caracMoyenne);
    let base;
    if (c <= 8) base = table[8];
    else if (c >= 16) base = table[16] + (c - 16) * 10;   // au-delà de 16 : personne n'y va, mais on ne casse rien
    else base = table[c];

    const bonusRace = window.bonusRaceFatigue ? window.bonusRaceFatigue(perso || {}) : 0;
    return base + bonusRace;
};

// CE QUI NE COMPTE PAS DANS L'INITIATIVE. L'initiative d'une carte, c'est ce
// qui reste de 100 une fois la fatigue payée : plus une carte coûte, plus elle
// part tard. Certains effets en sont exemptés — leur coût est « remboursé » à
// l'initiative : l'Absorption depuis toujours, et (règle de Nico) le Contre,
// l'Aveuglement, la Brûlure, l'Empoisonnement, le Glacé, l'Électrifié, la Peur
// et la Confusion. Ils coûtent toujours leur fatigue, mais ne retardent pas
// la carte. Le générateur de monstres suit la même liste
// (initiativeChantier, monstres_competences.js).
window.MOTS_HORS_INITIATIVE = ["absorption", "contre", "aveugl", "brûl", "brul", "empoison",
                               "glac", "électrifi", "electrifi", "peur", "confusion"];
window.horsInitiative = function(nom) {
    const n = (nom || "").toLowerCase();
    return window.MOTS_HORS_INITIATIVE.some(mot => n.includes(mot));
};

// =========================================================================
//  LES RÈGLES DES SOUS-EFFETS, EN UN SEUL ENDROIT
// =========================================================================
//  Sorties de rafraichirForge pour servir à DEUX lecteurs : les menus de la
//  Forge, et LIA (l'aide à la création), qui doit respecter exactement les
//  mêmes règles que le joueur. `etatSousEffet` rend :
//    "masque"       il n'apparaît pas (une 3e caractéristique, une 2e attaque) ;
//    "incompatible" il apparaît grisé (« non compatible ») ;
//    "ok"           il se pose.
// Poussée est un déplacement forcé instantané : la Persistance de terrain, la Zone et la
// Durée étalement dégâts n'ont pas de sens dessus (pas de terrain modifié, pas de zone, pas
// d'étalement dans le temps). On grise ces mods (visibles, mais non sélectionnables) plutôt
// que de les cacher, pour que ce soit clair que le choix n'est pas ouvert.
const NOMS_INCOMPATIBLES_POUSSEE = ["persistance terrain", "zone", "durée étalement dégâts"];
const actionContientPoussee = (act) => {
    if ((act.baseEffet.Nom || "").toLowerCase().includes("pouss")) return true;
    return Object.keys(act.mods).some(modId => {
        const m = window.forgeState.effetsBDD.find(e => e.id === modId);
        return m && (m.Nom || "").toLowerCase().includes("pouss");
    });
};

// L'Illusion est un leurre statique, fixe : le mod "Zone" n'a pas de sens dessus.
const actionContientIllusion = (act) => {
    if ((act.baseEffet.Nom || "").toLowerCase().includes("illusion")) return true;
    return Object.keys(act.mods).some(modId => {
        const m = window.forgeState.effetsBDD.find(e => e.id === modId);
        return m && (m.Nom || "").toLowerCase().includes("illusion");
    });
};

// L'ÉTALEMENT NE S'ACCROCHE QU'À UN MONTANT. Il divise des DÉGÂTS ou des
// SOINS par un nombre de tours : le poser sur un état altéré (un
// étourdissement, une provocation) n'a aucun sens — il n'y a rien à
// diviser. Il ne peut donc se greffer que sur une attaque, un soin, une
// Zone ou une Distance : les actions par lesquelles un coup ou un soin
// arrive. Un bouclier n'est pas un soin, et ne s'étale pas.
const estUnModEtalement = (nomLower) => {
    const n = (nomLower || "").trim();
    return n === "dot" || n.includes("étalement") || n.includes("etalement");
};
const estUnSoinDeBase = (nom) => {
    const n = (nom || "").toLowerCase();
    return (n.includes("soin") || n.includes("guérison") || n.includes("guerison")) && !n.includes("bouclier");
};
// Une action qui fait des dégâts MAGIQUES : l'Attaque Magique, les Mots de
// pouvoir, Ténèbres (celles qui sont des sorts, pas des soins).
const actionADegatsMagiques = (act) => {
    const n = ((act && act.baseEffet && act.baseEffet.Nom) || "").toLowerCase();
    return n.includes("attaque magique") || n.includes("pouvoir")
        || (typeof window.estSortDeClasse === "function" && window.estSortDeClasse(n));
};
const actionAccepteEtalement = (act) => {
    if (!act || !act.baseEffet) return false;
    if (estUneAttaqueDeBase(act.baseEffet.Nom) || estUnSoinDeBase(act.baseEffet.Nom)) return true;
    const nom = (act.baseEffet.Nom || "").toLowerCase();
    return nom.includes("zone") || nom.includes("distance");
};


function etatSousEffet(mod, actionCourante, activeTags) {
    if (!mod) return "masque";
    const tags = activeTags || getActiveTags();
    // 🔻 Sécurité pour bloquer les attaques dans les menus déroulants
    const aDejaUneAttaque = window.forgeState.actions.some(act => estUneAttaqueDeBase(act.baseEffet.Nom));
    // Un soin sur la carte, c'est aussi un montant qu'on peut étaler.
    const aDejaUnSoin = window.forgeState.actions.some(act => estUnSoinDeBase(act.baseEffet.Nom));
    // Ce que la carte porte déjà, toutes actions confondues (socle ou sous-effet).
    const nomsSurLaCarte = [];
    window.forgeState.actions.forEach(act => {
        nomsSurLaCarte.push(((act.baseEffet && act.baseEffet.Nom) || "").toLowerCase());
        Object.keys(act.mods || {}).forEach(id => {
            const eff = window.forgeState.effetsBDD.find(e => e.id === id);
            if (eff) nomsSurLaCarte.push((eff.Nom || "").toLowerCase());
        });
    });
    const carteADejaUnEtalement = nomsSurLaCarte.some(n => estUnModEtalement(n));
    const carteADejaUnePersistance = nomsSurLaCarte.some(n => n.includes("persistance"));

    const isLocked = tags.size >= 2 && mod.Modificateur !== "AUCUN" && !tags.has(String(mod.Modificateur).toUpperCase());
    const isAttackLocked = aDejaUneAttaque && estUneAttaqueDeBase(mod.Nom);
    if (isLocked || isAttackLocked) return "masque";

    const estActionPoussee = !!actionCourante && actionContientPoussee(actionCourante);
    const estActionIllusion = !!actionCourante && actionContientIllusion(actionCourante);
    const nomModLower = (mod.Nom || "").toLowerCase();
    // Une carte qui a déjà Poussée (socle ou mod) ne peut pas en reposer une deuxième
    // couche par-dessus : le sous-effet Poussée redeviendrait redondant avec lui-même.
    const estIncompatiblePoussee = estActionPoussee &&
        (NOMS_INCOMPATIBLES_POUSSEE.includes(nomModLower) || nomModLower.includes("pouss"));
    const estIncompatibleIllusion = estActionIllusion && mod.Nom === "Zone";
    // Empoisonnement doit toujours être lié à une source de dégât (une attaque
    // quelque part sur la carte), sinon aucun type de dégât n'est déterminable.
    const estIncompatiblePoison = !aDejaUneAttaque && nomModLower.includes("poison");
    // L'étalement divise les DÉGÂTS ou les SOINS de la carte par un nombre de
    // tours : sur une carte qui ne frappe ni ne soigne (un pur contrôle) il n'y a
    // rien à étaler, et sur une action qui ne porte ni coup ni soin (un état
    // altéré) il n'y a rien à quoi l'accrocher.
    const estIncompatibleEtalement = estUnModEtalement(nomModLower)
        && (!(aDejaUneAttaque || aDejaUnSoin) || !actionAccepteEtalement(actionCourante));
    // PAS DE PERSISTANCE SUR UN SOIN (règle de Nico) : un soin peut
    // porter une Zone, jamais une Persistance terrain — il n'y a plus
    // de nappe qui soigne au sol.
    const estIncompatiblePersistanceSoin = nomModLower.includes("persistance")
        && !!actionCourante && estUnSoinDeBase(actionCourante.baseEffet.Nom);
    // PAS DE PERSISTANCE SUR UN DOT (règle de Nico) : des dégâts
    // étalés ne se reposent pas en nappe au sol. La carte choisit
    // l'un ou l'autre : l'Étalement grise la Persistance, et
    // réciproquement, où qu'ils soient posés sur la carte.
    const estIncompatiblePersistanceDot = (nomModLower.includes("persistance") && carteADejaUnEtalement)
        || (estUnModEtalement(nomModLower) && carteADejaUnePersistance);
    // LUMIÈRE (Chasseur de mages) : elle fait passer un sort outre la
    // défense magique — il lui faut donc une action à dégâts magiques.
    const estIncompatibleLumiere = nomModLower.startsWith("lumi")
        && !actionADegatsMagiques(actionCourante);
    // LA DISTANCE : arme polyvalente, à distance, magie — ou un soin.
    const estIncompatibleDistance = mod.Nom === "Distance"
        && typeof window.distancePermiseSurAction === "function"
        && !window.distancePermiseSurAction(actionCourante, window.forgeState.armePrincipale);
    return (estIncompatiblePoussee || estIncompatibleIllusion || estIncompatiblePoison || estIncompatibleEtalement
            || estIncompatiblePersistanceSoin || estIncompatiblePersistanceDot || estIncompatibleDistance
            || estIncompatibleLumiere) ? "incompatible" : "ok";
}
window.etatSousEffetForge = etatSousEffet;


window.rafraichirForge = function() {
    // La carte se redessine : la liste ouverte d'un menu d'avant n'a plus de sens.
    if (typeof window.fermerMenusSousEffets === "function") window.fermerMenusSousEffets();
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
        let diviseurDOT = 1.2;
        // LA RISTOURNE DE L'ÉTALEMENT NE VAUT QUE POUR LA ZONE, LES DÉGÂTS, LES
        // SOINS ET LA DISTANCE (règle de Nico) — pas pour les effets associés
        // (états, Durée +, etc.). On met donc de côté la part « étalable » du
        // coût : le socle s'il frappe ou soigne (ou s'il est lui-même une Zone
        // ou une Distance), et les sous-effets Zone et Distance. Un bouclier
        // n'est pas un soin : il ne s'étale pas.
        const soigne = (nom) => {
            const n = (nom || "").toLowerCase();
            return (n.includes("soin") || n.includes("guérison") || n.includes("guerison")) && !n.includes("bouclier");
        };
        const estPartEtalable = (nom) => estUneAttaqueDeBase(nom) || soigne(nom) || nom === "Zone" || nom === "Distance";
        let coutEtalable = estPartEtalable(act.baseEffet.Nom) ? baseActionCost + coutDureeBase : 0;

        if (act.baseEffet.Nom === "Initiative +") {
            const baseVal = parseFrenchFloat(act.baseEffet.Valeur) || 8;
            initBonusNet += act.count * (baseVal + parseFrenchFloat(act.baseEffet.Cout_PT) * 5);
        }
        // Le coût d'un effet hors initiative (Absorption, Contre, états…) est
        // rendu à l'initiative : il ne retarde pas la carte.
        if (window.horsInitiative(act.baseEffet.Nom)) {
            initBonusNet += baseActionCost * 5;
        }

        Object.keys(act.mods).forEach(modId => {
            const modCount = act.mods[modId];
            const modEff = window.forgeState.effetsBDD.find(e => e.id === modId);

            if (modEff) {
                if (modEff.Nom === "Initiative +") {
                    const baseVal = parseFrenchFloat(modEff.Valeur) || 8;
                    initBonusNet += modCount * (baseVal + parseFrenchFloat(modEff.Cout_PT) * 5);
                }
                // Même remboursement pour un sous-effet hors initiative.
                if (window.horsInitiative(modEff.Nom)) {
                    initBonusNet += (parseFrenchFloat(modEff.Cout_PT) * modCount) * 5;
                }

                let coutCeMod = 0;
                if (modEff.Nom === "Zone") {
                    let zoneLen = (act.zoneHexes && act.zoneHexes.length > 0) ? act.zoneHexes.length : modCount;
                    // On remet le premier hexagone gratuit ici aussi ! (Et la
                    // 5e case payante du Géomancien.)
                    coutCeMod = parseFrenchFloat(modEff.Cout_PT) * (typeof window.casesZonePayantes === "function"
                        ? window.casesZonePayantes(zoneLen, window.forgeState && window.forgeState.statsPerso)
                        : Math.max(0, zoneLen - 1));
                } else if (modEff.Nom === "DOT" || modEff.Nom === "Durée étalement dégâts") {
                    aDOT = true;
                    diviseurDOT = diviseurEtalement(modEff, window.forgeState && window.forgeState.statsPerso);
                } else {
                    coutCeMod = parseFrenchFloat(modEff.Cout_PT) * modCount;
                }

                // Surcoût lié au bouton ⏳ de CE sous-effet
                let currentModDuree = (act.modsDuree && act.modsDuree[modId]) || 0;
                coutCeMod += currentModDuree * coutDureePlus;
                coutMods += coutCeMod;
                if (estPartEtalable(modEff.Nom)) coutEtalable += coutCeMod;
            }
        });

        let coutActionTotale = baseActionCost + coutDureeBase + coutMods;
        // Seule la part étalable est divisée ; le reste se paie plein pot.
        if (aDOT) coutActionTotale = (coutActionTotale - coutEtalable) + coutEtalable / diviseurDOT;
        totalPC += coutActionTotale;
    });

    const caracs = window.forgeState.caracs || {};
    let statsTable = {
        "FORCE": caracs.force ?? 8, "DEXTÉRITÉ": caracs.dex ?? 8,
        "CONSTITUTION": caracs.con ?? 8, "INTELLIGENCE": caracs.int ?? 8,
        "SAGESSE": caracs.sag ?? 8, "CHARISME": caracs.cha ?? 8
    };

    let capFatigue = window.capFatigueDeCarac(8, window.forgeState.statsPerso);
    if (activeTags.size > 0) {
        let somme = 0;
        activeTags.forEach(c => { somme += statsTable[c] || 8; });
        capFatigue = window.capFatigueDeCarac(somme / activeTags.size, window.forgeState.statsPerso);
    }

    const fatigueConsommee = Math.floor(totalPC * 5);
    const initiative = Math.max(0, 100 - fatigueConsommee) + initBonusNet;

    const capDepasse = fatigueConsommee >= capFatigue;
    const capErreur = fatigueConsommee > capFatigue;
    window.forgeState.isCapReached = capDepasse;
    // Le bilan chiffré de la carte, pour qui doit le relire sans passer par
    // l'affichage : LIA rabote ses crans jusqu'à tenir sous le cap.
    window.forgeState.bilan = { totalPC, fatigue: fatigueConsommee, cap: capFatigue, initiative };

    const armeContainer = document.getElementById("forge-weapon-tag-container");
    if (armeContainer) {
        if (window.forgeState.armePrincipale) {
            armeContainer.innerHTML = `<span class="forge-arme" onclick="jouerSonClic(); window.ouvrirMenuArme()" title="Changer l'arme de la technique">${window.forgeState.armePrincipale.toUpperCase()} 🔄</span>`;
        } else {
            armeContainer.innerHTML = ``;
        }
    }

    const tagsDiv = document.getElementById("forge-active-tags");
    if (tagsDiv) {
        if (activeTags.size === 0) {
            tagsDiv.innerHTML = `<span class="forge-aucun-tag">Aucune caractéristique cible</span>`;
        } else {
            tagsDiv.innerHTML = Array.from(activeTags).map(t => `<span class="forge-tag-carac">${t}</span>`).join("");
        }
    }

    const selectElement = document.getElementById("forge-element");
    if (selectElement) {
        const element = selectElement.value;
        document.getElementById("forge-element-affichage").innerText = element === "Aucun" ? "" : "• " + element.toUpperCase();
    }

    document.getElementById("forge-cout-pc").innerText = totalPC.toFixed(1) + " PC";
    document.getElementById("forge-fatigue-val").innerText = fatigueConsommee;

    // Au-delà du cap, le chiffre passe au rouge ; sinon il garde la couleur du médaillon.
    document.getElementById("forge-fatigue-val").style.color = capErreur ? "#c62828" : "";

    // La surpuissance que la fatigue de la carte lui donne (app.js), et le
    // prochain palier tant qu'il en reste un.
    const surpuissance = document.getElementById("forge-surpuissance");
    if (surpuissance && typeof window.multiplicateurSurpuissance === "function") {
        const texte = window.texteSurpuissance(fatigueConsommee);
        const prochain = [...window.PALIERS_SURPUISSANCE].reverse().find(p => fatigueConsommee < p.fatigue);
        surpuissance.classList.toggle("active", !!texte);
        surpuissance.textContent = texte
            ? `💥 Surpuissance ${texte} : dégâts et soins`
              + (prochain ? ` (×${String(prochain.multiplicateur).replace(".", ",")} dès ${prochain.fatigue})` : "")
            : `Surpuissance ×${String(prochain.multiplicateur).replace(".", ",")} dès ${prochain.fatigue} de fatigue`;
    }
    document.getElementById("forge-cap-fatigue").innerText = capFatigue;
    document.getElementById("forge-initiative-val").innerText = initiative;

    const conteneurCarte = document.getElementById("forge-contenu-carte");
    conteneurCarte.innerHTML = "";

    const renderSelectMenu = (type, label, color, actionId, estActionPoussee, estActionIllusion) => {
        if (type === "Physique" && window.forgeState.armePrincipale === "Magie") return "";

        let modsDispos = window.forgeState.effetsBDD.filter(e =>
            (e.Type_Mecanique === type || e.Type_Mecanique_2 === type) && e.Nom !== "Durée +"
        );
        let options = "";

        let groupesMods = {};

        // L'action sur laquelle ce menu greffe ses sous-effets.
        const actionCourante = window.forgeState.actions.find(a => a.idInst === actionId);

        modsDispos.forEach(mod => {
            const etat = etatSousEffet(mod, actionCourante, activeTags);
            if (etat === "masque") return;
            const carac = (mod.Modificateur && mod.Modificateur !== "AUCUN") ? mod.Modificateur.toUpperCase() : "GÉNÉRAL";
            if (!groupesMods[carac]) groupesMods[carac] = [];
            // Calcul de la fatigue pour l'affichage
            const coutFatigue = parseFrenchFloat(mod.Cout_PT) * 5;
            groupesMods[carac].push(etat === "incompatible"
                ? `<div class="forge-menu-option incompatible" data-bulle-effet="${mod.id}" data-action="${actionId}">${nettoyerNomEffet(mod.Nom)} <span class="forge-menu-cout">non compatible</span></div>`
                : `<div class="forge-menu-option" data-bulle-effet="${mod.id}" data-mod="${mod.id}" data-action="${actionId}">${nettoyerNomEffet(mod.Nom)} <span class="forge-menu-cout">⚡ ${coutFatigue}</span></div>`);
        });

        const groupe = (carac) => `<div class="forge-menu-groupe">${carac}</div>` + groupesMods[carac].join("");
        ORDRE_MODS.forEach(carac => {
            if (groupesMods[carac] && groupesMods[carac].length > 0) options += groupe(carac);
        });
        Object.keys(groupesMods).forEach(carac => {
            if (!ORDRE_MODS.includes(carac)) options += groupe(carac);
        });

        // UN MENU À NOUS, PLUS UN <select> : une option native ne sait pas
        // montrer de bulle au survol, et sur iPad elle ouvre la roue d'iOS.
        // Chaque sous-effet y porte sa bulle d'explication (data-bulle-effet,
        // voir installerBullesEffets) ; un toucher simple le choisit.
        return `<div class="forge-menu" style="--couleur: ${color};">
                    <button type="button" class="forge-menu-bouton" ${capDepasse || !options ? "disabled" : ""}
                            onclick="window.basculerMenuSousEffets(this)">+ ${label}</button>
                    <div class="forge-menu-liste">${options}</div>
                </div>`;
    };

    if (window.forgeState.actions.length > 0) {
        window.forgeState.actions.forEach(act => {

            const isActMaxed = act.count >= getMaxStacks(act.baseEffet);
            const btnPlusActDisabled = (isActMaxed || capDepasse) ? `class="forge-btn-plus" disabled` : `class="forge-btn-plus"`;

            // Immobilisation et Empoisonnement ont une durée fixe (2 tours chacun) :
            // le bouton ⏳ (Durée +) ne doit jamais apparaître dessus, quoi que dise Tours en base.
            const baseHasDuree = parseFrenchFloat(act.baseEffet.Tours) > 0
                && !(act.baseEffet.Nom || "").toLowerCase().includes("immobil")
                && !(act.baseEffet.Nom || "").toLowerCase().includes("poison");
            const currentBaseDuree = act.baseDuree || 0;
            const btnPlusBaseDureeDisabled = (currentBaseDuree >= maxDureeStacks || capDepasse) ? `class="forge-btn-plus" disabled` : `class="forge-btn-plus"`;

            let htmlMods = "";
            Object.keys(act.mods).forEach(modId => {
                const modCount = act.mods[modId];
                const modEff = window.forgeState.effetsBDD.find(e => e.id === modId);

                const isModMaxed = modCount >= getMaxStacks(modEff);
                const btnPlusModDisabled = (isModMaxed || capDepasse) ? `class="forge-btn-plus" disabled` : `class="forge-btn-plus"`;

                let boutonEditerZone = "";
                if (modEff.Nom === "Zone") {
                    boutonEditerZone = `<button class="btn-parametres forge-btn-zone" onclick="window.ouvrirEditeurZone('${act.idInst}')">Éditer</button>`;
                }

                // Même règle que pour la base : pas de bouton Durée + sur Immobilisation,
                // Empoisonnement ni Persistance de terrain (durées figées par leur propre
                // mécanique). L'Étalement, lui, l'a : chaque cran ⏳ ajoute un tour, et le
                // montant est divisé par ce nombre de tours.
                const nomModDuree = (modEff.Nom || "").toLowerCase().trim();
                const modHasDuree = parseFrenchFloat(modEff.Tours) > 0
                    && !nomModDuree.includes("immobil")
                    && !nomModDuree.includes("poison")
                    && !nomModDuree.includes("persistance");
                const currentModDuree = (act.modsDuree && act.modsDuree[modId]) || 0;
                const btnPlusModDureeDisabled = (currentModDuree >= maxDureeStacks || capDepasse) ? `class="forge-btn-plus" disabled` : `class="forge-btn-plus"`;

                htmlMods += `
                    <div class="forge-ligne forge-sous-effet">
                        <div class="forge-ligne-texte">
                            <span class="forge-nom-effet" data-bulle-effet="${modEff.id}" data-action="${act.idInst}">${nettoyerNomEffet(modEff.Nom)}</span>${modEff.Modificateur !== "AUCUN" ? `<span class="forge-tag-mini">${modEff.Modificateur}</span>` : ""}
                            <div class="forge-desc">${formatterTexteEffet(modEff, modCount, act)}${currentModDuree > 0 ? `<span class="forge-duree-ajoutee">⏳ +${currentModDuree} tour(s) (+${(currentModDuree * coutDureePlus).toFixed(1).replace(/\.0$/, '')} PC)</span>` : ""}</div>
                        </div>
                        <div class="forge-controles">
                            ${modHasDuree ? `
                                <div class="forge-compteur-duree" title="Augmenter la durée">
                                    <button class="forge-btn-moins" onclick="window.modifierDuree('${act.idInst}', '${modId}', -1)">-</button>
                                    <span>⏳ ${currentModDuree}</span>
                                    <button onclick="window.modifierDuree('${act.idInst}', '${modId}', 1)" ${btnPlusModDureeDisabled}>+</button>
                                </div>
                            ` : ""}
                            ${boutonEditerZone}
                            <div class="forge-compteur">
                                <button class="forge-btn-moins" onclick="window.modifierModCount('${act.idInst}', '${modId}', -1)">-</button>
                                <b>${modCount}</b>
                                <button onclick="window.modifierModCount('${act.idInst}', '${modId}', 1)" ${btnPlusModDisabled}>+</button>
                            </div>
                        </div>
                    </div>
                `;
            });

            conteneurCarte.innerHTML += `
                <div class="forge-action">
                    <div class="forge-ligne">
                        <div class="forge-ligne-texte">
                            <span class="forge-nom-effet" data-bulle-effet="${act.baseEffet.id}" data-action="${act.idInst}">${nettoyerNomEffet(act.baseEffet.Nom)}</span>${act.baseEffet.Modificateur !== "AUCUN" ? `<span class="forge-tag-mini">${act.baseEffet.Modificateur}</span>` : ""}
                            <div class="forge-desc">${formatterTexteEffet(act.baseEffet, act.count, act)}${texteValeurSurpuissante(act, fatigueConsommee)}${currentBaseDuree > 0 ? `<span class="forge-duree-ajoutee">⏳ +${currentBaseDuree} tour(s) (+${(currentBaseDuree * coutDureePlus).toFixed(1).replace(/\.0$/, '')} PC)</span>` : ""}</div>
                        </div>
                        <div class="forge-controles">
                            ${baseHasDuree ? `
                                <div class="forge-compteur-duree" title="Augmenter la durée">
                                    <button class="forge-btn-moins" onclick="window.modifierDuree('${act.idInst}', null, -1)">-</button>
                                    <span>⏳ ${currentBaseDuree}</span>
                                    <button onclick="window.modifierDuree('${act.idInst}', null, 1)" ${btnPlusBaseDureeDisabled}>+</button>
                                </div>
                            ` : ""}
                            <div class="forge-compteur">
                                <button class="forge-btn-moins" onclick="window.modifierActionCount('${act.idInst}', -1)">-</button>
                                <b>${act.count}</b>
                                <button onclick="window.modifierActionCount('${act.idInst}', 1)" ${btnPlusActDisabled}>+</button>
                            </div>
                        </div>
                    </div>
                    ${htmlMods}

                    <div class="forge-menus">
                        ${renderSelectMenu("Spatial", "Spatial", "#2f5f8a", act.idInst, actionContientPoussee(act), actionContientIllusion(act))}
                        ${renderSelectMenu("Physique", "Physique", "#9b2c2c", act.idInst, actionContientPoussee(act), actionContientIllusion(act))}
                        ${renderSelectMenu("Magique", "Magique", "#6b3fa0", act.idInst, actionContientPoussee(act), actionContientIllusion(act))}
                        ${renderSelectMenu("Duree", "Durée", "#5b2f86", act.idInst, actionContientPoussee(act), actionContientIllusion(act))}
                    </div>
                </div>
            `;
        });
    }

    const btnValider = document.getElementById("btn-valider-forge");
    const nomSaisi = document.getElementById("forge-nom").value.trim();

    btnValider.disabled = capErreur || fatigueConsommee === 0 || nomSaisi === "" || !window.forgeState.armePrincipale;
};

// LES OUTILS DE LA FORGE, pour LIA (lia_forge.js) : elle pose ses effets avec
// exactement les mêmes règles que le joueur, jamais avec une copie.
window.outilsForge = {
    getMaxStacks, etatSousEffet, estIncompatibleAvecArme, estUneAttaqueDeBase, estUnSoinDeBase,
    typesArmesEquipeesPourForge, purgerIncompatibilitesArme, getActiveTags, actionHasDistance,
    parseFrenchFloat, nettoyerNomEffet, formatterTexteEffet, normalizeForgeType
};

// Le libellé du bouton de la Forge, au repos. Il restait sur « Forge en
// cours... » après une forge réussie : à la réouverture, le bouton parlait
// encore de la technique d'avant.
const LIBELLE_VALIDER_FORGE = "✔️ Forger cette compétence";

window.sauvegarderCompetence = async function() {
    const nomCompetence = document.getElementById("forge-nom").value.trim();
    const arme = window.forgeState.armePrincipale || "Non spécifié";

    const selectElement = document.getElementById("forge-element");
    const element = selectElement ? selectElement.value : "Aucun";

    const fatigue = parseInt(document.getElementById("forge-fatigue-val").innerText);
    const initiative = parseInt(document.getElementById("forge-initiative-val").innerText);
    const coutPc = parseFrenchFloat(document.getElementById("forge-cout-pc").innerText.replace(" PC", ""));

    const btn = document.getElementById("btn-valider-forge");
    btn.innerText = "⏳ Forge en cours…";
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
    // Forgée avec LIA : le récit du joueur reste avec la technique.
    if (window.forgeState.recitRP) dataCompetence.Recit_RP = window.forgeState.recitRP;

    try {
        const idPerso = window.forgeState.idPersonnage;
        const idComp = "COMP_" + Math.random().toString(36).substring(2, 9);
        await setDoc(doc(db, "Personnages", idPerso, "Competences", idComp), dataCompetence);
        // Son illustration se dessine en tâche de fond (illustration_competence.js).
        if (typeof window.illustrerCompetence === "function") window.illustrerCompetence(idPerso, idComp, nomCompetence);

        window.fermerForgeCompetence();
        btn.innerText = LIBELLE_VALIDER_FORGE;
        // La technique est forgée : son récit est parti avec elle, l'aide à la
        // création repart d'une page blanche (jauges sur Auto).
        window.forgeState.recitRP = "";
        const recit = document.getElementById("aide-forge-recit");
        if (recit) recit.value = "";
        ["aide-forge-puissance", "aide-forge-rapidite"].forEach(id => {
            const jauge = document.getElementById(id);
            if (jauge) { jauge.value = 0; if (typeof window.majJaugeAideForge === "function") window.majJaugeAideForge(jauge); }
        });

        if (typeof window.chargerOngletCompetences === "function") {
            window.chargerOngletCompetences(idPerso, window.competencesMaxCombattant(window.forgeState.statsPerso));
        }
    } catch (e) {
        console.error("Erreur de sauvegarde :", e);
        alert("Échec de la forge.");
        btn.innerText = LIBELLE_VALIDER_FORGE;
        btn.disabled = false;
    }
};

// =========================================================================
//  NETTOYAGE AUTOMATIQUE DE L'APERÇU HD (MÉTHODE NINJA)
// =========================================================================

// LA SECONDE DÉFINITION DE masquerApercuCarteHD A ÉTÉ SUPPRIMÉE D'ICI.
//
// Il y en avait deux, mot pour mot identiques à un détail près : celle-ci,
// écrite plus bas dans le fichier, écrasait la vraie au chargement — et elle
// avait perdu en route les deux lignes qui remettent CARTE_APERCU à null et
// rafraîchissent le bouton de fin de tour. Fermer une carte laissait donc le
// bouton croire qu'une compétence était toujours sous les yeux du joueur.
//
// Les interceptions qui suivent (croix de la fiche, clic hors carte) appellent
// maintenant la seule et unique version, celle du chapitre de l'aperçu.

// 1. Interception de la Croix Rouge de la fiche perso
const originalFermerFiche = window.fermerFichePerso;
window.fermerFichePerso = function() {
    window.masquerApercuCarteHD();
    if (originalFermerFiche) originalFermerFiche();
};

// 2. Interception quand tu changes d'onglet (ex: passage à Statistiques)
const originalChangerOnglet = window.changerOngletPerso;
window.changerOngletPerso = function(evt, nomOnglet) {
    window.masquerApercuCarteHD();
    if (originalChangerOnglet) originalChangerOnglet(evt, nomOnglet);
};

// 3. Interception quand on ouvre un autre menu (ex: le chat ou la map)
const originalFermerToutesFenetres = window.fermerToutesLesFenetres;
window.fermerToutesLesFenetres = function() {
    window.masquerApercuCarteHD();
    if (originalFermerToutesFenetres) originalFermerToutesFenetres();
};