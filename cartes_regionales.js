// =========================================================================
//  IVALIS — LES CARTES RÉGIONALES (v272)
// =========================================================================
//  Nico : « quand on clique une région, ça zoome sur la région cliquée, et
//  apparaissent des nuages, différentes couches de plus en plus épaisses, et
//  une animation comme si la caméra traversait les nuages (plus tard, on
//  devra pouvoir la boucler pour masquer un chargement des icônes ; pour
//  l'instant une seule boucle). On arrive en transition sur la map région :
//  les nuages se dissipent, et la map régionale grossit légèrement, un zoom
//  qui l'amène à sa taille normale. Pareil au dézoom, quand on revient sur la
//  map du monde. »
//
//  LE CHEMIN, À L'ALLER (ouvrirCarteRegionale) :
//    1. la carte du monde plonge vers le centre de la boîte cliquée ;
//    2. la traversée des nuages (jouerTraverseeNuages) : des couches de plus
//       en plus épaisses foncent vers l'écran, jusqu'à le couvrir ;
//    3. au cœur, l'écran couvert, la carte régionale prend la place (son
//       image est attendue là : si elle n'est pas encore là, le cœur
//       reboucle — la mécanique qui masquera plus tard le chargement des
//       icônes) ;
//    4. les nuages s'éclaircissent, la carte régionale arrive un peu trop
//       grande et revient à sa taille (ECHELLE_ARRIVEE → 1).
//  AU RETOUR (fermerCarteRegionale), le même chemin à l'envers : la carte
//  régionale recule, les nuages, puis la carte du monde, encore plongée sur la
//  région, se dézoome jusqu'à son cadrage d'avant.
//
//  LA VUE : « comme la map principale, on fixe la hauteur par rapport à la
//  taille de l'écran et les côtés glissent si besoin. À la différence, on peut
//  zoomer (molette, doigts sur iPad), mais pas dézoomer plus que la hauteur de
//  l'écran. » Le zoom va de la hauteur de l'écran (base) à ZOOM_MAX fois plus.
//  Sur la carte régionale, le menu se range, et un bouton beige à flèche,
//  à gauche de celui qui rouvre le menu, ramène à la carte du monde.
//
//  CHACUN POUR SOI (Nico) : la carte régionale ouverte n'est qu'à l'écran de
//  celui qui l'a ouverte ; aucun autre poste ne bouge.
//
//  LA BASE : une fiche par carte, Cartes_Regionales/{numéro de la boîte} —
//  { Numero, Nom, Image, Description, Titre: {x, y, taille}, Usure:
//  {colonnes, lignes, cases} }. Le nom et l'image ont une valeur par défaut
//  ici (la liste de Nico) ; la fiche l'emporte quand elle en porte une. Un
//  poste en DEV crée les fiches qui manquent. L'usure vaut pour TOUTES les
//  parties : elle fait partie de la carte. (Les Nuages peints avant v286
//  restent en base, ignorés : plus de nuages sur les cartes régionales.)
//
//  LE DEV (le bouton rouge du bas, popup des régions) : sur une carte
//  régionale, un pinceau peint en orange, provisoirement, où le parchemin peut
//  brûler, se déchirer, se percer (v283) ; une gomme l'efface ; « Valider
//  l'usure » l'enregistre.
//  Une case « Édition du titre » : le titre se déplace, le carré de son coin
//  haut droit l'agrandit ou le rétrécit ; décocher l'enregistre.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import {
    collection, doc, onSnapshot, setDoc
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const COLLECTION = "Cartes_Regionales";
const ZOOM_MAX = 4;               // au plus quatre fois la hauteur de l'écran
const ZOOM_MONDE_PLONGEE = 2.4;   // la carte du monde plonge vers la région
const ECHELLE_ARRIVEE = 1.12;     // la carte régionale arrive un peu trop grande
const DUREE_PLONGEE_MS = 950;
const DUREE_ARRIVEE_MS = 1300;
const GRILLE_COLONNES = 240;      // la grille des zones de nuages, en largeur
const TITRE_DEFAUT = { x: 0.5, y: 0.09, taille: 0.075 };
const SEUIL_GLISSE = 5;

// La liste de Nico : le numéro de la boîte cliquable, le nom, l'image.
window.CARTES_REGIONALES_DEFAUT = {
    1:  { nom: "La forêt des murmures",      image: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1792834858/IMG_1894_zpqvai.jpg" },
    2:  { nom: "La vallée de souffre",       image: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1792834786/IMG_1892_fr8spy.jpg" },
    3:  { nom: "Le mont Pletia",             image: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1792834937/IMG_1900_ccinzy.jpg" },
    4:  { nom: "Volcanisse",                 image: null },
    5:  { nom: "Le désert d'Etheria",        image: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1792834787/IMG_1893_cubyml.jpg" },
    6:  { nom: "L'enclave d'argenté",        image: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1792834858/IMG_1897_troqrx.jpg" },
    7:  { nom: "L'île aux marchés",          image: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1792834858/IMG_1903_fhehdr.png" },
    8:  { nom: "Les doigts d'Atrium",        image: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1792834616/IMG_1979_gcjlls.png" },
    9:  { nom: "Arcaï",                      image: null },
    10: { nom: "La pointe des sentinelles",  image: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1792836374/IMG_2189_nzctzd.jpg" },
    11: { nom: "La province d'Aurelya",      image: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1792834636/IMG_1984_nahpgi.jpg" },
    12: { nom: "La crique du Pendu",         image: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1792834616/IMG_1977_aqqcdv.png" },
    13: { nom: "Les îlots maudits",          image: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1792834643/IMG_1981_y7wld9.png" }
};

// Ce que la base a dit de chaque carte (sa fiche brute).
let fichesBase = {};
window.CARTES_REGIONALES = {};

const estDev = () => { try { return localStorage.getItem("ivalis_DEV_MODE") === "on"; } catch (e) { return false; } };
const attendre = (ms) => new Promise(r => setTimeout(r, ms));
const borne = (v, min, max) => Math.max(min, Math.min(max, v));
const lisse = (a, b, x) => { const t = borne((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const clic = () => { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); };

// L'image servie par Cloudinary, compressée et limitée (un iPad n'a pas à
// décoder un 8K) : 4096 de large au plus, assez pour le zoom ×4.
window.urlImageCarteRegionale = function(url) {
    if (!url || !/res\.cloudinary\.com\/.+\/upload\//.test(url) || /\/upload\/[a-z]_/.test(url)) return url;
    return url.replace("/upload/", "/upload/w_4096,c_limit,q_auto,f_auto/");
};

// --- LES FICHES ------------------------------------------------------------
function composerCartes() {
    const cartes = {};
    const numeros = new Set([...Object.keys(window.CARTES_REGIONALES_DEFAUT), ...Object.keys(fichesBase)].map(Number));
    numeros.forEach(n => {
        if (!(n > 0)) return;
        const defaut = window.CARTES_REGIONALES_DEFAUT[n] || {};
        const fiche = fichesBase[n] || {};
        const titre = fiche.Titre || {};
        cartes[n] = {
            numero: n,
            nom: fiche.Nom || defaut.nom || `Région ${n}`,
            image: fiche.Image || defaut.image || null,
            description: fiche.Description || "",
            titre: {
                x: Number.isFinite(Number(titre.x)) ? borne(Number(titre.x), 0, 1) : TITRE_DEFAUT.x,
                y: Number.isFinite(Number(titre.y)) ? borne(Number(titre.y), 0, 1) : TITRE_DEFAUT.y,
                taille: Number.isFinite(Number(titre.taille)) ? borne(Number(titre.taille), 0.015, 0.4) : TITRE_DEFAUT.taille
            },
            // L'USURE DU PARCHEMIN (v283, bords_parchemin.js) : là où le DEV a
            // peint que le bord peut brûler, se déchirer, se percer (même codage).
            usure: fiche.Usure && fiche.Usure.cases ? { colonnes: Number(fiche.Usure.colonnes), lignes: Number(fiche.Usure.lignes), cases: String(fiche.Usure.cases) } : null,
            // LES TERRAINS PRATICABLES (v275, terrains_regionaux.js) : des
            // polygones en fractions de l'image, et ses proportions (largeur /
            // hauteur) pour les calculs faits carte fermée.
            terrains: lireTerrains(fiche.Terrains),
            prochainTerrain: Number(fiche.Prochain_Terrain) || 1,
            aspect: Number(fiche.Aspect) > 0 ? Number(fiche.Aspect) : null
        };
    });
    window.CARTES_REGIONALES = cartes;
    return cartes;
}

function lireTerrains(terrains) {
    const liste = [];
    Object.entries(terrains || {}).forEach(([cle, t]) => {
        const numero = Number((t && t.Numero) || cle);
        const points = Array.isArray(t && t.Points)
            ? t.Points.map(p => ({ x: borne(Number(p.x) || 0, 0, 1), y: borne(Number(p.y) || 0, 0, 1) })) : [];
        if (numero > 0 && points.length >= 3) liste.push({ numero, points });
    });
    return liste.sort((a, b) => a.numero - b.numero);
}
// Une fiche changée sur ce poste, tout de suite à l'écran (l'écriture en base
// suit, faite par l'appelant) : les terrains praticables (v275).
window.majFicheRegionaleLocale = function(numero, champs) {
    const n = Number(numero);
    if (!(n > 0)) return null;
    fichesBase[n] = Object.assign({ Numero: n }, fichesBase[n], champs || {});
    composerCartes();
    return window.CARTES_REGIONALES[n];
};

// Les fiches telles que l'écoute les reçoit (et les bancs) : [{ id, data }].
// `depuisCache` : une lecture tirée du cache local peut être incomplète — on
// n'en déduit pas qu'une fiche manque (elle serait réécrite par-dessus).
window.appliquerCartesRegionalesDeLaBase = function(liste, options) {
    if (!(options && options.depuisCache)) ecouteRecue = true;
    fichesBase = {};
    (liste || []).forEach(({ id, data }) => {
        const n = Number((data && data.Numero) || id);
        if (n > 0) fichesBase[n] = data || {};
    });
    const avant = etat.ouverte && window.CARTES_REGIONALES[etat.ouverte];
    composerCartes();
    // La carte ouverte suit ce que la base vient de dire (un autre poste DEV
    // a peint l'usure, déplacé le titre) — sauf ce qu'on est en train d'éditer.
    if (etat.ouverte && avant) {
        const apres = window.CARTES_REGIONALES[etat.ouverte];
        if (!etat.editionTitre) poserTitre();
        if (JSON.stringify(avant.usure) !== JSON.stringify(apres.usure)) {
            if (!brouillonDu("usure").modifie) { oublierBrouillon("usure"); poserBord(); }
            dessinerPeinture();
        }
    }
    semerFichesManquantes();
    // Un descriptif a pu changer ailleurs : sa fenêtre suit (descriptifs_regions.js).
    try { window.dispatchEvent(new CustomEvent("cartes-regionales-maj")); } catch (e) { /* vieux navigateur */ }
};

// Un poste en DEV crée les fiches qui manquent (le numéro de la boîte, le nom,
// l'image, une description vide) : chaque carte a sa place en base, prête à
// recevoir ses descriptions.
let semeesCeTour = false, ecouteRecue = false;
function semerFichesManquantes() {
    if (!estDev() || semeesCeTour || !ecouteRecue) return;
    semeesCeTour = true;
    Object.entries(window.CARTES_REGIONALES_DEFAUT).forEach(([cle, d]) => {
        const n = Number(cle);
        if (fichesBase[n]) return;
        setDoc(doc(db, COLLECTION, String(n)), { Numero: n, Nom: d.nom, Image: d.image || "", Description: "" }, { merge: true })
            .catch(e => console.error("Fiche de la carte régionale " + n + " :", e));
    });
}
// LE DESCRIPTIF RP D'UNE RÉGION (v274) : le texte que le maître du jeu (l'IA)
// recevra plus tard, quand les joueurs sont dans cette région. Il vit dans la
// fiche de la carte (champ Description). Une boîte sans carte connue reçoit
// sa fiche à son premier descriptif.
window.descriptifRegion = function(numero) {
    const n = Number(numero), carte = window.CARTES_REGIONALES[n];
    return { numero: n, nom: carte ? carte.nom : `Région ${n}`, texte: carte ? carte.description : "" };
};
window.enregistrerDescriptifRegion = async function(numero, texte) {
    const n = Number(numero);
    if (!(n > 0)) return false;
    fichesBase[n] = Object.assign({ Numero: n }, fichesBase[n], { Description: String(texte || "") });
    composerCartes();
    return enregistrerFiche(n, { Description: String(texte || "") });
};
// Pour le maître du jeu, plus tard : tout ce qu'on sait de la région.
window.descriptifRPRegionPourMJ = function(numero) {
    const d = window.descriptifRegion(numero);
    return { ...d, lore: typeof window.loreDeLaRegion === "function" ? window.loreDeLaRegion(numero) : "" };
};

async function enregistrerFiche(numero, champs) {
    const carte = window.CARTES_REGIONALES[numero];
    if (!carte) return false;
    try {
        await setDoc(doc(db, COLLECTION, String(numero)), { Numero: numero, Nom: carte.nom, ...champs }, { merge: true });
        return true;
    } catch (e) {
        console.error("Carte régionale " + numero + " :", e);
        return false;
    }
}

// --- L'ÉTAT DE CE POSTE ----------------------------------------------------
const etat = {
    ouverte: null,            // le numéro de la carte affichée
    enTransition: false,
    largeur: 0, hauteur: 0,   // l'image, en pixels
    zoom: 1, base: 1, panX: 0, panY: 0,
    cadrageMonde: null,       // le cadrage de la carte du monde avant la plongée
    centreMonde: null,        // le centre de la boîte cliquée (carte du monde)
    outil: null,              // "pinceau" | "gomme" | null
    taillePinceau: 50,        // en pixels d'écran (le rayon)
    calque: "usure",          // ce que peint le pinceau : l'usure du parchemin (v283 ; les nuages, retirés en v286)
    brouillon: null,          // la grille peinte du calque en main (Uint8Array), pas encore validée
    brouillonModifie: false,
    reserve: {},              // le brouillon de l'autre calque, mis de côté : { brouillon, modifie }
    editionTitre: false
};
window.carteRegionaleOuverte = () => etat.ouverte;
window.cadrageCarteRegion = () => ({ numero: etat.ouverte, zoom: etat.zoom, base: etat.base, panX: etat.panX, panY: etat.panY,
                                     largeur: etat.largeur, hauteur: etat.hauteur, zoomMax: etat.base * ZOOM_MAX });

// --- LES ÉLÉMENTS ----------------------------------------------------------
const $ = (id) => document.getElementById(id);
function construireVue() {
    if ($("vue-carte-region")) return;
    const ecran = $("ecran-jeu");
    if (!ecran) return;
    const vue = document.createElement("div");
    vue.id = "vue-carte-region";
    vue.className = "vue-carte-region";
    vue.style.display = "none";
    vue.innerHTML = `
        <div id="carte-region-table" class="table-bois"></div>
        <div class="table-ombre"></div>
        <div id="carte-region" class="carte-region">
          <img id="carte-region-image" class="carte-region-image" alt="" draggable="false">
          <canvas id="carte-region-peinture" class="carte-region-peinture"></canvas>
        </div>
        <div id="carte-region-dessus" class="carte-region-dessus">
          <div id="carte-region-titre" class="carte-region-titre"><span class="carte-region-titre-texte"></span><span class="carte-region-titre-poignee" title="Agrandir ou rétrécir"></span></div>
        </div>`;
    const fond = $("conteneur-carte-fond");
    if (fond && fond.nextSibling) ecran.insertBefore(vue, fond.nextSibling); else ecran.appendChild(vue);

    const retour = document.createElement("button");
    retour.type = "button";
    retour.id = "btn-retour-monde";
    retour.className = "btn-retour-monde";
    retour.title = "Retour à la carte du monde";
    retour.setAttribute("aria-label", "Retour à la carte du monde");
    retour.style.display = "none";
    retour.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 5.5 L8 12 L14.5 18.5"/><path d="M8.5 12 H19"/></svg>`;
    retour.addEventListener("click", () => { clic(); window.fermerCarteRegionale(); });
    ecran.appendChild(retour);

    brancherGestes(vue);
}

// --- LE CADRAGE ------------------------------------------------------------
// La taille de la vue, et son coin haut gauche à l'écran. Lues sur l'écran de
// jeu, qu'elle couvre : le petit zoom d'arrivée (un transform sur la vue) ne
// les fausse pas.
function tailleVue() {
    const ecran = $("ecran-jeu");
    const r = ecran && ecran.getBoundingClientRect();
    return { l: (r && r.width) || window.innerWidth, h: (r && r.height) || window.innerHeight,
             gauche: (r && r.left) || 0, haut: (r && r.top) || 0 };
}
function bornerPan() {
    const { l, h } = tailleVue();
    const largeur = etat.largeur * etat.zoom, hauteur = etat.hauteur * etat.zoom;
    etat.panX = largeur <= l ? (l - largeur) / 2 : borne(etat.panX, l - largeur, 0);
    etat.panY = hauteur <= h ? (h - hauteur) / 2 : borne(etat.panY, h - hauteur, 0);
}
function poserCarte() {
    // La carte, son calque jumeau du dessus (le titre, que les brûlures du
    // parchemin ne découpent pas — v285) et celui du dessous (la table en
    // bois, qui suit la carte — v286) : même taille, même cadrage.
    [$("carte-region"), $("carte-region-dessus"), $("carte-region-table")].forEach(carte => {
        if (!carte) return;
        carte.style.width = etat.largeur + "px";
        carte.style.height = etat.hauteur + "px";
        carte.style.transform = `translate(${etat.panX}px, ${etat.panY}px) scale(${etat.zoom})`;
        carte.style.setProperty("--zoom-region", String(etat.zoom));
    });
}
// Calée sur la hauteur de l'écran, centrée en largeur ; `garder` reprend le
// zoom relatif et le point au centre de l'écran (un iPad qu'on tourne).
function cadrer(garder) {
    if (!etat.largeur || !etat.hauteur) return;
    const { l, h } = tailleVue();
    const relatif = garder && etat.base ? etat.zoom / etat.base : 1;
    const centre = garder ? { x: (l / 2 - etat.panX) / etat.zoom, y: (h / 2 - etat.panY) / etat.zoom } : null;
    etat.base = h / etat.hauteur;
    etat.zoom = borne(etat.base * relatif, etat.base, etat.base * ZOOM_MAX);
    if (centre) { etat.panX = l / 2 - centre.x * etat.zoom; etat.panY = h / 2 - centre.y * etat.zoom; }
    else { etat.panX = (l - etat.largeur * etat.zoom) / 2; etat.panY = 0; }
    bornerPan();
    poserCarte();
}
// Zoomer d'un facteur autour d'un point de l'écran (molette, doigts). Jamais
// moins que la hauteur de l'écran, jamais plus que ZOOM_MAX fois.
window.zoomerCarteRegion = function(facteur, x, y) {
    if (!etat.ouverte || !etat.largeur) return etat.zoom;
    const vue = tailleVue();
    const cx = (x === undefined ? vue.l / 2 : x - vue.gauche), cy = (y === undefined ? vue.h / 2 : y - vue.haut);
    const avant = etat.zoom;
    etat.zoom = borne(avant * facteur, etat.base, etat.base * ZOOM_MAX);
    const k = etat.zoom / avant;
    etat.panX = cx - (cx - etat.panX) * k;
    etat.panY = cy - (cy - etat.panY) * k;
    bornerPan();
    poserCarte();
    return etat.zoom;
};
window.glisserCarteRegion = function(dx, dy) {
    if (!etat.ouverte) return;
    etat.panX += dx; etat.panY += dy;
    bornerPan();
    poserCarte();
};
// Un point de l'écran, en pixels de l'image.
function pointImage(clientX, clientY) {
    const vue = tailleVue();
    return { x: (clientX - vue.gauche - etat.panX) / etat.zoom, y: (clientY - vue.haut - etat.panY) / etat.zoom };
}
window.pointImageCarteRegion = pointImage;
// L'URL de l'image affichée (celle que MIA_VILLAGE découpe, v273).
window.imageCarteRegionaleOuverte = () => (etat.ouverte ? etat.urlImage || null : null);
// La carte s'ouvre ou se ferme : les villages (villages_regionaux.js) suivent.
function signaler(ouverte, numero) {
    try { window.dispatchEvent(new CustomEvent("carte-regionale", { detail: { numero: ouverte ? etat.ouverte : numero, ouverte } })); }
    catch (e) { console.error("Carte régionale :", e); }
}

// --- LES GESTES ------------------------------------------------------------
//  Un doigt (ou la souris) : glisser la carte — ou peindre, le pinceau ou la
//  gomme en main ; ou déplacer le titre en édition. Deux doigts : zoomer
//  autour d'eux, et glisser. La molette : zoomer autour du pointeur.
const pointeurs = new Map();
let geste = null;
function brancherGestes(vue) {
    vue.addEventListener("wheel", (e) => {
        e.preventDefault();
        if (!etat.ouverte || etat.enTransition) return;
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey) { window.glisserCarteRegion(-e.deltaX, 0); return; }
        window.zoomerCarteRegion(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
    }, { passive: false });
    vue.addEventListener("gesturestart", (e) => e.preventDefault());

    vue.addEventListener("pointerdown", (e) => {
        if (!etat.ouverte || etat.enTransition) return;
        pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try { vue.setPointerCapture(e.pointerId); } catch (err) { /* pointeur déjà parti */ }
        if (pointeurs.size === 2) { commencerPincement(); return; }
        if (pointeurs.size > 2) return;
        const titre = e.target.closest && e.target.closest("#carte-region-titre");
        if (etat.editionTitre && titre) {
            const poignee = e.target.classList.contains("carte-region-titre-poignee");
            const carte = window.CARTES_REGIONALES[etat.ouverte];
            geste = { type: poignee ? "taille" : "titre", x: e.clientX, y: e.clientY, depart: { ...carte.titre } };
            e.preventDefault();
            return;
        }
        if (etat.outil && estDev()) {
            geste = { type: "peinture", dernier: pointImage(e.clientX, e.clientY) };
            peindre(geste.dernier, geste.dernier);
            e.preventDefault();
            return;
        }
        geste = { type: "glisser", x: e.clientX, y: e.clientY, panX: etat.panX, panY: etat.panY };
    });
    vue.addEventListener("pointermove", (e) => {
        if (!pointeurs.has(e.pointerId)) return;
        pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (!geste) return;
        e.preventDefault();
        if (geste.type === "pincement") { suivrePincement(); return; }
        if (geste.type === "glisser") {
            etat.panX = geste.panX + (e.clientX - geste.x);
            etat.panY = geste.panY + (e.clientY - geste.y);
            bornerPan(); poserCarte();
        } else if (geste.type === "peinture") {
            const ici = pointImage(e.clientX, e.clientY);
            peindre(geste.dernier, ici);
            geste.dernier = ici;
        } else if (geste.type === "titre" || geste.type === "taille") {
            suivreTitre(e.clientX - geste.x, e.clientY - geste.y);
        }
    });
    const lever = (e) => {
        if (!pointeurs.has(e.pointerId)) return;
        pointeurs.delete(e.pointerId);
        if (geste && geste.type === "pincement") {
            // Il reste un doigt : il reprend la main pour glisser.
            const reste = [...pointeurs.values()][0];
            geste = reste ? { type: "glisser", x: reste.x, y: reste.y, panX: etat.panX, panY: etat.panY } : null;
            return;
        }
        if (pointeurs.size === 0) {
            if (geste && geste.type === "peinture" && etat.calque === "usure") demanderApercuBord();
            geste = null;
        }
    };
    vue.addEventListener("pointerup", lever);
    vue.addEventListener("pointercancel", lever);
}
function mesurePincement() {
    const [a, b] = [...pointeurs.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function commencerPincement() {
    const m = mesurePincement();
    geste = { type: "pincement", d: m.d, x: m.x, y: m.y };
}
function suivrePincement() {
    const m = mesurePincement();
    window.glisserCarteRegion(m.x - geste.x, m.y - geste.y);
    window.zoomerCarteRegion(m.d / geste.d, m.x, m.y);
    geste.d = m.d; geste.x = m.x; geste.y = m.y;
}

// --- LE MESSAGE « CARTE À VENIR » --------------------------------------------
function annoncer(texte) {
    const ecran = $("ecran-jeu") || document.body;
    let bandeau = $("annonce-carte-region");
    if (!bandeau) {
        bandeau = document.createElement("div");
        bandeau.id = "annonce-carte-region";
        bandeau.className = "annonce-carte-region";
        ecran.appendChild(bandeau);
    }
    bandeau.textContent = texte;
    bandeau.classList.remove("visible");
    void bandeau.offsetWidth;
    bandeau.classList.add("visible");
    clearTimeout(annoncer.minuteur);
    annoncer.minuteur = setTimeout(() => bandeau.classList.remove("visible"), 2600);
}

// =========================================================================
//  LA TRAVERSÉE DES NUAGES
// =========================================================================
//  La caméra traverse des couches de nuages (nuages_realistes.js, v279) : elles
//  naissent au loin, foncent vers l'écran (leur grain grossit comme 1 /
//  distance) et le dépassent. Leur « couverture » suit le moment : 0 au
//  départ, 1 au cœur, 0 à la fin ; un voile blanc couvre l'écran au cœur :
//  c'est là, l'écran entièrement pris, que la carte change.
//
//  LA BOUCLE : le cœur dure DUREE_COEUR_MS. Il se rejoue tant que `auCoeur`
//  (la promesse rendue par l'appelant) n'est pas tenue, ou tant qu'il reste
//  des `boucles` — ce qui masquera plus tard le chargement des icônes.
//
//  ELLE SE JOUE TOUJOURS (Nico, v279 : « quand je clique sur une région, je
//  n'ai pas l'animation avec les nuages ») : le jeu la sautait quand l'iPad
//  demande de réduire les animations.
//  Sans WebGL, un voile blanc seul fait la traversée.
const DUREE_ENTREE_MS = 1150, DUREE_COEUR_MS = 520, DUREE_SORTIE_MS = 1250;
const COUCHES_PAR_SECONDE = 2.4;
const RESOLUTION_TRAVERSEE = 0.55, PIXELS_TRAVERSEE_MAX = 700000;
function hasard(graine) {
    let n = graine % 2147483647 || 1;
    return () => { n = (n * 16807) % 2147483647; return (n - 1) / 2147483646; };
}

window.TRAVERSEE_EN_COURS = false;
// Ce que montre la traversée à l'instant (les bancs) : phase, couverture, voile.
window.SONDE_TRAVERSEE = null;
// options : { auCoeur: () => Promise, boucles: 1, apresCoeur: () => void }
// Rend une promesse tenue quand le dernier nuage est passé.
window.jouerTraverseeNuages = function(options) {
    const opts = Object.assign({ boucles: 1 }, options || {});
    const ecran = $("ecran-jeu") || document.body;
    const toile = document.createElement("canvas");
    toile.id = "traversee-nuages";
    toile.className = "traversee-nuages";
    ecran.appendChild(toile);
    const moteur = window.NuagesRealistes ? window.NuagesRealistes.creerTraversee(toile) : { ok: false };
    const ctx2d = moteur.ok ? null : toile.getContext("2d");
    window.TRAVERSEE_EN_COURS = true;
    // Le vent des nuages, le temps de la traversée (v286).
    if (typeof window.jouerSonEvenement === "function") window.jouerSonEvenement("vent-nuages");

    let avance = hasard(Date.now() % 100000 + 7)() * 10;
    let phase = "entree", debutPhase = performance.now(), dernier = debutPhase;
    let coeurTenu = false, bouclesFaites = 0;
    const taille = () => {
        const r = ecran.getBoundingClientRect();
        let l = (r.width || window.innerWidth) * RESOLUTION_TRAVERSEE, h = (r.height || window.innerHeight) * RESOLUTION_TRAVERSEE;
        const k = Math.min(1, Math.sqrt(PIXELS_TRAVERSEE_MAX / Math.max(1, l * h)));
        return { l: l * k, h: h * k };
    };
    const couverture = (maintenant) => {
        const t = maintenant - debutPhase;
        if (phase === "entree") return lisse(0, DUREE_ENTREE_MS, t);
        if (phase === "coeur") return 1;
        return 1 - lisse(0, DUREE_SORTIE_MS * 0.8, t);
    };
    const voile = (maintenant) => {
        const t = maintenant - debutPhase;
        if (phase === "entree") return lisse(DUREE_ENTREE_MS * 0.55, DUREE_ENTREE_MS, t);
        if (phase === "coeur") return 1;
        return 1 - lisse(0, DUREE_SORTIE_MS * 0.5, t);
    };

    return new Promise((resoudre) => {
        const image = (maintenant) => {
            const dt = Math.min(0.05, (maintenant - dernier) / 1000);
            dernier = maintenant;
            avance += COUCHES_PAR_SECONDE * dt;
            const c = couverture(maintenant), v = voile(maintenant);
            window.SONDE_TRAVERSEE = { phase, couverture: c, voile: v };
            const t = taille();
            if (moteur.ok) moteur.dessiner({ largeur: t.l, hauteur: t.h, avance, couverture: c, voile: v });
            else if (ctx2d) {
                toile.width = Math.round(t.l); toile.height = Math.round(t.h);
                const g = ctx2d.createRadialGradient(t.l / 2, t.h / 2, 0, t.l / 2, t.h / 2, Math.hypot(t.l, t.h) / 2);
                g.addColorStop(0, `rgba(246, 247, 250, ${Math.max(v, c * 0.8)})`);
                g.addColorStop(1, `rgba(226, 230, 238, ${Math.max(v, c * 0.8)})`);
                ctx2d.fillStyle = g; ctx2d.fillRect(0, 0, t.l, t.h);
            }

            // LES PHASES.
            const ecoule = maintenant - debutPhase;
            if (phase === "entree" && ecoule >= DUREE_ENTREE_MS) {
                phase = "coeur"; debutPhase = maintenant;
                Promise.resolve().then(() => opts.auCoeur ? opts.auCoeur() : null)
                    .catch(e => console.error("Traversée des nuages :", e))
                    .then(() => { coeurTenu = true; });
            } else if (phase === "coeur" && ecoule >= DUREE_COEUR_MS) {
                bouclesFaites++;
                if (coeurTenu && bouclesFaites >= opts.boucles) {
                    phase = "sortie"; debutPhase = maintenant;
                    if (typeof opts.apresCoeur === "function") { try { opts.apresCoeur(); } catch (e) { console.error(e); } }
                } else {
                    debutPhase = maintenant;   // une boucle de plus : le cœur se rejoue
                }
            } else if (phase === "sortie" && ecoule >= DUREE_SORTIE_MS) {
                if (moteur.ok) moteur.detruire();
                toile.remove();
                window.TRAVERSEE_EN_COURS = false;
                window.SONDE_TRAVERSEE = null;
                resoudre({ boucles: bouclesFaites });
                return;
            }
            requestAnimationFrame(image);
        };
        requestAnimationFrame(image);
    });
};

// =========================================================================
//  L'ALLER ET LE RETOUR
// =========================================================================
const transformMonde = (panX, panY, zoom) => `translate(${panX}px, ${panY}px) scale(${zoom})`;
function plongeeMonde(centre) {
    const cadre = typeof window.cadrageCarteMonde === "function" ? window.cadrageCarteMonde() : { zoom: 1, panX: 0, panY: 0 };
    const ecran = $("ecran-jeu").getBoundingClientRect();
    const zoom = cadre.zoom * ZOOM_MONDE_PLONGEE;
    return { depart: transformMonde(cadre.panX, cadre.panY, cadre.zoom),
             arrivee: transformMonde(ecran.width / 2 - centre.x * zoom, ecran.height / 2 - centre.y * zoom, zoom), cadre };
}
const animer = (el, images, duree, easing) => (el && typeof el.animate === "function")
    ? el.animate(images, { duration: duree, easing, fill: "forwards" }) : null;
// La carte du monde, et la table en bois avec elle (v286) : la même animation,
// annulée ensemble.
function animerMonde(images, duree, easing) {
    const a = animer($("carte-fond-jeu"), images, duree, easing), b = animer($("table-monde"), images, duree, easing);
    if (a && b) a.addEventListener("cancel", () => b.cancel());
    return a;
}
function poserTransformMonde(t) {
    [$("carte-fond-jeu"), $("table-monde")].forEach(el => { if (el) el.style.transform = t; });
}
const fin = (a) => (a ? a.finished.catch(() => null) : Promise.resolve());

// L'image de la carte, chargée (et ses dimensions lues). En CORS (v273) :
// MIA_VILLAGE en découpe des carrés, ce qu'une image « opaque » interdirait.
// Cloudinary l'autorise ; un hôte qui refuserait retombe sur un chargement
// ordinaire (la carte s'affiche, seuls les villages ne pourront pas s'y faire).
function chargerImage(url) {
    const essai = (cors) => new Promise((resoudre) => {
        const img = new Image();
        img.decoding = "async";
        if (cors) img.crossOrigin = "anonymous";
        img.onload = () => resoudre(img);
        img.onerror = () => resoudre(null);
        img.src = url;
    });
    return essai(true).then(img => img || essai(false));
}
window.chargerImageCarteRegionale = chargerImage;

window.ouvrirCarteRegionale = async function(numero, options) {
    const n = Number(numero);
    const carte = window.CARTES_REGIONALES[n];
    if (!carte || etat.enTransition || etat.ouverte) return false;
    if (!carte.image) { annoncer(`${carte.nom} — carte à venir`); return false; }
    construireVue();
    const sansTransition = !!(options && options.sansTransition);
    etat.enTransition = true;
    // Le pinceau d'usure de la carte du monde (v283) se pose en partant.
    if (typeof window.lacherOutilUsureMonde === "function") window.lacherOutilUsureMonde();
    const url = window.urlImageCarteRegionale(carte.image);
    const chargement = chargerImage(url);       // pendant la plongée et les nuages
    // Le bord de parchemin (v282) se calcule pendant ce temps (à part).
    const graineBord = typeof window.graineParcheminRegion === "function" ? window.graineParcheminRegion(n) : n;
    chargement.then(img => { if (img && window.BordsParchemin) window.BordsParchemin.preparer({ graine: graineBord, aspect: img.naturalWidth / img.naturalHeight, cote: 2048, zones: carte.usure }); });
    const region = (window.REGIONS_CARTE || {})[n];
    etat.centreMonde = region && typeof window.centreRegion === "function" ? window.centreRegion(region.points) : { x: 1920, y: 1080 };
    if (typeof window.replierMenuLateral === "function") window.replierMenuLateral({ silencieux: true });
    const mondeEl = $("carte-fond-jeu");
    const plongee = plongeeMonde(etat.centreMonde);
    etat.cadrageMonde = plongee.cadre;

    const installer = async () => {
        const img = await chargement;
        etat.ouverte = n;
        etat.largeur = (img && img.naturalWidth) || 1920;
        etat.hauteur = (img && img.naturalHeight) || 1080;
        etat.outil = null; etat.brouillon = null; etat.brouillonModifie = false; etat.editionTitre = false;
        etat.calque = "usure"; etat.reserve = {};
        const imageEl = $("carte-region-image");
        if (img && img.crossOrigin) imageEl.crossOrigin = "anonymous"; else imageEl.removeAttribute("crossorigin");
        imageEl.src = img ? img.src : url;
        etat.urlImage = img ? img.src : url;
        // LES BORDS DE PARCHEMIN (v282, bords_parchemin.js) : la carte entière
        // (son image, ses nuages, ses lieux) est découpée le long d'un bord usé ;
        // l'usure se pose sur l'image, sous tout le reste. Brûlé, déchiré,
        // percé là où le DEV l'a peint (v283).
        poserBord();
        const vue = $("vue-carte-region");
        vue.style.display = "block";
        vue.classList.add("arrivee");
        cadrer(false);
        poserTitre();
        dessinerPeinture();
        // Le bouton de retour (au-dessus de tout) attend que les nuages se
        // soient dissipés : il ne flotte pas sur l'écran blanc (v279).
        if (sansTransition) $("btn-retour-monde").style.display = "flex";
        actualiserDev();
        signaler(true);
    };

    if (sansTransition) {
        await installer();
        const vue = $("vue-carte-region");
        vue.classList.remove("arrivee");
        etat.enTransition = false;
        return true;
    }
    const plonger = animerMonde([{ transform: plongee.depart }, { transform: plongee.arrivee }], DUREE_PLONGEE_MS, "cubic-bezier(.5,0,.85,.45)");
    await attendre(DUREE_PLONGEE_MS * 0.35);
    let arrivee = null;
    await window.jouerTraverseeNuages({
        auCoeur: installer,
        apresCoeur: () => {
            const vue = $("vue-carte-region");
            arrivee = animer(vue, [{ transform: `scale(${ECHELLE_ARRIVEE})` }, { transform: "scale(1)" }], DUREE_ARRIVEE_MS, "cubic-bezier(.2,.7,.25,1)");
        }
    });
    await fin(plonger);
    await fin(arrivee);
    if (plonger) plonger.cancel();
    if (typeof window.glisserCarteMonde === "function" && etat.cadrageMonde) window.glisserCarteMonde(etat.cadrageMonde.panX);
    const vue = $("vue-carte-region");
    if (arrivee) arrivee.cancel();
    vue.classList.remove("arrivee");
    if (etat.ouverte === n) $("btn-retour-monde").style.display = "flex";
    etat.enTransition = false;
    return true;
};

window.fermerCarteRegionale = async function(options) {
    if (!etat.ouverte || etat.enTransition) return false;
    const sansTransition = !!(options && options.sansTransition);
    etat.enTransition = true;
    // Un titre en cours d'édition s'enregistre en partant.
    if (etat.editionTitre) window.basculerEditionTitreRegion(false);
    etat.outil = null;
    actualiserDev();
    const vue = $("vue-carte-region");
    const mondeEl = $("carte-fond-jeu");
    const cadre = etat.cadrageMonde || (typeof window.cadrageCarteMonde === "function" ? window.cadrageCarteMonde() : { zoom: 1, panX: 0, panY: 0 });
    const plongee = plongeeMonde(etat.centreMonde || { x: 1920, y: 1080 });
    const retirer = () => {
        vue.style.display = "none";
        $("btn-retour-monde").style.display = "none";
        const numero = etat.ouverte;
        etat.ouverte = null;
        actualiserDev();
        signaler(false, numero);
    };
    if (sansTransition) {
        retirer();
        if (typeof window.glisserCarteMonde === "function") window.glisserCarteMonde(cadre.panX);
        etat.enTransition = false;
        return true;
    }
    const recul = animer(vue, [{ transform: "scale(1)" }, { transform: `scale(${1 / ECHELLE_ARRIVEE})` }], DUREE_ENTREE_MS + 200, "cubic-bezier(.5,0,.8,.5)");
    let remontee = null;
    await window.jouerTraverseeNuages({
        auCoeur: async () => {
            if (recul) recul.cancel();
            retirer();
            // La carte du monde attend, encore plongée sur la région…
            if (mondeEl) poserTransformMonde(plongee.arrivee);
        },
        apresCoeur: () => {
            // … et se dézoome jusqu'à son cadrage d'avant.
            remontee = animerMonde([{ transform: plongee.arrivee }, { transform: transformMonde(cadre.panX, cadre.panY, cadre.zoom) }],
                              DUREE_ARRIVEE_MS, "cubic-bezier(.2,.7,.25,1)");
        }
    });
    await fin(remontee);
    if (remontee) remontee.cancel();
    if (typeof window.glisserCarteMonde === "function") window.glisserCarteMonde(cadre.panX);
    etat.enTransition = false;
    return true;
};

// =========================================================================
//  LES ZONES DE NUAGES (la grille) ET LEUR PEINTURE (DEV)
// =========================================================================
//  Une grille de GRILLE_COLONNES colonnes, posée sur l'image (autant de lignes
//  que ses proportions le veulent) : une case vaut 1 sous les nuages. En base,
//  ses bits en base64 (Nuages.cases) — quelques kilo-octets.
function dimensionsGrille() {
    const colonnes = GRILLE_COLONNES;
    const lignes = Math.max(1, Math.round(colonnes * (etat.hauteur || 1) / (etat.largeur || 1)));
    return { colonnes, lignes };
}
window.encoderGrilleNuages = function(cases) {
    const octets = new Uint8Array(Math.ceil(cases.length / 8));
    cases.forEach((v, i) => { if (v) octets[i >> 3] |= (1 << (i & 7)); });
    let s = "";
    octets.forEach(o => { s += String.fromCharCode(o); });
    return btoa(s);
};
window.decoderGrilleNuages = function(texte, total) {
    const cases = new Uint8Array(total);
    let s = "";
    try { s = atob(texte || ""); } catch (e) { return cases; }
    for (let i = 0; i < total; i++) cases[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
    return cases;
};
// La grille enregistrée de la carte ouverte (aux dimensions de son image) :
// l'usure du parchemin.
function grilleEnregistree() {
    const { colonnes, lignes } = dimensionsGrille();
    const carte = window.CARTES_REGIONALES[etat.ouverte];
    const n = carte && carte.usure;
    if (!n || n.colonnes !== colonnes || n.lignes !== lignes) return new Uint8Array(colonnes * lignes);
    return window.decoderGrilleNuages(n.cases, colonnes * lignes);
}
// LE CALQUE DU PINCEAU : l'usure du parchemin (v283). Les nuages, l'autre
// calque d'avant, sont retirés (v286).
const CALQUES = ["usure"];
function brouillonDu(calque) {
    if (calque === etat.calque) return { brouillon: etat.brouillon, modifie: etat.brouillonModifie };
    return etat.reserve[calque] || { brouillon: null, modifie: false };
}
function oublierBrouillon(calque) {
    if (calque === etat.calque) { etat.brouillon = null; etat.brouillonModifie = false; }
    else delete etat.reserve[calque];
}
window.grilleNuagesRegion = () => null;      // plus de nuages régionaux (v286)
window.grilleUsureRegion = () => (etat.ouverte ? (brouillonDu("usure").brouillon || grilleEnregistree()) : null);
window.calqueCarteRegion = () => etat.calque;
window.choisirCalqueRegion = function(calque) {
    if (!etat.ouverte || !estDev() || !CALQUES.includes(calque)) return etat.calque;
    if (calque !== etat.calque) {
        etat.reserve[etat.calque] = { brouillon: etat.brouillon, modifie: etat.brouillonModifie };
        const autre = etat.reserve[calque] || { brouillon: null, modifie: false };
        delete etat.reserve[calque];
        etat.calque = calque;
        etat.brouillon = autre.brouillon; etat.brouillonModifie = autre.modifie;
    }
    dessinerPeinture();
    actualiserDev();
    return etat.calque;
};

// LE BORD DE PARCHEMIN de la carte ouverte (bords_parchemin.js) : l'usure
// enregistrée — ou, pendant que le DEV peint l'usure, son brouillon en aperçu
// (`apercu`, pas gardé).
function poserBord(apercu) {
    if (!window.BordsParchemin || !etat.ouverte || !etat.largeur) return null;
    const carte = window.CARTES_REGIONALES[etat.ouverte];
    const brouillon = brouillonDu("usure");
    const enApercu = !!apercu && brouillon.modifie && !!brouillon.brouillon;
    const zones = enApercu ? Object.assign(dimensionsGrille(), { cases: brouillon.brouillon }) : (carte && carte.usure) || null;
    const graine = typeof window.graineParcheminRegion === "function" ? window.graineParcheminRegion(etat.ouverte) : etat.ouverte;
    return window.BordsParchemin.appliquer($("carte-region"), { graine, aspect: etat.largeur / etat.hauteur, cote: 2048,
                                                               apres: $("carte-region-image"), zones, provisoire: enApercu })
        .catch(e => { console.error("Bord de parchemin :", e); return null; });
}
window.poserBordCarteRegion = poserBord;
// L'aperçu suit le pinceau d'usure, un instant après chaque trait.
let apercuEnAttente = null;
function demanderApercuBord() {
    if (apercuEnAttente) clearTimeout(apercuEnAttente);
    apercuEnAttente = setTimeout(() => { apercuEnAttente = null; if (etat.calque === "usure" && etat.brouillonModifie) poserBord(true); }, 350);
}

// Le pinceau (ou la gomme) passe de `a` à `b` (en pixels de l'image).
function peindre(a, b) {
    if (!etat.ouverte || !etat.outil) return;
    const { colonnes, lignes } = dimensionsGrille();
    if (!etat.brouillon) etat.brouillon = grilleEnregistree(etat.calque);
    const cellule = etat.largeur / colonnes;
    const rayon = etat.taillePinceau / etat.zoom;          // le rayon en pixels de l'image
    const valeur = etat.outil === "pinceau" ? 1 : 0;
    const pas = Math.max(1, rayon / 2);
    const longueur = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(longueur / pas));
    for (let k = 0; k <= n; k++) {
        const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n;
        const c0 = Math.max(0, Math.floor((x - rayon) / cellule)), c1 = Math.min(colonnes - 1, Math.floor((x + rayon) / cellule));
        const l0 = Math.max(0, Math.floor((y - rayon) / cellule)), l1 = Math.min(lignes - 1, Math.floor((y + rayon) / cellule));
        for (let l = l0; l <= l1; l++) for (let c = c0; c <= c1; c++) {
            if (Math.hypot((c + 0.5) * cellule - x, (l + 0.5) * cellule - y) <= rayon) etat.brouillon[l * colonnes + c] = valeur;
        }
    }
    etat.brouillonModifie = true;
    dessinerPeinture();
    actualiserDev();
}
// Pour les bancs (et un futur outil) : peindre en un point de l'écran.
window.peindreCarteRegion = function(x, y, x2, y2) {
    peindre(pointImage(x, y), pointImage(x2 === undefined ? x : x2, y2 === undefined ? y : y2));
    if (etat.calque === "usure") demanderApercuBord();
};

// Les zones rouges, semi-transparentes : la grille du brouillon, agrandie
// (lissée) sur toute l'image. Visibles tant qu'un outil est en main ou qu'un
// brouillon attend d'être validé.
function dessinerPeinture() {
    const toile = $("carte-region-peinture");
    if (!toile || !etat.ouverte) return;
    toile.dataset.calque = etat.calque;
    const visible = estDev() && (!!etat.outil || etat.brouillonModifie);
    toile.style.display = visible ? "block" : "none";
    if (!visible) return;
    const { colonnes, lignes } = dimensionsGrille();
    const grille = etat.brouillon || grilleEnregistree();
    // L'usure du parchemin, en orange brûlé.
    const teinte = [236, 118, 18];
    const petite = document.createElement("canvas");
    petite.width = colonnes; petite.height = lignes;
    const img = petite.getContext("2d").createImageData(colonnes, lignes);
    for (let i = 0; i < grille.length; i++) {
        if (!grille[i]) continue;
        img.data[i * 4] = teinte[0]; img.data[i * 4 + 1] = teinte[1]; img.data[i * 4 + 2] = teinte[2]; img.data[i * 4 + 3] = 125;
    }
    petite.getContext("2d").putImageData(img, 0, 0);
    // Agrandie trois fois en douceur : un bord lisse, pas un escalier de cases.
    toile.width = colonnes * 3; toile.height = lignes * 3;
    const ctx = toile.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
    ctx.drawImage(petite, 0, 0, toile.width, toile.height);
}

window.choisirOutilRegion = function(outil) {
    if (!etat.ouverte || !estDev()) return null;
    etat.outil = etat.outil === outil ? null : (outil === "pinceau" || outil === "gomme" ? outil : null);
    if (etat.outil && etat.editionTitre) window.basculerEditionTitreRegion(false);
    dessinerPeinture();
    actualiserDev();
    return etat.outil;
};
window.outilCarteRegion = () => etat.outil;
window.reglerTaillePinceauRegion = function(v) {
    etat.taillePinceau = borne(Number(v) || 50, 6, 200);
    return etat.taillePinceau;
};
// Valide l'usure peinte (Usure). Le nom vient des nuages, d'avant v286.
window.validerNuagesRegion = async function() {
    if (!etat.ouverte || !etat.brouillon) return false;
    const { colonnes, lignes } = dimensionsGrille();
    const grille = { colonnes, lignes, cases: window.encoderGrilleNuages(etat.brouillon) };
    const champ = "Usure";
    const carte = window.CARTES_REGIONALES[etat.ouverte];
    carte.usure = grille;
    fichesBase[etat.ouverte] = Object.assign({}, fichesBase[etat.ouverte], { [champ]: grille });
    etat.brouillon = null; etat.brouillonModifie = false; etat.outil = null;
    poserBord();
    dessinerPeinture();
    actualiserDev();
    return enregistrerFiche(etat.ouverte, { [champ]: grille });
};
window.validerPeintureRegion = window.validerNuagesRegion;
window.annulerNuagesRegion = function() {
    if (!etat.ouverte) return false;
    const apercu = etat.calque === "usure" && etat.brouillonModifie;
    etat.brouillon = null; etat.brouillonModifie = false;
    if (apercu) poserBord();
    dessinerPeinture();
    actualiserDev();
    return true;
};

// =========================================================================
//  PLUS DE NUAGES SUR LES CARTES RÉGIONALES (v286)
// =========================================================================
//  Nico : « enlève-moi le bouton pour faire les nuages dans les maps
//  régionales, et enlève-moi tous les nuages des maps régionales. En nuages,
//  on garde juste ceux des transitions d'une map à l'autre. » Les zones
//  peintes avant (Cartes_Regionales/{n}.Nuages) restent en base, ignorées :
//  rien ne s'y cache plus, ni village ni lieu.

// =========================================================================
//  LE TITRE
// =========================================================================
function poserTitre() {
    const el = $("carte-region-titre");
    const carte = etat.ouverte && window.CARTES_REGIONALES[etat.ouverte];
    if (!el || !carte) return;
    el.querySelector(".carte-region-titre-texte").textContent = carte.nom;
    el.style.left = (carte.titre.x * etat.largeur) + "px";
    el.style.top = (carte.titre.y * etat.hauteur) + "px";
    el.style.fontSize = (carte.titre.taille * etat.hauteur) + "px";
    el.classList.toggle("edition", etat.editionTitre);
}
function suivreTitre(dxEcran, dyEcran) {
    const carte = window.CARTES_REGIONALES[etat.ouverte];
    if (!carte || !geste) return;
    if (geste.type === "titre") {
        carte.titre.x = borne(geste.depart.x + dxEcran / etat.zoom / etat.largeur, 0, 1);
        carte.titre.y = borne(geste.depart.y + dyEcran / etat.zoom / etat.hauteur, 0, 1);
    } else {
        // Le carré du coin haut droit : vers la droite ou vers le haut, plus grand.
        const delta = (dxEcran - dyEcran) / etat.zoom / etat.hauteur;
        carte.titre.taille = borne(geste.depart.taille + delta * 0.6, 0.015, 0.4);
    }
    poserTitre();
}
window.basculerEditionTitreRegion = function(oui) {
    if (!etat.ouverte) return false;
    const voulu = typeof oui === "boolean" ? oui : !etat.editionTitre;
    if (voulu === etat.editionTitre) return voulu;
    etat.editionTitre = voulu && estDev();
    if (etat.editionTitre && etat.outil) { etat.outil = null; dessinerPeinture(); }
    poserTitre();
    actualiserDev();
    // EN SORTANT DU MODE : on enregistre (Nico).
    if (!etat.editionTitre) {
        const carte = window.CARTES_REGIONALES[etat.ouverte];
        const titre = { x: Math.round(carte.titre.x * 10000) / 10000, y: Math.round(carte.titre.y * 10000) / 10000,
                        taille: Math.round(carte.titre.taille * 10000) / 10000 };
        fichesBase[etat.ouverte] = Object.assign({}, fichesBase[etat.ouverte], { Titre: titre });
        enregistrerFiche(etat.ouverte, { Titre: titre });
    }
    return etat.editionTitre;
};

// =========================================================================
//  LA POPUP DEV (le bouton rouge du bas)
// =========================================================================
//  Sur la carte du monde : les boîtes (regions_carte.js). Sur une carte
//  régionale : ses outils à elle.
function actualiserDev() {
    const monde = $("regions-dev-monde"), region = $("regions-dev-carte");
    const ouverte = !!etat.ouverte;
    if (monde) monde.style.display = ouverte ? "none" : "block";
    if (region) region.style.display = ouverte ? "block" : "none";
    const titrePopup = $("regions-dev-titre");
    if (titrePopup) titrePopup.textContent = ouverte ? "Carte régionale" : "Régions de la carte";
    if (!ouverte) return;
    const carte = window.CARTES_REGIONALES[etat.ouverte];
    const nom = $("regions-dev-carte-nom");
    if (nom) nom.textContent = `${carte.numero} · ${carte.nom}`;
    const pinceau = $("btn-region-pinceau"), gomme = $("btn-region-gomme");
    if (pinceau) pinceau.classList.toggle("actif", etat.outil === "pinceau");
    if (gomme) gomme.classList.toggle("actif", etat.outil === "gomme");
    const valider = $("btn-region-valider-nuages"), annuler = $("btn-region-annuler-nuages");
    CALQUES.forEach(c => {
        const b = $(`btn-region-calque-${c}`);
        if (b) { b.classList.toggle("actif", etat.calque === c); b.setAttribute("aria-pressed", etat.calque === c ? "true" : "false"); }
    });
    const aide = $("aide-calque-usure");
    if (aide) aide.style.display = etat.calque === "usure" ? "block" : "none";
    if (pinceau) pinceau.title = "Pinceau : peindre où le parchemin peut brûler, se déchirer, se percer";
    if (valider) valider.textContent = "Valider l'usure";
    if (valider) valider.disabled = !etat.brouillonModifie;
    if (annuler) annuler.disabled = !etat.brouillonModifie;
    const caseTitre = $("case-region-titre");
    if (caseTitre) caseTitre.checked = etat.editionTitre;
    const taille = $("taille-pinceau-region");
    if (taille && Number(taille.value) !== etat.taillePinceau) taille.value = String(etat.taillePinceau);
    const vue = $("vue-carte-region");
    if (vue) {
        vue.classList.toggle("outil-pinceau", etat.outil === "pinceau");
        vue.classList.toggle("outil-gomme", etat.outil === "gomme");
    }
    if (typeof window.actualiserDevVillages === "function") window.actualiserDevVillages();
}
window.actualiserDevCarteRegionale = actualiserDev;

// --- AU CHARGEMENT ---------------------------------------------------------
(function demarrer() {
    composerCartes();
    window.ACTIONS_REGIONS = window.ACTIONS_REGIONS || {};
    // Chaque boîte de la liste de Nico ouvre sa carte (ou annonce qu'elle est
    // à venir) : regions_carte.js joue l'action au clic, hors édition.
    Object.keys(window.CARTES_REGIONALES_DEFAUT).forEach(n => {
        window.ACTIONS_REGIONS[n] = (numero) => window.ouvrirCarteRegionale(numero);
    });
    const lancer = () => {
        construireVue();
        if (typeof window.dessinerRegions === "function") window.dessinerRegions();
        // Le mode DEV change : la popup suit, et on lâche les outils.
        const avant = window.actualiserRegionsDev;
        if (typeof avant === "function" && !avant.__cartesRegionales) {
            const enveloppe = function() {
                const r = avant.apply(this, arguments);
                if (!estDev()) {
                    if (etat.editionTitre) window.basculerEditionTitreRegion(false);
                    etat.outil = null;
                    dessinerPeinture();
                } else semerFichesManquantes();
                actualiserDev();
                return r;
            };
            enveloppe.__cartesRegionales = true;
            window.actualiserRegionsDev = enveloppe;
        }
        actualiserDev();
        const ecouter = () => {
            try {
                onSnapshot(collection(db, COLLECTION), (snap) => {
                    const liste = [];
                    snap.forEach(d => liste.push({ id: d.id, data: d.data() }));
                    window.appliquerCartesRegionalesDeLaBase(liste, { depuisCache: !!(snap.metadata && snap.metadata.fromCache) });
                }, (e) => console.error("Cartes régionales :", e));
            } catch (e) { console.error("Cartes régionales :", e); }
        };
        if (window.PorteJoueur) window.PorteJoueur.quand(ecouter); else ecouter();
        let attente = null;
        window.addEventListener("resize", () => {
            if (attente || !etat.ouverte) return;
            attente = requestAnimationFrame(() => { attente = null; cadrer(true); });
        });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lancer);
    else lancer();
})();
