// =========================================================================
//  L'ILLUSTRATION DES COMPÉTENCES
// =========================================================================
//  Une compétence vient d'être forgée : on lui dessine une image, posée en
//  haut de sa carte. Deux IA à la suite :
//   1. MIA_ILLUSTRATION (Gemini) lit le titre, les effets, le récit RP s'il y
//      en a un, la race, le genre et la classe du héros, ses armes — et écrit
//      le prompt d'une scène : le héros en train d'exécuter sa technique, ou
//      au moins ce que fait la technique, lisible d'un coup d'œil ;
//   2. l'IA d'image (OpenAI : gpt-image-2 puis ses aînés, 1536×1024 paysage,
//      qualité moyenne, PNG) reçoit ce prompt ET, en
//      binaire, le portrait du héros et l'image de ses armes (une arme à deux
//      mains n'est envoyée qu'une fois).
//  L'image passe par Cloudinary, puis son adresse est écrite sur la
//  compétence (URL_Image), avec le prompt qui l'a faite (Prompt_Image).
//
//  LA FILE. Une IA saturée (429, 503, « overloaded ») ne fait rien perdre :
//  la commande reste en file, et on réessaie, de plus en plus patiemment,
//  jusqu'à ce qu'elle passe. La file survit à un rechargement de la page
//  (localStorage) et reprend toute seule au démarrage.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const CLE_FILE = "ivalis_illustrations_en_attente";
// Patience croissante, puis deux minutes entre chaque essai, sans fin.
window.DELAIS_ILLUSTRATION = [5000, 15000, 30000, 60000, 120000];
const MODELES_IMAGE = [
    { model: "gpt-image-2" },
    { model: "gpt-image-1.5", input_fidelity: "high" },
    { model: "gpt-image-1", input_fidelity: "high" }
];
// Le fond posé sous les transparences des images de référence.
const FOND_REFERENCES = "#808080";
// LE FORMAT UNIQUE DES ILLUSTRATIONS : 1250 × 1000 (5:4), celui de la fenêtre
// du haut de la carte. L'IA dessine en paysage 3:2 ; l'image
// est recadrée au centre avant l'envoi, et Cloudinary le refait à la livraison
// (c_fill) : quoi qu'il arrive, toutes les illustrations ont ce format.
window.FORMAT_ILLUSTRATION = { largeur: 1250, hauteur: 1000 };
// LA NETTETÉ. Les premières illustrations sortaient floues : dessinées en
// qualité « low » (le réglage des pions, fait pour un médaillon minuscule),
// recompressées en JPEG avant l'envoi, puis encore par Cloudinary (q_auto).
// Elles sont maintenant dessinées en paysage (le format d'un plan de cinéma,
// moins rogné pour la fenêtre 5:4) et en qualité moyenne, envoyées en PNG
// sans perte, et livrées en q_auto:best.
window.DESSIN_ILLUSTRATION = { taille: "1536x1024", qualite: "medium" };

const dormir = (ms) => new Promise(r => setTimeout(r, ms));
const sansBalises = (t) => String(t || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

class Saturee extends Error {}      // réessayer plus tard
class Definitive extends Error {}   // inutile d'insister

// -------------------------------------------------------------------------
//  LA FILE
// -------------------------------------------------------------------------
function lireFile() {
    try { return JSON.parse(localStorage.getItem(CLE_FILE) || "[]"); } catch (e) { return []; }
}
function ecrireFile(file) {
    try { localStorage.setItem(CLE_FILE, JSON.stringify(file)); } catch (e) {}
    afficherBadge();
}
const cleCommande = (c) => `${c.idPerso}/${c.idComp}`;

let enCours = false;
// Les commandes annulées pendant qu'elles se dessinent (compétence effacée).
const annulees = new Set();

// Une compétence effacée (supprimerCompetencePerso, competences.js) : sa
// commande quitte la file, et si elle se dessine en ce moment, son image sera
// retirée de Cloudinary dès qu'elle arrive.
window.annulerIllustration = function(idPerso, idComp) {
    const cle = `${idPerso}/${idComp}`;
    annulees.add(cle);
    ecrireFile(lireFile().filter(c => cleCommande(c) !== cle));
};
let etatBadge = "";

// Met une compétence en file. Elle sera illustrée dès que possible.
window.illustrerCompetence = function(idPerso, idComp, nom) {
    if (!idPerso || !idComp) return;
    const file = lireFile();
    if (!file.some(c => cleCommande(c) === `${idPerso}/${idComp}`)) {
        file.push({ idPerso, idComp, nom: nom || "", depuis: Date.now() });
        ecrireFile(file);
    }
    traiterFile();
};

async function traiterFile() {
    if (enCours) return;
    enCours = true;
    try {
        for (;;) {
            const file = lireFile();
            if (file.length === 0) break;
            const commande = file[0];
            if (annulees.has(cleCommande(commande))) {
                ecrireFile(lireFile().filter(c => cleCommande(c) !== cleCommande(commande)));
                continue;
            }
            // Ce qui est déjà fait survit aux nouveaux essais : on ne redemande
            // pas un prompt, ni une image, qu'on a déjà.
            const acquis = {};
            let essai = 0;
            for (;;) {
                try {
                    etatBadge = `🎨 Illustration de « ${commande.nom || "la compétence"} »…`;
                    afficherBadge();
                    await illustrer(commande, acquis);
                    break;
                } catch (e) {
                    if (e instanceof Saturee) {
                        const delais = window.DELAIS_ILLUSTRATION;
                        const attente = delais[Math.min(essai, delais.length - 1)];
                        essai++;
                        console.warn(`🎨 [Illustration] ${e.message} — nouvel essai dans ${Math.round(attente / 1000)}s.`);
                        etatBadge = `⏳ IA saturée : « ${commande.nom || "la compétence"} » attend son tour (${Math.round(attente / 1000)} s)`;
                        afficherBadge();
                        await dormir(attente);
                        continue;
                    }
                    console.error("🎨 [Illustration] abandon :", e.message || e);
                    break;
                }
            }
            ecrireFile(lireFile().filter(c => cleCommande(c) !== cleCommande(commande)));
        }
    } finally {
        enCours = false;
        etatBadge = "";
        afficherBadge();
    }
}

// Un petit sceau discret en bas à gauche, tant que la file n'est pas vide.
function afficherBadge() {
    if (typeof document === "undefined") return;
    let badge = document.getElementById("badge-illustrations");
    const file = lireFile();
    if (file.length === 0) { if (badge) badge.remove(); return; }
    if (!badge) {
        badge = document.createElement("div");
        badge.id = "badge-illustrations";
        badge.className = "badge-illustrations";
        document.body.appendChild(badge);
    }
    badge.textContent = (etatBadge || "🎨 Illustration en attente…") + (file.length > 1 ? `  (+${file.length - 1})` : "");
}

// -------------------------------------------------------------------------
//  UNE ILLUSTRATION, DE BOUT EN BOUT
// -------------------------------------------------------------------------
async function illustrer(commande, acquis = {}) {
    const cles = typeof window.clesApiIvalis === "function" ? window.clesApiIvalis() : {};
    if (!cles.openai || !cles.cloudName || !cles.cloudKey || !cles.cloudSecret) {
        throw new Definitive("clés OpenAI / Cloudinary absentes");
    }
    const [snapComp, snapPerso] = await Promise.all([
        getDoc(doc(db, "Personnages", commande.idPerso, "Competences", commande.idComp)),
        getDoc(doc(db, "Personnages", commande.idPerso))
    ]).catch(e => { throw new Saturee("lecture Firestore impossible (" + e.message + ")"); });
    if (!snapComp.exists()) throw new Definitive("compétence introuvable (supprimée ?)");
    const competence = snapComp.data();
    const perso = window.persoDocVersFront(commande.idPerso, snapPerso.exists() ? snapPerso.data() : {});

    const armes = armesDeReference(perso, competence.Arme);
    // LE STYLE DU JEU, celui des paramètres (Cerveau_IA/INST_76839), le même que
    // pour la création des personnages : Gemini le connaît pour imaginer la
    // scène, et il est recopié MOT POUR MOT dans le prompt de l'IA d'image.
    if (acquis.style === undefined) acquis.style = await lireStyleDuJeu();
    const prompt = acquis.prompt || (acquis.prompt = assemblerPromptImage(
        await ecrirePromptIllustration(competence, perso, armes, cles, acquis.style), acquis.style));
    if (!acquis.references) acquis.references = await imagesDeReference(perso, armes);
    const image = acquis.image || (acquis.image = await dessinerIllustration(prompt, acquis.references, cles));
    if (!acquis.recadree) acquis.recadree = await recadrerAuFormat(image);
    const url = acquis.url || (acquis.url = await hebergerIllustration(acquis.recadree, cles));

    // La compétence a pu être effacée par le MJ pendant le dessin : l'image
    // n'a plus de carte, elle quitte Cloudinary et la commande s'arrête là.
    const encore = await getDoc(doc(db, "Personnages", commande.idPerso, "Competences", commande.idComp))
        .catch(e => { throw new Saturee("lecture Firestore impossible (" + e.message + ")"); });
    if (!encore.exists() || annulees.has(cleCommande(commande))) {
        if (typeof window.supprimerImageCloudinary === "function") await window.supprimerImageCloudinary(url);
        throw new Definitive("compétence effacée pendant le dessin : image retirée de Cloudinary");
    }
    await updateDoc(doc(db, "Personnages", commande.idPerso, "Competences", commande.idComp),
                    { URL_Image: url, Prompt_Image: prompt })
        .catch(e => { throw new Saturee("écriture Firestore impossible (" + e.message + ")"); });
    console.log(`✅ [Illustration] « ${competence.Nom} » illustrée.`);
    rafraichirCaches(commande, url);
}

// Les armes dont l'image part en référence : celles qu'il a en main, et que
// la technique utilise. Une arme à deux mains est le même objet dans les deux
// mains : elle n'est envoyée qu'une fois.
//  • technique d'arme : les armes de ce type (à défaut, toutes ses armes) ;
//  • Magie : son focaliseur (bâton, grimoire…) s'il en tient un ;
//  • Sans arme / Arme rp : aucune — c'est tout le principe.
function armesDeReference(perso, armeDeLaCarte) {
    if (armeDeLaCarte === "Sans arme / Arme rp" || typeof window.objetsEquipes !== "function") return [];
    const enMain = window.objetsEquipes(perso).filter(o => !o.bague && o !== perso.equipArmure
        && (window.TYPES_ARMES_FORGE || []).includes(o.type));
    let retenues;
    if (armeDeLaCarte === "Magie") retenues = enMain.filter(o => o.type === "Magie");
    else {
        const physiques = enMain.filter(o => o.type !== "Magie");
        const duType = physiques.filter(o => o.type === armeDeLaCarte);
        retenues = duType.length ? duType : physiques;
    }
    const vues = new Set();
    return retenues.filter(o => {
        const cle = o.uid || o.image || o.nom;
        if (vues.has(cle)) return false;
        vues.add(cle);
        return true;
    });
}

// Ce que la carte fait, en phrases.
function effetsEnTexte(competence) {
    return (competence.Effets_Compiles || []).map(e => typeof e === "string"
        ? sansBalises(e)
        : `${e.isMod ? "  ↳ " : "• "}${sansBalises(e.nom)} : ${sansBalises(e.desc)}`).join("\n");
}

// -------------------------------------------------------------------------
//  1. LE PROMPT (Gemini)
// -------------------------------------------------------------------------
async function lireStyleDuJeu() {
    if (typeof window.instructionStyleIvalis !== "function") return "";
    try { return (await window.instructionStyleIvalis()) || ""; } catch (e) { return ""; }
}

// Le prompt final de l'IA d'image : le contexte de l'univers et les directives
// de style, dans les mêmes mots que le portrait du personnage
// (genererEtStockerPortrait, app.js), puis la scène écrite par Gemini.
function assemblerPromptImage(scene, style) {
    return "Contexte de l'univers : Antique Fantastique (Mythic Ancient Fantasy, Antiquité Magique).\n\n"
        + (style ? "Directives de style artistique obligatoires : " + style + "\n\n" : "")
        + "--- SCÈNE DE LA TECHNIQUE ---\n" + scene;
}

async function ecrirePromptIllustration(competence, perso, armes, cles, style) {
    const references = ["IMAGE 1 : le personnage (portrait de référence, en armure)"]
        .concat(armes.map((a, i) => `IMAGE ${i + 2} : son arme « ${a.nom || a.modele || a.type} » (${a.type}${a.deuxMains ? ", à deux mains" : ""})`));
    const fiche = `TECHNIQUE : ${competence.Nom}
ARME DE LA TECHNIQUE : ${competence.Arme || "inconnue"}
EFFETS EN JEU :
${effetsEnTexte(competence) || "(aucun)"}
RÉCIT DU JOUEUR : ${competence.Recit_RP ? `"""${competence.Recit_RP}"""` : "(aucun)"}

LE PERSONNAGE : ${[perso.prenom, perso.nom].filter(Boolean).join(" ") || "héros"}
RACE : ${perso.race || "inconnue"}
GENRE : ${perso.genre || "non précisé"}
CLASSE : ${(typeof window.nomClasseGenre === "function" ? window.nomClasseGenre(perso.classe, perso.genre) : perso.classe) || "aucune"}

IMAGES DE RÉFÉRENCE JOINTES AU DESSINATEUR :
${references.join("\n")}`;

    const systeme = `Tu es MIA_ILLUSTRATION, directrice artistique d'Ivalis (jeu de rôle de fantasy).
Tu écris, en ANGLAIS, le prompt d'une illustration de carte de compétence pour une IA d'image qui reçoit aussi les images de référence listées.
- Montre CE personnage (celui de l'image 1 : même visage, même race, même armure, mêmes couleurs) en train d'exécuter la technique, en pleine action. Si la technique se lit mieux par son effet (un soin, un bouclier, une zone), montre l'effet en train de se produire, le personnage en lanceur.
- UN VRAI PLAN DE CINÉMA, choisi pour CETTE technique : gros plan (le visage, le regard, les mains qui libèrent la magie), plan rapproché (buste, épaule), plan américain, contre-plongée héroïque, plongée, plan par-dessus l'épaule, plan large seulement si la technique couvre une zone. Le corps entier n'est PAS obligatoire : cadre serré dès que le geste ou l'émotion suffit à raconter la technique. Décris dans le prompt le type de plan, l'angle de caméra, l'objectif (ex. 35 mm, 85 mm), la profondeur de champ (arrière-plan flou), le mouvement figé (poussière, étincelles, éclats), la lumière (contre-jour, clair-obscur, lumière de l'effet sur le visage) et la composition (règle des tiers, lignes de force).
- Les armes : les images de référence disent à quoi elles ressemblent SI elles apparaissent. Elles ne sont pas obligatoires à l'image : ne les montre que si le geste les fait voir (une lame qui frappe, une flèche tirée) ; un gros plan sur le visage ou une main peut très bien s'en passer. Magie = mains nues ou focaliseur, énergie visible ; Sans arme = mains nues ou arme improvisée du récit.
- Le récit du joueur prime sur les effets pour la mise en scène ; les effets donnent l'élément, la portée, la cible (zone = plusieurs ennemis, distance = projectile ou rayon, soin = lumière apaisante sur un allié…).
- Cadre : l'image est dessinée en paysage 3:2 puis recadrée en 5:4 (on perd une fine bande à gauche et à droite) : rien d'essentiel collé aux bords gauche et droit. Fond de décor de fantasy cohérent avec la scène.
- Interdits : aucun texte, aucune lettre, aucun chiffre, aucun cadre, aucune bordure, aucune interface de jeu, aucune carte à jouer.
- Univers : Antique Fantastique (Mythic Ancient Fantasy, Antiquité Magique).${style ? `\n- Style artistique OBLIGATOIRE du jeu (il sera aussi joint tel quel au dessinateur ; ta scène doit s'y accorder) : ${style}` : ""}
Appelle l'outil ecrirePromptImage avec le prompt (100 à 200 mots).`;

    if (!cles.gemini) return promptDeSecours(competence, perso, armes);
    for (let essai = 0; essai < 3; essai++) {
        let reponse, data;
        try {
            reponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cles.gemini}`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    systemInstruction: { parts: [{ text: systeme }] },
                    contents: [{ role: "user", parts: [{ text: fiche }] }],
                    tools: [{ functionDeclarations: [{
                        name: "ecrirePromptImage",
                        description: "Le prompt, en anglais, de l'illustration de la carte.",
                        parameters: { type: "OBJECT", properties: { prompt: { type: "STRING" } }, required: ["prompt"] }
                    }] }],
                    toolConfig: { functionCallingConfig: { mode: "ANY" } }
                })
            });
            data = await reponse.json();
        } catch (e) {
            throw new Saturee("Gemini injoignable (" + (e.message || e) + ")");
        }
        if (reponse.status === 429 || reponse.status >= 500) throw new Saturee(`Gemini saturé (HTTP ${reponse.status})`);
        const prompt = data.candidates?.[0]?.content?.parts?.find(p => p.functionCall)?.functionCall?.args?.prompt;
        if (prompt && prompt.trim().length > 30) return prompt.trim();
    }
    // Gemini répond, mais sans prompt exploitable : on n'attend pas pour rien.
    return promptDeSecours(competence, perso, armes);
}

// Sans Gemini : un prompt assemblé à la main, moins inspiré mais fidèle.
function promptDeSecours(competence, perso, armes) {
    const effets = (competence.Effets_Compiles || []).map(e => sansBalises(typeof e === "string" ? e : e.nom)).filter(Boolean).join(", ");
    return `Fantasy card illustration. The character from reference image 1 (${perso.race || ""} ${perso.genre || ""}, same face, armor and colors) `
        + `performs the combat technique "${competence.Nom}"`
        + (armes.length ? ` wielding the weapon${armes.length > 1 ? "s" : ""} shown in the other reference images` : competence.Arme === "Magie" ? " with visible magical energy" : "")
        + `. Effects: ${effets || "a powerful strike"}. `
        + (competence.Recit_RP ? `Scene: ${competence.Recit_RP}. ` : "")
        + "Cinematic shot chosen for this technique (close-up or medium shot when the gesture is enough, full body not required), "
        + "low camera angle, shallow depth of field, frozen motion (sparks, dust), dramatic chiaroscuro lighting, rule of thirds, fantasy background. "
        + "Weapons only if the gesture shows them. No text, no letters, no frame, no border, no UI.";
}

// -------------------------------------------------------------------------
//  2. LE DESSIN (OpenAI, comme les pions)
// -------------------------------------------------------------------------
// Le portrait du héros (avec son armure du moment) puis ses armes, en PNG.
async function imagesDeReference(perso, armes) {
    const urlPortrait = perso.urlCloudinary || perso.urlPortraitReference;
    const blobs = [];
    if (urlPortrait) {
        const b = await window.imageVersBlobPng(urlPortrait, FOND_REFERENCES).catch(() => null);
        if (b) blobs.push({ blob: b, nom: "personnage.png" });
    }
    for (const [i, arme] of armes.entries()) {
        if (!arme.image) continue;
        const b = await window.imageVersBlobPng(arme.image, FOND_REFERENCES).catch(() => null);
        if (b) blobs.push({ blob: b, nom: `arme_${i + 1}.png` });
    }
    return blobs;
}

async function dessinerIllustration(prompt, blobs, cles) {
    for (const candidat of MODELES_IMAGE) {
        if (typeof window.reserverCreneauImage === "function") await window.reserverCreneauImage();
        const form = new FormData();
        form.append("model", candidat.model);
        form.append("prompt", prompt);
        form.append("n", "1");
        form.append("size", window.DESSIN_ILLUSTRATION.taille);
        form.append("quality", window.DESSIN_ILLUSTRATION.qualite);
        form.append("output_format", "png");
        if (candidat.input_fidelity) form.append("input_fidelity", candidat.input_fidelity);
        // Le personnage EN PREMIER : c'est lui que la scène doit montrer.
        blobs.forEach(r => form.append("image[]", r.blob, r.nom));
        const route = blobs.length ? "edits" : "generations";
        let corps = form;
        let entetes = { "Authorization": "Bearer " + cles.openai };
        if (!blobs.length) {
            const json = { model: candidat.model, prompt, n: 1, size: window.DESSIN_ILLUSTRATION.taille,
                           quality: window.DESSIN_ILLUSTRATION.qualite, output_format: "png" };
            corps = JSON.stringify(json);
            entetes = { ...entetes, "Content-Type": "application/json" };
        }

        let statut = 0, brut = "";
        try {
            const reponse = await fetch(`https://api.openai.com/v1/images/${route}`, { method: "POST", headers: entetes, body: corps });
            statut = reponse.status;
            brut = await reponse.text();
        } catch (e) {
            throw new Saturee("OpenAI injoignable (" + (e.message || e) + ")");
        }
        console.log(`🎨 [Illustration] ${candidat.model} → HTTP ${statut}`);
        if (statut === 429 || statut >= 500 || brut.includes("error code: 1015") || brut.includes("Rate Limited") || /overloaded/i.test(brut)) {
            throw new Saturee(`IA d'image saturée (HTTP ${statut})`);
        }
        if (statut === 404 || brut.includes("model_not_found") || brut.includes("does not support")) continue;
        if (statut < 200 || statut >= 300) throw new Definitive(`OpenAI HTTP ${statut} : ${brut.slice(0, 300)}`);
        let json;
        try { json = JSON.parse(brut); } catch (e) { throw new Definitive("réponse d'image illisible"); }
        const image = json.data && json.data[0];
        if (!image) throw new Definitive("aucune image rendue");
        return image.url || ("data:image/png;base64," + image.b64_json);
    }
    throw new Definitive("aucun modèle d'image disponible");
}

// -------------------------------------------------------------------------
//  3. L'HÉBERGEMENT (Cloudinary)
// -------------------------------------------------------------------------
// Recadre au centre au format unique (5:4), en PNG sans perte. Une image qu'on ne peut
// pas lire ici (adresse d'un autre domaine) part telle quelle : Cloudinary la
// recadrera à la livraison.
async function recadrerAuFormat(image) {
    const { largeur, hauteur } = window.FORMAT_ILLUSTRATION;
    try {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = image;
        await img.decode();
        const ratio = largeur / hauteur;
        let sw = img.width, sh = img.width / ratio;
        if (sh > img.height) { sh = img.height; sw = img.height * ratio; }
        const canvas = document.createElement("canvas");
        canvas.width = largeur; canvas.height = hauteur;
        canvas.getContext("2d").drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, largeur, hauteur);
        return canvas.toDataURL("image/png");
    } catch (e) {
        return image;
    }
}

async function hebergerIllustration(image, cles) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const dossier = "Competences";
    const signature = await window.signatureCloudinaryIvalis(`folder=${dossier}&timestamp=${timestamp}${cles.cloudSecret}`);
    const form = new FormData();
    form.append("file", image); form.append("api_key", cles.cloudKey);
    form.append("timestamp", timestamp); form.append("signature", signature); form.append("folder", dossier);
    let json;
    try {
        const res = await fetch(`https://api.cloudinary.com/v1_1/${cles.cloudName}/image/upload`, { method: "POST", body: form });
        if (res.status === 429 || res.status >= 500) throw new Saturee(`Cloudinary saturé (HTTP ${res.status})`);
        json = await res.json();
    } catch (e) {
        if (e instanceof Saturee) throw e;
        throw new Saturee("Cloudinary injoignable (" + (e.message || e) + ")");
    }
    if (!json || !json.secure_url) throw new Definitive("Cloudinary n'a pas rendu d'adresse");
    const { largeur, hauteur } = window.FORMAT_ILLUSTRATION;
    return json.secure_url.replace("/upload/", `/upload/c_fill,g_center,w_${largeur},h_${hauteur}/q_auto:best,f_auto/`);
}

// La carte déjà chargée prend son image tout de suite, et si elle est ouverte
// sous les yeux du joueur, elle se redessine.
function rafraichirCaches(commande, url) {
    const caches = [window.COMPETENCES_CACHE, (window.CACHE_COMPETENCES_GLOBAL || {})[commande.idPerso]];
    caches.forEach(c => { if (c && c[commande.idComp]) c[commande.idComp].URL_Image = url; });
    const carte = document.getElementById("apercu-carte-hd-competence");
    if (carte && carte.dataset.cardId === commande.idComp && carte.style.display !== "none"
        && typeof window.afficherApercuCarteHD === "function") {
        window.afficherApercuCarteHD(commande.idComp, carte.dataset.locked === "true");
    }
}

// =========================================================================
//  L'IMAGE SUR LA CARTE : SON CADRAGE
// =========================================================================
//  Où l'illustration se pose sur la carte HD (340 × 476) : en % de la carte.
//  Elle est TOUJOURS sous l'image de la carte (le cadre, z-index 2) et
//  au-dessus de son fond de couleur : elle ne se voit que par la fenêtre
//  transparente du cadre, qui la borde. Aucun réglage ne la fait passer devant.
//  La fenêtre transparente de l'image de la carte (competance_carte, 879 ×
//  1216) va de x 129 à 748 et de y 116 à 612 : 14,7 → 85,2 % de large,
//  9,5 → 50,4 % de haut. L'illustration la déborde d'un point de chaque côté,
//  sous le cadre, pour ne jamais laisser de liseré vide. Cadrage validé par
//  Nico (l'outil de réglage provisoire est retiré).
window.REGLAGE_ILLUSTRATION_CARTE = Object.freeze({
    haut: 8.5, gauche: 13.7, largeur: 72.5, hauteur: 42.9,   // le cadre de l'image, en % de la carte
    cadrageX: 50, cadrageY: 50,                              // le point de l'image gardé au centre (object-position)
    zoom: 100,                                               // en %
    arrondi: 0                                               // coins, en px (le cadre les cache)
});
// Un ancien réglage local (de l'outil provisoire) n'a plus cours.
try { localStorage.removeItem("ivalis_reglage_illustration_carte"); } catch (e) {}

// Le style de l'image et de son cadre.
window.styleIllustrationCarte = function(r = window.REGLAGE_ILLUSTRATION_CARTE) {
    return {
        cadre: `position: absolute; top: ${r.haut}%; left: ${r.gauche}%; width: ${r.largeur}%; height: ${r.hauteur}%; `
             + `overflow: hidden; border-radius: ${r.arrondi}px; z-index: 1; pointer-events: none;`,
        image: `width: 100%; height: 100%; object-fit: cover; object-position: ${r.cadrageX}% ${r.cadrageY}%; `
             + `transform: scale(${r.zoom / 100}); transform-origin: ${r.cadrageX}% ${r.cadrageY}%; display: block;`
    };
};

// Le HTML à glisser dans la carte HD (competences.js) : l'image si la carte en a une.
window.htmlIllustrationCarte = function(data) {
    if (!data || !data.URL_Image) return "";
    const st = window.styleIllustrationCarte();
    return `<div class="illustration-carte-hd" style="${st.cadre}"><img src="${data.URL_Image}" alt="" style="${st.image}"></div>`;
};

// Au démarrage : ce qui attendait dans la file reprend.
setTimeout(() => { if (lireFile().length) { afficherBadge(); traiterFile(); } }, 4000);

// Pour les bancs.
window.ILLUSTRATION = { lireFile, armesDeReference, promptDeSecours, traiterFile, Saturee, Definitive,
                        occupee: () => enCours };
