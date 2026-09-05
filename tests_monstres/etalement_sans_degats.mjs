// ÉTALEMENT DES DÉGÂTS : RÉSERVÉ AUX CARTES QUI FRAPPENT.
// Le mod "Durée étalement dégâts" (alias "DOT") coupe en deux les dégâts d'une
// attaque — sur une carte sans attaque (un soin, un pur contrôle), il n'y a
// rien à étaler et le mod ne faisait déjà rien à la résolution (moteur_effets.js
// : etalementActif = aEtalement && !isHeal). Ce banc vérifie que la Forge le
// grise désormais aussi à l'écran, sur le VRAI code de competences.js, comme
// elle le fait déjà pour l'Empoisonnement.
import fs from 'fs';

const src = fs.readFileSync('/home/user/Ivalis/competences.js', 'utf-8');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const SRC_PARSE = src.slice(src.indexOf('function parseFrenchFloat'), src.indexOf('function nettoyerNomEffet'));
const SRC_NETTOIE = src.slice(src.indexOf('function nettoyerNomEffet'), src.indexOf('function normalizeForgeType'));
const SRC_ATTAQUE = src.slice(src.indexOf('function estUneAttaqueDeBase'), src.indexOf('function estUneAttaqueDeBase') + 400);
const finAttaque = SRC_ATTAQUE.indexOf('\n}\n') + 3;
const SRC_ATTAQUE_FN = SRC_ATTAQUE.slice(0, finAttaque);

// Le bloc RÉEL qui construit chaque <option> du menu déroulant de mods,
// extrait entre ses deux repères stables (rien de plus, rien de moins).
const debutBloc = src.indexOf('modsDispos.forEach(mod => {');
const finBloc = src.indexOf('ORDRE_MODS.forEach(carac => {');
if (debutBloc < 0 || finBloc < 0) throw new Error("bloc modsDispos.forEach introuvable");
const SRC_BLOC = src.slice(debutBloc, finBloc);
if (!SRC_BLOC.includes('estIncompatibleEtalement')) {
    throw new Error("la protection étalement n'est plus dans le bloc extrait (repères à revoir)");
}

// Rejoue exactement l'environnement local que ce bloc trouve dans rafraichirForge.
function optionsPour({ aDejaUneAttaque, estActionPoussee = false, estActionIllusion = false, mods }) {
    const groupesMods = {};
    const activeTags = new Set();
    const NOMS_INCOMPATIBLES_POUSSEE = ["persistance terrain", "zone", "durée étalement dégâts"];
    const modsDispos = mods;
    // Un seul eval : les déclarations de fonction d'un eval strict (modules ES)
    // ne fuient jamais vers l'appelant, mais restent visibles ENTRE ELLES à
    // l'intérieur d'un même bloc évalué.
    eval(SRC_PARSE + '\n' + SRC_NETTOIE + '\n' + SRC_ATTAQUE_FN + '\n' + SRC_BLOC);
    return Object.values(groupesMods).flat().join("");
}

const modEtalement = (nom) => ({ id: "M1", Nom: nom, Modificateur: "AUCUN", Cout_PT: "1" });

console.log("1. SANS ATTAQUE SUR LA CARTE : L'ÉTALEMENT EST GRISÉ");
{
    const html = optionsPour({ aDejaUneAttaque: false, mods: [modEtalement("Durée étalement dégâts")] });
    verifier("le mod apparaît, mais désactivé", /disabled/.test(html) && /non compatible/.test(html), html);
}

console.log("\n2. AVEC UNE ATTAQUE DÉJÀ SUR LA CARTE : IL REDEVIENT DISPONIBLE");
{
    const html = optionsPour({ aDejaUneAttaque: true, mods: [modEtalement("Durée étalement dégâts")] });
    verifier("le mod est sélectionnable", !/disabled/.test(html) && !/non compatible/.test(html), html);
}

console.log("\n3. L'ALIAS « DOT » SUIT LA MÊME RÈGLE");
{
    const sansAttaque = optionsPour({ aDejaUneAttaque: false, mods: [modEtalement("DOT")] });
    const avecAttaque = optionsPour({ aDejaUneAttaque: true, mods: [modEtalement("DOT")] });
    verifier("grisé sans attaque", /disabled/.test(sansAttaque));
    verifier("disponible avec une attaque", !/disabled/.test(avecAttaque));
}

console.log("\n4. LES AUTRES MODS NE SONT PAS TOUCHÉS PAR CETTE RÈGLE");
{
    const html = optionsPour({ aDejaUneAttaque: false, mods: [modEtalement("Distance")] });
    verifier("un mod sans rapport reste disponible même sans attaque", !/disabled/.test(html), html);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
