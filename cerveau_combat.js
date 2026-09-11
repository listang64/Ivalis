// =========================================================================
//  LE CERVEAU DU COMBAT
// =========================================================================
//
//  UN SEUL APPAREIL ÉCRIT. Tous les autres lisent et animent.
//
//  C'est toute l'architecture en une phrase, et c'est ce qui rend impossibles
//  les bugs qu'on a passé une semaine à chasser. On ne peut pas jouer un tour
//  deux fois quand un seul poste a le droit de le jouer. On ne peut pas avoir
//  deux versions d'un plateau quand un seul poste l'écrit. Il n'y a plus rien à
//  coordonner, donc plus rien qui puisse se désynchroniser.
//
//  CE QUE FAIT LE CERVEAU, EN BOUCLE
//  ---------------------------------
//   1. Il écoute la boîte aux lettres des intentions : « je veux bouger là »,
//      « je lance cette carte », « j'ai fini ».
//   2. Il vérifie que l'intention est légitime — est-ce bien le tour de ce
//      combattant ? le poste qui l'envoie le commande-t-il vraiment ? le chemin
//      est-il praticable ? l'énergie suffit-elle ?
//   3. Il appelle le moteur, qui est pur (moteur_pur, mouvement_pur, ia_pure).
//   4. Il écrit le nouvel état, l'entrée de journal et le marquage de
//      l'intention DANS UN SEUL writeBatch. Tout ou rien.
//   5. Si le combattant suivant est une créature, il recommence tout seul.
//
//  POURQUOI LE MARQUAGE VOYAGE AVEC L'EFFET
//  ----------------------------------------
//  C'est ce qui rend le doublon impossible. L'intention est marquée « traitée »
//  dans le batch qui applique son effet : si le batch échoue, elle reste en
//  attente et sera reprise ; s'il réussit, elle ne peut plus l'être. Il n'existe
//  aucun instant où les deux états coexistent — contrairement au verrou d'avant,
//  qui vivait dans un document séparé de celui qu'il protégeait.
//
//  TOUT CE FICHIER EST PUR, SAUF LES DIX DERNIÈRES LIGNES. Les décisions ne
//  dépendent que de l'état et des intentions qu'on leur passe. L'écriture, elle,
//  est confiée à un « dépôt » injecté : le vrai parle à Firestore, celui des
//  bancs range dans une carte en mémoire. Le cerveau ne fait pas la différence,
//  et c'est pour ça qu'on peut le faire tourner mille fois en une seconde.
// =========================================================================

import { clonerEtat, combattant, creerDes, combattantIllusion,
         verifierEtatCombat, FORMAT_ETAT } from './combat_etat.js';
import { resoudreCarte, tirerDesCarte, tirerCritique, appliquerConfusion,
         traverserZones, creerZonePure, poserZone, vieillirZones,
         chaineDeDegats, REGLES_ETATS } from './moteur_pur.js';
import { resoudreMouvement, resoudreBond, resoudrePeur, distance, planifierTrajet,
         occupantVivant } from './mouvement_pur.js';
import { deciderTourCreature } from './ia_pure.js';

const nombre = (v, defaut = 0) => {
    const n = parseInt(v);
    return Number.isFinite(n) ? n : defaut;
};

// Le battement de cœur du cerveau, et le délai au bout duquel les autres postes
// proposent de reprendre la main. Trente secondes : assez long pour qu'un wifi
// qui hoquette ne déclenche rien, assez court pour qu'une table ne reste pas
// bloquée si l'écran du maître s'est fermé.
export const BATTEMENT_MS = 5000;
export const CERVEAU_PERDU_MS = 30000;

// =========================================================================
//  1. QUI A LA MAIN
// =========================================================================

export const estLeCerveau = (etat, poste) => !!etat && !!poste && etat.cerveau === poste;

// Le cerveau a-t-il disparu ? On compare à une heure qu'on nous passe — jamais
// à Date.now() lu ici : une fonction pure ne regarde pas la pendule, et surtout
// on ne compare pas deux horloges d'appareils différents sans le savoir.
export function cerveauPerdu(etat, maintenant) {
    if (!etat || !etat.cerveau) return true;
    return (nombre(maintenant) - nombre(etat.battement)) > CERVEAU_PERDU_MS;
}

// LE SILENCE, PLUTÔT QUE L'HEURE.
//
// `cerveauPerdu` compare le battement de l'état à une heure qu'on lui passe —
// et c'est très exactement le piège : ce battement est écrit par l'horloge du
// poste qui tient le cerveau, et relu par celle d'un AUTRE appareil. Deux
// montres qui décalent de trente secondes, et un cerveau en pleine forme paraît
// mort (ou l'inverse). Personne ne règle sa tablette à la seconde près.
//
// On ne regarde donc pas L'HEURE du battement : on regarde s'il CHANGE. Le
// cerveau réécrit ce champ toutes les cinq secondes, ce qui provoque une
// notification ; tant qu'elles arrivent, il est vivant. Le décompte se fait
// alors entièrement sur MA montre, et aucune comparaison entre appareils n'a
// plus lieu.
//
// Ces deux fonctions sont pures : le suivi entre, un suivi sort.

export function suivreBattement(suivi, etat, maintenant) {
    const valeur = nombre(etat && etat.battement);
    // Un battement inchangé garde la date du premier où on l'a vu : c'est elle
    // qui mesure le silence.
    if (suivi && suivi.valeur === valeur) return suivi;
    return { valeur, vuA: nombre(maintenant) };
}

export function cerveauSilencieux(suivi, maintenant) {
    if (!suivi || !suivi.vuA) return false;      // on n'a encore rien vu : on n'accuse pas
    return (nombre(maintenant) - nombre(suivi.vuA)) > CERVEAU_PERDU_MS;
}

// =========================================================================
//  2. LES INTENTIONS, ET CE QUI LES REND RECEVABLES
// =========================================================================
//  Un poste ne demande jamais un RÉSULTAT, il demande une ACTION. C'est le
//  cerveau qui tranche — et il refuse en disant pourquoi, pour que l'écran
//  puisse l'afficher au lieu de rester muet.

export const TYPES_INTENTION = ["mouvement", "carte", "bond", "illusion", "finTour"];

export function validerIntention(etat, intention) {
    const refus = (raison) => ({ ok: false, raison });
    if (!intention || !intention.id) return refus("intention sans identité");
    if (!TYPES_INTENTION.includes(intention.type)) return refus(`type inconnu : ${intention.type}`);

    const acteur = combattant(etat, intention.acteur);
    if (!acteur) return refus(`${intention.acteur} n'est pas dans ce combat`);
    if (acteur.aTerre) return refus(`${intention.acteur} est à terre`);

    // C'est bien son tour ? La file est la seule autorité là-dessus.
    const tete = (etat.file || [])[0];
    if (!tete) return refus("la file est vide");
    if (tete.id !== intention.acteur) return refus(`c'est au tour de ${tete.id}`);

    // Le poste qui demande commande-t-il vraiment ce combattant ? Une créature
    // n'appartient à personne : elle est jouée par le cerveau, et lui seul.
    if (intention.poste && acteur.joueur && intention.poste !== acteur.joueur) {
        return refus(`${intention.poste} ne commande pas ${intention.acteur}`);
    }
    if (acteur.estMonstre && intention.poste) {
        return refus("une créature ne reçoit pas d'ordre");
    }

    if (intention.type === "mouvement") {
        const chemin = intention.chemin || [];
        if (chemin.length === 0) return refus("chemin vide");
        // Chaque pas doit être adjacent au précédent, et aboutir sur une case
        // libre. Un client qui enverrait un chemin fantaisiste — page modifiée,
        // bug d'interface — ne doit pas pouvoir téléporter son pion.
        let de = { q: acteur.q, r: acteur.r };
        for (const vers of chemin) {
            if (distance(de, vers) !== 1) return refus("chemin discontinu");
            const occupant = occupantVivant(etat, vers.q, vers.r, intention.acteur);
            if (occupant) return refus(`${occupant} occupe (${vers.q},${vers.r})`);
            de = vers;
        }
        // Et il doit être payable, au moins en partie.
        const plan = planifierTrajet(etat, intention.acteur, chemin, intention.plateau, {
            reserveCarte: nombre(intention.reserveCarte)
        });
        if (plan.pas.length === 0) return refus("pas assez d'énergie pour un seul pas");
    }

    // Un saut sans destination n'est pas un saut. La validité de la case,
    // elle, est tranchée à la résolution (resoudreBond) : elle dépend du
    // terrain, que ce contrôle n'a pas toujours sous la main.
    if (intention.type === "bond") {
        const vers = intention.vers;
        if (!vers || vers.q === undefined || vers.r === undefined) {
            return refus("bond sans case d'arrivée");
        }
        // La géométrie complète (portée, murs, ligne de vue) reste le travail
        // de resoudreBond — elle a besoin du plateau, qu'une intention venue
        // de Firestore ne porte jamais (une fonction ne se sérialise pas). Ce
        // qui NE dépend que de l'état, en revanche, doit être refusé ici :
        // sans ce filet, un bond visant un pion occupé traversait quand même
        // la validation, consommait une entrée de journal, pour finalement
        // échouer en silence dans resoudreBond (« Bond impossible ») — jamais
        // dangereux (personne n'atterrit jamais sur personne), mais un aller
        //-retour inutile là où la marche et l'illusion refusent d'emblée.
        const occupant = occupantVivant(etat, vers.q, vers.r, intention.acteur);
        if (occupant) return refus(`${occupant} occupe (${vers.q},${vers.r})`);
    }

    if (intention.type === "illusion") {
        const vers = intention.vers;
        if (!intention.idIllusion) return refus("illusion sans identité");
        if (combattant(etat, intention.idIllusion)) return refus("cette illusion existe déjà");
        if (!vers || vers.q === undefined || vers.r === undefined) {
            return refus("illusion sans case");
        }
        const occupant = occupantVivant(etat, vers.q, vers.r, intention.idIllusion);
        if (occupant) return refus(`${occupant} occupe (${vers.q},${vers.r})`);
    }

    if (intention.type === "carte") {
        if (!intention.idCarte) return refus("carte sans identité");
        const cout = nombre(intention.coutFatigue);
        if (cout > acteur.fatigue) {
            return refus(`il faut ${cout} d'énergie, il en reste ${acteur.fatigue}`);
        }
    }

    return { ok: true, raison: null };
}

// =========================================================================
//  3. FABRIQUER UN PAS
// =========================================================================
//  Un pas = un état d'après + une entrée de journal, prêts à partir ensemble
//  dans le même writeBatch. La version avance exactement de un, jamais de deux :
//  c'est ce qui permet à un poste en retard de savoir précisément ce qu'il a
//  raté.

function fabriquerPas(etatAvant, etatApres, etapes, cause, acteur, des) {
    const suivant = etatApres;
    suivant.version = nombre(etatAvant.version) + 1;
    // La graine avance à chaque pas, même quand aucun dé n'a été tiré : sans ce
    // cran forcé, deux pas de suite repartiraient du même hasard.
    des.fraction();
    suivant.graine = des.graine();

    // LA TECHNIQUE ANNONCÉE POUR CE TOUR VOYAGE AVEC L'ENTRÉE.
    //
    // Sans elle, la fenêtre sombre affichait « Technique inconnue de ce poste »
    // à chaque tour : elle ne recevait que l'acteur et le numéro, et n'avait
    // aucun moyen de retrouver la carte. On la prend là où elle est vraie — la
    // file d'AVANT le pas, celle qui dit ce que ce combattant a annoncé.
    const enTete = (etatAvant.file || [])[0];
    const carte = (enTete && enTete.id === acteur) ? (enTete.carte || null) : null;

    return {
        etat: suivant,
        entree: {
            v: suivant.version,
            cause: cause || null,
            acteur: acteur || null,
            carte,
            manche: suivant.manche,
            graine: suivant.graine,
            etapes
        }
    };
}

// =========================================================================
//  4. LA FILE AVANCE
// =========================================================================
//  Le combattant en tête a fini. On le retire, on écarte ceux qui sont tombés
//  entre-temps, et si la file se vide on ouvre une nouvelle manche.
//
//  C'est ici que se jouait « le tour d'un ennemi complètement passé » et « nos
//  héros rayés de la file ». La différence tient en une phrase : cette fonction
//  ne peut plus être exécutée par deux postes à la fois, et elle ne consulte
//  plus aucune liste partagée — elle lit l'état, qui a un seul écrivain.

// Le geste lui-même, appliqué SUR PLACE à un état déjà cloné. Il sert aux deux
// chemins : la fin de tour demandée par un joueur, et celle qui clôt d'office le
// tour d'une créature. Une seule écriture de cette règle, donc une seule vérité.
export function cloturerTour(etat) {
    const partie = (etat.file || [])[0];
    if (!partie) return null;

    const file = etat.file.slice(1).filter(f => {
        const c = combattant(etat, f.id);
        return c && !c.aTerre;
    });

    const finDeManche = file.length === 0;
    if (finDeManche) {
        etat.manche = nombre(etat.manche, 1) + 1;
        etat.phase = "Preparation";
        etat.ontJoue = [];
    } else {
        etat.ontJoue = [...new Set([...(etat.ontJoue || []), partie.id])];
    }
    etat.file = file;

    const etapes = [{ type: "tour", fini: partie.id, file, phase: etat.phase,
                      manche: etat.manche, ontJoue: etat.ontJoue }];
    if (finDeManche) {
        // LA RÉGÉNÉRATION DE FIN DE MANCHE. Sans elle, l'énergie ne remonte
        // jamais et le combat s'éteint tout seul au bout de trois manches :
        // plus personne n'a de quoi lancer quoi que ce soit. L'ancien monde la
        // faisait dans finDeTourCombat, que le nouveau régime ne traverse plus.
        //
        // Comme toute étape, elle porte le RÉSULTAT et non l'opération : rejouée
        // deux fois sur trois écrans, elle donne le même chiffre.
        etapes.push(...regenererFinDeManche(etat));
        etapes.push(...regenererPvFinDeManche(etat));
        etapes.push(...ticsDeFinDeManche(etat));
        etapes.push(...vieillirLesEtats(etat));
        // Les nappes au sol vieillissent comme les états. Ce décompte vivait
        // dans combat.js, sur le poste qui avait vidé la file — donc nulle part
        // sous ce régime, où plus personne ne « finit » le round de son côté :
        // une zone posée une fois serait restée jusqu'à la fin du combat.
        etapes.push(...vieillirZones(etat));
        etapes.push({ type: "manche", numero: etat.manche });
    }
    return { fini: partie.id, etapes };
}

// Le pourcentage de la jauge que ce combattant reprend à chaque fin de manche.
// Même formule que window.regenerationCombattant (app.js) : la caractéristique
// du modèle plus la retouche du mode développeur.
function regenerationDe(c) {
    const stats = (c && c.stats) || {};
    return nombre(stats.Regeneration) + nombre(stats.Dev_Mod_Regen);
}

// CE QUE LES ÉTATS FONT EN FIN DE MANCHE, avant de vieillir.
//
// Ces tics vivaient dans l'ancien finDeTourCombat, un chemin que le nouveau
// régime ne traverse plus : un empoisonnement ne mordait jamais, une
// immobilisation ne coûtait rien, un étalement ne portait jamais son second
// coup. La règle est celle du jeu, mot pour mot — et comme toute étape, chacune
// porte le RÉSULTAT, jamais l'opération.
//
// L'ORDRE COMPTE, et c'est celui de l'ancien monde : l'immobilisation puise
// l'énergie tant que l'état dure, le poison mord une fois, l'étalement porte
// son reste — PUIS tout vieillit d'un cran (vieillirLesEtats, juste après).
export function ticsDeFinDeManche(etat) {
    const etapes = [];

    (etat.ordre || Object.keys(etat.combattants || {})).forEach(id => {
        const c = combattant(etat, id);
        if (!c || c.aTerre || !Array.isArray(c.etats) || c.etats.length === 0) return;

        // --- IMMOBILISATION : 20 d'énergie à chaque manche où elle dure ------
        if (c.etats.some(e => e && e.nom === "Immobilisation" && nombre(e.duree) > 0)) {
            const apres = Math.min(nombre(c.fatigueMax), nombre(c.fatigue) + 20);
            if (apres !== nombre(c.fatigue)) {
                c.fatigue = apres;
                etapes.push({ type: "fatigue", cible: id, fatigueApres: apres,
                              tic: "Immobilisation" });
            }
        }

        // --- EMPOISONNEMENT : un seul tic, jamais retenté --------------------
        //  15 d'énergie et 8% des points de vie maximum. `tickFait` reste sur
        //  l'état : il voyage avec lui dans l'étape de vieillissement qui suit,
        //  donc le poison ne mord pas deux fois même s'il dure encore.
        const poison = c.etats.find(e => e && e.nom === "Empoisonnement" && !e.tickFait);
        if (poison) {
            poison.tickFait = true;

            const fatigueApres = Math.max(0, nombre(c.fatigue) - 15);
            if (fatigueApres !== nombre(c.fatigue)) {
                c.fatigue = fatigueApres;
                etapes.push({ type: "fatigue", cible: id, fatigueApres,
                              tic: "Empoisonnement" });
            }

            const morsure = Math.ceil(nombre(c.pvMax) * 0.08);
            if (morsure > 0) {
                const pvApres = Math.max(0, nombre(c.pv) - morsure);
                c.pv = pvApres;
                c.aTerre = nombre(c.pvMax) > 0 && pvApres <= 0;
                etapes.push({ type: "degats", cible: id, montant: morsure,
                              pvApres, bouclierApres: nombre(c.bouclier),
                              tic: "Empoisonnement" });
            }
        }

        // --- BRÛLURE : elle ronge tant qu'elle dure --------------------------
        //  Trois dégâts par manche, du TYPE de l'attaque qui a allumé la
        //  flamme (le noyau l'a retenu au moment de poser l'état) : une brûlure
        //  magique se heurte à la résistance magique, une torche plantée dans
        //  la plaie à l'armure. Contrairement au poison, elle mord à CHAQUE
        //  manche, pas une seule fois — c'est ce qui la rend dangereuse quand
        //  on la laisse durer.
        const brulure = c.etats.find(e => e && e.nom === "Brûlé");
        if (brulure) {
            const parTour = nombre((REGLES_ETATS["Brûlé"] || {}).degatsParTour);
            const typeRes = brulure.typeDegats === "Physique" ? "Physique" : "Magique";
            const compte = chaineDeDegats(c, { valeurBrute: parTour, typeRes }, {});
            if (compte.degats > 0) {
                etapes.push(...infligerTic(c, id, compte.degats, "Brûlure"));
            }
        }

        // --- ÉTALEMENT : une moitié par manche, jamais au lancement ----------
        //  La technique étalée n'a rien fait quand elle est partie : ses deux
        //  moitiés attendent dans cette file, une par fin de manche. Le
        //  bouclier encaisse en priorité, comme pour une attaque ordinaire.
        const etalement = c.etats.find(e => e && e.nom === "Étalement");
        if (etalement) {
            let montant = 0;
            if (Array.isArray(etalement.tics) && etalement.tics.length > 0) {
                montant = nombre(etalement.tics.shift());
            } else if (!etalement.tickFait) {
                // Un étalement posé par une version précédente du jeu : il ne
                // porte qu'un seul montant, sous son ancien nom. On l'honore.
                etalement.tickFait = true;
                montant = nombre(etalement.degatsDifferes !== undefined
                                 ? etalement.degatsDifferes : etalement.degatsRestants);
            }
            if (montant > 0) etapes.push(...infligerTic(c, id, montant, "Étalement"));
        }
    });

    return etapes;
}

// Un tic de dégâts posé sur un combattant : le bouclier d'abord, la vie
// ensuite, et la chute si la vie tombe à zéro. Trois états s'en servent (la
// brûlure, l'étalement, et demain ce qu'on ajoutera) — l'écrire une fois
// évite qu'ils divergent.
function infligerTic(c, id, montant, nomDuTic) {
    const etapes = [];
    const bouclierAvant = nombre(c.bouclier);
    if (bouclierAvant > 0) {
        c.bouclier = Math.max(0, bouclierAvant - montant);
        etapes.push({ type: "degats", cible: id, montant,
                      surBouclier: Math.min(bouclierAvant, montant),
                      bouclierApres: c.bouclier, pvApres: nombre(c.pv), tic: nomDuTic });
    } else {
        const pvApres = Math.max(0, nombre(c.pv) - montant);
        c.pv = pvApres;
        c.aTerre = nombre(c.pvMax) > 0 && pvApres <= 0;
        etapes.push({ type: "degats", cible: id, montant, pvApres,
                      bouclierApres: 0, tic: nomDuTic });
    }
    return etapes;
}

// LES ÉTATS ALTÉRÉS VIEILLISSENT D'UNE MANCHE, et ceux qui arrivent à zéro
// tombent. Le décompte vivait dans l'ancien finDeTourCombat, un chemin que le
// nouveau régime ne traverse plus : un Étourdi posé au premier tour durait donc
// TOUT LE COMBAT.
//
// Les tics propres à chaque état tombent JUSTE AVANT (ticsDeFinDeManche) :
// l'immobilisation puise l'énergie tant qu'elle dure, le poison mord une fois,
// l'étalement porte son reste. Ici, on ne fait que vieillir. C'est une couture connue, pas un oubli.
export function vieillirLesEtats(etat) {
    const etapes = [];
    (etat.ordre || Object.keys(etat.combattants || {})).forEach(id => {
        const c = combattant(etat, id);
        if (!c || !Array.isArray(c.etats) || c.etats.length === 0) return;
        const apres = c.etats
            .map(e => ({ ...e, duree: nombre(e.duree, 1) - 1 }))
            .filter(e => e.duree > 0);
        if (apres.length === c.etats.length && apres.every((e, i) => e.duree === nombre(c.etats[i].duree, 1))) return;
        c.etats = apres;
        etapes.push({ type: "etats", cible: id, liste: apres, vieillissement: true });
    });
    return etapes;
}

export function regenererFinDeManche(etat) {
    const etapes = [];
    (etat.ordre || Object.keys(etat.combattants || {})).forEach(id => {
        const c = combattant(etat, id);
        if (!c || c.aTerre) return;
        const pct = regenerationDe(c);
        if (pct <= 0) return;
        const gagne = Math.floor((pct / 100) * nombre(c.fatigueMax));
        if (gagne <= 0) return;
        const apres = Math.min(nombre(c.fatigueMax), nombre(c.fatigue) + gagne);
        if (apres === nombre(c.fatigue)) return;
        c.fatigue = apres;
        etapes.push({ type: "fatigue", cible: id, fatigueApres: apres, regeneration: gagne });
    });
    return etapes;
}

// L'ATOUT DE L'OPHIOR : quelques points de vie repris à chaque fin de manche,
// exactement comme la fatigue de tout le monde ci-dessus, mais sur l'autre
// jauge — et sur elle seule, puisque personne d'autre n'a ce genre d'atout.
// On réutilise l'étape "soin" telle quelle : c'est ce que chaque écran sait
// déjà animer, il n'a rien de nouveau à apprendre pour un point de vie qui
// remonte tout seul.
export function regenererPvFinDeManche(etat) {
    const etapes = [];
    (etat.ordre || Object.keys(etat.combattants || {})).forEach(id => {
        const c = combattant(etat, id);
        if (!c || c.aTerre) return;
        const gagne = nombre(c.atouts && c.atouts.regenPv);
        if (gagne <= 0) return;
        const avant = nombre(c.pv);
        const apres = Math.min(nombre(c.pvMax), avant + gagne);
        if (apres === avant) return;
        c.pv = apres;
        etapes.push({ type: "soin", cible: id, montant: apres - avant, pvApres: apres,
                      regeneration: true });
    });
    return etapes;
}

// =========================================================================
//  OUVRIR UNE MANCHE
// =========================================================================
//  LA FRONTIÈRE DU CERVEAU, ET ELLE EST VOULUE. En fin de manche la file se
//  vide, la phase repasse à « Preparation », et le cerveau s'arrête. Ouvrir une
//  manche, c'est choisir ses cartes et lancer l'initiative : ça appartient aux
//  joueurs, et ça se passe encore dans l'ancien monde (la phase de préparation
//  écrit la file dans le document de la partie, comme elle l'a toujours fait).
//
//  Quand cette file est prête, quelqu'un doit la faire entrer dans l'état. Ce
//  quelqu'un est le cerveau, et il le fait comme il fait tout le reste : par un
//  PAS, avec sa propre entrée de journal. Sans ça, l'état changerait sans que
//  personne ne puisse le raconter, et les écrans en retard rateraient
//  exactement ce moment-là — le début d'une manche.
export function ouvrirManche(etat, file, des) {
    if (!etat || !Array.isArray(file) || file.length === 0) return null;

    const suivant = clonerEtat(etat);
    // On n'entre dans la file que des combattants qui existent et tiennent
    // debout. Un héros tombé pendant la manche précédente n'a rien à y faire —
    // c'est très exactement « nos héros rayés de la file », par le bon bout :
    // ici on les écarte pour une raison lisible, au lieu de les perdre.
    const propre = file
        .map(f => ({ id: f.id || f.idPersonnage, carte: f.carte || f.idCarte || null,
                     initiative: nombre(f.initiative, 0) }))
        .filter(f => {
            const c = combattant(suivant, f.id);
            return c && !c.aTerre;
        });
    if (propre.length === 0) return null;

    suivant.file = propre;
    suivant.phase = "Resolution";
    suivant.ontJoue = [];

    const etapes = [{ type: "tour", file: propre, phase: "Resolution",
                      manche: suivant.manche, ontJoue: [] }];
    return fabriquerPas(etat, suivant, etapes, `manche|${suivant.manche}`, null, des);
}

export function avancerFile(etat, des) {
    const suivant = clonerEtat(etat);
    // LE REPOS LONG SE PAIE ICI, au moment où le tour se ferme. Il n'existait
    // NULLE PART dans le cerveau : un joueur qui choisissait « Repos long »
    // fermait son tour en une étape et ne récupérait pas un point d'énergie. Le
    // calcul vivait dans l'ancien finDeTourCombat, un chemin que le nouveau
    // régime ne traverse plus.
    const etapes = reposLongDuTour(suivant);
    const clot = cloturerTour(suivant);
    if (!clot) return null;
    etapes.push(...clot.etapes);
    return fabriquerPas(etat, suivant, etapes, `fin|${clot.fini}`, clot.fini, des);
}

// Le combattant en tête de file a-t-il choisi de souffler ? La règle est celle
// du jeu, mot pour mot : le rendement propre à la créature (Repos_Long, en % de
// sa jauge) ou 35% pour un héros, plus l'atout de l'Humain. Et comme toute
// étape, celle-ci porte le RÉSULTAT, jamais l'opération.
export function reposLongDuTour(etat) {
    const tete = (etat.file || [])[0];
    if (!tete || tete.carte !== "REPOS_LONG") return [];
    const c = combattant(etat, tete.id);
    if (!c) return [];
    const pct = nombre(c.stats && c.stats.Repos_Long);
    const taux = pct > 0 ? pct / 100 : 0.35;
    const bonus = nombre(c.atouts && c.atouts.bonusReposLong);
    const apres = Math.min(nombre(c.fatigueMax),
                           nombre(c.fatigue) + Math.floor(nombre(c.fatigueMax) * taux) + bonus);
    if (apres === nombre(c.fatigue)) return [];
    c.fatigue = apres;
    return [{ type: "fatigue", cible: tete.id, fatigueApres: apres, repos: true }];
}

// =========================================================================
//  5. EXÉCUTER UNE INTENTION
// =========================================================================

export function appliquerIntention(etat, intention, plateau) {
    const des = creerDes(etat.graine);

    if (intention.type === "finTour") return avancerFile(etat, des);

    // LE BOND EST UN DÉPLACEMENT COMME UN AUTRE, il passe donc par le cerveau
    // comme les autres. Il sautait jusqu'ici par-dessus lui : le navigateur du
    // joueur déplaçait le pion et écrivait en base tout seul, depuis la phase
    // de ciblage. La case, elle, reste choisie à l'écran — c'est du ciblage,
    // pas un résultat de dé.
    //
    // Le bond ne clôt pas le tour : la carte qui le porte continue de se
    // résoudre après (une attaque qui suit le saut, par exemple).
    // L'ILLUSION ENTRE EN SCÈNE, comme un renfort. Elle naissait d'un document
    // créé à la volée par le navigateur du lanceur : le cerveau, qui arrête sa
    // liste de combattants à l'ouverture du combat, n'en savait rien. Le leurre
    // s'affichait sur le plateau sans exister pour personne — impossible à
    // viser, impossible à faire tomber.
    //
    // Elle n'entre PAS dans l'ordre d'initiative : ce n'est jamais son tour.
    if (intention.type === "illusion") {
        const suivant = clonerEtat(etat);
        const lanceur = combattant(suivant, intention.acteur);
        const vers = intention.vers || {};
        const leurre = combattantIllusion(lanceur, intention.idIllusion, vers.q, vers.r);
        suivant.combattants[leurre.id] = leurre;
        return fabriquerPas(etat, suivant,
            [{ type: "arrivee", combattant: leurre }],
            intention.id, intention.acteur, des);
    }

    if (intention.type === "bond") {
        const r = resoudreBond(etat, {
            idLanceur: intention.acteur,
            vers: intention.vers,
            portee: nombre(intention.portee, 1)
        }, des, plateau);
        return fabriquerPas(etat, r.etat, r.etapes, intention.id, intention.acteur, des);
    }

    if (intention.type === "mouvement") {
        const r = resoudreMouvement(etat, {
            idLanceur: intention.acteur,
            chemin: intention.chemin,
            reserveCarte: nombre(intention.reserveCarte)
        }, des, plateau);
        return fabriquerPas(etat, r.etat, r.etapes, intention.id, intention.acteur, des);
    }

    if (intention.type === "carte") {
        // Les dés se tirent ICI, chez le cerveau, une fois pour tout le monde.
        // Un client n'envoie jamais de résultat : il ne pourrait pas être cru.
        const critique = tirerCritique(etat, intention.acteur, des);
        const brute = {
            type: "carte", idLanceur: intention.acteur, idCarte: intention.idCarte,
            attaques: intention.attaques || [], alterations: intention.alterations || [],
            coutFatigue: nombre(intention.coutFatigue), critique
        };

        // LA CONFUSION DÉTOURNE LA CARTE AVANT QUE LES DÉS NE TOMBENT. L'ordre
        // n'est pas négociable : les jets de tirerDesCarte sont rangés PAR
        // CIBLE, donc il faut savoir qui est visé avant de les tirer. Tiré
        // après, on aurait des dés pour des cibles que la carte ne touche plus,
        // et aucun pour celle qu'elle touche vraiment.
        //
        // Le dé n'est consommé que si le lanceur est confus (voir
        // appliquerConfusion) : une carte ordinaire tire exactement les mêmes
        // dés qu'avant, et les journaux déjà écrits se rejouent à l'identique.
        const action = appliquerConfusion(etat, brute, plateau, des);
        action.jets = tirerDesCarte(etat, action, intention.acteur, critique, des);
        const r = resoudreCarte(etat, action, plateau);

        // UNE CARTE TERMINE LE TOUR, et c'est la règle du jeu depuis toujours :
        // validerCarteCombat enchaîne sur finDeTourCombat. Le cerveau ne le
        // faisait pas, et ça se voyait de deux façons à la table — le tour ne
        // se finissait pas après l'attaque, et on pouvait lancer la même carte
        // plusieurs fois de suite.
        //
        // La clôture règle les deux d'un coup : le lanceur quitte la tête de
        // file, donc une seconde carte est refusée d'elle-même (« c'est au tour
        // de X »). Il n'y a pas de compteur à tenir, juste une règle à dire.
        const suivant = clonerEtat(r.etat);
        const etapes = [...r.etapes];

        // ÊTRE POUSSÉ OU TIRÉ DANS LE FEU BRÛLE AUTANT QU'Y MARCHER. La
        // traversée de zone se fait ici et non dans resoudreCarte, pour une
        // raison simple : resoudreCarte ne tient aucun dé — tous ses jets
        // sont tirés d'avance par tirerDesCarte, et une case d'arrivée n'est
        // connue qu'une fois le déplacement résolu. Ici, le dé est encore à
        // portée de main.
        etapes.filter(e => (e.type === "poussee" || e.type === "traction") && e.vers).forEach(e => {
            etapes.push(...traverserZones(suivant, e.cible, e.vers, des));
        });

        // LA PEUR SE JOUE ICI, ET NULLE PART AILLEURS. resoudreCarte l'a
        // laissée volontairement de côté (voir moteur_pur.js) : fuir suppose
        // un jet de direction À CHAQUE CASE, avec autant de jets que la fuite
        // en compte — une chose que le noyau, sans dé en main, ne peut pas
        // trancher. On regarde ici, directement dans les jets déjà tirés (pas
        // de nouveau tirage : le hasard de la CIBLE a déjà tranché si l'effet
        // la touche), qui a été touché par une Peur qui a atteint sa cible,
        // et on la fait fuir avec les dés du cerveau — exactement comme une
        // marche normale (resoudreMouvement) tranche déjà ses propres
        // attaques d'opportunité en vivant.
        (action.alterations || []).forEach(alt => {
            if (alt.nom !== "Peur") return;
            (alt.cibles || []).forEach(idCible => {
                const jetCible = (action.jets && action.jets.parCible && action.jets.parCible[idCible]) || {};
                if (jetCible.esquive || (jetCible.etats || {}).Peur !== true) return;
                etapes.push(...resoudrePeur(suivant, action.idLanceur, idCible, des, plateau));
            });
        });

        // LA ZONE QUE LA CARTE LAISSE DERRIÈRE ELLE. Elle se posait jusqu'ici
        // hors du cerveau (creerZonePersistante écrivait dans Combat_VTT et
        // dans une variable globale), donc l'état du combat ne la connaissait
        // pas : le feu se dessinait sur le plateau, mais aucun combattant ne
        // pouvait marcher dedans puisque, pour le cerveau, il n'existait pas.
        //
        // Les cases viennent du client : c'est du CIBLAGE, décidé par le joueur
        // au moment où il pose sa carte, exactement comme la liste des cibles.
        // Aucun dé là-dedans — rien qu'un poste puisse fausser à son avantage.
        if (intention.persistanceTerrain) {
            const zone = creerZonePure(suivant, action, intention.zoneHexes || [],
                                       intention.acteur);
            if (zone) etapes.push(...poserZone(suivant, zone));
        }

        // UNE CARTE TERMINE LE TOUR, et c'est la règle du jeu depuis toujours :
        // validerCarteCombat enchaîne sur finDeTourCombat. Le cerveau ne le
        // faisait pas, et ça se voyait de deux façons à la table — le tour ne
        // se finissait pas après l'attaque, et on pouvait lancer la même carte
        // plusieurs fois de suite.
        //
        // La clôture règle les deux d'un coup : le lanceur quitte la tête de
        // file, donc une seconde carte est refusée d'elle-même (« c'est au tour
        // de X »). Il n'y a pas de compteur à tenir, juste une règle à dire.
        const clot = cloturerTour(suivant);
        if (clot) etapes.push(...clot.etapes);

        return fabriquerPas(etat, suivant, etapes, intention.id, intention.acteur, des);
    }

    return null;
}

// =========================================================================
//  6. LE TOUR D'UNE CRÉATURE, D'UN SEUL TENANT
// =========================================================================
//  Déplacement ET carte dans UNE SEULE entrée de journal. C'est voulu : un tour
//  de créature est un tout, il n'a pas de raison d'être coupé en morceaux qui
//  pourraient s'entrelacer avec autre chose. Là où l'ancienne architecture
//  faisait huit à douze écritures indépendantes, il n'y en a plus qu'une.

export function jouerCreature(etat, id, carte, plateau) {
    const des = creerDes(etat.graine);
    const infos = carte && carte.infos ? carte.infos : { portee: 1, fatigue: 0 };

    const plan = deciderTourCreature(etat, id, infos, plateau, des);
    if (!plan) return null;

    let courant = etat;
    const etapes = [];

    // Le déplacement d'abord — un pas, une étape, opportunités comprises.
    if (plan.chemin.length > 0) {
        const m = resoudreMouvement(courant, {
            idLanceur: id, chemin: plan.chemin, reserveCarte: nombre(infos.fatigue)
        }, des, plateau);
        courant = m.etat;
        etapes.push(...m.etapes);
    }

    // Puis la carte, si la créature est bien à portée après avoir marché, et si
    // elle tient encore debout : une attaque d'opportunité a pu la coucher en
    // chemin, et un mort ne lance rien.
    const moi = combattant(courant, id);
    const cible = plan.cible ? combattant(courant, plan.cible) : null;
    const aPortee = moi && !moi.aTerre && cible && !cible.aTerre
                    && distance(moi, cible) <= nombre(infos.portee, 1);

    if (aPortee && carte && carte.idCarte) {
        const critique = tirerCritique(courant, id, des);
        const brute = {
            type: "carte", idLanceur: id, idCarte: carte.idCarte,
            attaques: (carte.attaques || []).map(a => ({ ...a, cibles: [plan.cible] })),
            alterations: (carte.alterations || []).map(a => ({ ...a, cibles: [plan.cible] })),
            coutFatigue: nombre(infos.fatigue), critique
        };
        // UNE CRÉATURE CONFUSE SE TROMPE AUSSI DE CIBLE. La confusion ne vivait
        // que du côté des joueurs (elle était tirée dans le navigateur du
        // lanceur) : un monstre confus visait tranquillement qui il voulait.
        // Même dé, même règle, pour tout le monde.
        const action = appliquerConfusion(courant, brute, plateau, des);
        action.jets = tirerDesCarte(courant, action, id, critique, des);
        const r = resoudreCarte(courant, action, plateau);
        courant = clonerEtat(r.etat);
        etapes.push(...r.etapes);

        // Une créature qui pousse ou tire quelqu'un dans le feu le brûle, elle aussi.
        r.etapes.filter(e => (e.type === "poussee" || e.type === "traction") && e.vers).forEach(e => {
            etapes.push(...traverserZones(courant, e.cible, e.vers, des));
        });

        // Et une créature qui fait fuir sa cible la fait fuir pour de vrai —
        // même raisonnement que côté joueur (voir plus haut) : la Peur a
        // besoin de dés qu'on n'a plus dans resoudreCarte.
        (action.alterations || []).forEach(alt => {
            if (alt.nom !== "Peur") return;
            (alt.cibles || []).forEach(idCible => {
                const jetCible = (action.jets && action.jets.parCible && action.jets.parCible[idCible]) || {};
                if (jetCible.esquive || (jetCible.etats || {}).Peur !== true) return;
                etapes.push(...resoudrePeur(courant, id, idCible, des, plateau));
            });
        });
    } else if (!aPortee) {
        // Pourquoi elle n'a rien lancé. Dans la trace, cette ligne vaut de l'or :
        // « tour de 20 millisecondes sans rien faire » restait inexplicable.
        etapes.push({ type: "renonce", acteur: id,
                      raison: plan.raison || (moi && moi.aTerre ? "tombée en chemin" : "hors de portée") });
    }

    // ET SON TOUR SE CLÔT DANS LA MÊME ENTRÉE. Une créature ne clique pas « fin
    // de tour » : personne ne le fera à sa place. Sans cette clôture, elle
    // restait en tête de file et le cerveau la rejouait indéfiniment — la
    // version filait, le journal se remplissait, et le combat n'avançait pas
    // d'un pouce. C'est le même symptôme que « le tour d'un ennemi complètement
    // passé », par l'autre bout.
    courant = clonerEtat(courant);
    const clot = cloturerTour(courant);
    if (clot) etapes.push(...clot.etapes);

    return fabriquerPas(etat, courant, etapes, `ia|${id}|${etat.manche}`, id, des);
}

// =========================================================================
//  7. QUE FAIRE MAINTENANT ?
// =========================================================================
//  LE CŒUR DU CERVEAU, et il est pur. On lui donne l'état et les intentions en
//  attente ; il rend le prochain pas à publier, ou rien s'il n'y a qu'à
//  attendre. Tout le reste du fichier n'est que de la plomberie autour.
//
//  L'ORDRE COMPTE : les intentions des joueurs d'abord (ils attendent devant
//  leur écran), les créatures ensuite. Une intention refusée n'est pas ignorée :
//  elle est rendue avec sa raison, pour que le poste concerné l'affiche.

export function prochainPas(etat, intentions, contexte) {
    const { plateau = null, carteDe = null } = contexte || {};
    if (!etat || etat.format !== FORMAT_ETAT) return null;
    if (etat.phase !== "Resolution") return null;

    const tete = (etat.file || [])[0];
    if (!tete) return null;

    // Une intention qui concerne le combattant en tête, dans l'ordre d'arrivée.
    const enAttente = (intentions || []).filter(i => i && !i.traitee);
    for (const intention of enAttente) {
        const verdict = validerIntention(etat, intention);
        if (!verdict.ok) {
            // On la referme quand même : sans ça, une intention illégitime
            // reviendrait à chaque tour de boucle et bloquerait la file.
            // UN REFUS DIT CE QU'IL REFUSE. Il ne disait que sa raison : « c'est
            // au tour de X », sans jamais nommer ce qui avait été demandé, ni
            // pour qui, ni par quel appareil. Devant la trace, impossible de
            // savoir si le joueur avait essayé de lancer sa carte, de bouger, ou
            // de finir son tour — et c'est précisément ce qu'on cherchait.
            return { refus: true, intention: intention.id, poste: intention.poste,
                     type: intention.type, acteur: intention.acteur,
                     carte: intention.idCarte || null,
                     raison: verdict.raison };
        }
        const pas = appliquerIntention(etat, intention, plateau);
        if (pas) return { ...pas, intention: intention.id };
    }

    // Personne n'a rien demandé. Si c'est le tour d'une créature, elle joue.
    const acteur = combattant(etat, tete.id);
    if (acteur && acteur.estMonstre && !acteur.aTerre) {
        const carte = carteDe ? carteDe(tete.id, tete.carte) : null;
        const pas = jouerCreature(etat, tete.id, carte, plateau);
        if (pas) return { ...pas, creature: tete.id };
    }

    // Le combattant en tête est tombé avant même de jouer : son tour n'a plus
    // lieu d'être. Sans ça, la file restait bloquée sur un cadavre et il fallait
    // cliquer « fin de tour » à sa place.
    if (acteur && acteur.aTerre) {
        const pas = avancerFile(etat, creerDes(etat.graine));
        if (pas) return { ...pas, passe: tete.id };
    }

    return null;    // un joueur réfléchit : on attend, et c'est très bien
}

// =========================================================================
//  8. LA BOUCLE, ET SON DÉPÔT
// =========================================================================
//  La seule partie qui touche au monde extérieur — et encore, à travers un
//  dépôt qu'on lui donne. Le vrai parlera à Firestore ; celui des bancs range
//  dans une carte en mémoire. Le cerveau ne fait pas la différence.
//
//  Le dépôt doit savoir faire trois choses :
//    lireEtat()                        → l'état courant
//    lireIntentions()                  → celles qui restent en attente
//    publier(etat, entree, traitees)   → UN SEUL writeBatch, tout ou rien
//
//  Et une quatrième, facultative : refuser(intention, raison, poste).

export function creerCerveau(depot, contexte) {
    const { poste, plateau = null, carteDe = null, maintenant = () => Date.now(),
            tracer = () => {} } = contexte || {};

    let enMarche = false;

    async function unTour() {
        // Réentrance : un tour qui s'attarde ne doit pas se faire doubler par le
        // suivant. C'est le seul « verrou » qui reste dans toute l'architecture,
        // et il est local à un objet en mémoire — rien à voir avec les verrous
        // distribués qui nous ont coûté une semaine.
        if (enMarche) return { attente: "déjà en cours" };
        enMarche = true;
        try {
            const etat = await depot.lireEtat();
            if (!etat) return { attente: "pas d'état" };
            if (!estLeCerveau(etat, poste)) return { attente: "un autre poste tient la main" };

            const intentions = await depot.lireIntentions();
            const pas = prochainPas(etat, intentions, { plateau, carteDe });
            if (!pas) return { attente: "rien à faire" };

            if (pas.refus) {
                tracer("🚫", `${pas.type || "intention"} de ${pas.acteur || "?"} refusé${pas.carte ? " (" + pas.carte + ")" : ""} : ${pas.raison}`,
                       `demandé par ${pas.poste || "?"}`);
                if (depot.refuser) await depot.refuser(pas.intention, pas.raison, pas.poste);
                // On rend son identité : la boucle en a besoin pour reconnaître
                // un refus qui revient, donc une fermeture qui n'a pas pris.
                return { refus: pas.raison, intention: pas.intention };
            }

            // Le garde-fou avant d'écrire : plutôt refuser de publier un état
            // incohérent que le diffuser à trois appareils. Aucun de nos bugs
            // n'aurait survécu à ce contrôle.
            const soucis = verifierEtatCombat(pas.etat);
            if (soucis.length > 0) {
                tracer("❌", "état incohérent, rien n'est publié", soucis.join(" | "));
                return { erreur: soucis };
            }

            pas.etat.battement = maintenant();
            await depot.publier(pas.etat, pas.entree, pas.intention ? [pas.intention] : []);
            // ON DIT CE QUE LE PAS CONTIENT. « pas 3 publié PERSO_250418 » ne
            // disait pas que ce tour s'était fermé SANS QU'AUCUNE CARTE NE
            // PARTE — et c'est très exactement le symptôme qu'on cherchait :
            // « ça ne voulait pas prendre la carte sélectionnée ».
            const types = (pas.entree.etapes || []).map(e => e && e.type);
            const aJoue = types.includes("carte");
            tracer("🧠", `pas ${pas.entree.v} publié`,
                   `${pas.entree.acteur || ""}${aJoue ? "" : " — tour fermé SANS carte"}`);
            return { publie: pas.entree.v, acteur: pas.entree.acteur };
        } finally {
            enMarche = false;
        }
    }

    // Le battement de cœur : il dit aux autres postes que ce cerveau est vivant.
    // Il n'écrit QUE cette valeur — jamais l'état — pour ne pas entrer en
    // concurrence avec un pas en cours de publication.
    async function battre() {
        if (!depot.battre) return;
        const etat = await depot.lireEtat();
        if (etat && estLeCerveau(etat, poste)) await depot.battre(maintenant());
    }

    // Tourner jusqu'à ce qu'il n'y ait plus rien à faire. Un tour de créature en
    // amène un autre (la file avance, la suivante joue) : on enchaîne, avec une
    // borne pour qu'un état pathologique ne fasse jamais tourner à l'infini.
    async function tournerJusquAuCalme(maxPas = 40) {
        const faits = [];
        // Les refus déjà vus dans CE passage. Un refus est censé se refermer sur
        // l'intention elle-même ; s'il revient, c'est que la fermeture n'a pas
        // pris, et il ne faut surtout pas tourner en rond dessus.
        const dejaRefuses = new Set();

        for (let i = 0; i < maxPas; i++) {
            const r = await unTour();
            if (!r) break;

            // UN REFUS N'EST PAS UNE FIN : c'est du travail fait. L'intention
            // est refermée, donc le tour suivant de boucle voit la suite.
            //
            // La boucle s'arrêtait dessus, et ça se voit à la table depuis que
            // la carte clôt le tour : le « fin de tour » qu'un joueur envoie
            // juste après son attaque arrive trop tard, il est refusé — et le
            // cerveau s'arrêtait là, sans faire jouer les créatures qui
            // suivaient.
            if (r.refus) {
                // MAIS UN REFUS QUI REVIENT EST UN MUR, pas un pas de plus. Si
                // l'intention n'a pas pu être refermée — un dépôt sans
                // `refuser`, une écriture perdue — on repasserait dessus
                // indéfiniment sans jamais atteindre le combattant suivant. On
                // s'arrête, et c'est visible plutôt que silencieux.
                if (dejaRefuses.has(r.intention)) {
                    tracer("🚧", "un refus ne se referme pas", r.intention || "");
                    break;
                }
                dejaRefuses.add(r.intention);
                continue;
            }

            if (!r.publie) break;
            faits.push(r.publie);
        }
        return faits;
    }

    return { unTour, battre, tournerJusquAuCalme };
}

if (typeof window !== "undefined") {
    window.cerveauCombat = {
        BATTEMENT_MS, CERVEAU_PERDU_MS, estLeCerveau, cerveauPerdu,
        suivreBattement, cerveauSilencieux,
        validerIntention, appliquerIntention, avancerFile, ouvrirManche, jouerCreature,
        prochainPas, creerCerveau
    };
}
