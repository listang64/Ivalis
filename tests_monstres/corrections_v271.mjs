// v271 — L'AURA DU LEADER : LE FEU ROUGE DE NICO.
//
// Nico, une image à l'appui : « pour les monstres leader, exactement cet
// effet sous le token, en mouvement » — des langues de fumée rouge qui
// s'enroulent autour du médaillon jusqu'à une fois et demie son rayon, un
// anneau rouge vif collé à son bord, des gouttelettes éparses ; le tout qui
// bouge. Ce banc le vérifie sur la VRAIE page (index.html, combat.js,
// style.css), Firestore remplacé par une mémoire :
//   1. la structure (qui la porte, ses couches, son mouvement) ;
//   2. ce qui se voit, mesuré aux pixels sur le plateau sombre ;
//   3. le zoom (centrée, même proportion) ;
//   4. les versions.
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(74)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const titre = (t) => console.log("\n" + t);
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf-8');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  const docs = () => (window.__docs = window.__docs || {});
  export const getDoc = async (ref) => { const d = docs()[ref.chemin]; return { exists: () => !!d, data: () => JSON.parse(JSON.stringify(d || {})) }; };
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data, options });
    docs()[ref.chemin] = options && options.merge ? { ...(docs()[ref.chemin] || {}), ...data } : data; };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data }); };
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a}); export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
  export const writeBatch = () => ({ set(){}, update(){}, delete(){}, commit: async () => {} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
// Un pion gris et neutre : aucun rouge dans l'image elle-même, tout le rouge mesuré est celui de l'aura.
const PION = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="100" fill="#8a8a8a"/></svg>`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: { 'Access-Control-Allow-Origin': '*' }, body: PION }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(1500);
await p.evaluate(async () => {
  window.jouerSonClic = () => {};
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => e.style.display = e.id === "ecran-jeu" ? "block" : "none");
  document.getElementById('fenetre-combat').style.display = 'block';
  window.initialiserPlateau();
  const m = (id, leader, extra = {}) => ({ idPersonnage: id, prenom: id, camp: "Ennemi", estMonstre: true, leader, PV_Max: 90, PV_Actuels: 90,
    Fatigue_Max: 100, fatigueActuelle: 100, Etats_Alteres: [], statut: "Vivant", ...extra });
  window.PERSOS_PARTIE = [m("M1", true), m("M2", false), m("M3", true, { zombie: true })];
  window.MONSTRES_PARTIE = window.PERSOS_PARTIE;
  window.TOKENS_VTT_DATA = { M1: { q: 4, r: 3, taille: 55 }, M2: { q: 8, r: 3, taille: 55 }, M3: { q: 4, r: 7, taille: 55 } };
  window.VTT_SCALE = 2; window.appliquerTransformPlateau();
  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
  window.centrerMapSurToken("M1");
  await new Promise(r => setTimeout(r, 500));
  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
  // Rien d'autre ne peint sur le plateau : les grandes images du décor s'effacent.
  document.querySelectorAll('img').forEach(i => { if (i.getBoundingClientRect().width > 400 && !i.closest('#conteneur-tokens-vtt')) i.style.display = 'none'; });
  await new Promise(r => setTimeout(r, 400));
});

// =========================================================================
titre("1. LA STRUCTURE : SOUS LE PION DU LEADER, DES NAPPES DE FUMÉE QUI TOURNENT");
// =========================================================================
{
  const r = await p.evaluate(() => {
    const t = (id) => document.getElementById("token-" + id);
    const a = t("M1") && t("M1").querySelector(".aura-leader");
    const img = t("M1") && t("M1").querySelector(".token-img-main");
    const sortie = { existe: !!a, normal: !!(t("M2") && t("M2").querySelector(".aura-leader")),
                     zombie: !!(t("M3") && t("M3").querySelector(".aura-leader")) };
    if (!a) return sortie;
    const svg = a.querySelector("svg");
    sortie.dessous = Number(getComputedStyle(a).zIndex) < Number(getComputedStyle(img).zIndex);
    sortie.boite = { l: a.style.left || getComputedStyle(a).left, rapport: a.getBoundingClientRect().width / t("M1").getBoundingClientRect().width };
    sortie.turbulence = !!svg.querySelector("filter feTurbulence") && !!svg.querySelector("filter feDisplacementMap");
    const fumee = svg.querySelector("g[filter]");
    sortie.nappesTournantes = fumee ? [...fumee.querySelectorAll(":scope > g > animateTransform[type='rotate']")].map(x => x.getAttribute("to")) : [];
    sortie.langues = fumee ? [...fumee.querySelectorAll("path[fill^='url']")].length : 0;
    sortie.remplissageRouge = [...svg.querySelectorAll("radialGradient#aura-feu stop")].every(s => /^#ff/i.test(s.getAttribute("stop-color")));
    const anneaux = [...svg.querySelectorAll(":scope > g > circle[fill='none']")];
    sortie.anneau = anneaux.map(c => ({ r: Number(c.getAttribute("r")), stroke: c.getAttribute("stroke") }));
    sortie.eclats = svg.querySelectorAll("ellipse").length;
    sortie.gouttes = [...svg.querySelectorAll(":scope > g > circle, :scope > circle")].filter(c => Number(c.getAttribute("r")) < 3).length;
    sortie.gouttesQuiFilent = svg.querySelectorAll("circle animate[attributeName='cy']").length;
    sortie.animationsCss = [a, ...a.querySelectorAll("*")].filter(x => x instanceof HTMLElement).some(x => getComputedStyle(x).animationName !== "none");
    sortie.reprend = typeof svg.getCurrentTime === "function" ? svg.getCurrentTime() > 1 : false;
    return sortie;
  });
  verifier("le leader porte l'aura ; un monstre ordinaire non ; un zombie non plus", r.existe && !r.normal && !r.zombie);
  verifier("sous l'image du pion", r.dessous === true);
  verifier("deux fois la taille du pion, calée par ses bords (−50 %)", r.boite && Math.abs(r.boite.rapport - 2) < 0.02 && /-50%|-?\d/.test(r.boite.l), JSON.stringify(r.boite));
  verifier("un champ de turbulence tord la fumée (feTurbulence + feDisplacementMap)", r.turbulence === true);
  verifier("au moins trois nappes tournent, dans les deux sens", (r.nappesTournantes || []).length >= 3
           && r.nappesTournantes.some(v => Number(v) > 0) && r.nappesTournantes.some(v => Number(v) < 0), JSON.stringify(r.nappesTournantes));
  verifier("…faites de langues de fumée (au moins 25), d'un dégradé rouge", r.langues >= 3 && r.remplissageRouge === true, `${r.langues} nappes`);
  verifier("un anneau rouge vif collé au bord (rayon 51 pour 50), au cœur clair",
           (r.anneau || []).length >= 3 && r.anneau.every(c => Math.abs(c.r - 51) < 1.5) && r.anneau.some(c => /^#ff[0-3]/i.test(c.stroke)) && r.anneau.some(c => /^#ffd/i.test(c.stroke)),
           JSON.stringify(r.anneau));
  verifier("deux éclats de lumière sur l'anneau", r.eclats === 2);
  verifier("des gouttelettes éparses (au moins 20), dont certaines s'échappent", r.gouttes >= 20 && r.gouttesQuiFilent >= 8, `${r.gouttes} / ${r.gouttesQuiFilent}`);
  verifier("aucune animation CSS (rien ne la décale au zoom sur Safari)", r.animationsCss === false);
  verifier("redessinée, elle reprend où le temps en est", r.reprend === true);
}

// =========================================================================
titre("2. CE QUI SE VOIT, AUX PIXELS");
// =========================================================================
{
  const centre = await p.evaluate(() => { const b = document.getElementById("token-M1").getBoundingClientRect();
    const n = document.getElementById("token-M2").getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, r: b.width / 2, nx: n.left + n.width / 2, ny: n.top + n.height / 2 }; });
  const photo = async () => (await p.screenshot()).toString("base64");
  const analyser = (b64, mesures) => p.evaluate(async ({ b64, mesures }) => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, img.width, img.height).data;
    const px = (x, y) => { const i = (Math.round(y) * img.width + Math.round(x)) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const rouge = ([r, g, b]) => r > 90 && r > 1.8 * g && r > 1.8 * b;
    return mesures.map(({ cx, cy, de, a, n }) => {
      let compte = 0, total = 0; const valeurs = [];
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * Math.PI * 2;
        for (let rr = de; rr <= a; rr += 1.5) { const v = px(cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)); total++; if (rouge(v)) compte++; valeurs.push(v[0]); }
      }
      return { part: compte / Math.max(1, total), valeurs };
    });
  }, { b64, mesures });
  const R = centre.r;
  const zones = [
    { cx: centre.x, cy: centre.y, de: R * 1.025, a: R * 1.07, n: 90 }, // l'anneau (juste au-delà du bord : l'image grise couvre le dedans)
    { cx: centre.x, cy: centre.y, de: R * 1.1, a: R * 1.45, n: 90 },   // la fumée
    { cx: centre.x, cy: centre.y, de: R * 1.5, a: R * 1.75, n: 90 },   // le bout des langues
    { cx: centre.x, cy: centre.y, de: R * 2.1, a: R * 2.4, n: 90 },    // au-delà de l'aura
    { cx: centre.nx, cy: centre.ny, de: R * 1.1, a: R * 1.45, n: 90 }  // autour d'un monstre ordinaire
  ];
  const [a1, f1, bout, loin, ordinaire] = await analyser(await photo(), zones);
  await p.waitForTimeout(900);
  const [, f2] = await analyser(await photo(), zones);
  verifier("l'anneau est rouge tout autour du médaillon", a1.part > 0.85, `${(a1.part * 100).toFixed(0)} %`);
  verifier("la fumée rouge emplit l'essentiel de la couronne (1,1 à 1,45 rayon)", f1.part > 0.35, `${(f1.part * 100).toFixed(0)} %`);
  // (v287 : l'effet réduit — les langues s'arrêtent avant une fois et demie le rayon.)
  verifier("(v287) les langues, réduites, ne vont plus au-delà d'une fois et demie le rayon", bout.part < 0.05 && bout.part < f1.part, `${(bout.part * 100).toFixed(0)} %`);
  verifier("au-delà de deux rayons, plus rien", loin.part < 0.02, `${(loin.part * 100).toFixed(1)} %`);
  verifier("autour d'un monstre ordinaire, rien", ordinaire.part < 0.02, `${(ordinaire.part * 100).toFixed(1)} %`);
  const diff = f1.valeurs.reduce((s, v, i) => s + Math.abs(v - (f2.valeurs[i] || 0)), 0) / Math.max(1, f1.valeurs.length);
  verifier("EN MOUVEMENT : 0,9 s plus tard, la fumée n'est plus la même", diff > 6, `écart moyen ${diff.toFixed(1)} / 255`);
}

// =========================================================================
titre("3. LE ZOOM : CENTRÉE SUR LE PION, À LA MÊME PROPORTION");
// =========================================================================
{
  const mesures = await p.evaluate(async () => {
    const sortie = [];
    for (const s of [1, 3, 0.6, 1.4]) {
      window.VTT_SCALE = s; window.appliquerTransformPlateau();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const t = document.getElementById("token-M1").getBoundingClientRect(), a = document.querySelector("#token-M1 .aura-leader").getBoundingClientRect();
      sortie.push({ s, dx: Math.round((a.left + a.width / 2) - (t.left + t.width / 2)), dy: Math.round((a.top + a.height / 2) - (t.top + t.height / 2)), ratio: +(a.width / t.width).toFixed(2) });
    }
    return sortie;
  });
  verifier("à ×1, ×3, ×0,6, ×1,4 : centrée au pixel près, toujours deux fois le pion",
           mesures.every(m => Math.abs(m.dx) <= 1 && Math.abs(m.dy) <= 1 && m.ratio === 2), JSON.stringify(mesures));
}

// =========================================================================
titre("4. LES VERSIONS");
// =========================================================================
{
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json')).version;
  verifier("version 271 ou plus (trace_combat.js, version.json)", vTrace >= 271 && vJson === vTrace, `${vTrace} / ${vJson}`);
  verifier("combat.js et style.css ont changé de version",
           Number((html.match(/"combat\.js\?v=(\d+)/) || [])[1]) >= 155 && Number((html.match(/style\.css\?v=(\d+)/) || [])[1]) >= 102);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
