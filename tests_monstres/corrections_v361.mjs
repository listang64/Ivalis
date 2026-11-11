// v361 — LES RÉSERVES SONT BLOQUÉES, JAMAIS DÉPENSÉES (toutes les classes).
// Nico : « les points en réserve ne sont pas vraiment dépensés, ils sont juste inutilisables
// tant que la technique est active. Du coup leur jauge de fatigue est moins haute, ils ne
// pourront pas faire de grosses techniques. » Pour toutes les classes qui en ont.
// (Le détail : corrections_v347 Rempart, v349 Nuée, v351 Prise en charge, v354 Dernier
// sursis, chasseur_de_mages Bouclier anti-magie, pretre_lumiere Désintégration.)
//
// Lancer : node tests_monstres/corrections_v361.mjs
import fs from 'fs';
import { RESERVES_TECHNIQUES, coutLancementReserve, reserveMaintenueDe } from '../moteur_pur.js';
import { reservesDeFinDeManche } from '../cerveau_combat.js';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lire = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8');

console.log("\n1. LES PRIX ET LES RÉSERVES");
{
    const r = RESERVES_TECHNIQUES;
    verifier("Rempart, Prise en charge, Anti-magie : aucun prix, la réserve seule (15, 20, 20)",
             !r.CLASSE_REMPART.coutLancement && !r.CLASSE_PRISE_EN_CHARGE.coutLancement && !r.CLASSE_BOUCLIER_ANTIMAGIE.coutLancement
             && r.CLASSE_REMPART.parTour === 15 && r.CLASSE_PRISE_EN_CHARGE.parTour === 20 && r.CLASSE_BOUCLIER_ANTIMAGIE.parTour === 20);
    verifier("la Nuée : 40 de prix, 33 de réserve ; la Désintégration : 75, puis 60 au prochain tour",
             r.CLASSE_NUEE_CHAUVES_SOURIS.coutLancement === 40 && r.CLASSE_NUEE_CHAUVES_SOURIS.parTour === 33
             && r.CLASSE_DESINTEGRATION.coutLancement === 75 && r.CLASSE_DESINTEGRATION.parTour === 60 && r.CLASSE_DESINTEGRATION.auProchainTour === true);
    verifier("l'énergie libre qu'il faut au lancement : 15, 73, 20, 20, 75",
             [r.CLASSE_REMPART, r.CLASSE_NUEE_CHAUVES_SOURIS, r.CLASSE_PRISE_EN_CHARGE, r.CLASSE_BOUCLIER_ANTIMAGIE, r.CLASSE_DESINTEGRATION]
             .map(coutLancementReserve).join(",") === "15,73,20,20,75");
}

console.log("\n2. LA FIN DE MANCHE NE PREND RIEN");
{
    const etat = { ordre: ["H"], combattants: { H: { id: "H", fatigue: 50, etats: [
        { nom: "Rempart maintenu", maintien: "CLASSE_REMPART", reserve: 15, duree: 3, liens: [] },
        { nom: "Désintégration (réserve)", maintien: "CLASSE_DESINTEGRATION", reserve: 60, duree: 2, differee: true, liens: [], sansRelache: true }] } } };
    verifier("avant : 15 bloqués (la réserve différée ne compte pas encore)", reserveMaintenueDe(etat.combattants.H) === 15);
    const etapes = reservesDeFinDeManche(etat);
    verifier("après : rien de pris (50), aucune étape de fatigue", etat.combattants.H.fatigue === 50 && !etapes.some(x => x.type === "fatigue"));
    verifier("la réserve différée est bloquée à son tour (15 + 60), même au-delà de son énergie", reserveMaintenueDe(etat.combattants.H) === 75);
    const bu = { ordre: ["H"], combattants: { H: { id: "H", fatigue: 10, etats: [{ nom: "Rempart maintenu", maintien: "CLASSE_REMPART", reserve: 15, duree: 3, liens: [] }] } } };
    reservesDeFinDeManche(bu);
    verifier("énergie bue sous une réserve déjà bloquée : la technique tombe", !bu.combattants.H.etats.length);
}

console.log("\n3. LES TEXTES");
{
    const tout = lire("app.js") + lire("classes.js") + lire("moteur_pur.js") + lire("combat_etat.js") + lire("combat.js");
    verifier("plus aucune réserve « consommée » ni « payée » dans les textes du jeu", !/bloqués? puis consommés?|manche déjà payée|dejaPaye/.test(tout));
    verifier("version 361 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lire("trace_combat.js")) || [])[1]) >= 361
             && JSON.parse(lire("version.json")).version >= 361);
}
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
