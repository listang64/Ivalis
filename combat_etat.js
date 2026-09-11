// =========================================================================
//  L'ÉTAT DU COMBAT — LE NOYAU PUR
// =========================================================================
//
//  CE QUE CE FICHIER EST
//  ---------------------
//  Le socle de la nouvelle architecture, et le seul endroit du jeu qui ne
//  connaît NI Firebase, NI le navigateur, NI le temps qui passe. Rien ici ne
//  lit une base, n'écrit un document, ne touche au DOM, ne pose de minuteur.
//  Des objets qui entrent, des objets qui sortent.
//
//  C'est volontaire, et c'est tout l'enjeu : un combat entier peut se rejouer
//  ici en quelques millisecondes, dix mille fois de suite, sans réseau. Ce qui
//  ne peut pas être testé finit toujours par casser.
//
//  POURQUOI ON EN EST LÀ
//  ---------------------
//  L'ancienne architecture éparpillait le combat dans quatre endroits — la
//  partie (file, phase, manche), les fiches (points de vie, états), le plateau
//  (positions), le journal (animations) — chacun écrit séparément, par
//  n'importe lequel des trois appareils. Un état incohérent n'était donc pas un
//  bug : c'était une combinaison que le système savait fabriquer. Un héros mort
//  encore dans la file, un pion à deux endroits, un tour joué deux fois.
//
//  Ici, l'état du combat est UN SEUL OBJET. Firestore écrit un document en
//  entier ou pas du tout : une incohérence devient impossible à écrire.
//
//  LES TROIS CHOSES QUE CE FICHIER FOURNIT
//  ---------------------------------------
//   1. LA FORME de l'état, et de quoi le construire depuis l'ancien monde.
//   2. LES DÉS À GRAINE : le hasard voyage DANS l'état, donc un combat se
//      rejoue à l'identique. C'est ce qui transforme une partie qui a bugué en
//      banc d'essai, en copiant simplement son état de départ.
//   3. LES INVARIANTS : ce qui doit être vrai de tout état, à tout instant.
//      C'est le filet qui aurait attrapé les héros rayés de la file.
//
//  Le tout est exporté deux fois : en module ES (pour les bancs, qui importent
//  ce fichier directement et le testent sans rien simuler) et sur window (pour
//  le reste du jeu, qui travaille encore en variables globales).
// =========================================================================

// Le numéro de FORMAT de l'état. Il change quand la forme change, jamais
// autrement. Un poste dont la page n'a pas été rechargée lit un format qu'il ne
// connaît pas et refuse de jouer, au lieu de faire semblant — c'est exactement
// le bug des deux verrous qui ne se voyaient pas, rendu impossible.
export const FORMAT_ETAT = 1;

// =========================================================================
//  1. LES DÉS
// =========================================================================
//  Math.random() est l'ennemi du rejeu : deux exécutions ne donnent jamais la
//  même partie, et un combat qui a mal tourné ne peut pas être reproduit. Le
//  hasard devient donc une VALEUR, transportée dans l'état comme les points de
//  vie. Le cerveau tire ses dés depuis la graine, et la graine suivante part
//  avec le nouvel état.
//
//  L'algorithme est « mulberry32 » : trente-deux bits d'état, une poignée
//  d'opérations, une répartition irréprochable pour ce qu'on lui demande. Il
//  tient en six lignes et n'a aucune dépendance — deux qualités qui comptent
//  plus ici que la qualité cryptographique, dont on n'a aucun besoin.

export function creerDes(graine) {
    let a = (graine >>> 0) || 1;
    const suivant = () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
        // Un flottant dans [0,1[ — la brique de tout le reste.
        fraction: suivant,
        // Un entier de min à max INCLUS : c'est la forme qu'utilise le jeu.
        entier: (min, max) => min + Math.floor(suivant() * (max - min + 1)),
        // Le jet de pourcentage du jeu : 1 à 100.
        d100: () => 1 + Math.floor(suivant() * 100),
        // « Cet effet à 20 % de chances se produit-il ? »
        chance: (pourcent) => (1 + Math.floor(suivant() * 100)) <= (parseInt(pourcent) || 0),
        // Un tirage dans une liste, sans la modifier.
        parmi: (liste) => (liste && liste.length) ? liste[Math.floor(suivant() * liste.length)] : null,
        // La graine à ranger dans l'état d'après. Le prochain tirage repartira
        // exactement d'ici.
        graine: () => a >>> 0
    };
}

// =========================================================================
//  2. LA FORME D'UN COMBATTANT DANS L'ÉTAT
// =========================================================================
//  Un combattant ne porte ici QUE ce qui change pendant un combat, plus les
//  nombres dont le moteur a besoin pour trancher. Son portrait, son histoire,
//  son inventaire restent dans sa fiche : ils ne servent pas au calcul et
//  n'ont rien à faire dans un document réécrit à chaque tour.
//
//  Les statistiques sont FIGÉES à l'ouverture du combat, et c'est délibéré :
//  une rencontre se joue avec les valeurs du moment où elle commence. Sans
//  cela, un héros qui change d'armure au milieu d'un combat ferait diverger le
//  rejeu — l'histoire racontée par le journal ne redonnerait plus le même
//  résultat.

const CHAMPS_STATS = [
    "PV_Max", "Fatigue_Max", "Regeneration", "Esquive", "Parade", "Critique",
    "Def_Physique", "Def_Magique", "Bouclier_Max", "Competences_Max",
    "Dev_Mod_PV", "Dev_Mod_Fatigue", "Dev_Mod_Regen", "Dev_Mod_Esquive",
    "Dev_Mod_Parade", "Dev_Mod_Critique", "Dev_Mod_DefPhys", "Dev_Mod_DefMag",
    "Repos_Long", "Nombre_Actions"
];

const nombre = (v, defaut = 0) => {
    const n = parseInt(v);
    return Number.isFinite(n) ? n : defaut;
};

// Les défenses se CALCULENT (race, équipement, retouches de développement) et
// leurs formules vivent dans app.js. On ne les recopie pas ici — une formule
// écrite à deux endroits finit toujours par diverger. On fige leur RÉSULTAT au
// début du combat, en les appelant sur une fiche débarrassée de ses états
// altérés : ceux-ci vivent dans l'état, changent pendant la rencontre, et c'est
// le moteur qui ajoutera leur contribution au moment de trancher.
const DEFENSES_SIMPLES = {
    esquive:     f => nombre(f.Esquive) + nombre(f.Dev_Mod_Esquive),
    parade:      f => nombre(f.Parade) + nombre(f.Dev_Mod_Parade),
    defPhysique: f => nombre(f.Def_Physique) + nombre(f.Dev_Mod_DefPhys),
    defMagique:  f => nombre(f.Def_Magique) + nombre(f.Dev_Mod_DefMag),
    critique:    f => nombre(f.Critique) + nombre(f.Dev_Mod_Critique),
    // Les avantages du peuple, et ce que l'équipement change au déplacement.
    // Comme les défenses : on ne recopie pas les formules, on fige leur résultat.
    atouts:      () => ({}),
    bonusEquip:  () => 0,

    // LES MAXIMA SONT DES FORMULES, PAS DES CHAMPS. C'est ce que ce fichier a
    // appris à ses dépens : le premier vrai combat en nouveau régime a été
    // refusé par les invariants sur « 110 d'énergie pour un maximum de 100 ».
    // Le héros n'avait rien d'anormal — il était Humain, et l'atout de son
    // peuple donne +10 d'énergie maximale. La fiche porte 100, le jeu calcule
    // 110, et lire le champ brut donnait un combattant hors de ses propres
    // bornes avant même le premier tour.
    //
    // Les valeurs par défaut ci-dessous restent le calcul brut — c'est ce dont
    // un banc a besoin. Le jeu, lui, injecte ses vraies formules.
    pvMax:       f => nombre(f.PV_Max) + nombre(f.Dev_Mod_PV),
    fatigueMax:  f => nombre(f.Fatigue_Max !== undefined ? f.Fatigue_Max : f.fatigueMax, 100)
                    + nombre(f.Dev_Mod_Fatigue)
};

export function combattantDepuisFiche(fiche, position, regles) {
    const calcul = { ...DEFENSES_SIMPLES, ...(regles || {}) };
    const sansEtats = { ...fiche, Etats_Alteres: [] };
    const def = {
        esquive:  nombre(calcul.esquive(sansEtats)),
        parade:   nombre(calcul.parade(sansEtats)),
        physique: nombre(calcul.defPhysique(sansEtats)),
        magique:  nombre(calcul.defMagique(sansEtats)),
        critique: nombre(calcul.critique(sansEtats))
    };
    const race = calcul.atouts(fiche) || {};
    const atouts = {
        // Le Vargen se dérobe à une attaque d'opportunité, et se déplace pour
        // deux fois moins cher : deux règles qui vivent dans les atouts de race.
        esquiveOpportunite: nombre(race.esquiveOpportunite),
        diviseurDeplacement: nombre(race.diviseurDeplacement, 1) || 1,
        // L'Humain reprend dix points d'énergie de plus à chaque repos long.
        // Le repos se calcule maintenant chez le cerveau : son atout doit donc
        // voyager dans l'état, sinon il disparaît du jeu.
        bonusReposLong: nombre(race.bonusReposLong),
        // Ce à quoi ce peuple ne peut pas être soumis (l'Ondari et le feu,
        // l'Éthéré et le poison, l'Ankylar et l'Étourdi désormais) : une liste
        // de noms d'état, lue par le noyau au moment de poser une altération.
        immunites: Array.isArray(race.immunites) ? race.immunites : [],
        // L'Ophior reprend des points de vie à chaque fin de manche — la seule
        // race à en avoir, donc le seul atout de ce genre à porter un nombre.
        regenPv: nombre(race.regenPv)
    };
    const mod = {
        // Ce que l'ÉQUIPEMENT change, hors états altérés : le bouclier lourd
        // alourdit chaque case, le couteau l'allège, une arme offre un pas de
        // retraite après avoir frappé.
        coutDeplacement: nombre(calcul.bonusEquip(sansEtats, "coutDeplacement")),
        hexApresAttaque: nombre(calcul.bonusEquip(sansEtats, "hexApresAttaque"))
    };
    // Les maxima passent par les formules du jeu quand on les a. On les calcule
    // sur la fiche SANS ses états altérés, comme les défenses : un état qui
    // rabote l'énergie est l'affaire du moteur, pas celle de la borne.
    const bornes = { pvMax: nombre(calcul.pvMax(sansEtats)),
                     fatigueMax: nombre(calcul.fatigueMax(sansEtats)) };
    return { ...combattantBrut(fiche, position, bornes), def, atouts, mod };
}

function combattantBrut(fiche, position, bornes) {
    const stats = {};
    CHAMPS_STATS.forEach(c => { if (fiche[c] !== undefined) stats[c] = fiche[c]; });

    // Les bornes viennent des formules du jeu quand l'appelant les a calculées
    // (voir combattantDepuisFiche) ; sinon on retombe sur le calcul brut.
    const pvMax = bornes && bornes.pvMax !== undefined
        ? nombre(bornes.pvMax)
        : nombre(fiche.PV_Max) + nombre(fiche.Dev_Mod_PV);
    const fatigueMax = bornes && bornes.fatigueMax !== undefined
        ? nombre(bornes.fatigueMax)
        : nombre(fiche.Fatigue_Max !== undefined ? fiche.Fatigue_Max : fiche.fatigueMax, 100)
          + nombre(fiche.Dev_Mod_Fatigue);

    return {
        id: fiche.idPersonnage,
        nom: (fiche.prenom || fiche.nom || fiche.Nom_Personnage || fiche.idPersonnage || "").trim(),
        camp: fiche.camp || (fiche.estMonstre ? "Ennemi" : "Allié"),
        estMonstre: !!fiche.estMonstre,
        estIllusion: !!fiche.estIllusion,
        // Quel POSTE commande ce combattant. Vide pour une créature : c'est le
        // cerveau qui la joue, et lui seul.
        joueur: fiche.estMonstre ? "" : (fiche.idJoueur || ""),
        race: fiche.race || "",
        couleur: fiche.couleur || "",
        // Le caractère d'une créature : c'est lui qui décide si elle fonce, si
        // elle contourne, ou si elle refuse d'entrer dans les flammes.
        personnalite: fiche.Personnalite || "",
        // Sa stature (Petit/Normal/Élite/Boss) : le noyau pur en tire un bonus
        // fixe de dégâts et de soin (voir bonusMonstreDe, moteur_pur.js). Vide
        // pour un héros — il n'a pas de palier, et n'y a donc jamais droit.
        palier: fiche.Palier || fiche.palier || "",

        pv: nombre(fiche.PV_Actuels, pvMax),
        pvMax,
        bouclier: nombre(fiche.Bouclier_Actuel),
        fatigue: nombre(fiche.fatigueActuelle !== undefined ? fiche.fatigueActuelle
                                                            : fiche.Fatigue_Actuelle, fatigueMax),
        fatigueMax,

        // La case. `null` veut dire « pas sur le plateau » — un renfort qui
        // n'est pas encore entré, par exemple. Ce n'est pas la même chose que
        // la case (0,0), et les confondre a déjà coûté des pions fantômes.
        q: position ? nombre(position.q) : null,
        r: position ? nombre(position.r) : null,

        etats: JSON.parse(JSON.stringify(fiche.Etats_Alteres || [])),
        aTerre: fiche.statut === "Mort" || (pvMax > 0 && nombre(fiche.PV_Actuels, pvMax) <= 0),

        bouclierMax: nombre(fiche.Bouclier_Max),
        stats
    };
}

// =========================================================================
//  3. CONSTRUIRE L'ÉTAT DEPUIS L'ANCIEN MONDE
// =========================================================================
//  Le pont. Tant que la migration n'est pas finie, l'état se fabrique à partir
//  de ce que le jeu a déjà en mémoire : les fiches, le plateau, la partie. Une
//  fois le basculement fait, cette fonction ne servira plus qu'à OUVRIR un
//  combat — après quoi l'état ne vient plus que de lui-même.
//
//  Elle ne lit rien : on lui passe tout. C'est ce qui permet à un banc de la
//  nourrir avec des combattants inventés, sans navigateur.

export function construireEtatCombat(source) {
    const {
        idPartie = "",
        cerveau = "",
        // L'IDENTITÉ DE CETTE RENCONTRE-CI. Elle vient du jeu (ID_Rencontre,
        // posé quand les créatures sont générées) et voyage dans l'état ET dans
        // chaque entrée de journal. C'est ce qui rend un vieux journal
        // INOFFENSIF plutôt que dangereux : un écran ne rejoue que ce qui
        // appartient au combat qu'il regarde, et les entrées d'une rencontre
        // précédente sont simplement écartées.
        //
        // Sans elle, un poste dont le curseur était à 2 sur l'ancien combat
        // attendait éternellement une entrée n°3 dans un journal reparti de
        // zéro. C'est exactement l'écran qui se fige sur « le tour se prépare ».
        combat = "",
        graine = 1,
        combattants = [],          // les fiches, format front (persoDocVersFront)
        positions = {},            // TOKENS_VTT_DATA : { id: {q, r} }
        partie = {},               // PARTIE_DATA
        zones = {},                // ZONES_PERSISTANTES
        regles = null              // les vraies formules de défense, quand on les a
    } = source || {};

    const table = {};
    combattants.forEach(fiche => {
        if (!fiche || !fiche.idPersonnage) return;
        table[fiche.idPersonnage] = combattantDepuisFiche(fiche, positions[fiche.idPersonnage], regles);
    });

    return {
        format: FORMAT_ETAT,
        // La version s'incrémente de UN à chaque pas, jamais de deux. C'est ce
        // qui permet à un poste en retard de savoir exactement ce qu'il a raté.
        version: 0,
        partie: idPartie,
        combat: String(combat || ""),

        // Le poste qui a le droit d'écrire. Un seul, désigné, jamais élu.
        cerveau,
        battement: 0,

        graine: (graine >>> 0) || 1,

        phase: partie.Phase_Combat || "Preparation",
        manche: nombre(partie.Tour_Combat, 1),
        ordre: [...(partie.Ordre_Initiative || [])],
        file: (partie.File_Attente_Combat || []).map(f => ({
            id: f.idPersonnage,
            carte: f.idCarte || null,
            initiative: nombre(f.initiative, 0)
        })),
        ontJoue: [...(partie.Ont_Joue_Ce_Round || [])],

        combattants: table,
        zones: JSON.parse(JSON.stringify(zones || {}))
    };
}

// Une copie franche, sans lien avec l'original. Le cerveau travaille sur une
// copie : si le calcul échoue à mi-chemin, l'état d'avant est intact.
export function clonerEtat(etat) {
    return JSON.parse(JSON.stringify(etat));
}

export const combattant = (etat, id) => (etat && etat.combattants) ? etat.combattants[id] : undefined;

export const estADroit = (etat, id) => {
    const c = combattant(etat, id);
    return !!c && !c.aTerre;
};

export const occupantDe = (etat, q, r) => {
    if (!etat || !etat.combattants) return null;
    for (const id in etat.combattants) {
        const c = etat.combattants[id];
        if (!c.aTerre && c.q === q && c.r === r) return id;
    }
    return null;
};

// =========================================================================
//  4. APPLIQUER LES ÉTAPES
// =========================================================================
//  LE POINT LE PLUS IMPORTANT DU FICHIER.
//
//  Une entrée de journal contient des ÉTAPES : « ce pion va là », « celui-ci
//  perd neuf points de vie », « cet état est posé ». Cette fonction les
//  applique à un état et rend l'état d'après.
//
//  Elle est utilisée AUX DEUX BOUTS, et c'est là tout l'intérêt : le cerveau
//  s'en sert pour fabriquer l'état qu'il publie, et chaque écran s'en sert pour
//  suivre les animations qu'il rejoue. La même fonction, le même code, donc
//  forcément le même résultat. Il ne peut plus exister de « la base dit une
//  chose, l'écran en montre une autre » : c'est la même opération, faite deux
//  fois, sur les mêmes données.
//
//  Chaque étape porte le RÉSULTAT, jamais l'opération. On écrit « pvApres: 33 »
//  et non « retire 9 ». C'est ce qui rend le rejeu insensible à l'ordre et aux
//  répétitions : appliquer deux fois « pvApres: 33 » donne 33. L'ancienne
//  architecture soustrayait à la lecture, et un rejeu en retard retranchait une
//  seconde fois — c'est exactement d'où venaient les dégâts doublés.

const APPLICATEURS = {
    // Un hexagone franchi. Un pas, un événement : c'est ce qui permet à
    // l'animation de sauter de case en case au lieu de téléporter le pion.
    pas(etat, e) {
        const c = combattant(etat, e.acteur);
        if (!c || !e.vers) return;
        c.q = nombre(e.vers.q);
        c.r = nombre(e.vers.r);
        if (e.fatigueApres !== undefined) c.fatigue = nombre(e.fatigueApres);
    },

    // Un déplacement imposé : poussée, traction, bond. Même effet sur l'état,
    // un nom différent pour que l'écran choisisse la bonne animation.
    poussee(etat, e) { APPLICATEURS.pas(etat, e); },
    traction(etat, e) { APPLICATEURS.pas(etat, e); },
    bond(etat, e) { APPLICATEURS.pas(etat, e); },

    // Une technique part. Rien ne change dans l'état : ce sont les étapes
    // suivantes (dégâts, états, zones) qui portent ses conséquences. Cette
    // étape-là ne sert qu'à l'écran, pour montrer la carte et son ciblage.
    carte(etat, e) {
        const c = combattant(etat, e.acteur);
        if (!c) return;
        if (e.fatigueApres !== undefined) c.fatigue = nombre(e.fatigueApres);
    },

    // Points de vie et bouclier. Le RÉSULTAT, pas la soustraction.
    degats(etat, e) {
        const c = combattant(etat, e.cible);
        if (!c) return;
        if (e.bouclierApres !== undefined) c.bouclier = Math.max(0, nombre(e.bouclierApres));
        if (e.pvApres !== undefined) c.pv = Math.max(0, Math.min(c.pvMax, nombre(e.pvApres)));
        c.aTerre = c.pvMax > 0 && c.pv <= 0;
    },

    soin(etat, e) { APPLICATEURS.degats(etat, e); },

    // L'énergie dépensée ou reprise.
    fatigue(etat, e) {
        const c = combattant(etat, e.cible);
        if (!c || e.fatigueApres === undefined) return;
        c.fatigue = Math.max(0, Math.min(c.fatigueMax, nombre(e.fatigueApres)));
    },

    // Un état altéré posé ou levé. La liste complète est transmise : plus
    // simple à raisonner qu'une série d'ajouts et de retraits, et impossible à
    // désynchroniser.
    etats(etat, e) {
        const c = combattant(etat, e.cible);
        if (!c || !Array.isArray(e.liste)) return;
        c.etats = JSON.parse(JSON.stringify(e.liste));
    },

    // Un combattant tombe. Explicite, parce que « à terre » commande la file
    // d'initiative et qu'on ne veut plus jamais le déduire au petit bonheur.
    chute(etat, e) {
        const c = combattant(etat, e.cible);
        if (!c) return;
        c.aTerre = true;
        c.pv = 0;
    },

    // Une zone posée, réduite ou dissipée.
    zone(etat, e) {
        if (!etat.zones) etat.zones = {};
        if (e.retiree) delete etat.zones[e.id];
        else etat.zones[e.id] = JSON.parse(JSON.stringify(e.zone || {}));
    },

    // La file avance : le combattant en tête a fini son tour.
    tour(etat, e) {
        if (Array.isArray(e.file)) etat.file = JSON.parse(JSON.stringify(e.file));
        if (e.phase) etat.phase = e.phase;
        if (e.manche !== undefined) etat.manche = nombre(e.manche, etat.manche);
        if (Array.isArray(e.ontJoue)) etat.ontJoue = [...e.ontJoue];
    },

    // Un renfort entre en scène.
    arrivee(etat, e) {
        if (!e.combattant || !e.combattant.id) return;
        etat.combattants[e.combattant.id] = JSON.parse(JSON.stringify(e.combattant));
        if (Array.isArray(e.ordre)) etat.ordre = [...e.ordre];
    }
};

// UNE SEULE ÉTAPE. C'est ce dont le spectateur a besoin : il anime, puis il
// applique, puis il passe à la suivante — pour que l'écran raconte exactement ce
// qu'il montre, et jamais deux pas d'avance.
export function appliquerEtape(etat, etape) {
    const suivant = clonerEtat(etat);
    const appliquer = APPLICATEURS[etape && etape.type];
    if (appliquer) appliquer(suivant, etape);
    return suivant;
}

// Applique une entrée de journal complète et rend l'état d'après. L'original
// n'est jamais modifié : on travaille sur une copie, comme partout ici.
export function appliquerEntree(etat, entree) {
    const suivant = clonerEtat(etat);
    (entree && entree.etapes ? entree.etapes : []).forEach(e => {
        const appliquer = APPLICATEURS[e && e.type];
        if (appliquer) appliquer(suivant, e);
    });
    if (entree && entree.v !== undefined) suivant.version = nombre(entree.v, suivant.version);
    if (entree && entree.graine !== undefined) suivant.graine = (nombre(entree.graine, suivant.graine) >>> 0);
    return suivant;
}

// Le rattrapage d'un poste en retard : il applique les entrées manquantes dans
// l'ordre et arrive NÉCESSAIREMENT au même état que les autres. Ce n'est pas
// un réglage à ajuster, c'est une propriété de la fonction.
export function appliquerEntrees(etat, entrees) {
    return (entrees || [])
        .slice()
        .sort((a, b) => (a.v || 0) - (b.v || 0))
        .reduce((acc, entree) => appliquerEntree(acc, entree), etat);
}

export const TYPES_ETAPES = Object.keys(APPLICATEURS);

// =========================================================================
//  5. LES INVARIANTS
// =========================================================================
//  Ce qui doit être vrai de TOUT état, à TOUT instant. Chaque ligne de cette
//  fonction est un bug qu'on a vécu, ou qu'on aurait pu vivre.
//
//  Elle rend la liste de ce qui cloche — vide quand tout va bien. Le cerveau
//  la passe avant de publier : plutôt refuser d'écrire un état incohérent que
//  le diffuser à trois appareils. Et les bancs la passent après chaque pas,
//  sur des milliers de combats aléatoires.

export function verifierEtatCombat(etat) {
    const soucis = [];
    if (!etat || typeof etat !== "object") return ["l'état n'est pas un objet"];

    if (etat.format !== FORMAT_ETAT) {
        soucis.push(`format ${etat.format} au lieu de ${FORMAT_ETAT}`);
    }
    if (!Number.isFinite(etat.version) || etat.version < 0) {
        soucis.push(`version invalide : ${etat.version}`);
    }
    if (!etat.combattants || typeof etat.combattants !== "object") {
        return soucis.concat("aucune table de combattants");
    }

    const cases = {};
    Object.keys(etat.combattants).forEach(id => {
        const c = etat.combattants[id];
        if (c.id !== id) soucis.push(`${id} : la clé et l'identifiant ne correspondent pas (${c.id})`);

        // Les points de vie restent dans leurs bornes. Un dépassement, et les
        // jauges racontent n'importe quoi.
        if (!Number.isFinite(c.pv) || c.pv < 0) soucis.push(`${id} : pv = ${c.pv}`);
        if (c.pvMax > 0 && c.pv > c.pvMax) soucis.push(`${id} : ${c.pv} pv pour un maximum de ${c.pvMax}`);
        if (!Number.isFinite(c.fatigue) || c.fatigue < 0) soucis.push(`${id} : fatigue = ${c.fatigue}`);
        if (c.fatigueMax > 0 && c.fatigue > c.fatigueMax) {
            soucis.push(`${id} : ${c.fatigue} d'énergie pour un maximum de ${c.fatigueMax}`);
        }
        if (c.bouclier < 0) soucis.push(`${id} : bouclier = ${c.bouclier}`);

        // « À terre » et « zéro point de vie » disent la même chose. Les
        // laisser diverger, c'est le héros vivant rayé de la file d'initiative.
        const devraitEtreATerre = c.pvMax > 0 && c.pv <= 0;
        if (devraitEtreATerre && !c.aTerre) soucis.push(`${id} : à zéro pv mais pas marqué à terre`);
        if (!devraitEtreATerre && c.aTerre && c.pv > 0) {
            soucis.push(`${id} : marqué à terre avec ${c.pv} pv`);
        }

        // Deux combattants debout ne partagent pas une case.
        if (!c.aTerre && c.q !== null && c.q !== undefined) {
            const cle = `${c.q},${c.r}`;
            if (cases[cle]) soucis.push(`${id} et ${cases[cle]} occupent tous deux la case ${cle}`);
            else cases[cle] = id;
        }

        if (!Array.isArray(c.etats)) soucis.push(`${id} : les états ne sont pas une liste`);
    });

    // La file ne nomme que des combattants qui existent, une seule fois chacun,
    // et jamais quelqu'un qui est à terre.
    const vus = new Set();
    (etat.file || []).forEach(f => {
        if (!etat.combattants[f.id]) { soucis.push(`la file nomme ${f.id}, qui n'existe pas`); return; }
        if (vus.has(f.id)) soucis.push(`${f.id} est deux fois dans la file`);
        vus.add(f.id);
        if (etat.combattants[f.id].aTerre) soucis.push(`${f.id} est à terre et pourtant dans la file`);
    });

    if (etat.phase !== "Preparation" && etat.phase !== "Resolution") {
        soucis.push(`phase inconnue : ${etat.phase}`);
    }
    if (!Number.isFinite(etat.manche) || etat.manche < 1) soucis.push(`manche invalide : ${etat.manche}`);

    return soucis;
}

// =========================================================================
//  6. LE PONT VERS LE RESTE DU JEU
// =========================================================================
//  Le jeu travaille encore en variables globales. Ce bloc lui donne accès au
//  noyau sans que le noyau, lui, dépende de quoi que ce soit. Il disparaîtra le
//  jour où tout le combat sera passé de l'autre côté.

if (typeof window !== "undefined") {
    window.FORMAT_ETAT = FORMAT_ETAT;
    window.creerDes = creerDes;
    window.construireEtatCombat = construireEtatCombat;
    window.combattantDepuisFiche = combattantDepuisFiche;
    window.clonerEtat = clonerEtat;
    window.appliquerEtape = appliquerEtape;
    window.appliquerEntree = appliquerEntree;
    window.appliquerEntrees = appliquerEntrees;
    window.verifierEtatCombat = verifierEtatCombat;

    // Fabrique l'état à partir de ce que ce poste a sous la main. C'est le
    // point d'entrée qu'utilisera le cerveau pour ouvrir un combat.
    window.etatDepuisLeJeu = function(cerveau, graine) {
        return construireEtatCombat({
            idPartie: window.ID_PARTIE_COURANTE || "",
            cerveau: cerveau || (typeof localStorage !== "undefined"
                ? localStorage.getItem("ID_JOUEUR_COURANT") : "") || "",
            graine: graine || (Date.now() & 0x7fffffff),
            combattants: window.PERSOS_PARTIE || [],
            positions: window.TOKENS_VTT_DATA || {},
            partie: window.PARTIE_DATA || {},
            zones: window.ZONES_PERSISTANTES || {},
            // Les vraies formules du jeu, injectées : le noyau n'en connaît
            // aucune, il ne fait qu'appeler celles qu'on lui donne.
            regles: {
                esquive:     window.esquiveCombattant,
                parade:      window.paradeCombattant,
                defPhysique: window.defPhysiqueCombattant,
                defMagique:  window.defMagiqueCombattant,
                critique:    window.critiqueCombattant,
                atouts:      window.atoutRace,
                bonusEquip:  window.bonusEquip
            }
        });
    };

    // =====================================================================
    //  voirEtat() — LE COMBAT EN COURS, D'UN SEUL COUP D'ŒIL
    // =====================================================================
    //  Ce que le combat serait DÉJÀ s'il était rangé dans un seul document, et
    //  surtout : ce qui ne va pas dedans. À taper dans la console pendant une
    //  vraie partie, sur chaque appareil — deux tableaux qui ne se ressemblent
    //  pas, c'est une désynchronisation prise sur le fait.
    window.voirEtat = function() {
        const etat = window.etatDepuisLeJeu();
        const soucis = verifierEtatCombat(etat);

        console.log("%c===== ÉTAT DU COMBAT =====", "color:#c2a878; font-weight:bold");
        console.log(`partie ${etat.partie} · manche ${etat.manche} · ${etat.phase}`
                    + ` · format ${etat.format}`);
        console.log("file : " + (etat.file.map(f => f.id).join("  →  ") || "vide"));

        console.table(Object.values(etat.combattants).map(c => ({
            combattant: c.nom || c.id,
            camp: c.camp,
            pv: `${c.pv} / ${c.pvMax}`,
            bouclier: c.bouclier,
            énergie: `${c.fatigue} / ${c.fatigueMax}`,
            case: (c.q === null ? "—" : `${c.q},${c.r}`),
            "à terre": c.aTerre ? "oui" : "",
            états: (c.etats || []).map(e => e.nom).join(", "),
            poste: c.joueur || "(créature)"
        })));

        if (soucis.length === 0) {
            console.log("%c✅ Aucune incohérence.", "color:#7bd66a; font-weight:bold");
        } else {
            console.log("%c⚠️ " + soucis.length + " incohérence(s) :", "color:#e63946; font-weight:bold");
            soucis.forEach(s => console.log("   • " + s));
        }
        return etat;
    };
}
