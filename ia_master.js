// =========================================================================
//  IVALIS - Cerveau IA (Mia l'Architecte / Routeur)
// =========================================================================

import { db } from "./firebase-config.js";
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// --- 1. FONCTIONS DE RECHERCHE FIRESTORE (Les Outils de Mia) ---

async function chercherLieu(nomLieu) {
    console.log(`[Mia] 🌍 Recherche du lieu : ${nomLieu}`);
    const q = query(collection(db, "Monde_Lieux"), where("Nom_Du_Lieu", "==", nomLieu));
    const snap = await getDocs(q);
    if (snap.empty) return { erreur: "Lieu introuvable" };
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function chercherBatiment(nomBatiment) {
    console.log(`[Mia] 🏠 Recherche du bâtiment : ${nomBatiment}`);
    
    // 1. On cherche le bâtiment
    const qBatiment = query(collection(db, "Monde_Batiment"), where("Nom_Batiment", "==", nomBatiment));
    const snapBatiment = await getDocs(qBatiment);
    if (snapBatiment.empty) return { erreur: "Bâtiment introuvable" };
    
    const batimentData = snapBatiment.docs[0].data();
    const batimentId = snapBatiment.docs[0].id; // Ex: "B-01"

    // 2. NOUVEAU : On cherche automatiquement les PNJ présents à l'intérieur
    console.log(`[Backend] 🔍 Recherche auto des PNJ dans le bâtiment ID: ${batimentId}`);
    const qPnj = query(collection(db, "Monde_PNJ"), where("ID_Batiment", "==", batimentId));
    const snapPnj = await getDocs(qPnj);
    
    let pnjPresents = [];
    snapPnj.forEach(doc => {
        pnjPresents.push({ id: doc.id, ...doc.data() });
    });

    // 3. On renvoie le tout (Bâtiment + Liste des PNJ) au Narrateur
    return { 
        id: batimentId, 
        ...batimentData,
        PNJ_Presents_Ici: pnjPresents.length > 0 ? pnjPresents : "Aucun PNJ connu n'est présent dans ce bâtiment."
    };
}

async function chercherPNJ(nomPNJ) {
    console.log(`[Mia] 👤 Recherche du PNJ : ${nomPNJ}`);
    const q = query(collection(db, "Monde_PNJ"), where("Nom_PNJ", "==", nomPNJ));
    const snap = await getDocs(q);
    if (snap.empty) return { erreur: "PNJ introuvable" };
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// --- 2. LE CERVEAU DE MIA (Appel Gemini avec Tool Calling) ---

async function analyserSituationEtAppelerOutils(historiqueTexte, lieuActuel) {
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cleGemini) {
        console.error("[Mia] ❌ Clé Gemini manquante !");
        alert("Veuillez renseigner votre clé Gemini dans les paramètres.");
        return null;
    }

    console.log("[Mia] 🧠 Analyse de la situation en cours via Gemini...");

    const promptSysteme = `Tu es Mia, l'intelligence artificielle de routage d'un jeu de rôle. 
Ton but n'est PAS de répondre aux joueurs. Ton but est de lire l'action en cours et de déterminer si le Maître du Jeu aura besoin d'informations spécifiques depuis la base de données (un lieu, un bâtiment, ou un PNJ) pour narrer la suite.
Lieu actuel du groupe : ${lieuActuel}.
Si les joueurs interagissent avec un élément ou y font référence, utilise l'outil approprié. Sinon, ne fais rien.`;

    // Format strict de déclaration des outils pour Gemini
    const outils = [{
        functionDeclarations: [
            {
                name: "chercherLieu",
                description: "Récupère les détails d'un lieu global (ex: un village, une forêt).",
                parameters: { type: "OBJECT", properties: { nomLieu: { type: "STRING" } }, required: ["nomLieu"] }
            },
            {
                name: "chercherBatiment",
                description: "Récupère les détails d'un bâtiment spécifique (ex: Taverne, Forge).",
                parameters: { type: "OBJECT", properties: { nomBatiment: { type: "STRING" } }, required: ["nomBatiment"] }
            },
            {
                name: "chercherPNJ",
                description: "Récupère la fiche technique et le secret d'un PNJ.",
                parameters: { type: "OBJECT", properties: { nomPNJ: { type: "STRING" } }, required: ["nomPNJ"] }
            }
        ]
    }];

    const bodyRequete = {
        systemInstruction: { parts: [{ text: promptSysteme }] },
        contents: [{ role: "user", parts: [{ text: historiqueTexte }] }],
        tools: outils,
        toolConfig: { functionCallingConfig: { mode: "AUTO" } }
    };

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${cleGemini}`;
        const reponse = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyRequete)
        });

        const data = await reponse.json();

        if (!reponse.ok || data.error) {
            console.error("[Mia] ❌ Erreur Gemini détaillée :", data.error);
            alert("Erreur Gemini : " + (data.error?.message || "Accès refusé"));
            return null;
        }

        // Gemini place les appels de fonctions dans la réponse ("functionCall")
        const candidat = data.candidates[0];
        const parties = candidat.content.parts;
        const appelsOutils = parties.filter(p => p.functionCall).map(p => p.functionCall);

        return appelsOutils.length > 0 ? appelsOutils : null;

    } catch (erreur) {
        console.error("[Mia] ❌ Erreur réseau ou plantage :", erreur);
        return null;
    }
}

// --- 3. LA FONCTION DE TEST PRINCIPALE ---

window.testerArchitecteIA = async function() {
    if (!window.ID_PARTIE_COURANTE) {
        alert("Vous devez d'abord charger ou créer une partie.");
        return;
    }

    console.log("=====================================");
    console.log("🚀 DEMARRAGE DU TEST ARCHITECTE (MIA - GEMINI)");
    console.log("=====================================");

    const snapPartie = await getDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE));
    const lieuActuel = snapPartie.exists() ? snapPartie.data().Lieu_Actuel : "Inconnu";

    const qMsg = query(
        collection(db, "Messages_Chat"), 
        where("ID_Partie", "==", window.ID_PARTIE_COURANTE), 
        orderBy("Timestamp", "desc"), 
        limit(3)
    );
    const snapMsg = await getDocs(qMsg);
    let messages = [];
    snapMsg.forEach(document => messages.unshift(document.data()));

    const historiqueTexte = messages.map(m => `${m.Auteur_Nom} : ${m.Texte}`).join("\n");
    console.log("📜 Historique envoyé à Mia :\n", historiqueTexte);

    const appelsOutils = await analyserSituationEtAppelerOutils(historiqueTexte, lieuActuel);

    if (appelsOutils && appelsOutils.length > 0) {
        console.log(`[Mia] 🛠️ A décidé d'utiliser ${appelsOutils.length} outil(s).`);
        
        let donneesRecuperees = [];

        for (const call of appelsOutils) {
            const nomFonction = call.name;
            const argumentsFonction = call.args;
            let resultatBdd = null;

            if (nomFonction === "chercherLieu") resultatBdd = await chercherLieu(argumentsFonction.nomLieu);
            if (nomFonction === "chercherBatiment") resultatBdd = await chercherBatiment(argumentsFonction.nomBatiment);
            if (nomFonction === "chercherPNJ") resultatBdd = await chercherPNJ(argumentsFonction.nomPNJ);

            donneesRecuperees.push({
                entite: nomFonction,
                donnees: resultatBdd
            });
        }

        console.log("✅ DONNEES FINALES RECUPEREES POUR LE NARRATEUR :", donneesRecuperees);
        alert("Regarde la console ! Mia a récupéré les données avec succès via Gemini.");

    } else {
        console.log("[Mia] 🛑 Aucune donnée supplémentaire n'est requise pour cette action.");
        alert("Mia a décidé qu'il n'y avait pas besoin d'interroger la base de données.");
    }
};

// =========================================================================
//  4. LE CERVEAU DU NARRATEUR (Le Maître du Jeu)
// =========================================================================

async function genererReponseNarrateur(contexteBdd, historiqueComplet) {
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cleGemini) return null;

    console.log("✍️ [Narrateur] Écriture de la réponse en cours...");

    // 1. Récupération des instructions du MJ (INST_10895)
    let instructionMJ = "Tu es le Maître du Jeu d'Ivalis. Réponds à l'action des joueurs de manière immersive.";
    const snapInst = await getDoc(doc(db, "Cerveau_IA", "INST_10895"));
    if (snapInst.exists() && snapInst.data().Contenu_Direct) {
        instructionMJ = snapInst.data().Contenu_Direct;
    }

    // 2. Construction du cerveau (Instructions fixes + Données de Mia)
    let promptSysteme = instructionMJ + "\n\n--- CONTEXTE ACTUEL DU JEU ---\n";
    if (contexteBdd.length === 0) {
        promptSysteme += "Aucune information de la base de données n'a été jugée nécessaire pour cette action.\n";
    } else {
        contexteBdd.forEach(info => {
            promptSysteme += `[Données sur ${info.entite}] : ${JSON.stringify(info.donnees)}\n`;
        });
    }
    promptSysteme += "\nTu dois continuer l'histoire en répondant à la dernière action des joueurs présente dans l'historique.";

    // 3. Configuration de Gemini 3.5 Flash (Mode Brut / Sans Filtres)
    const bodyRequete = {
        systemInstruction: { parts: [{ text: promptSysteme }] },
        contents: [{ role: "user", parts: [{ text: historiqueComplet }] }],
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${cleGemini}`;
        const reponse = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyRequete)
        });

        const data = await reponse.json();
        if (!reponse.ok || data.error) throw new Error(data.error?.message);

        return data.candidates[0].content.parts[0].text;

    } catch (erreur) {
        console.error("❌ [Narrateur] Erreur de génération :", erreur);
        return "*Le temps s'est figé. Le Grimoire ne parvient pas à décrire la suite... (Erreur API)*";
    }
}

// =========================================================================
//  5. LA BOUCLE GLOBALE (Déclenchée par le bouton MJ)
// =========================================================================

window.declencherTourIA = async function() {
    if (!window.ID_PARTIE_COURANTE) return;

    // A. Récupération des données globales
    const snapPartie = await getDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE));
    const lieuActuel = snapPartie.exists() ? snapPartie.data().Lieu_Actuel : "Inconnu";

    const qMsg = query(collection(db, "Messages_Chat"), where("ID_Partie", "==", window.ID_PARTIE_COURANTE), orderBy("Timestamp", "asc"));
    const snapMsg = await getDocs(qMsg);
    
    let messages = [];
    snapMsg.forEach(document => messages.push(document.data()));
    if (messages.length === 0) return;

    // Formatage : "Nom (Jour X, An Y): Message"
    const historiqueComplet = messages.map(m => `${m.Auteur_Nom} (Jour ${m.Date_Jour || '?'}, An ${m.Date_An || '?'}): ${m.Texte}`).join("\n");
    const dernierMessage = messages[messages.length - 1];
    const texteDerniereAction = `${dernierMessage.Auteur_Nom} : ${dernierMessage.Texte}`;

    // B. Phase 1 : Mia (Routage avec le dernier message)
    let donneesRecuperees = [];
    const appelsOutils = await analyserSituationEtAppelerOutils(texteDerniereAction, lieuActuel);

    if (appelsOutils && appelsOutils.length > 0) {
        for (const call of appelsOutils) {
            let res = null;
            if (call.name === "chercherLieu") res = await chercherLieu(call.args.nomLieu);
            if (call.name === "chercherBatiment") res = await chercherBatiment(call.args.nomBatiment);
            if (call.name === "chercherPNJ") res = await chercherPNJ(call.args.nomPNJ);
            donneesRecuperees.push({ entite: call.name, donnees: res });
        }
    }

    // C. Phase 2 : Le Narrateur (Génération)
    const reponseTexte = await genererReponseNarrateur(donneesRecuperees, historiqueComplet);

    // D. Phase 3 : Poster la réponse dans le Chat
    if (reponseTexte) {
        const jourEnJeu = window.DATE_EN_JEU_ACTUELLE ? window.DATE_EN_JEU_ACTUELLE.jour : "";
        const anEnJeu = window.DATE_EN_JEU_ACTUELLE ? window.DATE_EN_JEU_ACTUELLE.annee : "";

        await addDoc(collection(db, "Messages_Chat"), {
            ID_Partie: window.ID_PARTIE_COURANTE,
            Auteur_ID: "MJ",
            Auteur_Nom: "MJ",
            Auteur_Couleur: "#ffffff",
            Texte: reponseTexte,
            Date_Jour: jourEnJeu,
            Date_An: anEnJeu,
            Timestamp: new Date().getTime()
        });

        // Fait passer l'initiative au joueur suivant
        const partie = window.PARTIE_DATA || {};
        const ordre = partie.Ordre_Initiative || [];
        if (ordre.length > 0) {
            await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), { Index_Initiative: 0 });
        }
    }
};