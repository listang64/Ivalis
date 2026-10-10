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
         verifierEtatCombat, compterPasMarche, reductionInertie, FORMAT_ETAT, tomber, enSursis,
         reposDuRetourArriere, entreeDeFile, ZOMBIE, COMPAGNON, compagnonDe,
         placerCompagnons, MUR_TERRE, murEn, plateauDeCombat, franchissablePour, frapperMurs,
         cleGravats, APPLICATEURS, ETAT_PLAIE_ROUVERTE, gainReposLong } from './combat_etat.js';
import { resoudreCarte, tirerDesCarte, tirerCritique, appliquerConfusion, dissiperConfusion,
         traverserZones, creerZonePure, poserZone, vieillirZones,
         chaineDeDegats, REGLES_ETATS, regleDesEtats, estDansLeNoir,
         partageTenebres, ETAT_TENEBRES_ETALEES, POISON, POISON_MAITRE, ETAT_SAIGNEMENT, SAIGNEMENT,
         resoudreTechniqueClasse, actionAssautMortel, actionBaiserVampire, appliquerCharme,
         actionResonanceBouclier, ennemisAuContact, tirerDirectionsAveugle, ligneDeVue, caseLibre, aLEtat } from './moteur_pur.js';
import { resoudreMouvement, resoudreBond, resoudrePeur, resoudreRepli, distance, planifierTrajet,
         occupantVivant, fureurDeLaSentinelle, voisinsDe } from './mouvement_pur.js';
import { deciderTourCreature, choisirZone, choisirRepli, ennemiLePlusProche, casesAccessibles,
         ennemiAtteignable, pasJusquAuContact, detourDesMurs, DETOUR_MAX_MURS, PAS_MAX_CREATURE } from './ia_pure.js';

// LES SUITES D'UNE CARTE LANCÉE EN ÉTAT DE CONFUSION (règle de Nico, voir
// appliquerConfusion) : après la carte, le 3e jet le fait FUIR comme sous la
// Peur — loin de l'adversaire le plus proche, et chaque ennemi quitté frappe —
// puis, en fin de boucle, le 4e jet dissipe la confusion. Ici et pas dans
// resoudreCarte : la fuite tire un dé à chaque case, et seul le cerveau en a.
function suitesDeConfusion(etat, action, des, plateau) {
    const conf = action && action.confusion;
    if (!conf) return [];
    const id = action.idLanceur;
    const etapes = [];
    const moi = combattant(etat, id);
    if (conf.fuite && moi && !moi.aTerre) {
        etapes.push({ type: "message", cible: id, acteur: id, texte: "Confus : s'enfuit !", couleur: "#cc66ff" });
        const menace = ennemiLePlusProche(etat, id);
        etapes.push(...resoudrePeur(etat, menace ? menace.id : id, id, des, plateau, { exempte: null, fuite: "confusion" }));
    }
    const apres = combattant(etat, id);
    if (conf.dissipee && apres && !apres.aTerre) etapes.push(...dissiperConfusion(etat, id));
    return etapes;
}

const nombre = (v, defaut = 0) => {
    const n = parseInt(v);
    return Number.isFinite(n) ? n : defaut;
};

// Le battement de cœur du cerveau, et le délai au bout duquel les autres postes
// proposent de reprendre la main. Trente secondes : assez long pour qu'un wifi
// qui hoquette ne déclenche rien, assez court pour qu'une table ne reste pas
// bloquée si l'écran du maître s'est fermé.
//
// DIX SECONDES, PAS CINQ. Chaque battement est une écriture, et une lecture
// par appareil qui écoute l'état — toute la soirée, même quand personne ne
// joue. À cinq secondes, c'était 720 écritures et plus de 2 000 lectures par
// heure pour le seul fait d'être vivant, sur un quota gratuit de 20 000
// écritures et 50 000 lectures par JOUR. Trois battements tiennent encore dans
// les trente secondes du délai : un cerveau vivant n'est jamais pris pour mort.
export const BATTEMENT_MS = 10000;
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
// cerveau réécrit ce champ toutes les dix secondes, ce qui provoque une
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

export const TYPES_INTENTION = ["mouvement", "carte", "bond", "illusion", "finTour", "classe"];


// LES CIBLES DE L'ASSAUT MORTEL, SANS LES MORTS. Une case de la zone peut
// encore porter le pion (invisible) d'un combattant tombé plus tôt : l'écran
// l'envoyait avec l'autre, et toute la technique était refusée. Un combattant
// à terre ou disparu est simplement retiré ; le reste est validé normalement.
function ciblesDeLAssaut(etat, intention) {
    const brutes = Array.isArray(intention.cibles) ? [...new Set(intention.cibles)] : [];
    return brutes.filter(id => { const c = combattant(etat, id); return c && !c.aTerre; });
}

export function validerIntention(etat, intention, plateau) {
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
            // Un mur de terre : seul le Géomancien qui l'a levé le traverse.
            const dessus = (plateau && plateau.etatCase) ? (plateau.etatCase(vers.q, vers.r) || {}) : {};
            if (dessus.murTerre && !franchissablePour(dessus, acteur)) return refus("un mur de terre barre le chemin");
            de = vers;
        }
        const finChemin = chemin[chemin.length - 1];
        const dessusFin = (plateau && plateau.etatCase) ? (plateau.etatCase(finChemin.q, finChemin.r) || {}) : {};
        if (dessusFin.murTerre) return refus("on ne s'arrête pas sur un mur de terre");
        // Et il doit être payable, au moins en partie — au barème de CE tour,
        // cases déjà marchées comprises (voir le `pas` de la file).
        const plan = planifierTrajet(etat, intention.acteur, chemin, intention.plateau, {
            pasDejaFaits: nombre(tete.pas),
            reserveCarte: nombre(intention.reserveCarte)
        });
        if (plan.pas.length === 0) return refus(plan.plafond ? "blessé : plus aucune case permise ce tour-ci"
                                                             : "pas assez d'énergie pour un seul pas");
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

    // UNE TECHNIQUE DE CLASSE (Hoplite) : la sienne, à son niveau, pas encore
    // jouée dans ce combat, et choisie pour CETTE manche. Le Rempart vise un
    // allié debout, à côté de lui.
    if (intention.type === "classe") {
        const idCarte = intention.idCarte;
        if (!idCarte) return refus("technique sans identité");
        if (!((acteur.atouts && acteur.atouts.techniques) || []).includes(idCarte)) {
            return refus(`${intention.acteur} n'a pas la technique ${idCarte}`);
        }
        if (idCarte !== TECHNIQUE_MUR_TERRE && (acteur.techniquesUtilisees || []).includes(idCarte)) {
            return refus(`${idCarte} déjà utilisée dans ce combat`);
        }
        // Le Mur de terre (Géomancien) : des cases choisies, chacune à 5 cases
        // au plus et en vue, libres de tout mur ; 20 de fatigue par mur.
        if (idCarte === TECHNIQUE_MUR_TERRE) {
            const cases = Array.isArray(intention.murs) ? intention.murs : [];
            if (cases.length === 0) return refus("Mur de terre : aucune case choisie");
            const vues = new Set();
            for (const h of cases) {
                if (!h || !Number.isInteger(h.q) || !Number.isInteger(h.r)) return refus("Mur de terre : case invalide");
                const cle = cleGravats(h.q, h.r);
                if (vues.has(cle)) return refus("Mur de terre : deux murs sur la même case");
                vues.add(cle);
                const d = distance(acteur, h);
                if (d < 1 || d > MUR_TERRE.portee) return refus("Mur de terre : à 5 cases au plus (pas sur soi)");
                if (murEn(etat, h.q, h.r)) return refus("Mur de terre : il y a déjà un mur");
                if (plateau && plateau.etatCase) {
                    const dessus = plateau.etatCase(h.q, h.r) || {};
                    if (dessus.bloquee || dessus.supprimee) return refus("Mur de terre : case impraticable");
                    if (!ligneDeVue(plateau, acteur, h)) return refus("Mur de terre : pas de ligne de vue");
                }
            }
            const cout = MUR_TERRE.coutFatigue * cases.length;
            if (cout > nombre(acteur.fatigue)) return refus(`Mur de terre : il faut ${cout} d'énergie, il en reste ${nombre(acteur.fatigue)}`);
        }
        if (tete.carte && tete.carte !== idCarte) return refus(`la carte de ce tour est ${tete.carte}`);
        if (idCarte === "CLASSE_REMPART") {
            const allie = combattant(etat, intention.cible);
            if (!allie) return refus("Rempart sans allié");
            if (allie.id === acteur.id) return refus("le Rempart protège un autre que soi");
            if (allie.aTerre || allie.estIllusion || allie.camp !== acteur.camp) return refus("Rempart : allié invalide");
            if (distance(acteur, allie) > 1) return refus("Rempart : l'allié doit être adjacent");
        }
        // Le Baiser du vampire : un ennemi debout, au contact.
        if (idCarte === "CLASSE_BAISER_VAMPIRE") {
            const ennemi = combattant(etat, intention.cible);
            if (!ennemi) return refus("Baiser du vampire sans cible");
            if (ennemi.aTerre || ennemi.estIllusion || ennemi.camp === acteur.camp) return refus("Baiser du vampire : ennemi invalide");
            if (distance(acteur, ennemi) !== 1) return refus("Baiser du vampire : l'ennemi doit être au contact");
        }
        // Le Charme fratricide (Sorcier) : un ennemi debout, à 3 cases au plus.
        if (idCarte === "CLASSE_CHARME_FRATRICIDE") {
            const ennemi = combattant(etat, intention.cible);
            if (!ennemi) return refus("Charme sans cible");
            if (ennemi.aTerre || ennemi.estIllusion || ennemi.camp === acteur.camp) return refus("Charme : ennemi invalide");
            if (distance(acteur, ennemi) > 3) return refus("Charme : l'ennemi doit être à 3 cases au plus");
        }
        // Le Transfert (Sorcier) : un autre combattant debout, allié ou ennemi,
        // à 5 cases au plus — la ligne de vue ne compte pas (il se téléporte,
        // même derrière un mur).
        if (idCarte === "CLASSE_TRANSFERT") {
            const autre = combattant(etat, intention.cible);
            if (!autre) return refus("Transfert sans cible");
            if (autre.id === acteur.id || autre.aTerre || autre.estIllusion) return refus("Transfert : cible invalide");
            if (distance(acteur, autre) > 5) return refus("Transfert : la cible doit être à 5 cases au plus");
        }
        // L'Arrêt du temps (Oracle) : une compétence FORGÉE à rejouer (ni une
        // technique de classe, ni le repos long), et une initiative de 0 à 199.
        if (idCarte === "CLASSE_ARRET_TEMPS") {
            const choisie = intention.cible;
            if (!choisie || typeof choisie !== "string") return refus("Arrêt du temps : aucune compétence choisie");
            if (choisie.startsWith("CLASSE_") || choisie === "REPOS_LONG") {
                return refus("Arrêt du temps : une compétence forgée seulement");
            }
            const init = Number(intention.initiative);
            if (!Number.isInteger(init) || init < 0 || init > 199) {
                return refus("Arrêt du temps : l'initiative va de 0 à 199");
            }
        }
        // Le Tir précis (Pisteur) : un ennemi debout, à 5 cases au plus, en
        // vue (le plateau tranche quand on l'a).
        if (idCarte === "CLASSE_TIR_PRECIS") {
            const ennemi = combattant(etat, intention.cible);
            if (!ennemi) return refus("Tir précis sans cible");
            if (ennemi.aTerre || ennemi.estIllusion || ennemi.camp === acteur.camp) return refus("Tir précis : ennemi invalide");
            if (distance(acteur, ennemi) > 5) return refus("Tir précis : l'ennemi doit être à 5 cases au plus");
            if (plateau && !ligneDeVue(plateau, acteur, ennemi)) return refus("Tir précis : pas de ligne de vue");
        }
        // Le Lien de sang (Pisteur) : son compagnon, au contact, blessé ou KO —
        // indemne, la technique est refusée (pas gâchée).
        if (idCarte === "CLASSE_LIEN_DE_SANG") {
            const bete = compagnonDe(etat, acteur.id);
            if (!bete) return refus("Lien de sang : aucun compagnon");
            if (distance(acteur, bete) !== 1) return refus("Lien de sang : le compagnon doit être au contact");
            if (!bete.aTerre && nombre(bete.pv) >= nombre(bete.pvMax)) return refus("Lien de sang : le compagnon est indemne");
        }
        // La Fureur de la sentinelle : au moins un ennemi au contact, sinon
        // refusée (pas gâchée).
        if (idCarte === "CLASSE_FUREUR_SENTINELLE" && ennemisAuContact(etat, acteur.id).length === 0) {
            return refus("Fureur de la sentinelle : aucun ennemi au contact");
        }
        // La Résonance du bouclier (Protecteur) : il lui faut au moins un
        // ennemi au contact — sinon elle n'est pas gâchée, elle est refusée.
        if (idCarte === "CLASSE_RESONANCE_BOUCLIER" && ennemisAuContact(etat, acteur.id).length === 0) {
            return refus("Résonance du bouclier : aucun ennemi au contact");
        }
        // La Prise en charge (Médicus) : un allié À TERRE, à côté de lui.
        if (idCarte === "CLASSE_PRISE_EN_CHARGE") {
            const allie = combattant(etat, intention.cible);
            if (!allie) return refus("Prise en charge sans allié");
            if (allie.id === acteur.id || allie.estIllusion || allie.camp !== acteur.camp) return refus("Prise en charge : allié invalide");
            if (!allie.aTerre) return refus("Prise en charge : l'allié n'est pas KO");
            if (distance(acteur, allie) > 1) return refus("Prise en charge : l'allié doit être adjacent");
        }
        // L'Assaut mortel : un ou deux ennemis debout, au contact, et côte à
        // côte s'ils sont deux — la zone de deux cases qui tourne autour de lui.
        if (idCarte === "CLASSE_ASSAUT_MORTEL") {
            const cibles = ciblesDeLAssaut(etat, intention);
            if (cibles.length < 1 || cibles.length > 2) return refus("Assaut mortel : un ou deux ennemis");
            for (const idCible of cibles) {
                const ennemi = combattant(etat, idCible);
                if (!ennemi || ennemi.aTerre || ennemi.estIllusion || ennemi.camp === acteur.camp) {
                    return refus(`Assaut mortel : ${idCible} n'est pas un ennemi valable`);
                }
                if (distance(acteur, ennemi) !== 1) return refus("Assaut mortel : l'ennemi doit être au contact");
            }
            if (cibles.length === 2 && distance(combattant(etat, cibles[0]), combattant(etat, cibles[1])) !== 1) {
                return refus("Assaut mortel : les deux cases de la zone se touchent");
            }
        }
    }

    if (intention.type === "carte") {
        if (!intention.idCarte) return refus("carte sans identité");
        // (L'Inertie martiale allège la mêlée après une charge : on juge sur
        // le prix réellement payé.)
        const cout = Math.max(0, nombre(intention.coutFatigue) - reductionInertie(etat, acteur.id, intention));
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

    // LE COMPTEUR DE CASES MARCHÉES SUIT LES ÉTAPES, ICI ET POUR TOUS LES PAS.
    //
    // Les résolutions du noyau pur travaillent sur l'état et n'ont pas à savoir
    // qu'une file existe : elles produisent des étapes. C'est donc au seul
    // endroit par lequel TOUT passe — cette fonction — qu'on applique la même
    // règle que l'applicateur d'étape, avec la même fonction. Le poste qui écrit
    // et celui qui rejoue arrivent ainsi au même compteur, sans qu'aucun chemin
    // (marche d'un joueur, tour d'une créature) ait à y penser.
    (etapes || []).forEach(e => compterPasMarche(suivant, e));
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

    // LE SURSIS SE DÉCOMPTE AU BOUT DE CHACUN DE SES TOURS. Le tour où il a
    // été entamé ne compte pas ; au bout du dernier, le Nécromancien tombe.
    const etapesSursis = [];
    const enFin = combattant(etat, partie.id);
    if (enSursis(enFin)) {
        if (enFin.sursis.entame) {
            enFin.sursis = { ...enFin.sursis, entame: false };
            etapesSursis.push({ type: "sursis", cible: partie.id, tours: enFin.sursis.tours, entame: false, pvApres: 0 });
        } else {
            const reste = nombre(enFin.sursis.tours) - 1;
            if (reste > 0) {
                enFin.sursis = { tours: reste, entame: false };
                etapesSursis.push({ type: "sursis", cible: partie.id, tours: reste, entame: false, pvApres: 0 });
            } else {
                enFin.sursis = null;
                enFin.aTerre = true;
                enFin.pv = 0;
                etapesSursis.push({ type: "sursis", cible: partie.id, tours: 0, pvApres: 0 },
                                  { type: "chute", cible: partie.id, acteur: partie.id, finSursis: true });
            }
        }
    }

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
    // LE RETOUR ARRIÈRE DE L'ORACLE : son tour commence, il se repose d'abord
    // (combat_etat.js). Posé AVANT l'étape « tour », pour qu'elle emporte
    // l'entrée marquée « repos pris ».
    const etapesRepos = finDeManche ? [] : reposDuRetourArriere(etat);

    const etapes = [...etapesSursis,
                    { type: "tour", fini: partie.id, file, phase: etat.phase,
                      manche: etat.manche, ontJoue: etat.ontJoue },
                    ...etapesRepos];
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
    // + l'atout du Médicus (regenFatigue).
    return nombre(stats.Regeneration) + nombre(stats.Dev_Mod_Regen) + nombre(c && c.atouts && c.atouts.regenFatigue);
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
// (Le ×1,3 du Profanateur sur ces dégâts était une erreur : son atout est un
// rabais de fatigue à la Forge, pas un bonus de dégâts — voir app.js.)

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
        //  Règle de Nico (tableau des effets) : 10 % de l'énergie MAXIMUM, et
        //  8 % des points de vie maximum en dégâts BRUTS — aucune défense ni
        //  absorption ; seul le bouclier encaisse d'abord (POISON.brut).
        //  `tickFait` reste sur l'état : il voyage avec lui dans l'étape de
        //  vieillissement qui suit, donc le poison ne mord pas deux fois.
        //  LE POISON DU MAÎTRE (Assassin, niveau 10) mord, lui, à CHAQUE fin
        //  de manche tant qu'il dure (2 manches) : 18 % de l'énergie max et
        //  10 % des PV max (POISON_MAITRE). Le KO qu'il fait revient à
        //  l'Assassin (`idSource`, l'Instinct du tueur).
        const poison = c.etats.find(e => e && e.nom === "Empoisonnement" && (e.maitre ? nombre(e.duree) > 0 : !e.tickFait));
        if (poison) {
            poison.tickFait = true;
            const regle = poison.maitre ? POISON_MAITRE : POISON;

            const energie = Math.ceil(nombre(c.fatigueMax) * (regle.energiePct / 100));
            const fatigueApres = Math.max(0, nombre(c.fatigue) - energie);
            if (fatigueApres !== nombre(c.fatigue)) {
                c.fatigue = fatigueApres;
                etapes.push({ type: "fatigue", cible: id, fatigueApres,
                              tic: "Empoisonnement" });
            }

            const morsure = Math.ceil(nombre(c.pvMax) * (regle.pvMaxPct / 100));
            if (morsure > 0) {
                const compte = chaineDeDegats(c, { valeurBrute: morsure, typeRes: regle.typeRes, brut: !!regle.brut }, {});
                if (compte.degats > 0) etapes.push(...infligerTic(c, id, compte.degats, "Empoisonnement", etat, poison.idSource));
            }
        }

        // --- BRÛLURE : elle ronge tant qu'elle dure --------------------------
        //  Règle de Nico (tableau des effets) : 8 % des points de vie maximum
        //  en dégâts MAGIQUES à chaque fin de manche, la défense magique
        //  réduisant le coup (puis le bouclier). Elle faisait 3 dégâts du
        //  type de l'attaque qui l'avait allumée. Contrairement au poison, elle
        //  mord à CHAQUE manche tant qu'elle dure.
        const brulure = c.etats.find(e => e && e.nom === "Brûlé");
        if (brulure) {
            const regle = REGLES_ETATS["Brûlé"] || {};
            // regleDesEtats plutôt que la règle seule : le Vampire brûle à
            // 18 % de ses PV max, pas à 8 (brulureAggravee).
            const brut = Math.ceil(nombre(c.pvMax) * (regleDesEtats(c, "pvMaxParTour") / 100));
            const compte = chaineDeDegats(c, { valeurBrute: brut, typeRes: regle.typeParTour || "Magique" }, {});
            if (compte.degats > 0) {
                etapes.push(...infligerTic(c, id, compte.degats, "Brûlure", etat, brulure.idSource));
            }
        }

        // --- SAIGNEMENT : il saigne tant qu'il dure ---------------------------
        //  Règle de Nico (tableau des effets) : 8 % des points de vie maximum
        //  en dégâts PHYSIQUES à chaque fin de manche, l'armure réduisant le
        //  coup (puis le bouclier). Comme la brûlure, à CHAQUE manche.
        const saignement = c.etats.find(e => e && e.nom === ETAT_SAIGNEMENT);
        if (saignement) {
            const brut = Math.ceil(nombre(c.pvMax) * (SAIGNEMENT.pvMaxPct / 100));
            const compte = chaineDeDegats(c, { valeurBrute: brut, typeRes: SAIGNEMENT.typeRes }, {});
            if (compte.degats > 0) {
                etapes.push(...infligerTic(c, id, compte.degats, ETAT_SAIGNEMENT, etat, saignement.idSource));
            }
        }

        // --- PLAIE ROUVERTE (Saignement persistant, blessures.js) ----------
        //  Des PV fixes, bruts, à chaque fin de manche tant qu'elle dure.
        const plaie = c.etats.find(e => e && e.nom === ETAT_PLAIE_ROUVERTE && nombre(e.perteFixe) > 0);
        if (plaie) etapes.push(...infligerTic(c, id, nombre(plaie.perteFixe), ETAT_PLAIE_ROUVERTE, etat, id));

        // --- ÉTALEMENT : une part par manche, jamais au lancement ------------
        //  La technique étalée n'a rien fait quand elle est partie : ses parts
        //  (le montant divisé par le nombre de tours) attendent dans cette
        //  file, une par fin de manche. Le
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
            if (montant > 0) etapes.push(...infligerTic(c, id, montant, "Étalement", etat, etalement.idSource));
        }

        // --- TÉNÈBRES ÉTALÉES : la même part, selon la règle de Ténèbres -----
        //  L'énergie boit la part ; ce qu'elle ne peut plus boire frappe la vie
        //  à ×1,5, bouclier d'abord (partageTenebres, moteur_pur.js).
        const tenebres = c.etats.find(e => e && e.nom === ETAT_TENEBRES_ETALEES);
        if (tenebres && Array.isArray(tenebres.tics) && tenebres.tics.length > 0) {
            const part = nombre(tenebres.tics.shift());
            if (part > 0) {
                const partage = partageTenebres(c.fatigue, part);
                if (partage.surEnergie > 0) {
                    c.fatigue = partage.energieApres;
                    etapes.push({ type: "fatigue", cible: id, fatigueApres: c.fatigue,
                                  tenebres: true, montant: partage.surEnergie,
                                  tic: ETAT_TENEBRES_ETALEES });
                }
                if (partage.surplus > 0) etapes.push(...infligerTic(c, id, partage.surplus, ETAT_TENEBRES_ETALEES, etat, tenebres.idSource));
            }
        }

        // --- SOIN ÉTALÉ : une part de vie rendue par manche ------------------
        //  Le pendant de l'étalement pour un soin : ce qu'il a déjà calculé
        //  (bonus de l'Éthéré, malus d'une brûlure compris) est rendu une part
        //  par fin de manche, sans jamais dépasser la vie maximum.
        const soinEtale = c.etats.find(e => e && e.nom === "Soin étalé");
        if (soinEtale && Array.isArray(soinEtale.tics) && soinEtale.tics.length > 0) {
            const part = enSursis(c) ? (soinEtale.tics.shift(), 0)   // en sursis : aucun soin
                                     : nombre(soinEtale.tics.shift());
            const pvApres = Math.min(nombre(c.pvMax), nombre(c.pv) + part);
            if (pvApres > nombre(c.pv)) {
                const montant = pvApres - nombre(c.pv);
                c.pv = pvApres;
                etapes.push({ type: "soin", cible: id, montant, pvApres, tic: "Soin étalé" });
            }
        }
    });

    return etapes;
}

// Un tic de dégâts posé sur un combattant : le bouclier d'abord, la vie
// ensuite, et la chute si la vie tombe à zéro. Trois états s'en servent (la
// brûlure, l'étalement, et demain ce qu'on ajoutera) — l'écrire une fois
// évite qu'ils divergent.
//  `idSource` : qui a posé l'état — le KO lui revient (Instinct du tueur).
function infligerTic(c, id, montant, nomDuTic, etat, idSource) {
    const etapes = [];
    if (enSursis(c)) return etapes;             // en sursis : les coups sont ignorés
    const bouclierAvant = nombre(c.bouclier);
    if (bouclierAvant > 0) {
        c.bouclier = Math.max(0, bouclierAvant - montant);
        etapes.push({ type: "degats", cible: id, montant,
                      surBouclier: Math.min(bouclierAvant, montant),
                      bouclierApres: c.bouclier, pvApres: nombre(c.pv), tic: nomDuTic });
    } else {
        const pvApres = Math.max(0, nombre(c.pv) - montant);
        c.pv = pvApres;
        etapes.push({ type: "degats", cible: id, montant, pvApres,
                      bouclierApres: 0, tic: nomDuTic });
        etapes.push(...tomber(etat, id, idSource || id, { finDeManche: true }));
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
        // LE CHOC CARDIAQUE (blessures.js) : la régénération est FIXÉE (30
        // de fatigue), quel que soit le pourcentage de la fiche.
        const fixe = nombre(c.atouts && c.atouts.regenFixe);
        const pct = regenerationDe(c);
        if (fixe <= 0 && pct <= 0) return;
        const gagne = fixe > 0 ? fixe : Math.floor((pct / 100) * nombre(c.fatigueMax));
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
        if (!c || c.aTerre || enSursis(c)) return;
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
        // Une manche qui s'ouvre, c'est un compteur de cases à zéro pour tout
        // le monde. (Les marques de l'Oracle, elles, suivent l'entrée.)
        .map(f => ({ ...entreeDeFile(f), pas: 0 }))
        .filter(f => {
            const c = combattant(suivant, f.id);
            return c && !c.aTerre;
        });
    if (propre.length === 0) return null;
    // Le compagnon du Pisteur joue juste après son maître (combat_etat.js).
    const rangee = placerCompagnons(suivant, propre);
    propre.splice(0, propre.length, ...rangee);

    suivant.file = propre;
    suivant.phase = "Resolution";
    suivant.ontJoue = [];
    const etapesRepos = reposDuRetourArriere(suivant);

    const etapes = [{ type: "tour", file: propre, phase: "Resolution",
                      manche: suivant.manche, ontJoue: [] }, ...etapesRepos];
    return fabriquerPas(etat, suivant, etapes, `manche|${suivant.manche}`, null, des);
}

// =========================================================================
//  UN RENFORT ENTRE EN SCÈNE
// =========================================================================
//  Le cerveau arrête sa liste de combattants à l'OUVERTURE du combat. Tant
//  qu'aucune créature ne mourait, ça ne se voyait pas. Mais la réserve envoie
//  un remplaçant dès qu'une place se libère : ce nouveau venu recevait bien un
//  document, un pion et une ligne dans l'ordre d'initiative — et n'existait
//  chez le cerveau nulle part. `ouvrirManche` l'écartait donc de la file
//  (combattant() rend `undefined`), et il restait planté sur le plateau, joli
//  et inutile, jusqu'à la fin de la rencontre.
//
//  C'est mot pour mot ce qui était arrivé au leurre de l'Illusion, et la
//  réponse est la même : une étape « arrivee », qui le fait entrer dans l'état
//  comme n'importe quel autre changement — par le journal, donc à l'identique
//  sur les trois écrans.
//
//  Différence avec le leurre : lui, c'est une créature entière. Elle entre
//  DANS L'ORDRE D'INITIATIVE, parce que ce sera son tour.
export function accueillirCombattant(etat, venu, des) {
    if (!etat || !venu || !venu.id) return null;
    if (combattant(etat, venu.id)) return null;          // déjà là : rien à faire
    // Sans case, il n'est pas sur le plateau. On ne le fait pas entrer : un
    // combattant sans position est exactement le pion fantôme qu'on passe son
    // temps à chasser.
    if (venu.q === null || venu.q === undefined || venu.r === null || venu.r === undefined) return null;
    if (occupantVivant(etat, venu.q, venu.r, venu.id)) return null;

    const suivant = clonerEtat(etat);
    const copie = JSON.parse(JSON.stringify(venu));
    suivant.combattants[copie.id] = copie;
    const ordre = [...(suivant.ordre || [])];
    if (!ordre.includes(copie.id)) ordre.push(copie.id);
    suivant.ordre = ordre;

    return fabriquerPas(etat, suivant,
        [{ type: "arrivee", combattant: copie, ordre }],
        `arrivee|${copie.id}`, null, des);
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
// sa jauge) ou 35% pour un héros. Plus aucun atout de race ne s'y ajoute : le
// +10 de l'Humain a été retiré (demande de Nico) — il ne garde que sa jauge
// plus grande. Et comme toute étape, celle-ci porte le RÉSULTAT, jamais
// l'opération.
export function reposLongDuTour(etat) {
    const tete = (etat.file || [])[0];
    if (!tete || tete.carte !== "REPOS_LONG") return [];
    const c = combattant(etat, tete.id);
    if (!c) return [];
    const apres = Math.min(nombre(c.fatigueMax), nombre(c.fatigue) + gainReposLong(c));
    const etapes = [];
    if (apres !== nombre(c.fatigue)) {
        c.fatigue = apres;
        etapes.push({ type: "fatigue", cible: tete.id, fatigueApres: apres, repos: true });
    }
    // LE BOUCLIER DES SAGES (talent) : son repos long part à l'initiative 100
    // (combat.js) et lui donne +10 % de résistances physique et magique
    // jusqu'à la fin de la manche.
    const sages = nombre(c.atouts && c.atouts.bouclierDesSages);
    if (sages > 0) {
        c.etats = [...(c.etats || []).filter(e => e && e.nom !== ETAT_BOUCLIER_SAGES),
                   { nom: ETAT_BOUCLIER_SAGES, duree: 1, bonusEquip: { resPhys: sages, resMag: sages },
                     desc: `+${sages} % de résistances physique et magique jusqu'à la fin de la manche.` }];
        etapes.push({ type: "etats", cible: tete.id, pose: ETAT_BOUCLIER_SAGES, liste: c.etats });
    }
    return etapes;
}
export const ETAT_BOUCLIER_SAGES = "Bouclier des Sages";

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
        // LE BARÈME REPREND OÙ IL EN ÉTAIT. Les cases déjà marchées ce tour-ci
        // sont comptées : repartir en plusieurs fois ne doit pas revenir moins
        // cher que marcher d'une traite. Le compteur vit en tête de file et
        // s'efface avec le tour (voir combat_etat.js).
        const tete = (etat.file || [])[0];
        const r = resoudreMouvement(etat, {
            idLanceur: intention.acteur,
            chemin: intention.chemin,
            pasDejaFaits: nombre(tete && tete.pas),
            reserveCarte: nombre(intention.reserveCarte)
        }, des, plateau);
        return fabriquerPas(etat, r.etat, r.etapes, intention.id, intention.acteur, des);
    }

    // UNE TECHNIQUE DE CLASSE : son effet, puis la fin du tour — comme une
    // carte, elle occupe le tour du héros.
    if (intention.type === "classe" && intention.idCarte === TECHNIQUE_MUR_TERRE) {
        const suivant = clonerEtat(etat);
        const etapes = leverMursDeTerre(suivant, intention.acteur, intention.murs || [], des, plateau);
        const clot = cloturerTour(suivant);
        if (clot) etapes.push(...clot.etapes);
        return fabriquerPas(etat, suivant, etapes, intention.id, intention.acteur, des);
    }

    if (intention.type === "classe") {
        const cibles = intention.idCarte === "CLASSE_ASSAUT_MORTEL" ? ciblesDeLAssaut(etat, intention)
            : Array.isArray(intention.cibles) ? [...new Set(intention.cibles)] : undefined;
        // L'APPEL DE LA LUMIÈRE : tout le monde, le Chasseur compris. Le noir
        // de chacun se tire ici, chez le cerveau, dans l'ordre des ids.
        const noirs = intention.idCarte === "CLASSE_APPEL_LUMIERE"
            ? Object.fromEntries(Object.keys(etat.combattants || {}).sort()
                .filter(id => etat.combattants[id] && !etat.combattants[id].aTerre)
                .map(id => [id, tirerDirectionsAveugle(des)]))
            : undefined;
        const cibleTechnique = intention.idCarte === "CLASSE_LIEN_DE_SANG"
            ? (compagnonDe(etat, intention.acteur) || {}).id : intention.cible;
        const r = resoudreTechniqueClasse(etat, { idLanceur: intention.acteur, idCarte: intention.idCarte,
                                                  cible: cibleTechnique, cibles,
                                                  ...(noirs ? { noirs } : {}),
                                                  ...(intention.initiative !== undefined ? { initiative: intention.initiative } : {}) }, plateau);
        let suivant = clonerEtat(r.etat);
        const etapes = [...r.etapes];
        // Repoussé dans le feu par la Prise en charge : ça brûle aussi.
        r.etapes.filter(e => e.type === "poussee" && e.vers).forEach(e => {
            etapes.push(...traverserZones(suivant, e.cible, e.vers, des));
        });
        // L'ASSAUT MORTEL se joue comme une carte : les dés ici, chez le
        // cerveau (critique, esquive des deux cibles), puis la résolution.
        if (intention.idCarte === "CLASSE_ASSAUT_MORTEL") {
            const action = actionAssautMortel(intention.acteur, cibles);
            action.critique = tirerCritique(suivant, intention.acteur, des);
            action.jets = tirerDesCarte(suivant, action, intention.acteur, action.critique, des);
            const rc = resoudreCarte(suivant, action, plateau);
            suivant = clonerEtat(rc.etat);
            etapes.push(...rc.etapes);
        }
        // LE BAISER DU VAMPIRE frappe comme une carte, mais à coup sûr : pas de
        // dés (ni esquive, ni critique), des dégâts bruts, le soin du vampirisme.
        if (intention.idCarte === "CLASSE_BAISER_VAMPIRE") {
            const action = actionBaiserVampire(intention.acteur, combattant(suivant, intention.cible));
            const rc = resoudreCarte(suivant, action, plateau);
            suivant = clonerEtat(rc.etat);
            etapes.push(...rc.etapes);
        }
        // LA FUREUR DE LA SENTINELLE : une attaque d'opportunité sur chaque
        // ennemi au contact (dés du cerveau), puis la poussée.
        if (intention.idCarte === "CLASSE_FUREUR_SENTINELLE") {
            etapes.push(...fureurDeLaSentinelle(suivant, intention.acteur, des, plateau));
        }
        // LA RÉSONANCE DU BOUCLIER frappe comme une carte, à coup sûr : chaque
        // ennemi au contact, 5 % de ses PV max en physique, et Étourdi.
        if (intention.idCarte === "CLASSE_RESONANCE_BOUCLIER") {
            const action = actionResonanceBouclier(intention.acteur, ennemisAuContact(suivant, intention.acteur));
            const rc = resoudreCarte(suivant, action, plateau);
            suivant = clonerEtat(rc.etat);
            etapes.push(...rc.etapes);
        }
        const clot = cloturerTour(suivant);
        if (clot) etapes.push(...clot.etapes);
        return fabriquerPas(etat, suivant, etapes, intention.id, intention.acteur, des);
    }

    if (intention.type === "carte") {
        // Les dés se tirent ICI, chez le cerveau, une fois pour tout le monde.
        // Un client n'envoie jamais de résultat : il ne pourrait pas être cru.
        const critique = tirerCritique(etat, intention.acteur, des);
        const brute = {
            type: "carte", idLanceur: intention.acteur, idCarte: intention.idCarte,
            attaques: intention.attaques || [], alterations: intention.alterations || [],
            coutFatigue: nombre(intention.coutFatigue), critique,
            // Les cases d'une attaque de zone : l'écran les fait flamboyer.
            ...(Array.isArray(intention.zoneVisee) && intention.zoneVisee.length ? { zoneVisee: intention.zoneVisee } : {})
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
        // Le charme passe avant la confusion : un ennemi charmé frappe son
        // allié, quoi qu'il ait voulu viser (appliquerCharme).
        // LES MURS DE TERRE VISÉS (Géomancien) ne sont pas des combattants :
        // ils sortent de la carte avant les dés, et prennent leurs coups après.
        const { action: sansMurs, coups: coupsSurMurs } = separerMurs(etat, brute);
        const action = appliquerConfusion(etat, appliquerCharme(etat, sansMurs, plateau, des), plateau, des);
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
        if (Object.keys(coupsSurMurs).length > 0 && !(action.jets && action.jets.attaqueRatee)) {
            etapes.push(...frapperMurs(suivant, coupsSurMurs, intention.acteur, critique));
        }

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

        // Lancée en état de confusion : la fuite, puis la fin de la boucle.
        etapes.push(...suitesDeConfusion(suivant, action, des, plateau));

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

        // LE BOND PLACÉ APRÈS L'ATTAQUE. Même raison que le repli juste en
        // dessous : demandé après la carte, il arrivait sur un tour clos et
        // était refusé. Il part donc avec elle et se joue ici, après
        // l'attaque ; la géométrie (portée, murs, cases libres) reste celle
        // de resoudreBond.
        if (intention.bond && intention.bond.vers) {
            const lanceurBond = combattant(suivant, intention.acteur);
            if (lanceurBond && !lanceurBond.aTerre) {
                const rb = resoudreBond(suivant, {
                    idLanceur: intention.acteur, vers: intention.bond.vers,
                    portee: Math.min(6, Math.max(1, nombre(intention.bond.portee, 1)))
                }, des, plateau);
                Object.assign(suivant, rb.etat);
                etapes.push(...rb.etapes);
            }
        }

        // LE REPLI : LA MARCHE QUI SUIT L'ATTAQUE. La case d'arrivée voyage
        // avec la carte — une demande envoyée APRÈS serait refusée, puisque la
        // carte clôt le tour juste en dessous. Le chemin est recalculé depuis
        // la position du lanceur une fois l'attaque jouée, et les dés
        // d'esquive sont ceux du cerveau.
        if (intention.repli && intention.repli.vers) {
            etapes.push(...resoudreRepli(suivant, intention.acteur, intention.repli.vers, des, plateau, {
                portee: Math.min(6, Math.max(0, nombre(intention.repli.portee, 3))),
                chance: Math.min(100, Math.max(0, nombre(intention.repli.chance, 60)))
            }));
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

    // UN MUR DE TERRE QUI FAIT FAIRE UN TROP LONG DÉTOUR : elle ne le
    // contourne pas, elle marche droit dessus (pour le frapper ensuite, voir
    // murAFrapper). Seulement si sa carte ne part pas déjà ce tour-ci.
    const detour = detourDesMurs(etat, id, plateau);
    if (detour && detour.detour > DETOUR_MAX_MURS && !plan.lancera) {
        const moiAvant = combattant(etat, id);
        const versLeMur = (h) => { const d = detour.carteSansMurs.get(`${h.q},${h.r}`); return d === undefined ? Infinity : d; };
        const cases = aLEtat(moiAvant, "Immobilisation") ? []
            : casesAccessibles(etat, id, plateau, PAS_MAX_CREATURE).filter(h => h.chemin.length > 0);
        cases.sort((a, b) => (versLeMur(a) - versLeMur(b)) || (a.ao - b.ao) || (a.chemin.length - b.chemin.length)
                             || (a.q - b.q) || (a.r - b.r));
        const meilleure = cases[0];
        plan.chemin = meilleure && versLeMur(meilleure) < versLeMur(moiAvant) ? meilleure.chemin : [];
        plan.raison = "le mur fait un trop long détour : elle va le casser";
    }

    let courant = etat;
    const etapes = [];

    // Le déplacement d'abord — un pas, une étape, opportunités comprises.
    if (plan.chemin.length > 0) {
        const teteIA = (courant.file || [])[0];
        const m = resoudreMouvement(courant, {
            idLanceur: id, chemin: plan.chemin,
            pasDejaFaits: nombre(teteIA && teteIA.id === id ? teteIA.pas : 0),
            reserveCarte: nombre(infos.fatigue)
        }, des, plateau);
        courant = m.etat;
        etapes.push(...m.etapes);
    }

    // Puis la carte, si la créature est bien à portée après avoir marché, et si
    // elle tient encore debout : une attaque d'opportunité a pu la coucher en
    // chemin, et un mort ne lance rien.
    const moi = combattant(courant, id);
    const cible = plan.cible ? combattant(courant, plan.cible) : null;
    // Aveuglée, une créature ne vise pas ce qui se tient dans son noir (une
    // zone, si : elle frappe ce qu'elle couvre sans avoir à le voir).
    const dansLeNoir = !!(moi && cible && !infos.estZone && estDansLeNoir(moi, cible));
    // EN VUE, comme un joueur : un mur (de la carte ou de terre) entre elle et
    // sa cible, et elle ne tire pas (une zone a sa propre règle, choisirZone).
    const aPortee = moi && !moi.aTerre && cible && !cible.aTerre && !dansLeNoir
                    && distance(moi, cible) <= nombre(infos.portee, 1)
                    && (!!infos.estZone || ligneDeVue(plateau, moi, cible));

    // UNE CARTE DE ZONE ne ramasse pas la cible unique choisie plus haut — elle
    // ne sert ici qu'à décider si ça valait le coup de marcher. On recalcule
    // l'emprise APRÈS le déplacement réellement joué (une attaque d'opportunité
    // a pu dévier la créature du plan) : c'est la même fonction qu'a utilisée
    // deciderTourCreature, sur l'état à jour plutôt que sur l'arrivée prévue.
    const zone = (aPortee && infos.estZone)
        ? choisirZone(courant, id, infos, plateau, des, { q: moi.q, r: moi.r })
        : null;
    const ciblesFrappees = (zone && zone.cibles.length) ? zone.cibles : [plan.cible];

    if (aPortee && carte && carte.idCarte) {
        const critique = tirerCritique(courant, id, des);
        // UNE CARTE QUI FRAPPE ET SOUTIENT ne soigne pas sa victime. Le soin,
        // le bouclier ou l'absorption posés à côté d'une attaque reviennent à
        // la créature elle-même — la même règle que la seconde phase de
        // ciblage d'un joueur (moteur_effets.js, passerAuCiblageDuSoutien).
        // Une carte qui ne fait que soutenir garde sa cible, comme avant.
        const tous = [...(carte.attaques || []), ...(carte.alterations || [])];
        const mixte = tous.some(e => e && e.isHeal) && tous.some(e => e && !e.isHeal);
        const ciblesDe = (e) => (mixte && e && e.isHeal) ? [id] : ciblesFrappees;
        const brute = {
            type: "carte", idLanceur: id, idCarte: carte.idCarte,
            attaques: (carte.attaques || []).map(a => ({ ...a, cibles: ciblesDe(a) })),
            alterations: (carte.alterations || []).map(a => ({ ...a, cibles: ciblesDe(a) })),
            coutFatigue: nombre(infos.fatigue), critique,
            // Les cases de son attaque de zone : l'écran les fait flamboyer.
            ...(zone && (zone.hexes || []).length ? { zoneVisee: zone.hexes } : {})
        };
        // UNE CRÉATURE CONFUSE SE TROMPE AUSSI DE CIBLE. La confusion ne vivait
        // que du côté des joueurs (elle était tirée dans le navigateur du
        // lanceur) : un monstre confus visait tranquillement qui il voulait.
        // Même dé, même règle, pour tout le monde.
        const action = appliquerConfusion(courant, appliquerCharme(courant, brute, plateau, des), plateau, des);
        action.jets = tirerDesCarte(courant, action, id, critique, des);
        const r = resoudreCarte(courant, action, plateau);
        courant = clonerEtat(r.etat);
        etapes.push(...r.etapes);

        // LA ZONE QU'UNE CARTE DE PERSISTANCE LAISSE DERRIÈRE ELLE — même
        // raisonnement que pour un joueur (voir prochainPas plus haut) : une
        // créature qui lance une carte à persistance de terrain laisse le
        // même feu au sol, avec la même emprise que celle qui a frappé.
        if (infos.persistanceTerrain && zone && zone.hexes.length) {
            const zonePosee = creerZonePure(courant, action, zone.hexes, id);
            if (zonePosee) etapes.push(...poserZone(courant, zonePosee));
        }

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

        // Une créature confuse s'enfuit, et s'en remet, comme un joueur.
        etapes.push(...suitesDeConfusion(courant, action, des, plateau));

        // SA CARTE PORTE UN REPLI : elle décroche après avoir frappé, vers la
        // case qui l'éloigne le plus de l'adversaire (ia_pure.js, choisirRepli),
        // et marche comme un joueur qui se replie — mêmes dés, même règle.
        if (carte.repli) {
            const portee = Math.min(6, Math.max(0, nombre(carte.repli.portee, 3)));
            const vers = choisirRepli(courant, id, portee, plateau);
            if (vers) {
                etapes.push(...resoudreRepli(courant, id, vers, des, plateau, {
                    portee, chance: Math.min(100, Math.max(0, nombre(carte.repli.chance, 60)))
                }));
            }
        }
    } else if (!aPortee && murAFrapper(courant, id, carte, plateau)) {
        // ENFERMÉE PAR UN MUR DE TERRE : plus aucun ennemi joignable à pied,
        // elle frappe le mur à son contact avec sa carte (ses dégâts, bruts).
        const mur = murAFrapper(courant, id, carte, plateau);
        courant = clonerEtat(courant);
        const elle = combattant(courant, id);
        const cout = Math.min(nombre(elle.fatigue), nombre(infos.fatigue));
        if (cout > 0) {
            elle.fatigue = nombre(elle.fatigue) - cout;
            etapes.push({ type: "fatigue", cible: id, fatigueApres: elle.fatigue });
        }
        const degats = (carte.attaques || []).filter(a => a && !a.isHeal && !a.isShield)
            .reduce((t, a) => t + nombre(a.valeurBrute), 0);
        // `frappeMur` : la case du mur — l'écran y montre le coup (Nico :
        // « créature qui frappe un mur : enlève juste l'émoticône pioche, tu
        // peux intégrer »).
        etapes.push({ type: "message", cible: id, acteur: id, texte: "Frappe le mur", couleur: "#a1887f",
                      frappeMur: { q: nombre(mur.q), r: nombre(mur.r) } });
        etapes.push(...frapperMurs(courant, { [mur.id]: degats }, id, false));
    } else if (!aPortee) {
        // Pourquoi elle n'a rien lancé. Dans la trace, cette ligne vaut de l'or :
        // « tour de 20 millisecondes sans rien faire » restait inexplicable.
        etapes.push({ type: "renonce", acteur: id,
                      raison: dansLeNoir ? "aveuglée : sa cible est dans le noir"
                              : (plan.raison || (moi && moi.aTerre ? "tombée en chemin" : "hors de portée")) });
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

// LE MUR DE TERRE (Géomancien, niveau 5). Plusieurs fois par combat, 20 de
// fatigue par mur. Sur chaque case choisie : celui qui s'y tient est repoussé
// sur une case libre au hasard tout autour (3 dégâts bruts) ; s'il n'y en a
// aucune, il reste là, sur des gravats (pas de mur), et en prend le double.
export const TECHNIQUE_MUR_TERRE = "CLASSE_MUR_DE_TERRE";
function leverMursDeTerre(etat, id, cases, des, plateau) {
    const c = combattant(etat, id);
    const etapes = [];
    if (!c) return etapes;
    const vues = new Set();
    const liste = (cases || []).filter(h => {
        const k = h && cleGravats(h.q, h.r);
        if (!k || vues.has(k)) return false;
        vues.add(k);
        return true;
    }).map(h => ({ q: nombre(h.q), r: nombre(h.r) }));
    etapes.push({ type: "techniqueClasse", acteur: id, idCarte: TECHNIQUE_MUR_TERRE, cible: id,
                  utilisees: [...(c.techniquesUtilisees || [])] });
    c.fatigue = Math.max(0, nombre(c.fatigue) - MUR_TERRE.coutFatigue * liste.length);
    etapes.push({ type: "fatigue", cible: id, fatigueApres: c.fatigue });

    const frapper = (cible, degats) => {
        const r = resoudreCarte(etat, { type: "carte", idLanceur: id, idCarte: TECHNIQUE_MUR_TERRE, critique: false, coutFatigue: 0,
            // Ni à distance (pas de réduction au contact), ni bornée : la roche
            // frappe là où elle surgit. Des dégâts PHYSIQUES (Nico : « écrasé
            // sous la roche, c'est des dégâts physiques, pas bruts ») : l'armure
            // les réduit.
            attaques: [{ nom: "Mur de terre", valeurBrute: degats, typeRes: "Physique",
                         isRanged: false, rangeMax: 99, isHeal: false, isShield: false, cibles: [cible] }],
            alterations: [], jets: { parCible: { [cible]: { esquive: false, etats: {} } } } }, plateau);
        Object.keys(etat).forEach(k => delete etat[k]);
        Object.assign(etat, r.etat);
        etapes.push(...r.etapes.filter(e => e.type !== "carte"));
    };
    liste.forEach((h, i) => {
        const occupant = occupantVivant(etat, h.q, h.r, null);
        let poser = true;
        if (occupant) {
            const libres = voisinsDe(h).filter(v => !vues.has(cleGravats(v.q, v.r)) && !murEn(etat, v.q, v.r)
                                                    && caseLibre(etat, plateau, v.q, v.r, occupant));
            if (libres.length > 0) {
                const vers = libres[Math.min(libres.length - 1, Math.floor(des.fraction() * libres.length))];
                const qui = combattant(etat, occupant);
                const de = { q: qui.q, r: qui.r };
                qui.q = vers.q; qui.r = vers.r;
                etapes.push({ type: "poussee", cible: occupant, acteur: id, de, vers: { q: vers.q, r: vers.r } });
                etapes.push(...traverserZones(etat, occupant, vers, des));
                frapper(occupant, MUR_TERRE.degatsPoussee);
            } else {
                poser = false;
                const g = cleGravats(h.q, h.r);
                etat.gravats = { ...(etat.gravats || {}), [g]: true };
                etapes.push({ type: "mur", gravats: g, acteur: id, q: h.q, r: h.r, bloque: occupant });
                frapper(occupant, MUR_TERRE.degatsPoussee * 2);
            }
        }
        if (poser) {
            const idMur = `MUR_${nombre(etat.version)}_${i}`;
            const etape = { type: "mur", id: idMur, acteur: id,
                            mur: { id: idMur, q: h.q, r: h.r, pv: MUR_TERRE.pv, pvMax: MUR_TERRE.pv, idLanceur: id } };
            APPLICATEURS.mur(etat, etape);
            etapes.push(etape);
        }
    });
    return etapes;
}

// Les murs qu'une carte vise sortent de ses cibles ; leurs coups (les
// attaques qui frappent) sont additionnés, mur par mur.
function separerMurs(etat, brute) {
    const murs = (etat && etat.murs) || {};
    const coups = {};
    if (Object.keys(murs).length === 0) return { action: brute, coups };
    const filtrer = (liste, compter) => (liste || []).map(a => {
        const cibles = (a && a.cibles) || [];
        const surMurs = cibles.filter(x => murs[x]);
        if (surMurs.length === 0) return a;
        if (compter && !a.isHeal && !a.isShield) {
            surMurs.forEach(x => { coups[x] = nombre(coups[x]) + nombre(a.valeurBrute); });
        }
        return { ...a, cibles: cibles.filter(x => !murs[x]) };
    });
    return { action: { ...brute, attaques: filtrer(brute.attaques, true), alterations: filtrer(brute.alterations, false) }, coups };
}

// Une créature frappe le mur de terre qu'elle touche quand il l'enferme (plus
// aucun ennemi joignable à pied) OU quand le contourner coûterait plus de
// DETOUR_MAX_MURS cases (Nico : « au-delà de 6, ils pètent les murs »). Celui
// qui lui barre le plus la route d'abord — le plus près du contact d'un ennemi
// si les murs n'étaient pas là —, puis dans l'ordre des ids.
function murAFrapper(etat, id, carte, plateau) {
    const murs = Object.values((etat && etat.murs) || {});
    const moi = combattant(etat, id);
    if (murs.length === 0 || !moi || moi.aTerre || !carte || !carte.idCarte) return null;
    const touches = murs.filter(m => distance(moi, m) === 1);
    if (touches.length === 0) return null;
    const detour = detourDesMurs(etat, id, plateau);
    const tropLong = !!detour && detour.detour > DETOUR_MAX_MURS;
    if (!tropLong && ennemiAtteignable(etat, id, plateau)) return null;
    const route = (m) => { const d = detour && detour.carteSansMurs.get(`${m.q},${m.r}`); return d === undefined ? Infinity : d; };
    touches.sort((a, b) => (route(a) - route(b)) || String(a.id).localeCompare(String(b.id)));
    return touches[0];
}

// LE TOUR D'UN SERVITEUR : le zombie du Profanateur (niveau 5) ou le
// compagnon du Pisteur (niveau 1). Pas de carte : il marche jusqu'à `pas`
// cases (sans payer de fatigue), puis frappe un ennemi au contact — que la
// cible peut esquiver ou parer ; l'armure réduit la morsure du zombie, pas le
// coup (brut) du compagnon. Puis son tour se clôt.
//
// IL VA OÙ IL PEUT FRAPPER, PAS VERS LE PLUS PROCHE À VOL D'OISEAU. Il
// visait l'ennemi le plus proche en ligne droite et cherchait à s'en
// rapprocher ; si celui-là était cerné, aucune case n'était « plus près » et
// le zombie renonçait sur place — alors qu'un autre ennemi, à deux cases
// aussi, l'attendait à un pas (partie réelle, manche 4). Il compte désormais
// les pas À PIED jusqu'au contact de n'importe quel ennemi (pasJusquAuContact,
// ia_pure.js) : une case d'où il peut frapper d'abord, la plus proche du
// contact sinon.
const MORSURE_ZOMBIE = { pas: ZOMBIE.pas, degats: ZOMBIE.degats, brut: false, idCarte: "ZOMBIE_MORSURE",
                         nom: "Morsure", quoi: "zombie" };
const ATTAQUE_COMPAGNON = { pas: COMPAGNON.pas, degats: COMPAGNON.degats, brut: true, idCarte: "COMPAGNON_ATTAQUE",
                            nom: "Attaque du compagnon", quoi: "compagnon" };
function jouerServiteur(etat, id, plateau, regle) {
    const des = creerDes(etat.graine);
    let courant = etat;
    const etapes = [];
    const moi = combattant(etat, id);
    if (!moi || moi.aTerre) return null;
    const ennemis = (e) => Object.values(e.combattants || {}).filter(c => c && c.camp !== moi.camp && !c.aTerre
                                    && !c.estIllusion && c.q !== null && c.q !== undefined);
    const auContact = (h, e) => ennemis(e).filter(c => distance(h, c) === 1);
    if (ennemis(etat).length > 0 && auContact(moi, etat).length === 0) {
        const aPied = pasJusquAuContact(etat, id, plateau);
        const versContact = (h) => { const d = aPied.get(`${h.q},${h.r}`); return d === undefined ? Infinity : d; };
        // À défaut de chemin connu (borne atteinte, ennemi muré) : la ligne droite.
        const volOiseau = (h) => Math.min(...ennemis(etat).map(c => distance(h, c)));
        const cases = casesAccessibles(etat, id, plateau, regle.pas)
            .filter(h => h.chemin.length > 0 && h.chemin.length <= regle.pas);
        cases.sort((a, b) => (versContact(a) - versContact(b)) || (volOiseau(a) - volOiseau(b)) || (a.ao - b.ao)
                             || (a.chemin.length - b.chemin.length) || (a.q - b.q) || (a.r - b.r));
        const meilleure = cases[0];
        const gagne = meilleure && (versContact(meilleure) < versContact(moi)
            || (versContact(meilleure) === versContact(moi) && volOiseau(meilleure) < volOiseau(moi)));
        if (gagne) {
            const m = resoudreMouvement(courant, { idLanceur: id, chemin: meilleure.chemin }, des, plateau);
            courant = m.etat;
            etapes.push(...m.etapes);
        }
    }
    const apres = combattant(courant, id);
    // Qui mordre : le plus proche s'il est au contact, sinon le plus entamé de
    // ceux qui le sont.
    const proche = apres && !apres.aTerre ? ennemiLePlusProche(courant, id) : null;
    const colles = apres && !apres.aTerre ? auContact(apres, courant)
        .sort((a, b) => (a.pv - b.pv) || String(a.id).localeCompare(String(b.id))) : [];
    const proie = proche && distance(apres, proche) === 1 ? proche : (colles[0] || proche);
    if (proie && distance(apres, proie) === 1) {
        const action = { type: "carte", idLanceur: id, idCarte: regle.idCarte, critique: false, coutFatigue: 0,
                         attaques: [{ nom: regle.nom, valeurBrute: regle.degats, typeRes: "Physique",
                                      ...(regle.brut ? { brut: true } : {}),
                                      isRanged: false, rangeMax: 1, isHeal: false, isShield: false, cibles: [proie.id] }],
                         alterations: [] };
        action.jets = tirerDesCarte(courant, action, id, false, des);
        const r = resoudreCarte(courant, action, plateau);
        courant = clonerEtat(r.etat);
        etapes.push(...r.etapes);
    } else if (apres && !apres.aTerre) {
        etapes.push({ type: "renonce", acteur: id,
                      raison: proie ? `${regle.quoi} : hors de portée` : `${regle.quoi} : plus d'ennemi` });
    }
    courant = clonerEtat(courant);
    const clot = cloturerTour(courant);
    if (clot) etapes.push(...clot.etapes);
    return fabriquerPas(etat, courant, etapes, `${regle.quoi}|${id}|${etat.manche}`, id, des);
}
export function jouerZombie(etat, id, plateau) { return jouerServiteur(etat, id, plateau, MORSURE_ZOMBIE); }
// LE COMPAGNON DU PISTEUR : 3 cases, 6 dégâts bruts au contact.
export function jouerCompagnon(etat, id, plateau) { return jouerServiteur(etat, id, plateau, ATTAQUE_COMPAGNON); }

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
    const { carteDe = null } = contexte || {};
    if (!etat || etat.format !== FORMAT_ETAT) return null;
    // LES MURS DE TERRE ET LEURS GRAVATS s'ajoutent au terrain du plateau.
    const plateau = plateauDeCombat((contexte && contexte.plateau) || null, etat);
    if (etat.phase !== "Resolution") return null;

    const tete = (etat.file || [])[0];
    if (!tete) return null;

    // Une intention qui concerne le combattant en tête, dans l'ordre d'arrivée.
    const enAttente = (intentions || []).filter(i => i && !i.traitee);
    for (const intention of enAttente) {
        const verdict = validerIntention(etat, intention, plateau);
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
    // Un zombie du Profanateur : son propre tour, sans carte.
    if (acteur && acteur.zombie && !acteur.aTerre) {
        const pas = jouerZombie(etat, tete.id, plateau);
        if (pas) return { ...pas, creature: tete.id };
    }
    // Le compagnon du Pisteur : son propre tour, sans carte, lui aussi.
    if (acteur && acteur.compagnon && !acteur.zombie && !acteur.aTerre) {
        const pas = jouerCompagnon(etat, tete.id, plateau);
        if (pas) return { ...pas, creature: tete.id };
    }
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
        if (etat && estLeCerveau(etat, poste)) await depot.battre(maintenant(), poste);
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
