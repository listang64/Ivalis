// =========================================================================
//  IVALIS - MOTEUR IA (Pré-chargement Backend + Mia + Narrateur + Batiment + PNJ)
// =========================================================================

import { db } from "./firebase-config.js";
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

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
    const idPartieCourante = window.ID_PARTIE_COURANTE;

    if (lieuActuelId.startsWith("L")) {
        env.type = "Lieu";
        const snapLieu = await getDoc(doc(db, "Monde_Lieux", lieuActuelId));
        if (snapLieu.exists()) {
            env.details = snapLieu.data();
            const repMap = env.details.Reputations || {};
            const repGroupe = repMap[idPartieCourante] || {};
            env.reputationScore = repGroupe.Score || 0;
            env.reputationTags = repGroupe.Tags || [];
        }

        const qBat = query(collection(db, "Monde_Batiment"), where("ID_Lieu", "==", lieuActuelId));
        const snapBat = await getDocs(qBat);
        snapBat.forEach(doc => { env.listeBatiments.push(doc.data().Nom_Batiment); });

        const qPnj = query(collection(db, "Monde_PNJ"), where("ID_Lieu", "==", lieuActuelId));
        const snapPnj = await getDocs(qPnj);
        snapPnj.forEach(doc => { 
            const pnjData = doc.data();
            pnjData.idDoc = doc.id;
            if (pnjData.Statut !== "Mort") {
                env.pnjsPresents[pnjData.Nom_PNJ] = pnjData; 
            }
        });
    }
    else if (lieuActuelId.startsWith("B")) {
        env.type = "Bâtiment";
        const snapBat = await getDoc(doc(db, "Monde_Batiment", lieuActuelId));
        if (snapBat.exists()) {
            env.details = snapBat.data();
            idLieuParent = env.details.ID_Lieu; 
        }

        if (idLieuParent) {
            const snapLieu = await getDoc(doc(db, "Monde_Lieux", idLieuParent));
            if (snapLieu.exists()) {
                const repMap = snapLieu.data().Reputations || {};
                const repGroupe = repMap[idPartieCourante] || {};
                env.reputationScore = repGroupe.Score || 0;
                env.reputationTags = repGroupe.Tags || [];
            }
        }

        const qPnj = query(collection(db, "Monde_PNJ"), where("ID_Batiment", "==", lieuActuelId));
        const snapPnj = await getDocs(qPnj);
        snapPnj.forEach(doc => { 
            const pnjData = doc.data();
            pnjData.idDoc = doc.id;
            if (pnjData.Statut !== "Mort") {
                env.pnjsPresents[pnjData.Nom_PNJ] = pnjData; 
            }
        });
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

// NOUVEAU : Récupération du style graphique personnalisé depuis Firebase
async function recupererInstructionStyleBackend() {
    try {
        const snap = await getDoc(doc(db, "Cerveau_IA", "INST_76839"));
        if (snap.exists()) return snap.data().Contenu_Direct || "";
    } catch (e) {
        console.error("Lecture du style INST_76839 impossible :", e);
    }
    return "";
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
    
    const instructionStyle = await recupererInstructionStyleBackend();
    const promptOpenAI = "Ne dessine absolument aucun texte ou lettrage sur l'image.\\n\\nDescription du lieu : " + promptBatiment + "\\n\\nDirectives de style artistique obligatoires : " + instructionStyle;

    const payloadOpenAI = { model: "gpt-image-2", prompt: promptOpenAI, output_format: "webp", n: 1, size: "1792x1024", quality: "low", moderation: "low" };

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
ATTENTION - RÈGLE ABSOLUE ANTI-ANTICIPATION : Voir un lieu de loin, en entendre parler, ou se voir indiquer un chemin NE VEUT PAS DIRE y entrer. Si le texte dit "là bas se trouve...", ou si le Narrateur finit par demander "Que faites-vous ?" / "Y allez-vous ?", c'est que le déplacement n'a PAS encore eu lieu ! Tu ne dois créer un bâtiment que si les joueurs y sont physiquement entrés à l'instant t.

1. Les joueurs viennent-ils EXPLICITEMENT de FRANCHIR LE SEUIL ou PÉNÉTRER physiquement dans un bâtiment/boutique/taverne existant de la liste ? -> "existant" + ID.
2. Les joueurs viennent-ils EXPLICITEMENT de PÉNÉTRER physiquement dans un bâtiment/point d'intérêt fermé INCONNU ? -> "nouveau" + invente les détails.
3. Les joueurs viennent-ils de SORTIR d'un bâtiment pour retourner à l'extérieur ? -> "sortie".
4. Sinon (simple discussion, observation de loin, choix laissé aux joueurs, ou déplacement en plein air) -> "aucun".`;

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
    
    const instructionStyle = await recupererInstructionStyleBackend();
    const promptOpenAI = "Ne dessine absolument aucun texte ou lettrage sur l'image.\\n\\nDescription du personnage : " + descriptionPhysique + "\\n\\nDirectives de style artistique obligatoires : " + instructionStyle;

    const payloadOpenAI = { model: "gpt-image-2", prompt: promptOpenAI, output_format: "webp", n: 1, size: "1024x1792", quality: "low", moderation: "low" };

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
                if (idLieuActuel.startsWith("L")) {
                    idLieuGlobal = idLieuActuel;
                } else if (idLieuActuel.startsWith("B")) {
                    idBatimentGlobal = idLieuActuel;
                    // CORRECTION : On va chercher la région parente pour que la fiche du PNJ soit parfaite dès sa naissance
                    const bSnap = await getDoc(doc(db, "Monde_Batiment", idLieuActuel));
                    if (bSnap.exists()) idLieuGlobal = bSnap.data().ID_Lieu;
                }

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

Ta mission : Lis la dernière narration du Maître du Jeu. Identifie TOUS les personnages (PNJ) qui se trouvent PHYSIQUEMENT DANS LA MÊME ZONE que les héros à la fin stricte du texte.

RÈGLES ABSOLUES ET STRICTES :
1. NE LISTE JAMAIS LES HÉROS.
2. ATTENTION AUX SÉPARATIONS : Si les héros quittent un lieu (sortent d'une pièce, s'enfuient, voyagent) et que le texte ne dit pas EXPLICITEMENT que le PNJ les accompagne, le PNJ est considéré comme RESTÉ SUR PLACE. Ne le liste SURTOUT PAS !
3. Si le texte dit qu'un PNJ "regarde partir", "reste en arrière", "soupire en les voyant s'éloigner", IL N'EST PLUS AVEC EUX. Ne le liste pas.
4. En cas de doute, ou si le PNJ n'a fait que parler avant que les héros ne bougent, ne le liste pas.

Utilise l'outil 'deplacerPNJ' pour lister les noms exacts de ceux qui partagent encore le même espace physique à la seconde où le texte se termine.`;

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

    // NOUVEAU : On récupère la date actuelle du jeu
    const jourActuel = window.DATE_EN_JEU_ACTUELLE?.jour || "?";
    const anActuel = window.DATE_EN_JEU_ACTUELLE?.annee || "?";
    const dateInGame = `Jour ${jourActuel} de l'an ${anActuel}`;

    let collectionCible = "";
    let stigmatesActuels = "";

    if (idLieuActuel.startsWith("L")) {
        collectionCible = "Monde_Lieux";
    } else if (idLieuActuel.startsWith("B")) {
        collectionCible = "Monde_Batiment";
    } else {
        return; 
    }

    try {
        const snapDecor = await getDoc(doc(db, collectionCible, idLieuActuel));
        if (snapDecor.exists()) {
            stigmatesActuels = snapDecor.data().Stigmates || "Aucun stigmate.";
        }

        const promptSysteme = `Tu es MIA_STIGMATE, un inspecteur des bâtiments froid, objectif et purement matériel.
DATE ACTUELLE EN JEU : ${dateInGame}.
Voici l'état ACTUEL des stigmates matériels de cet endroit : "${stigmatesActuels}"

Ta mission : Lis le dernier texte du Maître du Jeu. Y a-t-il eu des dégradations ou altérations DURABLES et MATÉRIELLES apportées à l'architecture (murs, portes, structures) ?

RÈGLES ABSOLUES (SOUS PEINE D'ERREUR CRITIQUE) :
1. MATÉRIEL LOURD UNIQUEMENT : Tu ne décris QUE l'architecture détruite ou modifiée (ex: mur effondré, cratère, cendres, porte dégondée).
2. IGNORE LES OBJETS ET OUTILS : Ne note JAMAIS un objet posé, planté, lâché ou manipulé par un personnage (ex: "un marteau planté dans un billot", "une chaise renversée", "une chope brisée"). Ce ne sont pas des stigmates architecturaux.
3. INTERDICTION DES ÉMOTIONS : Il t'est STRICTEMENT INTERDIT de décrire l'atmosphère ou les actions des gens.
4. Précède toujours chaque dommage matériel de sa date (ex: "[Jour 56] La porte principale est dégondée.").
5. GESTION DU TEMPS : Actualise la date si un vieux stigmate évolue.`;

        const outils = [{
            functionDeclarations: [{
                name: "mettreAJourStigmates",
                description: "Met à jour la description lissée et datée des stigmates du lieu.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        nouveaux_stigmates: { 
                            type: "STRING", 
                            description: "La nouvelle description complète, propre, lissée et horodatée des stigmates."
                        }
                    },
                    required: ["nouveaux_stigmates"]
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
        
        if (appelsOutils && appelsOutils.length > 0 && appelsOutils[0].name === "mettreAJourStigmates") {
            const stigmatesLisses = appelsOutils[0].args.nouveaux_stigmates || "";
            
            if (stigmatesLisses && stigmatesLisses !== stigmatesActuels) {
                console.log(`[MIA_STIGMATE] 🏚️ Décor altéré ! Nouveaux stigmates : ${stigmatesLisses}`);
                await updateDoc(doc(db, collectionCible, idLieuActuel), { Stigmates: stigmatesLisses });
            }
        }
    } catch (e) { console.error("[MIA_STIGMATE] Erreur silencieuse :", e); }
}

// =========================================================================
//  NOUVEAU : MIA_REPUTATION (Analyse des actes et rumeurs)
// =========================================================================

async function analyserReputation(idPartie, idLieuActuel, texteMJ) {
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cleGemini || !idLieuActuel) return;

    let idLieuCible = idLieuActuel;
    if (idLieuActuel.startsWith("B")) {
        const bSnap = await getDoc(doc(db, "Monde_Batiment", idLieuActuel));
        if (bSnap.exists()) idLieuCible = bSnap.data().ID_Lieu;
    }
    if (!idLieuCible || !idLieuCible.startsWith("L")) return;

    try {
        const snapLieu = await getDoc(doc(db, "Monde_Lieux", idLieuCible));
        if (!snapLieu.exists()) return;
        
        const repMap = snapLieu.data().Reputations || {};
        const repGroupe = repMap[idPartie] || {};
        const scoreActuel = repGroupe.Score || 0;
        const tagsActuels = repGroupe.Tags || [];

        const promptSysteme = `Tu es MIA_REPUTATION, l'IA qui gère la renommée du groupe.
Score actuel du groupe DANS CE LIEU : ${scoreActuel} (-10 à +10).
Tags de rumeur actuels DANS CE LIEU : ${JSON.stringify(tagsActuels)}.

RÈGLE ABSOLUE : La réputation est strictement INDÉPENDANTE d'un lieu à l'autre. Ne juge que les actes commis DANS CE LIEU PRÉCIS.

Lis la dernière scène racontée. Y a-t-il eu une action NOTABLE du groupe ICI justifiant de modifier leur réputation LOCALE ?
Si oui :
1. Ajuste le score de réputation local.
2. S'il y a de nouveaux traits de réputation justifiés par l'action, mets-les dans 'tags_a_ajouter' (ex: "Voleurs", "Généreux").
3. IMPORTANT : Tu ne dois mettre un ancien tag dans 'tags_a_supprimer' QUE s'il est formellement contredit par la nouvelle action. La mémoire locale reste.

Si l'action est banale, ne fais rien.`;

        const outils = [{
            functionDeclarations: [{
                name: "mettreAJourReputation",
                description: "Modifie le score et indique quels tags ajouter ou retirer.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        nouveau_score: { type: "INTEGER", description: "Le nouveau score de -10 à +10" },
                        tags_a_ajouter: { type: "ARRAY", items: { type: "STRING" }, description: "Nouveaux tags à AJOUTER au groupe" },
                        tags_a_supprimer: { type: "ARRAY", items: { type: "STRING" }, description: "Anciens tags à SUPPRIMER car formellement contredits" }
                    },
                    required: ["nouveau_score"]
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
            const tagsAjout = appelsOutils[0].args.tags_a_ajouter || [];
            const tagsSuppr = appelsOutils[0].args.tags_a_supprimer || [];
            
            let setTags = new Set(tagsActuels);
            tagsSuppr.forEach(tag => setTags.delete(tag)); 
            tagsAjout.forEach(tag => setTags.add(tag));    
            let nouveauxTagsArray = Array.from(setTags);
            
            if (nouveauScore !== scoreActuel || JSON.stringify(nouveauxTagsArray) !== JSON.stringify(tagsActuels)) {
                console.log(`[MIA_REPUTATION] 📢 Nouveau Score: ${nouveauScore}, Tags: ${nouveauxTagsArray}`);
                
                repMap[idPartie] = { Score: nouveauScore, Tags: nouveauxTagsArray };
                await updateDoc(doc(db, "Monde_Lieux", idLieuCible), {
                    Reputations: repMap
                });
            }
        }
    } catch (e) { console.error("[MIA_REPUTATION] Erreur :", e); }
}

// =========================================================================
//  NOUVEAU : MIA_MORT (La Faucheuse de PNJ et d'images)
// =========================================================================

async function supprimerImageCloudinary(urlImage) {
    if (!urlImage) return;
    const cles = {
        cloudName: localStorage.getItem("ivalis_CLOUDINARY_CLOUD_NAME")?.trim(),
        cloudKey: localStorage.getItem("ivalis_CLOUDINARY_API_KEY")?.trim(),
        cloudSecret: localStorage.getItem("ivalis_CLOUDINARY_API_SECRET")?.trim()
    };
    if (!cles.cloudName || !cles.cloudKey || !cles.cloudSecret) return;

    try {
        // 1. Isoler l'ID public depuis l'URL Cloudinary (extrêmement robuste)
        const parts = urlImage.split('/upload/');
        if (parts.length < 2) return;
        
        // On filtre les balises de transformation (q_auto, etc.) et les numéros de version (v178...)
        const segmentsNettoyes = parts[1].split('/').filter(seg => !seg.includes(',') && !/^v\d+$/.test(seg));
        const cheminComplet = segmentsNettoyes.join('/'); // Ex: "PNJ/mon_image.webp"
        const publicId = cheminComplet.substring(0, cheminComplet.lastIndexOf('.')); // Ex: "PNJ/mon_image"

        // 2. Préparer la signature de destruction
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signature = await genererSignatureCloudinary(`public_id=${publicId}&timestamp=${timestamp}${cles.cloudSecret}`);

        // 3. Envoyer la roquette de destruction
        const formData = new FormData();
        formData.append("public_id", publicId);
        formData.append("api_key", cles.cloudKey);
        formData.append("timestamp", timestamp);
        formData.append("signature", signature);

        await fetch(`https://api.cloudinary.com/v1_1/${cles.cloudName}/image/destroy`, {
            method: "POST",
            body: formData
        });
        console.log(`[Cloudinary] 🧹 Image supprimée des serveurs : ${publicId}`);
    } catch (e) {
        console.error("[Cloudinary] Erreur lors de la suppression de l'image :", e);
    }
}

async function analyserMortsPNJ(nomsPnjPresents, texteMJ) {
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cleGemini || !nomsPnjPresents || nomsPnjPresents.length === 0) return;

    const promptSysteme = `Tu es MIA_MORT, l'IA en charge de la faucheuse.
Voici les PNJ de l'histoire actuellement présents dans la scène : ${JSON.stringify(nomsPnjPresents)}.

Ta mission : Lis la dernière narration du Maître du Jeu. Y a-t-il un ou plusieurs PNJ de cette liste qui viennent EXPLICITEMENT de MOURIR (tués, assassinés, désintégrés, décapités, etc.) ?
Attention : S'ils sont juste blessés, assommés, qu'ils fuient, ou qu'ils sont "aux portes de la mort", ils NE SONT PAS morts.

Si un ou plusieurs PNJ sont définitivement morts, utilise l'outil 'declarerMorts' avec leurs noms exacts.
Sinon, ne fais rien.`;

    const outils = [{
        functionDeclarations: [{
            name: "declarerMorts",
            description: "Déclare le décès définitif et incontestable des PNJ présents.",
            parameters: {
                type: "OBJECT",
                properties: {
                    noms_morts: { type: "ARRAY", items: { type: "STRING" }, description: "Liste des noms exacts des PNJ décédés." }
                },
                required: ["noms_morts"]
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
        
        if (appelsOutils && appelsOutils.length > 0 && appelsOutils[0].name === "declarerMorts") {
            const nomsMorts = appelsOutils[0].args.noms_morts || [];
            
            for (const nom of nomsMorts) {
                if (!nomsPnjPresents.includes(nom)) continue; 

                console.log(`[MIA_MORT] ☠️ Le PNJ '${nom}' a passé l'arme à gauche. Changement de statut...`);
                
                const qPnj = query(collection(db, "Monde_PNJ"), where("Nom_PNJ", "==", nom));
                const snapPnj = await getDocs(qPnj);

                snapPnj.forEach(async (docPnj) => {
                    // NOUVEAU : On se contente de modifier le statut en "Mort"
                    await updateDoc(doc(db, "Monde_PNJ", docPnj.id), {
                        Statut: "Mort"
                    });
                    console.log(`[MIA_MORT] 🪦 Statut de '${nom}' passé sur "Mort". Il n'agira plus.`);
                });
            }
        }
    } catch (e) { console.error("[MIA_MORT] Erreur silencieuse :", e); }
}

// =========================================================================
//  NOUVEAU : MIA_CARTO (Création procédurale de régions inexplorées)
// =========================================================================

async function genererEtStockerImageLieu(promptLieu) {
    const cles = {
        openai: localStorage.getItem("ivalis_OPENAI_API_KEY")?.trim(),
        cloudName: localStorage.getItem("ivalis_CLOUDINARY_CLOUD_NAME")?.trim(),
        cloudKey: localStorage.getItem("ivalis_CLOUDINARY_API_KEY")?.trim(),
        cloudSecret: localStorage.getItem("ivalis_CLOUDINARY_API_SECRET")?.trim()
    };
    if (!cles.openai || !cles.cloudName || !cles.cloudKey || !cles.cloudSecret) return "";

    console.log("🎨 [MIA_Carto] Peinture de la nouvelle région...");
    
    let instructionStyle = await recupererInstructionStyleBackend();
    
    // NOUVEAU : On nettoie si tu as mis des phrases de discussion au début
    instructionStyle = instructionStyle.replace(/Tu fera ce dessin dans ce style :/gi, "").trim();

    // NOUVEAU : On passe à l'heroic fantasy et on ajoute des exemples architecturaux
    const promptOpenAI = `DIRECTIVE DE STYLE VISUEL OBLIGATOIRE : ${instructionStyle}\n\n---\nSujet à dessiner : Un paysage d'heroic fantasy. ABSOLUMENT AUCUN PERSONNAGE, aucun humain, aucune créature, aucun animal. Uniquement de l'environnement, du paysage et de l'architecture (ville, village, grotte, nature, etc.). Ne dessine aucun texte. Description de la région : ${promptLieu}`;

    const payloadOpenAI = { model: "gpt-image-2", prompt: promptOpenAI, output_format: "webp", n: 1, size: "1792x1024", quality: "low", moderation: "low" };

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
    const dossier = "Lieux"; // NOUVEAU DOSSIER CLOUDINARY
    const signature = await genererSignatureCloudinary(`folder=${dossier}&timestamp=${timestamp}${cles.cloudSecret}`);

    const formCloudinary = new FormData();
    formCloudinary.append("file", imageSource); formCloudinary.append("api_key", cles.cloudKey);
    formCloudinary.append("timestamp", timestamp); formCloudinary.append("signature", signature);
    formCloudinary.append("folder", dossier);

    try {
        const resCloud = await fetch(`https://api.cloudinary.com/v1_1/${cles.cloudName}/image/upload`, { method: "POST", body: formCloudinary });
        const jsonCloud = await resCloud.json();
        if (jsonCloud.secure_url) {
            console.log("✅ [MIA_Carto] Paysage généré avec succès !");
            return jsonCloud.secure_url.replace("/upload/", "/upload/q_auto,f_auto/");
        }
    } catch (e) { return ""; }
    return "";
}

async function genererEtStockerIconeCarte(nomLieu, descriptionLieu) {
    const cles = {
        openai: localStorage.getItem("ivalis_OPENAI_API_KEY")?.trim(),
        cloudName: localStorage.getItem("ivalis_CLOUDINARY_CLOUD_NAME")?.trim(),
        cloudKey: localStorage.getItem("ivalis_CLOUDINARY_API_KEY")?.trim(),
        cloudSecret: localStorage.getItem("ivalis_CLOUDINARY_API_SECRET")?.trim()
    };
    if (!cles.openai) return "";

    console.log("✒️ [MIA_Carto] Dessin de l'icône sur la carte avec gpt-image-1.5...");
    
    // NOUVEAU PROMPT : Minimalisme total, traits noirs épais, et INTERDICTION formelle d'écrire du texte.
    const promptOpenAI = `A highly stylized, extremely minimalist map icon for a tabletop RPG. Subject: ${descriptionLieu}. 
    STYLE OBLIGATOIRE: Thick, bold, solid black ink lines only. No shading, no grayscale, no colors. Extremely simple and clean outlines, like a stylized river drawn on an old parchment map. 
    DO NOT write any text, letters, words, or names on the image. Just the drawing.`;

    // LE PAYLOAD MAGIQUE (gpt-image-1.5 avec fond transparent)
    const payloadOpenAI = { 
        model: "gpt-image-1.5", 
        prompt: promptOpenAI, 
        size: "1024x1024",
        background: "transparent",
        output_format: "png",
        quality: "low",
        moderation: "low",
        n: 1
    };

    let texteReponseOpenAI = "";
    try {
        const res = await fetch("https://api.openai.com/v1/images/generations", {
            method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cles.openai }, body: JSON.stringify(payloadOpenAI)
        });
        texteReponseOpenAI = await res.text();
    } catch (e) { return ""; }

    let jsonOpenAI;
    try { jsonOpenAI = JSON.parse(texteReponseOpenAI); } catch (e) { return ""; }
    if (!jsonOpenAI.data || jsonOpenAI.data.length === 0) return "";

    let imageSource = jsonOpenAI.data[0].url || ("data:image/png;base64," + jsonOpenAI.data[0].b64_json);

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = await genererSignatureCloudinary(`folder=Icones_Cartes&timestamp=${timestamp}${cles.cloudSecret}`);

    const formCloudinary = new FormData();
    formCloudinary.append("file", imageSource); 
    formCloudinary.append("api_key", cles.cloudKey);
    formCloudinary.append("timestamp", timestamp); 
    formCloudinary.append("signature", signature);
    formCloudinary.append("folder", "Icones_Cartes");

    try {
        const resCloud = await fetch(`https://api.cloudinary.com/v1_1/${cles.cloudName}/image/upload`, { method: "POST", body: formCloudinary });
        const jsonCloud = await resCloud.json();
        if (jsonCloud.secure_url) return jsonCloud.secure_url; 
    } catch (e) { return ""; }
    return "";
}

window.creerNouveauLieu = async function(idHex) {
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cleGemini) {
        alert("Clé Gemini manquante pour cartographier !");
        return null;
    }

    // =========================================================
    // NOUVEAU : On récupère tous les lieux déjà existants en BDD
    // =========================================================
    let nomsLieuxExistants = [];
    try {
        const qLieux = query(collection(db, "Monde_Lieux"));
        const snapLieux = await getDocs(qLieux);
        snapLieux.forEach(doc => {
            if (doc.data().Nom_Du_Lieu) nomsLieuxExistants.push(doc.data().Nom_Du_Lieu);
        });
    } catch (e) {
        console.warn("[MIA_Carto] Impossible de lire la mémoire des lieux :", e);
    }

    // =========================================================
    // NOUVEAU PROMPT : Mémoire du monde + Descriptions riches
    // =========================================================
    const promptSysteme = `Tu es MIA_CARTO, l'IA architecte du monde d'Ivalis. 
Le Maître du Jeu vient d'envoyer les joueurs sur une zone inexplorée de la carte.
Voici la liste des lieux qui existent DÉJÀ dans le monde : ${JSON.stringify(nomsLieuxExistants)}.

Ta mission : Invente une NOUVELLE RÉGION d'heroic fantasy originale.

RÈGLES DE CRÉATION :
1. ORIGINALITÉ : Le nouveau lieu doit être un concept différent de ceux déjà existants. S'il y a déjà "La Grotte de Cristal", n'invente pas une autre grotte de cristal.
2. EXCEPTION URBAINE : Les villes, bourgades, camps et villages sont la base d'un monde vivant. Tu peux (et tu dois souvent) créer de nouveaux villages ou cités, même s'il y en a déjà beaucoup.
3. VARIÉTÉ : Varie les atmosphères (joyeux, mystique, dangereux, paisible, abandonné, très peuplé).

Réponds OBLIGATOIREMENT avec un JSON valide respectant ce format exact :
{
    "nom": "Le Nom du Lieu",
    "description": "Une description complète, riche et détaillée du lieu. Décris son atmosphère, son architecture, ses spécificités (géographie, culture, rumeur locale, bizarrerie). Sois exhaustif.",
    "securite": "Faible", // Choisir parmi: Inconnue, Faible, Moyenne, Élevée, Cauchemar
    "prompt_image": "Description visuelle très courte en ANGLAIS du paysage (UNIQUEMENT les éléments physiques. N'ajoute AUCUN mot lié à un style comme 'concept art', 'painting', 'realistic', car le style est géré ailleurs)."
}`;

    const bodyRequete = {
        systemInstruction: { parts: [{ text: promptSysteme }] },
        contents: [{ role: "user", parts: [{ text: "Déploie ton imagination et crée un nouveau lieu original pour cette tuile vide." }] }],
        generationConfig: { 
            temperature: 0.9, 
            responseMimeType: "application/json"
        }
    };

    try {
        const reponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGemini}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(bodyRequete)
        });
        const data = await reponse.json();
        const contenu = JSON.parse(data.candidates[0].content.parts[0].text);

        const numAleatoire = Math.floor(Math.random() * 100000).toString().padStart(5, "0");
        const nomFormate = contenu.nom.replace(/[^a-zA-Z0-9]/g, "_");
        const docId = `L_${numAleatoire}_${nomFormate}`;

        console.log(`[MIA_Carto] 🌍 Nouveau lieu imaginé : ${contenu.nom}`);

        // 1. Sauvegarde en BDD de la structure vierge
        await setDoc(doc(db, "Monde_Lieux", docId), {
            Description_Global: contenu.description,
            Niveau_De_Securite: contenu.securite,
            Nom_Du_Lieu: contenu.nom,
            Reputations: {},
            Stigmates: "",
            Tuile_ID: idHex,
            URL_Cloudinary: ""
        });

        // 2. Création des deux images en parallèle (Paysage + Icône de carte)
        const [urlImage, urlIcone] = await Promise.all([
            genererEtStockerImageLieu(contenu.prompt_image || contenu.nom),
            genererEtStockerIconeCarte(contenu.nom, contenu.description)
        ]);

        let maj = {};
        if (urlImage) maj.URL_Cloudinary = urlImage;
        if (urlIcone) maj.URL_Icone_Carte = urlIcone;

        if (Object.keys(maj).length > 0) {
            await updateDoc(doc(db, "Monde_Lieux", docId), maj);
        }
        
        if (typeof window.dessinerIconesCarte === "function") window.dessinerIconesCarte();

        // NOUVEAU : On retourne l'ID et le Nom pour que le Narrateur sache où on est !
        return { id: docId, nom: contenu.nom }; 

    } catch (e) {
        console.error("[MIA_Carto] Échec de l'exploration :", e);
        return null;
    }
};

window.regenererImagesLieuActuel = async function() {
    if (!window.ID_PARTIE_COURANTE) return alert("Aucune partie en cours.");
    
    // 1. On récupère le lieu actuel depuis Firebase
    const snapPartie = await getDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE));
    if (!snapPartie.exists() || !snapPartie.data().Lieu_Actuel) return alert("Lieu actuel introuvable.");
    
    let idLieu = snapPartie.data().Lieu_Actuel;
    
    // Si les joueurs sont dans un bâtiment, on cible la région parente
    if (idLieu.startsWith("B")) {
        const snapBat = await getDoc(doc(db, "Monde_Batiment", idLieu));
        if (snapBat.exists() && snapBat.data().ID_Lieu) {
            idLieu = snapBat.data().ID_Lieu;
        } else {
            return alert("Impossible de trouver la région de ce bâtiment.");
        }
    }

    if (!idLieu.startsWith("L")) return alert("Ce n'est pas un lieu valide pour la carte.");

    const snapLieu = await getDoc(doc(db, "Monde_Lieux", idLieu));
    if (!snapLieu.exists()) return;
    
    const dataLieu = snapLieu.data();

    // 2. On ferme les fenêtres et on lance l'écran de voyage (sablier)
    if (typeof window.fermerParametres === "function") window.fermerParametres(true);

    const ecranCharge = document.getElementById("ecran-chargement-ia");
    const titreCharge = document.getElementById("titre-chargement-ia");
    const imageCharge = document.getElementById("image-chargement-ia");

    if (ecranCharge && titreCharge && imageCharge) {
        titreCharge.innerText = "Régénération de la région en cours...";
        imageCharge.dataset.oldSrc = imageCharge.src;
        imageCharge.src = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782857488/voyage_yhokpd.png"; 
        ecranCharge.style.display = "flex";
    }

    try {
        console.log(`[Régénération] Lancement pour ${dataLieu.Nom_Du_Lieu}...`);
        
        // 3. On relance les deux requêtes API avec les données existantes
        const [urlImage, urlIcone] = await Promise.all([
            genererEtStockerImageLieu(dataLieu.Nom_Du_Lieu + " - " + dataLieu.Description_Global),
            genererEtStockerIconeCarte(dataLieu.Nom_Du_Lieu, dataLieu.Description_Global)
        ]);

        let maj = {};
        if (urlImage) maj.URL_Cloudinary = urlImage;
        if (urlIcone) maj.URL_Icone_Carte = urlIcone;

        // 4. On écrase les anciennes images dans la BDD
        if (Object.keys(maj).length > 0) {
            await updateDoc(doc(db, "Monde_Lieux", idLieu), maj);
            
            // On force le rafraîchissement visuel pour les joueurs !
            if (typeof window.dessinerIconesCarte === "function") window.dessinerIconesCarte();
            if (typeof window.mettreAJourBulleLieu === "function") window.mettreAJourBulleLieu(snapPartie.data().Lieu_Actuel);
        }
    } catch (e) {
        console.error("Erreur lors de la régénération :", e);
        alert("Une interférence magique a fait échouer la peinture.");
    } finally {
        if (ecranCharge) ecranCharge.style.display = "none";
        if (titreCharge) titreCharge.innerText = "Création de personnage en cours ...";
        if (imageCharge && imageCharge.dataset.oldSrc) imageCharge.src = imageCharge.dataset.oldSrc;
    }
};

// =========================================================================
//  INTERFACE & CERVEAU DU NARRATEUR
// =========================================================================

// NOUVEAU : On attache ces fonctions à "window" pour qu'elles soient accessibles partout
window.afficherEcranAttente = function(textePersonnalise) {
    if (document.getElementById("ecran-attente-ia")) return;
    const overlay = document.createElement("div");
    overlay.id = "ecran-attente-ia";
    overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0, 0, 0, 0.85); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 9999; backdrop-filter: blur(5px);`;
    const texte = document.createElement("h2");
    texte.innerText = textePersonnalise || "En attente du maitre du jeu ...";
    texte.style.cssText = "color: white; font-family: serif; font-size: 2rem; margin-bottom: 20px; letter-spacing: 2px; text-shadow: 2px 2px 4px #000; text-align: center;";
    const image = document.createElement("img");
    image.src = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782291884/attente_mj_rtmpv1.png";
    image.style.cssText = "max-width: 80%; max-height: 60vh; border-radius: 10px; box-shadow: 0 0 30px rgba(255, 255, 255, 0.1);";
    overlay.appendChild(texte);
    overlay.appendChild(image);
    document.body.appendChild(overlay);
};

window.masquerEcranAttente = function() {
    const overlay = document.getElementById("ecran-attente-ia");
    if (overlay) overlay.remove();
};

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

    // 1. SÉCURITÉ LOCALE : Vérifie si le verrou est déjà actif
    const snapVerrou = await getDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE));
    if (snapVerrou.exists() && snapVerrou.data().IA_En_Cours === true) {
        console.log("⏳ L'IA réfléchit déjà, clic ignoré.");
        return;
    }

    // 2. VERROUILLAGE GLOBAL : On dit à Firebase de bloquer tous les joueurs
    await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), { IA_En_Cours: true });

    // Reset du compteur de tokens local
    localStorage.setItem("ivalis_TOTAL_TOKENS", "0");
    if (typeof window.actualiserAffichageTokens === "function") {
        window.actualiserAffichageTokens();
    }

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

        // NOUVEAU : Récupération de la date in-game
        const jourActuel = window.DATE_EN_JEU_ACTUELLE?.jour || "?";
        const anActuel = window.DATE_EN_JEU_ACTUELLE?.annee || "?";

        let contexte = `--- CONTEXTE TEMPOREL ET SPATIAL ---\n`;
        contexte += `DATE ACTUELLE EN JEU : Nous sommes le Jour ${jourActuel} de l'an ${anActuel}.\n`;
        contexte += `Type : ${env.type}\n`;
        contexte += `Description de la zone : ${JSON.stringify(env.details)}\n`;
        if (env.type === "Lieu" && env.listeBatiments.length > 0) {
            contexte += `Bâtiments visibles ici : ${env.listeBatiments.join(", ")}\n`;
        }

        // NOUVEAU : Injection des tags et de la jauge (ISOLATION STRICTE)
        contexte += `\n--- RÉPUTATION DU GROUPE DANS CE LIEU PRÉCIS ---\n`;
        contexte += `RÈGLE ABSOLUE : Cette réputation est strictement LOCALE et indépendante des autres lieux. Les PNJ d'ici ignorent tout des actes commis par le groupe ailleurs.\n`;
        contexte += `Score local : ${env.reputationScore}/10 (-10 = Hostile, 0 = Neutre, +10 = Adulés).\n`;
        contexte += `Tags de rumeur locaux : ${env.reputationTags.length > 0 ? env.reputationTags.join(", ") : "Inconnus (Nouveaux venus ici)"}.\n`;
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
            // NOUVEAU : On supprime totalement les doubles astérisques Markdown (**)
            // que l'IA utilise pour mettre des mots en gras (Lieux, objets, etc.).
            // On conserve uniquement les simples astérisques (*) utilisés pour la narration/les actions.
            let texteAffiche = reponseTexte.replace(/\*\*/g, "");
            
            // Ensuite, on applique NOTRE propre mise en gras (et l'image) uniquement sur les PNJ !
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
            
            // CORRECTION BUG INITIATIVE : On mélange les joueurs au lieu de juste remettre à 0 !
            if (typeof window.relancerInitiativeChat === "function") {
                await window.relancerInitiativeChat();
            } else {
                await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), { Index_Initiative: 0 });
            }

            // La file d'attente asynchrone (Fantômes)
            setTimeout(async () => {
                const lieuFinal = await analyserDeplacementBatiment(window.ID_PARTIE_COURANTE, lieuActuel, reponseTexte);
                const nomsHeros = window.PERSOS_PARTIE ? window.PERSOS_PARTIE.map(p => p.prenom) : [];

                if (lieuFinal) {
                    await analyserNouveauxPNJ(lieuFinal, nomsPnjPresents, nomsHeros, reponseTexte);
                    await analyserDeplacementPNJ(lieuFinal, nomsHeros, reponseTexte);
                    await analyserMortsPNJ(nomsPnjPresents, reponseTexte);
                    await analyserStigmates(lieuFinal, reponseTexte);
                    await analyserReputation(window.ID_PARTIE_COURANTE, lieuFinal, reponseTexte);
                }
            }, 0);
        }
    } catch (erreurFatale) {
        console.error("❌ [Tour IA] Erreur fatale :", erreurFatale);
    } finally {
        // 3. DÉVERROUILLAGE GLOBAL : On libère la partie pour tout le monde
        if (window.ID_PARTIE_COURANTE) {
            await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), { IA_En_Cours: false });
        }
    }
};

// =========================================================================
//  NOUVEAU : MIA_SOUVENIR (Archivage et nettoyage de fin de session)
// =========================================================================

// Moteur silencieux : Effectue le travail sans aucune alerte (utilisé pour les voyages)
window.processusArchivageChat = async function() {
    if (!window.ID_PARTIE_COURANTE) return false;

    try {
        // 1. Récupération de tous les messages
        const qMsg = query(collection(db, "Messages_Chat"), where("ID_Partie", "==", window.ID_PARTIE_COURANTE), orderBy("Timestamp", "asc"));
        const snapMsg = await getDocs(qMsg);
        let messages = [];
        snapMsg.forEach(d => messages.push({ id: d.id, ...d.data() }));

        if (messages.length === 0) return true; // Le chat est déjà vide, c'est bon.

        // On ignore les messages système du Destin pour l'analyse
        const historiqueFiltre = messages.filter(m => m.Auteur_ID !== "SYSTEME_TEMPS" && m.Auteur_ID !== "DESTIN");
        const historiqueComplet = historiqueFiltre.map(m => `${m.Auteur_Nom} : ${m.Texte}`).join("\n");

        if (historiqueFiltre.length > 0) {
            // 2. Détection des PNJ présents (Cible le lieu que l'on quitte !)
            const snapPartie = await getDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE));
            const lieuActuel = snapPartie.exists() ? snapPartie.data().Lieu_Actuel : null;
            const env = await preparerEnvironnement(lieuActuel); 
            const nomsPnj = Object.keys(env.pnjsPresents);

            // 3. Invocation de MIA_SOUVENIR s'il y a des PNJ dans la zone
            if (nomsPnj.length > 0) {
                const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
                const jourEnJeu = window.DATE_EN_JEU_ACTUELLE?.jour || "?";
                const anEnJeu = window.DATE_EN_JEU_ACTUELLE?.annee || "?";
                const dateTag = `[Jour ${jourEnJeu} de l'an ${anEnJeu}]`;

                const promptSysteme = `Tu es MIA_SOUVENIR, l'IA qui gère la mémoire des habitants d'Ivalis.
Voici l'historique complet du chat d'aujourd'hui.
Voici les PNJ qui se trouvaient dans la même zone que les joueurs : ${nomsPnj.join(", ")}.

Ta mission : Lis le chat. Pour CHAQUE PNJ de cette liste, génère UN SEUL SOUVENIR marquant (une ou deux phrases maximum, écrites à la PREMIÈRE PERSONNE). Ce souvenir doit résumer l'interaction ou l'impression qu'ont laissée les joueurs au PNJ aujourd'hui.
Si un PNJ n'a absolument pas interagi ou n'a pas du tout été concerné par les actes des joueurs aujourd'hui, ne lui crée pas de souvenir.`;

                const outils = [{
                    functionDeclarations: [{
                        name: "archiverSouvenirs",
                        description: "Enregistre les souvenirs dans le cerveau des PNJ.",
                        parameters: {
                            type: "OBJECT",
                            properties: {
                                souvenirs: {
                                    type: "ARRAY",
                                    items: {
                                        type: "OBJECT",
                                        properties: {
                                            nom_pnj: { type: "STRING", description: "Le nom exact du PNJ." },
                                            texte_souvenir: { type: "STRING", description: "La phrase de souvenir à la 1ere personne." }
                                        }
                                    }
                                }
                            }, required: ["souvenirs"]
                        }
                    }]
                }];

                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGemini}`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        systemInstruction: { parts: [{ text: promptSysteme }] },
                        contents: [{ role: "user", parts: [{ text: historiqueComplet }] }],
                        tools: outils, 
                        toolConfig: { functionCallingConfig: { mode: "AUTO" } }
                    })
                });

                const data = await res.json();
                const appelsOutils = data.candidates?.[0]?.content?.parts?.filter(p => p.functionCall).map(p => p.functionCall);
                
                // 4. Écriture dans les cerveaux des PNJ
                if (appelsOutils && appelsOutils.length > 0 && appelsOutils[0].name === "archiverSouvenirs") {
                    const souvenirsCrees = appelsOutils[0].args.souvenirs || [];
                    
                    for (const souv of souvenirsCrees) {
                        const pnjData = env.pnjsPresents[souv.nom_pnj];
                        if (!pnjData || !pnjData.idDoc) continue;

                        console.log(`🧠 [MIA_Souvenir] Mémoire implantée pour ${souv.nom_pnj}`);
                        const ancienneMemoire = pnjData.Memoires || "";
                        const nouvelleMemoire = ancienneMemoire ? `${ancienneMemoire}\n${dateTag} ${souv.texte_souvenir}` : `${dateTag} ${souv.texte_souvenir}`;

                        await updateDoc(doc(db, "Monde_PNJ", pnjData.idDoc), {
                            Memoires: nouvelleMemoire
                        });
                    }
                }
            }
        }

        // 5. Autodestruction du chat
        console.log("🧹 [Nettoyage] Suppression de l'historique du chat...");
        for (const m of messages) {
            await deleteDoc(doc(db, "Messages_Chat", m.id));
        }

        // =========================================================================
        // --- NOUVEAU : 6. LE CIMETIÈRE (Nettoyage des PNJ morts) ---
        // =========================================================================
        console.log("💀 [Cimetière] Recherche des corps à incinérer...");
        
        // On récupère tous les PNJ de la base de données
        const qTousLesPnj = query(collection(db, "Monde_PNJ"));
        const snapTousLesPnj = await getDocs(qTousLesPnj);
        
        for (const docPnj of snapTousLesPnj.docs) {
            const dataPnj = docPnj.data();
            
            // Si le PNJ n'est pas "Vivant" (Mort, Disparu, etc.)
            if (dataPnj.Statut !== "Vivant") {
                console.log(`[Cimetière] Effacement total de : ${dataPnj.Nom_PNJ}`);
                
                // 1. Suppression de l'image sur Cloudinary (la fonction existe déjà !)
                if (dataPnj.URL_Cloudinary && dataPnj.URL_Cloudinary !== "") {
                    await supprimerImageCloudinary(dataPnj.URL_Cloudinary);
                }
                
                // 2. Effacement définitif du PNJ de la base Firestore
                await deleteDoc(doc(db, "Monde_PNJ", docPnj.id));
            }
        }
        // =========================================================================

        return true;
    } catch (e) {
        console.error("Erreur critique lors de l'archivage silencieux :", e);
        return false;
    }
};

// La fonction liée au Bouton UI
window.archiverSessionEtViderChat = async function() {
    if (!window.ID_PARTIE_COURANTE) return alert("Aucune partie en cours.");
    
    if (!confirm("Voulez-vous vraiment clôturer cette session ? \n\nMIA va lire l'historique, graver les souvenirs dans le cerveau des PNJ impliqués, puis vider intégralement le chat. Cette action est irréversible.")) {
        return;
    }

    window.afficherEcranAttente("Les Parques gravent les souvenirs de cette session dans le marbre d'Ivalis...");

    await window.processusArchivageChat();

    window.masquerEcranAttente();
    if (typeof window.fermerParametres === "function") window.fermerParametres(true);
};