// L'ILLUSION, RAMENÉE DANS LE CERVEAU.
//
// Un leurre statique d'un seul point de vie, à l'image de son lanceur, posé sur
// une case libre à portée. Il n'entre jamais dans la file d'initiative : ce
// n'est jamais son tour. Il existe pour attirer un coup, et disparaître.
//
// CE QUI ÉTAIT CASSÉ.
//
// creerIllusion fabriquait un document Personnages à la volée, en plein milieu
// du combat, depuis le navigateur du lanceur. Or le cerveau ARRÊTE sa liste de
// combattants à l'ouverture du combat : un leurre né après n'y figurait tout
// simplement pas. Il se dessinait sur le plateau — et c'est tout. On ne pouvait
// ni le viser, ni lui enlever son point de vie, ni le faire tomber. Une image,
// pas un combattant. Et comme personne ne le voyait tomber, plus rien ne
// l'effaçait : il restait sur la carte jusqu'à la fin du combat.
//
// Le partage est celui de tous les combattants : son IDENTITÉ (nom, image,
// couleur) est une fiche, sa VIE DE COMBAT appartient au cerveau.
import { combattantIllusion, construireEtatCombat, creerDes,
         appliquerEntree, combattant } from '../combat_etat.js';
import { validerIntention, appliquerIntention } from '../cerveau_combat.js';
import { resoudreCarte, tirerDesCarte } from '../moteur_pur.js';
import { choisirCible } from '../ia_pure.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, camp, extra = {}) => ({
    idPersonnage: id, camp, prenom: id, PV_Max: 60, PV_Actuels: 60,
    Fatigue_Max: 100, Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Critique: 0,
    Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});

const monde = () => construireEtatCombat({
    idPartie: "P1", cerveau: "P_01", graine: 21,
    combattants: [fiche("MAGE", "Allié", { idJoueur: "P_01" }),
                  fiche("GOBELIN", "Ennemi", { estMonstre: true, Personnalite: "brutal" })],
    positions: { MAGE: { q: 0, r: 0 }, GOBELIN: { q: 3, r: 0 } },
    partie: { Tour_Combat: 1,
              Ordre_Initiative: ["MAGE", "GOBELIN"],
              File_Attente_Combat: [{ idPersonnage: "MAGE", initiative: 10 }] }
});

console.log("\n=========================================================");
console.log("  L'ILLUSION DANS LE CERVEAU");
console.log("=========================================================");

// =========================================================================
console.log("\n1. LE LEURRE, ET SEULEMENT UN LEURRE");
// =========================================================================
{
    const mage = combattant(monde(), "MAGE");
    const leurre = combattantIllusion(mage, "ILLUSION_abc", 1, 0);

    verifier("un seul point de vie", leurre.pv === 1 && leurre.pvMax === 1);
    verifier("aucune énergie : elle ne lance rien",
             leurre.fatigue === 0 && leurre.fatigueMax === 0);
    verifier("aucune défense : elle encaisse tout",
             leurre.def.esquive === 0 && leurre.def.parade === 0
             && leurre.def.physique === 0 && leurre.def.magique === 0);
    verifier("elle est marquée comme illusion", leurre.estIllusion === true);
    verifier("elle n'est pas une créature", leurre.estMonstre === false);
    verifier("elle porte le camp de son lanceur", leurre.camp === mage.camp);
    verifier("et elle dit de qui elle est le reflet",
             /Illusion de/.test(leurre.nom), leurre.nom);
    verifier("elle est posée sur la bonne case", leurre.q === 1 && leurre.r === 0);
    verifier("et elle est debout", leurre.aTerre === false);
}

// =========================================================================
console.log("\n2. ELLE ENTRE VRAIMENT DANS LE COMBAT — LE TROU PRINCIPAL");
// =========================================================================
{
    const etat = monde();
    verifier("avant : le cerveau ne connaît que deux combattants",
             Object.keys(etat.combattants).length === 2);

    const pas = appliquerIntention(etat, {
        id: "i1", type: "illusion", acteur: "MAGE",
        idIllusion: "ILLUSION_abc", vers: { q: 1, r: 0 }
    }, null);

    verifier("après : le leurre est dans l'état du combat",
             !!combattant(pas.etat, "ILLUSION_abc"));
    verifier("une étape d'arrivée le raconte",
             (pas.entree.etapes || []).some(e => e.type === "arrivee"),
             JSON.stringify((pas.entree.etapes || []).map(e => e.type)));

    // ELLE N'ENTRE PAS DANS L'ORDRE : ce n'est jamais son tour.
    verifier("elle n'est pas dans l'ordre d'initiative",
             !(pas.etat.ordre || []).includes("ILLUSION_abc"),
             JSON.stringify(pas.etat.ordre));
    verifier("ni dans la file d'attente",
             !(pas.etat.file || []).some(f => f.id === "ILLUSION_abc"),
             JSON.stringify((pas.etat.file || []).map(f => f.id)));

    // ET LE MAGE GARDE LA MAIN : l'illusion se pose au milieu de sa carte.
    verifier("le mage garde la main pour la suite de sa carte",
             (pas.etat.file || [])[0] && pas.etat.file[0].id === "MAGE");
}

// =========================================================================
console.log("\n3. UN LEURRE QUI EXISTE PEUT ÊTRE FRAPPÉ, ET IL TOMBE");
// =========================================================================
//  C'est tout l'intérêt de l'affaire : avant, une attaque sur l'illusion ne
//  trouvait aucun combattant à ce nom et ne faisait rien du tout.
{
    const pose = appliquerIntention(monde(), {
        id: "i1", type: "illusion", acteur: "MAGE",
        idIllusion: "ILLUSION_abc", vers: { q: 1, r: 0 }
    }, null).etat;

    const coup = {
        type: "carte", idLanceur: "GOBELIN", idCarte: "C1",
        attaques: [{ valeurBrute: 20, cibles: ["ILLUSION_abc"], typeRes: "Physique" }],
        alterations: [],
        jets: { attaqueRatee: false,
                parCible: { ILLUSION_abc: { esquive: false, etats: {} } } }
    };
    const { etat: apres, etapes } = resoudreCarte(pose, coup);
    const leurre = combattant(apres, "ILLUSION_abc");

    verifier("le coup porte sur le leurre", leurre.pv === 0, `${leurre.pv} PV`);
    verifier("et il tombe", leurre.aTerre === true);
    verifier("sa chute est racontée",
             etapes.some(e => e.type === "chute" && e.cible === "ILLUSION_abc"),
             JSON.stringify(etapes.map(e => e.type)));
}

// =========================================================================
console.log("\n4. ELLE ATTIRE LES COUPS — C'EST TOUT SON MÉTIER");
// =========================================================================
//  Une créature qui cherche une cible doit pouvoir la voir. Tant qu'elle
//  n'existait pas dans l'état, l'IA passait forcément à côté.
{
    const pose = appliquerIntention(monde(), {
        id: "i1", type: "illusion", acteur: "MAGE",
        idIllusion: "ILLUSION_abc", vers: { q: 2, r: 0 }
    }, null).etat;

    // La règle de l'IA (ia_pure.js) : un leurre ne se laisse prendre que par une
    // attaque NUE. Contre un soin ou une pose d'état, le moteur répondrait
    // « cible invalide » et la créature aurait perdu son tour pour rien.
    // Le choix porte un grain de hasard (voir `bruit`, ia_pure.js) : entre deux
    // cibles proches, une graine isolée ne prouve rien. On regarde donc sur
    // vingt graines — ce qui compte n'est pas QUELLE cible sort, c'est que le
    // leurre puisse sortir du tout.
    const surVingt = (infos) => {
        let leurres = 0;
        for (let g = 1; g <= 20; g++) {
            const c = choisirCible(pose, "GOBELIN", infos, creerDes(g));
            if (c && c.id === "ILLUSION_abc") leurres++;
        }
        return leurres;
    };

    const avecNue = surVingt({ estSoin: false, estAttaqueSimple: true, portee: 5 });
    verifier("sur une attaque nue, le gobelin se fait prendre au leurre",
             avecNue > 0, `${avecNue} fois sur 20`);
    verifier("et souvent, puisqu'il est le plus proche",
             avecNue >= 10, `${avecNue} fois sur 20`);

    const sansNue = surVingt({ estSoin: false, portee: 5 });
    verifier("sur tout le reste, il l'ignore complètement",
             sansNue === 0, `${sansNue} fois sur 20`);

    // AVANT LE CORRECTIF, CE CHAPITRE N'AVAIT MÊME PAS DE SENS : le leurre
    // n'existait dans l'état d'aucun poste, l'IA ne pouvait donc pas le voir,
    // quelle que soit la carte.
    verifier("le leurre est bien dans les combattants que l'IA parcourt",
             !!combattant(pose, "ILLUSION_abc"));
}

// =========================================================================
console.log("\n5. LA PORTE COMMUNE REFUSE CE QU'IL FAUT REFUSER");
// =========================================================================
{
    const etat = monde();
    const bonne = { id: "i1", type: "illusion", acteur: "MAGE",
                    idIllusion: "ILLUSION_abc", vers: { q: 1, r: 0 } };

    verifier("une illusion en règle passe", validerIntention(etat, bonne).ok);
    verifier("sans identité, elle est refusée",
             !validerIntention(etat, { ...bonne, idIllusion: null }).ok);
    verifier("sans case, elle est refusée",
             !validerIntention(etat, { ...bonne, vers: null }).ok);
    verifier("sur quelqu'un, elle est refusée",
             !validerIntention(etat, { ...bonne, vers: { q: 3, r: 0 } }).ok,
             validerIntention(etat, { ...bonne, vers: { q: 3, r: 0 } }).raison);
    verifier("hors de son tour, elle est refusée",
             !validerIntention(etat, { ...bonne, acteur: "GOBELIN" }).ok);

    // DEUX FOIS LE MÊME LEURRE : une intention rejouée ne doit pas en créer
    // deux. Le nom est unique, et le cerveau le tient.
    const pose = appliquerIntention(etat, bonne, null).etat;
    verifier("le même leurre ne peut pas naître deux fois",
             !validerIntention(pose, { ...bonne, id: "i2" }).ok,
             validerIntention(pose, { ...bonne, id: "i2" }).raison);
}

// =========================================================================
console.log("\n6. LE REJEU DONNE LE MÊME PLATEAU");
// =========================================================================
//  Un poste en retard n'a que le journal pour reconstituer le combat. Le leurre
//  doit y apparaître comme chez le cerveau, sans quoi il frappera dans le vide.
{
    const pas = appliquerIntention(monde(), {
        id: "i1", type: "illusion", acteur: "MAGE",
        idIllusion: "ILLUSION_abc", vers: { q: 1, r: 0 }
    }, null);

    const rejoue = appliquerEntree(monde(), pas.entree);
    verifier("le poste en retard a bien le leurre",
             !!combattant(rejoue, "ILLUSION_abc"));
    verifier("avec exactement les mêmes chiffres",
             JSON.stringify(combattant(rejoue, "ILLUSION_abc"))
             === JSON.stringify(combattant(pas.etat, "ILLUSION_abc")));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
