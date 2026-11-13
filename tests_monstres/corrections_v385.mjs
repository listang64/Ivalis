// v385 — LES BOUCLES (4, 5 et 6) : LE BANDEAU DU COMBAT, LE BROUILLARD, LA NUIT, L'ARRIÈRE-PLAN.
// Hors combat, le veilleur du bandeau posait la plaque du tour puis la mesurait à vide toutes
// les 600 ms (un calcul forcé de la page) ; celui du brouillard d'aveuglement repassait toutes
// les 400 ms. Ils ne travaillent plus qu'en combat (le brouillard repasse encore une fois pour
// effacer ce qui resterait). Le voile de la nuit ne se revoit que la nuit (ou pour s'éteindre).
// Et ces veilles visuelles (avec le bouton « Rejoindre le combat » et les marque-pages de la
// création) dorment quand l'onglet est caché.
//
// Lancer : node tests_monstres/corrections_v385.mjs
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
const hud = lire("hud_disposition.js"), me = lire("moteur_effets.js"), vg = lire("voyage_groupe.js"), crp = lire("combat_rp.js"), gc = lire("grimoire_creation.js");
verifier("le bandeau : seulement en combat, endormi en arrière-plan", /if \(document\.hidden \|\| !fenetre \|\| fenetre\.style\.display !== "block"\) return;\s*suivreLaLargeur\(\);/.test(hud));
verifier("le brouillard : seulement en combat (ou pour s'effacer), endormi en arrière-plan", /if \(document\.hidden\) return;[\s\S]{0,200}!document\.getElementById\("svg-brouillard-aveugle"\)\) return;\s*window\.dessinerBrouillardAveuglement\(\);/.test(me));
verifier("la nuit : seulement la nuit (ou pour s'éteindre), endormie en arrière-plan", /\(voyage && voyage\.Etat === "nuit"\) \|\| n\.classList\.contains\("visible"\)/.test(vg) && /if \(document\.hidden\) return;\s*const n = \$\("voile-nuit-voyage"\);/.test(vg));
verifier("le bouton « Rejoindre » et les marque-pages de la création : endormis en arrière-plan", /if \(document\.hidden\) return; try \{ actualiserBoutonRejoindre\(\);/.test(crp) && /if \(!actif \|\| document\.hidden\) return;/.test(gc));

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
await p.waitForFunction(() => typeof window.appliquerReglagesEncart === "function" && typeof window.dessinerBrouillardAveuglement === "function" && !!window.__brouillardAveugleVeille, null, { timeout: 15000 });
await p.waitForTimeout(800);
const r = await p.evaluate(async () => {
  const attendre = (ms) => new Promise(res => setTimeout(res, ms));
  const fc = document.getElementById("fenetre-combat");
  const dedans = fc.contains(document.getElementById("voile-tour-encart")) && fc.contains(document.getElementById("combat-hud-bas-droite"));
  let poses = 0, dessins = 0;
  const vraiePose = window.appliquerReglagesEncart, vraiDessin = window.dessinerBrouillardAveuglement;
  window.appliquerReglagesEncart = function () { poses++; return vraiePose.apply(this, arguments); };
  window.dessinerBrouillardAveuglement = function () { dessins++; return vraiDessin.apply(this, arguments); };
  const compter = async (ms) => { poses = 0; dessins = 0; await attendre(ms); return { poses, dessins }; };
  // Hors combat : rien.
  const horsCombat = await compter(1500);
  // Un reste de brouillard hors combat : il s'efface au passage suivant.
  const reste = document.createElementNS("http://www.w3.org/2000/svg", "svg"); reste.id = "svg-brouillard-aveugle"; document.body.appendChild(reste);
  await attendre(700);
  const resteEfface = !document.getElementById("svg-brouillard-aveugle");
  // En combat : ils travaillent.
  const avant = fc.style.display; fc.style.display = "block";
  const enCombat = await compter(1500);
  // L'onglet caché : ils dorment, même en combat.
  Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
  const cache = await compter(1300);
  delete document.hidden;
  fc.style.display = avant;
  // La nuit : un voile resté allumé hors de la nuit s'éteint.
  let voile = document.getElementById("voile-nuit-voyage"), cree = false;
  if (!voile) { voile = document.createElement("div"); voile.id = "voile-nuit-voyage"; voile.className = "voile-nuit-voyage"; document.body.appendChild(voile); cree = true; }
  voile.classList.add("visible");
  await attendre(700);
  const nuitEteinte = !voile.classList.contains("visible");
  if (cree) voile.remove();
  window.appliquerReglagesEncart = vraiePose; window.dessinerBrouillardAveuglement = vraiDessin;
  return { dedans, horsCombat, resteEfface, enCombat, cache, nuitEteinte };
});
verifier("la plaque et le bandeau vivent dans la fenêtre de combat", r.dedans);
verifier("hors combat : ni pose de la plaque, ni brouillard en 1,5 s", r.horsCombat.poses === 0 && r.horsCombat.dessins === 0, JSON.stringify(r.horsCombat));
verifier("un reste de brouillard hors combat s'efface", r.resteEfface);
verifier("en combat : la plaque se pose et le brouillard se revoit", r.enCombat.poses >= 1 && r.enCombat.dessins >= 2, JSON.stringify(r.enCombat));
verifier("onglet caché : plus rien, même en combat", r.cache.poses === 0 && r.cache.dessins === 0, JSON.stringify(r.cache));
verifier("un voile de nuit resté allumé hors de la nuit s'éteint", r.nuitEteinte);
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
