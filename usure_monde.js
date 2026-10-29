// =========================================================================
//  IVALIS — L'USURE DU PARCHEMIN DE LA CARTE DU MONDE (v283, DEV)
// =========================================================================
//  Nico : « crée-moi un pinceau dans DEV pour que je puisse peindre les
//  zones où tu peux brûler, faire des trous, etc. »
//
//  Sur la carte du monde, dans la popup DEV (le bouton rouge) : un pinceau,
//  une gomme, leur taille ; « Valider l'usure » l'enregistre pour tout le
//  monde, « Annuler la peinture » revient à ce qui est enregistré. Ce qui est
//  peint se voit en orange tant qu'un outil est en main ; un instant après
//  chaque trait, le bord est recalculé en aperçu (bords_parchemin.js).
//
//  LA GRILLE : 240 colonnes × 135 lignes posées sur la carte (3840 × 2160 :
//  des cases de 16 pixels) ; une case vaut 1 là où le parchemin peut brûler,
//  se déchirer, se percer. Ailleurs, le bord reste mince.
//
//  LA BASE : Carte_Monde/Parchemin — { Usure: { colonnes, lignes, cases } },
//  les cases en bits, en base64 (le codage des nuages régionaux).
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const LARGEUR = 3840, HAUTEUR = 2160;
const COLONNES = 240, LIGNES = 135;
const GRAINE_MONDE = 1, COTE = 2048;
const ref = () => doc(db, "Carte_Monde", "Parchemin");
const $ = (id) => document.getElementById(id);
const estDev = () => { try { return localStorage.getItem("ivalis_DEV_MODE") === "on"; } catch (e) { return false; } };

// --- L'ÉTAT DE CE POSTE ----------------------------------------------------
const etat = {
    enregistree: null,      // l'usure en base : { colonnes, lignes, cases (base64) } ou null
    outil: null,            // "pinceau" | "gomme" | null
    taille: 60,             // le rayon, en pixels d'écran
    brouillon: null,        // Uint8Array(COLONNES × LIGNES), pas encore validé
    modifie: false
};
let geste = null, apercuEnAttente = null;

const coder = (cases) => (window.BordsParchemin ? window.BordsParchemin.encoder(cases) : "");
function grilleEnregistree() {
    const u = etat.enregistree;
    if (!u || u.colonnes !== COLONNES || u.lignes !== LIGNES || !window.BordsParchemin) return new Uint8Array(COLONNES * LIGNES);
    return window.BordsParchemin.decoder(u.cases, COLONNES * LIGNES);
}
window.grilleUsureMonde = () => etat.brouillon || grilleEnregistree();
window.outilUsureMonde = () => etat.outil;

// --- LE BORD DE LA CARTE ---------------------------------------------------
// L'usure enregistrée, ou (`apercu`) le brouillon pendant qu'on peint.
function poserBord(apercu) {
    const monde = $("carte-fond-jeu");
    if (!monde || !window.BordsParchemin) return null;
    const enApercu = !!apercu && etat.modifie && !!etat.brouillon;
    const zones = enApercu ? { colonnes: COLONNES, lignes: LIGNES, cases: etat.brouillon } : etat.enregistree;
    return window.BordsParchemin.appliquer(monde, { graine: GRAINE_MONDE, aspect: LARGEUR / HAUTEUR, cote: COTE, zones, provisoire: enApercu })
        .catch(e => { console.error("Bord de parchemin (monde) :", e); return null; });
}
window.poserBordCarteMonde = poserBord;
function demanderApercu() {
    clearTimeout(apercuEnAttente);
    apercuEnAttente = setTimeout(() => { apercuEnAttente = null; if (etat.modifie) poserBord(true); }, 350);
}

// Ce que dit la base (et les bancs) : { Usure: { colonnes, lignes, cases } }.
window.appliquerUsureMondeDeLaBase = function(data) {
    const u = data && data.Usure;
    const lue = u && u.cases ? { colonnes: Number(u.colonnes), lignes: Number(u.lignes), cases: String(u.cases) } : null;
    if (JSON.stringify(lue) === JSON.stringify(etat.enregistree)) return false;
    etat.enregistree = lue;
    // bords_parchemin.js la prend s'il pose le bord après nous.
    window.ZONES_USURE_MONDE = lue;
    if (!etat.modifie) { etat.brouillon = null; poserBord(); }
    dessinerPeinture();
    return true;
};

// --- LA PEINTURE -----------------------------------------------------------
function toile() {
    let t = $("carte-monde-usure-peinture");
    const monde = $("carte-fond-jeu");
    if (!t && monde) {
        t = document.createElement("canvas");
        t.id = "carte-monde-usure-peinture";
        t.className = "carte-monde-usure-peinture";
        monde.appendChild(t);
        brancherGestes(t);
    }
    return t;
}
// Les zones orange, semi-transparentes : la grille agrandie en douceur.
function dessinerPeinture() {
    const t = toile();
    if (!t) return;
    const visible = estDev() && (!!etat.outil || etat.modifie);
    t.style.display = visible ? "block" : "none";
    t.classList.toggle("outil", estDev() && !!etat.outil);
    if (!visible) return;
    const grille = window.grilleUsureMonde();
    const petite = document.createElement("canvas");
    petite.width = COLONNES; petite.height = LIGNES;
    const img = petite.getContext("2d").createImageData(COLONNES, LIGNES);
    for (let i = 0; i < grille.length; i++) {
        if (!grille[i]) continue;
        img.data[i * 4] = 236; img.data[i * 4 + 1] = 118; img.data[i * 4 + 2] = 18; img.data[i * 4 + 3] = 125;
    }
    petite.getContext("2d").putImageData(img, 0, 0);
    t.width = COLONNES * 3; t.height = LIGNES * 3;
    const ctx = t.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
    ctx.drawImage(petite, 0, 0, t.width, t.height);
}

// Le pinceau (ou la gomme) passe de `a` à `b` (en pixels de la carte).
function peindre(a, b) {
    if (!etat.outil) return;
    if (!etat.brouillon) etat.brouillon = grilleEnregistree();
    const cellule = LARGEUR / COLONNES;
    const zoom = (typeof window.cadrageCarteMonde === "function" && window.cadrageCarteMonde().zoom) || 1;
    const rayon = etat.taille / zoom;
    const valeur = etat.outil === "pinceau" ? 1 : 0;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, rayon / 2)));
    for (let k = 0; k <= n; k++) {
        const x = a.x + (b.x - a.x) * k / n, y = a.y + (b.y - a.y) * k / n;
        const c0 = Math.max(0, Math.floor((x - rayon) / cellule)), c1 = Math.min(COLONNES - 1, Math.floor((x + rayon) / cellule));
        const l0 = Math.max(0, Math.floor((y - rayon) / cellule)), l1 = Math.min(LIGNES - 1, Math.floor((y + rayon) / cellule));
        for (let l = l0; l <= l1; l++) for (let c = c0; c <= c1; c++) {
            if (Math.hypot((c + 0.5) * cellule - x, (l + 0.5) * cellule - y) <= rayon) etat.brouillon[l * COLONNES + c] = valeur;
        }
    }
    etat.modifie = true;
    dessinerPeinture();
    actualiserDev();
}
const point = (e) => (typeof window.pointCarteDepuisEcran === "function" ? window.pointCarteDepuisEcran(e.clientX, e.clientY) : { x: 0, y: 0 });
// Pour les bancs : peindre d'un point de l'écran à un autre.
window.peindreUsureMonde = function(x, y, x2, y2) {
    const a = point({ clientX: x, clientY: y }), b = point({ clientX: x2 === undefined ? x : x2, clientY: y2 === undefined ? y : y2 });
    peindre(a, b);
    demanderApercu();
};

function brancherGestes(t) {
    // La carte glisse sous la souris et le doigt (app.js) : pas pendant qu'on peint.
    const bloquer = (e) => { if (etat.outil && estDev()) e.stopPropagation(); };
    t.addEventListener("mousedown", bloquer);
    t.addEventListener("touchstart", bloquer, { passive: true });
    t.addEventListener("click", bloquer);
    t.addEventListener("pointerdown", (e) => {
        if (!etat.outil || !estDev()) return;
        e.preventDefault();
        e.stopPropagation();
        try { t.setPointerCapture(e.pointerId); } catch (err) { /* déjà parti */ }
        geste = { id: e.pointerId, dernier: point(e) };
        peindre(geste.dernier, geste.dernier);
    });
    t.addEventListener("pointermove", (e) => {
        if (!geste || e.pointerId !== geste.id) return;
        e.preventDefault();
        const ici = point(e);
        peindre(geste.dernier, ici);
        geste.dernier = ici;
    });
    const lever = (e) => {
        if (!geste || e.pointerId !== geste.id) return;
        geste = null;
        demanderApercu();
    };
    t.addEventListener("pointerup", lever);
    t.addEventListener("pointercancel", lever);
}

// --- LES BOUTONS DE LA POPUP DEV --------------------------------------------
window.choisirOutilUsureMonde = function(outil) {
    if (!estDev()) return null;
    etat.outil = etat.outil === outil ? null : (outil === "pinceau" || outil === "gomme" ? outil : null);
    dessinerPeinture();
    actualiserDev();
    return etat.outil;
};
window.lacherOutilUsureMonde = function() {
    if (!etat.outil) return;
    etat.outil = null;
    geste = null;
    dessinerPeinture();
    actualiserDev();
};
window.reglerTaillePinceauUsureMonde = function(v) {
    etat.taille = Math.max(6, Math.min(240, Number(v) || 60));
    return etat.taille;
};
window.validerUsureMonde = async function() {
    if (!etat.brouillon) return false;
    const usure = { colonnes: COLONNES, lignes: LIGNES, cases: coder(etat.brouillon) };
    etat.enregistree = usure;
    window.ZONES_USURE_MONDE = usure;
    etat.brouillon = null; etat.modifie = false; etat.outil = null;
    clearTimeout(apercuEnAttente);
    poserBord();
    dessinerPeinture();
    actualiserDev();
    try { await setDoc(ref(), { Usure: usure }, { merge: true }); return true; }
    catch (e) { console.error("Usure du parchemin :", e); return false; }
};
window.annulerUsureMonde = function() {
    const apercu = etat.modifie;
    etat.brouillon = null; etat.modifie = false;
    clearTimeout(apercuEnAttente);
    if (apercu) poserBord();
    dessinerPeinture();
    actualiserDev();
    return true;
};

function actualiserDev() {
    const pinceau = $("btn-monde-usure-pinceau"), gomme = $("btn-monde-usure-gomme");
    if (pinceau) pinceau.classList.toggle("actif", etat.outil === "pinceau");
    if (gomme) gomme.classList.toggle("actif", etat.outil === "gomme");
    const valider = $("btn-monde-usure-valider"), annuler = $("btn-monde-usure-annuler");
    if (valider) valider.disabled = !etat.modifie;
    if (annuler) annuler.disabled = !etat.modifie;
    const taille = $("taille-pinceau-monde-usure");
    if (taille && Number(taille.value) !== etat.taille) taille.value = String(etat.taille);
}
window.actualiserDevUsureMonde = actualiserDev;

// --- AU CHARGEMENT ---------------------------------------------------------
(function demarrer() {
    const lancer = () => {
        toile();
        dessinerPeinture();
        actualiserDev();
        // Le mode DEV s'éteint : on lâche le pinceau.
        const avant = window.actualiserRegionsDev;
        if (typeof avant === "function" && !avant.__usureMonde) {
            const env = function() { const r = avant.apply(this, arguments); if (!estDev()) window.lacherOutilUsureMonde(); dessinerPeinture(); actualiserDev(); return r; };
            env.__usureMonde = true;
            window.actualiserRegionsDev = env;
        }
        // La base n'est lisible qu'à un compte validé (porte_joueur.js).
        const ecouter = () => {
            try {
                onSnapshot(ref(), (snap) => window.appliquerUsureMondeDeLaBase(snap && snap.exists() ? snap.data() : {}),
                           (e) => console.error("Usure du parchemin :", e));
            } catch (e) { console.error("Usure du parchemin :", e); }
        };
        if (window.PorteJoueur) window.PorteJoueur.quand(ecouter); else ecouter();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lancer);
    else lancer();
})();
