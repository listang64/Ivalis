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
// (v432) Nico : « sous le petit titre La compagnie, une tache d'aquarelle pour le mettre en valeur ;
// pareil pour Réputation ici ».
const TEINTE_SOUS_TITRES = { couleurs: ["#e8a43a", "#f0bf55", "#d1862c"], opacite: 0.6, nom: "sous-titres-groupe" };

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
// (v428) L'avatar en pied (héros à gauche, suiveurs à droite) ; sans image, ses initiales.
const avatarEnPied = (url, nom, classe) => `<span class="${classe}${url ? "" : " sans-image"}">${url ? `<img src="${echapper(url)}" alt="" draggable="false">` : `<span class="initiales-liens">${echapper(initiales(nom))}</span>`}</span>`;
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
// (v422) La tête qui parle : une discussion en privé avec un suiveur (discussion_privee.js).
const TETE_QUI_PARLE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="tete" d="M8.6 3.2c-3.3 0-5.9 2.6-5.9 5.8 0 1.9.8 3.4 2 4.5V20.5h6.6v-2.6h1.9c.9 0 1.5-.7 1.5-1.5v-2.2l1.5-.5c.4-.1.5-.5.3-.8l-1.6-2.6c-.2-3.9-2.8-7.1-6.3-7.1z"/><path class="onde" d="M17.6 7.6c1.3 1.6 1.3 3.9 0 5.5M20.1 5.4c2.5 2.9 2.5 7.1 0 10"/></svg>`;
const ETAT_JOLI = { avec: "avec nous", laisse: "laissé en arrière", parti: "parti", renvoye: "renvoyé", mort: "mort" };

// (v430) La séparation dorée sous chaque héros : un trait d'or qui s'effile en pointe
// fine à chaque bout, un losange au milieu. Le dégradé est défini une fois par page.
const DEFS_OR = `<svg class="defs-or-groupe" width="0" height="0" aria-hidden="true"><defs>
    <linearGradient id="or-groupe" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a6420" stop-opacity="0.2"/><stop offset="0.15" stop-color="#9c7020"/>
      <stop offset="0.5" stop-color="#f0c95e"/><stop offset="0.85" stop-color="#9c7020"/><stop offset="1" stop-color="#8a6420" stop-opacity="0.2"/></linearGradient>
    <linearGradient id="or-groupe-plein" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6dc8c"/><stop offset="1" stop-color="#a87c26"/></linearGradient></defs></svg>`;
const SEPARATION_DOREE = `<svg class="separation-doree" viewBox="0 0 200 16" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0 8 C 40 6, 68 5, 91 6.4 L 100 1.6 L 109 6.4 C 132 5, 160 6, 200 8 C 160 10, 132 11, 109 9.6 L 100 14.4 L 91 9.6 C 68 11, 40 10, 0 8 Z" fill="url(#or-groupe)" stroke="#7a5518" stroke-width="0.35"/>
    <path d="M100 4.6 L 104.2 8 L 100 11.4 L 95.8 8 Z" fill="url(#or-groupe-plein)" stroke="#7a5518" stroke-width="0.5"/></svg>`;
// (v430) Nico : « le corps réputation plus joli, dans le style du livre » : une règle
// à l'encre de « honnis » à « adulés », un losange doré à sa place, le mot dessous.
function htmlReputation(l) {
    const v = Math.max(-10, Math.min(10, Number(l.reputation) || 0));
    const x = 10 + (v + 10) * 9;          // de 10 à 190
    const graduations = Array.from({ length: 11 }, (_, i) => { const gx = 10 + i * 18, grand = i % 5 === 0;
        return `<line x1="${gx}" y1="${grand ? 9 : 11}" x2="${gx}" y2="${grand ? 19 : 17}"/>`; }).join("");
    return `<div class="reputation-groupe">
        <div class="titre-reputation">${lavis(TEINTE_SOUS_TITRES, "groupe-reputation")}<span>Réputation ici</span></div>
        <div class="ligne-reputation"><span>honnis</span>
        <svg class="regle-reputation" viewBox="0 0 200 28" aria-hidden="true">
          <path class="trait-reputation" d="M10 14 C 60 12.8, 140 15.2, 190 14"/>${graduations}
          <path d="M${x} 6 L ${x + 6} 14 L ${x} 22 L ${x - 6} 14 Z" fill="url(#or-groupe-plein)" stroke="#5c3a12" stroke-width="0.8"/>
        </svg><span>adulés</span></div>
        <div class="mots-reputation">${motsReputation(v, l.tags).map((m, i) => `<span class="bulle-reputation">${lavis(TEINTE_BULLE, "bulle-reputation-" + i)}<span>${echapper(m)}</span></span>`).join("")}</div>
      </div>`;
}
// (v438) Nico : « sous la barre qui jauge la réputation, simplifier le texte : juste les mots
// clés, avec une aquarelle grise légère sous chacun, comme des bulles (ex. Indésirable) » :
// le mot de la jauge, puis les étiquettes du lieu (Reputations.Tags), trois au plus.
const TEINTE_BULLE = { couleurs: ["#8c8c8c", "#a3a3a3", "#737373"], opacite: 0.22, nom: "bulle-reputation" };
const majuscule = (t) => { const s = String(t || "").trim(); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; };
function motsReputation(v, tags) {
    const mots = [majuscule(motReputation(v)), ...(tags || []).slice(0, 3).map(majuscule)].filter(Boolean);
    return mots.filter((m, i) => mots.findIndex(x => x.toLowerCase() === m.toLowerCase()) === i);
}

// LA PAGE DE GAUCHE : la compagnie.
function htmlGauche() {
    const heros = herosDuGroupe();
    const l = donnees.lieu || {};
    const lieu = l.nature ? "Dans la nature" : (l.nom || "");
    // (v433) Nico : « enlève le bouton pour changer le personnage sous l'avatar » (la double
    // flèche de la v419) : (v479) on change de héros principal dans le menu « Mon héros principal ».
    const ligneHeros = heros.map(h => {
        const url = h.urlCloudinary || h.urlAvatarEquipe || h.urlPortraitReference || "";
        const id = echapper(h.idPersonnage);
        // (v428) Nico : « à gauche, l'avatar des personnages les uns à côté des autres, avec en
        // dessous leurs noms, et un dégradé noir faible opacité pour masquer la coupe du bas de
        // leurs images ; adapte la taille des avatars au nombre de personnages » (--n, le CSS).
        // (v430) Nico : « enlève l'ombre noire sous chaque avatar et mets plutôt une séparation
        // dorée jolie, dessinée en SVG, qui part en pointe fine sur les bords, sous chaque avatar,
        // avec en dessous le nom » — et le nom un peu plus gros, en doré.
        return `<div class="heros-groupe">
            <button type="button" class="portrait-heros-groupe" data-action="groupe" data-gp="heros" data-id="${id}">${avatarEnPied(url, nomHeros(h), "avatar-heros-groupe")}</button>
            ${SEPARATION_DOREE}
            <span class="ligne-nom-groupe"><button type="button" class="nom-groupe" data-action="groupe" data-gp="heros" data-id="${id}">${echapper(nomHeros(h))}</button></span>
            <span class="role-groupe">${echapper(classeDe(h))}${h.niveau ? ` · niv. ${echapper(h.niveau)}` : ""}</span></div>`;
    }).join("");
    return `<div class="contenu-page page-groupe-gauche">${DEFS_OR}
        ${/* (v438) Nico : « enlève le titre Le groupe ; le nom du groupe en plus gros, remonté en haut » */""}
        ${nomDuGroupe() ? `<div class="entete-groupe nom-du-groupe">${lavis(TEINTE_GROUPE, "groupe-titre")}<span>${echapper(nomDuGroupe())}</span></div>` : ""}
        ${FLEURON}
        <div class="infos-groupe">
          ${lieu ? `<div><span class="cle-groupe">Où</span> ${echapper(lieu)}</div>` : ""}
        </div>
        ${!l.nature && l.reputation != null ? htmlReputation(l) : ""}
        ${/* (v447) Nico : « sur la page groupe, vire le titre La compagnie » */""}
        <div class="liste-heros-groupe" style="--n:${Math.max(1, heros.length)}">${ligneHeros || `<p class="fiche-attente">Aucun héros dans le groupe.</p>`}</div>
        ${/* (v479) Plus de Livre des clans : le menu « Mon héros principal » (grimoire_fiches.js) */""}
        ${window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.htmlChoixHeros ? window.GRIMOIRE_FICHES.htmlChoixHeros() : ""}
      </div>`;
}

// LA PAGE DE DROITE : ceux qui nous suivent.
function htmlSuiveur(s) {
    const f = s.fiche || {};
    const etat = s.etat === "avec" ? (s.blesse ? "avec nous, blessé" : "avec nous") : (ETAT_JOLI[s.etat] || s.etat);
    // (v428) Nico : « page de droite, l'avatar des PNJ aussi : garde la taille de leurs encarts,
    // l'avatar collé en bas de son encart, qui dépasse un peu en haut, sur le côté gauche » ;
    // « le symbole pour parler en privé, plus petit et sous l'image du PNJ ».
    // (v430) Nico : « le bouton pour parler au PNJ, en discret, dans son encart tout en bas à droite ».
    return `<li class="suiveur-groupe">
        <div class="cadre-suiveur">
        <button type="button" class="carte-suiveur avec-parler" data-action="groupe" data-gp="ame" data-id="${echapper(s.id)}" data-nom="${echapper(s.nom)}">
          ${avatarEnPied(f.URL_Cloudinary || "", s.nom, "avatar-suiveur")}
          <span class="texte-suiveur">
            <span class="nom-groupe">${echapper(s.nom)}</span>
            <span class="role-groupe">${echapper(f.Occupation || "")}${s.depuis ? ` · depuis le ${echapper(s.depuis)}` : ""}</span>
            <span class="etat-groupe">${echapper(etat)}${s.humeur ? ` · ${echapper(s.humeur)}` : ""}</span>
            <span class="loyaute-groupe">Loyauté ${jaugeLoyaute(s.loyaute)} <small>${echapper(s.motLoyaute || "")}</small></span>
          </span>
        </button>
          <button type="button" class="parler-groupe" data-action="groupe" data-gp="parler" data-id="${echapper(s.id)}" title="Parler en privé avec ${echapper(s.nom)}" aria-label="Parler en privé avec ${echapper(s.nom)}">${TETE_QUI_PARLE}</button>
        </div>
        <div class="actions-suiveur">
          <button type="button" class="lien-fiche renvoyer-groupe" data-action="groupe" data-gp="renvoyer" data-id="${echapper(s.id)}" data-nom="${echapper(s.nom)}">Se séparer de lui</button>
        </div>
      </li>`;
}
function htmlCompagnon(c) {
    const etat = c.mort ? "mort" : (c.blessures || []).length ? "avec nous, blessé" : "avec nous";
    return `<li class="suiveur-groupe compagnon-groupe${c.mort ? " mort" : ""}">
        <div class="carte-suiveur fixe">
          ${avatarEnPied(c.image || c.token || "", c.nom, "avatar-suiveur")}
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
    const choix = window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.signatureChoixHeros ? window.GRIMOIRE_FICHES.signatureChoixHeros() : "";
    const sg = JSON.stringify([heros, nomDuGroupe(), dateDuJeu(), donnees.lieu, choix]);
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
    if (gp === "ame") { son(); if (window.GRIMOIRE_LIENS) window.GRIMOIRE_LIENS.ouvrir({ id: cible.dataset.id, nom: cible.dataset.nom, depuisGroupe: true }); return; }
    // (v422) Parler en privé avec un suiveur.
    if (gp === "parler") {
        const s = (donnees.suiveurs || []).find(x => x.id === cible.dataset.id && x.etat === "avec");
        if (!s || !window.DISCUSSION) return;
        son();
        window.DISCUSSION.ouvrir({ id: s.id, nom: s.nom, fiche: s.fiche || {}, depuis: s.depuis || "" });
        return;
    }
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
