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
//
//  v315 (Nico : « l'IA n'a pas reçu le design de mes personnages, elle a créé
//  trois personnages inconnus ; utilise le même procédé que pour l'image de
//  référence de l'avatar quand il change d'habit ; l'image est pixelisée ; pas
//  forcément de fond, on ne dessine que ce qui est strictement important ») :
//    · les héros se lisent dans les DEUX listes de la partie (la liste des
//      joueurs pouvait être vide : aucun héros, aucune référence) ; ceux du
//      croquis sont ceux que l'agent nomme, plus ceux dont le prénom est écrit
//      dans sa description ; s'il parle du groupe sans les nommer, ceux que le
//      Narrateur cite ;
//    · comme pour l'avatar rhabillé (objets_ia.js, dessinerAvatarHabille) :
//      chaque portrait de référence (urlPortraitReference, sinon l'avatar),
//      mis en PNG carré sur le magenta (imageVersBlobPng), joint en image[] à
//      /v1/images/edits, dans l'ordre annoncé par le texte, qualité
//      « medium » ; un héros dont le portrait ne se lit pas : pas de croquis
//      (plutôt rien que trois inconnus) ; un héros qui n'a encore aucun
//      portrait : décrit en mots (genre, race, classe) ;
//    · qualité « medium » (au lieu de « low ») et dépôt en q_auto:best ;
//    · le croquis ne montre que l'essentiel : les personnages, et un décor
//      seulement s'il sert ce qu'on raconte.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, updateDoc, setDoc, getDocs, collection, query, where } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const R = window.REGLAGES_ILLUSTRATIONS = window.REGLAGES_ILLUSTRATIONS || {
    actif: true,
    ecart: 2,                 // au plus une illustration toutes les N réponses du Narrateur
    qualite: "medium",        // v315 : « low » donnait un trait pixelisé (l'avatar rhabillé : medium)
    tailleMin: 0.42, tailleMax: 0.82,   // largeur de l'illustration, en part de la page
    portraitsMax: 2           // portraits pleine page par réponse, au plus
};

const lireCles = () => (typeof window.clesApiIvalis === "function" ? window.clesApiIvalis() : {});
const aLesCles = () => { const c = lireCles(); return !!(c.openai && c.cloudName && c.cloudKey && c.cloudSecret) && typeof window.fetchGemini === "function"; };
const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const memeNom = (a, b) => { const x = sansAccent(a), y = sansAccent(b); return !!x && !!y && (x === y || x.split(/\s+/)[0] === y.split(/\s+/)[0]); };
// (v315 : les deux listes, réunies — PERSOS_JOUEURS_PARTIE peut être un tableau vide.)
function herosDeLaPartie() {
    const vus = new Set();
    return [...(window.PERSOS_JOUEURS_PARTIE || []), ...(window.PERSOS_PARTIE || [])].filter(p => {
        if (!p || p.estIllusion || p.estMonstre || (p.camp && p.camp !== "Allié") || !p.prenom) return false;
        const cle = p.idPersonnage || p.prenom;
        if (vus.has(cle)) return false;
        vus.add(cle);
        return true;
    });
}
// Le prénom écrit dans un texte, en mot entier (sans accents ni casse).
const nommeDans = (texte, prenom) => {
    const t = " " + sansAccent(texte).replace(/[^a-z0-9]+/g, " ") + " ";
    const n = sansAccent(prenom).replace(/[^a-z0-9]+/g, " ").trim();
    return !!n && t.includes(" " + n + " ");
};
// LES HÉROS DU CROQUIS : ceux que l'agent nomme, ceux que sa description
// nomme ; s'il parle d'eux sans les nommer (« the heroes », « the group »…),
// ceux que le Narrateur cite.
function herosDuCroquis(avis, texteMJ) {
    const tous = herosDeLaPartie();
    const choisis = tous.filter(h => (avis.heros || []).some(n => memeNom(h.prenom, n)) || nommeDans(avis.description || "", h.prenom));
    if (!choisis.length && /\b(heroes|hero|heroine|adventurers?|companions?|party|group|travell?ers?|friends)\b/i.test(avis.description || "")) {
        return tous.filter(h => nommeDans(texteMJ || "", h.prenom)).slice(0, 4);
    }
    return choisis.slice(0, 4);
}
const decrireHeros = (h) => [h.genre ? (/f/i.test(h.genre) ? "a woman" : "a man") : "", h.race, h.classe].filter(Boolean).join(", ");
window.herosDuCroquisIllustrateur = herosDuCroquis;   // (pour les bancs)

// LA CADENCE : les réponses du Narrateur depuis la dernière illustration (par partie).
const cleCadence = () => "ivalis_illus_ecart_" + (window.ID_PARTIE_COURANTE || "");
const lireEcart = () => { try { return Number(localStorage.getItem(cleCadence()) || 99); } catch (e) { return 99; } };
const ecrireEcart = (n) => { try { localStorage.setItem(cleCadence(), String(n)); } catch (e) {} };

// ---------------------------------------------------------------------
//  1. LE REGARD : Y A-T-IL UN MOMENT À DESSINER ?
// ---------------------------------------------------------------------
const PROMPT_AGENT = `Tu es MIA_ILLUSTRATEUR, l'illustrateur du carnet de voyage d'un groupe d'aventuriers (jeu de rôle, Antiquité fantastique). Après chaque réponse du Narrateur, tu lis les dernières actions des joueurs et cette réponse, et tu décides s'il y a UN moment qui mérite un petit croquis à la plume dans le carnet.

QUAND DESSINER : seulement un moment qui marque — drôle (une maladresse, une réplique, une situation absurde), dramatique (un danger, une perte, un affrontement, une révélation), ou attachant (un geste tendre, une rencontre, un instant de camaraderie), ou un lieu saisissant. Une réponse banale (on marche, on parle de la route, on achète du pain) : NE DESSINE PAS. Dans le doute, ne dessine pas.

QUOI DESSINER : soit une SCÈNE (les personnages en action), soit UN PERSONNAGE en particulier (un héros, un PNJ), soit un LIEU saisissant. Ne dessine QUE ce qui est strictement important pour raconter le moment : les personnages concernés et, seulement s'il est indispensable, l'objet ou l'élément avec lequel ils agissent. PAS de décor ni d'arrière-plan, sauf si le lieu est lui-même le sujet ou qu'il est nécessaire pour comprendre le moment. Décris concrètement ce que montre le croquis, en anglais, en une ou deux phrases (qui, quoi, l'attitude) — pas d'abstraction, pas de texte dans l'image.

LES HÉROS : cite TOUS ceux qui apparaissent DANS le croquis (leur prénom exact, dans la liste fournie), et dans la description, désigne chacun par son prénom exact (jamais « a warrior », « the adventurers » : « Kaya », « Thorin »). N'ajoute AUCUN personnage anonyme qui ne serait pas dans la réponse du Narrateur.
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
    + "lively and expressive like a master's study sketch, crisp clean high-resolution lines. "
    + "Draw ONLY what matters for the moment: the characters and, if essential, the one object or element they act with. "
    + "No background, no scenery, no ground line, unless the place itself is the subject. Ink only: no colour, no grey wash, no paper texture, no frame, no border, "
    + "no text, no letters, no signature. The drawing floats alone on a flat, clean, pure fluorescent magenta (#FF00FF) background used "
    + "as a chroma key: every empty area is that exact magenta, with no gradient, no ground shadow, no paper. The magenta is only a "
    + "chroma key: the ink lines never take any purple, pink or magenta tint. "
    + "Universe: Mythic Ancient Fantasy (Greco-Roman antiquity with magic — bronze, leather and linen, crested helmets, chitons and cloaks; "
    + "never medieval plate armour, never a crossbow or any firearm).";

const CADRAGES = { scene: "1536x1024", personnage: "1024x1024", portrait: "1024x1536" };
const ratioDe = (taille) => { const [w, h] = taille.split("x").map(Number); return +(w / h).toFixed(4); };

async function dessiner(prompt, references, cadrage, options) {
    const o = options || {};
    const cles = lireCles();
    const taille = CADRAGES[cadrage] || "1024x1024";
    // LES RÉFÉRENCES, comme l'avatar rhabillé : le portrait mis en PNG carré sur
    // le magenta (imageVersBlobPng), joint dans l'ordre que le texte annonce.
    const blobs = [];
    for (const r of references || []) {
        if (!r.url || typeof window.imageVersBlobPng !== "function") continue;
        const b = await window.imageVersBlobPng(r.url).catch(() => null);
        if (b) blobs.push({ ...r, blob: b });
        else console.warn(`[MIA_ILLUSTRATEUR] Le portrait de ${r.nom} est illisible (${r.url}).`);
        if (blobs.length >= 4) break;
    }
    // Des héros sans leur image : on ne dessine pas des inconnus à leur place.
    if (o.herosAttendus && blobs.filter(b => b.heros).length < o.herosAttendus) {
        throw new Error(`MIA_ILLUSTRATEUR : ${o.herosAttendus} héros attendus, ${blobs.filter(b => b.heros).length} référence(s) lisible(s) — pas de croquis`);
    }
    console.log(`🖋️ [MIA_ILLUSTRATEUR] ${blobs.length} référence(s) jointe(s)${blobs.length ? " : " + blobs.map(b => b.nom).join(", ") : ""}.`);
    const refsTexte = blobs.length ? ` The ${blobs.length} attached reference image${blobs.length > 1 ? "s show" : " shows"} the EXACT character${blobs.length > 1 ? "s" : ""} to draw, in this order: `
        + blobs.map((b, i) => `image ${i + 1} is ${b.nom}${b.qui ? " (" + b.qui + ")" : ""}`).join("; ")
        + ". Each of them must be clearly recognisable as the person in their reference image: same face, hairstyle, hair colour, beard or not, build, "
        + "age, clothing and equipment — only translated into the ink sketch style. Do not copy the references' backgrounds or colours. "
        + "Do not add any other person than those named here and in the description." : "";
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
    const depot = typeof window.televerserImageDetoureeIvalis === "function"
        ? await window.televerserImageDetoureeIvalis(source, cadrage === "portrait" ? "PNJ" : "Recit/Illustrations", cles) : "";
    if (!depot) throw new Error("MIA_ILLUSTRATEUR : dépôt impossible");
    // (Un trait d'encre : la compression automatique la plus fine, pas d'escalier.)
    const url = String(depot).replace("/upload/q_auto,f_auto/", "/upload/q_auto:best,f_auto/");
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
        const heros = herosDuCroquis(avis, o.texteMJ);
        heros.forEach(h => refs.push({ nom: h.prenom, qui: decrireHeros(h), url: h.urlPortraitReference || h.urlCloudinary || "", heros: true }));
        // Les héros du croquis se nomment dans la description (le dessinateur
        // relie ainsi chaque prénom à son image).
        const manquants = heros.filter(h => !nommeDans(avis.description, h.prenom)).map(h => h.prenom);
        if (manquants.length) avis.description += ` (With ${manquants.join(" and ")}.)`;
        (avis.pnj_dans_le_croquis || []).forEach(n => { const f = Object.values(fiches).find(x => memeNom(x.Nom_PNJ, n)); if (f && f.URL_Cloudinary) refs.push({ nom: f.Nom_PNJ, qui: f.Race || "", url: f.URL_Cloudinary }); });
        try {
            // (Un héros qui n'a encore aucun portrait se dit en mots ; celui dont le
            // portrait existe mais ne se lit pas arrête le croquis.)
            const sansImage = heros.filter(h => !(h.urlPortraitReference || h.urlCloudinary));
            if (sansImage.length) avis.description += " " + sansImage.map(h => `${h.prenom} is ${decrireHeros(h) || "an adventurer"}.`).join(" ");
            const img = await dessiner(avis.description, refs, avis.sujet === "personnage" ? "personnage" : "scene", { herosAttendus: heros.length - sansImage.length });
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
