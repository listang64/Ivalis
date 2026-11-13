// v380 — LE CODE MORT (D) : LES FONCTIONS QUE PERSONNE N'APPELAIT.
// Une analyse de tout ce que charge index.html (chaque fonction nommée, de proche en proche
// depuis le code qui s'exécute, le HTML et les chaînes de caractères), recoupée avec Graphify et
// relue à la main, trouvait des fonctions qu'aucun code ni aucun banc n'appelle plus. Ce banc
// vérifie qu'elles sont parties, que leurs voisines sont toujours là, et que la page se charge
// sans erreur.
//
// Lancer : node tests_monstres/corrections_v380.mjs
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
  "app.js": ["libererVerrousAnimation", "programmerAnimationTour", "resisteAEtat", "recupererPartiesEnCours", "estPanneauPersonnagesOuvert"],
  "sequence_tour.js": ["jeJoueCeTour", "valeurAvantRejeu", "programmerAnimationTour", "ETAT_AVANT_REJEU", "dejaServiAvant"],
  "combat.js": ["changerEspacementBannieres", "degradeBrosse", "assombrirCouleur"],
  "combat_etat.js": ["estADroit", "occupantDe"],
  "moteur_effets.js": ["barreCiblageResolution"],
  "monstres_ia.js": ["casesAccessiblesMonstre", "function dangerZone", "allesAdjacents", "async function marquerTourIATermine"],
  "combat_rp.js": ["etatCombatRP"],
  "grimoire.js": ["dessinTerre"],
  "grimoire_recit.js": ["texteDictee", "etatLectureRecit"],
  "villages_regionaux.js": ["creationVillagesEnCours"],
  "voyage_groupe.js": ["sousLesNuagesVoyage", "placeEnVoyageGroupe", "reglagePionGroupeActif", "voisinesDe"],
  "animations_combat.js": ["annulerAnimationsJeu", "lecturesJeu"],
  "animations_jeu.js": ["apparitionsEnCours"],
  "zones_procedurales.js": ["window.creerCouchePoison", "window.creerCoucheElectrique"]
};
console.log("\n1. LE TEXTE");
Object.entries(PARTIES).forEach(([f, noms]) => {
  const src = lire(f);
  const restes = noms.filter(n => new RegExp((/^[\w.]+$/.test(n) ? "(?<![\\w$])" : "") + n.replace(/[.$]/g, "\\$&") + "(?![\\w$])").test(src));
  verifier(`${f} : ${noms.length} morceau(x) mort(s) parti(s)`, restes.length === 0, restes.join(", "));
});
verifier("les voisines restent (acteur du combat, mon héros joue, couches du givre, du feu, des pièges, du soin)",
         /window\.acteurCourantCombat = function/.test(lire("sequence_tour.js")) && /window\.monHerosJoue = function/.test(lire("sequence_tour.js"))
         && ["creerCoucheGivre", "creerCoucheFeu", "creerCouchePieges", "creerCoucheSoin"].every(n => lire("zones_procedurales.js").includes("window." + n + " =")));
verifier("l'outil de console voirEtat reste (combat_etat.js)", /window\.voirEtat = function/.test(lire("combat_etat.js")));
verifier("l'espacement des bannières réglé sur ce poste est toujours lu (competences.js)", /ivalis_espacement_bannieres/.test(lire("competences.js")));

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
await p.waitForFunction(() => typeof window.acteurCourantCombat === "function" && typeof window.jouerAnimationJeu === "function" && typeof window.creerCoucheProcedurale === "function", null, { timeout: 15000 });
await p.waitForTimeout(800);
const r = await p.evaluate(() => ({
  partis: ["libererVerrousAnimation", "programmerAnimationTour", "resisteAEtat", "jeJoueCeTour", "valeurAvantRejeu", "changerEspacementBannieres", "degradeBrosse", "assombrirCouleur",
           "barreCiblageResolution", "casesAccessiblesMonstre", "etatCombatRP", "texteDictee", "etatLectureRecit", "creationVillagesEnCours", "sousLesNuagesVoyage",
           "placeEnVoyageGroupe", "reglagePionGroupeActif", "voisinesDe", "annulerAnimationsJeu", "apparitionsEnCours", "creerCouchePoison", "creerCoucheElectrique", "ETAT_AVANT_REJEU"].filter(n => typeof window[n] !== "undefined"),
  restent: ["acteurCourantCombat", "monHerosJoue", "jouerAnimationJeu", "creerCoucheGivre", "creerCouchePieges", "regionsVoisines", "reglerDecalageGroupe", "poserBoutonsCibleUnique", "voirEtat"].filter(n => typeof window[n] !== "function")
}));
verifier("les fonctions mortes n'existent plus dans la page", r.partis.length === 0, r.partis.join(", "));
verifier("leurs voisines sont toujours là", r.restent.length === 0, r.restent.join(", "));
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
