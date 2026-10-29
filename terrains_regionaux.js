// =========================================================================
//  IVALIS — LES TERRAINS PRATICABLES DES CARTES RÉGIONALES (v275)
// =========================================================================
//  Nico : « dans le bouton DEV, une nouvelle ancre pour les boîtes
//  régionales, même principe que les boîtes du monde. Elles délimitent le
//  terrain praticable de chaque carte régionale : on s'en sert pour les
//  voyages entre les régions. »
//
//  LA FORME : comme les boîtes de la carte du monde (regions_carte.js) — un
//  polygone qui naît rectangle, une poignée par point, un clic sur un bord en
//  ajoute un, un double-clic sur un point le retire. Ses points sont en
//  FRACTIONS de l'image (0 → 1) : la forme ne dépend ni de l'écran, ni de la
//  taille de l'image servie.
//
//  À QUOI ILS SERVENT (voyage_groupe.js) :
//    · une destination de marche doit être sur un terrain praticable (un
//      village connu est toujours une destination valable) ;
//    · le chemin tracé reste dessus autant qu'il peut ;
//    · en arrivant d'une autre région, le groupe apparaît au BORD du terrain,
//      du côté d'où il vient (pointArriveeRegion).
//
//  LA BASE : la fiche de la carte, Cartes_Regionales/{n} — { Terrains:
//  { "<k>": { Numero, Points: [{ x, y }, …] } }, Prochain_Terrain, Aspect }.
//  Aspect (largeur / hauteur de l'image) sert aux calculs faits carte fermée.
//
//  L'ÉDITION : DEV, sur une carte régionale ouverte, case « Afficher les
//  terrains » de la popup rouge. Hors édition, les terrains sont invisibles.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import {
    doc, setDoc, updateDoc, deleteField
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const COLLECTION = "Cartes_Regionales";
const SVG_NS = "http://www.w3.org/2000/svg";
const SEUIL_GLISSE = 4;            // pixels d'écran avant qu'un appui devienne un glissé
const TAILLE_NOUVEAU = { l: 0.3, h: 0.25 };   // en fractions de l'image
const ASPECT_PAR_DEFAUT = 1.6;     // une carte jamais ouverte en DEV
const MARGE_BORD = 0.035;          // l'apparition, un peu en dedans du bord (en hauteurs de carte)

const $ = (id) => document.getElementById(id);
const estDev = () => { try { return localStorage.getItem("ivalis_DEV_MODE") === "on"; } catch (e) { return false; } };
const borne = (v, min, max) => Math.max(min, Math.min(max, v));
const arrondi = (v) => Math.round(v * 10000) / 10000;
const carteOuverte = () => (typeof window.carteRegionaleOuverte === "function" ? window.carteRegionaleOuverte() : null);
const cadrage = () => (typeof window.cadrageCarteRegion === "function" ? window.cadrageCarteRegion() : null);
const copie = (pts) => pts.map(p => ({ x: p.x, y: p.y }));

let edition = false;
let selection = null;      // le numéro du terrain choisi (sur la carte ouverte)
let geste = null;
let majEnAttente = false;  // une lecture de la base arrivée pendant un glissé
const locaux = {};         // n → [{ numero, points }] : ce que ce poste affiche

window.editionTerrainsRegion = () => edition && estDev() && !!carteOuverte();

// --- LES DONNÉES -----------------------------------------------------------
function depuisLaBase(n) {
    const carte = (window.CARTES_REGIONALES || {})[n];
    return carte && Array.isArray(carte.terrains) ? carte.terrains.map(t => ({ numero: t.numero, points: copie(t.points) })) : [];
}
function terrains(n) {
    const k = Number(n);
    if (!locaux[k]) locaux[k] = depuisLaBase(k);
    return locaux[k];
}
window.terrainsRegion = (n) => terrains(n).map(t => ({ numero: t.numero, points: copie(t.points) }));
window.terrainsDefinisRegion = (n) => terrains(n).length > 0;
// Les proportions de l'image : la carte ouverte les connaît, sinon sa fiche.
function aspect(n) {
    const c = cadrage();
    if (c && c.numero === Number(n) && c.largeur && c.hauteur) return c.largeur / c.hauteur;
    const carte = (window.CARTES_REGIONALES || {})[n];
    return (carte && carte.aspect) || ASPECT_PAR_DEFAUT;
}
window.aspectCarteRegionale = aspect;

// --- LA GÉOMÉTRIE (en fractions ; un point dans un polygone ne dépend pas
//     de l'échelle) ----------------------------------------------------------
function dansPolygone(p, pts) {
    let dedans = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / ((b.y - a.y) || 1e-12) + a.x) dedans = !dedans;
    }
    return dedans;
}
window.pointDansPolygone = dansPolygone;
window.pointSurTerrainRegion = (n, x, y) => terrains(n).some(t => dansPolygone({ x, y }, t.points));
function aire(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; }
    return Math.abs(a) / 2;
}
// Le cœur du plus grand terrain (son centre de gravité, ou le point du
// terrain le plus proche de lui si la forme est creuse). Sans terrain : le
// milieu de la carte.
window.centreTerrainRegion = function(n) {
    const liste = terrains(n);
    if (!liste.length) return { x: 0.5, y: 0.5 };
    const grand = liste.slice().sort((a, b) => aire(b.points) - aire(a.points))[0];
    const c = typeof window.centreRegion === "function" ? window.centreRegion(grand.points) : grand.points[0];
    if (dansPolygone(c, grand.points)) return { x: c.x, y: c.y };
    let meilleur = null;
    for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) {
        const p = { x: (i + 0.5) / 40, y: (j + 0.5) / 40 };
        if (!dansPolygone(p, grand.points)) continue;
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        if (!meilleur || d < meilleur.d) meilleur = { ...p, d };
    }
    return meilleur ? { x: meilleur.x, y: meilleur.y } : { x: c.x, y: c.y };
};

// L'APPARITION EN ARRIVANT D'UNE AUTRE RÉGION (Nico) : « dans la direction
// d'où vient le pion du monde par rapport à la région d'arrivée, ET au bord
// du terrain praticable ». Un rayon part du cœur du terrain vers la région
// quittée (les cartes régionales sont orientées comme le monde) ; le groupe
// apparaît là où il sort du terrain, un peu en dedans. Sans terrain tracé :
// le bord de la carte, un peu en dedans.
window.pointArriveeRegion = function(n, direction) {
    const asp = aspect(n);
    const centre = window.centreTerrainRegion(n);
    const dx = Number(direction && direction.dx) || 0, dy = Number(direction && direction.dy) || 0;
    const longueur = Math.hypot(dx, dy);
    if (!(longueur > 1e-9)) return centre;
    const d = { x: dx / longueur, y: dy / longueur };
    const C = { x: centre.x * asp, y: centre.y };   // en hauteurs de carte
    const point = (t) => ({ x: borne((C.x + d.x * t) / asp, 0, 1), y: borne(C.y + d.y * t, 0, 1) });
    // Jusqu'où va le rayon : le plus lointain croisement avec un bord de
    // terrain, et au plus le cadre de la carte rentré de 6 %.
    let tTerrain = 0, tCadre = 0;
    const croiser = (A, B, garder) => {
        const ex = B.x - A.x, ey = B.y - A.y;
        const den = d.x * ey - d.y * ex;
        if (Math.abs(den) < 1e-12) return;
        const t = ((A.x - C.x) * ey - (A.y - C.y) * ex) / den;
        const u = ((A.x - C.x) * d.y - (A.y - C.y) * d.x) / den;
        if (t > 0 && u >= 0 && u <= 1) garder(t);
    };
    const m = 0.06, cadre = [{ x: m * asp, y: m }, { x: (1 - m) * asp, y: m }, { x: (1 - m) * asp, y: 1 - m }, { x: m * asp, y: 1 - m }];
    cadre.forEach((A, i) => croiser(A, cadre[(i + 1) % 4], (t) => { tCadre = Math.max(tCadre, t); }));
    const liste = terrains(n);
    if (!liste.length) return point(tCadre);
    liste.forEach(ter => ter.points.forEach((p, i) => {
        const q = ter.points[(i + 1) % ter.points.length];
        croiser({ x: p.x * asp, y: p.y }, { x: q.x * asp, y: q.y }, (t) => { tTerrain = Math.max(tTerrain, t); });
    }));
    // On remonte le rayon depuis le plus loin : le premier point sur le
    // terrain est son bord ; le groupe apparaît un peu en dedans (ou au
    // milieu de la bande de terrain, si elle est plus étroite que la marge).
    const PAS = 0.004;
    const sur = (t) => { const P = point(t); return window.pointSurTerrainRegion(n, P.x, P.y); };
    let t = Math.max(tTerrain, 0) + PAS;
    while (t > 0 && !sur(t)) t -= PAS;
    if (!(t > 0)) return centre;
    const bord = t;
    let fond = bord;
    while (fond - PAS > 0 && sur(fond - PAS) && bord - fond < MARGE_BORD) fond -= PAS;
    const voulu = bord - fond >= MARGE_BORD ? bord - MARGE_BORD : (bord + fond) / 2;
    return point(voulu);
};

// --- LA BASE ---------------------------------------------------------------
// Une lecture de la base (cartes_regionales.js) : ce poste la suit, sauf
// pendant un glissé (on l'appliquera au lâcher).
function suivreLaBase() {
    if (geste) { majEnAttente = true; return; }
    Object.keys(locaux).forEach(k => { locaux[k] = depuisLaBase(Number(k)); });
    const n = carteOuverte();
    if (selection && n && !terrains(n).some(t => t.numero === selection)) selection = null;
    dessiner();
}
function champsTerrains(n) {
    const carte = (window.CARTES_REGIONALES || {})[n] || {};
    const map = {};
    terrains(n).forEach(t => { map[t.numero] = { Numero: t.numero, Points: t.points.map(p => ({ x: arrondi(p.x), y: arrondi(p.y) })) }; });
    const prochain = Math.max(Number(carte.prochainTerrain) || 1, ...terrains(n).map(t => t.numero + 1));
    return { map, prochain };
}
async function enregistrerTerrain(n, numero) {
    const t = terrains(n).find(x => x.numero === numero);
    if (!t) return false;
    const { map, prochain } = champsTerrains(n);
    const carte = (window.CARTES_REGIONALES || {})[n] || {};
    const champs = { Numero: Number(n), Prochain_Terrain: prochain, Aspect: arrondi(aspect(n)) };
    if (carte.nom) champs.Nom = carte.nom;
    if (typeof window.majFicheRegionaleLocale === "function") window.majFicheRegionaleLocale(n, { Terrains: map, Prochain_Terrain: prochain, Aspect: champs.Aspect });
    try {
        await setDoc(doc(db, COLLECTION, String(n)), { ...champs, Terrains: { [numero]: map[numero] } }, { merge: true });
        return true;
    } catch (e) { console.error("Terrain " + numero + " de la carte " + n + " :", e); return false; }
}

window.creerTerrainRegion = async function() {
    const n = carteOuverte(), c = cadrage();
    if (!n || !c || !c.largeur || !estDev()) return null;
    const ecran = $("ecran-jeu") && $("ecran-jeu").getBoundingClientRect();
    const milieu = typeof window.pointImageCarteRegion === "function"
        ? window.pointImageCarteRegion((ecran ? ecran.left + ecran.width / 2 : innerWidth / 2), (ecran ? ecran.top + ecran.height / 2 : innerHeight / 2))
        : { x: c.largeur / 2, y: c.hauteur / 2 };
    const cx = borne(milieu.x / c.largeur, TAILLE_NOUVEAU.l / 2, 1 - TAILLE_NOUVEAU.l / 2);
    const cy = borne(milieu.y / c.hauteur, TAILLE_NOUVEAU.h / 2, 1 - TAILLE_NOUVEAU.h / 2);
    const decalage = (terrains(n).length % 5) * 0.02;
    const x0 = arrondi(borne(cx - TAILLE_NOUVEAU.l / 2 + decalage, 0, 1)), y0 = arrondi(borne(cy - TAILLE_NOUVEAU.h / 2 + decalage, 0, 1));
    const x1 = arrondi(borne(x0 + TAILLE_NOUVEAU.l, 0, 1)), y1 = arrondi(borne(y0 + TAILLE_NOUVEAU.h, 0, 1));
    const carte = (window.CARTES_REGIONALES || {})[n] || {};
    const numero = Math.max(Number(carte.prochainTerrain) || 1, ...terrains(n).map(t => t.numero + 1), 1);
    terrains(n).push({ numero, points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] });
    selection = numero;
    if (!edition) window.basculerEditionTerrains(true); else dessiner();
    await enregistrerTerrain(n, numero);
    return numero;
};

window.supprimerTerrainRegion = async function(numero, options) {
    const n = carteOuverte();
    const k = Number(numero || selection);
    if (!n || !k) return false;
    const liste = terrains(n);
    const i = liste.findIndex(t => t.numero === k);
    if (i < 0) return false;
    if (!(options && options.sansConfirmer) && !confirm(`Supprimer le terrain n° ${k} de cette carte ?`)) return false;
    liste.splice(i, 1);
    if (selection === k) selection = null;
    const { map } = champsTerrains(n);
    if (typeof window.majFicheRegionaleLocale === "function") window.majFicheRegionaleLocale(n, { Terrains: map });
    dessiner();
    try { await updateDoc(doc(db, COLLECTION, String(n)), { ["Terrains." + k]: deleteField() }); }
    catch (e) { console.error("Suppression du terrain " + k + " :", e); }
    return true;
};

// --- LE DESSIN -------------------------------------------------------------
function calque() {
    const carte = $("carte-region");
    if (!carte) return null;
    let svg = $("carte-region-terrains");
    if (!svg) {
        svg = document.createElementNS(SVG_NS, "svg");
        svg.id = "carte-region-terrains";
        svg.setAttribute("class", "carte-region-terrains");
        svg.setAttribute("preserveAspectRatio", "none");
        // Au-dessus des nuages et de la peinture, sous les pastilles et le titre.
        const avant = $("carte-region-pastilles");
        carte.insertBefore(svg, avant || null);
        brancherGestes(svg);
    }
    return svg;
}
const el = (nom, attrs) => {
    const e = document.createElementNS(SVG_NS, nom);
    Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v));
    return e;
};
function dessiner() {
    const svg = calque();
    if (!svg) return;
    const n = carteOuverte(), c = cadrage();
    const actif = window.editionTerrainsRegion() && c && c.largeur;
    svg.style.display = actif ? "block" : "none";
    svg.innerHTML = "";
    if (actif) {
        const L = c.largeur, H = c.hauteur, zoom = c.zoom || 1;
        svg.setAttribute("viewBox", `0 0 ${L} ${H}`);
        const poignee = 14 / zoom, police = 26 / zoom;
        terrains(n).forEach(t => {
            const g = el("g", { class: "terrain" + (selection === t.numero ? " selectionne" : ""), "data-numero": t.numero });
            const pts = t.points.map(p => ({ x: p.x * L, y: p.y * H }));
            g.appendChild(el("polygon", { class: "terrain-forme", points: pts.map(p => `${p.x},${p.y}`).join(" "), "data-role": "forme" }));
            pts.forEach((p, i) => {
                const q = pts[(i + 1) % pts.length];
                g.appendChild(el("line", { class: "terrain-bord", x1: p.x, y1: p.y, x2: q.x, y2: q.y, "data-role": "bord", "data-index": i }));
            });
            const centre = typeof window.centreRegion === "function" ? window.centreRegion(pts) : pts[0];
            const texte = el("text", { class: "terrain-numero", x: centre.x, y: centre.y, "font-size": police, "stroke-width": 5 / zoom,
                                       "text-anchor": "middle", "dominant-baseline": "central" });
            texte.textContent = String(t.numero);
            g.appendChild(texte);
            pts.forEach((p, i) => g.appendChild(el("rect", { class: "terrain-poignee", x: p.x - poignee / 2, y: p.y - poignee / 2,
                                                              width: poignee, height: poignee, "data-role": "point", "data-index": i })));
            svg.appendChild(g);
        });
    }
    actualiserPopup();
}
window.dessinerTerrainsRegion = dessiner;

// --- LES GESTES ------------------------------------------------------------
//  Ils prennent le doigt avant la carte (qui glisserait sinon).
function brancherGestes(svg) {
    svg.addEventListener("pointerdown", (e) => {
        if (!window.editionTerrainsRegion()) return;
        const cible = e.target.closest && e.target.closest("[data-role]");
        const g = e.target.closest && e.target.closest(".terrain");
        if (!cible || !g) return;
        e.preventDefault();
        e.stopPropagation();
        const n = carteOuverte(), c = cadrage();
        const numero = Number(g.getAttribute("data-numero"));
        const t = terrains(n).find(x => x.numero === numero);
        if (!t || !c) return;
        const role = cible.getAttribute("data-role");
        const ici = pointFraction(e.clientX, e.clientY, c);
        let index = Number(cible.getAttribute("data-index"));
        let cree = false;
        if (role === "bord") {
            // Un nouveau point, là où le doigt a touché le bord, aussitôt saisi.
            const a = t.points[index], b = t.points[(index + 1) % t.points.length];
            const p = projeter(ici, a, b, c);
            t.points.splice(index + 1, 0, p);
            index += 1;
            cree = true;
        }
        selection = numero;
        geste = { type: role === "forme" ? "deplacer" : "point", n, numero, index, depart: ici, ecranX: e.clientX, ecranY: e.clientY,
                  points: copie(t.points), bouge: false, cree };
        if (cree) dessiner(); else marquerSelection();
    });
    window.addEventListener("pointermove", (e) => {
        if (!geste) return;
        const t = terrains(geste.n).find(x => x.numero === geste.numero);
        const c = cadrage();
        if (!t || !c || c.numero !== geste.n) { geste = null; return; }
        if (!geste.bouge && Math.hypot(e.clientX - geste.ecranX, e.clientY - geste.ecranY) < SEUIL_GLISSE) return;
        geste.bouge = true;
        e.preventDefault();
        const ici = pointFraction(e.clientX, e.clientY, c);
        if (geste.type === "deplacer") {
            const xs = geste.points.map(p => p.x), ys = geste.points.map(p => p.y);
            const dx = borne(ici.x - geste.depart.x, -Math.min(...xs), 1 - Math.max(...xs));
            const dy = borne(ici.y - geste.depart.y, -Math.min(...ys), 1 - Math.max(...ys));
            t.points = geste.points.map(p => ({ x: arrondi(p.x + dx), y: arrondi(p.y + dy) }));
        } else {
            t.points[geste.index] = { x: arrondi(borne(ici.x, 0, 1)), y: arrondi(borne(ici.y, 0, 1)) };
        }
        dessiner();
    });
    const finir = () => {
        if (!geste) return;
        const { n, numero, bouge, cree } = geste;
        geste = null;
        if (bouge || cree) enregistrerTerrain(n, numero);
        if (majEnAttente) { majEnAttente = false; suivreLaBase(); }
        else if (bouge) dessiner();
    };
    window.addEventListener("pointerup", finir);
    window.addEventListener("pointercancel", finir);
    svg.addEventListener("dblclick", (e) => {
        if (!window.editionTerrainsRegion()) return;
        const cible = e.target.closest && e.target.closest('[data-role="point"]');
        const g = e.target.closest && e.target.closest(".terrain");
        if (!cible || !g) return;
        e.preventDefault();
        e.stopPropagation();
        const n = carteOuverte();
        const numero = Number(g.getAttribute("data-numero"));
        const t = terrains(n).find(x => x.numero === numero);
        if (!t || t.points.length <= 3) return;
        t.points.splice(Number(cible.getAttribute("data-index")), 1);
        dessiner();
        enregistrerTerrain(n, numero);
    });
}
function pointFraction(clientX, clientY, c) {
    const p = typeof window.pointImageCarteRegion === "function" ? window.pointImageCarteRegion(clientX, clientY) : { x: 0, y: 0 };
    return { x: p.x / (c.largeur || 1), y: p.y / (c.hauteur || 1) };
}
// Le point du bord [a, b] le plus proche de p (en pixels de l'image, pour
// que la projection ne soit pas faussée par les proportions).
function projeter(p, a, b, c) {
    const L = c.largeur || 1, H = c.hauteur || 1;
    const ax = a.x * L, ay = a.y * H, bx = b.x * L, by = b.y * H, px = p.x * L, py = p.y * H;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = borne(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return { x: arrondi(borne((ax + t * dx) / L, 0, 1)), y: arrondi(borne((ay + t * dy) / H, 0, 1)) };
}
function marquerSelection() {
    document.querySelectorAll("#carte-region-terrains .terrain").forEach(g =>
        g.classList.toggle("selectionne", Number(g.getAttribute("data-numero")) === selection));
    actualiserPopup();
}

// --- LA POPUP DEV ----------------------------------------------------------
function actualiserPopup() {
    const n = carteOuverte();
    const caseVisibles = $("case-terrains-visibles");
    if (caseVisibles) caseVisibles.checked = window.editionTerrainsRegion();
    const info = $("terrains-dev-selection"), suppr = $("btn-terrain-supprimer"), total = $("terrains-dev-total");
    const t = n && selection && terrains(n).find(x => x.numero === selection);
    if (info) info.textContent = t ? `Terrain n° ${t.numero} sélectionné · ${t.points.length} points` : "Aucun terrain sélectionné";
    if (suppr) suppr.disabled = !t || !window.editionTerrainsRegion();
    if (total) {
        const k = n ? terrains(n).length : 0;
        total.textContent = k === 0 ? "Aucun terrain praticable tracé : le groupe marche partout" : `${k} terrain${k > 1 ? "s" : ""} praticable${k > 1 ? "s" : ""} sur cette carte`;
    }
}
// Afficher les terrains, c'est les éditer : le pinceau, la gomme et le titre
// sont lâchés (un seul outil à la fois).
window.basculerEditionTerrains = function(oui) {
    const voulu = (typeof oui === "boolean" ? oui : !edition) && estDev() && !!carteOuverte();
    edition = voulu;
    if (edition) {
        const c = cadrage();
        if (typeof window.outilCarteRegion === "function" && window.outilCarteRegion() && typeof window.choisirOutilRegion === "function")
            window.choisirOutilRegion(window.outilCarteRegion());
        if (c && typeof window.basculerEditionTitreRegion === "function") window.basculerEditionTitreRegion(false);
    } else selection = null;
    dessiner();
    return edition;
};

// --- AU CHARGEMENT ---------------------------------------------------------
(function demarrer() {
    window.addEventListener("cartes-regionales-maj", suivreLaBase);
    window.addEventListener("carte-regionale", (e) => {
        // On change de carte : l'édition s'arrête.
        if (!(e.detail && e.detail.ouverte)) { edition = false; selection = null; }
        else { const n = Number(e.detail.numero); locaux[n] = depuisLaBase(n); }
        dessiner();
    });
    window.addEventListener("resize", () => { if (carteOuverte()) requestAnimationFrame(dessiner); });
    // Le zoom de la carte change la taille des poignées : on suit la molette
    // et les doigts (un instant après, une seule fois par image).
    let attente = null, dernierZoom = null;
    const suivreZoom = () => {
        if (!window.editionTerrainsRegion() || attente) return;
        attente = requestAnimationFrame(() => {
            attente = null;
            const c = cadrage();
            if (!c || c.zoom === dernierZoom || geste) return;
            dernierZoom = c.zoom;
            dessiner();
        });
    };
    const lancer = () => {
        const vue = $("vue-carte-region");
        if (vue) { vue.addEventListener("wheel", suivreZoom, { passive: true }); vue.addEventListener("pointermove", suivreZoom, { passive: true }); }
        // Un outil choisi, ou le titre en édition : les terrains se rangent.
        const outil = window.choisirOutilRegion;
        if (typeof outil === "function" && !outil.__terrains) {
            const env = function() { const r = outil.apply(this, arguments); if (r && edition) { edition = false; selection = null; dessiner(); } return r; };
            env.__terrains = true;
            window.choisirOutilRegion = env;
        }
        const titre = window.basculerEditionTitreRegion;
        if (typeof titre === "function" && !titre.__terrains) {
            const env = function() { const r = titre.apply(this, arguments); if (r && edition) { edition = false; selection = null; dessiner(); } return r; };
            env.__terrains = true;
            window.basculerEditionTitreRegion = env;
        }
        // Le DEV s'éteint : l'édition s'arrête.
        const avant = window.actualiserRegionsDev;
        if (typeof avant === "function" && !avant.__terrains) {
            const env = function() { const r = avant.apply(this, arguments); if (!estDev()) { edition = false; selection = null; } dessiner(); return r; };
            env.__terrains = true;
            window.actualiserRegionsDev = env;
        }
        dessiner();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lancer);
    else lancer();
})();
