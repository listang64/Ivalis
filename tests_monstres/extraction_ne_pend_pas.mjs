// PRÉPARER LA CARTE D'UNE CRÉATURE NE DOIT JAMAIS OUVRIR UN CIBLAGE.
//
// LE TROU, TROUVÉ EN AUDITANT LE CIBLAGE PARTAGÉ AVANT LA GRANDE SUPPRESSION.
//
// `regime_cerveau.js` (preparerLesCartes) appelle `demarrerCiblage(idCarte,
// { extraire: true, idLanceur })` en arrière-plan, bien avant le tour d'une
// créature, pour connaître d'avance la STRUCTURE de sa carte — jamais pour la
// jouer. Cet appel vit dans une boucle `for … await` : une créature après
// l'autre, chacune attendant que la précédente ait fini.
//
// Sauf que le Bond, quand il ouvre la carte (bondEnPremier), appelait
// resoudreBondInteractif SANS REGARDER `extraireSeulement` — une fonction
// qui assombrit l'écran et n'ATTEND RIEN D'AUTRE qu'un clic. Une créature dont
// la Forge a tiré « Bond » en tête de technique (rien ne l'interdit,
// contrairement à Provocation — voir monstres_competences.js,
// effetAutorise) faisait donc pendre `preparerLesCartes` pour de bon : ni
// elle, ni AUCUNE créature suivante dans la liste ne recevait jamais sa
// carte, puisque la boucle attendait un clic qui ne viendrait jamais.
//
// Ce banc extrait le VRAI bloc de moteur_effets.js (comme provocation.mjs
// extrait le sien) et prouve l'ordre exact : le clic interactif ne doit
// JAMAIS être demandé quand on ne fait qu'extraire.
import fs from 'fs';

const src = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8');
const debut = src.indexOf('    const idLanceurBond = (persoLanceur || {}).idPersonnage;');
const fin = src.indexOf('    if (attaquesExtraites.length === 0 && alterationsExtraites.length === 0) {');
if (debut === -1 || fin === -1) throw new Error("bloc « bondEnPremier » introuvable dans moteur_effets.js");
const blocBond = src.slice(debut, fin);

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

console.log("\n=========================================================");
console.log("  L'EXTRACTION EN ARRIÈRE-PLAN NE DOIT JAMAIS PENDRE");
console.log("=========================================================");

// Rejoue l'environnement local exact que le bloc trouve dans demarrerCiblage :
// un `return` en son sein n'est légal que DANS une fonction, jamais dans un
// script — on l'y remet donc avec le constructeur de fonction ASYNCHRONE
// (le bloc contient un `await`), comme migration_effets.mjs le fait avec
// `new Function` pour le même besoin côté synchrone.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const executerBlocBrut = new AsyncFunction(
    'window', 'extraireSeulement', 'isBond', 'indexPremierAutreEffet', 'indexBond',
    'persoLanceur', 'porteeBond',
    blocBond + '\nreturn "termine";'
);

async function executerBloc({ extraireSeulement, isBond, indexPremierAutreEffet, indexBond, persoLanceur }) {
    let appele = false;
    // Un clic qui ne vient jamais — si le bloc l'appelle malgré extraireSeulement,
    // cette promesse ne se résout JAMAIS : c'est exactement le blocage vécu en
    // vrai. Une course contre un court délai rend la main au banc au lieu de
    // pendre lui aussi.
    const window_ = {
        resoudreBondInteractif: (idLanceur, portee) => {
            appele = true;
            return new Promise(() => {});   // ne se résout jamais, comme en vrai
        }
    };

    const resultat = await Promise.race([
        executerBlocBrut(window_, extraireSeulement, isBond,
                         indexPremierAutreEffet, indexBond, persoLanceur, 3),
        new Promise(resolve => setTimeout(() => resolve("PENDU"), 200))
    ]);
    // Le bloc réel fait `return null` en extraction : c'est justement ce qui
    // évite d'appeler le clic. On ne réclame donc que « pas pendu », pas une
    // valeur de retour précise.
    return { appele, pendu: resultat === "PENDU" };
}

console.log("\n1. BOND EN TÊTE, EXTRACTION SEULE : NI CLIC, NI BLOCAGE");
{
    const { appele, pendu } = await executerBloc({
        extraireSeulement: true, isBond: true,
        indexPremierAutreEffet: 2, indexBond: 0, persoLanceur: { idPersonnage: "M1" }
    });
    verifier("resoudreBondInteractif n'est PAS appelé en extraction",
             !appele, appele ? "appelé — c'est le trou" : "");
    verifier("le bloc rend la main, il ne pend pas",
             !pendu, pendu ? "PENDU — c'est exactement le blocage vécu en vrai" : "");
}

console.log("\n2. BOND EN TÊTE, VRAI CIBLAGE JOUEUR : LE CLIC EST TOUJOURS DEMANDÉ");
// =========================================================================
//  Contre-essai : le correctif ne doit pas avoir supprimé le Bond pour de
//  vrai, seulement pendant une extraction en arrière-plan.
{
    const { appele } = await executerBloc({
        extraireSeulement: false, isBond: true,
        indexPremierAutreEffet: 2, indexBond: 0, persoLanceur: { idPersonnage: "H1" }
    });
    verifier("resoudreBondInteractif EST appelé pour une vraie carte jouée",
             appele);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
