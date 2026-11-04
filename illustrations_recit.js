// =========================================================================
//  IVALIS — MIA_ILLUSTRATEUR : LES CROQUIS DU RÉCIT (v314)
// =========================================================================
//  Nico : « un nouvel agent IA, qui se lance après que le Narrateur a écrit.
//  Il analyse les derniers posts des joueurs et le dernier post du Narrateur,
//  et cherche s'il y a une situation rigolote, dramatique, ou quelque chose de
//  marquant / attachant, pour en faire une petite illustration qui se dessine,
//  de taille aléatoire, dans le livre à la suite du paragraphe en cours. Les
//  mêmes paramètres de qualité que les tokens ; les images des personnages et
//  leurs noms en référence, comme pour les avatars ; un croquis à la plume sur
//  fond violet, détouré comme les avatars. Une scène, ou un personnage en
//  particulier. S'il découvre un PNJ nommé qui n'existe pas dans la base, il
//  crée son image dans ce même style, l'affiche en pleine page sur la
//  prochaine page libre, et range son image dans la base. »
//
//  Le poste qui a fait parler le Narrateur l'appelle (ia_master.js) :
//    1. le texte (Gemini) : y a-t-il un moment à dessiner ? lequel ? quels
//       héros, quels PNJ nommés y apparaissent ?
//    2. l'image (gpt-image, qualité « low » comme les pions) : un croquis à
//       l'encre sur fond magenta, les portraits des héros (et des PNJ connus)
//       en références ; puis le détourage et le dépôt (televerserImageDetouree) ;
//    3. le message du Narrateur reçoit son Illustration (url, proportions,
//       taille au hasard) : le livre la pose après ses paragraphes
//       (grimoire_recit.js) ;
//    4. les PNJ nommés sans portrait : leur croquis en pied, rangé dans leur
//       fiche (Monde_PNJ, créée s'il le faut), et posé en pleine page
//       (Portraits_PNJ du message).
//  Pas à chaque réponse : seulement quand l'IA trouve un vrai moment, et au
//  plus une illustration toutes les deux réponses du Narrateur.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, updateDoc, setDoc, getDocs, collection, query, where } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const R = window.REGLAGES_ILLUSTRATIONS = window.REGLAGES_ILLUSTRATIONS || {
    actif: true,
    ecart: 2,                 // au plus une illustration toutes les N réponses du Narrateur
    qualite: "low",           // comme les pions (window.QUALITE_PION_ENNEMI)
    tailleMin: 0.42, tailleMax: 0.82,   // largeur de l'illustration, en part de la page
    portraitsMax: 2           // portraits pleine page par réponse, au plus
};

const lireCles = () => (typeof window.clesApiIvalis === "function" ? window.clesApiIvalis() : {});
const aLesCles = () => { const c = lireCles(); return !!(c.openai && c.cloudName && c.cloudKey && c.cloudSecret) && typeof window.fetchGemini === "function"; };
const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const memeNom = (a, b) => { const x = sansAccent(a), y = sansAccent(b); return !!x && !!y && (x === y || x.split(/\s+/)[0] === y.split(/\s+/)[0]); };
const herosDeLaPartie = () => (window.PERSOS_JOUEURS_PARTIE || window.PERSOS_PARTIE || []).filter(p => p && !p.estIllusion && (!p.camp || p.camp === "Allié"));

// LA CADENCE : les réponses du Narrateur depuis la dernière illustration (par partie).
const cleCadence = () => "ivalis_illus_ecart_" + (window.ID_PARTIE_COURANTE || "");
const lireEcart = () => { try { return Number(localStorage.getItem(cleCadence()) || 99); } catch (e) { return 99; } };
const ecrireEcart = (n) => { try { localStorage.setItem(cleCadence(), String(n)); } catch (e) {} };

// ---------------------------------------------------------------------
//  1. LE REGARD : Y A-T-IL UN MOMENT À DESSINER ?
// ---------------------------------------------------------------------
const PROMPT_AGENT = `Tu es MIA_ILLUSTRATEUR, l'illustrateur du carnet de voyage d'un groupe d'aventuriers (jeu de rôle, Antiquité fantastique). Après chaque réponse du Narrateur, tu lis les dernières actions des joueurs et cette réponse, et tu décides s'il y a UN moment qui mérite un petit croquis à la plume dans le carnet.

QUAND DESSINER : seulement un moment qui marque — drôle (une maladresse, une réplique, une situation absurde), dramatique (un danger, une perte, un affrontement, une révélation), ou attachant (un geste tendre, une rencontre, un instant de camaraderie), ou un lieu saisissant. Une réponse banale (on marche, on parle de la route, on achète du pain) : NE DESSINE PAS. Dans le doute, ne dessine pas.

QUOI DESSINER : soit une SCÈNE (deux ou trois personnages en action, un lieu), soit UN PERSONNAGE en particulier (un héros, un PNJ). Décris concrètement ce que montre le croquis, en anglais, en une ou deux phrases (qui, quoi, où, l'attitude) — pas d'abstraction, pas de texte dans l'image.

LES HÉROS : n'en cite que ceux qui apparaissent DANS le croquis (leur prénom exact, dans la liste fournie).
LES PNJ NOMMÉS : liste TOUS les personnages non-joueurs désignés par un VRAI nom propre dans la réponse du Narrateur (pas les héros, pas « l'aubergiste », pas un nom inventé par un héros pour bluffer), avec leur race (parmi celles du monde, Humain par défaut) et une description physique précise tirée du texte (ou plausible). Indique aussi ceux qui apparaissent dans le croquis.

Réponds UNIQUEMENT en JSON :
{"illustrer": true, "moment": "drôle|dramatique|attachant|lieu", "sujet": "scene|personnage", "description": "...", "heros": ["Kaya"], "pnj_dans_le_croquis": ["Varos"], "pnj_nommes": [{"nom": "Varos", "race": "Humain", "description_physique": "..."}]}
ou {"illustrer": false, "pnj_nommes": [...]}`;

async function demanderAgent(texteJoueurs, texteMJ) {
    const heros = herosDeLaPartie().map(h => `${h.prenom}${h.genre ? ` (${/f/i.test(h.genre) ? "femme" : "homme"})` : ""}${h.race ? ", " + h.race : ""}`).join(" ; ");
    const corps = JSON.stringify({
        systemInstruction: { parts: [{ text: PROMPT_AGENT }] },
        contents: [{ role: "user", parts: [{ text: `--- LES HÉROS ---\n${heros || "(aucun)"}\n\n--- LES DERNIERS MESSAGES DES JOUEURS ---\n${texteJoueurs || "(rien)"}\n\n--- LA RÉPONSE DU NARRATEUR ---\n${texteMJ}` }] }],
        generationConfig: { temperature: 0.5, responseMimeType: "application/json" }
    });
    const rep = await window.fetchGemini("illustrateur", corps);
    if (!rep || !rep.ok) throw new Error("MIA_ILLUSTRATEUR : HTTP " + (rep && rep.status));
    const j = await rep.json();
    const texte = (((j.candidates || [])[0] || {}).content || {}).parts?.map(p => p.text || "").join("") || "";
    const debut = texte.indexOf("{"), fin = texte.lastIndexOf("}");
    return JSON.parse(debut >= 0 ? texte.slice(debut, fin + 1) : "{}");
}

// ---------------------------------------------------------------------
//  2. LE CROQUIS : gpt-image, l'encre sur le magenta, détouré
// ---------------------------------------------------------------------
const STYLE_CROQUIS = "A quick pen-and-ink sketch drawn with a quill in the margin of an old adventurer's travel journal: "
    + "confident dark brown-black iron-gall ink lines, loose hatching and cross-hatching for the shadows, a few small ink blots, "
    + "lively and expressive like a master's study sketch. Ink only: no colour, no grey wash, no paper texture, no frame, no border, "
    + "no text, no letters, no signature. The drawing floats alone on a flat, clean, pure fluorescent magenta (#FF00FF) background used "
    + "as a chroma key: every empty area is that exact magenta, with no gradient, no ground shadow, no paper. The magenta is only a "
    + "chroma key: the ink lines never take any purple, pink or magenta tint. "
    + "Universe: Mythic Ancient Fantasy (Greco-Roman antiquity with magic — bronze, leather and linen, crested helmets, chitons and cloaks; "
    + "never medieval plate armour, never a crossbow or any firearm).";

const CADRAGES = { scene: "1536x1024", personnage: "1024x1024", portrait: "1024x1536" };
const ratioDe = (taille) => { const [w, h] = taille.split("x").map(Number); return +(w / h).toFixed(4); };

async function dessiner(prompt, references, cadrage) {
    const cles = lireCles();
    const taille = CADRAGES[cadrage] || "1024x1024";
    const blobs = [];
    for (const r of references || []) {
        if (!r.url || typeof window.imageVersBlobPng !== "function") continue;
        const b = await window.imageVersBlobPng(r.url).catch(() => null);
        if (b) blobs.push({ ...r, blob: b });
        if (blobs.length >= 4) break;
    }
    const refsTexte = blobs.length ? " The reference images show the characters to draw, in this order: "
        + blobs.map((b, i) => `image ${i + 1} is ${b.nom}${b.qui ? " (" + b.qui + ")" : ""}`).join("; ")
        + ". Keep each one recognisable (face, hair, build, clothing), translated into the ink sketch style. Do not copy their backgrounds or colours." : "";
    const texte = `${STYLE_CROQUIS}${refsTexte} The sketch shows: ${prompt}`;
    const modeles = ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"];
    const delais = [5000, 15000, 30000];
    let json = null;
    for (const model of modeles) {
        for (let essai = 0; essai < 3 && !json; essai++) {
            let statut = 0, rep = "";
            try {
                let r;
                if (blobs.length) {
                    const form = new FormData();
                    form.append("model", model);
                    form.append("prompt", texte);
                    blobs.forEach((b, i) => form.append("image[]", b.blob, `ref${i + 1}.png`));
                    form.append("n", "1"); form.append("size", taille); form.append("quality", R.qualite); form.append("output_format", "png");
                    if (model !== "gpt-image-2") form.append("input_fidelity", "high");
                    r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": "Bearer " + cles.openai }, body: form });
                } else {
                    r = await fetch("https://api.openai.com/v1/images/generations", {
                        method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + cles.openai },
                        body: JSON.stringify({ model, prompt: texte, n: 1, size: taille, quality: R.qualite, output_format: "png", moderation: "low" })
                    });
                }
                statut = r.status; rep = await r.text();
            } catch (e) { rep = "error code: 1015"; }
            if (statut === 429 || rep.includes("error code: 1015") || rep.includes("Rate Limited")) { await new Promise(ok => setTimeout(ok, delais[essai])); continue; }
            if (statut === 404 || rep.includes("model_not_found") || rep.includes("does not support")) break;
            try { const j = JSON.parse(rep); if (j && j.data && j.data.length) json = j; } catch (e) {}
            break;
        }
        if (json) break;
    }
    if (!json) throw new Error("MIA_ILLUSTRATEUR : aucune image");
    const source = json.data[0].url || ("data:image/png;base64," + json.data[0].b64_json);
    const url = typeof window.televerserImageDetoureeIvalis === "function"
        ? await window.televerserImageDetoureeIvalis(source, cadrage === "portrait" ? "PNJ" : "Recit/Illustrations", cles) : "";
    if (!url) throw new Error("MIA_ILLUSTRATEUR : dépôt impossible");
    return { url, ratio: ratioDe(taille) };
}

// ---------------------------------------------------------------------
//  LES PNJ : ceux de la base, ceux qui manquent
// ---------------------------------------------------------------------
async function fichesPnj(noms, connus) {
    const trouves = {};
    // (ceux qui ont déjà leur portrait suffisent ; les autres, on cherche leur fiche pour la compléter)
    Object.values(connus || {}).forEach(p => { if (p && p.Nom_PNJ && p.URL_Cloudinary) noms.forEach(n => { if (memeNom(n, p.Nom_PNJ)) trouves[n] = { ...p }; }); });
    const restent = noms.filter(n => !trouves[n]);
    if (restent.length) {
        try {
            // (le nom exact ; les PNJ de la scène, eux, arrivent par `connus`)
            const snap = await getDocs(query(collection(db, "Monde_PNJ"), where("Nom_PNJ", "in", restent.slice(0, 10))));
            snap.forEach(d => { const x = d.data() || {}; restent.forEach(n => { if (memeNom(n, x.Nom_PNJ)) trouves[n] = { ...x, __id: d.id }; }); });
        } catch (e) { console.warn("[MIA_ILLUSTRATEUR] Lecture des PNJ :", e); }
    }
    return trouves;
}
// Un PNJ nommé sans portrait : son croquis en pied, rangé dans sa fiche (créée s'il le faut).
async function portraitDuPnj(p, fiche) {
    const description = (fiche && fiche.Description_Physique) || p.description_physique || "";
    const race = (fiche && fiche.Race) || p.race || "Humain";
    const img = await dessiner(`a full-length portrait of ${p.nom}, a ${race}: ${description}. Standing, three-quarter view, the whole figure from head to feet.`, [], "portrait");
    let id = fiche && fiche.__id;
    try {
        if (id) await updateDoc(doc(db, "Monde_PNJ", id), { URL_Cloudinary: img.url });
        else {
            id = `PNJ_${Math.floor(Math.random() * 10000).toString().padStart(4, "0")}_${p.nom.replace(/[^a-zA-Z0-9]/g, "_")}`;
            await setDoc(doc(db, "Monde_PNJ", id), {
                Nom_PNJ: p.nom, Race: race, Description_Physique: description, URL_Cloudinary: img.url,
                Statut: "Vivant", Occupation: "", Secret_Mental: "", Style_De_Parole: "", ID_Lieu: "", ID_Batiment: "",
                Origine: "MIA_ILLUSTRATEUR", ID_Partie: window.ID_PARTIE_COURANTE || "", Cree_Le: Date.now()
            });
        }
    } catch (e) { console.error("[MIA_ILLUSTRATEUR] La fiche du PNJ :", e); }
    return { Nom: p.nom, Url: img.url, Ratio: img.ratio };
}

// ---------------------------------------------------------------------
//  L'APPEL (ia_master.js, après la réponse du Narrateur)
// ---------------------------------------------------------------------
// `options` : { idMessage, texteMJ, texteJoueurs, pnjConnus }.
window.illustrerLeRecit = async function (options) {
    const o = options || {};
    if (!R.actif || !o.idMessage || !o.texteMJ || !aLesCles()) return null;
    const ecart = lireEcart() + 1;
    ecrireEcart(ecart);
    let avis;
    try { avis = await demanderAgent(o.texteJoueurs || "", o.texteMJ); }
    catch (e) { console.warn("[MIA_ILLUSTRATEUR]", e); return null; }
    const ref = doc(db, "Messages_Chat", o.idMessage);
    const resultat = { illustration: null, portraits: [] };

    // LES PNJ NOMMÉS SANS PORTRAIT : en pleine page (au plus deux).
    const nommes = (Array.isArray(avis.pnj_nommes) ? avis.pnj_nommes : []).filter(p => p && p.nom
        && !herosDeLaPartie().some(h => memeNom(h.prenom, p.nom)));
    const fiches = nommes.length ? await fichesPnj(nommes.map(p => p.nom), o.pnjConnus) : {};
    const sansPortrait = nommes.filter(p => !(fiches[p.nom] && fiches[p.nom].URL_Cloudinary)).slice(0, R.portraitsMax);
    const promessesPortraits = sansPortrait.map(p => portraitDuPnj(p, fiches[p.nom]).catch(e => { console.warn("[MIA_ILLUSTRATEUR] Portrait de " + p.nom, e); return null; }));

    // LE CROQUIS DU MOMENT.
    if (avis.illustrer && avis.description && ecart >= R.ecart) {
        const refs = [];
        (avis.heros || []).forEach(n => {
            const h = herosDeLaPartie().find(x => memeNom(x.prenom, n));
            if (h) refs.push({ nom: h.prenom, qui: [h.genre && /f/i.test(h.genre) ? "a woman" : h.genre ? "a man" : "", h.race].filter(Boolean).join(", "), url: h.urlPortraitReference || h.urlCloudinary || "" });
        });
        (avis.pnj_dans_le_croquis || []).forEach(n => { const f = Object.values(fiches).find(x => memeNom(x.Nom_PNJ, n)); if (f && f.URL_Cloudinary) refs.push({ nom: f.Nom_PNJ, qui: f.Race || "", url: f.URL_Cloudinary }); });
        try {
            const img = await dessiner(avis.description, refs, avis.sujet === "personnage" ? "personnage" : "scene");
            const taille = +(R.tailleMin + Math.random() * (R.tailleMax - R.tailleMin)).toFixed(3);
            resultat.illustration = { Url: img.url, Ratio: img.ratio, Taille: taille, Moment: String(avis.moment || ""), Sujet: avis.sujet === "personnage" ? "personnage" : "scene", Le: Date.now() };
            await updateDoc(ref, { Illustration: resultat.illustration });
            ecrireEcart(0);
            console.log(`🖋️ [MIA_ILLUSTRATEUR] Un croquis (${resultat.illustration.Moment}) : ${avis.description}`);
        } catch (e) { console.warn("[MIA_ILLUSTRATEUR] Le croquis :", e); }
    }
    resultat.portraits = (await Promise.all(promessesPortraits)).filter(Boolean);
    if (resultat.portraits.length) {
        try { await updateDoc(ref, { Portraits_PNJ: resultat.portraits }); } catch (e) { console.error("[MIA_ILLUSTRATEUR] Les portraits :", e); }
        console.log(`🖋️ [MIA_ILLUSTRATEUR] ${resultat.portraits.length} portrait(s) en pleine page : ${resultat.portraits.map(p => p.Nom).join(", ")}`);
    }
    return resultat;
};
