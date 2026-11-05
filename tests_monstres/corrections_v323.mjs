// v323 — MIA_ILLUSTRATEUR : CHAQUE HÉROS RELIÉ À SON IMAGE (« A- Fargus » EST « Fargus »), ET LA
// MISE EN SCÈNE DE L'AGENT (QUI, OÙ, QUOI, QUEL VISAGE ; LE CADRAGE) TRANSMISE AU DESSINATEUR AVEC
// LES PORTRAITS EN BINAIRE ; UN HÉROS INTROUVABLE : PAS DE CROQUIS ; LA CONSIGNE GARDÉE.
//
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
const CAPTURES = process.env.V323_CAPTURES || "";
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
  window.televerserImageDetoureeIvalis = async (source, dossier) => `https://res.cloudinary.com/x/image/upload/q_auto,f_auto/v1/${dossier}/croquis.png`;
  window.__blobs = [];
  window.imageVersBlobPng = async (url) => { window.__blobs.push(url); return new Blob(["png"], { type: "image/png" }); };
  window.__agent = "";
  window.fetchGemini = async (nom, corps) => { window.__agent = corps; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(avis) }] } }] }), { status: 200 }); };
  localStorage.removeItem("ivalis_illus_ecart_P1"); localStorage.removeItem("ivalis_illus_ecart_" + (window.ID_PARTIE_COURANTE || ""));
  const id = "mi" + Math.random().toString(36).slice(2, 7);
  await window.illustrerLeRecit({ idMessage: id, texteMJ, texteJoueurs: "", pnjConnus: {} });
  return { doc: (window.__docs || {})["Messages_Chat/" + id] || null, blobs: window.__blobs.slice(), agent: window.__agent };
}, [avis, texteMJ]);
const TEXTE_MJ = "Fargus pivote d'un bloc vers nous, la voix sourde et précipitée : « Qu'est-ce qu'on fait ? Cachons-nous ! »";
const croquisDepuis = (n) => imagesIA.slice(n).find(x => /pen-and-ink/.test(x.corps));
const nbImages = (c) => (c.corps.match(/name="image\[\]"/g) || []).length;

// =========================================================================
titre("1. LES NOMS : « A- FARGUS » EST BIEN « FARGUS »");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    window.PERSOS_JOUEURS_PARTIE = [{ prenom: "A- Fargus", camp: "Allié" }, { prenom: "Kaya" }, { prenom: "Le Grand Bob" }]; window.PERSOS_PARTIE = [];
    const f = window.herosDuCroquisIllustrateur;
    return { fargus: f({ heros: ["Fargus"], description: "Fargus pivots toward the others." }, "").map(h => h.prenom),
             parTexte: f({ heros: [], description: "the group hides behind the rocks" }, "Fargus se retourne vers le groupe.").map(h => h.prenom),
             faux: f({ heros: [], description: "A grand hall full of dust." }, "").map(h => h.prenom),
             kaya: f({ heros: ["Kaya"], description: "Kaya laughs." }, "").map(h => h.prenom) };
  });
  verifier("l'agent dit « Fargus » : c'est le héros « A- Fargus »", JSON.stringify(r.fargus) === '["A- Fargus"]', JSON.stringify(r.fargus));
  verifier("le Narrateur l'écrit « Fargus » : on le retrouve aussi", JSON.stringify(r.parTexte) === '["A- Fargus"]', JSON.stringify(r.parTexte));
  verifier("un mot banal (« grand ») ne fait venir personne (Le Grand Bob)", r.faux.length === 0, JSON.stringify(r.faux));
  verifier("Kaya reste Kaya, et elle seule", JSON.stringify(r.kaya) === '["Kaya"]', JSON.stringify(r.kaya));
});

// =========================================================================
titre("2. LA MISE EN SCÈNE : CHAQUE PORTRAIT JOINT, AVEC SA PLACE DANS LA SCÈNE");
// =========================================================================
await section(async () => {
  const n = imagesIA.length;
  const res = await illustrer({ illustrer: true, moment: "dramatique", sujet: "scene", description: "Fargus spins around, whispering urgently that they must hide.",
    acteurs: [{ id: "H1", nom: "Fargus", type: "heros", place: "center", action: "spinning around toward the viewer, one clawed hand raised", expression: "urgent, teeth bared" }],
    mise_en_scene: "medium shot, slightly low angle, Fargus alone among the tree trunks", pnj_nommes: [] }, TEXTE_MJ);
  const cr = croquisDepuis(n);
  verifier("l'agent reçoit les héros avec leur identifiant (H1 = A- Fargus…)", /H1 = A- Fargus/.test(res.agent) && /H2 = Kaya/.test(res.agent), res.agent.slice(0, 0));
  verifier("le portrait de RÉFÉRENCE de Fargus est lu en binaire (pas l'avatar habillé)", JSON.stringify(res.blobs) === '["portrait-fargus.png"]', JSON.stringify(res.blobs));
  verifier("il part joint à /images/edits (une image[])", !!cr && /images\/edits/.test(cr.url) && nbImages(cr) === 1, cr ? cr.url + " " + nbImages(cr) : "aucun croquis");
  verifier("l'image 1 est Fargus, avec sa place, son geste et son visage", !!cr && /image 1 is A- Fargus \(a man, Requin, Protecteur\).{1,4} in the scene: center; spinning around toward the viewer, one clawed hand raised; urgent, teeth bared/.test(cr.corps));
  verifier("la mise en scène (le cadrage) part au dessinateur", !!cr && /STAGING: medium shot, slightly low angle, Fargus alone among the tree trunks\./.test(cr.corps));
  verifier("une seule figure : personne d'autre", !!cr && /EXACTLY 1 figure in the whole drawing: A- Fargus\./.test(cr.corps));
  verifier("le message garde les portraits joints et la consigne (pour vérifier après coup)", !!(res.doc && res.doc.Illustration) && JSON.stringify(res.doc.Illustration.References) === '["A- Fargus"]' && /STAGING/.test(res.doc.Illustration.Consigne || ""), JSON.stringify(res.doc && res.doc.Illustration && res.doc.Illustration.References));
});

// =========================================================================
titre("3. DEUX HÉROS ET UN ÊTRE SANS NOM, DANS L'ORDRE DE LA SCÈNE");
// =========================================================================
await section(async () => {
  const n = imagesIA.length;
  const res = await illustrer({ illustrer: true, moment: "dramatique", sujet: "scene", description: "Fargus drags Kaya behind a fallen trunk as a hound sniffs the air.",
    acteurs: [{ id: "H2", nom: "Kaya", type: "heros", place: "left", action: "pulled down by the arm", expression: "surprised" },
              { id: "H1", nom: "Fargus", type: "heros", place: "center", action: "crouching, dragging Kaya down", expression: "fierce" },
              { nom: "a hunting hound", type: "autre", place: "right background", action: "sniffing the air" }],
    mise_en_scene: "wide shot from behind the trunk", pnj_nommes: [] }, TEXTE_MJ + " Kaya glisse derrière un tronc.");
  const cr = croquisDepuis(n);
  verifier("deux portraits joints, Kaya puis Fargus (l'ordre de la scène)", JSON.stringify(res.blobs) === '["portrait-kaya.png","portrait-fargus.png"]' && !!cr && nbImages(cr) === 2, JSON.stringify(res.blobs));
  verifier("image 1 Kaya à gauche, image 2 Fargus au centre", !!cr && /image 1 is Kaya[^;]*.{1,4} in the scene: left; pulled down by the arm; surprised/.test(cr.corps) && /image 2 is A- Fargus[^;]*.{1,4} in the scene: center; crouching, dragging Kaya down; fierce/.test(cr.corps));
  verifier("le chien sans nom est compté, avec sa place : trois figures", !!cr && /EXACTLY 3 figures in the whole drawing: Kaya, A- Fargus, a hunting hound \(right background; sniffing the air\)/.test(cr.corps));
});

// =========================================================================
titre("4. UN HÉROS QU'ON NE RETROUVE PAS : PAS DE CROQUIS (PLUTÔT RIEN QU'UN INCONNU)");
// =========================================================================
await section(async () => {
  const n = imagesIA.length;
  const res = await illustrer({ illustrer: true, moment: "drôle", sujet: "scene", description: "Bob trips over his own cloak.",
    acteurs: [{ id: "H7", nom: "Bob", type: "heros", place: "center", action: "tripping" }], mise_en_scene: "close shot", pnj_nommes: [] }, "Bob trébuche sur sa cape.");
  verifier("aucun dessin demandé, aucun croquis posé", !croquisDepuis(n) && !(res.doc && res.doc.Illustration), res.doc ? JSON.stringify(res.doc) : "");
  // L'ancienne réponse (sans "acteurs") marche encore, et retrouve Fargus.
  const n2 = imagesIA.length;
  const vieux = await illustrer({ illustrer: true, moment: "dramatique", sujet: "scene", description: "Fargus spins around, whispering that they must hide.", heros: ["Fargus"], pnj_dans_le_croquis: [], autres: [], nombre: 1, pnj_nommes: [] }, TEXTE_MJ);
  const cr = croquisDepuis(n2);
  verifier("une réponse à l'ancienne (« heros »: [\"Fargus\"]) : son portrait part aussi", JSON.stringify(vieux.blobs) === '["portrait-fargus.png"]' && !!cr && /images\/edits/.test(cr.url), JSON.stringify(vieux.blobs));
});

console.log(erreurs.length ? "\nErreurs de page : " + erreurs.slice(0, 5).join(" | ") : "");
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
