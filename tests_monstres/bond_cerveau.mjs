// LE BOND, RAMENÉ DANS LE CERVEAU.
//
// Sauter par-dessus le terrain : ni fatigue, ni attaque d'opportunité — c'est
// ce qui distingue un bond d'une course.
//
// CE QUI ÉTAIT CASSÉ, ET POURQUOI C'ÉTAIT LE PLUS GRAVE DES CINQ.
//
// resoudreBondInteractif faisait TOUT dans le navigateur du joueur : il
// déplaçait le pion dans TOKENS_VTT_DATA et écrivait la position directement
// dans Firestore. Et il le faisait depuis demarrerCiblage — la phase
// d'extraction PARTAGÉE par les deux régimes, celle qui tourne avant même le
// choix entre l'ancien moteur et le cerveau.
//
// Autrement dit : sous le régime du cerveau, il y avait deux écrivains pour une
// même vérité. Le cerveau ne savait rien du saut ; à sa prochaine publication,
// il reposait le pion là où il croyait qu'il était. Le saut revenait en
// arrière, ou ne se voyait que sur l'écran de celui qui avait sauté. C'est
// exactement le genre de divergence que tout ce régime existe pour supprimer.
//
// Ce qui reste à l'écran : le CHOIX de la case. C'est du ciblage — un seul
// joueur clique, comme on désigne une cible. Ce qui remonte au cerveau n'est
// plus un déplacement déjà fait, c'est une intention : « je saute là ».
import { casesDeBond, resoudreBond } from '../mouvement_pur.js';
import { construireEtatCombat, creerDes } from '../combat_etat.js';
import { validerIntention, appliquerIntention } from '../cerveau_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, camp, extra = {}) => ({
    idPersonnage: id, camp, prenom: id, PV_Max: 60, PV_Actuels: 60,
    Fatigue_Max: 100, Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Critique: 0,
    Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});

const monde = ({ etats = [], zones = {}, file = null } = {}) => construireEtatCombat({
    idPartie: "P1", cerveau: "P_01", graine: 12,
    combattants: [fiche("SAUTEUR", "Allié", { Etats_Alteres: etats, idJoueur: "P_01" }),
                  fiche("GENEUR", "Ennemi")],
    positions: { SAUTEUR: { q: 0, r: 0 }, GENEUR: { q: 2, r: 0 } },
    partie: { Tour_Combat: 1,
              File_Attente_Combat: file || [{ idPersonnage: "SAUTEUR", initiative: 10 }] },
    zones
});

console.log("\n=========================================================");
console.log("  LE BOND DANS LE CERVEAU");
console.log("=========================================================");

// =========================================================================
console.log("\n1. LE SAUT DÉPLACE VRAIMENT, ET DANS L'ÉTAT");
// =========================================================================
{
    const { etat: apres, etapes } = resoudreBond(monde(),
        { idLanceur: "SAUTEUR", vers: { q: 3, r: 0 }, portee: 4 }, creerDes(1), null);

    const c = apres.combattants.SAUTEUR;
    verifier("le sauteur a changé de case", c.q === 3 && c.r === 0, `(${c.q},${c.r})`);
    verifier("une étape « bond » le raconte",
             etapes.some(e => e.type === "bond"), JSON.stringify(etapes.map(e => e.type)));

    const saut = etapes.find(e => e.type === "bond");
    verifier("elle dit d'où l'on part", saut.de.q === 0 && saut.de.r === 0);
    verifier("et où l'on arrive", saut.vers.q === 3 && saut.vers.r === 0);
}

// =========================================================================
console.log("\n2. UN BOND NE COÛTE RIEN ET NE PROVOQUE RIEN");
// =========================================================================
//  C'est toute la différence avec une course : on survole. Le géant à côté ne
//  peut pas frapper au passage, et l'énergie ne bouge pas.
{
    const etat = monde();
    etat.combattants.GENEUR.q = 1; etat.combattants.GENEUR.r = 0;  // au contact
    const { etat: apres, etapes } = resoudreBond(etat,
        { idLanceur: "SAUTEUR", vers: { q: 0, r: 3 }, portee: 4 }, creerDes(1), null);

    verifier("l'énergie n'a pas bougé",
             apres.combattants.SAUTEUR.fatigue === 100,
             String(apres.combattants.SAUTEUR.fatigue));
    verifier("aucune attaque d'opportunité",
             !etapes.some(e => e.type === "opportunite"),
             JSON.stringify(etapes.map(e => e.type)));
    verifier("les points de vie sont intacts", apres.combattants.SAUTEUR.pv === 60);
}

// =========================================================================
console.log("\n3. LES CASES PERMISES : UNE SEULE DÉFINITION");
// =========================================================================
//  L'écran éclaire des cases, le cerveau en valide d'autres : le joueur clique
//  un hexagone que le cerveau refuse, et sa carte est consommée pour rien. Une
//  seule fonction, lue des deux côtés.
{
    const etat = monde();
    const cases = casesDeBond(etat, "SAUTEUR", 2, null);

    verifier("sa propre case n'en est pas une",
             !cases.some(h => h.q === 0 && h.r === 0));
    verifier("la case d'un vivant non plus",
             !cases.some(h => h.q === 2 && h.r === 0),
             `(2,0) ${cases.some(h => h.q === 2 && h.r === 0) ? "proposée" : "écartée"}`);
    verifier("rien au-delà de la portée",
             cases.every(h => (Math.abs(h.q) + Math.abs(h.q + h.r) + Math.abs(h.r)) / 2 <= 2));
    verifier("mais il reste de quoi sauter", cases.length > 0, `${cases.length} cases`);

    // Un mur bloque, un trou se survole — mais on n'y atterrit pas.
    const terrain = {
        etatCase: (q, r) => ({ bloquee: q === 1 && r === 0,
                               supprimee: q === 0 && r === 1 })
    };
    const avecTerrain = casesDeBond(etat, "SAUTEUR", 2, terrain);
    verifier("on n'atterrit pas sur un mur",
             !avecTerrain.some(h => h.q === 1 && h.r === 0));
    verifier("ni dans un trou",
             !avecTerrain.some(h => h.q === 0 && h.r === 1));
    verifier("et un mur cache ce qu'il y a derrière",
             !avecTerrain.some(h => h.q === 2 && h.r === 0));
}

// =========================================================================
console.log("\n4. UNE CASE INTERDITE EST REFUSÉE, ET C'EST DIT");
// =========================================================================
//  Un client bricolé — page modifiée, bug d'interface — ne doit pas pouvoir
//  téléporter son pion à l'autre bout du plateau.
{
    const loin = resoudreBond(monde(),
        { idLanceur: "SAUTEUR", vers: { q: 9, r: 0 }, portee: 2 }, creerDes(1), null);
    verifier("hors de portée : le pion ne bouge pas",
             loin.etat.combattants.SAUTEUR.q === 0 && loin.etat.combattants.SAUTEUR.r === 0,
             `(${loin.etat.combattants.SAUTEUR.q},${loin.etat.combattants.SAUTEUR.r})`);
    verifier("et le refus est annoncé, pas avalé en silence",
             loin.etapes.some(e => e.type === "message" && /impossible/i.test(e.texte || "")),
             JSON.stringify(loin.etapes.map(e => e.type)));

    const occupee = resoudreBond(monde(),
        { idLanceur: "SAUTEUR", vers: { q: 2, r: 0 }, portee: 4 }, creerDes(1), null);
    verifier("on n'atterrit pas sur quelqu'un",
             occupee.etat.combattants.SAUTEUR.q === 0);
}

// =========================================================================
console.log("\n5. L'IMMOBILISATION CLOUE SUR PLACE");
// =========================================================================
//  Elle bloque tout mouvement VOLONTAIRE. Les déplacements subis — poussée,
//  traction, peur — passent outre : on ne choisit pas de se faire pousser.
{
    const { etat: apres, etapes } = resoudreBond(monde({ etats: [{ nom: "Immobilisation", duree: 2 }] }),
        { idLanceur: "SAUTEUR", vers: { q: 3, r: 0 }, portee: 4 }, creerDes(1), null);

    verifier("le sauteur immobilisé ne bouge pas",
             apres.combattants.SAUTEUR.q === 0 && apres.combattants.SAUTEUR.r === 0);
    verifier("et l'échec nomme la raison",
             etapes.some(e => e.type === "echec" && e.raison === "Immobilisation"),
             JSON.stringify(etapes));
}

// =========================================================================
console.log("\n6. ATTERRIR DANS LE FEU BRÛLE");
// =========================================================================
//  Un saut n'est pas une échappatoire : la case d'arrivée compte comme
//  n'importe quelle case franchie à pied.
{
    const feu = {
        zp_feu: { id: "zp_feu", type: "feu", idLanceur: "GENEUR", dureeRestante: 3,
                  hexes: [{ q: 3, r: 0 }], degats: { valeurBrute: 14, typeRes: "Physique" },
                  soin: null, etat: null }
    };
    const { etat: apres, etapes } = resoudreBond(monde({ zones: feu }),
        { idLanceur: "SAUTEUR", vers: { q: 3, r: 0 }, portee: 4 }, creerDes(1), null);

    verifier("le sauteur encaisse la nappe", apres.combattants.SAUTEUR.pv < 60,
             `${apres.combattants.SAUTEUR.pv} PV`);
    verifier("et la brûlure vient bien APRÈS le saut",
             etapes.findIndex(e => e.type === "bond")
             < etapes.findIndex(e => e.type === "degats"),
             JSON.stringify(etapes.map(e => e.type)));

    // Sauter ailleurs ne coûte rien : la zone ne frappe que sa propre case.
    const ailleurs = resoudreBond(monde({ zones: feu }),
        { idLanceur: "SAUTEUR", vers: { q: 0, r: 3 }, portee: 4 }, creerDes(1), null);
    verifier("sauter à côté de la nappe ne brûle pas",
             ailleurs.etat.combattants.SAUTEUR.pv === 60);
}

// =========================================================================
console.log("\n7. L'INTENTION PASSE PAR LA PORTE COMMUNE");
// =========================================================================
//  Le cœur du correctif : le saut n'est plus une écriture directe, c'est une
//  intention, validée et exécutée comme un mouvement ou une carte.
{
    const etat = monde();

    verifier("le type « bond » est reconnu",
             validerIntention(etat, { id: "i1", type: "bond", acteur: "SAUTEUR",
                                      vers: { q: 3, r: 0 } }).ok);
    verifier("un bond sans case d'arrivée est refusé",
             !validerIntention(etat, { id: "i2", type: "bond", acteur: "SAUTEUR" }).ok);
    verifier("et un bond hors de son tour aussi",
             !validerIntention(etat, { id: "i3", type: "bond", acteur: "GENEUR",
                                       vers: { q: 3, r: 0 } }).ok);

    const pas = appliquerIntention(etat, { id: "i4", type: "bond", acteur: "SAUTEUR",
                                           vers: { q: 3, r: 0 }, portee: 4 }, null);
    verifier("l'intention produit une entrée de journal", !!pas && !!pas.etat);
    verifier("le pion est déplacé dans l'état publié",
             pas.etat.combattants.SAUTEUR.q === 3,
             `(${pas.etat.combattants.SAUTEUR.q},${pas.etat.combattants.SAUTEUR.r})`);

    // LE BOND NE CLÔT PAS LE TOUR : la carte qui le porte se résout après.
    verifier("le sauteur garde la main pour la suite de sa carte",
             (pas.etat.file || [])[0] && pas.etat.file[0].id === "SAUTEUR",
             JSON.stringify((pas.etat.file || []).map(f => f.id)));
}

// =========================================================================
console.log("\n8. MÊME GRAINE, MÊME SAUT — SUR TROIS POSTES");
// =========================================================================
{
    const feu = {
        zp_feu: { id: "zp_feu", type: "feu", idLanceur: "GENEUR", dureeRestante: 3,
                  hexes: [{ q: 3, r: 0 }], degats: { valeurBrute: 14, typeRes: "Physique" },
                  soin: null,
                  etat: { nom: "Brûlé", chance: 50, duree: 2, tickFait: false } }
    };
    const resultats = [1, 2, 3].map(() => {
        const r = resoudreBond(monde({ zones: feu }),
            { idLanceur: "SAUTEUR", vers: { q: 3, r: 0 }, portee: 4 }, creerDes(808), null);
        const c = r.etat.combattants.SAUTEUR;
        return JSON.stringify({ q: c.q, r: c.r, pv: c.pv, etats: c.etats });
    });
    verifier("les trois postes voient le même saut",
             resultats[0] === resultats[1] && resultats[1] === resultats[2], resultats[0]);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
