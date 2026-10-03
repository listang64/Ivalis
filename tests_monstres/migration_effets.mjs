// LES EFFETS DE CLASSE SANS BOUTON D'INSTALLATION.
//
// Nico : « tu pourras virer les boutons pour installer les trucs genre
// Ténèbres ou les classes, ils servent plus ». Les deux boutons des Paramètres
// (« Installer les effets de classe », « Installer les classes ») sont partis,
// avec les fonctions qu'ils appelaient. Le jeu n'écrit donc plus rien dans le
// grimoire (Combat_Effets) ni dans la collection Classes.
//
// Les effets de classe (Ténèbres du Nécromancien, Lumière du Chasseur de
// mages) vivent dans app.js en copie locale, et ce banc vérifie :
//
//   UN.    Les boutons et leurs fonctions ont disparu.
//   DEUX.  La copie locale porte Ténèbres et Lumière, avec leurs réglages.
//   TROIS. Elle complète une base qui ne les a pas, sans toucher au reste.
//   QUATRE. Une version de la base, même retouchée à la main, n'est jamais
//          remplacée par la copie locale.
import fs from 'fs';

const RACINE = '/home/user/Ivalis';
const src = fs.readFileSync(`${RACINE}/app.js`, 'utf-8');
const srcClasses = fs.readFileSync(`${RACINE}/classes.js`, 'utf-8');
const html = fs.readFileSync(`${RACINE}/index.html`, 'utf-8');

function bloc(debut, finExclue) {
    const i = src.indexOf(debut);
    const j = src.indexOf(finExclue, i);
    if (i < 0 || j < 0) throw new Error("bloc introuvable : " + debut);
    return src.slice(i, j);
}
// Le VRAI tableau et la VRAIE fonction de secours, extraits tels quels.
const SRC_SECOURS = bloc('window.MIGRATION_EFFETS = [', 'window.effetReserveAUneClasse = function');
const charger = () => new Function('window', SRC_SECOURS + '\nreturn window;')({});

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// La base réelle, sans les effets de classe, avec des retouches faites à la main.
const EFFETS_REELS = JSON.parse(fs.readFileSync(`${RACINE}/tests_monstres/effets_reels.json`, 'utf-8'));
delete EFFETS_REELS.EFF_TENEBRES;
delete EFFETS_REELS.EFF_LUMIERE;
const RETOUCHEE = JSON.parse(JSON.stringify(EFFETS_REELS));
RETOUCHEE.EFF_BRULE = { ...RETOUCHEE.EFF_BRULE, Notes: "-50% de soins reçus, et 8% de dégats physique des pv max de la cible" };
RETOUCHEE.EFF_CONFUSION = { ...RETOUCHEE.EFF_CONFUSION, Notes: "" };

console.log("\n=========================================================");
console.log("  LES EFFETS DE CLASSE, SANS BOUTON D'INSTALLATION");
console.log("=========================================================\n");

// =========================================================================
console.log("1. LES BOUTONS ET LEURS FONCTIONS ONT DISPARU");
// =========================================================================
{
    verifier("plus de bouton « Installer les effets de classe »", !/btn-migration-effets/.test(html) && !/appliquerMigrationEffets/.test(html));
    verifier("plus de bouton « Installer les classes »", !/btn-installer-classes/.test(html) && !/installerClasses/.test(html));
    verifier("ni de libellé « Installer » dans les Paramètres", !/>Installer[^<]*<\/button>/.test(html));
    verifier("app.js ne sait plus installer d'effet", !/appliquerMigrationEffets/.test(src));
    verifier("ni écrire dans le grimoire pour ça", !/doc\(db, "Combat_Effets", regle\.id\)/.test(src));
    verifier("classes.js ne sait plus installer les classes", !/installerClasses/.test(srcClasses) && !/setDoc/.test(srcClasses));
}

// =========================================================================
console.log("\n2. LA COPIE LOCALE : TÉNÈBRES ET LUMIÈRE");
// =========================================================================
{
    const w = charger();
    const table = w.MIGRATION_EFFETS;
    verifier("deux effets : EFF_TENEBRES, EFF_LUMIERE, en copie locale",
             table.length === 2 && table[0].id === "EFF_TENEBRES" && table[1].id === "EFF_LUMIERE"
             && table.every(r => r.secoursLocal), table.map(r => r.id).join(", "));
    const ten = table[0].champs;
    verifier("Ténèbres : 2 pts, Intelligence, 3, racine, Nécromancien niv. 5",
             ten.Nom === "Ténèbres" && ten.Cout_PT === "2" && ten.Modificateur === "INTELLIGENCE" && ten.Valeur === 3
             && ten.Type_Mecanique === "Action/Global" && ten.Classe === "Nécromancien" && ten.Niveau_Requis === 5);
    const lum = table[1].champs;
    verifier("Lumière : 1 pt, Intelligence, 15 % (max 60), Magique/Physique, Chasseur de mages niv. 5",
             lum.Nom === "Lumière" && lum.Cout_PT === "1" && lum.Modificateur === "INTELLIGENCE" && lum.Pourcent_Base === 15
             && lum.Pourcent_Max === 60 && lum.Type_Mecanique === "Magique" && lum.Type_Mecanique_2 === "Physique"
             && lum.Classe === "Chasseur de mages" && lum.Niveau_Requis === 5, JSON.stringify(lum).slice(0, 140));
}

// =========================================================================
console.log("\n3. ELLE COMPLÈTE UNE BASE QUI NE LES A PAS, SANS TOUCHER AU RESTE");
// =========================================================================
{
    const w = charger();
    const cache = JSON.parse(JSON.stringify(RETOUCHEE));
    w.completerEffetsDeSecours(cache);
    verifier("Ténèbres et Lumière sont là", cache.EFF_TENEBRES.Nom === "Ténèbres" && cache.EFF_LUMIERE.Nom === "Lumière");
    const reste = { ...cache }; delete reste.EFF_TENEBRES; delete reste.EFF_LUMIERE;
    verifier("le reste du grimoire est intact, au caractère près", JSON.stringify(reste) === JSON.stringify(RETOUCHEE));
    verifier("la note de la Brûlure retouchée à la main est intacte",
             cache.EFF_BRULE.Notes === "-50% de soins reçus, et 8% de dégats physique des pv max de la cible");
}

// =========================================================================
console.log("\n4. LA VERSION DE LA BASE L'EMPORTE TOUJOURS");
// =========================================================================
{
    const w = charger();
    const tenMain = { Nom: "Ténèbres", Valeur: 4, Cout_PT: "3", Notes: "Nico l'a rééquilibré" };
    const lumMain = { Nom: "Lumière", Pourcent_Base: 20, Pourcent_Max: 80 };
    const cache = { ...JSON.parse(JSON.stringify(RETOUCHEE)), EFF_TENEBRES: tenMain, EFF_LUMIERE: lumMain };
    w.completerEffetsDeSecours(cache);
    verifier("Ténèbres retouché à la main : laissé tel quel", JSON.stringify(cache.EFF_TENEBRES) === JSON.stringify(tenMain));
    verifier("Lumière retouchée à la main : laissée telle quelle", JSON.stringify(cache.EFF_LUMIERE) === JSON.stringify(lumMain));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
