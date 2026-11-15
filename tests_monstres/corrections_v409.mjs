// v409 — LA REFONTE DES PNJ, LOT 0 : LE MÉNAGE.
//
// Nico : « ses PNJ n'existeront pas dans les autres parties » ; un PNJ mort garde
// sa fiche et son portrait ; « fais le bouton [de purge des anciens PNJ], et
// ensuite fais-le disparaître ».
//
// Sur la VRAIE page (le harnais du banc v292) : un tour complet du MJ avec des
// PNJ de deux parties dans le même lieu, un déplacement, une mort, le cimetière,
// puis la purge et son bouton.
// Lancer : node tests_monstres/corrections_v409.mjs
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
  if (qui === "MIA_MORT" && faux.morts) { json(appel("declarerMorts", { noms_morts: faux.morts })); return; }
  if (qui === "MIA_DEPLACEMENT" && faux.deplacement) { json(appel("deplacerPNJ", { noms_presents: faux.deplacement })); return; }
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
const destructions = [];
await p.route('**api.cloudinary.com/**', async r => {
  if (/\/destroy$/.test(r.request().url())) { destructions.push(r.request().url()); r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ result: "ok" }) }); return; }
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

// Deux parties se croisent dans le port de Mégara (L_1) : Hermia et Doros
// existent dans P1 ET dans P2 (homonymes) ; Brontès n'existe que dans P2.
const ajouterPnj = () => p.evaluate(() => {
  const d = window.__docs;
  d["Monde_PNJ/PNJ_HERMIA_P1"] = { Nom_PNJ: "Hermia", ID_Lieu: "L_1", ID_Partie: "P1", Statut: "Vivant", Occupation: "Pêcheuse", Description_Physique: "Une pêcheuse.", URL_Cloudinary: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1/PNJ/hermia1.png" };
  d["Monde_PNJ/PNJ_HERMIA_P2"] = { Nom_PNJ: "Hermia", ID_Lieu: "L_9", ID_Partie: "P2", Statut: "Vivant", Occupation: "Prêtresse", Description_Physique: "Une prêtresse.", URL_Cloudinary: "" };
  d["Monde_PNJ/PNJ_DOROS_P1"] = { Nom_PNJ: "Doros", ID_Lieu: "L_1", ID_Partie: "P1", Statut: "Vivant", Occupation: "Docker", Description_Physique: "Un docker.", URL_Cloudinary: "" };
  d["Monde_PNJ/PNJ_DOROS_P2"] = { Nom_PNJ: "Doros", ID_Lieu: "L_9", ID_Batiment: "", ID_Partie: "P2", Statut: "Vivant", Occupation: "Berger", Description_Physique: "Un berger.", URL_Cloudinary: "" };
  d["Monde_PNJ/PNJ_BRONTES_P2"] = { Nom_PNJ: "Brontès", ID_Lieu: "L_1", ID_Partie: "P2", Statut: "Vivant", Occupation: "Forgeron", Description_Physique: "Un forgeron borgne.", URL_Cloudinary: "" };
});

// =========================================================================
titre("1. UN TOUR DU MJ : SEULS LES PNJ DE LA PARTIE SONT LÀ");
// =========================================================================
let t1 = null;
await section(async () => {
  await preparerTable();
  await ajouterPnj();
  await p.evaluate((o) => window.__fauxGemini(o), { casting: [MYRTO], detection: [], batiment: faux.batiment, morts: ["Hermia"], deplacement: ["Doros"] });
  t1 = await tourComplet();
  verifier("le tour va au bout", t1.fini);
  const narr = t1.reqs.find(x => x.qui === "NARRATEUR") || {};
  const zone = ((narr.systeme || "").split("PNJ PRÉSENTS DANS LA ZONE")[1] || "").replace(/^\s*---/, "").split("\n---")[0];
  verifier("le MJ voit Hermia et Doros de P1, et Dame Koré (fiche d'avant la v330)", /- Hermia \(Pêcheuse\)/.test(zone) && /- Doros \(Docker\)/.test(zone) && /Dame Koré/.test(zone), zone.replace(/\n/g, " | ").slice(0, 200));
  verifier("…mais jamais Brontès ni les homonymes de P2", !/Brontès|Prêtresse|Berger/.test(zone));
  const casting = t1.reqs.find(x => x.qui === "MIA_CASTING") || {};
  verifier("MIA_CASTING ne compte pas Brontès parmi les PNJ connus", !/Brontès/.test(casting.systeme || ""));
});

// =========================================================================
titre("2. LA RECHERCHE D'UN PNJ CONNU RESTE DANS LA PARTIE");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => ({ brontes: await window.pnjExistantIvalis("Brontès"), hermia: await window.pnjExistantIvalis("Hermia") }));
  verifier("Brontès (P2) n'est pas « déjà connu » dans P1", r.brontes === null, JSON.stringify(r.brontes && r.brontes.ID_Partie));
  verifier("Hermia est celle de P1", !!r.hermia && r.hermia.ID_Partie === "P1", JSON.stringify(r.hermia && r.hermia.ID_Partie));
});

// =========================================================================
titre("3. APRÈS LE TOUR : LE DÉPLACEMENT ET LA MORT NE TOUCHENT QUE P1");
// =========================================================================
await section(async () => {
  const ok = await attendreQue(() => p.evaluate(() => window.__docs["Monde_PNJ/PNJ_HERMIA_P1"].Statut === "Mort"), 8000);
  await attendreQue(() => p.evaluate(() => /^B-/.test(window.__docs["Monde_PNJ/PNJ_DOROS_P1"].ID_Batiment || "")), 5000);
  const d = await p.evaluate(() => ({ h1: window.__docs["Monde_PNJ/PNJ_HERMIA_P1"], h2: window.__docs["Monde_PNJ/PNJ_HERMIA_P2"],
    d1: window.__docs["Monde_PNJ/PNJ_DOROS_P1"], d2: window.__docs["Monde_PNJ/PNJ_DOROS_P2"], lieu: window.__docs["Systeme_Parties/P1"].Lieu_Actuel }));
  verifier("Hermia de P1 meurt", ok && d.h1.Statut === "Mort");
  verifier("…Hermia de P2, son homonyme, reste vivante", d.h2.Statut === "Vivant");
  verifier("Doros de P1 suit les héros dans la taverne", d.d1.ID_Batiment === d.lieu, JSON.stringify({ bat: d.d1.ID_Batiment, lieu: d.lieu }));
  verifier("…Doros de P2 ne bouge pas", d.d2.ID_Lieu === "L_9" && !d.d2.ID_Batiment);
  const myrto = Object.values(await p.evaluate(() => window.__docs)).find(x => x && x.Nom_PNJ === "Myrto");
  verifier("Myrto, née pendant le tour, porte Version_Creation (≥ 409)", !!myrto && myrto.Version_Creation >= 409, JSON.stringify(myrto && myrto.Version_Creation));
});

// =========================================================================
titre("4. LE CIMETIÈRE N'EFFACE PLUS LES MORTS");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => { await window.incinererPnjMorts(); return window.__docs["Monde_PNJ/PNJ_HERMIA_P1"] || null; });
  verifier("Hermia, morte, garde sa fiche et son portrait", !!r && r.Statut === "Mort" && /hermia1/.test(r.URL_Cloudinary || ""));
});

// =========================================================================
titre("5. LA PURGE DES ANCIENS PNJ, UNE SEULE FOIS, PUIS LE BOUTON DISPARAÎT");
// =========================================================================
await section(async () => {
  const entree = () => p.evaluate(() => { const c = window.GRIMOIRE_PARAMETRES.CATEGORIES.find(x => x.id === "atelier"); const e = c.entrees.find(x => x[0] === "purge-pnj"); return e ? { titre: e[1], visible: typeof e[3] === "function" ? e[3]() : true } : null; });
  const avant = await entree();
  verifier("l'atelier des Paramètres propose « Effacer les anciens PNJ »", !!avant && avant.visible === true, JSON.stringify(avant));
  const r = await p.evaluate(async () => {
    const res = await window.purgerAnciensPnj({ sansConfirmation: true, silencieux: true });
    return { res, restants: Object.entries(window.__docs).filter(([k]) => k.startsWith("Monde_PNJ/")).map(([, v]) => v.Nom_PNJ), reglage: window.__docs["Reglages/Refonte_PNJ"] };
  });
  verifier("les PNJ d'avant la refonte sont effacés (toutes parties) ; Myrto reste", r.restants.length === 1 && r.restants[0] === "Myrto", JSON.stringify(r.restants));
  verifier("…leurs portraits Cloudinary aussi (Hermia, Dame Koré)", destructions.length >= 2, `${destructions.length} suppression(s)`);
  verifier("…la purge est notée faite (Reglages/Refonte_PNJ)", !!r.reglage && r.reglage.Purge_Faite === true && r.reglage.Effaces === 6, JSON.stringify(r.reglage));
  const apres = await entree();
  verifier("le bouton disparaît", !!apres && apres.visible === false);
  const encore = await p.evaluate(async () => { window.PURGE_PNJ_FAITE = false; return window.purgerAnciensPnj({ sansConfirmation: true, silencieux: true }); });
  verifier("sur un autre poste, un second clic ne refait rien (et le bouton s'en va)", encore.deja === true && (await p.evaluate(() => window.PURGE_PNJ_FAITE)) === true);
});

await section(async () => {
  const index = lire("index.html");
  const v = (re) => Number((index.match(re) || [])[1] || 0);
  verifier("version 409 ; ia_master v29, illustrations_recit v12, grimoire_parametres", v(/ia_master\.js\?v=(\d+)"/) >= 29 && v(/illustrations_recit\.js\?v=(\d+)"/) >= 12
           && Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]) >= 409 && Number((lire("version.json").match(/"version": (\d+)/) || [])[1]) >= 409);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
