// v353 — LA REFONTE DES CLASSES : LA SENTINELLE.
// Nico : « niveau 1 : +6 dégâts sur les attaques d'opportunité. Niveau 3 : passif Défenseur
// (un ennemi qui entre dans son champ d'action au corps-à-corps — case adjacente, ou 2 cases
// avec une lance lourde — : 30 % de chance d'une attaque d'opportunité). Niveau 5 : Assaut de
// la sentinelle (repousse d'une case tous les belligérants adjacents et 70 % de chances d'une
// attaque d'opportunité sur chaque ennemi ainsi repoussé, init 0). Niveau 9 : le Défenseur
// passe à 50 %. » Ses réponses : alliés compris ; la poussée, puis les attaques ; esquive et
// parade possibles ; le +20 % de soins reçus disparaît. (Le reste : sentinelle.mjs.)
//
// Lancer : node tests_monstres/corrections_v353.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, combattantDepuisFiche } from '../combat_etat.js';
import { resoudreCarte } from '../moteur_pur.js';
import { validerIntention, appliquerIntention } from '../cerveau_combat.js';
import { resoudreMouvement, resoudreBond, resoudrePeur, resoudreRepli, porteeDeMenace } from '../mouvement_pur.js';
import { misEnScene } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const w = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/experience.js', 'utf-8'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);
const REGLES = {
    pvMax: w.pvMaxCombattant, fatigueMax: w.fatigueMaxCombattant,
    esquive: w.esquiveCombattant, parade: w.paradeCombattant,
    defPhysique: w.defPhysiqueCombattant, defMagique: w.defMagiqueCombattant,
    critique: w.critiqueCombattant, atouts: w.atoutRace, bonusEquip: w.bonusEquip
};
const XP = { 1: 0, 2: 700, 3: 1200, 4: 1800, 5: 2500, 8: 5200, 9: 6400, 10: 7900 };
const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const sentinelle = (niveau, extra = {}) => fiche("S", { classe: "Sentinelle", xp: XP[niveau], ...extra });
const monde = (niveau = 10, positions = {}, autres = ["M1", "M2", "A"]) => {
    const fiches = [sentinelle(niveau), ...autres.map(id => fiche(id))];
    // (A, l'allié, est loin par défaut : il frapperait lui aussi qui quitte son contact.)
    const pos = { S: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 4, r: 0 }, A: { q: -5, r: 5 }, H: { q: -1, r: 0 }, ...positions };
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: fiches, positions: pos,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["S", ...autres];
    e.phase = "Resolution";
    return e;
};
// Des dés posés à la main : `valeurs` dans l'ordre, puis 100 (rien ne réussit).
const desA = (...valeurs) => { const v = [...valeurs]; const tires = [];
    return { tires, d100: () => { const x = v.length ? v.shift() : 100; tires.push(x); return x; }, fraction: () => 0, parmi: (l) => l[0] }; };
const pv = (r, id) => r.etat.combattants[id].pv;
const marcher = (e, id, chemin, des) => resoudreMouvement(e, { idLanceur: id, chemin }, des);

console.log("\n=========================================================");
console.log("  LA SENTINELLE");
console.log("=========================================================");


const lireFichier = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8');
console.log("\n1. LE DÉFENSEUR : 30 % DU NIVEAU 3 AU 8, 50 % AU NIVEAU 9");
{
    const chemin = [{ q: 3, r: 0 }, { q: 2, r: 0 }, { q: 1, r: 0 }];
    const essai = (niveau, jet) => { const d = desA(jet, 100); const r = marcher(monde(niveau, { M1: { q: 9, r: 9 } }), "M2", chemin, d);
        return r.etapes.some(x => x.type === "message" && /Défenseur/.test(x.texte)); };
    verifier("niveau 3 : un jet de 30 déclenche, 31 non", essai(3, 30) && !essai(3, 31));
    verifier("niveau 8 : toujours 30 % (31 ne déclenche pas)", essai(8, 30) && !essai(8, 31));
    verifier("niveau 9 : 50 % (50 déclenche, 51 non)", essai(9, 50) && !essai(9, 51));
    verifier("niveau 2 : pas de Défenseur", !essai(2, 1));
    verifier("écrit en clair", /passe à 50 %/.test(w.texteAtout("defenseurRenforce", 50)));
}

console.log("\n2. L'ASSAUT DE LA SENTINELLE : LES ALLIÉS RECULENT AUSSI, JAMAIS FRAPPÉS");
{
    const i = { id: "F1", type: "classe", acteur: "S", idCarte: "CLASSE_FUREUR_SENTINELLE" };
    let alliesFrappes = 0, alliesPousses = 0;
    for (let g = 1; g <= 50; g++) {
        const e = monde(5, { M1: { q: 9, r: 9 }, A: { q: 0, r: 1 } }, ["M1", "A"]); e.graine = g;
        e.file = [{ id: "S", carte: "CLASSE_FUREUR_SENTINELLE", initiative: 0, pas: 0 }];
        const c = appliquerIntention(e, i).etat.combattants.A;
        if (c.pv < 100) alliesFrappes++;
        if (c.r === 2) alliesPousses++;
    }
    verifier("l'allié est repoussé chaque fois, jamais frappé (50 graines)", alliesPousses === 50 && alliesFrappes === 0, `${alliesPousses} / ${alliesFrappes}`);
}

console.log("\n3. LES TEXTES");
{
    const c = lireFichier("classes.js");
    verifier("la fiche : 1 (+6, sans soins reçus), 3 Défenseur, 5 Assaut, 9 Défenseur 50 %",
             /niveau: 3, titre: "Passif : Défenseur"/.test(c) && /niveau: 5, titre: "Technique : Assaut de la sentinelle"/.test(c)
             && /niveau: 9, titre: "Défenseur aguerri"/.test(c) && !/\+20 % de soins reçus"/.test(c));
    verifier("version 353 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lireFichier("trace_combat.js")) || [])[1]) >= 353
             && JSON.parse(lireFichier("version.json")).version >= 353);
}
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
