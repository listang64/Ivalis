// v311 — L'ARRIVÉE AU POI DANS LE LIVRE, LE RÉCIT OUVERT LÀ OÙ ON N'A PAS LU,
// LES PARAMÈTRES ET LA POPUP DEV QUI DÉFILENT, LES CISEAUX DES CARTES.
//
// Nico : « mon groupe s'est déplacé vers un POI, et là je pense que l'ancien code
// rentre en conflit : j'ai l'avatar de mon perso qui est apparu en gros à droite
// de mon écran » (l'arrivée ouvrait l'ancien chat) ; « le narrateur a écrit sur 3
// pages, ça m'a ouvert direct à la troisième ; il faudrait que, si je n'ai pas lu
// la suite, ça s'ouvre là où je n'ai pas encore lu » ; « l'onglet Paramètres sur
// iPad s'ouvre beaucoup trop grand ; dans Outils la liste est trop grande, mets une
// barre de défilement ; fais pareil pour la popup DEV rouge » ; « à côté du pinceau
// pour brûler les maps, crée-m'en un pour supprimer des morceaux de map ».
//
// Lancer : node tests_monstres/corrections_v311.mjs
// (IVALIS_RACINE=… pour un autre dossier ; V311_CAPTURES=dossier pour les captures.)
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
// Une petite base en mémoire : ce qui s'écrit (setDoc, addDoc, updateDoc) se relit (getDoc, transactions).
const FAUX_FIRESTORE = `
  const docs = () => (window.__docs = window.__docs || {});
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...c) => ({ chemin: c.join("/") }); export const collection = (_db, ...c) => ({ col: c.join("/") });
  export const getDoc = async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => d || {}, id: r.chemin.split("/").pop() }; };
  export const query = (c) => c; export const where = () => ({}); export const orderBy = () => ({}); export const limit = () => ({});
  export const getDocs = async () => ({ forEach() {}, docs: [], empty: true, size: 0 });
  export const setDoc = async (r, d) => { docs()[r.chemin] = d; (window.__sets = window.__sets || []).push({ chemin: r.chemin, data: d }); };
  export const updateDoc = async (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d }); docs()[r.chemin] = Object.assign({}, docs()[r.chemin] || {}, d); };
  export const deleteDoc = async () => {};
  export const addDoc = async (c, d) => { (window.__ajouts = window.__ajouts || []).push({ col: c.col, data: d }); const id = "A" + window.__ajouts.length; docs()[c.col + "/" + id] = d; return { id }; };
  export const onSnapshot = () => () => {}; export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
  export const runTransaction = async (_db, f) => f({ get: async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => d || {} }; },
      update: (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d, tx: true }); docs()[r.chemin] = Object.assign({}, docs()[r.chemin] || {}, d); } });
  export const increment = (k) => k; export const deleteField = () => null;
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const serverTimestamp = () => Date.now();
  export class FieldPath {} export const Timestamp = { now: () => Date.now() };
`;
const CAPTURES = process.env.V311_CAPTURES || "";
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
// La table (le banc n'a pas Internet) : du bois dessiné sur place, 1672 × 941.
const TABLE = await (async () => { const pg = await b.newPage(); const u = await pg.evaluate(() => { const c = document.createElement("canvas"); c.width = 1672; c.height = 941;
  const x = c.getContext("2d"); x.fillStyle = "#130c06"; x.fillRect(0, 0, 1672, 941); x.fillStyle = "#7a4a26"; x.fillRect(170, 55, 1470, 835); return c.toDataURL("image/png"); });
  await pg.close(); return Buffer.from(u.split(",")[1], "base64"); })();
// Les cartes régionales (le banc n'a pas Internet) : dessinées sur place ; le
// désert d'Etheria (5) et l'île aux marchés (7) en paysage, les autres en portrait.
const dessinerCarte = async (w, h, teinte, texte) => { const pg = await b.newPage(); const u = await pg.evaluate(([w, h, teinte, texte]) => { const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d"); x.fillStyle = teinte; x.fillRect(0, 0, w, h); x.strokeStyle = "#3a2210"; x.lineWidth = 12; x.strokeRect(20, 20, w - 40, h - 40);
  x.fillStyle = "#3a2210"; x.font = "bold 90px serif"; x.fillText(texte, 80, h / 2); return c.toDataURL("image/png"); }, [w, h, teinte, texte]);
  await pg.close(); return Buffer.from(u.split(",")[1], "base64"); };
const CARTE_PORTRAIT = await dessinerCarte(1000, 1400, "#c9b48a", "PORTRAIT");
const CARTE_PAYSAGE = await dessinerCarte(1800, 1100, "#b9c48a", "PAYSAGE");
const imagesDemandees = [];
const p = await b.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
// Les IA (Gemini), simulées : le Narrateur lite, les annonces, le titre d'un chapitre.
const appelsIA = [];
let iaEnPanne = false, refusPlume = false, panneCle1 = false;
await p.route('**', r => { const u = r.request().url();
  if (u.startsWith(base)) return r.continue();
  if (/BG_tjiigl/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: TABLE });
  if (/res\.cloudinary\.com\/.*IMG_(1894|1892|1900|1893|1897|1903|1979|2189|1984|1977|1981|2229|2230|2231|2238|2239|2240|2241|2242|2243|2244|2248)_/.test(u)) { imagesDemandees.push(u); return r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: /IMG_1893|IMG_1903|IMG_2231/.test(u) ? CARTE_PAYSAGE : CARTE_PORTRAIT }); }
  return r.abort(); });
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**/generativelanguage.googleapis.com/**', r => {
  const corps = JSON.parse(r.request().postData() || "{}");
  const sys = ((corps.systemInstruction || {}).parts || [{}])[0].text || "", txt = (((corps.contents || [])[0] || {}).parts || [{}])[0].text || "";
  const cle = new URL(r.request().url()).searchParams.get("key");
  appelsIA.push({ url: r.request().url(), sys, txt, cle, config: corps.generationConfig || {} });
  if (panneCle1 && cle === "cle-banc") return r.fulfill({ status: 402, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: '{"error":{"message":"Your prepayment credits are depleted"}}' });
  if (refusPlume && /gemini-3\.8-flash/.test(r.request().url())) return r.fulfill({ status: 404, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: '{"error":{"message":"inconnu"}}' });
  if (iaEnPanne) return r.fulfill({ status: 500, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: '{"error":{"message":"panne"}}' });
  let rep = "Je vois Thorin lever sa chope bien haut ; il trinque, avec un sourire qui ne présage rien de bon, « à la santé de ce vieux grincheux de Varos ! »";
  if (/donnes leur titre aux chapitres/.test(sys)) rep = "La tournée du nain";
  else if (/annonce du jeu/.test(sys)) rep = "Le jour se lève sur la route, et je compte nos pas.";
  r.fulfill({ status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'},
    body: JSON.stringify({ candidates: [{ content: { parts: [{ text: rep }] } }], usageMetadata: { totalTokenCount: 120 } }) });
});
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && /Grimoire/.test(m.text())) console.log('CONSOLE', m.text()); });
await p.goto(base + '/index.html'); await p.waitForTimeout(1200);
const titre = (t) => console.log("\n" + t);
const section = async (f) => { try { await f(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 180)); } };
const etat = () => p.evaluate(() => window.grimoireEtat());
const page = () => p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex());
const attendreQue = async (f, ms = 6000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await p.waitForTimeout(100); } return false; };
const cliquer = (sel) => p.evaluate((sel) => document.querySelector(sel).click(), sel);
const centre = (sel) => p.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, sel);
const dans = (x, y, sel) => p.evaluate(([x, y, sel]) => { const el = document.elementFromPoint(x, y); return !!(el && el.closest(sel)); }, [x, y, sel]);
const dessus = (x, y) => p.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? (el.id || "") + "|" + (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) : "rien"; }, [x, y]);
const angleDe = (t) => { const m = /matrix\(([-\d.e]+), ([-\d.e]+)/.exec(t || ""); return m ? Math.atan2(Number(m[2]), Number(m[1])) * 180 / Math.PI : 0; };
const relayer = (msgs, initial) => p.evaluate(([m, i]) => window.livreRecitMessages(m, { initial: i }), [msgs, !!initial]);

// Le joueur J1 joue Thorin ; J2 joue Lyra.
await p.evaluate(() => {
  localStorage.setItem("ID_JOUEUR_COURANT", "J1"); localStorage.setItem("ivalis_GEMINI_API_KEY", "cle-banc"); localStorage.setItem("ivalis_GEMINI_API_KEY_2", "cle-seconde");
  window.__sons = []; window.__clics = 0; window.__appels = []; window.__entrees = []; window.__tours = 0; window.__jets = []; window.__vieux = [];
  window.jouerSonEvenement = (id) => { window.__sons.push([id, Date.now()]); return true; };
  window.jouerSonClic = () => { window.__clics++; };
  window.fermerToutesLesFenetres = () => {};
  window.COMPTE_JOUEUR = { nom: "Ben", email: "ben@ivalis.fr", admin: false };
  window.LISTE_PARTIES_CACHE = [{ id: "P1", nom: "Les Lames d'Héra" }];
  const heros = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", nom: "Ironfoot", race: "Nain", classe: "Guerrier", actif: true, urlCloudinary: "portrait-thorin.png" },
                 { idPersonnage: "H2", idJoueur: "J2", prenom: "Lyra", nom: "Sombreval", actif: true, urlCloudinary: "" }];
  window.PERSOS_JOUEURS_PARTIE = heros; window.PERSOS_PARTIE = heros.slice();
  window.PORTES_GRIMOIRE = {
    verifierCle: async () => true, creerPartie: async () => "P_NEUVE",
    verifierMdpPartie: async (id, m) => ({ ok: m === "sel" }),
    entrerDansPartie: (id) => { window.__entrees.push(id); window.ID_PARTIE_COURANTE = id; document.getElementById("ecran-jeu").style.display = "block"; }
  };
  // (v377 : ouvrirChatbox n'est plus bouchonné — c'est lui qui mène au récit du livre, le banc le vérifie.)
  ["ouvrirMenuPersonnages", "ouvrirPopupRencontre", "ouvrirParametres"].forEach(n => { window[n] = () => window.__appels.push(n); });
  window.declencherTourIA = async () => { window.__tours++; };
  window.__vraiJet = window.lancerJetPourHeros;
  window.lancerJetPourHeros = async (id, c) => { window.__jets.push([id, c]); return true; };
  // L'ancien chat : ce qu'il ferait par-dessus le livre.
  window.lancerRecitDynamique = () => window.__vieux.push("parchemin");
  window.majRecitDynamique = () => window.__vieux.push("parchemin+");
  window.annoncerJetsDemandes = () => window.__vieux.push("bandeau");
  const attente = window.afficherEcranAttente;
  window.afficherEcranAttente = (t) => { window.__vieux.push("attente:" + (t || "")); };
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== "ecran-grimoire") e.style.display = "none"; });
  window.afficherGrimoire();
});
await p.waitForTimeout(1300);
await p.evaluate(() => window.ouvrirGrimoire());
await p.waitForTimeout(1200);


// Les boîtes de la carte du livre (dans le désordre) : 1 la forêt, 3 le désert (paysage),
// 7 le mont Pletia, 8 l'île aux marchés (paysage). Le groupe est dans le désert (5).
const boite = (n, x, y) => ({ numero: n, points: [{ x, y }, { x: x + 140, y }, { x: x + 140, y: y + 110 }, { x, y: y + 110 }] });
await p.evaluate((zones) => {
  window.ZONES_LIVRE = zones;
  window.__nuages = 0;
  const vraies = window.jouerTraverseeNuages;
  window.jouerTraverseeNuages = async (o) => { window.__nuages++; return vraies ? vraies(o) : null; };
}, { 8: boite(8, 1000, 520), 1: boite(1, 180, 200), 3: boite(3, 380, 560), 7: boite(7, 1150, 220) });
await cliquer("#grimoire-btn-charger");
await p.waitForTimeout(700);
await cliquer('#grimoire-liste-parties [data-id="P1"]');
await p.waitForTimeout(150);
await p.fill("#grimoire-mdp-partie", "sel");
await p.evaluate(() => window.appliquerVoyageDeLaPartie && window.appliquerVoyageDeLaPartie({ Position_Groupe: { Region: 5, x: 0.42, y: 0.55 } }));
await cliquer("#grimoire-valider-partie");
await p.evaluate(() => window.appliquerVoyageDeLaPartie && window.appliquerVoyageDeLaPartie({ Position_Groupe: { Region: 5, x: 0.42, y: 0.55 } }));
const pose = () => attendreQue(() => p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getState() === "read" && !window.GRIMOIRE.defileEnCours()), 8000);
const monteeSur = (n) => attendreQue(() => p.evaluate((n) => window.GRIMOIRE_REGIONS.montee() === n && window.carteRegionaleOuverte() === n, n), 8000);
const vueDuLivre = () => p.evaluate(() => {
  const v = document.getElementById("vue-carte-region"), l = document.getElementById("grimoire-livre").getBoundingClientRect();
  if (!v) return null;
  const r = v.getBoundingClientRect(), c = window.cadrageCarteRegion();
  return { parent: v.parentNode.id, dansLeLivre: v.classList.contains("dans-le-livre"), cachee: getComputedStyle(v).visibility === "hidden", affichee: getComputedStyle(v).display !== "none",
           place: [(r.left - l.left) / l.width, (r.top - l.top) / l.height, r.width / l.width, r.height / l.height], zoom: c.zoom, base: c.base, numero: c.numero,
           carte: (() => { const im = document.getElementById("carte-region-image").getBoundingClientRect(); return [im.left - r.left, im.top - r.top, im.width, im.height, r.width, r.height]; })() };
});


const pixel = async (x, y) => { const png = await p.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } });
  return p.evaluate(async (b64) => { const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode(); const c = document.createElement("canvas"); c.width = c.height = 1;
    const x = c.getContext("2d"); x.drawImage(im, 0, 0); return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3); }, png.toString("base64")); };
const allerRecit = async () => { await p.evaluate(() => document.getElementById("grimoire-marque-recit").click()); await attendreQue(() => p.evaluate(() => !window.GRIMOIRE.defileEnCours()), 8000); await pose(); await p.waitForTimeout(400); };

// =========================================================================
titre("1. L'ARRIVÉE AU POI (ET LE FEU DE CAMP) : LE RÉCIT DU LIVRE, PLUS L'ANCIEN CHAT");
// =========================================================================
await section(async () => {
  await monteeSur(5); await pose(); await p.waitForTimeout(400);
  const NARRATION = "La salle du Chaudron Fêlé sent la bière tiède. <strong style='color: #e8d5a5;'>Varos</strong> essuie une chope.";
  await relayer([{ idDoc: "m1", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: NARRATION, Timestamp: 1000 }], true);
  await p.waitForTimeout(300);
  const avant = await page();
  // L'arrivée au POI appelle window.ouvrirChatbox (voyage_groupe.js) : dans le livre, c'est le récit qui s'ouvre.
  await p.evaluate(() => window.ouvrirChatbox());
  await attendreQue(() => p.evaluate(() => !window.GRIMOIRE.defileEnCours() && window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex() >= window.GRIMOIRE.premiereDeLaSuite() + 2), 8000);
  await pose(); await p.waitForTimeout(300);
  const r = await p.evaluate(() => ({ chat: (document.getElementById("fenetre-chatbox") || { style: {} }).style.display /* (v377 : l'ancien chat est parti) */, page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), recit: window.GRIMOIRE.premiereDeLaSuite() + 2,
    menu: (document.getElementById("menu-navigation-bas") || {}).style ? document.getElementById("menu-navigation-bas").style.display : "" }));
  verifier("ouvrirChatbox (l'arrivée au POI) : l'ancien chat (et son grand avatar) ne s'ouvre pas", r.chat !== "flex", r.chat);
  verifier("… le livre va au récit à la place (v313 : il était sur le sommaire)", avant !== r.page && r.page >= r.recit, `${avant} → ${r.page} (récit ${r.recit})`);
  verifier("… et les petits boutons du livre restent là", r.menu !== "none", r.menu);
  await p.evaluate(() => window.GRIMOIRE_REGIONS.ouvrir(5)); await monteeSur(5); await pose(); await p.waitForTimeout(300);
  const feu = await p.evaluate(() => { const ok = window.discuterAutourDuFeu ? window.discuterAutourDuFeu() : null; return { ok, chat: (document.getElementById("fenetre-chatbox") || { style: {} }).style.display }; });
  await attendreQue(() => p.evaluate(() => !window.GRIMOIRE.defileEnCours()), 8000); await pose(); await p.waitForTimeout(300);
  verifier("« Discuter autour du feu de camp » : le récit du livre aussi", feu.chat !== "flex" && (await page()) >= 11, JSON.stringify(feu) + " page " + (await page()));
});

// =========================================================================
titre("2. LE RÉCIT S'OUVRE LÀ OÙ ON N'A PAS ENCORE LU");
// =========================================================================
await section(async () => {
  // Le lecteur a lu le début (il était sur le récit) ; il part sur la carte.
  const lu0 = await p.evaluate(() => JSON.parse(localStorage.getItem("ivalis_livre_lu_P1") || "null"));
  verifier("le livre retient (sur ce poste, par partie) le dernier mot lu", !!lu0 && lu0.e && Number.isInteger(lu0.i), JSON.stringify(lu0));
  await p.evaluate(() => window.GRIMOIRE_REGIONS.ouvrir(5)); await monteeSur(5); await pose(); await p.waitForTimeout(300);
  // Le Narrateur écrit trois pages pendant ce temps.
  const phrase = "Nous avançons sous les colonnes brisées, le vent du désert soulève le sable et Thorin grogne à chaque pas tandis que Lyra compte les étoiles qui s'allument au-dessus des dunes ";
  const LONG = Array.from({ length: 9 }, (_, i) => `${i + 1}. ${phrase.repeat(5)}`).join("<br>");
  await relayer([{ idDoc: "m1", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: "La salle du Chaudron Fêlé sent la bière tiède. <strong style='color: #e8d5a5;'>Varos</strong> essuie une chope.", Timestamp: 1000 },
                 { idDoc: "m2", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: LONG, Timestamp: 2000 }], false);
  await attendreQue(() => p.evaluate(() => window.GRIMOIRE_RECIT.etat().pagesRecit >= 6), 8000);
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => {
    const mots = [...document.querySelectorAll('#grimoire-livre .page-suite .mot[data-e="m2"]')];
    const suite = [...document.querySelectorAll("#grimoire-livre .page-suite")];
    const premier = mots[0], pageDe = (m) => window.GRIMOIRE.premiereDeLaSuite() + suite.indexOf(m.closest(".page-suite"));
    const pr = window.GRIMOIRE.premiereDeLaSuite() + 2, n = window.GRIMOIRE_RECIT.etat().pagesRecit, derniere = pr + n - 1;
    return { pagePremier: premier ? pageDe(premier) : -1, derniere: derniere % 2 === 1 ? derniere : derniere - 1, n };
  });
  const attendue = info.pagePremier % 2 === 1 ? info.pagePremier : info.pagePremier - 1;
  await allerRecit();
  const ici = await page();
  verifier("le Narrateur a écrit sur plusieurs pages pendant que j'étais sur la carte", info.n >= 6 && info.derniere > attendue, JSON.stringify(info));
  verifier("le marque-page du récit ouvre la double page où commence ce que je n'ai pas lu (pas la dernière)", ici === attendue && ici < info.derniere, `page ${ici}, attendue ${attendue}, dernière ${info.derniere}`);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v311_recit_non_lu.png" });
  // Je tourne les pages jusqu'au bout : tout est lu ; le marque-page mène alors à la fin, puis au sommaire.
  for (let i = 0; i < 12 && (await page()) < info.derniere; i++) { await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.flipNext("top")); await pose(); await p.waitForTimeout(250); }
  await p.evaluate(() => window.GRIMOIRE_REGIONS.ouvrir(5)); await monteeSur(5); await pose(); await p.waitForTimeout(300);
  await allerRecit();
  verifier("tout lu : le récit s'ouvre sur la dernière double page", (await page()) === info.derniere, `${await page()} / ${info.derniere}`);
  await allerRecit();
  verifier("… et, retouché, le marque-page mène au sommaire (v307)", (await page()) === (await p.evaluate(() => window.GRIMOIRE.premiereDeLaSuite())), String(await page()));
});

// =========================================================================
titre("3. LES PARAMÈTRES ET LA POPUP DEV ROUGE : DANS L'ÉCRAN, ET ILS DÉFILENT");
// =========================================================================
await section(async () => {
  await p.setViewportSize({ width: 820, height: 640 });
  await p.waitForTimeout(500);
  const r = await p.evaluate(async () => {
    const c = document.getElementById("conteneur-parametres"), o = document.getElementById("etape-menu-outils");
    c.style.display = "block"; c.classList.add("ouvert");
    document.querySelectorAll("#conteneur-parametres > .fenetre-volante-parchemin").forEach(e => { e.style.display = "none"; });
    o.style.display = "block"; o.style.opacity = "1";
    await new Promise(res => setTimeout(res, 800));
    const b = o.getBoundingClientRect(), st = getComputedStyle(o);
    const avant = o.scrollTop; o.scrollTop = 99999; const apres = o.scrollTop;
    const res = { haut: b.top, bas: b.bottom, h: innerHeight, defile: st.overflowY, barre: o.offsetWidth - o.clientWidth - parseFloat(st.borderLeftWidth) - parseFloat(st.borderRightWidth), sh: o.scrollHeight, ch: o.clientHeight, avant, apres, touch: st.touchAction };
    o.scrollTop = 0; c.style.display = "none"; c.classList.remove("ouvert"); o.style.display = "none";
    return res;
  });
  verifier("Paramètres → Outils, sur un petit écran : la fenêtre tient dans l'écran", r.haut >= -1 && r.bas <= r.h + 1, `${r.haut.toFixed(0)} → ${r.bas.toFixed(0)} / ${r.h}`);
  verifier("… la liste défile, avec une barre de défilement (et au doigt)", r.defile === "auto" && r.sh > r.ch && r.apres > r.avant && r.barre >= 6 && r.touch === "pan-y", JSON.stringify(r));
  await p.evaluate(() => { localStorage.setItem("ivalis_DEV_MODE", "on"); if (window.basculerDevMode) window.basculerDevMode(true); });
  await p.evaluate(() => window.GRIMOIRE_REGIONS.ouvrir(5)); await monteeSur(5); await pose(); await p.waitForTimeout(500);
  const d = await p.evaluate(async () => {
    const bouton = document.getElementById("btn-regions-dev"), popup = document.getElementById("popup-regions-dev");
    if (!bouton || !popup) return null;
    if (popup.hidden || getComputedStyle(popup).display === "none") bouton.click();
    await new Promise(res => setTimeout(res, 300));
    const n = document.getElementById("btn-dev-nouveau"); if (n) n.click();
    await new Promise(res => setTimeout(res, 300));
    const b = popup.getBoundingClientRect(), st = getComputedStyle(popup);
    const avant = popup.scrollTop; popup.scrollTop = 99999;
    return { haut: b.top, bas: b.bottom, h: innerHeight, defile: st.overflowY, sh: popup.scrollHeight, ch: popup.clientHeight, descend: popup.scrollTop > avant,
             barre: popup.offsetWidth - popup.clientWidth - parseFloat(st.borderLeftWidth) - parseFloat(st.borderRightWidth), touch: st.touchAction };
  });
  verifier("la popup DEV rouge (onglet Nouveau) tient dans l'écran", !!d && d.haut >= -1 && d.bas <= d.h + 1, JSON.stringify(d));
  verifier("… et défile, avec sa barre", !!d && d.defile === "auto" && d.sh > d.ch && d.descend && d.barre >= 6 && d.touch === "pan-y", JSON.stringify(d));
  await p.setViewportSize({ width: 1194, height: 834 });
  await p.waitForTimeout(600);
  await pose();
});

// =========================================================================
titre("4. LES CISEAUX : RETIRER DES MORCEAUX DE CARTE, À CÔTÉ DU PINCEAU QUI BRÛLE");
// =========================================================================
await section(async () => {
  // Le calcul : là où c'est découpé, plus de papier ; ailleurs, la carte.
  const k = await p.evaluate(() => {
    const C = 40, L = 30, cases = new Uint8Array(C * L);
    for (let l = 10; l < 20; l++) for (let c = 15; c < 25; c++) cases[l * C + c] = 1;
    const r = window.BordsParchemin.calculer(400, 300, 7, null, { colonnes: C, lignes: L, cases });
    const a = (x, y) => r.masque[(y * 400 + x) * 4 + 3], u = (x, y) => r.usure[(y * 400 + x) * 4 + 3];
    // Le long d'une ligne, du centre de la découpe vers le dehors : le premier point de papier.
    let bord = -1; for (let x = 200; x < 400; x++) if (a(x, 150) > 128) { bord = x; break; }
    return { centre: a(200, 150), loin: a(80, 150), coinIntact: a(60, 60), bord, frange: bord > 0 ? u(bord + 1, 150) : 0 };
  });
  verifier("bords_parchemin : au cœur d'un morceau retiré, plus de papier ; loin de là, la carte entière", k.centre === 0 && k.loin === 255 && k.coinIntact === 255, JSON.stringify(k));
  verifier("… un bord d'arrachement, avec sa frange de fibres", k.bord > 230 && k.bord < 290 && k.frange > 20, JSON.stringify(k));
  // L'outil, dans la popup DEV.
  await p.evaluate(() => window.GRIMOIRE_REGIONS.ouvrir(5)); await monteeSur(5); await pose(); await p.waitForTimeout(400);
  const ui = await p.evaluate(() => {
    const ci = document.getElementById("btn-region-ciseaux"), pi = document.getElementById("btn-region-pinceau");
    return { existe: !!ci, voisin: !!ci && ci.previousElementSibling === pi, titre: ci ? ci.title : "" };
  });
  verifier("un bouton « Ciseaux » juste à côté du pinceau qui brûle", ui.existe && ui.voisin, JSON.stringify(ui));
  const o = await p.evaluate(() => { const r = window.choisirOutilRegion("ciseaux"); return { r, calque: window.calqueCarteRegion(), outil: window.outilCarteRegion(),
    actif: document.getElementById("btn-region-ciseaux").classList.contains("actif"), pinceauActif: document.getElementById("btn-region-pinceau").classList.contains("actif"),
    valider: document.getElementById("btn-region-valider-nuages").textContent, aide: getComputedStyle(document.getElementById("aide-calque-coupe")).display }; });
  verifier("les ciseaux en main : on peint les morceaux retirés", o.r === "ciseaux" && o.calque === "coupe" && o.outil === "pinceau" && o.actif && !o.pinceauActif && o.aide === "block", JSON.stringify(o));
  await p.evaluate(() => window.reglerTaillePinceauRegion(70));
  const v = await centre("#vue-carte-region");
  await p.evaluate(([x, y]) => { window.peindreCarteRegion(x + 60, y - 30, x + 160, y + 40); window.peindreCarteRegion(x + 60, y + 40, x + 160, y - 30); }, [v.x, v.y]);
  await p.waitForTimeout(1600);
  const toile = await p.evaluate(() => { const t = document.getElementById("carte-region-peinture"); return { calque: t.dataset.calque, vue: getComputedStyle(t).display }; });
  verifier("la peinture des ciseaux se voit (en bleu, son calque à elle)", toile.calque === "coupe" && toile.vue === "block", JSON.stringify(toile));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v311_ciseaux_apercu.png" });
  await p.evaluate(() => window.choisirOutilRegion("ciseaux"));
  const ok = await p.evaluate(() => window.validerNuagesRegion());
  await p.mouse.move(5, 5);
  await attendreQue(() => p.evaluate(() => [...document.querySelectorAll('#grimoire-livre .page-region[data-region="5"] .region-carte-cadre')].every(c => c.__coupeParchemin)), 8000);
  await p.waitForTimeout(1200);
  const base = await p.evaluate(() => { const s = (window.__journal || window.__sets || []).filter(x => /Cartes_Regionales\/5/.test(x.chemin)); const d = (window.__docs || {})["Cartes_Regionales/5"] || {};
    return { coupe: d.Coupe || (s.length ? s[s.length - 1].data.Coupe : null), local: (window.CARTES_REGIONALES[5] || {}).coupe, pages: [...document.querySelectorAll('#grimoire-livre .page-region[data-region="5"] .region-carte-cadre')].map(c => !!c.__coupeParchemin), vivante: !!document.getElementById("carte-region").__coupeParchemin }; });
  verifier("« Valider les morceaux retirés » : enregistré dans la fiche de la carte (Coupe)", ok && !!base.coupe && base.coupe.colonnes > 0 && typeof base.coupe.cases === "string" && !!base.local, JSON.stringify({ coupe: !!base.coupe, local: !!base.local }));
  verifier("la carte vivante et les pages du livre sont découpées", base.vivante && base.pages.length === 1 && base.pages.every(Boolean)   /* (v331 : l'image de la carte sur sa seule page de droite) */, JSON.stringify(base.pages));
  const [rr, gg] = await pixel(v.x + 110, v.y + 5);
  verifier("au milieu d'un morceau retiré, on voit le papier de la page (plus la carte verte)", rr > gg + 8, `${rr},${gg}`);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v311_ciseaux_valide.png" });
  // Le pinceau reprend l'usure ; la gomme efface le calque en cours.
  const pin = await p.evaluate(() => { const r = window.choisirOutilRegion("pinceau"); const c = window.calqueCarteRegion(); window.choisirOutilRegion("pinceau"); return { r, c }; });
  verifier("le pinceau, lui, brûle toujours (le calque de l'usure)", pin.r === "pinceau" && pin.c === "usure", JSON.stringify(pin));
  await p.evaluate(() => localStorage.setItem("ivalis_DEV_MODE", "off"));
});

// =========================================================================
titre("5. UNE IMAGE QUI NE SE CHARGE PAS N'EST PAS UNE « ERREUR JAVASCRIPT »");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => {
    const lignes = () => document.body.innerText.split("\n").filter(l => /^• /.test(l.trim())).length;
    const avant = lignes();
    const im = document.createElement("img"); document.body.appendChild(im); im.src = "/n-existe-pas-" + Date.now() + ".png";
    await new Promise(res => { im.onerror = res; setTimeout(res, 1500); });
    await new Promise(res => setTimeout(res, 100));
    im.remove();
    const banniere = [...document.querySelectorAll("div")].some(d => /Erreur JavaScript/.test(d.textContent) && /n-existe-pas/.test(d.textContent));
    return { avant, apres: lignes(), banniere };
  });
  verifier("une image introuvable n'ajoute rien au bandeau des erreurs (plus d'« erreur inconnue »)", r.apres === r.avant && !r.banniere, JSON.stringify(r));
});

// =========================================================================
titre("6. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json') || "{}").version;
  verifier("version 311 ou plus (trace_combat.js, version.json)", vTrace >= 311 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const vv = (f) => Number((html.match(new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  verifier("les fichiers touchés ont changé de version", vv("grimoire_recit.js") >= 10 && vv("style.css") >= 124 && vv("grimoire_carte.css") >= 2 && vv("cartes_regionales.js") >= 15
           && vv("grimoire_regions.js") >= 4 && vv("bords_parchemin.js") >= 6 && vv("trace_combat.js") >= 216);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
