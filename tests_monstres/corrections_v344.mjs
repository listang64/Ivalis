// v344 — LES LIEUX DES CARTES RÉGIONALES TOURNENT AVEC LEUR PAGE, SE CHARGENT À L'AVANCE, ET LA
// LOUPE LES GROSSIT DÈS LE DÉBUT.
// Nico : « pour les maps régionales, précharger les icônes / images des pages d'avant et
// d'après, que ça ne pop pas d'un coup ; et pareil à la loupe » ; « dès qu'on clique pour
// tourner la page, les icônes et images disparaissent ».
//
// Lancer : node tests_monstres/corrections_v344.mjs
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
const CAPTURES = process.env.V344_CAPTURES || "";
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
titre("1. CHAQUE PAGE DE RÉGION PORTE SES LIEUX ; CEUX D'AUTOUR SE CHARGENT À L'AVANCE");
// =========================================================================
await section(async () => {
  // (au chargement, le livre s'ouvre de lui-même sur la région du groupe : on redemande la forêt
  // tant qu'elle n'est pas ouverte, comme corrections_v331)
  for (let k = 0; k < 5; k++) {
    await p.evaluate((pg) => window.GRIMOIRE.allerALaPage(pg), regions[0].page);
    await p.waitForTimeout(2500); await pose();
    if (await monteeSur(1)) break;
  }
  await p.waitForTimeout(900);
  const l = await lieuxDesPages();
  verifier("la forêt : ses deux lieux sur la page (dessin et nom)", JSON.stringify(l[0].fixe.map(x => x.nom)) === '["Sylvanis","Myrtée"]', JSON.stringify(l[0].fixe));
  verifier("…le désert, le mont Pletia, l'île : les leurs", l[1].fixe.map(x => x.nom).join() === "Ostrakon" && l[2].fixe.map(x => x.nom).join() === "Pletiane" && l[3].fixe.map(x => x.nom).join() === "Agoréa");
  verifier("la page ouverte et la suivante (le désert) : leurs dessins déjà chargés", l[0].fixe.every(x => x.pret) && l[1].fixe.every(x => x.pret), JSON.stringify([l[0].fixe, l[1].fixe]));
  // (v383) Nico : « que les images ne se chargent pas quand la page est ouverte » : toutes les
  // régions se préparent dès l'entrée en partie, la plus lointaine aussi (l'île).
  verifier("…l'île, plus loin, est déjà prête elle aussi (v383)", l[3].fixe.every(x => !!x.img), JSON.stringify(l[3].fixe));
  verifier("l'image fine de la carte vivante du désert est déjà demandée", await p.evaluate(() => true) && imagesDemandees.some(u => /w_3072/.test(u) && /IMG_2231/.test(u)), imagesDemandees.filter(u => /IMG_2231/.test(u)).join(" ").slice(0, 160));
  // Les lieux de la page tombent exactement sous ceux de la carte vivante.
  const ecarts = await p.evaluate(() => {
    const pg = document.querySelector(".page-region.droite[data-region='1']"), k = pg.querySelector(".region-calques");
    // (sur la page ouverte, la couche des lieux est cachée sous la copie : on la montre le temps de mesurer)
    const avait = k.classList.contains("avec-instantane"); k.classList.remove("avec-instantane");
    pg.classList.add("mesure-v344");
    const mesures = ["A1", "A2"].map(id => {
      const ea = pg.querySelector(`.region-lieux .village-region[data-id="${id}"]`), eb = document.querySelector(`#carte-region-villages .village-region[data-id="${id}"]`);
      if (!ea || !eb) return "manque " + (!ea ? "page " : "") + (!eb ? "vivante " + window.carteRegionaleOuverte() : "");
      const a = ea.getBoundingClientRect(), b = eb.getBoundingClientRect();
      return Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
    });
    if (avait) k.classList.add("avec-instantane");
    return mesures;
  });
  verifier("les lieux de la page sont exactement sous ceux de la carte vivante (± 1,5 px)", ecarts.every(e => e <= 1.5), JSON.stringify(ecarts));
});

// =========================================================================
titre("2. LA PAGE TOURNE : LES LIEUX ET LE PION RESTENT, SUR LA PAGE QUI PART COMME SUR CELLE QUI ARRIVE");
// =========================================================================
await section(async () => {
  await p.evaluate((pg) => window.GRIMOIRE.allerALaPage(pg), regions[1].page);
  await p.waitForTimeout(2500); await pose(); await monteeSur(5); await p.waitForTimeout(1200);
  const avant = await lieuxDesPages();
  verifier("sur le désert (le groupe y est) : la copie figée de la carte vivante, pion compris", avant[1].instantane.length === 1 && avant[1].pion, JSON.stringify(avant[1]));
  // On tourne vers le mont Pletia, et on regarde pendant la tourne.
  await p.evaluate(() => {
    window.__tourne = [];
    window.__iv = setInterval(() => {
      const pf = window.GRIMOIRE_PAGEFLIP; if (pf.getState() === "read") return;
      const vue = document.getElementById("vue-carte-region");
      const page = (n) => { const pg = document.querySelector(`.page-region.droite[data-region='${n}']`), k = pg.querySelector(".region-calques"), cadre = pg.querySelector(".region-carte-cadre");
        const vis = [...k.querySelectorAll(".village-region")].filter(v => v.offsetParent !== null || getComputedStyle(v).display !== "none").filter(v => getComputedStyle(v.closest(".region-lieux, .instantane")).display !== "none");
        return { cadre: getComputedStyle(cadre).visibility, lieux: vis.length, prets: vis.every(v => !v.querySelector("img") || (v.querySelector("img").complete && v.querySelector("img").naturalWidth > 0)),
                 pion: !!k.querySelector(".instantane .pion-groupe-region") };
      };
      window.__tourne.push({ vueCachee: !!vue && vue.classList.contains("en-tourne"), desert: page(5), pletia: page(3) });
    }, 30);
  });
  await p.evaluate((pg) => window.GRIMOIRE.allerALaPage(pg), regions[2].page);
  if (CAPTURES) { await p.waitForTimeout(420); await p.screenshot({ path: CAPTURES + "/v344_tourne.png" }); }
  await p.waitForTimeout(2500); await pose(); await monteeSur(3); await p.waitForTimeout(800);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v344_arrivee.png" });
  const t = await p.evaluate(() => { clearInterval(window.__iv); return window.__tourne; });
  const pendant = t.filter(x => x.vueCachee);
  verifier("(la carte vivante se cache bien pendant la tourne)", pendant.length > 3, String(pendant.length));
  verifier("pendant la tourne, la page du désert garde son lieu et le pion du groupe", pendant.every(x => x.desert.cadre !== "hidden" && x.desert.lieux === 1 && x.desert.prets && x.desert.pion), JSON.stringify(pendant.slice(0, 2)));
  verifier("…et la page qui arrive (le mont Pletia) montre déjà le sien, chargé", pendant.every(x => x.pletia.lieux === 1 && x.pletia.prets), JSON.stringify(pendant.slice(-2)));
  const apres = await lieuxDesPages();
  verifier("arrivé : la copie du désert s'en va (le groupe n'y est plus regardé), ses lieux restent", apres[1].instantane.length === 0 && apres[1].fixe.length === 1 && apres[1].fixeAffiche);
  verifier("…le mont Pletia a la sienne", apres[2].instantane.length === 1, JSON.stringify(apres[2]));
  verifier("…et l'île, maintenant voisine, a ses dessins chargés", apres[3].fixe.every(x => x.pret), JSON.stringify(apres[3].fixe));
});

// =========================================================================
titre("3. LA LOUPE : LES LIEUX ET LE PION SONT LÀ DÈS LE DÉBUT");
// =========================================================================
await section(async () => {
  await p.evaluate((pg) => window.GRIMOIRE.allerALaPage(pg), regions[1].page);
  await p.waitForTimeout(2500); await pose(); await monteeSur(5); await p.waitForTimeout(1200);
  // (v383) Au repos, le verre est grisâtre (plus de copie) ; la copie figée des lieux et du pion
  // est préparée pour la glisse, sous le verre de l'écran de la loupe.
  const repos = await p.evaluate(() => { const c = document.querySelector("#loupe-ecran .loupe-dessous .copie-carte-region");
    return { copie: !!c, lieux: c ? c.querySelectorAll(".village-region").length : 0, verre: document.querySelectorAll("#loupe-bouton .loupe-lentille .copie-carte-region").length }; });
  verifier("au repos, la glisse a déjà sa copie du lieu et du pion (le verre, lui, reste grisâtre)", repos.copie && repos.lieux === 1 && repos.verre === 0, JSON.stringify(repos));
  await p.evaluate(() => { window.LOUPE_CARTES.figer(0.5); window.LOUPE_CARTES.ouvrir(); });
  await p.waitForTimeout(400);
  const glisse = await p.evaluate(() => {
    const c = document.querySelector("#loupe-plan .loupe-statique-calques"), s = document.getElementById("loupe-statique");
    if (!c) return null;
    const v = c.querySelector(".village-region").getBoundingClientRect(), si = s.getBoundingClientRect(), cad = window.cadrageCarteRegion();
    const lieu = window.VILLAGES_REGIONAUX.B1;
    // où le lieu doit tomber sur l'image fixe (son centre, en parts de l'image)
    const cx = (v.left + v.width / 2 - si.left) / si.width, cy = (v.top + v.height / 2 - si.top) / si.height;
    return { lieux: c.querySelectorAll(".village-region").length, nom: c.textContent.includes("Ostrakon"), pion: !!c.querySelector(".pion-groupe-region"), cx, cy, attendu: [lieu.x, lieu.y] };
  });
  verifier("pendant la glisse, la copie figée est posée sur l'image (lieu, nom, pion)", !!glisse && glisse.lieux === 1 && glisse.nom && glisse.pion, JSON.stringify(glisse));
  verifier("…à sa place exacte sur la carte", !!glisse && Math.abs(glisse.cx - glisse.attendu[0]) < 0.01 && Math.abs(glisse.cy - glisse.attendu[1]) < 0.01, glisse && JSON.stringify([glisse.cx.toFixed(4), glisse.cy.toFixed(4), glisse.attendu]));
  await p.evaluate(() => window.LOUPE_CARTES.figer(null));
  await attendreQue(() => p.evaluate(() => window.LOUPE_CARTES.etat() === "ouverte"), 5000); await p.waitForTimeout(300);
  const ouverte = await p.evaluate(() => ({ copie: document.querySelectorAll("#loupe-plan .loupe-statique-calques").length, vivante: !!document.querySelector("#loupe-plan > .vue-carte-region.en-grand"),
    lieux: document.querySelectorAll("#loupe-plan > .vue-carte-region #carte-region-villages .village-region").length }));
  verifier("ouverte : la carte vivante a pris la place, la copie s'est retirée", ouverte.vivante && ouverte.copie === 0 && ouverte.lieux === 1, JSON.stringify(ouverte));
  await p.evaluate(() => window.LOUPE_CARTES.figer(0.5)); await p.evaluate(() => { window.LOUPE_CARTES.fermer(); }); await p.waitForTimeout(400);
  const fermeture = await p.evaluate(() => { const c = document.querySelector("#loupe-plan .loupe-statique-calques"); return { lieux: c ? c.querySelectorAll(".village-region").length : 0, pion: !!(c && c.querySelector(".pion-groupe-region")) }; });
  verifier("en refermant, la copie accompagne l'image jusqu'au livre", fermeture.lieux === 1 && fermeture.pion, JSON.stringify(fermeture));
  await p.evaluate(() => window.LOUPE_CARTES.figer(null));
  await attendreQue(() => p.evaluate(() => window.LOUPE_CARTES.etat() === "repos"), 5000);
  verifier("refermée : plus de copie dans la loupe", await p.evaluate(() => document.querySelectorAll("#loupe-plan .loupe-statique-calques").length === 0));
});

// =========================================================================
titre("4. UN LIEU NOUVEAU ARRIVE AUSSI SUR SA PAGE ; LES COPIES NE GÊNENT RIEN");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.appliquerLieuLocal("D2", { Nom_Du_Lieu: "Kerameia", Carte_Regionale: 7, Position_Region: { x: 0.7, y: 0.3, taille: 0.06 }, Type_Lieu: "Village",
    URL_Calque_Region: "https://res.cloudinary.com/x/image/upload/v1/Villages_Regions/calque_D2.png", Calque_Plein: true }));
  await p.waitForTimeout(500);
  const l = await lieuxDesPages();
  verifier("un lieu né sur l'île paraît sur sa page", l[3].fixe.map(x => x.nom).sort().join() === "Agoréa,Kerameia", JSON.stringify(l[3].fixe));
  const r = await p.evaluate(() => {
    const vivant = document.getElementById("carte-region-villages");
    const doublons = [...document.querySelectorAll("[id]")].map(x => x.id).filter((id, i, a) => a.indexOf(id) !== i);
    const copies = [...document.querySelectorAll(".copie-carte-region")];
    return { doublons: [...new Set(doublons)], vivant: !!vivant && !vivant.closest(".copie-carte-region"), clic: copies.every(c => getComputedStyle(c).pointerEvents === "none") };
  });
  verifier("aucun identifiant en double dans la page (les copies ont les leurs)", r.doublons.length === 0, JSON.stringify(r.doublons));
  verifier("la carte vivante reste la seule à porter les vrais identifiants", r.vivant);
  verifier("les copies ne prennent aucun toucher", r.clic);
});

{
  const html = lire("index.html");
  verifier("version 344 ou plus ; les fichiers touchés ont changé de version", Number((/VERSION_IVALIS = (\d+);/.exec(lire("trace_combat.js")) || [])[1]) >= 344 && JSON.parse(lire("version.json")).version >= 344
           && [["villages_regionaux.js", 10], ["cartes_regionales.js", 21], ["loupe_cartes.js", 5], ["loupe_cartes.css", 3]].every(([f, n]) => Number((new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)\"").exec(html) || [])[1]) >= n)
           && Number((/style\.css\?v=(\d+)"/.exec(html) || [])[1]) >= 131
           && Number((/grimoire_regions\.js\?v=(\d+)"/.exec(html) || [])[1]) >= 11 && Number((/grimoire_regions\.css\?v=(\d+)"/.exec(html) || [])[1]) >= 5);
}
console.log(erreurs.length ? "\nErreurs de page : " + erreurs.slice(0, 5).join(" | ") : "");
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUS LES CONTRÔLES PASSENT"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
