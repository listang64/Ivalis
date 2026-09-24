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
//
//  QUI DEVIENT LE CERVEAU
//  ----------------------
//  Le poste qui OUVRE le combat, et lui seul. Pas d'élection, pas de vote, pas
//  de « le plus ancien gagne » : celui qui lance la rencontre est devant son
//  écran, il vient de cliquer, il est le mieux placé. C'est écrit dans l'état,
//  et l'état a un seul écrivain — donc cette désignation ne peut pas être
//  contestée par un poste en retard, ce qui était tout le problème du verrou.
// =========================================================================

import { construireEtatCombat, verifierEtatCombat, creerDes, combattantDepuisFiche,
         FORMAT_ETAT } from './combat_etat.js';
import { creerCerveau, estLeCerveau, cerveauPerdu, suivreBattement, cerveauSilencieux,
         ouvrirManche, accueillirCombattant, BATTEMENT_MS } from './cerveau_combat.js';
import { creerSpectateur } from './spectateur_combat.js';
import { creerPont, creerProjection, versAnimationDeSaut } from './pont_combat.js';
// DES NOMS QUI EXISTAIENT DÉJÀ, ET AUCUN AUTRE. Ces imports ne portent pas de
// numéro de version : un appareil peut donc, quelques minutes après une mise à
// jour, recevoir ce fichier-ci neuf et depot_firestore.js encore en cache. Un
// nom qui n'existe pas dans l'ancienne copie ferait échouer le chargement de
// tout ce fichier — plus de cerveau du tout. requeteIntentions et enAttente,
// eux, ont toujours été là.
import {
    creerDepot, ouvrirCombat, effacerLeCombat, ecouterCombat,
    lireEntree, lireDepuis, envoyerIntention, CHEMINS, requeteIntentions, enAttente
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

// Une copie sans aucune valeur `undefined` — la seule que Firestore refuse.
// Un champ d'objet qui vaut undefined disparaît ; une case de tableau qui vaut
// undefined aussi. Les chemins retirés sont notés dans `retires`, pour que la
// trace dise d'où venait le trou au lieu de le taire.
function sansIndefinis(valeur, chemin, retires) {
    if (Array.isArray(valeur)) {
        const sortie = [];
        valeur.forEach((v, i) => {
            if (v === undefined) { retires.push(`${chemin}[${i}]`); return; }
            sortie.push(sansIndefinis(v, `${chemin}[${i}]`, retires));
        });
        return sortie;
    }
    if (valeur && typeof valeur === "object" && Object.getPrototypeOf(valeur) === Object.prototype) {
        const sortie = {};
        Object.keys(valeur).forEach(cle => {
            const ici = chemin ? `${chemin}.${cle}` : cle;
            if (valeur[cle] === undefined) { retires.push(ici); return; }
            sortie[cle] = sansIndefinis(valeur[cle], ici, retires);
        });
        return sortie;
    }
    return valeur;
}

export function creerRegime(contexte) {
    const {
        io,                                  // l'accès Firestore (window.ioCombatFirestore)
        idPartie,
        poste,                               // qui je suis
        animations = {},                     // les fonctions d'animation du jeu
        ecran = {},                          // où poser l'état
        estAMoi = () => false,               // « ce combattant est-il à moi ? »
        carteDe = () => null,                // la technique d'une créature
        // LES COMBATTANTS QUI N'ÉTAIENT PAS LÀ À L'OUVERTURE. Rend les fiches,
        // au format du cerveau, de ceux que le jeu connaît et que l'état
        // ignore encore — un renfort sorti de la réserve, essentiellement.
        // Comme tout le reste ici, c'est injecté : ce fichier ne lit pas une
        // seule variable globale, et le banc peut en faire tourner trois.
        nouveauxVenus = () => [],
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
        ouvertureAilleurs: false,
        // L'écoute des intentions en attente — le cerveau seul la tient — et
        // ce qu'elle a vu : sans intention en attente et sans tour à reprendre,
        // un battement n'a aucune raison de faire tourner le cerveau.
        arretIntentions: null,
        intentionsEnAttente: 0,
        intentionEnRetard: false,
        aReprendre: false,
        // Ce qu'on sait du battement du cerveau : sa dernière valeur, et
        // l'heure — la NÔTRE — à laquelle on l'a vue changer.
        suivi: null
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
            moi.aReprendre = false;
            // QUAND LE CERVEAU NE PUBLIE RIEN, IL FAUT SAVOIR POURQUOI. Neuf
            // fois sur dix c'est normal — un joueur réfléchit — mais « rien ne
            // se passe » sans explication est précisément ce qui coûte une
            // soirée à comprendre. Une ligne, et on sait qui il attend.
            if (faits.length === 0 && moi.etat) {
                const tete = (moi.etat.file || [])[0];
                const c = tete && moi.etat.combattants[tete.id];
                // Une créature en tête qui n'a pas joué, c'est un tour qu'il
                // faudra retenter au prochain battement — pas un joueur qui
                // réfléchit.
                if (c && c.estMonstre && !c.aTerre && moi.etat.phase === "Resolution") moi.aReprendre = true;
                tracer("⌛", tete ? `le cerveau attend ${tete.id}` : "la file est vide",
                       c ? (c.estMonstre ? "(créature — elle devrait jouer)"
                                         : `(au joueur ${c.joueur || "?"})`)
                         : `(phase ${moi.etat.phase})`);
            }
            return faits;
        } catch (e) {
            // Une écriture qui rate n'est pas un drame : rien n'a bougé, et
            // l'intention sera reprise — au prochain battement, que cette
            // marque autorise à relancer le cerveau. Mais on le DIT — un
            // cerveau muet qui n'avance plus est exactement ce qu'on ne veut
            // plus jamais voir.
            moi.aReprendre = true;
            tracer("❌", "le cerveau n'a pas pu publier", String(e && e.message));
            return [];
        } finally {
            moi.enTrainDeTourner = false;
            if (moi.intentionEnRetard) {
                moi.intentionEnRetard = false;
                programmer(() => { tourner(); }, 0);
            }
        }
    }

    // LE CERVEAU ÉCOUTE LES INTENTIONS EN ATTENTE, ET RIEN D'AUTRE.
    //
    // Il n'en était prévenu que par son propre battement : toutes les cinq
    // secondes, l'écho du battement le faisait tourner, et chaque tour relisait
    // la collection ENTIÈRE des intentions de la rencontre. C'est ce sondage,
    // multiplié par des centaines d'intentions accumulées, qui a vidé le quota
    // Firebase du jour en pleine partie — après quoi plus aucune carte choisie
    // ne s'inscrivait, et le combat ne se lançait plus. Une écoute sur les
    // seules intentions en attente le réveille au moment où l'une arrive, pour
    // une lecture chacune.
    function ecouterLesIntentions() {
        if (moi.arretIntentions || !io || typeof io.ecouterCollection !== "function") return;
        moi.arretIntentions = io.ecouterCollection(CHEMINS.intentions(idPartie), requeteIntentions(), (docs) => {
            const enCours = enAttente(docs || []);
            moi.intentionsEnAttente = enCours.length;
            if (enCours.length === 0) return;
            // Le cerveau tourne déjà : sa boucle a peut-être relu les
            // intentions juste AVANT celle-ci. On le note, et il repartira
            // dès qu'il aura fini — sinon elle attendrait le battement.
            if (moi.enTrainDeTourner) { moi.intentionEnRetard = true; return; }
            tourner();
        });
    }
    function arreterLesIntentions() {
        if (moi.arretIntentions) { try { moi.arretIntentions(); } catch (e) {} }
        moi.arretIntentions = null;
        moi.intentionsEnAttente = 0;
    }

    // =====================================================================
    //  REPRENDRE LA MAIN
    // =====================================================================
    //  Le cerveau d'un combat vit dans UN navigateur. Si celui-là ferme son
    //  onglet, part en veille ou perd le réseau, la table entière s'arrête : plus
    //  personne n'écrit, et rien ne le dit. C'était le dernier point où une
    //  soirée pouvait mourir sans un mot.
    //
    //  La reprise est volontaire — un bouton, jamais une élection automatique :
    //  un wifi qui hoquette ne doit pas faire changer de cerveau en plein tour.
    //  Mais la PRISE, elle, est atomique : trois postes peuvent cliquer à la même
    //  seconde, Firestore n'en laisse passer qu'un.
    async function reprendreLaMain() {
        if (!moi.etat) return false;
        if (estLeCerveau(moi.etat, poste)) return true;

        // ON NE PREND PAS LA MAIN D'UN CERVEAU VIVANT, et cette garde est ICI,
        // pas chez l'appelant. Un bouton peut être cliqué par erreur, une
        // interface peut se tromper ; la règle, elle, ne doit dépendre de
        // personne. Sans cette ligne, n'importe quel clic volait le cerveau en
        // plein tour — le banc l'a pris la main dans le sac.
        if (!cerveauSilencieux(moi.suivi, maintenant())) {
            tracer("🤝", "la main n'a pas été reprise", "(le cerveau répond toujours)");
            return false;
        }

        const combatVise = moi.etat.combat;
        const pris = await depot.reprendre((actuel) => {
            if (!actuel) return null;
            // Un état qui parle d'un autre combat : ce n'est pas celui qu'on
            // regarde, on n'y touche pas.
            if (actuel.combat !== combatVise) return null;
            if (estLeCerveau(actuel, poste)) return null;          // déjà à nous
            // Le battement a-t-il repris entre-temps ? On relit la valeur : si
            // elle a bougé depuis celle qu'on tient, le cerveau est revenu.
            if (nombre(actuel.battement) !== nombre(moi.suivi && moi.suivi.valeur)) return null;
            return { ...actuel, cerveau: poste, battement: maintenant() };
        });

        if (pris) {
            tracer("🧠", "ce poste REPREND la main", "(l'ancien cerveau ne répondait plus)");
        } else {
            tracer("🤝", "la main n'a pas été reprise", "(un autre poste l'a prise, ou le cerveau est revenu)");
        }
        return pris;
    }

    // Le battement de cœur. Il ne sert qu'à une chose : permettre aux autres
    // postes de constater que ce cerveau est vivant — et, s'il se tait trop
    // longtemps, de proposer à la table de reprendre la main.
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
                        arreterLesIntentions();
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
                // L'ÉCHO D'UN BATTEMENT : même combat, même version. Le battement
                // ne réécrit que son propre champ ; rien de ce que le cerveau
                // sait faire n'a changé, et le faire tourner là-dessus, c'était
                // payer une relecture complète toutes les cinq secondes.
                const echoDuBattement = !changementDeCombat
                    && nombre(moi.etat.version) === nombre(etat.version);
                moi.etat = etat;

                // On (re)prend la main si l'état nous désigne, on la lâche
                // sinon. C'est déclaratif : aucune négociation.
                const aMoi = estLeCerveau(etat, poste);
                const devientCerveau = aMoi && !moi.cerveau;
                if (devientCerveau) {
                    moi.cerveau = creerCerveau(depot, { poste, plateau, carteDe, maintenant, tracer });
                    tracer("🧠", "ce poste tient le cerveau", `(version ${etat.version})`);
                    battre();
                    ecouterLesIntentions();
                } else if (!aMoi && moi.cerveau) {
                    moi.cerveau = null;
                    arreterLesIntentions();
                    tracer("👀", "ce poste regarde", `(le cerveau est ${etat.cerveau})`);
                }

                // Un état vient d'arriver : l'appelant peut avoir quelque chose à
                // en conclure. C'est par là que le cerveau constate qu'une manche
                // est finie et rend la main aux joueurs — sans quoi il faudrait
                // attendre qu'un tiers touche le document de la partie, ce que
                // plus personne ne fait une fois le combat ouvert.
                // LE BATTEMENT, SUIVI SUR NOTRE PROPRE MONTRE. Chaque état qui
                // arrive porte le battement du cerveau ; tant qu'il change, il
                // est vivant. On ne compare jamais deux horloges d'appareils.
                moi.suivi = suivreBattement(moi.suivi, etat, maintenant());

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

                // Un vrai changement d'état, une prise de main, une intention qui
                // attend ou un tour qui a raté : là, le cerveau a du travail.
                // L'écho d'un battement, seul, n'en apporte aucun.
                if (aMoi && (!echoDuBattement || devientCerveau || moi.aReprendre
                             || moi.intentionsEnAttente > 0)) tourner();
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
        arreterLesIntentions();
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
    //  FAIRE ENTRER CEUX QUI SONT ARRIVÉS APRÈS L'OUVERTURE
    // =====================================================================
    //  Le cerveau arrête sa liste de combattants quand le combat s'ouvre. Ça a
    //  tenu tant qu'aucune créature ne mourait : la réserve envoie un
    //  remplaçant dès qu'une place se libère, et ce remplaçant recevait bien un
    //  document, un pion et une ligne dans l'ordre d'initiative — mais restait
    //  INCONNU DU CERVEAU. `ouvrirManche` l'écartait donc de la file, et il
    //  passait la rencontre entière planté sur le plateau sans jamais jouer.
    //
    //  On accueille juste avant d'ouvrir la manche : c'est le seul instant où
    //  ça compte, et c'est aussi le seul où l'état est au calme.
    async function accueillirLesNouveaux() {
        if (!moi.cerveau || !moi.etat) return 0;
        let entres = 0;
        for (const venu of (nouveauxVenus(moi.etat) || [])) {
            const pas = accueillirCombattant(moi.etat, venu, creerDes(moi.etat.graine));
            if (!pas) continue;
            const soucis = verifierEtatCombat(pas.etat);
            if (soucis.length > 0) {
                tracer("❌", `${venu.id} non accueilli : état incohérent`, soucis.join(" | "));
                continue;
            }
            pas.etat.battement = maintenant();
            try {
                await depot.publier(pas.etat, pas.entree, []);
            } catch (e) {
                // Une écriture bousculée n'emporte pas la manche avec elle :
                // le nouveau venu entrera à la suivante.
                tracer("❌", `${venu.id} non accueilli`, String(e && e.message));
                continue;
            }
            // ON AVANCE L'ÉTAT LOCAL TOUT DE SUITE, sans attendre que la
            // notification nous revienne. Sinon le pas suivant — l'ouverture de
            // la manche, à quelques lignes d'ici — repartirait de l'état
            // d'AVANT l'arrivée et la publierait par-dessus : le renfort
            // entrait, puis disparaissait aussitôt. La notification repassera
            // la même chose, et ça ne coûte rien.
            moi.etat = pas.etat;
            tracer("🐲", `${venu.nom || venu.id} entre dans le combat`,
                   `case (${venu.q},${venu.r})`);
            entres++;
        }
        return entres;
    }

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

        // Un renfort inscrit dans la file par l'IA doit EXISTER avant qu'on
        // ouvre, sinon ouvrirManche l'écarte silencieusement.
        await accueillirLesNouveaux();
        if (!moi.etat || moi.etat.phase === "Resolution") return null;

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
            // Firestore refuse la moindre valeur `undefined`, et l'écriture
            // tombe alors en entier : la carte n'était jamais jouée, et le
            // tour restait figé. Un champ vide ne doit jamais coûter une
            // technique — il est retiré, et la trace dit lequel.
            const retires = [];
            const propre = sansIndefinis({ ...intention, poste }, "", retires);
            if (retires.length > 0) {
                tracer("🧹", `${intention.type} : champ(s) vide(s) retiré(s)`, retires.slice(0, 6).join(", "));
            }
            const id = await envoyerIntention(io, idPartie, propre);
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
                   coutFatigue: nombre(carte.coutFatigue),
                   // La nappe que la carte laisse au sol, et les cases qu'elle
                   // couvre. Du ciblage, pas un résultat : le joueur les a
                   // désignées, le cerveau en fait une zone.
                   persistanceTerrain: !!carte.persistanceTerrain,
                   zoneHexes: carte.zoneHexes || [],
                   // La case de repli, choisie à l'écran avant l'envoi : la
                   // carte clôt le tour, une demande envoyée après serait
                   // refusée. Absente, la carte ne se replie pas.
                   ...(carte.repli && carte.repli.vers ? { repli: {
                       vers: { q: nombre(carte.repli.vers.q), r: nombre(carte.repli.vers.r) },
                       portee: nombre(carte.repli.portee, 3), chance: nombre(carte.repli.chance, 60) } } : {}),
                   // Le Bond placé après l'attaque : même raison que le repli.
                   ...(carte.bond && carte.bond.vers ? { bond: {
                       vers: { q: nombre(carte.bond.vers.q), r: nombre(carte.bond.vers.r) },
                       portee: nombre(carte.bond.portee, 2) } } : {}) });

    // Le saut. La case a été choisie à l'écran ; ce qui part d'ici est une
    // intention, pas un déplacement déjà fait.
    const demanderBond = (acteur, vers, portee) =>
        demander({ type: "bond", acteur, vers: { q: nombre(vers.q), r: nombre(vers.r) },
                   portee: nombre(portee, 1) });

    // Le leurre. Son identité (nom, image) est un document Personnages créé par
    // le lanceur ; ce qui part d'ici, c'est son entrée dans le combat.
    const demanderIllusion = (acteur, idIllusion, vers) =>
        demander({ type: "illusion", acteur, idIllusion,
                   vers: { q: nombre(vers.q), r: nombre(vers.r) } });

    const demanderFinDeTour = (acteur) => demander({ type: "finTour", acteur });

    // Le OK de la fenêtre sombre. Purement local, comme avant : chacun lit à
    // son rythme et rattrape ensuite. Aucun poste n'attend un autre.
    const ok = () => spectateur.ok();

    return {
        ouvrir, rejoindre, fermer, brancher, debrancher, tourner, ok, ouvrirLaManche, reprojeter,
        accueillirLesNouveaux,
        reprendreLaMain,
        demander, demanderMouvement, demanderCarte, demanderBond, demanderIllusion,
        demanderFinDeTour,
        // De quoi regarder l'intérieur, pour la trace et les bancs.
        spectateur,
        etatPublie: () => moi.etat,
        etatAffiche: () => spectateur.etat(),
        vue: () => spectateur.vue(),
        jeSuisLeCerveau: () => !!moi.cerveau,
        ouvertureAilleurs: () => moi.ouvertureAilleurs,
        cerveauPerdu: () => cerveauPerdu(moi.etat, maintenant()),
        // La vraie question, celle qui ne compare pas deux montres : depuis
        // combien de temps ce poste n'a-t-il plus vu le battement changer ?
        cerveauSilencieux: () => cerveauSilencieux(moi.suivi, maintenant())
    };
}

// =========================================================================
//  2. LA FABRIQUE — LE RÉGIME BRANCHÉ SUR LE VRAI JEU
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
// bouton fin de tour (combat.js, actualiserBoutonFinTour), sous son image
// « lancer ». Il ne prend ce visage que si TROIS choses sont
// vraies au moment du rendu : la phase est « Resolution », mon héros est en
// TÊTE de la file, et son entrée porte l'identifiant de sa carte.
//
// Quand ces trois choses sont vraies et que le bouton n'a PAS ce visage, le
// joueur est devant un écran mort et personne ne le sait — ni lui, ni la
// trace, ni moi.
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

    const pret = document.getElementById("img-hud-fintour") && window.MODE_BOUTON_FINTOUR === "lancer";
    const voile = !!window.EVENEMENT_ATTENDU;
    if (pret && !voile) {
        if (typeof window.tracerCombat === "function") {
            window.tracerCombat("🎯", `à moi de jouer : ${tete.idPersonnage}`,
                                `bouton fin de tour prêt (${tete.idCarte || "sans carte"})`);
        }
        return;
    }
    if (typeof window.tracerCombat === "function") {
        window.tracerCombat("🧊", `à moi de jouer mais RIEN À CLIQUER : ${tete.idPersonnage}`,
                            [`carte ${tete.idCarte || "ABSENTE"}`,
                             pret ? "bouton prêt" : "bouton fin de tour pas sur « lancer »",
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

// Quel poste je suis. Lu à la demande plutôt que gardé : le même calcul servait
// déjà à l'ouverture du régime, il sert maintenant aussi à savoir si c'est à moi
// d'effacer un leurre tombé.
function monPoste() {
    try { return localStorage.getItem("ID_JOUEUR_COURANT") || "poste-inconnu"; }
    catch (e) { return "poste-inconnu"; }
}

// Les illusions déjà effacées. Sans cette mémoire, chaque projection d'état
// redemanderait la suppression du même document : une volée d'erreurs de
// console pour un leurre qui a déjà disparu.
const LEURRES_EFFACES = new Set();

// Les créatures déjà déclarées mortes. Même raison que ci-dessus : sans cette
// mémoire, chaque projection redemanderait le marquage et un renfort de plus.
// Elle s'oublie au changement de partie : les deux combats n'ont rien en commun.
const TOMBES_ANNONCEES = new Set();

function contexteDuJeu() {
    return {
        io: window.ioCombatFirestore,
        idPartie: window.ID_PARTIE_COURANTE,
        poste: monPoste(),

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

        // CEUX QUI NE SONT PAS ENTRÉS AVEC LES AUTRES.
        //
        // L'ordre d'initiative de la PARTIE fait foi : c'est là que
        // `poserMonstreSurTerrain` inscrit un renfort sorti de la réserve. Tout
        // ce qui s'y trouve et que l'état du cerveau ne connaît pas encore est
        // un nouveau venu — à condition qu'on ait sa fiche ET son pion, sans
        // quoi on fabriquerait un combattant sans case, c'est-à-dire un
        // fantôme. On n'invente rien : on repasse au tour d'après.
        //
        // Le leurre de l'Illusion n'entre jamais dans l'ordre d'initiative :
        // il ne peut donc pas passer par ici deux fois.
        nouveauxVenus: (etat) => {
            const partie = window.PARTIE_DATA || {};
            const connus = (etat && etat.combattants) || {};
            const fiches = window.PERSOS_PARTIE || [];
            const pions = window.TOKENS_VTT_DATA || {};
            const regles = reglesDuJeu();
            const venus = [];
            (partie.Ordre_Initiative || []).forEach(id => {
                if (!id || connus[id]) return;
                const fiche = fiches.find(f => f && f.idPersonnage === id);
                const pion = pions[id];
                if (!fiche || !pion || pion.q === undefined || pion.r === undefined) return;
                try { venus.push(combattantDepuisFiche(fiche, pion, regles)); }
                catch (e) { console.error("Accueil d'un combattant :", e); }
            });
            return venus;
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
        // réécrit pas, on les appelle. Seuls `ruee` et `projectile` sont neufs :
        // montrer une carte partir sans la résoudre n'existait pas, puisque tout
        // était mêlé, et un tir ne se voyait pas traverser le plateau.
        animations: {
            pas: (d) => window.jouerAnimationPas ? window.jouerAnimationPas(d) : null,
            // versAnimationDeSaut traduit `de`/`vers` (le vocabulaire du pont)
            // en `depart`/`arrivee` (celui de ces deux animations, écrites
            // pour l'ancien monde). Une Poussée sortie du cerveau est allée
            // droit sur un « arrivee.q de undefined », en pleine partie, parce
            // que cette traduction n'existait que pour le Bond : l'avoir
            // écrite deux fois, à la main, a laissé passer l'oubli.
            poussee: (d) => window.jouerAnimationPoussee
                ? window.jouerAnimationPoussee(versAnimationDeSaut(d)) : null,
            bond: (d) => window.jouerAnimationBond
                ? window.jouerAnimationBond(versAnimationDeSaut(d)) : null,
            ruee: (d) => window.jouerRueeCarte ? window.jouerRueeCarte(d) : null,
            // Le tir : la flèche, la boule bleue, la boule verte. Ce que la
            // carte envoie a été décidé par le noyau (projectileDe) et voyage
            // sur l'étape — ici on ne fait que le dessiner.
            projectile: (d) => window.animerProjectile ? window.animerProjectile(d) : null,
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
            // LES NAPPES AU SOL DESCENDENT DE L'ÉTAT, comme les pions. Elles
            // vivaient dans une variable globale que seul l'ancien moteur
            // nourrissait ; le cerveau les porte maintenant, et cette ligne les
            // rend visibles. On ne réécrit rien en base : le dessin suit l'état,
            // il ne le devance pas.
            poserZones: (zones) => {
                window.ZONES_PERSISTANTES = zones || {};
                if (typeof window.appliquerZonesPersistantes === "function") {
                    try { window.appliquerZonesPersistantes(); }
                    catch (e) { signalerPanne("appliquerZonesPersistantes", e); }
                }
            },
            rafraichir: (etat) => {
                // UN LEURRE TOMBÉ S'EFFACE. L'illusion n'a qu'un point de vie ;
                // une fois à terre, elle n'a plus rien à faire ni sur le
                // plateau ni en base. L'ancien moteur la retirait depuis
                // jouerAnimationMoteur, un chemin que ce régime ne traverse
                // plus : elle serait restée couchée sur la carte jusqu'à la fin
                // du combat.
                //
                // Seul le poste qui tient le cerveau efface, et une seule fois
                // par leurre : trois postes supprimant le même document, c'est
                // deux erreurs de console pour rien.
                if (etat && etat.combattants && estLeCerveau(etat, monPoste())) {
                    Object.values(etat.combattants).forEach(c => {
                        if (!c || !c.estIllusion || !c.aTerre) return;
                        if (LEURRES_EFFACES.has(c.id)) return;
                        LEURRES_EFFACES.add(c.id);
                        if (typeof window.detruireIllusion === "function") {
                            Promise.resolve(window.detruireIllusion(c.id))
                                .catch(e => signalerPanne("detruireIllusion", e));
                        }
                    });
                }

                // =====================================================
                //  UN COMBATTANT TOMBÉ CESSE D'ÊTRE ATTENDU
                // =====================================================
                //  ET C'EST LE BUG QUI A ARRÊTÉ UNE RENCONTRE ENTIÈRE.
                //
                //  Tuer une créature laissait le combat définitivement bloqué
                //  en préparation : chaque joueur choisissait sa carte, l'IA
                //  choisissait la sienne, et la manche ne s'ouvrait jamais.
                //  Aucune erreur, aucun message — juste « la file est vide »
                //  toutes les cinq secondes, pour toujours.
                //
                //  La raison tient en une phrase : le passage en Résolution est
                //  tranché par `toutLeMondeAJoue`, qui attend une carte de
                //  CHAQUE combattant de l'ordre d'initiative sauf ceux inscrits
                //  dans `Combattants_Hors_Jeu`. Or cette liste n'était tenue à
                //  jour que par `synchroniserCombattantsHorsJeu`, appelée
                //  depuis `recomposerCombattants`, elle-même déclenchée par une
                //  notification des documents Personnages/Monstres. Et depuis
                //  que le combat vit dans l'état du cerveau, ces documents NE
                //  REÇOIVENT PLUS UNE SEULE ÉCRITURE DE POINTS DE VIE. Plus
                //  d'écriture, plus de notification ; plus de notification,
                //  personne pour constater la chute. On attendait la carte d'un
                //  cadavre.
                //
                //  Même histoire pour la mort d'une créature et le renfort qui
                //  la remplace : l'ancien moteur les déclenchait depuis
                //  `jouerAnimationMoteur`, supprimé avec lui. La réserve ne
                //  s'est plus jamais vidée.
                //
                //  Les deux se réparent ici, au seul endroit qui voit vraiment
                //  tomber quelqu'un : la projection de l'état, sur le poste qui
                //  tient le cerveau. La vérité vient de l'état — jamais des
                //  fiches locales, qui peuvent être retenues derrière la
                //  fenêtre sombre.
                if (etat && etat.combattants && estLeCerveau(etat, monPoste())) {
                    const tombes = Object.values(etat.combattants).filter(c => c && c.aTerre);

                    if (typeof window.synchroniserCombattantsHorsJeu === "function") {
                        Promise.resolve(window.synchroniserCombattantsHorsJeu(tombes.map(c => c.id)))
                            .catch(e => signalerPanne("synchroniserCombattantsHorsJeu", e));
                    }

                    // Une créature tombée est marquée morte dans son document
                    // (son cadavre reste sur la carte jusqu'à la fin du combat)
                    // et laisse sa place au renfort suivant, s'il en reste un.
                    tombes.forEach(c => {
                        if (!c.estMonstre || c.estIllusion) return;
                        if (TOMBES_ANNONCEES.has(c.id)) return;
                        // Le repère se pose APRÈS s'être assuré qu'on peut
                        // vraiment agir : le poser avant condamnerait la
                        // créature à ne jamais être marquée si monstres.js
                        // n'était pas encore chargé au moment de sa chute.
                        if (typeof window.marquerMonstreMort !== "function") return;
                        TOMBES_ANNONCEES.add(c.id);
                        if (typeof window.tracerCombat === "function") {
                            window.tracerCombat("☠️", `${c.nom || c.id} est terrassé`,
                                                "la réserve peut envoyer un renfort");
                        }
                        Promise.resolve(window.marquerMonstreMort(c.id))
                            .catch(e => signalerPanne("marquerMonstreMort", e));
                    });
                }
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
                zoneHexesBase: carte.zoneHexesBase || [],
                // Le repli de la carte ({ portee, chance }) : c'est l'IA qui
                // choisira où, au moment de jouer (voir jouerCreature).
                repli: carte.repli || null
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
        regles: reglesDuJeu()
    };
}

// LES VRAIES FORMULES DU JEU, celles qui font qu'un combattant fabriqué par le
// cerveau a les mêmes maxima que celui qu'affiche la fiche. Elles étaient
// enfermées dans sourceDuJeu, qui ne sert qu'à OUVRIR un combat ; un renfort
// arrivant en cours de route en a exactement le même besoin.
function reglesDuJeu() {
    return {
        // LES MAXIMA D'ABORD, parce que ce sont eux qui ont fait échouer le
        // premier vrai combat : un Humain a +10 d'énergie maximale par l'atout
        // de son peuple, la fiche porte 100 et le jeu calcule 110. Lire le
        // champ brut donnait « 110 d'énergie pour un maximum de 100 », et les
        // invariants refusaient d'ouvrir le combat — à juste titre.
        pvMax: window.pvMaxCombattant,
        fatigueMax: window.fatigueMaxCombattant,
        esquive: window.esquiveCombattant,
        parade: window.paradeCombattant,
        defPhysique: window.defPhysiqueCombattant,
        defMagique: window.defMagiqueCombattant,
        critique: window.critiqueCombattant,
        atouts: window.atoutRace,
        bonusEquip: window.bonusEquip,
        // Les effets spéciaux d'un objet (élan d'initiative en frappant,
        // bénédiction posée sur qui vient d'être soigné) : sans eux, une bague
        // ou une arme qui les porte ne fait plus rien sous ce régime — ils
        // vivaient uniquement dans l'ancien moteur.
        effetsSpeciaux: window.effetsSpeciauxEquipement
    };
}

if (typeof window !== "undefined") {
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

        // ON ANNONCE L'OUVERTURE DE CHAQUE COMBAT, dans la trace : ça reste le
        // repère qui dit que ce poste-ci vient de passer en résolution.
        const phaseVue = partie.Phase_Combat || "Preparation";
        if (phaseVue === "Resolution" && phasePrecedente === "Preparation"
            && typeof window.tracerCombat === "function") {
            window.tracerCombat("⚙️", "combat ouvert", "(un seul poste écrit)");
        }

        if (!window.ID_PARTIE_COURANTE || !window.ioCombatFirestore) return;

        // 1. On a changé de partie : on repart de zéro.
        if (partieSuivie && partieSuivie !== window.ID_PARTIE_COURANTE) {
            if (REGIME) REGIME.debrancher();
            fermerLeGuet();
            TOMBES_ANNONCEES.clear();
            LEURRES_EFFACES.clear();
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
            ouvrirLeGuet();
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

    // =====================================================================
    //  LE CERVEAU NE RÉPOND PLUS : ON LE DIT, ET ON PROPOSE
    // =====================================================================
    //  Personne ne reprend la main tout seul : ce serait une élection, et c'est
    //  précisément ce que cette architecture a supprimé. On montre une bannière,
    //  un joueur clique, et Firestore tranche.
    //
    //  ⚠️ Ce guet a besoin de SON PROPRE minuteur. Quand le cerveau meurt, plus
    //  rien ne bouge : ni l'état, ni le journal, ni le document de la partie. Il
    //  n'arrive donc AUCUNE notification pour réveiller quoi que ce soit — c'est
    //  le silence lui-même qu'il faut mesurer.
    let guetCerveau = null;
    let banniereLevee = false;

    function surveillerLeCerveau() {
        if (typeof document === "undefined") return;
        const banniere = document.getElementById("banniere-cerveau-perdu");
        if (!banniere) return;

        const enCombat = document.getElementById("fenetre-combat")
                      && document.getElementById("fenetre-combat").style.display === "block";
        const silence = !!REGIME && enCombat && !!REGIME.etatAffiche()
                     && !REGIME.jeSuisLeCerveau() && REGIME.cerveauSilencieux();

        if (silence === banniereLevee) return;
        banniereLevee = silence;
        banniere.style.display = silence ? "flex" : "none";
        if (typeof window.tracerCombat === "function") {
            window.tracerCombat(silence ? "💔" : "💚",
                                silence ? "le cerveau ne répond plus" : "le cerveau est revenu",
                                silence ? "la table peut reprendre la main" : "");
        }
    }

    function ouvrirLeGuet() {
        if (guetCerveau) return;
        guetCerveau = setInterval(surveillerLeCerveau, 5000);
    }
    function fermerLeGuet() {
        if (guetCerveau) clearInterval(guetCerveau);
        guetCerveau = null;
        banniereLevee = false;
        const banniere = typeof document !== "undefined"
            && document.getElementById("banniere-cerveau-perdu");
        if (banniere) banniere.style.display = "none";
    }

    // Le bouton de la bannière.
    window.reprendreLeCerveau = async function() {
        if (typeof window.jouerSonClic === "function") window.jouerSonClic();
        if (!REGIME) return false;
        const pris = await REGIME.reprendreLaMain();
        if (pris) {
            banniereLevee = false;
            const banniere = document.getElementById("banniere-cerveau-perdu");
            if (banniere) banniere.style.display = "none";
            // On enchaîne tout de suite : le combat reprend là où il s'était tu.
            REGIME.tourner();
        }
        return pris;
    };

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
        // Une seule fenêtre, et elle dit quoi faire. Pas de repli silencieux :
        // rendre la table sans prévenir serait pire que de s'arrêter.
        try {
            alert("Le combat n'a pas pu démarrer.\n\n" + raison
                  + "\n\nRegarde la console (ligne ❌) pour la cause exacte, "
                  + "puis réinitialise le combat.");
        } catch (e) {}
    }

    // LE COMBAT S'ARRÊTE (victoire, fuite, réinitialisation). On range.
    window.regimeFermerLeCombat = async function() {
        // L'état de la rencontre précédente doit partir : c'est justement
        // quand il traîne qu'il empêche la suivante de s'ouvrir. On efface
        // donc dans tous les cas.
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
        fermerLeGuet();
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
        actif: () => !!REGIME,
        mouvement: (acteur, chemin, reserve) =>
            REGIME ? REGIME.demanderMouvement(acteur, chemin, reserve) : null,
        carte: (acteur, carte) => {
            if (!REGIME) return null;
            // On marque AVANT d'envoyer : l'écriture réseau est justement ce
            // qu'on ne veut pas laisser sans réponse à l'écran.
            marquerDemande(acteur);
            return REGIME.demanderCarte(acteur, carte);
        },
        // LE BOND NE MARQUE PAS DE DEMANDE. Il arrive AU MILIEU d'une carte —
        // le saut d'abord, l'attaque ensuite —, et marquer le combattant ici
        // ferait refuser la carte qui suit comme un doublon.
        bond: (acteur, vers, portee) =>
            REGIME ? REGIME.demanderBond(acteur, vers, portee) : null,
        // Même raison que le bond : l'illusion se pose au milieu d'une carte,
        // marquer une demande ici ferait refuser la suite comme un doublon.
        illusion: (acteur, idIllusion, vers) =>
            REGIME ? REGIME.demanderIllusion(acteur, idIllusion, vers) : null,
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
