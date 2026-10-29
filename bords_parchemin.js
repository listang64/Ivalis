// =========================================================================
//  IVALIS — LES BORDS DE PARCHEMIN (v282)
// =========================================================================
//  Nico : « sur les bords de mes images de map globale et de maps régionales,
//  un effet de bord de parchemin usé, un peu déchiré, noirci à quelques
//  endroits, peut-être parfois quelques trous ; de façon aléatoire et
//  procédurale ».
//
//  DEUX IMAGES, CALCULÉES UNE FOIS PAR CARTE (sa graine : toujours le même
//  bord pour une même carte, chez tous les joueurs) :
//    · LE MASQUE (mask-image) : la carte est découpée le long d'une déchirure
//      irrégulière — de grandes ondulations, des morsures, des fibres, çà et
//      là une déchirure plus profonde, des coins usés — et percée de quelques
//      trous (zéro à trois, près des bords). Au-delà, le fond sombre ;
//    · L'USURE (une couche posée sur l'image, sous tout le reste) : le bord
//      bruni partout, NOIRCI (brûlé) par endroits, en taches ; une frange claire
//      de fibres là où le papier n'a pas brûlé ; le pourtour noirci des trous.
//
//  Le calcul se fait sur une toile 2D, seulement dans la bande du bord (et
//  autour des trous) : quelques centaines de millisecondes au plus, une fois.
//  Les images sont gardées (une par carte) le temps de la page.
//  Script simple (pas un module) : chargé avant les cartes.
// =========================================================================
(function () {
    // LE NOYAU DU CALCUL : du calcul pur (ni page, ni toile), pour tourner
    // dans un Worker — la traversée des nuages ne s'arrête pas pendant qu'on
    // déchire la carte — ou, à défaut, ici même.
    function noyau() {
        const BANDE = 0.13;              // la bande travaillée, en part du petit côté

        // --- LE BRUIT (une graine par carte) ----------------------------------
        function hachage(x, y, g) {
            let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(g, 1442695041);
            h = Math.imul(h ^ (h >>> 13), 1274126177);
            h ^= h >>> 16;
            return (h >>> 0) / 4294967296;
        }
        function bruit(x, y, g) {
            const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
            const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
            const a = hachage(xi, yi, g), b = hachage(xi + 1, yi, g), c = hachage(xi, yi + 1, g), d = hachage(xi + 1, yi + 1, g);
            return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
        }
        function fbm(x, y, g, octaves) {
            let s = 0, a = 0.5, t = 0;
            for (let i = 0; i < octaves; i++) {
                s += a * bruit(x, y, g + i * 31); t += a;
                const nx = x * 1.6 - y * 1.2 + 3.1, ny = x * 1.2 + y * 1.6 + 7.7;
                x = nx; y = ny; a *= 0.5;
            }
            return s / t;
        }
        const lisse = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

        // --- LE BORD ------------------------------------------------------------
        // La profondeur de la déchirure à cet endroit (en part du petit côté).
        function profondeur(u, v, g, coins) {
            let p = 0.005
                + 0.030 * fbm(u * 3, v * 3, g, 3)                                   // les grandes ondulations
                + 0.045 * Math.max(0, fbm(u * 11, v * 11, g + 100, 3) - 0.42)      // les morsures
                + 0.005 * fbm(u * 70, v * 70, g + 200, 2)                            // les fibres, déchiquetées
                + 0.16 * Math.max(0, fbm(u * 1.6, v * 1.6, g + 300, 2) - 0.6);     // çà et là, une déchirure profonde
            // Les coins s'usent plus que le reste.
            for (const c of coins) {
                const d = Math.hypot(u - c[0], v - c[1]);
                p += 0.035 * Math.exp(-d / 0.05);
            }
            return p;
        }

        // Les trous : zéro à trois, près d'un bord, d'une forme irrégulière.
        function trous(W, H, s, g) {
            const n = Math.floor(hachage(7, 11, g) * 3.6 + 0.4);       // un sur dix sans trou
            const liste = [];
            for (let i = 0; i < n; i++) {
                const h = (k) => hachage(i * 13 + k, i * 7 + 3 * k, g + 900);
                const cote = Math.floor(h(1) * 4), long = 0.12 + 0.76 * h(2), retrait = (0.035 + 0.075 * h(3)) * s;
                const r = (0.008 + 0.016 * h(4)) * s;
                let x, y;
                if (cote === 0) { x = long * W; y = retrait; }
                else if (cote === 1) { x = W - retrait; y = long * H; }
                else if (cote === 2) { x = long * W; y = H - retrait; }
                else { x = retrait; y = long * H; }
                liste.push({ x, y, r, g: g + 1000 + i * 17 });
            }
            return liste;
        }

        // Calcule les deux images d'une carte (largeur × hauteur en pixels de
        // calcul). Rend { masque, usure } : deux tableaux RGBA.
        function calculer(W, H, graine) {
            const s = Math.min(W, H), px = 1 / s, bande = BANDE * s;
            const m = new Uint8ClampedArray(W * H * 4), o = new Uint8ClampedArray(W * H * 4);
            for (let i = 0; i < W * H; i++) { m[i * 4] = m[i * 4 + 1] = m[i * 4 + 2] = 255; m[i * 4 + 3] = 255; }
            const coins = [[0, 0], [W / s, 0], [0, H / s], [W / s, H / s]];
            const g = graine | 0;
            // Ce que la couche d'usure reçoit en un point : du brun, du noir, de la frange.
            const brunR = 98, brunV = 62, brunB = 26, noirR = 24, noirV = 12, noirB = 4, clairR = 236, clairV = 222, clairB = 188;
            const poser = (k, brun, noir, frange) => {
                // Le sombre (le brun qui vire au noir), la frange claire par-dessus,
                // le tout posé sur ce que la couche a déjà (prémultiplié).
                const ad = Math.min(1, brun + noir), part = noir / Math.max(1e-6, brun + noir);
                const dr = brunR + (noirR - brunR) * part, dv = brunV + (noirV - brunV) * part, db = brunB + (noirB - brunB) * part;
                const al = Math.min(1, frange), a = al + ad * (1 - al);
                if (a <= 0.002) return;
                const pr = clairR * al + dr * ad * (1 - al), pv = clairV * al + dv * ad * (1 - al), pb = clairB * al + db * ad * (1 - al);
                const ao = o[k + 3] / 255, af = a + ao * (1 - a);
                o[k] = Math.round((pr + o[k] * ao * (1 - a)) / af);
                o[k + 1] = Math.round((pv + o[k + 1] * ao * (1 - a)) / af);
                o[k + 2] = Math.round((pb + o[k + 2] * ao * (1 - a)) / af);
                o[k + 3] = Math.round(af * 255);
            };
            // 1. LA BANDE DU BORD : la déchirure, le bruni, le noirci, la frange.
            for (let y = 0; y < H; y++) {
                const dy = Math.min(y, H - 1 - y);
                for (let x = 0; x < W; x++) {
                    const dbord = Math.min(x, W - 1 - x, dy);
                    if (dbord > bande) { if (x < W - 1 - bande) x = Math.max(x, Math.floor(W - 1 - bande) - 1); continue; }
                    const u = x * px, v = y * px;
                    const dechire = dbord * px - profondeur(u, v, g, coins);
                    const k = (y * W + x) * 4;
                    m[k + 3] = Math.round(255 * Math.max(0, Math.min(1, dechire / px + 0.5)));
                    if (dechire < -px) continue;
                    const e = Math.max(0, dechire);
                    const brulee = lisse(0.44, 0.62, fbm(u * 2.4, v * 2.4, g + 400, 3));     // des tronçons brûlés
                    const tache = 0.55 + 0.9 * fbm(u * 24, v * 24, g + 500, 2);               // en taches
                    const brun = 0.62 * Math.exp(-e / 0.016) * tache + 0.12 * Math.exp(-e / 0.05);
                    const noir = brulee * (1.1 * Math.exp(-e / 0.006) + 0.5 * Math.exp(-e / 0.024)) * tache;
                    const frange = (1 - brulee) * 0.55 * Math.exp(-e / 0.0016);
                    // L'usure s'éteint avant la limite de la bande (pas de cadre visible).
                    const fondu = 1 - lisse(BANDE * 0.55, BANDE * 0.95, dbord * px);
                    poser(k, brun * fondu, noir * fondu, frange);
                }
            }
            // 2. LES TROUS : percés, le pourtour noirci.
            trous(W, H, s, g).forEach(t => {
                const R = Math.ceil(t.r * 4.5);
                const x0 = Math.max(0, Math.floor(t.x - R)), x1 = Math.min(W - 1, Math.ceil(t.x + R));
                const y0 = Math.max(0, Math.floor(t.y - R)), y1 = Math.min(H - 1, Math.ceil(t.y + R));
                for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                    const d = Math.hypot(x - t.x, y - t.y);
                    const rayon = t.r * (1 + 1.1 * (fbm(x / (t.r * 0.8), y / (t.r * 0.8), t.g, 4) - 0.5));
                    const dedans = d - rayon;                                            // < 0 : le trou
                    const k = (y * W + x) * 4;
                    m[k + 3] = Math.min(m[k + 3], Math.round(255 * Math.max(0, Math.min(1, dedans + 0.5))));
                    if (dedans < -1) continue;
                    const e = Math.max(0, dedans) / t.r;
                    const tache = 0.7 + 0.6 * bruit(x / (t.r * 0.35), y / (t.r * 0.35), t.g + 5);
                    poser(k, 0.55 * Math.exp(-e / 1.5) * tache, (0.9 * Math.exp(-e / 0.25) + 0.35 * Math.exp(-e / 0.8)) * tache, 0);
                }
            });
            return { masque: m, usure: o };
        }

        return calculer;
    }
    const calculer = noyau();
    const cache = new Map();

    // LE WORKER (un fichier fabriqué ici) ; s'il manque, le calcul se fait sur place.
    let travailleur = null, numero = 0;
    const attente = new Map();
    function ouvrier() {
        if (travailleur !== null) return travailleur;
        try {
            const source = `const calculer = (${noyau.toString()})();
self.onmessage = (e) => { const d = e.data, r = calculer(d.W, d.H, d.g);
  self.postMessage({ id: d.id, masque: r.masque, usure: r.usure }, [r.masque.buffer, r.usure.buffer]); };`;
            travailleur = new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })));
            travailleur.onmessage = (e) => { const t = attente.get(e.data.id); attente.delete(e.data.id); if (t) t.resoudre(e.data); };
            travailleur.onerror = () => {
                travailleur = false;
                attente.forEach((t) => t.resoudre(calculer(t.W, t.H, t.g)));
                attente.clear();
            };
        } catch (e) { travailleur = false; }
        return travailleur;
    }
    function tableaux(W, H, g) {
        const w = ouvrier();
        if (!w) return Promise.resolve(calculer(W, H, g));
        return new Promise((resoudre) => { const id = ++numero; attente.set(id, { resoudre, W, H, g }); w.postMessage({ id, W, H, g }); });
    }

    const enUrl = (toile) => new Promise((resoudre) => {
        if (typeof toile.toBlob === "function") toile.toBlob((b) => resoudre(b ? URL.createObjectURL(b) : toile.toDataURL("image/png")), "image/png");
        else resoudre(toile.toDataURL("image/png"));
    });

    // Les deux images d'une carte, en adresses (gardées).
    function fabriquer(largeur, hauteur, graine) {
        const cle = `${graine}:${largeur}x${hauteur}`;
        if (!cache.has(cle)) {
            cache.set(cle, (async () => {
                const t0 = performance.now();
                const r = await tableaux(largeur, hauteur, graine | 0);
                const toile = (donnees) => { const c = document.createElement("canvas"); c.width = largeur; c.height = hauteur;
                    c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(donnees.buffer || donnees), largeur, hauteur), 0, 0); return c; };
                const [m, u] = await Promise.all([enUrl(toile(r.masque)), enUrl(toile(r.usure))]);
                const ms = Math.round(performance.now() - t0);
                return { masque: m, usure: u, largeur, hauteur, graine, ms };
            })());
        }
        return cache.get(cle);
    }

    // Pose le bord sur `element` : son masque, et la couche d'usure (insérée
    // juste après `apres`, ou en premier enfant). `aspect` = largeur / hauteur
    // de l'élément ; le calcul se fait sur `cote` pixels pour le grand côté.
    const dimensions = (aspect, cote) => ({ largeur: Math.round(aspect >= 1 ? cote : cote * aspect), hauteur: Math.round(aspect >= 1 ? cote / aspect : cote) });
    // Lancer le calcul d'avance (la carte s'ouvre : il tourne pendant la plongée).
    function preparer(options) {
        const o = options || {}, d = dimensions(o.aspect || 1, o.cote || 2048);
        return fabriquer(d.largeur, d.hauteur, o.graine || 1);
    }
    async function appliquer(element, options) {
        if (!element) return null;
        const o = options || {};
        const { largeur, hauteur } = dimensions(o.aspect || 1, o.cote || 2048);
        const jeton = {};
        // Une autre carte que la dernière : son bord à elle ne doit pas s'y voir, même un instant.
        if (element.__graineParchemin !== (o.graine || 1)) retirer(element);
        element.__bordParchemin = jeton;
        element.__graineParchemin = o.graine || 1;
        const r = await fabriquer(largeur, hauteur, o.graine || 1);
        if (element.__bordParchemin !== jeton) return null;     // une autre carte entre-temps
        const st = element.style;
        st.webkitMaskImage = st.maskImage = `url("${r.masque}")`;
        st.webkitMaskSize = st.maskSize = "100% 100%";
        st.webkitMaskRepeat = st.maskRepeat = "no-repeat";
        let couche = element.querySelector(":scope > .parchemin-usure");
        if (!couche) {
            couche = document.createElement("div");
            couche.className = "parchemin-usure";
            const apres = o.apres && o.apres.parentNode === element ? o.apres : null;
            element.insertBefore(couche, apres ? apres.nextSibling : element.firstChild);
        }
        couche.style.backgroundImage = `url("${r.usure}")`;
        element.classList.add("bord-parchemin");
        return r;
    }
    function retirer(element) {
        if (!element) return;
        element.__bordParchemin = null;
        element.__graineParchemin = null;
        const st = element.style;
        st.webkitMaskImage = st.maskImage = "";
        const couche = element.querySelector(":scope > .parchemin-usure");
        if (couche) couche.remove();
        element.classList.remove("bord-parchemin");
    }

    window.BordsParchemin = { fabriquer, preparer, appliquer, retirer, calculer, ouvrier: () => !!ouvrier() };
    // Les graines : la carte du monde, et chaque carte régionale (la sienne).
    window.graineParcheminRegion = (n) => 7919 * Number(n) + 13;

    // LA CARTE DU MONDE : dès que la page est là (le calcul tourne à part).
    const ASPECT_MONDE = 3840 / 2160;
    function poserSurLeMonde() {
        const monde = document.getElementById("carte-fond-jeu");
        if (monde) appliquer(monde, { graine: 1, aspect: ASPECT_MONDE, cote: 2048 }).catch(e => console.error("Bord de parchemin (monde) :", e));
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", poserSurLeMonde);
    else setTimeout(poserSurLeMonde, 0);
})();
