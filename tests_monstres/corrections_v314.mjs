// v314 — LE LIVRE RETOUCHÉ (COUVERTURE, MARQUE-PAGE DU NARRATEUR, PAPIERS VIEILLIS,
// TACHES DE CAFÉ), MIA_ILLUSTRATEUR (LES CROQUIS DU RÉCIT, LES PORTRAITS DES PNJ
// NOUVEAUX), LES ENNEMIS EN LISTE À DÉCOCHER, LES IMAGES DU COMBAT EFFACÉES.
//
// Lancer : node tests_monstres/corrections_v314.mjs
// (IVALIS_RACINE=… pour un autre dossier ; V314_CAPTURES=dossier pour les captures.)
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
const CAPTURES = process.env.V314_CAPTURES || "";
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

// =========================================================================
titre("1. LE LIVRE : LA COUVERTURE, LE MARQUE-PAGE DU NARRATEUR, LES PAPIERS VIEILLIS, LES TACHES DE CAFÉ");
// =========================================================================
await section(async () => {
  const couv = await p.evaluate(() => document.querySelector(".page-couverture img").getAttribute("src"));
  verifier("la nouvelle couverture (IMG_2214)", /IMG_2214_etfv11\.png/.test(couv), couv);
  await p.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit()); await p.waitForTimeout(2500); await pose();
  const longue = Array.from({ length: 44 }, (_, i) => `Le paragraphe ${i + 1} : la route serpente entre les collines brûlées, et nous marchons longtemps sous un ciel de cuivre, les sandales pleines de poussière, sans croiser âme qui vive.`).join("\n");
  await relayer([{ idDoc: "m1", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: longue, Timestamp: 1000 }], true);
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const post = document.getElementById("recit-postit"), papier = post.querySelector(".papier-postit"), k = document.querySelector(".grimoire-fond-livre").getBoundingClientRect().width / 2000;
    const ecr = document.querySelector(".papier-ecriture"), us = document.querySelector(".papier-usure");
    const pages = [...document.querySelectorAll(".page-suite .page-recit")];
    return { largeur: post.offsetWidth / k, clip: getComputedStyle(papier).clipPath,
             ecriture: (getComputedStyle(ecr).backgroundImage.match(/radial-gradient/g) || []).length, usure: us ? (getComputedStyle(us).backgroundImage.match(/radial-gradient/g) || []).length : -1,
             pages: pages.length, taches: pages.filter(pg => pg.querySelector(".tache-cafe")).length,
             opacites: [...document.querySelectorAll(".tache-cafe")].map(t => Number(t.style.opacity)) };
  });
  verifier("le marque-page du Narrateur, moins large (150 au lieu de 190)", Math.abs(r.largeur - 150) < 6, r.largeur.toFixed(1));
  verifier("… son coin du haut arraché (une déchirure en dents de scie dans l'angle)", (r.clip.match(/%/g) || []).length > 20, r.clip.slice(0, 80));
  verifier("le papier où l'on écrit : vieilli, taché de café", r.ecriture >= 4, String(r.ecriture));
  verifier("le papier de l'avatar : vieilli (v324 : sans ses taches de café, à la demande de Nico)", r.usure >= 1, String(r.usure));
  // (v315 : les taches de café du récit sont retirées, à la demande de Nico.)
  verifier("(v315) plus de taches de café sur les pages du récit", r.pages >= 6 && r.taches === 0, `${r.taches} / ${r.pages} pages`);
});

// =========================================================================
titre("2. MIA_ILLUSTRATEUR : LE CROQUIS À LA PLUME, LES PORTRAITS DES PNJ NOUVEAUX");
// =========================================================================
await section(async () => {
  await p.evaluate(() => {
    ["ivalis_OPENAI_API_KEY", "ivalis_CLOUDINARY_CLOUD_NAME", "ivalis_CLOUDINARY_API_KEY", "ivalis_CLOUDINARY_API_SECRET"].forEach(k => localStorage.setItem(k, "banc"));
    window.PERSOS_PARTIE[0].urlPortraitReference = "portrait-kaya.png";
    window.__deposes = [];
    window.televerserImageDetoureeIvalis = async (source, dossier) => { window.__deposes.push(dossier); return `https://res.cloudinary.com/x/image/upload/v1/${dossier}/croquis_${window.__deposes.length}.png`; };
    window.imageVersBlobPng = async () => new Blob(["png"], { type: "image/png" });
    window.__agent = [];
    window.fetchGemini = async (usage, corps) => { window.__agent.push({ usage, corps: JSON.parse(corps) });
      const rep = { illustrer: true, moment: "drôle", sujet: "scene", description: "Kaya slips on a wet amphora while Varos the innkeeper laughs.", heros: ["Kaya"], pnj_dans_le_croquis: ["Varos"],
                    pnj_nommes: [{ nom: "Varos", race: "Humain", description_physique: "Un aubergiste ventru à la barbe grise." }, { nom: "Kaya", race: "Humain" }] };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(rep) }] } }] }), { status: 200 }); };
    localStorage.removeItem("ivalis_illus_ecart_P1");
  });
  const res = await p.evaluate(() => window.illustrerLeRecit({ idMessage: "m1", texteMJ: "Varos éclate de rire quand Kaya glisse sur une amphore.", texteJoueurs: "Kaya : je cours vers le comptoir", pnjConnus: {} }));
  const a = await p.evaluate(() => window.__agent[0]);
  verifier("après le Narrateur, l'agent lit les messages des joueurs et la réponse du Narrateur", !!a && /je cours vers le comptoir/.test(a.corps.contents[0].parts[0].text) && /Varos éclate de rire/.test(a.corps.contents[0].parts[0].text) && /drôle|dramatique/.test(a.corps.systemInstruction.parts[0].text));
  const croquis = imagesIA.find(x => /edits/.test(x.url) && /pen-and-ink/.test(x.corps));
  verifier("le croquis : à l'encre, sur fond blanc (v325 : le blanc retiré), qualité « medium » (v315)", !!croquis && /PURE WHITE BACKGROUND \(#FFFFFF\)/.test(croquis.corps) && /name="quality"\r\n\r\nmedium/.test(croquis.corps), croquis ? croquis.url : imagesIA.map(x => x.url).join(","));
  verifier("les héros du croquis en référence, avec leur nom (comme pour les avatars)", !!croquis && (croquis.corps.match(/name="image\[\]"/g) || []).length === 1 && /image 1 is Kaya/.test(croquis.corps), "");
  verifier("une scène : en paysage (1536 × 1024)", !!croquis && /name="size"\r\n\r\n1536x1024/.test(croquis.corps));
  const m = await p.evaluate(() => window.__docs["Messages_Chat/m1"]);
  verifier("le croquis est rangé sur le message du Narrateur (taille au hasard)", !!m && !!m.Illustration && /Recit\/Illustrations/.test(m.Illustration.Url) && m.Illustration.Ratio === 1.5 && m.Illustration.Taille >= 0.42 && m.Illustration.Taille <= 0.82, JSON.stringify(m && m.Illustration));
  const portrait = imagesIA.find(x => /generations/.test(x.url) && /Varos/.test(x.corps));
  const pnj = await p.evaluate(() => Object.entries(window.__docs).filter(([k]) => /^Monde_PNJ\//.test(k)).map(([k, v]) => v));
  verifier("Varos, PNJ nommé absent de la base : son portrait en pied, dans le même style", !!portrait && /pen-and-ink/.test(portrait.corps) && /1024x1536/.test(portrait.corps) && !imagesIA.some(x => /full-length portrait of Kaya/.test(x.corps)), portrait ? "" : "aucun");
  verifier("… rangé dans la base (Monde_PNJ, son image avec)", pnj.length === 1 && pnj[0].Nom_PNJ === "Varos" && /PNJ\/croquis/.test(pnj[0].URL_Cloudinary), JSON.stringify(pnj));
  verifier("… et posé en pleine page (Portraits_PNJ du message)", !!m && Array.isArray(m.Portraits_PNJ) && m.Portraits_PNJ[0].Nom === "Varos", JSON.stringify(m && m.Portraits_PNJ));
  // Juste après : pas de second croquis (au plus un toutes les deux réponses).
  const avant = imagesIA.length;
  await p.evaluate(() => { window.__docs["Monde_PNJ/PNJ_varos"] = { Nom_PNJ: "Varos", URL_Cloudinary: "https://x/PNJ/v.png" }; });
  await p.evaluate(() => window.illustrerLeRecit({ idMessage: "m2", texteMJ: "Encore Varos.", texteJoueurs: "", pnjConnus: { Varos: { Nom_PNJ: "Varos", URL_Cloudinary: "https://x/PNJ/v.png" } } }));
  verifier("la réponse suivante : pas de nouveau croquis (une toutes les deux), pas de portrait en double", imagesIA.length === avant, `${imagesIA.length - avant} image(s)`);
  // Dans le livre : le croquis après les paragraphes, le portrait seul sur sa page.
  const msg = await p.evaluate(() => window.__docs["Messages_Chat/m1"]);
  const texte = "La salle du Chaudron Fêlé sent la bière tiède.\nVaros éclate de rire quand Kaya glisse sur une amphore.";
  await relayer([{ idDoc: "m1", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: texte, Timestamp: 1000, Illustration: msg.Illustration, Portraits_PNJ: msg.Portraits_PNJ }], true);
  await p.waitForTimeout(900);
  const livre = await p.evaluate(() => {
    const fig = document.querySelector(".page-recit .croquis-recit"), por = document.querySelector(".page-recit .portrait-pleine-page");
    const pageFig = fig && fig.closest(".page-recit"), pagePor = por && por.closest(".page-recit");
    const apres = fig ? !!(fig.previousElementSibling && fig.previousElementSibling.classList.contains("para-recit")) : false;
    return { fig: !!fig, apres, largeur: fig ? fig.style.width : "", por: !!por, seul: pagePor ? pagePor.querySelectorAll(".para-recit").length === 0 : false, nom: por ? por.querySelector("figcaption").textContent : "",
             anim: fig ? getComputedStyle(fig.querySelector("img")).animationName : "" };
  });
  verifier("le croquis se dessine dans le livre, à la suite du paragraphe", livre.fig && livre.apres && livre.anim === "croquis-monte", JSON.stringify(livre));
  verifier("le portrait du PNJ nouveau : une pleine page à lui, son nom dessous", livre.por && livre.seul && livre.nom === "Varos", JSON.stringify(livre));
  await p.evaluate(() => { const pg = document.querySelector(".croquis-recit").closest(".page-grimoire"); window.GRIMOIRE.allerALaPage(window.GRIMOIRE.indexDe(pg)); });
  await p.waitForTimeout(2600); await pose(); await p.waitForTimeout(2600);
  await cap("v314_croquis");
  await p.evaluate(() => { const pg = document.querySelector(".portrait-pleine-page").closest(".page-grimoire"); window.GRIMOIRE.allerALaPage(window.GRIMOIRE.indexDe(pg)); });
  await p.waitForTimeout(2600); await pose(); await p.waitForTimeout(2600);
  await cap("v314_portrait");
});

// =========================================================================
titre("3. LE COMBAT : LES ENNEMIS EN LISTE À DÉCOCHER ; SES IMAGES EFFACÉES À LA FIN");
// =========================================================================
await section(async () => {
  const c = { Id: "crp_x", Etat: "preparation", Createur: { id: "AUTRE", t: Date.now() + 9e8 }, Carte: "https://res.cloudinary.com/x/image/upload/v1/Combats/Cartes/carte_1.png", Grille: { Taille: 60, Par: "auto" },
    Tokens: { v1: "https://res.cloudinary.com/x/image/upload/v1/Tokens/Ennemis/t1.png", v2: "https://res.cloudinary.com/x/image/upload/v1/Tokens/Ennemis/t2.png" },
    Ennemis: { Apparition: 2, Tirage: { depart: [{ nom: "Draxos le Balafré", archetype: "DPS CAC", palier: "Normal", leader: true, visuel: "v1" }, { nom: "Esclavagiste d'Arcaï", archetype: "DPS DISTANCE", palier: "Normal", visuel: "v2" }],
      renforts: [{ nom: "Molosse de garde", archetype: "TANK CAC", palier: "Petit", visuel: "v3" }] },
      Visuels: { v1: { Description: "a" }, v2: { Description: "b" }, v3: { Description: "c" } } } };
  await p.evaluate((c) => { window.__docs["Systeme_Parties/P1"] = Object.assign(window.__docs["Systeme_Parties/P1"] || {}, { Combat_RP: c }); document.getElementById("fenetre-combat").style.display = "block"; window.appliquerCombatRPDeLaPartie({ Combat_RP: c }); }, c);
  await p.waitForTimeout(500);
  const page1 = await p.evaluate(() => { const f = document.getElementById("validation-ennemis-rp");
    return { cases: f.querySelectorAll("input.garder-ennemi").length, coches: f.querySelectorAll("input.garder-ennemi:checked").length, apparences: f.querySelectorAll("textarea").length, noms: [...f.querySelectorAll(".nom-ennemi-valider")].map(x => x.textContent) }; });
  verifier("une simple liste à cocher (tous cochés), sans les apparences", page1.cases === 3 && page1.coches === 3 && page1.apparences === 0, JSON.stringify(page1));
  await cap("v314_ennemis");
  await p.evaluate(() => { document.querySelectorAll("#validation-ennemis-rp input.garder-ennemi")[2].click(); });
  await p.evaluate(() => document.getElementById("btn-valider-ennemis").click());
  await p.waitForTimeout(400);
  const e = await p.evaluate(() => (window.__docs["Systeme_Parties/P1"].Combat_RP || {}));
  verifier("décoché, le molosse quitte le combat (et son pion ne sera pas dessiné)", !!e.Ennemis_Valides && e.Ennemis.Tirage.renforts.length === 0 && !e.Ennemis.Visuels.v3 && e.Ennemis.Tirage.depart.length === 2, JSON.stringify(e.Ennemis && e.Ennemis.Tirage));
  // La fin du combat (passée en DEV, abandonnée, gagnée…) : la carte et les pions partent de Cloudinary.
  const efface = await p.evaluate(async (c) => { window.__oublies = []; window.oublierImages = async (urls, raison, o) => { window.__oublies.push({ urls, raison, o }); return urls.length; };
    window.REGLAGES_COMBAT_RP.effacerImagesApresMs = 10; window.effacerImagesDuCombatRP(c); await new Promise(r => setTimeout(r, 100)); return window.__oublies; }, c);
  verifier("à la fin du combat, la carte dessinée et les pions des ennemis s'effacent de Cloudinary", efface.length === 1 && efface[0].urls.length === 3 && efface[0].o.seulementHeros === true, JSON.stringify(efface));
  const s = lire("combat_rp.js");
  verifier("… à toute fin : passé ou abandonné en DEV aussi (rendreLArene(c))", /window\.abandonnerCombatRP[\s\S]*?await rendreLArene\(c\)/.test(s) && /finally \{ if \(c\) effacerImagesDuCombat\(c\); \}/.test(s));
});

console.log("\n" + (echecs ? `${echecs} CONTRÔLE(S) EN ÉCHEC` : "TOUS LES CONTRÔLES PASSENT"));
if (erreurs.length) console.log("erreurs de page :", erreurs.slice(0, 5));
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
