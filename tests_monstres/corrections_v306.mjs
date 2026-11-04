// v306 — L'OUVERTURE SUR LA TABLE, LES PAGES QUI DÉFILENT POUR DE VRAI, LES NOMS
// QUI SE TOUCHENT, LES PAGES VIERGES, LES MARQUE-PAGES RANGÉS, LES PAPIERS DES
// AVATARS ; UN SEUL LEADER ; LA DÉTECTION DU COMBAT.
//
// Nico : « le zoom quand le livre s'ouvre ne va pas : le livre dépasse de la table
// et est sur la plume et l'encrier » ; « quand les pages défilent vite, tu
// n'utilises pas la bibliothèque des pages… fais défiler des pages de texte au
// hasard, avec de l'écriture » ; « les noms cliquables dans le texte RP ne marchent
// toujours pas » ; « qu'on ne puisse pas fermer la dernière page du livre : qu'on
// tourne plutôt une page vierge » ; « les marque-pages grisés, range-les cachés
// dans le livre » ; « les avatars sortent du côté gauche du livre, en biais, sur
// un parchemin usé ; le sien reste sorti dans la partie RP ; un nom cliqué : un
// autre papier par-dessus, légèrement décalé » ; « deux leaders dans le même
// combat : c'est un seul par combat max » ; « il doit y avoir une intention de
// combattre… on lance le combat dès qu'il y a un acte agressif évident ».
//
// Lancer : node tests_monstres/corrections_v306.mjs
// (IVALIS_RACINE=… pour un autre dossier ; V306_CAPTURES=dossier pour les captures.)
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
const CAPTURES = process.env.V306_CAPTURES || "";
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
// La table (le banc n'a pas Internet) : du bois dessiné sur place, 1672 × 941.
const TABLE = await (async () => { const pg = await b.newPage(); const u = await pg.evaluate(() => { const c = document.createElement("canvas"); c.width = 1672; c.height = 941;
  const x = c.getContext("2d"); x.fillStyle = "#130c06"; x.fillRect(0, 0, 1672, 941); x.fillStyle = "#7a4a26"; x.fillRect(170, 55, 1470, 835); return c.toDataURL("image/png"); });
  await pg.close(); return Buffer.from(u.split(",")[1], "base64"); })();
const p = await b.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
// Les IA (Gemini), simulées : le Narrateur lite, les annonces, le titre d'un chapitre.
const appelsIA = [];
let iaEnPanne = false, refusPlume = false, panneCle1 = false;
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : /BG_tjiigl/.test(r.request().url()) ? r.fulfill({ status: 200, contentType: 'image/png', body: TABLE }) : r.abort());
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

const surTable = () => p.evaluate(() => {
  const t = document.getElementById("grimoire-table").getBoundingClientRect(), f = document.querySelector(".grimoire-fond-livre").getBoundingClientRect();
  const k = 1672 / t.width;
  return { reliure: [(f.left + 68 / 2000 * f.width - t.left) * k, (f.top + 43 / 1117 * f.height - t.top) * k, 1931 / 2000 * f.width * k],
           couvre: t.left <= 0.5 && t.top <= 0.5 && t.right >= innerWidth - 0.5 && t.bottom >= innerHeight - 0.5 };
});

// =========================================================================
titre("1. L'OUVERTURE : LE LIVRE OUVERT GARDE SA PLACE SUR LA TABLE, LOIN DE L'ENCRIER");
// =========================================================================
await section(async () => {
  const r = await surTable();
  verifier("ouvert, la reliure est posée sur la table, à sa place (x 200, y 232, 905 de large)", r.reliure.every((v, i) => Math.abs(v - [200, 232, 905][i]) < 3), r.reliure.map(v => v.toFixed(1)).join(" / "));
  verifier("… à gauche de l'encrier (x 1128) et sous la plume : elle ne les couvre plus", r.reliure[0] + r.reliure[2] < 1120 && r.reliure[0] > 170, `de ${r.reliure[0].toFixed(0)} à ${(r.reliure[0] + r.reliure[2]).toFixed(0)}`);
  verifier("la table couvre encore tout l'écran", r.couvre);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v306_ouvert_sur_la_table.png" });
});

// =========================================================================
titre("2. LES MARQUE-PAGES ÉTEINTS : RANGÉS DANS LE LIVRE, ILS RESSORTENT EN PARTIE");
// =========================================================================
const marques = () => p.evaluate(() => {
  const f = document.querySelector(".grimoire-fond-livre").getBoundingClientRect(), pages = f.top + 62 * f.width / 2000;
  return ["grimoire-marque-page", "grimoire-marque-recit"].map(id => { const m = document.getElementById(id); return { id, inactif: m.classList.contains("inactif"), cache: m.getBoundingClientRect().top > pages }; });
});
await section(async () => {
  const hors = await marques();
  verifier("hors partie, les trois marque-pages sont rangés sous les pages (on ne les voit pas)", hors.every(m => m.inactif && m.cache), JSON.stringify(hors));
});

// La partie se charge.
await cliquer("#grimoire-btn-charger");
await p.waitForTimeout(700);
await cliquer('#grimoire-liste-parties [data-id="P1"]');
await p.waitForTimeout(150);
await p.fill("#grimoire-mdp-partie", "sel");
await cliquer("#grimoire-valider-partie");
await p.waitForTimeout(400);
await attendreQue(async () => (await page()) === 5, 4000);
await p.waitForTimeout(800);
const NARRATION = `La salle du Chaudron Fêlé sent la bière tiède et le chien mouillé. Derrière le comptoir, <strong style="color: #e8d5a5;">Varos</strong> essuie une chope sans nous accorder un regard.<br>Thorin, bien sûr, prend ce silence pour une invitation, et Lyra lève les yeux au ciel.`;
const M = [{ idDoc: "m1", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: NARRATION, Timestamp: 1000 }];
await relayer(M, true);
await p.waitForTimeout(300);

await section(async () => {
  const en = await marques();
  verifier("la partie chargée : ils ressortent au-dessus du livre", en.every(m => !m.inactif && !m.cache), JSON.stringify(en));
});

// =========================================================================
titre("3. LES PAGES QUI DÉFILENT : DE VRAIES PAGES DU LIVRE, ÉCRITES À LA MAIN");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.__sons = []; window.__clics = 0; window.__etats = []; window.__durees = [];
    window.GRIMOIRE_PAGEFLIP.on("changeState", (e) => { window.__etats.push(String(e.data)); window.__durees.push(window.GRIMOIRE_PAGEFLIP.getSettings().flippingTime); }); });
  const n0 = await p.evaluate(() => window.grimoireEtat().nbPages);
  const d = await p.evaluate(() => {
    document.getElementById("grimoire-marque-recit").click();
    const l = document.getElementById("grimoire-livre"), f = [...l.querySelectorAll(".page-manuscrite")];
    return { n: f.length, ecrites: f.every(x => x.querySelectorAll("p").length >= 3 && x.textContent.trim().length > 300), differentes: new Set(f.map(x => x.textContent.slice(0, 80))).size === f.length,
             papier: f.every(x => x.classList.contains("page-papier") && x.classList.contains("page-grimoire")), dansLeLivre: f.every(x => l.contains(x)) };
  });
  verifier("des feuillets manuscrits entrent dans le livre (des pages de StPageFlip, en papier)", d.n >= 4 && d.n % 2 === 0 && d.papier && d.dansLeLivre, JSON.stringify(d));
  verifier("… couverts d'écriture, tous différents", d.ecrites && d.differentes);
  await attendreQue(() => p.evaluate(() => !window.GRIMOIRE.defileEnCours()), 6000);
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => ({ page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), etats: window.__etats.slice(), durees: window.__durees.slice(), apres: window.GRIMOIRE_PAGEFLIP.getSettings().flippingTime,
    reste: document.querySelectorAll(".page-manuscrite").length, n: window.grimoireEtat().nbPages, sons: window.__sons.map(x => x[0]), clics: window.__clics }));
  const tournes = r.etats.filter(e => e === "flipping").length;
  verifier("le livre les tourne une à une (de vraies tournes de pages, souples)", tournes >= 3, `${tournes} tournes`);
  verifier("… très vite (0,12 s la page depuis la v310), puis le réglage revient (0,5 s)", r.durees.some(x => x === 120) && r.apres === 500, JSON.stringify([...new Set(r.durees)]));
  verifier("arrivé au récit : les vraies pages sont revenues, les feuillets repartis", r.page === 9 && r.reste === 0 && r.n === n0, JSON.stringify({ page: r.page, reste: r.reste, n: r.n, n0 }));
  verifier("un seul bruit (les pages qui défilent), pas de clic", r.sons.join(",") === "pages-defilent" && r.clics === 0, r.sons.join(","));
  // En arrière : le marque-page de l'index.
  await p.evaluate(() => document.getElementById("grimoire-marque-page").click());
  await attendreQue(() => p.evaluate(() => !window.GRIMOIRE.defileEnCours()), 6000);
  await p.waitForTimeout(300);
  verifier("en arrière jusqu'à l'index, pareil", (await page()) === 3 && (await p.evaluate(() => document.querySelectorAll(".page-manuscrite").length)) === 0);
  if (CAPTURES) {
    await p.evaluate(() => document.getElementById("grimoire-marque-recit").click());
    await p.waitForTimeout(260);
    await p.screenshot({ path: CAPTURES + "/v306_pages_defilent.png" });
    await attendreQue(() => p.evaluate(() => !window.GRIMOIRE.defileEnCours()), 6000);
  } else {
    await p.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit());
    await attendreQue(() => p.evaluate(() => !window.GRIMOIRE.defileEnCours() && window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex() === 9), 6000);
  }
  await p.waitForTimeout(500);
});

// =========================================================================
titre("4. LES PAPIERS DES AVATARS : LE SIEN SORTI DANS LE RÉCIT, UN NOM TOUCHÉ PAR-DESSUS");
// =========================================================================
const papiers = () => p.evaluate(() => {
  const g = document.getElementById("grimoire-suite-2").getBoundingClientRect();
  const lis = (id) => { const el = document.getElementById(id), r = el.querySelector(".papier-usure").getBoundingClientRect(), st = getComputedStyle(el);
    const m = /matrix\(([-\d.e]+), ([-\d.e]+)/.exec(st.transform); return { sortie: el.classList.contains("sortie"), l: r.left, r: r.right, t: r.top, b: r.bottom,
      angle: m ? Math.atan2(Number(m[2]), Number(m[1])) * 180 / Math.PI : 0, nom: el.querySelector(".nom-portrait").textContent, clip: getComputedStyle(el.querySelector(".papier-usure")).clipPath,
      z: Number(st.zIndex) || 0 }; };
  return { page: { l: g.left, t: g.top, b: g.bottom }, mien: lis("recit-avatar"), vu: lis("recit-portrait"), visibles: getComputedStyle(document.getElementById("recit-avatars")).opacity };
});
await section(async () => {
  await attendreQue(async () => (await papiers()).mien.sortie, 4000);
  await p.waitForTimeout(700);
  const a = await papiers();
  verifier("dans le récit, son papier est sorti, avec l'avatar et le nom de son héros", a.mien.sortie && a.mien.nom === "Thorin Ironfoot" && a.visibles === "1", JSON.stringify(a.mien));
  verifier("… du côté gauche du livre, un peu en biais, sur un parchemin déchiré", a.mien.r <= a.page.l + 14 /* penché, son coin passe sous la page (rogné) */ && a.mien.l >= -1 && Math.abs(a.mien.angle) > 2 && /polygon/.test(a.mien.clip) && a.mien.t > a.page.t, `${a.mien.l.toFixed(0)} → ${a.mien.r.toFixed(0)} (page ${a.page.l.toFixed(0)}), ${a.mien.angle.toFixed(1)}°`);
  const c = await centre('#grimoire-suite-2 .nom-livre[data-nom="Varos"]');
  await p.mouse.click(c.x, c.y);
  await p.waitForTimeout(800);
  const b2 = await papiers();
  verifier("un nom touché (Varos) : un autre papier sort par-dessus", b2.vu.sortie && b2.vu.nom === "Varos" && b2.vu.z > b2.mien.z && b2.mien.sortie, JSON.stringify({ vu: b2.vu.nom, z: [b2.mien.z, b2.vu.z] }));
  verifier("… légèrement décalé, penché autrement (on voit qu'ils se superposent)", Math.abs(b2.vu.t - b2.mien.t) > 5 && Math.abs(b2.vu.angle - b2.mien.angle) > 3, `Δhaut ${(b2.vu.t - b2.mien.t).toFixed(0)} px, ${b2.mien.angle.toFixed(1)}° / ${b2.vu.angle.toFixed(1)}°`);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v306_papiers.png" });
  const h = await centre('#grimoire-suite-2 .nom-heros[data-nom="Lyra"]');
  await p.mouse.click(h.x, h.y);
  await p.waitForTimeout(700);
  verifier("un nom de héros (en gras) se touche aussi : Lyra", (await papiers()).vu.nom === "Lyra Sombreval");
  await p.mouse.click(600, 20);
  await p.waitForTimeout(800);
  const d = await papiers();
  verifier("un toucher ailleurs : le papier du nom rentre, le sien reste", !d.vu.sortie && d.mien.sortie);
  await p.evaluate(() => window.grimoireAllerIndex());
  await attendreQue(async () => (await page()) === 3, 5000);
  await p.waitForTimeout(900);
  verifier("hors du récit (l'index), son papier rentre", !(await papiers()).mien.sortie);
});

// =========================================================================
titre("5. LA FIN DU LIVRE : DES PAGES VIERGES, ET LE LIVRE NE SE REFERME JAMAIS PAR LA FIN");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => { const v = [...document.querySelectorAll("#grimoire-livre .page-vierge")]; const dos = document.getElementById("grimoire-page-5");
    return { n: v.length, vides: v.every(x => !x.textContent.trim()), avantDos: v.every(x => x.compareDocumentPosition(dos) & Node.DOCUMENT_POSITION_FOLLOWING), total: window.grimoireEtat().nbPages }; });
  verifier("six pages vierges, avant la quatrième de couverture", r.n === 6 && r.vides && r.avantDos, JSON.stringify(r));
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.turnToPage(window.grimoireEtat().nbPages - 3));
  await p.waitForTimeout(400);
  const d = await p.evaluate(() => { const r = document.getElementById("grimoire-livre").getBoundingClientRect(); return { x: r.right - 25, y: r.top + r.height * 0.8, w: r.width / 2 }; });
  await p.mouse.move(d.x, d.y); await p.mouse.down();
  for (let i = 1; i <= 20; i++) { await p.mouse.move(d.x - d.w * 1.6 * i / 20, d.y - 8 * i / 20); await p.waitForTimeout(20); }
  await p.mouse.up();
  await p.waitForTimeout(1400);
  const f = await p.evaluate(() => ({ ici: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), n: window.grimoireEtat().nbPages, ouvert: window.grimoireEtat().ouvert }));
  verifier("la dernière double page vierge : on ne peut pas la tourner, le livre reste ouvert", f.ici === f.n - 3 && f.ouvert, JSON.stringify(f));
  // L'avant-dernière, elle, se tourne (vers une page vierge).
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.turnToPage(window.grimoireEtat().nbPages - 5));
  await p.waitForTimeout(400);
  await p.mouse.move(d.x, d.y); await p.mouse.down();
  for (let i = 1; i <= 20; i++) { await p.mouse.move(d.x - d.w * 1.6 * i / 20, d.y - 8 * i / 20); await p.waitForTimeout(20); }
  await p.mouse.up();
  await p.waitForTimeout(1400);
  verifier("… la précédente se tourne : une page vierge de plus", (await page()) === f.n - 3);
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.turnToPage(9));
  await p.waitForTimeout(400);
});

// =========================================================================
titre("6. LE COMBAT : UN SEUL LEADER ; UN COMBAT SEULEMENT SUR UN ACTE AGRESSIF ÉVIDENT");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const res = { tirages: 0, plusDUn: 0, deuxChefs: 0, deuxChefsUn: 0, fuyards: 0, fuyardsUn: 0, releveAvecChef: 0 };
    for (const n of [1, 2, 3, 4, 5]) for (let i = 0; i < 300; i++) {
      let t; try { t = window.tirerApparition(n); } catch (e) { continue; }
      if (!t) continue;
      res.tirages++;
      const tous = [...t.depart, ...t.renforts], chefs = tous.filter(m => m.leader).length;
      if (chefs > 1) res.plusDUn++;
      if (chefs && tous.some(m => m.releveEnLeader)) res.releveAvecChef++;
      if (t.nomCas === "Les deux chefs") { res.deuxChefs++; if (chefs === 1) res.deuxChefsUn++; }
      if (t.nomCas === "Les éclaireurs qui fuient") { res.fuyards++; if (chefs === 1) res.fuyardsUn++; }
    }
    return res;
  });
  verifier("1 500 rencontres tirées : jamais plus d'un leader", r.tirages > 1000 && r.plusDUn === 0, JSON.stringify(r));
  verifier("« Les deux chefs » et « Les éclaireurs qui fuient » : un seul leader", r.deuxChefs > 0 && r.deuxChefsUn === r.deuxChefs && r.fuyards > 0 && r.fuyardsUn === r.fuyards);
  verifier("un leader déjà là : personne ne se relèvera en chef", r.releveAvecChef === 0);
  const src = lire("combat_rp.js");
  const prompt = (src.match(/const PROMPT_COMBAT = `([\s\S]*?)`;/) || [])[1] || "";
  verifier("MIA_COMBAT : un combat seulement sur un ACTE AGRESSIF ÉVIDENT", /ACTE AGRESSIF ÉVIDENT/.test(prompt) && /vraie intention de se battre/.test(prompt));
  verifier("… des ennemis menaçants se marchandent, se soudoient, s'évitent : pas de combat", /marchander/.test(prompt) && /soudoyer/.test(prompt) && /barrent la route, sortent leurs armes/.test(prompt) && /sans avoir encore frappé/.test(prompt));
});

await section(async () => {
  const CE = await import(path.join(RACINE, 'combat_etat.js'));
  const pur = (id, extra) => ({ id, nom: id, camp: "Ennemi", estMonstre: true, estIllusion: false, joueur: "", race: "", couleur: "", personnalite: "brutal", palier: "Normal",
    pv: 70, pvMax: 70, bouclier: 0, bouclierMax: 0, fatigue: 40, fatigueMax: 120, q: 3, r: 0, etats: [], aTerre: false,
    def: { esquive: 0, parade: 0, physique: 20, magique: 15, critique: 0 }, atouts: {}, equip: {}, mod: {}, stats: {}, ...extra });
  const etat = { format: 1, version: 3, manche: 1, phase: "Resolution", graine: 7, file: [], ordre: ["H1", "M1", "M2"],
    combattants: { H1: pur("H1", { camp: "Allié", estMonstre: false, q: 0, palier: "" }), M1: pur("M1", { releveEnLeader: true, pv: 6, q: 1 }), M2: pur("M2", { leader: true, q: 2 }) } };
  etat.combattants.M1.pv = 0;
  const etapes = CE.tomber(etat, "M1", "H1") || [];
  verifier("au combat : un leader debout, la créature mise KO tombe au lieu de se relever en chef", !etapes.some(e => e.type === "releveLeader") && !etat.combattants.M1.leader, etapes.map(e => e.type).join(","));
});

await section(async () => {
  const index = lire("index.html");
  const v = (re) => Number((index.match(re) || [])[1] || 0);
  verifier("versions", v(/grimoire\.js\?v=(\d+)"/) >= 9 && v(/grimoire\.css\?v=(\d+)"/) >= 8 && v(/grimoire_recit\.js\?v=(\d+)"/) >= 6 && v(/grimoire_recit\.css\?v=(\d+)"/) >= 5
           && v(/combat_etat\.js\?v=(\d+)"/) >= 46 && v(/apparitions\.js\?v=(\d+)"/) >= 3 && v(/combat_rp\.js\?v=(\d+)"/) >= 4 && v(/trace_combat\.js\?v=(\d+)"/) >= 211
           && Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]) >= 306 && JSON.parse(lire("version.json") || "{}").version >= 306);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
