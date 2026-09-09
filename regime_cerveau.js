// =========================================================================
//  LE CHEF D'ORCHESTRE — CE QUI RELIE TOUTES LES PIÈCES
// =========================================================================
//
//  Cinq fichiers purs (combat_etat, moteur_pur, mouvement_pur, ia_pure,
//  cerveau_combat), deux fichiers de plomberie (depot_firestore, pont_combat),
//  un spectateur. Aucun ne connaît les autres au-delà de ce qu'il utilise. Ce
//  fichier-ci est le seul qui les voie tous, et c'est son unique travail :
//  brancher, et rien d'autre. Il ne calcule rien et ne montre rien.
//
//  CE QU'IL DÉCIDE, ET IL N'Y A QUE ÇA
//  ----------------------------------
//   1. Ce poste est-il le cerveau ? (l'état le dit — jamais une élection)
//   2. Le cerveau doit-il tourner maintenant ?
//   3. Que faire de ce qui arrive du journal ?
//
//  LE DRAPEAU
//  ----------
//  `REGIME_CERVEAU` est éteint par défaut. Tant qu'il l'est, ce fichier ne fait
//  strictement rien : le combat tourne exactement comme avant, avec l'ancienne
//  synchronisation. C'est délibéré — un basculement qui ne se défait pas en une
//  ligne est un basculement qu'on n'ose pas essayer un soir de partie.
//
//  QUI DEVIENT LE CERVEAU
//  ----------------------
//  Le poste qui OUVRE le combat, et lui seul. Pas d'élection, pas de vote, pas
//  de « le plus ancien gagne » : celui qui lance la rencontre est devant son
//  écran, il vient de cliquer, il est le mieux placé. C'est écrit dans l'état,
//  et l'état a un seul écrivain — donc cette désignation ne peut pas être
//  contestée par un poste en retard, ce qui était tout le problème du verrou.
// =========================================================================

import { construireEtatCombat, verifierEtatCombat, FORMAT_ETAT } from './combat_etat.js';
import { creerCerveau, estLeCerveau, cerveauPerdu, BATTEMENT_MS } from './cerveau_combat.js';
import { creerSpectateur } from './spectateur_combat.js';
import { creerPont, creerProjection } from './pont_combat.js';
import {
    creerDepot, ouvrirCombat, fermerCombat, ecouterCombat,
    lireEntree, envoyerIntention, CHEMINS
} from './depot_firestore.js';

const nombre = (v, defaut = 0) => {
    const n = parseInt(v);
    return Number.isFinite(n) ? n : defaut;
};

// =========================================================================
//  1. LE CHEF D'ORCHESTRE
// =========================================================================
//  Tout est injecté : l'accès à Firestore, les animations, l'écran, l'identité
//  du poste. Ce fichier ne lit aucune variable globale, ce qui permet au banc
//  de faire tourner TROIS chefs d'orchestre côte à côte sur un même Firestore
//  en mémoire — et de vérifier que les trois écrans finissent identiques.

export function creerRegime(contexte) {
    const {
        io,                                  // l'accès Firestore (window.ioCombatFirestore)
        idPartie,
        poste,                               // qui je suis
        animations = {},                     // les fonctions d'animation du jeu
        ecran = {},                          // où poser l'état
        estAMoi = () => false,               // « ce combattant est-il à moi ? »
        carteDe = () => null,                // la technique d'une créature
        plateau = null,                      // le terrain, pour les coûts de déplacement
        surFenetre = () => {},               // ouvrir/fermer la fenêtre sombre
        tracer = () => {},
        maintenant = () => Date.now(),
        programmer = (fn, ms) => setTimeout(fn, ms),
        arreterMinuteur = (id) => clearTimeout(id),
        battementMs = BATTEMENT_MS
    } = contexte || {};

    const depot = creerDepot(io, idPartie, { tracer, maintenant });
    const pont = creerPont({ ...animations, tracer });
    const projeter = creerProjection(ecran);

    const moi = {
        etat: null,          // le dernier état PUBLIÉ qu'on ait vu (pas celui de l'écran)
        cerveau: null,
        arretEcoutes: null,
        minuteurBattement: null,
        enTrainDeTourner: false,
        branche: false
    };

    // Le spectateur : il anime par le pont, et projette par l'écran. Il ne sait
    // rien de Firestore — c'est nous qui allons lui chercher un numéro manquant.
    const spectateur = creerSpectateur({
        animer: (etape, etat) => pont.animer(etape, etat),
        estAMoi,
        chercher: async (v) => {
            try { return await lireEntree(io, idPartie, v); }
            catch (e) { tracer("❌", `lecture du n°${v} impossible`, String(e && e.message)); return null; }
        },
        surEtat: projeter,
        surFenetre,
        tracer,
        programmer
    });

    // =====================================================================
    //  LE CERVEAU TOURNE — MAIS SEULEMENT S'IL EST À NOUS
    // =====================================================================
    //  Appelé après chaque changement d'état et à chaque battement. Un poste
    //  qui n'a pas la main sort à la première ligne : c'est cette ligne, et
    //  elle seule, qui remplace tout l'appareillage de verrous d'avant.
    async function tourner() {
        if (!moi.cerveau || moi.enTrainDeTourner) return [];
        moi.enTrainDeTourner = true;
        try {
            return await moi.cerveau.tournerJusquAuCalme();
        } catch (e) {
            // Une écriture qui rate n'est pas un drame : rien n'a bougé, et
            // l'intention sera reprise. Mais on le DIT — un cerveau muet qui
            // n'avance plus est exactement ce qu'on ne veut plus jamais voir.
            tracer("❌", "le cerveau n'a pas pu publier", String(e && e.message));
            return [];
        } finally {
            moi.enTrainDeTourner = false;
        }
    }

    // Le battement de cœur. Il ne sert qu'à une chose : permettre aux autres
    // postes de constater que ce cerveau est vivant. Personne ne s'en sert
    // encore pour reprendre la main — ça, c'est l'étape suivante.
    function battre() {
        // Un battement nul, c'est « pas de battement » : les bancs n'en veulent
        // pas, et un minuteur qui se replanifie lui-même sans jamais attendre
        // fait tourner une boucle à pleine vitesse. Ça n'est pas théorique —
        // c'est exactement ce qui a figé le premier passage de ce banc.
        if (!(battementMs > 0)) return;
        if (moi.minuteurBattement) arreterMinuteur(moi.minuteurBattement);
        moi.minuteurBattement = programmer(async function encore() {
            if (moi.cerveau) { try { await moi.cerveau.battre(); } catch (e) {} }
            if (moi.branche) moi.minuteurBattement = programmer(encore, battementMs);
        }, battementMs);
    }

    // =====================================================================
    //  SE BRANCHER
    // =====================================================================
    //  Deux écoutes, et il n'y en aura jamais d'autres : l'état, et les entrées
    //  qui suivent le curseur de cet écran.
    function brancher(depuis = 0) {
        debrancher();
        moi.branche = true;

        moi.arretEcoutes = ecouterCombat(io, idPartie, {
            depuis,
            surEtat: (etat) => {
                if (!etat) return;
                // UN POSTE QUI NE COMPREND PAS LE FORMAT NE JOUE PAS. Il ne fait
                // pas semblant, il ne devine pas : il se tait et le dit. C'est
                // le bug des deux verrous qui ne se voyaient pas, rendu
                // impossible — un appareil en retard d'une version est visible
                // en une ligne au lieu de corrompre le combat.
                if (etat.format !== FORMAT_ETAT) {
                    tracer("🛑", `format d'état inconnu : ${etat.format}`,
                           `(ce poste connaît le ${FORMAT_ETAT} — recharge la page)`);
                    return;
                }
                const premier = !moi.etat;
                moi.etat = etat;

                // On (re)prend la main si l'état nous désigne, on la lâche
                // sinon. C'est déclaratif : aucune négociation.
                const aMoi = estLeCerveau(etat, poste);
                if (aMoi && !moi.cerveau) {
                    moi.cerveau = creerCerveau(depot, { poste, plateau, carteDe, maintenant, tracer });
                    tracer("🧠", "ce poste tient le cerveau", `(version ${etat.version})`);
                    battre();
                } else if (!aMoi && moi.cerveau) {
                    moi.cerveau = null;
                    tracer("👀", "ce poste regarde", `(le cerveau est ${etat.cerveau})`);
                }

                // LE PREMIER ÉTAT REÇU DONNE LE POINT DE DÉPART DE L'ÉCRAN. On
                // ne rejoue pas les trois cents entrées qui ont précédé : on
                // part de là, et on s'anime à partir de la suite.
                if (premier) spectateur.repartirDe(etat, etat.version);

                if (aMoi) tourner();
            },
            surEntrees: (entrees) => {
                spectateur.recevoir(entrees);
                spectateur.lire();
            }
        });
    }

    function debrancher() {
        moi.branche = false;
        if (moi.arretEcoutes) { try { moi.arretEcoutes(); } catch (e) {} }
        if (moi.minuteurBattement) arreterMinuteur(moi.minuteurBattement);
        moi.arretEcoutes = null;
        moi.minuteurBattement = null;
        moi.cerveau = null;
        moi.etat = null;
    }

    // =====================================================================
    //  OUVRIR UN COMBAT
    // =====================================================================
    //  Le poste qui appelle ceci devient le cerveau. C'est le seul endroit de
    //  tout le système où la main se donne, et elle se donne à celui qui a
    //  cliqué.
    async function ouvrir(source) {
        const etat = construireEtatCombat({ ...source, idPartie, cerveau: poste });

        // On ne publie pas un état incohérent, même le premier. Un combat qui
        // démarre bancal ne se redresse jamais tout seul : il produit des
        // symptômes qu'on passera trois soirs à chasser ailleurs.
        const soucis = verifierEtatCombat(etat);
        if (soucis.length > 0) {
            tracer("❌", "combat non ouvert : état de départ incohérent", soucis.join(" | "));
            return null;
        }

        etat.battement = maintenant();
        await ouvrirCombat(io, idPartie, etat);
        tracer("🎬", `combat ouvert par ${poste}`,
               `${Object.keys(etat.combattants).length} combattants, graine ${etat.graine}`);
        brancher(0);
        return etat;
    }

    // Rejoindre un combat déjà en cours : on ne se désigne pas cerveau, on
    // écoute. L'état publié dira si c'est nous — ce sera le cas après un
    // rechargement de page du poste qui tenait la main.
    function rejoindre() { brancher(0); }

    async function fermer() {
        try { await fermerCombat(io, idPartie); } catch (e) {}
        debrancher();
    }

    // =====================================================================
    //  CE QU'UN JOUEUR DEMANDE
    // =====================================================================
    //  Jamais un résultat : une action. Le cerveau tranche, tire les dés,
    //  calcule et publie. Un client qui enverrait un chemin fantaisiste ou des
    //  dégâts inventés ne peut produire qu'une intention de plus, refusée avec
    //  sa raison.
    //
    //  L'appel rend la main tout de suite : ce qui suit arrivera par le
    //  journal, comme pour tout le monde. Y compris pour le poste qui tient le
    //  cerveau — il n'y a pas de chemin court, donc pas de second chemin qui
    //  puisse diverger du premier.
    async function demander(intention) {
        try {
            const id = await envoyerIntention(io, idPartie, { ...intention, poste });
            tracer("✉️", `${intention.type} demandé pour ${intention.acteur}`, id);
            // Le cerveau, s'il est ici, n'attend pas la notification pour
            // travailler : c'est la latence en moins sur son propre écran.
            if (moi.cerveau) tourner();
            return id;
        } catch (e) {
            tracer("❌", `intention non envoyée : ${intention.type}`, String(e && e.message));
            return null;
        }
    }

    const demanderMouvement = (acteur, chemin, reserveCarte) =>
        demander({ type: "mouvement", acteur, chemin, reserveCarte: nombre(reserveCarte) });

    const demanderCarte = (acteur, carte) =>
        demander({ type: "carte", acteur, idCarte: carte.idCarte,
                   attaques: carte.attaques || [], alterations: carte.alterations || [],
                   coutFatigue: nombre(carte.coutFatigue) });

    const demanderFinDeTour = (acteur) => demander({ type: "finTour", acteur });

    // Le OK de la fenêtre sombre. Purement local, comme avant : chacun lit à
    // son rythme et rattrape ensuite. Aucun poste n'attend un autre.
    const ok = () => spectateur.ok();

    return {
        ouvrir, rejoindre, fermer, brancher, debrancher, tourner, ok,
        demander, demanderMouvement, demanderCarte, demanderFinDeTour,
        // De quoi regarder l'intérieur, pour la trace et les bancs.
        spectateur,
        etatPublie: () => moi.etat,
        etatAffiche: () => spectateur.etat(),
        vue: () => spectateur.vue(),
        jeSuisLeCerveau: () => !!moi.cerveau,
        cerveauPerdu: () => cerveauPerdu(moi.etat, maintenant())
    };
}

// =========================================================================
//  2. LE DRAPEAU, ET CE QU'IL COMMANDE
// =========================================================================
//  Éteint, tout ce fichier est inerte et le jeu tourne comme avant. Allumé, le
//  combat passe au nouveau régime. Une ligne dans les deux sens, et rien à
//  supprimer pour revenir en arrière — c'est la condition pour oser essayer.
//
//  En jeu : `regimeCerveau(true)` dans la console, puis on relance un combat.

if (typeof window !== "undefined") {
    window.REGIME_CERVEAU = window.REGIME_CERVEAU === true;

    window.regimeCerveau = function(actif) {
        if (actif === undefined) return window.REGIME_CERVEAU;
        window.REGIME_CERVEAU = !!actif;
        try { localStorage.setItem("REGIME_CERVEAU", actif ? "1" : "0"); } catch (e) {}
        console.log(`%cRégime ${actif ? "CERVEAU" : "ANCIEN"} — relance un combat pour qu'il prenne effet.`,
                    `color:${actif ? "#66ff99" : "#ffaa00"};font-weight:bold`);
        return window.REGIME_CERVEAU;
    };

    // Le choix survit au rechargement : sur iPad, rouvrir la console pour
    // retaper une ligne à chaque essai n'est pas une option.
    try {
        if (localStorage.getItem("REGIME_CERVEAU") === "1") window.REGIME_CERVEAU = true;
    } catch (e) {}

    window.regimeCombat = { creerRegime, CHEMINS };
}
