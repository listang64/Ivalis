// LA CONFUSION, RAMENÉE DANS LE CERVEAU.
//
// Un combattant confus ne maîtrise plus ce qu'il lance : un dé, tiré une fois
// pour toute la carte, décide s'il se l'inflige (1-20), s'il vise n'importe qui
// à portée (21-40), si la confusion se dissipe (41-50), ou si rien ne change
// (51-100).
//
// CE QUI ÉTAIT CASSÉ, ET QUE CE BANC GARDE FERMÉ.
//
//   UN. Le dé était tiré dans le navigateur du lanceur, avec Math.random(),
//       avant même l'envoi de la carte. Un poste envoyait donc un RÉSULTAT que
//       les autres devaient croire sur parole — exactement ce que le cerveau
//       existe pour supprimer.
//   DEUX. La dissipation (41-50) était purement désactivée sous le nouveau
//       régime : elle aurait dû effacer un état, et seul le cerveau a le droit
//       d'écrire un état. La bande était donc sautée, et la confusion durait
//       un tour de trop — en silence.
//   TROIS. Le mot qui explique tout — « Confus : cible au hasard ! » — vivait
//       dans jouerAnimationMoteur, que le nouveau régime ne traverse jamais.
//       Le joueur voyait sa carte partir sur son propre camp sans la moindre
//       explication, et appelait ça un bug. Il avait raison de le croire.
//
// Et une règle de la maison qu'on vérifie ici aussi : LE DÉ N'EST TIRÉ QUE SI
// LE LANCEUR EST CONFUS. Un dé consommé par condition décalerait toute la suite
// du tirage, et deux postes qui rejouent le même tour ne verraient plus la même
// partie.
import {
    appliquerConfusion, resoudreCarte, ligneDeVue, tirerDesCarte,
    CHANCE_CONFUSION_AUTO, CHANCE_CONFUSION_ALEATOIRE, CHANCE_CONFUSION_DISSIPEE
} from '../moteur_pur.js';
import { construireEtatCombat, creerDes, clonerEtat, verifierEtatCombat } from '../combat_etat.js';
import { jouerCreature } from '../cerveau_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, camp, extra = {}) => ({
    idPersonnage: id, camp, prenom: id, PV_Max: 60, PV_Actuels: 60,
    Fatigue_Max: 100, Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Critique: 0,
    Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});

const CONFUS = [{ nom: "Confusion", duree: 3 }];

// Le confus en (0,0), un allié tout près, deux ennemis à portée.
const monde = (etatsDuLanceur = CONFUS) => construireEtatCombat({
    idPartie: "P1", cerveau: "P_01", graine: 9,
    combattants: [
        fiche("MOI", "Allié", { Etats_Alteres: etatsDuLanceur }),
        fiche("AMI", "Allié"),
        fiche("GOB", "Ennemi"),
        fiche("ORC", "Ennemi")
    ],
    positions: { MOI: { q: 0, r: 0 }, AMI: { q: 1, r: 0 },
                 GOB: { q: 2, r: 0 }, ORC: { q: 0, r: 2 } },
    partie: { Tour_Combat: 1 }
});

// Une carte d'attaque ordinaire, visant l'orc, portée 3.
const carte = (extra = {}) => ({
    type: "carte", idLanceur: "MOI", idCarte: "C1",
    attaques: [{ valeurBrute: 10, cibles: ["ORC"], rangeMax: 3, typeRes: "Physique" }],
    alterations: [],
    ...extra
});

// Un dé truqué : il rend le jet qu'on lui demande, puis se comporte
// normalement. C'est la seule façon d'attaquer les quatre bandes du tirage
// sans chercher une graine par bande à la main.
const deTruque = (premierJet) => {
    const vrai = creerDes(123);
    let rendu = false;
    return {
        ...vrai,
        d100: () => { if (!rendu) { rendu = true; return premierJet; } return vrai.d100(); },
        parmi: vrai.parmi
    };
};

console.log("\n=========================================================");
console.log("  LA CONFUSION DANS LE CERVEAU");
console.log("=========================================================");

// =========================================================================
console.log("\n1. LES QUATRE BANDES DU DÉ");
// =========================================================================
{
    const etat = monde();

    const auto = appliquerConfusion(etat, carte(), null, deTruque(CHANCE_CONFUSION_AUTO));
    verifier("1-20 : la carte se retourne sur son lanceur",
             auto.confusion && auto.confusion.type === "auto"
             && auto.attaques[0].cibles[0] === "MOI",
             JSON.stringify(auto.attaques[0].cibles));

    const hasard = appliquerConfusion(etat, carte(), null, deTruque(CHANCE_CONFUSION_ALEATOIRE));
    verifier("21-40 : elle part sur quelqu'un d'autre, à portée",
             hasard.confusion && hasard.confusion.type === "aleatoire"
             && hasard.attaques[0].cibles[0] !== "MOI",
             `${hasard.attaques[0].cibles[0]}`);
    verifier("et ce quelqu'un peut être un allié (ami OU ennemi)",
             ["AMI", "GOB", "ORC"].includes(hasard.attaques[0].cibles[0]));

    const dissipee = appliquerConfusion(etat, carte(), null, deTruque(CHANCE_CONFUSION_DISSIPEE));
    verifier("41-50 : la confusion se dissipe",
             dissipee.confusion && dissipee.confusion.type === "annulee");
    verifier("et la carte garde la cible choisie par le joueur",
             dissipee.attaques[0].cibles[0] === "ORC", dissipee.attaques[0].cibles[0]);

    const normale = appliquerConfusion(etat, carte(), null, deTruque(CHANCE_CONFUSION_DISSIPEE + 1));
    verifier("51-100 : rien ne change", !normale.confusion
             && normale.attaques[0].cibles[0] === "ORC");
}

// =========================================================================
console.log("\n2. UN COMBATTANT SAIN NE TIRE PAS LE DÉ");
// =========================================================================
//  C'est la règle qui protège tout le reste : si la confusion consommait un dé
//  même chez les non-confus, chaque carte décalerait la suite du tirage et deux
//  postes rejouant le même tour ne verraient plus la même partie.
{
    const sain = monde([]);
    const des = creerDes(4242);
    const graineAvant = des.graine();
    const rendu = appliquerConfusion(sain, carte(), null, des);

    verifier("aucune confusion posée sur une carte ordinaire", !rendu.confusion);
    verifier("la cible du joueur est intacte", rendu.attaques[0].cibles[0] === "ORC");
    verifier("ET LE DÉ N'A PAS BOUGÉ D'UN CRAN",
             des.graine() === graineAvant, `${graineAvant} → ${des.graine()}`);
}

// =========================================================================
console.log("\n3. LA DISSIPATION EFFACE VRAIMENT L'ÉTAT");
// =========================================================================
//  La bande qui n'existait pas sous ce régime. Elle ne peut pas se contenter
//  d'un message : l'état doit quitter la fiche, sinon la confusion revient au
//  prochain rafraîchissement.
{
    const etat = monde();
    const action = appliquerConfusion(etat, carte(), null, deTruque(CHANCE_CONFUSION_DISSIPEE));
    action.jets = { attaqueRatee: false, parCible: { ORC: { esquive: false, etats: {} } } };
    const { etat: apres, etapes } = resoudreCarte(etat, action);

    const restant = (apres.combattants.MOI.etats || []).some(e => e && e.nom === "Confusion");
    verifier("la Confusion a quitté la fiche du lanceur", !restant,
             JSON.stringify(apres.combattants.MOI.etats));
    verifier("une étape d'états le dit, pour que l'écran suive",
             etapes.some(e => e.type === "etats" && e.cible === "MOI"));
    verifier("et le mot « Confusion dissipée ! » est annoncé",
             etapes.some(e => e.type === "message" && /dissipée/.test(e.texte || "")),
             JSON.stringify(etapes.filter(e => e.type === "message").map(e => e.texte)));
    verifier("en vert : c'est une bonne nouvelle",
             etapes.some(e => e.type === "message" && e.couleur === "#33cc66"));
}

// =========================================================================
console.log("\n4. LE JOUEUR EST PRÉVENU, TOUJOURS");
// =========================================================================
//  Le trou le plus bête et le plus coûteux : la carte partait de travers sans
//  un mot. Chaque détournement doit produire son message, chez tout le monde.
{
    const etat = monde();
    const jouer = (jet) => {
        const action = appliquerConfusion(etat, carte(), null, deTruque(jet));
        const cible = action.attaques[0].cibles[0];
        action.jets = { attaqueRatee: false, parCible: { [cible]: { esquive: false, etats: {} } } };
        return resoudreCarte(etat, action).etapes;
    };

    const motsAuto = jouer(CHANCE_CONFUSION_AUTO).filter(e => e.type === "message");
    verifier("« s'inflige sa propre compétence » est dit",
             motsAuto.some(e => /propre compétence/.test(e.texte || "")),
             JSON.stringify(motsAuto.map(e => e.texte)));

    const motsHasard = jouer(CHANCE_CONFUSION_ALEATOIRE).filter(e => e.type === "message");
    verifier("« cible au hasard » est dit",
             motsHasard.some(e => /au hasard/.test(e.texte || "")),
             JSON.stringify(motsHasard.map(e => e.texte)));

    // Le message doit sortir du pion du lanceur : c'est lui qui est confus.
    verifier("le mot sort bien du pion du confus",
             motsHasard.every(e => e.cible === "MOI"));
}

// =========================================================================
console.log("\n5. LES DÉGÂTS TOMBENT SUR LA CIBLE DÉTOURNÉE, PAS SUR L'AUTRE");
// =========================================================================
//  C'est la raison pour laquelle le tirage de confusion passe AVANT
//  tirerDesCarte : les jets sont rangés par cible. Tiré après, la carte aurait
//  des dés pour une cible qu'elle ne touche plus, et aucun pour celle qu'elle
//  frappe vraiment.
{
    const etat = monde();
    const action = appliquerConfusion(etat, carte(), null, deTruque(CHANCE_CONFUSION_AUTO));
    action.critique = false;
    action.jets = tirerDesCarte(etat, action, "MOI", false, creerDes(7));

    verifier("les dés sont tirés pour le lanceur devenu sa propre cible",
             action.jets.parCible && action.jets.parCible.MOI !== undefined,
             JSON.stringify(Object.keys(action.jets.parCible || {})));

    const { etat: apres } = resoudreCarte(etat, action);
    verifier("et c'est bien lui qui encaisse",
             apres.combattants.MOI.pv < 60, `${apres.combattants.MOI.pv} PV`);
    verifier("l'orc visé au départ est indemne",
             apres.combattants.ORC.pv === 60, `${apres.combattants.ORC.pv} PV`);
}

// =========================================================================
console.log("\n6. PERSONNE À PORTÉE : LA CARTE REVIENT SUR SON LANCEUR");
// =========================================================================
{
    const seul = construireEtatCombat({
        idPartie: "P1", cerveau: "P_01", graine: 9,
        combattants: [fiche("MOI", "Allié", { Etats_Alteres: CONFUS }),
                      fiche("LOIN", "Ennemi")],
        positions: { MOI: { q: 0, r: 0 }, LOIN: { q: 9, r: 0 } },
        partie: { Tour_Combat: 1 }
    });
    const action = appliquerConfusion(seul, carte(), null, deTruque(CHANCE_CONFUSION_ALEATOIRE));
    verifier("hors de portée, le hasard se rabat sur soi-même",
             action.confusion && action.confusion.type === "auto"
             && action.attaques[0].cibles[0] === "MOI",
             JSON.stringify(action.attaques[0].cibles));
}

// =========================================================================
console.log("\n7. UNE CARTE SANS ATTAQUE NE PART JAMAIS AU HASARD");
// =========================================================================
//  Règle de l'ancien moteur, reprise telle quelle : on ne « rate » pas un soin
//  sur un inconnu, on se le donne à soi.
{
    const etat = monde();
    const soin = {
        type: "carte", idLanceur: "MOI", idCarte: "C_SOIN",
        attaques: [{ valeurBrute: 10, isHeal: true, cibles: ["AMI"], rangeMax: 3 }],
        alterations: []
    };
    // Un soin EST une attaque au sens de la carte : la bande 21-40 s'applique.
    // C'est une carte SANS aucune attaque — une pose d'état pure — qui bascule.
    const posePure = {
        type: "carte", idLanceur: "MOI", idCarte: "C_ETAT",
        attaques: [],
        alterations: [{ nom: "Glacé", duree: 2, chance: 100, cibles: ["GOB"], rangeMax: 3 }]
    };

    const rendu = appliquerConfusion(etat, posePure, null, deTruque(CHANCE_CONFUSION_ALEATOIRE));
    verifier("une pose d'état seule se retourne sur le lanceur",
             rendu.confusion && rendu.confusion.type === "auto"
             && rendu.alterations[0].cibles[0] === "MOI",
             JSON.stringify(rendu.alterations[0].cibles));

    const renduSoin = appliquerConfusion(etat, soin, null, deTruque(CHANCE_CONFUSION_ALEATOIRE));
    verifier("un soin, lui, peut partir sur n'importe qui",
             renduSoin.confusion && renduSoin.confusion.type === "aleatoire",
             renduSoin.confusion && renduSoin.confusion.type);
}

// =========================================================================
console.log("\n8. LES DÉPLACEMENTS FORCÉS NE SE RETOURNENT PAS SUR SOI");
// =========================================================================
//  Se pousser soi-même n'a aucun sens : la distance est nulle, la géométrie ne
//  donne aucune direction. L'ancien moteur les éteignait ; on fait pareil.
{
    const etat = monde();
    const pousse = {
        type: "carte", idLanceur: "MOI", idCarte: "C_POUSSEE",
        attaques: [{ valeurBrute: 5, cibles: ["GOB"], rangeMax: 3 }],
        alterations: [{ nom: "Poussée", duree: 0, chance: 100, cibles: ["GOB"],
                        estPoussee: true, cases: 2 }]
    };
    const rendu = appliquerConfusion(etat, pousse, null, deTruque(CHANCE_CONFUSION_AUTO));
    verifier("l'attaque, elle, se retourne bien sur le lanceur",
             rendu.attaques[0].cibles[0] === "MOI");
    verifier("mais la poussée est éteinte, pas retournée",
             rendu.alterations[0].cibles.length === 0,
             JSON.stringify(rendu.alterations[0].cibles));
}

// =========================================================================
console.log("\n9. LA LIGNE DE VUE : UN MUR CACHE UNE CIBLE");
// =========================================================================
//  Portage de verifierLigneDeVue. Seules les cases BLOQUÉES arrêtent le
//  regard — un trou dans le sol se survole des yeux.
{
    const mur = { etatCase: (q, r) => ({ bloquee: q === 1 && r === 0, supprimee: false }) };
    const trou = { etatCase: (q, r) => ({ bloquee: false, supprimee: q === 1 && r === 0 }) };

    verifier("sans obstacle, on voit", ligneDeVue(null, { q: 0, r: 0 }, { q: 2, r: 0 }));
    verifier("un mur sur le trajet coupe la vue",
             !ligneDeVue(mur, { q: 0, r: 0 }, { q: 2, r: 0 }));
    verifier("un trou ne la coupe pas",
             ligneDeVue(trou, { q: 0, r: 0 }, { q: 2, r: 0 }));
    verifier("au contact, on voit toujours",
             ligneDeVue(mur, { q: 0, r: 0 }, { q: 1, r: 0 }));

    // Et le détournement au hasard en tient compte : l'orc est derrière le mur.
    const etat = monde();
    const murDevantGob = { etatCase: (q, r) => ({ bloquee: q === 1 && r === 0 }) };
    const rendu = appliquerConfusion(etat, carte(), murDevantGob, deTruque(CHANCE_CONFUSION_ALEATOIRE));
    verifier("une cible cachée par un mur n'est pas tirée au sort",
             rendu.attaques[0].cibles[0] !== "GOB", rendu.attaques[0].cibles[0]);
}

// =========================================================================
console.log("\n10. MÊME GRAINE, MÊME CONFUSION — SUR TROIS POSTES");
// =========================================================================
//  Le cœur du régime : trois navigateurs qui rejouent le même tour doivent
//  détourner la carte vers exactement la même cible.
{
    const resultats = [1, 2, 3].map(() => {
        const etat = monde();
        const des = creerDes(31337);
        des.d100();  // le critique, tiré avant, comme dans le cerveau
        const action = appliquerConfusion(etat, carte(), null, des);
        return JSON.stringify({ conf: action.confusion,
                                cibles: action.attaques[0].cibles });
    });
    verifier("les trois postes tombent sur le même résultat",
             resultats[0] === resultats[1] && resultats[1] === resultats[2],
             resultats[0]);

    // Et l'état de départ n'a pas été touché au passage : appliquerConfusion
    // rend une NOUVELLE action, il ne mute pas celle qu'on lui donne.
    const origine = carte();
    appliquerConfusion(monde(), origine, null, deTruque(CHANCE_CONFUSION_AUTO));
    verifier("l'action d'origine n'est pas modifiée en douce",
             origine.attaques[0].cibles[0] === "ORC", origine.attaques[0].cibles[0]);
}

// =========================================================================
console.log("\n11. UNE CRÉATURE CONFUSE SE TROMPE AUSSI");
// =========================================================================
//  La confusion ne vivait que du côté des joueurs : elle était tirée dans le
//  navigateur du lanceur, juste avant d'envoyer la carte. Une créature, elle,
//  est jouée par le cerveau — elle ne passait donc jamais par ce code et visait
//  tranquillement qui elle voulait, confuse ou non. Même dé, même règle.
{
    const plateau = construireEtatCombat({
        idPartie: "P1", cerveau: "P_01", graine: 5,
        combattants: [
            fiche("BRUTE", "Ennemi", { estMonstre: true, Personnalite: "brutal",
                                       Etats_Alteres: CONFUS }),
            fiche("HEROS", "Allié")
        ],
        positions: { BRUTE: { q: 0, r: 0 }, HEROS: { q: 1, r: 0 } },
        partie: { Tour_Combat: 1, Ordre_Initiative: ["BRUTE", "HEROS"] }
    });
    plateau.file = [{ id: "BRUTE", carte: "C_B" }];

    const carteBrute = { idCarte: "C_B", infos: { portee: 1, fatigue: 10 },
                         attaques: [{ valeurBrute: 15 }], alterations: [] };

    // On cherche, parmi plusieurs graines, un tour où la confusion a frappé :
    // elle ne se déclenche qu'une fois sur deux, par construction.
    let tourConfus = null;
    for (let g = 1; g <= 40 && !tourConfus; g++) {
        const pas = jouerCreature({ ...plateau, graine: g }, "BRUTE", carteBrute, null);
        if (!pas) continue;
        const mots = pas.entree.etapes.filter(e => e.type === "message" && /Confus/.test(e.texte || ""));
        if (mots.length > 0) tourConfus = pas;
    }

    verifier("une créature confuse finit par se tromper", !!tourConfus,
             tourConfus ? "trouvé" : "aucun tour confus sur 40 graines");
    if (tourConfus) {
        verifier("et le mot est dit, comme pour un héros",
                 tourConfus.entree.etapes.some(e => e.type === "message" && /Confus/.test(e.texte || "")));
        verifier("l'état du combat reste cohérent",
                 verifierEtatCombat(tourConfus.etat).length === 0,
                 verifierEtatCombat(tourConfus.etat).join(" | "));
    }
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
