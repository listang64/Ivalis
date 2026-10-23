// LES CORRECTIONS DE LA v258 : LES ZOMBIES NE RESTENT QUE QUATRE TOURS.
//
//   « Fais que les zombies ne restent sur le terrain que pendant 4 tours. »
//
// Un zombie du Profanateur se relève avec 4 tours devant lui. Chacun de SES
// tours en retire un (cloturerTour, cerveau_combat.js) ; le tour de la manche
// où il s'est relevé ne compte pas, puisqu'il ne le joue pas. Au bout du
// quatrième, il retombe et quitte le terrain. Tout passe par le journal : un
// poste qui rejoue les entrées arrive au même zombie, au même tour près.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat, TYPES_ETAPES, ZOMBIE } from '../combat_etat.js';
import { resoudreCarte } from '../moteur_pur.js';
import { cloturerTour, jouerZombie, prochainPas } from '../cerveau_combat.js';
import { misEnScene, fichesDepuisEtat, renfortsDuTour, TYPES_MIS_EN_SCENE } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(74)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const essai = (f, defaut) => { try { return f(); } catch (e) { return defaut === undefined ? { erreur: e.message } : defaut; } };

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
// P, le Profanateur (niveau 5), loin ; M1 tombe à côté de M2, qu'il mordra.
const monde = () => {
    const fiches = [fiche("P", { classe: "Profanateur", xp: 2500 }), fiche("M1"), fiche("M2", { PV_Max: 200, PV_Actuels: 200 })];
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 7, combattants: fiches,
        positions: { P: { q: -6, r: 6 }, M1: { q: 0, r: 0 }, M2: { q: 1, r: 0 } }, partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["P", "M1", "M2"];
    e.phase = "Resolution";
    return e;
};
const coup = (e, lanceur, cible, valeur) => resoudreCarte(e, { type: "carte", idLanceur: lanceur, idCarte: "C", critique: false,
    attaques: [{ nom: "Coup", valeurBrute: valeur, typeRes: "Physique", cibles: [cible] }], alterations: [],
    jets: { attaqueRatee: false, parCible: { [cible]: { esquive: false, etats: {} } } } });

console.log("\n=========================================================");
console.log("  LES CORRECTIONS DE LA v258 : LES ZOMBIES, QUATRE TOURS");
console.log("=========================================================");

console.log("\n1. IL SE RELÈVE AVEC QUATRE TOURS DEVANT LUI");
const depart = monde();
depart.combattants.M1.pv = 5;
depart.file = [{ id: "P", carte: "C", initiative: 50, pas: 0 }, { id: "M1", carte: "X", initiative: 30, pas: 0 },
               { id: "M2", carte: "X", initiative: 20, pas: 0 }];
const releve = coup(depart, "P", "M1", 10);
{
    const z = releve.etat.combattants.M1;
    const etape = releve.etapes.find(x => x.type === "zombie");
    verifier("la règle : 4 tours (ZOMBIE.tours)", ZOMBIE.tours === 4, String(ZOMBIE.tours));
    verifier("relevé : zombie, 15 PV, 4 tours", !z.aTerre && z.pv === 15 && z.zombie && z.zombie.tours === 4, JSON.stringify(z.zombie));
    verifier("le journal le dit (l'étape « zombie » porte ses 4 tours)", !!etape && etape.tours === 4, JSON.stringify(etape));
    const rejoue = appliquerEntree(depart, { etapes: releve.etapes });
    verifier("rejoué depuis le journal : les mêmes 4 tours", rejoue.combattants.M1.zombie && rejoue.combattants.M1.zombie.tours === 4);
    // Un journal d'avant la v258 (étape sans tours) : il a ses quatre aussi.
    const ancien = appliquerEntree(depart, { etapes: releve.etapes.map(x => x.type === "zombie" ? (({ tours, ...r }) => r)(x) : x) });
    verifier("un journal d'avant (sans le nombre) : 4 tours aussi", ancien.combattants.M1.zombie && ancien.combattants.M1.zombie.tours === 4,
             JSON.stringify(ancien.combattants.M1.zombie));
}

console.log("\n2. LA MANCHE OÙ IL SE RELÈVE NE COMPTE PAS");
let etat = clonerEtat(releve.etat);
{
    // Le Profanateur finit son tour, puis M2 : la manche se clôt, M1 n'a pas joué.
    const a = clonerEtat(etat);
    cloturerTour(a);
    const b = clonerEtat(a);
    const fin = cloturerTour(b);
    verifier("M1 n'était plus dans la file de cette manche", !etat.file.some(f => f.id === "M1"));
    verifier("fin de manche : toujours 4 tours", b.combattants.M1.zombie.tours === 4 && !b.combattants.M1.aTerre,
             JSON.stringify(b.combattants.M1.zombie));
    verifier("aucun décompte au journal ce jour-là", !(fin && fin.etapes || []).some(x => x.type === "zombieTours"));
    etat = b;
}

console.log("\n3. QUATRE TOURS, PUIS IL RETOMBE");
{
    const pvM2 = [], restes = [], debout = [], scenes = [];
    let rejoue = clonerEtat(etat), dernier = null;
    for (let n = 1; n <= 4; n++) {
        const s = clonerEtat(etat);
        s.phase = "Resolution";
        s.file = [{ id: "M1", carte: "ZOMBIE_MORSURE", initiative: 0, pas: 0 }];
        const pas = jouerZombie(s, "M1");
        if (!pas) break;
        dernier = pas;
        rejoue = appliquerEntree(s, pas.entree);
        etat = pas.etat;
        pvM2.push(etat.combattants.M2.pv);
        restes.push(etat.combattants.M1.zombie ? etat.combattants.M1.zombie.tours : null);
        debout.push(!etat.combattants.M1.aTerre);
        (pas.entree.etapes || []).filter(x => x.type === "zombieTours").forEach(x => scenes.push(misEnScene(x, etat).texte));
        verifier(`tour ${n} : l'état reste cohérent`, verifierEtatCombat(etat).length === 0, verifierEtatCombat(etat).join(" | "));
    }
    verifier("il mord à chacun de ses 4 tours (200 → 193 → 186 → 179 → 172)", JSON.stringify(pvM2) === "[193,186,179,172]", JSON.stringify(pvM2));
    verifier("ses tours se décomptent : 3, 2, 1, 0", JSON.stringify(restes) === "[3,2,1,0]", JSON.stringify(restes));
    verifier("debout les trois premiers, à terre après le quatrième", JSON.stringify(debout) === "[true,true,true,false]", JSON.stringify(debout));
    const z = etat.combattants.M1;
    verifier("à la fin : 0 PV, à terre", z.aTerre && z.pv === 0, JSON.stringify({ pv: z.pv, aTerre: z.aTerre }));
    const etapes = (dernier && dernier.entree.etapes) || [];
    const iFin = etapes.findIndex(x => x.type === "zombieTours" && x.tours === 0);
    const iChute = etapes.findIndex(x => x.type === "chute" && x.cible === "M1" && x.finZombie);
    verifier("au journal : « 0 tour », puis sa chute", iFin >= 0 && iChute > iFin, etapes.map(x => x.type).join(","));
    verifier("rejoué depuis le journal : à terre aussi, 0 tour", rejoue.combattants.M1.aTerre && rejoue.combattants.M1.pv === 0
             && rejoue.combattants.M1.zombie.tours === 0);
    verifier("à l'écran : « Encore 3 tours », « 2 tours », « 1 tour », puis « Retombe en poussière »",
             JSON.stringify(scenes) === JSON.stringify(["🧟 Encore 3 tours", "🧟 Encore 2 tours", "🧟 Encore 1 tour", "🧟 Retombe en poussière"]),
             JSON.stringify(scenes));
    const chute = essai(() => misEnScene(etapes[iChute], etat), {});
    verifier("sa chute se joue comme une mise à terre", chute.geste === "chute" && chute.pion === "M1", JSON.stringify(chute).slice(0, 120));
}

console.log("\n4. IL A QUITTÉ LE TERRAIN");
{
    const s = clonerEtat(etat);
    s.phase = "Resolution";
    s.file = [{ id: "M1", carte: "ZOMBIE_MORSURE", initiative: 0, pas: 0 }, { id: "M2", carte: "X", initiative: 0, pas: 0 }];
    verifier("un 5e tour : le cerveau ne le joue plus", essai(() => jouerZombie(s, "M1"), "x") === null);
    const auto = essai(() => prochainPas(s, [], {}), null);
    verifier("ni de lui-même", !auto || auto.creature !== "M1", auto ? String(auto.creature) : "rien");
    const fiches = fichesDepuisEtat(etat, [fiche("M1", { PV_Max: 100 })]);
    verifier("sa fiche : 0 PV (le plateau le retire comme un mort)", fiches[0].PV_Actuels === 0, JSON.stringify(fiches[0]).slice(0, 140));
    const memoire = { annonces: new Set(["M1"]), attente: [], clePrecedente: String(etat.manche) };
    const r = renfortsDuTour(etat, memoire);
    verifier("aucun renfort de plus : sa place était déjà libérée", r.renforts === 0 && !r.morts.includes("M1"), JSON.stringify(r));
}

console.log("\n5. RETUÉ AVANT : RIEN NE CHANGE");
{
    const s = clonerEtat(releve.etat);
    s.combattants.M1.pv = 3;
    const r = coup(s, "M2", "M1", 10);
    verifier("un zombie qu'on retue tombe tout de suite, et ne revient pas", r.etat.combattants.M1.aTerre
             && !r.etapes.some(x => x.type === "zombie"));
    const t = clonerEtat(r.etat);
    t.file = [{ id: "M2", carte: "X", initiative: 0, pas: 0 }];
    const fin = cloturerTour(t);
    verifier("à terre, plus aucun décompte", !(fin.etapes || []).some(x => x.type === "zombieTours"));
}

console.log("\n6. LE MOTEUR ET L'ÉCRAN SE COMPRENNENT");
verifier("l'étape « zombieTours » existe, et a sa mise en scène", TYPES_ETAPES.includes("zombieTours")
         && TYPES_ETAPES.every(t => TYPES_MIS_EN_SCENE.includes(t)), TYPES_ETAPES.filter(t => !TYPES_MIS_EN_SCENE.includes(t)).join(","));

console.log("\n7. ÉCRIT EN CLAIR");
{
    const classes = fs.readFileSync('/home/user/Ivalis/classes.js', 'utf-8');
    const bloc = classes.slice(classes.indexOf("CLASSE_PROFANATEUR"), classes.indexOf("CLASSE_SENTINELLE"));
    verifier("le descriptif du Profanateur : « que 4 tours »", /ne reste sur le terrain que 4 tours/.test(bloc));
    verifier("son atout, sur la fiche : « pour 4 tours »", /pour 4 tours/.test(essai(() => w.texteAtout("zombies", true), "")),
             essai(() => w.texteAtout("zombies", true), ""));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
