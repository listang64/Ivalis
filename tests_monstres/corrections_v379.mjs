// v375 — LE CODE MORT (2/6) : L'ILLUSION, LA BOÎTE DE LA GRILLE, LES FACTIONS.
// L'effet Illusion est retiré depuis la v339 : plus rien ne posait de leurre, mais le choix de
// la case, la création du leurre et leurs appels restaient dans moteur_effets.js. La boîte DEV
// de la grille du combat du récit ne s'affichait plus depuis la v313 (« false && … ») ; et
// chaque connexion lisait toute la collection Monde_Factions pour un menu qui n'existe plus.
// Ce banc vérifie qu'ils sont partis, que detruireIllusion (les totems) reste, et que la page
// se charge sans erreur.
//
// v379 — LE CODE MORT (6/6, fin du bloc des anciennes interfaces) : L'ANCIEN MENU D'ACCUEIL.
// Le grimoire (v297) a remplacé le menu d'accueil (#ecran-menu) et ses fenêtres (la Clé de Rune,
// la fondation du groupe, les archives, le sceau, « Mon compte ») ; ils restaient dans la page,
// « gardés pour les vieux bancs ». Le menu, visible derrière l'écran de connexion, téléchargeait
// son fond, ses brumes (deux animations sans fin) et ses boutons à chaque lancement. Ce banc vérifie
// qu'ils sont partis, que leurs images ne sont plus demandées, et que les portes du grimoire
// (vérifier la clé, fonder, vérifier un sceau, entrer), le retour au menu et les demandes
// d'inscription marchent toujours.
//
// Lancer : node tests_monstres/corrections_v379.mjs
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
const html = lire("index.html"), app = lire("app.js"), comptes = lire("comptes.js"), css = lire("style.css");
verifier("index.html n'a plus l'ancien menu ni ses fenêtres", !/id="ecran-menu"|id="modale-cle"|id="modale-groupe"|id="modale-charger"|id="modale-mdp-partie"|id="modale-compte"|id="barre-compte"/.test(html));
verifier("la fenêtre des demandes d'inscription reste (le grimoire l'ouvre)", /id="modale-demandes"/.test(html) && /id="overlay-modale"/.test(html));
verifier("app.js n'a plus les fonctions des anciennes fenêtres", !/ouvrirModalNouvellePartie|ouvrirModalChargerPartie|function validerCle|validerCreationGroupe|demanderMdpPartie|validerMdpPartie|function fermerModales\b|ecran-menu|ID_PARTIE_EN_ATTENTE/.test(app));
verifier("les portes du grimoire restent (clé, fondation, sceau, entrée)", /verifierCle: \(saisie\) => verifierMotDePasse\(saisie\)/.test(app) && /entrerDansPartie: \(id\) => lancerPartieChargee\(id\)/.test(app));
verifier("comptes.js n'a plus la barre du compte ni « Mon compte »", !/rendreBarre|basculerMenuCompte|fermerMenuCompte|ouvrirMonCompte|form-changer-mdp|case-connexion-auto/.test(comptes));
verifier("…mais garde le changement de mot de passe du grimoire et la connexion automatique", /window\.changerMotDePasseCompte = changerMdp/.test(comptes) && /window\.basculerConnexionAuto = async function/.test(comptes));
verifier("style.css n'a plus le menu, ses brumes, ses boutons, la barre du compte", !/#ecran-menu|\.bg-menu|\.brume-lointaine|defilementGauche|\.btn-jeu|\.barre-compte|\.item-partie|\.compte-ligne/.test(css));

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
await p.waitForFunction(() => !!window.PORTES_GRIMOIRE && typeof window.afficherGrimoire === "function" && typeof window.ouvrirDemandesInscription === "function", null, { timeout: 15000 });
await p.waitForTimeout(1200);
const r = await p.evaluate(async () => {
  const partis = ["ouvrirModalNouvellePartie", "ouvrirModalChargerPartie", "validerCle", "validerCreationGroupe", "demanderMdpPartie", "validerMdpPartie", "fermerModales", "basculerMenuCompte", "fermerMenuCompte", "ouvrirMonCompte"].filter(n => typeof window[n] !== "undefined");
  const portes = window.PORTES_GRIMOIRE;
  const fondee = await portes.creerPartie("Les Lames", "sel");
  portes.entrerDansPartie("P1");
  const entree = { jeu: document.getElementById("ecran-jeu").style.display, id: window.ID_PARTIE_COURANTE };
  // Le retour au menu : le grimoire, ouvert sur le journal.
  let grimoire = 0; const vrai = window.afficherGrimoire; window.afficherGrimoire = (o) => { grimoire++; return vrai(o); };
  window.fermerToutesLesFenetres = window.fermerToutesLesFenetres || (() => {});
  window.confirmerRetourMenu();
  window.afficherGrimoire = vrai;
  const retour = { grimoire, jeu: document.getElementById("ecran-jeu").style.display };
  // Les demandes d'inscription (Nico et Ben).
  window.COMPTE_JOUEUR = { nom: "Nico", email: "n@ivalis.fr", admin: true };
  window.ouvrirDemandesInscription();
  const fenetre = getComputedStyle(document.getElementById("modale-demandes")).display;
  window.fermerModalesCompte();
  const fermee = getComputedStyle(document.getElementById("modale-demandes")).display;
  return { partis, fondee: typeof fondee, entree, retour, fenetre, fermee, menu: !!document.getElementById("ecran-menu") };
});
verifier("les fonctions des anciennes fenêtres n'existent plus dans la page", r.partis.length === 0 && !r.menu, r.partis.join(", "));
verifier("le grimoire fonde une partie et y entre (ses portes)", r.fondee === "string" && r.entree.jeu === "block" && r.entree.id === "P1", JSON.stringify([r.fondee, r.entree]));
verifier("« Retour au menu » rouvre le grimoire", r.retour.grimoire === 1 && r.retour.jeu === "none", JSON.stringify(r.retour));
verifier("les demandes d'inscription s'ouvrent et se ferment", r.fenetre === "block" && r.fermee === "none", JSON.stringify([r.fenetre, r.fermee]));
const imagesMenu = ["ivalis_background_be8iur", "brume_lointaine_gxbkar", "sable_proche_cyydei", "nouvelle_part", "charger_partie"];   // (la croix de sortie sert encore au menu du bas ; IMG_2057, au sommaire du grimoire)
const vues = demandes.filter(u => imagesMenu.some(n => u.includes(n)));
verifier("ses images (fond, brumes, boutons et leur reflet préchargé) ne sont plus téléchargées", vues.length === 0, vues.slice(0, 3).join(" | "));
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
