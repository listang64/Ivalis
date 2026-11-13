// v375 — LE CODE MORT (2/6) : L'ILLUSION, LA BOÎTE DE LA GRILLE, LES FACTIONS.
// L'effet Illusion est retiré depuis la v339 : plus rien ne posait de leurre, mais le choix de
// la case, la création du leurre et leurs appels restaient dans moteur_effets.js. La boîte DEV
// de la grille du combat du récit ne s'affichait plus depuis la v313 (« false && … ») ; et
// chaque connexion lisait toute la collection Monde_Factions pour un menu qui n'existe plus.
// Ce banc vérifie qu'ils sont partis, que detruireIllusion (les totems) reste, et que la page
// se charge sans erreur.
//
// v378 — LE CODE MORT (5/6) : L'ANCIEN MENU LATÉRAL.
// En partie, le livre cachait le menu de droite (#menu-lateral, #btn-rouvrir-menu : display
// none !important) ; ses onze images se téléchargeaient quand même à chaque lancement, et un
// observateur suivait son style. Le menu, sa flèche, le petit bouton qui le rouvrait, le code
// qui le rangeait et le dépliait, et chaque « menuLat.style.display » des autres fenêtres sont
// retirés. Ce banc vérifie qu'ils sont partis, que leurs images ne sont plus demandées, et que
// les fenêtres qui le montraient ou le cachaient s'ouvrent et se ferment sans erreur.
//
// Lancer : node tests_monstres/corrections_v378.mjs
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
const html = lire("index.html"), app = lire("app.js"), css = lire("style.css"), gcss = lire("grimoire.css");
verifier("index.html n'a plus le menu latéral ni le petit bouton qui le rouvrait", !/id="menu-lateral"|btn-rouvrir-menu|btn-replier-menu|texte-banniere/.test(html));
verifier("app.js ne range ni ne déplie plus de menu", !/replierMenuLateral|deplierMenuLateral|menuLateralReplie|synchroniserBoutonRouvrirMenu|rangerMenuALArrivee|menu-lateral/.test(app));
verifier("les autres modules ne le montrent ni ne le cachent plus", !["combat.js", "loot.js", "monstres.js", "cartes_regionales.js", "voyage_groupe.js"].some(f => /menu-lateral|replierMenuLateral|btn-rouvrir-menu/.test(lire(f))));
verifier("style.css et grimoire.css n'ont plus ses règles", !/#menu-lateral|\.banniere-glissante|\.texte-sur-parchemin|\.btn-rouvrir-menu|\.btn-replier-menu/.test(css + gcss));
verifier("le bouton de sortie du combat garde son style (.icone-menu)", /\.icone-menu \{/.test(css) && /id="btn-fermer-combat"[\s\S]{0,40}class="icone-menu"/.test(html));
verifier("la date en jeu reste en mémoire (DATE_EN_JEU_ACTUELLE)", /window\.DATE_EN_JEU_ACTUELLE\.jour = d\.Jour/.test(app));

console.log("\n2. DANS LA VRAIE PAGE");
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const erreurs = [], demandes = [];
p.on('pageerror', e => erreurs.push(String(e.message || e)));
await p.route('**', r => {
  const url = r.request().url();
  if (url.startsWith(base)) return r.continue();
  demandes.push(url);
  if (url.includes('firebase-app.js')) return r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP });
  if (url.includes('firebase-firestore.js')) return r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE });
  return r.abort();
});
await p.goto(base + '/index.html');
await p.waitForFunction(() => !!window.PORTES_GRIMOIRE && typeof window.fermerToutesLesFenetres === "function" && typeof window.ouvrirTableRencontres === "function", null, { timeout: 15000 });
await p.evaluate(() => { document.getElementById("ecran-jeu").style.display = "block"; });
await p.waitForTimeout(1200);
const r = await p.evaluate(async () => {
  const partis = ["replierMenuLateral", "deplierMenuLateral", "menuLateralReplie", "synchroniserBoutonRouvrirMenu", "rangerMenuALArrivee"].filter(n => typeof window[n] !== "undefined");
  const essais = [];
  const essayer = async (nom, f) => { try { await f(); essais.push(nom + ":ok"); } catch (e) { essais.push(nom + ":" + e.message); } };
  await essayer("fermerToutesLesFenetres", () => window.fermerToutesLesFenetres());
  await essayer("table des rencontres", () => { window.ouvrirTableRencontres(); window.fermerTableRencontres(); });
  await essayer("table du butin", () => { window.ouvrirTableButin(); window.fermerTableButin(); });
  await essayer("entrée en partie", () => window.PORTES_GRIMOIRE.entrerDansPartie("P1"));
  return { partis, essais, menu: !!document.getElementById("menu-lateral") };
});
verifier("les fonctions du menu n'existent plus dans la page", r.partis.length === 0 && !r.menu, r.partis.join(", "));
verifier("les fenêtres qui le montraient ou le cachaient s'ouvrent et se ferment", r.essais.every(e => /:ok$/.test(e)), r.essais.join(" | "));
const imagesMenu = ["parchemin_u9fib7", "banniere_okbe27", "chat_vk0zac", "personnages_qhidpu", "combat_syxo0p", "missions_wo5tws", "param%C3%A8tres_gttwna", "A39F53B8-528E-4052-92AD-E9EDC3F700EB"];
const vues = demandes.filter(u => imagesMenu.some(n => u.includes(n)));
verifier("ses images ne sont plus téléchargées", vues.length === 0, vues.slice(0, 3).join(" | "));
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
