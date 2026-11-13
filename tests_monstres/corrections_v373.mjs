// v373 — LES CARTES DU LIVRE : PLUS D'OMBRE ; LES FENÊTRES DU VOYAGE EN FONDU SUR LA PAGE DE GAUCHE.
// Nico : « toutes les popups qui s'ouvrent pour les déplacements sur les maps : plutôt que des
// popups, que ça s'affiche en fondu sur la page de gauche » (toutes ; le titre remonte en haut ;
// à l'encre sur la page ; sur la carte du monde, « un post-it qui sort par le haut »). Et : « sur
// toutes mes pages map une ombre carrée disgracieuse : enlève-les, pas besoin d'ombrage ».
// (La mise en place du livre et des cartes : celle de corrections_v310.)
//
// Lancer : node tests_monstres/corrections_v373.mjs
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
  export const getDocs = async () => ({ forEach() {}, docs: [], empty: true, size: 0 });
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
const CAPTURES = process.env.V373_CAPTURES || "";
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


const geo = () => p.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
  return { livre: r(document.getElementById("grimoire-livre")), vue: r(document.getElementById("vue-carte-region")), pliure: r(document.getElementById("region-pliure")) };
});

const cap = async (nom) => { if (CAPTURES) await p.screenshot({ path: CAPTURES + "/" + nom + ".png" }); };
// Le voyage de la partie, comme Firestore le relaie.
const POS = { Region: 5, x: 0.42, y: 0.55 };
const VOTANTS = [{ id: "J1", nom: "Ben" }, { id: "J2", nom: "Nico" }];
const voyageRegion = (etat, extra) => Object.assign({ Id: "V1", Type: "region", Etat: etat, Depart: POS, Arrivee: { Region: 5, x: 0.6, y: 0.4, Nom: "Puits de Kesh" },
  Jours: 2, Jour: 1, Etapes: [0.5, 1], Aspect: 1, Longueur: 0.3, Debut_Marche: Date.now(), Votants: VOTANTS, Votes: {}, Initiateur: { id: "J1", nom: "Ben" }, Trace: [{ x: 0.42, y: 0.55 }, { x: 0.6, y: 0.4 }] }, extra || {});
const relayerVoyage = (v) => p.evaluate((d) => window.appliquerVoyageDeLaPartie(d), v ? { Position_Groupe: POS, Voyage_Groupe: v } : { Position_Groupe: POS });
// La double page du désert (5), sa carte vivante posée (le livre peut encore partir vers le récit à l'entrée).
const surLeDesert = async () => {
  for (let k = 0; k < 3; k++) {
    await p.evaluate(() => window.GRIMOIRE_REGIONS.ouvrir(5));
    const ok = await attendreQue(() => p.evaluate(() => window.GRIMOIRE_REGIONS.montee() === 5 && window.carteRegionaleOuverte() === 5 && document.getElementById("ecran-jeu").classList.contains("livre-carte")), 15000);
    await pose(); await p.waitForTimeout(1200);
    if (ok && await p.evaluate(() => window.GRIMOIRE_REGIONS.montee() === 5 && document.getElementById("ecran-jeu").classList.contains("livre-carte"))) return true;
  }
  return false;
};
// Où est une fenêtre, et à quoi elle ressemble.
const fenetre = (id) => p.evaluate((id) => {
  const el = document.getElementById(id); if (!el) return null;
  const page = el.closest(".page-region.gauche"), cs = getComputedStyle(el), r = el.getBoundingClientRect(), rp = page && page.getBoundingClientRect();
  const titre = page && page.querySelector(".region-titre-page"), rt = titre && titre.getBoundingClientRect();
  return { region: page ? page.dataset.region : null, postit: !!el.closest("#voyage-postit"), dansEcran: el.parentNode && el.parentNode.id === "ecran-jeu",
           position: cs.position, fond: cs.backgroundColor, bord: cs.borderTopStyle, animation: cs.animationName, vu: cs.display !== "none" && r.width > 0,
           dedans: rp ? r.left >= rp.left - 1 && r.right <= rp.right + 1 && r.top >= rp.top - 1 && r.bottom <= rp.bottom + 1 : null,
           titreHaut: rt && rp ? (rt.top - rp.top) / rp.height : null, avecVoyage: page ? page.classList.contains("avec-voyage") : null };
}, id);

// =========================================================================
titre("1. PLUS D'OMBRE SUR LES CARTES");
// =========================================================================
await section(async () => {
  await pose(); await attendreQue(() => p.evaluate(() => !!window.GRIMOIRE_REGIONS.pageDuGroupe()), 8000); await pose();
  await surLeDesert();
  const r = await p.evaluate(() => {
    const ombre = (sel) => { const el = document.querySelector(sel); return el ? getComputedStyle(el, "::after").display : "absente"; };
    return { pliure: !!document.getElementById("region-pliure"), droite: ombre(".page-region.droite"), gauche: ombre(".page-region.gauche"), monde: ombre(".page-carte"),
             recit: ombre(".page-papier:not(.page-region):not(.page-carte)") };
  });
  verifier("la pliure carrée par-dessus la carte vivante a disparu", !r.pliure, JSON.stringify(r));
  verifier("la page de la carte régionale et la carte du monde n'ont plus l'ombre du dos", r.droite === "none" && r.monde === "none", JSON.stringify(r));
  verifier("les autres pages la gardent (la page du titre, le récit)", r.gauche !== "none" && r.recit !== "none", JSON.stringify(r));
  await cap("v373_sans_ombre");
});

// =========================================================================
titre("2. LE CHOIX DE LA DESTINATION, SUR LA PAGE DE GAUCHE");
// =========================================================================
await section(async () => {
  await surLeDesert();
  await p.evaluate(() => window.basculerModeVoyage());
  await attendreQue(() => p.evaluate(() => !!document.querySelector(".voyage-page #bandeau-voyage")), 8000); await p.waitForTimeout(700);
  const f = await fenetre("bandeau-voyage");
  verifier("« Touchez un point du terrain » s'écrit sur la page de gauche de la région", !!f && f.region === "5" && f.vu && f.dedans, JSON.stringify(f));
  verifier("… sans boîte (ni fond, ni bord, plus en surimpression), en fondu", !!f && f.position === "static" && /rgba\(0, 0, 0, 0\)|transparent/.test(f.fond) && f.bord === "none" && f.animation === "fondu-voyage-livre", JSON.stringify(f));
  verifier("le titre de la région remonte en haut de la page", !!f && f.avecVoyage && f.titreHaut < 0.12, JSON.stringify(f && f.titreHaut));
  await cap("v373_choix");
  await p.evaluate(() => window.basculerModeVoyage()); await p.waitForTimeout(700);
  const g = await fenetre("bandeau-voyage");
  verifier("annulé : la page se vide, le titre redescend", !!g && !g.vu && !g.avecVoyage && g.titreHaut > 0.25, JSON.stringify(g));
});

// =========================================================================
titre("3. LE VOTE, LA NUIT, LA MARCHE : SUR LA PAGE, LES BOUTONS MARCHENT");
// =========================================================================
await section(async () => {
  await surLeDesert();
  await p.evaluate(() => { window.__votes = []; window.voterVoyageGroupe = (a) => window.__votes.push(a); });
  await relayerVoyage(voyageRegion("vote"));
  await attendreQue(() => p.evaluate(() => !!document.querySelector(".voyage-page #boite-voyage")), 8000); await p.waitForTimeout(900);
  const f = await fenetre("boite-voyage");
  verifier("le vote s'écrit sur la page de gauche, sans boîte, en fondu", !!f && f.region === "5" && f.vu && f.dedans && f.position === "static" && f.animation === "fondu-voyage-livre", JSON.stringify(f));
  const t = await p.evaluate(() => document.getElementById("boite-voyage").textContent.replace(/\s+/g, " "));
  verifier("… avec la destination et les votants", /Puits de Kesh/.test(t) && /Ben/.test(t) && /Nico/.test(t), t.slice(0, 120));
  const c = await p.evaluate(() => { const b = document.querySelector('#boite-voyage [data-action="oui"]'); if (!b) return null; const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, touche: !!(el && el.closest('[data-action="oui"]')), bord: getComputedStyle(b).borderTopLeftRadius }; });
  verifier("le bouton « Partir » est tracé à la main, et rien ne le recouvre", !!c && c.touche && c.bord !== "7px", JSON.stringify(c));
  const avant = await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex());
  if (c) { await p.mouse.click(c.x, c.y); await p.waitForTimeout(500); }
  verifier("le toucher vote (et ne tourne pas la page)", JSON.stringify(await p.evaluate(() => window.__votes)) === '["oui"]' && (await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex())) === avant);
  await cap("v373_vote");
  await relayerVoyage(voyageRegion("nuit", { Choix_Nuit: {} })); await p.waitForTimeout(900);
  const n = await fenetre("boite-voyage");
  const tn = await p.evaluate(() => document.getElementById("boite-voyage").textContent);
  verifier("la nuit au campement : sur la page aussi", !!n && n.region === "5" && n.vu && /Nuit 1/.test(tn), JSON.stringify(n));
  await cap("v373_nuit");
  await relayerVoyage(voyageRegion("marche", { Jour: 1 })); await p.waitForTimeout(900);
  const m = await fenetre("boite-voyage");
  verifier("en marche : « En route vers… » sur la page", !!m && m.region === "5" && m.vu && /En route/.test(await p.evaluate(() => document.getElementById("boite-voyage").textContent)), JSON.stringify(m));
  await p.evaluate(() => window.annoncerJourVoyage(2)); await p.waitForTimeout(300);
  const j = await fenetre("annonce-jour-voyage");
  verifier("« JOUR 2 » s'écrit sur la page, puis s'efface", !!j && j.region === "5" && j.vu, JSON.stringify(j));
  await cap("v373_jour");
  await p.waitForTimeout(2900);
  verifier("… effacé", !(await fenetre("annonce-jour-voyage")).vu);
  await p.evaluate(() => window.annoncerVoyage("Voyage annulé : Nico a refusé.")); await p.waitForTimeout(300);
  const a = await fenetre("annonce-voyage");
  verifier("les petits messages aussi", !!a && a.region === "5" && a.vu, JSON.stringify(a));
  await relayerVoyage(null); await p.waitForTimeout(3200);
  const fin = await fenetre("boite-voyage");
  verifier("le voyage fini : la page se vide, le titre redescend", !!fin && !fin.vu && !fin.avecVoyage, JSON.stringify(fin));
});

// =========================================================================
titre("4. L'APERÇU D'UN LIEU : SUR LA PAGE, UN TOUCHER LE FERME");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.afficherApercuLieu({ nom: "Kesh", type: "Village", image: "" })); await p.waitForTimeout(500);
  const f = await fenetre("apercu-lieu");
  verifier("l'aperçu s'écrit sur la page de gauche (plus en plein écran)", !!f && f.region === "5" && f.vu && f.position === "static", JSON.stringify(f));
  await cap("v373_apercu");
  await cliquer("#apercu-lieu"); await p.waitForTimeout(400);
  verifier("un toucher le ferme", !(await fenetre("apercu-lieu")).vu);
});

// =========================================================================
titre("4 bis. SOUS LA LOUPE (LA CARTE EN GRAND) : LA FENÊTRE FLOTTE, EN BOUT DE PARCHEMIN");
// =========================================================================
await section(async () => {
  await relayerVoyage(voyageRegion("vote", { Id: "V3" }));
  await attendreQue(() => p.evaluate(() => !!document.querySelector(".voyage-page #boite-voyage")), 8000);
  await p.evaluate(() => window.LOUPE_CARTES.ouvrir());
  await attendreQue(() => p.evaluate(() => window.LOUPE_CARTES.etat() === "ouverte"), 8000); await p.waitForTimeout(800);
  const r = await p.evaluate(() => { const bo = document.getElementById("boite-voyage"), cs = getComputedStyle(bo), rr = bo.getBoundingClientRect();
    const bt = bo.querySelector('[data-action="oui"]'), rb = bt.getBoundingClientRect(), dessus = document.elementFromPoint(rb.left + rb.width / 2, rb.top + rb.height / 2);
    return { loupe: window.LOUPE_CARTES.etat(), page: !!bo.closest(".voyage-page"), position: cs.position, papier: /page\.webp/.test(cs.backgroundImage), dechire: /polygon/.test(cs.clipPath),
             vu: rr.width > 0 && cs.display !== "none" && cs.visibility !== "hidden", touche: !!(dessus && dessus.closest('[data-action="oui"]')) }; });
  verifier("sous la loupe, le vote reste une fenêtre (hors de la page), à l'écran", r.loupe === "ouverte" && !r.page && r.position === "fixed" && r.vu, JSON.stringify(r));
  verifier("… en bout de parchemin déchiré, son bouton au-dessus de la carte", r.papier && r.dechire && r.touche, JSON.stringify(r));
  await cap("v373_loupe");
  await p.evaluate(() => window.LOUPE_CARTES.fermerVite()); await p.waitForTimeout(400);
  await attendreQue(() => p.evaluate(() => !!document.querySelector(".voyage-page #boite-voyage")), 8000);
  verifier("la loupe fermée, il revient sur la page de gauche", await p.evaluate(() => !!document.querySelector(".voyage-page #boite-voyage") && !document.body.classList.contains("loupe-voyage")));
  await relayerVoyage(null); await p.waitForTimeout(600);
});

// =========================================================================
titre("5. LA CARTE DU MONDE : UN POST-IT QUI SORT PAR LE HAUT");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_REGIONS.versLeMonde());
  await pose(); await p.waitForTimeout(800);
  const avant = await p.evaluate(() => { const el = document.getElementById("voyage-postit"); return el ? el.classList.contains("sortie") : false; });
  await p.evaluate(() => window.basculerModeVoyage()); await p.waitForTimeout(900);
  const f = await fenetre("bandeau-voyage");
  const r = await p.evaluate(() => { const el = document.getElementById("voyage-postit"), l = document.getElementById("grimoire-livre").getBoundingClientRect();
    const pa = el.querySelector(".papier-voyage").getBoundingClientRect(), t = document.querySelector("#bandeau-voyage .bandeau-voyage-titre").getBoundingClientRect();
    return { sortie: el.classList.contains("sortie"), avantLivre: !!(el.compareDocumentPosition(document.getElementById("grimoire-livre")) & Node.DOCUMENT_POSITION_FOLLOWING),
             depasse: pa.top < l.top - 20, titreVu: t.top > 0 && t.bottom < l.top + 4, ecran: t.top >= 0 }; });
  verifier("rien n'est sorti avant", !avant);
  verifier("le choix de la région s'écrit dans le post-it", !!f && f.postit && f.vu && f.position === "static", JSON.stringify(f));
  verifier("le post-it sort par le haut du livre (glissé sous les pages), le texte au-dessus du livre, dans l'écran", r.sortie && r.avantLivre && r.depasse && r.titreVu && r.ecran, JSON.stringify(r));
  await cap("v373_monde");
  await p.evaluate(() => window.basculerModeVoyage()); await p.waitForTimeout(900);
  verifier("annulé : le post-it rentre", !(await p.evaluate(() => document.getElementById("voyage-postit").classList.contains("sortie"))));
  // Un vote d'une région à l'autre : plus long ; il tient dans ce qui dépasse du livre.
  await p.evaluate(() => { window.voterVoyageGroupe = () => {}; });
  await relayerVoyage(voyageRegion("vote", { Id: "V2", Type: "monde", Arrivee: { Region: 1 }, Votants: [...VOTANTS, { id: "J3", nom: "Ben 2" }] })); await p.waitForTimeout(1200);
  await p.evaluate(() => window.GRIMOIRE_REGIONS.versLeMonde()); await pose(); await p.waitForTimeout(900);
  const v = await p.evaluate(() => { const el = document.getElementById("voyage-postit"), l = document.getElementById("grimoire-livre").getBoundingClientRect();
    const bo = document.getElementById("boite-voyage"), r = bo.getBoundingClientRect(), bt = bo.querySelector("button");
    return { sortie: el.classList.contains("sortie"), dans: !!bo.closest("#voyage-postit"), haut: r.top, bas: r.bottom, livre: l.top, bouton: bt ? bt.getBoundingClientRect().bottom : 0 }; });
  verifier("un vote vers une autre région : dans le post-it, entier au-dessus du livre et dans l'écran", v.sortie && v.dans && v.haut >= 0 && v.bouton <= v.livre + 2, JSON.stringify(v));
  await cap("v373_monde_vote");
  await relayerVoyage(null); await p.waitForTimeout(600);
});

// =========================================================================
titre("6. AILLEURS QUE SUR LES CARTES : LES FENÊTRES RETOURNENT À L'ÉCRAN DE JEU");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit());
  await attendreQue(() => p.evaluate(() => !window.GRIMOIRE.defileEnCours()), 8000); await pose(); await p.waitForTimeout(600);
  const f = await fenetre("boite-voyage"), g = await fenetre("bandeau-voyage");
  verifier("dans le récit, elles sont rendues à l'écran de jeu (comme avant)", !!f && f.dansEcran && !!g && g.dansEcran, JSON.stringify({ f, g }));
});

// =========================================================================
titre("7. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire("index.html");
  verifier("index.html charge les nouvelles versions (grimoire_regions js 13, css 6, ou plus)", Number((/grimoire_regions\.js\?v=(\d+)"/.exec(html) || [])[1]) >= 13 && Number((/grimoire_regions\.css\?v=(\d+)"/.exec(html) || [])[1]) >= 6);
  verifier("la version du jeu : 373 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lire("trace_combat.js")) || [])[1]) >= 373 && JSON.parse(lire("version.json")).version >= 373);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
