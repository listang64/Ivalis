// =========================================================================
//  IVALIS — LES CLASSES (création de personnage, après le choix de la race)
// =========================================================================
//  Pour l'instant : l'architecture et le lien avec la base. Les effets des
//  classes viendront après — chaque document a déjà la place de les recevoir.
//
//  LE PARCOURS
//    races → genre → GRILLE DES CLASSES (cartes de tarot 7:12, bordure dorée,
//    rangées de 4) → FICHE DE LA CLASSE (image de fond, grand titre, bouton de
//    validation) → fenêtre d'identité, comme avant.
//    Le bouton rond (flèche coudée), en haut à gauche : de la fiche, il ramène
//    à la grille ; de la grille, à l'écran des races.
//
//  LA BASE
//    Collection « Classes » : un document par classe (Nom, Image_Tarot,
//    Image_Fond, Ordre — et, plus tard, ses effets). Le héros garde la sienne
//    dans le champ « Classe » de sa fiche (Personnages).
//    Tant que la collection est vide (ou illisible), l'écran s'affiche avec la
//    liste écrite ici : il ne dépend jamais du réseau pour exister. Le bouton
//    « Installer les classes » des Paramètres recopie cette liste dans la base,
//    SANS écraser ce qu'on y aurait ajouté (écriture fusionnée).
//
//  LES IMAGES : object-fit: cover, JAMAIS fill. fill étire l'image — c'est ce
//  qui déformait les fonds de l'écran des races sur tablette.
// =========================================================================

import { db } from "./firebase-config.js?v=2";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const COLLECTION_CLASSES = "Classes";

// L'identifiant de document d'une classe : son nom sans accents ni espaces.
const identifiantClasse = (nom) => "CLASSE_" + String(nom || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");

const C = (ordre, nom, imageTarot, imageFond) =>
    ({ id: identifiantClasse(nom), ordre, nom, imageTarot, imageFond });

window.CLASSES_PAR_DEFAUT = [
    C(1,  "Pisteur",           "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790440203/IMG_2165_a6htgd.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790438698/Pisteur_fond_lpv2kp.png"),
    C(2,  "Assassin",          "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790440203/IMG_2162_jo6qyh.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790438697/assassin_fond_ztints.png"),
    C(3,  "Chasseur de mages", "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790440203/IMG_2161_t3uyul.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790438697/Chasseur_de_mage_fond_hnp2gf.png"),
    C(4,  "Sentinelle",        "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790440202/IMG_2160_vbqfus.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790438697/sentinelle_fond_k7utrw.png"),
    C(5,  "Ensorceleur",       "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790440202/IMG_2170_ivs67e.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790438697/Ensorceleur_fond_mwokvi.png"),
    C(6,  "Profanateur",       "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790440202/IMG_2172_m1dgfp.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790438696/Profanateur_fond_c3yyaz.png"),
    C(7,  "Géomancien",        "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790440202/IMG_2168_fmgyk1.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790438698/G%C3%A9omancien_fond_b72j1c.png"),
    C(8,  "Hoplite",           "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790440202/IMG_2159_iligqv.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790438697/Hoplite_fond_jzi0f3.png"),
    C(9,  "Oracle",            "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790440202/IMG_2169_hbb5xu.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790438698/Oracle_fond_n7togf.png"),
    C(10, "Vampire",           "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790440202/IMG_2173_yygc0q.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790438696/Vampire_fond_wapbww.png"),
    C(11, "Nécromancien",      "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790440202/IMG_2171_u2hda6.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790438696/Necromancien_fond_duglq6.png"),
    C(12, "Mage du chaos",     "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790440202/IMG_2174_myjwel.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790438697/Mage_Chaos_fond_mtfs6i.png"),
    C(13, "Médicus",           "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790440201/IMG_2166_xcmkfp.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790438697/Medicus_fond_nc0sv3.png"),
    C(14, "Élémentariste",     "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790440202/IMG_2167_efk77h.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790438696/Elementariste_fond_xhhnlj.png")
];

// =========================================================================
//  LE DESCRIPTIF D'UNE CLASSE (moitié gauche de sa fiche)
// =========================================================================
//  Une brève présentation, puis ce que la classe donne palier par palier. Les
//  RÈGLES elles-mêmes vivent dans app.js (ATOUTS_CLASSES) ; ce texte les dit
//  au joueur. Une classe sans descriptif garde sa fiche d'avant : le titre
//  seul, au milieu de la moitié gauche.
window.DESCRIPTIFS_CLASSES = {
    CLASSE_NECROMANCIEN: {
        presentation: "Maître des morts et des ombres, le Nécromancien puise sa force dans ce que "
            + "les autres redoutent. Le froid de la tombe ne l'atteint plus, et ses sorts vident "
            + "l'énergie de ses ennemis avant de s'en prendre à leur chair.",
        paliers: [
            { niveau: 1, titre: "Enfant de la tombe",
              points: ["Insensible au Gel (jamais Glacé)", "+1 compétence", "+5 PV"] },
            { niveau: 5, titre: "Sort : Ténèbres",
              points: ["2 pts · Intelligence · 3 dégâts magiques",
                       "Les dégâts frappent la fatigue de la cible au lieu de ses PV",
                       "Plus de fatigue ? Le reste frappe ses PV ×1,5"] },
            { niveau: 10, titre: "Sursis",
              points: ["À 0 PV, sa vie reste bloquée : il joue encore deux tours avant d'être mis KO",
                       "Une fois par combat, aucun soin possible"] }
        ]
    },
    CLASSE_HOPLITE: {
        presentation: "Lance au poing et bouclier levé, l'Hoplite est le mur sur lequel la troupe "
            + "s'appuie. Il ne recule pas : il encaisse, il tient la ligne, et il couvre de son "
            + "bouclier le camarade qui combat à ses côtés.",
        paliers: [
            { niveau: 1, titre: "Discipline de la phalange",
              points: ["+5 % de parade", "+5 % de résistance physique"] },
            { niveau: 5, titre: "Technique : Mur de bouclier",
              points: ["Initiative 100 · aucune fatigue",
                       "+60 % de parade sur soi jusqu'à la fin de la manche",
                       "Une fois par combat"] },
            { niveau: 10, titre: "Technique : Rempart",
              points: ["Initiative 105 · aucune fatigue · sur un allié adjacent, 3 manches",
                       "Chaque attaque qu'il reçoit est partagée : moitié pour lui, moitié pour l'Hoplite",
                       "Il faut rester côte à côte · une fois par combat"] }
        ]
    },
    CLASSE_ASSASSIN: {
        presentation: "Silencieux, patient, mortel : l'Assassin frappe là où ça ne pardonne pas. "
            + "Chaque proie qui tombe aiguise son instinct, et ses lames enduites de poison "
            + "achèvent ce que ses coups ont commencé.",
        paliers: [
            { niveau: 1, titre: "Instinct du tueur",
              points: ["Quand il met un ennemi KO : +15 % de chance de critique pendant 2 manches",
                       "Un nouveau KO relance la durée, sans cumul"] },
            { niveau: 5, titre: "Technique : Assaut mortel",
              points: ["Initiative 100 · aucune fatigue",
                       "Une zone de deux cases au contact : 10 dégâts physiques à chaque ennemi",
                       "100 % d'empoisonnement, même s'il esquive · une fois par combat"] },
            { niveau: 10, titre: "Maître des poisons",
              points: ["Ses empoisonnements mordent à chaque fin de manche, 2 manches durant",
                       "-18 % de fatigue (énergie max) et -10 % des PV max à chaque fois"] }
        ]
    },
    CLASSE_MEDICUS: {
        presentation: "Trousse en bandoulière et sang-froid à toute épreuve, le Médicus garde la troupe "
            + "debout. Il panse, il recoud, et là où les autres ne voient plus qu'un corps tombé, "
            + "il voit un compagnon à relever.",
        paliers: [
            { niveau: 1, titre: "Régénération naturelle",
              points: ["+5 % de régénération de fatigue en fin de manche", "+1 compétence à créer"] },
            { niveau: 5, titre: "Technique : Soin d'urgence",
              points: ["Initiative 70 · aucune fatigue",
                       "Soigne de 12 PV tous les alliés debout, où qu'ils soient",
                       "Une fois par combat"] },
            { niveau: 10, titre: "Technique : Prise en charge par Médicus",
              points: ["Initiative 0 · aucune fatigue",
                       "Réanime un allié KO adjacent avec 30 % de ses PV",
                       "Repousse d'une case tous les ennemis qui l'entourent · une fois par combat",
                       "Lui seul voit, très pâles, ses alliés tombés sur le plateau"] }
        ]
    },
    CLASSE_CHASSEUR_DE_MAGES: {
        presentation: "Il a appris à marcher dans les tempêtes de sorts sans y laisser sa peau. Le "
            + "Chasseur de mages traque ceux qui plient la magie, et sa lumière perce leurs "
            + "protections jusqu'à les aveugler.",
        paliers: [
            { niveau: 1, titre: "Peau de traqueur",
              points: ["+10 % de résistance magique"] },
            { niveau: 5, titre: "Effet de combat : Lumière",
              points: ["Dans la Forge, sur un sort à dégâts magiques · 1 pt, Intelligence",
                       "15 % de chance par cran d'ignorer la résistance magique de la cible (max 60 %)"] },
            { niveau: 10, titre: "Éclat aveuglant",
              points: ["Ses sorts de lumière ont 30 % de chance d'aveugler la cible",
                       "… et tous les ennemis qui lui sont adjacents"] }
        ]
    }
};

window.rendreDescriptifClasse = function(idClasse) {
    const d = window.DESCRIPTIFS_CLASSES[idClasse];
    if (!d) return "";
    const paliers = (d.paliers || []).map(p => `
        <li class="palier-classe">
            <span class="palier-classe-niveau">Niv. ${p.niveau}</span>
            <div class="palier-classe-corps">
                <strong class="palier-classe-titre">${echapper(p.titre)}</strong>
                <ul class="palier-classe-points">${(p.points || []).map(t => `<li>${echapper(t)}</li>`).join("")}</ul>
            </div>
        </li>`).join("");
    return `<p class="descriptif-classe-presentation">${echapper(d.presentation)}</p>
            <ul class="paliers-classe">${paliers}</ul>`;
};

// Cloudinary : « q_auto,f_auto » juste après « /upload/ » — qualité et format
// choisis selon l'appareil (webp/avif), des images bien plus légères. Un lien
// venu de la base sans ce réglage le reçoit ici ; un lien qui l'a déjà (ou qui
// porte d'autres transformations) ne bouge pas.
window.optimiserImageClasse = (url) => {
    const u = String(url || "");
    if (!/res\.cloudinary\.com\/[^/]+\/image\/upload\//.test(u)) return u;
    return u.replace(/\/image\/upload\/(?!q_auto|f_auto)(v\d+\/)/, "/image/upload/q_auto,f_auto/$1");
};

// Document de la base → classe du jeu. Un champ absent retombe sur la liste
// écrite ici : une classe à moitié remplie en base s'affiche quand même.
window.classeDepuisDocument = function(id, d) {
    const connue = window.CLASSES_PAR_DEFAUT.find(c => c.id === id) || {};
    return {
        id,
        ordre: Number(d && d.Ordre) || connue.ordre || 99,
        nom: (d && d.Nom) || connue.nom || id,
        imageTarot: window.optimiserImageClasse((d && d.Image_Tarot) || connue.imageTarot || ""),
        imageFond: window.optimiserImageClasse((d && d.Image_Fond) || connue.imageFond || "")
    };
};
window.documentDepuisClasse = (c) => ({ Nom: c.nom, Image_Tarot: c.imageTarot, Image_Fond: c.imageFond, Ordre: c.ordre });

// Les classes du jeu : la base si elle en a, sinon la liste d'ici.
window.CLASSES_CACHE = null;
window.chargerClasses = async function() {
    if (window.CLASSES_CACHE) return window.CLASSES_CACHE;
    let classes = [];
    try {
        const snap = await getDocs(collection(db, COLLECTION_CLASSES));
        snap.forEach(d => classes.push(window.classeDepuisDocument(d.id, d.data())));
    } catch (e) {
        console.error("Lecture des classes (on garde la liste du jeu) :", e);
    }
    if (classes.length === 0) classes = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    classes.sort((a, b) => a.ordre - b.ordre);
    window.CLASSES_CACHE = classes;
    return classes;
};

// =========================================================================
//  L'ÉCRAN
// =========================================================================
window.CLASSE_SELECTIONNEE_TEMP = null;
let classeOuverte = null;

const echapper = (t) => String(t || "").replace(/[&<>"']/g, ch =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

window.ouvrirChoixClasse = async function() {
    const ecran = document.getElementById("ecran-choix-classe");
    if (!ecran) return;
    ecran.style.display = "block";
    window.afficherGrilleClasses();
    const classes = await window.chargerClasses();
    window.rendreGrilleClasses(classes);
};

window.fermerChoixClasse = function() {
    const ecran = document.getElementById("ecran-choix-classe");
    if (ecran) ecran.style.display = "none";
};

window.rendreGrilleClasses = function(classes) {
    const grille = document.getElementById("grille-classes");
    if (!grille) return;
    grille.innerHTML = (classes || []).map(c => `
        <button type="button" class="carte-classe" data-classe="${echapper(c.id)}"
                onclick="jouerSonClic(); window.ouvrirFicheClasse('${echapper(c.id)}')" title="${echapper(c.nom)}">
            <img class="carte-classe-image" src="${echapper(c.imageTarot)}" alt="${echapper(c.nom)}" loading="lazy">
            <span class="carte-classe-nom">${echapper(c.nom)}</span>
        </button>`).join("");
};

window.afficherGrilleClasses = function() {
    classeOuverte = null;
    const grille = document.getElementById("vue-grille-classes");
    const fiche = document.getElementById("vue-fiche-classe");
    if (grille) grille.style.display = "flex";
    if (fiche) fiche.style.display = "none";
};

window.ouvrirFicheClasse = function(id) {
    const c = (window.CLASSES_CACHE || window.CLASSES_PAR_DEFAUT).find(x => x.id === id);
    if (!c) return;
    classeOuverte = c;
    const fond = document.getElementById("fond-fiche-classe");
    const titre = document.getElementById("titre-fiche-classe");
    if (fond) { fond.src = c.imageFond || c.imageTarot || ""; fond.alt = c.nom; }
    if (titre) titre.innerText = c.nom;
    const descriptif = document.getElementById("descriptif-fiche-classe");
    const html = window.rendreDescriptifClasse(c.id);
    if (descriptif) {
        descriptif.innerHTML = html;
        descriptif.style.display = html ? "block" : "none";
        descriptif.scrollTop = 0;
    }
    const vue = document.getElementById("vue-fiche-classe");
    vue.classList.toggle("avec-descriptif", !!html);
    document.getElementById("vue-grille-classes").style.display = "none";
    vue.style.display = "block";
};

// La flèche coudée : de la fiche à la grille, de la grille aux races.
window.retourChoixClasse = function() {
    if (classeOuverte) { window.afficherGrilleClasses(); return; }
    window.fermerChoixClasse();
    const races = document.getElementById("ecran-selection-race");
    if (races) races.style.display = "block";
};

window.validerClasse = function() {
    if (!classeOuverte) return;
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    window.CLASSE_SELECTIONNEE_TEMP = classeOuverte.nom;
    const champ = document.getElementById("champ-classe");
    if (champ) champ.value = classeOuverte.nom;
    window.fermerChoixClasse();
    classeOuverte = null;
    if (typeof window.ouvrirEtapeIdentite === "function") window.ouvrirEtapeIdentite();
};
