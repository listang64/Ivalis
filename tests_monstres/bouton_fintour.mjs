// LE BOUTON FIN DE TOUR, DEVENU CINQ BOUTONS EN UN.
//
// Refonte UI combat, étape 1 : ce bouton unique absorbe maintenant ce que
// quatre éléments flottants faisaient séparément — la bulle de validation de
// déplacement (checkmark/croix en haut de l'écran), le bouton doré "Appliquer"
// au-dessus de la carte, et les boutons texte RÉSOUDRE/ANNULER du ciblage à
// cible unique. Seule la bulle de zone (rotation d'une emprise) reste à part.
//
// Ce banc sert la vraie page en HTTP (les modules ES refusent file://,
// exactement comme demarrage_reel.mjs), et vérifie sur le vrai code :
//   • les cinq images du bouton, dans l'ordre où elles doivent apparaître ;
//   • les deux visages de "fin de tour" (vierge / repris) selon qu'on a ou
//     non touché à quelque chose ce tour-ci ;
//   • que le clic déclenche exactement la bonne fonction selon l'état ;
//   • qu'annuler un ciblage sans cible passe le tour SANS dépenser l'énergie ;
//   • la garde contre le double-clic pendant l'aller-retour réseau ;
//   • que la croix d'annulation du déplacement vit sous le pion, et que les
//     anciens éléments flottants ont bien disparu du DOM comme des sources.
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
//  LE MONDE MINIMAL : un héros seul, à son tour, en phase de Résolution.
// =========================================================================
const monde = () => p.evaluate(() => {
  document.getElementById("fenetre-combat").style.display = "block";

  window.jouerSonClic = () => {};
  window.estCombattantMort = () => false;
  window.estMonstre = () => false;
  window.sequenceTourEnAttente = () => false;
  window.IA_DERNIER_SIGNE = 0;

  window.PLATEAU_VTT = {
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    hexToPixel: (q, r) => ({ x: q * 60, y: r * 60 }),
    renderMap: () => {}
  };
  window.PERSOS_PARTIE = [
    { idPersonnage: "H1", camp: "Allié", prenom: "Nico", PV_Actuels: 60, PV_Max: 60, Etats_Alteres: [] },
    { idPersonnage: "J2", camp: "Ennemi", prenom: "Gnoll", PV_Actuels: 40, PV_Max: 40, Etats_Alteres: [] }
  ];
  window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, J2: { q: 2, r: 0 } };
  window.TOKEN_SELECTIONNE = "H1";
  window.COMBAT_PERSOS_JOUEUR = [{ idPersonnage: "H1", estMonstre: false }];
  window.COMBAT_INDEX_PERSO = 0;
  window.CACHE_COMPETENCES_GLOBAL = {};
  window.REGIME_CERVEAU = true;

  // Les appels au cerveau sont observés, jamais vraiment envoyés : il n'y a
  // pas de Firestore derrière ces doublures.
  window.APPELS = [];
  window.regimeDemande = {
    actif: () => true,
    enVol: () => false,
    mouvement: async (...a) => { window.APPELS.push(["mouvement", ...a]); },
    carte: async (...a) => { window.APPELS.push(["carte", ...a]); },
    finDeTour: async (...a) => { window.APPELS.push(["finDeTour", ...a]); }
  };

  // Sans carte au tout premier appel : c'est le seul moment où « fin de
  // tour » peut se voir vierge (IMG_2134). Dès qu'une carte est en attente,
  // « choisir compétence » s'affiche d'emblée (section 2 la met en place).
  window.PARTIE_DATA = {
    Phase_Combat: "Resolution",
    File_Attente_Combat: [{ idPersonnage: "H1", idCarte: null }]
  };
  window.CHEMIN_MOUVEMENT = [];
  window.ETAT_CIBLAGE = null;

  window.actualiserBoutonFinTour();
});

const etatBouton = () => p.evaluate(() => ({
  src: document.getElementById("img-hud-fintour").src,
  mode: window.MODE_BOUTON_FINTOUR,
  peutPasser: window.PEUT_PASSER_TOUR,
  vierge: window.FINTOUR_VIERGE
}));

await monde();

// =========================================================================
console.log("\n1. RIEN À FAIRE : LE VISAGE VIERGE DE « FIN DE TOUR »");
// =========================================================================
//  Un personnage SANS carte en attente : l'unique cas où « fin de tour » est
//  la toute première chose vue ce tour-ci (avec une carte, c'est « choisir
//  compétence » qui s'affiche d'emblée — section 2). Ce contrôle doit passer
//  EN PREMIER, avant que quoi que ce soit d'autre n'ait pu ternir le drapeau
//  FINTOUR_VIERGE posé au début du tour.
{
  const e = await etatBouton();
  verifier("le mode est « fin de tour »", e.mode === "fin_de_tour", `(${e.mode})`);
  verifier("l'image vierge est IMG_2134 (jamais touché ce tour-ci)", e.src.includes("IMG_2134"), e.src);
  await p.evaluate(() => { window.finDeTourCombat = async () => { window.APPELS.push(["finDeTourDirect"]); }; });
  await p.evaluate(() => window.actionBoutonFinTour());
  const appels = await p.evaluate(() => window.APPELS);
  verifier("le clic finit le tour, en appelant bien finDeTourCombat",
           appels.some(a => a[0] === "finDeTourDirect"), JSON.stringify(appels));
}

// =========================================================================
console.log("\n2. AU DÉBUT DU TOUR, LA CARTE VERROUILLÉE ATTEND D'ÊTRE APPLIQUÉE");
// =========================================================================
{
  await p.evaluate(() => { window.PARTIE_DATA.File_Attente_Combat[0].idCarte = "C1"; window.APPELS = []; window.actualiserBoutonFinTour(); });
  const e = await etatBouton();
  verifier("le mode est « choisir compétence »", e.mode === "choisir_competence", `(${e.mode})`);
  verifier("l'image est IMG_2131", e.src.includes("IMG_2131"), e.src);
  verifier("le bouton est actionnable", e.peutPasser === true);

  await p.evaluate(() => { window.demarrerCiblage = async (idCarte) => { window.APPELS.push(["demarrerDirect", idCarte]); }; });
  await p.evaluate(() => window.actionBoutonFinTour());
  const appels = await p.evaluate(() => window.APPELS);
  verifier("le clic démarre le ciblage de la bonne carte",
           appels.some(a => a[0] === "demarrerDirect" && a[1] === "C1"), JSON.stringify(appels));
  await p.evaluate(() => { window.APPELS = []; });
}

// =========================================================================
console.log("\n3. UN DÉPLACEMENT SE TRACE : « VALIDER », ET LA CROIX SOUS LE PION");
// =========================================================================
{
  await p.evaluate(() => {
    window.CHEMIN_MOUVEMENT = [{ q: 1, r: 0, cost: 2 }];
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    window.actualiserBoutonFinTour();
  });
  const e = await etatBouton();
  verifier("le mode est « valider déplacement », même carte encore en attente",
           e.mode === "valider_deplacement", `(${e.mode})`);
  verifier("l'image est IMG_2130", e.src.includes("IMG_2130"), e.src);

  const croix = await p.evaluate(() => !!document.querySelector("#token-H1 .croix-annuler-deplacement"));
  verifier("la croix d'annulation apparaît sous le pion", croix);

  await p.evaluate(() => { window.validerMouvement = async () => { window.APPELS.push(["validerDirect"]); }; });
  await p.evaluate(() => window.actionBoutonFinTour());
  const appels = await p.evaluate(() => window.APPELS);
  verifier("le clic valide le déplacement", appels.some(a => a[0] === "validerDirect"), JSON.stringify(appels));
}

// =========================================================================
console.log("\n4. ANNULER LE DÉPLACEMENT PAR LA CROIX");
// =========================================================================
{
  await p.evaluate(() => {
    window.CHEMIN_MOUVEMENT = [{ q: 1, r: 0, cost: 2 }];
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
  });
  await p.evaluate(() => document.querySelector("#token-H1 .croix-annuler-deplacement").click());
  await p.waitForTimeout(50);

  const cheminVide = await p.evaluate(() => window.CHEMIN_MOUVEMENT.length === 0);
  verifier("la croix vide le chemin (annulerMouvement)", cheminVide);
  const croixPartie = await p.evaluate(() => !document.querySelector("#token-H1 .croix-annuler-deplacement"));
  verifier("la croix elle-même disparaît", croixPartie);

  // La carte n'a jamais été jouée : elle attend toujours. Le bouton retombe
  // donc sur « choisir compétence », pas sur « fin de tour » — il y a encore
  // quelque chose à faire ce tour-ci.
  let e = await etatBouton();
  verifier("la carte encore en attente reprend la main (« choisir compétence »)",
           e.mode === "choisir_competence", `(${e.mode})`);

  // Sans carte du tout à ce stade, en revanche, on retombe bien sur « fin de
  // tour » — avec le visage REPRIS (IMG_2124) : on a touché au déplacement
  // avant d'y renoncer, ce n'est plus un tour vierge.
  await p.evaluate(() => { window.PARTIE_DATA.File_Attente_Combat[0].idCarte = null; window.actualiserBoutonFinTour(); });
  e = await etatBouton();
  verifier("sans carte en attente, on tombe bien sur « fin de tour »", e.mode === "fin_de_tour", `(${e.mode})`);
  verifier("… avec le visage REPRIS (IMG_2124), puisqu'on a touché au déplacement",
           e.src.includes("IMG_2124"), e.src);
  await p.evaluate(() => { window.PARTIE_DATA.File_Attente_Combat[0].idCarte = "C1"; window.actualiserBoutonFinTour(); });
}

// =========================================================================
console.log("\n5. LE CIBLAGE (hors zone) EST ACTIF : « LANCER »");
// =========================================================================
{
  await p.evaluate(() => {
    window.ETAT_CIBLAGE = { actif: true, isZone: false, cibleUnique: null, attaques: [], alterations: [] };
    window.actualiserBoutonFinTour();
  });
  const e = await etatBouton();
  verifier("le mode est « lancer »", e.mode === "lancer", `(${e.mode})`);
  verifier("l'image est IMG_2132", e.src.includes("IMG_2132"), e.src);
}

// =========================================================================
console.log("\n6. UNE CIBLE EST CHOISIE : CLIQUER LANCE LA COMPÉTENCE");
// =========================================================================
{
  await p.evaluate(() => {
    window.ETAT_CIBLAGE.cibleUnique = "J2";
    window.declencherResolutionAvecBondEventuel = async () => { window.APPELS.push(["lancerDirect"]); };
    window.nettoyerCiblage = async () => { window.APPELS.push(["nettoyerDirect"]); };
    window.APPELS = [];
  });
  await p.evaluate(() => window.actionBoutonFinTour());
  const appels = await p.evaluate(() => window.APPELS);
  verifier("declencherResolutionAvecBondEventuel est appelé", appels.some(a => a[0] === "lancerDirect"), JSON.stringify(appels));
  verifier("nettoyerCiblage n'est PAS appelé (ce n'est pas une annulation)",
           !appels.some(a => a[0] === "nettoyerDirect"));
}

// =========================================================================
console.log("\n7. AUCUNE CIBLE CHOISIE : CLIQUER RENONCE, SANS DÉPENSER D'ÉNERGIE");
// =========================================================================
{
  await p.evaluate(() => {
    window.ETAT_CIBLAGE = { actif: true, isZone: false, cibleUnique: null, attaques: [{ cibles: [] }], alterations: [] };
    window.COUT_COMPETENCE_SELECTIONNEE = 30;
    window.finDeTourCombat = async () => { window.APPELS.push(["finTourAnnulation"]); };
    window.APPELS = [];
    window.actualiserBoutonFinTour();
  });
  await p.evaluate(() => window.actionBoutonFinTour());
  const res = await p.evaluate(() => ({ appels: window.APPELS, cout: window.COUT_COMPETENCE_SELECTIONNEE }));
  verifier("le ciblage est nettoyé", res.appels.some(a => a[0] === "nettoyerDirect"), JSON.stringify(res.appels));
  verifier("le tour se termine", res.appels.some(a => a[0] === "finTourAnnulation"), JSON.stringify(res.appels));
  verifier("ni lancerDirect (aucune carte envoyée) : l'énergie n'a jamais été dépensée",
           !res.appels.some(a => a[0] === "lancerDirect"));
  verifier("le coût affiché retombe à zéro", res.cout === 0, `(${res.cout})`);
}

// =========================================================================
console.log("\n8. LA GARDE ANTI-DOUBLE-CLIC : UNE DEMANDE DÉJÀ EN VOL EST IGNORÉE");
// =========================================================================
{
  await p.evaluate(() => {
    window.ETAT_CIBLAGE = { actif: true, isZone: false, cibleUnique: "J2", attaques: [], alterations: [] };
    window.regimeDemande.enVol = () => true;
    window.declencherResolutionAvecBondEventuel = async () => { window.APPELS.push(["neDoitPasArriver"]); };
    window.APPELS = [];
    window.actualiserBoutonFinTour();
  });
  await p.evaluate(() => window.actionBoutonFinTour());
  const appels = await p.evaluate(() => window.APPELS);
  verifier("le clic est ignoré pendant qu'une demande est en vol", appels.length === 0, JSON.stringify(appels));
  await p.evaluate(() => { window.regimeDemande.enVol = () => false; });
}

// =========================================================================
console.log("\n9. LES ANCIENS ÉLÉMENTS FLOTTANTS ONT DISPARU");
// =========================================================================
{
  const restes = await p.evaluate(() => ({
    bulleMouvement: !!document.getElementById("bulle-validation-mouvement"),
    btnAppliquer: !!document.getElementById("btn-appliquer-carte"),
    btnResoudre: !!document.getElementById("btn-resoudre-carte"),
    btnAnnulerCiblage: !!document.getElementById("btn-annuler-ciblage"),
    bulleZone: document.getElementById("bulle-validation-zone")   // celle-ci, en revanche, doit pouvoir exister
  }));
  verifier("la bulle de déplacement n'existe plus", !restes.bulleMouvement);
  verifier("le bouton Appliquer n'existe plus", !restes.btnAppliquer);
  verifier("le bouton Résoudre n'existe plus", !restes.btnResoudre);
  verifier("le bouton Annuler (ciblage) n'existe plus", !restes.btnAnnulerCiblage);
}

verifier("aucune erreur JS pendant toute la séance", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

await b.close();
serveur.close();

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
