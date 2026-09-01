// =========================================================================
//  IVALIS - COMPÉTENCES DES MONSTRES (chapitre 2 du bestiaire)
// =========================================================================
//  Chaque monstre posé sur le plateau reçoit 6 techniques, fabriquées en
//  trois temps :
//
//   1. MIA_AFFINITES (IA) note, de 0 à 10, chaque effet de combat existant
//      selon la créature : un ours ne tire pas de flèches, un nécromancien
//      ne charge pas au bouclier. C'est la "liste invisible" qui pondère
//      tous les tirages suivants.
//
//   2. L'ALGORITHME fabrique les 6 cartes. Chacune vise une tranche de
//      fatigue différente (de la petite frappe à la grosse technique) et
//      suit un patron distinct (frappe, état, zone, terrain, étalement,
//      soutien, contrôle...) pour qu'un même monstre ne répète jamais deux
//      fois la même chose.
//
//   3. MIA_TECHNIQUES (IA) baptise les 6 cartes d'un coup, en lisant ce
//      qu'elles font réellement et qui les lance.
//
//  Les cartes produites sont RIGOUREUSEMENT au format de la Forge des
//  joueurs (Composants.actions[{baseEffetId, count, mods, zoneHexes...}]),
//  parce que c'est ce format que lit le moteur de combat. Les règles de la
//  Forge sont donc réimplémentées ici à l'identique — elles sont privées à
//  competences.js, qui est un point d'entrée et ne peut pas être importé
//  sans en créer une seconde instance. Toute évolution d'une règle là-bas
//  doit être répercutée ici : les endroits concernés sont signalés par
//  "⚖️ règle Forge".
// =========================================================================
import { db } from "./firebase-config.js";
import {
    collection, doc, setDoc, updateDoc, onSnapshot, writeBatch
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const COLLECTION_MONSTRES = "Monstres";

// Les 6 tranches de fatigue, en POURCENTAGE de la fatigue max du monstre.
// En valeurs absolues, un Petit TANK (60 de fatigue) n'aurait jamais pu
// lancer ses trois dernières cartes, et un Boss (220) aurait enchaîné les
// siennes sans effort. En pourcentage, chaque monstre garde 6 cartes
// jouables, de la plus légère à la plus lourde, quel que soit son palier.
const TRANCHES_FATIGUE_PCT = [
    [15, 30], [30, 40], [40, 50], [50, 70], [70, 90], [90, 100]
];

// L'arme conditionne les attaques de base autorisées (⚖️ règle Forge :
// estIncompatibleAvecArme). On la déduit de l'archetype.
const ARME_PAR_ARCHETYPE = {
    "DPS CAC":           "Arme polyvalente",
    "TANK CAC":          "Arme lourde CAC",
    "SOUTIEN":           "Magie",
    "DPS MAGE CAC":      "Magie",
    "DPS DISTANCE":      "Arme légère Distance",
    "DPS MAGE DISTANCE": "Magie"
};

// Combien de cartes de chaque patron on cherche à obtenir, par archetype.
// L'ordre n'a pas d'importance : les patrons sont tirés puis mélangés.
const PATRONS_PAR_ARCHETYPE = {
    "DPS CAC":           ["frappe", "frappe", "etat", "etalement", "zone", "controle"],
    "TANK CAC":          ["frappe", "controle", "controle", "soutien", "etat", "zone"],
    "SOUTIEN":           ["soutien", "soutien", "etat", "frappe", "zone", "controle"],
    "DPS MAGE CAC":      ["frappe", "etat", "zone", "persistance", "etalement", "soutien"],
    "DPS DISTANCE":      ["frappe", "frappe", "etat", "zone", "etalement", "controle"],
    "DPS MAGE DISTANCE": ["frappe", "zone", "persistance", "etat", "etalement", "soutien"]
};

// Mots-clés qui identifient chaque famille d'effets dans la base. On ne
// travaille jamais sur des identifiants en dur : la base est éditable par
// Nico à tout moment, donc tout est reconnu par le NOM de l'effet, comme
// le fait déjà le moteur de combat.
const MOTS_CLES = {
    attaque:     ["attaque", "mot de pouvoir", "mots de pouvoir"],
    soin:        ["soin", "guérison", "guerison", "bouclier", "purification", "absorption"],
    zone:        ["zone"],
    persistance: ["persistance"],
    etalement:   ["dot", "étalement", "etalement"],
    distance:    ["distance"],
    // "peur" et "provocation" sont des altérations mentales au même titre que les
    // autres : sans elles dans cette liste, elles échappaient à la limite de deux
    // altérations par carte et se retrouvaient, étant bon marché et sans
    // contrainte, sur près d'une carte sur deux.
    controle:    ["poussée", "poussee", "traction", "immobilisation", "bond", "paralysie", "étourdi", "etourdi", "peur", "provocation"],
    etat:        ["brûl", "brul", "glac", "électri", "electri", "poison", "empoison", "confusion", "saignement", "malédiction", "malediction"]
};

const contient = (nom, liste) => {
    const n = (nom || "").toLowerCase();
    return liste.some(mot => n.includes(mot));
};

// ⚖️ règle Forge : parseFrenchFloat — la base stocke "1,5" et non "1.5".
function nombreFr(val) {
    if (val === undefined || val === null || val === "") return 0;
    const n = parseFloat(String(val).replace(",", "."));
    return isNaN(n) ? 0 : n;
}

// ⚖️ règle Forge : estUneAttaqueDeBase — une seule attaque de base par carte.
function estAttaqueDeBase(nom) {
    const n = (nom || "").toLowerCase();
    return n.includes("attaque magique") || n.includes("attaque légère") || n.includes("attaque legere")
        || n.includes("attaque lourde") || n.includes("mots de pouvoir") || n.includes("mot de pouvoir");
}

// ⚖️ règle Forge : getMaxStacks — combien de fois un effet peut être empilé.
function maxEmpilements(effet) {
    const pBase = nombreFr(effet.Pourcent_Base);
    const pMax  = nombreFr(effet.Pourcent_Max);
    const val   = nombreFr(effet.Valeur);

    if (pBase > 0 && pMax > 0) return Math.floor(pMax / pBase);
    if (val > 0 && pMax > 0)   return Math.floor(pMax / val);
    if (pMax > 0 && pBase === 0 && val === 0) return Math.floor(pMax);

    if (["Persistance terrain", "Durée +", "Durée étalement dégâts", "DOT", "Illusion"].includes(effet.Nom)) return 1;
    if (effet.Nom === "Initiative +") return 6;
    if (effet.Nom === "Zone") return 15;
    return 25;
}

// ⚖️ règle Forge : estIncompatibleAvecArme.
function incompatibleAvecArme(nomEffet, arme) {
    if (!arme || !nomEffet) return false;
    const nom = nomEffet.toLowerCase();
    const legere = nom.includes("attaque légère") || nom.includes("attaque legere");

    if (arme === "Sans arme / Arme rp")  return nom.includes("attaque magique") || nom.includes("mot de pouvoir") || nom.includes("mots de pouvoir") || legere;
    if (arme === "Arme légère CAC")      return nom.includes("attaque lourde");
    if (arme === "Arme lourde CAC")      return legere;
    if (arme === "Arme polyvalente")     return legere;
    if (arme === "Arme légère Distance") return nom.includes("attaque lourde");
    if (arme === "Magie")                return nom.includes("attaque lourde") || legere;
    return false;
}

// ⚖️ règle Forge : un effet est une RACINE (posable seul) s'il est marqué
// "Action/Global" ; sinon c'est un modificateur, rangé dans l'un des quatre
// tiroirs Spatial / Physique / Magique / Duree.
const SLOTS_MODS = ["Spatial", "Physique", "Magique", "Duree"];

function estRacine(effet) {
    return effet.Type_Mecanique === "Action/Global" || effet.Type_Mecanique_2 === "Action/Global";
}
function estModificateur(effet) {
    return SLOTS_MODS.some(s => effet.Type_Mecanique === s || effet.Type_Mecanique_2 === s);
}
function tagDe(effet) {
    const m = effet.Modificateur;
    return (m && m !== "AUCUN") ? m.toUpperCase() : null;
}
function coutPC(effet) {
    return nombreFr(effet.Cout_PT);
}

// Lit la base des effets telle qu'elle est en mémoire, en normalisant les
// vieux libellés exactement comme le fait la Forge.
const TYPES_HERITES = {
    Degats: "Action/Global", Soin: "Action/Global", Defense: "Action/Global", Special: "Action/Global",
    Action: "Action/Global", Global: "Action/Global",
    Alteration: "Magique", Deplacement: "Spatial", Portee: "Spatial", Bonus: "Action/Global"
};
function normaliserType(type, defaut = "Aucun") {
    if (!type) return defaut;
    return TYPES_HERITES[type] || type;
}

window.paletteEffetsMonstres = function() {
    const cache = window.EFFETS_BDD_CACHE || {};
    return Object.keys(cache).map(id => {
        const d = cache[id];
        return {
            id,
            ...d,
            Type_Mecanique:   normaliserType(d.Type_Mecanique, "Action/Global"),
            Type_Mecanique_2: d.Type_Mecanique_2 ? normaliserType(d.Type_Mecanique_2) : "Aucun"
        };
    });
};

// =========================================================================
//  1. MIA_AFFINITES — quels effets cette créature peut-elle utiliser ?
// =========================================================================
//  Renvoie une note de 0 à 10 par NOM d'effet. 0 = la créature ne fera
//  jamais ça, 10 = c'est sa signature. L'algorithme s'en sert comme poids
//  de tirage : un effet à 0 n'est jamais pioché.
// =========================================================================

// Repli sans IA : notes déduites de l'archetype par mots-clés. Volontairement
// grossier, mais il garantit des techniques cohérentes même sans clé Gemini.
function affinitesParDefaut(monstre) {
    const arch = monstre.archetype || "";
    const cac = arch.includes("CAC") || arch.includes("TANK");
    const distance = arch.includes("DISTANCE");
    const magique = arch.includes("MAGE") || arch === "SOUTIEN";
    const soutien = arch === "SOUTIEN";
    const tank = arch.includes("TANK");

    const notes = {};
    window.paletteEffetsMonstres().forEach(eff => {
        const nom = eff.Nom || "";
        let note = 5;

        if (contient(nom, MOTS_CLES.distance))    note = distance ? 9 : (cac ? 0 : 4);
        // Une bête ou un guerrier ne lance pas d'incantation : sans cette mise à
        // zéro, un ours finissait par sortir des "Mots de pouvoir".
        if (nom.toLowerCase().includes("attaque magique") || contient(nom, ["mot de pouvoir", "mots de pouvoir"]))
                                                  note = magique ? 9 : 0;
        if (nom.toLowerCase().includes("attaque lourde")) note = tank ? 9 : (cac ? 7 : 0);
        if (contient(nom, ["attaque légère", "attaque legere"])) note = distance ? 8 : (cac ? 6 : 2);
        if (contient(nom, MOTS_CLES.soin))        note = soutien ? 9 : (tank ? 5 : 2);
        if (contient(nom, MOTS_CLES.controle))    note = tank ? 8 : 5;
        if (contient(nom, MOTS_CLES.persistance)) note = magique ? 8 : 2;

        // Les altérations élémentaires (brûlé, glacé, électrifié) supposent une
        // source magique : une bête ou un guerrier n'électrocute personne. Le
        // poison et le saignement, eux, restent crédibles pour un fauve.
        if (contient(nom, ["brûl", "brul", "glac", "électri", "electri"])) note = magique ? 8 : 0;
        if (contient(nom, ["poison", "empoison", "saignement"]))           note = magique ? 7 : 6;
        if (contient(nom, ["confusion", "malédiction", "malediction"]))    note = magique ? 8 : 1;
        if (contient(nom, ["paralysie"]))                                  note = magique ? 7 : 2;
        // Garde-fou général : tout effet qui se dit "magique" reste l'apanage des
        // lanceurs de sorts. Sans cela, un ours se mettait à faire de la
        // "Traction magique", qui est bien un effet de contrôle mais d'origine
        // arcanique.
        if (nom.toLowerCase().includes("magique") && !magique)             note = Math.min(note, 1);
        if (nom.toLowerCase().includes("illusion")) note = magique ? 6 : 0;

        notes[nom] = note;
    });
    return notes;
}

window.determinerAffinitesMonstre = async function(monstre) {
    const parDefaut = affinitesParDefaut(monstre);
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    const palette = window.paletteEffetsMonstres();
    if (!cleGemini || palette.length === 0) return parDefaut;

    // On n'envoie que le nom et une description courte : l'IA juge la
    // plausibilité thématique, pas l'équilibrage (c'est le rôle de l'algo).
    const listeEffets = palette
        .map(e => `- ${e.Nom}${e.Effet_Base ? " : " + String(e.Effet_Base).replace(/<[^>]*>/g, "").slice(0, 90) : ""}`)
        .join("\n");

    const promptSysteme = `Tu es MIA_AFFINITES, l'IA qui décide de ce dont une créature est CAPABLE dans un jeu de rôle médiéval-fantastique.

On te donne une créature et la liste de tous les effets de combat du jeu. Pour chaque effet, tu donnes une note de 0 à 10 :
- 0 = impossible pour cette créature (un ours ne tire pas de flèches, un squelette ne soigne pas).
- 1 à 4 = possible mais rare, hors de son style.
- 5 à 7 = plausible.
- 8 à 10 = c'est typiquement ce que fait cette créature.

Juge d'abord d'après son NOM (un ours, un mage noir et un archer n'ont rien en commun), puis d'après son rôle et sa puissance.
Sois tranché : mets vraiment des 0 à ce qui serait absurde, et vraiment des 9-10 à sa signature. Note TOUS les effets de la liste.`;

    const outils = [{
        functionDeclarations: [{
            name: "noterLesEffets",
            description: "Donne la note d'affinité de chaque effet pour cette créature.",
            parameters: {
                type: "OBJECT",
                properties: {
                    notes: {
                        type: "ARRAY",
                        description: "Une entrée par effet de la liste",
                        items: {
                            type: "OBJECT",
                            properties: {
                                effet: { type: "STRING", description: "Le nom exact de l'effet" },
                                note:  { type: "INTEGER", description: "Affinité de 0 à 10" }
                            },
                            required: ["effet", "note"]
                        }
                    }
                },
                required: ["notes"]
            }
        }]
    }];

    const description = `Créature : ${monstre.nom}
Rôle : ${monstre.archetype}
Puissance : ${monstre.palier}

Effets de combat existants :
${listeEffets}`;

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGemini}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: promptSysteme }] },
                contents: [{ role: "user", parts: [{ text: description }] }],
                tools: outils,
                toolConfig: { functionCallingConfig: { mode: "ANY" } }
            })
        });

        const data = await res.json();
        const appel = data.candidates?.[0]?.content?.parts?.find(p => p.functionCall)?.functionCall;
        const notes = appel?.args?.notes;
        if (!Array.isArray(notes) || notes.length === 0) return parDefaut;

        // On part du repli et on écrase ce que l'IA a effectivement noté : un
        // effet oublié garde ainsi une note plausible au lieu de tomber à 0 et
        // de disparaître des tirages.
        const resultat = { ...parDefaut };
        notes.forEach(n => {
            const nom = (n.effet || "").trim();
            if (!nom) return;
            const exact = palette.find(e => (e.Nom || "").trim().toLowerCase() === nom.toLowerCase());
            if (exact) resultat[exact.Nom] = Math.max(0, Math.min(10, parseInt(n.note) || 0));
        });
        return resultat;

    } catch (e) {
        console.error("[MIA_AFFINITES] Notation impossible, repli sur les affinités par défaut :", e);
        return parDefaut;
    }
};

// =========================================================================
//  2. L'ALGORITHME DE FABRICATION DES TECHNIQUES
// =========================================================================

const entre = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

// Les "bouchons" : des effets sans couleur, sans tag et bon marché, que
// l'algorithme finit par choisir par défaut quand il cherche à dépenser son
// budget. Laissés libres, "Durée +" atterrissait sur deux cartes sur trois, et
// "Initiative +" sur 42 % des grosses cartes — au point de les rendre PLUS
// rapides que les petites frappes, soit exactement l'inverse du principe
// (une technique lourde doit être lente). On ne les emploie qu'en dernier
// recours, et sans les empiler.
const PLAFOND_BOUCHON = 2;
function estEffetBouchon(effet) {
    const n = (effet.Nom || "").toLowerCase();
    return n.startsWith("initiative +");
}

// ⚖️ règle Forge : "Durée +" est le SEUL effet que les menus de modificateurs
// excluent (renderSelectMenu : `e.Nom !== "Durée +"`). Il ne se pose jamais
// comme un mod ordinaire : il s'applique via les compteurs ⏳ (baseDuree pour
// l'action, modsDuree pour un sous-effet), au tarif de son Cout_PT par tour.
// Le poser dans `mods` ferait payer sa fatigue à la carte pour un effet que le
// moteur de combat ne reconnaîtrait même pas — c'est ainsi que le fait une
// vraie carte de joueur : { mods: {EFF_BRULE: 6}, modsDuree: {EFF_BRULE: 1} }.
function estDureePlus(effet) {
    const n = (effet.Nom || "").toLowerCase().trim();
    return n === "durée +" || n === "duree +";
}

// Tirage pondéré : un effet noté 9 sort neuf fois plus souvent qu'un noté 1,
// et un effet noté 0 ne sort jamais.
function tirerPondere(candidats, poidsDe) {
    const pesés = candidats.map(c => ({ c, p: Math.max(0, poidsDe(c)) })).filter(x => x.p > 0);
    if (pesés.length === 0) return null;
    const total = pesés.reduce((s, x) => s + x.p, 0);
    let tirage = Math.random() * total;
    for (const x of pesés) {
        tirage -= x.p;
        if (tirage <= 0) return x.c;
    }
    return pesés[pesés.length - 1].c;
}

// Une zone cohérente : une tache d'hexagones collés les uns aux autres et
// touchant le lanceur, exactement ce que l'éditeur de zone impose au joueur
// (⚖️ règle Forge : isConnectedToCenter). Sans mod Distance, la zone doit
// partir du centre (0,0), qui est la case du lanceur et n'est jamais incluse.
const VOISINS_HEX = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
];

function genererZoneHexes(taille) {
    const choisis = [];
    const cle = h => `${h.q},${h.r}`;
    const pris = new Set(["0,0"]); // la case du lanceur ne fait pas partie de la zone

    // On part des six cases autour du lanceur, puis on étend de proche en
    // proche : la tache reste toujours connectée au centre.
    let frontiere = VOISINS_HEX.map(v => ({ q: v.q, r: v.r }));

    while (choisis.length < taille && frontiere.length > 0) {
        const i = Math.floor(Math.random() * frontiere.length);
        const hex = frontiere.splice(i, 1)[0];
        if (pris.has(cle(hex))) continue;

        pris.add(cle(hex));
        choisis.push(hex);
        VOISINS_HEX.forEach(v => {
            const voisin = { q: hex.q + v.q, r: hex.r + v.r };
            if (!pris.has(cle(voisin))) frontiere.push(voisin);
        });
    }
    return choisis;
}

// -------------------------------------------------------------------------
//  Le chantier d'une carte : on y pose une action de base, puis des mods,
//  en refusant tout ce qui violerait une règle de la Forge.
// -------------------------------------------------------------------------
function nouveauChantier(arme, rang) {
    // `rang` = la tranche visée, de 0 (petite frappe) à 5 (technique ultime).
    // Il pilote la RICHESSE de la carte : combien de mods différents elle a le
    // droit de porter, et jusqu'où un même effet peut être empilé. Sans ce
    // garde-fou, tout le budget des grosses cartes partait en empilements
    // absurdes ("Attaque Magique ×12") au lieu de combiner des effets.
    const r = Math.max(0, Math.min(5, rang || 0));
    return {
        arme,
        actions: [],
        tags: new Set(),
        maxModsDistincts: 2 + Math.round(r * 0.6),   // 2 mods en tranche 1, 5 en tranche 6
        plafondEmpilement: 3 + Math.round(r * 0.6)   // ×3 en tranche 1, ×6 en tranche 6
    };
}

function chantierContientMotCle(chantier, motCle) {
    return chantier.actions.some(act =>
        (act.baseEffet.Nom || "").toLowerCase().includes(motCle) ||
        act.modsEffets.some(m => (m.effet.Nom || "").toLowerCase().includes(motCle))
    );
}
function chantierAUneAttaque(chantier) {
    return chantier.actions.some(act => estAttaqueDeBase(act.baseEffet.Nom));
}

// ⚖️ règles Forge réunies : le seul point qui décide si un effet a le droit
// d'être posé sur la carte en cours de fabrication.
function effetAutorise(chantier, effet, commeMod) {
    const nom = (effet.Nom || "").toLowerCase();

    // Deux caractéristiques différentes au maximum sur une carte.
    const tag = tagDe(effet);
    if (tag && !chantier.tags.has(tag) && chantier.tags.size >= 2) return false;

    // Une seule attaque de base par carte.
    if (estAttaqueDeBase(effet.Nom) && chantierAUneAttaque(chantier)) return false;

    // L'arme du monstre interdit certaines attaques.
    if (incompatibleAvecArme(effet.Nom, chantier.arme)) return false;

    // Traction (portée fixe) et Distance ne peuvent pas cohabiter.
    if (nom.includes("traction") && chantierContientMotCle(chantier, "distance")) return false;
    if (nom === "distance" && chantierContientMotCle(chantier, "traction")) return false;

    // L'empoisonnement a besoin d'une source de dégâts pour exister.
    if (nom.includes("poison") && !chantierAUneAttaque(chantier)) return false;

    // Poussée est incompatible avec les zones et l'étalement.
    const incompatiblesPoussee = ["persistance terrain", "zone", "durée étalement dégâts"];
    if (chantierContientMotCle(chantier, "poussée") || chantierContientMotCle(chantier, "poussee")) {
        if (incompatiblesPoussee.includes(nom.trim())) return false;
    }
    if (nom.includes("poussée") || nom.includes("poussee")) {
        if (chantier.actions.some(act => act.modsEffets.some(m =>
            incompatiblesPoussee.includes((m.effet.Nom || "").toLowerCase().trim())))) return false;
    }

    // Une illusion ne peut pas porter de zone.
    if (commeMod && nom === "zone" && chantierContientMotCle(chantier, "illusion")) return false;

    // Un même effet ne peut figurer qu'UNE SEULE FOIS sur une carte, quel que
    // soit son rôle. Sans cette règle on obtenait des aberrations à deux titres :
    // le même effet posé en trois actions séparées ("Bond ×5 / Bond ×5 / Bond
    // ×4"), et — parce que plusieurs effets de la base sont à la fois racine et
    // modificateur (Poussée, Traction magique) — le même effet compté une fois
    // comme mod et une fois comme socle sur la même carte. S'il en faut
    // davantage, on approfondit l'exemplaire déjà en place.
    const dejaSurLaCarte = chantier.actions.some(act =>
        act.baseEffet.Nom === effet.Nom ||
        act.modsEffets.some(m => m.effet.Nom === effet.Nom));
    if (dejaSurLaCarte) {
        // Seule exception : re-piocher le mod déjà posé sur l'action courante,
        // ce qui revient simplement à l'empiler d'un cran de plus.
        const action = chantier.actions[chantier.actions.length - 1];
        const estLeMemeModIci = commeMod && action &&
            action.modsEffets.some(m => m.effet.Nom === effet.Nom);
        if (!estLeMemeModIci) return false;
    }

    // --- Cohérence thématique (propre aux monstres, pas une règle de la Forge) ---
    // Une carte de soin/protection ne doit pas porter d'altération offensive :
    // ses cibles sont les alliés, et "Soin + Électrifié + Paralysie" reviendrait
    // à soigner quelqu'un en l'électrocutant. La règle ne s'applique qu'aux
    // cartes SANS attaque : une carte de pur contrôle, elle, reste légitime.
    if (commeMod && !chantierAUneAttaque(chantier)) {
        const carteDeSoutien = chantier.actions.some(act => contient(act.baseEffet.Nom, MOTS_CLES.soin));
        const modOffensif = contient(nom, MOTS_CLES.etat) || contient(nom, MOTS_CLES.controle);
        if (carteDeSoutien && modOffensif) return false;
    }

    // Sans ces garde-fous, l'algorithme dépense son budget en empilant des
    // familles d'effets sans rapport et produit des cartes fourre-tout du genre
    // "brûle + gèle + électrocute + empoisonne + paralyse". Une vraie technique
    // a UNE signature, pas sept.
    if (commeMod) {
        const familleElementaire = ["brûl", "brul", "glac", "électri", "electri"];
        const estElementaire = contient(nom, familleElementaire);
        if (estElementaire) {
            // Un seul élément par carte : on ne brûle pas ET ne gèle pas.
            const dejaElementaire = chantier.actions.some(act =>
                act.modsEffets.some(m => contient(m.effet.Nom, familleElementaire) &&
                                         !(m.effet.Nom || "").toLowerCase().includes(nom)));
            if (dejaElementaire) return false;
        }

        // Deux altérations d'état différentes au maximum : au-delà, la carte
        // devient illisible et ne raconte plus rien.
        if (contient(nom, MOTS_CLES.etat) || contient(nom, MOTS_CLES.controle)) {
            const nbEtats = new Set();
            chantier.actions.forEach(act => act.modsEffets.forEach(m => {
                if (contient(m.effet.Nom, MOTS_CLES.etat) || contient(m.effet.Nom, MOTS_CLES.controle)) {
                    nbEtats.add((m.effet.Nom || "").toLowerCase());
                }
            }));
            if (!nbEtats.has(nom) && nbEtats.size >= 2) return false;
        }

        // Nombre de modificateurs DIFFÉRENTS autorisés sur une action. Il monte
        // avec la tranche : une petite frappe porte un ou deux mods, une grosse
        // technique en combine davantage. C'est ce qui fait qu'une carte chère
        // est réellement plus RICHE, et pas seulement plus empilée.
        const action = chantier.actions[chantier.actions.length - 1];
        const plafond = chantier.maxModsDistincts || 4;
        if (action && action.modsEffets.length >= plafond &&
            !action.modsEffets.some(m => (m.effet.Nom || "").toLowerCase() === nom)) {
            return false;
        }
    }

    return true;
}

function poserAction(chantier, effetBase, count) {
    const act = {
        idInst: "ACT_" + Math.random().toString(36).substring(2, 9),
        baseEffet: effetBase,
        count: Math.max(1, count || 1),
        modsEffets: [],     // [{ effet, count, duree }]
        zoneHexes: [],
        baseDuree: 0
    };
    chantier.actions.push(act);
    const tag = tagDe(effetBase);
    if (tag) chantier.tags.add(tag);
    return act;
}

function poserMod(chantier, act, effetMod, count) {
    const existant = act.modsEffets.find(m => m.effet.id === effetMod.id);
    if (existant) {
        existant.count = Math.min(maxEmpilements(effetMod), existant.count + (count || 1));
    } else {
        act.modsEffets.push({ effet: effetMod, count: Math.max(1, count || 1), duree: 0 });
    }
    const tag = tagDe(effetMod);
    if (tag) chantier.tags.add(tag);
}

// ⚖️ règle Forge : rafraichirForge — le coût en PC d'une carte, à l'identique.
// C'est lui qui détermine la fatigue (fatigue = plancher(PC × 5)), donc il ne
// doit jamais diverger de la Forge, sinon les cartes des monstres coûteraient
// autre chose que ce qu'elles affichent.
function coutPCChantier(chantier, palette) {
    const effetDureePlus = palette.find(e => e.Nom === "Durée +");
    const coutDureePlus = effetDureePlus ? coutPC(effetDureePlus) : 5;

    let totalPC = 0;
    chantier.actions.forEach(act => {
        let coutBase = coutPC(act.baseEffet) * act.count;
        let coutDuree = (act.baseDuree || 0) * coutDureePlus;
        let coutMods = 0;
        let aEtalement = false;

        act.modsEffets.forEach(m => {
            const nom = m.effet.Nom || "";
            if (nom === "Zone") {
                // Le premier hexagone est offert.
                const taille = act.zoneHexes.length > 0 ? act.zoneHexes.length : m.count;
                coutMods += coutPC(m.effet) * Math.max(0, taille - 1);
            } else if (nom === "DOT" || nom === "Durée étalement dégâts") {
                aEtalement = true;
            } else {
                coutMods += coutPC(m.effet) * m.count;
            }
            coutMods += (m.duree || 0) * coutDureePlus;
        });

        let coutAction = coutBase + coutDuree + coutMods;
        if (aEtalement) coutAction /= 1.2;
        totalPC += coutAction;
    });
    return totalPC;
}

// ⚖️ règle Forge : initiative = ce qui reste de 100 après la fatigue, plus les
// bonus d'Initiative + et le remboursement de l'Absorption.
function initiativeChantier(chantier, palette, fatigue) {
    let bonus = 0;
    chantier.actions.forEach(act => {
        const nomBase = (act.baseEffet.Nom || "").toLowerCase();
        if (act.baseEffet.Nom === "Initiative +") {
            bonus += act.count * ((nombreFr(act.baseEffet.Valeur) || 8) + coutPC(act.baseEffet) * 5);
        }
        if (nomBase.includes("absorption")) bonus += coutPC(act.baseEffet) * act.count * 5;

        act.modsEffets.forEach(m => {
            const nomMod = (m.effet.Nom || "").toLowerCase();
            if (m.effet.Nom === "Initiative +") {
                bonus += m.count * ((nombreFr(m.effet.Valeur) || 8) + coutPC(m.effet) * 5);
            }
            if (nomMod.includes("absorption")) bonus += coutPC(m.effet) * m.count * 5;
        });
    });
    return Math.max(0, 100 - fatigue) + bonus;
}

const fatigueDe = (chantier, palette) => Math.floor(coutPCChantier(chantier, palette) * 5);

// -------------------------------------------------------------------------
//  Fabrication d'UNE carte : un patron impose le squelette, puis on remplit
//  jusqu'à tomber dans la tranche de fatigue visée.
// -------------------------------------------------------------------------
function fabriquerCarte(monstre, affinites, patron, tranche, palette, rang) {
    const arme = ARME_PAR_ARCHETYPE[monstre.archetype] || "Arme polyvalente";
    const fatigueMax = parseInt(monstre.fatigueMax) || 100;
    const fatigueMin = Math.max(1, Math.round(tranche[0] / 100 * fatigueMax));
    const fatigueCible = Math.max(fatigueMin, Math.round(entre(tranche[0], tranche[1]) / 100 * fatigueMax));
    const fatiguePlafond = Math.round(tranche[1] / 100 * fatigueMax);

    const note = eff => (affinites[eff.Nom] !== undefined ? affinites[eff.Nom] : 5);
    const chantier = nouveauChantier(arme, rang);

    const racines = palette.filter(e => estRacine(e));
    const mods    = palette.filter(e => estModificateur(e) && !estDureePlus(e));
    const effetDureePlus = palette.find(e => estDureePlus(e));
    const coutDureePlus = effetDureePlus ? coutPC(effetDureePlus) : 5;
    // ⚖️ règle Forge : le compteur ⏳ est plafonné par getMaxStacks("Durée +").
    const maxDuree = effetDureePlus ? maxEmpilements(effetDureePlus) : 1;

    // --- 1. L'action de base, choisie selon le patron ---
    const veutSoin = patron === "soutien";
    let candidatsBase = racines.filter(e => {
        if (!effetAutorise(chantier, e, false)) return false;
        const estSoin = contient(e.Nom, MOTS_CLES.soin);
        const estIllusion = (e.Nom || "").toLowerCase().includes("illusion");
        if (estIllusion) return false;             // trop particulier pour une génération automatique
        return veutSoin ? estSoin : !estSoin;
    });
    // Les patrons offensifs veulent une vraie attaque comme socle.
    if (!veutSoin) {
        const attaques = candidatsBase.filter(e => estAttaqueDeBase(e.Nom));
        if (attaques.length > 0) candidatsBase = attaques;
    }
    if (candidatsBase.length === 0) candidatsBase = racines.filter(e => effetAutorise(chantier, e, false));
    if (candidatsBase.length === 0) return null;

    // Un socle dont le coût seul dépasse déjà le plafond de la tranche condamne
    // la carte d'avance : "Bouclier magique" vaut à lui seul 50 de fatigue, ce
    // qui déborde une tranche basse. On ne garde que les socles abordables —
    // sauf si aucun ne l'est, auquel cas on laisse faire et l'ajustement final
    // s'en chargera.
    const abordables = candidatsBase.filter(e => coutPC(e) * 5 <= fatiguePlafond);
    if (abordables.length > 0) candidatsBase = abordables;

    const effetBase = tirerPondere(candidatsBase, note) || candidatsBase[0];
    const action = poserAction(chantier, effetBase, 1);

    // --- 2. Les mods imposés par le patron ---
    const trouverMod = (motsCles) => {
        const trouves = mods.filter(m => contient(m.Nom, motsCles) && effetAutorise(chantier, m, true));
        return tirerPondere(trouves, note);
    };

    // Un mod de patron ne doit jamais faire sauter le plafond de la tranche :
    // une petite créature ne peut pas s'offrir une persistance de terrain sur
    // sa carte la moins chère. On pose, on vérifie, on retire si ça déborde.
    const poserSiTientDansLaTranche = (mod, count) => {
        if (!mod) return false;
        poserMod(chantier, action, mod, count);
        if (fatigueDe(chantier, palette) > fatiguePlafond) {
            action.modsEffets = action.modsEffets.filter(x => x.effet.id !== mod.id);
            return false;
        }
        return true;
    };

    if (patron === "zone" || patron === "persistance") {
        const modZone = trouverMod(MOTS_CLES.zone);
        if (modZone) {
            // Taille TIRÉE AU SORT autour d'une valeur qui monte avec la tranche,
            // puis rabotée si la tranche ne suit pas. Une taille simplement
            // "poussée au maximum" donnait des zones toutes identiques (6 hex à
            // chaque fois) : c'est le contraire d'organique.
            const ampleur = 2 + Math.round((rang || 0) * 0.8);        // 2 → 6 selon la tranche
            let taille = Math.max(2, Math.min(12, entre(ampleur - 1, ampleur + 3)));

            while (taille >= 2) {
                action.modsEffets = action.modsEffets.filter(x => x.effet.id !== modZone.id);
                action.zoneHexes = genererZoneHexes(taille);
                poserMod(chantier, action, modZone, action.zoneHexes.length);
                if (fatigueDe(chantier, palette) <= fatiguePlafond) break;
                taille--;
            }
            if (taille < 2) {
                action.modsEffets = action.modsEffets.filter(x => x.effet.id !== modZone.id);
                action.zoneHexes = [];
            }
        }
    }
    if (patron === "persistance") poserSiTientDansLaTranche(trouverMod(MOTS_CLES.persistance), 1);
    if (patron === "etalement")   poserSiTientDansLaTranche(trouverMod(MOTS_CLES.etalement), 1);
    if (patron === "etat")        poserSiTientDansLaTranche(trouverMod(MOTS_CLES.etat), 1);
    if (patron === "controle")    poserSiTientDansLaTranche(trouverMod(MOTS_CLES.controle), 1);

    // Un tireur garde ses distances : ses cartes portent presque toujours Distance.
    const estTireur = (monstre.archetype || "").includes("DISTANCE");
    if (estTireur && !chantierContientMotCle(chantier, "distance")) {
        poserSiTientDansLaTranche(trouverMod(MOTS_CLES.distance), 1);
    }

    // --- 3. Remplissage jusqu'à la tranche visée ---
    // On ajoute des mods compatibles tant qu'on est sous la cible, en
    // s'interdisant tout ce qui ferait dépasser le plafond de la tranche.
    let garde = 0;
    while (fatigueDe(chantier, palette) < fatigueCible && garde < 40) {
        garde++;
        const budgetRestant = (fatigueCible - fatigueDe(chantier, palette)) / 5;

        const candidats = mods.filter(m => {
            if (!effetAutorise(chantier, m, true)) return false;
            if (m.Nom === "Zone" || contient(m.Nom, MOTS_CLES.persistance)) return false; // déjà gérés par le patron
            const dejaPose = action.modsEffets.find(x => x.effet.id === m.id);
            // Plafond d'empilement propre à la tranche, en plus du plafond de la
            // base : c'est lui qui empêche les "Critique + ×6" systématiques.
            const plafond = estEffetBouchon(m)
                ? PLAFOND_BOUCHON
                : Math.min(maxEmpilements(m), chantier.plafondEmpilement);
            if (dejaPose && dejaPose.count >= plafond) return false;
            return coutPC(m) > 0 && coutPC(m) <= budgetRestant + 0.5;
        });

        // Avant d'ajouter encore un effet, on peut prolonger d'un tour un effet
        // déjà posé qui a une durée (Brûlé, Glacé, Empoisonnement...). C'est le
        // bouton ⏳ de la Forge, et c'est ce que fait une vraie carte de joueur
        // plutôt que d'empiler un effet de plus.
        if (coutDureePlus > 0 && coutDureePlus <= budgetRestant && Math.random() < 0.35) {
            const prolongeables = action.modsEffets.filter(m =>
                (m.duree || 0) < maxDuree && nombreFr(m.effet.Tours) > 0);
            if (prolongeables.length > 0) {
                const cible = prolongeables[Math.floor(Math.random() * prolongeables.length)];
                cible.duree = (cible.duree || 0) + 1;
                if (fatigueDe(chantier, palette) > fatiguePlafond) cible.duree -= 1;
                else continue;
            }
        }

        if (candidats.length === 0) break;

        const candidatsColores = candidats.filter(m => !estEffetBouchon(m));
        const pool = candidatsColores.length > 0 ? candidatsColores : candidats;

        // On privilégie un effet PAS ENCORE présent : la carte gagne en largeur
        // avant de gagner en profondeur.
        const inedits = pool.filter(m => !action.modsEffets.some(x => x.effet.id === m.id));
        const mod = tirerPondere(inedits.length > 0 ? inedits : pool, note);
        if (!mod) break;

        const avant = fatigueDe(chantier, palette);
        poserMod(chantier, action, mod, 1);
        // Un mod qui fait sauter le plafond est retiré : la tranche prime.
        if (fatigueDe(chantier, palette) > fatiguePlafond) {
            const entree = action.modsEffets.find(x => x.effet.id === mod.id);
            if (entree.count > 1) entree.count -= 1;
            else action.modsEffets = action.modsEffets.filter(x => x.effet.id !== mod.id);
            if (fatigueDe(chantier, palette) === avant) break; // rien ne rentre plus
        }
    }

    // Dernier ajustement : si on est encore sous le plancher, on empile
    // l'action de base elle-même, qui n'a pas de plafond de compatibilité.
    garde = 0;
    const plafondBase = Math.min(maxEmpilements(effetBase), chantier.plafondEmpilement);
    while (fatigueDe(chantier, palette) < fatigueMin && garde < 30) {
        garde++;
        if (action.count >= plafondBase) break;
        action.count++;
        if (fatigueDe(chantier, palette) > fatiguePlafond) { action.count--; break; }
    }

    // Toujours sous le plancher ? C'est que les mods disponibles sont épuisés :
    // la limite de 2 caractéristiques ferme la porte aux mods étrangers, et
    // l'action de base a atteint son plafond d'empilement. La Forge permet
    // justement de poser PLUSIEURS actions sur une même carte — c'est ainsi
    // qu'un joueur construit une grosse technique, et c'est ce qu'on fait ici.
    garde = 0;
    while (fatigueDe(chantier, palette) < fatigueMin && garde < 6) {
        garde++;
        // Une seconde action ouvre la porte aux effets qui ne sont jamais des
        // socles offensifs (Bond, Initiative +, Illusion) : c'est là qu'ils
        // trouvent naturellement leur place, comme sur une carte de joueur.
        const candidatsSecondaires = racines.filter(e =>
            effetAutorise(chantier, e, false) && coutPC(e) > 0
        );
        if (candidatsSecondaires.length === 0) break;

        // Même règle que pour les mods : un bouchon ne sert que si rien d'autre
        // ne peut porter la carte.
        const secondairesColores = candidatsSecondaires.filter(e => !estEffetBouchon(e));
        const secondaire = tirerPondere(
            secondairesColores.length > 0 ? secondairesColores : candidatsSecondaires, note);
        if (!secondaire) break;

        const avant = fatigueDe(chantier, palette);
        const actionSecondaire = poserAction(chantier, secondaire, 1);
        if (fatigueDe(chantier, palette) > fatiguePlafond) {
            chantier.actions = chantier.actions.filter(a => a !== actionSecondaire);
            break;
        }
        // Puis on l'empile tant que la tranche le permet.
        const plafondSecondaire = estEffetBouchon(secondaire)
            ? PLAFOND_BOUCHON
            : Math.min(maxEmpilements(secondaire), chantier.plafondEmpilement);
        while (fatigueDe(chantier, palette) < fatigueMin && actionSecondaire.count < plafondSecondaire) {
            actionSecondaire.count++;
            if (fatigueDe(chantier, palette) > fatiguePlafond) { actionSecondaire.count--; break; }
        }
        if (fatigueDe(chantier, palette) === avant) break; // plus rien ne bouge
    }

    // DERNIER RECOURS : les plafonds d'empilement ne sont qu'un confort de
    // lisibilité, alors que la tranche de fatigue est une règle du jeu. Sur les
    // très grosses cartes d'un Élite ou d'un Boss, tout se ligue pour bloquer
    // (limite de 2 caractéristiques, une seule attaque de base, plafonds de
    // richesse) et la carte reste sous son plancher. On relâche alors les
    // plafonds, effet par effet, jusqu'à atteindre la tranche : mieux vaut une
    // carte un peu plus empilée qu'une carte hors de sa tranche.
    garde = 0;
    while (fatigueDe(chantier, palette) < fatigueMin && garde < 60) {
        garde++;
        const avant = fatigueDe(chantier, palette);

        for (const act of chantier.actions) {
            if (fatigueDe(chantier, palette) >= fatigueMin) break;

            // On approfondit d'abord les mods déjà posés, puis l'action elle-même.
            for (const m of act.modsEffets) {
                if (fatigueDe(chantier, palette) >= fatigueMin) break;
                if (m.count >= maxEmpilements(m.effet)) continue;
                m.count++;
                if (fatigueDe(chantier, palette) > fatiguePlafond) { m.count--; }
            }
            if (act.count < maxEmpilements(act.baseEffet)) {
                act.count++;
                if (fatigueDe(chantier, palette) > fatiguePlafond) act.count--;
            }
        }

        if (fatigueDe(chantier, palette) === avant) break; // vraiment plus rien à gagner
    }

    const fatigue = fatigueDe(chantier, palette);
    if (fatigue <= 0) return null;

    return {
        chantier,
        fatigue,
        initiative: initiativeChantier(chantier, palette, fatigue),
        coutPC: coutPCChantier(chantier, palette),
        patron
    };
}

// Traduit un chantier en document Firestore, au format exact de la Forge.
function chantierVersDocument(carte, nom, arme, palette) {
    const composants = {
        actions: carte.chantier.actions.map(act => {
            const mods = {};
            const modsDuree = {};
            act.modsEffets.forEach(m => {
                mods[m.effet.id] = m.count;
                if (m.duree > 0) modsDuree[m.effet.id] = m.duree;
            });
            return {
                idInst: act.idInst,
                baseEffetId: act.baseEffet.id,
                count: act.count,
                mods,
                zoneHexes: act.zoneHexes || [],
                baseDuree: act.baseDuree || 0,
                modsDuree
            };
        })
    };

    // ⚖️ règle Forge : compilerEffetsTexte — c'est ce tableau que la carte
    // affiche dans le panneau de combat.
    // ⚖️ règle Forge : les tours ajoutés au bouton ⏳ sont écrits à la suite de la
    // description, dans le même violet que sur une carte de joueur.
    const marqueurDuree = (tours) => tours > 0
        ? ` <span style="color:#9333ea;">(+ ⏳ ${tours} Trs)</span>`
        : "";

    const effetsCompiles = [];
    carte.chantier.actions.forEach(act => {
        effetsCompiles.push({
            nom: act.baseEffet.Nom,
            desc: texteEffet(act.baseEffet, act.count) + marqueurDuree(act.baseDuree || 0),
            isMod: false
        });
        act.modsEffets.forEach(m => {
            if (m.effet.Nom === "Zone") {
                const taille = act.zoneHexes.length > 0 ? act.zoneHexes.length : m.count;
                effetsCompiles.push({ nom: "Zone", desc: `${taille} hexagone(s)`, isMod: true, isZone: true });
            } else {
                effetsCompiles.push({
                    nom: m.effet.Nom,
                    desc: texteEffet(m.effet, m.count) + marqueurDuree(m.duree || 0),
                    isMod: true
                });
            }
        });
    });

    return {
        Nom: nom,
        Arme: arme,
        Element: "Aucun",
        Fatigue: carte.fatigue,
        Initiative: carte.initiative,
        Cout_PC: Math.round(carte.coutPC * 100) / 100,
        Effets_Compiles: effetsCompiles,
        Composants: composants,
        Genere_Par: "MIA_TECHNIQUES",
        Patron: carte.patron,
        Date_Creation: new Date().toISOString()
    };
}

// ⚖️ règle Forge : formatterTexteEffet, version réduite — la Forge injecte les
// valeurs réelles dans le texte de l'effet selon le nombre d'empilements.
function texteEffet(effet, empilements) {
    let texte = effet.Effet_Base || effet.Nom || "";
    const val = nombreFr(effet.Valeur);
    const pBase = nombreFr(effet.Pourcent_Base);
    const pMax = nombreFr(effet.Pourcent_Max);

    if (pBase > 0) {
        const calc = pBase * empilements;
        if (/\d+(?:[.,]\d+)?\s*%/.test(texte)) texte = texte.replace(/\d+(?:[.,]\d+)?\s*%/, calc + "%");
        if (pMax > 0 && /[Mm]ax\s*\d+(?:[.,]\d+)?\s*%?/.test(texte)) {
            texte = texte.replace(/([Mm]ax\s*)\d+(?:[.,]\d+)?(\s*%?)/i, `$1${pMax}$2`);
        }
    }
    if (val > 0) {
        const calc = val * empilements;
        texte = texte.replace(/\b\d+(?:[.,]\d+)?\b/, String(calc));
    }
    return texte;
}

// =========================================================================
//  3. MIA_TECHNIQUES — baptise les 6 cartes d'un seul appel
// =========================================================================

function nomsTechniquesParDefaut(cartes) {
    // Sans IA, on nomme d'après le patron et la puissance : jamais élégant,
    // mais toujours lisible et sans doublon.
    const parPatron = {
        frappe:      ["Assaut", "Charge", "Frappe"],
        etat:        ["Morsure viciée", "Souffle corrompu", "Marque"],
        zone:        ["Déferlante", "Balayage", "Onde"],
        persistance: ["Terre maudite", "Champ ardent", "Sol vicié"],
        etalement:   ["Plaie ouverte", "Poison lent", "Blessure"],
        soutien:     ["Regain", "Carapace", "Souffle vital"],
        controle:    ["Étreinte", "Fracas", "Entrave"]
    };
    const pris = new Set();
    return cartes.map((c, i) => {
        const banque = parPatron[c.patron] || ["Technique"];
        let nom = banque[i % banque.length];
        let n = 2;
        while (pris.has(nom)) { nom = `${banque[i % banque.length]} ${n++}`; }
        pris.add(nom);
        return nom;
    });
}

window.nommerTechniquesIA = async function(monstre, cartes) {
    const parDefaut = nomsTechniquesParDefaut(cartes);
    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cleGemini || cartes.length === 0) return parDefaut;

    // On décrit à l'IA ce que fait réellement chaque carte, pas son patron
    // interne : elle nomme d'après les effets, comme le ferait un joueur.
    const description = cartes.map((c, i) => {
        const effets = [];
        c.chantier.actions.forEach(act => {
            effets.push(`${act.baseEffet.Nom}${act.count > 1 ? " ×" + act.count : ""}`);
            act.modsEffets.forEach(m => effets.push(`${m.effet.Nom}${m.count > 1 ? " ×" + m.count : ""}`));
        });
        return `${i + 1}. Coût ${c.fatigue} de fatigue — effets : ${effets.join(", ")}`;
    }).join("\n");

    const promptSysteme = `Tu es MIA_TECHNIQUES, l'IA qui nomme les techniques de combat des créatures d'un jeu de rôle médiéval-fantastique sombre.

RÈGLES :
- Le nom doit coller AUX EFFETS de la technique ET à la créature qui la lance (une technique de feu d'un dragon ne se nomme pas comme celle d'un sorcier).
- 1 à 4 mots, en français, sans chiffre ni numéro.
- Plus la technique coûte de fatigue, plus le nom doit sonner puissant et rare.
- Les ${cartes.length} noms doivent être tous différents.
- Renvoie EXACTEMENT ${cartes.length} noms, dans l'ordre.`;

    const outils = [{
        functionDeclarations: [{
            name: "nommerLesTechniques",
            description: "Donne la liste des noms de techniques, dans l'ordre exact.",
            parameters: {
                type: "OBJECT",
                properties: { noms: { type: "ARRAY", items: { type: "STRING" } } },
                required: ["noms"]
            }
        }]
    }];

    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cleGemini}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: promptSysteme }] },
                contents: [{ role: "user", parts: [{ text:
                    `Créature : ${monstre.nom} (${monstre.archetype}, palier ${monstre.palier})\n\nSes techniques :\n${description}` }] }],
                tools: outils,
                toolConfig: { functionCallingConfig: { mode: "ANY" } }
            })
        });

        const data = await res.json();
        const noms = data.candidates?.[0]?.content?.parts?.find(p => p.functionCall)?.functionCall?.args?.noms;
        if (!Array.isArray(noms) || noms.length === 0) return parDefaut;

        return cartes.map((c, i) => {
            const nom = (noms[i] || "").toString().trim();
            return nom.length > 0 ? nom.slice(0, 40) : parDefaut[i];
        });
    } catch (e) {
        console.error("[MIA_TECHNIQUES] Nommage impossible, repli sur les noms par défaut :", e);
        return parDefaut;
    }
};

// =========================================================================
//  4. ORCHESTRATION — un monstre, ses 6 techniques, écrites en base
// =========================================================================

window.genererCompetencesMonstre = async function(monstreBrut) {
    // Le cache des effets est chargé au démarrage du jeu, mais sans être attendu :
    // une rencontre invoquée dans les premières secondes, ou sur une connexion
    // iPad lente, trouverait un cache vide et repartirait sans aucune technique,
    // en silence. On le charge donc à la demande, comme le font déjà la Forge et
    // le moteur de combat.
    if (!window.EFFETS_BDD_CACHE || Object.keys(window.EFFETS_BDD_CACHE).length === 0) {
        if (typeof window.chargerCacheEffetsBDD === "function") {
            await window.chargerCacheEffetsBDD().catch(e => console.error(e));
        }
    }

    const palette = window.paletteEffetsMonstres();
    if (palette.length === 0) {
        console.warn("Aucun effet de combat en cache : impossible de forger les techniques.");
        return [];
    }

    // Les tranches de fatigue sont des pourcentages : sans la fatigue max de la
    // créature, elles ne veulent rien dire. Les objets de composition d'une
    // rencontre ne portent que {archetype, palier, nom}, donc on va la chercher
    // dans le gabarit du bestiaire.
    const monstre = { ...monstreBrut };
    if (!monstre.fatigueMax) {
        const gabarit = typeof window.gabaritMonstre === "function"
            ? window.gabaritMonstre(monstre.archetype, monstre.palier)
            : null;
        monstre.fatigueMax = (gabarit && gabarit.Fatigue_Max) || 100;
    }

    const affinites = await window.determinerAffinitesMonstre(monstre);

    // Les patrons de l'archetype, mélangés, puis appariés aux 6 tranches :
    // c'est ce qui garantit qu'un même monstre a des techniques variées et
    // que la plus chère n'est pas systématiquement du même genre.
    const patrons = [...(PATRONS_PAR_ARCHETYPE[monstre.archetype] || PATRONS_PAR_ARCHETYPE["DPS CAC"])]
        .sort(() => Math.random() - 0.5);

    // Signature d'une carte : la liste de ses effets. Deux cartes de même
    // signature dans un même jeu, c'est la même technique proposée deux fois.
    const signature = (carte) => {
        const noms = [];
        carte.chantier.actions.forEach(act => {
            noms.push(act.baseEffet.Nom);
            act.modsEffets.forEach(m => noms.push(m.effet.Nom));
        });
        return noms.sort().join("|");
    };

    const fatigueMaxMonstre = parseInt(monstre.fatigueMax) || 100;
    const tousLesPatrons = ["frappe", "etat", "zone", "persistance", "etalement", "soutien", "controle"];

    const cartes = [];
    const dejaVues = new Set();
    TRANCHES_FATIGUE_PCT.forEach((tranche, i) => {
        const plancher = Math.max(1, Math.round(tranche[0] / 100 * fatigueMaxMonstre));
        const plafond  = Math.round(tranche[1] / 100 * fatigueMaxMonstre);

        // Qualité d'une carte : à tranche égale, on préfère celle qui combine
        // des effets variés plutôt que celle qui empile vingt fois le même.
        const qualite = (c) => {
            let empilementMax = 0, distincts = new Set();
            c.chantier.actions.forEach(act => {
                empilementMax = Math.max(empilementMax, act.count);
                distincts.add(act.baseEffet.Nom);
                act.modsEffets.forEach(m => {
                    empilementMax = Math.max(empilementMax, m.count);
                    distincts.add(m.effet.Nom);
                });
            });
            return distincts.size * 2 - Math.max(0, empilementMax - 6) * 3;
        };

        let carte = null;
        let meilleure = null;   // la moins mauvaise, si aucune tentative n'est parfaite

        // On retente pour deux raisons. D'abord le doublon : le hasard produit
        // forcément des collisions entre deux tranches voisines qui piochent
        // dans les mêmes effets. Ensuite l'impasse : certaines combinaisons
        // saturent (tous les effets à leur plafond, les deux caractéristiques
        // consommées) sans atteindre le plancher de la tranche. Dans les deux
        // cas, un autre patron ouvre d'autres effets et s'en sort.
        // Le patron prévu a la priorité absolue sur les trois premiers essais :
        // on ne compare la qualité qu'entre cartes du MÊME patron. Comparer tous
        // patrons confondus écartait systématiquement les cartes de soutien, plus
        // pauvres en effets distincts parce qu'on leur interdit les altérations
        // offensives — un archetype SOUTIEN finissait avec 8 % de cartes de soin
        // au lieu du tiers prévu par son plan.
        for (let essai = 0; essai < 8; essai++) {
            const patronPrevu = essai < 3;
            const patron = patronPrevu
                ? (patrons[i] || "frappe")
                : tousLesPatrons[Math.floor(Math.random() * tousLesPatrons.length)];
            const candidate = fabriquerCarte(monstre, affinites, patron, tranche, palette, i);
            if (!candidate) continue;

            if (!meilleure || Math.abs(candidate.fatigue - plancher) < Math.abs(meilleure.fatigue - plancher)) {
                meilleure = candidate;
            }
            if (candidate.fatigue < plancher || candidate.fatigue > plafond) continue;
            if (dejaVues.has(signature(candidate))) continue;

            if (!carte || qualite(candidate) > qualite(carte)) carte = candidate;
            // Dès qu'une carte du patron prévu convient, on ne va pas chercher
            // ailleurs : les essais suivants ne servent qu'en cas d'impasse.
            if (patronPrevu && essai >= 2) break;
        }

        // Aucune tentative parfaite : on garde la plus proche plutôt que de
        // laisser un trou dans le jeu de cartes.
        if (!carte) carte = meilleure || fabriquerCarte(monstre, affinites, "frappe", tranche, palette, i);
        if (carte) {
            dejaVues.add(signature(carte));
            cartes.push(carte);
        }
    });

    if (cartes.length === 0) return [];

    const noms = await window.nommerTechniquesIA(monstre, cartes);
    const arme = ARME_PAR_ARCHETYPE[monstre.archetype] || "Arme polyvalente";
    return cartes.map((c, i) => chantierVersDocument(c, noms[i] || `Technique ${i + 1}`, arme, palette));
};

// Écrit les techniques d'un monstre en base et les lui équipe.
window.equiperCompetencesMonstre = async function(idMonstre, monstre) {
    try {
        const documents = await window.genererCompetencesMonstre(monstre);
        if (documents.length === 0) return [];

        const lot = writeBatch(db);
        const idsCartes = [];
        documents.forEach(docCompetence => {
            const idCarte = "COMP_" + Math.random().toString(36).substring(2, 9);
            idsCartes.push(idCarte);
            lot.set(doc(db, COLLECTION_MONSTRES, idMonstre, "Competences", idCarte), docCompetence);
        });
        await lot.commit();

        // Deck_Equipe : c'est ce que lit le panneau de combat pour afficher les
        // bannières, exactement comme pour un joueur.
        await updateDoc(doc(db, COLLECTION_MONSTRES, idMonstre), { Deck_Equipe: idsCartes });

        console.log(`⚔️ ${documents.length} technique(s) forgée(s) pour ${monstre.nom}.`);
        return idsCartes;
    } catch (e) {
        console.error(`Forge des techniques de ${monstre.nom} :`, e);
        return [];
    }
};

// Toute la rencontre en parallèle : chaque monstre a ses deux appels IA, et
// les 4 à 6 monstres sont traités en même temps plutôt qu'à la queue leu leu.
// Un échec sur une créature n'empêche jamais les autres d'être équipées.
window.equiperCompetencesRencontre = async function(monstresPoses) {
    if (!Array.isArray(monstresPoses) || monstresPoses.length === 0) return;
    await Promise.all(monstresPoses.map(m =>
        window.equiperCompetencesMonstre(m.id, m).catch(e => console.error(e))
    ));
};

// =========================================================================
//  5. LECTURE DES TECHNIQUES EN COMBAT
// =========================================================================
//  Le panneau de combat lit window.CACHE_COMPETENCES_GLOBAL, alimenté pour
//  les joueurs par un écouteur sur Personnages/{id}/Competences. On fait le
//  même travail pour la sous-collection des monstres.
// =========================================================================

window.UNSUBSCRIBE_COMPETENCES_MONSTRES = window.UNSUBSCRIBE_COMPETENCES_MONSTRES || {};

window.ecouterCompetencesMonstre = function(idMonstre) {
    if (!idMonstre || window.UNSUBSCRIBE_COMPETENCES_MONSTRES[idMonstre]) return;

    const ref = collection(db, COLLECTION_MONSTRES, idMonstre, "Competences");
    window.UNSUBSCRIBE_COMPETENCES_MONSTRES[idMonstre] = onSnapshot(ref, (snap) => {
        const competences = {};
        snap.forEach(d => { competences[d.id] = d.data(); });
        if (!window.CACHE_COMPETENCES_GLOBAL) window.CACHE_COMPETENCES_GLOBAL = {};
        window.CACHE_COMPETENCES_GLOBAL[idMonstre] = competences;

        // Si ce monstre est justement affiché dans le panneau gauche, on
        // rafraîchit : c'est ce qui fait apparaître ses bannières dès que la
        // forge en arrière-plan a fini.
        const combatOuvert = document.getElementById("fenetre-combat")?.style.display === "block";
        const affiche = (window.COMBAT_PERSOS_JOUEUR || [])[window.COMBAT_INDEX_PERSO];
        if (combatOuvert && affiche && affiche.idPersonnage === idMonstre
            && typeof window.afficherPersoCombatActuel === "function") {
            window.afficherPersoCombatActuel();
        }
    }, (err) => console.error("onSnapshot Competences monstre :", err));
};

window.arreterEcouteCompetencesMonstres = function() {
    Object.values(window.UNSUBSCRIBE_COMPETENCES_MONSTRES).forEach(stop => {
        if (typeof stop === "function") stop();
    });
    window.UNSUBSCRIBE_COMPETENCES_MONSTRES = {};
};
