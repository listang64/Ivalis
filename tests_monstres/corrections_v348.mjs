// v348 — LA REFONTE DES CLASSES : L'ASSASSIN.
// Nico : « niveau 1 : +15 % de critique pendant 2 tours quand il met un ennemi KO (non
// cumulable) ; niveau 3 : MAÎTRE DES POISONS (passif) — la cible empoisonnée par l'assassin
// perd 15 % de sa fatigue et 9 % de ses PV max, sur 2 tours ; niveau 5 : Assaut mortel ;
// niveau 9 : le bonus de critique passe à 25 % et devient cumulable. Assaut mortel : sur
// deux cibles adjacentes, 100 % d'empoisonnement + 10 dégâts physiques, INIT 100. »
// Ses réponses : 15 % et 9 % à chaque fin de manche, 2 manches ; chaque KO son bonus, avec
// ses propres 2 tours ; pas de plafond. (Le reste de la classe : assassin.mjs.)
//
// Lancer : node tests_monstres/corrections_v348.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat, ETAT_INSTINCT_TUEUR } from '../combat_etat.js';
import { resoudreCarte, critiqueDe, POISON_MAITRE } from '../moteur_pur.js';
import { validerIntention, appliquerIntention, vieillirLesEtats, ticsDeFinDeManche } from '../cerveau_combat.js';
import { infligerOpportunite } from '../mouvement_pur.js';
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
const assassin = (niveau, extra = {}) => fiche("S", { classe: "Assassin", xp: XP[niveau], ...extra });

// S (l'Assassin) en (0,0) ; M1 (1,0) et M2 (1,-1) au contact et côte à côte ;
// M4 (-1,0) au contact, de l'autre côté ; M3 (3,0) loin ; A (allié) en (0,1).
const monde = (niveau = 10, positions = {}) => {
    const fiches = [assassin(niveau), fiche("M1"), fiche("M2"), fiche("M3"), fiche("M4"), fiche("A")];
    const pos = { S: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 1, r: -1 }, M3: { q: 3, r: 0 },
                  M4: { q: -1, r: 0 }, A: { q: 0, r: 1 }, ...positions };
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: fiches, positions: pos,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["S", "M1", "M2", "M3", "M4", "A"];
    e.phase = "Resolution";
    return e;
};
const enTete = (e, id, carte) => { e.file = [{ id, carte, initiative: 100, pas: 0 }, { id: "M3", carte: "X", initiative: 10, pas: 0 }]; return e; };
const assaut = (cibles, extra = {}) => ({ id: "I" + Math.random(), type: "classe", acteur: "S", idCarte: "CLASSE_ASSAUT_MORTEL", cibles, ...extra });
// Une carte jouée par `lanceur` sur `cible` : dégâts, et des états qui prennent.
const lancer = (e, lanceur, cible, valeur, extra = {}) => resoudreCarte(e, {
    type: "carte", idLanceur: lanceur, idCarte: "C", critique: false,
    attaques: valeur > 0 ? [{ valeurBrute: valeur, typeRes: "Physique", cibles: [cible] }] : [],
    alterations: (extra.alterations || []).map(a => ({ ...a, cibles: [cible] })),
    jets: { attaqueRatee: false, parCible: { [cible]: { esquive: !!extra.esquive,
            etats: Object.fromEntries((extra.alterations || []).map(a => [a.nom, true])) } } } });
const POISON = { nom: "Empoisonnement", chance: 100, duree: 2, estPoison: true };
const instinct = (c) => (c.etats || []).find(x => x.nom === ETAT_INSTINCT_TUEUR);


const instincts = (c) => (c.etats || []).filter(x => x && x.nom === ETAT_INSTINCT_TUEUR);
const lireFichier = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8');

console.log("\n1. LES PALIERS : 1, 3, 5 ET 9");
{
    const a = (n) => w.atoutClasse(assassin(n));
    verifier("niveau 1 : Instinct +15 sans cumul", a(1).critiqueSurKO === 15 && !a(1).critiqueSurKOCumulable && !a(1).maitrePoisons);
    verifier("niveau 3 : Maître des poisons", !a(2).maitrePoisons && a(3).maitrePoisons === true);
    verifier("niveau 5 : Assaut mortel (init 100, fatigue 0)", JSON.stringify(a(5).techniques) === '["CLASSE_ASSAUT_MORTEL"]'
             && w.carteTechniqueClasse("CLASSE_ASSAUT_MORTEL").Initiative === 100 && w.carteTechniqueClasse("CLASSE_ASSAUT_MORTEL").Fatigue === 0);
    verifier("niveau 9 : Instinct cumulable +25", !a(8).critiqueSurKOCumulable && a(9).critiqueSurKOCumulable === 25);
    const e = monde(9);
    verifier("en combat, l'atout est sur l'Assassin, et sur personne d'autre", e.combattants.S.atouts.critiqueSurKOCumulable === 25
             && e.combattants.A.atouts.critiqueSurKOCumulable === 0);
}

console.log("\n2. NIVEAU 1 À 8 : +15, UN NOUVEAU KO RELANCE LA DURÉE");
{
    const e = monde(8), base = critiqueDe(e.combattants.S);
    const r1 = lancer(e, "S", "M1", 500).etat;
    const v = clonerEtat(r1); vieillirLesEtats(v);
    const r2 = lancer(v, "S", "M2", 500).etat;
    verifier("deux KO : un seul Instinct, +15, durée relancée", instincts(r2.combattants.S).length === 1 && critiqueDe(r2.combattants.S) === base + 15
             && instincts(r2.combattants.S)[0].duree === 2, JSON.stringify(instincts(r2.combattants.S)));
}

console.log("\n3. NIVEAU 9 : +25 PAR KO, CHACUN SES 2 MANCHES, SANS PLAFOND");
{
    const e = monde(9), base = critiqueDe(e.combattants.S);
    const r1 = lancer(e, "S", "M1", 500);
    verifier("un KO : +25 de critique, 2 manches", critiqueDe(r1.etat.combattants.S) === base + 25 && instincts(r1.etat.combattants.S).length === 1
             && instincts(r1.etat.combattants.S)[0].duree === 2, String(critiqueDe(r1.etat.combattants.S)));
    const r2 = lancer(r1.etat, "S", "M2", 500).etat;
    verifier("un second KO dans la manche : +50 (deux Instincts)", critiqueDe(r2.combattants.S) === base + 50 && instincts(r2.combattants.S).length === 2);
    verifier("rejoué depuis le journal : même critique", critiqueDe(appliquerEntree(e, { etapes: r1.etapes }).combattants.S) === base + 25);
    // Le premier KO à la manche 1, un autre à la manche 2 : à la fin de la 2e, le premier tombe, pas le second.
    const m1 = clonerEtat(r1.etat); vieillirLesEtats(m1);
    const m2 = lancer(m1, "S", "M2", 500).etat;
    verifier("manche 2 : un KO de plus, +50 (le premier vit encore)", critiqueDe(m2.combattants.S) === base + 50);
    const f2 = clonerEtat(m2); vieillirLesEtats(f2);
    verifier("fin de la manche 2 : le premier tombe, le second reste (+25)", critiqueDe(f2.combattants.S) === base + 25 && instincts(f2.combattants.S).length === 1);
    const f3 = clonerEtat(f2); vieillirLesEtats(f3);
    verifier("fin de la manche 3 : plus rien", critiqueDe(f3.combattants.S) === base && instincts(f3.combattants.S).length === 0);
    let quatre = e;
    ["M1", "M2", "M3", "M4"].forEach(id => { quatre = lancer(quatre, "S", id, 500).etat; });
    verifier("quatre KO : +100, sans plafond", critiqueDe(quatre.combattants.S) === base + 100 && instincts(quatre.combattants.S).length === 4,
             String(critiqueDe(quatre.combattants.S)));
    // Le poison du maître qui achève en fin de manche compte aussi.
    const p = lancer(monde(9), "S", "M1", 0, { alterations: [POISON] }).etat;
    p.combattants.M1.pv = 5; p.file = [];
    ticsDeFinDeManche(p);
    verifier("son poison achève en fin de manche : +25 aussi", p.combattants.M1.aTerre && instincts(p.combattants.S).length === 1
             && critiqueDe(p.combattants.S) === base + 25);
    verifier("abattre un allié ne compte pas", instincts(lancer(monde(9), "S", "A", 500).etat.combattants.S).length === 0);
}

console.log("\n4. NIVEAU 3 : LE POISON DU MAÎTRE (15 % D'ÉNERGIE, 9 % DES PV, À CHAQUE MANCHE, 2 MANCHES)");
{
    const e = lancer(monde(3), "S", "M1", 0, { alterations: [POISON] }).etat;
    const p = e.combattants.M1.etats.find(x => x.nom === "Empoisonnement");
    verifier("niveau 3 : le poison posé est celui du maître, 2 manches", p.maitre === true && p.duree === 2, JSON.stringify(p));
    e.file = [];
    ticsDeFinDeManche(e);
    verifier("1re fin de manche : -15 d'énergie, -9 PV", e.combattants.M1.fatigue === 85 && e.combattants.M1.pv === 91, `${e.combattants.M1.fatigue} / ${e.combattants.M1.pv}`);
    vieillirLesEtats(e); ticsDeFinDeManche(e);
    verifier("2e fin de manche : encore -15 et -9 (30 et 18 en tout)", e.combattants.M1.fatigue === 70 && e.combattants.M1.pv === 82);
    vieillirLesEtats(e); ticsDeFinDeManche(e);
    verifier("puis il s'arrête", e.combattants.M1.fatigue === 70 && e.combattants.M1.pv === 82);
    verifier("la règle : 15 % et 9 %, 2 manches", POISON_MAITRE.energiePct === 15 && POISON_MAITRE.pvMaxPct === 9 && POISON_MAITRE.manches === 2);
    const n2 = lancer(monde(2), "S", "M1", 0, { alterations: [POISON] }).etat;
    verifier("niveau 2 : poison ordinaire", !n2.combattants.M1.etats.find(x => x.nom === "Empoisonnement").maitre);
    // L'Assaut mortel au niveau 5 pose donc le poison du maître.
    const a = appliquerIntention(enTete(monde(5), "S", "CLASSE_ASSAUT_MORTEL"), assaut(["M1", "M2"])).etat.combattants;
    verifier("l'Assaut mortel (niveau 5) : 10 physiques, et le poison du maître sur les deux", a.M1.pv === 90 && a.M2.pv === 90
             && ["M1", "M2"].every(id => a[id].etats.find(x => x.nom === "Empoisonnement").maitre === true));
}

console.log("\n5. LES TEXTES");
{
    const c = lireFichier("classes.js");
    verifier("la fiche de classe : paliers 1, 3, 5, 9 ; 15 % et 9 % ; +25 % cumulable",
             /niveau: 3, titre: "Maître des poisons"/.test(c) && /-15 % de fatigue/.test(c) && /niveau: 9, titre: "Instinct du tueur aiguisé"/.test(c) && /\+25 % de chance de critique/.test(c));
    verifier("la ligne des Statistiques dit le cumul", /cumulable/.test(w.texteAtout ? w.texteAtout("critiqueSurKOCumulable", 25) : lireFichier("app.js")));
    verifier("version 348 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lireFichier("trace_combat.js")) || [])[1]) >= 348 && JSON.parse(lireFichier("version.json")).version >= 348);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
