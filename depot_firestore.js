// =========================================================================
//  LE DÉPÔT — LÀ OÙ LE CERVEAU POSE CE QU'IL A DÉCIDÉ
// =========================================================================
//
//  Le cerveau est pur : il calcule un pas et le rend. Il ne sait pas écrire.
//  Ce fichier est la seule chose qui sache écrire, et il ne sait rien décider.
//  C'est la même séparation que partout ailleurs ici, et elle a un intérêt
//  très concret : la partie qui décide se teste mille fois par seconde sans
//  réseau, et la partie qui écrit se teste contre un Firestore de banc qui
//  applique les vraies règles.
//
//  CE QUI DISPARAÎT EN ARRIVANT ICI
//  --------------------------------
//  Le compteur d'événements, et la transaction qui réservait les numéros.
//
//  Ce n'est pas une petite chose : ce compteur était le point de contention le
//  plus chaud du jeu, et la cause directe du `failed-precondition` qui faisait
//  rejouer des tours entiers. Il existait parce que TROIS postes publiaient
//  dans le même journal et qu'il fallait bien les départager.
//
//  Un seul poste écrit, désormais. Le numéro d'une entrée, c'est la version de
//  l'état qu'elle produit — `etat.version`, qui avance de un à chaque pas. Il
//  n'y a plus rien à réserver, donc plus rien à arbitrer. La publication passe
//  bien par une transaction (voir `publier`), mais elle ne réserve rien : elle
//  vérifie seulement, au moment d'écrire, que ce poste tient encore le cerveau.
//  Un seul écrivain, donc aucune contention en temps normal.
//
//  LA GARANTIE QUI TIENT TOUT
//  --------------------------
//  `publier` écrit l'état, l'entrée de journal et le marquage des intentions
//  DANS UN SEUL writeBatch. Firestore applique un lot en entier ou pas du tout.
//  Il n'existe donc aucun instant où l'état a avancé sans son entrée, ni où une
//  intention a produit son effet sans être refermée. Les deux bugs qui nous ont
//  coûté le plus — le journal en avance sur l'état, et l'intention rejouée —
//  ne sont pas corrigés : ils sont devenus inexprimables.
//
//  L'ACCÈS À FIRESTORE EST INJECTÉ
//  -------------------------------
//  Ce fichier ne fait aucun `import` de Firebase. On lui passe un objet `io`
//  qui sait lire, écrire, lister et écouter. Le vrai est fabriqué dans app.js,
//  qui tient déjà les identifiants ; celui des bancs range dans une carte en
//  mémoire et sait rater ses écritures à la demande.
// =========================================================================

const PARTIES = "Systeme_Parties";

// Les trois tiroirs du nouveau régime. Ils sont NEUFS et distincts de ceux de
// l'ancien : les deux régimes peuvent coexister sans se marcher dessus, ce qui
// est la condition pour pouvoir revenir en arrière en une ligne.
export const COL_ETAT = "Combat_Cerveau";
export const COL_JOURNAL = "Combat_Journal";
export const COL_INTENTIONS = "Combat_Intentions";

// Sur six chiffres, pour que l'ordre des noms de documents soit celui des
// nombres. Sans ça, « 10 » se range avant « 9 ».
export const numeroEntree = (v) => String(v).padStart(6, "0");

export const CHEMINS = {
    etat:       (p) => [PARTIES, p, COL_ETAT, "etat"],
    journal:    (p) => [PARTIES, p, COL_JOURNAL],
    entree:     (p, v) => [PARTIES, p, COL_JOURNAL, numeroEntree(v)],
    intentions: (p) => [PARTIES, p, COL_INTENTIONS],
    intention:  (p, id) => [PARTIES, p, COL_INTENTIONS, id]
};

const nombre = (v, defaut = 0) => {
    const n = parseInt(v);
    return Number.isFinite(n) ? n : defaut;
};

// =========================================================================
//  1. LES REQUÊTES — ET LA RÈGLE QU'ON NE VIOLERA PLUS JAMAIS
// =========================================================================
//  Firestore refuse une requête qui filtre par ÉGALITÉ sur un champ et borne
//  ou trie sur un AUTRE champ, tant qu'un index composite n'a pas été créé à la
//  main dans la console. On s'y est déjà brûlé une fois : l'écoute du journal
//  était refusée, plus aucun événement n'arrivait nulle part, et le combat se
//  jouait en base devant des écrans figés.
//
//  D'où deux règles, tenues ici et vérifiées au banc :
//    • le journal se filtre et se trie sur le SEUL champ `v` ;
//    • les intentions se filtrent sur le SEUL champ `traitee`, par égalité, et
//      ne se trient pas dans la requête — le tri par date d'arrivée se fait en
//      mémoire. Une égalité sur un seul champ n'a besoin d'aucun index
//      composite : c'est le tri ou la borne sur un AUTRE champ qui en réclame.
//
//  LES INTENTIONS SE LISAIENT ENTIÈRES, ET C'EST CE QUI A VIDÉ LE QUOTA.
//  L'idée était « la collection est minuscule, on écarte les traitées en
//  mémoire ». Elle ne l'est pas : chaque pas, chaque carte, chaque fin de tour
//  y dépose un document que rien ne retire avant la fin de la rencontre. Et le
//  cerveau la relisait à chaque battement, toutes les cinq secondes, même
//  quand personne ne jouait. Firestore facture un document lu par document
//  rendu : au bout d'une heure de combat, chaque battement coûtait des
//  dizaines de lectures, et le quota gratuit du jour (50 000) partait en une
//  soirée. Ensuite, plus aucune écriture ne passait — les cartes choisies ne
//  s'inscrivaient plus, et le combat ne se lançait pas. On ne lit donc plus
//  que celles qui attendent : en temps normal, aucune.

export const requeteJournal = (depuis) => ({ champ: "v", sup: nombre(depuis), tri: "v" });
export const requeteIntentions = () => ({ egal: { champ: "traitee", valeur: false } });

// Une intention en attente : ni traitée, ni refusée, rangées par date
// d'arrivée. La requête ne rend déjà que celles-là ; le filtre reste ici par
// prudence (un banc, un Firestore qui ignorerait l'égalité), et le tri ne peut
// vivre qu'ici — le demander à la requête réclamerait un index composite.
export const enAttente = (liste) => (liste || [])
    .filter(i => i && !i.traitee)
    .sort((a, b) => nombre(a.ts) - nombre(b.ts));

// =========================================================================
//  2. LE DÉPÔT DU CERVEAU
// =========================================================================
//  Les quatre fonctions que `creerCerveau` attend, et rien de plus.

export function creerDepot(io, idPartie, options) {
    const { tracer = () => {}, maintenant = () => Date.now() } = options || {};

    // CE QUE CE POSTE VIENT DE PUBLIER, GARDÉ EN MÉMOIRE.
    //
    // La publication passe par une transaction (voir `publier`), et une
    // transaction, contrairement à un writeBatch, N'EST PAS recopiée dans le
    // cache local : elle n'y arrive qu'au retour de l'écoute, quelques dizaines
    // de millisecondes plus tard. Le cerveau, qui enchaîne ses pas sans
    // attendre, relisait donc l'état d'AVANT : il recalculait le même pas, se le
    // faisait refuser (« publication du n°62 refusée »), et sa boucle s'arrêtait
    // là — le tour de la créature suivante ne partait jamais. C'est le combat
    // bloqué de la table.
    //
    // On garde donc le dernier état publié, et les intentions qu'il a fermées :
    // une lecture qui rend une version plus ANCIENNE du même combat est
    // simplement en retard, on lui préfère ce qu'on sait. À version égale, la
    // base l'emporte toujours — c'est elle qui dit si un autre poste a repris
    // la main.
    let dernierPublie = null;
    const fermeesIci = new Set();
    const copie = (v) => v == null ? v : JSON.parse(JSON.stringify(v));

    async function lireEtat() {
        const lu = await io.lire(CHEMINS.etat(idPartie));
        if (lu && dernierPublie && (lu.combat || "") === (dernierPublie.combat || "")
            && nombre(dernierPublie.version) > nombre(lu.version)) {
            return copie(dernierPublie);
        }
        return lu;
    }

    async function lireIntentions() {
        const toutes = await io.lister(CHEMINS.intentions(idPartie), requeteIntentions());
        return enAttente(toutes).filter(i => !fermeesIci.has(intentionId(i)));
    }

    // L'identifiant d'une intention, qu'elle le porte en champ ou seulement
    // dans son chemin de document.
    const intentionId = (i) => (i && (i.id || (i.__chemin && i.__chemin[i.__chemin.length - 1]))) || "";

    function retenir(etat, traitees) {
        dernierPublie = copie(etat);
        (traitees || []).forEach(id => { if (id) fermeesIci.add(id); });
        // Borné : ce n'est qu'un pont en attendant l'écoute, pas une archive.
        if (fermeesIci.size > 400) fermeesIci.delete(fermeesIci.values().next().value);
    }

    // LE SEUL ENDROIT DU JEU QUI ÉCRIT PENDANT UN COMBAT.
    //
    // Un lot, trois choses : l'état d'après, l'entrée qui raconte comment on y
    // est arrivé, et la fermeture des intentions qui l'ont provoquée. Si le lot
    // échoue, RIEN n'a bougé — l'état est celui d'avant, le journal n'a pas
    // d'entrée orpheline, et les intentions sont toujours en attente. Le
    // cerveau les reprendra au tour suivant et refera exactement le même calcul,
    // puisque la graine n'a pas avancé non plus.
    async function publier(etat, entree, traitees) {
        const ops = [
            { op: "set", chemin: CHEMINS.etat(idPartie), data: etat },
            // L'entrée porte l'identité de SA rencontre. Un écran n'a alors
            // aucune chance de rejouer le journal du combat d'avant : il ne
            // reconnaît pas l'identité et l'écarte, sans rien attendre.
            { op: "set", chemin: CHEMINS.entree(idPartie, entree.v),
              data: { ...entree, combat: etat.combat || "", horodatage: maintenant() } }
        ];
        (traitees || []).forEach(id => {
            if (!id) return;
            ops.push({ op: "update", chemin: CHEMINS.intention(idPartie, id),
                       data: { traitee: true, v: entree.v } });
        });

        // UN CERVEAU DESTITUÉ NE PUBLIE PLUS — et c'est ce qui manquait.
        //
        // Le lot s'écrivait « à l'aveugle ». Or un poste qui perd le réseau
        // continue de lire son cache (qui le dit toujours cerveau), de calculer,
        // et de publier : Firestore MET CES ÉCRITURES EN ATTENTE et les applique
        // à la reconnexion. Pendant ce temps, un autre poste a constaté le
        // silence et repris la main. Arrivé à la table : le PC publie son n°29
        // hors ligne, un iPad reprend et publie SON n°29 (20 étapes), le PC se
        // reconnecte et son lot en attente ÉCRASE l'entrée n°29 (8 étapes) et
        // l'état. Chacun a rejoué un n°29 différent : désynchronisation.
        //
        // Le lot passe donc par une transaction sur le document d'état, qui
        // relit la base AU MOMENT D'ÉCRIRE et n'écrit que si ce poste tient
        // toujours le cerveau ET que la base est exactement à la version dont
        // le pas est parti. Une transaction ne se met pas en attente hors
        // ligne : elle échoue, et rien n'a bougé.
        if (typeof io.lotSousCondition === "function") {
            const base = nombre(entree.v) - 1;
            const ecrit = await io.lotSousCondition(CHEMINS.etat(idPartie), (actuel) => {
                if (!actuel) return null;
                if ((actuel.cerveau || "") !== (etat.cerveau || "")) return null;
                if (nombre(actuel.version) !== base) return null;
                return ops;
            });
            if (!ecrit) {
                const err = new Error(`publication du n°${entree.v} refusée : ce poste ne tient plus le cerveau,`
                                      + " ou la base a avancé sans lui");
                err.code = "cerveau-destitue";
                throw err;
            }
            retenir(etat, traitees);
            return;
        }
        await io.lot(ops);
        retenir(etat, traitees);
    }

    // Un refus se marque comme un traitement — sinon l'intention reviendrait à
    // chaque tour de boucle et bloquerait la file derrière elle. Elle garde sa
    // raison, pour que le poste qui l'a envoyée puisse l'afficher au lieu de
    // rester devant un écran muet.
    async function refuser(id, raison, poste) {
        if (!id) return;
        // Le cerveau a déjà tracé le refus, en disant ce qu'il refusait. Inutile
        // de le redire à moitié : deux lignes pour un seul refus, dont une moins
        // renseignée que l'autre, se lisent comme deux refus.
        await io.lot([{ op: "update", chemin: CHEMINS.intention(idPartie, id),
                        data: { traitee: true, refus: raison || "refusée" } }]);
        fermeesIci.add(id);
    }

    // Le battement de cœur. Il n'écrit QUE ce champ — jamais l'état entier — pour
    // ne pas entrer en concurrence avec un pas en cours de publication.
    //
    // Avec le poste, il ne bat que si ce poste tient ENCORE le cerveau en base :
    // un battement mis en attente hors ligne, appliqué à la reconnexion, ferait
    // croire le nouveau cerveau vivant au nom de l'ancien.
    async function battre(quand, poste) {
        const op = { op: "update", chemin: CHEMINS.etat(idPartie), data: { battement: nombre(quand) } };
        if (poste && typeof io.lotSousCondition === "function") {
            await io.lotSousCondition(CHEMINS.etat(idPartie),
                (actuel) => (actuel && actuel.cerveau === poste) ? [op] : null);
            return;
        }
        await io.lot([op]);
    }

    // REPRENDRE LA MAIN, ET UN SEUL PEUT LA PRENDRE.
    //
    // C'est la même mécanique que la réclamation d'ouverture, et pour la même
    // raison : trois postes peuvent constater le silence du cerveau à la même
    // seconde. Firestore tranche, une fois, sur le document d'état lui-même —
    // il n'y a donc ni élection, ni négociation, ni verrou à côté.
    //
    // `decider` reçoit l'état tel qu'il est VRAIMENT en base et rend l'état à
    // écrire, ou null pour renoncer. On rend true si on a écrit.
    async function reprendre(decider) {
        if (typeof io.transaction !== "function") return false;
        return await io.transaction(CHEMINS.etat(idPartie), decider);
    }

    return { lireEtat, lireIntentions, publier, refuser, battre, reprendre };
}

// =========================================================================
//  3. CE QU'UN POSTE QUI N'EST PAS LE CERVEAU A LE DROIT D'ÉCRIRE
// =========================================================================
//  Une seule chose : une intention. Jamais un résultat, jamais un état, jamais
//  un point de vie. « Je veux aller là », et c'est tout.
//
//  C'est la différence de fond avec l'ancienne architecture, où n'importe lequel
//  des cent vingt-trois points d'écriture était accessible à n'importe lequel
//  des trois postes. Ici un client mal synchronisé, une page pas rechargée ou un
//  double-clic malheureux ne peuvent produire qu'une intention de plus — que le
//  cerveau validera ou refusera, mais qui ne peut pas abîmer l'état.

export function fabriquerIntention(source) {
    const { type, acteur, poste, quand = Date.now() } = source || {};
    // L'identité porte le poste et l'instant : deux intentions envoyées par deux
    // appareils ne peuvent pas se recouvrir, et un renvoi de la MÊME intention
    // (réseau qui hoquette, doigt qui glisse) tombe sur le même document — donc
    // ne compte qu'une fois. Le doublon est écrasé, pas ajouté.
    const id = source.id || `${poste || "?"}_${quand}_${Math.random().toString(36).slice(2, 7)}`;
    const intention = { ...source, id, type, acteur, poste, ts: quand, traitee: false };
    delete intention.quand;
    return intention;
}

export async function envoyerIntention(io, idPartie, intention) {
    const prete = fabriquerIntention(intention);
    await io.lot([{ op: "set", chemin: CHEMINS.intention(idPartie, prete.id), data: prete }]);
    return prete.id;
}

// =========================================================================
//  4. OUVRIR ET FERMER UN COMBAT
// =========================================================================
//  OUVRIR, c'est poser l'état de départ et faire table rase du reste. Le poste
//  qui ouvre devient le cerveau — c'est le seul moment où la main se donne
//  toute seule, et c'est voulu : celui qui lance le combat est là, devant son
//  écran, prêt à jouer.
//
//  L'ORDRE COMPTE. On efface AVANT d'écrire l'état neuf. Un poste qui verrait
//  l'état en version 0 alors que le journal contient encore les trois cents
//  entrées de la rencontre précédente croirait avoir trois cents entrées de
//  retard, et rejouerait le combat d'avant par-dessus celui-ci. C'est très
//  exactement le bug du curseur resté sur le journal purgé, par l'autre bout.

export async function faireTableRase(io, idPartie) {
    let efface = 0;
    for (const coll of [CHEMINS.journal(idPartie), CHEMINS.intentions(idPartie)]) {
        // Par paquets : un long combat laisse plusieurs centaines d'entrées, et
        // un lot Firestore en accepte 500 à la fois.
        for (let garde = 0; garde < 40; garde++) {
            const docs = await io.lister(coll, { limite: 400, avecChemin: true });
            if (!docs || docs.length === 0) break;
            await io.lot(docs.map(d => ({ op: "delete", chemin: d.__chemin })));
            efface += docs.length;
            if (docs.length < 400) break;
        }
    }
    return efface;
}

// OUVRIR, C'EST RÉCLAMER — ET UN SEUL PEUT L'OBTENIR.
//
// La première version laissait chaque poste ouvrir de son côté. En jeu, les
// trois voient la même notification au même instant, donc les trois ouvraient :
// le dernier faisait table rase du journal des autres, et un poste dont le
// curseur était déjà à 2 attendait pour toujours une entrée n°3 qui n'existait
// plus. Écran figé, sans rien dans la trace pour le dire.
//
// La réclamation passe donc par une TRANSACTION sur le document d'état, et
// Firestore tranche : exactement un gagnant, sans vote, sans horodatage, sans
// comparaison d'horloges. Ce n'est pas une élection — c'est un compare-et-pose,
// l'opération atomique qu'il fallait depuis le début.
//
// Les perdants ne font rien : ils liront l'état publié et suivront, comme
// n'importe quel spectateur.
export async function ouvrirCombat(io, idPartie, etat) {
    const chemin = CHEMINS.etat(idPartie);

    // Sans transaction disponible (un banc minimal), on retombe sur l'ancien
    // chemin : c'est moins sûr, mais ça reste juste quand un seul poste ouvre.
    if (typeof io.transaction !== "function") {
        await faireTableRase(io, idPartie);
        await io.lot([{ op: "set", chemin, data: etat }]);
        return etat;
    }

    const gagne = await io.transaction(chemin, (actuel) => {
        // Quelqu'un a déjà ouvert CETTE rencontre-ci : on ne la rouvre pas.
        // (Une rencontre précédente, si : son état n'a plus cours.)
        if (actuel && etat.combat && actuel.combat === etat.combat) return null;
        return etat;
    });
    if (!gagne) return null;

    // Le ménage vient APRÈS la réclamation, et il n'est plus critique : les
    // entrées de la rencontre d'avant portent une autre identité, donc elles
    // sont déjà inoffensives. C'est de l'hygiène, pas de la correction.
    await faireTableRase(io, idPartie);
    return etat;
}

// Fermer, c'est rendre la table propre pour la rencontre suivante. On garde
// l'état — il dit qui a gagné, et un poste qui arrive en retard doit pouvoir le
// lire — mais le journal et les intentions n'ont plus rien à raconter.
export async function fermerCombat(io, idPartie) {
    return await faireTableRase(io, idPartie);
}

// EFFACER, c'est autre chose que fermer : on retire aussi l'ÉTAT. C'est ce
// qu'une réinitialisation demande — la rencontre n'a pas eu lieu, il ne doit
// rien en rester.
//
// Ce n'est pas une précaution de principe. Tant que l'état d'une rencontre
// périmée traînait en base, la question « y a-t-il un combat publié ? »
// répondait oui, personne n'ouvrait la rencontre suivante, et le plateau ne
// démarrait pas — sans une ligne dans la trace pour le dire.
export async function effacerLeCombat(io, idPartie) {
    const efface = await faireTableRase(io, idPartie);
    await io.lot([{ op: "delete", chemin: CHEMINS.etat(idPartie) }]);
    return efface;
}

// =========================================================================
//  5. CE QU'UN ÉCRAN ÉCOUTE
// =========================================================================
//  Deux choses, et deux seulement : l'état publié, et les entrées qui suivent
//  son curseur.
//
//  C'est le point de bascule de toute l'architecture. Avant, chaque écran
//  écoutait la partie, les fiches, le plateau ET le journal — quatre réalités
//  qu'il fallait arbitrer en permanence, avec les sept mécanismes empilés qu'on
//  connaît. Ici il n'y en a plus qu'une, et le journal n'est même pas une
//  seconde source : c'est le CHEMIN qui mène d'un état au suivant.

export function ecouterCombat(io, idPartie, contexte) {
    const { surEtat = () => {}, surEntrees = () => {}, depuis = 0 } = contexte || {};

    // LA DISPARITION DE L'ÉTAT EST UNE NOUVELLE, PAS UN SILENCE.
    //
    // Ce `if (data)` avalait l'information la plus importante que ce document
    // puisse porter : « ce combat n'existe plus ». C'est ce que la
    // réinitialisation écrit (effacerLeCombat supprime le document), et l'écran
    // ne l'apprenait jamais : il restait figé sur le dernier tour vu, fenêtre
    // sombre comprise, sans plus rien qui puisse arriver. Un iPad y était
    // enfermé sans issue — pas de console pour s'en sortir.
    //
    // On transmet donc le `null` tel quel, et c'est à l'écoutant de savoir quoi
    // en faire.
    const arretEtat = io.ecouterDoc(CHEMINS.etat(idPartie), (data) => surEtat(data || null));

    const arretJournal = io.ecouterCollection(
        CHEMINS.journal(idPartie), requeteJournal(depuis),
        (docs) => surEntrees(docs || [])
    );

    return () => {
        try { arretEtat && arretEtat(); } catch (e) {}
        try { arretJournal && arretJournal(); } catch (e) {}
    };
}

// Le rattrapage d'un trou : on attend la 153, il arrive la 154. Le spectateur
// appelle ceci, et n'avance pas tant qu'il ne l'a pas.
export async function lireEntree(io, idPartie, v) {
    return await io.lire(CHEMINS.entree(idPartie, v));
}

// Tout ce qui suit un numéro donné, d'un coup. Sert à rejoindre un combat en
// cours, ou à se remettre à niveau après une longue absence — là où rejouer
// entrée par entrée prendrait dix minutes.
export async function lireDepuis(io, idPartie, depuis) {
    return await io.lister(CHEMINS.journal(idPartie), requeteJournal(depuis));
}

if (typeof window !== "undefined") {
    window.depotCombat = {
        COL_ETAT, COL_JOURNAL, COL_INTENTIONS, CHEMINS, numeroEntree,
        requeteJournal, requeteIntentions, enAttente,
        creerDepot, fabriquerIntention, envoyerIntention,
        faireTableRase, ouvrirCombat, fermerCombat, effacerLeCombat,
        ecouterCombat, lireEntree, lireDepuis
    };
}
