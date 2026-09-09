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

import { clonerEtat, combattant } from './combat_etat.js';
import { esquiveDe, paradeDe, bonusDesEtats, aLEtat } from './moteur_pur.js';

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
            if (etatCase.bloquee || etatCase.supprimee) continue;
            if (occupantVivant(etat, voisin.q, voisin.r, idQuiBouge)) continue;

            const pas = (g.get(cle(courant)) ?? Infinity) + (etatCase.difficile ? 2 : 1);
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
//    • l'équipement ajoute ou retire, sans jamais descendre sous 1 — se déplacer
//      coûte toujours quelque chose ;
//    • sauf les cases offertes par un pas de retraite, qui sont gratuites.

export function coutDuPas(c, numeroCase, difficile, offerte) {
    if (offerte) return 0;

    let cout = numeroCase >= 7 ? 6 : (numeroCase >= 4 ? 4 : 2);
    if (difficile) cout *= 2;
    if (aLEtat(c, "Glacé")) cout *= 2;

    const diviseur = nombre(c.atouts && c.atouts.diviseurDeplacement, 1) || 1;
    if (diviseur > 1) cout = Math.max(1, Math.round(cout / diviseur));

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

    const offertes = nombre(c.mod && c.mod.hexApresAttaque) + bonusDesEtats(c, "hexApresAttaque");
    const budget = Math.max(0, c.fatigue - Math.max(0, reserveCarte));

    const pas = [];
    let cout = 0;
    let de = { q: c.q, r: c.r };

    for (let i = 0; i < chemin.length; i++) {
        const vers = chemin[i];
        const etatCase = carte.etatCase(vers.q, vers.r) || {};
        const prix = coutDuPas(c, pasDejaFaits + i + 1, !!etatCase.difficile, i < offertes);

        if (cout + prix > budget) return { pas, cout, tronque: true };

        pas.push({ de, vers: { q: vers.q, r: vers.r }, cout: prix,
                   difficile: !!etatCase.difficile, offerte: i < offertes });
        cout += prix;
        de = { q: vers.q, r: vers.r };
    }
    return { pas, cout, tronque: false };
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
        if (distance(hex, c) === 1) liste.push(autre);
    }
    return liste;
}

// Le coup lui-même : dix points, fixes. Il ignore l'armure et les compétences —
// c'est un réflexe, pas une technique. Le bouclier l'encaisse en premier, et le
// surplus part dans le vide comme pour n'importe quelle attaque.
export const DEGATS_OPPORTUNITE = 10;

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
             montant: DEGATS_OPPORTUNITE };
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
    if (aLEtat(c, "Immobilisation") || aLEtat(c, "Paralysie")) {
        etapes.push({ type: "echec", acteur: id, raison: "Immobilisation" });
        return { etat: suivant, etapes };
    }

    const plan = planifierTrajet(suivant, id, action.chemin || [], plateau, {
        pasDejaFaits: nombre(action.pasDejaFaits),
        reserveCarte: nombre(action.reserveCarte)
    });

    let contactAvant = new Set(ennemisAuContact(suivant, id, { q: c.q, r: c.r }));

    plan.pas.forEach(pas => {
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
                // Le bouclier d'abord ; le surplus part dans le vide.
                if (c.bouclier > 0) {
                    c.bouclier = Math.max(0, c.bouclier - coup.montant);
                } else {
                    c.pv = Math.max(0, c.pv - coup.montant);
                }
                etapes.push({ type: "opportunite", ...coup, hex: pas.vers,
                              bouclierApres: c.bouclier, pvApres: c.pv });
                etapes.push({ type: "degats", cible: id, acteur: ennemi,
                              montant: coup.montant, opportunite: true,
                              bouclierApres: c.bouclier, pvApres: c.pv });

                if (c.pvMax > 0 && c.pv <= 0 && !c.aTerre) {
                    c.aTerre = true;
                    etapes.push({ type: "chute", cible: id, acteur: ennemi });
                }
            }
        }
        contactAvant = contactApres;
    });

    // Tombé en chemin : la marche s'arrête là où elle s'est arrêtée.
    if (plan.tronque) etapes.push({ type: "trajetEcourte", acteur: id, raison: "énergie" });

    return { etat: suivant, etapes, cout: plan.cout };
}

if (typeof window !== "undefined") {
    window.mouvementPur = {
        distance, voisinsDe, trouverChemin, coutDuPas, planifierTrajet,
        ennemisAuContact, resoudreOpportunite, resoudreMouvement, DEGATS_OPPORTUNITE
    };
}
