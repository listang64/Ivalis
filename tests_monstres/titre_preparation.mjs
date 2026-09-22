// LE TITRE DE PRÉPARATION, DEVANT LA PISTE D'INITIATIVE.
//
// Nico voulait savoir d'un coup d'œil où en est la manche pendant qu'on
// choisit sa carte : un gros titre, sur un fond flouté qui masque une partie
// de la piste, tant que la phase est en préparation. « Sélectionner une
// compétence » tant que CE poste n'a pas retenu la carte d'un de ses héros,
// « En attente des joueurs » une fois que c'est fait mais que la manche
// n'est pas bouclée — et rien du tout en résolution, ou une fois que tout le
// monde a joué.
//
// Ce banc sert la vraie page en HTTP (comme piste_initiative.mjs) et regarde
// le VRAI rendu : window.actualiserTitrePreparation, appelée depuis
// afficherPisteInitiative (combat.js), pose le texte et l'opacité — rien
// n'est simulé ici.
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

// Mêmes doublures Firebase que piste_initiative.mjs : rien n'écrit nulle
// part, tout le reste (combat.js, competences.js, ...) est le vrai code.
const FAUX_APP = `export const initializeApp = () => ({ nom: "faux" });`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({ faux: true });
  export const getFirestore = () => ({ faux: true });
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {};
  export const updateDoc = async () => {};
  export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "neuf" });
  export const deleteField = () => "«champ supprimé»";
  export class FieldPath { constructor(...segments) { this.segments = segments; } }
  export const arrayUnion = (...v) => v;
  export const arrayRemove = (...v) => v;
  export const increment = (n) => n;
  export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({ a });
  export const where = (...a) => ({ a });
  export const orderBy = (...a) => ({ a });
  export const limit = (...a) => ({ a });
  export const writeBatch = () => ({ update: () => {}, set: () => {}, delete: () => {}, commit: async () => {} });
  export const runTransaction = async (_db, fn) => fn({
    get: async () => ({ exists: () => true, data: () => ({}) }), update: () => {}, set: () => {} });
  export const Timestamp = { now: () => Date.now() };
`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });

await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({
  contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({
  contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE }));

const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });

await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

// =========================================================================
//  LE MONDE : deux héros à MOI (ce poste), un troisième allié ailleurs, une
//  créature. « Ailleurs » est ce qui fait la différence entre « j'ai fini »
//  et « tout le monde a fini ».
// =========================================================================
await p.evaluate(() => {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById("fenetre-combat").style.display = "block";

  window.jouerSonClic = () => {};
  window.estCombattantMort = (id) => (window.MORTS || []).includes(id);
  window.estMonstre = (id) => String(id).startsWith("M");
  window.sequenceTourEnAttente = () => false;
  window.MORTS = [];

  window.PLATEAU_VTT = {
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    hexToPixel: (q, r) => ({ x: 300 + q * 60, y: 300 + r * 60 }),
    pixelToHex: () => ({ q: 0, r: 0 }),
    renderMap: () => {}
  };
  window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;

  const fiche = (id, extra) => Object.assign({
    idPersonnage: id, prenom: id, camp: "Allié", PV_Max: 60, PV_Actuels: 60,
    Fatigue_Max: 100, fatigueActuelle: 100, Bouclier_Actuel: 0, Etats_Alteres: [],
    statut: "Vivant", Force: 10, Dexterite: 10, Intelligence: 10, Constitution: 10
  }, extra || {});

  window.PERSOS_PARTIE = [
    fiche("H1", { idJoueur: "P_MOI" }),
    fiche("H2", { idJoueur: "P_MOI" }),
    fiche("H3", { idJoueur: "P_AUTRE" }),
    fiche("M1", { camp: "Ennemi", estMonstre: true })
  ];
  window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, H2: { q: 0, r: 1 }, H3: { q: 1, r: 0 }, M1: { q: 2, r: 0 } };
  window.TOKEN_SELECTIONNE = null;
  // Ce poste contrôle H1 ET H2 : le titre ne doit passer à « en attente » que
  // lorsque LES DEUX ont posé leur carte, pas dès le premier.
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0], window.PERSOS_PARTIE[1]];
  window.COMBAT_INDEX_PERSO = 0;
  window.ZONES_PERSISTANTES = {};
  window.CHEMIN_MOUVEMENT = [];
  window.REGIME_CERVEAU = true;
  window.PISTE_MANCHE = { manche: 0, ordre: [] };
  window.PARTIE_DATA = { Phase_Combat: "Preparation", Tour_Combat: 1,
                         Ordre_Initiative: ["H1", "H2", "H3", "M1"],
                         Combattants_Hors_Jeu: [], Ont_Joue_Ce_Round: [], File_Attente_Combat: [] };
  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
});

const preparation = (maj) => p.evaluate((maj) => {
  Object.assign(window.PARTIE_DATA, maj);
  window.afficherPisteInitiative(window.PARTIE_DATA.File_Attente_Combat, window.PARTIE_DATA.Phase_Combat);
}, maj);

const lireTitre = () => p.evaluate(() => {
  const zone = document.getElementById("titre-preparation-zone");
  const fond = document.getElementById("titre-preparation-fond");
  const texte = document.getElementById("titre-preparation-texte");
  const piste = document.getElementById("piste-initiative-zone");
  return {
    opacite: getComputedStyle(zone).opacity,
    texte: texte.textContent,
    zZone: parseInt(getComputedStyle(zone).zIndex),
    zPiste: parseInt(getComputedStyle(piste).zIndex),
    flou: getComputedStyle(fond).backdropFilter || getComputedStyle(fond).webkitBackdropFilter,
    rectZone: zone.getBoundingClientRect(),
    rectPiste: piste.getBoundingClientRect()
  };
});

// =========================================================================
console.log("1. LA MANCHE S'OUVRE : PERSONNE N'A ENCORE CHOISI");
// =========================================================================
await preparation({});
await p.waitForTimeout(450);
{
  const t = await lireTitre();
  verifier("le titre est affiché", t.opacite === "1", t.opacite);
  verifier("il dit « Sélectionner une compétence »", t.texte === "Sélectionner une compétence", t.texte);
}

// =========================================================================
console.log("\n2. UN DE MES DEUX HÉROS CHOISIT : ÇA NE SUFFIT PAS ENCORE");
// =========================================================================
await preparation({ Ont_Joue_Ce_Round: ["H1"] });
await p.waitForTimeout(450);
{
  const t = await lireTitre();
  verifier("le titre reste sur « sélectionner »", t.texte === "Sélectionner une compétence", t.texte);
}

// =========================================================================
console.log("\n3. MES DEUX HÉROS ONT CHOISI, PAS LES AUTRES : « EN ATTENTE »");
// =========================================================================
await preparation({ Ont_Joue_Ce_Round: ["H1", "H2"] });
await p.waitForTimeout(450);
{
  const t = await lireTitre();
  verifier("le titre est toujours affiché", t.opacite === "1", t.opacite);
  verifier("il dit désormais « En attente des joueurs »", t.texte === "En attente des joueurs", t.texte);
}

// =========================================================================
console.log("\n4. TOUT LE MONDE A CHOISI : LE TITRE S'EFFACE");
// =========================================================================
await preparation({ Ont_Joue_Ce_Round: ["H1", "H2", "H3", "M1"] });
await p.waitForTimeout(450);
{
  const t = await lireTitre();
  verifier("le titre disparaît, la résolution s'ouvre d'un instant à l'autre", t.opacite === "0", t.opacite);
}

// =========================================================================
console.log("\n5. EN RÉSOLUTION, IL N'Y A JAMAIS DE TITRE");
// =========================================================================
await preparation({ Phase_Combat: "Resolution",
  File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "C_M1", initiative: 50 }] });
await p.waitForTimeout(450);
{
  const t = await lireTitre();
  verifier("le titre reste masqué en résolution", t.opacite === "0", t.opacite);
}

// =========================================================================
console.log("\n6. UN HÉROS À MOI TOMBÉ N'EST PLUS ATTENDU");
// =========================================================================
await preparation({ Phase_Combat: "Preparation", Tour_Combat: 2,
  Combattants_Hors_Jeu: ["H2"], Ont_Joue_Ce_Round: [], File_Attente_Combat: [] });
await p.waitForTimeout(450);
{
  const t1 = await lireTitre();
  verifier("H2 à terre : il reste H1 à choisir, le titre le dit encore",
           t1.texte === "Sélectionner une compétence", t1.texte);

  await preparation({ Ont_Joue_Ce_Round: ["H1"] });
  await p.waitForTimeout(450);
  const t2 = await lireTitre();
  verifier("H1 seul suffit maintenant : « en attente », plus « sélectionner »",
           t2.texte === "En attente des joueurs", t2.texte);
}

// =========================================================================
console.log("\n7. LE TITRE EST DEVANT LA PISTE, SUR UN FOND FLOUTÉ");
// =========================================================================
await preparation({ Combattants_Hors_Jeu: [], Ont_Joue_Ce_Round: [] });
await p.waitForTimeout(450);
{
  const t = await lireTitre();
  verifier("il est au-dessus de la piste (z-index plus grand)", t.zZone > t.zPiste,
           `titre ${t.zZone} / piste ${t.zPiste}`);
  verifier("son fond est flouté (backdrop-filter posé)",
           !!t.flou && t.flou !== "none", String(t.flou));
  // « masquer PARTIELLEMENT » : il recouvre le haut de la piste, sans forcément
  // en recouvrir toute la largeur ni toute la hauteur.
  verifier("il commence à la même hauteur que la piste (recouvre son sommet)",
           Math.abs(t.rectZone.top - t.rectPiste.top) < 2,
           `titre ${Math.round(t.rectZone.top)} / piste ${Math.round(t.rectPiste.top)}`);
}

verifier("aucune erreur JavaScript pendant tout le banc", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
