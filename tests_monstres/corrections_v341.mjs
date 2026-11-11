// v341 — LES IMAGES DES PEUPLES ET DES CLASSES ARRIVENT AVANT LA PAGE.
// Nico : « les images dans les races et classes mettent du temps à arriver, la page est
// ouverte quand on voit l'image pop ; charge l'image de la page d'avant et d'après ».
//
// Lancer : node tests_monstres/corrections_v341.mjs
// Lancer : node tests_monstres/corrections_v339.mjs
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
const CAPTURES = process.env.V341_CAPTURES || "";
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
const dessus2 = (sel) => p.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const s = getComputedStyle(el); return { display: s.display, visible: s.display !== "none" && s.visibility !== "hidden" }; }, sel);
// Les fonds des peuples (le banc n'a pas Cloudinary) : dessinés sur place, comme ceux des classes.
const demandes = [];
await p.route(/res\.cloudinary\.com\/.*IMG_22(49|5[0-7])_/, r => { demandes.push(r.request().url()); r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: CARTE_PAYSAGE }); });
const etatFonds = () => p.evaluate(() => (window.DONNEES_RACES || []).map((r, i) => {
  const img = window.GRIMOIRE_CREATION.page("race-" + i).querySelector(".fond-classe.gauche img"), d = window.GRIMOIRE_CREATION.page("race-" + i + "-d").querySelector(".fond-classe.droite img");
  return { race: r.nom, pose: !!img.getAttribute("src"), pret: img.complete && img.naturalWidth > 0, droite: !!d.getAttribute("src") };
}));

titre("1. EN OUVRANT LES PEUPLES : LA PREMIÈRE ET LA SUIVANTE SONT DÉJÀ LÀ, PAS LES AUTRES");
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_FICHES.allerAuxAventuriers()); await p.waitForTimeout(2600); await pose();
  await action(".page-clan .nouvel-aventurier"); await p.waitForTimeout(2800); await pose();
  const e = await etatFonds();
  verifier("plus de chargement paresseux (loading=lazy) sur les fonds", !/loading="lazy"/.test(lire("grimoire_creation.js")));
  verifier("les Humains (la page ouverte) : image chargée, à gauche et à droite", e[0].pret && e[0].droite, JSON.stringify(e[0]));
  verifier("…les Ondari (la suivante) : déjà chargée", e[1].pret, JSON.stringify(e[1]));
  verifier("…les peuples plus loin attendent (rien de lourd d'un coup)", e.slice(3).every(x => !x.pose), JSON.stringify(e.map(x => x.pose)));
});

titre("2. EN TOURNANT : LA PRÉCÉDENTE, L'OUVERTE ET LA SUIVANTE");
await section(async () => {
  // On tourne vers les Ondari puis les Vargens, comme un joueur, page après page.
  for (const cle of ["race-1", "race-2"]) { await p.evaluate((c) => window.GRIMOIRE_FICHES.aller(window.GRIMOIRE_CREATION.page(c)), cle); await p.waitForTimeout(2600); await pose(); await p.waitForTimeout(400); }
  const e = await etatFonds();
  verifier("sur les Vargens : Ondari, Vargens et Ankylars chargés", e[1].pret && e[2].pret && e[3].pret, JSON.stringify(e.map(x => x.pret)));
  verifier("…les deux derniers peuples attendent encore", !e[5].pose && !e[6].pose, JSON.stringify(e.map(x => x.pose)));
});

titre("3. UN SAUT PAR MARQUE-PAGE : L'IMAGE D'ARRIVÉE PART AVANT LA TOURNE");
await section(async () => {
  const avant = await etatFonds();
  verifier("(l'Éthéré n'est pas encore chargé)", !avant[6].pose);
  await p.evaluate(() => document.querySelector('.onglet-creation[data-cle="Ethéré"]').click());
  const tout = await p.evaluate(() => !!window.GRIMOIRE_CREATION.page("race-6").querySelector(".fond-classe.gauche img").getAttribute("src"));
  verifier("au toucher du marque-page, l'image de l'Éthéré est déjà demandée", tout);
  await p.waitForTimeout(2800); await pose();
  const e = await etatFonds();
  verifier("…et prête à l'arrivée", e[6].pret && e[6].droite, JSON.stringify(e[6]));
});

titre("4. LES CLASSES AUSSI, ET LES PAGES RÉÉCRITES GARDENT LEUR IMAGE");
await section(async () => {
  await action('#grimoire-creation-race-6 [data-ca="race"]'); await p.waitForTimeout(2800); await pose(); await p.waitForTimeout(400);
  const c = await p.evaluate(() => [0, 1, 2, 5].map(i => { const img = window.GRIMOIRE_CREATION.page("classe-" + i).querySelector(".fond-classe img");
    return img ? { pose: !!img.getAttribute("src"), pret: img.complete && img.naturalWidth > 0 } : null; }));
  verifier("la première classe (ouverte) et la suivante : chargées", c[0] && c[0].pret && c[1] && c[1].pret, JSON.stringify(c));
  verifier("…une classe plus loin attend", c[3] && !c[3].pose, JSON.stringify(c[3]));
  // Le peuple de la page d'avant a été réécrit (race choisie) : son image revient du cache.
  const e = await etatFonds();
  verifier("l'Éthéré réécrit (peuple choisi) a toujours son image", e[6].pose, JSON.stringify(e[6]));
});

{
  const html = lire("index.html");
  verifier("version 341 ou plus ; grimoire_creation.js en v6", Number((/VERSION_IVALIS = (\d+);/.exec(lire("trace_combat.js")) || [])[1]) >= 341 && JSON.parse(lire("version.json")).version >= 341 && html.includes('grimoire_creation.js?v=6"'));
}
console.log(erreurs.length ? "\nErreurs de page : " + erreurs.slice(0, 5).join(" | ") : "");
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUS LES CONTRÔLES PASSENT"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
