// =========================================================================
//  IVALIS — LE STUDIO D'ANIMATION (Paramètres → Studio d'animation)
// =========================================================================
//  Nico : « quand on clique, une fenêtre s'ouvre : à gauche la réplique de la
//  carte actuelle du mode combat, mon pion posé sur un hexagone central et, à
//  côté, un pion ennemi inerte ; à droite la liste des futures animations de
//  combat. Un clic sur une animation la joue en direct sur mon pion. Pour
//  chaque animation, une petite case à cocher pour me rappeler si elle est
//  intégrée ou non. »
//
//  LA RÉPLIQUE, PAS LE PLATEAU. Le studio redessine la carte du combat (image,
//  taille des hexagones, opacité de la grille, cases gommées) avec la même
//  classe Plateau, dans son propre canvas : il ne touche jamais au plateau de
//  combat ni à ses pions, et peut s'ouvrir pendant une partie.
//
//  Les animations vivent dans animations_combat.js (le catalogue) ; les cases
//  « intégrée » dans Studio_Animations/etat (Firestore, partagées entre l'iPad
//  et le PC), avec une copie dans ce navigateur.
// =========================================================================
import { db } from "./firebase-config.js?v=2";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const echapper = (t) => String(t === undefined || t === null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const CLE_LOCALE = "ivalis_studio_animations_integrees";
const CHEMIN_ETAT = ["Studio_Animations", "etat"];
const VOISINS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

const studio = {
    plateau: null,
    largeur: 1800, hauteur: 1800,
    echelle: 1, x: 0, y: 0,
    caseHeros: { q: 0, r: 0 }, caseEnnemi: { q: 1, r: 0 },
    taillePion: 55,
    idHeros: null,
    integrees: {},
    enCours: null
};

// =========================================================================
//  LES CASES « INTÉGRÉE »
// =========================================================================
function lireLocal() {
    try { return JSON.parse(localStorage.getItem(CLE_LOCALE) || "{}") || {}; } catch (e) { return {}; }
}
function ecrireLocal(etat) {
    try { localStorage.setItem(CLE_LOCALE, JSON.stringify(etat)); } catch (e) {}
}
async function chargerIntegrees() {
    studio.integrees = lireLocal();
    try {
        const snap = await getDoc(doc(db, ...CHEMIN_ETAT));
        if (snap.exists()) {
            const enBase = (snap.data() || {}).Integrees || {};
            studio.integrees = { ...studio.integrees, ...enBase };
            ecrireLocal(studio.integrees);
        }
    } catch (e) { console.error("Studio : lecture des cases intégrées", e); }
}
window.marquerAnimationIntegree = async function (id, integree) {
    studio.integrees = { ...studio.integrees, [id]: !!integree };
    ecrireLocal(studio.integrees);
    rendreCompteur();
    try { await setDoc(doc(db, ...CHEMIN_ETAT), { Integrees: { [id]: !!integree }, Mis_A_Jour: Date.now() }, { merge: true }); }
    catch (e) { console.error("Studio : enregistrement de la case", e); }
};

// =========================================================================
//  QUI POSER SUR LA CARTE
// =========================================================================
// Mes héros (ceux de ce poste) ; à défaut (le MJ), tous les héros de la partie.
function herosDisponibles() {
    let moi = "";
    try { moi = localStorage.getItem("ID_JOUEUR_COURANT") || ""; } catch (e) {}
    const tous = (window.PERSOS_JOUEURS_PARTIE || window.PERSOS_PARTIE || [])
        .filter(p => p && !p.estMonstre && !p.estIllusion && !p.compagnonDe && !p.zombie);
    const miens = tous.filter(p => p.idJoueur === moi);
    return miens.length ? miens : tous;
}
const PION_INCONNU = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="#3a2a1a" stroke="#c9a24a" stroke-width="5"/>'
    + '<text x="50" y="64" text-anchor="middle" font-family="Georgia" font-size="44" fill="#f3dfa6">?</text></svg>');
function imageDuHeros(p) {
    if (!p) return PION_INCONNU;
    const pion = (window.TOKENS_VTT_DATA || {})[p.idPersonnage] || {};
    const url = pion.url || p.urlToken || p.urlCloudinary || "";
    if (!url) return PION_INCONNU;
    return typeof window.redimensionnerImageCloudinary === "function" ? window.redimensionnerImageCloudinary(url, 700) : url;
}
function imageEnnemi() {
    const url = window.IMAGE_TOKEN_ENNEMI || "";
    if (!url) return PION_INCONNU;
    return typeof window.redimensionnerImageCloudinary === "function" ? window.redimensionnerImageCloudinary(url, 700) : url;
}

// La case libre la plus proche du centre de la carte (ni gommée, ni mur), qui
// a au moins un voisin libre pour l'ennemi.
function caseLibre(q, r) {
    const e = studio.plateau ? studio.plateau.getCaseState(q, r) : {};
    return !e.isDeleted && !e.isBlocked;
}
function choisirCases() {
    for (let rayon = 0; rayon < 12; rayon++) {
        const cases = rayon === 0 ? [{ q: 0, r: 0 }] : studio.plateau.getHexesInRadius(0, 0, rayon)
            .filter(h => Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(-h.q - h.r)) === rayon);
        for (const c of cases) {
            if (!caseLibre(c.q, c.r)) continue;
            const v = VOISINS.map(([dq, dr]) => ({ q: c.q + dq, r: c.r + dr })).find(n => caseLibre(n.q, n.r));
            if (v) { studio.caseHeros = c; studio.caseEnnemi = v; return; }
        }
    }
    studio.caseHeros = { q: 0, r: 0 }; studio.caseEnnemi = { q: 1, r: 0 };
}

// =========================================================================
//  LA FENÊTRE
// =========================================================================
function fenetre() {
    let f = document.getElementById("studio-animation");
    if (f) return f;
    f = document.createElement("div");
    f.id = "studio-animation";
    f.className = "studio-voile";
    f.innerHTML = `
      <div class="studio-cadre">
        <div class="studio-entete">
          <div>
            <h2 class="studio-titre">Studio d'animation</h2>
            <p class="studio-sous-titre">La carte du combat, ton pion au centre, un ennemi inerte à côté. Touche une animation : elle part de ton pion, vers l'ennemi, avec son son.</p>
          </div>
          <button type="button" class="studio-fermer" title="Fermer" onclick="window.fermerStudioAnimation()">✕</button>
        </div>
        <div class="studio-corps">
          <div class="studio-gauche">
            <div id="studio-scene" class="studio-scene">
              <div id="studio-plateau" class="studio-plateau">
                <img id="studio-image-carte" class="studio-image-carte" alt="">
                <canvas id="studio-canvas" class="studio-canvas"></canvas>
              </div>
              <div id="studio-pions" class="studio-pions"></div>
            </div>
            <div class="studio-commandes">
              <label class="studio-choix-heros">Héros
                <select id="studio-heros" onchange="window.changerHerosStudio(this.value)"></select>
              </label>
              <button type="button" id="studio-btn-deplacer" class="studio-bouton studio-bouton-texte" onclick="window.basculerDeplacementStudio()">✥ Déplacer les pions</button>
              <span id="studio-aide-deplacer" class="studio-aide-deplacer">Glisse un pion sur une case libre</span>
              <span class="studio-commandes-espace"></span>
              <button type="button" class="studio-bouton" title="Dézoomer" onclick="window.zoomStudio(1 / 1.25)">−</button>
              <button type="button" class="studio-bouton" title="Zoomer" onclick="window.zoomStudio(1.25)">+</button>
              <button type="button" class="studio-bouton studio-bouton-texte" onclick="window.recentrerStudio()">Recentrer</button>
            </div>
          </div>
          <div class="studio-droite">
            <div class="studio-liste-entete">
              <span class="studio-liste-titre">Animations de combat</span>
              <span id="studio-compteur" class="studio-compteur"></span>
            </div>
            <div id="studio-liste" class="studio-liste"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(f);
    brancherCamera(document.getElementById("studio-scene"));
    return f;
}

window.ouvrirStudioAnimation = async function () {
    const f = fenetre();
    f.style.display = "flex";
    requestAnimationFrame(() => f.classList.add("ouvert"));
    construireCarte();
    remplirHeros();
    poserPions();
    window.recentrerStudio();
    rendreListe();
    await chargerIntegrees();
    rendreListe();
};
window.fermerStudioAnimation = function () {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    arreterTout();
    const sceneEl = document.getElementById("studio-scene");
    if (sceneEl) sceneEl.classList.remove("studio-deplacement");
    const bouton = document.getElementById("studio-btn-deplacer");
    if (bouton) bouton.classList.remove("actif");
    const f = document.getElementById("studio-animation");
    if (!f) return;
    f.classList.remove("ouvert");
    f.style.display = "none";
};

// --- LA CARTE : la même image, la même grille, les mêmes cases gommées ---
function construireCarte() {
    const source = window.PLATEAU_VTT;
    const imgJeu = document.getElementById("image-map-vtt");
    const url = imgJeu && imgJeu.getAttribute("src") && imgJeu.style.display !== "none" ? imgJeu.src : "";
    studio.largeur = (source && source.largeurLogique) || 1800;
    studio.hauteur = (source && source.hauteurLogique) || 1800;
    const conteneur = document.getElementById("studio-plateau");
    conteneur.style.width = studio.largeur + "px";
    conteneur.style.height = studio.hauteur + "px";
    const img = document.getElementById("studio-image-carte");
    if (url) { img.src = url; img.style.display = "block"; } else { img.removeAttribute("src"); img.style.display = "none"; }
    conteneur.classList.toggle("sans-carte", !url);

    if (typeof Plateau !== "function") return;
    studio.plateau = new Plateau("studio-canvas");
    if (source) {
        studio.plateau.hexSize = source.hexSize;
        studio.plateau.hexWidth = 2 * source.hexSize;
        studio.plateau.hexHeight = Math.sqrt(3) * source.hexSize;
        studio.plateau.gridOpacity = source.gridOpacity;
        studio.plateau.gridState = JSON.parse(JSON.stringify(source.gridState || {}));
    }
    studio.plateau.resize(studio.largeur, studio.hauteur);
    studio.plateau.renderMap();
    choisirCases();
}

// --- LES DEUX PIONS : le héros au centre, l'ennemi à côté ---
function remplirHeros() {
    const select = document.getElementById("studio-heros");
    const liste = herosDisponibles();
    if (!liste.some(p => p.idPersonnage === studio.idHeros)) studio.idHeros = liste.length ? liste[0].idPersonnage : null;
    select.innerHTML = liste.length
        ? liste.map(p => `<option value="${echapper(p.idPersonnage)}"${p.idPersonnage === studio.idHeros ? " selected" : ""}>${echapper((p.prenom || p.nom || "Héros").trim())}</option>`).join("")
        : `<option value="">Aucun héros</option>`;
    select.disabled = liste.length <= 1;
}
window.changerHerosStudio = function (id) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    arreterTout();
    studio.idHeros = id || null;
    poserPions();
};

function pion(id, image, classe) {
    const d = document.createElement("div");
    d.id = id;
    d.className = "token-vtt studio-pion " + classe;
    d.style.cssText = "position:absolute; transform:translate(-50%,-50%); border-radius:50%;";
    d.innerHTML = `<div class="token-ombre-sol studio-ombre"></div><img class="token-img-main studio-pion-image" alt="">`;
    const img = d.querySelector("img");
    img.onerror = () => { img.src = PION_INCONNU; };
    img.src = image;
    return d;
}
function poserPions() {
    const calque = document.getElementById("studio-pions");
    calque.innerHTML = "";
    const heros = herosDisponibles().find(p => p.idPersonnage === studio.idHeros) || null;
    const pionJeu = heros ? (window.TOKENS_VTT_DATA || {})[heros.idPersonnage] : null;
    studio.taillePion = (pionJeu && pionJeu.taille) || Math.round((studio.plateau ? studio.plateau.hexSize : 60) * 0.92);
    const h = pion("studio-pion-heros", imageDuHeros(heros), "studio-pion-heros");
    h.dataset.q = studio.caseHeros.q; h.dataset.r = studio.caseHeros.r;
    h.title = heros ? (heros.prenom || heros.nom || "") : "Héros";
    const e = pion("studio-pion-ennemi", imageEnnemi(), "studio-pion-ennemi");
    e.dataset.q = studio.caseEnnemi.q; e.dataset.r = studio.caseEnnemi.r;
    e.title = "Ennemi inerte";
    calque.appendChild(e);
    calque.appendChild(h);
    brancherGlisser(h, "heros");
    brancherGlisser(e, "ennemi");
    placerPions();
}

// --- DÉPLACER LES PIONS : un bouton, puis on les glisse ---
//  Nico : « un bouton pour bouger le pion joueur et l'ennemi. » Le bouton
//  arme le déplacement : un pion se prend du doigt (ou de la souris), suit le
//  geste, et se pose sur la case la plus proche — une case de la carte (ni
//  gommée, ni mur) qui n'est pas celle de l'autre pion ; sinon il revient.
//  Les animations lisent la position au moment de jouer : l'axe héros →
//  ennemi suit le déplacement.
window.basculerDeplacementStudio = function (actif) {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    const scene = document.getElementById("studio-scene");
    if (!scene) return;
    const armer = actif === undefined ? !scene.classList.contains("studio-deplacement") : !!actif;
    if (armer) arreterTout();
    scene.classList.toggle("studio-deplacement", armer);
    const bouton = document.getElementById("studio-btn-deplacer");
    if (bouton) bouton.classList.toggle("actif", armer);
};
function caseSousLePoint(clientX, clientY) {
    const scene = document.getElementById("studio-scene").getBoundingClientRect();
    const mx = (clientX - scene.left - studio.x) / studio.echelle;
    const my = (clientY - scene.top - studio.y) / studio.echelle;
    return studio.plateau.pixelToHex(mx, my);
}
window.deplacerPionStudio = function (quel, q, r) {
    const autre = quel === "heros" ? studio.caseEnnemi : studio.caseHeros;
    if (!studio.plateau || !caseLibre(q, r) || (autre.q === q && autre.r === r)) return false;
    if (quel === "heros") studio.caseHeros = { q, r }; else studio.caseEnnemi = { q, r };
    const el = document.getElementById(quel === "heros" ? "studio-pion-heros" : "studio-pion-ennemi");
    if (el) { el.dataset.q = q; el.dataset.r = r; }
    placerPions();
    return true;
};
function brancherGlisser(pionEl, quel) {
    pionEl.addEventListener("pointerdown", (e) => {
        const scene = document.getElementById("studio-scene");
        if (!scene || !scene.classList.contains("studio-deplacement")) return;
        e.stopPropagation();
        e.preventDefault();
        try { pionEl.setPointerCapture(e.pointerId); } catch (err) {}
        pionEl.classList.add("studio-pion-saisi");
        const cadre = scene.getBoundingClientRect();
        const suivre = (ev) => {
            pionEl.style.left = (ev.clientX - cadre.left) + "px";
            pionEl.style.top = (ev.clientY - cadre.top) + "px";
        };
        const lacher = (ev) => {
            pionEl.removeEventListener("pointermove", suivre);
            pionEl.removeEventListener("pointerup", lacher);
            pionEl.removeEventListener("pointercancel", lacher);
            pionEl.classList.remove("studio-pion-saisi");
            const c = caseSousLePoint(ev.clientX, ev.clientY);
            if (!window.deplacerPionStudio(quel, c.q, c.r)) placerPions();   // case interdite : il revient
        };
        pionEl.addEventListener("pointermove", suivre);
        pionEl.addEventListener("pointerup", lacher);
        pionEl.addEventListener("pointercancel", lacher);
    });
}

// --- LA CAMÉRA : comme au combat, on glisse et on zoome ---
function appliquerCamera() {
    const conteneur = document.getElementById("studio-plateau");
    if (conteneur) conteneur.style.transform = `translate(${studio.x}px, ${studio.y}px) scale(${studio.echelle})`;
    placerPions();
}
function placerPions() {
    if (!studio.plateau) return;
    document.querySelectorAll("#studio-pions .studio-pion").forEach(d => {
        const px = studio.plateau.hexToPixel(parseFloat(d.dataset.q), parseFloat(d.dataset.r));
        d.style.left = (studio.x + px.x * studio.echelle) + "px";
        d.style.top = (studio.y + px.y * studio.echelle) + "px";
        d.style.width = d.style.height = (studio.taillePion * studio.echelle) + "px";
    });
}
window.recentrerStudio = function () {
    const scene = document.getElementById("studio-scene");
    if (!scene || !studio.plateau) return;
    const w = scene.clientWidth || 800, h = scene.clientHeight || 600;
    // Un hexagone d'environ un cinquième de la scène : les pions assez gros
    // pour bien voir l'animation, et la carte autour pour le décor.
    studio.echelle = Math.max(0.2, Math.min(4, (w / 4.6) / (2 * studio.plateau.hexSize)));
    const a = studio.plateau.hexToPixel(studio.caseHeros.q, studio.caseHeros.r);
    const b = studio.plateau.hexToPixel(studio.caseEnnemi.q, studio.caseEnnemi.r);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    studio.x = w / 2 - cx * studio.echelle;
    studio.y = h / 2 - cy * studio.echelle;
    appliquerCamera();
};
window.zoomStudio = function (facteur, ancreX, ancreY) {
    const scene = document.getElementById("studio-scene");
    if (!scene) return;
    const ax = ancreX !== undefined ? ancreX : scene.clientWidth / 2;
    const ay = ancreY !== undefined ? ancreY : scene.clientHeight / 2;
    const nouvelle = Math.max(0.1, Math.min(6, studio.echelle * facteur));
    const reel = nouvelle / studio.echelle;
    studio.x = ax - (ax - studio.x) * reel;
    studio.y = ay - (ay - studio.y) * reel;
    studio.echelle = nouvelle;
    appliquerCamera();
};
function brancherCamera(scene) {
    const pointeurs = new Map();
    let ecartPince = 0;
    scene.addEventListener("pointerdown", (e) => {
        pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try { scene.setPointerCapture(e.pointerId); } catch (err) {}
        if (pointeurs.size === 2) { const [p1, p2] = [...pointeurs.values()]; ecartPince = Math.hypot(p1.x - p2.x, p1.y - p2.y); }
    });
    scene.addEventListener("pointermove", (e) => {
        const avant = pointeurs.get(e.pointerId);
        if (!avant) return;
        const maintenant = { x: e.clientX, y: e.clientY };
        pointeurs.set(e.pointerId, maintenant);
        if (pointeurs.size === 1) {
            studio.x += maintenant.x - avant.x;
            studio.y += maintenant.y - avant.y;
            appliquerCamera();
        } else if (pointeurs.size === 2) {
            const [p1, p2] = [...pointeurs.values()];
            const ecart = Math.hypot(p1.x - p2.x, p1.y - p2.y);
            const r = scene.getBoundingClientRect();
            if (ecartPince > 0) window.zoomStudio(ecart / ecartPince, (p1.x + p2.x) / 2 - r.left, (p1.y + p2.y) / 2 - r.top);
            ecartPince = ecart;
        }
    });
    const lacher = (e) => { pointeurs.delete(e.pointerId); if (pointeurs.size < 2) ecartPince = 0; };
    scene.addEventListener("pointerup", lacher);
    scene.addEventListener("pointercancel", lacher);
    scene.addEventListener("wheel", (e) => {
        e.preventDefault();
        const r = scene.getBoundingClientRect();
        window.zoomStudio(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
}

// =========================================================================
//  LA LISTE, ET LE JEU EN DIRECT
// =========================================================================
function rendreCompteur() {
    const el = document.getElementById("studio-compteur");
    const anims = window.ANIMATIONS_COMBAT || [];
    if (el) el.textContent = `${anims.filter(a => studio.integrees[a.id]).length} / ${anims.length} intégrée${anims.length > 1 ? "s" : ""}`;
}
function rendreListe() {
    const liste = document.getElementById("studio-liste");
    if (!liste) return;
    const anims = window.ANIMATIONS_COMBAT || [];
    liste.innerHTML = anims.length === 0
        ? `<p class="studio-vide">Aucune animation pour l'instant.</p>`
        : anims.map((a, i) => `
          <div class="studio-anim${studio.integrees[a.id] ? " integree" : ""}" data-anim="${echapper(a.id)}">
            <button type="button" class="studio-anim-jouer" onclick="window.jouerAnimationStudio('${echapper(a.id)}')">
              <span class="studio-anim-numero">${i + 1}</span>
              <span class="studio-anim-texte">
                <span class="studio-anim-nom">${echapper(a.nom)} <span class="studio-anim-categorie">${echapper(a.categorie || "")}${a.sens ? " · " + echapper(a.sens) : ""}</span></span>
                <span class="studio-anim-description">${echapper(a.description || "")}</span>
              </span>
              <span class="studio-anim-lecture">▶</span>
            </button>
            <label class="studio-anim-case" title="Intégrée au combat ?">
              <input type="checkbox"${studio.integrees[a.id] ? " checked" : ""}
                     onchange="window.marquerAnimationIntegree('${echapper(a.id)}', this.checked); this.closest('.studio-anim').classList.toggle('integree', this.checked)">
              <span>Intégrée</span>
            </label>
          </div>`).join("");
    rendreCompteur();
}

// Tout ce qu'une animation a laissé derrière elle disparaît : effets posés,
// transformations en cours. Le pion revient tel qu'il était.
function arreterTout() {
    // La lecture en cours se tait : plus de son, plus d'effet posé.
    if (typeof window.annulerAnimationsCombat === "function") window.annulerAnimationsCombat();
    const calque = document.getElementById("studio-pions");
    if (!calque) return;
    calque.querySelectorAll(".anim-effet").forEach(e => e.remove());
    calque.querySelectorAll("*").forEach(el => (el.getAnimations ? el.getAnimations() : []).forEach(a => a.cancel()));
    document.querySelectorAll("#studio-liste .studio-anim.joue").forEach(r => r.classList.remove("joue"));
    studio.enCours = null;
}

window.jouerAnimationStudio = async function (id) {
    arreterTout();
    // Jouer, c'est reposer les pions : le déplacement se désarme.
    const sceneEl = document.getElementById("studio-scene");
    if (sceneEl && sceneEl.classList.contains("studio-deplacement")) window.basculerDeplacementStudio(false);
    const scene = {
        lanceur: document.getElementById("studio-pion-heros"),
        cible: document.getElementById("studio-pion-ennemi"),
        calque: document.getElementById("studio-pions")
    };
    if (!scene.lanceur || typeof window.jouerAnimationCombat !== "function") return false;
    const jeton = {};
    studio.enCours = jeton;
    const ligne = document.querySelector(`#studio-liste .studio-anim[data-anim="${id}"]`);
    if (ligne) ligne.classList.add("joue");
    const ok = await window.jouerAnimationCombat(id, scene);
    if (studio.enCours === jeton) {
        studio.enCours = null;
        if (ligne) ligne.classList.remove("joue");
    }
    return ok;
};
