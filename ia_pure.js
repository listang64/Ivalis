// =========================================================================
//  L'IA DES CRÉATURES, EN FONCTION PURE
// =========================================================================
//
//  Faire jouer un monstre, c'est répondre à deux questions : QUI viser, et OÙ
//  se mettre. Rien de plus. Le reste — se déplacer, lancer la carte, encaisser —
//  est du ressort du moteur, qui est déjà pur.
//
//  Dans l'ancien code, ces deux réponses se prenaient en lisant PERSOS_PARTIE,
//  TOKENS_VTT_DATA, ZONES_PERSISTANTES et PLATEAU_VTT — quatre variables
//  globales, chacune pouvant être en retard d'une notification. Deux postes qui
//  faisaient jouer la même créature au même instant n'avaient donc PAS le même
//  plateau sous les yeux, et prenaient deux décisions différentes : c'est
//  exactement ce qu'on a vu dans la trace, une créature partie de deux cases
//  distinctes vers deux cibles distinctes.
//
//  Ici, la décision ne dépend que de l'état qu'on lui passe et de la graine.
//  Même état, même graine, même décision — sur les trois appareils.
//
//  LE HASARD FAIT PARTIE DE LA RÈGLE. Sans lui, une même personnalité dans une
//  même situation rejouerait éternellement le même coup, et les combats
//  deviendraient mécaniques. Il vient donc des dés à graine, comme tout le
//  reste : imprévisible pour le joueur, reproductible pour le banc.
// =========================================================================

import { combattant } from './combat_etat.js';
import { aLEtat } from './moteur_pur.js';
import { distance, voisinsDe, occupantVivant, coutDuPas } from './mouvement_pur.js';

const nombre = (v, defaut = 0) => {
    const n = parseInt(v);
    return Number.isFinite(n) ? n : defaut;
};

// =========================================================================
//  1. LES CARACTÈRES
// =========================================================================
//  Cinq façons d'aborder un combat, et cinq seulement. Chaque trait est un
//  poids entre 0 et 1 qui multiplie une considération : la peur des zones, le
//  goût du sang, l'envie de garder ses distances. C'est ce qui fait qu'un
//  archer prudent et une brute ne jouent pas le même tour depuis la même case.

export const PERSONNALITES = {
    // Fonce, encaisse, ignore le danger du terrain.
    brutal:       { peurZones: 0.0, eviteAO: 0.0, cibleFaible: 0.3, tientDistance: 0.0, contourne: 0.2 },
    // Cherche la mise à mort : va au plus bas en points de vie, quoi qu'il en coûte.
    sanguinaire:  { peurZones: 0.2, eviteAO: 0.1, cibleFaible: 1.0, tientDistance: 0.0, contourne: 0.3 },
    // Reste à distance, évite les zones et les attaques d'opportunité.
    prudent:      { peurZones: 1.0, eviteAO: 0.9, cibleFaible: 0.4, tientDistance: 0.9, contourne: 0.7 },
    // Contourne, se place bien, ne s'agglutine pas avec ses congénères.
    tacticien:    { peurZones: 0.8, eviteAO: 0.6, cibleFaible: 0.6, tientDistance: 0.5, contourne: 1.0 },
    // Frappe le maillon faible mais ne se met pas en danger pour autant.
    opportuniste: { peurZones: 0.6, eviteAO: 0.8, cibleFaible: 0.9, tientDistance: 0.4, contourne: 0.6 }
};

export const traitsDe = (c) => PERSONNALITES[c && c.personnalite] || PERSONNALITES.brutal;

// La part d'imprévu, tirée des dés de l'état : centrée sur zéro, d'amplitude
// choisie. C'est elle qui empêche deux tours identiques de se ressembler.
const bruit = (des, ampleur) => (des.fraction() - 0.5) * 2 * ampleur;

// =========================================================================
//  2. LIRE LE TERRAIN
// =========================================================================

// Ce qu'une case coûte en risque, à cause des zones qui y traînent. Les dégâts
// donnent la mesure ; une zone qui ne pose qu'un état reste franchement
// repoussante, même sans faire mal.
export function dangerDeLaCase(etat, q, r) {
    let pire = 0;
    Object.values(etat.zones || {}).forEach(zone => {
        if (!zone || !Array.isArray(zone.hexes)) return;
        if (!zone.hexes.some(h => h.q === q && h.r === r)) return;
        const degats = zone.degats ? (parseFloat(zone.degats.valeurBrute) || 0) : 0;
        pire = Math.max(pire, degats > 0 ? Math.min(1, degats / 8) : 0.6);
    });
    return pire;
}

// Combien d'adversaires au corps-à-corps depuis cette case : autant d'attaques
// d'opportunité en partant, autant de menaces en restant.
export function ennemisAuContactDepuis(etat, q, r, camp) {
    let n = 0;
    for (const id in etat.combattants) {
        const c = etat.combattants[id];
        if (c.camp === camp || c.aTerre) continue;
        if (c.q === null || c.q === undefined) continue;
        if (distance({ q, r }, c) <= 1) n++;
    }
    return n;
}

// Combien de congénères déjà collés à cette case : sert à les empêcher de
// s'agglutiner tous au même endroit.
export function alliesAdjacents(etat, q, r, camp, sauf) {
    let n = 0;
    for (const id in etat.combattants) {
        const c = etat.combattants[id];
        if (id === sauf || c.camp !== camp || c.aTerre) continue;
        if (c.q === null || c.q === undefined) continue;
        if (distance({ q, r }, c) <= 1) n++;
    }
    return n;
}

// L'adversaire debout le plus proche, leurres exclus : c'est vers lui qu'une
// créature marche quand sa carte ne peut atteindre personne ce tour-ci.
export function ennemiLePlusProche(etat, id) {
    const moi = combattant(etat, id);
    if (!moi || moi.q === null) return null;
    let proche = null, meilleure = Infinity;
    for (const autre in etat.combattants) {
        const c = etat.combattants[autre];
        if (c.camp === moi.camp || c.estIllusion || c.aTerre) continue;
        if (c.q === null || c.q === undefined) continue;
        const d = distance(moi, c);
        if (d < meilleure) { meilleure = d; proche = c; }
    }
    return proche;
}

// =========================================================================
//  3. OÙ PEUT-ELLE ALLER ?
// =========================================================================
//  Un parcours en largeur borné : trois pas au maximum, murs et vivants
//  exclus. Chaque case atteignable arrive avec le chemin pour y aller, parce
//  que c'est le chemin qui coûte, pas la destination.
//
//  La case de DÉPART en fait partie, avec un chemin vide : « ne pas bouger »
//  est une décision comme une autre, et souvent la bonne.

const PLAINE = { etatCase: () => ({ bloquee: false, supprimee: false, difficile: false }) };
export const PAS_MAX_CREATURE = 3;

export function casesAccessibles(etat, id, plateau, pasMax = PAS_MAX_CREATURE) {
    const moi = combattant(etat, id);
    if (!moi || moi.q === null) return [];
    const carte = plateau || PLAINE;

    const cle = (h) => `${h.q},${h.r}`;
    const depart = { q: moi.q, r: moi.r, chemin: [] };
    const vues = new Map([[cle(depart), depart]]);
    let frontiere = [depart];

    for (let pas = 0; pas < pasMax; pas++) {
        const suivante = [];
        frontiere.forEach(courante => {
            voisinsDe(courante).forEach(v => {
                if (vues.has(cle(v))) return;
                const etatCase = carte.etatCase(v.q, v.r) || {};
                if (etatCase.bloquee || etatCase.supprimee) return;
                if (occupantVivant(etat, v.q, v.r, id)) return;
                const noeud = { q: v.q, r: v.r, chemin: [...courante.chemin, { q: v.q, r: v.r }] };
                vues.set(cle(v), noeud);
                suivante.push(noeud);
            });
        });
        frontiere = suivante;
    }
    return [...vues.values()];
}

// =========================================================================
//  4. QUI VISER
// =========================================================================
//  On note chaque candidat et on garde le meilleur. Les poids viennent du
//  caractère : un sanguinaire achève, un prudent préfère ce qui est à portée.

export function choisirCible(etat, id, infosCarte, des) {
    const moi = combattant(etat, id);
    if (!moi || moi.q === null) return null;
    const t = traitsDe(moi);
    const infos = infosCarte || {};

    const candidats = [];
    for (const autre in etat.combattants) {
        const c = etat.combattants[autre];
        if (autre === id && !infos.estSoin) continue;
        if (c.aTerre || c.q === null || c.q === undefined) continue;
        // Un leurre ne se laisse frapper que par une attaque nue : contre tout
        // le reste, le moteur répond « cible invalide » et la créature a perdu
        // son tour. Elle peut donc encore s'y faire prendre — c'est le but d'une
        // illusion — mais seulement quand le coup partira pour de bon.
        if (c.estIllusion && !infos.estAttaqueSimple) continue;
        if (infos.estSoin ? (c.camp !== moi.camp) : (c.camp === moi.camp)) continue;
        candidats.push(c);
    }
    if (candidats.length === 0) return null;

    // Provoquée, la créature ne voit plus que celui qui l'a défiée, tant que
    // l'état dure — sauf pour ses soins, qui vont toujours aux siens. Si le
    // provocateur est tombé entre-temps, la contrainte s'efface d'elle-même.
    const provocation = (moi.etats || []).find(e => e && e.nom === "Provocation");
    if (provocation && provocation.idProvocateur && !infos.estSoin) {
        const force = candidats.find(c => c.id === provocation.idProvocateur);
        if (force) return force;
    }

    let meilleure = null, meilleurScore = -Infinity;
    candidats.forEach(cible => {
        const d = distance(moi, cible);
        const ratioPV = cible.pvMax > 0
            ? Math.max(0, Math.min(1, cible.pv / cible.pvMax)) : 1;

        let score = 0;
        // Achever un blessé : c'est le trait « cibleFaible » qui décide du poids.
        score += t.cibleFaible * (1 - ratioPV) * 10;
        // Un soin va à celui qui en a le plus besoin, et à personne s'ils vont
        // tous bien — d'où le retrait de quatre points.
        if (infos.estSoin) score += (1 - ratioPV) * 14 - 4;
        // À situation égale, on préfère ce qui est proche.
        score -= d * 1.2;
        // Déjà à portée sans bouger : c'est un tour utile garanti.
        if (d <= nombre(infos.portee, 1)) score += 6;
        score += bruit(des, 2.5);

        if (score > meilleurScore) { meilleurScore = score; meilleure = cible; }
    });
    return meilleure;
}

// =========================================================================
//  5. OÙ SE METTRE
// =========================================================================
//  Chaque case atteignable est notée selon le caractère, et la meilleure gagne.
//  C'est ici que se jouent le contournement, la fuite du corps-à-corps des
//  tireurs, et l'évitement des zones.
//
//  Le placement des cartes de ZONE (choisir l'ancre et l'orientation d'une
//  emprise) n'est pas encore ici : il reste dans monstres_ia.js jusqu'à ce que
//  le ciblage de zone passe à son tour en pur. On le dit plutôt que de faire
//  semblant.

export function choisirPosition(etat, id, cible, infosCarte, plateau, des) {
    const moi = combattant(etat, id);
    if (!moi || moi.q === null) return null;
    const t = traitsDe(moi);
    const infos = infosCarte || {};
    const carte = plateau || PLAINE;

    const cases = casesAccessibles(etat, id, carte);
    if (cases.length === 0) return null;

    // L'énergie réellement disponible pour marcher : la carte est payée d'abord.
    // Sans cette réserve, la créature arrive à portée sans pouvoir frapper.
    const budget = Math.max(0, moi.fatigue - nombre(infos.fatigue));
    const contactDepart = ennemisAuContactDepuis(etat, moi.q, moi.r, moi.camp);
    const portee = nombre(infos.portee, 1);

    let meilleure = null, meilleurScore = -Infinity;

    cases.forEach(c => {
        // Le coût réel du trajet, au barème du jeu.
        let cout = 0;
        c.chemin.forEach((step, i) => {
            const etatCase = carte.etatCase(step.q, step.r) || {};
            cout += coutDuPas(moi, i + 1, !!etatCase.difficile, false);
        });
        if (cout > budget) return;     // elle ne pourrait plus lancer sa carte

        let score = 0;

        if (cible) {
            const d = distance(c, cible);
            if (d <= portee) {
                score += 25;           // à portée : c'est l'objectif premier
                // Un tireur ne veut pas coller sa cible : il garde ses distances.
                if (t.tientDistance > 0 && portee > 1) {
                    const ideale = Math.max(2, portee - 1);
                    score -= t.tientDistance * Math.abs(d - ideale) * 3;
                }
            } else {
                // Hors de portée : on récompense au moins le rapprochement.
                score -= d * 2.5;
            }
        }

        // Les zones : redoutées ou ignorées selon le caractère. La pénalité doit
        // pouvoir l'emporter sur le bonus de mise à portée, sinon « prudent » ne
        // voudrait rien dire — une créature méfiante préfère renoncer à frapper
        // plutôt que de finir son tour dans les flammes. Traverser une case de
        // zone reste bien moins grave que s'y arrêter.
        score -= t.peurZones * dangerDeLaCase(etat, c.q, c.r) * 45;
        c.chemin.forEach(step => { score -= t.peurZones * dangerDeLaCase(etat, step.q, step.r) * 8; });

        // Quitter un corps-à-corps se paie en attaques d'opportunité.
        const contactArrivee = ennemisAuContactDepuis(etat, c.q, c.r, moi.camp);
        if (contactDepart > 0 && contactArrivee < contactDepart) {
            score -= t.eviteAO * (contactDepart - contactArrivee) * 12;
        }
        // Un combattant à distance cherche à se dégager ; un bagarreur veut le
        // contact. Le même trait, lu dans les deux sens.
        if (portee > 1 && contactArrivee > 0) score -= t.tientDistance * 10;
        if (portee <= 1 && contactArrivee > 0) score += (1 - t.tientDistance) * 6;

        // Ne pas s'entasser.
        score -= t.contourne * alliesAdjacents(etat, c.q, c.r, moi.camp, id) * 5;

        // Marcher coûte : à avantage égal, on préfère rester où l'on est.
        score -= cout * 0.35;
        score += bruit(des, 2);

        if (score > meilleurScore) { meilleurScore = score; meilleure = { ...c, cout, score }; }
    });

    return meilleure;
}

// =========================================================================
//  6. LE TOUR D'UNE CRÉATURE, DÉCIDÉ
// =========================================================================
//  Ce que le cerveau appellera : l'état et la carte choisie entrent, un PLAN
//  sort — où aller, qui frapper. Aucune écriture, aucune animation : c'est le
//  moteur qui exécutera ce plan, et le journal qui le racontera.

export function deciderTourCreature(etat, id, infosCarte, plateau, des) {
    const moi = combattant(etat, id);
    if (!moi || moi.aTerre) return null;

    const infos = infosCarte || {};
    const cible = choisirCible(etat, id, infos, des);
    let place = choisirPosition(etat, id, cible, infos, plateau, des);

    // Sa carte ne partira pas ce tour-ci — une créature de mêlée dont la proie
    // reste hors d'atteinte après ses trois pas, par exemple. Elle ne doit pas
    // rester plantée : elle marche vers l'adversaire le plus proche et passera
    // son tour. Et comme elle ne lancera rien, inutile de garder l'énergie de
    // la carte en réserve : elle peut aller aussi loin que ses jambes le
    // permettent.
    const atteindra = place && cible
        && distance({ q: place.q, r: place.r }, cible) <= nombre(infos.portee, 1);

    if (!atteindra) {
        const proche = ennemiLePlusProche(etat, id);
        if (proche) {
            const repli = choisirPosition(etat, id, proche,
                { ...infos, portee: 1, fatigue: 0 }, plateau, des);
            if (repli) place = repli;
        }
    }

    // Immobilisée, elle reste où elle est — mais peut encore frapper.
    if (aLEtat(moi, "Immobilisation") || aLEtat(moi, "Paralysie")) {
        place = { q: moi.q, r: moi.r, chemin: [], cout: 0 };
    }

    const arrivee = place ? { q: place.q, r: place.r } : { q: moi.q, r: moi.r };
    const aPortee = cible && distance(arrivee, cible) <= nombre(infos.portee, 1);

    return {
        acteur: id,
        cible: cible ? cible.id : null,
        chemin: place ? place.chemin : [],
        coutTrajet: place ? nombre(place.cout) : 0,
        lancera: !!aPortee,
        // Pourquoi elle ne lance rien : utile dans la trace, et honnête.
        raison: aPortee ? null : (cible ? "hors de portée" : "aucune cible")
    };
}

if (typeof window !== "undefined") {
    window.iaPure = {
        PERSONNALITES, traitsDe, dangerDeLaCase, ennemisAuContactDepuis, alliesAdjacents,
        ennemiLePlusProche, casesAccessibles, choisirCible, choisirPosition, deciderTourCreature
    };
}
