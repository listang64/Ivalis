// PERSONNAGES ET MONSTRES NE DOIVENT PLUS DÉCIDER D'UN PV EN PLEIN COMBAT.
//
// MÊME TROU QUE COMBAT_VTT, UNE PORTE PLUS LOIN.
//
// `PERSOS_PARTIE` (la liste que tout le combat lit) se reconstruit ENTIÈREMENT
// à chaque instantané des collections Personnages ou Monstres
// (recomposerCombattants, monstres.js). Or ces documents ne reçoivent plus une
// seule écriture de PV, de fatigue, de bouclier ou d'états depuis que le
// combat vit dans l'état du cerveau : ils se figent au moment où le combat
// s'ouvre.
//
// Un geste SANS AUCUN RAPPORT avec le combat — une fiche qu'on corrige, un
// monstre qu'on retouche entre deux tours — refait alors vivre CE
// combattant-là (et lui seul, la requête ne renvoie que ce qui a changé) à sa
// valeur d'AVANT le combat.
//
// Un filet existait déjà (figerAffichageRetenus, sequence_tour.js), mais pour
// un problème voisin et différent : il retient l'affichage d'un combattant
// dont l'ANIMATION n'a pas fini de rejouer son tour. Il ne protège donc que
// les combattants activement en train de jouer — jamais ceux qui attendent,
// debout, entre deux actions : le cas le plus fréquent d'un combat, et
// justement celui qui restait ouvert.
import { fusionnerFichesCombat } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

console.log("\n=========================================================");
console.log("  LES FICHES NE DOIVENT PLUS RECULER EN PLEIN COMBAT");
console.log("=========================================================");

// =========================================================================
console.log("\n1. LE TROU LUI-MÊME : UNE FICHE ÉDITÉE NE FAIT PLUS REMONTER LES PV");
// =========================================================================
{
    // Ce que Firestore renvoie : la valeur D'OUVERTURE du combat, jamais mise
    // à jour depuis (H1 y est encore plein de vie).
    const fraiches = [
        { idPersonnage: "H1", PV_Actuels: 60, Fatigue_Actuelle: 100, Bouclier_Actuel: 0, Etats_Alteres: [] },
        { idPersonnage: "H2", PV_Actuels: 50, Fatigue_Actuelle: 100, Bouclier_Actuel: 0, Etats_Alteres: [] }
    ];
    // Ce que le cerveau a fait subir depuis, et que l'écran montre déjà.
    const actuelles = [
        { idPersonnage: "H1", PV_Actuels: 12, Fatigue_Actuelle: 40, Bouclier_Actuel: 5,
          Etats_Alteres: [{ nom: "Brûlé", duree: 2 }] },
        { idPersonnage: "H2", PV_Actuels: 50, Fatigue_Actuelle: 90, Bouclier_Actuel: 0, Etats_Alteres: [] }
    ];
    const combattants = { H1: { id: "H1" }, H2: { id: "H2" } };

    const fusion = fusionnerFichesCombat(fraiches, actuelles, combattants);
    const h1 = fusion.find(f => f.idPersonnage === "H1");

    verifier("H1 garde ses VRAIS points de vie, pas ceux d'ouverture",
             h1.PV_Actuels === 12, `${h1.PV_Actuels} PV`);
    verifier("sa fatigue aussi", h1.Fatigue_Actuelle === 40);
    verifier("son bouclier aussi", h1.Bouclier_Actuel === 5);
    verifier("et ses états altérés", h1.Etats_Alteres.length === 1 && h1.Etats_Alteres[0].nom === "Brûlé");
}

// =========================================================================
console.log("\n2. LES CHAMPS HORS COMBAT, EUX, SUIVENT LA FICHE FRAÎCHE");
// =========================================================================
//  Le nom, l'image, l'équipement : rien de tout ça n'appartient au cerveau. Si
//  le joueur vient de changer d'armure, ça doit se voir.
{
    const fraiches = [{ idPersonnage: "H1", PV_Actuels: 60, urlCloudinary: "nouvelle-armure.png",
                        Fatigue_Actuelle: 100, Bouclier_Actuel: 0, Etats_Alteres: [] }];
    const actuelles = [{ idPersonnage: "H1", PV_Actuels: 12, urlCloudinary: "ancienne-armure.png",
                        Fatigue_Actuelle: 40, Bouclier_Actuel: 0, Etats_Alteres: [] }];
    const fusion = fusionnerFichesCombat(fraiches, actuelles, { H1: { id: "H1" } });
    verifier("les PV restent ceux du cerveau", fusion[0].PV_Actuels === 12);
    verifier("mais l'armure suit bien le changement",
             fusion[0].urlCloudinary === "nouvelle-armure.png", fusion[0].urlCloudinary);
}

// =========================================================================
console.log("\n3. UN COMBATTANT QUE LE CERVEAU NE CONNAÎT PAS N'EST PAS TOUCHÉ");
// =========================================================================
//  Hors combat, ou pour un personnage qui n'y participe pas : la fiche fraîche
//  fait foi sans réserve, comme avant ce correctif.
{
    const fraiches = [{ idPersonnage: "SPECTATEUR", PV_Actuels: 60 }];
    const actuelles = [{ idPersonnage: "SPECTATEUR", PV_Actuels: 12 }];
    const fusion = fusionnerFichesCombat(fraiches, actuelles, { AUTRE: { id: "AUTRE" } });
    verifier("un combattant hors du cerveau suit la base sans réserve",
             fusion[0].PV_Actuels === 60);
}

// =========================================================================
console.log("\n4. HORS COMBAT (PAS DE CERVEAU OUVERT DU TOUT)");
// =========================================================================
{
    const fraiches = [{ idPersonnage: "H1", PV_Actuels: 60 }];
    const fusion = fusionnerFichesCombat(fraiches, [{ idPersonnage: "H1", PV_Actuels: 12 }], null);
    verifier("sans cerveau ouvert, la base décide seule", fusion[0].PV_Actuels === 60);
}

// =========================================================================
console.log("\n5. LA TOUTE PREMIÈRE APPARITION D'UN COMBATTANT");
// =========================================================================
//  Rien à protéger encore : c'est la fiche fraîche qui pose la première pierre.
{
    const fraiches = [{ idPersonnage: "RENFORT", PV_Actuels: 40 }];
    const fusion = fusionnerFichesCombat(fraiches, [], { RENFORT: { id: "RENFORT" } });
    verifier("le tout premier rendu prend la valeur connue", fusion[0].PV_Actuels === 40);
}

// =========================================================================
console.log("\n6. UN MONSTRE EST PROTÉGÉ EXACTEMENT COMME UN HÉROS");
// =========================================================================
//  Les deux listes (joueurs, monstres) se rejoignent dans la même fonction :
//  aucune raison qu'un gabarit retouché fasse revivre un monstre déjà entamé.
{
    const fraiches = [{ idPersonnage: "GOBELIN_1", PV_Actuels: 30, estMonstre: true }];
    const actuelles = [{ idPersonnage: "GOBELIN_1", PV_Actuels: 6, estMonstre: true }];
    const fusion = fusionnerFichesCombat(fraiches, actuelles, { GOBELIN_1: { id: "GOBELIN_1" } });
    verifier("le monstre garde ses PV réels, pas ceux du gabarit", fusion[0].PV_Actuels === 6);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
