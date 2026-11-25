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
//      changement ; en mode DEV, la roue crantée d'une barre la règle (v425 ;
//      v426 : le bouton « Ajuster » est parti) — social.js, trace dans le journal.
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
const vue = { centre: "", regard: "out", filtre: "tous", selection: "", recherche: "", regle: "", reseau: null, souvenirs: [], charge: 0, retourRecit: false, retourParametres: false, retourGroupe: false, retourGestion: false, dernierToucher: null };

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
        : vue.retourGroupe ? `<button type="button" class="lien-fiche retour-liens" data-action="liens" data-cb="groupe">← Revenir au groupe</button>`
        : vue.retourGestion ? `<button type="button" class="lien-fiche retour-liens" data-action="liens" data-cb="gestion">← Revenir à la gestion du camp</button>` : "";
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
        ${htmlMoral(id)}
        <div class="caractere-liens">${echapper(S().caractere ? S().caractere(ps) : "")}</div>
        <div class="traits-liens">${traits}</div>
        ${ps.valeurs.length ? `<p class="ligne-liens"><b>Valeurs :</b> ${ps.valeurs.map(v => echapper(P.NOMS_VALEURS[v])).join(", ")}</p>` : ""}
        ${ps.objectifs.length ? `<p class="ligne-liens"><b>Objectifs :</b> ${ps.objectifs.map(echapper).join(" ; ")}</p>` : ""}
        ${ps.faille ? `<p class="ligne-liens"><b>Faille :</b> ${echapper(ps.faille)}</p>` : ""}
        ${ps.masque ? `<p class="ligne-liens"><b>Masque :</b> ${echapper(ps.masque)}</p>` : ""}
        ${ps.style ? `<p class="ligne-liens"><b>Parole :</b> ${echapper(ps.style)}</p>` : ""}
        ${a.type === "pnj" && f.Secret_Mental ? `<p class="ligne-liens"><b>Secret :</b> ${echapper(f.Secret_Mental)}</p>` : ""}
        ${a.type === "heros" && h && h.secret ? `<p class="ligne-liens"><b>Secret :</b> ${echapper(h.secret)}</p>` : ""}
        ${a.memoire ? `<div class="sous-titre-liens">Sa mémoire à long terme</div><p class="memoire-liens">${echapper(a.memoire)}</p>` : ""}
        <div class="sous-titre-liens">Ses souvenirs</div>
        ${souvenirs ? `<ul class="souvenirs-liens">${souvenirs}</ul>` : `<p class="fiche-attente">Pas encore de souvenir.</p>`}
        ${a.type === "pnj" && modeDev() && window.RECRUTEMENT && window.RECRUTEMENT.avecCamp() && !(((window.CAMP.lire() || {}).Membres || {})[id]) ? `<button type="button" class="supprimer-pnj-liens recruter-pnj-liens" data-action="liens" data-cb="recruter-dev" data-id="${echapper(id)}" title="Le faire entrer dans le camp, comme s'il avait été recruté (DEV)">Forcer son recrutement dans le camp</button>` : ""}
        ${a.type === "pnj" && modeDev() ? `<button type="button" class="supprimer-pnj-liens" data-action="liens" data-cb="supprimer-pnj" data-id="${echapper(id)}" title="Supprimer ce PNJ de la partie (DEV)">Supprimer ce PNJ</button>` : ""}
      </div>${(window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.FLECHE_DEFILE) || ""}`;
}

// (v481) LE MORAL d'un membre du camp (le clan nomade, CLAN_NOMADE.md) : « chaque personnage du clan a une
// jauge de moral, affichée dans son fil invisible, héros principaux compris » ; ses dernières variations.
function htmlMoral(id) {
    const camp = window.CAMP && window.CAMP.lire ? window.CAMP.lire() : null;
    const mb = camp && (camp.Membres || {})[id];
    if (!mb) return "";
    const R = window.CAMP.regles || {};
    const v = Number.isFinite(Number(mb.Moral)) ? Number(mb.Moral) : 60;
    const histo = (Array.isArray(mb.Moral_Historique) ? mb.Moral_Historique : []).slice().reverse().slice(0, 6);
    return `<div class="moral-liens"><span class="cle-moral-liens">Moral</span><span class="jauge-liens"><i style="width:${v}%"></i></span><b>${v}</b>
        <small>${R.effetDuMoral ? echapper(R.effetDuMoral(v)) : ""}</small></div>
      ${histo.length ? `<ul class="variations-moral-liens">${histo.map(x => `<li><b class="${x.Delta > 0 ? "hausse" : "baisse"}">${x.Delta > 0 ? "+" : "−"}${Math.abs(x.Delta)}</b> ${echapper(x.Raison || "")}${x.Date_Jeu ? ` <span class="date-liens">${echapper(x.Date_Jeu)}</span>` : ""}</li>`).join("")}</ul>` : ""}`;
}

// ---------------------------------------------------------------------
//  LA PAGE DE DROITE : le radar et l'encart
// ---------------------------------------------------------------------
const signe = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(Math.round(v));
const modeDev = () => { try { return localStorage.getItem("ivalis_DEV_MODE") === "on"; } catch (e) { return false; } };
const ROUE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 2h3.4l.5 2.6c.7.2 1.3.5 1.9.9l2.3-1.3 2.4 2.4-1.3 2.3c.4.6.7 1.2.9 1.9l2.6.5v3.4l-2.6.5c-.2.7-.5 1.3-.9 1.9l1.3 2.3-2.4 2.4-2.3-1.3c-.6.4-1.2.7-1.9.9l-.5 2.6h-3.4l-.5-2.6c-.7-.2-1.3-.5-1.9-.9l-2.3 1.3-2.4-2.4 1.3-2.3c-.4-.6-.7-1.2-.9-1.9L2 13.7v-3.4l2.6-.5c.2-.7.5-1.3.9-1.9L4.2 5.6l2.4-2.4 2.3 1.3c.6-.4 1.2-.7 1.9-.9zM12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8z"/></svg>`;
function htmlEncart(choix) {
    const P = S(), l = choix.lien, a = l.axes || {}, aff = P.affinite(a);
    const de = l.de, vers = l.vers, admin = P.estAdminSocial && P.estAdminSocial();
    // (v425) Nico : « quand le mode dev est activé (et uniquement là), à côté de chaque barre,
    // une toute petite roue crantée rouge qui ouvre une réglette pour changer la jauge à la
    // main ; pour les tests ». Relâchée, la réglette enregistre (un « ajustement » du journal).
    const dev = modeDev();
    const barres = P.AXES.map(axe => {
        const [min, max] = P.BORNES[axe], v = P.nombre(a[axe]);
        const regle = dev && vue.regle === axe;
        return `<div class="axe-liens${dev ? " avec-roue" : ""}"><span>${P.NOMS_AXES[axe]}</span><b>${signe(v)}</b><span class="barre-liens"><i class="${v < 0 ? "neg" : ""}" style="width:${((v - min) / (max - min) * 100).toFixed(1)}%"></i></span>
          ${dev ? `<button type="button" class="roue-liens${regle ? " ouverte" : ""}" data-action="liens" data-cb="roue" data-axe="${axe}" title="Régler ${echapper(P.NOMS_AXES[axe])} (DEV)" aria-label="Régler ${echapper(P.NOMS_AXES[axe])}">${ROUE}</button>` : ""}</div>
          ${regle ? `<div class="reglette-liens"><input type="range" class="curseur-liens" min="${min}" max="${max}" step="1" value="${Math.round(v)}" data-axe="${axe}"><output>${signe(v)}</output></div>` : ""}`;
    }).join("");
    // (v417) Nico : « les derniers changements, oui, mais en rapport avec le personnage en
    // question » : seulement ce qui s'est passé ENTRE les deux (l'un a agi envers l'autre) ;
    // ce que l'un a seulement vu l'autre faire à un tiers n'y figure pas. Un ajustement à la
    // main reste ; un changement d'avant la v417 (sans acteur noté) aussi.
    const entreEux = (d) => d.type === "ajustement" || !d.acteur || ((d.acteur === de && d.cible === vers) || (d.acteur === vers && d.cible === de));
    const derniers = (l.derniers || []).filter(entreEux).slice().reverse().map(d => `<li class="${d.annule ? "annule" : ""}">${echapper(d.resume || "")} <span class="ecarts-liens">${Object.entries(d.ecarts || {}).filter(([, v]) => Math.round(Math.abs(Number(v) || 0)) > 0).map(([x, v]) => `${echapper(P.NOMS_AXES[x] || x).toLowerCase()} ${signe(v)}`).join(" · ")}</span>${d.annule ? " <i>(annulé)</i>" : admin ? ` <button type="button" class="annuler-liens" data-action="liens" data-cb="annuler" data-n="${d.n}">annuler</button>` : ""}</li>`).join("");
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
    // (v425) La réglette : le chiffre suit le doigt ; relâchée, la jauge s'enregistre.
    const curseur = pages.d.querySelector(".curseur-liens");
    if (curseur) {
        const sortie = curseur.parentNode.querySelector("output");
        curseur.addEventListener("input", () => { if (sortie) sortie.textContent = signe(Number(curseur.value)); });
        curseur.addEventListener("change", () => reglerJauge(curseur.dataset.axe, Number(curseur.value)));
    }
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
async function reglerJauge(axe, valeur) {
    if (!modeDev()) return;
    const P = S(), p = window.ID_PARTIE_COURANTE;
    const de = vue.regard === "in" ? vue.selection : vue.centre, vers = vue.regard === "in" ? vue.centre : vue.selection;
    if (!P || !p || !de || !vers) return;
    try { await P.ajusterLien(p, de, vers, { [axe]: valeur }); } catch (e) { alert(e.message || e); return; }
    await charger(true);
}
async function centrer(id) {
    if (!id || !ames()[id]) return;
    vue.centre = id; vue.selection = ""; vue.regle = "";
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
        son(); vue.selection = vue.selection === id ? "" : id; vue.regle = ""; rendre(); return;
    }
    if (cb === "centrer") { son(); await centrer(cible.dataset.id); return; }
    if (cb === "regard") { son(); vue.regard = cible.dataset.regard === "in" ? "in" : "out"; vue.selection = ""; rendre(); return; }
    if (cb === "fermer") { vue.selection = ""; vue.regle = ""; rendre(); return; }
    // (v425) La roue crantée (mode DEV) : la réglette de cette jauge s'ouvre (ou se referme).
    if (cb === "roue") { if (!modeDev()) return; son(); vue.regle = vue.regle === cible.dataset.axe ? "" : cible.dataset.axe; rendre(); return; }
    if (cb === "recit") { son(); vue.retourRecit = false; if (window.GRIMOIRE_RECIT && window.GRIMOIRE_RECIT.allerAuRecit) window.GRIMOIRE_RECIT.allerAuRecit(); return; }
    if (cb === "parametres") { son(); vue.retourParametres = false; if (window.GRIMOIRE_PARAMETRES) window.GRIMOIRE_PARAMETRES.revenirDesLiens(); return; }
    if (cb === "groupe") { son(); vue.retourGroupe = false; if (window.GRIMOIRE_GROUPE) window.GRIMOIRE_GROUPE.ouvrir(); return; }
    if (cb === "gestion") { son(); vue.retourGestion = false; if (window.GESTION_CAMP) window.GESTION_CAMP.ouvrir(); return; }
    // (v488) DEV : forcer le recrutement de ce PNJ dans le camp (le clan nomade), comme s'il avait été recruté.
    if (cb === "recruter-dev") {
        if (!modeDev() || !window.RECRUTEMENT) return;
        son();
        const refus = await window.RECRUTEMENT.rejoindreLeCamp(cible.dataset.id, { type: "invite", par: "le mode DEV" });
        if (refus) alert(refus);
        rendre();
        return;
    }
    const lien = () => { const de = vue.regard === "in" ? vue.selection : vue.centre, vers = vue.regard === "in" ? vue.centre : vue.selection; return { de, vers }; };
    // (v464) Supprimer un PNJ totalement (mode DEV) : ses images, sa fiche, son âme, ses liens, ses souvenirs.
    if (cb === "supprimer-pnj") {
        const id = cible.dataset.id, a = ames()[id];
        if (!modeDev() || !a || a.type !== "pnj" || !P || typeof P.supprimerPnj !== "function") return;
        if (!confirm(`Supprimer ${a.nom} de la partie, totalement ? Ses images, sa fiche, son âme, ses liens et ses souvenirs disparaissent de la base. C'est sans retour.`)) return;
        son();
        try { await P.supprimerPnj(p, id); } catch (e) { alert("Le PNJ n'a pas pu être supprimé : " + (e.message || e)); return; }
        vue.centre = ""; vue.selection = "";
        await charger(); return;
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
    vue.retourGestion = !!o.depuisGestion;    // (v481) depuis la gestion du camp
    // (v428) Nico : « les fils invisibles dans paramètres, le bouton ne fonctionne pas ». Le
    // livre attendait d'avoir tout lu dans la base avant de tourner : rien ne bougeait sous
    // le doigt et, si la lecture passait 8 secondes, la double page ressortait du livre
    // pendant l'attente (plus rien à atteindre). Il tourne tout de suite (« Le livre cherche
    // les âmes… »), lit pendant ce temps, et repose sa double page si elle était ressortie.
    if (o.id) { vue.centre = o.id; vue.selection = ""; }
    const lecture = charger();
    const aller = (essai) => {
        const i = g.indexDe(pages.g);
        if (i < 0) { poser(); enRoute = Date.now(); if (essai < 60) setTimeout(() => aller(essai + 1), 100); return; }
        g.allerALaPage(i);
    };
    enRoute = Date.now();
    aller(0);
    await lecture;
    // (v491) Un membre du camp : son âme par son identifiant (ou celle qui le désigne, un héros) ; jamais un autre PNJ
    // au nom voisin (« exact »).
    const parRef = o.id && !ames()[o.id] ? Object.values(ames()).find(x => x && x.ref === o.id) : null;
    if (o.id && ames()[o.id]) await centrer(o.id);
    else if (parRef) await centrer(parRef.id);
    else if (o.nom && !o.exact) {
        const t = sansAccent(o.nom), mm = typeof window.memeNomPNJIvalis === "function" ? window.memeNomPNJIvalis : (a, b) => sansAccent(a) === sansAccent(b);
        const a = Object.values(ames()).find(x => sansAccent(x.nom) === t) || Object.values(ames()).find(x => mm(o.nom, x.nom));
        if (a) await centrer(a.id);
    }
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
            if (!vue.regle && Date.now() - derniereLecture > 20000) { derniereLecture = Date.now(); charger(true); }
        } else if (g.pagesLiens().length && Date.now() - enRoute > 8000) g.definirLiens([]);
    } catch (e) { console.warn("Le livre : les fils invisibles", e); }
}, 1000);

window.GRIMOIRE_LIENS = { ouvrir, ouverte, agir, rendre, charger, centrer, vue: () => vue, pages: () => (pages ? [pages.g, pages.d] : []), disposerRadar, liensDuRegard, MAX_PORTRAITS };
