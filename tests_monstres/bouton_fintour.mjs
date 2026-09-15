// LE BOUTON FIN DE TOUR, DEVENU CINQ BOUTONS EN UN.
//
// Refonte UI combat, étape 1 : ce bouton unique porte toujours l'action
// principale du moment, et son image dit laquelle.
//
//   éteint (IMG_2134) .......... ce n'est pas à nous de jouer ;
//   choisir compétence (2131) .. en préparation, retenir la carte affichée
//                                pour cette manche ;
//   valider déplacement (2130) . confirmer le chemin tracé (l'annuler passe
//                                par la croix sous le pion) ;
//   lancer (2132) .............. à notre tour, on ne se déplace plus : on
//                                part sur le ciblage de sa carte ;
//   fin de tour (2124) ......... pendant le ciblage, ou quand il n'y a rien
//                                à lancer : finir sans dépenser sa carte.
//
// Ce banc sert la vraie page en HTTP (les modules ES refusent file://,
// exactement comme demarrage_reel.mjs), et vérifie sur le vrai code :
//   • les cinq images, dans les situations où elles doivent apparaître ;
//   • que le clic déclenche exactement la bonne fonction selon l'état ;
//   • que finir son tour pendant un ciblage ne dépense pas la carte ;
//   • la garde contre le double-clic pendant l'aller-retour réseau ;
//   • que la croix d'annulation du déplacement vit sous le pion, et que la
//     bulle de validation de déplacement a bien disparu.
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
//  LE MONDE MINIMAL : un héros seul, une créature en face.
// =========================================================================
const monde = () => p.evaluate(() => {
  document.getElementById("fenetre-combat").style.display = "block";

  window.jouerSonClic = () => {};
  window.estCombattantMort = () => false;
  window.estMonstre = (id) => String(id).startsWith("M");
  window.sequenceTourEnAttente = () => false;
  window.IA_DERNIER_SIGNE = 0;

  window.PLATEAU_VTT = {
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    hexToPixel: (q, r) => ({ x: q * 60, y: r * 60 }),
    renderMap: () => {}
  };
  window.PERSOS_PARTIE = [
    { idPersonnage: "H1", camp: "Allié", prenom: "Nico", PV_Actuels: 60, PV_Max: 60, Etats_Alteres: [] },
    { idPersonnage: "M1", camp: "Ennemi", prenom: "Gnoll", estMonstre: true, PV_Actuels: 40, PV_Max: 40, Etats_Alteres: [] }
  ];
  window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, M1: { q: 2, r: 0 } };
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

  window.PARTIE_DATA = {
    Phase_Combat: "Preparation",
    File_Attente_Combat: []
  };
  window.CHEMIN_MOUVEMENT = [];
  window.ETAT_CIBLAGE = null;
  window.CARTE_APERCU = null;

  window.actualiserBoutonFinTour();
});

const etatBouton = () => p.evaluate(() => ({
  src: document.getElementById("img-hud-fintour").src,
  mode: window.MODE_BOUTON_FINTOUR,
  actionnable: window.PEUT_PASSER_TOUR
}));

await monde();

// =========================================================================
console.log("\n1. PRÉPARATION : ÉTEINT TANT QU'AUCUNE CARTE N'EST OUVERTE");
// =========================================================================
{
  const e = await etatBouton();
  verifier("le mode est « éteint »", e.mode === "eteint", `(${e.mode})`);
  verifier("l'image est IMG_2134", e.src.includes("IMG_2134"), e.src);
  verifier("et le bouton ne fait rien", e.actionnable === false);

  await p.evaluate(() => { window.jouerCarteCombat = async (id) => { window.APPELS.push(["choisirDirect", id]); }; });
  await p.evaluate(() => window.actionBoutonFinTour());
  const appels = await p.evaluate(() => window.APPELS);
  verifier("cliquer dessus ne déclenche rien", appels.length === 0, JSON.stringify(appels));
}

// =========================================================================
console.log("\n2. PRÉPARATION : UNE CARTE OUVERTE EN GRAND SE CHOISIT PAR CE BOUTON");
// =========================================================================
{
  await p.evaluate(() => {
    window.CARTE_APERCU = { idCarte: "C1", choisissable: true };
    window.APPELS = [];
    window.actualiserBoutonFinTour();
  });
  const e = await etatBouton();
  verifier("le mode est « choisir compétence »", e.mode === "choisir_competence", `(${e.mode})`);
  verifier("l'image est IMG_2131", e.src.includes("IMG_2131"), e.src);

  await p.evaluate(() => window.actionBoutonFinTour());
  const appels = await p.evaluate(() => window.APPELS);
  verifier("le clic retient la carte pour la manche (jouerCarteCombat)",
           appels.some(a => a[0] === "choisirDirect" && a[1] === "C1"), JSON.stringify(appels));

  // Une carte qu'on ne peut pas retenir (énergie insuffisante, arme
  // incompatible : c'est afficherApercuCarteHD qui en juge) n'allume rien.
  await p.evaluate(() => {
    window.CARTE_APERCU = { idCarte: "C1", choisissable: false };
    window.actualiserBoutonFinTour();
  });
  const eBloque = await etatBouton();
  verifier("une carte non retenable laisse le bouton éteint",
           eBloque.mode === "eteint" && eBloque.actionnable === false, `(${eBloque.mode})`);
}

// =========================================================================
console.log("\n3. RÉSOLUTION, LE TOUR D'UN AUTRE : LE BOUTON RESTE ÉTEINT");
// =========================================================================
{
  await p.evaluate(() => {
    window.CARTE_APERCU = null;
    window.PARTIE_DATA = { Phase_Combat: "Resolution",
      File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "CM" }, { idPersonnage: "H1", idCarte: "C1" }] };
    window.IA_DERNIER_SIGNE = Date.now();
    window.APPELS = [];
    window.actualiserBoutonFinTour();
  });
  const e = await etatBouton();
  verifier("au tour de la créature, le bouton est éteint", e.mode === "eteint", `(${e.mode})`);
  verifier("l'image est IMG_2134", e.src.includes("IMG_2134"), e.src);
}

// =========================================================================
console.log("\n4. NOTRE TOUR : « LANCER », TANT QU'ON N'A PAS COMMENCÉ À VISER");
// =========================================================================
{
  await p.evaluate(() => {
    window.PARTIE_DATA = { Phase_Combat: "Resolution",
      File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C1" }] };
    window.APPELS = [];
    window.actualiserBoutonFinTour();
  });
  const e = await etatBouton();
  verifier("le mode est « lancer »", e.mode === "lancer", `(${e.mode})`);
  verifier("l'image est IMG_2132", e.src.includes("IMG_2132"), e.src);

  await p.evaluate(() => { window.demarrerCiblage = async (id) => { window.APPELS.push(["ciblageDirect", id]); }; });
  await p.evaluate(() => window.actionBoutonFinTour());
  const appels = await p.evaluate(() => window.APPELS);
  verifier("le clic démarre le ciblage de la carte retenue",
           appels.some(a => a[0] === "ciblageDirect" && a[1] === "C1"), JSON.stringify(appels));
}

// =========================================================================
console.log("\n5. UN DÉPLACEMENT SE TRACE : « VALIDER », ET LA CROIX SOUS LE PION");
// =========================================================================
{
  await p.evaluate(() => {
    window.CHEMIN_MOUVEMENT = [{ q: 1, r: 0, cost: 2 }];
    window.APPELS = [];
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    window.actualiserBoutonFinTour();
  });
  const e = await etatBouton();
  verifier("le mode est « valider déplacement »", e.mode === "valider_deplacement", `(${e.mode})`);
  verifier("l'image est IMG_2130", e.src.includes("IMG_2130"), e.src);

  const croix = await p.evaluate(() => !!document.querySelector("#token-H1 .croix-annuler-deplacement"));
  verifier("la croix d'annulation apparaît sous le pion", croix);

  await p.evaluate(() => { window.validerMouvement = async () => { window.APPELS.push(["validerDirect"]); }; });
  await p.evaluate(() => window.actionBoutonFinTour());
  const appels = await p.evaluate(() => window.APPELS);
  verifier("le clic valide le déplacement", appels.some(a => a[0] === "validerDirect"), JSON.stringify(appels));
}

// =========================================================================
console.log("\n6. ANNULER LE DÉPLACEMENT PAR LA CROIX : RETOUR À « LANCER »");
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

  const e = await etatBouton();
  verifier("la carte attend toujours : on repasse sur « lancer »", e.mode === "lancer", `(${e.mode})`);
}

// =========================================================================
console.log("\n7. PENDANT LE CIBLAGE : « FIN DE TOUR », SANS DÉPENSER SA CARTE");
// =========================================================================
{
  await p.evaluate(() => {
    window.ETAT_CIBLAGE = { actif: true, isZone: false, cibleUnique: null, attaques: [], alterations: [] };
    window.COUT_COMPETENCE_SELECTIONNEE = 30;
    window.APPELS = [];
    window.nettoyerCiblage = () => { window.APPELS.push(["nettoyerDirect"]); window.ETAT_CIBLAGE.actif = false; };
    window.finDeTourCombat = async () => { window.APPELS.push(["finTourDirect"]); };
    window.declencherResolutionAvecBondEventuel = async () => { window.APPELS.push(["lancerCarte"]); };
    window.actualiserBoutonFinTour();
  });
  const e = await etatBouton();
  verifier("le mode est « fin de tour »", e.mode === "fin_de_tour", `(${e.mode})`);
  verifier("l'image est IMG_2124", e.src.includes("IMG_2124"), e.src);

  await p.evaluate(() => window.actionBoutonFinTour());
  const res = await p.evaluate(() => ({ appels: window.APPELS, cout: window.COUT_COMPETENCE_SELECTIONNEE }));
  verifier("le ciblage se referme", res.appels.some(a => a[0] === "nettoyerDirect"), JSON.stringify(res.appels));
  verifier("le tour se termine", res.appels.some(a => a[0] === "finTourDirect"), JSON.stringify(res.appels));
  verifier("aucune carte n'est envoyée au cerveau : rien n'est dépensé",
           !res.appels.some(a => a[0] === "lancerCarte"));
  verifier("le coût réservé retombe à zéro", res.cout === 0, `(${res.cout})`);
}

// =========================================================================
console.log("\n8. RIEN À LANCER (repos long) : « FIN DE TOUR » AUSSI");
// =========================================================================
{
  await p.evaluate(() => {
    window.ETAT_CIBLAGE = null;
    window.PARTIE_DATA = { Phase_Combat: "Resolution",
      File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "REPOS_LONG" }] };
    window.APPELS = [];
    window.actualiserBoutonFinTour();
  });
  const e = await etatBouton();
  verifier("le mode est « fin de tour »", e.mode === "fin_de_tour", `(${e.mode})`);
  verifier("l'image est IMG_2124", e.src.includes("IMG_2124"), e.src);
  await p.evaluate(() => window.actionBoutonFinTour());
  const appels = await p.evaluate(() => window.APPELS);
  verifier("le clic finit le tour", appels.some(a => a[0] === "finTourDirect"), JSON.stringify(appels));
}

// =========================================================================
console.log("\n9. LA GARDE ANTI-DOUBLE-CLIC : UNE DEMANDE DÉJÀ EN VOL EST IGNORÉE");
// =========================================================================
{
  await p.evaluate(() => {
    window.PARTIE_DATA = { Phase_Combat: "Resolution",
      File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C1" }] };
    window.regimeDemande.enVol = () => true;
    window.APPELS = [];
    window.actualiserBoutonFinTour();
  });
  await p.evaluate(() => window.actionBoutonFinTour());
  const appels = await p.evaluate(() => window.APPELS);
  verifier("le clic est ignoré pendant qu'une demande est en vol", appels.length === 0, JSON.stringify(appels));
  await p.evaluate(() => { window.regimeDemande.enVol = () => false; });
}

// =========================================================================
console.log("\n10. LA BULLE DE VALIDATION DE DÉPLACEMENT A DISPARU");
// =========================================================================
{
  const restes = await p.evaluate(() => ({
    bulleMouvement: !!document.getElementById("bulle-validation-mouvement"),
    btnAppliquer: !!document.getElementById("btn-appliquer-carte"),
    btnChoisir: !!document.getElementById("btn-choisir-action")
  }));
  verifier("la bulle de déplacement n'existe plus", !restes.bulleMouvement);
  verifier("l'ancien bouton Appliquer n'existe plus", !restes.btnAppliquer);
  verifier("l'ancien bouton Choisir n'existe plus", !restes.btnChoisir);
}

verifier("aucune erreur JS pendant toute la séance", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

await b.close();
serveur.close();

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
