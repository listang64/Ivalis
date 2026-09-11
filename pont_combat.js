// =========================================================================
//  LE PONT — DE L'ÉTAPE À CE QU'ON VOIT
// =========================================================================
//
//  Le spectateur sait QUAND animer. Ce fichier sait QUOI montrer.
//
//  Il tient entre les deux, et il existe pour une raison précise : les
//  animations du jeu ont été écrites en même temps que le calcul, et souvent
//  dans la même fonction. `jouerAnimationMoteur` ne montre pas une attaque —
//  elle la RÉSOUT : elle tire les dés d'esquive, calcule les dégâts, applique
//  les états, écrit en base. La rejouer telle quelle dans le nouveau régime
//  referait tout le travail du cerveau une seconde fois, sur chaque écran.
//  C'est très exactement le mécanisme des dégâts doublés.
//
//  Ici, le calcul est déjà fait. Une étape porte le RÉSULTAT — `pvApres: 33`,
//  `esquive`, `bouclierBrise` — et il n'y a plus rien à décider : il n'y a qu'à
//  le montrer. Le pont traduit donc chaque étape en une MISE EN SCÈNE, et les
//  mises en scène sont jouées par les animations existantes, celles qui ne font
//  que bouger des pixels.
//
//  DEUX MOITIÉS, ET LA SÉPARATION EST NETTE
//  ----------------------------------------
//   • `misEnScene(etape, etat)` est PURE. Elle lit l'état d'AVANT l'étape (le
//     spectateur le lui donne exprès) et rend un objet qui décrit ce qu'on doit
//     voir : quel pion, de quelle valeur à quelle valeur, quel texte, quelle
//     couleur. Aucun DOM, aucune attente. Elle se teste au banc, en entier.
//   • `creerPont(effets)` joue ces objets avec les fonctions du jeu, qu'on lui
//     injecte. Il ne décide de rien.
//
//  CE QUE ÇA VEUT DIRE CONCRÈTEMENT : le jour où une animation change, on la
//  change à un seul endroit et aucune règle du jeu ne bouge. Et le jour où une
//  règle change, aucune animation ne bouge.
// =========================================================================

const nombre = (v, defaut = 0) => {
    const n = parseInt(v);
    return Number.isFinite(n) ? n : defaut;
};

const combattantDe = (etat, id) => (etat && etat.combattants) ? etat.combattants[id] : null;

// Les couleurs du jeu, rassemblées ici parce qu'elles disent quelque chose :
// un chiffre rouge et un chiffre vert ne racontent pas la même histoire, et
// c'est souvent tout ce qu'un joueur a le temps de lire.
export const COULEURS = {
    degats:    "#ff4c4c",
    bouclier:  "#00ffff",
    soin:      "#1b6e3a",
    neutre:    "#cccccc",
    attention: "#ffaa00",
    critique:  "#ff2d2d"
};

// Le rythme. Il est ici, en un seul endroit, pour qu'on puisse le régler sans
// aller fouiller dans six fichiers — et pour qu'un banc puisse vérifier qu'une
// animation ne rend pas la main avant d'avoir été vue.
export const RYTHME = {
    message:     900,
    critique:    900,
    esquive:    1000,
    chute:      1200,
    carte:       260,
    jauge:       650
};

// =========================================================================
//  1. LA MISE EN SCÈNE — LA PARTIE PURE
// =========================================================================
//  Une étape entre, un objet sort. Le champ `geste` dit à quelle animation il
//  s'adresse ; le reste est ce dont elle a besoin.
//
//  ON LIT L'ÉTAT D'AVANT, ET C'EST TOUT L'INTÉRÊT. Une jauge qui descend a
//  besoin des deux bouts : d'où elle part et où elle arrive. L'étape ne porte
//  que l'arrivée (`pvApres`), parce que c'est ce qui rend le rejeu idempotent.
//  Le départ, on le lit dans l'état que le spectateur n'a pas encore fait
//  avancer — c'est pour ça qu'il anime AVANT d'appliquer.

const SCENES = {

    // --- LE MOUVEMENT ----------------------------------------------------
    pas(e) {
        return { geste: "pas", pion: e.acteur, de: e.de, vers: e.vers,
                 cout: nombre(e.cout) };
    },
    // Un déplacement imposé. Même géométrie, autre gestuelle : un pion poussé
    // ne marche pas, il glisse ; un bond est un saut à vol d'oiseau.
    poussee(e)  { return { geste: "poussee", pion: e.cible || e.acteur, de: e.de, vers: e.vers }; },
    traction(e) { return { geste: "poussee", pion: e.cible || e.acteur, de: e.de, vers: e.vers }; },
    bond(e)     { return { geste: "bond", pion: e.cible || e.acteur, de: e.de, vers: e.vers }; },

    // --- LA TECHNIQUE ----------------------------------------------------
    //  On ne rejoue PAS la résolution : on montre le lanceur s'élancer vers sa
    //  cible, et c'est tout. Les conséquences arrivent dans les étapes qui
    //  suivent, chacune avec son propre moment à l'écran.
    //
    //  LE PROJECTILE SE LIT DANS L'ÉTAT D'AVANT. L'étape dit ce qui part
    //  (`projectile`) et vers qui (`cibles`) ; les cases, elles, viennent de
    //  l'état que le spectateur n'a pas encore fait avancer. C'est la même
    //  raison que pour l'esquive : après coup, un pion poussé aurait déjà
    //  bougé, et la flèche partirait d'où il n'était plus.
    carte(e, etat) {
        const lanceur = combattantDe(etat, e.acteur);
        const cibles = e.cibles || [];
        return {
            geste: "carte", pion: e.acteur, cibles,
            critique: !!e.critique, carte: e.carte || null,
            projectile: e.projectile || null,
            depuis: lanceur ? { q: nombre(lanceur.q), r: nombre(lanceur.r) } : null,
            vers: cibles.map(id => {
                const c = combattantDe(etat, id);
                return c ? { q: nombre(c.q), r: nombre(c.r) } : null;
            }).filter(Boolean)
        };
    },

    // --- CE QUI TOUCHE, ET CE QUI RATE -----------------------------------
    // UNE ESQUIVE A DEUX MOITIÉS : le mot qui monte, et le pion qui se dérobe.
    // On ne transmettait que la première — à l'écran, une créature qui esquivait
    // ne bougeait pas, et on croyait qu'il ne s'était rien passé. Il faut la
    // case de l'ATTAQUANT pour savoir de quel côté reculer : elle se lit dans
    // l'état d'avant, que le spectateur nous donne exprès.
    esquive(e, etat) {
        const attaquant = combattantDe(etat, e.acteur);
        return { geste: "esquive", pion: e.cible,
                 depuis: attaquant ? { q: nombre(attaquant.q), r: nombre(attaquant.r) } : null,
                 texte: e.parade ? "Paré 🛡️" : "Esquivé 💨",
                 couleur: COULEURS.neutre, duree: RYTHME.esquive };
    },
    echec(e) {
        return { geste: "message", pion: e.acteur, texte: "Échec technique !",
                 couleur: COULEURS.attention, duree: RYTHME.message };
    },
    // Une étape qui ne change rien à l'état et n'a qu'un mot à dire : une
    // poussée qu'un mur a arrêtée, un effet que le noyau ne sait pas encore
    // jouer. Elle EXISTE pour que ce silence-là s'affiche au lieu de passer
    // inaperçu — la leçon de toutes les soirées perdues de cette semaine.
    //
    // La couleur peut voyager avec l'étape, quand le noyau en tient une : la
    // confusion qui se dissipe est une bonne nouvelle et se dit en vert, pas
    // dans le gris de tout le reste. Sans couleur portée, on garde le neutre.
    message(e) {
        return { geste: "message", pion: e.cible || e.acteur, texte: e.texte || "",
                 couleur: e.couleur || COULEURS.neutre, duree: RYTHME.message };
    },
    etatRate(e) {
        // Une immunité de peuple n'est pas un jet manqué : c'est écrit sur la
        // fiche, pas dans les dés. Le mot doit le dire, sans quoi un joueur
        // qui teste sans arrêt le même état sur un Ankylar croira à une
        // longue série de chance.
        const texte = e.immunise ? `${e.nom || "État"} : immunisé` : `${e.nom || "État"} résisté`;
        return { geste: "message", pion: e.cible, texte,
                 couleur: COULEURS.neutre, duree: RYTHME.message };
    },
    trajetEcourte(e) {
        return { geste: "message", pion: e.acteur, texte: "Plus d'énergie",
                 couleur: COULEURS.attention, duree: RYTHME.message };
    },
    // Une créature qui ne lance rien. Sans cette ligne, son tour est une
    // seconde de silence que personne ne comprend — et c'est très exactement ce
    // qu'on lisait dans les traces : « tour de 20 ms, rien ne se passe ».
    renonce(e) {
        return { geste: "message", pion: e.acteur,
                 texte: e.raison === "hors de portée" ? "Hors de portée" : (e.raison || "Renonce"),
                 couleur: COULEURS.neutre, duree: RYTHME.message };
    },

    // --- LES JAUGES ------------------------------------------------------
    //  LE CŒUR DU PONT. Deux bouts : l'état d'avant donne le départ, l'étape
    //  donne l'arrivée. Un rejeu deux fois de suite montre deux fois la même
    //  descente, et laisse la jauge au même endroit.
    degats(e, etat) {
        const c = combattantDe(etat, e.cible);
        if (!c) return { geste: "rien" };

        // Un gain de bouclier n'est pas une blessure, même s'il voyage dans la
        // même étape : c'est la carte « bouclier » qui l'a posé.
        if (e.gainBouclier > 0) {
            return { geste: "jauge", pion: e.cible, champ: "bouclier",
                     de: nombre(c.bouclier), vers: nombre(e.bouclierApres),
                     max: nombre(c.bouclierMax) || nombre(e.bouclierApres),
                     texte: `+${nombre(e.gainBouclier)} 🛡️`,
                     couleurTexte: COULEURS.bouclier, couleurBarre: COULEURS.bouclier,
                     duree: RYTHME.jauge };
        }

        // Un coup encaissé PAR LE BOUCLIER se montre sur le bouclier — sinon on
        // voit un gros chiffre rouge et une barre de vie qui ne bouge pas, et
        // le joueur croit à un bug.
        const surBouclier = nombre(e.surBouclier) > 0 || nombre(e.bouclierApres) < nombre(c.bouclier);
        const champ = (surBouclier && nombre(e.pvApres, nombre(c.pv)) === nombre(c.pv)) ? "bouclier" : "pv";

        const montant = nombre(e.montant);
        const texte = e.opportunite ? `-${montant} ⚔️`
                    : e.critique ? `-${montant} !`
                    : `-${montant}`;

        return { geste: "jauge", pion: e.cible, champ,
                 de: champ === "pv" ? nombre(c.pv) : nombre(c.bouclier),
                 vers: champ === "pv" ? nombre(e.pvApres, c.pv) : nombre(e.bouclierApres, c.bouclier),
                 max: champ === "pv" ? nombre(c.pvMax) : (nombre(c.bouclierMax) || nombre(c.bouclier)),
                 texte,
                 couleurTexte: champ === "bouclier" ? COULEURS.bouclier : COULEURS.degats,
                 couleurBarre: champ === "bouclier" ? COULEURS.bouclier : COULEURS.degats,
                 bouclierBrise: !!e.bouclierBrise,
                 critique: !!e.critique,
                 duree: RYTHME.jauge };
    },

    soin(e, etat) {
        const c = combattantDe(etat, e.cible);
        if (!c) return { geste: "rien" };
        const montant = nombre(e.montant, nombre(e.pvApres) - nombre(c.pv));
        return { geste: "jauge", pion: e.cible, champ: "pv",
                 de: nombre(c.pv), vers: nombre(e.pvApres, c.pv), max: nombre(c.pvMax),
                 texte: `+${Math.max(0, montant)}${e.drain ? " 🩸" : ""}`,
                 couleurTexte: COULEURS.soin, couleurBarre: COULEURS.soin,
                 duree: RYTHME.jauge };
    },

    // L'attaque d'opportunité : le coup part du pion qui reste, vers celui qui
    // s'en va. Les dégâts eux-mêmes arrivent dans l'étape suivante.
    opportunite(e) {
        if (e.evitee) {
            return { geste: "message", pion: e.cible, texte: "Esquivé 💨",
                     couleur: COULEURS.neutre, duree: RYTHME.esquive };
        }
        return { geste: "opportunite", pion: e.acteur, cible: e.cible, hex: e.hex,
                 montant: nombre(e.montant) };
    },

    // --- CE QUI CHANGE SANS BOUGER --------------------------------------
    //  Un état posé, une énergie dépensée : rien à animer, mais l'écran doit
    //  se rafraîchir. C'est le spectateur qui s'en charge après chaque étape ;
    //  ici on dit simplement « il n'y a pas de geste ».
    etats(e)   { return { geste: "etats", pion: e.cible, liste: e.liste || [], pose: e.pose || null }; },
    fatigue()  { return { geste: "rien" }; },
    tour()     { return { geste: "rien" }; },
    manche(e)  { return { geste: "manche", numero: nombre(e.numero) }; },
    arrivee(e) { return { geste: "arrivee", pion: e.combattant && e.combattant.id }; },
    zone(e)    { return { geste: "zone", id: e.id, zone: e.zone || null, retiree: !!e.retiree }; },

    chute(e) {
        return { geste: "chute", pion: e.cible, duree: RYTHME.chute };
    }
};

export function misEnScene(etape, etat) {
    if (!etape || !etape.type) return { geste: "rien" };
    const fabrique = SCENES[etape.type];
    if (!fabrique) return { geste: "rien", inconnu: etape.type };
    return fabrique(etape, etat || {});
}

// De quoi lister ce que le pont sait montrer — utile au banc, qui vérifie
// qu'aucun type d'étape produit par le moteur n'est laissé sans mise en scène.
export const TYPES_MIS_EN_SCENE = Object.keys(SCENES);

// =========================================================================
//  2. LE PONT — LA PARTIE QUI TOUCHE À L'ÉCRAN
// =========================================================================
//  Rien ici ne décide. On reçoit une mise en scène, on appelle la fonction du
//  jeu qui sait la jouer, et on attend qu'elle ait fini. L'attente est la seule
//  chose qui compte vraiment : le spectateur n'applique l'étape qu'au retour,
//  et il ne passe à la suivante qu'ensuite. Une animation qui rend la main trop
//  tôt, c'est un pion qui saute.
//
//  Les fonctions du jeu sont INJECTÉES. Le banc en donne qui notent ce qu'on
//  leur demande ; le jeu donne les vraies. Aucune des deux n'est un cas
//  particulier de l'autre.

export function creerPont(effets) {
    const {
        pas = async () => {},              // jouerAnimationPas
        poussee = async () => {},          // jouerAnimationPoussee
        bond = async () => {},             // jouerAnimationBond
        ruee = async () => {},             // le lanceur s'élance vers sa cible
        projectile = async () => {},       // animerProjectile : flèche ou boule
        jauge = () => {},                  // afficherFlashDegatToken
        message = () => {},                // afficherMessageFlottantHex
        esquive = () => {},                // animerEsquive : le mot ET le recul
        opportunite = async () => {},      // jouerAnimationOpportunite
        zone = async () => {},             // appliquerZonesPersistantes
        pause = (ms) => new Promise(r => setTimeout(r, ms)),
        tracer = () => {}
    } = effets || {};

    async function animer(etape, etat) {
        const scene = misEnScene(etape, etat);
        if (scene.inconnu) tracer("❓", `étape sans mise en scène : ${scene.inconnu}`, "");
        if (scene.geste === "rien") return scene;

        switch (scene.geste) {
            case "pas":
                await pas({ idToken: scene.pion, de: scene.de, vers: scene.vers });
                break;

            case "poussee":
                await poussee({ idToken: scene.pion, de: scene.de, vers: scene.vers });
                break;

            case "bond":
                await bond({ idToken: scene.pion, de: scene.de, vers: scene.vers });
                break;

            case "carte":
                // Le critique s'annonce AVANT le coup : après, on ne saurait plus
                // à quoi rattacher le mot.
                if (scene.critique) {
                    message(scene.pion, "Critique !", COULEURS.critique, { taille: 30, eclat: true });
                    await pause(RYTHME.critique);
                }
                await ruee({ pion: scene.pion, cibles: scene.cibles });
                // PUIS CE QUI TRAVERSE, s'il y a quelque chose à voir voler.
                // Dans cet ordre, et pas l'inverse : le lanceur s'élance, PUIS
                // le tir part — un projectile qui partirait avant le geste
                // aurait l'air de s'échapper tout seul. L'attente est celle de
                // l'animation elle-même : les dégâts ne doivent pas tomber
                // avant que la flèche n'arrive.
                if (scene.projectile && scene.depuis && (scene.vers || []).length) {
                    await projectile({ de: scene.depuis, vers: scene.vers,
                                       sorte: scene.projectile });
                }
                await pause(RYTHME.carte);
                break;

            case "jauge":
                // Le chiffre flottant et la barre partent ensemble, puis on laisse
                // le temps de les lire. C'est le seul endroit du jeu où un joueur
                // apprend ce qu'il vient d'encaisser.
                jauge(scene.pion, scene.de, scene.vers, scene.max,
                      scene.texte, scene.couleurTexte, scene.couleurBarre);
                await pause(scene.duree);
                break;

            case "esquive":
                esquive({ idCible: scene.pion, depuis: scene.depuis,
                          texte: scene.texte, couleur: scene.couleur });
                await pause(scene.duree);
                break;

            case "message":
                message(scene.pion, scene.texte, scene.couleur);
                await pause(scene.duree);
                break;

            case "opportunite":
                await opportunite({ idAttaquant: scene.pion, idCible: scene.cible,
                                    montant: scene.montant, hexPosition: scene.hex });
                break;

            case "chute":
                message(scene.pion, "À terre !", COULEURS.degats, { taille: 26 });
                await pause(scene.duree);
                break;

            case "zone":
                await zone(scene);
                break;

            // « etats », « manche », « arrivee » n'ont pas d'animation propre :
            // le rafraîchissement que le spectateur fait après chaque étape les
            // montre déjà. On les laisse passer plutôt que d'inventer un geste.
            default:
                break;
        }
        return scene;
    }

    return { animer, misEnScene };
}

// =========================================================================
//  3. PROJETER L'ÉTAT SUR L'ÉCRAN
// =========================================================================
//  L'autre moitié du travail. Le spectateur, après chaque étape, dit « voilà
//  l'état ». Il faut le poser dans les structures que l'affichage du jeu lit
//  déjà : les pions, les fiches, la file.
//
//  UN SEUL SENS. L'état descend vers l'écran, et rien ne remonte. C'est ce qui
//  remplace les sept mécanismes de réconciliation — VERITE_BASE, ETAT_AFFICHE,
//  figerAffichageRetenus, gardeDeRejeu, valeurAvantRejeu,
//  pionsRetenusParLeJournal, EMPREINTES_JOUEES — qui existaient tous pour
//  arbitrer entre deux sources. Il n'y en a plus qu'une, donc il n'y a plus
//  rien à arbitrer.

// Ce que l'affichage attend, tiré de l'état. Pur, donc vérifiable.
export function pionsDepuisEtat(etat) {
    const pions = {};
    Object.values((etat && etat.combattants) || {}).forEach(c => {
        if (!c || !c.id) return;
        pions[c.id] = { q: nombre(c.q), r: nombre(c.r) };
    });
    return pions;
}

export function fichesDepuisEtat(etat, fichesActuelles) {
    return (fichesActuelles || []).map(fiche => {
        const c = combattantDe(etat, fiche.idPersonnage);
        if (!c) return fiche;
        return {
            ...fiche,
            PV_Actuels: nombre(c.pv),
            PV_Max: nombre(c.pvMax, fiche.PV_Max),
            // DEUX NOMS POUR LA MÊME ÉNERGIE, et il faut écrire les deux.
            // Le document de base dit `Fatigue_Actuelle`, tout le jeu en
            // mémoire dit `fatigueActuelle` (app.js le renomme au chargement).
            // Ne poser que le premier revenait à ne rien poser : les jauges du
            // panneau et surtout l'IA des créatures — qui lit
            // `monstre.fatigueActuelle` pour savoir ce qu'elle peut se payer —
            // continuaient de voir la jauge du DÉBUT du combat. À la manche
            // suivante, les créatures choisissaient donc des techniques
            // qu'elles ne pouvaient plus payer, et le cerveau les refusait.
            Fatigue_Actuelle: nombre(c.fatigue),
            fatigueActuelle: nombre(c.fatigue),
            Bouclier_Actuel: nombre(c.bouclier),
            Etats_Alteres: JSON.parse(JSON.stringify(c.etats || [])),
            statut: c.aTerre ? "Inconscient" : (fiche.statut === "Inconscient" ? "Vivant" : fiche.statut)
        };
    });
}

export function fileDepuisEtat(etat) {
    return ((etat && etat.file) || []).map(f => ({
        idPersonnage: f.id, idCarte: f.carte || null, initiative: nombre(f.initiative)
    }));
}

export function creerProjection(ecran) {
    const {
        poserPions = () => {},
        poserFiches = () => {},
        poserFile = () => {},
        poserZones = () => {},
        rafraichir = () => {},
        lireFiches = () => []
    } = ecran || {};

    // `options.file` à faux projette tout SAUF la file d'initiative. Ça sert
    // pendant la phase de préparation : là, c'est le document de la partie qui
    // dit la file (les joueurs y posent leurs cartes une par une), et reposer
    // par-dessus la file VIDE de l'état effacerait leurs choix de l'écran.
    return function projeter(etat, options) {
        if (!etat) return;
        poserPions(pionsDepuisEtat(etat));
        poserFiches(fichesDepuisEtat(etat, lireFiches()));
        // Les nappes au sol descendent comme les pions : c'est l'état qui dit
        // où le feu brûle, et l'écran qui le dessine. Sans cette ligne, une
        // zone posée pendant le combat n'existait que pour le cerveau et
        // restait invisible.
        poserZones(JSON.parse(JSON.stringify(etat.zones || {})));
        if (!options || options.file !== false) {
            poserFile(fileDepuisEtat(etat), {
                phase: etat.phase, manche: nombre(etat.manche, 1), ontJoue: etat.ontJoue || []
            });
        }
        rafraichir(etat);
    };
}

if (typeof window !== "undefined") {
    window.pontCombat = {
        COULEURS, RYTHME, misEnScene, TYPES_MIS_EN_SCENE, creerPont,
        pionsDepuisEtat, fichesDepuisEtat, fileDepuisEtat, creerProjection
    };
}
