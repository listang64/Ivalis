// UN HÉROS QUI VIENT DE NAÎTRE SE DÉCOUVRE PAR CE QU'IL PORTE.
// Nico a demandé que la fiche d'un personnage tout juste créé s'ouvre sur
// l'onglet Inventaire — son arme et sa tenue de départ — plutôt que sur les
// Caractéristiques qu'il vient justement de répartir. Ce banc charge la VRAIE
// page (Firebase remplacé par des doublures, comme constitution_pv.mjs), valide
// la création des caracs pour de vrai, et regarde quel onglet est à l'écran —
// et qu'une fiche ouverte depuis la liste des héros, elle, n'a pas changé.
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


// Ce que la fiche montre : l'onglet de contenu actif, et le bouton allumé.
const ongletActif = () => p.evaluate(() => ({
  contenu: [...document.querySelectorAll(".contenu-onglet.actif")].map(e => e.id).join(","),
  bouton: [...document.querySelectorAll(".onglet-btn.actif")].map(b => b.innerText.trim()).join(","),
  ficheVisible: getComputedStyle(document.getElementById("fenetre-fiche-perso")).display !== "none"
}));

// Le budget de 22 points dépensé en entier : sans ça, validerCreationCaracs
// refuse de valider (et ce banc ne testerait rien).
const validerLesCaracs = () => p.evaluate(async () => {
  window.ouvrirModaleCreationCaracs();
  window.statsCreation = { force: 16, dex: 11, con: 13, int: 9, sag: 9, cha: 8 };
  window.actualiserModaleCaracs();
  await window.validerCreationCaracs();
  await new Promise(r => setTimeout(r, 300));   // ouvrirFichePerso n'est pas attendu
});

await p.evaluate(() => {
  window.jouerSonClic = () => {};
  window.alert = (m) => { window.__alerte = m; };
});

console.log("1. UN HÉROS QUI VIENT DE NAÎTRE : LA FICHE S'OUVRE SUR L'INVENTAIRE");
{
  await p.evaluate(() => {
    document.getElementById("fenetre-fiche-perso").style.display = "none";
    document.getElementById("champ-id-personnage").value = "PERSO_NEUF";
    document.getElementById("titre-nom-personnage").innerText = "Pliors Ventlame";
  });
  await validerLesCaracs();
  const o = await ongletActif();
  verifier("la fiche du nouveau héros est ouverte", o.ficheVisible);
  verifier("sur l'onglet Inventaire", o.contenu === "onglet-inventaire", `(${o.contenu})`);
  verifier("et c'est le bouton Inventaire qui est allumé", o.bouton === "Inventaire", `(${o.bouton})`);
  verifier("aucune alerte d'erreur", !(await p.evaluate(() => window.__alerte)),
           await p.evaluate(() => window.__alerte || ""));
}

console.log("\n2. LA FICHE ÉTAIT DÉJÀ OUVERTE : ELLE BASCULE SUR L'INVENTAIRE");
{
  await p.evaluate(() => {
    const btn = document.querySelector("button[onclick*='onglet-caracs']");
    changerOngletPerso({ currentTarget: btn }, 'onglet-caracs');
    document.getElementById("fenetre-fiche-perso").style.display = "flex";
  });
  verifier("(départ : sur les Caractéristiques)", (await ongletActif()).contenu === "onglet-caracs");
  await validerLesCaracs();
  const o = await ongletActif();
  verifier("une fois les caracs validées, l'Inventaire est à l'écran",
           o.contenu === "onglet-inventaire" && o.bouton === "Inventaire", `(${o.contenu} / ${o.bouton})`);
}

console.log("\n3. UN HÉROS DÉJÀ CRÉÉ S'OUVRE TOUJOURS SUR SES CARACTÉRISTIQUES");
{
  await p.evaluate(async () => {
    document.getElementById("fenetre-fiche-perso").style.display = "none";
    await window.ouvrirFichePerso("PERSO_ANCIEN", "Naomi", "", "#2a1a0f");
  });
  const o = await ongletActif();
  verifier("ouvrir une fiche depuis la liste garde les Caractéristiques",
           o.contenu === "onglet-caracs" && o.bouton === "Caractéristiques", `(${o.contenu} / ${o.bouton})`);
}

verifier("aucune erreur JavaScript pendant tout le banc", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
