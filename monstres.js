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
    collection, doc, getDocs, setDoc, onSnapshot, query, where, writeBatch
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
    const joueurs = window.PERSOS_JOUEURS_PARTIE || [];
    const monstres = window.MONSTRES_PARTIE || [];
    window.PERSOS_PARTIE = [...joueurs, ...monstres];

    // Rafraîchit ce qui dépend de la liste des combattants, si le combat tourne.
    if (typeof window.appliquerTokensVTT === "function" && window.TOKENS_VTT_DATA) {
        window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    }
    if (typeof window.afficherPisteInitiative === "function") window.afficherPisteInitiative();
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
            const objet = typeof versFront === "function"
                ? versFront(document.id, document.data())
                : { idPersonnage: document.id, ...document.data() };
            objet.estMonstre = true;
            monstres.push(objet);
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
