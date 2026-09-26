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
import { collection, getDocs, doc, setDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const COLLECTION_CLASSES = "Classes";

// L'identifiant de document d'une classe : son nom sans accents ni espaces.
const identifiantClasse = (nom) => "CLASSE_" + String(nom || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");

const C = (ordre, nom, imageTarot, imageFond) =>
    ({ id: identifiantClasse(nom), ordre, nom, imageTarot, imageFond });

window.CLASSES_PAR_DEFAUT = [
    C(1,  "Pisteur",           "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790440203/IMG_2165_a6htgd.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790438698/Pisteur_fond_lpv2kp.png"),
    C(2,  "Assassin",          "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790440203/IMG_2162_jo6qyh.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790438697/assassin_fond_ztints.png"),
    C(3,  "Chasseur de mages", "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790440203/IMG_2161_t3uyul.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790438697/Chasseur_de_mage_fond_hnp2gf.png"),
    C(4,  "Sentinelle",        "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790440202/IMG_2160_vbqfus.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790438697/sentinelle_fond_k7utrw.png"),
    C(5,  "Ensorceleur",       "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790440202/IMG_2170_ivs67e.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790438697/Ensorceleur_fond_mwokvi.png"),
    C(6,  "Profanateur",       "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790440202/IMG_2172_m1dgfp.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790438696/Profanateur_fond_c3yyaz.png"),
    C(7,  "Géomancien",        "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790440202/IMG_2168_fmgyk1.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790438698/G%C3%A9omancien_fond_b72j1c.png"),
    C(8,  "Hoplite",           "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790440202/IMG_2159_iligqv.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790438697/Hoplite_fond_jzi0f3.png"),
    C(9,  "Oracle",            "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790440202/IMG_2169_hbb5xu.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790438698/Oracle_fond_n7togf.png"),
    C(10, "Vampire",           "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790440202/IMG_2173_yygc0q.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790438696/Vampire_fond_wapbww.png"),
    C(11, "Nécromancien",      "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790440202/IMG_2171_u2hda6.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790438696/Necromancien_fond_duglq6.png"),
    C(12, "Mage du chaos",     "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790440202/IMG_2174_myjwel.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790438697/Mage_Chaos_fond_mtfs6i.png"),
    C(13, "Médicus",           "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790440201/IMG_2166_xcmkfp.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790438697/Medicus_fond_nc0sv3.png"),
    C(14, "Élémentariste",     "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790440202/IMG_2167_efk77h.jpg",
                               "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790438696/Elementariste_fond_xhhnlj.png")
];

// Document de la base → classe du jeu. Un champ absent retombe sur la liste
// écrite ici : une classe à moitié remplie en base s'affiche quand même.
window.classeDepuisDocument = function(id, d) {
    const connue = window.CLASSES_PAR_DEFAUT.find(c => c.id === id) || {};
    return {
        id,
        ordre: Number(d && d.Ordre) || connue.ordre || 99,
        nom: (d && d.Nom) || connue.nom || id,
        imageTarot: (d && d.Image_Tarot) || connue.imageTarot || "",
        imageFond: (d && d.Image_Fond) || connue.imageFond || ""
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

// Le bouton des Paramètres : recopie la liste du jeu dans la base. Fusion :
// les champs qu'on aurait ajoutés à la main dans un document (ses effets, plus
// tard) ne sont jamais écrasés.
window.installerClasses = async function() {
    const btn = document.getElementById("btn-installer-classes");
    const texte = btn ? btn.innerText : "";
    if (btn) { btn.innerText = "Installation..."; btn.style.pointerEvents = "none"; }
    let faites = 0;
    try {
        for (const c of window.CLASSES_PAR_DEFAUT) {
            await setDoc(doc(db, COLLECTION_CLASSES, c.id), window.documentDepuisClasse(c), { merge: true });
            faites++;
        }
        window.CLASSES_CACHE = null;
        if (btn) btn.innerText = `${faites} classes installées ✔️`;
    } catch (e) {
        console.error("Installation des classes :", e);
        alert(`Installation interrompue (${faites} classe(s) écrite(s)).`);
        if (btn) btn.innerText = texte;
    } finally {
        if (btn) setTimeout(() => { btn.innerText = texte; btn.style.pointerEvents = "auto"; }, 2500);
    }
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
    document.getElementById("vue-grille-classes").style.display = "none";
    document.getElementById("vue-fiche-classe").style.display = "block";
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
