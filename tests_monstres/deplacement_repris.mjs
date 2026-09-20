// REPRENDRE SON DÉPLACEMENT EN COURS DE TOUR.
// Un personnage qui validait son déplacement était figé jusqu'à la fin du tour.
// Il peut maintenant repartir tant qu'il n'a pas lancé sa carte — et le barème
// du coût (2 ⚡ les trois premières cases, 4 ⚡ jusqu'à la sixième, 6 ⚡ ensuite)
// reprend là où il s'était arrêté, sinon marcher en deux fois coûterait moins
// cher que marcher d'une traite.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';

const mouvement = fs.readFileSync('/home/user/Ivalis/mouvement.js', 'utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');
const combat = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');

// Le garde-fou "est-ce mon tour ?" du clic sur le plateau, mot pour mot.
const lignes = combat.split('\n');
const dGarde = lignes.findIndex(l => l.includes('const estMonTour = (') && l.startsWith('        const'));
let fGarde = dGarde; for (let i = dGarde; i < lignes.length; i++) { if (lignes[i] === '        );') { fGarde = i; break; } }
const srcGarde = lignes.slice(dGarde, fGarde + 1).join('\n');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(200);
// Les lectures de stats mutualisées (atouts de race compris) vivent dans
// app.js, chargé avant tout le reste sur la vraie page.
await p.evaluate(src => eval(src), SRC_STATS_COMMUNES);

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const res = await p.evaluate(({ src, srcGarde }) => {
  document.getElementById("fenetre-combat").style.display = "block";
  window.PLATEAU_VTT = {
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    hexToPixel: (q, r) => ({ x: q * 60, y: r * 60 })
  };
  window.afficherMessageFlottantHex = () => {};
  window.caseOccupeeParVivant = () => false;
  window.estCombattantMort = () => false;
  window.jouerSonClic = () => {};

  new Function('window', src)(window);

  const poser = (pasDejaFaits) => {
    window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 } };
    window.PERSOS_PARTIE = [{ idPersonnage: "J1", idJoueur: "NICO", camp: "Allié",
      PV_Max: 42, PV_Actuels: 42, Fatigue_Max: 100, fatigueActuelle: 100, Etats_Alteres: [] }];
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
    window.COMBAT_INDEX_PERSO = 0;
    window.TOKEN_SELECTIONNE = "J1";
    window.COMBAT_FATIGUE_ACTUELLE = 100;
    window.COUT_COMPETENCE_SELECTIONNEE = 0;
    window.CHEMIN_MOUVEMENT = [];
    window.CHEMIN_START_NODE = { q: 0, r: 0 };
    window.MOUVEMENT_COUT_TOTAL = 0;
    window.PAS_PARCOURUS_TOUR = { id: null, tour: null, pas: 0 };
    window.PARTIE_DATA = { Tour_Combat: 1, Phase_Combat: "Resolution",
      File_Attente_Combat: [{ idPersonnage: "J1", idCarte: "C1",
                             pasParcourus: pasDejaFaits }] };
  };

  // Le barème d'une marche d'une traite : 8 cases en ligne droite.
  poser(0);
  for (let i = 1; i <= 8; i++) window.ajouterEtapeMouvement(i, 0);
  const dUneTraite = { cout: window.MOUVEMENT_COUT_TOTAL,
                       couts: window.CHEMIN_MOUVEMENT.map(e => e.cost) };

  // La même marche coupée en deux : 3 cases, validation, puis 5 de plus.
  poser(0);
  for (let i = 1; i <= 3; i++) window.ajouterEtapeMouvement(i, 0);
  const premierTroncon = { cout: window.MOUVEMENT_COUT_TOTAL,
                           couts: window.CHEMIN_MOUVEMENT.map(e => e.cost) };

  // Ce que validerMouvement retient : le nombre de pas, mémorisé sur-le-champ.
  window.PAS_PARCOURUS_TOUR = { id: "J1", tour: 1,
    pas: window.pasDejaParcourus("J1") + window.CHEMIN_MOUVEMENT.length };
  const memoireLocale = window.pasDejaParcourus("J1");

  // Le personnage repart de sa nouvelle case, la base n'a pas encore répondu.
  window.TOKENS_VTT_DATA.J1 = { q: 3, r: 0 };
  window.CHEMIN_MOUVEMENT = [];
  window.CHEMIN_START_NODE = { q: 3, r: 0 };
  window.MOUVEMENT_COUT_TOTAL = 0;
  for (let i = 4; i <= 8; i++) window.ajouterEtapeMouvement(i, 0);
  const secondTroncon = { cout: window.MOUVEMENT_COUT_TOTAL,
                          couts: window.CHEMIN_MOUVEMENT.map(e => e.cost) };

  // La base rattrape son retard : la valeur ne doit pas régresser.
  window.PARTIE_DATA.File_Attente_Combat[0].pasParcourus = 3;
  const apresRetourBase = window.pasDejaParcourus("J1");

  // Rechargement de page : la copie locale est perdue, la base fait foi.
  window.PAS_PARCOURUS_TOUR = { id: null, tour: null, pas: 0 };
  window.PARTIE_DATA.File_Attente_Combat[0].pasParcourus = 3;
  const apresRechargement = window.pasDejaParcourus("J1");

  // Tour suivant : le compteur repart de zéro.
  window.PAS_PARCOURUS_TOUR = { id: "J1", tour: 1, pas: 8 };
  window.PARTIE_DATA = { Tour_Combat: 2, Phase_Combat: "Resolution",
    File_Attente_Combat: [{ idPersonnage: "J1", idCarte: "C1" }] };
  const tourSuivant = window.pasDejaParcourus("J1");

  // Un autre combattant en tête de file : ce n'est pas son compteur.
  window.PARTIE_DATA = { Tour_Combat: 1, Phase_Combat: "Resolution",
    File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "C2", pasParcourus: 5 }] };
  window.PAS_PARCOURUS_TOUR = { id: null, tour: null, pas: 0 };
  const autreCombattant = window.pasDejaParcourus("J1");

  // === CE QUE FAIT VRAIMENT validerMouvement ============================
  //
  // Tout ce qui précède mesurait le BARÈME en posant le compteur à la main.
  // Il l'a fallu : le code qui POSE ce compteur avait disparu avec l'ancien
  // moteur de déplacement, lors de la grande suppression. Plus rien n'écrivait
  // ni la copie locale ni la valeur de la file, les deux valaient zéro pour
  // toujours, et le barème repartait de zéro à chaque reprise — « il ne prend
  // pas en compte le déplacement déjà effectué ». Le banc, lui, passait au
  // vert : il simulait ce que la production ne faisait plus.
  poser(0);
  window.CHEMIN_START_NODE = { q: 0, r: 0 };
  for (let i = 1; i <= 3; i++) window.ajouterEtapeMouvement(i, 0);
  window.REGIME_CERVEAU = true;
  window.ENVOYE = null;
  window.regimeDemande = {
    actif: () => true,
    mouvement: async (acteur, chemin, reserve) => { window.ENVOYE = { acteur, chemin, reserve }; }
  };
  window.appliquerTokensVTT = () => {};
  window.actualiserBoutonFinTour = () => {};
  const validation = (async () => {
    await window.validerMouvement();
    return { envoye: window.ENVOYE,
             memoire: { ...window.PAS_PARCOURUS_TOUR },
             compte: window.pasDejaParcourus("J1") };
  })();

  // Le garde-fou du clic sur le plateau, avec un déplacement déjà validé.
  const garde = (pasParcourus) => {
    const partie = { Phase_Combat: "Resolution",
      File_Attente_Combat: [{ idPersonnage: "J1", idCarte: "C1", pasParcourus }] };
    window.PARTIE_DATA = partie;
    window.TOKEN_SELECTIONNE = "J1";
    const monId = "NICO";
    const queue = partie.File_Attente_Combat, phase = partie.Phase_Combat;
    const persoSelectionne = window.PERSOS_PARTIE.find(p => p.idPersonnage === "J1");
    // "const estMonTour" créerait sa propre liaison dans l'eval : on la sort.
    return eval("(" + srcGarde.replace("const estMonTour = (", "(") .replace(/\);\s*$/, ")") + ")");
  };
  const gardeAvant = garde(0);
  const gardeApres = garde(3);

  return validation.then(v => ({
    dUneTraite, premierTroncon, secondTroncon, memoireLocale, apresRetourBase,
    apresRechargement, tourSuivant, autreCombattant, gardeAvant, gardeApres,
    validation: v }));
}, { src: mouvement, srcGarde });

console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");
console.log(`     d'une traite : ${res.dUneTraite.couts.join(" ")} = ${res.dUneTraite.cout} ⚡`);
console.log(`     en deux fois : ${res.premierTroncon.couts.join(" ")} | ${res.secondTroncon.couts.join(" ")}`
          + ` = ${res.premierTroncon.cout + res.secondTroncon.cout} ⚡`);

verifier("le barème d'une traite est bien 2·3 puis 4·3 puis 6·2",
         res.dUneTraite.couts.join(",") === "2,2,2,4,4,4,6,6", `(${res.dUneTraite.couts.join(",")})`);
verifier("le premier tronçon coûte 2 ⚡ par case", res.premierTroncon.couts.join(",") === "2,2,2",
         `(${res.premierTroncon.couts.join(",")})`);
verifier("la reprise se souvient des 3 pas déjà faits", res.memoireLocale === 3, `(${res.memoireLocale})`);
verifier("le second tronçon reprend le barème, sans repartir à 2 ⚡",
         res.secondTroncon.couts.join(",") === "4,4,4,6,6", `(${res.secondTroncon.couts.join(",")})`);
verifier("marcher en deux fois coûte exactement autant que d'une traite",
         res.premierTroncon.cout + res.secondTroncon.cout === res.dUneTraite.cout,
         `(${res.premierTroncon.cout + res.secondTroncon.cout} contre ${res.dUneTraite.cout})`);
verifier("le retour de la base ne fait pas régresser le compteur", res.apresRetourBase === 3,
         `(${res.apresRetourBase})`);
verifier("après un rechargement, la base fait foi", res.apresRechargement === 3, `(${res.apresRechargement})`);
verifier("au tour suivant, le compteur repart de zéro", res.tourSuivant === 0, `(${res.tourSuivant})`);
verifier("le compteur d'un autre combattant ne déteint pas", res.autreCombattant === 0, `(${res.autreCombattant})`);
verifier("le plateau reste cliquable avant tout déplacement", res.gardeAvant === true);
verifier("et il le reste après un déplacement validé", res.gardeApres === true);

// =========================================================================
// ET C'EST BIEN validerMouvement QUI POSE LE COMPTEUR
// =========================================================================
//  Tous les contrôles ci-dessus posaient ce compteur À LA MAIN — et c'est
//  exactement pour ça qu'ils sont restés verts pendant que le jeu se trompait.
//  Le code qui POSAIT ce compteur avait disparu avec l'ancien moteur de
//  déplacement, lors de la grande suppression : plus rien n'écrivait ni la
//  copie locale ni la valeur de la file, les deux valaient zéro pour toujours,
//  et le barème repartait de zéro à chaque reprise.
{
  const v = res.validation;
  verifier("le chemin part bien au cerveau", !!v.envoye && v.envoye.chemin.length === 3,
           v.envoye ? `${v.envoye.chemin.length} case(s)` : "rien n'est parti");
  verifier("LA COPIE LOCALE EST POSÉE AU MOMENT DE VALIDER",
           v.memoire.id === "J1" && v.memoire.tour === 1 && v.memoire.pas === 3,
           JSON.stringify(v.memoire));
  verifier("et le compteur répond aussitôt, sans attendre la base",
           v.compte === 3, `(${v.compte})`);
}

// =========================================================================
// LE COMPTEUR DESCEND DE L'ÉTAT DU CERVEAU JUSQU'À L'ÉCRAN
// =========================================================================
//  L'écran et le cerveau doivent chiffrer la case suivante au MÊME prix. Le
//  cerveau tient le compte en tête de sa file ; le pont le fait redescendre
//  dans PARTIE_DATA, où pasDejaParcourus va le lire. Sans ce relais, l'écran
//  n'aurait que sa copie locale — perdue au premier rechargement, et inconnue
//  des autres postes.
{
  const { fileDepuisEtat } = await import('../pont_combat.js');
  const file = fileDepuisEtat({ file: [
    { id: "J1", carte: "C1", initiative: 70, pas: 4 },
    { id: "M1", carte: "C2", initiative: 50 }
  ]});
  verifier("LE PONT FAIT DESCENDRE LES CASES DÉJÀ MARCHÉES",
           file[0].pasParcourus === 4, `(${file[0].pasParcourus})`);
  verifier("et zéro pour qui n'a pas bougé", file[1].pasParcourus === 0,
           `(${file[1].pasParcourus})`);
  // C'est bien le nom que lit pasDejaParcourus : les deux bouts du relais
  // doivent se reconnaître, et un renommage d'un seul côté casserait tout en
  // silence.
  const src = fs.readFileSync('/home/user/Ivalis/mouvement.js', 'utf-8');
  verifier("sous le nom exact que l'écran va chercher",
           /queue\[0\]\.pasParcourus/.test(src));
}

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
