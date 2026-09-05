// =========================================================================
//  LA SÉQUENCE DE TOUR — LES DEUX BARRIÈRES DE SYNCHRONISATION
// =========================================================================
//
//  LE PROBLÈME QU'ELLE RÈGLE
//  -------------------------
//  Jusqu'ici, chaque poste rejouait les animations d'un tour dès qu'il en
//  recevait l'ordre, et le premier qui avait fini faisait avancer la file
//  (finDeTourCombat). Sur trois appareils inégaux — un PC qui suit tout en
//  temps réel, deux iPad qui traînent et que Safari met en veille dès qu'on
//  regarde ailleurs — le combattant suivant commençait donc son tour pendant
//  que les autres écrans en étaient encore au précédent. D'où les symptômes
//  remontés : un déplacement d'ennemi sauté, puis le même pion téléporté un
//  tour plus tard.
//
//  LE PRINCIPE
//  -----------
//  On sectorise. Un tour de combat devient une SÉQUENCE en quatre temps, et
//  personne ne passe au temps suivant avant que tout le monde y soit :
//
//   1. CALCUL      Le poste qui agit (le joueur dont c'est le tour, ou celui
//                  qui tient le verrou de l'IA) calcule et diffuse tout le
//                  tour : déplacement, opportunités, zones, carte, dés. Chez
//                  les SPECTATEURS, la fenêtre sombre est déjà là et met tout
//                  ce qui arrive en attente au lieu de l'animer.
//   2. CHECK « prêt »   Le calcul terminé est annoncé en base. Chaque poste
//                  vérifie alors qu'il sait lire ce tour (le combattant, sa
//                  technique) — la vérification base → client — et signe.
//   3. OK DORÉ     Quand TOUS ont signé, le gros OK clignote partout. Un clic
//                  n'importe où sur la fenêtre rejoue les animations mises de
//                  côté, dans leur ordre d'arrivée.
//   4. CHECK « fini »   Chaque poste signe une seconde fois quand il a tout
//                  rejoué. Le dernier Check fait avancer la file.
//
//  Aucune minuterie ne passe un poste absent : la table reste en pause tant
//  qu'il n'est pas revenu. C'est voulu. Une sortie de secours entièrement
//  manuelle ("Continuer sans les absents") est offerte à qui la demande.
//
//  CE QUI VIT EN BASE (Systeme_Parties/{id}.Sequence_Tour)
//  ------------------------------------------------------
//    { cle, acteur, calcul, prets: [idJoueur], finis: [idJoueur],
//      actions: [horodatages] | null }
//  "calcul" passe à vrai quand l'acteur a fini de tout diffuser. "actions"
//  porte, à la fin du rejeu de l'acteur, la liste EXACTE des animations du
//  tour : un spectateur ne se déclare fini que lorsqu'il les a toutes jouées.
//  C'est ce qui referme la dernière course — un sous-effet (Poussée, Traction,
//  Peur) n'est calculé qu'au moment où la carte s'anime, donc il arrive APRÈS
//  l'annonce du calcul, et un poste rapide aurait pu se croire fini sans lui.
//
//  ET LA PHOTO D'AVANT
//  -------------------
//  Un rejeu qui attend le OK démarre forcément plus tard que celui de l'auteur,
//  qui a déjà écrit son résultat en base. Or le moteur applique les dégâts en
//  RETRANCHANT ce qu'il lit : il lisait alors les points de vie D'APRÈS et
//  retranchait une seconde fois. On photographie donc, à l'arrivée de chaque
//  ordre d'animer, les points de vie et le bouclier des seuls combattants que
//  cet ordre NOMME, et on les offre en lecture au moteur le temps du rejeu
//  (valeurAvantRejeu). Rien n'est jamais réécrit dans les combattants : ce que
//  la base a livré entre-temps sur d'autres — le tic d'une brûlure, l'énergie
//  dépensée par quelqu'un d'autre — reste intact.
// =========================================================================

// L'état local de la séquence en cours sur CE poste.
//   { cle, acteur, idCarte, tour, voile, estActeur, calculTermine,
//     tampon: [{nom, ts, fn}], jouees: [ts], drainEnCours, clique }
window.SEQUENCE_TOUR = null;

// Les pions dont le trajet dort dans le tampon : leur case à l'écran ne doit
// pas suivre la base tant que le déplacement n'a pas été rejoué ici, sinon ils
// se téléportent à l'arrivée avant même que le voile ne se lève. Lu par
// positionsProtegees (combat.js).
window.PIONS_EN_ATTENTE_SEQUENCE = {};

// Le laissez-passer que la barrière pose avant de rappeler finDeTourCombat :
// sans lui, elle se retiendrait elle-même indéfiniment.
window.SEQUENCE_LAISSEZ_PASSER = false;

// Les tours déjà bouclés sur ce poste. Entre l'instant où la barrière tombe et
// celui où la file avance vraiment en base, la tête de file désigne encore le
// combattant qui vient de jouer : sans cette mémoire, l'IA le voyait toujours
// « à la main », son propre verrou lui répondait oui, et la créature rejouait
// un second tour — une deuxième carte, diffusée après que tout le monde s'était
// déclaré fini, donc jouée sur un seul écran et perdue sur les autres.
window.SEQUENCES_TERMINEES = [];

function marquerSequenceTerminee(cle) {
    if (!cle || window.SEQUENCES_TERMINEES.includes(cle)) return;
    window.SEQUENCES_TERMINEES.push(cle);
    if (window.SEQUENCES_TERMINEES.length > 20) window.SEQUENCES_TERMINEES.shift();
}

// L'instant où ce poste a commencé à attendre les autres. Sert uniquement à
// proposer la sortie de secours manuelle, jamais à passer quoi que ce soit
// tout seul.
let debutAttente = 0;

const monPoste = () => localStorage.getItem("ID_JOUEUR_COURANT") || "poste-inconnu";

// Les six ordres d'animation que la partie sait diffuser.
//  Chaque ordre a, dans le document, son horodatage — et, sur chaque poste, le
//  souvenir du dernier qu'il a TRAITÉ (les DERNIER_*, tenus par le répartiteur
//  d'app.js). Comparer les deux dit exactement ce qui vient d'arriver et qui
//  n'a pas encore été distribué : c'est ce qui permet de reconnaître les ordres
//  de ce tour-ci sans dépendre de l'instant où la fenêtre s'est ouverte.
const CHAMPS_ACTIONS = {
    Action_Mouvement: "DERNIER_MOUVEMENT",
    Action_Moteur:    "DERNIER_ACTION_MOTEUR",
    Action_Bond:      "DERNIER_ACTION_BOND",
    Action_Poussee:   "DERNIER_ACTION_POUSSEE",
    Action_Traction:  "DERNIER_ACTION_TRACTION",
    Action_Peur:      "DERNIER_ACTION_PEUR"
};

// Ce que ce poste a DÉJÀ distribué. Lu sur les repères du répartiteur, et non
// sur le document : le document, lui, porte peut-être déjà l'ordre de ce tour
// alors que personne ne l'a encore vu passer, et on le croirait à tort ancien.
function horodatagesDejaTraites() {
    const sortie = {};
    Object.keys(CHAMPS_ACTIONS).forEach(c => { sortie[c] = window[CHAMPS_ACTIONS[c]] || 0; });
    return sortie;
}

// Ce que CE TOUR a diffusé : les ordres reçus depuis l'ouverture de la fenêtre,
// PLUS ceux qui dorment encore dans le document sans avoir été distribués.
//   Sans cette seconde moitié, l'acteur publiait la liste de ce qu'il avait
//   lui-même rejoué — et il pouvait très bien vider un tampon encore vide,
//   l'écho de sa propre carte n'étant pas revenu de la base. La liste partait
//   incomplète, tout le monde se déclarait fini, la file avançait, et la carte
//   en retard était jetée avec la séquence : un poste l'avait jouée, les autres
//   non, et leurs écrans divergeaient pour de bon.
function actionsDiffuseesDuTour(seq) {
    const ts = new Set(seq.recues || []);
    const p = window.PARTIE_DATA || {};
    const avant = seq.avant || {};
    Object.keys(CHAMPS_ACTIONS).forEach(c => {
        const dans = (p[c] && p[c].timestamp) || 0;
        if (dans && dans !== avant[c]) ts.add(dans);
    });
    return [...ts];
}

// =========================================================================
//  QUI L'ON ATTEND
// =========================================================================
//  Un poste = un joueur, quel que soit son nombre de héros. Les héros mis de
//  côté (Actif = false) ne comptent pas : c'est précisément la manette qui
//  permet de jouer sans un absent. Les créatures n'ont pas de poste.
window.postesAttendusSequence = function() {
    const postes = new Set();
    (window.PERSOS_PARTIE || []).forEach(p => {
        if (!p || p.estIllusion) return;
        if (p.actif === false) return;
        if (p.camp === "Ennemi" || p.estMonstre) return;
        if (typeof window.estMonstre === "function" && window.estMonstre(p.idPersonnage)) return;
        if (p.idJoueur) postes.add(p.idJoueur);
    });
    // Un poste sans héros lisible (une partie qui démarre, un banc d'essai) ne
    // doit pas s'attendre lui-même dans le vide : il se compte au minimum.
    postes.add(monPoste());
    return [...postes];
};

// La clé d'un tour : elle change au combattant suivant, et deux passages du
// même combattant à deux tours différents ne se confondent pas.
window.cleSequenceTour = function(partie) {
    const p = partie || window.PARTIE_DATA || {};
    if ((p.Phase_Combat || "Preparation") !== "Resolution") return null;
    const tete = (p.File_Attente_Combat || [])[0];
    if (!tete) return null;
    if (typeof window.estCombattantMort === "function" && window.estCombattantMort(tete.idPersonnage)) return null;
    return [p.Tour_Combat || 1, tete.idPersonnage, tete.idCarte, tete.timestamp || 0].join("|");
};

// =========================================================================
//  OUVERTURE / FERMETURE D'UNE SÉQUENCE
// =========================================================================
//  Appelée à chaque notification de la partie. Elle n'écrit rien : la séquence
//  s'ouvre toute seule, de la même façon, sur chaque poste, à partir de la file
//  d'attente. La base ne sert qu'aux deux Check.
window.ouvrirSequenceTour = function(partie) {
    const p = partie || window.PARTIE_DATA || {};
    const cle = window.cleSequenceTour(p);
    const seq = window.SEQUENCE_TOUR;

    if (!cle) {
        if (seq) window.fermerSequenceTour();
        return null;
    }
    // Ce tour-là est déjà bouclé ici : on n'en rouvre pas une seconde fenêtre le
    // temps que la file avance en base. Un ordre attardé se joue alors tout de
    // suite, comme avant, plutôt que de dormir dans un tampon que personne ne
    // videra jamais.
    if (window.SEQUENCES_TERMINEES.includes(cle)) {
        if (seq) window.fermerSequenceTour();
        return null;
    }
    if (seq && seq.cle === cle) return seq;

    // Un nouveau combattant en tête : la séquence précédente est close, quoi
    // qu'il lui reste dans le ventre. Ce qui n'a pas été rejoué appartient au
    // passé — le rejouer maintenant ajouterait de la confusion.
    if (seq) window.fermerSequenceTour();

    const tete = (p.File_Attente_Combat || [])[0];
    const perso = (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === tete.idPersonnage);
    const estCreature = (typeof window.estMonstre === "function" && window.estMonstre(tete.idPersonnage))
                        || !!(perso && perso.estMonstre);

    // La fenêtre est pour ceux qui REGARDENT. Le joueur dont c'est le tour garde
    // son plateau dégagé : il doit viser, se déplacer, choisir. Une créature
    // n'appartient à personne — tout le monde la regarde donc, y compris le
    // poste qui la fait jouer, dont le tampon se videra comme les autres.
    const estMonHeros = !estCreature && !!perso && perso.idJoueur === monPoste();

    debutAttente = Date.now();
    window.SEQUENCE_TOUR = {
        cle,
        // Les ordres d'animation que ce poste avait déjà distribués avant ce
        // tour : tout ce qui arrivera ensuite lui appartient, et devra être
        // rejoué partout.
        avant: horodatagesDejaTraites(),
        // Et ceux qu'il reçoit pendant, qu'il les joue tout de suite ou non.
        recues: [],
        acteur: tete.idPersonnage,
        idCarte: tete.idCarte,
        tour: p.Tour_Combat || 1,
        voile: !estMonHeros,
        estActeur: false,
        calculTermine: false,
        tampon: [],
        jouees: [],
        drainEnCours: false,
        clique: false,
        pretEnvoye: false,
        finiEnvoye: false,
        actionsPubliees: false
    };
    return window.SEQUENCE_TOUR;
};

window.fermerSequenceTour = function() {
    window.SEQUENCE_TOUR = null;
    window.PIONS_EN_ATTENTE_SEQUENCE = {};
    debutAttente = 0;
    if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
};

// =========================================================================
//  LA MISE EN ATTENTE DES ANIMATIONS
// =========================================================================
//  Tous les ordres d'animation diffusés par la base passent par ici (app.js).
//  Derrière la fenêtre sombre, ils s'empilent au lieu de partir tout de suite.

// LE POINT DÉLICAT DE TOUTE L'ARCHITECTURE.
//  Le moteur d'animation applique les dégâts en RETRANCHANT : « points de vie
//  actuels moins les dégâts ». C'était juste tant que tout le monde animait au
//  même instant — avant que l'auteur n'ait eu le temps d'écrire le résultat en
//  base. Mais un rejeu qui attend le OK démarre bien plus tard : la base a déjà
//  livré les points de vie D'APRÈS, et retrancher une seconde fois les dégâts
//  donnait un blessé deux fois plus amoché sur les écrans des spectateurs.
//  D'où la photo : les deux seules valeurs que le moteur obtient par
//  soustraction, prises à l'arrivée de l'ordre d'animer, et relues par lui au
//  moment du rejeu comme point de départ. Elles ne sont jamais réécrites dans
//  les combattants — voir valeurAvantRejeu, plus bas.
const CHAMPS_PHOTO = ["PV_Actuels", "Bouclier_Actuel"];

// Les combattants QUE CETTE ACTION NOMME, et eux seuls. Photographier toute la
// table serait pire que le mal : une nouvelle venue de la base concernant
// quelqu'un d'étranger à ce tour — l'énergie d'une créature, la brûlure de
// quelqu'un d'autre — serait effacée au rejeu et ne reviendrait jamais.
const CLES_COMBATTANTS = ["idLanceur", "idCible", "idToken", "idPersonnage", "cibles"];

function idsConcernes(action, trouves) {
    const ids = trouves || new Set();
    if (!action || typeof action !== "object") return ids;
    Object.keys(action).forEach(cle => {
        const valeur = action[cle];
        if (CLES_COMBATTANTS.includes(cle)) {
            if (typeof valeur === "string") ids.add(valeur);
            else if (Array.isArray(valeur)) valeur.forEach(v => { if (typeof v === "string") ids.add(v); });
        }
        if (valeur && typeof valeur === "object") idsConcernes(valeur, ids);
    });
    return ids;
}

// La photo se complète au fil du tour : un combattant n'y entre qu'à l'instant
// où une action le nomme pour la première fois — c'est-à-dire avant que le
// moindre effet de ce tour n'ait pu l'atteindre sur cet écran.
function photographierCombattants(ids, photo) {
    const sortie = photo || {};
    (window.PERSOS_PARTIE || []).forEach(p => {
        if (!p || !p.idPersonnage) return;
        if (!ids.has(p.idPersonnage)) return;
        if (sortie[p.idPersonnage]) return;
        const copie = {};
        CHAMPS_PHOTO.forEach(c => { if (p[c] !== undefined) copie[c] = p[c]; });
        sortie[p.idPersonnage] = copie;
    });
    return sortie;
}

// Une animation vient de rendre la main : ce qu'elle a écrit devient le point de
// départ de la suivante. Sans cette mise à jour, la deuxième animation d'un même
// tour repartait de ce que disait la base — c'est-à-dire du résultat déjà écrit
// par l'auteur — et retranchait ses dégâts une seconde fois.
//   Mais SEULS les combattants que cette animation-là nommait sont repris : la
//   base a très bien pu livrer, pendant qu'elle se déroulait, le résultat d'une
//   AUTRE animation du même tour, encore à rejouer ici. La recopier serait
//   exactement l'erreur qu'on cherche à éviter, une étape plus loin.
function rafraichirPhotoApresAnimation(photo, ids) {
    if (!photo || !ids) return;
    (window.PERSOS_PARTIE || []).forEach(p => {
        const entree = p && photo[p.idPersonnage];
        if (!entree || !ids.has(p.idPersonnage)) return;
        CHAMPS_PHOTO.forEach(c => { if (p[c] !== undefined) entree[c] = p[c]; });
    });
}

// La photo n'est JAMAIS réécrite dans les combattants : ce serait effacer, au
// passage, tout ce que la base a livré entre-temps et qui n'a rien à voir avec
// ce tour — une brûlure qui vient de faire son tic, l'énergie dépensée par
// quelqu'un d'autre. Elle est seulement OFFERTE EN LECTURE au moteur, qui s'en
// sert comme point de départ de sa soustraction (voir valeurAvantRejeu, lu par
// moteur_effets.js). Le résultat écrit reste, lui, la vraie valeur d'après.
window.ETAT_AVANT_REJEU = null;

window.valeurAvantRejeu = function(idCombattant, champ, valeurCourante) {
    const photo = window.ETAT_AVANT_REJEU;
    if (!photo) return valeurCourante;
    const avant = photo[idCombattant];
    if (!avant || avant[champ] === undefined) return valeurCourante;
    return avant[champ];
};

window.programmerAnimationTour = function(nom, action, fn) {
    // L'ordre d'animer peut arriver avant que la notification qui ouvre la
    // séquence n'ait été traitée — les deux voyagent dans le même document, et
    // rien ne garantit l'ordre dans lequel un poste les lit. On ouvre donc la
    // séquence ici si besoin : sans cela l'animation partait hors séquence,
    // jouée tout de suite sur cet écran-là et mise en attente sur les autres,
    // et personne ne savait plus qu'elle avait été jouée — la table restait en
    // attente d'un rejeu déjà fait.
    if (!window.SEQUENCE_TOUR && typeof window.ouvrirSequenceTour === "function") {
        window.ouvrirSequenceTour(window.PARTIE_DATA);
    }

    const seq = window.SEQUENCE_TOUR;
    const ts = (action && action.timestamp) || Date.now();
    // Le même ordre ne se joue jamais deux fois dans le même tour. Le
    // répartiteur a bien son garde-fou, mais il ne coûte rien de le doubler
    // ici : une animation rejouée, ce sont des dégâts appliqués deux fois sur
    // un seul écran, et deux tables qui ne racontent plus la même histoire.
    if (seq && seq.recues.includes(ts)) return Promise.resolve();
    // Reçu pendant ce tour : il en fait partie, qu'il parte tout de suite ou
    // qu'il attende le OK. C'est cette liste que l'acteur publiera.
    if (seq) seq.recues.push(ts);

    // Pas de fenêtre sur ce poste (c'est mon tour), ou pas de séquence du tout :
    // on joue comme avant, en notant tout de même ce qui a été joué.
    if (!seq || !seq.voile) {
        if (seq) seq.jouees.push(ts);
        return window.filerAnimation(nom, fn);
    }

    // La photo appartient au TOUR, pas à chaque étape : les animations
    // s'enchaînent, et chacune doit repartir de ce que la précédente a laissé.
    // Seuls les combattants encore absents de la photo y sont ajoutés.
    const concernes = idsConcernes(action);
    seq.photo = photographierCombattants(concernes, seq.photo || {});
    seq.tampon.push({ nom, ts, fn, concernes });

    // Un déplacement en attente gèle la case du pion concerné : sans ça la base
    // le pose à l'arrivée avant même que la fenêtre ne se lève.
    if (action && action.idToken) window.PIONS_EN_ATTENTE_SEQUENCE[action.idToken] = true;
    if (action && action.idLanceur) window.PIONS_EN_ATTENTE_SEQUENCE[action.idLanceur] = true;
    if (action && action.idCible) window.PIONS_EN_ATTENTE_SEQUENCE[action.idCible] = true;

    // Le tampon a bougé alors que le rejeu tournait déjà (un sous-effet calculé
    // en pleine animation de carte), ou après qu'il se soit vidé (l'écho d'une
    // carte revenu en retard de la base) : il faut le reprendre là où il s'est
    // arrêté, sans quoi cette animation-là resterait sur le carreau.
    if (seq.drainEnCours || seq.clique) window.viderTamponSequence();
    else if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();

    return Promise.resolve();
};

// =========================================================================
//  LE REJEU, DANS L'ORDRE
// =========================================================================
window.viderTamponSequence = async function() {
    const seq = window.SEQUENCE_TOUR;
    if (!seq || seq.drainEnCours) return;
    seq.drainEnCours = true;

    try {
        // La boucle relit le tampon à chaque tour : une animation peut en
        // engendrer une autre (Poussée, Traction, Peur), qui doit s'enchaîner
        // à la suite plutôt que d'être perdue.
        // Le moteur repart des points de vie D'AVANT le tour, pas de ceux que la
        // base a déjà livrés (voir la note au-dessus de programmerAnimationTour).
        // La photo reste en place pendant TOUT le rejeu, et se met à jour après
        // chaque animation : elles s'enchaînent alors les unes sur les autres,
        // exactement comme chez l'auteur. La laisser figée sur la seule première
        // laissait la deuxième repartir de la base, qui portait déjà le résultat.
        window.ETAT_AVANT_REJEU = seq.photo || null;

        while (seq.tampon.length > 0 && window.SEQUENCE_TOUR === seq) {
            const etape = seq.tampon.shift();
            seq.jouees.push(etape.ts);
            await window.filerAnimation(etape.nom, etape.fn);
            rafraichirPhotoApresAnimation(seq.photo, etape.concernes);
        }
    } finally {
        seq.drainEnCours = false;
        window.ETAT_AVANT_REJEU = null;
    }

    if (window.SEQUENCE_TOUR !== seq) return;

    // Le trajet est joué : les pions retrouvent la case que dit la base.
    window.PIONS_EN_ATTENTE_SEQUENCE = {};
    seq.finDrain = Date.now();
    await window.verifierBarriereSequence();
};

// Le clic sur la fenêtre : il ne vaut que quand le OK doré est là.
window.jouerSequenceTour = function(event) {
    if (event && event.target && event.target.id === "voile-tour-forcer") return;
    const seq = window.SEQUENCE_TOUR;
    if (!seq || !seq.voile || seq.clique) return;

    const etape = window.etatSequenceTour();
    if (!etape || !etape.okVisible) return;

    seq.clique = true;
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    // La fenêtre s'efface le temps du spectacle, et ne revient que si la
    // barrière suivante fait encore attendre.
    if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
    return window.viderTamponSequence();
};

// =========================================================================
//  CE QUE LA FENÊTRE DOIT MONTRER
// =========================================================================
window.etatSequenceTour = function() {
    const seq = window.SEQUENCE_TOUR;
    if (!seq) return null;

    const dbs = (window.PARTIE_DATA || {}).Sequence_Tour || null;
    const aJour = !!dbs && dbs.cle === seq.cle;
    const prets = aJour ? (dbs.prets || []) : [];
    const attendus = window.postesAttendusSequence();
    const manquants = attendus.filter(id => !prets.includes(id));
    const calcul = seq.calculTermine || (aJour && !!dbs.calcul);

    // Le clic a eu lieu : la fenêtre se lève et laisse voir le plateau. C'est
    // tout l'intérêt du bouton — le spectacle se joue derrière.
    if (seq.clique) {
        const levee = { message: "", okVisible: false, forcerVisible: false, masquee: true };
        if (seq.drainEnCours || seq.tampon.length > 0 || !seq.finDrain) return levee;

        // Le rejeu est fini ici, mais la table attend encore quelqu'un. On ne
        // remonte la fenêtre qu'au bout de quelques secondes : une manche
        // normale se boucle bien plus vite, et un clignotement à chaque tour
        // serait insupportable. Passé ce délai, il vaut mieux dire pourquoi
        // rien ne bouge que de laisser le plateau muet.
        const finis = aJour ? (dbs.finis || []) : [];
        const resteAAttendre = !seq.finiEnvoye || !attendus.every(id => finis.includes(id));
        if (!resteAAttendre || (Date.now() - seq.finDrain) < 3000) return levee;

        const retard = attendus.filter(id => !finis.includes(id)).length;
        return {
            message: "Rejeu terminé — en attente de " + retard + " poste" + (retard > 1 ? "s" : "") + "…",
            okVisible: false,
            forcerVisible: (Date.now() - seq.finDrain) > 25000
        };
    }

    if (!calcul) {
        // Le poste qui calcule peut avoir disparu en plein tour (une tablette
        // verrouillée, une page rechargée). Personne ne le passera tout seul,
        // mais après une longue attente la sortie manuelle doit être offerte —
        // sans elle, la table resterait devant « calcul en cours » pour de bon.
        return { message: "Calcul du tour en cours…", okVisible: false,
                 forcerVisible: debutAttente > 0 && (Date.now() - debutAttente) > 45000 };
    }

    if (manquants.length > 0) {
        // Aucune minuterie ne passe personne : on se contente de dire qui manque,
        // et de proposer la sortie manuelle après une longue attente.
        const assezAttendu = debutAttente > 0 && (Date.now() - debutAttente) > 30000;
        return {
            message: "En attente de " + manquants.length + " poste" + (manquants.length > 1 ? "s" : "") + "…",
            okVisible: false,
            forcerVisible: assezAttendu
        };
    }

    return { message: "Touchez l'écran pour voir le tour", okVisible: true, forcerVisible: false };
};

// =========================================================================
//  LES DEUX CHECK
// =========================================================================
//  Une seule écriture pour les deux, sous transaction : deux postes qui signent
//  au même instant ne s'effacent pas l'un l'autre.
async function signerSequence(champs) {
    const seq = window.SEQUENCE_TOUR;
    if (!seq || typeof window.modifierPartie !== "function") return;
    const moi = monPoste();
    const cle = seq.cle;

    await window.modifierPartie((data) => {
        let s = data.Sequence_Tour || null;
        // Une séquence d'un autre tour traîne encore : on repart de zéro plutôt
        // que d'ajouter nos signatures aux siennes.
        if (!s || s.cle !== cle) {
            s = { cle, acteur: seq.acteur, calcul: false, prets: [], finis: [], actions: null };
        } else {
            s = { ...s, prets: [...(s.prets || [])], finis: [...(s.finis || [])] };
        }

        if (champs.calcul) s.calcul = true;
        if (champs.pret && !s.prets.includes(moi)) s.prets.push(moi);
        if (champs.fini && !s.finis.includes(moi)) s.finis.push(moi);
        if (Array.isArray(champs.actions)) s.actions = champs.actions;
        if (Array.isArray(champs.postesForces)) {
            champs.postesForces.forEach(id => {
                if (!s.prets.includes(id)) s.prets.push(id);
                if (!s.finis.includes(id)) s.finis.push(id);
            });
            s.calcul = true;
            if (!Array.isArray(s.actions)) s.actions = [];
        }

        return { maj: { Sequence_Tour: s } };
    });
}

// LE POINT DE PASSAGE de finDeTourCombat. Renvoyer vrai = « je retiens ce tour,
// ne fais pas avancer la file ».
window.sequenceRetientFinDeTour = async function(idQuiTermine) {
    if (window.SEQUENCE_LAISSEZ_PASSER) {
        window.SEQUENCE_LAISSEZ_PASSER = false;
        return false;
    }

    const seq = window.ouvrirSequenceTour(window.PARTIE_DATA);
    // Pas de séquence lisible (un combattant à terre qu'on saute, une phase de
    // préparation, un banc d'essai) : rien à retenir.
    if (!seq) return false;
    if (idQuiTermine && idQuiTermine !== seq.acteur) return false;

    // C'est ce poste qui a calculé le tour : c'est donc lui qui annoncera aux
    // autres que le calcul est bouclé, et qui publiera la liste des animations.
    seq.estActeur = true;
    seq.calculTermine = true;

    await signerSequence({ calcul: true });
    await window.verifierBarriereSequence();
    if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
    return true;
};

// =========================================================================
//  L'AVANCEMENT DE LA BARRIÈRE
// =========================================================================
//  Rappelée à chaque notification de la partie et à la fin de chaque rejeu.
//  Elle ne fait qu'une chose à la fois, et toujours la plus en amont.
window.verifierBarriereSequence = async function() {
    const seq = window.SEQUENCE_TOUR;
    if (!seq) return;

    const dbs = (window.PARTIE_DATA || {}).Sequence_Tour || null;
    const aJour = !!dbs && dbs.cle === seq.cle;
    const calcul = seq.calculTermine || (aJour && !!dbs.calcul);

    // 1. Tant que le tour n'est pas calculé, il n'y a rien à signer.
    if (!calcul) return;

    // 2. CHECK « prêt » : la vérification base → client. Ce poste sait-il lire ce
    //    qu'on lui annonce — le combattant, et sa technique ? S'il ne les a pas
    //    encore reçus, il attend le prochain instantané plutôt que de signer à
    //    l'aveugle et de rejouer un tour qu'il ne comprend pas.
    if (!seq.pretEnvoye) {
        const perso = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === seq.acteur);
        // La lecture de la carte est refaite ici plutôt qu'empruntée à combat.js :
        // une barrière qui dépendrait d'un module absent bloquerait la table
        // entière au lieu de la protéger.
        const carte = (window.COMPETENCES_CACHE || {})[seq.idCarte]
                   || ((window.CACHE_COMPETENCES_GLOBAL || {})[seq.acteur] || {})[seq.idCarte];
        const carteLisible = seq.idCarte === "REPOS_LONG" || !!carte;
        if (!perso || !carteLisible) {
            if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
            return;
        }
        seq.pretEnvoye = true;
        await signerSequence({ pret: true });
        if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
        return;
    }

    const attendus = window.postesAttendusSequence();
    const prets = aJour ? (dbs.prets || []) : [];
    // 3. Tous prêts ? Sinon le OK doré ne s'allume pas — et on attend, sans
    //    limite de temps : « reste en pause tant que le joueur n'est pas revenu ».
    if (!attendus.every(id => prets.includes(id))) {
        if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
        return;
    }

    // 4. Le rejeu. Sans fenêtre (c'est mon tour, j'ai tout vu en direct) il n'y a
    //    rien à rejouer et rien à attendre. Avec fenêtre, il faut le clic.
    if (seq.voile && !seq.clique) {
        if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
        return;
    }
    if (seq.drainEnCours) return;
    if (seq.tampon.length > 0) { window.viderTamponSequence(); return; }

    // 5. L'acteur publie la liste exacte des animations du tour, une fois qu'il a
    //    lui-même tout rejoué : c'est elle qui dit aux autres quand ils ont fini.
    if (seq.estActeur && !seq.actionsPubliees) {
        if (seq.publicationEnCours) return;
        seq.publicationEnCours = true;
        try {
            // Le joueur dont c'est le tour a tout vu en direct : ses animations
            // peuvent encore tourner au moment où il appuie sur "fin du tour",
            // et un sous-effet (Poussée, Peur…) part au beau milieu de
            // l'animation d'une carte. On laisse donc sa file retomber avant de
            // figer la liste, sinon les autres postes se croiraient finis sans
            // avoir rejoué ce sous-effet.
            if (!seq.voile) {
                for (let i = 0; i < 2; i++) {
                    try { await window.FILE_ANIMATIONS; } catch (e) { /* déjà signalée ailleurs */ }
                    await new Promise(r => setTimeout(r, 100));
                }
            }
            if (window.SEQUENCE_TOUR !== seq) return;
            // Ce que ce tour a DIFFUSÉ, pas seulement ce que ce poste a déjà
            // rejoué : l'écho d'une carte peut n'être pas encore revenu de la
            // base, et la liste partirait alors incomplète.
            const attendues = new Set([...seq.jouees, ...actionsDiffuseesDuTour(seq)]);
            seq.actionsPubliees = true;
            await signerSequence({ actions: [...attendues] });
        } finally {
            seq.publicationEnCours = false;
        }
        return;
    }

    // 6. CHECK « fini ». Un spectateur ne signe que lorsqu'il a joué TOUTES les
    //    animations annoncées : un sous-effet arrivé en retard le retient encore.
    const annoncees = aJour && Array.isArray(dbs.actions) ? dbs.actions : null;
    if (!annoncees) return;
    if (!annoncees.every(ts => seq.jouees.includes(ts))) {
        if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
        return;
    }
    if (!seq.finiEnvoye) {
        seq.finiEnvoye = true;
        await signerSequence({ fini: true });
        return;
    }

    // 7. Tout le monde a rejoué : la file peut enfin avancer. Tous les postes
    //    tentent, la transaction de finDeTourCombat n'en laisse passer qu'un.
    const finis = aJour ? (dbs.finis || []) : [];
    if (!attendus.every(id => finis.includes(id))) {
        if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
        return;
    }

    const acteur = seq.acteur;
    marquerSequenceTerminee(seq.cle);
    window.fermerSequenceTour();
    window.SEQUENCE_LAISSEZ_PASSER = true;
    if (typeof window.finDeTourCombat === "function") {
        await window.finDeTourCombat(true, acteur);
    }
    window.SEQUENCE_LAISSEZ_PASSER = false;
};

// La sortie de secours, entièrement à la main : elle signe à la place des
// postes manquants. Rien ne la déclenche tout seul.
window.forcerSequenceTour = async function(event) {
    if (event && event.stopPropagation) event.stopPropagation();
    const seq = window.SEQUENCE_TOUR;
    if (!seq) return;

    const dbs = (window.PARTIE_DATA || {}).Sequence_Tour || null;
    const aJour = !!dbs && dbs.cle === seq.cle;
    const prets = aJour ? (dbs.prets || []) : [];
    const finis = aJour ? (dbs.finis || []) : [];
    // On force les deux Check à la fois : un poste peut très bien avoir signé le
    // premier avant de disparaître, et ne jamais signer le second.
    const manquants = window.postesAttendusSequence()
        .filter(id => !prets.includes(id) || !finis.includes(id));
    if (manquants.length === 0) return;

    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    await signerSequence({ postesForces: manquants });
    await window.verifierBarriereSequence();
};

// =========================================================================
//  LE GARDE-FOU DE L'IA
// =========================================================================
//  Une créature dont le tour est calculé mais pas encore validé par tous ne
//  doit surtout pas le rejouer. Sans ce verrou, le poste qui tient l'IA
//  reprenait la main à chaque notification (son propre verrou lui répond
//  toujours oui) et la créature jouait son tour en boucle pendant l'attente.
window.sequenceTourEnAttente = function() {
    // Un tour déjà bouclé dont la file n'a pas encore avancé : la créature ne
    // doit pas le rejouer sous prétexte qu'elle est toujours en tête.
    const cleCourante = window.cleSequenceTour();
    if (cleCourante && window.SEQUENCES_TERMINEES.includes(cleCourante)) return true;

    const seq = window.SEQUENCE_TOUR;
    if (!seq || !seq.cle) return false;
    // Ce poste a déjà tout rejoué et signé : sa part est faite, il n'y a plus
    // rien à calculer pour ce tour, seulement à attendre les autres.
    if (seq.finiEnvoye) return true;
    if (seq.calculTermine) return true;
    const dbs = (window.PARTIE_DATA || {}).Sequence_Tour || null;
    return !!(dbs && dbs.cle === seq.cle && dbs.calcul);
};

// Appelé à chaque notification de la partie (app.js) : ouvre ou referme la
// séquence selon la tête de file, puis fait avancer la barrière d'un cran.
window.suivreSequenceTour = function(partie) {
    window.ouvrirSequenceTour(partie);
    if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
    return window.verifierBarriereSequence();
};
