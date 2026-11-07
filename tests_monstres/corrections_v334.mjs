// v334 — LA LOUPE DES CARTES DU LIVRE : ELLE SORT DU COIN HAUT DROIT SUR LES CARTES ; TOUCHÉE, ELLE
// GLISSE AU CENTRE, ON PLONGE DANS SON VERRE, LA CARTE S'OUVRE EN GRAND (PAPIER FLOU, ZOOM, CROIX,
// POST-IT DU VOYAGE) ; LA CROIX JOUE L'ANIMATION À L'ENVERS.
//
// Lancer : node tests_monstres/corrections_v334.mjs   (V334_CAPTURES=dossier pour les images)
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
  export const query = (c, ...w) => ({ col: c.col, w: w.filter(x => x && x.champ) }); export const where = (champ, op, val) => ({ champ, op, val }); export const orderBy = () => ({}); export const limit = () => ({});
  export const getDocs = async (c) => { const l = Object.entries(docs()).filter(([k]) => c && c.col && k.startsWith(c.col + "/") && k.split("/").length === 2)
      .filter(([, d]) => (c.w || []).every(w => w.op === "in" ? w.val.includes(d[w.champ]) : d[w.champ] === w.val)).map(([k, d]) => ({ id: k.split("/").pop(), data: () => d }));
    return { forEach(f) { l.forEach(f); }, docs: l, empty: !l.length, size: l.length }; };
  export const setDoc = async (r, d) => { docs()[r.chemin] = d; (window.__sets = window.__sets || []).push({ chemin: r.chemin, data: d }); };
  export const updateDoc = async (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d }); docs()[r.chemin] = Object.assign({}, docs()[r.chemin] || {}, d); };
  export const deleteDoc = async (r) => { (window.__suppr = window.__suppr || []).push(r.chemin); delete docs()[r.chemin]; };
  export const addDoc = async (c, d) => { (window.__ajouts = window.__ajouts || []).push({ col: c.col, data: d }); const id = "A" + window.__ajouts.length; docs()[c.col + "/" + id] = d; return { id }; };
  export const onSnapshot = () => () => {}; export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
  export const runTransaction = async (_db, f) => f({ get: async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => d || {} }; },
      update: (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d, tx: true }); docs()[r.chemin] = Object.assign({}, docs()[r.chemin] || {}, d); } });
  export const increment = (k) => k; export const deleteField = () => null;
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const serverTimestamp = () => Date.now();
  export class FieldPath {} export const Timestamp = { now: () => Date.now() };
`;
const CAPTURES = process.env.V334_CAPTURES || "";
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
// La loupe (le banc n'a pas Internet) : dessinée sur place, aux mesures de l'image de Nico
// (2416 × 1135, le verre centré en 567,8 ; 563,5, de rayon 433), fond transparent.
const LOUPE_IMG = await (async () => { const pg = await b.newPage(); const u = await pg.evaluate(() => { const c = document.createElement("canvas"); c.width = 2416; c.height = 1135;
  const x = c.getContext("2d"); x.strokeStyle = "#b08a4a"; x.lineWidth = 90; x.beginPath(); x.arc(567.8, 563.5, 433 + 45, 0, 7); x.stroke();
  x.fillStyle = "#2a1a0e"; x.fillRect(1050, 470, 1330, 180); x.fillStyle = "#b08a4a"; x.fillRect(930, 500, 140, 120); return c.toDataURL("image/png"); });
  await pg.close(); return Buffer.from(u.split(",")[1], "base64"); })();
let loupeDemandee = 0;
const p = await b.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
// Les IA (Gemini), simulées : le Narrateur lite, les annonces, le titre d'un chapitre.
const appelsIA = [];
let iaEnPanne = false, refusPlume = false, panneCle1 = false;
await p.route('**', r => { const u = r.request().url();
  if (u.startsWith(base)) return r.continue();
  if (/IMG_2235_e1zblf/.test(u)) { loupeDemandee++; return r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: LOUPE_IMG }); }
  if (/BG_tjiigl/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: TABLE });
  if (/res\.cloudinary\.com\/.*IMG_(1894|1892|1900|1893|1897|1903|1979|2189|1984|1977|1981|2229|2230|2231)_/.test(u)) { imagesDemandees.push(u); return r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: /IMG_1893|IMG_1903|IMG_2231/.test(u) ? CARTE_PAYSAGE : CARTE_PORTRAIT }); }
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

const L = () => p.evaluate(() => {
  const ld = window.LOUPE_CARTES, b = document.getElementById("loupe-bouton"), e = document.getElementById("loupe-ecran");
  const vue = document.getElementById("vue-carte-region");
  return { etat: ld && ld.etat(), cible: ld && ld.cible(), bouton: !!b, cachee: !!b && b.classList.contains("cachee"),
           visible: !!e && e.classList.contains("visible"), ouverte: !!e && e.classList.contains("ouverte"),
           vueParent: vue && vue.parentNode && (vue.parentNode.id || vue.parentNode.className), enGrand: !!window.carteRegionaleEnGrand && window.carteRegionaleEnGrand() };
});
const imageBouton = () => p.evaluate(() => { const i = document.querySelector("#loupe-bouton img"); if (!i) return null; const r = i.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, vw: innerWidth }; });
const clicLoupe = async () => { const r = await p.evaluate(() => { const ld = window.LOUPE_CARTES, c = ld.LOUPE, img = document.querySelector("#loupe-bouton img");
  // le centre du verre, à l'écran
  const m = new DOMMatrix(getComputedStyle(img).transform), o = getComputedStyle(img).transformOrigin.split(" ").map(parseFloat);
  const w = 600, h = 600 * c.h / c.l, px = c.cx * w - o[0], py = c.cy * h - o[1];
  const q = m.transformPoint(new DOMPoint(px, py)); return { x: q.x + o[0], y: q.y + o[1] }; }); await p.mouse.click(r.x, r.y); return r; };

// =========================================================================
titre("1. LA LOUPE AU REPOS : SUR LES CARTES DU LIVRE, PAS AILLEURS");
// =========================================================================
await section(async () => {
  verifier("loupe_cartes.js est chargé, l'image de Nico demandée", !!(await p.evaluate(() => window.LOUPE_CARTES)) && /IMG_2235_e1zblf/.test(await p.evaluate(() => window.LOUPE_CARTES.IMAGE_LOUPE)));
  await attendreQue(() => p.evaluate(() => window.GRIMOIRE_REGIONS.regions().length === 4), 6000);
  await pose();
  // le sommaire : pas de loupe
  await p.evaluate(() => window.GRIMOIRE.allerALaPage(3)); await p.waitForTimeout(1500); await pose(); await p.waitForTimeout(400);
  verifier("sur le sommaire, la loupe est rangée (hors de l'écran)", (await L()).cachee, JSON.stringify(await L()));
  // la carte du monde : elle sort
  await p.evaluate(() => window.GRIMOIRE.allerALaCarte()); await p.waitForTimeout(1500); await pose(); await p.waitForTimeout(900);
  const a = await L(), ib = await imageBouton();
  verifier("sur la carte du monde, la loupe sort", !a.cachee && a.bouton, JSON.stringify(a));
  verifier("…dans le coin haut droit, son manche dépasse de l'écran", !!ib && ib.x + ib.w > ib.vw && ib.y < 200 && ib.x > ib.vw * 0.75, JSON.stringify(ib));
  verifier("…et l'image de la loupe est bien chargée", loupeDemandee > 0, String(loupeDemandee));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v334_monde_repos.png" });
});

// =========================================================================
titre("2. LA CARTE RÉGIONALE À LA LOUPE : ALLER, EN GRAND, ZOOM, RETOUR");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE.allerALaPage(window.GRIMOIRE_REGIONS.pageDuGroupe()));
  await p.waitForTimeout(2500); await monteeSur(5); await pose(); await p.waitForTimeout(900);
  verifier("sur la carte du désert, la loupe est là aussi", !(await L()).cachee, JSON.stringify(await L()));
  const avant = await vueDuLivre();
  await clicLoupe();
  await p.waitForTimeout(260);
  const pendant = await p.evaluate(() => { const v = document.querySelector(".loupe-verre"), i = document.querySelector(".loupe-image");
    return { clip: getComputedStyle(v).clipPath, image: getComputedStyle(i).transform, statique: getComputedStyle(document.getElementById("loupe-statique")).display, scene: getComputedStyle(document.querySelector(".loupe-scene")).transform }; });
  verifier("touchée, elle glisse : le verre (un cercle) découpe la carte grossie", /circle/.test(pendant.clip) && pendant.statique === "block" && pendant.scene !== "none", JSON.stringify(pendant));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v334_glisse.png" });
  await p.waitForTimeout(560);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v334_plongee.png" });
  await attendreQue(async () => (await L()).etat === "ouverte", 4000);
  const o = await L();
  verifier("puis la carte s'ouvre en grand", o.etat === "ouverte" && o.ouverte && o.cible && o.cible.type === "region" && o.cible.numero === 5, JSON.stringify(o));
  verifier("…la vue vivante (pions, villages, voyage) quitte sa page pour l'écran", o.enGrand && o.vueParent === "loupe-plan", JSON.stringify(o));
  const g = await p.evaluate(() => { const v = document.getElementById("vue-carte-region").getBoundingClientRect(), c = window.cadrageCarteRegion(), im = document.getElementById("carte-region-image").getBoundingClientRect();
    const fl = getComputedStyle(document.querySelector(".loupe-papier.flou"));
    return { v: [v.left, v.top, v.width, v.height], zoom: c.zoom, base: c.base, im: [im.left, im.top, im.width, im.height], flou: fl.filter, opacite: fl.opacity, fond: fl.backgroundImage, vw: innerWidth, vh: innerHeight }; });
  verifier("…sur tout l'écran, la carte entière à sa taille de base", g.v[2] === g.vw && g.v[3] === g.vh && Math.abs(g.zoom - g.base) < 1e-6 && (Math.abs(g.im[3] - g.vh) < 2 || Math.abs(g.im[2] - g.vw) < 2), JSON.stringify(g));
  verifier("…en fond, la texture de page du livre, floutée", /page\.webp/.test(g.fond) && /blur/.test(g.flou) && Number(g.opacite) > 0.99, JSON.stringify(g));
  const ui = await p.evaluate(() => { const c = document.getElementById("loupe-croix"), pi = document.getElementById("loupe-postit"), r = c.getBoundingClientRect(), rp = pi.getBoundingClientRect();
    return { croix: [r.left, r.top, r.width], croixOpacite: getComputedStyle(c).opacity, traits: c.querySelectorAll("path").length, couleur: getComputedStyle(c.querySelector("path")).stroke,
             postit: [rp.top, rp.bottom, rp.left], postitOpacite: getComputedStyle(pi).opacity, pas: !!pi.querySelector(".dessin-pas"), inactif: pi.classList.contains("inactif"), vw: innerWidth }; });
  verifier("la croix noire, à la main, en haut à droite", Number(ui.croixOpacite) > 0.99 && ui.croix[0] > ui.vw - 120 && ui.croix[1] < 160 && ui.traits >= 2 && /rgb\(13, 9, 5\)/.test(ui.couleur), JSON.stringify(ui));
  verifier("le post-it du voyage descend du haut de l'écran, les pas dessus", ui.pas && !ui.inactif && ui.postit[0] < 0 && ui.postit[1] > 40 && Number(ui.postitOpacite) > 0.99, JSON.stringify(ui));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v334_region_en_grand.png" });
  // Le zoom : la molette agrandit, jamais en dessous de la base.
  await p.mouse.move(600, 400);
  await p.mouse.wheel(0, -600); await p.waitForTimeout(200);
  const z1 = await p.evaluate(() => window.cadrageCarteRegion());
  verifier("en grand, la molette zoome", z1.zoom > z1.base * 1.5, JSON.stringify([z1.zoom, z1.base]));
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 900); await p.waitForTimeout(60); }
  const z2 = await p.evaluate(() => window.cadrageCarteRegion());
  verifier("…et le dézoom s'arrête à la taille de base", Math.abs(z2.zoom - z2.base) < 1e-6, JSON.stringify([z2.zoom, z2.base]));
  await p.mouse.wheel(0, -500); await p.waitForTimeout(200);
  // un doigt glisse la carte zoomée
  const z3 = await p.evaluate(() => window.cadrageCarteRegion());
  await p.mouse.move(600, 400); await p.mouse.down(); await p.mouse.move(520, 360, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(150);
  const z4 = await p.evaluate(() => window.cadrageCarteRegion());
  verifier("…un doigt glisse la carte zoomée (le livre n'y touche pas)", Math.abs(z4.panX - z3.panX) > 30 && (await page()) === (await p.evaluate(() => window.GRIMOIRE_REGIONS.pageDuGroupe())), JSON.stringify([z3.panX, z4.panX]));
  // Un point de la carte, à l'écran, retombe au bon endroit de l'image (terrains DEV, voyage).
  const pt = await p.evaluate(() => { const c = window.cadrageCarteRegion(), v = document.getElementById("vue-carte-region").getBoundingClientRect();
    const q = window.pointImageCarteRegion(v.left + c.panX + 100 * c.zoom, v.top + c.panY + 80 * c.zoom); return q; });
  verifier("pointImageCarteRegion reste juste en grand (outils DEV, voyage)", Math.abs(pt.x - 100) < 0.5 && Math.abs(pt.y - 80) < 0.5, JSON.stringify(pt));
  // Le post-it lance le voyage (le mode choix), et le relance pour l'annuler.
  await p.evaluate(() => { window.__voyage = 0; const f = window.basculerModeVoyage; window.basculerModeVoyage = function () { window.__voyage++; return f && f.apply(this, arguments); }; });
  await cliquer("#loupe-postit"); await p.waitForTimeout(300);
  verifier("le post-it lance un déplacement (le mode voyage)", (await p.evaluate(() => window.__voyage)) === 1);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v334_postit_choix.png" });
  await cliquer("#loupe-postit"); await p.waitForTimeout(200);
  // La croix : l'animation à l'envers.
  await cliquer("#loupe-croix");
  await p.waitForTimeout(250);
  const f1 = await L();
  verifier("la croix : la loupe se referme (l'animation à l'envers commence)", f1.etat === "fermeture" && !f1.ouverte && !f1.enGrand, JSON.stringify(f1));
  verifier("…la vue vivante est déjà rentrée dans sa page", /grimoire-livre/.test(f1.vueParent || ""), JSON.stringify(f1));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v334_retour.png" });
  await attendreQue(async () => (await L()).etat === "repos", 4000); await p.waitForTimeout(300);
  const f2 = await L(), apres = await vueDuLivre();
  verifier("…puis elle retourne dans son coin", f2.etat === "repos" && !f2.visible && !f2.cachee, JSON.stringify(f2));
  verifier("la carte retrouve sa page, à la même place et à sa taille", JSON.stringify(apres.place.map(x => x.toFixed(3))) === JSON.stringify(avant.place.map(x => x.toFixed(3))) && Math.abs(apres.zoom - apres.base) < 1e-6 && !apres.cachee,
           JSON.stringify({ avant: avant.place, apres: apres.place, zoom: apres.zoom, base: apres.base }));
  verifier("dans le livre, toujours pas de zoom", await p.evaluate(() => { const c = window.cadrageCarteRegion(); window.zoomerCarteRegion(2); return window.cadrageCarteRegion().zoom === c.zoom; }));
});

// =========================================================================
titre("3. LA CARTE DU MONDE À LA LOUPE : LES BOÎTES ET LE GROUPE SUIVENT");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE.allerALaCarte()); await p.waitForTimeout(2200); await pose(); await p.waitForTimeout(700);
  await clicLoupe();
  await attendreQue(async () => (await L()).etat === "ouverte", 4000);
  const o = await L();
  verifier("la carte du monde s'ouvre en grand", o.etat === "ouverte" && o.cible && o.cible.type === "monde", JSON.stringify(o));
  const r = await p.evaluate(() => { const pl = document.getElementById("loupe-planche"), z = document.getElementById("calque-zones-livre"), gr = document.getElementById("calque-groupe-livre");
    const rp = pl.getBoundingClientRect(), rz = z && z.getBoundingClientRect();
    return { imgs: [...pl.querySelectorAll(".loupe-moitie img")].map(i => i.getAttribute("src")), cartes: window.GRIMOIRE.IMAGES_CARTE,
             zones: z && z.parentNode.id, groupe: gr && gr.parentNode.id, rp: [rp.left, rp.top, rp.width, rp.height], rz: rz && [rz.left, rz.top, rz.width, rz.height], vw: innerWidth, vh: innerHeight }; });
  verifier("les deux images de la double page, posées comme dans le livre", r.imgs[0] === r.cartes.gauche && r.imgs[1] === r.cartes.droite, JSON.stringify(r.imgs));
  verifier("les boîtes de clic et le calque du groupe sont dans la carte en grand", r.zones === "loupe-planche" && r.groupe === "loupe-planche", JSON.stringify(r));
  verifier("…sur toute la planche, qui tient l'écran", JSON.stringify(r.rz.map(Math.round)) === JSON.stringify(r.rp.map(Math.round)) && (Math.abs(r.rp[2] - r.vw) < 1.5 || Math.abs(r.rp[3] - r.vh) < 1.5), JSON.stringify(r));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v334_monde_en_grand.png" });
  // Le zoom de la planche, et un point écran → livre (l'édition DEV des boîtes).
  await p.mouse.move(400, 300); await p.mouse.wheel(0, -700); await p.waitForTimeout(150);
  const pl = await p.evaluate(() => window.LOUPE_CARTES.planche());
  verifier("la molette zoome la carte du monde", pl.zoom > pl.base * 1.5, JSON.stringify(pl));
  const q = await p.evaluate(() => { const pl = window.LOUPE_CARTES.planche(); return window.pointZoneLivreDepuisEcran(pl.x + 700 * pl.zoom, pl.y + 300 * pl.zoom); });
  verifier("pointZoneLivreDepuisEcran suit le zoom (les boîtes DEV s'éditent en grand)", Math.abs(q.x - 700) < 1 && Math.abs(q.y - 300) < 1, JSON.stringify(q));
  for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 900); await p.waitForTimeout(50); }
  const pl2 = await p.evaluate(() => window.LOUPE_CARTES.planche());
  verifier("…le dézoom s'arrête à la taille de base", Math.abs(pl2.zoom - pl2.base) < 1e-6, JSON.stringify(pl2));
  // Toucher une région (la boîte 3, le désert) : le livre y va, et la loupe se range.
  const zone = await p.evaluate(() => { const g = document.querySelector('#calque-zones-livre .region[data-numero="3"] .region-forme'); const r = g.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(zone.x, zone.y);
  await p.waitForTimeout(3500); await pose(); await p.waitForTimeout(600);
  const apres = await L();
  verifier("toucher une région en grand : le livre y va, la loupe se range d'elle-même", apres.etat === "repos" && !apres.visible && (await p.evaluate(() => window.GRIMOIRE_REGIONS.montee())) === 5, JSON.stringify(apres));
  const calques = await p.evaluate(() => ["calque-zones-livre", "calque-groupe-livre"].map(id => document.getElementById(id) && document.getElementById(id).parentNode.className));
  verifier("…et les calques de la carte du monde sont rentrés dans le livre", calques.every(c => /grimoire-scene/.test(c || "")), JSON.stringify(calques));
});

// =========================================================================
titre("4. HORS DES CARTES ET HORS PARTIE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE.allerALaPage(window.GRIMOIRE.premiereDeLaSuite())); await p.waitForTimeout(2500); await pose(); await p.waitForTimeout(500);
  verifier("sur le récit, la loupe est rangée", (await L()).cachee, JSON.stringify(await L()));
  verifier("…et toucher le coin n'ouvre rien", (await p.evaluate(() => window.LOUPE_CARTES.ouvrir())) === false);
});

console.log(erreurs.length ? "\nErreurs de page : " + erreurs.slice(0, 5).join(" | ") : "");
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
