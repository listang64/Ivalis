// TROIS POSTES SUR LA MÊME PARTIE.
// En solo tout allait bien ; à trois (deux iPad et un PC), des joueurs
// n'apparaissaient pas dans la piste d'initiative, des tours étaient sautés et
// les repos longs ne rendaient pas la bonne énergie. La cause est la même
// partout : la file d'attente était LUE, modifiée, puis RÉÉCRITE entière, sans
// rien pour empêcher deux postes de le faire en même temps. Ce banc rejoue les
// scènes exactes, avec le vrai code, à trois navigateurs.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { SRC_MODIFIER_PARTIE, SRC_VERDICT_TOUR } from './transaction_partie.mjs';

const combat = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
const lignes = combat.split('\n');
function fonction(marqueur) {
  const d = lignes.findIndex(l => l.startsWith(marqueur));
  if (d < 0) throw new Error("introuvable : " + marqueur);
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === '};') { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}
const SRC_CARTE = fonction('window.jouerCarteCombat = async function');
const SRC_FIN   = fonction('window.finDeTourCombat = async function');
// Le verdict « tout le monde a-t-il joué ? » voyage avec la transaction, dans
// SRC_MODIFIER_PARTIE : sans lui, aucune carte n'entre dans la file.
const SRC_VERDICT = SRC_VERDICT_TOUR;

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const attendre = (ms) => new Promise(r => setTimeout(r, ms));

// Une partie partagée par tous les postes, avec deux Firestore au choix :
// transactionnel (le vrai) ou naïf (celui d'avant, pour la comparaison).
function creerPartie(docInitial, { transactionnel }) {
  const partagee = { doc: structuredClone(docInitial), file: Promise.resolve() };
  const lire = () => structuredClone(partagee.doc);
  const ecrire = (maj) => Object.assign(partagee.doc, structuredClone(maj));

  // Le réseau n'est pas instantané : chaque aller-retour prend un peu de temps,
  // et c'est précisément dans cet intervalle que les postes se marchent dessus.
  const latence = () => new Promise(r => setTimeout(r, 5));

  const runTransaction = async (_db, fn) => {
    if (!transactionnel) {
      // Le comportement d'avant : lecture et écriture séparées, sans verrou.
      const vue = lire();
      await latence();
      return fn({ get: async () => ({ exists: () => true, data: () => vue }),
                  update: (_r, maj) => ecrire(maj) });
    }
    const precedent = partagee.file;
    let debloquer;
    partagee.file = new Promise(r => debloquer = r);
    await precedent;
    try {
      const vue = lire();
      await latence();
      return await fn({ get: async () => ({ exists: () => true, data: () => vue }),
                        update: (_r, maj) => ecrire(maj) });
    } finally { debloquer(); }
  };
  return { partagee, runTransaction };
}

function creerPoste(nom, partie, personnages, { monPerso }) {
  const w = {};
  const ecritures = [], lots = [], lotsCommis = [];
  const db = {}, doc = () => ({});
  const updateDoc = async (ref, maj) => { ecritures.push({ ref: ref.id, maj }); };

  w.ID_PARTIE_COURANTE = "P1";
  w.PERSOS_PARTIE = structuredClone(personnages);
  w.COMBAT_PERSOS_JOUEUR = w.PERSOS_PARTIE.filter(p => p.idPersonnage === monPerso);
  w.COMBAT_INDEX_PERSO = 0;
  w.PARTIE_DATA = partie.partagee.doc;
  w.COMPETENCES_CACHE = { C_LOURD: { Nom: "Frappe", Initiative: 70, Fatigue: 30 } };
  w.refCombattant = (id) => ({ id });
  w.jouerSonClic = () => {};
  w.mettreAJourJaugeFatigue = () => {}; w.mettreAJourJaugePV = () => {};
  w.afficherApercuCarteHD = () => {}; w.actualiserEtatCarteCombat = () => {};
  w.afficherPisteInitiative = () => {}; w.afficherPersoCombatActuel = () => {};
  w.estCombattantMort = (id) => { const p = w.PERSOS_PARTIE.find(x => x.idPersonnage === id); return !p || p.PV_Actuels <= 0; };
  w.PEUT_PASSER_TOUR = true;
  w.ZONES_PERSISTANTES = {};
  w.appliquerZonesPersistantes = () => {};
  w.sauvegarderZonesPersistantes = async () => {};

  global.window = w;
  global.document = { getElementById: () => null, querySelectorAll: () => [] };
  global.setTimeout = setTimeout;

  new Function('window', SRC_STATS_COMMUNES)(w);
  new Function('window', 'db', 'doc', 'runTransaction', SRC_MODIFIER_PARTIE)(
    w, db, doc, partie.runTransaction);

  // Les deux fonctions à l'étude, avec leurs dépendances Firestore.
  const importer = async () => ({
    doc, getDoc: async () => ({ exists: () => true, data: () => structuredClone(partie.partagee.doc) }),
    updateDoc,
    // La régénération de fin de round passe par un lot : on le compte, sinon le
    // contrôle « un seul poste régénère » ne mesurerait rien.
    writeBatch: () => ({
      update: (ref, maj) => lots.push({ ref: ref.id, maj }),
      commit: async () => { lotsCommis.push(lots.length); }
    })
  });
  new Function('window', 'db', 'doc', 'updateDoc', 'importerFirestore',
    SRC_VERDICT + '\n' +
    SRC_CARTE.replace(/await import\("[^"]*"\)/g, 'await importerFirestore()') + '\n' +
    SRC_FIN.replace(/await import\("[^"]*"\)/g, 'await importerFirestore()'))(
    w, db, doc, updateDoc, importer);

  return { nom, w, ecritures, lots, lotsCommis };
}

const TROIS_HEROS = [
  { idPersonnage: "J1", prenom: "Pliors", idJoueur: "P1", camp: "Allié", statut: "Vivant",
    PV_Max: 42, PV_Actuels: 42, Fatigue_Max: 100, fatigueActuelle: 100, Regeneration: 30, Etats_Alteres: [] },
  { idPersonnage: "J2", prenom: "Jade", idJoueur: "P2", camp: "Allié", statut: "Vivant",
    PV_Max: 42, PV_Actuels: 42, Fatigue_Max: 100, fatigueActuelle: 100, Regeneration: 30, Etats_Alteres: [] },
  { idPersonnage: "J3", prenom: "Mémé", idJoueur: "P3", camp: "Allié", statut: "Vivant",
    PV_Max: 42, PV_Actuels: 42, Fatigue_Max: 100, fatigueActuelle: 100, Regeneration: 30, Etats_Alteres: [] }
];

const partieNeuve = () => ({ File_Attente_Combat: [], Phase_Combat: "Preparation", Tour_Combat: 1,
                             Ordre_Initiative: ["J1", "J2", "J3"] });

// ------------------------------------------------------------------
async function troisChoisissentEnMemeTemps(transactionnel) {
  const partie = creerPartie(partieNeuve(), { transactionnel });
  const postes = ["J1", "J2", "J3"].map((id, i) =>
    creerPoste("poste" + (i + 1), partie, TROIS_HEROS, { monPerso: id }));
  // Les trois cliquent au même instant, chacun sur son iPad.
  await Promise.all(postes.map(p => p.w.jouerCarteCombat("C_LOURD")));
  await attendre(30);
  return partie.partagee.doc;
}

console.log("1. TROIS JOUEURS CHOISISSENT LEUR CARTE AU MÊME INSTANT");
{
  const avant = await troisChoisissentEnMemeTemps(false);
  const apres = await troisChoisissentEnMemeTemps(true);
  console.log(`     sans transaction : ${avant.File_Attente_Combat.map(f => f.idPersonnage).join(",") || "vide"}`
            + `  (phase ${avant.Phase_Combat})`);
  console.log(`     avec transaction : ${apres.File_Attente_Combat.map(f => f.idPersonnage).join(",") || "vide"}`
            + `  (phase ${apres.Phase_Combat})`);
  verifier("le défaut est bien là sans transaction : des joueurs perdus",
           avant.File_Attente_Combat.length < 3, `(${avant.File_Attente_Combat.length} sur 3)`);
  verifier("les trois joueurs sont dans la piste d'initiative",
           apres.File_Attente_Combat.length === 3, `(${apres.File_Attente_Combat.length} sur 3)`);
  verifier("et le combat bascule bien en résolution", apres.Phase_Combat === "Resolution",
           `(${apres.Phase_Combat})`);
  verifier("l'ordre suit l'initiative, sans doublon",
           new Set(apres.File_Attente_Combat.map(f => f.idPersonnage)).size === 3);
}

// ------------------------------------------------------------------
async function deuxTerminentLeMemeTour(transactionnel) {
  const doc = partieNeuve();
  doc.Phase_Combat = "Resolution";
  doc.File_Attente_Combat = [
    { idPersonnage: "J1", idCarte: "C_LOURD", initiative: 70, timestamp: 1 },
    { idPersonnage: "J2", idCarte: "C_LOURD", initiative: 60, timestamp: 2 },
    { idPersonnage: "J3", idCarte: "C_LOURD", initiative: 50, timestamp: 3 }
  ];
  const partie = creerPartie(doc, { transactionnel });
  const postes = ["J1", "J2", "J3"].map((id, i) =>
    creerPoste("poste" + (i + 1), partie, TROIS_HEROS, { monPerso: id }));
  // Deux postes croient devoir terminer le tour de J1 : le joueur clique sur
  // "fin de tour" pendant que la résolution de sa carte le fait aussi.
  postes[0].w.finDeTourCombat(true, "J1");
  postes[1].w.finDeTourCombat(true, "J1");
  await attendre(600);
  return partie.partagee.doc;
}

console.log("\n2. DEUX POSTES TERMINENT LE MÊME TOUR");
{
  const apres = await deuxTerminentLeMemeTour(true);
  console.log(`     file restante : ${apres.File_Attente_Combat.map(f => f.idPersonnage).join(",") || "vide"}`);
  verifier("la file n'avance que d'un cran", apres.File_Attente_Combat.length === 2,
           `(${apres.File_Attente_Combat.length} restants sur 3)`);
  verifier("c'est bien J2 qui joue ensuite, son tour n'est pas sauté",
           apres.File_Attente_Combat[0] && apres.File_Attente_Combat[0].idPersonnage === "J2",
           `(${apres.File_Attente_Combat[0] ? apres.File_Attente_Combat[0].idPersonnage : "personne"})`);
  verifier("le tour de combat n'a pas changé", apres.Tour_Combat === 1, `(${apres.Tour_Combat})`);
}

// ------------------------------------------------------------------
console.log("\n3. UN TOUR DÉJÀ TERMINÉ PAR UN AUTRE POSTE");
{
  const doc = partieNeuve();
  doc.Phase_Combat = "Resolution";
  doc.File_Attente_Combat = [
    { idPersonnage: "J2", idCarte: "C_LOURD", initiative: 60, timestamp: 2 },
    { idPersonnage: "J3", idCarte: "C_LOURD", initiative: 50, timestamp: 3 }
  ];
  const partie = creerPartie(doc, { transactionnel: true });
  const poste = creerPoste("retardataire", partie, TROIS_HEROS, { monPerso: "J1" });
  // Ce poste croit encore que c'est à J1 de jouer : sa demande doit rester sans effet.
  await poste.w.finDeTourCombat(true, "J1");
  await attendre(600);
  console.log(`     file restante : ${partie.partagee.doc.File_Attente_Combat.map(f => f.idPersonnage).join(",")}`);
  verifier("un poste en retard ne fait pas avancer la file",
           partie.partagee.doc.File_Attente_Combat.length === 2,
           `(${partie.partagee.doc.File_Attente_Combat.length})`);
  verifier("J2 garde son tour", partie.partagee.doc.File_Attente_Combat[0].idPersonnage === "J2");
}

// ------------------------------------------------------------------
console.log("\n4. LA FIN DE ROUND N'A LIEU QU'UNE FOIS");
async function finDeRoundATrois(transactionnel) {
  const doc = partieNeuve();
  doc.Phase_Combat = "Resolution";
  doc.Tour_Combat = 4;
  doc.File_Attente_Combat = [{ idPersonnage: "J3", idCarte: "C_LOURD", initiative: 50, timestamp: 3 }];
  const partie = creerPartie(doc, { transactionnel });
  const postes = ["J1", "J2", "J3"].map((id, i) =>
    creerPoste("poste" + (i + 1), partie, TROIS_HEROS, { monPerso: id }));
  postes.forEach(p => p.w.finDeTourCombat(true, "J3"));
  await attendre(700);
  return { doc: partie.partagee.doc,
           regens: postes.map(p => p.lots.filter(e => e.maj && e.maj.Fatigue_Actuelle !== undefined).length) };
}
{
  const avant = await finDeRoundATrois(false);
  console.log(`     sans transaction : tour ${avant.doc.Tour_Combat},`
            + ` régénérations ${avant.regens.join(",")}`);
  verifier("le défaut est bien là sans transaction : le round saute ou double",
           avant.doc.Tour_Combat !== 5 || avant.regens.filter(n => n > 0).length > 1,
           `(tour ${avant.doc.Tour_Combat}, ${avant.regens.filter(n => n > 0).length} poste(s))`);

  const doc = partieNeuve();
  doc.Phase_Combat = "Resolution";
  doc.Tour_Combat = 4;
  doc.File_Attente_Combat = [{ idPersonnage: "J3", idCarte: "C_LOURD", initiative: 50, timestamp: 3 }];
  const partie = creerPartie(doc, { transactionnel: true });
  const postes = ["J1", "J2", "J3"].map((id, i) =>
    creerPoste("poste" + (i + 1), partie, TROIS_HEROS, { monPerso: id }));
  postes.forEach(p => p.w.finDeTourCombat(true, "J3"));
  await attendre(700);
  const regens = postes.map(p => p.lots.filter(e => e.maj && e.maj.Fatigue_Actuelle !== undefined).length);
  console.log(`     combattants régénérés par poste : ${regens.join(", ")}`);
  verifier("le round passe au suivant", partie.partagee.doc.Tour_Combat === 5,
           `(tour ${partie.partagee.doc.Tour_Combat})`);
  verifier("la file est vide et le combat repasse en préparation",
           partie.partagee.doc.File_Attente_Combat.length === 0
           && partie.partagee.doc.Phase_Combat === "Preparation");
  verifier("la régénération a bien eu lieu", regens.some(n => n === 3), `(${regens.join(",")})`);
  verifier("et un seul poste l'a faite", regens.filter(n => n > 0).length === 1,
           `(${regens.filter(n => n > 0).length} poste(s) sur 3)`);
}

// ------------------------------------------------------------------
console.log("\n5. LES TROIS ÉCRANS VOIENT LE MÊME COMBAT");
{
  // La carte est lancée une fois, puis rejouée par chaque poste. Tant que
  // chacun relançait ses propres dés, l'un voyait la cible esquiver et l'autre
  // encaisser — et les deux gardaient en mémoire des valeurs différentes.
  const moteur = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');

  function posteMoteur(des) {
    const w = {};
    const db = {}, doc = () => ({});
    const updateDoc = async () => {}, setDoc = async () => {};
    w.PERSOS_PARTIE = [
      { idPersonnage: "J1", prenom: "Ben", camp: "Allié", idJoueur: "P1", PV_Max: 100, PV_Actuels: 100,
        Fatigue_Max: 100, fatigueActuelle: 100, Esquive: 40, Parade: 0, Critique: 0,
        Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [] },
      { idPersonnage: "M1", prenom: "Goule", camp: "Ennemi", estMonstre: true, PV_Max: 100, PV_Actuels: 100,
        Fatigue_Max: 100, fatigueActuelle: 100, Esquive: 40, Parade: 0, Critique: 0,
        Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [] }
    ];
    w.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } };
    w.COMBAT_PERSOS_JOUEUR = [w.PERSOS_PARTIE[0]]; w.COMBAT_INDEX_PERSO = 0;
    w.ID_PARTIE_COURANTE = "P1"; w.RESOLUTIONS_LOCALES = [];
    w.refCombattant = (id) => ({ id });
    w.afficherMessageFlottantHex = () => {}; w.afficherFlashDegatToken = () => {};
    w.appliquerTokensVTT = () => {}; w.afficherPisteInitiative = () => {};
    w.afficherPersoCombatActuel = () => {}; w.mettreAJourJaugePV = () => {};
    w.mettreAJourJaugeFatigue = () => {}; w.validerCarteCombat = () => {};
    w.deduireFatigueCarte = () => {}; w.jouerSonClic = () => {};
    w.estCombattantMort = () => false; w.estMonstre = (id) => String(id).startsWith("M");
    w.PLATEAU_VTT = { getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
                      hexToPixel: (q, r) => ({ x: q * 50, y: r * 50 }),
                      pixelToHex: (x, y) => ({ q: Math.round(x / 50), r: Math.round(y / 50) }) };
    w.VTT_POS_X = 0; w.VTT_POS_Y = 0; w.VTT_SCALE = 1;
    w.EFFETS_BDD_CACHE = {}; w.CACHE_COMPETENCES_GLOBAL = {};
    global.window = w;
    global.document = { getElementById: () => null, querySelectorAll: () => [],
                        createElement: () => ({ style: {}, appendChild() {}, remove() {} }) };
    global.localStorage = { getItem: () => "P1" };
    const vrai = Math.random;
    // Chaque poste a sa propre suite de dés : s'il en tirait, il verrait autre chose.
    Math.random = () => des.shift() ?? 0.99;
    new Function('window', SRC_STATS_COMMUNES)(w);
    new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField', moteur)(
      w, db, doc, updateDoc, setDoc, async () => {}, () => ({}));
    return { w, rendre: () => { Math.random = vrai; } };
  }

  const carte = (jets) => ({
    type: "ATTAQUES", idLanceur: "J1", idCarte: "C1", critique: false, jets,
    attaques: [{ nom: "Attaque légère", typeRes: "Physique", valeurBrute: 20, isRanged: false,
                 rangeMax: 1, isHeal: false, isShield: false, purifChance: 0,
                 estEtalement: false, cibles: ["M1"] }],
    alterations: [{ nom: "Saignement", chance: 50, duree: 3, icone: "", cibles: ["M1"] }],
    isZone: false, confusion: null, timestamp: 1
  });

  // Les dés tirés par le lanceur : la cible n'esquive pas, l'état passe.
  const jetsPartages = { attaqueRatee: false, parCible: { M1: { esquive: false, etats: { Saignement: true } } } };

  const resultats = [];
  for (const des of [[0.01, 0.01, 0.01, 0.01], [0.99, 0.99, 0.99, 0.99], [0.30, 0.70, 0.10, 0.90]]) {
    const p = posteMoteur([...des]);
    await p.w.jouerAnimationMoteur(carte(jetsPartages));
    const cible = p.w.PERSOS_PARTIE.find(x => x.idPersonnage === "M1");
    resultats.push({ pv: cible.PV_Actuels, etats: cible.Etats_Alteres.map(e => e.nom).join(",") });
    p.rendre();
  }
  console.log(`     les trois postes : ${resultats.map(r => r.pv + " PV [" + (r.etats || "aucun") + "]").join("  |  ")}`);
  verifier("les trois postes affichent les mêmes points de vie",
           new Set(resultats.map(r => r.pv)).size === 1, `(${resultats.map(r => r.pv).join(",")})`);
  verifier("et les mêmes états sur la cible",
           new Set(resultats.map(r => r.etats)).size === 1, `(${resultats.map(r => r.etats).join(" / ")})`);
  verifier("l'esquive décidée au lancement a bien été suivie", resultats[0].pv === 80,
           `(${resultats[0].pv} PV)`);

  // Sans les dés partagés (une action venue d'un poste pas encore à jour), chaque
  // navigateur retombe sur son propre tirage : c'est le défaut d'avant.
  const sansJets = [];
  for (const des of [[0.01, 0.01, 0.01, 0.01], [0.99, 0.99, 0.99, 0.99]]) {
    const p = posteMoteur([...des]);
    await p.w.jouerAnimationMoteur(carte(undefined));
    const cible = p.w.PERSOS_PARTIE.find(x => x.idPersonnage === "M1");
    sansJets.push(cible.PV_Actuels);
    p.rendre();
  }
  console.log(`     sans dés partagés : ${sansJets.join(" et ")} PV`);
  verifier("le défaut est bien là sans dés partagés : deux résultats différents",
           new Set(sansJets).size > 1, `(${sansJets.join(",")})`);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
