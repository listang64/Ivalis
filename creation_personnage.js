// =========================================================================
//  IVALIS - MODULE DE CRÉATION DE HÉROS (WIZARD ÉTAPE 1)
// =========================================================================

window.ouvrirCreationHero = function() {
    // Nettoyage de la modale
    const modale = document.getElementById("modale-creation-hero");
    const inputs = modale.querySelectorAll(".input-perso");
    inputs.forEach(input => {
        if (input.tagName === "SELECT") input.selectedIndex = 0;
        else input.value = "";
    });
    document.getElementById("champ-couleur-token").value = "#2a1a0f";

    document.getElementById("overlay-jeu-modale").style.display = "block";
    modale.style.display = "block";
};

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
