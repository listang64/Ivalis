// =========================================================================
//  IVALIS — LE DÉPLACEMENT DES PJ (v275)
// =========================================================================
//  Nico : « supprimer le système de déplacement actuel du groupe sur la map,
//  et la génération de lieux à l'arrivée. Sur la map du monde, seulement
//  l'image du groupe, au centre de la box de clic de la région. Sur les cartes
//  régionales, un marqueur du groupe. Un bouton voyage, en haut à côté du
//  bouton pour déplier le menu, de la même taille : celui qui clique ouvre le
//  mode voyage, sur la map du monde ou la carte régionale. »
//
//  LE MONDE : une croix rouge et un trait pointillé rouge, droit (façon carte
//  d'Indiana Jones), puis on valide. Tous les joueurs reçoivent une petite
//  boîte de vote en haut à droite, et leur vue se centre sur le trajet. Si
//  tous sont d'accord, l'image du groupe glisse lentement jusqu'à la
//  destination. Un changement de région ne compte aucun jour.
//
//  LA RÉGION : pareil, mais le pointillé fait des courbes au hasard (des
//  routes compliquées), et reste sur le terrain praticable
//  (terrains_regionaux.js) ; un village cliqué est la destination exacte (le
//  Lieu_Actuel à l'arrivée). La marche prend du temps : à chaque nuit, le
//  groupe s'arrête le long de sa route. « JOUR 1 » au départ, puis à chaque
//  reprise ; à chaque nuit, chacun choisit de repartir ou de rester ici, et
//  rien ne se passe tant que tous ne sont pas d'accord. Chaque nuit avance la
//  date en jeu d'un jour (au matin, quand la nuit est finie).
//
//  LE CHAT : nettoyé au départ de chaque voyage et à chaque « Repartir »
//  (nettoyerChatVoyage, ia_master.js : sans rien d'écrit par les joueurs, pas
//  d'IA, on efface seulement). Le cimetière des PNJ, tous les 4 voyages. Le
//  Destin pose le message du campement à chaque nuit ; le narrateur n'est pas
//  réveillé.
//
//  LA BASE (Systeme_Parties/{partie}) :
//    · Position_Groupe { Region, x, y } — la boîte de la carte du monde, et
//      la place sur sa carte régionale (fractions de l'image) ;
//    · Voyage_Groupe — le voyage en cours : { Id, Type "monde"|"region",
//      Etat "vote"|"marche"|"nuit", Initiateur, Votants, Votes, Depart,
//      Arrivee, Trace, Aspect, Longueur, Jours, Etapes, Jour, Debut_Marche,
//      Duree_Marche_Ms, Delai_Depart_Ms, Camp, Choix_Nuit } ;
//    · Voyages_Effectues — le compteur du cimetière ; Voyage_Annule, le
//      dernier refus (qui l'a dit).
//  Chaque étape se joue en transaction : deux postes ne font jamais avancer
//  le même voyage deux fois. La marche est jouée par chaque poste ; le
//  premier qui la finit fait avancer le voyage (camp, ou arrivée).
//
//  LES RÉGLAGES (Carte_Monde/Groupe, DEV, pour toutes les parties) :
//  Taille_Monde (en pixels de la carte du monde), Taille_Region (en part de
//  la hauteur de la carte régionale).
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import {
    doc, collection, onSnapshot, setDoc, updateDoc, addDoc, deleteField, runTransaction
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const IMAGE_GROUPE_MONDE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1792842687/B713FC3C-F7B3-4C38-B3DA-4040AC5D34F3_bfvzfg.png";
const IMAGE_GROUPE_REGION = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1792842655/41915054-FA63-4BFF-AEB0-6D95E07E47AA_xtlhvg.png";
const IMAGE_BOUTON_VOYAGE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1792843931/IMG_2196_ds54xr.png";

const LARGEUR_MONDE = 3840, HAUTEUR_MONDE = 2160;
const TAILLE_MONDE_DEFAUT = 150;       // pixels de la carte du monde
const TAILLE_REGION_DEFAUT = 0.07;     // part de la hauteur de la carte régionale
const BORNES_MONDE = [40, 600], BORNES_REGION = [0.02, 0.25];
// Une journée de marche : 20 % de la hauteur d'une carte régionale (Nico,
// v276 : « de 45 % mets plutôt 30 % » ; v281 : « pour le temps de marche
// avant la nuit, passe à 20 % »).
const DISTANCE_JOUR = 0.20;
window.DISTANCE_JOUR_VOYAGE = DISTANCE_JOUR;
const TOLERANCE_JOUR = 0.1;            // un trajet de 1,05 jour se fait en un jour
const MARCHE_JOUR_MS = 5200;           // le temps d'écran d'une journée de marche
const MARCHE_MIN_MS = 1600;
const DELAI_JOUR_MS = 1900;            // « JOUR 2 » s'affiche, puis on part
const DELAI_MONDE_MS = 500;
const DESSIN_TRACE_MS = { monde: 1400, region: 1800 };
const POINTS_CHEMIN = 72;
const SEUIL_TAP = 8;                   // pixels d'écran : au-delà, c'est un glissé
const CIMETIERE_TOUS_LES = 4;          // Nico : « on peut garder le cimetière tous les 4 voyages »
const JOURS_PAR_AN = 365;
const AUTEUR_DESTIN = { Auteur_ID: "DESTIN", Auteur_Nom: "Destin", Auteur_Couleur: "#c2a878" };
const MESSAGE_CAMPEMENT = [
    "Après plusieurs heures de marche, vous décidez de vous arrêter pour passer la nuit au cœur de la nature. Le campement est désormais installé, les affaires rangées et les tentes dressées. Au centre du camp, un feu crépite doucement, diffusant sa chaleur réconfortante tandis que les dernières lueurs du jour disparaissent derrière l'horizon. La nuit s'installe peu à peu, enveloppant les environs d'un calme presque irréel. Seuls le bruissement des feuilles, les sons lointains de la faune nocturne et le crépitement des flammes viennent troubler le silence. La lumière dansante du feu projette des ombres mouvantes sur les alentours, tandis que l'obscurité dissimule peu à peu ce qui se trouve au-delà de votre petit refuge.",
    "Vous disposez désormais d'un moment de répit avant de reprendre votre route. Certains d'entre vous peuvent profiter de cette pause pour se reposer, d'autres pour discuter, préparer le repas, monter la garde ou s'occuper de leur équipement.",
    "La soirée vous appartient. Que souhaitez-vous faire ?"
];
window.MESSAGE_CAMPEMENT_VOYAGE = MESSAGE_CAMPEMENT.join("<br><br>");

const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";
const estDev = () => { try { return localStorage.getItem("ivalis_DEV_MODE") === "on"; } catch (e) { return false; } };
const idJoueur = () => { try { return localStorage.getItem("ID_JOUEUR_COURANT") || "INVITE"; } catch (e) { return "INVITE"; } };
const borne = (v, min, max) => Math.max(min, Math.min(max, v));
const arrondi = (v, k = 10000) => Math.round(v * k) / k;
const attendre = (ms) => new Promise(r => setTimeout(r, ms));
const clic = () => { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); };
const carteOuverte = () => (typeof window.carteRegionaleOuverte === "function" ? window.carteRegionaleOuverte() : null);
const cadrageRegion = () => (typeof window.cadrageCarteRegion === "function" ? window.cadrageCarteRegion() : null);
const mouvementReduit = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ecranJeuVisible = () => { const e = $("ecran-jeu"); return !!(e && e.style.display !== "none" && getComputedStyle(e).display !== "none"); };
const refPartie = () => doc(db, "Systeme_Parties", window.ID_PARTIE_COURANTE);
const refDate = () => doc(db, "Date_En_Jeu", "actuelle");
const refReglages = () => doc(db, "Carte_Monde", "Groupe");

// --- L'ÉTAT DE CE POSTE ----------------------------------------------------
let partie = {};               // la dernière lecture de la partie
let idPartieVue = null;
let derniereCle = null;
let voyage = null;             // Voyage_Groupe, ou null
let choix = null;              // le mode de ce poste : { type: "voyage"|"teleport", vue: "monde"|"region", region, proposition }
let anim = null;               // la marche jouée à l'écran
let minuteurEtape = null;
let rafAnim = null;
const vus = new Set();         // les voyages déjà montrés (on n'amène qu'une fois sur la carte)
const etapesVues = new Set();  // « JOUR k » déjà annoncé
const annulationsVues = new Set();
// decalageMonde, decalageRegion (v281) : où tombe l'image du groupe par
// rapport à sa place exacte, en parts de sa largeur (0, 0 : centrée dessus).
const reglages = { tailleMonde: TAILLE_MONDE_DEFAUT, tailleRegion: TAILLE_REGION_DEFAUT, chancePoi: 0.5,
                   decalageMonde: { x: 0, y: 0 }, decalageRegion: { x: 0, y: 0 } };
const BORNES_DECALAGE = [-1.5, 1.5];
let reglagePion = false;       // DEV : la croix rouge et l'image qu'on glisse

// --- LA POSITION DU GROUPE -------------------------------------------------
// Ce que dit la base ; à défaut, le village où se trouve le groupe (un
// Lieu_Actuel posé sur une carte régionale, v273).
function positionEffective() {
    const p = partie && partie.Position_Groupe;
    if (p && Number(p.Region) > 0) {
        return { Region: Number(p.Region), x: Number.isFinite(Number(p.x)) && p.x !== null ? Number(p.x) : null,
                 y: Number.isFinite(Number(p.y)) && p.y !== null ? Number(p.y) : null };
    }
    const lieu = partie && partie.Lieu_Actuel;
    const v = lieu && window.VILLAGES_REGIONAUX && window.VILLAGES_REGIONAUX[lieu];
    if (v && v.numero > 0) return { Region: v.numero, x: v.x, y: v.y };
    return null;
}
// Sa place sur la carte régionale (le cœur du terrain si elle n'est pas dite).
function pointRegional(pos) {
    if (!pos) return null;
    if (pos.x !== null && pos.y !== null && Number.isFinite(pos.x) && Number.isFinite(pos.y)) return { x: pos.x, y: pos.y };
    return typeof window.centreTerrainRegion === "function" ? window.centreTerrainRegion(pos.Region) : { x: 0.5, y: 0.5 };
}
function centreMonde(numero) {
    const r = (window.REGIONS_CARTE || {})[numero];
    return r && typeof window.centreRegion === "function" ? window.centreRegion(r.points) : null;
}
const nomRegion = (n) => { const c = (window.CARTES_REGIONALES || {})[n]; return (c && c.nom) || `Région ${n}`; };
const aspectRegion = (n) => (typeof window.aspectCarteRegionale === "function" ? window.aspectCarteRegionale(n) : 1.6);
window.positionGroupe = () => { const p = positionEffective(); return p ? { ...p } : null; };

// --- LES TRACÉS ------------------------------------------------------------
// Une polyligne, et ses longueurs cumulées (dans l'espace donné).
function longueurs(points, asp) {
    const cumul = [0];
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        cumul.push(cumul[i - 1] + Math.hypot((b.x - a.x) * asp, b.y - a.y));
    }
    return cumul;
}
function pointA(points, asp, f) {
    if (!points || !points.length) return null;
    if (points.length === 1) return { ...points[0] };
    const cumul = longueurs(points, asp), total = cumul[cumul.length - 1] || 1;
    const cible = borne(f, 0, 1) * total;
    let i = 1;
    while (i < cumul.length - 1 && cumul[i] < cible) i++;
    const a = points[i - 1], b = points[i], l = (cumul[i] - cumul[i - 1]) || 1;
    const t = borne((cible - cumul[i - 1]) / l, 0, 1);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
// Le point de la trace d'un voyage, à une part de son chemin.
function pointDuVoyage(v, f) {
    if (!v || !Array.isArray(v.Trace)) return null;
    return pointA(v.Trace, v.Type === "region" ? (Number(v.Aspect) || 1) : 1, f);
}
window.pointDuVoyageGroupe = (f) => pointDuVoyage(voyage, f);

// Un hasard qu'on peut rejouer (les bancs).
let graineHasard = null;
function hasard() {
    if (graineHasard === null) return Math.random();
    graineHasard = (graineHasard * 1664525 + 1013904223) % 4294967296;
    return graineHasard / 4294967296;
}
window.graineHasardVoyage = (g) => { graineHasard = (g === null || g === undefined) ? null : (Number(g) >>> 0); };

// LA ROUTE COMPLIQUÉE (Nico) : la ligne droite, déformée par quelques
// ondulations au hasard (une grande courbe, des lacets plus petits), nulles
// aux deux bouts. On en tire plusieurs, de moins en moins tourmentées, et on
// garde la première qui reste sur le terrain praticable.
function genererChemin(n, A, B) {
    const asp = aspectRegion(n);
    const a = { x: A.x * asp, y: A.y }, b = { x: B.x * asp, y: B.y };
    const d = { x: b.x - a.x, y: b.y - a.y }, L0 = Math.hypot(d.x, d.y) || 1e-9;
    const nrm = { x: -d.y / L0, y: d.x / L0 };
    const avecTerrain = typeof window.terrainsDefinisRegion === "function" && window.terrainsDefinisRegion(n);
    const surTerrain = (p) => !avecTerrain || window.pointSurTerrainRegion(n, p.x, p.y);
    const AMPLITUDES = [0.2, 0.1, 0.055, 0.03];
    const HARMONIQUES = [1, 2, 3, 5];
    let meilleur = null;
    const ESSAIS = 36;
    for (let essai = 0; essai <= ESSAIS; essai++) {
        const force = essai === ESSAIS ? 0 : 1 - (essai / ESSAIS) * 0.85;
        const ondes = HARMONIQUES.map((k, i) => ({ k, a: (hasard() * 2 - 1) * AMPLITUDES[i] * force }));
        const lacet = { k: 9 + Math.floor(hasard() * 4), a: (hasard() * 2 - 1) * 0.012 * force };
        const pts = [];
        let dehors = 0;
        for (let i = 0; i <= POINTS_CHEMIN; i++) {
            const t = i / POINTS_CHEMIN;
            let ecart = ondes.reduce((s, o) => s + o.a * Math.sin(o.k * Math.PI * t), 0) + lacet.a * Math.sin(lacet.k * Math.PI * t);
            ecart *= L0;
            const p = { x: borne((a.x + d.x * t + nrm.x * ecart) / asp, 0, 1), y: borne(a.y + d.y * t + nrm.y * ecart, 0, 1) };
            if (i > 0 && i < POINTS_CHEMIN && !surTerrain(p)) dehors++;
            pts.push({ x: arrondi(p.x), y: arrondi(p.y) });
        }
        pts[0] = { x: arrondi(A.x), y: arrondi(A.y) };
        pts[pts.length - 1] = { x: arrondi(B.x), y: arrondi(B.y) };
        if (!meilleur || dehors < meilleur.dehors) meilleur = { pts, dehors };
        if (dehors === 0) break;
    }
    const cumul = longueurs(meilleur.pts, asp);
    return { trace: meilleur.pts, longueur: cumul[cumul.length - 1], aspect: asp, horsTerrain: meilleur.dehors };
}
window.genererCheminVoyage = genererChemin;
function joursDeMarche(longueur) {
    return Math.max(1, Math.ceil(longueur / DISTANCE_JOUR - TOLERANCE_JOUR));
}
window.joursDeMarcheVoyage = joursDeMarche;
// LE TRONÇON EN COURS (v277) : la marche d'une journée peut s'arrêter en
// chemin (un POI aperçu) et reprendre plus loin. Segment { de, a } en part de
// la trace ; par défaut, la journée entière — jusqu'au POI prévu, s'il y en a.
const journee = (v, k) => ({ de: k > 1 ? v.Etapes[k - 2] : 0, a: v.Etapes[k - 1] });
function troncon(v) {
    if (!v || v.Type !== "region") return { de: 0, a: 1 };
    const k = Number(v.Jour) || 1, j = journee(v, k);
    const s = v.Segment || {};
    const de = Number.isFinite(s.de) ? s.de : j.de;
    let a = Number.isFinite(s.a) ? s.a : j.a;
    if (v.Poi_Prevu && v.Poi_Prevu.f > de && v.Poi_Prevu.f < a) a = v.Poi_Prevu.f;
    return { de, a };
}
window.tronconVoyage = (v) => troncon(v || voyage);
function dureeMarche(v, de, a, delai) {
    if (v.Type === "monde") {
        const A = v.Trace[0], B = v.Trace[v.Trace.length - 1];
        return { delai: DELAI_MONDE_MS, duree: DELAI_MONDE_MS + borne(2600 + Math.hypot(B.x - A.x, B.y - A.y) * 1.5, 3500, 9000) };
    }
    const jours = ((a - de) * (Number(v.Longueur) || 0)) / DISTANCE_JOUR;
    return { delai, duree: delai + Math.round(MARCHE_MIN_MS + MARCHE_JOUR_MS * borne(jours, 0, 1.2)) };
}
// Le départ d'une journée k (le premier jour, ou après une nuit) : le POI de
// la journée est tiré à ce moment (planifierPoi), et la marche s'arrêtera là.
function lancerJournee(v, k) {
    const poi = v.Type === "region" ? planifierPoi(v, k) : null;
    const vv = { ...v, Jour: k, Segment: null, Poi_Prevu: poi };
    const t = troncon(vv);
    const { delai, duree } = dureeMarche(vv, t.de, t.a, DELAI_JOUR_MS);
    return { Etat: "marche", Jour: k, Debut_Marche: Date.now(), Duree_Marche_Ms: duree, Delai_Depart_Ms: delai, Poi_Prevu: poi, Segment: null };
}
function dureeEtape(v, k) {
    const j = v.Type === "region" ? journee(v, k) : { de: 0, a: 1 };
    return dureeMarche(v, j.de, j.a, DELAI_JOUR_MS);
}
window.dureeEtapeVoyage = dureeEtape;
// Des champs de Voyage_Groupe, à écrire en chemins pointés (null : effacé).
function champsVoyage(champs) {
    const maj = {};
    Object.entries(champs).forEach(([k, v]) => { maj["Voyage_Groupe." + k] = (v === null || v === undefined) ? deleteField() : v; });
    return maj;
}

// =========================================================================
//  LES POINTS D'INTÉRÊT (v277)
// =========================================================================
//  Nico : « en cours de chemin, quand le groupe est en déplacement local, des
//  POI peuvent apparaître (pourcentages aléatoires) : un point d'exclamation
//  jaune/doré dans un périmètre autour d'eux. La marche se met en pause, une
//  fenêtre propose d'aller voir (« il vous semble apercevoir quelque chose pas
//  très loin »). S'ils refusent, ils continuent et le POI disparaît ; sinon le
//  groupe s'y rend (un chemin aux légères ondulations), l'itinéraire initial
//  est maintenu. Pas trop près d'un lieu déjà sur la carte. »
//
//  LA CHANCE : CHANCE_POI_DEFAUT par journée de marche (Nico : 50 %),
//  réglable en DEV (Carte_Monde/Groupe.Chance_POI) ; au plus un par jour. Le
//  tirage se fait au départ de la journée (en transaction) : le moment, et la
//  place — à côté du groupe (RAYON_POI), sur le côté de la route, jamais plus
//  loin qu'elle ne mène le groupe (v287), sur le terrain praticable, assez
//  loin des lieux posés pour que les dessins ne se touchent pas.
//
//  LES ÉTATS : marche → poi (le vote : tous oui pour y aller, un non et l'on
//  passe son chemin) → detour (le chemin vers le POI ; le lieu se crée,
//  poi_creation.js) → ARRIVÉS (v281, Nico : « une fois arrivés, ils y sont :
//  pas besoin de demander s'ils veulent rester une fois le RP lancé ») : le
//  voyage s'achève au lieu (Voyage_Termine.Poi) ; le chat s'ouvre, le MJ
//  parle ; pour repartir, un nouveau voyage. Tant que le lieu se révèle :
//  halte, sans question. Un lieu qui n'a pas pu naître : halte, « Reprendre la
//  route » (retour : le même chemin, à l'envers, puis la fin de la journée — le
//  détour compte dans la journée) ou « Rester ici », tous d'accord.
// =========================================================================
const CHANCE_POI_DEFAUT = 0.5;
// v287 — Nico : « les POI doivent être à côté du chemin, et surtout du pion là
// où il est, et jamais après l'arrivée ». Tout près du groupe (du bord de son
// pion au bord du lieu), d'un côté ou de l'autre de la route — pas devant lui,
// et jamais plus loin sur la route que là où il s'arrête.
const RAYON_POI = [0.06, 0.085];      // en hauteurs de carte, autour du groupe
const RAYON_POI_MAX = 0.13;           // s'il faut s'écarter un peu (le terrain)
// À la halte, le groupe s'arrête au bord du lieu (pas dessus : son dessin se
// voit) : la part du détour où il reste un peu plus d'une demi-taille de lieu.
function arretDetour(v) {
    const L = Number(v && v.Poi && v.Poi.Longueur) || 0;
    return L > 0 ? borne(1 - (0.6 * taillePoi()) / L, 0.3, 0.95) : 0.8;
}
const DUREE_DETOUR_MS = [2600, 6000];
// La place de la halte : le bord du lieu, au bout du détour.
function placeHalte(v) {
    const n = Number(v.Arrivee && v.Arrivee.Region);
    return v.Poi && v.Poi.Detour ? pointA(v.Poi.Detour, aspectRegion(n), arretDetour(v)) : { x: v.Poi.x, y: v.Poi.y };
}
// ARRIVÉS AU LIEU (v281) : le voyage s'achève là. Chacun ouvre le chat ; le
// poste qui a créé le lieu réveille le MJ (Voyage_Termine.Poi, arriverAuPoi).
function arriveeAuLieu(v, place) {
    const n = Number(v.Arrivee && v.Arrivee.Region);
    return { Voyage_Groupe: deleteField(),
             Voyage_Termine: { Id: v.Id, Le: Date.now(), Poi: { Id: v.Poi.Id, Lieu: v.Poi.Lieu, Nom: v.Poi.Nom || "", Type: v.Poi.Type || "" } },
             Position_Groupe: { Region: n, x: arrondi(place.x), y: arrondi(place.y) },
             Lieu_Actuel: v.Poi.Lieu, Situation: situationDe(v.Poi.Lieu) };
}
const MESSAGES_ATTENTE_POI = [
    "Vous approchez prudemment, les sens aux aguets…",
    "Les contours du lieu se précisent peu à peu devant vous…",
    "Le vent porte des odeurs et des bruits encore indistincts…",
    "Quelque chose bouge, là-bas — ou n'est-ce que l'ombre des branches ?",
    "Vos pas se font plus lents ; chacun retient son souffle…"
];
const taillePoi = () => Number(window.TAILLE_POI) || 0.08;
// Plus de nuages sur les cartes régionales (v286) : rien ne s'y cache.
window.sousLesNuagesVoyage = () => false;
// Une place possible pour un POI : sur la carte, sur le terrain, loin des
// lieux posés.
function placePoiValable(n, x, y) {
    const asp = aspectRegion(n), t = taillePoi();
    // Un lieu d'avant v281 ne montre que le centre de son carré (la moitié).
    const cote = (v) => (Number(v.taille) || t) / (v.plein === false ? 2 : 1);
    const mx = t / (2 * asp) + 0.01, my = t / 2 + 0.01;
    if (x < mx || x > 1 - mx || y < my || y > 1 - my) return false;
    if (typeof window.terrainsDefinisRegion === "function" && window.terrainsDefinisRegion(n) && !window.pointSurTerrainRegion(n, x, y)) return false;
    return !Object.values(window.VILLAGES_REGIONAUX || {}).some(v => v.numero === n
        && Math.hypot((v.x - x) * asp, v.y - y) < (t + cote(v)) / 2 + t);
}
window.placePoiValable = placePoiValable;
function planifierPoi(v, k) {
    if (!v || v.Type !== "region") return null;
    const chance = Number.isFinite(reglages.chancePoi) ? reglages.chancePoi : CHANCE_POI_DEFAUT;
    if (!(hasard() < chance)) return null;
    const n = Number(v.Arrivee.Region), asp = Number(v.Aspect) || aspectRegion(n), j = journee(v, k);
    for (let essai = 0; essai < 60; essai++) {
        const f = j.de + (j.a - j.de) * (0.2 + 0.65 * hasard());
        const P = pointDuVoyage(v, f);
        // La route, là où est le groupe : sa direction (dans l'espace de la carte).
        const avant = pointDuVoyage(v, Math.max(0, f - 0.02)), apres = pointDuVoyage(v, Math.min(1, f + 0.02));
        const dx = (apres.x - avant.x) * asp, dy = apres.y - avant.y, l = Math.hypot(dx, dy) || 1;
        const cote = hasard() < 0.5 ? 1 : -1;
        // Sur le côté de la route : la perpendiculaire, penchée d'un peu en
        // avant (17°) à franchement en arrière (34°).
        const penche = hasard() * 0.9 - 0.3;
        const angle = Math.atan2(dy, dx) + cote * (Math.PI / 2 + penche);
        const ecart = essai < 40 ? RAYON_POI[0] + (RAYON_POI[1] - RAYON_POI[0]) * hasard() : RAYON_POI[1] + (RAYON_POI_MAX - RAYON_POI[1]) * hasard();
        const x = P.x + (ecart * Math.cos(angle)) / asp, y = P.y + ecart * Math.sin(angle);
        if (!placePoiValable(n, x, y)) continue;
        // JAMAIS APRÈS L'ARRIVÉE : le point de la route le plus proche du lieu
        // n'est pas plus loin que le groupe.
        if (partProcheDuVoyage(v, x, y, asp) > f + 0.01) continue;
        return { Id: "P" + Date.now().toString(36) + Math.floor(hasard() * 1e5).toString(36), f: arrondi(f), x: arrondi(x), y: arrondi(y) };
    }
    return null;
}
// La part de la route (0 au départ, 1 à l'arrivée) la plus proche d'un point.
function partProcheDuVoyage(v, x, y, asp) {
    let meilleure = 0, d = Infinity;
    for (let i = 0; i <= 200; i++) {
        const p = pointDuVoyage(v, i / 200), e = Math.hypot((p.x - x) * asp, p.y - y);
        if (e < d) { d = e; meilleure = i / 200; }
    }
    return meilleure;
}
window.partProcheDuVoyage = (x, y, v) => { const w = v || voyage || {};
    return partProcheDuVoyage(w, x, y, Number(w.Aspect) || aspectRegion(Number(w.Arrivee && w.Arrivee.Region))); };
window.planifierPoiVoyage = (v, k) => planifierPoi(v || voyage, k || (voyage && voyage.Jour) || 1);
// Le chemin vers le POI : de légères ondulations (Nico : « pas en ligne droite »).
function cheminDetour(v, poi) {
    const n = Number(v.Arrivee.Region), asp = Number(v.Aspect) || aspectRegion(n);
    const A = pointDuVoyage(v, poi.f), B = { x: poi.x, y: poi.y };
    const a = { x: A.x * asp, y: A.y }, b = { x: B.x * asp, y: B.y };
    const d = { x: b.x - a.x, y: b.y - a.y }, L0 = Math.hypot(d.x, d.y) || 1e-9, nrm = { x: -d.y / L0, y: d.x / L0 };
    const ondes = [1, 2, 3].map((k, i) => ({ k, a: (hasard() * 2 - 1) * [0.09, 0.05, 0.025][i] }));
    const pts = [];
    const N = 24;
    for (let i = 0; i <= N; i++) {
        const t = i / N, e = ondes.reduce((s, o) => s + o.a * Math.sin(o.k * Math.PI * t), 0) * L0;
        pts.push({ x: arrondi(borne((a.x + d.x * t + nrm.x * e) / asp, 0, 1)), y: arrondi(borne(a.y + d.y * t + nrm.y * e, 0, 1)) });
    }
    pts[0] = { x: arrondi(A.x), y: arrondi(A.y) };
    pts[N] = { x: arrondi(B.x), y: arrondi(B.y) };
    const cumul = longueurs(pts, asp);
    return { trace: pts, longueur: arrondi(cumul[cumul.length - 1]) };
}
function dureeDetour(poi) {
    return Math.round(borne(DUREE_DETOUR_MS[0] + (Number(poi.Longueur) || 0) / DISTANCE_JOUR * MARCHE_JOUR_MS, DUREE_DETOUR_MS[0], DUREE_DETOUR_MS[1]));
}
// Après le POI : la journée reprend là où le groupe a quitté sa route. Le
// détour (aller et retour) compte dans la journée ; ce qui reste de la route
// est redécoupé en journées.
function replanifierApresPoi(v) {
    const k = Number(v.Jour) || 1, j = journee(v, k), L = Number(v.Longueur) || 0, f = v.Poi.f;
    const budget = (j.a - j.de) * L, fait = (f - j.de) * L + 2 * (Number(v.Poi.Longueur) || 0);
    const reste = budget - fait;
    const avant = v.Etapes.slice(0, k - 1);
    const decouper = (de) => {
        if (de >= 1 - 1e-6) return [];
        const nb = joursDeMarche((1 - de) * L);
        return Array.from({ length: nb }, (_, i) => arrondi(de + (1 - de) * (i + 1) / nb));
    };
    if (reste <= 0.01 * DISTANCE_JOUR) {
        // La journée est mangée : la nuit tombe au retour sur la route.
        const etapes = avant.concat([arrondi(f)], decouper(f));
        return { nuit: true, Etapes: etapes, Jours: etapes.length };
    }
    const fin = Math.min(1, f + reste / (L || 1));
    const etapes = avant.concat([arrondi(fin)], fin < 1 ? decouper(fin) : []);
    return { nuit: false, fin: arrondi(fin), Etapes: etapes, Jours: etapes.length };
}
window.replanifierApresPoiVoyage = replanifierApresPoi;

// --- LES ÉCRITURES ---------------------------------------------------------
// Une transaction sur la partie (et la date en jeu, au besoin). `fn(data,
// date)` rend { maj, date, resultat } ou null (rien à faire).
async function transaction(fn, options) {
    if (!window.ID_PARTIE_COURANTE) return null;
    try {
        return await runTransaction(db, async (tx) => {
            const snap = await tx.get(refPartie());
            const data = snap && snap.exists() ? snap.data() : {};
            let date = null;
            if (options && options.avecDate) {
                const sd = await tx.get(refDate());
                date = sd && sd.exists() ? sd.data() : {};
            }
            const r = fn(data || {}, date);
            if (!r) return null;
            if (r.maj && Object.keys(r.maj).length) tx.update(refPartie(), r.maj);
            if (r.date) tx.set(refDate(), r.date, { merge: true });
            return r.resultat === undefined ? true : r.resultat;
        });
    } catch (e) {
        console.error("Voyage du groupe :", e);
        return null;
    }
}
window.transactionVoyageGroupe = transaction;
// Le lendemain de la date en jeu (Jour et Annee sont des textes en base).
function lendemain(date) {
    const ici = window.DATE_EN_JEU_ACTUELLE || {};
    let jour = parseInt(date && date.Jour) || parseInt(ici.jour) || 1;
    let annee = parseInt(date && date.Annee) || parseInt(ici.annee) || 1;
    jour += 1;
    while (jour > JOURS_PAR_AN) { jour -= JOURS_PAR_AN; annee += 1; }
    return { Jour: String(jour), Annee: String(annee) };
}
const memeVoyage = (v, id) => v && v.Id === id;
const votantsDe = (v) => (Array.isArray(v && v.Votants) ? v.Votants : []);
function nomDe(v, id) {
    const x = votantsDe(v).find(p => p.id === id);
    if (x) return x.nom;
    if (v && v.Initiateur && v.Initiateur.id === id) return v.Initiateur.nom;
    return (window.COMPTE_JOUEUR && window.COMPTE_JOUEUR.nom) || "Un joueur";
}
// Le départ : le voyage passe en marche (jour 1), le groupe quitte son lieu,
// et le compteur du cimetière avance.
function champsDepart(data, v, votes) {
    const numero = (Number(data.Voyages_Effectues) || 0) + 1;
    return {
        maj: {
            "Voyage_Groupe.Votes": votes,
            ...champsVoyage(lancerJournee(v, 1)),
            Voyages_Effectues: numero,
            Lieu_Actuel: "", Situation: SITUATION_NATURE
        },
        resultat: { demarre: true, lieuQuitte: data.Lieu_Actuel || "", numero }
    };
}

// LES JOUEURS QUI VOTENT : chaque joueur qui a un héros actif dans la partie
// (Nico : « 1. ok ») — et celui qui propose, même sans héros.
function votantsPartie() {
    const parJoueur = new Map();
    (window.PERSOS_JOUEURS_PARTIE || []).forEach(p => {
        if (!p || !p.idJoueur || p.estIllusion || p.estMonstre || p.actif === false || p.statut === "Mort") return;
        if (p.camp && p.camp !== "Allié") return;
        const l = parJoueur.get(p.idJoueur) || [];
        l.push(p.prenom || p.nom || "Héros");
        parJoueur.set(p.idJoueur, l);
    });
    const moi = idJoueur();
    if (!parJoueur.has(moi)) parJoueur.set(moi, [(window.COMPTE_JOUEUR && window.COMPTE_JOUEUR.nom) || "Le meneur"]);
    return [...parJoueur.entries()].map(([id, noms]) => ({ id, nom: noms.join(", ") }));
}
window.votantsVoyageGroupe = votantsPartie;

// PROPOSER : le voyage tracé part au vote. Celui qui propose vote oui ; seul,
// il part aussitôt.
window.proposerVoyageGroupe = async function(proposition) {
    const prop = proposition || (choix && choix.proposition);
    if (!prop) return null;
    if (bloqueParCombat()) { quitterChoix(); return { combat: true }; }
    const moi = idJoueur();
    const votants = votantsPartie();
    const v = {
        Id: "V" + Date.now().toString(36) + Math.floor(hasard() * 1e6).toString(36),
        Type: prop.type, Etat: "vote",
        Initiateur: { id: moi, nom: (votants.find(x => x.id === moi) || {}).nom || "Un joueur" },
        Votants: votants, Votes: { [moi]: "oui" },
        Depart: prop.depart, Arrivee: prop.arrivee, Trace: prop.trace,
        Aspect: prop.aspect || 1, Longueur: prop.longueur || 0,
        Jours: prop.jours || 0, Etapes: prop.etapes || [1], Jour: 1, Cree_Le: Date.now()
    };
    // Celui qui propose a déjà vu son tracé se dessiner : on ne le redessine pas.
    vus.add("trace:" + v.Id);
    const r = await transaction((data) => {
        const actuel = data.Voyage_Groupe;
        if (actuel && actuel.Etat) return { resultat: { occupe: true } };
        const maj = { Voyage_Groupe: v, Voyage_Annule: deleteField() };
        if (votants.every(x => v.Votes[x.id] === "oui")) {
            const numero = (Number(data.Voyages_Effectues) || 0) + 1;
            const depart = { ...v, ...lancerJournee(v, 1) };
            Object.keys(depart).forEach(k => { if (depart[k] === null) delete depart[k]; });
            return { maj: { ...maj, Voyage_Groupe: depart, Voyages_Effectues: numero, Lieu_Actuel: "", Situation: SITUATION_NATURE },
                     resultat: { demarre: true, lieuQuitte: data.Lieu_Actuel || "", numero } };
        }
        return { maj, resultat: { vote: true } };
    });
    if (r && r.occupe) { annoncer("Un voyage est déjà en cours."); return r; }
    if (!r) { annoncer("Le voyage n'a pas pu partir (connexion ?)."); return null; }
    quitterChoix();
    if (r.demarre) apresDepart(r);
    return r;
};

// VOTER : un « non » annule tout (Nico) ; le dernier « oui » donne le départ.
window.voterVoyageGroupe = async function(reponse) {
    const id = voyage && voyage.Id;
    if (!id) return null;
    if (reponse !== "non" && bloqueParCombat()) return { combat: true };
    const moi = idJoueur();
    const r = await transaction((data) => {
        const v = data.Voyage_Groupe;
        if (!memeVoyage(v, id) || v.Etat !== "vote") return null;
        if (!votantsDe(v).some(x => x.id === moi)) return null;
        const votes = { ...(v.Votes || {}), [moi]: reponse === "non" ? "non" : "oui" };
        if (votes[moi] === "non") {
            return { maj: { Voyage_Groupe: deleteField(), Voyage_Annule: { Id: id, Par: nomDe(v, moi), Le: Date.now() } }, resultat: { annule: true } };
        }
        if (votantsDe(v).every(x => votes[x.id] === "oui")) return champsDepart(data, v, votes);
        return { maj: { "Voyage_Groupe.Votes": votes }, resultat: { vote: true } };
    });
    clic();
    if (r && r.demarre) apresDepart(r);
    return r;
};
// FORCER (DEV) : le vote est tenu pour acquis.
window.forcerVoyageGroupe = async function() {
    const id = voyage && voyage.Id;
    if (!id || !estDev()) return null;
    if (bloqueParCombat()) return { combat: true };
    if (voyage.Etat === "nuit") return window.choisirNuitVoyageGroupe("repartir", { forcer: true });
    if (voyage.Etat === "poi") return window.voterPoiGroupe("oui", { forcer: true });
    if (voyage.Etat === "halte") return window.choisirHalteGroupe("reprendre", { forcer: true });
    const r = await transaction((data) => {
        const v = data.Voyage_Groupe;
        if (!memeVoyage(v, id) || v.Etat !== "vote") return null;
        const votes = { ...(v.Votes || {}) };
        votantsDe(v).forEach(x => { votes[x.id] = "oui"; });
        return champsDepart(data, v, votes);
    });
    clic();
    if (r && r.demarre) apresDepart(r);
    return r;
};

// LA CLÉ DE CE QUI SE JOUE À L'ÉCRAN : un tronçon de marche, un détour, un
// retour. Deux postes qui jouent la même chose ont la même clé.
function cleAnimation(v) {
    if (!v) return null;
    if (v.Etat === "marche") { const t = troncon(v); return `${v.Id}:m:${Number(v.Jour) || 1}:${t.de}:${t.a}`; }
    if ((v.Etat === "detour" || v.Etat === "retour") && v.Poi) return `${v.Id}:${v.Etat}:${v.Poi.Id}`;
    return null;
}
window.cleAnimationVoyage = (v) => cleAnimation(v || voyage);

// LA FIN D'UN TRONÇON : le premier poste qui a fini de le jouer fait avancer
// le voyage — le POI aperçu, le camp de la nuit, l'arrivée ; la halte au POI ;
// la reprise de la route.
async function terminerEtape(id, cle) {
    const r = await transaction((data) => {
        const v = data.Voyage_Groupe;
        if (!memeVoyage(v, id) || cleAnimation(v) !== cle) return null;
        const k = Number(v.Jour) || 1;
        const fini = { Voyage_Groupe: deleteField(), Voyage_Termine: { Id: id, Le: Date.now() } };
        if (v.Type === "monde") {
            const n = Number(v.Arrivee && v.Arrivee.Region);
            const dep = centreMonde(v.Depart && v.Depart.Region) || v.Trace[0];
            const arr = centreMonde(n) || v.Trace[v.Trace.length - 1];
            const spawn = typeof window.pointArriveeRegion === "function"
                ? window.pointArriveeRegion(n, { dx: dep.x - arr.x, dy: dep.y - arr.y }) : { x: 0.5, y: 0.5 };
            return { maj: { ...fini, Position_Groupe: { Region: n, x: arrondi(spawn.x), y: arrondi(spawn.y) }, Lieu_Actuel: "", Situation: SITUATION_NATURE },
                     resultat: { arrivee: true, region: n } };
        }
        const n = Number(v.Arrivee.Region);
        // Le détour s'achève au bord du lieu. Le lieu est né : on y est, le
        // voyage s'achève (v281). Sinon la halte, le temps qu'il se révèle.
        if (v.Etat === "detour") {
            const bord = placeHalte(v);
            if (v.Poi.Lieu) return { maj: arriveeAuLieu(v, bord), resultat: { arriveLieu: true } };
            return { maj: { ...champsVoyage({ Etat: "halte", Choix_Halte: {} }), Position_Groupe: { Region: n, x: arrondi(bord.x), y: arrondi(bord.y) } },
                     resultat: { halte: true } };
        }
        // Le retour sur la route : la journée reprend (ou la nuit tombe).
        if (v.Etat === "retour") {
            const plan = replanifierApresPoi(v);
            const ici = pointDuVoyage(v, v.Poi.f);
            const base = { Poi: null, Choix_Halte: null, Etapes: plan.Etapes, Jours: plan.Jours, Segment: null, Poi_Prevu: null };
            if (plan.nuit) {
                const c = { x: arrondi(ici.x), y: arrondi(ici.y) };
                return { maj: { ...champsVoyage({ ...base, Etat: "nuit", Camp: c, Choix_Nuit: {} }), Position_Groupe: { Region: n, x: c.x, y: c.y } },
                         resultat: { nuit: true, jour: k } };
            }
            const vv = { ...v, Etapes: plan.Etapes, Jours: plan.Jours, Segment: { de: v.Poi.f, a: plan.fin }, Poi_Prevu: null };
            const { delai, duree } = dureeMarche(vv, v.Poi.f, plan.fin, 300);
            return { maj: champsVoyage({ ...base, Etat: "marche", Segment: { de: v.Poi.f, a: plan.fin }, Debut_Marche: Date.now(),
                                         Duree_Marche_Ms: duree, Delai_Depart_Ms: delai }),
                     resultat: { reprise: true } };
        }
        // Un tronçon de marche s'achève sur le POI prévu : il apparaît.
        const t = troncon(v);
        if (v.Poi_Prevu && Math.abs(t.a - v.Poi_Prevu.f) < 1e-9) {
            const ici = pointDuVoyage(v, v.Poi_Prevu.f);
            return { maj: { ...champsVoyage({ Etat: "poi", Poi_Prevu: null, Segment: null,
                                              Poi: { Id: v.Poi_Prevu.Id, x: v.Poi_Prevu.x, y: v.Poi_Prevu.y, f: v.Poi_Prevu.f, Votes: {} } }),
                            Position_Groupe: { Region: n, x: arrondi(ici.x), y: arrondi(ici.y) } },
                     resultat: { poi: true } };
        }
        // La journée s'achève : la nuit, ou l'arrivée.
        if (k < (Number(v.Jours) || 1)) {
            const camp = pointDuVoyage(v, v.Etapes[k - 1]);
            const c = { x: arrondi(camp.x), y: arrondi(camp.y) };
            return { maj: { ...champsVoyage({ Etat: "nuit", Camp: c, Choix_Nuit: {}, Segment: null, Poi_Prevu: null }),
                            Position_Groupe: { Region: n, x: c.x, y: c.y } },
                     resultat: { nuit: true, jour: k } };
        }
        return { maj: { ...fini, Position_Groupe: { Region: n, x: arrondi(v.Arrivee.x), y: arrondi(v.Arrivee.y) }, Lieu_Actuel: v.Arrivee.Lieu || "",
                        Situation: situationDe(v.Arrivee.Lieu) },
                 resultat: { arrivee: true, region: n, lieu: v.Arrivee.Lieu || "" } };
    });
    if (r && r.nuit) posterMessageCampement();
    if (r && (r.nuit || r.arrivee)) analyserLeTerrain();
    return r;
}
window.terminerEtapeVoyageGroupe = terminerEtape;

// LE VOTE DU POI : tous oui pour y aller ; un non, et l'on passe son chemin
// (le POI disparaît). Le DEV force.
window.voterPoiGroupe = async function(reponse, options) {
    const id = voyage && voyage.Id, poiId = voyage && voyage.Poi && voyage.Poi.Id;
    if (!id || !poiId) return null;
    if (bloqueParCombat()) return { combat: true };
    const moi = idJoueur();
    const forcer = !!(options && options.forcer) && estDev();
    const createur = typeof window.peutCreerPoi === "function" && window.peutCreerPoi();
    const r = await transaction((data) => {
        const v = data.Voyage_Groupe;
        if (!memeVoyage(v, id) || v.Etat !== "poi" || !v.Poi || v.Poi.Id !== poiId) return null;
        const votants = votantsDe(v);
        if (!forcer && !votants.some(x => x.id === moi)) return null;
        const votes = { ...(v.Poi.Votes || {}) };
        if (forcer) votants.forEach(x => { votes[x.id] = "oui"; }); else votes[moi] = reponse === "non" ? "non" : "oui";
        if (!forcer && votes[moi] === "non") {
            // On passe son chemin : la fin de la journée.
            const k = Number(v.Jour) || 1, j = journee(v, k);
            const vv = { ...v, Segment: { de: v.Poi.f, a: j.a }, Poi_Prevu: null };
            const { delai, duree } = dureeMarche(vv, v.Poi.f, j.a, 300);
            return { maj: champsVoyage({ Etat: "marche", Poi: null, Segment: { de: v.Poi.f, a: j.a }, Debut_Marche: Date.now(),
                                         Duree_Marche_Ms: duree, Delai_Depart_Ms: delai, Poi_Ignore: { Id: poiId, Par: nomDe(v, moi) } }),
                     resultat: { ignore: true } };
        }
        if (!votants.every(x => votes[x.id] === "oui")) return { maj: { "Voyage_Groupe.Poi.Votes": votes }, resultat: { vote: true } };
        const detour = cheminDetour(v, v.Poi);
        const poi = { ...v.Poi, Votes: votes, Detour: detour.trace, Longueur: detour.longueur };
        if (createur) poi.Createur = moi;
        return { maj: champsVoyage({ Etat: "detour", Poi: poi, Debut_Marche: Date.now(), Duree_Marche_Ms: dureeDetour(poi), Delai_Depart_Ms: 300 }),
                 resultat: { detour: true, poi, createur } };
    });
    clic();
    if (r && r.detour && r.createur) lancerCreationPoi(id, r.poi);
    return r;
};

// LA HALTE : « Reprendre la route » ou « Rester ici », tous d'accord.
window.choisirHalteGroupe = async function(reponse, options) {
    const id = voyage && voyage.Id;
    if (!id || !voyage.Poi) return null;
    const moi = idJoueur();
    const forcer = !!(options && options.forcer) && estDev();
    const voulu = reponse === "rester" ? "rester" : "reprendre";
    if (voulu === "reprendre" && bloqueParCombat()) return { combat: true };
    const r = await transaction((data) => {
        const v = data.Voyage_Groupe;
        if (!memeVoyage(v, id) || v.Etat !== "halte" || !v.Poi) return null;
        const votants = votantsDe(v);
        if (!forcer && !votants.some(x => x.id === moi)) return null;
        const choixHalte = { ...(v.Choix_Halte || {}) };
        if (forcer) votants.forEach(x => { choixHalte[x.id] = voulu; }); else choixHalte[moi] = voulu;
        const accord = votants.length > 0 && votants.every(x => choixHalte[x.id] === voulu);
        if (!accord) return { maj: { "Voyage_Groupe.Choix_Halte": choixHalte }, resultat: { attente: true } };
        if (voulu === "rester") {
            return { maj: { Voyage_Groupe: deleteField(), Voyage_Termine: { Id: id, Le: Date.now() } }, resultat: { reste: true } };
        }
        return { maj: { ...champsVoyage({ Etat: "retour", Choix_Halte: choixHalte, Debut_Marche: Date.now(), Duree_Marche_Ms: dureeDetour(v.Poi), Delai_Depart_Ms: 300 }),
                        Lieu_Actuel: "", Situation: SITUATION_NATURE },
                 resultat: { reprend: true, lieu: v.Poi.Lieu || "" } };
    });
    clic();
    // On quitte le lieu : le chat se nettoie (les souvenirs de ses PNJ).
    if (r && r.reprend) nettoyerChat({ lieu: r.lieu, cimetiere: false });
    return r;
};

// LA CRÉATION DU LIEU (poi_creation.js) : par le poste du dernier oui s'il a
// les clés, sinon par un poste qui les a (il la réclame en transaction).
const creationsIci = new Set(), reclamations = new Set(), arriveesVues = new Set();
async function lancerCreationPoi(id, poi) {
    if (!poi || creationsIci.has(poi.Id) || typeof window.creerLieuPoi !== "function") return;
    creationsIci.add(poi.Id);
    try {
        const lieu = await window.creerLieuPoi({ region: Number(voyage && voyage.Arrivee ? voyage.Arrivee.Region : poi.Region), x: poi.x, y: poi.y });
        await transaction((data) => {
            const v = data.Voyage_Groupe;
            if (!memeVoyage(v, id) || !v.Poi || v.Poi.Id !== poi.Id) return null;
            // Le groupe attendait au bord : il y est (v281), le voyage s'achève.
            if (v.Etat === "halte") return { maj: arriveeAuLieu({ ...v, Poi: { ...v.Poi, Lieu: lieu.id, Nom: lieu.nom, Type: lieu.type } }, placeHalte(v)) };
            return { maj: { "Voyage_Groupe.Poi.Lieu": lieu.id, "Voyage_Groupe.Poi.Nom": lieu.nom, "Voyage_Groupe.Poi.Type": lieu.type } };
        });
    } catch (e) {
        console.error("[MIA_POI] Le lieu n'a pas pu naître :", e);
        await transaction((data) => {
            const v = data.Voyage_Groupe;
            if (!memeVoyage(v, id) || !v.Poi || v.Poi.Id !== poi.Id) return null;
            return { maj: { "Voyage_Groupe.Poi.Echec": String(e && e.message || e).slice(0, 200) } };
        });
    }
}
window.lancerCreationPoiVoyage = lancerCreationPoi;
// Un POI à créer et personne pour le faire (le poste du dernier oui n'a pas
// les clés) : ce poste, s'il les a, le réclame.
async function reclamerCreationPoi(v) {
    if (!v || !v.Poi || v.Poi.Createur || v.Poi.Lieu || v.Poi.Echec || reclamations.has(v.Poi.Id)) return;
    if (!(typeof window.peutCreerPoi === "function" && window.peutCreerPoi())) return;
    reclamations.add(v.Poi.Id);
    const moi = idJoueur(), id = v.Id, poiId = v.Poi.Id;
    const r = await transaction((data) => {
        const w = data.Voyage_Groupe;
        if (!memeVoyage(w, id) || !w.Poi || w.Poi.Id !== poiId || w.Poi.Createur) return null;
        return { maj: { "Voyage_Groupe.Poi.Createur": moi }, resultat: { pris: true } };
    });
    if (r && r.pris) lancerCreationPoi(id, v.Poi);
}
// L'arrivée au POI (chez tous) : le chat s'ouvre ; le poste qui a créé le lieu
// pose l'arrivée et réveille le MJ (Nico : « ça ouvre la chatbox et le MJ
// commence à parler en lui donnant les données du lieu »). `poi` : celui du
// voyage qui vient de s'achever sur lui (Voyage_Termine.Poi, v281).
async function arriverAuPoi(poi) {
    if (!poi || !poi.Id || arriveesVues.has(poi.Id)) return;
    arriveesVues.add(poi.Id);
    const chat = $("fenetre-chatbox");
    if (ecranJeuVisible() && typeof window.ouvrirChatbox === "function" && !(chat && chat.style.display === "flex")) {
        try { window.ouvrirChatbox(); } catch (e) { console.error("Chat (le voyage continue) :", e); }
    }
    if (!creationsIci.has(poi.Id)) return;
    const date = window.DATE_EN_JEU_ACTUELLE || {};
    try {
        await addDoc(collection(db, "Messages_Chat"), {
            ID_Partie: window.ID_PARTIE_COURANTE, ...AUTEUR_DESTIN,
            Texte: `*Le groupe quitte un instant sa route et s'approche de ${poi.Nom || "ce qu'il a aperçu"}.* (Narrateur, décris de manière immersive leur arrivée en ce lieu, l'atmosphère et ce qu'ils voient en premier.)`,
            Date_Jour: date.jour || "", Date_An: date.annee || "", Timestamp: Date.now()
        });
    } catch (e) { console.error("Message d'arrivée au POI :", e); }
    if (typeof window.declencherTourIA === "function") setTimeout(() => window.declencherTourIA(), 300);
}

// LA NUIT : repartir ou rester ici. Rien ne bouge tant que tous ne sont pas
// d'accord (Nico). La nuit finie, la date avance d'un jour.
window.choisirNuitVoyageGroupe = async function(reponse, options) {
    const id = voyage && voyage.Id;
    if (!id) return null;
    const moi = idJoueur();
    const forcer = !!(options && options.forcer) && estDev();
    const voulu = reponse === "rester" ? "rester" : "repartir";
    if (voulu === "repartir" && bloqueParCombat()) return { combat: true };
    const r = await transaction((data, date) => {
        const v = data.Voyage_Groupe;
        if (!memeVoyage(v, id) || v.Etat !== "nuit") return null;
        const votants = votantsDe(v);
        if (!forcer && !votants.some(x => x.id === moi)) return null;
        const choixNuit = { ...(v.Choix_Nuit || {}) };
        if (forcer) votants.forEach(x => { choixNuit[x.id] = voulu; }); else choixNuit[moi] = voulu;
        const accord = votants.length > 0 && votants.every(x => choixNuit[x.id] === voulu);
        if (!accord) return { maj: { "Voyage_Groupe.Choix_Nuit": choixNuit }, resultat: { attente: true } };
        const k = Number(v.Jour) || 1;
        if (voulu === "rester") {
            const camp = v.Camp || pointDuVoyage(v, v.Etapes[k - 1]);
            return { maj: { Voyage_Groupe: deleteField(), Voyage_Termine: { Id: id, Le: Date.now() },
                            Position_Groupe: { Region: Number(v.Arrivee.Region), x: arrondi(camp.x), y: arrondi(camp.y) }, Lieu_Actuel: "", Situation: SITUATION_NATURE },
                     date: lendemain(date), resultat: { reste: true } };
        }
        return { maj: champsVoyage({ ...lancerJournee(v, k + 1), Choix_Nuit: {}, Camp: null }),
                 date: lendemain(date), resultat: { repart: true, jour: k + 1 } };
    }, { avecDate: true });
    clic();
    if (r && r.repart) nettoyerChat({ cimetiere: false });
    if (r && r.reste) analyserLeTerrain();
    return r;
};

// « DANS LA NATURE » (v276) : hors d'un lieu connu, la partie le dit
// (Situation) ; le maître du jeu reçoit alors le terrain analysé
// (environnement_mj.js), qu'on prépare dès que le groupe s'arrête.
const SITUATION_NATURE = "Dans la nature";
const situationDe = (lieu) => (lieu ? "Dans un lieu" : SITUATION_NATURE);
function analyserLeTerrain() {
    if (typeof window.analyserTerrainGroupe !== "function") return;
    Promise.resolve(window.analyserTerrainGroupe()).catch(e => console.error("Analyse du terrain (le jeu continue) :", e));
}

// --- LE CHAT ---------------------------------------------------------------
function apresDepart(r) {
    nettoyerChat({ lieu: r.lieuQuitte, cimetiere: r.numero % CIMETIERE_TOUS_LES === 0 });
}
// Le nettoyage tourne en fond : la marche ne l'attend pas (il n'efface que
// les messages lus à son départ — le campement posé ensuite reste).
function nettoyerChat(options) {
    if (typeof window.nettoyerChatVoyage !== "function") return;
    Promise.resolve(window.nettoyerChatVoyage(options))
        .catch(e => console.error("Nettoyage du chat (le voyage continue) :", e));
}
async function posterMessageCampement() {
    if (!window.ID_PARTIE_COURANTE) return;
    const date = window.DATE_EN_JEU_ACTUELLE || {};
    try {
        await addDoc(collection(db, "Messages_Chat"), {
            ID_Partie: window.ID_PARTIE_COURANTE, ...AUTEUR_DESTIN,
            Texte: window.MESSAGE_CAMPEMENT_VOYAGE,
            Date_Jour: date.jour || "", Date_An: date.annee || "", Timestamp: Date.now()
        });
    } catch (e) { console.error("Message du campement :", e); }
}

// --- LE TÉLÉPORT (DEV) -----------------------------------------------------
async function teleporter(cible) {
    if (!window.ID_PARTIE_COURANTE || !estDev()) return false;
    const pos = { Region: Number(cible.Region), x: arrondi(cible.x), y: arrondi(cible.y) };
    const maj = { Position_Groupe: pos, Lieu_Actuel: cible.Lieu || "", Situation: situationDe(cible.Lieu), Voyage_Groupe: deleteField() };
    // Tout de suite à l'écran ; la base suit.
    partie = { ...partie, Position_Groupe: pos, Lieu_Actuel: cible.Lieu || "", Situation: situationDe(cible.Lieu) };
    delete partie.Voyage_Groupe;
    voyage = null;
    arreterAnimation();
    quitterChoix();
    dessinerTout();
    try { await updateDoc(refPartie(), maj); analyserLeTerrain(); return true; }
    catch (e) { console.error("Téléport du groupe :", e); annoncer("Le téléport n'a pas pu s'écrire (connexion ?)."); return false; }
}
window.teleporterGroupe = teleporter;

// =========================================================================
//  L'ÉCRAN
// =========================================================================
// --- LES PIONS -------------------------------------------------------------
function pionMonde() {
    let img = $("pion-groupe-monde");
    if (!img) {
        const carte = $("carte-fond-jeu");
        if (!carte) return null;
        img = document.createElement("img");
        img.id = "pion-groupe-monde";
        img.className = "pion-groupe pion-groupe-monde";
        img.alt = "Le groupe";
        img.draggable = false;
        img.src = IMAGE_GROUPE_MONDE;
        carte.appendChild(img);
    }
    return img;
}
function calquesRegion() {
    const carte = $("carte-region");
    if (!carte) return {};
    // La nuit tombe sur la carte (l'image, les nuages, les villages), pas sur
    // le groupe ni sur sa route : le voile passe dessous.
    let nuit = $("voile-nuit-voyage");
    if (!nuit) {
        nuit = document.createElement("div");
        nuit.id = "voile-nuit-voyage";
        nuit.className = "voile-nuit-voyage";
        carte.insertBefore(nuit, $("carte-region-pastilles") || null);
    }
    let svg = $("carte-region-voyage");
    if (!svg) {
        svg = document.createElementNS(SVG_NS, "svg");
        svg.id = "carte-region-voyage";
        svg.setAttribute("class", "calque-voyage");
        svg.setAttribute("preserveAspectRatio", "none");
        carte.insertBefore(svg, $("carte-region-pastilles") || null);
    }
    let pion = $("pion-groupe-region");
    if (!pion) {
        pion = document.createElement("img");
        pion.id = "pion-groupe-region";
        pion.className = "pion-groupe pion-groupe-region";
        pion.alt = "Le groupe";
        pion.draggable = false;
        pion.src = IMAGE_GROUPE_REGION;
        carte.insertBefore(pion, $("carte-region-pastilles") || null);
    }
    return { svg, pion, nuit };
}
function calqueDetour() {
    const carte = $("carte-region");
    if (!carte) return null;
    let svg = $("carte-region-detour");
    if (!svg) {
        svg = document.createElementNS(SVG_NS, "svg");
        svg.id = "carte-region-detour";
        svg.setAttribute("class", "calque-voyage calque-detour");
        svg.setAttribute("preserveAspectRatio", "none");
        carte.insertBefore(svg, $("carte-region-voyage") ? $("carte-region-voyage").nextSibling : null);
    }
    return svg;
}
function calqueMonde() {
    let svg = $("calque-voyage-monde");
    if (!svg) {
        const carte = $("carte-fond-jeu");
        if (!carte) return null;
        svg = document.createElementNS(SVG_NS, "svg");
        svg.id = "calque-voyage-monde";
        svg.setAttribute("class", "calque-voyage");
        svg.setAttribute("viewBox", `0 0 ${LARGEUR_MONDE} ${HAUTEUR_MONDE}`);
        svg.setAttribute("preserveAspectRatio", "none");
        carte.appendChild(svg);
    }
    return svg;
}

// OÙ EST LE GROUPE, À L'ÉCRAN (en voyage) : sur la route, sur le chemin du
// POI (aller ou retour), au POI, au camp.
function placeEnVoyage(v) {
    if (!v) return null;
    const k = Number(v.Jour) || 1;
    const animee = anim && anim.cle === cleAnimation(v) ? anim.f : null;
    if (v.Type === "monde") return pointDuVoyage(v, v.Etat === "marche" && animee !== null ? animee : 0);
    const asp = Number(v.Aspect) || 1;
    switch (v.Etat) {
        case "vote": return pointDuVoyage(v, 0);
        case "marche": return pointDuVoyage(v, animee !== null ? animee : troncon(v).de);
        case "poi": return pointDuVoyage(v, v.Poi ? v.Poi.f : troncon(v).de);
        case "detour": return v.Poi && v.Poi.Detour ? pointA(v.Poi.Detour, asp, animee !== null ? animee : 0) : null;
        case "retour": return v.Poi && v.Poi.Detour ? pointA(v.Poi.Detour, asp, animee !== null ? animee : arretDetour(v)) : null;
        case "halte": return v.Poi && v.Poi.Detour ? pointA(v.Poi.Detour, asp, arretDetour(v)) : (v.Poi ? { x: v.Poi.x, y: v.Poi.y } : null);
        case "nuit": return v.Camp || pointDuVoyage(v, v.Etapes[k - 1]);
        default: return null;
    }
}
window.placeEnVoyageGroupe = () => placeEnVoyage(voyage);

function placerPions() {
    const enPartie = !!window.ID_PARTIE_COURANTE;
    const pos = enPartie ? positionEffective() : null;
    const place = placeEnVoyage(voyage);
    // Le monde : le centre de la boîte de la région (ou la route, en voyage).
    const pm = pionMonde();
    if (pm) {
        let ici = null;
        if (voyage && voyage.Type === "monde" && place) ici = place;
        else if (voyage && voyage.Type === "region") ici = centreMonde(voyage.Arrivee.Region);
        else if (pos) ici = centreMonde(pos.Region);
        pm.style.display = ici ? "block" : "none";
        if (ici) {
            pm.style.width = reglages.tailleMonde + "px";
            pm.style.left = ici.x + "px";
            pm.style.top = ici.y + "px";
            pm.style.marginLeft = (reglages.decalageMonde.x * reglages.tailleMonde) + "px";
            pm.style.marginTop = (reglages.decalageMonde.y * reglages.tailleMonde) + "px";
        }
        placerCroix("monde", ici, reglages.tailleMonde);
        pm.classList.toggle("en-marche", !!(voyage && voyage.Type === "monde" && voyage.Etat === "marche"));
    }
    // La carte régionale ouverte : le marqueur, s'il est dans cette région.
    const { pion, nuit } = calquesRegion();
    const c = cadrageRegion();
    if (pion) {
        const n = carteOuverte();
        let ici = null;
        if (n && c && c.largeur) {
            if (voyage && voyage.Type === "region" && Number(voyage.Arrivee.Region) === n && place) ici = place;
            else if (voyage && voyage.Type === "monde") {
                // En route vers une autre région : on ne le voit plus partir
                // qu'au vote (il est encore là).
                if (voyage.Etat === "vote" && pos && pos.Region === n) ici = pointRegional(pos);
            } else if (pos && pos.Region === n) ici = pointRegional(pos);
        }
        pion.style.display = ici ? "block" : "none";
        if (ici) {
            const cote = reglages.tailleRegion * c.hauteur;
            pion.style.width = cote + "px";
            pion.style.left = (ici.x * c.largeur) + "px";
            pion.style.top = (ici.y * c.hauteur) + "px";
            pion.style.marginLeft = (reglages.decalageRegion.x * cote) + "px";
            pion.style.marginTop = (reglages.decalageRegion.y * cote) + "px";
        }
        placerCroix("region", ici && { x: ici.x * c.largeur, y: ici.y * c.hauteur }, reglages.tailleRegion * ((c && c.hauteur) || 0));
        const campe = !!(voyage && voyage.Etat === "nuit");
        pion.classList.toggle("campement", campe);
        pion.classList.toggle("en-marche", !!(voyage && voyage.Type === "region" && ["marche", "detour", "retour"].includes(voyage.Etat)));
    }
    if (nuit) nuit.classList.toggle("visible", !!(voyage && voyage.Etat === "nuit" && carteOuverte() === Number(voyage.Arrivee.Region)));
    placerPoi();
}

// LE RÉGLAGE DE L'IMAGE DU GROUPE (v281, DEV). Nico : « un outil pour
// modifier la taille et la position de l'image du groupe sur la map, pour
// qu'elle pointe exactement à l'endroit où il se trouve. Bouton d'édition
// activé : une croix rouge précisément là où est le groupe. » La croix marque
// la place exacte ; on glisse l'image (ou les curseurs) jusqu'à ce que sa
// pointe tombe dessus. Le décalage vaut pour toutes les parties
// (Carte_Monde/Groupe), en parts de la largeur de l'image : il suit sa taille.
function placerCroix(vue, ici, largeurPion) {
    const parent = vue === "monde" ? $("carte-fond-jeu") : $("carte-region");
    const pion = vue === "monde" ? $("pion-groupe-monde") : $("pion-groupe-region");
    if (!parent) return;
    const id = vue === "monde" ? "croix-groupe-monde" : "croix-groupe-region";
    let croix = $(id);
    const visible = !!(reglagePion && estDev() && ici);
    if (!croix) {
        if (!visible) return;
        croix = document.createElementNS(SVG_NS, "svg");
        croix.id = id;
        croix.setAttribute("class", "croix-groupe croix-groupe-" + vue);
        croix.setAttribute("viewBox", "-10 -10 20 20");
        croix.innerHTML = `<path d="M-8 -8 L8 8 M-8 8 L8 -8" class="croix-groupe-fond"/><path d="M-8 -8 L8 8 M-8 8 L8 -8" class="croix-groupe-trait"/>`;
        parent.appendChild(croix);
    }
    croix.style.display = visible ? "block" : "none";
    if (pion) {
        pion.classList.toggle("reglable", visible);
        brancherGlisserPion(pion, vue);
    }
    if (!visible) return;
    croix.style.left = ici.x + "px";
    croix.style.top = ici.y + "px";
    // Sur le monde, la croix suit la taille de l'image (la carte du monde n'a
    // pas de variable de zoom) ; sur la région, une taille d'écran fixe (CSS).
    if (vue === "monde") { croix.style.width = croix.style.height = Math.max(14, largeurPion * 0.22) + "px"; }
}
let glissePion = null;
function brancherGlisserPion(img, vue) {
    if (img.__glissePion) return;
    img.__glissePion = true;
    img.addEventListener("pointerdown", (e) => {
        if (!reglagePion || !estDev()) return;
        e.stopPropagation(); e.preventDefault();
        const c = cadrageRegion();
        const zoom = vue === "monde" ? ((typeof window.cadrageCarteMonde === "function" && window.cadrageCarteMonde().zoom) || 1) : ((c && c.zoom) || 1);
        const largeur = vue === "monde" ? reglages.tailleMonde : reglages.tailleRegion * ((c && c.hauteur) || 1);
        const d = vue === "monde" ? reglages.decalageMonde : reglages.decalageRegion;
        glissePion = { vue, x: e.clientX, y: e.clientY, zoom, largeur, depart: { ...d } };
        try { img.setPointerCapture(e.pointerId); } catch (er) { /* vieux navigateur */ }
    });
    img.addEventListener("pointermove", (e) => {
        if (!glissePion || glissePion.vue !== vue) return;
        e.stopPropagation();
        const g = glissePion;
        window.reglerDecalageGroupe(vue, "x", g.depart.x + (e.clientX - g.x) / g.zoom / g.largeur);
        window.reglerDecalageGroupe(vue, "y", g.depart.y + (e.clientY - g.y) / g.zoom / g.largeur);
    });
    const finir = () => { if (!glissePion || glissePion.vue !== vue) return; glissePion = null; ecrireReglages(true); };
    img.addEventListener("pointerup", finir);
    img.addEventListener("pointercancel", finir);
}
window.basculerReglagePionGroupe = function(actif) {
    if (!estDev()) return false;
    reglagePion = actif === undefined ? !reglagePion : !!actif;
    placerPions();
    actualiserDev();
    return reglagePion;
};
window.reglagePionGroupeActif = () => reglagePion;
window.reglerDecalageGroupe = function(vue, axe, valeur, enregistrer) {
    if (!estDev()) return null;
    const d = vue === "monde" ? reglages.decalageMonde : reglages.decalageRegion;
    const k = axe === "y" ? "y" : "x";
    d[k] = arrondi(borne(Number(valeur) || 0, ...BORNES_DECALAGE), 1000);
    placerPions();
    actualiserDev();
    ecrireReglages(!!enregistrer);
    return d[k];
};

// LE POINT D'EXCLAMATION DORÉ (v277) : là où le groupe a aperçu quelque
// chose — jusqu'à ce que le lieu soit dessiné sur la carte. v281 (Nico : « je
// veux juste le ! en doré, et une petite animation qui sursaute légèrement sur
// place ») : plus de pastille ni de halo, le signe seul.
function placerPoi() {
    const carte = $("carte-region");
    if (!carte) return;
    let el = $("poi-voyage");
    if (!el) {
        el = document.createElement("div");
        el.id = "poi-voyage";
        el.className = "poi-voyage";
        el.innerHTML = `<span class="poi-voyage-signe">!</span>`;
        carte.insertBefore(el, $("pion-groupe-region") || null);
    }
    const c = cadrageRegion(), n = carteOuverte();
    const poi = voyage && voyage.Type === "region" && voyage.Poi;
    const lieu = poi && poi.Lieu && (window.VILLAGES_REGIONAUX || {})[poi.Lieu];
    const visible = !!(poi && n === Number(voyage.Arrivee.Region) && c && c.largeur && ["poi", "detour", "halte", "retour"].includes(voyage.Etat) && !(lieu && lieu.calque));
    el.style.display = visible ? "flex" : "none";
    if (!visible) return;
    const cote = 0.05 * c.hauteur;
    Object.assign(el.style, { left: (poi.x * c.largeur) + "px", top: (poi.y * c.hauteur) + "px", width: cote + "px", height: cote + "px", fontSize: (cote * 0.95) + "px" });
    el.classList.toggle("en-vue", voyage.Etat === "poi");
}

// --- LE POINTILLÉ ROUGE ----------------------------------------------------
// « Façon carte d'Indiana Jones » : un trait pointillé rouge qui se dessine,
// puis une croix rouge à l'arrivée.
function dessinerTraceDans(svg, points, l, h, epaisseur, cle, anime, options) {
    const sansCroix = !!(options && options.sansCroix);
    if (!svg) return;
    if (svg.dataset.cle === (cle || "")) return;
    svg.dataset.cle = cle || "";
    if (!points || points.length < 2) {
        // Le tracé s'efface doucement.
        if (svg.firstChild && !svg.classList.contains("efface")) {
            svg.classList.add("efface");
            clearTimeout(svg.__efface);
            svg.__efface = setTimeout(() => { if (!svg.dataset.cle) { svg.innerHTML = ""; svg.classList.remove("efface"); } }, 900);
        }
        return;
    }
    svg.classList.remove("efface");
    const P = points.map(p => ({ x: arrondi(p.x, 10), y: arrondi(p.y, 10) }));
    let total = 0;
    for (let i = 1; i < P.length; i++) total += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y);
    const d = "M" + P.map(p => `${p.x} ${p.y}`).join(" L");
    const fin = P[P.length - 1], s = epaisseur * 2.4;
    // Le trait trois fois plus fin (Nico, v287 : « la croix rouge de déplacement
    // et le trait pointillé, fais-les moins épais, divise par trois ») ; la
    // croix garde sa taille, les tirets leur rythme.
    const trait = epaisseur / 3;
    const masque = "masque-" + svg.id;
    const duree = anime && !mouvementReduit() ? (svg.id === "calque-voyage-monde" ? DESSIN_TRACE_MS.monde : sansCroix ? 900 : DESSIN_TRACE_MS.region) : 0;
    svg.innerHTML = `
      <defs><mask id="${masque}" maskUnits="userSpaceOnUse" x="0" y="0" width="${l}" height="${h}">
        <path class="trace-voyage-masque" d="${d}" fill="none" stroke="#fff" stroke-width="${epaisseur * 4}" stroke-linecap="round" stroke-linejoin="round"
              style="stroke-dasharray:${total + 1} ${total + 1};stroke-dashoffset:${duree ? total + 1 : 0}"/></mask></defs>
      <g mask="url(#${masque})">
        <path class="trace-voyage-ombre" d="${d}" fill="none" stroke-width="${trait * 1.9}" stroke-linecap="round" stroke-linejoin="round"/>
        <path class="trace-voyage" d="${d}" fill="none" stroke-width="${trait}" stroke-linecap="round" stroke-linejoin="round"
              stroke-dasharray="${epaisseur * 2.6} ${epaisseur * 1.9}"/>
      </g>
      ${sansCroix ? "" : `<circle class="depart-voyage" cx="${P[0].x}" cy="${P[0].y}" r="${trait * 1.6}"/>
      <g class="croix-voyage" transform="translate(${fin.x} ${fin.y})"><g class="croix-voyage-dessin${duree ? " a-venir" : ""}" style="${duree ? `animation-delay:${duree}ms` : ""}">
        <path class="croix-voyage-ombre" d="M${-s} ${-s} L${s} ${s} M${s} ${-s} L${-s} ${s}" stroke-width="${trait * 2.2}" stroke-linecap="round"/>
        <path class="croix-voyage-trait" d="M${-s} ${-s} L${s} ${s} M${s} ${-s} L${-s} ${s}" stroke-width="${trait * 1.3}" stroke-linecap="round"/>
      </g></g>`}`;
    if (duree) {
        const m = svg.querySelector(".trace-voyage-masque");
        requestAnimationFrame(() => requestAnimationFrame(() => {
            m.style.transition = `stroke-dashoffset ${duree}ms cubic-bezier(.45,.05,.4,1)`;
            m.style.strokeDashoffset = "0";
        }));
    }
}
// Le tracé à montrer : la proposition de ce poste, ou le voyage en cours.
function traceAffichee() {
    if (choix && choix.type === "voyage" && choix.proposition) {
        const p = choix.proposition;
        return { type: p.type, region: p.type === "region" ? p.region : null, points: p.trace, cle: "P:" + p.cle, anime: true };
    }
    if (voyage && Array.isArray(voyage.Trace)) {
        return { type: voyage.Type, region: voyage.Type === "region" ? Number(voyage.Arrivee.Region) : null, points: voyage.Trace,
                 cle: "V:" + voyage.Id, anime: !vus.has("trace:" + voyage.Id) };
    }
    return null;
}
function dessinerTraces() {
    const t = traceAffichee();
    const monde = calqueMonde();
    if (t && t.type === "monde") {
        dessinerTraceDans(monde, t.points, LARGEUR_MONDE, HAUTEUR_MONDE, 12, t.cle, t.anime);
    } else dessinerTraceDans(monde, null, 0, 0, 0, "", false);
    const { svg } = calquesRegion();
    const c = cadrageRegion();
    if (svg) {
        if (t && t.type === "region" && c && c.largeur && carteOuverte() === t.region) {
            svg.setAttribute("viewBox", `0 0 ${c.largeur} ${c.hauteur}`);
            const pts = t.points.map(p => ({ x: p.x * c.largeur, y: p.y * c.hauteur }));
            dessinerTraceDans(svg, pts, c.largeur, c.hauteur, Math.max(2, c.hauteur * 0.0065), t.cle + ":" + c.numero, t.anime);
        } else dessinerTraceDans(svg, null, 0, 0, 0, "", false);
    }
    // Le détour vers le POI : un pointillé plus fin, sans croix.
    const detour = calqueDetour();
    if (detour) {
        const poi = voyage && voyage.Type === "region" && voyage.Poi;
        if (poi && Array.isArray(poi.Detour) && c && c.largeur && carteOuverte() === Number(voyage.Arrivee.Region)
            && ["detour", "halte", "retour"].includes(voyage.Etat)) {
            detour.setAttribute("viewBox", `0 0 ${c.largeur} ${c.hauteur}`);
            const pts = poi.Detour.map(p => ({ x: p.x * c.largeur, y: p.y * c.hauteur }));
            dessinerTraceDans(detour, pts, c.largeur, c.hauteur, Math.max(1.5, c.hauteur * 0.0045), "D:" + poi.Id + ":" + c.numero, !vus.has("detour:" + poi.Id), { sansCroix: true });
            vus.add("detour:" + poi.Id);
        } else dessinerTraceDans(detour, null, 0, 0, 0, "", false);
    }
    if (t && t.cle && t.cle.startsWith("V:")) vus.add("trace:" + voyage.Id);
}

function dessinerTout() {
    placerPions();
    dessinerTraces();
    actualiserBouton();
    actualiserBandeau();
    actualiserBoite();
    actualiserAttentePoi();
    actualiserDev();
}

// L'ATTENTE DU LIEU (v277, Nico : « un message un peu plus RP pour faire
// patienter ») : à la halte, tant que le lieu ne s'est pas révélé.
let minuteurAttente = null;
function actualiserAttentePoi() {
    const attendre = !!(voyage && voyage.Etat === "halte" && voyage.Poi && !voyage.Poi.Arrive && !voyage.Poi.Echec && ecranJeuVisible());
    let el = $("attente-poi");
    if (!el && !attendre) return;
    if (!el) {
        el = document.createElement("div");
        el.id = "attente-poi";
        el.className = "attente-poi";
        el.innerHTML = `<div class="attente-poi-carte"><div class="attente-poi-signe">!</div><div class="attente-poi-texte"></div><div class="attente-poi-points"><span></span><span></span><span></span></div></div>`;
        ($("ecran-jeu") || document.body).appendChild(el);
    }
    el.classList.toggle("visible", attendre);
    if (!attendre) { clearInterval(minuteurAttente); minuteurAttente = null; return; }
    if (minuteurAttente) return;
    let i = 0;
    const texte = el.querySelector(".attente-poi-texte");
    const montrer = () => { texte.textContent = MESSAGES_ATTENTE_POI[i % MESSAGES_ATTENTE_POI.length]; i++; };
    montrer();
    minuteurAttente = setInterval(montrer, 3200);
}
window.MESSAGES_ATTENTE_POI = MESSAGES_ATTENTE_POI;
window.dessinerVoyageGroupe = dessinerTout;

// --- LE BOUTON VOYAGE ------------------------------------------------------
// À côté du bouton qui déplie le menu, de la même taille ; il se montre avec
// lui (menu rangé), dans une partie.
function bouton() {
    let b = $("btn-voyage");
    if (!b) {
        const ecran = $("ecran-jeu");
        if (!ecran) return null;
        b = document.createElement("img");
        b.id = "btn-voyage";
        b.className = "btn-voyage";
        b.src = IMAGE_BOUTON_VOYAGE;
        b.alt = "Voyager";
        b.title = "Voyager";
        b.draggable = false;
        b.style.display = "none";
        // Le chat ouvert, c'est la croix qui le ferme (v287).
        b.addEventListener("click", () => {
            clic();
            if (chatOuvert()) { if (typeof window.fermerChatbox === "function") window.fermerChatbox(); return; }
            window.basculerModeVoyage();
        });
        ecran.appendChild(b);
        // Le chat s'ouvre ou se ferme : le bouton change de visage.
        const chat = $("fenetre-chatbox");
        if (chat && typeof MutationObserver === "function") new MutationObserver(actualiserBouton).observe(chat, { attributes: true, attributeFilter: ["style"] });
    }
    return b;
}
// v287 — Nico : « quand le chat est ouvert, à la place du bouton déplacement,
// mets une croix pour fermer le chatbox ». Le même bouton, à la même place.
const chatOuvert = () => { const chat = $("fenetre-chatbox"); return !!chat && chat.style.display === "flex"; };
const IMAGE_CROIX_CHAT = "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="29" fill="#e8d5a5" stroke="#5c3a21" stroke-width="4"/>`
    + `<path d="M21 21 L43 43 M43 21 L21 43" stroke="#5c3a21" stroke-width="6" stroke-linecap="round"/></svg>`);
window.chatOuvertVoyage = chatOuvert;
function actualiserBouton() {
    const b = bouton();
    if (!b) return;
    const rouvrir = $("btn-rouvrir-menu");
    const fermerChat = chatOuvert();
    // Le chat ouvert cache le menu (et son bouton) : la croix, elle, se montre.
    const visible = !!window.ID_PARTIE_COURANTE && (fermerChat || (!!rouvrir && rouvrir.style.display !== "none"));
    b.style.display = visible ? "block" : "none";
    b.classList.toggle("fermer-chat", fermerChat);
    // Les boutons voisins (le retour au monde) se poussent d'une place.
    document.body.classList.toggle("chat-ouvert", fermerChat);
    const image = fermerChat ? IMAGE_CROIX_CHAT : IMAGE_BOUTON_VOYAGE;
    if (b.getAttribute("src") !== image) b.src = image;
    if (fermerChat) { b.alt = b.title = "Fermer le chat"; b.classList.remove("occupe", "bloque", "actif"); return; }
    b.alt = "Voyager";
    const combat = combatEnCours();
    b.classList.toggle("occupe", !!voyage);
    b.classList.toggle("bloque", combat);
    b.classList.toggle("actif", !!(choix && choix.type === "voyage"));
    b.title = combat ? MESSAGE_COMBAT : voyage ? "Un voyage est en cours" : (choix && choix.type === "voyage" ? "Annuler le voyage" : "Voyager");
}

// --- LE MODE VOYAGE (ce poste seulement) -----------------------------------
window.modeChoixCarte = () => (choix ? choix.vue : null);
window.choixVoyageGroupe = () => (choix ? { type: choix.type, vue: choix.vue, region: choix.region || null,
    proposition: choix.proposition ? JSON.parse(JSON.stringify(choix.proposition)) : null } : null);
// PENDANT UN COMBAT DU RÉCIT, LE GROUPE NE BOUGE PAS (v282, Nico : « quand
// un combat RP est en cours, bloque la possibilité de se déplacer sur la
// map »). Ni nouveau voyage, ni « oui » qui ferait partir, ni reprise de la
// route (nuit, POI, halte). Le téléport DEV reste permis (il répare).
const combatEnCours = () => typeof window.combatRPActif === "function" && window.combatRPActif(partie);
window.deplacementBloqueParCombat = combatEnCours;
const MESSAGE_COMBAT = "Un combat est en cours : le groupe ne peut pas se déplacer.";
function bloqueParCombat() {
    if (!combatEnCours()) return false;
    annoncer(MESSAGE_COMBAT);
    return true;
}

window.basculerModeVoyage = function(oui) {
    const voulu = typeof oui === "boolean" ? oui : !(choix && choix.type === "voyage");
    if (!voulu) { quitterChoix(); return false; }
    if (!window.ID_PARTIE_COURANTE) return false;
    if (bloqueParCombat()) return false;
    if (voyage) { annoncer("Un voyage est déjà en cours."); return false; }
    const pos = positionEffective();
    if (!pos) { annoncer("Le groupe n'a pas encore de place sur la carte (DEV : le téléporter)."); return false; }
    const n = carteOuverte();
    if (n) {
        if (pos.Region !== n) { annoncer("Le groupe n'est pas dans cette région."); return false; }
        choix = { type: "voyage", vue: "region", region: n, proposition: null };
    } else choix = { type: "voyage", vue: "monde", region: null, proposition: null };
    surChangementChoix();
    return true;
};
window.basculerTeleportGroupe = function(oui) {
    const voulu = (typeof oui === "boolean" ? oui : !(choix && choix.type === "teleport")) && estDev() && !!window.ID_PARTIE_COURANTE;
    if (!voulu) { if (choix && choix.type === "teleport") quitterChoix(); else actualiserDev(); return false; }
    const n = carteOuverte();
    choix = { type: "teleport", vue: n ? "region" : "monde", region: n || null, proposition: null };
    surChangementChoix();
    return true;
};
function quitterChoix() {
    if (!choix) return;
    choix = null;
    surChangementChoix();
}
window.quitterChoixVoyage = quitterChoix;
function surChangementChoix() {
    if (typeof window.editionTerrainsRegion === "function" && window.editionTerrainsRegion() && choix && typeof window.basculerEditionTerrains === "function")
        window.basculerEditionTerrains(false);
    if (typeof window.dessinerRegions === "function") window.dessinerRegions();
    const vue = $("vue-carte-region");
    if (vue) vue.classList.toggle("choix-voyage", !!(choix && choix.vue === "region"));
    dessinerTout();
}

// Un clic sur une région de la carte du monde, en mode choix (regions_carte.js).
window.surChoixRegionCarte = function(numero) {
    if (!choix || choix.vue !== "monde") return false;
    const n = Number(numero);
    if (!(n > 0)) return false;
    if (choix.type === "teleport") {
        const p = typeof window.centreTerrainRegion === "function" ? window.centreTerrainRegion(n) : { x: 0.5, y: 0.5 };
        teleporter({ Region: n, x: p.x, y: p.y, Lieu: "" });
        return true;
    }
    const pos = positionEffective();
    if (!pos) return true;
    if (pos.Region === n) { annoncer("Le groupe est déjà dans cette région."); return true; }
    const A = centreMonde(pos.Region), B = centreMonde(n);
    if (!A || !B) return true;
    choix.proposition = {
        type: "monde", cle: Date.now().toString(36),
        depart: { Region: pos.Region },
        arrivee: { Region: n, Nom: nomRegion(n), Lieu: null },
        trace: [{ x: Math.round(A.x), y: Math.round(A.y) }, { x: Math.round(B.x), y: Math.round(B.y) }],
        jours: 0, etapes: [1], longueur: Math.hypot(B.x - A.x, B.y - A.y)
    };
    clic();
    dessinerTout();
    return true;
};

// Un toucher sur la carte régionale, en mode choix : un village (sa place
// exacte), ou un point du terrain praticable.
function villageSous(n, fx, fy) {
    const c = cadrageRegion();
    if (!c || !c.largeur) return null;
    const liste = Object.values(window.VILLAGES_REGIONAUX || {}).filter(v => v.numero === n);
    let meilleur = null;
    liste.forEach(v => {
        const demi = (v.taille * c.hauteur) / 2;
        const dx = Math.abs(fx * c.largeur - v.x * c.largeur), dy = Math.abs(fy * c.hauteur - v.y * c.hauteur);
        if (dx > demi || dy > demi) return;
        const d = Math.hypot(dx, dy);
        if (!meilleur || d < meilleur.d) meilleur = { v, d };
    });
    return meilleur ? meilleur.v : null;
}
window.surChoixPointRegion = function(clientX, clientY) {
    const n = carteOuverte(), c = cadrageRegion();
    if (!choix || choix.vue !== "region" || !n || !c || !c.largeur) return false;
    const p = window.pointImageCarteRegion(clientX, clientY);
    const fx = p.x / c.largeur, fy = p.y / c.hauteur;
    if (fx < 0 || fy < 0 || fx > 1 || fy > 1) return false;
    const village = villageSous(n, fx, fy);
    if (choix.type === "teleport") {
        teleporter(village ? { Region: n, x: village.x, y: village.y, Lieu: village.id } : { Region: n, x: fx, y: fy, Lieu: "" });
        return true;
    }
    const pos = positionEffective();
    if (!pos || pos.Region !== n) return true;
    const A = pointRegional(pos);
    let B;
    if (village) B = { x: village.x, y: village.y, Lieu: village.id, Nom: village.nom };
    else {
        if (typeof window.terrainsDefinisRegion === "function" && window.terrainsDefinisRegion(n) && !window.pointSurTerrainRegion(n, fx, fy)) {
            annoncer("Terrain impraticable : choisissez un point du terrain praticable, ou un village.");
            return true;
        }
        B = { x: fx, y: fy, Lieu: null, Nom: "" };
    }
    const asp = aspectRegion(n);
    if (Math.hypot((B.x - A.x) * asp, B.y - A.y) < 0.02) { annoncer("Le groupe y est déjà."); return true; }
    const chemin = genererChemin(n, A, B);
    const jours = joursDeMarche(chemin.longueur);
    choix.proposition = {
        type: "region", region: n, cle: Date.now().toString(36),
        depart: { Region: n, x: arrondi(A.x), y: arrondi(A.y) },
        arrivee: { Region: n, x: arrondi(B.x), y: arrondi(B.y), Lieu: B.Lieu || null, Nom: B.Nom || "" },
        trace: chemin.trace, aspect: arrondi(chemin.aspect), longueur: arrondi(chemin.longueur),
        jours, etapes: Array.from({ length: jours }, (_, i) => arrondi((i + 1) / jours))
    };
    clic();
    dessinerTout();
    return true;
};

// --- LE BANDEAU DU MODE (en haut, au centre) -------------------------------
function bandeau() {
    let el = $("bandeau-voyage");
    if (!el) {
        el = document.createElement("div");
        el.id = "bandeau-voyage";
        el.className = "bandeau-voyage";
        el.style.display = "none";
        el.addEventListener("click", (e) => {
            const b = e.target.closest && e.target.closest("[data-action]");
            if (!b) return;
            clic();
            const a = b.getAttribute("data-action");
            if (a === "annuler") quitterChoix();
            if (a === "valider") window.proposerVoyageGroupe();
        });
        ($("ecran-jeu") || document.body).appendChild(el);
    }
    return el;
}
function actualiserBandeau() {
    const el = bandeau();
    if (!el) return;
    if (!choix) { el.style.display = "none"; el.innerHTML = ""; return; }
    let html;
    if (choix.type === "teleport") {
        html = `<div class="bandeau-voyage-titre">⤳ Téléport du groupe (DEV)</div>
                <div class="bandeau-voyage-aide">${choix.vue === "monde" ? "Touchez une région de la carte du monde." : "Touchez un point de la carte, ou un village."}</div>
                <div class="bandeau-voyage-boutons"><button type="button" data-action="annuler" class="secondaire">Annuler</button></div>`;
    } else if (!choix.proposition) {
        html = `<div class="bandeau-voyage-titre">🧭 Voyage</div>
                <div class="bandeau-voyage-aide">${choix.vue === "monde" ? "Touchez la région où le groupe doit se rendre." : "Touchez un point du terrain praticable, ou un village."}</div>
                <div class="bandeau-voyage-boutons"><button type="button" data-action="annuler" class="secondaire">Annuler</button></div>`;
    } else {
        const p = choix.proposition;
        const vers = p.type === "monde" ? p.arrivee.Nom : (p.arrivee.Nom || "ce point de la carte");
        const duree = p.type === "monde" ? "Changement de région" : `≈ ${p.jours} jour${p.jours > 1 ? "s" : ""} de marche`;
        html = `<div class="bandeau-voyage-titre">🧭 Vers <b>${echapper(vers)}</b></div>
                <div class="bandeau-voyage-aide">${duree} · touchez ailleurs pour changer de destination.</div>
                <div class="bandeau-voyage-boutons"><button type="button" data-action="valider">Valider le voyage</button>
                <button type="button" data-action="annuler" class="secondaire">Annuler</button></div>`;
    }
    if (el.__html !== html) { el.innerHTML = html; el.__html = html; }
    el.style.display = "block";
}

// --- LA BOÎTE DE VOTE ET DE LA NUIT (en haut à droite, chez tous) ----------
function boite() {
    let el = $("boite-voyage");
    if (!el) {
        el = document.createElement("div");
        el.id = "boite-voyage";
        el.className = "boite-voyage";
        el.style.display = "none";
        el.addEventListener("click", (e) => {
            const b = e.target.closest && e.target.closest("[data-action]");
            if (!b || b.disabled) return;
            const a = b.getAttribute("data-action");
            if (a === "oui" || a === "non") window.voterVoyageGroupe(a);
            if (a === "repartir" || a === "rester") window.choisirNuitVoyageGroupe(a);
            if (a === "forcer") window.forcerVoyageGroupe();
            if (a === "forcer-rester") window.choisirNuitVoyageGroupe("rester", { forcer: true });
            if (a === "poi-oui" || a === "poi-non") window.voterPoiGroupe(a === "poi-oui" ? "oui" : "non");
            if (a === "halte-reprendre" || a === "halte-rester") window.choisirHalteGroupe(a === "halte-rester" ? "rester" : "reprendre");
            if (a === "forcer-halte-rester") window.choisirHalteGroupe("rester", { forcer: true });
            if (a === "feu-de-camp") window.discuterAutourDuFeu();
        });
        ($("ecran-jeu") || document.body).appendChild(el);
    }
    return el;
}
// « Discuter autour du feu de camp » (v281) : le chat s'ouvre — le vote de la
// nuit attend, la boîte reste là.
window.discuterAutourDuFeu = function() {
    clic();
    const chat = $("fenetre-chatbox");
    if (chat && chat.style.display === "flex") return true;
    if (typeof window.ouvrirChatbox !== "function") return false;
    try { window.ouvrirChatbox(); } catch (e) { console.error("Chat (le voyage continue) :", e); return false; }
    return true;
};
function destinationTexte(v) {
    if (v.Type === "monde") return nomRegion(v.Arrivee.Region);
    return v.Arrivee.Nom || "un point de la carte";
}
function actualiserBoite() {
    const el = boite();
    if (!el) return;
    if (!voyage || !window.ID_PARTIE_COURANTE) { el.style.display = "none"; el.innerHTML = ""; el.__html = ""; return; }
    const moi = idJoueur();
    const votants = votantsDe(voyage);
    const jeVote = votants.some(x => x.id === moi);
    const dev = estDev();
    const vers = echapper(destinationTexte(voyage));
    let html = "";
    if (voyage.Etat === "vote") {
        const duree = voyage.Type === "monde" ? "changement de région" : `≈ ${voyage.Jours} jour${voyage.Jours > 1 ? "s" : ""} de marche`;
        const lignes = votants.map(x => {
            const r = (voyage.Votes || {})[x.id];
            return `<li class="${r === "oui" ? "oui" : r === "non" ? "non" : "attente"}"><span>${echapper(x.nom)}</span><b>${r === "oui" ? "✔" : r === "non" ? "✖" : "…"}</b></li>`;
        }).join("");
        const monVote = (voyage.Votes || {})[moi];
        html = `<div class="boite-voyage-tete">🧭 Voyage proposé</div>
                <div class="boite-voyage-texte">${echapper(voyage.Initiateur && voyage.Initiateur.nom)} propose de partir vers <b>${vers}</b> (${duree}).</div>
                <ul class="boite-voyage-votants">${lignes}</ul>
                ${jeVote ? `<div class="boite-voyage-boutons">
                    <button type="button" data-action="oui"${monVote === "oui" ? " disabled" : ""}>${monVote === "oui" ? "✔ D'accord" : "Partir"}</button>
                    <button type="button" data-action="non" class="secondaire">${voyage.Initiateur && voyage.Initiateur.id === moi ? "Annuler" : "Refuser"}</button></div>`
                         : `<div class="boite-voyage-etat">Les joueurs votent…</div>`}
                ${dev ? `<button type="button" data-action="forcer" class="boite-voyage-dev">Forcer le départ (DEV)</button>` : ""}`;
    } else if (voyage.Etat === "nuit") {
        const k = Number(voyage.Jour) || 1;
        const lignes = votants.map(x => {
            const r = (voyage.Choix_Nuit || {})[x.id];
            return `<li class="${r ? "oui" : "attente"}"><span>${echapper(x.nom)}</span><b>${r === "repartir" ? "À l'aube" : r === "rester" ? "Rester" : "…"}</b></li>`;
        }).join("");
        const mien = (voyage.Choix_Nuit || {})[moi];
        const choixFaits = votants.map(x => (voyage.Choix_Nuit || {})[x.id]).filter(Boolean);
        const desaccord = choixFaits.length === votants.length && new Set(choixFaits).size > 1;
        html = `<div class="boite-voyage-tete">🔥 Nuit ${k} au campement</div>
                <div class="boite-voyage-texte">En route vers <b>${vers}</b> — jour ${k} sur ${voyage.Jours}. Repartir à l'aube, ou rester ici ? D'ici là, la soirée est à vous.</div>
                <ul class="boite-voyage-votants">${lignes}</ul>
                ${jeVote ? `<div class="boite-voyage-boutons">
                    <button type="button" data-action="repartir"${mien === "repartir" ? " class=\"choisi\"" : ""}>Repartir à l'aube</button>
                    <button type="button" data-action="rester" class="secondaire${mien === "rester" ? " choisi" : ""}">Rester ici</button></div>` : ""}
                <button type="button" data-action="feu-de-camp" class="boite-voyage-feu">🔥 Discuter autour du feu de camp</button>
                <div class="boite-voyage-etat">${desaccord ? "Pas d'accord : rien ne bouge tant que tous ne choisissent pas la même chose." : "Rien ne se passe tant que tous ne sont pas d'accord."}</div>
                ${dev ? `<div class="boite-voyage-boutons"><button type="button" data-action="forcer" class="boite-voyage-dev">Forcer : repartir à l'aube</button>
                    <button type="button" data-action="forcer-rester" class="boite-voyage-dev">Forcer : rester</button></div>` : ""}`;
    } else {
        const k = Number(voyage.Jour) || 1;
        if (voyage.Etat === "poi" && voyage.Poi) {
            // LE POI APERÇU (v277) : on va voir, ou l'on passe son chemin.
            const votes = voyage.Poi.Votes || {};
            const lignes = votants.map(x => {
                const r = votes[x.id];
                return `<li class="${r === "oui" ? "oui" : r === "non" ? "non" : "attente"}"><span>${echapper(x.nom)}</span><b>${r === "oui" ? "✔" : r === "non" ? "✖" : "…"}</b></li>`;
            }).join("");
            html = `<div class="boite-voyage-tete">👁 Quelque chose, là-bas…</div>
                <div class="boite-voyage-texte">Il vous semble apercevoir quelque chose, pas très loin de la route. Faire un détour pour aller voir ?</div>
                <ul class="boite-voyage-votants">${lignes}</ul>
                ${jeVote ? `<div class="boite-voyage-boutons">
                    <button type="button" data-action="poi-oui"${votes[moi] === "oui" ? " disabled" : ""}>${votes[moi] === "oui" ? "✔ Aller voir" : "Aller voir"}</button>
                    <button type="button" data-action="poi-non" class="secondaire">Passer son chemin</button></div>` : `<div class="boite-voyage-etat">Les joueurs décident…</div>`}
                ${dev ? `<button type="button" data-action="forcer" class="boite-voyage-dev">Forcer le détour (DEV)</button>` : ""}`;
        } else if (voyage.Etat === "detour") {
            html = `<div class="boite-voyage-tete compacte">👁 Vous vous écartez de la route pour aller voir…</div>`;
        } else if (voyage.Etat === "halte" && voyage.Poi) {
            const poi = voyage.Poi, choixH = voyage.Choix_Halte || {};
            const lignes = votants.map(x => {
                const r = choixH[x.id];
                return `<li class="${r ? "oui" : "attente"}"><span>${echapper(x.nom)}</span><b>${r === "reprendre" ? "Reprendre" : r === "rester" ? "Rester" : "…"}</b></li>`;
            }).join("");
            // Le lieu se révèle : on attend, sans question (v281 : arrivés, ils
            // y sont). La question ne vient que s'il n'a pas pu naître.
            const mien = choixH[moi];
            html = poi.Echec ? `<div class="boite-voyage-tete">📍 Rien de net…</div>
                <div class="boite-voyage-texte">Le lieu ne s'est pas révélé (${echapper(poi.Echec)}). Reprendre la route de <b>${vers}</b>, ou rester ici ?</div>
                <ul class="boite-voyage-votants">${lignes}</ul>
                ${jeVote ? `<div class="boite-voyage-boutons">
                    <button type="button" data-action="halte-reprendre"${mien === "reprendre" ? " class=\"choisi\"" : ""}>Reprendre la route</button>
                    <button type="button" data-action="halte-rester" class="secondaire${mien === "rester" ? " choisi" : ""}">Rester ici</button></div>` : ""}
                <div class="boite-voyage-etat">Rien ne bouge tant que tous ne sont pas d'accord.</div>
                ${dev ? `<div class="boite-voyage-boutons"><button type="button" data-action="forcer" class="boite-voyage-dev">Forcer : reprendre</button>
                    <button type="button" data-action="forcer-halte-rester" class="boite-voyage-dev">Forcer : rester</button></div>` : ""}`
                : `<div class="boite-voyage-tete compacte">📍 Vous approchez… le lieu se révèle peu à peu.</div>`;
        } else if (voyage.Etat === "retour") {
            html = `<div class="boite-voyage-tete compacte">🧭 Retour sur la route de <b>${vers}</b></div>`;
        } else {
            html = `<div class="boite-voyage-tete compacte">🧭 En route vers <b>${vers}</b>${voyage.Type === "region" ? ` · jour ${k} / ${voyage.Jours}` : ""}</div>`;
        }
    }
    el.className = "boite-voyage etat-" + voyage.Etat;
    if (el.__html !== html) { el.innerHTML = html; el.__html = html; }
    el.style.display = "block";
}

// --- « JOUR 2 » --------------------------------------------------------------
function annoncerJour(k) {
    let el = $("annonce-jour-voyage");
    if (!el) {
        el = document.createElement("div");
        el.id = "annonce-jour-voyage";
        el.className = "annonce-jour-voyage";
        el.innerHTML = `<span class="annonce-jour-ligne"></span><span class="annonce-jour-texte"></span><span class="annonce-jour-ligne"></span>`;
        ($("ecran-jeu") || document.body).appendChild(el);
    }
    el.querySelector(".annonce-jour-texte").textContent = `JOUR ${k}`;
    el.classList.remove("visible");
    void el.offsetWidth;
    el.classList.add("visible");
    clearTimeout(annoncerJour.minuteur);
    annoncerJour.minuteur = setTimeout(() => el.classList.remove("visible"), 2700);
}
window.annoncerJourVoyage = annoncerJour;

// --- LES PETITS MESSAGES ---------------------------------------------------
function annoncer(texte) {
    let el = $("annonce-voyage");
    if (!el) {
        el = document.createElement("div");
        el.id = "annonce-voyage";
        el.className = "annonce-carte-region annonce-voyage";
        ($("ecran-jeu") || document.body).appendChild(el);
    }
    el.textContent = texte;
    el.classList.remove("visible");
    void el.offsetWidth;
    el.classList.add("visible");
    clearTimeout(annoncer.minuteur);
    annoncer.minuteur = setTimeout(() => el.classList.remove("visible"), 2800);
}
window.annoncerVoyage = annoncer;

// --- AMENER CHACUN SUR LA CARTE DU VOYAGE (Nico : « 2. Ok ») -------------
async function amenerSurLaCarte(v) {
    if (!ecranJeuVisible() || !v) return;
    if (typeof window.descriptifRegionOuvert === "function" && window.descriptifRegionOuvert() !== null && typeof window.fermerDescriptifRegion === "function")
        await window.fermerDescriptifRegion();
    const enTransition = () => window.TRAVERSEE_EN_COURS === true;
    for (let i = 0; i < 40 && enTransition(); i++) await attendre(150);
    if (v.Type === "monde") {
        if (carteOuverte()) {
            for (let i = 0; i < 20 && carteOuverte(); i++) {
                const ok = await window.fermerCarteRegionale();
                if (ok) break;
                await attendre(200);
            }
        }
        centrerMonde(v.Trace);
    } else {
        const n = Number(v.Arrivee.Region);
        if (carteOuverte() !== n) {
            if (carteOuverte()) await window.fermerCarteRegionale();
            for (let i = 0; i < 20 && carteOuverte() !== n; i++) {
                const ok = typeof window.ouvrirCarteRegionale === "function" && await window.ouvrirCarteRegionale(n);
                if (ok) break;
                await attendre(200);
            }
        }
        if (carteOuverte() === n) centrerRegion(v.Trace);
    }
    dessinerTout();
}
window.amenerSurLaCarteDuVoyage = amenerSurLaCarte;
function boiteDe(points) {
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}
// Le milieu de ce qu'on voit, à gauche de la boîte de vote (en haut à droite) :
// elle ne cache pas le trajet.
function milieuVisible(largeurEcran) {
    const boite = borne(largeurEcran * 0.22, 230, 310);
    return (largeurEcran - boite - 20) / 2;
}
window.milieuVisibleVoyage = milieuVisible;
function centrerMonde(points) {
    if (!points || !points.length || typeof window.glisserCarteMonde !== "function") return;
    const m = boiteDe(points);
    const zoom = (window.cadrageCarteMonde && window.cadrageCarteMonde().zoom) || 1;
    window.glisserCarteMonde(milieuVisible(window.innerWidth) - m.x * zoom);
}
function centrerRegion(points) {
    const c = cadrageRegion();
    if (!c || !c.largeur || !points || !points.length || typeof window.glisserCarteRegion !== "function") return;
    const m = boiteDe(points);
    const ecran = $("ecran-jeu") && $("ecran-jeu").getBoundingClientRect();
    const l = (ecran && ecran.width) || innerWidth, h = (ecran && ecran.height) || innerHeight;
    window.glisserCarteRegion(milieuVisible(l) - (c.panX + m.x * c.largeur * c.zoom), h / 2 - (c.panY + m.y * c.hauteur * c.zoom));
}

// --- LA MARCHE -------------------------------------------------------------
const adoucir = (t) => 0.5 - Math.cos(Math.PI * borne(t, 0, 1)) / 2;
function arreterAnimation() {
    clearTimeout(minuteurEtape);
    minuteurEtape = null;
    if (rafAnim) cancelAnimationFrame(rafAnim);
    rafAnim = null;
    anim = null;
}
function synchroniserAnimation() {
    const cle = cleAnimation(voyage);
    if (!cle) { if (anim) arreterAnimation(); return; }
    if (anim && anim.cle === cle) return;
    arreterAnimation();
    const k = Number(voyage.Jour) || 1;
    const duree = Number(voyage.Duree_Marche_Ms) || dureeEtape(voyage, k).duree;
    const delai = Number(voyage.Delai_Depart_Ms) || 0;
    // Un voyage laissé en marche (tous les postes fermés) : on ne le rejoue pas.
    const perime = Date.now() - (Number(voyage.Debut_Marche) || 0) > duree + 6000;
    let de = 0, a = 1;
    if (voyage.Etat === "marche") { const t = troncon(voyage); de = t.de; a = t.a; }
    else if (voyage.Etat === "detour") { de = 0; a = arretDetour(voyage); }
    else if (voyage.Etat === "retour") { de = arretDetour(voyage); a = 0; }
    anim = { cle, id: voyage.Id, k, debut: performance.now(), duree: perime ? 0 : duree, delai: perime ? 0 : delai, de, a, f: perime ? a : de };
    // Le départ d'une journée (pas la reprise après un POI) : « JOUR k », et
    // chacun revient sur la carte du voyage.
    const debutDeJournee = voyage.Etat === "marche" && (voyage.Type !== "region" || Math.abs(de - journee(voyage, k).de) < 1e-9);
    const cleJour = `${voyage.Id}:${k}`;
    if (!perime && debutDeJournee && voyage.Type === "region" && !etapesVues.has(cleJour)) { etapesVues.add(cleJour); annoncerJour(k); }
    if (!perime && debutDeJournee && !vus.has("etape:" + cleJour)) {
        vus.add("etape:" + cleJour);
        amenerSurLaCarte(voyage);
    }
    const tick = () => {
        if (!anim || anim.cle !== cle) return;
        const t = anim.duree > anim.delai ? (performance.now() - anim.debut - anim.delai) / (anim.duree - anim.delai) : 1;
        anim.f = anim.de + (anim.a - anim.de) * adoucir(t);
        placerPions();
        if (t < 1) rafAnim = requestAnimationFrame(tick);
        else rafAnim = null;
    };
    rafAnim = requestAnimationFrame(tick);
    placerPions();
    // Le premier poste qui a fini fait avancer le voyage (un léger décalage
    // au hasard : ils ne se bousculent pas tous à la même milliseconde).
    const id = voyage.Id;
    minuteurEtape = setTimeout(() => { terminerEtape(id, cle); }, anim.duree + 150 + Math.floor(Math.random() * 450));
}
window.finirMarcheVoyage = function() {
    // Les bancs : la marche (ou le détour) en cours se termine tout de suite.
    if (!anim) return false;
    anim.duree = 0; anim.delai = 0; anim.f = anim.a;
    placerPions();
    clearTimeout(minuteurEtape);
    return terminerEtape(anim.id, anim.cle);
};

// --- CE QUE LA BASE DIT (app.js, l'écoute de la partie) ----------------------
window.appliquerVoyageDeLaPartie = function(data) {
    if (window.ID_PARTIE_COURANTE !== idPartieVue) {
        idPartieVue = window.ID_PARTIE_COURANTE;
        vus.clear(); etapesVues.clear(); annulationsVues.clear();
        derniereCle = null;
        arreterAnimation();
        choix = null;
    }
    partie = data || {};
    const v = partie.Voyage_Groupe && partie.Voyage_Groupe.Id ? partie.Voyage_Groupe : null;
    // Le POI (v277) : un lieu à créer (ce poste a-t-il les clés ?), l'arrivée.
    // Rejoué à chaque lecture : chaque appel ne fait son travail qu'une fois.
    if (v && v.Poi && ["detour", "halte"].includes(v.Etat)) reclamerCreationPoi(v);
    // Arrivés au lieu (v281) : le voyage vient de s'achever sur lui.
    const fin = partie.Voyage_Termine;
    if (fin && fin.Poi && fin.Poi.Id && Date.now() - (Number(fin.Le) || 0) < 120000) arriverAuPoi(fin.Poi);
    // Un combat qui commence ferme le mode voyage de ce poste.
    if (combatEnCours() && choix && choix.type === "voyage") quitterChoix();
    const cle = JSON.stringify([partie.Position_Groupe || null, partie.Lieu_Actuel || "", v, partie.Voyage_Annule || null, combatEnCours()]);
    if (cle === derniereCle) return;
    derniereCle = cle;
    const avant = voyage;
    voyage = v;
    // Un refus : chacun sait qui a dit non (une fois).
    const annule = partie.Voyage_Annule;
    if (annule && annule.Id && !annulationsVues.has(annule.Id) && avant && avant.Id === annule.Id && !v) {
        annulationsVues.add(annule.Id);
        annoncer(`Voyage annulé : ${annule.Par || "un joueur"} a refusé.`);
    }
    if (v && choix && choix.type === "voyage") choix = null;      // un seul voyage à la fois
    if (v && !vus.has(v.Id)) {
        vus.add(v.Id);
        if (v.Etat === "vote") amenerSurLaCarte(v);
    }
    synchroniserAnimation();
    if (typeof window.dessinerRegions === "function" && !v !== !avant) window.dessinerRegions();
    // Le POI refusé : chacun sait qui a passé son chemin.
    if (v && v.Poi_Ignore && v.Poi_Ignore.Id && !annulationsVues.has(v.Poi_Ignore.Id) && avant && avant.Poi && avant.Poi.Id === v.Poi_Ignore.Id) {
        annulationsVues.add(v.Poi_Ignore.Id);
        annoncer(`${v.Poi_Ignore.Par || "Quelqu'un"} préfère passer son chemin.`);
    }
    dessinerTout();
};
window.etatVoyageGroupe = () => ({
    position: positionEffective(), voyage: voyage ? JSON.parse(JSON.stringify(voyage)) : null,
    choix: window.choixVoyageGroupe(), anim: anim ? { cle: anim.cle, f: anim.f, de: anim.de, a: anim.a, duree: anim.duree, delai: anim.delai } : null,
    reglages: { ...reglages }
});

// --- LES RÉGLAGES (Carte_Monde/Groupe) ET LA POPUP DEV ---------------------
window.appliquerReglagesGroupeDeLaBase = function(data) {
    const d = data || {};
    if (Number(d.Taille_Monde) > 0) reglages.tailleMonde = borne(Number(d.Taille_Monde), ...BORNES_MONDE);
    if (Number(d.Taille_Region) > 0) reglages.tailleRegion = borne(Number(d.Taille_Region), ...BORNES_REGION);
    if (d.Chance_POI !== undefined && Number.isFinite(Number(d.Chance_POI))) reglages.chancePoi = borne(Number(d.Chance_POI), 0, 1);
    // Pendant qu'on glisse l'image, ce poste a la main sur le décalage.
    const lireDecalage = (src, dst) => { if (!src || glissePion) return;
        ["x", "y"].forEach(k => { if (Number.isFinite(Number(src[k]))) dst[k] = borne(Number(src[k]), ...BORNES_DECALAGE); }); };
    lireDecalage(d.Decalage_Monde, reglages.decalageMonde);
    lireDecalage(d.Decalage_Region, reglages.decalageRegion);
    placerPions();
    actualiserDev();
};
let minuteurReglages = null;
window.reglerTailleGroupe = function(vue, valeur, enregistrer) {
    if (!estDev()) return null;
    if (vue === "monde") reglages.tailleMonde = borne(Number(valeur) || TAILLE_MONDE_DEFAUT, ...BORNES_MONDE);
    else if (vue === "poi") reglages.chancePoi = borne(Number(valeur), 0, 1);
    else reglages.tailleRegion = borne(Number(valeur) || TAILLE_REGION_DEFAUT, ...BORNES_REGION);
    placerPions();
    actualiserDev();
    ecrireReglages(!!enregistrer);
    return vue === "monde" ? reglages.tailleMonde : vue === "poi" ? reglages.chancePoi : reglages.tailleRegion;
};
// Tout de suite, ou une demi-seconde après le dernier geste.
function ecrireReglages(maintenant) {
    clearTimeout(minuteurReglages);
    const ecrire = () => setDoc(refReglages(), {
        Taille_Monde: reglages.tailleMonde, Taille_Region: arrondi(reglages.tailleRegion), Chance_POI: arrondi(reglages.chancePoi, 100),
        Decalage_Monde: { x: arrondi(reglages.decalageMonde.x, 1000), y: arrondi(reglages.decalageMonde.y, 1000) },
        Decalage_Region: { x: arrondi(reglages.decalageRegion.x, 1000), y: arrondi(reglages.decalageRegion.y, 1000) }
    }, { merge: true }).catch(e => console.error("Réglages du groupe :", e));
    if (maintenant) ecrire(); else minuteurReglages = setTimeout(ecrire, 500);
}
function actualiserDev() {
    const tm = $("taille-groupe-monde"), tr = $("taille-groupe-region"), cp = $("chance-poi");
    if (tm && document.activeElement !== tm) tm.value = String(reglages.tailleMonde);
    if (tr && document.activeElement !== tr) tr.value = String(reglages.tailleRegion);
    if (cp && document.activeElement !== cp) cp.value = String(reglages.chancePoi);
    const vp = $("chance-poi-valeur");
    if (vp) vp.textContent = `${Math.round(reglages.chancePoi * 100)} %`;
    const vm = $("taille-groupe-monde-valeur"), vr = $("taille-groupe-region-valeur");
    if (vm) vm.textContent = `${Math.round(reglages.tailleMonde)} px`;
    if (vr) vr.textContent = `${Math.round(reglages.tailleRegion * 1000) / 10} %`;
    // Le réglage de l'image (v281) : le bouton, les curseurs du décalage.
    ["monde", "region"].forEach(vue => {
        const b = $("btn-reglage-pion-" + vue), bloc = $("reglage-pion-" + vue);
        if (b) { b.classList.toggle("actif", reglagePion); b.textContent = reglagePion ? "✓ Terminer le réglage de l'image" : "✛ Régler l'image du groupe"; }
        if (bloc) bloc.style.display = reglagePion ? "block" : "none";
        const d = vue === "monde" ? reglages.decalageMonde : reglages.decalageRegion;
        ["x", "y"].forEach(k => {
            const curseur = $(`decalage-pion-${vue}-${k}`), valeur = $(`decalage-pion-${vue}-${k}-valeur`);
            if (curseur && document.activeElement !== curseur) curseur.value = String(d[k]);
            if (valeur) valeur.textContent = `${d[k] > 0 ? "+" : ""}${Math.round(d[k] * 100)} %`;
        });
    });
    const tele = choix && choix.type === "teleport";
    ["btn-groupe-teleport-monde", "btn-groupe-teleport-region"].forEach(id => {
        const b = $(id);
        if (!b) return;
        b.classList.toggle("actif", tele);
        b.disabled = !window.ID_PARTIE_COURANTE;
        b.textContent = tele ? "✕ Annuler le téléport" : "⤳ Déplacer le groupe (téléport)";
    });
    const pos = positionEffective();
    const etat = pos ? `Le groupe : ${nomRegion(pos.Region)}${partie && partie.Lieu_Actuel && window.VILLAGES_REGIONAUX && window.VILLAGES_REGIONAUX[partie.Lieu_Actuel] ? ` · ${window.VILLAGES_REGIONAUX[partie.Lieu_Actuel].nom}` : ""}`
                     : (window.ID_PARTIE_COURANTE ? "Le groupe n'a pas encore de place." : "Aucune partie chargée.");
    ["groupe-dev-monde-etat", "groupe-dev-region-etat"].forEach(id => { const e = $(id); if (e) e.textContent = etat; });
}

// --- AU CHARGEMENT ---------------------------------------------------------
(function demarrer() {
    // Le toucher sur la carte régionale, en mode choix : un appui relâché
    // sans avoir glissé. (La carte prend le pointeur : on écoute en amont.)
    let appui = null;
    window.addEventListener("pointerdown", (e) => {
        const vue = $("vue-carte-region");
        appui = (choix && choix.vue === "region" && vue && vue.contains(e.target)) ? { x: e.clientX, y: e.clientY, id: e.pointerId, n: 1 } : null;
    }, true);
    window.addEventListener("pointerup", (e) => {
        if (!appui || e.pointerId !== appui.id) return;
        const a = appui;
        appui = null;
        if (Math.hypot(e.clientX - a.x, e.clientY - a.y) > SEUIL_TAP) return;
        window.surChoixPointRegion(e.clientX, e.clientY);
    }, true);
    // Un second doigt : c'est un pincement, pas un choix.
    window.addEventListener("pointerdown", (e) => { if (appui && e.pointerId !== appui.id) appui = null; });
    window.addEventListener("keydown", (e) => { if (e.key === "Escape" && choix) { quitterChoix(); } });
    // La carte change : le mode choix (lié à la vue) s'arrête ; les pions suivent.
    window.addEventListener("carte-regionale", () => {
        if (choix && (choix.vue === "region") !== !!carteOuverte()) quitterChoix();
        dessinerTout();
    });
    window.addEventListener("resize", () => requestAnimationFrame(dessinerTout));
    // Un lieu dessiné sur la carte (le POI devenu lieu) : le point d'exclamation s'efface.
    window.addEventListener("villages-regionaux-maj", () => requestAnimationFrame(placerPions));
    const lancer = () => {
        bouton();
        pionMonde();
        calquesRegion();
        // Le bouton suit celui qui déplie le menu (il se montre avec lui).
        const rouvrir = $("btn-rouvrir-menu");
        if (rouvrir && typeof MutationObserver === "function") {
            new MutationObserver(actualiserBouton).observe(rouvrir, { attributes: true, attributeFilter: ["style"] });
        }
        // Le DEV s'éteint : le téléport s'arrête.
        const avant = window.actualiserRegionsDev;
        if (typeof avant === "function" && !avant.__voyage) {
            const env = function() { const r = avant.apply(this, arguments); if (!estDev() && choix && choix.type === "teleport") quitterChoix(); actualiserDev(); return r; };
            env.__voyage = true;
            window.actualiserRegionsDev = env;
        }
        const ecouter = () => {
            try {
                onSnapshot(refReglages(), (snap) => window.appliquerReglagesGroupeDeLaBase(snap && snap.exists() ? snap.data() : {}),
                           (e) => console.error("Réglages du groupe :", e));
            } catch (e) { console.error("Réglages du groupe :", e); }
        };
        if (window.PorteJoueur) window.PorteJoueur.quand(ecouter); else ecouter();
        dessinerTout();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lancer);
    else lancer();
})();
