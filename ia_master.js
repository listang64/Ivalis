// =========================================================================
//  IVALIS - MOTEUR IA (Pré-chargement Backend + Mia + Narrateur + Batiment + PNJ)
// =========================================================================

import { db } from "./firebase-config.js";
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc, setDoc, addDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// --- 1. LE BACKEND (Le radar qui scanne la zone avant l'IA) ---

async function preparerEnvironnement(lieuActuelId) {
    console.log(`[Backend] 📡 Scan de la zone en cours pour l'ID : ${lieuActuelId}`);
    
    let env = {
        type: "Inconnu",
        details: null,
        listeBatiments: [], 
        pnjsPresents: {},
        reputationScore: 0,
        reputationTags: []
    };

    if (!lieuActuelId) return env;

    let idLieuParent = lieuActuelId;

    if (lieuActuelId.startsWith("L")) {
        env.type = "Lieu";
        const snapLieu = await getDoc(doc(db, "Monde_Lieux", lieuActuelId));
        if (snapLieu.exists()) {
            env.details = snapLieu.data();
            env.reputationScore = env.details.Reputation_Score || 0;
            env.reputationTags = env.details.Reputation_Tags || [];
        }

        const qBat = query(collection(db, "Monde_Batiment"), where("ID_Lieu", "==", lieuActuelId));
        const snapBat = await getDocs(qBat);
        snapBat.forEach(doc => { env.listeBatiments.push(doc.data().Nom_Batiment); });

        const qPnj = query(collection(db, "Monde_PNJ"), where("ID_Lieu", "==", lieuActuelId));
        const snapPnj = await getDocs(qPnj);
        snapPnj.forEach(doc => { env.pnjsPresents[doc.data().Nom_PNJ] = doc.data(); });
    }
    else if (lieuActuelId.startsWith("B")) {
        env.type = "Bâtiment";
        const snapBat = await getDoc(doc(db, "Monde_Batiment", lieuActuelId));
        if (snapBat.exists()) {
            env.details = snapBat.data();
            idLieuParent = env.details.ID_Lieu; // On récupère l'ID du lieu parent
        }

        // 🔍 On récupère la réputation sur le Lieu Global
        if (idLieuParent) {
            const snapLieu = await getDoc(doc(db, "Monde_Lieux", idLieuParent));
            if (snapLieu.exists()) {
                env.reputationScore = snapLieu.data().Reputation_Score || 0;
                env.reputationTags = snapLieu.data().Reputation_Tags || [];
            }
        }

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

    const promptSysteme = `Tu es Mia, l'IA d'analyse.
Voici les PNJ présents dans la zone : ${listeNomsPNJ.join(", ")}.
Lis les 4 derniers messages. Identifie si les joueurs s'adressent ou interagissent avec un PNJ de cette liste.
Si oui, utilise l'outil 'selectionnerPNJ'. Sinon, ne fais rien.`;

    const outils = [{
        functionDeclarations: [{
            name: "selectionnerPNJ",
            description: "Sélectionne les PNJ sollicités.",
            parameters: { type: "OBJECT", properties: { noms: { type: "ARRAY", items: { type: "STRING" } } }, required: ["noms"] }
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
        if (appelsOutils.length > 0 && appelsOutils[0].name === "selectionnerPNJ") return appelsOutils[0].args.noms;
        return [];
    } catch (e) { return []; }
}

// =========================================================================
//  OUTILS D'IMAGE (Utilisés par Bâtiments et PNJ)
// =========================================================================

async function genererSignatureCloudinary(message) {
    const data = new TextEncoder().encode(message);
    const buffer = await crypto.subtle.digest("SHA-1", data);
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// =========================================================================
//  MIA_BATIMENT (Générateur de lieux procédural)
// =========================================================================

async function genererEtStockerImageBatiment(promptBatiment) {
    const cles = {
        openai: localStorage.getItem("ivalis_OPENAI_API_KEY")?.trim(),
        cloudName: localStorage.getItem("ivalis_CLOUDINARY_CLOUD_NAME")?.trim(),
        cloudKey: localStorage.getItem("ivalis_CLOUDINARY_API_KEY")?.trim(),
        cloudSecret: localStorage.getItem("ivalis_CLOUDINARY_API_SECRET")?.trim()
    };
    if (!cles.openai || !cles.cloudName || !cles.cloudKey || !cles.cloudSecret) return "";

    console.log("🎨 [MIA_Batiment] Démarrage de la toile pour le bâtiment...");
    
    const promptOpenAI = "Crée un digital painting croquis d'un lieu ou bâtiment de jeu de rôle dark fantasy. L'esthétique globale doit être avec un éclairage dramatique, des coups de pinceau gestuels et des textures très tactiles, comme un concept art préparatoire de jeu vidéo. Ne dessine absolument aucun texte ou lettrage.\n\nDescription du lieu : " + promptBatiment;

    const payloadOpenAI = { model: "gpt-image-2", prompt: promptOpenAI, output_format: "webp", n: 1, size: "1792x1024", quality: "low" };

    let tentative = 0, succes = false, texteReponseOpenAI = "";
    const delais = [5000, 15000, 30000];

    while (tentative < 3 && !succes) {
        try {
            const res = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cles.openai }, body: JSON.stringify(payloadOpenAI)
            });
            texteReponseOpenAI = await res.text();
        } catch (e) { texteReponseOpenAI = "error code: 1015"; }

        if (texteReponseOpenAI.includes("error code: 1015") || texteReponseOpenAI.includes("Rate Limited")) {
            await new Promise(r => setTimeout(r, delais[tentative])); tentative++;
        } else { succes = true; }
    }

    let jsonOpenAI;
    try { jsonOpenAI = JSON.parse(texteReponseOpenAI); } catch (e) { return ""; }
    if (!jsonOpenAI.data || jsonOpenAI.data.length === 0) return "";

    let imageSource = jsonOpenAI.data[0].url || ("data:image/png;base64," + jsonOpenAI.data[0].b64_json);

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const dossier = "Batiments";
    const signature = await genererSignatureCloudinary(`folder=${dossier}&timestamp=${timestamp}${cles.cloudSecret}`);

    const formCloudinary = new FormData();
    formCloudinary.append("file", imageSource); formCloudinary.append("api_key", cles.cloudKey);
    formCloudinary.append("timestamp", timestamp); formCloudinary.append("signature", signature);
    formCloudinary.append("folder", dossier);

    try {
        const resCloud = await fetch(`https://api.cloudinary.com/v1_1/${cles.cloudName}/image/upload`, { method: "POST", body: formCloudinary });
        const jsonCloud = await resCloud.json();
        if (jsonCloud.secure_url) {
            console.log("✅ [MIA_Batiment] Concept Art généré avec succès !");
            return jsonCloud.secure_url.replace("/upload/", "/upload/q_auto,f_auto/");
        }
    } catch (e) { return ""; }
    return "";
}

async function analyserDeplacementBatiment(idPartie, idLieuActuel, texteMJ) {
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cleGemini || !idLieuActuel) return idLieuActuel;

    let idLieuParent = idLieuActuel;
    let estDansBatiment = false;

    if (idLieuActuel.startsWith("B")) {
        const bSnap = await getDoc(doc(db, "Monde_Batiment", idLieuActuel));
        if (bSnap.exists()) { idLieuParent = bSnap.data().ID_Lieu; estDansBatiment = true; }
    }
    if (!idLieuParent || !idLieuParent.startsWith("L")) return idLieuActuel;

    const qBat = query(collection(db, "Monde_Batiment"), where("ID_Lieu", "==", idLieuParent));
    const bDocs = await getDocs(qBat);
    const batimentsExistants = [];
    bDocs.forEach(d => batimentsExistants.push({ id: d.id, nom: d.data().Nom_Batiment }));

    const promptSysteme = `Tu es MIA_Batiment, l'IA architecte. 
Bâtiments connus ici : ${JSON.stringify(batimentsExistants)}.
État actuel : ${estDansBatiment ? "À L'INTÉRIEUR d'un bâtiment." : "À L'EXTÉRIEUR (Rue, forêt, etc.)."}

Analyse la dernière réponse du Narrateur.
1. Les joueurs viennent-ils d'entrer dans un bâtiment/lieu existant de la liste ? -> "existant" + ID.
2. Les joueurs viennent-ils de pénétrer dans un bâtiment/point d'intérêt INCONNU ? -> "nouveau" + invente les détails.
3. Les joueurs viennent-ils de SORTIR d'un bâtiment pour retourner à l'extérieur ? -> "sortie".
4. Sinon (pas de mouvement notable) -> "aucun".`;

    const outils = [{
        functionDeclarations: [{
            name: "gererDecor",
            description: "Définit le mouvement des joueurs.",
            parameters: {
                type: "OBJECT",
                properties: {
                    action: { type: "STRING", description: "Choisis: 'aucun', 'existant', 'nouveau', 'sortie'" },
                    id_existant: { type: "STRING", description: "ID existant (si 'existant')" },
                    nouveau_nom: { type: "STRING", description: "Nom du lieu (si 'nouveau')" },
                    nouvelle_description: { type: "STRING", description: "Description de l'intérieur (si 'nouveau')" },
                    nouveaux_stigmates: { type: "STRING", description: "Atmosphère courte (si 'nouveau')" },
                    prompt_image: { type: "STRING", description: "Prompt visuel en anglais (si 'nouveau')" }
                }, required: ["action"]
            }
        }]
    }];

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGemini}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: promptSysteme }] },
                contents: [{ role: "user", parts: [{ text: texteMJ }] }],
                tools: outils, toolConfig: { functionCallingConfig: { mode: "ANY" } }
            })
        });

        const data = await res.json();
        const args = data.candidates?.[0]?.content?.parts?.[0]?.functionCall?.args;
        if (!args) return idLieuActuel;

        if (args.action === "existant" && args.id_existant && args.id_existant !== idLieuActuel) {
            console.log(`[MIA_Batiment] 🚪 Entrée dans bâtiment existant : ${args.id_existant}`);
            await updateDoc(doc(db, "Systeme_Parties", idPartie), { Lieu_Actuel: args.id_existant });
            return args.id_existant;
            
        } else if (args.action === "sortie" && estDansBatiment) {
            console.log(`[MIA_Batiment] 🌲 Sortie à l'extérieur : retour à ${idLieuParent}`);
            await updateDoc(doc(db, "Systeme_Parties", idPartie), { Lieu_Actuel: idLieuParent });
            return idLieuParent;
            
        } else if (args.action === "nouveau" && args.nouveau_nom) {
            console.log(`[MIA_Batiment] 🏗️ Création nouveau bâtiment : ${args.nouveau_nom}`);
            const nouvelID = "B-" + Math.floor(Math.random() * 1000000);
            
            await updateDoc(doc(db, "Systeme_Parties", idPartie), { Lieu_Actuel: nouvelID });
            await setDoc(doc(db, "Monde_Batiment", nouvelID), {
                ID_Batiment: nouvelID, ID_Lieu: idLieuParent, Nom_Batiment: args.nouveau_nom,
                Description_Details: args.nouvelle_description || "", Stigmates: args.nouveaux_stigmates || "", URL_Cloudinary: ""
            });

            genererEtStockerImageBatiment(args.prompt_image || args.nouveau_nom).then(async (url) => {
                if (url) {
                    await updateDoc(doc(db, "Monde_Batiment", nouvelID), { URL_Cloudinary: url });
                    if (typeof window.mettreAJourBulleLieu === "function") window.mettreAJourBulleLieu(nouvelID);
                }
            });
            return nouvelID;
        }
    } catch (e) { console.error("[MIA_Batiment] Erreur :", e); }
    return idLieuActuel;
}

// =========================================================================
//  NOUVEAU : MIA_PNJ (Création procédurale de PNJ nommés)
// =========================================================================

async function genererEtStockerImagePNJ(descriptionPhysique) {
    const cles = {
        openai: localStorage.getItem("ivalis_OPENAI_API_KEY")?.trim(),
        cloudName: localStorage.getItem("ivalis_CLOUDINARY_CLOUD_NAME")?.trim(),
        cloudKey: localStorage.getItem("ivalis_CLOUDINARY_API_KEY")?.trim(),
        cloudSecret: localStorage.getItem("ivalis_CLOUDINARY_API_SECRET")?.trim()
    };
    if (!cles.openai || !cles.cloudName || !cles.cloudKey || !cles.cloudSecret) return "";

    console.log("🎨 [MIA_PNJ] Incantation du portrait pour le nouveau PNJ...");
    
    // FORMAT VERTICAL POUR LES PORTRAITS
    const promptOpenAI = "Crée un digital painting croquis pour un portrait de personnage de jeu de rôle heroic fantasy. L'esthétique globale doit être avec un éclairage dramatique mais lumineux, des coups de pinceau gestuels et des textures très tactiles sur les matériaux, comme un dessin préparatoire. Ne dessine absolument aucun texte ou lettrage sur l'image.\n\nDescription du personnage : " + descriptionPhysique;

    const payloadOpenAI = { model: "gpt-image-2", prompt: promptOpenAI, output_format: "webp", n: 1, size: "1024x1792", quality: "low" };

    let tentative = 0, succes = false, texteReponseOpenAI = "";
    const delais = [5000, 15000, 30000];

    while (tentative < 3 && !succes) {
        try {
            const res = await fetch("https://api.openai.com/v1/images/generations", {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cles.openai }, body: JSON.stringify(payloadOpenAI)
            });
            texteReponseOpenAI = await res.text();
        } catch (e) { texteReponseOpenAI = "error code: 1015"; }
        if (texteReponseOpenAI.includes("error code: 1015") || texteReponseOpenAI.includes("Rate Limited")) {
            await new Promise(r => setTimeout(r, delais[tentative])); tentative++;
        } else { succes = true; }
    }

    let jsonOpenAI;
    try { jsonOpenAI = JSON.parse(texteReponseOpenAI); } catch (e) { return ""; }
    if (!jsonOpenAI.data || jsonOpenAI.data.length === 0) return "";

    let imageSource = jsonOpenAI.data[0].url || ("data:image/png;base64," + jsonOpenAI.data[0].b64_json);

    // Envoi sur Cloudinary dans le dossier "PNJ"
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const dossier = "PNJ";
    const signature = await genererSignatureCloudinary(`folder=${dossier}&timestamp=${timestamp}${cles.cloudSecret}`);

    const formCloudinary = new FormData();
    formCloudinary.append("file", imageSource); formCloudinary.append("api_key", cles.cloudKey);
    formCloudinary.append("timestamp", timestamp); formCloudinary.append("signature", signature);
    formCloudinary.append("folder", dossier);

    try {
        const resCloud = await fetch(`https://api.cloudinary.com/v1_1/${cles.cloudName}/image/upload`, { method: "POST", body: formCloudinary });
        const jsonCloud = await resCloud.json();
        if (jsonCloud.secure_url) {
            console.log("✅ [MIA_PNJ] Portrait généré avec succès !");
            return jsonCloud.secure_url.replace("/upload/", "/upload/q_auto,f_auto/");
        }
    } catch (e) { return ""; }
    return "";
}

async function analyserNouveauxPNJ(idLieuActuel, nomsPnjExistants, nomsHeros, texteMJ) {
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cleGemini || !idLieuActuel) return;

    const promptSysteme = `Tu es MIA_PNJ, l'IA de casting.
Voici les PNJ que nous connaissons DÉJÀ ici : ${JSON.stringify(nomsPnjExistants)}.
Voici les HÉROS (Personnages des joueurs) de l'histoire : ${JSON.stringify(nomsHeros)}.

Ta mission : Y a-t-il de NOUVEAUX personnages expressément NOMMÉS (qui possèdent un VRAI prénom propre, comme 'Gédéon', 'Rose', 'Thorne') qui viennent d'apparaître, qui ne sont pas dans la liste des connus, ET QUI NE SONT PAS DES HÉROS ?
Si oui, utilise l'outil 'creerNouveauxPNJ' pour générer leurs fiches.

RÈGLES STRICTES ET ABSOLUES :
1. IGNORE TOUS LES PERSONNAGES désignés par un titre, une profession, une description ou un surnom générique (ex: "un garde", "le tavernier", "le colosse", "le vieux", "l'homme").
2. S'il n'a pas de VRAI PRÉNOM avec une majuscule explicite, TU NE CRÉES RIEN.
3. NE CRÉE ABSOLUMENT JAMAIS de fiche pour les Héros de la partie.`;

    const outils = [{
        functionDeclarations: [{
            name: "creerNouveauxPNJ",
            description: "Créer les fiches des NOUVEAUX PNJ nommés dans la narration.",
            parameters: {
                type: "OBJECT",
                properties: {
                    pnjs: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                nom: { type: "STRING", description: "Le nom exact utilisé par le MJ" },
                                physique: { type: "STRING", description: "Description physique pour générer le portrait" },
                                occupation: { type: "STRING", description: "Son métier ou occupation" },
                                race: { type: "STRING", description: "Sa race (Humain, Nain, etc.)" },
                                secret: { type: "STRING", description: "Un secret inavouable ou motivation cachée" },
                                style_parole: { type: "STRING", description: "Son accent ou sa manière de parler" }
                            },
                            required: ["nom", "physique", "occupation", "race", "secret", "style_parole"]
                        }
                    }
                },
                required: ["pnjs"]
            }
        }]
    }];

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGemini}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: promptSysteme }] },
                contents: [{ role: "user", parts: [{ text: texteMJ }] }],
                tools: outils, 
                toolConfig: { functionCallingConfig: { mode: "AUTO" } }
            })
        });

        const data = await res.json();
        const appelsOutils = data.candidates?.[0]?.content?.parts?.filter(p => p.functionCall).map(p => p.functionCall);
        
        if (appelsOutils && appelsOutils.length > 0 && appelsOutils[0].name === "creerNouveauxPNJ") {
            const nouveauxPNJs = appelsOutils[0].args.pnjs || [];
            
            for (const pnj of nouveauxPNJs) {
                // Sécurité Ultime : on vérifie en Javascript si l'IA n'a pas quand même essayé de créer un Héros
                if (nomsHeros.includes(pnj.nom)) {
                    console.log(`[MIA_PNJ] 🛡️ Rejet : Tentative de création du héros ${pnj.nom} bloquée.`);
                    continue; 
                }

                console.log(`[MIA_PNJ] 👤 Création d'un nouveau PNJ en base : ${pnj.nom}`);
                
                const numAleatoire = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
                const nomFormate = pnj.nom.replace(/[^a-zA-Z0-9]/g, "_");
                const docId = `PNJ_${numAleatoire}_${nomFormate}`;

                let idLieuGlobal = "";
                let idBatimentGlobal = "";
                if (idLieuActuel.startsWith("L")) idLieuGlobal = idLieuActuel;
                else if (idLieuActuel.startsWith("B")) idBatimentGlobal = idLieuActuel;

                await updateDoc(doc(db, "Monde_PNJ", docId), {
                    Description_Physique: pnj.physique,
                    ID_Batiment: idBatimentGlobal,
                    ID_Lieu: idLieuGlobal,
                    Nom_PNJ: pnj.nom,
                    Occupation: pnj.occupation,
                    Race: pnj.race,
                    Secret_Mental: pnj.secret,
                    Statut: "Vivant",
                    Style_De_Parole: pnj.style_parole,
                    URL_Cloudinary: ""
                }).catch(async (e) => {
                     await setDoc(doc(db, "Monde_PNJ", docId), {
                        Description_Physique: pnj.physique,
                        ID_Batiment: idBatimentGlobal,
                        ID_Lieu: idLieuGlobal,
                        Nom_PNJ: pnj.nom,
                        Occupation: pnj.occupation,
                        Race: pnj.race,
                        Secret_Mental: pnj.secret,
                        Statut: "Vivant",
                        Style_De_Parole: pnj.style_parole,
                        URL_Cloudinary: ""
                    });
                });

                genererEtStockerImagePNJ(pnj.physique).then(async (urlImage) => {
                    if (urlImage) {
                        await updateDoc(doc(db, "Monde_PNJ", docId), { URL_Cloudinary: urlImage });
                    }
                });
            }
        }
    } catch (e) { console.error("[MIA_PNJ] Erreur silencieuse :", e); }
}

// =========================================================================
//  NOUVEAU : MIA_DEPLACEMENT_PNJ (Suivi de la position des PNJ)
// =========================================================================

async function analyserDeplacementPNJ(idLieuActuel, nomsHeros, texteMJ) {
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cleGemini || !idLieuActuel) return;

    const promptSysteme = `Tu es MIA_DEPLACEMENT, l'IA logistique.
Voici les HÉROS (Personnages des joueurs) de la partie : ${JSON.stringify(nomsHeros)}.

Ta mission : Lis la dernière narration du Maître du Jeu. Identifie TOUS les personnages (PNJ) qui se trouvent physiquement dans la MÊME ZONE que les héros à la fin du texte.
- Si un héros sort d'une auberge et qu'un PNJ le suit à l'extérieur, ce PNJ is avec eux.
- Si un PNJ vient d'arriver dans la pièce, il est avec eux.
- Si un PNJ est resté à l'intérieur pendant que les héros sortent, IL N'EST PLUS avec eux.

Utilise l'outil 'deplacerPNJ' pour lister les noms exacts de ces PNJ présents.
Règle 1 : NE LISTE JAMAIS LES HÉROS.
Règle 2 : Ne liste que les vrais noms propres (ignore "le garde", "le tavernier").`;

    const outils = [{
        functionDeclarations: [{
            name: "deplacerPNJ",
            description: "Liste les PNJ présents dans la même zone que les joueurs.",
            parameters: {
                type: "OBJECT",
                properties: {
                    noms_presents: { 
                        type: "ARRAY", 
                        items: { type: "STRING" },
                        description: "Liste des noms exacts des PNJ présents avec les joueurs."
                    }
                },
                required: ["noms_presents"]
            }
        }]
    }];

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGemini}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: promptSysteme }] },
                contents: [{ role: "user", parts: [{ text: texteMJ }] }],
                tools: outils, 
                toolConfig: { functionCallingConfig: { mode: "AUTO" } }
            })
        });

        const data = await res.json();
        const appelsOutils = data.candidates?.[0]?.content?.parts?.filter(p => p.functionCall).map(p => p.functionCall);
        
        if (appelsOutils && appelsOutils.length > 0 && appelsOutils[0].name === "deplacerPNJ") {
            const pnjPresents = appelsOutils[0].args.noms_presents || [];
            if (pnjPresents.length === 0) return;

            // 1. Déterminer les ID de la zone où se trouvent les joueurs
            let idLieuCible = "";
            let idBatimentCible = "";

            if (idLieuActuel.startsWith("L")) {
                idLieuCible = idLieuActuel;
            } else if (idLieuActuel.startsWith("B")) {
                idBatimentCible = idLieuActuel;
                // Trouver le lieu parent du bâtiment pour le PNJ
                const bSnap = await getDoc(doc(db, "Monde_Batiment", idLieuActuel));
                if (bSnap.exists()) idLieuCible = bSnap.data().ID_Lieu;
            }

            // 2. Mettre à jour chaque PNJ
            for (const nom of pnjPresents) {
                if (nomsHeros.includes(nom)) continue; // Sécurité anti-héros

                // Chercher le PNJ par son nom dans la BDD
                const qPnj = query(collection(db, "Monde_PNJ"), where("Nom_PNJ", "==", nom));
                const snapPnj = await getDocs(qPnj);

                snapPnj.forEach(async (docPnj) => {
                    const dataPnj = docPnj.data();
                    
                    // Si sa position est déjà la bonne, on ne fait rien pour économiser Firebase
                    if (dataPnj.ID_Lieu === idLieuCible && dataPnj.ID_Batiment === idBatimentCible) return;

                    console.log(`[MIA_DEPLACEMENT] 🚶 Le PNJ ${nom} suit les joueurs -> Lieu: ${idLieuCible}, Bat: ${idBatimentCible}`);
                    await updateDoc(doc(db, "Monde_PNJ", docPnj.id), {
                        ID_Lieu: idLieuCible,
                        ID_Batiment: idBatimentCible
                    });
                });
            }
        }
    } catch (e) { console.error("[MIA_DEPLACEMENT] Erreur silencieuse :", e); }
}

// =========================================================================
//  NOUVEAU : MIA_STIGMATE (Persistance de l'environnement)
// =========================================================================

async function analyserStigmates(idLieuActuel, texteMJ) {
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cleGemini || !idLieuActuel) return;

    let collectionCible = "";
    let stigmatesActuels = "";

    // 1. Identifier la cible et récupérer les stigmates actuels
    if (idLieuActuel.startsWith("L")) {
        collectionCible = "Monde_Lieux";
    } else if (idLieuActuel.startsWith("B")) {
        collectionCible = "Monde_Batiment";
    } else {
        return; // ID non reconnu
    }

    try {
        const snapDecor = await getDoc(doc(db, collectionCible, idLieuActuel));
        if (snapDecor.exists()) {
            stigmatesActuels = snapDecor.data().Stigmates || "Aucun stigmate.";
        }

        // 2. Le prompt de l'architecte
        const promptSysteme = `Tu es MIA_STIGMATE, l'IA en charge de la mémoire de l'environnement.
Voici l'état ACTUEL des stigmates de cet endroit : "${stigmatesActuels}"

Ta mission : Lis le dernier texte du Maître du Jeu. Y a-t-il eu des altérations DURABLES apportées au décor (destruction, construction, incendie, statue érigée, réparation d'un ancien stigmate, etc.) ?
Attention : Ignore les choses éphémères (un verre renversé, des traces de pas, un cadavre qui sera enlevé). Ne retiens que ce qui marque les murs ou l'endroit dans le temps.

Si l'environnement a subi un changement durable, utilise l'outil 'mettreAJourStigmates' pour réécrire la description.
Règle Absolue : Tu dois LISSER la description (intégrer les nouveaux éléments, garder les anciens toujours valables, et enlever ceux qui auraient été réparés par l'action du MJ). Rédige une phrase ou un paragraphe propre et naturel.
Si rien n'a changé de manière durable, ne fais rien.`;

        const outils = [{
            functionDeclarations: [{
                name: "mettreAJourStigmates",
                description: "Met à jour la description lissée des stigmates du lieu.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        nouveaux_stigmates: { 
                            type: "STRING", 
                            description: "La nouvelle description complète, propre et lissée des stigmates de l'endroit."
                        }
                    },
                    required: ["nouveaux_stigmates"]
                }
            }]
        }];

        // 3. Interrogation de Gemini Flash-Lite
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGemini}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: promptSysteme }] },
                contents: [{ role: "user", parts: [{ text: texteMJ }] }],
                tools: outils, 
                toolConfig: { functionCallingConfig: { mode: "AUTO" } }
            })
        });

        const data = await res.json();
        const appelsOutils = data.candidates?.[0]?.content?.parts?.filter(p => p.functionCall).map(p => p.functionCall);
        
        // 4. Inscription dans la Base de Données
        if (appelsOutils && appelsOutils.length > 0 && appelsOutils[0].name === "mettreAJourStigmates") {
            const stigmatesLisses = appelsOutils[0].args.nouveaux_stigmates || "";
            
            // On ne met à jour que si l'IA a vraiment changé quelque chose
            if (stigmatesLisses && stigmatesLisses !== stigmatesActuels) {
                console.log(`[MIA_STIGMATE] 🏚️ Décor altéré ! Nouveaux stigmates : ${stigmatesLisses}`);
                await updateDoc(doc(db, collectionCible, idLieuActuel), {
                    Stigmates: stigmatesLisses
                });
            }
        }
    } catch (e) {
        console.error("[MIA_STIGMATE] Erreur silencieuse :", e);
    }
}

// =========================================================================
//  NOUVEAU : MIA_REPUTATION (Analyse des actes et rumeurs)
// =========================================================================

async function analyserReputation(idLieuActuel, texteMJ) {
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cleGemini || !idLieuActuel) return;

    // La réputation est toujours gérée au niveau du Lieu (Région), même si on est dans une auberge
    let idLieuCible = idLieuActuel;
    if (idLieuActuel.startsWith("B")) {
        const bSnap = await getDoc(doc(db, "Monde_Batiment", idLieuActuel));
        if (bSnap.exists()) idLieuCible = bSnap.data().ID_Lieu;
    }
    
    if (!idLieuCible || !idLieuCible.startsWith("L")) return;

    try {
        const snapLieu = await getDoc(doc(db, "Monde_Lieux", idLieuCible));
        if (!snapLieu.exists()) return;
        
        const scoreActuel = snapLieu.data().Reputation_Score || 0;
        const tagsActuels = snapLieu.data().Reputation_Tags || [];

        const promptSysteme = `Tu es MIA_REPUTATION, l'IA qui gère la renommée du groupe.
Score actuel du groupe : ${scoreActuel} (sur une jauge de -10 à +10).
Tags de rumeur actuels : ${JSON.stringify(tagsActuels)}.

Lis la dernière scène racontée par le Narrateur. Y a-t-il eu une action NOTABLE du groupe (ex: sauver quelqu'un, voler, tuer, payer généreusement, saccager, aider la milice) qui mérite de changer leur réputation dans toute cette région ?

Si oui :
1. Ajuste le score de réputation (ne dépasse pas -10 ou +10).
2. Ajoute de nouveaux mots-clés pertinents (ex: "Héroïques", "Voleurs", "Généreux", "Meurtriers").
3. SUPPRIME obligatoirement les anciens tags qui sont contredits par la nouvelle action (ex: si "Honnêtes" était présent, mais qu'ils viennent de voler, supprime "Honnêtes" et ajoute "Voleurs").

Si l'action est banale ou privée sans témoin, utilise l'outil avec les valeurs actuelles pour ne rien changer.`;

        const outils = [{
            functionDeclarations: [{
                name: "mettreAJourReputation",
                description: "Modifie la jauge et les tags comportementaux du groupe.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        nouveau_score: { type: "INTEGER", description: "Le nouveau score de -10 à +10" },
                        nouveaux_tags: { type: "ARRAY", items: { type: "STRING" }, description: "Liste à jour des mots-clés" }
                    },
                    required: ["nouveau_score", "nouveaux_tags"]
                }
            }]
        }];

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGemini}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: promptSysteme }] },
                contents: [{ role: "user", parts: [{ text: texteMJ }] }],
                tools: outils, 
                toolConfig: { functionCallingConfig: { mode: "AUTO" } }
            })
        });

        const data = await res.json();
        const appelsOutils = data.candidates?.[0]?.content?.parts?.filter(p => p.functionCall).map(p => p.functionCall);
        
        if (appelsOutils && appelsOutils.length > 0 && appelsOutils[0].name === "mettreAJourReputation") {
            const nouveauScore = appelsOutils[0].args.nouveau_score;
            const nouveauxTags = appelsOutils[0].args.nouveaux_tags || [];
            
            // On ne met à jour que si les valeurs ont réellement changé
            if (nouveauScore !== scoreActuel || JSON.stringify(nouveauxTags) !== JSON.stringify(tagsActuels)) {
                console.log(`[MIA_REPUTATION] 📢 Réputation mise à jour ! Score: ${nouveauScore}, Tags: ${nouveauxTags}`);
                await updateDoc(doc(db, "Monde_Lieux", idLieuCible), {
                    Reputation_Score: nouveauScore,
                    Reputation_Tags: nouveauxTags
                });
            }
        }
    } catch (e) { console.error("[MIA_REPUTATION] Erreur :", e); }
}

// =========================================================================
//  INTERFACE & CERVEAU DU NARRATEUR
// =========================================================================

function afficherEcranAttente() {
    if (document.getElementById("ecran-attente-ia")) return;
    const overlay = document.createElement("div");
    overlay.id = "ecran-attente-ia";
    overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.85); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 9999; backdrop-filter: blur(5px);`;
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

async function genererReponseNarrateur(contexteFormate, historiqueComplet, maxTentatives = 3) {
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cleGemini) return null;

    const temperatureIA = parseFloat(localStorage.getItem("ivalis_IA_TEMPERATURE")) || 1.0;

    let instructionMJ = "Tu es le Maître du Jeu.";
    const snapInst = await getDoc(doc(db, "Cerveau_IA", "INST_10895"));
    if (snapInst.exists() && snapInst.data().Contenu_Direct) instructionMJ = snapInst.data().Contenu_Direct;

    const promptSysteme = instructionMJ + "\n\n" + contexteFormate + "\n\nContinue l'histoire en répondant à la dernière action.";
    const bodyRequete = {
        systemInstruction: { parts: [{ text: promptSysteme }] },
        contents: [{ role: "user", parts: [{ text: historiqueComplet }] }],
        generationConfig: { temperature: temperatureIA },
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    for (let tentative = 1; tentative <= maxTentatives; tentative++) {
        try {
            console.log(`✍️ [Narrateur] Génération en cours... (Tentative ${tentative}/${maxTentatives})`);
            
            const reponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGemini}`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyRequete)
            });
            const data = await reponse.json();
            if (!reponse.ok || data.error) throw new Error(data.error?.message || `Erreur: ${reponse.status}`);

            const tokensUtilises = data.usageMetadata?.totalTokenCount || 0;
            if (typeof window.ajouterTokens === "function") window.ajouterTokens(tokensUtilises);

            return data.candidates[0].content.parts[0].text;
        } catch (erreur) {
            console.warn(`⚠️ [Narrateur] Échec tentative ${tentative} :`, erreur.message);
            if (tentative < maxTentatives) await new Promise(resolve => setTimeout(resolve, 4000));
            else return `*Le grimoire refuse de s'ouvrir... (${erreur.message}).*`;
        }
    }
}

// --- 4. LA BOUCLE GLOBALE (Bouton MJ) ---

window.declencherTourIA = async function() {
    console.log("🟢 Le bouton MJ a bien été détecté !");
    if (!window.ID_PARTIE_COURANTE) return;

    // =========================================================================
    // NOUVEAU : Reset du compteur de tokens à chaque clic !
    // =========================================================================
    localStorage.setItem("ivalis_TOTAL_TOKENS", "0");
    if (typeof window.actualiserAffichageTokens === "function") {
        window.actualiserAffichageTokens();
    }
    // =========================================================================

    afficherEcranAttente();

    try {
        const snapPartie = await getDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE));
        const lieuActuel = snapPartie.exists() ? snapPartie.data().Lieu_Actuel : null;

        const qMsgAll = query(collection(db, "Messages_Chat"), where("ID_Partie", "==", window.ID_PARTIE_COURANTE), orderBy("Timestamp", "asc"));
        const snapMsgAll = await getDocs(qMsgAll);
        let messages = [];
        snapMsgAll.forEach(d => messages.push(d.data()));
        if (messages.length === 0) return;

        // =========================================================================
        //  FILTRAGE ET BRIDAGE DES TOKENS (Seulement les 30 derniers messages)
        // =========================================================================
        const messagesFiltres = messages.filter(m => {
            const nomAuteur = m.Auteur_Nom || "";
            const texteMsg = m.Texte || "";

            // 1. On ignore complètement les messages de type "Système" ou "Date"
            if (nomAuteur === "Date" || nomAuteur === "Système" || nomAuteur === "Date_En_Jeu" || m.Auteur_ID === "Date") {
                return false;
            }

            // 2. On ignore les messages dont le texte ressemble à la date du parchemin
            if (texteMsg.includes("De l'an") || (texteMsg.includes("Jour") && !isNaN(texteMsg.split("Jour")[1]?.trim()?.split(" ")[0]))) {
                return false;
            }

            return true;
        });

        // On ne garde que les 30 dernières répliques pour ne pas exploser la facture
        const historiqueReduit = messagesFiltres.slice(-30);

        const historiqueComplet = historiqueReduit.map(m => `${m.Auteur_Nom} : ${m.Texte}`).join("\n");
        const historique4 = historiqueReduit.slice(-4).map(m => `${m.Auteur_Nom} : ${m.Texte}`).join("\n");
        // =========================================================================

        const env = await preparerEnvironnement(lieuActuel);
        const nomsPnjPresents = Object.keys(env.pnjsPresents);

        let pnjCibles = [];
        if (nomsPnjPresents.length > 0) {
            pnjCibles = await filtrerPNJAvecMia(historique4, nomsPnjPresents);
        }

        let contexte = `--- CONTEXTE DE LA ZONE ACTUELLE ---\n`;
        contexte += `Type : ${env.type}\n`;
        contexte += `Description de la zone : ${JSON.stringify(env.details)}\n`;
        if (env.type === "Lieu" && env.listeBatiments.length > 0) {
            contexte += `Bâtiments visibles ici : ${env.listeBatiments.join(", ")}\n`;
        }

        // NOUVEAU : Injection des tags et de la jauge
        contexte += `\n--- RÉPUTATION DU GROUPE DANS CETTE RÉGION ---\n`;
        contexte += `Score : ${env.reputationScore}/10 (-10 = Hostile, 0 = Neutre, +10 = Adulés).\n`;
        contexte += `Tags de rumeur : ${env.reputationTags.length > 0 ? env.reputationTags.join(", ") : "Inconnus (Nouveaux venus)"}.\n`;
        contexte += `CONSIGNE ABSOLUE : Adapte obligatoirement le comportement des PNJ de cette zone en fonction de cette réputation (crainte, respect, agressivité, arnaque, etc.).\n`;

        if (nomsPnjPresents.length > 0) {
            contexte += `\n--- PNJ PRÉSENTS DANS LA ZONE ---\n`;
            nomsPnjPresents.forEach(nom => {
                const pnj = env.pnjsPresents[nom];
                const occupation = pnj.Occupation || "Occupation inconnue"; 
                const physique = pnj.Description_Physique || "Apparence inconnue";
                contexte += `- ${nom} (${occupation}) - Apparence : ${physique}\n`;
            });
        }

        if (pnjCibles.length > 0) {
            contexte += `\n--- FICHES DÉTAILLÉES DES PNJ SOLLICITÉS ---\n`;
            pnjCibles.forEach(nom => {
                if (env.pnjsPresents[nom]) contexte += `Fiche complète de ${nom} : ${JSON.stringify(env.pnjsPresents[nom])}\n`;
            });
        }

        const reponseTexte = await genererReponseNarrateur(contexte, historiqueComplet);

        if (reponseTexte) {
            // Formatage du texte pour mettre les PNJ en gras avec leur image
            let texteAffiche = reponseTexte;
            
            nomsPnjPresents.forEach(nom => {
                const pnj = env.pnjsPresents[nom];
                if (pnj) {
                    const regex = new RegExp(`\\b${nom}\\b`, 'g');
                    if (pnj.URL_Cloudinary && pnj.URL_Cloudinary !== "") {
                        const remplacement = `<span class="pnj-chat-hover"><strong>${nom}</strong><img src="${pnj.URL_Cloudinary}" class="pnj-hover-img"></span>`;
                        texteAffiche = texteAffiche.replace(regex, remplacement);
                    } else {
                        texteAffiche = texteAffiche.replace(regex, `<strong style="color: #e8d5a5;">${nom}</strong>`);
                    }
                }
            });

            // Conversion des sauts de ligne invisibles en sauts de ligne HTML
            texteAffiche = texteAffiche.replace(/\n/g, "<br>");

            await addDoc(collection(db, "Messages_Chat"), {
                ID_Partie: window.ID_PARTIE_COURANTE,
                Auteur_ID: "MJ", Auteur_Nom: "MJ", Auteur_Couleur: "#ffffff",
                Texte: texteAffiche,
                Timestamp: new Date().getTime()
            });
            await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), { Index_Initiative: 0 });

            // La file d'attente asynchrone (Fantômes)
            setTimeout(async () => {
                const lieuFinal = await analyserDeplacementBatiment(window.ID_PARTIE_COURANTE, lieuActuel, reponseTexte);
                const nomsHeros = window.PERSOS_PARTIE ? window.PERSOS_PARTIE.map(p => p.prenom) : [];

                if (lieuFinal) {
                    await analyserNouveauxPNJ(lieuFinal, nomsPnjPresents, nomsHeros, reponseTexte);
                    await analyserDeplacementPNJ(lieuFinal, nomsHeros, reponseTexte);
                    await analyserStigmates(lieuFinal, reponseTexte);
                    
                    // NOUVEAU : MIA_REPUTATION met à jour la renommée du groupe
                    await analyserReputation(lieuFinal, reponseTexte);
                }
            }, 0);
        }
    } catch (erreurFatale) {
        console.error("❌ [Tour IA] Erreur fatale :", erreurFatale);
    } finally {
        masquerEcranAttente();
    }
};