// v388 — LA DOUBLE PAGE DES COMBATS ; LE FONDU DES IMAGES RÉDUIT À UN LISERÉ ; LA PAGE PRINCIPALE ÉPURÉE.
// Nico : « réduis énormément le fondu en bord d'image pour le RP, les classes et les races : je ne
// veux que la fine bordure en dégradé d'opacité » ; « quand on clique sur Combat dans le menu, ça
// ouvre une popup : crée une double page juste pour ça, à gauche le contenu de la popup, à droite ce
// qui s'ouvre lors de la création de la map avec l'avancement, la validation des belligérants visible
// par tous ; et quand la carte est prête, un bouton dans le même style que le livre pour rejoindre le
// combat » ; « sur la page principale, enlève Imaginé par Benjamin et Nicolas Duval et Les Chroniques,
// et centre tout ce qui reste ».
// (La mise en place du livre : celle de corrections_v373.)
//
// Lancer : node tests_monstres/corrections_v388.mjs
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
const CAPTURES = process.env.V388_CAPTURES || "";
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
await p.evaluate(() => window.appliquerVoyageDeLaPartie && window.appliquerVoyageDeLaPartie({ Position_Groupe: { Region: 5, x: 0.42, y: 0.55 } }));
await p.waitForTimeout(2500);
const cap = async (nom) => { if (CAPTURES) await p.screenshot({ path: CAPTURES + "/" + nom + ".png" }); };

// =========================================================================
titre("1. LA PAGE PRINCIPALE : SANS « IMAGINÉ PAR » NI « LES CHRONIQUES », CENTRÉE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { const g = window.GRIMOIRE; g.allerALaPage(1); }); await p.waitForTimeout(3500); await pose();
  await cap("v388_page_principale");
  const r = await p.evaluate(() => {
    const pg = document.querySelector(".page-titre"), page = pg.closest(".page-grimoire").getBoundingClientRect();
    const t = pg.querySelector(".titre-ivalis").getBoundingClientRect(), s = pg.querySelector(".titre-sous").getBoundingClientRect();
    // (v395) le son est passé sous le titre : tout le bloc (titre, fleuron, son) reste centré.
    const son = pg.querySelector(".place-son");
    const haut = Math.min(t.top, s.top), bas = Math.max(pg.querySelector(".fleuron").getBoundingClientRect().bottom, son ? son.getBoundingClientRect().bottom : 0);
    return { texte: pg.textContent.replace(/\s+/g, " ").trim(), cx: Math.abs((t.left + t.right) / 2 - (page.left + page.right) / 2) / page.width,
             cy: Math.abs((haut + bas) / 2 - (page.top + page.bottom) / 2) / page.height };
  });
  verifier("plus d'« Imaginé par Benjamin et Nicolas Duval » ni de « Les Chroniques »", !/Imagin|Duval|Chroniques/.test(r.texte) && /Ivalis/.test(r.texte), r.texte);
  verifier("ce qui reste est centré sur la page (dans les deux sens)", r.cx < 0.03 && r.cy < 0.06, JSON.stringify(r));
});

// =========================================================================
titre("2. LE FONDU DES IMAGES : UN FIN LISERÉ");
// =========================================================================
await section(async () => {
  const cc = lire("grimoire_creation.css"), rc = lire("grimoire_recit.css");
  verifier("une largeur fixe et fine (un peu plus d'un centième de page) pour le bord fondu", /\.fond-classe \{ --fondu-bord: calc\(var\(--u, 5px\) \* 1\.1\); \}/.test(cc));
  verifier("le haut, le bas et le bord extérieur des images (récit, peuples, classes) ne fondent plus que sur ce liseré", !/#000 3%, #000 97%|#000 96%, transparent/.test(cc + rc)
    && (cc.match(/var\(--fondu-bord\)/g) || []).length >= 10 && (rc.match(/var\(--fondu-bord\)/g) || []).length >= 10);
  verifier("le voile vers la page de gauche reste", /fond-recit\.gauche \{[^}]*0\.55\) 82%/.test(rc) && /\.fond-classe\.gauche \{[^}]*0\.55\) 82%/.test(cc));
  const m = await p.evaluate(() => { const d = document.createElement("div"); d.className = "page-grimoire page-papier droite page-creation page-classe"; d.style.cssText = "position:absolute;left:0;top:0;width:500px;height:700px;--u:5px";
    d.innerHTML = '<div class="fond-classe droite"><img alt=""></div>'; document.body.appendChild(d); const cs = getComputedStyle(d.firstChild); const r = cs.maskImage || cs.webkitMaskImage; d.remove(); return r; });
  verifier("… et le navigateur l'applique (5,5 px pour une page de 500 px)", /calc\(100% - 5\.5px\)|5\.5px/.test(m), m.slice(0, 160));
});

// =========================================================================
titre("3. LA DOUBLE PAGE DES COMBATS");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.grimoireAllerIndex()); await p.waitForTimeout(2500); await pose();
  await p.evaluate(() => { const b = [...document.querySelectorAll(".entree-index")].find(x => /combats/i.test(x.textContent)); b.click(); });
  await p.waitForTimeout(3000); await pose();
  const o = await p.evaluate(() => ({ ouverte: window.GRIMOIRE_COMBATS.ouverte(), popup: getComputedStyle(document.getElementById("modale-pre-combat")).display,
    g: document.getElementById("grimoire-combats-g").textContent.replace(/\s+/g, " "), d: document.getElementById("grimoire-combats-d").textContent.replace(/\s+/g, " ") }));
  verifier("« Les combats » du sommaire : le livre tourne jusqu'à leur double page, plus de popup", o.ouverte && o.popup === "none", JSON.stringify(o).slice(0, 200));
  verifier("à gauche le contenu de la popup (le combat en cours, l'arène)", /Les combats/.test(o.g) && /Combat en cours/.test(o.g) && /Aucun combat en cours/.test(o.g) && /arène de combat/.test(o.g), o.g.slice(0, 200));
  verifier("à droite, le champ de bataille (rien ne se prépare)", /Le champ de bataille/.test(o.d) && /Aucun combat ne se prépare/.test(o.d), o.d.slice(0, 160));
  await cap("v388_combats_vides");
  // L'arène : la même fonction que la popup.
  await p.evaluate(() => { window.__arene = 0; window.__vraieArene = window.validerPopupRencontre; window.validerPopupRencontre = () => { window.__arene++; }; });
  await p.evaluate(() => document.querySelector('#grimoire-combats-g [data-cb="arene"]').click()); await p.waitForTimeout(300);
  verifier("l'encart de l'arène l'ouvre (validerPopupRencontre)", await p.evaluate(() => window.__arene === 1));
  // La popup, appelée d'ailleurs, mène aussi ici.
  // (ce banc remplace ouvrirPopupRencontre par un espion : on lit la redirection dans combat.js)
  verifier("ouvrirPopupRencontre, en partie dans le livre, ouvre la double page", /window\.ouvrirPopupRencontre = function\(\) \{\s*\/\/[^\n]*\n\s*if \(window\.GRIMOIRE_COMBATS && window\.GRIMOIRE_COMBATS\.ouvrir\(\)\) return;/.test(lire("combat.js")));

  // La préparation : l'avancement, puis les belligérants à valider.
  const prep = (extra) => p.evaluate((extra) => window.appliquerCombatRPDeLaPartie(Object.assign({}, window.PARTIE_DATA || {},
    { Combat_RP: Object.assign({ Id: "crp_t", Etat: "preparation", Adversaires: "Des bandits du désert", Createur: { id: "autre:x", t: Date.now() } }, extra) })), extra);
  await prep({}); await p.waitForTimeout(900);
  const a = await p.evaluate(() => ({ etapes: [...document.querySelectorAll("#grimoire-combats-d .etapes-champ li")].map(li => li.classList.contains("fait")),
    titre: document.querySelector("#grimoire-combats-d .titre-page-fiche").textContent, gauche: document.getElementById("grimoire-combats-g").textContent }));
  verifier("en préparation : les sept étapes de la carte, aucune faite, « Création du champ de bataille… »", a.etapes.length === 7 && a.etapes.every(x => !x) && /Création du champ de bataille/.test(a.titre), JSON.stringify(a.etapes));
  verifier("… et à gauche, le combat qui se prépare (ses adversaires)", /se prépare/.test(a.gauche) && /bandits du désert/.test(a.gauche));
  const ennemis = { Apparition: 2, Visuels: { v1: {}, v2: {} }, Tirage: { depart: [{ nom: "Kesh le Balafré", archetype: "TANK CAC", leader: true, visuel: "v1" }, { nom: "Archer des dunes", archetype: "DPS DISTANCE", visuel: "v2" }], renforts: [{ nom: "Chacal enragé", archetype: "DPS CAC", visuel: "v2" }] } };
  await prep({ Remise: true, Lieu: { Titre: "Les ruines de Kesh" }, Carte: "x.png", Ennemis: ennemis }); await p.waitForTimeout(900);
  const b = await p.evaluate(() => ({ etapes: [...document.querySelectorAll("#grimoire-combats-d .etapes-champ li")].map(li => li.classList.contains("fait")),
    lieu: document.querySelector("#grimoire-combats-d .lieu-champ").textContent, cases: document.querySelectorAll('#grimoire-combats-d [data-cb="garder"]').length,
    valider: !!document.querySelector('#grimoire-combats-d [data-cb="valider"]'), fenetre: getComputedStyle(document.getElementById("fenetre-combat")).display }));
  verifier("la carte et les ennemis faits : cochés ; le lieu écrit", b.etapes[0] && b.etapes[1] && !b.etapes[2] && b.lieu === "Les ruines de Kesh", JSON.stringify(b));
  verifier("les belligérants à valider, dans le livre (chacun sa case), sans entrer dans la fenêtre de combat", b.cases === 3 && b.valider && b.fenetre === "none", JSON.stringify(b));
  // Décocher le chacal ; une nouvelle de la partie (la même) ne réécrit pas la liste sous les doigts.
  await p.evaluate(() => document.querySelector('#grimoire-combats-d [data-cb="garder"][data-groupe="renforts"]').click()); await p.waitForTimeout(200);
  await prep({ Remise: true, Lieu: { Titre: "Les ruines de Kesh" }, Carte: "x.png", Ennemis: ennemis }); await p.waitForTimeout(700);
  verifier("décoché, il reste décoché (barré)", await p.evaluate(() => document.querySelector('#grimoire-combats-d [data-cb="garder"][data-groupe="renforts"]').classList.contains("ecarte")));
  await cap("v388_belligerants");
  await p.evaluate(() => { window.__valide = null; window.__vraiValider = window.validerEnnemisCombatRP; window.validerEnnemisCombatRP = async (choix) => { window.__valide = { depart: [...choix.depart], renforts: [...choix.renforts] }; return true; }; });
  await p.evaluate(() => document.querySelector('#grimoire-combats-d [data-cb="valider"]').click()); await p.waitForTimeout(400);
  verifier("« Valider » écarte ceux qu'on a décochés (la même validation que la fenêtre de combat)", await p.evaluate(() => JSON.stringify(window.__valide) === '{"depart":[],"renforts":[0]}'), await p.evaluate(() => JSON.stringify(window.__valide)));
  await p.evaluate(() => { window.validerEnnemisCombatRP = window.__vraiValider; });
  verifier("validerEnnemisCombatRP prend les écartés qu'on lui passe", /window\.validerEnnemisCombatRP = async function\(choix\)/.test(lire("combat_rp.js")) && /new Set\(choix && choix\.renforts \? choix\.renforts : \[\]\)/.test(lire("combat_rp.js")));
  await prep({ Remise: true, Lieu: { Titre: "Les ruines de Kesh" }, Carte: "x.png", Ennemis: ennemis, Ennemis_Valides: { Nom: "Nico", Retires: 1 }, Tokens: { v1: "a", v2: "b" } }); await p.waitForTimeout(900);
  const v = await p.evaluate(() => ({ aide: document.querySelector("#grimoire-combats-d .aide-belligerants").textContent, cases: document.querySelectorAll('#grimoire-combats-d [data-cb="garder"]').length,
    noms: document.querySelectorAll("#grimoire-combats-d .belligerant.fixe").length, rejoindre: !!document.querySelector(".bouton-rejoindre-livre") }));
  verifier("validés : la liste reste lisible par tous, avec qui l'a validée", /Validés par Nico/.test(v.aide) && v.cases === 0 && v.noms === 3, JSON.stringify(v));
  verifier("… et pas encore de bouton pour rejoindre (la carte n'est pas prête)", !v.rejoindre);
  // Le bouton qui flotte : pas sur la double page ; ailleurs, en préparation, il mène ici.
  verifier("sur la double page, le bouton flottant « Rejoindre » ne se montre pas", await p.evaluate(() => !document.getElementById("bouton-rejoindre-combat")));
  await p.evaluate(() => window.grimoireAllerIndex()); await p.waitForTimeout(2500); await pose(); await p.waitForTimeout(1200);
  const fl = await p.evaluate(() => { const b = document.getElementById("bouton-rejoindre-combat"); return b ? b.textContent : null; });
  verifier("ailleurs, il dit que le combat se prépare", fl === "⚔️ Le combat se prépare", String(fl));
  await p.evaluate(() => { window.__ouvert = 0; window.__vraiOuvrir = window.ouvrirCombat; window.ouvrirCombat = () => { window.__ouvert++; }; window.rejoindreCombatRP(); });
  await p.waitForTimeout(3000); await pose();
  verifier("rejoindre pendant la préparation (le bouton, la note du récit) : la double page, pas la fenêtre de combat", await p.evaluate(() => window.GRIMOIRE_COMBATS.ouverte() && window.__ouvert === 0));
  // La carte prête : le bouton du livre.
  await p.evaluate((e) => window.appliquerCombatRPDeLaPartie(Object.assign({}, window.PARTIE_DATA || {}, { Combat_RP: { Id: "crp_t", Etat: "en_cours", Lieu: { Titre: "Les ruines de Kesh" }, Carte: "x.png", Ennemis: e, Ennemis_Valides: { Nom: "Nico", Retires: 1 }, Deploye: true, Createur: { id: "autre:x", t: Date.now() } } })), ennemis);
  await p.waitForTimeout(900);
  const r = await p.evaluate(() => { const b = document.querySelector("#grimoire-combats-d .bouton-rejoindre-livre"); if (!b) return null; const cs = getComputedStyle(b);
    return { texte: b.textContent.trim(), cadre: !!b.querySelector(":scope > .cadre-main"), lavis: !!b.querySelector(":scope > .lavis"), police: cs.fontFamily, taille: parseFloat(cs.fontSize),
             titre: document.querySelector("#grimoire-combats-d .titre-page-fiche").textContent }; });
  verifier("la carte prête : « Le champ de bataille est prêt » et un bouton tracé à la main, à l'aquarelle, à l'écriture du livre", !!r && /prêt/.test(r.titre) && r.texte === "Rejoindre le combat" && r.cadre && r.lavis && !/Cinzel/.test(r.police) && r.taille > 20, JSON.stringify(r));
  await cap("v388_rejoindre");
  await p.evaluate(() => document.querySelector("#grimoire-combats-d .bouton-rejoindre-livre").click()); await p.waitForTimeout(400);
  verifier("le toucher rejoint le combat (la fenêtre de combat s'ouvre)", await p.evaluate(() => window.__ouvert === 1));
  await p.evaluate(() => { window.ouvrirCombat = window.__vraiOuvrir; window.validerPopupRencontre = window.__vraieArene; window.appliquerCombatRPDeLaPartie(Object.assign({}, window.PARTIE_DATA || {}, { Combat_RP: null })); });
});

// =========================================================================
titre("4. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire("index.html");
  verifier("index.html charge la double page des combats et les nouvelles versions", [/grimoire_combats\.js\?v=1"/, /grimoire_combats\.css\?v=1"/, /grimoire\.js\?v=28"/, /grimoire\.css\?v=19"/,
    /grimoire_recit\.css\?v=22"/, /grimoire_creation\.css\?v=9"/, /combat_rp\.js\?v=18"/, /combat\.js\?v=180"/].every(r => r.test(html)));
  verifier("la version du jeu : 388 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lire("trace_combat.js")) || [])[1]) >= 388 && JSON.parse(lire("version.json")).version >= 388);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
