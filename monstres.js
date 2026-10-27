// =========================================================================
//  IVALIS - MODULE DES MONSTRES
// =========================================================================
//  Ce module regroupe TOUT ce qui touche aux monstres, volontairement à part
//  du reste du code :
//
//   1. Les GABARITS (collection "Monstres_Modeles") : le tableau d'équilibrage
//      par archetype et par palier (Petit / Normal / Boss — plus d'Élite
//      depuis la v262). Ce sont des
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
import { db } from "./firebase-config.js?v=2";
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
// Plus de ligne Élite (Nico, v262 : « les types de monstres, maintenant :
// Petits, Normaux, Boss — enlève les lignes Élite du tableau »).
const VALEURS_DEFAUT = {
    "DPS CAC": {
        "Petit":  [40, 15, 10,  5,  80, 50, 100, 1,  40],
        "Normal": [70, 20, 15, 15, 120, 30,  90, 1, 100],
        "Boss":   [240, 40, 25, 15, 220, 40,  70, 2, 800]
    },
    "TANK CAC": {
        "Petit":  [50, 25,  0, 20,  60, 50, 100, 1,  40],
        "Normal": [90, 30, 20, 20,  90, 30,  90, 1, 100],
        "Boss":   [250, 50, 30, 35, 170, 40,  70, 2, 800]
    },
    // Le tableau d'origine ne prévoit pas de Boss pour le Soutien.
    "SOUTIEN": {
        "Petit":  [45, 10, 10, 10,  75, 50, 100, 1,  40],
        "Normal": [70, 20, 20, 10, 120, 30,  90, 1, 100]
    },
    "DPS MAGE CAC": {
        "Petit":  [40, 10, 15,  5,  80, 50, 100, 1,  40],
        "Normal": [70, 15, 20, 15, 120, 30,  90, 1, 100],
        "Boss":   [240, 25, 40, 15, 220, 40,  70, 2, 800]
    },
    "DPS DISTANCE": {
        "Petit":  [35, 10,  5, 10,  90, 50, 100, 1,  40],
        "Normal": [65, 15, 10, 15, 145, 30,  90, 1, 100],
        "Boss":   [225, 25, 25, 20, 240, 40,  70, 2, 800]
    },
    "DPS MAGE DISTANCE": {
        "Petit":  [35,  5, 10, 10,  90, 50, 100, 1,  40],
        "Normal": [65, 10, 15, 15, 145, 30,  90, 1, 100],
        "Boss":   [225, 25, 25, 20, 240, 40,  70, 2, 800]
    }
};

// Identifiant de document stable et lisible : "dps_cac__boss".
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
    // Les documents en « _ » ne sont pas des gabarits (les réglages de triche
    // et de marche, plus bas).
    snap.forEach(d => { if (!String(d.id).startsWith("_")) existants[d.id] = d.data(); });

    const manquants = parDefaut.filter(g => !existants[g.Cle]);
    if (manquants.length > 0) {
        const lot = writeBatch(db);
        manquants.forEach(g => lot.set(doc(db, COLLECTION_GABARITS, g.Cle), g));
        await lot.commit();
        manquants.forEach(g => { existants[g.Cle] = g; });
        console.log(`🐲 ${manquants.length} gabarit(s) de monstre amorcé(s) en base.`);
    }

    // On garde l'ordre du tableau de référence, quoi qu'il arrive en base. Les
    // anciennes lignes Élite restent en base, sans plus servir : elles ne
    // s'affichent plus et ne se tirent plus (v262).
    window.GABARITS_MONSTRES = Object.values(existants).filter(g => !estPalierElite(g.Palier)).sort((a, b) => {
        if (a.Ordre_Archetype !== b.Ordre_Archetype) return (a.Ordre_Archetype || 0) - (b.Ordre_Archetype || 0);
        return (a.Ordre_Palier || 0) - (b.Ordre_Palier || 0);
    });

    return window.GABARITS_MONSTRES;
};

function estPalierElite(palier) { return palier === "Élite" || palier === "Elite"; }

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
    const fraiches = [...joueurs, ...monstres];

    // Le niveau du groupe suit : un héros qui monte, qui arrive ou qui part
    // passe tous par ici (v263).
    if (typeof window.actualiserNiveauGroupe === "function") {
        try { window.actualiserNiveauGroupe(); } catch (e) { console.error("Niveau du groupe :", e); }
    }

    // TANT QUE LE CERVEAU TIENT CE COMBAT, SES CHIFFRES FONT FOI — jamais ceux
    // que Personnages ou Monstres viennent de renvoyer. Ces documents ne
    // reçoivent plus une seule écriture de PV, fatigue, bouclier ou états
    // depuis que le combat vit dans l'état du cerveau : un geste sans rapport
    // avec le combat (une fiche corrigée, un monstre retouché) reconstruirait
    // sinon ce combattant à sa valeur d'AVANT le combat. Voir
    // fusionnerFichesCombat (pont_combat.js).
    const etatCerveauOuvert = typeof window.regimeDuJeu === "function" && window.regimeDuJeu()
        && window.regimeDuJeu().etatPublie();
    window.PERSOS_PARTIE = (etatCerveauOuvert && window.pontCombat
                            && typeof window.pontCombat.fusionnerFichesCombat === "function")
        ? window.pontCombat.fusionnerFichesCombat(fraiches, window.PERSOS_PARTIE, etatCerveauOuvert.combattants)
        : fraiches;

    // Un combattant dont le journal n'a pas encore rejoué le tour garde à
    // l'écran les valeurs déjà montrées : sinon sa vie se retire derrière la
    // fenêtre sombre, plusieurs secondes avant le coup qui la lui prend.
    //
    // Tout ce qui bouge ICI vient de la BASE, pas d'un calcul local : la trace
    // doit le dire, sans quoi une arrivée de Firebase pendant le tour d'une
    // créature se lit « [calcul IA] » et fait accuser le mauvais coupable.
    window.__TRACE_CAUSE = "[base]";
    try {
        if (typeof window.figerAffichageRetenus === "function") window.figerAffichageRetenus();
    } finally { window.__TRACE_CAUSE = null; }

    // Chaque fiche fraîche est remise sous surveillance : c'est ainsi que la
    // trace voit passer TOUS les changements de points de vie, avec leur cause.
    if (typeof window.surveillerLesCombattants === "function") window.surveillerLesCombattants();

    // Rafraîchit ce qui dépend de la liste des combattants, si le combat tourne.
    if (typeof window.appliquerTokensVTT === "function" && window.TOKENS_VTT_DATA) {
        window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    }
    if (typeof window.afficherPisteInitiative === "function") window.afficherPisteInitiative();

    // LE REDESSIN D'UNE CRÉATURE A DISPARU AVEC LE PANNEAU LATÉRAL. Il servait
    // à rafraîchir sa fiche quand ses techniques venaient d'être forgées — le
    // panneau affichait encore « Aucune compétence mémorisée » alors que la
    // forge était terminée. Plus aucun écran ne montre le deck d'une créature.
    //
    // Pour les HÉROS, en revanche, le rafraîchissement reste indispensable :
    // sans lui, l'écran gardait les chiffres du moment où le combat s'était
    // ouvert — on voyait 48 d'énergie là où le poste d'à côté en voyait 18.
    if (typeof window.rafraichirAffichageCombat === "function") {
        window.rafraichirAffichageCombat();
    }

    // Qui est à terre ? La réponse doit être la MÊME sur les trois écrans, et
    // c'est ici qu'on voit changer les points de vie. La liste partagée est donc
    // mise à jour au passage — sans rien écrire quand elle est déjà juste, et
    // sans jamais juger un combattant que ce poste n'a pas encore chargé.
    if (typeof window.synchroniserCombattantsHorsJeu === "function") {
        Promise.resolve(window.synchroniserCombattantsHorsJeu())
            .catch(e => console.error("Suivi des combattants à terre :", e));
    }

    // Tous les ennemis sont-ils tombés ? La victoire (et son butin) se
    // détecte ici : c'est le seul endroit qui voit changer la liste des
    // monstres, qu'ils meurent au combat ou via la coupe de test.
    //
    // Sous try/catch : cette fonction reconstruit PERSOS_PARTIE, dont dépendent
    // le déploiement des pions, la génération de rencontre et tout le combat.
    // Une exception venue du butin ne doit jamais emporter ça avec elle.
    if (typeof window.verifierVictoireCombat === "function") {
        try { window.verifierVictoireCombat(); }
        catch (e) { console.error("Détection de victoire (le combat continue) :", e); }
    }
    // Et la défaite : tous les héros à terre (blessures_ui.js).
    if (typeof window.verifierDefaiteCombat === "function") {
        try { window.verifierDefaiteCombat(); }
        catch (e) { console.error("Détection de défaite (le combat continue) :", e); }
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
            // Le leader (v262) : son aura sur le plateau, son liseré rouge sur
            // la piste, ses bonus au combat ; et celle qui se relèvera en leader
            // à son premier KO (Apparition 1).
            objet.leader        = !!brut.Leader;
            objet.releveEnLeader = !!brut.Releve_En_Leader && !brut.Leader;
            // Les résistances de son rang de leader, tirées d'avance (v263).
            if (Array.isArray(brut.Resistances_En_Leader)) objet.resistancesEnLeader = [...brut.Resistances_En_Leader];
            // LE TABLEAU DES MONSTRES JUSQU'AU COMBAT (Nico, v251 : « assure-toi
            // que Paramètres > Outils > Monstres soit bien relié aux stats
            // réelles des monstres en jeu »). Le nombre d'actions décide d'une
            // seconde compétence (une créature d'avant ce champ : le palier) ;
            // le repos long (en % de la jauge) n'arrivait pas jusqu'au combat,
            // qui reprenait 35 % pour tout le monde.
            objet.Nombre_Actions = parseInt(brut.Nombre_Actions) || (brut.Palier === "Boss" ? 2 : 1);
            objet.XP_Groupe     = brut.XP_Groupe || 0;
            if (brut.Repos_Long !== undefined) objet.Repos_Long = brut.Repos_Long;
            // Le compagnon du Pisteur : l'identifiant de son maître.
            objet.compagnonDe   = brut.Compagnon_De || "";
            objet.nomAttaque    = brut.Nom_Attaque || "";
            // Ses résistances (app.js) : tirées à sa création parmi tous les
            // états (Resistances_Etats, v260) ; une créature d'avant garde ses
            // résistances élémentaires (Resistances_Elementaires), une plus
            // ancienne encore les reçoit de son identifiant.
            objet.resistancesEtats = Array.isArray(brut.Resistances_Etats) ? brut.Resistances_Etats
                : Array.isArray(brut.Resistances_Elementaires) ? brut.Resistances_Elementaires
                : (brut.Compagnon_De || typeof window.resistancesParDefaut !== "function"
                    ? [] : window.resistancesParDefaut(document.id, brut.Palier));
            objet.resistancesElementaires = objet.resistancesEtats;   // le nom d'avant
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

    // LA TRICHE SELON LE NIVEAU DU GROUPE (v263) : autant de PV en plus que de
    // % de dégâts et de soins. Un leader y ajoute les siens (champsLeader).
    const pvTriche = window.tricheMonstresActuelle();
    // SES RÉSISTANCES, SELON LE NIVEAU DU GROUPE ET SA STATURE (v263). Celle qui
    // se relèvera en leader (Apparition 1) tire déjà celles de son futur rang :
    // les premières sont les siennes, les suivantes viennent avec la relève.
    const leader = !!donneesSupplementaires.Leader;
    const releve = !!donneesSupplementaires.Releve_En_Leader && !leader;
    const nbResistances = typeof window.nbResistancesCreature === "function"
        ? window.nbResistancesCreature(gabarit.Palier, { leader }) : undefined;
    const nbEnLeader = releve && typeof window.nbResistancesCreature === "function"
        ? window.nbResistancesCreature(gabarit.Palier, { leader: true }) : 0;
    const tirees = typeof window.tirerResistancesEtats === "function"
        ? window.tirerResistancesEtats(gabarit.Palier, undefined, Math.max(nbResistances || 0, nbEnLeader) || nbResistances) : [];

    const data = {
        ID_Partie: window.ID_PARTIE_COURANTE,
        ID_Joueur: "MJ",
        Camp: "Ennemi",
        Statut: "Vivant",
        Gabarit: gabarit.Cle,
        Archetype: gabarit.Archetype,
        Palier: gabarit.Palier,
        PV_Max: (Number(gabarit.PV) || 0) + pvTriche,
        PV_Actuels: (Number(gabarit.PV) || 0) + pvTriche,
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
        // Parmi tous les états (v260 : 25 % de chance en moins de l'attraper),
        // autant que le niveau du groupe et sa stature le disent (v263).
        Resistances_Etats: nbResistances === undefined ? tirees : tirees.slice(0, nbResistances),
        ...(releve ? { Resistances_En_Leader: tirees } : {}),
        ...donneesSupplementaires
    };

    window.SOURCE_COMBATTANTS[idMonstre] = COLLECTION_MONSTRES;
    await setDoc(doc(db, COLLECTION_MONSTRES, idMonstre), data);
    return data;
};

// =========================================================================
//  LA TRICHE ET LA MARCHE DES CRÉATURES, RÉGLABLES À LA VOLÉE (v252)
// =========================================================================
//  Nico : « Dis-moi combien de dégâts on a rajouté en triche aux monstres ?
//  Mets dans Paramètres > Monstres, en haut du tableau, la valeur de dégâts
//  qu'on pourra modifier à la volée, et mets aussi leur nombre de
//  déplacements. »
//
//  Trois réglages, valables pour toutes les créatures (pas par gabarit) :
//    · les dégâts (et soins) EN PLUS par stature — en % du brut depuis la
//      v255 (10 % chacune), avant les résistances (bonusMonstreDe,
//      appliquerBonusMonstre, moteur_pur.js) ;
//    · le bonus des SORTS, en % — sur les seules chances d'état de leurs
//      cartes, ni les dégâts ni les soins (multiplicateurSortsMonstre, app.js) ;
//    · les cases de MARCHE par stature (pasMaxDe, ia_pure.js ; pasMaxMonstre,
//      monstres_ia.js).
//  Ils vivent dans un document à part du bestiaire (Monstres_Modeles/_REGLAGES),
//  que CHAQUE poste écoute : un chiffre changé vaut tout de suite, combat en
//  cours compris — c'est le poste qui tient le cerveau qui calcule.
//
//  Plus de colonne Élite depuis la v262 (le noyau garde son chiffre, pour une
//  créature d'avant). Et l'encart du LEADER (v262) : ce qu'un leader gagne en
//  plus — dégâts et soins (%), défenses physique et magique (points), PV,
//  chance de poser un état (points). Les dégâts et la chance d'état valent tout
//  de suite ; les PV et les défenses, au prochain leader posé.
const DOC_REGLAGES = "_REGLAGES";
const PALIERS_REGLES = ["Petit", "Normal", "Boss"];
// Les chiffres tenus, eux, gardent l'Élite : une créature d'avant marche et
// frappe pareil dans la préparation et dans le cerveau.
const PALIERS_TENUS = ["Petit", "Normal", "Élite", "Boss"];
// Le noyau du combat (moteur_pur.js, ia_pure.js) porte les chiffres d'origine
// et se règle par window.moteurPur / window.iaPure — le même module que celui
// du cerveau, par la table d'import de la page. Sans lui (un banc qui isole ce
// fichier), les mêmes chiffres, écrits ici.
const noyauMoteur = () => (typeof window !== "undefined" && window.moteurPur) || {};
const noyauIA = () => (typeof window !== "undefined" && window.iaPure) || {};
window.REGLAGES_MONSTRES_DEFAUT = Object.freeze({
    // LA TRICHE SELON LE NIVEAU DU GROUPE (Nico, v263 : « du niveau 1 à 4 :
    // base de 7 + 1 × niveau du groupe ; du niveau 5 à 10 : base de 5 + 2 ×
    // niveau ; ça donne un % de dégâts et de soins qui se rajoute, et un nombre
    // de points de vie qui se rajoutent — au niveau 1, 8 % et 8 PV »). Elle
    // remplace la triche par stature (10 % chacune, v255).
    tricheNiveau: { base14: 7, parNiveau14: 1, base510: 5, parNiveau510: 2 },
    bonusSortsPct: 20,
    deplacement: { ...(noyauIA().PAS_PAR_PALIER_DEFAUT || { "Petit": 6, "Normal": 5, "Élite": 4, "Boss": 4 }) },
    leader: { ...(noyauMoteur().LEADER_DEFAUT || { degats: 15, resistances: 15, pv: 15 }) }
});
const BORNES_REGLAGES = { bonusDegats: [-50, 200], bonusSortsPct: [-50, 200], deplacement: [0, 15],
                          tricheBase: [-50, 200], trichePente: [-20, 50],
                          leaderDegats: [-50, 200], leaderResistances: [-50, 70], leaderPv: [0, 300] };
// Les trois chiffres du leader : leur nom en base, leur borne, leur libellé.
// (La chance d'état en plus, 15 pts, est retirée en v267 — Nico : « on ne sait
// pas dans quoi, enlève-la de là et de la création des leaders ».)
const CHAMPS_LEADER = [
    { cle: "degats", champ: "Degats_Soins_Pct", borne: "leaderDegats", titre: "Dégâts et soins en plus", unite: "%",
      aide: "En pour cent du brut de chaque attaque et de chaque soin, en plus de la triche du niveau du groupe" },
    { cle: "resistances", champ: "Resistances", borne: "leaderResistances", titre: "Défenses physique et magique", unite: "pts",
      aide: "Points ajoutés à ses résistances physique et magique (20 % deviennent 35 %)" },
    { cle: "pv", champ: "PV", borne: "leaderPv", titre: "Points de vie en plus", unite: "PV",
      aide: "Ajoutés à son maximum de vie" }
];
// Les quatre chiffres de la triche selon le niveau.
const CHAMPS_TRICHE = [
    { cle: "base14", champ: "Base_1_4", borne: "tricheBase" },
    { cle: "parNiveau14", champ: "Par_Niveau_1_4", borne: "trichePente" },
    { cle: "base510", champ: "Base_5_10", borne: "tricheBase" },
    { cle: "parNiveau510", champ: "Par_Niveau_5_10", borne: "trichePente" }
];
// Le % de dégâts et de soins (et les PV) que les créatures prennent en plus, à
// ce niveau du groupe. Au-delà du niveau 10, la même pente.
window.tricheDuNiveau = function(niveau, t) {
    const r = t || (window.REGLAGES_MONSTRES || window.REGLAGES_MONSTRES_DEFAUT).tricheNiveau;
    const n = Math.max(1, Math.round(Number(niveau) || 1));
    return n <= 4 ? r.base14 + r.parNiveau14 * n : r.base510 + r.parNiveau510 * n;
};
// La triche du moment, au niveau du groupe d'aujourd'hui.
window.tricheMonstresActuelle = () => window.tricheDuNiveau(window.NIVEAU_GROUPE || 1);

const borner = (famille, v, defaut) => {
    // Une case vidée (ou un champ absent) garde la valeur d'avant.
    if (v === undefined || v === null || String(v).trim() === "") return defaut;
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return defaut;
    const [min, max] = BORNES_REGLAGES[famille];
    return Math.max(min, Math.min(max, n));
};
// Des réglages lus en base (ou rien) → des réglages complets et bornés.
window.normaliserReglagesMonstres = function(brut) {
    const d = window.REGLAGES_MONSTRES_DEFAUT;
    const src = brut || {};
    const parPalier = (famille, champ) => {
        const t = {};
        PALIERS_TENUS.forEach(p => { t[p] = borner(famille, ((src[champ] || {})[p]), d[famille][p]); });
        return t;
    };
    const leader = {};
    CHAMPS_LEADER.forEach(c => { leader[c.cle] = borner(c.borne, (src.Leader || {})[c.champ], d.leader[c.cle]); });
    const tricheNiveau = {};
    CHAMPS_TRICHE.forEach(c => { tricheNiveau[c.cle] = borner(c.borne, (src.Triche_Niveau || {})[c.champ], d.tricheNiveau[c.cle]); });
    // La triche par stature d'avant (Bonus_Degats_Pct, v255) ne se lit plus :
    // c'est le niveau du groupe qui la donne, la même pour toutes les statures.
    const pct = window.tricheDuNiveau(window.NIVEAU_GROUPE || 1, tricheNiveau);
    return {
        bonusDegats: Object.fromEntries(PALIERS_TENUS.map(p => [p, pct])),
        tricheNiveau,
        bonusSortsPct: borner("bonusSortsPct", src.Bonus_Sorts_Pct, d.bonusSortsPct),
        deplacement: parPalier("deplacement", "Deplacement"),
        leader
    };
};
// La triche telle qu'on l'écrit en base.
const tricheVersBase = (t) => Object.fromEntries(CHAMPS_TRICHE.map(c => [c.champ, t[c.cle]]));
// Le leader tel qu'on l'écrit en base.
const leaderVersBase = (leader) => Object.fromEntries(CHAMPS_LEADER.map(c => [c.champ, leader[c.cle]]));
// Les poser partout où le jeu les lit.
window.appliquerReglagesMonstres = function(brut) {
    const r = window.normaliserReglagesMonstres(brut);
    window.REGLAGES_MONSTRES = r;
    window.REGLAGES_MONSTRES_BRUTS = brut || null;
    if (typeof noyauMoteur().reglerBonusMonstres === "function") noyauMoteur().reglerBonusMonstres(r.bonusDegats);
    if (typeof noyauIA().reglerPasMonstres === "function") noyauIA().reglerPasMonstres(r.deplacement);
    if (typeof noyauMoteur().reglerLeader === "function") noyauMoteur().reglerLeader(r.leader);
    window.MULTIPLICATEUR_SORTS_MONSTRE = 1 + r.bonusSortsPct / 100;
    if (typeof window.dessinerReglagesMonstres === "function") window.dessinerReglagesMonstres();
    return r;
};
window.appliquerReglagesMonstres(null);

let arretReglagesMonstres = null;
window.ecouterReglagesMonstres = function() {
    if (arretReglagesMonstres) return;
    try {
        arretReglagesMonstres = onSnapshot(doc(db, COLLECTION_GABARITS, DOC_REGLAGES),
            (snap) => window.appliquerReglagesMonstres(snap && snap.exists() ? snap.data() : null),
            (err) => console.error("Réglages des monstres :", err));
    } catch (e) { console.error("Réglages des monstres :", e); }
};
// Derrière la porte du joueur (porte_joueur.js, v259) : la base n'est lisible
// qu'à un compte validé.
const quandJoueur = (fn) => (window.PorteJoueur ? window.PorteJoueur.quand(fn) : fn());
quandJoueur(() => window.ecouterReglagesMonstres());

// =========================================================================
//  LE NIVEAU DU GROUPE (v263)
// =========================================================================
//  Nico : « le niveau du groupe, mis quelque part, qui se met à jour dès un
//  changement de niveau, un départ ou une arrivée dans le groupe, car il va
//  être lu par plusieurs choses — c'est le niveau du personnage le plus fort
//  du groupe ». Le groupe : les héros de la partie qui ne sont pas mis de
//  côté (ni illusion, ni créature). Recalculé à chaque recomposition des
//  combattants (une fiche reçue, un héros qui arrive ou qui part) ; lu dans
//  window.NIVEAU_GROUPE. Il règle la triche des créatures et leurs résistances.
window.NIVEAU_GROUPE = 1;
window.NIVEAU_GROUPE_HEROS = "";
window.niveauDuGroupe = function(persos) {
    const groupe = (persos || window.PERSOS_JOUEURS_PARTIE || [])
        .filter(p => p && !p.estMonstre && !p.estIllusion && p.actif !== false && p.camp !== "Ennemi");
    let niveau = 0, plusFort = null;
    groupe.forEach(p => {
        const n = typeof window.niveauDuPerso === "function" ? window.niveauDuPerso(p) : 1;
        if (n > niveau) { niveau = n; plusFort = p; }
    });
    return { niveau: Math.max(1, niveau), heros: plusFort ? (plusFort.prenom || plusFort.nom || plusFort.idPersonnage || "") : "" };
};
window.actualiserNiveauGroupe = function() {
    const { niveau, heros } = window.niveauDuGroupe();
    const change = niveau !== window.NIVEAU_GROUPE || heros !== window.NIVEAU_GROUPE_HEROS;
    window.NIVEAU_GROUPE = niveau;
    window.NIVEAU_GROUPE_HEROS = heros;
    if (change) {
        // La triche suit, tout de suite (le noyau du combat la lit).
        window.appliquerReglagesMonstres(window.REGLAGES_MONSTRES_BRUTS);
        if (typeof window.afficherNiveauGroupe === "function") window.afficherNiveauGroupe();
        try { window.dispatchEvent(new CustomEvent("niveau-groupe", { detail: { niveau, heros } })); } catch (e) {}
    }
    return niveau;
};
// Partout où il s'affiche : la fenêtre 💀, l'encart de la triche.
window.afficherNiveauGroupe = function() {
    const n = window.NIVEAU_GROUPE || 1, pct = window.tricheMonstresActuelle();
    const texte = `Niveau du groupe : ${n}${window.NIVEAU_GROUPE_HEROS ? ` (${window.NIVEAU_GROUPE_HEROS})` : ""} — créatures +${pct} % de dégâts et de soins, +${pct} PV`;
    document.querySelectorAll(".niveau-groupe-texte").forEach(el => { el.textContent = texte; });
};

// Le haut du tableau : la marche par stature, la triche selon le niveau du
// groupe, le % des sorts, le leader.
window.dessinerReglagesMonstres = function() {
    const corps = document.getElementById("tbody-reglages-monstres");
    const sorts = document.getElementById("reglage-bonus-sorts");
    const r = window.REGLAGES_MONSTRES;
    if (!corps || !r) return;
    // Pas pendant qu'on tape : la valeur reviendrait sous les doigts.
    const actif = document.activeElement;
    if (actif && actif.closest && actif.closest("#reglages-monstres")) return;
    const ligne = (titre, famille, aide) => `<tr><td class="reglage-monstres-titre" title="${aide}">${titre}</td>`
        + PALIERS_REGLES.map(p => `<td><input type="number" inputmode="numeric" class="reglage-monstres-valeur"
              data-famille="${famille}" data-palier="${p}" value="${r[famille][p]}"
              min="${BORNES_REGLAGES[famille][0]}" max="${BORNES_REGLAGES[famille][1]}"
              onchange="window.modifierReglageMonstre('${famille}', '${p}', this)"></td>`).join("") + `</tr>`;
    corps.innerHTML = ligne("Déplacement (cases)", "deplacement", "Cases que la créature peut marcher à son tour");
    if (sorts) sorts.value = r.bonusSortsPct;
    const triche = document.getElementById("corps-triche-niveau");
    if (triche) {
        const champ = (cle) => { const c = CHAMPS_TRICHE.find(x => x.cle === cle);
            return `<input type="number" inputmode="numeric" class="reglage-monstres-valeur" data-famille="triche" data-cle="${cle}"
                value="${r.tricheNiveau[cle]}" min="${BORNES_REGLAGES[c.borne][0]}" max="${BORNES_REGLAGES[c.borne][1]}"
                onchange="window.modifierReglageMonstre('triche', '${cle}', this)">`; };
        const niveaux = Array.from({ length: 10 }, (_, i) => i + 1);
        triche.innerHTML = `<div class="triche-formules">
              <label>Niveaux 1 à 4 : ${champ("base14")} + ${champ("parNiveau14")} × niveau</label>
              <label>Niveaux 5 et plus : ${champ("base510")} + ${champ("parNiveau510")} × niveau</label>
            </div>
            <table class="table-reglages-monstres table-triche-niveau">
              <thead><tr><th>Niveau</th>${niveaux.map(n => `<th class="${n === window.NIVEAU_GROUPE ? "niveau-actuel" : ""}">${n}</th>`).join("")}</tr></thead>
              <tbody><tr><td class="reglage-monstres-titre">% et PV en plus</td>${niveaux.map(n => `<td class="${n === window.NIVEAU_GROUPE ? "niveau-actuel" : ""}">${window.tricheDuNiveau(n, r.tricheNiveau)}</td>`).join("")}</tr></tbody>
            </table>`;
    }
    if (typeof window.afficherNiveauGroupe === "function") window.afficherNiveauGroupe();
    const leader = document.getElementById("corps-reglages-leader");
    if (leader) leader.innerHTML = CHAMPS_LEADER.map(c => `<label class="reglage-leader" title="${c.aide}">
          <span class="reglage-leader-titre">${c.titre}</span>
          <span class="reglage-leader-saisie"><span class="reglage-leader-plus">+</span><input type="number" inputmode="numeric" class="reglage-monstres-valeur"
              data-famille="leader" data-cle="${c.cle}" value="${r.leader[c.cle]}"
              min="${BORNES_REGLAGES[c.borne][0]}" max="${BORNES_REGLAGES[c.borne][1]}"
              onchange="window.modifierReglageMonstre('leader', '${c.cle}', this)"><span class="reglage-leader-unite">${c.unite}</span></span>
        </label>`).join("");
};

// `palier` : la stature réglée — ou, pour le leader, lequel de ses chiffres.
window.modifierReglageMonstre = async function(famille, palier, input) {
    const actuels = window.REGLAGES_MONSTRES || window.normaliserReglagesMonstres(null);
    const champLeader = famille === "leader" ? CHAMPS_LEADER.find(c => c.cle === palier) : null;
    const champTriche = famille === "triche" ? CHAMPS_TRICHE.find(c => c.cle === palier) : null;
    if ((famille === "leader" && !champLeader) || (famille === "triche" && !champTriche)) return;
    const valeur = famille === "bonusSortsPct"
        ? borner(famille, input && input.value, actuels.bonusSortsPct)
        : champLeader ? borner(champLeader.borne, input && input.value, actuels.leader[palier])
        : champTriche ? borner(champTriche.borne, input && input.value, actuels.tricheNiveau[palier])
        : borner(famille, input && input.value, actuels[famille][palier]);
    if (input) input.value = valeur;
    const etat = document.getElementById("reglages-monstres-etat");
    const maj = famille === "bonusSortsPct" ? { Bonus_Sorts_Pct: valeur }
        : champLeader ? { Leader: leaderVersBase({ ...actuels.leader, [palier]: valeur }) }
        : champTriche ? { Triche_Niveau: tricheVersBase({ ...actuels.tricheNiveau, [palier]: valeur }) }
        : { Deplacement: { ...actuels[famille], [palier]: valeur } };
    // Tout de suite sur ce poste ; la base le porte aux autres.
    const brut = {
        Bonus_Sorts_Pct: actuels.bonusSortsPct, Deplacement: actuels.deplacement,
        Leader: leaderVersBase(actuels.leader), Triche_Niveau: tricheVersBase(actuels.tricheNiveau), ...maj
    };
    window.appliquerReglagesMonstres(brut);
    try {
        await setDoc(doc(db, COLLECTION_GABARITS, DOC_REGLAGES), maj, { merge: true });
        if (etat) { etat.textContent = "✔️ Enregistré — en jeu tout de suite"; setTimeout(() => { etat.textContent = ""; }, 1800); }
    } catch (e) {
        console.error("Enregistrement des réglages des monstres :", e);
        if (etat) etat.textContent = "⚠️ Non enregistré (connexion ?)";
    }
};

// =========================================================================
//  4. L'OUTIL D'ÉQUILIBRAGE (menu Paramètres > Outils > Monstres)
// =========================================================================

// Ce que l'utilisateur a modifié mais pas encore enregistré : { cle: { champ: valeur } }
let modificationsEnAttente = {};

// La hauteur de l'en-tête collé en haut de la fenêtre (v266) : l'en-tête du
// tableau se colle juste dessous en défilant (style.css, --entete-monstres).
window.calerEnteteMonstres = function() {
    const fen = document.getElementById("etape-gestion-monstres");
    const entete = fen && fen.querySelector(".entete-gestion-monstres");
    if (entete && entete.offsetHeight > 0) fen.style.setProperty("--entete-monstres", entete.offsetHeight + "px");
};
// (Gardé : les bancs du noyau chargent ce module dans Node, sans vrai window.)
if (typeof window.addEventListener === "function") window.addEventListener("resize", () => window.calerEnteteMonstres());

window.ouvrirGestionMonstres = async function() {
    const menuLat = document.getElementById("menu-lateral");
    if (menuLat) menuLat.style.display = "none";

    window.naviguerFenetre("etape-menu-outils", "etape-gestion-monstres");
    // Elle s'affiche au bout du fondu (naviguerFenetre) : on mesure alors.
    setTimeout(() => window.calerEnteteMonstres(), 500);

    const chargement = document.getElementById("chargement-monstres");
    const conteneur = document.getElementById("conteneur-table-monstres");
    if (chargement) chargement.style.display = "block";
    if (conteneur) conteneur.style.display = "none";

    modificationsEnAttente = {};

    window.dessinerReglagesMonstres();
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
//  5. LES APPARITIONS (bouton 💀 des options de combat) — v262
// =========================================================================
//  Nico : « Il n'y a plus de difficulté de rencontre. À la place, demande
//  Apparition 1, 2, 3, 4 ou aléatoire parmi celles-là » — le nombre d'ennemis
//  engagés dans le combat dans le récit (Apparition 4 : quatre ou plus).
//  Chaque apparition dit ce qui entre au départ, qui mène, quels renforts
//  suivent et quand. Les créatures sont des Petits et des Normaux ; un leader
//  peut être l'un ou l'autre (jamais un Boss).
//
//  Les règles d'archetype (« règles complémentaires ») :
//    · Apparition 1 : la première créature est un tank, un combattant (DPS CAC)
//      ou un mage au contact (DPS MAGE CAC) ; ses renforts au hasard, un
//      soutien au plus — les quatre Petits du cas 1 en comptent exactement un.
//    · Apparition 2 : au départ un tank et une créature au hasard, mais pas un
//      soutien ; les renforts au hasard, un soutien au plus.
//    · Apparition 3 : au hasard, un soutien au plus au départ, un au plus dans
//      le renfort.
//    · Apparition 4 : au hasard, un soutien au plus.
//
//  Les renforts entrent au début de la manche prévue (« au bout de 1 tour » :
//  la manche 2), sur les cases d'apparition (caseApparitionEnnemi, combat.js).
//  Si plus aucune créature ne tient debout avant, ils n'attendent pas : ils
//  entrent dès la manche suivante (apparitionsDuTour, pont_combat.js). Le
//  butin tire ses raretés sur la ligne « Normale » (loot.js).
// =========================================================================

const ARCHETYPE_TANK = "TANK CAC";
const ARCHETYPE_SOUTIEN = "SOUTIEN";
const ARCHETYPES_PREMIER_AU_CONTACT = ["TANK CAC", "DPS CAC", "DPS MAGE CAC"];
const RENFORT_TROIS = [{ Normal: 1, Petit: 2 }, { Petit: 3 }, { Normal: 2, Petit: 1 }];

// Une vague : ses possibilités (tirées à chances égales) et sa règle
// d'archetype — "premierAuContact", "tankSansSoutien", "unSoutien" ou
// "auPlusUnSoutien".
window.APPARITIONS = Object.freeze({
    1: { titre: "Apparition 1", cas: [
        { chance: 40, nom: "Le chef et sa meute", leader: "depart",
          depart: { possibilites: [{ Normal: 1 }], regle: "premierAuContact" },
          renforts: [{ apresTours: 1, possibilites: [{ Petit: 4 }], regle: "unSoutien" }] },
        { chance: 60, nom: "Celui qui se relève", releveEnLeader: true,
          depart: { possibilites: [{ Normal: 1 }], regle: "premierAuContact" },
          renforts: [{ surReleve: true, possibilites: RENFORT_TROIS, regle: "auPlusUnSoutien" }] }
    ] },
    2: { titre: "Apparition 2", cas: [
        { chance: 100, leader: "tous",
          depart: { possibilites: [{ Normal: 2 }, { Normal: 1, Petit: 1 }], regle: "tankSansSoutien" },
          renforts: [{ apresTours: 2, possibilites: RENFORT_TROIS, regle: "auPlusUnSoutien" }] }
    ] },
    3: { titre: "Apparition 3", cas: [
        { chance: 100, leader: "depart",
          depart: { possibilites: [{ Normal: 3 }, { Normal: 1, Petit: 2 }, { Normal: 2, Petit: 1 }, { Petit: 4 }], regle: "auPlusUnSoutien" },
          renforts: [{ apresTours: 4, possibilites: [{ Normal: 1, Petit: 1 }, { Petit: 3 }, { Normal: 2 }], regle: "auPlusUnSoutien" }] }
    ] },
    4: { titre: "Apparition 4", cas: [
        { chance: 100, leader: "depart",
          depart: { possibilites: [{ Normal: 4 }, { Normal: 3, Petit: 1 }, { Normal: 2, Petit: 2 }, { Petit: 5 }], regle: "auPlusUnSoutien" },
          renforts: [] }
    ] }
});
const NUMEROS_APPARITION = [1, 2, 3, 4];

// Le terrain accueille autant d'ennemis qu'il y a de joueurs, plus un. Les illusions
// sont des leurres posés par les héros, pas des joueurs : les compter ferait grossir
// la rencontre à chaque sort d'illusion. Un héros mis de côté (Actif: false) n'est
// pas non plus un joueur présent au combat — même filtre que recomposerCombattants,
// sinon un groupe réduit en cours de partie continue de faire face à une rencontre
// taillée pour l'effectif d'avant. Plancher à 2 tant que la liste des personnages
// n'est pas encore chargée (sinon une rencontre se réduirait à 1 ennemi).
function limiteMonstresTerrain() {
    const joueurs = (window.PERSOS_JOUEURS_PARTIE || [])
        .filter(p => !p.estIllusion && p.camp !== "Ennemi" && p.actif !== false);
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

// Ceux d'une liste qui ont un gabarit à cette stature — la liste entière si
// le bestiaire n'est pas encore lu (la pose le relira).
function parmiLesGabarits(liste, palier) {
    const dispo = liste.filter(a => window.gabaritMonstre(a, palier));
    return dispo.length > 0 ? dispo : liste;
}

// Les créatures d'une vague : ses statures (les Normaux d'abord), puis leurs
// archetypes selon sa règle. Le tank ou le soutien imposé prend une place au
// hasard dans la vague.
function tirerVague(vague) {
    const repartition = hasard(vague.possibilites);
    const paliers = [];
    for (let i = 0; i < (repartition.Normal || 0); i++) paliers.push("Normal");
    for (let i = 0; i < (repartition.Petit || 0); i++) paliers.push("Petit");
    if (paliers.length === 0) return [];
    const tous = Object.keys(AMBIANCE_ARCHETYPES);
    const sansSoutien = tous.filter(a => a !== ARCHETYPE_SOUTIEN);
    const archetypes = new Array(paliers.length).fill(null);
    const place = Math.floor(Math.random() * paliers.length);
    if (vague.regle === "premierAuContact") archetypes[0] = hasard(parmiLesGabarits(ARCHETYPES_PREMIER_AU_CONTACT, paliers[0]));
    else if (vague.regle === "tankSansSoutien") archetypes[place] = ARCHETYPE_TANK;
    else if (vague.regle === "unSoutien") archetypes[place] = ARCHETYPE_SOUTIEN;
    // Le reste : sans soutien quand la règle en impose un (ou n'en veut pas),
    // sinon au hasard jusqu'au premier soutien tiré.
    const jamaisSoutien = vague.regle === "tankSansSoutien" || vague.regle === "unSoutien";
    let soutienPris = archetypes.includes(ARCHETYPE_SOUTIEN);
    paliers.forEach((palier, i) => {
        if (archetypes[i]) return;
        archetypes[i] = hasard(parmiLesGabarits(jamaisSoutien || soutienPris ? sansSoutien : tous, palier));
        if (archetypes[i] === ARCHETYPE_SOUTIEN) soutienPris = true;
    });
    return paliers.map((palier, i) => ({ archetype: archetypes[i], palier }));
}

// Tire une apparition : `choix` vaut 1, 2, 3 ou 4 — n'importe quoi d'autre
// (« aleatoire ») en tire une des quatre. Rend ce qui entre au départ, et les
// renforts avec leur heure d'entrée (`entreeManche`) ou leur déclencheur
// (`surReleve` : la relève en leader de l'Apparition 1).
// UN LEADER DANS 60 % DES COMBATS (v267, Nico : « pour les apparitions de
// leaders, fais en sorte qu'il y ait 60 % de chance qu'il y ait un leader dans
// le combat »). Un jet par rencontre : raté, personne ne mène — et la créature
// qui se relève en leader (Apparition 1, cas 2) n'est plus tirée, puisque
// c'est un leader elle aussi : l'Apparition 1 devient alors « le chef et sa
// meute », sans leader.
window.CHANCE_LEADER_COMBAT = 60;
window.tirerApparition = function(choix) {
    const choisie = NUMEROS_APPARITION.includes(Number(choix));
    const numero = choisie ? Number(choix) : hasard(NUMEROS_APPARITION);
    const def = window.APPARITIONS[numero];
    const avecLeader = Math.random() * 100 < window.CHANCE_LEADER_COMBAT;
    const casPossibles = def.cas.map((c, i) => ({ c, i })).filter(({ c }) => avecLeader || !c.releveEnLeader);
    const tirables = casPossibles.length > 0 ? casPossibles : def.cas.map((c, i) => ({ c, i }));
    let jet = Math.random() * tirables.reduce((t, x) => t + x.c.chance, 0);
    let indexCas = tirables[tirables.length - 1].i;
    for (const x of tirables) {
        if (jet < x.c.chance) { indexCas = x.i; break; }
        jet -= x.c.chance;
    }
    const cas = def.cas[indexCas];
    const depart = tirerVague(cas.depart);
    const renforts = [];
    cas.renforts.forEach(vague => tirerVague(vague).forEach(m => renforts.push(
        { ...m, ...(vague.surReleve ? { surReleve: true } : { entreeManche: 1 + vague.apresTours }) })));
    if (avecLeader && cas.releveEnLeader && depart[0]) depart[0].releveEnLeader = true;
    const candidats = !avecLeader ? [] : cas.leader === "tous" ? [...depart, ...renforts] : cas.leader === "depart" ? depart : [];
    if (candidats.length > 0) hasard(candidats).leader = true;
    return { apparition: numero, aleatoire: !choisie, cas: indexCas + 1, nomCas: cas.nom || "", depart, renforts, avecLeader };
};

// -------------------------------------------------------------------------
//  LA FENÊTRE DES APPARITIONS (Paramètres > Outils > Apparitions)
// -------------------------------------------------------------------------
//  Elle tenait la table des rencontres par difficulté (v253), qui n'a plus
//  lieu d'être : elle montre maintenant ce que chaque apparition fait entrer,
//  lu dans APPARITIONS — la même table que celle du tirage.
const PLURIELS_PALIER = { Normal: "Normaux", Petit: "Petits" };
const texteRepartition = (r) => ["Normal", "Petit"].filter(p => r[p] > 0)
    .map(p => `${r[p]} ${r[p] > 1 ? PLURIELS_PALIER[p] : p}`).join(" + ");
const TEXTES_REGLE = {
    premierAuContact: "un tank, un combattant ou un mage au contact",
    tankSansSoutien: "un tank et une créature au hasard, pas un soutien",
    unSoutien: "un soutien, les autres au hasard",
    auPlusUnSoutien: "au hasard, un soutien au plus"
};
window.ouvrirTableRencontres = function() {
    const menuLat = document.getElementById("menu-lateral");
    if (menuLat) menuLat.style.display = "none";
    window.naviguerFenetre("etape-menu-outils", "etape-rencontres-monstres");
    window.dessinerTableRencontres();
};
window.fermerTableRencontres = function() {
    const menuLat = document.getElementById("menu-lateral");
    if (menuLat) menuLat.style.display = "flex";
    window.naviguerFenetre("etape-rencontres-monstres", "etape-menu-outils");
};
window.dessinerTableRencontres = function() {
    const hote = document.getElementById("corps-rencontres-monstres");
    if (!hote) return;
    const vague = (v) => `${v.possibilites.map(texteRepartition).join(" <em>ou</em> ")} <span class="apparition-regle">(${TEXTES_REGLE[v.regle] || ""})</span>`;
    hote.innerHTML = `<div class="apparition-note-leader">👑 Un leader dans <b>${window.CHANCE_LEADER_COMBAT} %</b> des combats : sinon, personne ne mène (et l'Apparition 1 est toujours « le chef et sa meute »).</div>`
        + NUMEROS_APPARITION.map(n => {
        const def = window.APPARITIONS[n];
        const lesCas = def.cas.map(cas => {
            const leader = cas.releveEnLeader ? "Mise KO, elle se relève en <b>leader</b>, ses PV et son énergie au plein."
                : cas.leader === "tous" ? "Un <b>leader</b> parmi toutes, renforts compris."
                : cas.leader === "depart" ? (cas.depart.possibilites.every(r => texteRepartition(r) === "1 Normal")
                    ? "Ce Normal est le <b>leader</b>." : "Un <b>leader</b> parmi celles du départ.") : "";
            const renforts = cas.renforts.length === 0 ? "<li>Pas de renfort.</li>"
                : cas.renforts.map(v => `<li>${v.surReleve ? "À sa relève" : `Au bout de ${v.apresTours} tour${v.apresTours > 1 ? "s" : ""}`} : ${vague(v)}</li>`).join("");
            return `<div class="apparition-cas">
                ${def.cas.length > 1 ? `<div class="apparition-cas-titre">${cas.nom} — ${cas.chance} %</div>` : ""}
                <ul><li>Au départ : ${vague(cas.depart)}</li><li>${leader}</li>${renforts}</ul></div>`;
        }).join("");
        return `<div class="bloc-rencontre bloc-apparition" data-apparition="${n}">
            <div class="reglages-monstres-entete"><span class="reglages-monstres-nom">${def.titre}${n === 4 ? " et plus" : ""}</span>
              <span class="reglages-monstres-aide">${n === 4 ? "quatre ennemis ou plus" : `${n} ennemi${n > 1 ? "s" : ""}`} au départ</span></div>
            ${lesCas}</div>`;
    }).join("");
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
        `${i + 1}. ${m.archetype} (palier ${m.palier})${m.leader || m.releveEnLeader ? " — LEADER du groupe" : ""} — ${AMBIANCE_ARCHETYPES[m.archetype] || ""}`
    ).join("\n");

    const promptSysteme = `Tu es MIA_BESTIAIRE, l'IA qui baptise les créatures d'un jeu de rôle médiéval-fantastique sombre.
On te donne la composition d'un groupe d'ennemis. Tu dois trouver UN nom court et thématique par créature.

RÈGLES :
- Le nom colle au rôle indiqué (un TANK est massif : ours, golem, troll ; un DPS MAGE DISTANCE est un lanceur de sorts : mage noir, nécromancien...).
- 1 à 3 mots maximum, en français, sans numéro ni chiffre.
- Le palier donne la stature : "Petit" = créature mineure, "Normal" = combattant ordinaire, "Boss" = créature légendaire au nom marquant.
- Le LEADER du groupe porte un nom de chef (chef de meute, capitaine, grand prêtre...).
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
//  génération initiale ET à l'arrivée d'un renfort. `options.premiereArrivee` :
//  une créature du départ, qui entre autour du repère des ennemis (v263) ; un
//  renfort entre par les cases d'apparition peintes.
window.poserMonstreSurTerrain = async function(monstre, tokensData, options) {
    let gabarit = window.gabaritMonstre(monstre.archetype, monstre.palier);

    // LE BESTIAIRE N'EST PAS TOUJOURS EN MÉMOIRE, et ça a coûté tous les renforts.
    //
    // Les gabarits ne sont lus qu'à deux occasions : l'ouverture de la fenêtre
    // de gestion des monstres, et la génération d'une rencontre. Autrefois
    // c'était suffisant, parce que le poste qui générait la rencontre était
    // aussi celui qui posait les renforts.
    //
    // Depuis que le cerveau décide des chutes, c'est le poste cerveau qui
    // appelle marquerMonstreMort puis entrerRenfortMonstre — et ce poste-là
    // n'est pas forcément celui qui a lancé la rencontre. Il se retrouvait avec
    // GABARITS_MONSTRES vide, un « Gabarit introuvable » en console, et pas le
    // moindre renfort sur le terrain de toute la partie.
    //
    // On relit donc le bestiaire à la demande, une seule fois, quand la clé
    // cherchée manque. C'est une lecture de plus le jour où elle sert, et rien
    // du tout les autres jours.
    if (!gabarit) {
        try {
            await window.chargerGabaritsMonstres();
            gabarit = window.gabaritMonstre(monstre.archetype, monstre.palier);
        } catch (e) {
            console.error("Relecture du bestiaire impossible :", e);
        }
    }

    if (!gabarit) {
        console.error("Gabarit introuvable :", monstre);
        return null;
    }

    const idMonstre = "MONSTRE_" + Math.random().toString(36).substring(2, 9);

    await window.creerMonstreDepuisGabarit(idMonstre, gabarit, {
        // Le leader (v262) : ses PV et ses défenses en plus, sur sa fiche ; ses
        // dégâts, soins et chances d'état en plus, au combat (moteur_pur.js).
        ...(monstre.leader ? window.champsLeader(gabarit) : {}),
        ...(monstre.releveEnLeader && !monstre.leader ? { Releve_En_Leader: true } : {}),
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

    // Une créature du DÉPART entre autour du repère des ennemis posé à la
    // réinitialisation (v263). Un RENFORT entre sur une case d'apparition
    // peinte par le MJ (pinceau SPAWN, v261), libre, au hasard ; sans case
    // peinte, autour du repère — et à défaut de repère (ou de module de combat
    // chargé), au plus près du centre comme autrefois.
    const placer = options && options.premiereArrivee ? window.casePremiereArriveeEnnemi : window.caseApparitionEnnemi;
    const hexLibre = typeof placer === "function" ? placer(tokensData) : window.trouverHexLibreVTT(tokensData);
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
//  Le compagnon du Pisteur
// -------------------------------------------------------------------------
//  Un document Monstres DE SON CAMP (COMPAGNON_<héros>), posé à côté de son
//  maître quand les héros se déploient. Tout le reste suit le chemin des
//  créatures : le cerveau le joue (jouerCompagnon, juste après son maître), la
//  réinitialisation du combat l'efface (nettoyerMonstresCombat) — il revient
//  donc avec ses 25 PV au combat suivant. Rend son identifiant, ou null.
window.ID_COMPAGNON = (idMaitre) => "COMPAGNON_" + idMaitre;
window.donneesCompagnon = function(heros) {
    const c = (heros && heros.compagnon) || {};
    return {
        ID_Partie: window.ID_PARTIE_COURANTE || heros.idPartie || "",
        ID_Joueur: "MJ",
        Camp: heros.camp || "Allié",
        Statut: "Vivant",
        Compagnon_De: heros.idPersonnage,
        Prenom_Personnage: c.nom || "Compagnon",
        Nom_Personnage: "",
        Archetype: "Compagnon",
        Palier: "",
        PV_Max: 25, PV_Actuels: 25,
        Fatigue_Max: 100, Fatigue_Actuelle: 100,
        Esquive: 15, Parade: 0, Critique: 0,
        Def_Physique: 0, Def_Magique: 0,
        Regeneration: 0, Repos_Long: 0,
        Nombre_Actions: 1, XP_Groupe: 0,
        Couleur: heros.couleur || "#7cb342",
        Personnalite: "brutal",
        Initiative: 0, Competences_Max: 0,
        URL_Cloudinary: c.image || "",
        URL_Token: c.token || c.image || "",
        // Le nom RP de son attaque (nommerAttaqueCompagnon, app.js).
        Nom_Attaque: c.attaque || ""
    };
};
window.poserCompagnonSurTerrain = async function(heros, tokensData) {
    if (!heros || !window.ID_PARTIE_COURANTE) return null;
    const idCompagnon = window.ID_COMPAGNON(heros.idPersonnage);
    if (tokensData[idCompagnon]) return null;
    const data = window.donneesCompagnon(heros);
    window.SOURCE_COMBATTANTS[idCompagnon] = COLLECTION_MONSTRES;
    await setDoc(doc(db, COLLECTION_MONSTRES, idCompagnon), data);

    // Une case libre au contact de son maître (ou au plus près).
    const maitre = tokensData[heros.idPersonnage] || (typeof window.pointApparition === "function"
        ? window.pointApparition(heros.camp || "Allié") : null);
    const hexLibre = typeof window.trouverHexLibreAutour === "function"
        ? window.trouverHexLibreAutour(tokensData, maitre, 1)
        : window.trouverHexLibreVTT(tokensData);
    tokensData[idCompagnon] = { q: hexLibre.q, r: hexLibre.r, url: data.URL_Token, taille: 55 };

    // Un compagnon d'avant le nom RP de son attaque en reçoit un, sans
    // retarder le déploiement : la fiche de la bête est complétée ensuite.
    if (!data.Nom_Attaque && typeof window.assurerNomAttaqueCompagnon === "function") {
        window.assurerNomAttaqueCompagnon(heros)
            .then(nom => nom ? updateDoc(doc(db, COLLECTION_MONSTRES, idCompagnon), { Nom_Attaque: nom }) : null)
            .catch(e => console.error("🐾 [Compagnon] Nom d'attaque :", e));
    }

    const partieRef = doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE);
    const partieSnap = await getDoc(partieRef);
    if (partieSnap.exists()) {
        const ordre = partieSnap.data().Ordre_Initiative || [];
        if (!ordre.includes(idCompagnon)) {
            ordre.push(idCompagnon);
            await updateDoc(partieRef, { Ordre_Initiative: ordre });
        }
    }
    return idCompagnon;
};

// Ce qu'un leader posé reçoit sur sa fiche (v262) : ses PV et ses défenses
// rehaussés, d'après les réglages du moment (Paramètres > Monstres).
window.champsLeader = function(gabarit) {
    const l = (window.REGLAGES_MONSTRES || window.normaliserReglagesMonstres(null)).leader;
    // Sur la triche du niveau du groupe (v263).
    const pv = (Number(gabarit.PV) || 0) + window.tricheMonstresActuelle() + l.pv;
    return {
        Leader: true,
        PV_Max: pv, PV_Actuels: pv,
        Def_Physique: (Number(gabarit.Res_Physique) || 0) + l.resistances,
        Def_Magique: (Number(gabarit.Res_Magique) || 0) + l.resistances
    };
};

// -------------------------------------------------------------------------
//  Génération complète, déclenchée par le bouton "Valider" de la fenêtre
// -------------------------------------------------------------------------
//  `choix` : 1, 2, 3, 4 — ou « aleatoire ». Toutes les créatures du départ
//  entrent, autour du repère des ennemis (v263) ; les renforts attendent leur
//  heure dans la réserve, et entreront par les cases d'apparition peintes. Toute la rencontre est nommée d'un seul appel,
//  renforts compris : l'IA évite ainsi les doublons.
window.genererRencontreMonstres = async function(choix) {
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

    const tirage = window.tirerApparition(choix);
    if (tirage.depart.length === 0) {
        alert("Aucun gabarit de monstre disponible : ouvre Paramètres > Outils > Monstres pour les initialiser.");
        return;
    }

    const tous = [...tirage.depart, ...tirage.renforts];
    const noms = await window.nommerMonstresIA(tous);
    tous.forEach((m, i) => { m.nom = noms[i] || "Créature"; });

    const tokensData = { ...window.TOKENS_VTT_DATA };
    const poses = [];
    for (const monstre of tirage.depart) {
        const idPose = await window.poserMonstreSurTerrain(monstre, tokensData, { premiereArrivee: true });
        if (idPose) poses.push({ ...monstre, id: idPose });
    }

    // Seuls les pions posés à l'instant : renvoyer toute la carte remettrait au
    // passage les positions périmées des combattants déjà sur le plateau.
    window.TOKENS_VTT_DATA = tokensData;
    await window.enregistrerPionsVTT(...poses.map(p => p.id));
    await window.sauvegarderReserveMonstres(tirage.renforts);

    // Les techniques sont forgées EN ARRIÈRE-PLAN, sans bloquer : les pions
    // apparaissent tout de suite, et les bannières se remplissent quelques
    // secondes plus tard (les monstres ne jouent de toute façon qu'au tour de
    // l'IA de combat). Les créatures sont traitées en parallèle entre elles.
    if (typeof window.equiperCompetencesRencontre === "function") {
        window.equiperCompetencesRencontre(poses).catch(e => console.error(e));
    }

    // L'apparition et l'identifiant de la rencontre restent sur la partie.
    // L'identifiant sert au butin : il lui permet de savoir s'il appartient au
    // combat en cours ou à un combat déjà terminé (cf. demarrerButin). Plus de
    // difficulté : le butin tire ses raretés sur la ligne « Normale ».
    if (typeof window.modifierPartie === "function") {
        await window.modifierPartie(() => ({ maj: {
            Apparition_Rencontre: tirage.apparition,
            ID_Rencontre: "renc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8)
        } }));
    }

    console.log(`🐲 Apparition ${tirage.apparition}${tirage.nomCas ? ` (${tirage.nomCas})` : ""} : `
        + `${tirage.depart.length} sur le terrain, ${tirage.renforts.length} en renfort.`);
    return { surLeTerrain: tirage.depart, enReserve: tirage.renforts, apparition: tirage.apparition, cas: tirage.cas };
};

// -------------------------------------------------------------------------
//  La réserve (les renforts qui attendent leur heure)
// -------------------------------------------------------------------------
//  Depuis la v262, chaque renfort sait quand il entre : au début d'une manche
//  (`entreeManche`), ou à la relève en leader de l'Apparition 1 (`surReleve`).
//  Une réserve d'avant (ni l'un ni l'autre) entre comme autrefois, dès qu'une
//  place se libère (entrerRenfortMonstre).
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

const estRenfortPrevu = (r) => !!(r && (r.surReleve || Number(r.entreeManche) > 0));

// Fait entrer une partie de la réserve, d'un coup : leurs pions sur les cases
// d'apparition, leur place dans l'ordre d'initiative, la réserve récrite sans
// eux. Une pose ratée y laisse sa créature. Rend les identifiants posés.
async function faireEntrerRenforts(reserve, entrent, pourquoi) {
    const tokensData = { ...window.TOKENS_VTT_DATA };
    const poses = [];
    const restants = reserve.filter(r => !entrent.includes(r));
    for (const renfort of entrent) {
        const idMonstre = await window.poserMonstreSurTerrain(renfort, tokensData);
        if (idMonstre) poses.push({ ...renfort, id: idMonstre });
        else { console.error("Renfort impossible à poser, il reste en réserve :", renfort); restants.push(renfort); }
    }
    if (poses.length === 0) return [];
    window.TOKENS_VTT_DATA = tokensData;
    await window.enregistrerPionsVTT(...poses.map(p => p.id));
    await window.sauvegarderReserveMonstres(restants);
    // Leurs techniques, forgées en arrière-plan comme celles du départ.
    if (typeof window.equiperCompetencesRencontre === "function") {
        window.equiperCompetencesRencontre(poses).catch(e => console.error(e));
    }
    console.log(`🐲 Renfort (${pourquoi}) : ${poses.map(p => p.nom).join(", ")} entre${poses.length > 1 ? "nt" : ""} en jeu.`);
    return poses.map(p => p.id);
}

// LES RENFORTS DE L'APPARITION, À LEUR MANCHE (v262). Appelé par le poste qui
// tient le cerveau quand une manche commence (apparitionsDuTour, pont_combat.js) :
// tous ceux dont l'heure est venue entrent. `options.terrainVide` : plus une
// créature ennemie debout dans l'état du combat — la vague suivante n'attend
// alors pas son heure (les fiches confirment : une créature posée mais pas
// encore entrée dans le combat compte comme debout).
window.entrerRenfortsPrevus = async function(manche, options) {
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT) return [];
    const reserve = await window.lireReserveMonstres();
    const prevus = reserve.filter(r => r && !r.surReleve && Number(r.entreeManche) > 0);
    if (prevus.length === 0) return [];
    let entrent = prevus.filter(r => Number(r.entreeManche) <= Number(manche));
    const vide = !!(options && options.terrainVide)
        && !(typeof window.ennemisEncoreDebout === "function" && window.ennemisEncoreDebout());
    if (entrent.length === 0 && vide) {
        const prochaine = Math.min(...prevus.map(r => Number(r.entreeManche)));
        entrent = prevus.filter(r => Number(r.entreeManche) === prochaine);
    }
    if (entrent.length === 0) return [];
    return faireEntrerRenforts(reserve, entrent, entrent.some(r => Number(r.entreeManche) <= Number(manche))
        ? `manche ${manche}` : "le terrain s'est vidé");
};

// LES RENFORTS DE LA RELÈVE (Apparition 1, cas 2) : la créature vient de se
// relever en leader, ceux qu'elle appelle entrent.
window.entrerRenfortsDeReleve = async function() {
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT) return [];
    const reserve = await window.lireReserveMonstres();
    const entrent = reserve.filter(r => r && r.surReleve);
    if (entrent.length === 0) return [];
    return faireEntrerRenforts(reserve, entrent, "relève du leader");
};

// La relève inscrite dans le document de la créature : elle est leader pour de
// bon (son aura, sa fiche), sa jauge et ses défenses sont les nouvelles.
window.enregistrerReleveLeader = async function(idMonstre, c) {
    if (!idMonstre || !window.estMonstre(idMonstre)) return;
    const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
    // Les valeurs du cerveau, telles quelles : une créature n'a pas de retouche DEV.
    const maj = {
        Leader: true, Releve_En_Leader: false,
        ...(c && n(c.pvMax) > 0 ? { PV_Max: n(c.pvMax) } : {}),
        ...(c && c.def ? { Def_Physique: n(c.def.physique), Def_Magique: n(c.def.magique) } : {}),
        ...(c && c.atouts && Array.isArray(c.atouts.resistances) ? { Resistances_Etats: [...c.atouts.resistances] } : {})
    };
    await updateDoc(doc(db, COLLECTION_MONSTRES, idMonstre), maj)
        .catch(e => console.error("Relève du leader :", e));
};

// Appelé quand un monstre vient de mourir : si une place est libre et qu'il
// reste un renfort d'avant la v262 (sans heure), il entre en jeu.
window.entrerRenfortMonstre = async function() {
    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT) return null;

    const reserve = await window.lireReserveMonstres();
    if (reserve.length === 0) return null;

    // COMBIEN DE CRÉATURES TIENNENT ENCORE DEBOUT ? La question paraît simple,
    // et elle a pourtant failli rendre la réserve inutilisable.
    //
    // On comptait sur `MONSTRES_PARTIE`, qui vient tout droit des documents
    // Monstres. Or ces documents ne reçoivent plus une seule écriture de points
    // de vie depuis que le combat vit dans l'état du cerveau : tous les
    // monstres y sont éternellement au maximum, donc tous vivants, donc le
    // terrain paraissait toujours plein et aucun renfort n'entrait jamais.
    //
    // `estCombattantMort` lit PERSOS_PARTIE, où les chiffres du cerveau sont
    // reversés (fusionnerFichesCombat) : c'est la seule réponse du jeu à la
    // question « celui-là est-il à terre ? », et c'est celle qu'on prend.
    const aTerre = typeof window.estCombattantMort === "function"
        ? (m) => window.estCombattantMort(m.idPersonnage)
        : (m) => m.statut === "Mort" || (parseInt(m.PV_Actuels) || 0) <= 0;
    // Un zombie du Profanateur ne compte plus : il se bat pour les héros.
    // Le compagnon du Pisteur non plus.
    const vivants = (window.MONSTRES_PARTIE || []).filter(m => !aTerre(m) && !m.zombie && !m.compagnonDe).length;
    if (vivants >= limiteMonstresTerrain()) return null;

    // Seul un renfort d'avant la v262 attend une place libre : les autres ont
    // leur heure (entrerRenfortsPrevus, entrerRenfortsDeReleve).
    const index = reserve.findIndex(r => r && !estRenfortPrevu(r));
    if (index < 0) return null;
    const [renfort] = reserve.splice(index, 1);
    const tokensData = { ...window.TOKENS_VTT_DATA };
    const idMonstre = await window.poserMonstreSurTerrain(renfort, tokensData);

    // UNE POSE RATÉE NE DOIT PAS DÉVORER LA RÉSERVE. On retirait la créature de
    // la liste AVANT de savoir si elle arrivait vraiment à entrer : quand la
    // pose échouait, le renfort disparaissait de la réserve sans jamais toucher
    // le terrain, définitivement perdu — et la console annonçait quand même son
    // arrivée. On la remet à sa place et on laisse le prochain décès réessayer.
    if (!idMonstre) {
        console.error("Renfort impossible à poser, il reste en réserve :", renfort);
        return null;
    }

    window.TOKENS_VTT_DATA = tokensData;
    await window.enregistrerPionsVTT(idMonstre);
    await window.sauvegarderReserveMonstres(reserve);

    // Un renfort arrive en cours de combat : il lui faut ses techniques, elles
    // aussi forgées en arrière-plan pour ne pas figer l'écran en plein tour.
    if (typeof window.equiperCompetencesMonstre === "function") {
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
// `options.sansRenfort` : le renfort est géré à part — il attend la fin du
// tour (regime_cerveau.js, renfortsDuTour).
window.marquerMonstreMort = async function(idMonstre, options) {
    if (!window.estMonstre(idMonstre)) return;
    await updateDoc(doc(db, COLLECTION_MONSTRES, idMonstre), { Statut: "Mort" })
        .catch(e => console.error("Marquage de la mort :", e));
    if (!(options && options.sansRenfort)) await window.entrerRenfortMonstre();
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

// L'apparition choisie : 1, 2, 3, 4 ou « aleatoire » (v262 — plus de difficulté).
window.APPARITION_RENCONTRE_CHOISIE = "aleatoire";

window.ouvrirGenerationRencontre = function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    if (!window.ID_PARTIE_COURANTE || !window.PLATEAU_VTT) {
        alert("Ouvre d'abord un combat : les monstres ont besoin d'un plateau pour apparaître.");
        return;
    }

    const voile = document.getElementById("etape-generation-rencontre");
    if (!voile) return;

    window.choisirApparitionRencontre("aleatoire");
    window.actualiserNiveauGroupe();
    window.afficherNiveauGroupe();

    const btn = document.getElementById("btn-valider-rencontre");
    if (btn) { btn.disabled = false; btn.innerText = "Valider"; }

    voile.style.display = "flex";
};

window.fermerGenerationRencontre = function() {
    const voile = document.getElementById("etape-generation-rencontre");
    if (voile) voile.style.display = "none";
};

window.choisirApparitionRencontre = function(choix) {
    window.APPARITION_RENCONTRE_CHOISIE = NUMEROS_APPARITION.includes(Number(choix)) ? Number(choix) : "aleatoire";
    document.querySelectorAll(".choix-apparition-rencontre").forEach(el => {
        el.classList.toggle("actif", el.dataset.apparition === String(window.APPARITION_RENCONTRE_CHOISIE));
    });
};

window.validerGenerationRencontre = async function() {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();

    const btn = document.getElementById("btn-valider-rencontre");
    if (btn) { btn.disabled = true; btn.innerText = "Invocation..."; }

    try {
        await window.genererRencontreMonstres(window.APPARITION_RENCONTRE_CHOISIE);
        window.fermerGenerationRencontre();
    } catch (e) {
        console.error("Erreur de génération de la rencontre :", e);
        alert("La génération a échoué. Regarde la console pour le détail.");
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "Valider"; }
    }
};
