// =========================================================================
//  IVALIS — LE HALL DE GUILDE DANS LE LIVRE (v433, v434)
// =========================================================================
//  Nico : « un bouton pour le Hall de guilde au centre de la map village ; une
//  fois ouvert, une nouvelle double page : en gros titre Hall de guilde ; des
//  titres cliquables du même style que le sommaire : Panneau des missions /
//  Salle du conseil / Bureau du patriarche / Livre des clans. Les trois premiers
//  ouvrent une nouvelle double page (en développement) ; le Livre des clans
//  remplace les pages Aventuriers. » Et : « Hall de guilde à droite, à gauche les
//  boutons du menu ».
//  (v434) « Enlève tous les boutons pour revenir à la page précédente : on tourne
//  la page en arrière pour revenir en arrière. Et la Salle du conseil, le Panneau
//  des missions… doivent être une nouvelle double page, pas remplacer la page
//  existante. » « Enlève les numéros sur les titres à gauche, et pas de soulignage. »
//  « Dans le tableau des missions, cette image en double page, sans l'ombre du
//  milieu ; dans le bouton DEV, de quoi créer des encarts sur ce tableau (les zones
//  de texte des feuilles), et régler leur inclinaison. »
//
//    · Les doubles pages n'entrent dans le livre que le temps qu'on les lit (comme
//      les fils invisibles) : juste après le village, d'où on ouvre le Hall (le
//      bâtiment, grimoire.js, LIEUX_VILLAGE) ; une pièce, juste après le Hall (on
//      y va en tournant la page, on en revient en la tournant en arrière).
//      Quittées, elles ressortent du livre.
//    · Le Livre des clans : les pages des clans (grimoire_fiches.js), sur le sien.
//    · LES ENCARTS DU TABLEAU (DEV, onglet « Nouveau » du bouton rouge) : des
//      boîtes posées sur l'image, en parts de la double page (x, y : le coin haut
//      gauche ; l, h : la taille ; angle : l'inclinaison, en degrés). Les mêmes pour
//      toutes les parties : Carte_Livre/Tableau_Missions — { Prochain_Numero,
//      Encarts: { "<n>": { Numero, x, y, l, h, angle } } }. Leur texte viendra plus tard.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, onSnapshot, setDoc, deleteField } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const G = () => window.GRIMOIRE;
const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const son = () => { try { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); } catch (e) {} };
const lireLS = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const ecrireLS = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const FLEURON = `<svg class="fleuron fleuron-guilde" viewBox="0 0 200 24" aria-hidden="true"><path d="M 8 12 C 40 4 70 4 92 12 M 108 12 C 130 4 160 4 192 12 M 92 12 C 96 6 104 6 108 12 C 104 18 96 18 92 12 Z"/><circle cx="100" cy="12" r="2.2"/></svg>`;
export const IMAGE_TABLEAU = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1794992871/486DA9A4-10CC-430C-B103-A9E7B9EE1787_okyu3f.png";

// Les entrées du menu : [id, titre, teinte du lavis].
export const PIECES = [
    ["missions", "Panneau des missions", { couleurs: ["#b3261e", "#c8402f", "#8f1d15"], opacite: 0.3, nom: "guilde-missions" }],
    ["conseil", "Salle du conseil", { couleurs: ["#5f86b0", "#7fa2c4", "#4a6f98"], opacite: 0.3, nom: "guilde-conseil" }],
    ["patriarche", "Bureau du patriarche", { couleurs: ["#8a5fb0", "#a37cc4", "#6d4890"], opacite: 0.26, nom: "guilde-patriarche" }],
    ["clans", "Livre des clans", { couleurs: ["#6fa64f", "#8dbb6a", "#567f3c"], opacite: 0.3, nom: "guilde-clans" }]
];
const TEINTE_TITRE = { couleurs: ["#d9a93a", "#e8c25a", "#b8862a"], opacite: 0.46, nom: "guilde-titre" };

let hall = null, salle = null;   // les deux doubles pages : { g, d }
let piece = null;                // la pièce ouverte après le Hall (son id), ou null

function page(cle, cote) {
    const el = document.createElement("div");
    el.className = `page-grimoire page-papier ${cote} page-guilde`;
    el.id = `grimoire-guilde-${cle}-${cote[0]}`;
    return el;
}
function creer() {
    if (hall) return;
    hall = { g: page("hall", "gauche"), d: page("hall", "droite") };
    salle = { g: page("piece", "gauche"), d: page("piece", "droite") };
}
const liste = () => (hall ? [hall.g, hall.d, ...(piece ? [salle.g, salle.d] : [])] : []);
function poser() {
    const g = G();
    if (!g || typeof g.definirGuilde !== "function" || !g.enPartie || !g.enPartie()) return;
    creer();
    const voulu = liste(), avant = g.pagesGuilde();
    if (avant.length === voulu.length && avant.every((el, i) => el === voulu[i])) return;
    g.definirGuilde(voulu);
}

// ---------------------------------------------------------------------
//  LES PAGES
// ---------------------------------------------------------------------
const dessins = () => (G() && G().dessins) || {};
const lavis = (teinte, graine) => {
    const d = window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.dessins;
    return d && d.lavis ? d.lavis(teinte, graine) : "";
};
// Une entrée, écrite comme celles du sommaire (penchée, sur un lavis), sans numéro ni trait (v434).
function entree(id, texte, teinte) {
    const d = dessins();
    const r = d.hasard ? d.hasard("guilde-" + id) : Math.random;
    const penche = ((r() * 2 - 1) * 3.4).toFixed(2), decale = ((r() * 2 - 1) * 7).toFixed(1);
    return `<button type="button" class="entree-guilde" id="guilde-${id}" data-action="guilde" data-gu="${id}" style="--penche:${penche}deg; --decale:${decale}">`
        + `${lavis(teinte, "guilde-" + id)}<span class="entree-guilde-texte">${echapper(texte)}</span></button>`;
}
function rendreHall() {
    hall.g.innerHTML = `<div class="contenu-page page-guilde-menu">
           <div class="entrees-guilde">${PIECES.map(([id, t, teinte]) => entree(id, t, teinte)).join("")}</div>
         </div>`;
    hall.d.innerHTML = `<div class="contenu-page page-guilde-titre">
           <div class="titre-guilde">${lavis(TEINTE_TITRE, "guilde-titre")}<span>Hall de guilde</span></div>
           ${FLEURON}
         </div>`;
}
function rendrePiece() {
    if (!piece) return;
    const p = PIECES.find(x => x[0] === piece) || PIECES[0];
    [salle.g, salle.d].forEach(el => { el.classList.toggle("page-tableau-missions", piece === "missions"); el.dataset.piece = piece; });
    if (piece === "missions") { rendreTableau(); return; }
    salle.g.innerHTML = `<div class="contenu-page page-guilde-menu page-guilde-piece">
           <p class="guilde-developpement">En développement.</p>
         </div>`;
    salle.d.innerHTML = `<div class="contenu-page page-guilde-titre">
           <div class="titre-guilde titre-piece">${lavis(p[2], "guilde-titre-" + piece)}<span>${echapper(p[1])}</span></div>
           ${FLEURON}
           <p class="guilde-developpement">Cette pièce du Hall ouvrira bientôt.</p>
         </div>`;
}

// ---------------------------------------------------------------------
//  LE TABLEAU DES MISSIONS : l'image étirée sur toute la double page (chaque
//  page en montre sa moitié), et ses encarts.
// ---------------------------------------------------------------------
let encarts = {}, prochainNumero = 1, selection = null, geste = null, enAttente = null;
const CLE_VISIBLES = "ivalis_ENCARTS_TABLEAU_VISIBLES";
const estDev = () => lireLS("ivalis_DEV_MODE") === "on";
const edition = () => estDev() && lireLS(CLE_VISIBLES) === "on";
const pct = (v) => (v * 100).toFixed(3) + "%";

function htmlEncarts() {
    const ed = edition();
    return Object.values(encarts).sort((a, b) => a.numero - b.numero).map(e => `<div class="encart-tableau${ed ? " edition" : ""}${selection === e.numero ? " choisi" : ""}" data-numero="${e.numero}"
            style="left:${pct(e.x)};top:${pct(e.y)};width:${pct(e.l)};height:${pct(e.h)};transform:rotate(${e.angle}deg)">${ed ? `<span class="encart-numero">${e.numero}</span>
            <span class="encart-poignee encart-taille" data-geste="taille"></span><span class="encart-poignee encart-rotation" data-geste="rotation"></span>` : ""}</div>`).join("");
}
function rendreTableau() {
    if (!salle || piece !== "missions") return;
    [["g", "gauche"], ["d", "droite"]].forEach(([k, cote]) => {
        salle[k].innerHTML = `<div class="contenu-tableau"><div class="calque-tableau" style="left:${cote === "gauche" ? "0" : "-100%"}">`
            + `<img class="image-tableau" src="${IMAGE_TABLEAU}" alt="${cote === "gauche" ? "Le tableau des missions" : ""}" draggable="false">${htmlEncarts()}</div></div>`;
    });
}
// La base : écoutée par tous les postes.
function lireEncarts(data) {
    const res = {};
    Object.entries((data && data.Encarts) || {}).forEach(([cle, e]) => {
        const numero = Number((e && e.Numero) || cle);
        if (!(numero > 0) || !e) return;
        res[numero] = { numero, x: Number(e.x) || 0, y: Number(e.y) || 0, l: Number(e.l) || 0.1, h: Number(e.h) || 0.1, angle: Number(e.angle) || 0 };
    });
    return res;
}
function appliquer(data) {
    if (geste) { enAttente = data; return; }
    encarts = lireEncarts(data);
    const max = Math.max(0, ...Object.keys(encarts).map(Number));
    prochainNumero = Math.max(Number(data && data.Prochain_Numero) || 1, max + 1);
    if (selection && !encarts[selection]) selection = null;
    rendreTableau(); majPopup();
}
const ref = () => doc(db, "Carte_Livre", "Tableau_Missions");
let ecoute = false;
function ecouter() {
    if (ecoute) return;
    ecoute = true;
    getDoc(ref()).then(s => appliquer(s.exists() ? s.data() : {})).catch(e => console.warn("Le tableau des missions : les encarts", e));
    try { onSnapshot(ref(), s => appliquer(s.exists() ? s.data() : {}), () => {}); } catch (e) {}
}
async function enregistrer(numero) {
    const e = encarts[numero];
    if (!e) return;
    const r = (v) => Math.round(v * 10000) / 10000;
    try { await setDoc(ref(), { Prochain_Numero: prochainNumero, Encarts: { [numero]: { Numero: numero, x: r(e.x), y: r(e.y), l: r(e.l), h: r(e.h), angle: Math.round(e.angle * 10) / 10 } } }, { merge: true }); }
    catch (err) { console.error("Encart " + numero + " du tableau :", err); }
}
export async function creerEncart() {
    const n = prochainNumero++;
    const decalage = (Object.keys(encarts).length % 6) * 0.025;
    encarts[n] = { numero: n, x: 0.2 + decalage, y: 0.25 + decalage, l: 0.16, h: 0.18, angle: 0 };
    selection = n;
    if (!edition()) ecrireLS(CLE_VISIBLES, "on");
    rendreTableau(); majPopup();
    if (piece !== "missions") ouvrir("missions");
    await enregistrer(n);
    return n;
}
export async function supprimerEncart(numero) {
    const n = numero || selection;
    if (!n || !encarts[n]) return;
    delete encarts[n];
    if (selection === n) selection = null;
    rendreTableau(); majPopup();
    try { await setDoc(ref(), { Encarts: { [n]: deleteField() } }, { merge: true }); } catch (e) { console.error("Encart " + n + " :", e); }
}
async function incliner(angle) {
    const e = encarts[selection];
    if (!e || !Number.isFinite(angle)) return;
    e.angle = Math.max(-180, Math.min(180, angle));
    rendreTableau();
    await enregistrer(selection);
}

// Les gestes (DEV, encarts visibles) : glisser l'encart le déplace ; le carré du coin
// l'étire ; le rond du haut le fait tourner. En parts de la double page (le livre).
function pointDouble(ev) {
    const livre = G() && G().livre();
    const r = livre ? livre.getBoundingClientRect() : { left: 0, top: 0, width: 1, height: 1 };
    return { x: (ev.clientX - r.left) / (r.width || 1), y: (ev.clientY - r.top) / (r.height || 1), r };
}
function surAppui(ev) {
    const boite = ev.target && ev.target.closest && ev.target.closest(".encart-tableau.edition");
    if (!boite || !edition()) return;
    ev.preventDefault(); ev.stopPropagation();
    const n = Number(boite.dataset.numero), e = encarts[n];
    if (!e) return;
    selection = n;
    const sorte = (ev.target.dataset && ev.target.dataset.geste) || "deplacer";
    const p = pointDouble(ev);
    geste = { n, sorte, x0: p.x, y0: p.y, depart: { ...e }, ratio: p.r.width / (p.r.height || 1), bouge: false };
    rendreTableau(); majPopup();
    window.addEventListener("pointermove", surGlisse, true);
    window.addEventListener("pointerup", surLache, true);
    window.addEventListener("pointercancel", surLache, true);
}
function surGlisse(ev) {
    if (!geste) return;
    ev.preventDefault();
    const p = pointDouble(ev), e = encarts[geste.n], d = geste.depart;
    if (!e) return;
    const dx = p.x - geste.x0, dy = p.y - geste.y0;
    if (Math.abs(dx) + Math.abs(dy) > 0.002) geste.bouge = true;
    if (geste.sorte === "deplacer") {
        e.x = Math.max(-d.l / 2, Math.min(1 - d.l / 2, d.x + dx));
        e.y = Math.max(-d.h / 2, Math.min(1 - d.h / 2, d.y + dy));
    } else if (geste.sorte === "taille") {
        // Le coin suit le doigt, dans le repère de l'encart penché.
        const a = d.angle * Math.PI / 180, R = geste.ratio;
        const lx = (dx * R) * Math.cos(a) + dy * Math.sin(a), ly = -(dx * R) * Math.sin(a) + dy * Math.cos(a);
        e.l = Math.max(0.02, d.l + lx / R);
        e.h = Math.max(0.02, d.h + ly);
    } else if (geste.sorte === "rotation") {
        const R = geste.ratio, cx = (d.x + d.l / 2) * R, cy = d.y + d.h / 2;
        e.angle = Math.round(Math.atan2(p.x * R - cx, -(p.y - cy)) * 180 / Math.PI);
    }
    rendreTableau(); majPopup();
}
function surLache() {
    window.removeEventListener("pointermove", surGlisse, true);
    window.removeEventListener("pointerup", surLache, true);
    window.removeEventListener("pointercancel", surLache, true);
    const g = geste;
    geste = null;
    if (g && g.bouge) enregistrer(g.n);
    if (enAttente) { const d = enAttente; enAttente = null; appliquer(d); }
}
document.addEventListener("pointerdown", surAppui, true);

// L'outil dans le bouton DEV rouge (onglet « Nouveau », grimoire_carte.js).
function poserOutil() {
    const nouveau = document.getElementById("dev-onglet-nouveau");
    if (!nouveau || document.getElementById("outil-encarts-tableau")) return;
    const bloc = document.createElement("div");
    bloc.id = "outil-encarts-tableau";
    bloc.innerHTML = `
        <div class="popup-regions-sous-titre">📜 Le tableau des missions : les encarts</div>
        <label class="popup-regions-case"><input type="checkbox" id="case-encarts-visibles"> Afficher les encarts</label>
        <button type="button" id="btn-encart-nouveau" class="popup-regions-bouton">+ Nouvel encart</button>
        <div id="encart-selection" class="popup-regions-info">Aucun encart sélectionné</div>
        <label class="popup-regions-case">Inclinaison (°) <input type="number" id="encart-angle" step="0.5" min="-180" max="180" style="width:5em" disabled></label>
        <button type="button" id="btn-encart-supprimer" class="popup-regions-bouton secondaire" disabled>Supprimer cet encart</button>
        <div id="encarts-total" class="popup-regions-total"></div>
        <p class="popup-regions-aide">Sur la double page du tableau (Hall de guilde, Panneau des missions) : glisser un encart le déplace, le carré du coin l'étire, le rond du haut le fait pencher.</p>`;
    nouveau.appendChild(bloc);
    bloc.querySelector("#case-encarts-visibles").addEventListener("change", (e) => { ecrireLS(CLE_VISIBLES, e.target.checked ? "on" : "off"); if (!e.target.checked) selection = null; rendreTableau(); majPopup(); });
    bloc.querySelector("#btn-encart-nouveau").addEventListener("click", () => { son(); creerEncart(); });
    bloc.querySelector("#btn-encart-supprimer").addEventListener("click", () => { son(); supprimerEncart(); });
    bloc.querySelector("#encart-angle").addEventListener("change", (e) => incliner(Number(e.target.value)));
    majPopup();
}
function majPopup() {
    const caseV = document.getElementById("case-encarts-visibles");
    if (!caseV) return;
    caseV.checked = lireLS(CLE_VISIBLES) === "on";
    const e = encarts[selection];
    document.getElementById("encart-selection").textContent = e ? `Encart n° ${e.numero}` : "Aucun encart sélectionné";
    const angle = document.getElementById("encart-angle");
    angle.disabled = !e;
    if (e && document.activeElement !== angle) angle.value = String(e.angle);
    if (!e) angle.value = "";
    document.getElementById("btn-encart-supprimer").disabled = !e;
    const n = Object.keys(encarts).length;
    document.getElementById("encarts-total").textContent = n ? `${n} encart${n > 1 ? "s" : ""} sur le tableau` : "Aucun encart pour l'instant";
}

// ---------------------------------------------------------------------
//  ALLER AU HALL, LES GESTES
// ---------------------------------------------------------------------
let enRoute = 0;
function aller(el, essai) {
    const g = G();
    if (!g || !el) return;
    const i = g.indexDe(el);
    if (i < 0) { poser(); enRoute = Date.now(); if (essai < 60) setTimeout(() => aller(el, essai + 1), 100); return; }
    g.allerALaPage(i);
}
// Le Hall (sans pièce) ou une pièce : sa double page entre dans le livre, et le livre y va.
export function ouvrir(id) {
    const g = G();
    if (!g || !g.enPartie || !g.enPartie() || typeof g.definirGuilde !== "function") return false;
    creer();
    rendreHall();
    const voulue = id && PIECES.some(p => p[0] === id && p[0] !== "clans") ? id : null;
    if (voulue) { piece = voulue; rendrePiece(); }
    else if (!surLesPages()) piece = null;     // depuis le village : le Hall seul
    poser();
    enRoute = Date.now();
    aller(voulue ? salle.g : hall.g, 0);
    if (voulue === "missions") ecouter();
    return true;
}
export function agir(cible) {
    const gu = cible && cible.dataset.gu;
    if (gu === "hall") { son(); ouvrir(); return; }
    if (gu === "clans") { son(); if (window.GRIMOIRE_FICHES) window.GRIMOIRE_FICHES.allerAuxAventuriers(); return; }
    if (PIECES.some(p => p[0] === gu)) { son(); ouvrir(gu); }
}
// La double page affichée : "hall", la pièce, ou "" (ni l'une ni l'autre).
function vueActuelle() {
    const g = G(), pf = g && g.pageFlip && g.pageFlip();
    if (!hall || !pf || !g.ouvert || !g.ouvert() || !g.enPartie()) return "";
    const ici = pf.getCurrentPageIndex(), sur = (el) => { const i = g.indexDe(el); return i >= 0 && (ici === i || ici === i + 1); };
    if (sur(hall.g)) return "hall";
    if (piece && sur(salle.g)) return piece;
    return "";
}
const surLesPages = () => vueActuelle() !== "";
export const ouverte = () => surLesPages();
// Ouvertes, elles restent (la pièce aussi, depuis le Hall : on y retourne en tournant la
// page) ; quittées (et plus en route depuis 8 secondes), elles sortent du livre.
setInterval(() => {
    if (document.hidden) return;
    try {
        poserOutil();
        const g = G();
        if (!g || typeof g.pagesGuilde !== "function") return;
        if (surLesPages()) enRoute = Date.now();        // (lues à l'instant : 8 secondes de grâce une fois quittées)
        else if (g.pagesGuilde().length && Date.now() - enRoute > 8000 && !geste) { piece = null; g.definirGuilde([]); }
    } catch (e) { console.warn("Le livre : le Hall de guilde", e); }
}, 1000);

window.GRIMOIRE_GUILDE = {
    ouvrir, agir, ouverte, vue: () => vueActuelle() || "hall", piece: () => piece,
    pages: () => (hall ? [hall.g, hall.d] : []), pagesPiece: () => (salle && piece ? [salle.g, salle.d] : []), PIECES, IMAGE_TABLEAU,
    encarts: () => JSON.parse(JSON.stringify(encarts)), creerEncart, supprimerEncart, selection: () => selection,
    choisirEncart: (n) => { selection = encarts[n] ? n : null; rendreTableau(); majPopup(); }, incliner
};
