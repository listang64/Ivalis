// LA PLOMBERIE DU JOURNAL, CONFRONTÉE AUX RÈGLES DE FIRESTORE.
//
// Ce banc existe à cause d'un bug que TOUS les autres bancs ont laissé passer :
// ils simulent le réseau avec des documents rangés dans une carte, et ne
// connaissent donc rien des règles de Firestore. Or Firestore REFUSE une
// requête qui filtre par égalité sur un champ et borne ou trie sur un AUTRE
// champ, tant qu'un index composite n'a pas été créé à la main dans la console.
// La première version du journal faisait exactement ça :
//
//     where("ID_Partie", "==", partie) + where("n", ">", curseur) + orderBy("n")
//
// L'écoute était refusée, l'erreur partait dans la console, et plus aucun
// événement n'était livré à personne : la fenêtre sombre annonçait un tour qui
// ne se jouait jamais, sans bouton, sans animation, et la file passait au
// combattant suivant. En jeu, ça ressemblait à un bug d'affichage ; c'était une
// requête refusée.
//
// On charge donc le VRAI code d'app.js et on lui présente un Firestore qui
// applique cette règle-là. Ce que ce banc garantit :
//   • le journal vit SOUS la partie, en sous-collection ;
//   • sa requête d'écoute ne demande aucun index composite ;
//   • les événements publiés arrivent bien à l'écoute ;
//   • et si le journal tombe malgré tout, les postes ne restent pas devant un
//     plateau figé : la fenêtre s'efface et les animations reprennent l'ancien
//     chemin.
import fs from 'fs';

const lignesApp = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8').split('\n');
const d = lignesApp.findIndex(l => l.startsWith('const COL_EVENEMENTS'));
let f = lignesApp.findIndex((l, i) => i > d && l.startsWith('window.dernierNumeroEvenement'));
for (let i = f; i < lignesApp.length; i++) { if (lignesApp[i] === '};') { f = i; break; } }
const SRC_JOURNAL = lignesApp.slice(d, f + 1).join('\n');
const SRC_SEQUENCE = fs.readFileSync('/home/user/Ivalis/sequence_tour.js', 'utf-8');

let echecs = 0;
const verifier = (l, c, d2 = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d2}`); };
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

// =========================================================================
//  UN FIRESTORE QUI DIT NON COMME LE VRAI
// =========================================================================
function firestoreExigeant(options = {}) {
    const base = {};                 // chemin -> document
    const ecoutes = [];              // { q, rappel }
    const requetes = [];             // toutes les requêtes construites

    const doc = (_db, ...seg) => ({ chemin: seg.join("/"), segments: seg });
    const collection = (_db, ...seg) => ({ chemin: seg.join("/"), segments: seg, estCollection: true });
    const where = (champ, op, valeur) => ({ type: "where", champ, op, valeur });
    const orderBy = (champ, sens) => ({ type: "orderBy", champ, sens });
    const query = (coll, ...contraintes) => {
        const q = { coll, contraintes };
        requetes.push(q);
        return q;
    };

    // LA RÈGLE DE FIRESTORE, en une phrase : dès qu'une requête filtre par
    // égalité sur un champ et borne (ou trie) sur un AUTRE champ, il lui faut un
    // index composite — qui n'existe que si quelqu'un l'a créé à la main.
    const exigeUnIndexComposite = (q) => {
        const egalites = q.contraintes.filter(c => c.type === "where" && c.op === "==").map(c => c.champ);
        const portees = q.contraintes
            .filter(c => (c.type === "where" && c.op !== "==") || c.type === "orderBy").map(c => c.champ);
        return egalites.some(e => portees.some(p => p !== e));
    };

    const documentsDe = (q) => Object.keys(base)
        .filter(chemin => {
            const prefixe = q.coll.chemin + "/";
            if (!chemin.startsWith(prefixe)) return false;
            return chemin.slice(prefixe.length).indexOf("/") === -1;   // fils direct
        })
        .map(chemin => base[chemin])
        .filter(data => q.contraintes.every(c => {
            if (c.type !== "where") return true;
            if (c.op === "==") return data[c.champ] === c.valeur;
            if (c.op === ">") return data[c.champ] > c.valeur;
            return true;
        }))
        .sort((a, b) => {
            const tri = q.contraintes.find(c => c.type === "orderBy");
            return tri ? a[tri.champ] - b[tri.champ] : 0;
        });

    const onSnapshot = (q, rappel, surErreur) => {
        if (options.toujoursEnPanne) {
            setTimeout(() => surErreur && surErreur(new Error("Missing or insufficient permissions.")), 0);
            return () => {};
        }
        if (exigeUnIndexComposite(q)) {
            // Le message exact de Firestore, pour que l'échec du banc parle.
            setTimeout(() => surErreur && surErreur(
                new Error("The query requires an index. You can create it here: https://console.firebase…")), 0);
            return () => {};
        }
        const ecoute = { q, rappel };
        ecoutes.push(ecoute);
        setTimeout(() => rappel({ docs: documentsDe(q).map(data => ({ data: () => data })) }), 0);
        return () => { const i = ecoutes.indexOf(ecoute); if (i >= 0) ecoutes.splice(i, 1); };
    };

    const notifier = () => ecoutes.forEach(e =>
        e.rappel({ docs: documentsDe(e.q).map(data => ({ data: () => data })) }));

    // LES ÉCRITURES, COMPTÉES PAR DOCUMENT. C'est ce qui permet de vérifier que
    // le compteur du journal ne martèle plus le document de la partie.
    const ecritures = {};
    const compter = (chemin) => { ecritures[chemin] = (ecritures[chemin] || 0) + 1; };

    const setDoc = async (ref, data) => {
        const copie = JSON.parse(JSON.stringify(data));
        Object.defineProperty(copie, "__id", { value: ref.chemin.split("/").pop(), enumerable: false });
        base[ref.chemin] = copie;
        compter(ref.chemin);
        notifier();
    };
    const getDoc = async (ref) => ({
        exists: () => !!base[ref.chemin],
        data: () => base[ref.chemin]
    });
    const runTransaction = async (_db, fn) => fn({
        get: async (ref) => ({ exists: () => !!base[ref.chemin], data: () => base[ref.chemin] }),
        update: (ref, maj) => { compter(ref.chemin); Object.assign(base[ref.chemin], maj); },
        // set, contrairement à update, crée le document s'il manque : c'est ce
        // dont le compteur du journal a besoin au tout premier événement.
        set: (ref, data) => { compter(ref.chemin); base[ref.chemin] = { ...data }; }
    });
    const updateDoc = async (ref, maj) => { compter(ref.chemin); Object.assign(base[ref.chemin] || (base[ref.chemin] = {}), maj); };
    const limit = (n) => ({ type: "limit", n });
    const getDocs = async (q) => {
        let docs = documentsDe(q).map(data => ({ ref: { chemin: q.coll.chemin + "/" + data.__id }, data: () => data }));
        const borne = q.contraintes.find(c => c.type === "limit");
        if (borne) docs = docs.slice(0, borne.n);
        return { docs, size: docs.length, empty: docs.length === 0 };
    };
    const writeBatch = () => {
        const gestes = [];
        return {
            delete: (ref) => gestes.push(() => { compter(ref.chemin); delete base[ref.chemin]; }),
            set: (ref, data) => gestes.push(() => {
                compter(ref.chemin);
                const copie = JSON.parse(JSON.stringify(data));
                Object.defineProperty(copie, "__id", { value: ref.chemin.split("/").pop(), enumerable: false });
                base[ref.chemin] = copie;
            }),
            commit: async () => { gestes.forEach(g => g()); notifier(); }
        };
    };

    return { base, requetes, ecritures, api: { doc, collection, where, orderBy, limit, query, onSnapshot,
                                    setDoc, getDoc, getDocs, updateDoc, writeBatch, runTransaction } };
}

function chargerJournal(monde) {
    const w = { PARTIE_DATA: {}, ID_PARTIE_COURANTE: "P1" };
    const a = monde.api;
    new Function('window', 'db', 'doc', 'collection', 'query', 'where', 'orderBy', 'limit',
                 'onSnapshot', 'setDoc', 'getDoc', 'getDocs', 'updateDoc', 'writeBatch',
                 'runTransaction', 'COL', SRC_JOURNAL)(
        w, {}, a.doc, a.collection, a.query, a.where, a.orderBy, a.limit,
        a.onSnapshot, a.setDoc, a.getDoc, a.getDocs, a.updateDoc, a.writeBatch,
        a.runTransaction, { PARTIES: "Systeme_Parties" });
    return w;
}

// =========================================================================
console.log("\n1. LE JOURNAL VIT SOUS LA PARTIE, ET SA REQUÊTE PASSE");
// =========================================================================
{
    const monde = firestoreExigeant();
    const w = chargerJournal(monde);
    monde.base["Systeme_Parties/P1"] = { Compteur_Evenements: 0 };

    const recus = [];
    let erreur = null;
    const arret = w.ecouterEvenementsCombat("P1", 0, (evs) => recus.push(...evs));
    console.error = (...a) => { erreur = a.join(" "); };   // on capte le cri d'app.js

    await w.publierEvenementCombat("P1", { type: "mouvement", acteur: "M1" });
    await w.publierEvenementCombat("P1", { type: "carte", acteur: "M1" });
    await dormir(20);

    const chemins = Object.keys(monde.base).filter(c => c.includes("Evenements"));
    verifier("les événements sont rangés sous la partie",
             chemins.every(c => c.startsWith("Systeme_Parties/P1/Evenements_Combat/")),
             `(${chemins.join(", ")})`);
    verifier("aucune requête ne réclame d'index composite",
             monde.requetes.length > 0 && !monde.requetes.some(q => {
                 const eg = q.contraintes.filter(c => c.type === "where" && c.op === "==").map(c => c.champ);
                 const po = q.contraintes.filter(c => (c.type === "where" && c.op !== "==") || c.type === "orderBy")
                                         .map(c => c.champ);
                 return eg.some(e => po.some(p => p !== e));
             }), `(${monde.requetes.length} requête(s))`);
    verifier("l'écoute n'a pas été refusée", erreur === null, `(${erreur})`);
    verifier("et les deux événements sont bien arrivés",
             recus.filter(e => e.n === 1).length >= 1 && recus.filter(e => e.n === 2).length >= 1,
             `(${recus.map(e => e.n + "/" + e.type).join(" ")})`);
    verifier("le journal n'est pas déclaré hors service", w.JOURNAL_INDISPONIBLE === false);
    arret();
}

// =========================================================================
console.log("\n2. LA REQUÊTE D'AVANT AURAIT ÉTÉ REFUSÉE (le bug, reconstitué)");
// =========================================================================
//  On rejoue à la main la requête de la première version, pour montrer que le
//  Firestore de ce banc la refuse — et donc que le contrôle du chapitre 1 a du
//  mordant.
{
    const monde = firestoreExigeant();
    const a = monde.api;
    let refusee = false;
    const q = a.query(a.collection({}, "Evenements_Combat"),
                      a.where("ID_Partie", "==", "P1"),
                      a.where("n", ">", 0),
                      a.orderBy("n", "asc"));
    a.onSnapshot(q, () => {}, (e) => { refusee = /requires an index/.test(e.message); });
    await dormir(10);
    verifier("filtrer sur un champ et trier sur un autre est bien refusé", refusee);
}

// =========================================================================
console.log("\n3. JOURNAL HORS SERVICE : LE COMBAT RESTE REGARDABLE");
// =========================================================================
//  Le pire n'est pas la panne, c'est ce qu'elle provoquait : les postes qui
//  regardent taisent les animations diffusées en comptant sur un numéro qui
//  n'arrive jamais. Plateau figé, fenêtre noire, aucun bouton.
{
    const monde = firestoreExigeant({ toujoursEnPanne: true });
    const w = chargerJournal(monde);
    monde.base["Systeme_Parties/P1"] = { Compteur_Evenements: 0 };
    console.error = () => {};

    // Le module de séquence, chargé dans le même poste.
    w.PERSOS_PARTIE = [
        { idPersonnage: "H1", idJoueur: "poste-pc", PV_Actuels: 60, Etats_Alteres: [] },
        { idPersonnage: "M1", estMonstre: true, PV_Actuels: 70, Etats_Alteres: [] }
    ];
    w.estMonstre = (id) => String(id).startsWith("M");
    w.PARTIE_DATA = { Tour_Combat: 1, Phase_Combat: "Resolution",
                      File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "CM1" }] };
    w.JOUEES = [];
    w.filerAnimation = async (nom, fn) => { w.JOUEES.push(nom); if (fn) await fn(); };
    new Function('window', 'localStorage', SRC_SEQUENCE)(
        w, { getItem: () => "poste-pc" });

    verifier("avant la panne, le spectateur tait les animations diffusées",
             (w.programmerAnimationTour("mouvement", { idToken: "M1" }, () => {}), w.JOUEES.length === 0));

    w.ecouterEvenementsCombat("P1", 0, () => {});
    await dormir(20);

    verifier("la panne est détectée", w.JOURNAL_INDISPONIBLE === true);
    verifier("la fenêtre sombre s'efface au lieu d'annoncer un tour fantôme",
             (w.etatSequenceTour() || {}).masquee === true,
             `(${JSON.stringify(w.etatSequenceTour())})`);
    w.programmerAnimationTour("mouvement", { idToken: "M1" }, () => {});
    verifier("et les animations reprennent l'ancien chemin", w.JOUEES.join(">") === "mouvement",
             `(${w.JOUEES.join(">")})`);
}

// =========================================================================
console.log("\n4. FINIR OU RÉINITIALISER UN COMBAT VIDE LE JOURNAL");
// =========================================================================
//  Un journal est l'histoire d'UN combat. S'il survit à la victoire ou à une
//  réinitialisation, la rencontre suivante démarre avec des centaines de
//  numéros derrière elle — et un poste qui rejoint rejoue une bataille qui
//  n'existe plus.
{
    const monde = firestoreExigeant();
    const w = chargerJournal(monde);
    monde.base["Systeme_Parties/P1"] = { Compteur_Evenements: 0 };
    console.error = () => {};

    for (let i = 0; i < 7; i++) await w.publierEvenementCombat("P1", { type: "pas", acteur: "M1" });
    w.DERNIER_EVENEMENT_JOUE = 7;
    w.EVENEMENTS_RECUS = { 8: { n: 8 } };
    let oubli = 0;
    w.oublierJournalCombat = () => { oubli++; };

    verifier("sept événements écrits, compteur à sept",
             Object.keys(monde.base).filter(c => c.includes("Evenements_Combat")).length === 7
             && monde.base["Systeme_Parties/P1/Journal_Combat/compteur"].n === 7);

    const effaces = await w.viderJournalCombat("P1");

    verifier("le ménage efface tous les documents", effaces === 7
             && Object.keys(monde.base).filter(c => c.includes("Evenements_Combat")).length === 0,
             `(${effaces} effacé(s))`);
    verifier("et remet le compteur à zéro dans la foulée",
             monde.base["Systeme_Parties/P1/Journal_Combat/compteur"].n === 0);
    verifier("le poste repart lui aussi de zéro, sans attendre la base",
             w.DERNIER_EVENEMENT_JOUE === 0 && Object.keys(w.EVENEMENTS_RECUS).length === 0);
    verifier("et le lecteur est prévenu qu'il doit tout oublier", oubli === 1);

    // Deux postes détectent la victoire au même instant : le second ne doit
    // pas s'étrangler sur un journal déjà vide.
    const encore = await w.viderJournalCombat("P1");
    verifier("un second ménage sur un journal déjà vide ne casse rien", encore === 0);
}

// =========================================================================
console.log("\n5. LE COMPTEUR NE TOUCHE PLUS AU DOCUMENT DE LA PARTIE");
// =========================================================================
//  LE BUG, en une phrase : un document Firestore n'encaisse qu'une poignée
//  d'écritures par seconde, et une transaction qui se fait doubler rend
//  « failed-precondition ». Le compteur du journal vivait DANS le document de la
//  partie — celui-là même où la file d'initiative avance. Un tour de créature se
//  calcule sans pauses : une dizaine d'écritures sur ce seul document en
//  quelques millisecondes, et c'est la transaction de fin de tour qui perdait.
//  La file restait bloquée, le tour de l'ennemi était « passé », et l'IA
//  reprenait le même tour du début — les dégâts comptés deux fois.
{
    const monde = firestoreExigeant();
    const w = chargerJournal(monde);
    monde.base["Systeme_Parties/P1"] = { Compteur_Evenements: 0, File_Attente_Combat: [] };
    console.error = () => {};

    const avant = monde.ecritures["Systeme_Parties/P1"] || 0;

    // Un trajet de six cases, puis une carte : ce que fait une créature en un
    // tour, exactement comme mouvement.js et moteur_effets.js le publient.
    await w.publierEvenementsCombat("P1", Array.from({ length: 6 },
        (_, i) => ({ type: "pas", acteur: "M1", data: { i } })));
    await w.publierEvenementCombat("P1", { type: "carte", acteur: "M1" });

    const apres = monde.ecritures["Systeme_Parties/P1"] || 0;
    verifier("publier tout un tour n'écrit RIEN dans la partie", apres === avant,
             `(${apres - avant} écriture(s))`);
    verifier("le compteur a bien son document à lui",
             monde.base["Systeme_Parties/P1/Journal_Combat/compteur"].n === 7,
             `(${JSON.stringify(monde.base["Systeme_Parties/P1/Journal_Combat/compteur"])})`);
    verifier("et les sept numéros se suivent sans trou",
             [1,2,3,4,5,6,7].every(n => !!monde.base["Systeme_Parties/P1/Evenements_Combat/"
                                                     + String(n).padStart(6, "0")]));

    // Le compteur ne doit pas se retrouver dans les résultats du journal : il
    // n'a pas de champ n... mais il en a un ! Il vit donc dans une AUTRE
    // collection, et c'est ce qu'on vérifie ici.
    const q = monde.api.query(monde.api.collection({}, "Systeme_Parties", "P1", "Evenements_Combat"),
                              monde.api.where("n", ">", 0), monde.api.orderBy("n", "asc"));
    const trouves = await monde.api.getDocs(q);
    verifier("le compteur ne traîne pas parmi les événements", trouves.size === 7,
             `(${trouves.size} document(s))`);

    // Un poste qui rejoint le combat place son curseur sur le dernier numéro :
    // il ne rejoue pas les sept événements déjà passés.
    const curseur = await w.dernierNumeroEvenement({});
    verifier("un poste qui rejoint place son curseur au bon endroit", curseur === 7, `(${curseur})`);
}

// =========================================================================
console.log("\n6. UNE PARTIE COMMENCÉE AVANT LE CHANGEMENT NE REPART PAS DE ZÉRO");
// =========================================================================
//  Nico a des combats en cours. Leur compteur est encore dans la partie, et le
//  document du journal n'existe pas. Le curseur doit quand même tomber juste,
//  sinon le premier écran rechargé rejoue toute la bataille depuis le début.
{
    const monde = firestoreExigeant();
    const w = chargerJournal(monde);
    monde.base["Systeme_Parties/P1"] = { Compteur_Evenements: 42 };
    w.PARTIE_DATA = { Compteur_Evenements: 42 };
    console.error = () => {};

    const curseur = await w.dernierNumeroEvenement({ Compteur_Evenements: 42 });
    verifier("sans document de compteur, on retombe sur l'ancien champ", curseur === 42, `(${curseur})`);

    // Et le premier événement publié REPREND LA SUITE : repartir de 1 écraserait
    // les quarante-deux événements déjà écrits, et les postes dont le curseur est
    // à 42 ne verraient plus jamais rien passer.
    const n = await w.publierEvenementCombat("P1", { type: "carte", acteur: "M1" });
    verifier("le nouveau compteur reprend à quarante-trois", n === 43, `(n=${n})`);
    const suite = await w.publierEvenementsCombat("P1", [{ type: "pas" }, { type: "pas" }]);
    verifier("et la suite s'enchaîne sans trou", suite.join(",") === "44,45", `(${suite.join(",")})`);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
