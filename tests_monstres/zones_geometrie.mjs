// LES ZONES DES SORTS ONT LA FORME QU'ELLES AURONT SUR LA MAP.
//
// Nico : « l'hexagone de la map en combat et le dessin de l'hexagone des zones
// des sorts ne sont pas pareils ». La map (Plateau.js, hexToPixel) pose des
// hexagones à BORD PLAT en haut (x = 3/2·q, y = √3·(r + q/2)) ; les dessins
// de zone — la carte en grand (competences.js), le choix de la zone dans la
// Forge (dessinerGrilleZone) et l'encart du tour (dessinZoneCarte, combat.js)
// — les posaient POINTE en haut (x = √3·(q + r/2), y = 3/2·r). Mêmes
// coordonnées, autre dessin : une ligne droite sur la carte devenait une
// diagonale sur le plateau. Ce banc compare les trois au hexToPixel de la map.
import fs from 'fs';
import http from 'http';
import path from 'path';

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

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  // firebase-config.js fabrique la base avec des options (le transport sondé
  // plutôt que subi, pour l'iPad) : le bouchon doit donc offrir cette porte-là,
  // sinon le module ne se charge pas et rien du jeu ne s'initialise.
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {}; export const updateDoc = async () => {};
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {}; export const query = (...a) => ({a});
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

// Les images du décor sont injoignables depuis le bac à sable. On sert un
// rectangle connu à la place : l'avatar doit avoir une taille pour qu'on puisse
// dire s'il dépasse du bouton, et le bandeau une hauteur pour que la boîte de
// l'anneau se pose quelque part.
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml',
  headers: {'Access-Control-Allow-Origin':'*'},
  body: `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="132" viewBox="0 0 450 132"><rect width="450" height="132" fill="#2a1d12"/></svg>` }));

const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));

await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

// Le centre attendu d'un hexagone (q, r), selon la MAP elle-même.
const centreMap = (q, r, taille) => p.evaluate(({ q, r, taille }) =>
  Plateau.prototype.hexToPixel.call({ hexSize: taille, largeurLogique: 0, hauteurLogique: 0 }, q, r), { q, r, taille });
const lirePolys = (html) => [...html.matchAll(/points="([^"]+)"/g)].map(m => m[1].trim().split(/\s+/).map(c => c.split(",").map(Number)));
const centre = (pts) => ({ x: pts.reduce((s, p) => s + p[0], 0) / pts.length, y: pts.reduce((s, p) => s + p[1], 0) / pts.length });
const bordPlat = (pts) => { const ys = pts.map(p => p[1]).sort((a, b) => a - b); return Math.abs(ys[0] - ys[1]) < 0.2; };

const ZONE = [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 1, r: -1 }, { q: 0, r: 1 }];

console.log("\n1. L'ENCART DU TOUR (dessinZoneCarte, combat.js)");
{
  const html = await p.evaluate((z) => window.dessinZoneCarte({ Composants: { actions: [{ zoneHexes: z, mods: {} }] } }, "red", 15), ZONE);
  const polys = lirePolys(html);
  // Le lanceur (0,0) est dessiné en gris : 5 hexagones au total, lui compris.
  verifier("cinq hexagones (la zone + le lanceur)", polys.length === 5, String(polys.length));
  verifier("tous à BORD PLAT en haut, comme la map", polys.every(bordPlat));
  const centres = polys.map(centre);
  const attendus = [];
  for (const h of [{ q: 0, r: 0 }, ...ZONE]) attendus.push(await centreMap(h.q, h.r, 15));
  // Même forme à une translation près : on compare les écarts au lanceur.
  const c0 = centres[attendus.findIndex(a => a.x === 0 && a.y === 0)] || centres[0];
  const trouve = (a) => centres.some(c => Math.abs((c.x - c0.x) - a.x) < 0.3 && Math.abs((c.y - c0.y) - a.y) < 0.3);
  verifier("chaque hexagone tombe où la map le pose", attendus.every(trouve),
           JSON.stringify(centres.map(c => [Math.round(c.x - c0.x), Math.round(c.y - c0.y)])));
}

console.log("\n2. LE CHOIX DE LA ZONE DANS LA FORGE (dessinerGrilleZone, competences.js)");
{
  const r = await p.evaluate(() => {
    window.forgeState.effetsBDD = [{ id: "Z", Nom: "Zone", Cout_PT: "1.5" }];
    window.forgeState.actions = [{ idInst: "A1", baseEffet: { Nom: "Attaque légère" }, mods: {} }];
    window.forgeState.zoneActionIdEnCours = "A1";
    window.forgeState.selectedZoneHexes = [];
    const vrai = window.clicHexagoneZone;
    const lus = [];
    window.clicHexagoneZone = (q, r) => lus.push({ q, r });
    window.dessinerGrilleZone();
    const polys = [...document.querySelectorAll("#zone-hex-grid polygon")];
    const sortie = polys.map(pg => { const avant = lus.length; pg.onclick(); return { hex: lus[avant], points: pg.getAttribute("points") }; });
    window.clicHexagoneZone = vrai;
    return sortie;
  });
  verifier("les 19 hexagones du sélecteur", r.length === 19, String(r.length));
  const polys = r.map(x => x.points.trim().split(/\s+/).map(c => c.split(",").map(Number)));
  verifier("tous à BORD PLAT en haut, comme la map", polys.every(bordPlat));
  let ok = 0;
  for (let i = 0; i < r.length; i++) {
    const a = await centreMap(r[i].hex.q, r[i].hex.r, 25), c = centre(polys[i]);
    if (Math.abs(c.x - 150 - a.x) < 0.3 && Math.abs(c.y - 150 - a.y) < 0.3) ok++;
  }
  verifier("chaque case cliquable est à la place qu'elle a sur la map", ok === r.length, `${ok}/${r.length}`);
}

console.log("\n3. LA CARTE EN GRAND (afficherApercuCarteHD, competences.js)");
{
  const src = fs.readFileSync(`${RACINE}/competences.js`, 'utf-8');
  const bloc = src.slice(src.indexOf('// NOUVEAU : Dessin avec Bounding Box Dynamique'), src.indexOf('htmlZoneAbsolue = `'));
  verifier("même formule que la map (x = 3/2·q, y = √3·(r + q/2))",
           /hexRadius \* 1\.5 \* q/.test(bloc) && /Math\.sqrt\(3\) \* \(r \+ q \/ 2\.0\)/.test(bloc));
  verifier("coins à 0°, 60°… (bord plat en haut)", /Math\.PI \/ 3 \* i;/.test(bloc) && !/Math\.PI \/ 6/.test(bloc));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
