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
    window.ZONE_VERS_REGION = ZONE_VERS_REGION;      // (v313) les régions voisines (voyage_groupe.js)
    // Les marges de la carte sur sa page (fractions de la page).
    // v331 — Nico : « les nouvelles maps régionales en pleine page de droite, sans
    // zoom » : toujours la page de droite (même une carte en paysage), presque
    // jusqu'à ses bords ; la page de gauche garde le nom de la région.
    const MARGE = { x: 0.035, y: 0.035 };
    const G = () => window.GRIMOIRE || null;
    const $ = (id) => document.getElementById(id);
    const echapper = (t) => String(t == null ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    let regions = [];            // [{ zone, numero, nom, url, aspect, pages: [gauche, droite] }]
    let signature = "";
    let montee = null;           // la région dont la carte vivante est posée sur le livre
    let ouvertureFaite = false;
    let enCours = false;
    let lieuxAJour = false;      // (v383) les lieux des pages sont-ils posés et à jour ?
    const aspects = {};          // numéro → largeur / hauteur (lu sur l'image)

    // --- LES RÉGIONS DU LIVRE -------------------------------------------------
    function voulues() {
        const cartes = window.CARTES_REGIONALES || {};
        return Object.keys(window.ZONES_LIVRE || {}).map(Number).filter(z => ZONE_VERS_REGION[z]).sort((a, b) => a - b)
            .map(zone => ({ zone, numero: ZONE_VERS_REGION[zone], carte: cartes[ZONE_VERS_REGION[zone]] }))
            .filter(x => x.carte && x.carte.image);
    }
    // (v335) Sur la page, une image légère (1400 de large) ; la carte vivante a la sienne.
    const urlDe = (carte) => (typeof window.urlPageCarteRegionale === "function" ? window.urlPageCarteRegionale(carte.image)
        : typeof window.urlImageCarteRegionale === "function" ? window.urlImageCarteRegionale(carte.image) : carte.image);
    const paysage = () => false;      // (v331) plus de double page : la page de droite

    // La place de la carte, en pourcentages de la zone des deux pages (le livre).
    function placeDe(r) {
        if (paysage(r)) return { left: (MARGE.x * 50) + "%", top: (MARGE.y * 100) + "%", width: (100 - MARGE.x * 100) + "%", height: (100 - MARGE.y * 200) + "%" };
        return { left: (50 + MARGE.x * 50) + "%", top: (MARGE.y * 100) + "%", width: (50 - MARGE.x * 100) + "%", height: (100 - MARGE.y * 200) + "%" };
    }
    // L'image posée « contenue » dans sa place, en pourcentages de chaque page.
    // En largeurs de page : une page fait 1 de large et H de haut ; la place de la
    // carte va de MARGE.x à 2 − MARGE.x (paysage) ou de 1 + MARGE.x à 2 − MARGE.x
    // (portrait, la page de droite), et de MARGE.y·H à H − MARGE.y·H.
    // (v310) Une boîte exacte (plus d'object-fit) : le bord brûlé s'y pose.
    function boitesImage(r) {
        const H = 984 / 757, aspect = r.aspect || 1;
        const debut = paysage(r) ? MARGE.x : 1 + MARGE.x;
        const L = 2 - MARGE.x - debut, P = H * (1 - 2 * MARGE.y);
        let w = L, h = L / aspect;
        if (h > P) { h = P; w = P * aspect; }
        const x0 = debut + (L - w) / 2, y0 = MARGE.y * H + (P - h) / 2;
        const commun = { top: (y0 / H * 100) + "%", width: (w * 100) + "%", height: (h / H * 100) + "%" };
        return { gauche: { left: (x0 * 100) + "%", ...commun }, droite: { left: ((x0 - 1) * 100) + "%", ...commun } };
    }
    const style = (o) => Object.entries(o).map(([k, v]) => `${k}:${v}`).join(";");
    const TRAIT = `<svg class="region-trait" viewBox="0 0 200 20" aria-hidden="true"><path d="M4 12 C40 4 70 16 100 10 C130 4 160 15 196 8"/><path d="M92 13 C98 9 102 9 108 13"/></svg>`;
    const carteImg = (url, boite, alt) => `<div class="region-moitie"><div class="region-carte-cadre" style="${style(boite)}"><img class="region-carte-img" src="${url}" alt="${alt}" draggable="false"></div></div>`;
    // (v339) LE DESCRIPTIF POUR LE MJ. Nico : « je n'ai plus accès, avec cette
    // nouvelle interface, au descriptif des régions que l'on envoie au MJ ». En DEV,
    // la page de gauche de chaque région l'ouvre (descriptifs_regions.js) ; le bouton
    // ne se voit qu'en DEV (body.dev-descriptifs-regions).
    const boutonDescriptif = (r) => `<button type="button" class="bouton-descriptif-region" data-region="${Number(r.numero)}"
        title="Le descriptif RP de la région, lu par le maître du jeu"
        onclick="event.stopPropagation(); if (window.jouerSonClic) window.jouerSonClic(); window.editerDescriptifRegion && window.editerDescriptifRegion(${Number(r.numero)})">✎ Descriptif pour le MJ</button>`;
    function remplir(r) {
        const [g, d] = r.pages;
        const nom = echapper(r.nom), url = echapper(r.url);
        const boites = boitesImage(r);
        g.classList.toggle("paysage", paysage(r)); d.classList.toggle("paysage", paysage(r));
        if (paysage(r)) {
            g.innerHTML = carteImg(url, boites.gauche, "") + `<div class="region-titre-sur-carte"><span class="region-nom">${nom}</span>${TRAIT}</div>`;
            d.innerHTML = carteImg(url, boites.droite, "");
        } else {
            g.innerHTML = `<div class="region-titre-page"><span class="region-sur">Carte de la région</span><span class="region-nom">${nom}</span>${TRAIT}${boutonDescriptif(r)}</div>`;
            d.innerHTML = carteImg(url, boites.droite, nom);
        }
        r.lieuxSig = null;          // (v344) les lieux de la page se reposent (poserLieux)
        lieuxAJour = false;
    }
    // --- (v344) LES LIEUX SUR LES PAGES ----------------------------------------
    // Nico : « pour les maps régionales, précharger les icônes et les images des pages
    // d'avant et d'après, que ça ne pop pas d'un coup » ; « dès qu'on clique pour
    // tourner la page, les icônes et images disparaissent ». Les lieux (dessins et
    // noms) vivaient seulement dans la carte vivante, posée sur la page ouverte et
    // cachée dès qu'une page tourne. Chaque page de région porte maintenant les siens
    // (calqueVillagesFixe, en pourcentages de l'image) ; la page ouverte garde en plus
    // une copie figée de la carte vivante (le pion du groupe, sa route, le « ! »…).
    // Les images se chargent pour la double page ouverte, la précédente et la suivante.
    const cadreDe = (r) => r.pages && r.pages[1] && r.pages[1].querySelector(".region-carte-cadre");
    function calquesDe(r) {
        const cadre = cadreDe(r);
        if (!cadre) return null;
        let k = cadre.querySelector(".region-calques");
        if (!k) { k = document.createElement("div"); k.className = "region-calques"; k.setAttribute("aria-hidden", "true"); cadre.appendChild(k); }
        return k;
    }
    // (v383) Rend vrai quand la page porte ses lieux à jour. La signature (tous les lieux
    // de la carte) ne se recalcule plus à chaque veille : seulement quand les lieux ou les
    // fiches changent (lieuxAJour, remis à faux par leurs événements).
    function poserLieux(r) {
        if (!r.aspect || typeof window.calqueVillagesFixe !== "function" || typeof window.signatureVillagesCarte !== "function") return false;
        const k = calquesDe(r);
        if (!k) return false;
        const sig = window.signatureVillagesCarte(r.numero) + "|" + r.aspect;
        if (r.lieuxSig === sig && k.querySelector(".region-lieux")) return true;
        r.lieuxSig = sig;
        const lieux = document.createElement("div");
        lieux.className = "region-lieux";
        lieux.appendChild(window.calqueVillagesFixe(r.numero, r.aspect, "-page-" + r.numero));
        const ancien = k.querySelector(".region-lieux");
        if (ancien) ancien.replaceWith(lieux); else k.prepend(lieux);
        if (r.prechargee) chargerImagesDe(r, false);
        return true;
    }
    // (v383) Nico : « que les images sur les cartes ne se chargent pas quand la page est
    // ouverte, je le vois ». Les dessins des lieux d'une page sont chargés ET décodés à
    // l'avance (toutes les régions, dès l'entrée en partie, de proche en proche : voir
    // prechargerTout) ; l'image de la page aussi. `vivante` : l'image fine de la carte
    // vivante en plus (seulement autour de la page ouverte : elle est lourde).
    const prechargees = new Set();
    const decoder = (img) => { if (typeof img.decode === "function") img.decode().catch(() => {}); };
    function chargerImagesDe(r, vivante) {
        r.prechargee = true;
        const k = calquesDe(r);
        if (k && r.imagesPosees !== r.lieuxSig) {
            r.imagesPosees = r.lieuxSig;
            k.querySelectorAll("img[data-src]").forEach(img => {
                if (img.getAttribute("src") === img.dataset.src) return;
                img.src = img.dataset.src;
                decoder(img);
            });
        }
        const page = cadreDe(r) && cadreDe(r).querySelector(".region-carte-img");
        if (page && page.__decodee !== page.src) { page.__decodee = page.src; decoder(page); }
        if (!vivante) return;
        // L'image de la carte vivante (plus fine que celle de la page) : dans le cache.
        const carte = (window.CARTES_REGIONALES || {})[r.numero];
        const url = carte && carte.image && (typeof window.urlImageCarteRegionale === "function" ? window.urlImageCarteRegionale(carte.image) : carte.image);
        if (url && !prechargees.has(url)) { prechargees.add(url); const i = new Image(); i.decoding = "async"; i.crossOrigin = "anonymous"; i.src = url; }
    }
    // La copie figée de la carte vivante, sur la page ouverte : refaite quand elle change.
    // (v383) « Elle a changé » : un observateur le note (versionVue), au lieu de relire tout
    // le HTML de la carte à chaque veille.
    let versionVue = 0, observee = null;
    function suivreLaVue(carte) {
        if (observee === carte || typeof MutationObserver !== "function") return;
        observee = carte;
        // Le cadrage de la carte (son transform) ne change pas ce qu'elle porte : ignoré.
        new MutationObserver((liste) => {
            if (!liste.some(m => !(m.target === carte && m.type === "attributes"))) return;
            versionVue++; prete = null;
        }).observe(carte, { childList: true, subtree: true, attributes: true, characterData: true });
    }
    function copierLaVue(r) {
        const k = calquesDe(r), carte = $("carte-region");
        if (!k || !carte || typeof window.copieCarteRegionale !== "function") return;
        suivreLaVue(carte);
        const sig = observee === carte ? "v" + versionVue : carte.innerHTML.length + "|" + carte.childElementCount;
        let copie = k.querySelector(".copie-carte-region.instantane");
        if (copie && copie.__sig === sig) return poserEchelle(k);
        const c = window.copieCarteRegionale("page");
        if (!c || c.numero !== r.numero) return;
        c.element.classList.add("instantane");
        c.element.__sig = sig;
        if (copie) copie.replaceWith(c.element); else k.appendChild(c.element);
        k.classList.add("avec-instantane");
        poserEchelle(k);
    }
    function poserEchelle(k) {
        const copie = k.querySelector(".copie-carte-region.instantane"), w = k.clientWidth;
        if (copie && w > 0) copie.style.transform = `scale(${(w / (parseFloat(copie.style.width) || w)).toFixed(6)})`;
    }
    function oublierLaVue(r) {
        const k = calquesDe(r);
        if (!k || !k.classList.contains("avec-instantane")) return;
        k.querySelectorAll(".copie-carte-region.instantane").forEach(x => x.remove());
        k.classList.remove("avec-instantane");
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
            const rendu = r.url + "|" + r.nom;
            if (r.rendu !== rendu) { r.rendu = rendu; remplir(r); }
            return r;
        });
        g.definirRegions(regions.flatMap(r => r.pages));
        prechargerTout();
        // Les pages arrivées, le livre s'ouvre sur la région du groupe (une fois par partie).
        if (!ouvertureFaite && regions.length) { ouvertureFaite = true; setTimeout(() => { if (G() && G().ouvrirSurLeGroupe) G().ouvrirSurLeGroupe(); }, 250); }
    }

    // (v383) TOUTES LES CARTES DU LIVRE, PRÉPARÉES À L'AVANCE. Dès l'entrée en partie, les
    // dessins des lieux et l'image de chaque page de région se chargent et se décodent,
    // une région après l'autre (de la plus proche de la page ouverte à la plus lointaine,
    // en laissant respirer le reste du jeu entre deux) : une page qu'on ouvre, même de
    // loin (le sommaire, le groupe qui part), a déjà tout.
    let prechargement = null;
    function prechargerTout() {
        if (prechargement) clearTimeout(prechargement);
        const g = G(), pf = g && g.pageFlip && g.pageFlip();
        const ici = pf ? pf.getCurrentPageIndex() : 0;
        const file = regions.slice().sort((a, b) => Math.abs(pageDe(a) - ici) - Math.abs(pageDe(b) - ici));
        const suivante = () => {
            prechargement = null;
            const r = file.shift();
            if (!r || regions.indexOf(r) < 0) return;
            // Une page pas encore prête (ses proportions arrivent avec son image) repasse
            // en fin de file ; au bout de vingt essais, on la laisse à la veille.
            if (!poserLieux(r)) { r.essaisPrechargement = (r.essaisPrechargement || 0) + 1; if (r.essaisPrechargement < 20) file.push(r); }
            else chargerImagesDe(r, false);
            if (file.length) prechargement = setTimeout(suivante, file.every(x => x.essaisPrechargement) ? 600 : 150);
        };
        prechargement = setTimeout(suivante, 400);
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

    function allumerMarche(oui, actif, titre) {
        const m = $("grimoire-marque-marche");
        if (!m) return;
        m.classList.toggle("inactif", !oui);
        m.classList.toggle("choix", oui && actif);
        m.setAttribute("aria-disabled", String(!oui));
        if (m.title !== titre) m.title = m.ariaLabel = titre;
    }
    // (v373) Nico : « sur toutes mes pages map une ombre carrée disgracieuse : enlève-les,
    // pas besoin d'ombrage sur ces maps ». L'ombre de la pliure posée sur la carte vivante
    // (v310, coupée à la carte en v346 : le carré) n'existe plus ; les pages des cartes
    // n'ont plus l'ombre du dos (grimoire_regions.css).
    // LE GROUPE SUR LA CARTE DU MONDE DU LIVRE (v312). Nico : « rebranche sur la map
    // globale le token de là où se trouve le groupe, et les traces de déplacement
    // d'une région à l'autre ». La carte du livre a ses propres boîtes (Carte_Livre,
    // grimoire_carte.js) : le groupe se pose au centre de la boîte de sa région ; un
    // voyage d'une région à l'autre trace sa route en pointillé, d'une boîte à
    // l'autre, et le groupe y avance (la même marche que l'ancienne carte).
    const REGION_VERS_ZONE = Object.fromEntries(Object.entries(ZONE_VERS_REGION).map(([z, r]) => [r, Number(z)]));
    const LIVRE_L = 1514, LIVRE_H = 984, SVG_NS = "http://www.w3.org/2000/svg";
    function centreZone(region) {
        const z = (window.ZONES_LIVRE || {})[REGION_VERS_ZONE[Number(region)]];
        if (!z || !Array.isArray(z.points) || !z.points.length) return null;
        const xs = z.points.map(p => p.x), ys = z.points.map(p => p.y);
        return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    }
    // La route : un arc léger d'une boîte à l'autre ; `f` de 0 à 1.
    const controle = (A, B) => { const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2, dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy) || 1; return { x: mx - dy / l * l * 0.12, y: my + dx / l * l * 0.12 }; };
    const surArc = (A, B, f) => { const C = controle(A, B), u = 1 - f; return { x: u * u * A.x + 2 * u * f * C.x + f * f * B.x, y: u * u * A.y + 2 * u * f * C.y + f * f * B.y }; };
    function calqueGroupe() {
        const g = G();
        if (!g || !g.scene() || !g.livre()) return null;
        let svg = $("calque-groupe-livre");
        if (!svg) {
            svg = document.createElementNS(SVG_NS, "svg");
            svg.id = "calque-groupe-livre";
            svg.setAttribute("class", "calque-groupe-livre");
            svg.setAttribute("viewBox", `0 0 ${LIVRE_L} ${LIVRE_H}`);
            svg.setAttribute("preserveAspectRatio", "none");
            g.scene().appendChild(svg);
        }
        const livre = g.livre();
        Object.assign(svg.style, { left: livre.style.left, top: livre.style.top, width: livre.style.width, height: livre.style.height });
        return svg;
    }
    function poserGroupeSurLeMonde(visible) {
        const svg = calqueGroupe();
        if (!svg) return;
        svg.classList.toggle("visible", !!visible);
        if (!visible) return;
        const ev = typeof window.etatVoyageGroupe === "function" ? window.etatVoyageGroupe() : {};
        const v = ev.voyage, pos = ev.position, choix = ev.choix;
        let route = null, ici = null;
        if (v && v.Type === "monde" && v.Depart && v.Arrivee) {
            const A = centreZone(v.Depart.Region), B = centreZone(v.Arrivee.Region);
            if (A && B) {
                const f = v.Etat === "marche" && ev.anim && ev.anim.cle === (window.cleAnimationVoyage ? window.cleAnimationVoyage(v) : null) ? Number(ev.anim.f) || 0 : (v.Etat === "vote" ? 0 : 0);
                route = { A, B, provisoire: v.Etat === "vote" };
                ici = surArc(A, B, Math.max(0, Math.min(1, f)));
            }
        } else if (choix && choix.proposition && choix.proposition.type === "monde") {
            const A = centreZone(choix.proposition.depart.Region), B = centreZone(choix.proposition.arrivee.Region);
            if (A && B) route = { A, B, provisoire: true };
        }
        if (!ici) {
            const region = v && v.Type === "region" ? v.Arrivee && v.Arrivee.Region : pos && pos.Region;
            ici = centreZone(region);
        }
        const signature = JSON.stringify([route && [route.A, route.B, route.provisoire], ici && [Math.round(ici.x), Math.round(ici.y)]]);
        if (svg.__signature === signature) return;
        svg.__signature = signature;
        let html = "";
        if (route) {
            const C = controle(route.A, route.B);
            html += `<path class="route-groupe-livre${route.provisoire ? " provisoire" : ""}" d="M ${route.A.x.toFixed(1)} ${route.A.y.toFixed(1)} Q ${C.x.toFixed(1)} ${C.y.toFixed(1)} ${route.B.x.toFixed(1)} ${route.B.y.toFixed(1)}"/>`;
            html += `<path class="croix-groupe-livre" d="M ${route.B.x - 9} ${route.B.y - 9} l 18 18 M ${route.B.x + 9} ${route.B.y - 9} l -18 18"/>`;
        }
        if (ici && window.IMAGE_GROUPE_MONDE) {
            const t = 78;
            html += `<image class="pion-groupe-livre" href="${window.IMAGE_GROUPE_MONDE}" x="${(ici.x - t / 2).toFixed(1)}" y="${(ici.y - t * 0.82).toFixed(1)}" width="${t}" height="${t}"/>`;
        }
        svg.innerHTML = html;
    }
    window.poserGroupeSurLaCarteDuLivre = () => poserGroupeSurLeMonde(true);
    // (v383) Pendant la marche d'une région à l'autre, le pion du groupe suit l'animation
    // image par image (voyage_groupe.js), au lieu d'avancer au rythme de la veille.
    window.suivreGroupeSurLeLivre = () => {
        const g = G(), pf = g && g.pageFlip && g.pageFlip();
        if (!g || !g.enPartie || !g.enPartie() || !pf || pf.getState() !== "read") return;
        if (surLaCarteDuMonde()) poserGroupeSurLeMonde(true);
    };
    // LES FENÊTRES DU VOYAGE DANS LE LIVRE (v373). Nico : « toutes les popups qui
    // s'ouvrent pour les déplacements sur les maps : plutôt que des popups, que ça
    // s'affiche en fondu sur la page de gauche ». Ses réponses : toutes (le choix de
    // la destination, le vote, la nuit, le détour, la halte, « en route », l'attente
    // du lieu, les petits messages, « JOUR 2 », l'aperçu d'un lieu) ; le titre de la
    // région remonte en haut de la page ; à l'encre sur le papier ; sur la carte du
    // monde (sans page libre), « un post-it qui sort par le haut ».
    // Les fenêtres restent celles de voyage_groupe.js et villages_regionaux.js (mêmes
    // éléments, mêmes boutons) : elles sont RANGÉES sur la page le temps qu'on y est,
    // et rendues à l'écran de jeu ailleurs (grimoire_regions.css les réécrit à l'encre).
    const FENETRES_VOYAGE = ["annonce-jour-voyage", "attente-poi", "bandeau-voyage", "boite-voyage", "annonce-voyage", "apercu-lieu"];
    const fenetreVisible = (el) => el.classList.contains("visible") || (["bandeau-voyage", "boite-voyage"].includes(el.id) && el.style.display !== "none" && el.innerHTML.trim() !== "");
    function papierDuMonde() {
        let el = $("voyage-postit");
        const g = G(), scene = g && g.scene && g.scene(), livre = g && g.livre && g.livre();
        if (!el && scene && livre) {
            el = document.createElement("div");
            el.id = "voyage-postit";
            el.className = "recit-ecriture voyage-postit";
            el.innerHTML = `<div class="papier-ecriture papier-voyage voyage-livre" id="voyage-postit-papier"></div>`;
            scene.insertBefore(el, livre);
        }
        return el;
    }
    function rangerFenetresVoyage(r, monde) {
        // (v373) Nico : « si on est en mode zoom de la map (la loupe), tu peux laisser la
        // popup, mais en mode bout de papier parchemin » : sous la loupe, elles flottent
        // à l'écran, habillées en bouts de parchemin (grimoire_regions.css, .loupe-voyage).
        const loupe = !!window.LOUPE_CARTES && window.LOUPE_CARTES.etat() !== "repos";
        document.body.classList.toggle("loupe-voyage", loupe);
        if (loupe) r = monde = null;
        let ici = null;
        if (r) {
            const page = r.pages[0];
            ici = page.querySelector(":scope > .voyage-page");
            if (!ici) { ici = document.createElement("div"); ici.className = "voyage-page voyage-livre"; page.appendChild(ici); }
        } else if (monde) {
            const postit = papierDuMonde();
            ici = postit && postit.querySelector(".papier-voyage");
        }
        const dehors = $("ecran-jeu") || document.body;
        FENETRES_VOYAGE.forEach(id => {
            const el = $(id);
            if (!el) return;
            const voulu = ici || (id === "apercu-lieu" ? document.body : dehors);
            if (el.parentNode !== voulu) voulu.appendChild(el);
        });
        // Le titre de la région remonte quand une fenêtre s'écrit sur la page ; le post-it sort.
        const occupe = !!ici && [...ici.children].some(fenetreVisible);
        regions.forEach(x => x.pages[0].classList.toggle("avec-voyage", occupe && x === r));
        const postit = $("voyage-postit");
        if (postit) postit.classList.toggle("sortie", occupe && !r && !!monde);
    }
    window.rangerFenetresVoyageLivre = rangerFenetresVoyage;
    let tailleVue = "", vueObservee = null, vueRedimensionnee = true;
    // (v383) La carte vivante prête (images chargées et décodées), retenue tant que
    // la région posée et ce que porte la carte ne changent pas : null = à revoir.
    let prete = null, preteDe = null;
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
                allumerMarche(false, false, "Voyager");
                poserGroupeSurLeMonde(false);
                rangerFenetresVoyage(null, false);
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
        // (v310) Une page qui part : la carte vivante et sa pliure se cachent tout de suite.
        if (pf && !pf.__veilleRegions) { pf.__veilleRegions = true; try { pf.on("changeState", () => setTimeout(veiller, 0)); } catch (e) {} }
        const lu = !!pf && pf.getState() === "read" && !(g.defileEnCours && g.defileEnCours());
        const vue = $("vue-carte-region");
        // (v345) Nico : « quand on tourne la page, l'ombre du milieu disparaît ». Une fois
        // la page posée, la carte vivante réapparaissait aussitôt, encore celle de la région
        // d'avant (la nouvelle n'était pas montée) et sans l'ombre de la pliure, posée
        // seulement une fois la nouvelle montée : un instant, ni ombre ni bonne carte. Elle
        // reste cachée tant qu'elle n'est pas celle de la double page ouverte ; dessous,
        // la page garde son image, ses lieux et sa propre ombre.
        const rIci = lu ? regionOuverte() : null;
        if (vue) vue.classList.toggle("en-tourne", !!montee && !(lu && rIci && montee === rIci.numero));
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
        if (typeof window.actualiserBoutonVoyage === "function") window.actualiserBoutonVoyage();
        // (v310) Le bouton du voyage devient un marque-page, en haut à droite du
        // livre : il ne sort que sur ses cartes, et quand on peut voyager.
        const ev = typeof window.etatVoyageLivre === "function" ? window.etatVoyageLivre() : null;
        allumerMarche(carteDuLivre && !!ev && ev.possible, !!ev && ev.actif, ev ? ev.titre : "Voyager");
        poserGroupeSurLeMonde(lu && surLaCarteDuMonde());
        // (v373) Les fenêtres du voyage sur la page de gauche (ou le post-it du monde) ;
        // pendant qu'une page tourne, elles restent où elles sont.
        if (lu) rangerFenetresVoyage(r && montee === r.numero ? r : null, surLaCarteDuMonde());
        // (v310) La pliure du livre par-dessus la carte vivante ; sous elle, l'image
        // de la page s'efface (ses trous brûlés montrent le papier, pas la carte).
        // (v344) …mais seulement une fois la carte vivante prête (ses images chargées) :
        // sinon, un instant, ni l'une ni l'autre.
        if (preteDe !== montee) { preteDe = montee; prete = null; }
        if (!prete && montee) prete = typeof window.carteRegionalePrete !== "function" || window.carteRegionalePrete();
        regions.forEach(x => x.pages.forEach(pg => pg.classList.toggle("sous-la-vue", !!(lu && montee === x.numero && prete))));
        // (v344) Les lieux sur chaque page ; les images autour de la page ouverte ; la
        // copie figée de la carte vivante sur sa page (elle y reste pendant qu'elle tourne).
        const ici = pf ? pf.getCurrentPageIndex() : -1;
        if ($("carte-region")) suivreLaVue($("carte-region"));
        if (!lieuxAJour) lieuxAJour = regions.map(poserLieux).every(Boolean);
        regions.forEach(x => {
            if (Math.abs(pageDe(x) - ici) <= 3) chargerImagesDe(x, true);
            if (lu && montee === x.numero && prete && window.carteRegionaleOuverte && window.carteRegionaleOuverte() === x.numero) copierLaVue(x);
            else if (lu && montee !== x.numero) oublierLaVue(x);
        });
        // (v310) La place de la carte a changé de taille (écran tourné, livre posé) : on recadre.
        // (v383) Mesurée seulement quand un observateur dit qu'elle a changé : plus de
        // mesure (et de recalcul de la mise en page) à chaque veille.
        if (vue && vueObservee !== vue && typeof ResizeObserver === "function") {
            vueObservee = vue;
            new ResizeObserver(() => { vueRedimensionnee = true; veillerBientot(); }).observe(vue);
        }
        if (vue && montee && (vueRedimensionnee || vueObservee !== vue)) {
            vueRedimensionnee = false;
            const taille = vue.offsetWidth + "x" + vue.offsetHeight;
            if (taille !== tailleVue && typeof window.recadrerCarteRegionale === "function") window.recadrerCarteRegionale();
            tailleVue = taille;
        }
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
        ouvrir, versLeMonde, pageDuGroupe, montee: () => montee, veiller,
        versionVue: () => versionVue           // (v383) ce que porte la carte vivante a changé (loupe_cartes.js)
    };
    // (v383) LA VEILLE RÉAGIT AUX CHANGEMENTS au lieu de tout revoir 5 fois par seconde :
    // une page qui tourne (déjà écouté), une carte régionale ouverte ou fermée, des lieux
    // ou des fiches de carte qui changent, l'écran redimensionné. Le minuteur reste en
    // filet (les fenêtres du voyage qui s'ouvrent, l'état du groupe), mais chaque passage
    // ne fait plus que comparer : les lieux, la copie de la carte vivante, sa taille et
    // ses images ne se refont que quand ils ont changé. Rien ne tourne en arrière-plan.
    let bientot = null;
    function veillerBientot() {
        if (bientot) return;
        bientot = setTimeout(() => { bientot = null; veiller(); }, 0);
    }
    window.addEventListener("carte-regionale", veillerBientot);
    window.addEventListener("villages-regionaux-maj", () => { lieuxAJour = false; veillerBientot(); });
    window.addEventListener("cartes-regionales-maj", () => { lieuxAJour = false; veillerBientot(); });
    window.addEventListener("resize", veillerBientot);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) veillerBientot(); });
    setInterval(() => { if (!document.hidden) veiller(); }, 250);
})();
