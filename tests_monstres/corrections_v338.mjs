// v338 — LE RESTE DES CARTES RÉGIONALES : LE MONT PLETIA, L'ENCLAVE D'ARGENTÉ, L'ÎLE AUX MARCHÉS,
// LES DOIGTS D'ATRIUM, LA POINTE DES SENTINELLES, LA PROVINCE D'AURELYA, LA CRIQUE DU PENDU, LES ÎLOTS
// MAUDITS : LES NOUVELLES IMAGES, EN PLEINE PAGE DE DROITE ; LA FICHE DE L'ANCIENNE IMAGE OUBLIÉE.
//
// Lancer : node tests_monstres/corrections_v338.mjs
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
const CAPTURES = process.env.V338_CAPTURES || "";
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
const p = await b.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
// Les IA (Gemini), simulées : le Narrateur lite, les annonces, le titre d'un chapitre.
const appelsIA = [];
let iaEnPanne = false, refusPlume = false, panneCle1 = false;
await p.route('**', r => { const u = r.request().url();
  if (u.startsWith(base)) return r.continue();
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


// Les boîtes de la carte du livre : les onze régions qui ont une carte. Le groupe est sur le mont Pletia (3).
const boite = (n, x, y) => ({ numero: n, points: [{ x, y }, { x: x + 90, y }, { x: x + 90, y: y + 70 }, { x, y: y + 70 }] });
const AVEC_CARTE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];   // les zones de la carte du monde (grimoire_regions.js, ZONE_VERS_REGION)
await p.evaluate((zones) => { window.ZONES_LIVRE = zones; }, Object.fromEntries(AVEC_CARTE.map((n, i) => [n, boite(n, 100 + (i % 6) * 200, 150 + Math.floor(i / 6) * 300)])));
await cliquer("#grimoire-btn-charger");
await p.waitForTimeout(700);
await cliquer('#grimoire-liste-parties [data-id="P1"]');
await p.waitForTimeout(150);
await p.fill("#grimoire-mdp-partie", "sel");
await p.evaluate(() => window.appliquerVoyageDeLaPartie && window.appliquerVoyageDeLaPartie({ Position_Groupe: { Region: 3, x: 0.42, y: 0.55 } }));
await cliquer("#grimoire-valider-partie");
await p.evaluate(() => window.appliquerVoyageDeLaPartie && window.appliquerVoyageDeLaPartie({ Position_Groupe: { Region: 3, x: 0.42, y: 0.55 } }));
const pose = () => attendreQue(() => p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getState() === "read" && !window.GRIMOIRE.defileEnCours()), 8000);

const U = "https://res.cloudinary.com/dlkjq4kvg/image/upload/";
const NOUVELLES = { 3: "IMG_2239_mkf3uo", 6: "IMG_2238_gj4sns", 7: "IMG_2240_o0wrvi", 8: "IMG_2242_uyv7l8", 10: "IMG_2248_s7zmzs", 11: "IMG_2244_gntmbs", 12: "IMG_2241_jnjr6u", 13: "IMG_2243_oaglx4" };
const ANCIENNES = { 3: "v1792834937/IMG_1900_ccinzy.jpg", 6: "v1792834858/IMG_1897_troqrx.jpg", 7: "v1792834858/IMG_1903_fhehdr.png", 8: "v1792834616/IMG_1979_gcjlls.png",
                    10: "v1792836374/IMG_2189_nzctzd.jpg", 11: "v1792834636/IMG_1984_nahpgi.jpg", 12: "v1792834616/IMG_1977_aqqcdv.png", 13: "v1792834643/IMG_1981_y7wld9.png" };
const NOMS = { 3: "Le mont Pletia", 6: "L'enclave d'argenté", 7: "L'île aux marchés", 8: "Les doigts d'Atrium", 10: "La pointe des sentinelles", 11: "La province d'Aurelya", 12: "La crique du Pendu", 13: "Les îlots maudits" };

// =========================================================================
titre("1. LES HUIT NOUVELLES IMAGES ; LA FICHE DE L'ANCIENNE N'EST PLUS ÉCOUTÉE");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(([U, ANCIENNES, NOMS]) => {
    const usure = { colonnes: 4, lignes: 4, cases: "abc" }, terrains = { 1: { Numero: 1, Points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }] } };
    window.appliquerCartesRegionalesDeLaBase(Object.entries(ANCIENNES).map(([n, a]) => ({ id: n, data: { Numero: Number(n), Nom: NOMS[n], Description: "Récit de " + n, Image: U + a,
      Usure: usure, Terrains: terrains, Aspect: 1.9, Titre: { x: 0.2, y: 0.3, taille: 0.1 } } })));
    const c = window.CARTES_REGIONALES;
    return Object.keys(ANCIENNES).map(n => ({ n, image: c[n].image, usure: c[n].usure, terrains: c[n].terrains.length, aspect: c[n].aspect, titreX: c[n].titre.x, nom: c[n].nom, description: c[n].description }));
  }, [U, ANCIENNES, NOMS]);
  const mauvaises = r.filter(x => !x.image.includes(NOUVELLES[x.n]));
  verifier("les huit régions ont leur nouvelle image (même si la fiche nomme l'ancienne)", !mauvaises.length, JSON.stringify(mauvaises.map(x => [x.n, x.image])));
  const gardees = r.filter(x => x.usure != null /* (v374 : plus d'usure du tout) */ || x.terrains !== 0 || x.aspect !== null || x.titreX !== 0.5);
  verifier("l'usure, les terrains, le titre, les proportions de l'ancienne image sont ignorés", !gardees.length, JSON.stringify(gardees));
  verifier("… le nom et le descriptif restent", r.every(x => x.nom === NOMS[x.n] && x.description === "Récit de " + x.n));
  const defaut = await p.evaluate(() => Object.fromEntries(Object.entries(window.CARTES_REGIONALES_DEFAUT).map(([n, d]) => [n, d.image])));
  verifier("la liste par défaut nomme aussi les nouvelles images", Object.entries(NOUVELLES).every(([n, id]) => (defaut[n] || "").includes(id)), JSON.stringify(defaut));
  const d = await p.evaluate(() => { localStorage.setItem("ivalis_DEV_MODE", "on"); window.__sets = []; window.remettreANeufCartesRegionalesBanc();
    return (window.__sets || []).filter(x => /^Cartes_Regionales\//.test(x.chemin)).map(x => ({ chemin: x.chemin, image: x.data.Image, usure: x.data.Usure, terrains: x.data.Terrains, titre: x.data.Titre, aspect: x.data.Aspect, nom: x.data.Nom })); });
  const attendus = Object.keys(NOUVELLES).map(n => "Cartes_Regionales/" + n).sort();
  verifier("en DEV, les huit fiches sont remises à neuf une fois (la nouvelle image, plus d'usure ni de terrains)",
    JSON.stringify(d.map(x => x.chemin).sort()) === JSON.stringify(attendus) && d.every(x => x.image.includes(NOUVELLES[x.chemin.split("/")[1]]) && x.usure === null && x.terrains === null && x.titre === null && x.aspect === null && x.nom === undefined),
    JSON.stringify(d.map(x => x.chemin)));
  await p.evaluate(() => localStorage.setItem("ivalis_DEV_MODE", "off"));
});

// =========================================================================
titre("2. DANS LE LIVRE : CHACUNE EN PLEINE PAGE DE DROITE, LE NOM À GAUCHE");
// =========================================================================
await section(async () => {
  await attendreQue(() => p.evaluate(() => window.GRIMOIRE_REGIONS.regions().length === 11), 8000); await pose();
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => window.GRIMOIRE_REGIONS.regions().map(x => {
    const g = document.querySelector(`.page-region.gauche[data-region="${x.numero}"]`), d = document.querySelector(`.page-region.droite[data-region="${x.numero}"]`);
    if (!g || !d) return { n: x.numero, droite: "", gauche: true, nom: "", paysage: true };
    const im = d.querySelector("img.region-carte-img");
    return { n: x.numero, droite: im ? im.getAttribute("src") : "", gauche: !!g.querySelector("img.region-carte-img"), nom: (g.querySelector(".region-nom") || {}).textContent || "", paysage: g.classList.contains("paysage") };
  }));
  const pages = r.filter(x => NOUVELLES[x.n]);
  verifier("les huit régions ont leurs pages dans le livre", pages.length === 8, JSON.stringify(r.map(x => x.n)));
  const mal = pages.filter(x => !x.droite.includes(NOUVELLES[x.n]) || !/\/upload\/w_1400,c_limit,q_auto,f_auto\//.test(x.droite));
  verifier("la page de droite porte la nouvelle image (allégée pour la page)", !mal.length, JSON.stringify(mal.map(x => [x.n, x.droite])));
  verifier("la page de gauche : le nom de la région, pas de carte", pages.every(x => !x.gauche && !x.paysage && x.nom === NOMS[x.n]), JSON.stringify(pages.map(x => [x.n, x.nom, x.gauche])));
  const demandees = imagesDemandees.join(" ");
  verifier("aucune ancienne image n'est demandée", !/IMG_(1900|1897|1903|1979|2189|1984|1977|1981)_/.test(demandees), demandees.match(/IMG_(1900|1897|1903|1979|2189|1984|1977|1981)_\w+/g) + "");
});

// =========================================================================
titre("3. LA CARTE VIVANTE DU MONT PLETIA (LE GROUPE Y EST) : LA NOUVELLE IMAGE");
// =========================================================================
await section(async () => {
  await attendreQue(() => p.evaluate(() => !!window.GRIMOIRE_REGIONS.pageDuGroupe()), 8000); await pose();
  await p.evaluate(() => window.GRIMOIRE.allerALaPage(window.GRIMOIRE_REGIONS.pageDuGroupe()));
  await p.waitForTimeout(2500);
  const ok = await attendreQue(() => p.evaluate(() => window.GRIMOIRE_REGIONS.montee() === 3 && window.carteRegionaleOuverte() === 3), 8000);
  const src = await p.evaluate(() => (document.getElementById("carte-region-image") || {}).src || "");
  verifier("la carte vivante du mont Pletia s'ouvre sur sa page", ok);
  verifier("… avec la nouvelle image", src.includes(NOUVELLES[3]), src);
});

console.log(erreurs.length ? "\nErreurs de page : " + erreurs.slice(0, 5).join(" | ") : "");
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
