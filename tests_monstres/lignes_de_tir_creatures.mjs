// LES CRÉATURES ONT, ELLES AUSSI, UNE LIGNE DE TIR.
//
// Nico : « un ennemi élite vient de tirer sans prendre en compte les murs sur
// le terrain, ils doivent être sujets aux lignes de tir comme les joueurs. »
//
// Un joueur ne peut viser qu'une cible EN VUE (ajouterCibleCiblage,
// moteur_effets.js) : un mur — de la carte ou de terre — coupe la ligne. La
// créature, elle, ne regardait que la distance : à portée, elle tirait, mur
// ou pas. Désormais, l'IA (ia_pure.js : choisirPosition, deciderTourCreature)
// ne compte « à portée » qu'une case d'où la cible se voit, et le cerveau
// (jouerCreature, cerveau_combat.js) refuse de tirer sans ligne de vue. Une
// carte de ZONE garde sa propre règle de pose (choisirZone).
//
// Le VRAI noyau (combat_etat, moteur_pur, ia_pure, cerveau_combat), sans
// navigateur.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, plateauDeCombat } from '../combat_etat.js';
import { ligneDeVue } from '../moteur_pur.js';
import { jouerCreature } from '../cerveau_combat.js';

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
const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
// H, le héros, en (0,0) ; M1, l'archer (un élite), en (4,0) : 4 cases, à portée de son arc (5).
const monde = (extraM = {}) => {
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 3,
        combattants: [fiche("H"), fiche("M1", { rang: "Elite", ...extraM })],
        positions: { H: { q: 0, r: 0 }, M1: { q: 4, r: 0 } }, partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["M1", "H"];
    e.phase = "Resolution";
    e.file = [{ id: "M1", carte: "ARC", initiative: 50, pas: 0 }, { id: "H", carte: "X", initiative: 1, pas: 0 }];
    return e;
};
// Une muraille de terre du Géomancien entre eux.
const muraille = (e) => {
    e.murs = {};
    [[2, 0], [2, -1], [3, -1], [1, 1]].forEach(([q, r]) => {
        e.murs[`MUR_T_${q}_${r}`] = { id: `MUR_T_${q}_${r}`, q, r, pv: 10, pvMax: 10, idLanceur: "G" };
    });
    return e;
};
const ARC = { idCarte: "ARC", infos: { portee: 5, fatigue: 0 },
              attaques: [{ nom: "Flèche", valeurBrute: 6, typeRes: "Physique", isRanged: true, rangeMax: 5 }], alterations: [] };
const tirs = (r) => ((r && r.entree && r.entree.etapes) || []).filter(x => x.type === "carte");

console.log("\n=========================================================");
console.log("  LES CRÉATURES ET LA LIGNE DE TIR");
console.log("=========================================================");

console.log("\n1. SANS MUR : L'ARCHER TIRE");
{
    const e = monde();
    const r = jouerCreature(e, "M1", ARC, plateauDeCombat(null, e));
    verifier("à 4 cases et en vue : il tire sur le héros", tirs(r).length === 1 && r.etat.combattants.H.pv < 100,
             `(PV ${r && r.etat.combattants.H.pv})`);
}

console.log("\n2. UNE MURAILLE DE TERRE ENTRE EUX : IL NE TIRE PAS À TRAVERS");
{
    const e = muraille(monde());
    const plateau = plateauDeCombat(null, e);
    verifier("(la muraille coupe bien la ligne de (4,0) à (0,0))", !ligneDeVue(plateau, { q: 4, r: 0 }, { q: 0, r: 0 }));
    const r = jouerCreature(e, "M1", ARC, plateau);
    const m = r.etat.combattants.M1;
    verifier("il s'est décalé pour voir sa cible", !(m.q === 4 && m.r === 0) && ligneDeVue(plateau, m, { q: 0, r: 0 }),
             `(${m.q},${m.r})`);
    verifier("…et c'est de là qu'il tire", tirs(r).length === 1 && r.etat.combattants.H.pv < 100);
}

console.log("\n3. IL NE PEUT PAS BOUGER : IL RENONCE, IL NE TIRE PAS");
{
    // Plus une once d'énergie pour marcher (l'arc ne coûte rien) : il reste
    // derrière la muraille. Avant, il tirait quand même, à travers la roche.
    const e = muraille(monde({ Fatigue_Actuelle: 0 }));
    const r = jouerCreature(e, "M1", ARC, plateauDeCombat(null, e));
    verifier("aucun tir à travers le mur", tirs(r).length === 0, JSON.stringify(((r && r.entree.etapes) || []).map(x => x.type)));
    verifier("le héros n'a rien pris", r.etat.combattants.H.pv === 100, `(PV ${r.etat.combattants.H.pv})`);
    verifier("il est resté où il était", r.etat.combattants.M1.q === 4 && r.etat.combattants.M1.r === 0);
}

console.log("\n4. UN MUR DE LA CARTE, PAREIL");
{
    const e = monde({ Fatigue_Actuelle: 0 });
    const carte = { etatCase: (q, r) => ({ bloquee: (q === 2 && r === 0) }) };
    const r = jouerCreature(e, "M1", ARC, plateauDeCombat(carte, e));
    verifier("une case bloquée de la carte entre eux : pas de tir", tirs(r).length === 0 && r.etat.combattants.H.pv === 100);
    const sansMur = monde({ Fatigue_Actuelle: 0 });
    const r2 = jouerCreature(sansMur, "M1", ARC, plateauDeCombat({ etatCase: () => ({}) }, sansMur));
    verifier("la même scène sans le mur : il tire", tirs(r2).length === 1);
}

console.log("\n5. AU CONTACT, UN MUR NE S'INTERPOSE JAMAIS");
{
    const e = monde();
    e.combattants.M1.q = 1; e.combattants.M1.r = 0;
    muraille(e);
    const griffe = { idCarte: "GRIFFE", infos: { portee: 1, fatigue: 0 },
                     attaques: [{ nom: "Griffe", valeurBrute: 4, typeRes: "Physique", isRanged: false, rangeMax: 1 }], alterations: [] };
    const r = jouerCreature(e, "M1", griffe, plateauDeCombat(null, e));
    verifier("collée au héros, la griffe porte", tirs(r).length === 1 && r.etat.combattants.H.pv < 100);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
