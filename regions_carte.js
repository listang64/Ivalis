// =========================================================================
//  IVALIS — LES RÉGIONS DE LA CARTE DU MONDE (v257)
// =========================================================================
//  Nico : « sur la page principale de jeu, une fois la partie chargée, un
//  bouton rouge qui n'apparaît que quand DEV est activé, avec les boutons en
//  bas à droite. Il ouvre une petite popup au-dessus, qui reste à l'écran tant
//  qu'on ne la ferme pas. Dedans : une case pour afficher ou masquer les
//  boîtes, un bouton pour créer une nouvelle boîte. Ces boîtes sont des zones
//  cliquables attachées à la carte en fond d'écran, chacune avec un numéro
//  unique (affiché dedans) — pour dire plus tard quoi faire quand on clique
//  dessus : ce seront les régions du jeu. En mode DEV, boîtes affichées, le
//  clic ne fait rien : on est en mode édition. Clic maintenu et on bouge :
//  la boîte se déplace. Un petit carré à chaque coin, qu'on étire ou qu'on
//  rétracte. Un clic sur un bord crée un nouveau point, qu'on étire pour
//  faire une forme sur mesure. »
//
//  LA FORME : un polygone, en coordonnées de la CARTE (3840 × 2160) — il suit le glissement de la carte et ne dépend pas de
//  la taille de l'écran. Il naît rectangle (quatre points), chaque point a sa
//  poignée, chaque bord en ajoute un.
//
//  LES DEUX MODES :
//    - ÉDITION : mode DEV et case « Afficher les boîtes » cochée. Les boîtes
//      se voient, se déplacent, se déforment ; un clic ne déclenche rien.
//    - JEU : sinon. Les boîtes sont invisibles ; une boîte qui a une action
//      (ACTIONS_REGIONS[numéro], à venir) la joue au clic. Une boîte sans
//      action laisse passer le clic à la carte.
//
//  LA BASE : un seul document, Carte_Monde/Regions — { Prochain_Numero,
//  Regions: { "<n>": { Numero, Points: [{ x, y }, …] } } }, écouté par tous
//  les postes. Un numéro n'est JAMAIS réutilisé, même après une suppression
//  (Prochain_Numero, tiré dans une transaction).
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import {
    doc, onSnapshot, setDoc, updateDoc, deleteField, runTransaction
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const LARGEUR = 3840, HAUTEUR = 2160;
const CHEMIN = ["Carte_Monde", "Regions"];
const CLE_VISIBLES = "ivalis_REGIONS_VISIBLES";
const SVG_NS = "http://www.w3.org/2000/svg";
const TAILLE_NOUVELLE = { l: 360, h: 240 };
const SEUIL_GLISSE = 4;          // pixels d'écran avant qu'un appui devienne un glissé

window.REGIONS_CARTE = window.REGIONS_CARTE || {};
window.ACTIONS_REGIONS = window.ACTIONS_REGIONS || {};
let prochainNumero = 1;
let selection = null;
let geste = null;                // le glissé en cours
let instantaneEnAttente = null;  // une lecture de la base arrivée pendant un glissé

const ref = () => doc(db, ...CHEMIN);
const estDev = () => { try { return localStorage.getItem("ivalis_DEV_MODE") === "on"; } catch (e) { return false; } };
const visiblesCoche = () => { try { return localStorage.getItem(CLE_VISIBLES) === "on"; } catch (e) { return false; } };
// LE MODE DESCRIPTIFS (v274, descriptifs_regions.js) prend le pas sur
// l'édition des boîtes : un seul mode DEV à la fois.
const modeDescriptif = () => typeof window.modeDescriptifRegions === "function" && window.modeDescriptifRegions();
// LE CHOIX D'UNE DESTINATION (v275, voyage_groupe.js) : le mode voyage, ou le
// téléport du DEV, sur la carte du monde — toute boîte se touche, et le clic
// choisit la région au lieu d'ouvrir sa carte.
const modeChoix = () => typeof window.modeChoixCarte === "function" && window.modeChoixCarte() === "monde";
window.modeEditionRegions = () => estDev() && visiblesCoche() && !modeDescriptif() && !modeChoix();
const zoomCarte = () => (typeof window.cadrageCarteMonde === "function" && window.cadrageCarteMonde().zoom) || 1;
const borner = (v, max) => Math.max(0, Math.min(max, Math.round(v)));
const copiePoints = (pts) => pts.map(p => ({ x: p.x, y: p.y }));

// --- LA GÉOMÉTRIE ----------------------------------------------------------
// Le centre de gravité du polygone (là où s'écrit le numéro).
window.centreRegion = function(points) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < points.length; i++) {
        const p = points[i], q = points[(i + 1) % points.length];
        const f = p.x * q.y - q.x * p.y;
        a += f; cx += (p.x + q.x) * f; cy += (p.y + q.y) * f;
    }
    if (Math.abs(a) < 1e-6) {
        const n = points.length || 1;
        return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n };
    }
    return { x: cx / (3 * a), y: cy / (3 * a) };
};
// Le point du bord [a, b] le plus proche de p.
function projeterSurBord(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    return { x: a.x + t * dx, y: a.y + t * dy };
}
// Un point de l'écran, en coordonnées de la carte.
window.pointCarteDepuisEcran = function(clientX, clientY) {
    const carte = document.getElementById("carte-fond-jeu");
    if (!carte) return { x: 0, y: 0 };
    const r = carte.getBoundingClientRect();
    return { x: (clientX - r.left) * LARGEUR / (r.width || LARGEUR), y: (clientY - r.top) * HAUTEUR / (r.height || HAUTEUR) };
};

// --- LA BASE ---------------------------------------------------------------
function lireDocument(data) {
    const regions = {};
    Object.entries((data && data.Regions) || {}).forEach(([cle, r]) => {
        const numero = Number((r && r.Numero) || cle);
        const points = Array.isArray(r && r.Points) ? r.Points.map(p => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 })) : [];
        if (numero > 0 && points.length >= 3) regions[numero] = { numero, points };
    });
    return regions;
}
function appliquerInstantane(data) {
    if (geste) { instantaneEnAttente = data; return; }
    window.REGIONS_CARTE = lireDocument(data);
    const max = Math.max(0, ...Object.keys(window.REGIONS_CARTE).map(Number));
    prochainNumero = Math.max(Number(data && data.Prochain_Numero) || 1, max + 1);
    if (selection && !window.REGIONS_CARTE[selection]) selection = null;
    window.dessinerRegions();
}
// Ce qu'un autre poste a écrit, tel que l'écoute le reçoit (et les bancs).
window.appliquerRegionsDeLaBase = (data) => appliquerInstantane(data || {});
async function enregistrerRegion(numero) {
    const r = window.REGIONS_CARTE[numero];
    if (!r) return;
    try {
        await setDoc(ref(), { Regions: { [numero]: { Numero: numero, Points: copiePoints(r.points) } } }, { merge: true });
    } catch (e) { console.error("Région " + numero + " :", e); }
}

// Une boîte neuve, au milieu de ce qu'on voit de la carte. Son numéro est
// tiré dans une transaction : deux postes qui créent en même temps n'auront
// jamais le même.
window.creerRegion = async function() {
    const { zoom, panX } = typeof window.cadrageCarteMonde === "function" ? window.cadrageCarteMonde() : { zoom: 1, panX: 0 };
    const cx = borner((window.innerWidth / 2 - panX) / (zoom || 1), LARGEUR), cy = HAUTEUR / 2;
    const decalage = (Object.keys(window.REGIONS_CARTE).length % 5) * 40;
    const x0 = borner(cx - TAILLE_NOUVELLE.l / 2 + decalage, LARGEUR), y0 = borner(cy - TAILLE_NOUVELLE.h / 2 + decalage, HAUTEUR);
    const points = [{ x: x0, y: y0 }, { x: borner(x0 + TAILLE_NOUVELLE.l, LARGEUR), y: y0 },
                    { x: borner(x0 + TAILLE_NOUVELLE.l, LARGEUR), y: borner(y0 + TAILLE_NOUVELLE.h, HAUTEUR) },
                    { x: x0, y: borner(y0 + TAILLE_NOUVELLE.h, HAUTEUR) }];
    let numero = prochainNumero;
    try {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref());
            const data = snap.exists() ? snap.data() : {};
            const existants = Object.keys(data.Regions || {}).map(Number);
            numero = Math.max(Number(data.Prochain_Numero) || 1, Math.max(0, ...existants) + 1, prochainNumero);
            tx.set(ref(), { Prochain_Numero: numero + 1, Regions: { [numero]: { Numero: numero, Points: points } } }, { merge: true });
        });
    } catch (e) {
        console.error("Nouvelle région :", e);
    }
    // Tout de suite à l'écran, sans attendre le retour de la base.
    window.REGIONS_CARTE[numero] = { numero, points: copiePoints(points) };
    prochainNumero = Math.max(prochainNumero, numero + 1);
    selection = numero;
    if (!visiblesCoche()) window.afficherRegionsDev(true);
    window.dessinerRegions();
    return numero;
};

window.supprimerRegion = async function(numero, options) {
    const n = Number(numero || selection);
    if (!n || !window.REGIONS_CARTE[n]) return false;
    if (!(options && options.sansConfirmer) && !confirm(`Supprimer la boîte n° ${n} ? Son numéro ne resservira pas.`)) return false;
    delete window.REGIONS_CARTE[n];
    if (selection === n) selection = null;
    window.dessinerRegions();
    try { await updateDoc(ref(), { ["Regions." + n]: deleteField() }); }
    catch (e) { console.error("Suppression de la région " + n + " :", e); }
    return true;
};

// --- LE CLIC EN JEU --------------------------------------------------------
// Ce que fera chaque région, à venir : ACTIONS_REGIONS[numéro] = (numero) => {…}.
window.surClicRegion = function(numero) {
    if (modeChoix() && typeof window.surChoixRegionCarte === "function") return window.surChoixRegionCarte(numero);
    if (window.modeEditionRegions()) return false;
    // En mode descriptifs, toute boîte ouvre son descriptif, pas sa carte.
    if (modeDescriptif() && typeof window.ouvrirDescriptifRegion === "function") {
        window.ouvrirDescriptifRegion(numero);
        return true;
    }
    const action = window.ACTIONS_REGIONS[numero];
    if (typeof action !== "function") return false;
    try { action(numero); } catch (e) { console.error("Action de la région " + numero + " :", e); }
    return true;
};

// --- LE DESSIN -------------------------------------------------------------
function calque() {
    let svg = document.getElementById("calque-regions");
    if (!svg) {
        const carte = document.getElementById("carte-fond-jeu");
        if (!carte) return null;
        svg = document.createElementNS(SVG_NS, "svg");
        svg.id = "calque-regions";
        svg.setAttribute("viewBox", `0 0 ${LARGEUR} ${HAUTEUR}`);
        svg.setAttribute("preserveAspectRatio", "none");
        carte.appendChild(svg);
        brancherGestes(svg);
    }
    return svg;
}
const el = (nom, attrs) => {
    const e = document.createElementNS(SVG_NS, nom);
    Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v));
    return e;
};

window.dessinerRegions = function() {
    const svg = calque();
    if (!svg) return;
    const edition = window.modeEditionRegions();
    svg.classList.toggle("edition", edition);
    svg.classList.toggle("descriptif", modeDescriptif());
    svg.classList.toggle("choix", modeChoix());
    svg.innerHTML = "";
    const zoom = zoomCarte();
    const poignee = 14 / zoom, police = 26 / zoom;
    Object.values(window.REGIONS_CARTE).sort((a, b) => a.numero - b.numero).forEach(r => {
        const g = el("g", { class: "region" + (selection === r.numero ? " selectionnee" : "")
                                 + (typeof window.ACTIONS_REGIONS[r.numero] === "function" ? " active" : ""),
                            "data-numero": r.numero });
        const pts = r.points.map(p => `${p.x},${p.y}`).join(" ");
        g.appendChild(el("polygon", { class: "region-forme", points: pts, "data-role": "forme" }));
        if (edition) {
            r.points.forEach((p, i) => {
                const q = r.points[(i + 1) % r.points.length];
                g.appendChild(el("line", { class: "region-bord", x1: p.x, y1: p.y, x2: q.x, y2: q.y, "data-role": "bord", "data-index": i }));
            });
            const c = window.centreRegion(r.points);
            const t = el("text", { class: "region-numero", x: c.x, y: c.y, "font-size": police, "stroke-width": 5 / zoom,
                                   "text-anchor": "middle", "dominant-baseline": "central" });
            t.textContent = String(r.numero);
            g.appendChild(t);
            r.points.forEach((p, i) => {
                g.appendChild(el("rect", { class: "region-poignee", x: p.x - poignee / 2, y: p.y - poignee / 2, width: poignee, height: poignee,
                                           "data-role": "point", "data-index": i }));
            });
        }
        svg.appendChild(g);
    });
    actualiserPopup();
};

// --- LES GESTES DE L'ÉDITION -----------------------------------------------
function brancherGestes(svg) {
    // La carte glisse sous la souris et le doigt (app.js) : un geste qui part
    // d'une boîte en édition ne doit pas la faire glisser aussi.
    const bloquer = (e) => { if (window.modeEditionRegions() && e.target.closest && e.target.closest(".region")) e.stopPropagation(); };
    svg.addEventListener("mousedown", bloquer);
    svg.addEventListener("touchstart", bloquer, { passive: true });

    svg.addEventListener("pointerdown", (e) => {
        if (!window.modeEditionRegions()) return;
        const cible = e.target.closest && e.target.closest("[data-role]");
        const g = e.target.closest && e.target.closest(".region");
        if (!cible || !g) return;
        e.preventDefault();
        e.stopPropagation();
        const numero = Number(g.getAttribute("data-numero"));
        const r = window.REGIONS_CARTE[numero];
        if (!r) return;
        const role = cible.getAttribute("data-role");
        const ici = window.pointCarteDepuisEcran(e.clientX, e.clientY);
        let index = Number(cible.getAttribute("data-index"));
        let cree = false;
        // Un bord touché : un nouveau point, là où le doigt l'a touché, aussitôt saisi.
        if (role === "bord") {
            const a = r.points[index], b = r.points[(index + 1) % r.points.length];
            const p = projeterSurBord(ici, a, b);
            r.points.splice(index + 1, 0, { x: borner(p.x, LARGEUR), y: borner(p.y, HAUTEUR) });
            index = index + 1;
            cree = true;
        }
        selection = numero;
        geste = { type: role === "forme" ? "deplacer" : "point", numero, index, depart: ici, ecranX: e.clientX, ecranY: e.clientY,
                  points: copiePoints(r.points), bouge: false, cree };
        // Redessiner sous le doigt casserait le clic et le double-clic (leur
        // cible disparaîtrait) : seul un point né d'un bord oblige à redessiner.
        if (cree) window.dessinerRegions();
        else marquerSelection();
    });

    window.addEventListener("pointermove", (e) => {
        if (!geste) return;
        const r = window.REGIONS_CARTE[geste.numero];
        if (!r) { geste = null; return; }
        if (!geste.bouge && Math.hypot(e.clientX - geste.ecranX, e.clientY - geste.ecranY) < SEUIL_GLISSE) return;
        geste.bouge = true;
        e.preventDefault();
        const ici = window.pointCarteDepuisEcran(e.clientX, e.clientY);
        if (geste.type === "deplacer") {
            // Toute la forme, sans jamais sortir de la carte.
            const xs = geste.points.map(p => p.x), ys = geste.points.map(p => p.y);
            const dx = Math.max(-Math.min(...xs), Math.min(LARGEUR - Math.max(...xs), ici.x - geste.depart.x));
            const dy = Math.max(-Math.min(...ys), Math.min(HAUTEUR - Math.max(...ys), ici.y - geste.depart.y));
            r.points = geste.points.map(p => ({ x: Math.round(p.x + dx), y: Math.round(p.y + dy) }));
        } else {
            r.points[geste.index] = { x: borner(ici.x, LARGEUR), y: borner(ici.y, HAUTEUR) };
        }
        window.dessinerRegions();
    });

    const finir = () => {
        if (!geste) return;
        const { numero, bouge, cree } = geste;
        geste = null;
        if (bouge || cree) enregistrerRegion(numero);
        if (instantaneEnAttente) { const d = instantaneEnAttente; instantaneEnAttente = null; appliquerInstantane(d); }
        else if (bouge) window.dessinerRegions();
    };
    window.addEventListener("pointerup", finir);
    window.addEventListener("pointercancel", finir);

    // Double-clic sur un point : il s'en va (trois points au moins restent).
    svg.addEventListener("dblclick", (e) => {
        if (!window.modeEditionRegions()) return;
        const cible = e.target.closest && e.target.closest('[data-role="point"]');
        const g = e.target.closest && e.target.closest(".region");
        if (!cible || !g) return;
        e.preventDefault();
        e.stopPropagation();
        const numero = Number(g.getAttribute("data-numero"));
        const r = window.REGIONS_CARTE[numero];
        if (!r || r.points.length <= 3) return;
        r.points.splice(Number(cible.getAttribute("data-index")), 1);
        window.dessinerRegions();
        enregistrerRegion(numero);
    });

    // Le clic en jeu : seule une boîte qui a une action le reçoit (les autres
    // sont transparentes au doigt, voir style.css).
    svg.addEventListener("click", (e) => {
        const g = e.target.closest && e.target.closest(".region");
        if (!g) return;
        if (window.modeEditionRegions()) { e.stopPropagation(); return; }
        if (window.surClicRegion(Number(g.getAttribute("data-numero")))) e.stopPropagation();
    });
}

// La boîte sélectionnée, sans rien redessiner.
function marquerSelection() {
    document.querySelectorAll("#calque-regions .region").forEach(g =>
        g.classList.toggle("selectionnee", Number(g.getAttribute("data-numero")) === selection));
    actualiserPopup();
}

// --- LE BOUTON ROUGE ET SA POPUP -------------------------------------------
function actualiserPopup() {
    const info = document.getElementById("regions-dev-selection");
    const suppr = document.getElementById("btn-regions-supprimer");
    const total = document.getElementById("regions-dev-total");
    const r = selection && window.REGIONS_CARTE[selection];
    if (info) info.textContent = r ? `Boîte n° ${r.numero} sélectionnée · ${r.points.length} points` : "Aucune boîte sélectionnée";
    if (suppr) suppr.disabled = !r;
    if (total) {
        const n = Object.keys(window.REGIONS_CARTE).length;
        total.textContent = n === 0 ? "Aucune boîte pour l'instant" : `${n} boîte${n > 1 ? "s" : ""} sur la carte`;
    }
    const caseVisibles = document.getElementById("case-regions-visibles");
    if (caseVisibles) caseVisibles.checked = visiblesCoche();
    // Le mode descriptifs coupe l'édition des boîtes (v274).
    const descriptif = modeDescriptif();
    if (caseVisibles) caseVisibles.disabled = descriptif;
    const nouvelle = document.getElementById("btn-regions-nouvelle");
    if (nouvelle) nouvelle.disabled = descriptif;
    if (suppr && descriptif) suppr.disabled = true;
}
window.actualiserPopupRegions = () => actualiserPopup();

window.afficherRegionsDev = function(oui) {
    // Afficher les boîtes, c'est revenir à leur édition : le mode descriptifs s'arrête.
    if (oui && modeDescriptif() && typeof window.basculerModeDescriptifRegions === "function") window.basculerModeDescriptifRegions(false);
    try { localStorage.setItem(CLE_VISIBLES, oui ? "on" : "off"); } catch (e) { /* poste sans stockage */ }
    if (!oui) selection = null;
    window.dessinerRegions();
};

window.basculerPopupRegions = function(ouvrir) {
    const popup = document.getElementById("popup-regions-dev");
    if (!popup) return;
    const ouverte = popup.style.display === "block";
    const voulu = typeof ouvrir === "boolean" ? ouvrir : !ouverte;
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    popup.style.display = voulu ? "block" : "none";
    actualiserPopup();
};

// Le mode DEV change (actualiserDevMode, app.js) : le bouton rouge le suit ;
// hors DEV, la popup se ferme et les boîtes redeviennent invisibles.
window.actualiserRegionsDev = function() {
    const dev = estDev();
    const conteneur = document.getElementById("conteneur-regions-dev");
    if (conteneur) conteneur.style.display = dev ? "flex" : "none";
    if (!dev) {
        const popup = document.getElementById("popup-regions-dev");
        if (popup) popup.style.display = "none";
    }
    window.dessinerRegions();
};

// --- AU CHARGEMENT ---------------------------------------------------------
(function demarrer() {
    const lancer = () => {
        window.actualiserRegionsDev();
        // La base n'est lisible qu'à un compte validé : derrière la porte du
        // joueur (porte_joueur.js, v259).
        const ecouter = () => {
            try {
                onSnapshot(ref(), (snap) => appliquerInstantane(snap && snap.exists() ? snap.data() : {}),
                           (e) => console.error("Régions de la carte :", e));
            } catch (e) { console.error("Régions de la carte :", e); }
        };
        if (window.PorteJoueur) window.PorteJoueur.quand(ecouter); else ecouter();
        let attente = null;
        window.addEventListener("resize", () => {
            if (attente) return;
            attente = requestAnimationFrame(() => { attente = null; window.dessinerRegions(); });
        });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lancer);
    else lancer();
})();
