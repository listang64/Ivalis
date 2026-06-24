// =========================================================================
//  IVALIS - MOTEUR IA (Pré-chargement Backend + Mia + Narrateur)
// =========================================================================

import { db } from "./firebase-config.js";
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// --- 1. LE BACKEND (Le radar qui scanne la zone avant l'IA) ---

async function preparerEnvironnement(lieuActuelId) {
    console.log(`[Backend] 📡 Scan de la zone en cours pour l'ID : ${lieuActuelId}`);
    
    let env = {
        type: "Inconnu",
        details: null,
        listeBatiments: [], // Noms des bâtiments (Uniquement pour les Lieux)
        pnjsPresents: {}    // Dictionnaire { "Nom_PNJ": { Fiche complète } }
    };

    if (!lieuActuelId) return env;

    // CAS A : LES JOUEURS SONT DANS UN LIEU GLOBAL (Commence par "L")
    if (lieuActuelId.startsWith("L")) {
        env.type = "Lieu";
        
        // 1. Infos du Lieu
        const snapLieu = await getDoc(doc(db, "Monde_Lieux", lieuActuelId));
        if (snapLieu.exists()) env.details = snapLieu.data();

        // 2. Liste des Bâtiments dans ce Lieu
        const qBat = query(collection(db, "Monde_Batiment"), where("ID_Lieu", "==", lieuActuelId));
        const snapBat = await getDocs(qBat);
        snapBat.forEach(doc => { env.listeBatiments.push(doc.data().Nom_Batiment); });

        // 3. PNJ présents en extérieur dans ce Lieu
        const qPnj = query(collection(db, "Monde_PNJ"), where("ID_Lieu", "==", lieuActuelId));
        const snapPnj = await getDocs(qPnj);
        snapPnj.forEach(doc => { env.pnjsPresents[doc.data().Nom_PNJ] = doc.data(); });
    }
    
    // CAS B : LES JOUEURS SONT DANS UN BÂTIMENT (Commence par "B")
    else if (lieuActuelId.startsWith("B")) {
        env.type = "Bâtiment";

        // 1. Infos du Bâtiment
        const snapBat = await getDoc(doc(db, "Monde_Batiment", lieuActuelId));
        if (snapBat.exists()) env.details = snapBat.data();

        // 2. PNJ présents à l'intérieur
        const qPnj = query(collection(db, "Monde_PNJ"), where("ID_Batiment", "==", lieuActuelId));
        const snapPnj = await getDocs(qPnj);
        snapPnj.forEach(doc => { env.pnjsPresents[doc.data().Nom_PNJ] = doc.data(); });
    }

    return env;
}

// --- 2. LE CERVEAU DE MIA (Filtre les interactions avec les PNJ) ---

async function filtrerPNJAvecMia(historique4Messages, listeNomsPNJ) {
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cleGemini) return [];

    console.log(`[Mia] 🧠 Analyse des 4 derniers messages pour trouver : ${listeNomsPNJ.join(", ")}`);

    const promptSysteme = `Tu es Mia, l'IA d'analyse.
Voici les PNJ présents dans la zone : ${listeNomsPNJ.join(", ")}.
Lis les 4 derniers messages. Ton seul rôle est d'identifier si les joueurs s'adressent, interagissent ou font référence à un ou plusieurs PNJ de cette liste.
Si oui, utilise l'outil 'selectionnerPNJ' et donne leurs noms exacts. S'ils ne parlent à aucun PNJ de la liste, ne fais rien.`;

    const outils = [{
        functionDeclarations: [{
            name: "selectionnerPNJ",
            description: "Sélectionne les PNJ sollicités par les joueurs.",
            parameters: { 
                type: "OBJECT", 
                properties: { noms: { type: "ARRAY", items: { type: "STRING" } } }, 
                required: ["noms"] 
            }
        }]
    }];

    const bodyRequete = {
        systemInstruction: { parts: [{ text: promptSysteme }] },
        contents: [{ role: "user", parts: [{ text: historique4Messages }] }],
        tools: outils,
        toolConfig: { functionCallingConfig: { mode: "AUTO" } }
    };

    try {
        const reponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGemini}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyRequete)
        });

        const data = await reponse.json();
        const candidat = data.candidates?.[0];
        if (!candidat) return [];

        const appelsOutils = candidat.content.parts.filter(p => p.functionCall).map(p => p.functionCall);
        
        if (appelsOutils.length > 0 && appelsOutils[0].name === "selectionnerPNJ") {
            return appelsOutils[0].args.noms; // Renvoie ["Rose", "Gajar"] par exemple
        }
        return [];
    } catch (erreur) {
        console.error("[Mia] ❌ Erreur :", erreur);
        return [];
    }
}

// =========================================================================
//  GESTION DE L'INTERFACE VISUELLE (Écran d'attente IA)
// =========================================================================

function afficherEcranAttente() {
    // S'il existe déjà, on ne fait rien
    if (document.getElementById("ecran-attente-ia")) return;

    const overlay = document.createElement("div");
    overlay.id = "ecran-attente-ia";
    // Style CSS pour forcer l'affichage en plein écran, par-dessus tout le reste
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.85); display: flex; flex-direction: column;
        align-items: center; justify-content: center; z-index: 9999;
        backdrop-filter: blur(5px);
    `;

    const texte = document.createElement("h2");
    texte.innerText = "En attente du maitre du jeu ...";
    texte.style.cssText = "color: white; font-family: serif; font-size: 2rem; margin-bottom: 20px; letter-spacing: 2px; text-shadow: 2px 2px 4px #000;";

    const image = document.createElement("img");
    image.src = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782291884/attente_mj_rtmpv1.png";
    image.style.cssText = "max-width: 80%; max-height: 60vh; border-radius: 10px; box-shadow: 0 0 30px rgba(255, 255, 255, 0.1);";

    overlay.appendChild(texte);
    overlay.appendChild(image);
    document.body.appendChild(overlay);
}

function masquerEcranAttente() {
    const overlay = document.getElementById("ecran-attente-ia");
    if (overlay) overlay.remove();
}

// --- 3. LE CERVEAU DU NARRATEUR ---

async function genererReponseNarrateur(contexteFormate, historiqueComplet, maxTentatives = 3) {
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cleGemini) return null;

    // NOUVEAU : Récupération de la température (Par défaut 1.0)
    const temperatureIA = parseFloat(localStorage.getItem("ivalis_IA_TEMPERATURE")) || 1.0;

    let instructionMJ = "Tu es le Maître du Jeu.";
    const snapInst = await getDoc(doc(db, "Cerveau_IA", "INST_10895"));
    if (snapInst.exists() && snapInst.data().Contenu_Direct) {
        instructionMJ = snapInst.data().Contenu_Direct;
    }

    const promptSysteme = instructionMJ + "\n\n" + contexteFormate + "\n\nContinue l'histoire en répondant à la dernière action.";

    const bodyRequete = {
        systemInstruction: { parts: [{ text: promptSysteme }] },
        contents: [{ role: "user", parts: [{ text: historiqueComplet }] }],
        generationConfig: { temperature: temperatureIA }, // NOUVEAU : Injection de la température
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    // BOUCLE DE TENTATIVES AUTOMATIQUES
    for (let tentative = 1; tentative <= maxTentatives; tentative++) {
        try {
            console.log(`✍️ [Narrateur] Génération en cours... (Tentative ${tentative}/${maxTentatives})`);
            
            // CORRECTION ICI : Utilisation propre et unique de gemini-flash-lite-latest
            const reponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGemini}`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyRequete)
            });

            const data = await reponse.json();

            if (!reponse.ok || data.error) {
                throw new Error(data.error?.message || `Erreur serveur API: ${reponse.status}`);
            }

            // NOUVEAU : On récupère les tokens de cette requête et on les ajoute au compteur
            const tokensUtilises = data.usageMetadata?.totalTokenCount || 0;
            if (typeof window.ajouterTokens === "function") {
                window.ajouterTokens(tokensUtilises);
            }

            // Si tout marche bien, on renvoie le texte et on casse la boucle
            return data.candidates[0].content.parts[0].text;

        } catch (erreur) {
            console.warn(`⚠️ [Narrateur] Échec de la tentative ${tentative} :`, erreur.message);
            
            if (tentative < maxTentatives) {
                console.log("⏳ Relance automatique dans 4 secondes...");
                // Pause invisible de 4000 millisecondes
                await new Promise(resolve => setTimeout(resolve, 4000));
            } else {
                console.error("❌ [Narrateur] Échec définitif après plusieurs essais.");
                return `*Le grimoire refuse de s'ouvrir... Les énergies arcaniques sont instables (${erreur.message}).*`;
            }
        }
    }
}

// --- 4. LA BOUCLE GLOBALE (Bouton MJ) ---

window.declencherTourIA = async function() {
    console.log("🟢 Le bouton MJ a bien été détecté !");
    
    if (!window.ID_PARTIE_COURANTE) {
        console.error("🔴 Erreur : L'ID de la partie est introuvable.");
        return;
    }

    afficherEcranAttente();

    try {
        // A. Infos de base
        const snapPartie = await getDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE));
        const lieuActuel = snapPartie.exists() ? snapPartie.data().Lieu_Actuel : null;

        // B. Récupération des historiques
        const qMsgAll = query(collection(db, "Messages_Chat"), where("ID_Partie", "==", window.ID_PARTIE_COURANTE), orderBy("Timestamp", "asc"));
        const snapMsgAll = await getDocs(qMsgAll);
        let messages = [];
        snapMsgAll.forEach(d => messages.push(d.data()));
        if (messages.length === 0) return;

        const historiqueComplet = messages.map(m => `${m.Auteur_Nom} : ${m.Texte}`).join("\n");
        const historique4 = messages.slice(-4).map(m => `${m.Auteur_Nom} : ${m.Texte}`).join("\n");

        // C. Scan de la zone (Backend)
        const env = await preparerEnvironnement(lieuActuel);
        const nomsPnjPresents = Object.keys(env.pnjsPresents);

        // D. Filtre de Mia (Seulement s'il y a des PNJ dans la zone)
        let pnjCibles = [];
        if (nomsPnjPresents.length > 0) {
            pnjCibles = await filtrerPNJAvecMia(historique4, nomsPnjPresents);
            console.log(`[Mia] 🎯 A ciblé les PNJ suivants :`, pnjCibles);
        } else {
            console.log(`[Mia] 💤 Aucun PNJ dans la zone, Mia se repose.`);
        }

        // E. Formatage du Contexte pour le Narrateur
        let contexte = `--- CONTEXTE DE LA ZONE ACTUELLE ---\n`;
        contexte += `Type : ${env.type}\n`;
        contexte += `Description de la zone : ${JSON.stringify(env.details)}\n`;
        
        if (env.type === "Lieu" && env.listeBatiments.length > 0) {
            contexte += `Bâtiments visibles ici : ${env.listeBatiments.join(", ")}\n`;
        }

        // NOUVEAU : Liste de présence globale (Nom + Occupation + Physique) envoyée dans tous les cas
        if (nomsPnjPresents.length > 0) {
            contexte += `\n--- PNJ PRÉSENTS DANS LA ZONE ---\n`;
            nomsPnjPresents.forEach(nom => {
                const pnj = env.pnjsPresents[nom];
                
                // Récupération des champs (avec une valeur par défaut si tu oublies de les remplir en BDD)
                const occupation = pnj.Occupation || "Occupation inconnue"; 
                const physique = pnj.Description_Physique || "Apparence inconnue";
                
                contexte += `- ${nom} (${occupation}) - Apparence : ${physique}\n`;
            });
        }

        // Les fiches complètes uniquement pour les PNJ ciblés par Mia
        if (pnjCibles.length > 0) {
            contexte += `\n--- FICHES DÉTAILLÉES DES PNJ SOLLICITÉS ---\n`;
            pnjCibles.forEach(nom => {
                if (env.pnjsPresents[nom]) {
                    contexte += `Fiche complète de ${nom} : ${JSON.stringify(env.pnjsPresents[nom])}\n`;
                }
            });
        }

        // F. Génération et Envoi
        const reponseTexte = await genererReponseNarrateur(contexte, historiqueComplet);

        if (reponseTexte) {
            await addDoc(collection(db, "Messages_Chat"), {
                ID_Partie: window.ID_PARTIE_COURANTE,
                Auteur_ID: "MJ", Auteur_Nom: "MJ", Auteur_Couleur: "#ffffff",
                Texte: reponseTexte,
                Timestamp: new Date().getTime()
            });
            await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), { Index_Initiative: 0 });
        }
    } catch (erreurFatale) {
        console.error("❌ [Tour IA] Erreur fatale :", erreurFatale);
    } finally {
        masquerEcranAttente();
    }
};