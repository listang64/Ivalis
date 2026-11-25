// =========================================================================
//  IVALIS — LA PAGE DU CAMP (v480)
// =========================================================================
//  Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md, étape 3) :
//    · « Le camp » du sommaire : l'écran (l'image sous le livre) fait un fondu au
//      noir, puis du noir à l'image pleine page du camp ; en même temps le livre
//      entier glisse vers le bas et disparaît. Au retour, la transition inverse.
//    · L'image est une superposition de 9 couches (1 = le premier plan). Taillée
//      pour un iPad : ailleurs, bord à bord ; si elle dépasse en hauteur, le bas
//      reste collé au bas de l'écran et c'est le haut qui est tronqué.
//    · Les encarts (posés par Nico avec l'outil DEV) : des boîtes aux proportions
//      égales (carrées), chacune dans une couche (elle passe devant ou derrière
//      les couches du décor) ; trois encarts spéciaux pour le compagnon du
//      pisteur (sol gros, sol petit, airs). « Copier le code » les donne pour
//      toutes les parties futures (ENCARTS_DEFAUT).
//    · À chaque ouverture, les personnages présents au camp (héros principaux
//      compris, membres en expédition exclus) sont placés au hasard dans les
//      encarts, une de leurs deux images en scène tirée au hasard.
//    · Cliquer sur un personnage : la discussion privée, sauf sur le sien et sur
//      celui d'un autre joueur connecté.
//    · Les cinq boutons, écrits sur une aquarelle : Former le conseil, Gestion du
//      camp, Flâner dans le camp, Expédition, Déplacer le camp. Et le menu « Mon
//      héros principal ».
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import * as CP from "./camp_pur.js?v=11";

// Les 9 couches, du premier plan au plus éloigné (le document, « Le graphique du camp »).
export const COUCHES = [
    "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1795470913/IMG_2313_v6mfqi.png",
    "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1795470914/IMG_2314_gmrnp7.png",
    "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1795470914/IMG_2315_xwzddp.png",
    "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1795470914/IMG_2316_l1ygzb.png",
    "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1795470914/IMG_2317_jte7g3.png",
    "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1795470914/IMG_2318_g9klx2.png",
    "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1795470914/IMG_2319_jctc5r.png",
    "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1795470914/IMG_2320_xzbgxg.png",
    "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1795470915/IMG_2321_xemtvn.png"
];
// L'image de référence affichée dans un encart en mode DEV.
export const IMAGE_REFERENCE_ENCART = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1795380914/E782C57D-531F-4D37-9FD3-21BFC7B95CAF_sf6vn2.png";
export const TYPES_ENCART = { perso: "Personnage", compagnon_gros: "Compagnon au sol (gros)", compagnon_petit: "Compagnon au sol (petit)", compagnon_air: "Compagnon dans les airs" };
// « COPIER LE CODE » : les encarts posés par Nico, collés ici, valent pour toutes les parties futures
// (la base, Carte_Livre/Camp_Encarts, passe devant tant qu'elle en a).
export const ENCARTS_DEFAUT = {};
// La hauteur sur la largeur de l'image (lue sur la première couche chargée ; un iPad en attendant).
let aspect = 1536 / 2048;

const $ = (id) => document.getElementById(id);
const echapper = (t) => String(t == null ? "" : t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const son = () => { try { if (typeof window.jouerSonClic === "function") window.jouerSonClic(); } catch (e) {} };
const estDev = () => { try { return localStorage.getItem("ivalis_DEV_MODE") === "on"; } catch (e) { return false; } };
const moi = () => { try { return localStorage.getItem("ID_JOUEUR_COURANT") || ""; } catch (e) { return ""; } };
const camp = () => (window.CAMP && window.CAMP.lire ? window.CAMP.lire() : null);
const refEncarts = () => doc(db, "Carte_Livre", "Camp_Encarts");

let encarts = { ...ENCARTS_DEFAUT }, prochainNumero = 1, ouvert = false, edition = false, selection = null, placement = {}, enTransition = false;
let personnages = {};   // id → { id, nom, joueur, fiche, images }

// ---------------------------------------------------------------------
//  L'ÉCRAN
// ---------------------------------------------------------------------
const TEINTE_BOUTON = { couleurs: ["#f3e3c0", "#ead3a2", "#f8eed6"], opacite: 0.88, nom: "camp-bouton" };
const BOUTONS = [
    ["conseil", "Former le conseil"], ["gestion", "Gestion du camp"], ["flaner", "Flâner dans le camp"],
    ["expedition", "Expédition"], ["deplacer", "Déplacer le camp"]
];
const lavis = (graine) => { const d = window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.dessins; return d && d.lavis ? d.lavis(TEINTE_BOUTON, graine) : ""; };
function construire() {
    let e = $("ecran-camp");
    if (e) return e;
    e = document.createElement("div");
    e.id = "ecran-camp";
    e.className = "ecran-camp";
    e.innerHTML = `
      <div class="decor-camp" id="decor-camp">
        ${COUCHES.map((u, i) => `<img class="couche-camp" data-couche="${i + 1}" src="${u}" alt="" draggable="false" style="z-index:${(10 - (i + 1)) * 10}">`).join("")}
        <div class="encarts-camp" id="encarts-camp"></div>
      </div>
      <div class="barre-camp">${BOUTONS.map(([id, t]) => `<button type="button" class="bouton-camp" data-camp="${id}">${lavis("camp-" + id)}<span>${t}</span></button>`).join("")}</div>
      <button type="button" class="retour-livre-camp" data-camp="livre">‹ Le livre</button>
      <div class="heros-camp" id="heros-camp"></div>
      <p class="note-camp" id="note-camp" aria-live="polite"></p>
      <button type="button" class="dev-encarts-camp" data-camp="dev">Encarts (DEV)</button>
      <div class="outils-encarts-camp" id="outils-encarts-camp"></div>`;
    document.body.appendChild(e);
    e.addEventListener("click", surClic);
    e.addEventListener("pointerdown", surAppui);
    window.addEventListener("pointermove", surGlisse);
    window.addEventListener("pointerup", surLache);
    window.addEventListener("resize", () => { if (ouvert) cadrer(); });
    e.querySelector('.couche-camp[data-couche="9"]').addEventListener("load", (ev) => {
        const img = ev.target;
        if (img.naturalWidth) { aspect = img.naturalHeight / img.naturalWidth; cadrer(); }
    });
    return e;
}
// LE CADRAGE : bord à bord ; le bas collé au bas de l'écran (le haut tronqué s'il dépasse).
function cadrer() {
    const d = $("decor-camp");
    if (!d) return;
    const l = window.innerWidth, h = l * aspect;
    Object.assign(d.style, { width: l + "px", height: h + "px", left: "0px", top: (window.innerHeight - h) + "px" });
    dessinerEncarts();
}

// ---------------------------------------------------------------------
//  LES TRANSITIONS
// ---------------------------------------------------------------------
const attendre = (ms) => new Promise(r => setTimeout(r, ms));
// Le livre entier (tout ce qui est posé sur la table) glisse vers le bas, ou remonte. La propriété
// `translate` ne touche pas aux `transform` déjà posés (le zoom de la scène, les marque-pages).
let glissements = [];
function glisserLivre(versLeBas) {
    const s = $("grimoire-scene");
    if (!s) return;
    if (versLeBas) {
        glissements.forEach(a => { try { a.cancel(); } catch (e) {} });
        glissements = [...s.children].filter(el => !el.classList.contains("grimoire-table") && typeof el.animate === "function")
            .map(el => el.animate([{ translate: "0 0" }, { translate: "0 120vh" }], { duration: 750, easing: "cubic-bezier(0.5, 0, 0.75, 0.3)", fill: "forwards" }));
        return;
    }
    glissements.forEach(a => { try { a.updatePlaybackRate(1); a.reverse(); a.onfinish = () => { try { a.cancel(); } catch (e) {} }; } catch (e) {} });
    glissements = [];
}
export async function ouvrir() {
    if (ouvert || enTransition) return false;
    if (!camp()) { noterLivre("Le camp n'existe pas encore."); return false; }
    enTransition = true;
    const e = construire();
    const g = $("ecran-grimoire");
    son();
    if (g) g.classList.add("vers-le-camp");          // la table s'éteint (fondu au noir)…
    glisserLivre(true);                               // …pendant que le livre glisse vers le bas
    await attendre(750);
    e.classList.add("affiche");
    cadrer();
    await preparerPersonnages();
    majHeros();
    majBoutons();
    requestAnimationFrame(() => e.classList.add("visible"));   // du noir à l'image du camp
    ouvert = true; enTransition = false;
    return true;
}
export async function fermer(puis) {
    if (!ouvert || enTransition) return false;
    enTransition = true;
    const e = $("ecran-camp"), g = $("ecran-grimoire");
    quitterEdition();
    e.classList.remove("visible");                   // fondu au noir
    await attendre(600);
    e.classList.remove("affiche");
    if (g) g.classList.remove("vers-le-camp");       // la table revient…
    glisserLivre(false);                              // …et le livre remonte
    ouvert = false; enTransition = false;
    await attendre(750);
    if (typeof puis === "function") { try { puis(); } catch (err) { console.error("[Camp] Retour au livre :", err); } }
    return true;
}
function noterLivre(texte) {
    const n = $("grimoire-note-index");
    if (n) { n.textContent = texte; n.classList.add("visible"); setTimeout(() => n.classList.remove("visible"), 3000); }
}
function noter(texte) {
    const n = $("note-camp");
    if (!n) return;
    n.textContent = texte;
    n.classList.add("visible");
    clearTimeout(noter.t);
    noter.t = setTimeout(() => n.classList.remove("visible"), 3500);
}

// ---------------------------------------------------------------------
//  LES PERSONNAGES
// ---------------------------------------------------------------------
async function lireFiche(id) {
    try { const s = await getDoc(doc(db, "Monde_PNJ", id)); return s.exists() ? s.data() : null; } catch (e) { return null; }
}
export async function preparerPersonnages() {
    const c = camp();
    personnages = {};
    if (!c) { placement = {}; dessinerEncarts(); return; }
    const persos = (window.PERSOS_JOUEURS_PARTIE || window.PERSOS_PARTIE || []).filter(h => h && h.idPersonnage && !h.estIllusion && !h.estMonstre && h.statut !== "Mort");
    const choix = (window.PARTIE_DATA || {}).Heros_Principaux || {};
    const principaux = [...new Set(persos.map(h => h.idJoueur).filter(Boolean))].map(j => CP.herosPrincipal(j, persos, choix));
    const partis = ((window.PARTIE_DATA || {}).Expedition || {}).Membres || [];
    const ids = CP.presentsAuCamp(c, principaux, partis);
    const compagnons = [];
    for (const id of ids) {
        const h = persos.find(x => x.idPersonnage === id);
        if (h) {
            // Le héros principal d'un autre joueur est « le personnage d'un autre joueur » ; ses autres
            // personnages, non joués, vivent au camp « traités comme des PNJ ». Les siens : jamais de discussion.
            const joueur = h.idJoueur && (h.idJoueur === moi() || principaux.includes(id)) ? h.idJoueur : "";
            personnages[id] = { id, nom: [h.prenom, h.nom].filter(Boolean).join(" ").trim(), joueur, images: (h.imagesCamp || []).map(i => i && i.url).filter(Boolean),
                                fiche: { Nom_PNJ: h.prenom || "", Race: h.race || "", URL_Cloudinary: h.urlCloudinary || h.urlPortraitReference || "" } };
            if (h.compagnon && !h.compagnon.mort && h.compagnon.image) compagnons.push({ id: "COMPAGNON_" + id, gabarit: h.compagnon.gabarit, image: h.compagnon.image });
            continue;
        }
        const f = await lireFiche(id);
        if (!f || f.Statut === "Mort") continue;
        personnages[id] = { id, nom: f.Nom_PNJ || "", joueur: "", images: (f.Images_Camp || []).map(i => i && i.url).filter(Boolean), fiche: f };
    }
    placement = CP.placerAuCamp(encarts, Object.values(personnages), compagnons);
    dessinerEncarts();
}

// LES ENCARTS : en jeu, les personnages placés ; en DEV, les boîtes colorées.
const couleurEncart = (n) => `hsla(${(Number(n) * 67) % 360}, 75%, 50%, 0.35)`;
function dessinerEncarts() {
    const zone = $("encarts-camp"), d = $("decor-camp");
    if (!zone || !d) return;
    const L = d.clientWidth, H = d.clientHeight;
    zone.innerHTML = Object.keys(encarts).map(n => {
        const e = encarts[n];
        const cote = e.cote * L, couche = Math.min(9, Math.max(1, Number(e.couche) || 1));
        const style = `left:${e.x * L}px;top:${e.y * H}px;width:${cote}px;height:${cote}px;z-index:${(10 - couche) * 10 + 5}`;
        if (edition) {
            return `<div class="encart-camp edition${selection === n ? " choisi" : ""}" data-encart="${n}" style="${style};background:${couleurEncart(n)}">
                <img class="reference-encart" src="${IMAGE_REFERENCE_ENCART}" alt="" draggable="false">
                <span class="etiquette-encart">${n} · couche ${couche}${(e.type || "perso") !== "perso" ? " · " + echapper(TYPES_ENCART[e.type] || e.type) : ""}</span>
                <span class="poignee-encart" data-poignee="${n}"></span></div>`;
        }
        const p = placement[n];
        if (!p) return "";
        const qui = personnages[p.id] || {};
        return `<div class="encart-camp" style="${style}"><button type="button" class="perso-camp${p.compagnon ? " compagnon" : ""}" data-perso="${echapper(p.id)}" title="${echapper(qui.nom || "")}">
                  <img src="${echapper(p.image)}" alt="${echapper(qui.nom || "")}" draggable="false"></button></div>`;
    }).join("");
    majOutils();
}

// ---------------------------------------------------------------------
//  LES GESTES
// ---------------------------------------------------------------------
async function surClic(ev) {
    const b = ev.target.closest("[data-camp], [data-perso], [data-outil], [data-fa]");
    if (!b) return;
    if (b.dataset.perso) return parlerA(b.dataset.perso);
    // Le menu « Mon héros principal » (grimoire_fiches.js) : sa fiche, ou un nouvel aventurier, dans le livre.
    if (b.dataset.fa === "fiche-principal") {
        son();
        const l = b.closest("#heros-camp") && $("heros-camp").querySelector(".liste-heros-principal");
        const id = (l && l.value) || (window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.herosPrincipalDe(moi()));
        return fermer(() => { if (id && window.GRIMOIRE_FICHES) window.GRIMOIRE_FICHES.ouvrir(id); });
    }
    if (b.dataset.fa === "creer") {
        son();
        return fermer(() => { if (window.GRIMOIRE_CREATION && window.GRIMOIRE_CREATION.commencer()) return; if (typeof window.ouvrirCreationHero === "function") window.ouvrirCreationHero(); });
    }
    if (b.dataset.outil) return outil(b.dataset.outil);
    const quoi = b.dataset.camp;
    if (quoi === "livre") { son(); return fermer(); }
    if (quoi === "dev") { son(); return edition ? quitterEdition() : entrerEdition(); }
    if (quoi === "gestion") { son(); if (!window.GESTION_CAMP) return noter("La gestion du camp se prépare."); return fermer(() => window.GESTION_CAMP.ouvrir()); }
    if (quoi === "flaner") { son(); return fermer(() => { if (window.GRIMOIRE_RECIT) (window.GRIMOIRE_RECIT.allerAuRecit || window.GRIMOIRE_RECIT.marqueDuRecit)(); }); }
    if (quoi === "expedition") { son(); return fermer(() => { if (window.EXPEDITION && window.EXPEDITION.ouvrir) window.EXPEDITION.ouvrir(); else if (window.GRIMOIRE_GROUPE) window.GRIMOIRE_GROUPE.ouvrir(); }); }
    if (quoi === "conseil") {
        son();
        if (window.CONSEIL && window.CONSEIL.ouvrir) { const r = window.CONSEIL.peutOuvrir ? window.CONSEIL.peutOuvrir() : ""; if (r) return noter(r); return window.CONSEIL.ouvrir(); }
        return noter("Le conseil se prépare.");
    }
    if (quoi === "deplacer") {
        son();
        const r = window.DEPLACEMENT_CAMP && window.DEPLACEMENT_CAMP.peutDeplacer ? window.DEPLACEMENT_CAMP.peutDeplacer() : "Le conseil doit d'abord voter le déplacement du camp.";
        if (r) return noter(r);
        return fermer(() => window.DEPLACEMENT_CAMP.commencer());
    }
}
async function parlerA(id) {
    const p = personnages[id];
    if (!p) return;
    const connectes = window.CAMP && window.CAMP.joueursConnectes ? await window.CAMP.joueursConnectes() : new Set();
    if (!CP.peutDiscuterAuCamp(p, moi(), connectes)) return;
    son();
    if (window.DISCUSSION && window.DISCUSSION.ouvrir) window.DISCUSSION.ouvrir({ id: p.id, nom: p.nom, fiche: p.fiche || {}, depuis: "" });
}
function majBoutons() {
    const e = $("ecran-camp");
    if (!e) return;
    const dep = e.querySelector('[data-camp="deplacer"]');
    const r = window.DEPLACEMENT_CAMP && window.DEPLACEMENT_CAMP.peutDeplacer ? window.DEPLACEMENT_CAMP.peutDeplacer() : "pas encore";
    if (dep) dep.classList.toggle("eteint", !!r);
    const dev = e.querySelector(".dev-encarts-camp");
    if (dev) dev.style.display = estDev() ? "block" : "none";
}
const signatureHeros = () => (window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.signatureChoixHeros ? window.GRIMOIRE_FICHES.signatureChoixHeros() : "");
function majHeros() {
    const z = $("heros-camp");
    if (!z) return;
    z.innerHTML = window.GRIMOIRE_FICHES && window.GRIMOIRE_FICHES.htmlChoixHeros ? window.GRIMOIRE_FICHES.htmlChoixHeros() : "";
    z.dataset.signature = signatureHeros();
}

// ---------------------------------------------------------------------
//  L'OUTIL DEV DES ENCARTS
// ---------------------------------------------------------------------
function entrerEdition() { if (!estDev()) return; edition = true; selection = null; dessinerEncarts(); }
function quitterEdition() { if (!edition) return; edition = false; selection = null; dessinerEncarts(); }
function majOutils() {
    const z = $("outils-encarts-camp");
    if (!z) return;
    if (!edition) { z.innerHTML = ""; z.style.display = "none"; return; }
    z.style.display = "flex";
    const e = selection && encarts[selection];
    z.innerHTML = `<button type="button" data-outil="nouveau">+ Encart</button>
        ${e ? `<span>Encart ${selection}</span>
          <button type="button" data-outil="monter" title="Plus près (couche plus petite)">▲ couche</button>
          <button type="button" data-outil="descendre" title="Plus loin (couche plus grande)">▼ couche</button>
          <select data-outil-type>${Object.keys(TYPES_ENCART).map(t => `<option value="${t}"${(e.type || "perso") === t ? " selected" : ""}>${TYPES_ENCART[t]}</option>`).join("")}</select>
          <button type="button" data-outil="supprimer">Supprimer</button>` : ""}
        <button type="button" data-outil="copier">Copier le code</button>
        <button type="button" data-outil="fermer">Fermer</button>`;
    const sel = z.querySelector("[data-outil-type]");
    if (sel) sel.onchange = () => { if (encarts[selection]) { encarts[selection].type = sel.value; enregistrer(); dessinerEncarts(); } };
}
async function outil(quoi) {
    son();
    if (quoi === "fermer") return quitterEdition();
    if (quoi === "nouveau") {
        const n = String(prochainNumero++);
        encarts[n] = { x: 0.45, y: 0.55, cote: 0.08, couche: 3, type: "perso" };
        selection = n;
    }
    const e = selection && encarts[selection];
    if (quoi === "monter" && e) e.couche = Math.max(1, (Number(e.couche) || 1) - 1);
    if (quoi === "descendre" && e) e.couche = Math.min(9, (Number(e.couche) || 1) + 1);
    if (quoi === "supprimer" && e) { delete encarts[selection]; selection = null; }
    if (quoi === "copier") return copierLeCode();
    await enregistrer();
    dessinerEncarts();
}
export function codeDesEncarts() {
    const propre = {};
    Object.keys(encarts).sort((a, b) => Number(a) - Number(b)).forEach(n => {
        const e = encarts[n], r = (v) => Math.round(Number(v) * 10000) / 10000;
        propre[n] = { x: r(e.x), y: r(e.y), cote: r(e.cote), couche: Number(e.couche) || 1, type: e.type || "perso" };
    });
    return `export const ENCARTS_DEFAUT = ${JSON.stringify(propre, null, 2)};`;
}
async function copierLeCode() {
    const code = codeDesEncarts();
    try { await navigator.clipboard.writeText(code); noter("Le code des encarts est copié."); }
    catch (e) { window.prompt("Le code des encarts (à copier) :", code); }
    return code;
}
async function enregistrer() {
    try { await setDoc(refEncarts(), { Encarts: encarts, Prochain_Numero: prochainNumero, Le: Date.now() }); }
    catch (e) { console.error("[Camp] Les encarts :", e); }
}
// Glisser (déplacer) et étirer (la poignée : un carré, toujours).
let geste = null;
function surAppui(ev) {
    if (!edition) return;
    const poignee = ev.target.closest("[data-poignee]"), boite = ev.target.closest("[data-encart]");
    if (!poignee && !boite) return;
    const n = poignee ? poignee.dataset.poignee : boite.dataset.encart;
    const e = encarts[n], d = $("decor-camp");
    if (!e || !d) return;
    ev.preventDefault(); ev.stopPropagation();
    selection = n;
    geste = { n, type: poignee ? "etirer" : "glisser", x0: ev.clientX, y0: ev.clientY, e0: { ...e }, L: d.clientWidth, H: d.clientHeight };
    dessinerEncarts();
}
function surGlisse(ev) {
    if (!geste) return;
    const e = encarts[geste.n];
    if (!e) return;
    const dx = ev.clientX - geste.x0, dy = ev.clientY - geste.y0;
    if (geste.type === "glisser") { e.x = geste.e0.x + dx / geste.L; e.y = geste.e0.y + dy / geste.H; }
    else e.cote = Math.max(0.01, geste.e0.cote + Math.max(dx, dy) / geste.L);
    const el = document.querySelector(`[data-encart="${geste.n}"]`);
    if (el) Object.assign(el.style, { left: e.x * geste.L + "px", top: e.y * geste.H + "px", width: e.cote * geste.L + "px", height: e.cote * geste.L + "px" });
}
function surLache() {
    if (!geste) return;
    geste = null;
    enregistrer();
    dessinerEncarts();
}

// LES ENCARTS DE LA BASE (pour toutes les parties), écoutés.
function lireEncarts(data) {
    const brut = data && data.Encarts && Object.keys(data.Encarts).length ? data.Encarts : ENCARTS_DEFAUT;
    encarts = JSON.parse(JSON.stringify(brut || {}));
    const max = Math.max(0, ...Object.keys(encarts).map(Number).filter(Number.isFinite));
    prochainNumero = Math.max(Number(data && data.Prochain_Numero) || 1, max + 1);
}
let ecoute = false;
function ecouter() {
    if (ecoute) return;
    ecoute = true;
    try { onSnapshot(refEncarts(), (s) => { if (geste) return; lireEncarts(s.exists() ? s.data() : null); if (ouvert && !edition) { placement = {}; preparerPersonnages(); } else if (ouvert) dessinerEncarts(); }, () => {}); }
    catch (e) { console.warn("[Camp] L'écoute des encarts :", e); }
}
setTimeout(ecouter, 1500);
// Le héros principal change, le mode DEV aussi : la page suit.
// La partie quittée (ou le camp disparu) : la page du camp s'efface d'un coup, le livre revient.
function toutFermer() {
    const e = $("ecran-camp"), g = $("ecran-grimoire");
    quitterEdition();
    if (e) e.classList.remove("visible", "affiche");
    if (g) g.classList.remove("vers-le-camp");
    glissements.forEach(a => { try { a.cancel(); } catch (err) {} });
    glissements = [];
    ouvert = false; enTransition = false;
}
setInterval(() => {
    if (!ouvert) return;
    if (!window.ID_PARTIE_COURANTE || !camp()) return toutFermer();
    if (document.hidden) return;
    majBoutons();
    const z = $("heros-camp");
    if (z && !z.contains(document.activeElement) && z.dataset.signature !== signatureHeros()) majHeros();
}, 1500);

window.CAMP_SCENE = { ouvrir, fermer, ouvert: () => ouvert, preparerPersonnages, codeDesEncarts, encarts: () => encarts, placement: () => placement,
                      entrerEdition, quitterEdition, COUCHES, IMAGE_REFERENCE_ENCART, TYPES_ENCART, lireEncarts };
