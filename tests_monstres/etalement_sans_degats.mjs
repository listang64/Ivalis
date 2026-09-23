// ÉTALEMENT : RÉSERVÉ AUX DÉGÂTS ET AUX SOINS, ET SEULEMENT LÀ.
// Le mod "Durée étalement dégâts" (alias "DOT") divise les dégâts — ou les
// soins — d'une carte par un nombre de tours. Deux conditions, et le banc tient
// les deux sur le VRAI code de competences.js :
//   • LA CARTE doit frapper ou soigner quelque part — sur un pur contrôle, il
//     n'y a rien à étaler ;
//   • L'ACTION à laquelle on l'accroche doit être un coup, un soin, une Zone
//     ou une Distance — jamais un état altéré, jamais un bouclier. Étaler un
//     étourdissement ne veut rien dire : il n'y a pas de montant à diviser.
// Et deux choses de plus, demandées par Nico en même temps : le bouton ⏳ est
// offert sur l'étalement (chaque cran ajoute un tour, donc un diviseur de
// plus), et le texte de la Forge dit ce diviseur.
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

const modEtalement = (nom) => ({ id: "M1", Nom: nom, Modificateur: "AUCUN", Cout_PT: "1" });

console.log("1. SANS ATTAQUE NI SOIN SUR LA CARTE : L'ÉTALEMENT EST GRISÉ");
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

console.log("\n5. ET SEULEMENT SUR UNE ACTION QUI FRAPPE, SOIGNE, UNE ZONE OU UNE DISTANCE");
// Nouvelle règle : la carte a beau frapper ailleurs, l'étalement ne s'accroche
// pas à n'importe quelle action. Sur un état altéré, il n'y a rien à étaler.
{
    const surAttaque = optionsPour({ aDejaUneAttaque: true, mods: [modEtalement("DOT")],
                                     actionCourante: action("Attaque lourde") });
    verifier("sur une attaque : disponible", !/disabled/.test(surAttaque));

    const surZone = optionsPour({ aDejaUneAttaque: true, mods: [modEtalement("DOT")],
                                  actionCourante: action("Zone") });
    verifier("sur une Zone : disponible", !/disabled/.test(surZone));

    const surDistance = optionsPour({ aDejaUneAttaque: true, mods: [modEtalement("DOT")],
                                      actionCourante: action("Distance") });
    verifier("sur une Distance : disponible", !/disabled/.test(surDistance));

    const surEtat = optionsPour({ aDejaUneAttaque: true, mods: [modEtalement("DOT")],
                                  actionCourante: action("Étourdit") });
    verifier("sur un état altéré : GRISÉ, même si la carte frappe ailleurs",
             /disabled/.test(surEtat) && /non compatible/.test(surEtat), surEtat);

    const surSoin = optionsPour({ aDejaUneAttaque: true, mods: [modEtalement("DOT")],
                                  actionCourante: action("Soin") });
    verifier("sur un soin : disponible (un soin s'étale aussi)", !/disabled/.test(surSoin), surSoin);

    const surBouclier = optionsPour({ aDejaUneAttaque: true, mods: [modEtalement("DOT")],
                                      actionCourante: action("Bouclier magique") });
    verifier("sur un bouclier : grisé", /disabled/.test(surBouclier), surBouclier);

    // Et les autres mods, eux, restent offerts sur une action d'état.
    const autre = optionsPour({ aDejaUneAttaque: true, mods: [modEtalement("Distance")],
                                actionCourante: action("Étourdit") });
    verifier("un mod sans rapport reste disponible sur un état", !/disabled/.test(autre), autre);
}

console.log("\n6. UNE CARTE QUI NE FAIT QUE SOIGNER PEUT ÉTALER SON SOIN");
{
    const soinSeul = optionsPour({ aDejaUneAttaque: false, aDejaUnSoin: true, mods: [modEtalement("Durée étalement dégâts")],
                                   actionCourante: action("Soin") });
    verifier("sur le soin d'une carte sans attaque : disponible", !/disabled/.test(soinSeul), soinSeul);
    const zoneDeSoin = optionsPour({ aDejaUneAttaque: false, aDejaUnSoin: true, mods: [modEtalement("DOT")],
                                     actionCourante: action("Zone") });
    verifier("sur la Zone d'une carte de soin : disponible", !/disabled/.test(zoneDeSoin), zoneDeSoin);
    const etatDeSoin = optionsPour({ aDejaUneAttaque: false, aDejaUnSoin: true, mods: [modEtalement("DOT")],
                                     actionCourante: action("Étourdit") });
    verifier("sur l'état d'une carte de soin : grisé", /disabled/.test(etatDeSoin), etatDeSoin);
}

console.log("\n7. LE BOUTON ⏳ ET LE TEXTE DE LA FORGE");
{
    // La condition réelle du bouton ⏳ d'un sous-effet, telle quelle.
    const debutDuree = src.indexOf('                const nomModDuree = (modEff.Nom || "").toLowerCase().trim();');
    const finDuree = src.indexOf('                const currentModDuree = ', debutDuree);
    if (debutDuree < 0 || finDuree < 0) throw new Error("condition du bouton ⏳ introuvable");
    const SRC_DUREE = src.slice(debutDuree, finDuree);
    const aLeBoutonDuree = (modEff) => eval(SRC_PARSE + '\n' + SRC_DUREE + '\n; modHasDuree');
    verifier("l'étalement a son bouton ⏳ (un cran = un tour de plus)",
             aLeBoutonDuree({ Nom: "Durée étalement dégâts", Tours: 2 }) === true);
    verifier("l'empoisonnement, lui, reste sans bouton ⏳",
             aLeBoutonDuree({ Nom: "Empoisonnement", Tours: 2 }) === false);

    const debutTexte = src.indexOf('function formatterTexteEffet');
    const finTexte = src.indexOf('\nfunction ', debutTexte + 10);
    const SRC_TEXTE = src.slice(debutTexte, finTexte);
    const texte = (action) => eval(SRC_PARSE + '\nconst bonusPorteeDeRace = () => 0;\n' + SRC_TEXTE
        + '\n; formatterTexteEffet({ id: "M1", Nom: "Durée étalement dégâts", Tours: 2, Valeur: 2,'
        + ' Effet_Base: "Degats divisés par 2 sur 2 tours" }, 1, action)');
    const deux = texte({ modsDuree: {} });
    const trois = texte({ modsDuree: { M1: 1 } });
    verifier("le texte dit « divisés par 2 » sans cran ⏳", /divisés par 2/.test(deux) && /soins/.test(deux), deux);
    verifier("et « divisés par 3 » avec un cran", /divisés par 3/.test(trois) && /3 tours/.test(trois), trois);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
