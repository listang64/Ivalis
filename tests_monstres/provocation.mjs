// PROVOCATION.
// Nouvel effet de combat : oblige la cible à n'attaquer QUE le lanceur tant que
// l'état dure. Réservée aux joueurs — un monstre ne peut jamais la lancer (voir
// monstres_competences.js, effetAutorise). Ce banc teste le VRAI bloc de
// détection de moteur_effets.js (demarrerCiblage), extrait par ses commentaires
// repères, exactement comme coup_critique.mjs extrait afficherMessageFlottantHex.
// La lecture côté IA (choisirCibleMonstre) est déjà couverte par
// equipement_combat.mjs.
import fs from 'fs';
import { resoudreCarte } from '../moteur_pur.js';
import { choisirCible } from '../ia_pure.js';
import { construireEtatCombat, creerDes } from '../combat_etat.js';

const src = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8');
const debut = src.indexOf('// 🔻 NOUVEAU : DÉTECTION PROVOCATION 🔻');
const fin = src.indexOf('// 🔻 NOUVEAU : DÉTECTION ABSORPTION 🔻');
if (debut === -1 || fin === -1) throw new Error("bloc Provocation introuvable dans moteur_effets.js");
const blocProvocation = src.slice(debut, fin);

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(60)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

global.window = { EFFETS_BDD_CACHE: {} };

// Rejoue exactement l'environnement local que le bloc trouve dans demarrerCiblage :
// effBase/listeMods/act/isRanged/rangeMax/lanceurCarte, plus les deux compteurs
// d'ordre qu'il touche (indexPremierAutreEffet, idxAction).
function executerBloc({ effBase, mods = [], count = 1, isRanged = false, rangeMax = 1, idCaster = "J1" }) {
    const alterationsExtraites = [];
    let indexPremierAutreEffet = -1;
    const idxAction = 0;
    const nomLower = (effBase.Nom || "").toLowerCase();
    const act = { count };
    const listeMods = mods.map(m => ({ id: m.id, count: m.count || 1 }));
    window.EFFETS_BDD_CACHE = {};
    mods.forEach(m => { window.EFFETS_BDD_CACHE[m.id] = m.eff; });
    const parseFrFloat = (val) => {
        if (val === undefined || val === null || val === "") return 0;
        const res = parseFloat(val.toString().replace(',', '.'));
        return isNaN(res) ? 0 : res;
    };
    const lanceurCarte = { idPersonnage: idCaster };
    eval(blocProvocation);
    return alterationsExtraites;
}

console.log("1. DÉTECTION SUR L'EFFET DE BASE (le vrai nom en base : « Provocations »)");
{
    const alts = executerBloc({ effBase: { Nom: "Provocations", Pourcent_Base: "10" }, idCaster: "J2" });
    verifier("une alteration Provocation est produite", alts.length === 1 && alts[0].nom === "Provocation");
    verifier("l'idProvocateur est celui qui lance la carte", alts[0] && alts[0].idProvocateur === "J2");
    verifier("la durée est fixe à 2 tours", alts[0] && alts[0].duree === 2);
    verifier("la chance suit le pourcentage de base", alts[0] && alts[0].chance === 10, `(${alts[0] && alts[0].chance}%)`);
}

console.log("\n2. PLAFOND DE CHANCE À 40 %");
{
    const alts = executerBloc({ effBase: { Nom: "Provocations", Pourcent_Base: "90" }, count: 2 });
    verifier("la chance est plafonnée à 40 %, même à 90×2", alts[0] && alts[0].chance === 40, `(${alts[0] && alts[0].chance}%)`);
}

console.log("\n3. DÉTECTION EN MOD (posé sur une autre action que l'attaque)");
{
    const alts = executerBloc({
        effBase: { Nom: "Attaque légère", Pourcent_Base: "0" },
        mods: [{ id: "M1", count: 1, eff: { Nom: "Provocations", Pourcent_Base: "15" } }]
    });
    verifier("le mod « Provocations » est reconnu aussi", alts.length === 1 && alts[0].nom === "Provocation");
    verifier("sa chance vient du mod", alts[0] && alts[0].chance === 15, `(${alts[0] && alts[0].chance}%)`);
}

console.log("\n4. AUCUNE FAUSSE DÉTECTION");
{
    const alts = executerBloc({ effBase: { Nom: "Peur", Pourcent_Base: "10" } });
    verifier("une carte sans provocation ne produit rien", alts.length === 0, `(${alts.length} alteration(s))`);
}

// =========================================================================
console.log("\n5. LE TRAJET COMPLET : DE L'EXTRACTION JUSQU'À LA CIBLE FORCÉE");
// =========================================================================
//  LE CHAÎNON QUI MANQUAIT, ET QUI RENDAIT L'EFFET DÉCORATIF.
//
//  Les quatre chapitres au-dessus prouvaient que l'extraction pose bien
//  `idProvocateur` sur l'altération. Le banc de l'IA, lui, prouvait que
//  choisirCible sait s'en servir. Entre les deux, personne ne regardait : et
//  c'est justement entre les deux que le nom se perdait. Le noyau posait
//  l'état en recopiant une liste blanche de champs (nom, durée, icône,
//  description…) où `idProvocateur` ne figurait pas. L'état arrivait donc sur
//  la fiche avec sa jolie pastille, et l'IA le lisait sans y trouver personne
//  à aller frapper.
//
//  Ce chapitre refait le voyage en entier, avec le vrai noyau et la vraie IA.
{
    const fiche = (id, camp, extra = {}) => ({
        idPersonnage: id, camp, prenom: id, PV_Max: 60, PV_Actuels: 60,
        Fatigue_Max: 100, Fatigue_Actuelle: 100, Esquive: 0, Parade: 0,
        Critique: 0, Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0,
        Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
    });

    // Le tank provoque, son camarade est juste à côté — et bien plus tendre.
    const etatDepart = construireEtatCombat({
        idPartie: "P1", cerveau: "P_01", graine: 77,
        combattants: [fiche("TANK", "Allié", { PV_Actuels: 60 }),
                      fiche("FRAGILE", "Allié", { PV_Actuels: 8 }),
                      fiche("GOBELIN", "Ennemi", { personnalite: "brutal" })],
        positions: { TANK: { q: 0, r: 0 }, FRAGILE: { q: 1, r: 0 }, GOBELIN: { q: 2, r: 0 } },
        partie: { Tour_Combat: 1 }
    });

    // La carte du tank, telle que l'extraction la construit (chapitre 1).
    const carteDuTank = {
        type: "carte", idLanceur: "TANK", idCarte: "C_PROVOC",
        attaques: [],
        alterations: [{ nom: "Provocation", duree: 2, chance: 100, cibles: ["GOBELIN"],
                        idProvocateur: "TANK" }],
        jets: { attaqueRatee: false,
                parCible: { GOBELIN: { esquive: false, etats: { Provocation: true } } } }
    };

    const { etat: apres } = resoudreCarte(etatDepart, carteDuTank);
    const etatPose = (apres.combattants.GOBELIN.etats || [])
        .find(e => e && e.nom === "Provocation");

    verifier("le cerveau pose bien l'état sur la créature", !!etatPose);
    verifier("ET il garde le nom du provocateur",
             etatPose && etatPose.idProvocateur === "TANK",
             etatPose ? JSON.stringify(etatPose) : "(aucun état)");

    // Maintenant l'IA choisit. Sans provocation elle irait au plus faible.
    const carteDuGobelin = { estSoin: false, portee: 3 };
    const cibleProvoquee = choisirCible(apres, "GOBELIN", carteDuGobelin, creerDes(1));
    verifier("la créature provoquée se retourne vers le tank",
             cibleProvoquee && cibleProvoquee.id === "TANK",
             cibleProvoquee ? cibleProvoquee.id : "(aucune cible)");

    // Le contre-essai : sans l'état, elle repart sur le plus fragile. C'est ce
    // qui prouve que le chapitre au-dessus mesure vraiment la provocation, et
    // pas un hasard qui tomberait sur le tank de toute façon.
    const cibleLibre = choisirCible(etatDepart, "GOBELIN", carteDuGobelin, creerDes(1));
    verifier("sans provocation, elle choisit le plus fragile",
             cibleLibre && cibleLibre.id === "FRAGILE",
             cibleLibre ? cibleLibre.id : "(aucune cible)");

    // Provoqué une seconde fois par quelqu'un d'autre : c'est le dernier qui a
    // crié qu'on va frapper, pas le premier.
    const carteDuFragile = {
        ...carteDuTank, idLanceur: "FRAGILE",
        alterations: [{ ...carteDuTank.alterations[0], idProvocateur: "FRAGILE" }]
    };
    const { etat: reprovoque } = resoudreCarte(apres, carteDuFragile);
    const etatRenouvele = (reprovoque.combattants.GOBELIN.etats || [])
        .find(e => e && e.nom === "Provocation");
    verifier("une seconde provocation remplace le provocateur",
             etatRenouvele && etatRenouvele.idProvocateur === "FRAGILE",
             etatRenouvele ? etatRenouvele.idProvocateur : "(aucun état)");
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
