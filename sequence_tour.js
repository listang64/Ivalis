// =========================================================================
//  LA SÉQUENCE DE TOUR — LE SCRIPT ET SA RELECTURE
// =========================================================================
//
//  LE PROBLÈME QU'ELLE RÈGLE
//  -------------------------
//  Chaque poste rejouait les animations d'un tour dès qu'il en recevait
//  l'ordre, et le premier qui avait fini faisait avancer la file. Sur trois
//  appareils inégaux — un PC qui suit tout, deux iPad que Safari endort dès
//  qu'on regarde ailleurs — le combattant suivant commençait son tour pendant
//  que les autres écrans en étaient encore au précédent : un déplacement
//  d'ennemi sauté, puis le même pion téléporté un tour plus tard.
//
//  LE PRINCIPE : UN SCRIPT, PUIS SA RELECTURE
//  ------------------------------------------
//  Un tour ne se diffuse plus morceau par morceau. Il s'ÉCRIT, en entier et
//  dans l'ordre, dans un document qui n'appartient qu'à lui —
//  Scripts_Tour/{partie__clé} — avec, pour chaque étape, tout ce qu'il faut
//  pour la rejouer à l'identique : la donnée de l'animation ET les points de
//  vie d'avant de ceux qu'elle touche.
//
//   1. LE POSTE QUI AGIT joue son tour normalement (c'est lui qui vise, qui se
//      déplace) et consigne chaque étape au fil de l'eau. Les autres attendent
//      derrière la fenêtre sombre — opaque : rien ne transparaît.
//   2. Le tour fini, il pose « complet » sur le script. Ce simple drapeau
//      allume le gros OK doré chez TOUT LE MONDE en même temps : il n'y a plus
//      d'échange de « prêt » d'un poste à l'autre, qui décalait le bouton d'un
//      appareil à l'autre.
//   3. Chaque poste rejoue le script POUR LUI, à son rythme : les étapes
//      s'enchaînent une par une, chacune attendant que la précédente ait
//      vraiment fini, avec un temps de respiration entre deux. Rien n'est plus
//      « temps réel » : c'est une relecture, et elle est identique partout.
//   4. Quand un poste a tout rejoué, il signe. Le dernier Check fait avancer la
//      file : à cet instant, les trois écrans racontent la même histoire.
//
//  Aucune minuterie ne passe un poste absent : la table reste en pause tant
//  qu'il n'est pas revenu. Une sortie de secours entièrement manuelle
//  (« Continuer sans les absents ») est offerte après une longue attente.
//
//  POURQUOI LES POINTS DE VIE D'AVANT SONT DANS LE SCRIPT
//  -----------------------------------------------------
//  Le moteur applique les dégâts en RETRANCHANT ce qu'il lit. Une relecture
//  démarre forcément après que l'auteur a écrit son résultat en base : elle
//  lisait les points de vie D'APRÈS et retranchait une seconde fois. L'auteur
//  note donc, dans l'étape elle-même, la valeur d'avant des combattants que
//  cette étape nomme. La relecture repart de là, sur tous les postes, sans rien
//  réécrire dans les combattants : ce que la base a livré entre-temps sur
//  d'autres — le tic d'une brûlure, l'énergie dépensée ailleurs — reste intact.
// =========================================================================

// L'état local de la séquence en cours sur CE poste.
window.SEQUENCE_TOUR = null;

// Les pions dont le trajet dort dans le script en attendant le OK : leur case à
// l'écran ne doit pas suivre la base, sinon ils se téléportent à l'arrivée
// avant même que la fenêtre ne se lève. Lu par positionsProtegees (combat.js).
window.PIONS_EN_ATTENTE_SEQUENCE = {};

// Le laissez-passer que la barrière pose avant de rappeler finDeTourCombat :
// sans lui, elle se retiendrait elle-même indéfiniment.
window.SEQUENCE_LAISSEZ_PASSER = false;

// Les tours déjà bouclés sur ce poste. Entre l'instant où la barrière tombe et
// celui où la file avance vraiment en base, la tête de file désigne encore le
// combattant qui vient de jouer : sans cette mémoire, l'IA le voyait toujours
// « à la main », son propre verrou lui répondait oui, et la créature rejouait
// un second tour.
window.SEQUENCES_TERMINEES = [];

// Le temps de respiration entre deux étapes d'une relecture. Assez pour que
// l'œil suive, assez court pour que le tour ne traîne pas.
window.DELAI_ENTRE_ETAPES_MS = 320;

let debutAttente = 0;

const monPoste = () => localStorage.getItem("ID_JOUEUR_COURANT") || "poste-inconnu";
const pause = (ms) => new Promise(r => setTimeout(r, ms));

function marquerSequenceTerminee(cle) {
    if (!cle || window.SEQUENCES_TERMINEES.includes(cle)) return;
    window.SEQUENCES_TERMINEES.push(cle);
    if (window.SEQUENCES_TERMINEES.length > 20) window.SEQUENCES_TERMINEES.shift();
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

// L'adresse du script en base. Un document par tour, dans sa collection.
window.idScriptTour = function(cle) {
    if (!cle || !window.ID_PARTIE_COURANTE) return null;
    return window.ID_PARTIE_COURANTE + "__" + String(cle).replace(/[^A-Za-z0-9_.-]/g, "_");
};

// =========================================================================
//  OUVERTURE / FERMETURE D'UNE SÉQUENCE
// =========================================================================
window.ouvrirSequenceTour = function(partie) {
    const p = partie || window.PARTIE_DATA || {};
    const cle = window.cleSequenceTour(p);
    const seq = window.SEQUENCE_TOUR;

    if (!cle) {
        if (seq) window.fermerSequenceTour();
        return null;
    }
    // Ce tour-là est déjà bouclé ici : on n'en rouvre pas une seconde fenêtre le
    // temps que la file avance en base.
    if (window.SEQUENCES_TERMINEES.includes(cle)) {
        if (seq) window.fermerSequenceTour();
        return null;
    }
    if (seq && seq.cle === cle) return seq;

    if (seq) window.fermerSequenceTour();

    const tete = (p.File_Attente_Combat || [])[0];
    const perso = (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === tete.idPersonnage);
    const estCreature = (typeof window.estMonstre === "function" && window.estMonstre(tete.idPersonnage))
                        || !!(perso && perso.estMonstre);

    // La fenêtre est pour ceux qui REGARDENT. Le poste qui FAIT jouer ce
    // combattant garde son plateau dégagé : c'est lui qui vise, qui déplace, et
    // c'est son écran qui sert de modèle au script. Pour un héros, c'est son
    // joueur ; pour une créature, celui qui tient le verrou de l'IA — il se
    // reconnaîtra tout seul en consignant sa première étape.
    const estMonHeros = !estCreature && !!perso && perso.idJoueur === monPoste();

    debutAttente = Date.now();
    window.SEQUENCE_TOUR = {
        cle,
        idScript: window.idScriptTour(cle),
        acteur: tete.idPersonnage,
        idCarte: tete.idCarte,
        tour: p.Tour_Combat || 1,
        voile: !estMonHeros,
        estActeur: estMonHeros,
        calculTermine: false,
        script: null,          // le document tel qu'il est en base
        etapesLocales: [],     // ce que l'auteur consigne au fil de l'eau
        jouees: 0,             // combien d'étapes ce poste a rejouées
        rejeuEnCours: false,
        clique: false,
        finiEnvoye: false,
        completEnvoye: false
    };

    // On écoute le script de ce tour-là, et lui seul.
    if (typeof window.ecouterScriptTour === "function" && window.SEQUENCE_TOUR.idScript) {
        const seqOuverte = window.SEQUENCE_TOUR;
        seqOuverte.arreterEcoute = window.ecouterScriptTour(seqOuverte.idScript, (data) => {
            if (window.SEQUENCE_TOUR !== seqOuverte) return;
            seqOuverte.script = data;
            if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
            window.verifierBarriereSequence();
        });
    }

    return window.SEQUENCE_TOUR;
};

window.fermerSequenceTour = function() {
    const seq = window.SEQUENCE_TOUR;
    if (seq && typeof seq.arreterEcoute === "function") {
        try { seq.arreterEcoute(); } catch (e) { /* écoute déjà close */ }
    }
    window.SEQUENCE_TOUR = null;
    window.PIONS_EN_ATTENTE_SEQUENCE = {};
    debutAttente = 0;
    if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
};

// =========================================================================
//  L'ÉCRITURE DU SCRIPT
// =========================================================================
//  Les points de vie et le bouclier d'avant : les deux seules valeurs que le
//  moteur obtient par soustraction. On ne note que les combattants que
//  l'étape NOMME — noter toute la table, ce serait figer au passage ce qui n'a
//  rien à voir avec ce tour.
const CHAMPS_AVANT = ["PV_Actuels", "Bouclier_Actuel"];
const CLES_COMBATTANTS = ["idLanceur", "idCible", "idToken", "idPersonnage", "cibles"];

function idsConcernes(donnee, trouves) {
    const ids = trouves || new Set();
    if (!donnee || typeof donnee !== "object") return ids;
    Object.keys(donnee).forEach(cle => {
        const valeur = donnee[cle];
        if (CLES_COMBATTANTS.includes(cle)) {
            if (typeof valeur === "string") ids.add(valeur);
            else if (Array.isArray(valeur)) valeur.forEach(v => { if (typeof v === "string") ids.add(v); });
        }
        if (valeur && typeof valeur === "object") idsConcernes(valeur, ids);
    });
    return ids;
}

function valeursAvant(ids) {
    const sortie = {};
    (window.PERSOS_PARTIE || []).forEach(p => {
        if (!p || !p.idPersonnage || !ids.has(p.idPersonnage)) return;
        const copie = {};
        CHAMPS_AVANT.forEach(c => { if (p[c] !== undefined) copie[c] = p[c]; });
        sortie[p.idPersonnage] = copie;
    });
    return sortie;
}

function enteteScript(seq, complet) {
    return {
        ID_Partie: window.ID_PARTIE_COURANTE,
        cle: seq.cle,
        acteur: seq.acteur,
        idCarte: seq.idCarte,
        tour: seq.tour,
        auteur: monPoste(),
        etapes: seq.etapesLocales,
        complet: !!complet,
        horodatage: Date.now()
    };
}

// LE POINT D'ENTRÉE DE L'ÉCRITURE. Appelé par le poste qui joue, chaque fois
// qu'il diffuse quelque chose à animer : déplacement, carte, bond, poussée,
// traction, peur. L'ordre des appels EST l'ordre du tour.
window.consignerEtapeTour = async function(type, donnee) {
    const seq = window.ouvrirSequenceTour(window.PARTIE_DATA);
    if (!seq || !seq.idScript || typeof window.ecrireScriptTour !== "function") return;

    // Consigner, c'est se désigner comme auteur du tour : personne d'autre
    // n'écrit dans ce script, et son écran sert de modèle aux autres.
    seq.estActeur = true;
    seq.voile = false;

    seq.etapesLocales.push({
        n: seq.etapesLocales.length,
        type,
        data: JSON.parse(JSON.stringify(donnee || {})),
        avant: valeursAvant(idsConcernes(donnee))
    });

    await window.ecrireScriptTour(seq.idScript, enteteScript(seq, false));
};

// =========================================================================
//  LA RELECTURE
// =========================================================================
//  Chaque étape attend que la précédente ait vraiment fini. Rien n'est joué en
//  parallèle, rien n'est joué « en même temps que les autres postes » : c'est
//  une relecture personnelle, et c'est exactement ce qui la rend identique
//  partout.
window.ETAT_AVANT_REJEU = null;

window.valeurAvantRejeu = function(idCombattant, champ, valeurCourante) {
    const avant = window.ETAT_AVANT_REJEU;
    if (!avant) return valeurCourante;
    const fiche = avant[idCombattant];
    if (!fiche || fiche[champ] === undefined) return valeurCourante;
    return fiche[champ];
};

const ANIMATIONS = {
    mouvement: (d) => window.jouerAnimationMouvement && window.jouerAnimationMouvement(d),
    carte:     (d) => window.jouerAnimationMoteur && window.jouerAnimationMoteur(d),
    bond:      (d) => window.jouerAnimationBond && window.jouerAnimationBond(d),
    poussee:   (d) => window.jouerAnimationPoussee && window.jouerAnimationPoussee(d),
    traction:  (d) => window.jouerAnimationPoussee && window.jouerAnimationPoussee(d),
    peur:      (d) => window.jouerAnimationPeur && window.jouerAnimationPeur(d)
};

window.rejouerScriptTour = async function() {
    const seq = window.SEQUENCE_TOUR;
    if (!seq || seq.rejeuEnCours) return;
    const script = seq.script;
    if (!script || !Array.isArray(script.etapes)) return;

    seq.rejeuEnCours = true;
    try {
        while (seq.jouees < script.etapes.length && window.SEQUENCE_TOUR === seq) {
            const etape = script.etapes[seq.jouees];
            seq.jouees++;

            const jouer = ANIMATIONS[etape.type];
            if (!jouer) continue;

            window.ETAT_AVANT_REJEU = etape.avant || null;
            try {
                await window.filerAnimation(etape.type, () => jouer(etape.data));
            } finally {
                window.ETAT_AVANT_REJEU = null;
            }
            // Le temps de respiration : l'étape suivante ne part pas sur les
            // talons de la précédente, et l'œil suit ce qui se passe.
            await pause(window.DELAI_ENTRE_ETAPES_MS);
        }
    } finally {
        seq.rejeuEnCours = false;
        window.ETAT_AVANT_REJEU = null;
    }

    if (window.SEQUENCE_TOUR !== seq) return;

    // Le tour est rejoué : les pions retrouvent la case que dit la base.
    window.PIONS_EN_ATTENTE_SEQUENCE = {};
    seq.finRejeu = Date.now();
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

    if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
    return window.rejouerScriptTour();
};

// =========================================================================
//  CE QUE LA FENÊTRE DOIT MONTRER
// =========================================================================
window.etatSequenceTour = function() {
    const seq = window.SEQUENCE_TOUR;
    if (!seq) return null;

    const script = seq.script;
    const complet = !!(script && script.complet);
    const attendus = window.postesAttendusSequence();
    const finis = (script && script.finis) || [];

    // Le clic a eu lieu : la fenêtre se lève et laisse voir la relecture.
    if (seq.clique) {
        const levee = { message: "", okVisible: false, forcerVisible: false, masquee: true };
        if (seq.rejeuEnCours || !seq.finRejeu) return levee;

        // Le rejeu est fini ici, mais la table attend encore quelqu'un. On ne
        // remonte la fenêtre qu'au bout de quelques secondes : une manche
        // normale se boucle bien plus vite, et un clignotement à chaque tour
        // serait insupportable.
        const resteAAttendre = !seq.finiEnvoye || !attendus.every(id => finis.includes(id));
        if (!resteAAttendre || (Date.now() - seq.finRejeu) < 3000) return levee;

        const retard = attendus.filter(id => !finis.includes(id)).length;
        return {
            message: "Tour rejoué — en attente de " + retard + " poste" + (retard > 1 ? "s" : "") + "…",
            okVisible: false,
            forcerVisible: (Date.now() - seq.finRejeu) > 25000
        };
    }

    if (!complet) {
        // Le poste qui joue peut avoir disparu en plein tour (une tablette
        // verrouillée, une page rechargée). Personne ne le passera tout seul,
        // mais après une longue attente la sortie manuelle doit être offerte.
        const nb = (script && Array.isArray(script.etapes)) ? script.etapes.length : 0;
        return {
            message: nb > 0 ? "Le tour s'écrit… (" + nb + " étape" + (nb > 1 ? "s" : "") + ")"
                            : "Le tour se prépare…",
            okVisible: false,
            forcerVisible: debutAttente > 0 && (Date.now() - debutAttente) > 45000
        };
    }

    // Le script est complet : le OK s'allume, partout, sur le même drapeau.
    return { message: "Touchez l'écran pour voir le tour", okVisible: true, forcerVisible: false };
};

// =========================================================================
//  LE POINT DE PASSAGE DE finDeTourCombat
// =========================================================================
//  Renvoyer vrai = « je retiens ce tour, ne fais pas avancer la file ».
window.sequenceRetientFinDeTour = async function(idQuiTermine) {
    if (window.SEQUENCE_LAISSEZ_PASSER) {
        window.SEQUENCE_LAISSEZ_PASSER = false;
        return false;
    }

    const seq = window.ouvrirSequenceTour(window.PARTIE_DATA);
    if (!seq) return false;
    if (idQuiTermine && idQuiTermine !== seq.acteur) return false;
    // Sans script en base (bancs d'essai, page partielle), rien à retenir.
    if (!seq.idScript || typeof window.ecrireScriptTour !== "function") return false;

    seq.estActeur = true;
    seq.voile = false;
    seq.calculTermine = true;

    // Le tour est écrit en entier : ce drapeau-là, et lui seul, allume le OK
    // doré sur tous les appareils au même instant.
    if (!seq.completEnvoye) {
        seq.completEnvoye = true;
        await window.ecrireScriptTour(seq.idScript, enteteScript(seq, true));
    }

    await window.verifierBarriereSequence();
    if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
    return true;
};

// =========================================================================
//  L'AVANCEMENT DE LA BARRIÈRE
// =========================================================================
window.verifierBarriereSequence = async function() {
    const seq = window.SEQUENCE_TOUR;
    if (!seq) return;

    const script = seq.script;
    if (!script || !script.complet) {
        if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
        return;
    }

    // 1. La relecture. Le poste qui a joué le tour l'a déjà vu en direct : il
    //    n'a rien à rejouer. Les autres attendent le doigt sur l'écran.
    if (seq.voile) {
        if (!seq.clique) {
            if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
            return;
        }
        if (seq.rejeuEnCours) return;
        if (seq.jouees < (script.etapes || []).length) { window.rejouerScriptTour(); return; }
    }

    // 2. CHECK « fini ». Il ne peut plus arriver trop tôt : le script est
    //    complet, et ce poste a rejoué toutes ses étapes.
    const attendus = window.postesAttendusSequence();
    const finis = script.finis || [];
    if (!seq.finiEnvoye) {
        seq.finiEnvoye = true;
        if (typeof window.signerScriptTour === "function") {
            await window.signerScriptTour(seq.idScript, monPoste());
        }
        return;
    }

    // 3. Tout le monde a rejoué : la file peut enfin avancer. Tous les postes
    //    tentent, la transaction de finDeTourCombat n'en laisse passer qu'un.
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
    if (!seq || !seq.idScript) return;

    const script = seq.script || {};
    const finis = script.finis || [];
    const manquants = window.postesAttendusSequence().filter(id => !finis.includes(id));
    if (manquants.length === 0 && script.complet) return;

    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (typeof window.ecrireScriptTour === "function") {
        await window.ecrireScriptTour(seq.idScript, {
            complet: true,
            finis: [...new Set([...finis, ...manquants])]
        });
    }
    await window.verifierBarriereSequence();
};

// =========================================================================
//  LA MISE EN SILENCE DES ANIMATIONS DIFFUSÉES
// =========================================================================
//  Les Action_* de la partie continuent d'exister : c'est par elles que le
//  poste qui JOUE voit son propre tour se dérouler. Mais un poste qui REGARDE
//  n'en fait plus rien — il rejouera le tour depuis son script, dans l'ordre,
//  après le OK. Sans ce filtre, les animations se déroulaient derrière la
//  fenêtre sombre, et on les devinait par transparence.
window.programmerAnimationTour = function(nom, action, fn) {
    if (!window.SEQUENCE_TOUR && typeof window.ouvrirSequenceTour === "function") {
        window.ouvrirSequenceTour(window.PARTIE_DATA);
    }
    const seq = window.SEQUENCE_TOUR;

    if (seq && seq.voile) {
        // Le pion concerné garde sa case à l'écran jusqu'à la relecture.
        if (action && action.idToken) window.PIONS_EN_ATTENTE_SEQUENCE[action.idToken] = true;
        if (action && action.idCible) window.PIONS_EN_ATTENTE_SEQUENCE[action.idCible] = true;
        if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
        return Promise.resolve();
    }

    return window.filerAnimation(nom, fn);
};

// =========================================================================
//  LE GARDE-FOU DE L'IA
// =========================================================================
//  Une créature dont le tour est écrit ne doit surtout pas le rejouer. Son
//  verrou, lui, répond toujours oui à qui le détient déjà : sans ce garde-fou
//  elle repartait pour un tour à chaque notification pendant toute l'attente.
window.sequenceTourEnAttente = function() {
    const cleCourante = window.cleSequenceTour();
    if (cleCourante && window.SEQUENCES_TERMINEES.includes(cleCourante)) return true;

    const seq = window.SEQUENCE_TOUR;
    if (!seq || !seq.cle) return false;
    if (seq.finiEnvoye) return true;
    if (seq.calculTermine) return true;
    return !!(seq.script && seq.script.complet);
};

// Appelé à chaque notification de la partie (app.js) : ouvre ou referme la
// séquence selon la tête de file, puis fait avancer la barrière d'un cran.
window.suivreSequenceTour = function(partie) {
    window.ouvrirSequenceTour(partie);
    if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
    return window.verifierBarriereSequence();
};
