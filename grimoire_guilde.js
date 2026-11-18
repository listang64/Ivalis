// =========================================================================
//  IVALIS — LE HALL DE GUILDE DANS LE LIVRE (v433)
// =========================================================================
//  Nico : « un bouton pour le Hall de guilde au centre de la map village ; une
//  fois ouvert, une nouvelle double page : en gros titre Hall de guilde ; des
//  titres cliquables du même style que le sommaire : Panneau des missions /
//  Salle du conseil / Bureau du patriarche / Livre des clans. Les trois premiers
//  ouvrent une nouvelle double page (en développement) ; le Livre des clans
//  remplace les pages Aventuriers. » Et : « Hall de guilde à droite, à gauche les
//  boutons du menu ».
//
//    · La double page n'entre dans le livre que le temps qu'on la lit (comme les
//      fils invisibles) : juste après le village, d'où on l'ouvre (le bâtiment du
//      Hall, grimoire.js, LIEUX_VILLAGE) ; quittée, elle en ressort.
//    · `vue` : « hall » (le menu), ou l'une des trois pièces en développement ;
//      une pièce s'écrit sur la même double page, avec son retour au Hall.
//    · Le Livre des clans : les pages des clans (grimoire_fiches.js), sur le sien.
// =========================================================================

const G = () => window.GRIMOIRE;
const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const son = () => { try { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); } catch (e) {} };
const FLEURON = `<svg class="fleuron fleuron-guilde" viewBox="0 0 200 24" aria-hidden="true"><path d="M 8 12 C 40 4 70 4 92 12 M 108 12 C 130 4 160 4 192 12 M 92 12 C 96 6 104 6 108 12 C 104 18 96 18 92 12 Z"/><circle cx="100" cy="12" r="2.2"/></svg>`;

// Les entrées du menu : [id, titre, teinte du lavis].
export const PIECES = [
    ["missions", "Panneau des missions", { couleurs: ["#b3261e", "#c8402f", "#8f1d15"], opacite: 0.3, nom: "guilde-missions" }],
    ["conseil", "Salle du conseil", { couleurs: ["#5f86b0", "#7fa2c4", "#4a6f98"], opacite: 0.3, nom: "guilde-conseil" }],
    ["patriarche", "Bureau du patriarche", { couleurs: ["#8a5fb0", "#a37cc4", "#6d4890"], opacite: 0.26, nom: "guilde-patriarche" }],
    ["clans", "Livre des clans", { couleurs: ["#6fa64f", "#8dbb6a", "#567f3c"], opacite: 0.3, nom: "guilde-clans" }]
];
const ROMAINS = ["I", "II", "III", "IV"];
const TEINTE_TITRE = { couleurs: ["#d9a93a", "#e8c25a", "#b8862a"], opacite: 0.46, nom: "guilde-titre" };

let pages = null;
let vue = "hall";

function creer() {
    if (pages) return pages;
    const page = (cote) => { const el = document.createElement("div"); el.className = `page-grimoire page-papier ${cote} page-guilde`; el.id = "grimoire-guilde-" + cote[0]; return el; };
    pages = { g: page("gauche"), d: page("droite") };
    return pages;
}
function poser() {
    const g = G();
    if (!g || typeof g.definirGuilde !== "function" || !g.enPartie || !g.enPartie()) return;
    const { g: pg, d: pd } = creer();
    const avant = g.pagesGuilde();
    if (avant.length === 2 && avant[0] === pg && avant[1] === pd) return;
    g.definirGuilde([pg, pd]);
}

// ---------------------------------------------------------------------
//  LES PAGES
// ---------------------------------------------------------------------
const dessins = () => (G() && G().dessins) || {};
const lavis = (teinte, graine) => {
    const d = window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.dessins;
    return d && d.lavis ? d.lavis(teinte, graine) : "";
};
// Une entrée, écrite comme celles du sommaire : penchée, soulignée à la plume, sur un lavis.
function entree(id, texte, teinte, rang) {
    const d = dessins();
    const r = d.hasard ? d.hasard("guilde-" + id) : Math.random;
    const penche = ((r() * 2 - 1) * 3.4).toFixed(2), decale = ((r() * 2 - 1) * 7).toFixed(1);
    const souligne = d.souligneFond ? `background-image:${d.souligneFond("trait-guilde-" + id)}` : "";
    return `<button type="button" class="entree-guilde" id="guilde-${id}" data-action="guilde" data-gu="${id}" style="--penche:${penche}deg; --decale:${decale}">`
        + `${lavis(teinte, "guilde-" + id)}<span class="entree-guilde-texte" style='${souligne}'><span class="numero-guilde">${ROMAINS[rang]}-</span> ${echapper(texte)}</span></button>`;
}
function htmlHall() {
    return [
        `<div class="contenu-page page-guilde-menu">
           <button type="button" class="lien-fiche retour-guilde" data-action="guilde" data-gu="village">← Revenir au village</button>
           <div class="entrees-guilde">${PIECES.map(([id, t, teinte], i) => entree(id, t, teinte, i)).join("")}</div>
         </div>`,
        `<div class="contenu-page page-guilde-titre">
           <div class="titre-guilde">${lavis(TEINTE_TITRE, "guilde-titre")}<span>Hall de guilde</span></div>
           ${FLEURON}
         </div>`
    ];
}
function htmlPiece(id) {
    const piece = PIECES.find(p => p[0] === id) || PIECES[0];
    return [
        `<div class="contenu-page page-guilde-menu">
           <button type="button" class="lien-fiche retour-guilde" data-action="guilde" data-gu="hall">← Retour au Hall de guilde</button>
           <p class="guilde-developpement">En développement.</p>
         </div>`,
        `<div class="contenu-page page-guilde-titre">
           <div class="titre-guilde titre-piece">${lavis(piece[2], "guilde-titre-" + id)}<span>${echapper(piece[1])}</span></div>
           ${FLEURON}
           <p class="guilde-developpement">Cette pièce du Hall ouvrira bientôt.</p>
         </div>`
    ];
}
function rendre() {
    if (!pages) return;
    const [g, d] = vue === "hall" ? htmlHall() : htmlPiece(vue);
    pages.g.innerHTML = g;
    pages.d.innerHTML = d;
}

// ---------------------------------------------------------------------
//  ALLER AU HALL, LES GESTES
// ---------------------------------------------------------------------
let enRoute = 0;
function aller(essai) {
    const g = G();
    if (!g || !pages) return;
    const i = g.indexDe(pages.g);
    if (i < 0) { poser(); enRoute = Date.now(); if (essai < 60) setTimeout(() => aller(essai + 1), 100); return; }
    g.allerALaPage(i);
}
export function ouvrir(piece) {
    const g = G();
    if (!g || !g.enPartie || !g.enPartie() || typeof g.definirGuilde !== "function") return false;
    creer();
    vue = piece && PIECES.some(p => p[0] === piece && p[0] !== "clans") ? piece : "hall";
    rendre();
    poser();
    enRoute = Date.now();
    aller(0);
    return true;
}
export function agir(cible) {
    const gu = cible && cible.dataset.gu;
    if (gu === "hall") {
        son();
        // Depuis le village (le bâtiment) : le livre y va ; depuis une pièce : le menu revient.
        if (ouverte()) { vue = "hall"; rendre(); } else ouvrir();
        return;
    }
    if (gu === "village") { son(); vue = "hall"; if (G() && G().allerAuVillage) G().allerAuVillage(); return; }
    if (gu === "clans") { son(); if (window.GRIMOIRE_FICHES) window.GRIMOIRE_FICHES.allerAuxAventuriers(); return; }
    if (PIECES.some(p => p[0] === gu)) { son(); vue = gu; rendre(); }
}
export function ouverte() {
    const g = G(), pf = g && g.pageFlip && g.pageFlip();
    if (!pages || !pf || !g.ouvert || !g.ouvert() || !g.enPartie()) return false;
    const i = g.indexDe(pages.g), ici = pf.getCurrentPageIndex();
    return i >= 0 && (ici === i || ici === i + 1);
}
// Ouverte, elle reste ; quittée (et plus en route depuis 8 secondes), elle sort du livre.
setInterval(() => {
    if (document.hidden) return;
    try {
        const g = G();
        if (!g || typeof g.pagesGuilde !== "function") return;
        if (ouverte()) enRoute = 0;
        else if (g.pagesGuilde().length && Date.now() - enRoute > 8000) { g.definirGuilde([]); vue = "hall"; }
    } catch (e) { console.warn("Le livre : le Hall de guilde", e); }
}, 1000);

window.GRIMOIRE_GUILDE = { ouvrir, agir, ouverte, vue: () => vue, pages: () => (pages ? [pages.g, pages.d] : []), PIECES };
