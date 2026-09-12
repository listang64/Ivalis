// LES ATOUTS DES SEPT PEUPLES, RÉSOLUS PAR LE CERVEAU.
//
// Reprend, sous le régime cerveau, ce qu'atouts_races.mjs vérifiait sections
// 2 à 4 via l'ancien jouerAnimationMoteur (supprimé à la grande suppression) :
// résistances de peuple appliquées dans une vraie frappe, immunités qui
// bloquent une altération même imposée par un critique, et bonus de soin
// reçu. Les VRAIES formules (app.js, table ATOUTS_RACES incluse) sont
// injectées comme `regles`, exactement comme le fait etatDepuisLeJeu
// (combat_etat.js) en jeu réel — jamais une imitation de ces pourcentages.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat } from '../combat_etat.js';
import { resoudreCarte } from '../moteur_pur.js';

const w = {};
new Function('window', SRC_STATS_COMMUNES)(w);
const REGLES = {
    esquive: w.esquiveCombattant, parade: w.paradeCombattant,
    defPhysique: w.defPhysiqueCombattant, defMagique: w.defMagiqueCombattant,
    critique: w.critiqueCombattant, atouts: w.atoutRace, bonusEquip: w.bonusEquip
};

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const perso = (id, race, extra = {}) => ({
    idPersonnage: id, prenom: id, race, camp: id === "CIBLE" ? "Ennemi" : "Allié",
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});

const etatAvec = (race) => construireEtatCombat({
    idPartie: "P1", cerveau: "P1", graine: 1,
    combattants: [perso("LANCEUR", "Ophior"), perso("CIBLE", race)],
    positions: { LANCEUR: { q: 0, r: 0 }, CIBLE: { q: 1, r: 0 } },
    partie: { Tour_Combat: 1 }, regles: REGLES
});

console.log("\n=========================================================");
console.log("  LES ATOUTS DE RACE, DANS UNE VRAIE RÉSOLUTION DE CARTE");
console.log("=========================================================");

// =========================================================================
console.log("\n1. LES RÉSISTANCES À L'ŒUVRE DANS UNE FRAPPE");
// =========================================================================
{
    const frapper = (race, magique) => resoudreCarte(etatAvec(race), {
        type: "carte", idLanceur: "LANCEUR", idCarte: "C1",
        attaques: [{ valeurBrute: 20, typeRes: magique ? "Magique" : "Physique", cibles: ["CIBLE"] }],
        alterations: [],
        jets: { attaqueRatee: false, parCible: { CIBLE: { esquive: false, etats: {} } } }
    }).etat.combattants.CIBLE.pv;

    const humainPhys = 100 - frapper("Humain", false), ankyPhys = 100 - frapper("Ankylar", false);
    const humainMag = 100 - frapper("Humain", true), ophiorMag = 100 - frapper("Ophior", true);
    console.log(`     physique : Humain ${humainPhys}, Ankylar ${ankyPhys}`);
    console.log(`     magique  : Humain ${humainMag}, Ophior ${ophiorMag}`);
    verifier("l'Ankylar encaisse 8 % de moins en physique",
             ankyPhys === 18 && humainPhys === 20, `(${humainPhys} → ${ankyPhys})`);
    verifier("l'Ophior encaisse 8 % de moins en magique",
             ophiorMag === 18 && humainMag === 20, `(${humainMag} → ${ophiorMag})`);
}

// =========================================================================
console.log("\n2. LES IMMUNITÉS, MÊME SUR UN CRITIQUE (qui impose l'état sans jet)");
// =========================================================================
{
    const empoisonner = (race, nomEtat) => resoudreCarte(etatAvec(race), {
        type: "carte", idLanceur: "LANCEUR", idCarte: "C1", critique: true,
        attaques: [{ valeurBrute: 5, typeRes: "Physique", cibles: ["CIBLE"] }],
        alterations: [{ nom: nomEtat, chance: 100, duree: 3, cibles: ["CIBLE"] }],
        jets: { attaqueRatee: false, parCible: { CIBLE: { esquive: false, etats: { [nomEtat]: true } } } }
    }).etat.combattants.CIBLE.etats.map(e => e.nom);

    verifier("un Humain attrape bien le poison",
             empoisonner("Humain", "Empoisonnement").includes("Empoisonnement"));
    verifier("l'Éthéré est immunisé au poison",
             !empoisonner("Ethéré", "Empoisonnement").includes("Empoisonnement"));
    verifier("un Humain attrape bien la brûlure",
             empoisonner("Humain", "Brûlé").includes("Brûlé"));
    verifier("l'Ondari est immunisé à la brûlure",
             !empoisonner("Ondari", "Brûlé").includes("Brûlé"));
    verifier("un Humain se fait étourdir normalement",
             empoisonner("Humain", "Étourdi").includes("Étourdi"));
    verifier("l'Ankylar est immunisé à l'Étourdi",
             !empoisonner("Ankylar", "Étourdi").includes("Étourdi"));
}

// =========================================================================
console.log("\n3. LES SOINS REÇUS");
// =========================================================================
{
    const soigner = (race) => {
        const blesse = clonerEtat(etatAvec(race));
        blesse.combattants.CIBLE.pv = 50;
        return resoudreCarte(blesse, {
            type: "carte", idLanceur: "LANCEUR", idCarte: "CS",
            attaques: [{ valeurBrute: 20, isHeal: true, cibles: ["CIBLE"] }], alterations: [],
            jets: { attaqueRatee: false, parCible: { CIBLE: { esquive: false, etats: {} } } }
        }).etat.combattants.CIBLE.pv - 50;
    };
    const humain = soigner("Humain"), ethere = soigner("Ethéré");
    console.log(`     soin de 20 : +${humain} pour un Humain, +${ethere} pour un Éthéré`);
    verifier("un soin ordinaire rend sa valeur", humain === 20, `(+${humain})`);
    verifier("l'Éthéré reçoit 30 % de plus", ethere === 26, `(+${ethere})`);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
