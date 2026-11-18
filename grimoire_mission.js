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
const NOMS_RANGS = { A: "Rang A", B: "Rang B", C: "Rang C" };

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
function htmlGauche(d) {
    if (!d || !d.Mission) return `<div class="contenu-page page-mission-vide"><div class="titre-mission-en-cours">Mission en cours</div>${FLEURON}
        <p class="aucune-mission">Aucune mission en cours.</p>
        <p class="aide-mission">Le panneau des missions, au Hall de guilde d'Eraldur, en propose.</p></div>`;
    const m = d.Mission, av = d.Avancement || {}, journal = liste(av.Journal), indices = liste(av.Indices);
    const v = d.Vote_Abandon, moi = M() ? M().idJoueur() : "";
    const oui = v ? liste(v.Votants).filter(x => (v.Votes || {})[x.id] === "oui").length : 0;
    const abandon = !v
        ? `<button type="button" class="lien-fiche bouton-abandon" data-mi="abandon-oui">Voter pour abandonner la mission</button>`
        : `<div class="vote-abandon"><p><b>${echapper((v.Initiateur || {}).nom || "Un joueur")}</b> propose d'abandonner la mission (${oui}/${liste(v.Votants).length}).</p>
            ${(v.Votes || {})[moi] === "oui" ? `<p class="discret">En attente des autres joueurs.</p>` : `<button type="button" class="lien-fiche" data-mi="abandon-oui">J'accepte</button>`}
            <button type="button" class="lien-fiche discret" data-mi="abandon-non">Non, on continue</button></div>`;
    return `<div class="contenu-page page-mission-infos defile-fiche">
        <div class="rang-mission-en-cours rang-${echapper(m.Rang)}">${echapper(NOMS_RANGS[m.Rang] || m.Rang)}</div>
        <div class="titre-mission-en-cours">${echapper(m.Titre)}</div>
        ${FLEURON}
        <dl class="faits-mission-en-cours">
          <div><dt>Commanditaire</dt><dd>${echapper(m.Commanditaire)}</dd></div>
          <div><dt>Région</dt><dd>${echapper(m.Region_Nom)}</dd></div>
          <div><dt>Lieu</dt><dd>${echapper(m.Lieu && m.Lieu.Nom)}${m.Lieu && m.Lieu.Type ? ` <em>(${echapper(m.Lieu.Type)})</em>` : ""}</dd></div>
        </dl>
        <div class="sous-titre-mission">L'objectif</div><p class="objectif-en-cours">${echapper(m.Objectif)}</p>
        <div class="sous-titre-mission">Ce qu'on en sait</div><p>${echapper(m.Details)}</p>
        ${indices.length ? `<div class="sous-titre-mission">Les indices</div><ul class="indices-mission">${indices.map(x => `<li>${echapper(x)}</li>`).join("")}</ul>` : ""}
        ${journal.length ? `<div class="sous-titre-mission">Ce qui s'est passé</div><ul class="journal-mission">${journal.slice(-8).map(x => `<li>${echapper(x.Texte)}</li>`).join("")}</ul>` : ""}
        <div class="abandon-mission">${abandon}</div>
      </div>`;
}
function htmlDroite(d) {
    const avec = !!(d && d.Mission);
    return `<div class="contenu-page page-mission-notes">
        <div class="titre-notes-mission">Nos notes</div>
        <textarea class="notes-mission" spellcheck="false" ${avec ? "" : "disabled"}
          placeholder="${avec ? "Écrivez ici ce que vous voulez retenir de la mission…" : "Les notes s'ouvriront avec une mission."}">${echapper(avec ? (d.Notes || "") : "")}</textarea>
      </div>`;
}
let rendu = "";
export function rendre() {
    if (!pages) return;
    const d = M() ? M().lireMission() : null;
    const ta = pages.d.querySelector(".notes-mission");
    const enEcriture = ta && document.activeElement === ta;
    const sigG = JSON.stringify([d && d.Mission && d.Mission.Id, d && d.Avancement, d && d.Vote_Abandon, M() && M().idJoueur()]);
    if (sigG !== rendu) { pages.g.innerHTML = htmlGauche(d); rendu = sigG; }
    // Les notes des autres arrivent ; celles qu'on est en train d'écrire ne sont pas écrasées.
    if (!ta || !!(d && d.Mission) !== !ta.disabled) pages.d.innerHTML = htmlDroite(d);
    else if (!enEcriture && d && d.Mission && ta.value !== (d.Notes || "")) ta.value = d.Notes || "";
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
            if (ta && !ta.disabled) enregistrerNotes(ta.value);
            g.definirMission([]);
        }
    } catch (e) { console.warn("Le livre : la mission en cours", e); }
}, 1000);

window.GRIMOIRE_MISSION = { ouvrir, ouverte, rendre, pages: () => (pages ? [pages.g, pages.d] : []) };
