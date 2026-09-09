// =========================================================================
//  LE JOURNAL D'ÉVÉNEMENTS DU COMBAT — ÉCRITURE, RELECTURE, RATTRAPAGE
// =========================================================================
//
//  LE PROBLÈME
//  -----------
//  Le combat se diffusait « action par action » dans le document de la partie :
//  un champ Action_Mouvement, un champ Action_Moteur… Chaque poste animait dès
//  qu'il recevait, et le premier qui avait fini faisait avancer la file. Rien
//  ne garantissait ni l'ORDRE d'arrivée, ni qu'un poste avait bien tout reçu.
//  Sur trois appareils inégaux — un PC qui suit tout, deux iPad que Safari
//  endort dès qu'on regarde ailleurs — on obtenait des déplacements sautés, des
//  pions téléportés un tour plus tard, et des écrans qui ne racontaient plus la
//  même histoire.
//
//  LE PRINCIPE : UN JOURNAL NUMÉROTÉ
//  ---------------------------------
//  Tout ce qui se passe devient un ÉVÉNEMENT NUMÉROTÉ, écrit dans sa propre
//  collection : Evenements_Combat/{partie}_000152.
//
//   1. Le poste qui joue CALCULE (dés, dégâts, états, cases) et PUBLIE :
//        152 = la goule se déplace
//        153 = la goule frappe Pliors — 18 dégâts
//        154 = au tour de Jade
//   2. Tous les appareils écoutent le journal.
//   3. Chacun rejoue les événements DANS L'ORDRE DE LEUR NUMÉRO, un par un,
//      chacun attendant que le précédent ait vraiment fini, avec un temps de
//      respiration entre deux. L'animation n'est plus « temps réel » : c'est la
//      représentation locale d'un événement déjà tranché.
//   4. Un numéro manquant se voit immédiatement — on attend 153 et il arrive
//      154 — et se rattrape par une lecture directe. Aucun poste ne saute une
//      étape, même après une mise en veille.
//
//  Firebase ne synchronise pas l'animation : il synchronise l'ÉVÉNEMENT. Le
//  poste qui joue fait autorité, le journal diffuse, chaque écran affiche. Deux
//  appareils qui ont lu les mêmes numéros sont forcément au même point.
//
//  POURQUOI LES POINTS DE VIE D'AVANT SONT DANS L'ÉVÉNEMENT
//  -------------------------------------------------------
//  Le moteur applique les dégâts en RETRANCHANT ce qu'il lit. Une relecture
//  démarre forcément après que l'auteur a écrit son résultat : elle lisait les
//  points de vie D'APRÈS et retranchait une seconde fois. Chaque événement
//  emporte donc la valeur d'avant des combattants qu'il nomme. Rien n'est
//  réécrit dans les combattants : ce que la base a livré entre-temps sur
//  d'autres — le tic d'une brûlure, l'énergie dépensée ailleurs — reste intact.
// =========================================================================

// Le curseur de CE poste : le numéro du dernier événement qu'il a rejoué.
window.DERNIER_EVENEMENT_JOUE = 0;

// Ceux qui sont arrivés mais qu'on ne peut pas encore jouer (il en manque un
// avant), rangés par numéro.
window.EVENEMENTS_RECUS = {};

// Ceux que CE poste a lui-même publiés et vus se dérouler en direct : il ne les
// rejoue pas, il les a déjà sous les yeux.
window.EVENEMENTS_DEJA_VUS = {};

// LES PIONS QUE LE JOURNAL RETIENT. Leur case à l'écran ne doit pas suivre la
// base tant que l'événement qui les fait bouger n'a pas été rejoué ICI : sinon
// ils se téléportent à l'arrivée avant même d'avoir marché.
//
// Cette liste ne se tient pas à la main — une liste tenue à la main finit
// toujours par mentir, on oublie d'y inscrire un pion ou de l'en retirer. Elle
// se DÉDUIT de ce que le journal a reçu et pas encore joué. Lue par
// positionsProtegees (combat.js), qui la voit comme un simple objet.
window.pionsRetenusParLeJournal = function() {
    const retenus = {};
    const noter = (ev) => {
        if (!ev) return;
        idsConcernes(ev.data || {}).forEach(id => { retenus[id] = true; });
    };
    Object.keys(window.EVENEMENTS_RECUS || {}).forEach(n => {
        if (Number(n) > window.DERNIER_EVENEMENT_JOUE) noter(window.EVENEMENTS_RECUS[n]);
    });
    noter(window.EVENEMENT_ATTENDU);
    noter(window.EVENEMENT_EN_COURS);
    return retenus;
};
Object.defineProperty(window, "PIONS_EN_ATTENTE_SEQUENCE", {
    configurable: true,
    get() { return window.pionsRetenusParLeJournal(); },
    set() {}     // l'ancien code l'effaçait à la main : sans effet, et sans dégât
});

// Le temps de respiration entre deux événements. Assez pour que l'œil suive,
// assez court pour que le tour ne traîne pas.
window.DELAI_ENTRE_ETAPES_MS = 320;

// Pendant une relecture, PERSONNE n'est l'auteur : le moteur ne réécrit rien en
// base et ne redéclenche aucun sous-effet — ils sont déjà des événements à part
// entière, avec leur propre numéro.
window.REJEU_SCRIPT_EN_COURS = false;
window.ETAT_AVANT_REJEU = null;
window.EVENEMENT_EN_COURS = null;

// LE TEMPS DE LIRE. Le premier événement d'un tour qu'on n'a pas joué soi-même
// est retenu ici : la fenêtre sombre montre le combattant et sa technique, et
// rien ne bouge tant que le joueur n'a pas touché l'écran. C'est une attente
// PUREMENT LOCALE — aucun poste n'attend un autre, chacun lit à son rythme et
// rattrape ensuite les numéros qui se sont accumulés.
window.EVENEMENT_ATTENDU = null;
let tourAcquitte = null;

let lecteurEnCours = false;
let arreterEcoute = null;
let partieEcoutee = null;
let attenteDepuis = 0;

const monPoste = () => localStorage.getItem("ID_JOUEUR_COURANT") || "poste-inconnu";
const pause = (ms) => new Promise(r => setTimeout(r, ms));

// =========================================================================
//  QUI JOUE, ET QUI REGARDE
// =========================================================================
//  La fenêtre sombre est pour tout le monde SAUF le joueur dont c'est le tour :
//  lui doit viser et se déplacer, son plateau reste dégagé. Le poste qui fait
//  jouer une créature la voit donc lui aussi.
window.acteurCourantCombat = function(partie) {
    const p = partie || window.PARTIE_DATA || {};
    if ((p.Phase_Combat || "Preparation") !== "Resolution") return null;
    return (p.File_Attente_Combat || [])[0] || null;
};

window.jeJoueCeTour = function(partie) {
    const tete = window.acteurCourantCombat(partie);
    if (!tete) return false;
    if (window.IA_MONSTRE_ACTEUR && window.IA_MONSTRE_ACTEUR === tete.idPersonnage) return true;
    const perso = (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === tete.idPersonnage);
    const estCreature = (typeof window.estMonstre === "function" && window.estMonstre(tete.idPersonnage))
                        || !!(perso && perso.estMonstre);
    return !estCreature && !!perso && perso.idJoueur === monPoste();
};

// « Ce combattant est-il MON héros ? » — posé sur un identifiant, et non sur la
// tête de file : un poste en retard rejoue le tour d'un autre pendant que la
// file, elle, est déjà passée à la suite. Se fier à la file lui ferait lever la
// fenêtre au mauvais moment.
function estMonHeros(idPersonnage) {
    if (!idPersonnage) return false;
    const perso = (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === idPersonnage);
    const estCreature = (typeof window.estMonstre === "function" && window.estMonstre(idPersonnage))
                        || !!(perso && perso.estMonstre);
    return !estCreature && !!perso && perso.idJoueur === monPoste();
}
window.estMonHerosCombat = estMonHeros;

window.monHerosJoue = function(partie) {
    const tete = window.acteurCourantCombat(partie);
    return tete ? estMonHeros(tete.idPersonnage) : false;
};

// =========================================================================
//  L'ÉCRITURE D'UN ÉVÉNEMENT
// =========================================================================
//  Les valeurs d'avant des combattants que l'événement NOMME — noter toute la
//  table figerait au passage ce qui n'a rien à voir avec lui. Elles servent
//  deux fois : le moteur y prend son point de départ (il travaille par
//  soustraction), et la relecture s'en sert de MOT DE PASSE pour savoir si la
//  base en est encore là (voir « la base a le dernier mot », plus bas).
const CHAMPS_AVANT = ["PV_Actuels", "Bouclier_Actuel", "fatigueActuelle"];

// Un quatrième mot de passe, jamais servi au moteur : la signature des états et
// de leur durée. Une brûlure qui tique change la durée sans toucher au reste ;
// sans ce repère, un rejeu tardif remettrait le compteur à sa valeur de départ.
const signatureEtats = (perso) => ((perso && perso.Etats_Alteres) || [])
    .map(e => (e && e.nom) + ":" + (e && e.duree)).sort().join(",");
const CLE_ETATS = "__etats";
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
        copie[CLE_ETATS] = signatureEtats(p);
        sortie[p.idPersonnage] = copie;
    });
    return sortie;
}

// LE POINT D'ENTRÉE DE L'ÉCRITURE. Appelé par le poste qui joue, chaque fois
// qu'il vient de trancher quelque chose : déplacement, carte, bond, poussée,
// traction, peur, passage au combattant suivant. L'ordre des appels devient
// l'ordre des numéros, et donc l'ordre des animations, partout.
window.consignerEtapeTour = async function(type, donnee) {
    // JAMAIS pendant une relecture : on rejoue le journal, on ne le réécrit pas.
    if (window.REJEU_SCRIPT_EN_COURS) return null;
    if (!window.ID_PARTIE_COURANTE || typeof window.publierEvenementCombat !== "function") return null;

    const acteur = window.acteurCourantCombat();
    const n = await window.publierEvenementCombat(window.ID_PARTIE_COURANTE, {
        type,
        acteur: acteur ? acteur.idPersonnage : null,
        idCarte: acteur ? acteur.idCarte : null,
        // Le numéro de manche : avec l'acteur, il identifie LE TOUR. C'est lui
        // qui dit à la relecture « ceci ouvre un nouveau tour, laisse le temps
        // de le lire » — sans quoi un combattant qui rejoue deux manches de
        // suite n'aurait droit qu'à un seul OK.
        tour: (window.PARTIE_DATA || {}).Tour_Combat || 0,
        data: JSON.parse(JSON.stringify(donnee || {})),
        avant: valeursAvant(idsConcernes(donnee)),
        auteur: monPoste()
    });

    // Ce que ce poste vient de publier, il le voit se dérouler en direct (c'est
    // lui qui calcule) : inutile de le lui rejouer. Sauf s'il regarde derrière
    // la fenêtre sombre, auquel cas il n'a rien vu et le rejouera comme les
    // autres — c'est le cas d'une créature, que personne ne « joue » vraiment.
    if (n && window.monHerosJoue()) window.EVENEMENTS_DEJA_VUS[n] = true;
    return n;
};

// PLUSIEURS ÉTAPES D'UN COUP — un trajet, par exemple, où chaque hexagone est
// son propre événement. Les envoyer une par une, c'est autant d'allers-retours
// réseau au milieu d'un tour, et autant d'occasions qu'une seule échoue en
// laissant un trou. Groupées, elles partent en une écriture, tout ou rien, avec
// des numéros consécutifs dans l'ordre donné.
window.consignerEtapesTour = async function(type, listeDeDonnees) {
    const liste = (listeDeDonnees || []).filter(Boolean);
    if (!liste.length) return [];
    if (window.REJEU_SCRIPT_EN_COURS) return [];
    if (!window.ID_PARTIE_COURANTE) return [];

    // Sans la publication groupée (un app.js d'une version antérieure encore en
    // cache), on retombe sur l'envoi une par une : plus lent, jamais faux.
    if (typeof window.publierEvenementsCombat !== "function") {
        const numeros = [];
        for (const donnee of liste) numeros.push(await window.consignerEtapeTour(type, donnee));
        return numeros.filter(n => n);
    }

    const acteur = window.acteurCourantCombat();
    const tour = (window.PARTIE_DATA || {}).Tour_Combat || 0;
    const evenements = liste.map(donnee => ({
        type,
        acteur: acteur ? acteur.idPersonnage : null,
        idCarte: acteur ? acteur.idCarte : null,
        tour,
        data: JSON.parse(JSON.stringify(donnee || {})),
        avant: valeursAvant(idsConcernes(donnee)),
        auteur: monPoste()
    }));

    const numeros = await window.publierEvenementsCombat(window.ID_PARTIE_COURANTE, evenements);
    if (window.monHerosJoue()) numeros.forEach(n => { window.EVENEMENTS_DEJA_VUS[n] = true; });
    return numeros;
};

// =========================================================================
//  LA RELECTURE, DANS L'ORDRE DES NUMÉROS
// =========================================================================
//  LE POINT DE DÉPART, UNE SEULE FOIS. Une carte peut frapper deux fois la même
//  cible : le moteur retranche alors le second coup de ce que le premier vient
//  d'écrire. Servir la valeur d'avant à CHAQUE demande cassait cette chaîne —
//  les deux coups repartaient du même chiffre, et seul le dernier comptait, si
//  bien qu'un spectateur voyait moins de dégâts que l'auteur. On ne la sert donc
//  qu'à la première demande pour un combattant et un champ donnés : après quoi
//  c'est la valeur courante, celle que le coup précédent vient d'inscrire.
let dejaServiAvant = null;

window.valeurAvantRejeu = function(idCombattant, champ, valeurCourante) {
    const avant = window.ETAT_AVANT_REJEU;
    if (!avant) return valeurCourante;
    const fiche = avant[idCombattant];
    if (!fiche || fiche[champ] === undefined) return valeurCourante;
    const cle = idCombattant + "|" + champ;
    if (dejaServiAvant && dejaServiAvant.has(cle)) return valeurCourante;
    if (dejaServiAvant) dejaServiAvant.add(cle);
    return fiche[champ];
};

// =========================================================================
//  LA BASE A LE DERNIER MOT
// =========================================================================
//  Un événement rejoué ne fait pas que dessiner : le moteur écrit le résultat
//  dans la fiche locale du combattant (c'est par soustraction qu'il travaille).
//  Tant que ce poste rejoue en suivant la base, tout va bien. Mais il rejoue
//  parfois TARD — un iPad réveillé, un OK donné en retard — et pendant ce temps
//  la base a continué sans lui : la brûlure a tiqué, la régénération est passée,
//  un autre combattant a frappé. Ces changements-là ne sont pas des événements :
//  ils arrivent par la fiche du combattant. Le rejeu tardif les écrasait, et le
//  poste restait sur une valeur du passé jusqu'à ce que la fiche rebouge — d'où
//  des points de vie qui ne concordaient pas d'un écran à l'autre pendant
//  plusieurs tours.
//
//  LE MOT DE PASSE. L'événement dit d'où il part. Si la fiche locale est encore
//  EXACTEMENT à ce point de départ, c'est que la base n'a pas encore appliqué ce
//  qui suit : le rejeu a le droit d'écrire, et il écrira la même chose que
//  l'auteur. Sinon, la base est déjà passée devant : on laisse l'animation se
//  jouer pour l'œil, puis on rend au combattant la valeur qu'il avait — la base
//  garde le dernier mot.
//
//  Une chaîne d'événements du même tour se recolle d'elle-même : ce que le rejeu
//  d'un événement écrit est, par construction, le point de départ du suivant.
const combattant = (id) => (window.PERSOS_PARTIE || []).find(p => p && p.idPersonnage === id);

// Les combattants dont la base a déjà dépassé le point de départ de l'événement.
// Eux seuls seront remis à la parole de la base après l'animation.
function gardeDeRejeu(ev) {
    const garde = [];
    const avant = (ev && ev.avant) || {};
    Object.keys(avant).forEach(id => {
        const perso = combattant(id);
        if (!perso) return;
        const auPointDeDepart = CHAMPS_AVANT.every(champ =>
            avant[id][champ] === undefined || String(perso[champ]) === String(avant[id][champ]))
            && (avant[id][CLE_ETATS] === undefined || signatureEtats(perso) === avant[id][CLE_ETATS]);
        if (auPointDeDepart) return;          // la base n'y est pas encore : le rejeu écrit
        garde.push(id);
    });
    return garde;
}

// On ne rend PAS une photo prise avant l'animation : la base parle aussi
// PENDANT — une régénération de fin de tour, le tour d'un autre poste — et cette
// photo-là l'effacerait à son tour. On rend sa dernière parole, celle que
// persoDocVersFront note à chaque notification.
function rendreLaGarde(garde) {
    let rendus = 0;
    (garde || []).forEach(id => {
        const verite = (window.VERITE_BASE || {})[id];
        // La fiche a pu être remplacée par la base pendant l'animation : on la
        // retrouve par son identifiant, jamais par la référence d'avant.
        const perso = combattant(id);
        if (!perso || !verite) return;
        Object.keys(verite).forEach(champ => {
            if (verite[champ] === undefined) return;
            perso[champ] = (verite[champ] && typeof verite[champ] === "object")
                ? JSON.parse(JSON.stringify(verite[champ])) : verite[champ];
        });
        rendus++;
    });
    if (!rendus) return;
    // Les jauges, les pions et le panneau lisent cette fiche : ils doivent
    // repartir de la valeur rendue, sinon l'écran garde le chiffre du rejeu.
    if (typeof window.redessinerPions === "function" && window.TOKENS_VTT_DATA) {
        try { window.redessinerPions(); } catch (e) {}
    }
    if (typeof window.rafraichirAffichageCombat === "function") {
        try { window.rafraichirAffichageCombat(); } catch (e) {}
    }
}

const ANIMATIONS = {
    // UN HEXAGONE, UN NUMÉRO. C'est le grain le plus fin du journal, et le plus
    // solide : chaque pas porte sa case de départ et sa case d'arrivée, donc une
    // position absolue. Le rejouer deux fois donne le même résultat, et un poste
    // qui reprend au milieu d'un trajet reprend au bon hexagone.
    pas:       (d) => window.jouerAnimationPas && window.jouerAnimationPas(d),
    // Les trajets d'un seul tenant des parties déjà en cours restent lisibles.
    mouvement: (d) => window.jouerAnimationMouvement && window.jouerAnimationMouvement(d),
    carte:     (d) => window.jouerAnimationMoteur && window.jouerAnimationMoteur(d),
    bond:      (d) => window.jouerAnimationBond && window.jouerAnimationBond(d),
    poussee:   (d) => window.jouerAnimationPoussee && window.jouerAnimationPoussee(d),
    traction:  (d) => window.jouerAnimationPoussee && window.jouerAnimationPoussee(d),
    peur:      (d) => window.jouerAnimationPeur && window.jouerAnimationPeur(d)
};

// L'identité d'un TOUR : la manche et celui qui agit. Tous les événements d'un
// même tour la partagent ; le premier à la présenter ouvre le tour.
const cleTour = (ev) => ev ? ((ev.tour === undefined ? "" : ev.tour) + "|" + (ev.acteur || "")) : null;

// Combien d'événements attendent encore d'être rejoués ici.
window.evenementsEnAttente = function() {
    return Object.keys(window.EVENEMENTS_RECUS)
        .map(Number).filter(n => n > window.DERNIER_EVENEMENT_JOUE).length;
};

window.lireJournalCombat = async function() {
    if (lecteurEnCours) return;
    lecteurEnCours = true;
    try {
        while (true) {
            // La fenêtre est ouverte et le joueur n'a pas encore touché
            // l'écran : rien ne se déroule derrière son dos.
            if (window.EVENEMENT_ATTENDU) break;

            const suivant = window.DERNIER_EVENEMENT_JOUE + 1;
            let ev = window.EVENEMENTS_RECUS[suivant];

            if (!ev) {
                // Rien à cette place. Soit il n'y a plus rien du tout, soit il
                // MANQUE un numéro : on attend 153 et 154 est déjà là. Dans ce
                // second cas on va chercher le trou, sans jamais le sauter.
                const plusLoin = Object.keys(window.EVENEMENTS_RECUS)
                    .map(Number).some(n => n > suivant);
                if (!plusLoin) break;
                if (!attenteDepuis) attenteDepuis = Date.now();
                if (Date.now() - attenteDepuis < 800) break;   // laissons-le arriver seul
                ev = typeof window.lireEvenementCombat === "function"
                    ? await window.lireEvenementCombat(window.ID_PARTIE_COURANTE, suivant)
                    : null;
                if (!ev) {
                    // Introuvable pour de bon (une écriture qui n'a jamais
                    // abouti) : on ne fige pas la table pour autant.
                    console.warn("Événement de combat " + suivant + " introuvable : on passe.");
                    window.DERNIER_EVENEMENT_JOUE = suivant;
                    attenteDepuis = 0;
                    continue;
                }
                window.EVENEMENTS_RECUS[suivant] = ev;
            }
            attenteDepuis = 0;

            const dejaVu = !!window.EVENEMENTS_DEJA_VUS[suivant];
            const jouer = ANIMATIONS[ev.type];

            // === LE TEMPS DE LIRE LA TECHNIQUE ===============================
            // Premier événement d'un tour que ce poste va DÉCOUVRIR : on retient
            // tout, la fenêtre sombre annonce le combattant et la compétence qui
            // va se dérouler, et le OK doré clignote. Le tour ne commence qu'au
            // toucher. On ne consomme surtout pas l'événement : il est rejoué
            // entier après le OK.
            if (!dejaVu && jouer && ev.acteur && !estMonHeros(ev.acteur) && cleTour(ev) !== tourAcquitte) {
                window.EVENEMENT_ATTENDU = ev;
                window.EVENEMENTS_RECUS[suivant] = ev;
                if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
                break;
            }

            window.DERNIER_EVENEMENT_JOUE = suivant;
            delete window.EVENEMENTS_RECUS[suivant];

            // Déjà vu en direct par ce poste : on avance le curseur, c'est tout.
            if (dejaVu) {
                delete window.EVENEMENTS_DEJA_VUS[suivant];
                continue;
            }

            if (!jouer) continue;

            // La fenêtre annonce le combattant de L'ÉVÉNEMENT qu'on rejoue, pas
            // celui que la file désigne : un poste en retard raconterait sinon
            // le mauvais tour au-dessus des bonnes animations.
            window.EVENEMENT_EN_COURS = ev;
            window.ETAT_AVANT_REJEU = ev.avant || null;
            window.REJEU_SCRIPT_EN_COURS = true;
            dejaServiAvant = new Set();
            const garde = gardeDeRejeu(ev);
            try {
                await window.filerAnimation(ev.type, () => jouer(ev.data));
            } finally {
                window.REJEU_SCRIPT_EN_COURS = false;
                window.ETAT_AVANT_REJEU = null;
                window.EVENEMENT_EN_COURS = null;
                dejaServiAvant = null;
                rendreLaGarde(garde);
            }
            if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();

            // LE TEMPS DE RESPIRATION ENTRE DEUX ÉVÉNEMENTS — sauf entre deux
            // PAS d'un même trajet : là, c'est une marche, et une marche ne
            // s'arrête pas un tiers de seconde à chaque case. Le pas suivant
            // enchaîne immédiatement sur les réglages du précédent.
            const suivantEstUnPasDuMemeTrajet =
                ev.type === "pas"
                && (window.EVENEMENTS_RECUS[suivant + 1] || {}).type === "pas"
                && (window.EVENEMENTS_RECUS[suivant + 1] || {}).acteur === ev.acteur;
            if (!suivantEstUnPasDuMemeTrajet) await pause(window.DELAI_ENTRE_ETAPES_MS);
        }
    } finally {
        lecteurEnCours = false;
        // Tout est rejoué : plus rien ne retient les pions, ils retrouvent la
        // case que dit la base. Un dernier redessin le rend visible.
        if (window.evenementsEnAttente() === 0) {
            if (typeof window.redessinerPions === "function") {
                try { window.redessinerPions(); } catch (e) {}
            }
            // Les zones posées pendant les tours qu'on vient de rejouer ont
            // attendu leur moment : elles peuvent enfin se dessiner.
            if (typeof window.appliquerZonesPersistantes === "function") {
                try { window.appliquerZonesPersistantes(); } catch (e) {}
            }
        }
        if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
    }
};

// =========================================================================
//  L'ÉCOUTE DU JOURNAL
// =========================================================================
window.suivreSequenceTour = function(partie) {
    const p = partie || window.PARTIE_DATA || {};

    // Nouvelle partie : on ouvre son journal, et on place le curseur sur le
    // dernier numéro écrit. Rejoindre un combat en cours ne doit pas rejouer
    // tout ce qui s'est passé avant l'arrivée.
    if (window.ID_PARTIE_COURANTE && partieEcoutee !== window.ID_PARTIE_COURANTE) {
        if (typeof arreterEcoute === "function") { try { arreterEcoute(); } catch (e) {} }
        partieEcoutee = window.ID_PARTIE_COURANTE;
        window.DERNIER_EVENEMENT_JOUE = typeof window.dernierNumeroEvenement === "function"
            ? window.dernierNumeroEvenement(p) : 0;
        window.EVENEMENTS_RECUS = {};
        window.EVENEMENTS_DEJA_VUS = {};
        window.EVENEMENT_ATTENDU = null;
        tourAcquitte = null;

        if (typeof window.ecouterEvenementsCombat === "function") {
            arreterEcoute = window.ecouterEvenementsCombat(
                partieEcoutee, window.DERNIER_EVENEMENT_JOUE, (evenements) => {
                    (evenements || []).forEach(ev => {
                        if (ev && ev.n > window.DERNIER_EVENEMENT_JOUE) window.EVENEMENTS_RECUS[ev.n] = ev;
                    });
                    window.lireJournalCombat();
                });
        }
    }

    if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
    return window.lireJournalCombat();
};

// =========================================================================
//  CE QUE LA FENÊTRE DOIT MONTRER
// =========================================================================
//  Elle n'attend AUCUN autre poste : chaque écran lit le journal pour lui seul.
//  Elle a deux visages :
//   — un tour va s'ouvrir : le nom, les états, la technique, ses effets, sa
//     zone, et le OK doré. Le joueur lit, puis touche l'écran.
//   — le tour se déroule : elle s'efface pour laisser voir les animations.
window.etatSequenceTour = function() {
    // Un tour attend d'être lu : le OK passe avant tout le reste, y compris
    // avant ma propre entrée en scène — sinon un poste en retard verrait son
    // plateau se dégager sur un tour qu'il n'a pas encore vu.
    if (window.EVENEMENT_ATTENDU) {
        return { message: "Touchez l'écran pour voir ce tour", okVisible: true, forcerVisible: false };
    }

    // Le journal est hors service : il n'annoncera jamais de tour, et la fenêtre
    // resterait sur « le tour se joue… » devant un plateau qu'on ne voit pas.
    // On l'efface — les animations reprennent leur ancien chemin (voir
    // programmerAnimationTour), et au moins le combat se regarde.
    if (window.JOURNAL_INDISPONIBLE) return { message: "", okVisible: false, forcerVisible: false, masquee: true };

    if (window.monHerosJoue()) return null;      // à moi de jouer : plateau dégagé

    // LE RESTE DU TEMPS, LE PLATEAU EST DÉGAGÉ AUSSI. La fenêtre sombre n'a qu'un
    // seul rôle : annoncer un tour avant de le dérouler. Tant qu'il n'y a rien
    // à annoncer — pendant qu'un tour se rejoue, pendant qu'une créature
    // réfléchit, pendant qu'un joueur lointain choisit sa carte — elle n'a rien
    // à faire là.
    //
    // Elle restait autrefois posée en annonçant « le tour se joue… » dès que ce
    // n'était pas notre héros, c'est-à-dire presque tout le temps. Le moindre
    // grain de sable ailleurs, et on se retrouvait devant un écran noir figé
    // sur un tour qui ne venait pas, sans rien pouvoir faire ni même regarder.
    // Un plateau visible, lui, ne peut pas se bloquer.
    return { message: "", okVisible: false, forcerVisible: false, masquee: true };
};

// La séquence, telle que l'affichage la lit (combat.js). Il n'y a plus d'objet
// de séquence : la fenêtre suit simplement la tête de file.
Object.defineProperty(window, "SEQUENCE_TOUR", {
    configurable: true,
    get() {
        // En pleine relecture — ou devant un tour retenu par le OK —, c'est
        // l'ÉVÉNEMENT qui commande : un poste en retard doit annoncer le
        // combattant qu'il montre, pas celui que la file a déjà désigné.
        const ev = window.EVENEMENT_EN_COURS || window.EVENEMENT_ATTENDU;
        if (ev && ev.acteur) {
            return { acteur: ev.acteur, idCarte: ev.idCarte, evenement: true, voile: !estMonHeros(ev.acteur) };
        }
        const tete = window.acteurCourantCombat();
        if (!tete) return null;
        if (typeof window.estCombattantMort === "function" && window.estCombattantMort(tete.idPersonnage)) return null;
        return { acteur: tete.idPersonnage, idCarte: tete.idCarte, voile: !window.monHerosJoue() };
    }
});

// =========================================================================
//  LES ANIMATIONS DIFFUSÉES À L'ANCIENNE
// =========================================================================
//  Les Action_* de la partie existent toujours : c'est par elles que le poste
//  qui JOUE voit son propre tour se dérouler pendant qu'il le calcule. Mais un
//  poste qui REGARDE n'en fait plus rien — il connaîtra ce tour par le journal,
//  numéro par numéro. Sans ce filtre, les animations se déroulaient derrière la
//  fenêtre sombre, et on les devinait par transparence.
window.programmerAnimationTour = function(nom, action, fn) {
    // Un poste qui joue son propre héros voit tout en direct.
    if (window.monHerosJoue()) return window.filerAnimation(nom, fn);

    // LE JOURNAL EST MUET. Taire une animation en comptant sur un numéro qui
    // n'arrivera jamais, c'est un plateau où il ne se passe rien. On repasse au
    // circuit d'avant : moins bien synchronisé, mais on voit le combat.
    if (window.JOURNAL_INDISPONIBLE) return window.filerAnimation(nom, fn);

    // LA SEULE ANIMATION QU'ON NE PEUT PAS TAIRE CHEZ CELUI QUI CALCULE : la
    // carte. Ce n'est pas qu'une animation, c'est le moteur de résolution
    // lui-même — les dégâts, les états, les sous-effets et leurs écritures en
    // base en sortent. La taire, c'était un tour où il ne se passait rien.
    if (nom === "carte" && window.jeJoueCeTour()) return window.filerAnimation(nom, fn);

    // Tout le reste attend son numéro. Le pion concerné garde sa case à l'écran
    // — c'est l'événement pas encore rejoué qui le retient, il n'y a rien à
    // inscrire nulle part (voir pionsRetenusParLeJournal).
    return Promise.resolve();
};

// =========================================================================
//  LE OK : « J'AI LU, VAS-Y »
// =========================================================================
//  Un clic n'importe où sur la fenêtre. Il ne prévient personne et n'attend
//  personne : il ouvre le tour SUR CET ÉCRAN. Deux postes peuvent très bien
//  regarder deux tours différents à quelques secondes d'écart — ils rejouent
//  les mêmes numéros, ils finiront au même point.
window.jouerSequenceTour = function() {
    const attendu = window.EVENEMENT_ATTENDU;
    if (!attendu) return Promise.resolve();

    tourAcquitte = cleTour(attendu);
    window.EVENEMENT_ATTENDU = null;
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
    return window.lireJournalCombat();
};

// =========================================================================
//  CE QUI A DISPARU AVEC LES BARRIÈRES
// =========================================================================
//  Plus de « Check » échangés entre postes, plus de file retenue en attendant
//  tout le monde : le journal numéroté suffit, et deux appareils qui ont lu les
//  mêmes numéros sont au même point. Ces fonctions restent, vides, parce que le
//  reste du jeu les appelle encore.
// LE COMBAT EST FINI (ou repart de zéro) : ce poste oublie tout du journal et
// se rebranchera au prochain passage. Appelé par viderJournalCombat (app.js),
// qui efface les documents et remet le compteur à zéro.
window.oublierJournalCombat = function() {
    if (typeof arreterEcoute === "function") { try { arreterEcoute(); } catch (e) {} }
    arreterEcoute = null;
    partieEcoutee = null;              // force un rebranchement propre
    window.DERNIER_EVENEMENT_JOUE = 0;
    window.EVENEMENTS_RECUS = {};
    window.EVENEMENTS_DEJA_VUS = {};
    window.EVENEMENT_ATTENDU = null;
    window.EVENEMENT_EN_COURS = null;
    tourAcquitte = null;
    attenteDepuis = 0;
    if (typeof window.redessinerPions === "function") { try { window.redessinerPions(); } catch (e) {} }
    if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
};

window.sequenceRetientFinDeTour = async function() { return false; };
window.sequenceTourEnAttente = function() { return false; };
window.forcerSequenceTour = async function() {};
window.postesAttendusSequence = function() { return [monPoste()]; };
