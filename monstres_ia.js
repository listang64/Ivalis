// =========================================================================
//  IVALIS - INTELLIGENCE DES MONSTRES EN COMBAT (chapitre 3 du bestiaire)
// =========================================================================
//  Les monstres jouent seuls, exactement dans les mêmes rails que les
//  joueurs :
//
//   • Phase de préparation : chaque monstre vivant choisit une carte et la
//     pose dans la file d'initiative. C'est indispensable au passage en
//     résolution : la partie n'y bascule que lorsque TOUS les combattants
//     vivants ont choisi, monstres compris.
//
//   • Phase de résolution : quand la file présente un monstre en tête, il
//     se déplace (3 cases au maximum) pour se mettre à portée, lance sa
//     carte, puis passe la main.
//
//  Rien n'est réécrit du moteur : le déplacement passe par
//  ajouterEtapeMouvement() + validerMouvement() (donc attaques
//  d'opportunité, zones persistantes et coût en fatigue s'appliquent tout
//  seuls), et le sort par demarrerCiblage() + ajouterCibleCiblage() +
//  declencherResolution(), comme si un joueur cliquait.
//
//  ⚠️ POURQUOI UN VERROU : le jeu n'a pas de serveur, tout tourne dans les
//  navigateurs. À trois iPads connectés, les trois exécuteraient ce code et
//  le monstre agirait trois fois. Le premier poste qui réclame le tour d'un
//  monstre l'exécute, les autres regardent. Aucun humain n'intervient : le
//  verrou se libère tout seul et un autre poste reprend si le premier
//  disparaît en cours de route.
// =========================================================================
import { db } from "./firebase-config.js";
import {
    doc, getDoc, updateDoc, runTransaction
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// =========================================================================
//  1. LES PERSONNALITÉS
// =========================================================================
//  Chaque trait vaut de 0 à 1 et pondère une décision précise. C'est de là
//  que vient la variété : deux ours de la même rencontre ne réagiront pas
//  pareil à une zone de feu ou à un mage isolé.
// =========================================================================

const PERSONNALITES = {
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

// Quelles personnalités sont plausibles pour quel rôle. Un archer prudent est
// crédible, un archer brutal beaucoup moins.
const PERSONNALITES_PAR_ARCHETYPE = {
    "DPS CAC":           ["brutal", "sanguinaire", "sanguinaire", "opportuniste"],
    "TANK CAC":          ["brutal", "brutal", "tacticien", "sanguinaire"],
    "SOUTIEN":           ["prudent", "prudent", "tacticien", "opportuniste"],
    "DPS MAGE CAC":      ["sanguinaire", "tacticien", "opportuniste", "brutal"],
    "DPS DISTANCE":      ["prudent", "opportuniste", "tacticien", "prudent"],
    "DPS MAGE DISTANCE": ["prudent", "tacticien", "opportuniste", "prudent"]
};

window.tirerPersonnaliteMonstre = function(archetype) {
    const choix = PERSONNALITES_PAR_ARCHETYPE[archetype] || Object.keys(PERSONNALITES);
    return choix[Math.floor(Math.random() * choix.length)];
};

function traits(monstre) {
    const nom = monstre && monstre.Personnalite;
    return PERSONNALITES[nom] || PERSONNALITES.brutal;
}

// Une part d'aléatoire à chaque décision : sans elle, une même personnalité
// dans une même situation rejouerait toujours exactement le même coup.
const bruit = (ampleur) => (Math.random() - 0.5) * 2 * ampleur;

// =========================================================================
//  2. LECTURE DU TERRAIN
// =========================================================================

const VOISINS = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
];

const distanceHex = (a, b) => (typeof window.hexDistanceVTT === "function")
    ? window.hexDistanceVTT(a, b)
    : Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((-a.q - a.r) - (-b.q - b.r)));

function caseLibre(q, r, idIgnore) {
    if (!window.PLATEAU_VTT) return false;
    const etat = window.PLATEAU_VTT.getCaseState(q, r);
    if (etat.isDeleted || etat.isBlocked) return false;
    const tokens = window.TOKENS_VTT_DATA || {};
    for (const id in tokens) {
        if (id === idIgnore) continue;
        if (tokens[id].q === q && tokens[id].r === r) {
            // Un cadavre n'occupe plus le terrain (cf. window.estCombattantMort).
            if (typeof window.estCombattantMort === "function" && window.estCombattantMort(id)) continue;
            return false;
        }
    }
    return true;
}

// Les cases atteignables en 3 pas AU PLUS, avec la longueur réelle du trajet
// (murs, cases supprimées et combattants contournés par l'A* du jeu).
const PAS_MAX_MONSTRE = 3;

window.casesAccessiblesMonstre = function(idMonstre, pasMax = PAS_MAX_MONSTRE) {
    const depart = (window.TOKENS_VTT_DATA || {})[idMonstre];
    if (!depart || !window.PLATEAU_VTT) return [];

    const resultat = [{ q: depart.q, r: depart.r, pas: 0, chemin: [] }];
    const vues = new Set([`${depart.q},${depart.r}`]);

    // On explore en cercles concentriques puis on demande à l'A* du jeu le vrai
    // trajet : c'est lui qui fait foi pour les murs et les contournements.
    for (let rayon = 1; rayon <= pasMax; rayon++) {
        for (let dq = -rayon; dq <= rayon; dq++) {
            for (let dr = Math.max(-rayon, -dq - rayon); dr <= Math.min(rayon, -dq + rayon); dr++) {
                const q = depart.q + dq, r = depart.r + dr;
                const cle = `${q},${r}`;
                if (vues.has(cle)) continue;
                vues.add(cle);
                if (!caseLibre(q, r, idMonstre)) continue;

                const chemin = window.calculerCheminVTT({ q: depart.q, r: depart.r }, { q, r });
                if (chemin.length > 0 && chemin.length <= pasMax) {
                    resultat.push({ q, r, pas: chemin.length, chemin });
                }
            }
        }
    }
    return resultat;
};

// Une case est-elle dans une zone persistante, et à quel point est-ce grave ?
// ⚠️ window.ZONES_PERSISTANTES est indexé par IDENTIFIANT DE ZONE (« zp_… »),
// chaque zone portant la liste de ses cases dans `hexes` et ses dégâts dans
// `degats.valeurBrute` (voir creerZonePersistante, moteur_effets.js). Chercher
// une case par ses coordonnées dans cet objet ne renvoie jamais rien : le
// danger serait toujours nul et les créatures prudentes traverseraient le feu
// sans sourciller.
function dangerZone(q, r) {
    let pire = 0;
    Object.values(window.ZONES_PERSISTANTES || {}).forEach(zone => {
        if (!zone || !Array.isArray(zone.hexes)) return;
        if (!zone.hexes.some(h => h.q === q && h.r === r)) return;

        const degats = zone.degats ? (parseFloat(zone.degats.valeurBrute) || 0) : 0;
        // Les dégâts donnent la mesure du risque ; une zone qui ne pose qu'un
        // état (brûlure, poison…) reste franchement repoussante.
        const risque = degats > 0 ? Math.min(1, degats / 8) : 0.6;
        pire = Math.max(pire, risque);
    });
    return pire;
}

// Combien d'adversaires au corps-à-corps depuis cette case (donc combien
// d'attaques d'opportunité en partant, et combien de menaces en restant).
function ennemisAuContactDepuis(q, r, campMonstre) {
    let n = 0;
    const tokens = window.TOKENS_VTT_DATA || {};
    (window.PERSOS_PARTIE || []).forEach(p => {
        if (p.camp === campMonstre) return;
        if (typeof window.estCombattantMort === "function" && window.estCombattantMort(p.idPersonnage)) return;
        const tk = tokens[p.idPersonnage];
        if (tk && distanceHex({ q, r }, tk) <= 1) n++;
    });
    return n;
}

// Combien de congénères déjà collés à cette case : sert à les empêcher de
// s'agglutiner tous au même endroit.
function allesAdjacents(q, r, campMonstre, idMonstre) {
    let n = 0;
    const tokens = window.TOKENS_VTT_DATA || {};
    (window.PERSOS_PARTIE || []).forEach(p => {
        if (p.idPersonnage === idMonstre || p.camp !== campMonstre) return;
        if (typeof window.estCombattantMort === "function" && window.estCombattantMort(p.idPersonnage)) return;
        const tk = tokens[p.idPersonnage];
        if (tk && distanceHex({ q, r }, tk) <= 1) n++;
    });
    return n;
}

// =========================================================================
//  3. CE QUE FAIT UNE CARTE
// =========================================================================
//  On relit les Composants exactement comme le fait le moteur de combat :
//  portée, soin ou dégâts, zone. Aucun champ résumé n'est stocké à part, pour
//  que l'IA ne puisse jamais se désynchroniser de ce qui sera réellement joué.
// =========================================================================

// Les douze altérations que le moteur sait accrocher à une carte (moteur_effets,
// alterationsExtraites). Une carte qui n'en porte AUCUNE, et qui ne soigne ni ne
// protège, est une "attaque simple" — la seule chose qu'une illusion accepte de
// recevoir. Provocations n'y figure pas : le moteur ne la résout pas, elle se
// joue à la table.
const ALTERATIONS_MOTEUR = ["brûl", "brul", "glac", "électri", "electri", "empoison", "poison",
    "confusion", "paralys", "immobilis", "peur", "pouss", "traction", "étourd", "etourd", "absorption"];

window.analyserCarteMonstre = function(dataCarte) {
    const infos = { portee: 1, estSoin: false, estZone: false, degats: 0, aAlteration: false,
                    zoneHexes: null, fatigue: parseInt(dataCarte?.Fatigue) || 0 };
    const cache = window.EFFETS_BDD_CACHE || {};
    if (!dataCarte || !dataCarte.Composants || !dataCarte.Composants.actions) return infos;

    dataCarte.Composants.actions.forEach(act => {
        const base = cache[act.baseEffetId];
        if (!base) return;
        const nomBase = (base.Nom || "").toLowerCase();

        if (nomBase.includes("soin") || nomBase.includes("guérison") || nomBase.includes("bouclier")
            || nomBase.includes("purification") || nomBase.includes("absorption")) {
            infos.estSoin = true;
        }
        if (nomBase.includes("attaque") || nomBase.includes("mot de pouvoir") || nomBase.includes("mots de pouvoir")) {
            infos.degats += (parseFloat(String(base.Valeur).replace(",", ".")) || 0) * (act.count || 1);
        }
        if (act.zoneHexes && act.zoneHexes.length > 0) {
            infos.estZone = true;
            // L'emprise brute, telle que la Forge l'a dessinée autour de (0,0) :
            // c'est elle qui permet de juger, AVANT de bouger, combien de monde
            // une zone de mêlée ramasserait depuis telle ou telle case.
            if (!infos.zoneHexes) infos.zoneHexes = act.zoneHexes;
        }
        if (ALTERATIONS_MOTEUR.some(mot => nomBase.includes(mot))) infos.aAlteration = true;

        Object.keys(act.mods || {}).forEach(idMod => {
            const mod = cache[idMod];
            if (!mod) return;
            if (mod.Nom === "Distance") {
                const val = parseFloat(String(mod.Valeur).replace(",", ".")) || 0;
                infos.portee = Math.max(infos.portee, 1 + val * act.mods[idMod]);
            }
            if ((mod.Nom || "").toLowerCase().includes("traction")) infos.portee = Math.max(infos.portee, 3);
            if (mod.Nom === "Zone") infos.estZone = true;
            const nomMod = (mod.Nom || "").toLowerCase();
            if (ALTERATIONS_MOTEUR.some(mot => nomMod.includes(mot))) infos.aAlteration = true;
            if (nomMod.includes("bouclier") || nomMod.includes("soin") || nomMod.includes("purification")) infos.estSoin = true;
        });
    });
    // ⚖️ règle du moteur : une illusion "encaisse les dégâts mais reste
    // insensible à tout le reste". Une carte qui porte la moindre altération,
    // un soin ou un bouclier se voit répondre "Cible invalide" et le tour est
    // perdu — d'où ce drapeau, que le choix de cible consulte.
    infos.estAttaqueSimple = !infos.estSoin && !infos.aAlteration && infos.degats > 0;
    return infos;
};

// =========================================================================
//  4. QUI VISER
// =========================================================================

window.choisirCibleMonstre = function(monstre, infosCarte) {
    const t = traits(monstre);
    const tokens = window.TOKENS_VTT_DATA || {};
    const tkMonstre = tokens[monstre.idPersonnage];
    if (!tkMonstre) return null;

    // Une carte de soutien se tourne vers les siens, le reste vers l'adversaire.
    const candidats = (window.PERSOS_PARTIE || []).filter(p => {
        if (p.idPersonnage === monstre.idPersonnage && !infosCarte.estSoin) return false;
        if (typeof window.estCombattantMort === "function" && window.estCombattantMort(p.idPersonnage)) return false;
        if (!tokens[p.idPersonnage]) return false;
        // Un leurre ne se laisse frapper que par une attaque nue : contre tout le
        // reste, le moteur répond "Cible invalide" et la créature a perdu son
        // tour. Elle peut donc encore se faire avoir — c'est le but d'une
        // illusion — mais seulement quand le coup partira pour de bon.
        if (p.estIllusion && !infosCarte.estAttaqueSimple) return false;
        return infosCarte.estSoin ? (p.camp === monstre.camp) : (p.camp !== monstre.camp);
    });
    if (candidats.length === 0) return null;

    let meilleure = null, meilleurScore = -Infinity;
    candidats.forEach(cible => {
        const tk = tokens[cible.idPersonnage];
        const distance = distanceHex(tkMonstre, tk);

        const pvMax = (parseInt(cible.PV_Max) || 1) + (parseInt(cible.Dev_Mod_PV) || 0);
        const pv = parseInt(cible.PV_Actuels);
        const ratioPV = pvMax > 0 ? Math.max(0, Math.min(1, (isNaN(pv) ? pvMax : pv) / pvMax)) : 1;

        let score = 0;
        // Achever un blessé : c'est le trait "cibleFaible" qui décide du poids.
        score += t.cibleFaible * (1 - ratioPV) * 10;
        // Un soin va à celui qui en a le plus besoin, et à personne s'ils vont tous bien.
        if (infosCarte.estSoin) score += (1 - ratioPV) * 14 - 4;
        // À situation égale, on préfère ce qui est proche : moins de trajet, moins de risques.
        score -= distance * 1.2;
        // Déjà à portée sans bouger : gros avantage, c'est un tour utile garanti.
        if (distance <= infosCarte.portee) score += 6;
        score += bruit(2.5);

        if (score > meilleurScore) { meilleurScore = score; meilleure = cible; }
    });
    return meilleure;
};

// =========================================================================
//  5. OÙ SE PLACER
// =========================================================================
//  On note chaque case atteignable (3 pas au plus) selon la personnalité, et
//  on garde la meilleure. C'est ici que se jouent le contournement, la fuite
//  du corps-à-corps des tireurs, et l'évitement des zones.
// =========================================================================

// L'adversaire debout le plus proche, leurres exclus : c'est vers lui qu'une
// créature marche quand sa carte ne peut atteindre personne ce tour-ci.
function ennemiLePlusProche(monstre) {
    const tokens = window.TOKENS_VTT_DATA || {};
    const tk = tokens[monstre.idPersonnage];
    if (!tk) return null;
    let plusProche = null, meilleure = Infinity;
    (window.PERSOS_PARTIE || []).forEach(p => {
        if (p.camp === monstre.camp || p.estIllusion) return;
        if (typeof window.estCombattantMort === "function" && window.estCombattantMort(p.idPersonnage)) return;
        const tkP = tokens[p.idPersonnage];
        if (!tkP) return;
        const d = distanceHex(tk, tkP);
        if (d < meilleure) { meilleure = d; plusProche = p; }
    });
    return plusProche;
}

window.choisirPositionMonstre = function(monstre, cible, infosCarte) {
    const tokens = window.TOKENS_VTT_DATA || {};
    const tkMonstre = tokens[monstre.idPersonnage];
    const tkCible = cible ? tokens[cible.idPersonnage] : null;
    if (!tkMonstre) return null;

    const t = traits(monstre);
    const cases = window.casesAccessiblesMonstre(monstre.idPersonnage);
    if (cases.length === 0) return null;

    // Fatigue réellement disponible pour marcher : la carte est payée d'abord.
    const fatigue = parseInt(monstre.fatigueActuelle);
    const fatigueDispo = (isNaN(fatigue) ? 0 : fatigue) - infosCarte.fatigue;
    const estGlace = (monstre.Etats_Alteres || []).some(e => e.nom === "Glacé");

    const contactDepart = ennemisAuContactDepuis(tkMonstre.q, tkMonstre.r, monstre.camp);

    // Carte de zone au corps-à-corps : l'emprise est centrée sur la créature, donc
    // c'est SA case qui décide de qui sera pris dedans. On juge alors chaque case
    // à ce que la zone y ramasserait, plutôt qu'à la seule distance d'une cible :
    // sans ça, elle allait au contact du premier venu et arrosait une case vide.
    const zoneDeMelee = infosCarte.estZone && infosCarte.zoneHexes
                        && infosCarte.zoneHexes.length > 0 && infosCarte.portee <= 1;
    const occupantsZone = zoneDeMelee
        ? occupantsSousZone(monstre, !!infosCarte.estSoin, !infosCarte.estSoin && !infosCarte.aAlteration)
        : null;

    let meilleure = null, meilleurScore = -Infinity;

    cases.forEach(c => {
        // Coût réel du trajet, barème du jeu : 2 par case sur les trois premières,
        // doublé sur terrain difficile et doublé encore si le monstre est gelé.
        let cout = 0;
        c.chemin.forEach(step => {
            let pas = 2;
            const etat = window.PLATEAU_VTT.getCaseState(step.q, step.r);
            if (etat.isDifficult) pas *= 2;
            if (estGlace) pas *= 2;
            cout += pas;
        });
        if (cout > fatigueDispo) return; // il ne pourrait plus lancer sa carte

        let score = 0;

        if (occupantsZone) {
            // Zone de mêlée : la bonne case n'est pas "celle qui touche la
            // cible", c'est celle dont l'emprise ramasse le plus de monde. On
            // essaie les six orientations depuis chaque case et on juge là-dessus
            // — sinon la créature fonçait sur le premier venu et arrosait du vide.
            const couverture = meilleureOrientation(infosCarte.zoneHexes, c, occupantsZone).score;
            score += couverture * 1.4;
            // Rien à ramasser d'ici : on se rapproche quand même, comme pour une
            // carte ordinaire.
            if (couverture <= 0 && tkCible) score -= distanceHex(c, tkCible) * 2.5;

        } else if (tkCible) {
            const distance = distanceHex(c, tkCible);
            if (distance <= infosCarte.portee) {
                score += 25; // à portée : c'est l'objectif premier
                // Un tireur ne veut pas coller sa cible : il garde ses distances.
                if (t.tientDistance > 0 && infosCarte.portee > 1) {
                    const ideale = Math.max(2, infosCarte.portee - 1);
                    score -= t.tientDistance * Math.abs(distance - ideale) * 3;
                }
            } else {
                // Hors de portée : on récompense au moins le rapprochement.
                score -= distance * 2.5;
            }
        }

        // Les zones persistantes : redoutées ou ignorées selon le caractère.
        // La pénalité doit pouvoir l'emporter sur le bonus de mise à portée,
        // sinon "prudent" ne voudrait rien dire : une créature méfiante préfère
        // renoncer à frapper ce tour-ci plutôt que de finir son mouvement dans
        // les flammes. Traverser une case de zone reste bien moins grave que
        // s'y arrêter.
        score -= t.peurZones * dangerZone(c.q, c.r) * 45;
        c.chemin.forEach(step => { score -= t.peurZones * dangerZone(step.q, step.r) * 8; });

        // Attaques d'opportunité : quitter un corps-à-corps se paie.
        const contactArrivee = ennemisAuContactDepuis(c.q, c.r, monstre.camp);
        if (contactDepart > 0 && contactArrivee < contactDepart) {
            score -= t.eviteAO * (contactDepart - contactArrivee) * 12;
        }
        // Un combattant à distance cherche malgré tout à se dégager du corps-à-corps.
        if (infosCarte.portee > 1 && contactArrivee > 0) score -= t.tientDistance * 10;
        // Un bagarreur, lui, veut le contact.
        if (infosCarte.portee <= 1 && contactArrivee > 0) score += (1 - t.tientDistance) * 6;

        // Ne pas s'entasser : on évite les cases déjà entourées de congénères.
        score -= t.contourne * allesAdjacents(c.q, c.r, monstre.camp, monstre.idPersonnage) * 5;

        // À bénéfice égal, rester sur place plutôt que gaspiller de la fatigue.
        score -= c.pas * 1.2;

        // Si la position actuelle est déjà CONFORTABLE, ne pas gigoter pour rien :
        // sans cette prime, la part d'aléatoire suffisait à faire trottiner un
        // ours déjà au contact de sa proie, pour deux cases et quatre points de
        // fatigue perdus. « Confortable » ne veut pas seulement dire à portée :
        // un tireur coincé au corps-à-corps ou une créature debout dans les
        // flammes a toutes les raisons de bouger, et ne doit pas être récompensée
        // de rester.
        if (c.pas === 0 && tkCible && distanceHex(tkMonstre, tkCible) <= infosCarte.portee) {
            const coinceAuContact = infosCarte.portee > 1 && t.tientDistance > 0.3 && contactDepart > 0;
            const dansLeDanger = t.peurZones * dangerZone(tkMonstre.q, tkMonstre.r) > 0.2;
            if (!coinceAuContact && !dansLeDanger) score += 9;
        }

        score += bruit(3);

        if (score > meilleurScore) { meilleurScore = score; meilleure = c; }
    });

    return meilleure;
};

// =========================================================================
//  6. PHASE DE PRÉPARATION — le monstre choisit sa carte
// =========================================================================

function cartesDuMonstre(monstre) {
    const cache = (window.CACHE_COMPETENCES_GLOBAL || {})[monstre.idPersonnage] || {};
    return (monstre.deckEquipe || [])
        .filter(id => cache[id])
        .map(id => ({ id, data: cache[id] }));
}

// Le repos long est une entrée de file à part entière, exactement comme pour un
// joueur : initiative 0 et identifiant "REPOS_LONG". C'est finDeTourCombat() qui
// rend alors 35 % de la fatigue maximale.
// Mémoire de la dernière carte jouée par chaque monstre, pour éviter les
// répétitions. Volontairement en mémoire vive et non en base : si le poste qui
// pilote change, on perd juste le frein d'un tour, ce qui est sans conséquence.
window.DERNIERES_CARTES_MONSTRES = window.DERNIERES_CARTES_MONSTRES || {};
const derniereCarteJouee = (id) => window.DERNIERES_CARTES_MONSTRES[id] || null;

const CARTE_REPOS = { id: "REPOS_LONG", data: { Nom: "Repos long", Fatigue: 0, Initiative: 0 }, repos: true };

// Combien de temps on laisse la forge finir avant de considérer qu'une créature
// n'aura jamais de techniques et qu'elle doit souffler pour libérer le tour.
const DELAI_FORGE_MS = 30000;
window.ATTENTE_TECHNIQUES_MONSTRES = window.ATTENTE_TECHNIQUES_MONSTRES || {};

window.choisirCarteMonstre = function(monstre) {
    const cartes = cartesDuMonstre(monstre);
    const fatigue = parseInt(monstre.fatigueActuelle);
    const fatigueDispo = isNaN(fatigue) ? 0 : fatigue;
    const fatigueMax = parseInt(monstre.Fatigue_Max) || parseInt(monstre.fatigueMax) || 100;

    // ⚠️ Un monstre qui ne pose RIEN dans la file retient la bascule en
    // résolution : la partie n'y passe que lorsque tous les combattants vivants
    // ont choisi. Mais souffler parce que ses techniques ne sont PAS ENCORE
    // arrivées serait pire : la forge tourne en arrière-plan (elle passe par
    // l'IA pour les noms, ce qui prend quelques secondes) et une rencontre
    // lancée dans la foulée voyait toutes ses créatures prendre un repos long au
    // premier tour. Tant que le Deck_Equipe n'est pas écrit en base, on répond
    // "pas prêt" et l'appel sera refait ; passé le délai de grâce, on souffle
    // pour de bon plutôt que de figer le combat.
    if (cartes.length === 0) {
        const forgeFinie = Array.isArray(monstre.deckEquipe) && monstre.deckEquipe.length > 0;
        const attentes = window.ATTENTE_TECHNIQUES_MONSTRES;
        if (!attentes[monstre.idPersonnage]) attentes[monstre.idPersonnage] = Date.now();
        const attendDepuis = Date.now() - attentes[monstre.idPersonnage];
        if (attendDepuis < DELAI_FORGE_MS) {
            console.log(`⏳ ${monstre.prenom || monstre.idPersonnage} attend ses techniques`
                        + (forgeFinie ? " (déjà en base, cache en cours de lecture)" : " (forge en cours)"));
            return null;
        }
        return CARTE_REPOS;
    }
    delete window.ATTENTE_TECHNIQUES_MONSTRES[monstre.idPersonnage];

    const abordables = cartes.filter(c => (parseInt(c.data.Fatigue) || 0) <= fatigueDispo);
    if (abordables.length === 0) return CARTE_REPOS;

    const t = traits(monstre);

    // Réserve presque vide : souffler maintenant plutôt que de lâcher une
    // dernière carte et de rester bloqué le tour suivant. Un prudent y consent
    // volontiers, un brutal s'entête.
    if (fatigueDispo < fatigueMax * 0.2) {
        const envieDeSouffler = 0.35 + t.tientDistance * 0.4 + t.peurZones * 0.2;
        if (Math.random() < envieDeSouffler) return CARTE_REPOS;
    }
    const tokens = window.TOKENS_VTT_DATA || {};
    const tkMonstre = tokens[monstre.idPersonnage];

    // Distance à l'adversaire le plus proche : sert à juger si la carte pourra
    // vraiment servir, sachant que le monstre pourra encore avancer de 3 cases.
    let distanceProche = Infinity;
    (window.PERSOS_PARTIE || []).forEach(p => {
        if (p.camp === monstre.camp) return;
        if (typeof window.estCombattantMort === "function" && window.estCombattantMort(p.idPersonnage)) return;
        const tk = tokens[p.idPersonnage];
        if (tk && tkMonstre) distanceProche = Math.min(distanceProche, distanceHex(tkMonstre, tk));
    });

    // Un allié est-il assez amoché pour qu'un soin ait du sens ?
    let besoinDeSoin = 0;
    (window.PERSOS_PARTIE || []).forEach(p => {
        if (p.camp !== monstre.camp) return;
        if (typeof window.estCombattantMort === "function" && window.estCombattantMort(p.idPersonnage)) return;
        const pvMax = (parseInt(p.PV_Max) || 1) + (parseInt(p.Dev_Mod_PV) || 0);
        const pv = parseInt(p.PV_Actuels);
        if (pvMax > 0) besoinDeSoin = Math.max(besoinDeSoin, 1 - (isNaN(pv) ? pvMax : pv) / pvMax);
    });

    // Les dégâts se jugent RELATIVEMENT au jeu de la créature, jamais en valeur
    // absolue. Depuis que les cartes frappent pour de bon (une dizaine de points
    // pour un petit, une trentaine pour un boss), un score proportionnel aux
    // dégâts bruts écrasait le hasard, la portée et le frein de répétition : la
    // créature rejouait sa plus grosse carte en boucle. Ramené à sa propre
    // échelle, le curseur garde le même poids qu'avant quelle que soit la
    // stature du monstre, et les cartes à effets restent dans la course.
    const analyses = new Map();
    abordables.forEach(c => analyses.set(c.id, window.analyserCarteMonstre(c.data)));
    const degatsMax = Math.max(1, ...abordables.map(c => analyses.get(c.id).degats));

    let meilleure = null, meilleurScore = -Infinity;
    abordables.forEach(c => {
        const infos = analyses.get(c.id);
        let score = 0;

        // Une carte utilisable dès ce tour vaut mieux qu'une carte hors d'atteinte.
        const portable = distanceProche <= infos.portee + PAS_MAX_MONSTRE;
        score += portable ? 12 : -20;

        if (infos.estSoin) {
            // Ne soigner que si quelqu'un en a besoin, sinon c'est un tour perdu.
            // Le gain doit pouvoir rivaliser avec la meilleure carte offensive :
            // à +22 maximum, le soin ne sortait JAMAIS, pas même pour un allié à
            // 8 points de vie, parce qu'une grosse attaque à distance dépassait
            // les 28 points de score.
            score += besoinDeSoin * 45 - 14;
        } else {
            const forceRelative = infos.degats / degatsMax;
            score += forceRelative * 16;
            // Un caractère sanguinaire cogne fort, un prudent préfère la portée.
            score += t.cibleFaible * forceRelative * 8;
            score += t.tientDistance * (infos.portee - 1) * 3;
        }

        // Garder un peu de réserve : une carte qui vide la fatigue empêche de bouger.
        // Volontairement le SEUL frein sur le coût : une pénalité proportionnelle
        // au prix de la carte a été essayée puis retirée, mesures à l'appui — elle
        // poussait vers les petites cartes et rendait les monstres à la fois moins
        // dangereux et moins variés (43 % de victoires contre 54, et 13 % de
        // répétitions d'un tour sur l'autre contre 9).
        const reste = fatigueDispo - (parseInt(c.data.Fatigue) || 0);
        if (reste < 6) score -= 8;

        // Ne pas rejouer la carte du tour précédent : sans ce frein, la meilleure
        // carte du jeu sortait deux fois sur trois et la créature devenait une
        // mécanique. La pénalité reste franchissable si rien d'autre ne convient.
        if (derniereCarteJouee(monstre.idPersonnage) === c.id) score -= 9;

        score += bruit(10); // deux monstres identiques ne jouent pas la même carte

        if (score > meilleurScore) { meilleurScore = score; meilleure = c; }
    });

    return meilleure;
};

// Pose la carte choisie dans la file d'initiative, exactement comme le fait
// jouerCarteCombat() pour un joueur (mêmes champs, même tri, même bascule en
// résolution une fois que tout le monde a choisi).
window.preparerCartesMonstres = async function() {
    const partie = window.PARTIE_DATA || {};
    if ((partie.Phase_Combat || "Preparation") !== "Preparation") return;
    if (!window.ID_PARTIE_COURANTE) return;

    const ordre = partie.Ordre_Initiative || [];
    const dejaChoisi = new Set((partie.File_Attente_Combat || []).map(f => f.idPersonnage));

    // Les créatures s'engagent APRÈS la table. Sans cette attente, leurs cartes
    // se posaient dès l'ouverture du tour : les joueurs voyaient l'initiative
    // adverse avant de choisir, et les monstres décidaient sans rien savoir de
    // ce qui se préparait en face. Un mort ne bloque personne.
    const humainsEnAttente = ordre.filter(id => {
        if (typeof window.estMonstre === "function" && window.estMonstre(id)) return false;
        if (dejaChoisi.has(id)) return false;
        if (typeof window.estCombattantMort === "function" && window.estCombattantMort(id)) return false;
        const p = (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === id);
        return !(p && p.estIllusion);
    });
    if (humainsEnAttente.length > 0) return;

    const aJouer = (window.MONSTRES_PARTIE || []).filter(m =>
        ordre.includes(m.idPersonnage) &&
        !dejaChoisi.has(m.idPersonnage) &&
        !(typeof window.estCombattantMort === "function" && window.estCombattantMort(m.idPersonnage))
    );
    if (aJouer.length === 0) return;

    // Un seul poste prépare les monstres, sinon leurs cartes seraient posées en
    // double dans la file.
    if (!(await reclamerVerrouIA("preparation|" + (partie.Tour_Combat || 1)))) return;

    const partieRef = doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE);
    const snap = await getDoc(partieRef);
    if (!snap.exists()) return;

    let file = snap.data().File_Attente_Combat || [];
    let auMoinsUn = false;

    window.IA_MONSTRES_EN_ATTENTE = 0;
    for (const monstre of aJouer) {
        if (file.some(f => f.idPersonnage === monstre.idPersonnage)) continue;
        const carte = window.choisirCarteMonstre(monstre);
        // Pas de carte : ses techniques ne sont pas encore forgées. On ne pose
        // rien pour lui et on repassera — surtout pas un repos long par défaut.
        if (!carte) { window.IA_MONSTRES_EN_ATTENTE++; continue; }

        if (carte.repos) {
            file.push({ idPersonnage: monstre.idPersonnage, idCarte: "REPOS_LONG",
                        initiative: 0, timestamp: new Date().getTime() });
            auMoinsUn = true;
            console.log(`🧠 ${monstre.prenom || monstre.idPersonnage} souffle (repos long)`);
            continue;
        }

        // Électrifié : même règle que pour les joueurs, -35 d'initiative sur la
        // prochaine carte jouée, puis l'état se dissipe.
        let initiative = carte.data.Initiative || 0;
        const electrifie = (monstre.Etats_Alteres || []).find(e => e.nom === "Électrifié");
        if (electrifie) {
            initiative = Math.max(0, initiative - 35);
            const restants = (monstre.Etats_Alteres || []).filter(e => e !== electrifie);
            monstre.Etats_Alteres = restants;
            updateDoc(window.refCombattant(monstre.idPersonnage), { Etats_Alteres: restants })
                .catch(e => console.error(e));
        }

        file.push({
            idPersonnage: monstre.idPersonnage,
            idCarte: carte.id,
            initiative,
            timestamp: new Date().getTime()
        });
        auMoinsUn = true;
        window.DERNIERES_CARTES_MONSTRES[monstre.idPersonnage] = carte.id;
        console.log(`🧠 ${monstre.prenom || monstre.idPersonnage} prépare « ${carte.data.Nom} » (init ${initiative})`);
    }

    if (!auMoinsUn) return;   // personne n'a rien à poser : la file reste telle quelle

    file.sort((a, b) => (b.initiative !== a.initiative) ? b.initiative - a.initiative : a.timestamp - b.timestamp);

    // Bascule en résolution dès que tous les combattants vivants ont choisi.
    let phase = snap.data().Phase_Combat || "Preparation";
    const nbActifs = (snap.data().Ordre_Initiative || []).filter(id => {
        const p = (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === id);
        return p && !(typeof window.estCombattantMort === "function" && window.estCombattantMort(id));
    }).length;
    if (file.length >= nbActifs && nbActifs > 0) phase = "Resolution";

    await updateDoc(partieRef, { File_Attente_Combat: file, Phase_Combat: phase });
};

// =========================================================================
//  7. LE VERROU
// =========================================================================
//  Une transaction Firestore : le premier poste qui réclame une étape la
//  joue, les autres passent leur chemin. Un verrou plus vieux que le délai
//  ci-dessous est considéré comme abandonné (poste fermé, iPad en veille,
//  réseau coupé) et un autre navigateur reprend la main tout seul.
// =========================================================================

const DELAI_VERROU_MS = 25000;
const ID_CLIENT = "cli_" + Math.random().toString(36).substring(2, 10);

async function reclamerVerrouIA(cle) {
    if (!window.ID_PARTIE_COURANTE) return false;
    const partieRef = doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE);
    try {
        return await runTransaction(db, async (tx) => {
            const snap = await tx.get(partieRef);
            if (!snap.exists()) return false;
            const verrou = snap.data().Verrou_IA || null;
            const maintenant = Date.now();

            if (verrou && verrou.cle === cle) {
                // Déjà réclamé : soit par nous (on continue), soit par un autre
                // poste encore vivant (on le laisse faire).
                if (verrou.client === ID_CLIENT) return true;
                if (maintenant - (verrou.ts || 0) < DELAI_VERROU_MS) return false;
            }
            tx.update(partieRef, { Verrou_IA: { cle, client: ID_CLIENT, ts: maintenant } });
            return true;
        });
    } catch (e) {
        console.error("Verrou IA :", e);
        return false;
    }
}

// =========================================================================
//  8. PHASE DE RÉSOLUTION — le monstre joue son tour
// =========================================================================

const pause = (ms) => new Promise(r => setTimeout(r, ms));
window.IA_MONSTRE_EN_COURS = false;

// =========================================================================
//  7 bis. POSER UNE ZONE
// =========================================================================
//  Une carte de zone ne se contente pas d'être "lancée" : il faut lui choisir
//  une ancre et une orientation, exactement comme un joueur le fait à la souris,
//  puis appeler validerZoneAoE() qui calcule les cibles touchées. L'IA appelait
//  directement declencherResolution() : la zone partait sans ancre et sans
//  cible, donc sans toucher personne.
// Ce que vaut chaque combattant sous une zone, du point de vue de la créature.
// Sert deux fois : pour poser la zone au moment de lancer, et pour juger, avant
// de bouger, depuis quelle case elle ramasserait le plus de monde.
function occupantsSousZone(monstre, soigne, carteEstAttaqueSimple) {
    const tokens = window.TOKENS_VTT_DATA || {};
    const liste = [];
    (window.PERSOS_PARTIE || []).forEach(p => {
        if (p.idPersonnage === monstre.idPersonnage) return;   // le lanceur est épargné
        if (typeof window.estCombattantMort === "function" && window.estCombattantMort(p.idPersonnage)) return;
        const t = tokens[p.idPersonnage];
        if (!t) return;
        if (p.estIllusion && !carteEstAttaqueSimple) return;

        const pvMax = (parseInt(p.PV_Max) || 1) + (parseInt(p.Dev_Mod_PV) || 0);
        const pv = parseInt(p.PV_Actuels);
        const manque = pvMax > 0 ? 1 - (isNaN(pv) ? pvMax : pv) / pvMax : 0;
        const allie = (p.camp === monstre.camp);

        // Une attaque de zone frappe TOUT le monde sauf le lanceur : les
        // congénères pris dedans coûtent plus cher que l'adversaire ne rapporte,
        // sinon la créature s'arroserait elle-même pour toucher un joueur.
        const valeur = soigne
            ? (allie ? 2 + manque * 12 : -6)
            : (allie ? -16 : 10 + manque * 5);
        liste.push({ q: t.q, r: t.r, valeur });
    });
    return liste;
}

// La meilleure orientation d'une emprise posée sur `centre`, et ce qu'elle vaut.
function meilleureOrientation(base, centre, occupants) {
    const tourner = window.rotateHexVTT || ((h) => h);
    let meilleurScore = -Infinity, meilleureRotation = 0;
    for (let rotation = 0; rotation < 6; rotation++) {
        let score = 0;
        base.forEach(h => {
            const rot = tourner(h, rotation);
            const q = centre.q + rot.q, r = centre.r + rot.r;
            occupants.forEach(o => { if (o.q === q && o.r === r) score += o.valeur; });
        });
        if (score > meilleurScore) { meilleurScore = score; meilleureRotation = rotation; }
    }
    return { score: meilleurScore, rotation: meilleureRotation };
}

// Attend que la carte qu'on vient de lancer ait FINI de s'appliquer. Le moteur
// diffuse la résolution puis la rejoue de son côté, cible par cible : tant qu'elle
// tourne, les positions et les points de vie ne sont pas encore ceux qui comptent.
const resolutionsEmises = () => (window.RESOLUTIONS_LOCALES || []).length;

async function attendreFinResolution(nbAvant, limiteMs = 20000) {
    // Aucun moteur de résolution en face (bancs d'essai, page partielle) :
    // il n'y a rien à attendre.
    if (!Array.isArray(window.RESOLUTIONS_LOCALES)) return;
    const debut = Date.now();
    // La carte part de façon asynchrone : on lui laisse d'abord le temps d'être
    // émise, sinon on croirait déjà tout fini.
    while (resolutionsEmises() <= nbAvant && Date.now() - debut < 2500) await pause(100);
    if (resolutionsEmises() <= nbAvant) { await pause(600); return; }   // rien n'est parti

    const marqueur = (window.RESOLUTIONS_LOCALES || []).slice(-1)[0];
    while (window.DERNIERE_RESOLUTION_TERMINEE !== marqueur && Date.now() - debut < limiteMs) {
        await pause(150);
    }
}

window.placerZoneMonstre = function(idMonstre) {
    const state = window.ETAT_CIBLAGE;
    if (!state || !state.isZone) return null;

    const base = state.zoneHexesBase || [];
    if (base.length === 0) return null;

    const tokens = window.TOKENS_VTT_DATA || {};
    const tk = tokens[idMonstre];
    const monstre = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idMonstre);
    if (!tk || !monstre) return null;

    const config = (state.attaques || [])[0] || (state.alterations || [])[0] || null;
    const soigne = !!(config && (config.isHeal || config.isShield));
    const ligneDeVue = window.verifierLigneDeVueVTT || (() => true);

    // Qui compte, et pour combien. Le lanceur est épargné par sa propre zone
    // (validerZoneAoE l'exclut), les morts ne comptent pas, et un leurre ne
    // reçoit qu'une attaque nue — même règle que pour une cible unique.
    const carteEstAttaqueSimple = !soigne && (state.alterations || []).length === 0;
    const occupants = occupantsSousZone(monstre, soigne, carteEstAttaqueSimple);

    // Les ancres possibles. Une zone de corps-à-corps est centrée sur le
    // lanceur : seule l'orientation se choisit. Une zone à distance se pose où
    // l'on veut, dans la limite de la portée, de la ligne de vue, et de la règle
    // d'engagement (au contact, on ne vise plus qu'à une case).
    let ancres = [{ q: tk.q, r: tk.r }];
    if (config && config.isRanged) {
        const portee = Math.max(1, Math.min(8, parseInt(config.rangeMax) || 1));
        const engage = occupants.some(o => o.valeur > 0 && distanceHex(tk, o) === 1);
        const limite = engage ? 1 : portee;
        ancres = [];
        for (let dq = -limite; dq <= limite; dq++) {
            for (let dr = -limite; dr <= limite; dr++) {
                const hex = { q: tk.q + dq, r: tk.r + dr };
                if (distanceHex(tk, hex) > limite) continue;
                const etat = window.PLATEAU_VTT ? window.PLATEAU_VTT.getCaseState(hex.q, hex.r) : null;
                if (etat && etat.isDeleted) continue;
                if (!ligneDeVue(tk, hex)) continue;
                ancres.push(hex);
            }
        }
        if (ancres.length === 0) return null;
    }

    let meilleur = null, meilleurScore = -Infinity;
    ancres.forEach(ancre => {
        const orientation = meilleureOrientation(base, ancre, occupants);
        // À prise égale, on pose la zone au plus près : c'est plus lisible à la
        // table, et ça laisse la créature moins exposée.
        const score = orientation.score - distanceHex(tk, ancre) * 0.4 + bruit(1.2);
        if (score > meilleurScore) { meilleurScore = score; meilleur = { centre: ancre, rotation: orientation.rotation }; }
    });

    if (!meilleur) return null;
    meilleur.score = meilleurScore;
    return meilleur;
};

window.jouerTourMonstre = async function(idMonstre, idCarte) {
    const monstre = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idMonstre);
    const tk = (window.TOKENS_VTT_DATA || {})[idMonstre];

    // Le panneau gauche désigne le lanceur aux yeux du moteur : on le réserve à
    // cette créature pour toute la durée de son tour (cf. panneauVerrouilleParIA
    // dans combat.js).
    window.IA_MONSTRE_ACTEUR = idMonstre;

    // Repos long : il ne se déplace pas et ne lance rien. C'est finDeTourCombat()
    // qui lui rend sa fatigue, exactement comme pour un joueur.
    if (idCarte === "REPOS_LONG") {
        window.TOKEN_SELECTIONNE = idMonstre;
        if (typeof window.afficherDansPanneauGauche === "function") window.afficherDansPanneauGauche(idMonstre);
        if (typeof window.centrerMapSurToken === "function") window.centrerMapSurToken(idMonstre);
        if (tk && typeof window.afficherMessageFlottantHex === "function") {
            window.afficherMessageFlottantHex(tk.q, tk.r, "Reprend son souffle", "#1b6e3a");
        }
        await pause(1500);
        window.IA_MONSTRE_ACTEUR = null;
        if (typeof window.finDeTourCombat === "function") await window.finDeTourCombat(true);
        return;
    }

    const dataCarte = ((window.CACHE_COMPETENCES_GLOBAL || {})[idMonstre] || {})[idCarte];

    // Sans carte lisible ou sans pion, on ne bloque pas le combat : on passe.
    if (!monstre || !dataCarte || !tk) {
        console.warn("IA : tour impossible pour", idMonstre, "— on passe la main.");
        window.IA_MONSTRE_ACTEUR = null;
        if (typeof window.finDeTourCombat === "function") await window.finDeTourCombat(true);
        return;
    }

    const infos = window.analyserCarteMonstre(dataCarte);

    // Le moteur identifie le lanceur par le combattant affiché dans le panneau
    // gauche : on y installe le monstre avant toute chose, comme le ferait un
    // joueur en sélectionnant son personnage.
    window.TOKEN_SELECTIONNE = idMonstre;
    if (typeof window.afficherDansPanneauGauche === "function") window.afficherDansPanneauGauche(idMonstre);
    if (typeof window.centrerMapSurToken === "function") window.centrerMapSurToken(idMonstre);
    // Réserve la fatigue de la carte pour que le déplacement ne la dévore pas.
    window.COUT_COMPETENCE_SELECTIONNEE = infos.fatigue;
    await pause(900);

    // --- 1. Choix de la cible, puis de la case ---
    const cible = window.choisirCibleMonstre(monstre, infos);
    let position = window.choisirPositionMonstre(monstre, cible, infos);

    // Sa carte ne partira pas ce tour-ci — une créature de mêlée dont la proie
    // reste hors d'atteinte après ses trois pas, par exemple. Elle ne doit pas
    // rester plantée : elle marche vers l'adversaire le plus proche et passera
    // son tour. Et comme elle ne lancera rien, inutile de garder la fatigue de
    // la carte en réserve : elle peut aller aussi loin que ses jambes le
    // permettent.
    const tkCiblePrevue = cible ? (window.TOKENS_VTT_DATA || {})[cible.idPersonnage] : null;
    const carteAtteindra = position && tkCiblePrevue
        && distanceHex(position, tkCiblePrevue) <= infos.portee;
    if (!carteAtteindra) {
        const proche = ennemiLePlusProche(monstre);
        if (proche) {
            const repli = window.choisirPositionMonstre(monstre, proche, { ...infos, portee: 1, fatigue: 0 });
            if (repli) {
                position = repli;
                window.COUT_COMPETENCE_SELECTIONNEE = 0;
            }
        }
    }

    // --- 2. Déplacement, par les rails du jeu (opportunités, zones, fatigue) ---
    const immobilise = (monstre.Etats_Alteres || []).some(e => e.nom === "Immobilisation" || e.nom === "Paralysie");
    if (position && !immobilise && (position.q !== tk.q || position.r !== tk.r)) {
        window.CHEMIN_MOUVEMENT = [];
        window.MOUVEMENT_COUT_TOTAL = 0;
        window.CHEMIN_START_NODE = { q: tk.q, r: tk.r };
        window.ajouterEtapeMouvement(position.q, position.r);

        if (window.CHEMIN_MOUVEMENT.length > 0) {
            await window.validerMouvement();
            await pause(1400);
        } else if (typeof window.annulerMouvement === "function") {
            window.annulerMouvement();
        }
    }

    // --- 3. La carte, si la cible est effectivement à portée ---
    const tkApres = (window.TOKENS_VTT_DATA || {})[idMonstre];
    const tkCible = cible ? (window.TOKENS_VTT_DATA || {})[cible.idPersonnage] : null;
    const aPortee = tkApres && tkCible && distanceHex(tkApres, tkCible) <= infos.portee;

    if (aPortee && typeof window.demarrerCiblage === "function") {
        // Ceinture et bretelles : si quoi que ce soit a fait glisser le panneau
        // pendant les temps morts, le sort partirait au nom du mauvais
        // combattant. On le remet sur la créature, et on renonce plutôt que de
        // lancer une carte au nom de quelqu'un d'autre.
        const affiche = () => (window.COMBAT_PERSOS_JOUEUR || [])[window.COMBAT_INDEX_PERSO];
        const mauvaisLanceur = () => !!affiche() && affiche().idPersonnage !== idMonstre;
        if (mauvaisLanceur()) {
            if (typeof window.afficherDansPanneauGauche === "function") window.afficherDansPanneauGauche(idMonstre);
            await pause(200);
        }
        if (mauvaisLanceur()) {
            console.warn("IA : le panneau désigne", affiche().idPersonnage, "et non", idMonstre,
                         "— on ne lance rien plutôt que de frapper au nom de quelqu'un d'autre.");
            window.COUT_COMPETENCE_SELECTIONNEE = 0;
            window.IA_MONSTRE_ACTEUR = null;
            if (typeof window.finDeTourCombat === "function") await window.finDeTourCombat(true);
            return;
        }
        const resolutionsAvant = resolutionsEmises();
        await window.demarrerCiblage(idCarte);
        await pause(700);

        if (window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif) {
            if (window.ETAT_CIBLAGE.isZone) {
                // On choisit l'ancre et l'orientation, on les montre un instant,
                // puis on valide : c'est validerZoneAoE qui calcule les cibles
                // prises dans l'emprise et déclenche la résolution.
                const plan = window.placerZoneMonstre(idMonstre);
                if (plan) {
                    window.ETAT_CIBLAGE.zoneCenterHex = plan.centre;
                    window.ETAT_CIBLAGE.zoneRotationStep = plan.rotation;
                    if (typeof window.actualiserVisuelCiblage === "function") window.actualiserVisuelCiblage();
                    await pause(600);
                    if (typeof window.validerZoneAoE === "function") window.validerZoneAoE();
                    else if (typeof window.declencherResolution === "function") await window.declencherResolution();
                } else if (typeof window.declencherResolution === "function") {
                    await window.declencherResolution();
                }
                await attendreFinResolution(resolutionsAvant);
            } else {
                window.ajouterCibleCiblage(cible.idPersonnage);
                await pause(400);
                if (window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif
                    && typeof window.declencherResolution === "function") {
                    await window.declencherResolution();
                }
                await attendreFinResolution(resolutionsAvant);
            }
            await pause(600);
        }
    } else {
        // Hors de portée après déplacement : le tour s'arrête là, comme prévu.
        if (tkApres && typeof window.afficherMessageFlottantHex === "function") {
            window.afficherMessageFlottantHex(tkApres.q, tkApres.r, "Hors de portée", "#c2a878");
        }
        await pause(900);
    }

    window.COUT_COMPETENCE_SELECTIONNEE = 0;
    window.IA_MONSTRE_ACTEUR = null;
    if (typeof window.finDeTourCombat === "function") await window.finDeTourCombat(true);
};

// =========================================================================
//  9. POINT D'ENTRÉE — appelé à chaque changement de la partie
// =========================================================================

// L'IA n'est réveillée que par les notifications de la base. Or il existe des
// instants où elle ne PEUT pas jouer : une animation de fin de tour est en
// train de se dérouler, un autre poste tient le verrou, les techniques d'une
// créature ne sont pas encore forgées. Si elle se contente alors de renoncer,
// plus personne ne la rappellera — la base ne changera plus — et le combat
// reste figé sur un monstre qui ne fait rien, jusqu'à ce qu'un humain clique
// "fin de tour" à sa place. C'est exactement ce qui arrivait : finDeTourCombat
// lève son drapeau d'animation AVANT d'écrire en base, si bien que la
// notification de la file qui avance tombait toujours pendant l'animation.
// Elle se rappelle donc elle-même tant qu'il lui reste quelque chose à faire.
function programmerRappelIA(delai = 800) {
    if (window.RAPPEL_IA_MONSTRES) return;
    window.RAPPEL_IA_MONSTRES = setTimeout(() => {
        window.RAPPEL_IA_MONSTRES = null;
        window.verifierTourIAMonstres();
    }, delai);
}

window.verifierTourIAMonstres = async function() {
    if (window.IA_MONSTRE_EN_COURS) { programmerRappelIA(); return; }
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT) return;

    const partie = window.PARTIE_DATA || {};
    const phase = partie.Phase_Combat || "Preparation";
    const file = partie.File_Attente_Combat || [];

    // Y a-t-il seulement quelque chose à faire ? Sinon, inutile de se rappeler.
    const estMonstre = (id) => typeof window.estMonstre === "function" && window.estMonstre(id);
    const mort = (id) => typeof window.estCombattantMort === "function" && window.estCombattantMort(id);

    // Un combattant tombé avant son tour laisse son entrée dans la file : elle
    // finit par arriver en tête et plus rien n'avance, puisqu'un mort ne joue pas
    // et que personne ne clique "fin de tour" à sa place. On la passe donc, quel
    // que soit son camp — le verrou garantit qu'un seul poste s'en charge.
    const teteMorte = phase !== "Preparation" && file.length > 0 && mort(file[0].idPersonnage);
    const aLaMain = phase !== "Preparation" && file.length > 0 && !teteMorte && estMonstre(file[0].idPersonnage);
    const aPreparer = phase === "Preparation" && (window.MONSTRES_PARTIE || []).some(m =>
        (partie.Ordre_Initiative || []).includes(m.idPersonnage) &&
        !file.some(f => f.idPersonnage === m.idPersonnage) &&
        !(typeof window.estCombattantMort === "function" && window.estCombattantMort(m.idPersonnage)));
    if (!aLaMain && !aPreparer && !teteMorte) return;

    // Signe de vie : c'est lui qui garde le bouton "fin de tour" éteint pendant
    // qu'un monstre joue. S'il s'éteint (aucun poste ne fait plus tourner l'IA),
    // les humains récupèrent la main au bout de vingt secondes.
    window.IA_DERNIER_SIGNE = Date.now();
    if (typeof window.actualiserBoutonFinTour === "function") window.actualiserBoutonFinTour();

    // Rien tant que les animations en cours n'ont pas fini de se dérouler : on
    // repassera dans un instant.
    if (window.ANIMATION_VTT_EN_COURS || window.ANIMATION_TOUR_EN_COURS
        || window.ANIMATION_MOTEUR_EN_COURS) { programmerRappelIA(); return; }

    // Le drapeau se lève AVANT toute attente : le verrou écrit en base, ce qui
    // déclenche une notification et donc un second appel de cette fonction. Sans
    // ce garde-fou posé tout de suite, le même monstre jouait son tour deux fois.
    window.IA_MONSTRE_EN_COURS = true;
    try {
        if (teteMorte) {
            const enTeteMort = file[0];
            if (await reclamerVerrouIA(`mort|${enTeteMort.idPersonnage}|${enTeteMort.timestamp}`)) {
                console.log("🧠 Tour passé :", enTeteMort.idPersonnage, "est à terre.");
                if (typeof window.finDeTourCombat === "function") await window.finDeTourCombat(true);
            } else {
                programmerRappelIA(DELAI_VERROU_MS / 2);
            }
            return;
        }

        if (phase === "Preparation") {
            await window.preparerCartesMonstres();
            // On repasse systématiquement : soit des créatures attendent encore
            // leurs techniques, soit un autre poste tenait le verrou. Si tout est
            // posé, le prochain passage ne trouvera rien à faire et s'arrêtera là.
            programmerRappelIA(1200);
            return;
        }

        const enTete = file[0];

        // Un seul poste joue ce tour précis : la clé identifie le monstre ET son
        // entrée dans la file, donc deux tours successifs ne se confondent pas.
        const cle = `tour|${enTete.idPersonnage}|${enTete.timestamp}`;
        if (!(await reclamerVerrouIA(cle))) {
            // Un autre poste s'en occupe. S'il n'aboutit pas, le verrou devient
            // périmé et on reprendra la main : on garde donc un œil dessus.
            programmerRappelIA(DELAI_VERROU_MS / 2);
            return;
        }

        await window.jouerTourMonstre(enTete.idPersonnage, enTete.idCarte);

    } catch (e) {
        console.error("IA des monstres :", e);
        // Un incident ne doit jamais figer le combat : on rend la main.
        if (typeof window.finDeTourCombat === "function") {
            await window.finDeTourCombat(true).catch(err => console.error(err));
        }
    } finally {
        window.IA_MONSTRE_EN_COURS = false;
        window.IA_MONSTRE_ACTEUR = null;
    }
};
