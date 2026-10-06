// =========================================================================
//  LE MOUVEMENT PUR — MARCHER SANS RIEN TOUCHER
// =========================================================================
//
//  C'est ici que le combat se jouait le plus mal. Les pions se téléportaient,
//  refaisaient leur trajet à pied une fois arrivés, ou traversaient le plateau
//  d'un bout à l'autre sans raison. Toujours pour le même motif : la POSITION
//  était écrite en base par le poste qui calculait, pendant que les autres
//  écrans en étaient encore au tour d'avant. Deux vérités, et un arbitrage
//  permanent entre elles.
//
//  Ici, un déplacement est une suite de PAS, et chaque pas est une étape du
//  journal. Le pion n'est jamais « quelque part » : il est là où les étapes
//  rejouées l'ont mené. Il ne peut donc plus sauter — au sens propre.
//
//  CE QUE CE FICHIER SAIT FAIRE
//  ----------------------------
//   • trouver un chemin (A*, terrains difficiles pesés, morts traversés) ;
//   • en calculer le coût en énergie, case par case, avec toutes les règles ;
//   • dire à quelle étape précise chaque attaque d'opportunité se déclenche ;
//   • et rendre le tout sous forme d'étapes, une par hexagone.
//
//  CE QU'IL NE FAIT PAS : lire une base, écrire un document, animer un pion,
//  attendre. Le plateau lui-même — les murs, les trous, les terrains difficiles
//  — ne lui appartient pas : c'est une donnée de CARTE, pas de combat, et on la
//  lui passe en argument.
// =========================================================================

import { clonerEtat, combattant, tomber, franchissablePour } from './combat_etat.js';
import { esquiveDe, paradeDe, defPhysiqueDe, bonusDesEtats, aLEtat, traverserZones, protecteurRempart,
         ligneDeVue, caseLibre, destinationPoussee } from './moteur_pur.js';

const nombre = (v, defaut = 0) => {
    const n = parseInt(v);
    return Number.isFinite(n) ? n : defaut;
};

// La distance en hexagones, en coordonnées axiales. C'est la formule de
// mouvement.js — le maximum des trois axes cubiques.
export function distance(a, b) {
    if (!a || !b || a.q === null || b.q === null || a.q === undefined || b.q === undefined) return Infinity;
    const as = -a.q - a.r, bs = -b.q - b.r;
    return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(as - bs));
}

export const VOISINS = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
];

export const voisinsDe = (hex) => VOISINS.map(d => ({ q: hex.q + d.q, r: hex.r + d.r }));

// Qui occupe cette case, parmi les combattants ENCORE DEBOUT ? Un cadavre ne
// barre pas la route : on lui passe dessus.
export function occupantVivant(etat, q, r, sauf) {
    for (const id in etat.combattants) {
        if (id === sauf) continue;
        const c = etat.combattants[id];
        if (!c.aTerre && c.q === q && c.r === r) return id;
    }
    return null;
}

// Le plateau par défaut : une plaine infinie. Le vrai plateau est injecté par
// l'appelant — c'est une donnée de carte, et le noyau n'a pas à la connaître.
const PLAINE = { etatCase: () => ({ bloquee: false, supprimee: false, difficile: false }) };

// =========================================================================
//  1. TROUVER UN CHEMIN
// =========================================================================
//  A*, repris de calculerCheminAStar. Les murs et les trous sont infranchissables,
//  les vivants aussi ; un terrain difficile pèse deux, pour que le trajet
//  préfère le contourner quand ça vaut le coup.
//
//  La borne `maxCases` n'est pas de la prudence excessive : sans elle, une case
//  d'arrivée inatteignable fait explorer le plateau entier, et le jeu se fige.

export function trouverChemin(etat, depart, arrivee, plateau, options) {
    const { maxCases = 2000, idQuiBouge = null } = options || {};
    const carte = plateau || PLAINE;
    if (!depart || !arrivee) return [];
    if (depart.q === arrivee.q && depart.r === arrivee.r) return [];

    const cle = (h) => `${h.q},${h.r}`;
    const venantDe = new Map();
    const g = new Map([[cle(depart), 0]]);
    const f = new Map([[cle(depart), distance(depart, arrivee)]]);
    let ouverts = [depart];
    let explorees = 0;

    const qui = idQuiBouge ? combattant(etat, idQuiBouge) : null;
    while (ouverts.length > 0 && explorees++ < maxCases) {
        ouverts.sort((a, b) => (f.get(cle(a)) ?? Infinity) - (f.get(cle(b)) ?? Infinity));
        const courant = ouverts.shift();

        if (courant.q === arrivee.q && courant.r === arrivee.r) {
            const chemin = [courant];
            let c = courant;
            while (venantDe.has(cle(c))) { c = venantDe.get(cle(c)); chemin.push(c); }
            return chemin.reverse().slice(1);    // la case de départ ne compte pas
        }

        for (const voisin of voisinsDe(courant)) {
            const etatCase = carte.etatCase(voisin.q, voisin.r) || {};
            // Un mur de terre : seul le Géomancien qui l'a levé le traverse —
            // et il ne s'y arrête pas.
            if (!franchissablePour(etatCase, qui)) continue;
            if (etatCase.murTerre && voisin.q === arrivee.q && voisin.r === arrivee.r) continue;
            if (occupantVivant(etat, voisin.q, voisin.r, idQuiBouge)) continue;

            const difficile = etatCase.difficile && !(qui && qui.atouts && qui.atouts.terrainFacile);
            const pas = (g.get(cle(courant)) ?? Infinity) + (difficile ? 2 : 1);
            if (pas < (g.get(cle(voisin)) ?? Infinity)) {
                venantDe.set(cle(voisin), courant);
                g.set(cle(voisin), pas);
                f.set(cle(voisin), pas + distance(voisin, arrivee));
                if (!ouverts.some(h => h.q === voisin.q && h.r === voisin.r)) ouverts.push(voisin);
            }
        }
    }
    return [];
}

// =========================================================================
//  2. CE QUE COÛTE UN PAS
// =========================================================================
//  L'ORDRE DES RÈGLES EST LA RÈGLE DU JEU, et il est repris tel quel :
//
//    • les trois premières cases coûtent 2, les trois suivantes 4, au-delà 6 —
//      c'est ce qui rend une longue course épuisante ;
//    • un terrain difficile double ;
//    • l'état « Glacé » double aussi, et se cumule avec le terrain ;
//    • l'atout du Vargen divise, APRÈS les deux doublements : le prédateur garde
//      son avantage même sur un sol qui coûte double ;
//    • le Saignement ajoute 2 par case, après la division : une plaie ouverte
//      coûte autant au prédateur qu'aux autres ;
//    • l'équipement ajoute ou retire, sans jamais descendre sous 1 — se déplacer
//      coûte toujours quelque chose ;
//    • sauf les cases offertes par un pas de retraite, qui sont gratuites.

// Ce que chaque case coûte en plus à qui saigne (SAIGNEMENT, moteur_pur.js).
export const SURCOUT_SAIGNEMENT = 2;

export function coutDuPas(c, numeroCase, difficile, offerte) {
    if (offerte) return 0;
    // Un zombie du Profanateur, le compagnon du Pisteur : ils marchent sans
    // se fatiguer.
    if (c && (c.zombie || c.compagnon)) return 0;
    // LE VAMPIRE : la première case de chacun de ses tours ne coûte rien,
    // quel que soit le sol. Elle compte quand même dans le barème : la
    // deuxième et la troisième coûtent 2, la quatrième 4.
    if (numeroCase === 1 && c && c.atouts && c.atouts.premierPasGratuit) return 0;

    let cout = numeroCase >= 7 ? 6 : (numeroCase >= 4 ? 4 : 2);
    // Le Géomancien (niveau 5) marche sur le terrain difficile comme sur un
    // sol nu.
    if (difficile && !(c && c.atouts && c.atouts.terrainFacile)) cout *= 2;
    if (aLEtat(c, "Glacé")) cout *= 2;

    const diviseur = nombre(c.atouts && c.atouts.diviseurDeplacement, 1) || 1;
    if (diviseur > 1) cout = Math.max(1, Math.round(cout / diviseur));
    if (aLEtat(c, "Saignement")) cout += SURCOUT_SAIGNEMENT;

    const modEquip = nombre(c.mod && c.mod.coutDeplacement) + bonusDesEtats(c, "coutDeplacement");
    if (modEquip) cout = Math.max(1, cout + modEquip);

    return cout;
}

// Le trajet complet, chiffré case par case, tronqué quand l'énergie manque. On
// rend TOUJOURS ce qui est payable : un joueur qui vise trop loin marche aussi
// loin qu'il peut, il ne reste pas planté.
export function planifierTrajet(etat, id, chemin, plateau, options) {
    const { pasDejaFaits = 0, reserveCarte = 0 } = options || {};
    const c = combattant(etat, id);
    const carte = plateau || PLAINE;
    if (!c) return { pas: [], cout: 0, tronque: false };

    // Les cases offertes après une attaque ne sont JAMAIS permanentes (voir
    // combat_etat.js) : elles viennent uniquement de l'état "Repli", posé pour
    // un tour par resoudreCarte quand une arme le prévoit et qu'on vient de
    // frapper.
    const offertes = bonusDesEtats(c, "hexApresAttaque");
    const budget = Math.max(0, c.fatigue - Math.max(0, reserveCarte));

    const pas = [];
    let cout = 0;
    let de = { q: c.q, r: c.r };

    for (let i = 0; i < chemin.length; i++) {
        const vers = chemin[i];
        const etatCase = carte.etatCase(vers.q, vers.r) || {};
        const prix = coutDuPas(c, pasDejaFaits + i + 1, !!etatCase.difficile, i < offertes);

        if (cout + prix > budget) return sansFinirSurUnMur({ pas, cout, tronque: true }, carte);

        pas.push({ de, vers: { q: vers.q, r: vers.r }, cout: prix,
                   difficile: !!etatCase.difficile, offerte: i < offertes });
        cout += prix;
        de = { q: vers.q, r: vers.r };
    }
    return sansFinirSurUnMur({ pas, cout, tronque: false }, carte);
}

// Le Géomancien traverse ses murs, il ne s'arrête jamais dessus : une marche
// tronquée au milieu d'un mur recule jusqu'à la dernière case libre.
function sansFinirSurUnMur(plan, carte) {
    while (plan.pas.length > 0) {
        const fin = plan.pas[plan.pas.length - 1].vers;
        const dessus = (carte.etatCase ? carte.etatCase(fin.q, fin.r) : null) || {};
        if (!dessus.murTerre) break;
        plan.cout -= plan.pas.pop().cout;
        plan.tronque = true;
    }
    return plan;
}

// =========================================================================
//  3. LES ATTAQUES D'OPPORTUNITÉ
// =========================================================================
//  Qui frappe, et surtout À QUELLE ÉTAPE. On suit le contact ennemi case par
//  case le long du trajet : chaque ennemi QUITTÉ porte son coup, à l'hexagone
//  exact où on lui échappe. C'est ce qui permet à l'animation de marquer une
//  vraie pause au bon endroit, au lieu de tout jouer une fois arrivé.
//
//  Une illusion ne frappe pas : elle n'a pas d'arme. Un combattant à terre non
//  plus, et un allié encore moins.

// LA ZONE DE MENACE d'un combattant : une case, deux pour une Sentinelle
// (niveau 5, `allongeOpportunite`) qui tient une arme à allonge (la lance
// lourde). C'est la zone qu'on quitte (attaque d'opportunité) ou dans laquelle
// on entre (Défenseur).
export function porteeDeMenace(c) {
    return (c && c.atouts && c.atouts.allongeOpportunite && nombre(c.mod && c.mod.allonge) > 0) ? 2 : 1;
}

// Les ennemis dont la zone de menace couvre `hex` (le contact, ou deux cases
// pour la Sentinelle à la lance).
export function ennemisAuContact(etat, id, hex) {
    const moi = combattant(etat, id);
    if (!moi || !hex || hex.q === null) return [];
    const liste = [];
    for (const autre in etat.combattants) {
        if (autre === id) continue;
        const c = etat.combattants[autre];
        if (c.aTerre || c.estIllusion) continue;
        if (c.camp === moi.camp) continue;
        if (c.q === null || c.q === undefined) continue;
        const d = distance(hex, c);
        if (d >= 1 && d <= porteeDeMenace(c)) liste.push(autre);
    }
    return liste;
}

// Le coup lui-même : HUIT DÉGÂTS PHYSIQUES FIXES (règle de Nico). Fixes : ni
// l'arme de l'attaquant ni ses compétences n'y ajoutent rien — c'est un
// réflexe, pas une technique. Physiques : l'ARMURE de la cible les réduit,
// exactement comme pour un coup physique ordinaire (résistance physique en %,
// arrondie — voir chaineDeDegats, moteur_pur.js). Le bouclier encaisse ce qui
// reste en premier, et le surplus part dans le vide.
export const DEGATS_OPPORTUNITE = 8;
const reduireParArmure = (cible, brut) => {
    const reduction = Math.min(1, Math.max(0, defPhysiqueDe(cible)) / 100);
    return Math.max(0, Math.round(brut * (1 - reduction)));
};
// La Sentinelle frappe plus fort (+6, `degatsOpportunite`), avant l'armure.
export const degatsOpportuniteBruts = (attaquant) =>
    DEGATS_OPPORTUNITE + nombre(attaquant && attaquant.atouts && attaquant.atouts.degatsOpportunite);
export const degatsOpportuniteContre = (cible, attaquant) => reduireParArmure(cible, degatsOpportuniteBruts(attaquant));

// LE COUP D'OPPORTUNITÉ QUI PORTE : le bouclier d'abord (le surplus part dans
// le vide), la vie ensuite, la chute éventuelle. Une seule écriture pour les
// trois marches (déplacement, Peur, Repli), et le REMPART de l'Hoplite : si la
// cible en a un actif, les 8 dégâts bruts sont partagés en deux attaques
// indépendantes, chacun avec sa propre armure (moteur_pur.js, protecteurRempart).
export function infligerOpportunite(etat, idCible, ennemi, coup, hex) {
    const etapes = [];
    const cible = combattant(etat, idCible);
    if (!cible) return etapes;
    const appliquer = (id, c, montant) => {
        if (c.bouclier > 0) c.bouclier = Math.max(0, c.bouclier - montant);
        else c.pv = Math.max(0, c.pv - montant);
        etapes.push({ type: "degats", cible: id, acteur: ennemi, montant, opportunite: true,
                      bouclierApres: c.bouclier, pvApres: c.pv });
        etapes.push(...tomber(etat, id, ennemi));
    };
    const protecteur = protecteurRempart(etat, cible);
    if (protecteur) {
        const brut = nombre(coup.brut, DEGATS_OPPORTUNITE);
        const partHoplite = Math.ceil(brut / 2);
        etapes.push({ type: "opportunite", ...coup, hex });
        etapes.push({ type: "message", cible: protecteur.id, acteur: ennemi, texte: "🛡️ Rempart", couleur: "#e8c46a" });
        appliquer(idCible, cible, reduireParArmure(cible, brut - partHoplite));
        appliquer(protecteur.id, protecteur, reduireParArmure(protecteur, partHoplite));
        return etapes;
    }
    if (cible.bouclier > 0) cible.bouclier = Math.max(0, cible.bouclier - coup.montant);
    else cible.pv = Math.max(0, cible.pv - coup.montant);
    etapes.push({ type: "opportunite", ...coup, hex, bouclierApres: cible.bouclier, pvApres: cible.pv });
    etapes.push({ type: "degats", cible: idCible, acteur: ennemi, montant: coup.montant, opportunite: true,
                  bouclierApres: cible.bouclier, pvApres: cible.pv });
    etapes.push(...tomber(etat, idCible, ennemi));
    return etapes;
}

export function resoudreOpportunite(etat, idAttaquant, idCible, des) {
    const a = combattant(etat, idAttaquant);
    const cible = combattant(etat, idCible);
    if (!a || !cible || a.aTerre || cible.aTerre || a.estIllusion) return null;

    // L'atout du Vargen : une chance de se dérober AVANT le jet de défense.
    // C'est une esquive supplémentaire, pas un remplacement.
    const derobade = nombre(cible.atouts && cible.atouts.esquiveOpportunite);
    if (derobade > 0 && des.d100() <= derobade) {
        return { attaquant: idAttaquant, cible: idCible, evitee: true, mot: "Dérobade 🐾", montant: 0 };
    }

    const esquive = esquiveDe(cible), parade = paradeDe(cible);
    const evitee = des.d100() <= Math.max(esquive, parade);
    const mot = parade > esquive ? "Paré 🛡️" : "Esquivé 💨";
    if (evitee) return { attaquant: idAttaquant, cible: idCible, evitee: true, mot, montant: 0 };

    return { attaquant: idAttaquant, cible: idCible, evitee: false, mot: "",
             brut: degatsOpportuniteBruts(a), montant: degatsOpportuniteContre(cible, a) };
}

// LE DÉFENSEUR (Sentinelle, niveau 5) : l'ennemi qui ENTRE de lui-même dans sa
// zone de menace (marche, Bond, fuite de la Peur) lui donne 30 % de chance de
// frapper — puis l'attaque d'opportunité se joue comme toute autre (esquive
// ou parade). Un seul jet par Sentinelle et par déplacement (`tentes`), même
// s'il sort et rentre. `exempte` ne frappe pas (le lanceur d'une Peur).
// Mute l'état et rend les étapes.
export function declencherDefenseurs(etat, idMobile, contactAvant, contactApres, tentes, des, hex, exempte) {
    const etapes = [];
    for (const ennemi of contactApres) {
        if (contactAvant.has(ennemi) || tentes.has(ennemi) || ennemi === exempte) continue;
        const a = combattant(etat, ennemi);
        const chance = nombre(a && a.atouts && a.atouts.defenseur);
        if (!a || chance <= 0 || a.aTerre || a.estIllusion) continue;
        const mobile = combattant(etat, idMobile);
        if (!mobile || mobile.aTerre) break;
        tentes.add(ennemi);
        if (des.d100() > chance) continue;
        const coup = resoudreOpportunite(etat, ennemi, idMobile, des);
        if (!coup) continue;
        etapes.push({ type: "message", cible: ennemi, acteur: ennemi, texte: "🛡️ Défenseur", couleur: "#e8c46a" });
        if (coup.evitee) etapes.push({ type: "opportunite", ...coup, hex, defenseur: true });
        else etapes.push(...infligerOpportunite(etat, idMobile, ennemi, { ...coup, defenseur: true }, hex));
    }
    return etapes;
}

// LA FUREUR DE LA SENTINELLE (niveau 10) : chaque ENNEMI qui lui est adjacent
// reçoit une attaque d'opportunité (esquive ou parade possible, +6 compris),
// puis ceux qui tiennent encore debout sont repoussés d'une case — un mur ou
// un pion arrête la poussée, le coup a déjà porté. Mute l'état, rend les
// étapes (poussées comprises, et le feu où l'on atterrit).
export function fureurDeLaSentinelle(etat, idLanceur, des, plateau) {
    const etapes = [];
    const moi = combattant(etat, idLanceur);
    if (!moi || moi.aTerre) return etapes;
    const cibles = Object.keys(etat.combattants || {}).sort().filter(id => {
        const x = etat.combattants[id];
        return id !== idLanceur && x && !x.aTerre && !x.estIllusion
            && (x.camp || "Allié") !== (moi.camp || "Allié") && distance(moi, x) === 1;
    });
    cibles.forEach(id => {
        const x = combattant(etat, id);
        const coup = resoudreOpportunite(etat, idLanceur, id, des);
        if (!coup) return;
        const hex = { q: x.q, r: x.r };
        if (coup.evitee) etapes.push({ type: "opportunite", ...coup, hex });
        else etapes.push(...infligerOpportunite(etat, id, idLanceur, coup, hex));
    });
    cibles.forEach(id => {
        const x = combattant(etat, id);
        if (!x || x.aTerre) return;
        const de = { q: nombre(x.q), r: nombre(x.r) };
        const vers = destinationPoussee(moi, x, 1, (q, r) => caseLibre(etat, plateau, q, r, id));
        if (!vers) {
            etapes.push({ type: "message", cible: id, acteur: idLanceur, texte: "Poussée bloquée" });
            return;
        }
        x.q = vers.q;
        x.r = vers.r;
        etapes.push({ type: "poussee", cible: id, acteur: idLanceur, de, vers });
        etapes.push(...traverserZones(etat, id, vers, des));
    });
    return etapes;
}

// =========================================================================
//  4. RÉSOUDRE UN DÉPLACEMENT
// =========================================================================
//  Le point d'entrée. Un pas = une étape, et une opportunité s'intercale
//  exactement là où elle se produit. Le journal raconte donc la marche dans
//  l'ordre où elle a eu lieu, et chaque écran la rejoue au même rythme.

export function resoudreMouvement(etat, action, des, plateau) {
    const suivant = clonerEtat(etat);
    const etapes = [];
    const id = action.idLanceur || action.id;
    const c = combattant(suivant, id);
    if (!c) return { etat: suivant, etapes };

    // Immobilisé : on ne bouge pas d'un pouce, et on le dit.
    if (aLEtat(c, "Immobilisation")) {
        etapes.push({ type: "echec", acteur: id, raison: "Immobilisation" });
        return { etat: suivant, etapes };
    }

    const plan = planifierTrajet(suivant, id, action.chemin || [], plateau, {
        pasDejaFaits: nombre(action.pasDejaFaits),
        reserveCarte: nombre(action.reserveCarte)
    });

    let contactAvant = new Set(ennemisAuContact(suivant, id, { q: c.q, r: c.r }));
    const defenseursTentes = new Set();

    // UN COMBATTANT QUI TOMBE EN CHEMIN S'ARRÊTE LÀ. La marche se déroulait
    // jusqu'au bout quoi qu'il arrive : un pion mis à terre par une attaque
    // d'opportunité continuait sa route, et finissait son trajet couché. Une
    // boucle qu'on peut interrompre, plutôt qu'un forEach qu'on ne peut pas.
    for (const pas of plan.pas) {
        c.q = pas.vers.q;
        c.r = pas.vers.r;
        c.fatigue = Math.max(0, c.fatigue - pas.cout);
        etapes.push({ type: "pas", acteur: id, de: pas.de, vers: pas.vers,
                      cout: pas.cout, fatigueApres: c.fatigue });

        // Chaque ennemi QUITTÉ frappe, ici, à cet hexagone précis.
        const contactApres = new Set(ennemisAuContact(suivant, id, pas.vers));
        for (const ennemi of contactAvant) {
            if (contactApres.has(ennemi)) continue;
            const coup = resoudreOpportunite(suivant, ennemi, id, des);
            if (!coup) continue;

            if (coup.evitee) {
                etapes.push({ type: "opportunite", ...coup, hex: pas.vers });
            } else {
                etapes.push(...infligerOpportunite(suivant, id, ennemi, coup, pas.vers));
            }
        }
        // Une Sentinelle dans la zone de laquelle on vient d'entrer.
        etapes.push(...declencherDefenseurs(suivant, id, contactAvant, contactApres, defenseursTentes, des, pas.vers));
        contactAvant = contactApres;

        // LA CASE OÙ L'ON POSE LE PIED PEUT BRÛLER. Chaque case franchie
        // déclenche sa propre résolution — « s'il continue dans la zone, ça
        // continue » —, après les opportunités de ce pas, comme dans l'ancien
        // moteur. Les dés ne sont consommés que si une zone recouvre vraiment
        // la case : une marche en terrain nu tire exactement les mêmes dés
        // qu'avant, et les journaux déjà écrits se rejouent à l'identique.
        etapes.push(...traverserZones(suivant, id, pas.vers, des));

        if (c.aTerre) {
            etapes.push({ type: "trajetEcourte", acteur: id, raison: "à terre" });
            break;
        }
    }

    // Tombé en chemin : la marche s'arrête là où elle s'est arrêtée.
    if (plan.tronque) etapes.push({ type: "trajetEcourte", acteur: id, raison: "énergie" });

    return { etat: suivant, etapes, cout: plan.cout };
}

// =========================================================================
//  5. LE BOND
// =========================================================================
//  Un saut par-dessus le terrain : on ne marche pas, on survole. Ni fatigue, ni
//  attaque d'opportunité — c'est ce qui le distingue d'une course.
//
//  CE QUI ÉTAIT CASSÉ. resoudreBondInteractif faisait tout dans le navigateur
//  du joueur : il déplaçait le pion dans TOKENS_VTT_DATA et écrivait
//  directement dans Firestore, depuis la phase de ciblage — partagée par les
//  deux régimes, donc y compris sous le cerveau. Deux écrivains pour une même
//  vérité : le saut pouvait être effacé par la publication suivante de l'état,
//  ou pire, rester sur un écran et pas sur les autres.
//
//  Le choix de la case, lui, reste à l'écran : c'est du ciblage, un seul joueur
//  clique, exactement comme on désigne une cible. Ce qui remonte au cerveau
//  n'est pas un résultat, c'est une intention : « je saute là ».

// Les cases où l'on peut atterrir. UNE SEULE DÉFINITION, lue par l'écran qui
// les éclaire ET par le cerveau qui valide : si les deux divergeaient d'une
// case, le joueur pourrait cliquer un hexagone que le cerveau refuse, et sa
// carte serait consommée pour rien.
export function casesDeBond(etat, id, portee, plateau) {
    const c = combattant(etat, id);
    if (!c) return [];
    const carte = plateau || PLAINE;
    const cases = [];
    const p = Math.max(0, nombre(portee, 1));

    for (let dq = -p; dq <= p; dq++) {
        for (let dr = Math.max(-p, -dq - p); dr <= Math.min(p, -dq + p); dr++) {
            if (dq === 0 && dr === 0) continue;
            const q = c.q + dq, r = c.r + dr;
            const dessus = (carte.etatCase ? carte.etatCase(q, r) : null) || {};
            if (dessus.bloquee || dessus.supprimee) continue;
            if (occupantVivant(etat, q, r, id)) continue;
            // On survole les trous et les gravats, jamais un mur.
            if (!ligneDeVue(carte, c, { q, r })) continue;
            cases.push({ q, r });
        }
    }
    return cases;
}

export function resoudreBond(etat, action, des, plateau) {
    const suivant = clonerEtat(etat);
    const etapes = [];
    const id = action.idLanceur || action.id;
    const c = combattant(suivant, id);
    if (!c) return { etat: suivant, etapes };

    // L'Immobilisation cloue sur place tout mouvement VOLONTAIRE. Les
    // déplacements subis — poussée, traction, peur — passent outre : on ne
    // choisit pas de se faire pousser.
    if (aLEtat(c, "Immobilisation")) {
        etapes.push({ type: "echec", acteur: id, raison: "Immobilisation" });
        return { etat: suivant, etapes };
    }

    const vers = action.vers || {};
    const permises = casesDeBond(suivant, id, action.portee, plateau);
    if (!permises.some(h => h.q === vers.q && h.r === vers.r)) {
        etapes.push({ type: "message", cible: id, acteur: id, texte: "Bond impossible" });
        return { etat: suivant, etapes };
    }

    const de = { q: c.q, r: c.r };
    const contactAvant = new Set(ennemisAuContact(suivant, id, de));
    c.q = vers.q;
    c.r = vers.r;
    etapes.push({ type: "bond", cible: id, acteur: id, de, vers: { q: vers.q, r: vers.r } });
    // Atterrir dans la zone d'une Sentinelle : son Défenseur peut frapper.
    etapes.push(...declencherDefenseurs(suivant, id, contactAvant, new Set(ennemisAuContact(suivant, id, vers)),
                                        new Set(), des, { q: vers.q, r: vers.r }));

    // Atterrir dans le feu brûle autant que d'y entrer à pied.
    etapes.push(...traverserZones(suivant, id, vers, des));

    return { etat: suivant, etapes };
}

// =========================================================================
//  6. LA PEUR
// =========================================================================
//  Fait fuir la cible sur 4 cases : à chaque case, on ne garde que les
//  directions qui l'éloignent VRAIMENT du lanceur (jamais une ligne droite
//  imposée comme la Poussée), et on en tire une au hasard parmi elles. Mêmes
//  règles de blocage que Poussée/Traction (mur, case supprimée, case
//  occupée) : si toutes les directions valides sont bloquées, la fuite
//  s'arrête net, avant ses 4 cases s'il le faut. Déclenche une attaque
//  d'opportunité par ennemi quitté en chemin, SAUF celle du lanceur — c'est
//  lui qui fait peur, il n'en profite pas d'un coup en plus. Contrairement à
//  Poussée/Traction, ce déplacement forcé coûte de la fatigue à la cible
//  (coût de base d'un déplacement normal, 2 par case) : une vraie fuite
//  panique épuise.
//
//  Portage de declencherPeurCible (moteur_effets.js), avec une différence
//  voulue : cette fonction consomme le dé du CERVEAU (des.fraction, comme
//  resoudreOpportunite consomme déjà des.d100 pour les attaques quittées en
//  chemin), là où l'ancien moteur tirait Math.random() dans le navigateur du
//  lanceur — un résultat que les autres postes devaient croire sur parole.
//
//  POURQUOI CETTE FONCTION VIT ICI ET PAS DANS resoudreCarte
//  (moteur_pur.js). resoudreCarte ne tient plus aucun dé : tirerDesCarte a
//  déjà tiré tout ce qu'une carte doit tirer, en une seule fois, avant que
//  les effets ne s'appliquent. Fuir a besoin d'un jet PAR CASE, dont le
//  nombre dépend du chemin lui-même — impossible à précalculer sans rejouer
//  toute la géométrie deux fois. Le cerveau, qui a le dé en main au moment
//  d'exécuter une carte (voir cerveau_combat.js), la résout donc juste
//  après resoudreCarte, exactement comme il tranche déjà les attaques
//  d'opportunité d'une marche normale.
//
//  Mute directement l'état qu'on lui passe (comme traverserZones) et rend
//  les étapes à publier.
// `options.exempte` : qui ne frappe PAS le fuyard en opportunité (par défaut
// le lanceur de la Peur, qui n'en profite pas d'un coup en plus). La fuite
// d'un confus (règle de Nico) n'exempte personne : `exempte: null`.
export function resoudrePeur(etat, idLanceur, idCible, des, plateau, options) {
    const exempte = (options && "exempte" in options) ? options.exempte : idLanceur;
    const etapes = [];
    const cible = combattant(etat, idCible);
    if (!cible || cible.aTerre) return etapes;

    const depart = { q: nombre(cible.q), r: nombre(cible.r) };
    const lanceur = combattant(etat, idLanceur) || depart;
    const dejaVisite = new Set([`${depart.q},${depart.r}`]);
    let hexActuel = depart;
    const chemin = [];

    for (let i = 0; i < 4; i++) {
        const distActuelle = distance(lanceur, hexActuel);
        const libres = voisinsDe(hexActuel).filter(c =>
            caseLibre(etat, plateau, c.q, c.r, idCible) && !dejaVisite.has(`${c.q},${c.r}`));
        // On préfère les cases qui éloignent vraiment du lanceur ; si elles
        // sont toutes bloquées, on cherche un autre chemin plutôt que de
        // s'arrêter net contre l'obstacle — la seule contrainte est de ne
        // jamais repasser sur une case déjà prise pendant cette fuite.
        let candidats = libres.filter(c => distance(lanceur, c) > distActuelle);
        if (candidats.length === 0) candidats = libres;
        if (candidats.length === 0) break;  // Vraiment coincée.

        hexActuel = candidats[Math.min(candidats.length - 1, Math.floor(des.fraction() * candidats.length))];
        dejaVisite.add(`${hexActuel.q},${hexActuel.r}`);
        chemin.push(hexActuel);
    }

    if (chemin.length === 0) {
        etapes.push({ type: "message", cible: idCible, acteur: idLanceur, texte: "Peur (bloquée)" });
        return etapes;
    }

    // Attaques d'opportunité déclenchées en fuyant, case par case (même
    // principe qu'un déplacement volontaire), sauf de la part du lanceur.
    let contactAvant = new Set(ennemisAuContact(etat, idCible, depart).filter(id => id !== exempte));
    const defenseursTentes = new Set();
    for (const pas of chemin) {
        const de = { q: cible.q, r: cible.r };
        cible.q = pas.q;
        cible.r = pas.r;
        cible.fatigue = Math.max(0, nombre(cible.fatigue) - 2);
        etapes.push({ type: "pas", acteur: idCible, de, vers: pas, cout: 2, fatigueApres: cible.fatigue });

        const contactApres = new Set(ennemisAuContact(etat, idCible, pas).filter(id => id !== exempte));
        for (const ennemi of contactAvant) {
            if (contactApres.has(ennemi)) continue;
            const coup = resoudreOpportunite(etat, ennemi, idCible, des);
            if (!coup) continue;

            if (coup.evitee) {
                etapes.push({ type: "opportunite", ...coup, hex: pas });
            } else {
                etapes.push(...infligerOpportunite(etat, idCible, ennemi, coup, pas));
            }
        }
        etapes.push(...declencherDefenseurs(etat, idCible, contactAvant, contactApres, defenseursTentes, des, pas, exempte));
        contactAvant = contactApres;

        if (cible.aTerre) break;  // Tombée en chemin : la fuite s'arrête là.

        // Une fuite paniquée traverse une nappe au sol comme n'importe quel
        // déplacement.
        etapes.push(...traverserZones(etat, idCible, pas, des));
        if (cible.aTerre) break;  // Tombée dans le feu : pareil.
    }

    return etapes;
}

// =========================================================================
//  7. LE REPLI
// =========================================================================
//  « Se déplace de 3 cases après avoir attaqué, et évite TOUTES les attaques
//  d'opportunité » (règle de Nico : il n'y a plus de jet à 60 %). C'est une
//  MARCHE, pas un saut : on ne passe ni à travers un mur, ni à travers un
//  vivant ; chaque ennemi quitté voit le repli lui filer sous le nez. La
//  marche est offerte : la carte l'a déjà payée.
//
//  La case d'arrivée est choisie à l'écran (c'est du ciblage) ; le CHEMIN, lui,
//  est recalculé ici depuis la position du lanceur au moment du repli — après
//  l'attaque —, pour qu'aucun poste ne puisse envoyer un trajet de fantaisie.

export const PORTEE_REPLI = 3;
// Gardé pour qui le lit encore : le repli évite désormais TOUT (100 %).
export const CHANCE_REPLI_OPPORTUNITE = 100;

// Les cases atteignables en `portee` pas de marche, chacune avec le plus court
// chemin qui y mène. UNE SEULE DÉFINITION, lue par l'écran qui les éclaire, par
// l'IA des créatures et par le cerveau qui valide.
export function cheminsDeRepli(etat, id, portee, plateau, depart) {
    const c = combattant(etat, id);
    const origine = depart || (c ? { q: nombre(c.q), r: nombre(c.r) } : null);
    if (!c || !origine) return new Map();
    const carte = plateau || PLAINE;
    const max = Math.max(0, Math.round(nombre(portee, PORTEE_REPLI)));
    const cle = (h) => `${h.q},${h.r}`;
    const chemins = new Map();
    const vus = new Set([cle(origine)]);
    let front = [{ hex: origine, chemin: [] }];
    for (let pas = 1; pas <= max; pas++) {
        const suivant = [];
        for (const { hex, chemin } of front) {
            for (const v of voisinsDe(hex)) {
                if (vus.has(cle(v))) continue;
                vus.add(cle(v));
                const dessus = (carte.etatCase ? carte.etatCase(v.q, v.r) : null) || {};
                if (dessus.bloquee || dessus.supprimee) continue;
                if (occupantVivant(etat, v.q, v.r, id)) continue;
                const route = [...chemin, { q: v.q, r: v.r }];
                chemins.set(cle(v), route);
                suivant.push({ hex: v, chemin: route });
            }
        }
        front = suivant;
    }
    return chemins;
}

// Mute l'état qu'on lui passe (comme resoudrePeur) et rend les étapes.
export function resoudreRepli(etat, idLanceur, vers, des, plateau, options) {
    const { portee = PORTEE_REPLI } = options || {};
    const etapes = [];
    const c = combattant(etat, idLanceur);
    if (!c || c.aTerre || !vers || vers.q === undefined || vers.r === undefined) return etapes;
    if (aLEtat(c, "Immobilisation")) {
        etapes.push({ type: "echec", acteur: idLanceur, raison: "Immobilisation" });
        return etapes;
    }
    const depart = { q: nombre(c.q), r: nombre(c.r) };
    if (depart.q === nombre(vers.q) && depart.r === nombre(vers.r)) return etapes;   // on reste

    const chemin = cheminsDeRepli(etat, idLanceur, portee, plateau).get(`${nombre(vers.q)},${nombre(vers.r)}`);
    if (!chemin || !chemin.length) {
        etapes.push({ type: "message", cible: idLanceur, acteur: idLanceur, texte: "Repli (bloqué)" });
        return etapes;
    }

    etapes.push({ type: "repli", acteur: idLanceur, de: depart, vers: chemin[chemin.length - 1],
                  chemin: chemin.map(h => ({ q: h.q, r: h.r })) });

    let contactAvant = new Set(ennemisAuContact(etat, idLanceur, depart));
    for (const pas of chemin) {
        const de = { q: c.q, r: c.r };
        c.q = pas.q;
        c.r = pas.r;
        etapes.push({ type: "pas", acteur: idLanceur, de, vers: { q: pas.q, r: pas.r },
                      cout: 0, fatigueApres: c.fatigue, repli: true });

        const contactApres = new Set(ennemisAuContact(etat, idLanceur, pas));
        for (const ennemi of contactAvant) {
            if (contactApres.has(ennemi)) continue;
            const a = combattant(etat, ennemi);
            if (!a || a.aTerre || a.estIllusion) continue;
            // LE REPLI SE DÉROBE TOUJOURS : aucun dé, aucun coup ne part.
            etapes.push({ type: "opportunite", attaquant: ennemi, cible: idLanceur, evitee: true,
                          mot: "Repli 💨", montant: 0, hex: pas });
        }
        // Le Défenseur d'une Sentinelle dans la zone de laquelle il entre : le
        // Repli s'en dérobe aussi, sans dé.
        for (const ennemi of contactApres) {
            if (contactAvant.has(ennemi)) continue;
            const a = combattant(etat, ennemi);
            if (!a || a.aTerre || a.estIllusion || !(nombre(a.atouts && a.atouts.defenseur) > 0)) continue;
            etapes.push({ type: "opportunite", attaquant: ennemi, cible: idLanceur, evitee: true,
                          mot: "Repli 💨", montant: 0, hex: pas, defenseur: true });
        }
        contactAvant = contactApres;
        if (c.aTerre) { etapes.push({ type: "trajetEcourte", acteur: idLanceur, raison: "à terre" }); break; }

        etapes.push(...traverserZones(etat, idLanceur, pas, des));
        if (c.aTerre) break;
    }
    return etapes;
}

if (typeof window !== "undefined") {
    window.mouvementPur = {
        distance, voisinsDe, trouverChemin, coutDuPas, planifierTrajet,
        ennemisAuContact, resoudreOpportunite, resoudreMouvement,
        casesDeBond, resoudreBond, resoudrePeur, DEGATS_OPPORTUNITE, degatsOpportuniteContre,
        cheminsDeRepli, resoudreRepli, PORTEE_REPLI, CHANCE_REPLI_OPPORTUNITE
    };
}
