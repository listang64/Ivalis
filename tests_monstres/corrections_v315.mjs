// v315 — LE SOMMAIRE (CHIFFRES ROMAINS), LA FICHE (OMBRE NOIRE, LAVIS D'AQUARELLE, TALENTS
// DANS LE LIVRE), LA CARTE DE COMPÉTENCE (SYMBOLES DU COMBAT), PLUS DE TACHES DE CAFÉ,
// MIA_ILLUSTRATEUR (LES VRAIS HÉROS EN RÉFÉRENCE, QUALITÉ MEDIUM, L'ESSENTIEL SEULEMENT).
//
// Lancer : node tests_monstres/corrections_v315.mjs
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
const CAPTURES = process.env.V315_CAPTURES || "";
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
titre("1. LE SOMMAIRE : LES CHIFFRES ROMAINS DE L'ENCRE DES TITRES");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => { const n = document.querySelector(".numero-index"), e = n && n.closest(".entree-index");
    return n ? { n: getComputedStyle(n).color, e: getComputedStyle(e).color } : null; });
  verifier("I-, II-, III- : la même couleur que les titres du sommaire", !!r && r.n === r.e, JSON.stringify(r));
  const css = lire("grimoire_recit.css");
  verifier("… et ceux du sommaire du récit aussi", /\.ligne-sommaire \.num \{[^}]*color: inherit/.test(css));
});

// =========================================================================
titre("2. PLUS DE TACHES DE CAFÉ DANS LE RÉCIT (LES PAPIERS VIEILLIS RESTENT)");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit()); await p.waitForTimeout(2500); await pose();
  const longue = Array.from({ length: 44 }, (_, i) => `Le paragraphe ${i + 1} : la route serpente entre les collines brûlées, et nous marchons longtemps sous un ciel de cuivre, les sandales pleines de poussière, sans croiser âme qui vive.`).join("\n");
  await relayer([{ idDoc: "m1", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: longue, Timestamp: 1000 }], true);
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => ({ pages: document.querySelectorAll(".page-suite .page-recit").length, taches: document.querySelectorAll(".tache-cafe").length,
    ecriture: (getComputedStyle(document.querySelector(".papier-ecriture")).backgroundImage.match(/radial-gradient/g) || []).length }));
  verifier("aucune tache de café sur les pages du récit", r.pages >= 6 && r.taches === 0, `${r.taches} tache(s) sur ${r.pages} pages`);
  verifier("le papier où l'on écrit reste vieilli", r.ecriture >= 4, String(r.ecriture));
  verifier("le code des taches est retiré", !/tacheDeCafe|tache-cafe/.test(lire("grimoire_recit.js") + lire("grimoire_recit.css")));
});

// =========================================================================
titre("3. LA FICHE : L'OMBRE NOIRE SOUS LE NOM, LES LAVIS D'AQUARELLE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_FICHES.ouvrir("H1")); await p.waitForTimeout(2600); await pose();
  const r = await p.evaluate(() => {
    const pied = document.querySelector("#grimoire-fiches-fiche-g .pied-avatar"), nom = document.getElementById("fiche-nom-heros");
    const d = document.getElementById("grimoire-fiches-fiche-d");
    const l = (sel) => { const s = d.querySelector(sel); if (!s) return null; const cs = getComputedStyle(s);
      return { classe: s.getAttribute("class"), formes: s.querySelectorAll("path").length, turb: !!s.querySelector("feTurbulence"), depl: !!s.querySelector("feDisplacementMap"), z: cs.zIndex,
               couleurs: [...new Set([...s.querySelectorAll("path")].map(x => x.getAttribute("fill")))] }; };
    const vital = d.querySelector(".vital-fiche b"), rb = vital.getBoundingClientRect();
    const dessus = document.elementFromPoint(rb.left + rb.width / 2, rb.top + rb.height / 2);
    return { pied: getComputedStyle(pied).backgroundImage, ombre: getComputedStyle(nom).filter,
             pv: l('.vital-fiche:nth-child(1) .lavis'), fat: l('.vital-fiche:nth-child(2) .lavis'), reg: l('.vital-fiche:nth-child(3) .lavis'),
             id: l('.encart-identite .lavis'), bl: l('.encart-blessures-fiche .lavis'), dessus: dessus ? dessus.tagName + "." + dessus.className : "",
             avant: d.querySelector(".encart-identite .lavis path").getAttribute("d"),
             couvre: [".encart-identite", ".vital-fiche", ".encart-blessures-fiche"].map(sel => { const e = d.querySelector(sel), lv = e.querySelector(".lavis"); return +(lv.getBoundingClientRect().width / e.getBoundingClientRect().width).toFixed(2) + "/" + +(lv.getBoundingClientRect().height / e.getBoundingClientRect().height).toFixed(2); }) };
  });
  verifier("sous le nom de l'avatar : une ombre noire (plus de papier clair)", /rgba\(0, 0, 0, 0\.6/.test(r.pied) && !/rgba\(2[0-9]{2}, 1[89][0-9]/.test(r.pied) && /rgba\(0, 0, 0, 0\.95\)/.test(r.ombre), r.pied.slice(0, 90) + " | " + r.ombre.slice(0, 60));
  const aquarelle = (x) => !!x && x.turb && x.depl && x.z === "-1";
  verifier("points de vie : une aquarelle rouge", aquarelle(r.pv) && /lavis-rouge/.test(r.pv.classe), JSON.stringify(r.pv));
  verifier("fatigue : un jaune très léger", aquarelle(r.fat) && /lavis-jaune/.test(r.fat.classe), JSON.stringify(r.fat && r.fat.classe));
  verifier("régénération : un vert très léger", aquarelle(r.reg) && /lavis-vert/.test(r.reg.classe), JSON.stringify(r.reg && r.reg.classe));
  verifier("race et classe : un beige nuancé (plusieurs tons)", aquarelle(r.id) && /lavis-beige/.test(r.id.classe) && r.id.couleurs.length >= 3, JSON.stringify(r.id && r.id.couleurs));
  verifier("blessures : un rouge tacheté (des gouttes)", aquarelle(r.bl) && /lavis-sang/.test(r.bl.classe) && r.bl.formes >= 15, String(r.bl && r.bl.formes));
  verifier("le lavis couvre son encart, un peu plus large que lui", r.couvre.every(x => x.split("/").every(v => Number(v) >= 1 && Number(v) < 1.4)), JSON.stringify(r.couvre));
  verifier("le lavis reste sous le texte (le chiffre se touche)", /^B\./.test(r.dessus) || r.dessus.startsWith("B"), r.dessus);
  const opac = await p.evaluate(() => [...document.querySelectorAll("#grimoire-fiches-fiche-d .lavis > g")].map(g => [g.closest(".lavis").getAttribute("class").split(" ")[1], Number(g.getAttribute("opacity"))]));
  verifier("léger : jaune et vert plus pâles que le rouge", (() => { const o = Object.fromEntries(opac); return o["lavis-jaune"] <= 0.3 && o["lavis-vert"] <= 0.3 && o["lavis-rouge"] > o["lavis-jaune"]; })(), JSON.stringify(opac));
  await p.evaluate(() => window.GRIMOIRE_FICHES.majPlus()); await p.waitForTimeout(300);
  const apres = await p.evaluate(() => document.querySelector("#grimoire-fiches-fiche-d .encart-identite .lavis path").getAttribute("d"));
  verifier("le lavis ne bouge pas d'un affichage à l'autre", apres === r.avant);
  await cap("v315_fiche");
});

// =========================================================================
titre("4. LES TALENTS DANS LES PAGES DE LA FICHE");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const pages = window.GRIMOIRE_FICHES.pages(), i = (c) => window.GRIMOIRE.indexDe(pages[c]);
    const g = pages["tal-g"], d = pages["tal-d"];
    return { ordre: [i("fiche-d"), i("tal-g"), i("tal-d"), i("comp-g")], lignesG: g ? g.querySelectorAll(".ligne-talents-livre").length : 0, lignesD: d ? d.querySelectorAll(".ligne-talents-livre").length : 0,
             etiquettes: document.querySelectorAll(".page-tal .talent-livre").length, total: window.TALENTS.length,
             pris: [...document.querySelectorAll(".page-tal .talent-livre.pris")].map(x => x.dataset.id), prenables: document.querySelectorAll(".page-tal .talent-livre.prenable").length,
             medaillons: document.querySelectorAll(".page-tal .talents-medaillon").length, lien: !!document.querySelector('#grimoire-fiches-fiche-d [data-fa="talents"]') };
  });
  verifier("une double page des talents, juste après la fiche", r.ordre[1] === r.ordre[0] + 1 && r.ordre[2] === r.ordre[1] + 1 && r.ordre[3] === r.ordre[2] + 1 && r.ordre[1] % 2 === 1, JSON.stringify(r.ordre));
  verifier("les sept lignes (Général et les six caracs), chacune sous son médaillon", r.lignesG === 4 && r.lignesD === 3 && r.medaillons === 7, `${r.lignesG}+${r.lignesD}, ${r.medaillons} médaillons`);
  verifier("tous les talents y sont, Préparer est coché", r.etiquettes === r.total && r.pris.includes("TAL_PREPARER"), `${r.etiquettes}/${r.total}, pris ${r.pris}`);
  // Le lien de la fiche mène à la double page.
  await cliquer('#grimoire-fiches-fiche-d [data-fa="talents"]'); await p.waitForTimeout(2600); await pose();
  const ici = await p.evaluate(() => { const pf = window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), t = window.GRIMOIRE.indexDe(window.GRIMOIRE_FICHES.pages()["tal-g"]); return [pf, t]; });
  verifier("« Talents » sur la fiche ouvre leur double page", Math.abs(ici[0] - ici[1]) <= 1, JSON.stringify(ici));
  await cap("v315_talents");
  // Un appui long : l'effet.
  const c = await centre('#grimoire-fiches-tal-g .talent-livre[data-id="TAL_PREPARER"]');
  await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.waitForTimeout(650);
  const bulle = await p.evaluate(() => { const b = document.querySelector(".bulle-aide-fiche.visible"); return b ? b.textContent : ""; });
  await p.mouse.up(); await p.waitForTimeout(900);
  verifier("un appui long : l'effet du talent", /Préparer/.test(bulle) && bulle.length > 20, bulle.slice(0, 90));
  // Un talent qu'on peut prendre : la demande de l'ancienne fenêtre, pour ce héros.
  await p.evaluate(() => { window.PERSOS_JOUEURS_PARTIE[0].xp = 9000; window.GRIMOIRE_FICHES.majPlus(); }); await p.waitForTimeout(400);
  const prenable = await p.evaluate(() => { const t = document.querySelector(".page-tal .talent-livre.prenable"); return t ? t.dataset.id : null; });
  verifier("plus de niveaux : des talents à prendre, cerclés d'or", !!prenable);
  await p.evaluate((id) => document.querySelector(`.page-tal .talent-livre[data-id="${id}"]`).click(), prenable); await p.waitForTimeout(300);
  const pop = await p.evaluate(() => { const x = document.getElementById("popup-talent"); return x ? { txt: x.textContent.slice(0, 80), heros: window.TALENTS_FICHE && window.TALENTS_FICHE.idPersonnage, z: getComputedStyle(x).zIndex } : null; });
  verifier("toucher un talent à prendre : sa demande s'ouvre (pour Kaya)", !!pop && pop.heros === "H1" && Number(pop.z) > 30, JSON.stringify(pop));
  if (pop) {
    await p.evaluate(() => { const pr = document.querySelector("#popup-talent .talents-popup-prendre"); if (pr.disabled) document.querySelector("#popup-talent .talents-popup-carac").click(); pr.click(); });
    await p.waitForTimeout(1500);
    const pris = await p.evaluate((id) => !!document.querySelector(`.page-tal .talent-livre.pris[data-id="${id}"]`), prenable);
    verifier("… pris, il se coche dans le livre", pris);
  }
  const verrou = await p.evaluate(() => !!document.querySelector(".page-tal .talent-livre.verrou .exigence-talent"));
  verifier("les talents hors de portée : pâlis, avec la carac requise", verrou);
});

// =========================================================================
titre("5. LA CARTE DE COMPÉTENCE : LES SYMBOLES DU COMBAT, LE LAVIS GRIS QUI DÉBORDE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => {
    window.CACHE_COMPETENCES_GLOBAL.H1.C4 = { Nom: "Tempête de sable", Initiative: 40, Fatigue: 30, Arme: "Magie",
      Effets_Compiles: [{ nom: "Distance", desc: "Portée de 5 cases." }, { nom: "Attaque physique", desc: "8 dégâts physiques." }, { nom: "Zone", isZone: true, desc: "" }, { nom: "Saignement", desc: "La cible saigne.", isMod: true }],
      Composants: { actions: [{ zoneHexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }], mods: { MOD_DISTANCE: 1 } }] } };
    window.GRIMOIRE_FICHES.ouvrir("H1", "onglet-competences");
  });
  await p.waitForTimeout(2600); await pose();
  await p.evaluate(() => document.querySelector('#grimoire-fiches-comp-g .banniere-livre[data-id="C1"]').click()); await p.waitForTimeout(1800);
  const c1 = await p.evaluate(() => { const c = document.querySelector("#grimoire-fiches-comp-d .carte-encre"); const m = c.querySelector('.encart-montant[data-nature="magique"]');
    const lv = c.querySelector(".lavis"), rc = c.getBoundingClientRect(), rl = lv.getBoundingClientRect();
    return { montant: !!m, symbole: !!(m && m.querySelector("svg.encart-symbole")), chiffre: m ? m.querySelector(".encart-chiffre").textContent : "", couleur: m ? getComputedStyle(m).color : "",
             sous: c.querySelectorAll(".carte-effets-encart > div").length, lavis: lv.getAttribute("class"),
             deborde: [rc.left - rl.left, rl.right - rc.right, rc.top - rl.top, rl.bottom - rc.bottom].map(x => Math.round(x)) }; });
  verifier("les montants avec les symboles du combat (la baguette du magique, le chiffre)", c1.montant && c1.symbole && c1.chiffre === "12", JSON.stringify(c1));
  verifier("… repeints pour le papier (plus le bleu clair du combat)", c1.couleur && c1.couleur !== "rgb(127, 208, 255)" && /rgb\((\d+), (\d+), (\d+)\)/.test(c1.couleur) && RegExp.$3 < 180, c1.couleur);
  verifier("un lavis gris léger dans la carte, qui déborde sur un bord", /lavis-gris/.test(c1.lavis) && c1.deborde.some(x => x > 4), JSON.stringify(c1.deborde));
  await p.evaluate(() => document.querySelector('#grimoire-fiches-comp-g .banniere-livre[data-id="C4"]').click()); await p.waitForTimeout(1800);
  const c4 = await p.evaluate(() => { const c = document.querySelector("#grimoire-fiches-comp-d .carte-encre");
    const d = c.querySelector(".carte-distance"), z = c.querySelector(".carte-zone svg");
    return { distance: d ? d.textContent.trim() : "", cible: !!(d && d.querySelector("svg.encart-symbole")), hex: z ? z.querySelectorAll("polygon").length : 0,
             ombre: z ? getComputedStyle(z).filter : "", physique: !!c.querySelector('.encart-montant[data-nature="physique"] svg.encart-symbole') }; });
  verifier("la distance : la petite cible et la portée", c4.cible && /5/.test(c4.distance), JSON.stringify(c4));
  verifier("la zone dessinée en hexagones, à l'encre (sans l'ombre du combat)", c4.hex >= 4 && c4.ombre === "none", `${c4.hex} hexagones, ${c4.ombre}`);
  verifier("l'explosion des dégâts physiques", c4.physique);
  await cap("v315_carte");
});

// =========================================================================
titre("6. MIA_ILLUSTRATEUR : LES VRAIS HÉROS EN RÉFÉRENCE, LA QUALITÉ, L'ESSENTIEL SEULEMENT");
// =========================================================================
const illustrer = (avis, texteMJ, preparer) => p.evaluate(async ([avis, texteMJ, preparer]) => {
  ["ivalis_OPENAI_API_KEY", "ivalis_CLOUDINARY_CLOUD_NAME", "ivalis_CLOUDINARY_API_KEY", "ivalis_CLOUDINARY_API_SECRET"].forEach(k => localStorage.setItem(k, "banc"));
  window.__deposes = [];
  window.televerserImageDetoureeIvalis = async (source, dossier) => { window.__deposes.push(dossier); return `https://res.cloudinary.com/x/image/upload/q_auto,f_auto/v1/${dossier}/croquis.png`; };
  window.__blobs = [];
  window.imageVersBlobPng = async (url) => { window.__blobs.push(url); return window.__blobsEnPanne ? null : new Blob(["png"], { type: "image/png" }); };
  window.fetchGemini = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(avis) }] } }] }), { status: 200 });
  localStorage.removeItem("ivalis_illus_ecart_P1");
  if (preparer) eval(preparer);
  const id = "mi" + Math.random().toString(36).slice(2, 7);
  const res = await window.illustrerLeRecit({ idMessage: id, texteMJ, texteJoueurs: "", pnjConnus: {} });
  return { res, msg: (window.__docs || {})["Messages_Chat/" + id] || null, blobs: window.__blobs.slice() };
}, [avis, texteMJ, preparer || ""]);
await section(async () => {
  // La liste des joueurs vide (ce qui arrivait) : les héros se lisent quand même dans la partie.
  let n = imagesIA.length;
  const a = await illustrer({ illustrer: true, moment: "dramatique", sujet: "scene", description: "Kaya and Thorin stand back to back as a giant scorpion charges.", heros: [], pnj_nommes: [] },
    "Le scorpion géant fond sur Kaya et Thorin.",
    `window.__sauve = window.PERSOS_JOUEURS_PARTIE; window.PERSOS_JOUEURS_PARTIE = []; window.PERSOS_PARTIE[0].urlPortraitReference = "portrait-kaya.png";`);
  await p.evaluate(() => { window.PERSOS_JOUEURS_PARTIE = window.__sauve; });
  const cr = imagesIA.slice(n).find(x => /pen-and-ink/.test(x.corps));
  verifier("la liste des joueurs vide : Kaya, nommée, part quand même en référence", !!cr && /edits/.test(cr.url) && (cr.corps.match(/name="image\[\]"/g) || []).length === 1 && /image 1 is Kaya \(a woman, Humain, Pisteur\)/.test(cr.corps), cr ? cr.url : "aucun croquis");
  verifier("… comme l'avatar rhabillé : son portrait de référence, en PNG sur le magenta", a.blobs.includes("portrait-kaya.png"), JSON.stringify(a.blobs));
  verifier("… Thorin, qui n'a pas encore de portrait, décrit en mots", !!cr && /Thorin is a man|Thorin is Nain|Thorin is [^.]*Nain/.test(cr.corps), "");
  verifier("le dessinateur doit les rendre reconnaissables, sans personne d'autre", !!cr && /clearly recognisable/.test(cr.corps) && /Do not add any other person/.test(cr.corps));
  verifier("qualité « medium » (plus de trait pixelisé), dépôt en q_auto:best", !!cr && /name="quality"\r\n\r\nmedium/.test(cr.corps) && !!a.msg && /q_auto:best/.test(a.msg.Illustration.Url), a.msg ? a.msg.Illustration.Url : "");
  verifier("seulement l'essentiel : pas de décor si le lieu n'est pas le sujet", !!cr && /No background, no scenery/.test(cr.corps) && /strictement important/.test(lire("illustrations_recit.js")));
  // L'agent parle du groupe sans le nommer : les héros que cite le Narrateur.
  n = imagesIA.length;
  await illustrer({ illustrer: true, moment: "drôle", sujet: "scene", description: "The adventurers flee from an angry goat.", heros: [], pnj_nommes: [] }, "La chèvre poursuit Kaya à travers le marché.");
  const cr2 = imagesIA.slice(n).find(x => /pen-and-ink/.test(x.corps));
  verifier("« the adventurers » : ceux que le Narrateur cite (Kaya) partent en référence", !!cr2 && /image 1 is Kaya/.test(cr2.corps) && /With Kaya/.test(cr2.corps), cr2 ? "" : "aucun");
  // Le portrait illisible : pas de croquis plutôt que des inconnus.
  n = imagesIA.length;
  const c = await illustrer({ illustrer: true, moment: "attachant", sujet: "scene", description: "Kaya shares her bread with a stray dog.", heros: ["Kaya"], pnj_nommes: [] }, "Kaya partage son pain.", "window.__blobsEnPanne = true;");
  await p.evaluate(() => { window.__blobsEnPanne = false; });
  verifier("le portrait d'un héros illisible : pas de croquis (jamais d'inconnus à sa place)", imagesIA.length === n && !(c.msg && c.msg.Illustration), `${imagesIA.length - n} image(s)`);
});

console.log(erreurs.length ? "\nErreurs de page : " + erreurs.slice(0, 5).join(" | ") : "");
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
