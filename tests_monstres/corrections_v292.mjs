// v292 — LES VISAGES PRÉPARÉS AVANT LE MJ, PEINTS SEULEMENT S'IL LES CITE.
//
// Nico : « les pnj doivent être créés avant que le mj réponde car il les
// intègre au rp » ; « faudrait créer l'image que si le pnj créé est utilisé
// sinon trop de frais » ; « il faut créer que les pnj qui ont un nom » ;
// « voir que tout s'enchaîne correctement ».
//
// Sur la VRAIE page, Firestore en mémoire, Gemini (en flux), OpenAI et
// Cloudinary simulés : deux tours de MJ complets, de la préparation au tour
// suivant. Se charge sur l'ancien code (IVALIS_RACINE) : il y échoue, sans
// planter.
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
const MYRTO = { nom: "Myrto", physique: "Jeune femme aux tresses brunes, tablier de lin taché de vin", occupation: "Tavernière", race: "Humain", secret: "Elle cache un fugitif à la cave", style_parole: "Gouailleuse" };
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
    json(appel("creerNouveauxPNJ", { pnjs: noms.concat(["Bonus"]).map(n => ({ nom: n, physique: "Joueur d'osselets nommé " + n, occupation: "Joueur", race: "Humain", secret: "Triche", style_parole: "Rieur" })) })); return;
  }
  if (qui === "BATIMENT") { json(appel("gererDecor", faux.batiment)); return; }
  if (qui === "MIA_COMBAT") { json(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ combat: false, raison: "Un accueil." }) }] } }] })); return; }
  json(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }], usageMetadata: { totalTokenCount: 5 } }));
});
await p.route('**api.openai.com/**', async r => {
  const d = r.request().postData() || "";
  const prompt = r.request().url().includes("generations") ? (JSON.parse(d || "{}").prompt || "") : d;
  openai.push({ t: Date.now(), url: r.request().url(), prompt });
  await new Promise(res => setTimeout(res, faux.delaiPortraitMs));
  r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ data: [{ b64_json: PNG }] }) });
});
await p.route('**api.cloudinary.com/**', async r => {
  r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ secure_url: `https://res.cloudinary.com/dlkjq4kvg/image/upload/v1/PNJ/portrait_${Date.now()}_${Math.floor(Math.random() * 1e6)}.png` }) });
});
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);
// v300 : les portraits des PNJ sont en pause (ia_master.js) ; ce banc les rallume pour les vérifier.
await p.evaluate(() => { window.PORTRAITS_PNJ_EN_PAUSE = false; });
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
  window.__docs["Monde_Races/R1"] = { Nom: "Satyre" };
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
titre("1. AVANT LE MJ : MIA_CASTING PRÉPARE LES VISAGES NOMMÉS, EN MÊME TEMPS QUE MIA");
// =========================================================================
let t1 = null;
await section(async () => {
  await preparerTable();
  t1 = await tourComplet();
  const { reqs } = t1;
  const casting = reqs.find(x => x.qui === "MIA_CASTING"), filtre = reqs.find(x => x.qui === "MIA_FILTRE"), narr = reqs.find(x => x.qui === "NARRATEUR");
  verifier("le tour va au bout (verrou relâché, portraits prêts)", t1.fini);
  verifier("MIA_CASTING est consultée AVANT le narrateur", !!casting && !!narr && casting.t < narr.t, casting && narr ? `${narr.t - casting.t} ms avant` : "");
  verifier("en même temps que Mia (les PNJ sollicités) : pas l'une après l'autre", !!casting && !!filtre && Math.abs(casting.t - filtre.t) < 350, casting && filtre ? `${Math.abs(casting.t - filtre.t)} ms d'écart` : "");
  verifier("elle lit la scène (le lieu) et les dernières actions des joueurs", !!casting && /port de Mégara/.test(casting.systeme) && /je salue la tavernière/.test(casting.texte));
  verifier("sa consigne : seulement des personnages NOMMÉS qu'on aborde, jamais de figurants, deux au plus",
           !!casting && /VRAI nom propre/.test(casting.systeme) && /JAMAIS de figurants anonymes/.test(casting.systeme) && /Deux fiches AU PLUS/.test(casting.systeme));
  verifier("elle connaît les races du Grimoire, les PNJ connus et les héros", !!casting && /Satyre/.test(casting.systeme) && /Dame Koré/.test(casting.systeme) && /Thorin/.test(casting.systeme));
  verifier("le MJ reçoit les fiches prêtes (Myrto et Damon : nom, physique, métier, parole, secret)",
           !!narr && /PERSONNAGES PRÊTS À ENTRER EN SCÈNE/.test(narr.systeme) && /Myrto \(Humain, Tavernière\)/.test(narr.systeme) && /tresses brunes/.test(narr.systeme)
           && /Damon \(Humain, Videur\)/.test(narr.systeme) && /cache un fugitif/.test(narr.systeme));
});

// =========================================================================
titre("2. LE MJ CITE MYRTO : SON PORTRAIT PART AUSSITÔT ; DAMON N'EST NI RANGÉ NI PEINT");
// =========================================================================
await section(async () => {
  const { imgs, versions } = t1;
  const imgMyrto = imgs.filter(x => /tresses brunes/.test(x.prompt)), imgDamon = imgs.filter(x => /barbe rousse/.test(x.prompt));
  const fin = versions.find(v => v.Recit_En_Cours === false) || {};
  verifier("le portrait de Myrto est lancé PENDANT que le MJ écrit encore", imgMyrto.length === 1 && !!fin.t && imgMyrto[0].t < fin.t, imgMyrto[0] && fin.t ? `${fin.t - imgMyrto[0].t} ms avant la fin du texte` : `${imgMyrto.length} portrait(s)`);
  verifier("le parchemin l'apprend tout de suite (PNJ_Annonces : Myrto, texte encore en cours)", versions.some(v => v.Recit_En_Cours === true && Array.isArray(v.PNJ_Annonces) && v.PNJ_Annonces.includes("Myrto")),
           JSON.stringify(versions.map(v => [v.Recit_En_Cours, v.PNJ_Annonces])));
  verifier("Damon, jamais cité : AUCUN portrait", imgDamon.length === 0, `${imgDamon.length}`);
  const base = await pnjEnBase();
  verifier("… et aucune fiche en base", !base.some(x => x.Nom_PNJ === "Damon"), base.map(x => x.Nom_PNJ).join(", "));
  const myrto = base.find(x => x.Nom_PNJ === "Myrto");
  const bat = await p.evaluate(() => window.__docs["Systeme_Parties/P1"].Lieu_Actuel);
  verifier("la fiche de Myrto est rangée DANS la taverne où le MJ a fait entrer les héros", !!myrto && /^B-/.test(bat) && myrto.ID_Batiment === bat && myrto.ID_Lieu === "L_1",
           myrto ? JSON.stringify({ bat: myrto.ID_Batiment, lieu: myrto.ID_Lieu, partie: bat }) : "pas de fiche");
  verifier("telle que préparée (métier, secret, parole, race), avec son portrait", !!myrto && myrto.Occupation === "Tavernière" && /fugitif/.test(myrto.Secret_Mental) && myrto.Style_De_Parole === "Gouailleuse"
           && myrto.Race === "Humain" && /res\.cloudinary\.com/.test(myrto.URL_Cloudinary || ""), myrto ? myrto.URL_Cloudinary : "");
  const dernier = (versions[versions.length - 1] || {}).Texte || "";
  verifier("dans le texte, Myrto porte son portrait (la réplique pourra l'afficher)", /pnj-chat-hover"><strong>Myrto<\/strong><img src="https:\/\/res\.cloudinary\.com/.test(dernier));
});

// =========================================================================
titre("3. LE RATTRAPAGE : SEULEMENT LES NOMS PROPRES, TROIS AU PLUS, PAS DEUX FOIS MYRTO");
// =========================================================================
await section(async () => {
  const { reqs, imgs, versions } = t1;
  const det = reqs.find(x => x.qui === "DETECTION");
  verifier("la détection ne prend que les vrais noms (pas « un garde », « le tavernier »), trois au plus",
           !!det && /VRAI prénom ou nom propre/.test(det.systeme) && /Ignore les descriptions génériques/.test(det.systeme) && /Trois noms au plus/.test(det.systeme));
  verifier("elle sait que Myrto est déjà là (pas de doublon)", !!det && /Myrto/.test((det.systeme.match(/DEJA connus : (.*)/) || [])[1] || ""));
  const base = await pnjEnBase();
  const crees = ["Phaedra", "Iris", "Nikias", "Kleon", "Bonus"].filter(n => base.some(x => x.Nom_PNJ === n));
  verifier("4 noms détectés → 3 créés (Phaedra, Iris, Nikias) ; ni Kleon ni le « Bonus » de la forge", crees.join(",") === "Phaedra,Iris,Nikias", crees.join(", "));
  verifier("une seule fiche Myrto", base.filter(x => x.Nom_PNJ === "Myrto").length === 1);
  const portraits = imgs.filter(x => /tresses brunes|Joueur d'osselets|barbe rousse/.test(x.prompt));
  verifier("4 portraits payés en tout : Myrto + les 3 rattrapés (plus l'image de la nouvelle taverne)", portraits.length === 4 && imgs.length === 5, `${portraits.length} portrait(s), ${imgs.length} image(s)`);
  const attendus = (versions.filter(v => Array.isArray(v.PNJ_Attendus)).pop() || {}).PNJ_Attendus || [];
  verifier("PNJ_Attendus réunit Myrto et les rattrapés", ["Myrto", "Phaedra", "Iris", "Nikias"].every(n => attendus.includes(n)) && !attendus.includes("Kleon"), attendus.join(", "));
  verifier("puis PNJ_Prets, et le verrou du MJ relâché", versions.some(v => v.PNJ_Prets === true) && (await p.evaluate(() => window.__docs["Systeme_Parties/P1"].IA_En_Cours)) === false);
});

// =========================================================================
titre("4. LE TOUR SUIVANT : MYRTO EST UNE PNJ DE LA TAVERNE, LE MJ LA CONNAÎT");
// =========================================================================
await section(async () => {
  await p.evaluate(() => {
    window.__docs["Messages_Chat/c2"] = { ID_Partie: "P1", Auteur_ID: "H2", Auteur_Nom: "Lyra", Texte: "Je demande à Myrto une chambre pour la nuit.", Timestamp: Date.now() };
    window.__ajouts = []; window.__journal = [];
  });
  await p.evaluate((o) => window.__fauxGemini(o), { casting: [], detection: [], batiment: { action: "aucun" },
    narration: ["Myrto essuie une coupe et vous tend une clé de bronze.\n", "Myrto : « La chambre du haut, au calme. »"] });
  const t2 = await tourComplet();
  const casting = t2.reqs.find(x => x.qui === "MIA_CASTING"), narr = t2.reqs.find(x => x.qui === "NARRATEUR"), filtre = t2.reqs.find(x => x.qui === "MIA_FILTRE");
  verifier("le second tour va au bout", t2.fini);
  verifier("Myrto fait partie des PNJ présents que lit le MJ (la taverne)", !!narr && /PNJ PRÉSENTS DANS LA ZONE[\s\S]*- Myrto \(Tavernière\)/.test(narr.systeme));
  verifier("Mia peut la désigner comme sollicitée", !!filtre && /Myrto/.test(filtre.systeme));
  verifier("MIA_CASTING la connaît : elle ne la prépare pas une seconde fois", !!casting && /Myrto/.test((casting.systeme.match(/DÉJÀ connus : (.*)/) || [])[1] || ""));
  verifier("sans fiche préparée, le MJ ne reçoit pas de section vide", !!narr && !/PERSONNAGES PRÊTS À ENTRER EN SCÈNE/.test(narr.systeme));
  verifier("aucun portrait de plus (Myrto a déjà le sien)", t2.imgs.length === 0, `${t2.imgs.length}`);
  verifier("sa réplique porte déjà son portrait dans le texte", /pnj-chat-hover"><strong>Myrto<\/strong><img/.test((t2.versions[t2.versions.length - 1] || {}).Texte || ""));
});

// =========================================================================
titre("5. LES GARDE-FOUS : PANNE DE MIA_CASTING, TROP DE FICHES, UN HÉROS, UN PNJ CONNU");
// =========================================================================
await section(async () => {
  await preparerTable();
  await p.evaluate((o) => window.__fauxGemini(o), { castingEnPanne: true, casting: [], detection: [], batiment: { action: "aucun" }, narration: null });
  const t = await tourComplet();
  verifier("MIA_CASTING en panne : le MJ répond quand même, sans fiche préparée", t.fini && !!t.reqs.find(x => x.qui === "NARRATEUR") && !/PERSONNAGES PRÊTS/.test((t.reqs.find(x => x.qui === "NARRATEUR") || {}).systeme || ""));
  await preparerTable();
  const ARES = { ...DAMON, nom: "Arès le Forgeron" }, XANTHE = { ...DAMON, nom: "Xanthe", physique: "Une fileuse aux doigts bleuis" };
  await p.evaluate((o) => window.__fauxGemini(o), { castingEnPanne: false, detection: [], batiment: { action: "aucun" }, narration: null,
    casting: [{ ...DAMON, nom: "Thorin" }, { ...DAMON, nom: "Dame Koré" }, { ...MYRTO, race: "Elfe des neiges" }, { ...ARES, race: "satyre" }, XANTHE] });
  const u = await tourComplet();
  const narr = u.reqs.find(x => x.qui === "NARRATEUR") || {};
  const section5 = (narr.systeme || "").split("PERSONNAGES PRÊTS À ENTRER EN SCÈNE")[1] || "";
  const lignes = section5.split("\n").filter(l => /^- /.test(l));
  verifier("deux fiches au plus pour le MJ ; jamais un héros ni un PNJ déjà connu", lignes.length === 2 && /^- Myrto/.test(lignes[0]) && /^- Arès le Forgeron/.test(lignes[1]), lignes.map(l => l.slice(0, 20)).join(" | "));
  verifier("une race inventée par l'IA redevient Humain ; une race du Grimoire est gardée (son orthographe)", lignes.length === 2 && /^- Myrto \(Humain,/.test(lignes[0]) && /^- Arès le Forgeron \(Satyre,/.test(lignes[1]),
           lignes.map(l => l.slice(0, 30)).join(" | "));
});

// =========================================================================
titre("6. LE PARCHEMIN ATTEND AUSSI LE PORTRAIT D'UN VISAGE ANNONCÉ");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { try { window.fermerRecitDynamique(); } catch (e) {} });
  await p.waitForTimeout(1700);
  const ts = Date.now();
  await p.evaluate(({ ts }) => window.lancerRecitDynamique("Myrto : « Entrez donc ! »", { ts, enCours: true, pnjAttendus: null, pnjAnnonces: ["Myrto"], pnjPrets: false }), { ts });
  await p.waitForTimeout(1800);
  const e = await p.evaluate(() => ({ nom: document.getElementById("nom-recit-dynamique").textContent, attente: document.getElementById("attente-recit-dynamique").textContent,
    visible: document.getElementById("attente-recit-dynamique").classList.contains("visible"), texte: document.getElementById("contenu-texte-recit").textContent }));
  verifier("Myrto annoncée, sans portrait : son nom, « Le portrait se dessine… », la réplique attend", e.nom === "Myrto" && e.visible && /portrait se dessine/.test(e.attente) && !/Entrez donc/.test(e.texte), JSON.stringify(e));
  await p.evaluate(() => window.fermerRecitDynamique());
  const app = lire("app.js");
  verifier("le chat passe PNJ_Annonces au parchemin", /pnjAnnonces: Array\.isArray\(m\.PNJ_Annonces\)/.test(app));
});

await section(async () => {
  const index = lire("index.html");
  const v = (re) => Number((index.match(re) || [])[1] || 0);
  verifier("versions : ia_master, recit_dynamique, app, trace du combat", v(/ia_master\.js\?v=(\d+)"/) >= 13 && v(/recit_dynamique\.js\?v=(\d+)"/) >= 7 && v(/app\.js\?v=(\d+)"/) >= 131
           && v(/trace_combat\.js\?v=(\d+)"/) >= 197 && Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]) >= 292
           && Number((lire("version.json").match(/"version": (\d+)/) || [])[1]) >= 292);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
