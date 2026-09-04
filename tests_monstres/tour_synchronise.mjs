// « SUR UN DES TROIS APPAREILS, LE JOUEUR NE POUVAIT CLIQUER SUR AUCUNE DE SES
//   TECHNIQUES. ET QUAND UN AUTRE JOUEUR EST MORT, IL A PU JOUER NORMALEMENT. »
//
// Le symptôme désignait sa cause : la question « tout le monde a-t-il joué ? »
// était tranchée avec window.PERSOS_PARTIE, la liste LOCALE de chaque poste.
// Trois appareils, trois réponses — et deux règles contradictoires par-dessus
// (« statut !== Mort » ici, estCombattantMort() là), alors qu'un héros à zéro
// point de vie n'est JAMAIS marqué "Mort" en base.
//
// Ce banc joue les VRAIES transactions du jeu et vérifie qu'elles donnent le
// même verdict quelle que soit la vision du poste qui écrit.
import fs from 'fs';
import { creerMonde, extraire } from './monde_reseau.mjs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const SRC_HELPERS = ['window.combattantsAttendus = function',
                     'window.toutLeMondeAJoue = function',
                     'window.avecCarteJouee = function',
                     'window.synchroniserCombattantsHorsJeu = async function',
                     'window.modifierPartie = async function',
                     'window.estCombattantMort = function']
    .map(m => extraire('combat.js', m)).join('\n\n');

// =========================================================================
console.log("1. LE VERDICT NE DÉPEND PLUS DU POSTE QUI LE PREND");
{
    const w = {};
    new Function('window', 'db', 'doc', 'runTransaction', SRC_HELPERS)(w, {}, () => ({}), async () => null);

    const partie = {
        Ordre_Initiative: ["J1", "J2", "J3", "M1"],
        Combattants_Hors_Jeu: [],
        Ont_Joue_Ce_Round: [],
        File_Attente_Combat: []
    };

    verifier("les quatre combattants sont attendus",
             w.combattantsAttendus(partie).join(",") === "J1,J2,J3,M1");
    verifier("personne n'a joué : pas de résolution",
             w.toutLeMondeAJoue(partie, []) === false);
    verifier("trois sur quatre : toujours pas",
             w.toutLeMondeAJoue(partie, [{ idPersonnage: "J1" }, { idPersonnage: "J2" },
                                         { idPersonnage: "J3" }]) === false);
    verifier("les quatre : résolution",
             w.toutLeMondeAJoue(partie, [{ idPersonnage: "J1" }, { idPersonnage: "J2" },
                                         { idPersonnage: "J3" }, { idPersonnage: "M1" }]) === true);

    // LE CŒUR DU DÉFAUT : la réponse ne doit pas bouger selon ce que le poste
    // croit savoir des combattants.
    const versionA = { ...w };
    w.PERSOS_PARTIE = [];                                   // poste qui n'a rien chargé
    const vide = w.toutLeMondeAJoue(partie, [{ idPersonnage: "J1" }]);
    w.PERSOS_PARTIE = [{ idPersonnage: "J1" }, { idPersonnage: "J2" },
                       { idPersonnage: "J3" }, { idPersonnage: "M1" }];
    const complet = w.toutLeMondeAJoue(partie, [{ idPersonnage: "J1" }]);
    verifier("un poste qui n'a rien chargé répond comme les autres",
             vide === complet && vide === false, `(vide ${vide}, complet ${complet})`);

    // Un héros à terre n'est plus attendu.
    const avecMort = { ...partie, Combattants_Hors_Jeu: ["J2"] };
    verifier("un combattant à terre sort des attendus",
             w.combattantsAttendus(avecMort).join(",") === "J1,J3,M1");
    verifier("les trois restants suffisent alors à déclencher la résolution",
             w.toutLeMondeAJoue(avecMort, [{ idPersonnage: "J1" }, { idPersonnage: "J3" },
                                           { idPersonnage: "M1" }]) === true);

    // La mémoire du round : la file se vide pendant la résolution, mais on
    // n'oublie pas qui a joué.
    const enResolution = { ...partie, Ont_Joue_Ce_Round: ["J1", "J2", "J3", "M1"] };
    verifier("une file vidée en résolution ne fait pas oublier les cartes posées",
             w.toutLeMondeAJoue(enResolution, []) === true);
    verifier("avecCarteJouee n'inscrit jamais deux fois le même",
             w.avecCarteJouee({ Ont_Joue_Ce_Round: ["J1"] }, "J1").join(",") === "J1");
}

// =========================================================================
console.log("\n2. UN HÉROS À ZÉRO POINT DE VIE N'EST PAS MARQUÉ « MORT »");
{
    const w = { PERSOS_PARTIE: [] };
    new Function('window', 'db', 'doc', 'runTransaction', SRC_HELPERS)(w, {}, () => ({}), async () => null);
    w.pvMaxCombattant = (p) => (parseInt(p.PV_Max) || 0) + (parseInt(p.Dev_Mod_PV) || 0);
    w.PERSOS_PARTIE = [
        { idPersonnage: "J1", PV_Max: 60, PV_Actuels: 0 },        // héros à terre : aucun "Statut"
        { idPersonnage: "M1", PV_Max: 40, PV_Actuels: 40, statut: "Mort" } // créature marquée
    ];

    // L'ANCIENNE RÈGLE, celle de combat.js, telle qu'elle était écrite.
    const ancienneRegle = (id) => {
        const p = w.PERSOS_PARTIE.find(x => x.idPersonnage === id);
        return !!(p && p.statut !== "Mort");
    };

    verifier("l'ancienne règle croyait ce héros encore en jeu",
             ancienneRegle("J1") === true, "(c'était le défaut)");
    verifier("la vraie règle le voit bien à terre",
             w.estCombattantMort("J1") === true);
    verifier("les deux règles divergeaient donc sur le même combattant",
             ancienneRegle("J1") !== !w.estCombattantMort("J1"));
    verifier("et sur la créature aussi, en sens inverse",
             ancienneRegle("M1") === false && w.estCombattantMort("M1") === true);
}

// =========================================================================
console.log("\n3. LA LISTE DES COMBATTANTS À TERRE CONVERGE");
const monde = creerMonde({ "Systeme_Parties/P1": {
    Ordre_Initiative: ["J1", "J2", "J3", "M1"],
    Combattants_Hors_Jeu: [], Ont_Joue_Ce_Round: [], File_Attente_Combat: []
} });

function creerPoste(nom, connus) {
    const w = { NOM_POSTE: nom, ID_PARTIE_COURANTE: "P1" };
    const api = monde.apiPour(nom);
    const db = {};
    new Function('window', 'db', 'doc', 'runTransaction', SRC_HELPERS)(w, db, api.doc, api.runTransaction);
    w.pvMaxCombattant = (p) => (parseInt(p.PV_Max) || 0) + (parseInt(p.Dev_Mod_PV) || 0);
    w.PERSOS_PARTIE = connus;
    api.onSnapshot(api.doc(db, "Systeme_Parties", "P1"), (d) => { if (d) w.PARTIE_DATA = d; });
    return w;
}

const vivant = (id) => ({ idPersonnage: id, PV_Max: 60, PV_Actuels: 60 });
const aTerre = (id) => ({ idPersonnage: id, PV_Max: 60, PV_Actuels: 0 });

{
    // Trois postes, trois visions : l'un n'a pas encore chargé J3, l'autre voit
    // déjà J2 tombé, le troisième non.
    const p1 = creerPoste("iPad-Nico", [vivant("J1"), aTerre("J2"), vivant("J3"), vivant("M1")]);
    const p2 = creerPoste("iPad-Ben",  [vivant("J1"), vivant("J2"), vivant("M1")]);   // J3 pas chargé
    const p3 = creerPoste("PC-Adrien", [vivant("J1"), vivant("J2"), vivant("J3"), vivant("M1")]);
    await monde.attendreLeReseau();

    await Promise.all([p1, p2, p3].map(w => w.synchroniserCombattantsHorsJeu()));
    await monde.attendreLeReseau();

    const liste = monde.docs["Systeme_Parties/P1"].Combattants_Hors_Jeu;
    verifier("seul le combattant réellement à terre y entre",
             liste.join(",") === "J2", `(${liste.join(",") || "vide"})`);
    verifier("un combattant que le poste n'a pas chargé n'est JAMAIS déclaré à terre",
             !liste.includes("J3"), `(${liste.join(",")})`);

    // Les trois postes relancent : aucune écriture de plus, la liste est juste.
    const avant = JSON.stringify(monde.docs["Systeme_Parties/P1"]);
    const changements = await Promise.all([p1, p2, p3].map(w => w.synchroniserCombattantsHorsJeu()));
    await monde.attendreLeReseau();
    verifier("rejouer la synchronisation n'écrit plus rien",
             changements.every(c => c === false)
             && JSON.stringify(monde.docs["Systeme_Parties/P1"]) === avant);

    // LA LISTE NE FAIT QUE GRANDIR. Un poste dont la fiche est en retard voit le
    // tombé encore debout : s'il pouvait le retirer, le poste d'à côté le
    // remettrait aussitôt — un va-et-vient d'écritures à chaque notification.
    p2.PERSOS_PARTIE = [vivant("J1"), vivant("J2"), vivant("M1")];   // Ben voit J2 debout
    const retire = await p2.synchroniserCombattantsHorsJeu();
    await monde.attendreLeReseau();
    verifier("un poste en retard ne peut PAS ressortir un combattant de la liste",
             retire === false
             && (monde.docs["Systeme_Parties/P1"].Combattants_Hors_Jeu || []).join(",") === "J2",
             `(${(monde.docs["Systeme_Parties/P1"].Combattants_Hors_Jeu || []).join(",")})`);

    // Seul retrait admis : le combattant a été effacé du combat. On passe par une
    // vraie écriture, sinon les postes ne reçoivent jamais le nouvel ordre.
    await p1.modifierPartie(() => ({ maj: { Ordre_Initiative: ["J1", "J3", "M1"] } }));
    await monde.attendreLeReseau();
    await p1.synchroniserCombattantsHorsJeu();
    await monde.attendreLeReseau();
    verifier("un combattant retiré de l'initiative sort bien de la liste",
             (monde.docs["Systeme_Parties/P1"].Combattants_Hors_Jeu || []).length === 0,
             `(${(monde.docs["Systeme_Parties/P1"].Combattants_Hors_Jeu || []).join(",")})`);
}

// =========================================================================
console.log("\n4. LE SCÉNARIO DE NICO, REJOUÉ");
{
    // Trois joueurs. Sur le poste de Ben, un combattant n'est pas encore chargé
    // — exactement la situation qui faisait basculer la phase trop tôt.
    const monde2 = creerMonde({ "Systeme_Parties/P1": {
        Ordre_Initiative: ["J1", "J2", "J3"],
        Combattants_Hors_Jeu: [], Ont_Joue_Ce_Round: [], File_Attente_Combat: [],
        Phase_Combat: "Preparation"
    } });

    const poste = (nom, connus) => {
        const w = { NOM_POSTE: nom, ID_PARTIE_COURANTE: "P1" };
        const api = monde2.apiPour(nom);
        new Function('window', 'db', 'doc', 'runTransaction', SRC_HELPERS)(w, {}, api.doc, api.runTransaction);
        w.pvMaxCombattant = (p) => (parseInt(p.PV_Max) || 0) + (parseInt(p.Dev_Mod_PV) || 0);
        w.PERSOS_PARTIE = connus;
        return w;
    };
    const nico = poste("Nico", [vivant("J1"), vivant("J2"), vivant("J3")]);
    const ben  = poste("Ben",  [vivant("J2")]);            // ne connaît que son héros

    // Ben joue sa carte le premier, avec sa vision incomplète.
    const jouer = async (w, id) => w.modifierPartie((data) => {
        const file = [...(data.File_Attente_Combat || []), { idPersonnage: id, idCarte: "C1", initiative: 50 }];
        const ontJoue = w.avecCarteJouee(data, id);
        let phase = data.Phase_Combat || "Preparation";
        if (w.toutLeMondeAJoue({ ...data, Ont_Joue_Ce_Round: ontJoue }, file)) phase = "Resolution";
        return { maj: { File_Attente_Combat: file, Phase_Combat: phase, Ont_Joue_Ce_Round: ontJoue } };
    });

    await jouer(ben, "J2");
    await monde2.attendreLeReseau();
    verifier("le poste qui ne connaît qu'un héros ne bascule PAS la phase",
             monde2.docs["Systeme_Parties/P1"].Phase_Combat === "Preparation",
             `(${monde2.docs["Systeme_Parties/P1"].Phase_Combat})`);

    await jouer(nico, "J1");
    await monde2.attendreLeReseau();
    verifier("deux joueurs sur trois : toujours en préparation",
             monde2.docs["Systeme_Parties/P1"].Phase_Combat === "Preparation",
             `(${monde2.docs["Systeme_Parties/P1"].Phase_Combat})`);

    await jouer(nico, "J3");
    await monde2.attendreLeReseau();
    verifier("le dernier venu déclenche la résolution, et lui seul",
             monde2.docs["Systeme_Parties/P1"].Phase_Combat === "Resolution",
             `(${monde2.docs["Systeme_Parties/P1"].Phase_Combat})`);
    verifier("les trois cartes sont dans la file",
             (monde2.docs["Systeme_Parties/P1"].File_Attente_Combat || []).length === 3);
    verifier("et les trois joueurs sont notés comme ayant joué",
             (monde2.docs["Systeme_Parties/P1"].Ont_Joue_Ce_Round || []).sort().join(",") === "J1,J2,J3");
}

// =========================================================================
console.log("\n5. LE FILET : UN JOUEUR QUI N'A PAS JOUÉ N'EST JAMAIS GRISÉ");
{
    // La règle d'affichage, reprise telle qu'elle est écrite dans combat.js.
    const src = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
    verifier("le grisage regarde qui a joué, pas seulement la phase",
             /phase === "Resolution" && aDejaJoue/.test(src));
    verifier("et lit cette information dans la partie partagée",
             /Ont_Joue_Ce_Round \|\| \[\]\)\.includes\(persoActuel\.idPersonnage\)/.test(src));

    const grise = (phase, ontJoue, moi) => {
        const aDejaJoue = (ontJoue || []).includes(moi);
        return phase === "Resolution" && aDejaJoue;
    };
    verifier("en résolution, celui qui a joué est bien grisé",
             grise("Resolution", ["J1"], "J1") === true);
    verifier("mais celui qui n'a jamais joué garde ses techniques vivantes",
             grise("Resolution", ["J1"], "J2") === false,
             "(c'est exactement le blocage vécu par Nico)");
    verifier("en préparation, personne n'est grisé",
             grise("Preparation", ["J1"], "J1") === false);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
