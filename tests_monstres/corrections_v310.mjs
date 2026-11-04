// v310 — LE PAPIER D'AVATAR ENTRE LES FEUILLETS, LE DÉFILEMENT PLUS VIF, LA
// PLIURE SUR LES CARTES, LE MARQUE-PAGE DE LA MARCHE, LE DÉZOOM BORNÉ, LE
// PARCHEMIN BRÛLÉ SUR LES PAGES.
//
// Nico : « L'image qui affiche les avatars sur le bord gauche : fais-la le
// double en hauteur et toujours coincée dans les pages du dessous. Enlève la
// bordure cadre dessus, fais juste un vieux morceau de parchemin qui dépasse. Et
// le nom en mode titre, gros, sur le bas. » ; « l'animation de défilement rapide,
// nickel ; fais juste défiler un tout petit peu plus vite » ; « sur les maps
// régionales qui sont sur les deux pages, mets l'ombre de la pliure du livre
// par-dessus l'image, comme si l'image épousait la page » ; « on va remplacer le
// bouton de marche : crée-moi un marque-page côté haut droit du livre, qui ne se
// montre que quand il peut être utilisé » ; « quand on dézoome une carte
// régionale, on ne doit pas pouvoir dézoomer plus que la taille de l'image
// d'origine à l'ouverture de la page » ; « l'effet de brûlure de la map au
// pinceau se fait très très mal sur la page, regarde ce qui cloche » (l'image de
// la page, intacte sous la carte vivante, se voyait dans chaque trou brûlé).
//
// Lancer : node tests_monstres/corrections_v310.mjs
// (IVALIS_RACINE=… pour un autre dossier ; V310_CAPTURES=dossier pour les captures.)
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
const CAPTURES = process.env.V310_CAPTURES || "";
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
  if (/res\.cloudinary\.com\/.*IMG_(1894|1892|1900|1893|1897|1903|1979|2189|1984|1977|1981)_/.test(u)) { imagesDemandees.push(u); return r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: /IMG_1893|IMG_1903/.test(u) ? CARTE_PAYSAGE : CARTE_PORTRAIT }); }
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
  ["ouvrirChatbox", "ouvrirMenuPersonnages", "ouvrirPopupRencontre", "ouvrirParametres"].forEach(n => { window[n] = () => window.__appels.push(n); });
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


const geo = () => p.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  return { livre: r(document.getElementById("grimoire-livre")), vue: r(document.getElementById("vue-carte-region")), pliure: r(document.getElementById("region-pliure")) };
});

// =========================================================================
titre("1. LA PLIURE DU LIVRE PAR-DESSUS LA CARTE VIVANTE");
// =========================================================================
await section(async () => {
  await monteeSur(5); await pose(); await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const pl = document.getElementById("region-pliure"), v = document.getElementById("vue-carte-region");
    if (!pl) return null;
    const st = (sel) => getComputedStyle(pl.querySelector(sel));
    return { parent: pl.parentNode.id, z: Number(getComputedStyle(pl).zIndex), zVue: Number(getComputedStyle(v).zIndex), paysage: pl.classList.contains("paysage"),
             g: st(".gauche").backgroundImage, d: st(".droite").backgroundImage, gVisible: st(".gauche").visibility, evts: getComputedStyle(pl).pointerEvents };
  });
  const g = await geo();
  verifier("une carte en paysage (le désert d'Etheria) : l'ombre de la pliure est posée sur le livre, par-dessus la carte",
           !!r && r.parent === "grimoire-livre" && r.z > r.zVue && r.paysage && /linear-gradient/.test(r.g) && /linear-gradient/.test(r.d) && r.gVisible === "visible", JSON.stringify(r));
  verifier("… au milieu du livre (le dos), sans prendre le doigt", !!g.pliure && Math.abs((g.pliure.l + g.pliure.w / 2) - (g.livre.l + g.livre.w / 2)) < 2 && r.evts === "none",
           g.pliure ? `${(g.pliure.l + g.pliure.w / 2).toFixed(0)} / ${(g.livre.l + g.livre.w / 2).toFixed(0)}` : "absente");
  const dessus = await p.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? (el.closest("#region-pliure") ? "pliure" : el.closest("#vue-carte-region") ? "carte" : el.id || el.className) : "rien"; }, [g.livre.l + g.livre.w / 2 + 3, g.livre.t + g.livre.h / 2]);
  verifier("… et la carte se touche encore à travers elle", dessus === "carte", dessus);
  // Pendant une tourne, elle part avec la carte vivante.
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.flipNext("top"));
  await p.waitForTimeout(120);
  const pendant = await p.evaluate(() => !!document.getElementById("region-pliure"));
  await pose(); await p.waitForTimeout(400);
  verifier("une page qui tourne : l'ombre posée s'en va (celle des pages tourne avec elles)", !pendant, String(pendant));
  // La région suivante : le mont Pletia (portrait), la carte sur la page de droite.
  await monteeSur(3); await p.waitForTimeout(300);
  const q = await p.evaluate(() => { const pl = document.getElementById("region-pliure"); return pl ? { paysage: pl.classList.contains("paysage"), g: getComputedStyle(pl.querySelector(".gauche")).visibility, d: getComputedStyle(pl.querySelector(".droite")).visibility } : null; });
  verifier("une carte en portrait (page de droite) : seule la moitié droite de la pliure", !!q && !q.paysage && q.g === "hidden" && q.d === "visible", JSON.stringify(q));
});

// =========================================================================
titre("2. LE PARCHEMIN BRÛLÉ : LES PAGES PORTENT LE MÊME BORD, ET S'EFFACENT SOUS LA CARTE VIVANTE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_REGIONS.ouvrir(5));
  await monteeSur(5); await pose(); await p.waitForTimeout(600);
  const pages = () => p.evaluate(() => [...document.querySelectorAll("#grimoire-livre .page-region")].map(pg => ({ id: pg.id, region: pg.dataset.region, sous: pg.classList.contains("sous-la-vue"),
    cadres: [...pg.querySelectorAll(".region-carte-cadre")].map(c => ({ masque: (c.style.maskImage || c.style.webkitMaskImage || "").slice(0, 8), usure: !!c.querySelector(".parchemin-usure"), zones: !!c.__zonesParchemin, vis: getComputedStyle(c).visibility })) })));
  await attendreQue(async () => (await pages()).flatMap(x => x.cadres).every(c => c.masque === 'url("blo'), 6000);
  let a = await pages();
  const desert = a.filter(x => x.region === "5"), autres = a.filter(x => x.region !== "5");
  verifier("chaque image de carte des pages a son bord de parchemin (masque et usure, la même graine que la carte)",
           a.flatMap(x => x.cadres).length >= 6 && a.flatMap(x => x.cadres).every(c => c.masque === 'url("blo' && c.usure), JSON.stringify(a.map(x => x.cadres.length)));
  verifier("sous la carte vivante (le désert), l'image des pages s'efface : un trou montre le papier", desert.length === 2 && desert.every(x => x.sous && x.cadres.every(c => c.vis === "hidden")), JSON.stringify(desert.map(x => [x.sous, x.cadres.map(c => c.vis)])));
  verifier("… les autres régions gardent leur image (elles tournent avec les pages)", autres.length >= 6 && autres.every(x => !x.sous && x.cadres.every(c => c.vis === "visible")));
  // Le DEV peint l'usure, et la valide : les pages se brûlent aussi.
  await p.evaluate(() => localStorage.setItem("ivalis_DEV_MODE", "on"));
  await p.evaluate(() => { window.choisirOutilRegion("pinceau"); window.reglerTaillePinceauRegion(60); });
  const v = await centre("#vue-carte-region");
  await p.evaluate(([x, y, w, h]) => { window.peindreCarteRegion(x - w / 2 + 10, y - h / 2 + 10, x - w / 2 + 10, y + h / 2 - 10); window.peindreCarteRegion(x - w / 2 + 10, y - h / 2 + 10, x + w / 2 - 10, y - h / 2 + 10); window.peindreCarteRegion(x - 60, y, x + 60, y + 40); }, [v.x, v.y, v.w, v.h]);
  await p.waitForTimeout(1500);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v310_brulure_au_pinceau.png" });
  await p.evaluate(() => window.choisirOutilRegion("pinceau"));
  const ok = await p.evaluate(() => window.validerNuagesRegion());
  await attendreQue(async () => (await pages()).filter(x => x.region === "5").every(x => x.cadres.every(c => c.zones)), 8000);
  a = await pages();
  verifier("l'usure validée : les pages du désert se brûlent comme la carte (leurs zones peintes)", ok && a.filter(x => x.region === "5").every(x => x.cadres.every(c => c.zones && c.masque === 'url("blo')), JSON.stringify(a.filter(x => x.region === "5").map(x => x.cadres)));
  await p.mouse.move(5, 5);
  await p.waitForTimeout(1500);
  // Le long du trait peint au bord gauche, la carte est percée : on y voit le papier de la page
  // (beige : plus de rouge que de vert), plus la carte (verte au banc).
  const vr = await centre("#vue-carte-region");
  const pixel = async (x, y) => { const png = await p.screenshot({ clip: { x, y, width: 1, height: 1 } });
    return p.evaluate(async (b64) => { const im = new Image(); im.src = "data:image/png;base64," + b64; await im.decode(); const c = document.createElement("canvas"); c.width = c.height = 1;
      const x = c.getContext("2d"); x.drawImage(im, 0, 0); return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3); }, png.toString("base64")); };
  let papierVu = 0, carteVue = 0;
  for (let dx = 6; dx < 40; dx += 4) { const [r, g] = await pixel(Math.round(vr.x - vr.w / 2 + dx), Math.round(vr.y + vr.h * 0.12)); if (r > g + 8) papierVu++; else if (g > r + 4) carteVue++; }
  verifier("dans un trou brûlé, c'est le papier de la page qu'on voit (plus la carte intacte)", papierVu >= 2, `papier ${papierVu}, carte ${carteVue}`);
  if (CAPTURES) { await p.mouse.move(5, 5); await p.waitForTimeout(400); await p.screenshot({ path: CAPTURES + "/v310_brulure_validee.png" }); }
  // Pendant une tourne, la page brûlée se voit (la carte vivante est cachée).
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.flipPrev("top"));
  await p.waitForTimeout(150);
  const t = await p.evaluate(() => [...document.querySelectorAll('#grimoire-livre .page-region[data-region="5"]')].map(pg => pg.classList.contains("sous-la-vue")));
  verifier("une page qui tourne : l'image brûlée de la page revient", t.every(x => !x), JSON.stringify(t));
  await pose(); await p.waitForTimeout(300);
  await p.evaluate(() => localStorage.setItem("ivalis_DEV_MODE", "off"));
});

// =========================================================================
titre("3. LE DÉZOOM : JAMAIS PLUS PETIT QUE LA CARTE À L'OUVERTURE DE LA PAGE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_REGIONS.ouvrir(5));
  await monteeSur(5); await pose(); await p.waitForTimeout(500);
  // Le livre s'ouvre en zoomant : la place de la carte est mesurée pendant que la scène est encore réduite.
  const r = await p.evaluate(async () => {
    const scene = document.getElementById("grimoire-scene"), vue = document.getElementById("vue-carte-region");
    const c = () => window.cadrageCarteRegion();
    const page = Math.min(vue.offsetWidth / c().largeur, vue.offsetHeight / c().hauteur);
    const avant = scene.style.transform;
    scene.style.transition = "none"; scene.style.transform = "scale(0.55)";
    window.recadrerCarteRegionale();
    const pendant = c().base;
    scene.style.transform = avant; scene.style.transition = "";
    await new Promise(res => setTimeout(res, 400));
    for (let i = 0; i < 12; i++) window.zoomerCarteRegion(0.6);
    const im = document.getElementById("carte-region-image").getBoundingClientRect(), v = vue.getBoundingClientRect();
    return { page, pendant, zoom: c().zoom, base: c().base, img: [im.width, im.height], vue: [v.width, v.height] };
  });
  verifier("mesurée pendant l'ouverture du livre, la taille de base reste celle de la page", Math.abs(r.pendant - r.page) / r.page < 0.01, `${r.pendant.toFixed(4)} / ${r.page.toFixed(4)}`);
  verifier("on dézoome tant qu'on veut : la carte garde au moins la taille de la page", Math.abs(r.zoom - r.page) / r.page < 0.01 && (Math.abs(r.img[0] - r.vue[0]) < 2 || Math.abs(r.img[1] - r.vue[1]) < 2), JSON.stringify(r));
  await p.mouse.move(600, 420);
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 500); await p.waitForTimeout(40); }
  const z = await p.evaluate(() => window.cadrageCarteRegion());
  verifier("… à la molette aussi", Math.abs(z.zoom - z.base) < 1e-6 && Math.abs(z.base - r.page) / r.page < 0.01, `${z.zoom} / ${r.page}`);
});

// =========================================================================
titre("4. LE MARQUE-PAGE DE LA MARCHE, EN HAUT À DROITE DU LIVRE");
// =========================================================================
const marche = () => p.evaluate(() => { const m = document.getElementById("grimoire-marque-marche"), l = document.getElementById("grimoire-livre").getBoundingClientRect();
  if (!m) return null; const r = m.getBoundingClientRect(), bv = document.getElementById("btn-voyage");
  return { inactif: m.classList.contains("inactif"), choix: m.classList.contains("choix"), x: (r.left + r.width / 2 - l.left) / l.width, haut: r.top < l.top,
           bouton: bv ? getComputedStyle(bv).display : "absent", choixVoyage: window.choixVoyageGroupe ? window.choixVoyageGroupe() : null, titre: m.title }; });
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_REGIONS.ouvrir(5));
  await monteeSur(5); await pose(); await p.waitForTimeout(700);
  let m = await marche();
  verifier("sur la carte d'une région, il sort au-dessus du livre, côté droit (haut droit)", !!m && !m.inactif && m.haut && m.x > 0.85, JSON.stringify(m));
  verifier("le bouton de marche n'est plus sur le livre", m.bouton === "none" || m.bouton === "absent", m.bouton);
  const vue = await p.evaluate(() => { const el = document.getElementById("grimoire-marque-marche"); return !!(el.compareDocumentPosition(document.getElementById("grimoire-livre")) & Node.DOCUMENT_POSITION_FOLLOWING); });
  verifier("glissé sous les pages comme les autres marque-pages (avant le livre)", vue);
  if (CAPTURES) { await p.screenshot({ path: CAPTURES + "/v310_marque_page_marche.png" }); }
  // Le toucher : on choisit sa destination ; on le retouche, on annule.
  const c = await centre("#grimoire-marque-marche");
  await p.mouse.click(c.x, c.y - c.h * 0.3);
  await p.waitForTimeout(400);
  m = await marche();
  verifier("le toucher lance le voyage (le choix de la destination), le marque-page brille", !!m.choixVoyage && m.choixVoyage.type === "voyage" && m.choix && m.titre === "Annuler le voyage", JSON.stringify(m.choixVoyage));
  const c2 = await centre("#grimoire-marque-marche");
  await p.mouse.click(c2.x, c2.y - c2.h * 0.3);
  await p.waitForTimeout(400);
  m = await marche();
  verifier("retouché : le voyage est annulé", !m.choixVoyage && !m.choix, JSON.stringify(m.choixVoyage));
  // Un combat du récit : on ne peut pas voyager, il rentre.
  await p.evaluate(() => { window.__vraiCombat = window.combatRPActif; window.combatRPActif = () => true; });
  await p.waitForTimeout(500);
  m = await marche();
  verifier("un combat en cours : il rentre sous les pages (on ne peut pas marcher)", m.inactif, JSON.stringify(m));
  await p.evaluate(() => { window.combatRPActif = window.__vraiCombat; });
  await p.waitForTimeout(500);
  verifier("le combat fini, il ressort", !(await marche()).inactif);
  // La carte du monde aussi ; pas dans le récit.
  await p.evaluate(() => window.GRIMOIRE_REGIONS.versLeMonde());
  await pose(); await p.waitForTimeout(500);
  verifier("sur la carte du monde, il est là", !(await marche()).inactif);
  await p.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit());
  await attendreQue(() => p.evaluate(() => !window.GRIMOIRE.defileEnCours()), 8000);
  await pose(); await p.waitForTimeout(600);
  verifier("dans le récit, il est rangé", (await marche()).inactif);
});

// =========================================================================
titre("5. LE PAPIER DE L'AVATAR : DEUX FOIS PLUS HAUT, GLISSÉ ENTRE LES FEUILLETS, SANS CADRE, LE NOM EN TITRE");
// =========================================================================
await section(async () => {
  // Un portrait (le banc n'a pas Internet) : dessiné sur place.
  const portrait = await p.evaluate(() => { const c = document.createElement("canvas"); c.width = 400; c.height = 800; const x = c.getContext("2d");
    x.fillStyle = "#6b7a8a"; x.fillRect(0, 0, 400, 800); x.fillStyle = "#c58f62"; x.beginPath(); x.ellipse(200, 230, 110, 140, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = "#4a2a12"; x.fillRect(80, 380, 240, 420); x.fillStyle = "#2b1a0e"; x.beginPath(); x.ellipse(200, 120, 120, 70, 0, Math.PI, 0); x.fill(); return c.toDataURL("image/png"); });
  await p.evaluate((u) => { window.PERSOS_JOUEURS_PARTIE[0].urlCloudinary = u; }, portrait);
  const NARRATION = "La salle du Chaudron Fêlé sent la bière tiède. Derrière le comptoir, <strong style='color: #e8d5a5;'>Varos</strong> essuie une chope.<br>Thorin, bien sûr, prend ce silence pour une invitation, et Lyra lève les yeux au ciel.";
  await relayer([{ idDoc: "m1", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: NARRATION, Timestamp: 1000 }], true);
  await attendreQue(() => p.evaluate(() => document.getElementById("recit-avatar").classList.contains("sortie")), 5000);
  await p.waitForTimeout(900);
  const a = await p.evaluate(() => {
    const pa = document.getElementById("recit-avatar"), u = pa.querySelector(".papier-usure"), cadre = pa.querySelector(".cadre-portrait"), nom = pa.querySelector(".nom-portrait"), img = cadre.querySelector("img");
    const r = (el) => el.getBoundingClientRect(), sc = document.getElementById("grimoire-scene"), s = Number(getComputedStyle(sc).getPropertyValue("--s")) || 1;
    const scene = r(sc), tr = document.querySelector("#recit-avatars .recit-tranche");
    const cs = getComputedStyle(cadre);
    // L'ancien portrait (v306) : la largeur du papier d'alors (moins ses marges), × 1,08.
    const marge = parseFloat(getComputedStyle(sc).getPropertyValue("--marge-gauche")) || 0, u0 = parseFloat(getComputedStyle(sc).getPropertyValue("--u"));
    const ancienne = (Math.min(marge + 251 * s - 14, 250 * s) - 4 * u0) * 1.08;
    return { ratio: cadre.offsetHeight / cadre.offsetWidth, hCadre: cadre.offsetHeight, ancienne, ombreCadre: cs.boxShadow, bordCadre: cs.borderTopWidth, masque: cs.maskImage || cs.webkitMaskImage || "",
             papier: { t: r(u).top, b: r(u).bottom, l: r(u).left, r: r(u).right }, nom: { t: nom.offsetTop, b: nom.offsetTop + nom.offsetHeight, taille: parseFloat(getComputedStyle(nom).fontSize), texte: nom.textContent },
             imgBas: cadre.offsetTop + cadre.offsetHeight, centreContenu: (r(cadre).left + r(cadre).right) / 2 + 0, hPapier: u.offsetHeight, img: !!img && img.complete && img.naturalWidth > 0, uPx: parseFloat(getComputedStyle(sc).getPropertyValue("--u")),
             tranche: tr ? { l: r(tr).left, r: r(tr).right, fond: getComputedStyle(tr).backgroundImage.slice(0, 80) } : null,
             x175: scene.left + 200 * s, x251: scene.left + 251 * s, livre: { t: r(document.getElementById("grimoire-livre")).top, b: r(document.getElementById("grimoire-livre")).bottom } };
  });
  verifier("le portrait est deux fois plus haut qu'avant (hauteur 2,5 × sa largeur, au lieu de 1,08 ; sa hauteur au moins 1,7 × l'ancienne)", Math.abs(a.ratio - 2.5) < 0.05 && a.hCadre >= 1.7 * a.ancienne, `${a.ratio.toFixed(2)}, ${a.hCadre.toFixed(0)} px / avant ${a.ancienne.toFixed(0)} px`);
  verifier("sans cadre : ni bordure ni ombre autour de l'image, ses bords fondus dans le parchemin", a.ombreCadre === "none" && a.bordCadre === "0px" && /radial-gradient/.test(a.masque) && a.img, `${a.ombreCadre} / ${a.bordCadre} / ${a.masque.slice(0, 30)}`);
  verifier("le nom en titre, gros, en bas du papier (sous l'image)", a.nom.t >= a.imgBas && a.nom.b <= a.hPapier && a.nom.taille >= a.uPx * 5 - 0.5 && a.nom.texte === "Thorin Ironfoot", JSON.stringify(a.nom) + " u=" + a.uPx);
  verifier("le papier tient dans la hauteur du livre", a.papier.t > a.livre.t && a.papier.b < a.livre.b, `${a.papier.t.toFixed(0)} → ${a.papier.b.toFixed(0)} (livre ${a.livre.t.toFixed(0)} → ${a.livre.b.toFixed(0)})`);
  verifier("les feuillets du dessus (la tranche, x 200 → 251 du livre) repassent par-dessus le papier", !!a.tranche && Math.abs(a.tranche.l - a.x175) < 2 && Math.abs(a.tranche.r - a.x251) < 2 && /livre_ouvert/.test(a.tranche.fond), JSON.stringify(a.tranche));
  const pile = await p.evaluate(() => { const e = document.getElementById("recit-avatars"), tr = e.querySelector(".recit-tranche");
    const z = (el) => Number(getComputedStyle(el).zIndex) || 0;
    return { dansLEtui: tr.parentNode === e, apres: [...e.children].indexOf(tr) > [...e.children].indexOf(document.getElementById("recit-portrait")),
             z: z(tr), zPapiers: [z(document.getElementById("recit-avatar")), z(document.getElementById("recit-portrait"))], etuiFin: e.getBoundingClientRect().right }; });
  verifier("… le papier entre sous eux : coincé dans les pages du dessous (il passe sous la tranche, jusqu'au bord des pages)",
           pile.dansLEtui && pile.apres && pile.zPapiers.every(x => x < pile.z) && a.papier.r > a.x175 + 10 && a.papier.l < a.x175 - 40 && a.centreContenu < a.x175 && Math.abs(pile.etuiFin - a.x251) < 2, JSON.stringify(pile) + ` papier ${a.papier.l.toFixed(0)} → ${a.papier.r.toFixed(0)}`);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v310_papier_heros.png" });
  await attendreQue(() => p.evaluate(() => { const n = document.querySelector('#grimoire-livre .nom-livre[data-nom="Varos"]'); return !!n && n.getBoundingClientRect().width > 0; }), 8000);
  await p.waitForTimeout(400);
  const c = await centre('#grimoire-livre .nom-livre[data-nom="Varos"]');
  if (c) { await p.mouse.click(c.x, c.y); await p.waitForTimeout(800); }
  const vu = await p.evaluate(() => { const v = document.getElementById("recit-portrait"); return { sortie: v.classList.contains("sortie"), ratio: v.querySelector(".cadre-portrait").offsetHeight / v.querySelector(".cadre-portrait").offsetWidth, nom: v.querySelector(".nom-portrait").textContent }; });
  verifier("un nom touché (Varos) : son papier, aussi haut, sort par-dessus", vu.sortie && Math.abs(vu.ratio - 2.5) < 0.05 && vu.nom === "Varos", JSON.stringify(vu));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v310_papiers_avatar.png" });
});

// =========================================================================
titre("6. LES PAGES QUI DÉFILENT, UN PEU PLUS VITE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.__durees = []; window.GRIMOIRE_PAGEFLIP.on("changeState", (e) => { if (String(e.data) === "flipping") window.__durees.push(window.GRIMOIRE_PAGEFLIP.getSettings().flippingTime); }); });
  await p.evaluate(() => document.getElementById("grimoire-marque-page").click());
  await attendreQue(() => p.evaluate(() => !window.GRIMOIRE.defileEnCours()), 8000);
  const r = await p.evaluate(() => ({ durees: [...new Set(window.__durees)], apres: window.GRIMOIRE_PAGEFLIP.getSettings().flippingTime }));
  verifier("0,12 s la page pendant le défilement (0,15 s avant), puis 0,5 s", r.durees.includes(120) && !r.durees.includes(150) && r.apres === 500, JSON.stringify(r));
});

// =========================================================================
titre("7. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json') || "{}").version;
  verifier("version 310 ou plus (trace_combat.js, version.json)", vTrace >= 310 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const vv = (f) => Number((html.match(new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  verifier("les fichiers touchés ont changé de version", vv("grimoire.js") >= 13 && vv("grimoire.css") >= 10 && vv("grimoire_recit.js") >= 9 && vv("grimoire_recit.css") >= 7
           && vv("grimoire_regions.js") >= 3 && vv("grimoire_regions.css") >= 2 && vv("cartes_regionales.js") >= 14 && vv("voyage_groupe.js") >= 11 && vv("trace_combat.js") >= 215);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
