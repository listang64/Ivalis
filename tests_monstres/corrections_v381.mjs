// v381 — LE CODE MORT (E) : LE JS QUI CHERCHAIT DES ÉLÉMENTS DISPARUS.
// Des lignes allaient chercher dans la page des éléments que plus rien ne crée (le bouton
// « Choisir » d'avant le deck, l'engrenage du combat, RÉSOUDRE / ANNULER, le menu des
// éléments de la Forge, le nom du joueur du grimoire, le sol de l'ancienne carte du monde) :
// elles ne faisaient rien. Ce banc vérifie qu'elles sont parties, et que la carte du monde,
// la Forge et le grimoire marchent sans erreur.
//
// Lancer : node tests_monstres/corrections_v381.mjs
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

const PARTIES = {
  "combat.js": ["btn-choisir-action"],
  "app.js": ["btn-engrenage-combat", "table-monde"],
  "moteur_effets.js": ["btn-resoudre-carte", "btn-annuler-ciblage"],
  "competences.js": ["forge-element"],
  "grimoire.js": ["grimoire-nom-joueur"],
  "cartes_regionales.js": ["table-monde"]
};
console.log("\n1. LE TEXTE");
const html = lire("index.html");
Object.entries(PARTIES).forEach(([f, ids]) => {
  const src = lire(f);
  const restes = ids.filter(id => src.includes('"' + id + '"'));
  verifier(`${f} ne cherche plus ${ids.join(", ")}`, restes.length === 0, restes.join(", "));
});
verifier("aucun de ces éléments n'existe dans la page", Object.values(PARTIES).flat().every(id => !html.includes('id="' + id + '"')));
verifier("RÉSOUDRE / ANNULER restent absents (poserBoutonsCibleUnique, v367, inchangé)", /window\.poserBoutonsCibleUnique = function/.test(lire("moteur_effets.js")));

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
await p.waitForFunction(() => typeof window.afficherGrimoire === "function" && typeof window.fermerToutesLesFenetres === "function" && typeof window.ouvrirCarteRegionale === "function", null, { timeout: 15000 });
await p.waitForTimeout(800);
const r = await p.evaluate(async () => {
  const essais = [];
  const essayer = async (nom, f) => { try { await f(); essais.push(nom + ":ok"); } catch (e) { essais.push(nom + ":" + e.message); } };
  await essayer("grimoire", () => window.afficherGrimoire());
  await essayer("tout fermer", () => window.fermerToutesLesFenetres());
  document.getElementById("ecran-jeu").style.display = "block";
  await essayer("carte régionale (plongée, nuages, retour)", async () => { await window.ouvrirCarteRegionale(2); await window.fermerCarteRegionale(); });
  return { essais, transform: document.getElementById("carte-fond-jeu").style.transform };
});
verifier("le grimoire, « tout fermer », la carte régionale et son retour marchent", r.essais.every(e => /:ok$/.test(e)), r.essais.join(" | "));
verifier("la carte du monde garde son cadrage après le retour", typeof r.transform === "string", r.transform);
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
