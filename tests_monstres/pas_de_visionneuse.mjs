// IL N'Y A PLUS DE VISIONNEUSE — ET IL NE DOIT PLUS JAMAIS Y EN AVOIR.
//
// Signalé en partie, trois fois, sous trois visages : « quand je clique sur
// valider compétence elle ne se lance pas », « le bouton fin de tour est
// éteint », « on ne peut plus démarrer le combat ». Le geste coupable n'avait
// rien à voir avec le bouton : il suffisait d'avoir cliqué, avant, sur le
// PORTRAIT D'UN ENNEMI — dans la piste d'initiative ou sur un pion du plateau —
// pour voir de qui il s'agissait.
//
// afficherDansPanneauGauche installait alors ce combattant dans le panneau
// latéral gauche, et pour cela REMPLAÇAIT window.COMBAT_PERSOS_JOUEUR par
// [lui]. Or sept endroits du moteur lisaient ce tableau pour savoir QUI JOUE :
//   · actualiserBoutonFinTour comparait la tête de file au combattant affiché —
//     donc « ce n'est pas ton tour », bouton éteint, clic sans effet ;
//   · les anneaux de ciblage, les portées, les cibles et la résolution
//     mesuraient tout depuis la case du combattant affiché.
// Consulter la fiche d'un ennemi désarmait le tour.
//
// LE PANNEAU A ÉTÉ SUPPRIMÉ EN ENTIER, visionneuse comprise. Ce banc, qui
// prouvait que le moteur savait se défendre contre elle, prouve maintenant
// qu'elle n'existe plus : COMBAT_PERSOS_JOUEUR reste les héros de ce poste quoi
// qu'on clique, et les deux autorités répondent seules —
//   · QUI JOUE ? la file d'initiative ;
//   · QUI LANCE CE CIBLAGE ? le ciblage lui-même, qui retient son lanceur à
//     l'ouverture (window.lanceurDuCiblage).
import fs from 'fs';
import http from 'http';
import path from 'path';

const EFFETS = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/effets_reels.json', 'utf-8'));

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

await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

// Deux cartes réelles : l'une frappe au contact, l'autre porte un mod Distance.
// Le porteur tient un ARC : son arme donne de la portée à tout ce qu'il lance.
const preparer = () => p.evaluate((EFFETS) => {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.getElementById("fenetre-combat").style.display = "block";
  window.EFFETS_BDD_CACHE = EFFETS;
  window.jouerSonClic = () => {};
  window.estCombattantMort = () => false;
  window.estMonstre = (id) => String(id).startsWith("M");
  window.PLATEAU_VTT = { getCaseState: () => ({}), hexToPixel: (q, r) => ({ x: 300 + q * 60, y: 300 + r * 60 }),
                         pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {} };
  window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
  window.PERSOS_PARTIE = [
    { idPersonnage: "H1", camp: "Allié", prenom: "Cybile", PV_Max: 60, PV_Actuels: 60,
      Fatigue_Max: 110, fatigueActuelle: 110, Etats_Alteres: [], statut: "Vivant" },
    { idPersonnage: "M1", camp: "Ennemi", estMonstre: true, prenom: "Gnoll",
      PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }
  ];
  window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } };
  window.TOKEN_SELECTIONNE = "H1";
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
  window.COMBAT_INDEX_PERSO = 0;
  window.REGIME_CERVEAU = true;

  // L'ARC EN MAIN : c'est lui qui rendait tout « à distance ».
  window.bonusEquip = (perso, cle) => (cle === "portee" ? 1 : 0);

  const carte = (nom, fatigue, actions) => ({
    Nom: nom, Arme: "Arme légère Distance", Fatigue: fatigue, Initiative: 20,
    Effets_Compiles: [], Composants: { actions }
  });
  window.COMPETENCES_CACHE = {
    C_CAC: carte("Coup de roc", 25, [
      { baseEffetId: "EFF_ATTAQUE_LOURDE", count: 1, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }
    ]),
    C_TIR: carte("Trait perçant", 30, [
      { baseEffetId: "EFF_ATTAQUE_LEGERE", count: 1,
        mods: { EFF_DISTANCE: 2 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }
    ])
  };
  window.CACHE_COMPETENCES_GLOBAL = { H1: window.COMPETENCES_CACHE };
  window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1,
    File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C_CAC", initiative: 20 }] };
  window.CHEMIN_MOUVEMENT = [];
  window.ZONES_PERSISTANTES = {};

  // Les identifiants réels des effets, retrouvés par leur nom.
  const parNom = {};
  Object.entries(EFFETS).forEach(([id, e]) => { parNom[(e.Nom || "").toLowerCase()] = id; });
  return parNom;
}, EFFETS);


const noms = await preparer();
const idAttaque = noms["attaque lourde"];
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));

// Un vrai tour : c'est à H1 de jouer, sa carte est retenue, la créature suit.
const monTour = () => p.evaluate((idAttaque) => {
  window.COMPETENCES_CACHE.C_CAC.Composants.actions[0].baseEffetId = idAttaque;
  window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1,
    Ordre_Initiative: ["H1", "M1"],
    File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C_CAC", initiative: 20 },
                          { idPersonnage: "M1", idCarte: "C_M1", initiative: 10 }] };
  // CE POSTE EST CELUI DE H1. estMonHerosCombat compare l'idJoueur de la fiche
  // au poste courant : sans ça, aucun tour n'est « le mien » et le banc
  // testerait autre chose que ce qu'il annonce.
  try { localStorage.setItem("ID_JOUEUR_COURANT", "P_01"); } catch (e) {}
  window.PERSOS_PARTIE[0].idJoueur = "P_01";
  window.APPELS = [];
  window.regimeDemande = { actif: () => true, enVol: () => false,
    carte: async (a, c) => window.APPELS.push({ quoi: "carte", acteur: a, idCarte: c.idCarte, cout: c.coutFatigue }),
    finDeTour: async (a) => window.APPELS.push({ quoi: "finDeTour", acteur: a }),
    mouvement: async () => {} };
  window.afficherPisteInitiative(window.PARTIE_DATA.File_Attente_Combat, "Resolution");
  window.actualiserBoutonFinTour();
}, idAttaque);

const etat = () => p.evaluate(() => ({
  mode: window.MODE_BOUTON_FINTOUR,
  peut: window.PEUT_PASSER_TOUR,
  suivi: (window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO] || {}).idPersonnage,
  combattantsSuivis: (window.COMBAT_PERSOS_JOUEUR || []).map(h => h && h.idPersonnage),
  ciblage: !!(window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif),
  lanceurCiblage: window.ETAT_CIBLAGE ? window.ETAT_CIBLAGE.idLanceur : null,
  lanceurLu: window.lanceurDuCiblage(),
  appels: window.APPELS
}));

console.log("\n=========================================================");
console.log("  1. LE DÉCOR : C'EST MON TOUR, LE BOUTON DIT « LANCER »");
console.log("=========================================================");
await monTour();
await p.waitForTimeout(300);
{
  const e = await etat();
  verifier("le bouton est sur « lancer »", e.mode === "lancer", e.mode);
  verifier("et ce poste suit bien mon héros", e.suivi === "H1", String(e.suivi));
}

console.log("\n=========================================================");
console.log("  2. JE CLIQUE SUR LE PORTRAIT DE L'ENNEMI — RIEN NE BASCULE");
console.log("=========================================================");
{
  // LE GESTE EXACT QUI DÉSARMAIT LE TOUR : un clic sur le portrait de la
  // créature dans la piste. Il n'installe plus rien nulle part.
  await p.evaluate(() => document.querySelector('.piste-tuile[data-id="M1"]').click());
  await p.waitForTimeout(300);
  let e = await etat();
  verifier("CE POSTE SUIT TOUJOURS MON HÉROS", e.suivi === "H1", String(e.suivi));
  verifier("et sa liste de héros est intacte",
           JSON.stringify(e.combattantsSuivis) === JSON.stringify(["H1"]),
           JSON.stringify(e.combattantsSuivis));
  verifier("le bouton reste sur « lancer »", e.mode === "lancer", e.mode);
  verifier("et il reste actionnable", e.peut === true);

  await p.evaluate(() => document.getElementById("btn-hud-fintour").click());
  await p.waitForTimeout(600);
  e = await etat();
  verifier("LE CLIC OUVRE VRAIMENT LE CIBLAGE", e.ciblage === true);
  verifier("le ciblage retient MON héros comme lanceur", e.lanceurCiblage === "H1", String(e.lanceurCiblage));
  verifier("et c'est lui que tout le moteur lira", e.lanceurLu === "H1", String(e.lanceurLu));
  verifier("le bouton offre désormais la sortie « fin de tour »", e.mode === "fin_de_tour", e.mode);
}

console.log("\n=========================================================");
console.log("  3. LES ANNEAUX PARTENT DE MOI, PAS DE CELUI QUE JE REGARDE");
console.log("=========================================================");
{
  const anneaux = await p.evaluate(() => document.querySelectorAll(".anneau-ciblage").length);
  verifier("des anneaux sont dessinés", anneaux > 0, String(anneaux));
  // La portée se mesure depuis la case du lanceur : si elle se mesurait depuis
  // la créature (case voisine de la sienne), la cible à portée ne serait pas la
  // même. On vérifie que la créature elle-même est visable depuis H1.
  const visable = await p.evaluate(() => {
    const t = document.getElementById("token-M1");
    return !!(t && t.querySelector(".anneau-ciblage"));
  });
  verifier("la créature est visable depuis la case de mon héros", visable === true);
}

console.log("\n=========================================================");
console.log("  4. RÉSOUDRE ENVOIE LA CARTE À MON NOM");
console.log("=========================================================");
{
  await p.evaluate(() => { const t = document.getElementById("token-M1"); if (t) t.click(); });
  await p.waitForTimeout(300);
  await p.evaluate(() => { const b = document.getElementById("btn-resoudre-carte"); if (b) b.click(); });
  await p.waitForTimeout(800);
  const e = await etat();
  const carte = e.appels.find(a => a.quoi === "carte");
  verifier("une carte est partie au cerveau", !!carte, JSON.stringify(e.appels));
  verifier("AU NOM DE MON HÉROS, celui que la file désigne",
           !!carte && carte.acteur === "H1", carte ? String(carte.acteur) : "—");
  verifier("c'est bien la carte retenue dans la file",
           !!carte && carte.idCarte === "C_CAC", carte ? String(carte.idCarte) : "—");
  verifier("et elle emporte son coût en énergie",
           !!carte && carte.cout === 25, carte ? String(carte.cout) : "—");
}

console.log("\n=========================================================");
console.log("  5. ET LE TOUR D'UNE CRÉATURE RESTE À L'IA");
console.log("=========================================================");
{
  // La garde d'origine tenait à « le panneau montre une créature ». Elle a été
  // retirée : c'est la TÊTE DE FILE qui doit décider, et elle seule.
  const e = await p.evaluate(() => {
    window.nettoyerCiblage();
    window.PARTIE_DATA.File_Attente_Combat = [{ idPersonnage: "M1", idCarte: "C_M1", initiative: 10 }];
    window.IA_DERNIER_SIGNE = Date.now();
    window.actualiserBoutonFinTour();
    return { mode: window.MODE_BOUTON_FINTOUR, peut: window.PEUT_PASSER_TOUR };
  });
  verifier("créature en tête : le bouton s'éteint", e.mode === "eteint", e.mode);
  verifier("et il n'est pas actionnable", e.peut === false);
}

console.log("\n=========================================================");
console.log("  6. EN PRÉPARATION : CHOISIR SA CARTE");
console.log("=========================================================");
// LE BLOCAGE LE PLUS DUR : le combat ne pouvait même plus commencer. La carte
// s'affichait bien, mais « choisir compétence » restait mort — parce que
// competences.js demandait au PANNEAU si la carte était celle d'une créature.
// À la table, trois minutes d'attente, jusqu'à ce que l'IA renonce à attendre
// les joueurs et engage les créatures toute seule. La question « à qui est
// cette carte ? » se pose maintenant au cache des decks, qui la sait vraiment.
{
  const r = await p.evaluate(() => {
    window.nettoyerCiblage();
    window.PARTIE_DATA = { Phase_Combat: "Preparation", Tour_Combat: 1,
                           Ordre_Initiative: ["H1", "M1"], File_Attente_Combat: [] };
    window.COMBAT_FATIGUE_ACTUELLE = 110;
    window.MOUVEMENT_COUT_TOTAL = 0;
    window.APPELS = [];
    window.jouerCarteCombat = async (id) => {
      // On rejoue la vraie question que se pose jouerCarteCombat : pour QUI ?
      const pour = window.herosPourCarte(id);
      window.APPELS.push({ quoi: "choisir", idCarte: id, pour: pour && pour.idPersonnage });
    };
    // Le cache global sait à qui appartient chaque technique : C_CAC est à moi.
    window.CACHE_COMPETENCES_GLOBAL = { H1: { C_CAC: window.COMPETENCES_CACHE.C_CAC } };

    // LE DÉCOR DU BUG D'ORIGINE : on vient de cliquer le portrait de la créature,
    // et le deck affiché est le mien.
    const tuileM1 = document.querySelector('.piste-tuile[data-id="M1"]');
    if (tuileM1) tuileM1.click();
    window.CARTE_EN_APERCU = null;
    window.afficherApercuCarteHD("C_CAC");
    window.actualiserBoutonFinTour();
    return {
      suivi: (window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO] || {}).idPersonnage,
      apercu: window.CARTE_APERCU,
      mode: window.MODE_BOUTON_FINTOUR
    };
  });
  verifier("le poste suit toujours mon héros", r.suivi === "H1", String(r.suivi));
  verifier("la carte est bien prévisualisée", !!r.apercu && r.apercu.idCarte === "C_CAC",
           JSON.stringify(r.apercu));
  verifier("ELLE RESTE CHOISISSABLE : c'est MA carte", !!r.apercu && r.apercu.choisissable === true,
           JSON.stringify(r.apercu));
  verifier("et le bouton le propose", r.mode === "choisir_competence", r.mode);

  const apres = await p.evaluate(async () => {
    document.getElementById("btn-hud-fintour").click();
    await new Promise(r => setTimeout(r, 200));
    return window.APPELS;
  });
  verifier("LE CLIC RETIENT LA CARTE", apres.length === 1, JSON.stringify(apres));
  verifier("et il la retient POUR MON HÉROS",
           apres.length === 1 && apres[0].pour === "H1", JSON.stringify(apres));
}

console.log("\n=========================================================");
console.log("  7. MAIS LA CARTE D'UNE CRÉATURE RESTE INJOUABLE");
console.log("=========================================================");
{
  const r = await p.evaluate(async () => {
    window.COMPETENCES_CACHE.C_M1 = JSON.parse(JSON.stringify(window.COMPETENCES_CACHE.C_CAC));
    window.COMPETENCES_CACHE.C_M1.Nom = "Cataclysme putride";
    window.CACHE_COMPETENCES_GLOBAL = { H1: { C_CAC: window.COMPETENCES_CACHE.C_CAC },
                                        M1: { C_M1: window.COMPETENCES_CACHE.C_M1 } };
    window.CARTE_EN_APERCU = null;
    window.afficherApercuCarteHD("C_M1");
    // Changer de carte alors qu'un aperçu est ouvert passe par un fondu de
    // 300 ms : lire tout de suite, c'est lire la carte d'avant.
    await new Promise(r => setTimeout(r, 600));
    window.actualiserBoutonFinTour();
    return { apercu: window.CARTE_APERCU, mode: window.MODE_BOUTON_FINTOUR };
  });
  verifier("la technique d'une créature n'est pas choisissable",
           !!r.apercu && r.apercu.choisissable === false, JSON.stringify(r.apercu));
  verifier("et le bouton reste éteint", r.mode === "eteint", r.mode);
}

verifier("aucune erreur JavaScript pendant tout le banc", erreurs.length === 0, erreurs.slice(0, 2).join(" | "));

await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
