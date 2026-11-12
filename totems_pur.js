// =========================================================================
//  IVALIS — LES TOTEMS DU CHAMAN (v368), règles pures
// =========================================================================
//  Nico : « Nouvelle et dernière classe à intégrer : le Chaman. »
//
//  LE TOTEM : une technique de classe réutilisable (CLASSE_TOTEM) ; le Chaman
//  en tient 1 au niveau 1, 2 au niveau 3, 3 au niveau 5 (atout totemsMax).
//  Fatigue 65 au lancement, puis 15 bloqués par totem tant qu'il tient (la
//  réserve de la v361 : pas dépensée, inutilisable) — 60 et 10 au niveau 5
//  (totemsAlleges). Initiative 20, posé à 2 cases au plus, en vue, sur une case
//  libre. 15 PV (20 au niveau 9 : totemPvBonus), 5 manches.
//
//  LE TOTEM EST UN COMBATTANT DU CAMP DU CHAMAN, mais sans tour, comme le
//  leurre de l'Illusion (`estIllusion` : il n'est jamais attendu, ne prend ni
//  ne donne d'attaque d'opportunité, ne compte ni pour la victoire ni pour la
//  défaite, et s'efface quand il tombe — regime_cerveau.js). On peut le frapper,
//  lui poser un bouclier ; on ne peut pas le soigner (sauf le Renforcement
//  chamanique du niveau 9).
//
//  SON EFFET, CHOISI À LA POSE (EFFETS_TOTEM), dans une zone de 1 case autour
//  de lui (2 pour l'Immobilisation et l'Attraction) : il se tente sur qui y
//  entre, et en fin de manche sur qui s'y tient (une fois par manche et par
//  zone, comme toute zone persistante). Les effets néfastes touchent TOUT LE
//  MONDE (Nico) ; « allié seulement » (le soin, la purification) : les alliés
//  du Chaman. Le totem lui-même n'en subit aucun.
//
//  LES LIAISONS : deux totems à 4 cases au plus, sans mur entre eux, sont reliés
//  par un faisceau vert ; qui ENTRE sur une case du faisceau subit les effets
//  des deux totems (pas en fin de manche : il faut le traverser). Avec trois
//  totems, chaque paire reliée a son faisceau. Le +1 de rayon de
//  l'Immobilisation et de l'Attraction ne vaut que pour la zone de leur totem.
//
//  Ce module se branche sur traverserZones (moteur_pur.js) : une zone de totem
//  (`totemEffets`) lui est confiée. Toutes les décisions sont prises chez le
//  cerveau, avec ses dés ; les autres postes rejouent les étapes.
// =========================================================================

import { combattant, murEn } from './combat_etat.js';
import { distanceHex, ligneDeVue, caseLibre, chanceFaceA, resisteA, gardeAnnule, esquiveDe, paradeDe,
         destinationPoussee, destinationTraction, traverserZones, brancherEffetsDeTotem, ETATS_RESISTIBLES,
         ICONE_POISON, DESC_SAIGNEMENT, DESC_IMMOBILISATION } from './moteur_pur.js';
import { resoudrePeur } from './mouvement_pur.js';

const nombre = (v, defaut = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : defaut;
};

export const TECHNIQUE_TOTEM = "CLASSE_TOTEM";
export const TECHNIQUE_RENFORCEMENT = "CLASSE_RENFORCEMENT_CHAMANIQUE";
export const TOTEM = {
    fatigue: 65, reserve: 15,
    fatigueAllegee: 60, reserveAllegee: 10,      // niveau 5
    initiative: 20, pv: 15, portee: 2, duree: 5,
    lienMax: 4, rayon: 1, caracMin: 14, dureeEtats: 2, soin: 3
};
export const NOM_MAINTIEN_TOTEM = "Totem maintenu";

// LE PLATEAU DU CERVEAU (ses murs, ses cases bloquées) : la fin de manche et le
// suivi d'après pas n'en reçoivent pas ; le cerveau le retient ici à chaque
// intention (appliquerIntention) pour les zones et les déplacements des totems.
let plateauRetenu = null;
export function retenirPlateauTotems(p) { if (p) plateauRetenu = p; }

// Les douze effets, par caractéristique (14 au moins pour les choisir — la
// fenêtre de la pose le vérifie : les caractéristiques ne sont pas dans
// l'état du combat).
export const EFFETS_TOTEM = {
    cha_peur:            { carac: "cha", nom: "Peur", chance: 40, genre: "peur" },
    cha_confusion:       { carac: "cha", nom: "Confusion", chance: 40, genre: "etat", etat: "Confusion" },
    cha_immobilisation:  { carac: "cha", nom: "Immobilisation", chance: 40, genre: "etat", etat: "Immobilisation", rayonPlus: 1 },
    cha_poison:          { carac: "cha", nom: "Empoisonnement", chance: 60, genre: "etat", etat: "Empoisonnement" },
    sag_saignement:      { carac: "sag", nom: "Saignement", chance: 60, genre: "etat", etat: "Saignement" },
    sag_purification:    { carac: "sag", nom: "Purification", chance: 60, genre: "purification", allieSeul: true },
    sag_soin:            { carac: "sag", nom: "Soin (3 PV par manche)", chance: 100, genre: "soin", allieSeul: true },
    sag_repousser:       { carac: "sag", nom: "Repousser", chance: 60, genre: "poussee" },
    int_brulure:         { carac: "int", nom: "Brûlure", chance: 60, genre: "etat", etat: "Brûlé" },
    int_gel:             { carac: "int", nom: "Gel", chance: 60, genre: "etat", etat: "Glacé" },
    int_electrifie:      { carac: "int", nom: "Électrifié", chance: 60, genre: "etat", etat: "Électrifié" },
    int_attirer:         { carac: "int", nom: "Attirer", chance: 60, genre: "traction", rayonPlus: 1 }
};
export const CARACS_TOTEM = { cha: "Charisme", sag: "Sagesse", int: "Intelligence" };

// Les états posés par un totem : 2 manches, avec leur dessin quand le jeu en a un.
const ICONE_BRULE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1788181101/IMG_2087_q6chof.png";
const ICONE_GLACE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1788181888/IMG_2089_isgcrs.png";
const DETAILS_ETATS = {
    "Brûlé": { icone: ICONE_BRULE, desc: "-50% de soins reçus, et 8% des PV max en dégâts magiques à chaque fin de manche (défense magique appliquée)." },
    "Glacé": { icone: ICONE_GLACE, desc: "Coût en fatigue du mouvement doublé, et 20% de dégâts physiques subis en plus." },
    "Empoisonnement": { icone: ICONE_POISON, desc: "10% de l'énergie max et 8% des PV max en dégâts bruts (aucune défense), en fin de manche. Pas de cumul.", estPoison: true },
    "Saignement": { desc: DESC_SAIGNEMENT },
    "Immobilisation": { desc: DESC_IMMOBILISATION },
    "Confusion": { desc: "Chaque technique peut partir de travers (sur soi, sur un allié), le faire fuir ou rater." },
    "Électrifié": { desc: "+20% de dégâts magiques subis." }
};

// --- QUI, COMBIEN, COMBIEN ÇA COÛTE ---------------------------------------
export const estTotem = (c) => !!(c && c.totem);
export function totemsDe(etat, idChaman) {
    return Object.keys((etat && etat.combattants) || {}).sort().map(id => etat.combattants[id])
        .filter(c => c && c.totem && c.totem.idMaitre === idChaman && !c.aTerre);
}
export const totemsMaxDe = (c) => Math.max(0, nombre(c && c.atouts && c.atouts.totemsMax));
export const coutTotem = (c) => (c && c.atouts && c.atouts.totemsAlleges)
    ? { fatigue: TOTEM.fatigueAllegee, reserve: TOTEM.reserveAllegee }
    : { fatigue: TOTEM.fatigue, reserve: TOTEM.reserve };
export const pvTotem = (c) => TOTEM.pv + Math.max(0, nombre(c && c.atouts && c.atouts.totemPvBonus));
const reserveTenue = (c) => ((c && c.etats) || []).reduce((t, e) =>
    t + (e && e.maintien && !e.differee && nombre(e.duree, 1) > 0 ? nombre(e.reserve) : 0), 0);
export const energieLibre = (c) => nombre(c && c.fatigue) - reserveTenue(c);

// Une case pour un totem : à 1 ou 2 cases du Chaman, en vue, libre (ni pion,
// ni mur, ni case bloquée).
export function raisonCaseTotem(etat, chaman, hex, plateau) {
    if (!hex || !Number.isInteger(hex.q) || !Number.isInteger(hex.r)) return "case invalide";
    const d = distanceHex(chaman, hex);
    if (d < 1 || d > TOTEM.portee) return `à ${TOTEM.portee} cases au plus (pas sur soi)`;
    if (murEn(etat, hex.q, hex.r)) return "il y a un mur";
    if (!caseLibre(etat, plateau, hex.q, hex.r, null)) return "case occupée ou impraticable";
    if (plateau && !ligneDeVue(plateau, chaman, hex)) return "pas de ligne de vue";
    return null;
}

// Pourquoi ce Chaman ne peut pas poser ce totem (null : il peut).
export function raisonRefusTotem(etat, chaman, spec, plateau) {
    if (!chaman || chaman.aTerre) return "Totem : lanceur absent";
    if (!spec || !EFFETS_TOTEM[spec.effet]) return "Totem : effet inconnu";
    if (!spec.id || !/^TOTEM_[A-Za-z0-9_]+$/.test(String(spec.id))) return "Totem : identité invalide";
    if (combattant(etat, spec.id)) return "Totem : ce totem existe déjà";
    const max = totemsMaxDe(chaman);
    if (totemsDe(etat, chaman.id).length >= max) return `Totem : ${max} totem${max > 1 ? "s" : ""} au plus sur le terrain`;
    const raison = raisonCaseTotem(etat, chaman, { q: nombre(spec.q, NaN), r: nombre(spec.r, NaN) }, plateau);
    if (raison) return "Totem : " + raison;
    const cout = coutTotem(chaman);
    if (cout.fatigue + cout.reserve > energieLibre(chaman)) {
        return `Totem : il faut ${cout.fatigue + cout.reserve} d'énergie (${cout.fatigue} et ${cout.reserve} en réserve), il en reste ${energieLibre(chaman)}`;
    }
    return null;
}

// --- LA POSE ------------------------------------------------------------
export function combattantTotem(chaman, spec) {
    const effet = EFFETS_TOTEM[spec.effet];
    const pv = pvTotem(chaman);
    return {
        id: String(spec.id),
        joueur: (chaman && chaman.joueur) || null,
        camp: (chaman && chaman.camp) || "Allié",
        nom: `Totem (${effet.nom})`,
        estMonstre: false,
        // Sans tour, comme un leurre (voir l'en-tête).
        estIllusion: true,
        totem: { idMaitre: chaman.id, effet: spec.effet, tours: TOTEM.duree },
        personnalite: "", palier: "",
        pv, pvMax: pv, bouclier: 0, bouclierMax: 0, fatigue: 0, fatigueMax: 0,
        q: nombre(spec.q), r: nombre(spec.r),
        etats: [], aTerre: false,
        def: { esquive: 0, parade: 0, physique: 0, magique: 0, critique: 0 },
        atouts: {}, equip: {}, mod: {}, stats: {},
        idCreateur: chaman.id, degatsIllusoires: 0
    };
}

// Pose le totem dans `etat` (déjà validé) : la fatigue, le totem, la réserve
// tenue chez le Chaman, puis les zones et les faisceaux. Mute l'état, rend les étapes.
export function poserTotem(etat, idChaman, spec, plateau) {
    const c = combattant(etat, idChaman);
    const etapes = [];
    if (!c) return etapes;
    const cout = coutTotem(c);
    // (Réutilisable : la liste des techniques jouées ne change pas.)
    etapes.push({ type: "techniqueClasse", acteur: idChaman, idCarte: TECHNIQUE_TOTEM, cible: idChaman,
                  utilisees: [...(c.techniquesUtilisees || [])] });
    c.fatigue = Math.max(0, nombre(c.fatigue) - cout.fatigue);
    etapes.push({ type: "fatigue", cible: idChaman, fatigueApres: c.fatigue });
    const totem = combattantTotem(c, spec);
    etat.combattants[totem.id] = totem;
    etapes.push({ type: "arrivee", combattant: JSON.parse(JSON.stringify(totem)), totem: true });
    c.etats = [...(c.etats || []), {
        nom: NOM_MAINTIEN_TOTEM, maintien: TECHNIQUE_TOTEM, idTotem: totem.id, reserve: cout.reserve,
        duree: TOTEM.duree, sansRelache: true,
        desc: `${cout.reserve} d'énergie bloqués (pas dépensés) tant que le ${totem.nom} tient.`
    }];
    etapes.push({ type: "etats", cible: idChaman, liste: c.etats, pose: NOM_MAINTIEN_TOTEM });
    etapes.push(...majZonesTotems(etat, plateau));
    return etapes;
}

// --- LES ZONES ET LES FAISCEAUX -------------------------------------------
// Les cases d'une droite, de A à B exclus (la même interpolation que la ligne de vue).
export function casesEntre(a, b) {
    const n = distanceHex(a, b);
    const res = [];
    if (!Number.isFinite(n) || n <= 1) return res;
    const lerp = (x, y, t) => x + (y - x) * t;
    const arrondi = (q, r, s) => {
        let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
        const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
        if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
        return { q: rq, r: rr };
    };
    const ca = { q: a.q + 1e-6, r: a.r + 1e-6, s: -a.q - a.r - 2e-6 };
    const cb = { q: b.q + 1e-6, r: b.r + 1e-6, s: -b.q - b.r - 2e-6 };
    for (let i = 1; i < n; i++) res.push(arrondi(lerp(ca.q, cb.q, i / n), lerp(ca.r, cb.r, i / n), lerp(ca.s, cb.s, i / n)));
    return res;
}
// Deux totems se relient : à 4 cases au plus, sans mur (case bloquée, mur de terre) entre eux.
export function totemsRelies(etat, a, b, plateau) {
    if (!a || !b || distanceHex(a, b) > TOTEM.lienMax) return false;
    return casesEntre(a, b).every(h => {
        const dessus = plateau && plateau.etatCase ? (plateau.etatCase(h.q, h.r) || {}) : {};
        return !dessus.bloquee && !murEn(etat, h.q, h.r);
    });
}
const casesAutour = (centre, rayon, plateau) => {
    const res = [];
    for (let dq = -rayon; dq <= rayon; dq++) {
        for (let dr = Math.max(-rayon, -dq - rayon); dr <= Math.min(rayon, -dq + rayon); dr++) {
            if (!dq && !dr) continue;
            const h = { q: centre.q + dq, r: centre.r + dr };
            const dessus = plateau && plateau.etatCase ? (plateau.etatCase(h.q, h.r) || {}) : {};
            if (dessus.bloquee || dessus.supprimee) continue;
            res.push(h);
        }
    }
    return res;
};
// Les zones voulues pour les totems debout : une par totem, une par liaison.
export function zonesVoulues(etat, plateau) {
    const voulues = {};
    const tous = Object.keys((etat && etat.combattants) || {}).sort().map(id => etat.combattants[id])
        .filter(c => c && c.totem && !c.aTerre && c.q !== null && c.q !== undefined);
    tous.forEach(t => {
        const effet = EFFETS_TOTEM[t.totem.effet];
        if (!effet) return;
        const id = `zt_${t.id}`;
        voulues[id] = { id, type: "totem", totem: t.id, permanente: true, idLanceur: t.totem.idMaitre,
                        hexes: casesAutour(t, TOTEM.rayon + nombre(effet.rayonPlus), plateau),
                        totemEffets: [{ effet: t.totem.effet, totem: t.id }], carac: effet.carac };
    });
    for (let i = 0; i < tous.length; i++) {
        for (let j = i + 1; j < tous.length; j++) {
            const a = tous[i], b = tous[j];
            if (a.totem.idMaitre !== b.totem.idMaitre || !totemsRelies(etat, a, b, plateau)) continue;
            const hexes = casesEntre(a, b);
            if (hexes.length === 0) continue;       // côte à côte : rien à traverser
            const id = `zl_${a.id}_${b.id}`;
            voulues[id] = { id, type: "totem-lien", lien: { a: { q: a.q, r: a.r }, b: { q: b.q, r: b.r } },
                            totems: [a.id, b.id], permanente: true, entreeSeule: true, idLanceur: a.totem.idMaitre, hexes,
                            totemEffets: [{ effet: a.totem.effet, totem: a.id }, { effet: b.totem.effet, totem: b.id }] };
        }
    }
    return voulues;
}
// Met les zones des totems à jour (posées, changées, retirées). Mute l'état, rend les étapes.
export function majZonesTotems(etat, plateau) {
    plateau = plateau || plateauRetenu;
    const etapes = [];
    if (!etat.zones) etat.zones = {};
    const voulues = zonesVoulues(etat, plateau);
    Object.keys(etat.zones).sort().forEach(id => {
        if (!/^z[tl]_/.test(id) || voulues[id]) return;
        delete etat.zones[id];
        etapes.push({ type: "zone", id, retiree: true });
    });
    Object.keys(voulues).sort().forEach(id => {
        const avant = etat.zones[id];
        const z = voulues[id];
        const memeForme = avant && JSON.stringify(avant.hexes) === JSON.stringify(z.hexes)
            && JSON.stringify(avant.totemEffets) === JSON.stringify(z.totemEffets);
        if (memeForme) return;
        etat.zones[id] = avant && avant.subies ? { ...z, subies: [...avant.subies] } : z;
        etapes.push({ type: "zone", id, zone: etat.zones[id] });
    });
    return etapes;
}

// --- CE QU'UN TOTEM FAIT À QUI ENTRE (OU RESTE) DANS SA ZONE ---------------
function poserEtat(cible, nom, etapes, zoneId) {
    const details = DETAILS_ETATS[nom] || {};
    const etat = { nom, duree: TOTEM.dureeEtats, desc: details.desc || "", ...(details.icone ? { icone: details.icone } : {}),
                   ...(details.estPoison ? { estPoison: true, tickFait: false } : {}), parTotem: true };
    const existant = (cible.etats || []).find(e => e && e.nom === nom);
    if (existant) {
        existant.duree = Math.max(nombre(existant.duree), etat.duree);
        if (etat.estPoison) existant.tickFait = false;
    } else {
        cible.etats = [...(cible.etats || []), etat];
    }
    etapes.push({ type: "etats", cible: cible.id, pose: nom, liste: cible.etats, zone: zoneId });
}
export function effetsDeTotemSur(etat, id, hex, zone, des, options = {}) {
    const etapes = [];
    const cible = combattant(etat, id);
    if (!cible || cible.aTerre || cible.totem) return etapes;
    const chaman = combattant(etat, zone.idLanceur);
    const campChaman = (chaman && chaman.camp) || "Allié";
    const allie = (cible.camp || "Allié") === campChaman;
    const plateau = options.plateau || plateauRetenu;
    // Le jet de défense, une fois par zone, contre les seuls effets néfastes.
    let evitee = null;
    const esquiver = () => {
        if (evitee !== null) return evitee;
        const esquive = esquiveDe(cible), parade = paradeDe(cible);
        evitee = des.d100() <= Math.max(esquive, parade);
        if (evitee) etapes.push({ type: "esquive", cible: id, acteur: zone.idLanceur || id, parade: parade > esquive, zone: zone.id });
        return evitee;
    };
    (zone.totemEffets || []).forEach(({ effet: idEffet, totem: idTotem }) => {
        const effet = EFFETS_TOTEM[idEffet];
        const totem = combattant(etat, idTotem);
        if (!effet || cible.aTerre) return;
        if (effet.allieSeul && !allie) return;
        if (effet.genre === "soin") {
            const avant = nombre(cible.pv);
            cible.pv = Math.min(nombre(cible.pvMax), avant + TOTEM.soin);
            if (cible.pv !== avant) etapes.push({ type: "soin", cible: id, acteur: idTotem, montant: cible.pv - avant, pvApres: cible.pv, zone: zone.id });
            return;
        }
        if (effet.genre === "purification") {
            const nefaste = (cible.etats || []).find(e => e && !e.maintien && ETATS_RESISTIBLES.includes(e.nom));
            if (!nefaste || des.d100() > effet.chance) return;
            cible.etats = (cible.etats || []).filter(e => e !== nefaste);
            etapes.push({ type: "etats", cible: id, liste: cible.etats, retire: nefaste.nom, zone: zone.id });
            return;
        }
        // Les effets néfastes : la défense d'abord.
        if (esquiver()) return;
        const nomEtat = effet.genre === "etat" ? effet.etat : effet.genre === "peur" ? "Peur" : null;
        const jet = des.d100();
        const chance = nomEtat ? chanceFaceA(cible, nomEtat, effet.chance) : effet.chance;
        if (jet > chance) {
            if (nomEtat && resisteA(cible, nomEtat) && jet <= effet.chance) etapes.push({ type: "etatRate", cible: id, nom: nomEtat, resiste: true });
            return;
        }
        if (nomEtat && gardeAnnule(cible, nomEtat, etapes)) return;
        if (effet.genre === "etat") { poserEtat(cible, effet.etat, etapes, zone.id); return; }
        if (effet.genre === "peur") {
            if (!totem) return;
            etapes.push(...resoudrePeur(etat, idTotem, id, des, plateau));
            return;
        }
        if ((effet.genre === "poussee" || effet.genre === "traction") && totem) {
            const libre = (q, r) => caseLibre(etat, plateau, q, r, id) && !murEn(etat, q, r);
            const vers = effet.genre === "poussee" ? destinationPoussee(totem, cible, 1, libre) : destinationTraction(totem, cible, 1, libre);
            if (!vers) return;
            const de = { q: cible.q, r: cible.r };
            cible.q = vers.q; cible.r = vers.r;
            etapes.push({ type: effet.genre, cible: id, acteur: idTotem, de, vers: { q: vers.q, r: vers.r }, zone: zone.id });
            if (nombre(options.profondeur) < 2) etapes.push(...traverserZones(etat, id, vers, des, { plateau, profondeur: nombre(options.profondeur) + 1 }));
        }
    });
    return etapes;
}
brancherEffetsDeTotem(effetsDeTotemSur);

// --- LA VIE DES TOTEMS -----------------------------------------------------
// Un totem s'en va (tombé, fini, ou sa réserve plus couverte) : il tombe, la
// réserve qu'il tenait chez le Chaman revient, les zones suivent. Mute, rend les étapes.
export function retirerTotem(etat, idTotem, plateau, raison) {
    const etapes = [];
    const t = combattant(etat, idTotem);
    if (!t || !t.totem) return etapes;
    if (!t.aTerre) {
        t.aTerre = true; t.pv = 0;
        etapes.push({ type: "chute", cible: idTotem, acteur: t.totem.idMaitre, totem: true, ...(raison ? { raison } : {}) });
    }
    const c = combattant(etat, t.totem.idMaitre);
    if (c && (c.etats || []).some(e => e && e.idTotem === idTotem)) {
        c.etats = (c.etats || []).filter(e => !(e && e.idTotem === idTotem));
        etapes.push({ type: "etats", cible: c.id, liste: c.etats, relache: TECHNIQUE_TOTEM });
    }
    etapes.push(...majZonesTotems(etat, plateau));
    return etapes;
}
// Après chaque pas : un totem tombé (frappé à zéro) rend sa réserve et ses zones.
export function surveillerTotems(etat, plateau) {
    const etapes = [];
    Object.keys((etat && etat.combattants) || {}).sort().forEach(id => {
        const t = etat.combattants[id];
        if (!t || !t.totem || !t.aTerre) return;
        const c = combattant(etat, t.totem.idMaitre);
        const tient = c && (c.etats || []).some(e => e && e.idTotem === id);
        const zones = Object.keys(etat.zones || {}).some(z => z === `zt_${id}` || (z.startsWith("zl_") && z.includes(id)));
        if (tient || zones) etapes.push(...retirerTotem(etat, id, plateau));
    });
    return etapes;
}
// En fin de manche : une manche de moins pour chaque totem ; à zéro, il s'en va.
// Un totem dont le Chaman ne couvre plus la réserve tombe aussi.
export function vieillirTotems(etat, plateau) {
    const etapes = [];
    Object.keys((etat && etat.combattants) || {}).sort().forEach(id => {
        const t = etat.combattants[id];
        if (!t || !t.totem || t.aTerre) return;
        const reste = Math.max(0, nombre(t.totem.tours, TOTEM.duree) - 1);
        t.totem = { ...t.totem, tours: reste };
        etapes.push({ type: "totem", cible: id, totem: { ...t.totem } });
        if (reste <= 0) etapes.push(...retirerTotem(etat, id, plateau, "fin"));
    });
    // La réserve : du plus récent au plus ancien, chaque totem que l'énergie ne couvre plus tombe.
    const chamans = [...new Set(Object.values(etat.combattants || {}).filter(t => t && t.totem && !t.aTerre).map(t => t.totem.idMaitre))].sort();
    chamans.forEach(idC => {
        const c = combattant(etat, idC);
        if (!c) return;
        const tenus = (c.etats || []).filter(e => e && e.idTotem);
        for (let k = tenus.length - 1; k >= 0 && reserveTenue(c) > nombre(c.fatigue); k--) {
            etapes.push(...retirerTotem(etat, tenus[k].idTotem, plateau, "reserve"));
            etapes.push({ type: "message", cible: idC, acteur: idC, texte: "Totem tombé : réserve plus couverte", couleur: "#e8c46a" });
        }
    });
    return etapes;
}

// LE RENFORCEMENT CHAMANIQUE (niveau 9) : chaque totem debout retrouve tous ses
// PV et ses 5 manches (et la réserve que le Chaman tient pour lui aussi).
export function renforcementChamanique(etat, idChaman) {
    const etapes = [];
    const c = combattant(etat, idChaman);
    totemsDe(etat, idChaman).forEach(t => {
        const avant = nombre(t.pv);
        t.pv = nombre(t.pvMax);
        if (t.pv !== avant) etapes.push({ type: "soin", cible: t.id, acteur: idChaman, montant: t.pv - avant, pvApres: t.pv, renforcement: true });
        t.totem = { ...t.totem, tours: TOTEM.duree };
        etapes.push({ type: "totem", cible: t.id, totem: { ...t.totem }, renforcement: true });
    });
    if (c && (c.etats || []).some(e => e && e.idTotem)) {
        c.etats = (c.etats || []).map(e => e && e.idTotem ? { ...e, duree: TOTEM.duree } : e);
        etapes.push({ type: "etats", cible: idChaman, liste: c.etats });
    }
    return etapes;
}
