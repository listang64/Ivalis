// =========================================================================
//  IVALIS — LA LOUPE DES CARTES DU LIVRE (v334)
// =========================================================================
//  Nico : « voilà l'image d'une loupe. J'aimerais qu'elle apparaisse en
//  glissant du bord haut droit de l'écran, discrète, quand on arrive sur les
//  pages des maps. Si on clique dessus, ça fait glisser la loupe vers le centre
//  de l'écran, et ça zoome sur le centre de la loupe, comme si on regardait à
//  la loupe, et ça fait une transition sur la map de cette double page, ouverte
//  en grand, qui prend tout l'écran. En fond, l'image de papier (une texture de
//  page du livre) pour prendre tout l'écran, légèrement floutée. L'intérieur de
//  la loupe : un effet grossissant. Et quand on cliquera sur la croix noire
//  style manuscrite en haut à droite, l'animation loupe inverse. »
//  Puis : la carte du monde et les cartes régionales ; « on peut zoomer et
//  dézoomer, mais pas plus que la taille de base » ; tout y marche (lieux, pion
//  du groupe, voyage, outils DEV — Nico y fera les limites des cartes) ; « un
//  post-it à l'envers qui sort du haut de l'écran, avec le symbole de
//  déplacement, pour lancer un déplacement ».
//
//  LE DÉROULÉ
//    · au repos : la loupe dépasse du coin haut droit (sous les petits boutons),
//      le manche hors de l'écran ; elle se range dès qu'on quitte les cartes ;
//    · touchée : elle glisse au centre, en grandissant ; dans son verre, la
//      carte du livre, grossie (le point sous le verre, agrandi) ;
//    · puis on plonge : le verre grandit jusqu'à couvrir l'écran, la carte
//      passe du livre à sa place en grand, le papier flou apparaît autour ;
//    · la croix : tout à l'envers, la loupe retourne dans son coin.
//
//  EN GRAND
//    · une carte régionale : la vue vivante de cartes_regionales.js (pions,
//      villages, POI, terrains DEV, voyage) quitte sa page pour l'écran
//      (agrandirCarteRegionale) ; elle y zoome elle-même ;
//    · la carte du monde : ses deux images, posées comme sur la double page
//      (1514 × 984), et ses deux calques vivants (les boîtes de clic et leur
//      édition DEV — grimoire_carte.js ; le groupe et ses routes —
//      grimoire_regions.js), déplacés dans la planche ; on la zoome ici.
//  Si le livre change de page pendant ce temps (le groupe arrive ailleurs, une
//  région touchée sur la carte du monde…), la loupe se referme d'elle-même.
//  Script simple (pas un module), chargé après grimoire_regions.js.
// =========================================================================
(function () {
    const IMAGE_LOUPE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1794006881/IMG_2235_e1zblf.png";
    // L'image (2416 × 1135) : le verre, centré en (567,8 ; 563,5), de rayon 433 (mesuré).
    const LOUPE = { l: 2416, h: 1135, cx: 567.8 / 2416, cy: 563.5 / 1135, r: 433 / 2416 };
    const LARGEUR_IMAGE = 600;                            // la taille de l'image à l'échelle 1
    const LIVRE_L = 1514, LIVRE_H = 984;                  // la double page (unités du livre)
    const ZOOM_MAX = 4;
    const GROSSISSEMENT = 1.7;
    const DUREE = { glisse: 520, plongee: 680 };
    const G = () => window.GRIMOIRE || null;
    const $ = (id) => document.getElementById(id);

    let etat = "repos";             // repos · ouverture · ouverte · fermeture
    let cible = null;               // { type: "monde" } ou { type: "region", numero, page }
    let el = null;                  // les éléments
    let plan = { zoom: 1, base: 1, x: 0, y: 0 };      // la carte du monde en grand
    let anim = null;

    // --- OÙ EST LE LECTEUR --------------------------------------------------
    function carteOuverte() {
        const g = G(), pf = g && g.pageFlip && g.pageFlip();
        if (!g || !pf || !g.enPartie() || !g.ouvert()) return null;
        if (pf.getState() !== "read" || (g.defileEnCours && g.defileEnCours())) return null;
        const ici = pf.getCurrentPageIndex(), gauche = ici % 2 === 1 ? ici : ici - 1;
        if (gauche === g.PAGE_CARTE) return { type: "monde", page: gauche };
        const R = window.GRIMOIRE_REGIONS;
        if (!R || !R.actif()) return null;
        const r = R.regions().find(x => x.page === gauche);
        if (!r || R.montee() !== r.numero) return null;
        if (!(window.carteRegionaleOuverte && window.carteRegionaleOuverte() === r.numero)) return null;
        return { type: "region", numero: r.numero, page: gauche, nom: r.nom };
    }
    const memeCarte = (a, b) => !!a && !!b && a.type === b.type && a.page === b.page && a.numero === b.numero;

    // --- LES ÉLÉMENTS -------------------------------------------------------
    const CROIX = `<svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M 13 12 C 22 21 31 30 38 37 C 43 42 48 47 53 53"/>
        <path d="M 15 15 C 24 23 33 31 40 39 C 45 44 49 48 51 51" class="repasse"/>
        <path d="M 51 11 C 43 19 35 28 29 34 C 23 40 17 46 12 52"/>
        <path d="M 48 14 C 41 21 34 29 28 36 C 22 42 18 47 14 50" class="repasse"/></svg>`;
    function construire() {
        const g = G(), ecran = g && g.ecran && g.ecran();
        if (!ecran) return null;
        if (el && el.ecran.isConnected && el.ecran.parentNode === ecran) return el;
        if (el && el.ecran.isConnected) { ecran.appendChild(el.bouton); ecran.appendChild(el.ecran); return el; }
        const bouton = document.createElement("button");
        bouton.type = "button";
        bouton.id = "loupe-bouton";
        bouton.className = "loupe-bouton cachee";
        bouton.title = bouton.ariaLabel = "Regarder la carte à la loupe";
        bouton.innerHTML = `<img src="${IMAGE_LOUPE}" alt="" draggable="false">`;
        bouton.addEventListener("click", (e) => { e.stopPropagation(); ouvrir(); });
        const ecranLoupe = document.createElement("div");
        ecranLoupe.id = "loupe-ecran";
        ecranLoupe.className = "loupe-ecran";
        ecranLoupe.innerHTML = `
            <div class="loupe-verre">
              <div class="loupe-papier net"></div><div class="loupe-papier flou"></div>
              <div class="loupe-scene"><div class="loupe-plan" id="loupe-plan">
                <div class="loupe-planche" id="loupe-planche">
                  <div class="loupe-moitie gauche"><img alt="" draggable="false"></div>
                  <div class="loupe-moitie droite"><img alt="" draggable="false"></div>
                </div>
                <img class="loupe-statique" id="loupe-statique" alt="" draggable="false">
              </div></div>
              <div class="loupe-reflet"></div>
            </div>
            <img class="loupe-image" src="${IMAGE_LOUPE}" alt="" draggable="false">
            <button type="button" class="loupe-croix" id="loupe-croix" title="Refermer la loupe" aria-label="Refermer la loupe">${CROIX}</button>
            <button type="button" class="loupe-postit" id="loupe-postit" title="Voyager" aria-label="Voyager"><span class="loupe-postit-papier"></span></button>`;
        ecran.appendChild(bouton);
        ecran.appendChild(ecranLoupe);
        el = {
            bouton, ecran: ecranLoupe,
            verre: ecranLoupe.querySelector(".loupe-verre"),
            net: ecranLoupe.querySelector(".loupe-papier.net"), flou: ecranLoupe.querySelector(".loupe-papier.flou"),
            scene: ecranLoupe.querySelector(".loupe-scene"), plan: ecranLoupe.querySelector(".loupe-plan"),
            planche: ecranLoupe.querySelector(".loupe-planche"), statique: ecranLoupe.querySelector(".loupe-statique"),
            reflet: ecranLoupe.querySelector(".loupe-reflet"), image: ecranLoupe.querySelector(".loupe-image"),
            croix: ecranLoupe.querySelector(".loupe-croix"), postit: ecranLoupe.querySelector(".loupe-postit")
        };
        // Le dessin de la marche (les pas du marque-page) sur le post-it.
        const pas = document.querySelector("#grimoire-marque-marche .dessin-pas");
        if (pas) el.postit.querySelector(".loupe-postit-papier").appendChild(pas.cloneNode(true));
        el.croix.addEventListener("click", (e) => { e.stopPropagation(); fermer(); });
        el.postit.addEventListener("click", (e) => {
            e.stopPropagation();
            if (etat !== "ouverte" || el.postit.classList.contains("inactif")) return;
            if (typeof window.jouerSonClic === "function") window.jouerSonClic();
            if (typeof window.basculerModeVoyage === "function") window.basculerModeVoyage();
            majPostit();
        });
        brancherGestes(el.plan);
        return el;
    }

    // --- LA GÉOMÉTRIE ---------------------------------------------------------
    const ecranTaille = () => { const r = el.ecran.getBoundingClientRect(); return { l: r.width || innerWidth, h: r.height || innerHeight, x: r.left, y: r.top }; };
    const contenir = (aspect, l, h) => { let w = l, hh = l / aspect; if (hh > h) { hh = h; w = h * aspect; } return { x: (l - w) / 2, y: (h - hh) / 2, w, h: hh }; };
    const lerp = (a, b, t) => a + (b - a) * t;
    const doux = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    // La loupe au repos : dans le coin haut droit, sous les petits boutons, le manche dehors.
    function repos() {
        const { l } = ecranTaille();
        const r = Math.max(26, Math.min(40, l * 0.03));
        return { c: { x: l - r * 1.75, y: 74 + r * 1.6 }, r, a: -38 };
    }
    const centre = () => { const { l, h } = ecranTaille(); return { x: l / 2, y: h / 2 }; };
    const rayonCentre = () => { const { l, h } = ecranTaille(); return Math.min(l, h) * 0.3; };
    const rayonTout = () => { const { l, h } = ecranTaille(); return Math.hypot(l, h) / 2 * 1.06; };
    // Poser l'image de la loupe : le centre de son verre en c, de rayon r, tournée de a degrés.
    function poserImage(img, c, r, a, opacite) {
        const ox = LOUPE.cx * LARGEUR_IMAGE, oy = LOUPE.cy * LARGEUR_IMAGE * LOUPE.h / LOUPE.l;
        const k = r / (LOUPE.r * LARGEUR_IMAGE);
        img.style.transformOrigin = `${ox}px ${oy}px`;
        img.style.transform = `translate(${(c.x - ox).toFixed(2)}px, ${(c.y - oy).toFixed(2)}px) rotate(${a.toFixed(2)}deg) scale(${k.toFixed(4)})`;
        if (opacite !== undefined) img.style.opacity = String(opacite);
    }
    function poserVerre(c, r) {
        const rr = r * 1.015;
        el.verre.style.clipPath = el.verre.style.webkitClipPath = `circle(${rr.toFixed(2)}px at ${c.x.toFixed(2)}px ${c.y.toFixed(2)}px)`;
        Object.assign(el.reflet.style, { left: (c.x - rr) + "px", top: (c.y - rr) + "px", width: 2 * rr + "px", height: 2 * rr + "px" });
    }
    // Le contenu de la scène (posé en grand, en S) vu dans le livre (en B), grossi de m autour de c.
    function transformeLivre(S, B, c, m) {
        const k = B.w / S.w;
        const o = { x: B.x - k * S.x, y: B.y - k * S.y };     // le livre : p → o + k·p
        return { s: m * k, x: c.x + m * (o.x - c.x), y: c.y + m * (o.y - c.y) };
    }
    const poserScene = (t) => { el.scene.style.transform = t ? `translate(${t.x.toFixed(2)}px, ${t.y.toFixed(2)}px) scale(${t.s.toFixed(5)})` : "none"; };

    // Où est la carte dans le livre (à l'écran, rapporté à l'écran de la loupe).
    function rectLivre() {
        const g = G(), E = ecranTaille();
        if (cible.type === "monde") {
            const r = g.livre().getBoundingClientRect();
            return { x: r.left - E.x, y: r.top - E.y, w: r.width, h: r.height };
        }
        const vue = $("vue-carte-region"), c = window.cadrageCarteRegion ? window.cadrageCarteRegion() : null;
        const r = vue.getBoundingClientRect();
        if (!c || !c.largeur) return { x: r.left - E.x, y: r.top - E.y, w: r.width, h: r.height };
        const b = contenir(c.largeur / c.hauteur, r.width, r.height);
        return { x: r.left - E.x + b.x, y: r.top - E.y + b.y, w: b.w, h: b.h };
    }

    // --- LA CARTE DU MONDE EN GRAND : la planche, son zoom ----------------------
    function remplirPlanche() {
        // (v335) Les images des pages d'abord (déjà chargées : la glisse n'attend rien),
        // puis une version plus fine (3200 de large) pour le zoom, chargée à la demande.
        const g = G(), pagesImg = (g && (g.IMAGES_CARTE_PAGES || g.IMAGES_CARTE)) || {}, brutes = (g && g.IMAGES_CARTE) || {};
        const fine = (u) => (u && /\/upload\//.test(u) && !/\/upload\/[a-z]_/.test(u)) ? u.replace("/upload/", "/upload/w_3200,c_limit,q_auto,f_auto/") : u;
        el.planche.querySelectorAll("img").forEach((img, i) => {
            const cote = i === 0 ? "gauche" : "droite", fin = fine(brutes[cote]);
            if (!pagesImg[cote] || img.dataset.fine === fin) return;
            if (img.getAttribute("src") !== pagesImg[cote]) img.src = pagesImg[cote];
            if (!fin || fin === pagesImg[cote]) return;
            const pre = new Image();
            pre.onload = () => { img.src = fin; img.dataset.fine = fin; };
            pre.src = fin;
        });
    }
    function basePlanche() {
        const { l, h } = ecranTaille();
        plan.base = Math.min(l / LIVRE_L, h / LIVRE_H);
    }
    function bornerPlanche() {
        const { l, h } = ecranTaille();
        plan.zoom = Math.max(plan.base, Math.min(plan.base * ZOOM_MAX, plan.zoom));
        const w = LIVRE_L * plan.zoom, hh = LIVRE_H * plan.zoom;
        plan.x = w <= l ? (l - w) / 2 : Math.max(l - w, Math.min(0, plan.x));
        plan.y = hh <= h ? (h - hh) / 2 : Math.max(h - hh, Math.min(0, plan.y));
    }
    function poserPlanche() {
        bornerPlanche();
        el.planche.style.transform = `translate(${plan.x.toFixed(2)}px, ${plan.y.toFixed(2)}px) scale(${plan.zoom.toFixed(5)})`;
    }
    const rectPlanche = () => ({ x: plan.x, y: plan.y, w: LIVRE_L * plan.zoom, h: LIVRE_H * plan.zoom });
    function zoomerPlanche(f, x, y) {
        const avant = plan.zoom;
        plan.zoom = Math.max(plan.base, Math.min(plan.base * ZOOM_MAX, avant * f));
        const k = plan.zoom / avant;
        plan.x = x - (x - plan.x) * k; plan.y = y - (y - plan.y) * k;
        poserPlanche();
    }
    // Les gestes de la planche : un doigt glisse, deux zooment, la molette zoome.
    // Un doigt qui a glissé ne « clique » pas sur la boîte d'une région.
    function brancherGestes(zone) {
        const doigts = new Map();
        let geste = null, aGlisse = false;
        const local = (e) => { const E = ecranTaille(); return { x: e.clientX - E.x, y: e.clientY - E.y }; };
        zone.addEventListener("wheel", (e) => {
            if (etat !== "ouverte" || !cible || cible.type !== "monde") return;
            e.preventDefault();
            const p = local(e);
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey) { plan.x -= e.deltaX; poserPlanche(); return; }
            zoomerPlanche(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), p.x, p.y);
        }, { passive: false });
        zone.addEventListener("pointerdown", (e) => {
            if (etat !== "ouverte" || !cible || cible.type !== "monde") return;
            doigts.set(e.pointerId, local(e));
            // (le pointeur n'est capturé qu'une fois le glissé commencé : un simple appui reste
            // un clic sur la boîte d'une région)
            if (doigts.size === 1) { aGlisse = false; geste = { type: "glisser", depart: local(e), x: plan.x, y: plan.y }; }
            else if (doigts.size === 2) { doigts.forEach((_, id) => { try { zone.setPointerCapture(id); } catch (err) {} }); const [a, b] = [...doigts.values()]; geste = { type: "pincer", d: Math.hypot(a.x - b.x, a.y - b.y) || 1, m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }; aGlisse = true; }
        });
        zone.addEventListener("pointermove", (e) => {
            if (!doigts.has(e.pointerId) || !geste) return;
            doigts.set(e.pointerId, local(e));
            if (geste.type === "glisser") {
                const p = local(e), dx = p.x - geste.depart.x, dy = p.y - geste.depart.y;
                if (!aGlisse && Math.hypot(dx, dy) < 6) return;
                if (!aGlisse) { try { zone.setPointerCapture(e.pointerId); } catch (err) {} }
                aGlisse = true;
                plan.x = geste.x + dx; plan.y = geste.y + dy; poserPlanche();
            } else if (doigts.size >= 2) {
                const [a, b] = [...doigts.values()];
                const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                plan.x += m.x - geste.m.x; plan.y += m.y - geste.m.y;
                zoomerPlanche(d / geste.d, m.x, m.y);
                geste.d = d; geste.m = m;
            }
        });
        const lever = (e) => {
            if (!doigts.has(e.pointerId)) return;
            doigts.delete(e.pointerId);
            if (doigts.size === 1 && geste && geste.type === "pincer") { const p = [...doigts.values()][0]; geste = { type: "glisser", depart: p, x: plan.x, y: plan.y }; }
            else if (doigts.size === 0) geste = null;
        };
        zone.addEventListener("pointerup", lever);
        zone.addEventListener("pointercancel", lever);
        zone.addEventListener("click", (e) => { if (aGlisse) { e.stopPropagation(); e.preventDefault(); aGlisse = false; } }, true);
    }
    // Les calques vivants de la carte du monde : dans la planche, et retour au livre.
    const CALQUES = ["calque-zones-livre", "calque-groupe-livre"];
    function calquesDansLaPlanche(oui) {
        const g = G(), scene = g && g.scene && g.scene();
        CALQUES.forEach(id => {
            const c = $(id);
            if (!c) return;
            if (oui) { if (c.parentNode !== el.planche) el.planche.appendChild(c); }
            else if (scene && c.parentNode !== scene) scene.appendChild(c);
        });
        if (window.GRIMOIRE_CARTE && window.GRIMOIRE_CARTE.dessiner) { try { window.GRIMOIRE_CARTE.dessiner(); } catch (e) {} }
        if (oui && typeof window.poserGroupeSurLaCarteDuLivre === "function") { try { window.poserGroupeSurLaCarteDuLivre(); } catch (e) {} }
    }

    // --- LE POST-IT DU VOYAGE ---------------------------------------------------
    function majPostit() {
        if (!el) return;
        const ev = typeof window.etatVoyageLivre === "function" ? window.etatVoyageLivre() : null;
        const possible = etat === "ouverte" && !!ev && ev.possible;
        el.postit.classList.toggle("inactif", !possible);
        el.postit.classList.toggle("choix", possible && !!ev.actif);
        const titre = ev ? ev.titre : "Voyager";
        if (el.postit.title !== titre) el.postit.title = el.postit.ariaLabel = titre;
    }

    // --- L'ANIMATION ------------------------------------------------------------
    // Une étape : `rendre(t)` à chaque image, t de 0 à 1 (adouci) ; puis `fin`.
    function jouer(duree, rendre, sens) {
        return new Promise((fini) => {
            const t0 = performance.now();
            const pas = (ici) => {
                const brut = Math.min(1, (ici - t0) / duree);
                const t = doux(sens < 0 ? 1 - brut : brut);
                try { rendre(t); } catch (e) { console.error("La loupe :", e); }
                if (brut < 1) anim = requestAnimationFrame(pas); else { anim = null; fini(); }
            };
            anim = requestAnimationFrame(pas);
        });
    }
    // La glisse (t : 0 au coin, 1 au centre) : la carte du livre, grossie sous le verre.
    function rendreGlisse(S, B, t) {
        const a = repos(), C = centre();
        const c = { x: lerp(a.c.x, C.x, t), y: lerp(a.c.y, C.y, t) }, r = lerp(a.r, rayonCentre(), t);
        poserImage(el.image, c, r, lerp(a.a, 16, t), 1);
        poserVerre(c, r);
        poserScene(transformeLivre(S, B, c, lerp(1.25, GROSSISSEMENT, t)));
        el.flou.style.opacity = "0";
        el.reflet.style.opacity = "1";
    }
    // La plongée (t : 0 la loupe au centre, 1 la carte en grand).
    function rendrePlongee(S, B, t) {
        const C = centre(), r = lerp(rayonCentre(), rayonTout(), t);
        poserImage(el.image, C, r, 16, t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3);
        poserVerre(C, r);
        const d = transformeLivre(S, B, C, GROSSISSEMENT);
        const s = Math.exp(lerp(Math.log(d.s), 0, t));
        poserScene({ s, x: lerp(d.x, 0, t), y: lerp(d.y, 0, t) });
        el.flou.style.opacity = String(t);
        el.reflet.style.opacity = String(1 - t);
    }
    // Le contenu des animations : une image fixe de la carte, à la place S.
    function poserStatique(S) {
        if (cible.type === "monde") { el.statique.style.display = "none"; el.planche.style.display = ""; return; }
        const src = ($("carte-region-image") && $("carte-region-image").currentSrc) || ($("carte-region-image") && $("carte-region-image").src) || "";
        if (src && el.statique.getAttribute("src") !== src) el.statique.src = src;
        Object.assign(el.statique.style, { display: "block", left: S.x + "px", top: S.y + "px", width: S.w + "px", height: S.h + "px" });
        el.planche.style.display = "none";
    }

    async function ouvrir() {
        if (etat !== "repos") return false;
        const c = carteOuverte();
        if (!c || !construire()) return false;
        etat = "ouverture";
        cible = c;
        if (typeof window.jouerSonClic === "function") window.jouerSonClic();
        el.ecran.classList.add("visible");
        el.ecran.classList.remove("ouverte");
        el.ecran.dataset.carte = c.type;
        el.bouton.classList.add("prise");
        const E = ecranTaille();
        let S;
        if (c.type === "monde") { remplirPlanche(); basePlanche(); plan.zoom = plan.base; poserPlanche(); S = rectPlanche(); }
        else { const cad = window.cadrageCarteRegion(); S = contenir(cad.largeur / cad.hauteur, E.l, E.h); }
        poserStatique(S);
        const B = rectLivre();
        rendreGlisse(S, B, 0);
        await jouer(DUREE.glisse, (t) => rendreGlisse(S, B, t), 1);
        if (etat !== "ouverture") return false;
        await jouer(DUREE.plongee, (t) => rendrePlongee(S, B, t), 1);
        if (etat !== "ouverture") return false;
        // En grand : la carte vivante prend la place de l'image fixe.
        poserScene(null);
        el.verre.style.clipPath = el.verre.style.webkitClipPath = "none";
        el.image.style.opacity = "0";
        if (c.type === "monde") calquesDansLaPlanche(true);
        else if (!(window.agrandirCarteRegionale && window.agrandirCarteRegionale(el.plan))) { fermerVite(); return false; }
        el.statique.style.display = "none";
        etat = "ouverte";
        el.ecran.classList.add("ouverte");
        majPostit();
        return true;
    }

    async function fermer() {
        if (etat !== "ouverte" || !el) return false;
        etat = "fermeture";
        if (typeof window.jouerSonClic === "function") window.jouerSonClic();
        el.ecran.classList.remove("ouverte");
        majPostit();
        // La carte telle qu'on la regarde (zoomée peut-être), en image fixe ; la vue vivante rentre au livre.
        let S;
        if (cible.type === "monde") { S = rectPlanche(); calquesDansLaPlanche(false); }
        else {
            const cad = window.cadrageCarteRegion(), vue = $("vue-carte-region"), E = ecranTaille();
            const r = vue ? vue.getBoundingClientRect() : { left: E.x, top: E.y };
            S = cad && cad.largeur ? { x: r.left - E.x + cad.panX, y: r.top - E.y + cad.panY, w: cad.largeur * cad.zoom, h: cad.hauteur * cad.zoom } : contenir(1, E.l, E.h);
            poserStatique(S);
            if (window.rendreCarteRegionaleALaPage) window.rendreCarteRegionaleALaPage();
        }
        const B = rectLivre();
        rendrePlongee(S, B, 1);
        await jouer(DUREE.plongee, (t) => rendrePlongee(S, B, t), -1);
        if (etat !== "fermeture") return false;
        await jouer(DUREE.glisse, (t) => rendreGlisse(S, B, t), -1);
        if (etat !== "fermeture") return false;
        finir();
        return true;
    }
    // Tout de suite (le livre a changé de page sous la loupe, la partie se ferme…).
    function fermerVite() {
        if (!el || etat === "repos") return;
        if (anim) { cancelAnimationFrame(anim); anim = null; }
        if (cible && cible.type === "monde") calquesDansLaPlanche(false);
        if (window.carteRegionaleEnGrand && window.carteRegionaleEnGrand() && window.rendreCarteRegionaleALaPage) window.rendreCarteRegionaleALaPage();
        finir();
    }
    function finir() {
        etat = "repos";
        cible = null;
        el.ecran.classList.remove("visible", "ouverte");
        el.statique.style.display = "none";
        poserScene(null);
        el.bouton.classList.remove("prise");
        majPostit();
        veiller();
    }

    // --- LA VEILLE : la loupe sort sur les cartes, se range ailleurs ------------
    function veiller() {
        const g = G();
        if (!g || !g.ecran || !g.ecran()) return;
        if (!g.enPartie || !g.enPartie()) { if (el) { fermerVite(); el.bouton.classList.add("cachee"); } return; }
        if (!construire()) return;
        const ici = carteOuverte();
        if (etat === "ouverte" || etat === "ouverture") {
            // Le livre a tourné sous la loupe (ou la carte s'est refermée) : elle se range.
            const pf = g.pageFlip(), pageIci = pf ? pf.getCurrentPageIndex() : -1, gauche = pageIci % 2 === 1 ? pageIci : pageIci - 1;
            const regionPartie = cible && cible.type === "region" && !(window.carteRegionaleOuverte && window.carteRegionaleOuverte() === cible.numero);
            if ((cible && gauche !== cible.page) || regionPartie) fermerVite();
            else if (etat === "ouverte") { majPostit(); if (cible.type === "monde") { basePlanche(); poserPlanche(); } }
            return;
        }
        if (etat !== "repos") return;
        const montrer = !!ici;
        el.bouton.classList.toggle("cachee", !montrer);
        const a = repos();
        poserImage(el.bouton.querySelector("img"), a.c, a.r, a.a);
    }
    window.addEventListener("keydown", (e) => { if (e.key === "Escape" && etat === "ouverte") fermer(); });
    window.addEventListener("resize", () => setTimeout(veiller, 60));
    setInterval(veiller, 200);

    window.LOUPE_CARTES = {
        ouvrir, fermer, fermerVite, etat: () => etat, cible: () => (cible ? { ...cible } : null),
        planche: () => ({ ...plan }), zoomerPlanche: (f, x, y) => { if (etat === "ouverte" && cible && cible.type === "monde") zoomerPlanche(f, x, y); },
        LOUPE, IMAGE_LOUPE
    };
})();
