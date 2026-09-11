// LE REJEU D'UN DÉPLACEMENT IMPOSÉ DOIT DÉPLACER LA BONNE PERSONNE.
//
// LE TROU, TROUVÉ EN VÉRIFIANT LE FORMAT D'UNE ÉTAPE « POUSSÉE » AVANT D'EN
// CALQUER UNE POUR LA TRACTION.
//
// Un pas normal (`{type:"pas", acteur, de, vers}`) porte son `acteur` : celui
// qui marche. Poussée et Traction réutilisent le même applicateur pour ne pas
// dupliquer le code (« un déplacement imposé, un nom différent pour que
// l'écran choisisse la bonne animation ») — mais leur étape porte DEUX
// personnes : `acteur` (celui qui a lancé l'effet) et `cible` (celui qui
// bouge). L'applicateur, lui, ne lisait que `e.acteur` : rejouer une Poussée
// déplaçait donc LE LANCEUR jusqu'à la case d'arrivée, en laissant la vraie
// cible plantée sur place.
//
// POURQUOI PERSONNE NE L'AVAIT VU. Le calcul EN DIRECT (resoudreCarte, sur le
// poste qui tient le cerveau) mute le bon combattant sans passer par cet
// applicateur — il n'était donc jamais faux pour celui qui joue la carte. Le
// Bond, seul déplacement imposé déjà testé en rejeu, confond acteur et cible
// PAR NATURE (on se saute soi-même) : le bug ne pouvait pas s'y voir. Il ne
// devenait visible qu'en rejouant le journal sur un AUTRE poste, ou après une
// reconnexion — exactement le genre de divergence que cette architecture
// existe pour supprimer.
import { construireEtatCombat, appliquerEntree, creerDes } from '../combat_etat.js';
import { resoudreCarte, destinationTraction } from '../moteur_pur.js';
import { resoudreBond } from '../mouvement_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, camp, extra = {}) => ({
    idPersonnage: id, camp, prenom: id, PV_Max: 60, PV_Actuels: 60,
    Fatigue_Max: 100, Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Critique: 0,
    Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});

console.log("\n=========================================================");
console.log("  LE REJEU D'UN DÉPLACEMENT IMPOSÉ");
console.log("=========================================================");

// =========================================================================
console.log("\n1. LE TROU LUI-MÊME : REJOUER UNE POUSSÉE");
// =========================================================================
{
    const etat = construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 1,
        combattants: [fiche("LANCEUR", "Ennemi"), fiche("CIBLE", "Allié")],
        positions: { LANCEUR: { q: 0, r: 0 }, CIBLE: { q: 1, r: 0 } },
        partie: { Tour_Combat: 1 }
    });
    const entree = { v: 1, etapes: [
        { type: "poussee", cible: "CIBLE", acteur: "LANCEUR", de: { q: 1, r: 0 }, vers: { q: 3, r: 0 } }
    ] };
    const apres = appliquerEntree(etat, entree);

    verifier("le lanceur n'a pas bougé d'un pouce",
             apres.combattants.LANCEUR.q === 0 && apres.combattants.LANCEUR.r === 0,
             `(${apres.combattants.LANCEUR.q},${apres.combattants.LANCEUR.r})`);
    verifier("c'est bien la cible qui a été poussée",
             apres.combattants.CIBLE.q === 3 && apres.combattants.CIBLE.r === 0,
             `(${apres.combattants.CIBLE.q},${apres.combattants.CIBLE.r})`);
}

// =========================================================================
console.log("\n2. LA MÊME CHOSE, POUR UNE TRACTION");
// =========================================================================
{
    const etat = construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 1,
        combattants: [fiche("LANCEUR", "Ennemi"), fiche("CIBLE", "Allié")],
        positions: { LANCEUR: { q: 0, r: 0 }, CIBLE: { q: 5, r: 0 } },
        partie: { Tour_Combat: 1 }
    });
    const entree = { v: 1, etapes: [
        { type: "traction", cible: "CIBLE", acteur: "LANCEUR", de: { q: 5, r: 0 }, vers: { q: 2, r: 0 } }
    ] };
    const apres = appliquerEntree(etat, entree);

    verifier("le lanceur reste où il est", apres.combattants.LANCEUR.q === 0);
    verifier("la cible est bien tirée vers lui",
             apres.combattants.CIBLE.q === 2, String(apres.combattants.CIBLE.q));
}

// =========================================================================
console.log("\n3. LE BOND, LUI, N'A JAMAIS EU CE PROBLÈME (acteur === cible)");
// =========================================================================
//  Contre-essai : c'est PARCE QUE le Bond confond les deux rôles que le bug
//  n'y était pas visible. On vérifie que sa correction éventuelle ne l'a pas
//  cassé au passage.
{
    const etat = construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 1,
        combattants: [fiche("SAUTEUR", "Allié")],
        positions: { SAUTEUR: { q: 0, r: 0 } },
        partie: { Tour_Combat: 1 }
    });
    const { etat: calcule } = resoudreBond(etat,
        { idLanceur: "SAUTEUR", vers: { q: 3, r: 0 }, portee: 4 }, creerDes(1), null);
    const rejoue = appliquerEntree(etat, { v: 1, etapes: [
        { type: "bond", cible: "SAUTEUR", acteur: "SAUTEUR", de: { q: 0, r: 0 }, vers: { q: 3, r: 0 } }
    ] });
    verifier("le calcul en direct et le rejeu du journal tombent d'accord",
             calcule.combattants.SAUTEUR.q === rejoue.combattants.SAUTEUR.q
             && calcule.combattants.SAUTEUR.r === rejoue.combattants.SAUTEUR.r,
             `direct (${calcule.combattants.SAUTEUR.q},${calcule.combattants.SAUTEUR.r}) `
             + `rejeu (${rejoue.combattants.SAUTEUR.q},${rejoue.combattants.SAUTEUR.r})`);
}

// =========================================================================
console.log("\n4. LE CALCUL EN DIRECT ET LE REJEU DOIVENT TOMBER D'ACCORD");
// =========================================================================
//  L'épreuve complète : on calcule une Poussée puis une Traction avec
//  resoudreCarte (ce que fait le poste qui tient le cerveau), on rejoue les
//  MÊMES étapes sur un état vierge (ce que fait n'importe quel autre poste),
//  et les deux doivent arriver exactement au même endroit.
{
    const monde = () => construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 1,
        combattants: [fiche("LANCEUR", "Ennemi"), fiche("CIBLE", "Allié")],
        positions: { LANCEUR: { q: 0, r: 0 }, CIBLE: { q: 1, r: 0 } },
        partie: { Tour_Combat: 1 }
    });

    const cartePoussee = {
        type: "carte", idLanceur: "LANCEUR", idCarte: "C1", attaques: [],
        alterations: [{ nom: "Poussée", chance: 100, cibles: ["CIBLE"] }],
        jets: { attaqueRatee: false,
                parCible: { CIBLE: { esquive: false, etats: { "Poussée": true }, bouscule: false } } }
    };
    const { etat: chezLeCerveau, etapes } = resoudreCarte(monde(), cartePoussee);
    const chezLAutre = appliquerEntree(monde(), { v: 1, etapes });

    verifier("Poussée : mêmes coordonnées, calcul direct contre rejeu",
             chezLeCerveau.combattants.CIBLE.q === chezLAutre.combattants.CIBLE.q
             && chezLeCerveau.combattants.CIBLE.r === chezLAutre.combattants.CIBLE.r,
             `direct (${chezLeCerveau.combattants.CIBLE.q},${chezLeCerveau.combattants.CIBLE.r}) `
             + `rejeu (${chezLAutre.combattants.CIBLE.q},${chezLAutre.combattants.CIBLE.r})`);
    verifier("et le lanceur n'a bougé nulle part, dans aucun des deux mondes",
             chezLeCerveau.combattants.LANCEUR.q === 0 && chezLAutre.combattants.LANCEUR.q === 0);

    const carteTraction = {
        type: "carte", idLanceur: "LANCEUR", idCarte: "C2", attaques: [],
        alterations: [{ nom: "Traction", chance: 100, cibles: ["CIBLE"] }],
        jets: { attaqueRatee: false,
                parCible: { CIBLE: { esquive: false, etats: { "Traction": true } } } }
    };
    const loin = () => construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 1,
        combattants: [fiche("LANCEUR", "Ennemi"), fiche("CIBLE", "Allié")],
        positions: { LANCEUR: { q: 0, r: 0 }, CIBLE: { q: 6, r: 0 } },
        partie: { Tour_Combat: 1 }
    });
    const { etat: directTraction, etapes: etapesTraction } = resoudreCarte(loin(), carteTraction);
    const rejoueTraction = appliquerEntree(loin(), { v: 1, etapes: etapesTraction });
    verifier("Traction : mêmes coordonnées, calcul direct contre rejeu",
             directTraction.combattants.CIBLE.q === rejoueTraction.combattants.CIBLE.q,
             `direct ${directTraction.combattants.CIBLE.q} rejeu ${rejoueTraction.combattants.CIBLE.q}`);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
