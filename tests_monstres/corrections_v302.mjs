// v302 — LA CARTE DU MONDE DANS LE GRIMOIRE ; LE BOUTON DEV : ANCIEN / NOUVEAU ;
// LES BOÎTES DES ZONES DE CLIC SUR LA CARTE DU LIVRE.
//
// Nico : « nous allons maintenant raccorder la carte du monde. Quand on
// cliquera sur Carte du monde dans l'index, ça mènera à la bonne page. Crée
// aussi côté gauche, en biais droit, un marque-page avec le dessin au trait
// noir d'une terre, qui mènera à la carte. Sur cette double page, à gauche
// cette partie de la map (IMG_2203), à droite celle-là (IMG_2207) ; elles
// devront remplir tout l'espace si possible, et centrées. Dans le bouton DEV
// rouge, deux boutons : Ancien et Nouveau. Dans Nouveau, tous mes nouveaux
// outils, à commencer par l'outil des boîtes pour les zones de clic ; refais-
// moi pareil que tu m'avais fait. »
//
// Lancer : node tests_monstres/corrections_v302.mjs
// (IVALIS_RACINE=… pour un autre dossier ; V302_CAPTURES=dossier pour les captures.)
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
      update: (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d, tx: true }); docs()[r.chemin] = Object.assign({}, docs()[r.chemin] || {}, d); },
      set: (r, d) => { (window.__sets = window.__sets || []).push({ chemin: r.chemin, data: d, tx: true }); const a = docs()[r.chemin] || {}; docs()[r.chemin] = Object.assign({}, a, d, { Zones: Object.assign({}, a.Zones || {}, d.Zones || {}) }); } });
  export const increment = (k) => k; export const deleteField = () => null;
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const serverTimestamp = () => Date.now();
  export class FieldPath {} export const Timestamp = { now: () => Date.now() };
`;
const CAPTURES = process.env.V302_CAPTURES || "";
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
// Les IA (Gemini), simulées : le Narrateur lite, les annonces, le titre d'un chapitre.
const appelsIA = [];
let iaEnPanne = false;
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**/generativelanguage.googleapis.com/**', r => {
  const corps = JSON.parse(r.request().postData() || "{}");
  const sys = ((corps.systemInstruction || {}).parts || [{}])[0].text || "", txt = (((corps.contents || [])[0] || {}).parts || [{}])[0].text || "";
  appelsIA.push({ url: r.request().url(), sys, txt });
  if (iaEnPanne) return r.fulfill({ status: 500, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: '{"error":{"message":"panne"}}' });
  let rep = "Je vois Thorin lever sa chope bien haut ; il trinque, avec un sourire qui ne présage rien de bon, « à la santé de ce vieux grincheux de Varos ! »";
  if (/donnes leur titre aux chapitres/.test(sys)) rep = "La tournée du nain";
  else if (/annonce du jeu/.test(sys)) rep = "Le jour se lève sur la route, et je compte nos pas.";
  r.fulfill({ status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'},
    body: JSON.stringify({ candidates: [{ content: { parts: [{ text: rep }] } }], usageMetadata: { totalTokenCount: 120 } }) });
});
const IMG_G = fs.readFileSync(path.join(RACINE, "images/grimoire/couverture.webp")), IMG_D = fs.readFileSync(path.join(RACINE, "images/grimoire/page.webp"));
const imagesCarte = [];
await p.route('**/IMG_2203_gvfqfv.png', r => { imagesCarte.push("gauche"); r.fulfill({ status: 200, contentType: 'image/webp', body: IMG_G }); });
await p.route('**/IMG_2207_sz48ll.png', r => { imagesCarte.push("droite"); r.fulfill({ status: 200, contentType: 'image/webp', body: IMG_D }); });
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
  localStorage.setItem("ID_JOUEUR_COURANT", "J1"); localStorage.setItem("ivalis_GEMINI_API_KEY", "cle-banc");
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

const ZONE = (sel) => p.evaluate((sel) => { const z = window.ZONES_LIVRE[sel]; return z ? z.points.map(p => [p.x, p.y]) : null; }, sel);
const vers = (pt) => p.evaluate(([x, y]) => { const r = document.getElementById("grimoire-livre").getBoundingClientRect(); return { x: r.left + x * r.width / 1514, y: r.top + y * r.height / 984 }; }, pt);

// =========================================================================
titre("1. HORS PARTIE : PAS DE CARTE DANS LE LIVRE ; LE MARQUE-PAGE DE LA TERRE, ÉTEINT");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const m = document.getElementById("grimoire-marque-carte"), p = document.getElementById("grimoire-marque-recit");
    return { n: window.grimoireEtat().nbPages, existe: !!m, inactif: m && m.classList.contains("inactif"), globe: !!(m && m.querySelector("svg.dessin-terre circle")),
             traits: m ? m.querySelectorAll("svg path").length : 0, encre: m ? getComputedStyle(m.querySelector("svg circle")).stroke : "",
             apresPlume: m && p ? m.getBoundingClientRect().left - p.getBoundingClientRect().left : 0, transform: m ? getComputedStyle(m).transform : "" };
  });
  verifier("hors partie, le livre n'a pas la carte (6 pages, + 6 vierges en v306)", r.n === 12, String(r.n));
  // v312 — Nico : « vire le marque-page qui amène à la carte du monde » (le sommaire y mène).
  verifier("v312 : plus de marque-page de la terre", !r.existe);
});

// =========================================================================
titre("2. EN PARTIE : L'INDEX ET LE MARQUE-PAGE MÈNENT À LA DOUBLE PAGE DE LA CARTE");
// =========================================================================
await section(async () => {
  await cliquer("#grimoire-btn-charger");
  await p.waitForTimeout(700);
  await cliquer('#grimoire-liste-parties [data-id="P1"]');
  await p.waitForTimeout(150);
  await p.fill("#grimoire-mdp-partie", "sel");
  await cliquer("#grimoire-valider-partie");
  await p.waitForTimeout(1300);
  await relayer([], true);
  await attendreQue(async () => (await page()) === 5, 4000);   // v304 : le livre tourne jusqu'à la carte
  const e = await p.evaluate(() => ({ n: window.grimoireEtat().nbPages, actif: !document.getElementById("grimoire-marque-page").classList.contains("inactif"), page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex() }));
  verifier("en partie : la double page de la carte entre dans le livre, le marque-page s'allume", e.n === 18 && e.actif && e.page === 5, JSON.stringify(e));   // v304 : la partie s'ouvre sur la carte
  await p.evaluate(() => window.grimoireAllerIndex());
  await attendreQue(async () => (await page()) === 3, 3000);
  await p.waitForTimeout(400);
  await cliquer("#grimoire-index-carte");
  await attendreQue(async () => (await page()) === 5, 3000);
  await p.waitForTimeout(400);
  verifier("« Carte du monde » dans l'index : les pages tournent jusqu'à elle (5-6)", (await page()) === 5, String(await page()));
  const r = await p.evaluate(() => {
    const lis = (cote) => { const pg = document.getElementById("grimoire-carte-" + cote), img = pg.querySelector("img"), a = pg.getBoundingClientRect(), b = img.getBoundingClientRect(), st = getComputedStyle(img);
      return { src: img.getAttribute("src"), charge: img.complete && img.naturalWidth > 0, fit: st.objectFit, pos: st.objectPosition, ecart: Math.max(Math.abs(a.left - b.left), Math.abs(a.right - b.right), Math.abs(a.top - b.top), Math.abs(a.bottom - b.bottom)) }; };
    return { g: lis("gauche"), d: lis("droite") };
  });
  verifier("à gauche la partie de la carte IMG_2203, à droite IMG_2207", /IMG_2203_gvfqfv\.png$/.test(r.g.src) && /IMG_2207_sz48ll\.png$/.test(r.d.src) && r.g.charge && r.d.charge, `${r.g.src.split("/").pop()} | ${r.d.src.split("/").pop()}`);
  verifier("elles remplissent la page autant que possible, centrées (sans se déformer)", [r.g, r.d].every(x => x.fit === "contain" && x.pos === "50% 50%" && x.ecart < 2), JSON.stringify([r.g.fit, r.g.pos, r.g.ecart.toFixed(1)]));
  verifier("les deux images se chargent dès l'entrée en partie", imagesCarte.includes("gauche") && imagesCarte.includes("droite"), imagesCarte.join(","));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v302_carte.png" });
  await p.evaluate(() => window.grimoireAllerIndex());
  await p.waitForTimeout(900);
  // (v312 : plus de marque-page de la terre ; le sommaire suffit)
  await p.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit());
  await p.waitForTimeout(1000);
  verifier("le récit suit (son chapitre commence maintenant page 9)", (await page()) === 9, String(await page()));
});

// =========================================================================
titre("3. LE BOUTON DEV ROUGE : DEUX ONGLETS, ANCIEN ET NOUVEAU");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { localStorage.setItem("ivalis_DEV_MODE", "on"); localStorage.removeItem("ivalis_DEV_ONGLET"); window.actualiserRegionsDev(); window.confirm = () => true; });
  const bouton = await centre("#btn-regions-dev");
  await p.mouse.click(bouton.x, bouton.y);
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const pop = document.getElementById("popup-regions-dev"), rp = pop.getBoundingClientRect(), rb = document.getElementById("btn-regions-dev").getBoundingClientRect();
    const vu = (id) => { const el = document.getElementById(id); return !!el && !el.closest("[hidden]") && el.getBoundingClientRect().height > 0; };
    return { ouverte: getComputedStyle(pop).display === "block", onglets: [...document.querySelectorAll("#dev-onglets .dev-onglet")].map(b => b.textContent.trim() + (b.classList.contains("choisi") ? "*" : "")),
             nouveau: vu("btn-zones-livre-nouvelle"), ancien: vu("btn-regions-nouvelle"), dessous: rp.top > rb.bottom, dansEcran: rp.top >= 0 && rp.bottom <= innerHeight + 1 };
  });
  verifier("le bouton rouge ouvre sa popup, vers le bas (les boutons sont en haut)", r.ouverte && r.dessous && r.dansEcran, JSON.stringify(r));
  verifier("deux onglets : Ancien, Nouveau (Nouveau d'abord)", r.onglets.join(",") === "Ancien,Nouveau*", r.onglets.join(","));
  verifier("dans Nouveau : l'outil des boîtes de la carte du livre", r.nouveau && !r.ancien);
  await cliquer("#btn-dev-ancien");
  await p.waitForTimeout(150);
  const a = await p.evaluate(() => ({ ancien: !document.getElementById("dev-onglet-ancien").hidden, vieux: !!document.querySelector("#dev-onglet-ancien #btn-regions-nouvelle") && !!document.querySelector("#dev-onglet-ancien #regions-dev-monde"), nouveau: document.getElementById("dev-onglet-nouveau").hidden }));
  verifier("dans Ancien : tous les anciens outils, tels quels", a.ancien && a.vieux && a.nouveau, JSON.stringify(a));
  await cliquer("#btn-dev-nouveau");
  await p.waitForTimeout(150);
  verifier("l'onglet choisi est retenu", (await p.evaluate(() => localStorage.getItem("ivalis_DEV_ONGLET"))) === "nouveau");
});

// =========================================================================
titre("4. LES BOÎTES DES ZONES DE CLIC, SUR LA DOUBLE PAGE DE LA CARTE (COMME AVANT)");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.__sets = []; window.__majs = []; });
  await cliquer("#btn-zones-livre-nouvelle");
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    const c = document.getElementById("calque-zones-livre"), l = document.getElementById("grimoire-livre").getBoundingClientRect(), cr = c.getBoundingClientRect();
    return { page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), visible: c.classList.contains("visible"), edition: c.classList.contains("edition"), cale: Math.abs(cr.left - l.left) + Math.abs(cr.width - l.width) + Math.abs(cr.height - l.height),
             numeros: [...c.querySelectorAll(".region-numero")].map(t => t.textContent), poignees: c.querySelectorAll(".region-poignee").length,
             info: document.getElementById("zones-livre-selection").textContent, total: document.getElementById("zones-livre-total").textContent, coche: document.getElementById("case-zones-livre-visibles").checked,
             tx: (window.__sets || []).some(s => s.tx && s.chemin === "Carte_Livre/Zones" && s.data.Prochain_Numero === 2 && s.data.Zones["1"]) };
  });
  verifier("« + Nouvelle boîte » : le livre va à la carte, la boîte n° 1 y naît, affichée", r.page === 5 && r.visible && r.edition && r.numeros.join(",") === "1" && r.poignees === 4 && r.coche, JSON.stringify(r));
  verifier("le calque des boîtes est posé exactement sur la double page", r.cale < 2, r.cale.toFixed(1));
  verifier("son numéro est tiré dans une transaction (Carte_Livre/Zones)", r.tx);
  verifier("la popup dit la sélection et le total", r.info === "Boîte n° 1 sélectionnée · 4 points" && r.total === "1 boîte sur la carte du livre", `${r.info} | ${r.total}`);
  const z0 = await ZONE(1);
  verifier("elle naît rectangle, sur la page de gauche", z0 && z0.length === 4 && z0.every(([x]) => x < 757), JSON.stringify(z0));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v302_boites.png" });
  // Glisser la boîte : elle se déplace (et s'enregistre).
  const c0 = await vers([(z0[0][0] + z0[2][0]) / 2, (z0[0][1] + z0[2][1]) / 2]);
  await p.mouse.move(c0.x, c0.y); await p.mouse.down();
  for (let i = 1; i <= 8; i++) { await p.mouse.move(c0.x + 12 * i, c0.y + 6 * i); await p.waitForTimeout(16); }
  await p.mouse.up();
  await p.waitForTimeout(200);
  const z1 = await ZONE(1);
  const dx = z1[0][0] - z0[0][0], dy = z1[0][1] - z0[0][1];
  const enreg = await p.evaluate(() => (window.__sets || []).filter(s => !s.tx && s.chemin === "Carte_Livre/Zones").slice(-1)[0]);
  verifier("glissée, elle se déplace tout entière, et s'enregistre", dx > 50 && dy > 25 && z1.every((pt, i) => Math.abs(pt[0] - z0[i][0] - dx) < 2) && enreg && JSON.stringify(enreg.data.Zones["1"].Points.map(p => [p.x, p.y])) === JSON.stringify(z1), `${dx}, ${dy}`);
  verifier("… et la page ne tourne pas (le geste est pour la boîte)", (await page()) === 5);
  // Un coin s'étire.
  const coin = await vers(z1[2]);
  await p.mouse.move(coin.x, coin.y); await p.mouse.down();
  for (let i = 1; i <= 6; i++) { await p.mouse.move(coin.x + 8 * i, coin.y + 7 * i); await p.waitForTimeout(16); }
  await p.mouse.up();
  await p.waitForTimeout(200);
  const z2 = await ZONE(1);
  verifier("un coin tiré s'étire (les autres restent)", z2[2][0] > z1[2][0] + 20 && z2[2][1] > z1[2][1] + 20 && JSON.stringify(z2[0]) === JSON.stringify(z1[0]), JSON.stringify(z2[2]));
  // Un bord touché : un point de plus ; un double-clic sur un point : il s'en va.
  const milieu = await vers([(z2[0][0] + z2[1][0]) / 2, (z2[0][1] + z2[1][1]) / 2]);
  await p.mouse.click(milieu.x, milieu.y);
  await p.waitForTimeout(200);
  verifier("un clic sur un bord ajoute un point", (await ZONE(1)).length === 5, String((await ZONE(1)).length));
  const z3 = await ZONE(1);
  const pt = await vers(z3[1]);
  await p.mouse.dblclick(pt.x, pt.y);
  await p.waitForTimeout(200);
  verifier("un double-clic sur un point l'enlève", (await ZONE(1)).length === 4, String((await ZONE(1)).length));
  // Les numéros ne resservent jamais.
  await cliquer("#btn-zones-livre-nouvelle");
  await p.waitForTimeout(400);
  verifier("une seconde boîte : le n° 2", (await p.evaluate(() => Object.keys(window.ZONES_LIVRE).join(","))) === "1,2");
  await cliquer("#btn-zones-livre-supprimer");
  await p.waitForTimeout(300);
  const sup = await p.evaluate(() => ({ cles: Object.keys(window.ZONES_LIVRE).join(","), base: (window.__majs || []).some(m => m.chemin === "Carte_Livre/Zones" && "Zones.2" in m.data) }));
  verifier("« Supprimer cette boîte » l'efface (de la base aussi)", sup.cles === "1" && sup.base, JSON.stringify(sup));
  await cliquer("#btn-zones-livre-nouvelle");
  await p.waitForTimeout(400);
  verifier("la suivante prend le n° 3 : un numéro ne resert pas", (await p.evaluate(() => Object.keys(window.ZONES_LIVRE).join(","))) === "1,3");
  // Ce qu'un autre poste écrit arrive par l'écoute.
  await p.evaluate(() => window.GRIMOIRE_CARTE.appliquer({ Prochain_Numero: 9, Zones: { "7": { Numero: 7, Points: [{ x: 900, y: 300 }, { x: 1100, y: 300 }, { x: 1100, y: 450 }, { x: 900, y: 450 }] } } }));
  await p.waitForTimeout(150);
  verifier("les boîtes écrites ailleurs s'affichent (page de droite aussi)", (await p.evaluate(() => [...document.querySelectorAll("#calque-zones-livre .region-numero")].map(t => t.textContent).join(","))) === "7");
  // Boîtes masquées : plus d'édition ; ailleurs dans le livre, le calque se cache.
  await p.evaluate(() => { const c = document.getElementById("case-zones-livre-visibles"); c.checked = false; c.dispatchEvent(new Event("change")); });
  await p.waitForTimeout(150);
  const m = await p.evaluate(() => { const c = document.getElementById("calque-zones-livre"), f = c.querySelector(".region-forme"); return { edition: c.classList.contains("edition"), clic: f ? getComputedStyle(f).pointerEvents : "", poignees: c.querySelectorAll(".region-poignee").length }; });
  // v308 : les boîtes mènent aux cartes régionales : invisibles, elles restent des liens.
  verifier("« Afficher les boîtes » décoché : invisibles, sans édition (v308 : elles restent des liens vers les régions)", !m.edition && m.poignees === 0, JSON.stringify(m));
  await p.evaluate(() => window.grimoireAllerIndex());
  await p.waitForTimeout(1000);
  verifier("ailleurs dans le livre, le calque de la carte se cache", !(await p.evaluate(() => document.getElementById("calque-zones-livre").classList.contains("visible"))));
});

// =========================================================================
titre("5. RETOUR AU MENU : LE LIVRE PERD LA CARTE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.confirmerRetourMenu());
  await p.waitForTimeout(1300);
  const s = await p.evaluate(() => ({ n: window.grimoireEtat().nbPages, terre: document.getElementById("grimoire-marque-page").classList.contains("inactif") }));
  verifier("le livre revient à 6 pages (+ 6 vierges), le marque-page de la terre s'éteint", s.n === 12 && s.terre, JSON.stringify(s));
  const index = lire("index.html");
  const v = (re) => Number((index.match(re) || [])[1] || 0);
  verifier("la carte dans son propre fichier (grimoire_carte.js, .css), après le récit", index.indexOf('src="grimoire_carte.js?v=') > index.indexOf('src="grimoire_recit.js?v=') && /grimoire_carte\.css\?v=\d+/.test(index));
  verifier("versions", v(/grimoire\.js\?v=(\d+)"/) >= 6 && v(/grimoire\.css\?v=(\d+)"/) >= 5 && v(/grimoire_recit\.js\?v=(\d+)"/) >= 3 && v(/trace_combat\.js\?v=(\d+)"/) >= 207
           && Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]) >= 302 && JSON.parse(lire("version.json") || "{}").version >= 302);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
