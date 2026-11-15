// v395 — LES PARAMÈTRES DANS LE LIVRE ; LE SON SUR LA PREMIÈRE PAGE ; LE PAPIER « QUITTER » ;
// CHARGER / NOUVELLE PARTIE SANS POPUP ; LE SOMMAIRE À L'AQUARELLE ; LE BOUCLIER MAGIQUE BRISÉ
// (le surplus / 2 sur la vie) ; LES RENFORTS PLUS RAPIDES ; PLUS DE BULLE D'INITIATIVE.
// (La mise en place du livre : celle de corrections_v373.)
//
// Lancer : node tests_monstres/corrections_v395.mjs   (V395_CAPTURES=dossier : les captures)
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
const CAPTURES = process.env.V395_CAPTURES || "";
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
await p.waitForTimeout(1500);
const cap = async (nom) => { if (CAPTURES) await p.screenshot({ path: CAPTURES + "/" + nom + ".png" }); };
await p.evaluate(() => {
  window.verifierMdpParametres = async (m) => m === "rune";
  window.confirmerRetourMenu = () => window.__appels.push("retour-menu");
  window.confirmerQuitterJeu = () => window.__appels.push("quitter-jeu");
});
const visible = (sel) => p.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0 && r.width > 0 && r.height > 0; }, sel);
const vueParam = () => p.evaluate(() => window.GRIMOIRE_PARAMETRES.vue());

titre("1. LE SOMMAIRE À L'AQUARELLE");
await section(async () => {
  await pose();
  const r = await p.evaluate(() => ({ entrees: [...document.querySelectorAll(".entree-index")].map(e => !!e.querySelector(":scope > svg.lavis")),
    titre: !!document.querySelector(".entete-index > svg.lavis"), texte: (document.querySelector(".entete-index") || {}).textContent }));
  verifier("un lavis sous chaque entrée du sommaire", r.entrees.length === 5 && r.entrees.every(Boolean), JSON.stringify(r.entrees));
  verifier("et sous le titre « Sommaire »", r.titre && /Sommaire/.test(r.texte || ""));
  await cap("sommaire");
});

titre("2. LE SON SOUS LE TITRE DE LA PREMIÈRE PAGE");
await section(async () => {
  await cliquer("#grimoire-marque-menu"); await p.waitForTimeout(400); await pose(); await p.waitForTimeout(400);
  const r = await p.evaluate(() => ({ dans: !!document.querySelector("#grimoire-page-1 .place-son #reglages-son"),
    curseurs: document.querySelectorAll("#grimoire-page-1 input[type=range]").length,
    plusDansLesParametres: !document.querySelector("#etape-mdp-parametres #reglages-son") }));
  verifier("les curseurs du son sont sur la première page", r.dans && r.curseurs === 3, JSON.stringify(r));
  verifier("ils ont quitté les Paramètres", r.plusDansLesParametres);
  verifier("on les voit", await visible("#vol-general"));
  await p.evaluate(() => { const i = document.getElementById("vol-musique"); i.value = "0.3"; i.dispatchEvent(new Event("input")); });
  verifier("ils règlent toujours le volume", await p.evaluate(() => Math.abs(window.PARAMETRES_AUDIO.musique - 0.3) < 0.001));
  await cap("page-son");
});

titre("3. LES RÉGLAGES RETIRÉS");
await section(async () => {
  const html = lire("index.html");
  [["l'écriture (choix de la police)", /btn-choisir-police|reglage-ecriture/], ["la Fabrique", /btn-ouvrir-fabrique|id="etape-fabrique"/],
   ["régénérer les images du lieu", /regenererImagesLieuActuel/], ["régénérer le pion tactique", /ouvrirRegenerationToken|etape-regeneration-token/],
   ["clôturer et vider le chat", /archiverSessionEtViderChat/], ["afficher les tokens", /id="toggle-tokens"/],
   ["les images des cartes de compétence", /interrupteur-illustration-cartes/]]
    .forEach(([nom, re]) => verifier("plus de « " + nom + " »", !re.test(html)));
});

titre("4. LES PARAMÈTRES : UN CHAPITRE DU LIVRE, SOUS CADENAS");
await section(async () => {
  await cliquer("#grimoire-btn-parametres"); await p.waitForTimeout(500); await pose(); await p.waitForTimeout(500);
  const e = await etat();
  verifier("le livre tourne jusqu'au chapitre des Paramètres", e.chapitre === "parametres" && [3, 4].includes(e.page), JSON.stringify(e));
  verifier("plus de fenêtre par-dessus le livre", await p.evaluate(() => getComputedStyle(document.getElementById("conteneur-parametres")).display === "none"));
  verifier("fermé : le mot de passe, pas de catégorie", await visible("#grimoire-mdp-param") && !(await p.evaluate(() => !!document.querySelector(".encart-parametres"))));
  await cap("parametres-cadenas");
  await p.fill("#grimoire-mdp-param", "faux"); await cliquer("#grimoire-param-deverrouiller"); await p.waitForTimeout(200);
  verifier("un mauvais mot de passe : refusé", (await vueParam()) === "verrou" && /incorrect/.test(await p.evaluate(() => document.getElementById("grimoire-msg-param").textContent)));
  verifier("un geste sans le mot de passe n'ouvre rien", await p.evaluate(() => { window.GRIMOIRE_PARAMETRES.naviguer("etape-menu-outils", "etape-cles-api"); return window.GRIMOIRE_PARAMETRES.vue() === "verrou"; }));
  await p.fill("#grimoire-mdp-param", "rune"); await cliquer("#grimoire-param-deverrouiller"); await p.waitForTimeout(300);
  const r = await p.evaluate(() => ({ cats: [...document.querySelectorAll(".encart-parametres")].map(x => x.dataset.cat),
    lavis: [...document.querySelectorAll(".encart-parametres")].every(x => !!x.querySelector(":scope > svg.lavis")),
    entrees: [...document.querySelectorAll(".entree-parametre")].map(x => x.textContent.trim()) }));
  verifier("ouvert : trois catégories, aquarellées", r.cats.join() === "mj,monde,atelier" && r.lavis, JSON.stringify(r.cats));
  verifier("les réglages qui restent y sont tous",
    ["Instructions de l'IA", "Réglages du narrateur", "Dépenses du MJ", "Clés API", "Effets de combat", "Races de l'univers", "Monstres", "Apparitions", "Butin", "Studio d'animation"].every(t => r.entrees.includes(t)), r.entrees.join(" / "));
  verifier("le mode DEV a sa case", await visible("#grimoire-param-dev"));
  await cap("parametres-categories");
});

titre("5. UNE PAGE DÉDIÉE PAR SOUS-MENU");
await section(async () => {
  await cliquer("#grimoire-param-cles"); await p.waitForTimeout(300);
  verifier("Clés API : sa fenêtre est posée sur la page de droite",
    await p.evaluate(() => !!document.querySelector("#grimoire-page-4 .place-fenetre #etape-cles-api")) && await visible("#etape-cles-api"));
  verifier("la page de gauche porte son titre", /Clés API/.test(await p.evaluate(() => document.getElementById("grimoire-page-3").textContent)));
  await cap("parametres-cles");
  // Son « Retour » (naviguerFenetre, app.js) ramène aux catégories.
  await p.evaluate(() => [...document.querySelectorAll("#etape-cles-api button")].find(x => /Retour/.test(x.textContent)).click());
  await p.waitForTimeout(300);
  verifier("son « Retour » ramène aux catégories", (await vueParam()) === "menu" && await visible(".encart-parametres"));
  verifier("la fenêtre est rentrée chez elle, cachée", await p.evaluate(() => document.getElementById("etape-cles-api").parentNode.id === "conteneur-parametres" && document.getElementById("etape-cles-api").style.display === "none"));
  // Un grand tableau : toute la double page.
  await p.evaluate(() => { window.chargerTableauEffets = async () => {}; });
  await cliquer("#grimoire-param-effets"); await p.waitForTimeout(400);
  verifier("Effets de combat : le grand tableau prend la double page",
    await p.evaluate(() => !!document.querySelector("#grimoire-param-large .place-large #etape-gestion-effets")) && await visible("#grimoire-param-large") && await visible("#etape-gestion-effets"));
  const g = await p.evaluate(() => { const a = document.getElementById("grimoire-param-large").getBoundingClientRect(), l = document.getElementById("grimoire-livre").getBoundingClientRect(); return { a: [a.left, a.right], l: [l.left, l.right] }; });
  verifier("…posé sur les deux pages", g.a[0] > g.l[0] && g.a[1] < g.l[1] && (g.a[1] - g.a[0]) > 0.85 * (g.l[1] - g.l[0]), JSON.stringify(g));
  await cap("parametres-effets");
  await cliquer("#grimoire-param-large [data-action='param-menu']"); await p.waitForTimeout(300);
  await p.waitForTimeout(300);
  const rr = { vue: await vueParam(), calque: await visible("#grimoire-param-large"), classe: await p.evaluate(() => document.getElementById("grimoire-param-large").className + " " + getComputedStyle(document.getElementById("grimoire-param-large")).opacity), parent: await p.evaluate(() => document.getElementById("etape-gestion-effets").parentNode.id) };
  verifier("« Retour aux paramètres » : les catégories, le tableau rangé", rr.vue === "menu" && !rr.calque && rr.parent === "conteneur-parametres", JSON.stringify(rr));
  // Le narrateur : son « Sauvegarder » revient aussi aux catégories.
  await cliquer("#grimoire-param-narrateur"); await p.waitForTimeout(300);
  verifier("Réglages du narrateur : sa page", await visible("#grimoire-page-4 #etape-ia-parametre"));
  await p.evaluate(() => window.sauvegarderTemperature()); await p.waitForTimeout(200);
  verifier("« Sauvegarder » : retour aux catégories", (await vueParam()) === "menu");
  // Le mode DEV, coché à la main.
  const avant = await p.evaluate(() => localStorage.getItem("ivalis_DEV_MODE"));
  await cliquer("#grimoire-param-dev"); await p.waitForTimeout(200);
  verifier("la case du mode DEV le bascule", (await p.evaluate(() => localStorage.getItem("ivalis_DEV_MODE"))) !== avant);
  await cliquer("#grimoire-param-dev"); await p.waitForTimeout(200);
});

titre("6. PAS DE PAGES DES PARAMÈTRES SANS LE MOT DE PASSE");
await section(async () => {
  await cliquer("#grimoire-param-cles"); await p.waitForTimeout(300);
  await cliquer("#grimoire-marque-menu"); await p.waitForTimeout(400); await pose(); await p.waitForTimeout(400);
  verifier("quitter la double page : le cadenas revient", (await vueParam()) === "verrou");
  verifier("la fenêtre est rangée", await p.evaluate(() => document.getElementById("etape-cles-api").parentNode.id === "conteneur-parametres"));
  verifier("en partie, le sommaire reprend sa place", (await etat()).chapitre === "index");
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.flip(3, "top")); await p.waitForTimeout(400); await pose(); await p.waitForTimeout(300);
  verifier("en tournant la page : le sommaire, pas les paramètres", (await etat()).chapitre === "index" && !(await p.evaluate(() => !!document.querySelector(".encart-parametres, #grimoire-mdp-param"))));
  // Rouverts : sous cadenas.
  await cliquer("#grimoire-marque-menu"); await p.waitForTimeout(400); await pose(); await p.waitForTimeout(300);
  await cliquer("#grimoire-btn-parametres"); await p.waitForTimeout(500); await pose(); await p.waitForTimeout(400);
  verifier("rouverts : de nouveau sous cadenas", (await vueParam()) === "verrou" && await visible("#grimoire-mdp-param"));
  await cliquer("#grimoire-marque-menu"); await p.waitForTimeout(400); await pose(); await p.waitForTimeout(300);
});

titre("7. LE PAPIER « QUITTER » SORT À DROITE DU LIVRE");
await section(async () => {
  const avant = await p.evaluate(() => window.__appels.length);
  await cliquer("#grimoire-btn-quitter"); await p.waitForTimeout(800);
  const r = await p.evaluate(() => {
    const pq = document.getElementById("grimoire-papier-quitter"), f = pq.getBoundingClientRect(), pg = document.getElementById("grimoire-livre").getBoundingClientRect();
    return { sorti: pq.classList.contains("sorti"), texte: document.getElementById("grimoire-question-quitter").textContent, gauche: f.left, droite: f.right, pages: pg.right,
             modale: getComputedStyle(document.getElementById("modale-retour-menu")).display, vw: innerWidth };
  });
  verifier("le papier sort, sans popup", r.sorti && r.modale === "none", JSON.stringify(r));
  verifier("en partie, il demande « Quitter la partie ? »", r.texte === "Quitter la partie ?");
  verifier("il dépasse à droite des pages, sans sortir de l'écran", r.droite > r.pages + 20 && r.droite <= r.vw, JSON.stringify(r));
  const oui = await centre("#grimoire-quitter-oui");
  verifier("son « Oui » est sous le doigt", oui && await dans(oui.x, oui.y, "#grimoire-quitter-oui"));
  await cap("papier-quitter");
  await cliquer("#grimoire-quitter-non"); await p.waitForTimeout(700);
  verifier("« Non » : il rentre, rien ne se passe", !(await p.evaluate(() => document.getElementById("grimoire-papier-quitter").classList.contains("sorti"))) && (await p.evaluate(() => window.__appels.length)) === avant);
  await cliquer("#grimoire-btn-quitter"); await p.waitForTimeout(700);
  await cliquer("#grimoire-quitter-oui"); await p.waitForTimeout(300);
  verifier("« Oui » : on quitte la partie", await p.evaluate(() => window.__appels.includes("retour-menu")));
});

titre("8. CHARGER / NOUVELLE PARTIE EN PARTIE : PLUS DE POPUP");
await section(async () => {
  await p.evaluate(() => { window.__appels.length = 0; });
  await cliquer("#grimoire-btn-charger"); await p.waitForTimeout(500); await pose(); await p.waitForTimeout(300);
  const e = await etat();
  verifier("Charger : la partie est quittée d'elle-même", await p.evaluate(() => window.__appels.includes("retour-menu")));
  verifier("…et la liste des parties s'ouvre", e.chapitre === "charger" && [3, 4].includes(e.page), JSON.stringify(e));
  verifier("sans la question du retour au menu", await p.evaluate(() => getComputedStyle(document.getElementById("modale-retour-menu")).display === "none"));
  await cliquer("#grimoire-marque-menu"); await p.waitForTimeout(400); await pose(); await p.waitForTimeout(300);
  await p.evaluate(() => { window.__appels.length = 0; });
  await cliquer("#grimoire-btn-nouvelle"); await p.waitForTimeout(500); await pose(); await p.waitForTimeout(300);
  verifier("Nouvelle partie : pareil", await p.evaluate(() => window.__appels.includes("retour-menu")) && (await etat()).chapitre === "nouvelle");
});

titre("9. LE BOUCLIER MAGIQUE BRISÉ : LE RESTE DES DÉGÂTS / 2 SUR LA VIE");
await section(async () => {
  const ce = await import(path.join(RACINE, "combat_etat.js"));
  const r = ce.encaisserBouclier(10, 17);
  verifier("10 de bouclier, 17 de dégâts : le bouclier tombe, 3 sur la vie", r.bouclierApres === 0 && r.surBouclier === 10 && r.versPv === 3 && r.brise, JSON.stringify(r));
  verifier("un coup qui ne le brise pas : rien sur la vie", ce.encaisserBouclier(10, 4).versPv === 0);
  verifier("sans bouclier : tout sur la vie", ce.encaisserBouclier(0, 9).versPv === 9);
  const mp = await import(path.join(RACINE, "moteur_pur.js"));
  const c = mp.chaineDeDegats({ pv: 60, pvMax: 60, bouclier: 12, etats: [], def: {} }, { valeurBrute: 30 }, {});
  verifier("dans la chaîne des dégâts : 30 sur 12 de bouclier → 9 sur la vie", c.bouclierBrise && c.versPv === 9, JSON.stringify({ b: c.bouclierApres, pv: c.versPv }));
});

titre("10. LES RENFORTS ET LA PISTE");
await section(async () => {
  const anim = lire("animations_jeu.js"), combat = lire("combat.js");
  verifier("les renforts : 1,2 s sur chaque créature (2 s avant)", /PAUSE_APPARITION_MS === undefined \? 1200/.test(anim));
  verifier("la caméra y glisse en 0,4 s", /GLISSE_CAMERA_MS = 400;/.test(anim));
  verifier("plus de bulle d'initiative sur la piste", !/rond-initiative/.test(combat));
});

titre("11. LES VERSIONS");
await section(async () => {
  const html = lire("index.html");
  verifier("index.html charge les Paramètres du livre", /grimoire_parametres\.js\?v=\d+"/.test(html) && /grimoire_parametres\.css\?v=\d+"/.test(html));
  verifier("la version du jeu : 395 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lire("trace_combat.js")) || [])[1]) >= 395 && JSON.parse(lire("version.json")).version >= 395);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
