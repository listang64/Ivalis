// =========================================================================
//  IVALIS - CATALOGUE D'ÉQUIPEMENT ET TIRAGE ALÉATOIRE
// =========================================================================
//  Transcription fidèle des deux tableaux de Nico :
//    - Loot_Ivalis.xlsx  : les chances de rareté par difficulté de rencontre.
//    - Armes_Ivalis.xlsx : les 25 modèles, leurs quatre paliers de rareté,
//      leurs trois réservoirs d'effets (A : arme de contact, B : arme à
//      distance, C : soins) et les prérequis en caractéristique.
//
//  Un objet tiré n'est PAS une simple ligne de texte : c'est un sac de bonus
//  chiffrés (window.CLES_BONUS) que le combat lit directement, plus une
//  description lisible reconstruite à partir de ces mêmes chiffres. Le texte
//  ne sert donc qu'à l'affichage : il ne peut pas mentir sur ce qui est
//  réellement appliqué, puisqu'il en est dérivé.
// =========================================================================

// -------------------------------------------------------------------------
//  Les quatre raretés, dans l'ordre du tableau (couleurs comprises).
// -------------------------------------------------------------------------
window.RARETES = ["Commun", "Rare", "Très rare", "Épique"];

window.COULEUR_RARETE = {
    "Commun":    "#9a9a9a",  // GRIS
    "Rare":      "#3aa757",  // VERT
    "Très rare": "#3b82f6",  // BLEU
    "Épique":    "#9b59b6"   // VIOLET
};

// Loot_Ivalis.xlsx — % de chance de loot par catégorie, selon la difficulté.
// L'épique ne tombe que sur un boss (ligne "TRÈS DIFFICILE").
window.CHANCES_RARETE = {
    "Normale":        { "Commun": 75, "Rare": 20, "Très rare": 5,  "Épique": 0 },
    "Difficile":      { "Commun": 55, "Rare": 30, "Très rare": 15, "Épique": 0 },
    "Très difficile": { "Commun": 20, "Rare": 40, "Très rare": 35, "Épique": 5 }
};

// Armes_Ivalis.xlsx, dernière ligne : la caractéristique minimale exigée pour
// PORTER l'objet. La carac concernée est celle du modèle (colonne
// "Modificateur"), pas une carac au choix.
window.PREREQUIS_RARETE = { "Commun": 0, "Rare": 10, "Très rare": 12, "Épique": 12 };

// -------------------------------------------------------------------------
//  Les bonus qu'un objet peut porter. Toute la mécanique de combat ne lit
//  QUE ces clés — ajouter un effet, c'est ajouter une clé ici et la brancher
//  au bon endroit, jamais analyser du texte.
// -------------------------------------------------------------------------
window.CLES_BONUS = [
    "critique",          // points de % de coup critique
    "degatsPhys",        // dégâts plats sur les attaques physiques
    "degatsMag",         // dégâts plats sur les attaques magiques
    "degats",            // dégâts plats, quel que soit le type (effets A/B)
    "soin",              // points de soin en plus
    "initiative",        // initiative des cartes lancées
    "parade",            // points de parade
    "resPhys",           // points de % de résistance physique
    "resMag",            // points de % de résistance magique
    "portee",            // cases de portée en plus (attaques à distance)
    "allonge",           // cases de portée en plus, MAIS l'attaque reste au contact
    "coutDeplacement",   // modificateur du coût en énergie de chaque case
    "ignoreArmure",      // % de chance d'ignorer la résistance PHYSIQUE de la cible
    "ignoreResistances", // % de chance d'ignorer TOUTE résistance de la cible
    "hexApresAttaque"    // cases de déplacement offertes après une attaque
];

// =========================================================================
//  LES TROIS RÉSERVOIRS D'EFFETS (colonnes J, K et L du tableau)
// =========================================================================
//  Chaque effet est décrit par ce qu'il FAIT, jamais par sa phrase : le texte
//  affiché est reconstruit ensuite. "chance" est un pourcentage ; un effet qui
//  n'en a pas s'applique toujours.
//
//  Doubler un effet (objet épique) double sa chance quand il en a une, sinon
//  sa valeur — c'est la lecture retenue avec Nico : « 10% de chance
//  d'empoisonnement devient 20%, +1 dégât devient +2 ».

const ETAT_EFFET = (nom, chance, libelle) => ({ cle: "etat_" + nom, etat: nom, chance, libelle });

// Colonne J — EFFET A (arme de contact)
window.EFFETS_A = [
    { cle: "degats",            bonus: { degats: 1 },            libelle: "dégât" },
    ETAT_EFFET("Empoisonnement", 10, "empoisonnement"),
    ETAT_EFFET("Étourdi",        10, "étourdissement"),
    ETAT_EFFET("Glacé",          10, "gelée"),
    ETAT_EFFET("Brûlé",          10, "brûlure"),
    ETAT_EFFET("Immobilisation", 10, "immobilisation"),
    ETAT_EFFET("Peur",           10, "peur"),
    ETAT_EFFET("Poussée",        10, "poussée"),
    { cle: "initTemporaire",    chance: 10, buff: { initiative: 15, tours: 2 }, libelle: "élan" },
    { cle: "hexApresAttaque",   bonus: { hexApresAttaque: 1 },   libelle: "repli" },
    ETAT_EFFET("Provocation",    10, "provocation"),
    { cle: "initiative",        bonus: { initiative: 3 },        libelle: "initiative" },
    { cle: "critique",          bonus: { critique: 3 },          libelle: "critique" },
    { cle: "ignoreResistances", bonus: { ignoreResistances: 10 }, libelle: "perce-résistances" }
];

// Colonne K — EFFET B (arme à distance). Même palette, plus la Traction, et
// sans le "+1 dégât" placé une ligne plus haut dans le tableau.
window.EFFETS_B = [
    { cle: "degats",            bonus: { degats: 1 },            libelle: "dégât" },
    ETAT_EFFET("Empoisonnement", 10, "empoisonnement"),
    ETAT_EFFET("Étourdi",        10, "étourdissement"),
    ETAT_EFFET("Glacé",          10, "gelée"),
    ETAT_EFFET("Brûlé",          10, "brûlure"),
    ETAT_EFFET("Immobilisation", 10, "immobilisation"),
    ETAT_EFFET("Peur",           10, "peur"),
    ETAT_EFFET("Poussée",        10, "poussée"),
    ETAT_EFFET("Traction",       10, "traction"),
    { cle: "initTemporaire",    chance: 10, buff: { initiative: 15, tours: 2 }, libelle: "élan" },
    { cle: "hexApresAttaque",   bonus: { hexApresAttaque: 1 },   libelle: "repli" },
    ETAT_EFFET("Provocation",    10, "provocation"),
    { cle: "critique",          bonus: { critique: 3 },          libelle: "critique" },
    { cle: "initiative",        bonus: { initiative: 3 },        libelle: "initiative" },
    { cle: "ignoreResistances", bonus: { ignoreResistances: 10 }, libelle: "perce-résistances" }
];

// Colonne L — EFFET C (soins). Les trois "sur un sort de soin pendant 1 tour"
// posent un état bénéfique sur la CIBLE du soin, pas sur le lanceur.
window.EFFETS_C = [
    { cle: "soin",           bonus: { soin: 1 },                                    libelle: "soin" },
    { cle: "beniMag",        beniSoin: { resMag: 8, tours: 1 },                     libelle: "bénédiction magique" },
    { cle: "beniPhys",       beniSoin: { resPhys: 8, tours: 1 },                    libelle: "bénédiction physique" },
    { cle: "beniDegats",     beniSoin: { degatsPct: 8, tours: 1 },                  libelle: "bénédiction offensive" },
    { cle: "initSoi",        buffSoi: { initiative: 10, tours: 3 },                 libelle: "hâte" },
    { cle: "ignoreResistances", bonus: { ignoreResistances: 10 },                   libelle: "perce-résistances" }
];

window.RESERVOIRS_EFFETS = { A: window.EFFETS_A, B: window.EFFETS_B, C: window.EFFETS_C };

// =========================================================================
//  LES 23 MODÈLES (colonnes A à H du tableau)
// =========================================================================
//  "paliers" donne les bonus chiffrés de chaque rareté. Une valeur écrite
//  [min, max] est tirée au sort dans cette fourchette (les armures).
//  "effets" dit combien d'effets s'ajoutent à partir de Très rare, et dans
//  quel réservoir les prendre. Un objet épique tire le MÊME nombre d'effets
//  qu'un très rare, mais chacun compte double.
// -------------------------------------------------------------------------

window.MODELES_OBJETS = [
    // --- Armes et boucliers à une main (lignes 3 à 16) --------------------
    {
        modele: "Dague", type: "Arme légère CAC", emplacement: "Main", deuxMains: false,
        carac: "DEXTÉRITÉ", noms: ["Sica", "Panazonium"], effets: { reservoir: "A", nombre: 1 },
        paliers: {
            "Commun":    { critique: 3 },
            "Rare":      { critique: 6 },
            "Très rare": { critique: 10 },
            "Épique":    { critique: 10 }
        }
    },
    {
        modele: "Couteau", type: "Arme légère CAC", emplacement: "Main", deuxMains: false,
        carac: "DEXTÉRITÉ", noms: ["Couteau"], effets: { reservoir: "A", nombre: 1 },
        paliers: {
            "Commun":    { coutDeplacement: -1 },
            "Rare":      { critique: 3, coutDeplacement: -1 },
            "Très rare": { critique: 5, coutDeplacement: -1 },
            "Épique":    { critique: 5, coutDeplacement: -1 }
        }
    },
    {
        modele: "Épée courte", type: "Arme lourde CAC", emplacement: "Main", deuxMains: false,
        carac: "FORCE", noms: ["Glaive", "Xiphos"], effets: { reservoir: "A", nombre: 1 },
        paliers: {
            "Commun":    { initiative: 5 },
            "Rare":      { degatsPhys: 1, initiative: 5 },
            "Très rare": { degatsPhys: 2, initiative: 8 },
            "Épique":    { degatsPhys: 2, initiative: 8 }
        }
    },
    {
        modele: "Épée courbée", type: "Arme légère CAC", emplacement: "Main", deuxMains: false,
        carac: "DEXTÉRITÉ", noms: ["Harpé", "Machaira", "Falcata"], effets: { reservoir: "A", nombre: 1 },
        paliers: {
            "Commun":    { degatsPhys: 1 },
            "Rare":      { degatsPhys: 1, critique: 3 },
            "Très rare": { degatsPhys: 2, critique: 5 },
            "Épique":    { degatsPhys: 2, critique: 5 }
        }
    },
    {
        modele: "Hache", type: "Arme lourde CAC", emplacement: "Main", deuxMains: false,
        carac: "FORCE", noms: ["Sagaris", "Labrys"], effets: { reservoir: "A", nombre: 1 },
        paliers: {
            "Commun":    { degatsPhys: 1 },
            "Rare":      { degatsPhys: 2 },
            "Très rare": { degatsPhys: 3 },
            "Épique":    { degatsPhys: 3 }
        }
    },
    {
        modele: "Gourdin", type: "Arme lourde CAC", emplacement: "Main", deuxMains: false,
        carac: "FORCE", noms: ["Gourdin"], effets: { reservoir: "A", nombre: 1 },
        paliers: {
            "Commun":    { etatsPropres: [{ etat: "Étourdi", chance: 10 }] },
            "Rare":      { etatsPropres: [{ etat: "Étourdi", chance: 15 }] },
            "Très rare": { etatsPropres: [{ etat: "Étourdi", chance: 20 }], degats: 1 },
            "Épique":    { etatsPropres: [{ etat: "Étourdi", chance: 20 }], degats: 1 }
        }
    },
    {
        modele: "Masse", type: "Arme lourde CAC", emplacement: "Main", deuxMains: false,
        carac: "FORCE", noms: ["Gada"], effets: { reservoir: "A", nombre: 1 },
        paliers: {
            "Commun":    { ignoreArmure: 15 },
            "Rare":      { ignoreArmure: 20 },
            "Très rare": { ignoreArmure: 25 },
            "Épique":    { ignoreArmure: 25 }
        }
    },
    {
        modele: "Lance courte", type: "Arme lourde CAC", emplacement: "Main", deuxMains: false,
        carac: "FORCE", noms: ["Doratium"], effets: { reservoir: "A", nombre: 1 },
        paliers: {
            "Commun":    { degatsPhys: 1 },
            "Rare":      { degatsPhys: 1, parade: 5 },
            "Très rare": { degatsPhys: 2, parade: 5 },
            "Épique":    { degatsPhys: 2, parade: 5 }
        }
    },
    {
        // Le classeur portait 12% en Épique, sous les 15% du Très rare :
        // coquille confirmée par Nico, l'épique tient ses 15%.
        modele: "Javelots", type: "Arme polyvalente", emplacement: "Main", deuxMains: false,
        carac: "FORCE", noms: ["Hasta", "Pilum"], effets: { reservoir: "A", nombre: 1 },
        paliers: {
            "Commun":    { degatsPhys: 1 },
            "Rare":      { degatsPhys: 1, ignoreArmure: 10 },
            "Très rare": { degatsPhys: 1, ignoreArmure: 15 },
            "Épique":    { degatsPhys: 1, ignoreArmure: 15 }
        }
    },
    {
        modele: "Fronde", type: "Arme légère Distance", emplacement: "Main", deuxMains: false,
        carac: "DEXTÉRITÉ", noms: ["Fronde"], effets: { reservoir: "A", nombre: 1 },
        paliers: {
            "Commun":    { etatsPropres: [{ etat: "Immobilisation", chance: 10 }], portee: 1 },
            "Rare":      { etatsPropres: [{ etat: "Immobilisation", chance: 15 }], portee: 1 },
            "Très rare": { etatsPropres: [{ etat: "Immobilisation", chance: 20 }], portee: 1 },
            "Épique":    { etatsPropres: [{ etat: "Immobilisation", chance: 20 }], portee: 1 }
        }
    },
    {
        modele: "Bouclier léger", type: "Bouclier", emplacement: "Main", deuxMains: false,
        carac: "DEXTÉRITÉ", noms: ["Pelta", "Caetra"], effets: { reservoir: "A", nombre: 1 },
        paliers: {
            "Commun":    { parade: 20 },
            "Rare":      { parade: 25 },
            "Très rare": { parade: 25 },
            "Épique":    { parade: 25 }
        }
    },
    {
        modele: "Bouclier intermédiaire", type: "Bouclier", emplacement: "Main", deuxMains: false,
        carac: "FORCE", noms: ["Aspis", "Clipeus"], effets: { reservoir: "A", nombre: 1 },
        paliers: {
            "Commun":    { parade: 20 },
            "Rare":      { parade: 25 },
            "Très rare": { parade: 25 },
            "Épique":    { parade: 25 }
        }
    },
    {
        modele: "Bouclier lourd", type: "Bouclier", emplacement: "Main", deuxMains: false,
        carac: "FORCE", noms: ["Scutum"], effets: { reservoir: "A", nombre: 1 },
        paliers: {
            "Commun":    { parade: 28, coutDeplacement: 1 },
            "Rare":      { parade: 32, coutDeplacement: 1 },
            "Très rare": { parade: 32, coutDeplacement: 1 },
            "Épique":    { parade: 32, coutDeplacement: 1 }
        }
    },

    // --- Armes à deux mains (lignes 18 à 22) ------------------------------
    {
        modele: "Hache à deux mains", type: "Arme lourde CAC", emplacement: "Main", deuxMains: true,
        carac: "FORCE", noms: ["Hache à deux mains"], effets: { reservoir: "A", nombre: 2 },
        paliers: {
            "Commun":    { degatsPhys: 2 },
            "Rare":      { degatsPhys: 4 },
            "Très rare": { degatsPhys: 6 },
            "Épique":    { degatsPhys: 6 }
        }
    },
    {
        modele: "Masse à deux mains", type: "Arme lourde CAC", emplacement: "Main", deuxMains: true,
        carac: "FORCE", noms: ["Gada à deux mains"], effets: { reservoir: "A", nombre: 2 },
        paliers: {
            "Commun":    { ignoreArmure: 30 },
            "Rare":      { ignoreArmure: 40 },
            "Très rare": { ignoreArmure: 50 },
            "Épique":    { ignoreArmure: 50 }
        }
    },
    {
        modele: "Lance à deux mains", type: "Arme lourde CAC", emplacement: "Main", deuxMains: true,
        carac: "FORCE", noms: ["Lance lourde"], effets: { reservoir: "A", nombre: 2 },
        paliers: {
            "Commun":    { allonge: 1 },
            "Rare":      { allonge: 1, degats: 2 },
            "Très rare": { allonge: 1, degats: 4 },
            "Épique":    { allonge: 1, degats: 4 }
        }
    },
    {
        // Typée "Arme légère CAC" dans le tableau malgré ses deux mains :
        // transcrit tel quel, c'est la Falx.
        modele: "Épée à deux mains", type: "Arme légère CAC", emplacement: "Main", deuxMains: true,
        carac: "DEXTÉRITÉ", noms: ["Falx"], effets: { reservoir: "A", nombre: 2 },
        paliers: {
            "Commun":    { degatsPhys: 1, initiative: 5 },
            "Rare":      { degatsPhys: 2, initiative: 10 },
            "Très rare": { degatsPhys: 4, initiative: 10 },
            "Épique":    { degatsPhys: 4, initiative: 10 }
        }
    },
    {
        modele: "Arc court", type: "Arme légère Distance", emplacement: "Main", deuxMains: true,
        carac: "DEXTÉRITÉ", noms: ["Arc court"], effets: { reservoir: "B", nombre: 2 },
        paliers: {
            "Commun":    { portee: 1 },
            "Rare":      { portee: 1, degats: 2 },
            "Très rare": { portee: 1, degats: 4 },
            "Épique":    { portee: 1, degats: 4 }
        }
    },

    // --- Magie (lignes 24 et 25) ------------------------------------------
    //  Une bague occupe une main, mais ne la ferme pas : elle ne compte pas
    //  comme main occupée pour la règle "lancer un sort demande une main libre".
    {
        modele: "Bagues DPS", type: "Magie", emplacement: "Main", deuxMains: false, bague: true,
        carac: "INTELLIGENCE", noms: ["Bague"], effets: { reservoir: "B", nombre: 1 },
        paliers: {
            "Commun":    { degatsMag: 1 },
            "Rare":      { degatsMag: 2 },
            "Très rare": { degatsMag: 3 },
            "Épique":    { degatsMag: 3 }
        }
    },
    {
        modele: "Bagues Soins", type: "Magie", emplacement: "Main", deuxMains: false, bague: true,
        carac: "SAGESSE", noms: ["Bague"], effets: { reservoir: "C", nombre: 1 },
        paliers: {
            "Commun":    { soin: 1 },
            "Rare":      { soin: 2 },
            "Très rare": { soin: 3 },
            "Épique":    { soin: 3 }
        }
    },

    // --- Armures (lignes 27 à 29) -----------------------------------------
    //  Les fourchettes [min, max] sont tirées au sort à la création de l'objet.
    //  Un épique tire son effet dans A, B ou C (au hasard), et sans doublement :
    //  le tableau dit "+ 1 Effet A, B, ou C", pas "2X".
    {
        modele: "Armure légère", type: "Armure légère", emplacement: "Armure", deuxMains: false,
        carac: "INTELLIGENCE",
        noms: ["Tunique de lin", "Exômide", "Chiton de laine", "Robe de bure", "Cape de voyage"],
        effets: { reservoir: "ABC", nombre: 1, seulementEpique: true, sansDoublement: true },
        paliers: {
            "Commun":    { resMag: [15, 25], resPhys: 5 },
            "Rare":      { resMag: [20, 30], resPhys: [5, 10] },
            "Très rare": { resMag: [25, 40], resPhys: [10, 15] },
            "Épique":    { resMag: 40, resPhys: 15 }
        }
    },
    {
        modele: "Armure intermédiaire", type: "Armure intermédiaire", emplacement: "Armure", deuxMains: false,
        carac: "DEXTÉRITÉ",
        noms: ["Spolas", "Linothorax", "Brigandine", "Jaque de cuir", "Cuirasse de cuir"],
        effets: { reservoir: "ABC", nombre: 1, seulementEpique: true, sansDoublement: true },
        paliers: {
            "Commun":    { resPhys: [10, 15], resMag: [10, 15] },
            "Rare":      { resPhys: [13, 20], resMag: [13, 20] },
            // Le seul palier avec une réserve à répartir : 10 points de plus,
            // distribués au hasard entre les deux résistances.
            "Très rare": { resPhys: [18, 26], resMag: [18, 26], aRepartir: 10 },
            "Épique":    { resPhys: 26, resMag: 26 }
        }
    },
    {
        modele: "Armure lourde", type: "Armure lourde", emplacement: "Armure", deuxMains: false,
        carac: "FORCE",
        noms: ["Lorica", "Cuirasse de bronze", "Thorax hoplitique", "Cotte d'écailles", "Lorica segmentata"],
        effets: { reservoir: "ABC", nombre: 1, seulementEpique: true, sansDoublement: true },
        paliers: {
            "Commun":    { resPhys: [15, 25], resMag: 5 },
            "Rare":      { resPhys: [20, 30], resMag: [5, 10] },
            "Très rare": { resPhys: [25, 40], resMag: [10, 15] },
            "Épique":    { resPhys: 40, resMag: 15 }
        }
    }
];

// =========================================================================
//  LE TIRAGE
// =========================================================================

function auHasard(tableau) { return tableau[Math.floor(Math.random() * tableau.length)]; }
function entier(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

// Une valeur de palier est soit un nombre, soit une fourchette [min, max] à
// tirer (les armures). Tout le reste du code ne voit que des nombres.
function valeurPalier(v) { return Array.isArray(v) ? entier(v[0], v[1]) : v; }

// La rareté, tirée selon la difficulté de la rencontre. Une difficulté inconnue
// retombe sur "Normale" : c'est le cas quand le MJ a posé ses monstres à la
// main, sans passer par la génération de rencontre.
window.tirerRarete = function(difficulte) {
    const table = window.CHANCES_RARETE[difficulte] || window.CHANCES_RARETE["Normale"];
    const total = window.RARETES.reduce((s, r) => s + (table[r] || 0), 0);
    let jet = Math.random() * total;
    for (const rarete of window.RARETES) {
        jet -= (table[rarete] || 0);
        if (jet < 0) return rarete;
    }
    return "Commun";
};

// Double un effet : sa chance si elle existe, sinon sa valeur. Un effet doublé
// reste un effet unique — c'est la lecture retenue avec Nico pour "2X Effet A".
function doublerEffet(effet) {
    const copie = JSON.parse(JSON.stringify(effet));
    if (copie.chance !== undefined) {
        copie.chance = Math.min(100, copie.chance * 2);
        return copie;
    }
    ["bonus", "buff", "buffSoi", "beniSoin"].forEach(cle => {
        if (!copie[cle]) return;
        Object.keys(copie[cle]).forEach(k => {
            if (k !== "tours" && typeof copie[cle][k] === "number") copie[cle][k] *= 2;
        });
    });
    return copie;
}

// Les effets ajoutés par la rareté : rien avant Très rare, puis "nombre"
// effets distincts, doublés si l'objet est épique.
window.tirerEffetsObjet = function(modele, rarete) {
    const regle = modele.effets || {};
    if (rarete !== "Très rare" && rarete !== "Épique") return [];
    if (regle.seulementEpique && rarete !== "Épique") return [];

    // "ABC" (les armures épiques) : le réservoir lui-même est tiré au sort.
    const nomReservoir = regle.reservoir === "ABC" ? auHasard(["A", "B", "C"]) : regle.reservoir;
    const reservoir = window.RESERVOIRS_EFFETS[nomReservoir] || window.EFFETS_A;

    const disponibles = [...reservoir];
    const tires = [];
    for (let i = 0; i < (regle.nombre || 1) && disponibles.length > 0; i++) {
        const effet = disponibles.splice(Math.floor(Math.random() * disponibles.length), 1)[0];
        tires.push(rarete === "Épique" && !regle.sansDoublement ? doublerEffet(effet) : effet);
    }
    return tires;
};

// Assemble un objet complet à partir d'un modèle et d'une rareté.
window.fabriquerObjet = function(modele, rarete) {
    const palier = modele.paliers[rarete] || {};
    const bonus = {};
    const etats = [];

    Object.keys(palier).forEach(cle => {
        if (cle === "etatsPropres") {
            (palier[cle] || []).forEach(e => etats.push({ etat: e.etat, chance: e.chance }));
        } else if (cle !== "aRepartir") {
            bonus[cle] = valeurPalier(palier[cle]);
        }
    });

    // Armure intermédiaire très rare : dix points de plus, répartis au hasard
    // entre résistance physique et magique.
    if (palier.aRepartir) {
        const versPhys = entier(0, palier.aRepartir);
        bonus.resPhys = (bonus.resPhys || 0) + versPhys;
        bonus.resMag  = (bonus.resMag  || 0) + (palier.aRepartir - versPhys);
    }

    // Les effets de rareté déversent leurs bonus chiffrés dans le même sac :
    // le combat n'a ainsi qu'UN endroit à lire, quelle que soit l'origine.
    const effets = window.tirerEffetsObjet(modele, rarete);
    effets.forEach(effet => {
        if (effet.bonus) {
            Object.keys(effet.bonus).forEach(k => { bonus[k] = (bonus[k] || 0) + effet.bonus[k]; });
        }
        if (effet.etat) etats.push({ etat: effet.etat, chance: effet.chance });
    });

    const objet = {
        uid: "obj_" + Math.random().toString(36).slice(2, 10),
        nom: auHasard(modele.noms),
        modele: modele.modele,
        type: modele.type,
        rarete: rarete,
        emplacement: modele.emplacement,
        deuxMains: !!modele.deuxMains,
        bague: !!modele.bague,
        carac: modele.carac,
        prerequis: window.PREREQUIS_RARETE[rarete] || 0,
        bonus: bonus,
        etats: etats,
        // Les effets qui ne se résument pas à un bonus chiffré ni à un état
        // (élan d'initiative, bénédictions de soin) restent listés tels quels.
        effets: effets.filter(e => e.buff || e.buffSoi || e.beniSoin).map(e => ({
            cle: e.cle, chance: e.chance, buff: e.buff, buffSoi: e.buffSoi, beniSoin: e.beniSoin
        })),
        image: ""
    };
    objet.effetTexte = window.decrireObjet(objet);
    return objet;
};

// Tire un objet complet pour une difficulté donnée. C'est l'unique porte
// d'entrée utilisée par le butin.
window.tirerObjetPourDifficulte = function(difficulte) {
    const rarete = window.tirerRarete(difficulte);
    const modele = auHasard(window.MODELES_OBJETS);
    return window.fabriquerObjet(modele, rarete);
};

// =========================================================================
//  LA DESCRIPTION LISIBLE
// =========================================================================
//  Reconstruite à partir des chiffres réellement portés par l'objet : ce qui
//  est écrit est donc exactement ce qui est appliqué, sans risque d'écart
//  entre la vitrine et la mécanique.

const LIBELLES_BONUS = {
    critique:          v => `+${v}% de coup critique`,
    degatsPhys:        v => `+${v} dégât${v > 1 ? "s" : ""} physique${v > 1 ? "s" : ""}`,
    degatsMag:         v => `+${v} dégât${v > 1 ? "s" : ""} magique${v > 1 ? "s" : ""}`,
    degats:            v => `+${v} dégât${v > 1 ? "s" : ""}`,
    soin:              v => `+${v} soin${v > 1 ? "s" : ""}`,
    initiative:        v => `+${v} d'initiative`,
    parade:            v => `+${v} de parade`,
    resPhys:           v => `+${v}% de résistance physique`,
    resMag:            v => `+${v}% de résistance magique`,
    portee:            v => `+${v} de portée`,
    allonge:           v => `+${v} d'allonge`,
    coutDeplacement:   v => v < 0 ? `${v} au coût de déplacement` : `+${v} au coût de déplacement`,
    ignoreArmure:      v => `${v}% d'ignorer l'armure`,
    ignoreResistances: v => `${v}% d'ignorer les résistances`,
    hexApresAttaque:   v => `+${v} case${v > 1 ? "s" : ""} de mouvement après l'attaque`
};

const LIBELLES_ETATS = {
    "Empoisonnement": "d'empoisonnement", "Étourdi": "d'étourdissement", "Glacé": "de gelée",
    "Brûlé": "de brûlure", "Immobilisation": "d'immobilisation", "Peur": "de peur",
    "Poussée": "de repousser", "Traction": "de tracter", "Provocation": "de provoquer"
};

window.decrireObjet = function(objet) {
    const morceaux = [];

    window.CLES_BONUS.forEach(cle => {
        const v = objet.bonus ? objet.bonus[cle] : 0;
        if (v) morceaux.push(LIBELLES_BONUS[cle](v));
    });

    (objet.etats || []).forEach(e => {
        morceaux.push(`${e.chance}% de chance ${LIBELLES_ETATS[e.etat] || e.etat.toLowerCase()}`);
    });

    (objet.effets || []).forEach(e => {
        if (e.buff) morceaux.push(`${e.chance}% de chance de gagner +${e.buff.initiative} d'initiative pendant ${e.buff.tours} tours`);
        if (e.buffSoi) morceaux.push(`+${e.buffSoi.initiative} d'initiative pendant ${e.buffSoi.tours} tours sur soi`);
        if (e.beniSoin) {
            const b = e.beniSoin;
            if (b.resMag)    morceaux.push(`+${b.resMag}% de résistance magique sur la cible d'un soin pendant ${b.tours} tour(s)`);
            if (b.resPhys)   morceaux.push(`+${b.resPhys}% de résistance physique sur la cible d'un soin pendant ${b.tours} tour(s)`);
            if (b.degatsPct) morceaux.push(`+${b.degatsPct}% de dégâts sur la cible d'un soin pendant ${b.tours} tour(s)`);
        }
    });

    return morceaux.join(", ");
};

// =========================================================================
//  CE QUE PORTE UN PERSONNAGE
// =========================================================================
//  Un seul endroit additionne les trois emplacements. Les fonctions de stats
//  (app.js) et le moteur de combat lisent ce total, jamais les objets un par un.
//  Une arme à deux mains est enregistrée dans les DEUX emplacements avec le
//  même uid : elle est donc dédoublonnée ici, sinon ses bonus compteraient
//  double.

window.objetsEquipes = function(perso) {
    if (!perso) return [];
    const bruts = [perso.equipArmure, perso.equipMainDroite, perso.equipMainGauche].filter(o => o && o.nom);
    const vus = new Set();
    return bruts.filter(o => {
        if (o.uid && vus.has(o.uid)) return false;
        if (o.uid) vus.add(o.uid);
        return true;
    });
};

window.bonusEquipement = function(perso) {
    const total = {};
    window.CLES_BONUS.forEach(cle => total[cle] = 0);
    window.objetsEquipes(perso).forEach(objet => {
        const bonus = objet.bonus || {};
        window.CLES_BONUS.forEach(cle => { total[cle] += (parseInt(bonus[cle]) || 0); });
    });
    return total;
};

// Les états que l'équipement peut infliger sur une attaque, tous objets
// confondus (le gourdin qui étourdit, l'effet de rareté qui empoisonne...).
window.etatsEquipement = function(perso) {
    const etats = [];
    window.objetsEquipes(perso).forEach(o => (o.etats || []).forEach(e => etats.push(e)));
    return etats;
};

// Idem pour les effets qui ne sont ni un bonus chiffré ni un état.
window.effetsSpeciauxEquipement = function(perso) {
    const effets = [];
    window.objetsEquipes(perso).forEach(o => (o.effets || []).forEach(e => effets.push(e)));
    return effets;
};

// Le personnage a-t-il la caractéristique exigée par l'objet ? Les caracs
// vivent dans leur propre collection ("Caracteristiques"), chargée en cache
// par la fiche perso : on lit ce cache, et à défaut on refuse de bloquer
// (mieux vaut laisser équiper que bloquer sur une lecture manquante).
window.CLE_CARAC_PAR_NOM = {
    "FORCE": "force", "DEXTÉRITÉ": "dex", "CONSTITUTION": "con",
    "INTELLIGENCE": "int", "SAGESSE": "sag", "CHARISME": "cha"
};

// Les caractéristiques de tous les combattants de la partie, chargées depuis
// Firestore (app.js). Elles ne peuvent PAS venir du seul cache local : celui-ci
// ne se remplit qu'en ouvrant la fiche d'un héros, si bien qu'un joueur voyait
// « prérequis non atteint » sur son écran là où son voisin, qui n'avait jamais
// ouvert cette fiche, pouvait équiper l'objet sans rien remarquer. Deux écrans,
// deux règles.
window.CARACS_PARTIE = window.CARACS_PARTIE || {};

// Le nom est comparé sans casse ni accents : "Force", "FORCE" et "force"
// désignent la même caractéristique. Une correspondance stricte renvoyait null
// au moindre écart, et un prérequis qui renvoie null ne bloque rien du tout —
// l'objet devenait équipable par n'importe qui, sans le moindre message.
const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
const CARAC_NORMALISEE = {};
Object.keys(window.CLE_CARAC_PAR_NOM).forEach(nom => {
    CARAC_NORMALISEE[sansAccent(nom)] = window.CLE_CARAC_PAR_NOM[nom];
});

window.caracDuPersonnage = function(idPersonnage, nomCarac) {
    const cle = window.CLE_CARAC_PAR_NOM[nomCarac] || CARAC_NORMALISEE[sansAccent(nomCarac)];
    if (!cle) return null;

    const partagees = (window.CARACS_PARTIE || {})[idPersonnage];
    if (partagees && partagees[cle] !== undefined) return parseInt(partagees[cle]);

    // Repli sur le cache du navigateur : il reste utile hors partie (la fiche
    // consultée seule) et tant que la lecture réseau n'est pas revenue.
    try {
        const brut = localStorage.getItem("ivalis_caracs_" + idPersonnage);
        if (!brut) return null;
        const caracs = JSON.parse(brut);
        return parseInt(caracs[cle]);
    } catch (e) { return null; }
};

// { possible, valeur, manque } — "possible" reste vrai si la carac est
// inconnue : on ne bloque jamais sur une donnée qu'on n'a pas pu lire.
window.peutEquiper = function(idPersonnage, objet) {
    if (!objet) return { possible: false };
    const requis = parseInt(objet.prerequis) || 0;
    if (requis <= 0) return { possible: true, valeur: null, manque: 0 };
    const valeur = window.caracDuPersonnage(idPersonnage, objet.carac);
    if (valeur === null || isNaN(valeur)) return { possible: true, valeur: null, manque: 0 };
    return { possible: valeur >= requis, valeur: valeur, manque: Math.max(0, requis - valeur) };
};

// =========================================================================
//  CE QUE L'ÉQUIPEMENT AUTORISE À LANCER
// =========================================================================
//  Chaque technique porte le type d'arme choisi à la Forge. Une hache ne peut
//  pas servir une technique d'attaque légère, et un sort demande une main
//  libre. La règle est un contrôle de CONTRADICTION, pas d'exigence : un héros
//  qui ne porte aucune arme n'a rien qui s'oppose à sa technique — c'est
//  seulement ce qu'il tient en main qui peut l'en empêcher.

window.TYPES_ARMES_FORGE = ["Arme légère CAC", "Arme lourde CAC", "Arme polyvalente",
                            "Arme légère Distance", "Magie"];

// Les armes tenues en main (ni bague, ni bouclier, ni armure).
window.armesEnMain = function(perso) {
    return window.objetsEquipes(perso).filter(o =>
        !o.bague && window.TYPES_ARMES_FORGE.includes(o.type) && o.type !== "Magie");
};

// Une main est "libre" si elle est vide ou si elle ne porte qu'une bague :
// une bague se glisse au doigt, elle ne ferme pas la main.
window.aUneMainLibre = function(perso) {
    if (!perso) return true;
    return [perso.equipMainDroite, perso.equipMainGauche]
        .some(o => !o || !o.nom || o.bague === true);
};

// null = la carte peut partir ; sinon, la phrase à montrer au joueur.
window.raisonBlocageCarte = function(perso, arme) {
    if (!perso || !arme || arme === "Sans arme / Arme rp" || arme === "Non spécifié") return null;

    if (arme === "Magie") {
        return window.aUneMainLibre(perso) ? null
             : "Les deux mains sont prises : il faut une main libre pour lancer un sort.";
    }

    const portees = window.armesEnMain(perso);
    if (portees.length === 0) return null;                        // rien en main, rien ne s'y oppose
    if (portees.some(o => o.type === arme)) return null;
    return `${portees.map(o => o.nom).join(" et ")} ne permet pas une technique « ${arme} ».`;
};
