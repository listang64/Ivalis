// PAS DE PERSISTANCE SUR UN SOIN.
//
// Nico : « fais en sorte qu'on ne puisse pas mettre de persistance sur les
// soins. Zone oui, mais grise la persistance. » Dans la Forge, sur une action
// de Soin, « Persistance terrain » apparaît grisée (non compatible) ; la Zone
// reste disponible. Sur une attaque, rien ne change. (Côté combat, le noyau ne
// met plus jamais de soin dans une nappe : zones_cerveau.mjs, section 8.)
import fs from 'fs';

const src = fs.readFileSync('/home/user/Ivalis/competences.js', 'utf-8');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const SRC_PARSE = src.slice(src.indexOf('function parseFrenchFloat'), src.indexOf('function nettoyerNomEffet'));
const SRC_NETTOIE = src.slice(src.indexOf('function nettoyerNomEffet'), src.indexOf('function normalizeForgeType'));
const SRC_ATTAQUE = src.slice(src.indexOf('function estUneAttaqueDeBase'), src.indexOf('function estUneAttaqueDeBase') + 400);
const finAttaque = SRC_ATTAQUE.indexOf('\n}\n') + 3;
const SRC_ATTAQUE_FN = SRC_ATTAQUE.slice(0, finAttaque);

// Les deux règles qui décident SUR QUOI l'étalement peut se greffer, prises
// telles quelles dans la Forge — pas réécrites ici.
const SRC_REGLES_ETALEMENT = src.slice(src.indexOf('    const estUnModEtalement = (nomLower) => {'),
                                       src.indexOf('    const renderSelectMenu = (type, label'));
if (!SRC_REGLES_ETALEMENT.includes('actionAccepteEtalement')) {
    throw new Error("les règles d'étalement ne sont plus là où le banc les cherche");
}

// Les trois formes d'action sur lesquelles l'étalement a un sens, et une qui
// ne doit jamais l'accepter.
const action = (nomEffetBase) => ({ idInst: "A1", baseEffet: { Nom: nomEffetBase }, mods: {} });

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
function optionsPour({ aDejaUneAttaque, aDejaUnSoin = false, estActionPoussee = false, estActionIllusion = false, mods,
                      actionCourante = action("Attaque légère") }) {
    const groupesMods = {};
    const activeTags = new Set();
    const NOMS_INCOMPATIBLES_POUSSEE = ["persistance terrain", "zone", "durée étalement dégâts"];
    const modsDispos = mods;
    // Un seul eval : les déclarations de fonction d'un eval strict (modules ES)
    // ne fuient jamais vers l'appelant, mais restent visibles ENTRE ELLES à
    // l'intérieur d'un même bloc évalué.
    eval(SRC_PARSE + '\n' + SRC_NETTOIE + '\n' + SRC_ATTAQUE_FN + '\n'
         + SRC_REGLES_ETALEMENT + '\n' + SRC_BLOC);
    return Object.values(groupesMods).flat().join("");
}

const mod = (nom) => ({ id: "M_" + nom, Nom: nom, Modificateur: "AUCUN", Cout_PT: "1" });
const MODS = [mod("Persistance terrain"), mod("Zone")];
const ligne = (html, nom) => (html.match(new RegExp(`<option[^>]*>${nom}[^<]*</option>`)) || [""])[0];

console.log("1. SUR UN SOIN : LA ZONE OUI, LA PERSISTANCE NON");
{
    const html = optionsPour({ aDejaUneAttaque: false, aDejaUnSoin: true, mods: MODS, actionCourante: action("Soin") });
    const persistance = ligne(html, "Persistance terrain"), zone = ligne(html, "Zone");
    verifier("« Persistance terrain » est grisée (non compatible)",
             /disabled/.test(persistance) && /non compatible/.test(persistance), persistance);
    verifier("« Zone » reste disponible", !!zone && !/disabled/.test(zone), zone);
}

console.log("\n2. SUR UNE ATTAQUE : RIEN NE CHANGE");
{
    const html = optionsPour({ aDejaUneAttaque: true, mods: MODS, actionCourante: action("Attaque Magique") });
    verifier("la Persistance terrain reste disponible sur une attaque",
             !/disabled/.test(ligne(html, "Persistance terrain")), ligne(html, "Persistance terrain"));
}

console.log("\n3. UN SOIN AUX AUTRES NOMS (Guérison) EST TRAITÉ PAREIL");
{
    const html = optionsPour({ aDejaUneAttaque: false, aDejaUnSoin: true, mods: MODS, actionCourante: action("Guérison") });
    verifier("grisée aussi sur une Guérison", /disabled/.test(ligne(html, "Persistance terrain")));
}

console.log("\n4. LES MONSTRES SUIVENT LA MÊME RÈGLE (générateur)");
{
    const EFFETS = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/effets_reels.json', 'utf-8'));
    const fenetre = {}; global.window = fenetre;
    global.localStorage = { getItem: () => null };
    global.fetch = async () => { throw new Error("IA débranchée"); };
    global.document = { getElementById: () => null };
    fenetre.EFFETS_BDD_CACHE = EFFETS; fenetre.gabaritMonstre = () => null;
    eval(fs.readFileSync('/home/user/Ivalis/monstres_competences.js', 'utf-8').replace(/^import[\s\S]*?from\s+"[^"]+";/gm, ''));
    const src2 = fs.readFileSync('/home/user/Ivalis/monstres_competences.js', 'utf-8');
    verifier("le générateur refuse la Persistance sur une action de soin",
             /pas de Persistance terrain sur un soin/.test(src2));
    let fautives = 0, cartes = 0;
    for (const archetype of ["SOUTIEN", "DPS MAGE DISTANCE", "DPS MAGE CAC"]) {
        for (let i = 0; i < 10; i++) {
            const docs = await fenetre.genererCompetencesMonstre({ nom: "C", archetype, palier: "Élite" });
            docs.forEach(d => { cartes++; d.Composants.actions.forEach(a => {
                const base = ((EFFETS[a.baseEffetId] || {}).Nom || "").toLowerCase();
                const persiste = Object.keys(a.mods || {}).some(id => /persistance/i.test((EFFETS[id] || {}).Nom || ""));
                if (persiste && /soin|guérison/.test(base) && !/bouclier/.test(base)) fautives++;
            }); });
        }
    }
    verifier("aucune technique de monstre n'a de Persistance sur un soin", fautives === 0, `${fautives}/${cartes}`);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
