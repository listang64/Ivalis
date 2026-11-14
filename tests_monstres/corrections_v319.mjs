// v319 — LA CRÉATION D'UN HÉROS DANS LE LIVRE : PEUPLES, CLASSES, COMPAGNON, CHAMPS, NAISSANCE,
// LES MARQUE-PAGES DU BORD DROIT ; « + UN NOUVEL AVENTURIER » ENCADRÉ À L'AQUARELLE.
//
// Lancer : node tests_monstres/corrections_v319.mjs
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
const CAPTURES = process.env.V319_CAPTURES || "";
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
  if (/res\.cloudinary\.com\/.*IMG_(1894|1892|1900|1893|1897|1903|1979|2189|1984|1977|1981|2229|2230|2231|2238|2239|2240|2241|2242|2243|2244|2248)_/.test(u)) { imagesDemandees.push(u); return r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: /IMG_1893|IMG_1903|IMG_2231/.test(u) ? CARTE_PAYSAGE : CARTE_PORTRAIT }); }
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

// Les images des classes (le banc n'a pas Cloudinary) : dessinées sur place.
await p.route(/res\.cloudinary\.com\/.*_fond_/, r => r.fulfill({ status: 200, contentType: 'image/png', body: CARTE_PAYSAGE }));
const ici = () => p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex());
const idx = (cle) => p.evaluate((cle) => window.GRIMOIRE.indexDe(window.GRIMOIRE_CREATION.page(cle)), cle);
const sur = async (cle) => { const [a, b] = [await ici(), await idx(cle)]; return b >= 0 && (a === b || a === b - 1 || a === b + 1); };
const action = (sel) => p.evaluate((sel) => { const b = document.querySelector(sel); if (!b) return false; b.click(); return true; }, sel);

// =========================================================================
titre("1. « + UN NOUVEL AVENTURIER » : ENCADRÉ, UNE AQUARELLE DEDANS");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_FICHES.allerAuxAventuriers()); await p.waitForTimeout(2600); await pose();
  const r = await p.evaluate(() => { const b = document.querySelector(".page-clan .nouvel-aventurier"); if (!b) return null;
    return { cadre: !!b.querySelector(".cadre-main"), lavis: !!b.querySelector(".lavis"), souligne: getComputedStyle(b).textDecorationLine }; });
  verifier("le bouton est encadré à la main, avec une aquarelle dedans", !!r && r.cadre && r.lavis && r.souligne === "none", JSON.stringify(r));
  await cap("v319_clan");
});

// =========================================================================
titre("2. LES PEUPLES : UNE DOUBLE PAGE PAR RACE, LES MARQUE-PAGES DU BORD DROIT");
// =========================================================================
await section(async () => {
  await action(".page-clan .nouvel-aventurier"); await p.waitForTimeout(2800); await pose();
  const r = await p.evaluate(() => {
    const c = window.GRIMOIRE_CREATION, s = c.sections();
    const g = c.page("race-0"), d = c.page("race-0-d");
    const groupes = [...document.querySelectorAll("#onglets-creation .groupe-onglets")].map(x => ({ g: x.dataset.groupe, sorti: x.classList.contains("sorti"), n: x.children.length }));
    const ong = [...document.querySelectorAll('#onglets-creation [data-groupe="races"] .onglet-creation')];
    const xs = new Set(ong.map(o => o.style.getPropertyValue("--x"))), as = new Set(ong.map(o => o.style.getPropertyValue("--a")));
    const rect = ong[0] && ong[0].getBoundingClientRect(), page = g.getBoundingClientRect();
    return { actif: c.actif(), races: s.races, classes: s.classes.length, nbPages: c.pages().length,
             texte: g.textContent.replace(/\s+/g, " "), droite: d.textContent.trim().length, genres: g.querySelectorAll('[data-ca="race"]').length,
             groupes, xs: xs.size, as: as.size, depasse: rect ? Math.round(rect.right - page.right) : 0, couleurs: new Set(ong.map(o => o.querySelector(".lavis path").getAttribute("fill"))).size };
  });
  verifier("la création s'ouvre dans le livre, juste après les clans, sur le premier peuple", r.actif && await sur("race-0"), JSON.stringify({ ici: await ici(), race: await idx("race-0") }));
  verifier("sept peuples, une double page chacun ; les seize classes ensuite (v343)", r.races.length === 7 && r.classes === 16 && r.nbPages === 7 * 2 + 16 * 2 + 4 + 2, JSON.stringify(r.races) + " " + r.nbPages);
  verifier("à gauche tout ce qu'on sait du peuple (lore, en jeu, atout) et le choix du genre", /Les Humains/.test(r.texte) && /Peuple le plus répandu/.test(r.texte) && /En jeu/.test(r.texte) && /Atout/.test(r.texte) && r.genres === 2 /* v365 : sans « Se cherche » */, r.texte.slice(0, 120));
  verifier("à droite, rien pour l'instant (les images viendront)", r.droite === 0);
  verifier("les marque-pages des peuples sortent sur le bord droit ; ceux des classes restent rangés", JSON.stringify(r.groupes) === JSON.stringify([{ g: "races", sorti: true, n: 7 }, { g: "classes", sorti: false, n: 16 }]), JSON.stringify(r.groupes));
  verifier("… pas tous alignés, chacun de sa couleur, dépassant du livre", r.xs >= 5 && r.as >= 5 && r.couleurs === 7 && r.depasse > 20, JSON.stringify({ xs: r.xs, as: r.as, couleurs: r.couleurs, depasse: r.depasse }));
  await cap("v319_peuple");
  // Le marque-page des Ankylars mène à leur page.
  await p.evaluate(() => document.querySelector('#onglets-creation .onglet-creation[data-cle="Ankylar"]').click()); await p.waitForTimeout(2600); await pose();
  verifier("un marque-page mène à la page de son peuple (les Ankylars)", await sur("race-3"), String(await ici()));
});

// =========================================================================
titre("3. LES CLASSES : L'IMAGE SUR LA DOUBLE PAGE, VOILÉE À GAUCHE ; LES INTERDITES");
// =========================================================================
await section(async () => {
  await p.evaluate(() => document.querySelector('#grimoire-creation-race-2 [data-genre="Femelle"]').click()); await p.waitForTimeout(2800); await pose();
  const r = await p.evaluate(() => {
    const c = window.GRIMOIRE_CREATION, pages = [...document.querySelectorAll(".page-classe.gauche")];
    const vampire = pages.find(x => /Vampire/i.test(x.querySelector(".titre-creation").textContent));
    const g = c.page("classe-0"), d = c.page("classe-0-d");
    const imgG = g.querySelector(".fond-classe.gauche"), imgD = d.querySelector(".fond-classe.droite");
    const groupes = [...document.querySelectorAll("#onglets-creation .groupe-onglets")].map(x => x.classList.contains("sorti"));
    return { race: window.RACE_SELECTIONNEE_TEMP, genre: window.GENRE_SELECTIONNE_TEMP, titre0: g.querySelector(".titre-creation").textContent,
             vampire: vampire ? vampire.querySelector(".classe-bloquee") && vampire.querySelector(".classe-bloquee").textContent : "",
             masque: imgG ? getComputedStyle(imgG).maskImage || getComputedStyle(imgG).webkitMaskImage : "", droite: !!imgD,
             memeImage: imgG && imgD && imgG.querySelector("img").src === imgD.querySelector("img").src, paliers: g.querySelectorAll(".palier-classe").length, groupes };
  });
  verifier("choisir un peuple (Vargen, Femelle) mène aux classes", r.race === "Vargen" && r.genre === "Femelle" && await sur("classe-0"), JSON.stringify(r).slice(0, 120));
  verifier("à gauche le descriptif de la classe (ses paliers), au masculin (v365)", /Pisteur/.test(r.titre0) && r.paliers > 0, r.titre0 + " / " + r.paliers);
  verifier("l'image de fond sur la double page, voilée en dégradé à gauche", r.droite && r.memeImage && /linear-gradient/.test(r.masque), r.masque.slice(0, 70));
  verifier("une classe interdite à ce peuple : grisée, avec la raison", /Vargens ne peuvent pas être Vampire/.test(r.vampire), r.vampire);
  verifier("les marque-pages des classes sortent, ceux des peuples rentrent", JSON.stringify(r.groupes) === "[false,true]", JSON.stringify(r.groupes));
  await cap("v319_classe");
});

// =========================================================================
titre("4. LE COMPAGNON DU PISTEUR : UNE DOUBLE PAGE, UN LOUP EN EMBLÈME");
// =========================================================================
await section(async () => {
  const avant = await p.evaluate(() => window.GRIMOIRE_CREATION.pages().length);
  await action('#grimoire-creation-classe-0 [data-ca="classe"]'); await p.waitForTimeout(2800); await pose();
  const r = await p.evaluate(() => ({ classe: window.CLASSE_SELECTIONNEE_TEMP, champ: document.getElementById("champ-classe").value, n: window.GRIMOIRE_CREATION.pages().length,
    loup: !!document.querySelector("#grimoire-creation-compagnon-d .embleme-loup .tete"), champs: !!document.getElementById("creation-compagnon-nom") }));
  verifier("le Pisteur choisi : sa double page du compagnon s'ajoute, et s'ouvre", r.classe === "Pisteur" && r.champ === "Pisteur" && r.n === avant + 2 && await sur("compagnon-g"), JSON.stringify(r));
  verifier("à gauche son nom et son allure, à droite un loup à la plume", r.loup && r.champs);
  await action('#grimoire-creation-compagnon-g [data-ca="compagnon"]'); await p.waitForTimeout(300);
  const err = await p.evaluate(() => document.getElementById("creation-compagnon-erreur").textContent);
  verifier("sans nom, il ne part pas (« Donnez-lui un nom. »)", /Donnez-lui un nom/.test(err), err);
  await cap("v319_compagnon");
  await p.evaluate(() => { document.getElementById("creation-compagnon-nom").value = "Croc-Gris"; document.getElementById("creation-compagnon-description").value = "Un grand loup gris, une oreille déchirée."; });
  await action('#grimoire-creation-compagnon-g [data-ca="compagnon"]'); await p.waitForTimeout(2800); await pose();
  const c = await p.evaluate(() => window.COMPAGNON_TEMP);
  verifier("« Il me suit » : le compagnon est gardé, et les champs s'ouvrent", !!c && c.nom === "Croc-Gris" && await sur("form1-g"), JSON.stringify(c));
});

// =========================================================================
titre("5. LES CHAMPS À REMPLIR : DEUX DOUBLES PAGES, CEUX DU PEUPLE CHOISI");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const c = window.GRIMOIRE_CREATION;
    const titres = ["form1-g", "form1-d", "form2-g", "form2-d"].map(k => [...c.page(k).querySelectorAll(".bloc-formulaire h4")].map(h => h.textContent.trim()));
    const vu = (id) => { const e = document.getElementById(id); return e ? getComputedStyle(e).display !== "none" : false; };
    return { titres, race: document.getElementById("champ-race").value, genre: document.getElementById("champ-genre").value, classe: document.getElementById("champ-classe").value,
             pelage: vu("groupe-pelage"), cornes: vu("groupe-cornes"), cheveux: vu("groupe-cheveux"), modale: getComputedStyle(document.getElementById("modale-creation-hero")).display,
             dansLeLivre: !!document.querySelector("#grimoire-creation-form1-g #champ-nom") };
  });
  verifier("les blocs de l'ancienne fenêtre, rangés sur deux doubles pages", JSON.stringify(r.titres) === JSON.stringify([["Identité"], ["Visage / Tête", "Détails"], ["Physique / Corps"], ["Équipement de départ"]])   /* (v387) plus d'Apparence ni d'Autres */, JSON.stringify(r.titres));
  verifier("le peuple, le genre et la classe déjà posés ; les champs du Vargen (le pelage ; v387 : plus de cornes)", r.race === "Vargen" && r.genre === "Femelle" && r.classe === "Pisteur" && r.pelage && !r.cornes && !r.cheveux, JSON.stringify(r));
  verifier("l'ancienne fenêtre reste cachée : tout se remplit dans le livre", r.modale === "none" && r.dansLeLivre, r.modale);
  await p.fill("#champ-nom", "Ysolde");
  await cap("v319_champs");
  await p.evaluate(() => window.GRIMOIRE.allerALaPage(window.GRIMOIRE.indexDe(window.GRIMOIRE_CREATION.page("form2-g")))); await p.waitForTimeout(2600); await pose();
  await cap("v319_champs2");
});

// =========================================================================
titre("6. LA NAISSANCE : LE PORTRAIT QUI SE DESSINE, PUIS LA RÉPARTITION");
// =========================================================================
await section(async () => {
  await p.evaluate(() => {
    ["ivalis_OPENAI_API_KEY", "ivalis_CLOUDINARY_CLOUD_NAME", "ivalis_CLOUDINARY_API_KEY", "ivalis_CLOUDINARY_API_SECRET"].forEach(k => localStorage.setItem(k, "banc"));
    window.__donnees = null;
    window.sauvegarderFichePersonnage = (d) => { window.__donnees = d; return new Promise(ok => setTimeout(() => ok({ id: "H9", url: "" }), 4500)); };
  });
  await action('#grimoire-creation-form2-d [data-ca="creer"]'); await p.waitForTimeout(2900); await pose();
  const r = await p.evaluate(() => { const g = window.GRIMOIRE_CREATION.page("naissance-g");
    return { enCours: g.classList.contains("en-cours"), barre: !!g.querySelector("#barre-progression-creation"), visible: getComputedStyle(document.getElementById("barre-progression-creation")).display,
             ecran: getComputedStyle(document.getElementById("ecran-chargement-ia")).display, phrase: document.getElementById("phrase-humoristique-creation").textContent }; });
  verifier("« Donner vie » : le portrait se dessine dans le livre (la barre, les phrases), pas d'écran par-dessus", await sur("naissance-g") && r.enCours && r.barre && r.visible === "block" && r.ecran === "none", JSON.stringify(r));
  await cap("v319_naissance");
  await p.waitForTimeout(3000);
  const d = await p.evaluate(() => window.__donnees);
  verifier("le héros part avec ce qu'on a rempli (nom, peuple, genre, classe, compagnon)", !!d && d.prenom === "Ysolde" && d.race === "Vargen" && d.genre === "Femelle" && d.classe === "Pisteur" && d.compagnon && d.compagnon.nom === "Croc-Gris", JSON.stringify(d).slice(0, 160));
  await p.waitForTimeout(2600); await pose();
  const c = await p.evaluate(() => { const dd = window.GRIMOIRE_CREATION.page("naissance-d");
    return { pret: dd.classList.contains("pret"), grille: dd.querySelectorAll(".ligne-creation-carac").length, points: (document.getElementById("points-restants") || {}).textContent,
             modale: getComputedStyle(document.getElementById("modale-creation-caracs")).display, annuler: [...dd.querySelectorAll(".btn-modale")].filter(b => getComputedStyle(b).display !== "none").map(b => b.textContent.trim()) }; });
  verifier("puis la répartition, sur la page d'en face (six caractéristiques, les points)", await sur("naissance-d") && c.pret && c.grille === 6 && Number(c.points) > 0 && c.modale === "none", JSON.stringify(c));
  verifier("… sans « Annuler » (le héros existe déjà ; sa fiche proposera de répartir plus tard)", JSON.stringify(c.annuler) === '["Valider"]', JSON.stringify(c.annuler));
  // On dépense les points.
  await p.evaluate(() => { for (let k = 0; k < 60; k++) { const b = [...document.querySelectorAll("#grimoire-creation-naissance-d .btn-plus-moins")].filter(x => x.textContent === "+" && !x.disabled)[k % 3]; if (!b) break; b.click(); } });
  await cap("v319_repartition");
});

// =========================================================================
titre("7. LE HÉROS EST NÉ : LES PAGES ÉPHÉMÈRES S'EFFACENT, SA FICHE S'OUVRE");
// =========================================================================
await section(async () => {
  const pts = await p.evaluate(() => document.getElementById("points-restants").textContent);
  verifier("tous les points répartis", pts === "0", pts);
  await p.evaluate(() => { window.validerCreationCaracs(); setTimeout(() => {
    const h = { idPersonnage: "H9", idJoueur: "J1", prenom: "Ysolde", nom: "", genre: "Femelle", race: "Vargen", classe: "Pisteur", actif: true, urlCloudinary: "", creeLe: 3000, equipStock: null };
    window.PERSOS_JOUEURS_PARTIE.push(h); window.PERSOS_PARTIE.push({ ...h }); }, 1200); });
  await p.waitForTimeout(4500); await pose();
  const r = await p.evaluate(() => ({ actif: window.GRIMOIRE_CREATION.actif(), pages: document.querySelectorAll(".page-creation").length, onglets: !!document.getElementById("onglets-creation"),
    corps: document.body.classList.contains("creation-livre"), heros: window.GRIMOIRE_FICHES.herosAffiche(), page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(),
    inv: window.GRIMOIRE.indexDe(window.GRIMOIRE_FICHES.pages()["fiche-g"]), rendus: !!document.querySelector("#modale-creation-hero #champ-nom") && !!document.querySelector("#ecran-chargement-ia #barre-progression-creation") && !!document.querySelector("#modale-creation-caracs #grille-creation-caracs"),
    fenetre: getComputedStyle(document.getElementById("fenetre-fiche-perso")).display }));
  verifier("les pages de la création ont disparu du livre (et ses marque-pages)", !r.actif && r.pages === 0 && !r.onglets && !r.corps, JSON.stringify(r));
  verifier("la fiche du nouveau héros s'ouvre dans le livre, sur sa première page (v391 ; avant : l'inventaire)", r.heros === "H9" && Math.abs(r.page - r.inv) <= 1, JSON.stringify(r));
  verifier("les champs, la barre et la répartition retournent dans l'ancienne fenêtre (en secours)", r.rendus);
});

// =========================================================================
titre("8. LA CRÉATION TERMINÉE SANS HÉROS : RIEN NE RESTE (v387 : plus de « Renoncer », les marque-pages suffisent)");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_FICHES.allerAuxAventuriers()); await p.waitForTimeout(2600); await pose();
  await action(".page-clan .nouvel-aventurier"); await p.waitForTimeout(2800); await pose();
  const avant = await p.evaluate(() => window.GRIMOIRE_CREATION.actif());
  verifier("plus de « Renoncer à ce héros » (v387)", await p.evaluate(() => !document.querySelector('[data-ca="renoncer"]')));
  await p.evaluate(() => { window.GRIMOIRE_CREATION.terminer(); window.GRIMOIRE_FICHES.allerAuxAventuriers(); }); await p.waitForTimeout(2800); await pose();
  const r = await p.evaluate(() => ({ actif: window.GRIMOIRE_CREATION.actif(), pages: document.querySelectorAll(".page-creation").length,
    clan: window.GRIMOIRE.indexDe(window.GRIMOIRE_FICHES.pages().clans[0]), ici: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex() }));
  verifier("terminée : les pages s'effacent, retour à la page du clan", avant && !r.actif && r.pages === 0 && Math.abs(r.ici - r.clan) <= 1, JSON.stringify(r));
});

console.log(erreurs.length ? "\nErreurs de page : " + erreurs.slice(0, 5).join(" | ") : "");
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
