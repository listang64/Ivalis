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

import { construireEtatCombat, verifierEtatCombat, creerDes, FORMAT_ETAT } from './combat_etat.js';
import { creerCerveau, estLeCerveau, cerveauPerdu, ouvrirManche, BATTEMENT_MS } from './cerveau_combat.js';
import { creerSpectateur } from './spectateur_combat.js';
import { creerPont, creerProjection } from './pont_combat.js';
import {
    creerDepot, ouvrirCombat, effacerLeCombat, ecouterCombat,
    lireEntree, lireDepuis, envoyerIntention, CHEMINS
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
        surRejeu = () => {},                 // « un tour est en train de se rejouer »
        surPublication = () => {},           // un état vient d'être publié (par nous ou par un autre)
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
        branche: false,
        ouvertureAilleurs: false
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
        surRejeu,
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
            const faits = await moi.cerveau.tournerJusquAuCalme();
            // QUAND LE CERVEAU NE PUBLIE RIEN, IL FAUT SAVOIR POURQUOI. Neuf
            // fois sur dix c'est normal — un joueur réfléchit — mais « rien ne
            // se passe » sans explication est précisément ce qui coûte une
            // soirée à comprendre. Une ligne, et on sait qui il attend.
            if (faits.length === 0 && moi.etat) {
                const tete = (moi.etat.file || [])[0];
                const c = tete && moi.etat.combattants[tete.id];
                tracer("⌛", tete ? `le cerveau attend ${tete.id}` : "la file est vide",
                       c ? (c.estMonstre ? "(créature — elle devrait jouer)"
                                         : `(au joueur ${c.joueur || "?"})`)
                         : `(phase ${moi.etat.phase})`);
            }
            return faits;
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

    // Une notification de la partie remplace PARTIE_DATA en entier, donc écrase
    // la projection. On la repose après coup : la file de l'état est la vraie.
    function reprojeter() {
        const etat = spectateur.etat();
        if (!etat) return;
        // EN PRÉPARATION, C'EST LA PARTIE QUI DIT LA FILE. L'état, lui, l'a
        // vidée en fin de manche : la reposer par-dessus effacerait de l'écran
        // les cartes que les joueurs viennent de choisir, une par une, dans le
        // document de la partie. Le reste (pions, fiches, points de vie) reste
        // la vérité de l'état et se projette comme toujours.
        projeter(etat, { file: (etat.phase || "") === "Resolution" });
    }

    // =====================================================================
    //  SE BRANCHER
    // =====================================================================
    //  Deux écoutes, et il n'y en aura jamais d'autres : l'état, et les entrées
    //  qui suivent le curseur de cet écran.
    function brancher(depuis = 0) {
        // SE BRANCHER DEUX FOIS, C'EST PERDRE SA PLACE. Débrancher remet le
        // curseur et la file des entrées reçues à zéro ; si on est déjà
        // branché sur cette partie, il n'y a rien à refaire, et tout à perdre.
        if (moi.branche) return;
        debrancher();
        moi.branche = true;

        moi.arretEcoutes = ecouterCombat(io, idPartie, {
            depuis,
            surEtat: (etat) => {
                // L'ÉTAT A DISPARU : LE COMBAT EST FINI, ET L'ÉCRAN DOIT SE
                // DÉGAGER. C'est très exactement ce que fait la réinitialisation
                // (effacerLeCombat supprime le document d'état). On l'ignorait
                // purement et simplement — `if (!etat) return;` — et l'écran
                // restait figé sur le dernier tour vu, fenêtre sombre comprise,
                // sans plus rien qui puisse jamais arriver. Un iPad, qui n'a pas
                // de console pour s'en sortir, y était enfermé : la seule issue
                // était une croix de débogage cachée sous le bouton du menu.
                if (!etat) {
                    if (moi.etat) {
                        tracer("🧹", "le combat a été effacé", "l'écran se dégage");
                        moi.etat = null;
                        moi.cerveau = null;
                        spectateur.oublier();
                    }
                    return;
                }
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
                // LE POINT DE DÉPART SUIT L'IDENTITÉ DU COMBAT, PAS « LA
                // PREMIÈRE FOIS QU'ON VOIT UN ÉTAT ».
                //
                // C'était « la première fois », et ça a figé un écran : le
                // poste qui PERD la réclamation d'ouverture se rebranchait, et
                // sa première notification le faisait repartir de la version
                // courante — effaçant d'un coup les trois entrées déjà reçues
                // et la fenêtre qui attendait le OK. Le joueur cliquait dans le
                // vide, et le combat ne se voyait jamais.
                //
                // Repartir n'a de sens qu'à un vrai changement de combat.
                const changementDeCombat = !moi.etat || moi.etat.combat !== etat.combat;
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

                // Un état vient d'arriver : l'appelant peut avoir quelque chose à
                // en conclure. C'est par là que le cerveau constate qu'une manche
                // est finie et rend la main aux joueurs — sans quoi il faudrait
                // attendre qu'un tiers touche le document de la partie, ce que
                // plus personne ne fait une fois le combat ouvert.
                try { surPublication(etat); } catch (e) { tracer("❌", "surPublication", String(e && e.message)); }

                // On ne rejoue pas les trois cents entrées d'un combat qu'on
                // rejoint en route : on part de l'état publié, et on s'anime à
                // partir de la suite.
                if (changementDeCombat) {
                    spectateur.repartirDe(etat, etat.version);
                    // ET ON RELIT LE JOURNAL, une fois.
                    //
                    // L'état et le journal sont deux documents, donc deux
                    // écoutes : rien ne garantit leur ordre d'arrivée. Les
                    // entrées d'un combat qu'on ne connaissait pas encore ont
                    // pu être écartées à la porte (elles portaient une autre
                    // identité que celle qu'on avait), et une écoute ne
                    // renotifie que lorsqu'un document bouge. Sans cette
                    // relecture, elles ne reviendraient jamais et l'écran
                    // resterait au point de départ pendant que le combat avance.
                    lireDepuis(io, idPartie, etat.version).then(entrees => {
                        if (!entrees || entrees.length === 0) return;
                        spectateur.recevoir(entrees);
                        spectateur.lire();
                    }).catch(e => tracer("❌", "relecture du journal impossible",
                                         String(e && e.message)));
                }

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
        moi.ouvertureAilleurs = false;
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
        // On RÉCLAME. Les trois postes voient la même notification au même
        // instant et tentent tous d'ouvrir ; Firestore en désigne un.
        const obtenu = await ouvrirCombat(io, idPartie, etat);
        if (!obtenu) {
            // Perdu la réclamation, et c'est très bien : un autre poste tient le
            // cerveau. On se branche et on regarde, comme n'importe quel
            // spectateur. Ce n'est PAS un échec.
            moi.ouvertureAilleurs = true;
            tracer("🤝", "un autre poste a ouvert ce combat", "on regarde");
            brancher(0);          // sans effet si on l'est déjà, et c'est voulu
            return null;
        }
        tracer("🎬", `combat ouvert par ${poste}`,
               `${Object.keys(etat.combattants).length} combattants, graine ${etat.graine}`);
        brancher(0);
        return etat;
    }

    // Rejoindre un combat déjà en cours : on ne se désigne pas cerveau, on
    // écoute. L'état publié dira si c'est nous — ce sera le cas après un
    // rechargement de page du poste qui tenait la main.
    function rejoindre() { brancher(0); }

    // =====================================================================
    //  UNE MANCHE S'OUVRE
    // =====================================================================
    //  Le cerveau s'est arrêté en fin de manche et a rendu la main aux joueurs.
    //  Ils ont choisi leurs cartes, l'initiative est lancée, et la phase de
    //  préparation a écrit sa file. Il faut maintenant la faire entrer dans
    //  l'état — et c'est le cerveau qui le fait, comme il fait tout le reste :
    //  par un pas, avec son entrée de journal.
    //
    //  Un poste qui n'a pas la main ne fait RIEN ici. Il verra la manche
    //  s'ouvrir arriver par le journal, comme le reste.
    async function ouvrirLaManche(file) {
        if (!moi.cerveau || !moi.etat) return null;
        if (moi.etat.phase === "Resolution") return null;

        const pas = ouvrirManche(moi.etat, file, creerDes(moi.etat.graine));
        if (!pas) return null;

        const soucis = verifierEtatCombat(pas.etat);
        if (soucis.length > 0) {
            tracer("❌", "manche non ouverte : état incohérent", soucis.join(" | "));
            return null;
        }
        pas.etat.battement = maintenant();
        await depot.publier(pas.etat, pas.entree, []);
        tracer("🔄", `manche ${pas.etat.manche} ouverte`,
               `${pas.etat.file.length} combattants`);
        tourner();
        return pas.entree.v;
    }

    // Fermer une rencontre, c'est ne rien en laisser : ni journal, ni
    // intentions, ni état. Le combat suivant doit trouver la place nette.
    async function fermer() {
        try { await effacerLeCombat(io, idPartie); } catch (e) {}
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
        ouvrir, rejoindre, fermer, brancher, debrancher, tourner, ok, ouvrirLaManche, reprojeter,
        demander, demanderMouvement, demanderCarte, demanderFinDeTour,
        // De quoi regarder l'intérieur, pour la trace et les bancs.
        spectateur,
        etatPublie: () => moi.etat,
        etatAffiche: () => spectateur.etat(),
        vue: () => spectateur.vue(),
        jeSuisLeCerveau: () => !!moi.cerveau,
        ouvertureAilleurs: () => moi.ouvertureAilleurs,
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

// =========================================================================
//  3. LA FABRIQUE — LE RÉGIME BRANCHÉ SUR LE VRAI JEU
// =========================================================================
//  `creerRegime` ne lit aucune variable globale : c'est ce qui permet au banc
//  d'en faire tourner trois côte à côte. Cette fonction-ci est l'inverse : elle
//  ne fait QUE lire les globales du jeu et les ranger dans le contexte attendu.
//
//  Tout ce qu'elle contient est donc de la traduction, et rien d'autre. C'est
//  volontairement le seul endroit qui connaisse à la fois les deux mondes.

// LE CERVEAU DOIT POUVOIR RENDRE LA MAIN SANS ATTENDRE UNE NOTIFICATION.
//
// C'était le défaut du premier essai : le retour à la préparation n'était appelé
// que depuis regimeSuivreLaPartie, c'est-à-dire à chaque notification du
// document de la partie. Or, une fois le combat ouvert, PLUS RIEN N'ÉCRIT dans
// ce document — le cerveau n'écrit que son propre état. Aucune notification, donc
// aucun retour à la préparation, et la manche 2 ne démarrait jamais : « la file
// est vide » toutes les cinq secondes, pour toujours.
//
// Le cerveau publie son état : c'est CE moment-là qu'il faut écouter.
let rendreLaMainAuxJoueurs = () => {};

// C'EST À MOI DE JOUER : EST-CE QUE JE PEUX ?
//
// Le seul chemin par lequel un joueur lance sa carte pendant son tour est le
// bouton doré « Appliquer » (competences.js). Il n'apparaît que si TROIS choses
// sont vraies au moment du rendu : la phase est « Resolution », mon héros est en
// TÊTE de la file, et son entrée porte l'identifiant de sa carte.
//
// Quand ces trois choses sont vraies et que le bouton n'est PAS là, le joueur
// est devant un écran mort et personne ne le sait — ni lui, ni la trace, ni moi.
// C'est ce qui a coûté la troisième soirée d'essai : « le cerveau attend
// PERSO_338423 » pendant vingt-cinq secondes, et rien pour dire que le poste de
// PERSO_338423 n'avait aucun bouton à cliquer.
//
// Une ligne par tour, jamais plus : c'est un diagnostic, pas un journal.
let tourVerifie = "";

function verifierQueJePeuxJouer(file) {
    if (typeof document === "undefined") return;
    const tete = (file || [])[0];
    if (!tete) { tourVerifie = ""; return; }

    const aMoi = typeof window.estMonHerosCombat === "function"
              && window.estMonHerosCombat(tete.idPersonnage);
    if (!aMoi) { tourVerifie = ""; return; }

    const cle = tete.idPersonnage + "|" + (tete.idCarte || "");
    if (tourVerifie === cle) return;
    tourVerifie = cle;

    // DEUX ATTENTES PARFAITEMENT NORMALES, qu'il ne faut pas confondre avec une
    // panne. Un REPOS LONG n'a pas de bouton « Appliquer » : il se joue par
    // FIN DU TOUR, et c'est très bien. Et une demande déjà envoyée attend
    // simplement la réponse du cerveau.
    if (tete.idCarte === "REPOS_LONG") {
        if (typeof window.tracerCombat === "function") {
            window.tracerCombat("🎯", `à moi de jouer : ${tete.idPersonnage}`,
                                "repos long — c'est FIN DU TOUR qui le joue");
        }
        return;
    }
    if (window.regimeDemande && typeof window.regimeDemande.enVol === "function"
        && window.regimeDemande.enVol(tete.idPersonnage)) {
        return;
    }

    const bouton = document.getElementById("btn-appliquer-carte");
    const voile = !!window.EVENEMENT_ATTENDU;
    if (bouton && !voile) {
        if (typeof window.tracerCombat === "function") {
            window.tracerCombat("🎯", `à moi de jouer : ${tete.idPersonnage}`,
                                `bouton Appliquer prêt (${tete.idCarte || "sans carte"})`);
        }
        return;
    }
    if (typeof window.tracerCombat === "function") {
        window.tracerCombat("🧊", `à moi de jouer mais RIEN À CLIQUER : ${tete.idPersonnage}`,
                            [`carte ${tete.idCarte || "ABSENTE"}`,
                             bouton ? "bouton présent" : "bouton Appliquer absent",
                             voile ? "la fenêtre sombre est encore levée" : "pas de voile"].join(" · "));
    }
}

// Une panne d'affichage se dit UNE FOIS, avec son nom et sa cause. Répétée à
// chaque étape elle noierait la trace ; jamais dite, elle coûte une soirée.
const PANNES_VUES = new Set();

function signalerPanne(nom, cause) {
    const message = cause && cause.message ? cause.message : String(cause);
    const cle = nom + "|" + message;
    if (PANNES_VUES.has(cle)) return;
    PANNES_VUES.add(cle);
    if (typeof window !== "undefined" && typeof window.tracerCombat === "function") {
        window.tracerCombat("💣", `${nom} a échoué`, message);
    }
    console.error(`Projection : ${nom} a échoué —`, cause);
}

function contexteDuJeu() {
    return {
        io: window.ioCombatFirestore,
        idPartie: window.ID_PARTIE_COURANTE,
        poste: (() => {
            try { return localStorage.getItem("ID_JOUEUR_COURANT") || "poste-inconnu"; }
            catch (e) { return "poste-inconnu"; }
        })(),

        // « Ce combattant est-il un héros de ce poste ? » — c'est ce qui décide
        // si la fenêtre sombre s'ouvre. Le mien, non : je sais déjà ce que j'ai
        // demandé.
        estAMoi: (id) => typeof window.estMonHerosCombat === "function"
                         && window.estMonHerosCombat(id),

        // LA TECHNIQUE D'UNE CRÉATURE, TELLE QUE LA FORGE L'A ÉCRITE.
        //
        // Elle est lue à l'AVANCE et rangée dans CARTES_DU_CERVEAU (voir
        // preparerLesCartes ci-dessous). La lecture, elle, demande sept cents
        // lignes d'extraction et un aller-retour asynchrone ; le cerveau, lui,
        // est synchrone. On ne peut donc pas la faire au moment de jouer.
        //
        // La première version se contentait de `data.attaques`, un champ qui
        // n'existe pas : la Forge écrit `Composants.actions`. Les créatures
        // lançaient donc une carte VIDE — elles marchaient, « renonçaient », et
        // on ne voyait ni animation ni dégât. C'est exactement ce que la table
        // a constaté.
        carteDe: (idMonstre, idCarte) => {
            const prete = (window.CARTES_DU_CERVEAU || {})[idMonstre];
            if (!prete || prete.idCarte !== idCarte) return null;
            return prete;
        },

        // LE TERRAIN. Le noyau ne connaît pas la carte du plateau — c'est une
        // donnée de jeu, pas une règle — alors on la lui passe. Sans elle, il
        // travaillerait sur une plaine infinie et ferait traverser les murs.
        plateau: {
            etatCase: (q, r) => {
                if (!window.PLATEAU_VTT || typeof window.PLATEAU_VTT.getCaseState !== "function") {
                    return { bloquee: false, supprimee: false, difficile: false };
                }
                const e = window.PLATEAU_VTT.getCaseState(q, r) || {};
                return { bloquee: !!e.isBlocked, supprimee: !!e.isDeleted, difficile: !!e.isDifficult };
            }
        },

        // LES ANIMATIONS. Ce sont celles du jeu, telles quelles — on ne les
        // réécrit pas, on les appelle. Seul `ruee` est neuf : montrer une carte
        // partir sans la résoudre n'existait pas, puisque tout était mêlé.
        animations: {
            pas: (d) => window.jouerAnimationPas ? window.jouerAnimationPas(d) : null,
            poussee: (d) => window.jouerAnimationPoussee ? window.jouerAnimationPoussee(d) : null,
            bond: (d) => window.jouerAnimationBond ? window.jouerAnimationBond(d) : null,
            ruee: (d) => window.jouerRueeCarte ? window.jouerRueeCarte(d) : null,
            jauge: (...a) => window.afficherFlashDegatToken ? window.afficherFlashDegatToken(...a) : null,
            message: (pion, texte, couleur, options) => {
                const tk = (window.TOKENS_VTT_DATA || {})[pion];
                if (tk && typeof window.afficherMessageFlottantHex === "function") {
                    window.afficherMessageFlottantHex(tk.q, tk.r, texte, couleur, options || {});
                }
            },
            // L'esquive : le mot qui monte ET le pion qui se dérobe. Les deux
            // vivent dans animerEsquive (combat.js), à un seul endroit.
            esquive: (d) => {
                if (typeof window.animerEsquive === "function") return window.animerEsquive(d);
                const tk = (window.TOKENS_VTT_DATA || {})[d.idCible];
                if (tk && typeof window.afficherMessageFlottantHex === "function") {
                    window.afficherMessageFlottantHex(tk.q, tk.r, d.texte, d.couleur);
                }
            },
            opportunite: (d) => window.jouerAnimationOpportunite
                ? window.jouerAnimationOpportunite(d) : null,
            zone: () => window.appliquerZonesPersistantes
                ? window.appliquerZonesPersistantes() : null
        },

        // OÙ POSER L'ÉTAT. Un seul sens : l'état descend, rien ne remonte.
        ecran: {
            lireFiches: () => window.PERSOS_PARTIE || [],
            // ON DÉPLACE LES PIONS, ON N'EN INVENTE PAS.
            //
            // La première version créait l'entrée manquante avec seulement q et
            // r. Le plateau la redessinait aussitôt, sans image ni nom : d'où
            // une volée de « GET .../undefined 404 » et trois pions fantômes
            // sur la carte. Un combattant que le plateau ne connaît pas encore
            // n'est pas à nous de le créer — c'est le chargement des pions qui
            // s'en charge, avec tout ce qu'il faut.
            poserPions: (pions) => {
                const table = window.TOKENS_VTT_DATA;
                if (!table) return;
                Object.keys(pions).forEach(id => {
                    const t = table[id];
                    if (!t) return;
                    if (pions[id].q === null || pions[id].r === null) return;
                    t.q = pions[id].q;
                    t.r = pions[id].r;
                });
            },
            poserFiches: (fiches) => {
                window.PERSOS_PARTIE = fiches;

                // LES CRÉATURES ONT LEUR PROPRE LISTE. window.MONSTRES_PARTIE est
                // lue par l'IA (pour savoir ce qu'une créature peut se payer) et
                // par la détection de victoire. On y reporte l'état combattant
                // par combattant, SANS JAMAIS EN RETIRER PERSONNE : un renfort
                // qui n'est pas encore entré ne figure pas dans les fiches, et le
                // faire disparaître d'ici ferait croire le combat gagné.
                const parId = {};
                (fiches || []).forEach(f => { if (f && f.estMonstre) parId[f.idPersonnage] = f; });
                (window.MONSTRES_PARTIE || []).forEach(m => {
                    const f = parId[m.idPersonnage];
                    if (f) Object.assign(m, f);
                });
            },
            // LA FILE DE L'ÉTAT REDESCEND DANS PARTIE_DATA — EN MÉMOIRE SEULEMENT.
            //
            // C'est ce qui manquait pour que le combat soit jouable. Le cerveau
            // écrit l'état ; le document de la partie, lui, garde la file que la
            // préparation y a posée et n'en bouge plus. Or une douzaine
            // d'endroits du jeu la lisent encore : le bouton « fin de tour », le
            // panneau des cartes, la piste d'initiative, la fenêtre sombre.
            //
            // Après le tour de la première créature, tous ces endroits croyaient
            // donc que c'était toujours à elle de jouer. Le joueur dont c'était
            // le tour ne pouvait rien faire : ni bouger, ni lancer, ni passer.
            // Le combat s'ouvrait, jouait un tour, et s'arrêtait là.
            //
            // Plutôt que de réécrire ces douze lecteurs, on leur donne la
            // vérité : l'état descend dans PARTIE_DATA et ils la lisent comme
            // ils l'ont toujours fait. Rien ne remonte en base — c'est une
            // projection, pas une écriture.
            poserFile: (file, infos) => {
                const partie = window.PARTIE_DATA;
                if (partie) {
                    partie.File_Attente_Combat = file;
                    partie.Phase_Combat = infos.phase;
                    partie.Tour_Combat = infos.manche;
                    partie.Ont_Joue_Ce_Round = infos.ontJoue;
                }
                // UN RAFRAÎCHISSEMENT QUI TOMBE NE DOIT PLUS TOMBER EN SILENCE.
                //
                // Ces trois appels étaient sous `catch (e) {}`. C'est la pire
                // ligne de tout le fichier : `actualiserEtatCarteCombat` est ce
                // qui fait apparaître le bouton « Appliquer » — le SEUL chemin
                // par lequel un joueur lance sa carte pendant son tour. Si elle
                // lève une exception, le joueur clique dans le vide, la trace ne
                // dit rien, et on cherche ailleurs pendant une soirée entière.
                //
                // On avale toujours l'exception (le combat ne doit pas s'arrêter
                // pour un bouton), mais on la NOMME, une fois par sorte de panne
                // pour ne pas inonder la trace à chaque étape.
                [["afficherPisteInitiative", () => window.afficherPisteInitiative(file, infos.phase)],
                 ["actualiserBoutonFinTour", () => window.actualiserBoutonFinTour(file, infos.phase)],
                 ["actualiserEtatCarteCombat", () => window.actualiserEtatCarteCombat()]]
                    .forEach(([nom, appel]) => {
                        if (typeof window[nom] !== "function") { signalerPanne(nom, "absent de la page"); return; }
                        try { appel(); } catch (e) { signalerPanne(nom, e); }
                    });
                if (typeof window.regimeOublierDemande === "function") {
                    window.regimeOublierDemande(file, infos.manche);
                }
                verifierQueJePeuxJouer(file);
            },
            rafraichir: () => {
                [["rafraichirAffichageCombat", () => window.rafraichirAffichageCombat()],
                 ["redessinerPions", () => window.redessinerPions()]]
                    .forEach(([nom, appel]) => {
                        if (typeof window[nom] !== "function") return;
                        try { appel(); } catch (e) { signalerPanne(nom, e); }
                    });
            }
        },

        // LA FENÊTRE SOMBRE RETIENT UN TOUR, et elle doit pouvoir le NOMMER.
        // `idCarte` manquait : la fenêtre affichait « Technique inconnue de ce
        // poste » à chaque tour, faute de savoir quelle carte annoncer. Elle
        // voyage maintenant avec l'entrée de journal.
        // Chaque état publié est une occasion de constater que la manche est
        // finie — et de rendre la main aux joueurs sans attendre que quelqu'un
        // d'autre touche le document de la partie.
        surPublication: () => rendreLaMainAuxJoueurs(),

        surFenetre: (entree) => {
            window.EVENEMENT_ATTENDU = entree
                ? { acteur: entree.acteur, tour: entree.manche, n: entree.v,
                    idCarte: entree.carte || null, type: "tour" }
                : null;
            if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
        },

        // UN TOUR EST EN TRAIN DE SE REJOUER : LA FENÊTRE SE LÈVE.
        //
        // C'est le second écran noir que la table a vu. Après le OK, la fenêtre
        // se refermait — puis revenait aussitôt, parce que le combattant en tête
        // est encore celui dont le tour s'anime. L'animation se déroulait donc
        // derrière un voile, sans OK et sans clic possible : on ne voyait rien.
        //
        // L'ancien monde avait déjà la réponse (`EVENEMENT_EN_COURS`, lu par
        // etatSequenceTour pour lever la fenêtre pendant la relecture) ; le
        // nouveau régime ne la renseignait simplement plus.
        surRejeu: (entree) => {
            window.EVENEMENT_EN_COURS = entree
                ? { acteur: entree.acteur, tour: entree.manche, n: entree.v,
                    idCarte: entree.carte || null, type: "tour" }
                : null;
            if (typeof window.rafraichirVoileTour === "function") window.rafraichirVoileTour();
        },

        tracer: (i, q, d) => {
            if (typeof window.tracerCombat === "function") window.tracerCombat(i, q, d);
        }
    };
}

// =========================================================================
//  LES CARTES DES CRÉATURES, LUES À L'AVANCE
// =========================================================================
//  Le cerveau est synchrone : quand il fait jouer une créature, il ne peut pas
//  attendre une extraction. Or lire une carte forgée demande sept cents lignes
//  et un chargement de cache. On les lit donc TOUTES avant d'ouvrir la manche,
//  et on les range.
//
//  Ce n'est pas une optimisation : c'est la seule façon de donner au cerveau une
//  carte complète sans dupliquer l'extracteur du jeu. Et c'est cohérent avec les
//  règles — la technique d'une créature est choisie pendant la préparation et ne
//  change plus pendant la manche.
//  (La table elle-même est posée à la première lecture : ce fichier doit rester
//  chargeable hors navigateur, où `window` n'existe pas.)

async function preparerLesCartes(file) {
    if (typeof window === "undefined") return;
    window.CARTES_DU_CERVEAU = window.CARTES_DU_CERVEAU || {};
    const tracer = (i, q, d) => {
        if (typeof window.tracerCombat === "function") window.tracerCombat(i, q, d);
    };
    if (typeof window.demarrerCiblage !== "function") return;

    const aLire = (file || []).filter(f => {
        const id = f.id || f.idPersonnage;
        const perso = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === id);
        return perso && perso.estMonstre;
    });

    const table = {};
    for (const f of aLire) {
        const id = f.id || f.idPersonnage;
        const idCarte = f.carte || f.idCarte;
        if (!idCarte) continue;
        try {
            const carte = await window.demarrerCiblage(idCarte, { extraire: true, idLanceur: id });
            const data = ((window.CACHE_COMPETENCES_GLOBAL || {})[id] || {})[idCarte];
            const infos = (data && typeof window.analyserCarteMonstre === "function")
                ? window.analyserCarteMonstre(data) : { portee: 1, fatigue: 0 };
            if (!carte) {
                // Pas de carte jouable (paralysie, technique sans effet) : on le
                // dit, plutôt que de laisser la créature « renoncer » sans
                // qu'on sache pourquoi.
                tracer("🃏", `${id} n'a pas de carte jouable`, idCarte);
                continue;
            }
            table[id] = {
                idCarte,
                infos,
                attaques: carte.attaques || [],
                alterations: carte.alterations || [],
                isZone: !!carte.isZone,
                zoneHexesBase: carte.zoneHexesBase || []
            };
        } catch (e) {
            tracer("❌", `carte de ${id} illisible`, String(e && e.message));
        }
    }
    window.CARTES_DU_CERVEAU = table;
    const compte = Object.keys(table).length;
    tracer("🃏", `${compte} technique(s) de créature prête(s)`,
           Object.entries(table).map(([id, c]) => `${id}:${(c.attaques || []).length} att.`).join(" "));
}

// L'ÉTAT DE DÉPART, tiré de ce que le jeu a déjà en mémoire. C'est le pont
// entre l'ancien monde et le nouveau, et il ne sert qu'à OUVRIR un combat :
// après quoi l'état ne vient plus que de lui-même.
function sourceDuJeu() {
    const partie = window.PARTIE_DATA || {};
    return {
        // L'IDENTITÉ DE CETTE RENCONTRE. Elle est posée par le jeu quand les
        // créatures sont générées (ID_Rencontre, monstres.js), donc les trois
        // postes lisent la MÊME valeur — c'est ce qui permet à la réclamation
        // d'ouverture de savoir qu'ils parlent bien du même combat.
        //
        // Sans elle (une partie ouverte avant ce changement), on retombe sur la
        // manche : moins précis, mais jamais vide.
        combat: partie.ID_Rencontre || ("manche_" + (partie.Tour_Combat || 1)),
        graine: (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0,
        combattants: window.PERSOS_PARTIE || [],
        positions: window.TOKENS_VTT_DATA || {},
        partie,
        zones: window.ZONES_PERSISTANTES || {},
        regles: {
            // LES MAXIMA D'ABORD, parce que ce sont eux qui ont fait échouer le
            // premier vrai combat : un Humain a +10 d'énergie maximale par
            // l'atout de son peuple, la fiche porte 100 et le jeu calcule 110.
            // Lire le champ brut donnait « 110 d'énergie pour un maximum de
            // 100 », et les invariants refusaient d'ouvrir le combat — à juste
            // titre.
            pvMax: window.pvMaxCombattant,
            fatigueMax: window.fatigueMaxCombattant,
            esquive: window.esquiveCombattant,
            parade: window.paradeCombattant,
            defPhysique: window.defPhysiqueCombattant,
            defMagique: window.defMagiqueCombattant,
            critique: window.critiqueCombattant,
            atouts: window.atoutRace,
            bonusEquip: window.bonusEquip
        }
    };
}

if (typeof window !== "undefined") {
    // LE NOUVEAU RÉGIME EST LE RÉGIME. Il était éteint par défaut le temps de
    // l'essayer ; il ne l'est plus. L'ancien reste dans le dépôt — on ne
    // supprime rien tant que le nouveau n'a pas tenu plusieurs vraies parties —
    // mais il n'est plus le comportement par défaut de personne.
    window.REGIME_CERVEAU = window.REGIME_CERVEAU !== false;

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
        const choix = localStorage.getItem("REGIME_CERVEAU");
        if (choix === "0") window.REGIME_CERVEAU = false;
        if (choix === "1") window.REGIME_CERVEAU = true;
    } catch (e) {}

    // =====================================================================
    //  LE RÉGIME DU JEU — UN SEUL, ET IL SUIT LA PARTIE
    // =====================================================================
    let REGIME = null;
    let partieSuivie = null;
    let phasePrecedente = null;
    let aPrevenuSansCombat = false;
    let ouvertureEnCours = false;

    window.regimeDuJeu = () => REGIME;

    // Appelé à chaque notification de la partie (app.js). C'est le seul point
    // d'entrée du nouveau régime dans l'ancien monde, et il tient en quatre cas.
    window.regimeSuivreLaPartie = function(partie) {
        if (!partie) return;

        // ON ANNONCE LE RÉGIME AU DÉBUT DE CHAQUE COMBAT, ALLUMÉ OU NON.
        //
        // La première vraie partie d'essai a tourné entièrement en ancien
        // régime sans que rien ne le dise : la trace montrait des verrous et
        // des Action_*, et il a fallu la relire ligne à ligne pour comprendre
        // que le drapeau n'était simplement pas allumé. Une trace qui ne dit
        // pas dans quel monde elle se trouve fait perdre une soirée.
        const phaseVue = partie.Phase_Combat || "Preparation";
        if (phaseVue === "Resolution" && phasePrecedente === "Preparation"
            && typeof window.tracerCombat === "function") {
            window.tracerCombat("⚙️", `combat en régime ${window.REGIME_CERVEAU ? "CERVEAU" : "ANCIEN"}`,
                                window.REGIME_CERVEAU ? "(un seul poste écrit)" : "(verrous et Action_*)");
        }

        if (!window.REGIME_CERVEAU) { phasePrecedente = phaseVue; return; }
        if (!window.ID_PARTIE_COURANTE || !window.ioCombatFirestore) return;

        // 1. On a changé de partie : on repart de zéro.
        if (partieSuivie && partieSuivie !== window.ID_PARTIE_COURANTE) {
            if (REGIME) REGIME.debrancher();
            REGIME = null;
            partieSuivie = null;
            phasePrecedente = null;
            aPrevenuSansCombat = false;
        }

        const phase = partie.Phase_Combat || "Preparation";
        const avant = phasePrecedente;
        phasePrecedente = phase;

        // 2. Pas encore branché : on se branche, et on écoute. Si un combat est
        //    déjà publié, l'état nous dira qui tient le cerveau — y compris
        //    nous, après un simple rechargement de page.
        if (!REGIME) {
            REGIME = creerRegime(contexteDuJeu());
            partieSuivie = window.ID_PARTIE_COURANTE;
            REGIME.rejoindre();
        }

        // 3. LA PHASE PASSE EN RÉSOLUTION. C'est le moment décisif : le combat
        //    commence (ou une manche s'ouvre), et le poste qui provoque ce
        //    passage est celui qui a cliqué en dernier. On le laisse prendre la
        //    main s'il n'y a pas déjà d'état publié — sinon, seul le cerveau
        //    en place ouvre la manche, et les autres ne font rien.
        if (phase === "Resolution" && avant === "Preparation") {
            const publie = REGIME.etatPublie();
            const file = (partie.File_Attente_Combat || []);

            // « Y A-T-IL UN ÉTAT PUBLIÉ ? » ÉTAIT LA MAUVAISE QUESTION.
            //
            // Elle a coûté un essai entier : l'état de la rencontre PRÉCÉDENTE
            // survivait à la réinitialisation, la réponse était donc oui, et
            // personne n'ouvrait le nouveau combat. Aucune trace, aucune
            // erreur, rien — juste un plateau qui ne démarre pas.
            //
            // La bonne question est « l'état publié parle-t-il de CETTE
            // rencontre ? ». Un état qui parle d'une autre n'a plus cours, et
            // il faut ouvrir par-dessus.
            const idCombat = sourceDuJeu().combat;
            const memeCombat = !!publie && publie.combat === idCombat;
            if (!memeCombat) {
                // SI L'OUVERTURE ÉCHOUE, LE COMBAT S'ARRÊTE — ON NE RETOMBE PAS
                // DANS L'ANCIEN RÉGIME.
                //
                // Une version précédente rebasculait pour « ne pas laisser la
                // table sans rien ». C'était une mauvaise idée : l'ancien
                // régime est cassé, et le rendre à la table sans prévenir, au
                // milieu d'une rencontre, c'est offrir une soirée de bugs à la
                // place d'un message clair.
                //
                // Un échec s'arrête donc, franchement, et se dit à l'écran :
                // mieux vaut un combat qui ne démarre pas et qu'on sait
                // pourquoi, qu'un combat qui démarre mal.
                //
                // Un ABANDON n'est pas un échec : quand un autre poste a déjà
                // réclamé cette rencontre, `ouvrir` rend null sans rien casser.
                // On le distingue par le drapeau `dejaOuvert`.
                ouvertureEnCours = true;
                // LES CARTES DES CRÉATURES D'ABORD. Le cerveau ne peut pas les
                // lire au moment de jouer : il est synchrone, et l'extraction ne
                // l'est pas. Sans cette lecture préalable, chaque créature
                // lance une carte vide.
                preparerLesCartes(file).then(() => REGIME.ouvrir(sourceDuJeu())).then(resultat => {
                    ouvertureEnCours = false;
                    if (resultat) return;
                    if (REGIME && REGIME.ouvertureAilleurs()) return;   // un autre poste a la main
                    arreterLeCombat("le combat n'a pas pu s'ouvrir");
                }).catch(e => {
                    ouvertureEnCours = false;
                    console.error("Ouverture du combat :", e);
                    arreterLeCombat("erreur pendant l'ouverture : " + (e && e.message));
                });
            } else if (REGIME.jeSuisLeCerveau()) {
                // Une nouvelle manche, de nouvelles techniques : on relit.
                preparerLesCartes(file).then(() => REGIME.ouvrirLaManche(file))
                    .catch(e => console.error("Ouverture de la manche :", e));
            }
        }

        // 4. Le cerveau garde la main pendant toute la résolution : à chaque
        //    notification, il regarde s'il a quelque chose à publier. Une
        //    intention arrivée pendant une coupure réseau est reprise ici.
        if (phase === "Resolution" && REGIME.jeSuisLeCerveau()) REGIME.tourner();

        // 4-bis. LA MANCHE EST FINIE : LE CERVEAU REND LA MAIN À LA PRÉPARATION.
        //
        // C'EST LE CHAÎNON QUI MANQUAIT, ET IL A COÛTÉ UNE SOIRÉE. En fin de
        // manche, `cloturerTour` vide la file de l'état et repasse sa phase à
        // « Preparation » : le cerveau s'arrête, comme prévu. Mais le DOCUMENT DE
        // LA PARTIE, lui, restait en « Resolution » avec la file de la manche
        // écoulée. Or c'est lui que la préparation lit : les joueurs ne pouvaient
        // plus choisir, les créatures non plus, et le passage
        // Preparation → Resolution — le seul qui ouvre une manche — ne pouvait
        // plus jamais se produire. Le combat jouait sa première manche, puis
        // répétait « la file est vide » toutes les cinq secondes, pour toujours.
        //
        // Ouvrir une manche appartient aux joueurs et se passe encore dans
        // l'ancien monde ; c'est un choix, pas un oubli. Mais alors quelqu'un
        // doit LEUR RENDRE LA MAIN, et ce quelqu'un ne peut être que le cerveau :
        // lui seul sait que la manche est finie.
        rendreLaPreparation();

        // 5. LE CAS QUI NE DOIT PAS ÊTRE SILENCIEUX : on est en résolution, le
        //    drapeau est levé, et personne n'a jamais ouvert de combat dans le
        //    nouveau régime. Ça arrive quand on coche la case au milieu d'une
        //    rencontre déjà commencée : le cerveau se donne à l'ouverture, et
        //    l'ouverture est passée.
        //
        //    Aucun poste ne prend la main de son propre chef — ce serait une
        //    élection, et c'est précisément ce qu'on a supprimé. On le DIT, une
        //    fois, au lieu de laisser un plateau qui n'avance plus sans raison
        //    visible.
        // ... et seulement si personne n'est en train d'ouvrir. Pendant la
        // réclamation, l'état n'est pas encore publié — ce n'est pas la même
        // chose que « il n'y en aura pas ». L'avertissement disait donc le
        // contraire de la vérité à chaque début de combat.
        if (phase === "Resolution" && !REGIME.etatPublie()
            && !ouvertureEnCours && !aPrevenuSansCombat) {
            aPrevenuSansCombat = true;
            if (typeof window.tracerCombat === "function") {
                window.tracerCombat("🛑", "nouveau régime coché en cours de combat",
                                    "aucun état publié — réinitialise le combat pour qu'il prenne effet");
            }
        }
        if (phase === "Preparation") { aPrevenuSansCombat = false; dejaSignale = ""; }

        // PARTIE_DATA vient d'être remplacée par la notification : on repose la
        // file de l'état par-dessus, sinon toute l'interface repart sur celle
        // que la préparation avait laissée.
        REGIME.reprojeter();
    };

    // La manche que ce poste a déjà rendue. Sans ce repère, chaque notification
    // reposterait la même écriture le temps que la nouvelle phase revienne.
    let preparationRendue = "";

    // Le cerveau publie son état sans que personne ne touche le document de la
    // partie : c'est donc SA publication qui doit réveiller le retour à la
    // préparation, pas une notification qui n'arrivera jamais.
    rendreLaMainAuxJoueurs = () => rendreLaPreparation();

    function rendreLaPreparation() {
        // ON NE SE FIE PLUS À LA PHASE LUE LOCALEMENT. window.PARTIE_DATA est
        // écrasée par la projection : elle dit la phase de l'ÉTAT, pas celle du
        // document. C'est la transaction ci-dessous qui relit la vraie, et elle
        // seule qui tranche.
        if (!REGIME || !REGIME.jeSuisLeCerveau()) return;

        const etat = REGIME.etatPublie();
        if (!etat || (etat.phase || "") !== "Preparation") return;

        const marque = (etat.combat || "") + "#" + nombre(etat.manche, 1);
        if (preparationRendue === marque) return;
        preparationRendue = marque;

        if (typeof window.tracerCombat === "function") {
            window.tracerCombat("🔄", `manche ${nombre(etat.manche, 1)} : la main revient aux joueurs`,
                                "file vidée dans la partie");
        }

        if (typeof window.modifierPartie !== "function") return;
        Promise.resolve(window.modifierPartie((data) => {
            // Un autre poste s'en est chargé entre-temps : rien à faire.
            if ((data.Phase_Combat || "Preparation") !== "Resolution") return null;
            return { maj: {
                File_Attente_Combat: [],
                Phase_Combat: "Preparation",
                Tour_Combat: nombre(etat.manche, 1),
                // Nouvelle manche : tout le monde doit rejouer.
                Ont_Joue_Ce_Round: []
            } };
        })).catch(e => {
            // L'écriture a raté : on retire le repère pour que la prochaine
            // notification réessaie. Un combat qui s'arrête ici serait pire.
            preparationRendue = "";
            console.error("Retour à la préparation :", e);
        });
    }

    // ON S'ARRÊTE, ET ON LE DIT — À L'ÉCRAN, PAS SEULEMENT DANS LA CONSOLE.
    //
    // Un plateau qui ne bouge plus sans explication, on connaît : ça coûte une
    // soirée à comprendre. Quand le nouveau régime ne peut pas démarrer, le
    // combat ne démarre pas, et le message dit quoi faire. C'est volontairement
    // brutal : mieux vaut un combat qui refuse de commencer qu'un combat qui
    // commence mal.
    let dejaSignale = "";
    function arreterLeCombat(raison) {
        if (dejaSignale === raison) return;
        dejaSignale = raison;
        if (typeof window.tracerCombat === "function") {
            window.tracerCombat("🛑", "COMBAT ARRÊTÉ", raison);
        }
        console.error("Combat arrêté : " + raison
                      + " — la cause est dans la ligne ❌ juste au-dessus de la trace.");
        if (REGIME) { REGIME.debrancher(); REGIME = null; partieSuivie = null; }
        // Une seule fenêtre, et elle dit quoi faire. Pas de bascule silencieuse
        // vers l'ancien régime : il est cassé, et le rendre à la table sans
        // prévenir serait pire que de s'arrêter.
        try {
            alert("Le combat n'a pas pu démarrer.\n\n" + raison
                  + "\n\nRegarde la console (ligne ❌) pour la cause exacte, "
                  + "puis réinitialise le combat.");
        } catch (e) {}
    }

    // LE COMBAT S'ARRÊTE (victoire, fuite, réinitialisation). On range.
    window.regimeFermerLeCombat = async function() {
        // Même sans régime branché, l'état de la rencontre précédente doit
        // partir : c'est justement quand il traîne qu'il empêche la suivante de
        // s'ouvrir. On efface donc dans tous les cas.
        if (!window.REGIME_CERVEAU) return;
        if (!REGIME) {
            try {
                if (window.ioCombatFirestore && window.ID_PARTIE_COURANTE) {
                    await effacerLeCombat(window.ioCombatFirestore, window.ID_PARTIE_COURANTE);
                }
            } catch (e) { console.error("Ménage du combat :", e); }
            phasePrecedente = null;
            return;
        }
        await REGIME.fermer();
        REGIME = null;
        partieSuivie = null;
        phasePrecedente = null;
    };

    // LES TROIS DEMANDES, TELLES QUE L'INTERFACE LES APPELLE. Elles rendent
    // `false` quand le nouveau régime n'est pas en marche : l'appelant sait
    // alors qu'il doit suivre l'ancien chemin, et une seule ligne suffit à
    // chaque point d'appel.
    // UNE DEMANDE EN VOL FERME LE TOUR TOUT DE SUITE, À L'ÉCRAN.
    //
    // Entre le moment où le joueur applique sa carte et celui où le cerveau
    // publie le pas, il s'écoule un aller-retour réseau — une demi-seconde,
    // parfois plus. Pendant ce temps, la file projetée le montre TOUJOURS en
    // tête : le bouton « Appliquer » restait donc là, et on pouvait relancer la
    // même carte une seconde fois. Le cerveau refusait bien la seconde (« c'est
    // au tour de X »), mais le joueur, lui, avait déjà vu son ciblage repartir.
    //
    // Le repère est local et volontairement bête : « j'ai demandé pour CE
    // combattant, à CETTE manche ». Il tombe dès que la file avance, c'est-à-dire
    // dès que le cerveau a répondu.
    let demandeEnVol = "";

    const marquerDemande = (acteur) => {
        const etat = REGIME && REGIME.etatAffiche();
        demandeEnVol = (acteur || "") + "|" + nombre(etat && etat.manche, 1);
    };

    // Appelée à chaque projection : si la tête de file n'est plus celle qu'on
    // attendait, la demande a abouti (ou a été refusée) et le repère tombe.
    window.regimeOublierDemande = function(file, manche) {
        if (!demandeEnVol) return;
        const tete = (file || [])[0];
        if (!tete || (tete.idPersonnage + "|" + nombre(manche, 1)) !== demandeEnVol) {
            demandeEnVol = "";
        }
    };

    window.regimeDemande = {
        actif: () => !!(window.REGIME_CERVEAU && REGIME),
        mouvement: (acteur, chemin, reserve) =>
            REGIME ? REGIME.demanderMouvement(acteur, chemin, reserve) : null,
        carte: (acteur, carte) => {
            if (!REGIME) return null;
            // On marque AVANT d'envoyer : l'écriture réseau est justement ce
            // qu'on ne veut pas laisser sans réponse à l'écran.
            marquerDemande(acteur);
            return REGIME.demanderCarte(acteur, carte);
        },
        finDeTour: (acteur) => {
            if (!REGIME) return null;
            marquerDemande(acteur);
            return REGIME.demanderFinDeTour(acteur);
        },
        ok: () => REGIME ? REGIME.ok() : null,
        // « Ce combattant a-t-il déjà demandé quelque chose pour ce tour ? »
        enVol: (acteur) => {
            if (!demandeEnVol) return false;
            if (!acteur) return true;
            return demandeEnVol.split("|")[0] === acteur;
        }
    };

    window.regimeCombat = { creerRegime, CHEMINS };
}
