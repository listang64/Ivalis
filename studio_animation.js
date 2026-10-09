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
//  Les animations vivent dans animations_combat.js (le moteur et les dix
//  premières) et animations_catalogue.js (tout le reste) ; les cases
//  « intégrée » dans Studio_Animations/etat (Firestore, partagées entre l'iPad
//  et le PC), avec une copie dans ce navigateur.
//
//  LE TERRAIN DU JEU. Les zones persistantes, les murs de terre et les gravats
//  se dessinent ici avec les fonctions du combat (combat.js, murs_terre.js) :
//  les mêmes nappes, la même roche. Ils restent sur la carte du Studio (un mur
//  bloque les pions) jusqu'à « ⟲ Replacer ». Les sorts qui visent des cases se
//  ciblent à la main : on touche les hexagones, puis « Lancer ».
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
    // Les cases de départ (« Replacer les pions » y ramène).
    departHeros: { q: 0, r: 0 }, departEnnemi: { q: 1, r: 0 },
    taillePion: 55,
    idHeros: null,
    integrees: {},
    enCours: null,
    // Le terrain posé par les animations : nappes, murs, gravats (clé « q_r »).
    terrain: { zones: new Map(), murs: new Map(), gravats: new Set() },
    // Le ciblage en cours : { id, nom, regle, cases }.
    ciblage: null
};
const cleCase = (q, r) => `${q}_${r}`;

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
    return !e.isDeleted && !e.isBlocked && !studio.terrain.murs.has(cleCase(q, r));
}
function choisirCases() {
    for (let rayon = 0; rayon < 12; rayon++) {
        const cases = rayon === 0 ? [{ q: 0, r: 0 }] : studio.plateau.getHexesInRadius(0, 0, rayon)
            .filter(h => Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(-h.q - h.r)) === rayon);
        for (const c of cases) {
            if (!caseLibre(c.q, c.r)) continue;
            const v = VOISINS.map(([dq, dr]) => ({ q: c.q + dq, r: c.r + dr })).find(n => caseLibre(n.q, n.r));
            if (v) { studio.caseHeros = c; studio.caseEnnemi = v; memoriserDepart(); return; }
        }
    }
    studio.caseHeros = { q: 0, r: 0 }; studio.caseEnnemi = { q: 1, r: 0 };
    memoriserDepart();
}
function memoriserDepart() {
    studio.departHeros = { ...studio.caseHeros };
    studio.departEnnemi = { ...studio.caseEnnemi };
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
                <svg id="studio-zones" class="studio-terrain-svg studio-zones" xmlns="http://www.w3.org/2000/svg"></svg>
                <div id="studio-gravats" class="studio-gravats"></div>
                <svg id="studio-cibles" class="studio-terrain-svg studio-cibles" xmlns="http://www.w3.org/2000/svg"></svg>
              </div>
              <div id="studio-pions" class="studio-pions"><div id="studio-murs" class="studio-murs"></div></div>
            </div>
            <div id="studio-ciblage" class="studio-ciblage" style="display:none">
              <div class="studio-ciblage-titre">🎯 <span class="studio-ciblage-nom"></span></div>
              <div class="studio-ciblage-consigne"></div>
              <div class="studio-ciblage-compte"></div>
              <div class="studio-ciblage-boutons">
                <button type="button" class="studio-ciblage-lancer" onclick="window.lancerCiblageStudio()">Lancer</button>
                <button type="button" class="studio-ciblage-annuler" onclick="window.annulerCiblageStudio()">Annuler</button>
              </div>
            </div>
            <div class="studio-commandes">
              <label class="studio-choix-heros">Héros
                <select id="studio-heros" onchange="window.changerHerosStudio(this.value)"></select>
              </label>
              <button type="button" id="studio-btn-deplacer" class="studio-bouton studio-bouton-texte" title="Déplacer les pions à la main" onclick="window.basculerDeplacementStudio()">✥ Déplacer</button>
              <span id="studio-aide-deplacer" class="studio-aide-deplacer">Glisse un pion sur une case libre</span>
              <button type="button" id="studio-btn-ralenti" class="studio-bouton studio-bouton-texte" title="Rejouer au ralenti pour bien voir" onclick="window.basculerRalentiStudio()">🐢 Ralenti</button>
              <button type="button" id="studio-btn-replacer" class="studio-bouton studio-bouton-texte" title="Ramener les deux pions sur leurs cases de départ et effacer le terrain posé (zones, murs, gravats)" onclick="window.replacerPionsStudio()">⟲ Replacer</button>
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
            <div id="studio-sections" class="studio-sections"></div>
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
    fermerCiblage();
    window.basculerRalentiStudio(false, true);
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
    // Une carte neuve, un terrain nu.
    fermerCiblage();
    viderTerrain();
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
    // Tout, sauf le calque des murs de terre (le terrain reste).
    calque.querySelectorAll(":scope > :not(#studio-murs)").forEach(e => e.remove());
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
    if (armer) { arreterTout(); fermerCiblage(); }
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
// REPLACER LES PIONS : les déplacements des animations sont réels (le pion
// reste sur sa nouvelle case, comme en combat) ; ce bouton les ramène sur
// leurs cases de départ, et efface le terrain posé (zones, murs, gravats).
window.replacerPionsStudio = function () {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    arreterTout();
    viderTerrain();
    if (studio.ciblage) rendreCiblage();
    studio.caseHeros = { ...studio.departHeros };
    studio.caseEnnemi = { ...studio.departEnnemi };
    const h = document.getElementById("studio-pion-heros"), e = document.getElementById("studio-pion-ennemi");
    if (h) { h.dataset.q = studio.caseHeros.q; h.dataset.r = studio.caseHeros.r; }
    if (e) { e.dataset.q = studio.caseEnnemi.q; e.dataset.r = studio.caseEnnemi.r; }
    window.recentrerStudio();
};
// L'échange de places (le Transfert).
function echangerPions() {
    const h = studio.caseHeros;
    studio.caseHeros = studio.caseEnnemi;
    studio.caseEnnemi = h;
    const ph = document.getElementById("studio-pion-heros"), pe = document.getElementById("studio-pion-ennemi");
    if (ph) { ph.dataset.q = studio.caseHeros.q; ph.dataset.r = studio.caseHeros.r; }
    if (pe) { pe.dataset.q = studio.caseEnnemi.q; pe.dataset.r = studio.caseEnnemi.r; }
    placerPions();
    return true;
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
            else memoriserDepart();   // la scène voulue : « Replacer les pions » y ramènera
        };
        pionEl.addEventListener("pointermove", suivre);
        pionEl.addEventListener("pointerup", lacher);
        pionEl.addEventListener("pointercancel", lacher);
    });
}

// --- LE RALENTI : la même animation, deux fois et demie plus lente ---
window.basculerRalentiStudio = function (actif, sansSon) {
    if (!sansSon && typeof window.jouerSonClic === "function") window.jouerSonClic();
    const bouton = document.getElementById("studio-btn-ralenti");
    const armer = actif === undefined ? !(bouton && bouton.classList.contains("actif")) : !!actif;
    window.VITESSE_ANIMATIONS = armer ? 0.4 : 1;
    if (bouton) bouton.classList.toggle("actif", armer);
};

// --- LA GRILLE, pour les animations : cases, voisins, cases libres ---
//  Les animations marchent de case en case, posent des zones sur des
//  hexagones entiers, cherchent une case libre pour un allié : elles lisent
//  la carte du studio par ces quelques questions (le combat fournira les
//  siennes, avec la même forme).
function grilleDuStudio() {
    if (!studio.plateau) return null;
    const occupee = (q, r) => (studio.caseHeros.q === q && studio.caseHeros.r === r) || (studio.caseEnnemi.q === q && studio.caseEnnemi.r === r);
    return {
        pixel: (q, r) => { const p = studio.plateau.hexToPixel(q, r); return { x: studio.x + p.x * studio.echelle, y: studio.y + p.y * studio.echelle }; },
        caseDe: (el) => (el && el.dataset && el.dataset.q !== undefined && el.dataset.q !== "") ? { q: parseFloat(el.dataset.q), r: parseFloat(el.dataset.r) } : null,
        existe: (q, r) => { const e = studio.plateau.getCaseState(q, r) || {}; return !e.isDeleted; },
        libre: (q, r) => caseLibre(q, r) && !occupee(q, r)
    };
}

// --- LA CAMÉRA : comme au combat, on glisse et on zoome ---
function appliquerCamera() {
    const transformation = `translate(${studio.x}px, ${studio.y}px) scale(${studio.echelle})`;
    const conteneur = document.getElementById("studio-plateau");
    if (conteneur) conteneur.style.transform = transformation;
    // Les murs, au-dessus des pions, suivent la carte (comme #transform-murs au combat).
    const murs = document.getElementById("studio-murs");
    if (murs) murs.style.transform = transformation;
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
    // UNE TOUCHE (le doigt n'a presque pas bougé) pendant un ciblage : la case
    // sous le doigt est prise ou rendue. Un vrai glissé, lui, déplace la carte.
    let toucher = null;
    scene.addEventListener("pointerdown", (e) => {
        pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        try { scene.setPointerCapture(e.pointerId); } catch (err) {}
        toucher = pointeurs.size === 1 ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
        if (pointeurs.size === 2) { const [p1, p2] = [...pointeurs.values()]; ecartPince = Math.hypot(p1.x - p2.x, p1.y - p2.y); }
    });
    scene.addEventListener("pointermove", (e) => {
        const avant = pointeurs.get(e.pointerId);
        if (!avant) return;
        if (toucher && Math.hypot(e.clientX - toucher.x, e.clientY - toucher.y) > 6) toucher = null;
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
    scene.addEventListener("pointerup", (e) => {
        const touche = toucher && toucher.id === e.pointerId && pointeurs.size === 1;
        toucher = null;
        lacher(e);
        if (touche && studio.ciblage && studio.plateau) {
            const c = caseSousLePoint(e.clientX, e.clientY);
            window.toucherCaseStudio(c.q, c.r);
        }
    });
    scene.addEventListener("pointercancel", (e) => { toucher = null; lacher(e); });
    scene.addEventListener("wheel", (e) => {
        e.preventDefault();
        const r = scene.getBoundingClientRect();
        window.zoomStudio(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
}

// =========================================================================
//  LE TERRAIN : les nappes, les murs de terre et les gravats DU JEU
// =========================================================================
//  Nico : « pour ceux-là, mets dans le Studio les mêmes que ceux qu'on a
//  implantés dans le jeu ; on pourra les retravailler en partant de ça. »
//  Les nappes : dessinerHexZonePersistante (combat.js, RENDU_ZONES_PERSISTANTES),
//  dans un SVG de la carte du Studio, sous les pions. Les murs : la roche de
//  murs_terre.js (dessinerMurTerre), reliée à ses voisines et composée en un
//  seul canvas, au-dessus des pions, comme au combat. Les gravats : le tas de
//  dessinerGravatsTerre, à plat sur la case. Un mur bloque la case (on ne
//  peut ni y glisser un pion ni y marcher) ; tout part avec « ⟲ Replacer ».
const NS_SVG = "http://www.w3.org/2000/svg";
const SUFFIXE_DEFS = "-studio";
const rayonCase = () => (studio.plateau ? studio.plateau.hexSize : 50);
const pixelPlateau = (q, r) => studio.plateau.hexToPixel(q, r);
const idMur = (q, r) => `mur_studio_${q}_${r}`;
function caseExiste(q, r) {
    if (!studio.plateau) return false;
    const e = studio.plateau.getCaseState(q, r) || {};
    const p = pixelPlateau(q, r);
    return !e.isDeleted && p.x >= 0 && p.y >= 0 && p.x <= studio.largeur && p.y <= studio.hauteur;
}
// Du balisage SVG en nœuds (DOMParser, comme le combat : innerHTML est
// capricieux pour le SVG sur iPad).
function noeudsSvg(balisage) {
    try {
        const d = new DOMParser().parseFromString(`<svg xmlns="${NS_SVG}">${balisage}</svg>`, "image/svg+xml");
        if (d.querySelector("parsererror")) return [];
        return Array.from(d.documentElement.childNodes).map(n => document.importNode(n, true));
    } catch (e) { return []; }
}

// --- LES NAPPES ---
function nappeSvg(type, q, r) {
    const rendu = window.RENDU_ZONES_PERSISTANTES;
    const g = document.createElementNS(NS_SVG, "g");
    g.setAttribute("class", "studio-nappe");
    g.dataset.case = cleCase(q, r);
    g.dataset.type = type;
    const leger = studio.terrain.zones.size > 12;
    noeudsSvg(rendu.hexagone(type, { q, r }, rayonCase(), leger, pixelPlateau(q, r), SUFFIXE_DEFS)).forEach(n => g.appendChild(n));
    return g;
}
function preparerSvgZones() {
    const svg = document.getElementById("studio-zones");
    const rendu = window.RENDU_ZONES_PERSISTANTES;
    if (!svg || !rendu || !studio.plateau) return null;
    if (!svg.querySelector("defs")) {
        rendu.style();
        noeudsSvg(rendu.defs(rayonCase(), SUFFIXE_DEFS)).forEach(n => svg.insertBefore(n, svg.firstChild));
    }
    return svg;
}
function rendreZones() {
    const svg = document.getElementById("studio-zones");
    if (!svg) return;
    svg.innerHTML = "";
    if (!preparerSvgZones()) return;
    studio.terrain.zones.forEach(z => { z.el = nappeSvg(z.type, z.q, z.r); svg.appendChild(z.el); });
}

// --- LES MURS ---
function geometrieMur() {
    const G = window.GEOMETRIE_MURS_TERRE || { largeur: 128, hauteur: 200, pied: 130, emprise: 1.9, empriseGravats: 1.8 };
    const l = rayonCase() * G.emprise, h = l * G.hauteur / G.largeur;
    return { G, l, h, echelle: G.largeur / l, pied: G.pied / G.hauteur };
}
// Les 6 voisines d'une case de mur, vues du dessin (voisinsDuMur, murs_terre.js) :
// « mur », « casse » (des gravats) ou rien. `avec` : des murs qui vont se lever.
function voisinsMur(q, r, echelle, avec) {
    const ici = pixelPlateau(q, r);
    return VOISINS.map(([dq, dr]) => {
        const la = pixelPlateau(q + dq, r + dr), k = cleCase(q + dq, r + dr);
        const etat = (studio.terrain.murs.has(k) || (avec && avec.has(k))) ? "mur" : (studio.terrain.gravats.has(k) ? "casse" : null);
        return { dx: (la.x - ici.x) * echelle, dy: (la.y - ici.y) * echelle, etat };
    });
}
// Les dessins, gardés (comme au combat) : un canvas par mur et par voisinage.
const DESSINS = new Map();
function dessinMur(q, r, p = {}) {
    if (typeof window.dessinerMurTerre !== "function" || !studio.plateau) return null;
    const { echelle } = geometrieMur();
    const px = pixelPlateau(q, r);
    const mur = studio.terrain.murs.get(cleCase(q, r));
    const id = p.graine || idMur(q, r);
    const teinte = p.seul ? null : ((mur && mur.idLanceur) || studio.idHeros || "studio");
    const voisins = p.seul ? null : voisinsMur(q, r, echelle, p.avec);
    const origine = p.seul ? undefined : { x: px.x * echelle, y: px.y * echelle };
    const signature = (voisins || []).map(v => (v.etat || "-")[0]).join("");
    const cle = [id, signature, teinte || "", rayonCase()].join("|");
    if (!DESSINS.has(cle)) {
        try { DESSINS.set(cle, window.dessinerMurTerre(id, voisins, teinte || undefined, origine)); }
        catch (e) { DESSINS.set(cle, null); }
    }
    return DESSINS.get(cle);
}
function copieCanvas(c) {
    const n = document.createElement("canvas");
    n.width = c.width; n.height = c.height;
    n.getContext("2d").drawImage(c, 0, 0);
    return n;
}
// TOUS LES MURS DANS UN SEUL CANVAS, du haut de l'écran vers le bas (la roche
// du devant passe devant), sans couture : appliquerMursTerre, au combat. Les
// cases visées pendant un ciblage s'y montrent comme au combat : un pilier
// à demi transparent là où un mur va se lever, un mur entouré de rouge là où
// il va tomber.
function rendreMurs() {
    const calque = document.getElementById("studio-murs");
    if (!calque) return;
    calque.innerHTML = "";
    if (!studio.plateau) return;
    const { l, h, echelle, pied } = geometrieMur();
    const ciblage = studio.ciblage;
    const genre = ciblage ? ciblage.regle.genre : null;
    const visees = ciblage ? ciblage.cases : [];
    const murs = [...studio.terrain.murs.values()];
    const projets = (genre === "mur" || genre === "effondre")
        ? visees.filter(c => !studio.terrain.murs.has(cleCase(c.q, c.r))).map((c, i) => ({ q: c.q, r: c.r, projet: true, graine: "projet_" + i + "_" + c.q + "_" + c.r }))
        : [];
    const vises = genre === "effondre" ? new Set(visees.map(c => cleCase(c.q, c.r))) : new Set();
    const yEcran = (m) => pixelPlateau(m.q, m.r).y;
    const tous = [...murs, ...projets].sort((a, b) => (yEcran(a) - yEcran(b)) || (a.q - b.q)).map(m => {
        const px = pixelPlateau(m.q, m.r);
        const dessin = m.projet ? dessinMur(m.q, m.r, { seul: true, graine: m.graine }) : dessinMur(m.q, m.r);
        return { m, x0: px.x - l / 2, y0: px.y - h * pied, dessin };
    }).filter(t => t.dessin);
    if (!tous.length) return;
    const minX = Math.min(...tous.map(t => t.x0)), minY = Math.min(...tous.map(t => t.y0));
    const maxX = Math.max(...tous.map(t => t.x0 + l)), maxY = Math.max(...tous.map(t => t.y0 + h));
    const ensemble = document.createElement("canvas");
    ensemble.width = Math.ceil((maxX - minX) * echelle);
    ensemble.height = Math.ceil((maxY - minY) * echelle);
    const ctx = ensemble.getContext("2d");
    tous.forEach(t => {
        ctx.save();
        if (t.m.projet) ctx.globalAlpha = 0.55;
        ctx.drawImage(t.dessin, (t.x0 - minX) * echelle, (t.y0 - minY) * echelle);
        ctx.restore();
    });
    tous.filter(t => !t.m.projet && vises.has(cleCase(t.m.q, t.m.r))).forEach(t => {
        ctx.save();
        ctx.shadowColor = "#ff4c4c";
        ctx.shadowBlur = 14;
        ctx.drawImage(t.dessin, (t.x0 - minX) * echelle, (t.y0 - minY) * echelle);
        ctx.restore();
    });
    ensemble.className = "murs-terre-ensemble studio-murs-ensemble";
    ensemble.dataset.murs = String(murs.length);
    ensemble.dataset.projets = String(projets.length);
    ensemble.style.cssText = `position:absolute;left:${minX}px;top:${minY}px;width:${maxX - minX}px;height:${maxY - minY}px;pointer-events:none`;
    calque.appendChild(ensemble);
}

// --- LES GRAVATS ---
const IMAGES_GRAVATS = new Map();
function imageGravats(cle) {
    if (typeof window.dessinerGravatsTerre !== "function") return "";
    if (!IMAGES_GRAVATS.has(cle)) {
        try { IMAGES_GRAVATS.set(cle, window.dessinerGravatsTerre(cle).toDataURL("image/png")); }
        catch (e) { IMAGES_GRAVATS.set(cle, ""); }
    }
    return IMAGES_GRAVATS.get(cle);
}
function rendreGravats() {
    const calque = document.getElementById("studio-gravats");
    if (!calque) return;
    calque.innerHTML = "";
    if (!studio.plateau) return;
    const t = rayonCase() * geometrieMur().G.empriseGravats;
    studio.terrain.gravats.forEach(k => {
        if (studio.terrain.murs.has(k)) return;
        const [q, r] = k.split("_").map(Number);
        const src = imageGravats(k);
        if (!src) return;
        const px = pixelPlateau(q, r);
        const img = document.createElement("img");
        img.className = "gravats-terre studio-tas-gravats";
        img.alt = "";
        img.src = src;
        img.dataset.case = k;
        img.style.cssText = `left:${px.x - t / 2}px;top:${px.y - t / 2}px;width:${t}px;height:${t}px`;
        calque.appendChild(img);
    });
}

function viderTerrain() {
    studio.terrain.zones.clear();
    studio.terrain.murs.clear();
    studio.terrain.gravats.clear();
    const svg = document.getElementById("studio-zones");
    if (svg) svg.innerHTML = "";
    rendreZones();
    rendreMurs();
    rendreGravats();
}
// L'état du terrain, pour les bancs d'essai.
window.terrainStudio = () => ({
    zones: [...studio.terrain.zones.values()].map(z => ({ type: z.type, q: z.q, r: z.r })),
    murs: [...studio.terrain.murs.values()].map(m => ({ q: m.q, r: m.r, id: m.id })),
    gravats: [...studio.terrain.gravats]
});

// CE QUE LES ANIMATIONS PEUVENT FAIRE DU TERRAIN (scene.terrain) : dessiner un
// mur, un tas de gravats ou une nappe du jeu, et les laisser sur la carte.
function terrainDeScene() {
    const ecran = () => studio.echelle;
    const cases = (liste) => (liste || []).filter(c => c && c.q !== undefined && caseExiste(c.q, c.r));
    return {
        estMur: (q, r) => studio.terrain.murs.has(cleCase(q, r)),
        // La roche d'un mur sur cette case, à la taille de l'écran : reliée à ses
        // voisines si c'est un mur de la carte (ou un de ceux qui se lèvent avec
        // lui, `avec`) ; seule, un pilier, sinon.
        tuileMur: (q, r, p = {}) => {
            if (!studio.plateau) return null;
            const avec = new Set(cases(p.avec).map(c => cleCase(c.q, c.r)));
            const k = cleCase(q, r);
            const seul = !!p.seul || !(studio.terrain.murs.has(k) || avec.has(k));
            const dessin = dessinMur(q, r, { seul, avec });
            if (!dessin) return null;
            const { l, h, pied } = geometrieMur();
            return { dessin: copieCanvas(dessin), l: l * ecran(), h: h * ecran(), pied };
        },
        poserMurs: (liste) => {
            const ok = cases(liste);
            ok.forEach(c => {
                const k = cleCase(c.q, c.r);
                studio.terrain.gravats.delete(k);
                if (!studio.terrain.murs.has(k)) studio.terrain.murs.set(k, { id: idMur(c.q, c.r), q: c.q, r: c.r, idLanceur: studio.idHeros || "studio" });
            });
            rendreMurs();
            rendreGravats();
            return ok.length > 0;
        },
        retirerMur: (q, r) => {
            const ok = studio.terrain.murs.delete(cleCase(q, r));
            if (ok) rendreMurs();
            return ok;
        },
        tuileGravats: (q, r) => {
            const src = imageGravats(cleCase(q, r));
            return src ? { src, t: rayonCase() * geometrieMur().G.empriseGravats * ecran() } : null;
        },
        // Des gravats qui restent : les tas posés (une image par case).
        poserGravats: (liste) => {
            const ok = cases(liste).filter(c => !studio.terrain.murs.has(cleCase(c.q, c.r)));
            ok.forEach(c => studio.terrain.gravats.add(cleCase(c.q, c.r)));
            rendreGravats();
            rendreMurs();
            const calque = document.getElementById("studio-gravats");
            return ok.map(c => calque && calque.querySelector(`[data-case="${cleCase(c.q, c.r)}"]`)).filter(Boolean);
        },
        // Une nappe du jeu sur une case : `persistante`, elle remplace celle qui
        // y était et reste ; sinon c'est à l'animation de l'ôter (o.suivre).
        nappe: (type, q, r, p = {}) => {
            if (!caseExiste(q, r)) return null;
            const svg = preparerSvgZones();
            if (!svg) return null;
            if (!p.persistante) { const el = nappeSvg(type, q, r); el.classList.add("studio-nappe-passagere"); svg.appendChild(el); return el; }
            const k = cleCase(q, r);
            const ancienne = studio.terrain.zones.get(k);
            if (ancienne && ancienne.el) ancienne.el.remove();
            const z = { type, q, r, el: null };
            studio.terrain.zones.set(k, z);
            z.el = nappeSvg(type, q, r);
            svg.appendChild(z.el);
            return z.el;
        },
        // L'aperçu d'une zone visée, dessiné comme au combat (dessinerHexesZoneCiblage).
        apercuZone: (liste, estSoin) => {
            const svg = document.getElementById("studio-cibles");
            if (!svg || typeof window.dessinerHexesZoneCiblage !== "function") return null;
            const g = document.createElementNS(NS_SVG, "g");
            g.setAttribute("class", "studio-apercu");
            window.dessinerHexesZoneCiblage(g, cases(liste).map(c => ({ q: c.q, r: c.r })), rayonCase(), pixelPlateau, !!estSoin);
            svg.appendChild(g);
            return g;
        }
    };
}

// =========================================================================
//  LE CIBLAGE : toucher les cases sur la carte, puis « Lancer »
// =========================================================================
//  Nico : « assure-toi que pour des sorts style persistances de terrain et
//  autres, genre murs de pierre, on puisse cliquer sur les hexagones à
//  cibler. » Une animation qui porte `ciblage` ({ genre, min, max, consigne })
//  ouvre un bandeau (comme la pose des murs au combat) : chaque touche sur la
//  carte prend une case ou la rend ; « Lancer » la joue sur ces cases-là. Les
//  cases visées se voient comme au combat : la zone teintée de rouge, les
//  piliers à demi transparents des murs à venir.
function raisonRefus(regle, q, r) {
    const e = (studio.plateau && studio.plateau.getCaseState(q, r)) || {};
    if (e.isDeleted) return "Case gommée de la carte";
    if (!caseExiste(q, r)) return "Hors de la carte";
    const mur = studio.terrain.murs.has(cleCase(q, r));
    const heros = studio.caseHeros.q === q && studio.caseHeros.r === r;
    const ennemi = studio.caseEnnemi.q === q && studio.caseEnnemi.r === r;
    if (regle.genre === "mur") {
        if (e.isBlocked) return "Case impraticable";
        if (mur) return "Un mur se dresse déjà ici";
        if (heros) return "Pas sur ton pion";
    } else if (regle.genre === "effondre") {
        if (!mur && e.isBlocked) return "Case impraticable";
        if (!mur && (heros || ennemi)) return "Un pion se tient là";
    } else if (regle.genre === "gravats") {
        if (e.isBlocked) return "Case impraticable";
        if (mur) return "Un mur se dresse ici";
    }
    return null;
}
function rendreCiblage() {
    const c = studio.ciblage;
    const svg = document.getElementById("studio-cibles");
    if (svg) svg.querySelectorAll(".studio-cibles-zone").forEach(g => g.remove());
    rendreMurs();
    const bandeau = document.getElementById("studio-ciblage");
    if (!c || !bandeau) return;
    const n = c.cases.length, min = c.regle.min || 1, max = c.regle.max || 19;
    bandeau.querySelector(".studio-ciblage-compte").textContent =
        `${n} case${n > 1 ? "s" : ""} touchée${n > 1 ? "s" : ""}` + (max > 1 ? ` · ${max} au plus` : "");
    bandeau.querySelector(".studio-ciblage-lancer").disabled = n < min;
    if (svg && n && c.regle.genre !== "mur" && c.regle.genre !== "effondre" && typeof window.dessinerHexesZoneCiblage === "function") {
        const g = document.createElementNS(NS_SVG, "g");
        g.setAttribute("class", "studio-cibles-zone");
        window.dessinerHexesZoneCiblage(g, c.cases.map(x => ({ q: x.q, r: x.r })), rayonCase(), pixelPlateau, false);
        svg.appendChild(g);
    }
}
function signalerRefus(texte) {
    const compte = document.querySelector("#studio-ciblage .studio-ciblage-compte");
    if (!compte) return;
    compte.textContent = texte;
    compte.classList.remove("refus");
    void compte.offsetWidth;
    compte.classList.add("refus");
    clearTimeout(signalerRefus.minuteur);
    signalerRefus.minuteur = setTimeout(() => { compte.classList.remove("refus"); if (studio.ciblage) rendreCiblage(); }, 1300);
}
function ouvrirCiblage(id, anim) {
    arreterTout();
    const sceneEl = document.getElementById("studio-scene");
    if (sceneEl && sceneEl.classList.contains("studio-deplacement")) window.basculerDeplacementStudio(false);
    studio.ciblage = { id, nom: anim.nom, regle: anim.ciblage, cases: [] };
    const bandeau = document.getElementById("studio-ciblage");
    if (bandeau) {
        bandeau.querySelector(".studio-ciblage-nom").textContent = anim.nom;
        bandeau.querySelector(".studio-ciblage-consigne").textContent = anim.ciblage.consigne || "Touche les cases sur la carte, puis « Lancer ».";
        bandeau.style.display = "flex";
    }
    const scene = document.getElementById("studio-scene");
    if (scene) scene.classList.add("studio-en-ciblage");
    document.querySelectorAll("#studio-liste .studio-anim.cible").forEach(r => r.classList.remove("cible"));
    const ligne = document.querySelector(`#studio-liste .studio-anim[data-anim="${id}"]`);
    if (ligne) ligne.classList.add("cible");
    rendreCiblage();
}
function fermerCiblage() {
    const ouvert = !!studio.ciblage;
    studio.ciblage = null;
    const bandeau = document.getElementById("studio-ciblage");
    if (bandeau) bandeau.style.display = "none";
    const scene = document.getElementById("studio-scene");
    if (scene) scene.classList.remove("studio-en-ciblage");
    document.querySelectorAll("#studio-liste .studio-anim.cible").forEach(r => r.classList.remove("cible"));
    const svg = document.getElementById("studio-cibles");
    if (svg) svg.querySelectorAll(".studio-cibles-zone").forEach(g => g.remove());
    if (ouvert) rendreMurs();
}
// Un clic dans la liste : une animation qui se cible ouvre le bandeau ; les
// autres se jouent tout de suite.
window.choisirAnimationStudio = function (id) {
    const anim = typeof window.animationCombatParId === "function" ? window.animationCombatParId(id) : null;
    if (!anim || !anim.ciblage) return window.jouerAnimationStudio(id);
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    ouvrirCiblage(id, anim);
    return Promise.resolve(true);
};
window.toucherCaseStudio = function (q, r) {
    const c = studio.ciblage;
    if (!c) return false;
    const i = c.cases.findIndex(x => x.q === q && x.r === r);
    if (i >= 0) c.cases.splice(i, 1);
    else {
        const raison = raisonRefus(c.regle, q, r);
        if (raison) { signalerRefus(raison); return false; }
        const max = c.regle.max || 19;
        if (c.cases.length >= max) {
            if (max > 1) { signalerRefus(`${max} cases au plus`); return false; }
            c.cases = [];
        }
        c.cases.push({ q, r });
    }
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    rendreCiblage();
    return true;
};
window.lancerCiblageStudio = function () {
    const c = studio.ciblage;
    if (!c || c.cases.length < (c.regle.min || 1)) return Promise.resolve(false);
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    return window.jouerAnimationStudio(c.id, { cases: c.cases.map(x => ({ q: x.q, r: x.r })) });
};
window.annulerCiblageStudio = function () {
    if (typeof window.jouerSonClic === "function") window.jouerSonClic();
    fermerCiblage();
};

// =========================================================================
//  LA LISTE, ET LE JEU EN DIRECT
// =========================================================================
function rendreCompteur() {
    const el = document.getElementById("studio-compteur");
    const anims = window.ANIMATIONS_COMBAT || [];
    if (el) el.textContent = `${anims.filter(a => studio.integrees[a.id]).length} / ${anims.length} intégrée${anims.length > 1 ? "s" : ""}`;
}
// LA LISTE EN SECTIONS (la liste de Nico) : un titre par section, un
// sous-titre par classe ; des puces en haut pour sauter d'une section à
// l'autre.
function titreSection(n) {
    const s = (window.SECTIONS_ANIMATIONS || []).find(x => x.n === n);
    return s ? `${s.n}. ${s.titre}` : "";
}
function rendreSections() {
    const zone = document.getElementById("studio-sections");
    if (!zone) return;
    const presentes = new Set((window.ANIMATIONS_COMBAT || []).map(a => a.section));
    zone.innerHTML = (window.SECTIONS_ANIMATIONS || []).filter(s => presentes.has(s.n)).map(s =>
        `<button type="button" class="studio-puce-section" title="${echapper(s.titre)}" onclick="window.allerSectionStudio(${s.n})">${s.n}</button>`).join("");
}
window.allerSectionStudio = function (n) {
    const titre = document.querySelector(`#studio-liste .studio-section-titre[data-section="${n}"]`);
    const liste = document.getElementById("studio-liste");
    if (titre && liste) liste.scrollTo({ top: titre.offsetTop - liste.offsetTop - 4, behavior: "smooth" });
};
function rendreListe() {
    const liste = document.getElementById("studio-liste");
    if (!liste) return;
    rendreSections();
    const anims = window.ANIMATIONS_COMBAT || [];
    let section = null, sousSection = null;
    const entetes = (a) => {
        let h = "";
        if (a.section !== section) {
            section = a.section; sousSection = null;
            h += `<h3 class="studio-section-titre" data-section="${section}">${echapper(titreSection(section))}</h3>`;
        }
        if (a.sousSection && a.sousSection !== sousSection) {
            sousSection = a.sousSection;
            h += `<h4 class="studio-sous-section">${echapper(sousSection)}</h4>`;
        }
        return h;
    };
    liste.innerHTML = anims.length === 0
        ? `<p class="studio-vide">Aucune animation pour l'instant.</p>`
        : anims.map((a, i) => `${entetes(a)}
          <div class="studio-anim${studio.integrees[a.id] ? " integree" : ""}" data-anim="${echapper(a.id)}">
            <button type="button" class="studio-anim-jouer" onclick="window.choisirAnimationStudio('${echapper(a.id)}')">
              <span class="studio-anim-numero">${i + 1}</span>
              <span class="studio-anim-texte">
                <span class="studio-anim-nom">${echapper(a.nom)}${a.ciblage ? ` <span class="studio-anim-cible" title="Se cible sur la carte : touche les cases, puis « Lancer »">🎯</span>` : ""} <span class="studio-anim-categorie">${echapper(a.categorie || "")}${a.sens ? " · " + echapper(a.sens) : ""}</span></span>
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
    calque.querySelectorAll(".anim-effet, .anim-message").forEach(e => e.remove());
    calque.querySelectorAll(".studio-pion").forEach(p => { p.style.filter = ""; });
    calque.querySelectorAll("*").forEach(el => (el.getAnimations ? el.getAnimations() : []).forEach(a => a.cancel()));
    document.querySelectorAll("#studio-liste .studio-anim.joue").forEach(r => r.classList.remove("joue"));
    studio.enCours = null;
}

// `options.cases` : les cases touchées sur la carte (le ciblage) ; sans elles,
// l'animation choisit les siennes autour des pions.
window.jouerAnimationStudio = async function (id, options) {
    arreterTout();
    fermerCiblage();
    // Jouer, c'est reposer les pions : le déplacement se désarme.
    const sceneEl = document.getElementById("studio-scene");
    if (sceneEl && sceneEl.classList.contains("studio-deplacement")) window.basculerDeplacementStudio(false);
    const scene = {
        lanceur: document.getElementById("studio-pion-heros"),
        cible: document.getElementById("studio-pion-ennemi"),
        calque: document.getElementById("studio-pions"),
        grille: grilleDuStudio(),
        // Un déplacement réel : le pion reste sur sa nouvelle case.
        poserPion: (el, q, r) => {
            const quel = el && el.id === "studio-pion-heros" ? "heros" : el && el.id === "studio-pion-ennemi" ? "ennemi" : null;
            return quel ? window.deplacerPionStudio(quel, q, r) : false;
        },
        echangerPions,
        cases: options && Array.isArray(options.cases) && options.cases.length ? options.cases.map(c => ({ q: c.q, r: c.r })) : null,
        terrain: terrainDeScene()
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
        // Un pion parti hors du cadre : la caméra le retrouve.
        const cadre = sceneEl && sceneEl.getBoundingClientRect();
        const dehors = cadre && [scene.lanceur, scene.cible].some(p => {
            const r = p.getBoundingClientRect();
            return r.left < cadre.left || r.right > cadre.right || r.top < cadre.top || r.bottom > cadre.bottom;
        });
        if (dehors) window.recentrerStudio();
    }
    return ok;
};
