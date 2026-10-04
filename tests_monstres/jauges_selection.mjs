// LES JAUGES DU PION SÉLECTIONNÉ.
//
// Demandé en partie : « quand on sélectionne un token sur la map combat, sa
// jauge de vie et de fatigue s'affiche en dessous de lui. Si c'est notre perso,
// elle disparaît en fondu lors du déplacement. »
//
// Ce banc charge la vraie page et vérifie, sur le vrai DOM :
//   • un pion sélectionné porte deux barres sous lui, vie et fatigue, à la
//     bonne proportion ; un pion non sélectionné n'en porte pas ;
//   • elles survivent au redessin des pions (même élément, la barre glisse) ;
//   • mon pion qui marche (jouerAnimationPas, le vrai mouvement.js) les replie
//     en fondu, et elles restent repliées jusqu'à une nouvelle sélection ;
//   • le pion d'un autre (une créature) qui marche les garde.
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

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

const preparer = () => p.evaluate(() => {
  document.getElementById("ecran-jeu").style.display = "block";   // le plateau doit être rendu, sinon aucun fondu ne joue
  document.getElementById("fenetre-combat").style.display = "block";
  window.jouerSonClic = () => {};
  window.PLATEAU_VTT = { getCaseState: () => ({}), hexToPixel: (q, r) => ({ x: 300 + q * 60, y: 300 + r * 60 }),
                         pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {} };
  window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
  window.PERSOS_PARTIE = [
    { idPersonnage: "J1", camp: "Allié", prenom: "Pliors", PV_Max: 40, PV_Actuels: 30, Fatigue_Max: 100, Fatigue_Actuelle: 25, statut: "Vivant" },
    { idPersonnage: "M1", camp: "Ennemi", estMonstre: true, nom: "Gnoll", PV_Max: 50, PV_Actuels: 10, Fatigue_Max: 100, Fatigue_Actuelle: 80, statut: "Vivant" }
  ];
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
  window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0, url: "j.png" }, M1: { q: 3, r: 0 } };
  window.JAUGES_REPLIEES = {};
});

const lire = (id) => p.evaluate((id) => {
  const bloc = document.querySelector(`#token-${id} .jauges-selection-token`);
  if (!bloc) return null;
  const pion = document.getElementById("token-" + id).getBoundingClientRect();
  const r = bloc.getBoundingClientRect();
  const largeur = (sel) => parseFloat(bloc.querySelector(sel + " .jauge-selection-remplie").style.width);
  return { vie: largeur(".jauge-selection-vie"), fatigue: largeur(".jauge-selection-fatigue"),
           sous: r.top >= pion.bottom - 1, centre: Math.abs((r.left + r.right) / 2 - (pion.left + pion.right) / 2) < 2,
           repliee: bloc.classList.contains("repliee"), opacite: parseFloat(getComputedStyle(bloc).opacity),
           transition: getComputedStyle(bloc).transitionProperty, clic: getComputedStyle(bloc).pointerEvents,
           couleurs: [...bloc.querySelectorAll(".jauge-selection-remplie")].map(x => getComputedStyle(x).backgroundColor) };
}, id);

console.log("1. UN CLIC SUR UN PION : SES JAUGES SOUS LUI");
{
  await preparer();
  await p.evaluate(() => {
    window.TOKEN_SELECTIONNE = null;
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
  });
  verifier("aucun pion sélectionné : aucune jauge", (await lire("J1")) === null && (await lire("M1")) === null);
  await p.evaluate(() => document.getElementById("token-M1").click());
  const m = await lire("M1");
  verifier("le pion cliqué porte ses jauges", !!m);
  verifier("vie à la bonne proportion (10/50 = 20 %)", m && m.vie === 20, JSON.stringify(m));
  verifier("fatigue à la bonne proportion (80/100 = 80 %)", m && m.fatigue === 80);
  verifier("sous le médaillon, centrées", m && m.sous && m.centre, JSON.stringify(m));
  verifier("rouge pour la vie, jaune pour la fatigue",
           m && m.couleurs[0] === "rgb(255, 43, 43)" && m.couleurs[1] === "rgb(255, 212, 0)", JSON.stringify(m && m.couleurs));
  verifier("elles n'avalent pas les clics", m && m.clic === "none");
  verifier("l'autre pion n'en porte pas", (await lire("J1")) === null);
}

console.log("\n2. UN REDESSIN NE LES RECRÉE PAS : LA BARRE GLISSE");
{
  const r = await p.evaluate(async () => {
    const avant = document.querySelector("#token-M1 .jauges-selection-token");
    avant.dataset.marque = "le-meme";
    window.PERSOS_PARTIE[1].PV_Actuels = 25;
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    const apres = document.querySelector("#token-M1 .jauges-selection-token");
    return { meme: apres && apres.dataset.marque === "le-meme",
             vie: parseFloat(apres.querySelector(".jauge-selection-vie .jauge-selection-remplie").style.width) };
  });
  verifier("même élément d'un dessin à l'autre", r.meme);
  verifier("la vie suit la nouvelle valeur (25/50 = 50 %)", r.vie === 50, JSON.stringify(r));
}

console.log("\n3. UNE CRÉATURE SÉLECTIONNÉE QUI MARCHE GARDE SES JAUGES");
{
  await p.evaluate(async () => {
    await window.jouerAnimationPas({ idToken: "M1", de: { q: 3, r: 0 }, vers: { q: 2, r: 0 }, anticipe: true });
  });
  const m = await lire("M1");
  verifier("pas repliées, et emmenées avec elle", m && !m.repliee && m.opacite === 1, JSON.stringify(m));
}

console.log("\n4. MON PION QUI MARCHE LES REPLIE EN FONDU");
{
  await preparer();
  await p.evaluate(() => document.getElementById("token-J1") ? null : window.appliquerTokensVTT(window.TOKENS_VTT_DATA));
  await p.evaluate(() => document.getElementById("token-J1").click());
  const avant = await lire("J1");
  verifier("sélectionné : ses jauges sont là (30/40, 25/100)", avant && avant.vie === 75 && avant.fatigue === 25 && avant.opacite === 1,
           JSON.stringify(avant));
  verifier("le fondu est une transition d'opacité", avant && /opacity/.test(avant.transition), avant && avant.transition);
  const pendant = await p.evaluate(async () => {
    const marche = window.jouerAnimationPas({ idToken: "J1", de: { q: 0, r: 0 }, vers: { q: 1, r: 0 }, anticipe: true });
    await new Promise(r => setTimeout(r, 200));   // le fondu dure 0,45 s : à 0,2 s, il est en route
    const bloc = document.querySelector("#token-J1 .jauges-selection-token");
    const o = parseFloat(getComputedStyle(bloc).opacity);
    await marche;
    return { repliee: bloc.classList.contains("repliee"), enCours: o > 0 && o < 1, o };
  });
  verifier("dès le premier pas : repliées", pendant.repliee, JSON.stringify(pendant));
  verifier("en fondu (opacité entre les deux pendant la marche)", pendant.enCours, `(opacité ${pendant.o})`);
  await p.waitForTimeout(600);
  const apres = await lire("J1");
  verifier("à la fin : invisibles", apres && apres.opacite === 0, JSON.stringify(apres));
  await p.evaluate(() => window.appliquerTokensVTT(window.TOKENS_VTT_DATA));
  const redessin = await lire("J1");
  verifier("un redessin ne les fait pas revenir", redessin && redessin.repliee && redessin.opacite === 0, JSON.stringify(redessin));
  await p.evaluate(() => document.getElementById("token-J1").click());
  await p.waitForTimeout(600);
  const reclic = await lire("J1");
  verifier("sélectionné de nouveau : elles reviennent", reclic && !reclic.repliee && reclic.opacite === 1, JSON.stringify(reclic));
}

const capture = '/tmp/claude-0/-home-user-Ivalis/3718c626-55b5-577c-9b4f-a49012fd3784/scratchpad/jauges_selection.png';
try {
  await p.evaluate(() => { window.VTT_SCALE = 1.6; window.TOKEN_SELECTIONNE = "M1"; window.appliquerTokensVTT(window.TOKENS_VTT_DATA); });
  const t = await p.evaluate(() => { const r = document.getElementById("token-M1").getBoundingClientRect(); return { x: r.left, y: r.top }; });
  await p.screenshot({ path: capture, clip: { x: Math.max(0, t.x - 60), y: Math.max(0, t.y - 40), width: 220, height: 200 } });
} catch (e) {}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
