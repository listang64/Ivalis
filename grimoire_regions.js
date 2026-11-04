// =========================================================================
//  IVALIS — LES CARTES RÉGIONALES DANS LE LIVRE (v308)
// =========================================================================
//  Nico : « nous allons remettre les maps régionales avec le système de
//  déplacement et tout ce qu'on avait fait (la création d'image de lieu, la
//  génération de POI…). La map régionale va s'afficher sur une double page qui
//  est à elle, côté page de droite ; côté gauche, le nom de la région (plus tard
//  on mettra autre chose). Pas d'effet de nuages : juste le défilement des
//  pages. Les cartes régionales se trouvent sur les pages d'après la map
//  globale. Quand la carte est en mode paysage, tu peux l'afficher en double
//  page. » Puis : une double page par région, dans l'ordre des boîtes ; un titre
//  à la plume en haut de la page gauche sur une carte en paysage ; le pincement
//  et la molette zooment, un doigt glisse la carte zoomée, sinon il tourne la
//  page ; les fenêtres du voyage par-dessus le livre ; le livre suit le groupe
//  (et s'ouvre sur sa région) ; les outils DEV régionaux dans « Nouveau » ;
//  l'usure du parchemin gardée.
//
//  LES BOÎTES DE LA CARTE DU LIVRE (Carte_Livre/Zones, grimoire_carte.js) et
//  leurs régions, d'après Nico (Arcaï et Volcanisse n'en ont pas, volontairement).
//  Les fiches des cartes gardent leurs anciens numéros (Cartes_Regionales/{n}) :
//  villages, terrains, POI et position du groupe restent valables.
//
//  LA CARTE VIVANTE : les pages portent l'image de la carte (elle tourne avec
//  elles) ; sur la double page ouverte, la vue de cartes_regionales.js (pions,
//  tracés, villages, POI, usure) se pose par-dessus, à la même place — elle se
//  cache le temps qu'une page tourne.
//  Script simple (pas un module), chargé après grimoire_carte.js.
// =========================================================================
(function () {
    const ZONE_VERS_REGION = { 1: 1, 2: 2, 3: 5, 4: 6, 5: 10, 6: 11, 7: 3, 8: 7, 9: 8, 10: 13, 11: 12 };
    // Les marges de la carte sur sa page (fractions de la page).
    const MARGE = { x: 0.075, y: 0.075 };
    const PAYSAGE = 1.15;                         // au-delà, la carte s'étale sur la double page
    const G = () => window.GRIMOIRE || null;
    const $ = (id) => document.getElementById(id);
    const echapper = (t) => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    let regions = [];            // [{ zone, numero, nom, url, aspect, pages: [gauche, droite] }]
    let signature = "";
    let montee = null;           // la région dont la carte vivante est posée sur le livre
    let ouvertureFaite = false;
    let enCours = false;
    const aspects = {};          // numéro → largeur / hauteur (lu sur l'image)

    // --- LES RÉGIONS DU LIVRE -------------------------------------------------
    function voulues() {
        const cartes = window.CARTES_REGIONALES || {};
        return Object.keys(window.ZONES_LIVRE || {}).map(Number).filter(z => ZONE_VERS_REGION[z]).sort((a, b) => a - b)
            .map(zone => ({ zone, numero: ZONE_VERS_REGION[zone], carte: cartes[ZONE_VERS_REGION[zone]] }))
            .filter(x => x.carte && x.carte.image);
    }
    const urlDe = (carte) => (typeof window.urlImageCarteRegionale === "function" ? window.urlImageCarteRegionale(carte.image) : carte.image);
    const paysage = (r) => (r.aspect || 0) > PAYSAGE;

    // La place de la carte, en pourcentages de la zone des deux pages (le livre).
    function placeDe(r) {
        if (paysage(r)) return { left: (MARGE.x * 50) + "%", top: (MARGE.y * 100) + "%", width: (100 - MARGE.x * 100) + "%", height: (100 - MARGE.y * 200) + "%" };
        return { left: (50 + MARGE.x * 50) + "%", top: (MARGE.y * 100) + "%", width: (50 - MARGE.x * 100) + "%", height: (100 - MARGE.y * 200) + "%" };
    }
    // L'image posée « contenue » dans sa place, en pourcentages de chaque page.
    // En largeurs de page : une page fait 1 de large et H de haut ; la place de la
    // carte va de MARGE.x à 2 − MARGE.x, et de MARGE.y·H à H − MARGE.y·H.
    function imagesPaysage(r) {
        const H = 984 / 757;
        const L = 2 - 2 * MARGE.x, P = H * (1 - 2 * MARGE.y);
        let w = L, h = L / r.aspect;
        if (h > P) { h = P; w = P * r.aspect; }
        const x0 = MARGE.x + (L - w) / 2, y0 = MARGE.y * H + (P - h) / 2;
        const commun = { top: (y0 / H * 100) + "%", width: (w * 100) + "%", height: (h / H * 100) + "%" };
        return { gauche: { left: (x0 * 100) + "%", ...commun }, droite: { left: ((x0 - 1) * 100) + "%", ...commun } };
    }
    const style = (o) => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(";");
    const TRAIT = `<svg class="region-trait" viewBox="0 0 200 20" aria-hidden="true"><path d="M4 12 C40 4 70 16 100 10 C130 4 160 15 196 8"/><path d="M92 13 C98 9 102 9 108 13"/></svg>`;
    function remplir(r) {
        const [g, d] = r.pages;
        const nom = echapper(r.nom), url = echapper(r.url);
        g.classList.toggle("paysage", paysage(r)); d.classList.toggle("paysage", paysage(r));
        if (paysage(r)) {
            const im = imagesPaysage(r);
            g.innerHTML = `<div class="region-moitie"><img class="region-carte-img" src="${url}" alt="" draggable="false" style="${style(im.gauche)}"></div>
                           <div class="region-titre-sur-carte"><span class="region-nom">${nom}</span>${TRAIT}</div>`;
            d.innerHTML = `<div class="region-moitie"><img class="region-carte-img" src="${url}" alt="" draggable="false" style="${style(im.droite)}"></div>`;
        } else {
            g.innerHTML = `<div class="region-titre-page"><span class="region-sur">Carte de la région</span><span class="region-nom">${nom}</span>${TRAIT}</div>`;
            d.innerHTML = `<div class="region-place" style="inset:${MARGE.y * 100}% ${MARGE.x * 100}%"><img class="region-carte-img contenue" src="${url}" alt="${nom}" draggable="false"></div>`;
        }
    }
    function pagePour(r, cote) {
        const el = document.createElement("div");
        el.className = `page-grimoire page-papier ${cote} page-region`;
        el.id = `grimoire-region-${r.zone}-${cote}`;
        el.dataset.region = String(r.numero);
        return el;
    }
    function lireAspect(r) {
        if (aspects[r.numero]) { r.aspect = aspects[r.numero]; return; }
        const fiche = window.CARTES_REGIONALES && window.CARTES_REGIONALES[r.numero];
        if (fiche && fiche.aspect) r.aspect = fiche.aspect;
        const img = new Image();
        img.onload = () => {
            if (!img.naturalWidth) return;
            aspects[r.numero] = img.naturalWidth / img.naturalHeight;
            const avant = paysage(r);
            r.aspect = aspects[r.numero];
            remplir(r);
            if (avant !== paysage(r) && montee === r.numero) demonter();   // la place change : la vue se repose
        };
        img.src = r.url;
    }
    function construire() {
        const g = G();
        if (!g || !g.enPartie()) return;
        const liste = voulues();
        const sig = liste.map(x => `${x.zone}:${x.numero}:${x.carte.image}:${x.carte.nom}`).join("|");
        if (sig === signature) return;
        signature = sig;
        const anciennes = regions;
        regions = liste.map(x => {
            const deja = anciennes.find(r => r.numero === x.numero && r.zone === x.zone);
            const r = deja || { zone: x.zone, numero: x.numero };
            r.nom = x.carte.nom; r.url = urlDe(x.carte);
            if (!r.pages) r.pages = [pagePour(r, "gauche"), pagePour(r, "droite")];
            lireAspect(r);
            remplir(r);
            return r;
        });
        g.definirRegions(regions.flatMap(r => r.pages));
        // Les pages arrivées, le livre s'ouvre sur la région du groupe (une fois par partie).
        if (!ouvertureFaite && regions.length) { ouvertureFaite = true; setTimeout(() => { if (G() && G().ouvrirSurLeGroupe) G().ouvrirSurLeGroupe(); }, 250); }
    }

    // --- OÙ EST LE LECTEUR --------------------------------------------------
    const pageDe = (r) => G().PAGE_CARTE + 2 + 2 * regions.indexOf(r);
    function regionOuverte() {
        const g = G(), pf = g && g.pageFlip();
        if (!pf || !g.ouvert()) return null;
        const ici = pf.getCurrentPageIndex(), gauche = ici % 2 === 1 ? ici : ici - 1;
        return regions.find(r => pageDe(r) === gauche) || null;
    }
    function surLaCarteDuMonde() {
        const g = G(), pf = g && g.pageFlip();
        if (!pf || !g.ouvert()) return false;
        const ici = pf.getCurrentPageIndex();
        return ici === g.PAGE_CARTE || ici === g.PAGE_CARTE + 1;
    }

    // --- LA CARTE VIVANTE -----------------------------------------------------
    async function monter(r) {
        if (enCours || typeof window.ouvrirCarteRegionale !== "function") return;
        enCours = true;
        try {
            if (window.carteRegionaleOuverte && window.carteRegionaleOuverte()) await window.fermerCarteRegionale({ livre: true });
            const ok = await window.ouvrirCarteRegionale(r.numero, { livre: { conteneur: G().livre(), place: placeDe(r) } });
            montee = ok ? r.numero : null;
            poserTitreVivant(ok && paysage(r) ? r : null);
            if (ok && typeof window.recadrerCarteRegionale === "function") window.recadrerCarteRegionale();
        } catch (e) { console.error("Le livre : la carte régionale", e); montee = null; }
        enCours = false;
    }
    async function demonter() {
        if (enCours) return;
        enCours = true;
        try { if (window.carteRegionaleDansLeLivre && window.carteRegionaleDansLeLivre()) await window.fermerCarteRegionale({ livre: true }); }
        catch (e) { console.error("Le livre : la carte régionale", e); }
        montee = null;
        poserTitreVivant(null);
        enCours = false;
    }
    // En paysage, la carte vivante couvre la double page : le titre se pose au-dessus.
    function poserTitreVivant(r) {
        let el = $("region-titre-vivant");
        if (!r) { if (el) el.remove(); return; }
        if (!el) { el = document.createElement("div"); el.id = "region-titre-vivant"; el.className = "region-titre-livre"; }
        if (el.parentNode !== G().livre()) G().livre().appendChild(el);
        el.innerHTML = `<div class="region-titre-sur-carte"><span class="region-nom">${echapper(r.nom)}</span>${TRAIT}</div>`;
    }
    // L'ancienne vue retrouve l'écran de jeu quand on quitte la partie.
    function rendreLaVue() {
        const vue = $("vue-carte-region"), jeu = $("ecran-jeu");
        if (!vue || !jeu || vue.parentNode === jeu) return;
        const fond = $("conteneur-carte-fond");
        if (fond && fond.parentNode === jeu && fond.nextSibling) jeu.insertBefore(vue, fond.nextSibling); else jeu.appendChild(vue);
        ["left", "top", "width", "height"].forEach(k => { vue.style[k] = ""; });
    }

    let etaitEnPartie = false, posee = true;
    function veiller() {
        const g = G();
        const enPartie = !!(g && g.enPartie && g.enPartie());
        // Hors partie, rien à faire (le livre n'a pas de cartes régionales) ; on ne
        // touche à rien tant que rien ne change.
        if (!enPartie) {
            if (etaitEnPartie) {
                etaitEnPartie = false; signature = ""; regions = []; ouvertureFaite = false;
                if (typeof window.placerOutilsRegionDev === "function") window.placerOutilsRegionDev(false);
                const jeu = $("ecran-jeu");
                if (jeu) jeu.classList.remove("livre-carte");
                demonter().then(rendreLaVue);
            }
            return;
        }
        if (!etaitEnPartie && typeof window.placerOutilsRegionDev === "function") window.placerOutilsRegionDev(true);
        etaitEnPartie = true;
        construire();
        const pf = g.pageFlip();
        const lu = !!pf && pf.getState() === "read" && !(g.defileEnCours && g.defileEnCours());
        const vue = $("vue-carte-region");
        if (vue) vue.classList.toggle("en-tourne", !lu && !!montee);
        const aideDev = $("dev-nouveau-region-aide");
        if (aideDev) aideDev.style.display = montee ? "none" : "";
        const titre = $("region-titre-vivant");
        if (titre) titre.classList.toggle("en-tourne", !lu);
        const r = lu ? regionOuverte() : null;
        if (lu) {
            if (r && montee !== r.numero) monter(r);
            else if (!r && montee) demonter();
        }
        if (lu && !posee && montee && typeof window.recadrerCarteRegionale === "function") window.recadrerCarteRegionale();
        posee = lu;
        // Le bouton du voyage et ses fenêtres : sur les cartes du livre (le monde, les régions).
        const jeu = $("ecran-jeu");
        const carteDuLivre = !!(surLaCarteDuMonde() || (r && montee === r.numero));
        if (jeu) jeu.classList.toggle("livre-carte", carteDuLivre);
        // Le bouton se range à gauche des petits boutons du haut.
        const bv = $("btn-voyage"), nav = $("menu-navigation-bas");
        if (bv) {
            const nr = carteDuLivre && nav ? nav.getBoundingClientRect() : null;
            bv.style.top = nr && nr.width ? nr.top + "px" : "";
            bv.style.right = nr && nr.width ? (window.innerWidth - nr.left + 10) + "px" : "";
        }
        if (typeof window.actualiserBoutonVoyage === "function") window.actualiserBoutonVoyage();
    }

    // --- ALLER À UNE RÉGION, REVENIR AU MONDE ---------------------------------
    const attendre = (ms) => new Promise(r => setTimeout(r, ms));
    async function ouvrir(numero) {
        const r = regions.find(x => x.numero === Number(numero));
        const g = G();
        if (!r || !g) return false;
        g.allerALaPage(pageDe(r));
        for (let i = 0; i < 60; i++) {
            if (montee === r.numero && window.carteRegionaleOuverte && window.carteRegionaleOuverte() === r.numero && !enCours) return true;
            await attendre(100);
            veiller();
        }
        return false;
    }
    async function versLeMonde() {
        const g = G();
        if (!g) return false;
        g.allerALaCarte();
        for (let i = 0; i < 60; i++) {
            if (!(window.carteRegionaleOuverte && window.carteRegionaleOuverte()) && !enCours) return true;
            await attendre(100);
            veiller();
        }
        return false;
    }
    function pageDuGroupe() {
        const pos = typeof window.positionGroupe === "function" ? window.positionGroupe() : null;
        const r = pos && regions.find(x => x.numero === Number(pos.Region));
        return r ? pageDe(r) : null;
    }

    // Les boîtes de la carte du monde : la région (ou, en voyage, la destination).
    const actions = window.ACTIONS_ZONES_LIVRE = window.ACTIONS_ZONES_LIVRE || {};
    Object.keys(ZONE_VERS_REGION).forEach(z => {
        actions[z] = () => {
            const n = ZONE_VERS_REGION[z];
            if (typeof window.modeChoixCarte === "function" && window.modeChoixCarte() === "monde" && typeof window.surChoixRegionCarte === "function") {
                window.surChoixRegionCarte(n);
                return;
            }
            ouvrir(n);
        };
    });

    window.GRIMOIRE_REGIONS = {
        ZONE_VERS_REGION, actif: () => !!(G() && G().enPartie() && regions.length),
        regions: () => regions.map(r => ({ zone: r.zone, numero: r.numero, nom: r.nom, page: pageDe(r), paysage: paysage(r) })),
        ouvrir, versLeMonde, pageDuGroupe, montee: () => montee, veiller
    };
    setInterval(veiller, 180);
})();
