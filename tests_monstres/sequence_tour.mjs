// LE SCRIPT DU TOUR ET SA RELECTURE.
//
// Le vrai sequence_tour.js est chargé tel quel dans TROIS postes distincts qui
// partagent une seule partie simulée et une seule collection de scripts. Chaque
// écriture rejoue une notification chez les trois, exactement comme Firestore.
//
// Ce que ce banc garantit :
//   • le poste qui joue écrit son tour, étape par étape, dans SON document ;
//   • les autres ne jouent RIEN pendant ce temps — rien ne doit transparaître
//     derrière la fenêtre sombre ;
//   • le gros OK doré s'allume sur un seul drapeau, « complet », donc au même
//     instant partout : plus de « prêt » échangés qui décalaient le bouton d'un
//     appareil à l'autre ;
//   • la relecture est personnelle et séquentielle : une étape à la fois,
//     chacune attendant la précédente ;
//   • la file n'avance que lorsque TOUS ont fini de rejouer ;
//   • les points de vie d'avant voyagent dans le script, si bien qu'une
//     relecture tardive ne retranche pas les dégâts une seconde fois ;
//   • un poste absent met la table en pause pour de bon, et seule une action
//     humaine la relance ;
//   • une créature dont le tour est écrit ne le rejoue pas en boucle.
import fs from 'fs';

const SRC = fs.readFileSync('/home/user/Ivalis/sequence_tour.js', 'utf-8');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const clone = (o) => JSON.parse(JSON.stringify(o));

// =========================================================================
//  LA TABLE : une partie, une collection de scripts, trois postes autour
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
        File_Attente_Combat: options.file || [{ idPersonnage: "M1", idCarte: "CARTE_M", initiative: 55, timestamp: 1000 }]
    };
    // La collection Scripts_Tour, en miniature.
    const scripts = {};

    let aChange = true;
    const avances = [];
    const postes = {};
    const ecoutes = [];

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

        w.finDeTourCombat = async (forcer, idQui) => {
            avances.push({ poste: id, acteur: idQui });
            if (partie.File_Attente_Combat.length && partie.File_Attente_Combat[0].idPersonnage === idQui) {
                partie.File_Attente_Combat = partie.File_Attente_Combat.slice(1);
                if (partie.File_Attente_Combat.length === 0) partie.Phase_Combat = "Preparation";
                aChange = true;
            }
        };

        // La plomberie Firestore, telle qu'app.js l'expose.
        w.ecrireScriptTour = async (idDoc, champs) => {
            scripts[idDoc] = { ...(scripts[idDoc] || {}), ...clone(champs) };
            aChange = true;
            return true;
        };
        w.signerScriptTour = async (idDoc, idJoueur) => {
            const d = scripts[idDoc] = scripts[idDoc] || {};
            d.finis = [...new Set([...(d.finis || []), idJoueur])];
            aChange = true;
            return true;
        };
        w.ecouterScriptTour = (idDoc, rappel) => {
            const entree = { idDoc, rappel, vivante: true };
            ecoutes.push(entree);
            // Firestore livre l'état courant dès l'abonnement.
            Promise.resolve().then(() => { if (entree.vivante) rappel(scripts[idDoc] ? clone(scripts[idDoc]) : null); });
            return () => { entree.vivante = false; };
        };

        new Function('window', 'localStorage', SRC)(w, faussLocalStorage);
        postes[id] = w;
    });

    async function reposer(maxTours = 40) {
        let n = 0, calmes = 0;
        while (n++ < maxTours && calmes < 3) {
            aChange = false;
            await new Promise(r => setTimeout(r, 0));
            for (const id of Object.keys(postes)) {
                const w = postes[id];
                w.PARTIE_DATA = clone(partie);
                await w.suivreSequenceTour(w.PARTIE_DATA);
            }
            for (const e of [...ecoutes]) {
                if (!e.vivante) continue;
                await e.rappel(scripts[e.idDoc] ? clone(scripts[e.idDoc]) : null);
            }
            calmes = aChange ? 0 : calmes + 1;
        }
        return n;
    }

    return { partie, scripts, postes, avances, reposer, notifier: () => { aChange = true; } };
}

const leScript = (t) => Object.values(t.scripts)[0] || null;

// =========================================================================
console.log("\n1. UN TOUR DE CRÉATURE : ÉCRIT PAR UN, REJOUÉ PAR TOUS");
// =========================================================================
{
    const t = table();
    await t.reposer();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"], B = t.postes["poste-ipadB"];

    verifier("la fenêtre s'ouvre chez les trois (une créature n'est à personne)",
             !!pc.SEQUENCE_TOUR && pc.SEQUENCE_TOUR.voile && A.SEQUENCE_TOUR.voile && B.SEQUENCE_TOUR.voile);
    verifier("aucun OK tant que le tour n'est pas écrit en entier",
             pc.etatSequenceTour().okVisible === false, `(${pc.etatSequenceTour().message})`);

    // Le PC tient le verrou de l'IA : il joue le tour et le consigne.
    await pc.consignerEtapeTour("mouvement", { idToken: "M1", path: [{ q: 1, r: 0 }] });
    await pc.consignerEtapeTour("carte", { idLanceur: "M1", attaques: [{ cibles: ["H1"] }] });
    await t.reposer();

    verifier("le poste qui joue ne voit plus la fenêtre", pc.SEQUENCE_TOUR.voile === false);
    verifier("le script porte les deux étapes, dans l'ordre",
             leScript(t).etapes.map(e => e.type).join(">") === "mouvement>carte",
             `(${leScript(t).etapes.map(e => e.type).join(">")})`);
    verifier("il note les points de vie d'avant de la cible",
             leScript(t).etapes[1].avant.H1.PV_Actuels === 60,
             `(${JSON.stringify(leScript(t).etapes[1].avant)})`);
    verifier("les spectateurs n'ont RIEN joué pendant ce temps",
             A.JOUEES.length === 0 && B.JOUEES.length === 0);
    verifier("et toujours pas de OK : le tour n'est pas fini d'écrire",
             A.etatSequenceTour().okVisible === false, `(${A.etatSequenceTour().message})`);

    const retenu = await pc.sequenceRetientFinDeTour("M1");
    verifier("finDeTourCombat est retenue : la file n'avance pas toute seule", retenu === true);
    await t.reposer();

    verifier("le script est marqué complet", leScript(t).complet === true);
    verifier("le gros OK doré s'allume chez les DEUX spectateurs en même temps",
             A.etatSequenceTour().okVisible === true && B.etatSequenceTour().okVisible === true);
    verifier("le poste qui a joué n'a rien à cliquer", pc.SEQUENCE_TOUR.finiEnvoye === true);
    verifier("la file n'avance pas encore", t.avances.length === 0);

    await A.jouerSequenceTour(); await t.reposer();
    verifier("le premier iPad rejoue les deux étapes dans l'ordre",
             A.JOUEES.join(">") === "mouvement>carte", `(${A.JOUEES.join(">")})`);
    verifier("son pion retrouve la case de la base une fois le trajet rejoué",
             Object.keys(A.PIONS_EN_ATTENTE_SEQUENCE).length === 0);
    verifier("mais la file attend toujours le troisième poste", t.avances.length === 0,
             `(finis : ${(leScript(t).finis || []).join(", ")})`);

    await B.jouerSequenceTour(); await t.reposer();
    verifier("le dernier poste fait enfin avancer la file", t.avances.length > 0,
             `(${t.avances.map(a => a.poste).join(", ")})`);
    verifier("et c'est bien le tour de la créature qui se termine",
             t.avances.every(a => a.acteur === "M1"));
    verifier("la file a avancé d'un seul cran", t.partie.File_Attente_Combat.length === 0);
    verifier("les deux écrans ont rejoué exactement la même chose",
             A.JOUEES.join(">") === B.JOUEES.join(">"));
}

// =========================================================================
console.log("\n2. LA RELECTURE NE FRAPPE PAS DEUX FOIS");
// =========================================================================
//  Le moteur retranche les dégâts de ce qu'il lit. Une relecture démarre après
//  que l'auteur a écrit son résultat en base : sans les points de vie d'avant
//  dans le script, elle retrancherait une seconde fois.
{
    const t = table();
    await t.reposer();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"], B = t.postes["poste-ipadB"];

    const frapper = (w) => () => {
        const cible = w.PERSOS_PARTIE.find(p => p.idPersonnage === "H1");
        const depart = w.valeurAvantRejeu("H1", "PV_Actuels", cible.PV_Actuels);
        cible.PV_Actuels = Math.max(0, depart - 6);
    };
    [pc, A, B].forEach(w => { w.jouerAnimationMoteur = frapper(w); });

    await pc.consignerEtapeTour("carte", { idLanceur: "M1", attaques: [{ cibles: ["H1"] }] });
    // L'auteur applique ses dégâts et les écrit en base.
    pc.PERSOS_PARTIE.find(p => p.idPersonnage === "H1").PV_Actuels = 54;
    await pc.sequenceRetientFinDeTour("M1");
    await t.reposer();

    // La base livre aux spectateurs les points de vie D'APRÈS — et, dans la même
    // livraison, une brûlure qui n'a rien à voir avec ce tour-ci.
    [A, B].forEach(w => {
        const h1 = w.PERSOS_PARTIE.find(p => p.idPersonnage === "H1");
        h1.PV_Actuels = 54;
        h1.Etats_Alteres = [{ nom: "Brûlé", duree: 2 }];
    });

    await A.jouerSequenceTour(); await B.jouerSequenceTour(); await t.reposer();

    const pvA = A.PERSOS_PARTIE.find(p => p.idPersonnage === "H1").PV_Actuels;
    const pvB = B.PERSOS_PARTIE.find(p => p.idPersonnage === "H1").PV_Actuels;
    verifier("le spectateur retombe sur les mêmes points de vie que l'auteur",
             pvA === 54 && pvB === 54, `(auteur 54, iPad ${pvA} et ${pvB})`);
    verifier("l'état livré par la base pendant l'attente n'a pas été effacé",
             (A.PERSOS_PARTIE.find(p => p.idPersonnage === "H1").Etats_Alteres || []).length === 1);
}

// =========================================================================
console.log("\n3. DEUX ÉTAPES S'ENCHAÎNENT, LA SECONDE APRÈS LA PREMIÈRE");
// =========================================================================
{
    const t = table();
    await t.reposer();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"];

    const ordre = [];
    Object.values(t.postes).forEach(w => {
        w.jouerAnimationMoteur = async (d) => {
            ordre.push("debut:" + d.marque);
            await new Promise(r => setTimeout(r, 30));
            ordre.push("fin:" + d.marque);
        };
    });

    await pc.consignerEtapeTour("carte", { idLanceur: "M1", marque: "A" });
    await pc.consignerEtapeTour("carte", { idLanceur: "M1", marque: "B" });
    await pc.sequenceRetientFinDeTour("M1");
    await t.reposer();

    ordre.length = 0;
    await A.jouerSequenceTour();

    verifier("la seconde ne démarre qu'une fois la première terminée",
             ordre.join(">") === "debut:A>fin:A>debut:B>fin:B", `(${ordre.join(">")})`);
}

// =========================================================================
console.log("\n4. UN POSTE ABSENT MET LA TABLE EN PAUSE, SANS LIMITE DE TEMPS");
// =========================================================================
{
    const t = table();
    await t.reposer();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"];

    delete t.postes["poste-ipadB"];   // l'iPad de B est parti

    await pc.consignerEtapeTour("carte", { idLanceur: "M1" });
    await pc.sequenceRetientFinDeTour("M1");
    await t.reposer();
    await A.jouerSequenceTour();
    await t.reposer();

    verifier("deux signatures sur trois", (leScript(t).finis || []).length === 2,
             `(${(leScript(t).finis || []).join(", ")})`);
    verifier("après plusieurs passages, personne n'est passé d'office",
             (await (async () => { for (let i = 0; i < 5; i++) await t.reposer(); return t.avances.length; })()) === 0);

    await pc.forcerSequenceTour();
    await t.reposer();
    verifier("la sortie manuelle relance la file", t.avances.length > 0);
    verifier("les héros mis de côté ne comptent pas dans les postes attendus",
             (() => {
                 pc.PERSOS_PARTIE = pc.PERSOS_PARTIE.map(p => p.idJoueur === "poste-ipadB" ? { ...p, actif: false } : p);
                 return !pc.postesAttendusSequence().includes("poste-ipadB");
             })());
}

// =========================================================================
console.log("\n5. UNE CRÉATURE NE REJOUE PAS SON TOUR");
// =========================================================================
{
    const t = table();
    await t.reposer();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"];

    verifier("avant le tour, l'IA a le champ libre", pc.sequenceTourEnAttente() === false);
    await pc.consignerEtapeTour("carte", { idLanceur: "M1" });
    await pc.sequenceRetientFinDeTour("M1");
    verifier("le tour écrit, le poste qui tient l'IA se bloque lui-même",
             pc.sequenceTourEnAttente() === true);
    await t.reposer();
    verifier("les autres postes se bloquent aussi (le script est complet)",
             A.sequenceTourEnAttente() === true);

    for (const w of Object.values(t.postes)) await w.jouerSequenceTour();
    await t.reposer();

    // La base n'a pas encore livré la file avancée : la tête désigne toujours M1.
    t.partie.File_Attente_Combat = [{ idPersonnage: "M1", idCarte: "CARTE_M", initiative: 55, timestamp: 1000 }];
    t.partie.Phase_Combat = "Resolution";
    Object.values(t.postes).forEach(w => { w.PARTIE_DATA = clone(t.partie); });

    const meneur = Object.values(t.postes).find(w => (w.SEQUENCES_TERMINEES || []).length > 0);
    verifier("le poste qui a fait avancer la file garde la trace du tour bouclé", !!meneur);
    if (meneur) {
        verifier("sa créature reste bloquée le temps que la base rattrape",
                 meneur.sequenceTourEnAttente() === true);
        verifier("et aucune fenêtre ne s'y rouvre sur ce tour déjà joué",
                 meneur.ouvrirSequenceTour(meneur.PARTIE_DATA) === null);
    }
}

// =========================================================================
console.log("\n6. LE TOUR D'UN JOUEUR : LUI VOIT SON PLATEAU, LES AUTRES LA FENÊTRE");
// =========================================================================
{
    const t = table({ file: [{ idPersonnage: "H1", idCarte: "CARTE_H", initiative: 70, timestamp: 1100 }] });
    await t.reposer();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"], B = t.postes["poste-ipadB"];

    verifier("le joueur dont c'est le tour garde son plateau dégagé", pc.SEQUENCE_TOUR.voile === false);
    verifier("les deux autres postes ont la fenêtre sombre", A.SEQUENCE_TOUR.voile && B.SEQUENCE_TOUR.voile);

    [pc, A, B].forEach(w => w.programmerAnimationTour("mouvement", { idToken: "H1", timestamp: 4001 }, () => {}));
    verifier("lui voit son déplacement en direct", pc.JOUEES.join(">") === "mouvement");
    verifier("les autres ne voient rien passer derrière la fenêtre",
             A.JOUEES.length === 0 && B.JOUEES.length === 0);
    verifier("et leur pion garde sa case en attendant la relecture",
             A.PIONS_EN_ATTENTE_SEQUENCE.H1 === true);

    await pc.consignerEtapeTour("mouvement", { idToken: "H1", path: [{ q: 0, r: 0 }] });
    await pc.sequenceRetientFinDeTour("H1");
    await t.reposer();

    verifier("le OK n'apparaît que chez les spectateurs",
             A.etatSequenceTour().okVisible && B.etatSequenceTour().okVisible);
    verifier("la file n'avance pas avant qu'ils aient vu", t.avances.length === 0);

    await A.jouerSequenceTour(); await B.jouerSequenceTour(); await t.reposer();
    verifier("les deux spectateurs rejouent le déplacement",
             A.JOUEES.join(">") === "mouvement" && B.JOUEES.join(">") === "mouvement");
    verifier("puis la file avance", t.avances.length > 0 && t.partie.File_Attente_Combat.length === 0);
}

// =========================================================================
console.log("\n7. UN COMBATTANT À TERRE NE BLOQUE PAS LA FILE");
// =========================================================================
{
    const t = table();
    const pc = t.postes["poste-pc"];
    Object.values(t.postes).forEach(w => { w.estCombattantMort = (id) => id === "M1"; });
    await t.reposer();

    verifier("aucune séquence ne s'ouvre sur un mort", pc.SEQUENCE_TOUR === null);
    verifier("finDeTourCombat passe sans être retenue",
             (await pc.sequenceRetientFinDeTour("M1")) === false);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
