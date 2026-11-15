// v416 — LE MENU PRINCIPAL REMONTE DANS SA PAGE. Nico : « Regarde la page menu
// principale : "Quitter le jeu" chevauche la bordure de page ; remonte tout dans la page. »
// Le vrai livre, ouvert sur la page du journal (Nouvelle partie, Charger partie, la
// séparation, Paramètres, Compte, Quitter le jeu), sur trois écrans : l'iPad (1194 × 834),
// 1366 × 1024 et 2048 × 1536. On mesure (getBoundingClientRect) chaque entrée contre le
// cadre tracé à la plume (bordurePlume, grimoire.js : le trait passe à 5 % et 95 % de la
// page) : tout doit tenir dedans, au-dessus de la bordure basse, avec une marge, et les
// entrées ne se chevauchent pas. (Les polices du jeu viennent de Google Fonts : le banc les
// laisse passer quand le réseau les sert, sinon la page retombe sur le serif.)
//
// Lancer : node tests_monstres/corrections_v416_menu.mjs   (V416_CAPTURES=dossier : les captures)
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
                '.webp': 'image/webp', '.png': 'image/png' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'application/octet-stream' }); res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({}); export const getApp = () => ({}); export const BANC_IVALIS = true;`;
// Un faux Firestore : rien ne s'écrit nulle part, rien ne se relit.
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...c) => ({ chemin: c.join("/") }); export const collection = (_db, ...c) => ({ col: c.join("/") });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const query = (c) => c; export const where = () => ({}); export const orderBy = () => ({}); export const limit = () => ({});
  export const getDocs = async () => ({ forEach() {}, docs: [], empty: true, size: 0 });
  export const setDoc = async () => {}; export const updateDoc = async () => {}; export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "A1" }); export const onSnapshot = () => () => {};
  export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
  export const runTransaction = async (_db, f) => f({ get: async () => ({ exists: () => false, data: () => ({}) }), update() {}, set() {} });
  export const increment = (k) => k; export const deleteField = () => null;
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const serverTimestamp = () => Date.now();
  export class FieldPath {} export const Timestamp = { now: () => Date.now() };
`;
const CAPTURES = process.env.V416_CAPTURES || "";
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const erreurs = [];

// Le livre, ouvert sur le journal (hors partie : « Quitter le jeu »).
async function ouvrirLeLivre(w, h) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.route('**', r => { const u = r.request().url();
    if (u.startsWith(base)) return r.continue();
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(u)) return r.continue().catch(() => {});
    return r.abort(); });
  await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
  await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
  p.on('pageerror', e => erreurs.push(`${w}×${h} : ${e.message}`));
  await p.goto(base + '/index.html'); await p.waitForTimeout(1200);
  await p.evaluate(() => {
    window.jouerSonEvenement = () => true; window.jouerSonClic = () => {};
    window.COMPTE_JOUEUR = { nom: "Ben", email: "ben@ivalis.fr", admin: false };
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== "ecran-grimoire") e.style.display = "none"; });
    window.afficherGrimoire();
  });
  await p.waitForTimeout(1300);
  await p.evaluate(() => window.ouvrirGrimoire());
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.fonts.ready);
  return p;
}

// Les mesures : le cadre à la plume (le bord intérieur de son trait), l'en-tête, les entrées.
const mesurer = (p) => p.evaluate(() => {
  const page = document.querySelector('.page-journal');
  if (!page) return null;
  const svg = page.querySelector('.bordure-plume'), trait = svg.querySelector('.trait-1');
  const rs = svg.getBoundingClientRect(), rp = page.getBoundingClientRect();
  const nb = (trait.getAttribute('d').match(/-?\d+(\.\d+)?/g) || []).map(Number);
  const xs = [], ys = []; for (let i = 0; i + 1 < nb.length; i += 2) { xs.push(nb[i]); ys.push(nb[i + 1]); }
  const demi = parseFloat(getComputedStyle(trait).strokeWidth) / 2 || 0;
  const u = parseFloat(getComputedStyle(page).getPropertyValue('--u')) || 0;
  // Le trait du bas tremble autour de 95 % ; on prend son point le plus haut (le bord intérieur).
  const cadre = {
    haut: rs.top + Math.max(...ys.filter(y => y < 6)) / 100 * rs.height + demi,
    bas: rs.top + Math.min(...ys.filter(y => y > 94)) / 100 * rs.height - demi,
    gauche: rs.left + Math.max(...xs.filter(x => x < 6)) / 100 * rs.width + demi,
    droite: rs.left + Math.min(...xs.filter(x => x > 94)) / 100 * rs.width - demi
  };
  const boite = (el) => { const r = el.getBoundingClientRect(); return { id: el.id || (el.className.baseVal !== undefined ? el.className.baseVal : el.className),
    texte: (el.textContent || "").trim(), haut: r.top, bas: r.bottom, gauche: r.left, droite: r.right }; };
  const quitter = document.getElementById('grimoire-btn-quitter');
  const qr = quitter.getBoundingClientRect();
  const auCentre = document.elementFromPoint(qr.left + qr.width / 2, qr.top + qr.height / 2);
  return { u, page: { haut: rp.top, bas: rp.bottom }, cadre, entete: boite(page.querySelector('.journal-entete')),
           entrees: [...page.querySelectorAll('.journal-entrees > *')].map(boite),
           quitterVisible: !!(auCentre && auCentre.closest('#grimoire-btn-quitter')) };
});

const rond = (n) => Math.round(n);
async function controler(p, nom) {
  const m = await mesurer(p);
  verifier(`${nom} : la page du journal est ouverte`, !!m);
  if (!m) return;
  const q = m.entrees.find(e => e.id === "grimoire-btn-quitter");
  verifier(`${nom} : l'entrée « Quitter le jeu » est là`, !!q && q.texte === "Quitter le jeu", q ? q.texte : "");
  const marge = 2 * m.u;   // au moins 2 % de la largeur d'une page entre le bas d'une entrée et la bordure
  verifier(`${nom} : « Quitter le jeu » au-dessus de la bordure basse (marge ≥ 2u)`,
           !!q && q.bas <= m.cadre.bas - marge, q ? `bas ${rond(q.bas)} / bordure ${rond(m.cadre.bas)} (marge ${rond(m.cadre.bas - q.bas)} px, 2u = ${rond(marge)} px)` : "");
  const dehors = [m.entete, ...m.entrees].filter(e => e.haut < m.cadre.haut || e.bas > m.cadre.bas - marge || e.gauche < m.cadre.gauche || e.droite > m.cadre.droite);
  verifier(`${nom} : l'en-tête et chaque entrée entièrement dans le cadre`, !dehors.length,
           dehors.map(e => `${e.id} ${rond(e.haut)}→${rond(e.bas)}`).join(", ") + ` (cadre ${rond(m.cadre.haut)}→${rond(m.cadre.bas)})`);
  const suite = [m.entete, ...m.entrees];
  const chevauchent = suite.slice(1).filter((e, i) => e.haut < suite[i].bas - 0.5);
  verifier(`${nom} : les entrées ne se chevauchent pas`, !chevauchent.length, chevauchent.map(e => e.id).join(", "));
  verifier(`${nom} : six entrées dans l'ordre (5 boutons + la séparation)`,
           m.entrees.map(e => e.id).join(",") === "grimoire-btn-nouvelle,grimoire-btn-charger,fleuron fleuron-journal,grimoire-btn-parametres,grimoire-btn-compte,grimoire-btn-quitter",
           m.entrees.map(e => e.id).join(","));
  verifier(`${nom} : « Quitter le jeu » visible et cliquable (pas rogné par la page)`, m.quitterVisible);
  // La remontée ne doit pas coller l'en-tête au trait du haut : un peu d'air au-dessus aussi.
  verifier(`${nom} : l'en-tête garde de l'air sous la bordure haute (≥ 2u)`, m.entete.haut - m.cadre.haut >= marge,
           `${rond(m.entete.haut - m.cadre.haut)} px`);
  return m;
}

const ECRANS = [[1194, 834, "iPad 1194 × 834"], [1366, 1024, "1366 × 1024"], [2048, 1536, "2048 × 1536"]];
for (const [w, h, nom] of ECRANS) {
  console.log(`\n${nom}`);
  try {
    const p = await ouvrirLeLivre(w, h);
    await controler(p, nom);
    if (CAPTURES) await p.screenshot({ path: path.join(CAPTURES, `journal_${w}x${h}.png`) });
    if (w === 1194) {
      // Les 25 écritures des titres (police_titres.js) : l'en-tête change de taille avec
      // chacune (--echelle-titres) ; le menu doit tenir avec toutes.
      const polices = await p.evaluate(() => (window.POLICES_TITRES || []).map(x => x.nom));
      const rates = [], absentes = [];
      let pire = null;
      for (const police of polices) {
        await p.evaluate((n) => window.choisirPoliceTitres(n), police);
        // On attend la vraie écriture (sa feuille Google Fonts, puis la police) : pendant
        // l'échange, le titre s'écrit en écriture de secours, plus large, sur deux lignes.
        const chargee = await p.evaluate(async (n) => {
          const l = [...document.querySelectorAll('link[rel="stylesheet"]')].find(x => x.href.includes(n.replace(/ /g, "+")));
          if (l && !l.sheet) await new Promise(r => { l.addEventListener("load", r); l.addEventListener("error", r); setTimeout(r, 4000); });
          try { await Promise.race([document.fonts.load(`40px "${n}"`), new Promise(r => setTimeout(r, 4000))]); } catch (e) {}
          return [...document.fonts].some(f => f.family.replace(/["']/g, "") === n && f.status === "loaded");
        }, police);
        if (!chargee) { absentes.push(police); continue; }
        await p.waitForTimeout(150);
        const m = await mesurer(p);
        const q = m.entrees.find(e => e.id === "grimoire-btn-quitter");
        const marge = m.cadre.bas - q.bas;
        if (!pire || marge < pire.marge) pire = { police, marge: rond(marge), entete: rond(m.entete.bas - m.entete.haut) };
        if (marge < 2 * m.u || m.entete.haut < m.cadre.haut) rates.push(`${police} (${rond(marge)} px)`);
      }
      // (Sans réseau, les écritures ne viennent pas : le contrôle est sauté, et dit.)
      if (absentes.length === polices.length) console.log(`  (les ${polices.length} écritures des titres n'ont pas pu se charger : contrôle sauté)`);
      else verifier(`${nom} : avec chacune des ${polices.length - absentes.length} écritures chargées (sur ${polices.length}), le menu tient`, polices.length >= 20 && !rates.length,
               (rates.length ? rates.slice(0, 4).join(", ") : `la plus juste : ${pire && pire.police}, ${pire && pire.marge} px sous Quitter`)
               + (absentes.length ? ` — non chargées : ${absentes.join(", ")}` : ""));
      await p.evaluate(() => window.choisirPoliceTitres("Shadows Into Light"));
    }
    await p.close();
  } catch (e) { verifier(`${nom} : la section a pu tourner`, false, String(e && e.message || e).slice(0, 180)); }
}

console.log("");
verifier("pas d'erreur dans la page", !erreurs.length, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs ? `\n${echecs} CONTRÔLE(S) EN ÉCHEC` : "\nTOUS LES CONTRÔLES PASSENT");
process.exit(echecs ? 1 : 0);
