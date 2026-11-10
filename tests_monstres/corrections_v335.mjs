// v335 — ALLÉGER LE JEU : PLUS D'ANCIENNE CARTE DU MONDE SOUS LE LIVRE (NI IMAGE, NI SABLE, NI OMBRE),
// LA CARTE DE COMBAT CHARGÉE À L'OUVERTURE DU COMBAT SEULEMENT, DES IMAGES DE CARTES PLUS LÉGÈRES.
//
// Lancer : node tests_monstres/corrections_v335.mjs
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
const CAPTURES = process.env.V335_CAPTURES || "";
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
const toutesRequetes = [];
await p.route('**', r => { const u = r.request().url(); toutesRequetes.push(u);
  if (u.startsWith(base)) return r.continue();
  if (/IMG_2235_e1zblf/.test(u)) { loupeDemandee++; return r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: LOUPE_IMG }); }
  if (/BG_tjiigl/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: TABLE });
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


// =========================================================================
titre("1. PLUS D'ANCIENNE CARTE DU MONDE SOUS LE LIVRE");
// =========================================================================
await section(async () => {
  await attendreQue(() => p.evaluate(() => window.GRIMOIRE_REGIONS.regions().length === 4), 6000); await pose();
  const r = await p.evaluate(() => {
    const c = document.getElementById("conteneur-carte-fond"), f = document.getElementById("carte-fond-jeu");
    return { conteneur: c && getComputedStyle(c).display, fond: f && getComputedStyle(f).backgroundImage, table: !!document.getElementById("table-monde"),
             ombre: !!document.querySelector("#conteneur-carte-fond .ombre-parchemin, #conteneur-carte-fond .table-ombre"),
             css: [...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => /map_wx8s89/.test(r.cssText)); } catch (e) { return false; } }) };
  });
  verifier("l'ancienne carte du monde est cachée (rien ne se dessine sous le livre)", r.conteneur === "none", JSON.stringify(r));
  verifier("…sans image de fond, ni sable, ni ombre floue", r.fond === "none" && !r.table && !r.ombre && !r.css, JSON.stringify(r));
  verifier("…et son image (map_wx8s89) n'est jamais demandée", !toutesRequetes.some(u => /map_wx8s89/.test(u)), String(toutesRequetes.filter(u => /map_wx8s89/.test(u)).length));
  const big = await p.evaluate(() => [...document.querySelectorAll("body *")].filter(el => { const r = el.getBoundingClientRect(); return r.width > 6000 || r.height > 6000; }).map(el => el.id || el.className).slice(0, 5));
  verifier("plus aucun élément géant affiché (plus de 6000 px)", big.length === 0, JSON.stringify(big));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v335_sommaire.png" });
});

// =========================================================================
titre("2. LA CARTE DE COMBAT ATTEND LE COMBAT");
// =========================================================================
await section(async () => {
  const avant = await p.evaluate(() => ({ plateau: !!window.PLATEAU_VTT, ecoute: !!window.UNSUBSCRIBE_VTT, fonction: typeof window.assurerPlateauCombat }));
  verifier("en partie, livre ouvert : pas de plateau de combat (ni toile, ni écoute)", !avant.plateau && !avant.ecoute && avant.fonction === "function", JSON.stringify(avant));
  verifier("app.js n'écoute plus le terrain du combat à l'entrée en partie", !/^\s*window\.ecouterTerrainVTT\(\);/m.test(lire("app.js")));
  // Un combat du récit qui se prépare : le plateau se charge.
  await p.evaluate(() => window.appliquerCombatRPDeLaPartie && window.appliquerCombatRPDeLaPartie({ Combat_RP: { Id: "C1", Etat: "preparation", Createur: { id: "ailleurs", t: Date.now() } } }));
  await p.waitForTimeout(300);
  const rp = await p.evaluate(() => ({ plateau: !!window.PLATEAU_VTT, ecoute: !!window.UNSUBSCRIBE_VTT }));
  verifier("un combat du récit en préparation : le plateau se prépare", rp.plateau && rp.ecoute, JSON.stringify(rp));
});
// Une seconde page : l'ouverture du combat (sans combat du récit).
await section(async () => {
  const p2 = await b.newPage({ viewport: { width: 1194, height: 834 } });
  await p2.route('**', r => { const u = r.request().url(); if (u.startsWith(base)) return r.continue(); return r.abort(); });
  await p2.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
  await p2.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
  await p2.goto(base + '/index.html'); await p2.waitForTimeout(1500);
  const a = await p2.evaluate(() => { window.ID_PARTIE_COURANTE = "P1"; return { plateau: !!window.PLATEAU_VTT }; });
  await p2.evaluate(() => { try { window.ouvrirCombat(); } catch (e) { window.__err = String(e); } });
  await p2.waitForTimeout(300);
  const c = await p2.evaluate(() => ({ plateau: !!window.PLATEAU_VTT, ecoute: !!window.UNSUBSCRIBE_VTT, fenetre: document.getElementById("fenetre-combat").style.display, err: window.__err || null }));
  verifier("ouvrir le combat prépare le plateau à ce moment-là", !a.plateau && c.plateau && c.ecoute && c.fenetre === "block" && !c.err, JSON.stringify({ a, c }));
  await p2.close();
});

// =========================================================================
titre("3. DES IMAGES DE CARTES PLUS LÉGÈRES");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE.allerALaPage(window.GRIMOIRE_REGIONS.pageDuGroupe()));
  await p.waitForTimeout(2500); await monteeSur(5); await pose(); await p.waitForTimeout(600);
  const r = await p.evaluate(() => ({
    pages: [...document.querySelectorAll("#grimoire-livre .page-region .region-carte-img")].map(i => i.getAttribute("src")),
    vue: document.getElementById("carte-region-image").getAttribute("src"),
    monde: [...document.querySelectorAll("#grimoire-livre .page-carte .image-carte")].map(i => i.getAttribute("src")) }));
  verifier("les cartes régionales sur les pages : 1400 de large", r.pages.length >= 4 && r.pages.every(u => /\/upload\/w_1400,c_limit,q_auto,f_auto\//.test(u)), JSON.stringify(r.pages.slice(0, 2)));
  verifier("la carte vivante : 3072 de large (4096 avant)", /\/upload\/w_3072,c_limit,q_auto,f_auto\//.test(r.vue), r.vue);
  verifier("la carte du monde sur ses pages : 1600 de large", r.monde.length === 2 && r.monde.every(u => /\/upload\/w_1600,c_limit,q_auto,f_auto\//.test(u)), JSON.stringify(r.monde));
  verifier("plus aucune image demandée en 4096", !toutesRequetes.some(u => /w_4096/.test(u)), JSON.stringify(toutesRequetes.filter(u => /w_4096/.test(u)).slice(0, 2)));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v335_desert.png" });
});

console.log(erreurs.length ? "\nErreurs de page : " + erreurs.slice(0, 5).join(" | ") : "");
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
