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
//     début ;
//   • chaque tour s'ouvre par un OK LOCAL : la fenêtre annonce le combattant
//     et sa technique, rien ne bouge avant le toucher, et personne n'attend
//     que les autres postes aient touché le leur.
import fs from 'fs';

const SRC = fs.readFileSync('/home/user/Ivalis/sequence_tour.js', 'utf-8');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

// LA BASE PARLE. Dans le vrai jeu, chaque notification Firestore passe par
// persoDocVersFront, qui remplace la fiche du combattant ET note sa dernière
// parole dans VERITE_BASE. On fait ici les deux, à l'identique.
const CHAMPS_VERITE = ["PV_Actuels", "Bouclier_Actuel", "fatigueActuelle", "Etats_Alteres", "statut"];
function laBaseDit(w, idCombattant, champs) {
    const perso = w.PERSOS_PARTIE.find(p => p.idPersonnage === idCombattant);
    if (!perso) return;
    Object.keys(champs).forEach(c => { perso[c] = champs[c]; });
    w.VERITE_BASE = w.VERITE_BASE || {};
    const verite = {};
    CHAMPS_VERITE.forEach(c => { if (perso[c] !== undefined) verite[c] = clone(perso[c]); });
    w.VERITE_BASE[idCombattant] = verite;
}

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
        w.PERSOS_PARTIE.forEach(p => laBaseDit(w, p.idPersonnage, {}));
        // Le temps de respiration entre deux animations est réduit au minimum :
        // le banc vérifie l'ORDRE, pas la durée du spectacle.
        w.DELAI_ENTRE_ETAPES_MS = 1;
        postes[id] = w;
    });

    // Les relectures sont des promesses : on leur laisse le temps.
    const respirer = async () => { for (let i = 0; i < 60; i++) await dormir(2); };

    // LE DOIGT DU JOUEUR. Un tour qui s'ouvre reste en pose derrière son OK ;
    // ici on touche l'écran de chaque poste tant qu'il y a un tour à ouvrir.
    // « sansOk » laisse au contraire les fenêtres ouvertes, pour les vérifier.
    async function toucher(sauf) {
        for (let garde = 0; garde < 8; garde++) {
            let unClic = false;
            for (const id of Object.keys(postes)) {
                if (sauf && sauf.includes(id)) continue;
                if (postes[id].EVENEMENT_ATTENDU) { unClic = true; await postes[id].jouerSequenceTour(); }
            }
            if (!unClic) return;
            await respirer();
        }
    }

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
        await respirer();
        if (!options2.sansOk) { await toucher(options2.sauf); await respirer(); }
    }

    async function reveiller(id, options2 = {}) {
        // Le poste rattrape tout ce qu'il a manqué, d'un coup, comme Firestore
        // le ferait au retour au premier plan.
        const w = postes[id];
        w.PARTIE_DATA = clone(partie);
        const tout = Object.keys(journal).map(Number).sort((a, b) => a - b)
            .filter(n => n > w.DERNIER_EVENEMENT_JOUE).map(n => clone(journal[n]));
        if (w.RAPPEL_JOURNAL) await w.RAPPEL_JOURNAL(tout);
        await respirer();
        if (!options2.sansOk) { await toucher(Object.keys(postes).filter(p => p !== id)); await respirer(); }
    }

    async function brancher() {
        for (const id of Object.keys(postes)) {
            postes[id].PARTIE_DATA = clone(partie);
            await postes[id].suivreSequenceTour(postes[id].PARTIE_DATA);
        }
    }

    return { partie, journal, postes, livrer, reveiller, brancher, toucher, respirer, livraisons };
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
    await t.respirer();
    await t.toucher(["poste-pc", "poste-ipadB"]);
    await t.respirer();

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
    laBaseDit(A, "H1", { PV_Actuels: 54, Etats_Alteres: [{ nom: "Brûlé", duree: 2 }] });

    await t.livrer();
    const h1 = A.PERSOS_PARTIE.find(p => p.idPersonnage === "H1");
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

    await pc.consignerEtapeTour("mouvement", { idToken: "H1", path: [{ q: 0, r: 0 }] });
    // Le pion est retenu par l'ÉVÉNEMENT reçu et pas encore rejoué — la liste
    // se déduit du journal, elle ne se tient pas à la main.
    await t.livrer({ sansOk: true });
    verifier("son pion garde sa case tant que l'événement n'est pas rejoué",
             A.PIONS_EN_ATTENTE_SEQUENCE.H1 === true,
             `(${JSON.stringify(A.PIONS_EN_ATTENTE_SEQUENCE)})`);
    await t.toucher();
    await t.respirer();
    verifier("et il retrouve la case de la base une fois le trajet rejoué",
             A.PIONS_EN_ATTENTE_SEQUENCE.H1 === undefined,
             `(${JSON.stringify(A.PIONS_EN_ATTENTE_SEQUENCE)})`);

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

// =========================================================================
console.log("\n8. CHAQUE TOUR S'OUVRE PAR UN OK, ET IL EST PUREMENT LOCAL");
// =========================================================================
//  Le joueur doit avoir le temps de LIRE la technique avant de la voir se
//  dérouler. La fenêtre annonce le combattant et sa carte, le OK clignote, et
//  rien ne bouge avant le toucher. Mais ce toucher n'engage que cet écran-là :
//  aucun poste n'attend le doigt d'un autre.
{
    const t = table();
    await t.brancher();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"], B = t.postes["poste-ipadB"];
    pc.IA_MONSTRE_ACTEUR = "M1";

    await pc.consignerEtapeTour("mouvement", { idToken: "M1" });
    await pc.consignerEtapeTour("carte", { idLanceur: "M1" });
    await t.livrer({ sansOk: true });

    verifier("le tour reste en pose : rien n'a été joué nulle part",
             pc.JOUEES.length === 0 && A.JOUEES.length === 0 && B.JOUEES.length === 0,
             `(${A.JOUEES.join(">")})`);
    verifier("le premier événement du tour est retenu, pas consommé",
             A.EVENEMENT_ATTENDU && A.EVENEMENT_ATTENDU.n === 1 && A.DERNIER_EVENEMENT_JOUE === 0);
    verifier("le OK doré est demandé sur les trois écrans",
             pc.etatSequenceTour().okVisible && A.etatSequenceTour().okVisible && B.etatSequenceTour().okVisible);
    verifier("et la fenêtre annonce le combattant et sa technique",
             A.SEQUENCE_TOUR.acteur === "M1" && A.SEQUENCE_TOUR.idCarte === "CARTE_M" && A.SEQUENCE_TOUR.voile === true);

    // UN SEUL poste touche son écran.
    await A.jouerSequenceTour();
    await t.respirer();
    verifier("celui qui a touché déroule tout son tour",
             A.JOUEES.join(">") === "mouvement>carte" && A.DERNIER_EVENEMENT_JOUE === 2,
             `(${A.JOUEES.join(">")})`);
    verifier("un seul OK suffit pour tout le tour", A.EVENEMENT_ATTENDU === null);
    verifier("la fenêtre se lève pour laisser voir les animations",
             A.etatSequenceTour() === null || A.etatSequenceTour().okVisible === false);
    verifier("les deux autres, eux, attendent encore leur propre doigt",
             pc.JOUEES.length === 0 && B.JOUEES.length === 0 && !!B.EVENEMENT_ATTENDU);

    await t.toucher(["poste-ipadA"]);
    await t.respirer();
    verifier("et quand ils touchent, ils rattrapent le même point",
             pc.DERNIER_EVENEMENT_JOUE === 2 && B.DERNIER_EVENEMENT_JOUE === 2
             && B.JOUEES.join(">") === "mouvement>carte");

    // LA MANCHE SUIVANTE : la même créature rejoue, et redemande un OK.
    t.partie.Tour_Combat = 2;
    pc.PARTIE_DATA = clone(t.partie);
    await pc.consignerEtapeTour("carte", { idLanceur: "M1" });
    await t.livrer({ sansOk: true });
    verifier("un nouveau tour du même combattant redemande un OK",
             !!A.EVENEMENT_ATTENDU && A.JOUEES.join(">") === "mouvement>carte");
    await t.toucher();
    await t.respirer();
    verifier("puis il se déroule", A.JOUEES.join(">") === "mouvement>carte>carte", `(${A.JOUEES.join(">")})`);
}

// =========================================================================
console.log("\n9. LE JOUEUR DONT C'EST LE TOUR N'A PAS DE OK À DONNER");
// =========================================================================
{
    const t = table({ file: [{ idPersonnage: "H1", idCarte: "CARTE_H", initiative: 70, timestamp: 1100 }] });
    await t.brancher();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"];

    await pc.consignerEtapeTour("mouvement", { idToken: "H1" });
    await t.livrer({ sansOk: true });

    verifier("son propre tour ne lui est jamais mis en pose", pc.EVENEMENT_ATTENDU === null);
    verifier("son plateau reste dégagé", pc.etatSequenceTour() === null);
    verifier("les autres, eux, lisent d'abord sa technique",
             !!A.EVENEMENT_ATTENDU && A.etatSequenceTour().okVisible === true);
}

// =========================================================================
console.log("\n10. UN REJEU TARDIF N'EFFACE PAS CE QUE LA BASE A DIT ENTRE-TEMPS");
// =========================================================================
//  Le cas qui faisait diverger les écrans pendant plusieurs tours. Le moteur
//  applique les dégâts en RETRANCHANT du point de départ que l'événement lui
//  donne. Un poste qui rejoue en retard écrivait donc une valeur du PASSÉ —
//  d'après l'attaque, mais d'avant la brûlure et la régénération qui ont suivi
//  — et il y restait jusqu'à ce que la fiche du combattant rebouge.
{
    const t = table();
    await t.brancher();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"];
    pc.IA_MONSTRE_ACTEUR = "M1";

    Object.values(t.postes).forEach(w => {
        w.jouerAnimationMoteur = () => {
            const cible = w.PERSOS_PARTIE.find(p => p.idPersonnage === "H1");
            const depart = w.valeurAvantRejeu("H1", "PV_Actuels", cible.PV_Actuels);
            cible.PV_Actuels = Math.max(0, depart - 12);
        };
    });

    // L'attaque part : au moment où elle est écrite, H1 a 60 points de vie.
    await pc.consignerEtapeTour("carte", { idLanceur: "M1", attaques: [{ cibles: ["H1"] }] });

    // L'iPad, lui, dort. Pendant ce temps la base avance sans lui : l'attaque
    // passe (60 → 48), puis une brûlure tique (48 → 40) et la durée tombe.
    laBaseDit(A, "H1", { PV_Actuels: 48 });
    laBaseDit(A, "H1", { PV_Actuels: 40, Etats_Alteres: [{ nom: "Brûlé", duree: 1 }] });

    await t.livrer();

    const h1 = A.PERSOS_PARTIE.find(p => p.idPersonnage === "H1");
    verifier("l'animation a bien été rejouée", A.JOUEES.join(">") === "carte", `(${A.JOUEES.join(">")})`);
    verifier("mais elle n'a pas ramené le combattant à sa valeur du passé",
             h1.PV_Actuels === 40, `(attendu 40, obtenu ${h1.PV_Actuels})`);
    verifier("et la brûlure garde la durée que la base lui a donnée",
             (h1.Etats_Alteres || []).length === 1 && h1.Etats_Alteres[0].duree === 1,
             `(${JSON.stringify(h1.Etats_Alteres)})`);

    // À l'inverse, quand la base n'a PAS encore appliqué l'attaque, le rejeu
    // doit écrire : c'est lui qui fait avancer l'écran en attendant la fiche.
    const B = t.postes["poste-ipadB"];
    const h1B = B.PERSOS_PARTIE.find(p => p.idPersonnage === "H1");
    verifier("là où la base n'a rien dit, le rejeu écrit le résultat",
             h1B.PV_Actuels === 48, `(attendu 48, obtenu ${h1B.PV_Actuels})`);
}

// =========================================================================
console.log("\n11. DEUX COUPS DE LA MÊME CARTE SE CUMULENT AU REJEU");
// =========================================================================
//  Une carte peut frapper deux fois la même cible : le moteur retranche alors le
//  second coup de ce que le premier vient d'écrire. La valeur d'avant ne doit
//  donc être servie qu'UNE fois — sinon les deux coups repartent du même
//  chiffre, seul le dernier compte, et le spectateur voit moitié moins de
//  dégâts que l'auteur.
{
    const t = table();
    await t.brancher();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"];
    pc.IA_MONSTRE_ACTEUR = "M1";

    Object.values(t.postes).forEach(w => {
        w.jouerAnimationMoteur = () => {
            // Deux attaques, comme le vrai moteur : une boucle par attaque, et
            // dans chacune une lecture du point de départ.
            [7, 5].forEach(degats => {
                const cible = w.PERSOS_PARTIE.find(p => p.idPersonnage === "H1");
                const depart = w.valeurAvantRejeu("H1", "PV_Actuels", cible.PV_Actuels);
                cible.PV_Actuels = Math.max(0, depart - degats);
            });
        };
    });

    await pc.consignerEtapeTour("carte", { idLanceur: "M1", attaques: [{ cibles: ["H1"] }] });
    await t.livrer();

    const h1 = A.PERSOS_PARTIE.find(p => p.idPersonnage === "H1");
    verifier("les deux coups sont comptés, pas seulement le dernier",
             h1.PV_Actuels === 48, `(attendu 60-7-5=48, obtenu ${h1.PV_Actuels})`);
}

// =========================================================================
console.log("\n12. LA VIE NE SE RETIRE PAS DERRIÈRE LA FENÊTRE SOMBRE");
// =========================================================================
//  Les points de vie voyagent dans la fiche du combattant, pas dans le journal :
//  ils arrivent donc chez tout le monde dès que l'auteur a tranché — c'est-à-dire
//  AVANT que l'écran n'ait rejoué le tour. On voyait la vie d'un héros se retirer
//  derrière la fenêtre sombre, plusieurs secondes avant le coup qui la lui prend.
{
    const t = table();
    await t.brancher();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"];
    pc.IA_MONSTRE_ACTEUR = "M1";

    Object.values(t.postes).forEach(w => {
        w.jouerAnimationMoteur = () => {
            const cible = w.PERSOS_PARTIE.find(p => p.idPersonnage === "H1");
            const depart = w.valeurAvantRejeu("H1", "PV_Actuels", cible.PV_Actuels);
            cible.PV_Actuels = Math.max(0, depart - 12);
        };
    });

    await pc.consignerEtapeTour("carte", { idLanceur: "M1", attaques: [{ cibles: ["H1"] }] });
    await t.livrer({ sansOk: true });

    // La base a livré les points de vie D'APRÈS pendant que l'iPad attend son
    // OK : c'est exactement l'instant où la vie « se retirait ».
    laBaseDit(A, "H1", { PV_Actuels: 48 });
    A.figerAffichageRetenus();
    const h1 = () => A.PERSOS_PARTIE.find(p => p.idPersonnage === "H1");

    verifier("le tour attend le OK", !!A.EVENEMENT_ATTENDU);
    verifier("et la vie affichée n'a PAS bougé", h1().PV_Actuels === 60,
             `(attendu 60, obtenu ${h1().PV_Actuels})`);

    await t.toucher();
    await t.respirer();
    verifier("elle ne tombe qu'une fois le coup rejoué", h1().PV_Actuels === 48,
             `(attendu 48, obtenu ${h1().PV_Actuels})`);

    // Et une fois le journal à jour, l'écran suit de nouveau la base sans retard.
    laBaseDit(A, "H1", { PV_Actuels: 41 });
    A.figerAffichageRetenus();
    verifier("puis l'écran suit de nouveau la base", h1().PV_Actuels === 41,
             `(attendu 41, obtenu ${h1().PV_Actuels})`);
}

console.log("\n13. UN ÉTAT QUI PARLE D'UN AUTRE COMBAT N'ENFERME PLUS PERSONNE");
// =========================================================================
//  Un iPad est resté figé derrière la fenêtre sombre, sur la technique du tour
//  d'une rencontre DÉJÀ TERMINÉE. Rien ne pouvait plus arriver : l'écran
//  annonçait « le tour se prépare… » pour un combattant d'un combat qui
//  n'existait plus, taper ne faisait rien, et la seule sortie était une croix de
//  débogage cachée sous le bouton du menu.
//
//  C'est la même règle qu'à l'ouverture du combat : un état qui ne parle pas de
//  CETTE rencontre est inerte. Il n'annonce donc plus personne.
{
    const w = { ID_PARTIE_COURANTE: "P1", REGIME_CERVEAU: true };
    w.PERSOS_PARTIE = [{ idPersonnage: "H1", idJoueur: "moi", camp: "Allié" },
                       { idPersonnage: "M1", camp: "Ennemi", estMonstre: true }];
    w.estMonstre = (id) => String(id).startsWith("M");
    w.estCombattantMort = () => false;
    new Function('window', 'localStorage', SRC)(w, { getItem: () => "moi" });

    const etatDe = (combat) => ({
        combat, phase: "Resolution",
        file: [{ id: "M1", carte: "CARTE_M" }],
        combattants: { H1: {}, M1: {} }
    });
    w.regimeDuJeu = () => ({ etatAffiche: () => etatDe("renc_ancienne") });

    // La rencontre en cours est une AUTRE : l'ancien état n'annonce plus rien.
    w.PARTIE_DATA = { ID_Rencontre: "renc_nouvelle", Phase_Combat: "Resolution" };
    verifier("un état d'une autre rencontre n'annonce plus de tour",
             w.acteurCourantCombat() === null,
             String(JSON.stringify(w.acteurCourantCombat())));
    verifier("donc la fenêtre sombre n'a plus de raison d'être",
             w.SEQUENCE_TOUR === null);

    // La même rencontre : tout fonctionne comme avant.
    w.PARTIE_DATA = { ID_Rencontre: "renc_ancienne", Phase_Combat: "Resolution" };
    const tete = w.acteurCourantCombat();
    verifier("sur la BONNE rencontre, le tour est bien annoncé",
             !!tete && tete.idPersonnage === "M1", tete ? tete.idPersonnage : "aucun");
    verifier("et la fenêtre se pose pour un combattant qui n'est pas le mien",
             !!w.SEQUENCE_TOUR && w.SEQUENCE_TOUR.voile === true);

    // Une partie sans rencontre identifiée (monstres posés à la main) ne doit
    // pas tout faire disparaître : on ne compare que ce qu'on peut comparer.
    w.PARTIE_DATA = { Phase_Combat: "Resolution" };
    verifier("sans rencontre identifiée, on ne juge pas",
             !!w.acteurCourantCombat());
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
