// v346 — L'OMBRE EN TROP SUR LES CARTES ; LES IMAGES DU RÉCIT EN DOUBLE PAGE.
// Nico : « sur les pages des maps, une ombre vient se mettre en plus au milieu et disparaît
// dès que je sélectionne pour tourner » ; « les images qui spawn vont se mettre en pleine double
// page avec la transition en dégradé, comme les fonds des classes et des races ; sur la première
// page de droite suivante vierge, sans texte dessus ; à gauche, on écrit sur le dégradé » ;
// « elles apparaissent en fondu, préchargées » ; « le personnage et le décor derrière » ; « le
// style de la base » ; « un lieu seul si besoin » ; « les nouveaux PNJ : le procédé de l'avatar,
// en pleine page de droite » ; « le gros plan forcé : au hasard sur un des héros présents ».
//
// Lancer : node tests_monstres/corrections_v346.mjs
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
const CAPTURES = process.env.V346_CAPTURES || "";
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
// Le dessin d'un lieu (le banc n'a pas Cloudinary) : un toit rouge sur fond transparent.
const CALQUE = await (async () => { const pg = await b.newPage(); const u = await pg.evaluate(() => { const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d"); x.fillStyle = "#b03020"; x.fillRect(70, 90, 116, 90); x.beginPath(); x.moveTo(60, 95); x.lineTo(128, 40); x.lineTo(196, 95); x.fill(); return c.toDataURL("image/png"); });
  await pg.close(); return Buffer.from(u.split(",")[1], "base64"); })();
const calquesDemandes = [];
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
  if (/Villages_Regions\/calque_/.test(u)) { calquesDemandes.push(u.split('/').pop()); return r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: CALQUE }); }
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


const ici = () => p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex());
// Des lieux posés sur les cartes : deux dans la forêt (1), un dans le désert (5, là où est
// le groupe), un sur le mont Pletia (3), un sur l'île aux marchés (7).
await p.evaluate(() => {
  const lieu = (id, nom, carte, x, y) => ({ id, data: { Nom_Du_Lieu: nom, Carte_Regionale: carte, Position_Region: { x, y, taille: 0.06 }, Type_Lieu: "Village",
    URL_Calque_Region: `https://res.cloudinary.com/x/image/upload/v1/Villages_Regions/calque_${id}.png`, Calque_Plein: true } });
  window.appliquerVillagesDeLaBase([lieu("A1", "Sylvanis", 1, 0.3, 0.3), lieu("A2", "Myrtée", 1, 0.6, 0.7), lieu("B1", "Ostrakon", 5, 0.6, 0.4),
                                    lieu("C1", "Pletiane", 3, 0.5, 0.5), lieu("D1", "Agoréa", 7, 0.4, 0.6)]);
});
await attendreQue(() => p.evaluate(() => window.GRIMOIRE_REGIONS.regions().length === 4), 6000); await pose();
const regions = await p.evaluate(() => window.GRIMOIRE_REGIONS.regions());
const lieuxDesPages = () => p.evaluate(() => window.GRIMOIRE_REGIONS.regions().map(r => {
  const pg = document.getElementById(`grimoire-region-${r.zone}-droite`), k = pg && pg.querySelector(".region-calques"), cadre = pg && pg.querySelector(".region-carte-cadre");
  const fixe = k && k.querySelector(".region-lieux"), inst = k && k.querySelector(".instantane");
  const vus = (racine) => racine ? [...racine.querySelectorAll(".village-region")].map(v => ({ nom: v.textContent.trim(), img: (v.querySelector("img") || {}).getAttribute ? v.querySelector("img").getAttribute("src") : null,
    pret: !!v.querySelector("img") && v.querySelector("img").complete && v.querySelector("img").naturalWidth > 0 })) : [];
  return { numero: r.numero, page: r.page, cadreVisible: !!cadre && getComputedStyle(cadre).visibility !== "hidden" && getComputedStyle(pg).display !== "none",
           fixe: vus(fixe), fixeAffiche: !!fixe && getComputedStyle(fixe).display !== "none",
           instantane: vus(inst), pion: !!inst && !!inst.querySelector(".pion-groupe-region") && getComputedStyle(inst.querySelector(".pion-groupe-region")).display !== "none" };
}));


// =========================================================================
titre("1. CARTES : PAS D'OMBRE EN PLUS AU REPOS (LA MÊME QUE DOIGT POSÉ POUR TOURNER)");
// =========================================================================
// La pliure de la carte vivante ne couvre que la carte : sur le papier entre le dos et le
// cadre, seule l'ombre de la page. Au repos et au début d'une tourne, l'écran est le même.
const luminance = async (buf) => p.evaluate(async (b64) => { const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, img.width, img.height).data, out = [];
  for (let i = 0; i < d.length; i += 4) out.push((d[i] + d[i + 1] + d[i + 2]) / 3); return { w: img.width, h: img.height, l: out }; }, buf.toString("base64"));
for (const [num, idx, nom] of [[5, 1, "le désert (paysage)"], [3, 2, "le mont Pletia (portrait)"]]) {
  await section(async () => {
    for (let k = 0; k < 5; k++) { await p.evaluate((pg) => window.GRIMOIRE.allerALaPage(pg), regions[idx].page); await p.waitForTimeout(2500); await pose(); if (await monteeSur(num)) break; }
    await p.waitForTimeout(1500);
    const livre = await p.evaluate(() => { const r = document.getElementById("grimoire-livre").getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
    // La bande du milieu : du dos (50 %) au cadre de la carte, sur toute la hauteur.
    const clip = { x: Math.round(livre.x + livre.width * 0.44), y: Math.round(livre.y + livre.height * 0.04), width: Math.round(livre.width * 0.12), height: Math.round(livre.height * 0.92) };
    const repos = await luminance(await p.screenshot({ clip }));
    const cx = livre.x + livre.width * 0.97, cy = livre.y + livre.height * 0.95;
    await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx - 15, cy - 5, { steps: 3 }); await p.waitForTimeout(250);
    const etatTourne = await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getState());
    const tourne = await luminance(await p.screenshot({ clip }));
    await p.mouse.move(cx, cy, { steps: 3 }); await p.mouse.up(); await p.waitForTimeout(1500);
    // Par colonne : la part des points plus sombres au repos. Une ombre en plus assombrit toute
    // une bande (des dizaines de colonnes) ; le bord du cadre peut glisser d'un pixel (le lissage).
    const colonnes = [];
    for (let x = 0; x < repos.w; x++) { let n = 0; for (let y = 0; y < repos.h; y++) { const k = y * repos.w + x; if (repos.l[k] - tourne.l[k] < -12) n++; } colonnes.push(n / repos.h); }
    const sombres = colonnes.map((f, x) => [x, f]).filter(([, f]) => f > 0.3);
    verifier(`${nom} : au repos, la bande du milieu n'est pas plus sombre que doigt posé (pliure seule)`, etatTourne !== "read" && sombres.length <= 2,
             `${etatTourne}, ${sombres.length} colonne(s) plus sombre(s) sur ${repos.w} ${JSON.stringify(sombres.slice(0, 6))}`);
    verifier("…et la carte vivante n'a plus d'ombre de pliure (v373)", await p.evaluate(() => !document.getElementById("region-pliure")));
  });
}

// =========================================================================
titre("2. LE LIVRE : L'IMAGE SUR LA DOUBLE PAGE, LE TEXTE À GAUCHE SEULEMENT");
// =========================================================================
// Les images (le banc n'a pas Cloudinary) : un décor 16:9 avec une figure à droite ; un portrait détouré.
const dessinPng = async (w, h, f) => { const pg = await b.newPage(); const u = await pg.evaluate(([w, h, f]) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
  if (f === "scene") { const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, "#9fb7c9"); g.addColorStop(1, "#40506a"); x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = "#7a2a10"; x.beginPath(); x.arc(w * 0.72, h * 0.35, h * 0.1, 0, 7); x.fill(); x.fillRect(w * 0.66, h * 0.45, w * 0.12, h * 0.45); }
  else { x.fillStyle = "#2a4a7a"; x.beginPath(); x.arc(w / 2, h * 0.2, w * 0.18, 0, 7); x.fill(); x.fillRect(w * 0.3, h * 0.32, w * 0.4, h * 0.6); }
  return c.toDataURL("image/png"); }, [w, h, f]); await pg.close(); return Buffer.from(u.split(",")[1], "base64"); };
const SCENE = await dessinPng(1792, 1024, "scene"), PORTRAIT = await dessinPng(1024, 1792, "portrait");
let imagesServies = [];
let retenir = false, retenues = [];
await p.route(/res\.cloudinary\.com\/x\/image\/upload\/.*\/(Recit|PNJ)\//, async r => { imagesServies.push(r.request().url());
  if (retenir) await new Promise(ok => retenues.push(ok));
  r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: /PNJ\//.test(r.request().url()) ? PORTRAIT : SCENE }); });
const URL_ILL = (k) => `https://res.cloudinary.com/x/image/upload/q_auto,f_auto/v1/Recit/Illustrations/scene_${k}.png`;
const illD = (k) => ({ Url: URL_ILL(k), Ratio: 1.75, Format: "double-page", Sujet: "scene" });
const para = (n, mot) => Array.from({ length: n }, (_, i) => `${mot} ${i + 1} : la route serpente entre les collines brûlées, et nous marchons longtemps sous un ciel de cuivre, sans un mot.`).join("\n");
const narration = (id, t, texte, extra) => Object.assign({ idDoc: id, ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: texte, Timestamp: t }, extra || {});
const pagesDuRecit = () => p.evaluate(() => [...document.querySelectorAll(".page-suite")].map(el => ({
  i: Number(el.id.replace("grimoire-suite-", "")), cote: el.classList.contains("gauche") ? "gauche" : "droite",
  fond: (el.querySelector(".fond-recit") || { className: "" }).className.match(/\b(gauche|droite)\b/)?.[1] || "",
  fondE: (el.querySelector(".fond-recit") || { dataset: {} }).dataset.e || "",
  mots: el.querySelectorAll(".mot").length, entrees: [...new Set([...el.querySelectorAll(".mot")].map(m => m.dataset.e))],
  portrait: !!el.querySelector(".portrait-avatar"), croquis: !!el.querySelector(".croquis-recit")
})).sort((a, b) => a.i - b.i));
const allerA = async (i) => { await p.evaluate((i) => { const el = document.getElementById("grimoire-suite-" + i); if (el) window.GRIMOIRE_PAGEFLIP.turnToPage(window.GRIMOIRE.indexDe(el)); }, i); await p.waitForTimeout(500); };
await p.evaluate(() => window.GRIMOIRE.allerALaPage(5)); await p.waitForTimeout(1500); await pose();

await section(async () => {
  // Une courte narration (une page de gauche), son image, puis la narration d'après.
  await relayer([narration("n1", 1000, para(2, "Le premier")), narration("n1b", 1001, "", { Texte: para(1, "Rien"), Illustration: illD(1) }),
                 narration("n2", 1002, para(14, "La suite"))], true);
  await p.waitForTimeout(700);
  const pg = await pagesDuRecit();
  const avec = pg.filter(x => x.fondE === "n1b-croquis");
  const g = avec.find(x => x.fond === "gauche"), d = avec.find(x => x.fond === "droite");
  verifier("on écrit à gauche : l'image se pose sur cette double page (dégradé à gauche, l'image à droite)", !!g && !!d && g.cote === "gauche" && d.cote === "droite" && d.i === g.i + 1, JSON.stringify(pg.slice(0, 6)));
  verifier("…le texte s'écrit sur la page de gauche, par-dessus le dégradé", !!g && g.mots > 0);
  verifier("…rien ne s'écrit sur la page de droite de l'image", !!d && d.mots === 0);
  const suite = pg.filter(x => x.entrees.includes("n2"));
  verifier("…la suite reprend sur la page de gauche d'après (une fois la gauche pleine)", suite.length > 0 && suite.every(x => x.i !== (d && d.i)) && pg.some(x => d && x.i === d.i + 1 && x.entrees.includes("n2")),
           JSON.stringify(suite.map(x => x.i)));
  await allerA(g.i); await p.waitForTimeout(1500);
  // Le texte passe devant l'image : le mot est au-dessus (z-index), l'image dessous.
  const ordre = await p.evaluate((i) => { const el = document.getElementById("grimoire-suite-" + i), m = el.querySelector(".para-recit"), f = el.querySelector(".fond-recit");
    return { para: getComputedStyle(m).zIndex, fond: getComputedStyle(f).zIndex, masque: getComputedStyle(f).maskImage || getComputedStyle(f).webkitMaskImage }; }, g.i);
  verifier("…le texte passe devant l'image, voilée en dégradé comme les fonds des classes", Number(ordre.para) > Number(ordre.fond) && /linear-gradient/.test(ordre.masque), JSON.stringify(ordre));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v346_double_page.png" });
});

await section(async () => {
  // Une narration qui déborde sur la page de droite : l'image prend la double page suivante.
  await relayer([narration("m1", 2000, para(9, "Le long"), { Illustration: illD(2) }), narration("m2", 2001, para(3, "Après"))], true);
  await p.waitForTimeout(700);
  const pg = await pagesDuRecit();
  const avant = pg.filter(x => x.entrees.includes("m1"));
  const g = pg.find(x => x.fondE === "m1-croquis" && x.fond === "gauche"), d = pg.find(x => x.fondE === "m1-croquis" && x.fond === "droite");
  const derniere = Math.max(...avant.map(x => x.i));
  verifier("on écrit à droite : l'image attend la double page suivante (la première page de droite vierge)", !!g && !!d && pg.find(x => x.i === derniere).cote === "droite" && g.i === derniere + 1 && d.i === derniere + 2,
           JSON.stringify(pg.map(x => [x.i, x.cote, x.fond, x.mots])));
  verifier("…la suite s'écrit sur sa page de gauche, pas sur l'image", !!g && g.entrees.includes("m2") && d.mots === 0);
});

await section(async () => {
  // Le portrait d'un PNJ nouveau : une pleine page de droite ; l'ancien croquis à l'encre : sa demi-page.
  await relayer([narration("q1", 3000, para(2, "Varos"), { Portraits_PNJ: [{ Nom: "Varos", Url: "https://res.cloudinary.com/x/image/upload/q_auto,f_auto/v1/PNJ/varos.png", Ratio: 0.5714, Format: "avatar" }] }),
                 narration("q2", 3001, para(2, "Ensuite")),
                 narration("q3", 3002, para(1, "Jadis"), { Illustration: { Url: "https://res.cloudinary.com/x/image/upload/v1/Recit/Illustrations/croquis_vieux.png", Ratio: 1.5, Taille: 0.6 } })], true);
  await p.waitForTimeout(700);
  const pg = await pagesDuRecit();
  const por = pg.find(x => x.portrait);
  verifier("le portrait du PNJ nouveau : seul, en pleine page de droite", !!por && por.cote === "droite" && por.mots === 0, JSON.stringify(pg.map(x => [x.i, x.cote, x.portrait, x.mots])));
  verifier("…en face, la page de gauche garde son texte", !!por && pg.find(x => x.i === por.i - 1).entrees.includes("q1"));
  verifier("…et le texte d'après continue ailleurs (jamais sur le portrait)", pg.filter(x => x.entrees.includes("q2")).every(x => x.i !== por.i));
  verifier("un ancien croquis à l'encre garde sa demi-page", pg.some(x => x.croquis));
});

// =========================================================================
titre("3. LE FONDU ET LE PRÉCHARGEMENT");
// =========================================================================
await section(async () => {
  imagesServies = [];
  // Une image tout près, une autre loin dans le chapitre.
  await relayer([narration("r1", 4000, para(1, "Ici"), { Illustration: illD(10) }), narration("r2", 4001, para(80, "Loin"), {}), narration("r3", 4002, para(1, "Là-bas"), { Illustration: illD(11) }),
                 narration("r4", 4003, para(1, "Fin"))], true);
  await p.waitForTimeout(400);
  const pg = await pagesDuRecit();
  const premiere = pg.find(x => x.fondE === "r1-croquis"), loin = pg.find(x => x.fondE === "r3-croquis");
  await allerA(premiere.i); await p.waitForTimeout(1800);
  const etatImg = (i) => p.evaluate((i) => [...document.querySelectorAll(`#grimoire-suite-${i} .fond-recit img`)].map(im => ({ src: !!im.getAttribute("src"), pret: im.classList.contains("pret"), op: getComputedStyle(im).opacity, tr: getComputedStyle(im).transitionDuration })), i);
  const ici = await etatImg(premiere.i), loinAvant = await etatImg(loin.i);
  verifier("sur la page ouverte, l'image est chargée et posée (opacité 1)", ici.length === 1 && ici[0].src && ici[0].pret && ici[0].op === "1", JSON.stringify(ici));
  verifier("…loin dans le livre, l'image n'est pas encore demandée", loinAvant.length === 1 && !loinAvant[0].src && !imagesServies.some(u => /scene_11/.test(u)), JSON.stringify(loinAvant));
  // La double page d'avant celle de l'image lointaine : l'image se précharge (elle est prête avant qu'on tourne).
  await allerA(loin.i - 2); await p.waitForTimeout(1800);
  const prechargee = await etatImg(loin.i);
  verifier("une double page avant : l'image d'après est déjà préchargée", prechargee[0].src && prechargee[0].pret, JSON.stringify(prechargee));
  // Une image qui arrive alors que le joueur est sur sa page : elle apparaît en fondu.
  retenir = true; retenues = [];
  await relayer([narration("s1", 5000, para(1, "Neuf")), narration("s2", 5001, para(1, "Neuf"), { Illustration: illD(20) })], true);
  await p.waitForTimeout(300);
  const g = (await pagesDuRecit()).find(x => x.fondE === "s2-croquis");
  await allerA(g.i); await p.waitForTimeout(800);
  const enAttente = await etatImg(g.i);
  retenir = false; retenues.forEach(ok => ok());
  await p.waitForTimeout(150);
  const pendant = await etatImg(g.i);
  await p.waitForTimeout(1600);
  const apres = await etatImg(g.i);
  verifier("une image pas encore là : invisible (opacité 0)…", enAttente[0].src && !enAttente[0].pret && enAttente[0].op === "0", JSON.stringify(enAttente));
  verifier("…puis elle apparaît en fondu (opacité qui monte sur 1,2 s)", apres[0].pret && apres[0].op === "1" && Number(pendant[0].op) < 1 && /1\.2s/.test(apres[0].tr),
           JSON.stringify({ pendant, apres }));
  // Un mot de plus sur la page : l'image ne repart pas en fondu (elle est déjà là).
  await relayer([narration("s1", 5000, para(1, "Neuf")), narration("s2", 5001, para(1, "Neuf"), { Illustration: illD(20) }), narration("s3", 5002, "Encore un mot.")]);
  await p.waitForTimeout(100);
  const relu = await etatImg(g.i);
  verifier("le texte qui s'ajoute ne refait pas le fondu de l'image", relu[0].pret && relu[0].op === "1", JSON.stringify(relu));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v346_fondu.png" });
});

// =========================================================================
titre("4. LA CONSIGNE : CONCEPT ART 16:9, LE STYLE DE LA BASE, UN LIEU SEUL, LES PNJ COMME LES AVATARS");
// =========================================================================
const PNG1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const imagesIA = [];
await p.route('**/api.openai.com/**', async r => { const req = r.request(); imagesIA.push({ url: req.url(), corps: req.postDataBuffer() ? req.postDataBuffer().toString("utf-8") : "" });
  r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ data: [{ b64_json: PNG1 }] }) }); });
const illustrer = (avis, texteMJ, ecart) => p.evaluate(async ([avis, texteMJ, ecart]) => {
  ["ivalis_OPENAI_API_KEY", "ivalis_CLOUDINARY_CLOUD_NAME", "ivalis_CLOUDINARY_API_KEY", "ivalis_CLOUDINARY_API_SECRET"].forEach(k => localStorage.setItem(k, "banc"));
  const kaya = { idPersonnage: "H1", idJoueur: "J1", prenom: "Kaya", genre: "Femme", race: "Humain", classe: "Pisteur", actif: true, urlCloudinary: "kaya.png", urlPortraitReference: "portrait-kaya.png" };
  const thorin = { idPersonnage: "H3", idJoueur: "J1", prenom: "Thorin", genre: "Homme", race: "Nain", classe: "Protecteur", actif: true, urlCloudinary: "thorin.png", urlPortraitReference: "portrait-thorin.png" };
  const lyra = { idPersonnage: "H2", idJoueur: "J2", prenom: "Lyra", genre: "Femme", race: "Elfe", classe: "Oracle", actif: true, urlCloudinary: "lyra.png" };
  window.PERSOS_JOUEURS_PARTIE = [kaya, thorin, lyra]; window.PERSOS_PARTIE = [kaya, thorin, lyra];
  window.__depots = []; window.televerserImageDetoureeIvalis = async (source, dossier, cles, options) => { window.__depots.push({ dossier, options: options || null }); return `https://res.cloudinary.com/x/image/upload/q_auto,f_auto/v1/${dossier}/illu.png`; };
  window.imageVersBlobPng = async () => new Blob(["png"], { type: "image/png" });
  window.instructionStyleIvalis = async () => "STYLE_DE_LA_BASE_INST_76839";
  window.__portraits = []; window.__vraiPortrait = window.__vraiPortrait || window.portraitPnjFaconAvatar;
  window.portraitPnjFaconAvatar = async (d, r) => { window.__portraits.push([d, r]); return "https://res.cloudinary.com/x/image/upload/q_auto,f_auto/v1/PNJ/avatar.png"; };
  window.fetchGemini = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(avis) }] } }] }), { status: 200 });
  localStorage.setItem("ivalis_illus_ecart_" + (window.ID_PARTIE_COURANTE || ""), String(ecart == null ? 5 : ecart));
  const id = "mi" + Math.random().toString(36).slice(2, 7);
  await window.illustrerLeRecit({ idMessage: id, texteMJ, texteJoueurs: "", pnjConnus: {} });
  return { doc: (window.__docs || {})["Messages_Chat/" + id] || null, depots: window.__depots.slice(), portraits: window.__portraits.slice() };
}, [avis, texteMJ, ecart]);
const champ = (corps, nom) => { const m = new RegExp(`name="${nom.replace(/[[\]]/g, "\\$&")}"\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--`).exec(corps); if (m) return m[1]; try { return JSON.parse(corps)[nom]; } catch (e) { return ""; } };
await section(async () => {
  const n0 = imagesIA.length;
  const r = await illustrer({ illustrer: true, moment: "drôle", sujet: "scene", description: "Kaya slips on a wet amphora while Varos the innkeeper laughs, in a smoky tavern.",
    acteurs: [{ id: "H1", nom: "Kaya", type: "heros", place: "center-right", action: "slipping", expression: "surprised" }, { nom: "Varos", type: "pnj", place: "far right", action: "laughing", expression: "amused" }],
    mise_en_scene: "medium shot", extrait: "Kaya glisse sur l'amphore.", pnj_nommes: [{ nom: "Varos", present: true, race: "Humain", description_physique: "Un aubergiste ventru." }] }, "Kaya glisse sur l'amphore ; Varos éclate de rire.");
  const req = imagesIA.slice(n0).find(x => /images\/(edits|generations)/.test(x.url));
  const prompt = req ? champ(req.corps, "prompt") : "";
  verifier("la consigne : concept art d'Antiquité fantastique, personnages sur la moitié droite, zone libre à gauche", /Créer une illustration de concept art dans un univers d'Antiquité fantastique/.test(prompt)
    && /exclusivement sur la moitié droite/.test(prompt) && /ZONE DE TEXTE/.test(prompt) && /La moitié gauche de l'image doit rester largement dégagée/.test(prompt) && /Format paysage 16:9/.test(prompt), prompt.slice(0, 300));
  verifier("…le style est celui de la base (Cerveau_IA/INST_76839, celui des avatars)", /STYLE_DE_LA_BASE_INST_76839/.test(prompt) && !/Fortiche/.test(prompt));
  verifier("…plus d'encre noire sur blanc", !/pen-and-ink|PURE BLACK INK|#FFFFFF/.test(prompt));
  verifier("…le décor derrière les personnages", /Le décor du moment se tient derrière eux/.test(prompt));
  verifier("…les héros en référence (Kaya), en 16:9 (1792 × 1024)", !!req && /images\/edits/.test(req.url) && champ(req.corps, "size") === "1792x1024" && /image 1 is Kaya/.test(prompt), req ? req.url + " " + champ(req.corps, "size") : "aucune");
  verifier("…déposée telle quelle (pas de détourage)", r.depots.some(d => d.dossier === "Recit/Illustrations" && d.options && d.options.fond === "aucun"), JSON.stringify(r.depots));
  verifier("…rangée en double page sur le message du Narrateur", r.doc && r.doc.Illustration && r.doc.Illustration.Format === "double-page" && Math.abs(r.doc.Illustration.Ratio - 1.75) < 0.01 && !("Taille" in r.doc.Illustration),
           JSON.stringify(r.doc && r.doc.Illustration && { ...r.doc.Illustration, Consigne: "…" }));
  verifier("Varos, PNJ nouveau : son portrait par le procédé de l'avatar (ia_master.js)", r.portraits.length === 1 && /aubergiste/.test(r.portraits[0][0]) && r.portraits[0][1] === "Humain", JSON.stringify(r.portraits));
  verifier("…posé en pleine page (format avatar, 1024 × 1792)", r.doc && Array.isArray(r.doc.Portraits_PNJ) && r.doc.Portraits_PNJ[0].Format === "avatar" && Math.abs(r.doc.Portraits_PNJ[0].Ratio - 1024 / 1792) < 0.01,
           JSON.stringify(r.doc && r.doc.Portraits_PNJ));
});
await section(async () => {
  const n0 = imagesIA.length;
  const r = await illustrer({ illustrer: true, moment: "lieu", sujet: "lieu", description: "The ruined temple of Hera at dusk, its broken columns on the right.",
    acteurs: [{ id: "H1", nom: "Kaya", type: "heros", place: "right" }], mise_en_scene: "wide shot", pnj_nommes: [] }, "Le temple d'Héra se dresse devant nous.");
  const req = imagesIA.slice(n0).find(x => /images\/(edits|generations)/.test(x.url));
  const prompt = req ? champ(req.corps, "prompt") : "";
  verifier("un lieu seul : aucun personnage, aucun portrait joint", !!req && /images\/generations/.test(req.url) && /Aucun personnage/.test(prompt) && /No person at all/.test(prompt) && !/image 1 is/.test(prompt), prompt.slice(0, 400));
  verifier("…l'élément principal à droite, la zone libre à gauche", /moitié droite/.test(prompt) && /avec l'élément principal à droite/.test(prompt));
  verifier("…rangé comme lieu", r.doc && r.doc.Illustration && r.doc.Illustration.Sujet === "lieu");
});
await section(async () => {
  // Le gros plan forcé : au hasard sur un des héros présents (cités par le Narrateur), à droite.
  const vus = new Set();
  for (let k = 0; k < 8; k++) {
    const n0 = imagesIA.length;
    await illustrer({ illustrer: false, pnj_nommes: [] }, "Kaya et Thorin s'arrêtent au bord du ravin.", 2);
    const req = imagesIA.slice(n0).find(x => /images\/(edits|generations)/.test(x.url));
    const prompt = req ? champ(req.corps, "prompt") : "";
    const m = /image 1 is (\w+)/.exec(prompt); if (m) vus.add(m[1]);
    if (k === 0) verifier("le gros plan forcé : un plan moyen, le héros sur la moitié droite, le décor derrière", /right half of the frame/.test(prompt) && /setting of the scene behind/.test(prompt), prompt.slice(-500));
  }
  verifier("…au hasard parmi les héros présents (Kaya, Thorin ; jamais Lyra, absente)", vus.has("Kaya") && vus.has("Thorin") && !vus.has("Lyra"), JSON.stringify([...vus]));
});
await section(async () => {
  // Le vrai procédé de l'avatar, malgré la pause des portraits de PNJ (v300) : le fond magenta, 1024 × 1792.
  const n0 = imagesIA.length;
  const pause = await p.evaluate(() => window.PORTRAITS_PNJ_EN_PAUSE);
  await p.evaluate(() => window.__vraiPortrait("Un aubergiste ventru à la barbe grise.", "Humain").catch(() => ""));
  const req = imagesIA.slice(n0).find(x => /images\/generations/.test(x.url));
  const corps = req ? JSON.parse(req.corps) : {};
  verifier("portraitPnjFaconAvatar : le procédé de l'avatar (style de la base, fond magenta, 1024 × 1792), même en pause", pause === true && !!req && corps.size === "1024x1792"
    && /MAGENTA/.test(corps.prompt) && /STYLE_DE_LA_BASE|Directives de style/.test(corps.prompt) && /aubergiste ventru/.test(corps.prompt), JSON.stringify({ pause, size: corps.size }));
  verifier("…les autres portraits de PNJ restent en pause", await p.evaluate(() => typeof window.portraitPnjFaconAvatar === "function") && /if \(!malgreLaPause && window\.PORTRAITS_PNJ_EN_PAUSE !== false\) return "";/.test(lire("ia_master.js")));
});

{
  const html = lire("index.html");
  verifier("version 346 ; grimoire_recit v19, illustrations_recit v9, ia_master v25, app v146, grimoire_regions v12, grimoire_recit.css v17",
    Number((/VERSION_IVALIS = (\d+);/.exec(lire("trace_combat.js")) || [])[1]) >= 346 && JSON.parse(lire("version.json")).version >= 346
    && [['grimoire_recit\\.js', 19], ['illustrations_recit\\.js', 9], ['ia_master\\.js', 25], ['app\\.js', 146], ['grimoire_regions\\.js', 12], ['grimoire_recit\\.css', 17]]
       .every(([f, v]) => Number((new RegExp('"(?:\\./)?' + f + '\\?v=(\\d+)"').exec(html) || [])[1]) >= v));
}
console.log(erreurs.length ? "\nErreurs de page : " + erreurs.slice(0, 5).join(" | ") : "");
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUS LES CONTRÔLES PASSENT"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
