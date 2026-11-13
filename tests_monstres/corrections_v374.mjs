// v374 — LE CODE MORT DU PARCHEMIN BRÛLÉ, RETIRÉ.
// bords_parchemin.js et usure_monde.js n'étaient plus chargés depuis la v332 ; le pinceau
// d'usure, la gomme et les ciseaux des cartes régionales (cartes_regionales.js), la brûlure
// des pages du livre (grimoire_regions.js) et leur CSS restaient là sans servir. Ce banc
// vérifie qu'ils sont partis et que la carte régionale marche comme avant : elle s'ouvre,
// son titre s'édite en DEV, les terrains s'éditent, elle se referme, sans erreur.
//
// Lancer : node tests_monstres/corrections_v374.mjs
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

console.log("\n1. LES FICHIERS ET LE TEXTE");
const html = lire("index.html");
verifier("bords_parchemin.js et usure_monde.js n'existent plus", !fs.existsSync(path.join(RACINE, "bords_parchemin.js")) && !fs.existsSync(path.join(RACINE, "usure_monde.js")));
verifier("index.html ne les nomme pas", !/bords_parchemin|usure_monde/.test(html));
const cr = lire("cartes_regionales.js");
const restes = ["choisirOutilRegion", "peindreCarteRegion", "grilleUsureRegion", "grilleCoupeRegion", "poserBordCarteRegion",
                "validerNuagesRegion", "annulerNuagesRegion", "encoderGrilleNuages", "BordsParchemin", "carte-region-peinture", "lacherOutilUsureMonde"];
verifier("cartes_regionales.js n'a plus le pinceau, la gomme ni les ciseaux", restes.every(r => !cr.includes(r)), restes.filter(r => cr.includes(r)).join(", "));
verifier("grimoire_regions.js ne brûle plus les pages", !/BordsParchemin|bruler\(/.test(lire("grimoire_regions.js")));
verifier("terrains_regionaux.js n'enveloppe plus l'outil disparu", !/choisirOutilRegion|outilCarteRegion/.test(lire("terrains_regionaux.js")));
verifier("style.css n'a plus les règles du pinceau ni de l'usure",
         !/carte-region-peinture|popup-regions-outil|popup-regions-calque|carte-monde-usure-peinture|parchemin-usure|outil-pinceau/.test(lire("style.css")));

console.log("\n2. DANS LA VRAIE PAGE : LA CARTE RÉGIONALE");
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const erreurs = [];
p.on('pageerror', e => erreurs.push(String(e.message || e)));
await p.addInitScript(() => { try { localStorage.setItem("ivalis_DEV_MODE", "on"); } catch (e) {} });
await p.route('**', r => {
  const url = r.request().url();
  if (url.startsWith(base)) return r.continue();
  if (url.includes('firebase-app.js')) return r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP });
  if (url.includes('firebase-firestore.js')) return r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE });
  return r.abort();
});
await p.goto(base + '/index.html');
await p.waitForFunction(() => typeof window.ouvrirCarteRegionale === "function" && typeof window.basculerEditionTerrains === "function", null, { timeout: 15000 });
await p.waitForTimeout(800);
const r = await p.evaluate(async () => {
  const absents = ["choisirOutilRegion", "outilCarteRegion", "peindreCarteRegion", "BordsParchemin", "lacherOutilUsureMonde"].filter(n => typeof window[n] !== "undefined");
  document.getElementById("ecran-jeu").style.display = "block";
  const ouverte = await window.ouvrirCarteRegionale(1, { sansTransition: true });
  const vue = document.getElementById("vue-carte-region");
  const vueVisible = !!vue && vue.style.display === "block";
  const titre = document.querySelector("#carte-region-titre .carte-region-titre-texte");
  const edite = window.basculerEditionTitreRegion(true);
  const classeEdition = document.getElementById("carte-region-titre").classList.contains("edition");
  const caseTitre = document.getElementById("case-region-titre");
  const caseCochee = !!(caseTitre && caseTitre.checked);
  const terrains = window.basculerEditionTerrains(true);           // les terrains : le titre est lâché
  const titreLache = !document.getElementById("carte-region-titre").classList.contains("edition");
  const terrainsFin = window.basculerEditionTerrains(false);
  const sauvesTitre = (window.__sets || []).filter(s => s.chemin === "Cartes_Regionales/1" && s.data && s.data.Titre).length;
  const fermee = await window.fermerCarteRegionale({ sansTransition: true });
  return { absents, ouverte, vueVisible, toile: !!document.getElementById("carte-region-peinture"),
           nom: titre ? titre.textContent : "", edite, classeEdition, caseCochee, terrains, titreLache, terrainsFin, sauvesTitre, fermee,
           vueCachee: vue.style.display === "none", carte: window.CARTES_REGIONALES[1] };
});
verifier("les fonctions retirées n'existent plus dans la page", r.absents.length === 0, r.absents.join(", "));
verifier("la carte régionale 1 s'ouvre et s'affiche", r.ouverte === true && r.vueVisible, JSON.stringify([r.ouverte, r.vueVisible]));
verifier("plus de toile de peinture dans la vue", !r.toile);
verifier("son titre porte le nom de la région", r.nom === r.carte.nom, r.nom);
verifier("la fiche composée n'a plus d'usure ni de coupe", !("usure" in r.carte) && !("coupe" in r.carte));
verifier("le titre s'édite en DEV (classe et case cochée)", r.edite === true && r.classeEdition && r.caseCochee, JSON.stringify([r.edite, r.classeEdition, r.caseCochee]));
verifier("éditer les terrains lâche le titre, qui s'enregistre", r.terrains === true && r.titreLache && r.sauvesTitre >= 1, JSON.stringify([r.terrains, r.titreLache, r.sauvesTitre]));
verifier("l'édition des terrains se referme", r.terrainsFin === false);
verifier("la carte se referme", r.fermee === true && r.vueCachee, JSON.stringify([r.fermee, r.vueCachee]));
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
