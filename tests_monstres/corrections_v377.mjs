// v375 — LE CODE MORT (2/6) : L'ILLUSION, LA BOÎTE DE LA GRILLE, LES FACTIONS.
// L'effet Illusion est retiré depuis la v339 : plus rien ne posait de leurre, mais le choix de
// la case, la création du leurre et leurs appels restaient dans moteur_effets.js. La boîte DEV
// de la grille du combat du récit ne s'affichait plus depuis la v313 (« false && … ») ; et
// chaque connexion lisait toute la collection Monde_Factions pour un menu qui n'existe plus.
// Ce banc vérifie qu'ils sont partis, que detruireIllusion (les totems) reste, et que la page
// se charge sans erreur.
//
// v377 — LE CODE MORT (4/6) : L'ANCIEN CHAT.
// En partie, le livre cache l'ancien chat (#fenetre-chatbox, display: none !important) et
// ouvrirChatbox était détourné vers le récit du livre. Pourtant chaque message reçu était encore
// dessiné dans ce chat invisible, chaque mise à jour des héros refaisait ses bulles (et leurs
// portraits), et chaque changement de lieu relisait Monde_Lieux pour une bulle cachée. Ce banc
// vérifie que tout cela est parti, que les messages arrivent toujours au livre et aux jets
// demandés, et que « ouvrir le chat » ouvre le récit du livre.
//
// Lancer : node tests_monstres/corrections_v377.mjs
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
  export const onSnapshot = (r, a, b) => { const cb = typeof a === "function" ? a : b; (window.__ecoutes = window.__ecoutes || []).push({ col: r && (r.col || r.chemin), cb }); return () => {}; }; export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
  export const runTransaction = async (_db, f) => f({ get: async () => ({ exists: () => false, data: () => ({}) }), update() {}, set() {} });
  export const increment = (k) => k; export const deleteField = () => null;
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const serverTimestamp = () => Date.now();
  export class FieldPath {} export const Timestamp = { now: () => Date.now() };
`;

console.log("\n1. LE TEXTE");
const html = lire("index.html"), app = lire("app.js"), crp = lire("combat_rp.js"), vg = lire("voyage_groupe.js"), gr = lire("grimoire_recit.js"), css = lire("style.css");
verifier("index.html n'a plus l'ancien chat (fenêtre, saisie, micro, bouton d'interface)",
         !/fenetre-chatbox|zone-messages-chat|zone-noms-bulles|input-chat|btn-micro|btn-passer-tour|btn-fermer-chat-nouveau/.test(html));
verifier("app.js ne dessine plus de message, de bulle, ni de bulle du lieu",
         !/ajouterUnSeulMessageChat|afficherBullesPersonnages|afficherBulleLieuChat|mettreAJourBulleLieu|imageTourActive|bulle-portrait-hover/.test(app));
verifier("app.js n'a plus l'envoi, le « passer », la dictée de l'ancien chat",
         !/envoyerMessageChat|passerTourChat|toggleMicro|window\.recognition|fermerChatbox|afficherMenusDansChat/.test(app));
verifier("le mélange du tour de parole reste (ia_master.js)", /window\.relancerInitiativeChat = async function/.test(app) && /herosQuiParlent/.test(app));
verifier("les autres modules ne relisent plus la bulle du lieu", !["ia_master.js", "poi_creation.js", "villages_regionaux.js"].some(f => /mettreAJourBulleLieu|LIEU_ACTUEL/.test(lire(f))));
verifier("combat_rp.js n'a plus le bandeau du chat ; voyage_groupe.js plus la croix du chat",
         !/actualiserChat|bandeau-combat-chat/.test(crp) && !/chatOuvert|IMAGE_CROIX_CHAT|fermer-chat|chat-ouvert/.test(vg));
verifier("grimoire_recit.js n'enveloppe plus ouvrirChatbox (c'est app.js qui va au récit)", !/envelopper\("ouvrirChatbox"/.test(gr) && /GRIMOIRE_RECIT\.allerAuRecit\(\)/.test(app));
verifier("style.css n'a plus le chat, ses bulles, ses messages", !/#fenetre-chatbox|\.bulle-personnage|\.message-chat|\.bulle-lieu|#btn-micro|\.bandeau-combat-chat/.test(css));
verifier("la fiche perso garde sa place au-dessus (z-index 150)", /#fenetre-fiche-perso \{\s*z-index: 150 !important;/.test(css));
verifier("les noms des PNJ du récit gardent leur survol (.pnj-chat-hover)", /\.pnj-chat-hover \{/.test(css));

console.log("\n2. DANS LA VRAIE PAGE : LES MESSAGES D'UNE PARTIE");
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
await p.waitForFunction(() => !!window.PORTES_GRIMOIRE && typeof window.ouvrirChatbox === "function" && !!window.GRIMOIRE_RECIT, null, { timeout: 15000 });
await p.waitForTimeout(800);
const r = await p.evaluate(async () => {
  const partis = ["envoyerMessageChat", "passerTourChat", "toggleMicro", "fermerChatbox", "afficherMenusDansChat", "afficherBullesChat", "mettreAJourBulleLieu", "afficherBulleLieuChat", "tourDeParole", "chatOuvertVoyage"].filter(n => typeof window[n] !== "undefined");
  // « Ouvrir le chat » : le récit du livre.
  const avant = window.GRIMOIRE_RECIT.allerAuRecit; let recit = 0;
  window.GRIMOIRE_RECIT.allerAuRecit = () => { recit++; };
  window.ouvrirChatbox();
  window.GRIMOIRE_RECIT.allerAuRecit = avant;
  // Les messages d'une partie : le livre les reçoit, les jets demandés suivent.
  const recus = [];
  window.livreRecitMessages = (msgs, o) => recus.push({ n: msgs.length, initial: !!(o && o.initial) });
  window.PORTES_GRIMOIRE.entrerDansPartie("P1");
  await new Promise(res => setTimeout(res, 300));
  const ecoute = (window.__ecoutes || []).filter(e => e.col === "Messages_Chat").pop();
  const msg = (id, d) => ({ id, data: () => d });
  const snap = (docs, ajout) => ({ docs, docChanges: () => ajout.map(d => ({ type: "added", doc: d })) });
  const m1 = msg("M1", { Auteur_ID: "MJ", Auteur_Nom: "MJ", Texte: "Il fait nuit.", Est_Narration_IA: true, Timestamp: 1 });
  const m2 = msg("M2", { Auteur_ID: "ARBITRE_DES", Auteur_Nom: "Arbitre", Texte: "🎲", Jets_Demandes: [{ idPerso: "H1", caracteristique: "FORCE" }], Timestamp: 2 });
  if (ecoute) { ecoute.cb(snap([m1], [m1])); ecoute.cb(snap([m1, m2], [m2])); }
  return { partis, recit, ecoute: !!ecoute, recus, jets: (window.JETS_DEMANDES || []).length,
           dessines: document.querySelectorAll(".message-chat, #msg-M1, #msg-M2, .bulle-personnage, .bulle-portrait-hover-joueur, .bulle-portrait-hover-mj").length,
           chat: !!document.getElementById("fenetre-chatbox") };
});
verifier("les fonctions de l'ancien chat n'existent plus dans la page", r.partis.length === 0, r.partis.join(", "));
verifier("« ouvrir le chat » ouvre le récit du livre", r.recit === 1, String(r.recit));
verifier("en partie, les messages sont écoutés", r.ecoute);
verifier("le livre reçoit les messages (d'abord ceux d'avant, puis les nouveaux)", r.recus.length === 2 && r.recus[0].initial && !r.recus[1].initial && r.recus[1].n === 2, JSON.stringify(r.recus));
verifier("les jets demandés par l'arbitre suivent", r.jets === 1, String(r.jets));
verifier("rien n'est dessiné dans un chat caché (ni message, ni bulle, ni portrait)", r.dessines === 0 && !r.chat, JSON.stringify([r.dessines, r.chat]));
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
