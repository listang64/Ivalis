// LE CAP DE FATIGUE D'UNE COMPÉTENCE, REVU.
//
// La Forge limitait ce qu'une technique pouvait coûter à ((carac-5) × 10) :
// une droite, où chaque point de caractéristique valait toujours dix de plus.
// Nico a fourni une vraie table, qui n'est PAS une droite — un 15 vaut +15 par
// rapport à un 14 (75 → 90), un 16 ne reprend que +10 (90 → 100). Ce banc fait
// tourner le VRAI code de competences.js (window.capFatigueDeCarac), pas une
// réécriture de la table : une table recopiée dans un banc ne prouverait rien.
//
// Il vérifie aussi un choix qui n'est pas dans la table de Nico mais qui en
// découle : l'écart humain qu'il note lui-même — « 16 = 100 (ou 110 pour les
// humains) » — n'est pas un cas à part codé ici. C'est l'atout de race déjà
// existant (ATOUTS_RACES.Humain.fatigueMax = 10, app.js) qui s'ajoute par-dessus
// la table, exactement comme il s'ajoute déjà au reste de la fatigue d'un
// personnage. Si un jour cet atout change, le cap suit tout seul.
import fs from 'fs';

const srcApp = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8');
// Les deux blocs dont capFatigueDeCarac a besoin, tels quels : la table des
// atouts de race, et la fonction qui les lit sur une fiche.
const blocAtouts = srcApp.slice(srcApp.indexOf('window.ATOUTS_RACES = {'),
                                srcApp.indexOf('window.atoutRace = function') );
const blocAtoutRace = srcApp.slice(srcApp.indexOf('window.atoutRace = function'),
                                   srcApp.indexOf('window.atoutRace = function') + 400);
const finAtoutRace = blocAtoutRace.indexOf('\n};') + 3;
// bonusRaceFatigue : le pont que competences.js emprunte plutôt que de lire
// ATOUTS_RACES lui-même.
const blocBonusRaceFatigue = srcApp.slice(srcApp.indexOf('window.bonusRaceFatigue = function'),
                                          srcApp.indexOf('window.fatigueMaxCombattant = function'));

const srcComp = fs.readFileSync('/home/user/Ivalis/competences.js', 'utf-8');
const blocCap = srcComp.slice(srcComp.indexOf('window.TABLE_CAP_FATIGUE'),
                              srcComp.indexOf('window.rafraichirForge = function'));

const window = {};
new Function('window', blocAtouts + blocAtoutRace.slice(0, finAtoutRace) + '\n'
                     + blocBonusRaceFatigue + '\n' + blocCap)(window);

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

console.log("\n=========================================================");
console.log("  LE CAP DE FATIGUE D'UNE COMPÉTENCE");
console.log("=========================================================\n");

// =========================================================================
console.log("1. LA TABLE DE NICO, TELLE QUELLE, POUR UN NON-HUMAIN");
// =========================================================================
{
    const attendu = { 8: 15, 9: 25, 10: 35, 11: 45, 12: 55, 13: 65, 14: 75, 15: 90, 16: 100 };
    Object.entries(attendu).forEach(([carac, cap]) => {
        const r = window.capFatigueDeCarac(Number(carac), { race: "Gob" });
        verifier(`carac ${carac} → ${cap}`, r === cap, `(${r})`);
    });

    // CE N'EST PLUS UNE DROITE : le pas de 14 à 15 (+15) n'est pas celui de
    // 15 à 16 (+10). Une régression vers l'ancienne formule linéaire ne
    // laisserait pas passer les deux à la fois.
    verifier("le pas 14→15 vaut +15, pas +10",
             window.capFatigueDeCarac(15, {}) - window.capFatigueDeCarac(14, {}) === 15);
    verifier("le pas 15→16 vaut +10",
             window.capFatigueDeCarac(16, {}) - window.capFatigueDeCarac(15, {}) === 10);
}

// =========================================================================
console.log("\n2. L'ÉCART HUMAIN N'EST PAS CODÉ EN DUR — IL VIENT DE L'ATOUT");
// =========================================================================
{
    const humain16 = window.capFatigueDeCarac(16, { race: "Humain" });
    verifier("un Humain à carac 16 obtient bien 110, comme demandé",
             humain16 === 110, `(${humain16})`);

    // Et l'atout suit la table à CHAQUE échelon, pas seulement au sommet —
    // preuve que ce n'est pas un cas particulier posé juste pour carac 16.
    verifier("un Humain à carac 10 obtient 35 + 10 = 45",
             window.capFatigueDeCarac(10, { race: "Humain" }) === 45);

    // Un peuple sans bonus de fatigue (Gob, Ankylar…) ne voit rien changer.
    verifier("un Gob n'a pas ce bonus", window.capFatigueDeCarac(16, { race: "Gob" }) === 100);

    // La fiche Firestore porte "Race" (majuscule) : atoutRace lit les deux.
    verifier("et ça marche aussi avec le champ Firestore (Race majuscule)",
             window.capFatigueDeCarac(16, { Race: "Humain" }) === 110);
}

// =========================================================================
console.log("\n3. LES BORDS : SOUS 8, AU-DESSUS DE 16, ET UNE FICHE VIDE");
// =========================================================================
{
    verifier("sous 8, on ne descend pas plus bas que la table",
             window.capFatigueDeCarac(5, {}) === 15);
    verifier("une moyenne non entière est arrondie vers le bas, comme avant",
             window.capFatigueDeCarac(10.9, {}) === 35);
    verifier("au-delà de 16, ça continue de monter plutôt que de casser",
             window.capFatigueDeCarac(18, {}) === 120, `(${window.capFatigueDeCarac(18, {})})`);
    verifier("sans fiche du tout, la fonction ne tombe pas",
             window.capFatigueDeCarac(10) === 35);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
