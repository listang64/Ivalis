// v305 — LA TABLE : LE LIVRE POSÉ DESSUS, LA TABLE SUIT LE ZOOM, L'OMBRE PORTÉE.
//
// Nico : « voilà l'image que j'aimerais que tu mettes en background (la table
// vide)… et l'exemple pour te montrer où j'aimerais que tu places le livre fermé
// dessus. Quand on ouvre et que ça zoome un peu, la table, donc le background,
// suit le mouvement. Fais que l'image s'adapte à tous les écrans ; le plus
// important c'est que le livre reste à la même place sur la table, peu importe
// où l'image est tronquée et sur quel côté. » ; « sur le côté droit et bas du
// livre, l'ombre portée : refais la même entre la table et le livre » ; puis
// « grossis un peu la taille du livre posé sur la table ».
//
// Lancer : node tests_monstres/corrections_v305.mjs
// (IVALIS_RACINE=… pour un autre dossier ; V305_CAPTURES=dossier pour les
// captures ; V305_TABLE=fichier image de la vraie table pour les captures —
// sinon une table dessinée sur place.)
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lire = (f) => { try { return fs.readFileSync(path.join(RACINE, f), 'utf-8'); } catch (e) { return ""; } };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'application/octet-stream' }); res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({}); export const getApp = () => ({}); export const BANC_IVALIS = true;`;
const FAUX_FIRESTORE = `export const initializeFirestore = () => ({}); export const getFirestore = () => ({}); export const doc = () => ({}); export const collection = () => ({});
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) }); export const query = (c) => c; export const where = () => ({}); export const orderBy = () => ({}); export const limit = () => ({});
  export const getDocs = async () => ({ forEach() {}, docs: [], empty: true, size: 0 }); export const setDoc = async () => {}; export const updateDoc = async () => {}; export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "x" }); export const onSnapshot = () => () => {}; export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
  export const runTransaction = async () => {}; export const increment = (k) => k; export const deleteField = () => null; export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const serverTimestamp = () => Date.now(); export class FieldPath {} export const Timestamp = { now: () => Date.now() };`;
const CAPTURES = process.env.V305_CAPTURES || "";
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();

// Une table dessinée sur place (le banc n'a pas Internet) : du bois, à la taille donnée.
const dessinerTable = async (w, h) => {
  const pg = await b.newPage();
  const url = await pg.evaluate(([w, h]) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
    x.fillStyle = "#130c06"; x.fillRect(0, 0, w, h); x.fillStyle = "#7a4a26"; x.fillRect(w * 0.1, h * 0.06, w * 0.88, h * 0.88);
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(40,20,8,${0.1 + (i % 5) * 0.04})`; x.fillRect(w * 0.1, h * (0.06 + i * 0.022), w * 0.88, 2); }
    return c.toDataURL("image/png"); }, [w, h]);
  await pg.close();
  return Buffer.from(url.split(",")[1], "base64");
};
const VRAIE = process.env.V305_TABLE && fs.existsSync(process.env.V305_TABLE) ? fs.readFileSync(process.env.V305_TABLE) : null;
const TABLE_1672 = VRAIE || await dessinerTable(1672, 941);
const TABLE_GRANDE = await dessinerTable(2508, 1412);   // la même table, une fois et demie plus grande

const erreurs = [];
const titre = (t) => console.log("\n" + t);
const section = async (f) => { try { await f(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 180)); } };
const attendreQue = async (p, f, ms = 6000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await p.waitForTimeout(100); } return false; };

async function ouvrirPage(w, h, image, echelle = 1) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: echelle });
  const demandes = [];
  await p.route('**', r => { const u = r.request().url();
    if (u.startsWith(base)) return r.continue();
    if (/res\.cloudinary\.com\/.*BG_tjiigl/.test(u)) { demandes.push(u); return r.fulfill({ status: 200, contentType: VRAIE && image === TABLE_1672 ? 'image/webp' : 'image/png', body: image }); }
    return r.abort(); });
  await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
  await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
  p.on('pageerror', e => erreurs.push(e.message));
  await p.goto(base + '/index.html'); await p.waitForTimeout(900);
  await p.evaluate(() => {
    window.jouerSonEvenement = () => true; window.jouerSonClic = () => {};
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== "ecran-grimoire") e.style.display = "none"; });
    window.afficherGrimoire();
  });
  await attendreQue(p, () => p.evaluate(() => { const t = document.getElementById("grimoire-table"); return !!(t && t.complete && t.naturalWidth); }), 5000);
  await p.waitForTimeout(1500);
  return { p, demandes };
}
// Où est la couverture (sa boîte d'image), en pixels de l'image de la table ?
const surLaTable = (p) => p.evaluate(() => {
  const t = document.getElementById("grimoire-table");
  if (!t) return { couv: [NaN, NaN, NaN], livre: [NaN, NaN, NaN], table: [NaN, NaN, NaN, NaN], vw: innerWidth, vh: innerHeight, W: 0, H: 0 };
  const tb = t.getBoundingClientRect(), W = t.naturalWidth, H = t.naturalHeight;
  const c = document.querySelector("#grimoire-page-0 img").getBoundingClientRect(), l = document.getElementById("grimoire-livre").getBoundingClientRect();
  const enTable = (r) => [(r.left - tb.left) / tb.width * 1672, (r.top - tb.top) / tb.height * 941, r.height / tb.height * 941];
  return { couv: enTable(c), livre: enTable(l), table: [tb.left, tb.top, tb.right, tb.bottom], vw: innerWidth, vh: innerHeight, W, H };
});
const proche = (a, b, e = 2) => a.every((v, i) => Math.abs(v - b[i]) <= e);
const PLACE = [623, 150, 630];

// =========================================================================
titre("1. LA TABLE EN FOND : L'IMAGE DE NICO, LE LIVRE FERMÉ POSÉ À SA PLACE");
// =========================================================================
await section(async () => {
  const { p, demandes } = await ouvrirPage(1194, 834, TABLE_1672, CAPTURES ? 2 : 1);
  const r = await p.evaluate(() => { const t = document.getElementById("grimoire-table"), sc = document.getElementById("grimoire-scene");
    return { premier: !!t && sc.firstElementChild === t, src: t ? t.getAttribute("src") : "", fond: getComputedStyle(document.getElementById("ecran-grimoire"), "::before").backgroundColor, ferme: sc.classList.contains("ferme") }; });
  verifier("l'image de la table (Cloudinary, BG_tjiigl) est au fond de la scène du livre", r.premier && /res\.cloudinary\.com\/dlkjq4kvg\/image\/upload\/.*BG_tjiigl\.png$/.test(r.src) && demandes.length >= 1, r.src);
  verifier("derrière, plus de beige : le plancher sombre (le bord de l'image)", r.fond === "rgb(19, 12, 6)", r.fond);
  const m = await surLaTable(p);
  verifier("livre fermé : la couverture sur sa place de la table (x 623, y 150, 630 de haut)", r.ferme && proche(m.couv, PLACE), m.couv.map(v => v.toFixed(1)).join(" / "));
  verifier("la table couvre tout l'écran", m.table[0] <= 0.5 && m.table[1] <= 0.5 && m.table[2] >= m.vw - 0.5 && m.table[3] >= m.vh - 0.5, m.table.map(Math.round).join(","));
  const inv = await p.evaluate(() => getComputedStyle(document.getElementById("grimoire-invite")).color);
  verifier("« Touchez le grimoire » se lit sur le bois sombre (clair)", /rgba?\(240, 224, 192/.test(inv), inv);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v305_table_ferme.png" });
  // L'ouverture : la table suit le zoom ; le livre ne glisse pas sur elle.
  const avant = m;
  await p.evaluate(() => window.ouvrirGrimoire());
  await p.waitForTimeout(330);
  const milieu = await surLaTable(p);
  await p.waitForTimeout(1300);
  const apres = await surLaTable(p);
  const zoom = (apres.table[2] - apres.table[0]) / (avant.table[2] - avant.table[0]);
  verifier("à l'ouverture, la table suit le zoom du livre (iPad : presque rien depuis le livre grossi)", zoom > 0.98 && zoom < 1.6, `× ${zoom.toFixed(3)}`);
  verifier("… et le livre reste à sa place sur elle, pendant et après", proche(milieu.livre, avant.livre, 2.5) && proche(apres.livre, avant.livre, 2.5), [avant.livre, milieu.livre, apres.livre].map(x => x.map(v => v.toFixed(1)).join(" ")).join(" | "));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v305_table_ouvert.png" });
  await p.close();
});

// =========================================================================
titre("2. TOUS LES ÉCRANS : RECADRÉE D'UN CÔTÉ OU DE L'AUTRE, LE LIVRE NE BOUGE PAS SUR LA TABLE");
// =========================================================================
await section(async () => {
  for (const [w, h] of [[1920, 1080], [1366, 768], [1024, 768], [844, 390], [834, 1194], [2560, 1080]]) {
    const { p } = await ouvrirPage(w, h, TABLE_1672);
    const m = await surLaTable(p);
    const couvre = m.table[0] <= 0.5 && m.table[1] <= 0.5 && m.table[2] >= w - 0.5 && m.table[3] >= h - 0.5;
    const c = await p.evaluate(() => { const r = document.querySelector("#grimoire-page-0 img").getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; });
    verifier(`${w} × ${h} : le livre à sa place, la table couvre l'écran, le livre entier visible`, proche(m.couv, PLACE) && couvre && c, m.couv.map(v => v.toFixed(1)).join(" / ") + " · table " + m.table.map(Math.round).join(","));
    if (CAPTURES && w === 834) await p.screenshot({ path: CAPTURES + "/v305_table_portrait.png" });
    await p.close();
  }
});

// =========================================================================
titre("3. UNE IMAGE D'UNE AUTRE TAILLE : SA VRAIE TAILLE EST RELUE, LE LIVRE GARDE SA PLACE");
// =========================================================================
await section(async () => {
  const { p } = await ouvrirPage(1194, 834, TABLE_GRANDE);
  const m = await surLaTable(p);
  verifier("une table de 2508 × 1412 : le livre au même endroit (en proportions)", m.W === 2508 && proche(m.couv, PLACE), `${m.W}×${m.H} · ` + m.couv.map(v => v.toFixed(1)).join(" / "));
  await p.close();
});

// =========================================================================
titre("4. L'OMBRE PORTÉE : EN BAS ET À DROITE DU LIVRE, SUR LA TABLE");
// =========================================================================
await section(async () => {
  const { p } = await ouvrirPage(1194, 834, TABLE_1672);
  const r = await p.evaluate(() => {
    const o = document.getElementById("grimoire-ombre-couverture");
    if (!o) return { src: "", filtre: "", decale: [0, 0], hauteur: 1, opacite: 0, livreOuvert: getComputedStyle(document.querySelector(".grimoire-fond-livre")).filter };
    const st = getComputedStyle(o), ro = o.getBoundingClientRect(), rc = document.querySelector("#grimoire-page-0 img").getBoundingClientRect();
    const m = /matrix\([^,]+, [^,]+, [^,]+, [^,]+, ([-\d.]+), ([-\d.]+)\)/.exec(st.transform) || [];
    const avant = [...document.getElementById("grimoire-scene").children].indexOf(o) < [...document.getElementById("grimoire-scene").children].indexOf(document.getElementById("grimoire-livre"));
    return { src: o.getAttribute("src"), filtre: st.filter, dx: Number(m[1]), dy: Number(m[2]), opacite: Number(st.opacity), avant,
             memeBoite: Math.abs(ro.width - rc.width) < 2 && Math.abs(ro.height - rc.height) < 2,
             decale: [ro.left - rc.left, ro.top - rc.top], hauteur: rc.height, livreOuvert: getComputedStyle(document.querySelector(".grimoire-fond-livre")).filter };
  });
  verifier("la forme de la couverture, noircie et floutée, sous le livre", /couverture\.webp/.test(r.src) && /brightness\(0\)/.test(r.filtre) && /blur\(/.test(r.filtre) && r.avant && r.memeBoite, r.filtre);
  verifier("glissée en bas à droite (comme l'exemple : plus bas qu'à droite)", r.decale[0] > r.hauteur * 0.02 && r.decale[1] > r.decale[0] && r.decale[1] < r.hauteur * 0.08, r.decale.map(v => v.toFixed(1)).join(", ") + ` (livre ${r.hauteur.toFixed(0)} px)`);
  verifier("bien sombre, livre fermé", r.opacite > 0.85, String(r.opacite));
  verifier("le livre ouvert : son ombre aussi en bas à droite", /drop-shadow\(rgba\(0, 0, 0, 0\.72\) [\d.]+px [\d.]+px/.test(r.livreOuvert), r.livreOuvert);
  await p.evaluate(() => window.ouvrirGrimoire());
  await p.waitForTimeout(1500);
  verifier("livre ouvert : l'ombre de la couverture fermée s'efface", (await p.evaluate(() => { const o = document.getElementById("grimoire-ombre-couverture"); return o ? Number(getComputedStyle(o).opacity) : -1; })) === 0);
  await p.close();
});

await section(async () => {
  const index = lire("index.html");
  const v = (re) => Number((index.match(re) || [])[1] || 0);
  verifier("versions", v(/grimoire\.js\?v=(\d+)"/) >= 8 && v(/grimoire\.css\?v=(\d+)"/) >= 7 && v(/trace_combat\.js\?v=(\d+)"/) >= 210
           && Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]) >= 305 && JSON.parse(lire("version.json") || "{}").version >= 305);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
