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

window.analyserCarteMonstre = function(dataCarte) {
    const infos = { portee: 1, estSoin: false, estZone: false, degats: 0, fatigue: parseInt(dataCarte?.Fatigue) || 0 };
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
        if (act.zoneHexes && act.zoneHexes.length > 0) infos.estZone = true;

        Object.keys(act.mods || {}).forEach(idMod => {
            const mod = cache[idMod];
            if (!mod) return;
            if (mod.Nom === "Distance") {
                const val = parseFloat(String(mod.Valeur).replace(",", ".")) || 0;
                infos.portee = Math.max(infos.portee, 1 + val * act.mods[idMod]);
            }
            if ((mod.Nom || "").toLowerCase().includes("traction")) infos.portee = Math.max(infos.portee, 3);
            if (mod.Nom === "Zone") infos.estZone = true;
        });
    });
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

        if (tkCible) {
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

window.choisirCarteMonstre = function(monstre) {
    const cartes = cartesDuMonstre(monstre);
    if (cartes.length === 0) return null;

    const fatigue = parseInt(monstre.fatigueActuelle);
    const fatigueDispo = isNaN(fatigue) ? 0 : fatigue;
    const abordables = cartes.filter(c => (parseInt(c.data.Fatigue) || 0) <= fatigueDispo);
    if (abordables.length === 0) return null; // épuisé : il ne jouera pas ce tour-ci

    const t = traits(monstre);
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

    let meilleure = null, meilleurScore = -Infinity;
    abordables.forEach(c => {
        const infos = window.analyserCarteMonstre(c.data);
        let score = 0;

        // Une carte utilisable dès ce tour vaut mieux qu'une carte hors d'atteinte.
        const portable = distanceProche <= infos.portee + PAS_MAX_MONSTRE;
        score += portable ? 12 : -20;

        if (infos.estSoin) {
            // Ne soigner que si quelqu'un en a besoin, sinon c'est un tour perdu.
            score += besoinDeSoin * 22 - 12;
        } else {
            score += infos.degats * 1.4;
            // Un caractère sanguinaire cogne fort, un prudent préfère la portée.
            score += t.cibleFaible * infos.degats * 0.5;
            score += t.tientDistance * (infos.portee - 1) * 3;
        }

        // Garder un peu de réserve : une carte qui vide la fatigue empêche de bouger.
        const reste = fatigueDispo - (parseInt(c.data.Fatigue) || 0);
        if (reste < 6) score -= 8;

        score += bruit(6); // deux monstres identiques ne jouent pas la même carte

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

    for (const monstre of aJouer) {
        if (file.some(f => f.idPersonnage === monstre.idPersonnage)) continue;
        const carte = window.choisirCarteMonstre(monstre);
        if (!carte) continue;

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
        console.log(`🧠 ${monstre.prenom || monstre.idPersonnage} prépare « ${carte.data.Nom} » (init ${initiative})`);
    }

    if (!auMoinsUn) return;

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

window.jouerTourMonstre = async function(idMonstre, idCarte) {
    const monstre = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === idMonstre);
    const dataCarte = ((window.CACHE_COMPETENCES_GLOBAL || {})[idMonstre] || {})[idCarte];
    const tk = (window.TOKENS_VTT_DATA || {})[idMonstre];

    // Sans carte lisible ou sans pion, on ne bloque pas le combat : on passe.
    if (!monstre || !dataCarte || !tk) {
        console.warn("IA : tour impossible pour", idMonstre, "— on passe la main.");
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
    const position = window.choisirPositionMonstre(monstre, cible, infos);

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
        await window.demarrerCiblage(idCarte);
        await pause(700);

        if (window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif) {
            if (window.ETAT_CIBLAGE.isZone) {
                // Une zone est déjà centrée sur le lanceur ou sur la case visée :
                // il n'y a plus qu'à confirmer.
                if (typeof window.declencherResolution === "function") await window.declencherResolution();
            } else {
                window.ajouterCibleCiblage(cible.idPersonnage);
                await pause(400);
                if (window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif
                    && typeof window.declencherResolution === "function") {
                    await window.declencherResolution();
                }
            }
            await pause(1600);
        }
    } else {
        // Hors de portée après déplacement : le tour s'arrête là, comme prévu.
        if (tkApres && typeof window.afficherMessageFlottantHex === "function") {
            window.afficherMessageFlottantHex(tkApres.q, tkApres.r, "Hors de portée", "#c2a878");
        }
        await pause(900);
    }

    window.COUT_COMPETENCE_SELECTIONNEE = 0;
    if (typeof window.finDeTourCombat === "function") await window.finDeTourCombat(true);
};

// =========================================================================
//  9. POINT D'ENTRÉE — appelé à chaque changement de la partie
// =========================================================================

window.verifierTourIAMonstres = async function() {
    if (window.IA_MONSTRE_EN_COURS) return;
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT) return;
    // Rien tant que les animations en cours n'ont pas fini de se dérouler.
    if (window.ANIMATION_VTT_EN_COURS || window.ANIMATION_TOUR_EN_COURS) return;

    const partie = window.PARTIE_DATA || {};
    const phase = partie.Phase_Combat || "Preparation";

    try {
        if (phase === "Preparation") {
            window.IA_MONSTRE_EN_COURS = true;
            await window.preparerCartesMonstres();
            return;
        }

        const file = partie.File_Attente_Combat || [];
        if (file.length === 0) return;

        const enTete = file[0];
        if (typeof window.estMonstre !== "function" || !window.estMonstre(enTete.idPersonnage)) return;

        // Un seul poste joue ce tour précis : la clé identifie le monstre ET son
        // entrée dans la file, donc deux tours successifs ne se confondent pas.
        const cle = `tour|${enTete.idPersonnage}|${enTete.timestamp}`;
        if (!(await reclamerVerrouIA(cle))) return;

        window.IA_MONSTRE_EN_COURS = true;
        await window.jouerTourMonstre(enTete.idPersonnage, enTete.idCarte);

    } catch (e) {
        console.error("IA des monstres :", e);
        // Un incident ne doit jamais figer le combat : on rend la main.
        if (typeof window.finDeTourCombat === "function") {
            await window.finDeTourCombat(true).catch(err => console.error(err));
        }
    } finally {
        window.IA_MONSTRE_EN_COURS = false;
    }
};
