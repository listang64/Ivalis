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

    // 2. Ciblage des éléments à modifier
    const titre = document.getElementById("titre-race-selection");
    const description = document.getElementById("description-race-selection");
    const gameplay = document.getElementById("gameplay-race-selection");
    const bgImage = document.getElementById("bg-selection-race");
    
    let texteDesc = "";
    let texteGameplay = "";

    // 3. Mise à jour des images, du lore et du gameplay (avec la nouvelle classe atout-race)
    if (race === "Humain") {
        bgImage.src = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1786114507/Les_humains_h0ubwh.png";
        texteDesc = "Peuple le plus répandu d'Elyria, les Humains vivent sur presque tout le continent. Héritiers de l'ancienne humanité, ils sont aujourd'hui présents dans toutes les cultures et tous les milieux.";
        texteGameplay = "Adaptables et endurants, les Humains disposent d'une réserve de fatigue supérieure qui se renforce avec le repos.<div class='atout-race'><span style='color: #c2a878; font-weight: bold;'>Atout :</span> Fatigue de base : 110 • +10 de fatigue récupérée par repos long</div>";
    
    } else if (race === "Ondari") {
        bgImage.src = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1786218901/Ondaris_i6uxhm.png";
        texteDesc = "Peuple aquatique vivant principalement sur les mers, les îles et les côtes, les Ondaris sont d'excellents navigateurs et marchands. Leur intelligence et leur charisme compensent une force physique moindre, faisant d'eux de redoutables adversaires en mer.";
        texteGameplay = "Affinité avec les forces magiques et aquatiques, les Ondaris peuvent lancer leurs sorts à plus grande distance et ne craignent pas les brûlures.<div class='atout-race'><span style='color: #c2a878; font-weight: bold;'>Atout :</span> +1 portée des sorts magiques • Immunisé à la brûlure</div>";
    
    } else if (race === "Vargen") {
        bgImage.src = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1786220009/Vargens_npjuoa.png";
        texteDesc = "Peuple bestial puissant vivant en clans, les Vargens sont réputés pour leur force, leur endurance et leur instinct de survie. Méfiants envers les autres peuples, ils privilégient les solutions simples et la force brute plutôt que les raisonnements complexes.";
        texteGameplay = "Prédateurs rapides et instinctifs, les Vargens se déplacent avec une grande efficacité et savent éviter les attaques lorsqu'ils quittent le combat.<div class='atout-race'><span style='color: #c2a878; font-weight: bold;'>Atout :</span> Coût de déplacement réduit de 50 % • 30 % de chances d'éviter les attaques d'opportunité</div>";
    
    } else if (race === "Ankylar") {
        bgImage.src = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1786220393/Ankylars_tbaq8b.png";
        texteDesc = "Robustes humanoïdes reptiliens, les Ankylars sont des guerriers endurants et des maîtres de la forge. Peuple dominant de Volcanisse, ils valorisent l'honneur, la discipline et le combat martial, tout en rejetant profondément la magie.";
        texteGameplay = "Robustes et résistants, les Ankylars encaissent particulièrement bien les dégâts physiques grâce à leur constitution naturelle.<div class='atout-race'><span style='color: #c2a878; font-weight: bold;'>Atout :</span> +10 % de résistance physique</div>";
    
    } else if (race === "Ophior") {
        bgImage.src = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1786221325/ophiors_zdmtjn.png";
        texteDesc = "Êtres humanoïdes vivant en symbiose avec les champignons et la nature, les Ophiors ont une apparence aussi fascinante qu'inquiétante. Pacifiques par nature et profondément liés aux forêts, ils évitent les conflits mais savent se défendre lorsque cela devient nécessaire.";
        texteGameplay = "Profondément liés à la nature, les Ophiors possèdent une résistance naturelle aux énergies magiques.<div class='atout-race'><span style='color: #c2a878; font-weight: bold;'>Atout :</span> +10 % de résistance magique</div>";
    
    } else if (race === "Gob") {
        bgImage.src = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1786221325/Gobs_wayc5p.png";
        texteDesc = "Petits, agiles et particulièrement ingénieux, les Gobs sont des êtres curieux qui excelent dans le bricolage, l'invention et les tâches demandant de la précision. Souvent méprisés et réduits en esclavage par les autres peuples, ils survivent grâce à leur intelligence et leur débrouillardise.";
        texteGameplay = "Agiles et débrouillards, les Gobs sont difficiles à toucher et disposent d'une compétence supplémentaire dès la création.<div class='atout-race'><span style='color: #c2a878; font-weight: bold;'>Atout :</span> +3 % d'esquive • +1 compétence</div>";
    
    } else if (race === "Ethéré") {
        bgImage.src = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1786221325/%C3%89th%C3%A9r%C3%A9s_jflyo0.png";
        texteDesc = "Peuple nomade du désert d'Etheria, les Éthérés sont des êtres mystérieux privés de la vue, mais dotés de sens extrêmement développés. Silencieux, précis et remarquablement habiles, ils se déplacent à travers le désert en clans, loin des autres civilisations.";
        texteGameplay = "Résistants et mystérieux, les Éthérés récupèrent davantage de santé grâce aux soins et leur organisme les protège naturellement du poison.<div class='atout-race'><span style='color: #c2a878; font-weight: bold;'>Atout :</span> +30 % aux soins reçus • Immunisé au poison</div>";
    
    } else {
        bgImage.src = "";
        texteDesc = "";
        texteGameplay = "";
    }

    bgImage.style.backgroundColor = (bgImage.src === "") ? "#0a0a0a" : "transparent";
    
    // 4. Application des textes
    if (titre) titre.innerText = "Les " + race + "s";
    if (description) description.innerText = texteDesc;
    if (gameplay) gameplay.innerHTML = texteGameplay; 
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

    // --- NOUVEAU : PRÉPARATION DU TERRAIN (ON CACHE LES CHAMPS INUTILES) ---
    window.adapterFormulaireRace(window.RACE_SELECTIONNEE_TEMP);

    // 3. Ouverture de la modale classique d'identité
    document.getElementById("overlay-jeu-modale").style.display = "block";
    modale.style.display = "block";
};

window.adapterFormulaireRace = function(race) {
    // 1. Liste de TOUS les champs dynamiques (on cache tout par défaut)
    const tousLesChamps = [
        "groupe-cheveux", "groupe-yeux", "groupe-pilosite", "groupe-peau", "groupe-style",
        "groupe-ecailles", "groupe-aretes", "groupe-pelage", "groupe-cornes",
        "groupe-champignons", "groupe-ecorce", "groupe-peau-gob", "groupe-oreilles",
        "groupe-masque", "groupe-colonne", "groupe-expression" // <-- Ajout ici
    ];

    tousLesChamps.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });

    // 2. Champs communs à (presque) tout le monde
    document.getElementById("groupe-yeux").style.display = "flex";
    document.getElementById("groupe-style").style.display = "flex";
    document.getElementById("groupe-expression").style.display = "flex"; // <-- Ajout ici

    // 3. Activation chirurgicale selon la race
    if (race === "Humain") {
        document.getElementById("groupe-cheveux").style.display = "flex";
        document.getElementById("groupe-pilosite").style.display = "flex";
        document.getElementById("groupe-peau").style.display = "flex";
    
    } else if (race === "Ondari") {
        document.getElementById("groupe-ecailles").style.display = "flex";
        document.getElementById("groupe-aretes").style.display = "flex";
    
    } else if (race === "Vargen") {
        document.getElementById("groupe-pelage").style.display = "flex";
        document.getElementById("groupe-cornes").style.display = "flex";
    
    } else if (race === "Ankylar") {
        document.getElementById("groupe-yeux").style.display = "none"; 
    
    } else if (race === "Ophior") {
        document.getElementById("groupe-champignons").style.display = "flex";
        document.getElementById("groupe-ecorce").style.display = "flex";
    
    } else if (race === "Gob") {
        document.getElementById("groupe-cheveux").style.display = "flex"; 
        document.getElementById("groupe-style").style.display = "none"; 
        document.getElementById("groupe-peau-gob").style.display = "flex";
        document.getElementById("groupe-oreilles").style.display = "flex";
    
    } else if (race === "Ethéré") {
        document.getElementById("groupe-masque").style.display = "flex";
        document.getElementById("groupe-colonne").style.display = "flex";
        document.getElementById("groupe-yeux").style.display = "none"; // <-- Ajout ici
        document.getElementById("groupe-expression").style.display = "none"; // <-- Ajout ici
    }
};

// =========================================================================
// ÉTAPE 1 : LE FORMULAIRE CLASSIQUE
// =========================================================================

window.fermerCreationHero = function() {
    document.getElementById("modale-creation-hero").style.display = "none";
    document.getElementById("overlay-jeu-modale").style.display = "none";
};

window.validerEtapeDescriptif = async function() {
    const nom = document.getElementById("champ-nom").value.trim();
    if (nom === "") { alert("Le héros doit posséder un nom."); return; }

    document.getElementById("ecran-chargement-ia").style.display = "flex";
    const btn = document.getElementById("btn-suivant-creation");
    btn.innerText = "Génération...";
    btn.style.pointerEvents = "none";

    const donnees = {
        idPartie: window.ID_PARTIE_COURANTE,
        idJoueur: localStorage.getItem("ID_JOUEUR_COURANT"),
        idPersonnage: "", 
        statut: "Vivant",
        prenom: nom, 
        nom: "",
        age: document.getElementById("champ-age").value,
        race: document.getElementById("champ-race").value,
        genre: document.getElementById("champ-genre").value,
        cheveux: document.getElementById("champ-cheveux") ? document.getElementById("champ-cheveux").value.trim() : "",
        yeux: document.getElementById("champ-yeux") ? document.getElementById("champ-yeux").value.trim() : "",
        pilosite: document.getElementById("champ-pilosite") ? document.getElementById("champ-pilosite").value.trim() : "",
        signes: document.getElementById("champ-signes").value.trim(),
        expression: document.getElementById("champ-expression").value,
        corpulence: document.getElementById("champ-corpulence").value,
        peau: document.getElementById("champ-peau") ? document.getElementById("champ-peau").value : "",
        style: document.getElementById("champ-style") ? document.getElementById("champ-style").value : "",
        couleursDom: document.getElementById("champ-couleurs").value.trim(),
        couleur: document.getElementById("champ-couleur-token").value,
        
        // --- Nouveaux champs spécifiques ---
        ecailles: document.getElementById("champ-ecailles") ? document.getElementById("champ-ecailles").value : "",
        aretes: document.getElementById("champ-aretes") ? document.getElementById("champ-aretes").value : "",
        pelage: document.getElementById("champ-pelage") ? document.getElementById("champ-pelage").value : "",
        cornes: document.getElementById("champ-cornes") ? document.getElementById("champ-cornes").value : "",
        champignons: document.getElementById("champ-champignons") ? document.getElementById("champ-champignons").value : "",
        ecorce: document.getElementById("champ-ecorce") ? document.getElementById("champ-ecorce").value : "",
        peauGob: document.getElementById("champ-peau-gob") ? document.getElementById("champ-peau-gob").value : "",
        oreilles: document.getElementById("champ-oreilles") ? document.getElementById("champ-oreilles").value : "",
        masque: document.getElementById("champ-masque") ? document.getElementById("champ-masque").value.trim() : "",
        colonne: document.getElementById("champ-colonne") ? document.getElementById("champ-colonne").value : ""
    };

    try {
        const resultatServeur = await window.sauvegarderFichePersonnage(donnees);

        document.getElementById("champ-id-personnage").value = resultatServeur.id;
        document.getElementById("champ-id-personnage").setAttribute("data-url", resultatServeur.url);
        document.getElementById("titre-nom-personnage").innerText = nom;
        
        window.fermerCreationHero();
        document.getElementById("ecran-chargement-ia").style.display = "none";
        
        window.ouvrirModaleCreationCaracs(resultatServeur.id);
    } catch (e) {
        console.error("Erreur de création :", e);
        alert("Une interférence magique a bloqué la création.");
        document.getElementById("ecran-chargement-ia").style.display = "none";
    } finally {
        btn.innerText = "Valider";
        btn.style.pointerEvents = "auto";
    }
};

window.validerEtapeDescriptifRapide = async function() {
    const nom = document.getElementById("champ-nom").value.trim();
    if (nom === "") { alert("Le héros doit posséder un nom."); return; }

    const btn = document.getElementById("btn-dev-skip-creation");
    btn.innerText = "Création DEV...";
    btn.style.pointerEvents = "none";

    const donnees = {
        idPartie: window.ID_PARTIE_COURANTE,
        idJoueur: localStorage.getItem("ID_JOUEUR_COURANT"),
        idPersonnage: "",
        statut: "Vivant",
        prenom: nom,
        nom: "",
        age: document.getElementById("champ-age").value,
        race: document.getElementById("champ-race").value,
        genre: document.getElementById("champ-genre").value,
        couleur: document.getElementById("champ-couleur-token").value || "#ff4c4c",
        
        cheveux: "", yeux: "", pilosite: "", signes: "", expression: "", corpulence: "", peau: "", style: "", couleursDom: "",
        ecailles: "", aretes: "", pelage: "", cornes: "", champignons: "", ecorce: "", peauGob: "", oreilles: "", masque: "", colonne: ""
    };

    try {
        const resultatServeur = await window.sauvegarderFichePersonnage(donnees, true);

        document.getElementById("champ-id-personnage").value = resultatServeur.id;
        document.getElementById("champ-id-personnage").setAttribute("data-url", "");
        document.getElementById("titre-nom-personnage").innerText = nom;
        
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
