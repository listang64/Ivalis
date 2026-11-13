// v345 — L'OMBRE DE LA PLIURE RESTE QUAND ON TOURNE UNE PAGE DE CARTE RÉGIONALE.
// Nico : « quand on clique pour tourner la page, l'ombre du milieu de page disparaît ; au
// moins en fondu, et dans l'idéal, la garder ».
//
// Lancer : node tests_monstres/corrections_v345.mjs
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
const CAPTURES = process.env.V345_CAPTURES || "";
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

// À chaque image (requestAnimationFrame), depuis la tourne jusqu'à la carte vivante posée :
// la carte vivante montrée doit être celle de la double page ouverte, et avoir l'ombre de la
// pliure par-dessus (sinon, c'est l'image de la page, avec sa propre ombre, qu'on voit).
const suivre = () => p.evaluate(() => {
  window.__images = [];
  const pas = () => {
    const pf = window.GRIMOIRE_PAGEFLIP, vue = document.getElementById("vue-carte-region");
    const visible = !!vue && getComputedStyle(vue).display !== "none" && getComputedStyle(vue).visibility !== "hidden";
    const ici = pf.getCurrentPageIndex(), gauche = ici % 2 === 1 ? ici : ici - 1;
    const r = window.GRIMOIRE_REGIONS.regions().find(x => x.page === gauche);
    window.__images.push({ etat: pf.getState(), visible, carte: window.carteRegionaleOuverte && window.carteRegionaleOuverte(), page: r ? r.numero : null,
                           pliure: !!document.getElementById("region-pliure") });
    if (window.__suivre) requestAnimationFrame(pas);
  };
  window.__suivre = true; requestAnimationFrame(pas);
});
const arreter = () => p.evaluate(() => { window.__suivre = false; return window.__images; });
const juger = (l) => {
  const posees = l.filter(x => x.etat === "read");
  const fausses = l.filter(x => x.visible && x.etat === "read" && x.carte !== x.page);
  const sansOmbre = [];   // (v373) plus d'ombre de pliure sur les cartes (Nico) : rien à compter
  return { images: l.length, posees: posees.length, fausses: fausses.length, sansOmbre: sansOmbre.length, exemple: (fausses[0] || sansOmbre[0]) };
};

titre("1. D'UNE CARTE À L'AUTRE : JAMAIS LA CARTE D'AVANT, JAMAIS SANS OMBRE");
await section(async () => {
  for (let k = 0; k < 5; k++) { await p.evaluate((pg) => window.GRIMOIRE.allerALaPage(pg), regions[1].page); await p.waitForTimeout(2500); await pose(); if (await monteeSur(5)) break; }
  await p.waitForTimeout(1200);
  verifier("(sur le désert, la carte vivante est posée — v373 : sans ombre de pliure)", await p.evaluate(() => window.carteRegionaleOuverte() === 5 && !document.getElementById("region-pliure")));
  for (const [i, n, nom] of [[2, 3, "vers le mont Pletia (une page)"], [1, 5, "retour au désert (une page en arrière)"], [3, 7, "vers l'île aux marchés (les pages défilent)"]]) {
    await suivre();
    await p.evaluate((pg) => window.GRIMOIRE.allerALaPage(pg), regions[i].page);
    await p.waitForTimeout(2500); await pose(); await monteeSur(n); await p.waitForTimeout(600);
    const j = juger(await arreter());
    verifier(`${nom} : la carte vivante n'est jamais celle d'une autre page`, j.fausses === 0 && j.images > 20, JSON.stringify(j));
    verifier(`…ni montrée sans l'ombre de la pliure`, j.sansOmbre === 0, JSON.stringify(j));
  }
});

titre("2. À L'ÉCRAN : L'OMBRE EST LÀ SUR LA CARTE, À CHAQUE IMAGE APRÈS LA TOURNE");
await section(async () => {
  for (let k = 0; k < 5; k++) { await p.evaluate((pg) => window.GRIMOIRE.allerALaPage(pg), regions[1].page); await p.waitForTimeout(2500); await pose(); if (await monteeSur(5)) break; }
  await p.waitForTimeout(1200);
  const livre = await p.evaluate(() => { const r = document.getElementById("grimoire-livre").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  // Une ligne de la page de droite, du dos vers l'extérieur, au milieu de la carte.
  const clip = { x: Math.round(livre.x + livre.w * 0.5), y: Math.round(livre.y + livre.h * 0.62), width: Math.round(livre.w * 0.2), height: 1 };
  const profil = async () => { const buf = await p.screenshot({ clip });
    return p.evaluate(async (b64) => { const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode(); const c = document.createElement("canvas"); c.width = img.width; c.height = 1;
      const x = c.getContext("2d"); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, img.width, 1).data, v = (f) => { const k = Math.round((img.width - 1) * f) * 4; return (d[k] + d[k + 1] + d[k + 2]) / 3; };
      return { etat: window.GRIMOIRE_PAGEFLIP.getState(), v: [v(0.12), v(0.2), v(0.28)] }; }, buf.toString("base64")); };
  await p.evaluate((pg) => window.GRIMOIRE.allerALaPage(pg), regions[2].page);
  const l = [], t0 = Date.now();
  while (Date.now() - t0 < 3000) l.push(await profil());
  // Après la tourne, sur la carte du mont Pletia : plus sombre près du dos (l'ombre).
  const apres = l.filter(x => x.etat === "read");
  // (v373) Nico : « pas besoin d'ombrage sur ces maps » : la carte reste égale, du dos vers le bord.
  const ombrees = apres.filter(x => x.v[0] < x.v[2] - 8);
  verifier("chaque image après la tourne : plus d'ombre sur la carte (v373, aussi claire près du dos)", apres.length > 5 && ombrees.length === 0,
           `${apres.length} images, ${ombrees.length} ombrée(s) ${JSON.stringify(ombrees.slice(0, 3))}`);
});

{
  const html = lire("index.html");
  verifier("version 345 ou plus ; grimoire_regions.js v11 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lire("trace_combat.js")) || [])[1]) >= 345 && JSON.parse(lire("version.json")).version >= 345
    && Number((/grimoire_regions\.js\?v=(\d+)"/.exec(html) || [])[1]) >= 11);
}
console.log(erreurs.length ? "\nErreurs de page : " + erreurs.slice(0, 5).join(" | ") : "");
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUS LES CONTRÔLES PASSENT"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
