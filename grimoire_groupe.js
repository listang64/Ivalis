// =========================================================================
//  IVALIS — LE GROUPE DANS LE LIVRE (v418)
// =========================================================================
//  Nico : « à la place du bouton Aventuriers, un bouton Groupe : une double
//  page ; à gauche la compagnie (le nom du groupe, où il est, la date, la
//  réputation locale, les héros et leurs portraits — un toucher : la fiche du
//  héros) ; à droite ceux qui nous suivent (les PNJ suiveurs : portrait, rôle,
//  depuis quand, humeur, loyauté ; le compagnon du Pisteur ; avec nous,
//  laissé en arrière, blessé, mort — un toucher : leurs fils invisibles). Les
//  pages des Aventuriers (création, fiches, forge) en deviennent les
//  sous-pages. »
//
//  Les données viennent de groupe.js (window.GROUPE.etatPourLeLivre) ; les
//  héros, de la partie (PERSOS_JOUEURS_PARTIE).
// =========================================================================

const G = () => window.GRIMOIRE;
const D = () => (window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.dessins) || {};
const lavis = (...a) => (D().lavis ? D().lavis(...a) : "");
const cadre = (g, amp) => (D().cadre ? D().cadre(g, amp) : "");
const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const son = () => { try { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); } catch (e) {} };
const FLEURON = `<svg class="fleuron fleuron-groupe" viewBox="0 0 200 24" aria-hidden="true"><path d="M 8 12 C 40 4 70 4 92 12 M 108 12 C 130 4 160 4 192 12 M 92 12 C 96 6 104 6 108 12 C 104 18 96 18 92 12 Z"/><circle cx="100" cy="12" r="2.2"/></svg>`;
const TEINTE_GROUPE = { couleurs: ["#b3261e", "#c8402f", "#8f1d15"], opacite: 0.3, nom: "groupe" };
const TEINTE_SUIVEURS = { couleurs: ["#5e7f59", "#7d9c6f", "#476944"], opacite: 0.3, nom: "suiveurs" };
const TEINTE_AVENTURIERS = { couleurs: ["#c9772e", "#e0a046", "#a5532a"], opacite: 0.5, nom: "aventuriers" };

let pages = null;                 // { g, d }
let donnees = { suiveurs: [], compagnons: [], lieu: null }, lu = 0, enLecture = null;
const sig = { g: "", d: "" };

function creer() {
    if (pages) return pages;
    const page = (cote) => { const el = document.createElement("div"); el.className = `page-grimoire page-papier ${cote} page-fiches page-groupe`; el.id = "grimoire-groupe-" + cote[0]; return el; };
    pages = { g: page("gauche"), d: page("droite") };
    return pages;
}
function poser() {
    const g = G();
    if (!g || typeof g.definirGroupe !== "function" || !g.enPartie || !g.enPartie()) return;
    const { g: pg, d: pd } = creer();
    const avant = g.pagesGroupe();
    if (avant.length === 2 && avant[0] === pg && avant[1] === pd) return;
    g.definirGroupe([pg, pd]);
}

// ---------------------------------------------------------------------
//  LES DONNÉES
// ---------------------------------------------------------------------
const herosDuGroupe = () => (window.GROUPE && typeof window.GROUPE.herosDeLaPartie === "function") ? window.GROUPE.herosDeLaPartie()
    : ((window.PERSOS_JOUEURS_PARTIE || window.PERSOS_PARTIE || []).filter(h => h && h.idPersonnage && !h.estMonstre && !h.estIllusion && h.actif !== false));
const nomHeros = (h) => [h.prenom, h.nom].filter(Boolean).join(" ").trim() || "Sans nom";
const classeDe = (h) => (typeof window.nomClasseGenre === "function" ? window.nomClasseGenre(h.classe || "", h.genre) : h.classe) || "";
const nomDuGroupe = () => {
    const id = window.ID_PARTIE_COURANTE;
    const p = (window.LISTE_PARTIES_CACHE || []).find(x => x.id === id);
    return (p && p.nom) || (window.PARTIE_DATA && window.PARTIE_DATA.Nom_Du_Groupe) || "";
};
const dateDuJeu = () => { const d = window.DATE_EN_JEU_ACTUELLE || {}; return d.jour ? `Jour ${d.jour} de l'an ${d.annee || "?"}` : ""; };
async function lire(force) {
    if (!window.GROUPE || typeof window.GROUPE.etatPourLeLivre !== "function") return;
    if (enLecture) return enLecture;
    if (!force && Date.now() - lu < 15000) return;
    enLecture = (async () => {
        try { donnees = await window.GROUPE.etatPourLeLivre(); lu = Date.now(); }
        catch (e) { console.warn("Le livre : le groupe", e); }
        enLecture = null;
        maj();
    })();
    return enLecture;
}

// ---------------------------------------------------------------------
//  LES DESSINS
// ---------------------------------------------------------------------
const initiales = (nom) => String(nom || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join("");
const medaillon = (url, nom, classes) => `<span class="medaillon-liens ${classes || ""}">${url ? `<img src="${echapper(url)}" alt="" draggable="false">` : `<span class="initiales-liens">${echapper(initiales(nom))}</span>`}</span>`;
function motReputation(v) {
    if (v == null) return "inconnue";
    if (v >= 7) return "adulés"; if (v >= 3) return "bien vus"; if (v > -3) return "inconnus ou neutres"; if (v > -7) return "mal vus"; return "honnis";
}
// La jauge de loyauté : de −100 à +100, le milieu au centre.
function jaugeLoyaute(v) {
    const n = Math.max(-100, Math.min(100, Number(v) || 0));
    const gauche = n < 0 ? 50 + n / 2 : 50, largeur = Math.abs(n) / 2;
    return `<span class="jauge-groupe" title="Loyauté ${n}"><i class="${n < 0 ? "neg" : "pos"}" style="left:${gauche}%;width:${largeur}%"></i><b></b></span>`;
}
const ETAT_JOLI = { avec: "avec nous", laisse: "laissé en arrière", parti: "parti", renvoye: "renvoyé", mort: "mort" };

// LA PAGE DE GAUCHE : la compagnie.
function htmlGauche() {
    const heros = herosDuGroupe();
    const l = donnees.lieu || {};
    const lieu = l.nature ? "Dans la nature" : (l.nom || "");
    const ligneHeros = heros.map(h => {
        const url = h.urlCloudinary || h.urlAvatarEquipe || h.urlPortraitReference || "";
        return `<button type="button" class="heros-groupe" data-action="groupe" data-gp="heros" data-id="${echapper(h.idPersonnage)}">
            ${medaillon(url, nomHeros(h), "heros")}<span class="nom-groupe">${echapper(nomHeros(h))}</span>
            <span class="role-groupe">${echapper(classeDe(h))}${h.niveau ? ` · niv. ${echapper(h.niveau)}` : ""}</span></button>`;
    }).join("");
    return `<div class="contenu-page page-groupe-gauche">
        <div class="entete-groupe">${lavis(TEINTE_GROUPE, "groupe-titre")}<span class="titre-page-fiche">Le groupe</span></div>
        ${nomDuGroupe() ? `<div class="nom-du-groupe">${echapper(nomDuGroupe())}</div>` : ""}
        ${FLEURON}
        <div class="infos-groupe">
          ${lieu ? `<div><span class="cle-groupe">Où</span> ${echapper(lieu)}</div>` : ""}
          ${dateDuJeu() ? `<div><span class="cle-groupe">Quand</span> ${echapper(dateDuJeu())}</div>` : ""}
          ${!l.nature && l.reputation != null ? `<div><span class="cle-groupe">Réputation ici</span> ${l.reputation > 0 ? "+" : ""}${echapper(l.reputation)} — ${motReputation(l.reputation)}${(l.tags || []).length ? ` <em>(${echapper(l.tags.slice(0, 3).join(", "))})</em>` : ""}</div>` : ""}
        </div>
        <div class="sous-titre-groupe">La compagnie</div>
        <div class="liste-heros-groupe">${ligneHeros || `<p class="fiche-attente">Aucun héros dans le groupe.</p>`}</div>
        <button type="button" class="bouton-aventuriers-groupe" data-action="groupe" data-gp="aventuriers">${lavis(TEINTE_AVENTURIERS, "aventuriers-groupe")}${cadre("aventuriers-groupe", 1.3)}<span>Les aventuriers ›</span></button>
      </div>`;
}

// LA PAGE DE DROITE : ceux qui nous suivent.
function htmlSuiveur(s) {
    const f = s.fiche || {};
    const etat = s.etat === "avec" ? (s.blesse ? "avec nous, blessé" : "avec nous") : (ETAT_JOLI[s.etat] || s.etat);
    return `<li class="suiveur-groupe">
        <button type="button" class="carte-suiveur" data-action="groupe" data-gp="ame" data-id="${echapper(s.id)}" data-nom="${echapper(s.nom)}">
          ${medaillon(f.URL_Cloudinary || "", s.nom)}
          <span class="texte-suiveur">
            <span class="nom-groupe">${echapper(s.nom)}</span>
            <span class="role-groupe">${echapper(f.Occupation || "")}${s.depuis ? ` · depuis le ${echapper(s.depuis)}` : ""}</span>
            <span class="etat-groupe">${echapper(etat)}${s.humeur ? ` · ${echapper(s.humeur)}` : ""}</span>
            <span class="loyaute-groupe">Loyauté ${jaugeLoyaute(s.loyaute)} <small>${echapper(s.motLoyaute || "")}</small></span>
          </span>
        </button>
        <button type="button" class="lien-fiche renvoyer-groupe" data-action="groupe" data-gp="renvoyer" data-id="${echapper(s.id)}" data-nom="${echapper(s.nom)}">Se séparer de lui</button>
      </li>`;
}
function htmlCompagnon(c) {
    const etat = c.mort ? "mort" : (c.blessures || []).length ? "avec nous, blessé" : "avec nous";
    return `<li class="suiveur-groupe compagnon-groupe${c.mort ? " mort" : ""}">
        <div class="carte-suiveur fixe">
          ${medaillon(c.image || c.token || "", c.nom, c.mort ? "mort" : "")}
          <span class="texte-suiveur">
            <span class="nom-groupe">${echapper(c.nom)}</span>
            <span class="role-groupe">Le compagnon de ${echapper(c.maitre || "")}</span>
            ${c.caractere ? `<span class="caractere-groupe">${echapper(c.caractere)}</span>` : ""}
            <span class="etat-groupe">${echapper(etat)}</span>
          </span>
        </div>
      </li>`;
}
function htmlDroite() {
    const avec = (donnees.suiveurs || []).filter(s => s.etat === "avec");
    const partis = (donnees.suiveurs || []).filter(s => s.etat !== "avec");
    const compagnons = donnees.compagnons || [];
    const max = (window.GROUPE && window.GROUPE.MAX_SUIVEURS) || 3;
    return `<div class="contenu-page page-groupe-droite defile-fiche">
        <div class="entete-groupe">${lavis(TEINTE_SUIVEURS, "suiveurs-titre")}<span class="titre-page-fiche">Ceux qui nous suivent</span></div>
        ${FLEURON}
        <div class="compte-suiveurs">${avec.length} suiveur${avec.length > 1 ? "s" : ""} sur ${max}</div>
        ${avec.length || compagnons.length ? `<ul class="liste-suiveurs">${avec.map(htmlSuiveur).join("")}${compagnons.map(htmlCompagnon).join("")}</ul>`
            : `<p class="fiche-attente">Personne ne suit encore la compagnie. Dans le récit, demandez à un personnage de vous rejoindre : il décidera selon ce qu'il pense de vous (${max} au plus).</p>`}
        ${partis.length ? `<div class="sous-titre-groupe petit">Ceux qui nous ont quittés</div>
        <ul class="liste-partis">${partis.map(s => `<li><button type="button" class="parti-groupe${s.etat === "mort" ? " mort" : ""}" data-action="groupe" data-gp="ame" data-id="${echapper(s.id)}" data-nom="${echapper(s.nom)}">
            <b>${echapper(s.nom)}</b> — ${echapper(ETAT_JOLI[s.etat] || s.etat)}${s.lieu ? ` (${echapper(s.lieu)})` : ""}${s.quand ? `, ${echapper(s.quand)}` : ""}</button></li>`).join("")}</ul>` : ""}
      </div>${(window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.FLECHE_DEFILE) || ""}`;
}

function maj(force) {
    if (!pages) return;
    const heros = herosDuGroupe().map(h => [h.idPersonnage, nomHeros(h), classeDe(h), h.niveau, h.urlCloudinary || h.urlAvatarEquipe || h.urlPortraitReference || ""]);
    const sg = JSON.stringify([heros, nomDuGroupe(), dateDuJeu(), donnees.lieu]);
    if (force || sg !== sig.g) { sig.g = sg; pages.g.innerHTML = htmlGauche(); }
    const sd = JSON.stringify([donnees.suiveurs, donnees.compagnons]);
    if (force || sd !== sig.d) { sig.d = sd; pages.d.innerHTML = htmlDroite(); }
}

// ---------------------------------------------------------------------
//  LES GESTES
// ---------------------------------------------------------------------
async function agir(cible) {
    const gp = cible.dataset.gp;
    if (gp === "heros") { son(); if (window.GRIMOIRE_FICHES) window.GRIMOIRE_FICHES.ouvrir(cible.dataset.id); return; }
    if (gp === "revenir") { son(); ouvrir(); return; }
    if (gp === "aventuriers") { son(); if (window.GRIMOIRE_FICHES) window.GRIMOIRE_FICHES.allerAuxAventuriers(); return; }
    if (gp === "ame") { son(); if (window.GRIMOIRE_LIENS) window.GRIMOIRE_LIENS.ouvrir({ id: cible.dataset.id, nom: cible.dataset.nom, depuisGroupe: true }); return; }
    if (gp === "renvoyer") {
        if (!window.GROUPE || !confirm(`Se séparer de ${cible.dataset.nom} ? Il quitte la compagnie et reste là où vous êtes.`)) return;
        son();
        try { await window.GROUPE.renvoyer(cible.dataset.id); } catch (e) { alert(e.message || e); }
        await lire(true);
    }
}

// ---------------------------------------------------------------------
//  ALLER AU GROUPE
// ---------------------------------------------------------------------
function ouvrir() {
    const g = G();
    if (!g || !g.enPartie || !g.enPartie() || typeof g.definirGroupe !== "function") return false;
    poser();
    maj(true);
    lire(true);
    const aller = (essai) => {
        const i = g.indexDe(pages.g);
        if (i < 0) { if (essai < 30) setTimeout(() => aller(essai + 1), 100); return; }
        g.allerALaPage(i);
    };
    aller(0);
    return true;
}
function ouverte() {
    const g = G(), pf = g && g.pageFlip && g.pageFlip();
    if (!pages || !pf || !g.ouvert || !g.ouvert() || !g.enPartie()) return false;
    const i = g.indexDe(pages.g), ici = pf.getCurrentPageIndex();
    return i >= 0 && (ici === i || ici === i + 1);
}

// La veille : en partie, la double page est dans le livre ; ouverte, elle se relit (15 s).
setInterval(() => {
    if (document.hidden) return;
    try {
        const g = G();
        if (!g || !g.enPartie || !g.enPartie()) return;
        poser();
        if (ouverte()) lire(false);
        maj();
    } catch (e) { console.warn("Le livre : le groupe", e); }
}, 1000);

window.GRIMOIRE_GROUPE = { ouvrir, ouverte, agir, maj: () => maj(true), lire, pages: () => (pages ? [pages.g, pages.d] : []), donnees: () => donnees };
