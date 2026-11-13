// v383 — LES BOUCLES (1 et 2) : LES CARTES DU LIVRE ET LA LOUPE.
// Nico : « que les images sur les cartes ne se chargent pas quand la page est ouverte, je le
// vois » ; « la loupe clignote à chaque changement de page : au repos, rends juste le milieu
// opaque, grisâtre, sans effet lourd ». Les cartes du livre préparent toutes leurs images dès
// l'entrée en partie, la carte vivante ne se montre (et ne remplace l'image de la page) qu'une
// fois ses images décodées ; leur veille réagit aux changements au lieu de tout revoir 5 fois
// par seconde. La loupe au repos est un verre grisâtre (plus de copie ni de filtre) ; un voile
// identique s'efface au début de la glisse.
//
// Lancer : node tests_monstres/corrections_v383.mjs
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
const cr = lire("cartes_regionales.js"), gr = lire("grimoire_regions.js"), lp = lire("loupe_cartes.js"), lcss = lire("loupe_cartes.css"), vg = lire("voyage_groupe.js");
verifier("la carte vivante attend que son image soit décodée (chargerImage)", /img\.onload = \(\) => \{\s*if \(typeof img\.decode !== "function"\) return resoudre\(img\);\s*img\.decode\(\)/.test(cr));
verifier("prête = chargée ET décodée (carteRegionalePrete)", /imagesDecodees\.has\(i\)/.test(cr) && /i\.decode\(\)\.then\(fini, fini\)/.test(cr));
verifier("toutes les régions se préparent dès l'entrée en partie (prechargerTout)", /function prechargerTout\(\)/.test(gr) && /prechargerTout\(\);/.test(gr));
verifier("la veille des cartes : plus 5 fois par seconde, endormie en arrière-plan, réveillée par les événements",
         !/setInterval\(veiller, 180\)/.test(gr) && /setInterval\(\(\) => \{ if \(!document\.hidden\) veiller\(\); \}, 250\)/.test(gr)
         && ["carte-regionale", "villages-regionaux-maj", "cartes-regionales-maj"].every(e => gr.includes(`addEventListener("${e}"`)));
verifier("…et ne refait plus rien sans changement (lieux, copie, taille)", /if \(!lieuxAJour\) lieuxAJour =/.test(gr) && /"v" \+ versionVue/.test(gr) && /new ResizeObserver/.test(gr));
verifier("le pion du groupe suit la marche image par image sur la carte du monde du livre", /suivreGroupeSurLeLivre/.test(gr) && /suivreGroupeSurLeLivre/.test(vg));
verifier("la loupe au repos : plus de copie d'images ni de filtre de déplacement", !/loupe-filtre-bombe|feDisplacementMap|loupe-lentille-contenu/.test(lp + lcss));
verifier("…un verre grisâtre, et le même voile au début de la glisse", /\.loupe-lentille, \.loupe-voile \{ background: radial-gradient/.test(lcss) && /el\.voile\.style\.opacity = String\(Math\.max\(0, 1 - t \/ 0\.35\)/.test(lp));
verifier("la veille de la loupe : un filet de 500 ms, endormi en arrière-plan, réveillé par les pages", /if \(document\.hidden\) return; ecouterLeLivre\(\); veiller\(\);/.test(lp) && /pf\.on\("changeState", veillerBientot\)/.test(lp));

console.log("\n2. DANS LA VRAIE PAGE : UNE CARTE N'EST PRÊTE QUE DÉCODÉE");
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
await p.waitForFunction(() => typeof window.carteRegionalePrete === "function" && !!document.getElementById("carte-region") && !!window.LOUPE_CARTES, null, { timeout: 15000 });
const r = await p.evaluate(async () => {
  const carte = document.getElementById("carte-region");
  const c = document.createElement("canvas"); c.width = 900; c.height = 600; const x = c.getContext("2d"); x.fillStyle = "#8a6"; x.fillRect(0, 0, 900, 600);
  const img = document.createElement("img"); img.className = "essai-v383";
  const charge = new Promise(res => { img.onload = res; });
  img.src = c.toDataURL("image/png"); carte.appendChild(img);
  await charge;
  const avant = window.carteRegionalePrete();          // chargée, son décodage vient d'être demandé
  await new Promise(res => setTimeout(res, 300));
  const apres = window.carteRegionalePrete();
  img.remove();
  const casse = document.createElement("img"); casse.src = "data:image/png;base64,AAAA"; carte.appendChild(casse);
  await new Promise(res => setTimeout(res, 200));
  const enErreur = window.carteRegionalePrete();
  casse.remove();
  return { avant, apres, enErreur };
});
verifier("une image chargée mais pas encore décodée : pas prête", r.avant === false, JSON.stringify(r));
verifier("décodée : prête", r.apres === true, JSON.stringify(r));
verifier("une image en erreur ne bloque pas la carte", r.enErreur === true, JSON.stringify(r));
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
