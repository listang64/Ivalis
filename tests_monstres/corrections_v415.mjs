// v415 — LA REFONTE DES PNJ, LOT 6 : LE CALIBRAGE.
//
// Sur la VRAIE page : la rancune qu'une menace laisse sur le lien, et
// l'élagage des souvenirs à la clôture de session (trente au plus par âme).
// L'histoire de test (histoire_sociale.mjs) juge le reste dans Node ; la liste
// déroulante des âmes, corrections_v414.
// Lancer : node tests_monstres/corrections_v415.mjs
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

const lien = (de, vers) => p.evaluate(([de, vers]) => window.__docs[`Systeme_Parties/P1/Liens/${de}~${vers}`] || null, [de, vers]);

// =========================================================================
titre("1. UN TOUR : LA MENACE LAISSE UNE RANCUNE SUR LE LIEN");
// =========================================================================
await section(async () => {
  await preparerTable();
  await p.evaluate(() => {
    window.__docs["Monde_PNJ/PNJ_KORE"].ID_Partie = "P1"; window.__docs["Monde_PNJ/PNJ_KORE"].Version_Creation = 409;
    window.__docs["Monde_PNJ/PNJ_DOROS"] = { Nom_PNJ: "Doros", ID_Lieu: "L_1", ID_Partie: "P1", Statut: "Vivant", Occupation: "Docker", Description_Physique: "Un docker.", URL_Cloudinary: "", Version_Creation: 409 };
  });
  await p.evaluate((o) => window.__fauxGemini(o), { casting: [], detection: [], batiment: { action: "aucun" },
    social: { evenements: [{ type: "menacer", acteur: "Thorin", cible: "Doros", gravite: 2, resume: "Thorin a menacé Doros.", extrait: "Thorin menace Doros" }] },
    narration: ["Thorin menace Doros de sa hache.\n"] });
  await tourComplet();
  await attendreQue(async () => !!(await lien("PNJ_DOROS", "H1")) && ((await lien("PNJ_DOROS", "H1")).derniers || []).length > 0, 12000);
  const l = await lien("PNJ_DOROS", "H1");
  // (v460) La première impression n'est plus forcément nulle (son empathie, son a priori tiré à la naissance) : la perte se compte depuis elle.
  const c0 = await p.evaluate(async () => { const a = (await window.SOCIAL.lireAmes("P1", ["PNJ_DOROS"]))["PNJ_DOROS"]; return a ? window.SOCIAL.premiereImpression(a.psyche, 0, a.disposition).confiance : 0; });
  verifier("Doros → Thorin garde sa rancune (la confiance perdue ×1,5)", !!l && l.rancune > 0 && Math.abs(l.rancune - (c0 - l.axes.confiance) * 1.5) < 2, JSON.stringify(l && { rancune: l.rancune, confiance: l.axes.confiance, depart: c0 }));
});

// =========================================================================
titre("2. LA CLÔTURE ÉLAGUE LES SOUVENIRS : TRENTE AU PLUS PAR ÂME");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => {
    const P = "Systeme_Parties/P1/Souvenirs/";
    for (let i = 0; i < 40; i++) window.__docs[P + "d" + i] = { ame: "PNJ_DOROS", texte: "Souvenir " + i, importance: i < 5 ? 3 : 1, tour: i };
    for (let i = 0; i < 4; i++) window.__docs[P + "k" + i] = { ame: "PNJ_KORE", texte: "Koré " + i, importance: 1, tour: i };
    const n = await window.SOCIAL.elaguerSouvenirs("P1");
    const restent = Object.entries(window.__docs).filter(([k]) => k.startsWith(P)).map(([k, v]) => ({ k, ...v }));
    return { n, doros: restent.filter(x => x.ame === "PNJ_DOROS"), kore: restent.filter(x => x.ame === "PNJ_KORE").length };
  });
  const tours = r.doros.map(x => x.tour).sort((a, b) => a - b);
  // (Doros avait déjà le souvenir de la menace du tour : 41 en tout, onze s'effacent.)
  verifier("Doros garde trente souvenirs (onze effacés) ; Koré, quatre, les garde tous", r.doros.length === 30 && r.kore === 4 && r.n === 11, `${r.doros.length} / ${r.kore} (${r.n} effacés)`);
  verifier("…les cinq plus importants restent, puis les plus récents", [0, 1, 2, 3, 4].every(t => tours.includes(t)) && tours.includes(39) && !tours.includes(5), tours.slice(0, 8).join(","));
  const ia = lire("ia_master.js");
  verifier("la clôture de session appelle l'élagage", /window\.SOCIAL\.elaguerSouvenirs\(window\.ID_PARTIE_COURANTE\)/.test(ia));
});

await section(async () => {
  const index = lire("index.html");
  verifier("version 415", Number((lire("version.json").match(/"version": (\d+)/) || [])[1]) >= 415 && /social_pur\.js\?v=\d+/.test(lire("social.js")));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
