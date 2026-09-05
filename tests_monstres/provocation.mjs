// PROVOCATION.
// Nouvel effet de combat : oblige la cible à n'attaquer QUE le lanceur tant que
// l'état dure. Réservée aux joueurs — un monstre ne peut jamais la lancer (voir
// monstres_competences.js, effetAutorise). Ce banc teste le VRAI bloc de
// détection de moteur_effets.js (demarrerCiblage), extrait par ses commentaires
// repères, exactement comme coup_critique.mjs extrait afficherMessageFlottantHex.
// La lecture côté IA (choisirCibleMonstre) est déjà couverte par
// equipement_combat.mjs.
import fs from 'fs';

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

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
