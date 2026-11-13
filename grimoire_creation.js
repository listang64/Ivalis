// =========================================================================
//  IVALIS — LA CRÉATION D'UN HÉROS DANS LE LIVRE (v319)
// =========================================================================
//  Nico : « on va intégrer la création de personnage dans le livre ».
//  « + Un nouvel aventurier » (la page du clan) ouvre, juste après les clans,
//  des pages ÉPHÉMÈRES (elles disparaissent une fois le héros créé, ou si l'on
//  y renonce) :
//
//    · LES PEUPLES : une double page par race — à gauche tout ce qu'on en sait
//      (le lore, ce qu'elle apporte en jeu, son atout) et le choix du genre qui
//      la choisit ; à droite rien pour l'instant (les images viendront) ;
//    · LES CLASSES : une double page par classe — l'image de fond de la classe
//      sur toute la double page, voilée en dégradé sous le texte de gauche (le
//      descriptif, les paliers, le choix) ;
//    · sur le bord droit du livre, de petits marque-pages au nom de chaque race
//      (puis de chaque classe), à l'aquarelle de sa couleur, pas tous alignés :
//      un toucher mène à sa page ; seuls ceux de la partie où l'on est sortent ;
//    · LE COMPAGNON DU PISTEUR : une double page à lui (son nom, son allure), et
//      à droite un loup à la plume, en emblème ;
//    · LES CHAMPS À REMPLIR : deux doubles pages (l'identité ; le visage ; le
//      corps ; l'équipement de départ) ;
//    · LA NAISSANCE : à gauche le portrait qui se dessine (la barre et les
//      phrases d'attente), à droite la répartition des caractéristiques.
//
//  Rien de la création elle-même ne change : les champs, les boutons de la
//  répartition, la barre et ses phrases sont ceux de l'ancienne fenêtre,
//  RANGÉS dans le livre le temps de la création (comme la Forge), et les mêmes
//  fonctions écrivent le héros (creation_personnage.js, classes.js, app.js).
//  L'ancienne fenêtre reste en secours, hors du livre.
// =========================================================================

const G = () => window.GRIMOIRE;
const F = () => window.GRIMOIRE_FICHES;
const D = () => (F() && F().dessins) || {};
const lavis = (...a) => (D().lavis ? D().lavis(...a) : "");
const cadre = (g, amp) => (D().cadre ? D().cadre(g, amp) : "");
const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const son = () => { try { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); } catch (e) {} };
const modeDev = () => { try { return localStorage.getItem("ivalis_DEV_MODE") === "on"; } catch (e) { return false; } };
const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function hasard(graine) {
    let s = 2166136261 >>> 0;
    for (const c of String(graine)) { s ^= c.charCodeAt(0); s = Math.imul(s, 16777619) >>> 0; }
    return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// LES COULEURS (Nico : « une couleur aquarelle correspondant à cette race »).
const COULEURS_RACES = {
    "Humain": "#c09a52", "Ondari": "#3f8f8a", "Vargen": "#9a5a2e", "Ankylar": "#b8452a",
    "Ophior": "#6b8f3e", "Gob": "#a3a836", "Ethéré": "#9b86c4"
};
// LES FONDS DES PEUPLES (v339). Nico : « on applique les fonds d'images des pages des
// races, comme pour les pages des classes, avec le même dégradé sur les pages de gauche ».
const CLOUD = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/";
const FONDS_RACES = {
    "Humain":  CLOUD + "v1794172729/IMG_2249_jpyc1w.png",
    "Ankylar": CLOUD + "v1794172729/IMG_2250_wackd6.png",
    "Ethéré":  CLOUD + "v1794172729/IMG_2251_k796su.png",
    "Gob":     CLOUD + "v1794172728/IMG_2252_l9cpn9.png",
    "Ondari":  CLOUD + "v1794172728/IMG_2253_ldiw3i.png",
    "Ophior":  CLOUD + "v1794172728/IMG_2254_exllln.png",
    "Vargen":  CLOUD + "v1794172728/IMG_2255_b6q4ex.png"
};
const fondRace = (r) => (r && (r.imageFond || FONDS_RACES[r.nom] || FONDS_RACES[sansAccent(r.nom).replace(/^\w/, c => c.toUpperCase())])) || "";
// Le fond sur la double page : à gauche voilé en dégradé sous le texte, à droite entier
// (les mêmes calques que les classes, grimoire_creation.css).
// (v341) L'adresse attend dans data-src : prechargerAutour() la pose à l'avance (voir plus bas).
const htmlFond = (url, cote) => url ? `<div class="fond-classe ${cote}" aria-hidden="true"><img data-src="${echapper(url)}" alt="" draggable="false" decoding="async"></div>` : "";
window.FONDS_RACES_LIVRE = FONDS_RACES;
const COULEURS_CLASSES = {
    "Pisteur": "#5f7d3a", "Assassin": "#4f4f5a", "Chasseur de mages": "#4f6d8a", "Sentinelle": "#b0884a",
    "Profanateur": "#6b2e4a", "Géomancien": "#8a6a3e", "Protecteur": "#a87a3a", "Oracle": "#c4ac52",
    "Vampire": "#8a1f2a", "Sorcier": "#5a3f7a", "Médicus": "#4f9a84",
    // (v343) les nouvelles classes
    "Inquisiteur": "#7a5a2a", "Chaman": "#4f7a4a", "Berzerker": "#9a3a24", "Maudit": "#3f3a5a", "Prêtre de la lumière": "#c8a640"
};
const nuance = (hex, f) => {
    const n = parseInt(String(hex).slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return "#" + c.map(v => Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f)).toString(16).padStart(2, "0")).join("");
};
const teinteDe = (hex, nom, opacite) => ({ couleurs: [hex, nuance(hex, 0.25), nuance(hex, -0.2)], opacite: opacite || 0.38, nom });
const pluriel = (race) => /s$/.test(race) ? race : race + "s";

// ---------------------------------------------------------------------
//  L'ÉTAT
// ---------------------------------------------------------------------
let actif = false;
let pages = [];                 // les pages éphémères, dans l'ordre
const pg = {};                  // clé → page
let sections = { races: [], classes: [] };   // [{ cle, nom, page }]
let avecCompagnon = false;
let onglets = null;             // le conteneur des marque-pages du bord droit
const ranges = new Map();       // élément rangé dans le livre → { parent, suivant }
const crochets = {};            // les fonctions d'origine, le temps de la création

function page(cle, cote, classe) {
    const el = document.createElement("div");
    el.className = `page-grimoire page-papier ${cote} page-fiches page-creation ${classe || ""}`;
    el.id = "grimoire-creation-" + cle;
    pg[cle] = el;
    return el;
}
const aller = (el) => { if (el && F() && F().aller) { chargerFonds(el); F().aller(el); } };
function ranger(el, dans) {
    if (!el || !dans) return;
    if (!ranges.has(el)) ranges.set(el, { parent: el.parentNode, suivant: el.nextSibling });
    dans.appendChild(el);
}
// LES IMAGES DE FOND EN AVANCE (v341). Nico : « les images des races et des classes
// mettent du temps à arriver : la page est ouverte quand on voit l'image apparaître ;
// charge l'image de la page d'avant et d'après pour que ce soit fluide ». En lazy, le
// navigateur ne les demandait qu'une fois la page visible. Elles se chargent (et se
// décodent) maintenant pour la double page ouverte, la précédente et la suivante ; un
// saut par marque-page charge d'abord celle d'arrivée.
function chargerFonds(el) {
    if (!el) return;
    const i = pages.indexOf(el), paire = i < 0 ? [el] : [pages[i - (i % 2)], pages[i - (i % 2) + 1]];
    paire.forEach(pageEl => pageEl && pageEl.querySelectorAll("img[data-src]").forEach(img => {
        if (img.getAttribute("src") === img.dataset.src) return;
        img.src = img.dataset.src;
        if (typeof img.decode === "function") img.decode().catch(() => {});
    }));
}
function prechargerAutour() {
    const g = G(), pf = g && g.pageFlip && g.pageFlip();
    if (!actif || !pf || typeof g.indexDe !== "function") return;
    const ici = pf.getCurrentPageIndex();
    // La double page ouverte, puis la suivante et la précédente (deux pages de part et d'autre).
    [0, 2, -2, 3, -1, 1].forEach(d => { const el = pages.find(p => g.indexDe(p) === ici + d); if (el) chargerFonds(el); });
}
function toutRemettre() {
    [...ranges.entries()].reverse().forEach(([el, o]) => {
        try { if (o.parent) o.parent.insertBefore(el, o.suivant && o.suivant.parentNode === o.parent ? o.suivant : null); } catch (e) {}
    });
    ranges.clear();
}

// ---------------------------------------------------------------------
//  LES PEUPLES
// ---------------------------------------------------------------------
const FLEURON = `<svg class="fleuron fleuron-creation" viewBox="0 0 200 24" aria-hidden="true"><path d="M 8 12 C 40 4 70 4 92 12 M 108 12 C 130 4 160 4 192 12 M 92 12 C 96 6 104 6 108 12 C 104 18 96 18 92 12 Z"/><circle cx="100" cy="12" r="2.2"/></svg>`;
// (v365, Nico : « virer le se cherche dans le sexe des races ».)
const GENRES = [["Male", "Mâle"], ["Femelle", "Femelle"]];
// (v387, Nico : « enlève sur toutes les pages Renoncer à ce héros, il y a déjà
// les marque-pages si les joueurs veulent suspendre leur création ».)

function htmlRace(r, i, n) {
    const choisi = window.RACE_SELECTIONNEE_TEMP === r.nom && actif && etat.raceChoisie;
    return `${htmlFond(fondRace(r), "gauche")}<div class="contenu-page page-texte-creation page-texte-race defile-fiche">
        <div class="sur-titre-creation">Les peuples d'Ivalis <span>· ${i + 1} / ${n}</span></div>
        <h2 class="titre-creation">Les ${echapper(pluriel(r.nom))}</h2>
        ${FLEURON}
        <p class="lore-creation">${echapper(r.description)}</p>
        <div class="encart-creation encart-jeu-race">${lavis(teinteDe(COULEURS_RACES[r.nom] || "#a08060", "race", 0.22), "race-jeu-" + r.nom)}${cadre("race-jeu-" + r.nom, 1.2)}
          <div class="titre-encart-creation">En jeu</div>
          <div class="gameplay-creation">${r.gameplay || ""}</div>
        </div>
        <div class="choix-genre-creation">
          <div class="consigne-creation">Choisir ce peuple :</div>
          <div class="boutons-genre">${GENRES.map(([v, t]) => `<button type="button" class="bouton-encre${choisi && window.GENRE_SELECTIONNE_TEMP === v ? " choisi" : ""}" data-action="creation" data-ca="race" data-race="${echapper(r.nom)}" data-genre="${echapper(v)}">${cadre("genre-" + r.nom + v, 1.1)}<span>${t}</span></button>`).join("")}</div>
        </div>
      </div>`;
}
// La page de droite d'un peuple : la suite de son image de fond (v339).
const htmlRaceDroite = (r) => `${htmlFond(fondRace(r), "droite")}<div class="contenu-page page-race-vide"></div>`;

// ---------------------------------------------------------------------
//  LES CLASSES
// ---------------------------------------------------------------------
const listeClasses = () => (window.CLASSES_CACHE || window.CLASSES_PAR_DEFAUT || []).slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
const nomAffiche = (c) => (typeof window.nomClasseGenre === "function" ? window.nomClasseGenre(c.nom, window.GENRE_SELECTIONNE_TEMP) : c.nom) || c.nom;
function etatClasse(c) {
    const race = window.RACE_SELECTIONNEE_TEMP || "";
    if (typeof window.classeBientot === "function" && window.classeBientot(c)) return { bloquee: true, raison: "Cette classe arrive bientôt." };
    if (race && typeof window.classeInterditeA === "function" && window.classeInterditeA(race, c.nom)) return { bloquee: true, raison: `Les ${pluriel(race)} ne peuvent pas être ${nomAffiche(c)}.` };
    return { bloquee: false };
}
function htmlClasseGauche(c, i, n) {
    const e = etatClasse(c);
    const fond = c.imageFond || c.imageTarot || "";
    const descriptif = typeof window.rendreDescriptifClasse === "function" ? window.rendreDescriptifClasse(c.id) : "";
    const choisie = window.CLASSE_SELECTIONNEE_TEMP === c.nom;
    return `${htmlFond(fond, "gauche")}
      <div class="contenu-page page-texte-creation page-texte-classe defile-fiche">
        <div class="sur-titre-creation">Les classes <span>· ${i + 1} / ${n}</span></div>
        <h2 class="titre-creation">${echapper(nomAffiche(c))}</h2>
        ${FLEURON}
        <div class="descriptif-creation">${descriptif || `<p class="lore-creation">Son histoire reste à écrire.</p>`}</div>
        <div class="choix-classe-creation">
          ${e.bloquee ? `<p class="classe-bloquee">${echapper(e.raison)}</p>`
            : `<button type="button" class="bouton-encre grand${choisie ? " choisi" : ""}" data-action="creation" data-ca="classe" data-classe="${echapper(c.id)}">${cadre("classe-" + c.id, 1.2)}<span>Choisir cette classe</span></button>`}
        </div>
      </div>${flecheDefile()}`;
}
const htmlClasseDroite = (c) => {
    const fond = c.imageFond || c.imageTarot || "";
    return `${htmlFond(fond, "droite")}<div class="contenu-page"></div>`;
};

// ---------------------------------------------------------------------
//  LE COMPAGNON DU PISTEUR
// ---------------------------------------------------------------------
// Un loup à la plume, en emblème (Nico : « un dessin symbole animal joli en déco »).
const LOUP = `<svg class="embleme-loup" viewBox="0 0 200 220" aria-hidden="true">
  <circle class="anneau" cx="100" cy="104" r="92"/><circle class="anneau fin" cx="100" cy="104" r="85"/>
  ${Array.from({ length: 8 }, (_, i) => {
      // Une branche par côté, du bas vers le haut, chaque feuille couchée
      // le long de l'anneau (la tangente) et un peu ouverte vers l'extérieur.
      const a = Math.PI * (0.47 - i * 0.05), x = 100 - 96 * Math.cos(a), y = 104 + 96 * Math.sin(a);
      const r = (90 - a * 180 / Math.PI) + 28;
      return `<ellipse class="feuille-laurier" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="7" ry="2.6" transform="rotate(${r.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`
        + `<ellipse class="feuille-laurier" cx="${(200 - x).toFixed(1)}" cy="${y.toFixed(1)}" rx="7" ry="2.6" transform="rotate(${(-r).toFixed(0)} ${(200 - x).toFixed(1)} ${y.toFixed(1)})"/>`; }).join("")}
  <path class="tete" d="M62 40 L88 70 C94 66 106 66 112 70 L138 40 L142 92 C150 108 148 124 138 134 L116 158 C110 164 104 168 100 170 C96 168 90 164 84 158 L62 134 C52 124 50 108 58 92 Z"/>
  <path class="oreille" d="M68 54 L84 74 L72 84 Z M132 54 L116 74 L128 84 Z"/>
  <path class="trait" d="M100 72 L94 90 L100 98 L106 90 Z"/>
  <path class="oeil" d="M76 104 Q86 96 95 104 Q86 109 76 104 Z M124 104 Q114 96 105 104 Q114 109 124 104 Z"/>
  <circle class="pupille" cx="87" cy="104" r="2.4"/><circle class="pupille" cx="113" cy="104" r="2.4"/>
  <path class="trait" d="M88 124 Q100 117 112 124 M100 112 L100 136"/>
  <path class="truffe" d="M93 138 Q100 133 107 138 Q100 147 93 138 Z"/>
  <path class="trait" d="M100 146 L100 152 M92 154 Q100 160 108 154"/>
  <path class="poil" d="M60 116 l-12 5 M61 124 l-11 9 M64 132 l-8 10 M140 116 l12 5 M139 124 l11 9 M136 132 l8 10 M78 150 l-4 9 M122 150 l4 9 M84 80 l-6 -3 M116 80 l6 -3"/>
  <path class="hachure" d="M66 96 l8 -6 M64 102 l9 -6 M64 108 l7 -5 M136 96 l-8 -6 M136 102 l-9 -6 M136 108 l-7 -5 M90 160 l4 3 M110 160 l-4 3"/>
  <path class="etoile" d="M100 22 l2.2 5 5.4 0.4 -4.1 3.5 1.3 5.3 -4.8 -2.9 -4.8 2.9 1.3 -5.3 -4.1 -3.5 5.4 -0.4 Z"/>
</svg>`;
function htmlCompagnonGauche() {
    const deja = window.COMPAGNON_TEMP || {};
    return `<div class="contenu-page page-texte-creation">
        <div class="sur-titre-creation">Le Pisteur ne chasse jamais seul</div>
        <h2 class="titre-creation">Votre compagnon</h2>
        ${FLEURON}
        <p class="lore-creation">Une bête combat à vos côtés : donnez-lui un nom, et dites à quoi elle ressemble. <em>Pas plus grande qu'un cheval.</em></p>
        <label class="champ-creation">Son nom
          <input type="text" id="creation-compagnon-nom" maxlength="40" placeholder="Croc-Gris" value="${echapper(deja.nom)}"></label>
        <label class="champ-creation">À quoi ressemble-t-il ?
          <textarea id="creation-compagnon-description" maxlength="600" rows="5" placeholder="Un grand loup au pelage gris cendré, une oreille déchirée, des yeux ambrés…">${echapper(deja.description)}</textarea></label>
        <p class="erreur-creation" id="creation-compagnon-erreur"></p>
        <button type="button" class="bouton-encre grand" data-action="creation" data-ca="compagnon">${cadre("compagnon", 1.2)}<span>Il me suit</span></button>
      </div>`;
}
const htmlCompagnonDroite = () => `<div class="contenu-page page-embleme">${LOUP}<p class="devise-compagnon">Fidèle jusqu'au dernier souffle</p></div>`;

// ---------------------------------------------------------------------
//  LES CHAMPS À REMPLIR (les blocs de l'ancienne fenêtre, rangés ici)
// ---------------------------------------------------------------------
const BLOCS = [
    ["form1-g", ["identite"], "Qui es-tu ?"],
    ["form1-d", ["visage / tete", "details"], ""],
    ["form2-g", ["physique / corps"], ""],
    ["form2-d", ["equipement de depart"], ""]
];
function pageFormulaire(cle, titre) {
    const el = pg[cle];
    el.innerHTML = `<div class="contenu-page page-formulaire-creation defile-fiche">
        ${titre ? `<div class="sur-titre-creation sur-titre-qui">Le nouvel aventurier</div><h2 class="titre-creation titre-qui">${lavis(TEINTE_OR, "titre-qui")}<span>${titre}</span></h2>${FLEURON}` : ""}
        <div class="blocs-creation"></div>
        ${cle === "form2-d" ? `<div class="actions-creation">
            <button type="button" class="bouton-encre grand" data-action="creation" data-ca="creer">${cadre("creer", 1.2)}<span>Donner vie à ce héros</span></button>
            ${modeDev() ? `<button type="button" class="lien-fiche dev-creation" data-action="creation" data-ca="creer-vite">[DEV] Création rapide (sans IA)</button>` : ""}
          </div>` : ""}
      </div>${cle === "form1-d" ? TOURNER : ""}`;
}
// (v371) Nico : « les titres des parties avec une couleur aquarelle en dessous, comme
// sur les fiches personnages » : le même lavis, une teinte par partie.
// (v387) Nico : « le titre Qui es-tu ? en plus gros et centré, avec une aquarelle dorée en dessous ».
const TEINTE_OR = { couleurs: ["#d9a93a", "#e8c25a", "#b8862a"], opacite: 0.5, nom: "or" };
// (v387) Nico : « si le descriptif est trop grand et qu'il faut descendre, une petite
// flèche qui ne bouge pas en bas de page » : montrée tant qu'il reste à lire
// (grimoire_fiches.js, majFlechesDefile).
const flecheDefile = () => (F() && F().FLECHE_DEFILE) || "";
const TEINTES_TITRES = {
    "identite": "beige", "visage / tete": "rouge", "details": "jaune", "physique / corps": "vert",
    "equipement de depart": "bleu"
};
// (v371) Nico : « sur la première double page, une flèche pour indiquer qu'il faut
// tourner la page pour accéder à la suite du formulaire ». Un toucher la tourne.
const TOURNER = `<button type="button" class="tourner-creation" data-action="creation" data-ca="tourner" aria-label="Tourner la page pour la suite">
    <span>La suite</span>
    <svg viewBox="0 0 80 32" aria-hidden="true"><path d="M4 20 C20 10 40 26 58 15 L70 10"/><path d="M60 4 L71 10 L62 19"/></svg>
  </button>`;
function rangerFormulaire() {
    const modale = document.getElementById("modale-creation-hero");
    if (!modale) return;
    const blocs = [...modale.querySelectorAll(".bloc-formulaire")];
    const parTitre = (t) => blocs.find(b => sansAccent((b.querySelector("h4") || {}).textContent || "").trim() === t);
    BLOCS.forEach(([cle, titres]) => {
        const ici = pg[cle] && pg[cle].querySelector(".blocs-creation");
        titres.forEach(t => {
            const b = parTitre(t);
            if (!b || !ici) return;
            ranger(b, ici);
            const h4 = b.querySelector("h4");
            if (h4 && !h4.querySelector(":scope > .lavis")) h4.insertAdjacentHTML("afterbegin", lavis(TEINTES_TITRES[t] || "beige", "titre-creation-" + t));
        });
    });
}
// L'ancienne fenêtre remettait ses champs à zéro elle-même ; rangés ici, ils
// sont remis à zéro ici, avant que ouvrirEtapeIdentite les remplisse.
function viderFormulaire() {
    BLOCS.forEach(([cle]) => (pg[cle] ? [...pg[cle].querySelectorAll(".input-perso")] : []).forEach(i => {
        if (i.tagName === "SELECT") i.selectedIndex = 0; else if (i.type !== "color") i.value = "";
    }));
}

// ---------------------------------------------------------------------
//  LA NAISSANCE : le portrait qui se dessine, puis la répartition
// ---------------------------------------------------------------------
function pagesNaissance() {
    pg["naissance-g"].innerHTML = `<div class="contenu-page page-naissance">
        <div class="sur-titre-creation">Le nouvel aventurier</div>
        <h2 class="titre-creation">Le portrait se dessine</h2>
        ${FLEURON}
        <svg class="plume-naissance" viewBox="0 0 40 40" aria-hidden="true"><path class="plein" d="M34 3 C24 8 15 18 11 31 C18 24 28 16 34 3 Z"/><path d="M34 3 C26 14 18 24 7 37"/></svg>
        <div class="attente-naissance"></div>
        <p class="note-naissance">L'encre sèche ; ses caractéristiques s'écriront sur la page d'en face.</p>
        <button type="button" class="lien-fiche" data-action="creation" data-ca="retour-formulaire">‹ Revenir aux champs</button>
      </div>`;
    pg["naissance-d"].innerHTML = `<div class="contenu-page page-caracs-creation defile-fiche">
        <p class="fiche-attente invite-caracs">Une fois le portrait dessiné, tu répartiras ici ses caractéristiques.</p>
        <div class="repartition-creation"></div>
      </div>`;
    const attente = pg["naissance-g"].querySelector(".attente-naissance");
    ["barre-progression-creation", "phrase-humoristique-creation"].forEach(id => ranger(document.getElementById(id), attente));
    const modale = document.getElementById("modale-creation-caracs");
    const ici = pg["naissance-d"].querySelector(".repartition-creation");
    if (modale && ici) [...modale.children].forEach(el => ranger(el, ici));
}

// ---------------------------------------------------------------------
//  LA CONSTRUCTION
// ---------------------------------------------------------------------
const etat = { raceChoisie: false };
function construire() {
    pages = [];
    Object.keys(pg).forEach(k => delete pg[k]);
    sections = { races: [], classes: [] };
    const races = window.DONNEES_RACES || [];
    races.forEach((r, i) => {
        const g = page("race-" + i, "gauche", "page-race"), d = page("race-" + i + "-d", "droite", "page-race page-race-droite");
        g.dataset.race = r.nom;
        g.innerHTML = htmlRace(r, i, races.length); d.innerHTML = htmlRaceDroite(r);
        pages.push(g, d);
        sections.races.push({ cle: r.nom, nom: r.nom, page: g, couleur: COULEURS_RACES[r.nom] || "#a08060" });
    });
    const classes = listeClasses();
    classes.forEach((c, i) => {
        const g = page("classe-" + i, "gauche", "page-classe"), d = page("classe-" + i + "-d", "droite", "page-classe page-classe-droite");
        g.dataset.classe = c.id;
        g.innerHTML = htmlClasseGauche(c, i, classes.length); d.innerHTML = htmlClasseDroite(c);
        pages.push(g, d);
        sections.classes.push({ cle: c.id, nom: c.nom, page: g, couleur: COULEURS_CLASSES[c.nom] || "#7a6a5a", classe: c });
    });
    const cg = page("compagnon-g", "gauche", "page-compagnon"), cd = page("compagnon-d", "droite", "page-compagnon");
    cg.innerHTML = htmlCompagnonGauche(); cd.innerHTML = htmlCompagnonDroite();
    BLOCS.forEach(([cle, , titre], k) => { page(cle, k % 2 ? "droite" : "gauche", "page-formulaire"); pageFormulaire(cle, titre); });
    page("naissance-g", "gauche", "page-naissance"); page("naissance-d", "droite", "page-naissance");
    pagesNaissance();
    rangerFormulaire();
    poser();
}
// Les pages dans l'ordre (le compagnon seulement pour une classe qui en a un).
function poser() {
    pages = [];
    (window.DONNEES_RACES || []).forEach((r, i) => pages.push(pg["race-" + i], pg["race-" + i + "-d"]));
    listeClasses().forEach((c, i) => pages.push(pg["classe-" + i], pg["classe-" + i + "-d"]));
    if (avecCompagnon) pages.push(pg["compagnon-g"], pg["compagnon-d"]);
    pages.push(pg["form1-g"], pg["form1-d"], pg["form2-g"], pg["form2-d"], pg["naissance-g"], pg["naissance-d"]);
    pages = pages.filter(Boolean);
    if (F() && F().poser) F().poser();
}
// Les pages des classes se réécrivent quand la race ou le genre change (les
// classes interdites, le nom au féminin).
function reecrireClasses() {
    const classes = listeClasses();
    classes.forEach((c, i) => { const g = pg["classe-" + i]; if (g) g.innerHTML = htmlClasseGauche(c, i, classes.length); });
    (window.DONNEES_RACES || []).forEach((r, i) => { const g = pg["race-" + i]; if (g) g.innerHTML = htmlRace(r, i, (window.DONNEES_RACES || []).length); });
    prechargerAutour();   // (v341) les pages réécrites reprennent leur image, déjà en cache
}

// ---------------------------------------------------------------------
//  LES MARQUE-PAGES DU BORD DROIT
// ---------------------------------------------------------------------
// Glissés sous les pages (Nico : « comme s'ils sortaient »), ils passent sur la
// tranche et dépassent de la couverture, à droite ;
// pas tous alignés (Nico : « pour plus de naturel »). En unités de l'image du
// livre (2000 × 1117) : la tranche va de x 1765 à x 1999.
function creerOnglets() {
    retirerOnglets();
    const g = G(), scene = g && g.scene && g.scene(), livre = g && g.livre && g.livre();
    if (!scene || !livre) return;
    onglets = document.createElement("div");
    onglets.className = "onglets-creation";
    onglets.id = "onglets-creation";
    const groupe = (nom, liste, haut, bas) => {
        const n = liste.length, pas = (bas - haut) / n, h = Math.min(96, pas * 0.86);
        return `<div class="groupe-onglets" data-groupe="${nom}">${liste.map((s, i) => {
            const r = hasard("onglet-" + nom + s.cle);
            // La racine sous la page de droite (bord à x 1765), le bout au-delà de la
            // couverture (x ≈ 1960) ; un sur trois à peu près droit, les autres penchés.
            const x = 1694 + r() * 34, y = haut + i * pas + (pas - h) / 2 + (r() * 2 - 1) * Math.min(10, pas * 0.12);
            const signe = r() < 0.5 ? -1 : 1, droit = r() < 0.35, penche = nom === "classes" ? 2 + r() * 2.2 : 2.6 + r() * 3.4;
            const a = (droit ? (r() * 2 - 1) * 0.8 : signe * penche).toFixed(2);
            return `<button type="button" class="onglet-creation" data-cle="${echapper(s.cle)}" title="${echapper(s.nom)}"
                style="--x:${x.toFixed(0)};--y:${y.toFixed(0)};--h:${h.toFixed(0)};--a:${a}deg;--bord:${(1765 - x).toFixed(0)};--taille:${nom === "classes" ? 23 : 28}">
                <span class="papier-onglet">${lavis(teinteDe(s.couleur, "onglet", 0.55), "onglet-" + s.cle)}<span class="nom-onglet"><span>${echapper(nom === "classes" ? nomAffiche(s.classe) : s.nom)}</span></span></span></button>`;
        }).join("")}</div>`;
    };
    onglets.innerHTML = groupe("races", sections.races, 92, 1010) + groupe("classes", sections.classes, 80, 1030);
    scene.insertBefore(onglets, livre);
    ajusterNoms();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajusterNoms).catch(() => {});
    onglets.addEventListener("click", (ev) => {
        const b = ev.target.closest(".onglet-creation");
        if (!b) return;
        ev.stopPropagation();
        const s = [...sections.races, ...sections.classes].find(x => x.cle === b.dataset.cle);
        if (s) { son(); aller(s.page); }
    });
}
// Le nom prend toute la place du marque-page (Nico : « en plus gros, qu'il prenne
// tout l'espace ») : la hauteur du papier d'abord, puis réduit juste assez pour
// tenir en largeur (« Chasseur de mages »). Le rapport ne dépend pas de l'échelle
// du livre ; on le refait quand les écritures sont chargées.
function ajusterNoms() {
    if (!onglets) return false;
    let fait = true;
    onglets.querySelectorAll(".onglet-creation").forEach(b => {
        const n = b.querySelector(".nom-onglet"), t = n && n.firstElementChild;
        if (!t) return;
        b.style.setProperty("--ajuste", "1");
        const place = n.clientWidth, long = t.offsetWidth;
        if (!place || !long) { fait = false; return; }
        if (long > place) b.style.setProperty("--ajuste", (place / long * 0.97).toFixed(3));
    });
    if (fait) onglets.dataset.ajuste = "1";
    return fait;
}
function retirerOnglets() { if (onglets && onglets.parentNode) onglets.parentNode.removeChild(onglets); onglets = null; }
// Seuls sortent les marque-pages de la partie où l'on est ; celui de la page ouverte un peu plus.
function majOnglets() {
    if (!onglets) return;
    if (onglets.dataset.ajuste !== "1") ajusterNoms();
    const g = G(), pf = g && g.pageFlip && g.pageFlip();
    const ici = pf ? pf.getCurrentPageIndex() : -1;
    const dans = (liste) => { const idx = liste.map(s => g.indexDe(s.page)).filter(i => i >= 0); return idx.length && ici >= Math.min(...idx) - 1 && ici <= Math.max(...idx) + 1; };
    const section = dans(sections.races) ? "races" : dans(sections.classes) ? "classes" : "";
    onglets.querySelectorAll(".groupe-onglets").forEach(gr => gr.classList.toggle("sorti", gr.dataset.groupe === section));
    onglets.querySelectorAll(".onglet-creation").forEach(b => {
        const s = [...sections.races, ...sections.classes].find(x => x.cle === b.dataset.cle);
        const i = s ? g.indexDe(s.page) : -1;
        b.classList.toggle("ouvert", i >= 0 && (ici === i || ici === i + 1));
    });
}

// ---------------------------------------------------------------------
//  LES CROCHETS (le temps de la création, dans le livre)
// ---------------------------------------------------------------------
function poserCrochets() {
    crochets.demarrer = window.demarrerBarreProgressionCreation;
    window.demarrerBarreProgressionCreation = function () {
        aller(pg["naissance-g"]);
        pg["naissance-g"].classList.add("en-cours");
        return crochets.demarrer && crochets.demarrer.apply(this, arguments);
    };
    crochets.caracs = window.ouvrirModaleCreationCaracs;
    window.ouvrirModaleCreationCaracs = function () {
        const r = crochets.caracs && crochets.caracs.apply(this, arguments);
        pg["naissance-g"].classList.remove("en-cours");
        pg["naissance-g"].classList.add("fini");
        pg["naissance-d"].classList.add("pret");
        aller(pg["naissance-d"]);
        return r;
    };
    // La répartition validée, app.js ouvre la fiche : le héros vient de naître,
    // on attend qu'il arrive dans la partie, puis on ouvre SA fiche du livre.
    crochets.fiche = window.ouvrirFichePerso;
    window.ouvrirFichePerso = function (id, prenom, nom, couleur, onglet) {
        if (!actif) return crochets.fiche && crochets.fiche.apply(this, arguments);
        attendreHeros(id, onglet || "onglet-inventaire");
        return Promise.resolve();
    };
    document.body.classList.add("creation-livre");
}
function oterCrochets() {
    if (crochets.demarrer) window.demarrerBarreProgressionCreation = crochets.demarrer;
    if (crochets.caracs) window.ouvrirModaleCreationCaracs = crochets.caracs;
    if (crochets.fiche) window.ouvrirFichePerso = crochets.fiche;
    Object.keys(crochets).forEach(k => delete crochets[k]);
    document.body.classList.remove("creation-livre");
}
function attendreHeros(id, onglet, essai) {
    const f = F();
    const la = f && f.herosParId && f.herosParId(id);
    if (la || (essai || 0) > 60) {
        terminer();
        if (la && f.ouvrir) f.ouvrir(id, onglet);
        else if (typeof window.ouvrirFichePerso === "function") window.ouvrirFichePerso(id, "", "", "", onglet);
        return;
    }
    setTimeout(() => attendreHeros(id, onglet, (essai || 0) + 1), 250);
}

// ---------------------------------------------------------------------
//  LES GESTES
// ---------------------------------------------------------------------
function agir(cible) {
    const ca = cible.dataset.ca;
    if (ca === "tourner") { son(); aller(pg["form2-g"]); return; }
    if (ca === "race") {
        son();
        window.RACE_SELECTIONNEE_TEMP = cible.dataset.race;
        window.GENRE_SELECTIONNE_TEMP = cible.dataset.genre;
        etat.raceChoisie = true;
        // Une classe déjà choisie que ce peuple ne peut pas prendre est oubliée.
        const champ = document.getElementById("champ-classe");
        if (window.CLASSE_SELECTIONNEE_TEMP && typeof window.classeInterditeA === "function" && window.classeInterditeA(cible.dataset.race, window.CLASSE_SELECTIONNEE_TEMP)) {
            window.CLASSE_SELECTIONNEE_TEMP = null;
            if (champ) champ.value = "";
        }
        reecrireClasses();
        creerOnglets();
        const premiere = sections.classes.find(s => !etatClasse(s.classe).bloquee) || sections.classes[0];
        if (premiere) setTimeout(() => aller(premiere.page), 30);
        return;
    }
    if (ca === "classe") {
        const c = listeClasses().find(x => x.id === cible.dataset.classe);
        if (!c || etatClasse(c).bloquee) return;
        if (!etat.raceChoisie) {
            // (une classe touchée avant le peuple : on revient aux peuples)
            if (sections.races[0]) aller(sections.races[0].page);
            return;
        }
        son();
        window.CLASSE_SELECTIONNEE_TEMP = c.nom;
        const champ = document.getElementById("champ-classe");
        if (champ) champ.value = c.nom;
        const compagnon = typeof window.classeAvecCompagnon === "function" && window.classeAvecCompagnon(c.nom);
        if (!compagnon) window.COMPAGNON_TEMP = null;
        reecrireClasses();
        if (compagnon !== avecCompagnon) { avecCompagnon = compagnon; poser(); }
        if (compagnon) { pg["compagnon-g"].innerHTML = htmlCompagnonGauche(); setTimeout(() => aller(pg["compagnon-g"]), 60); return; }
        allerAuFormulaire();
        return;
    }
    if (ca === "compagnon") {
        const nom = ((document.getElementById("creation-compagnon-nom") || {}).value || "").trim();
        const description = ((document.getElementById("creation-compagnon-description") || {}).value || "").trim();
        const erreur = document.getElementById("creation-compagnon-erreur");
        if (!nom || !description) { if (erreur) erreur.textContent = !nom ? "Donnez-lui un nom." : "Décrivez-le en quelques mots."; return; }
        son();
        window.COMPAGNON_TEMP = { nom, description };
        allerAuFormulaire();
        return;
    }
    if (ca === "creer") { son(); if (typeof window.validerEtapeDescriptif === "function") window.validerEtapeDescriptif(); return; }
    if (ca === "creer-vite") { son(); if (typeof window.validerEtapeDescriptifRapide === "function") window.validerEtapeDescriptifRapide(); return; }
    if (ca === "retour-formulaire") { son(); aller(pg["form1-g"]); return; }
}
// Les champs : remis à zéro, la race, le genre et la classe posés, les champs
// de la race montrés (ouvrirEtapeIdentite, dont l'ancienne fenêtre reste cachée).
function allerAuFormulaire() {
    viderFormulaire();
    if (typeof window.ouvrirEtapeIdentite === "function") window.ouvrirEtapeIdentite();
    setTimeout(() => aller(pg["form1-g"]), 60);
}

// ---------------------------------------------------------------------
//  COMMENCER, TERMINER
// ---------------------------------------------------------------------
function commencer() {
    const g = G();
    if (!g || !g.enPartie || !g.enPartie() || !F() || !F().poser || !window.DONNEES_RACES) return false;
    if (actif) { if (sections.races[0]) aller(sections.races[0].page); return true; }
    actif = true;
    avecCompagnon = false;
    etat.raceChoisie = false;
    window.RACE_SELECTIONNEE_TEMP = "Humain";
    window.GENRE_SELECTIONNE_TEMP = null;
    window.CLASSE_SELECTIONNEE_TEMP = null;
    window.COMPAGNON_TEMP = null;
    const champ = document.getElementById("champ-classe");
    if (champ) champ.value = "";
    poserCrochets();
    const suite = () => {
        construire();
        creerOnglets();
        setTimeout(() => aller(sections.races[0] && sections.races[0].page), 60);
        if (sections.races[1]) chargerFonds(sections.races[1].page);   // (v341) la suivante, déjà prête
    };
    if (typeof window.chargerClasses === "function" && !window.CLASSES_CACHE) Promise.resolve(window.chargerClasses()).catch(() => {}).then(suite);
    else suite();
    return true;
}
function terminer() {
    if (!actif) return;
    actif = false;
    oterCrochets();
    toutRemettre();
    retirerOnglets();
    pages = [];
    Object.keys(pg).forEach(k => delete pg[k]);
    sections = { races: [], classes: [] };
    if (F() && F().poser) F().poser();
}

// La veille : les marque-pages suivent la page ouverte ; hors partie, tout s'efface.
// (v385) Endormie quand l'onglet est caché.
setInterval(() => {
    try {
        if (!actif || document.hidden) return;
        const g = G();
        if (!g || !g.enPartie || !g.enPartie()) { terminer(); return; }
        majOnglets();
        prechargerAutour();
    } catch (e) { console.warn("Le livre : la création", e); }
}, 250);

// (v339) La dernière double page des classes ne se tourne pas vers la droite :
// les champs ne s'ouvrent qu'en choisissant une classe (sinon le héros part sans elle).
// (v365, Nico : « quand on est sur la dernière page de race, fais en sorte
// qu'on ne puisse plus tourner les pages d'après ») : la dernière double page
// des peuples ne se tourne pas non plus vers la droite tant qu'aucun peuple
// n'est choisi — choisir un peuple ouvre les classes.
function bloqueEnAvant(index) {
    if (!actif) return false;
    const g = G();
    if (!g || typeof g.indexDe !== "function") return false;
    const surLaDouble = (section) => { if (!section) return false; const i = g.indexDe(section.page); return i >= 0 && (index === i || index === i + 1); };
    if (!etat.raceChoisie && surLaDouble(sections.races[sections.races.length - 1])) return true;
    return surLaDouble(sections.classes[sections.classes.length - 1]);
}

window.GRIMOIRE_CREATION = {
    commencer, terminer, agir, bloqueEnAvant, prechargerAutour,
    pages: () => (actif ? pages.slice() : []),
    actif: () => actif,
    page: (cle) => pg[cle] || null,
    sections: () => ({ races: sections.races.map(s => s.cle), classes: sections.classes.map(s => s.cle) })
};
