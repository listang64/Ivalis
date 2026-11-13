// =========================================================================
//  IVALIS — LES COMBATS DANS LE LIVRE (v388)
// =========================================================================
//  Nico : « quand on clique sur Combat dans le menu, ça ouvre une popup. Crée
//  une double page juste pour ça : à gauche le contenu de la popup, à droite ce
//  qui s'ouvre pendant la création de la map avec l'avancement. Y mettre la
//  validation des belligérants, visible par tous. Et quand la carte est prête,
//  un bouton dans le même style que le livre pour rejoindre le combat. »
//
//    · À GAUCHE : « Les combats » — le combat du récit de la partie (rien, il se
//      prépare, il fait rage, il s'achève), l'arène d'entraînement (fermée tant
//      que le combat du récit n'est pas fini) et, en mode DEV, lancer ou
//      abandonner un combat du récit. Les mêmes fonctions que la popup
//      (combat.js, combat_rp.js) : seulement écrites dans le livre.
//    · À DROITE : « Le champ de bataille » — pendant la préparation, ses étapes
//      (cochées une à une), le lieu, et la liste des belligérants à garder ou
//      écarter, que tout le monde voit et que n'importe qui valide ; validés, la
//      liste reste lisible par tous (et qui l'a validée). La carte prête (le
//      combat commence), un bouton tracé à la main, à l'aquarelle : « Rejoindre
//      le combat ».
//
//  La popup reste en secours, hors du livre (combat.js) ; en partie, le menu
//  Combat, le bouton qui flotte et la note du récit mènent ici tant que le
//  combat se prépare.
// =========================================================================

const G = () => window.GRIMOIRE;
const D = () => (window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.dessins) || {};
const lavis = (...a) => (D().lavis ? D().lavis(...a) : "");
const cadre = (g, amp) => (D().cadre ? D().cadre(g, amp) : "");
const L = () => window.combatRPLivre || null;
const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const son = () => { try { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); } catch (e) {} };
const modeDev = () => { try { return localStorage.getItem("ivalis_DEV_MODE") === "on"; } catch (e) { return false; } };
const FLEURON = `<svg class="fleuron fleuron-combats" viewBox="0 0 200 24" aria-hidden="true"><path d="M 8 12 C 40 4 70 4 92 12 M 108 12 C 130 4 160 4 192 12 M 92 12 C 96 6 104 6 108 12 C 104 18 96 18 92 12 Z"/><circle cx="100" cy="12" r="2.2"/></svg>`;
// Deux lames croisées, à la plume (l'emblème de la page de gauche).
const LAMES = `<svg class="lames-combats" viewBox="0 0 60 60" aria-hidden="true"><path d="M10 50 L44 12 L50 10 L48 16 L14 54 Z M14 42 L22 50 M8 52 l4 4"/><path d="M50 50 L16 12 L10 10 L12 16 L46 54 Z M46 42 L38 50 M52 52 l-4 4"/></svg>`;
const TEINTE_SANG = { couleurs: ["#9b2c22", "#c0503a", "#7a1d14"], opacite: 0.42, nom: "combat" };
const TEINTE_ARENE = { couleurs: ["#b8923a", "#d4b25a", "#8f6d24"], opacite: 0.36, nom: "arene" };

let pages = null;                  // { g, d }
const ecartes = new Map();         // idCombat → { depart: Set, renforts: Set } : ceux qu'on a décochés ici
const sig = { g: "", d: "", ennemis: "" };

function creer() {
    if (pages) return pages;
    const page = (cote) => { const el = document.createElement("div"); el.className = `page-grimoire page-papier ${cote} page-fiches page-combats`; el.id = "grimoire-combats-" + cote[0]; return el; };
    pages = { g: page("gauche"), d: page("droite") };
    return pages;
}
function poser() {
    const g = G();
    if (!g || typeof g.definirCombats !== "function" || !g.enPartie || !g.enPartie()) return;
    const { g: pg, d: pd } = creer();
    const avant = g.pagesCombats();
    if (avant.length === 2 && avant[0] === pg && avant[1] === pd) return;
    g.definirCombats([pg, pd]);
}

// ---------------------------------------------------------------------
//  LA PAGE DE GAUCHE : le contenu de la popup
// ---------------------------------------------------------------------
function etatDuCombat() {
    const l = L(), c = l ? l.etat() : null;
    const actif = !!c && ["preparation", "en_cours", "narration"].includes(c.Etat);
    return { c: actif ? c : null, actif, prepare: actif && c.Etat === "preparation", enCours: actif && c.Etat === "en_cours", fin: actif && c.Etat === "narration" };
}
function htmlGauche() {
    const e = etatDuCombat(), c = e.c;
    const texte = !c ? "Aucun combat en cours dans cette partie."
        : e.prepare ? `Le champ de bataille se prépare…${c.Adversaires ? `<br><em>${echapper(c.Adversaires)}</em>` : ""}`
        : e.enCours ? `La bataille fait rage${c.Lieu && c.Lieu.Titre ? ` — ${echapper(c.Lieu.Titre)}` : ""}.`
        : "Le combat s'achève : le récit reprend…";
    const dev = modeDev() ? `<div class="dev-combats">${e.actif
        ? `<button type="button" class="lien-fiche dev-combat" data-action="combats" data-cb="abandonner">[DEV] Abandonner le combat du récit</button>`
        : `<button type="button" class="lien-fiche dev-combat" data-action="combats" data-cb="forcer">[DEV] Lancer un combat du récit</button>`}</div>` : "";
    return `<div class="contenu-page page-combats-gauche">
        <div class="entete-combats">${LAMES}<span class="titre-page-fiche">Les combats</span></div>
        ${FLEURON}
        <div class="encart-fiche encart-combat-livre${c ? " vivant" : " eteint"}" data-action="combats" data-cb="combat-en-cours">
          ${lavis(c ? TEINTE_SANG : "gris", "combat-en-cours")}${cadre("combat-en-cours", 1.3)}
          <div class="titre-encart-combats">Combat en cours</div>
          <div class="texte-encart-combats">${texte}</div>
          ${e.enCours ? `<div class="appel-encart-combats">Rejoindre le combat ›</div>` : e.prepare ? `<div class="appel-encart-combats">Suivre sa préparation ›</div>` : ""}
        </div>
        <div class="encart-fiche encart-arene-livre${e.actif ? " eteint" : ""}" data-action="combats" data-cb="arene">
          ${lavis(e.actif ? "gris" : TEINTE_ARENE, "arene")}${cadre("arene", 1.3)}
          <div class="titre-encart-combats">L'arène de combat</div>
          <div class="texte-encart-combats">L'arène d'entraînement : la fenêtre de combat, ses outils et ses rencontres.</div>
          ${e.actif ? `<div class="note-encart-combats">Fermée tant que le combat du récit n'est pas terminé.</div>` : `<div class="appel-encart-combats">Entrer dans l'arène ›</div>`}
        </div>
        ${dev}
      </div>`;
}

// ---------------------------------------------------------------------
//  LA PAGE DE DROITE : la préparation, les belligérants, le bouton
// ---------------------------------------------------------------------
const CASE = (coche) => `<svg class="case-belligerant" viewBox="0 0 24 24" aria-hidden="true"><path class="boite" d="M 4 5 Q 12 3.6 20 4.6 L 19.4 19.6 Q 12 20.6 4.6 19.4 Z"/>${coche ? `<path class="coche" d="M 7 12.5 L 10.6 16 L 18 7"/>` : ""}</svg>`;
const ecartesDe = (c) => { if (!ecartes.has(c.Id)) ecartes.set(c.Id, { depart: new Set(), renforts: new Set() }); return ecartes.get(c.Id); };
function htmlBelligerants(c, aValider) {
    const l = L(), roles = (l && l.roles) || {};
    const t = (c.Ennemis || {}).Tirage || {}, ec = ecartesDe(c);
    const ligne = (m, i, groupe) => {
        const garde = !aValider || !ec[groupe].has(i);
        const role = `${echapper(roles[m.archetype] || m.archetype || "")}${m.leader ? " · chef" : ""}`;
        return aValider
            ? `<li><button type="button" class="belligerant${garde ? "" : " ecarte"}" data-action="combats" data-cb="garder" data-groupe="${groupe}" data-i="${i}" aria-pressed="${garde}">
                 ${CASE(garde)}<span class="nom-belligerant">${echapper(m.nom || "")}</span><span class="role-belligerant">${role}</span></button></li>`
            : `<li class="belligerant fixe"><span class="nom-belligerant">${echapper(m.nom || "")}</span><span class="role-belligerant">${role}</span></li>`;
    };
    const depart = (t.depart || []).map((m, i) => ligne(m, i, "depart")).join("") || `<li class="vide"><i>personne</i></li>`;
    const renforts = (t.renforts || []).map((m, i) => ligne(m, i, "renforts")).join("") || `<li class="vide"><i>aucun renfort</i></li>`;
    const v = c.Ennemis_Valides;
    return `<div class="belligerants-livre">
        <div class="titre-belligerants">Qui vous fait face ?</div>
        ${aValider ? `<p class="aide-belligerants">Décochez ceux que vous ne voulez pas dans ce combat, puis validez : les pions des autres seront dessinés. Tout le monde voit cette liste ; un seul suffit pour valider.</p>`
                   : `<p class="aide-belligerants">Validés${v && v.Nom ? ` par <strong>${echapper(v.Nom)}</strong>` : ""}${v && v.Retires ? ` (${v.Retires} écarté${v.Retires > 1 ? "s" : ""})` : ""}.</p>`}
        <div class="colonnes-belligerants">
          <div><div class="sous-titre-belligerants">Au départ</div><ul>${depart}</ul></div>
          <div><div class="sous-titre-belligerants">En renfort</div><ul>${renforts}</ul></div>
        </div>
        ${aValider ? `<p class="note-belligerants" id="note-belligerants-livre"></p>
        <div class="boutons-belligerants">
          <button type="button" class="lien-fiche relancer-belligerants" data-action="combats" data-cb="relancer">Tirer d'autres ennemis</button>
          <button type="button" class="bouton-encre-combats" data-action="combats" data-cb="valider">${cadre("valider-belligerants", 1.1)}<span>Valider</span></button>
        </div>` : ""}
      </div>`;
}
function htmlDroite() {
    const e = etatDuCombat(), c = e.c, l = L();
    if (!c) return `<div class="contenu-page page-combats-droite">
        <div class="entete-fiche entete-champ"><span class="titre-page-fiche">Le champ de bataille</span></div>${FLEURON}
        <p class="fiche-attente attente-champ">Aucun combat ne se prépare. Quand le récit mènera au combat, sa carte se dessinera ici, étape par étape.</p></div>`;
    if (e.fin) return `<div class="contenu-page page-combats-droite">
        <div class="entete-fiche entete-champ"><span class="titre-page-fiche">Le champ de bataille</span></div>${FLEURON}
        <p class="fiche-attente attente-champ">Le combat s'achève : le récit reprend…</p></div>`;
    const etapes = l ? l.etapes(c) : [];
    const lieu = c.Lieu && c.Lieu.Titre ? c.Lieu.Titre : (l ? l.motAttente() : "");
    const aValider = e.prepare && !!c.Ennemis && !c.Ennemis_Valides;
    const titre = e.enCours ? "Le champ de bataille est prêt" : c.Carte ? "Les ennemis se préparent…" : "Création du champ de bataille…";
    return `<div class="contenu-page page-combats-droite defile-fiche">
        <div class="entete-fiche entete-champ"><span class="titre-page-fiche">${titre}</span></div>${FLEURON}
        <div class="lieu-champ">${echapper(lieu)}</div>
        ${e.prepare ? `<ol class="etapes-champ">${etapes.map(x => `<li class="${x.fait ? "fait" : ""}">${CASE(x.fait)}<span>${echapper(x.nom)}</span></li>`).join("")}</ol>` : ""}
        ${c.Ennemis ? `<div class="place-belligerants" data-valider="${aValider ? 1 : 0}">${htmlBelligerants(c, aValider)}</div>` : ""}
        ${e.enCours ? `<button type="button" class="bouton-rejoindre-livre" data-action="combats" data-cb="rejoindre">${lavis(TEINTE_SANG, "rejoindre")}${cadre("rejoindre", 1.5)}${LAMES}<span>Rejoindre le combat</span></button>` : ""}
      </div>${(window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.FLECHE_DEFILE) || ""}`;
}

// ---------------------------------------------------------------------
//  LA MISE À JOUR : seulement ce qui a changé ; la liste à valider n'est
//  pas réécrite sous les doigts de celui qui décoche.
// ---------------------------------------------------------------------
function maj(force) {
    if (!pages) return;
    const e = etatDuCombat(), c = e.c;
    const sg = JSON.stringify([c && [c.Etat, c.Adversaires, c.Lieu && c.Lieu.Titre], modeDev()]);
    if (force || sg !== sig.g) { sig.g = sg; pages.g.innerHTML = htmlGauche(); }
    const etapes = c && L() ? L().etapes(c).map(x => x.fait) : null;
    const sd = JSON.stringify([c && [c.Id, c.Etat, !!c.Carte, c.Lieu && c.Lieu.Titre, c.Ennemis, c.Ennemis_Valides], etapes, c && !c.Lieu ? Math.floor(Date.now() / 6000) : 0]);
    if (force || sd !== sig.d) { sig.d = sd; pages.d.innerHTML = htmlDroite(); }
}

// ---------------------------------------------------------------------
//  LES GESTES
// ---------------------------------------------------------------------
async function agir(cible) {
    const cb = cible.dataset.cb, e = etatDuCombat(), c = e.c;
    if (cb === "combat-en-cours") {
        if (e.enCours) { son(); window.rejoindreCombatRP && window.rejoindreCombatRP(); }
        return;
    }
    if (cb === "arene") { if (!e.actif && typeof window.validerPopupRencontre === "function") window.validerPopupRencontre(); return; }
    if (cb === "forcer") { if (typeof window.forcerCombatRP === "function") await window.forcerCombatRP(); maj(true); return; }
    if (cb === "abandonner") { if (typeof window.abandonnerCombatRP === "function") await window.abandonnerCombatRP(); maj(true); return; }
    if (cb === "rejoindre") { son(); if (typeof window.rejoindreCombatRP === "function") window.rejoindreCombatRP(); return; }
    if (!c || !e.prepare) return;
    if (cb === "garder") {
        son();
        const ec = ecartesDe(c), g = cible.dataset.groupe, i = Number(cible.dataset.i);
        if (ec[g].has(i)) ec[g].delete(i); else ec[g].add(i);
        const garde = !ec[g].has(i);
        cible.classList.toggle("ecarte", !garde);
        cible.setAttribute("aria-pressed", String(garde));
        const svg = cible.querySelector(".case-belligerant");
        if (svg) svg.outerHTML = CASE(garde);
        return;
    }
    if (cb === "valider") {
        if (typeof window.validerEnnemisCombatRP !== "function") return;
        const ok = await window.validerEnnemisCombatRP(ecartesDe(c));
        if (!ok) { const n = document.getElementById("note-belligerants-livre"); if (n) n.textContent = "Gardez au moins un adversaire au départ."; }
        maj(true);
        return;
    }
    if (cb === "relancer") { ecartes.delete(c.Id); if (typeof window.relancerEnnemisCombatRP === "function") await window.relancerEnnemisCombatRP(); maj(true); }
}

// ---------------------------------------------------------------------
//  ALLER AUX COMBATS
// ---------------------------------------------------------------------
function ouvrir() {
    const g = G();
    if (!g || !g.enPartie || !g.enPartie() || typeof g.definirCombats !== "function") return false;
    poser();
    maj(true);
    const aller = (essai) => {
        const i = g.indexDe(pages.g);
        if (i < 0) { if (essai < 30) setTimeout(() => aller(essai + 1), 100); return; }
        g.allerALaPage(i);
    };
    aller(0);
    return true;
}
// La double page des combats est-elle ouverte sous les yeux du joueur ?
function ouverte() {
    const g = G(), pf = g && g.pageFlip && g.pageFlip();
    if (!pages || !pf || !g.ouvert || !g.ouvert() || !g.enPartie()) return false;
    const i = g.indexDe(pages.g), ici = pf.getCurrentPageIndex();
    return i >= 0 && (ici === i || ici === i + 1);
}

// La veille : en partie, la double page est dans le livre et suit le combat.
setInterval(() => {
    if (document.hidden) return;
    try {
        const g = G();
        if (!g || !g.enPartie || !g.enPartie()) return;
        poser();
        maj();
    } catch (e) { console.warn("Le livre : les combats", e); }
}, 500);

window.GRIMOIRE_COMBATS = { ouvrir, ouverte, agir, maj: () => maj(), pages: () => (pages ? [pages.g, pages.d] : []) };
