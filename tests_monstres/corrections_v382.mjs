// v382 — LE CODE MORT (F) : LE CSS SANS CIBLE.
// Des règles de style.css, grimoire.css et grimoire_recit.css visaient des éléments ou des
// classes que plus rien ne crée (le bouton « Choisir » sous la carte HD, le halo de coût de
// fatigue, les menus coulissants du combat, la barre RÉSOUDRE / ANNULER, le sol de l'ancienne
// carte du monde, le marque-page de la terre, le surligneur, le post-it appuyé, la validation
// des visuels). Ce banc vérifie qu'elles sont parties, que chaque règle restante vise quelque
// chose qui existe (dans la page ou dans le JS), et que la page se charge sans erreur.
//
// Lancer : node tests_monstres/corrections_v382.mjs
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

console.log("\n1. LES RÈGLES PARTIES");
const style = lire("style.css"), grim = lire("grimoire.css"), recit = lire("grimoire_recit.css");
const parties = { "style.css": [".btn-choisir-combat", ".barre-fatigue-cout", "@keyframes effetHaloRougeFatigue", ".menu-coulissant-droit", ".bouton-tourne-hover", "#barre-ciblage-resolution",
                                 ".bouton-barre-ciblage", ".bouton-resoudre", ".bouton-annuler", "#table-monde", ".liste-visuels-valider", ".qui-visuel", ".description-visuel-valider"],
                  "grimoire.css": [".surligneur", ".marque-terre", ".dessin-terre"], "grimoire_recit.css": [".recit-postit.appuye"] };
Object.entries(parties).forEach(([f, sels]) => {
  const css = lire(f).replace(/\/\*[\s\S]*?\*\//g, "");   // (les commentaires peuvent encore les nommer)
  const restes = sels.filter(x => new RegExp(x.replace(/[.#$]/g, "\\$&") + "(?![\\w-])").test(css));
  verifier(`${f} : ${sels.length} règle(s) sans cible partie(s)`, restes.length === 0, restes.join(", "));
});

console.log("\n2. CHAQUE RÈGLE RESTANTE A UNE CIBLE");
{
  // Les noms de classes et d'identifiants du HTML et du JS chargés (les commentaires ôtés), et
  // les préfixes qu'un script complète (« etat-" + nom », `pion-${…}`).
  const scripts = [...lire("index.html").matchAll(/<script[^>]*src="([^"?]+)/g)].map(m => m[1]).filter(f => !/^(vendor|http)/.test(f));
  let corpus = lire("index.html") + scripts.concat(["firebase-config.js", "playlist.js", "totems_pur.js"]).map(lire).join("\n") + lire("vendor/page-flip/page-flip.browser.js");
  corpus = corpus.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const mots = new Set(corpus.match(/[A-Za-z_][\w-]*/g));
  const prefixes = new Set([...corpus.matchAll(/["'`\s]([a-z][\w-]*-)["'`]?\s*\+/g)].map(m => m[1]).concat([...corpus.matchAll(/([a-z][\w-]*-)\$\{/g)].map(m => m[1])));
  const vit = (n) => mots.has(n) || [...prefixes].some(p => n.startsWith(p));
  const orphelines = [];
  ["style.css", "grimoire.css", "grimoire_recit.css", "grimoire_carte.css", "grimoire_regions.css", "grimoire_fiches.css", "grimoire_creation.css", "loupe_cartes.css"].forEach(f => {
    const css = lire(f).replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of css.matchAll(/([^{}@]+)\{[^{}]*\}/g)) {
      const sel = m[1].trim();
      if (!sel || /^(from|to|[\d.%, ]+)$/.test(sel)) continue;
      const vivant = sel.split(",").some(x => [...x.matchAll(/[.#]([A-Za-z_][\w-]*)/g)].every(k => vit(k[1])));
      if (!vivant) orphelines.push(f + " : " + sel.slice(0, 60));
    }
  });
  verifier("aucune règle CSS ne vise plus un élément ou une classe disparus", orphelines.length === 0, orphelines.slice(0, 4).join(" | "));
}

console.log("\n3. DANS LA VRAIE PAGE");
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
await p.waitForFunction(() => typeof window.afficherGrimoire === "function", null, { timeout: 15000 });
await p.waitForTimeout(800);
const r = await p.evaluate(() => ({ feuilles: [...document.styleSheets].filter(s => s.href && /127\.0\.0\.1/.test(s.href)).map(s => { try { return s.cssRules.length; } catch (e) { return -1; } }) }));
verifier("les feuilles de style du jeu se lisent (aucune n'est cassée)", r.feuilles.length >= 8 && r.feuilles.every(n => n > 0), JSON.stringify(r.feuilles));
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
