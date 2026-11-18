// v432 — « S'ENFONCER DANS LA FORÊT » N'EST PAS UN JET DE FORCE ; LE NOUVEAU VILLAGE ;
// L'AQUARELLE SOUS « LA COMPAGNIE » ET « RÉPUTATION ICI ».
// Nico : « mon personnage parlait de s'enfoncer dans la forêt, qu'il était trop tard. Le jeu
// m'a fait faire un jet de force pour “s'enfoncer” » ; « remplace l'image du village » ;
// « sous le petit titre La compagnie, une tache d'aquarelle ; pareil pour Réputation ici ».
// (La mise en place : celle de v405.) Lancer : node tests_monstres/corrections_v432.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) {
    res.writeHead(404); res.end('non trouvé'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// Mêmes doublures Firebase que demarrage_reel.mjs : rien n'écrit nulle part,
// tout le reste (combat.js, mouvement.js, moteur_effets.js, competences.js)
// est le vrai code.
const FAUX_APP = `export const initializeApp = () => ({ nom: "faux" });`;
const FAUX_FIRESTORE = `
  // firebase-config.js fabrique la base avec des options (le transport sondé
  // plutôt que subi, pour l'iPad) : le bouchon doit donc offrir cette porte-là,
  // sinon le module ne se charge pas et rien du jeu ne s'initialise.
  export const initializeFirestore = () => ({ faux: true });
  export const getFirestore = () => ({ faux: true });
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {};
  export const updateDoc = async () => {};
  export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "neuf" });
  export const deleteField = () => "«champ supprimé»";
  export class FieldPath { constructor(...segments) { this.segments = segments; } }
  export const arrayUnion = (...v) => v;
  export const arrayRemove = (...v) => v;
  export const increment = (n) => n;
  export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({ a });
  export const where = (...a) => ({ a });
  export const orderBy = (...a) => ({ a });
  export const limit = (...a) => ({ a });
  export const writeBatch = () => ({ update: () => {}, set: () => {}, delete: () => {}, commit: async () => {} });
  export const runTransaction = async (_db, fn) => fn({
    get: async () => ({ exists: () => true, data: () => ({}) }), update: () => {}, set: () => {} });
  export const Timestamp = { now: () => Date.now() };
`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });

await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({
  contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({
  contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE }));

const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });


await p.goto(base + '/index.html');
await p.waitForFunction(() => typeof window.__jetsParLesMotsBanc === "function", null, { timeout: 15000 });
const lire = (f) => { try { return fs.readFileSync(path.join(RACINE, f), 'utf-8'); } catch (e) { return ""; } };
const jets = (texte) => p.evaluate((texte) => window.__jetsParLesMotsBanc({ actions: [{ Auteur_ID: "H1", Texte: texte }] }, [{ idPersonnage: "H1", prenom: "Thorin" }])
  .map(j => j.caracteristique + ":" + j.action), texte);

console.log("\n1. LE FILET DES MOTS : « S'ENFONCER » N'EST PAS ENFONCER");
for (const [t, attendu] of [
  ["Il est trop tard pour s'enfoncer dans la forêt, on campe ici.", ""],
  ["On s'enfonce dans la forêt avant la nuit.", ""],
  ["Je propose de nous enfoncer dans les bois.", ""],
  ["Nous nous enfonçons plus loin dans les marais.", ""],
  ["J'enfonce la porte d'un coup d'épaule.", "FORCE"],
  ["Je défonce le mur de planches.", "FORCE"],
  ["Je soulève le rocher.", "FORCE"],
  ["J'escalade la falaise.", "FORCE"]
]) {
  const r = await jets(t);
  verifier(`« ${t} » → ${attendu || "aucun jet"}`, attendu ? r.some(x => x.startsWith(attendu + ":")) : r.length === 0, JSON.stringify(r));
}
verifier("l'Arbitre IA le sait aussi : « enfoncer une porte », pas « s'enfoncer dans la forêt »", /enfoncer une porte/.test(lire("ia_master.js")) && /pas « s'enfoncer dans la forêt » : c'est un déplacement/.test(lire("ia_master.js")));

console.log("\n2. LE VILLAGE : LA NOUVELLE IMAGE");
verifier("le livre demande IMG_2275 (1672 × 941, comme l'ancienne)", await p.evaluate(() => /v1794984079\/IMG_2275_ncxeo8\.png$/.test(window.GRIMOIRE && window.GRIMOIRE.IMAGE_VILLAGE)), await p.evaluate(() => window.GRIMOIRE && window.GRIMOIRE.IMAGE_VILLAGE));
verifier("plus aucune trace de l'ancienne (IMG_2272)", !/IMG_2272/.test(lire("grimoire.js")));

console.log("\n3. LE GROUPE : L'AQUARELLE SOUS LES DEUX PETITS TITRES");
const g = lire("grimoire_groupe.js");
verifier("« Réputation ici » a sa tache d'aquarelle (TEINTE_SOUS_TITRES) ; (v447) « La compagnie » n'est plus là",
  !/<span>La compagnie<\/span>/.test(g) && /titre-reputation">\$\{lavis\(TEINTE_SOUS_TITRES, "groupe-reputation"\)\}<span>Réputation ici<\/span>/.test(g));

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
