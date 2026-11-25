// =========================================================================
//  IVALIS — LA DOUBLE PAGE « MISSION EN COURS » (v444)
// =========================================================================
//  Nico : « un nouveau marque-page de couleur en tissu à côté des autres, avec le
//  symbole d'un parchemin plié en rouleau : l'accès rapide à une toute nouvelle
//  double page, Mission en cours. Page de gauche, toutes les infos utiles de la
//  mission en cours ; page de droite, la possibilité pour les joueurs d'écrire eux-
//  mêmes (partagé par le groupe) des notes sur la mission — juste montrer qu'on peut
//  écrire. » « Sans mission, il garde sa couleur : si on va dedans, ça met aucune
//  mission en cours. » « Dans les pages missions, la possibilité de voter pour mettre
//  fin à la mission en cours : si tous les joueurs sont OK, elle est abandonnée. »
//
//  La double page n'entre dans le livre que le temps qu'on la lit (comme le Hall) ;
//  la mission et ses notes viennent de missions_guilde.js (Guilde/Mission). Ce que la
//  page montre est ce que les joueurs savent : jamais le plan du MJ.
// =========================================================================
const G = () => window.GRIMOIRE;
const M = () => window.MISSIONS_GUILDE;
const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const son = () => { try { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); } catch (e) {} };
const FLEURON = `<svg class="fleuron fleuron-mission" viewBox="0 0 200 24" aria-hidden="true"><path d="M 8 12 C 40 4 70 4 92 12 M 108 12 C 130 4 160 4 192 12 M 92 12 C 96 6 104 6 108 12 C 104 18 96 18 92 12 Z"/><circle cx="100" cy="12" r="2.2"/></svg>`;
// (v450) « Le bouton voter pour abandonner, dans le même design que le reste du livre » : le cadre
// tracé à la plume et le lavis d'aquarelle (le procédé de « + Un nouvel aventurier » et de « Forger »).
const DESSINS = () => (window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.dessins) || {};
const TEINTE_ABANDON = { couleurs: ["#a3352a", "#c25a3a", "#7d2218"], opacite: 0.42, nom: "abandon" };
const TEINTE_CONTINUER = { couleurs: ["#6f6c66", "#8d8981", "#5b5852"], opacite: 0.26, nom: "continuer" };
function boutonLivre(action, texte, teinte, graine) {
    const d = DESSINS(), cadre = d.cadre ? d.cadre(graine, 1.4) : (G() && G().dessins ? G().dessins.cadreMain(graine, 1.4) : "");
    return `<button type="button" class="bouton-mission" data-mi="${action}">${d.lavis ? d.lavis(teinte, graine) : ""}${cadre}<span>${echapper(texte)}</span></button>`;
}

let pages = null;
function creer() {
    if (pages) return pages;
    const page = (cote) => { const el = document.createElement("div"); el.className = `page-grimoire page-papier ${cote} page-mission-en-cours`; el.id = "grimoire-mission-" + cote[0]; return el; };
    pages = { g: page("gauche"), d: page("droite") };
    // Les notes : enregistrées en s'arrêtant d'écrire (et en quittant le champ).
    pages.d.addEventListener("input", (e) => { if (e.target.classList.contains("notes-mission")) programmerNotes(e.target.value); });
    pages.d.addEventListener("focusout", (e) => { if (e.target.classList.contains("notes-mission")) enregistrerNotes(e.target.value); });
    pages.g.addEventListener("click", (e) => {
        const b = e.target.closest("[data-mi]"); if (!b || !M()) return;
        son();
        if (b.dataset.mi === "abandon-oui") M().voterAbandon("oui").then(rendre);
        if (b.dataset.mi === "abandon-non") M().voterAbandon("non").then(rendre);
    });
    return pages;
}
function poser() {
    const g = G();
    if (!g || typeof g.definirMission !== "function" || !g.enPartie || !g.enPartie()) return;
    creer();
    const avant = g.pagesMission();
    if (avant.length === 2 && avant[0] === pages.g && avant[1] === pages.d) return;
    g.definirMission([pages.g, pages.d]);
}

// ---------------------------------------------------------------------
//  LES PAGES
// ---------------------------------------------------------------------
const liste = (l) => (Array.isArray(l) ? l : []).filter(Boolean);
// (v457) La mission accomplie (son sceau touché dans le récit) : la même double page, en lecture.
const estAccomplie = (d) => !!(d && d.Mission && d.Statut === "reussie");
function htmlGauche(d) {
    // (v486) Le clan nomade : « l'onglet Mission est renommé Tâche en cours ». Déplacer le camp ou recruter, votés au
    // conseil, passent par leur bouton : la page le dit.
    if (!d || !d.Mission) {
        const tv = ((window.CAMP && window.CAMP.lire && window.CAMP.lire()) || {}).Tache_Votee, R = (window.CAMP && window.CAMP.regles) || {};
        const bouton = tv && R.TACHES_A_BOUTON && R.TACHES_A_BOUTON[tv.Type];
        return `<div class="contenu-page page-mission-vide"><div class="titre-mission-en-cours">Tâche en cours</div>${FLEURON}
        ${bouton ? `<p class="aucune-mission">Le conseil a voté : <b>${echapper(tv.Titre)}</b>. Elle passe par ${echapper(bouton)}.</p>` : `<p class="aucune-mission">Aucune tâche en cours.</p>`}
        </div>`;
    }
    // (v452) Nico : « vire les indices et leurs créations dans la page de mission en cours » : plus de liste
    // d'indices (le Narrateur garde ceux de son plan, pour lui seul).
    const m = d.Mission, av = d.Avancement || {}, journal = liste(av.Journal);
    const v = d.Vote_Abandon, moi = M() ? M().idJoueur() : "";
    const oui = v ? liste(v.Votants).filter(x => (v.Votes || {})[x.id] === "oui").length : 0;
    const abandon = estAccomplie(d) ? ""
        : !v
        ? boutonLivre("abandon-oui", "Voter pour abandonner la tâche", TEINTE_ABANDON, "abandon-" + m.Id)
        : `<div class="vote-abandon"><p><b>${echapper((v.Initiateur || {}).nom || "Un joueur")}</b> propose d'abandonner la tâche (${oui}/${liste(v.Votants).length}).</p>
            <div class="boutons-abandon">${(v.Votes || {})[moi] === "oui" ? `<p class="discret">En attente des autres joueurs.</p>` : boutonLivre("abandon-oui", "J'accepte", TEINTE_ABANDON, "abandon-accepte-" + m.Id)}
            ${boutonLivre("abandon-non", "Non, on continue", TEINTE_CONTINUER, "abandon-continue-" + m.Id)}</div></div>`;
    return `<div class="contenu-page page-mission-infos defile-fiche">
        <div class="titre-mission-en-cours">${echapper(m.Titre)}</div>
        ${estAccomplie(d) && M() && M().sceauCire ? `<div class="sceau-quete-page" title="Quête accomplie">${M().sceauCire("QUÊTE", "ACCOMPLIE", "quete-page")}</div>` : ""}
        ${M() && M().difficulteDe(m) === "difficile" ? M().htmlSceauDifficile("sceau-difficile-page") : ""}
        ${FLEURON}
        <dl class="faits-mission-en-cours">
          <div><dt>Commanditaire</dt><dd>${echapper(m.Commanditaire)}</dd></div>
          <div><dt>Région</dt><dd>${echapper(m.Region_Nom)}</dd></div>
          <div><dt>Lieu</dt><dd>${echapper(m.Lieu && m.Lieu.Nom)}${m.Lieu && m.Lieu.Type ? ` <em>(${echapper(m.Lieu.Type)})</em>` : ""}</dd></div>
        </dl>
        <div class="sous-titre-mission">L'objectif</div><p class="objectif-en-cours">${echapper(m.Objectif)}</p>
        <div class="sous-titre-mission">Ce qu'on en sait</div><p>${echapper(m.Details)}</p>
        ${journal.length ? `<div class="sous-titre-mission">Ce qui s'est passé</div><ul class="journal-mission">${journal.slice(-8).map(x => `<li>${echapper(x.Texte)}</li>`).join("")}</ul>` : ""}
        <div class="abandon-mission">${abandon}</div>
      </div>`;
}
const modeNotes = (d) => (estAccomplie(d) ? "lu" : d && d.Mission ? "ecrit" : "vide");
function htmlDroite(d) {
    const mode = modeNotes(d);
    const attributs = mode === "ecrit" ? "" : mode === "lu" ? "readonly" : "disabled";
    const aide = mode === "ecrit" ? "Écrivez ici ce que vous voulez retenir de la tâche…" : mode === "lu" ? "Aucune note pour cette tâche." : "Les notes s'ouvriront avec une tâche.";
    return `<div class="contenu-page page-mission-notes">
        <div class="titre-notes-mission">Nos notes</div>
        <textarea class="notes-mission" data-mode="${mode}" spellcheck="false" ${attributs}
          placeholder="${aide}">${echapper(mode !== "vide" ? (d.Notes || "") : "")}</textarea>
      </div>`;
}
let rendu = "";
export function rendre() {
    if (!pages) return;
    const enCours = M() ? M().lireMission() : null;
    const d = enCours && enCours.Mission ? enCours : (M() && M().missionAccomplie ? M().missionAccomplie() : null);
    const ta = pages.d.querySelector(".notes-mission");
    const enEcriture = ta && document.activeElement === ta;
    const sigG = JSON.stringify([d && d.Mission && d.Mission.Id, d && d.Statut, d && d.Avancement, d && d.Vote_Abandon, M() && M().idJoueur()]);
    if (sigG !== rendu) { pages.g.innerHTML = htmlGauche(d); rendu = sigG; }
    // Les notes des autres arrivent ; celles qu'on est en train d'écrire ne sont pas écrasées.
    if (!ta || ta.dataset.mode !== modeNotes(d)) pages.d.innerHTML = htmlDroite(d);
    else if (!enEcriture && d && d.Mission && ta.value !== (d.Notes || "")) ta.value = d.Notes || "";
    majParchemin(d);
}
// (v457) LE PARCHEMIN DES RÉCOMPENSES : Nico, « posé en travers un morceau de parchemin par-dessus le
// livre, sur les deux pages, marqué dessus les récompenses de la mission (pour l'instant : Récompenses,
// et laisse vide) ». Posé sur la scène, à la place du livre, tant que la double page d'une mission
// accomplie est ouverte.
let parchemin = null, accomplieAffichee = null;
function majParchemin(d) {
    if (d !== undefined) accomplieAffichee = estAccomplie(d) ? d : null;
    const g = G(), scene = g && g.scene && g.scene(), livre = g && g.livre && g.livre();
    const voulu = !!(accomplieAffichee && scene && livre && ouverte());
    if (!voulu) { if (parchemin) parchemin.classList.remove("pose"); return; }
    if (!parchemin || parchemin.parentNode !== scene) {
        parchemin = parchemin || document.createElement("div");
        parchemin.className = "parchemin-recompenses";
        parchemin.setAttribute("aria-hidden", "true");
        scene.appendChild(parchemin);
    }
    // (v486) Les récompenses de la tâche, fixées à sa création (tache_en_cours.js) : la caisse du groupe, les provisions…
    const R = (window.CAMP && window.CAMP.regles) || {};
    const lignes = R.texteRecompense ? R.texteRecompense((accomplieAffichee.Mission || {}).Recompense) : [];
    const html = `<div class="papier-recompenses"><div class="titre-recompenses">Récompenses</div>${FLEURON}<div class="liste-recompenses">${lignes.map(l => `<div class="ligne-recompense">${echapper(l)}</div>`).join("")}</div></div>`;
    if (parchemin.__html !== html) { parchemin.innerHTML = html; parchemin.__html = html; }
    Object.assign(parchemin.style, { left: livre.offsetLeft + "px", top: livre.offsetTop + "px", width: livre.offsetWidth + "px", height: livre.offsetHeight + "px" });
    requestAnimationFrame(() => parchemin && parchemin.classList.add("pose"));
}
let minuteurNotes = null;
function programmerNotes(texte) { clearTimeout(minuteurNotes); minuteurNotes = setTimeout(() => enregistrerNotes(texte), 900); }
function enregistrerNotes(texte) {
    clearTimeout(minuteurNotes);
    const d = M() && M().lireMission();
    if (d && d.Mission && (d.Notes || "") !== texte) M().ecrireNotes(texte);
}

// ---------------------------------------------------------------------
//  Y ALLER (le marque-page) ; la double page sort du livre une fois quittée
// ---------------------------------------------------------------------
let enRoute = 0;
function aller(essai) {
    const g = G();
    if (!g || !pages) return;
    const i = g.indexDe(pages.g);
    if (i < 0) { poser(); enRoute = Date.now(); if (essai < 60) setTimeout(() => aller(essai + 1), 100); return; }
    g.allerALaPage(i);
}
export function ouvrir() {
    const g = G();
    if (!g || !g.enPartie || !g.enPartie() || typeof g.definirMission !== "function") return false;
    creer();
    rendu = "";
    rendre();
    poser();
    enRoute = Date.now();
    aller(0);
    return true;
}
export function ouverte() {
    const g = G(), pf = g && g.pageFlip && g.pageFlip();
    if (!pages || !pf || !g.ouvert || !g.ouvert() || !g.enPartie()) return false;
    const i = g.indexDe(pages.g), ici = pf.getCurrentPageIndex();
    return i >= 0 && (ici === i || ici === i + 1);
}
let abonne = false;
setInterval(() => {
    if (document.hidden) return;
    try {
        if (!abonne && M()) { abonne = true; M().surMission(() => rendre()); }
        const g = G();
        if (!g || typeof g.pagesMission !== "function") return;
        if (ouverte()) enRoute = Date.now();
        else if (g.pagesMission().length && Date.now() - enRoute > 8000) {
            const ta = pages && pages.d.querySelector(".notes-mission");
            if (ta && ta.dataset.mode === "ecrit") enregistrerNotes(ta.value);
            g.definirMission([]);
        }
    } catch (e) { console.warn("Le livre : la mission en cours", e); }
}, 1000);
// (v457) Le parchemin suit la double page (posé dès qu'on y arrive, retiré dès qu'on la quitte) ;
// la fiche d'une mission accomplie sur un autre poste arrive après coup.
setInterval(() => { if (!document.hidden && pages) { try { majParchemin(); } catch (e) {} } }, 250);
window.addEventListener("missions-terminees", () => { if (pages) rendre(); });

window.GRIMOIRE_MISSION = { ouvrir, ouverte, rendre, htmlGauche, htmlDroite, pages: () => (pages ? [pages.g, pages.d] : []) };
