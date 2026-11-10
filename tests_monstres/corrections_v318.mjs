// v318 — MIA_ILLUSTRATEUR : LE CHRONIQUEUR JAMAIS DESSINÉ, PERSONNE D'AUTRE, QUE DU NOIR SUR LE
// MAGENTA ; LE CROQUIS CENTRÉ SUR LA PAGE.
//
// Lancer : node tests_monstres/corrections_v318.mjs
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
const CAPTURES = process.env.V318_CAPTURES || "";
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


// =========================================================================
titre("1. LE CHRONIQUEUR N'EST JAMAIS DESSINÉ, PERSONNE D'AUTRE NON PLUS");
// =========================================================================
await section(async () => {
  const s = (t) => p.evaluate((t) => window.sansLeNarrateurBanc(t), t);
  verifier("une phrase sur « je » (le chroniqueur) sort de la description", await s("Kaya slips on a wet amphora while Varos laughs. I watch from the doorway.") === "Kaya slips on a wet amphora while Varos laughs.");
  verifier("… « We » aussi, majuscule comprise", await s("We stand around the fire. Kaya sings.") === "Kaya sings.");
  const tout = await s("The narrator holds a torch behind Kaya and Thorin as they open the chest.");
  verifier("… et s'il n'y a que lui, la phrase reste, sans lui", !/narrator/i.test(tout) && /Kaya and Thorin/.test(tout), tout);
  verifier("une description sans lui ne bouge pas", await s("Kaya and Thorin face a giant scorpion.") === "Kaya and Thorin face a giant scorpion.");
  const prompt = lire("illustrations_recit.js");
  verifier("l'agent le sait : le narrateur (le « je », le « nous ») n'apparaît jamais", /LE NARRATEUR N'APPARAÎT JAMAIS/.test(prompt) && /PERSONNE D'AUTRE/.test(prompt));
});

// =========================================================================
titre("2. LE DESSIN : LE COMPTE EXACT, QUE DU NOIR SUR LE MAGENTA");
// =========================================================================
const illustrer = (avis, texteMJ) => p.evaluate(async ([avis, texteMJ]) => {
  ["ivalis_OPENAI_API_KEY", "ivalis_CLOUDINARY_CLOUD_NAME", "ivalis_CLOUDINARY_API_KEY", "ivalis_CLOUDINARY_API_SECRET"].forEach(k => localStorage.setItem(k, "banc"));
  window.PERSOS_PARTIE[0].urlPortraitReference = "portrait-kaya.png";
  window.televerserImageDetoureeIvalis = async (source, dossier) => `https://res.cloudinary.com/x/image/upload/q_auto,f_auto/v1/${dossier}/croquis.png`;
  window.imageVersBlobPng = async () => new Blob(["png"], { type: "image/png" });
  window.fetchGemini = async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(avis) }] } }] }), { status: 200 });
  localStorage.removeItem("ivalis_illus_ecart_P1"); localStorage.removeItem("ivalis_illus_ecart_" + (window.ID_PARTIE_COURANTE || ""));
  const id = "mi" + Math.random().toString(36).slice(2, 7);
  await window.illustrerLeRecit({ idMessage: id, texteMJ, texteJoueurs: "", pnjConnus: { Varos: { Nom_PNJ: "Varos", URL_Cloudinary: "https://x/PNJ/v.png", Race: "Humain" } } });
  return (window.__docs || {})["Messages_Chat/" + id] || null;
}, [avis, texteMJ]);
await section(async () => {
  const n = imagesIA.length;
  await illustrer({ illustrer: true, moment: "drôle", sujet: "scene", description: "Kaya slips on a wet amphora while Varos laughs, a stray wolf sniffing the spilled wine. I watch from the doorway, laughing.",
                    heros: ["Kaya"], pnj_dans_le_croquis: ["Varos"], autres: ["a stray wolf"], nombre: 3, pnj_nommes: [] }, "Varos éclate de rire quand Kaya glisse sur une amphore ; je ris aussi depuis le seuil.");
  const cr = imagesIA.slice(n).find(x => /pen-and-ink/.test(x.corps));
  verifier("le dessinateur reçoit le compte exact et les noms (Kaya, Varos, le loup), personne d'autre", !!cr && /EXACTLY 3 figures in the whole drawing: Kaya, Varos, a stray wolf/.test(cr.corps) && /no narrator, no chronicler, no onlooker, no crowd/.test(cr.corps), cr ? "" : "aucun croquis");
  verifier("la phrase du chroniqueur (« I watch from the doorway ») ne part pas au dessinateur", !!cr && !/I watch|doorway/.test(cr.corps));
  verifier("que de l'encre NOIRE (v325 : sur un fond blanc, retiré au dépôt), pas de couleur", !!cr && /PURE BLACK INK ON A PURE WHITE BACKGROUND/.test(cr.corps) && /no colour at all/.test(cr.corps) && !/brown-black/.test(cr.corps));
  // Un lieu sans personne.
  const n2 = imagesIA.length;
  await illustrer({ illustrer: true, moment: "lieu", sujet: "scene", description: "A ruined temple of Hera half swallowed by the dunes at dusk.", heros: [], pnj_dans_le_croquis: [], autres: [], nombre: 0, pnj_nommes: [] }, "Le temple d'Héra se dresse, à moitié englouti par les dunes.");
  const lieu = imagesIA.slice(n2).find(x => /pen-and-ink/.test(x.corps));
  verifier("un lieu : « personne du tout » dans le dessin (pas même un passant)", !!lieu && /No person at all in the drawing/.test(lieu.corps), lieu ? "" : "aucun croquis");
});

// =========================================================================
titre("3. LE CROQUIS, CENTRÉ SUR LA PAGE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit()); await p.waitForTimeout(2500); await pose();
  const ill = (k) => ({ Url: `https://res.cloudinary.com/x/image/upload/v1/Recit/Illustrations/croquis_${k}.png`, Ratio: 1.5, Taille: 0.5 + k * 0.08 });
  const msgs = [];
  for (let k = 0; k < 4; k++) msgs.push({ idDoc: "c" + k, ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: `Le moment ${k + 1} : la route continue, et quelque chose arrive.`, Timestamp: 1000 + k * 10, Illustration: ill(k) });
  await relayer(msgs, true);
  await p.waitForTimeout(900);
  // (v328 : une demi-page chacun, ils s'étalent sur plusieurs doubles pages : on mesure ceux qu'on voit)
  const r = await p.evaluate(() => [...document.querySelectorAll(".page-recit .croquis-recit")].filter(f => f.offsetWidth > 0 && f.getBoundingClientRect().width > 0).map(f => {
    const c = f.closest(".contenu-page"), rc = c.getBoundingClientRect(), rf = f.getBoundingClientRect(), st = getComputedStyle(c);
    const gauche = rc.left + parseFloat(st.paddingLeft), droite = rc.right - parseFloat(st.paddingRight);
    return { classe: f.className, ecart: Math.round(((rf.left + rf.right) / 2 - (gauche + droite) / 2) / Math.max(1, droite - gauche) * 1000) / 10 };
  }));
  verifier(`chaque croquis est au milieu de la page (${r.length} croquis visibles)`, r.length >= 2 && r.every(x => /place-milieu/.test(x.classe) && Math.abs(x.ecart) <= 2.5), JSON.stringify(r));
  await cap("v318_croquis");
});


// =========================================================================
titre("4. LA FORGE : LE BANDEAU DÉFILE, DES LAVIS DANS SES BULLES, PLUS DE « + », LE CODEX SANS BLANC");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_FICHES.ouvrir("H1", "onglet-competences")); await p.waitForTimeout(2600); await pose();
  await cliquer("#grimoire-fiches-comp-g .bouton-forger"); await p.waitForTimeout(2600); await pose();
  await p.evaluate(() => {
    const E = (id, Nom, Effet_Base, Cout_PT) => ({ id, Nom, Modificateur: "AUCUN", Effet_Base, Cout_PT, Type_Mecanique: "Action/Global", Valeur: "6", Pourcent_Base: "0" });
    window.forgeState.effetsBDD = [E("E1", "Attaque magique", "Inflige 6 dégâts magiques à la cible.", "2"), E("E2", "Soin", "Rend 6 PV à un allié.", "2")];
    window.selectionnerArme("Magie");
  });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    const g = document.querySelector("#grimoire-fiches-forge-g"), pg = g.querySelector(".page-forge"), bandeau = g.querySelector(".forge-bandeau");
    const avant = bandeau.getBoundingClientRect().top;
    pg.style.height = "60%"; pg.scrollTop = 200;
    const apres = bandeau.getBoundingClientRect().top;
    pg.scrollTop = 0; pg.style.height = "";
    const ligne = document.querySelector("#grimoire-fiches-forge-d .forge-grimoire-ligne");
    const blancs = [...document.querySelectorAll("#grimoire-fiches-forge-d *")].filter(e => { const cs = getComputedStyle(e);
      const m = cs.backgroundColor.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?/);
      const blancFond = m && +m[1] > 200 && +m[2] > 200 && +m[3] > 200 && (m[4] === undefined || +m[4] > 0.15);
      return blancFond || /linear-gradient\(.*rgb\((2[3-5]\d), (2[3-5]\d), (2[0-5]\d)\)/.test(cs.backgroundImage); }).length;
    return { position: getComputedStyle(bandeau).position, bouge: Math.round(avant - apres), lavis: [...g.querySelectorAll(".lavis-bulle")].map(l => l.getAttribute("class").split(" ")[2]),
             plus: getComputedStyle(g.querySelector(".forge-ajouter")).display, ligne: ligne ? getComputedStyle(ligne).backgroundImage.slice(0, 60) : "", blancs };
  });
  verifier("le bandeau (cap, fatigue, initiative) défile avec la page, il ne reste plus figé", r.position === "static" && r.bouge > 100, JSON.stringify({ position: r.position, bouge: r.bouge }));
  verifier("un lavis léger dans chaque bulle (cap beige, fatigue jaune, initiative bleue, aide verte)", r.lavis.join() === "lavis-beige,lavis-jaune,lavis-bleu,lavis-vert", r.lavis.join());
  verifier("plus de rond « + » sous la technique", r.plus === "none", r.plus);
  verifier("le codex : plus de fond blanc sous les effets, un voile beige léger", r.blancs === 0 && /radial-gradient/.test(r.ligne) && /196, 154, 98/.test(r.ligne), JSON.stringify({ blancs: r.blancs, ligne: r.ligne }));
  await cap("v318_forge");
  const bulles = await centre("#grimoire-fiches-forge-g .forge-bandeau");
  if (CAPTURES && bulles) await p.screenshot({ path: CAPTURES + "/v318_bulles.png", clip: { x: bulles.x - bulles.w / 2 - 10, y: bulles.y - bulles.h / 2 - 10, width: bulles.w + 20, height: bulles.h + 20 } });
  await cliquer("#grimoire-fiches-forge-g .fermer-forge"); await p.waitForTimeout(2200); await pose();
  const dehors = await p.evaluate(() => { const l = document.querySelector("#modale-creation-competence .lavis-bulle"); return l ? getComputedStyle(l).display : "aucun"; });
  verifier("hors du livre (la Forge d'avant, en combat), les lavis ne se voient pas", dehors === "none" || dehors === "aucun", dehors);
});

// =========================================================================
titre("5. L'ORDRE DES PAGES DE LA FICHE : FICHE, COMPÉTENCES, INVENTAIRE, TALENTS, FORGE, DEV");
// =========================================================================
await section(async () => {
  const o = await p.evaluate(() => { const pg = window.GRIMOIRE_FICHES.pages(), i = (c) => window.GRIMOIRE.indexDe(pg[c]);
    return ["fiche-g", "fiche-d", "comp-g", "comp-d", "inv-g", "inv-d", "tal-g", "tal-d", "tal2-g", "tal2-d", "forge-g", "forge-d"].map(i); });
  verifier("l'avatar et les caracs, puis les compétences, l'inventaire, les talents, la Forge", o.every((x, k) => !k || x === o[k - 1] + 1) && o[0] % 2 === 1, JSON.stringify(o));
  await p.evaluate(() => { localStorage.setItem("ivalis_DEV_MODE", "on"); window.GRIMOIRE_FICHES.majPlus(); }); await p.waitForTimeout(1500);
  const dev = await p.evaluate(() => { const pg = window.GRIMOIRE_FICHES.pages(); return [window.GRIMOIRE.indexDe(pg["forge-d"]), window.GRIMOIRE.indexDe(pg["dev-g"])]; });
  verifier("… et le panneau DEV tout au bout", dev[1] === dev[0] + 1, JSON.stringify(dev));
  await p.evaluate(() => { localStorage.removeItem("ivalis_DEV_MODE"); window.GRIMOIRE_FICHES.majPlus(); }); await p.waitForTimeout(800);
});

// =========================================================================
titre("6. LE RÉCIT EN PALATINO ; LE MARQUE-PAGE DU RÉCIT : LA PLUME DU PAPIER D'ÉCRITURE, PLUS PETIT");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit()); await p.waitForTimeout(2500); await pose();
  const r = await p.evaluate(() => {
    const para = document.querySelector(".page-recit .para-recit"), nom = document.querySelector(".page-recit .para-recit b, .page-recit .para-recit .nom-heros");
    const mp = document.getElementById("grimoire-marque-recit"), autre = document.getElementById("grimoire-marque-page");
    const plumeLivre = [...mp.querySelectorAll("svg path")].map(x => x.getAttribute("d")).join("|");
    const plumePapier = [...document.querySelectorAll("#recit-envoyer svg path")].map(x => x.getAttribute("d")).join("|");
    return { police: para ? getComputedStyle(para).fontFamily : "", nom: nom ? getComputedStyle(nom).fontFamily : "(pas de nom)", plumeLivre, plumePapier,
             largeur: [mp.offsetWidth, autre.offsetWidth], hauteur: [mp.offsetHeight, autre.offsetHeight] };
  });
  verifier("le récit s'écrit en Palatino", /^"?Palatino/.test(r.police), r.police);
  verifier("le marque-page du récit porte exactement la plume du papier où l'on écrit", r.plumeLivre && r.plumeLivre === r.plumePapier, r.plumeLivre.slice(0, 60));
  verifier("… et il est plus petit que les autres", r.largeur[0] < r.largeur[1] && r.hauteur[0] < r.hauteur[1], JSON.stringify(r));
  const mp = await centre("#grimoire-marque-recit");
  if (CAPTURES && mp) await p.screenshot({ path: CAPTURES + "/v318_marques.png", clip: { x: mp.x - 200, y: Math.max(0, mp.y - mp.h / 2 - 20), width: 300, height: mp.h + 40 } });
  await cap("v318_recit");
});

// =========================================================================
titre("7. LES DÉPENSES : TOUTES LES IMAGES, LEUR VRAI PRIX, LE COMBAT, LE CACHE, LA TVA");
// =========================================================================
await section(async () => {
  await p.route('**/api.openai.com/v1/images/edits', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ data: [{ b64_json: "AAAA" }], usage: { input_tokens: 3000, input_tokens_details: { text_tokens: 400, image_tokens: 2600 }, output_tokens: 1056 } }) }));
  const r = await p.evaluate(async () => {
    const cache = window.coutGeminiUSD("gemini-3.8-flash", { envoyes: 1e6, cache: 1e6, recus: 0, reflexion: 0 }, new Date("2026-11-05"));
    const grille = [window.coutImageUSD("medium", "1536x1024", "gpt-image-2", null, 0), window.coutImageUSD("low", "1024x1024", "gpt-image-2", null, 0)];
    // Hors d'un tour du MJ : une image générée (sans usage) et une image retouchée (avec usage).
    if (window.DEPENSES_HORS_TOUR.ouvert()) await window.DEPENSES_HORS_TOUR.fermer();
    await window.fetch("https://api.openai.com/v1/images/generations", { method: "POST", body: JSON.stringify({ model: "gpt-image-2", quality: "medium", size: "1536x1024", prompt: "x" }) });
    const f = new FormData(); f.append("model", "gpt-image-2"); f.append("quality", "medium"); f.append("size", "1024x1536"); f.append("image[]", new Blob(["x"]), "a.png"); f.append("prompt", "y");
    await window.fetch("https://api.openai.com/v1/images/edits", { method: "POST", body: f });
    const ouvert = window.DEPENSES_HORS_TOUR.ouvert();
    const ligne = await window.DEPENSES_HORS_TOUR.fermer();
    return { cache, grille, horsTour: !!ouvert, ligne };
  });
  verifier("les tokens déjà en cache chez Gemini : 10 % du prix (0,075 $ le million)", Math.abs(r.cache - 0.075) < 1e-9, String(r.cache));
  verifier("la grille d'OpenAI : 1536 × 1024 moyen ≈ 0,041 $ (plus le texte), 1024 × 1024 bas ≈ 0,006 $", Math.abs(r.grille[0] - 0.043) < 0.0005 && Math.abs(r.grille[1] - 0.008) < 0.0005, JSON.stringify(r.grille));
  verifier("hors d'un tour du MJ, les images sont comptées quand même (relevé « Hors MJ »)", r.horsTour && r.ligne && r.ligne.horsTour === true && r.ligne.images.nombre === 2, JSON.stringify(r.ligne && r.ligne.images));
  const exact = (400 * 5 + 2600 * 8 + 1056 * 30) / 1e6;
  verifier("l'image retouchée : son coût exact, lu dans la réponse (texte, références, image produite)", r.ligne && Math.abs(r.ligne.images.coutUSD - (0.043 + exact)) < 1e-6, `${r.ligne && r.ligne.images.coutUSD} contre ${0.043 + exact}`);
  // La fenêtre : la TVA, cochée d'office.
  const fen = await p.evaluate(async (ligne) => { const z = document.getElementById("depenses-mj-contenu"); if (!z) return null;
    window.DEPOT_DEPENSES_MJ = { lire: async () => ({ lignes: [ligne], compteur: null }), ecrire: async () => {}, effacer: async () => {} };
    await window.afficherDepensesMJ();
    const cb = document.getElementById("depenses-tva"); return { tva: cb ? cb.checked : null, texte: z.textContent.replace(/\s+/g, " ").slice(0, 400), horsMJ: !!z.querySelector(".depenses-ligne.hors-tour") }; }, r.ligne);
  verifier("la fenêtre des dépenses : la TVA (20 %) comptée, case cochée, prix TTC ; la ligne « Hors MJ »", !!fen && fen.tva === true && /TTC/.test(fen.texte) && fen.horsMJ, JSON.stringify(fen));
  await p.evaluate(() => window.basculerTvaDepenses(false)); await p.waitForTimeout(300);
  const ht = await p.evaluate(() => document.getElementById("depenses-mj-contenu").textContent);
  verifier("… et décochée : hors taxes", /hors taxes/.test(ht));
});

console.log(erreurs.length ? "\nErreurs de page : " + erreurs.slice(0, 5).join(" | ") : "");
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
