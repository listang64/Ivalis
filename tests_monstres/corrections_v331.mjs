// v331 — LES NOUVELLES CARTES RÉGIONALES (LA FORÊT DES MURMURES, LA VALLÉE DE SOUFFRE, LE DÉSERT
// D'ETHERIA) : EN PLEINE PAGE DE DROITE, SANS ZOOM ; LA FICHE DE L'ANCIENNE IMAGE OUBLIÉE ; EN DEV, SUPPRIMER
// UN LIEU OU TOUS CEUX DE LA CARTE AVEC CE QUI EN DÉPEND ; LA CARTE VIDE : LE GROUPE EN ATTENTE.
//
// Lancer : node tests_monstres/corrections_v331.mjs
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
const CAPTURES = process.env.V331_CAPTURES || "";
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

const NOUVELLES = { 1: "IMG_2229_oi0hov", 2: "IMG_2230_p6phe7", 5: "IMG_2231_qn6rj9" };

// =========================================================================
titre("1. LES NOUVELLES IMAGES ; LA FICHE DE L'ANCIENNE N'EST PLUS ÉCOUTÉE");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const usure = { colonnes: 4, lignes: 4, cases: "abc" }, terrains = { 1: { Numero: 1, Points: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }] } };
    window.appliquerCartesRegionalesDeLaBase([
      { id: "5", data: { Numero: 5, Nom: "Le désert d'Etheria", Description: "Le sable chante.", Image: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1792834787/IMG_1893_cubyml.jpg", Usure: usure, Terrains: terrains, Aspect: 1.9, Titre: { x: 0.2, y: 0.3, taille: 0.1 } } },
      { id: "1", data: { Numero: 1, Nom: "La forêt des murmures", Image: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1793949573/IMG_2229_oi0hov.png", Usure: usure, Terrains: terrains } },
      // (v338) Le mont Pletia a aussi sa nouvelle carte : la région qui ne change pas d'image, c'est Volcanisse (4).
      { id: "4", data: { Numero: 4, Nom: "Volcanisse", Image: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1792834937/IMG_1900_ccinzy.jpg", Usure: usure, Terrains: terrains } }]);
    const c = window.CARTES_REGIONALES;
    return { images: [1, 2, 5].map(n => c[n].image), desert: { usure: c[5].usure, terrains: c[5].terrains.length, aspect: c[5].aspect, titre: c[5].titre, description: c[5].description },
             foretDejaNeuve: { usure: !!c[1].usure, terrains: c[1].terrains.length }, pletia: { image: c[4].image, usure: !!c[4].usure, terrains: c[4].terrains.length } };
  });
  verifier("la forêt des murmures, la vallée de souffre, le désert d'Etheria : les nouvelles images", r.images.every((u, i) => u.includes(Object.values(NOUVELLES)[i])), JSON.stringify(r.images));
  verifier("la fiche du désert parle encore de l'ancienne image : son usure, ses terrains, son titre, ses proportions sont ignorés", r.desert.usure === null && r.desert.terrains === 0 && r.desert.aspect === null && r.desert.titre.x === 0.5, JSON.stringify(r.desert));
  verifier("… mais son nom et son descriptif restent", r.desert.description === "Le sable chante.");
  verifier("une fiche déjà faite pour la nouvelle image garde ce qu'on y a posé", r.foretDejaNeuve.usure && r.foretDejaNeuve.terrains === 1, JSON.stringify(r.foretDejaNeuve));
  verifier("une région qui ne change pas d'image (Volcanisse) ne bouge pas", /IMG_1900/.test(r.pletia.image) && r.pletia.usure && r.pletia.terrains === 1, JSON.stringify(r.pletia));
  const d = await p.evaluate(() => { localStorage.setItem("ivalis_DEV_MODE", "on"); window.__sets = []; window.remettreANeufCartesRegionalesBanc();
    return (window.__sets || []).filter(x => /^Cartes_Regionales\//.test(x.chemin)).map(x => ({ chemin: x.chemin, image: x.data.Image, usure: x.data.Usure, terrains: x.data.Terrains, titre: x.data.Titre, aspect: x.data.Aspect, nom: x.data.Nom })); });
  verifier("en DEV, la fiche du désert est remise à neuf (la nouvelle image, plus d'usure ni de terrains ni de titre)", d.length === 1 && d[0].chemin === "Cartes_Regionales/5" && /IMG_2231/.test(d[0].image) && d[0].usure === null && d[0].terrains === null && d[0].titre === null && d[0].aspect === null && d[0].nom === undefined, JSON.stringify(d));
  await p.evaluate(() => localStorage.setItem("ivalis_DEV_MODE", "off"));
});

// =========================================================================
titre("2. EN PLEINE PAGE DE DROITE, MÊME EN PAYSAGE");
// =========================================================================
await section(async () => {
  await attendreQue(() => p.evaluate(() => window.GRIMOIRE_REGIONS.regions().length === 4), 6000);
  await attendreQue(() => p.evaluate(() => !!window.GRIMOIRE_REGIONS.pageDuGroupe()), 8000); await pose();
  // (v338) Sous charge, le chargement de la partie (la tourne vers le sommaire, v333) peut encore
  // emmener le livre ailleurs après notre demande : on la refait tant qu'on n'est pas sur la carte.
  for (let essai = 0; essai < 4; essai++) {
    await p.evaluate(() => window.GRIMOIRE.allerALaPage(window.GRIMOIRE_REGIONS.pageDuGroupe()));
    await p.waitForTimeout(2500); await monteeSur(5); await pose(); await p.waitForTimeout(500);
    if (await p.evaluate(() => window.carteRegionaleOuverte() === 5)) break;
  }
  const r = await p.evaluate(() => ({ paysages: window.GRIMOIRE_REGIONS.regions().map(x => x.paysage),
    gauche: (document.querySelector('.page-region.gauche[data-region="5"] .region-nom') || {}).textContent || "",
    imageGauche: !!document.querySelector('.page-region.gauche[data-region="5"] img.region-carte-img'), imageDroite: !!document.querySelector('.page-region.droite[data-region="5"] img.region-carte-img') }));
  const v = await vueDuLivre();
  verifier("plus aucune carte sur la double page : toutes sur la page de droite", r.paysages.every(x => x === false), JSON.stringify(r.paysages));
  verifier("le désert (une image en paysage) : la carte à droite, son nom à gauche", r.imageDroite && !r.imageGauche && r.gauche === "Le désert d'Etheria", JSON.stringify(r));
  verifier("la carte vivante occupe la page de droite presque jusqu'à ses bords", v && v.place[0] > 0.5 && v.place[0] < 0.53 && v.place[2] > 0.45 && v.place[2] < 0.5 && v.place[1] < 0.05 && v.place[3] > 0.9, JSON.stringify(v && v.place.map(x => +x.toFixed(3))));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v331_desert.png" });
});

// =========================================================================
titre("3. PLUS DE ZOOM : LA MOLETTE ET LES DOIGTS NE ZOOMENT PLUS, LE DOIGT TOURNE LA PAGE");
// =========================================================================
await section(async () => {
  const v0 = await vueDuLivre();
  const c = await p.evaluate(() => { const r = document.getElementById("vue-carte-region").getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 }; });
  await p.mouse.move(c.x, c.y); await p.mouse.wheel(0, -900); await p.waitForTimeout(300);
  const v1 = await vueDuLivre();
  const z = await p.evaluate(() => { const a = window.zoomerCarteRegion(3); window.glisserCarteRegion(-200, -100); const c = window.cadrageCarteRegion(); return { a, zoom: c.zoom, base: c.base }; });
  verifier("la molette ne zoome plus (la page reste ouverte)", Math.abs(v1.zoom - v0.base) < 1e-6 && (await page()) === v0Page(), `${v0.zoom} → ${v1.zoom}`);
  verifier("le zoom et le glissé demandés ne changent rien : la carte reste à sa page", Math.abs(z.zoom - z.base) < 1e-6, JSON.stringify(z));
  const d = await p.evaluate(() => { const r = document.getElementById("vue-carte-region").getBoundingClientRect(), l = document.getElementById("grimoire-livre").getBoundingClientRect(); return { x: r.right - 30, y: r.top + r.height * 0.5, w: l.width / 2 }; });
  const avant = await page();
  await p.mouse.move(d.x, d.y); await p.mouse.down();
  for (let i = 1; i <= 22; i++) { await p.mouse.move(d.x - d.w * 1.7 * i / 22, d.y - 6 * i / 22); await p.waitForTimeout(20); }
  await p.mouse.up(); await pose(); await p.waitForTimeout(500);
  verifier("un doigt sur la carte tourne la page", (await page()) === avant + 2, `${avant} → ${await page()}`);
  await p.evaluate(() => window.GRIMOIRE.allerALaPage(window.GRIMOIRE_REGIONS.pageDuGroupe())); await p.waitForTimeout(2500); await monteeSur(5); await pose();
});
function v0Page() { return 9; }

// =========================================================================
titre("4. EN DEV : SUPPRIMER UN LIEU, PUIS TOUS CEUX DE LA CARTE, AVEC CE QUI EN DÉPEND");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => {
    localStorage.setItem("ivalis_DEV_MODE", "on");
    const D = window.__docs = window.__docs || {};
    const lieu = (nom, x, type) => ({ Nom_Du_Lieu: nom, Type_Lieu: type, Carte_Regionale: 5, Position_Region: { x, y: 0.5, taille: 0.04 } });
    D["Monde_Lieux/L1"] = lieu("Hameau d'Ixos", 0.3, "Village"); D["Monde_Lieux/L2"] = lieu("Sanctuaire de Ptolis", 0.6, "Sanctuaire");
    D["Monde_Batiment/B1"] = { ID_Batiment: "B1", ID_Lieu: "L2", Nom_Batiment: "Autel" }; D["Monde_Batiment/B9"] = { ID_Batiment: "B9", ID_Lieu: "L9" };
    D["Monde_PNJ/P1"] = { Nom_PNJ: "Ixa", ID_Lieu: "L1" }; D["Monde_PNJ/P2"] = { Nom_PNJ: "Orsin", ID_Batiment: "B1" }; D["Monde_PNJ/P3"] = { Nom_PNJ: "Valerius", ID_Lieu: "L9" };
    window.appliquerVillagesDeLaBase([{ id: "L1", data: D["Monde_Lieux/L1"] }, { id: "L2", data: D["Monde_Lieux/L2"] }]);
    window.appliquerVoyageDeLaPartie({ Position_Groupe: { Region: 5, x: 0.6, y: 0.5 }, Lieu_Actuel: "L2" });
    if (typeof window.actualiserDevVillages === "function") window.actualiserDevVillages();
    const bouton = document.getElementById("btn-lieux-tout-supprimer");
    const un = await window.supprimerVillageRegion("L1", { sansConfirmer: true });
    const apresUn = { lieu: !!D["Monde_Lieux/L1"], pnj: !!D["Monde_PNJ/P1"], autres: !!D["Monde_PNJ/P3"] && !!D["Monde_Lieux/L2"], attente: window.groupeEnAttente(), pos: window.positionGroupe() };
    const n = await window.supprimerTousLesLieuxRegion({ sansConfirmer: true });
    const apresTous = { n, lieu: !!D["Monde_Lieux/L2"], bat: !!D["Monde_Batiment/B1"], pnj: !!D["Monde_PNJ/P2"], autres: !!D["Monde_PNJ/P3"] && !!D["Monde_Batiment/B9"],
      attente: window.groupeEnAttente(), pos: window.positionGroupe(), base: (window.__majs || []).filter(m => /Systeme_Parties/.test(m.chemin) && m.data.Position_Groupe).pop() };
    const pion = (() => { const el = document.getElementById("pion-groupe-region"); return !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0; })();
    await window.teleporterGroupe({ Region: 5, x: 0.45, y: 0.5 });
    const apresTeleport = { attente: window.groupeEnAttente(), pos: window.positionGroupe() };
    localStorage.setItem("ivalis_DEV_MODE", "off");
    return { bouton: !!bouton && /tous les lieux/.test(bouton.textContent), un, apresUn, apresTous, pion, apresTeleport };
  });
  verifier("le bouton DEV « Supprimer tous les lieux de cette carte » est là", r.bouton);
  verifier("un lieu supprimé : sa fiche et ses PNJ partent de la base ; le reste ne bouge pas", r.un && !r.apresUn.lieu && !r.apresUn.pnj && r.apresUn.autres, JSON.stringify(r.apresUn));
  verifier("… il reste un lieu sur la carte (et le groupe y est) : le groupe ne bouge pas", !r.apresUn.attente && r.apresUn.pos && r.apresUn.pos.Region === 5, JSON.stringify(r.apresUn.pos));
  verifier("tous les lieux de la carte : les fiches, les bâtiments, les PNJ des bâtiments partent ; ceux d'ailleurs restent", r.apresTous.n === 1 && !r.apresTous.lieu && !r.apresTous.bat && !r.apresTous.pnj && r.apresTous.autres, JSON.stringify(r.apresTous));
  verifier("la carte est vide : le groupe est en attente (plus de position, plus de pion), sa région gardée en base", r.apresTous.attente && r.apresTous.pos === null && !r.pion && r.apresTous.base && r.apresTous.base.data.Position_Groupe.Attente === true && r.apresTous.base.data.Position_Groupe.Region === 5 && r.apresTous.base.data.Lieu_Actuel === "", JSON.stringify(r.apresTous.base));
  verifier("le téléport DEV le remet sur la carte", !r.apresTeleport.attente && r.apresTeleport.pos && r.apresTeleport.pos.Region === 5 && r.apresTeleport.pos.x === 0.45, JSON.stringify(r.apresTeleport));
});

console.log(erreurs.length ? "\nErreurs de page : " + erreurs.slice(0, 5).join(" | ") : "");
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
