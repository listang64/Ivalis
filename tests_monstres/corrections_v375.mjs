// v375 — LE CODE MORT (2/6) : L'ILLUSION, LA BOÎTE DE LA GRILLE, LES FACTIONS.
// L'effet Illusion est retiré depuis la v339 : plus rien ne posait de leurre, mais le choix de
// la case, la création du leurre et leurs appels restaient dans moteur_effets.js. La boîte DEV
// de la grille du combat du récit ne s'affichait plus depuis la v313 (« false && … ») ; et
// chaque connexion lisait toute la collection Monde_Factions pour un menu qui n'existe plus.
// Ce banc vérifie qu'ils sont partis, que detruireIllusion (les totems) reste, et que la page
// se charge sans erreur.
//
// Lancer : node tests_monstres/corrections_v375.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lire = (f) => { try { return fs.readFileSync(path.join(RACINE, f), 'utf-8'); } catch (e) { return ""; } };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' }); res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({}); export const getApp = () => ({}); export const BANC_IVALIS = true;`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...c) => ({ chemin: c.join("/") }); export const collection = (_db, ...c) => ({ col: c.join("/") });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const query = (c) => c; export const where = () => ({}); export const orderBy = () => ({}); export const limit = () => ({});
  export const getDocs = async () => ({ forEach() {}, docs: [], empty: true, size: 0 });
  export const setDoc = async (r, d) => { (window.__sets = window.__sets || []).push({ chemin: r.chemin, data: d }); };
  export const updateDoc = async () => {}; export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const onSnapshot = () => () => {}; export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
  export const runTransaction = async (_db, f) => f({ get: async () => ({ exists: () => false, data: () => ({}) }), update() {}, set() {} });
  export const increment = (k) => k; export const deleteField = () => null;
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const serverTimestamp = () => Date.now();
  export class FieldPath {} export const Timestamp = { now: () => Date.now() };
`;

console.log("\n1. LE TEXTE");
const me = lire("moteur_effets.js"), crp = lire("combat_rp.js"), app = lire("app.js"), css = lire("style.css");
verifier("moteur_effets.js ne pose plus de leurre", !/poserIllusions|resoudreIllusionInteractif|creerIllusion|illusionEnAttente|isIllusion/.test(me));
verifier("detruireIllusion reste (les totems du Chaman, la remise à zéro)", /window\.detruireIllusion = async function/.test(me));
verifier("une ancienne carte Illusion se joue toujours sans leurre", /if \(nomLower\.includes\("illusion"\)\) return;/.test(me));
verifier("combat_rp.js n'a plus la boîte de la grille ni ses régleurs",
         !/boite-grille|actualiserBoiteGrille|inscrireRegleur|regleurFraisMs|teneurGrille|changerGrilleCombatRP/.test(crp));
verifier("la grille est toujours validée d'office", /validerGrilleCombatRP\(Number\(c\.Taille_Depart\) \|\| 60, \{ auto: true \}\)/.test(crp));
verifier("style.css n'a plus la boîte de la grille", !/boite-grille/.test(css));
verifier("app.js ne lit plus Monde_Factions", !/Monde_Factions|recupererFactionsPourSelect|remplirSelectFactions/.test(app));

console.log("\n2. DANS LA VRAIE PAGE");
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const erreurs = [];
p.on('pageerror', e => erreurs.push(String(e.message || e)));
await p.route('**', r => {
  const url = r.request().url();
  if (url.startsWith(base)) return r.continue();
  if (url.includes('firebase-app.js')) return r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP });
  if (url.includes('firebase-firestore.js')) return r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE });
  return r.abort();
});
await p.goto(base + '/index.html');
await p.waitForFunction(() => typeof window.detruireIllusion === "function" && typeof window.validerGrilleCombatRP === "function", null, { timeout: 15000 });
await p.waitForTimeout(800);
const r = await p.evaluate(() => ({
  partis: ["poserIllusions", "resoudreIllusionInteractif", "creerIllusion", "teneurGrilleCombatRP", "changerGrilleCombatRP"].filter(n => typeof window[n] !== "undefined"),
  restent: ["detruireIllusion", "validerGrilleCombatRP", "resoudreBondInteractif", "choisirCaseRepli", "declencherResolution"].filter(n => typeof window[n] !== "function")
}));
verifier("les fonctions retirées n'existent plus dans la page", r.partis.length === 0, r.partis.join(", "));
verifier("leurs voisines sont toujours là", r.restent.length === 0, r.restent.join(", "));
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
