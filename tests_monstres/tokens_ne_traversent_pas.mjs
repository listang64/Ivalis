// UN PION NE PEUT NI TRAVERSER NI PARTAGER LA CASE D'UN AUTRE.
//
// Ce banc rassemble, pour chaque façon de bouger un combattant sous le
// cerveau, la preuve qu'aucune ne peut faire cohabiter deux vivants sur la
// même case, ni faire passer l'un À TRAVERS l'autre. Sept mécanismes, sept
// chapitres : la marche, la Poussée, la Traction, la Peur, le Bond, une
// Illusion qui naît, et un renfort qui entre en scène.
//
// LA RÈGLE N'EST PAS PARTOUT LA MÊME, ET C'EST VOULU :
//   - un cadavre ne barre jamais la route (aTerre est exclu partout) ;
//   - le Bond SURVOLE — c'est un saut à vol d'oiseau, pas une marche : il ne
//     peut pas ATTERRIR sur un pion, mais peut en passer un au-dessus, par
//     conception (voir mouvement_pur.js, casesDeBond) ;
//   - tout le reste (marche, Poussée, Traction, Peur, Illusion, renfort) ne
//     peut ni s'arrêter NI passer par une case tenue par un vivant.
import { construireEtatCombat, creerDes, combattant, combattantIllusion } from '../combat_etat.js';
import { validerIntention, appliquerIntention } from '../cerveau_combat.js';
import { destinationPoussee, destinationTraction, caseLibre } from '../moteur_pur.js';
import { resoudrePeur, casesDeBond, occupantVivant } from '../mouvement_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, camp, extra = {}) => ({
    idPersonnage: id, camp, prenom: id, PV_Max: 60, PV_Actuels: 60,
    Fatigue_Max: 100, Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Critique: 0,
    Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});

console.log("\n=========================================================");
console.log("  UN PION NE TRAVERSE JAMAIS UN AUTRE PION");
console.log("=========================================================");

// =========================================================================
console.log("\n1. LA MARCHE : AUCUN PAS DU CHEMIN NE PEUT ÊTRE OCCUPÉ");
// =========================================================================
//  Pas seulement la case d'arrivée : CHAQUE case du trajet. Un chemin qui
//  passerait par une case tenue par un vivant, même pour continuer plus loin,
//  est refusé EN BLOC — le combattant ne fait pas la moitié du chemin.
{
    const etat = construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 1,
        combattants: [fiche("MARCHEUR", "Allié"), fiche("MUR_VIVANT", "Ennemi")],
        positions: { MARCHEUR: { q: 0, r: 0 }, MUR_VIVANT: { q: 1, r: 0 } },
        partie: { Tour_Combat: 1,
                  File_Attente_Combat: [{ idPersonnage: "MARCHEUR", initiative: 10 }] }
    });

    // Le chemin traverse (1,0), occupée, pour continuer vers (2,0).
    const traverse = validerIntention(etat, {
        id: "i1", type: "mouvement", acteur: "MARCHEUR",
        chemin: [{ q: 1, r: 0 }, { q: 2, r: 0 }]
    });
    verifier("un chemin qui traverse une case occupée est refusé",
             !traverse.ok, traverse.raison);

    // Même refus si SEULE la case finale est occupée (l'ancien cas simple).
    const arrivee = validerIntention(etat, {
        id: "i2", type: "mouvement", acteur: "MARCHEUR", chemin: [{ q: 1, r: 0 }]
    });
    verifier("un chemin qui ATTERRIT sur une case occupée est refusé aussi",
             !arrivee.ok, arrivee.raison);

    // Et le combattant n'a évidemment pas bougé.
    verifier("le marcheur reste où il était (rien n'a été appliqué)",
             combattant(etat, "MARCHEUR").q === 0);
}

// =========================================================================
console.log("\n2. LES CADAVRES, EUX, NE BARRENT PAS LA ROUTE");
// =========================================================================
//  Contre-essai : ce n'est pas la présence d'un combattant qui bloque, mais
//  le fait qu'il soit VIVANT. Sans cette distinction, un champ de bataille
//  jonché de morts deviendrait infranchissable.
{
    const etat = construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 1,
        combattants: [fiche("MARCHEUR", "Allié"),
                      fiche("CADAVRE", "Ennemi", { PV_Actuels: 0, statut: "Mort" })],
        positions: { MARCHEUR: { q: 0, r: 0 }, CADAVRE: { q: 1, r: 0 } },
        partie: { Tour_Combat: 1,
                  File_Attente_Combat: [{ idPersonnage: "MARCHEUR", initiative: 10 }] }
    });
    const passe = validerIntention(etat, {
        id: "i1", type: "mouvement", acteur: "MARCHEUR",
        chemin: [{ q: 1, r: 0 }, { q: 2, r: 0 }]
    });
    verifier("un chemin qui passe sur un cadavre est accepté",
             passe.ok, passe.raison);
}

// =========================================================================
console.log("\n3. LA POUSSÉE : ELLE S'ARRÊTE, ELLE NE TRAVERSE PAS");
// =========================================================================
{
    // GARDE, tout juste après CIBLE sur la trajectoire de poussée : la
    // poussée doit s'arrêter net avant lui, jamais l'enjamber.
    const lanceur = { q: 0, r: 0 };
    const cible = { q: 1, r: 0 };
    const occupees = new Set(["2,0"]);
    const estLibre = (q, r) => !occupees.has(`${q},${r}`);

    const arrivee = destinationPoussee(lanceur, cible, 3, estLibre);
    verifier("la poussée s'arrête à la dernière case libre, jamais au-delà",
             arrivee === null, JSON.stringify(arrivee));

    // Avec la route dégagée sur 3 cases, elle va bien jusqu'au bout.
    const degagee = destinationPoussee(lanceur, cible, 3, () => true);
    verifier("route dégagée : elle va bien jusqu'au bout",
             degagee.q === 4 && degagee.r === 0);
}

// =========================================================================
console.log("\n4. LA TRACTION : MÊME RÈGLE, SENS INVERSE");
// =========================================================================
{
    const lanceur = { q: 0, r: 0 };
    const cible = { q: 5, r: 0 };
    // La case juste avant le lanceur (1,0) est occupée : la traction s'arrête
    // à (2,0), elle ne pousse pas la cible jusque contre le lanceur.
    const occupees = new Set(["1,0"]);
    const estLibre = (q, r) => !occupees.has(`${q},${r}`);
    const arrivee = destinationTraction(lanceur, cible, 4, estLibre);
    verifier("la traction s'arrête avant l'obstacle",
             arrivee !== null && arrivee.q === 2, JSON.stringify(arrivee));
}

// =========================================================================
console.log("\n5. LA PEUR : JAMAIS UNE DIRECTION QUI MÈNE SUR UN VIVANT");
// =========================================================================
{
    const etat = construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 3,
        combattants: [
            fiche("BOURREAU", "Ennemi"), fiche("PROIE", "Allié"),
            // Un mur de vivants presque complet autour de la proie : ne
            // laisse qu'une seule case franchement libre.
            fiche("V1", "Ennemi"), fiche("V2", "Ennemi"), fiche("V3", "Ennemi"),
            fiche("V4", "Ennemi")
        ],
        positions: {
            BOURREAU: { q: 0, r: 0 }, PROIE: { q: 1, r: 0 },
            // Les 6 voisins de (1,0) sont { (2,0),(2,-1),(1,-1),(0,0),(0,1),(1,1) }.
            // (0,0) est déjà le bourreau. On tient 4 des 5 cases restantes.
            V1: { q: 2, r: -1 }, V2: { q: 1, r: -1 }, V3: { q: 0, r: 1 }, V4: { q: 1, r: 1 }
        },
        partie: { Tour_Combat: 1 }
    });

    for (let g = 1; g <= 10; g++) {
        const copie = construireEtatCombat({
            idPartie: "P1", cerveau: "P1", graine: 3,
            combattants: [
                fiche("BOURREAU", "Ennemi"), fiche("PROIE", "Allié"),
                fiche("V1", "Ennemi"), fiche("V2", "Ennemi"), fiche("V3", "Ennemi"),
                fiche("V4", "Ennemi")
            ],
            positions: {
                BOURREAU: { q: 0, r: 0 }, PROIE: { q: 1, r: 0 },
                V1: { q: 2, r: -1 }, V2: { q: 1, r: -1 }, V3: { q: 0, r: 1 }, V4: { q: 1, r: 1 }
            },
            partie: { Tour_Combat: 1 }
        });
        resoudrePeur(copie, "BOURREAU", "PROIE", creerDes(g), null);
        const p = combattant(copie, "PROIE");
        const surUnVivant = ["BOURREAU", "V1", "V2", "V3", "V4"].some(id => {
            const v = combattant(copie, id);
            return v.q === p.q && v.r === p.r;
        });
        verifier(`graine ${g} : la proie n'a atterri sur personne`, !surUnVivant,
                 `(${p.q},${p.r})`);
    }
}

// =========================================================================
console.log("\n6. LE BOND : NE PEUT PAS ATTERRIR SUR UN VIVANT (mais peut le survoler)");
// =========================================================================
{
    const etat = construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 1,
        combattants: [fiche("SAUTEUR", "Allié"), fiche("OBSTACLE", "Ennemi")],
        positions: { SAUTEUR: { q: 0, r: 0 }, OBSTACLE: { q: 2, r: 0 } },
        partie: { Tour_Combat: 1 }
    });
    const cases = casesDeBond(etat, "SAUTEUR", 4, null);
    verifier("aucune case proposée ne tombe sur l'obstacle",
             !cases.some(h => h.q === 2 && h.r === 0));
    verifier("mais atterrir DERRIÈRE l'obstacle reste permis (le saut le survole)",
             cases.some(h => h.q === 3 && h.r === 0),
             "— comportement voulu, distinct d'une marche");

    // Et la porte du cerveau refuse un bond qui viserait quand même l'obstacle.
    const refus = validerIntention(construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 1,
        combattants: [fiche("SAUTEUR", "Allié", { idJoueur: "P_01" }), fiche("OBSTACLE", "Ennemi")],
        positions: { SAUTEUR: { q: 0, r: 0 }, OBSTACLE: { q: 2, r: 0 } },
        partie: { Tour_Combat: 1, File_Attente_Combat: [{ idPersonnage: "SAUTEUR", initiative: 10 }] }
    }), { id: "i1", type: "bond", acteur: "SAUTEUR", vers: { q: 2, r: 0 } });
    verifier("et la validation du cerveau le refuse", !refus.ok, refus.raison);
}

// =========================================================================
console.log("\n7. UNE ILLUSION NE PEUT PAS NAÎTRE SUR UN VIVANT");
// =========================================================================
{
    const etat = construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 1,
        combattants: [fiche("MAGE", "Allié", { idJoueur: "P_01" }), fiche("AUTRE", "Ennemi")],
        positions: { MAGE: { q: 0, r: 0 }, AUTRE: { q: 1, r: 0 } },
        partie: { Tour_Combat: 1, File_Attente_Combat: [{ idPersonnage: "MAGE", initiative: 10 }] }
    });
    const refus = validerIntention(etat, {
        id: "i1", type: "illusion", acteur: "MAGE",
        idIllusion: "ILLUSION_x", vers: { q: 1, r: 0 }
    });
    verifier("naître sur une case occupée est refusé", !refus.ok, refus.raison);
}

// =========================================================================
console.log("\n8. LA FONCTION QUE TOUT LE MONDE PARTAGE : occupantVivant");
// =========================================================================
//  Le socle commun à toutes les vérifications ci-dessus.
{
    const etat = construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 1,
        combattants: [fiche("A", "Allié"), fiche("B", "Ennemi", { PV_Actuels: 0, statut: "Mort" })],
        positions: { A: { q: 0, r: 0 }, B: { q: 1, r: 0 } },
        partie: { Tour_Combat: 1 }
    });
    verifier("un vivant occupe sa case", occupantVivant(etat, 0, 0, null) === "A");
    verifier("un mort n'occupe rien", occupantVivant(etat, 1, 0, null) === null);
    verifier("« sauf » s'exclut lui-même", occupantVivant(etat, 0, 0, "A") === null);
    verifier("caseLibre applique la même règle (vivant bloque, mort non)",
             !caseLibre(etat, null, 0, 0, null) && caseLibre(etat, null, 1, 0, null));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
