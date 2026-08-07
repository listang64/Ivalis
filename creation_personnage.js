// =========================================================================
//  IVALIS - MODULE DE CRÉATION DE HÉROS (WIZARD ÉTAPE 0 & 1)
// =========================================================================

import { db } from "./firebase-config.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

window.RACE_SELECTIONNEE_TEMP = "Humain"; // Par défaut

// --- ÉTAPE 0 : LE NOUVEL ÉCRAN DE SÉLECTION DE LA RACE ---
window.ouvrirCreationHero = function() {
    // On ouvre le grand écran en forçant l'affichage sur les Humains au démarrage
    window.changerRaceSelection('Humain');
    document.getElementById("ecran-selection-race").style.display = "block";
};

window.fermerSelectionRace = function() {
    document.getElementById("ecran-selection-race").style.display = "none";
};

window.changerRaceSelection = function(race) {
    window.RACE_SELECTIONNEE_TEMP = race;

    // 1. Mise à jour visuelle des onglets
    const boutons = document.querySelectorAll("#onglets-races .onglet-race");
    boutons.forEach(btn => {
        if (btn.innerText.toLowerCase().includes(race.toLowerCase())) {
            btn.classList.add("actif");
        } else {
            btn.classList.remove("actif");
        }
    });

    // 2. Mise à jour du grand titre
    const titre = document.getElementById("titre-race-selection");
    if (titre) titre.innerText = "Les " + race + "s"; // Gère le pluriel automatiquement

    // 3. Mise à jour de l'image de fond (object-fit gèrera la déformation)
    const bgImage = document.getElementById("bg-selection-race");
    if (race === "Humain") {
        bgImage.src = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1786114507/Les_humains_h0ubwh.png";
        bgImage.style.backgroundColor = "transparent";
    } else {
        // En attendant d'avoir les images des autres races, on met un fond noir propre
        bgImage.src = "";
        bgImage.style.backgroundColor = "#0a0a0a"; 
    }
};

window.validerRaceEtGenre = function(genre) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    
    // 1. On ferme le grand écran de sélection des races
    window.fermerSelectionRace();

    // 2. Nettoyage de la modale descriptive (Étape 1 classique)
    const modale = document.getElementById("modale-creation-hero");
    const inputs = modale.querySelectorAll(".input-perso");
    inputs.forEach(input => {
        if (input.tagName === "SELECT") input.selectedIndex = 0;
        else input.value = "";
    });
    document.getElementById("champ-couleur-token").value = "#2a1a0f";

    // --- AUTO-REMPLISSAGE DES CHAMPS SELECTIONNÉS ---
    document.getElementById("champ-race").value = window.RACE_SELECTIONNEE_TEMP;
    document.getElementById("champ-genre").value = genre;

    // 3. Ouverture de la modale classique d'identité
    document.getElementById("overlay-jeu-modale").style.display = "block";
    modale.style.display = "block";
};

// =========================================================================
// ÉTAPE 1 : LE FORMULAIRE CLASSIQUE
// =========================================================================

window.fermerCreationHero = function() {
    document.getElementById("modale-creation-hero").style.display = "none";
    document.getElementById("overlay-jeu-modale").style.display = "none";
};

window.validerEtapeDescriptif = async function() {
    const prenom = document.getElementById("champ-prenom").value.trim();
    if (prenom === "") { alert("Le héros doit au moins posséder un prénom."); return; }

    document.getElementById("ecran-chargement-ia").style.display = "flex";
    const btn = document.getElementById("btn-suivant-creation");
    btn.innerText = "Génération...";
    btn.style.pointerEvents = "none";

    const donnees = {
        idPartie: window.ID_PARTIE_COURANTE,
        idJoueur: localStorage.getItem("ID_JOUEUR_COURANT"),
        idPersonnage: "", // C'est un nouveau personnage
        statut: "Vivant",
        prenom: prenom,
        nom: document.getElementById("champ-nom").value.trim(),
        age: document.getElementById("champ-age").value.trim(),
        race: document.getElementById("champ-race").value,
        genre: document.getElementById("champ-genre").value,
        cheveux: document.getElementById("champ-cheveux").value.trim(),
        yeux: document.getElementById("champ-yeux").value.trim(),
        pilosite: document.getElementById("champ-pilosite").value.trim(),
        signes: document.getElementById("champ-signes").value.trim(),
        expression: document.getElementById("champ-expression").value.trim(),
        corpulence: document.getElementById("champ-corpulence").value,
        taille: document.getElementById("champ-taille").value,
        peau: document.getElementById("champ-peau").value.trim(),
        style: document.getElementById("champ-style").value.trim(),
        couleursDom: document.getElementById("champ-couleurs").value.trim(),
        equipement: document.getElementById("champ-equipement").value.trim(),
        couleur: document.getElementById("champ-couleur-token").value,
        idFaction: document.getElementById("champ-faction").value
    };

    try {
        // 1. Sauvegarde en BDD et génération de l'image via le backend
        const resultatServeur = await window.sauvegarderFichePersonnage(donnees);

        // 2. Préparation des variables cachées pour la Fiche Perso finale
        document.getElementById("champ-id-personnage").value = resultatServeur.id;
        document.getElementById("champ-id-personnage").setAttribute("data-url", resultatServeur.url);
        document.getElementById("titre-nom-personnage").innerText = prenom + " " + donnees.nom;
        
        // 3. Fermeture de l'Étape 1
        window.fermerCreationHero();
        document.getElementById("ecran-chargement-ia").style.display = "none";
        
        // 4. Lancement de l'Étape 2 (Caractéristiques)
        window.ouvrirModaleCreationCaracs(resultatServeur.id);

    } catch (e) {
        console.error("Erreur de création :", e);
        alert("Une interférence magique a bloqué la création.");
        document.getElementById("ecran-chargement-ia").style.display = "none";
    } finally {
        btn.innerText = "Étape Suivante : Caractéristiques";
        btn.style.pointerEvents = "auto";
    }
};

window.validerEtapeDescriptifRapide = async function() {
    const prenom = document.getElementById("champ-prenom").value.trim();
    if (prenom === "") { alert("Le héros doit au moins posséder un prénom."); return; }

    const btn = document.getElementById("btn-dev-skip-creation");
    btn.innerText = "Création DEV...";
    btn.style.pointerEvents = "none";

    const donnees = {
        idPartie: window.ID_PARTIE_COURANTE,
        idJoueur: localStorage.getItem("ID_JOUEUR_COURANT"),
        idPersonnage: "",
        statut: "Vivant",
        prenom: prenom,
        nom: document.getElementById("champ-nom").value.trim() || "[DEV]",
        age: document.getElementById("champ-age").value.trim(),
        race: document.getElementById("champ-race").value,
        genre: document.getElementById("champ-genre").value,
        couleur: document.getElementById("champ-couleur-token").value || "#ff4c4c",
        idFaction: document.getElementById("champ-faction").value,
        cheveux: "", yeux: "", pilosite: "", signes: "", expression: "", 
        corpulence: "", taille: "", peau: "", style: "", couleursDom: "", equipement: ""
    };

    try {
        const resultatServeur = await window.sauvegarderFichePersonnage(donnees, true);

        document.getElementById("champ-id-personnage").value = resultatServeur.id;
        document.getElementById("champ-id-personnage").setAttribute("data-url", "");
        document.getElementById("titre-nom-personnage").innerText = prenom + " " + donnees.nom;
        
        window.fermerCreationHero();
        window.ouvrirModaleCreationCaracs(resultatServeur.id);

    } catch (e) {
        console.error("Erreur de création DEV :", e);
        alert("Une interférence a bloqué la création rapide.");
    } finally {
        btn.innerText = "[DEV] Création Rapide (Sans IA)";
        btn.style.pointerEvents = "auto";
    }
};

window.afficherStatsCombat = function(donnees) {
    const prenom = donnees.prenom || donnees.Prenom_Personnage || "";
    const nom = donnees.nom || donnees.Nom_Personnage || "";

    const nomElement = document.getElementById("stats-nom-perso");
    if (nomElement) {
        nomElement.innerText = (prenom + " " + nom).trim();
    }

    const modPv = donnees.Dev_Mod_PV || 0;
    const modFatigue = donnees.Dev_Mod_Fatigue || 0;
    const modRegen = donnees.Dev_Mod_Regen || 0;
    const modEsquive = donnees.Dev_Mod_Esquive || 0;
    const modParade = donnees.Dev_Mod_Parade || 0;
    const modCritique = donnees.Dev_Mod_Critique || 0;
    const modDefPhys = donnees.Dev_Mod_DefPhys || 0;
    const modDefMag = donnees.Dev_Mod_DefMag || 0;

    const basePv = donnees.PV_Max || 0;
    const baseFatigue = donnees.Fatigue_Max !== undefined ? donnees.Fatigue_Max : 100;
    const baseRegen = donnees.Regeneration !== undefined ? donnees.Regeneration : 30;
    const baseEsquive = donnees.Esquive !== undefined ? donnees.Esquive : 15;
    const baseParade = donnees.Parade !== undefined ? donnees.Parade : 0;
    const baseCritique = donnees.Critique !== undefined ? donnees.Critique : 10;
    const baseDefPhys = donnees.Def_Physique !== undefined ? donnees.Def_Physique : 0;
    const baseDefMag = donnees.Def_Magique !== undefined ? donnees.Def_Magique : 0;

    const finalPv = basePv + modPv;
    const finalFatigue = baseFatigue + modFatigue;
    const finalRegen = baseRegen + modRegen;
    const finalEsquive = baseEsquive + modEsquive;
    const finalParade = baseParade + modParade;
    const finalCritique = baseCritique + modCritique;
    const finalDefPhys = baseDefPhys + modDefPhys;
    const finalDefMag = baseDefMag + modDefMag;

    document.getElementById("stat-pv").innerText = finalPv;
    document.getElementById("stat-fatigue").innerText = finalFatigue;
    document.getElementById("stat-regen").innerText = finalRegen + "%";
    document.getElementById("stat-esquive").innerText = finalEsquive + "%";
    document.getElementById("stat-parade").innerText = finalParade + "%";
    document.getElementById("stat-critique").innerText = finalCritique + "%";
    document.getElementById("stat-defphys").innerText = finalDefPhys + "%";
    document.getElementById("stat-defmag").innerText = finalDefMag + "%";

    const affPv = document.getElementById("affichage-pv-max");
    if (affPv) affPv.innerText = finalPv;

    const setDevMod = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || "";
    };
    setDevMod("dev-mod-pv", modPv);
    setDevMod("dev-mod-fatigue", modFatigue);
    setDevMod("dev-mod-regen", modRegen);
    setDevMod("dev-mod-esquive", modEsquive);
    setDevMod("dev-mod-parade", modParade);
    setDevMod("dev-mod-critique", modCritique);
    setDevMod("dev-mod-defphys", modDefPhys);
    setDevMod("dev-mod-defmag", modDefMag);
};

window.appliquerModificateursDev = async function() {
    const idPersonnage = document.getElementById("champ-id-personnage").value;
    if (!idPersonnage || idPersonnage === "") {
        alert("Ouvrez d'abord la fiche d'un héros existant.");
        return;
    }

    const btn = document.querySelector("#onglet-dev button[onclick*='appliquerModificateursDev']");
    const txtOriginal = btn.innerText;
    btn.innerText = "Altération en cours...";
    btn.style.pointerEvents = "none";

    try {
        const modPv = parseInt(document.getElementById("dev-mod-pv").value) || 0;
        const modFatigue = parseInt(document.getElementById("dev-mod-fatigue").value) || 0;
        const modRegen = parseInt(document.getElementById("dev-mod-regen").value) || 0;
        const modEsquive = parseInt(document.getElementById("dev-mod-esquive").value) || 0;
        const modParade = parseInt(document.getElementById("dev-mod-parade").value) || 0;
        const modCritique = parseInt(document.getElementById("dev-mod-critique").value) || 0;
        const modDefPhys = parseInt(document.getElementById("dev-mod-defphys").value) || 0;
        const modDefMag = parseInt(document.getElementById("dev-mod-defmag").value) || 0;

        const refPerso = doc(db, "Personnages", idPersonnage);
        await updateDoc(refPerso, {
            Dev_Mod_PV: modPv,
            Dev_Mod_Fatigue: modFatigue,
            Dev_Mod_Regen: modRegen,
            Dev_Mod_Esquive: modEsquive,
            Dev_Mod_Parade: modParade,
            Dev_Mod_Critique: modCritique,
            Dev_Mod_DefPhys: modDefPhys,
            Dev_Mod_DefMag: modDefMag
        });

        const snapPerso = await getDoc(refPerso);
        if (snapPerso.exists()) {
            window.afficherStatsCombat(snapPerso.data());
        }

        btn.innerText = "Altérations Appliquées ! ✔️";
        setTimeout(() => {
            btn.innerText = txtOriginal;
            btn.style.pointerEvents = "auto";
        }, 2000);

    } catch (e) {
        console.error(e);
        alert("Échec de l'altération des stats.");
        btn.innerText = txtOriginal;
        btn.style.pointerEvents = "auto";
    }
};
