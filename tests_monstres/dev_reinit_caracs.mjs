// ONGLET DEV : RÉINITIALISER LES CARACTÉRISTIQUES D'UN HÉROS.
//
// Demande de Nico : « dans les fiches persos, dans l'onglet DEV, crée un bouton
// pour réinitialiser les caracs d'un personnage ». Le bouton retire le document
// Caracteristiques/<id> — le héros repart d'avant sa répartition de points, la
// fiche repropose « Créer les caractéristiques » — et vide les deux caches qui
// gardent ces valeurs (celui de la fiche, celui de la partie). Vérifié sur la
// vraie page, avec un Firestore bouchonné qui note ce qu'on lui supprime.
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
  export const setDoc = async () => {}; export const updateDoc = async () => {};
  export const deleteDoc = async (ref) => { (window.__supprimes = window.__supprimes || []).push(ref.chemin); }; export const addDoc = async () => ({ id: "n" });
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

{
  const r = await p.evaluate(async () => {
    const btn = document.getElementById("btn-dev-reinit-caracs");
    const dansDev = !!(btn && btn.closest("#onglet-dev"));
    document.getElementById("champ-id-personnage").value = "PERSO_X";
    document.getElementById("champ-nom").value = "Aquagirl";
    localStorage.setItem("ivalis_caracs_PERSO_X", JSON.stringify({ force: 14, dex: 12, con: 10, int: 8, sag: 8, cha: 8 }));
    window.CARACS_PARTIE = { PERSO_X: { force: 14 } };
    let question = "";
    window.confirm = (q) => { question = q; return true; };
    window.__supprimes = [];
    btn.click();
    await new Promise(res => setTimeout(res, 300));
    return { dansDev, question, supprimes: window.__supprimes,
             cache: localStorage.getItem("ivalis_caracs_PERSO_X"),
             partie: "PERSO_X" in window.CARACS_PARTIE,
             vide: document.getElementById("caracs-vide").style.display };
  });
  verifier("le bouton est dans l'onglet DEV", r.dansDev);
  verifier("il demande confirmation, en nommant le héros", /Aquagirl/.test(r.question), r.question);
  verifier("il retire le document Caracteristiques du héros", r.supprimes.includes("Caracteristiques/PERSO_X"),
           JSON.stringify(r.supprimes));
  verifier("et vide le cache de la fiche", r.cache === null, String(r.cache));
  verifier("et celui de la partie", r.partie === false);
  verifier("la fiche repropose la création des caractéristiques", r.vide === "block", r.vide);

  const refus = await p.evaluate(async () => {
    window.confirm = () => false;
    window.__supprimes = [];
    document.getElementById("btn-dev-reinit-caracs").click();
    await new Promise(res => setTimeout(res, 200));
    return window.__supprimes.length;
  });
  verifier("un « Annuler » ne touche à rien", refus === 0);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
