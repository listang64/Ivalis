// v412 — LA REFONTE DES PNJ, LOT 3 : LE RP FAIT BOUGER LES LIENS.
//
// Après chaque réponse du MJ, MIA_SOCIAL lit la scène et nomme les actions du
// catalogue (jamais un chiffre) ; le moteur (social_pur.js) calcule ; les liens,
// les événements, les souvenirs et l'humeur s'écrivent ; un cerveau à engrenage
// se pose dans la marge du paragraphe (Nico : « un petit icône d'un cerveau avec
// dedans un engrenage »). Sur la VRAIE page (le harnais du banc v292).
// Lancer : node tests_monstres/corrections_v412.mjs
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
if (process.env.V412_CONSOLE) p.on('console', m => { if (/Fils|MIA_|Tour IA|Backend|Erreur|erreur/.test(m.text())) console.log('   [page]', m.text().slice(0, 200)); });
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

const ame = (id) => p.evaluate((id) => window.__docs["Systeme_Parties/P1/Ames/" + id] || null, id);
const lien = (de, vers) => p.evaluate(([de, vers]) => window.__docs[`Systeme_Parties/P1/Liens/${de}~${vers}`] || null, [de, vers]);
const etatSocial = () => p.evaluate(() => window.__docs["Systeme_Parties/P1/Social/etat"] || null);
const docsDe = (col) => p.evaluate((col) => Object.entries(window.__docs).filter(([k]) => k.startsWith(`Systeme_Parties/P1/${col}/`)).map(([k, v]) => ({ id: k.split("/").pop(), ...v })), col);
const SCENE = {
  evenements: [
    { type: "menacer", acteur: "Thorin", cible: "Doros", gravite: 2, resume: "Thorin a menacé Doros de sa hache.", extrait: "Thorin menace Doros de sa hache", confiance: 50 },
    { type: "soigner", acteur: "Lyra", cible: "Dame Koré", gravite: 1, resume: "Lyra a soigné la main de Koré.", extrait: "Lyra soigne la main blessée" },
    { type: "aider", acteur: "Zeus", cible: "Doros", gravite: 1, resume: "Zeus aide Doros." },
    { type: "aider", acteur: "Thorin", cible: "Lyra", gravite: 1, resume: "Thorin aide Lyra." },
    { type: "seduire", acteur: "Doros", cible: "Lyra", gravite: 1, resume: "Doros séduit Lyra." }
  ],
  souvenirs: [{ nom: "Doros", texte: "Ce barbu m'a menacé de sa hache, devant tout le monde.", a_propos_de: ["Thorin"], importance: 2 }]
};
const NARRATION = ["Thorin menace Doros de sa hache devant Dame Koré.\n", "Lyra soigne la main blessée de Dame Koré.\n", "Doros recule, blême."];
let idMessage = "";

// =========================================================================
titre("1. UN TOUR : MIA_SOCIAL LIT LA SCÈNE, LE MOTEUR CALCULE");
// =========================================================================
await section(async () => {
  await preparerTable();
  await p.evaluate(() => {
    window.__docs["Monde_PNJ/PNJ_KORE"].ID_Partie = "P1"; window.__docs["Monde_PNJ/PNJ_KORE"].Version_Creation = 409;
    window.__docs["Monde_PNJ/PNJ_DOROS"] = { Nom_PNJ: "Doros", ID_Lieu: "L_1", ID_Partie: "P1", Statut: "Vivant", Occupation: "Docker", Description_Physique: "Un docker.", URL_Cloudinary: "", Version_Creation: 409 };
  });
  await p.evaluate((o) => window.__fauxGemini(o), { casting: [], detection: [], batiment: faux.batiment, social: SCENE, narration: NARRATION });
  const t = await tourComplet();
  verifier("le tour va au bout", t.fini);
  const ok = await attendreQue(async () => ((await etatSocial()) || {}).tour === 1, 12000);
  verifier("le tour social est compté (Social/etat : tour 1)", ok);
  idMessage = await p.evaluate(() => ((window.__ajouts || []).filter(a => a.col === "Messages_Chat" && a.data.Est_Narration_IA).pop() || {}).id || "");
  const s = sociales[0] || {};
  verifier("MIA_SOCIAL lit les présents (Thorin, Lyra, Dame Koré, Doros), le catalogue, la réponse du MJ", /Thorin \(héros\)/.test(s.systeme || "") && /Doros \(PNJ\)/.test(s.systeme || "") && /Dame Koré \(PNJ\)/.test(s.systeme || "")
           && /- menacer : a menacé/.test(s.systeme || "") && /Thorin menace Doros de sa hache/.test(s.texte || ""));
  verifier("…et il lui est interdit de donner un chiffre", /Ne donne JAMAIS de chiffre/.test(s.systeme || ""));
  verifier("un seul appel MIA_SOCIAL par tour", sociales.length === 1, `${sociales.length}`);
});

// =========================================================================
titre("2. CE QUE LA SCÈNE A FAIT AUX LIENS");
// =========================================================================
await section(async () => {
  const dt = await lien("PNJ_DOROS", "H1"), kt = await lien("PNJ_KORE", "H1"), kl = await lien("PNJ_KORE", "H2"), td = await lien("H1", "PNJ_DOROS");
  verifier("Doros → Thorin : la crainte monte, la confiance baisse", !!dt && dt.axes.crainte > 5 && dt.axes.confiance < 0, JSON.stringify(dt && dt.axes));
  verifier("…le changement garde sa cause (derniers : la phrase, l'événement n° 1)", !!dt && dt.derniers.length === 1 && dt.derniers[0].n === 1 && /menacé Doros/.test(dt.derniers[0].resume));
  verifier("Koré, témoin, se méfie aussi de Thorin (moins que Doros)", !!kt && kt.axes.confiance < 0.5 && Math.abs(kt.axes.confiance) < Math.abs(dt.axes.confiance), JSON.stringify(kt && kt.axes));
  verifier("Koré → Lyra : soignée, elle se sent redevable", !!kl && kl.axes.dette > 0 && kl.axes.attachement > 0, JSON.stringify(kl && kl.axes));
  verifier("Thorin → Doros : son acte révèle son hostilité (attachement négatif)", !!td && td.axes.attachement < 0, JSON.stringify(td && td.axes));
  verifier("le chiffre glissé par l'IA (confiance 50) est ignoré", !!dt && dt.axes.confiance < 0);
  // (v417) les héros ont désormais un lien neutre de compagnons ; la scène ne le chiffre pas.
  const hh = [await lien("H1", "H2"), await lien("H2", "H1")];
  verifier("aucun lien chiffré entre deux héros (Thorin → Lyra : neutre, compagnon)", hh.every(l => !l || (l.etiquette === "compagnon" && l.axes.confiance === 0 && l.axes.attachement === 0 && l.axes.respect === 0)), JSON.stringify(hh[0] && hh[0].axes));
  const ev = await docsDe("Evenements_Sociaux");
  verifier("deux événements notés (Zeus, une action hors catalogue, deux héros : écartés)", ev.length === 2 && ev.map(e => e.type).join(",") === "menacer,soigner", ev.map(e => e.type).join(","));
  const menace = ev.find(e => e.type === "menacer") || {};
  verifier("…avec leurs témoins (Lyra, Koré), la gravité, les écarts et le message", JSON.stringify((menace.temoins || []).sort()) === '["H2","PNJ_KORE"]' && menace.gravite === 2 && menace.changements.length > 3 && menace.message === idMessage);
  const d = await ame("PNJ_DOROS");
  verifier("Doros a peur (jusqu'à 3 réponses du MJ de plus)", !!d && d.humeur && d.humeur.emotion === "peur" && d.humeur.jusquA === 4, JSON.stringify(d && d.humeur));
  const sv = await docsDe("Souvenirs");
  verifier("Doros garde le souvenir qu'en a écrit l'IA (à la première personne)", sv.some(x => x.ame === "PNJ_DOROS" && /barbu m'a menacé/.test(x.texte) && x.sujets.includes("H1") && x.importance === 2));
  verifier("…Koré, celui de l'événement (Lyra l'a soignée)", sv.some(x => x.ame === "PNJ_KORE" && /soigné/.test(x.texte)));
});

// =========================================================================
titre("3. LE CERVEAU À ENGRENAGE DANS LA MARGE");
// =========================================================================
await section(async () => {
  const m = await p.evaluate((id) => window.__docs["Messages_Chat/" + id] || {}, idMessage);
  const soc = m.Social || [];
  verifier("le message porte deux cerveaux : paragraphe 1 (la menace) et 2 (les soins)", soc.length === 2 && soc[0].para === 0 && soc[1].para === 1, JSON.stringify(soc.map(x => x.para)));
  verifier("…« Doros → Thorin : confiance −… · crainte +… »", /Doros → Thorin : .*confiance −\d+.*crainte \+\d+/.test((soc[0] || { lignes: [] }).lignes.join(" | ")), (soc[0] || { lignes: [] }).lignes.join(" | "));
  const livre = await p.evaluate((id) => {
    const m = { id, ...window.__docs["Messages_Chat/" + id] };
    const e = window.GRIMOIRE_RECIT.construireEntrees([m]).find(x => x.type === "narration");
    const span = document.createElement("span"); span.className = "cerveau-marge"; span.dataset.social = JSON.stringify((e.cerveaux[0] || {}).lignes || []);
    document.body.appendChild(span);
    window.montrerSocialIvalis(span);
    const b = document.getElementById("bulle-social");
    return { cerveaux: e.cerveaux.length, visible: b.classList.contains("visible"), texte: b.textContent };
  }, idMessage);
  verifier("le livre les lit (construireEntrees) ; un toucher ouvre la bulle des liens", livre.cerveaux === 2 && livre.visible && /Les fils invisibles/.test(livre.texte) && /Doros → Thorin/.test(livre.texte), livre.texte.slice(0, 120));
  verifier("le dessin : un cerveau à la plume et son engrenage", /cerveau-marge-svg/.test(lire("grimoire_recit.js")) && /class="engrenage"/.test(lire("grimoire_recit.js")) && /\.cerveau-marge \{/.test(lire("grimoire_recit.css")));
});

// =========================================================================
titre("4. JAMAIS DEUX FOIS LE MÊME MESSAGE ; LA RÉPÉTITION LASSE");
// =========================================================================
await section(async () => {
  const avant = (await lien("PNJ_DOROS", "H1")).axes.crainte;
  const r = await p.evaluate((id) => window.SOCIAL.apresLeTour({ idPartie: "P1", pnjs: [], heros: window.PERSOS_PARTIE, texteMJ: "Thorin menace Doros.", idMessage: id }), idMessage);
  verifier("le même message relu : « déjà lu », rien ne bouge", r && r.deja === true && (await lien("PNJ_DOROS", "H1")).axes.crainte === avant && sociales.length === 1);
  // Un second tour : Thorin menace encore Doros.
  await p.evaluate(() => {
    // Doros et Koré sont entrés dans la taverne avec les héros.
    const bat = window.__docs["Systeme_Parties/P1"].Lieu_Actuel;
    ["PNJ_DOROS", "PNJ_KORE"].forEach(id => { window.__docs["Monde_PNJ/" + id].ID_Batiment = bat; });
    window.__docs["Messages_Chat/c2"] = { ID_Partie: "P1", Auteur_ID: "H1", Auteur_Nom: "Thorin", Texte: "Je regarde Doros droit dans les yeux.", Timestamp: Date.now() }; window.__ajouts = []; window.__journal = []; });
  await p.evaluate((o) => window.__fauxGemini(o), { casting: [], detection: [], batiment: { action: "aucun" },
    social: { evenements: [SCENE.evenements[0]], souvenirs: [] }, narration: ["Thorin menace encore Doros de sa hache.\n"] });
  await tourComplet();
  await attendreQue(async () => ((await etatSocial()) || {}).tour === 2, 12000);
  const ev = await docsDe("Evenements_Sociaux");
  const e1 = ev.find(e => e.numero === 1), e3 = ev.find(e => e.numero === 3);
  const gain = (e) => (e.changements.find(c => c.de === "PNJ_DOROS" && c.axe === "crainte") || { avant: 0, apres: 0 });
  verifier("la même menace, au tour suivant, fait moins d'effet (lassitude)", !!e3 && (gain(e3).apres - gain(e3).avant) < (gain(e1).apres - gain(e1).avant) * 0.6,
           e3 ? `${(gain(e1).apres - gain(e1).avant).toFixed(2)} puis ${(gain(e3).apres - gain(e3).avant).toFixed(2)}` : "pas d'événement 3");
  verifier("deux appels MIA_SOCIAL en tout (un par tour)", sociales.length === 2, `${sociales.length}`);
});

await section(async () => {
  const index = lire("index.html");
  verifier("version 412 ; social.js, grimoire_recit.js et .css montent", Number((lire("version.json").match(/"version": (\d+)/) || [])[1]) >= 412 && /social\.js\?v=([2-9]|\d\d)"/.test(index));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
