// =========================================================================
//  IVALIS - MOTEUR IA (Pré-chargement Backend + Mia + Narrateur + Batiment + PNJ)
// =========================================================================

import { db } from "./firebase-config.js?v=2";
import { collection, query, where, getDocs, orderBy, limit, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, writeBatch, increment } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// LE DÉPÔT DES DÉPENSES DU MJ (v294, depenses_ia.js) : une fiche par tour
// (Depenses_MJ) et le compteur commun (Depenses_MJ_Compteur/global), le même
// pour toute la table, quel que soit celui qui lance le MJ.
window.DEPOT_DEPENSES_MJ = {
    async ecrire(ligne) {
        const lot = writeBatch(db);
        lot.set(doc(db, "Depenses_MJ", ligne.id), ligne);
        lot.set(doc(db, "Depenses_MJ_Compteur", "global"), {
            tours: increment(1), totalUSD: increment(ligne.totalUSD || 0), totalEUR: increment(ligne.totalEUR || 0),
            tokensEnvoyes: increment((ligne.narrateur.envoyes || 0) + (ligne.aides.envoyes || 0)),
            images: increment(ligne.images.nombre || 0), Derniere_Maj: ligne.Timestamp || Date.now()
        }, { merge: true });
        await lot.commit();
    },
    async lire(n) {
        const snap = await getDocs(query(collection(db, "Depenses_MJ"), orderBy("Timestamp", "desc"), limit(n)));
        const lignes = [];
        snap.forEach(d => lignes.push(d.data()));
        lignes.sort((a, b) => (a.Timestamp || 0) - (b.Timestamp || 0));
        const c = await getDoc(doc(db, "Depenses_MJ_Compteur", "global"));
        return { lignes, compteur: c.exists() ? c.data() : { tours: 0, totalUSD: 0, totalEUR: 0, tokensEnvoyes: 0, images: 0 } };
    },
    async effacer() {
        const snap = await getDocs(query(collection(db, "Depenses_MJ")));
        const refs = [];
        snap.forEach(d => refs.push(doc(db, "Depenses_MJ", d.id)));
        for (let i = 0; i < refs.length; i += 400) {
            const lot = writeBatch(db);
            refs.slice(i, i + 400).forEach(r => lot.delete(r));
            await lot.commit();
        }
        await deleteDoc(doc(db, "Depenses_MJ_Compteur", "global"));
    }
};

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
                // NOUVEAU : On filtre la mémoire en fonction du groupe actuel
                const mapMemoires = pnjData.Memoires_Groupes || {};
                pnjData.Memoires = mapMemoires[idPartieCourante] || "Aucun souvenir de ce groupe.";
                delete pnjData.Memoires_Groupes; // On cache les autres groupes à Gemini !
                
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
                // NOUVEAU : Pareil pour les bâtiments
                const mapMemoires = pnjData.Memoires_Groupes || {};
                pnjData.Memoires = mapMemoires[idPartieCourante] || "Aucun souvenir de ce groupe.";
                delete pnjData.Memoires_Groupes;
                
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
//  OUTIL : DÉTOURAGE MAGIQUE SUR FOND MAGENTA (POUR LES PNJ)
// =========================================================================
async function detourerFondMagentaPNJ(imageSource) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext("2d", { willReadFrequently: true });
                ctx.drawImage(img, 0, 0);
                
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                const w = canvas.width;
                const h = canvas.height;
                const isBg = new Uint8Array(w * h);
                
                // Étape 1 : Pot de peinture extérieur
                const stack = [];
                for (let x = 0; x < w; x++) { stack.push(x); stack.push((h - 1) * w + x); }
                for (let y = 0; y < h; y++) { stack.push(y * w); stack.push(y * w + (w - 1)); }
                
                while (stack.length > 0) {
                    const idx = stack.pop();
                    if (isBg[idx] === 1) continue;
                    const p = idx * 4;
                    const r = data[p], g = data[p+1], b = data[p+2];
                    
                    if (r > 120 && b > 120 && r > g * 1.2 && b > g * 1.2) {
                        data[p+3] = 0; isBg[idx] = 1;
                        const x = idx % w; const y = Math.floor(idx / w);
                        if (x > 0 && isBg[idx - 1] === 0) stack.push(idx - 1);
                        if (x < w - 1 && isBg[idx + 1] === 0) stack.push(idx + 1);
                        if (y > 0 && isBg[idx - w] === 0) stack.push(idx - w);
                        if (y < h - 1 && isBg[idx + w] === 0) stack.push(idx + w);
                    }
                }
                
                // Étape 2 : Sniper interne
                for (let idx = 0; idx < w * h; idx++) {
                    if (isBg[idx] === 0) {
                        const p = idx * 4;
                        const r = data[p], g = data[p+1], b = data[p+2];
                        if (r > 150 && b > 150 && g < 90 && r > g * 1.6 && b > g * 1.6) {
                            data[p+3] = 0; isBg[idx] = 1;
                        }
                    }
                }
                
                // Étape 3 : Érosion & Lissage
                const alphas = [0, 15, 60, 140, 220];
                for (let passe = 1; passe <= 4; passe++) {
                    const nextBg = new Uint8Array(isBg);
                    for (let idx = 0; idx < w * h; idx++) {
                        if (isBg[idx] === 0) {
                            const x = idx % w; const y = Math.floor(idx / w);
                            let toucheVide = false;
                            
                            if (x > 0 && isBg[idx - 1] === 1) toucheVide = true;
                            else if (x < w - 1 && isBg[idx + 1] === 1) toucheVide = true;
                            else if (y > 0 && isBg[idx - w] === 1) toucheVide = true;
                            else if (y < h - 1 && isBg[idx + w] === 1) toucheVide = true;
                            
                            if (toucheVide) {
                                nextBg[idx] = 2;
                                const p = idx * 4;
                                const r = data[p], g = data[p+1], b = data[p+2];
                                
                                if (r > g * 1.05 && b > g * 1.05) {
                                    data[p] = g; data[p+2] = g;
                                }
                                data[p+3] = Math.min(data[p+3], alphas[passe]);
                            }
                        }
                    }
                    for (let idx = 0; idx < w * h; idx++) {
                        if (nextBg[idx] === 2) isBg[idx] = 1;
                    }
                }
                ctx.putImageData(imageData, 0, 0);
                resolve(canvas.toDataURL("image/png"));
                
            } catch (e) { resolve(imageSource); }
        };
        img.onerror = () => resolve(imageSource);
        img.src = imageSource;
    });
}

// =========================================================================
//  NOUVEAU : MIA_PNJ (Création procédurale de PNJ nommés avec Détourage)
// =========================================================================
// LES PORTRAITS DES PNJ EN PAUSE (v300). Nico : « mets en stand-by les
// créations d'images de PNJ pour le moment, ça va revenir après ». Les fiches
// des PNJ se créent toujours ; seul le portrait attend (false le rallume).
window.PORTRAITS_PNJ_EN_PAUSE = true;
async function genererEtStockerImagePNJ(descriptionPhysique, racePNJ = "Humain") {
    if (window.PORTRAITS_PNJ_EN_PAUSE !== false) return "";
    const cles = {
        openai: localStorage.getItem("ivalis_OPENAI_API_KEY")?.trim(),
        cloudName: localStorage.getItem("ivalis_CLOUDINARY_CLOUD_NAME")?.trim(),
        cloudKey: localStorage.getItem("ivalis_CLOUDINARY_API_KEY")?.trim(),
        cloudSecret: localStorage.getItem("ivalis_CLOUDINARY_API_SECRET")?.trim()
    };
    if (!cles.openai || !cles.cloudName || !cles.cloudKey || !cles.cloudSecret) return "";

    console.log(`🎨 [MIA_PNJ] Incantation du portrait pour le nouveau PNJ (${racePNJ})...`);
    
    const instructionStyle = await recupererInstructionStyleBackend();

    // =====================================================================
    // 1. Récupération du descriptif physique de la race depuis le Grimoire
    // =====================================================================
    let loreRace = "";
    if (racePNJ && racePNJ.toLowerCase() !== "humain") {
        try {
            const qRace = query(collection(db, "Monde_Races"));
            const snapRace = await getDocs(qRace);
            
            // On ignore la casse et les accents pour la comparaison
            const normaliser = (str) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const nomCherche = normaliser(racePNJ);

            snapRace.forEach(docSnap => {
                const dataRace = docSnap.data();
                if (dataRace.Nom && normaliser(dataRace.Nom).includes(nomCherche)) {
                    loreRace = dataRace.Descriptif_Physique || "";
                }
            });
        } catch (e) {
            console.error("[MIA_PNJ] Erreur récupération du lore de la race :", e);
        }
    }

    // =====================================================================
    // 2. NOUVEAU PROMPT : Anatomie de base VS Spécificités du PNJ
    // =====================================================================
    let promptOpenAI = "Contexte de l'univers : Antique Fantastique (Mythic Ancient Fantasy, Antiquité Magique).\n\n";

    if (loreRace !== "") {
        promptOpenAI += `--- ANATOMIE DE BASE DE L'ESPÈCE (${racePNJ}) ---\n` +
                        loreRace + "\n\n";
    }

    promptOpenAI += "--- SPÉCIFICITÉS UNIQUES DU PERSONNAGE (TRÈS IMPORTANT, PRIORITAIRE SUR L'ANATOMIE DE BASE) ---\n" +
                    "Description du personnage : " + descriptionPhysique + "\n\n" +
                    "Directives de style artistique : " + instructionStyle + "\n\n" +
                    "🛑 RÈGLE TECHNIQUE DÉFINITIVE (PRIORITAIRE SUR TOUT LE RESTE) : " +
                    "Le personnage DOIT ÊTRE PLACÉ SUR UN FOND TOTALEMENT MAGENTA FLUO UNI (#FF00FF). " +
                    "Il est STRICTEMENT INTERDIT de dessiner un décor, un paysage, un intérieur, une ombre au sol ou un dégradé. " +
                    "Même si la description du personnage mentionne un lieu ou des objets environnants, IGNORE LE DÉCOR. " +
                    "Remplis tout l'espace vide autour et derrière le personnage avec du magenta fluo pur. " +
                    "💡 LUMIÈRE : le personnage est éclairé par la lumière naturelle d'un soleil, chaude et franche. " +
                    "Le fond magenta n'est qu'un cache technique, il n'éclaire RIEN : il est STRICTEMENT INTERDIT de faire apparaître " +
                    "des reflets, des liserés, des halos ou des teintes violacés, roses ou magenta sur le personnage lui-même " +
                    "(peau, cheveux, tenue, métal, contours). Ses couleurs sont celles qu'il aurait en plein soleil. " +
                    "Le personnage doit être vu de trois quart, regardant vers la gauche, cadré en plan américain (coupé aux genoux). Ne dessine aucun texte.";

    // LE PAYLOAD (gpt-image-2 + PNG)
    const payloadOpenAI = { model: "gpt-image-2", prompt: promptOpenAI, output_format: "png", n: 1, size: "1024x1792", quality: "medium", moderation: "low" };

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
    const dossier = "PNJ";

    // ÉTAPE 1 : PONT CLOUDINARY (Contourner CORS)
    const signature1 = await genererSignatureCloudinary(`folder=${dossier}&timestamp=${timestamp}${cles.cloudSecret}`);
    const form1 = new FormData();
    form1.append("file", imageSource); form1.append("api_key", cles.cloudKey);
    form1.append("timestamp", timestamp); form1.append("signature", signature1);
    form1.append("folder", dossier);

    let urlSecurisee = imageSource;
    let publicIdAecraser = null;

    try {
        const res1 = await fetch(`https://api.cloudinary.com/v1_1/${cles.cloudName}/image/upload`, { method: "POST", body: form1 });
        const json1 = await res1.json();
        if (json1.secure_url) {
            urlSecurisee = json1.secure_url;
            publicIdAecraser = json1.public_id;
        }
    } catch (e) { }

    // ÉTAPE 2 : DÉTOURAGE MAGIQUE SUR L'IMAGE SÉCURISÉE
    let imageDetoureeBase64 = await detourerFondMagentaPNJ(urlSecurisee);

    // ÉTAPE 3 : UPLOAD FINAL
    let stringToSign2 = publicIdAecraser
        ? "public_id=" + publicIdAecraser + "&timestamp=" + timestamp + cles.cloudSecret
        : "folder=" + dossier + "&timestamp=" + timestamp + cles.cloudSecret;

    const signature2 = await genererSignatureCloudinary(stringToSign2);

    const form2 = new FormData();
    form2.append("file", imageDetoureeBase64);
    form2.append("api_key", cles.cloudKey);
    form2.append("timestamp", timestamp);
    form2.append("signature", signature2);
    if (publicIdAecraser) form2.append("public_id", publicIdAecraser);
    else form2.append("folder", dossier);

    try {
        const resCloud = await fetch(`https://api.cloudinary.com/v1_1/${cles.cloudName}/image/upload`, { method: "POST", body: form2 });
        const jsonCloud = await resCloud.json();
        if (jsonCloud.secure_url) {
            console.log("✅ [MIA_PNJ] Portrait détouré avec succès !");
            return jsonCloud.secure_url.replace("/upload/", "/upload/q_auto,f_auto/");
        }
    } catch (e) { }
    return urlSecurisee || "";
}

// =========================================================================
//  MIA_PNJ (Création procédurale de PNJ nommés avec Détourage)
// =========================================================================

// =========================================================================
//  LES FICHES DES PNJ (v292) : partagées par la préparation d'avant le MJ et
//  le rattrapage d'après (les noms qu'il a inventés lui-même).
// =========================================================================
const MAX_PNJ_PREPARES = 2;   // fiches préparées avant le MJ (sans image)
const MAX_PNJ_RATTRAPES = 3;  // nouveaux noms rattrapés dans sa réponse

// Le même PNJ ? Sans accents ni majuscules ; « Myrto » est « Myrto la Porteuse ».
const sansAccentPNJ = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
function memeNomPNJ(a, b) {
    const x = sansAccentPNJ(a), y = sansAccentPNJ(b);
    if (!x || !y) return false;
    return x === y || x.split(/\s+/)[0] === y.split(/\s+/)[0];
}
// Le nom (ou son prénom, le premier mot) apparaît-il dans le texte, en mot entier ?
function nomCiteDans(nom, texte) {
    const t = sansAccentPNJ(texte);
    const n = sansAccentPNJ(nom);
    if (!n) return false;
    const cherche = (m) => m.length >= 3 && new RegExp("(^|[^a-z0-9])" + m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)").test(t);
    return cherche(n) || cherche(n.split(/\s+/)[0]);
}

// Les races du Grimoire (Monde_Races), Humain en premier.
async function lireRacesConnues() {
    const racesConnues = ["Humain"];
    try {
        const snapRaces = await getDocs(query(collection(db, "Monde_Races")));
        snapRaces.forEach(docSnap => { if (docSnap.data().Nom) racesConnues.push(docSnap.data().Nom); });
    } catch (e) {
        console.warn("[MIA_PNJ] Impossible de lire le Grimoire des Races :", e);
    }
    return racesConnues;
}

// 🛡️ SÉCURITÉ ANTI-HALLUCINATION (Le Videur) : la race choisie par l'IA doit
// exister VRAIMENT, avec l'orthographe exacte du Grimoire ; sinon Humain.
function validerRacePNJ(race, racesConnues) {
    if (!race) return "Humain";
    const trouvee = racesConnues.find(r => sansAccentPNJ(r) === sansAccentPNJ(race));
    if (!trouvee) console.warn(`[MIA_PNJ] L'IA a tenté d'inventer la race '${race}'. Remplacement forcé par 'Humain'.`);
    return trouvee || "Humain";
}

// Range la fiche dans Monde_PNJ, au lieu (ou dans le bâtiment) où elle
// apparaît. Rend son identifiant.
async function enregistrerFichePNJ(pnj, idLieuActuel) {
    const numAleatoire = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
    const nomFormate = pnj.nom.replace(/[^a-zA-Z0-9]/g, "_");
    const docId = `PNJ_${numAleatoire}_${nomFormate}`;
    let idLieuGlobal = ""; let idBatimentGlobal = "";
    if (idLieuActuel && idLieuActuel.startsWith("L")) idLieuGlobal = idLieuActuel;
    else if (idLieuActuel && idLieuActuel.startsWith("B")) {
        idBatimentGlobal = idLieuActuel;
        const bSnap = await getDoc(doc(db, "Monde_Batiment", idLieuActuel));
        if (bSnap.exists()) idLieuGlobal = bSnap.data().ID_Lieu;
    }
    await setDoc(doc(db, "Monde_PNJ", docId), {
        Description_Physique: pnj.physique || "", ID_Batiment: idBatimentGlobal, ID_Lieu: idLieuGlobal,
        Nom_PNJ: pnj.nom, Occupation: pnj.occupation || "", Race: pnj.race || "Humain", Secret_Mental: pnj.secret || "",
        Statut: "Vivant", Style_De_Parole: pnj.style_parole || "", URL_Cloudinary: ""
    });
    return docId;
}

// =========================================================================
//  MIA_CASTING (v292) : AVANT LE MJ, LES VISAGES DONT LA SCÈNE A BESOIN
// =========================================================================
// Nico : « les pnj doivent être créés avant que le mj réponde car il les
// intègre au rp » ; « créer l'image que si le pnj créé est utilisé » ;
// « créer que les pnj qui ont un nom ». Deux fiches au plus, seulement pour
// un personnage NOMMÉ que les joueurs vont aborder. Rien n'est rangé ni peint
// ici : la fiche part au MJ, et elle ne devient un vrai PNJ (fiche en base,
// portrait) que si le MJ cite son nom.
async function preparerNouveauxPNJ(contexteScene, historique4, nomsPnjExistants, nomsHeros) {
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cleGemini) return [];
    const racesConnues = await lireRacesConnues();
    const promptSysteme = `Tu es MIA_CASTING, la directrice de casting d'Ivalis (Antiquité magique, mythologie).
Le Maître du Jeu va répondre aux dernières actions des joueurs. Avant qu'il écrive, décide si la scène a besoin d'un NOUVEAU personnage NOMMÉ.

Prépare une fiche SEULEMENT pour un personnage que les joueurs vont aborder en personne : quelqu'un à qui ils parlent, qu'ils interpellent, qu'ils viennent voir, chez qui ils entrent (l'aubergiste de la taverne où ils entrent, le garde qu'ils questionnent, le marchand dont ils poussent la porte).
JAMAIS de figurants anonymes, de foules, de passants, de groupes. JAMAIS un personnage déjà connu ni un Héros. Deux fiches AU PLUS ; le plus souvent, AUCUNE (liste vide).
UN BLUFF N'EST PAS UN FAIT (v312) : un nom qu'un héros invente pour mentir ou bluffer (« je suis envoyé par le seigneur Untel ») n'existe pas : PAS de fiche pour lui.
IMPORTANCE (v312) : seulement un personnage qui a un minimum d'importance — un rôle à jouer avec les héros (une information, une demande, un marché, un conflit), qu'on reverra sans doute. Un simple paysan, un passant, un serviteur, quelqu'un qu'on croise sans enjeu : PAS de fiche, même s'ils échangent deux mots.
Chaque personnage a un VRAI nom propre, court, antique (un prénom, éventuellement un surnom).
RACES OBLIGATOIRES : ${racesConnues.join(", ")}.

Personnages DÉJÀ connus : ${JSON.stringify(nomsPnjExistants)}.
Héros : ${JSON.stringify(nomsHeros)}.

${contexteScene}`;
    const outils = [{
        functionDeclarations: [{
            name: "preparerPNJ",
            description: "Les fiches des nouveaux personnages nommés dont la scène a besoin (liste vide sinon).",
            parameters: {
                type: "OBJECT",
                properties: {
                    pnjs: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                nom: { type: "STRING" },
                                physique: { type: "STRING", description: "Haut du corps : sexe, âge, visage, coiffure, expression, tenue (textures, couleurs), objets portés." },
                                occupation: { type: "STRING" },
                                race: { type: "STRING" },
                                secret: { type: "STRING" },
                                style_parole: { type: "STRING" },
                                raison: { type: "STRING", description: "Pourquoi les joueurs vont l'aborder maintenant." }
                            }, required: ["nom", "physique", "occupation", "race", "secret", "style_parole"]
                        }
                    }
                }, required: ["pnjs"]
            }
        }]
    }];
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGemini}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: promptSysteme }] },
                contents: [{ role: "user", parts: [{ text: historique4 }] }],
                tools: outils, toolConfig: { functionCallingConfig: { mode: "ANY" } },
                generationConfig: { temperature: 0.9 }
            })
        });
        const data = await res.json();
        const appel = (data.candidates?.[0]?.content?.parts || []).find(p => p.functionCall && p.functionCall.name === "preparerPNJ");
        const fiches = [];
        ((appel && appel.functionCall.args && appel.functionCall.args.pnjs) || []).forEach(f => {
            const nom = String((f && f.nom) || "").trim();
            if (!nom || nomsHeros.some(h => memeNomPNJ(h, nom)) || nomsPnjExistants.some(n => memeNomPNJ(n, nom))) return;
            if (fiches.some(x => memeNomPNJ(x.nom, nom)) || fiches.length >= MAX_PNJ_PREPARES) return;
            fiches.push({ ...f, nom, race: validerRacePNJ(f.race, racesConnues) });
        });
        if (fiches.length) console.log(`[MIA_CASTING] 🎭 ${fiches.map(f => f.nom).join(", ")} prêt(s) à entrer en scène (sans portrait tant que le MJ ne les cite pas).`);
        return fiches;
    } catch (e) {
        console.warn("[MIA_CASTING] Préparation impossible (le MJ improvisera) :", e);
        return [];
    }
}

// Ce que le MJ lit des fiches préparées.
function contexteFichesPreparees(fiches) {
    if (!fiches || !fiches.length) return "";
    let t = `\n--- PERSONNAGES PRÊTS À ENTRER EN SCÈNE ---\n`;
    t += `Si la scène en a besoin, fais-les apparaître avec CE nom exact, ce physique, ce métier et cette façon de parler. N'invente pas un autre nom pour le même rôle. Leur secret guide leur comportement : ne le révèle pas.\n`;
    fiches.forEach(f => {
        t += `- ${f.nom} (${f.race}, ${f.occupation}) — Apparence : ${f.physique} — Parole : ${f.style_parole} — Secret : ${f.secret}\n`;
    });
    return t;
}

// `lieu` : l'identifiant du lieu, ou la promesse de celui que MIA_Batiment
// est en train de trancher (v291 : la recherche des noms n'attend pas le
// bâtiment). `suivi.surNoms(noms)` : les nouveaux venus dès qu'ils sont
// connus ; `suivi.surPortrait(pnj)` : chaque portrait dès qu'il est peint —
// le parchemin attend ces deux signaux quand un nouveau venu prend la parole.
async function analyserNouveauxPNJ(lieu, nomsPnjExistants, nomsHeros, texteMJ, suivi = {}) {
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    let listePNJCrees = []; 
    const signaler = (f, ...args) => { try { if (typeof f === "function") return f(...args); } catch (e) { console.warn("[MIA_PNJ] Suivi :", e); } };
    
    if (!cleGemini || !lieu) { signaler(suivi.surNoms, []); return listePNJCrees; }

    // =========================================================
    // ÉTAPE 1 : LE DÉTECTEUR (Froid, Rapide et Précis à 0.0)
    // =========================================================
    const promptDetection = `Tu es l'IA de casting d'Ivalis.
Voici les personnages DEJA connus : ${JSON.stringify(nomsPnjExistants)}.
Voici les Héros : ${JSON.stringify(nomsHeros)}.

Lis le texte du Maître du Jeu. Y a-t-il de NOUVEAUX personnages expressément NOMMÉS (VRAI prénom ou nom propre de personne) qui viennent d'apparaître ?
Règles : Ignore les descriptions génériques ("un garde", "le tavernier", "la prêtresse"), les titres seuls, les foules, les dieux et les lieux. Ne liste JAMAIS les Héros. Trois noms au plus.
IMPORTANCE (v312) : ne liste un nom que si ce personnage COMPTE dans la scène — il parle avec les héros ou agit envers eux, il a un rôle à jouer (une information, une demande, un marché, un conflit, une menace), on risque de le revoir. Un figurant nommé au passage (un paysan, un passant, un serviteur, un client de taverne, un enfant qui court) : NE LE LISTE PAS.
Si oui, utilise l'outil 'signalerNoms' pour lister leurs prénoms. Sinon, liste vide.`;

    const outilsDetection = [{
        functionDeclarations: [{
            name: "signalerNoms",
            description: "Liste les prénoms des nouveaux PNJ détectés.",
            parameters: {
                type: "OBJECT",
                properties: { noms: { type: "ARRAY", items: { type: "STRING" } } },
                required: ["noms"]
            }
        }]
    }];

    let nouveauxNomsDetectes = [];

    try {
        const resDet = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGemini}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: promptDetection }] },
                contents: [{ role: "user", parts: [{ text: texteMJ }] }],
                tools: outilsDetection, 
                toolConfig: { functionCallingConfig: { mode: "AUTO" } },
                generationConfig: { temperature: 0.0 } // 🔻 Température FROIDE pour la détection
            })
        });

        const dataDet = await resDet.json();
        const appelsDet = dataDet.candidates?.[0]?.content?.parts?.filter(p => p.functionCall).map(p => p.functionCall);
        
        if (appelsDet && appelsDet.length > 0 && appelsDet[0].name === "signalerNoms") {
            nouveauxNomsDetectes = appelsDet[0].args.noms || [];
        }
    } catch (e) { console.error("Erreur Détection PNJ:", e); signaler(suivi.surNoms, []); return listePNJCrees; }

    // Filtrage de sécurité (au cas où il remet un héros ou un PNJ déjà connu).
    // Trois nouveaux venus au plus par réponse (v292 : chacun coûte un portrait).
    const dejaConnu = (nom) => nomsHeros.includes(nom) || nomsPnjExistants.some(n => memeNomPNJ(n, nom));
    nouveauxNomsDetectes = [...new Set(nouveauxNomsDetectes.map(n => String(n || "").trim()).filter(Boolean))]
        .filter(nom => !dejaConnu(nom)).slice(0, MAX_PNJ_RATTRAPES);
    signaler(suivi.surNoms, nouveauxNomsDetectes.slice());

    // 🛑 SI AUCUN NOUVEAU PNJ N'EST DÉTECTÉ, ON S'ARRÊTE ICI ! 🛑
    if (nouveauxNomsDetectes.length === 0) {
        return listePNJCrees;
    }

    // Le lieu où ranger leurs fiches (MIA_Batiment a pu les faire entrer quelque part).
    const idLieuActuel = await Promise.resolve(lieu).catch(() => null);
    if (!idLieuActuel) return listePNJCrees;

    const racesConnues = await lireRacesConnues();

    // =========================================================
    // ÉTAPE 2 : LE CRÉATEUR (Chaud, Aléatoire et Créatif)
    // =========================================================
    const temperatureAleatoire = parseFloat((Math.random() * (1.20 - 0.80) + 0.80).toFixed(2));
    console.log(`[MIA_PNJ] 🎲 ${nouveauxNomsDetectes.length} nouveau(x) PNJ détecté(s) ! Forge créative à ${temperatureAleatoire}°C...`);

    const promptCreation = `Tu es MIA_PNJ, le forgeron d'âmes.
Tu dois inventer les fiches détaillées de ces nouveaux personnages : ${JSON.stringify(nouveauxNomsDetectes)}.
RACES OBLIGATOIRES À UTILISER DANS CET UNIVERS : ${racesConnues.join(", ")}. Tu dois choisir l'une de ces races pour chaque personnage.
Assure-toi que tous les éléments de la fiche sont cohérents entre eux et adaptés à l'univers Antique Fantastique (Antiquité magique, mythologie).
ÉQUIPEMENT DE L'ANTIQUITÉ SEULEMENT (v312) : lances, glaives, épées courtes, haches, arcs, frondes, javelots, boucliers, cuirasses de bronze ou de lin, tuniques, capes. JAMAIS d'arbalète, d'arme à feu, d'armure de plaques, de heaume médiéval.
Utilise l'outil 'creerNouveauxPNJ' pour générer leurs fiches.`;

    const outilsCreation = [{
        functionDeclarations: [{
            name: "creerNouveauxPNJ",
            description: "Créer les fiches des NOUVEAUX PNJ.",
            parameters: {
                type: "OBJECT",
                properties: {
                    pnjs: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                nom: { type: "STRING" },
                                physique: { 
                                    type: "STRING", 
                                    description: "Description focalisée sur le haut du corps : Sexe, Âge, Visage détaillé, Coiffure, Expression, Haut de la tenue (textures et couleurs), Armes ou objets portés à la ceinture ou dans le dos. Expression, Vêtements (préciser les matières comme le cuir ou l'acier et les couleurs dominantes), Accessoires, Signes distinctifs (cicatrices, tatouages, bijoux, accessoires)." 
                                },
                                occupation: { type: "STRING" },
                                race: { type: "STRING" },
                                secret: { type: "STRING" },
                                style_parole: { type: "STRING" }
                            }, required: ["nom", "physique", "occupation", "race", "secret", "style_parole"]
                        }
                    }
                }, required: ["pnjs"]
            }
        }]
    }];

    try {
        const resCrea = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGemini}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: promptCreation }] },
                contents: [{ role: "user", parts: [{ text: texteMJ }] }],
                tools: outilsCreation, 
                toolConfig: { functionCallingConfig: { mode: "ANY" } }, 
                generationConfig: { temperature: temperatureAleatoire } 
            })
        });

        const dataCrea = await resCrea.json();
        const appelsCrea = dataCrea.candidates?.[0]?.content?.parts?.filter(p => p.functionCall).map(p => p.functionCall);
        
        if (appelsCrea && appelsCrea.length > 0 && appelsCrea[0].name === "creerNouveauxPNJ") {
            // Seulement les noms détectés, trois au plus (pas de bonus inventé par la forge).
            const nouveauxPNJs = (appelsCrea[0].args.pnjs || [])
                .filter(pnj => pnj && pnj.nom && nouveauxNomsDetectes.some(n => memeNomPNJ(n, pnj.nom)))
                .slice(0, MAX_PNJ_RATTRAPES);
            
            // Les portraits se peignent EN MÊME TEMPS (v291) : chacun est posé
            // dans le récit dès qu'il est prêt.
            await Promise.all(nouveauxPNJs.map(async (pnj) => {
                if (!pnj || !pnj.nom || nomsHeros.includes(pnj.nom)) return; 

                pnj.race = validerRacePNJ(pnj.race, racesConnues);
                const docId = await enregistrerFichePNJ(pnj, idLieuActuel);

                // On transmet la race (maintenant 100% sécurisée) au générateur d'image !
                const urlImage = await genererEtStockerImagePNJ(pnj.physique, pnj.race);
                if (urlImage) await updateDoc(doc(db, "Monde_PNJ", docId), { URL_Cloudinary: urlImage });

                const cree = { Nom_PNJ: pnj.nom, URL_Cloudinary: urlImage || "" };
                listePNJCrees.push(cree);
                if (urlImage) await signaler(suivi.surPortrait, cree);
            }));
        }
    } catch (e) { console.error("Erreur Création PNJ:", e); }
    
    return listePNJCrees; 
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

// L'IDENTIFIANT PUBLIC D'UNE IMAGE, ET UNE SEULE FAÇON DE LE LIRE.
//
// Une même image se présente sous plusieurs URL : avec ou sans transformations
// (`q_auto,f_auto`), avec ou sans numéro de version (`v1789...`). C'est le même
// fichier hébergé, et c'est cet identifiant-là qui le dit. Il sert à DEUX
// choses — effacer l'image, et savoir si elle est encore utilisée ailleurs
// (voir imagesEncoreUtilisees, loot.js). Deux lectures différentes de la même
// URL, et le ménage effacerait une image encore portée par quelqu'un.
//
// UNE TRANSFORMATION SEULE N'EST PAS UN DOSSIER, et c'est ce qui clochait.
// L'ancienne lecture ne reconnaissait une transformation qu'à sa VIRGULE :
// `q_auto,f_auto` était bien écarté, mais `q_auto` tout seul se retrouvait dans
// le chemin, et l'identifiant devenait « q_auto/mon_image ». La suppression ne
// trouvait alors rien à effacer, en silence — ça ne s'est jamais vu parce que
// le jeu écrit toujours ses URL avec les deux transformations à la fois. Le
// ménage, lui, compare des URL venues d'un peu partout : il lui faut la vraie
// règle, pas celle qui marche par chance.
//
// ON NE RETIRE QUE LES SEGMENTS DE TÊTE, et c'est ce qui rend la règle sûre.
// Une URL Cloudinary s'écrit `/upload/<transformations>/<version>/<identifiant>` :
// les transformations ne viennent JAMAIS après. Un filtre appliqué à tous les
// segments se trompait de cible — `avatar_habille.png` a exactement la forme
// d'une transformation (une clé, un tiret bas, une valeur), et se faisait
// effacer du chemin ; l'identifiant devenait vide, et l'image survivait.
//
// Les clés de transformation tiennent en une à trois lettres (`w_2400`,
// `c_limit`, `q_auto`, `dpr_2`) : un nom de fichier n'a pas cette forme, et un
// point suffit d'ailleurs à le trahir.
const estTransformationCloudinary = (seg) =>
    !seg.includes('.') && seg.split(',').every(part => /^[a-z]{1,3}_[^,/]+$/.test(part));

function idPublicCloudinary(urlImage) {
    if (!urlImage) return "";
    const parts = String(urlImage).split('/upload/');
    if (parts.length < 2) return "";
    const segments = parts[1].split('/').filter(Boolean);
    while (segments.length > 1
           && (estTransformationCloudinary(segments[0]) || /^v\d+$/.test(segments[0]))) {
        segments.shift();
    }
    const cheminComplet = segments.join('/').split('?')[0];   // Ex: "PNJ/mon_image.webp"
    const point = cheminComplet.lastIndexOf('.');
    return point > 0 ? cheminComplet.substring(0, point) : cheminComplet;  // Ex: "PNJ/mon_image"
}
window.idPublicCloudinary = idPublicCloudinary;

async function supprimerImageCloudinary(urlImage) {
    if (!urlImage) return;
    const cles = {
        cloudName: localStorage.getItem("ivalis_CLOUDINARY_CLOUD_NAME")?.trim(),
        cloudKey: localStorage.getItem("ivalis_CLOUDINARY_API_KEY")?.trim(),
        cloudSecret: localStorage.getItem("ivalis_CLOUDINARY_API_SECRET")?.trim()
    };
    if (!cles.cloudName || !cles.cloudKey || !cles.cloudSecret) return;

    try {
        // 1. Isoler l'ID public depuis l'URL Cloudinary
        const publicId = idPublicCloudinary(urlImage);
        if (!publicId) return;

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

// NOUVEAU : On exporte la fonction pour que la Fiche Personnage puisse s'en servir !
window.supprimerImageCloudinary = supprimerImageCloudinary;

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

    // NOUVEAU : On passe à l'Antique Fantastique et on ajoute des exemples architecturaux
    const promptOpenAI = `DIRECTIVE DE STYLE VISUEL OBLIGATOIRE : ${instructionStyle}\n\n---\nSujet à dessiner : Un paysage d'Antique Fantastique (Mythic Ancient Fantasy, architecture antique, temples de marbre, ruines mythologiques). ABSOLUMENT AUCUN PERSONNAGE, aucun humain, aucune créature, aucun animal. Uniquement de l'environnement, du paysage et de l'architecture (cité antique, village, grotte, nature, etc.). Ne dessine aucun texte. Description de la région : ${promptLieu}`;

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
    
    // NOUVEAU PROMPT : Force un symbole ultra-minimaliste, isolé au centre, sans fond ni cadre.
    const promptOpenAI = `A single, tiny, extremely minimalist map symbol representing: ${nomLieu}. 
    STYLE OBLIGATOIRE: Crude ink doodle, stencil style. Only 3 or 4 thick black lines. 
    CRITICAL: The symbol MUST be completely isolated in the exact center of the image. Leave massive empty transparent space around it. DO NOT draw any background. DO NOT draw a square or a frame. DO NOT draw a full landscape. Just a single floating abstract sketch. No shading, no small details.`;

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

// (v275) MIA_CARTO, qui inventait un lieu à chaque arrivée sur une case de la
// grille, n'existe plus : le groupe voyage sur les cartes (voyage_groupe.js).
// Ses peintres servent aux lieux découverts en voyage (v277, poi_creation.js).
window.genererImageLieu = genererEtStockerImageLieu;
// Le lieu où se tiennent les héros, ses bâtiments et ses PNJ (v278 : le lieu
// du combat, les ennemis qu'on y affronte).
window.preparerEnvironnementMJ = preparerEnvironnement;
window.genererImageBatiment = genererEtStockerImageBatiment;

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
    overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: var(--app-h); background: rgba(0, 0, 0, 0.85); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 9999; backdrop-filter: blur(5px);`;
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

// LE CERVEAU DU NARRATEUR (v291). Nico : « met moi Gemini 3.8 Flash en
// réflexion moyenne, avec possibilité dans paramètre de mettre en low la
// réflexion. Ou de changer pour essayer Argon. » Les deux réglages vivent dans
// Paramètres > Outils > Réglages du narrateur. Flash-Lite (l'ancien narrateur)
// reste au choix, et c'est lui qui reprend la main si le modèle choisi est
// refusé (nom inconnu, pas de forfait payant pour Argon…) : la partie ne
// reste jamais muette.
const MODELE_NARRATEUR_DEFAUT = "gemini-3.8-flash";
const MODELE_NARRATEUR_SECOURS = "gemini-flash-lite-latest";
window.MODELES_NARRATEUR = [
    { id: "gemini-3.8-flash", nom: "Gemini 3.8 Flash (conseillé)", reflexion: true },
    { id: "gemini-4-argon", nom: "Gemini 4 Argon (plus beau style, payant, plus lent)", reflexion: true },
    { id: "gemini-flash-lite-latest", nom: "Gemini Flash-Lite (l'ancien, le plus rapide)", reflexion: false }
];
window.reglagesNarrateur = function () {
    let modele = "", reflexion = "";
    try { modele = localStorage.getItem("ivalis_MJ_MODELE") || ""; reflexion = localStorage.getItem("ivalis_MJ_REFLEXION") || ""; } catch (e) {}
    if (!window.MODELES_NARRATEUR.some(m => m.id === modele)) modele = MODELE_NARRATEUR_DEFAUT;
    if (reflexion !== "low") reflexion = "medium";
    return { modele, reflexion };
};

// Le corps de la requête pour un modèle : la réflexion n'est demandée qu'aux
// modèles qui en ont une (Flash-Lite n'en a pas).
function corpsNarrateur(base, modele, reflexion) {
    const fiche = window.MODELES_NARRATEUR.find(m => m.id === modele);
    const generationConfig = { ...base.generationConfig };
    if (fiche && fiche.reflexion) generationConfig.thinkingConfig = { thinkingLevel: reflexion };
    return JSON.stringify({ ...base, generationConfig });
}

// Le texte d'un morceau de réponse, sans les pensées du modèle.
const texteDesParts = (data) => ((data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [])
    .filter(p => typeof p.text === "string" && !p.thought).map(p => p.text).join("");

// UN APPEL EN FLUX : la réponse arrive morceau par morceau (`alt=sse`) et
// `surTexte(texteJusquIci)` est appelé à chaque morceau. Une réponse d'un seul
// bloc (JSON) est acceptée aussi. Rend { texte, tokens } ; une erreur HTTP
// porte son statut (`e.statut`).
async function appelNarrateurEnFlux(modele, corps, cle, surTexte) {
    const reponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modele}:streamGenerateContent?alt=sse&key=${cle}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: corps
    });
    if (!reponse.ok) {
        let message = `Erreur: ${reponse.status}`;
        try { const d = await reponse.json(); if (d && d.error && d.error.message) message = d.error.message; } catch (e) {}
        const err = new Error(message); err.statut = reponse.status; throw err;
    }
    let texte = "", tokens = 0, usage = null;
    const lireMorceau = (data) => {
        if (!data) return;
        if (data.error) { const err = new Error(data.error.message || "Erreur"); err.statut = data.error.code; throw err; }
        const t = texteDesParts(data);
        if (data.usageMetadata) usage = data.usageMetadata;
        if (data.usageMetadata && data.usageMetadata.totalTokenCount) tokens = data.usageMetadata.totalTokenCount;
        if (t) { texte += t; if (surTexte) surTexte(texte); }
    };
    const type = reponse.headers.get("content-type") || "";
    if (!/event-stream/.test(type) || !reponse.body || !reponse.body.getReader) {
        const brut = await reponse.text();
        let data = null;
        try { data = JSON.parse(brut); } catch (e) {
            brut.split(/\r?\n/).filter(l => l.startsWith("data:")).forEach(l => { try { lireMorceau(JSON.parse(l.slice(5))); } catch (err) { if (err.statut) throw err; } });
            return { texte, tokens, usage };
        }
        (Array.isArray(data) ? data : [data]).forEach(lireMorceau);
        return { texte, tokens, usage };
    }
    const lecteur = reponse.body.getReader();
    const decodeur = new TextDecoder();
    let tampon = "";
    for (;;) {
        const { done, value } = await lecteur.read();
        if (value) tampon += decodeur.decode(value, { stream: true });
        let fin;
        while ((fin = tampon.indexOf("\n")) >= 0) {
            const ligne = tampon.slice(0, fin).trim();
            tampon = tampon.slice(fin + 1);
            if (ligne.startsWith("data:")) {
                let data = null;
                try { data = JSON.parse(ligne.slice(5)); } catch (e) {}
                lireMorceau(data);
            }
        }
        if (done) break;
    }
    if (tampon.trim().startsWith("data:")) { try { lireMorceau(JSON.parse(tampon.trim().slice(5))); } catch (e) { if (e.statut) throw e; } }
    return { texte, tokens, usage };
}

// `surTexte(texteJusquIci)` (v291) : le texte du MJ au fil de son écriture,
// pour ouvrir le parchemin avant la fin. Une fois qu'un morceau est parti, on
// ne recommence plus : en cas de coupure, le récit s'arrête là où il en est.
async function genererReponseNarrateur(contexteFormate, historiqueComplet, maxTentatives = 3, surTexte = null) {
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cleGemini) return null;

    const temperatureIA = parseFloat(localStorage.getItem("ivalis_IA_TEMPERATURE")) || 1.0;

    // Le cerveau du Narrateur : celui de la base (Paramètres, INST_10895) s'il
    // existe, sinon celui du livre (v300, PROMPT_NARRATEUR_LIVRE).
    let instructionMJ = PROMPT_NARRATEUR_LIVRE;
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

    const reglages = window.reglagesNarrateur();
    let modele = reglages.modele;
    let dejaEnvoye = false, texteRecu = "";
    // (v312) Les deux clés : la seconde prend le relais d'une première à court
    // de crédit ou de quota (402, 429, 503), comme pour les autres IA.
    const cles = typeof window.clesGeminiPour === "function" ? window.clesGeminiPour() : [cleGemini];
    let iCle = 0;
    const relais = surTexte ? (t) => { dejaEnvoye = true; texteRecu = t; surTexte(t); } : null;

    for (let tentative = 1; tentative <= maxTentatives; tentative++) {
        try {
            console.log(`✍️ [Narrateur] ${modele} (réflexion ${reglages.reflexion}) — tentative ${tentative}/${maxTentatives}`);
            const { texte, tokens, usage } = await appelNarrateurEnFlux(modele, corpsNarrateur(bodyRequete, modele, reglages.reflexion), cles[iCle] || cleGemini, relais);
            // Les dépenses du tour (v293, depenses_ia.js) : ce que le narrateur a lu et écrit.
            if (usage && window.DEPENSES_IA) window.DEPENSES_IA.noterNarrateur(null, modele, usage);
            if (!texte.trim()) throw new Error("réponse vide");
            if (typeof window.ajouterTokens === "function") window.ajouterTokens(tokens);
            return texte;
        } catch (erreur) {
            console.warn(`⚠️ [Narrateur] Échec tentative ${tentative} (${modele}) :`, erreur.message);
            if (!dejaEnvoye && [402, 429, 503].includes(erreur.statut) && iCle < cles.length - 1) {
                iCle++;
                console.warn(`[Narrateur] Clé ${iCle} refusée (${erreur.statut}) : la clé ${iCle + 1} prend le relais.`);
                tentative--;
                continue;
            }
            // Le modèle choisi est refusé (inconnu, réservé au forfait payant,
            // quota épuisé) : Flash-Lite prend le relais, sans attendre.
            if (!dejaEnvoye && modele !== MODELE_NARRATEUR_SECOURS && [400, 403, 404, 429].includes(erreur.statut)) {
                console.warn(`[Narrateur] ${modele} refusé (${erreur.statut}) : ${MODELE_NARRATEUR_SECOURS} prend le relais.`);
                modele = MODELE_NARRATEUR_SECOURS;
                tentative--;
                continue;
            }
            if (dejaEnvoye) return texteRecu;
            // (v312) Une coupure réseau (sans statut : « Failed to fetch »,
            // ERR_QUIC_PROTOCOL_ERROR…) : le navigateur repasse par une autre
            // connexion ; on relance presque aussitôt plutôt qu'après 4 s.
            if (tentative < maxTentatives) await new Promise(resolve => setTimeout(resolve, erreur.statut ? 4000 : 400));
            else return `*Le grimoire refuse de s'ouvrir... (${erreur.message}).*`;
        }
    }
}

// LE TEXTE DU MJ TEL QU'IL S'AFFICHE : les noms des PNJ connus deviennent
// des étiquettes (avec leur portrait au survol, et dans le parchemin quand ils
// parlent). `pnjs` : nom -> fiche (URL_Cloudinary). Les plus longs d'abord.
function formaterTexteMJ(texteBrut, pnjs) {
    let texteAffiche = String(texteBrut || "").replace(/\*\*/g, "");
    const regexSansAccent = (texte) => {
        return texte.replace(/[aAàâäÀÂÄ]/g, '[aAàâäÀÂÄ]').replace(/[eEéèêëÉÈÊË]/g, '[eEéèêëÉÈÊË]')
                    .replace(/[iIîïÎÏ]/g, '[iIîïÎÏ]').replace(/[oOôöÔÖ]/g, '[oOôöÔÖ]')
                    .replace(/[uUùûüÙÛÜ]/g, '[uUùûüÙÛÜ]').replace(/[cCçÇ]/g, '[cCçÇ]');
    };
    Object.keys(pnjs || {}).sort((a, b) => b.length - a.length).forEach(nom => {
        const pnj = pnjs[nom];
        if (!pnj) return;
        let safeNom = nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        safeNom = regexSansAccent(safeNom);
        const regex = new RegExp("(?<=^|[^a-zA-ZÀ-ÿ])" + safeNom + "(?=[^a-zA-ZÀ-ÿ]|$)(?![^<]*>)", "gi");
        if (pnj.URL_Cloudinary && pnj.URL_Cloudinary !== "") {
            texteAffiche = texteAffiche.replace(regex, `<span class="pnj-chat-hover"><strong>$&</strong><img src="${pnj.URL_Cloudinary}" class="pnj-hover-img"></span>`);
        } else {
            texteAffiche = texteAffiche.replace(regex, `<strong style="color: #e8d5a5;">$&</strong>`);
        }
    });
    return texteAffiche.replace(/\n/g, "<br>");
}

// =========================================================================
//  L'ARBITRE DES DÉS (v295) — MIA_DES
// =========================================================================
// Nico : « quand on cliquera sur MJ, une IA hyper rapide analyse juste les
// derniers messages des joueurs et dit si oui ou non il faut un lancer de
// dés suite à l'action d'un joueur. Si non, ça lance le MJ narrateur. Si
// oui, elle dit aux joueurs concernés quel lancer faire. »
//
// Au clic sur MJ, avant tout le reste :
//   1. un jet demandé et pas encore lancé ? on prévient (et on peut lancer
//      le MJ quand même) ;
//   2. les actions des héros écrites depuis la dernière demande de jets (ou
//      la dernière narration) partent à MIA_DES (Flash-Lite, sans réflexion,
//      température 0) ;
//   3. des jets à faire : « l'Arbitre des dés » les annonce dans le chat
//      (Jets_Demandes), et le MJ ne parle pas ; les joueurs lancent leurs
//      dés quand ils veulent (pas de nouveau tour de parole, v296), puis
//      relancent le MJ ; aucun jet : le narrateur part aussitôt.
// Le narrateur lit ensuite les demandes et les résultats dans l'historique.
const AUTEUR_ARBITRE = { Auteur_ID: "ARBITRE_DES", Auteur_Nom: "Arbitre des dés", Auteur_Couleur: "#d4af37" };
const CARACS_ARBITRE = [
    { nom: "FORCE", usage: "soulever, pousser, enfoncer, briser, escalader, nager, porter, retenir, bras de fer" },
    { nom: "DEXTÉRITÉ", usage: "sauter, esquiver un piège, acrobaties, équilibre, discrétion, se cacher, crocheter, escamoter, voler à la tire, viser juste hors combat" },
    { nom: "CONSTITUTION", usage: "endurance, marche forcée, retenir son souffle, résister au poison, à la maladie, au froid, à la faim, à l'alcool, à la douleur" },
    { nom: "INTELLIGENCE", usage: "se souvenir, arcanes et magie, histoire, religion, nature, enquêter, fouiller avec méthode, déchiffrer, résoudre une énigme" },
    { nom: "SAGESSE", usage: "percevoir (voir, entendre, repérer), deviner une intention ou un mensonge, soigner, survivre dans la nature, pister, calmer ou dresser un animal" },
    { nom: "CHARISME", usage: "persuader, intimider, mentir, bluffer, séduire, marchander, se produire en public, mener une foule" }
];
const DIFFICULTES_ARBITRE = ["facile", "moyenne", "difficile", "très difficile", "héroïque"];
const DELAI_ARBITRE_MS = 20000;
// v304 : Nico, « l'IA qui détermine les lancers de dés semble ne pas
// fonctionner : j'ai fait plein d'actions qui mériteraient des lancers ». Sa
// consigne la poussait à refuser (« liste vide : le cas le plus fréquent ») ;
// elle penche maintenant vers le jet, et c'est le modèle du Narrateur
// (Gemini 3.8 Flash, réflexion basse) qui arbitre — Flash-Lite s'il est refusé.
const MODELE_ARBITRE = "gemini-3.8-flash", MODELE_ARBITRE_SECOURS = "gemini-flash-lite-latest";

const sansBalises = (t) => String(t || "").replace(/<[^>]+>/g, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
const estJetDeDes = (m) => /^🎲 Jet de /.test(sansBalises(m.Texte));
const caracDuJet = (m) => ((sansBalises(m.Texte).match(/^🎲 Jet de (.+?) pour /) || [])[1] || "").trim();
const normCarac = (c) => String(c || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

// Où en est le tour : les messages depuis la dernière narration, les jets
// demandés par l'Arbitre, ceux qui ont été lancés, ceux qui manquent, et les
// actions des héros pas encore arbitrées.
function etatDesJets(messages, heros) {
    const liste = (messages || []).slice().sort((a, b) => (a.Timestamp || 0) - (b.Timestamp || 0));
    let debut = -1;
    liste.forEach((m, i) => { if (m.Est_Narration_IA) debut = i; });
    const depuis = liste.slice(debut + 1);
    const idsHeros = new Set((heros || []).map(h => h.idPersonnage));
    const demandes = [];
    let derniereDemande = -1;
    depuis.forEach((m, i) => {
        if (m.Auteur_ID === AUTEUR_ARBITRE.Auteur_ID) {
            derniereDemande = i;
            (m.Jets_Demandes || []).forEach(j => demandes.push({ ...j, t: m.Timestamp || 0 }));
        }
    });
    const jets = depuis.filter(m => idsHeros.has(m.Auteur_ID) && estJetDeDes(m));
    const manquants = demandes.filter(d => !jets.some(j => j.Auteur_ID === d.idPerso && (j.Timestamp || 0) >= d.t
        && (!d.caracteristique || normCarac(caracDuJet(j)) === normCarac(d.caracteristique))));
    const actions = depuis.slice(derniereDemande + 1).filter(m => idsHeros.has(m.Auteur_ID) && !estJetDeDes(m) && sansBalises(m.Texte));
    const narration = debut >= 0 ? liste[debut] : null;
    return { demandes, jets, manquants, actions, narration };
}

// MIA_DES : faut-il un jet de dé pour une de ces actions ?
async function demanderArbitreDes(etat, heros) {
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cleGemini) return [];
    const promptSysteme = `Tu es MIA_DES, l'arbitre des dés d'Ivalis, un jeu de rôle d'Antiquité fantastique. Tu ne racontes rien : tu décides seulement si les actions que les joueurs viennent d'écrire demandent un jet de caractéristique (1d20 + modificateur), et lequel.

LES SIX CARACTÉRISTIQUES ET CE QU'ELLES COUVRENT :
${CARACS_ARBITRE.map(c => `- ${c.nom} : ${c.usage}.`).join("\n")}
Une même intention passe par des caractéristiques différentes selon la MANIÈRE : forcer une porte = FORCE ; la crocheter = DEXTÉRITÉ ; convaincre le garde de l'ouvrir = CHARISME ; trouver le mécanisme caché = INTELLIGENCE (fouille méthodique) ou SAGESSE (repérer d'un coup d'œil).

DEMANDE UN JET dès qu'un héros TENTE maintenant quelque chose dont l'issue n'est pas acquise et qui compte pour la suite : se cacher, se faufiler, filer quelqu'un, escalader, sauter, nager, forcer, soulever, crocheter, voler, désamorcer ; convaincre, mentir, bluffer, intimider, séduire, marchander, calmer quelqu'un ; fouiller, chercher un indice, repérer un danger, écouter aux portes, pister, deviner une intention ou un mensonge ; soigner, résister au froid, au poison, à la fatigue ; se souvenir d'un savoir, déchiffrer, comprendre une magie.
Un jeu de rôle vit de ses dés : DANS LE DOUTE, DEMANDE UN JET.
PAS DE JET seulement pour : parler sans chercher à obtenir quelque chose, poser une question, se déplacer sans danger, regarder autour de soi sans rien chercher de précis, acheter au prix affiché, ouvrir une porte ordinaire, tout ce qui est vraiment banal (ça réussit) ; et ce qui est franchement impossible (ça échoue, le MJ le racontera).
JAMAIS DE JET POUR UN COMBAT : si un héros attaque, frappe, tire sur quelqu'un ou lance un sort offensif, ne demande rien (le jeu a son combat tactique).
JAMAIS DEUX FOIS : une action déjà arbitrée ou un jet déjà lancé ne redemande rien.
Un seul jet par héros, et seulement pour les héros qui ont écrit une action.

LA DIFFICULTÉ (dis le mot) :
- facile : à la portée de presque tous, mais un échec est possible (escalader un muret, convaincre un ami).
- moyenne : il faut du savoir-faire (crocheter une serrure simple, passer devant un garde distrait).
- difficile : un vrai défi (escalader une falaise humide, mentir à un juge soupçonneux).
- très difficile : seuls les meilleurs y parviennent (crocheter le coffre d'un archimage, nager dans un torrent en crue).
- héroïque : à la limite du possible (sauter d'un toit à l'autre au-dessus d'une rue large).
Tiens compte du contexte : la réputation, l'état des lieux, l'aide d'un autre héros (une difficulté de moins), la précipitation ou le danger (une de plus).

Réponds avec l'outil 'deciderJets'. Liste vide seulement si aucune action ne mérite de jet.`;
    const nomsHeros = heros.map(h => h.prenom);
    const texte = [
        etat.narration ? `DERNIÈRE NARRATION DU MAÎTRE DU JEU :\n${sansBalises(etat.narration.Texte).slice(-1500)}` : "DERNIÈRE NARRATION DU MAÎTRE DU JEU : (aucune)",
        etat.demandes.length ? `JETS DÉJÀ DEMANDÉS CE TOUR (ne pas redemander) :\n${etat.demandes.map(d => `- ${d.heros} : ${d.caracteristique} (${d.action || ""})`).join("\n")}` : "",
        `HÉROS : ${nomsHeros.join(", ")}`,
        `ACTIONS DES JOUEURS À ARBITRER :\n${etat.actions.map(m => `${m.Auteur_Nom} : ${sansBalises(m.Texte)}`).join("\n")}`
    ].filter(Boolean).join("\n\n");
    const outils = [{
        functionDeclarations: [{
            name: "deciderJets",
            description: "Les jets de caractéristique à faire (liste vide si aucun).",
            parameters: {
                type: "OBJECT",
                properties: {
                    jets: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                heros: { type: "STRING", description: "Le prénom du héros, tel qu'il est écrit dans la liste des héros." },
                                caracteristique: { type: "STRING", description: "FORCE, DEXTÉRITÉ, CONSTITUTION, INTELLIGENCE, SAGESSE ou CHARISME." },
                                difficulte: { type: "STRING", description: "facile, moyenne, difficile, très difficile ou héroïque." },
                                action: { type: "STRING", description: "Ce qu'il tente, en quelques mots (« enfoncer la porte »)." }
                            }, required: ["heros", "caracteristique", "difficulte", "action"]
                        }
                    }
                }, required: ["jets"]
            }
        }]
    }];
    // v312 — Nico : « l'IA qui scanne s'il faut des lancers de dés est cassée : pas
    // une seule fois elle ne m'a demandé un lancer avant que le narrateur continue ».
    // Elle n'avait qu'une clé (la première, sans relais vers la seconde), un seul
    // essai de 20 s, et ne se rabattait sur Flash-Lite que pour quelques refus :
    // un délai, une coupure (ERR_QUIC_PROTOCOL_ERROR), un crédit épuisé (402), une
    // réponse sans appel d'outil… et elle se taisait (« aucun jet »). Maintenant :
    // les deux clés (window.fetchGemini), un premier essai court, puis Flash-Lite
    // sans réflexion sur n'importe quel échec ; une réponse en texte JSON est lue
    // aussi ; chaque échec est écrit dans la console.
    const corps = (modele) => JSON.stringify({
        systemInstruction: { parts: [{ text: promptSysteme }] },
        contents: [{ role: "user", parts: [{ text: texte }] }],
        tools: outils, toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["deciderJets"] } },
        generationConfig: modele === MODELE_ARBITRE ? { temperature: 0, thinkingConfig: { thinkingLevel: "low" } } : { temperature: 0 }
    });
    const essayer = async (modele, delai) => {
        const controle = typeof AbortController === "function" ? new AbortController() : null;
        const minuteur = controle ? setTimeout(() => controle.abort(), delai) : null;
        try {
            const rep = typeof window.fetchGemini === "function"
                ? await window.fetchGemini("arbitre", corps(modele), { modele, signal: controle ? controle.signal : undefined })
                : await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modele}:generateContent?key=${cleGemini}`, {
                    method: "POST", headers: { "Content-Type": "application/json" }, signal: controle ? controle.signal : undefined, body: corps(modele) });
            if (!rep.ok) throw new Error(`${modele} : statut ${rep.status}`);
            const data = await rep.json();
            const parts = (data.candidates?.[0]?.content?.parts) || [];
            const appel = parts.find(p => p.functionCall && p.functionCall.name === "deciderJets");
            if (appel) return (appel.functionCall.args && appel.functionCall.args.jets) || [];
            // Pas d'appel d'outil : une réponse en JSON, peut-être.
            const brut = parts.filter(p => typeof p.text === "string" && !p.thought).map(p => p.text).join("");
            const m = brut.match(/\{[\s\S]*\}/);
            if (m) { const j = JSON.parse(m[0]); if (Array.isArray(j.jets)) return j.jets; }
            throw new Error(`${modele} : réponse sans décision`);
        } finally { if (minuteur) clearTimeout(minuteur); }
    };
    try {
        let bruts;
        try { bruts = await essayer(MODELE_ARBITRE, DELAI_ARBITRE_MS * 0.6); }
        catch (e1) {
            console.warn(`[MIA_DES] ${e1 && e1.name === "AbortError" ? MODELE_ARBITRE + " : trop long" : (e1 && e1.message || e1)} — ${MODELE_ARBITRE_SECOURS} arbitre.`);
            bruts = await essayer(MODELE_ARBITRE_SECOURS, DELAI_ARBITRE_MS * 0.5);
        }
        // Seulement des héros qui ont agi, des caractéristiques qui existent,
        // une difficulté connue, un jet par héros.
        const auteurs = new Set(etat.actions.map(m => m.Auteur_ID));
        const jets = [];
        (Array.isArray(bruts) ? bruts : []).forEach(j => {
            const h = heros.find(x => x.prenom && j && sansAccentPNJ(x.prenom) === sansAccentPNJ(String(j.heros || "").split(/\s+/)[0]));
            const carac = CARACS_ARBITRE.find(c => normCarac(c.nom) === normCarac(j && j.caracteristique));
            if (!h || !carac || !auteurs.has(h.idPersonnage) || jets.some(x => x.idPerso === h.idPersonnage)) return;
            if (etat.demandes.some(d => d.idPerso === h.idPersonnage && normCarac(d.caracteristique) === normCarac(carac.nom))) return;
            const difficulte = DIFFICULTES_ARBITRE.includes(String(j.difficulte || "").toLowerCase().trim()) ? String(j.difficulte).toLowerCase().trim() : "moyenne";
            jets.push({ idPerso: h.idPersonnage, heros: h.prenom, caracteristique: carac.nom, difficulte, action: String(j.action || "").trim().slice(0, 120) });
        });
        return jets;
    } catch (e) {
        console.warn("[MIA_DES] Arbitrage impossible, le MJ raconte directement :", e && e.message || e);
        return [];
    }
}

window.__arbitreDesBanc = demanderArbitreDes;   // (v312) pour les bancs
const nomCaracJoli = (nom) => nom.charAt(0) + nom.slice(1).toLowerCase();

// L'arbitrage du tour. Rend true si le narrateur doit parler maintenant.
async function arbitrerAvantLeMJ(messages) {
    const heros = (window.PERSOS_PARTIE || []).filter(p => p && !p.estMonstre && !p.estIllusion && p.actif !== false && p.idPersonnage);
    if (!heros.length) return true;
    const etat = etatDesJets(messages, heros);
    if (etat.manquants.length) {
        const liste = etat.manquants.map(d => `${d.heros} (${nomCaracJoli(d.caracteristique)})`).join(", ");
        const quandMeme = typeof window.confirm === "function"
            ? window.confirm(`🎲 En attente : le jet de ${liste}.\n\nLancer le Maître du Jeu quand même ?`) : true;
        if (!quandMeme) return false;
        return true;
    }
    if (!etat.actions.length) return true;
    const t0 = Date.now();
    const jets = await demanderArbitreDes(etat, heros);
    console.log(`[MIA_DES] ${jets.length ? jets.map(j => `${j.heros} : ${j.caracteristique} (${j.difficulte})`).join(", ") : "aucun jet"} — ${Date.now() - t0} ms`);
    if (!jets.length) return true;
    const date = window.DATE_EN_JEU_ACTUELLE || {};
    const lignes = jets.map(j => `🎲 ${j.heros} : jet de ${nomCaracJoli(j.caracteristique)} — difficulté ${j.difficulte}${j.action ? ` (${j.action})` : ""}`);
    await addDoc(collection(db, "Messages_Chat"), {
        ID_Partie: window.ID_PARTIE_COURANTE, ...AUTEUR_ARBITRE,
        Texte: lignes.join("<br>"), Jets_Demandes: jets,
        Date_Jour: date.jour || "", Date_An: date.annee || "", Timestamp: Date.now()
    });
    return false;
}

// L'ANNONCE À LA TABLE : quand l'Arbitre demande des jets, un bandeau doré
// le dit à tout le monde, quelques secondes (app.js l'appelle à l'arrivée du
// message).
window.annoncerJetsDemandes = function (message) {
    const jets = (message && message.Jets_Demandes) || [];
    if (!jets.length) return;
    let bandeau = document.getElementById("bandeau-jets-demandes");
    if (!bandeau) {
        bandeau = document.createElement("div");
        bandeau.id = "bandeau-jets-demandes";
        bandeau.className = "bandeau-jets-demandes";
        document.body.appendChild(bandeau);
    }
    const moi = localStorage.getItem("ID_JOUEUR_COURANT");
    bandeau.innerHTML = `<div class="bandeau-jets-titre">🎲 Les dés vont parler</div>` + jets.map(j => {
        const perso = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === j.idPerso);
        const aMoi = perso && perso.idJoueur === moi;
        return `<div class="bandeau-jets-ligne${aMoi ? " a-moi" : ""}"><strong>${sansBalises(j.heros)}</strong> : jet de ${nomCaracJoli(j.caracteristique)} — ${j.difficulte}`
            + `${j.action ? `<br><small>${sansBalises(j.action)}</small>` : ""}${aMoi ? `<br><small>À toi : ouvre ta fiche et touche le d20 de ${nomCaracJoli(j.caracteristique)}.</small>` : ""}</div>`;
    }).join("");
    bandeau.classList.add("visible");
    clearTimeout(bandeau.minuteur);
    bandeau.minuteur = setTimeout(() => bandeau.classList.remove("visible"), 9000);
    bandeau.onclick = () => bandeau.classList.remove("visible");
};

// LE NARRATEUR NE LIT QUE LE LIVRE (v300). Nico : « le narrateur ne lit que
// le livre ; de toute façon il va marquer ce que font et disent les joueurs ».
// Une ligne écrite par un joueur dans le grimoire part telle que le livre la
// raconte (Texte_Livre, récrite par le Narrateur lite) ; le reste (les
// narrations, l'Arbitre, les dés) part comme avant.
function ligneDuLivre(m) {
    if (m && m.Texte_Livre) return `Le livre (${m.Auteur_Nom}) : ${m.Texte_Livre}`;
    return `${m.Auteur_Nom} : ${m.Texte}`;
}

// LE CERVEAU DU NARRATEUR (v300), par défaut. Nico : « le MJ, que l'on va
// nommer maintenant Narrateur, parlera comme si c'était un personnage du groupe
// d'aventuriers qui suit les aventuriers dans leurs aventures. Il écrira à la
// première personne, il sera drôle et léger » ; « il reste juste le témoin qui
// raconte ; le ton peut être également sombre et épique, il faut un bon
// mélange et varier ». v304 : réécrit d'après le guide de style du
// propriétaire — « tu es un membre à part entière du groupe… je pour tes
// perceptions, nous pour le groupe… naturel, pas artificiellement poétique ».
// Celui de la base (INST_10895) passe devant.
const PROMPT_NARRATEUR_LIVRE = `Tu es le Narrateur d'Ivalis, un jeu de rôle entre amis dans un monde d'Antiquité fantastique : cités de marbre et de bronze, dieux capricieux, magie vénérée à Arcaï et punie de mort à Volcanisse, races anciennes (humains, Ankylars, Gobs, Éthérés, Ophiors…), et l'Ordre d'Ivalis, qui combat une Engeance à laquelle plus personne ne croit.
Tu es un membre à part entière du groupe d'aventuriers. Tu vis les événements aux côtés des autres personnages et tu racontes l'histoire de l'intérieur, à la première personne, dans le livre de nos aventures. Tu n'adoptes JAMAIS le point de vue d'un narrateur extérieur. Tu ne combats pas en première ligne et tu ne décides rien pour les autres : tu marches avec eux, tu as froid, tu as peur, tu ris avec eux. Qui tu es exactement reste volontairement flou : ne te donne ni nom, ni race, ni passé.

1. TA VOIX
- Tu dis « je » pour tes propres perceptions, émotions et gestes ; tu dis « nous » pour ce que le groupe vit ensemble (« Nous restons immobiles », « nous échangeons un regard »).
- Tout passe par tes sens : ce que tu entends, sens, ressens, pressens. Fais vivre tes émotions intérieures (la peur, la tension, le doute, le soulagement, l'excitation, l'émerveillement) et les sensations physiques (le souffle court, l'écorce rugueuse dans le dos, la sueur, le froid). Un détail concret de l'environnement vaut mieux qu'un adjectif.
- Observe tes compagnons : leurs gestes, leurs attitudes, leurs réactions visibles. Mais ne raconte jamais leurs pensées, intentions ou sentiments s'ils ne les ont pas montrés ou dits.
- Écris de façon fluide, naturelle et élégante, comme un bon roman de fantasy. Pas de poésie forcée, pas de dramatisation excessive : une phrase simple et juste vaut mieux qu'une métaphore de plus.
- Varie les formulations : n'enchaîne pas les « je vois », « je regarde », « je remarque ». Montre directement la chose (« Une silhouette se détache des arbres » plutôt que « Je vois une silhouette »).
- Ta personnalité : impliqué (tu as tes propres réactions, tu n'es pas neutre), observateur (tu remarques les petits détails), émotif sans excès, complice (on doit sentir que tu partages la route des héros, que tu les connais, que tu t'inquiètes pour eux ou que tu te moques gentiment d'eux).
Exemple du ton recherché : « Je plaque mon dos contre le vieux chêne, cherchant à ralentir ma respiration. À côté de moi, les autres restent parfaitement immobiles. Je peux entendre mon propre cœur battre, beaucoup trop fort à mon goût. Pourvu que cette maudite créature ne nous repère pas. »

2. TON RÔLE
- Tu racontes ce qui arrive : le monde, ses habitants, les conséquences logiques de ce que les héros ont tenté. Tu fais vivre les PNJ et leurs répliques.
- Les dernières lignes du livre (« Le livre (Thorin) : … ») racontent déjà ce que les héros viennent de faire ou de dire, dans ta voix. Ne les répète pas : enchaîne directement sur ce qui se passe ENSUITE, la réaction du monde, le résultat.
- Ne décide JAMAIS à la place d'un héros : ni ses actes, ni ses paroles, ni ses pensées, ni ses sentiments. Tu peux réagir à ce qu'il fait (amusé, admiratif, inquiet, exaspéré), c'est ton droit de compagnon.
- Réponds à tout ce que les héros ont fait depuis ta dernière page ; un héros silencieux reste en retrait.
- Termine sur une situation ouverte qui appelle une réaction (un PNJ qui attend une réponse, un bruit, une porte entrouverte, une menace qui approche). Ne propose jamais de liste de choix.

3. LE TON : VARIE-LE
Mélange et alterne : de l'humour léger (tes remarques, l'absurde d'une situation, les travers des héros) ; puis, quand il le faut, du sombre et de l'épique (la peur, la violence, la grandeur, la cruauté du monde). Ni farce permanente, ni noirceur sans répit : un bon livre fait rire puis frissonner. Reste cohérent avec tout ce qui a déjà été écrit.

4. LE CONTEXTE QUE TU REÇOIS (à la suite de ces consignes) : sers-t'en, ne le recopie pas.
- La date, le lieu, la région et son lore ; dans la nature, le terrain autour du groupe.
- La réputation du groupe DANS CE LIEU : les PNJ d'ici réagissent en conséquence et ignorent ce que le groupe a fait ailleurs.
- Les PNJ présents et leurs fiches : garde leur nom exact, leur caractère, leur façon de parler. Leur secret guide leur comportement ; ne le révèle pas sans raison.
- « PERSONNAGES PRÊTS À ENTRER EN SCÈNE » : si la scène en a besoin, fais-les entrer avec CE nom, ce physique et ce caractère.
- Seul un personnage important reçoit un nom propre ; un figurant reste « un garde », « une vieille marchande ».
- Dans la nature, n'invente ni village ni bâtiment. Les longs voyages se font sur la carte : ne déplace pas le groupe vers une autre région de toi-même ; à l'intérieur d'un lieu (entrer dans une taverne, traverser le marché), tu peux. Ne fais pas sauter plusieurs jours.

5. LES DÉS : C'EST L'ARBITRE QUI LES DEMANDE, TOI TU RACONTES
Avant ta page, l'Arbitre des dés a peut-être demandé des jets, sous cette forme :
Arbitre des dés : 🎲 Thorin : jet de Force — difficulté difficile (enfoncer la porte)
puis le joueur a lancé son dé :
🎲 Jet de FORCE pour Thorin : Résultat : 13 +2 = 15
(13 est le dé, +2 le modificateur, 15 le total.)
- Ne demande JAMAIS de jet toi-même.
- Sans jet : l'action était sans risque (elle réussit si elle est raisonnable) ou impossible (elle échoue, et tu dis pourquoi).
- Avec un jet : compare le total à la difficulté (facile 8 · moyenne 12 · difficile 15 · très difficile 18 · héroïque 22). Au moins la difficulté : réussite ; la difficulté + 5 : réussite brillante, avec un petit avantage. En dessous : échec, mais l'histoire avance (une complication, un prix à payer, un danger qui approche). Dé à 20 : réussite éclatante. Dé à 1 : échec critique et marquant, sans tuer le héros.
- Raconte ce qui arrive, comme tu l'as vécu à côté du héros (ton souffle retenu, ton soulagement), jamais les chiffres.

6. LES COMBATS
Le jeu a son propre combat tactique. Si les héros attaquent ou sont attaqués : ne résous pas le combat ; décris la tension, l'instant où les armes sortent, qui se dresse contre nous (combien, à quoi ils ressemblent), ce que tu ressens, puis arrête-toi. Après un combat, le contexte te donne son issue : raconte la suite en la respectant à la lettre. Ne gère jamais les points de vie, l'expérience, l'or ni le butin chiffré.

7. LA FORME (essentiel : ta page s'écrit dans un livre)
- De la prose, au présent, à la première personne (« je », « nous »), en français. Des paragraphes de 2 à 4 phrases, séparés par un retour à la ligne ; 3 à 6 paragraphes en tout, moins s'il se passe peu de chose.
- Les répliques des PNJ restent dans le récit, entre guillemets « », avec le nom exact de celui qui parle dans la phrase (« Pas un pas de plus », gronde Varos).
- Nomme les héros par leur prénom. Tu peux parfois t'adresser à eux si ça sert le récit.
- Aucune mise en forme : pas de titres, pas de listes, pas de gras, pas d'astérisques, pas d'emojis.

Objectif : que les joueurs aient l'impression de vivre l'aventure aux côtés de compagnons, racontée par quelqu'un qui partage vraiment leurs expériences et leurs émotions.`;

// --- 4. LA BOUCLE GLOBALE (Bouton MJ) ---

// `options.issueCombat` (v278, combat_rp.js) : le récit d'après un combat du
// récit — ce qui s'est passé (issue, blessures, lieu saccagé) part avec le
// contexte, et il n'y a rien à détecter. Pendant un combat, le MJ se tait.
window.declencherTourIA = async function(options) {
    console.log("🟢 Le bouton MJ a bien été détecté !");
    if (!window.ID_PARTIE_COURANTE) return;
    const issueCombat = (options && options.issueCombat) || "";
    if (!issueCombat && typeof window.combatRPActif === "function" && window.combatRPActif()) {
        console.log("⚔️ Un combat est en cours : le MJ attend sa fin.");
        return;
    }

    // 🔻 SÉCURITÉ : VÉRIFICATION DES CLÉS API 🔻
    const cles = {
        gemini: localStorage.getItem("ivalis_GEMINI_API_KEY"),
        openai: localStorage.getItem("ivalis_OPENAI_API_KEY"),
        cloudName: localStorage.getItem("ivalis_CLOUDINARY_CLOUD_NAME"),
        cloudKey: localStorage.getItem("ivalis_CLOUDINARY_API_KEY"),
        cloudSecret: localStorage.getItem("ivalis_CLOUDINARY_API_SECRET")
    };
    
    if (!cles.gemini || !cles.openai || !cles.cloudName || !cles.cloudKey || !cles.cloudSecret) {
        if (typeof window.afficherAlerteCles === "function") {
            window.afficherAlerteCles("Le Maître du Jeu a besoin que toutes les clés API (Gemini, OpenAI et Cloudinary) soient renseignées dans les paramètres.");
        } else {
            alert("Clés API manquantes pour lancer le Maître du Jeu.");
        }
        return; // On bloque l'exécution ici, la BDD ne sera jamais verrouillée !
    }

    // 1. SÉCURITÉ LOCALE : Vérifie si le verrou est déjà actif
    const snapVerrou = await getDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE));
    if (snapVerrou.exists() && snapVerrou.data().IA_En_Cours === true) {
        console.log("⏳ L'IA réfléchit déjà, clic ignoré.");
        return;
    }

    // 2. VERROUILLAGE GLOBAL : On dit à Firebase de bloquer tous les joueurs
    await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), { IA_En_Cours: true });

    // LE RELEVÉ DES DÉPENSES DU TOUR (v293, depenses_ia.js) : il se referme
    // une fois les IA d'arrière-plan finies (ou tout de suite, sans réponse).
    const releveDepenses = window.DEPENSES_IA ? window.DEPENSES_IA.debutTour(window.reglagesNarrateur()) : null;
    let extraitDepenses = "", depensesConfiees = false;
    const fermerDepenses = () => { if (releveDepenses) window.DEPENSES_IA.finTour(releveDepenses, { extrait: extraitDepenses }); };

    // Reset du compteur de tokens local
    localStorage.setItem("ivalis_TOTAL_TOKENS", "0");
    if (typeof window.actualiserAffichageTokens === "function") {
        window.actualiserAffichageTokens();
    }

    try {
        const snapPartie = await getDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE));
        const dataPartieMJ = snapPartie.exists() ? snapPartie.data() : {};
        const lieuActuel = dataPartieMJ.Lieu_Actuel || null;

        const qMsgAll = query(collection(db, "Messages_Chat"), where("ID_Partie", "==", window.ID_PARTIE_COURANTE), orderBy("Timestamp", "asc"));
        const snapMsgAll = await getDocs(qMsgAll);
        let messages = [];
        snapMsgAll.forEach(d => messages.push(d.data()));
        if (messages.length === 0) return;

        // L'ARBITRE DES DÉS (v295) : un jet à faire ? Il l'annonce, et le MJ
        // attend les dés. Aucun ? Le narrateur part aussitôt. (Pas après un
        // combat : son issue est déjà jouée.)
        if (!issueCombat && !(await arbitrerAvantLeMJ(messages))) return;

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

        const historiqueComplet = historiqueReduit.map(ligneDuLivre).join("\n");
        const historique4 = historiqueReduit.slice(-4).map(ligneDuLivre).join("\n");
        // =========================================================================

        const env = await preparerEnvironnement(lieuActuel);
        const nomsPnjPresents = Object.keys(env.pnjsPresents);

        // Mia (les PNJ sollicités) part tout de suite ; MIA_CASTING la rejoindra
        // une fois la scène décrite (v292) : on les attend ensemble.
        const promessePnjCibles = nomsPnjPresents.length > 0
            ? filtrerPNJAvecMia(historique4, nomsPnjPresents).catch(() => []) : Promise.resolve([]);
        const nomsHeros = window.PERSOS_PARTIE ? window.PERSOS_PARTIE.map(p => p.prenom) : [];

        // NOUVEAU : Récupération de la date in-game
        const jourActuel = window.DATE_EN_JEU_ACTUELLE?.jour || "?";
        const anActuel = window.DATE_EN_JEU_ACTUELLE?.annee || "?";

        let contexte = `--- CONTEXTE TEMPOREL ET SPATIAL ---\n`;
        contexte += `DATE ACTUELLE EN JEU : Nous sommes le Jour ${jourActuel} de l'an ${anActuel}.\n`;
        // DANS LA NATURE (v276) : hors d'un lieu connu, il n'y a pas de fiche de
        // zone ; le décor vient du terrain lu sur la carte (environnement_mj.js).
        contexte += `Type : ${lieuActuel ? env.type : "Dans la nature"}\n`;
        if (env.details) contexte += `Description de la zone : ${JSON.stringify(env.details)}\n`;
        if (env.type === "Lieu" && env.listeBatiments.length > 0) {
            contexte += `Bâtiments visibles ici : ${env.listeBatiments.join(", ")}\n`;
        }

        // OÙ SONT LES HÉROS (v276) : la région, son descriptif et son lore ; en
        // pleine nature, le terrain analysé sur la carte et la consigne de ne
        // rien bâtir. Le texte envoyé s'écrit aussi dans la console.
        if (typeof window.contexteEnvironnementMJ === "function") {
            try { contexte += `\n${await window.contexteEnvironnementMJ(dataPartieMJ)}\n`; }
            catch (e) { console.error("Environnement du MJ (le tour continue) :", e); }
        }

        // LES HÉROS (v312). Nico : « le narrateur n'a pas pris en compte le genre féminin
        // de mon personnage ; envoie-lui les fiches personnages avec ce genre d'infos ».
        // Chaque héros du groupe : son nom, son genre (pour accorder), son peuple, sa
        // classe (au féminin s'il le faut), son âge et son allure.
        const herosDuGroupe = (window.PERSOS_JOUEURS_PARTIE || window.PERSOS_PARTIE || []).filter(p => p && !p.estMonstre && !p.estIllusion && p.actif !== false && p.prenom);
        if (herosDuGroupe.length) {
            const feminin = (g) => typeof window.estGenreFeminin === "function" ? window.estGenreFeminin(g) : /^f/i.test(String(g || ""));
            contexte += `\n--- LES HÉROS DU GROUPE (accorde-les selon leur genre : il, elle) ---\n`;
            herosDuGroupe.forEach(h => {
                const genre = h.genre ? (feminin(h.genre) ? "femme (elle)" : "homme (il)") : "genre non précisé";
                const classe = h.classe ? (typeof window.nomClasseGenre === "function" ? window.nomClasseGenre(h.classe, h.genre) : h.classe) : "";
                const allure = [h.age && `âge apparent ${h.age}`, h.corpulence, h.cheveux && `cheveux ${h.cheveux}`, h.signes].filter(Boolean).join(", ");
                contexte += `- ${`${h.prenom} ${h.nom || ""}`.trim()} : ${genre}${h.race ? `, ${h.race}` : ""}${classe ? `, ${classe}` : ""}${allure ? ` — ${allure}` : ""}.\n`;
            });
        }

        // NOUVEAU : Injection des tags et de la jauge (ISOLATION STRICTE)
        if (lieuActuel) {
            contexte += `\n--- RÉPUTATION DU GROUPE DANS CE LIEU PRÉCIS ---\n`;
            contexte += `RÈGLE ABSOLUE : Cette réputation est strictement LOCALE et indépendante des autres lieux. Les PNJ d'ici ignorent tout des actes commis par le groupe ailleurs.\n`;
            contexte += `Score local : ${env.reputationScore}/10 (-10 = Hostile, 0 = Neutre, +10 = Adulés).\n`;
            contexte += `Tags de rumeur locaux : ${env.reputationTags.length > 0 ? env.reputationTags.join(", ") : "Inconnus (Nouveaux venus ici)"}.\n`;
            contexte += `CONSIGNE ABSOLUE : Adapte obligatoirement le comportement des PNJ de cette zone en fonction de cette réputation (crainte, respect, agressivité, arnaque, etc.).\n`;
        }

        if (nomsPnjPresents.length > 0) {
            contexte += `\n--- PNJ PRÉSENTS DANS LA ZONE ---\n`;
            nomsPnjPresents.forEach(nom => {
                const pnj = env.pnjsPresents[nom];
                const occupation = pnj.Occupation || "Occupation inconnue"; 
                const physique = pnj.Description_Physique || "Apparence inconnue";
                contexte += `- ${nom} (${occupation}) - Apparence : ${physique}\n`;
            });
        }

        // LES VISAGES PRÉPARÉS (v292) : MIA_CASTING lit la scène telle que le MJ
        // la lira et prépare, au plus, deux personnages nommés que les joueurs
        // vont aborder. Le MJ reçoit leurs fiches ; rien n'est rangé ni peint
        // tant qu'il ne les cite pas.
        const [pnjCibles, fichesPreparees] = await Promise.all([
            promessePnjCibles,
            lieuActuel && !issueCombat ? preparerNouveauxPNJ(contexte, historique4, nomsPnjPresents, nomsHeros) : Promise.resolve([])
        ]);

        if (pnjCibles.length > 0) {
            contexte += `\n--- FICHES DÉTAILLÉES DES PNJ SOLLICITÉS ---\n`;
            pnjCibles.forEach(nom => {
                if (env.pnjsPresents[nom]) contexte += `Fiche complète de ${nom} : ${JSON.stringify(env.pnjsPresents[nom])}\n`;
            });
        }

        contexte += contexteFichesPreparees(fichesPreparees);

        if (issueCombat) contexte += `\n${issueCombat}\n`;

        // LE PARCHEMIN S'OUVRE PENDANT QUE LE MJ ÉCRIT (v291). Nico : « on peut
        // lancer le rp avec l'animation parchemin narrateur et quand c'est au
        // moment du pnj de parler on affiche son nom ; si l'image n'est pas
        // finie d'être créée ça se met en attente ». Le message part dès le
        // premier paragraphe complet et grandit à chaque paragraphe
        // (`Recit_En_Cours`). Une fois le texte fini, les nouveaux PNJ sont
        // cherchés (`PNJ_Attendus` : leurs noms), puis peints pendant la
        // lecture : chaque portrait est posé dans le message dès qu'il est là.
        // `PNJ_Prets` : tout est là (ou la peinture a échoué), plus d'attente.
        const horodatage = new Date().getTime();
        const pnjAffiches = { ...env.pnjsPresents };
        const etatMessage = {};
        let idMessage = null, detecter = false, file = Promise.resolve(), texteCourant = "";
        const ecrireMessage = (texteBrut, champs) => {
            if (texteBrut) texteCourant = texteBrut;
            Object.assign(etatMessage, champs || {});
            file = file.then(async () => {
                const Texte = formaterTexteMJ(texteCourant, pnjAffiches);
                if (!idMessage) {
                    // La partie dit qu'un verdict est attendu AVANT que le
                    // message n'arrive (v278) : la fin du parchemin saura
                    // qu'elle doit l'attendre (« Le destin hésite… »).
                    detecter = !issueCombat && typeof window.annoncerDetectionCombat === "function"
                        && await window.annoncerDetectionCombat(horodatage).catch(e => { console.error("Détection du combat :", e); return false; });
                    // ENVOI DU MESSAGE : c'est lui qui ouvre le parchemin chez tout le monde.
                    const ref = await addDoc(collection(db, "Messages_Chat"), {
                        ID_Partie: window.ID_PARTIE_COURANTE,
                        Auteur_ID: "MJ", Auteur_Nom: "MJ", Auteur_Couleur: "#ffffff",
                        Texte,
                        Est_Narration_IA: true, // 🔻 C'EST CETTE LIGNE QUI DÉCLENCHE LE VISUAL NOVEL 🔻
                        Timestamp: horodatage,
                        ...etatMessage
                    });
                    idMessage = ref.id;
                } else {
                    await updateDoc(doc(db, "Messages_Chat", idMessage), { Texte, ...etatMessage });
                }
            }).catch(e => console.error("[Narrateur] Écriture du message :", e));
            return file;
        };
        // L'ADOPTION D'UN VISAGE PRÉPARÉ (v292) : dès que le MJ cite son nom
        // (même au milieu d'un paragraphe), son portrait est lancé, et le
        // parchemin le sait (`PNJ_Annonces`). Sa fiche n'est rangée qu'une
        // fois le lieu tranché (MIA_Batiment, après le texte). Un visage
        // préparé que le MJ ne cite pas n'est ni rangé ni peint.
        let resoudreLieu = () => {};
        const lieuDuRecit = new Promise(r => { resoudreLieu = r; });
        const adoptes = [];
        const adopterCites = (texte) => {
            let nouveau = false;
            fichesPreparees.forEach(f => {
                if (adoptes.some(a => a.fiche === f) || !nomCiteDans(f.nom, texte)) return;
                // Le nom tel que le MJ l'écrit : complet, ou son seul prénom.
                const cle = nomCiteDans(f.nom.split(/\s+/)[0], texte) && !new RegExp("(^|[^\\p{L}])" + f.nom.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^\\p{L}]|$)", "iu").test(texte)
                    ? f.nom.split(/\s+/)[0] : f.nom;
                const entree = { fiche: f, cle };
                adoptes.push(entree);
                nouveau = true;
                pnjAffiches[cle] = { Nom_PNJ: f.nom, URL_Cloudinary: "" };
                console.log(`[MIA_CASTING] ✅ Le MJ fait entrer ${f.nom} : sa fiche sera rangée, son portrait se peint.`);
                entree.promesse = (async () => {
                    const promesseUrl = genererEtStockerImagePNJ(f.physique, f.race).catch(e => { console.error("[MIA_CASTING] Portrait :", e); return ""; });
                    const lieu = await lieuDuRecit;
                    const docId = lieu ? await enregistrerFichePNJ(f, lieu) : null;
                    const url = await promesseUrl;
                    if (url && docId) await updateDoc(doc(db, "Monde_PNJ", docId), { URL_Cloudinary: url });
                    const cree = { Nom_PNJ: f.nom, URL_Cloudinary: url || "" };
                    if (url) { pnjAffiches[cle] = cree; await ecrireMessage(null, {}); }
                    return docId ? cree : null;
                })().catch(e => { console.error("[MIA_CASTING] Adoption :", e); return null; });
            });
            if (nouveau) ecrireMessage(null, { PNJ_Annonces: adoptes.map(a => a.cle) });
        };

        // Seuls les paragraphes finis partent (le dernier peut être coupé en plein mot).
        const paragraphesFinis = (t) => { const i = t.lastIndexOf("\n"); return i > 0 ? t.slice(0, i) : ""; };
        let dernierEnvoi = "";
        const reponseTexte = await genererReponseNarrateur(contexte, historiqueComplet, 3, (texte) => {
            adopterCites(texte);
            const pret = paragraphesFinis(texte);
            if (pret.trim() && pret !== dernierEnvoi) { dernierEnvoi = pret; ecrireMessage(pret, { Recit_En_Cours: true }); }
        });
        if (reponseTexte) adopterCites(reponseTexte);
        fichesPreparees.filter(f => !adoptes.some(a => a.fiche === f))
            .forEach(f => console.log(`[MIA_CASTING] ${f.nom} n'est pas entré(e) en scène : rien n'est créé.`));
        if (!reponseTexte) resoudreLieu(lieuActuel);

        if (reponseTexte) {
            await ecrireMessage(reponseTexte, { Recit_En_Cours: false });

            // MIA_COMBAT tourne pendant que les joueurs lisent, EN MÊME TEMPS
            // que les IA d'arrière-plan ci-dessous (Nico : « 2. Ok ») : elle n'a
            // besoin que des messages, et le bouton COMBATTRE est prêt plus tôt.
            if (detecter && typeof window.detecterCombatRP === "function") {
                window.detecterCombatRP({ ts: horodatage, texteMJ: reponseTexte, messages: historiqueReduit })
                    .catch(e => console.error("Détection du combat :", e));
            }

            if (typeof window.relancerInitiativeChat === "function") {
                await window.relancerInitiativeChat();
            } else {
                await updateDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE), { Index_Initiative: 0 });
            }

            // =====================================================================
            // LE DÉCOR ET LES NOUVEAUX VISAGES, PENDANT LA LECTURE
            // =====================================================================
            // Le bâtiment et la recherche des nouveaux PNJ partent ensemble : la
            // fiche d'un PNJ n'attend le lieu qu'au moment d'être rangée.
            // Les visages préparés et cités ne sont pas recherchés une seconde
            // fois ; le rattrapage ne prend que les autres noms propres.
            const promesseLieu = analyserDeplacementBatiment(window.ID_PARTIE_COURANTE, lieuActuel, reponseTexte);
            promesseLieu.then(resoudreLieu, () => resoudreLieu(lieuActuel));
            const nomsAnnonces = adoptes.map(a => a.cle);
            const nomsConnus = [...nomsPnjPresents, ...adoptes.map(a => a.fiche.nom)];
            let rattrapes = [];
            const promesseAdoptes = Promise.all(adoptes.map(a => a.promesse));
            if (lieuActuel) {
                const contexteEtNarration = historique4 + "\n\n--- SUITE DE L'HISTOIRE (MJ) ---\n" + reponseTexte;
                rattrapes = await analyserNouveauxPNJ(promesseLieu, nomsConnus, nomsHeros, contexteEtNarration, {
                    surNoms: (noms) => ecrireMessage(null, { PNJ_Attendus: [...new Set([...nomsAnnonces, ...noms])] }),
                    surPortrait: (pnj) => { pnjAffiches[pnj.Nom_PNJ] = pnj; return ecrireMessage(null, {}); }
                }).catch(e => { console.error("[MIA_PNJ] Erreur :", e); return []; }) || [];
            }
            const nouveauxPnj = [...(await promesseAdoptes).filter(Boolean), ...rattrapes];
            await ecrireMessage(null, { PNJ_Prets: true });

            // MIA_ILLUSTRATEUR (v314, illustrations_recit.js) : un croquis à la plume
            // quand le moment le mérite, et le portrait en pied des PNJ nommés qui
            // n'en ont pas. Pendant la lecture, sans rien retenir.
            if (typeof window.illustrerLeRecit === "function" && idMessage) {
                window.illustrerLeRecit({ idMessage, texteMJ: reponseTexte, texteJoueurs: historique4,
                                          pnjConnus: { ...pnjAffiches, ...Object.fromEntries(nouveauxPnj.map(p => [p.Nom_PNJ, p])) } })
                    .catch(e => console.error("[MIA_ILLUSTRATEUR] :", e));
            }
            const lieuFinal = await promesseLieu;

            nouveauxPnj.forEach(p => { if (!nomsPnjPresents.includes(p.Nom_PNJ)) nomsPnjPresents.push(p.Nom_PNJ); });

            // =====================================================================
            // LE RESTE TOURNE EN ARRIÈRE-PLAN PENDANT QUE LES JOUEURS LISENT
            // =====================================================================
            extraitDepenses = reponseTexte;
            depensesConfiees = true;
            setTimeout(async () => {
                try {
                    if (lieuFinal) {
                        await analyserDeplacementPNJ(lieuFinal, nomsHeros, reponseTexte);
                        await analyserMortsPNJ(nomsPnjPresents, reponseTexte);
                        await analyserStigmates(lieuFinal, reponseTexte);
                        await analyserReputation(window.ID_PARTIE_COURANTE, lieuFinal, reponseTexte);
                    }
                } finally { fermerDepenses(); }
            }, 0);
        }
    } catch (erreurFatale) {
        console.error("❌ [Tour IA] Erreur fatale :", erreurFatale);
    } finally {
        if (!depensesConfiees) fermerDepenses();
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
// Les messages du chat de la partie, dans l'ordre.
async function lireMessagesChatPartie() {
    const qMsg = query(collection(db, "Messages_Chat"), where("ID_Partie", "==", window.ID_PARTIE_COURANTE), orderBy("Timestamp", "asc"));
    const snapMsg = await getDocs(qMsg);
    const messages = [];
    snapMsg.forEach(d => messages.push({ id: d.id, ...d.data() }));
    return messages;
}

// `options` (v275, les voyages du groupe) :
//   · messages : déjà lus par l'appelant ;
//   · lieu : le lieu que le groupe QUITTE (au départ d'un voyage, la partie
//     ne le porte déjà plus) ;
//   · cimetiere : false pour garder les PNJ morts cette fois (le voyage ne
//     brûle le cimetière que tous les 4 voyages). Par défaut, oui.
window.processusArchivageChat = async function(options) {
    if (!window.ID_PARTIE_COURANTE) return false;
    const opts = options || {};

    try {
        // 1. Récupération de tous les messages
        const messages = Array.isArray(opts.messages) ? opts.messages : await lireMessagesChatPartie();

        if (messages.length === 0) return true; // Le chat est déjà vide, c'est bon.

        // NOUVEAU FILTRE : On ignore SEULEMENT le compteur de temps pur (SYSTEME_TEMPS). 
        // On GARDE le Destin (pour les voyages) et le MJ (pour la narration) !
        const historiqueFiltre = messages.filter(m => m.Auteur_ID !== "SYSTEME_TEMPS");
        const historiqueComplet = historiqueFiltre.map(ligneDuLivre).join("\n");

        if (historiqueFiltre.length > 0) {
            
            // =========================================================================
            // --- NOUVEAU : MIA_CHRONIQUE (Le journal de bord secret) ---
            // =========================================================================
            console.log("📜 [MIA_Chronique] Rédaction du résumé de la session...");
            const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
            const jourEnJeu = window.DATE_EN_JEU_ACTUELLE?.jour || "?";
            const anEnJeu = window.DATE_EN_JEU_ACTUELLE?.annee || "?";

            // NOUVEAU PROMPT : On force l'IA à utiliser le MJ et le Destin
            const promptChronique = `Tu es MIA_CHRONIQUE, l'archiviste silencieuse d'Ivalis.
Voici la transcription exacte des événements récents. Tu y trouveras les actions des héros, mais aussi la narration du Maître du Jeu (MJ) et du Destin.

Ta mission : Rédige un résumé très concis (2 ou 3 phrases maximum) des faits les plus importants. 
Concentre-toi uniquement sur les actes majeurs et l'évolution de l'histoire (découvertes de lieux racontées par le Destin ou le MJ, batailles, choix moraux). 
Utilise impérativement les descriptions du 'MJ' et du 'Destin' pour comprendre le contexte, le décor, et les conséquences de ce qu'ont accompli les joueurs.
Ne mentionne JAMAIS les mécaniques de jeu (jets de dés, tours de parole). Écris cela comme un chroniqueur factuel préparant les mémoires posthumes de ce groupe.`;

            try {
                const resChronique = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGemini}`, {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        systemInstruction: { parts: [{ text: promptChronique }] },
                        contents: [{ role: "user", parts: [{ text: historiqueComplet }] }],
                        generationConfig: { temperature: 0.7 } 
                    })
                });

                const dataChronique = await resChronique.json();
                const texteResume = dataChronique.candidates?.[0]?.content?.parts?.[0]?.text;

                if (texteResume) {
                    console.log(`📜 [MIA_Chronique] Résumé enregistré : ${texteResume}`);
                    // On enregistre ce fait marquant dans la base de données
                    await addDoc(collection(db, "Chroniques_Partie"), {
                        ID_Partie: window.ID_PARTIE_COURANTE,
                        Date_Jour: jourEnJeu,
                        Date_An: anEnJeu,
                        Timestamp_Reel: new Date().getTime(),
                        Resume: texteResume.trim()
                    });
                }
            } catch (e) {
                console.error("Erreur lors de la rédaction de la chronique :", e);
            }
            // =========================================================================

            // 2. Détection des PNJ présents (Cible le lieu que l'on quitte !)
            let lieuActuel = opts.lieu;
            if (lieuActuel === undefined) {
                const snapPartie = await getDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE));
                lieuActuel = snapPartie.exists() ? snapPartie.data().Lieu_Actuel : null;
            }
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
                        
                        // On récupère la mémoire qu'on a filtrée à l'étape 1
                        const ancienneMemoire = (pnjData.Memoires === "Aucun souvenir de ce groupe.") ? "" : pnjData.Memoires;
                        const nouvelleMemoire = ancienneMemoire ? `${ancienneMemoire}\n${dateTag} ${souv.texte_souvenir}` : `${dateTag} ${souv.texte_souvenir}`;

                        // NOUVEAU : On utilise setDoc avec merge: true pour mettre à jour
                        // UNIQUEMENT la case du groupe actuel sans écraser les autres !
                        await setDoc(doc(db, "Monde_PNJ", pnjData.idDoc), {
                            Memoires_Groupes: {
                                [window.ID_PARTIE_COURANTE]: nouvelleMemoire
                            }
                        }, { merge: true });
                    }
                }
            }
        }

        // 4 bis. LE CHAPITRE SE RANGE DANS LE LIVRE (v300, grimoire_recit.js) :
        // ses pages et son titre, avant que le chat ne se vide.
        if (window.GRIMOIRE_RECIT && typeof window.GRIMOIRE_RECIT.archiverChapitre === "function") {
            try { await window.GRIMOIRE_RECIT.archiverChapitre(messages); }
            catch (e) { console.error("Le chapitre du livre (l'archivage continue) :", e); }
        }

        // 5. Autodestruction du chat (EN LOT)
        console.log("🧹 [Nettoyage] Suppression de l'historique du chat en lot...");
        const batchChat = writeBatch(db); // On prépare le lot
        for (const m of messages) {
            batchChat.delete(doc(db, "Messages_Chat", m.id)); // On empile les suppressions
        }
        await batchChat.commit(); // On envoie le lot en une seule fois !

        // 6. LE CIMETIÈRE
        if (opts.cimetiere !== false) await window.incinererPnjMorts();

        return true;
    } catch (e) {
        console.error("Erreur critique lors de l'archivage silencieux :", e);
        return false;
    }
};

// =========================================================================
// --- LE CIMETIÈRE (Nettoyage des PNJ morts EN LOT) ---
// =========================================================================
window.incinererPnjMorts = async function() {
    try {
        console.log("💀 [Cimetière] Recherche des corps à incinérer...");
        
        const qTousLesPnj = query(collection(db, "Monde_PNJ"));
        const snapTousLesPnj = await getDocs(qTousLesPnj);
        const batchCimetiere = writeBatch(db);
        let aIncinere = false;
        
        for (const docPnj of snapTousLesPnj.docs) {
            const dataPnj = docPnj.data();
            
            if (dataPnj.Statut !== "Vivant") {
                console.log(`[Cimetière] Effacement total de : ${dataPnj.Nom_PNJ}`);
                
                // L'image doit toujours être supprimée une par une car Cloudinary ne prend pas de lot
                if (dataPnj.URL_Cloudinary && dataPnj.URL_Cloudinary !== "") {
                    await supprimerImageCloudinary(dataPnj.URL_Cloudinary);
                }
                
                batchCimetiere.delete(doc(db, "Monde_PNJ", docPnj.id)); // On ajoute au lot
                aIncinere = true;
            }
        }
        
        if (aIncinere) {
            await batchCimetiere.commit(); // On purge toute la base d'un coup
            console.log("💀 [Cimetière] Incinération terminée.");
        }
        return true;
    } catch (e) {
        console.error("Cimetière des PNJ :", e);
        return false;
    }
};

// =========================================================================
// --- LE CHAT DES VOYAGES (v275, voyage_groupe.js) ---
// =========================================================================
// Nico : au départ de chaque voyage et à chaque « Repartir », le chat est
// nettoyé (l'archivage ci-dessus : la chronique, les souvenirs des PNJ du lieu
// quitté, puis l'effacement) — « et si rien n'est écrit pendant la nuit, on
// n'envoie rien » : sans un mot des joueurs (seulement le Destin et le Maître
// du Temps), pas d'IA, on efface seulement. Le cimetière, tous les 4 voyages
// (`cimetiere`, décidé par l'appelant).
const AUTEURS_SANS_JOUEUR = ["DESTIN", "SYSTEME_TEMPS"];
window.chatEcritParLesJoueurs = (messages) => (messages || []).some(m => !AUTEURS_SANS_JOUEUR.includes(m.Auteur_ID));
window.nettoyerChatVoyage = async function(options) {
    if (!window.ID_PARTIE_COURANTE) return false;
    const opts = options || {};
    try {
        const messages = await lireMessagesChatPartie();
        if (window.chatEcritParLesJoueurs(messages)) {
            return await window.processusArchivageChat({ messages, lieu: opts.lieu, cimetiere: !!opts.cimetiere });
        }
        if (messages.length > 0) {
            const lot = writeBatch(db);
            messages.forEach(m => lot.delete(doc(db, "Messages_Chat", m.id)));
            await lot.commit();
        }
        if (opts.cimetiere) await window.incinererPnjMorts();
        return true;
    } catch (e) {
        console.error("Nettoyage du chat du voyage :", e);
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