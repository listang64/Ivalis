// LA CONSTITUTION DOIT AJOUTER DES PV À CHAQUE POINT, PAS UN SUR DEUX.
//
// La formule d'origine — 50 + 8 × modificateur, le modificateur suivant la
// règle 5e floor((con-10)/2) — ne bougeait qu'une fois sur deux : monter
// Constitution de 8 à 9 ne changeait RIEN aux PV affichés, puisque
// floor((8-10)/2) et floor((9-10)/2) valent tous les deux -1. Nico venait de
// dépenser un point et voyait « 0 changement » à l'écran de création.
//
// La nouvelle formule (app.js, pvMaxDepuisConstitution) est linéaire —
// 50 + 4 × (con - 10) — et reste rigoureusement COHÉRENTE avec l'ancienne
// échelle : les deux donnaient déjà 42 PV à Constitution 8 et 74 PV à
// Constitution 16 (32 PV sur 8 points, soit 4 PV par point). Seules les
// valeurs impaires, jusque-là ignorées, changent quelque chose de plus.
//
// Ce banc sert la vraie page en HTTP et pilote le VRAI écran de création de
// caractéristiques (clics compris), pas une réimplémentation de la formule.
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
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const FAUX_APP = `export const initializeApp = () => ({ nom: "faux" });`;
// updateDoc GARDE la trace de ce qu'on lui envoie : c'est ce qui permet de
// vérifier que la valeur vraiment SAUVEGARDÉE (pas juste prévisualisée) suit
// la nouvelle formule.
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

await p.evaluate(() => {
  window.jouerSonClic = () => {};
  document.getElementById("champ-id-personnage").value = "PERSO_TEST";
  // Déjà ouverte : validerCreationCaracs n'a donc pas besoin d'ouvrir la fiche.
  document.getElementById("fenetre-fiche-perso").style.display = "block";
});

// =========================================================================
console.log("1. CHAQUE POINT DE CONSTITUTION CHANGE LES PV — PAS UN SUR DEUX");
// =========================================================================
{
  const lirePreview = (con) => p.evaluate((con) => {
    window.statsCreation.con = con;
    window.actualiserModaleCaracs();
    return parseInt(document.getElementById("creation-pv-max").innerText, 10);
  }, con);

  const releves = [];
  for (let con = 8; con <= 16; con++) {
    releves.push({ con, pv: await lirePreview(con) });
  }
  console.log(`     ${releves.map(r => `Con ${r.con} → ${r.pv} PV`).join(" | ")}`);

  verifier("les PV suivent exactement la formule linéaire (50 + 4×(con-10))",
           releves.every(r => r.pv === 50 + 4 * (r.con - 10)),
           JSON.stringify(releves));
  verifier("AUCUN POINT N'EST SANS EFFET : chaque incrément change les PV",
           releves.slice(1).every((r, i) => r.pv !== releves[i].pv),
           releves.map(r => r.pv).join(","));
  verifier("les deux extrêmes gardent EXACTEMENT les valeurs de l'ancienne échelle",
           releves[0].pv === 42 && releves[releves.length - 1].pv === 74,
           `Con 8 → ${releves[0].pv} PV, Con 16 → ${releves[releves.length - 1].pv} PV`);
}

// =========================================================================
console.log("\n2. LE VRAI CLIC SUR '+' DE CONSTITUTION MET LES PV À JOUR, D'EMBLÉE");
// =========================================================================
{
  const r = await p.evaluate(() => {
    window.ouvrirModaleCreationCaracs(); // repart de 8 partout, 22 points disponibles
    const ligneCon = [...document.querySelectorAll(".ligne-creation-carac")][2]; // force,dex,CON,int,sag,cha
    const avant = parseInt(document.getElementById("creation-pv-max").innerText, 10);
    ligneCon.querySelectorAll(".btn-plus-moins")[1].click(); // le bouton "+"
    const apres = parseInt(document.getElementById("creation-pv-max").innerText, 10);
    return { nomLigne: ligneCon.querySelector(".nom-carac-creation").innerText, avant, apres, con: window.statsCreation.con };
  });
  verifier("c'est bien la ligne Constitution qui a été cliquée", r.nomLigne === "CONSTITUTION", r.nomLigne);
  verifier("Constitution est passée à 9 (un seul point dépensé)", r.con === 9, String(r.con));
  verifier("UN SEUL CLIC SUFFIT À FAIRE BOUGER LES PV AFFICHÉS", r.apres !== r.avant,
           `${r.avant} → ${r.apres}`);
  verifier("et la valeur affichée est la bonne (46 PV à Constitution 9)", r.apres === 46, String(r.apres));
}

// =========================================================================
console.log("\n3. LA VALEUR VRAIMENT SAUVEGARDÉE SUIT LA MÊME FORMULE");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    window.ouvrirModaleCreationCaracs();
    // Con à 13 (impair, exactement le cas que l'ancienne formule ratait).
    // validerCreationCaracs n'accepte que le budget de 22 points DÉPENSÉ EN
    // ENTIER (pointsRestants === 0) : le reste du tirage n'est là que pour
    // consommer exactement ce qu'il faut, il ne teste rien d'autre.
    window.statsCreation = { force: 16, dex: 11, con: 13, int: 9, sag: 9, cha: 8 };
    window.actualiserModaleCaracs();
    window.APPELS_UPDATE_DOC = [];
    await window.validerCreationCaracs();
    return { appels: window.APPELS_UPDATE_DOC, sauve: (window.__DOCS_FAUX || {})["Personnages/PERSO_TEST"] };
  });
  const appelPerso = r.appels.find(a => a.chemin === "Personnages/PERSO_TEST");
  verifier("la sauvegarde a bien eu lieu", !!appelPerso, JSON.stringify(r.appels));
  verifier("LA VALEUR ÉCRITE EN BASE SUIT LA NOUVELLE FORMULE (Con 13 → 62 PV)",
           !!appelPerso && appelPerso.data.PV_Max === 62, appelPerso && String(appelPerso.data.PV_Max));
}

// =========================================================================
console.log("\n4. LA FICHE D'UN HÉROS DÉJÀ CRÉÉ AFFICHE LA MÊME FORMULE");
// =========================================================================
{
  const pv = await p.evaluate(() => {
    window.afficherStatsFinales({ force: 8, dex: 8, con: 11, int: 8, sag: 8, cha: 8 });
    return parseInt(document.getElementById("affichage-pv-max").innerText, 10);
  });
  verifier("Constitution 11 (impaire) affiche bien 54 PV sur la fiche", pv === 54, String(pv));
}

verifier("aucune erreur JavaScript pendant tout le banc", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
