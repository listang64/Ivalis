// v325 — LES CROQUIS DU CARNET : NOIR SUR BLANC, LE BLANC RETIRÉ PAR UN ALGORITHME (IL NE RESTE QUE
// L'ENCRE) ; DES TRAITS ÉPAIS, UNE MISE EN SCÈNE ARTISTIQUE ; LE MOMENT PRÉCIS, FIDÈLE AU TEXTE.
//
// Lancer : node tests_monstres/corrections_v325.mjs
// Lancer : node tests_monstres/corrections_v323.mjs
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
  export const getDocs = async (c) => { const l = (c && c.col === "Joueurs" && window.JOUEURS_BANC) ? Object.entries(window.JOUEURS_BANC).map(([id, nom]) => ({ id, data: () => ({ ID_Joueur: id, Nom: nom }) })) : [];
    return { forEach(f) { l.forEach(f); }, docs: l, empty: !l.length, size: l.length }; };
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
const CAPTURES = process.env.V325_CAPTURES || "";
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
const PORTRAIT = await (async () => { const pg = await b.newPage(); const u = await pg.evaluate(() => { const c = document.createElement("canvas"); c.width = 600; c.height = 1100;
  const x = c.getContext("2d"); x.fillStyle = "#3a6a6a"; x.fillRect(220, 260, 160, 420); x.fillStyle = "#e0c09a"; x.beginPath(); x.arc(300, 180, 80, 0, 7); x.fill();
  x.fillStyle = "#2a3a5a"; x.fillRect(220, 680, 70, 420); x.fillRect(310, 680, 70, 420); return c.toDataURL("image/png"); }); await pg.close(); return Buffer.from(u.split(",")[1], "base64"); })();
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
await p.route('**/portrait-kaya.png', r => r.fulfill({ status: 200, contentType: 'image/png', body: PORTRAIT }));
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
  const arme = (nom, extra) => Object.assign({ nom, rarete: "Commun", type: "Arme légère", emplacement: "main", effetTexte: "+2 dégâts", image: "" }, extra || {});
  const heros = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Kaya", nom: "", genre: "Femme", race: "Humain", classe: "Pisteur", actif: true, urlCloudinary: "portrait-kaya.png",
                   xp: 1060, PV_Max: 62, Fatigue_Max: 100, fatigueMax: 100, Regeneration: 35, Esquive: 15, Parade: 0, Critique: 10, Def_Physique: 5, Def_Magique: 0,
                   talents: { TAL_PREPARER: 1 }, talentsChoix: {}, blessures: [{ uid: "b1", id: "BLE_LEVRE_FENDUE", jours: 2 }], deckEquipe: ["C1", "C3"], creeLe: 2000,
                   equipArmure: { nom: "Cuirasse de lin lamellé", rarete: "Rare", type: "Armure légère", emplacement: "armure", effetTexte: "+6 % de défense physique", image: "" },
                   equipMainDroite: arme("Glaive de bronze"), equipMainGauche: null, equipStock: arme("Fronde de berger", { type: "Arme légère Distance" }), piecesLaiton: 12, piecesBronze: 17 },
                 { idPersonnage: "H3", idJoueur: "J1", prenom: "Thorin", nom: "Ironfoot", race: "Nain", classe: "Protecteur", actif: true, urlCloudinary: "", creeLe: 1000 },
                 { idPersonnage: "H2", idJoueur: "J2", prenom: "Lyra", nom: "Sombreval", genre: "Femme", race: "Elfe", classe: "Oracle", actif: true, urlCloudinary: "", creeLe: 1500 }];
  window.CARACS_PARTIE = { H1: { force: 10, dex: 15, con: 12, int: 13, sag: 10, cha: 8 } };
  window.CACHE_COMPETENCES_GLOBAL = { H1: {
    C1: { Nom: "Sharingan", Initiative: 53, Fatigue: 20, Arme: "Magie", Effets_Compiles: [{ nom: "Attaque magique", desc: "Inflige 12 dégâts de feu à la cible." }, { nom: "Brûlé", desc: "10 % de chance d'enflammer la cible.", isMod: true }] },
    C2: { Nom: "Soin du mécréant", Initiative: 47, Fatigue: 25, Arme: "Magie", Effets_Compiles: [{ nom: "Soin", desc: "Rend 14 PV à un allié." }] },
    C3: { Nom: "Terrain miné", Initiative: 0, Fatigue: 30, Arme: "Sans arme / Arme rp", Effets_Compiles: [{ nom: "Piège", desc: "Pose un piège qui étourdit." }] } } };
  window.PERSOS_JOUEURS_PARTIE = heros; window.PERSOS_PARTIE = heros.slice();
  window.JOUEURS_BANC = { J1: "Benjamin", J2: "Nico" };
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



const pose = () => attendreQue(() => p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getState() === "read" && !window.GRIMOIRE.defileEnCours()), 8000);

// =========================================================================


// La partie (le groupe dans le désert d'Etheria, zone 3).
const boite = (n, x, y) => ({ numero: n, points: [{ x, y }, { x: x + 140, y }, { x: x + 140, y: y + 110 }, { x, y: y + 110 }] });
await p.evaluate((zones) => { window.ZONES_LIVRE = zones; }, { 8: boite(8, 1000, 520), 1: boite(1, 180, 200), 3: boite(3, 380, 560), 7: boite(7, 1150, 220) });
await cliquer("#grimoire-btn-charger"); await p.waitForTimeout(700);
await cliquer('#grimoire-liste-parties [data-id="P1"]'); await p.waitForTimeout(150);
await p.fill("#grimoire-mdp-partie", "sel");
await p.evaluate(() => window.appliquerVoyageDeLaPartie && window.appliquerVoyageDeLaPartie({ Position_Groupe: { Region: 5, x: 0.42, y: 0.55 } }));
await cliquer("#grimoire-valider-partie");
await p.evaluate(() => window.appliquerVoyageDeLaPartie && window.appliquerVoyageDeLaPartie({ Position_Groupe: { Region: 5, x: 0.42, y: 0.55 } }));
const cap = async (nom) => { if (CAPTURES) await p.screenshot({ path: CAPTURES + "/" + nom + ".png" }); };
const PNG1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const imagesIA = [];
await p.route('**/api.openai.com/**', async r => {
  const req = r.request(); const corps = req.postDataBuffer() ? req.postDataBuffer().toString("latin1") : "";
  imagesIA.push({ url: req.url(), corps });
  r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ data: [{ b64_json: PNG1 }] }) });
});
// Les croquis déposés (le banc n'a pas Cloudinary) : des traits d'encre dessinés sur place.
const CROQUIS = await (async () => { const pg = await b.newPage(); const u = await pg.evaluate(() => { const c = document.createElement("canvas"); c.width = 600; c.height = 400;
  const x = c.getContext("2d"); x.strokeStyle = "#2a1a0e"; x.lineWidth = 3; x.lineCap = "round";
  for (let i = 0; i < 70; i++) { x.beginPath(); const a = Math.random() * 600, b2 = 80 + Math.random() * 260; x.moveTo(a, b2); x.quadraticCurveTo(a + 30, b2 - 40, a + 60 * Math.random(), b2 + 50 * Math.random()); x.stroke(); }
  x.beginPath(); x.arc(300, 140, 50, 0, 7); x.stroke(); x.beginPath(); x.moveTo(300, 190); x.lineTo(300, 320); x.moveTo(300, 230); x.lineTo(240, 280); x.moveTo(300, 230); x.lineTo(370, 260); x.stroke();
  return c.toDataURL("image/png"); }); await pg.close(); return Buffer.from(u.split(",")[1], "base64"); })();
await p.route(/res\.cloudinary\.com\/x\/image\/upload\/v1\/(Recit|PNJ)\//, r => r.fulfill({ status: 200, contentType: 'image/png', body: CROQUIS }));


// Les héros de la partie : « A- Fargus » (un requin), puis Kaya.
const illustrer = (avis, texteMJ) => p.evaluate(async ([avis, texteMJ]) => {
  ["ivalis_OPENAI_API_KEY", "ivalis_CLOUDINARY_CLOUD_NAME", "ivalis_CLOUDINARY_API_KEY", "ivalis_CLOUDINARY_API_SECRET"].forEach(k => localStorage.setItem(k, "banc"));
  const fargus = { idPersonnage: "H9", idJoueur: "J1", prenom: "A- Fargus", genre: "Homme", race: "Requin", classe: "Protecteur", actif: true,
                   urlCloudinary: "fargus-equipe.png", urlPortraitReference: "portrait-fargus.png" };
  const kaya = { idPersonnage: "H1", idJoueur: "J1", prenom: "Kaya", genre: "Femme", race: "Humain", classe: "Pisteur", actif: true, urlCloudinary: "kaya-equipe.png", urlPortraitReference: "portrait-kaya.png" };
  window.PERSOS_JOUEURS_PARTIE = [fargus, kaya]; window.PERSOS_PARTIE = [fargus, kaya];
  window.__depots = []; window.televerserImageDetoureeIvalis = async (source, dossier, cles, options) => { window.__depots.push(options || null); return `https://res.cloudinary.com/x/image/upload/q_auto,f_auto/v1/${dossier}/croquis.png`; };
  window.__blobs = [];
  window.__fonds = []; window.imageVersBlobPng = async (url, fond) => { window.__blobs.push(url); window.__fonds.push(fond || ""); return new Blob(["png"], { type: "image/png" }); };
  window.__agent = "";
  window.fetchGemini = async (nom, corps) => { window.__agent = corps; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(avis) }] } }] }), { status: 200 }); };
  localStorage.removeItem("ivalis_illus_ecart_P1"); localStorage.removeItem("ivalis_illus_ecart_" + (window.ID_PARTIE_COURANTE || ""));
  const id = "mi" + Math.random().toString(36).slice(2, 7);
  await window.illustrerLeRecit({ idMessage: id, texteMJ, texteJoueurs: "", pnjConnus: {} });
  return { doc: (window.__docs || {})["Messages_Chat/" + id] || null, blobs: window.__blobs.slice(), fonds: window.__fonds.slice(), depots: window.__depots.slice(), agent: window.__agent };
}, [avis, texteMJ]);
const TEXTE_MJ = "Fargus pivote d'un bloc vers nous, la voix sourde et précipitée : « Qu'est-ce qu'on fait ? Cachons-nous ! »";
const croquisDepuis = (n) => imagesIA.slice(n).find(x => /pen-and-ink/.test(x.corps));
const nbImages = (c) => (c.corps.match(/name="image\[\]"/g) || []).length;


// =========================================================================
titre("1. L'ALGORITHME : LE BLANC S'EN VA, L'ENCRE RESTE");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => {
    const f = window.encreSansBlancIvalis;
    const px = (r, g, b) => Array.from(f(new Uint8ClampedArray([r, g, b, 255])));
    // Un dessin noir sur blanc : un trait au milieu, un gris de hachure, le reste blanc.
    const c = document.createElement("canvas"); c.width = 60; c.height = 40;
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 60, 40);
    x.fillStyle = "#000"; x.fillRect(10, 10, 20, 6); x.fillStyle = "#969696"; x.fillRect(40, 10, 10, 6);
    const sortie = await window.detourerFondBlancIvalis(c.toDataURL("image/png"));
    const img = new Image(); await new Promise(ok => { img.onload = ok; img.src = sortie; });
    const c2 = document.createElement("canvas"); c2.width = 60; c2.height = 40; const x2 = c2.getContext("2d"); x2.drawImage(img, 0, 0);
    const a = (X, Y) => Array.from(x2.getImageData(X, Y, 1, 1).data);
    return { blanc: px(255, 255, 255), cassé: px(240, 238, 235), noir: px(0, 0, 0), gris: px(150, 150, 150), png: /^data:image\/png/.test(sortie),
             coin: a(2, 2), trait: a(15, 12), hachure: a(44, 12), dedans: a(30, 30) };
  });
  verifier("un pixel blanc (et le blanc cassé) devient transparent", r.blanc[3] === 0 && r.cassé[3] === 0, JSON.stringify([r.blanc, r.cassé]));
  verifier("un pixel noir devient de l'encre opaque (brun-noir)", r.noir[3] === 255 && r.noir[0] < 40, JSON.stringify(r.noir));
  verifier("un gris de hachure reste à demi (l'encre légère)", r.gris[3] > 60 && r.gris[3] < 220, JSON.stringify(r.gris));
  verifier("sur un vrai dessin : le fond s'en va, le trait reste, la hachure à demi", r.png && r.coin[3] === 0 && r.dedans[3] === 0 && r.trait[3] === 255 && r.hachure[3] > 60 && r.hachure[3] < 220, JSON.stringify(r));
});

// =========================================================================
titre("2. LE DESSINATEUR : NOIR SUR BLANC, TRAITS ÉPAIS, MISE EN SCÈNE, LE MOMENT TEL QU'IL EST ÉCRIT");
// =========================================================================
await section(async () => {
  const n = imagesIA.length;
  const extrait = "L'homme plisse les yeux, s'approche à deux pas de notre protecteur et donne même un petit coup du bout de sa sandale cloutée contre la jambière rouillée de l'Ophior.";
  const res = await illustrer({ illustrer: true, moment: "dramatique", sujet: "scene", description: "A slaver kicks the rusty greave of Fargus, who stands motionless, camouflaged as a mossy stump.",
    acteurs: [{ nom: "a slaver with a broken nose", type: "autre", place: "left", action: "kicking the greave with his studded sandal", expression: "suspicious, squinting" },
              { id: "H1", nom: "Fargus", type: "heros", place: "right", action: "motionless, covered in moss and ivy, camouflaged as an old stump", expression: "frozen, holding his breath" }],
    mise_en_scene: "low angle close on the kick, the sandal hitting the greave as the focal point; Fargus a huge dark mass of moss and hatching", extrait, pnj_nommes: [] }, extrait);
  const cr = croquisDepuis(n);
  verifier("le dessin est demandé en noir sur un fond BLANC, sans plus aucun magenta", !!cr && /PURE BLACK INK ON A PURE WHITE BACKGROUND/.test(cr.corps) && !/magenta|FF00FF/i.test(cr.corps), cr ? "" : "aucun croquis");
  verifier("des traits épais et lisibles, des hachures, des masses noires", !!cr && /THICK, CONFIDENT LINES/.test(cr.corps) && /cross-hatching/.test(cr.corps) && /SOLID BLACK masses/.test(cr.corps) && /never thin grey pencil lines/.test(cr.corps));
  verifier("une mise en scène artistique (cadrage, point focal, silhouettes)", !!cr && /ARTISTIC STAGING/.test(cr.corps) && /clear focal point/.test(cr.corps) && /STAGING: low angle close on the kick/.test(cr.corps));
  verifier("le moment tel que le texte le raconte part au dessinateur (fidèle : qui cache qui)", !!cr && cr.corps.includes("petit coup du bout de sa sandale") && /Stay faithful to it/.test(cr.corps));
  verifier("le portrait de Fargus est mis sur du BLANC pour partir", JSON.stringify(res.fonds) === '["#FFFFFF"]', JSON.stringify(res.fonds));
  verifier("au dépôt, c'est le blanc qu'on retire (pas le magenta)", JSON.stringify(res.depots) === '[{"fond":"blanc"}]', JSON.stringify(res.depots));
  verifier("l'agent cherche LE moment précis, fidèle, et le recopie (« extrait »)", /LE MOMENT PRÉCIS/.test(res.agent) && /dans \\"extrait\\"/.test(res.agent) && /directeur artistique/.test(res.agent));
});

// =========================================================================
titre("3. SUR LA PAGE : IL NE RESTE QUE L'ENCRE");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => { const css = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules].map(x => x.cssText); } catch (e) { return []; } }).join("\n");
    return { multiply: /\.croquis-recit img[^{]*\{[^}]*mix-blend-mode: multiply/.test(css) }; });
  verifier("le croquis se pose sur le papier (l'encre multipliée sur le parchemin)", r.multiply);
});

console.log(erreurs.length ? "\nErreurs de page : " + erreurs.slice(0, 5).join(" | ") : "");
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
