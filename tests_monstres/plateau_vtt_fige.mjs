// LE PLATEAU (Combat_VTT) NE DOIT PLUS FAIRE SAUTER LES PIONS EN ARRIÈRE.
//
// LE TROU, TROUVÉ EN RELISANT TOUT LE COUPLAGE À FROID.
//
// Combat_VTT est le document du TERRAIN : les murs, les trous, la carte — et
// il porte aussi `Tokens`, la position ET l'apparence de chaque pion. Sous
// l'ancien moteur, ce champ était réécrit à CHAQUE pas (enregistrerPionsVTT) :
// l'écouteur pouvait le relire sans risque, il était toujours à jour.
//
// Depuis que les déplacements vivent dans l'état du cerveau, plus rien
// n'écrit la position dans `Combat_VTT.Tokens` pendant le combat — ce champ se
// FIGE au moment de l'ouverture. Sauf que l'écouteur, lui, continuait de
// l'appliquer AVEUGLÉMENT à chaque instantané de ce document, quelle qu'en
// soit la raison : un mur posé par le MJ, une Illusion qui range sa propre
// apparence (elle continue, elle, d'écrire dans Combat_VTT — c'est la seule
// façon de faire connaître son image et sa taille). Résultat : à chaque
// instantané de CE document, TOUS LES PIONS DU COMBAT sautaient en arrière
// jusqu'à leur position d'ouverture, une fraction de seconde, avant que la
// prochaine action du cerveau ne les remette en place. Exactement le genre de
// « pion qui saute » que toute cette architecture existe pour supprimer — sauf
// que celui-là passait par la porte de derrière.
//
// La même chose vaut pour les zones persistantes : `Combat_VTT.Zones_Persistantes`
// ne reçoit plus une seule écriture sous le cerveau (les nappes vivent dans
// l'état, voir zones_cerveau.mjs) ; le relire ici effacerait une nappe que le
// cerveau vient pourtant de poser, à chaque instantané non lié au combat.
import { fusionnerPionsVTT } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

console.log("\n=========================================================");
console.log("  LE PLATEAU NE DOIT PLUS DÉCIDER D'UNE POSITION");
console.log("=========================================================");

// =========================================================================
console.log("\n1. LE TROU LUI-MÊME : UN MUR POSÉ NE FAIT PLUS SAUTER LES PIONS");
// =========================================================================
{
    // Ce que Firestore connaît encore : la position D'OUVERTURE du combat,
    // jamais mise à jour depuis.
    const pionsFirestore = {
        H1: { q: 0, r: 0, url: "h1.png", taille: 55 },
        H2: { q: 1, r: 0, url: "h2.png", taille: 55 }
    };
    // Ce que le cerveau a fait avancer depuis, en mémoire, sur cet écran.
    const pionsLocaux = {
        H1: { q: 5, r: 3, url: "h1.png", taille: 55 },
        H2: { q: 2, r: 4, url: "h2.png", taille: 55 }
    };
    const combattants = { H1: { id: "H1" }, H2: { id: "H2" } };

    const fusion = fusionnerPionsVTT(pionsFirestore, pionsLocaux, combattants);

    verifier("H1 garde SA position réelle, pas celle d'ouverture",
             fusion.H1.q === 5 && fusion.H1.r === 3,
             `(${fusion.H1.q},${fusion.H1.r})`);
    verifier("H2 aussi", fusion.H2.q === 2 && fusion.H2.r === 4,
             `(${fusion.H2.q},${fusion.H2.r})`);
    verifier("l'apparence, elle, vient bien de Firestore",
             fusion.H1.url === "h1.png" && fusion.H1.taille === 55);
}

// =========================================================================
console.log("\n2. UN LEURRE FRAÎCHEMENT NÉ EST QUAND MÊME REÇU");
// =========================================================================
//  L'Illusion écrit encore son APPARENCE dans Combat_VTT (rien d'autre ne le
//  fait) : le cerveau ne la connaît pas encore au moment de cette écriture-là,
//  ou vient tout juste de l'accueillir. Dans les deux cas, elle doit arriver.
{
    const pionsFirestore = {
        H1: { q: 0, r: 0, url: "h1.png", taille: 55 },
        ILLUSION_x: { q: 3, r: 3, url: "h1.png", taille: 55 }
    };
    const pionsLocaux = { H1: { q: 5, r: 3, url: "h1.png", taille: 55 } };

    // Cas A : le cerveau a déjà accueilli le leurre (son intention est passée
    // avant que cet instantané n'arrive). Sa position à lui vient alors du
    // cerveau — mais comme le client ne l'a pas encore en LOCAL, Firestore
    // fait foi pour cette toute première apparition.
    const combattantsAvecLeurre = { H1: { id: "H1" }, ILLUSION_x: { id: "ILLUSION_x" } };
    const fusion = fusionnerPionsVTT(pionsFirestore, pionsLocaux, combattantsAvecLeurre);
    verifier("le leurre apparaît bien, à la position que Firestore connaît",
             !!fusion.ILLUSION_x && fusion.ILLUSION_x.q === 3 && fusion.ILLUSION_x.r === 3);
    verifier("et H1 n'a pas régressé pour autant",
             fusion.H1.q === 5 && fusion.H1.r === 3);
}

// =========================================================================
console.log("\n3. UN PION CONNU DU CERVEAU MAIS ABSENT DE CET INSTANTANÉ SURVIT");
// =========================================================================
//  Rare, mais réel : l'écriture d'apparence d'un pion peut ne pas encore avoir
//  traversé le réseau. Il ne doit pas disparaître de l'écran pour autant.
{
    const pionsFirestore = { H1: { q: 0, r: 0, url: "h1.png", taille: 55 } };
    const pionsLocaux = {
        H1: { q: 5, r: 3, url: "h1.png", taille: 55 },
        H2: { q: 2, r: 4, url: "h2.png", taille: 55 }
    };
    const combattants = { H1: { id: "H1" }, H2: { id: "H2" } };

    const fusion = fusionnerPionsVTT(pionsFirestore, pionsLocaux, combattants);
    verifier("H2 reste affiché avec sa dernière position connue",
             !!fusion.H2 && fusion.H2.q === 2 && fusion.H2.r === 4,
             JSON.stringify(fusion.H2));
}

// =========================================================================
console.log("\n4. HORS COMBAT (ANCIEN RÉGIME, OU PAS DE COMBAT DU TOUT)");
// =========================================================================
//  Sans combattants du cerveau, on retombe exactement sur l'ancien
//  comportement : Firestore fait foi, sans réserve — c'est ce dont la
//  préparation (avant tout combat) a besoin pour placer les pions.
{
    const pionsFirestore = { H1: { q: 7, r: 7, url: "h1.png", taille: 55 } };
    const fusionSansCombattants = fusionnerPionsVTT(pionsFirestore, { H1: { q: 0, r: 0 } }, null);
    verifier("sans cerveau ouvert, Firestore décide seul",
             fusionSansCombattants.H1.q === 7 && fusionSansCombattants.H1.r === 7);
}

// =========================================================================
console.log("\n5. UN COMBATTANT DU CERVEAU SANS COPIE LOCALE : FIRESTORE DÉPANNE");
// =========================================================================
//  Un tout nouvel écran (rechargement de page en pleine partie) : la copie
//  locale est vide, mais le cerveau connaît déjà le combattant. Sans
//  Firestore pour amorcer l'apparence, ce pion ne s'afficherait jamais — voir
//  poserPions (regime_cerveau.js), qui ne CRÉE jamais d'entrée manquante.
{
    const pionsFirestore = { H1: { q: 4, r: 4, url: "h1.png", taille: 55 } };
    const combattants = { H1: { id: "H1" } };
    const fusion = fusionnerPionsVTT(pionsFirestore, {}, combattants);
    verifier("le premier rendu prend la position connue de Firestore",
             fusion.H1.q === 4 && fusion.H1.r === 4);
}

// =========================================================================
console.log("\n6. UN LEURRE DÉTRUIT NE RESSUSCITE PAS SUR LES AUTRES ÉCRANS");
// =========================================================================
//  detruireIllusion efface explicitement `Tokens.ILLUSION_x` (deleteField) et
//  la copie locale de son propre poste, mais l'illusion reste « connue du
//  cerveau » pour toujours — un mort n'est jamais retiré de l'état, il garde
//  juste `aTerre`. Sur les AUTRES écrans, sa copie locale existe encore le
//  temps que cet instantané arrive : le filet du chapitre 3 (garder un pion
//  connu du cerveau mais absent de cet instantané) ne doit PAS s'appliquer à
//  elle, sous peine de la ressusciter chez tout le monde sauf chez celui qui
//  vient de l'effacer.
{
    // L'instantané Firestore qui arrive juste après la destruction : le champ
    // Tokens.ILLUSION_x a disparu, H1 est inchangé.
    const pionsFirestore = { H1: { q: 0, r: 0, url: "h1.png", taille: 55 } };
    // Un AUTRE écran, qui n'a pas encore reçu la nouvelle : sa copie locale
    // porte encore le leurre à sa dernière position connue.
    const pionsLocaux = {
        H1: { q: 5, r: 3, url: "h1.png", taille: 55 },
        ILLUSION_x: { q: 3, r: 3, url: "h1.png", taille: 55 }
    };
    // L'illusion reste dans l'état du cerveau, marquée à terre.
    const combattants = { H1: { id: "H1" }, ILLUSION_x: { id: "ILLUSION_x", aTerre: true } };

    const fusion = fusionnerPionsVTT(pionsFirestore, pionsLocaux, combattants);
    verifier("l'illusion détruite reste absente", fusion.ILLUSION_x === undefined,
             JSON.stringify(fusion.ILLUSION_x));
    verifier("H1, lui, garde sa vraie position",
             fusion.H1.q === 5 && fusion.H1.r === 3);

    // Contre-essai : la MÊME situation, mais l'illusion est encore VIVANTE
    // (juste née, appellation pas encore synchronisée) — là, le filet DOIT
    // jouer.
    const combattantsVivante = { H1: { id: "H1" }, ILLUSION_x: { id: "ILLUSION_x", aTerre: false } };
    const fusionVivante = fusionnerPionsVTT(pionsFirestore, pionsLocaux, combattantsVivante);
    verifier("une illusion encore vivante, elle, survit à l'instantané manquant",
             !!fusionVivante.ILLUSION_x && fusionVivante.ILLUSION_x.q === 3);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
