// v304 — LA CLÉ DU COMBAT, LES PAGES QUI DÉFILENT, LA FLÈCHE DE SUITE, LES HÉROS EN GRAS,
// L'OUVERTURE SUR LA CARTE, PAS DE CLIC SUR LES MARQUE-PAGES, L'ARBITRE DES DÉS, LE NOUVEAU NARRATEUR.
//
// Nico : « pour l'erreur dans la console, mets que cette IA-là utilise la même
// clé API que le narrateur » ; « quand le récit va créer une nouvelle page, il
// tourne de suite la page : il va finir la page en cours et laisser le joueur
// tourner la page lui-même ; dessine une toute petite flèche noire dans le coin
// droit de la page en bas » ; « les noms des joueurs : juste en gras » ;
// « quand on clique sur un marque-page, une animation de pleins de pages qui
// défilent très vite, pareil dès qu'on clique sur un lien dans le livre » ;
// « après avoir chargé la partie, ouvre sur la page map globale » ; « enlève le
// son quand on clique sur un marque-page ou un bouton de l'index » ; « l'IA qui
// détermine les lancés de dés semble ne pas fonctionner… le destin hésite… je
// devrais pas voir ça » ; et son guide de style du Narrateur.
//
// Lancer : node tests_monstres/corrections_v304.mjs
// (IVALIS_RACINE=… pour un autre dossier ; V304_CAPTURES=dossier pour les captures.)
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
const CAPTURES = process.env.V304_CAPTURES || "";
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
// Les IA (Gemini), simulées : le Narrateur lite, les annonces, le titre d'un chapitre.
const appelsIA = [];
let iaEnPanne = false, refusPlume = false, panneCle1 = false;
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
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

await cliquer("#grimoire-btn-charger");
await p.waitForTimeout(700);
await cliquer('#grimoire-liste-parties [data-id="P1"]');
await p.waitForTimeout(150);
await p.fill("#grimoire-mdp-partie", "sel");
await cliquer("#grimoire-valider-partie");
await p.waitForTimeout(400);
await attendreQue(async () => (await page()) === 5, 4000);
await p.waitForTimeout(500);

const NARRATION = `La salle du Chaudron Fêlé sent la bière tiède et le chien mouillé. Derrière le comptoir, <strong style="color: #e8d5a5;">Varos</strong> essuie une chope sans nous accorder un regard.<br>Thorin, bien sûr, prend ce silence pour une invitation, et Lyra lève les yeux au ciel.`;
const M = [{ idDoc: "m1", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: NARRATION, Timestamp: 1000 }];

// =========================================================================
titre("1. LA PARTIE CHARGÉE : LE LIVRE S'OUVRE SUR LA CARTE DU MONDE");
// =========================================================================
await section(async () => {
  const e = await p.evaluate(() => ({ page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), enPartie: window.grimoireEtat().enPartie, carte: !!document.querySelector("#grimoire-carte-gauche img") }));
  verifier("après le chargement, la double page de la carte du monde (5-6)", e.enPartie && e.page === 5 && e.carte, JSON.stringify(e));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v304_ouverture_carte.png" });
});
await relayer(M, true);
await p.waitForTimeout(300);

// =========================================================================
titre("2. LES MARQUE-PAGES ET LES LIENS : LES PAGES DÉFILENT TRÈS VITE, SANS CLIC");
// =========================================================================
const surLeClic = (sel) => p.evaluate((sel) => {
  window.__sons = []; window.__clics = 0;
  const depart = window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex();
  document.querySelector(sel).click();
  // v306 : de vraies pages du livre, manuscrites, glissées le temps du défilement.
  const l = document.getElementById("grimoire-livre");
  return { feuilles: l.querySelectorAll(".page-manuscrite").length, ecrites: [...l.querySelectorAll(".page-manuscrite")].every(f => f.querySelectorAll(".ecriture-feuillet p").length >= 3),
           enCours: window.GRIMOIRE.defileEnCours(), depart };
}, sel);
const apres = () => p.evaluate(() => ({ page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), sons: window.__sons.map(x => x[0]), clics: window.__clics, reste: !!document.querySelector(".page-manuscrite") }));
await section(async () => {
  // La carte (5) → le récit (9) : le marque-page à la plume.
  const a = await surLeClic("#grimoire-marque-recit");
  if (CAPTURES) { await p.waitForTimeout(160); await p.screenshot({ path: CAPTURES + "/v304_pages_defilent.png" }); }
  verifier("le marque-page du récit : de vraies pages, écrites à la main, défilent (v306)", a.feuilles >= 4 && a.ecrites && a.enCours && a.depart === 5, JSON.stringify(a));
  await p.waitForTimeout(1100);
  let z = await apres();
  verifier("… le livre arrive au récit (page 9), les pages de passage s'en vont", z.page === 9 && !z.reste, JSON.stringify(z));
  verifier("le bruit : des pages qui défilent, et plus de son de clic", z.sons.join(",") === "pages-defilent" && z.clics === 0, JSON.stringify(z));
  // Le récit (9) → l'index (3) : le marque-page de l'index, à l'envers.
  const b2 = await surLeClic("#grimoire-marque-page");
  await p.waitForTimeout(1100);
  z = await apres();
  verifier("le marque-page de l'index : les pages défilent en arrière, jusqu'à l'index", b2.feuilles >= 4 && b2.enCours && z.page === 3 && z.sons.join(",") === "pages-defilent" && z.clics === 0, JSON.stringify([b2, z]));
  // Un lien du livre : « Le récit » dans l'index.
  const c = await surLeClic("#grimoire-index-recit");
  await p.waitForTimeout(1100);
  z = await apres();
  verifier("un lien de l'index (« Le récit ») : même défilement, sans clic", c.feuilles >= 4 && z.page === 9 && z.clics === 0 && !z.sons.includes("clic"), JSON.stringify([c, z]));
  // La double page voisine se tourne normalement (pas de liasse) : l'index → la carte.
  await p.evaluate(() => window.grimoireAllerIndex());
  await p.waitForTimeout(1100);
  const d = await surLeClic("#grimoire-index-carte");
  await p.waitForTimeout(900);
  z = await apres();
  verifier("la double page voisine (index → carte) : une seule page tourne, sans clic", d.feuilles === 0 && z.page === 5 && z.clics === 0, JSON.stringify([d, z]));
  const fab = await p.evaluate(() => !!(window.SONS_EVENEMENTS && window.SONS_EVENEMENTS["pages-defilent"]));
  verifier("la Fabrique a son bruit de « pages qui défilent »", fab);
});

// =========================================================================
titre("3. LES NOMS DES HÉROS : EN GRAS, SANS LIEN ; LES PNJ SE TOUCHENT TOUJOURS");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit());
  await p.waitForTimeout(1200);
  await attendreQue(() => p.evaluate(() => document.querySelectorAll(".mot.a-ecrire").length === 0), 6000);
  const r = await p.evaluate(() => {
    const h = [...document.querySelectorAll(".page-suite .nom-heros")];
    return { heros: h.map(x => x.textContent), gras: h.map(x => Number(getComputedStyle(x).fontWeight)), souligne: h.map(x => getComputedStyle(x).textDecorationLine), balise: h.map(x => x.tagName),
             liens: [...document.querySelectorAll(".page-suite .nom-livre")].map(a => a.dataset.nom) };
  });
  verifier("Thorin et Lyra en gras (comme l'ancien chat), sans souligné", ["Thorin", "Lyra"].every(n => r.heros.includes(n)) && r.gras.every(g => g >= 700) && r.souligne.every(s => s === "none") && r.balise.every(t => t === "B"), JSON.stringify(r));
  // v306 : « les noms cliquables ne marchent toujours pas » — en gras, ET touchables.
  verifier("v306 : ils se touchent comme Varos (un PNJ)", r.liens.includes("Thorin") && r.liens.includes("Lyra") && r.liens.includes("Varos"), r.liens.join(","));
  const c = await centre(".page-suite .nom-heros");
  await p.mouse.click(c.x, c.y);
  await p.waitForTimeout(600);
  verifier("v306 : un nom de héros touché : son papier sort", await p.evaluate(() => document.getElementById("recit-portrait").classList.contains("sortie")));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v304_heros_gras.png" });
});

// =========================================================================
titre("4. LA PAGE PLEINE : LA PLUME S'ARRÊTE, UNE PETITE FLÈCHE NOIRE, LE JOUEUR TOURNE");
// =========================================================================
await section(async () => {
  const phrase = "Nous marchons longtemps dans la poussière dorée de la route d'Arcaï, et je note chaque pas, chaque juron de Thorin, chaque silence de Lyra, comme on garde des pierres précieuses dans une bourse trop petite.";
  const long = Array.from({ length: 9 }, (_, i) => `${i + 1}. ${phrase}`).join("<br>");
  const M9 = M.concat([{ idDoc: "m10", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: long, Timestamp: 10000 }]);
  const avant = await page();
  await relayer(M9);
  let reste = -1;
  for (let i = 0; i < 120; i++) { const n = await p.evaluate(() => document.querySelectorAll(".mot.a-ecrire").length); if (n > 0 && n === reste) break; reste = n; await p.waitForTimeout(250); }
  const r = await p.evaluate(() => {
    const ici = window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), pages = [...document.querySelectorAll(".page-suite")];
    const visibles = pages.slice(ici - 7, ici - 5), suivantes = pages.slice(ici - 5);
    const droite = pages[ici - 7 + 1], f = droite && droite.querySelector(".fleche-suite");
    const a = f && f.getBoundingClientRect(), d = droite.getBoundingClientRect(), st = f && getComputedStyle(f.querySelector("path"));
    return { ici, ouvertesFinies: !visibles.some(pg => pg.querySelector(".mot.a-ecrire")), suiteEnAttente: suivantes.some(pg => pg.querySelector(".mot.a-ecrire")),
             fleche: f ? { coinBas: d.bottom - a.bottom < d.height * 0.12, coinDroit: d.right - a.right < d.width * 0.15, petite: a.width < d.width * 0.08, noir: st.stroke } : null,
             flechesGauche: pages.filter((pg, j) => j % 2 === 0 && pg.querySelector(".fleche-suite")).length };
  });
  verifier("la plume finit la double page ouverte, puis s'arrête (le livre ne tourne pas tout seul)", avant === 9 && r.ici === 9 && r.ouvertesFinies && r.suiteEnAttente, JSON.stringify(r));
  verifier("une toute petite flèche noire au coin bas-droit de la page de droite", r.fleche && r.fleche.coinBas && r.fleche.coinDroit && r.fleche.petite && /rgb\(18, 11, 6\)/.test(r.fleche.noir) && r.flechesGauche === 0, JSON.stringify(r.fleche));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v304_fleche_suite.png" });
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.flipNext("top"));
  await p.waitForTimeout(900);
  const enCours = await p.evaluate(() => document.querySelectorAll(".mot.a-ecrire").length);
  await p.waitForTimeout(1200);
  const plusTard = await p.evaluate(() => document.querySelectorAll(".mot.a-ecrire").length);
  verifier("le joueur tourne la page : la plume reprend là où elle s'était arrêtée", (await page()) === 11 && plusTard < enCours, `${enCours} → ${plusTard} mots à écrire`);
  for (let k = 0; k < 5 && (await p.evaluate(() => document.querySelectorAll(".mot.a-ecrire").length)); k++) {
    await attendreQue(() => p.evaluate(() => { const ici = window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(); return ![...document.querySelectorAll(".page-suite")].slice(ici - 7, ici - 5).some(pg => pg.querySelector(".mot.a-ecrire")); }), 15000);
    if (await p.evaluate(() => document.querySelectorAll(".mot.a-ecrire").length)) await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.flipNext("top"));
    await p.waitForTimeout(900);
  }
  const fin = await p.evaluate(() => { const pages = [...document.querySelectorAll(".page-suite")]; return { reste: document.querySelectorAll(".mot.a-ecrire").length, derniere: pages.slice(-2).some(pg => pg.querySelector(".fleche-suite")) }; });
  verifier("le récit se finit ; sur la dernière double page, pas de flèche", fin.reste === 0 && !fin.derniere, JSON.stringify(fin));
});

// =========================================================================
titre("5. LE COMBAT : PLUS DE « LE DESTIN HÉSITE… » ; LA NOTE SEULEMENT S'IL Y A COMBAT");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.livreRecitPartie({ IA_En_Cours: false, Combat_RP: { Etat: "detection" } }));
  await p.waitForTimeout(800);
  const d = await p.evaluate(() => ({ note: !!document.querySelector(".note-combat.sortie"), texte: document.body.innerText.includes("destin hésite"), ecrit: document.getElementById("recit-ecriture").classList.contains("sortie") }));
  verifier("la détection d'un combat : rien ne sort du livre, on peut écrire", !d.note && !d.texte && d.ecrit, JSON.stringify(d));
  await p.evaluate(() => window.livreRecitPartie({ IA_En_Cours: false, Combat_RP: { Etat: "preparation", Adversaires: "trois brigands" } }));
  await p.waitForTimeout(500);
  const c = await p.evaluate(() => { const n = document.querySelector(".note-combat"); return n ? n.innerText.replace(/\s+/g, " ").trim() : ""; });
  verifier("un vrai combat : la note « Face à trois brigands — Combattre »", /Face à trois brigands/.test(c) && /Combattre/.test(c), c);
  await p.evaluate(() => window.livreRecitPartie({ IA_En_Cours: false, Combat_RP: { Etat: "aucun" } }));
  await p.waitForTimeout(800);
});

// =========================================================================
titre("6. LA CLÉ DU COMBAT : LA MÊME QUE LE NARRATEUR (MIA_COMBAT ET LES AUTRES)");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => ({ combat: window.clesGeminiPour("combat"), mj: window.clesGeminiPour("mj") }));
  verifier("les IA du combat prennent la clé du Narrateur d'abord", r.combat[0] === "cle-banc" && r.combat[1] === "cle-seconde" && r.mj[0] === "cle-banc", JSON.stringify(r));
  panneCle1 = true;
  const avant = appelsIA.length;
  const statut = await p.evaluate(async () => { const res = await window.fetchGemini("combat", JSON.stringify({ contents: [{ parts: [{ text: "x" }] }] })); return res.status; });
  panneCle1 = false;
  const cles = appelsIA.slice(avant).map(a => a.cle);
  verifier("une clé sans crédit (402, « prepayment credits are depleted ») : la seconde prend le relais", statut === 200 && cles.join(",") === "cle-banc,cle-seconde", `${statut} ${cles.join(",")}`);
  const src = lire("cles_gemini.js");
  verifier("dans le code : 402 compte parmi les refus qui passent la main", /reponse\.status === 402/.test(src));
});

// =========================================================================
titre("7. L'ARBITRE DES DÉS : PLUS GÉNÉREUX, SUR LE MODÈLE DU NARRATEUR");
// =========================================================================
await section(async () => {
  const ia = lire("ia_master.js");
  verifier("l'arbitre demande un jet dès qu'un héros tente quelque chose d'incertain ; dans le doute, un jet", /DEMANDE UN JET dès qu'un héros TENTE/.test(ia) && /DANS LE DOUTE, DEMANDE UN JET/.test(ia), "");
  verifier("il juge avec Gemini 3.8 Flash (réflexion basse), Flash-Lite en secours, 20 s au plus", /const MODELE_ARBITRE = "gemini-3\.8-flash"/.test(ia) && /MODELE_ARBITRE_SECOURS = "gemini-flash-lite-latest"/.test(ia) && /const DELAI_ARBITRE_MS = 20000/.test(ia));
});

// =========================================================================
titre("8. LE NARRATEUR : UN COMPAGNON DU GROUPE, « JE » ET « NOUS », NATUREL");
// =========================================================================
await section(async () => {
  const ia = lire("ia_master.js");
  const prompt = (ia.match(/const PROMPT_NARRATEUR_LIVRE = `([\s\S]*?)`;/) || [])[1] || "";
  verifier("un membre à part entière du groupe, jamais un narrateur extérieur", /membre à part entière du groupe d'aventuriers/.test(prompt) && /JAMAIS le point de vue d'un narrateur extérieur/.test(prompt));
  verifier("« je » pour lui, « nous » pour le groupe ; ses sens, ses émotions, les réactions des autres", /« je » pour tes propres perceptions/.test(prompt) && /« nous » pour ce que le groupe vit ensemble/.test(prompt) && /émotions intérieures/.test(prompt) && /Observe tes compagnons/.test(prompt));
  verifier("varié, naturel, sans poésie forcée ; jamais les pensées des autres", /n'enchaîne pas les « je vois », « je regarde », « je remarque »/.test(prompt) && /Pas de poésie forcée/.test(prompt) && /ne raconte jamais leurs pensées/.test(prompt));
  verifier("sa personnalité : impliqué, observateur, émotif, complice ; l'exemple du chêne", /impliqué/.test(prompt) && /observateur/.test(prompt) && /émotif/.test(prompt) && /complice/.test(prompt) && /Je plaque mon dos contre le vieux chêne/.test(prompt));
  verifier("les règles du jeu restent (les dés, les combats, la forme)", /Ne demande JAMAIS de jet toi-même/.test(prompt) && /LES COMBATS/.test(prompt) && /Aucune mise en forme/.test(prompt) && /Ne décide JAMAIS à la place d'un héros/.test(prompt));
  // La plume : un joueur écrit, la consigne envoyée.
  await p.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit());
  await attendreQue(() => p.evaluate(() => document.getElementById("recit-ecriture").classList.contains("sortie")), 5000);
  await p.waitForTimeout(400);
  await p.evaluate(() => { window.__ajouts = []; });
  await p.fill("#recit-saisie", "Je me cache derrière le chêne avec les autres.");
  await p.press("#recit-saisie", "Enter");
  await attendreQue(() => p.evaluate(() => (window.__ajouts || []).some(a => a.col === "Messages_Chat")), 9000);
  const plume = appelsIA.filter(a => /CE QU'ÉCRIT SON JOUEUR/.test(a.txt)).slice(-1)[0];
  verifier("la plume écrit comme un compagnon : « je », « nous », une émotion ou la réaction des autres", plume && /membre à part entière/.test(plume.sys) && /« nous » pour ce que le groupe vit ensemble/.test(plume.sys) && /il ressent, il réagit/.test(plume.sys) && /la réaction visible des autres/.test(plume.sys));
  verifier("… et garde ses règles (enchaîner, jamais « Je vois », l'essence, rien d'inventé)", plume && /JUSTE APRÈS la dernière ligne du livre/.test(plume.sys) && /Ne commence JAMAIS par « Je vois »/.test(plume.sys) && /essence/.test(plume.sys) && /N'invente ni la suite/.test(plume.sys) && /ni les pensées du héros/.test(plume.sys));
  const g = lire("grimoire_recit.js");
  verifier("l'annonce du temps, vécue par le groupe (« nous »)", /const PROMPT_ANNONCE_LITE = `[^`]*« nous »[^`]*comme le groupe la vit/.test(g));
});

await section(async () => {
  const index = lire("index.html");
  const v = (re) => Number((index.match(re) || [])[1] || 0);
  verifier("versions", v(/grimoire\.js\?v=(\d+)"/) >= 7 && v(/grimoire\.css\?v=(\d+)"/) >= 6 && v(/grimoire_recit\.js\?v=(\d+)"/) >= 5 && v(/grimoire_recit\.css\?v=(\d+)"/) >= 4
           && v(/fabrique_sons\.js\?v=(\d+)"/) >= 21 && v(/ia_master\.js\?v=(\d+)"/) >= 19 && v(/cles_gemini\.js\?v=(\d+)"/) >= 2 && v(/trace_combat\.js\?v=(\d+)"/) >= 209
           && Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]) >= 304 && JSON.parse(lire("version.json") || "{}").version >= 304);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
