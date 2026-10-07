// L'EMPOISONNEMENT PREND SUR L'ÉNERGIE MAXIMUM, PAS SUR CE QU'IL EN RESTE.
//
// Nico : « vérifier que pour l'empoisonnement, la baisse de fatigue se fasse
// bien sur la fatigue max de la cible et non actuelle. »
// Règle (tableau des effets) : 10 % de l'énergie MAXIMUM, et 8 % des PV max
// en dégâts bruts ; le poison du maître (Assassin 10) : 18 % et 9 %. Une
// cible de 150 d'énergie max qui n'en a plus que 30 perd donc 15 (pas 3).
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat } from '../combat_etat.js';
import { ticsDeFinDeManche } from '../cerveau_combat.js';
import { POISON, POISON_MAITRE } from '../moteur_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(70)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const w = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/experience.js', 'utf-8'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);
const REGLES = {
    pvMax: w.pvMaxCombattant, fatigueMax: w.fatigueMaxCombattant,
    esquive: w.esquiveCombattant, parade: w.paradeCombattant,
    defPhysique: w.defPhysiqueCombattant, defMagique: w.defMagiqueCombattant,
    critique: w.critiqueCombattant, atouts: w.atoutRace, bonusEquip: w.bonusEquip
};
const fiche = (id, fatigueMax, fatigue) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: "Ennemi", estMonstre: true, joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: fatigueMax, Fatigue_Actuelle: fatigue,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant"
});
const empoisonner = (fatigueMax, fatigue, maitre = false) => {
    const e = construireEtatCombat({ idPartie: "P", cerveau: "M", graine: 1, combattants: [fiche("M", fatigueMax, fatigue)],
                                     positions: { M: { q: 0, r: 0 } }, partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["M"];
    const c = e.combattants.M;
    c.etats = [{ nom: "Empoisonnement", duree: 2, ...(maitre ? { maitre: true } : {}) }];
    const avant = c.fatigue, max = c.fatigueMax;
    ticsDeFinDeManche(e);
    return { avant, max, apres: c.fatigue, perte: avant - c.fatigue };
};

console.log("\n=========================================================");
console.log("  L'EMPOISONNEMENT : 10 % DE L'ÉNERGIE MAXIMUM");
console.log("=========================================================\n");

verifier("la règle : 10 % de l'énergie max (poison), 18 % (maître)", POISON.energiePct === 10 && POISON_MAITRE.energiePct === 18);
const a = empoisonner(150, 30);
verifier("150 max, 30 restants : perd 15 (10 % du max), pas 3 (10 % du reste)", a.max === 150 && a.perte === 15 && a.apres === 15,
         JSON.stringify(a));
const b = empoisonner(150, 150);
verifier("150 max, plein : perd 15 aussi — la même morsure quel que soit le reste", b.perte === 15, JSON.stringify(b));
const c = empoisonner(80, 5);
verifier("80 max, 5 restants : tombe à 0 (8 dus, jamais en dessous de zéro)", c.apres === 0, JSON.stringify(c));
const d = empoisonner(150, 40, true);
verifier("poison du maître, 150 max, 40 restants : perd 27 (18 % du max)", d.perte === 27, JSON.stringify(d));

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
