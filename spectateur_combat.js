// =========================================================================
//  LE SPECTATEUR — CE QUE FAIT UN ÉCRAN QUI REGARDE
// =========================================================================
//
//  Un poste qui ne tient pas le cerveau n'a plus qu'un travail : rejouer le
//  journal, une entrée à la fois, dans l'ordre des numéros. Il n'écrit rien, il
//  ne calcule rien, il ne décide rien. Il regarde et il montre.
//
//  CE QUE ÇA REMPLACE
//  ------------------
//  Chaque écran écoutait DEUX réalités — les fiches en base et le journal — et
//  devait les arbitrer en permanence. C'était le rôle de VERITE_BASE,
//  ETAT_AFFICHE, figerAffichageRetenus, gardeDeRejeu, valeurAvantRejeu,
//  pionsRetenusParLeJournal et EMPREINTES_JOUEES : sept mécanismes empilés au
//  fil des symptômes, dont plus personne ne pouvait prédire le comportement
//  combiné.
//
//  Ici il n'y a qu'une source. L'écran EST la somme des étapes qu'il a rejouées,
//  ni plus ni moins. Il n'y a donc plus rien à réconcilier — les sept mécanismes
//  n'ont plus d'objet.
//
//  LA PROPRIÉTÉ QUI REND TOUT SÛR
//  ------------------------------
//  Un poste en retard ne peut pas être FAUX, il ne peut être qu'EN RETARD. Il
//  rattrape en rejouant les numéros manquants, et arrive nécessairement au même
//  écran que les autres, parce que le même journal appliqué au même point de
//  départ donne le même résultat. C'est une propriété mathématique, pas un
//  réglage à ajuster.
//
//  Comme partout ici, la décision est pure et l'exécution est injectée : ce
//  fichier ne connaît ni le DOM, ni Firebase. On lui passe une fonction qui
//  anime, il lui dit quoi animer.
// =========================================================================

import { clonerEtat, appliquerEtape, appliquerEntree } from './combat_etat.js';

const nombre = (v, defaut = 0) => {
    const n = parseInt(v);
    return Number.isFinite(n) ? n : defaut;
};

// L'identité d'un TOUR : son acteur et sa manche. C'est ce qui décide si la
// fenêtre sombre doit s'ouvrir — une fois par tour, pas une fois par étape.
export const cleDuTour = (entree) => entree
    ? `${entree.acteur || "?"}|${entree.manche === undefined ? "" : entree.manche}` : null;

// =========================================================================
//  1. QUE FAIRE MAINTENANT ?
// =========================================================================
//  Le cœur du spectateur, et il est pur. On lui donne où il en est et ce qu'il a
//  reçu ; il dit quoi faire. Quatre réponses possibles, et une seule à la fois :
//
//    « rien »        — il est à jour, ou il attend une entrée qui n'est pas là
//    « trou »        — il manque un numéro : il faut aller le chercher
//    « attendre »    — un tour s'ouvre, la fenêtre sombre demande le OK
//    « jouer »       — l'entrée suivante est là, et on peut la dérouler
//
//  L'ORDRE DES TESTS COMPTE. Le trou passe avant tout : jouer par-dessus un
//  numéro manquant, c'est raconter une histoire à laquelle il manque une page,
//  et c'est irrattrapable ensuite.

export function prochaineEtape(vue, recues, tourAcquitte, estAMoi) {
    const attendu = nombre(vue) + 1;
    const entree = recues ? recues[attendu] : null;

    if (!entree) {
        // Rien à l'endroit attendu. Mais si des numéros PLUS GRANDS sont
        // arrivés, c'est qu'il en manque un — le réseau ne livre pas toujours
        // dans l'ordre, et Firestore encore moins après une mise en veille.
        const plusLoin = Object.keys(recues || {})
            .map(Number).filter(n => n > attendu);
        if (plusLoin.length > 0) {
            return { quoi: "trou", manque: attendu, deja: Math.min(...plusLoin) };
        }
        return { quoi: "rien" };
    }

    // Un tour qui s'ouvre et qui n'est pas le mien : la fenêtre sombre s'affiche
    // et attend le OK. Le mien, non — c'est moi qui l'ai demandé, je sais déjà
    // ce qui va se passer.
    const cle = cleDuTour(entree);
    if (!estAMoi(entree.acteur) && cle !== tourAcquitte) {
        return { quoi: "attendre", entree, cle };
    }

    return { quoi: "jouer", entree };
}

// =========================================================================
//  2. LE SPECTATEUR LUI-MÊME
// =========================================================================
//  Tout ce qui suit est de la plomberie autour de la fonction ci-dessus.
//
//  Les fonctions qu'on lui donne :
//    animer(etape, etat)   → joue l'animation, et rend la main quand elle est
//                            VRAIMENT finie. C'est la seule attente du système.
//    estAMoi(id)           → « ce combattant est-il un héros de ce poste ? »
//    chercher(v)           → va lire une entrée manquante, ou rend null
//    surEtat(etat)         → l'écran vient de changer : rafraîchis les jauges
//    surFenetre(entree)    → un tour attend le OK, ou null pour la refermer
//    tracer(icone, quoi, détail)

export function creerSpectateur(contexte) {
    const {
        animer = async () => {},
        estAMoi = () => false,
        chercher = async () => null,
        surEtat = () => {},
        surFenetre = () => {},
        tracer = () => {},
        pause = (ms) => new Promise(r => setTimeout(r, ms)),
        // De quoi se rappeler soi-même. Quand un numéro manque, on laisse au
        // réseau une chance de le livrer dans l'ordre — mais si plus rien
        // n'arrive, personne ne rappellera la boucle : il faut donc qu'elle
        // prenne rendez-vous avec elle-même.
        programmer = (fn, ms) => setTimeout(fn, ms),
        respiration = 320,
        delaiAvantRattrapage = 800
    } = contexte || {};

    const moi = {
        etat: null,          // l'état tel que l'ÉCRAN le montre
        vue: 0,              // le numéro de la dernière entrée rejouée
        recues: {},          // celles qui sont arrivées, par numéro
        tourAcquitte: null,  // le tour dont le OK a été touché
        attendue: null,      // l'entrée retenue par la fenêtre sombre
        enCours: false,
        depuis: 0            // depuis quand on attend un numéro manquant
    };

    // On repart d'un état connu : au chargement, ou quand un combat recommence.
    function repartirDe(etat, version) {
        moi.etat = etat ? clonerEtat(etat) : null;
        moi.vue = version !== undefined ? nombre(version) : nombre(etat && etat.version);
        // L'identité de la rencontre qu'on regarde. Tout ce qui vient d'une
        // autre est écarté à la porte.
        moi.combat = (etat && etat.combat) || "";
        moi.recues = {};
        moi.tourAcquitte = null;
        moi.attendue = null;
        moi.depuis = 0;
        tracer("📚", "journal branché", `(à partir de ${moi.vue})`);
        surEtat(moi.etat);
    }

    // Ce que le journal livre. On ne garde que ce qui est devant nous : une
    // entrée déjà rejouée n'a plus rien à raconter.
    function recevoir(entrees) {
        (entrees || []).forEach(e => {
            if (!e) return;
            // UNE ENTRÉE D'UNE AUTRE RENCONTRE N'EST PAS UNE ENTRÉE EN RETARD :
            // c'est une entrée qui ne nous concerne pas. On l'écarte, et on ne
            // l'attend pas. Sans ce filtre, un poste dont le curseur était resté
            // sur le combat précédent guettait un numéro qui ne viendrait
            // jamais, et son écran restait figé sur « le tour se prépare ».
            if (moi.combat && e.combat && e.combat !== moi.combat) {
                tracer("🗑️", `entrée d'une autre rencontre écartée`, `n°${e.v}`);
                return;
            }
            if (nombre(e.v) <= moi.vue) return;
            if (!moi.recues[e.v]) tracer("📥", `${e.v} ${e.acteur || "?"}`,
                                         `(${(e.etapes || []).length} étapes)`);
            moi.recues[e.v] = e;
        });
    }

    // Le OK doré. Purement local : aucun poste n'attend un autre, chacun lit à
    // son rythme et rattrape ensuite les numéros accumulés.
    function ok() {
        if (!moi.attendue) { tracer("👆", "OK dans le vide", "(rien n'attendait)"); return; }
        const e = moi.attendue;
        const enFile = Object.keys(moi.recues).filter(n => Number(n) > moi.vue).length;
        tracer("👆", `OK — ${e.acteur} (manche ${e.manche})`,
               `n°${e.v} · ${enFile} en file · vue ${moi.vue}`);
        moi.tourAcquitte = cleDuTour(e);
        moi.attendue = null;
        surFenetre(null);
        return lire();
    }

    // LA BOUCLE. Elle ne tourne qu'une fois à la fois : deux rejeux en parallèle
    // joueraient deux animations l'une sur l'autre, et c'est exactement le genre
    // de chevauchement qui faisait sauter les pions.
    async function lire() {
        if (moi.enCours) return;
        moi.enCours = true;
        try {
            while (true) {
                const suite = prochaineEtape(moi.vue, moi.recues, moi.tourAcquitte, estAMoi);

                if (suite.quoi === "rien") { moi.depuis = 0; break; }

                if (suite.quoi === "trou") {
                    // On laisse au réseau le temps de livrer dans l'ordre avant
                    // d'aller chercher : neuf fois sur dix, le numéro manquant
                    // arrive tout seul dans la seconde.
                    if (!moi.depuis) moi.depuis = Date.now();
                    const reste = delaiAvantRattrapage - (Date.now() - moi.depuis);
                    if (reste > 0) {
                        // On repassera. Sans ce rendez-vous, un trou en fin de
                        // combat resterait là pour toujours : plus aucune
                        // notification ne viendrait réveiller la boucle.
                        programmer(() => { lire(); }, reste + 20);
                        break;
                    }
                    tracer("🔍", `il manque le n°${suite.manque}`, `(on a déjà le ${suite.deja})`);
                    const trouvee = await chercher(suite.manque);
                    moi.depuis = 0;
                    if (!trouvee) {
                        // Introuvable : on ne saute PAS. Sauter un numéro, c'est
                        // désynchroniser cet écran pour le reste du combat.
                        tracer("❌", `le n°${suite.manque} reste introuvable`, "on attend");
                        break;
                    }
                    moi.recues[trouvee.v] = trouvee;
                    continue;
                }

                if (suite.quoi === "attendre") {
                    moi.attendue = suite.entree;
                    tracer("⏸️", `fenêtre : ${suite.entree.acteur} (manche ${suite.entree.manche})`,
                           `en attente du OK, n°${suite.entree.v}`);
                    surFenetre(suite.entree);
                    break;
                }

                // === ON JOUE ===============================================
                const entree = suite.entree;
                tracer("▶️", `${entree.v} ${entree.acteur || "?"}`,
                       `(${(entree.etapes || []).length} étapes)`);

                for (const etape of (entree.etapes || [])) {
                    // Animer D'ABORD, appliquer ENSUITE : l'écran ne doit jamais
                    // montrer le résultat avant le geste. C'est très exactement
                    // ce qui donnait « le jeu joue pendant l'écran noir, je vois
                    // la vie qui se retire ».
                    await animer(etape, moi.etat);
                    moi.etat = appliquerEtape(moi.etat, etape);
                    surEtat(moi.etat);
                }

                moi.vue = nombre(entree.v);
                delete moi.recues[entree.v];
                tracer("⏹️", `${entree.v}`, "");

                // Le temps de respirer entre deux entrées, pour que l'œil suive.
                const reste = Object.keys(moi.recues).some(n => Number(n) > moi.vue);
                if (reste && respiration > 0) await pause(respiration);
            }
        } finally {
            moi.enCours = false;
        }
    }

    // Le rattrapage brutal : on saute directement à un état publié, sans rien
    // animer. Sert quand un poste rejoint un combat déjà commencé, ou revient
    // après une longue absence — rejouer trois cents entrées n'aurait aucun
    // intérêt, et prendrait dix minutes.
    function rejoindre(etat) {
        tracer("⏩", `on rejoint le combat en version ${etat && etat.version}`, "");
        repartirDe(etat);
    }

    // Rejouer un paquet d'entrées SANS animation, pour se remettre à niveau
    // rapidement. Le résultat est le même : c'est la propriété qui rend tout
    // sûr, et elle vaut avec ou sans animation.
    function rattraperSansAnimer(entrees) {
        const triees = (entrees || []).filter(e => nombre(e.v) > moi.vue)
                                      .sort((a, b) => a.v - b.v);
        triees.forEach(e => {
            moi.etat = appliquerEntree(moi.etat, e);
            moi.vue = nombre(e.v);
            delete moi.recues[e.v];
        });
        if (triees.length) {
            tracer("⏩", `${triees.length} entrées rattrapées`, `(vue ${moi.vue})`);
            surEtat(moi.etat);
        }
        return moi.vue;
    }

    return {
        repartirDe, recevoir, ok, lire, rejoindre, rattraperSansAnimer,
        // De quoi regarder l'intérieur, pour la trace et les bancs.
        etat: () => moi.etat,
        vue: () => moi.vue,
        enAttente: () => moi.attendue,
        enFile: () => Object.keys(moi.recues).filter(n => Number(n) > moi.vue).length
    };
}

if (typeof window !== "undefined") {
    window.spectateurCombat = { creerSpectateur, prochaineEtape, cleDuTour };
}
