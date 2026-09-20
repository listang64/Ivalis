// DEUX RÈGLES QUI S'ÉTAIENT DÉCROCHÉES DE LEUR SOURCE
//
// 1. LE COÛT EN ÉNERGIE D'UNE CARTE.
//    Il était lu dans window.COUT_COMPETENCE_SELECTIONNEE, une globale posée
//    par le clic sur la bannière d'une carte. Ça tenait tant que le ciblage
//    démarrait par « Appliquer », posé SUR la carte qu'on venait de cliquer :
//    les deux gestes se suivaient. Depuis que la carte part du bouton fin de
//    tour, en pleine résolution, il s'écoule toute une phase de préparation
//    entre les deux — et finDeTourCombat remet cette globale à zéro à chaque
//    tour clos. Le cerveau recevait donc « coutFatigue: 0 » : signalé en
//    partie, « mes attaques ne réduisent plus la jauge de fatigue ».
//
// 2. UNE CARTE QUI NE DISAIT PAS SA PORTÉE.
//    Une arme à distance — fronde, arc — donne une portée de base à CHAQUE
//    technique de son porteur : une carte écrite au corps à corps devient un
//    tir, atteint plus loin, et perd trente pour cent au contact. La règle est
//    juste (j'ai cru un instant l'inverse et je me suis trompé). Ce qui manquait
//    est ailleurs : la carte n'en disait pas un mot tant que le joueur n'avait
//    pas posé d'effet « Distance » dessus. On lisait « attaque lourde, 10 dégâts
//    physiques » sur une technique qui tirait à deux cases et encaissait le
//    malus. Signalé en partie : « la distance doit apparaître dans les
//    compétences même si le joueur n'en met aucune ».
//
// Les deux se vérifient sur le VRAI code : l'extraction de carte de
// moteur_effets.js dans un navigateur, et chaineDeDegats importée telle quelle.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { chaineDeDegats } from '../moteur_pur.js';

const EFFETS = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/effets_reels.json', 'utf-8'));

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

console.log("\n=========================================================");
console.log("  1. LE NOYAU : LE MALUS DE TIR À BOUT PORTANT");
console.log("=========================================================");
{
  const cible = { pv: 100, pvMax: 100, bouclier: 0, etats: [], def: {}, mod: {} };
  const nu = (a) => chaineDeDegats(cible, a, { distance: 1 }).degats;

  verifier("une attaque à distance perd 30 % au contact",
           nu({ valeurBrute: 10, isRanged: true }) === 7,
           `(${nu({ valeurBrute: 10, isRanged: true })})`);
  verifier("une attaque de contact n'en perd rien",
           nu({ valeurBrute: 10, isRanged: false }) === 10);
  verifier("et à distance, le tir ne perd rien",
           chaineDeDegats(cible, { valeurBrute: 10, isRanged: true },
                          { distance: 3 }).degats === 10);
}

// =========================================================================
//  LA VRAIE EXTRACTION DE CARTE, DANS UN NAVIGATEUR
// =========================================================================
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
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));

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
const idAttaque = noms["attaque lourde"] || noms["attaque légère"] || noms["attaque legere"];
const idDistance = noms["distance"];

console.log("\n=========================================================");
console.log("  2. L'EXTRACTION RÉELLE, ARC EN MAIN");
console.log("=========================================================");

const extraire = (idCarte) => p.evaluate(async (idCarte) =>
  await window.demarrerCiblage(idCarte, { extraire: true, idLanceur: "H1" }), idCarte);

if (!idAttaque || !idDistance) {
  console.log("  (effets réels introuvables dans effets_reels.json — section passée)");
} else {
  await p.evaluate(({ idAttaque, idDistance }) => {
    window.COMPETENCES_CACHE.C_CAC.Composants.actions[0].baseEffetId = idAttaque;
    window.COMPETENCES_CACHE.C_TIR.Composants.actions[0].baseEffetId = idAttaque;
    window.COMPETENCES_CACHE.C_TIR.Composants.actions[0].mods = { [idDistance]: 2 };
  }, { idAttaque, idDistance });

  const cac = await extraire("C_CAC");
  const tir = await extraire("C_TIR");

  verifier("la carte de corps à corps porte bien une attaque",
           !!cac && (cac.attaques || []).length > 0, JSON.stringify((cac || {}).attaques || []).slice(0, 120));
  verifier("L'ARC LA REND TIRABLE : c'est la règle, et elle est juste",
           !!cac && cac.attaques[0].isRanged === true);
  verifier("sa portée dépasse donc la case voisine",
           !!cac && cac.attaques[0].rangeMax > 1, String(((cac||{}).attaques||[{}])[0].rangeMax));
  verifier("la carte à distance porte la sienne, plus longue",
           !!tir && tir.attaques[0].rangeMax > cac.attaques[0].rangeMax,
           `(${((tir||{}).attaques||[{}])[0].rangeMax} contre ${((cac||{}).attaques||[{}])[0].rangeMax})`);

  console.log("\n=========================================================");
  console.log("  2 bis. ET LA CARTE LE DIT, MÊME SANS EFFET « DISTANCE »");
  console.log("=========================================================");
  const lu = await p.evaluate(() => {
    const cac = window.porteeReelleCarte(window.COMPETENCES_CACHE.C_CAC, window.PERSOS_PARTIE[0]);
    const tir = window.porteeReelleCarte(window.COMPETENCES_CACHE.C_TIR, window.PERSOS_PARTIE[0]);
    // Sans arme en main, la même carte de contact ne porte plus rien.
    const vraiBonus = window.bonusEquip;
    window.bonusEquip = () => 0;
    const cacSansArme = window.porteeReelleCarte(window.COMPETENCES_CACHE.C_CAC, window.PERSOS_PARTIE[0]);
    window.bonusEquip = vraiBonus;

    // Et ce que la carte affiche vraiment à l'écran.
    window.afficherApercuCarteHD("C_CAC");
    const texte = (document.getElementById("apercu-carte-hd-competence") || {}).innerText || "";
    return { cac, tir, cacSansArme, texte };
  });
  verifier("le calcul partagé retrouve la portée donnée par l'arme",
           lu.cac.portee === cac.attaques[0].rangeMax,
           `(${lu.cac.portee} contre ${cac.attaques[0].rangeMax} au moteur)`);
  verifier("et il nomme ce que l'arme y apporte", lu.cac.apportArme === 1, String(lu.cac.apportArme));
  verifier("sans arme à distance, la carte de contact ne porte plus",
           lu.cacSansArme.portee === 1, String(lu.cacSansArme.portee));
  verifier("le même calcul vaut pour la carte à distance",
           lu.tir.portee === tir.attaques[0].rangeMax,
           `(${lu.tir.portee} contre ${tir.attaques[0].rangeMax})`);
  verifier("LA CARTE AFFICHE SA PORTÉE À L'ÉCRAN",
           /Port[ée]e\s*:\s*2\s*cases/i.test(lu.texte),
           lu.texte.replace(/\s+/g, " ").slice(0, 120));
  verifier("et elle dit d'où elle vient", /de l'arme/i.test(lu.texte));

  console.log("\n=========================================================");
  console.log("  3. LA CARTE PORTE SON PROPRE COÛT EN ÉNERGIE");
  console.log("=========================================================");
  verifier("la carte de corps à corps annonce ses 25 d'énergie",
           !!cac && cac.coutFatigue === 25, String((cac || {}).coutFatigue));
  verifier("la carte à distance annonce ses 30",
           !!tir && tir.coutFatigue === 30, String((tir || {}).coutFatigue));

  // LE CAS QUI CASSAIT : la globale est à zéro (finDeTourCombat l'a remise à
  // zéro au tour précédent), et pourtant le cerveau doit recevoir le vrai coût.
  const envoye = await p.evaluate(async () => {
    window.COUT_COMPETENCE_SELECTIONNEE = 0;
    window.APPELS = [];
    window.regimeDemande = {
      actif: () => true, enVol: () => false,
      carte: async (acteur, charge) => { window.APPELS.push({ acteur, charge }); },
      finDeTour: async () => {}, mouvement: async () => {}
    };
    await window.demarrerCiblage("C_CAC");
    window.ETAT_CIBLAGE.attaques.forEach(a => { a.cibles = ["M1"]; });
    await window.declencherResolutionAvecBondEventuel("H1", "C_CAC");
    return window.APPELS;
  });
  verifier("une carte a bien été envoyée au cerveau", envoye.length === 1, JSON.stringify(envoye).slice(0, 150));
  verifier("AVEC SON COÛT, alors que la globale était à zéro",
           envoye.length === 1 && envoye[0].charge.coutFatigue === 25,
           String(envoye.length === 1 ? envoye[0].charge.coutFatigue : "—"));
}

verifier("aucune erreur JavaScript pendant tout le banc", erreurs.length === 0, erreurs.slice(0, 2).join(" | "));

await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
