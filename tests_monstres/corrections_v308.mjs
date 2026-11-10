// v308 — LES CARTES RÉGIONALES DANS LE LIVRE : UNE DOUBLE PAGE PAR RÉGION, LA
// CARTE VIVANTE (VOYAGE, PIONS, VILLAGES, POI), LE LIVRE QUI SUIT LE GROUPE.
//
// Nico : « nous allons remettre les maps régionales avec le système de
// déplacement et tout ce qu'on avait fait. La map régionale va s'afficher sur une
// double page qui est à elle, côté page de droite ; côté gauche, le nom de la
// région. Pas d'effet de nuages, juste le défilement des pages. Les cartes
// régionales se trouvent sur les pages d'après la map globale. Quand la carte est
// en mode paysage, tu peux l'afficher en double page. » Ses réponses : une double
// page par région dans l'ordre des boîtes ; le titre à la plume en haut de la page
// gauche sur une carte en paysage ; pincement et molette pour zoomer, un doigt
// pour glisser la carte zoomée, sinon il tourne la page ; les fenêtres du voyage
// par-dessus le livre ; le livre suit le groupe et s'ouvre sur sa région ; les
// outils DEV régionaux dans « Nouveau » ; l'usure gardée.
//
// Lancer : node tests_monstres/corrections_v308.mjs
// (IVALIS_RACINE=… pour un autre dossier ; V308_CAPTURES=dossier pour les captures.)
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
const CAPTURES = process.env.V308_CAPTURES || "";
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

// =========================================================================
titre("1. UNE DOUBLE PAGE PAR RÉGION, DANS L'ORDRE DES BOÎTES, APRÈS LA CARTE DU MONDE");
// =========================================================================
await section(async () => {
  await attendreQue(() => p.evaluate(() => window.GRIMOIRE_REGIONS.regions().length === 4), 6000);
  await monteeSur(5);
  await pose();
  const r = await p.evaluate(() => ({ regions: window.GRIMOIRE_REGIONS.regions(), suite: window.GRIMOIRE.premiereDeLaSuite(), fiches: window.GRIMOIRE.pagesFiches().length, n: window.grimoireEtat().nbPages,
    pages: [...document.querySelectorAll("#grimoire-livre .page-region")].map(pg => ({ id: pg.id, cote: pg.classList.contains("gauche") ? "g" : "d", nom: (pg.querySelector(".region-nom") || {}).textContent || "", img: !!pg.querySelector("img.region-carte-img") })) }));
  verifier("quatre régions, rangées dans l'ordre des boîtes (1, 3, 7, 8), à partir de la page 7", JSON.stringify(r.regions.map(x => [x.zone, x.numero, x.page])) === "[[1,1,7],[3,5,9],[7,3,11],[8,7,13]]", JSON.stringify(r.regions.map(x => [x.zone, x.numero, x.page])));
  verifier("le nom de chaque région, à la plume, sur sa page de gauche", r.pages.filter(x => x.cote === "g").map(x => x.nom).join(" | ") === "La forêt des murmures | Le désert d'Etheria | Le mont Pletia | L'île aux marchés", r.pages.filter(x => x.cote === "g").map(x => x.nom).join(" | "));
  // (v322 : les aventuriers viennent entre les régions et le récit.)
  verifier("le récit vient après elles et les aventuriers (le sommaire page 15 + les fiches)", r.suite === 15 + r.fiches, `sommaire ${r.suite}, ${r.fiches} pages d'aventuriers, ${r.n} pages`);
  // (v331, Nico : « les maps régionales en pleine page de droite ») : plus de double page, même en paysage.
  verifier("v331 : toutes les cartes sur la page de droite, même en paysage (le désert, l'île)", r.regions.every(x => !x.paysage), r.regions.map(x => x.paysage).join(","));
});

// =========================================================================
titre("2. LA PARTIE CHARGÉE : LE LIVRE S'OUVRE SUR LA RÉGION DU GROUPE ; LA CARTE VIVANTE Y EST POSÉE");
// =========================================================================
await section(async () => {
  // v313 : le livre s'ouvre sur le sommaire (Nico) ; la carte du groupe est à sa page.
  await pose();
  verifier("v313 : la partie chargée, le livre s'ouvre sur le sommaire", (await page()) === 3, `page ${await page()}`);
  await attendreQue(() => p.evaluate(() => !!window.GRIMOIRE_REGIONS.pageDuGroupe()), 8000); await pose();
  await p.evaluate(() => window.GRIMOIRE.allerALaPage(window.GRIMOIRE_REGIONS.pageDuGroupe()));
  await p.waitForTimeout(2500);
  await monteeSur(5);
  await pose();
  await p.waitForTimeout(500);
  const v = await vueDuLivre();
  verifier("le groupe est dans le désert d'Etheria : sa double page (9) porte sa carte", (await page()) === 9 && v && v.numero === 5, `page ${await page()}`);
  verifier("la carte vivante (cartes_regionales.js) est posée dans le livre, sur la page de droite (v331)", v.parent === "grimoire-livre" && v.dansLeLivre && v.affichee && !v.cachee && v.place[0] > 0.5 && v.place[2] < 0.5, JSON.stringify(v.place.map(x => +x.toFixed(3))));
  verifier("… toute la carte tient dans sa place (à sa taille de page)", Math.abs(v.zoom - v.base) < 1e-6 && v.carte[2] <= v.carte[4] + 1 && v.carte[3] <= v.carte[5] + 1, JSON.stringify(v.carte.map(Math.round)));
  const t = await p.evaluate(() => { const el = document.querySelector("#region-titre-vivant .region-nom"); return el ? el.textContent : null; });
  verifier("v331 : plus de titre posé sur la carte (le nom est sur la page de gauche)", t === null, t);
  const pion = await p.evaluate(() => { const el = document.getElementById("pion-groupe-region"); if (!el) return null; const r = el.getBoundingClientRect(), v = document.getElementById("vue-carte-region").getBoundingClientRect();
    return { vu: getComputedStyle(el).display !== "none" && r.width > 0, dedans: r.left >= v.left && r.right <= v.right && r.top >= v.top && r.bottom <= v.bottom }; });
  verifier("le pion du groupe est sur la carte du livre", pion && pion.vu && pion.dedans, JSON.stringify(pion));
  verifier("aucun nuage : on y est venu en tournant les pages", (await p.evaluate(() => window.__nuages)) === 0);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v308_region_paysage.png" });
});

// =========================================================================
titre("3. LES DOIGTS SUR LA CARTE : ZOOMER, GLISSER ; À SA TAILLE, LE DOIGT TOURNE LA PAGE");
// =========================================================================
await section(async () => {
  const v0 = await vueDuLivre();
  const c = await p.evaluate(() => { const r = document.getElementById("vue-carte-region").getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + r.height * 0.5 }; });
  await p.mouse.move(c.x, c.y);
  await p.mouse.wheel(0, -600);
  await p.waitForTimeout(300);
  const v1 = await vueDuLivre();
  // (v331, Nico : « enlève la possibilité de zoom ») : la molette ne zoome plus ; un doigt tourne la page.
  verifier("v331 : la molette ne zoome plus (et la page ne tourne pas)", Math.abs(v1.zoom - v0.zoom) < 1e-6 && (await page()) === 9, `${v0.zoom.toFixed(3)} → ${v1.zoom.toFixed(3)}`);
  // (v331 : sans zoom, plus de carte zoomée à glisser.)
  await p.mouse.move(c.x, c.y);
  await p.mouse.wheel(0, 2400);
  await p.waitForTimeout(300);
  const v2 = await vueDuLivre();
  verifier("on ne dézoome pas plus loin que la page", Math.abs(v2.zoom - v2.base) < 1e-6, `${v2.zoom.toFixed(3)} / ${v2.base.toFixed(3)}`);
  // À sa taille : le doigt prend la page (bord droit de la carte, tiré vers la gauche).
  const d = await p.evaluate(() => { const r = document.getElementById("vue-carte-region").getBoundingClientRect(), l = document.getElementById("grimoire-livre").getBoundingClientRect(); return { x: r.right - 30, y: r.top + r.height * 0.6, w: l.width / 2 }; });
  await p.mouse.move(d.x, d.y); await p.mouse.down();
  let pendant = null;
  for (let i = 1; i <= 22; i++) { await p.mouse.move(d.x - d.w * 1.7 * i / 22, d.y - 6 * i / 22); await p.waitForTimeout(20); if (i === 12) pendant = await vueDuLivre(); }
  await p.mouse.up();
  await pose();
  await monteeSur(3);
  await p.waitForTimeout(500);
  verifier("à sa taille, le doigt tourne la page : la région suivante (le mont Pletia)", (await page()) === 11, String(await page()));
  verifier("pendant que la page tourne, la carte vivante se cache (l'image de la page tourne avec elle)", pendant && pendant.cachee, JSON.stringify(pendant && pendant.cachee));
  const v3 = await vueDuLivre();
  verifier("arrivée : la carte vivante du mont Pletia, sur la page de droite (portrait)", v3.numero === 3 && !v3.cachee && v3.place[0] > 0.5 && v3.place[2] < 0.5, JSON.stringify(v3.place.map(x => +x.toFixed(3))));
  verifier("… et pas de titre posé sur elle (le nom est sur la page de gauche)", !(await p.evaluate(() => !!document.getElementById("region-titre-vivant"))));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v308_region_portrait.png" });
});

// =========================================================================
titre("4. LA CARTE DU MONDE : SES BOÎTES MÈNENT AUX RÉGIONS ; ALLER ET REVENIR SANS NUAGES");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE.allerALaCarte());
  await pose();
  await attendreQue(() => p.evaluate(() => !window.carteRegionaleOuverte()), 5000);
  await p.waitForTimeout(400);
  verifier("sur la carte du monde, plus de carte régionale ouverte", (await page()) === 5 && !(await p.evaluate(() => window.carteRegionaleOuverte())));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v308_monde_bouton.png" });
  await p.evaluate(() => window.ACTIONS_ZONES_LIVRE[8]());
  await monteeSur(7);
  await pose();
  verifier("la boîte 8 (l'île aux marchés) : les pages défilent jusqu'à elle", (await page()) === 13 && (await p.evaluate(() => window.carteRegionaleOuverte())) === 7, String(await page()));
  const ok = await p.evaluate(() => window.ouvrirCarteRegionale(1));
  verifier("ouvrirCarteRegionale (le voyage l'appelle) : le livre va à la région, elle est ouverte", ok === true && (await page()) === 7 && (await p.evaluate(() => window.carteRegionaleOuverte())) === 1, `${ok} page ${await page()}`);
  const ferme = await p.evaluate(() => window.fermerCarteRegionale());
  verifier("fermerCarteRegionale : le livre revient à la carte du monde", ferme === true && (await page()) === 5 && !(await p.evaluate(() => window.carteRegionaleOuverte())));
  verifier("toujours aucun nuage", (await p.evaluate(() => window.__nuages)) === 0);
});

// =========================================================================
titre("5. LE VOYAGE : SON BOUTON SUR LES CARTES DU LIVRE ; LES OUTILS DEV DANS « NOUVEAU »");
// =========================================================================
await section(async () => {
  // v310 : Nico, « remplace le bouton de marche par un marque-page en haut à droite du livre » :
  // c'est lui qui sort sur les cartes du livre (le bouton se cache sur le livre).
  const bouton = () => p.evaluate(() => { const m = document.getElementById("grimoire-marque-marche"), b = document.getElementById("btn-voyage"), l = document.getElementById("grimoire-livre").getBoundingClientRect();
    if (!m) return null; const r = m.getBoundingClientRect();
    return { vu: !m.classList.contains("inactif"), aDroite: r.left > l.left + l.width * 0.8, haut: r.top < l.top, boutonCache: !b || getComputedStyle(b).display === "none" }; });
  await p.waitForTimeout(800);   // (il sort en 0,55 s)
  const surMonde = await bouton();
  verifier("sur la carte du monde : le marque-page de la marche sort, en haut à droite du livre (v310)", surMonde && surMonde.vu && surMonde.aDroite && surMonde.haut && surMonde.boutonCache, JSON.stringify(surMonde));
  await p.evaluate(() => window.ouvrirCarteRegionale(5));
  await pose();
  await p.waitForTimeout(400);
  verifier("sur une carte régionale : aussi", (await bouton()).vu);
  await p.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit());
  await pose();
  await p.waitForTimeout(500);
  verifier("dans le récit : pas de bouton de voyage, plus de carte régionale ouverte", !(await bouton()).vu && !(await p.evaluate(() => window.carteRegionaleOuverte())) && (await page()) >= 17, `page ${await page()}`);
  await p.evaluate(() => window.ouvrirCarteRegionale(5));
  await pose();
  await p.waitForTimeout(400);
  const dev = await p.evaluate(() => { const r = document.getElementById("regions-dev-carte"); return r ? { nouveau: !!r.closest("#dev-onglet-nouveau"), vu: r.style.display !== "none", nom: (document.getElementById("regions-dev-carte-nom") || {}).textContent } : null; });
  verifier("les outils de la carte régionale (usure, villages, terrains, groupe, téléport) sont dans « Nouveau », allumés", dev && dev.nouveau && dev.vu && /Le désert d'Etheria/.test(dev.nom || ""), JSON.stringify(dev));
  // Le mode voyage : un toucher sur la carte du livre propose une destination.
  const choisi = await p.evaluate(() => window.basculerModeVoyage(true));
  const m = await p.evaluate(() => { const r = document.getElementById("vue-carte-region").getBoundingClientRect(); return { x: r.left + r.width * 0.7, y: r.top + r.height * 0.45 }; });
  await p.mouse.click(m.x, m.y);
  await p.waitForTimeout(500);
  const prop = await p.evaluate(() => window.choixVoyageGroupe());
  verifier("le mode voyage sur la carte du livre : un toucher propose une destination", choisi && prop && prop.vue === "region" && prop.region === 5 && !!prop.proposition, JSON.stringify(prop && { vue: prop.vue, region: prop.region, proposition: !!prop.proposition }));
  await p.evaluate(() => window.basculerModeVoyage(false));
});

// =========================================================================
titre("6. QUITTER LA PARTIE : LES CARTES SORTENT DU LIVRE, LA VUE RETROUVE L'ÉCRAN DE JEU");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.confirmerRetourMenu && window.confirmerRetourMenu());
  await attendreQue(() => p.evaluate(() => !document.querySelector("#grimoire-livre .page-region")), 6000);
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => ({ pages: document.querySelectorAll("#grimoire-livre .page-region").length, vue: (document.getElementById("vue-carte-region") || {}).parentNode ? document.getElementById("vue-carte-region").parentNode.id : null,
    ouverte: window.carteRegionaleOuverte(), n: window.grimoireEtat().nbPages }));
  verifier("hors partie : plus de pages de région, la vue est rendue à l'écran de jeu", r.pages === 0 && r.vue === "ecran-jeu" && !r.ouverte && r.n === 12, JSON.stringify(r));
});

await section(async () => {
  const index = lire("index.html");
  const v = (re) => Number((index.match(re) || [])[1] || 0);
  verifier("versions (et le nouveau fichier du livre)", /grimoire_regions\.js\?v=\d+/.test(index) && /grimoire_regions\.css\?v=\d+/.test(index) && v(/grimoire\.js\?v=(\d+)"/) >= 11 && v(/cartes_regionales\.js\?v=(\d+)"/) >= 13
           && v(/voyage_groupe\.js\?v=(\d+)"/) >= 10 && Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]) >= 308 && JSON.parse(lire("version.json") || "{}").version >= 308);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
