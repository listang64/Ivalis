// v386 — LE LIVRE NE SE REDESSINE PLUS QUAND IL NE BOUGE PAS.
// Nico : « oui, optimise ce livre ». StPageFlip (vendor/page-flip) redessinait toutes les pages du
// grimoire à chaque image, 60 fois par seconde, même immobile : chaque page recevait de nouveau
// son style et la page entière se recalculait. Au repos (rien ne tourne, aucune page tenue, pas
// d'ombre), il ne redessine plus que si quelque chose a changé : la double page, la taille du
// livre, la liste des pages, ou le style d'une page touché d'ailleurs (grimoire.js).
//
// Lancer : node tests_monstres/corrections_v386.mjs
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
const gr = lire("grimoire.js"), vendor = lire("vendor/page-flip/page-flip.browser.js");
verifier("la bibliothèque du livre n'est pas modifiée (le correctif vit dans grimoire.js)", /const t=e=>\{this\.render\(e\),requestAnimationFrame\(t\)\}/.test(vendor) && /rendu\.drawFrame = \(\) => \{/.test(gr));
verifier("au repos et sans changement, pas de nouveau dessin", /const repos = pageFlip\.getState\(\) === "read" && !rendu\.animation && !rendu\.flippingPage && !rendu\.bottomPage && !rendu\.shadow;/.test(gr)
         && /if \(sig && dernier && !touche && sig\.every\(\(v, i\) => v === dernier\[i\]\)\) return;/.test(gr));
verifier("un style de page touché d'ailleurs fait redessiner (ses propres styles non)", /new MutationObserver\(\(\) => \{ touche = true; \}\)/.test(gr) && /veille\.takeRecords\(\);/.test(gr));

console.log("\n2. DANS LA VRAIE PAGE");
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
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
await p.waitForTimeout(900);
await p.evaluate(() => {
  window.jouerSonEvenement = () => true; window.jouerSonClic = () => {};
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== "ecran-grimoire") e.style.display = "none"; });
  window.afficherGrimoire();
});
await p.waitForTimeout(1300);
await p.evaluate(() => window.ouvrirGrimoire());
const attendreQue = async (f, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await p.waitForTimeout(100); } return false; };
const pose = () => attendreQue(() => p.evaluate(() => !!window.GRIMOIRE_PAGEFLIP && window.GRIMOIRE_PAGEFLIP.getState() === "read" && !window.GRIMOIRE.defileEnCours() && !window.GRIMOIRE_PAGEFLIP.getRender().animation));
verifier("le livre s'ouvre", await pose());
await p.waitForTimeout(1500);
const cdp = await p.context().newCDPSession(p);
await cdp.send('Performance.enable');
const metrique = async (k) => (await cdp.send('Performance.getMetrics')).metrics.find(x => x.name === k).value;
// Ce que le livre écrit sur ses pages, pendant un temps donné.
const ecritures = (ms) => p.evaluate(async (ms) => {
  let n = 0; const mo = new MutationObserver(l => { n += l.length; });
  document.querySelectorAll("#grimoire-livre .stf__item").forEach(el => mo.observe(el, { attributes: true, attributeFilter: ["style"] }));
  await new Promise(r => setTimeout(r, ms)); mo.disconnect(); return n;
}, ms);
const s0 = await metrique('RecalcStyleCount');
const auRepos = await ecritures(2000);
const s1 = await metrique('RecalcStyleCount');
const nbPages = await p.evaluate(() => document.querySelectorAll("#grimoire-livre .stf__item").length);
verifier("au repos : plus aucun style réécrit sur les pages en 2 s", auRepos === 0, `${auRepos} écriture(s), ${nbPages} pages`);
verifier("…et la page ne se recalcule presque plus (avant : ~120 fois en 2 s)", s1 - s0 <= 15, `${s1 - s0} recalcul(s)`);
// Visible : exactement la double page ouverte.
const visibles = () => p.evaluate(() => {
  const pf = window.GRIMOIRE_PAGEFLIP, rd = pf.getRender();
  const ouvertes = [rd.leftPage, rd.rightPage].filter(Boolean).map(x => x.getElement());
  const montrees = [...document.querySelectorAll("#grimoire-livre .stf__item")].filter(el => getComputedStyle(el).display !== "none");
  return { ok: montrees.length === ouvertes.length && montrees.every(el => ouvertes.includes(el)), page: pf.getCurrentPageIndex(), n: montrees.length };
});
const avant = await visibles();
verifier("seule la double page ouverte est montrée", avant.ok, JSON.stringify(avant));
// La page tourne toujours, en entier.
const pendant = p.evaluate(async () => { let n = 0; const mo = new MutationObserver(l => { n += l.length; });
  document.querySelectorAll("#grimoire-livre .stf__item").forEach(el => mo.observe(el, { attributes: true, attributeFilter: ["style"] }));
  window.GRIMOIRE_PAGEFLIP.flipNext("top"); await new Promise(r => setTimeout(r, 600)); mo.disconnect(); return n; });
const nTourne = await pendant;
await p.waitForTimeout(900); await pose(); await p.waitForTimeout(300);
const apres = await visibles();
verifier("une page tourne : elle se dessine image par image", nTourne >= 20, `${nTourne} écriture(s) en 0,6 s`);
verifier("…elle se pose sur la double page suivante, seule montrée", apres.ok && apres.page === avant.page + 2, JSON.stringify(apres));
verifier("…puis le livre se tait de nouveau", (await ecritures(1000)) === 0);
// Un style de page touché d'ailleurs : le livre le remet à l'image suivante.
const remis = await p.evaluate(async () => {
  const el = window.GRIMOIRE_PAGEFLIP.getRender().rightPage.getElement();
  el.style.display = "none";
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return getComputedStyle(el).display;
});
verifier("un style de page dérangé d'ailleurs est remis à l'image suivante", remis === "block", remis);
// La fenêtre change de taille : les pages suivent.
const largeur = () => p.evaluate(() => parseFloat(window.GRIMOIRE_PAGEFLIP.getRender().rightPage.getElement().style.width));
const l0 = await largeur();
await p.setViewportSize({ width: 900, height: 700 });
await p.waitForTimeout(900);
const l1 = await largeur();
const attendue = await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getRender().getRect().pageWidth);
verifier("la fenêtre rétrécit : les pages suivent la nouvelle taille du livre", l1 < l0 && Math.abs(l1 - attendue) < 0.5, `${l0} → ${l1} (attendu ${attendue})`);
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
