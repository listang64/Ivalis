// v298 — LE GRIMOIRE, RETOUCHES : PLUS VIF, LA PLIURE, LES BRUITS DE PAGES,
// POSÉ EN BAS, LE DOIGT SANS DÉLAI.
//
// Nico : « quand on clique, fais un peu plus rapide l'animation de tourner la
// page » ; « il n'y a pas d'ombrage au centre du livre au niveau de la
// pliure » ; « des bruits de pages tournées, quand on commence à prendre un
// bout de page et quand la page se tourne complètement » ; « le livre,
// descends-le au max — ne l'agrandis pas, juste descends-le » ; « sur iPad le
// toucher ne se déclenche pas tout de suite, il y a un décalage ».
// Sur la VRAIE page (banc). Se charge sur l'ancien code : il y échoue, sans
// planter.
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
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...c) => ({ chemin: c.join("/") }); export const collection = (_db, ...c) => ({ col: c.join("/") });
  export const getDoc = async (r) => ({ exists: () => false, data: () => ({}) });
  export const query = (c) => c; export const where = () => ({}); export const orderBy = () => ({}); export const limit = () => ({});
  export const getDocs = async () => ({ forEach() {}, docs: [], empty: true, size: 0 });
  export const setDoc = async () => {}; export const updateDoc = async (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d }); };
  export const deleteDoc = async () => {}; export const addDoc = async (c, d) => { (window.__ajouts = window.__ajouts || []).push({ col: c.col, data: d }); return { id: "m" }; };
  export const onSnapshot = () => () => {}; export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
  export const runTransaction = async () => null; export const increment = (k) => k; export const deleteField = () => null;
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const serverTimestamp = () => Date.now();
  export class FieldPath {} export const Timestamp = { now: () => Date.now() };
`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1200);
const titre = (t) => console.log("\n" + t);
const section = async (f) => { try { await f(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 160)); } };
const etat = () => p.evaluate(() => window.grimoireEtat ? window.grimoireEtat() : null);
const attendreQue = async (f, ms = 6000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await p.waitForTimeout(100); } return false; };
const cliquer = (sel) => p.evaluate((sel) => document.querySelector(sel).click(), sel);
// Les pages bien posées sur le livre dessiné : la zone des pages de l'image (x 251 → 1765, y 62 → 1046 sur 2000 × 1117).
const alignement = () => p.evaluate(() => {
  const fond = document.querySelector(".grimoire-fond-livre").getBoundingClientRect();
  const k = fond.width / 2000;
  const g = document.getElementById("grimoire-page-1").getBoundingClientRect(), d = document.getElementById("grimoire-page-2").getBoundingClientRect();
  const attendu = { gauche: fond.left + 251 * k, dos: fond.left + 1008 * k, droite: fond.left + 1765 * k, haut: fond.top + 62 * k, bas: fond.top + 1046 * k };
  return { ecart: Math.max(Math.abs(g.left - attendu.gauche), Math.abs(g.right - attendu.dos), Math.abs(d.left - attendu.dos), Math.abs(d.right - attendu.droite), Math.abs(g.top - attendu.haut), Math.abs(g.bottom - attendu.bas)), k };
});

// Les pixels d'une capture, lus dans la page (pas de bibliothèque d'images).
const pixels = async (zone) => {
  const png = (await p.screenshot({ clip: zone })).toString("base64");
  return p.evaluate(async (src) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const colonnes = [];
    for (let x = 0; x < c.width; x++) { let s = 0; for (let y = 0; y < c.height; y++) { const i = (y * c.width + x) * 4; s += (d[i] + d[i + 1] + d[i + 2]) / 3; } colonnes.push(s / c.height); }
    return colonnes;
  }, "data:image/png;base64," + png);
};

// =========================================================================
titre("1. LE GRIMOIRE OUVERT : PLUS VIF, POSÉ EN BAS DE L'ÉCRAN, À LA MÊME TAILLE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => {
    window.__sons = []; window.__clics = 0;
    window.jouerSonEvenement = (id) => { window.__sons.push([id, Date.now()]); return true; };
    window.jouerSonClic = () => { window.__clics++; };
    window.COMPTE_JOUEUR = { nom: "Ben", email: "ben@ivalis.fr", admin: false };
    window.LISTE_PARTIES_CACHE = [{ id: "P1", nom: "Les Lames d'Héra" }];
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== "ecran-grimoire") e.style.display = "none"; });
    window.afficherGrimoire();
  });
  await p.waitForTimeout(1400);
  const t0 = Date.now();
  await p.evaluate(() => window.ouvrirGrimoire());
  await attendreQue(async () => (await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex())) === 1, 3000);
  const duree = Date.now() - t0;
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const f = document.querySelector(".grimoire-fond-livre").getBoundingClientRect();
    return { temps: window.GRIMOIRE_PAGEFLIP.getSettings().flippingTime, bas: innerHeight - f.bottom, haut: f.top, largeur: f.width, vw: innerWidth, vh: innerHeight,
             zoom: getComputedStyle(document.getElementById("grimoire-scene")).transitionDuration };
  });
  // v299 : « accélère encore » — 0,5 s et un zoom de 0,75 s (corrections_v299) ; ici, au plus ceux de v298.
  verifier("une page tourne en 0,7 s au plus (au lieu de 1,1 s)", r.temps <= 700 && duree < 1100, `${r.temps} ms réglés, ouverture faite en ${duree} ms`);
  verifier("le zoom d'ouverture suit (0,85 s au plus)", parseFloat(r.zoom) <= 0.85, r.zoom);
  // Même taille qu'en v297 : le livre entier tient (2 % de marge sur les côtés, 2,5 % en haut et 1,2 % en bas au plus).
  const s = Math.min(r.vw * 0.96 / 2000, r.vh * (1 - 0.025 - 0.012) / 1117);
  verifier("pas agrandi : tout le livre tient à l'écran, à sa taille d'avant", Math.abs(r.largeur - 2000 * s) < 2 && r.largeur <= r.vw, `${r.largeur.toFixed(0)} px pour ${(2000 * s).toFixed(0)}`);
  verifier("descendu au max : posé en bas, un filet de marge dessous", r.bas >= 0 && r.bas <= r.vh * 0.013 + 1 && r.haut > r.vh * 0.1, `${r.bas.toFixed(1)} px sous le livre, ${r.haut.toFixed(0)} px au-dessus`);
  const a = await alignement();
  verifier("les pages restent posées au pixel sur le livre dessiné", a.ecart < 3, `${a.ecart.toFixed(1)} px`);
});

// =========================================================================
titre("2. LA PLIURE : LES PAGES S'ASSOMBRISSENT EN APPROCHANT DU DOS");
// =========================================================================
await section(async () => {
  const st = await p.evaluate(() => {
    const g = getComputedStyle(document.getElementById("grimoire-page-1"), "::after"), d = getComputedStyle(document.getElementById("grimoire-page-2"), "::after");
    return { g: g.backgroundImage, gDroite: g.right, d: d.backgroundImage, dGauche: d.left };
  });
  verifier("page de gauche : une ombre qui monte vers son bord droit (le dos)", /linear-gradient\(to left/.test(st.g) && st.gDroite === "0px", st.g.slice(0, 60));
  verifier("page de droite : la même, vers son bord gauche", /linear-gradient\(to right/.test(st.d) && st.dGauche === "0px", st.d.slice(0, 60));
  const z = await p.evaluate(() => { const g = document.getElementById("grimoire-page-1").getBoundingClientRect(), d = document.getElementById("grimoire-page-2").getBoundingClientRect();
    return { x: Math.round(g.left + g.width * 0.55), y: Math.round(g.top + g.height * 0.88), width: Math.round(d.right - g.left - g.width * 0.55 - d.width * 0.45), height: Math.round(g.height * 0.08), dos: Math.round(g.right) }; });
  const col = await pixels({ x: z.x, y: z.y, width: z.width, height: z.height });
  const iDos = z.dos - z.x;
  const moy = (a, b) => { const l = col.slice(Math.max(0, a), Math.min(col.length, b)); return l.reduce((x, y) => x + y, 0) / l.length; };
  const creux = moy(iDos - 4, iDos + 4), loinG = moy(0, 20), loinD = moy(col.length - 20, col.length);
  verifier("aux pixels : le creux de la pliure est nettement plus sombre que le milieu des pages", creux < loinG - 40 && creux < loinD - 40, `pliure ${creux.toFixed(0)}, pages ${loinG.toFixed(0)} / ${loinD.toFixed(0)}`);
  const pente = [moy(iDos + 6, iDos + 14), moy(iDos + 30, iDos + 40), moy(iDos + 80, iDos + 90)];
  verifier("… et la lumière revient en s'éloignant du dos (une ombre progressive)", pente[0] < pente[1] && pente[1] < pente[2], pente.map(x => x.toFixed(0)).join(" → "));
  if (process.env.V298_CAPTURES) await p.screenshot({ path: process.env.V298_CAPTURES + "/v298_ouvert.png" });
});

// =========================================================================
titre("3. LES BRUITS DE PAGES : LA PRISE DU COIN, PUIS LA PAGE QUI TOURNE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.__sons = []; });
  const g = await p.evaluate(() => { const r = document.getElementById("grimoire-page-2").getBoundingClientRect(); return { x: r.right - 20, y: r.bottom - 30, w: r.width }; });
  await p.mouse.move(g.x, g.y); await p.mouse.down();
  for (let i = 1; i <= 6; i++) { await p.mouse.move(g.x - g.w * 0.25 * i / 6, g.y - 4 * i / 6); await p.waitForTimeout(25); }
  const pendant = await p.evaluate(() => window.__sons.map(x => x[0]));
  for (let i = 7; i <= 20; i++) { await p.mouse.move(g.x - g.w * 1.6 * i / 20, g.y - 8 * i / 20); await p.waitForTimeout(20); }
  await p.mouse.up();
  await p.waitForTimeout(1100);
  const apres = await p.evaluate(() => ({ sons: window.__sons.map(x => x[0]), page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex() }));
  verifier("le doigt saisit le coin : « page-prise », tout de suite", pendant.join(",") === "page-prise", pendant.join(","));
  verifier("la page tourne complètement : « page-tourne », une seule fois", apres.sons.join(",") === "page-prise,page-tourne" && apres.page === 3, JSON.stringify(apres));
  // Une page saisie puis relâchée avant le dos retombe : pas de « page-tourne ».
  await p.evaluate(() => { window.__sons = []; });
  const h = await p.evaluate(() => { const r = document.getElementById("grimoire-page-4").getBoundingClientRect(); return { x: r.right - 20, y: r.bottom - 30, w: r.width }; });
  await p.mouse.move(h.x, h.y); await p.mouse.down();
  for (let i = 1; i <= 8; i++) { await p.mouse.move(h.x - h.w * 0.3 * i / 8, h.y - 3 * i / 8); await p.waitForTimeout(20); }
  await p.mouse.up();
  await p.waitForTimeout(900);
  const retombe = await p.evaluate(() => ({ sons: window.__sons.map(x => x[0]), page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex() }));
  verifier("relâchée avant le dos, la page retombe : la prise, sans « page-tourne »", retombe.sons.join(",") === "page-prise" && retombe.page === 3, JSON.stringify(retombe));
  await p.evaluate(() => { window.__sons = []; });
  await cliquer("#grimoire-page-3 .revenir");
  await p.waitForTimeout(1000);
  const auto = await p.evaluate(() => window.__sons.map(x => x[0]));
  verifier("une page qui tourne toute seule (au clic) : seulement « page-tourne »", auto.join(",") === "page-tourne", auto.join(","));
  // Les deux bruits, fabriqués pour de vrai (rendu hors ligne).
  const rendu = await p.evaluate(async () => {
    const mesure = async (id) => {
      const ctx = new OfflineAudioContext(1, 44100 * 1.2, 44100);
      window.SONS_EVENEMENTS[id](ctx, ctx.destination);
      const b = await ctx.startRendering(), d = b.getChannelData(0);
      let e = 0, dernier = 0; for (let i = 0; i < d.length; i++) { e += d[i] * d[i]; if (Math.abs(d[i]) > 0.004) dernier = i; }
      return { rms: Math.sqrt(e / d.length), fin: dernier / 44100 };
    };
    return { prise: await mesure("page-prise"), tourne: await mesure("page-tourne") };
  });
  verifier("« page-prise » : un froissement bref (moins de 0,25 s)", rendu.prise.rms > 0.004 && rendu.prise.fin < 0.25, JSON.stringify(rendu.prise));
  // v299 : « page-tourne » joue quand la page s'est posée — le vieux parchemin de Nico, ou, en
  // attendant qu'il arrive, un froissement bref et le « flap » (corrections_v299).
  verifier("« page-tourne » : le bruit de la page qui se pose, bref", rendu.tourne.rms > 0.01 && rendu.tourne.fin < 0.5, JSON.stringify(rendu.tourne));
});

// =========================================================================
titre("4. AU DOIGT, TOUT DE SUITE : LE GRIMOIRE AGIT DÈS QUE LE DOIGT SE LÈVE");
// =========================================================================
await section(async () => {
  // Un toucher : pointerdown puis pointerup, SANS « click » (Safari le retarde).
  const toucher = (sel) => p.evaluate((sel) => {
    const el = document.querySelector(sel), r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, pointerType: "touch", isPrimary: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    el.dispatchEvent(new PointerEvent("pointerdown", o));
    el.dispatchEvent(new PointerEvent("pointerup", o));
  }, sel);
  await p.evaluate(() => { window.__clics = 0; window.__sons = []; });
  await toucher("#grimoire-btn-compte");
  await p.waitForTimeout(120);
  const r = await p.evaluate(() => ({ etat: window.GRIMOIRE_PAGEFLIP.getState(), chapitre: window.grimoireEtat().chapitre, clics: window.__clics }));
  verifier("un toucher sur « Compte » : la page tourne déjà, sans attendre le « click »", r.chapitre === "compte" && (r.etat === "flipping" || r.etat === "read") && r.clics === 1, JSON.stringify(r));
  await p.evaluate(() => document.getElementById("grimoire-btn-compte").click());   // le « click » retardé arrive
  await p.waitForTimeout(900);
  verifier("le « click » qui suit le toucher est ignoré (pas d'action en double)", (await p.evaluate(() => window.__clics)) === 1);
  await p.evaluate(() => document.querySelector("#grimoire-page-3 .revenir").click());   // au clavier ou à la souris : un click seul agit
  await p.waitForTimeout(900);
  verifier("un « click » seul (souris, clavier) agit toujours", (await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex())) === 1);
  // Un doigt qui glisse sur un bouton n'est pas un toucher.
  await p.evaluate(() => { window.__clics = 0;
    const el = document.getElementById("grimoire-btn-nouvelle"), r = el.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch", clientX: r.left + 5, clientY: r.top + 5 }));
    el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch", clientX: r.left + 60, clientY: r.top + 40 })); });
  await p.waitForTimeout(150);
  verifier("un doigt qui glisse sur un bouton ne le déclenche pas", (await p.evaluate(() => window.__clics)) === 0 && (await p.evaluate(() => window.grimoireEtat().chapitre)) !== "nouvelle");
  // La couverture : refermée, puis un toucher la rouvre aussitôt.
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.flipPrev("top"));
  await p.waitForTimeout(1000);
  await toucher("#grimoire-attrape");
  await p.waitForTimeout(120);
  const c = await p.evaluate(() => ({ etat: window.GRIMOIRE_PAGEFLIP.getState(), ouvert: window.grimoireEtat().ouvert, clics: window.__clics }));
  verifier("un toucher sur la couverture l'ouvre aussitôt (sans le son de clic : le bruit de page suffit)", c.ouvert && c.etat === "flipping" && c.clics === 0, JSON.stringify(c));
  const css = await p.evaluate(() => [getComputedStyle(document.getElementById("grimoire-attrape")).touchAction, getComputedStyle(document.getElementById("grimoire-btn-nouvelle")).touchAction]);
  verifier("touch-action: manipulation sur la couverture et les boutons (pas d'attente du double-toucher)", css.every(x => x === "manipulation"), css.join(","));
});

await section(async () => {
  const index = lire("index.html");
  const v = (re) => Number((index.match(re) || [])[1] || 0);
  verifier("versions : grimoire, sons, trace du combat", v(/grimoire\.js\?v=(\d+)"/) >= 2 && v(/grimoire\.css\?v=(\d+)"/) >= 2 && v(/fabrique_sons\.js\?v=(\d+)"/) >= 18
           && Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]) >= 298);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
