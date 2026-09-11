// TRACTION ET PEUR, ENFIN DANS LE CERVEAU.
//
// Depuis le passage au nouveau régime, ces deux effets ne posaient plus l'état
// fantôme de durée zéro qu'ils posaient avant — mais ils ne déplaçaient
// toujours rien : le cerveau annonçait juste leur nom (« Traction », « Peur »)
// et n'y touchait pas. C'était un trou connu, muet plutôt que dangereux — mais
// tant qu'il restait ouvert, il était impossible de supprimer les vieilles
// fonctions de l'ancien moteur qui, elles, savaient encore le faire : elles
// étaient la seule référence.
//
// TRACTION est le symétrique déterministe de la Poussée (destinationTraction,
// moteur_pur.js) : aucun dé de géométrie, elle se résout donc directement dans
// resoudreCarte, comme la Poussée.
//
// PEUR est plus dure : fuir suppose un jet de DIRECTION à chaque case, un
// nombre de jets qui dépend du chemin lui-même. resoudreCarte n'a plus de dé
// en main (tirerDesCarte a déjà tout tiré) : elle se résout donc juste après,
// dans le cerveau (resoudrePeur, mouvement_pur.js), avec les dés du cerveau —
// exactement comme les attaques d'opportunité d'une marche normale.
import { construireEtatCombat, creerDes, combattant } from '../combat_etat.js';
import { appliquerIntention } from '../cerveau_combat.js';
import { destinationTraction } from '../moteur_pur.js';
import { resoudrePeur, distance } from '../mouvement_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, camp, extra = {}) => ({
    idPersonnage: id, camp, prenom: id, PV_Max: 60, PV_Actuels: 60,
    Fatigue_Max: 100, Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Critique: 0,
    Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});

console.log("\n=========================================================");
console.log("  TRACTION ET PEUR DANS LE CERVEAU");
console.log("=========================================================");

// =========================================================================
console.log("\n1. LA GÉOMÉTRIE DE LA TRACTION : L'INVERSE EXACT DE LA POUSSÉE");
// =========================================================================
{
    const lanceur = { q: 0, r: 0 };
    const cible = { q: 5, r: 0 };
    const libre = () => true;

    verifier("elle tire de 3 cases par défaut, vers le lanceur",
             JSON.stringify(destinationTraction(lanceur, cible, undefined, libre)) === JSON.stringify({ q: 2, r: 0 }),
             JSON.stringify(destinationTraction(lanceur, cible, undefined, libre)));
    verifier("au contact, il n'y a rien à tirer",
             destinationTraction(lanceur, { q: 1, r: 0 }, 3, libre) === null);
    verifier("elle ne va jamais jusqu'au lanceur lui-même",
             destinationTraction(lanceur, { q: 2, r: 0 }, 3, libre).q !== 0);

    // La case (4,0) est le premier pas vers le lanceur : bloquée d'emblée, la
    // traction n'a nulle part où aller.
    const bloqueeDesLePremierPas = (q, r) => !(q === 4 && r === 0);
    verifier("bloquée dès le premier pas, la traction ne tire nulle part",
             destinationTraction(lanceur, cible, 3, bloqueeDesLePremierPas) === null);
}

// =========================================================================
console.log("\n2. LA TRACTION, PAR LA VRAIE PORTE DU CERVEAU");
// =========================================================================
{
    const monde = () => construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 7,
        combattants: [fiche("LANCEUR", "Ennemi", { idJoueur: "P_01" }), fiche("CIBLE", "Allié")],
        positions: { LANCEUR: { q: 0, r: 0 }, CIBLE: { q: 6, r: 0 } },
        partie: { Tour_Combat: 1, File_Attente_Combat: [{ idPersonnage: "LANCEUR", initiative: 10 }] }
    });

    const pas = appliquerIntention(monde(), {
        id: "i1", type: "carte", acteur: "LANCEUR", idCarte: "C_TRACTION",
        attaques: [], alterations: [{ nom: "Traction", chance: 100, cibles: ["CIBLE"] }],
        coutFatigue: 10
    }, null);

    const c = combattant(pas.etat, "CIBLE");
    verifier("la cible a bien été tirée vers le lanceur", c.q === 3, `(${c.q},${c.r})`);
    verifier("une étape de traction le raconte",
             pas.entree.etapes.some(e => e.type === "traction" && e.cible === "CIBLE"),
             JSON.stringify(pas.entree.etapes.map(e => e.type)));
}

// =========================================================================
console.log("\n3. LA FUITE : LOIN DU LANCEUR, JAMAIS SUR UNE CASE DÉJÀ PRISE");
// =========================================================================
{
    const monde = () => construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 3,
        combattants: [fiche("BOURREAU", "Ennemi"), fiche("PROIE", "Allié")],
        positions: { BOURREAU: { q: 0, r: 0 }, PROIE: { q: 1, r: 0 } },
        partie: { Tour_Combat: 1 }
    });

    for (let g = 1; g <= 15; g++) {
        const etat = monde();
        const etapes = resoudrePeur(etat, "BOURREAU", "PROIE", creerDes(g), null);
        const c = combattant(etat, "PROIE");
        const distFinale = distance({ q: 0, r: 0 }, c);
        verifier(`graine ${g} : la proie s'est éloignée`, distFinale > 1,
                 `distance ${distFinale}, (${c.q},${c.r})`);

        const vus = new Set([`1,0`]);
        let repete = false;
        etapes.filter(e => e.type === "pas").forEach(e => {
            const cle = `${e.vers.q},${e.vers.r}`;
            if (vus.has(cle)) repete = true;
            vus.add(cle);
        });
        verifier(`graine ${g} : jamais deux fois la même case`, !repete);
    }
}

// =========================================================================
console.log("\n4. LA FUITE COÛTE DE LA FATIGUE — 2 PAR CASE");
// =========================================================================
{
    const etat = construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 3,
        combattants: [fiche("BOURREAU", "Ennemi"), fiche("PROIE", "Allié")],
        positions: { BOURREAU: { q: 0, r: 0 }, PROIE: { q: 1, r: 0 } },
        partie: { Tour_Combat: 1 }
    });
    const avant = combattant(etat, "PROIE").fatigue;
    const etapes = resoudrePeur(etat, "BOURREAU", "PROIE", creerDes(3), null);
    const nbPas = etapes.filter(e => e.type === "pas").length;
    const c = combattant(etat, "PROIE");
    verifier("elle a fui au moins une case", nbPas > 0, String(nbPas));
    verifier("et perdu exactement 2 par case parcourue",
             c.fatigue === avant - nbPas * 2, `${avant} → ${c.fatigue} (${nbPas} pas)`);
}

// =========================================================================
console.log("\n5. UN ENNEMI QUITTÉ EN CHEMIN FRAPPE — SAUF LE LANCEUR");
// =========================================================================
{
    const etat = construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 3,
        combattants: [
            fiche("BOURREAU", "Ennemi"),
            // Un second ennemi, au contact de la proie dès le départ : il doit
            // pouvoir la frapper si elle le quitte.
            fiche("GARDE", "Ennemi", { Esquive: 0 }),
            fiche("PROIE", "Allié")
        ],
        positions: { BOURREAU: { q: 0, r: 0 }, GARDE: { q: 2, r: 0 }, PROIE: { q: 1, r: 0 } },
        partie: { Tour_Combat: 1 }
    });

    let uneOpportunite = false;
    for (let g = 1; g <= 20 && !uneOpportunite; g++) {
        const copie = construireEtatCombat({
            idPartie: "P1", cerveau: "P1", graine: 3,
            combattants: [
                fiche("BOURREAU", "Ennemi"), fiche("GARDE", "Ennemi"), fiche("PROIE", "Allié")
            ],
            positions: { BOURREAU: { q: 0, r: 0 }, GARDE: { q: 2, r: 0 }, PROIE: { q: 1, r: 0 } },
            partie: { Tour_Combat: 1 }
        });
        const etapes = resoudrePeur(copie, "BOURREAU", "PROIE", creerDes(g), null);
        if (etapes.some(e => e.type === "opportunite")) {
            uneOpportunite = true;
            verifier("l'opportunité vient bien du GARDE, jamais du BOURREAU",
                     !etapes.some(e => e.type === "opportunite" && e.attaquant === "BOURREAU"),
                     JSON.stringify(etapes.filter(e => e.type === "opportunite")
                                          .map(e => e.attaquant)));
        }
    }
    verifier("au moins une des 20 graines a déclenché une opportunité",
             uneOpportunite, uneOpportunite ? "trouvée" : "aucune en 20 essais");
}

// =========================================================================
console.log("\n6. TOUTE PORTE FERMÉE : LA FUITE S'ARRÊTE, ET C'EST DIT");
// =========================================================================
{
    // La proie est enfermée dans un couloir sans issue : six voisins bloqués.
    const mur = { etatCase: (q, r) => ({ bloquee: !(q === 1 && r === 0), supprimee: false }) };
    const etat = construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 3,
        combattants: [fiche("BOURREAU", "Ennemi"), fiche("PROIE", "Allié")],
        positions: { BOURREAU: { q: 0, r: 0 }, PROIE: { q: 1, r: 0 } },
        partie: { Tour_Combat: 1 }
    });
    const etapes = resoudrePeur(etat, "BOURREAU", "PROIE", creerDes(3), mur);
    const c = combattant(etat, "PROIE");
    verifier("la proie n'a pas bougé", c.q === 1 && c.r === 0);
    verifier("et c'est annoncé, pas passé sous silence",
             etapes.some(e => e.type === "message" && /bloquée/i.test(e.texte || "")),
             JSON.stringify(etapes));
}

// =========================================================================
console.log("\n7. LA PEUR, PAR LA VRAIE PORTE DU CERVEAU (CARTE COMPLÈTE)");
// =========================================================================
{
    const etat = construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 11,
        combattants: [fiche("BOURREAU", "Ennemi", { idJoueur: "P_01" }), fiche("PROIE", "Allié")],
        positions: { BOURREAU: { q: 0, r: 0 }, PROIE: { q: 1, r: 0 } },
        partie: { Tour_Combat: 1, File_Attente_Combat: [{ idPersonnage: "BOURREAU", initiative: 10 }] }
    });

    const pas = appliquerIntention(etat, {
        id: "i1", type: "carte", acteur: "BOURREAU", idCarte: "C_PEUR",
        attaques: [], alterations: [{ nom: "Peur", chance: 100, cibles: ["PROIE"] }],
        coutFatigue: 10
    }, null);

    const c = combattant(pas.etat, "PROIE");
    verifier("la proie a fui — elle n'est plus à côté du bourreau",
             !(c.q === 1 && c.r === 0), `(${c.q},${c.r})`);
    verifier("l'étape de carte ET les pas de la fuite sont dans la même entrée",
             pas.entree.etapes.some(e => e.type === "carte")
             && pas.entree.etapes.some(e => e.type === "pas" && e.acteur === "PROIE"),
             JSON.stringify(pas.entree.etapes.map(e => e.type)));
}

// =========================================================================
console.log("\n8. UNE CIBLE QUI ESQUIVE OU RATE SON JET NE FUIT PAS");
// =========================================================================
//  La Peur, comme tout le reste, passe d'abord par l'esquive et le jet de
//  chance générique (voir resoudreCarte) — resoudrePeur ne doit jamais courir
//  après un jet manqué.
{
    const etat = construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 11,
        combattants: [fiche("BOURREAU", "Ennemi", { idJoueur: "P_01" }), fiche("PROIE", "Allié")],
        positions: { BOURREAU: { q: 0, r: 0 }, PROIE: { q: 1, r: 0 } },
        partie: { Tour_Combat: 1, File_Attente_Combat: [{ idPersonnage: "BOURREAU", initiative: 10 }] }
    });
    const pas = appliquerIntention(etat, {
        id: "i1", type: "carte", acteur: "BOURREAU", idCarte: "C_PEUR",
        attaques: [], alterations: [{ nom: "Peur", chance: 0, cibles: ["PROIE"] }],
        coutFatigue: 10
    }, null);
    const c = combattant(pas.etat, "PROIE");
    verifier("chance à 0 % : la proie reste plantée là où elle était",
             c.q === 1 && c.r === 0, `(${c.q},${c.r})`);
    verifier("et aucun pas de fuite n'apparaît dans le journal",
             !pas.entree.etapes.some(e => e.type === "pas" && e.acteur === "PROIE"),
             JSON.stringify(pas.entree.etapes.map(e => e.type)));
}

// =========================================================================
console.log("\n9. MÊME GRAINE, MÊME FUITE — SUR TROIS POSTES");
// =========================================================================
{
    const monde = () => construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 3,
        combattants: [fiche("BOURREAU", "Ennemi"), fiche("PROIE", "Allié")],
        positions: { BOURREAU: { q: 0, r: 0 }, PROIE: { q: 1, r: 0 } },
        partie: { Tour_Combat: 1 }
    });
    const resultats = [1, 2, 3].map(() => {
        const etat = monde();
        const etapes = resoudrePeur(etat, "BOURREAU", "PROIE", creerDes(2024), null);
        const c = combattant(etat, "PROIE");
        return JSON.stringify({ q: c.q, r: c.r, fatigue: c.fatigue, pas: etapes.length });
    });
    verifier("les trois postes voient exactement la même fuite",
             resultats[0] === resultats[1] && resultats[1] === resultats[2], resultats[0]);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
