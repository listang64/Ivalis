// v384 — LES BOUCLES (3) : LE FOND DE LA PAGE.
// Le fond de la page (html) recopie le décor de la scène visible (les bords de l'iPad, les
// rebonds). Il se refaisait toutes les 400 ms, en mesurant la carte du monde (qui n'a plus
// d'image depuis v335). Il se refait maintenant quand une scène change (style, classe, classe
// du body), à la fin de ses fondus, au retour dans l'onglet, avec un filet de 2 s endormi en
// arrière-plan ; la carte sans image n'est plus mesurée.
//
// Lancer : node tests_monstres/corrections_v384.mjs
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
const idx = lire("index.html");
verifier("plus de veille toutes les 400 ms", !/setInterval\(window\.synchroniserFondCanvas, 400\)/.test(idx));
verifier("les scènes veillées (MutationObserver sur style et classe, et le body)", /new MutationObserver\(synchroniserBientot\)/.test(idx) && /attributeFilter: \['style', 'class'\]/.test(idx) && /elementsVeilles = \[document\.body\]/.test(idx));
verifier("la fin des fondus réveille la recopie", /\['transitionend', 'animationend'\]/.test(idx));
verifier("le filet de 2 s, endormi quand l'onglet est caché", /if \(!document\.hidden\) window\.synchroniserFondCanvas\(\);\s*\}, 2000\)/.test(idx));
verifier("la carte sans image n'est plus mesurée", /scenes\[i\]\.suivreRect && image !== 'none'/.test(idx));
verifier("le combat coupe toujours la veille (suspendre / reprendre)", /window\.suspendreSynchroCanvas = function/.test(idx) && /veilleFond\.disconnect\(\)/.test(idx) && /window\.reprendreSynchroCanvas = function/.test(idx));

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
await p.waitForFunction(() => typeof window.synchroniserFondCanvas === "function" && !!window._intervalSynchroCanvas, null, { timeout: 15000 });
await p.waitForTimeout(1500);   // le chargement (pageshow, et son rattrapage 350 ms après) est passé
const r = await p.evaluate(async () => {
  const deuxImages = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const fond = () => { const st = getComputedStyle(document.documentElement); return st.backgroundColor + (st.backgroundImage === "none" ? "" : " + " + st.backgroundImage.slice(0, 15)); };
  // On compte les recopies.
  let appels = 0; const vraie = window.synchroniserFondCanvas;
  window.synchroniserFondCanvas = function () { appels++; return vraie.apply(this, arguments); };
  // Au calme : au plus le filet de 2 s pendant 1,5 s (l'ancienne veille en faisait 3 ou 4).
  appels = 0; await new Promise(res => setTimeout(res, 1500));
  const auCalme = appels;
  // Toutes les scènes cachées, sauf celle qu'on ouvre : le fond la suit tout de suite.
  const ids = ["ecran-choix-classe", "ecran-selection-race", "ecran-accueil", "ecran-identification", "fenetre-combat", "ecran-jeu"];
  const avant = {}; ids.forEach(id => { const el = document.getElementById(id); avant[id] = el.getAttribute("style"); el.style.display = "none"; });
  await deuxImages();
  const toutCache = fond();
  const fc = document.getElementById("fenetre-combat");
  fc.style.display = "block";
  await deuxImages();
  const combatOuvert = fond();
  // Une classe du body qui cache une scène (la création dans le livre cache le choix de classe).
  const cc = document.getElementById("ecran-choix-classe");
  fc.style.display = "none"; cc.style.display = "block";
  await deuxImages();
  const choixClasse = fond();
  document.body.classList.add("creation-livre");
  await deuxImages();
  const creation = fond();
  document.body.classList.remove("creation-livre"); cc.style.display = "none";
  await deuxImages();
  // Le combat coupe la veille : une scène qui change ne réveille plus rien…
  window.suspendreSynchroCanvas();
  appels = 0; fc.style.display = "block"; await deuxImages();
  const suspendu = { appels, fond: fond(), intervalle: window._intervalSynchroCanvas };
  // …et en sortant, elle reprend et rattrape la scène.
  window.reprendreSynchroCanvas();
  await deuxImages();
  const repris = { fond: fond(), intervalle: !!window._intervalSynchroCanvas };
  // La carte sans image n'est pas mesurée.
  fc.style.display = "none"; document.getElementById("ecran-jeu").style.display = "block";
  const carte = document.getElementById("carte-fond-jeu");
  let mesures = 0; const gbcr = carte.getBoundingClientRect;
  carte.getBoundingClientRect = function () { mesures++; return gbcr.apply(this, arguments); };
  await deuxImages(); window.synchroniserFondCanvas();
  const carteMesuree = mesures;
  delete carte.getBoundingClientRect;
  ids.forEach(id => { const el = document.getElementById(id); if (avant[id] === null) el.removeAttribute("style"); else el.setAttribute("style", avant[id]); });
  window.synchroniserFondCanvas = vraie;
  return { auCalme, toutCache, combatOuvert, choixClasse, creation, suspendu, repris, carteMesuree };
});
verifier("au calme : au plus le filet en 1,5 s (l'ancienne veille : 3 ou 4)", r.auCalme <= 1, `${r.auCalme} appel(s)`);
verifier("aucune scène : fond noir", r.toutCache === "rgb(0, 0, 0)", r.toutCache);
verifier("la fenêtre de combat s'ouvre : le fond la suit à l'image suivante", r.combatOuvert === "rgb(26, 26, 26)", r.combatOuvert);
verifier("le choix de classe (son dégradé, sur fond noir)", r.choixClasse === "rgb(0, 0, 0) + radial-gradient", r.choixClasse);
verifier("la classe du body le cache : le fond suit (plus de dégradé)", r.creation === "rgb(0, 0, 0)", r.creation);
verifier("veille coupée : une scène qui change ne réveille rien", r.suspendu.appels === 0 && r.suspendu.fond === "rgb(0, 0, 0)" && !r.suspendu.intervalle, JSON.stringify(r.suspendu));
verifier("veille reprise : elle rattrape la scène ouverte", r.repris.fond === "rgb(26, 26, 26)" && r.repris.intervalle, JSON.stringify(r.repris));
verifier("la carte du monde sans image n'est pas mesurée", r.carteMesuree === 0, `${r.carteMesuree} mesure(s)`);
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
