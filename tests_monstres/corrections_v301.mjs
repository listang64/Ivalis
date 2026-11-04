// v301 — LE GRIMOIRE : LE PARCHEMIN D'ÉCRITURE DEVIENT UN MARQUE-PAGE ; LE
// PORTRAIT SORT DU HAUT DE LA PAGE GAUCHE.
//
// Nico : « le parchemin où les joueurs écrivent, je veux qu'il soit de la
// même taille mais en marque-page au-dessus de la page droite » ; « l'image
// joueur / PNJ que tu fais sortir à gauche de la page gauche, je veux qu'elle
// sorte en haut de la page gauche et derrière les marque-pages ».
//
// Lancer : node tests_monstres/corrections_v301.mjs
// (IVALIS_RACINE=… pour un autre dossier ; V301_CAPTURES=dossier pour les captures.)
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
const CAPTURES = process.env.V301_CAPTURES || "";
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
// Les IA (Gemini), simulées : le Narrateur lite, les annonces, le titre d'un chapitre.
const appelsIA = [];
let iaEnPanne = false;
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**/generativelanguage.googleapis.com/**', r => {
  const corps = JSON.parse(r.request().postData() || "{}");
  const sys = ((corps.systemInstruction || {}).parts || [{}])[0].text || "", txt = (((corps.contents || [])[0] || {}).parts || [{}])[0].text || "";
  appelsIA.push({ url: r.request().url(), sys, txt });
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
  localStorage.setItem("ID_JOUEUR_COURANT", "J1"); localStorage.setItem("ivalis_GEMINI_API_KEY", "cle-banc");
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

const NARRATION = `J'ai connu des tavernes plus accueillantes que <span class="pnj-chat-hover"><strong>Le Chaudron Fêlé</strong><img src="chaudron.png" class="pnj-hover-img"></span>, mais rarement d'aussi bruyantes.<br>Derrière le comptoir, <strong style="color: #e8d5a5;">Varos</strong> essuie une chope. Thorin, bien sûr, prend ça pour une invitation. Lyra soupire.`;
const M = [{ idDoc: "m1", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: NARRATION, Timestamp: 1000 }];
await cliquer("#grimoire-btn-charger");
await p.waitForTimeout(700);
await cliquer('#grimoire-liste-parties [data-id="P1"]');
await p.waitForTimeout(150);
await p.fill("#grimoire-mdp-partie", "sel");
await cliquer("#grimoire-valider-partie");
await p.waitForTimeout(1300);
await relayer(M, true);
await p.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit());
// La page tourne (0,5 s), puis le parchemin sort (0,55 s) : on attend qu'il soit sorti (machine chargée ou non).
await attendreQue(() => p.evaluate(() => { const a = document.querySelector("#recit-ecriture .papier-ecriture"), b = document.getElementById("grimoire-suite-3");
  return !!(a && b) && b.getBoundingClientRect().top - a.getBoundingClientRect().top > 0.7 * a.getBoundingClientRect().height; }), 5000);
await p.waitForTimeout(300);
const mesures = () => p.evaluate(() => {
  const k = document.querySelector(".grimoire-fond-livre").getBoundingClientRect().width / 2000;
  const d = document.getElementById("grimoire-suite-3").getBoundingClientRect(), g = document.getElementById("grimoire-suite-2").getBoundingClientRect();
  const pap = document.querySelector("#recit-ecriture .papier-ecriture").getBoundingClientRect(), bande = document.querySelector("#recit-portrait .papier-usure").getBoundingClientRect();
  const r = (x) => ({ l: x.left, r: x.right, t: x.top, b: x.bottom, w: x.width, h: x.height });
  return { k, droite: r(d), gauche: r(g), pap: r(pap), bande: r(bande),
           sortie: document.getElementById("recit-ecriture").classList.contains("sortie"), portrait: document.getElementById("recit-portrait").classList.contains("sortie") };
});

// =========================================================================
titre("1. LE PARCHEMIN D'ÉCRITURE : UN MARQUE-PAGE AU-DESSUS DE LA PAGE DROITE, DE LA MÊME TAILLE");
// =========================================================================
await section(async () => {
  const m = await mesures();
  verifier("sur les pages du récit, il sort du haut de la page de droite", m.sortie && m.pap.t < m.droite.t - 150 * m.k && m.pap.l > m.droite.l && m.pap.r < m.droite.r, JSON.stringify({ haut: Math.round(m.pap.t), page: Math.round(m.droite.t) }));
  verifier("de la même taille qu'avant (575 × 250, en unités du livre)", Math.abs(m.pap.w / m.k - 575) < 25 && Math.abs(m.pap.h / m.k - 250) < 25, `${(m.pap.w / m.k).toFixed(0)} × ${(m.pap.h / m.k).toFixed(0)}`);
  const ordre = await p.evaluate(() => { const e = document.getElementById("recit-ecriture"), l = document.getElementById("grimoire-livre"); return e.parentNode === l.parentNode && !!(e.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING); });
  const x = (m.pap.l + m.pap.r) / 2;
  verifier("glissé sous les pages (comme un marque-page) : sous leur bord, c'est la page qu'on touche", ordre && await dans(x, m.droite.t + 15, "#grimoire-suite-3"), await dessus(x, m.droite.t + 15));
  const ta = await centre("#recit-saisie");
  verifier("au-dessus, on écrit dedans", await dans(ta.x, ta.y, "#recit-saisie"), await dessus(ta.x, ta.y));
  const marge = await p.evaluate(() => { const c = document.querySelector("#grimoire-suite-3 .page-recit"); return parseFloat(getComputedStyle(c).paddingBottom) / c.getBoundingClientRect().height; });
  verifier("la page de droite n'a plus de marge réservée en bas", marge < 0.1, marge.toFixed(2));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v301_ecriture.png" });
  await p.fill("#recit-saisie", "Je lève ma chope !");
  await p.press("#recit-saisie", "Enter");
  await attendreQue(() => p.evaluate(() => (window.__ajouts || []).some(a => a.col === "Messages_Chat")), 5000);
  verifier("on écrit toujours : la ligne part, récrite par le Narrateur lite", await p.evaluate(() => /trinque/.test(((window.__ajouts || []).find(a => a.col === "Messages_Chat") || { data: {} }).data.Texte_Livre || "")));
  // Ailleurs (l'index), il rentre tout entier derrière la page.
  await p.evaluate(() => window.grimoireAllerIndex());
  await p.waitForTimeout(1000);
  const r = await p.evaluate(() => ({ pap: document.querySelector("#recit-ecriture .papier-ecriture").getBoundingClientRect().top, page: document.getElementById("grimoire-page-4").getBoundingClientRect().top,
                                      sortie: document.getElementById("recit-ecriture").classList.contains("sortie") }));
  verifier("ailleurs, il rentre tout entier dans le livre (derrière la page)", !r.sortie && r.pap >= r.page - 1, `${r.pap.toFixed(0)} / ${r.page.toFixed(0)}`);
  await p.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit());
  await p.waitForTimeout(1000);
});

// =========================================================================
titre("2. LE PORTRAIT : (v306) IL SORT DU CÔTÉ GAUCHE DU LIVRE, SUR UN PAPIER USÉ");
// =========================================================================
// v306 : Nico, « les avatars, quand on clique sur leur nom, sortent du côté gauche
// du livre, un peu en biais » (corrections_v306 vérifie le reste).
await section(async () => {
  const avant = await mesures();
  verifier("rentré, on ne le voit pas", !avant.portrait);
  const nom = await centre('#grimoire-suite-2 .nom-livre[data-nom="Varos"]');
  await p.mouse.click(nom.x, nom.y);
  await p.waitForTimeout(800);
  const m = await mesures();
  verifier("un nom touché : le papier sort à gauche du livre, avec le nom", m.portrait && m.bande.r <= m.gauche.l + 2 && (await p.evaluate(() => document.getElementById("recit-portrait-nom").textContent)) === "Varos", JSON.stringify({ r: m.bande.r, page: m.gauche.l }));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v301_portrait.png" });
  await p.mouse.click(600, 20);
  await p.waitForTimeout(700);
  verifier("un toucher ailleurs : il rentre dans le livre", !(await mesures()).portrait);
});

// =========================================================================
titre("3. TOUS LES ÉCRANS : CE QUI SORT DU HAUT DU LIVRE RESTE DANS L'ÉCRAN");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { const n = document.querySelector('#grimoire-suite-2 .nom-livre[data-nom="Varos"]'); n.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); n.click(); });
  for (const [w, h] of [[1920, 1080], [2560, 1080], [1440, 900], [1194, 834], [1366, 768]]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(700);
    const m = await mesures();
    const bas = await p.evaluate(() => innerHeight - document.querySelector(".grimoire-fond-livre").getBoundingClientRect().bottom);
    verifier(`${w} × ${h} : le parchemin et le portrait sortis tiennent dans l'écran, le livre posé en bas`, m.sortie && m.portrait && m.pap.t >= 0 && m.bande.t >= 0 && bas >= 0 && bas <= h * 0.013 + 1,
             `parchemin ${m.pap.t.toFixed(0)} px, portrait ${m.bande.t.toFixed(0)} px`);
  }
  await p.setViewportSize({ width: 1194, height: 834 });
});

await section(async () => {
  const index = lire("index.html");
  const v = (re) => Number((index.match(re) || [])[1] || 0);
  verifier("versions", v(/grimoire\.js\?v=(\d+)"/) >= 5 && v(/grimoire_recit\.js\?v=(\d+)"/) >= 2 && v(/grimoire_recit\.css\?v=(\d+)"/) >= 2 && v(/trace_combat\.js\?v=(\d+)"/) >= 206
           && Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]) >= 301 && JSON.parse(lire("version.json") || "{}").version >= 301);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
