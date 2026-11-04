// =========================================================================
//  IVALIS — LA CARTE DU MONDE DANS LE GRIMOIRE (v302)
// =========================================================================
//  Nico : « nous allons maintenant raccorder la carte du monde » — sa double
//  page (grimoire.js : pages 5-6, juste après l'index, en partie), l'index
//  et le marque-page à la terre qui y mènent.
//
//  ET LE BOUTON DEV ROUGE : « fais-moi deux boutons, Ancien et Nouveau. Dans
//  Nouveau, tous mes nouveaux outils, à commencer par l'outil qui fait des
//  boîtes pour les zones de clic. Refais-moi pareil que tu m'avais fait. Je
//  délimiterai les zones de clic, puis je te dirai quelle page ça ouvre pour
//  les régionales. »
//
//  Les deux onglets se posent dans la popup du bouton rouge : « Ancien »
//  garde tout ce qu'elle avait (la carte d'avant), « Nouveau » reçoit les
//  outils du livre. Le premier : les boîtes de la carte du livre, faites
//  comme celles de regions_carte.js (v257) —
//    · une boîte naît rectangle, avec un numéro unique (jamais réutilisé) ;
//    · glissée, elle se déplace ; un carré à chaque coin, qu'on étire ; un
//      clic sur un bord ajoute un point ; un double-clic sur un point l'ôte ;
//    · « Afficher les boîtes » (DEV) : on les voit et on les édite, le clic
//      ne fait rien d'autre ; sinon elles sont invisibles, et une boîte qui a
//      une action (ACTIONS_ZONES_LIVRE[numéro], à venir) la jouera au clic.
//  Les boîtes vivent sur la double page entière, en unités de l'image du
//  livre (les deux pages : 1514 × 984 ; la page de gauche de 0 à 757).
//  La base : Carte_Livre/Zones — { Prochain_Numero, Zones: { "<n>":
//  { Numero, Points: [{ x, y }, …] } } }, écouté par tous les postes.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, onSnapshot, setDoc, updateDoc, deleteField, runTransaction } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const LARGEUR = 1514, HAUTEUR = 984;
const CHEMIN = ["Carte_Livre", "Zones"];
const CLE_VISIBLES = "ivalis_ZONES_LIVRE_VISIBLES";
const CLE_ONGLET = "ivalis_DEV_ONGLET";
const SVG_NS = "http://www.w3.org/2000/svg";
const TAILLE_NOUVELLE = { l: 220, h: 150 };
const SEUIL_GLISSE = 4;

window.ZONES_LIVRE = window.ZONES_LIVRE || {};
window.ACTIONS_ZONES_LIVRE = window.ACTIONS_ZONES_LIVRE || {};
let prochainNumero = 1, selection = null, geste = null, enAttente = null, calque = null;

const G = () => window.GRIMOIRE || null;
const ref = () => doc(db, ...CHEMIN);
const lire = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* poste sans stockage */ } };
const estDev = () => lire("ivalis_DEV_MODE") === "on";
const visiblesCoche = () => lire(CLE_VISIBLES) === "on";
const modeEdition = () => estDev() && visiblesCoche();
window.modeEditionZonesLivre = modeEdition;
const borner = (v, max) => Math.max(0, Math.min(max, Math.round(v)));
const copie = (pts) => pts.map(p => ({ x: p.x, y: p.y }));
const el = (nom, attrs) => { const e = document.createElementNS(SVG_NS, nom); Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v)); return e; };

// La double page de la carte est-elle ouverte, posée ?
function surLaCarte() {
    const g = G(), pf = g && g.pageFlip();
    if (!g || !pf || !g.enPartie() || !g.ouvert()) return false;
    const ici = pf.getCurrentPageIndex();
    return (ici === g.PAGE_CARTE || ici === g.PAGE_CARTE + 1) && pf.getState() === "read";
}

// Tourner jusqu'à la carte, une seule fois (pas si on y est, ou si on y va déjà).
function versLaCarte() {
    const g = G(), pf = g && g.pageFlip();
    if (!g || !pf || !g.enPartie()) return;
    const ici = pf.getCurrentPageIndex();
    if (ici === g.PAGE_CARTE || ici === g.PAGE_CARTE + 1 || pf.getState() === "flipping") return;
    g.allerALaCarte();
}

// --- LA GÉOMÉTRIE ------------------------------------------------------------
function centre(points) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0; i < points.length; i++) {
        const p = points[i], q = points[(i + 1) % points.length], f = p.x * q.y - q.x * p.y;
        a += f; cx += (p.x + q.x) * f; cy += (p.y + q.y) * f;
    }
    if (Math.abs(a) < 1e-6) { const n = points.length || 1; return { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n }; }
    return { x: cx / (3 * a), y: cy / (3 * a) };
}
function projeter(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    return { x: a.x + t * dx, y: a.y + t * dy };
}
// Un point de l'écran, sur la double page (unités de l'image du livre).
function pointDepuisEcran(x, y) {
    const g = G(), livre = g && g.livre();
    if (!livre) return { x: 0, y: 0 };
    const r = livre.getBoundingClientRect();
    return { x: (x - r.left) * LARGEUR / (r.width || LARGEUR), y: (y - r.top) * HAUTEUR / (r.height || HAUTEUR) };
}
window.pointZoneLivreDepuisEcran = pointDepuisEcran;

// --- LA BASE -----------------------------------------------------------------
function lireDocument(data) {
    const zones = {};
    Object.entries((data && data.Zones) || {}).forEach(([cle, z]) => {
        const numero = Number((z && z.Numero) || cle);
        const points = Array.isArray(z && z.Points) ? z.Points.map(p => ({ x: Number(p.x) || 0, y: Number(p.y) || 0 })) : [];
        if (numero > 0 && points.length >= 3) zones[numero] = { numero, points };
    });
    return zones;
}
function appliquer(data) {
    if (geste) { enAttente = data; return; }
    window.ZONES_LIVRE = lireDocument(data);
    const max = Math.max(0, ...Object.keys(window.ZONES_LIVRE).map(Number));
    prochainNumero = Math.max(Number(data && data.Prochain_Numero) || 1, max + 1);
    if (selection && !window.ZONES_LIVRE[selection]) selection = null;
    dessiner();
}
async function enregistrer(numero) {
    const z = window.ZONES_LIVRE[numero];
    if (!z) return;
    try { await setDoc(ref(), { Zones: { [numero]: { Numero: numero, Points: copie(z.points) } } }, { merge: true }); }
    catch (e) { console.error("Zone " + numero + " de la carte du livre :", e); }
}

// Une boîte neuve, au milieu de la page de gauche (décalée si d'autres y sont
// déjà). Son numéro est tiré dans une transaction : jamais deux fois le même.
async function creerZone() {
    versLaCarte();
    const decalage = (Object.keys(window.ZONES_LIVRE).length % 6) * 36;
    const x0 = borner(LARGEUR / 4 - TAILLE_NOUVELLE.l / 2 + decalage, LARGEUR), y0 = borner(HAUTEUR / 2 - TAILLE_NOUVELLE.h / 2 + decalage, HAUTEUR);
    const points = [{ x: x0, y: y0 }, { x: x0 + TAILLE_NOUVELLE.l, y: y0 }, { x: x0 + TAILLE_NOUVELLE.l, y: y0 + TAILLE_NOUVELLE.h }, { x: x0, y: y0 + TAILLE_NOUVELLE.h }];
    let numero = prochainNumero;
    try {
        await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref());
            const data = snap.exists() ? snap.data() : {};
            const existants = Object.keys(data.Zones || {}).map(Number);
            numero = Math.max(Number(data.Prochain_Numero) || 1, Math.max(0, ...existants) + 1, prochainNumero);
            tx.set(ref(), { Prochain_Numero: numero + 1, Zones: { [numero]: { Numero: numero, Points: points } } }, { merge: true });
        });
    } catch (e) { console.error("Nouvelle zone de la carte du livre :", e); }
    window.ZONES_LIVRE[numero] = { numero, points: copie(points) };
    prochainNumero = Math.max(prochainNumero, numero + 1);
    selection = numero;
    if (!visiblesCoche()) afficher(true);
    dessiner();
    return numero;
}
async function supprimerZone(numero, options) {
    const n = Number(numero || selection);
    if (!n || !window.ZONES_LIVRE[n]) return false;
    if (!(options && options.sansConfirmer) && !confirm(`Supprimer la boîte n° ${n} ? Son numéro ne resservira pas.`)) return false;
    delete window.ZONES_LIVRE[n];
    if (selection === n) selection = null;
    dessiner();
    try { await updateDoc(ref(), { ["Zones." + n]: deleteField() }); }
    catch (e) { console.error("Suppression de la zone " + n + " :", e); }
    return true;
}
// Le clic en jeu (à venir) : ACTIONS_ZONES_LIVRE[numéro] = (numero) => {…}.
function surClic(numero) {
    if (modeEdition()) return false;
    const action = window.ACTIONS_ZONES_LIVRE[numero];
    if (typeof action !== "function") return false;
    try { action(numero); } catch (e) { console.error("Action de la zone " + numero + " :", e); }
    return true;
}

// --- LE DESSIN : un calque posé sur la double page ----------------------------
function leCalque() {
    const g = G();
    if (!g || !g.scene() || !g.livre()) return null;
    if (!calque || !calque.isConnected) {
        calque = document.createElementNS(SVG_NS, "svg");
        calque.id = "calque-zones-livre";
        calque.setAttribute("viewBox", `0 0 ${LARGEUR} ${HAUTEUR}`);
        calque.setAttribute("preserveAspectRatio", "none");
        g.scene().appendChild(calque);
        brancherGestes(calque);
    }
    const livre = g.livre();
    Object.assign(calque.style, { left: livre.style.left, top: livre.style.top, width: livre.style.width, height: livre.style.height });
    return calque;
}
function dessiner() {
    const svg = leCalque();
    if (!svg) { majPopup(); return; }
    const vue = surLaCarte();
    const edition = modeEdition() && vue;
    svg.classList.toggle("visible", vue);
    svg.classList.toggle("edition", edition);
    svg.innerHTML = "";
    const poignee = 9, police = 22;
    Object.values(window.ZONES_LIVRE).sort((a, b) => a.numero - b.numero).forEach(z => {
        const g = el("g", { class: "region zone-livre" + (selection === z.numero ? " selectionnee" : "")
                                 + (typeof window.ACTIONS_ZONES_LIVRE[z.numero] === "function" ? " active" : ""), "data-numero": z.numero });
        g.appendChild(el("polygon", { class: "region-forme", points: z.points.map(p => `${p.x},${p.y}`).join(" "), "data-role": "forme" }));
        if (edition) {
            z.points.forEach((p, i) => {
                const q = z.points[(i + 1) % z.points.length];
                g.appendChild(el("line", { class: "region-bord", x1: p.x, y1: p.y, x2: q.x, y2: q.y, "data-role": "bord", "data-index": i }));
            });
            const c = centre(z.points);
            const t = el("text", { class: "region-numero", x: c.x, y: c.y, "font-size": police, "stroke-width": 4, "text-anchor": "middle", "dominant-baseline": "central" });
            t.textContent = String(z.numero);
            g.appendChild(t);
            z.points.forEach((p, i) => g.appendChild(el("rect", { class: "region-poignee", x: p.x - poignee / 2, y: p.y - poignee / 2, width: poignee, height: poignee, "data-role": "point", "data-index": i })));
        }
        svg.appendChild(g);
    });
    majPopup();
}

// --- LES GESTES DE L'ÉDITION (ceux de regions_carte.js) -----------------------
function brancherGestes(svg) {
    svg.addEventListener("pointerdown", (e) => {
        if (!modeEdition()) return;
        const cible = e.target.closest && e.target.closest("[data-role]");
        const g = e.target.closest && e.target.closest(".region");
        if (!cible || !g) return;
        e.preventDefault();
        e.stopPropagation();
        const numero = Number(g.getAttribute("data-numero"));
        const z = window.ZONES_LIVRE[numero];
        if (!z) return;
        const role = cible.getAttribute("data-role");
        const ici = pointDepuisEcran(e.clientX, e.clientY);
        let index = Number(cible.getAttribute("data-index")), cree = false;
        if (role === "bord") {                       // un bord touché : un point neuf, aussitôt saisi
            const a = z.points[index], b = z.points[(index + 1) % z.points.length], p = projeter(ici, a, b);
            z.points.splice(index + 1, 0, { x: borner(p.x, LARGEUR), y: borner(p.y, HAUTEUR) });
            index += 1; cree = true;
        }
        selection = numero;
        geste = { type: role === "forme" ? "deplacer" : "point", numero, index, depart: ici, ecranX: e.clientX, ecranY: e.clientY, points: copie(z.points), bouge: false, cree };
        if (cree) dessiner(); else marquerSelection();
    });
    window.addEventListener("pointermove", (e) => {
        if (!geste) return;
        const z = window.ZONES_LIVRE[geste.numero];
        if (!z) { geste = null; return; }
        if (!geste.bouge && Math.hypot(e.clientX - geste.ecranX, e.clientY - geste.ecranY) < SEUIL_GLISSE) return;
        geste.bouge = true;
        e.preventDefault();
        const ici = pointDepuisEcran(e.clientX, e.clientY);
        if (geste.type === "deplacer") {
            const xs = geste.points.map(p => p.x), ys = geste.points.map(p => p.y);
            const dx = Math.max(-Math.min(...xs), Math.min(LARGEUR - Math.max(...xs), ici.x - geste.depart.x));
            const dy = Math.max(-Math.min(...ys), Math.min(HAUTEUR - Math.max(...ys), ici.y - geste.depart.y));
            z.points = geste.points.map(p => ({ x: Math.round(p.x + dx), y: Math.round(p.y + dy) }));
        } else z.points[geste.index] = { x: borner(ici.x, LARGEUR), y: borner(ici.y, HAUTEUR) };
        dessiner();
    });
    const finir = () => {
        if (!geste) return;
        const { numero, bouge, cree } = geste;
        geste = null;
        if (bouge || cree) enregistrer(numero);
        if (enAttente) { const d = enAttente; enAttente = null; appliquer(d); }
        else if (bouge) dessiner();
    };
    window.addEventListener("pointerup", finir);
    window.addEventListener("pointercancel", finir);
    svg.addEventListener("dblclick", (e) => {                       // double-clic sur un point : il s'en va
        if (!modeEdition()) return;
        const cible = e.target.closest && e.target.closest('[data-role="point"]');
        const g = e.target.closest && e.target.closest(".region");
        if (!cible || !g) return;
        e.preventDefault(); e.stopPropagation();
        const numero = Number(g.getAttribute("data-numero")), z = window.ZONES_LIVRE[numero];
        if (!z || z.points.length <= 3) return;
        z.points.splice(Number(cible.getAttribute("data-index")), 1);
        dessiner();
        enregistrer(numero);
    });
    svg.addEventListener("click", (e) => {
        const g = e.target.closest && e.target.closest(".region");
        if (!g) return;
        if (modeEdition()) { e.stopPropagation(); return; }
        if (surClic(Number(g.getAttribute("data-numero")))) e.stopPropagation();
    });
}
function marquerSelection() {
    if (calque) calque.querySelectorAll(".region").forEach(g => g.classList.toggle("selectionnee", Number(g.getAttribute("data-numero")) === selection));
    majPopup();
}

// --- LE BOUTON ROUGE : LES ONGLETS « ANCIEN » ET « NOUVEAU » -----------------
function poserOnglets() {
    const popup = document.getElementById("popup-regions-dev");
    if (!popup || document.getElementById("dev-onglets")) return;
    const tete = popup.querySelector(".popup-regions-tete");
    const ancien = document.createElement("div");
    ancien.id = "dev-onglet-ancien";
    [...popup.children].forEach(c => { if (c !== tete) ancien.appendChild(c); });
    const onglets = document.createElement("div");
    onglets.id = "dev-onglets";
    onglets.className = "dev-onglets";
    onglets.innerHTML = `<button type="button" class="dev-onglet" data-onglet="ancien" id="btn-dev-ancien">Ancien</button>
                         <button type="button" class="dev-onglet" data-onglet="nouveau" id="btn-dev-nouveau">Nouveau</button>`;
    const nouveau = document.createElement("div");
    nouveau.id = "dev-onglet-nouveau";
    nouveau.innerHTML = `
        <div class="popup-regions-sous-titre">📖 Les zones de la carte du livre</div>
        <label class="popup-regions-case"><input type="checkbox" id="case-zones-livre-visibles"> Afficher les boîtes</label>
        <button type="button" id="btn-zones-livre-nouvelle" class="popup-regions-bouton">+ Nouvelle boîte</button>
        <div id="zones-livre-selection" class="popup-regions-info">Aucune boîte sélectionnée</div>
        <button type="button" id="btn-zones-livre-supprimer" class="popup-regions-bouton secondaire" disabled>Supprimer cette boîte</button>
        <div id="zones-livre-total" class="popup-regions-total"></div>
        <p class="popup-regions-aide">Sur la double page de la carte : une boîte glissée se déplace, ses coins s'étirent, un clic sur un bord ajoute un point, un double-clic sur un point l'enlève.</p>
        <div class="popup-regions-sous-titre">⚔️ Le combat du récit</div>
        <button type="button" id="btn-passer-combat-rp" class="popup-regions-bouton">Passer le combat (compté gagné)</button>
        <p class="popup-regions-aide">(v307) Un combat lancé se termine aussitôt, comme une victoire : le Narrateur reprend le récit.</p>`;
    tete.after(onglets);
    onglets.after(ancien);
    ancien.after(nouveau);
    // (v308) Les outils de la carte régionale ouverte (l'usure, les villages, les
    // terrains, le groupe, le téléport) passent dans « Nouveau » : ils servent sur
    // la carte régionale du livre.
    const outilsRegion = document.getElementById("regions-dev-carte");
    if (outilsRegion) {
        // Sa place d'avant (l'ancienne interface) est gardée : il y retourne hors du livre.
        repereOutils = document.createComment("outils-region");
        outilsRegion.parentNode.insertBefore(repereOutils, outilsRegion);
        const tete = document.createElement("div");
        tete.className = "popup-regions-sous-titre";
        tete.id = "dev-nouveau-region-titre";
        tete.textContent = "🗺️ La carte régionale (dans le livre)";
        const aide = document.createElement("p");
        aide.className = "popup-regions-aide";
        aide.id = "dev-nouveau-region-aide";
        aide.textContent = "Ouvre la double page d'une région pour ses outils.";
        nouveau.appendChild(tete);
        nouveau.appendChild(aide);
        nouveau.appendChild(outilsRegion);
    }
    placerOutilsRegion(true);
    onglets.addEventListener("click", (e) => {
        const b = e.target.closest("[data-onglet]");
        if (!b) return;
        if (typeof window.jouerSonClic === "function") window.jouerSonClic();
        choisirOnglet(b.dataset.onglet);
    });
    document.getElementById("case-zones-livre-visibles").addEventListener("change", (e) => afficher(e.target.checked));
    document.getElementById("btn-zones-livre-nouvelle").addEventListener("click", () => { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); creerZone(); });
    document.getElementById("btn-zones-livre-supprimer").addEventListener("click", () => { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); supprimerZone(); });
    document.getElementById("btn-passer-combat-rp").addEventListener("click", (e) => {
        const actif = typeof window.combatRPActif === "function" && window.combatRPActif();
        if (!actif) { e.currentTarget.nextElementSibling.textContent = "Aucun combat du récit en cours."; return; }
        if (typeof window.passerCombatRP === "function") window.passerCombatRP();
    });
    choisirOnglet(lire(CLE_ONGLET) === "ancien" ? "ancien" : "nouveau");
}
// (v308) Les outils régionaux : dans « Nouveau » quand le livre tient la partie,
// à leur ancienne place sinon (l'ancienne interface, ses tests).
let repereOutils = null;
function placerOutilsRegion(dansLeLivre) {
    const outils = document.getElementById("regions-dev-carte"), nouveau = document.getElementById("dev-onglet-nouveau");
    if (!outils || !nouveau) return;
    if (dansLeLivre) { if (outils.parentNode !== nouveau) nouveau.appendChild(outils); return; }
    if (repereOutils && repereOutils.parentNode && outils.previousSibling !== repereOutils) repereOutils.parentNode.insertBefore(outils, repereOutils.nextSibling);
}
window.placerOutilsRegionDev = placerOutilsRegion;
function choisirOnglet(nom) {
    const voulu = nom === "ancien" ? "ancien" : "nouveau";
    ecrire(CLE_ONGLET, voulu);
    const a = document.getElementById("dev-onglet-ancien"), n = document.getElementById("dev-onglet-nouveau");
    if (a) a.hidden = voulu !== "ancien";
    if (n) n.hidden = voulu !== "nouveau";
    document.querySelectorAll("#dev-onglets .dev-onglet").forEach(b => b.classList.toggle("choisi", b.dataset.onglet === voulu));
    majPopup();
}
function afficher(oui) {
    ecrire(CLE_VISIBLES, oui ? "on" : "off");
    if (!oui) selection = null;
    if (oui) versLaCarte();
    dessiner();
}
function majPopup() {
    const info = document.getElementById("zones-livre-selection");
    const suppr = document.getElementById("btn-zones-livre-supprimer");
    const total = document.getElementById("zones-livre-total");
    const caseV = document.getElementById("case-zones-livre-visibles");
    const z = selection && window.ZONES_LIVRE[selection];
    if (info) info.textContent = z ? `Boîte n° ${z.numero} sélectionnée · ${z.points.length} points` : "Aucune boîte sélectionnée";
    if (suppr) suppr.disabled = !z;
    if (total) { const n = Object.keys(window.ZONES_LIVRE).length; total.textContent = n === 0 ? "Aucune boîte pour l'instant" : `${n} boîte${n > 1 ? "s" : ""} sur la carte du livre`; }
    if (caseV) caseV.checked = visiblesCoche();
}

// --- AU CHARGEMENT, ET EN PARTIE ---------------------------------------------
let suivi = false, revoir = null;
function suivreLeLivre() {
    const g = G();
    if (suivi || !g || !g.ecran() || !g.pageFlip()) return;
    suivi = true;
    const voir = () => { dessiner(); clearTimeout(revoir); const pf = g.pageFlip(); if (pf && pf.getState() !== "read") revoir = setTimeout(voir, 120); };
    g.ecran().addEventListener("grimoire-page", voir);
    g.pageFlip().on("changeState", voir);
    window.addEventListener("resize", () => setTimeout(dessiner, 200));
}
function entrer() {
    suivreLeLivre();
    // Les deux images de la carte se chargent tout de suite (la page ne doit pas attendre).
    const g = G();
    if (g && g.IMAGES_CARTE) Object.values(g.IMAGES_CARTE).forEach(src => { const i = new Image(); i.decoding = "async"; i.src = src; });
    dessiner();
}
(function demarrer() {
    const lancer = () => {
        poserOnglets();
        const ecouter = () => {
            try { onSnapshot(ref(), (snap) => appliquer(snap && snap.exists() ? snap.data() : {}), (e) => console.error("Zones de la carte du livre :", e)); }
            catch (e) { console.error("Zones de la carte du livre :", e); }
        };
        if (window.PorteJoueur) window.PorteJoueur.quand(ecouter); else ecouter();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lancer);
    else lancer();
})();

window.GRIMOIRE_CARTE = {
    entrer, dessiner, creerZone, supprimerZone, afficher, choisirOnglet, surClic,
    appliquer: (data) => appliquer(data || {}),
    selection: () => selection, surLaCarte, LARGEUR, HAUTEUR
};
