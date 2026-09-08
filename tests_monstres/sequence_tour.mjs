// LE JOURNAL D'ÉVÉNEMENTS DU COMBAT.
//
// Le vrai sequence_tour.js est chargé tel quel dans TROIS postes distincts qui
// partagent une seule partie et un seul journal. Ce que ce banc garantit :
//   • le poste qui joue publie des événements NUMÉROTÉS, dans l'ordre ;
//   • les autres ne jouent rien pendant ce temps, puis rejouent le journal
//     numéro par numéro, chacun attendant que le précédent ait fini ;
//   • un numéro qui manque n'est jamais sauté : on l'attend, puis on va le
//     chercher ;
//   • un poste endormi rattrape tout son retard, dans l'ordre ;
//   • les points de vie d'avant voyagent dans l'événement, si bien qu'une
//     relecture tardive ne retranche pas les dégâts une seconde fois ;
//   • le poste qui joue son propre héros ne se rejoue pas ce qu'il a vu ;
//   • un poste qui rejoint un combat en cours ne rejoue pas tout depuis le
//     début.
import fs from 'fs';

const SRC = fs.readFileSync('/home/user/Ivalis/sequence_tour.js', 'utf-8');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

// =========================================================================
//  LA TABLE : une partie, un journal, trois postes autour
// =========================================================================
function table(options = {}) {
    const heros = options.heros || [
        { idPersonnage: "H1", prenom: "Pliors", idJoueur: "poste-pc",    PV_Actuels: 60, Etats_Alteres: [] },
        { idPersonnage: "H2", prenom: "Jade",   idJoueur: "poste-ipadA", PV_Actuels: 60, Etats_Alteres: [] },
        { idPersonnage: "H3", prenom: "Elior",  idJoueur: "poste-ipadB", PV_Actuels: 60, Etats_Alteres: [] }
    ];
    const monstres = [{ idPersonnage: "M1", prenom: "Goule", estMonstre: true, PV_Actuels: 70, Etats_Alteres: [] }];

    const partie = {
        Tour_Combat: 1,
        Phase_Combat: "Resolution",
        Compteur_Evenements: options.compteur || 0,
        File_Attente_Combat: options.file || [{ idPersonnage: "M1", idCarte: "CARTE_M", initiative: 55, timestamp: 1000 }]
    };
    const journal = {};                 // n -> événement
    const postes = {};
    const livraisons = [];              // { poste, n } en attente de livraison

    (options.postes || ["poste-pc", "poste-ipadA", "poste-ipadB"]).forEach(id => {
        const w = { PARTIE_DATA: clone(partie), ID_PARTIE_COURANTE: "P1" };
        const faussLocalStorage = { getItem: (c) => (c === "ID_JOUEUR_COURANT" ? id : null) };

        w.PERSOS_PARTIE = clone(heros).concat(clone(monstres));
        w.estMonstre = (idp) => String(idp).startsWith("M");
        w.estCombattantMort = () => false;
        w.jouerSonClic = () => {};
        w.rafraichirVoileTour = () => { w.PEINTURES = (w.PEINTURES || 0) + 1; };

        w.JOUEES = [];
        w.filerAnimation = async (nom, fn) => { w.JOUEES.push(nom); if (fn) await fn(); };

        // La plomberie du journal, telle qu'app.js l'expose.
        w.publierEvenementCombat = async (idPartie, ev) => {
            const n = ++partie.Compteur_Evenements;
            journal[n] = { ...clone(ev), ID_Partie: idPartie, n, horodatage: Date.now() };
            // La livraison n'est pas instantanée, et pas forcément dans l'ordre.
            Object.keys(postes).forEach(p => livraisons.push({ poste: p, n }));
            return n;
        };
        w.lireEvenementCombat = async (idPartie, n) => (journal[n] ? clone(journal[n]) : null);
        w.dernierNumeroEvenement = (p) => parseInt((p || {}).Compteur_Evenements) || 0;
        w.ecouterEvenementsCombat = (idPartie, apres, rappel) => { w.RAPPEL_JOURNAL = rappel; return () => { w.RAPPEL_JOURNAL = null; }; };

        new Function('window', 'localStorage', SRC)(w, faussLocalStorage);
        // Le temps de respiration entre deux animations est réduit au minimum :
        // le banc vérifie l'ORDRE, pas la durée du spectacle.
        w.DELAI_ENTRE_ETAPES_MS = 1;
        postes[id] = w;
    });

    // Livre les événements en attente. « melange » les délivre à l'envers, pour
    // vérifier qu'un poste ne saute jamais un numéro manquant.
    async function livrer(options2 = {}) {
        const aLivrer = livraisons.splice(0, livraisons.length)
            .filter(l => !options2.sauf || !options2.sauf.includes(l.poste));
        if (options2.melange) aLivrer.reverse();
        for (const l of aLivrer) {
            const w = postes[l.poste];
            if (!w || !w.RAPPEL_JOURNAL) continue;
            w.PARTIE_DATA = clone(partie);
            await w.RAPPEL_JOURNAL([clone(journal[l.n])]);
        }
        // Les relectures sont des promesses : on leur laisse le temps.
        for (let i = 0; i < 60; i++) await dormir(2);
    }

    async function reveiller(id) {
        // Le poste rattrape tout ce qu'il a manqué, d'un coup, comme Firestore
        // le ferait au retour au premier plan.
        const w = postes[id];
        w.PARTIE_DATA = clone(partie);
        const tout = Object.keys(journal).map(Number).sort((a, b) => a - b)
            .filter(n => n > w.DERNIER_EVENEMENT_JOUE).map(n => clone(journal[n]));
        if (w.RAPPEL_JOURNAL) await w.RAPPEL_JOURNAL(tout);
        for (let i = 0; i < 60; i++) await dormir(2);
    }

    async function brancher() {
        for (const id of Object.keys(postes)) {
            postes[id].PARTIE_DATA = clone(partie);
            await postes[id].suivreSequenceTour(postes[id].PARTIE_DATA);
        }
    }

    return { partie, journal, postes, livrer, reveiller, brancher, livraisons };
}

// =========================================================================
console.log("\n1. UN TOUR DE CRÉATURE : PUBLIÉ PAR UN, REJOUÉ PAR TOUS DANS L'ORDRE");
// =========================================================================
{
    const t = table();
    await t.brancher();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"], B = t.postes["poste-ipadB"];

    verifier("la fenêtre est là chez les trois (une créature n'est à personne)",
             pc.SEQUENCE_TOUR.voile && A.SEQUENCE_TOUR.voile && B.SEQUENCE_TOUR.voile);

    // Le PC tient le verrou de l'IA : il calcule et publie.
    pc.IA_MONSTRE_ACTEUR = "M1";
    verifier("il se sait celui qui fait jouer la créature", pc.jeJoueCeTour() === true);
    verifier("mais son plateau reste sous la fenêtre : ce n'est pas SON héros",
             pc.monHerosJoue() === false);

    await pc.consignerEtapeTour("mouvement", { idToken: "M1", path: [{ q: 1, r: 0 }] });
    await pc.consignerEtapeTour("carte", { idLanceur: "M1", attaques: [{ cibles: ["H1"] }] });

    verifier("le journal porte deux événements numérotés 1 et 2",
             !!t.journal[1] && !!t.journal[2] && t.journal[1].type === "mouvement" && t.journal[2].type === "carte");
    verifier("chacun emporte les points de vie d'avant de ce qu'il touche",
             t.journal[2].avant.H1.PV_Actuels === 60, `(${JSON.stringify(t.journal[2].avant)})`);
    verifier("avant livraison, personne n'a rien joué",
             pc.JOUEES.length === 0 && A.JOUEES.length === 0 && B.JOUEES.length === 0);

    await t.livrer();
    verifier("les trois rejouent les deux événements, dans l'ordre",
             pc.JOUEES.join(">") === "mouvement>carte"
             && A.JOUEES.join(">") === "mouvement>carte"
             && B.JOUEES.join(">") === "mouvement>carte",
             `(${pc.JOUEES.join(">")} / ${A.JOUEES.join(">")} / ${B.JOUEES.join(">")})`);
    verifier("les trois curseurs sont au même numéro",
             pc.DERNIER_EVENEMENT_JOUE === 2 && A.DERNIER_EVENEMENT_JOUE === 2 && B.DERNIER_EVENEMENT_JOUE === 2);
    verifier("les pions retrouvent la case de la base",
             Object.keys(A.PIONS_EN_ATTENTE_SEQUENCE).length === 0);
}

// =========================================================================
console.log("\n2. UN NUMÉRO QUI MANQUE N'EST JAMAIS SAUTÉ");
// =========================================================================
{
    const t = table();
    await t.brancher();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"];
    pc.IA_MONSTRE_ACTEUR = "M1";

    await pc.consignerEtapeTour("mouvement", { idToken: "M1" });
    await pc.consignerEtapeTour("carte", { idLanceur: "M1" });

    // On livre à l'ENVERS : le 2 arrive avant le 1.
    await t.livrer({ melange: true });

    verifier("le 2 arrivé le premier n'a pas été joué avant le 1",
             A.JOUEES.join(">") === "mouvement>carte", `(${A.JOUEES.join(">")})`);
    verifier("et le curseur est bien à 2", A.DERNIER_EVENEMENT_JOUE === 2);
}

// =========================================================================
console.log("\n3. LE TROU SE RATTRAPE PAR UNE LECTURE DIRECTE");
// =========================================================================
//  L'écriture du 1 n'atteint jamais l'iPad. Il reçoit le 2 et comprend qu'il
//  lui manque quelque chose : il va le chercher plutôt que de l'oublier.
{
    const t = table();
    await t.brancher();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"];
    pc.IA_MONSTRE_ACTEUR = "M1";

    await pc.consignerEtapeTour("mouvement", { idToken: "M1" });
    // On jette la livraison du 1 vers l'iPad A.
    const perdue = t.livraisons.findIndex(l => l.poste === "poste-ipadA" && l.n === 1);
    t.livraisons.splice(perdue, 1);
    await pc.consignerEtapeTour("carte", { idLanceur: "M1" });

    await t.livrer();
    verifier("il attend d'abord le numéro manquant", A.JOUEES.length === 0, `(${A.JOUEES.join(">")})`);

    // Passé le court délai d'attente, il va le lire lui-même.
    await dormir(900);
    await A.lireJournalCombat();
    for (let i = 0; i < 60; i++) await dormir(2);

    verifier("puis il le récupère et rejoue les deux dans l'ordre",
             A.JOUEES.join(">") === "mouvement>carte", `(${A.JOUEES.join(">")})`);
}

// =========================================================================
console.log("\n4. UN POSTE ENDORMI RATTRAPE TOUT SON RETARD");
// =========================================================================
{
    const t = table();
    await t.brancher();
    const pc = t.postes["poste-pc"], B = t.postes["poste-ipadB"];
    pc.IA_MONSTRE_ACTEUR = "M1";

    for (const type of ["mouvement", "carte", "poussee", "peur"]) {
        await pc.consignerEtapeTour(type, { idToken: "M1" });
    }
    // L'iPad B dormait : il ne reçoit rien.
    await t.livrer({ sauf: ["poste-ipadB"] });
    verifier("pendant son sommeil, il n'a rien joué", B.JOUEES.length === 0);
    verifier("les autres, eux, sont à jour", pc.DERNIER_EVENEMENT_JOUE === 4);

    await t.reveiller("poste-ipadB");
    verifier("au réveil, il rejoue les quatre dans l'ordre",
             B.JOUEES.join(">") === "mouvement>carte>poussee>peur", `(${B.JOUEES.join(">")})`);
    verifier("et rejoint les autres au même numéro", B.DERNIER_EVENEMENT_JOUE === 4);
}

// =========================================================================
console.log("\n5. LA RELECTURE NE FRAPPE PAS DEUX FOIS");
// =========================================================================
{
    const t = table();
    await t.brancher();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"];
    pc.IA_MONSTRE_ACTEUR = "M1";

    // Le moteur, en miniature : il retranche 6 points à son point de départ.
    Object.values(t.postes).forEach(w => {
        w.jouerAnimationMoteur = () => {
            const cible = w.PERSOS_PARTIE.find(p => p.idPersonnage === "H1");
            const depart = w.valeurAvantRejeu("H1", "PV_Actuels", cible.PV_Actuels);
            cible.PV_Actuels = Math.max(0, depart - 6);
        };
    });

    await pc.consignerEtapeTour("carte", { idLanceur: "M1", attaques: [{ cibles: ["H1"] }] });
    // La base livre à l'iPad les points de vie D'APRÈS avant qu'il ne rejoue,
    // et une brûlure qui n'a rien à voir avec ce tour-ci.
    const h1 = A.PERSOS_PARTIE.find(p => p.idPersonnage === "H1");
    h1.PV_Actuels = 54;
    h1.Etats_Alteres = [{ nom: "Brûlé", duree: 2 }];

    await t.livrer();
    verifier("le spectateur retombe sur les mêmes points de vie que l'auteur",
             h1.PV_Actuels === 54, `(attendu 54, obtenu ${h1.PV_Actuels})`);
    verifier("l'état livré entre-temps n'a pas été effacé", (h1.Etats_Alteres || []).length === 1);
    verifier("et le moteur n'a rien réécrit en base pendant la relecture",
             A.REJEU_SCRIPT_EN_COURS === false);
}

// =========================================================================
console.log("\n6. LE TOUR D'UN JOUEUR : LUI VOIT TOUT EN DIRECT, LES AUTRES LE REJOUENT");
// =========================================================================
{
    const t = table({ file: [{ idPersonnage: "H1", idCarte: "CARTE_H", initiative: 70, timestamp: 1100 }] });
    await t.brancher();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"];

    verifier("le joueur dont c'est le tour garde son plateau dégagé", pc.monHerosJoue() === true);
    verifier("les autres ont la fenêtre sombre", A.SEQUENCE_TOUR.voile === true);

    // Son déplacement lui est joué en direct par l'ancien circuit ; aux autres non.
    pc.programmerAnimationTour("mouvement", { idToken: "H1" }, () => {});
    A.programmerAnimationTour("mouvement", { idToken: "H1" }, () => {});
    verifier("lui voit son déplacement tout de suite", pc.JOUEES.join(">") === "mouvement");
    verifier("l'autre ne voit rien passer derrière sa fenêtre", A.JOUEES.length === 0);
    verifier("et son pion garde sa case en attendant le journal",
             A.PIONS_EN_ATTENTE_SEQUENCE.H1 === true);

    await pc.consignerEtapeTour("mouvement", { idToken: "H1", path: [{ q: 0, r: 0 }] });
    await t.livrer();

    verifier("le joueur ne se rejoue pas ce qu'il vient de voir",
             pc.JOUEES.join(">") === "mouvement", `(${pc.JOUEES.join(">")})`);
    verifier("mais son curseur avance quand même", pc.DERNIER_EVENEMENT_JOUE === 1);
    verifier("l'autre, lui, le rejoue", A.JOUEES.join(">") === "mouvement");
}

// =========================================================================
console.log("\n7. REJOINDRE UN COMBAT EN COURS NE REJOUE PAS TOUT LE PASSÉ");
// =========================================================================
{
    const t = table({ compteur: 152 });
    await t.brancher();
    const A = t.postes["poste-ipadA"];
    verifier("le curseur se pose sur le dernier numéro écrit", A.DERNIER_EVENEMENT_JOUE === 152);

    t.postes["poste-pc"].IA_MONSTRE_ACTEUR = "M1";
    await t.postes["poste-pc"].consignerEtapeTour("carte", { idLanceur: "M1" });
    await t.livrer();
    verifier("et seul l'événement 153 est rejoué",
             A.JOUEES.join(">") === "carte" && A.DERNIER_EVENEMENT_JOUE === 153,
             `(${A.JOUEES.join(">")}, curseur ${A.DERNIER_EVENEMENT_JOUE})`);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
