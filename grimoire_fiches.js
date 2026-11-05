// =========================================================================
//  IVALIS — LES AVENTURIERS DANS LE LIVRE (v313)
// =========================================================================
//  Nico : « on va maintenant intégrer les fiches de personnages dans le
//  livre ». Après les cartes régionales (grimoire.js, definirFiches) :
//
//    · LES CLANS : « Aventuriers » au sommaire mène à une page titrée
//      « Clan de Benjamin » (un clan par joueur, une page par clan, le sien
//      d'abord), et dessous ses héros, dans l'ordre de leur création :
//      « Nom - Classe ». Un toucher ouvre la fiche du héros ;
//    · LA FICHE : à gauche, l'avatar en pleine page et, à ses pieds (pour
//      cacher la coupe de l'image), son nom en titre doré qui s'ajuste à la
//      largeur, une ombre dessous ; à droite, de haut en bas : le niveau et sa
//      jauge remplie au crayon de papier (sans le chiffre de l'XP) ; la race et
//      la classe (un appui long : leur description) ; les caractéristiques (un
//      appui long : ce qu'elles servent) ; points de vie, fatigue max, régén. ;
//      les talents (appui long : leur effet) ; réflexes et résistances ; les
//      blessures (appui long : leur effet) ;
//    · LES COMPÉTENCES : les bannières, refaites en code à l'encre (pas de
//      couleur de joueur) ; un toucher fait apparaître la carte sur la page de
//      droite, comme de l'encre qui monte dans le papier — plus d'image ;
//    · LA FORGE : sur sa double page, la technique à gauche et, à droite, le
//      codex de tous les effets (la Forge de competences.js, rangée dans le
//      livre) ;
//    · L'INVENTAIRE : la richesse (pièces de laiton et de bronze ; un appui
//      long : 30 bronzes = 1 laiton), l'armure, les deux mains et un
//      emplacement de stockage (une arme qu'on ne tient pas) ; en bas, un petit
//      « Dev » souligné, en mode développeur, mène aux pages du panneau DEV.
//
//  Les chiffres viennent des mêmes lectures que l'ancienne fiche
//  (pvMaxCombattant, caracAvecBonus, talents, blessures…) : la fiche du livre
//  annonce ce que le combat lira. L'ancienne fenêtre reste derrière, cachée :
//  elle garde ses rôles (le deck, l'onglet DEV, la Forge) ; elle reprend sa
//  place en combat, où le livre n'est pas là.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, updateDoc, getDocs, collection } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const G = () => window.GRIMOIRE;
const D = () => (G() && G().dessins) || {};
const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const son = () => { try { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); } catch (e) {} };
const modeDev = () => { try { return localStorage.getItem("ivalis_DEV_MODE") === "on"; } catch (e) { return false; } };
const cadre = (graine, ampleur) => (D().cadreMain ? D().cadreMain(graine, ampleur) : "");
function hasard(graine) {
    if (D().hasard) return D().hasard(graine);
    let s = 7;
    for (const c of String(graine)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// 30 pièces de bronze font une pièce de laiton (Nico).
const BRONZES_PAR_LAITON = 30;
window.BRONZES_PAR_LAITON = BRONZES_PAR_LAITON;

// ---------------------------------------------------------------------
//  LES DONNÉES
// ---------------------------------------------------------------------
const tousLesHeros = () => ((window.PERSOS_JOUEURS_PARTIE || window.PERSOS_PARTIE || [])).filter(p => p && !p.estIllusion);
const herosParId = (id) => tousLesHeros().find(p => p.idPersonnage === id)
    || (window.PERSOS_PARTIE || []).find(p => p && p.idPersonnage === id) || null;
const nomHeros = (h) => [h.prenom, h.nom].filter(Boolean).join(" ").trim() || "Sans nom";
const classeDe = (h) => {
    const c = h.classe || "";
    return (typeof window.nomClasseGenre === "function" ? window.nomClasseGenre(c, h.genre) : c) || "";
};
const idJoueurCourant = () => { try { return localStorage.getItem("ID_JOUEUR_COURANT") || ""; } catch (e) { return ""; } };

// Les noms des joueurs (Joueurs), lus une fois.
let joueurs = null, joueursEnLecture = null;
function chargerJoueurs() {
    if (joueurs || joueursEnLecture) return joueursEnLecture;
    joueursEnLecture = (async () => {
        const liste = {};
        try {
            const snap = await getDocs(collection(db, "Joueurs"));
            snap.forEach(d => { const x = d.data() || {}; if (x.Nom) liste[x.ID_Joueur || d.id] = x.Nom; });
        } catch (e) { console.warn("Le livre : les joueurs", e); }
        joueurs = liste;
        joueursEnLecture = null;
        majPlus(true);
    })();
    return joueursEnLecture;
}
function nomDuJoueur(id) {
    if (!id) return "";
    if (id === "MJ") return "MJ";
    const c = window.COMPTE_JOUEUR;
    if (joueurs && joueurs[id]) return joueurs[id];
    if (c && c.nom && id === idJoueurCourant()) return c.nom;
    return "";
}

// LES CLANS : un par joueur ; le sien d'abord, puis les autres par nom. Les
// héros dans l'ordre de leur création (Cree_Le, v313 ; ceux d'avant, faute de
// date, gardent l'ordre de la base, derrière).
function clans() {
    const moi = idJoueurCourant();
    const parJoueur = new Map();
    tousLesHeros().forEach((h, i) => {
        const j = h.idJoueur || "";
        if (!parJoueur.has(j)) parJoueur.set(j, []);
        parJoueur.get(j).push({ h, i });
    });
    const liste = [...parJoueur.entries()].map(([id, hs]) => ({
        id, nom: nomDuJoueur(id),
        heros: hs.sort((a, b) => ((a.h.creeLe || Infinity) - (b.h.creeLe || Infinity)) || (a.i - b.i)).map(x => x.h)
    }));
    liste.sort((a, b) => (a.id === moi ? -1 : b.id === moi ? 1 : 0) || String(a.nom || "~").localeCompare(String(b.nom || "~"), "fr"));
    if (!liste.some(c => c.id === moi) && moi) liste.unshift({ id: moi, nom: nomDuJoueur(moi), heros: [] });
    return liste;
}
const titreClan = (c) => c.id === "MJ" ? "Les gens du Maître du jeu" : (c.nom ? `Clan de ${c.nom}` : "Clan sans nom");

// Les caractéristiques d'un héros (sans bonus) : partagées par la partie,
// sinon le cache de l'ancienne fiche.
function caracsDe(id) {
    const p = (window.CARACS_PARTIE || {})[id];
    if (p && Object.keys(p).length) return p;
    try { const m = localStorage.getItem("ivalis_caracs_" + id); if (m) return JSON.parse(m); } catch (e) {}
    return null;
}

// ---------------------------------------------------------------------
//  LES PAGES
// ---------------------------------------------------------------------
let pagesClans = [];
const pagesFiche = {};          // fiche-g, fiche-d, tal-g, tal-d, tal2-g, tal2-d, comp-g, comp-d, forge-g, forge-d, inv-g, inv-d, dev-g, dev-d
// v318 — Nico : « l'image et les caracs en premier, ensuite les compétences,
// l'inventaire, les talents, la Forge, puis le panneau DEV ».
const ORDRE_FICHE = ["fiche-g", "fiche-d", "comp-g", "comp-d", "inv-g", "inv-d", "tal-g", "tal-d", "tal2-g", "tal2-d", "forge-g", "forge-d"];
const ORDRE_DEV = ["dev-g", "dev-d"];
let heros = null;               // l'identifiant du héros affiché
let carteOuverte = null;        // la compétence montrée sur la page de droite
let signatures = {};

function page(cle, cote, classe) {
    const el = document.createElement("div");
    el.className = `page-grimoire page-papier ${cote} page-fiches ${classe || ""}`;
    el.id = "grimoire-fiches-" + cle;
    return el;
}
function creerPagesFiche() {
    if (pagesFiche["fiche-g"]) return;
    ORDRE_FICHE.concat(ORDRE_DEV).forEach((cle, i) => {
        pagesFiche[cle] = page(cle, i % 2 === 0 ? "gauche" : "droite", "page-" + cle.split("-")[0].replace(/\d+$/, ""));
    });
}
// Les pages dans le livre : les clans (un nombre pair), la fiche, et le DEV en mode développeur.
function poserLesPages() {
    const g = G();
    if (!g || typeof g.definirFiches !== "function") return;
    creerPagesFiche();
    const els = [...pagesClans, ...ORDRE_FICHE.map(c => pagesFiche[c]), ...(modeDev() ? ORDRE_DEV.map(c => pagesFiche[c]) : [])];
    const avant = g.pagesFiches();
    if (avant.length === els.length && avant.every((el, i) => el === els[i])) return;
    g.definirFiches(els);
}
const indexDe = (el) => (G() && G().indexDe ? G().indexDe(el) : -1);
// (Des pages qui viennent d'entrer dans le livre n'y ont leur place qu'une fois
// qu'il les a relues : on attend un peu, 3 s au plus.)
function aller(el, essai) {
    const g = G(), i = indexDe(el);
    if (!g || !el) return;
    if (i < 0) { if ((essai || 0) < 30) setTimeout(() => aller(el, (essai || 0) + 1), 100); return; }
    g.allerALaPage(i);
}

// LES PAGES DES CLANS
function pageClan(c, cote, i) {
    const el = page("clan-" + i, cote, "page-clan");
    const moi = c.id === idJoueurCourant();
    const lignes = c.heros.map((h, k) => {
        const r = hasard("clan-" + h.idPersonnage);
        const penche = ((r() * 2 - 1) * 1.6).toFixed(2);
        return `<li style="--penche:${penche}deg"><button type="button" class="ligne-aventurier" data-action="fiches" data-fa="heros" data-id="${echapper(h.idPersonnage)}">
                  <span class="nom-aventurier">${echapper(nomHeros(h))}</span>${classeDe(h) ? ` <span class="tiret-aventurier">-</span> <span class="classe-aventurier">${echapper(classeDe(h))}</span>` : ""}
                  ${h.actif === false ? `<span class="aventurier-absent">(au repos)</span>` : ""}</button></li>`;
    }).join("");
    el.innerHTML = `<div class="contenu-page page-liste-clan">
        <div class="titre-clan">${echapper(titreClan(c))}</div>
        <svg class="fleuron fleuron-clan" viewBox="0 0 200 24" aria-hidden="true">
          <path d="M 8 12 C 40 4 70 4 92 12 M 108 12 C 130 4 160 4 192 12 M 92 12 C 96 6 104 6 108 12 C 104 18 96 18 92 12 Z"/><circle cx="100" cy="12" r="2.2"/></svg>
        ${lignes ? `<ol class="liste-aventuriers">${lignes}</ol>` : `<p class="clan-vide">Aucun aventurier pour l'instant.</p>`}
        ${moi ? `<button type="button" class="nouvel-aventurier" data-action="fiches" data-fa="creer">+ Un nouvel aventurier</button>` : ""}
      </div>`;
    return el;
}
function pageClanVide(i) {
    const el = page("clan-" + i, "droite", "page-clan page-clan-vide");
    el.innerHTML = `<div class="contenu-page page-liste-clan"><svg class="fleuron fleuron-fin" viewBox="0 0 200 24" aria-hidden="true">
        <path d="M 8 12 C 40 4 70 4 92 12 M 108 12 C 130 4 160 4 192 12 M 92 12 C 96 6 104 6 108 12 C 104 18 96 18 92 12 Z"/><circle cx="100" cy="12" r="2.2"/></svg></div>`;
    return el;
}
function construireClans() {
    const cs = clans();
    const sig = JSON.stringify(cs.map(c => [c.id, c.nom, c.heros.map(h => [h.idPersonnage, nomHeros(h), classeDe(h), h.actif !== false])]));
    if (sig === signatures.clans && pagesClans.length) return false;
    signatures.clans = sig;
    const nouvelles = cs.map((c, i) => pageClan(c, i % 2 === 0 ? "gauche" : "droite", i));
    if (nouvelles.length % 2) nouvelles.push(pageClanVide(nouvelles.length));
    // Les mêmes pages gardent leur place si leur nombre ne change pas (le livre ne bouge pas).
    if (nouvelles.length === pagesClans.length) {
        nouvelles.forEach((el, i) => { pagesClans[i].className = el.className; pagesClans[i].innerHTML = el.innerHTML; });
        return false;
    }
    pagesClans = nouvelles;
    return true;
}

// ---------------------------------------------------------------------
//  LES DESSINS : la jauge au crayon, les bannières, les pièces
// ---------------------------------------------------------------------
// LA JAUGE DE PROGRESSION (Nico : « remplie au crayon de papier, de façon un
// peu mal faite ») : un cadre tracé à la main, et des hachures de graphite qui
// débordent un peu, plus ou moins appuyées, jusqu'à la part acquise.
function jaugeCrayon(pct, graine) {
    const r = hasard("jauge-" + graine);
    const j = (a) => (r() - 0.5) * 2 * a;
    const fin = 3 + 194 * Math.max(0, Math.min(1, pct));
    let hachures = "";
    for (let x = 2; x < fin - 1; x += 2.1 + r() * 1.2) {
        const haut = 3 + j(1.4), bas = 17 + j(1.4), pente = 4 + j(1.5);
        hachures += `<path d="M ${(x + j(0.4)).toFixed(1)} ${bas.toFixed(1)} L ${Math.min(fin + 1.5, x + pente).toFixed(1)} ${haut.toFixed(1)}" style="opacity:${(0.45 + r() * 0.45).toFixed(2)}"/>`;
    }
    // Un second passage, plus léger, en travers.
    for (let x = 4; x < fin - 4; x += 6 + r() * 5) {
        hachures += `<path class="repasse" d="M ${(x).toFixed(1)} ${(14 + j(2)).toFixed(1)} Q ${(x + 6).toFixed(1)} ${(9 + j(3)).toFixed(1)} ${Math.min(fin, x + 11).toFixed(1)} ${(6 + j(2)).toFixed(1)}"/>`;
    }
    const contour = (k) => {
        const rr = hasard("contour-" + graine + k);
        const jj = (a) => (rr() - 0.5) * 2 * a;
        return `M ${(1 + jj(0.6)).toFixed(1)} ${(2 + jj(0.8)).toFixed(1)} Q 100 ${(1 + jj(1.4)).toFixed(1)} ${(199 + jj(0.6)).toFixed(1)} ${(2.4 + jj(0.8)).toFixed(1)}`
             + ` L ${(198.5 + jj(0.6)).toFixed(1)} ${(18 + jj(0.8)).toFixed(1)} Q 100 ${(19 + jj(1.2)).toFixed(1)} ${(1.5 + jj(0.6)).toFixed(1)} ${(17.6 + jj(0.8)).toFixed(1)} Z`;
    };
    return `<svg class="jauge-crayon" viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">
        <g class="graphite">${hachures}</g>
        <path class="contour" d="${contour(1)}"/><path class="contour leger" d="${contour(2)}"/></svg>`;
}

// LA BANNIÈRE D'UNE COMPÉTENCE (Nico : « refais-les en code, dans le même
// esprit que celles d'aujourd'hui, mais dans la pâte graphique du livre ; pas
// de couleur de joueur ») : le médaillon rond de l'initiative, à gauche, et la
// longue plaque du titre, à la pointe fendue, tracés à l'encre.
function dessinBanniere(graine) {
    const r = hasard("banniere-" + graine);
    const j = (a) => ((r() - 0.5) * 2 * a).toFixed(1);
    // La plaque s'étire avec la page ; le médaillon reste rond.
    const plaque = () => `M 0 ${15 + +j(0.6)} C 90 ${13.5 + +j(0.8)} 200 ${14.5 + +j(0.8)} ${290 + +j(0.6)} ${14 + +j(0.6)} L ${282 + +j(0.8)} 30 L ${291 + +j(0.6)} ${46 + +j(0.6)} C 200 ${45.5 + +j(0.8)} 90 ${46.5 + +j(0.8)} 0 ${45 + +j(0.6)}`;
    const rond = (rr) => {
        let d = "";
        for (let i = 0; i <= 18; i++) {
            const a = i / 18 * Math.PI * 2, k = rr + (r() - 0.5) * 1.2;
            d += `${i ? "L" : "M"} ${(30 + Math.cos(a) * k).toFixed(1)} ${(30 + Math.sin(a) * k).toFixed(1)} `;
        }
        return d;
    };
    return `<svg class="dessin-banniere plaque-banniere" viewBox="0 0 300 60" preserveAspectRatio="none" aria-hidden="true">
        <path class="plaque-fond" d="${plaque()} Z"/>
        <path class="plaque" d="${plaque()}"/><path class="plaque leger" d="${plaque()}"/>
        <path class="filet" d="M 14 ${19 + +j(0.4)} C 120 ${18 + +j(0.6)} 220 ${19 + +j(0.6)} 280 ${18.5 + +j(0.4)} M 14 ${41 + +j(0.4)} C 120 ${42 + +j(0.6)} 220 ${41 + +j(0.6)} 280 ${41.5 + +j(0.4)}"/></svg>
      <svg class="dessin-banniere medaillon-banniere" viewBox="0 0 60 60" aria-hidden="true">
        <path class="medaillon-fond" d="${rond(25)} Z"/>
        <path class="medaillon" d="${rond(25)}"/><path class="medaillon leger" d="${rond(21)}"/>
        <path class="perle" d="M 30 2.5 l 0 3 M 30 54.5 l 0 3 M 2.5 30 l 3 0"/></svg>`;
}

// LES PIÈCES ANTIQUES (Nico : « fais des images de pièces antiques ») : une
// pièce frappée, pas tout à fait ronde, son grènetis, et un motif — la
// chouette sur le laiton, l'épi de blé sur le bronze.
function piece(metal) {
    const r = hasard("piece-" + metal);
    const pts = [];
    for (let i = 0; i < 26; i++) {
        const a = i / 26 * Math.PI * 2, k = 28 + (r() - 0.5) * 2.6;
        pts.push(`${(32 + Math.cos(a) * k).toFixed(1)} ${(32 + Math.sin(a) * k).toFixed(1)}`);
    }
    const perles = Array.from({ length: 30 }, (_, i) => {
        const a = i / 30 * Math.PI * 2;
        return `<circle cx="${(32 + Math.cos(a) * 23.5).toFixed(1)}" cy="${(32 + Math.sin(a) * 23.5).toFixed(1)}" r="0.9"/>`;
    }).join("");
    const motif = metal === "laiton"
        ? `<ellipse cx="32" cy="35" rx="9" ry="12"/><circle cx="28" cy="29" r="3.6" class="creux"/><circle cx="36" cy="29" r="3.6" class="creux"/>
           <circle cx="28" cy="29" r="1.3"/><circle cx="36" cy="29" r="1.3"/><path d="M 30.5 32.5 L 32 35 L 33.5 32.5 Z"/>
           <path class="trait" d="M 25 22 L 27.5 25.5 M 39 22 L 36.5 25.5 M 27 41 Q 32 44 37 41 M 26 47 L 38 47"/>
           <path class="trait" d="M 40 18 q 4 1 5 5 M 44 17 l -1.5 2.5"/>`
        : `<path class="trait epais" d="M 32 50 C 31 40 32 26 33 15"/>
           ${[0, 1, 2, 3, 4].map(k => `<ellipse cx="${(29.2 + k * 0.25).toFixed(1)}" cy="${(42 - k * 6).toFixed(1)}" rx="2.4" ry="4" transform="rotate(-28 ${(29.2 + k * 0.25).toFixed(1)} ${(42 - k * 6).toFixed(1)})"/>`
            + `<ellipse cx="${(35.4 + k * 0.25).toFixed(1)}" cy="${(41 - k * 6).toFixed(1)}" rx="2.4" ry="4" transform="rotate(28 ${(35.4 + k * 0.25).toFixed(1)} ${(41 - k * 6).toFixed(1)})"/>`).join("")}
           <path class="trait" d="M 33 15 l 0 -4 M 32 50 l -5 4 M 32 50 l 5 4"/>`;
    return `<svg class="piece piece-${metal}" viewBox="0 0 64 64" aria-hidden="true">
        <defs><radialGradient id="metal-${metal}" cx="38%" cy="32%" r="75%">
          ${metal === "laiton"
            ? `<stop offset="0" stop-color="#fbeeb0"/><stop offset="0.45" stop-color="#d9b552"/><stop offset="0.8" stop-color="#a07a22"/><stop offset="1" stop-color="#6a4e10"/>`
            : `<stop offset="0" stop-color="#f1bf8e"/><stop offset="0.45" stop-color="#b8743c"/><stop offset="0.8" stop-color="#844a1e"/><stop offset="1" stop-color="#4f2a0e"/>`}
        </radialGradient></defs>
        <path class="tranche" d="M ${pts.join(" L ")} Z" transform="translate(1.2 1.6)"/>
        <path class="flan" d="M ${pts.join(" L ")} Z" fill="url(#metal-${metal})"/>
        <g class="grenetis">${perles}</g>
        <g class="motif">${motif}</g>
        <path class="reflet" d="M 14 22 Q 20 11 32 9"/></svg>`;
}

// LE LAVIS D'AQUARELLE (v315, Nico : « un peu d'aquarelle léger et irrégulier,
// artistique ») : deux ou trois flaques de couleur aux bords tremblés (bruit
// de Perlin qui déplace le contour), le pigment plus dense sur les bords comme
// une eau qui sèche, un grain de papier qui le marbre. Les taches de sang des
// blessures : un lavis à peine posé et des gouttes. La graine fixe le dessin :
// il ne change pas d'un affichage à l'autre.
const TEINTES_LAVIS = {
    rouge: { couleurs: ["#b3261e", "#c8402f", "#8f1d15"], opacite: 0.34 },
    jaune: { couleurs: ["#f0c21a", "#f5d23e"], opacite: 0.27 },
    vert: { couleurs: ["#6fa64f", "#8dbb6a"], opacite: 0.19 },
    beige: { couleurs: ["#c49a62", "#dcbc8c", "#a87d4c"], opacite: 0.3 },
    gris: { couleurs: ["#6f6c66", "#8d8981", "#5b5852"], opacite: 0.2 },
    bleu: { couleurs: ["#5f86b0", "#7fa2c4"], opacite: 0.2 },
    sang: { couleurs: ["#a3201a", "#7d1610", "#c0352a"], opacite: 0.42, tachete: true }
};
let numeroLavis = 0;
function lavis(teinte, graine, options) {
    const t = TEINTES_LAVIS[teinte] || TEINTES_LAVIS.gris;
    const o = options || {};
    const r = hasard("lavis-" + teinte + "-" + graine);
    const id = "filtre-lavis-" + (++numeroLavis);
    const seed = Math.floor(r() * 900) + 1;
    // Une flaque : un contour polaire bosselé autour de (cx, cy).
    const flaque = (cx, cy, rx, ry, couleur, opacite, regulier) => {
        const n = 14, pts = [];
        const phase = r() * 6.28;
        for (let i = 0; i < n; i++) {
            const a = phase + (i / n) * Math.PI * 2;
            const k = regulier ? 0.95 + r() * 0.12 : 0.82 + r() * 0.3;
            pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
        }
        // Courbes lissées (Catmull-Rom → Bézier).
        let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
        for (let i = 0; i < n; i++) {
            const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
            const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
            const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
            d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
        }
        return `<path d="${d} Z" fill="${couleur}" fill-opacity="${opacite.toFixed(2)}"/>`;
    };
    let formes = "";
    if (t.tachete) {
        formes += flaque(100, 50, 92, 40, t.couleurs[0], 0.28);
        const n = 16 + Math.floor(r() * 10);
        for (let i = 0; i < n; i++) {
            const gros = r() < 0.25;
            const rx = gros ? 5 + r() * 6 : 1.4 + r() * 3.4;
            formes += flaque(8 + r() * 184, 8 + r() * 84, rx, rx * (0.7 + r() * 0.5), t.couleurs[i % t.couleurs.length], 0.55 + r() * 0.35);
        }
    } else if (o.deborde) {
        // (v315, Nico : « qu'elle remplisse quand même en majeure partie le
        // rectangle ») : une grande flaque presque rectangulaire (un contour
        // superelliptique, bosselé) qui couvre la carte, puis des reprises plus
        // sombres par endroits.
        const pts = [], n = 28, phase = r() * 6.28;
        for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2, c = Math.cos(a), si = Math.sin(a);
            const k = 0.97 + r() * 0.08 + Math.sin(a * 3 + phase) * 0.02;
            // |x|^4 + |y|^4 = 1 : un rectangle aux coins arrondis.
            const sx = Math.sign(c) * Math.pow(Math.abs(c), 0.5), sy = Math.sign(si) * Math.pow(Math.abs(si), 0.5);
            pts.push([100 + sx * 97 * k, 50 + sy * 47 * k]);
        }
        let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
        for (let i = 0; i < n; i++) {
            const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
            d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
        }
        formes += `<path d="${d} Z" fill="${t.couleurs[0]}" fill-opacity="0.8"/>`;
        for (let i = 1; i < t.couleurs.length + 1; i++) {
            formes += flaque(30 + r() * 140, 20 + r() * 60, 28 + r() * 30, 14 + r() * 14, t.couleurs[i % t.couleurs.length], 0.35 + r() * 0.25);
        }
    } else {
        const n = t.couleurs.length;
        for (let i = 0; i < n; i++) {
            const cx = 100 + (r() * 2 - 1) * 26, cy = 50 + (r() * 2 - 1) * 10;
            formes += flaque(cx, cy, 70 + r() * 26 - i * 8, 32 + r() * 12 - i * 3, t.couleurs[i], i === 0 ? 0.85 : 0.5 + r() * 0.3);
        }
    }
    // Où il déborde (la carte de compétence : sur un bord, au hasard).
    let style = "";
    if (o.deborde) {
        const cote = Math.floor(r() * 4);
        const e = 5 + r() * 5, l = (99 + e).toFixed(1) + "%";
        style = ["left:-" + e.toFixed(1) + "%;width:" + l, "width:" + l, "top:-" + e.toFixed(1) + "%;height:" + l, "height:" + l][cote];
        style = ` style="${style}"`;
    }
    return `<svg class="lavis lavis-${teinte}${o.deborde ? " lavis-deborde" : ""}" viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true"${style}><defs><filter id="${id}" x="-20%" y="-30%" width="140%" height="160%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.025 0.05" numOctaves="3" seed="${seed}" result="bruit"/>
        <feDisplacementMap in="SourceGraphic" in2="bruit" scale="${t.tachete ? 7 : 16}" xChannelSelector="R" yChannelSelector="G" result="forme"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="2" seed="${seed + 11}" result="grain"/>
        <feColorMatrix in="grain" type="matrix" values="1.3 0 0 0 -0.15  1.3 0 0 0 -0.15  1.3 0 0 0 -0.15  1.3 0 0 0 -0.15" result="grainGris"/>
        <feComposite in="forme" in2="grainGris" operator="arithmetic" k1="0.6" k2="0.55" k3="0" k4="0" result="marbre"/>
        <feMorphology in="forme" operator="erode" radius="1.6" result="dedans"/>
        <feComposite in="forme" in2="dedans" operator="out" result="bord"/>
        <feGaussianBlur in="bord" stdDeviation="0.7" result="bordDoux"/>
        <feGaussianBlur in="marbre" stdDeviation="0.5" result="eau"/>
        <feMerge><feMergeNode in="eau"/><feMergeNode in="bordDoux"/></feMerge>
      </filter></defs><g filter="url(#${id})" opacity="${t.opacite}">${formes}</g></svg>`;
}

// Le petit d20 d'un jet que l'Arbitre attend.
const D20 = `<svg class="d20-fiche" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2 L37 11 L37 29 L20 38 L3 29 L3 11 Z M20 2 L11 25 L29 25 Z M3 11 L11 25 M37 11 L29 25 M11 25 L20 38 L29 25 M3 29 L11 25 M37 29 L29 25"/></svg>`;

// ---------------------------------------------------------------------
//  LA FICHE (double page 1)
// ---------------------------------------------------------------------
function ajusterNom(el) {
    if (!el) return;
    el.style.fontSize = "";
    const largeur = el.clientWidth, voulue = el.scrollWidth;
    if (!largeur) return;
    if (voulue > largeur) el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * largeur / voulue * 0.97).toFixed(2) + "px";
}

function htmlAvatar(h) {
    const url = h.urlCloudinary || h.urlPortraitReference || "";
    return `<div class="contenu-page page-avatar-heros">
        ${url ? `<img class="avatar-heros" src="${echapper(url)}" alt="" draggable="false">` : `<div class="avatar-absent">Pas encore de portrait</div>`}
        <div class="pied-avatar"></div>
        <div class="nom-heros-fiche" id="fiche-nom-heros">${echapper(nomHeros(h))}</div>
      </div>`;
}

// Le texte d'un appui long : une petite note à l'encre.
const aide = (titre, texte) => `data-aide="${echapper(JSON.stringify({ t: titre, x: texte }))}"`;

function descriptionRace(h) {
    const nom = String(h.race || "").trim();
    const r = (window.RACES_MONDE || []).find(x => String(x.Nom || "").trim().toLowerCase() === nom.toLowerCase());
    const d = typeof window.detailBonusRaceClasse === "function" ? window.detailBonusRaceClasse(h) : null;
    const morceaux = [];
    if (r && r.Descriptif_Physique) morceaux.push(r.Descriptif_Physique);
    if (r && r.Place_Monde) morceaux.push(r.Place_Monde);
    if (d && d.race && d.race.lignes && d.race.lignes.length) morceaux.push("Atouts : " + d.race.lignes.join(" · "));
    return morceaux.join("\n\n") || "Le Grimoire des Races n'en dit rien encore.";
}
function descriptionClasse(h) {
    const nom = String(h.classe || "").trim();
    const c = (window.CLASSES_CACHE || window.CLASSES_PAR_DEFAUT || []).find(x => String(x.nom || "").toLowerCase() === nom.toLowerCase());
    const d = typeof window.detailBonusRaceClasse === "function" ? window.detailBonusRaceClasse(h) : null;
    const morceaux = [];
    if (c && c.description) morceaux.push(c.description);
    if (d && d.classe && d.classe.paliers) {
        d.classe.paliers.forEach(p => { if (p.lignes && p.lignes.length) morceaux.push(`Niv. ${p.niveau}${p.atteint ? "" : " (à venir)"} : ${p.lignes.join(" · ")}`); });
    }
    return morceaux.join("\n\n") || "Pas de description pour cette classe.";
}

const NOMS_COURTS = { force: "FOR", dex: "DEX", con: "CON", int: "INT", sag: "SAG", cha: "CHA" };
function htmlCaracs(h) {
    const brutes = caracsDe(h.idPersonnage);
    if (!brutes) {
        const moi = !h.idJoueur || h.idJoueur === idJoueurCourant();
        return `<div class="encart-fiche encart-caracs vide">${cadre("caracs-" + h.idPersonnage)}
            <p class="fiche-attente">Ce héros n'a pas encore éveillé son potentiel.</p>
            ${moi ? `<button type="button" class="lien-fiche" data-action="fiches" data-fa="repartir">Répartir ses caractéristiques</button>` : ""}</div>`;
    }
    const noms = window.NOMS_CARACS || [];
    const aides = window.AIDE_CARACS || {};
    const sansAcc = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
    const jets = (window.JETS_DEMANDES || []).filter(j => j.idPerso === h.idPersonnage);
    const cases = ["force", "dex", "con", "int", "sag", "cha"].map(id => {
        const c = noms.find(x => x.id === id) || { id, nom: id.toUpperCase(), desc: "" };
        const base = parseInt(brutes[id]) || 8;
        const val = typeof window.caracAvecBonus === "function" ? window.caracAvecBonus(h, id, base) : base;
        const mod = Math.floor((val - 10) / 2);
        const a = aides[id];
        const texte = [c.desc, a ? "En combat : " + a.combat.join(", ") + "." : "", a ? "En jeu : " + a.rp + "." : "",
                       val !== base ? `Dont ${val - base > 0 ? "+" : ""}${val - base} de bonus.` : ""].filter(Boolean).join("\n");
        const attendu = jets.find(j => sansAcc(j.caracteristique) === sansAcc(c.nom));
        return `<div class="case-carac${attendu ? " jet-demande" : ""}" data-carac="${id}" ${aide(c.nom.charAt(0) + c.nom.slice(1).toLowerCase() + ` (${val})`, texte)}
                 ${attendu ? `data-action="fiches" data-fa="jet" data-nom="${echapper(c.nom)}" data-val="${val}" data-mod="${mod}"` : ""}>
            <span class="nom-carac">${NOMS_COURTS[id]}</span><span class="valeur-carac">${val}</span><span class="mod-carac">${mod >= 0 ? "+" + mod : mod}</span>
            ${attendu ? D20 : ""}</div>`;
    }).join("");
    return `<div class="encart-fiche encart-caracs">${cadre("caracs-" + h.idPersonnage)}<div class="grille-caracs">${cases}</div></div>`;
}

function htmlTalents(h) {
    if (typeof window.talentsDuPerso !== "function" || !window.TALENTS) return "";
    const pris = window.talentsDuPerso(h);
    const ids = window.TALENTS.filter(t => pris[t.id]).map(t => t.id);
    const dispo = typeof window.pointsTalentsDisponibles === "function" ? window.pointsTalentsDisponibles(h) : 0;
    const lignes = ids.map(id => {
        const t = window.talentParId(id);
        const effet = typeof window.resumeTalent === "function" ? window.resumeTalent(h, id) : "";
        return `<li class="talent-fiche" ${aide(t.nom, effet || t.description || "")}>✦ ${echapper(t.nom)}${t.max > 1 ? ` <small>${pris[id]}/${t.max}</small>` : ""}</li>`;
    }).join("");
    const moi = !h.idJoueur || h.idJoueur === idJoueurCourant() || modeDev();
    return `<div class="encart-fiche encart-talents">${cadre("talents-" + h.idPersonnage)}
        <div class="entete-encart-talents"><div class="titre-encart">Talents</div>
          <button type="button" class="lien-fiche vers-talents" data-action="fiches" data-fa="talents">${dispo > 0 && moi ? `✦ ${dispo} à choisir` : "Tous les talents"} ›</button></div>
        ${lignes ? `<ul class="liste-talents">${lignes}</ul>` : `<p class="fiche-attente">Aucun talent encore.</p>`}
      </div>`;
}

// LA DOUBLE PAGE DES TALENTS (v315, Nico : « intègre du mieux que tu
// puisses la fenêtre des talents dans les pages de sa fiche ») : les sept
// lignes de talents.js, Général et les six caractéristiques, chacune sous son
// médaillon, avec la valeur de la carac et le compte des talents pris. Chaque
// talent est une étiquette à l'encre : coché s'il est pris, cerclé d'or s'il
// peut l'être (un toucher : la même demande que l'ancienne fenêtre), pâli et
// cadenassé s'il manque la carac, « à venir » s'il n'est pas encore écrit. Un
// appui long : son effet (pour ce héros s'il l'a).
// (Leur effet écrit en toutes lettres, v315 : deux doubles pages, dans l'ordre
// des lignes.)
const LIGNES_PAR_PAGE = { "tal-g": [null, "force"], "tal-d": ["dex", "con"], "tal2-g": ["int", "sag"], "tal2-d": ["cha"] };
function htmlTalentsPage(h, cote) {
    if (!window.LIGNES_TALENTS || !window.TALENTS || typeof window.etatTalent !== "function") {
        return `<div class="contenu-page page-talents"><p class="fiche-attente">Les talents ne sont pas encore chargés.</p></div>`;
    }
    const pris = window.talentsDuPerso(h);
    const dispo = typeof window.pointsTalentsDisponibles === "function" ? window.pointsTalentsDisponibles(h) : 0;
    const moi = !h.idJoueur || h.idJoueur === idJoueurCourant() || modeDev();
    const connues = typeof window.caracsConnuesPourTalents !== "function" || window.caracsConnuesPourTalents(h);
    const lignes = window.LIGNES_TALENTS.filter(l => LIGNES_PAR_PAGE[cote].includes(l.cle)).map(ligne => {
        const talents = window.TALENTS.filter(t => t.carac === ligne.cle);
        const prisLigne = talents.reduce((s, t) => s + (pris[t.id] || 0), 0);
        const total = talents.reduce((s, t) => s + (t.aVenir ? 0 : t.max), 0);
        const valeur = ligne.cle && connues && typeof window.caracPourTalents === "function" ? window.caracPourTalents(h, ligne.cle) : null;
        const etiquettes = talents.map(t => {
            const e = window.etatTalent(h, t.id);
            const rangs = e.rangs || 0;
            const classes = ["talent-livre"];
            if (rangs > 0) classes.push("pris");
            if (e.complet) classes.push("complet");
            if (e.ok && moi) classes.push("prenable");
            if (e.verrou) classes.push("verrou");
            if (e.aVenir) classes.push("a-venir");
            // (v315, Nico : « on doit voir sans cliquer ce que fait le talent ») :
            // l'effet est écrit à côté du nom — pour ce héros s'il l'a pris, la
            // règle sinon ; l'appui long garde le détail complet.
            let effet = t.texte;
            if (rangs > 0 && typeof window.resumeTalent === "function") { try { effet = window.resumeTalent(h, t.id) || t.texte; } catch (er) {} }
            const texte = [effet, rangs > 0 && t.texte !== effet ? t.texte : "",
                e.verrou || e.aVenir ? e.raison : (e.ok && moi ? "Touche pour le prendre." : "")].filter(Boolean).join("\n\n");
            const r = hasard("talent-" + t.id + h.idPersonnage);
            return `<button type="button" class="${classes.join(" ")}" data-action="fiches" data-fa="talent" data-id="${t.id}" style="--penche:${((r() * 2 - 1) * 1.2).toFixed(2)}deg"
                      ${aide(t.nom + (t.max > 1 ? ` (${rangs}/${t.max})` : ""), texte)}>
                <span class="coche-talent">${rangs > 0 ? "✔" : e.verrou ? "🔒" : "○"}</span>
                <span class="tete-talent-livre"><span class="nom-talent-livre">${echapper(t.nom)}</span>
                  <small class="exigence-talent">${e.aVenir ? "à venir" : echapper(window.libelleExigenceTalent(t))}${t.max > 1 ? ` · <b class="rangs-talent">${rangs}/${t.max}</b>` : ""}</small></span>
                <span class="effet-talent-livre">${e.aVenir ? "<i>Pas encore écrit.</i>" : echapper(effet)}</span>
              </button>`;
        }).join("");
        return `<section class="ligne-talents-livre" data-ligne="${ligne.icone}">
            <div class="tete-ligne-talents">${typeof window.medaillonTalent === "function" ? window.medaillonTalent(ligne.icone, 40) : ""}
              <span class="nom-ligne-talents">${echapper(ligne.nom)}</span>
              ${valeur !== null ? `<span class="valeur-ligne-talents">${ligne.court} ${valeur}</span>` : ""}
              <span class="compte-ligne-talents">${prisLigne}/${total}</span></div>
            <div class="etiquettes-talents">${etiquettes}</div>
          </section>`;
    }).join("");
    const entete = cote === "tal-g"
        ? `<div class="entete-fiche"><span class="titre-page-fiche">Talents</span>
             <span class="points-talents${dispo > 0 ? " a-placer" : ""}" ${aide("Points de talent", "Un point par niveau. Un talent pris ne se retire pas.")}>${dispo > 0 ? `✦ <b>${dispo}</b> à choisir` : "Aucun point à placer"}</span></div>`
        : "";
    const pied = cote === "tal2-d" ? `<p class="legende-talents"><span>✔</span> pris · <span class="or">○</span> cerclé d'or : à prendre (un toucher) · <span>🔒</span> la carac manque<br>Un appui long : le détail du talent.</p>
          <button type="button" class="lien-fiche retour-fiche" data-action="fiches" data-fa="retour-fiche">‹ La fiche</button>` : "";
    return `<div class="contenu-page page-talents">${entete}${lignes}${pied}</div>`;
}

function htmlBlessures(h) {
    if (typeof window.blessuresDuPerso !== "function") return "";
    const liste = window.blessuresDuPerso(h);
    const mort = typeof window.estMortDefinitivement === "function" && window.estMortDefinitivement(h);
    const lignes = liste.map(inst => {
        const b = window.blessureParId(inst.id) || { nom: inst.id, texte: "" };
        const reste = typeof window.resteBlessure === "function" ? window.resteBlessure(inst) : "";
        return `<li class="blessure-fiche" ${aide(b.nom, (b.texte || "") + (reste ? `\n\nReste : ${reste}` : ""))}>✗ ${echapper(b.nom)}${reste ? ` <small>${echapper(reste)}</small>` : ""}</li>`;
    }).join("");
    return `<div class="encart-fiche encart-blessures-fiche">${lavis("sang", "blessures-" + h.idPersonnage)}${cadre("blessures-" + h.idPersonnage)}
        <div class="titre-encart">Blessures</div>
        ${mort ? `<p class="mort-fiche">✝ ${echapper(nomHeros(h))} a succombé à ses blessures.</p>` : ""}
        ${lignes ? `<ul class="liste-blessures">${lignes}</ul>` : (mort ? "" : `<p class="fiche-attente">Aucune blessure.</p>`)}
      </div>`;
}

function htmlFicheDroite(h) {
    const xp = typeof window.xpDuPerso === "function" ? window.xpDuPerso(h) : (h.xp || 0);
    const p = typeof window.progressionXP === "function" ? window.progressionXP(xp) : { niveau: 1, pct: 0 };
    const niveau = p.niveau || 1;
    const pct = p.pct !== undefined ? p.pct / 100 : (p.suivant > p.debut ? (xp - p.debut) / (p.suivant - p.debut) : 0);
    const val = (f, d) => (typeof window[f] === "function" ? window[f](h) : d);
    const ligne = (nom, valeur, texte) => `<div class="ligne-defense" ${aide(nom, texte)}><span>${nom}</span><b>${valeur}</b></div>`;
    return `<div class="contenu-page page-fiche-droite">
        <div class="encart-fiche encart-niveau">${cadre("niveau-" + h.idPersonnage)}
          <div class="niveau-fiche">Niveau <b>${niveau}</b></div>
          <div class="jauge-niveau" data-pct="${Math.round(Math.max(0, Math.min(1, pct)) * 100)}">${jaugeCrayon(pct, h.idPersonnage + "-" + niveau)}</div>
        </div>
        <div class="encart-fiche encart-identite">${lavis("beige", "identite-" + h.idPersonnage)}${cadre("identite-" + h.idPersonnage)}
          <span class="morceau-identite" ${aide(h.race || "Race", descriptionRace(h))}><small>Race</small> ${echapper(h.race || "—")}</span>
          <span class="morceau-identite" ${aide(classeDe(h) || "Classe", descriptionClasse(h))}><small>Classe</small> ${echapper(classeDe(h) || "—")}</span>
        </div>
        ${htmlCaracs(h)}
        <div class="rangee-vitale">
          <div class="vital-fiche" ${aide("Points de vie", "Ce que le héros encaisse avant de tomber. La Constitution les fait monter.")}>${lavis("rouge", "pv-" + h.idPersonnage)}${cadre("pv-" + h.idPersonnage)}<b>${val("pvMaxCombattant", h.PV_Max || 0)}</b><span>Points de vie</span></div>
          <div class="vital-fiche" ${aide("Fatigue max", "L'énergie du héros : chaque technique en coûte.")}>${lavis("jaune", "fat-" + h.idPersonnage)}${cadre("fat-" + h.idPersonnage)}<b>${val("fatigueMaxCombattant", 100)}</b><span>Fatigue max</span></div>
          <div class="vital-fiche" ${aide("Régénération", "La part d'énergie rendue à chaque tour.")}>${lavis("vert", "reg-" + h.idPersonnage)}${cadre("reg-" + h.idPersonnage)}<b>${val("regenerationCombattant", 0)} %</b><span>Régén.</span></div>
        </div>
        ${htmlTalents(h)}
        <div class="rangee-defenses">
          <div class="encart-fiche encart-defense">${cadre("reflexes-" + h.idPersonnage)}
            <div class="titre-encart">Réflexes</div>
            ${ligne("Esquive", val("esquiveCombattant", 0) + " %", "La chance d'éviter un coup.")}
            ${ligne("Parade", val("paradeCombattant", 0) + " %", "La chance de parer une attaque.")}
            ${ligne("Critique", val("critiqueCombattant", 0) + " %", "La chance de doubler les dégâts.")}
          </div>
          <div class="encart-fiche encart-defense">${cadre("resist-" + h.idPersonnage)}
            <div class="titre-encart">Résistances</div>
            ${ligne("Physique", val("defPhysiqueCombattant", 0) + " %", "Réduit les coups physiques.")}
            ${ligne("Magique", val("defMagiqueCombattant", 0) + " %", "Réduit les sorts.")}
          </div>
        </div>
        ${htmlBlessures(h)}
      </div>`;
}

// ---------------------------------------------------------------------
//  LES COMPÉTENCES (double page 2)
// ---------------------------------------------------------------------
function competencesDe(id) {
    const brut = ((window.CACHE_COMPETENCES_GLOBAL || {})[id]) || {};
    return Object.keys(brut).map(k => ({ id: k, data: brut[k] || {} }))
        .sort((a, b) => (b.data.Initiative || 0) - (a.data.Initiative || 0));
}
function deckDe(h) {
    if (window.ID_PERSONNAGE_DECK === h.idPersonnage && Array.isArray(window.CARTES_SELECTIONNEES)) return window.CARTES_SELECTIONNEES;
    return h.deckEquipe || [];
}
function etatCompetences(h) {
    const comps = competencesDe(h.idPersonnage);
    const max = typeof window.competencesMaxCombattant === "function" ? window.competencesMaxCombattant(h) : 6;
    const niveau = typeof window.niveauDepuisXP === "function" ? window.niveauDepuisXP(window.xpDuPerso(h)) : 1;
    const bonus = typeof window.competencesDeNiveau === "function" ? window.competencesDeNiveau(niveau) : 0;
    const bloquees = new Map((typeof window.competencesBloqueesParArme === "function" ? window.competencesBloqueesParArme(h) : []).map(c => [c.id, c.raison]));
    return { comps, max, restantes: Math.max(0, max + bonus - comps.length), bloquees, deck: deckDe(h) };
}
function banniere(id, titre, initiative, options) {
    const o = options || {};
    const classes = ["banniere-livre", o.memorisee ? "memorisee" : "", o.bloquee ? "bloquee" : "", o.verrouillee ? "verrouillee" : "", carteOuverte === id ? "ouverte" : ""].filter(Boolean).join(" ");
    return `<div class="rang-banniere">
        <button type="button" class="${classes}" data-action="fiches" data-fa="carte" data-id="${echapper(id)}"${o.raison ? ` title="${echapper(o.raison)}"` : ""}>
          ${dessinBanniere(id)}
          <span class="init-banniere">${echapper(initiative)}</span>
          <span class="titre-banniere">${echapper(titre)}</span>
          ${o.memorisee ? `<span class="sceau-memoire" aria-label="Mémorisée"></span>` : ""}
        </button>
        ${o.effacer ? `<button type="button" class="effacer-banniere" data-action="fiches" data-fa="effacer" data-id="${echapper(id)}" title="Effacer définitivement (DEV)">✕</button>` : ""}
      </div>`;
}
function htmlCompetencesGauche(h) {
    const e = etatCompetences(h);
    const moi = !h.idJoueur || h.idJoueur === idJoueurCourant() || modeDev();
    const bannieres = e.comps.map(c => banniere(c.id, c.data.Nom || "Technique inconnue", c.data.Initiative || 0, {
        memorisee: e.deck.includes(c.id), bloquee: e.bloquees.has(c.id), raison: e.bloquees.get(c.id), effacer: modeDev()
    })).join("");
    let classe = "";
    if (typeof window.toutesTechniquesDeClasse === "function") {
        const toutes = window.toutesTechniquesDeClasse(h), acquises = window.techniquesDeClasse(h);
        if (toutes.length && e.comps.length) {
            classe = `<div class="separation-classe"><span>Techniques de classe</span></div>`
                + toutes.map(({ id, niveau }) => {
                    const t = (window.TECHNIQUES_CLASSE || {})[id] || {};
                    const ok = acquises.includes(id);
                    return banniere(id, t.Nom || id, t.Initiative || 0, { verrouillee: !ok, raison: ok ? "Une fois par combat" : `Niveau ${niveau} requis` });
                }).join("");
        }
    }
    return `<div class="contenu-page page-competences">
        <div class="entete-fiche"><span class="titre-page-fiche">Compétences</span>
          <span class="compte-memoire" ${aide("Mémorisées", "Les compétences que le héros emporte au combat. Touche une bannière pour voir sa carte ; touche-la encore (ou « Mémoriser ») pour l'emporter ou la laisser.")}>Mémorisées <b>${e.deck.length}</b> / ${e.max}</span></div>
        <div class="liste-bannieres">${bannieres || `<p class="fiche-attente">Le héros n'a pas encore forgé ses techniques de combat.</p>`}${classe}</div>
        ${moi ? `<button type="button" class="lien-fiche bouton-forger${e.restantes > 0 ? "" : " eteint"}" data-action="fiches" data-fa="forger">⚒ Forger une compétence <small>(${e.restantes} à créer)</small></button>` : ""}
      </div>`;
}
// LA CARTE DE LA COMPÉTENCE, à l'encre, moins haute qu'avant : il n'y a plus
// d'image (Nico).
function lignesEffets(data, porteur) {
    const nomActuel = (t) => typeof window.nomEffetActuel === "function" ? window.nomEffetActuel(t) : t;
    const porteeVraie = typeof window.distanceAAfficher === "function" ? window.distanceAAfficher(data, porteur) : null;
    const reecrire = (t) => (porteeVraie && typeof window.texteDistanceReelle === "function" && /Distance/.test(t || "")) ? window.texteDistanceReelle(t, porteeVraie) : t;
    let html = "";
    let aDistance = false;
    (data.Effets_Compiles || []).forEach(eff => {
        if (typeof eff === "string") {
            eff = nomActuel(eff);
            if (/Initiative \+|Zone/.test(eff)) return;
            if (/Distance/.test(eff)) aDistance = true;
            const sous = eff.startsWith("  ↳");
            html += `<li class="${sous ? "sous-effet" : "effet"}">${echapper(reecrire(eff.replace(/^\s*↳\s*/, "")))}</li>`;
        } else if (eff && !eff.isZone && eff.nom !== "Initiative +") {
            const nom = nomActuel(eff.nom);
            if (/Distance/.test(nom || "")) aDistance = true;
            html += `<li class="${eff.isMod ? "sous-effet" : "effet"}"><b>${echapper(nom)}</b>${eff.desc ? ` — <span>${echapper(reecrire(eff.desc))}</span>` : ""}</li>`;
        }
    });
    if (porteeVraie && !aDistance && typeof window.gabaritTexteDistance === "function") {
        html = `<li class="effet"><b>Distance</b> — <span>${echapper(reecrire(window.gabaritTexteDistance()))}</span></li>` + html;
    }
    return html;
}
// LE CORPS DE LA CARTE, partagé par la carte de la fiche et l'aperçu de la
// Forge (v316) : l'en-tête, l'arme, la distance, la zone et les effets — avec
// le détail des pourcentages (« pour informatif », Nico), que l'encart du
// combat, lui, ne dit pas.
function corpsDeCarte(data, h, graine) {
    const fatigue = typeof window.coutFatigueCarte === "function" ? window.coutFatigueCarte(data, h) : (data.Fatigue || 0);
    const arme = typeof window.libelleArmeCarte === "function" ? window.libelleArmeCarte(data.Arme) : "";
    const puissance = typeof window.fatigueDeSurpuissance === "function" ? window.fatigueDeSurpuissance(data, h) : (Number(data.Fatigue) || fatigue);
    const surpuissance = typeof window.texteSurpuissance === "function" ? window.texteSurpuissance(puissance) : "";
    // LES SYMBOLES DU COMBAT (v315, Nico : « les mêmes symboles qu'en mode
    // combat, dans le visuel qui lance l'attaque ») : les montants de l'encart
    // (ligneEffetsCarte, combat.js : l'explosion, la baguette, la tête qui
    // ondule, la croix des soins, le chiffre vrai), la petite cible de la
    // distance et la zone en hexagones — repeints à l'encre pour le papier.
    const sym = window.SYMBOLES_ENCART || {};
    const distance = typeof window.distanceEncartCarte === "function" ? window.distanceEncartCarte(data, h) : null;
    const zone = typeof window.dessinZoneCarte === "function" ? window.dessinZoneCarte(data, "#7a5634", 12) : "";
    let effets = null;
    if (typeof window.ligneEffetsCarte === "function") {
        try { effets = window.ligneEffetsCarte(data, h, { pourcentages: true }); } catch (e) { console.warn("Le livre : les effets de la carte", e); }
    }
    const corps = effets !== null
        ? `<div class="carte-effets carte-effets-encart">${effets}</div>`
        : `<ul class="carte-effets">${lignesEffets(data, h)}</ul>`;
    const noteSurpuissance = surpuissance && !(effets && effets.includes("encart-surpuissance"));
    return `${lavis("gris", graine, { deborde: true })}
        ${cadre(graine, 1.2)}${cadre(graine + "-2", 2.2)}
        <div class="carte-entete">
          <span class="carte-init" ${aide("Initiative", "Plus elle est haute, plus la technique part tôt dans le tour.")}>${echapper(data.Initiative || 0)}</span>
          <span class="carte-titre">${echapper(data.Nom || "Technique")}</span>
          <span class="carte-fatigue" ${aide("Fatigue", "L'énergie que coûte la technique.")}>⚡ ${echapper(fatigue)}</span>
        </div>
        ${arme || (distance && distance.portee) ? `<div class="carte-sous-titre">
          ${arme ? `<span class="carte-arme">${arme}</span>` : "<span></span>"}
          ${distance && distance.portee ? `<span class="carte-distance" ${aide("Distance", `La technique porte à ${distance.portee} cases.`)}>${sym.cible || "◎"}<b>${echapper(distance.portee)}</b></span>` : ""}
        </div>` : ""}
        <svg class="fleuron fleuron-carte" viewBox="0 0 200 24" aria-hidden="true"><path d="M 8 12 C 40 4 70 4 92 12 M 108 12 C 130 4 160 4 192 12 M 92 12 C 96 6 104 6 108 12 C 104 18 96 18 92 12 Z"/><circle cx="100" cy="12" r="2.2"/></svg>
        <div class="carte-corps${zone ? " avec-zone" : ""}">
          ${zone ? `<div class="carte-zone" ${aide("Zone", "Les cases touchées autour du point visé (la case grise : le lanceur).")}>${zone}</div>` : ""}
          ${corps}
        </div>
        ${noteSurpuissance ? `<p class="carte-note surpuissance">Surpuissance ${echapper(surpuissance)}</p>` : ""}`;
}
function htmlCarte(h, id) {
    let data = ((window.CACHE_COMPETENCES_GLOBAL || {})[h.idPersonnage] || {})[id];
    const technique = !data && typeof window.carteTechniqueClasse === "function" ? window.carteTechniqueClasse(id) : null;
    data = data || technique;
    if (!data) return "";
    const e = etatCompetences(h);
    const memorisee = e.deck.includes(id), bloquee = e.bloquees.get(id);
    const moi = !h.idJoueur || h.idJoueur === idJoueurCourant() || modeDev();
    return `<div class="carte-encre" data-carte="${echapper(id)}">
        ${corpsDeCarte(data, h, "carte-" + id)}
        ${technique ? `<p class="carte-note">Technique de classe : une fois par combat, hors mémoire.</p>`
          : (moi ? `<button type="button" class="lien-fiche bouton-memoriser" data-action="fiches" data-fa="memoriser" data-id="${echapper(id)}">${memorisee ? "Oublier pour le combat" : "Mémoriser pour le combat"}</button>` : "")}
        ${bloquee ? `<p class="carte-note bloquee">${echapper(bloquee)}</p>` : ""}
      </div>`;
}
// L'APERÇU DANS LA FORGE (v316) : la technique en cours, écrite comme sa carte
// le sera dans la fiche — symboles, zone et pourcentages —, sous l'enclume, à
// chaque retouche.
function majApercuForge() {
    if (!forgeDansLeLivre) return;
    const ici = document.getElementById("forge-livre-apercu");
    if (!ici) return;
    const h = herosParId(heros);
    let data = null;
    try { data = typeof window.carteEnCoursDeForge === "function" ? window.carteEnCoursDeForge() : null; } catch (e) { console.warn("Le livre : l'aperçu de la Forge", e); }
    if (!data || !h) { ici.innerHTML = `<p class="fiche-attente">L'encart de la technique s'écrira ici, effet après effet.</p>`; return; }
    const sig = JSON.stringify(data);
    if (sig === majApercuForge.sig && ici.querySelector(".carte-encre")) return;
    majApercuForge.sig = sig;
    ici.innerHTML = `<div class="titre-apercu-forge">L'encart</div><div class="carte-encre deja-ecrite apercu-forge">${corpsDeCarte(data, h, "forge-apercu")}</div>`;
}
function htmlCompetencesDroite(h) {
    const carte = carteOuverte ? htmlCarte(h, carteOuverte) : "";
    return `<div class="contenu-page page-carte-competence">${carte
        || `<p class="fiche-attente invite-carte">Touche une bannière : sa carte s'écrira ici.</p>`}</div>`;
}

// ---------------------------------------------------------------------
//  LA FORGE (double page 3) : la Forge de competences.js, rangée dans le
//  livre le temps d'une création. À gauche la technique (ses chiffres, son
//  nom, ses actions), à droite le codex des effets, toujours ouvert.
// ---------------------------------------------------------------------
let forgeDansLeLivre = false;
const ranges = new Map();     // élément → { parent, suivant } d'origine
function ranger(el, dans) {
    if (!el || !dans) return;
    if (!ranges.has(el)) ranges.set(el, { parent: el.parentNode, suivant: el.nextSibling });
    dans.appendChild(el);
}
function remettre(el) {
    const o = ranges.get(el);
    if (!el || !o || !o.parent) return;
    const suivant = o.suivant && o.suivant.parentNode === o.parent ? o.suivant : null;
    o.parent.insertBefore(el, suivant);
    ranges.delete(el);
}
const ARMES_FORGE = [
    ["Arme légère CAC", "Arme légère"], ["Arme lourde CAC", "Arme lourde"], ["Arme polyvalente", "Arme polyvalente"],
    ["Arme légère Distance", "Arme à distance"], ["Magie", "Magie"], ["Sans arme / Arme rp", "Sans arme"]
];
function htmlForgeVide() {
    return [`<div class="contenu-page page-forge"><div class="entete-fiche"><span class="titre-page-fiche">La Forge</span></div>
              <p class="fiche-attente">Depuis les compétences, « Forger une compétence » ouvre ici l'enclume.</p></div>`,
            `<div class="contenu-page page-forge page-codex"><div class="entete-fiche"><span class="titre-page-fiche">Le codex</span></div>
              <p class="fiche-attente">Les effets s'écriront ici, avec ce qu'ils font.</p></div>`];
}
function preparerPagesForge() {
    const g = pagesFiche["forge-g"], d = pagesFiche["forge-d"];
    if (!g || !d) return;
    if (!forgeDansLeLivre) { const [a, b] = htmlForgeVide(); g.innerHTML = a; d.innerHTML = b; return; }
}
async function ouvrirForge() {
    const h = herosParId(heros);
    if (!h) return;
    const e = etatCompetences(h);
    if (e.restantes <= 0) { noter(pagesFiche["comp-g"], "Plus de compétence à créer pour l'instant : le niveau en apportera d'autres."); return; }
    if (typeof window.ouvrirCreationCompetence !== "function") return;
    const champ = document.getElementById("champ-id-personnage");
    if (champ) champ.value = h.idPersonnage;
    const g = pagesFiche["forge-g"], d = pagesFiche["forge-d"];
    g.innerHTML = `<div class="contenu-page page-forge defile-fiche"><div class="entete-fiche"><span class="titre-page-fiche">La Forge</span>
        <button type="button" class="lien-fiche fermer-forge" data-action="fiches" data-fa="fermer-forge">Refermer</button></div>
        <div class="forge-dans-livre" id="forge-livre-gauche"></div>
        <div class="apercu-forge-livre" id="forge-livre-apercu"></div></div>`;
    d.innerHTML = `<div class="contenu-page page-forge page-codex"><div class="entete-fiche"><span class="titre-page-fiche">Le codex</span>
        <span class="compte-tags" id="forge-livre-tags"></span></div>
        <div class="codex-armes" id="forge-livre-armes">
          <p class="fiche-attente">D'abord, l'arme de la technique :</p>
          ${ARMES_FORGE.map(([v, t]) => `<button type="button" class="lien-fiche arme-forge" data-action="fiches" data-fa="arme" data-arme="${echapper(v)}">${t}</button>`).join("")}
        </div>
        <div class="defile-fiche codex-liste" id="forge-livre-codex"></div></div>`;
    const modale = document.getElementById("modale-creation-competence");
    const gauche = g.querySelector("#forge-livre-gauche");
    forgeDansLeLivre = true;
    if (modale) [...modale.children].forEach(el => ranger(el, gauche));
    const menu = document.getElementById("forge-menu-caracs");
    ranger(menu, d.querySelector("#forge-livre-codex"));
    document.body.classList.add("forge-livre");
    // v318 — Nico : « une couleur aquarelle dans ses bulles, quelque chose de
    // léger » : un lavis sous le cap, la fatigue, l'initiative et l'aide.
    [[".forge-cap", "beige"], [".forge-medaillon-fatigue", "jaune"], [".forge-medaillon-initiative", "bleu"], [".forge-btn-aide", "vert"]].forEach(([sel, teinte]) => {
        const el = gauche.querySelector(sel);
        if (el && !el.querySelector(":scope > .lavis-bulle")) el.insertAdjacentHTML("afterbegin", lavis(teinte, "forge-" + teinte).replace('class="lavis ', 'class="lavis lavis-bulle '));
    });
    aller(g);
    try { await window.ouvrirCreationCompetence(); } catch (err) { console.error("Le livre : la Forge", err); }
    cacherModalesForge();
    majCodex();
    majApercuForge();
}
function cacherModalesForge() {
    ["modale-creation-competence", "modale-menu-ajout", "overlay-jeu-modale"].forEach(id => {
        const el = document.getElementById(id);
        if (el && forgeDansLeLivre) el.style.display = "none";
    });
}
function majCodex() {
    if (!forgeDansLeLivre) return;
    const arme = window.forgeState && window.forgeState.armePrincipale;
    const armes = document.getElementById("forge-livre-armes");
    if (armes) armes.hidden = !!arme;
    if (arme && typeof window.ouvrirMenuAjoutForge === "function") {
        majCodex.encours = true;
        try { window.ouvrirMenuAjoutForge(); } catch (e) { console.error("Le livre : le codex", e); }
        majCodex.encours = false;
    }
    const tags = document.getElementById("forge-tags-count"), ici = document.getElementById("forge-livre-tags");
    if (ici) ici.textContent = arme ? (tags ? tags.textContent : "") : "";
    cacherModalesForge();
}
function fermerForge(versCompetences) {
    if (!forgeDansLeLivre) return;
    majApercuForge.sig = "";
    forgeDansLeLivre = false;
    document.body.classList.remove("forge-livre");
    [...ranges.keys()].filter(el => el.closest && el.closest(".page-forge")).forEach(remettre);
    preparerPagesForge();
    majPlus(true);
    if (versCompetences) aller(pagesFiche["comp-g"]);
}
// Les fonctions de la Forge, tant qu'elle est dans le livre.
function brancherForge() {
    if (brancherForge.fait) return;
    const fermer = window.fermerForgeCompetence, ajout = window.ouvrirMenuAjoutForge, rafraichir = window.rafraichirForge, armeMenu = window.ouvrirMenuArme;
    if (typeof fermer !== "function" || typeof ajout !== "function") return;
    brancherForge.fait = true;
    window.fermerForgeCompetence = function () {
        const r = fermer.apply(this, arguments);
        if (forgeDansLeLivre) fermerForge(true);
        return r;
    };
    window.ouvrirMenuAjoutForge = function () {
        const r = ajout.apply(this, arguments);
        if (forgeDansLeLivre) { cacherModalesForge(); const m = document.getElementById("modale-menu-arme"); if (m && !window.forgeState.armePrincipale) m.style.display = "none"; }
        return r;
    };
    if (typeof rafraichir === "function") window.rafraichirForge = function () {
        try { return rafraichir.apply(this, arguments); }
        finally { if (forgeDansLeLivre && !majCodex.encours) setTimeout(() => { majCodex(); majApercuForge(); }, 0); }
    };
    if (typeof armeMenu === "function") window.ouvrirMenuArme = function () {
        if (forgeDansLeLivre) { const a = document.getElementById("forge-livre-armes"); if (a) { a.hidden = false; a.classList.remove("appelle"); void a.offsetWidth; a.classList.add("appelle"); } return; }
        return armeMenu.apply(this, arguments);
    };
}

// ---------------------------------------------------------------------
//  L'INVENTAIRE (double page 4)
// ---------------------------------------------------------------------
function richesse(h) {
    const laiton = h.piecesLaiton !== undefined && h.piecesLaiton !== null ? h.piecesLaiton : (parseInt(h.or) || 0);
    return { laiton: Math.max(0, parseInt(laiton) || 0), bronze: Math.max(0, parseInt(h.piecesBronze) || 0) };
}
function htmlObjet(h, cle, titre, objet, actions) {
    const rempli = !!(objet && objet.nom);
    let alerte = "";
    if (rempli && objet.prerequis > 0 && typeof window.peutEquiper === "function" && cle !== "stock") {
        const t = window.peutEquiper(h.idPersonnage, objet);
        if (!t.possible) alerte = `⚠ ${window.texteCaracsObjet ? window.texteCaracsObjet(objet) : ""} ${objet.prerequis} requis (tu as ${t.valeur})`;
    }
    if (rempli && !alerte && cle !== "stock" && typeof window.raisonObjetInterditParBlessure === "function") {
        const cote = { armure: "armure", droite: "droite", gauche: "gauche" }[cle];
        const raison = cote ? window.raisonObjetInterditParBlessure(h, objet, cote) : null;
        if (raison) alerte = `⚠ Inutilisable — ${raison}`;
    }
    const etiquette = rempli && typeof window.etiquetteObjetHTML === "function" ? window.etiquetteObjetHTML(objet) : "";
    const icone = rempli && typeof window.iconeParEmplacement === "function" ? window.iconeParEmplacement(objet) : ({ armure: "🛡️", droite: "⚔️", gauche: "🗡️", stock: "🎒" }[cle]);
    return `<div class="encart-fiche encart-objet objet-${cle}${rempli ? "" : " vide"}">${cadre("objet-" + cle + "-" + h.idPersonnage)}
        <div class="titre-encart">${titre}</div>
        <div class="objet-corps">
          <div class="objet-image">${rempli && objet.image ? `<img src="${echapper(objet.image)}" alt="" draggable="false">` : `<span class="objet-icone">${icone}</span>`}</div>
          <div class="objet-texte">
            <div class="objet-nom">${rempli ? echapper(objet.nom) : (cle === "stock" ? "Rien de rangé" : "Emplacement vide")}</div>
            ${etiquette ? `<div class="objet-rarete" style="color:${(window.COULEUR_RARETE || {})[objet.rarete] || "#5c3a21"}">${etiquette}</div>` : ""}
            ${rempli && objet.effetTexte ? `<div class="objet-effet">${echapper(objet.effetTexte)}</div>` : ""}
            ${alerte ? `<div class="objet-alerte">${echapper(alerte)}</div>` : ""}
          </div>
        </div>
        ${actions ? `<div class="objet-actions">${actions}</div>` : ""}
      </div>`;
}
const bouton = (fa, texte, extra) => `<button type="button" class="lien-fiche" data-action="fiches" data-fa="${fa}"${extra || ""}>${texte}</button>`;
function htmlInventaireGauche(h) {
    const r = richesse(h);
    const moi = !h.idJoueur || h.idJoueur === idJoueurCourant() || modeDev();
    const champ = (metal, v) => moi
        ? `<input type="number" class="saisie-pieces" min="0" step="1" inputmode="numeric" value="${v}" data-metal="${metal}" aria-label="Pièces de ${metal}">`
        : `<b>${v}</b>`;
    return `<div class="contenu-page page-inventaire">
        <div class="entete-fiche"><span class="titre-page-fiche">Inventaire</span></div>
        <div class="encart-fiche encart-richesse">${cadre("richesse-" + h.idPersonnage)}
          <div class="titre-encart" ${aide("Richesse", `${BRONZES_PAR_LAITON} pièces de bronze valent 1 pièce de laiton.`)}>Richesse</div>
          <div class="rangee-pieces">
            <label class="tas-pieces">${piece("laiton")}${champ("laiton", r.laiton)}<span>laiton</span></label>
            <label class="tas-pieces">${piece("bronze")}${champ("bronze", r.bronze)}<span>bronze</span></label>
          </div>
        </div>
        ${htmlObjet(h, "armure", "Armure", h.equipArmure, moi && h.equipArmure ? bouton("lacher", "Lâcher", ` data-champ="Equip_Armure"`) : "")}
      </div>`;
}
function htmlInventaireDroite(h) {
    const moi = !h.idJoueur || h.idJoueur === idJoueurCourant() || modeDev();
    const stock = h.equipStock || null;
    const mains = (cle, champ, objet) => {
        if (!moi || !objet) return "";
        const deux = objet.deuxMains && cle === "gauche";
        return (stock || deux ? "" : bouton("ranger", "Ranger", ` data-champ="${champ}"`)) + bouton("lacher", "Lâcher", ` data-champ="${champ}"`);
    };
    const actionsStock = moi && stock ? bouton("prendre", "Prendre en main") + bouton("lacher-stock", "Lâcher") : "";
    return `<div class="contenu-page page-inventaire droite">
        ${htmlObjet(h, "droite", "Main droite", h.equipMainDroite, mains("droite", "Equip_Main_Droite", h.equipMainDroite))}
        ${htmlObjet(h, "gauche", "Main gauche", h.equipMainGauche && h.equipMainGauche.deuxMains && h.equipMainDroite === h.equipMainGauche ? null : h.equipMainGauche, mains("gauche", "Equip_Main_Gauche", h.equipMainGauche))}
        ${htmlObjet(h, "stock", "Stockage", stock, actionsStock)}
        ${modeDev() ? `<button type="button" class="lien-dev" data-action="fiches" data-fa="dev">Dev</button>` : ""}
      </div>`;
}
async function ecrire(h, maj) {
    const enRam = (window.PERSOS_PARTIE || []).find(p => p.idPersonnage === h.idPersonnage);
    const enRam2 = (window.PERSOS_JOUEURS_PARTIE || []).find(p => p.idPersonnage === h.idPersonnage);
    try { await updateDoc(doc(db, "Personnages", h.idPersonnage), maj); }
    catch (e) { console.error("Le livre : l'inventaire", e); return false; }
    if (typeof window.appliquerEquipementEnRam === "function") window.appliquerEquipementEnRam(h.idPersonnage, maj);
    [enRam, enRam2].forEach(p => {
        if (!p) return;
        if ("Equip_Stock" in maj) p.equipStock = maj.Equip_Stock;
        if ("Pieces_Laiton" in maj) p.piecesLaiton = maj.Pieces_Laiton;
        if ("Pieces_Bronze" in maj) p.piecesBronze = maj.Pieces_Bronze;
    });
    if (typeof window.rafraichirCompetencesSiOuvertes === "function") window.rafraichirCompetencesSiOuvertes(h.idPersonnage);
    majPlus(true);
    return true;
}
// RANGER une arme tenue (et ses deux mains, si elle les prend) ; la PRENDRE
// en main depuis le stockage : la main droite d'abord, sinon la gauche.
async function rangerArme(champ) {
    const h = herosParId(heros);
    if (!h || h.equipStock) return;
    const objet = champ === "Equip_Main_Droite" ? h.equipMainDroite : h.equipMainGauche;
    if (!objet) return;
    son();
    const maj = { Equip_Stock: objet, [champ]: null };
    if (objet.deuxMains) { maj.Equip_Main_Droite = null; maj.Equip_Main_Gauche = null; }
    await ecrire(h, maj);
}
async function prendreArme() {
    const h = herosParId(heros);
    const objet = h && h.equipStock;
    if (!objet) return;
    son();
    let maj = null;
    if (objet.deuxMains) {
        if (h.equipMainDroite || h.equipMainGauche) { noter(pagesFiche["inv-d"], "Il faut les deux mains libres pour cette arme."); return; }
        maj = { Equip_Main_Droite: objet, Equip_Main_Gauche: objet };
    } else if (!h.equipMainDroite) maj = { Equip_Main_Droite: objet };
    else if (!h.equipMainGauche) maj = { Equip_Main_Gauche: objet };
    else { noter(pagesFiche["inv-d"], "Les deux mains sont prises : range ou lâche d'abord une arme."); return; }
    if (typeof window.peutEquiper === "function") {
        const t = window.peutEquiper(h.idPersonnage, objet);
        if (!t.possible) noter(pagesFiche["inv-d"], `Trop lourde pour l'instant : ${objet.prerequis} requis (tu as ${t.valeur}). Tenue quand même, elle ne donnera rien.`);
    }
    maj.Equip_Stock = null;
    await ecrire(h, maj);
}
async function changerPieces(metal, valeur) {
    const h = herosParId(heros);
    if (!h) return;
    let v = parseInt(valeur);
    if (isNaN(v) || v < 0) v = 0;
    const r = richesse(h);
    const maj = { Pieces_Laiton: metal === "laiton" ? v : r.laiton, Pieces_Bronze: metal === "bronze" ? v : r.bronze };
    // Les bronzes au-delà de 30 se changent en laiton.
    if (maj.Pieces_Bronze >= BRONZES_PAR_LAITON) {
        maj.Pieces_Laiton += Math.floor(maj.Pieces_Bronze / BRONZES_PAR_LAITON);
        maj.Pieces_Bronze %= BRONZES_PAR_LAITON;
    }
    maj.Or = maj.Pieces_Laiton;            // l'ancien champ suit (l'ancienne fiche le lit)
    son();
    await ecrire(h, maj);
}

// ---------------------------------------------------------------------
//  LE PANNEAU DEV (double page à part)
// ---------------------------------------------------------------------
let devDansLeLivre = false;
function rangerDev() {
    const onglet = document.getElementById("onglet-dev");
    const g = pagesFiche["dev-g"], d = pagesFiche["dev-d"];
    if (!onglet || !g || !d) return;
    if (!g.querySelector(".contenu-dev")) {
        g.innerHTML = `<div class="contenu-page page-dev defile-fiche"><div class="entete-fiche"><span class="titre-page-fiche">Dev</span>
            <button type="button" class="lien-fiche" data-action="fiches" data-fa="retour-inventaire">← Inventaire</button></div><div class="contenu-dev" id="dev-livre-gauche"></div></div>`;
        d.innerHTML = `<div class="contenu-page page-dev defile-fiche"><div class="contenu-dev" id="dev-livre-droite"></div></div>`;
    }
    if (devDansLeLivre) return;
    const blocs = [...onglet.children];
    const moitie = Math.ceil(blocs.length / 2);
    blocs.forEach((el, i) => ranger(el, (i < moitie ? g : d).querySelector(i < moitie ? "#dev-livre-gauche" : "#dev-livre-droite")));
    devDansLeLivre = true;
}
function remettreDev() {
    if (!devDansLeLivre) return;
    [...ranges.keys()].filter(el => el.closest && el.closest(".page-dev")).forEach(remettre);
    devDansLeLivre = false;
}

// ---------------------------------------------------------------------
//  OUVRIR UN HÉROS
// ---------------------------------------------------------------------
let ouvrirAncienne = null;
const fenetreAncienne = () => document.getElementById("fenetre-fiche-perso");
// La fiche d'un héros va dans le livre quand le livre est là (en partie,
// hors combat).
function livreDisponible() {
    const g = G();
    if (!g || !g.enPartie() || !g.pageFlip()) return false;
    const ecran = g.ecran();
    if (!ecran || ecran.style.display === "none") return false;
    const combat = document.getElementById("fenetre-combat");
    if (combat && combat.style.display === "block") return false;
    return true;
}
// Les fenêtres de l'ancienne fiche dont le livre se sert : hors de la fiche cachée.
function sortirLesModales() {
    ["voile-suppression-perso", "modale-creation-caracs"].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.parentNode !== document.body) { ranger(el, document.body); el.classList.add("hors-fiche"); }
    });
}
function rentrerLesModales() {
    ["voile-suppression-perso", "modale-creation-caracs"].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.classList.contains("hors-fiche")) { el.classList.remove("hors-fiche"); remettre(el); }
    });
}
const PAGE_ONGLET = { "onglet-talents": "tal-g", "onglet-inventaire": "inv-g", "onglet-competences": "comp-g", "onglet-dev": "dev-g", "onglet-stats": "fiche-g" };
function ouvrirHeros(id, onglet, sansAller) {
    const h = herosParId(id);
    if (!h) return false;
    creerPagesFiche();
    if (heros !== id) { carteOuverte = null; if (forgeDansLeLivre) fermerForge(false); }
    heros = id;
    // L'ancienne fiche, cachée, se remplit : le deck, les compétences, l'inventaire et l'onglet DEV en dépendent.
    const f = fenetreAncienne();
    if (f) f.classList.add("dans-le-livre");
    sortirLesModales();
    if (typeof ouvrirAncienne === "function") {
        try { const p = ouvrirAncienne(h.idPersonnage, h.prenom, h.nom, h.couleur); if (p && p.then) p.then(() => majPlus(true)).catch(() => {}); }
        catch (e) { console.error("Le livre : la fiche cachée", e); }
    }
    if (modeDev()) rangerDev();
    signatures.fiche = "";
    majPlus(true);
    if (!sansAller) {
        const cle = PAGE_ONGLET[onglet] || "fiche-g";
        aller(pagesFiche[cle === "dev-g" && !modeDev() ? "fiche-g" : cle]);
    }
    return true;
}
function brancherFicheAncienne() {
    if (ouvrirAncienne || typeof window.ouvrirFichePerso !== "function") return;
    ouvrirAncienne = window.ouvrirFichePerso;
    window.ouvrirFichePerso = function (idPersonnage, prenom, nom, couleur, onglet) {
        if (livreDisponible() && herosParId(idPersonnage)) { son(); ouvrirHeros(idPersonnage, onglet); return Promise.resolve(); }
        const f = fenetreAncienne();
        if (f) f.classList.remove("dans-le-livre");
        remettreDev();
        rentrerLesModales();
        return ouvrirAncienne.apply(this, arguments);
    };
}

// ---------------------------------------------------------------------
//  LA MISE À JOUR (le livre suit les héros)
// ---------------------------------------------------------------------
function signatureFiche(h) {
    if (!h) return "";
    return JSON.stringify([h, caracsDe(h.idPersonnage), (window.CACHE_COMPETENCES_GLOBAL || {})[h.idPersonnage] || null,
        deckDe(h), carteOuverte, modeDev(), typeof window.talentsDuPerso === "function" ? window.talentsDuPerso(h) : null, (window.JETS_DEMANDES || []).length, !!joueurs, !!(window.RACES_MONDE || []).length]);
}
function majPlus(force) {
    const g = G();
    if (!g || !g.enPartie || !g.enPartie()) return;
    brancherFicheAncienne();
    brancherForge();
    const changeClans = construireClans();
    creerPagesFiche();
    if (!heros || !herosParId(heros)) {
        const moi = idJoueurCourant();
        const premier = clans().find(c => c.id === moi);
        const h = (premier && premier.heros[0]) || tousLesHeros()[0];
        if (h) { heros = h.idPersonnage; signatures.fiche = ""; }
    }
    if (modeDev() && !devDansLeLivre) rangerDev();
    if (!modeDev() && devDansLeLivre) remettreDev();
    if (changeClans || force !== undefined) poserLesPages();
    const h = herosParId(heros);
    const sig = signatureFiche(h);
    if (!h) {
        ["fiche-g", "fiche-d", "tal-g", "tal-d", "tal2-g", "tal2-d", "comp-g", "comp-d", "inv-g", "inv-d"].forEach(c => { if (pagesFiche[c]) pagesFiche[c].innerHTML = `<div class="contenu-page"><p class="fiche-attente">Aucun aventurier.</p></div>`; });
        preparerPagesForge();
        return;
    }
    if (sig === signatures.fiche && !force) return;
    signatures.fiche = sig;
    rendre(h);
}
function rendre(h) {
    // Ce qu'on était en train de saisir n'est pas effacé sous les doigts.
    const actif = document.activeElement;
    const saisie = actif && actif.classList && actif.classList.contains("saisie-pieces") ? actif.dataset.metal : null;
    pagesFiche["fiche-g"].innerHTML = htmlAvatar(h);
    pagesFiche["fiche-d"].innerHTML = htmlFicheDroite(h);
    Object.keys(LIGNES_PAR_PAGE).forEach(c => { pagesFiche[c].innerHTML = htmlTalentsPage(h, c); });
    pagesFiche["comp-g"].innerHTML = htmlCompetencesGauche(h);
    const avant = pagesFiche["comp-d"].querySelector(".carte-encre");
    const memeCarte = avant && avant.dataset.carte === carteOuverte;
    pagesFiche["comp-d"].innerHTML = htmlCompetencesDroite(h);
    if (memeCarte) { const c = pagesFiche["comp-d"].querySelector(".carte-encre"); if (c) c.classList.add("deja-ecrite"); }
    pagesFiche["inv-g"].innerHTML = htmlInventaireGauche(h);
    pagesFiche["inv-d"].innerHTML = htmlInventaireDroite(h);
    preparerPagesForge();
    if (saisie) { const el = pagesFiche["inv-g"].querySelector(`.saisie-pieces[data-metal="${saisie}"]`); if (el) el.focus(); }
    requestAnimationFrame(() => ajusterNom(document.getElementById("fiche-nom-heros")));
    const img = pagesFiche["fiche-g"].querySelector(".avatar-heros");
    if (img) img.addEventListener("error", () => img.classList.add("absente"), { once: true });
}
window.addEventListener("resize", () => setTimeout(() => ajusterNom(document.getElementById("fiche-nom-heros")), 300));

// ---------------------------------------------------------------------
//  LES GESTES
// ---------------------------------------------------------------------
function noter(pageEl, texte) {
    if (!pageEl) return;
    let n = pageEl.querySelector(".note-fiche");
    if (!n) { n = document.createElement("p"); n.className = "note-fiche"; (pageEl.querySelector(".contenu-page") || pageEl).appendChild(n); }
    n.textContent = texte;
    n.classList.remove("visible"); void n.offsetWidth; n.classList.add("visible");
    clearTimeout(n.minuteur);
    n.minuteur = setTimeout(() => n.classList.remove("visible"), 3200);
}
let dernierAppuiLong = 0;
function agir(cible) {
    if (Date.now() - dernierAppuiLong < 700) return;          // un appui long montrait une note
    const fa = cible.dataset.fa, h = herosParId(heros);
    if (fa === "heros") { son(); ouvrirHeros(cible.dataset.id); return; }
    if (fa === "creer") { son(); if (typeof window.ouvrirCreationHero === "function") window.ouvrirCreationHero(); return; }
    if (!h) return;
    if (fa === "carte") {
        const id = cible.dataset.id;
        if (carteOuverte === id && !cible.classList.contains("verrouillee") && !(window.TECHNIQUES_CLASSE || {})[id]) { basculerMemoire(id); return; }
        son();
        carteOuverte = id;
        pagesFiche["comp-g"].querySelectorAll(".banniere-livre").forEach(b => b.classList.toggle("ouverte", b.dataset.id === id));
        pagesFiche["comp-d"].innerHTML = htmlCompetencesDroite(h);
        signatures.fiche = signatureFiche(h);
        return;
    }
    if (fa === "memoriser") { basculerMemoire(cible.dataset.id); return; }
    if (fa === "effacer") { if (typeof window.supprimerCompetencePerso === "function") { window.ID_PERSONNAGE_DECK = h.idPersonnage; window.supprimerCompetencePerso(cible.dataset.id).then(() => majPlus(true)); } return; }
    if (fa === "forger") { son(); ouvrirForge(); return; }
    if (fa === "fermer-forge") { son(); if (typeof window.fermerForgeCompetence === "function") window.fermerForgeCompetence(); else fermerForge(true); return; }
    if (fa === "arme") { son(); if (typeof window.selectionnerArme === "function") window.selectionnerArme(cible.dataset.arme); setTimeout(majCodex, 30); return; }
    // Les talents ont leur double page (v315) ; un talent qu'on peut prendre
    // ouvre la même demande que l'ancienne fenêtre (talents_ui.js).
    if (fa === "talents") { son(); aller(pagesFiche["tal-g"]); return; }
    if (fa === "talent") {
        const id = cible.dataset.id;
        if (!cible.classList.contains("prenable") || typeof window.demanderTalent !== "function") return;
        window.TALENTS_FICHE = h;
        window.demanderTalent(id);
        return;
    }
    if (fa === "retour-fiche") { son(); aller(pagesFiche["fiche-g"]); return; }
    if (fa === "repartir") {
        son();
        const champ = document.getElementById("champ-id-personnage");
        if (champ) champ.value = h.idPersonnage;
        sortirLesModales();
        if (typeof window.ouvrirModaleCreationCaracs === "function") window.ouvrirModaleCreationCaracs();
        return;
    }
    if (fa === "jet") {
        if (typeof window.lancerJetDeCaracteristique === "function") {
            const carac = cible.dataset.carac;
            window.lancerJetDeCaracteristique(carac, cible.dataset.nom, +cible.dataset.val, +cible.dataset.mod);
        }
        return;
    }
    if (fa === "lacher") { if (typeof window.lacherObjet === "function") window.lacherObjet(h.idPersonnage, cible.dataset.champ).then(() => majPlus(true)); return; }
    if (fa === "ranger") { rangerArme(cible.dataset.champ); return; }
    if (fa === "prendre") { prendreArme(); return; }
    if (fa === "lacher-stock") {
        son();
        const img = h.equipStock && h.equipStock.image;
        ecrire(h, { Equip_Stock: null }).then(ok => { if (ok && img && typeof window.oublierImages === "function") window.oublierImages([img], "objet lâché"); });
        return;
    }
    if (fa === "dev") { son(); poserLesPages(); rangerDev(); aller(pagesFiche["dev-g"]); return; }
    if (fa === "retour-inventaire") { son(); aller(pagesFiche["inv-g"]); return; }
}
async function basculerMemoire(id) {
    const h = herosParId(heros);
    if (!h || typeof window.basculerSelectionCarte !== "function") return;
    son();
    // L'ancienne fiche cachée tient le deck de ce héros (ouvrirHeros) ; sa bannière doit exister.
    if (window.ID_PERSONNAGE_DECK !== h.idPersonnage || !document.getElementById("ui-carte-" + id)) {
        if (typeof window.chargerOngletCompetences === "function") {
            await window.chargerOngletCompetences(h.idPersonnage, typeof window.competencesMaxCombattant === "function" ? window.competencesMaxCombattant(h) : 6);
        }
    }
    await window.basculerSelectionCarte(id);
    const p = (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === h.idPersonnage);
    const q = (window.PERSOS_JOUEURS_PARTIE || []).find(x => x.idPersonnage === h.idPersonnage);
    [p, q].forEach(x => { if (x) x.deckEquipe = (window.CARTES_SELECTIONNEES || []).slice(); });
    majPlus(true);
}

// L'APPUI LONG : une note à l'encre, posée près du doigt, le temps de la lire.
let bulle = null, minuteurAppui = null, minuteurBulle = null;
function montrerAide(el) {
    let d = null;
    try { d = JSON.parse(el.dataset.aide); } catch (e) { return; }
    if (!d) return;
    const g = G(), ecran = g && g.ecran();
    if (!ecran) return;
    if (!bulle) { bulle = document.createElement("div"); bulle.className = "bulle-aide-fiche"; bulle.setAttribute("role", "tooltip"); }
    if (bulle.parentNode !== ecran) ecran.appendChild(bulle);
    bulle.innerHTML = `${d.t ? `<b>${echapper(d.t)}</b>` : ""}${String(d.x || "").split("\n").filter(Boolean).map(l => `<p>${echapper(l)}</p>`).join("")}`;
    const r = el.getBoundingClientRect(), re = ecran.getBoundingClientRect();
    bulle.classList.add("visible");
    const bw = Math.min(bulle.offsetWidth || 280, re.width - 16), bh = bulle.offsetHeight || 80;
    let x = r.left + r.width / 2 - bw / 2 - re.left, y = r.top - bh - 10 - re.top;
    if (y < 8) y = r.bottom + 10 - re.top;
    x = Math.max(8, Math.min(re.width - bw - 8, x));
    bulle.style.left = x + "px"; bulle.style.top = Math.max(8, y) + "px";
    dernierAppuiLong = Date.now();
    clearTimeout(minuteurBulle);
}
function cacherAide(delai) {
    clearTimeout(minuteurBulle);
    minuteurBulle = setTimeout(() => { if (bulle) bulle.classList.remove("visible"); }, delai || 0);
}
function brancherGestes() {
    const g = G(), ecran = g && g.ecran();
    if (!ecran || brancherGestes.fait) return;
    brancherGestes.fait = true;
    ecran.addEventListener("pointerdown", (ev) => {
        const el = ev.target && ev.target.closest && ev.target.closest("[data-aide]");
        cacherAide(0);
        clearTimeout(minuteurAppui);
        if (!el || !ecran.contains(el)) return;
        const x0 = ev.clientX, y0 = ev.clientY;
        minuteurAppui = setTimeout(() => montrerAide(el), 420);
        const bouge = (e) => { if (Math.hypot(e.clientX - x0, e.clientY - y0) > 10) { clearTimeout(minuteurAppui); fin(); } };
        const fin = () => { ecran.removeEventListener("pointermove", bouge); };
        ecran.addEventListener("pointermove", bouge);
    }, true);
    const lacher = () => { clearTimeout(minuteurAppui); if (bulle && bulle.classList.contains("visible")) cacherAide(2600); };
    ecran.addEventListener("pointerup", lacher, true);
    ecran.addEventListener("pointercancel", lacher, true);
    ecran.addEventListener("contextmenu", (ev) => { if (ev.target && ev.target.closest && ev.target.closest(".page-fiches")) ev.preventDefault(); });
    ecran.addEventListener("change", (ev) => {
        const t = ev.target;
        if (t && t.classList && t.classList.contains("saisie-pieces")) changerPieces(t.dataset.metal, t.value);
    });
    ecran.addEventListener("keydown", (ev) => {
        const t = ev.target;
        if (t && t.classList && t.classList.contains("saisie-pieces") && ev.key === "Enter") t.blur();
    });
}

// ---------------------------------------------------------------------
//  LA VEILLE
// ---------------------------------------------------------------------
function veiller() {
    try {
        const g = G();
        if (g && g.enPartie && g.enPartie()) {
            brancherGestes();
            if (!joueurs) chargerJoueurs();
            if (!(window.RACES_MONDE || []).length && typeof window.chargerRacesDuMonde === "function" && !veiller.races) {
                veiller.races = true; window.chargerRacesDuMonde();
            }
            if (typeof window.chargerClasses === "function" && !window.CLASSES_CACHE && !veiller.classes) { veiller.classes = true; window.chargerClasses(); }
            // Pas pendant qu'une page tourne : le livre relit ses pages à la fin.
            const pf = g.pageFlip();
            if (!pf || (pf.getState() === "read" && !g.defileEnCours())) majPlus();
        } else if (heros || pagesClans.length) {
            // Hors partie : on oublie les héros de la partie quittée.
            if (forgeDansLeLivre) fermerForge(false);
            remettreDev();
            rentrerLesModales();
            const f = fenetreAncienne();
            if (f) f.classList.remove("dans-le-livre");
            heros = null; carteOuverte = null; pagesClans = []; signatures = {}; joueurs = null;
        }
    } catch (e) { console.error("Le livre : les aventuriers", e); }
    setTimeout(veiller, 900);
}
setTimeout(veiller, 300);

window.GRIMOIRE_FICHES = {
    agir,
    ouvrir: (id, onglet) => ouvrirHeros(id, onglet),
    allerAuxAventuriers: () => {
        majPlus(true);
        const premiere = pagesClans[0];
        if (premiere) aller(premiere);
    },
    herosAffiche: () => heros,
    pages: () => ({ clans: pagesClans.slice(), ...pagesFiche }),
    majPlus: () => majPlus(true),
    // pour les bancs : les dessins
    dessins: { jaugeCrayon, dessinBanniere, piece }
};
