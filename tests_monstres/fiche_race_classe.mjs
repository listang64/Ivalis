// LA FICHE DIT LA RACE ET LA CLASSE ; LES PORTRAITS SONT ÉCLAIRÉS AU SOLEIL.
//
// Nico : « mettre race et classe dans stat perso, fiche perso » — deux tuiles
// en tête de l'onglet Statistiques, remplies par afficherStatsCombat, qu'elle
// reçoive une fiche déjà convertie (race, classe) ou le document brut de la
// base (Race, Classe). Un héros d'avant les classes affiche un tiret.
//
// Et : « pour la génération d'avatar j'ai des fois des reflets violacés dus au
// fond. Interdis les reflets violacés sur le personnage ; la lumière qui arrive
// sur lui, c'est celle d'un soleil. » Le fond magenta est un cache technique
// (on le détoure ensuite) : il n'éclaire rien. Chaque prompt qui le demande le
// dit désormais — portrait du héros, PNJ, avatar habillé, et pion.
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

const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  // firebase-config.js fabrique la base avec des options (le transport sondé
  // plutôt que subi, pour l'iPad) : le bouchon doit donc offrir cette porte-là,
  // sinon le module ne se charge pas et rien du jeu ne s'initialise.
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data, options }); }; export const updateDoc = async () => {};
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {}; export const query = (...a) => ({a});
  export const where = (...a) => ({a}); export const orderBy = (...a) => ({a});
  export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'}, body: '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="1200"><rect width="700" height="1200" fill="#553311"/></svg>' }));
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));

// Les images du décor sont injoignables depuis le bac à sable. On sert un
// rectangle connu à la place : l'avatar doit avoir une taille pour qu'on puisse
// dire s'il dépasse du bouton, et le bandeau une hauteur pour que la boîte de
// l'anneau se pose quelque part.
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml',
  headers: {'Access-Control-Allow-Origin':'*'},
  body: `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="132" viewBox="0 0 450 132"><rect width="450" height="132" fill="#2a1d12"/></svg>` }));

const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));

await p.goto(base + '/index.html');
await p.waitForTimeout(2000);


console.log("\n1. L'ONGLET STATISTIQUES : RACE ET CLASSE EN TÊTE");
{
  const lire = () => p.evaluate(() => ({ race: (document.getElementById("stat-race") || {}).innerText,
                                         classe: (document.getElementById("stat-classe") || {}).innerText }));
  // (L'onglet est devenu « Aperçu » : race et classe sont des puces dans son
  // en-tête, avant les tuiles de vitalité — apercu.mjs.)
  const tuiles = await p.evaluate(() => {
    const onglet = document.getElementById("onglet-stats");
    const ordre = [...onglet.querySelectorAll("[id^='stat-']")].map(s => s.id);
    return ordre.slice(0, 3);
  });
  verifier("Race et Classe ouvrent l'onglet, avant les points de vie", JSON.stringify(tuiles) === '["stat-race","stat-classe","stat-niveau"]',
           JSON.stringify(tuiles));
  await p.evaluate(() => window.afficherStatsCombat({ prenom: "Cybile", nom: "Ardente", race: "Gob", classe: "Hoplite",
                                                     PV_Max: 30, Def_Physique: 0, Def_Magique: 0 }));
  const r1 = await lire();
  // (L'Hoplite est devenu le Protecteur : la fiche affiche le nom d'aujourd'hui.)
  verifier("une fiche convertie : race et classe", r1.race === "Gob" && r1.classe === "Protecteur", JSON.stringify(r1));
  await p.evaluate(() => window.afficherStatsCombat({ Prenom_Personnage: "Jade", Race: "Ophior", Classe: "Oracle", PV_Max: 30 }));
  const r2 = await lire();
  verifier("le document brut de la base : Race et Classe", r2.race === "Ophior" && r2.classe === "Oracle", JSON.stringify(r2));
  await p.evaluate(() => window.afficherStatsCombat({ prenom: "Ancien", race: "Humain", PV_Max: 30 }));
  const r3 = await lire();
  verifier("un héros d'avant les classes : un tiret, pas une case vide", r3.race === "Humain" && r3.classe === "—",
           JSON.stringify(r3));
}

console.log("\n2. LES PORTRAITS : LUMIÈRE DU SOLEIL, JAMAIS DE REFLET VIOLACÉ");
{
  const app = fs.readFileSync(`${RACINE}/app.js`, "utf-8");
  const pnj = fs.readFileSync(`${RACINE}/ia_master.js`, "utf-8");
  const hab = fs.readFileSync(`${RACINE}/objets_ia.js`, "utf-8");
  const regle = (src) => /lumière naturelle d'un soleil/.test(src)
    && /STRICTEMENT INTERDIT de faire apparaître[^"]*"\s*\+\s*"des reflets, des liserés, des halos ou des teintes violacés/.test(src);
  const portrait = app.slice(app.indexOf("async function genererEtStockerPortrait"), app.indexOf("// 4. APPEL À L'API"));
  verifier("le portrait du héros", regle(portrait));
  verifier("le portrait d'un PNJ", regle(pnj));
  verifier("l'avatar habillé d'une armure", regle(hab));
  const pion = app.slice(app.indexOf("async function genererEtStockerTokenBackground"), app.indexOf("const modelesCandidats"));
  verifier("le pion en médaillon : soleil, et aucun reflet magenta ou violet",
           /natural sunlight/.test(pion) && /no purple, violet, pink or magenta/.test(pion));
  verifier("le fond magenta reste exigé partout (il sert au détourage)",
           [portrait, pnj, hab, pion].every(s => /#FF00FF/.test(s)));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
