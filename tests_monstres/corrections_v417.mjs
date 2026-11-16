// v417 — LE MJ UNE SEULE FOIS ; UN LIEU N'EST PAS UN PNJ ; LES COMPAGNONS ; L'ARRIVÉE D'UN VOYAGE ; LE SECRET.
//
// Nico : « le MJ a joué deux fois de suite, à chaque fois que je le lance » ;
// « je me suis rendu dans le village de Sylvarion et l'IA m'a créé un PNJ avec ce
// nom » ; « les héros ne connaissent pas les autres membres du groupe : mets-leur
// des relations neutres » ; « quand le groupe arrive à destination, mets tous les
// joueurs sur la page du RP et lance le narrateur » ; « un encart Secret dans les
// fiches de création » ; « le symbole des fils invisibles dans les marges :
// seulement en mode DEV » ; « l'IA d'image n'a pas pris ma nouvelle tenue ».
// Sur la VRAIE page (le harnais du banc v292).
// Lancer : node tests_monstres/corrections_v417.mjs
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
const requetes = [], openai = [], ames = [], sociales = [];
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
  if (qui === "MIA_SOCIAL") { sociales.push({ systeme, texte: texteU }); json(appel("noterScene", faux.social || { evenements: [] })); return; }
  if (qui === "MIA_AME") {
    let liste = []; try { liste = JSON.parse(texteU || "[]"); } catch (e) {}
    ames.push(liste.map(x => x.nom));
    json(appel("donnerAmes", { ames: liste.map(x => ({ nom: x.nom, prudence: 70, impulsivite: 20, loyaute: 80, empathie: 60, orgueil: 30, sociabilite: 55, valeurs: ["honneur"], objectifs: ["Protéger les siens"], faille: "La peur du noir", masque: "Souriant" })) })); return;
  }
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
await p.route('**api.cloudinary.com/**/destroy', async r => { destructions.push(r.request().postData() || ""); r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ result: "ok" }) }); });
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

const narrateurs = () => requetes.filter(x => x.qui === "NARRATEUR").length;
const installer = () => p.evaluate(() => {
  const d = window.__docs;
  d["Monde_PNJ/PNJ_KORE"].ID_Partie = "P1"; d["Monde_PNJ/PNJ_KORE"].Version_Creation = 409;
  d["Monde_Lieux/L_9"] = { Nom_Du_Lieu: "Village de Sylvarion", Description_Global: "Un village de bûcherons." };
});
const libre = () => attendreQue(() => p.evaluate(() => window.__docs["Systeme_Parties/P1"].IA_En_Cours !== true), 25000);

// =========================================================================
titre("1. LE MJ NE JOUE PLUS DEUX FOIS DE SUITE");
// =========================================================================
await section(async () => {
  await preparerTable();
  await installer();
  await p.evaluate((o) => window.__fauxGemini(o), { casting: [], detection: [], batiment: { action: "aucun" } });
  const n0 = narrateurs();
  // Deux déclenchements au même instant (un double toucher, deux relais) : un seul tour.
  await p.evaluate(() => Promise.all([window.declencherTourIA(), window.declencherTourIA()]));
  await libre(); await p.waitForTimeout(800);
  verifier("deux déclenchements au même instant : une seule narration", narrateurs() - n0 === 1, `${narrateurs() - n0}`);
  // Un relais automatique (le dernier dé, une arrivée) juste après, sans que personne n'ait joué : pas de seconde narration.
  await p.evaluate(() => window.declencherTourIA({ auto: true }));
  await libre(); await p.waitForTimeout(500);
  verifier("un relais automatique aussitôt après, sans action des joueurs : pas de seconde narration", narrateurs() - n0 === 1, `${narrateurs() - n0}`);
  // Un joueur lance un dé : le relais automatique fait répondre le MJ.
  await p.evaluate(() => { window.__docs["Messages_Chat/c2"] = { ID_Partie: "P1", Auteur_ID: "H2", Auteur_Nom: "Lyra", Texte: "🎲 Jet de **Force** pour **Lyra** : Résultat : 12 +1 = **13**", Timestamp: Date.now() }; });
  await p.evaluate(() => window.declencherTourIA({ auto: true }));
  await libre(); await p.waitForTimeout(800);
  verifier("un joueur a joué depuis : le relais fait répondre le MJ", narrateurs() - n0 === 2, `${narrateurs() - n0}`);
  // Un toucher sur « Narrateur » sans action : le MJ continue (v295, voulu).
  await p.evaluate(() => window.declencherTourIA());
  await libre(); await p.waitForTimeout(800);
  verifier("un toucher volontaire sur « Narrateur » le fait toujours continuer (v295)", narrateurs() - n0 === 3, `${narrateurs() - n0}`);
  verifier("le verrou se prend d'un seul geste (transaction)", /verrouPris = await runTransaction\(db, async \(tx\) => \{/.test(lire("ia_master.js")) && /window\.__tourIAEnVol/.test(lire("ia_master.js")));
});

// =========================================================================
titre("2. UN NOM DE LIEU NE DEVIENT PAS UN PNJ (SYLVARION)");
// =========================================================================
await section(async () => {
  await preparerTable();
  await installer();
  await p.evaluate((o) => window.__fauxGemini(o), { casting: [{ ...MYRTO, nom: "Sylvarion" }], detection: ["Sylvarion", "Phaedra"], batiment: faux.batiment,
    narration: ["Sylvarion se dresse au bord de la forêt.\n", "Phaedra, la bûcheronne, vous salue."] });
  const t = await tourComplet();
  const casting = t.reqs.find(x => x.qui === "MIA_CASTING") || {}, det = t.reqs.find(x => x.qui === "DETECTION") || {};
  verifier("MIA_CASTING et le rattrapage savent qu'un lieu n'est pas un personnage (et connaissent Sylvarion)", /UN LIEU N'EST PAS UN PERSONNAGE/.test(casting.systeme || "") && /Village de Sylvarion/.test(casting.systeme || "") && /UN LIEU N'EST PAS UN PERSONNAGE/.test(det.systeme || ""));
  const noms = (await pnjEnBase()).map(x => x.Nom_PNJ);
  verifier("« Sylvarion », proposé par l'IA, n'a pas de fiche ; Phaedra, si", !noms.includes("Sylvarion") && noms.includes("Phaedra"), noms.join(", "));
  verifier("…ni de portrait", !t.imgs.some(x => /tresses brunes/.test(x.prompt)));
  const r = await p.evaluate(async () => [await window.estNomDeLieuIvalis("Sylvarion"), await window.estNomDeLieuIvalis("Phaedra"), await window.estNomDeLieuIvalis("le port de Mégara")]);
  verifier("estNomDeLieu : Sylvarion oui, Phaedra non, « le port de Mégara » oui", JSON.stringify(r) === "[true,false,true]", JSON.stringify(r));
});

// =========================================================================
titre("3. LES HÉROS SE CONNAISSENT : DES LIENS NEUTRES ENTRE COMPAGNONS");
// =========================================================================
await section(async () => {
  const ok = await attendreQue(() => p.evaluate(() => !!window.__docs["Systeme_Parties/P1/Liens/H1~H2"]), 12000);
  const l = await p.evaluate(() => [window.__docs["Systeme_Parties/P1/Liens/H1~H2"], window.__docs["Systeme_Parties/P1/Liens/H2~H1"]]);
  verifier("Thorin → Lyra et Lyra → Thorin : « compagnon », familiarité 40, aucun avis chiffré", ok && l.every(x => x && x.etiquette === "compagnon" && x.origine === "groupe" && x.axes.familiarite === 40 && x.axes.confiance === 0 && x.axes.attachement === 0),
           JSON.stringify(l[0] && l[0].axes));
});

// =========================================================================
titre("4. L'ARRIVÉE D'UN VOYAGE : TOUS SUR LE RÉCIT, LE NARRATEUR PART");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => {
    window.__tours = 0; window.__recits = 0;
    const vrai = window.declencherTourIA; window.declencherTourIA = async () => { window.__tours++; };
    const vraiRecit = window.GRIMOIRE_RECIT.allerAuRecit; window.GRIMOIRE_RECIT.allerAuRecit = () => { window.__recits++; };
    window.__ajouts = [];
    await window.__annoncerArriveeBanc({ arrivee: true, lieu: "L_1" }, null);
    await new Promise(res => setTimeout(res, 500));
    const msg = (window.__ajouts || []).find(a => a.col === "Messages_Chat" && a.data.Auteur_ID === "DESTIN");
    try { window.appliquerVoyageDeLaPartie({ ...window.__docs["Systeme_Parties/P1"], Voyage_Termine: { Id: "VOY_1", Le: Date.now() } }); } catch (e) {}
    try { window.appliquerVoyageDeLaPartie({ ...window.__docs["Systeme_Parties/P1"], Voyage_Termine: { Id: "VOY_1", Le: Date.now() } }); } catch (e) {}
    await new Promise(res => setTimeout(res, 1600));
    const res = { texte: msg ? msg.data.Texte : "", tours: window.__tours, recits: window.__recits };
    window.declencherTourIA = vrai; window.GRIMOIRE_RECIT.allerAuRecit = vraiRecit;
    return res;
  });
  verifier("le Destin pose l'arrivée avec le nom du lieu (Le port de Mégara)", /Le groupe arrive à destination : Le port de Mégara/.test(r.texte), r.texte.slice(0, 90));
  verifier("…et le Narrateur est lancé", r.tours === 1, `${r.tours}`);
  verifier("chaque poste passe sur la page du récit, une seule fois par voyage", r.recits === 1, `${r.recits}`);
});

// =========================================================================
titre("5. LE SECRET À LA CRÉATION ; LE CERVEAU DE LA MARGE EN MODE DEV");
// =========================================================================
await section(async () => {
  const champ = await p.evaluate(() => { const c = document.getElementById("champ-secret"); return c ? { tag: c.tagName, label: c.closest(".champ-formulaire").textContent.trim() } : null; });
  verifier("la fiche de création a l'encart « Secret »", !!champ && champ.tag === "TEXTAREA" && /Secret/.test(champ.label), JSON.stringify(champ));
  const app = lire("app.js"), cp = lire("creation_personnage.js");
  verifier("…il se garde avec le héros (Secret) et se relit (secret)", /Secret: donnees\.secret \|\| ""/.test(app) && /secret: d\.Secret \|\| ""/.test(app) && /secret: document\.getElementById\("champ-secret"\)/.test(cp));
  const rc = lire("grimoire_recit.js");
  verifier("le cerveau des fils invisibles ne se pose en marge qu'en mode DEV", /const cerveaux = modeDevRecit\(\) \?/.test(rc) && /localStorage\.getItem\("ivalis_DEV_MODE"\) === "on"/.test(rc));
  const il = lire("illustrations_recit.js");
  verifier("l'illustrateur prend l'apparence actuelle d'un héros (sa tenue) avant son portrait de référence", /const apparenceActuelle = \(h\) => \(h && \(h\.urlCloudinary \|\| h\.urlAvatarEquipe \|\| h\.urlPortraitReference\)\)/.test(il));
});

await section(async () => {
  verifier("version 417", Number((lire("version.json").match(/"version": (\d+)/) || [])[1]) >= 417);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
