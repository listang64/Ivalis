// REPRENDRE SON DÉPLACEMENT EN COURS DE TOUR.
// Un personnage qui validait son déplacement était figé jusqu'à la fin du tour.
// Il peut maintenant repartir tant qu'il n'a pas lancé sa carte — et le barème
// du coût (2 ⚡ les trois premières cases, 4 ⚡ jusqu'à la sixième, 6 ⚡ ensuite)
// reprend là où il s'était arrêté, sinon marcher en deux fois coûterait moins
// cher que marcher d'une traite.
import fs from 'fs';

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

  return { dUneTraite, premierTroncon, secondTroncon, memoireLocale, apresRetourBase,
           apresRechargement, tourSuivant, autreCombattant, gardeAvant, gardeApres };
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

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
