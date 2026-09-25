// PAS DE PERSISTANCE SUR UN SOIN.
//
// Nico : « fais en sorte qu'on ne puisse pas mettre de persistance sur les
// soins. Zone oui, mais grise la persistance. » Dans la Forge, sur une action
// de Soin, « Persistance terrain » apparaît grisée (non compatible) ; la Zone
// reste disponible. Sur une attaque, rien ne change. (Côté combat, le noyau ne
// met plus jamais de soin dans une nappe : zones_cerveau.mjs, section 8.)
//
// Puis : « Et fais aussi pas de persistance pour les dot. » L'Étalement (mod
// « Durée étalement dégâts », alias DOT) et la Persistance terrain ne vont plus
// ensemble sur une même carte : si l'un est posé, l'autre est grisé, dans les
// deux sens et quelle que soit l'action qui le porte (sections 5 à 7). Le
// noyau, lui, ne met jamais de dégâts étalés dans une nappe (zones_cerveau.mjs,
// section 8).
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
// Ce que la carte porte déjà (toutes actions confondues), lu juste avant le
// bloc : c'est là que la Forge décide si l'Étalement et la Persistance se
// croisent déjà sur la carte.
const debutCarte = src.indexOf('        const nomsSurLaCarte = [];');
if (debutCarte < 0 || debutCarte > debutBloc) throw new Error("inventaire de la carte introuvable avant le bloc");
const SRC_CARTE = src.slice(debutCarte, debutBloc);
if (!SRC_BLOC.includes('estIncompatibleEtalement')) {
    throw new Error("la protection étalement n'est plus dans le bloc extrait (repères à revoir)");
}

// Rejoue exactement l'environnement local que ce bloc trouve dans rafraichirForge.
function optionsPour({ aDejaUneAttaque, aDejaUnSoin = false, estActionPoussee = false, estActionIllusion = false, mods,
                      actionCourante = action("Attaque légère"), autres = [] }) {
    const groupesMods = {};
    // La Forge telle que le menu la voit : l'action courante, les autres
    // actions de la carte, et le grimoire (pour relire le nom des sous-effets).
    const window = { forgeState: { actions: [actionCourante, ...autres].filter(Boolean),
                                   effetsBDD: [...mods, ...autres.flatMap(a => a.effetsMods || [])] } };
    const activeTags = new Set();
    const NOMS_INCOMPATIBLES_POUSSEE = ["persistance terrain", "zone", "durée étalement dégâts"];
    const modsDispos = mods;
    // Un seul eval : les déclarations de fonction d'un eval strict (modules ES)
    // ne fuient jamais vers l'appelant, mais restent visibles ENTRE ELLES à
    // l'intérieur d'un même bloc évalué.
    eval(SRC_PARSE + '\n' + SRC_NETTOIE + '\n' + SRC_ATTAQUE_FN + '\n'
         + SRC_REGLES_ETALEMENT + '\n' + SRC_CARTE + '\n' + SRC_BLOC);
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

const DOT = mod("Durée étalement dégâts"), PERSIST = mod("Persistance terrain");
const MODS_DOT = [DOT, mod("DOT"), PERSIST, mod("Zone")];

console.log("\n5. UN DOT SUR LA CARTE : LA PERSISTANCE EST GRISÉE");
{
    const surLaMeme = optionsPour({ aDejaUneAttaque: true, mods: MODS_DOT,
        actionCourante: { ...action("Attaque Magique"), mods: { [DOT.id]: 1 } } });
    verifier("DOT sur l'attaque : sa Persistance est grisée",
             /disabled/.test(ligne(surLaMeme, "Persistance terrain")), ligne(surLaMeme, "Persistance terrain"));
    verifier("la Zone, elle, reste disponible", !/disabled/.test(ligne(surLaMeme, "Zone")));
    const ailleurs = optionsPour({ aDejaUneAttaque: true, mods: MODS_DOT, actionCourante: action("Zone"),
        autres: [{ idInst: "A0", baseEffet: { Nom: "Attaque Magique" }, mods: { [DOT.id]: 1 }, effetsMods: [DOT] }] });
    verifier("DOT posé sur une AUTRE action : la Persistance reste grisée",
             /disabled/.test(ligne(ailleurs, "Persistance terrain")), ligne(ailleurs, "Persistance terrain"));
    const sansDot = optionsPour({ aDejaUneAttaque: true, mods: MODS_DOT, actionCourante: action("Attaque Magique") });
    verifier("sans DOT, la Persistance redevient disponible",
             !/disabled/.test(ligne(sansDot, "Persistance terrain")), ligne(sansDot, "Persistance terrain"));
}

console.log("\n6. UNE PERSISTANCE SUR LA CARTE : LE DOT EST GRISÉ");
{
    const html = optionsPour({ aDejaUneAttaque: true, mods: MODS_DOT,
        actionCourante: { ...action("Attaque Magique"), mods: { [PERSIST.id]: 1 } } });
    verifier("« Durée étalement dégâts » grisée", /disabled/.test(ligne(html, "Durée étalement dégâts")),
             ligne(html, "Durée étalement dégâts"));
    verifier("« DOT » grisé aussi", /disabled/.test(ligne(html, "DOT")), ligne(html, "DOT"));
    const ailleurs = optionsPour({ aDejaUneAttaque: true, mods: MODS_DOT, actionCourante: action("Attaque Magique"),
        autres: [{ idInst: "A0", baseEffet: { Nom: "Zone" }, mods: { [PERSIST.id]: 1 }, effetsMods: [PERSIST] }] });
    verifier("Persistance posée sur une AUTRE action : le DOT reste grisé",
             /disabled/.test(ligne(ailleurs, "Durée étalement dégâts")));
}

console.log("\n7. LES MONSTRES NON PLUS NE MÉLANGENT PAS DOT ET PERSISTANCE");
{
    const EFFETS = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/effets_reels.json', 'utf-8'));
    const fenetre = global.window;
    // La vraie fonction du générateur, rendue par un eval du fichier réel.
    fenetre.__effetAutorise = eval(fs.readFileSync('/home/user/Ivalis/monstres_competences.js', 'utf-8')
        .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '') + '\n;effetAutorise');
    const nomDe = (id) => ((EFFETS[id] || {}).Nom || "").toLowerCase();
    const estDot = (n) => n.trim() === "dot" || n.includes("étalement") || n.includes("etalement");
    // Règle vérifiée à la source, sur un chantier construit à la main : la
    // génération aléatoire les croise trop rarement pour mordre à coup sûr.
    const effet = (nom) => { const id = Object.keys(EFFETS).find(k => EFFETS[k].Nom === nom); return { ...EFFETS[id], id }; };
    const chantier = (modsNoms) => ({ arme: "Magie", actions: [{ baseEffet: effet("Attaque Magique"),
        modsEffets: modsNoms.map(n => ({ effet: effet(n), count: 1 })) }] });
    verifier("générateur : pas de Persistance sur une carte déjà étalée",
             fenetre.__effetAutorise(chantier(["Durée étalement dégâts"]), effet("Persistance terrain"), true) === false);
    verifier("générateur : pas d'Étalement sur une carte déjà persistante",
             fenetre.__effetAutorise(chantier(["Persistance terrain"]), effet("Durée étalement dégâts"), true) === false);
    verifier("générateur : sur une carte nue, les deux restent permis",
             fenetre.__effetAutorise(chantier([]), effet("Persistance terrain"), true) !== false
             && fenetre.__effetAutorise(chantier([]), effet("Durée étalement dégâts"), true) !== false);
    let fautives = 0, cartes = 0;
    for (const archetype of ["DPS MAGE DISTANCE", "DPS MAGE CAC"]) {
        for (let i = 0; i < 15; i++) {
            const docs = await fenetre.genererCompetencesMonstre({ nom: "C", archetype, palier: "Boss" });
            docs.forEach(d => { cartes++;
                const noms = d.Composants.actions.flatMap(a => [nomDe(a.baseEffetId), ...Object.keys(a.mods || {}).map(nomDe)]);
                if (noms.some(estDot) && noms.some(n => n.includes("persistance"))) fautives++; });
        }
    }
    verifier("aucune technique de monstre générée ne porte les deux", fautives === 0, `${fautives}/${cartes}`);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
