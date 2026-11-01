// v293 — LES DÉPENSES DU MJ : CHAQUE RÉPONSE, SES TOKENS, SON COÛT EN EUROS.
//
// Nico : « dans paramètre outils j'aimerais que tu me mettes un bouton pour
// dedans voir toutes les dépenses à chaque réponse de mon IA MJ. J'aimerais
// le nb de tokens envoyés, et si possible le coût en euros de cet envoi. »
//
// Sur la VRAIE page, Firestore en mémoire, Gemini (en flux, avec ses
// comptes de tokens), OpenAI, Cloudinary et la BCE simulés : un tour de MJ
// complet, puis la fenêtre. Se charge sur l'ancien code (IVALIS_RACINE) : il
// y échoue, sans planter.
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
const MYRTO = { nom: "Myrto", physique: "Jeune femme aux tresses brunes", occupation: "Tavernière", race: "Humain", secret: "Elle cache un fugitif", style_parole: "Gouailleuse" };
const faux = { bce: { rate: 0.9, date: "2026-10-31" }, bceEnPanne: false };
await p.exposeFunction('__faux', (o) => Object.assign(faux, o));
// LA BCE (api.frankfurter.dev) : 1 $ = 0,90 €.
await p.route('**api.frankfurter.dev/**', r => {
  if (faux.bceEnPanne) { r.fulfill({ status: 503, headers: {'Access-Control-Allow-Origin':'*'}, body: "" }); return; }
  r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ date: faux.bce.date, base: "USD", quote: "EUR", rate: faux.bce.rate }) });
});
// GEMINI : le narrateur lit 12 000 tokens, en écrit 600 et réfléchit sur 400 ;
// chaque IA d'appoint lit 1 000 tokens et en écrit 100.
const USAGE_NARRATEUR = { promptTokenCount: 12000, candidatesTokenCount: 600, thoughtsTokenCount: 400, cachedContentTokenCount: 8000, totalTokenCount: 13000 };
const USAGE_AIDE = { promptTokenCount: 1000, candidatesTokenCount: 100, totalTokenCount: 1100 };
const requetes = [];
const appel = (nom, args) => JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: nom, args } }] } }], usageMetadata: USAGE_AIDE });
await p.route('**generativelanguage.googleapis.com/**', async r => {
  const url = r.request().url();
  const corps = JSON.parse(r.request().postData() || "{}");
  const systeme = corps.systemInstruction ? corps.systemInstruction.parts.map(x => x.text).join("\n") : "";
  const cle = (url.match(/key=([^&]+)/) || [])[1] || "";
  const qui = /Continue l'histoire/.test(systeme) ? "NARRATEUR" : /Tu es MIA_CASTING/.test(systeme) ? "MIA_CASTING" : /IA de casting/.test(systeme) ? "DETECTION"
            : /MIA_Batiment/.test(systeme) ? "BATIMENT" : /Tu es Mia, l'IA d'analyse/.test(systeme) ? "MIA_FILTRE" : (systeme.match(/Tu es (MIA_[A-Z_]+)/) || [])[1] || "AUTRE";
  requetes.push({ qui, cle, t: Date.now() });
  const json = (body) => r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body });
  if (qui === "NARRATEUR") {
    const morceaux = ["La porte de la taverne s'ouvre.\n", "Myrto lève les yeux de son comptoir.\nMyrto : « Entrez donc ! »"];
    r.fulfill({ contentType: 'text/event-stream', headers: {'Access-Control-Allow-Origin':'*'},
                body: morceaux.map((t, i) => "data: " + JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }],
                                                                     usageMetadata: i === morceaux.length - 1 ? USAGE_NARRATEUR : { promptTokenCount: 12000, totalTokenCount: 12000 } }) + "\r\n\r\n").join("") });
    return;
  }
  if (qui === "MIA_CASTING") { json(appel("preparerPNJ", { pnjs: [MYRTO] })); return; }
  if (qui === "MIA_FILTRE") { json(appel("selectionnerPNJ", { noms: [] })); return; }
  if (qui === "DETECTION") { json(appel("signalerNoms", { noms: [] })); return; }
  if (qui === "BATIMENT") { json(appel("gererDecor", { action: "aucun" })); return; }
  if (qui === "MIA_COMBAT") { json(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ combat: false, raison: "Un accueil." }) }] } }], usageMetadata: { promptTokenCount: 99999, candidatesTokenCount: 99 } })); return; }
  json(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }], usageMetadata: USAGE_AIDE }));
});
const openai = [];
await p.route('**api.openai.com/**', async r => {
  openai.push(r.request().url());
  await new Promise(res => setTimeout(res, 300));
  r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ data: [{ b64_json: PNG }] }) });
});
await p.route('**api.cloudinary.com/**', r => r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'},
  body: JSON.stringify({ secure_url: `https://res.cloudinary.com/dlkjq4kvg/image/upload/v1/PNJ/portrait_${Date.now()}.png` }) }));
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);

const preparerTable = () => p.evaluate((URL_PORTRAIT_KORE) => {
  window.jouerSonClic = () => {}; window.confirm = () => true; window.alert = () => {};
  localStorage.setItem("ID_JOUEUR_COURANT", "P_01");
  localStorage.removeItem("ivalis_MJ_MODELE"); localStorage.removeItem("ivalis_MJ_REFLEXION");
  ["GEMINI_API_KEY", "GEMINI_API_KEY_2", "OPENAI_API_KEY", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].forEach(k => localStorage.setItem("ivalis_" + k, "cle-" + k));
  window.ID_PARTIE_COURANTE = "P1";
  window.__docs = {};
  window.__docs["Systeme_Parties/P1"] = { Lieu_Actuel: "L_1", Situation: "Dans un lieu", Ordre_Initiative: ["H1", "H2"], Index_Initiative: 0 };
  window.__docs["Monde_Lieux/L_1"] = { Nom_Du_Lieu: "Le port de Mégara", Description_Global: "Un port de pêche." };
  window.__docs["Monde_PNJ/PNJ_KORE"] = { Nom_PNJ: "Dame Koré", ID_Lieu: "L_1", Race: "Humain", Occupation: "Grande prêtresse", Statut: "Vivant", Description_Physique: "Sévère.", URL_Cloudinary: URL_PORTRAIT_KORE };
  window.__docs["Cerveau_IA/INST_10895"] = { Titre_Menu: "MJ", Contenu_Direct: "Tu es le Maître du Jeu de test." };
  window.DATE_EN_JEU_ACTUELLE = { jour: "12", annee: "3" };
  window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Thorin" }, { idPersonnage: "H2", prenom: "Lyra" }];
  window.__docs["Messages_Chat/c1"] = { ID_Partie: "P1", Auteur_ID: "H1", Auteur_Nom: "Thorin", Texte: "J'entre dans la taverne.", Timestamp: Date.now() - 100000 };
  window.__ajouts = []; window.__journal = [];
}, URL_PORTRAIT_KORE);
const attendreQue = async (f, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await p.waitForTimeout(100); } return false; };
const releves = () => p.evaluate(() => JSON.parse(localStorage.getItem("ivalis_DEPENSES_MJ") || "[]"));
const proche = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// =========================================================================
titre("1. LE BOUTON ET LA FENÊTRE : PARAMÈTRES > OUTILS > DÉPENSES DU MJ");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const menu = document.getElementById("etape-menu-outils"), btn = document.getElementById("btn-depenses-mj"), fen = document.getElementById("etape-depenses-mj");
    return { dansOutils: !!(menu && btn && menu.contains(btn)), texte: btn ? btn.textContent.trim() : "", fenetre: !!fen && !!document.getElementById("depenses-mj-contenu"),
             titre: fen ? fen.querySelector("h2").textContent : "", fonctions: ["ouvrirDepensesMJ", "afficherDepensesMJ", "effacerDepensesMJ", "tarifGemini", "coutGeminiUSD", "coutImageUSD"].every(f => typeof window[f] === "function"),
             module: !!window.DEPENSES_IA };
  });
  verifier("un bouton « Dépenses du MJ » dans Paramètres > Outils", r.dansOutils && /Dépenses du MJ/.test(r.texte), r.texte);
  verifier("sa fenêtre : « Dépenses du Maître du Jeu »", r.fenetre && /Dépenses du Maître du Jeu/.test(r.titre), r.titre);
  verifier("le module des dépenses est chargé", r.module && r.fonctions);
});

// =========================================================================
titre("2. LES TARIFS : GOOGLE (PAR MILLION DE TOKENS, SELON LA DATE) ET LES IMAGES D'OPENAI");
// =========================================================================
await section(async () => {
  const t = await p.evaluate(() => ({
    flash: window.tarifGemini("gemini-3.8-flash", "2026-11-01"), flash2027: window.tarifGemini("gemini-3.8-flash", "2027-01-02"),
    argon: window.tarifGemini("gemini-4-argon", "2026-11-30"), argonDec: window.tarifGemini("gemini-4-argon", "2026-12-01"),
    lite: window.tarifGemini("gemini-flash-lite-latest", "2026-11-01"), inconnu: window.tarifGemini("un-modele", "2026-11-01"),
    cout: window.coutGeminiUSD("gemini-3.8-flash", { promptTokenCount: 1e6, candidatesTokenCount: 5e5, thoughtsTokenCount: 5e5 }, "2026-11-01"),
    portrait: window.coutImageUSD("medium", "1024x1792"), decor: window.coutImageUSD("low", "1792x1024"), carre: window.coutImageUSD("high", "1024x1024")
  }));
  verifier("Gemini 3.8 Flash : 0,75 $ / 3,75 $ jusqu'au 31/12/2026, puis 1,50 $ / 7,50 $", t.flash.entree === 0.75 && t.flash.sortie === 3.75 && t.flash2027.entree === 1.5 && t.flash2027.sortie === 7.5);
  verifier("Gemini 4 Argon : 2 $ / 10 $ jusqu'au 30/11/2026, puis 4 $ / 20 $", t.argon.entree === 2 && t.argon.sortie === 10 && t.argonDec.entree === 4 && t.argonDec.sortie === 20);
  verifier("Flash-Lite : 0,30 $ / 2,50 $ ; un modèle inconnu n'a pas de tarif", t.lite.entree === 0.3 && t.lite.sortie === 2.5 && t.inconnu === null);
  verifier("la réflexion se paie comme la sortie (1 M envoyés + 0,5 M reçus + 0,5 M de réflexion = 4,50 $)", proche(t.cout, 0.75 + 3.75), String(t.cout));
  verifier("images : portrait moyen 1024×1792 ≈ 0,093 $, décor bas 1792×1024 ≈ 0,011 $, haut 1024² = 0,211 $",
           proche(t.portrait, 0.053 * 1.75, 1e-9) && proche(t.decor, 0.006 * 1.75, 1e-9) && proche(t.carre, 0.211), `${t.portrait} ${t.decor} ${t.carre}`);
});

// =========================================================================
titre("3. UN TOUR DU MJ EST RELEVÉ : NARRATEUR, IA D'APPOINT, IMAGES, COÛT EN EUROS");
// =========================================================================
let ligne = null;
await section(async () => {
  await preparerTable();
  await p.evaluate(() => { localStorage.removeItem("ivalis_DEPENSES_MJ"); localStorage.removeItem("ivalis_TAUX_USD_EUR"); });
  const avant = requetes.length;
  await p.evaluate(() => { window.declencherTourIA(); });
  await attendreQue(async () => (await releves()).length > 0, 25000);
  const liste = await releves();
  ligne = liste[liste.length - 1] || null;
  verifier("une ligne est rangée pour ce tour", liste.length === 1 && !!ligne, `${liste.length} ligne(s)`);
  if (!ligne) return;
  verifier("le modèle et la réflexion du narrateur", ligne.modele === "gemini-3.8-flash" && ligne.reflexion === "medium", `${ligne.modele} ${ligne.reflexion}`);
  verifier("narrateur : 12 000 tokens envoyés, 600 reçus, 400 de réflexion (8 000 en cache)", ligne.narrateur.envoyes === 12000 && ligne.narrateur.recus === 600 && ligne.narrateur.reflexion === 400 && ligne.narrateur.cache === 8000,
           JSON.stringify(ligne.narrateur));
  const coutNarr = (12000 * 0.75 + 1000 * 3.75) / 1e6;
  verifier("son coût aux tarifs de 3.8 Flash : 0,01275 $", proche(ligne.narrateur.coutUSD, coutNarr, 1e-12), String(ligne.narrateur.coutUSD));
  const reqs = requetes.slice(avant);
  const aides1 = reqs.filter(x => x.qui !== "NARRATEUR" && x.cle === "cle-GEMINI_API_KEY").length;
  const combat = reqs.filter(x => x.cle === "cle-GEMINI_API_KEY_2").length;
  verifier("les IA d'appoint du tour (casting, Mia, bâtiment, PNJ, réputation…) : toutes relevées", ligne.aides.appels === aides1 && aides1 >= 5 && ligne.aides.envoyes === 1000 * aides1,
           `${ligne.aides.appels} relevées / ${aides1} appels, ${ligne.aides.envoyes} envoyés`);
  verifier("les IA du combat (seconde clé) ne sont pas comptées", combat >= 1 && ligne.aides.envoyes < 99999, `${combat} appel(s) de la seconde clé`);
  verifier("l'image : le portrait de Myrto (moyen, 1024×1792)", ligne.images.nombre === 1 && /medium 1024x1792/.test(ligne.images.detail.join(",")) && proche(ligne.images.coutUSD, 0.053 * 1.75, 1e-12),
           JSON.stringify(ligne.images));
  const totalUSD = coutNarr + aides1 * (1000 * 0.30 + 100 * 2.50) / 1e6 + 0.053 * 1.75;
  verifier("total en dollars = narrateur + appoint + images", proche(ligne.totalUSD, totalUSD, 1e-9), `${ligne.totalUSD} contre ${totalUSD}`);
  verifier("converti au taux de la BCE du jour (1 $ = 0,90 €, 31/10/2026)", ligne.taux === 0.9 && ligne.tauxDate === "2026-10-31" && !ligne.tauxSecours && proche(ligne.totalEUR, totalUSD * 0.9, 1e-9),
           `${ligne.totalEUR} €`);
  verifier("avec un extrait de la réponse du MJ", /La porte de la taverne/.test(ligne.extrait || ""), ligne.extrait);
});

// =========================================================================
titre("4. LA FENÊTRE : LES CUMULS, UNE LIGNE PAR RÉPONSE, LE DÉTAIL AU TOUCHER");
// =========================================================================
const espaces = (t) => String(t || "").replace(/[  ]/g, " ");
await section(async () => {
  await p.evaluate(() => window.ouvrirDepensesMJ());
  await p.waitForTimeout(900);
  const r = await p.evaluate(() => {
    const fen = document.getElementById("etape-depenses-mj");
    const lignes = Array.from(document.querySelectorAll(".depenses-ligne"));
    const cellules = lignes[0] ? Array.from(lignes[0].children).map(td => td.textContent) : [];
    const detail = document.querySelector(".depenses-detail");
    const avant = detail ? getComputedStyle(detail).display : "";
    if (lignes[0]) lignes[0].click();
    const apres = detail ? getComputedStyle(detail).display : "";
    return { visible: fen.style.display === "block", cartes: Array.from(document.querySelectorAll(".depenses-carte")).map(c => c.textContent), nbLignes: lignes.length, cellules,
             detail: detail ? detail.textContent : "", avant, apres, note: (document.querySelector(".depenses-note") || {}).textContent || "" };
  });
  verifier("la fenêtre s'ouvre", r.visible);
  verifier("quatre cumuls : dernière réponse, aujourd'hui, 30 jours, depuis le début", r.cartes.length === 4 && /Dernière réponse/.test(r.cartes[0]) && /Aujourd'hui/.test(r.cartes[1]) && /30 derniers jours/.test(r.cartes[2]) && /Depuis le début/.test(r.cartes[3]));
  const euros = (v) => espaces(v.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })) + " €";
  verifier("la dernière réponse : son coût en euros et ses tokens envoyés", !!ligne && espaces(r.cartes[0]).includes(euros(ligne.totalEUR)) && /tokens envoyés/.test(r.cartes[0]), espaces(r.cartes[0]));
  verifier("une ligne : date, modèle (réflexion), tokens envoyés, reçus (dont réflexion), appoint, images, coût", r.nbLignes === 1 && /Gemini 3\.8 Flash/.test(r.cellules[1]) && /réflexion moyenne/.test(r.cellules[1])
           && espaces(r.cellules[2]) === "12 000" && espaces(r.cellules[3]).startsWith("1 000") && /\(400\)/.test(r.cellules[3]) && /appels/.test(r.cellules[4]) && r.cellules[5] === "1" && espaces(r.cellules[6]) === euros(ligne.totalEUR),
           JSON.stringify(r.cellules.map(espaces)));
  verifier("le détail s'ouvre au toucher : narrateur, appoint, images, taux", r.avant === "none" && r.apres !== "none" && /Narrateur : 12/.test(espaces(r.detail)) && /IA d'appoint/.test(r.detail) && /Images OpenAI : 1/.test(r.detail) && /1 \$ = 0,9 € \(BCE, 2026-10-31\)/.test(r.detail),
           espaces(r.detail).slice(0, 160));
  verifier("la note dit d'où viennent les prix et que l'historique est celui de l'appareil", /tarifs publiés de Google/.test(r.note) && /appareil/.test(r.note));
  if (process.env.V293_CAPTURES) {
    await p.evaluate(() => {
      document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => e.style.display = e.id === "ecran-jeu" ? "block" : "none");
      const f = document.getElementById("etape-depenses-mj"); window.__caches = [];
      for (let e = f; e && e !== document.body; e = e.parentElement) { window.__caches.push([e, e.style.cssText]); if (getComputedStyle(e).display === "none") e.style.display = "block"; e.style.opacity = "1"; e.style.visibility = "visible"; }
      f.style.position = "fixed"; f.style.left = "50%"; f.style.top = "20px"; f.style.transform = "translateX(-50%)"; f.style.zIndex = "99999"; f.style.width = "900px";
    });
    await p.waitForTimeout(300);
    await p.locator("#etape-depenses-mj").screenshot({ path: process.env.V293_CAPTURES + "/v293_depenses.png" });
    await p.evaluate(() => (window.__caches || []).forEach(([e, css]) => { e.style.cssText = css; }));
  }
});

// =========================================================================
titre("5. LES GARDE-FOUS : BCE MUETTE, TOUR SANS APPEL, 300 LIGNES AU PLUS, EFFACER");
// =========================================================================
await section(async () => {
  await p.evaluate((o) => window.__faux(o), { bceEnPanne: true });
  const r = await p.evaluate(async () => {
    localStorage.removeItem("ivalis_TAUX_USD_EUR");
    const t = window.DEPENSES_IA.debutTour({ modele: "gemini-3.8-flash", reflexion: "low" });
    window.DEPENSES_IA.noterNarrateur(t, "gemini-3.8-flash", { promptTokenCount: 2000, candidatesTokenCount: 200 });
    const l = await window.DEPENSES_IA.finTour(t, { extrait: "Test" });
    const vide = await window.DEPENSES_IA.finTour(window.DEPENSES_IA.debutTour({ modele: "gemini-3.8-flash" }), {});
    return { l, vide };
  });
  verifier("la BCE ne répond pas : taux de secours (0,87), signalé", !!r.l && r.l.tauxSecours === true && r.l.taux === 0.87, r.l && `${r.l.taux} ${r.l.tauxSecours}`);
  verifier("un tour sans aucun appel n'ajoute rien", r.vide === null);
  const n = await p.evaluate(async () => {
    const l = JSON.parse(localStorage.getItem("ivalis_DEPENSES_MJ") || "[]");
    while (l.length < 300) l.push({ ...l[0], id: "X" + l.length });
    localStorage.setItem("ivalis_DEPENSES_MJ", JSON.stringify(l));
    const t = window.DEPENSES_IA.debutTour({ modele: "gemini-3.8-flash" });
    window.DEPENSES_IA.noterNarrateur(t, "gemini-3.8-flash", { promptTokenCount: 10, candidatesTokenCount: 1 });
    await window.DEPENSES_IA.finTour(t, {});
    return JSON.parse(localStorage.getItem("ivalis_DEPENSES_MJ")).length;
  });
  verifier("300 lignes au plus (les plus anciennes s'en vont)", n === 300, String(n));
  const e = await p.evaluate(() => { window.confirm = () => true; window.effacerDepensesMJ(); return { n: JSON.parse(localStorage.getItem("ivalis_DEPENSES_MJ") || "[]").length, vide: !!document.querySelector(".depenses-vide") }; });
  verifier("« Effacer l'historique » vide la liste (après confirmation)", e.n === 0 && e.vide, JSON.stringify(e));
});

await section(async () => {
  const index = lire("index.html");
  const v = (re) => Number((index.match(re) || [])[1] || 0);
  verifier("versions : depenses_ia, ia_master, style, trace du combat", /depenses_ia\.js\?v=\d+"/.test(index) && v(/ia_master\.js\?v=(\d+)"/) >= 14 && v(/style\.css\?v=(\d+)"/) >= 121 && v(/trace_combat\.js\?v=(\d+)"/) >= 198
           && Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]) >= 293 && Number((lire("version.json").match(/"version": (\d+)/) || [])[1]) >= 293);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
