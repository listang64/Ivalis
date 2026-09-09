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
//  n'y a plus rien à réserver, donc plus rien à arbitrer, donc plus aucune
//  transaction. Zéro contention par construction, et non par réglage.
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
//    • les intentions ne se filtrent PAS du tout — la collection est minuscule,
//      on la lit entière triée par date d'arrivée et on écarte les traitées en
//      mémoire. Une requête qu'on ne fait pas est une requête qui ne peut pas
//      être refusée.

export const requeteJournal = (depuis) => ({ champ: "v", sup: nombre(depuis), tri: "v" });
export const requeteIntentions = () => ({ tri: "ts" });

// Une intention en attente : ni traitée, ni refusée. La distinction se fait
// ici, en mémoire, et jamais dans la requête.
export const enAttente = (liste) => (liste || []).filter(i => i && !i.traitee);

// =========================================================================
//  2. LE DÉPÔT DU CERVEAU
// =========================================================================
//  Les quatre fonctions que `creerCerveau` attend, et rien de plus.

export function creerDepot(io, idPartie, options) {
    const { tracer = () => {}, maintenant = () => Date.now() } = options || {};

    async function lireEtat() {
        return await io.lire(CHEMINS.etat(idPartie));
    }

    async function lireIntentions() {
        const toutes = await io.lister(CHEMINS.intentions(idPartie), requeteIntentions());
        return enAttente(toutes);
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
        await io.lot(ops);
    }

    // Un refus se marque comme un traitement — sinon l'intention reviendrait à
    // chaque tour de boucle et bloquerait la file derrière elle. Elle garde sa
    // raison, pour que le poste qui l'a envoyée puisse l'afficher au lieu de
    // rester devant un écran muet.
    async function refuser(id, raison, poste) {
        if (!id) return;
        tracer("🚫", `intention refusée : ${raison}`, poste || "");
        await io.lot([{ op: "update", chemin: CHEMINS.intention(idPartie, id),
                        data: { traitee: true, refus: raison || "refusée" } }]);
    }

    // Le battement de cœur. Il n'écrit QUE ce champ — jamais l'état entier — pour
    // ne pas entrer en concurrence avec un pas en cours de publication.
    async function battre(quand) {
        await io.lot([{ op: "update", chemin: CHEMINS.etat(idPartie),
                        data: { battement: nombre(quand) } }]);
    }

    return { lireEtat, lireIntentions, publier, refuser, battre };
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

    const arretEtat = io.ecouterDoc(CHEMINS.etat(idPartie), (data) => {
        if (data) surEtat(data);
    });

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
        faireTableRase, ouvrirCombat, fermerCombat,
        ecouterCombat, lireEntree, lireDepuis
    };
}
