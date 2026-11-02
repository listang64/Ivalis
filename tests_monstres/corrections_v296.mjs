// v296 — LES DÉS SE LANCENT À TOUT MOMENT, L'ARBITRE NE RELANCE PAS LE TOUR.
//
// Nico : « il faut que les joueurs puissent faire leurs lancers de dés peu
// importe à qui c'est de parler. Quand l'arbitre demande des lancers de dés,
// on ne refait pas un tour de parole. Une fois les lancers faits, les joueurs
// relancent le MJ et basta. »
//
// Sur la VRAIE page (Firestore simulé) : Lyra a la parole, Thorin lance
// quand même son jet de Force depuis sa fiche. Le reste (l'Arbitre qui ne
// touche plus au tour de parole) est vérifié par corrections_v295.
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
const FAUX_APP = `export const initializeApp = () => ({}); export const getApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...c) => ({ chemin: c.join("/") }); export const collection = (_db, ...c) => ({ col: c.join("/") });
  export const getDoc = async (r) => ({ exists: () => false, data: () => ({}) });
  export const query = (c) => c; export const where = () => ({}); export const orderBy = () => ({}); export const limit = () => ({});
  export const getDocs = async () => ({ forEach() {}, docs: [], empty: true, size: 0 });
  export const setDoc = async () => {}; export const updateDoc = async (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d }); };
  export const deleteDoc = async () => {}; export const addDoc = async (c, d) => { (window.__ajouts = window.__ajouts || []).push({ col: c.col, data: d }); return { id: "m" }; };
  export const onSnapshot = () => () => {}; export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
  export const runTransaction = async () => null; export const increment = (k) => k; export const deleteField = () => null;
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const serverTimestamp = () => Date.now();
  export class FieldPath {} export const Timestamp = { now: () => Date.now() };
`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);

console.log("\n1. THORIN LANCE SON DÉ ALORS QUE C'EST À LYRA DE PARLER");
try {
  const r = await p.evaluate(async () => {
    window.jouerSonClic = () => {};
    window.__majs = [];
    window.ID_PARTIE_COURANTE = "P1";
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", idJoueur: "P_01", prenom: "Thorin" }, { idPersonnage: "H2", idJoueur: "P_02", prenom: "Lyra" }];
    window.PARTIE_DATA = { Ordre_Initiative: ["H2", "H1"], Index_Initiative: 0 };   // la parole est à Lyra
    const tour = window.tourDeParole(window.PARTIE_DATA, window.PERSOS_PARTIE).id;
    document.getElementById("champ-id-personnage").value = "H1";
    document.getElementById("titre-nom-personnage").innerText = "Thorin";
    window.fermerFichePerso = () => {};
    await window.lancerJetDeCaracteristique("force", "FORCE", 14, 2);
    const err = document.getElementById("erreur-jet-immersif");
    const maj = (window.__majs.find(m => m.data && m.data.Action_Des) || {}).data;
    return { tour, action: maj ? maj.Action_Des : null, refus: !!err && err.style.opacity === "1" };
  });
  verifier("la parole est bien à Lyra", r.tour === "H2", r.tour);
  verifier("le jet de Thorin part quand même (Action_Des, Force, +2)", !!r.action && r.action.idPerso === "H1" && r.action.caract === "FORCE" && r.action.totalFinal === r.action.resultatBrut + 2, JSON.stringify(r.action));
  verifier("pas de « Action impossible : c'est à Lyra de parler »", !r.refus);
} catch (e) { verifier("la section a pu tourner", false, String(e.message || e).slice(0, 160)); }

console.log("\n2. L'ARBITRE NE TOUCHE PLUS AU TOUR DE PAROLE");
{
  const ia = lire("ia_master.js");
  const corps = (ia.match(/async function arbitrerAvantLeMJ[\s\S]*?\n}\n/) || [""])[0];
  verifier("après sa demande de jets, l'Arbitre ne relance pas le tour de parole", !!corps && /Jets_Demandes: jets/.test(corps) && !/relancerInitiativeChat/.test(corps));
  const app = lire("app.js");
  const jet = (app.match(/window\.lancerJetDeCaracteristique = async function[\s\S]*?\n};\n/) || [""])[0];
  verifier("le lancer de dé ne consulte plus le tour de parole", !!jet && !/tourDeParole/.test(jet) && !/Action impossible/.test(jet));
}

{
  const index = lire("index.html");
  const v = (re) => Number((index.match(re) || [])[1] || 0);
  verifier("versions : ia_master, app, trace du combat", v(/ia_master\.js\?v=(\d+)"/) >= 17 && v(/app\.js\?v=(\d+)"/) >= 133 && v(/trace_combat\.js\?v=(\d+)"/) >= 201
           && Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]) >= 296 && Number((lire("version.json").match(/"version": (\d+)/) || [])[1]) >= 296);
}
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
