// LA PISTE D'INITIATIVE DIT QUI A CHOISI SA COMPÉTENCE
//
// Nico : « Dans les bulles d'initiative sur la piste d'initiative, quand on est
// en attente que les joueurs choisissent une compétence : un sablier pour les
// joueurs qui n'ont pas choisi leur compétence et une coche verte pour les
// joueurs qui ont choisi leur compétence. »
//
// La règle est celle du titre « En attente des joueurs » : on a choisi dès
// qu'on est dans la file de la manche (ou qu'on a déjà joué). Vérifié sur la
// vraie page :
//   • en préparation, un héros qui n'a pas choisi porte un sablier ;
//   • celui qui a choisi porte une coche verte, qui ne rebondit qu'une fois ;
//   • une créature (monstre, compagnon, zombie) ne porte rien : elle ne choisit
//     pas de compétence ;
//   • un héros hors jeu non plus ;
//   • en résolution, plus aucun badge.
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

// Mêmes doublures Firebase que demarrage_reel.mjs : rien n'écrit nulle part,
// tout le reste (combat.js, mouvement.js, moteur_effets.js, competences.js)
// est le vrai code.
const FAUX_APP = `export const initializeApp = () => ({ nom: "faux" });`;
const FAUX_FIRESTORE = `
  // firebase-config.js fabrique la base avec des options (le transport sondé
  // plutôt que subi, pour l'iPad) : le bouchon doit donc offrir cette porte-là,
  // sinon le module ne se charge pas et rien du jeu ne s'initialise.
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
//  LE MONDE : deux héros, deux créatures.
// =========================================================================

const monde = () => p.evaluate(() => {
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
    fiche("H1", { idJoueur: "P_01", prenom: "Cybile" }),
    fiche("H2", { idJoueur: "P_02", prenom: "Pliors" }),
    fiche("H3", { idJoueur: "P_03", prenom: "Ardal" }),
    fiche("C_LOUP", { compagnonDe: "H1", estMonstre: true, prenom: "Loup" }),
    fiche("M1", { camp: "Ennemi", estMonstre: true, prenom: "Chien des tombes" })
  ];
  window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, H2: { q: 0, r: 1 }, H3: { q: 1, r: 1 }, C_LOUP: { q: 1, r: 0 }, M1: { q: 2, r: 0 } };
  window.TOKEN_SELECTIONNE = null;
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
  window.COMBAT_INDEX_PERSO = 0;
  window.ZONES_PERSISTANTES = {};
  window.CHEMIN_MOUVEMENT = [];
  window.REGIME_CERVEAU = true;
  window.PISTE_MANCHE = { manche: 0, ordre: [] };
  window.PARTIE_DATA = { Phase_Combat: "Preparation", Tour_Combat: 1,
                         Ordre_Initiative: ["H1", "H2", "H3", "C_LOUP", "M1"], File_Attente_Combat: [],
                         Ont_Joue_Ce_Round: [], Combattants_Hors_Jeu: [] };
  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
});

// La préparation : `file` = ceux qui ont déjà posé leur carte.
const preparation = (file, extra) => p.evaluate(({ file, extra }) => {
  Object.assign(window.PARTIE_DATA, { Phase_Combat: "Preparation", File_Attente_Combat: file }, extra || {});
  window.afficherPisteInitiative(file, "Preparation");
}, { file, extra });

const badges = () => p.evaluate(() => {
  const res = {};
  document.querySelectorAll("#piste-initiative .piste-tuile").forEach(t => {
    const b = t.querySelector(".piste-choix");
    res[t.dataset.id] = !b ? null : {
      etat: b.classList.contains("pret") ? "pret" : b.classList.contains("attente") ? "attente" : "?",
      neuf: b.classList.contains("neuf"),
      texte: b.textContent.trim(),
      fond: getComputedStyle(b).backgroundColor,
      visible: getComputedStyle(b).display !== "none" && b.getBoundingClientRect().width > 10
    };
  });
  return res;
});

// Une capture du haut de l'écran, seulement si on la demande (CAPTURE_DIR).
const capture = async (nom) => {
  if (!process.env.CAPTURE_DIR) return;
  const r = await p.evaluate(() => {
    const z = document.getElementById("piste-initiative-zone").getBoundingClientRect();
    return { x: Math.max(0, z.left - 20), y: 0, width: Math.min(window.innerWidth, z.width + 40), height: Math.min(200, z.bottom + 30) };
  });
  await p.screenshot({ path: process.env.CAPTURE_DIR + "/" + nom, clip: r });
};

await monde();

// Pour la capture seulement : de faux portraits dessinés sur place (le banc ne
// sort pas sur le réseau), pour que la piste ressemble à la vraie.
if (process.env.CAPTURE_DIR) {
  const portraits = await p.evaluate(() => {
    const dessin = (fond, lettre) => {
      const c = document.createElement("canvas"); c.width = c.height = 128;
      const g = c.getContext("2d");
      const d = g.createRadialGradient(64, 50, 10, 64, 64, 90); d.addColorStop(0, fond); d.addColorStop(1, "#1a0f08");
      g.fillStyle = d; g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#f3dfa6"; g.font = "bold 64px serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(lettre, 64, 70);
      return c.toDataURL("image/png");
    };
    const urls = { H1: dessin("#3a6ea5", "C"), H2: dessin("#7a4a9a", "P"), H3: dessin("#3f8a5a", "A"), C_LOUP: dessin("#8a6a3a", "L") };
    Object.entries(urls).forEach(([id, url]) => { window.TOKENS_VTT_DATA[id].url = url; });
    return { monstre: dessin("#8a2a2a", "M") };
  });
  const png = Buffer.from(portraits.monstre.split(",")[1], "base64");
  await p.route(/res\.cloudinary\.com/, r => r.fulfill({ contentType: "image/png", body: png }));
}
const carte = (id, init) => ({ idPersonnage: id, idCarte: "C_" + id, initiative: init });

// =========================================================================
console.log("\n1. PERSONNE N'A ENCORE CHOISI : DES SABLIERS SUR LES HÉROS");
// =========================================================================
await preparation([]);
await p.waitForTimeout(150);
{
  const v = await badges();
  verifier("les trois héros portent un sablier",
           ["H1", "H2", "H3"].every(id => v[id] && v[id].etat === "attente" && v[id].texte === "⏳"), JSON.stringify(v));
  verifier("le sablier se voit (taille, fond sombre)", v.H1 && v.H1.visible, JSON.stringify(v.H1));
  verifier("le monstre ne porte rien", v.M1 === null, JSON.stringify(v.M1));
  verifier("le compagnon non plus : il ne choisit pas de compétence", v.C_LOUP === null, JSON.stringify(v.C_LOUP));
}
await capture("piste_sabliers.png");

// =========================================================================
console.log("\n2. CYBILE CHOISIT : UNE COCHE VERTE");
// =========================================================================
await preparation([carte("H1", 50)]);
await p.waitForTimeout(450);
{
  const v = await badges();
  verifier("Cybile (dans la file) porte une coche", v.H1 && v.H1.etat === "pret" && v.H1.texte === "✓", JSON.stringify(v.H1));
  verifier("la coche est verte", v.H1 && /rgb\(27, 138, 58\)/.test(v.H1.fond), v.H1 && v.H1.fond);
  verifier("elle vient d'apparaître : elle rebondit", v.H1 && v.H1.neuf);
  verifier("les deux autres attendent toujours", v.H2.etat === "attente" && v.H3.etat === "attente");
  verifier("toujours rien sur les créatures", v.M1 === null && v.C_LOUP === null);
}

// =========================================================================
console.log("\n3. PLIORS CHOISIT : LA COCHE DE CYBILE NE REBONDIT PAS UNE 2e FOIS");
// =========================================================================
await preparation([carte("H1", 50), carte("H2", 30)]);
await p.waitForTimeout(450);
{
  const v = await badges();
  verifier("Pliors porte à son tour une coche neuve", v.H2.etat === "pret" && v.H2.neuf);
  verifier("celle de Cybile reste, sans rebondir", v.H1.etat === "pret" && !v.H1.neuf);
  verifier("Ardal attend", v.H3.etat === "attente");
}
await capture("piste_coches.png");

// =========================================================================
console.log("\n4. DÉJÀ JOUÉ (Ont_Joue_Ce_Round) = A CHOISI ; HORS JEU = RIEN");
// =========================================================================
await preparation([], { Ont_Joue_Ce_Round: ["H3"], Combattants_Hors_Jeu: ["H2"] });
{
  const v = await badges();
  verifier("Ardal, qui a déjà joué cette manche, porte une coche", v.H3 && v.H3.etat === "pret", JSON.stringify(v.H3));
  verifier("Pliors, hors jeu, ne porte rien", v.H2 === null, JSON.stringify(v.H2));
  verifier("Cybile, sortie de la file, retrouve son sablier", v.H1 && v.H1.etat === "attente");
}

// =========================================================================
console.log("\n5. EN RÉSOLUTION : PLUS DE BADGE");
// =========================================================================
await p.evaluate(() => {
  const file = [{ idPersonnage: "M1", idCarte: "X", initiative: 70 }, { idPersonnage: "H1", idCarte: "Y", initiative: 50 },
                { idPersonnage: "H2", idCarte: "Z", initiative: 30 }];
  Object.assign(window.PARTIE_DATA, { Phase_Combat: "Resolution", File_Attente_Combat: file, Ont_Joue_Ce_Round: [], Combattants_Hors_Jeu: [] });
  window.afficherPisteInitiative(file, "Resolution");
});
{
  const n = await p.evaluate(() => document.querySelectorAll("#piste-initiative .piste-choix").length);
  verifier("aucun sablier ni coche pendant la résolution", n === 0, `(${n})`);
}

verifier("aucune erreur JavaScript pendant tout le banc", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
