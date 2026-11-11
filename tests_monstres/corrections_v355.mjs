// v355 — LA REFONTE DES CLASSES : L'ORACLE.
// Nico : « NIVEAU 1 : +8 Initiative. Les attaques arcaniques réduisent l'initiative de
// l'ennemi en fonction de la fatigue accumulée (30 : −5, 60 : −10, 90 : −15), au tour actuel
// et au tour suivant. NIVEAU 3 : −40 % de coût en fatigue pour « Initiative + », +1
// compétence. NIVEAU 5 : Retour dans le passé (tous reprennent les positions d'il y a 3
// tours). NIVEAU 9 : Retour arrière. » Ses réponses : le coût de l'attaque ; +8 sur les
// forgées ; le Retour dans le passé remplace l'Arrêt du temps (1×/combat, init 100, 0
// fatigue, moins de 3 manches → le début du combat) ; seules les positions changent.
// (Le détail de la classe : oracle.mjs.)
//
// Lancer : node tests_monstres/corrections_v355.mjs
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { trierSuiteDeFile, positionsIlYA } from '../moteur_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lireFichier = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8');

const w = {};
new Function('window', lireFichier('experience.js'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);
const XP = { 1: 0, 3: 1200, 5: 2500, 8: 5200, 9: 6400 };
const oracle = (n) => ({ classe: "Oracle", race: "Humain", xp: XP[n] });

console.log("\n1. LES PALIERS (atoutClasse : sans la race)");
{
    const a = (n) => w.atoutClasse(oracle(n));
    verifier("niveau 1 : +8 d'initiative et l'arcane qui ralentit", a(1).initiative === 8 && a(1).arcaneRalentit === true && !a(1).competences);
    verifier("niveau 3 : Initiative + à −40 %, +1 compétence", a(3).reductionInitiativePlus === 40 && a(3).competences === 1);
    verifier("niveau 5 : Retour dans le passé ; niveau 9 : Retour arrière (pas au 8)",
             JSON.stringify(a(5).techniques) === '["CLASSE_RETOUR_PASSE"]'
             && JSON.stringify(a(9).techniques) === '["CLASSE_RETOUR_PASSE","CLASSE_RETOUR_ARRIERE"]'
             && !(a(8).techniques || []).includes("CLASSE_RETOUR_ARRIERE"));
    verifier("l'Arrêt du temps a disparu du code", !/ARRET_TEMPS|arretDuTemps|ouvrirArretDuTemps|arret-temps/.test(
        ["app.js", "combat.js", "cerveau_combat.js", "moteur_pur.js", "combat_etat.js", "pont_combat.js", "style.css", "classes.js"].map(lireFichier).join("\n")));
}

console.log("\n2. LA FILE RETRIÉE APRÈS UN RALENTISSEMENT");
{
    const etat = { combattants: { O: {}, P: {}, B: { compagnon: { idMaitre: "P" } }, M: {} } };
    const file = [{ id: "O", initiative: 90 }, { id: "P", initiative: 40 }, { id: "B", initiative: 40 }, { id: "M", initiative: 60 }];
    const triee = trierSuiteDeFile(etat, file).map(f => `${f.id}:${f.initiative}`).join(" ");
    verifier("la tête reste ; le reste par initiative ; le compagnon derrière son maître", triee === "O:90 M:60 P:40 B:40", triee);
    const egal = trierSuiteDeFile({ combattants: {} }, [{ id: "O", initiative: 90 }, { id: "X", initiative: 50 }, { id: "Y", initiative: 50 }])
        .map(f => f.id).join("");
    verifier("à égalité : l'ordre d'avant", egal === "OXY");
}

console.log("\n3. LE PASSÉ CHOISI");
{
    const passe = [1, 2, 3, 4].map(m => ({ manche: m, positions: { A: { q: m, r: 0 } } }));
    verifier("manche 5 → manche 2 ; manche 4 → manche 1 ; manche 2 → le début (1)",
             positionsIlYA({ manche: 5, positionsPassees: passe }, 3).A.q === 2
             && positionsIlYA({ manche: 4, positionsPassees: passe }, 3).A.q === 1
             && positionsIlYA({ manche: 2, positionsPassees: passe }, 3).A.q === 1);
    verifier("aucun passé noté : rien", positionsIlYA({ manche: 5, positionsPassees: [] }, 3) === null);
}

console.log("\n4. LES TEXTES ET LA VERSION");
{
    const c = lireFichier("classes.js");
    verifier("la fiche : Prescience (+8), Esprit vif au 3, Retour dans le passé au 5, Retour arrière au 9",
             /\+8 d'initiative sur ses compétences/.test(c) && /niveau: 3, titre: "Esprit vif"/.test(c)
             && /niveau: 5, titre: "Technique : Retour dans le passé"/.test(c) && /niveau: 9, titre: "Technique : Retour arrière"/.test(c));
    verifier("version 355 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lireFichier("trace_combat.js")) || [])[1]) >= 355
             && JSON.parse(lireFichier("version.json")).version >= 355);
}
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
