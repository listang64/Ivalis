// v408 — LES PORTRAITS DES PNJ NOMMÉS, REMIS EN MARCHE.
//
// Nico : « avant toute chose, remets en marche les portraits des PNJ nommés ».
// La pause de la v300 (PORTRAITS_PNJ_EN_PAUSE, ia_master.js) est levée : un
// visage préparé que le MJ fait entrer (MIA_CASTING) et les noms rattrapés après
// son texte (MIA_PNJ) sont peints par le procédé de l'avatar ; le livre les pose
// en pleine page de droite (Portraits_PNJ du message, v346), et MIA_ILLUSTRATEUR
// ajoute les siens après eux sans les effacer.
//
// Sur la VRAIE page, Firestore en mémoire, Gemini (en flux), OpenAI et
// Cloudinary simulés (le harnais du banc v292, sans lever la pause à la main).
// Lancer : node tests_monstres/corrections_v408.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const titre = (t) => console.log("\n" + t);
const section = async (corps) => { try { await corps(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 160)); } };
const lire = (f) => { try { return fs.readFileSync(path.join(RACINE, f), 'utf-8'); } catch (e) { return ""; } };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' }); res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({}); export const getApp = () => ({});`;
// Firestore en mémoire : chaque écriture change window.__docs ; une écriture
// de la partie revient au jeu comme l'écoute la lui donnerait (__surPartie).
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, ...c) => ({ col: c.join("/") });
  const SUPPR = { __supprimer: true };
  const docs = () => (window.__docs = window.__docs || {});
  const cloner = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const estMap = (v) => v && typeof v === "object" && !Array.isArray(v) && !v.__supprimer;
  function fusionner(cible, src) {
    Object.entries(src).forEach(([k, v]) => {
      if (v && v.__supprimer) { delete cible[k]; return; }
      if (estMap(v)) { if (!estMap(cible[k])) cible[k] = {}; fusionner(cible[k], v); return; }
      cible[k] = cloner(v);
    });
  }
  function nettoyer(v) { if (estMap(v)) { Object.keys(v).forEach(k => { if (v[k] && v[k].__supprimer) delete v[k]; else nettoyer(v[k]); }); } return v; }
  function ecrire(chemin, data, mode) {
    const d = docs();
    if (mode === "set") d[chemin] = nettoyer(cloner(Object.fromEntries(Object.entries(data).filter(([k, v]) => !(v && v.__supprimer)))));
    else if (mode === "merge") { d[chemin] = d[chemin] || {}; fusionner(d[chemin], data); }
    else if (mode === "update") {
      if (!d[chemin]) throw new Error("document absent : " + chemin);
      Object.entries(data).forEach(([cle, v]) => {
        const parts = cle.split("."); let o = d[chemin];
        for (let i = 0; i < parts.length - 1; i++) { if (!estMap(o[parts[i]])) o[parts[i]] = {}; o = o[parts[i]]; }
        const f = parts[parts.length - 1];
        if (v && v.__supprimer) delete o[f]; else o[f] = nettoyer(cloner(v));
      });
    }
    (window.__journal = window.__journal || []).push({ chemin, mode, t: Date.now(), data: JSON.parse(JSON.stringify(data, (k, v) => v && v.__supprimer ? "<supprimé>" : v)) });
    if (chemin === "Systeme_Parties/P1" && typeof window.__surPartie === "function") {
      const copie = cloner(d[chemin]);
      setTimeout(() => window.__surPartie(copie), 0);
    }
  }
  export const getDoc = async (ref) => { const d = docs()[ref.chemin]; return { exists: () => !!d, data: () => cloner(d || {}) }; };
  export const query = (c, ...contraintes) => ({ col: c.col, contraintes });
  export const where = (champ, op, valeur) => ({ type: "where", champ, op, valeur });
  export const orderBy = (champ) => ({ type: "orderBy", champ }); export const limit = (n) => ({ type: "limit", n });
  export const getDocs = async (q) => {
    const col = q.col; const w = (q.contraintes || []).filter(c => c && c.type === "where");
    const liste = Object.entries(docs()).filter(([k]) => k.startsWith(col + "/") && k.split("/").length === col.split("/").length + 1)
      .filter(([, v]) => w.every(c => c.op === "==" ? v[c.champ] === c.valeur : c.op === "in" ? c.valeur.includes(v[c.champ]) : true))
      .map(([k, v]) => ({ id: k.split("/").pop(), ref: { chemin: k }, data: () => cloner(v) }))
      .sort((a, b) => (a.data().Timestamp || 0) - (b.data().Timestamp || 0));
    return { forEach: (f) => liste.forEach(f), docs: liste, empty: liste.length === 0, size: liste.length };
  };
  export const setDoc = async (ref, data, options) => { ecrire(ref.chemin, data, options && options.merge ? "merge" : "set"); };
  export const updateDoc = async (ref, data) => { ecrire(ref.chemin, data, "update"); };
  export const deleteDoc = async (ref) => { delete docs()[ref.chemin]; (window.__suppressions = window.__suppressions || []).push(ref.chemin); };
  let n = 0;
  export const addDoc = async (c, data) => { const id = "m" + (++n) + "_" + Date.now(); docs()[c.col + "/" + id] = cloner(data); (window.__ajouts = window.__ajouts || []).push({ col: c.col, id, t: Date.now(), data: cloner(data) }); return { id }; };
  export const deleteField = () => SUPPR; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (k) => k; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const writeBatch = () => { const ops = []; return { set(r, d, o){ ops.push(() => ecrire(r.chemin, d, o && o.merge ? "merge" : "set")); }, update(r, d){ ops.push(() => ecrire(r.chemin, d, "update")); },
    delete(r){ ops.push(() => { delete docs()[r.chemin]; }); }, commit: async () => { ops.forEach(f => f()); } }; };
  export const runTransaction = async (_d, fn) => {
    const ops = [];
    const tx = { get: async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => cloner(d || {}) }; },
                 update(r, d) { ops.push(() => ecrire(r.chemin, d, "update")); return tx; },
                 set(r, d, o) { ops.push(() => ecrire(r.chemin, d, o && o.merge ? "merge" : "set")); return tx; },
                 delete(r) { ops.push(() => { delete docs()[r.chemin]; }); return tx; } };
    const res = await fn(tx);
    ops.forEach(f => f());
    return res;
  };
  export const Timestamp = { now: () => Date.now() };
`;
// LES IMAGES : la carte de combat (1536 × 1024), l'arène, les pions, les portraits.
const CARTE = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><rect width="1536" height="1024" fill="#c9b48a"/><rect x="0" y="0" width="1536" height="120" fill="#5a4a3a"/><circle cx="760" cy="520" r="120" fill="#3b6fa0"/><rect x="300" y="700" width="200" height="60" fill="#7a5a3a"/></svg>`;
const ARENE = `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200"><rect width="1800" height="1200" fill="#8a7a5a"/></svg>`;
const PION = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="90" fill="#6b3d1e"/></svg>`;
const PORTRAIT = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="520"><rect width="300" height="520" fill="#ff00ff"/><ellipse cx="150" cy="200" rx="90" ry="160" fill="#c08a5a"/></svg>`;
const URL_ARENE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1789076932/arene_s5qs3e.png";
const URL_PORTRAIT_KORE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1/PNJ/portrait_kore.png";

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'}, body: PORTRAIT }));
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// LES FICHES QUE PRÉPARE MIA_CASTING : Myrto (que le MJ fera entrer) et Damon
// (qu'il ne citera pas).
const MYRTO = { nom: "Myrto", physique: "Jeune femme aux tresses brunes, tablier de lin taché de vin", occupation: "Tavernière", race: "Humain", secret: "Elle cache un fugitif à la cave", style_parole: "Gouailleuse", tenue: "Vestale" };   // (v455) la tenue choisie dans la liste
const DAMON = { nom: "Damon", physique: "Colosse à la barbe rousse et au crâne rasé", occupation: "Videur", race: "Humain", secret: "Il doit de l'argent", style_parole: "Bourru" };
const faux = { casting: [MYRTO, DAMON], castingEnPanne: false, batiment: { action: "nouveau", nouveau_nom: "La Taverne de la Chouette", nouvelle_description: "Une salle enfumée.", nouveaux_stigmates: "Odeur de vin", prompt_image: "tavern" },
               detection: ["Phaedra", "Iris", "Nikias", "Kleon"], narration: null, delaiPortraitMs: 1500 };
const NARRATION_1 = ["La porte de la taverne s'ouvre sur une salle enfumée.\n",
                     "Myrto, la tavernière, lève les yeux de son comptoir.\nMyrto : « Entrez donc, voyageurs ! »\n",
                     "Près du feu, Phaedra, Iris, Nikias et Kleon jouent aux osselets ; un garde somnole dans un coin."];
await p.exposeFunction('__fauxGemini', (o) => Object.assign(faux, o));
const requetes = [], openai = [];
const appel = (nom, args) => JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: nom, args } }] } }] });
await p.route('**generativelanguage.googleapis.com/**', async r => {
  const url = r.request().url();
  const corps = JSON.parse(r.request().postData() || "{}");
  const systeme = corps.systemInstruction ? corps.systemInstruction.parts.map(x => x.text).join("\n") : "";
  const texteU = ((corps.contents && corps.contents[0] && corps.contents[0].parts) || []).filter(x => x.text).map(x => x.text).join("\n");
  const qui = /Continue l'histoire/.test(systeme) ? "NARRATEUR" : /Tu es MIA_CASTING/.test(systeme) ? "MIA_CASTING" : /IA de casting/.test(systeme) ? "DETECTION"
            : /MIA_PNJ, le forgeron/.test(systeme) ? "FORGE" : /MIA_Batiment/.test(systeme) ? "BATIMENT" : /Tu es Mia, l'IA d'analyse/.test(systeme) ? "MIA_FILTRE"
            : (systeme.match(/Tu es (MIA_[A-Z_]+)/) || [])[1] || "AUTRE";
  const req = { qui, t: Date.now(), systeme, texte: texteU };
  requetes.push(req);
  const json = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body });
  if (qui === "NARRATEUR") {
    const morceaux = faux.narration || NARRATION_1;
    r.fulfill({ contentType: 'text/event-stream', headers: {'Access-Control-Allow-Origin':'*'},
                body: morceaux.map(t => "data: " + JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }], usageMetadata: { totalTokenCount: 30 } }) + "\r\n\r\n").join("") });
    return;
  }
  if (qui === "MIA_CASTING") {
    await new Promise(res => setTimeout(res, 400));
    if (faux.castingEnPanne) { json(JSON.stringify({ error: { message: "panne" } }), 500); return; }
    json(appel("preparerPNJ", { pnjs: faux.casting })); return;
  }
  if (qui === "MIA_FILTRE") { await new Promise(res => setTimeout(res, 400)); json(appel("selectionnerPNJ", { noms: [] })); return; }
  if (qui === "DETECTION") { json(appel("signalerNoms", { noms: faux.detection })); return; }
  if (qui === "FORGE") {
    const noms = faux.detection;
    // (v455) Iris : une race écrite au pluriel, en minuscules (« satyres ») — le Grimoire la retrouve.
    json(appel("creerNouveauxPNJ", { pnjs: noms.concat(["Bonus"]).map(n => ({ nom: n, physique: "Joueur d'osselets nommé " + n, occupation: "Joueur", race: n === "Iris" ? "satyres" : "Humain", secret: "Triche", style_parole: "Rieur" })) })); return;
  }
  if (qui === "BATIMENT") { json(appel("gererDecor", faux.batiment)); return; }
  if (qui === "MIA_COMBAT") { json(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ combat: false, raison: "Un accueil." }) }] } }] })); return; }
  json(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }], usageMetadata: { totalTokenCount: 5 } }));
});
await p.route('**api.openai.com/**', async r => {
  const d = r.request().postData() || "";
  const prompt = r.request().url().includes("generations") ? (JSON.parse(d || "{}").prompt || "") : d;
  openai.push({ t: Date.now(), url: r.request().url(), prompt, corps: d });
  await new Promise(res => setTimeout(res, faux.delaiPortraitMs));
  r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ data: [{ b64_json: PNG }] }) });
});
await p.route('**api.cloudinary.com/**', async r => {
  r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ secure_url: `https://res.cloudinary.com/dlkjq4kvg/image/upload/v1/PNJ/portrait_${Date.now()}_${Math.floor(Math.random() * 1e6)}.png` }) });
});
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);
// (v408) La pause N'EST PAS levée par le banc : c'est le jeu qui doit l'avoir levée.
// Un vrai flux : morceau par morceau, une demi-seconde entre chaque.
await p.evaluate(() => {
  const vrai = window.fetch.bind(window);
  window.fetch = async (url, o) => {
    const r = await vrai(url, o);
    if (!/:streamGenerateContent/.test(String(url)) || !r.ok) return r;
    const morceaux = (await r.text()).split(/(?<=\r\n\r\n)/);
    const enc = new TextEncoder();
    const flux = new ReadableStream({ async start(c) {
      for (const m of morceaux) { c.enqueue(enc.encode(m)); await new Promise(res => setTimeout(res, 500)); }
      c.close();
    } });
    return new Response(flux, { status: r.status, headers: r.headers });
  };
});

const preparerTable = () => p.evaluate((URL_PORTRAIT_KORE) => {
  window.jouerSonClic = () => {}; window.confirm = () => true; window.alert = () => {};
  localStorage.setItem("ID_JOUEUR_COURANT", "P_01");
  localStorage.removeItem("ivalis_MJ_MODELE"); localStorage.removeItem("ivalis_MJ_REFLEXION");
  ["GEMINI_API_KEY", "GEMINI_API_KEY_2", "OPENAI_API_KEY", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].forEach(k => localStorage.setItem("ivalis_" + k, "cle-" + k));
  window.ID_PARTIE_COURANTE = "P1";
  window.__docs = {};
  window.__docs["Systeme_Parties/P1"] = { Lieu_Actuel: "L_1", Situation: "Dans un lieu", Ordre_Initiative: ["H1", "H2"], Index_Initiative: 0 };
  window.__docs["Monde_Lieux/L_1"] = { Nom_Du_Lieu: "Le port de Mégara", Description_Global: "Un port de pêche, ses tavernes et ses entrepôts." };
  window.__docs["Monde_PNJ/PNJ_KORE"] = { Nom_PNJ: "Dame Koré", ID_Lieu: "L_1", Race: "Humain", Occupation: "Grande prêtresse", Statut: "Vivant",
    Description_Physique: "Une prêtresse au visage sévère.", URL_Cloudinary: URL_PORTRAIT_KORE };
  window.__docs["Monde_Races/R1"] = { Nom: "Satyre", Descriptif_Physique: "Cornes de bouc enroulées, jambes velues aux sabots fendus, oreilles pointues." };
  window.__docs["Cerveau_IA/INST_10895"] = { Titre_Menu: "MJ", Contenu_Direct: "Tu es le Maître du Jeu de test." };
  window.DATE_EN_JEU_ACTUELLE = { jour: "12", annee: "3" };
  window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Thorin" }, { idPersonnage: "H2", prenom: "Lyra" }];
  window.__docs["Messages_Chat/c1"] = { ID_Partie: "P1", Auteur_ID: "H1", Auteur_Nom: "Thorin", Texte: "J'entre dans la taverne et je salue la tavernière.", Timestamp: Date.now() - 100000 };
  window.__ajouts = []; window.__journal = [];
}, URL_PORTRAIT_KORE);
const attendreQue = async (f, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await p.waitForTimeout(100); } return false; };
const versionsDuMessage = () => p.evaluate(() => {
  const ajout = (window.__ajouts || []).filter(a => a.col === "Messages_Chat" && a.data.Est_Narration_IA).pop();
  if (!ajout) return [];
  const majs = (window.__journal || []).filter(j => j.chemin === "Messages_Chat/" + ajout.id).map(j => ({ t: j.t, ...j.data }));
  return [{ t: ajout.t, ...ajout.data }, ...majs];
});
const pnjEnBase = () => p.evaluate(() => Object.entries(window.__docs).filter(([k]) => k.startsWith("Monde_PNJ/")).map(([k, v]) => ({ id: k, ...v })));
const tourComplet = async () => {
  const avantReq = requetes.length, avantImg = openai.length;
  await p.evaluate(() => { window.declencherTourIA(); });
  const fini = await attendreQue(async () => (await p.evaluate(() => window.__docs["Systeme_Parties/P1"].IA_En_Cours)) === false
                                            && (await versionsDuMessage()).some(v => v.PNJ_Prets === true), 25000);
  await p.waitForTimeout(500);
  return { fini, reqs: requetes.slice(avantReq), imgs: openai.slice(avantImg), versions: await versionsDuMessage() };
};

// =========================================================================
titre("1. LA PAUSE DES PORTRAITS (v300) EST LEVÉE PAR LE JEU");
// =========================================================================
await section(async () => {
  const pause = await p.evaluate(() => window.PORTRAITS_PNJ_EN_PAUSE);
  verifier("au chargement, PORTRAITS_PNJ_EN_PAUSE vaut false (le banc n'y touche pas)", pause === false, String(pause));
  const ia = lire("ia_master.js");
  verifier("…la garde reste : true remet la pause", /window\.PORTRAITS_PNJ_EN_PAUSE = false;/.test(ia)
           && /if \(!malgreLaPause && window\.PORTRAITS_PNJ_EN_PAUSE !== false\) return "";/.test(ia));
});

// =========================================================================
titre("2. UN TOUR DU NARRATEUR : CHAQUE PNJ NOMMÉ QUI ENTRE EST PEINT");
// =========================================================================
let t1 = null;
await section(async () => {
  await preparerTable();
  t1 = await tourComplet();
  verifier("le tour va au bout (verrou relâché, PNJ_Prets)", t1.fini);
  const imgMyrto = t1.imgs.filter(x => /tresses brunes/.test(x.prompt)), imgDamon = t1.imgs.filter(x => /barbe rousse/.test(x.prompt));
  const imgRattrapes = t1.imgs.filter(x => /Joueur d'osselets/.test(x.prompt));
  verifier("Myrto, que le MJ fait entrer (MIA_CASTING) : son portrait est peint", imgMyrto.length === 1, `${imgMyrto.length} portrait(s)`);
  const corps = imgMyrto[0] ? JSON.parse(imgMyrto[0].corps || "{}") : {};
  verifier("…par le procédé de l'avatar (fond magenta, 1024 × 1792)", corps.size === "1024x1792" && /MAGENTA/.test(corps.prompt || ""), corps.size || "");
  verifier("les noms rattrapés après le texte (Phaedra, Iris, Nikias) sont peints aussi", imgRattrapes.length === 3, `${imgRattrapes.length} portrait(s)`);
  const base = await pnjEnBase();
  verifier("Damon, jamais cité : ni fiche ni portrait (v292, inchangé)", imgDamon.length === 0 && !base.some(x => x.Nom_PNJ === "Damon"));
  const peints = ["Myrto", "Phaedra", "Iris", "Nikias"].filter(n => { const f = base.find(x => x.Nom_PNJ === n); return f && /^https:\/\/res\.cloudinary\.com\//.test(f.URL_Cloudinary || ""); });
  verifier("chaque fiche garde l'URL de son portrait", peints.length === 4, peints.join(", "));
  // (v455) Nico : « pour la création des PNJ, s'assurer qu'il gère bien les races dans le design envoyé à l'IA, et le même
  // algo pour le skin des fringues que les personnages, pour la variété : que l'IA choisisse dans la liste des choses faisables ».
  const cast = t1.reqs.find(x => x.qui === "MIA_CASTING"), forge = t1.reqs.find(x => x.qui === "FORGE");
  const tenuesListees = (s) => (s.split("TENUES POSSIBLES")[1] || "").split("\n").filter(l => /^- « /.test(l)).length;
  verifier("(v455) l'IA qui crée un PNJ lit les races avec leur allure (Satyre : ses cornes de bouc) et quelques tenues possibles, deux par type d'armure",
           [cast, forge].every(q => q && /RACES OBLIGATOIRES \(chaque personnage/.test(q.systeme) && /- Satyre : Cornes de bouc enroulées/.test(q.systeme) && tenuesListees(q.systeme) === 6),
           JSON.stringify([cast && tenuesListees(cast.systeme), forge && tenuesListees(forge.systeme)]));
  const myrto = base.find(x => x.Nom_PNJ === "Myrto"), iris = base.find(x => x.Nom_PNJ === "Iris"), nikias = base.find(x => x.Nom_PNJ === "Nikias");
  const listes = await p.evaluate(() => Object.values(window.VARIATIONS_TENUES).flat().map(v => v.titre));
  const palettes = await p.evaluate(() => window.PALETTES_TENUES);
  verifier("(v455) la tenue choisie par l'IA (Myrto : « Vestale ») est gardée sur sa fiche, avec une palette des héros",
           myrto && myrto.Tenue && myrto.Tenue.titre === "Vestale" && /Stola blanche/.test(myrto.Tenue.description) && palettes.includes(myrto.Tenue.palette), JSON.stringify(myrto && myrto.Tenue));
  verifier("(v455) …sans tenue choisie (Nikias), une des tenues proposées, tirée au hasard", nikias && nikias.Tenue && listes.includes(nikias.Tenue.titre), JSON.stringify(nikias && nikias.Tenue));
  const promptMyrto = (imgMyrto[0] || {}).prompt || "", promptIris = (t1.imgs.find(x => /nommé Iris/.test(x.prompt)) || {}).prompt || "";
  verifier("(v455) le dessinateur reçoit la tenue imposée (titre, description, couleurs) et l'espèce", /LA TENUE DU PERSONNAGE \(IMPOSÉE/.test(promptMyrto) && /Vestale — Stola blanche/.test(promptMyrto)
           && /Couleurs dominantes/.test(promptMyrto) && /ANATOMIE DE BASE DE L'ESPÈCE \(Humain\)/.test(promptMyrto), promptMyrto.slice(0, 200));
  verifier("(v455) une race écrite « satyres » : le Satyre du Grimoire, sur la fiche et dans le dessin (ses cornes de bouc)", iris && iris.Race === "Satyre"
           && /ANATOMIE DE BASE DE L'ESPÈCE \(Satyre\)/.test(promptIris) && /Cornes de bouc enroulées/.test(promptIris), JSON.stringify([iris && iris.Race, promptIris.slice(0, 160)]));
  const dernier = (t1.versions[t1.versions.length - 1] || {}).Texte || "";
  verifier("dans le texte du MJ, Myrto porte son portrait", /pnj-chat-hover"><strong>Myrto<\/strong><img src="https:\/\/res\.cloudinary\.com/.test(dernier));
});

// =========================================================================
titre("3. LE LIVRE : LES NOUVEAUX VISAGES EN PLEINE PAGE DE DROITE (v346)");
// =========================================================================
let idMessage = null;
await section(async () => {
  const fin = await p.evaluate(() => {
    const a = (window.__ajouts || []).filter(x => x.col === "Messages_Chat" && x.data.Est_Narration_IA).pop();
    if (!a) return null;
    const m = { id: a.id, ...window.__docs["Messages_Chat/" + a.id] };
    const entrees = window.GRIMOIRE_RECIT && typeof window.GRIMOIRE_RECIT.construireEntrees === "function" ? window.GRIMOIRE_RECIT.construireEntrees([m]) : [];
    return { id: a.id, portraits: m.Portraits_PNJ || [], pages: entrees.filter(e => e.type === "portrait").map(e => e.image.Nom) };
  });
  idMessage = fin && fin.id;
  const portraits = (fin && fin.portraits) || [];
  const noms = portraits.map(x => x.Nom);
  verifier("le message du Narrateur porte Portraits_PNJ : Myrto, Phaedra, Iris, Nikias", portraits.length === 4 && ["Myrto", "Phaedra", "Iris", "Nikias"].every(n => noms.includes(n)), JSON.stringify(noms));
  verifier("…au format « avatar » (1024 × 1792), avec l'URL Cloudinary de la fiche", portraits.length === 4
           && portraits.every(x => x.Format === "avatar" && Math.abs(x.Ratio - 1024 / 1792) < 0.01 && /^https:\/\/res\.cloudinary\.com\//.test(x.Url)),
           JSON.stringify(portraits[0] || {}));
  verifier("Dame Koré, déjà connue avec son portrait, n'y est pas", !noms.some(n => /Kor/.test(n)));
  verifier("le livre en fait quatre pages « portrait » (construireEntrees)", !!fin && fin.pages.length === 4, JSON.stringify(fin && fin.pages));
});

// =========================================================================
titre("4. MIA_ILLUSTRATEUR AJOUTE SES PORTRAITS APRÈS CEUX DU TOUR, SANS LES EFFACER");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async (id) => {
    const poses = window.__docs["Messages_Chat/" + id].Portraits_PNJ;
    const vraiPortrait = window.portraitPnjFaconAvatar, vraiGemini = window.fetchGemini;
    const peints = [];
    window.portraitPnjFaconAvatar = async (d, race) => { peints.push([d, race]); return "https://res.cloudinary.com/x/image/upload/q_auto,f_auto/v1/PNJ/varos.png"; };
    window.fetchGemini = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({
      illustrer: false, pnj_nommes: [{ nom: "Varos", present: true, race: "Humain", description_physique: "Un aubergiste ventru." }] }) }] } }] }), { status: 200 });
    try { await window.illustrerLeRecit({ idMessage: id, texteMJ: "Varos, l'aubergiste, essuie une coupe.", texteJoueurs: "", narrationsSansCroquis: 0, portraitsPoses: poses, pnjConnus: {} }); }
    finally { window.portraitPnjFaconAvatar = vraiPortrait; window.fetchGemini = vraiGemini; }
    return { portraits: (window.__docs["Messages_Chat/" + id].Portraits_PNJ || []).map(x => x.Nom), peints };
  }, idMessage);
  verifier("Varos, peint par MIA_ILLUSTRATEUR, s'ajoute en dernier", r.peints.length === 1 && r.portraits.length === 5 && r.portraits[4] === "Varos", JSON.stringify(r.portraits));
  verifier("…et les quatre visages du tour restent", ["Myrto", "Phaedra", "Iris", "Nikias"].every(n => r.portraits.includes(n)));
});

// =========================================================================
titre("5. LE TOUR SUIVANT : MYRTO EST CONNUE, ELLE N'EST PAS REPEINTE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => {
    window.__docs["Messages_Chat/c2"] = { ID_Partie: "P1", Auteur_ID: "H2", Auteur_Nom: "Lyra", Texte: "Je demande à Myrto une chambre pour la nuit.", Timestamp: Date.now() };
    window.__ajouts = []; window.__journal = [];
  });
  await p.evaluate((o) => window.__fauxGemini(o), { casting: [], detection: [], batiment: { action: "aucun" },
    narration: ["Myrto essuie une coupe et vous tend une clé de bronze.\n", "Myrto : « La chambre du haut, au calme. »"] });
  const t2 = await tourComplet();
  verifier("le second tour va au bout", t2.fini);
  verifier("aucun portrait de plus (Myrto a déjà le sien)", t2.imgs.length === 0, `${t2.imgs.length}`);
  verifier("…et pas de pleine page pour elle cette fois", !t2.versions.some(v => Array.isArray(v.Portraits_PNJ) && v.Portraits_PNJ.length));
});

await section(async () => {
  const index = lire("index.html");
  const v = (re) => Number((index.match(re) || [])[1] || 0);
  verifier("version 408 ; ia_master v28, illustrations_recit v11, trace du combat v298", v(/ia_master\.js\?v=(\d+)"/) >= 28 && v(/illustrations_recit\.js\?v=(\d+)"/) >= 11
           && v(/trace_combat\.js\?v=(\d+)"/) >= 298 && Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]) >= 408
           && Number((lire("version.json").match(/"version": (\d+)/) || [])[1]) >= 408);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
