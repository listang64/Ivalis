// LES DEUX BARRIÈRES DE SYNCHRONISATION D'UN TOUR DE COMBAT.
//
// Le vrai sequence_tour.js est chargé tel quel dans TROIS postes distincts qui
// partagent un seul document de partie simulé — un PC et deux iPad, dont l'un
// traîne exprès. Chaque écriture dans ce document rejoue une notification chez
// les trois, exactement comme Firestore le fait.
//
// Ce que ce banc garantit, et qui n'existait pas avant :
//   • un spectateur ne rejoue RIEN tant que tous les postes n'ont pas signé ;
//   • la file n'avance pas d'un cran tant qu'un seul poste anime encore ;
//   • un sous-effet (Poussée, Traction, Peur) calculé en pleine animation, donc
//     arrivé APRÈS l'annonce du calcul, retient encore le poste le plus rapide ;
//   • un poste absent met la table en pause pour de bon — aucune minuterie ne
//     le passe — et seule une action humaine la relance ;
//   • une créature dont le tour est calculé mais pas encore validé ne le rejoue
//     pas en boucle pendant l'attente.
import fs from 'fs';

const SRC = fs.readFileSync('/home/user/Ivalis/sequence_tour.js', 'utf-8');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const clone = (o) => JSON.parse(JSON.stringify(o));

// =========================================================================
//  LA TABLE : un document de partie, trois postes autour
// =========================================================================
function table(options = {}) {
    const heros = options.heros || [
        { idPersonnage: "H1", prenom: "Pliors", idJoueur: "poste-pc",    Etats_Alteres: [] },
        { idPersonnage: "H2", prenom: "Jade",   idJoueur: "poste-ipadA", Etats_Alteres: [] },
        { idPersonnage: "H3", prenom: "Elior",  idJoueur: "poste-ipadB", Etats_Alteres: [] }
    ];
    const monstres = [{ idPersonnage: "M1", prenom: "Goule", estMonstre: true, Etats_Alteres: [] }];
    const doc = {
        Tour_Combat: 1,
        Phase_Combat: "Resolution",
        File_Attente_Combat: options.file || [{ idPersonnage: "M1", idCarte: "CARTE_M", initiative: 55, timestamp: 1000 }]
    };

    let aChange = true;
    const avances = [];
    const postes = {};

    (options.postes || ["poste-pc", "poste-ipadA", "poste-ipadB"]).forEach(id => {
        const w = { PARTIE_DATA: clone(doc) };
        const faussLocalStorage = { getItem: (k) => (k === "ID_JOUEUR_COURANT" ? id : null) };

        w.PERSOS_PARTIE = clone(heros).concat(clone(monstres));
        w.estMonstre = (idp) => String(idp).startsWith("M");
        w.estCombattantMort = () => false;
        w.jouerSonClic = () => {};
        w.rafraichirVoileTour = () => { w.PEINTURES = (w.PEINTURES || 0) + 1; };
        // Le cache des techniques, tel que le vrai jeu le tient : c'est lui que
        // la vérification base → client interroge avant de signer.
        w.CACHE_COMPETENCES_GLOBAL = { M1: { CARTE_M: { Nom: "Hurlement putride", Effets_Compiles: [] } } };
        w.COMPETENCES_CACHE = { CARTE_H: { Nom: "Lame du crépuscule", Effets_Compiles: [] } };
        Object.defineProperty(w, 'CARTES_MANQUANTES', {
            set(v) { w._manque = v; if (v) { w._sauve = w.CACHE_COMPETENCES_GLOBAL; w.CACHE_COMPETENCES_GLOBAL = {}; w._sauveH = w.COMPETENCES_CACHE; w.COMPETENCES_CACHE = {}; }
                     else if (w._sauve) { w.CACHE_COMPETENCES_GLOBAL = w._sauve; w.COMPETENCES_CACHE = w._sauveH; } },
            get() { return !!w._manque; }
        });

        // Les animations : ce banc n'en joue aucune, il note seulement l'ordre
        // dans lequel chaque poste les aurait jouées.
        w.JOUEES = [];
        w.filerAnimation = async (nom, fn) => { w.JOUEES.push(nom); if (fn) await fn(); };

        // La file avance : dans le vrai jeu c'est la transaction de
        // finDeTourCombat qui n'en laisse passer qu'un. Ici on retient qui a
        // essayé, et on n'avance qu'une fois.
        w.finDeTourCombat = async (forcer, idQui) => {
            avances.push({ poste: id, acteur: idQui });
            if (doc.File_Attente_Combat.length && doc.File_Attente_Combat[0].idPersonnage === idQui) {
                doc.File_Attente_Combat = doc.File_Attente_Combat.slice(1);
                if (doc.File_Attente_Combat.length === 0) doc.Phase_Combat = "Preparation";
                aChange = true;
            }
        };

        w.modifierPartie = async (fn) => {
            const sortie = fn(clone(doc));
            if (!sortie) return null;
            if (sortie.maj) Object.assign(doc, clone(sortie.maj));
            aChange = true;
            return sortie.resultat !== undefined ? sortie.resultat : true;
        };

        new Function('window', 'localStorage', SRC)(w, faussLocalStorage);
        postes[id] = w;
    });

    // Une notification de la base chez tous les postes, en boucle jusqu'à ce
    // que plus personne n'écrive — l'équivalent d'un réseau au repos.
    async function reposer(maxTours = 40) {
        let n = 0, calmes = 0;
        // On boucle jusqu'à trois passages de suite sans la moindre écriture :
        // c'est l'équivalent d'un réseau revenu au calme. Le tour de boucle
        // laisse aussi respirer les rejeux en cours (vider un tampon est une
        // promesse, pas un appel immédiat).
        while (n++ < maxTours && calmes < 3) {
            aChange = false;
            await new Promise(r => setTimeout(r, 0));
            for (const id of Object.keys(postes)) {
                const w = postes[id];
                w.PARTIE_DATA = clone(doc);
                await w.suivreSequenceTour(w.PARTIE_DATA);
            }
            calmes = aChange ? 0 : calmes + 1;
        }
        return n;
    }

    return { doc, postes, avances, reposer, notifier: () => { aChange = true; } };
}

// Ce qu'un poste diffuse quand il calcule un tour : la même forme que les
// Action_* de la vraie base.
const action = (ts, extra = {}) => ({ timestamp: ts, ...extra });

// =========================================================================
console.log("\n1. UN TOUR DE CRÉATURE : PERSONNE NE REJOUE AVANT TOUT LE MONDE");
// =========================================================================
{
    const t = table();
    await t.reposer();

    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"], B = t.postes["poste-ipadB"];

    verifier("la fenêtre s'ouvre chez les trois (une créature n'est à personne)",
             !!pc.SEQUENCE_TOUR && pc.SEQUENCE_TOUR.voile && A.SEQUENCE_TOUR.voile && B.SEQUENCE_TOUR.voile);
    verifier("aucun OK doré tant que le tour n'est pas calculé",
             pc.etatSequenceTour().okVisible === false,
             `(${pc.etatSequenceTour().message})`);

    // Le PC tient le verrou de l'IA : il calcule et diffuse le tour. Les trois
    // postes reçoivent l'ordre d'animer — et le mettent tous de côté.
    [pc, A, B].forEach(w => {
        w.programmerAnimationTour("mouvement", action(2001, { idToken: "M1" }), () => {});
        w.programmerAnimationTour("carte", action(2002, { idLanceur: "M1" }), () => {});
    });

    verifier("les animations sont mises en attente, pas jouées",
             pc.JOUEES.length === 0 && A.JOUEES.length === 0 && B.JOUEES.length === 0);
    verifier("le pion de la créature garde sa case à l'écran pendant l'attente",
             A.PIONS_EN_ATTENTE_SEQUENCE.M1 === true);

    // Fin du calcul, côté PC.
    const retenu = await pc.sequenceRetientFinDeTour("M1");
    verifier("finDeTourCombat est retenue : la file n'avance pas toute seule", retenu === true);
    verifier("la file est toujours sur la créature", t.doc.File_Attente_Combat[0].idPersonnage === "M1");

    await t.reposer();

    verifier("les trois postes ont signé « prêt »", (t.doc.Sequence_Tour.prets || []).length === 3,
             `(${(t.doc.Sequence_Tour.prets || []).join(", ")})`);
    verifier("le gros OK doré clignote pour tout le monde",
             pc.etatSequenceTour().okVisible && A.etatSequenceTour().okVisible && B.etatSequenceTour().okVisible);
    verifier("mais toujours rien de rejoué", pc.JOUEES.length === 0 && A.JOUEES.length === 0);
    verifier("et toujours aucune avancée de la file", t.avances.length === 0);

    // Le PC touche son écran, puis un iPad. Le second traîne.
    await pc.jouerSequenceTour(); await t.reposer();
    verifier("le PC rejoue ses animations dans l'ordre",
             pc.JOUEES.join(">") === "mouvement>carte", `(${pc.JOUEES.join(">")})`);
    verifier("son pion retrouve la case de la base une fois le trajet rejoué",
             Object.keys(pc.PIONS_EN_ATTENTE_SEQUENCE).length === 0);
    verifier("la file n'avance toujours pas : deux postes n'ont pas regardé", t.avances.length === 0);

    await A.jouerSequenceTour(); await t.reposer();
    verifier("un seul iPad ne suffit pas non plus", t.avances.length === 0,
             `(finis : ${(t.doc.Sequence_Tour.finis || []).join(", ")})`);

    await B.jouerSequenceTour(); await t.reposer();
    verifier("le dernier poste fait enfin avancer la file", t.avances.length > 0,
             `(${t.avances.map(a => a.poste).join(", ")})`);
    verifier("et c'est bien le tour de la créature qui se termine",
             t.avances.every(a => a.acteur === "M1"));
    verifier("la file a avancé d'un seul cran", t.doc.File_Attente_Combat.length === 0);
    verifier("les trois écrans ont rejoué exactement la même chose",
             A.JOUEES.join(">") === "mouvement>carte" && B.JOUEES.join(">") === "mouvement>carte");
}

// =========================================================================
console.log("\n2. UN SOUS-EFFET ARRIVÉ EN RETARD RETIENT LE POSTE LE PLUS RAPIDE");
// =========================================================================
//  Poussée, Traction et Peur ne sont calculées qu'au moment où la carte
//  s'anime : elles partent donc APRÈS l'annonce « calcul terminé ». Un poste
//  qui aurait déjà tout rejoué ne doit pas se déclarer fini sans elles.
{
    const t = table();
    await t.reposer();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"], B = t.postes["poste-ipadB"];

    [pc, A, B].forEach(w => w.programmerAnimationTour("carte", action(3001, { idLanceur: "M1" }), () => {}));
    await pc.sequenceRetientFinDeTour("M1");
    await t.reposer();

    // L'iPad A regarde tout de suite, avant même le PC.
    await A.jouerSequenceTour(); await t.reposer();
    verifier("l'iPad rapide a rejoué la carte", A.JOUEES.join(">") === "carte");
    verifier("mais il ne s'est PAS déclaré fini (le PC n'a rien publié)",
             !(t.doc.Sequence_Tour.finis || []).includes("poste-ipadA"),
             `(${(t.doc.Sequence_Tour.finis || []).join(", ")})`);

    // Le PC regarde à son tour : sa carte engendre une Poussée, diffusée à tous
    // PENDANT l'animation, donc après l'annonce « calcul terminé ».
    const rejeuPc = pc.jouerSequenceTour();
    [pc, A, B].forEach(w => w.programmerAnimationTour("poussée", action(3002, { idCible: "H1" }), () => {}));
    await rejeuPc;
    await t.reposer();

    verifier("la Poussée en retard est rejouée par l'iPad rapide aussi",
             A.JOUEES.join(">") === "carte>poussée", `(${A.JOUEES.join(">")})`);
    verifier("l'annonce du tour liste bien les deux animations",
             (t.doc.Sequence_Tour.actions || []).length === 2,
             `(${JSON.stringify(t.doc.Sequence_Tour.actions)})`);
    verifier("la file n'a pas avancé : le troisième poste n'a pas regardé", t.avances.length === 0);

    await B.jouerSequenceTour(); await t.reposer();
    verifier("le dernier poste rejoue les deux dans l'ordre, puis la file avance",
             B.JOUEES.join(">") === "carte>poussée" && t.avances.length > 0,
             `(${B.JOUEES.join(">")})`);
}

// =========================================================================
console.log("\n3. LE TOUR D'UN JOUEUR : LUI VOIT SON PLATEAU, LES AUTRES LA FENÊTRE");
// =========================================================================
{
    const t = table({ file: [{ idPersonnage: "H1", idCarte: "CARTE_H", initiative: 70, timestamp: 1100 }] });
    await t.reposer();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"], B = t.postes["poste-ipadB"];

    verifier("le joueur dont c'est le tour garde son plateau dégagé", pc.SEQUENCE_TOUR.voile === false);
    verifier("les deux autres postes ont la fenêtre sombre", A.SEQUENCE_TOUR.voile && B.SEQUENCE_TOUR.voile);

    [pc, A, B].forEach(w => w.programmerAnimationTour("mouvement", action(4001, { idToken: "H1" }), () => {}));
    verifier("lui voit son déplacement en direct", pc.JOUEES.join(">") === "mouvement");
    verifier("les autres l'ont mis de côté", A.JOUEES.length === 0 && B.JOUEES.length === 0);
    verifier("son propre pion n'est jamais figé chez lui",
             Object.keys(pc.PIONS_EN_ATTENTE_SEQUENCE).length === 0);

    await pc.sequenceRetientFinDeTour("H1");
    await t.reposer();

    verifier("le OK n'apparaît que chez les spectateurs",
             A.etatSequenceTour().okVisible && B.etatSequenceTour().okVisible);
    verifier("l'acteur n'a rien à cliquer et attend simplement",
             pc.SEQUENCE_TOUR && pc.SEQUENCE_TOUR.finiEnvoye === true);
    verifier("la file n'avance pas avant que les spectateurs aient vu", t.avances.length === 0);

    await A.jouerSequenceTour(); await await B.jouerSequenceTour(); await t.reposer();
    verifier("les deux spectateurs rejouent le déplacement",
             A.JOUEES.join(">") === "mouvement" && B.JOUEES.join(">") === "mouvement");
    verifier("puis la file avance", t.avances.length > 0 && t.doc.File_Attente_Combat.length === 0);
}

// =========================================================================
console.log("\n4. UN POSTE ABSENT MET LA TABLE EN PAUSE, SANS LIMITE DE TEMPS");
// =========================================================================
//  Demande explicite de Nico : « reste en pause tant que le joueur n'est pas
//  revenu ». Aucune minuterie ne le passe — seul un humain le décide.
{
    const t = table();
    await t.reposer();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"], B = t.postes["poste-ipadB"];

    // L'iPad B est parti : on le débranche du réseau.
    delete t.postes["poste-ipadB"];

    [pc, A].forEach(w => w.programmerAnimationTour("carte", action(5001), () => {}));
    await pc.sequenceRetientFinDeTour("M1");
    await t.reposer();

    verifier("l'absent est compté : deux signatures sur trois",
             (t.doc.Sequence_Tour.prets || []).length === 2);
    verifier("le OK ne s'allume pas", pc.etatSequenceTour().okVisible === false);
    verifier("la fenêtre dit qui manque", /attente de 1 poste/.test(pc.etatSequenceTour().message),
             `(${pc.etatSequenceTour().message})`);

    // Le temps passe. Beaucoup. Rien ne doit bouger tout seul.
    for (let i = 0; i < 5; i++) await t.reposer();
    verifier("après plusieurs passages, toujours rien : personne n'est passé d'office",
             t.avances.length === 0 && pc.etatSequenceTour().okVisible === false);

    // Un humain décide de continuer sans lui.
    await pc.forcerSequenceTour();
    await t.reposer();
    verifier("la sortie manuelle rallume le OK", pc.etatSequenceTour().okVisible === true);

    await pc.jouerSequenceTour(); await await A.jouerSequenceTour(); await t.reposer();
    verifier("et la file repart", t.avances.length > 0);
    verifier("les héros mis de côté ne comptent pas dans les postes attendus",
             (() => {
                 pc.PERSOS_PARTIE = pc.PERSOS_PARTIE.map(p => p.idJoueur === "poste-ipadB" ? { ...p, actif: false } : p);
                 return !pc.postesAttendusSequence().includes("poste-ipadB");
             })());
}

// =========================================================================
console.log("\n5. UNE CRÉATURE NE REJOUE PAS SON TOUR PENDANT L'ATTENTE");
// =========================================================================
{
    const t = table();
    await t.reposer();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"];

    verifier("avant le calcul, l'IA a le champ libre", pc.sequenceTourEnAttente() === false);
    await pc.sequenceRetientFinDeTour("M1");
    verifier("dès le calcul terminé, le poste qui tient l'IA se bloque lui-même",
             pc.sequenceTourEnAttente() === true);
    await t.reposer();
    verifier("les autres postes se bloquent aussi (l'annonce est en base)",
             A.sequenceTourEnAttente() === true);

    // La file avance : le verrou tombe de lui-même.
    for (const w of Object.values(t.postes)) await w.jouerSequenceTour();
    await t.reposer();
    verifier("une fois la file avancée, plus rien ne bloque", pc.sequenceTourEnAttente() === false);
}

// =========================================================================
console.log("\n6. LA VÉRIFICATION BASE → CLIENT AVANT DE SIGNER");
// =========================================================================
//  Un poste qui n'a pas encore reçu la technique annoncée ne signe pas à
//  l'aveugle : il attendrait de rejouer un tour qu'il ne sait pas lire.
{
    const t = table();
    await t.reposer();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"];

    A.CARTES_MANQUANTES = true;      // cet iPad n'a pas encore la carte de la goule
    await pc.sequenceRetientFinDeTour("M1");
    await t.reposer();

    verifier("le poste qui ne sait pas lire la carte ne signe pas",
             !(t.doc.Sequence_Tour.prets || []).includes("poste-ipadA"),
             `(${(t.doc.Sequence_Tour.prets || []).join(", ")})`);
    verifier("donc pas de OK doré nulle part", pc.etatSequenceTour().okVisible === false);

    A.CARTES_MANQUANTES = false;     // la carte arrive enfin
    t.notifier(); await t.reposer();
    verifier("une fois la carte reçue, il signe et le OK s'allume",
             (t.doc.Sequence_Tour.prets || []).includes("poste-ipadA") && pc.etatSequenceTour().okVisible);
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
    const retenu = await pc.sequenceRetientFinDeTour("M1");
    verifier("finDeTourCombat passe sans être retenue", retenu === false);
}

// =========================================================================
console.log("\n8. LE REJEU RETROUVE L'ÉTAT D'AVANT LE TOUR");
// =========================================================================
//  Le moteur d'animation applique les dégâts en RETRANCHANT ce qu'il lit. Un
//  rejeu qui démarre après le OK lit des points de vie que la base a déjà mis à
//  jour : sans photo d'avant, le spectateur retranchait une seconde fois et
//  voyait un blessé deux fois plus amoché que l'auteur.
{
    const t = table();
    await t.reposer();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"], B = t.postes["poste-ipadB"];

    // Le moteur, en miniature : il retranche 6 points à son point de départ.
    // Comme le vrai, il demande d'abord à la séquence la valeur d'AVANT le tour.
    const frapper = (w) => () => {
        const cible = w.PERSOS_PARTIE.find(p => p.idPersonnage === "H1");
        const depart = w.valeurAvantRejeu("H1", "PV_Actuels", cible.PV_Actuels);
        cible.PV_Actuels = Math.max(0, depart - 6);
    };
    [pc, A, B].forEach(w => {
        w.PERSOS_PARTIE.find(p => p.idPersonnage === "H1").PV_Actuels = 60;
    });

    // L'ordre d'animer arrive partout. L'auteur frappe tout de suite.
    [pc, A, B].forEach(w => w.programmerAnimationTour("carte", action(9001, { idCible: "H1" }), frapper(w)));
    pc.PERSOS_PARTIE.find(p => p.idPersonnage === "H1").PV_Actuels = 54;   // l'auteur a joué

    await pc.sequenceRetientFinDeTour("M1");
    await t.reposer();

    // Entre-temps, la base a livré aux spectateurs les points de vie D'APRÈS :
    // c'est exactement ce qui se passe, l'auteur les ayant écrits.
    // …et, dans la même livraison, une brûlure qui n'a RIEN à voir avec ce
    // tour-ci (le tic de fin du tour précédent). Elle ne doit pas disparaître.
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
    // Une SECONDE animation dans le même tour doit repartir de ce que la
    // première vient d'écrire, pas de ce que dit la base — qui porte déjà tout
    // le résultat de l'auteur.
    [pc, A, B].forEach(w => w.programmerAnimationTour("poussée", action(9002, { idCible: "H1" }), frapper(w)));
    await t.reposer();
    const pv2A = A.PERSOS_PARTIE.find(p => p.idPersonnage === "H1").PV_Actuels;
    verifier("une deuxième animation s'enchaîne sur la première, sans frapper deux fois",
             pv2A === 48, `(attendu 48, obtenu ${pv2A})`);

    verifier("l'état livré par la base pendant l'attente n'a pas été effacé",
             (A.PERSOS_PARTIE.find(p => p.idPersonnage === "H1").Etats_Alteres || []).length === 1,
             `(${JSON.stringify(A.PERSOS_PARTIE.find(p => p.idPersonnage === "H1").Etats_Alteres)})`);
}

// =========================================================================
console.log("\n9. UN ORDRE D'ANIMER REVENU EN RETARD DE LA BASE N'EST PAS PERDU");
// =========================================================================
//  L'acteur diffuse sa carte, puis l'écho lui revient de la base — parfois
//  APRÈS qu'il a vidé son propre tampon (encore vide à ce moment-là). S'il
//  publiait alors la simple liste de ce qu'il a rejoué, elle partirait vide :
//  tout le monde se déclarerait fini, la file avancerait, et la carte en retard
//  serait jetée avec la séquence — un poste l'aurait jouée, les autres non.
//  La liste se lit donc dans la base elle-même : ce qui a été DIFFUSÉ.
{
    const t = table();
    await t.reposer();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"], B = t.postes["poste-ipadB"];

    // L'acteur diffuse sa carte : l'ordre est écrit en base, mais personne ne
    // l'a encore reçu (l'écho traîne).
    await pc.modifierPartie(() => ({ maj: { Action_Moteur: { timestamp: 7777, idLanceur: "M1" } } }));
    await pc.sequenceRetientFinDeTour("M1");
    await t.reposer();

    verifier("les trois postes sont prêts malgré l'écho en retard",
             (t.doc.Sequence_Tour.prets || []).length === 3);

    // Tout le monde touche son écran : les tampons sont vides.
    for (const w of [pc, A, B]) await w.jouerSequenceTour();
    await t.reposer();

    verifier("la carte diffusée figure bien dans la liste annoncée",
             (t.doc.Sequence_Tour.actions || []).includes(7777),
             `(${JSON.stringify(t.doc.Sequence_Tour.actions)})`);
    verifier("et la file n'avance surtout pas : personne ne l'a encore jouée",
             t.avances.length === 0);

    // L'écho arrive enfin, chez les trois.
    [pc, A, B].forEach(w => w.programmerAnimationTour("carte", action(7777, { idLanceur: "M1" }), () => {}));
    await t.reposer();

    verifier("les trois l'ont alors rejouée",
             pc.JOUEES.join(">") === "carte" && A.JOUEES.join(">") === "carte" && B.JOUEES.join(">") === "carte",
             `(${pc.JOUEES.join(">")} / ${A.JOUEES.join(">")} / ${B.JOUEES.join(">")})`);
    verifier("et la file avance seulement là", t.avances.length > 0);
}

// =========================================================================
console.log("\n10. UN ORDRE ARRIVÉ AVANT L'OUVERTURE DE LA FENÊTRE COMPTE QUAND MÊME");
// =========================================================================
//  L'avancée de la file et l'ordre d'animer voyagent dans le MÊME document :
//  rien ne garantit dans quel ordre un poste les lit. S'il traite l'animation
//  en premier, elle partait hors séquence — jouée tout de suite sur cet
//  écran-là, mise en attente sur les autres — et plus personne ne savait
//  qu'elle avait été jouée : la table attendait un rejeu déjà fait.
{
    const t = table();
    const pc = t.postes["poste-pc"], A = t.postes["poste-ipadA"], B = t.postes["poste-ipadB"];

    // Aucun poste n'a encore ouvert sa séquence : la notification n'est pas
    // passée. L'ordre d'animer, lui, arrive déjà.
    verifier("au départ, aucune séquence n'est ouverte", pc.SEQUENCE_TOUR === null);
    [pc, A, B].forEach(w => w.programmerAnimationTour("carte", action(8801, { idLanceur: "M1" }), () => {}));

    verifier("l'ordre ouvre la séquence lui-même", !!pc.SEQUENCE_TOUR && pc.SEQUENCE_TOUR.acteur === "M1");
    verifier("et il est mis en attente, pas joué dans le vide",
             pc.JOUEES.length === 0 && pc.SEQUENCE_TOUR.tampon.length === 1);

    await pc.sequenceRetientFinDeTour("M1");
    await t.reposer();
    for (const w of [pc, A, B]) await w.jouerSequenceTour();
    await t.reposer();

    verifier("les trois l'ont rejoué et la file avance",
             pc.JOUEES.join(">") === "carte" && A.JOUEES.join(">") === "carte"
             && B.JOUEES.join(">") === "carte" && t.avances.length > 0);
}

// =========================================================================
console.log("\n11. UNE CRÉATURE NE REJOUE PAS SON TOUR PENDANT QUE LA FILE AVANCE");
// =========================================================================
//  Entre l'instant où la barrière tombe et celui où la file avance vraiment en
//  base, la tête de file désigne encore le combattant qui vient de jouer. L'IA
//  le voyait toujours « à la main », son propre verrou lui répondait oui, et la
//  créature repartait pour un second tour : une carte de plus, diffusée après
//  que tout le monde s'était déclaré fini, jouée sur un seul écran et perdue
//  sur les autres.
{
    const t = table();
    await t.reposer();
    const pc = t.postes["poste-pc"];

    [pc, t.postes["poste-ipadA"], t.postes["poste-ipadB"]]
        .forEach(w => w.programmerAnimationTour("carte", action(9101, { idLanceur: "M1" }), () => {}));
    await pc.sequenceRetientFinDeTour("M1");
    await t.reposer();
    for (const w of Object.values(t.postes)) await w.jouerSequenceTour();
    await t.reposer();

    // La file vient d'avancer côté barrière. On remet la tête sur M1, comme le
    // ferait une base qui n'a pas encore livré son instantané.
    t.doc.File_Attente_Combat = [{ idPersonnage: "M1", idCarte: "CARTE_M", initiative: 55, timestamp: 1000 }];
    t.doc.Phase_Combat = "Resolution";
    Object.values(t.postes).forEach(w => { w.PARTIE_DATA = JSON.parse(JSON.stringify(t.doc)); });

    verifier("la créature reste bloquée tant que la file n'a pas bougé",
             pc.sequenceTourEnAttente() === true);
    // Le poste qui a fait avancer la file a refermé sa fenêtre : elle ne doit
    // pas se rouvrir sur ce tour-là le temps que la base rattrape son retard.
    const meneur = Object.values(t.postes).find(w => (w.SEQUENCES_TERMINEES || []).length > 0);
    verifier("le poste qui a fait avancer la file garde la trace du tour bouclé", !!meneur);
    if (meneur) {
        verifier("et aucune fenêtre ne s'y rouvre sur ce tour déjà joué",
                 meneur.ouvrirSequenceTour(meneur.PARTIE_DATA) === null);
        verifier("sa créature reste bloquée elle aussi", meneur.sequenceTourEnAttente() === true);
    }
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
