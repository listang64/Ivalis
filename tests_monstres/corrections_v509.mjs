// v509 — LA FEUILLE DES COMPÉTENCES : UN COIN QUI DÉPASSE, ELLE GLISSE EN BIAIS, ELLE S'ARRÊTE SOUS LA DERNIÈRE BANNIÈRE.
// Nico : « fais plutôt dépasser un coin de la feuille quand elle est repliée, vers le tiers bas du bord gauche de
// l'écran. Et la feuille s'ouvre en glissant un peu en biais, et s'arrête en hauteur quand la dernière bannière est
// visible : s'il n'y a pas beaucoup de bannières, la feuille ne va pas jusqu'en haut. Et bien sûr les post-its suivent la
// position de la feuille et s'adaptent. La feuille dépliée, un tout petit peu pas droite, mais léger. »
// Lancer : node tests_monstres/corrections_v509.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(96)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lireFichier = (f) => fs.readFileSync(path.join('/home/user/Ivalis', f), 'utf-8');

const RACINE = '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) {
    res.writeHead(404); res.end('non trouvé'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {};
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data }); };
  export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a});
  export const where = (...a) => ({a}); export const orderBy = (...a) => ({a});
  export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"><rect width="900" height="300" fill="#5a3a20"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);
const H = 834;

const preparer = async (n) => {
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
  document.getElementById("fenetre-combat").style.display = "block";
  const comps = {}, deck = [];
  for (let i = 1; i <= n; i++) { comps["C" + i] = { Nom: "Technique " + i, Initiative: 10 + i, Fatigue: 5, Arme: "", Effets_Compiles: [{ nom: "Dégâts physiques", desc: "8 dégâts", isMod: false }] }; deck.push("C" + i); }
  window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Aldo", classe: "", xp: 0, couleur: "#335", camp: "Allié",
      deckEquipe: deck, PV_Max: 50, PV_Actuels: 50, Fatigue_Max: 50, fatigueActuelle: 50, Etats_Alteres: [] }];
  window.CACHE_COMPETENCES_GLOBAL = { H1: comps };
  window.COMPETENCES_CACHE = {};
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]]; window.COMBAT_INDEX_PERSO = 0;
  window.COMBAT_FATIGUE_ACTUELLE = 50;
  window.PARTIE_DATA = { Phase_Combat: "Preparation", File_Attente_Combat: [] };
  window.chargerCompetencesCombat("H1", "#335");
  window.installerVoletCompetences();
  await new Promise(r => setTimeout(r, 120));
};
// Les quatre coins de la feuille à l'écran, d'après la vraie matrice de son transform.
const geometrie = () => p.evaluate(() => {
  const c = document.getElementById("volet-contenu");
  const m = new DOMMatrix(getComputedStyle(c).transform);
  const L = c.offsetWidth, P = c.offsetHeight;
  const pt = (x, y) => { const q = m.transformPoint(new DOMPoint(x - L / 2, y - P / 2)); return { x: q.x + L / 2 + c.offsetLeft, y: q.y + P / 2 + c.offsetTop }; };
  const liste = [...document.querySelectorAll("#combat-liste-competences .banniere-carte-combat")];
  const derniere = liste[liste.length - 1].getBoundingClientRect();
  const hote = document.getElementById("volet-bannieres");
  return { hg: pt(0, 0), hd: pt(L, 0), bg: pt(0, P), bd: pt(L, P), angle: Math.atan2(m.b, m.a) * 180 / Math.PI,
    derniere: { haut: derniere.top, bas: derniere.bottom, droite: derniere.right }, defile: hote.scrollHeight > hote.clientHeight + 1,
    basHote: hote.getBoundingClientRect().bottom, ouvert: !!window.VOLET_COMPETENCES_OUVERT };
});

console.log("\n1. REPLIÉE : UN COIN DE LA FEUILLE DÉPASSE, AU TIERS BAS DU BORD GAUCHE");
await p.evaluate(preparer, 3);
{
  const g = await geometrie();
  verifier("le coin haut droit dépasse un peu du bord gauche (une quarantaine de pixels)", g.hd.x > 25 && g.hd.x < 70, JSON.stringify(g.hd));
  verifier("au tiers bas de l'écran (vers les deux tiers de sa hauteur)", g.hd.y > H * 0.58 && g.hd.y < H * 0.74, `${Math.round(g.hd.y)} / ${H}`);
  verifier("c'est le seul coin : les trois autres sont hors de l'écran", g.hg.x < 0 && g.bg.x < 0 && g.bd.x < 0, JSON.stringify(g));
  verifier("penchée, pour que seul le coin pointe (ses deux bords s'en éloignent)", g.angle > 8 && g.angle < 25, g.angle.toFixed(1));
}

console.log("\n2. ELLE S'OUVRE EN GLISSANT EN BIAIS, UN RIEN PENCHÉE");
{
  const avant = await geometrie();
  await p.evaluate(() => window.toggleVoletCompetences(true));
  await p.waitForTimeout(160);
  const milieu = await geometrie();
  await p.waitForTimeout(700);
  const g = await geometrie();
  verifier("en chemin : elle va vers la droite ET vers le haut à la fois (en biais)", milieu.hd.x > avant.hd.x + 20 && milieu.hd.y < avant.hd.y - 20 && milieu.hd.x < g.hd.x + 30,
    `${Math.round(avant.hd.x)},${Math.round(avant.hd.y)} → ${Math.round(milieu.hd.x)},${Math.round(milieu.hd.y)} → ${Math.round(g.hd.x)},${Math.round(g.hd.y)}`);
  verifier("dépliée : un tout petit peu pas droite (entre 0,5° et 2°)", Math.abs(g.angle) >= 0.5 && Math.abs(g.angle) <= 2, g.angle.toFixed(2));
  verifier("posée contre le bord gauche de l'écran", Math.min(g.hg.x, g.bg.x) > -15 && Math.min(g.hg.x, g.bg.x) < 15, JSON.stringify(g.hg));
}

console.log("\n3. ELLE S'ARRÊTE QUAND LA DERNIÈRE BANNIÈRE EST VISIBLE");
{
  const g = await geometrie();
  verifier("peu de bannières (4) : la dernière se voit…", g.derniere.bas <= H - 5, JSON.stringify(g.derniere));
  verifier("…et la feuille ne monte pas jusqu'en haut", g.hg.y > H * 0.4, `haut de la feuille à ${Math.round(g.hg.y)}`);
  await p.evaluate(preparer, 8);
  await p.waitForTimeout(150);
  const g8 = await geometrie();
  verifier("9 bannières : elle monte, juste assez (la dernière tout en bas de l'écran)", g8.derniere.bas <= H - 5 && g8.derniere.bas > H - 70 && g8.hg.y < g.hg.y - 100 && g8.hg.y > 60,
    `haut ${Math.round(g8.hg.y)}, dernière en bas à ${Math.round(g8.derniere.bas)}`);
  await p.evaluate(preparer, 16);
  await p.waitForTimeout(150);
  const g16 = await geometrie();
  verifier("trop de bannières pour l'écran : elle monte jusqu'en haut et la liste défile", g16.hg.y < 30 && g16.defile && g16.basHote <= H, JSON.stringify({ haut: g16.hg.y, defile: g16.defile, bas: g16.basHote }));
}

console.log("\n4. LES POST-ITS SUIVENT LA FEUILLE");
{
  await p.evaluate(preparer, 3);
  await p.waitForTimeout(150);
  const g = await geometrie();
  const survoler = async (id) => {
    const c = await p.evaluate((id) => { const b = document.querySelector(`.rang-banniere-combat[data-card-id="${id}"] .boite-banniere-combat`).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, id);
    await p.mouse.move(c.x, c.y); await p.waitForTimeout(450);
    return p.evaluate((id) => { const e = document.querySelector(`.postit-competence[data-carte="${id}"]:not(.rentre)`); if (!e) return null; const b = e.getBoundingClientRect();
      const ban = document.getElementById("combat-carte-" + id).getBoundingClientRect();
      return { haut: b.top, bas: b.bottom, gauche: b.left, banHaut: ban.top, dansFeuille: e.parentNode.id }; }, id);
  };
  const a = await survoler(await p.evaluate(() => document.querySelector("#combat-liste-competences .rang-banniere-combat").dataset.cardId));
  verifier("le post-it vit dans la feuille (il bouge et penche avec elle)", a && a.dansFeuille === "volet-contenu", JSON.stringify(a));
  verifier("feuille basse : le post-it sort à la hauteur de sa bannière, là où elle est", a && Math.abs(a.haut - a.banHaut) < 60 && a.haut > H * 0.4, JSON.stringify(a));
  const r = await survoler("REPOS_LONG");
  const c = await survoler(await p.evaluate(() => [...document.querySelectorAll("#combat-liste-competences .rang-banniere-combat")].slice(-2)[0].dataset.cardId));
  verifier("près du bas de l'écran : il remonte pour rester entier", c && c.bas <= H + 2 && r !== null, JSON.stringify(c));
  await p.mouse.move(900, 300); await p.waitForTimeout(900);
  await p.evaluate(preparer, 16); await p.waitForTimeout(150);
  const premiere = await p.evaluate(() => document.querySelector("#combat-liste-competences .rang-banniere-combat").dataset.cardId);
  const h = await survoler(premiere);   // (triées par initiative : la plus haute en premier)
  verifier("feuille montée tout en haut : le post-it aussi", h && h.haut < 120 && Math.abs(h.haut - h.banHaut) < 60, JSON.stringify(h));
  await p.evaluate(() => window.toggleVoletCompetences(false));
  await p.waitForTimeout(700);
  const g2 = await geometrie();
  verifier("refermée : elle revient en coin, et les post-its rentrent", g2.hd.x > 25 && g2.hd.x < 70 && (await p.evaluate(() => document.querySelectorAll(".postit-competence").length)) === 0, JSON.stringify(g2.hd));
}

console.log("\n5. LES VERSIONS");
{
  const html = lireFichier("index.html");
  verifier("version 509 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lireFichier("trace_combat.js")) || [])[1]) >= 509 && JSON.parse(lireFichier("version.json")).version >= 509);
  verifier("index.html : combat.js?v=192, style.css?v=163 ou plus",
    Number((html.match(/combat\.js\?v=(\d+)"/) || [])[1]) >= 192 && Number((html.match(/style\.css\?v=(\d+)"/) || [])[1]) >= 163);
}
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
if (process.env.CAPTURE) { await p.evaluate(preparer, 3); await p.evaluate(() => window.toggleVoletCompetences(true)); await p.waitForTimeout(800);
  const c = await p.evaluate(() => { const b = document.querySelector('.rang-banniere-combat[data-card-id="C2"] .boite-banniere-combat').getBoundingClientRect(); return { x: b.left + 100, y: b.top + 20 }; });
  await p.mouse.move(c.x, c.y); await p.waitForTimeout(500); await p.screenshot({ path: process.env.CAPTURE + "_ouvert.png" });
  await p.evaluate(() => window.toggleVoletCompetences(false)); await p.waitForTimeout(800); await p.screenshot({ path: process.env.CAPTURE + "_replie.png" }); }
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
