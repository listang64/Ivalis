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

// Le champ "type" d'un objet (colonne Type du tableau) sert d'abord au moteur
// de combat — c'est lui qui décide quelle technique peut partir. Ce libellé
// n'en est que la traduction lisible, affichée sur les cartes de butin et
// d'inventaire pour qu'on sache d'un coup d'œil si une arme trouvée correspond
// à ce que le héros sait manier.
window.LIBELLE_TYPE_OBJET = {
    "Arme légère CAC":     "Arme légère (corps à corps)",
    "Arme lourde CAC":     "Arme lourde (corps à corps)",
    "Arme polyvalente":    "Arme polyvalente",
    "Arme légère Distance":"Arme à distance",
    "Bouclier":            "Bouclier",
    "Magie":               "Magie",
    "Armure légère":       "Armure légère",
    "Armure intermédiaire":"Armure moyenne",
    "Armure lourde":       "Armure lourde"
};
window.libelleTypeObjet = function(type) {
    return window.LIBELLE_TYPE_OBJET[type] || type || "";
};

// La caractéristique qui MODIFIE l'objet (colonne "Modificateur" du tableau),
// écrite comme un mot et non comme un cri : "DEXTÉRITÉ" devient "Dextérité".
window.libelleCaracObjet = function(carac) {
    const brut = String(carac || "").trim();
    if (!brut) return "";
    const minuscules = brut.toLocaleLowerCase("fr");
    return minuscules.charAt(0).toLocaleUpperCase("fr") + minuscules.slice(1);
};

// L'ÉTIQUETTE D'UN OBJET, LA MÊME PARTOUT : « Rare · Arme légère (corps à
// corps) Dextérité · deux mains ». La carac suit le type, en petit et en
// marron : on voit du même coup d'œil quelle caractéristique fait mordre
// l'arme — et laquelle il faudra avoir pour la porter. Les armures, boucliers
// et bagues la portent de la même façon. Rendue en HTML (la carac a son
// propre style) : elle se pose avec innerHTML, jamais innerText.
window.etiquetteObjetHTML = function(objet, options) {
    if (!objet) return "";
    const avecDeuxMains = !options || options.deuxMains !== false;
    const type = window.libelleTypeObjet(objet.type);
    const carac = typeof window.texteCaracsObjet === "function"
        ? window.texteCaracsObjet(objet) : window.libelleCaracObjet(objet.carac);
    const typeEtCarac = [type, carac ? `<span class="carac-objet">${carac}</span>` : ""]
        .filter(Boolean).join(" ");
    return [objet.rarete, typeEtCarac, avecDeuxMains && objet.deuxMains ? "deux mains" : null]
        .filter(Boolean).join(" · ");
};

// Loot_Ivalis.xlsx — % de chance de loot par catégorie, selon la difficulté.
// L'épique ne tombe que sur un boss (ligne "TRÈS DIFFICILE").
window.CHANCES_RARETE = {
    "Normale":        { "Commun": 75, "Rare": 20, "Très rare": 5,  "Épique": 0 },
    "Difficile":      { "Commun": 55, "Rare": 30, "Très rare": 15, "Épique": 0 },
    "Très difficile": { "Commun": 20, "Rare": 40, "Très rare": 35, "Épique": 5 }
};

// LE BUTIN PAR MONSTRE VAINCU (Nico, v269, « Vierge 1 ») : chaque créature
// tombée rapporte un objet, dont la rareté se tire sur la ligne de SA stature
// (Petit ou Normal) au niveau du groupe. Un Boss lit la ligne Normal, la plus
// haute du tableau. Au-delà du niveau 10, la ligne du 10.
window.CHANCES_BUTIN_NIVEAU = {
    1:  { Petit: { "Commun": 85, "Rare": 15, "Très rare": 0,  "Épique": 0 },
          Normal: { "Commun": 50, "Rare": 35, "Très rare": 12, "Épique": 3 } },
    2:  { Petit: { "Commun": 80, "Rare": 17, "Très rare": 3,  "Épique": 0 },
          Normal: { "Commun": 50, "Rare": 30, "Très rare": 15, "Épique": 5 } },
    3:  { Petit: { "Commun": 75, "Rare": 20, "Très rare": 5,  "Épique": 0 },
          Normal: { "Commun": 45, "Rare": 35, "Très rare": 15, "Épique": 5 } },
    4:  { Petit: { "Commun": 70, "Rare": 23, "Très rare": 6,  "Épique": 1 },
          Normal: { "Commun": 45, "Rare": 30, "Très rare": 18, "Épique": 7 } },
    5:  { Petit: { "Commun": 65, "Rare": 25, "Très rare": 8,  "Épique": 2 },
          Normal: { "Commun": 40, "Rare": 35, "Très rare": 18, "Épique": 7 } },
    6:  { Petit: { "Commun": 60, "Rare": 27, "Très rare": 10, "Épique": 3 },
          Normal: { "Commun": 40, "Rare": 30, "Très rare": 20, "Épique": 10 } },
    7:  { Petit: { "Commun": 55, "Rare": 30, "Très rare": 11, "Épique": 4 },
          Normal: { "Commun": 35, "Rare": 35, "Très rare": 20, "Épique": 10 } },
    8:  { Petit: { "Commun": 50, "Rare": 33, "Très rare": 12, "Épique": 5 },
          Normal: { "Commun": 35, "Rare": 30, "Très rare": 23, "Épique": 12 } },
    9:  { Petit: { "Commun": 45, "Rare": 36, "Très rare": 13, "Épique": 6 },
          Normal: { "Commun": 30, "Rare": 35, "Très rare": 23, "Épique": 12 } },
    10: { Petit: { "Commun": 40, "Rare": 39, "Très rare": 14, "Épique": 7 },
          Normal: { "Commun": 30, "Rare": 30, "Très rare": 25, "Épique": 15 } }
};

// Le tableau de Nico reste la référence ; Paramètres > Outils > Butin le règle
// (v270, Monstres_Modeles/_REGLAGES, champ Butin_Niveaux) et « Rétablir »
// y revient.
window.CHANCES_BUTIN_NIVEAU_DEFAUT = JSON.parse(JSON.stringify(window.CHANCES_BUTIN_NIVEAU));

// Borne un tableau réglé : chaque case un entier de 0 à 100 ; une ligne
// illisible ou toute à zéro reprend celle de Nico. Les lignes n'ont pas
// besoin de faire 100 : le tirage les lit comme des poids.
window.normaliserTableButin = function(brut) {
    const defaut = window.CHANCES_BUTIN_NIVEAU_DEFAUT;
    const table = {};
    Object.keys(defaut).forEach(n => {
        table[n] = {};
        ["Petit", "Normal"].forEach(st => {
            const source = ((brut || {})[n] || {})[st] || {};
            const ligne = {};
            window.RARETES.forEach(r => {
                const v = Math.round(Number(source[r]));
                ligne[r] = Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : defaut[n][st][r];
            });
            const total = window.RARETES.reduce((t, r) => t + ligne[r], 0);
            table[n][st] = total > 0 ? ligne : { ...defaut[n][st] };
        });
    });
    return table;
};

// Pose le tableau réglé (ou celui de Nico quand `brut` est vide).
window.appliquerTableButin = function(brut) {
    window.CHANCES_BUTIN_NIVEAU = brut ? window.normaliserTableButin(brut)
                                       : JSON.parse(JSON.stringify(window.CHANCES_BUTIN_NIVEAU_DEFAUT));
    if (typeof window.dessinerTableButin === "function") window.dessinerTableButin();
    return window.CHANCES_BUTIN_NIVEAU;
};
// Le réglage a pu arriver avant ce fichier (monstres.js le lit au démarrage).
if (window.TABLE_BUTIN_REGLEE !== undefined) window.appliquerTableButin(window.TABLE_BUTIN_REGLEE);

// La ligne du tableau d'un niveau et d'une stature. Tout ce qui n'est pas
// « Petit » lit la ligne Normal (le Boss compris).
window.statureDuButin = (palier) => (palier === "Petit" ? "Petit" : "Normal");
window.lignesButinNiveau = function(niveau, stature) {
    const n = Math.min(10, Math.max(1, Math.round(Number(niveau) || 1)));
    return window.CHANCES_BUTIN_NIVEAU[n][window.statureDuButin(stature)];
};

// La rareté d'UN objet de butin. `alea` (0..1) se passe pour les bancs d'essai.
window.tirerRareteButin = function(niveau, stature, alea) {
    const table = window.lignesButinNiveau(niveau, stature);
    const total = window.RARETES.reduce((s, r) => s + (table[r] || 0), 0);
    let jet = (alea === undefined ? Math.random() : alea) * total;
    for (const rarete of window.RARETES) {
        jet -= (table[rarete] || 0);
        if (jet < 0) return rarete;
    }
    return "Commun";
};

// La caractéristique minimale exigée pour PORTER l'objet, selon sa rareté.
// Revu par Nico : 10 / 11 / 12 / 13 (c'était 0 / 10 / 12 / 12). L'équipement
// de départ, lui, n'en a aucune (voir equipementDeDepart).
window.PREREQUIS_RARETE = { "Commun": 10, "Rare": 11, "Très rare": 12, "Épique": 13 };

// QUELLE(S) CARACTÉRISTIQUE(S) OUVRENT UNE ARMURE. Une arme, un bouclier, une
// bague n'en ont qu'une (celle du modèle). Une armure en accepte plusieurs, et
// UNE SEULE qui atteint le prérequis suffit (règle de Nico) : la légère
// l'intelligence OU le charisme, l'intermédiaire la dextérité OU la sagesse,
// la lourde la force seule. Lue par TYPE, pour que les armures déjà portées
// suivent la règle elles aussi.
window.CARACS_ARMURE = {
    "Armure légère":        ["INTELLIGENCE", "CHARISME"],
    "Armure intermédiaire": ["DEXTÉRITÉ", "SAGESSE"],
    "Armure lourde":        ["FORCE"]
};
// LES BAGUES DE DÉGÂTS AUSSI (Nico) : l'intelligence OU le charisme — le
// mage et le maître de la Distorsion mentale y ont droit tous les deux. Lue par
// MODÈLE, pour que les bagues déjà trouvées suivent la règle.
window.CARACS_MODELE = {
    "Bagues DPS": ["INTELLIGENCE", "CHARISME"],
    // (v476) « FORCE (parade) ou DEXTÉRITÉ (esquive) ».
    "Lance courte": ["FORCE", "DEXTÉRITÉ"]
};
window.caracsRequisesObjet = function(objet) {
    if (!objet) return [];
    return window.CARACS_ARMURE[objet.type] || window.CARACS_MODELE[objet.modele]
        || (objet.carac ? [objet.carac] : []);
};
// « Intelligence ou Charisme », prêt à écrire dans une phrase.
window.texteCaracsObjet = function(objet) {
    return window.caracsRequisesObjet(objet).map(c => window.libelleCaracObjet(c)).join(" ou ");
};

// -------------------------------------------------------------------------
//  Les bonus qu'un objet peut porter. Toute la mécanique de combat ne lit
//  QUE ces clés — ajouter un effet, c'est ajouter une clé ici et la brancher
//  au bon endroit, jamais analyser du texte.
// -------------------------------------------------------------------------
window.CLES_BONUS = [
    "critique",          // points de % de coup critique
    "degatsPhys",        // dégâts plats sur les attaques physiques
    "degatsMag",         // dégâts plats sur les attaques magiques ou brutes
    "degats",            // dégâts plats, quel que soit le type (effets A/B)
    "soin",              // points de soin en plus
    "initiative",        // initiative des cartes lancées
    "parade",            // points de parade
    "esquive",           // (v476) points d'esquive (le bouclier léger)
    "paradeOuEsquive",   // (v476) la lance courte : parade (FORCE) ou esquive (DEXTÉRITÉ), voir bonusEquipement
    "resPhys",           // points de % de résistance physique
    "resMag",            // points de % de résistance magique
    "portee",            // cases de portée en plus (attaques à distance)
    "allonge",           // cases de portée en plus, MAIS l'attaque reste au contact
    "coutDeplacement",   // modificateur du coût en énergie de chaque case
    "ignoreArmure",      // % de chance d'ignorer la résistance PHYSIQUE de la cible
    "ignoreResistances", // % de chance d'ignorer TOUTE résistance de la cible
    "hexApresAttaque",   // cases de déplacement offertes après une attaque
    "degatsOpportunite"  // (v360) dégâts en plus des attaques d'opportunité
];

// =========================================================================
//  LES TROIS RÉSERVOIRS D'EFFETS (colonnes J, K et L du tableau)
// =========================================================================
//  Chaque effet est décrit par ce qu'il FAIT, jamais par sa phrase : le texte
//  affiché est reconstruit ensuite. "chance" est un pourcentage ; un effet qui
//  n'en a pas s'applique toujours.
//
//  « 2X Effet » : le MÊME effet compté deux fois — sa chance quand il en a une,
//  sinon sa valeur ; une durée ne double pas (Nico : « 2 fois +5 % saignement
//  max fera +10 % » ; « +8 % de résistance magique pendant 2 tours donne +16 %
//  pendant 2 tours »).

const ETAT_EFFET = (nom, chance, libelle) => ({ cle: "etat_" + nom, etat: nom, chance, libelle });

// Colonne J — EFFET A (arme de contact). (v476) Tableau de Nico mis à jour :
// les états deviennent des AUGMENTATIONS MAX (« +5 % de chance de saignement
// max ») — ils ne s'ajoutent qu'à une carte qui porte déjà cet état, par-dessus
// son plafond (appliquerEquipementALaCarte, moteur_effets.js). Saignement et
// Électrifié rejoignent le réservoir, la Provocation passe à 8 %.
window.EFFETS_A = [
    { cle: "degats",            bonus: { degats: 1 },            libelle: "dégât" },
    ETAT_EFFET("Empoisonnement", 5, "empoisonnement"),
    ETAT_EFFET("Étourdi",        5, "étourdissement"),
    ETAT_EFFET("Glacé",          5, "gelée"),
    ETAT_EFFET("Brûlé",          5, "brûlure"),
    ETAT_EFFET("Immobilisation", 5, "immobilisation"),
    ETAT_EFFET("Peur",           5, "peur"),
    ETAT_EFFET("Poussée",        5, "poussée"),
    ETAT_EFFET("Saignement",     5, "saignement"),
    { cle: "initTemporaire",    chance: 10, buff: { initiative: 15, tours: 2 }, libelle: "élan" },
    { cle: "hexApresAttaque",   bonus: { hexApresAttaque: 1 },   libelle: "repli" },
    ETAT_EFFET("Provocation",    8, "provocation"),
    { cle: "initiative",        bonus: { initiative: 5 },        libelle: "initiative" },
    { cle: "critique",          bonus: { critique: 3 },          libelle: "critique" },
    { cle: "ignoreResistances", bonus: { ignoreResistances: 10 }, libelle: "perce-résistances" },
    ETAT_EFFET("Électrifié",     5, "électrification")
];

// Colonne K — EFFET B (arme à distance). (v476) Peur à 3 %, Traction à 5 %,
// plus la Confusion (3 %), le Saignement et l'Électrifié.
window.EFFETS_B = [
    { cle: "degats",            bonus: { degats: 1 },            libelle: "dégât" },
    ETAT_EFFET("Empoisonnement", 5, "empoisonnement"),
    ETAT_EFFET("Étourdi",        5, "étourdissement"),
    ETAT_EFFET("Glacé",          5, "gelée"),
    ETAT_EFFET("Brûlé",          5, "brûlure"),
    ETAT_EFFET("Immobilisation", 5, "immobilisation"),
    ETAT_EFFET("Peur",           3, "peur"),
    ETAT_EFFET("Poussée",        5, "poussée"),
    ETAT_EFFET("Traction",       5, "traction"),
    { cle: "initTemporaire",    chance: 10, buff: { initiative: 15, tours: 2 }, libelle: "élan" },
    { cle: "hexApresAttaque",   bonus: { hexApresAttaque: 1 },   libelle: "repli" },
    ETAT_EFFET("Provocation",    8, "provocation"),
    { cle: "critique",          bonus: { critique: 3 },          libelle: "critique" },
    { cle: "initiative",        bonus: { initiative: 5 },        libelle: "initiative" },
    { cle: "ignoreResistances", bonus: { ignoreResistances: 10 }, libelle: "perce-résistances" },
    ETAT_EFFET("Confusion",      3, "confusion"),
    ETAT_EFFET("Saignement",     5, "saignement"),
    ETAT_EFFET("Électrifié",     5, "électrification")
];

// Colonne L — EFFET C (soins). Les trois "sur un sort de soin pendant 1 tour"
// posent un état bénéfique sur la CIBLE du soin, pas sur le lanceur.
window.EFFETS_C = [
    { cle: "soin",           bonus: { soin: 1 },                                    libelle: "soin" },
    { cle: "beniMag",        beniSoin: { resMag: 8, tours: 1 },                     libelle: "bénédiction magique" },
    { cle: "beniPhys",       beniSoin: { resPhys: 8, tours: 1 },                    libelle: "bénédiction physique" },
    { cle: "beniDegats",     beniSoin: { degatsPct: 8, tours: 1 },                  libelle: "bénédiction offensive" },
    { cle: "initSoi",        buffSoi: { initiative: 10, tours: 3 },                 libelle: "hâte" }
    // (« +10 % d'ignorer les résistances » retiré des effets de soin : tableau de Nico.)
];

window.RESERVOIRS_EFFETS = { A: window.EFFETS_A, B: window.EFFETS_B, C: window.EFFETS_C };

// =========================================================================
//  LES MODÈLES (colonnes A à H du tableau)
// =========================================================================
//  "paliers" donne les bonus chiffrés de chaque rareté. Une valeur écrite
//  [min, max] est tirée au sort dans cette fourchette (armures, boucliers).
//  "etatsPropres" : les « +X % de chance de … max » de l'arme elle-même, des
//  augmentations max (voir EFFETS_A).
//
//  (v476) LES EFFETS DE RARETÉ SONT ÉCRITS PALIER PAR PALIER, comme dans le
//  tableau : `effets: [nombre, fois]` — « + 1 Effet A » = [1, 1] ; « + 2X Effet
//  A » = [1, 2] (UN effet, compté deux fois : « +5 % saignement max » devient
//  +10 %, « +8 % de résistance magique pendant 1 tour » devient +16 % pendant
//  1 tour — la durée ne double pas) ; « + 2 Effet B » = [2, 1] (deux effets
//  différents) ; « + 2X (2 Effet B) » = [2, 2]. Le réservoir (A, B ou C) est
//  celui du modèle.
// -------------------------------------------------------------------------

window.MODELES_OBJETS = [
    // --- Armes et boucliers à une main ------------------------------------
    {
        modele: "Dague", type: "Arme légère CAC", emplacement: "Main", deuxMains: false,
        carac: "DEXTÉRITÉ", noms: ["Sica", "Panazonium"], effets: { reservoir: "A" },
        paliers: {
            "Commun":    { critique: 3 },
            "Rare":      { critique: 6 },
            "Très rare": { critique: 9 },
            "Épique":    { critique: 9, effets: [1, 1] }
        }
    },
    {
        modele: "Couteau", type: "Arme légère CAC", emplacement: "Main", deuxMains: false,
        carac: "DEXTÉRITÉ", noms: ["Couteau"], effets: { reservoir: "A" },
        paliers: {
            "Commun":    { coutDeplacement: -1 },
            "Rare":      { critique: 3, coutDeplacement: -1 },
            "Très rare": { critique: 5, coutDeplacement: -1, initiative: 3 },
            "Épique":    { critique: 5, coutDeplacement: -1, initiative: 3, effets: [1, 1] }
        }
    },
    {
        modele: "Épée courte", type: "Arme lourde CAC", emplacement: "Main", deuxMains: false,
        carac: "FORCE", noms: ["Glaive", "Xiphos"], effets: { reservoir: "A" },
        paliers: {
            "Commun":    { initiative: 5 },
            "Rare":      { degatsPhys: 1, initiative: 5 },
            "Très rare": { degatsPhys: 2, initiative: 5 },
            "Épique":    { degatsPhys: 2, initiative: 5, effets: [1, 1] }
        }
    },
    {
        modele: "Épée courbée", type: "Arme légère CAC", emplacement: "Main", deuxMains: false,
        carac: "DEXTÉRITÉ", noms: ["Harpé", "Machaira", "Falcata"], effets: { reservoir: "A" },
        paliers: {
            "Commun":    { degatsPhys: 1 },
            "Rare":      { degatsPhys: 1, critique: 3 },
            "Très rare": { degatsPhys: 2, critique: 3 },
            "Épique":    { degatsPhys: 2, critique: 3, effets: [1, 1] }
        }
    },
    {
        modele: "Hache", type: "Arme lourde CAC", emplacement: "Main", deuxMains: false,
        carac: "FORCE", noms: ["Sagaris", "Labrys"], effets: { reservoir: "A" },
        paliers: {
            "Commun":    { etatsPropres: [{ etat: "Saignement", chance: 5 }] },
            "Rare":      { etatsPropres: [{ etat: "Saignement", chance: 5 }], degatsPhys: 1 },
            "Très rare": { etatsPropres: [{ etat: "Saignement", chance: 5 }], degatsPhys: 2 },
            "Épique":    { etatsPropres: [{ etat: "Saignement", chance: 5 }], degatsPhys: 2, effets: [1, 1] }
        }
    },
    {
        modele: "Gourdin", type: "Arme lourde CAC", emplacement: "Main", deuxMains: false,
        carac: "FORCE", noms: ["Gourdin"], effets: { reservoir: "A" },
        paliers: {
            "Commun":    { etatsPropres: [{ etat: "Étourdi", chance: 5 }] },
            "Rare":      { etatsPropres: [{ etat: "Étourdi", chance: 10 }] },
            "Très rare": { etatsPropres: [{ etat: "Étourdi", chance: 10 }], degatsPhys: 1 },
            "Épique":    { etatsPropres: [{ etat: "Étourdi", chance: 10 }], degatsPhys: 1, effets: [1, 1] }
        }
    },
    {
        modele: "Masse", type: "Arme lourde CAC", emplacement: "Main", deuxMains: false,
        carac: "FORCE", noms: ["Gada"], effets: { reservoir: "A" },
        paliers: {
            "Commun":    { ignoreArmure: 10 },
            "Rare":      { ignoreArmure: 20 },
            "Très rare": { ignoreArmure: 30 },
            "Épique":    { ignoreArmure: 35, effets: [1, 1] }
        }
    },
    {
        // (v476) « FORCE (parade) ou DEXTÉRITÉ (esquive) » : l'une ou l'autre
        // suffit pour la porter (CARACS_MODELE), et le bonus va à la parade ou à
        // l'esquive selon la meilleure des deux chez celui qui la tient
        // (bonusEquipement). Une main seulement, la droite (loot.js).
        modele: "Lance courte", type: "Arme lourde CAC", emplacement: "Main", deuxMains: false,
        carac: "FORCE", noms: ["Doratium", "Gladius"], effets: { reservoir: "A" },
        paliers: {
            "Commun":    { paradeOuEsquive: 3 },
            "Rare":      { paradeOuEsquive: 6 },
            "Très rare": { paradeOuEsquive: 6, degatsPhys: 1 },
            "Épique":    { paradeOuEsquive: 6, degatsPhys: 1, effets: [1, 1] }
        }
    },
    {
        // Une main, la droite (loot.js), comme la lance courte.
        modele: "Javelots", type: "Arme polyvalente", emplacement: "Main", deuxMains: false,
        carac: "FORCE", noms: ["Hasta", "Pilum"], effets: { reservoir: "B" },
        paliers: {
            "Commun":    { degatsPhys: 1 },
            "Rare":      { degatsPhys: 2 },
            "Très rare": { degatsPhys: 3 },
            "Épique":    { degatsPhys: 3, effets: [1, 1] }
        }
    },
    {
        // Une arme à distance : à deux mains, comme toutes (v476, Nico).
        modele: "Fronde", type: "Arme légère Distance", emplacement: "Main", deuxMains: true,
        carac: "DEXTÉRITÉ", noms: ["Fronde"], effets: { reservoir: "B" },
        paliers: {
            "Commun":    { etatsPropres: [{ etat: "Immobilisation", chance: 5 }],  portee: 1 },
            "Rare":      { etatsPropres: [{ etat: "Immobilisation", chance: 10 }], portee: 1, degatsPhys: 1 },
            "Très rare": { etatsPropres: [{ etat: "Immobilisation", chance: 15 }], portee: 2, degatsPhys: 1 },
            "Épique":    { etatsPropres: [{ etat: "Immobilisation", chance: 15 }], portee: 2, degatsPhys: 1, effets: [1, 2] }
        }
    },
    {
        modele: "Bouclier léger", type: "Bouclier", emplacement: "Main", deuxMains: false,
        carac: "DEXTÉRITÉ", noms: ["Pelta", "Caetra"], effets: { reservoir: "A" },
        paliers: {
            "Commun":    { esquive: [3, 5] },
            "Rare":      { esquive: [6, 8] },
            "Très rare": { esquive: [6, 8], initiative: 5 },
            "Épique":    { esquive: 8, initiative: 5, effets: [1, 1] }
        }
    },
    {
        modele: "Bouclier intermédiaire", type: "Bouclier", emplacement: "Main", deuxMains: false,
        carac: "FORCE", noms: ["Aspis", "Clipeus"], effets: { reservoir: "A" },
        paliers: {
            "Commun":    { parade: 20 },
            "Rare":      { parade: [21, 23] },
            "Très rare": { parade: [24, 26] },
            "Épique":    { parade: 26, effets: [1, 1] }
        }
    },
    {
        modele: "Bouclier lourd", type: "Bouclier", emplacement: "Main", deuxMains: false,
        carac: "FORCE", noms: ["Scutum"], effets: { reservoir: "A" },
        paliers: {
            "Commun":    { parade: [23, 25], coutDeplacement: 1 },
            "Rare":      { parade: [26, 28], coutDeplacement: 1 },
            "Très rare": { parade: [29, 31], coutDeplacement: 1 },
            "Épique":    { parade: 31, coutDeplacement: 1, effets: [1, 1] }
        }
    },

    // --- Armes à deux mains -----------------------------------------------
    {
        modele: "Hache à deux mains", type: "Arme lourde CAC", emplacement: "Main", deuxMains: true,
        carac: "FORCE", noms: ["Hache à deux mains"], effets: { reservoir: "A" },
        paliers: {
            "Commun":    { etatsPropres: [{ etat: "Saignement", chance: 10 }] },
            "Rare":      { etatsPropres: [{ etat: "Saignement", chance: 10 }], degatsPhys: 2 },
            "Très rare": { etatsPropres: [{ etat: "Saignement", chance: 10 }], degatsPhys: 3, effets: [1, 1] },
            "Épique":    { etatsPropres: [{ etat: "Saignement", chance: 10 }], degatsPhys: 4, effets: [1, 2] }
        }
    },
    {
        modele: "Masse à deux mains", type: "Arme lourde CAC", emplacement: "Main", deuxMains: true,
        carac: "FORCE", noms: ["Gada à deux mains"], effets: { reservoir: "A" },
        paliers: {
            "Commun":    { ignoreArmure: 20 },
            "Rare":      { ignoreArmure: 40 },
            "Très rare": { ignoreArmure: 60 },
            "Épique":    { ignoreArmure: 70, effets: [1, 2] }
        }
    },
    {
        modele: "Lance à deux mains", type: "Arme lourde CAC", emplacement: "Main", deuxMains: true,
        carac: "FORCE", noms: ["Lance lourde"], effets: { reservoir: "A" },
        paliers: {
            "Commun":    { allonge: 1, degatsPhys: 1 },
            "Rare":      { allonge: 1, degatsPhys: 2, etatsPropres: [{ etat: "Poussée", chance: 5 }] },
            "Très rare": { allonge: 1, degatsPhys: 3, etatsPropres: [{ etat: "Poussée", chance: 5 }], effets: [1, 1] },
            "Épique":    { allonge: 1, degatsPhys: 3, etatsPropres: [{ etat: "Poussée", chance: 10 }], effets: [1, 2] }
        }
    },
    {
        // Typée "Arme légère CAC" dans le tableau malgré ses deux mains :
        // transcrit tel quel, c'est la Falx.
        modele: "Épée à deux mains", type: "Arme légère CAC", emplacement: "Main", deuxMains: true,
        carac: "DEXTÉRITÉ", noms: ["Falx"], effets: { reservoir: "A" },
        paliers: {
            "Commun":    { degatsPhys: 1, initiative: 5 },
            "Rare":      { degatsPhys: 2, initiative: 10 },
            "Très rare": { degatsPhys: 3, initiative: 10, effets: [1, 1] },
            "Épique":    { degatsPhys: 4, initiative: 10, effets: [1, 2] }
        }
    },

    // --- Armes à distance : TOUTES à deux mains (v476, Nico) ---------------
    {
        modele: "Arc court", type: "Arme légère Distance", emplacement: "Main", deuxMains: true,
        carac: "DEXTÉRITÉ", noms: ["Arc court"], effets: { reservoir: "B" },
        paliers: {
            "Commun":    { portee: 1, degatsPhys: 1 },
            "Rare":      { portee: 1, degatsPhys: 2, effets: [1, 1] },
            "Très rare": { portee: 1, degatsPhys: 3, effets: [2, 1] },
            "Épique":    { portee: 1, degatsPhys: 4, effets: [1, 3] }
        }
    },
    {
        modele: "Gantelet lance-fléchette", type: "Arme légère Distance", emplacement: "Main", deuxMains: true,
        carac: "DEXTÉRITÉ", noms: ["Gantelet lance-fléchette"], effets: { reservoir: "B" },
        paliers: {
            "Commun":    { portee: 1, critique: 3 },
            "Rare":      { portee: 1, critique: 9 },
            "Très rare": { portee: 1, critique: 12, effets: [1, 1] },
            "Épique":    { portee: 1, critique: 15, effets: [2, 2] }
        }
    },
    {
        modele: "Sarbacane", type: "Arme légère Distance", emplacement: "Main", deuxMains: true,
        carac: "DEXTÉRITÉ", noms: ["Sarbacane"], effets: { reservoir: "B" },
        paliers: {
            "Commun":    { portee: 1, etatsPropres: [{ etat: "Empoisonnement", chance: 5 }] },
            "Rare":      { portee: 2, etatsPropres: [{ etat: "Empoisonnement", chance: 10 }] },
            "Très rare": { portee: 2, etatsPropres: [{ etat: "Empoisonnement", chance: 15 }], effets: [1, 1] },
            "Épique":    { portee: 2, etatsPropres: [{ etat: "Empoisonnement", chance: 20 }], effets: [2, 2] }
        }
    },

    // --- Magie ------------------------------------------------------------
    //  Une bague occupe une main, mais ne la ferme pas : elle ne compte pas
    //  comme main occupée pour la règle "lancer un sort demande une main libre".
    {
        modele: "Bagues DPS", type: "Magie", emplacement: "Main", deuxMains: false, bague: true,
        carac: "INTELLIGENCE", noms: ["Bague"], effets: { reservoir: "B" },
        paliers: {
            "Commun":    { degatsMag: 1 },
            "Rare":      { degatsMag: 1, effets: [1, 1] },
            "Très rare": { degatsMag: 2, effets: [1, 1] },
            "Épique":    { degatsMag: 2, effets: [1, 2] }
        }
    },
    {
        modele: "Bagues Soins", type: "Magie", emplacement: "Main", deuxMains: false, bague: true,
        carac: "SAGESSE", noms: ["Bague"], effets: { reservoir: "C" },
        paliers: {
            "Commun":    { soin: 1 },
            "Rare":      { soin: 1, effets: [1, 1] },
            "Très rare": { soin: 1, effets: [1, 2] },
            "Épique":    { soin: 1, effets: [1, 3] }
        }
    },

    // --- Armures (lignes 27 à 29) -----------------------------------------
    //  Les fourchettes [min, max] sont tirées au sort à la création de l'objet.
    //  Un épique tire son effet dans A, B ou C (au hasard), une seule fois :
    //  le tableau dit "+ 1 Effet A, B, ou C", pas "2X".
    {
        modele: "Armure légère", type: "Armure légère", emplacement: "Armure", deuxMains: false,
        carac: "INTELLIGENCE",
        noms: ["Tunique de lin", "Exômide", "Chiton de laine", "Robe de bure", "Cape de voyage"],
        effets: { reservoir: "ABC" },
        paliers: {
            "Commun":    { resMag: [15, 25], resPhys: 5 },
            "Rare":      { resMag: [20, 30], resPhys: [5, 10] },
            "Très rare": { resMag: [25, 40], resPhys: [10, 15] },
            "Épique":    { resMag: 40, resPhys: 15, effets: [1, 1] }
        }
    },
    {
        modele: "Armure intermédiaire", type: "Armure intermédiaire", emplacement: "Armure", deuxMains: false,
        carac: "DEXTÉRITÉ",
        noms: ["Spolas", "Linothorax", "Brigandine", "Jaque de cuir", "Cuirasse de cuir"],
        effets: { reservoir: "ABC" },
        paliers: {
            "Commun":    { resPhys: [10, 15], resMag: [10, 15] },
            "Rare":      { resPhys: [13, 20], resMag: [13, 20] },
            // Le seul palier avec une réserve à répartir : 10 points de plus,
            // distribués au hasard entre les deux résistances.
            "Très rare": { resPhys: [18, 26], resMag: [18, 26], aRepartir: 10 },
            "Épique":    { resPhys: 26, resMag: 26, effets: [1, 1] }
        }
    },
    {
        modele: "Armure lourde", type: "Armure lourde", emplacement: "Armure", deuxMains: false,
        carac: "FORCE",
        noms: ["Lorica", "Cuirasse de bronze", "Thorax hoplitique", "Cotte d'écailles", "Lorica segmentata"],
        effets: { reservoir: "ABC" },
        paliers: {
            "Commun":    { resPhys: [15, 25], resMag: 5 },
            "Rare":      { resPhys: [20, 30], resMag: [5, 10] },
            "Très rare": { resPhys: [25, 40], resMag: [10, 15] },
            "Épique":    { resPhys: 40, resMag: 15, effets: [1, 1] }
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
// `auPlusBas` : la valeur la plus basse de la fourchette, sans tirage — c'est
// l'armure de départ (règle de Nico).
function valeurPalier(v, auPlusBas) { return Array.isArray(v) ? (auPlusBas ? v[0] : entier(v[0], v[1])) : v; }

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

// « 2X », « 3X » : le même effet compté `fois` fois — sa chance s'il en a une,
// sinon sa valeur, jamais sa durée. Il reste UN effet.
function multiplierEffet(effet, fois) {
    const copie = JSON.parse(JSON.stringify(effet));
    const n = Math.max(1, Number(fois) || 1);
    if (n === 1) return copie;
    if (copie.chance !== undefined) {
        copie.chance = Math.min(100, copie.chance * n);
        return copie;
    }
    ["bonus", "buff", "buffSoi", "beniSoin"].forEach(cle => {
        if (!copie[cle]) return;
        Object.keys(copie[cle]).forEach(k => {
            if (k !== "tours" && typeof copie[cle][k] === "number") copie[cle][k] *= n;
        });
    });
    return copie;
}
window.multiplierEffetObjet = multiplierEffet;

// Les effets de rareté d'un palier (v476) : `effets: [nombre, fois]` — "nombre"
// effets distincts du réservoir du modèle, chacun compté "fois" fois.
window.tirerEffetsObjet = function(modele, rarete) {
    const palier = (modele.paliers || {})[rarete] || {};
    const [nombre, fois] = Array.isArray(palier.effets) ? palier.effets : [0, 1];
    if (!(nombre > 0)) return [];

    // "ABC" (les armures épiques) : le réservoir lui-même est tiré au sort.
    const regle = modele.effets || {};
    const nomReservoir = regle.reservoir === "ABC" ? auHasard(["A", "B", "C"]) : regle.reservoir;
    const reservoir = window.RESERVOIRS_EFFETS[nomReservoir] || window.EFFETS_A;

    const disponibles = [...reservoir];
    const tires = [];
    for (let i = 0; i < nombre && disponibles.length > 0; i++) {
        const effet = disponibles.splice(Math.floor(Math.random() * disponibles.length), 1)[0];
        tires.push(multiplierEffet(effet, fois));
    }
    return tires;
};

// Assemble un objet complet à partir d'un modèle et d'une rareté.
// `options.depart` : un objet de l'équipement de départ — aucun prérequis.
// `options.auPlusBas` : chaque fourchette prend sa valeur la plus basse.
window.fabriquerObjet = function(modele, rarete, options) {
    const opts = options || {};
    const palier = modele.paliers[rarete] || {};
    const bonus = {};
    const etats = [];

    Object.keys(palier).forEach(cle => {
        if (cle === "etatsPropres") {
            (palier[cle] || []).forEach(e => etats.push({ etat: e.etat, chance: e.chance }));
        } else if (cle !== "aRepartir" && cle !== "effets") {
            bonus[cle] = valeurPalier(palier[cle], !!opts.auPlusBas);
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
        if (effet.etat) {
            // Le même état que celui de l'arme (la hache qui fait déjà saigner) :
            // les deux s'additionnent sur une seule ligne.
            const deja = etats.find(e => e.etat === effet.etat);
            if (deja) deja.chance += effet.chance;
            else etats.push({ etat: effet.etat, chance: effet.chance });
        }
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
        prerequis: opts.depart ? 0 : (window.PREREQUIS_RARETE[rarete] || 0),
        bonus: bonus,
        etats: etats,
        // Les effets qui ne se résument pas à un bonus chiffré ni à un état
        // (élan d'initiative, bénédictions de soin) restent listés tels quels.
        // Seuls les champs présents sont recopiés : Firestore refuse toute
        // valeur undefined, et un butin avec « buffSoi: undefined » faisait
        // échouer l'écriture de la réserve entière.
        effets: effets.filter(e => e.buff || e.buffSoi || e.beniSoin).map(e => {
            const copie = { cle: e.cle };
            ["chance", "buff", "buffSoi", "beniSoin"].forEach(k => { if (e[k] !== undefined) copie[k] = e[k]; });
            return copie;
        }),
        image: ""
    };
    objet.effetTexte = window.decrireObjet(objet);
    return objet;
};

// L'ÉQUIPEMENT DE DÉPART, choisi à la création du héros.
//  Le joueur ne choisit pas un objet mais une FAMILLE : « arme lourde », « armure
//  moyenne ». On tire au sort dans cette famille, toujours en qualité commune —
//  personne ne commence avec une relique.
//
//  Les armes à deux mains restent du lot : les écarter réduisait « arme à
//  distance » à la seule fronde, et un joueur qui choisit une arme lourde
//  accepte très bien d'avoir les deux mains prises. Elles occupent alors les
//  deux emplacements, comme partout ailleurs dans le jeu.
window.objetDeDepart = function(typeObjet, rarete, options) {
    const modeles = (window.MODELES_OBJETS || []).filter(m => m.type === typeObjet);
    if (modeles.length === 0) return null;
    return window.fabriquerObjet(auHasard(modeles), rarete || "Commun", { depart: true, ...(options || {}) });
};

// « Arme + Bouclier » n'est pas une famille du catalogue : c'est un CHOIX
// combiné du formulaire de création. On y tire une arme à UNE MAIN de corps à
// corps (jamais une arme à deux mains, sinon plus de main libre pour le
// bouclier), plus un bouclier tiré à part — les deux se retrouvent chacun dans
// une main à l'équipement (voir equiperLeHerosDeDepart).
//
// LE JOUEUR CHOISIT LA FAMILLE DE L'ARME (Nico) : « arme légère + bouclier »
// (dague, couteau, épée courbée) ou « arme lourde + bouclier » (épée courte,
// hache, gourdin, masse, lance courte) — c'est l'arme qui décide des
// techniques qu'il pourra lancer. L'ancien choix sans famille reste compris,
// pour une fiche ou un formulaire d'avant.
const FAMILLES_UNE_MAIN_CAC = ["Arme légère CAC", "Arme lourde CAC", "Arme polyvalente"];
const CHOIX_ARME_BOUCLIER = {
    "Arme légère + Bouclier": ["Arme légère CAC"],
    "Arme lourde + Bouclier": ["Arme lourde CAC"],
    "Arme + Bouclier": FAMILLES_UNE_MAIN_CAC
};

window.objetDeDepartUneMain = function(familles, rarete) {
    const modeles = (window.MODELES_OBJETS || [])
        .filter(m => familles.includes(m.type) && !m.deuxMains);
    if (modeles.length === 0) return null;
    return window.fabriquerObjet(auHasard(modeles), rarete || "Commun", { depart: true });
};

// (v391) Nico : « pour le choix des armes, mettre l'option bague de soin ou de
// dégâts » : le joueur choisit le modèle de sa bague. « Magie » seul (une fiche
// d'avant) en tire toujours une des deux au hasard.
const CHOIX_BAGUE = { "Magie Soins": "Bagues Soins", "Magie DPS": "Bagues DPS" };
function bagueDeDepart(modele) {
    const m = (window.MODELES_OBJETS || []).find(x => x.modele === modele);
    return m ? window.fabriquerObjet(m, "Commun", { depart: true }) : window.objetDeDepart("Magie");
}

// (v476) Nico : « à la création du personnage, laisse au joueur la possibilité
// de choisir une arme parmi toutes les armes grises, autres que les armes corps
// à corps à deux mains et les boucliers ». Le formulaire (index.html) propose
// ces modèles un par un ; le joueur reçoit le sien en qualité commune.
window.armesDeDepartAuChoix = function() {
    return (window.MODELES_OBJETS || []).filter(m => m.emplacement === "Main" && m.type !== "Bouclier"
        && !(m.deuxMains && /CAC/.test(m.type)));
};

// Les deux (ou trois, avec le bouclier) objets qu'un héros porte à sa création.
// Renvoie toujours un objet, même partiel : un type inconnu ne doit pas
// empêcher la création du personnage. Les anciens choix par famille
// (« Arme lourde CAC », « Arme légère + Bouclier »…) restent compris.
window.equipementDeDepart = function(typeArme, typeArmure) {
    const famillesAvecBouclier = Object.prototype.hasOwnProperty.call(CHOIX_ARME_BOUCLIER, typeArme)
        ? CHOIX_ARME_BOUCLIER[typeArme] : null;
    const estArmeBouclier = !!famillesAvecBouclier;
    const modeleChoisi = window.armesDeDepartAuChoix().find(m => m.modele === typeArme);
    return {
        arme: modeleChoisi ? window.fabriquerObjet(modeleChoisi, "Commun", { depart: true })
              : estArmeBouclier ? window.objetDeDepartUneMain(famillesAvecBouclier)
              : CHOIX_BAGUE[typeArme] ? bagueDeDepart(CHOIX_BAGUE[typeArme])
              : typeArme ? window.objetDeDepart(typeArme) : null,
        bouclier: estArmeBouclier ? window.objetDeDepart("Bouclier") : null,
        // L'armure de départ : aucun prérequis, et ses résistances au plus bas
        // de leur fourchette (règle de Nico). Les armes de départ n'ont pas de
        // prérequis non plus : personne ne doit naître sans pouvoir porter
        // ce qu'on lui donne.
        armure: typeArmure ? window.objetDeDepart(typeArmure, "Commun", { auPlusBas: true }) : null
    };
};

// Bouclier ou armure : tout ce qui se porte sur le corps plutôt qu'en main
// offensive. Les bagues (type "Magie") restent du côté "arme" : elles sont
// tenues en main et jouent le même rôle offensif/de soin qu'une arme.
function estBouclierOuArmure(modele) {
    return modele.type === "Bouclier" || modele.emplacement === "Armure";
}

// Tire un objet complet pour une difficulté donnée. C'est l'unique porte
// d'entrée utilisée par le butin.
//
// 75% de chance une arme, 25% un bouclier ou une armure (Nico, revu : c'était
// 60/40) — une pondération voulue plutôt qu'un tirage brut sur tout le
// catalogue, où le
// nombre de modèles de chaque famille faussait les proportions sans le
// vouloir (beaucoup plus d'armes que d'armures dans le tableau).
window.PART_ARMES_BUTIN = 0.75;

window.tirerObjetPourDifficulte = function(difficulte) {
    return window.tirerObjetDeRarete(window.tirerRarete(difficulte));
};

// Un objet d'une rareté déjà tirée (le butin par monstre, v269).
window.tirerObjetDeRarete = function(rarete) {
    if (!window.RARETES.includes(rarete)) rarete = "Commun";
    const catalogue = window.MODELES_OBJETS || [];
    const poolArmes = catalogue.filter(m => !estBouclierOuArmure(m));
    const poolDefense = catalogue.filter(estBouclierOuArmure);

    const veutUneArme = Math.random() < window.PART_ARMES_BUTIN;
    let pool = veutUneArme ? poolArmes : poolDefense;
    // Si la famille visée est vide (catalogue incomplet), on retombe sur
    // l'autre plutôt que de renvoyer un objet inexistant.
    if (pool.length === 0) pool = poolArmes.length > 0 ? poolArmes : poolDefense;
    if (pool.length === 0) pool = catalogue;

    const modele = auHasard(pool);
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
    degatsMag:         v => `+${v} dégât${v > 1 ? "s" : ""} magique${v > 1 ? "s" : ""} ou brut${v > 1 ? "s" : ""}`,
    degats:            v => `+${v} dégât${v > 1 ? "s" : ""}`,
    soin:              v => `+${v} soin${v > 1 ? "s" : ""}`,
    initiative:        v => `+${v} d'initiative`,
    parade:            v => `+${v} de parade`,
    esquive:           v => `+${v}% d'esquive`,
    paradeOuEsquive:   v => `+${v}% de parade ou d'esquive (selon la Force ou la Dextérité)`,
    resPhys:           v => `+${v}% de résistance physique`,
    resMag:            v => `+${v}% de résistance magique`,
    portee:            v => `+${v} de portée`,
    allonge:           v => `+${v} d'allonge`,
    coutDeplacement:   v => v < 0 ? `${v} au coût de déplacement` : `+${v} au coût de déplacement`,
    ignoreArmure:      v => `${v}% d'ignorer l'armure`,
    ignoreResistances: v => `${v}% d'ignorer les résistances`,
    hexApresAttaque:   v => `+${v} case${v > 1 ? "s" : ""} de mouvement après l'attaque`,
    degatsOpportunite: v => `+${v} dégât${v > 1 ? "s" : ""} aux attaques d'opportunité`
};

const LIBELLES_ETATS = {
    "Empoisonnement": "d'empoisonnement", "Étourdi": "d'étourdissement", "Glacé": "de gelée",
    "Brûlé": "de brûlure", "Immobilisation": "d'immobilisation", "Peur": "de peur",
    "Poussée": "de repousser", "Traction": "de tracter", "Provocation": "de provoquer",
    "Saignement": "de saignement", "Électrifié": "d'électrifier", "Confusion": "de confusion"
};

window.decrireObjet = function(objet) {
    const morceaux = [];

    window.CLES_BONUS.forEach(cle => {
        const v = objet.bonus ? objet.bonus[cle] : 0;
        if (v) morceaux.push(LIBELLES_BONUS[cle](v));
    });

    (objet.etats || []).forEach(e => {
        // (v476) Une augmentation max : elle ne sert qu'une technique qui porte
        // déjà cet état, par-dessus son plafond.
        morceaux.push(`+${e.chance}% de chance ${LIBELLES_ETATS[e.etat] || e.etat.toLowerCase()} max`);
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

//  UN OBJET QU'UNE BLESSURE INTERDIT (blessures.js) reste sur la fiche, mais ne
//  sert à rien tant qu'elle dure : ni bonus, ni état, ni arme en main — il est
//  simplement absent d'ici. L'inventaire dit pourquoi (raisonObjetInterditParBlessure).
window.objetsEquipes = function(perso) {
    if (!perso) return [];
    const bruts = [["armure", perso.equipArmure], ["droite", perso.equipMainDroite], ["gauche", perso.equipMainGauche]]
        .filter(([, o]) => o && o.nom);
    const vus = new Set();
    return bruts.filter(([emplacement, o]) => {
        if (o.uid && vus.has(o.uid)) return false;
        if (o.uid) vus.add(o.uid);
        return !window.raisonObjetInterditParBlessure(perso, o, emplacement);
    }).map(([, o]) => o);
};

// null, ou la phrase qui dit quelle blessure empêche de s'en servir.
// `emplacement` : "armure", "droite" ou "gauche".
window.raisonObjetInterditParBlessure = function(perso, objet, emplacement) {
    if (!perso || !objet || typeof window.blessureQuiInterdit !== "function") return null;
    const deuxMains = objet.deuxMains === true;
    const type = String(objet.type || "");
    const regles = [
        ["interditDeuxMains", deuxMains, "pas d'arme à deux mains"],
        ["interditBouclier", type === "Bouclier", "pas de bouclier"],
        ["interditArmureLourde", type === "Armure lourde" || type === "Armure intermédiaire", "ni armure lourde ni armure moyenne"],
        ["interditMainGauche", emplacement === "gauche", "la deuxième main ne sert pas"]
    ];
    for (const [cle, concerne, texte] of regles) {
        if (!concerne) continue;
        const nom = window.blessureQuiInterdit(perso, cle);
        if (nom) return `${nom} : ${texte}`;
    }
    return null;
};

// (v476) « Toutes les armes à distance sont considérées comme à 2 mains » —
// celles trouvées avant aussi (une fronde d'avant n'avait qu'une main).
window.objetAuxReglesDuJour = function(objet) {
    if (objet && objet.type === "Arme légère Distance" && objet.deuxMains !== true) return { ...objet, deuxMains: true };
    return objet;
};

// (v360) LE BERSERKER de niveau 9 tient-il DEUX armes à deux mains (une par main) ?
window.deuxArmesDeuxMains = function(perso) {
    const d = perso && perso.equipMainDroite, g = perso && perso.equipMainGauche;
    return !!(d && g && d.deuxMains && g.deuxMains && d !== g && !(d.uid && d.uid === g.uid));
};
window.bonusEquipement = function(perso) {
    const total = {};
    window.CLES_BONUS.forEach(cle => total[cle] = 0);
    // (v360) Le Berserker de niveau 9 : deux armes à deux mains, −10 % de
    // résistances ; sans elles, +2 à chacune de ses attaques (cartes et
    // attaques d'opportunité).
    // (v363) LA CLASSE SEULE (atoutClasse), JAMAIS atoutRace : atoutRace lit les
    // talents, dont certains relisent l'équipement (caracPourTalents →
    // bonusEquip → ici) — une boucle sans fin qui bloquait les fiches.
    const atoutDeClasse = typeof window.atoutClasse === "function" ? (window.atoutClasse(perso) || {}) : {};
    if (atoutDeClasse.deuxArmesDeuxMains) {
        if (window.deuxArmesDeuxMains(perso)) { total.resPhys -= 10; total.resMag -= 10; }
        else { total.degats += 2; total.degatsOpportunite += 2; }
    }
    // (v347) Le Protecteur de niveau 5 : les boucliers lourds ne lui coûtent
    // plus rien de plus à chaque case (leur seul malus).
    const sansMalusLourd = !!atoutDeClasse.bouclierLourdSansMalus;
    window.objetsEquipes(perso).forEach(objet => {
        const bonus = objet.bonus || {};
        window.CLES_BONUS.forEach(cle => {
            const v = parseInt(bonus[cle]) || 0;
            if (sansMalusLourd && objet.modele === "Bouclier lourd" && cle === "coutDeplacement" && v > 0) return;
            total[cle] += v;
        });
    });
    // (v476) LA LANCE COURTE : « FORCE (parade) ou DEXTÉRITÉ (esquive) ». Le
    // bonus va à la parade si la Force du porteur vaut au moins sa Dextérité,
    // sinon à l'esquive (une carac inconnue compte pour rien : la parade).
    if (total.paradeOuEsquive) {
        const id = perso && perso.idPersonnage;
        const force = Number(id ? window.caracDuPersonnage(id, "FORCE") : null) || 0;
        const dex = Number(id ? window.caracDuPersonnage(id, "DEXTÉRITÉ") : null) || 0;
        total[dex > force ? "esquive" : "parade"] += total.paradeOuEsquive;
        total.paradeOuEsquive = 0;
    }
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
// Une armure accepte plusieurs caractéristiques (CARACS_ARMURE) : UNE SEULE
// qui atteint le prérequis suffit, et c'est la meilleure qu'on rapporte.
window.peutEquiper = function(idPersonnage, objet) {
    if (!objet) return { possible: false };
    const requis = parseInt(objet.prerequis) || 0;
    if (requis <= 0) return { possible: true, valeur: null, manque: 0 };
    const valeurs = window.caracsRequisesObjet(objet)
        .map(c => window.caracDuPersonnage(idPersonnage, c))
        .filter(v => v !== null && !isNaN(v));
    if (valeurs.length === 0) return { possible: true, valeur: null, manque: 0 };
    const valeur = Math.max(...valeurs);
    return { possible: valeur >= requis, valeur: valeur, manque: Math.max(0, requis - valeur) };
};

// =========================================================================
//  CE QUE L'ÉQUIPEMENT AUTORISE À LANCER
// =========================================================================
//  Chaque technique porte le type d'arme choisi à la Forge. Une hache ne peut
//  pas servir une technique d'attaque légère. La règle est un contrôle de
//  CONTRADICTION, pas d'exigence : un héros qui ne porte aucune arme n'a rien
//  qui s'oppose à sa technique — c'est seulement ce qu'il tient en main qui
//  peut l'en empêcher.
//
//  La magie fait exception : un sort se lance quelles que soient les mains,
//  qu'elles soient prises par une arme à deux mains, un bouclier ou autre chose.

window.TYPES_ARMES_FORGE = ["Arme légère CAC", "Arme lourde CAC", "Arme polyvalente",
                            "Arme légère Distance", "Magie"];

// Les armes tenues en main (ni bague, ni bouclier, ni armure).
window.armesEnMain = function(perso) {
    return window.objetsEquipes(perso).filter(o =>
        !o.bague && window.TYPES_ARMES_FORGE.includes(o.type) && o.type !== "Magie");
};

// =========================================================================
//  CE QU'UNE CARTE A LE DROIT D'EMPRUNTER À L'ÉQUIPEMENT
// =========================================================================
//  Une technique « Sans arme / Arme rp » se joue à mains nues ou à la dague de
//  ceinture, QUELLE QUE SOIT l'arme équipée — c'est tout son intérêt, et c'est
//  pour ça qu'elle reste jouable quand les autres sont bloquées. Elle n'a donc
//  rien à emprunter à l'arme qu'on ne se sert pas : ni sa portée, ni son
//  allonge, ni ses dégâts plats, ni l'état qu'elle inflige en frappant. Un coup
//  de coude ne tire pas à deux cases parce qu'un arc pend dans le dos, et il
//  n'étourdit personne parce qu'un gourdin est resté à la ceinture.
//
//  CE QUI RESTE, EN REVANCHE : l'armure, le bouclier, les bagues — rien de
//  tout cela n'est l'arme dont on ne se sert pas — et les états portés par le
//  personnage (élan d'initiative, bénédictions), qui ne viennent pas d'un objet
//  tenu en main.
window.CARTE_SANS_ARME = "Sans arme / Arme rp";

// Les objets dont une carte donnée profite vraiment.
window.objetsPourLaCarte = function(perso, armeDeLaCarte) {
    const tous = window.objetsEquipes(perso);
    if (armeDeLaCarte !== window.CARTE_SANS_ARME) return tous;
    const armes = window.armesEnMain(perso);
    return tous.filter(o => armes.indexOf(o) === -1);
};

// Le même total que window.bonusEquip, amputé de ce que les armes en main
// apportent quand la carte ne s'en sert pas. On soustrait plutôt que de
// recalculer : bonusEquip additionne AUSSI les bonus portés par les états, et
// ceux-là ne doivent jamais être perdus en chemin.
//
// LA MAGIE NE TIRE PAS À L'ARC (Nico, v251 : « la distance en plus accordée
// par l'arc ne devrait pas se mettre sur les compétences magie du
// personnage »). Un sort part des mains du mage, pas de l'arme qu'il porte :
// la portée d'un arc ou d'une fronde, l'allonge d'une lance ne s'y ajoutent
// pas. Le sort garde ses propres portées (Distance de la Forge, atout de
// portée des sorts).
const PORTEES_D_ARME = ["portee", "allonge"];
//
// (v431) Nico : « le bonus de portée d'arc s'applique bien à tous les sorts créés avec pour
// base l'arme en question ? » La portée (et l'allonge) d'une arme ne sert que les cartes
// forgées pour SON type d'arme : une fronde tenue avec une dague n'allonge pas les coups de
// dague. Une carte d'un type inconnu (d'avant la Forge) garde l'ancienne règle.
window.bonusEquipPourCarte = function(perso, cle, armeDeLaCarte) {
    const total = typeof window.bonusEquip === "function" ? window.bonusEquip(perso, cle) : 0;
    const sansArme = armeDeLaCarte === window.CARTE_SANS_ARME;
    const sortSansPorteeDArme = armeDeLaCarte === "Magie" && PORTEES_D_ARME.includes(cle);
    const porteeDUneAutreArme = PORTEES_D_ARME.includes(cle) && (window.TYPES_ARMES_FORGE || []).includes(armeDeLaCarte);
    if (!perso || !(sansArme || sortSansPorteeDArme || porteeDUneAutreArme)) return total;
    let desArmes = 0;
    window.armesEnMain(perso).forEach(o => {
        if (!sansArme && !sortSansPorteeDArme && o.type === armeDeLaCarte) return;   // la sienne : gardée
        desArmes += parseInt((o.bonus || {})[cle]) || 0;
    });
    return total - desArmes;
};

// Les états que l'équipement inflige en frappant, pour une carte donnée.
window.etatsEquipementPourCarte = function(perso, armeDeLaCarte) {
    const etats = [];
    window.objetsPourLaCarte(perso, armeDeLaCarte)
          .forEach(o => (o.etats || []).forEach(e => etats.push(e)));
    return etats;
};

// null = la carte peut partir ; sinon, la phrase à montrer au joueur.
window.raisonBlocageCarte = function(perso, arme, idCarte) {
    // LE CHOC CRÂNIEN (blessures.js) : deux compétences oubliées pour deux
    // combats — quelle que soit l'arme en main.
    if (perso && idCarte && typeof window.atoutBlessures === "function"
        && ((window.atoutBlessures(perso) || {}).cartesOubliees || []).includes(idCarte)) {
        return "Choc crânien : le héros a oublié comment utiliser cette compétence.";
    }
    if (!perso || !arme || arme === window.CARTE_SANS_ARME || arme === "Non spécifié") return null;

    // Aucune contrainte de main pour la magie : le sort part toujours.
    if (arme === "Magie") return null;

    const portees = window.armesEnMain(perso);
    if (portees.length === 0) return null;                        // rien en main, rien ne s'y oppose
    if (portees.some(o => o.type === arme)) return null;
    return `${portees.map(o => o.nom).join(" et ")} ne permet pas une technique « ${arme} ».`;
};

// Les techniques de ce héros que ses armes en main empêchent de lancer, avec
// leur raison. La même règle qu'en combat (raisonBlocageCarte) : la fiche, le
// combat et l'alerte au changement d'arme ne peuvent donc jamais diverger.
window.competencesBloqueesParArme = function(perso) {
    if (!perso || !perso.idPersonnage) return [];
    const cartes = (window.CACHE_COMPETENCES_GLOBAL || {})[perso.idPersonnage] || {};
    return Object.keys(cartes)
        .map(id => ({ id, nom: (cartes[id] && cartes[id].Nom) || "Technique", arme: (cartes[id] || {}).Arme || "",
                      raison: window.raisonBlocageCarte(perso, (cartes[id] || {}).Arme, id) }))
        .filter(c => c.raison);
};
