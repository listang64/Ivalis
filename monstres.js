// =========================================================================
//  IVALIS - MODULE DES MONSTRES
// =========================================================================
//  Ce module regroupe TOUT ce qui touche aux monstres, volontairement à part
//  du reste du code :
//
//   1. Les GABARITS (collection "Monstres_Modeles") : le tableau d'équilibrage
//      par archetype et par palier (Petit / Normal / Élite / Boss). Ce sont des
//      modèles de stats, pas des monstres jouables : plus tard, un monstre nommé
//      pointera vers un gabarit pour en hériter.
//
//   2. Les MONSTRES POSÉS EN COMBAT (collection "Monstres") : ils ne vivent
//      plus dans "Personnages". Ils n'apparaissent donc plus dans la liste des
//      fiches de personnages, mais restent des combattants à part entière sur
//      le plateau (PV, fatigue, états altérés, initiative...).
//
//  Pour que le moteur de combat continue de fonctionner sans être réécrit, les
//  deux collections sont fusionnées à la volée dans window.PERSOS_PARTIE, et
//  toute écriture sur un combattant passe par window.refCombattant(), qui
//  route vers la bonne collection.
// =========================================================================
import { db } from "./firebase-config.js";
import {
    collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, deleteField,
    onSnapshot, query, where, writeBatch
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const COLLECTION_GABARITS = "Monstres_Modeles";
const COLLECTION_MONSTRES = "Monstres";

// =========================================================================
//  1. LE TABLEAU D'ÉQUILIBRAGE DE RÉFÉRENCE
// =========================================================================
//  Valeurs de départ, reprises telles quelles du tableau Numbers de Nico. Elles
//  ne servent qu'à AMORCER la base la première fois : une fois en base, c'est
//  la base qui fait foi et c'est elle qu'on modifie depuis l'outil.
// =========================================================================

// Les colonnes du tableau, dans l'ordre d'affichage. `cap` reprend les plafonds
// écrits dans les en-têtes du tableau d'origine.
export const COLONNES_GABARIT = [
    { cle: "PV",             titre: "PVs",             pourcent: false },
    { cle: "Res_Physique",   titre: "Rés Phys",        pourcent: true,  cap: 70 },
    { cle: "Res_Magique",    titre: "Rés mag",         pourcent: true,  cap: 70 },
    { cle: "Parade_Esquive", titre: "Parade/Esquive",  pourcent: true,  cap: 50 },
    { cle: "Fatigue_Max",    titre: "Fatigue max",     pourcent: false },
    { cle: "Regeneration",   titre: "Regen",           pourcent: true },
    { cle: "Repos_Long",     titre: "Repos long",      pourcent: true },
    { cle: "Nombre_Actions", titre: "Nombre d'action", pourcent: false },
    { cle: "XP_Groupe",      titre: "XP pour le groupe", pourcent: false }
];

// [PV, RésPhys, RésMag, Parade/Esquive, FatigueMax, Regen, ReposLong, NbActions, XP]
const VALEURS_DEFAUT = {
    "DPS CAC": {
        "Petit":  [40, 15, 10,  5,  80, 50, 100, 1,  40],
        "Normal": [70, 20, 15, 15, 120, 30,  90, 1, 100],
        "Élite":  [110, 35, 20, 15, 165, 30,  80, 1, 240],
        "Boss":   [240, 40, 25, 15, 220, 40,  70, 2, 800]
    },
    "TANK CAC": {
        "Petit":  [50, 25,  0, 20,  60, 50, 100, 1,  40],
        "Normal": [90, 30, 20, 20,  90, 30,  90, 1, 100],
        "Élite":  [115, 40, 25, 30, 130, 30,  80, 1, 240],
        "Boss":   [250, 50, 30, 35, 170, 40,  70, 2, 800]
    },
    // Le tableau d'origine ne prévoit pas de Boss pour le Soutien.
    "SOUTIEN": {
        "Petit":  [45, 10, 10, 10,  75, 50, 100, 1,  40],
        "Normal": [70, 20, 20, 10, 120, 30,  90, 1, 100],
        "Élite":  [110, 30, 30, 15, 160, 30,  80, 1, 240]
    },
    "DPS MAGE CAC": {
        "Petit":  [40, 10, 15,  5,  80, 50, 100, 1,  40],
        "Normal": [70, 15, 20, 15, 120, 30,  90, 1, 100],
        "Élite":  [110, 20, 35, 15, 165, 30,  80, 1, 240],
        "Boss":   [240, 25, 40, 15, 220, 40,  70, 2, 800]
    },
    "DPS DISTANCE": {
        "Petit":  [35, 10,  5, 10,  90, 50, 100, 1,  40],
        "Normal": [65, 15, 10, 15, 145, 30,  90, 1, 100],
        "Élite":  [110, 25, 20, 20, 170, 30,  80, 1, 240],
        "Boss":   [225, 25, 25, 20, 240, 40,  70, 2, 800]
    },
    "DPS MAGE DISTANCE": {
        "Petit":  [35,  5, 10, 10,  90, 50, 100, 1,  40],
        "Normal": [65, 10, 15, 15, 145, 30,  90, 1, 100],
        "Élite":  [110, 20, 25, 20, 170, 30,  80, 1, 240],
        "Boss":   [225, 25, 25, 20, 240, 40,  70, 2, 800]
    }
};

// Identifiant de document stable et lisible : "dps_cac__elite".
function cleGabarit(archetype, palier) {
    const nettoyer = (s) => (s || "")
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // enlève les accents
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return `${nettoyer(archetype)}__${nettoyer(palier)}`;
}

// Déplie le tableau de référence en documents prêts pour Firestore.
function construireGabaritsDefaut() {
    const gabarits = [];
    Object.keys(VALEURS_DEFAUT).forEach((archetype, ordreArchetype) => {
        const paliers = VALEURS_DEFAUT[archetype];
        Object.keys(paliers).forEach((palier, ordrePalier) => {
            const valeurs = paliers[palier];
            const gabarit = {
                Cle: cleGabarit(archetype, palier),
                Archetype: archetype,
                Palier: palier,
                Ordre_Archetype: ordreArchetype,
                Ordre_Palier: ordrePalier
            };
            COLONNES_GABARIT.forEach((colonne, i) => {
                gabarit[colonne.cle] = valeurs[i];
            });
            gabarits.push(gabarit);
        });
    });
    return gabarits;
}

// =========================================================================
//  2. ACCÈS BASE DE DONNÉES — GABARITS
// =========================================================================

window.GABARITS_MONSTRES = [];

// Lit les gabarits, et amorce la base avec le tableau de référence si elle est
// vide (ou s'il manque des lignes, par exemple après l'ajout d'un archetype
// côté code). Rien n'est jamais écrasé : on ne crée que ce qui manque.
window.chargerGabaritsMonstres = async function() {
    const parDefaut = construireGabaritsDefaut();
    let existants = {};

    const snap = await getDocs(collection(db, COLLECTION_GABARITS));
    snap.forEach(d => { existants[d.id] = d.data(); });

    const manquants = parDefaut.filter(g => !existants[g.Cle]);
    if (manquants.length > 0) {
        const lot = writeBatch(db);
        manquants.forEach(g => lot.set(doc(db, COLLECTION_GABARITS, g.Cle), g));
        await lot.commit();
        manquants.forEach(g => { existants[g.Cle] = g; });
        console.log(`🐲 ${manquants.length} gabarit(s) de monstre amorcé(s) en base.`);
    }

    // On garde l'ordre du tableau de référence, quoi qu'il arrive en base.
    window.GABARITS_MONSTRES = Object.values(existants).sort((a, b) => {
        if (a.Ordre_Archetype !== b.Ordre_Archetype) return (a.Ordre_Archetype || 0) - (b.Ordre_Archetype || 0);
        return (a.Ordre_Palier || 0) - (b.Ordre_Palier || 0);
    });

    return window.GABARITS_MONSTRES;
};

// Renvoie le gabarit correspondant à un archetype + palier (utile aux chapitres
// suivants : créer un monstre nommé qui hérite de ces stats).
window.gabaritMonstre = function(archetype, palier) {
    const cle = cleGabarit(archetype, palier);
    return (window.GABARITS_MONSTRES || []).find(g => g.Cle === cle) || null;
};

// =========================================================================
//  3. LES MONSTRES POSÉS EN COMBAT
// =========================================================================
//  Ils sont dans leur propre collection mais doivent rester invisibles pour le
//  moteur de combat, qui ne connaît que window.PERSOS_PARTIE. On tient donc un
//  registre de provenance, et on recompose la liste des combattants dès que
//  l'une des deux sources change.
// =========================================================================

window.SOURCE_COMBATTANTS = window.SOURCE_COMBATTANTS || {};
window.MONSTRES_PARTIE = [];
window.PERSOS_JOUEURS_PARTIE = [];

// ⚠️ Point de passage OBLIGATOIRE pour toute écriture visant un combattant :
// selon sa provenance, le document vit dans "Personnages" ou dans "Monstres".
window.refCombattant = function(idCombattant) {
    const source = window.SOURCE_COMBATTANTS[idCombattant] === COLLECTION_MONSTRES
        ? COLLECTION_MONSTRES
        : "Personnages";
    return doc(db, source, idCombattant);
};

window.estMonstre = function(idCombattant) {
    return window.SOURCE_COMBATTANTS[idCombattant] === COLLECTION_MONSTRES;
};

// Fusionne joueurs + monstres dans la liste unique que lit tout le combat.
window.recomposerCombattants = function() {
    // Un héros mis de côté depuis la liste (mode développeur) ne rejoint pas les
    // combattants : c'est ce seul filtre qui le retire du plateau, de la piste
    // d'initiative, du panneau, du décompte des joueurs prêts et des bulles de
    // noms — tout le moteur travaille à partir de cette liste.
    const joueurs = (window.PERSOS_JOUEURS_PARTIE || []).filter(p => p.actif !== false);
    const monstres = window.MONSTRES_PARTIE || [];
    window.PERSOS_PARTIE = [...joueurs, ...monstres];

    // Rafraîchit ce qui dépend de la liste des combattants, si le combat tourne.
    if (typeof window.appliquerTokensVTT === "function" && window.TOKENS_VTT_DATA) {
        window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    }
    if (typeof window.afficherPisteInitiative === "function") window.afficherPisteInitiative();

    // Le panneau gauche affiche une copie figée du combattant sélectionné. Si
    // c'est un monstre et que sa fiche vient de changer, il faut le redessiner,
    // sinon il reste sur des données périmées. Cas concret : les techniques sont
    // écrites AVANT le Deck_Equipe qui les équipe, donc le panneau affichait
    // encore "Aucune compétence mémorisée" alors que la forge était terminée.
    const affiche = (window.COMBAT_PERSOS_JOUEUR || [])[window.COMBAT_INDEX_PERSO];
    if (affiche && affiche.estMonstre && typeof window.afficherDansPanneauGauche === "function") {
        const frais = monstres.find(m => m.idPersonnage === affiche.idPersonnage);
        if (frais) window.afficherDansPanneauGauche(affiche.idPersonnage);
    }
};

let unsubscribeMonstres = null;

window.ecouterMonstresPartie = function(idPartie) {
    if (unsubscribeMonstres) { unsubscribeMonstres(); unsubscribeMonstres = null; }
    if (!idPartie) {
        window.MONSTRES_PARTIE = [];
        return;
    }

    const q = query(collection(db, COLLECTION_MONSTRES), where("ID_Partie", "==", idPartie));
    unsubscribeMonstres = onSnapshot(q, (snap) => {
        const monstres = [];
        snap.forEach(document => {
            window.SOURCE_COMBATTANTS[document.id] = COLLECTION_MONSTRES;
            // On réutilise la conversion des personnages : un monstre expose
            // exactement les mêmes champs à tout le moteur de combat.
            const versFront = window.persoDocVersFront;
            const brut = document.data();
            const objet = typeof versFront === "function"
                ? versFront(document.id, brut)
                : { idPersonnage: document.id, ...brut };
            objet.estMonstre = true;
            // persoDocVersFront ne recopie que les champs d'un personnage : les champs
            // propres au bestiaire (affichés dans le panneau gauche) sont repris ici.
            objet.Archetype     = brut.Archetype || "";
            objet.Palier        = brut.Palier || "";
            objet.Gabarit       = brut.Gabarit || "";
            objet.Personnalite  = brut.Personnalite || "brutal";
            objet.Nombre_Actions = brut.Nombre_Actions || 1;
            objet.XP_Groupe     = brut.XP_Groupe || 0;
            monstres.push(objet);

            // Les techniques du monstre vivent dans une sous-collection : il
            // faut son propre écouteur pour que le panneau de combat les voie,
            // exactement comme pour un personnage joueur.
            if (typeof window.ecouterCompetencesMonstre === "function") {
                window.ecouterCompetencesMonstre(document.id);
            }
        });
        window.MONSTRES_PARTIE = monstres;
        window.recomposerCombattants();
    }, (err) => console.error("onSnapshot Monstres :", err));
};

// Crée un monstre sur le plateau à partir d'un gabarit. Les chapitres suivants
// (monstres nommés, compétences, IA) viendront enrichir ce socle.
window.creerMonstreDepuisGabarit = async function(idMonstre, gabarit, donneesSupplementaires = {}) {
    if (!gabarit) return null;

    const data = {
        ID_Partie: window.ID_PARTIE_COURANTE,
        ID_Joueur: "MJ",
        Camp: "Ennemi",
        Statut: "Vivant",
        Gabarit: gabarit.Cle,
        Archetype: gabarit.Archetype,
        Palier: gabarit.Palier,
        PV_Max: gabarit.PV,
        PV_Actuels: gabarit.PV,
        Fatigue_Max: gabarit.Fatigue_Max,
        Fatigue_Actuelle: gabarit.Fatigue_Max,
        Def_Physique: gabarit.Res_Physique,
        Def_Magique: gabarit.Res_Magique,
        Esquive: gabarit.Parade_Esquive,
        Parade: gabarit.Parade_Esquive,
        Regeneration: gabarit.Regeneration,
        Repos_Long: gabarit.Repos_Long,
        Nombre_Actions: gabarit.Nombre_Actions,
        XP_Groupe: gabarit.XP_Groupe,
        Couleur: "#ff4c4c",
        // Caractère de combat, tiré une fois pour toutes : c'est lui qui décide
        // si la créature fonce, contourne, fuit le corps-à-corps ou achève les
        // blessés (cf. monstres_ia.js). Fixe pour toute la partie, pour que les
        // joueurs puissent apprendre à la lire.
        Personnalite: (typeof window.tirerPersonnaliteMonstre === "function")
            ? window.tirerPersonnaliteMonstre(gabarit.Archetype)
            : "brutal",
        ...donneesSupplementaires
    };

    window.SOURCE_COMBATTANTS[idMonstre] = COLLECTION_MONSTRES;
    await setDoc(doc(db, COLLECTION_MONSTRES, idMonstre), data);
    return data;
};

// =========================================================================
//  4. L'OUTIL D'ÉQUILIBRAGE (menu Paramètres > Outils > Monstres)
// =========================================================================

// Ce que l'utilisateur a modifié mais pas encore enregistré : { cle: { champ: valeur } }
let modificationsEnAttente = {};

window.ouvrirGestionMonstres = async function() {
    const menuLat = document.getElementById("menu-lateral");
    if (menuLat) menuLat.style.display = "none";

    window.naviguerFenetre("etape-menu-outils", "etape-gestion-monstres");

    const chargement = document.getElementById("chargement-monstres");
    const conteneur = document.getElementById("conteneur-table-monstres");
    if (chargement) chargement.style.display = "block";
    if (conteneur) conteneur.style.display = "none";

    modificationsEnAttente = {};

    try {
        await window.chargerGabaritsMonstres();
        window.dessinerTableauMonstres();
        if (chargement) chargement.style.display = "none";
        if (conteneur) conteneur.style.display = "block";
    } catch (e) {
        console.error("Erreur chargement des gabarits de monstres :", e);
        if (chargement) chargement.innerText = "Impossible de lire les gabarits. Vérifie ta connexion.";
    }
};

window.fermerGestionMonstres = function() {
    if (Object.keys(modificationsEnAttente).length > 0) {
        if (!confirm("Des modifications n'ont pas été enregistrées. Fermer quand même ?")) return;
    }
    modificationsEnAttente = {};
    const menuLat = document.getElementById("menu-lateral");
    if (menuLat) menuLat.style.display = "flex";
    window.naviguerFenetre("etape-gestion-monstres", "etape-menu-outils");
};

window.dessinerTableauMonstres = function() {
    const tbody = document.getElementById("tbody-monstres");
    if (!tbody) return;

    const gabarits = window.GABARITS_MONSTRES || [];
    let html = "";
    let archetypePrecedent = null;

    gabarits.forEach(g => {
        // Bandeau de catégorie, comme les lignes bleues du tableau d'origine.
        if (g.Archetype !== archetypePrecedent) {
            if (archetypePrecedent !== null) {
                html += `<tr class="ligne-separateur-monstres"><td colspan="${COLONNES_GABARIT.length + 1}"></td></tr>`;
            }
            html += `
                <tr class="ligne-archetype-monstres">
                    <td>${g.Archetype}</td>
                    <td colspan="${COLONNES_GABARIT.length}"></td>
                </tr>`;
            archetypePrecedent = g.Archetype;
        }

        html += `<tr><td class="cellule-palier-monstres">${g.Palier}</td>`;
        COLONNES_GABARIT.forEach(colonne => {
            const valeur = g[colonne.cle] !== undefined ? g[colonne.cle] : 0;
            html += `
                <td class="cellule-valeur-monstres">
                    <input type="number" inputmode="numeric"
                           id="monstre-${g.Cle}-${colonne.cle}"
                           value="${valeur}"
                           min="0"${colonne.cap ? ` max="${colonne.cap}"` : ""}
                           oninput="window.marquerModificationMonstre('${g.Cle}', '${colonne.cle}', this)">
                    ${colonne.pourcent ? `<span class="suffixe-pourcent">%</span>` : ""}
                </td>`;
        });
        html += `</tr>`;
    });

    tbody.innerHTML = html;
    window.actualiserBoutonSauvegardeMonstres();
};

window.marquerModificationMonstre = function(cle, champ, input) {
    const gabarit = (window.GABARITS_MONSTRES || []).find(g => g.Cle === cle);
    if (!gabarit) return;

    const colonne = COLONNES_GABARIT.find(c => c.cle === champ);
    let valeur = parseInt(input.value, 10);
    if (isNaN(valeur)) valeur = 0;
    if (valeur < 0) valeur = 0;
    // Les plafonds du tableau d'origine (Rés 70, Parade/Esquive 50) sont tenus ici :
    // mieux vaut corriger la saisie tout de suite que découvrir l'aberration en combat.
    if (colonne && colonne.cap && valeur > colonne.cap) valeur = colonne.cap;

    const valeurOrigine = gabarit[champ] !== undefined ? gabarit[champ] : 0;

    if (valeur === valeurOrigine) {
        if (modificationsEnAttente[cle]) {
            delete modificationsEnAttente[cle][champ];
            if (Object.keys(modificationsEnAttente[cle]).length === 0) delete modificationsEnAttente[cle];
        }
        input.classList.remove("valeur-modifiee");
    } else {
        if (!modificationsEnAttente[cle]) modificationsEnAttente[cle] = {};
        modificationsEnAttente[cle][champ] = valeur;
        input.classList.add("valeur-modifiee");
    }

    window.actualiserBoutonSauvegardeMonstres();
};

window.actualiserBoutonSauvegardeMonstres = function() {
    const bouton = document.getElementById("btn-sauver-monstres");
    if (!bouton) return;

    const nb = Object.values(modificationsEnAttente)
        .reduce((total, champs) => total + Object.keys(champs).length, 0);

    if (nb === 0) {
        bouton.disabled = true;
        bouton.style.opacity = "0.4";
        bouton.style.cursor = "not-allowed";
        bouton.innerText = "Enregistrer";
    } else {
        bouton.disabled = false;
        bouton.style.opacity = "1";
        bouton.style.cursor = "pointer";
        bouton.innerText = `Enregistrer (${nb} valeur${nb > 1 ? "s" : ""})`;
    }
};

window.sauvegarderGabaritsMonstres = async function() {
    const cles = Object.keys(modificationsEnAttente);
    if (cles.length === 0) return;

    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    const bouton = document.getElementById("btn-sauver-monstres");
    if (bouton) { bouton.disabled = true; bouton.innerText = "Enregistrement..."; }

    try {
        const lot = writeBatch(db);
        cles.forEach(cle => {
            lot.update(doc(db, COLLECTION_GABARITS, cle), modificationsEnAttente[cle]);
        });
        await lot.commit();

        // On répercute en mémoire pour que l'écran reste la vérité affichée.
        cles.forEach(cle => {
            const gabarit = (window.GABARITS_MONSTRES || []).find(g => g.Cle === cle);
            if (gabarit) Object.assign(gabarit, modificationsEnAttente[cle]);
        });

        modificationsEnAttente = {};
        document.querySelectorAll("#tbody-monstres input.valeur-modifiee")
            .forEach(input => input.classList.remove("valeur-modifiee"));

        window.actualiserBoutonSauvegardeMonstres();
        if (bouton) {
            bouton.innerText = "✔️ Enregistré";
            setTimeout(() => window.actualiserBoutonSauvegardeMonstres(), 1500);
        }
    } catch (e) {
        console.error("Erreur sauvegarde des gabarits :", e);
        alert("L'enregistrement a échoué. Vérifie ta connexion et réessaie.");
        if (bouton) { bouton.disabled = false; window.actualiserBoutonSauvegardeMonstres(); }
    }
};

// =========================================================================
//  5. GÉNÉRATION D'UNE RENCONTRE (bouton 💀 des options de combat)
// =========================================================================
//  Reprend le tableau "Rencontres" de Nico :
//    - une rencontre NORMALE tire au sort l'une des 5 répartitions Petit/Normal ;
//    - une rencontre DIFFICILE ajoute 1 Élite à ce tirage ;
//    - une rencontre TRÈS DIFFICILE ajoute 1 Boss à ce tirage.
//  Le terrain n'accueille que 4 ennemis à la fois : le surplus attend en
//  réserve et entre en renfort dès qu'une place se libère (mort d'un monstre).
// =========================================================================

const REPARTITIONS_NORMALES = [
    { Petit: 1, Normal: 3 },
    { Petit: 2, Normal: 2 },
    { Petit: 3, Normal: 1 },
    { Petit: 5, Normal: 0 },
    { Petit: 0, Normal: 4 }
];

// Ce que chaque cran de difficulté ajoute à la répartition de base.
const RENFORT_DIFFICULTE = {
    "Normale":        null,
    "Difficile":      "Élite",
    "Très difficile": "Boss"
};

// Le terrain accueille autant d'ennemis qu'il y a de joueurs, plus un. Les illusions
// sont des leurres posés par les héros, pas des joueurs : les compter ferait grossir
// la rencontre à chaque sort d'illusion. Plancher à 2 tant que la liste des
// personnages n'est pas encore chargée (sinon une rencontre se réduirait à 1 ennemi).
function limiteMonstresTerrain() {
    const joueurs = (window.PERSOS_JOUEURS_PARTIE || []).filter(p => !p.estIllusion && p.camp !== "Ennemi");
    return Math.max(2, joueurs.length + 1);
}

// Noms de repli, utilisés si la clé Gemini est absente ou si l'appel échoue :
// jamais de monstre sans nom sur le plateau.
const NOMS_SECOURS = {
    "DPS CAC":           ["Loup gris", "Bandit", "Gobelin rageur", "Hyène", "Écorcheur", "Sanglier"],
    "TANK CAC":          ["Ours brun", "Troll de pierre", "Golem d'argile", "Colosse", "Rhinox", "Gardien"],
    "SOUTIEN":           ["Chaman gobelin", "Guérisseur maudit", "Vieux druide", "Oracle", "Fétichiste"],
    "DPS MAGE CAC":      ["Sorcier de mêlée", "Moine des braises", "Lame runique", "Danseur de foudre"],
    "DPS DISTANCE":      ["Archer sylvestre", "Arbalétrier", "Frondeur", "Chasseur", "Sagittaire"],
    "DPS MAGE DISTANCE": ["Mage noir", "Nécromancien", "Invocateur", "Liche mineure", "Pyromancien"]
};

// Ambiance donnée à l'IA pour chaque archetype : c'est ce qui oriente le nom.
const AMBIANCE_ARCHETYPES = {
    "DPS CAC":           "guerrier ou bête féroce au corps à corps, rapide et agressif",
    "TANK CAC":          "créature massive et résistante qui encaisse (ours, golem, colosse...)",
    "SOUTIEN":           "soigneur ou soutien du groupe (chaman, oracle, prêtre corrompu...)",
    "DPS MAGE CAC":      "combattant magique de mêlée (moine élémentaire, lame enchantée...)",
    "DPS DISTANCE":      "tireur à distance (archer, arbalétrier, frondeur...)",
    "DPS MAGE DISTANCE": "lanceur de sorts à distance (mage noir, nécromancien, invocateur...)"
};

function hasard(tableau) {
    return tableau[Math.floor(Math.random() * tableau.length)];
}

// Les archetypes disponibles pour un palier donné : le tableau d'équilibrage ne
// prévoit pas de Boss pour le SOUTIEN, on ne doit donc jamais en tirer un.
function archetypesPourPalier(palier) {
    return Object.keys(AMBIANCE_ARCHETYPES).filter(a => window.gabaritMonstre(a, palier));
}

// Tire au sort la composition complète d'une rencontre : une liste
// [{ archetype, palier }], dans l'ordre où les monstres entreront en jeu.
window.tirerCompositionRencontre = function(difficulte) {
    const repartition = hasard(REPARTITIONS_NORMALES);
    const composition = [];

    ["Petit", "Normal"].forEach(palier => {
        for (let i = 0; i < (repartition[palier] || 0); i++) {
            const archetypes = archetypesPourPalier(palier);
            if (archetypes.length > 0) composition.push({ archetype: hasard(archetypes), palier });
        }
    });

    // Le renfort de difficulté passe DEVANT : un Élite ou un Boss est la pièce
    // maîtresse de la rencontre, il doit être sur le terrain dès le début et non
    // coincé en réserve derrière quatre bestioles.
    const palierRenfort = RENFORT_DIFFICULTE[difficulte];
    if (palierRenfort) {
        const archetypes = archetypesPourPalier(palierRenfort);
        if (archetypes.length > 0) {
            composition.unshift({ archetype: hasard(archetypes), palier: palierRenfort });
        }
    }

    return composition;
};

// -------------------------------------------------------------------------
//  Sous-agent IA : MIA_BESTIAIRE (nomme toute la rencontre en un seul appel)
// -------------------------------------------------------------------------
//  Un appel unique pour tout le groupe : c'est plus rapide, moins coûteux, et
//  surtout l'IA voit la rencontre entière, donc elle évite les doublons.
window.nommerMonstresIA = async function(composition) {
    // Repli immédiat : noms de secours tirés au sort, sans doublon.
    const nommerParDefaut = () => {
        const dejaPris = new Set();
        return composition.map(m => {
            const banque = NOMS_SECOURS[m.archetype] || ["Créature"];
            let nom = hasard(banque);
            let essais = 0;
            while (dejaPris.has(nom) && essais < 12) { nom = hasard(banque); essais++; }
            if (dejaPris.has(nom)) nom = `${nom} ${dejaPris.size + 1}`;
            dejaPris.add(nom);
            return nom;
        });
    };

    const cleGemini = localStorage.getItem("ivalis_GEMINI_API_KEY");
    if (!cleGemini || composition.length === 0) return nommerParDefaut();

    const listePourIA = composition.map((m, i) =>
        `${i + 1}. ${m.archetype} (palier ${m.palier}) — ${AMBIANCE_ARCHETYPES[m.archetype] || ""}`
    ).join("\n");

    const promptSysteme = `Tu es MIA_BESTIAIRE, l'IA qui baptise les créatures d'un jeu de rôle médiéval-fantastique sombre.
On te donne la composition d'un groupe d'ennemis. Tu dois trouver UN nom court et thématique par créature.

RÈGLES :
- Le nom colle au rôle indiqué (un TANK est massif : ours, golem, troll ; un DPS MAGE DISTANCE est un lanceur de sorts : mage noir, nécromancien...).
- 1 à 3 mots maximum, en français, sans numéro ni chiffre.
- Le palier donne la stature : "Petit" = créature mineure, "Normal" = combattant ordinaire, "Élite" = champion redoutable, "Boss" = créature légendaire au nom marquant.
- Tous les noms doivent être DIFFÉRENTS les uns des autres.
- Renvoie EXACTEMENT ${composition.length} nom(s), dans le même ordre que la liste.`;

    const outils = [{
        functionDeclarations: [{
            name: "nommerLesCreatures",
            description: "Donne la liste des noms, dans l'ordre exact des créatures fournies.",
            parameters: {
                type: "OBJECT",
                properties: {
                    noms: { type: "ARRAY", items: { type: "STRING" }, description: "Un nom par créature, dans l'ordre" }
                },
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
                contents: [{ role: "user", parts: [{ text: `Voici le groupe à nommer :\n${listePourIA}` }] }],
                tools: outils,
                toolConfig: { functionCallingConfig: { mode: "ANY" } }
            })
        });

        const data = await res.json();
        const appel = data.candidates?.[0]?.content?.parts?.find(p => p.functionCall)?.functionCall;
        const noms = appel?.args?.noms;

        if (!Array.isArray(noms) || noms.length === 0) return nommerParDefaut();

        // L'IA peut en renvoyer trop peu : on complète avec les noms de secours.
        const secours = nommerParDefaut();
        return composition.map((m, i) => {
            const nom = (noms[i] || "").toString().trim();
            return nom.length > 0 ? nom.slice(0, 40) : secours[i];
        });

    } catch (e) {
        console.error("[MIA_BESTIAIRE] Nommage impossible, repli sur les noms de secours :", e);
        return nommerParDefaut();
    }
};

// -------------------------------------------------------------------------
//  Pose d'un monstre sur le plateau
// -------------------------------------------------------------------------
//  Crée le document, le pion, et l'inscrit dans l'ordre d'initiative. Sert à la
//  génération initiale ET à l'arrivée d'un renfort.
window.poserMonstreSurTerrain = async function(monstre, tokensData) {
    const gabarit = window.gabaritMonstre(monstre.archetype, monstre.palier);
    if (!gabarit) {
        console.error("Gabarit introuvable :", monstre);
        return null;
    }

    const idMonstre = "MONSTRE_" + Math.random().toString(36).substring(2, 9);

    await window.creerMonstreDepuisGabarit(idMonstre, gabarit, {
        // Le moteur de combat lit Prenom/Nom_Personnage pour l'affichage : le nom
        // trouvé par l'IA tient dans le prénom, le nom reste vide.
        Prenom_Personnage: monstre.nom,
        Nom_Personnage: "",
        Initiative: 10,
        Critique: 5,
        Competences_Max: 4,
        URL_Cloudinary: "",
        URL_Token: ""
    });

    // Autour du repère d'apparition des ennemis, au hasard des cases libres —
    // et à défaut de repère (ou de module de combat chargé), au plus près du
    // centre comme autrefois.
    const repereEnnemi = typeof window.pointApparition === "function"
        ? window.pointApparition("Ennemi") : null;
    const hexLibre = typeof window.trouverHexLibreAutour === "function"
        ? window.trouverHexLibreAutour(tokensData, repereEnnemi, 2)
        : window.trouverHexLibreVTT(tokensData);
    tokensData[idMonstre] = { q: hexLibre.q, r: hexLibre.r, url: "", taille: 55 };

    const partieRef = doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE);
    const partieSnap = await getDoc(partieRef);
    if (partieSnap.exists()) {
        const ordre = partieSnap.data().Ordre_Initiative || [];
        if (!ordre.includes(idMonstre)) {
            ordre.push(idMonstre);
            await updateDoc(partieRef, { Ordre_Initiative: ordre });
        }
    }

    return idMonstre;
};

// -------------------------------------------------------------------------
//  Génération complète, déclenchée par le bouton "Valider" de la fenêtre
// -------------------------------------------------------------------------
window.genererRencontreMonstres = async function(difficulte) {
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT) {
        alert("Ouvre d'abord un combat : les monstres ont besoin d'un plateau pour apparaître.");
        return;
    }

    // Les gabarits doivent être chargés, sinon aucune stat à recopier. On les
    // relit systématiquement : le tableau d'équilibrage peut avoir été modifié
    // depuis un autre appareil, et une rencontre lancée sur des valeurs périmées
    // donnerait des monstres et des techniques qui ne correspondent plus au
    // bestiaire. Une lecture de plus ne coûte rien à côté de ça.
    try {
        await window.chargerGabaritsMonstres();
    } catch (e) {
        console.error("Relecture des gabarits impossible, on garde ceux en mémoire :", e);
    }

    const composition = window.tirerCompositionRencontre(difficulte);
    if (composition.length === 0) {
        alert("Aucun gabarit de monstre disponible : ouvre Paramètres > Outils > Monstres pour les initialiser.");
        return;
    }

    const noms = await window.nommerMonstresIA(composition);
    composition.forEach((m, i) => { m.nom = noms[i] || "Créature"; });

    // Le terrain est limité : le reste attend en réserve.
    const limite = limiteMonstresTerrain();
    const surLeTerrain = composition.slice(0, limite);
    const enReserve    = composition.slice(limite);

    const tokensData = { ...window.TOKENS_VTT_DATA };
    const poses = [];
    for (const monstre of surLeTerrain) {
        const idPose = await window.poserMonstreSurTerrain(monstre, tokensData);
        if (idPose) poses.push({ ...monstre, id: idPose });
    }

    // Seuls les pions posés à l'instant : renvoyer toute la carte remettrait au
    // passage les positions périmées des combattants déjà sur le plateau.
    window.TOKENS_VTT_DATA = tokensData;
    await window.enregistrerPionsVTT(...poses.map(p => p.id));
    await window.sauvegarderReserveMonstres(enReserve);

    // Les techniques sont forgées EN ARRIÈRE-PLAN, sans bloquer : les pions
    // apparaissent tout de suite, et les bannières se remplissent quelques
    // secondes plus tard (les monstres ne jouent de toute façon qu'au tour de
    // l'IA de combat). Les créatures sont traitées en parallèle entre elles.
    if (typeof window.equiperCompetencesRencontre === "function") {
        window.equiperCompetencesRencontre(poses).catch(e => console.error(e));
    }

    console.log(`🐲 Rencontre ${difficulte} : ${surLeTerrain.length} sur le terrain, ${enReserve.length} en réserve.`);
    return { surLeTerrain, enReserve };
};

// -------------------------------------------------------------------------
//  La réserve (renforts en attente d'une place libre)
// -------------------------------------------------------------------------
//  updateDoc et non setDoc/merge : merge fusionne les tableaux au lieu de les
//  remplacer, la réserve ne se viderait donc jamais.
window.sauvegarderReserveMonstres = async function(reserve) {
    if (!window.ID_PARTIE_COURANTE) return;
    const partieRef = doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE);
    await updateDoc(partieRef, { Reserve_Monstres: reserve || [] })
        .catch(e => console.error("Sauvegarde de la réserve :", e));
};

window.lireReserveMonstres = async function() {
    if (!window.ID_PARTIE_COURANTE) return [];
    const snap = await getDoc(doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE));
    return snap.exists() ? (snap.data().Reserve_Monstres || []) : [];
};

// Appelé quand un monstre vient de mourir : si une place est libre et qu'il
// reste des renforts, le suivant entre en jeu.
window.entrerRenfortMonstre = async function() {
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT) return null;

    const reserve = await window.lireReserveMonstres();
    if (reserve.length === 0) return null;

    const vivants = (window.MONSTRES_PARTIE || []).filter(m =>
        m.statut !== "Mort" && (parseInt(m.PV_Actuels) || 0) > 0
    ).length;
    if (vivants >= limiteMonstresTerrain()) return null;

    const renfort = reserve.shift();
    const tokensData = { ...window.TOKENS_VTT_DATA };
    const idMonstre = await window.poserMonstreSurTerrain(renfort, tokensData);

    window.TOKENS_VTT_DATA = tokensData;
    if (idMonstre) await window.enregistrerPionsVTT(idMonstre);
    await window.sauvegarderReserveMonstres(reserve);

    // Un renfort arrive en cours de combat : il lui faut ses techniques, elles
    // aussi forgées en arrière-plan pour ne pas figer l'écran en plein tour.
    if (idMonstre && typeof window.equiperCompetencesMonstre === "function") {
        window.equiperCompetencesMonstre(idMonstre, { ...renfort, id: idMonstre }).catch(e => console.error(e));
    }

    console.log(`🐲 Renfort : ${renfort.nom} entre en jeu.`);
    return idMonstre;
};

// -------------------------------------------------------------------------
//  Mort et nettoyage
// -------------------------------------------------------------------------
//  Le monstre est d'abord marqué Mort (le cadavre reste visible, les effets en
//  cours qui le ciblent ne pointent pas dans le vide), puis réellement effacé
//  de la base à la fin du combat.
window.marquerMonstreMort = async function(idMonstre) {
    if (!window.estMonstre(idMonstre)) return;
    await updateDoc(doc(db, COLLECTION_MONSTRES, idMonstre), { Statut: "Mort" })
        .catch(e => console.error("Marquage de la mort :", e));
    await window.entrerRenfortMonstre();
};

// Efface tous les monstres de la partie : documents, pions, initiative, réserve.
// Appelé par la réinitialisation du combat (seule vraie "fin de combat" du jeu)
// et disponible pour un nettoyage manuel.
window.nettoyerMonstresCombat = async function() {
    if (!window.ID_PARTIE_COURANTE) return;

    const monstres = [...(window.MONSTRES_PARTIE || [])];
    const vttRef = doc(db, "Combat_VTT", window.ID_PARTIE_COURANTE);
    const partieRef = doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE);

    for (const monstre of monstres) {
        const id = monstre.idPersonnage;
        delete window.TOKENS_VTT_DATA[id];

        // ⚠️ Firestore n'efface PAS les sous-collections avec le document parent :
        // sans ce passage, les techniques forgées resteraient orphelines en base
        // à chaque combat. On les supprime donc explicitement avant le monstre.
        const idsCartes = Object.keys((window.CACHE_COMPETENCES_GLOBAL || {})[id] || {});
        for (const idCarte of idsCartes) {
            await deleteDoc(doc(db, COLLECTION_MONSTRES, id, "Competences", idCarte)).catch(e => console.error(e));
        }
        if (window.CACHE_COMPETENCES_GLOBAL) delete window.CACHE_COMPETENCES_GLOBAL[id];

        await deleteDoc(doc(db, COLLECTION_MONSTRES, id)).catch(e => console.error(e));
        await updateDoc(vttRef, { ["Tokens." + id]: deleteField() }).catch(e => console.error(e));
        delete window.SOURCE_COMBATTANTS[id];
    }

    if (typeof window.arreterEcouteCompetencesMonstres === "function") {
        window.arreterEcouteCompetencesMonstres();
    }

    const partieSnap = await getDoc(partieRef);
    if (partieSnap.exists()) {
        const idsMonstres = monstres.map(m => m.idPersonnage);
        const ordre = (partieSnap.data().Ordre_Initiative || []).filter(id => !idsMonstres.includes(id));
        const file  = (partieSnap.data().File_Attente_Combat || []).filter(item => !idsMonstres.includes(item.idPersonnage));
        await updateDoc(partieRef, {
            Ordre_Initiative: ordre,
            File_Attente_Combat: file,
            Reserve_Monstres: []
        }).catch(e => console.error(e));
    }

    window.MONSTRES_PARTIE = [];
    window.recomposerCombattants();
    if (typeof window.appliquerTokensVTT === "function") window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    if (monstres.length > 0) console.log(`🧹 ${monstres.length} monstre(s) effacé(s) de la base.`);
};

// =========================================================================
//  6. LA FENÊTRE DE GÉNÉRATION (bouton 💀 des options de combat)
// =========================================================================

window.DIFFICULTE_RENCONTRE_CHOISIE = "Normale";

window.ouvrirGenerationRencontre = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT) {
        alert("Ouvre d'abord un combat : les monstres ont besoin d'un plateau pour apparaître.");
        return;
    }

    const voile = document.getElementById("etape-generation-rencontre");
    if (!voile) return;

    window.DIFFICULTE_RENCONTRE_CHOISIE = "Normale";
    window.choisirDifficulteRencontre("Normale");

    const btn = document.getElementById("btn-valider-rencontre");
    if (btn) { btn.disabled = false; btn.innerText = "Valider"; }

    voile.style.display = "flex";
};

window.fermerGenerationRencontre = function() {
    const voile = document.getElementById("etape-generation-rencontre");
    if (voile) voile.style.display = "none";
};

window.choisirDifficulteRencontre = function(difficulte) {
    window.DIFFICULTE_RENCONTRE_CHOISIE = difficulte;

    document.querySelectorAll(".choix-difficulte-rencontre").forEach(el => {
        const actif = el.dataset.difficulte === difficulte;
        el.style.borderColor = actif ? "#ffd700" : "#5c3a21";
        el.style.background  = actif ? "rgba(255, 215, 0, 0.12)" : "rgba(0, 0, 0, 0.25)";
        el.style.boxShadow   = actif ? "0 0 14px rgba(255, 215, 0, 0.45)" : "none";
    });
};

window.validerGenerationRencontre = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    const btn = document.getElementById("btn-valider-rencontre");
    if (btn) { btn.disabled = true; btn.innerText = "Invocation..."; }

    try {
        await window.genererRencontreMonstres(window.DIFFICULTE_RENCONTRE_CHOISIE);
        window.fermerGenerationRencontre();
    } catch (e) {
        console.error("Erreur de génération de la rencontre :", e);
        alert("La génération a échoué. Regarde la console pour le détail.");
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "Valider"; }
    }
};
