// v367 — LA LISTE DES DEMANDES DE NICO : le héros actif, la Forge (bouton, armes, LIA),
// le reset des caractéristiques, les images du récit (armes, ennemis, bords), le combat
// (bouton pour tous, plus de RÉSOUDRE, plus de chiffres sur les jauges, retour après la
// défaite) et les races des pions ennemis.
// (La mise en place du livre : celle de corrections_v316.)
//
// Lancer : node tests_monstres/corrections_v367.mjs
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
  export const deleteDoc = async (r) => { delete docs()[r.chemin]; };
  export const addDoc = async (c, d) => { (window.__ajouts = window.__ajouts || []).push({ col: c.col, data: d }); const id = "A" + window.__ajouts.length; docs()[c.col + "/" + id] = d; return { id }; };
  export const onSnapshot = () => () => {}; export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
  export const runTransaction = async (_db, f) => f({ get: async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => d || {} }; },
      update: (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d, tx: true }); docs()[r.chemin] = Object.assign({}, docs()[r.chemin] || {}, d); } });
  export const increment = (k) => k; export const deleteField = () => null;
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const serverTimestamp = () => Date.now();
  export class FieldPath {} export const Timestamp = { now: () => Date.now() };
`;
const CAPTURES = process.env.V367_CAPTURES || "";
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



const consoleErreurs = [];
p.on('console', m => { if (m.type() === 'error') consoleErreurs.push(m.text().slice(0, 300)); });
p.on('dialog', d => d.accept());
const code = (f) => lire(f);

// =========================================================================
titre("1. LA LISTE DES PERSONNAGES : LA CASE DU HÉROS ACTIF (UN SEUL PAR JOUEUR)");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.__actifs = []; window.basculerActivationPersonnage = async (id, actif) => {
    window.__actifs.push([id, actif]); [window.PERSOS_PARTIE, window.PERSOS_JOUEURS_PARTIE].forEach(l => (l || []).forEach(x => { if (x.idPersonnage === id) x.actif = actif; })); }; });
  await p.evaluate(() => window.GRIMOIRE_FICHES.allerAuxAventuriers()); await p.waitForTimeout(2600); await pose();
  const r = await p.evaluate(() => ({ cases: [...document.querySelectorAll(".case-actif")].map(b => [b.dataset.id, b.classList.contains("cochee")]),
    lyra: !!document.querySelector('.case-actif[data-id="H2"]') }));
  await cap("v367_clans");
  verifier("une case devant chacun de MES héros (Kaya, Thorin), pas devant ceux des autres (Lyra)", r.cases.length === 2 && !r.lyra, JSON.stringify(r));
  await cliquer('.case-actif[data-id="H3"]'); await p.waitForTimeout(1500);
  const r2 = await p.evaluate(() => ({ appels: window.__actifs, actifs: window.PERSOS_JOUEURS_PARTIE.map(h => [h.idPersonnage, h.actif !== false]),
    cases: [...document.querySelectorAll(".case-actif")].map(b => [b.dataset.id, b.classList.contains("cochee")]) }));
  verifier("cocher Thorin : Thorin actif, Kaya au repos (basculerActivationPersonnage)",
           JSON.stringify(r2.appels) === '[["H1",false]]' && r2.actifs.find(x => x[0] === "H3")[1] && !r2.actifs.find(x => x[0] === "H1")[1], JSON.stringify(r2));
  verifier("…la case de Thorin cochée, celle de Kaya vide", r2.cases.some(c => c[0] === "H3" && c[1]) && r2.cases.some(c => c[0] === "H1" && !c[1]), JSON.stringify(r2.cases));
  await cliquer('.case-actif[data-id="H1"]'); await p.waitForTimeout(1500);
  const r3 = await p.evaluate(() => window.__actifs.slice(1));
  verifier("recocher Kaya : Kaya revient, Thorin passe au repos", JSON.stringify(r3) === '[["H1",true],["H3",false]]', JSON.stringify(r3));
});

// =========================================================================
titre("2. LA FORGE : LE GROS BOUTON, LES ARMES EN MAIN, LIA GARDE L'ARME CHOISIE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_FICHES.ouvrir("H1", "onglet-competences")); await p.waitForTimeout(2600); await pose();
  const t = await p.evaluate(() => { const b = document.querySelector("#grimoire-fiches-comp-g .bouton-forger"); const cs = getComputedStyle(b);
    return { taille: parseFloat(cs.fontSize), bord: !!b.querySelector(":scope > .cadre-main") /* v372 : le cadre tracé à la main */, lien: (document.querySelector("#grimoire-fiches-comp-g .lien-fiche:not(.bouton-forger)") ? parseFloat(getComputedStyle(document.querySelector("#grimoire-fiches-comp-g .lien-fiche:not(.bouton-forger)")).fontSize) : 0) }; });
  verifier("« Forger une compétence » : un vrai bouton, plus gros que les liens de la page", t.taille > 1.4 * (t.lien || 10) && t.bord, JSON.stringify(t));
  await cap("v367_bouton_forger");
  await cliquer("#grimoire-fiches-comp-g .bouton-forger"); await p.waitForTimeout(2600); await pose();
  // Une arme légère en main.
  await p.evaluate(() => { window.outilsForge.typesArmesEquipeesPourForge = () => new Set(["Arme légère CAC"]); }); 
  await p.evaluate(() => window.rafraichirForge()); await p.waitForTimeout(400);
  const visibles = () => p.evaluate(() => [...document.querySelectorAll("#forge-livre-armes .arme-forge")].filter(b => !b.hidden && b.offsetParent).map(b => b.dataset.arme));
  const v1 = await visibles();
  verifier("avant le choix : l'arme en main (légère), Magie et Sans arme — pas les autres", JSON.stringify(v1) === '["Arme légère CAC","Magie","Sans arme / Arme rp"]', JSON.stringify(v1));
  await cliquer('#forge-livre-armes [data-arme="Sans arme / Arme rp"]'); await p.waitForTimeout(800);
  const v2 = await visibles();
  await cap("v367_codex_arme");
  const etat2 = await p.evaluate(() => window.forgeState.armePrincipale);
  verifier("Sans arme choisie : elle reste seule, les autres disparaissent", JSON.stringify(v2) === '["Sans arme / Arme rp"]' && etat2 === "Sans arme / Arme rp", JSON.stringify(v2));
  await cliquer('#forge-livre-armes [data-arme="Sans arme / Arme rp"]'); await p.waitForTimeout(500);
  const v3 = await visibles();
  verifier("la toucher de nouveau rouvre le choix (sans rien changer encore)", v3.length === 3 && (await p.evaluate(() => window.forgeState.armePrincipale)) === "Sans arme / Arme rp", JSON.stringify(v3));
  await cliquer('#forge-livre-armes [data-arme="Magie"]'); await p.waitForTimeout(600);
  verifier("…et une autre arme la remplace", JSON.stringify(await visibles()) === '["Magie"]' && (await p.evaluate(() => window.forgeState.armePrincipale)) === "Magie");
  await cliquer('#forge-livre-armes [data-arme="Magie"]'); await p.waitForTimeout(300);
  await cliquer('#forge-livre-armes [data-arme="Sans arme / Arme rp"]'); await p.waitForTimeout(600);
  verifier("LIA : l'arme choisie dans la Forge est la seule qu'elle peut prendre (plus d'« Arme légère » à la place de « Sans arme »)",
           /const choisie = window\.forgeState && window\.forgeState\.armePrincipale;\s*if \(choisie\) return \[choisie\];/.test(code("lia_forge.js")));
  await cliquer("#grimoire-fiches-forge-g .fermer-forge"); await p.waitForTimeout(2000); await pose();
});

// =========================================================================
titre("3. LE RESET DES CARACTÉRISTIQUES (ONGLET DEV DE LA FICHE)");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { localStorage.setItem("ivalis_DEV_MODE", "on"); window.__docs = window.__docs || {}; window.__docs["Caracteristiques/H1"] = { force: 10, dex: 15, con: 12, int: 13, sag: 10, cha: 8 };
    // L'ancienne fiche cachée n'a pas (encore) le héros : c'était le bug.
    const c = document.getElementById("champ-id-personnage"); if (c) c.value = ""; });
  await p.evaluate(() => window.GRIMOIRE_FICHES.ouvrir("H1", "onglet-dev")); await p.waitForTimeout(3000); await pose();
  await p.evaluate(() => { const c = document.getElementById("champ-id-personnage"); if (c) c.value = ""; document.getElementById("btn-dev-reinit-caracs").scrollIntoView({ block: "center" }); });
  await p.waitForTimeout(400);
  const c = await centre("#btn-dev-reinit-caracs");
  await p.mouse.click(c.x, c.y); await p.waitForTimeout(2500);
  const r = await p.evaluate(() => ({ doc: !!window.__docs["Caracteristiques/H1"], ls: localStorage.getItem("ivalis_caracs_H1"),
    repartir: !!document.querySelector('#grimoire-fiches-fiche-d .encart-caracs [data-fa="repartir"]') }));
  verifier("le bouton marche : les caractéristiques de Kaya (le héros ouvert) sont effacées", !r.doc && !r.ls, JSON.stringify(r));
  verifier("…et à leur place, sur la fiche, le bouton « Répartir ses caractéristiques »", r.repartir, JSON.stringify(r));
  await p.evaluate(() => localStorage.removeItem("ivalis_DEV_MODE"));
});

// =========================================================================
titre("4. LE COMBAT : LE BOUTON POUR TOUS, PLUS DE RÉSOUDRE, PLUS DE CHIFFRES, LE RETOUR APRÈS LA DÉFAITE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.__ouvert = 0; window.ouvrirCombat = () => { window.__ouvert++; };
    window.ID_PARTIE_COURANTE = window.ID_PARTIE_COURANTE || "P1";
    window.appliquerCombatRPDeLaPartie({ Combat_RP: { Id: "C1", Etat: "en_cours", Adversaires: "des contrebandiers", ID_Rencontre: "R1" } }); });
  await p.waitForTimeout(400);
  const b = await p.evaluate(() => { const x = document.getElementById("bouton-rejoindre-combat"); return x ? { texte: x.textContent, pos: getComputedStyle(x).position } : null; });
  verifier("un combat en cours : le bouton « Rejoindre le combat » flotte pour ce joueur, où qu'il soit", !!b && /Rejoindre le combat/.test(b.texte) && b.pos === "fixed", JSON.stringify(b));
  await cliquer("#bouton-rejoindre-combat"); await p.waitForTimeout(300);
  verifier("…il ouvre la carte du combat", (await p.evaluate(() => window.__ouvert)) === 1);
  await p.evaluate(() => { const f = document.getElementById("fenetre-combat"); if (f) f.style.display = "block"; }); await p.waitForTimeout(1300);
  verifier("…et disparaît tant que la fenêtre de combat est ouverte", !(await p.evaluate(() => !!document.getElementById("bouton-rejoindre-combat"))));
  await p.evaluate(() => { const f = document.getElementById("fenetre-combat"); if (f) f.style.display = "none"; window.appliquerCombatRPDeLaPartie({}); }); await p.waitForTimeout(1300);
  verifier("plus de combat : plus de bouton", !(await p.evaluate(() => !!document.getElementById("bouton-rejoindre-combat"))));
  const res = await p.evaluate(() => { window.poserBoutonsCibleUnique("C1"); return { barre: !!document.getElementById("barre-ciblage-resolution"), resoudre: !!document.getElementById("btn-resoudre-carte") }; });
  verifier("le ciblage ne pose plus la barre RÉSOUDRE / ANNULER (la cible et son ✔ suffisent)", !res.barre && !res.resoudre, JSON.stringify(res));
  verifier("…le ✔ vient quand même s'il reste des LOTS de Traction à poser (pas de blocage faute de cibles)",
           /tractionRestante > 0 && !window\.tractionEnLots\(window\.ETAT_CIBLAGE, phase\)/.test(code("moteur_effets.js")));
  const j = await p.evaluate(() => { const d = document.createElement("div"); d.style.width = "60px"; document.body.appendChild(d);
    const bloc = window.poserJaugesSelection(d, { idPersonnage: "H1", prenom: "Kaya", pv: 30, pvMax: 62, energie: 50, energieMax: 100, PV_Actuel: 30, PV_Max: 62 });
    const r = { bloc: !!bloc, chiffres: d.querySelectorAll(".jauge-selection-chiffre").length + document.querySelectorAll(".jauges-selection-token .jauge-selection-chiffre").length };
    d.remove(); return r; });
  verifier("les jauges sous un pion cliqué : plus de chiffres dessus", j.chiffres === 0, JSON.stringify(j));
  verifier("après une défaite, un poste encore au combat revient aussi au récit quand le combat passe en narration",
           /c\.Etat === "narration"\) \{[\s\S]{0,700}suivreLaFin\(c, partieVue\)/.test(code("combat_rp.js")));
});

// =========================================================================
titre("5. LES PIONS ENNEMIS SUIVENT LES PEUPLES DU MONDE (RENFORTS COMPRIS)");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    window.RACES_MONDE = [{ Nom: "Vargen", Descriptif_Physique: "grand peuple-loup, museau, fourrure grise, crocs", Place_Monde: "" },
                          { Nom: "Ankylar", Descriptif_Physique: "peau écailleuse ocre, crête osseuse, sans cornes", Place_Monde: "" }];
    const tous = [{ m: { archetype: "DPS CAC", palier: "Normal" }, moment: "départ" }, { m: { archetype: "SOUTIEN", palier: "Normal" }, moment: "renfort" }];
    const habits = { creatures: [{ numero: 1, nom: "Pillard vargen", visuel: "pillard" }, { numero: 2, nom: "Guérisseuse de la bande", visuel: "soin" }],
                     visuels: [{ cle: "pillard", peuple: "Vargen", description_physique: "a hulking raider with a bronze axe" },
                               { cle: "soin", peuple: "", description_physique: "an Ankylar healer with a staff" }] };
    const { creatures, visuels } = window.habillerEnnemisCombatRP(tous, habits, null, []);
    return { peuples: Object.values(visuels).map(v => v.Peuple), pion: window.descriptionDuPionCombatRP(visuels.v1), renfort: window.descriptionDuPionCombatRP(visuels.v2),
             bete: window.peupleDuVisuelCombatRP("bete", "a grey wolf"), invente: window.peupleDuVisuelCombatRP("Orc", "a horned man") };
  });
  verifier("chaque visuel garde son peuple (celui de l'IA, sinon celui que la description nomme) — le renfort aussi", JSON.stringify(r.peuples) === '["Vargen","Ankylar"]', JSON.stringify(r.peuples));
  verifier("le pion part du peuple et de son apparence du Grimoire, en tête, sans « homme à cornes »",
           /^A Vargen, one of this world's own peoples\. .*fourrure grise.*Do not turn them into a generic human, nor add horns/.test(r.pion) && /Ankylar.*sans cornes/.test(r.renfort), r.pion.slice(0, 160));
  verifier("une bête reste une bête ; un peuple inventé n'est pas retenu", r.bete === "bete" && r.invente === "", JSON.stringify([r.bete, r.invente]));
  verifier("la consigne demande le peuple de chaque visuel, renforts compris", /"peuple" : pour CHAQUE visuel, renforts compris/.test(code("combat_rp.js")));
});

// =========================================================================
titre("6. LES IMAGES DU RÉCIT : LES ARMES, LES ENNEMIS, LES BORDS");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => ({ armes: window.armesDuHerosIllustrateur(window.PERSOS_PARTIE[0]),
    ennemis: (() => { window.appliquerCombatRPDeLaPartie({ Combat_RP: { Id: "C2", Etat: "narration", ID_Rencontre: "R2", Ennemis: { Visuels: { v1: { Description: "a hulking raider", Peuple: "Vargen" } },
      Tirage: { depart: [{ nom: "Pillard vargen", visuel: "v1" }], renforts: [{ nom: "Pillard vargen le Second", visuel: "v1" }] } } } }); return window.ennemisDecritsCombatRP(); })() }));
  verifier("les armes en main d'un héros (main droite, main gauche) partent avec lui", r.armes.length === 1 && r.armes[0].nom === "Glaive de bronze", JSON.stringify(r.armes));
  verifier("l'illustrateur joint l'image de chaque arme en référence (sinon la nomme), après les portraits",
           /refs\.push\(\{ nom: `\$\{h\.prenom\}'s weapon \(\$\{o\.nom\}\)`, url: o\.image, arme: true \}\)/.test(code("illustrations_recit.js"))
           && /the heroes' WEAPONS/.test(code("illustrations_recit.js")));
  verifier("les ennemis du combat, avec la description de leur pion (peuple compris), pour l'image",
           r.ennemis.length === 1 && r.ennemis[0].noms.length === 2 && /^A Vargen/.test(r.ennemis[0].description), JSON.stringify(r.ennemis).slice(0, 200));
  verifier("…l'illustrateur les décrit ainsi quand ils sont dans la scène", /The enemies in this scene look exactly like this/.test(code("illustrations_recit.js")));
  verifier("l'image en double page se fond dans le papier (haut, bas, bord extérieur) et en prend le grain",
           /\.fond-classe\.fond-recit\.droite \{[\s\S]*mask-composite: intersect/.test(code("grimoire_recit.css")) && /\.fond-classe\.fond-recit img \{ mix-blend-mode: multiply/.test(code("grimoire_recit.css")));
  verifier("version 367 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(code("trace_combat.js")) || [])[1]) >= 367 && JSON.parse(code("version.json")).version >= 367);
});

console.log(erreurs.length ? "\nErreurs de page : " + erreurs.slice(0, 5).join(" | ") : "");
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
