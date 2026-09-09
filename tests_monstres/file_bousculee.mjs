// LE TOUR SAUTÉ, ET LES DÉGÂTS EN DOUBLE — LA MÊME CAUSE.
//
// Ce banc est né d'une trace de console rapportée du vrai jeu :
//
//     [ 146.86s] P_03  🧠 verrou pris : tour de MONSTRE_04bndfv
//     [ 146.88s] P_03  🔚 fin de tour demandée pour MONSTRE_04bndfv (forcée)
//     POST …/documents:commit 400 (Bad Request)
//     RPC 'Commit' failed: {"code":"failed-precondition"}
//         → window.modifierPartie @ combat.js:202
//         → window.finDeTourCombat @ combat.js:3197
//
// L'ENCHAÎNEMENT, en clair :
//
//  1. Un document Firestore n'encaisse qu'une poignée d'écritures par seconde.
//     Le document de la partie est le plus sollicité du jeu — file d'initiative,
//     verrou de l'IA, Action_*, et jusqu'ici le compteur du journal, qui avance
//     à CHAQUE hexagone parcouru.
//  2. Une transaction qui se fait doubler par une écriture concurrente rend
//     « failed-precondition ». Un tour de créature étant calculé sans pauses,
//     tout part en même temps : c'est la transaction de fin de tour qui perd.
//  3. modifierPartie rendait alors `null` — exactement ce qu'elle rend quand il
//     n'y a RIEN À FAIRE. finDeTourCombat prenait donc l'échec pour un « un
//     autre poste s'en est chargé », et s'en allait. La file ne bougeait pas.
//  4. La créature restait en tête de file. La notification suivante rappelait
//     l'IA, le verrou répondait « oui, c'est toi qui l'as » — et la créature
//     rejouait son tour DU DÉBUT. Deuxième déplacement, DEUXIÈME COUP.
//
// Un seul bug, deux symptômes : « le tour d'un ennemi vient d'être complètement
// passé » et « les ennemis infligent deux fois les dégâts ». Ce banc pose les
// deux devant le vrai code.
import fs from 'fs';
import { SRC_MODIFIER_PARTIE } from './transaction_partie.mjs';

const lignesCombat = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8').split('\n');
const lignesIA = fs.readFileSync('/home/user/Ivalis/monstres_ia.js', 'utf-8').split('\n');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

// =========================================================================
//  UN FIRESTORE QUI SE FAIT BOUSCULER, COMME LE VRAI
// =========================================================================
//  Le vrai service refuse une transaction dont le document a changé entre la
//  lecture et l'écriture : « failed-precondition ». On le reproduit tel quel, et
//  on choisit combien de fois de suite ça arrive.
function firestoreDispute(docInitial, echecsDAffilee = 0) {
    const etat = { doc: structuredClone(docInitial), transactions: 0, restants: echecsDAffilee };
    const runTransaction = async (_db, fn) => {
        etat.transactions++;
        const sortie = await fn({
            get: async () => ({ exists: () => true, data: () => structuredClone(etat.doc) }),
            update: (_r, data) => { etat.enAttente = structuredClone(data); },
            set: (_r, data) => { etat.enAttente = structuredClone(data); }
        });
        if (etat.restants > 0) {
            etat.restants--;
            etat.enAttente = null;
            const e = new Error("Commit failed");
            e.code = "failed-precondition";
            e.name = "FirebaseError";
            throw e;
        }
        if (etat.enAttente) { Object.assign(etat.doc, etat.enAttente); etat.enAttente = null; }
        return sortie;
    };
    return { etat, runTransaction };
}

function poserModifier(w, runTransaction) {
    new Function('window', 'db', 'doc', 'runTransaction', SRC_MODIFIER_PARTIE)(
        w, {}, () => ({}), runTransaction);
}

// =========================================================================
console.log("\n1. UNE ÉCRITURE BOUSCULÉE N'EST PAS UN « RIEN À FAIRE »");
// =========================================================================
//  Le cœur de la correction. Les deux cas rendaient `null` ; ils sont
//  maintenant distincts, et c'est ce qui permet à la fin de tour de réagir.
{
    const { etat, runTransaction } = firestoreDispute({ File_Attente_Combat: [{ idPersonnage: "M1" }] }, 99);
    const w = { ID_PARTIE_COURANTE: "P1" };
    poserModifier(w, runTransaction);
    const cris = [];
    console.error = (...a) => cris.push(a.join(" "));

    const rate = await w.modifierPartieOuEchec(() => ({ maj: { Phase_Combat: "Resolution" } }));
    verifier("une écriture impossible se déclare en échec", rate.ok === false);
    verifier("et rien n'a été écrit", etat.doc.Phase_Combat === undefined);
    verifier("elle a été retentée plusieurs fois avant d'abandonner", etat.transactions >= 4,
             `(${etat.transactions} essais)`);
    verifier("et elle a crié dans la console", cris.length === 1);

    const { etat: e2, runTransaction: r2 } = firestoreDispute({ File_Attente_Combat: [] });
    const w2 = { ID_PARTIE_COURANTE: "P1" };
    poserModifier(w2, r2);
    const rien = await w2.modifierPartieOuEchec(() => null);
    verifier("« rien à faire », lui, reste une réussite", rien.ok === true && rien.resultat === null);
    verifier("et n'écrit rien non plus", Object.keys(e2.doc).length === 1);
}

// =========================================================================
console.log("\n2. UNE BOUSCULADE PASSAGÈRE NE COÛTE PLUS UN TOUR");
// =========================================================================
//  C'est le cas réel : deux ou trois écritures se marchent dessus pendant un
//  tour de créature, puis ça se calme. La transaction doit passer toute seule.
{
    const { etat, runTransaction } = firestoreDispute(
        { File_Attente_Combat: [{ idPersonnage: "M1" }, { idPersonnage: "H1" }] }, 2);
    const w = { ID_PARTIE_COURANTE: "P1" };
    poserModifier(w, runTransaction);
    const traces = [];
    w.tracerCombat = (i, q, d) => traces.push(`${i} ${q}`);
    console.error = () => {};

    const debut = Date.now();
    const sortie = await w.modifierPartieOuEchec((data) => {
        const file = (data.File_Attente_Combat || []).slice(1);
        return { maj: { File_Attente_Combat: file }, resultat: { file } };
    });
    const duree = Date.now() - debut;

    verifier("après deux bousculades, l'écriture finit par passer", sortie.ok === true);
    verifier("et la file a bien avancé",
             etat.doc.File_Attente_Combat.length === 1
             && etat.doc.File_Attente_Combat[0].idPersonnage === "H1",
             `(${JSON.stringify(etat.doc.File_Attente_Combat)})`);
    verifier("les reprises s'espacent au lieu de marteler", duree >= 300, `(${duree} ms)`);
    verifier("et la trace le dit, pour qu'on cesse de chercher à l'aveugle",
             traces.filter(t => t.startsWith("♻️")).length === 2, `(${traces.join(" | ")})`);
}

// =========================================================================
console.log("\n3. UN TOUR DE CRÉATURE NE SE REJOUE PAS");
// =========================================================================
//  Le verrou de l'IA répondait « oui » à qui le détenait déjà — pensé pour
//  reprendre un tour interrompu, mais jouerTourMonstre repart TOUJOURS du début.
//  « Reprendre », c'était donc frapper une deuxième fois.
{
    // On charge le vrai verrou, avec ses deux gardiens.
    const d = lignesIA.findIndex(l => l.startsWith('const DELAI_VERROU_MS'));
    let f = lignesIA.findIndex((l, i) => i > d && l.startsWith('async function reclamerVerrouIA'));
    for (let i = f; i < lignesIA.length; i++) { if (lignesIA[i] === '}') { f = i; break; } }
    const SRC_VERROU = lignesIA.slice(d, f + 1).join('\n')
        + '\nwindow.__reclamerVerrouIA = reclamerVerrouIA;'
        + '\nwindow.__marquerTourIATermine = marquerTourIATermine;';

    const { etat, runTransaction } = firestoreDispute({ Verrou_IA: null });
    const w = { ID_PARTIE_COURANTE: "P1" };
    const traces = [];
    w.tracerCombat = (i, q, d2) => traces.push(`${i} ${q}`);
    new Function('window', 'db', 'doc', 'runTransaction', SRC_VERROU)(w, {}, () => ({}), runTransaction);

    const cle = "tour|M1|1700000000";

    verifier("le premier appel prend le verrou", (await w.__reclamerVerrouIA(cle)) === true);
    // Le tour est joué : on le note, comme le fait verifierTourIAMonstres.
    w.__marquerTourIATermine(cle);

    // La file n'a pas avancé (l'écriture a été bousculée) : la créature est
    // toujours en tête, la notification suivante rappelle l'IA. C'est ICI que
    // le deuxième coup partait.
    const rejeu = await w.__reclamerVerrouIA(cle);
    verifier("le MÊME poste ne peut pas le reprendre pour rejouer", rejeu === false);
    verifier("et la trace explique pourquoi",
             traces.some(t => t.includes("tour déjà joué")), `(${traces.join(" | ")})`);

    // Trois notifications de suite : trois refus, pas trois tours.
    const reprises = [await w.__reclamerVerrouIA(cle), await w.__reclamerVerrouIA(cle),
                      await w.__reclamerVerrouIA(cle)];
    verifier("autant de notifications, autant de refus", reprises.every(r => r === false));

    // Le tour SUIVANT de la même créature, lui, a une autre clé : il doit passer.
    verifier("le tour suivant de la même créature, lui, se joue",
             (await w.__reclamerVerrouIA("tour|M1|1700000099")) === true);
    verifier("le verrou en base a bien suivi", etat.doc.Verrou_IA.cle === "tour|M1|1700000099");
}

// =========================================================================
console.log("\n4. LA FIN DE TOUR REVIENT À LA CHARGE AU LIEU DE S'EN ALLER");
// =========================================================================
//  Le comportement complet, tel que finDeTourCombat le pratique désormais : une
//  écriture ratée n'est pas un tour perdu, c'est un tour à refaire.
{
    // On rejoue la décision de finDeTourCombat sans traîner tout combat.js :
    // ce qu'on vérifie, c'est qu'un échec ne se confond plus avec un « déjà
    // fait », et que la file finit par avancer.
    const { etat, runTransaction } = firestoreDispute(
        { File_Attente_Combat: [{ idPersonnage: "M1" }, { idPersonnage: "H1" }] }, 99);
    const w = { ID_PARTIE_COURANTE: "P1" };
    poserModifier(w, runTransaction);
    const traces = [];
    w.tracerCombat = (i, q, d2) => traces.push(`${i} ${q} ${d2 || ""}`);
    console.error = () => {};

    const relances = {};
    async function finDeTour(attendu) {
        const tentative = await w.modifierPartieOuEchec((data) => {
            const file = data.File_Attente_Combat || [];
            if (file.length === 0) return null;
            if (file[0].idPersonnage !== attendu) return null;
            return { maj: { File_Attente_Combat: file.slice(1) }, resultat: { file: file.slice(1) } };
        });
        if (!tentative.ok) {
            relances[attendu] = (relances[attendu] || 0) + 1;
            w.tracerCombat("🔁", `la file n'a pas avancé pour ${attendu}`, "");
            return "à refaire";
        }
        return tentative.resultat ? "avancée" : "déjà fait";
    }

    const premier = await finDeTour("M1");
    verifier("l'écriture impossible n'est pas prise pour un « déjà fait »", premier === "à refaire",
             `(${premier})`);
    verifier("la file est restée exactement où elle était",
             etat.doc.File_Attente_Combat.length === 2);
    verifier("et le poste sait qu'il doit y revenir", relances.M1 === 1);
    verifier("la trace le crie", traces.some(t => t.startsWith("🔁")), `(${traces.join(" | ")})`);

    // Ça se calme : la reprise passe.
    etat.restants = 0;
    const second = await finDeTour("M1");
    verifier("à la reprise, la file avance enfin", second === "avancée", `(${second})`);
    verifier("et le suivant est bien en tête",
             etat.doc.File_Attente_Combat[0].idPersonnage === "H1");

    // Un troisième passage — un autre poste, un rappel en retard : la file ne
    // doit surtout pas avancer une seconde fois.
    const troisieme = await finDeTour("M1");
    verifier("un rappel en retard ne fait pas sauter le tour du suivant",
             troisieme === "déjà fait" && etat.doc.File_Attente_Combat.length === 1,
             `(${troisieme})`);
}

// =========================================================================
console.log("\n5. LE COMPTEUR DU JOURNAL A QUITTÉ LE DOCUMENT DE LA PARTIE");
// =========================================================================
//  La cause première. On la garde ici aussi, en lisant le code source : c'est
//  le genre de chose qu'on « simplifie » six mois plus tard sans savoir ce
//  qu'elle a coûté.
{
    const app = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8');
    // La réservation des numéros, seule : c'est elle qui tourne à chaque
    // hexagone parcouru, et elle ne doit toucher QUE le document du compteur.
    const reservation = app.slice(app.indexOf('async function reserverNumerosEvenements'),
                                  app.indexOf('window.publierEvenementCombat'));
    verifier("le compteur a son propre document",
             /refCompteurEvenements\s*=\s*\(idPartie\)\s*=>\s*doc\(db, COL\.PARTIES, idPartie, COL_JOURNAL/.test(app));
    verifier("réserver un numéro n'écrit que le document du compteur",
             /tx\.set\(ref,/.test(reservation) && !/COL\.PARTIES/.test(reservation),
             reservation.match(/.*COL\.PARTIES.*/)?.[0]?.trim() || "");
    verifier("l'ancien compteur n'est plus lu que comme plancher de reprise",
             /plancher/.test(reservation));
    verifier("et les numéros se réservent en un seul passage",
             /reserverNumerosEvenements\(idPartie, liste\.length\)/.test(app));
}

// =========================================================================
console.log("\n6. LE VERROU NE SE VOLE PLUS SUR UNE HORLOGE QUI MENT");
// =========================================================================
//  Deuxième trace de Nico : DEUX événements « carte » pour un seul tour de
//  créature, dont un publié par l'autre poste. Les deux appareils avaient donc
//  joué le même tour. Le verrou jugeait l'ancienneté avec « maintenant moins
//  l'heure inscrite dedans » — or cette heure vient de l'horloge de L'AUTRE
//  APPAREIL. Un iPad en avance sur le PC trouvait périmé un verrou posé à
//  l'instant, le volait, et calculait le tour en parallèle.
{
    const d = lignesIA.findIndex(l => l.startsWith('const DELAI_VERROU_MS'));
    let f = lignesIA.findIndex((l, i) => i > d && l.startsWith('async function reclamerVerrouIA'));
    for (let i = f; i < lignesIA.length; i++) { if (lignesIA[i] === '}') { f = i; break; } }
    const SRC_VERROU = lignesIA.slice(d, f + 1).join('\n')
        + '\nwindow.__reclamerVerrouIA = reclamerVerrouIA;';

    // Un seul Firestore, deux postes : c'est tout l'enjeu.
    const { etat, runTransaction } = firestoreDispute({ Verrou_IA: null });
    const pc = { ID_PARTIE_COURANTE: "P1" }, ipad = { ID_PARTIE_COURANTE: "P1" };
    new Function('window', 'db', 'doc', 'runTransaction', SRC_VERROU)(pc, {}, () => ({}), runTransaction);
    new Function('window', 'db', 'doc', 'runTransaction', SRC_VERROU)(ipad, {}, () => ({}), runTransaction);

    const cle = "tour|M1|1700000000";
    verifier("le PC prend le verrou", (await pc.__reclamerVerrouIA(cle)) === true);

    // L'iPad a une minute d'avance. Avec l'ancienne règle, il trouvait le verrou
    // vieux de soixante secondes — donc abandonné — et jouait le tour lui aussi.
    etat.doc.Verrou_IA.ts = Date.now() - 60000;
    verifier("l'iPad en avance d'une minute ne le vole PAS",
             (await ipad.__reclamerVerrouIA(cle)) === false,
             `(verrou à ${etat.doc.Verrou_IA.client})`);
    verifier("le verrou est toujours au PC", etat.doc.Verrou_IA.client !== undefined);

    // Et il ne le vole toujours pas au deuxième coup d'œil : ce qui compte,
    // c'est depuis combien de temps LUI le voit, pas l'heure qu'il est ailleurs.
    verifier("ni au deuxième coup d'œil", (await ipad.__reclamerVerrouIA(cle)) === false);
}

// =========================================================================
console.log("\n7. LE VERROU BOUSCULÉ EST RETENTÉ, PAS ABANDONNÉ");
// =========================================================================
//  La trace montre aussi un « failed-precondition » sur l'écriture de Verrou_IA
//  au moment précis où la file avançait : les deux écrivent le document de la
//  partie. Renoncer là, c'est une créature que personne ne joue.
{
    const d = lignesIA.findIndex(l => l.startsWith('const DELAI_VERROU_MS'));
    let f = lignesIA.findIndex((l, i) => i > d && l.startsWith('async function reclamerVerrouIA'));
    for (let i = f; i < lignesIA.length; i++) { if (lignesIA[i] === '}') { f = i; break; } }
    const SRC_VERROU = lignesIA.slice(d, f + 1).join('\n')
        + '\nwindow.__reclamerVerrouIA = reclamerVerrouIA;';

    const { etat, runTransaction } = firestoreDispute({ Verrou_IA: null }, 2);
    const w = { ID_PARTIE_COURANTE: "P1" };
    const traces = [];
    w.tracerCombat = (i, q) => traces.push(`${i} ${q}`);
    new Function('window', 'db', 'doc', 'runTransaction', SRC_VERROU)(w, {}, () => ({}), runTransaction);
    console.error = () => {};

    verifier("après deux bousculades, le verrou finit par être pris",
             (await w.__reclamerVerrouIA("tour|M1|1")) === true);
    verifier("et il est bien écrit en base", !!etat.doc.Verrou_IA);
    verifier("la trace montre les reprises", traces.filter(t => t.startsWith("♻️")).length === 2,
             `(${traces.join(" | ")})`);
}

// =========================================================================
console.log("\n8. LE MÊME TOUR PUBLIÉ DEUX FOIS NE SE JOUE QU'UNE");
// =========================================================================
//  La ceinture de sécurité, au cas où les deux corrections précédentes seraient
//  encore prises en défaut : le lecteur reconnaît deux événements qui racontent
//  exactement la même chose, signés par deux postes différents, et n'en rejoue
//  qu'un. Sans lui, la trace de Nico donnait « ▶️ 1 carte » puis « ▶️ 2 carte »
//  pour un seul coup de griffe.
{
    const SRC_SEQ = fs.readFileSync('/home/user/Ivalis/sequence_tour.js', 'utf-8');
    const w = {
        ID_PARTIE_COURANTE: "P1",
        PERSOS_PARTIE: [
            { idPersonnage: "H1", idJoueur: "PC", PV_Actuels: 42, Etats_Alteres: [] },
            { idPersonnage: "M1", estMonstre: true, PV_Actuels: 40, Etats_Alteres: [] }
        ],
        PARTIE_DATA: { Tour_Combat: 1, Phase_Combat: "Resolution",
                       File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "C1" }] },
        estMonstre: (id) => String(id).startsWith("M")
    };
    const jouees = [];
    w.filerAnimation = async (nom, fn) => { jouees.push(nom); if (fn) await fn(); };
    const traces = [];
    w.tracerCombat = (i, q, d2) => traces.push(`${i} ${q} ${d2 || ""}`);
    new Function('window', 'localStorage', SRC_SEQ)(w, { getItem: () => "PC" });

    // Le même coup, publié par les deux postes : mêmes acteur, manche, nature et
    // données (les dés sont dedans), auteurs différents.
    const coup = { attaques: [{ cibles: ["H1"], degats: 9 }] };
    const faire = (n, auteur) => ({ n, type: "carte", acteur: "M1", idCarte: "C1", tour: 1,
                                    data: coup, avant: {}, auteur });
    w.EVENEMENTS_RECUS = { 1: faire(1, "PC"), 2: faire(2, "iPad") };
    w.DERNIER_EVENEMENT_JOUE = 0;

    // Le tour d'une créature attend le OK : on le donne, puis on laisse lire.
    await w.lireJournalCombat();
    await w.jouerSequenceTour();                 // le OK doré
    await new Promise(r => setTimeout(r, 60));

    verifier("l'attaque n'est animée qu'une seule fois", jouees.length === 1,
             `(${jouees.length} animation(s) : ${jouees.join(",")})`);
    verifier("le curseur a quand même avancé jusqu'au bout",
             w.DERNIER_EVENEMENT_JOUE === 2, `(n°${w.DERNIER_EVENEMENT_JOUE})`);
    verifier("et la trace nomme le poste qui a publié le doublon",
             traces.some(t => t.startsWith("👯") && t.includes("PC")), `(${traces.join(" | ")})`);

    // Deux coups DIFFÉRENTS du même acteur dans la même manche, eux, se jouent
    // tous les deux : l'empreinte porte les données, pas seulement l'acteur.
    const autre = { attaques: [{ cibles: ["H1"], degats: 4 }] };
    w.EVENEMENTS_RECUS = { 3: { n: 3, type: "carte", acteur: "M1", idCarte: "C1", tour: 1,
                                data: autre, avant: {}, auteur: "iPad" } };
    await w.lireJournalCombat();
    await new Promise(r => setTimeout(r, 60));
    verifier("un coup réellement différent, lui, passe", jouees.length === 2,
             `(${jouees.length} animation(s))`);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
