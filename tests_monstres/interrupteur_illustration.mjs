// L'INTERRUPTEUR DES IMAGES DES CARTES DE COMPÉTENCE (Paramètres).
//
// Nico : « mets dans Paramètres un bouton poussoir pour activer ou désactiver
// la génération de photo dans les cartes de compétence. »
// Allumé par défaut, gardé dans ce navigateur. Coupé : une compétence forgée
// ne part pas en illustration, et la file en attente se met en pause (elle
// repart quand on le rallume) ; les images déjà faites restent affichées.
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(70)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

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
const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {}; export const updateDoc = async () => {}; export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a});
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
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

console.log("\n=========================================================");
console.log("  L'INTERRUPTEUR DES IMAGES DES CARTES (PARAMÈTRES)");
console.log("=========================================================");

const CLE_FILE = await p.evaluate(() => Object.keys(localStorage).find(k => /illustr/i.test(k) && k !== "ivalis_illustration_cartes") || null);
const r = await p.evaluate(async () => {
  const res = {};
  const menu = document.getElementById("etape-menu-parametres");
  const inter = document.getElementById("interrupteur-illustration-cartes");
  res.present = !!inter && menu.contains(inter);
  localStorage.removeItem("ivalis_illustration_cartes");
  res.parDefaut = window.illustrationCartesActive();
  // Coupé : rien ne part en file.
  const avant = JSON.stringify(Object.fromEntries(Object.entries(localStorage)));
  window.basculerIllustrationCartes(false);
  res.garde = localStorage.getItem("ivalis_illustration_cartes");
  res.etiquette = document.getElementById("etat-illustration-cartes").textContent;
  const cles = () => Object.keys(localStorage).filter(k => k !== "ivalis_illustration_cartes");
  const fileAvant = cles().map(k => localStorage.getItem(k)).join("|");
  window.illustrerCompetence("PERSO_1", "COMP_A", "Coup");
  res.rienEnFile = cles().map(k => localStorage.getItem(k)).join("|") === fileAvant;
  // L'affichage de la case suit la mémoire, à la réouverture des paramètres.
  inter.checked = true;
  window.afficherInterrupteurIllustration();
  res.caseSuit = inter.checked === false;
  // Rallumé : la compétence part en file.
  window.basculerIllustrationCartes(true);
  res.etiquette2 = document.getElementById("etat-illustration-cartes").textContent;
  window.illustrerCompetence("PERSO_1", "COMP_B", "Coup");
  // (Tout de suite : sans clés d'API, la file la retire aussitôt après.)
  res.enFile = (localStorage.getItem("ivalis_illustrations_en_attente") || "").includes("COMP_B");
  void avant;
  return res;
});
verifier("dans le menu Paramètres, un interrupteur « Images des cartes »", r.present === true);
verifier("allumé par défaut", r.parDefaut === true);
verifier("coupé : gardé dans ce navigateur, l'étiquette le dit", r.garde === "0" && r.etiquette === "Désactivée", `${r.garde} ${r.etiquette}`);
verifier("coupé : une compétence forgée ne part pas en illustration", r.rienEnFile === true);
verifier("la case suit la mémoire à la réouverture", r.caseSuit === true);
verifier("rallumé : la compétence part en file", r.enFile === true && r.etiquette2 === "Activée", `${r.enFile} ${r.etiquette2}`);
void CLE_FILE;

await p.evaluate(() => {
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
  const c = document.getElementById("conteneur-parametres"); if (c) { c.style.display = "block"; c.classList.add("ouvert"); }
  const m = document.getElementById("etape-menu-parametres"); m.style.display = "block"; m.style.opacity = "1";
  window.basculerIllustrationCartes(false);
});
await p.evaluate(() => {
  let e = document.getElementById("etape-menu-parametres");
  while (e && e !== document.body) { if (getComputedStyle(e).display === "none") e.style.display = "block"; e.style.opacity = "1"; e.style.visibility = "visible"; e = e.parentElement; }
});
await p.waitForTimeout(300);
await p.locator("#etape-menu-parametres").screenshot({ path: "/tmp/claude-0/interrupteur_illustration.png" }).catch(() => {});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
