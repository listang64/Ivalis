// v313 — LES AVENTURIERS DANS LE LIVRE (CLANS, FICHE, COMPÉTENCES, FORGE,
// INVENTAIRE, DEV), L'ÉCRITURE DES TITRES AU CHOIX, LE LIVRE OUVERT SUR LE
// SOMMAIRE, LES VOYAGES LIMITROPHES, LE LIEU QUI NE NAISSAIT PAS, LE DÉBUT DES
// COMBATS (NOTE, GRILLE D'OFFICE, ENNEMIS À VALIDER).
//
// Lancer : node tests_monstres/corrections_v313.mjs
// (IVALIS_RACINE=… pour un autre dossier ; V313_CAPTURES=dossier pour les captures.)
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
const CAPTURES = process.env.V313_CAPTURES || "";
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
const allerA = (cle) => p.evaluate((cle) => window.GRIMOIRE.allerALaPage(window.GRIMOIRE.indexDe(window.GRIMOIRE_FICHES.pages()[cle])), cle);
const ici = () => p.evaluate(() => { const i = window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), pg = window.GRIMOIRE_FICHES.pages();
  return Object.keys(pg).find(k => k !== "clans" && pg[k] && window.GRIMOIRE.indexDe(pg[k]) === i) || (pg.clans.some(el => window.GRIMOIRE.indexDe(el) === i) ? "clans" : String(i)); });

// =========================================================================
titre("1. LE LIVRE S'OUVRE SUR LE SOMMAIRE ; I- AVENTURIERS MÈNE AUX CLANS");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => ({ page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), chapitre: window.grimoireEtat().chapitre }));
  verifier("à l'entrée en partie, le livre est ouvert sur le sommaire (pages 3-4)", r.page === 3 && r.chapitre === "index", JSON.stringify(r));
  await pose(); await p.waitForTimeout(600);
  await cliquer("#grimoire-index-fiches"); await p.waitForTimeout(2500); await pose();
  const clans = await p.evaluate(() => [...document.querySelectorAll(".page-clan:not(.page-clan-vide)")].map(pg => ({
    titre: pg.querySelector(".titre-clan").textContent, heros: [...pg.querySelectorAll(".ligne-aventurier")].map(b => b.textContent.replace(/\s+/g, " ").trim()) })));
  verifier("« Aventuriers » ouvre la page des clans", (await ici()) === "clans", await ici());
  verifier("un clan par joueur, une page chacun, le sien d'abord : « Clan de Benjamin », « Clan de Nico »", clans.length === 2 && clans[0].titre === "Clan de Benjamin" && clans[1].titre === "Clan de Nico", JSON.stringify(clans.map(c => c.titre)));
  verifier("ses héros dans l'ordre de leur création, « Nom - Classe » (au féminin pour Kaya)", JSON.stringify(clans[0].heros) === JSON.stringify(["Thorin Ironfoot - Protecteur", "Kaya - Pisteuse"]), JSON.stringify(clans[0].heros));
  verifier("les autres clans avec leurs héros", JSON.stringify(clans[1].heros) === JSON.stringify(["Lyra Sombreval - Oracle"]), JSON.stringify(clans[1].heros));
  await cap("v313_clans");
});

// =========================================================================
titre("2. LA FICHE : L'AVATAR ET SON NOM DORÉ ; LE NIVEAU AU CRAYON, LA RACE, LES CARACS…");
// =========================================================================
await section(async () => {
  await cliquer('.ligne-aventurier[data-id="H1"]'); await p.waitForTimeout(2500); await pose();
  verifier("un toucher sur un héros ouvre sa fiche (double page)", (await ici()) === "fiche-g", await ici());
  const r = await p.evaluate(() => {
    const g = document.getElementById("grimoire-fiches-fiche-g"), d = document.getElementById("grimoire-fiches-fiche-d");
    const img = g.querySelector(".avatar-heros"), nom = g.querySelector(".nom-heros-fiche"), cs = getComputedStyle(nom);
    const ri = img.getBoundingClientRect(), rp = g.getBoundingClientRect(), rn = nom.getBoundingClientRect();
    return { img: img.src, plein: Math.abs(ri.width - rp.width) < 2 && Math.abs(ri.height - rp.height) < 2, nom: nom.textContent, clip: cs.webkitBackgroundClip || cs.backgroundClip,
             ombre: /drop-shadow/.test(cs.filter), bas: rn.bottom > rp.top + rp.height * 0.8, uneLigne: nom.scrollWidth <= nom.clientWidth + 1 && cs.whiteSpace === "nowrap",
             niveau: d.querySelector(".niveau-fiche").textContent.replace(/\s+/g, " ").trim(), pct: d.querySelector(".jauge-niveau").dataset.pct, hachures: d.querySelectorAll(".jauge-crayon .graphite path").length,
             xp: /XP|\d+\s*\/\s*\d+/.test(d.querySelector(".encart-niveau").textContent),
             race: d.querySelector(".encart-identite").textContent.replace(/\s+/g, " ").trim(),
             caracs: [...d.querySelectorAll(".case-carac")].map(c => c.querySelector(".nom-carac").textContent + c.querySelector(".valeur-carac").textContent),
             vital: [...d.querySelectorAll(".vital-fiche")].map(v => v.textContent.replace(/\s+/g, " ").trim()), titreVitalite: /Vitalité/.test(d.textContent),
             talents: d.querySelector(".encart-talents").textContent.replace(/\s+/g, " ").trim(),
             defenses: [...d.querySelectorAll(".encart-defense .titre-encart")].map(t => t.textContent),
             blessures: d.querySelector(".encart-blessures-fiche").textContent.replace(/\s+/g, " ").trim(),
             ordre: [...d.querySelectorAll(".page-fiche-droite > *")].map(e => e.className.split(" ").find(c => /^(encart-(niveau|identite|caracs|talents|blessures-fiche)|rangee-(vitale|defenses))$/.test(c))).filter(Boolean),
             deborde: d.querySelector(".page-fiche-droite").scrollHeight > d.querySelector(".page-fiche-droite").clientHeight + 2 };
  });
  verifier("à gauche, l'avatar en pleine page", /portrait-kaya/.test(r.img) && r.plein, r.img);
  verifier("à ses pieds, son nom en titre doré (dégradé, ombre dessous), sur une ligne qui s'ajuste", r.nom === "Kaya" && /text/.test(r.clip) && r.ombre && r.bas && r.uneLigne, JSON.stringify({ clip: r.clip, ombre: r.ombre, bas: r.bas }));
  verifier("à droite, de haut en bas : niveau, race/classe, caracs, vitalité, talents, réflexes/résistances, blessures",
           JSON.stringify(r.ordre) === JSON.stringify(["encart-niveau", "encart-identite", "encart-caracs", "rangee-vitale", "encart-talents", "rangee-defenses", "encart-blessures-fiche"]), JSON.stringify(r.ordre));
  verifier("le niveau, sa jauge remplie au crayon (hachures), sans le nombre d'XP", r.niveau === "Niveau 2" && Number(r.pct) > 0 && Number(r.pct) < 100 && r.hachures > 10 && !r.xp, `${r.niveau} ${r.pct} % ${r.hachures} traits`);
  verifier("la race et la classe", /Race Humain/.test(r.race) && /Classe Pisteuse/.test(r.race), r.race);
  verifier("les six caractéristiques (bonus compris)", JSON.stringify(r.caracs) === JSON.stringify(["FOR10", "DEX15", "CON12", "INT13", "SAG10", "CHA8"]), JSON.stringify(r.caracs));
  verifier("points de vie, fatigue max, régénération — sans le titre « Vitalité »", r.vital.length === 3 && /62\s*Points de vie/.test(r.vital[0]) && /Fatigue max/.test(r.vital[1]) && /35 %/.test(r.vital[2]) && !r.titreVitalite, JSON.stringify(r.vital));
  verifier("les talents acquis", /Préparer/.test(r.talents), r.talents);
  verifier("les encadrés Réflexes et Résistances", JSON.stringify(r.defenses) === '["Réflexes","Résistances"]', JSON.stringify(r.defenses));
  verifier("les blessures", /Lèvre fendue/.test(r.blessures), r.blessures);
  verifier("tout tient sur la page", !r.deborde);
  await cap("v313_fiche");
});

// =========================================================================
titre("3. L'APPUI LONG : CE QUE C'EST (RACE, CARAC, TALENT, BLESSURE, RICHESSE)");
// =========================================================================
const appuiLong = async (sel) => {
  const c = await centre(sel);
  await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.waitForTimeout(650);
  const r = await p.evaluate(() => { const b = document.querySelector(".bulle-aide-fiche"); return b && b.classList.contains("visible") ? b.textContent.replace(/\s+/g, " ").trim() : ""; });
  await p.mouse.up(); await p.waitForTimeout(150);
  return { texte: r, page: await page() };
};
await section(async () => {
  const avant = await page();
  const carac = await appuiLong('#grimoire-fiches-fiche-d .case-carac[data-carac="dex"]');
  verifier("une carac : ce qu'elle sert (en combat, en jeu)", /Dextérité/.test(carac.texte) && /En combat/.test(carac.texte) && /En jeu/.test(carac.texte) && carac.page === avant, carac.texte.slice(0, 120));
  const talent = await appuiLong('#grimoire-fiches-fiche-d .talent-fiche');
  verifier("un talent : son effet", /Préparer/.test(talent.texte) && talent.texte.length > 12, talent.texte.slice(0, 120));
  const blessure = await appuiLong('#grimoire-fiches-fiche-d .blessure-fiche');
  verifier("une blessure : son effet", /Lèvre fendue/.test(blessure.texte) && /Charisme/.test(blessure.texte), blessure.texte.slice(0, 120));
  const classe = await appuiLong('#grimoire-fiches-fiche-d .morceau-identite:nth-of-type(2)');
  verifier("la classe : sa description", /Pisteuse/.test(classe.texte) && classe.texte.length > 15, classe.texte.slice(0, 120));
  verifier("l'appui long ne tourne pas la page", (await page()) === avant);
});

// =========================================================================
titre("4. LES COMPÉTENCES : LES BANNIÈRES À L'ENCRE, LA CARTE QUI MONTE DANS LE PAPIER");
// =========================================================================
await section(async () => {
  await allerA("comp-g"); await p.waitForTimeout(2200); await pose();
  const b = await p.evaluate(() => [...document.querySelectorAll("#grimoire-fiches-comp-g .banniere-livre")].map(x => ({ id: x.dataset.id, init: x.querySelector(".init-banniere").textContent, titre: x.querySelector(".titre-banniere").textContent,
    memo: x.classList.contains("memorisee"), svg: x.querySelectorAll("svg.dessin-banniere").length, img: getComputedStyle(x).backgroundImage })));
  verifier("les bannières, dessinées en code (médaillon d'initiative, plaque du titre), triées par initiative", b.length >= 3 && b[0].id === "C1" && b[0].init === "53" && b.every(x => x.svg === 2 && x.img === "none"), JSON.stringify(b.slice(0, 3).map(x => x.titre + ":" + x.init)));
  verifier("pas de couleur de joueur ; les mémorisées décalées et scellées", b.find(x => x.id === "C1").memo && !b.find(x => x.id === "C2").memo, "");
  await cliquer('.banniere-livre[data-id="C2"]'); await p.waitForTimeout(300);
  const carte = await p.evaluate(() => { const c = document.querySelector("#grimoire-fiches-comp-d .carte-encre"); return c ? { titre: c.querySelector(".carte-titre").textContent, anim: getComputedStyle(c).animationName, h: c.getBoundingClientRect().height, page: c.closest(".page-grimoire").getBoundingClientRect().height, effets: c.querySelectorAll(".carte-effets li, .carte-effets > div").length, img: c.querySelectorAll("img").length } : null; });
  verifier("un toucher : sa carte apparaît sur la page de droite, comme de l'encre (animation)", !!carte && carte.titre === "Soin du mécréant" && carte.anim === "encre-monte" && carte.effets >= 1, JSON.stringify(carte));
  verifier("la carte, moins haute, sans image", !!carte && carte.img === 0 && carte.h < carte.page * 0.6, carte && `${Math.round(carte.h)} / ${Math.round(carte.page)}`);
  await p.waitForTimeout(1500);
  await cap("v313_competences");
  // Le second toucher (ou « Mémoriser ») : elle part au combat.
  await p.evaluate(() => { window.__deck = []; window.basculerSelectionCarte = async (id) => { window.__deck.push(id); window.CARTES_SELECTIONNEES = [...(window.CARTES_SELECTIONNEES || []), id]; }; });
  await cliquer('#grimoire-fiches-comp-d .bouton-memoriser'); await p.waitForTimeout(400);
  verifier("« Mémoriser pour le combat » passe par le deck de la fiche (basculerSelectionCarte)", JSON.stringify(await p.evaluate(() => window.__deck)) === '["C2"]', JSON.stringify(await p.evaluate(() => window.__deck)));
});

// =========================================================================
titre("5. LA FORGE SUR SA DOUBLE PAGE : LA TECHNIQUE À GAUCHE, LE CODEX À DROITE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.EFFETS_BDD_CACHE = { E1: { Nom: "Attaque légère", Modificateur: "DEX", Type_Mecanique: "Action/Global", Description: "Un coup vif.", Cout_PC: 1 } }; });
  await cliquer("#grimoire-fiches-comp-g .bouton-forger"); await p.waitForTimeout(2600); await pose();
  const r = await p.evaluate(() => ({ dans: !!document.querySelector("#grimoire-fiches-forge-g #forge-nom") && !!document.querySelector("#grimoire-fiches-forge-g #btn-valider-forge"),
    codex: !!document.querySelector("#grimoire-fiches-forge-d #forge-menu-caracs"), modale: document.getElementById("modale-creation-competence").style.display,
    armes: [...document.querySelectorAll("#forge-livre-armes .arme-forge")].map(b => b.textContent) }));
  verifier("« Forger une compétence » tourne jusqu'à la Forge, rangée dans le livre (nom, actions, Forger)", (await ici()) === "forge-g" && r.dans && r.modale === "none", JSON.stringify(r));
  verifier("à droite, le codex des effets ; d'abord le choix de l'arme", r.codex && r.armes.length === 6, JSON.stringify(r.armes));
  await cap("v313_forge");
  await cliquer("#grimoire-fiches-forge-g .fermer-forge"); await p.waitForTimeout(2200); await pose();
  const rendu = await p.evaluate(() => ({ modale: !!document.querySelector("#modale-creation-competence #forge-nom"), menu: !!document.querySelector("#modale-menu-ajout #forge-menu-caracs") }));
  verifier("« Refermer » rend la Forge à sa fenêtre et revient aux compétences", rendu.modale && rendu.menu && (await ici()) === "comp-g", JSON.stringify(rendu));
});

// =========================================================================
titre("6. L'INVENTAIRE : LA RICHESSE (LAITON, BRONZE), L'ÉQUIPEMENT, LE STOCKAGE, LE DEV");
// =========================================================================
await section(async () => {
  await allerA("inv-g"); await p.waitForTimeout(2200); await pose();
  const r = await p.evaluate(() => ({ pieces: [...document.querySelectorAll("#grimoire-fiches-inv-g .saisie-pieces")].map(i => i.dataset.metal + ":" + i.value),
    svg: document.querySelectorAll("#grimoire-fiches-inv-g svg.piece").length,
    encarts: [...document.querySelectorAll("#grimoire-fiches-inv-g .encart-objet .titre-encart, #grimoire-fiches-inv-d .encart-objet .titre-encart")].map(t => t.textContent),
    stock: document.querySelector("#grimoire-fiches-inv-d .objet-stock .objet-nom").textContent, dev: !!document.querySelector("#grimoire-fiches-inv-d .lien-dev") }));
  verifier("la richesse : pièces de laiton et de bronze, dessinées en pièces antiques", JSON.stringify(r.pieces) === '["laiton:12","bronze:17"]' && r.svg === 2, JSON.stringify(r.pieces));
  const aide = await appuiLong("#grimoire-fiches-inv-g .encart-richesse .titre-encart");
  verifier("un appui long sur « Richesse » : 30 pièces de bronze = 1 pièce de laiton", /30 pièces de bronze valent 1 pièce de laiton/.test(aide.texte), aide.texte);
  verifier("l'armure, la main droite, la main gauche, et un emplacement de stockage", JSON.stringify(r.encarts) === '["Armure","Main droite","Main gauche","Stockage"]' && r.stock === "Fronde de berger", JSON.stringify(r.encarts));
  verifier("hors mode DEV, pas de lien « Dev »", !r.dev);
  await cap("v313_inventaire");
  // 40 bronzes : 1 laiton de plus, 10 bronzes.
  await p.evaluate(() => { const i = document.querySelector('#grimoire-fiches-inv-g .saisie-pieces[data-metal="bronze"]'); i.value = "40"; i.dispatchEvent(new Event("change", { bubbles: true })); });
  await p.waitForTimeout(500);
  const m = await p.evaluate(() => (window.__majs || []).filter(x => x.chemin === "Personnages/H1").pop());
  verifier("les pièces s'écrivent ; 30 bronzes font un laiton", !!m && m.data.Pieces_Laiton === 13 && m.data.Pieces_Bronze === 10, JSON.stringify(m && m.data));
  // Ranger le glaive ? Le stockage est plein : on prend d'abord la fronde en main gauche.
  await cliquer('#grimoire-fiches-inv-d .objet-stock [data-fa="prendre"]'); await p.waitForTimeout(600);
  const pris = await p.evaluate(() => (window.__majs || []).filter(x => x.chemin === "Personnages/H1").pop().data);
  verifier("« Prendre en main » : la fronde passe du stockage à la main libre", pris.Equip_Main_Gauche && pris.Equip_Main_Gauche.nom === "Fronde de berger" && pris.Equip_Stock === null, JSON.stringify(pris).slice(0, 120));
  await p.waitForTimeout(1200);
  await cliquer('#grimoire-fiches-inv-d .objet-droite [data-fa="ranger"]'); await p.waitForTimeout(600);
  const range = await p.evaluate(() => (window.__majs || []).filter(x => x.chemin === "Personnages/H1").pop().data);
  verifier("« Ranger » : le glaive quitte la main pour le stockage", range.Equip_Stock && range.Equip_Stock.nom === "Glaive de bronze" && range.Equip_Main_Droite === null, JSON.stringify(range).slice(0, 120));
  // Le mode DEV : le lien souligné, et les pages du panneau DEV.
  await p.evaluate(() => { localStorage.setItem("ivalis_DEV_MODE", "on"); window.GRIMOIRE_FICHES.majPlus(); });
  await p.waitForTimeout(1500);
  const lien = await p.evaluate(() => { const l = document.querySelector("#grimoire-fiches-inv-d .lien-dev"); return l ? { t: l.textContent, s: getComputedStyle(l).textDecorationLine } : null; });
  verifier("en mode DEV, un petit « Dev » souligné en bas", !!lien && lien.t === "Dev" && /underline/.test(lien.s), JSON.stringify(lien));
  await cliquer("#grimoire-fiches-inv-d .lien-dev"); await p.waitForTimeout(2500); await pose();
  const dev = await p.evaluate(() => ({ alter: !!document.querySelector("#grimoire-fiches-dev-g #dev-mod-pv, #grimoire-fiches-dev-d #dev-mod-pv"), nom: !!document.querySelector(".page-dev #dev-nom-perso") }));
  verifier("il mène aux pages du panneau DEV (les mêmes outils que l'onglet DEV)", (await ici()) === "dev-g" && dev.alter && dev.nom, JSON.stringify(dev));
  await cap("v313_dev");
  await p.evaluate(() => { localStorage.setItem("ivalis_DEV_MODE", "off"); });
});

// =========================================================================
titre("7. L'ANCIENNE FICHE : OUVRIR UN HÉROS (PAPIER D'AVATAR, CHAT…) OUVRE LE LIVRE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.ouvrirFichePerso("H2", "Lyra", "Sombreval", ""));
  await p.waitForTimeout(2500); await pose();
  const r = await p.evaluate(() => ({ heros: window.GRIMOIRE_FICHES.herosAffiche(), nom: document.getElementById("fiche-nom-heros").textContent,
    ancienne: getComputedStyle(document.getElementById("fenetre-fiche-perso")).display }));
  verifier("window.ouvrirFichePerso ouvre la fiche du livre, l'ancienne fenêtre reste cachée", r.heros === "H2" && r.nom === "Lyra Sombreval" && r.ancienne === "none" && (await ici()) === "fiche-g", JSON.stringify(r));
});

// =========================================================================
titre("8. L'ÉCRITURE DES TITRES : 25 PROPOSITIONS DANS PARAMÈTRES");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const bouton = document.querySelector("#etape-mdp-parametres #btn-choisir-police");
    window.ouvrirPagePolices();
    const cartes = [...document.querySelectorAll("#page-polices .carte-police")];
    cartes.find(c => c.dataset.police === "Caveat").click();
    const t = getComputedStyle(document.querySelector(".entete-index")).fontFamily;
    window.fermerPagePolices();
    return { bouton: !!bouton, n: cartes.length, uniques: new Set(cartes.map(c => c.dataset.police)).size, t, garde: localStorage.getItem("ivalis_police_titres"),
             sansBerkshire: !/Berkshire/.test(t) };
  });
  verifier("dans Paramètres, « Choisir l'écriture » ouvre une page de 25 écritures manuscrites différentes", r.bouton && r.n === 25 && r.uniques === 25, `${r.n} / ${r.uniques}`);
  verifier("un toucher : le sommaire et les titres la prennent, le choix est gardé", /Caveat/.test(r.t) && r.garde === "Caveat", r.t);
});

// =========================================================================
titre("9. LES VOYAGES : SEULEMENT VERS UNE RÉGION VOISINE (OU UNE ÎLE PROCHE)");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const carre = (n, x, y, l, h) => ({ numero: n, points: [{ x, y }, { x: x + l, y }, { x: x + l, y: y + h }, { x, y: y + h }] });
    window.REGIONS_CARTE = { 1: carre(1, 100, 100, 800, 600), 2: carre(2, 900, 100, 800, 600), 3: carre(3, 2600, 1200, 600, 500), 7: carre(7, 1750, 300, 200, 200) };
    return { voisines: window.regionsVoisines(1, 2), loin: window.regionsVoisines(1, 3), ile: window.regionsVoisines(2, 7), ileLoin: window.regionsVoisines(1, 7) };
  });
  verifier("deux régions qui se touchent sont voisines ; une région lointaine ne l'est pas", r.voisines && !r.loin, JSON.stringify(r));
  verifier("une île près de la côte compte ; pas une île au large d'une autre région", r.ile && !r.ileLoin, JSON.stringify(r));
  const s = lire("voyage_groupe.js");
  verifier("le choix d'une région non limitrophe est refusé (annonce), le DEV peut corriger la carte", /if \(!window\.regionsVoisines\(pos\.Region, n\)\)/.test(s) && /n'est pas limitrophe/.test(s) && /declarerVoisinesDev/.test(s));
});

// =========================================================================
titre("10. LE LIEU (POI) QUI NE NAISSAIT PAS ; LE COMBAT (NOTE, GRILLE, ENNEMIS À VALIDER)");
// =========================================================================
await section(async () => {
  const s = lire("voyage_groupe.js");
  verifier("une écriture refusée (failed-precondition, aborted…) est réessayée au lieu d'être perdue", /ERREURS_REESSAYABLES = \["failed-precondition", "aborted"/.test(s) && /return REESSAYER/.test(s));
  verifier("le poste qui créait le lieu s'est rechargé : il relance ; parti : un autre reprend (4 min)", /v\.Poi\.Createur === moi && !creationsIci\.has\(poiId\)/.test(s) && /DELAI_REPRISE_POI = 4 \* 60 \* 1000/.test(s) && /Pris_Le/.test(s));
  verifier("un lieu qui n'a pas pu naître se réessaie (« Réessayer de révéler le lieu »)", /halte-reessayer/.test(s) && /window\.reessayerLieuPoi = /.test(s));
  const c = lire("combat_rp.js");
  verifier("la grille est validée d'office ; les pions attendent la validation des ennemis", /validerGrilleCombatRP\(Number\(c\.Taille_Depart\) \|\| 60, \{ auto: true \}\)/.test(c) && /c\.Ennemis && c\.Ennemis_Valides && !pionsPrets\(c\)/.test(c));
  const rc = lire("grimoire_recit.css");
  verifier("la note du combat : à l'encre, sans animation sur « Combattre »", /\.note-combat \.note-combattre \{[^}]*animation: none !important/.test(rc) && /glaives-combat/.test(lire("grimoire_recit.js")));
  const comp = lire("competences.js");
  verifier("plus d'image générée pour une compétence forgée", /window\.ILLUSTRER_COMPETENCES === true && typeof window\.illustrerCompetence/.test(comp));
});

// =========================================================================
titre("11. « LE RÉCIT » AU SOMMAIRE : LE SOMMAIRE DES CHAPITRES DU RÉCIT");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.grimoireAllerIndex()); await p.waitForTimeout(2600); await pose();
  await cliquer("#grimoire-index-recit"); await p.waitForTimeout(2600); await pose();
  const r = await p.evaluate(() => { const i = window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), suite = window.GRIMOIRE.premiereDeLaSuite();
    const pg = document.querySelectorAll(".page-grimoire")[i]; return { i, suite, sommaire: !!document.querySelector(".titre-sommaire") }; });
  verifier("« V- Le récit » tourne jusqu'au sommaire des chapitres du récit", r.i === r.suite && r.sommaire, JSON.stringify(r));
});

console.log("\n" + (echecs ? `${echecs} CONTRÔLE(S) EN ÉCHEC` : "TOUS LES CONTRÔLES PASSENT"));
if (erreurs.length) console.log("erreurs de page :", erreurs.slice(0, 5));
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
