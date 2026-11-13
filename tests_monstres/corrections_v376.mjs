// v375 — LE CODE MORT (2/6) : L'ILLUSION, LA BOÎTE DE LA GRILLE, LES FACTIONS.
// L'effet Illusion est retiré depuis la v339 : plus rien ne posait de leurre, mais le choix de
// la case, la création du leurre et leurs appels restaient dans moteur_effets.js. La boîte DEV
// de la grille du combat du récit ne s'affichait plus depuis la v313 (« false && … ») ; et
// chaque connexion lisait toute la collection Monde_Factions pour un menu qui n'existe plus.
// Ce banc vérifie qu'ils sont partis, que detruireIllusion (les totems) reste, et que la page
// se charge sans erreur.
//
// v376 — LE CODE MORT (3/6) : L'ANCIEN PARCHEMIN DU RÉCIT (recit_dynamique.js).
// Le « visual novel » plein écran du MJ était réduit au silence par le livre (grimoire_recit.js
// enveloppait lancerRecitDynamique et majRecitDynamique pour qu'ils ne fassent rien) : en partie,
// le livre est toujours là. Le fichier, ses appels (app.js), sa fin « Le destin hésite… /
// Combattre » (combat_rp.js, que seul ce parchemin appelait) et leur CSS sont retirés.
//
// Lancer : node tests_monstres/corrections_v376.mjs
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
const html = lire("index.html"), app = lire("app.js"), crp = lire("combat_rp.js"), gr = lire("grimoire_recit.js"), css = lire("style.css");
verifier("recit_dynamique.js n'existe plus et n'est plus chargé", !fs.existsSync(path.join(RACINE, "recit_dynamique.js")) && !/recit_dynamique|ecran-recit-dynamique/.test(html));
verifier("app.js n'appelle plus l'ancien parchemin", !/lancerRecitDynamique|majRecitDynamique|etatRecitDuMessage|recitDeclenche/.test(app));
verifier("le livre reçoit toujours les messages (livreRecitMessages)", /window\.livreRecitMessages\(snap\.docs/.test(app));
verifier("grimoire_recit.js n'enveloppe plus l'ancien parchemin", !/envelopper\("(lancer|maj)RecitDynamique"/.test(gr));
verifier("combat_rp.js n'a plus la fin du parchemin", !/finRecitCombat|dessinerFinRecit|recitEnAttente|attenteVerdictMs|bouton-combattre/.test(crp));
verifier("le bouton pour tous rejoint toujours le combat (v367)", /window\.rejoindreCombatRP\(\)/.test(crp) && /bouton-rejoindre-combat/.test(crp));
verifier("style.css n'a plus la fin du parchemin ni l'attente", !/\.fin-recit-combat|\.bouton-combattre|\.goutte-sang|\.attente-recit/.test(css));
verifier("la préparation du combat garde son souffle (destin-hesite)", /@keyframes destin-hesite/.test(css) && /animation: destin-hesite/.test(css));

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
await p.waitForFunction(() => typeof window.rejoindreCombatRP === "function" && !!window.GRIMOIRE_RECIT, null, { timeout: 15000 });
await p.waitForTimeout(800);
const r = await p.evaluate(() => ({
  partis: ["lancerRecitDynamique", "majRecitDynamique", "fermerRecitDynamique", "finRecitCombat"].filter(n => typeof window[n] !== "undefined"),
  restent: ["rejoindreCombatRP", "actualiserCombatRPAffichage", "appliquerCombatRPDeLaPartie", "livreRecitMessages"].filter(n => typeof window[n] !== "function")
}));
verifier("les fonctions retirées n'existent plus dans la page", r.partis.length === 0, r.partis.join(", "));
verifier("leurs voisines sont toujours là", r.restent.length === 0, r.restent.join(", "));
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
