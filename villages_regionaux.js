// =========================================================================
//  IVALIS — LES VILLAGES DES CARTES RÉGIONALES (v273) — MIA_VILLAGE
// =========================================================================
//  Nico : « générer de manière aléatoire des villages fixes sur la map
//  régionale. Quand on clique sur générer, ça met des pastilles rouges
//  semi-transparentes carrées, que l'on peut déplacer comme on veut. Quand on
//  valide : découpe de l'image en un carré (de la taille de la pastille),
//  envoyé à une nouvelle IA comme référence, qui dessine au centre, dans le
//  style de la map, un petit village antique, sans toucher aux bords — l'image
//  sera mise par-dessus la carte, au même endroit, pour donner l'illusion
//  qu'on a dessiné sur la map. Les villages sont aussi créés en lieux dans la
//  base, avec un nom, une description… qui respectent le lore. »
//
//  LES PASTILLES (DEV, popup du bouton rouge, sur une carte régionale) : un
//  nombre, « Générer les villages » ; chaque pastille tombe au hasard, loin
//  des bords et des autres villages ; on la déplace en la
//  glissant, son carré du coin haut droit règle sa taille.
//
//  LA CRÉATION (« Valider »), village après village, sous un grand
//  « Patientez » :
//    1. MIA_VILLAGE (le texte, Gemini) invente le village d'après le lore de la
//       région (lore_ivalis.js) : nom, description, sécurité, peuple, et ce
//       qu'on en voit d'en haut (en anglais, pour le dessin) ;
//    2. le carré est découpé dans l'image de la carte, agrandi à 1024 ;
//    3. MIA_VILLAGE (le dessin, OpenAI en retouche, qualité « low ») dessine le
//       village au centre, un masque lui laissant le cœur du carré ;
//    4. LES BORDS NE BOUGENT PAS : le modèle redessine toujours tout le carré.
//       On ne garde donc que son centre, en fondu vers des bords entièrement
//       transparents (la carte d'origine s'y voit telle quelle), et ses
//       couleurs sont accordées à celles de la carte autour (une couronne
//       mesurée des deux côtés) : pas de raccord visible ;
//    5. le calque part sur Cloudinary ; le lieu entre en base (Monde_Lieux),
//       rattaché à sa carte et à sa place.
//
//  EN JEU : le calque est posé sur la carte (plus de nuages régionaux pour le
//  cacher, v286) ; le survol dit son nom. En DEV, un clic le choisit — entouré
//  à la main, en rouge (v286) : « Redessiner » (même village, nouveau dessin)
//  ou « Supprimer ».
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import {
    collection, doc, onSnapshot, setDoc, deleteDoc, query, where
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const COLLECTION_LIEUX = "Monde_Lieux";
// v281 (Nico : « réduis par deux la taille des carrés des villages et POI…
// et le dessin dans le carré doit prendre plus de place, pour ne pas perdre
// en taille ») : 4 % au lieu de 8 %, et le dessin occupe le carré presque
// entier (MASQUE_DESSIN) au lieu de son centre.
const TAILLE_DEFAUT = 0.04;          // le côté d'une pastille, en part de la hauteur de la carte
const TAILLE_MIN = 0.02, TAILLE_MAX = 0.3;
const MASQUE_DESSIN = 0.86;          // jusqu'où le modèle peint (distance « carrée arrondie » au centre)
const CALQUE_PLEIN = 0.8, CALQUE_FONDU = 0.97;   // le calque : plein, puis fondu vers le bord
const MAX_PAR_LOT = 12;
const COTE_IA = 1024;                // le carré envoyé au dessin
const QUALITE_DESSIN = "low";        // Nico : « mets le low pour commencer »
const DOSSIER_CLOUDINARY = "Villages_Regions";
const SVG_NS = "http://www.w3.org/2000/svg";
const SECURITES = ["Inconnue", "Faible", "Moyenne", "Élevée", "Cauchemar"];

const $ = (id) => document.getElementById(id);
const estDev = () => { try { return localStorage.getItem("ivalis_DEV_MODE") === "on"; } catch (e) { return false; } };
const borne = (v, min, max) => Math.max(min, Math.min(max, v));
const lisse = (a, b, x) => { const t = borne((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const clic = () => { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); };
const attendre = (ms) => new Promise(r => setTimeout(r, ms));
const carteOuverte = () => (typeof window.carteRegionaleOuverte === "function" ? window.carteRegionaleOuverte() : null);
const cadrage = () => (typeof window.cadrageCarteRegion === "function" ? window.cadrageCarteRegion() : null);

// --- L'ÉTAT ---------------------------------------------------------------
//  Toutes les positions en parts de l'image : x, y le CENTRE (part de la
//  largeur, de la hauteur), taille le CÔTÉ (part de la hauteur).
let pastilles = [];        // { id, x, y, taille }
let villages = {};         // id → { id, numero, nom, description, securite, peuple, visuel, x, y, taille, calque }
let selection = null;      // le village choisi (DEV)
let enCours = false;
let numeroPastille = 1;
window.VILLAGES_REGIONAUX = villages;
window.pastillesVillages = () => pastilles.map(p => ({ ...p }));
window.creationVillagesEnCours = () => enCours;

// --- LES VILLAGES DE LA BASE ---------------------------------------------
function lireVillage(id, d) {
    const pos = d.Position_Region || {};
    return { id, numero: Number(d.Carte_Regionale), nom: d.Nom_Du_Lieu || "Village", description: d.Description_Global || "",
             securite: d.Niveau_De_Securite || "Inconnue", peuple: d.Peuple_Dominant || "", visuel: d.Visuel_Village || "",
             x: Number(pos.x), y: Number(pos.y), taille: Number(pos.taille), calque: d.URL_Calque_Region || "",
             // Un calque d'avant v281 : son dessin au milieu d'un carré deux fois plus grand.
             plein: !!d.Calque_Plein,
             type: d.Type_Lieu || "Village", image: d.URL_Cloudinary || "" };
}
// Ce que l'écoute (ou un banc) reçoit : [{ id, data }].
window.appliquerVillagesDeLaBase = function(liste) {
    Object.keys(villages).forEach(k => delete villages[k]);
    (liste || []).forEach(({ id, data }) => {
        const v = data && lireVillage(id, data);
        if (v && v.numero > 0 && Number.isFinite(v.x) && Number.isFinite(v.y) && v.taille > 0) villages[id] = v;
    });
    if (selection && !villages[selection]) selection = null;
    dessiner();
    suivreBulleDuLieu();
};
// Un lieu tout juste créé sur ce poste (un POI, v277) : sur la carte sans
// attendre l'écoute.
window.appliquerLieuLocal = function(id, data) {
    const v = data && lireVillage(id, data);
    if (!v || !(v.numero > 0) || !Number.isFinite(v.x) || !(v.taille > 0)) return null;
    villages[id] = v;
    dessiner();
    suivreBulleDuLieu();
    return v;
};
// La bulle du chat montre l'image du lieu où est le groupe : elle suit
// l'illustration d'un POI, qui arrive après le lieu (v277).
function suivreBulleDuLieu() {
    // Les lieux ont changé : qui les montre (le voyage, son POI) suit.
    try { window.dispatchEvent(new CustomEvent("villages-regionaux-maj")); } catch (e) { /* vieux navigateur */ }
    const lieu = window.PARTIE_DATA && window.PARTIE_DATA.Lieu_Actuel;
    const v = lieu && villages[lieu];
    if (v && v.image && v.image !== window.LIEU_ACTUEL_IMAGE && typeof window.mettreAJourBulleLieu === "function") window.mettreAJourBulleLieu(lieu);
}
const villagesDeLaCarte = (numero) => Object.values(villages).filter(v => v.numero === Number(numero));

// --- LES CALQUES ET LES PASTILLES À L'ÉCRAN --------------------------------
function calques() {
    const carte = $("carte-region");
    if (!carte) return {};
    let couche = $("carte-region-villages");
    if (!couche) {
        couche = document.createElement("div");
        couche.id = "carte-region-villages";
        couche.className = "carte-region-villages";
        // Sur l'image, sous tout le reste.
        const image = $("carte-region-image");
        carte.insertBefore(couche, image ? image.nextSibling : carte.firstChild);
    }
    let couchePastilles = $("carte-region-pastilles");
    if (!couchePastilles) {
        couchePastilles = document.createElement("div");
        couchePastilles.id = "carte-region-pastilles";
        couchePastilles.className = "carte-region-pastilles";
        // Au-dessus des villages ; le titre est au-dessus encore, sur son
        // propre calque (v285).
        carte.appendChild(couchePastilles);
    }
    return { couche, couchePastilles };
}
// La place d'un carré, en pixels de l'image. Un lieu d'avant v281 (plein
// false) ne montre que le centre de son calque, à la même échelle : son carré
// est deux fois plus petit, son dessin garde sa taille.
const coteAffiche = (o) => (o.plein === false ? o.taille / 2 : o.taille);
window.coteAfficheLieu = coteAffiche;
function boite(o, c) {
    const cote = coteAffiche(o) * c.hauteur;
    return { gauche: o.x * c.largeur - cote / 2, haut: o.y * c.hauteur - cote / 2, cote };
}
function dessiner() {
    const numero = carteOuverte();
    const { couche, couchePastilles } = calques();
    if (!couche) return;
    const c = cadrage();
    couche.innerHTML = "";
    couchePastilles.innerHTML = "";
    if (!numero || !c || !c.largeur) { actualiserDev(); return; }
    const dev = estDev();
    couche.classList.toggle("dev", dev);
    villagesDeLaCarte(numero).forEach(v => {
        const b = boite(v, c);
        const el = document.createElement("div");
        el.className = "village-region" + (selection === v.id ? " selectionne" : "");
        el.dataset.id = v.id;
        Object.assign(el.style, { left: b.gauche + "px", top: b.haut + "px", width: b.cote + "px", height: b.cote + "px" });
        if (v.calque) {
            const img = document.createElement("img");
            img.className = "village-calque" + (v.plein ? "" : " ancien");
            img.alt = "";
            img.draggable = false;
            img.src = v.calque;
            el.appendChild(img);
        }
        el.appendChild(etiquette(v, b.cote));
        // Entouré à la main, en rouge (v286) : en train de se tracer, tracé, ou qui s'efface.
        if (selection === v.id) el.appendChild(cercleMain(v, b.cote, traitSelection, "trace", debutTrait));
        else if (sortante && sortante.id === v.id) el.appendChild(cercleMain(v, b.cote, sortante.trait, "efface", sortante.debut));
        brancherVillage(el, v);
        couche.appendChild(el);
    });
    if (dev) {
        pastilles.forEach(p => {
            const b = boite(p, c);
            const el = document.createElement("div");
            el.className = "pastille-village";
            el.dataset.id = p.id;
            Object.assign(el.style, { left: b.gauche + "px", top: b.haut + "px", width: b.cote + "px", height: b.cote + "px" });
            el.innerHTML = `<span class="pastille-village-poignee" title="Agrandir ou rétrécir"></span>`;
            brancherPastille(el, p);
            couchePastilles.appendChild(el);
        });
    }
    actualiserDev();
}
window.dessinerVillagesRegion = dessiner;

// LE NOM DU LIEU, sous son dessin (v281). Nico : « en écriture marron foncé,
// style plume sur parchemin, le nom du lieu en arc de cercle inversé sur le
// bas de l'image, en petit ; pour l'arc, des variations aléatoires, qui vont
// jusqu'à écrire droit ». La courbure vient du nom du lieu (toujours la même
// pour lui) : de l'arc franc à la ligne droite.
function hacher(texte) {
    let h = 2166136261;
    for (const ch of String(texte)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
}
function courbureEtiquette(id) {
    const u = (hacher(id) % 1000) / 1000;
    return Math.max(0, u * 1.3 - 0.3);           // un sur quatre environ : droit
}
window.courbureEtiquetteLieu = courbureEtiquette;
function etiquette(v, cote) {
    // Assez large pour tout le nom (le long d'un chemin, ce qui dépasse ne
    // s'écrit pas) ; le creux de l'arc, au milieu, reste mesuré.
    const police = cote * 0.24;
    const largeur = Math.max(cote * 2.6, police * (0.56 * Array.from(String(v.nom || "")).length + 1.4));
    // v286 — Nico : « le nom des lieux plus vers le haut, afin qu'il soit dans
    // la partie basse du carré de découpe de l'image générée » : le creux de
    // l'arc tombe à 93 % du carré, ses bouts restent dans le bas (arc plus doux).
    const fleche = Math.min(courbureEtiquette(v.id) * largeur * 0.16, cote * 0.16);
    const base = police * 1.05, hauteur = base + fleche + police * 0.45;
    const haut = cote * 0.93 - base - fleche;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "village-nom");
    svg.setAttribute("viewBox", `0 0 ${largeur} ${hauteur}`);
    svg.setAttribute("aria-hidden", "true");
    Object.assign(svg.style, { left: ((cote - largeur) / 2) + "px", top: haut + "px", width: largeur + "px", height: hauteur + "px" });
    const idChemin = "arc-nom-" + String(v.id).replace(/[^a-zA-Z0-9_-]/g, "_");
    // Un arc « inversé » (∪) : les bouts remontent, le milieu descend.
    svg.innerHTML = `<defs><path id="${idChemin}" d="M ${largeur * 0.04} ${base} Q ${largeur / 2} ${base + 2 * fleche} ${largeur * 0.96} ${base}"/></defs>`
        + `<text class="village-nom-texte" font-size="${police}"><textPath href="#${idChemin}" xlink:href="#${idChemin}" startOffset="50%" text-anchor="middle"></textPath></text>`;
    svg.querySelector("textPath").textContent = v.nom || "";
    return svg;
}

// LA SÉLECTION D'UN LIEU (v286). Nico : « un rond, un ovale imparfait rouge,
// comme si on avait entouré à la main sur la carte ; quand on sélectionne un
// lieu, le bruit d'une plume qui entoure quelque chose sur un parchemin ; quand
// on clique ailleurs sur la map, la sélection disparaît en fondu ». Le trait
// fait un peu plus d'un tour, ne se referme pas tout à fait, son rayon ondule ;
// il se trace à l'écran (le temps du bruit de plume), une fois.
let traitSelection = 0;                 // change à chaque sélection : un nouveau geste
let debutTrait = 0;                     // quand le cercle du lieu choisi a commencé à se tracer
let sortante = null;                    // { id, trait, debut } : le cercle qui s'efface
const DUREE_FONDU_SELECTION_MS = 520;
// `etat` : "trace" (il se trace, puis reste) ou "efface" ; `debut` : quand ça a
// commencé — un dessin de la carte entre-temps reprend l'animation où elle en est.
function cercleMain(v, cote, trait, etat, debut) {
    const h = hacher(v.id + ":" + trait);
    const alea = (k) => ((Math.imul(h ^ (k * 2654435761), 1597334677) >>> 0) % 10000) / 10000;
    const cx = cote / 2, cy = cote * 0.52, rx = cote * 0.68, ry = cote * 0.6;
    const depart = -Math.PI * (0.55 + 0.3 * alea(1)), tour = Math.PI * 2 * (1.08 + 0.1 * alea(2));
    const p1 = alea(3) * 6.3, p2 = alea(4) * 6.3, incline = (alea(5) - 0.5) * 0.25;
    const pts = [], N = 72;
    for (let i = 0; i <= N; i++) {
        const f = i / N, a = depart + tour * f;
        const r = 1 + 0.045 * Math.sin(2 * a + p1) + 0.03 * Math.sin(3 * a + p2) + 0.07 * (f - 0.5);
        const x = Math.cos(a) * rx * r, y = Math.sin(a) * ry * r;
        pts.push([cx + x * Math.cos(incline) - y * Math.sin(incline), cy + x * Math.sin(incline) + y * Math.cos(incline)]);
    }
    let longueur = 0;
    for (let i = 1; i < pts.length; i++) longueur += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "village-cercle" + (etat ? " " + etat : ""));
    const marge = cote * 0.5;
    svg.setAttribute("viewBox", `${-marge} ${-marge} ${cote + 2 * marge} ${cote + 2 * marge}`);
    Object.assign(svg.style, { left: -marge + "px", top: -marge + "px", width: (cote + 2 * marge) + "px", height: (cote + 2 * marge) + "px" });
    const chemin = document.createElementNS(SVG_NS, "path");
    chemin.setAttribute("d", "M " + pts.map(p => p[0].toFixed(2) + " " + p[1].toFixed(2)).join(" L "));
    chemin.setAttribute("stroke-width", (cote * 0.045).toFixed(2));
    chemin.style.strokeDasharray = longueur.toFixed(1);
    chemin.style.strokeDashoffset = etat === "trace" ? longueur.toFixed(1) : "0";
    svg.style.animationDelay = chemin.style.animationDelay = (-Math.max(0, performance.now() - (debut || 0))).toFixed(0) + "ms";
    svg.appendChild(chemin);
    return svg;
}

// Le survol dit le nom (comme les lieux de la carte du monde) ; en DEV, un
// clic choisit le village.
function brancherVillage(el, v) {
    el.addEventListener("pointerenter", (e) => {
        if (typeof window.afficherTooltipLieu !== "function") return;
        window.afficherTooltipLieu(v.nom, v.image || "", e);
    });
    el.addEventListener("pointermove", (e) => { if (typeof window.deplacerTooltipLieu === "function") window.deplacerTooltipLieu(e); });
    el.addEventListener("pointerleave", () => { if (typeof window.masquerTooltipLieu === "function") window.masquerTooltipLieu(); });
    // En DEV, l'appui est au village (la carte capturerait sinon le pointeur,
    // et le clic n'arriverait jamais) : relâché sans avoir bougé, il le choisit.
    el.addEventListener("pointerdown", (e) => {
        // Le mode voyage (ou le téléport) choisit le village : pas la sélection DEV.
        if (enCours || (typeof window.modeChoixCarte === "function" && window.modeChoixCarte())) return;
        if (!estDev()) {
            // En jeu, un toucher sur un lieu qui a son image l'ouvre (v277) ; la
            // carte glisse toujours (on ne retient pas le doigt).
            if (v.image) appuiApercu = { id: v.id, x: e.clientX, y: e.clientY };
            return;
        }
        e.stopPropagation();
        appuiVillage = { id: v.id, x: e.clientX, y: e.clientY };
    });
}
let appuiVillage = null, appuiApercu = null;
window.addEventListener("pointerup", (e) => {
    if (appuiApercu) {
        const a = appuiApercu;
        appuiApercu = null;
        if (Math.hypot(e.clientX - a.x, e.clientY - a.y) <= 6 && villages[a.id]) window.afficherApercuLieu(villages[a.id]);
    }
    if (!appuiVillage) return;
    const a = appuiVillage;
    appuiVillage = null;
    if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > 6) return;
    window.selectionnerVillageRegion(selection === a.id ? null : a.id);
});
// L'APERÇU D'UN LIEU (v277) : son image en grand, son nom et son type ; un
// toucher le ferme.
window.afficherApercuLieu = function(v) {
    let el = $("apercu-lieu");
    if (!el) {
        el = document.createElement("div");
        el.id = "apercu-lieu";
        el.className = "apercu-lieu";
        el.innerHTML = `<figure class="apercu-lieu-cadre"><img class="apercu-lieu-image" alt=""><figcaption><span class="apercu-lieu-nom"></span><span class="apercu-lieu-type"></span></figcaption></figure>`;
        el.addEventListener("click", () => { el.classList.remove("visible"); });
        document.body.appendChild(el);
    }
    if (!v) { el.classList.remove("visible"); return false; }
    el.querySelector(".apercu-lieu-image").src = v.image || "";
    el.querySelector(".apercu-lieu-nom").textContent = v.nom || "";
    el.querySelector(".apercu-lieu-type").textContent = v.type || "";
    el.classList.add("visible");
    if (typeof window.masquerTooltipLieu === "function") window.masquerTooltipLieu();
    return true;
};
window.selectionnerVillageRegion = function(id) {
    const avant = selection;
    selection = id && villages[id] ? id : null;
    if (selection === avant) { dessiner(); return selection; }
    // L'ancien cercle s'efface en fondu ; le nouveau se trace, au bruit de la plume.
    sortante = avant && villages[avant] ? { id: avant, trait: traitSelection, debut: performance.now() } : null;
    if (selection) {
        traitSelection++;
        debutTrait = performance.now();
        if (typeof window.jouerSonEvenement === "function") window.jouerSonEvenement("plume-entoure");
    }
    dessiner();
    if (sortante) {
        const s = sortante;
        setTimeout(() => { if (sortante === s) { sortante = null; dessiner(); } }, DUREE_FONDU_SELECTION_MS + 40);
    }
    return selection;
};
// Un toucher ailleurs sur la carte (pas sur un lieu), sans glisser : la
// sélection s'efface en fondu (v286).
let appuiAilleurs = null;
window.addEventListener("pointerdown", (e) => {
    appuiAilleurs = null;
    if (!selection || !carteOuverte()) return;
    const vue = $("vue-carte-region");
    if (!vue || !e.target || !vue.contains(e.target) || (e.target.closest && e.target.closest(".village-region, .pastille-village"))) return;
    appuiAilleurs = { x: e.clientX, y: e.clientY };
});
window.addEventListener("pointerup", (e) => {
    const a = appuiAilleurs;
    appuiAilleurs = null;
    if (a && selection && Math.hypot(e.clientX - a.x, e.clientY - a.y) <= 6) window.selectionnerVillageRegion(null);
});

// --- LES GESTES DES PASTILLES ----------------------------------------------
//  Elles prennent le doigt avant la carte (qui glisserait sinon).
let geste = null;
function brancherPastille(el, p) {
    el.addEventListener("pointerdown", (e) => {
        if (enCours) return;
        e.stopPropagation();
        e.preventDefault();
        const poignee = e.target.classList.contains("pastille-village-poignee");
        geste = { id: p.id, type: poignee ? "taille" : "deplacer", x: e.clientX, y: e.clientY, depart: { ...p } };
    });
}
window.addEventListener("pointermove", (e) => {
    if (!geste) return;
    const p = pastilles.find(q => q.id === geste.id), c = cadrage();
    if (!p || !c) { geste = null; return; }
    e.preventDefault();
    const dx = (e.clientX - geste.x) / c.zoom, dy = (e.clientY - geste.y) / c.zoom;
    if (geste.type === "deplacer") {
        p.x = geste.depart.x + dx / c.largeur;
        p.y = geste.depart.y + dy / c.hauteur;
    } else {
        // Le carré du coin haut droit : vers la droite ou vers le haut, plus grand.
        p.taille = borne(geste.depart.taille + (dx - dy) / c.hauteur, TAILLE_MIN, TAILLE_MAX);
    }
    garderDansLaCarte(p, c);
    dessiner();
});
const lacher = () => { geste = null; };
window.addEventListener("pointerup", lacher);
window.addEventListener("pointercancel", lacher);
// Un carré reste entier sur la carte : la découpe ne sortira jamais de l'image.
function garderDansLaCarte(p, c) {
    const demiX = p.taille * c.hauteur / 2 / c.largeur, demiY = p.taille / 2;
    p.taille = Math.min(p.taille, c.largeur / c.hauteur, 1);
    p.x = borne(p.x, demiX, 1 - demiX);
    p.y = borne(p.y, demiY, 1 - demiY);
}

// --- LE TIRAGE DES PASTILLES -------------------------------------------------
//  Au hasard, à distance des bords et des autres carrés
//  (villages et pastilles) — un carré qui n'y arrive pas en 400 essais est
//  laissé de côté.
window.genererPastillesVillages = function(nombre, alea) {
    const numero = carteOuverte(), c = cadrage();
    if (!numero || !c || !estDev() || enCours) return [];
    const tirer = alea || Math.random;
    const n = borne(Math.round(Number(nombre) || 0), 0, MAX_PAR_LOT);
    const occupes = () => [...villagesDeLaCarte(numero), ...pastilles].map(o => boite(o, c));
    const chevauche = (b) => occupes().some(o => b.gauche < o.gauche + o.cote * 1.15 && o.gauche < b.gauche + b.cote * 1.15
                                                && b.haut < o.haut + o.cote * 1.15 && o.haut < b.haut + b.cote * 1.15);
    const posees = [];
    for (let i = 0; i < n; i++) {
        const taille = TAILLE_DEFAUT, cote = taille * c.hauteur, marge = cote / 2 + 0.03 * c.hauteur;
        for (let essai = 0; essai < 400; essai++) {
            const x = marge + tirer() * Math.max(0, c.largeur - 2 * marge), y = marge + tirer() * Math.max(0, c.hauteur - 2 * marge);
            const p = { id: "P" + (numeroPastille++), x: x / c.largeur, y: y / c.hauteur, taille };
            const b = boite(p, c);
            if (chevauche(b)) continue;
            pastilles.push(p);
            posees.push(p);
            break;
        }
    }
    dessiner();
    return posees.map(p => ({ ...p }));
};
window.retirerPastillesVillages = function() {
    if (enCours) return false;
    pastilles = [];
    dessiner();
    return true;
};

// =========================================================================
//  MIA_VILLAGE
// =========================================================================
function lireCles() {
    const l = (k) => { try { return (localStorage.getItem(k) || "").trim(); } catch (e) { return ""; } };
    return { gemini: l("ivalis_GEMINI_API_KEY"), openai: l("ivalis_OPENAI_API_KEY"), cloudName: l("ivalis_CLOUDINARY_CLOUD_NAME"),
             cloudKey: l("ivalis_CLOUDINARY_API_KEY"), cloudSecret: l("ivalis_CLOUDINARY_API_SECRET") };
}
const clesManquantes = (cles) => [["gemini", "Gemini"], ["openai", "OpenAI"], ["cloudName", "Cloudinary (nom)"],
    ["cloudKey", "Cloudinary (clé)"], ["cloudSecret", "Cloudinary (secret)"]].filter(([k]) => !cles[k]).map(([, nom]) => nom);

// 1. LE TEXTE : le village, d'après le lore de sa région.
function promptTexte(numero, nomsExistants) {
    const carte = (window.CARTES_REGIONALES || {})[numero] || {};
    const lore = typeof window.loreDeLaRegion === "function" ? window.loreDeLaRegion(numero) : "";
    return `Tu es MIA_VILLAGE, l'IA qui peuple les cartes régionales du monde d'Ivalis.

LE LORE (à respecter scrupuleusement) :
${lore}

La carte : « ${carte.nom || "région inconnue"} ».
Les lieux déjà posés sur cette carte : ${JSON.stringify(nomsExistants)}.

Ta mission : invente UN petit village antique de cette région, cohérent avec son lore (les peuples qui y vivent, leurs mœurs, les tensions, les factions).
Il doit être différent des lieux déjà posés (un autre nom, une autre identité).

Réponds OBLIGATOIREMENT avec un JSON valide, exactement dans ce format :
{
  "nom": "Le nom du village (sonorités antiques, sans article superflu)",
  "description": "Une description riche : atmosphère, architecture, peuple, métiers, croyances, ce qu'on y trouve, une tension ou une rumeur locale.",
  "securite": "Moyenne",
  "peuple": "Le peuple majoritaire du village",
  "visuel": "A very short ENGLISH description of what this village looks like seen from above on a map: its buildings, materials, layout and one notable feature. Physical elements only, no style words."
}
« securite » est un de : ${SECURITES.join(", ")}.`;
}
async function inventerVillage(cles, numero, nomsExistants) {
    const corps = {
        systemInstruction: { parts: [{ text: promptTexte(numero, nomsExistants) }] },
        contents: [{ role: "user", parts: [{ text: "Crée un nouveau village pour cette carte." }] }],
        generationConfig: { temperature: 0.95, responseMimeType: "application/json" }
    };
    const rep = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${cles.gemini}`,
                            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
    if (!rep.ok) throw new Error(`Gemini a répondu ${rep.status}`);
    const json = await rep.json();
    const texte = json && json.candidates && json.candidates[0] && json.candidates[0].content.parts[0].text;
    const v = JSON.parse(texte);
    if (!v || !v.nom) throw new Error("MIA_VILLAGE n'a pas rendu de village");
    return { nom: String(v.nom).trim(), description: String(v.description || "").trim(),
             securite: SECURITES.includes(v.securite) ? v.securite : "Inconnue",
             peuple: String(v.peuple || "").trim(), visuel: String(v.visuel || "a small ancient village").trim() };
}

// 2. LE CARRÉ, découpé dans l'image de la carte, agrandi au format du dessin.
async function decouper(urlImage, o) {
    const img = typeof window.chargerImageCarteRegionale === "function" ? await window.chargerImageCarteRegionale(urlImage) : null;
    if (!img) throw new Error("image de la carte introuvable");
    const H = img.naturalHeight, W = img.naturalWidth, cote = o.taille * H;
    const toile = document.createElement("canvas");
    toile.width = toile.height = COTE_IA;
    const ctx = toile.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, o.x * W - cote / 2, o.y * H - cote / 2, cote, cote, 0, 0, COTE_IA, COTE_IA);
    try { ctx.getImageData(0, 0, 1, 1); }
    catch (e) { throw new Error("l'image de la carte ne se laisse pas découper (CORS)"); }
    return { toile, cotePixels: cote };
}
// La distance « carrée arrondie » au centre : 0 au centre, 1 au milieu d'un bord.
const distanceCentre = (i, j, n) => {
    const dx = Math.abs((i + 0.5) / n * 2 - 1), dy = Math.abs((j + 0.5) / n * 2 - 1);
    return Math.pow(Math.pow(dx, 4) + Math.pow(dy, 4), 0.25);
};
// Le masque : transparent au cœur (le modèle y dessine), opaque autour.
function masqueCentre() {
    const n = COTE_IA, toile = document.createElement("canvas");
    toile.width = toile.height = n;
    const ctx = toile.getContext("2d"), img = ctx.createImageData(n, n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = (j * n + i) * 4;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = 0;
        img.data[k + 3] = distanceCentre(i, j, n) < MASQUE_DESSIN ? 0 : 255;
    }
    ctx.putImageData(img, 0, 0);
    return toile;
}
window.masqueCentreVillage = masqueCentre;
const enBlob = (toile) => new Promise((r) => toile.toBlob(b => r(b), "image/png"));

// 3. LE DESSIN (OpenAI, en retouche).
function promptImage(visuel, sujet) {
    return "This image is a square crop of a hand-painted fantasy region map. " +
        `Paint ${sujet || "a small ancient village"} in the CENTER of this image: ${visuel}. ` +
        "Match EXACTLY the existing art style of the map: the same painting technique, brush strokes, colors, lighting and texture, " +
        "and the same top-down, bird's-eye map perspective and scale as the surrounding terrain. " +
        "Make it fill most of the image, as large as the picture allows, leaving only a thin margin (about one tenth of the width) untouched on every side. " +
        "Do NOT modify, redraw or recolor anything near the borders: the edges must stay identical to the input image, " +
        "because this picture will be placed back over the map at the exact same position. " +
        "Blend it naturally into the terrain. No text, no labels, no border, no frame, no compass.";
}
window.promptImageVillage = promptImage;
async function dessinerVillage(cles, toileCarre, visuel, sujet) {
    const blobCarre = await enBlob(toileCarre), blobMasque = await enBlob(masqueCentre());
    const modeles = ["gpt-image-2", "gpt-image-1.5", "gpt-image-1"];
    const delais = [5000, 15000, 30000];
    let avecMasque = true, derniere = "";
    for (const modele of modeles) {
        for (let tentative = 0; tentative < 3; tentative++) {
            const form = new FormData();
            form.append("model", modele);
            form.append("prompt", promptImage(visuel, sujet));
            form.append("image[]", blobCarre, "carte.png");
            if (avecMasque) form.append("mask", blobMasque, "masque.png");
            form.append("n", "1");
            form.append("size", `${COTE_IA}x${COTE_IA}`);
            form.append("quality", QUALITE_DESSIN);
            form.append("output_format", "png");
            let statut = 0, texte = "";
            try {
                const rep = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { "Authorization": "Bearer " + cles.openai }, body: form });
                statut = rep.status; texte = await rep.text();
            } catch (e) { derniere = String(e); await attendre(delais[tentative]); continue; }
            derniere = texte.slice(0, 300);
            if (statut === 429 || texte.includes("Rate Limited")) { await attendre(delais[tentative]); continue; }
            // Un modèle qui refuse le masque : on le retire, on retente.
            if (statut === 400 && avecMasque && /mask/i.test(texte)) { avecMasque = false; tentative--; continue; }
            if (statut === 404 || texte.includes("model_not_found") || texte.includes("does not support")) break;
            let json = null;
            try { json = JSON.parse(texte); } catch (e) { /* réponse illisible */ }
            const b64 = json && json.data && json.data[0] && json.data[0].b64_json;
            if (b64) {
                const img = new Image();
                img.src = "data:image/png;base64," + b64;
                await img.decode();
                return img;
            }
            break;
        }
    }
    throw new Error("le dessin n'a pas abouti : " + derniere);
}

// 4. LE CALQUE : le centre du dessin, en fondu vers des bords transparents,
//    aux couleurs de la carte d'origine (mesurées sur une couronne).
window.composerCalqueVillage = function(dessin, toileCarre, coteFinal) {
    const n = COTE_IA;
    const lire = (source) => { const t = document.createElement("canvas"); t.width = t.height = n;
        const x = t.getContext("2d"); x.drawImage(source, 0, 0, n, n); return x.getImageData(0, 0, n, n); };
    const ia = lire(dessin), origine = toileCarre.getContext("2d").getImageData(0, 0, n, n);
    // L'accord des couleurs : la moyenne de la couronne (là où les deux images
    // doivent se rejoindre), canal par canal.
    const somme = [[0, 0, 0], [0, 0, 0]];
    let compte = 0;
    for (let j = 0; j < n; j += 2) for (let i = 0; i < n; i += 2) {
        const d = distanceCentre(i, j, n);
        if (d < MASQUE_DESSIN + 0.02 || d > 0.99) continue;
        const k = (j * n + i) * 4;
        for (let c = 0; c < 3; c++) { somme[0][c] += ia.data[k + c]; somme[1][c] += origine.data[k + c]; }
        compte++;
    }
    const gain = [0, 1, 2].map(c => compte && somme[0][c] > 0 ? borne(somme[1][c] / somme[0][c], 0.8, 1.25) : 1);
    const sortie = new ImageData(n, n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        const k = (j * n + i) * 4;
        for (let c = 0; c < 3; c++) sortie.data[k + c] = borne(Math.round(ia.data[k + c] * gain[c]), 0, 255);
        // Plein au centre, rien sur les bords : la carte d'origine y reste intacte.
        sortie.data[k + 3] = Math.round(255 * (1 - lisse(CALQUE_PLEIN, CALQUE_FONDU, distanceCentre(i, j, n))));
    }
    const grand = document.createElement("canvas");
    grand.width = grand.height = n;
    grand.getContext("2d").putImageData(sortie, 0, 0);
    const final = document.createElement("canvas");
    final.width = final.height = coteFinal;
    const ctx = final.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(grand, 0, 0, coteFinal, coteFinal);
    return { toile: final, gain };
};

// 5. CLOUDINARY (envoi signé, comme les autres MIA).
async function sha1(texte) {
    const tampon = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(texte));
    return Array.from(new Uint8Array(tampon)).map(b => b.toString(16).padStart(2, "0")).join("");
}
async function heberger(cles, toile) {
    const horodatage = Math.floor(Date.now() / 1000).toString();
    const form = new FormData();
    form.append("file", toile.toDataURL("image/png"));
    form.append("api_key", cles.cloudKey);
    form.append("timestamp", horodatage);
    form.append("folder", DOSSIER_CLOUDINARY);
    form.append("signature", await sha1(`folder=${DOSSIER_CLOUDINARY}&timestamp=${horodatage}${cles.cloudSecret}`));
    const rep = await fetch(`https://api.cloudinary.com/v1_1/${cles.cloudName}/image/upload`, { method: "POST", body: form });
    const json = await rep.json();
    if (!json || !json.secure_url) throw new Error("Cloudinary n'a pas accepté le calque");
    return json.secure_url.replace("/upload/", "/upload/q_auto,f_auto/");
}

// Le calque d'un carré : découpé, dessiné, composé, hébergé.
async function fabriquerCalque(cles, urlImage, o, visuel, sujet) {
    const { toile, cotePixels } = await decouper(urlImage, o);
    const dessin = await dessinerVillage(cles, toile, visuel, sujet);
    // Assez fin pour le zoom ×4 de la carte, sans dépasser le dessin.
    const coteFinal = Math.round(borne(cotePixels * 2, 256, COTE_IA));
    const { toile: calque } = window.composerCalqueVillage(dessin, toile, coteFinal);
    return heberger(cles, calque);
}

// LE CALQUE D'UN LIEU QUELCONQUE (v277, les POI, poi_creation.js) : la même
// fabrique, sur la carte d'une région qui n'est pas forcément ouverte.
window.fabriquerCalqueLieu = async function(o, visuel, sujet) {
    const c = lireCles();
    const manque = clesManquantes(c).filter(k => k !== "Gemini");
    if (manque.length) throw new Error("clés manquantes : " + manque.join(", "));
    const carte = (window.CARTES_REGIONALES || {})[Number(o.region)];
    if (!carte || !carte.image) throw new Error("pas d'image pour la carte " + o.region);
    const url = typeof window.urlImageCarteRegionale === "function" ? window.urlImageCarteRegionale(carte.image) : carte.image;
    return fabriquerCalque(c, url, o, visuel, sujet);
};

// --- LE GRAND « PATIENTEZ » ---------------------------------------------------
function attente(visible, texte, detail) {
    let voile = $("attente-villages");
    if (!voile) {
        voile = document.createElement("div");
        voile.id = "attente-villages";
        voile.className = "attente-villages";
        voile.innerHTML = `<div class="attente-villages-texte"></div><div class="attente-villages-detail"></div>`;
        document.body.appendChild(voile);
    }
    voile.style.display = visible ? "flex" : "none";
    if (texte !== undefined) voile.querySelector(".attente-villages-texte").textContent = texte;
    if (detail !== undefined) voile.querySelector(".attente-villages-detail").textContent = detail;
}
window.afficherAttenteVillages = attente;

function nouvelId(nom) {
    const n = Math.floor(Math.random() * 100000).toString().padStart(5, "0");
    return `L_${n}_${String(nom).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]/g, "_")}`;
}

// --- LA CRÉATION -------------------------------------------------------------
window.creerVillagesRegion = async function() {
    const numero = carteOuverte();
    if (!numero || !estDev() || enCours || pastilles.length === 0) return { crees: [], echecs: [] };
    const cles = lireCles();
    const manque = clesManquantes(cles);
    if (manque.length) { message(`Clés manquantes (Paramètres) : ${manque.join(", ")}`); return { crees: [], echecs: [], manque }; }
    const urlImage = typeof window.imageCarteRegionaleOuverte === "function" ? window.imageCarteRegionaleOuverte() : null;
    enCours = true;
    actualiserDev();
    const lot = pastilles.slice();
    const crees = [], echecs = [];
    attente(true, "Création des villages… Patientez", `Village 1 sur ${lot.length}`);
    for (let i = 0; i < lot.length; i++) {
        const p = lot[i];
        try {
            attente(true, "Création des villages… Patientez", `Village ${i + 1} sur ${lot.length} — MIA_VILLAGE imagine le village`);
            const noms = villagesDeLaCarte(numero).map(v => v.nom).concat(crees.map(v => v.nom));
            const v = await inventerVillage(cles, numero, noms);
            attente(true, "Création des villages… Patientez", `Village ${i + 1} sur ${lot.length} — MIA_VILLAGE dessine « ${v.nom} »`);
            const calque = await fabriquerCalque(cles, urlImage, p, v.visuel);
            const id = nouvelId(v.nom);
            const fiche = {
                Nom_Du_Lieu: v.nom, Description_Global: v.description, Niveau_De_Securite: v.securite,
                Peuple_Dominant: v.peuple, Visuel_Village: v.visuel, Type_Lieu: "Village",
                Reputations: {}, Stigmates: "", URL_Cloudinary: "",
                Carte_Regionale: Number(numero),
                Position_Region: { x: Math.round(p.x * 1e5) / 1e5, y: Math.round(p.y * 1e5) / 1e5, taille: Math.round(p.taille * 1e5) / 1e5 },
                URL_Calque_Region: calque, Calque_Plein: true
            };
            await setDoc(doc(db, COLLECTION_LIEUX, id), fiche);
            villages[id] = lireVillage(id, fiche);
            pastilles = pastilles.filter(q => q.id !== p.id);
            crees.push(villages[id]);
            dessiner();
        } catch (e) {
            console.error("[MIA_VILLAGE] Village " + (i + 1) + " :", e);
            echecs.push({ pastille: p.id, erreur: String(e && e.message || e) });
        }
    }
    enCours = false;
    attente(false);
    message(echecs.length === 0 ? `✔️ ${crees.length} village${crees.length > 1 ? "s" : ""} créé${crees.length > 1 ? "s" : ""}`
                                : `${crees.length} créé(s), ${echecs.length} échec(s) — les pastilles restées peuvent être revalidées`);
    dessiner();
    return { crees, echecs };
};

// Même village, nouveau dessin (le nom, la description, la place restent).
window.redessinerVillageRegion = async function(id) {
    const v = villages[id || selection];
    if (!v || !estDev() || enCours) return false;
    const cles = lireCles();
    const manque = clesManquantes(cles).filter(k => k !== "Gemini");
    if (manque.length) { message(`Clés manquantes (Paramètres) : ${manque.join(", ")}`); return false; }
    enCours = true;
    actualiserDev();
    attente(true, "Création des villages… Patientez", `MIA_VILLAGE redessine « ${v.nom} »`);
    try {
        // Un village d'avant v281 se redessine dans son nouveau carré (la moitié).
        const taille = Math.round(coteAffiche(v) * 1e5) / 1e5;
        const calque = await fabriquerCalque(cles, window.imageCarteRegionaleOuverte(), { ...v, taille }, v.visuel || "a small ancient village");
        await setDoc(doc(db, COLLECTION_LIEUX, v.id), { URL_Calque_Region: calque, Calque_Plein: true,
                                                        Position_Region: { x: v.x, y: v.y, taille } }, { merge: true });
        Object.assign(v, { calque, plein: true, taille });
        message(`✔️ « ${v.nom} » redessiné`);
        return true;
    } catch (e) {
        console.error("[MIA_VILLAGE] Redessin :", e);
        message("Le dessin n'a pas abouti : " + String(e && e.message || e).slice(0, 120));
        return false;
    } finally {
        enCours = false;
        attente(false);
        dessiner();
    }
};
window.supprimerVillageRegion = async function(id, options) {
    const v = villages[id || selection];
    if (!v || !estDev() || enCours) return false;
    if (!(options && options.sansConfirmer) && typeof window.confirm === "function"
        && !window.confirm(`Supprimer le village « ${v.nom} » ? Il disparaît de la carte et de la base.`)) return false;
    delete villages[v.id];
    if (selection === v.id) selection = null;
    dessiner();
    try { await deleteDoc(doc(db, COLLECTION_LIEUX, v.id)); }
    catch (e) { console.error("[MIA_VILLAGE] Suppression :", e); }
    return true;
};

// --- LA POPUP DEV ---------------------------------------------------------------
function message(texte) {
    const el = $("villages-dev-etat");
    if (el) el.textContent = texte || "";
}
let devVu = null;
function actualiserDev() {
    // Le mode DEV a basculé : les pastilles (DEV seulement) suivent.
    if (devVu !== null && devVu !== estDev()) { devVu = estDev(); dessiner(); return; }
    devVu = estDev();
    const numero = carteOuverte();
    const bloc = $("regions-dev-villages");
    if (!bloc) return;
    bloc.style.display = numero && estDev() ? "block" : "none";
    if (!numero) return;
    const nb = $("villages-dev-pastilles");
    if (nb) nb.textContent = pastilles.length ? `${pastilles.length} pastille${pastilles.length > 1 ? "s" : ""} à valider` : "";
    const valider = $("btn-valider-villages"), retirer = $("btn-retirer-pastilles"), generer = $("btn-generer-villages");
    if (valider) { valider.disabled = enCours || pastilles.length === 0; valider.textContent = pastilles.length > 1 ? `Créer ces ${pastilles.length} villages` : "Créer ce village"; }
    if (retirer) retirer.disabled = enCours || pastilles.length === 0;
    if (generer) generer.disabled = enCours;
    const v = selection && villages[selection];
    const info = $("villages-dev-selection");
    if (info) info.textContent = v ? `« ${v.nom} »${v.peuple ? " · " + v.peuple : ""} · ${v.securite}` : `${villagesDeLaCarte(numero).length} village(s) sur cette carte — un clic en choisit un`;
    const redessiner = $("btn-village-redessiner"), supprimer = $("btn-village-supprimer");
    if (redessiner) redessiner.disabled = enCours || !v;
    if (supprimer) supprimer.disabled = enCours || !v;
}
window.actualiserDevVillages = actualiserDev;

// --- AU CHARGEMENT ---------------------------------------------------------------
(function demarrer() {
    // La carte s'ouvre ou se ferme : ses villages viennent avec elle ; les
    // pastilles d'une autre carte n'ont rien à faire sur celle-ci.
    window.addEventListener("carte-regionale", (e) => {
        if (!(e.detail && e.detail.ouverte)) { pastilles = []; selection = null; sortante = null; }
        if (typeof window.masquerTooltipLieu === "function") window.masquerTooltipLieu();
        dessiner();
    });
    window.addEventListener("resize", () => { if (carteOuverte()) requestAnimationFrame(dessiner); });
    const ecouter = () => {
        try {
            const q = query(collection(db, COLLECTION_LIEUX), where("Carte_Regionale", "in", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]));
            onSnapshot(q, (snap) => {
                const liste = [];
                snap.forEach(d => liste.push({ id: d.id, data: d.data() }));
                window.appliquerVillagesDeLaBase(liste);
            }, (e) => console.error("Villages des cartes régionales :", e));
        } catch (e) { console.error("Villages des cartes régionales :", e); }
    };
    if (window.PorteJoueur) window.PorteJoueur.quand(ecouter); else ecouter();
})();
