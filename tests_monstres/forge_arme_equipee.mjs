// LA FORGE NE PROPOSE QUE L'ARME QU'ON A VRAIMENT EN MAIN.
//
// Nico : « Dans le panneau de sélection du type d'attaque, pour les types
// arme légère cac / arme lourde cac / arme polyvalente / arme légère distance,
// n'afficher que le type d'arme qui correspond avec l'arme qu'on a équipée.
// Magie et Sans arme restent tout le temps. » Ce banc charge la VRAIE page
// (Firebase remplacé par des doublures, comme constitution_pv.mjs), pose de
// vraies fiches d'équipement dans forgeState.statsPerso, et regarde quels
// boutons du menu « Type d'Attaque » restent à l'écran.
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = '/home/user/Ivalis';
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
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const FAUX_APP = `export const initializeApp = () => ({ nom: "faux" });`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({ faux: true });
  export const getFirestore = () => ({ faux: true });
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async (ref) => ({ exists: () => true, data: () => ((window.__DOCS_FAUX || {})[ref.chemin] || {}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data) => { window.__DOCS_FAUX = window.__DOCS_FAUX || {}; window.__DOCS_FAUX[ref.chemin] = data; };
  export const updateDoc = async (ref, data) => {
    window.APPELS_UPDATE_DOC = window.APPELS_UPDATE_DOC || [];
    window.APPELS_UPDATE_DOC.push({ chemin: ref.chemin, data });
    window.__DOCS_FAUX = window.__DOCS_FAUX || {};
    window.__DOCS_FAUX[ref.chemin] = { ...(window.__DOCS_FAUX[ref.chemin] || {}), ...data };
  };
  export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "neuf" });
  export const deleteField = () => "«champ supprimé»";
  export class FieldPath { constructor(...s){this.s=s;} }
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
await p.waitForTimeout(2000);

// Pose une fiche d'équipement dans forgeState (comme le fait ouvrirForgeCompetence
// en lisant "Personnages"), puis ouvre le menu « Type d'Attaque » et relève quels
// boutons sont visibles.
const relever = (equip) => p.evaluate((equip) => {
  window.forgeState = window.forgeState || {};
  window.forgeState.idPersonnage = "H1";
  window.forgeState.statsPerso = equip;
  window.ouvrirMenuArme();
  const visible = (id) => {
    const el = document.getElementById(id);
    return el && getComputedStyle(el).display !== "none";
  };
  return {
    modaleOuverte: document.getElementById("modale-menu-arme").style.display === "block",
    legereCac: visible("btn-arme-legere-cac"),
    lourdeCac: visible("btn-arme-lourde-cac"),
    polyvalente: visible("btn-arme-polyvalente"),
    legereDistance: visible("btn-arme-legere-distance")
  };
}, equip);

console.log("1. UNE ARME LÉGÈRE CAC EN MAIN DROITE : ELLE SEULE APPARAÎT");
{
  const r = await relever({ Equip_Main_Droite: { nom: "Dague", type: "Arme légère CAC" }, Equip_Main_Gauche: null, Equip_Armure: null });
  verifier("le menu s'ouvre", r.modaleOuverte);
  verifier("Arme légère CAC est proposée", r.legereCac === true, JSON.stringify(r));
  verifier("Arme lourde CAC ne l'est plus", r.lourdeCac === false, JSON.stringify(r));
  verifier("Arme polyvalente ne l'est plus", r.polyvalente === false, JSON.stringify(r));
  verifier("Arme légère Distance ne l'est plus", r.legereDistance === false, JSON.stringify(r));
}

console.log("\n2. UNE ARME LOURDE À DEUX MAINS (les deux mains, même uid)");
{
  const arme = { uid: "w1", nom: "Hache à deux mains", type: "Arme lourde CAC", deuxMains: true };
  const r = await relever({ Equip_Main_Droite: arme, Equip_Main_Gauche: arme, Equip_Armure: null });
  verifier("seule Arme lourde CAC apparaît", r.lourdeCac === true && !r.legereCac && !r.polyvalente && !r.legereDistance,
           JSON.stringify(r));
}

console.log("\n3. DEUX ARMES D'UNE MAIN, DE TYPES DIFFÉRENTS : LES DEUX APPARAISSENT");
{
  const r = await relever({
    Equip_Main_Droite: { nom: "Fronde", type: "Arme légère Distance" },
    Equip_Main_Gauche: { nom: "Couteau", type: "Arme légère CAC" },
    Equip_Armure: null
  });
  verifier("Arme légère CAC apparaît", r.legereCac === true, JSON.stringify(r));
  verifier("Arme légère Distance apparaît aussi", r.legereDistance === true, JSON.stringify(r));
  verifier("les deux autres restent cachées", r.lourdeCac === false && r.polyvalente === false, JSON.stringify(r));
}

console.log("\n4. UN BOUCLIER SEUL (aucune arme) : LES QUATRE DISPARAISSENT");
{
  const r = await relever({
    Equip_Main_Droite: { nom: "Aspis", type: "Bouclier" }, Equip_Main_Gauche: null, Equip_Armure: null
  });
  verifier("aucun des quatre types n'apparaît",
           !r.legereCac && !r.lourdeCac && !r.polyvalente && !r.legereDistance, JSON.stringify(r));
}

console.log("\n5. LES MAINS VIDES (aucune fiche lisible) : ON NE BLOQUE RIEN, LES QUATRE RESTENT");
{
  const r = await relever(null);
  verifier("les quatre types restent proposés",
           r.legereCac && r.lourdeCac && r.polyvalente && r.legereDistance, JSON.stringify(r));
}

console.log("\n6. MAGIE ET SANS ARME RESTENT TOUJOURS VISIBLES, QUOI QU'IL EN SOIT");
{
  await relever({ Equip_Main_Droite: { nom: "Dague", type: "Arme légère CAC" }, Equip_Main_Gauche: null, Equip_Armure: null });
  const r = await p.evaluate(() => {
    const boutons = [...document.querySelectorAll("#modale-menu-arme button")];
    const magie = boutons.find(b => /Magie/.test(b.textContent));
    const sansArme = boutons.find(b => /Sans arme/.test(b.textContent));
    return {
      magieVisible: !!magie && getComputedStyle(magie).display !== "none",
      sansArmeVisible: !!sansArme && getComputedStyle(sansArme).display !== "none"
    };
  });
  verifier("Magie est toujours là", r.magieVisible === true, JSON.stringify(r));
  verifier("Sans arme est toujours là", r.sansArmeVisible === true, JSON.stringify(r));
}

verifier("aucune erreur JavaScript pendant tout le banc", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
