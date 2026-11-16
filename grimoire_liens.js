// =========================================================================
//  IVALIS — LES FILS INVISIBLES DANS LE LIVRE (v414) — LOT 5
// =========================================================================
//  Nico : « tout est visible pour le moment » ; « un petit encart que quand on
//  clique sur le portrait » ; « le clic sur le nom fait afficher son image côté
//  gauche du livre, et un clic sur cette image fait apparaître sa fiche ».
//
//    · À GAUCHE : la fiche de l'âme au centre du regard (PNJ ou héros) : son
//      portrait, qui il est, son caractère (les six traits), ses valeurs, ses
//      objectifs, sa faille, son masque, son humeur, ses souvenirs ; en bas,
//      toutes les âmes de la partie (un toucher la met au centre).
//    · À DROITE : le radar. L'âme au centre ; autour, les portraits de ceux
//      qu'elle connaît : plus l'affinité est haute, plus ils sont près ; le
//      fil est vert (favorable), rouge (hostile) ou neutre, plein et sombre
//      quand ils se connaissent bien, pâle et en pointillés sinon. Deux
//      regards : « ce qu'il ressent » / « ce qu'on ressent pour lui ». Un
//      filtre, une recherche ; douze portraits au plus (les liens les plus
//      forts). Un toucher sur un portrait : l'encart du lien (le chiffre, les
//      six axes, ce qu'il en dit, les derniers changements) ; « Placer au
//      centre » (ou deux touchers) recentre. Nico et Ben y annulent un
//      changement et ajustent un lien (social.js, avec trace dans le journal).
//
//  Les données : social.js (lireReseau) ; le calcul de la disposition est pur
//  (disposerRadar) et se vérifie au banc.
//
//  (v416) Nico : « vire les fils invisibles du sommaire et mets-les dans les
//  paramètres ». Plus d'entrée au sommaire : la double page s'ouvre depuis les
//  Paramètres (le Maître du Jeu) ou le portrait d'un PNJ dans le récit ; elle
//  n'entre dans le livre que le temps qu'on la lit, et en ressort quand on la
//  quitte (on ne l'atteint plus en tournant les pages depuis les Aventuriers).
// =========================================================================

const G = () => window.GRIMOIRE;
const S = () => window.SOCIAL;
const D = () => (window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.dessins) || {};
const lavis = (...a) => (D().lavis ? D().lavis(...a) : "");
const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const son = () => { try { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); } catch (e) {} };
const sansAccent = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const FLEURON = `<svg class="fleuron fleuron-liens" viewBox="0 0 200 24" aria-hidden="true"><path d="M 8 12 C 40 4 70 4 92 12 M 108 12 C 130 4 160 4 192 12 M 92 12 C 96 6 104 6 108 12 C 104 18 96 18 92 12 Z"/><circle cx="100" cy="12" r="2.2"/></svg>`;
const TEINTE_LIENS = { couleurs: ["#7a3b5a", "#9a5576", "#5e2a44"], opacite: 0.28, nom: "liens" };
export const MAX_PORTRAITS = 12;

// ---------------------------------------------------------------------
//  LA DISPOSITION DU RADAR (pure)
// ---------------------------------------------------------------------
// `liens` : [{ id, axes }] (l'autre bout du lien et ses axes, dans le regard
// choisi). Rend [{ id, x, y, r, aff, fam, couleur, epaisseur, opacite, pointilles }]
// en pourcentages de la boîte du radar (centre 50, 50). Plus l'affinité est
// haute, plus on est près (rayon de 16 à 46) ; l'angle vient de l'identifiant
// (stable d'une scène à l'autre) ; les portraits trop proches s'écartent un peu.
export function disposerRadar(liens, options) {
    const o = options || {}, P = o.P || S();
    const rMin = o.rMin || 16, rMax = o.rMax || 46;
    const pts = (liens || []).map(l => {
        const aff = P.affinite(l.axes), fam = P.nombre((l.axes || {}).familiarite);
        const r = rMin + (100 - aff) / 200 * (rMax - rMin);
        return { id: l.id, aff, fam, ordre: P.graine("angle:" + l.id), r,
                 couleur: aff > 15 ? "#5e7f59" : aff < -10 ? "#ab514d" : "#99856a",
                 epaisseur: Math.abs(aff) >= 60 ? 3.2 : 2, opacite: Math.max(0.3, Math.min(1, fam / 100)), pointilles: fam < 55 };
    });
    // L'angle : l'ordre autour du centre vient de l'identifiant (stable d'une scène
    // à l'autre), les places sont réparties tout autour (personne ne s'entasse).
    pts.slice().sort((a, b) => a.ordre - b.ordre).forEach((q, i, l) => { q.angle = -Math.PI / 2 + (i / Math.max(1, l.length)) * Math.PI * 2; });
    // L'écart : deux portraits trop proches s'écartent en angle (le rayon, lui, garde son sens).
    for (let k = 0; k < 40; k++) {
        let bouge = false;
        for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
            const a = pts[i], b = pts[j];
            const dx = Math.cos(a.angle) * a.r - Math.cos(b.angle) * b.r, dy = Math.sin(a.angle) * a.r - Math.sin(b.angle) * b.r;
            if (Math.hypot(dx, dy) >= 13) continue;
            const sens = ((b.angle - a.angle + 3 * Math.PI) % (2 * Math.PI)) - Math.PI >= 0 ? 1 : -1;
            a.angle -= 0.06 * sens; b.angle += 0.06 * sens; bouge = true;
        }
        if (!bouge) break;
    }
    pts.forEach(q => { q.x = 50 + Math.cos(q.angle) * q.r; q.y = 50 + Math.sin(q.angle) * q.r * 0.86; });
    return pts;
}
// Les liens d'une âme dans un regard, filtrés, les plus forts d'abord (douze au plus).
export function liensDuRegard(reseau, centre, regard, filtre, P) {
    const ames = reseau.ames || {};
    const tous = Object.values(reseau.liens || {}).filter(l => regard === "in" ? l.vers === centre : l.de === centre)
        .map(l => ({ id: regard === "in" ? l.de : l.vers, axes: l.axes || {}, lien: l })).filter(x => ames[x.id]);
    const garde = tous.filter(x => {
        const aff = P.affinite(x.axes), type = (ames[x.id] || {}).type;
        if (filtre === "allies") return aff >= 20;
        if (filtre === "rivaux") return aff <= -10;
        if (filtre === "heros") return type === "heros";
        if (filtre === "pnj") return type === "pnj";
        return true;
    });
    garde.sort((a, b) => (Math.abs(P.affinite(b.axes)) + 0.3 * P.nombre(b.axes.familiarite)) - (Math.abs(P.affinite(a.axes)) + 0.3 * P.nombre(a.axes.familiarite)));
    return { montres: garde.slice(0, MAX_PORTRAITS), caches: garde.slice(MAX_PORTRAITS), total: tous.length };
}

// ---------------------------------------------------------------------
//  L'ÉTAT DE LA DOUBLE PAGE
// ---------------------------------------------------------------------
let pages = null;
const vue = { centre: "", regard: "out", filtre: "tous", selection: "", recherche: "", ajuste: false, reseau: null, souvenirs: [], charge: 0, retourRecit: false, retourParametres: false, retourGroupe: false, dernierToucher: null };

function creer() {
    if (pages) return pages;
    const page = (cote) => { const el = document.createElement("div"); el.className = `page-grimoire page-papier ${cote} page-fiches page-liens`; el.id = "grimoire-liens-" + cote[0]; return el; };
    pages = { g: page("gauche"), d: page("droite") };
    return pages;
}
function poser() {
    const g = G();
    if (!g || typeof g.definirLiens !== "function" || !g.enPartie || !g.enPartie()) return;
    const { g: pg, d: pd } = creer();
    const avant = g.pagesLiens();
    if (avant.length === 2 && avant[0] === pg && avant[1] === pd) return;
    g.definirLiens([pg, pd]);
}

const ames = () => (vue.reseau && vue.reseau.ames) || {};
const nomDe = (id) => (ames()[id] && ames()[id].nom) || id;
const herosDe = (id) => ((window.PERSOS_PARTIE || []).concat(window.PERSOS_JOUEURS_PARTIE || [])).find(h => h && h.idPersonnage === id) || null;
function portraitDe(id) {
    const a = ames()[id] || {};
    if (a.type === "heros") { const h = herosDe(id); return h ? (h.urlPortraitReference || h.urlCloudinary || "") : ""; }
    const f = (vue.reseau && vue.reseau.fiches || {})[a.ref || id];
    return (f && f.URL_Cloudinary && !String(f.URL_Cloudinary).startsWith("data:")) ? f.URL_Cloudinary : "";
}
const initiales = (nom) => String(nom || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(m => m[0]).join("").toUpperCase();
const estMort = (id) => (ames()[id] || {}).statut === "mort";
function medaillon(id, classe) {
    const url = portraitDe(id), nom = nomDe(id);
    // (les initiales dessous : une image qui ne se charge pas s'efface et les laisse voir)
    return `<span class="medaillon-liens ${classe || ""}${estMort(id) ? " mort" : ""}${(ames()[id] || {}).type === "heros" ? " heros" : ""}"><span class="initiales-liens">${echapper(initiales(nom))}</span>${url
        ? `<img src="${echapper(url)}" alt="" draggable="false" onerror="this.remove()">` : ""}</span>`;
}

// (v415) Nico : « les âmes de la partie, mets-les dans une liste déroulante, sinon il y en
// aura trop ; et classe-les par ordre alphabétique ». Un choix : elle passe au centre.
// (v417) « …le placer en haut de la page de droite ».
function htmlIndexAmes() {
    const id = vue.centre, a = ames()[id];
    const liste = Object.values(ames()).sort((x, y) => String(x.nom).localeCompare(String(y.nom), "fr", { sensitivity: "base" }));
    if (!liste.length) return "";
    return `<select class="index-liens" aria-label="Les âmes de la partie">
        ${a ? "" : `<option value="" selected>Choisir une âme…</option>`}
        ${liste.map(x => `<option value="${echapper(x.id)}"${x.id === id ? " selected" : ""}>${echapper(x.nom)}${x.type === "heros" ? " (héros)" : ""}${x.statut === "mort" ? " †" : ""}</option>`).join("")}
      </select>`;
}

// ---------------------------------------------------------------------
//  LA PAGE DE GAUCHE : la fiche
// ---------------------------------------------------------------------
function htmlGauche() {
    const P = S(), id = vue.centre, a = ames()[id];
    const retour = vue.retourRecit ? `<button type="button" class="lien-fiche retour-liens" data-action="liens" data-cb="recit">← Revenir au récit</button>`
        : vue.retourParametres ? `<button type="button" class="lien-fiche retour-liens" data-action="liens" data-cb="parametres">← Revenir aux paramètres</button>`
        : vue.retourGroupe ? `<button type="button" class="lien-fiche retour-liens" data-action="liens" data-cb="groupe">← Revenir au groupe</button>` : "";
    if (!P || !a) return `<div class="contenu-page page-liens-gauche">
        <div class="entete-liens">${lavis(TEINTE_LIENS, "liens-titre")}<span class="titre-page-fiche">Les fils invisibles</span></div>${FLEURON}
        <p class="fiche-attente">${vue.charge === 1 ? "Le livre cherche les âmes de la partie…" : "Aucune âme n'est encore connue dans cette partie : elles naissent avec les personnages nommés du récit."}</p>${retour}</div>`;
    const ps = P.psycheValide(a.psyche), f = (vue.reseau.fiches || {})[a.ref || id] || {}, h = herosDe(id);
    const qui = a.type === "heros" ? [h && h.race, h && h.classe].filter(Boolean).join(", ") || "Héros"
        : [f.Occupation, f.Race].filter(Boolean).join(", ") || "PNJ";
    const tour = Number((vue.reseau.etat || {}).tour || 0) + 1;
    const hum = P.humeurActive(a, tour);
    const traits = P.TRAITS.map(t => `<div class="trait-liens"><span>${P.NOMS_TRAITS[t]}</span><span class="jauge-liens"><i style="width:${ps.traits[t]}%"></i></span><b>${Math.round(ps.traits[t])}</b></div>`).join("");
    // (v417) Nico : « il va y en avoir plein ; mettre toujours le plus récent en haut de la liste ».
    const souvenirs = (vue.souvenirs || []).slice().sort((x, y) => (Number(y.tour) || 0) - (Number(x.tour) || 0) || (Number(y.Le) || 0) - (Number(x.Le) || 0))
        .slice(0, 30).map(sv => `<li>${sv.dateJeu ? `<span class="date-liens">${echapper(sv.dateJeu)}</span> ` : ""}« ${echapper(sv.texte)} »</li>`).join("");
    return `<div class="contenu-page page-liens-gauche defile-fiche">
        <div class="entete-liens">${lavis(TEINTE_LIENS, "liens-titre")}<span class="titre-page-fiche">Les fils invisibles</span></div>${FLEURON}${retour}
        <div class="identite-liens">${medaillon(id, "grand")}<div>
          <div class="nom-liens">${echapper(a.nom)}${a.statut === "mort" ? ` <span class="mort-liens">† mort</span>` : ""}</div>
          <div class="qui-liens">${echapper(qui)}</div>
          ${hum ? `<div class="humeur-liens">Humeur : ${echapper(P.NOMS_EMOTIONS[hum.emotion] || hum.emotion)}${hum.cause ? ` — ${echapper(hum.cause)}` : ""}</div>` : ""}
        </div></div>
        <div class="caractere-liens">${echapper(S().caractere ? S().caractere(ps) : "")}</div>
        <div class="traits-liens">${traits}</div>
        ${ps.valeurs.length ? `<p class="ligne-liens"><b>Valeurs :</b> ${ps.valeurs.map(v => echapper(P.NOMS_VALEURS[v])).join(", ")}</p>` : ""}
        ${ps.objectifs.length ? `<p class="ligne-liens"><b>Objectifs :</b> ${ps.objectifs.map(echapper).join(" ; ")}</p>` : ""}
        ${ps.faille ? `<p class="ligne-liens"><b>Faille :</b> ${echapper(ps.faille)}</p>` : ""}
        ${ps.masque ? `<p class="ligne-liens"><b>Masque :</b> ${echapper(ps.masque)}</p>` : ""}
        ${ps.style ? `<p class="ligne-liens"><b>Parole :</b> ${echapper(ps.style)}</p>` : ""}
        ${a.type === "pnj" && f.Secret_Mental ? `<p class="ligne-liens"><b>Secret :</b> ${echapper(f.Secret_Mental)}</p>` : ""}
        ${a.type === "heros" && h && h.secret ? `<p class="ligne-liens"><b>Secret :</b> ${echapper(h.secret)}</p>` : ""}
        <div class="sous-titre-liens">Ses souvenirs</div>
        ${souvenirs ? `<ul class="souvenirs-liens">${souvenirs}</ul>` : `<p class="fiche-attente">Pas encore de souvenir.</p>`}
      </div>${(window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.FLECHE_DEFILE) || ""}`;
}

// ---------------------------------------------------------------------
//  LA PAGE DE DROITE : le radar et l'encart
// ---------------------------------------------------------------------
const signe = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(Math.round(v));
function htmlEncart(choix) {
    const P = S(), l = choix.lien, a = l.axes || {}, aff = P.affinite(a);
    const de = l.de, vers = l.vers, admin = P.estAdminSocial && P.estAdminSocial();
    const barres = P.AXES.map(axe => {
        const [min, max] = P.BORNES[axe], v = P.nombre(a[axe]);
        return `<div class="axe-liens"><span>${P.NOMS_AXES[axe]}</span><b>${signe(v)}</b><span class="barre-liens"><i class="${v < 0 ? "neg" : ""}" style="width:${((v - min) / (max - min) * 100).toFixed(1)}%"></i></span>
          ${vue.ajuste && admin ? `<input class="ajuste-liens" type="number" step="1" min="${min}" max="${max}" data-axe="${axe}" value="${Math.round(v)}">` : ""}</div>`;
    }).join("");
    // (v417) Nico : « les derniers changements, oui, mais en rapport avec le personnage en
    // question » : seulement ce qui s'est passé ENTRE les deux (l'un a agi envers l'autre) ;
    // ce que l'un a seulement vu l'autre faire à un tiers n'y figure pas. Un ajustement à la
    // main reste ; un changement d'avant la v417 (sans acteur noté) aussi.
    const entreEux = (d) => d.type === "ajustement" || !d.acteur || ((d.acteur === de && d.cible === vers) || (d.acteur === vers && d.cible === de));
    const derniers = (l.derniers || []).filter(entreEux).slice().reverse().map(d => `<li class="${d.annule ? "annule" : ""}">${echapper(d.resume || "")} <span class="ecarts-liens">${Object.entries(d.ecarts || {}).map(([x, v]) => `${echapper(P.NOMS_AXES[x] || x).toLowerCase()} ${signe(v)}`).join(" · ")}</span>${d.annule ? " <i>(annulé)</i>" : admin ? ` <button type="button" class="annuler-liens" data-action="liens" data-cb="annuler" data-n="${d.n}">annuler</button>` : ""}</li>`).join("");
    return `<div class="encart-liens">
        <button type="button" class="fermer-encart-liens" data-action="liens" data-cb="fermer" aria-label="Fermer">×</button>
        <div class="titre-encart-liens">${echapper(nomDe(de))} → ${echapper(nomDe(vers))}</div>
        <div class="affinite-liens ${aff > 15 ? "pos" : aff < -10 ? "neg" : ""}">${signe(aff)} <small>${echapper(P.motAffinite(aff))}</small></div>
        <div class="mots-liens">${echapper(nomDe(de))} ${echapper(P.resumeLien(a))}.${l.etiquette ? ` <i>(${echapper(l.etiquette)})</i>` : ""}</div>
        ${l.histoire ? `<div class="histoire-liens">${echapper(l.histoire)}</div>` : ""}
        <div class="axes-liens">${barres}</div>
        ${derniers ? `<div class="sous-titre-liens petit">Les derniers changements</div><ul class="derniers-liens">${derniers}</ul>` : ""}
        <div class="boutons-encart-liens">
          <button type="button" class="lien-fiche" data-action="liens" data-cb="centrer" data-id="${echapper(choix.id)}">Placer au centre</button>
          ${admin ? (vue.ajuste ? `<button type="button" class="lien-fiche" data-action="liens" data-cb="enregistrer">Enregistrer</button>` : `<button type="button" class="lien-fiche" data-action="liens" data-cb="ajuster">Ajuster</button>`) : ""}
        </div>
      </div>`;
}
function htmlDroite() {
    const P = S(), id = vue.centre;
    const outils = `<div class="outils-liens">
        <button type="button" class="regard-liens${vue.regard === "out" ? " actif" : ""}" data-action="liens" data-cb="regard" data-regard="out">Ce qu'il ressent</button>
        <button type="button" class="regard-liens${vue.regard === "in" ? " actif" : ""}" data-action="liens" data-cb="regard" data-regard="in">Ce qu'on ressent pour lui</button>
        <select class="filtre-liens">${[["tous", "Tous les liens"], ["allies", "Alliés"], ["rivaux", "Rivaux"], ["heros", "Héros"], ["pnj", "PNJ"]].map(([v, t]) => `<option value="${v}"${vue.filtre === v ? " selected" : ""}>${t}</option>`).join("")}</select>
        <input class="recherche-liens" type="search" placeholder="Chercher un nom…" value="${echapper(vue.recherche)}" list="liste-ames-liens">
        <datalist id="liste-ames-liens">${Object.values(ames()).map(a => `<option value="${echapper(a.nom)}"></option>`).join("")}</datalist>
      </div>`;
    if (!P || !ames()[id]) return `<div class="contenu-page page-liens-droite">${htmlIndexAmes()}<div class="entete-liens"><span class="titre-page-fiche">Le réseau</span></div>${FLEURON}${outils}<p class="fiche-attente">Choisissez une âme dans la liste.</p></div>`;
    const { montres, caches, total } = liensDuRegard(vue.reseau, id, vue.regard, vue.filtre, P);
    const pts = disposerRadar(montres, { P });
    const anneaux = [16, 31, 46].map(r => `<ellipse cx="50" cy="50" rx="${r}" ry="${(r * 0.86).toFixed(1)}" class="anneau-liens"/>`).join("");
    const fils = pts.map(q => `<line x1="50" y1="50" x2="${q.x.toFixed(2)}" y2="${q.y.toFixed(2)}" stroke="${q.couleur}" stroke-width="${q.epaisseur}" stroke-opacity="${q.opacite.toFixed(2)}"${q.pointilles ? ` stroke-dasharray="1.6 1.2"` : ""} vector-effect="non-scaling-stroke" data-fil="${echapper(q.id)}"/>`).join("");
    const noeuds = pts.map(q => `<button type="button" class="noeud-liens${q.id === vue.selection ? " choisi" : ""}" style="left:${q.x.toFixed(2)}%;top:${q.y.toFixed(2)}%" data-action="liens" data-cb="choisir" data-id="${echapper(q.id)}" data-aff="${q.aff.toFixed(2)}" title="${echapper(nomDe(q.id))}">${medaillon(q.id)}</button>`).join("");
    const choix = montres.concat(caches).find(x => x.id === vue.selection);
    const reste = caches.length ? `<div class="reste-liens">${caches.length} autre${caches.length > 1 ? "s" : ""} lien${caches.length > 1 ? "s" : ""} : ${caches.map(x => `<button type="button" class="ame-index-liens" data-action="liens" data-cb="choisir" data-id="${echapper(x.id)}">${echapper(nomDe(x.id))}</button>`).join(" ")}</div>` : "";
    return `<div class="contenu-page page-liens-droite">${htmlIndexAmes()}
        <div class="entete-liens"><span class="titre-page-fiche">Le réseau</span></div>${FLEURON}${outils}
        <div class="radar-liens">
          <svg class="fils-liens" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${anneaux}${fils}</svg>
          ${noeuds}
          <button type="button" class="noeud-liens centre" style="left:50%;top:50%" data-action="liens" data-cb="regard" data-regard="${vue.regard === "out" ? "in" : "out"}" title="${echapper(nomDe(id))}">${medaillon(id, "centre")}</button>
          ${!total ? `<p class="vide-liens">${echapper(nomDe(id))} ne connaît encore personne${vue.regard === "in" ? " qui pense à lui" : ""}.</p>` : ""}
        </div>
        <div class="legende-liens"><span><i class="fil pos"></i>favorable</span><span><i class="fil neg"></i>tendu</span><span><i class="fil neu"></i>neutre</span><span><i class="fil pale"></i>peu connu</span></div>
        ${reste}
        ${choix ? htmlEncart(choix) : ""}
      </div>`;
}

// ---------------------------------------------------------------------
//  LE RENDU, LES DONNÉES
// ---------------------------------------------------------------------
function rendre() {
    if (!pages) return;
    pages.g.innerHTML = htmlGauche();
    pages.d.innerHTML = htmlDroite();
    const champ = pages.d.querySelector(".recherche-liens");
    if (champ) champ.addEventListener("change", () => chercher(champ.value));
    const filtre = pages.d.querySelector(".filtre-liens");
    if (filtre) filtre.addEventListener("change", () => { vue.filtre = filtre.value; vue.selection = ""; rendre(); });
    const choixAme = pages.d.querySelector("select.index-liens");
    if (choixAme) choixAme.addEventListener("change", () => { if (choixAme.value) { son(); centrer(choixAme.value); } });
}
async function charger(garderSelection) {
    const P = S(), p = window.ID_PARTIE_COURANTE;
    if (!P || !p) return;
    vue.charge = 1;
    if (!vue.reseau) rendre();
    try {
        const reseau = await P.lireReseau(p);
        vue.reseau = reseau;
        if (!vue.centre || !reseau.ames[vue.centre]) vue.centre = Object.values(reseau.ames).find(a => a.type === "pnj" && a.statut !== "mort")?.id || Object.keys(reseau.ames)[0] || "";
        if (!garderSelection) vue.selection = "";
        vue.souvenirs = vue.centre ? await P.lireSouvenirsDe(p, vue.centre) : [];
    } catch (e) { console.error("[Fils invisibles] Le livre :", e); }
    vue.charge = 2;
    rendre();
}
async function centrer(id) {
    if (!id || !ames()[id]) return;
    vue.centre = id; vue.selection = ""; vue.ajuste = false;
    vue.souvenirs = await S().lireSouvenirsDe(window.ID_PARTIE_COURANTE, id).catch(() => []);
    rendre();
}
function chercher(texte) {
    vue.recherche = texte || "";
    const t = sansAccent(texte);
    if (!t) return;
    const trouve = Object.values(ames()).find(a => sansAccent(a.nom) === t) || Object.values(ames()).find(a => sansAccent(a.nom).includes(t));
    if (trouve) centrer(trouve.id);
}

// ---------------------------------------------------------------------
//  LES GESTES
// ---------------------------------------------------------------------
async function agir(cible) {
    const cb = cible.dataset.cb, P = S(), p = window.ID_PARTIE_COURANTE;
    if (cb === "choisir") {
        const id = cible.dataset.id, d = vue.dernierToucher;
        vue.dernierToucher = { id, t: Date.now() };
        // Deux touchers sur le même portrait : il passe au centre.
        if (d && d.id === id && Date.now() - d.t < 450) { son(); await centrer(id); return; }
        son(); vue.selection = vue.selection === id ? "" : id; vue.ajuste = false; rendre(); return;
    }
    if (cb === "centrer") { son(); await centrer(cible.dataset.id); return; }
    if (cb === "regard") { son(); vue.regard = cible.dataset.regard === "in" ? "in" : "out"; vue.selection = ""; rendre(); return; }
    if (cb === "fermer") { vue.selection = ""; vue.ajuste = false; rendre(); return; }
    if (cb === "recit") { son(); vue.retourRecit = false; if (window.GRIMOIRE_RECIT && window.GRIMOIRE_RECIT.allerAuRecit) window.GRIMOIRE_RECIT.allerAuRecit(); return; }
    if (cb === "parametres") { son(); vue.retourParametres = false; if (window.GRIMOIRE_PARAMETRES) window.GRIMOIRE_PARAMETRES.revenirDesLiens(); return; }
    if (cb === "groupe") { son(); vue.retourGroupe = false; if (window.GRIMOIRE_GROUPE) window.GRIMOIRE_GROUPE.ouvrir(); return; }
    if (cb === "ajuster") { vue.ajuste = true; rendre(); return; }
    const lien = () => { const de = vue.regard === "in" ? vue.selection : vue.centre, vers = vue.regard === "in" ? vue.centre : vue.selection; return { de, vers }; };
    if (cb === "enregistrer") {
        const valeurs = {};
        pages.d.querySelectorAll(".ajuste-liens").forEach(i => { valeurs[i.dataset.axe] = i.value; });
        const { de, vers } = lien();
        try { await P.ajusterLien(p, de, vers, valeurs); } catch (e) { alert(e.message || e); }
        vue.ajuste = false; await charger(true); return;
    }
    if (cb === "annuler") {
        const n = Number(cible.dataset.n);
        if (!confirm(`Annuler ce changement (n° ${n}) ? Ses écarts sont retirés des liens.`)) return;
        try { await P.annulerEvenement(p, n); } catch (e) { alert(e.message || e); }
        await charger(true); return;
    }
}

// ---------------------------------------------------------------------
//  ALLER AUX FILS INVISIBLES
// ---------------------------------------------------------------------
// `options` : { id } ou { nom } (l'âme à placer au centre), { depuisRecit }, { depuisParametres } (v416), { depuisGroupe } (v418).
async function ouvrir(options) {
    const o = options || {}, g = G();
    if (!g || !g.enPartie || !g.enPartie() || typeof g.definirLiens !== "function") return false;
    enRoute = Date.now();
    // (v416) arrivé sur la double page, on n'est plus en route : la quitter la fait ressortir.
    if (!ouvrir.ecoute && g.ecran && g.ecran()) {
        ouvrir.ecoute = true;
        g.ecran().addEventListener("grimoire-page", () => { if (ouverte()) enRoute = 0; });
    }
    poser();
    vue.retourRecit = !!o.depuisRecit;
    vue.retourParametres = !!o.depuisParametres;
    vue.retourGroupe = !!o.depuisGroupe;      // (v418) depuis la double page du Groupe
    await charger();
    if (o.id && ames()[o.id]) await centrer(o.id);
    else if (o.nom) {
        const t = sansAccent(o.nom), mm = typeof window.memeNomPNJIvalis === "function" ? window.memeNomPNJIvalis : (a, b) => sansAccent(a) === sansAccent(b);
        const a = Object.values(ames()).find(x => sansAccent(x.nom) === t) || Object.values(ames()).find(x => mm(o.nom, x.nom));
        if (a) await centrer(a.id);
    }
    const aller = (essai) => {
        const i = g.indexDe(pages.g);
        if (i < 0) { if (essai < 30) setTimeout(() => aller(essai + 1), 100); return; }
        g.allerALaPage(i);
    };
    enRoute = Date.now();
    aller(0);
    return true;
}
function ouverte() {
    const g = G(), pf = g && g.pageFlip && g.pageFlip();
    if (!pages || !pf || !g.ouvert || !g.ouvert() || !g.enPartie()) return false;
    const i = g.indexDe(pages.g), ici = pf.getCurrentPageIndex();
    return i >= 0 && (ici === i || ici === i + 1);
}
// Ouverte, la double page se relit toutes les 20 secondes. (v416) Quittée, elle sort du
// livre ; pendant qu'on y va (`enRoute`, 8 secondes au plus), elle reste.
let derniereLecture = 0, enRoute = 0;
setInterval(() => {
    if (document.hidden) return;
    try {
        const g = G();
        if (!g || typeof g.pagesLiens !== "function") return;
        if (ouverte()) {
            enRoute = 0;
            if (!vue.ajuste && Date.now() - derniereLecture > 20000) { derniereLecture = Date.now(); charger(true); }
        } else if (g.pagesLiens().length && Date.now() - enRoute > 8000) g.definirLiens([]);
    } catch (e) { console.warn("Le livre : les fils invisibles", e); }
}, 1000);

window.GRIMOIRE_LIENS = { ouvrir, ouverte, agir, rendre, charger, centrer, vue: () => vue, pages: () => (pages ? [pages.g, pages.d] : []), disposerRadar, liensDuRegard, MAX_PORTRAITS };
