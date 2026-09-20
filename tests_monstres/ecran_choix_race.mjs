// L'ÉCRAN DE CHOIX DE RACE : LE TITRE DE L'ÉTAPE, ET LE NOM DE LA RACE.
//
// Le grand titre du haut portait le nom de la race (« LES HUMAINS »), et le
// descriptif juste en dessous ne disait pas de qui il parlait : un joueur qui
// lisait l'encart au milieu de l'écran devait remonter des yeux jusqu'en haut
// pour savoir quelle race il était en train de lire.
//
// Désormais :
//   • le grand titre annonce l'ÉTAPE, et ne bouge plus : « Choix de Race » ;
//   • le nom de la race est descendu JUSTE AU-DESSUS de son descriptif, dans le
//     même encart, et c'est lui qui change d'un onglet à l'autre.
//
// Et comme l'encart gagne deux lignes au passage, on en profite pour tenir ce
// qui ne tenait déjà plus : l'encart était centré sur l'ÉCRAN, libre de grandir
// vers le haut et vers le bas selon la longueur du lore, si bien que les races
// les plus bavardes (les Ophiors) passaient par-dessus le grand titre et
// par-dessus les deux symboles de genre. Il est désormais tenu dans une BANDE
// entre les deux, et se centre là-dedans.
//
// Ce banc ouvre la vraie page, pousse les sept onglets et mesure les pixels, sur
// écran d'ordinateur ET en tactile (l'iPad a sa propre feuille de style) : un
// titre écrit mais posé sous le descriptif, de taille nulle, ou un encart qui
// chevauche quoi que ce soit, serait pris.
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

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
// L'iPad de Nico en paysage (1194 x 834). `hasTouch` fait basculer la feuille
// de style dans sa branche tactile (hover:none / pointer:coarse) : les DEUX
// mondes sont mesurés l'un après l'autre, parce que ce sont deux mises en page
// différentes et que le jeu se joue sur les deux.
let TACTILE = false;
let p = await b.newPage({ viewport: { width: 1194, height: 834 }, hasTouch: false });
const preparerPage = async () => {
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
// Les fonds de race vivent sur Cloudinary, injoignable d'ici : un rectangle de
// proportions connues fait l'affaire, l'écran n'est mesuré que sur son texte.
await p.route('**res.cloudinary.com/**', r => r.fulfill({ contentType: 'image/svg+xml',
  headers: {'Access-Control-Allow-Origin':'*'},
  body: `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#222"/></svg>` }));

await p.goto(base + '/index.html');
await p.waitForTimeout(1500);
};
await preparerPage();

const RACES = ["Humain", "Ondari", "Vargen", "Ankylar", "Ophior", "Gob", "Ethéré"];

const mesurer = (race) => p.evaluate((race) => {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  window.jouerSonClic = () => {};
  if (race === null) window.ouvrirCreationHero();
  else window.changerRaceSelection(race);

  const boite = (id) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const css = getComputedStyle(el);
    return { texte: (el.innerText || "").trim(), x: r.x, y: r.y, largeur: r.width, hauteur: r.height,
             haut: r.top, bas: r.bottom, centre: r.x + r.width / 2,
             taillePolice: parseFloat(css.fontSize), visible: css.display !== "none" && css.visibility !== "hidden" };
  };
  const encart = document.getElementById("conteneur-textes-race");
  const genre = document.querySelector(".btn-genre-selection");
  const cadre = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { haut: r.top, bas: r.bottom, x: r.x, largeur: r.width };
  };
  return {
    titre: boite("titre-race-selection"),
    nom: boite("nom-race-selection"),
    description: boite("description-race-selection"),
    gameplay: boite("gameplay-race-selection"),
    encart: cadre(encart),
    onglets: cadre(document.getElementById("onglets-races")),
    genres: cadre(genre),
    // Ce qui dépasse de la bande : zéro, ou l'encart s'est mis à défiler.
    defile: encart ? Math.max(0, encart.scrollHeight - encart.clientHeight) : 0,
    memeEncart: !!(document.getElementById("nom-race-selection")
                && document.getElementById("nom-race-selection").parentElement
                && document.getElementById("nom-race-selection").parentElement.id === "conteneur-textes-race"),
    hauteurEcran: window.innerHeight
  };
}, race);

// Un titre absent ne doit pas faire exploser le banc au milieu : on lui
// substitue une boîte impossible, pour que TOUTES les vérifications parlent.
const ABSENT = { texte: "", x: 0, y: 0, largeur: 0, hauteur: 0, haut: -1e9, bas: 1e9,
                 centre: -1e9, taillePolice: 0, visible: false };
const boite = (m, cle) => m[cle] || ABSENT;

for (const tactile of [false, true]) {
if (tactile) {
  TACTILE = true;
  await p.close();
  p = await b.newPage({ viewport: { width: 1194, height: 834 }, hasTouch: true });
  await preparerPage();
}
const brut = await mesurer(null);
const ouverture = { ...brut, titre: boite(brut, "titre"), nom: boite(brut, "nom"),
                    description: boite(brut, "description"), gameplay: boite(brut, "gameplay") };
const parRace = {};
for (const race of RACES) {
  const m = await mesurer(race);
  parRace[race] = { ...m, titre: boite(m, "titre"), nom: boite(m, "nom"),
                    description: boite(m, "description"), gameplay: boite(m, "gameplay") };
}

console.log("\n=== " + (TACTILE ? "FEUILLE TACTILE (iPad)" : "FEUILLE BUREAU") + " ===");
console.log("\n1. LE GRAND TITRE ANNONCE L'ÉTAPE, PLUS LA RACE");
verifier("il affiche « Choix de Race » à l'ouverture",
         ouverture.titre.texte.toLowerCase() === "choix de race",
         `(« ${ouverture.titre.texte} »)`);
verifier("il ne bouge pas d'un onglet à l'autre",
         RACES.every(r => parRace[r].titre.texte.toLowerCase() === "choix de race"),
         RACES.map(r => parRace[r].titre.texte).join(" / "));
verifier("aucun nom de race n'y reste accroché",
         RACES.every(r => !parRace[r].titre.texte.toLowerCase().includes(r.toLowerCase().slice(0, 4))));

console.log("\n2. LE NOM DE LA RACE EST AU-DESSUS DE SON DESCRIPTIF");
verifier("il existe et il est visible",
         ouverture.nom.visible && ouverture.nom.hauteur > 0,
         ouverture.nom.visible ? `(${Math.round(ouverture.nom.largeur)}×${Math.round(ouverture.nom.hauteur)})` : "(absent)");
verifier("il vit dans le même encart que les textes de la race", ouverture.memeEncart);
// innerText rend le texte tel qu'il s'affiche : la feuille de style le met en
// capitales, on compare donc sans se soucier de la casse.
verifier("il change bien avec l'onglet choisi",
         RACES.every(r => parRace[r].nom.texte.toLowerCase() === ("Les " + r + "s").toLowerCase()),
         RACES.map(r => parRace[r].nom.texte).join(" / "));
verifier("il est posé AU-DESSUS du descriptif, jamais en dessous",
         RACES.every(r => parRace[r].nom.bas <= parRace[r].description.haut + 1),
         `(nom bas ${Math.round(parRace.Humain.nom.bas)} vs descriptif haut ${Math.round(parRace.Humain.description.haut)})`);
verifier("et juste au-dessus : moins de 60 px les séparent",
         RACES.every(r => parRace[r].description.haut - parRace[r].nom.bas < 60),
         `(${Math.round(parRace.Humain.description.haut - parRace.Humain.nom.bas)} px)`);
verifier("il est centré sur le descriptif",
         RACES.every(r => Math.abs(parRace[r].nom.centre - parRace[r].description.centre) < 3),
         `(écart ${Math.abs(parRace.Humain.nom.centre - parRace.Humain.description.centre).toFixed(1)} px)`);
verifier("il se lit comme un titre : plus gros que le texte qu'il annonce",
         ouverture.nom.taillePolice > ouverture.description.taillePolice,
         `(${ouverture.nom.taillePolice} px contre ${ouverture.description.taillePolice} px)`);
verifier("l'encart entier tient dans l'écran",
         RACES.every(r => parRace[r].nom.haut > 0 && parRace[r].gameplay.bas < parRace[r].hauteurEcran),
         `(de ${Math.round(parRace.Ankylar.nom.haut)} à ${Math.round(parRace.Ankylar.gameplay.bas)} sur ${parRace.Ankylar.hauteurEcran})`);

console.log("\n3. RIEN NE CHEVAUCHE RIEN" + (TACTILE ? " (feuille tactile)" : " (feuille bureau)"));
// Le chevauchement de deux boîtes, en pixels : zéro, ou elles se marchent dessus.
const chevauche = (a, c) => Math.max(0, Math.min(a.bas, c.bas) - Math.max(a.haut, c.haut));
const pire = (f) => Math.max(...RACES.map(r => f(parRace[r])));
verifier("le titre de l'étape ne mord pas sur l'encart",
         pire(m => chevauche(m.titre, m.encart)) === 0,
         `(${Math.round(pire(m => chevauche(m.titre, m.encart)))} px au pire)`);
verifier("l'encart ne mord pas sur les deux symboles de genre",
         pire(m => chevauche(m.encart, m.genres)) === 0,
         `(${Math.round(pire(m => chevauche(m.encart, m.genres)))} px au pire)`);
verifier("les onglets des races ne mordent pas sur le titre",
         pire(m => chevauche(m.onglets, m.titre)) === 0,
         `(${Math.round(pire(m => chevauche(m.onglets, m.titre)))} px au pire)`);
verifier("aucune race n'oblige l'encart à défiler",
         pire(m => m.defile) === 0, `(${Math.round(pire(m => m.defile))} px au pire)`);

console.log("\n4. LE DESCRIPTIF SUIT TOUJOURS SA RACE");
verifier("chaque race a son lore et son atout",
         RACES.every(r => parRace[r].description.texte.length > 40 && parRace[r].gameplay.texte.includes("Atout")));

}

await b.close();
serveur.close();
console.log(echecs === 0
  ? "\n✅ L'écran de choix de race annonce l'étape, chaque encart porte son nom, et rien ne se chevauche — sur les deux feuilles."
  : `\n❌ ${echecs} vérification(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
