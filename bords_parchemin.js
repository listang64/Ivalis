// =========================================================================
//  IVALIS — LES BORDS DE PARCHEMIN (v282, v283, v284)
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
//  v283 — Nico : « que ça aille moins sur la carte, au risque de plus voir la
//  carte ; que ça fluctue, mais que sur les bords… Crée-moi un pinceau dans
//  DEV pour que je puisse peindre les zones où tu peux brûler, faire des
//  trous ». PAR DÉFAUT, le bord est mince et léger (une fine déchirure qui
//  ondule, un liseré bruni) ; les brûlures, les grandes déchirures et les
//  trous ne naissent QUE dans les zones peintes en DEV (usure_parchemin.js
//  pour la carte du monde, cartes_regionales.js pour chaque région).
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
        const SEUIL_TROU = 1.12;          // dans une zone peinte : au-delà, le papier est percé
        const TORSION = 0.08;            // de combien la zone peinte est tordue, au plus (en part de la largeur)

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

        // --- LES ZONES PEINTES (v282b) -------------------------------------------
        // La grille peinte en DEV (0/1, colonnes × lignes) adoucie en un champ
        // de 0 à 1 (deux flous en boîte), lue au point (u, v en parts de l'image).
        function champDesZones(zones) {
            if (!zones || !zones.cases || !(zones.colonnes > 0) || !(zones.lignes > 0)) return null;
            const C = zones.colonnes, L = zones.lignes, R = 2;
            let a = Float32Array.from(zones.cases, x => (x ? 1 : 0));
            if (!a.some(x => x)) return null;
            for (let passe = 0; passe < 2; passe++) {
                const b = new Float32Array(C * L), c = new Float32Array(C * L);
                for (let l = 0; l < L; l++) for (let k = 0; k < C; k++) { let t = 0, n = 0; for (let d = -R; d <= R; d++) { const kk = k + d; if (kk >= 0 && kk < C) { t += a[l * C + kk]; n++; } } b[l * C + k] = t / n; }
                for (let l = 0; l < L; l++) for (let k = 0; k < C; k++) { let t = 0, n = 0; for (let d = -R; d <= R; d++) { const ll = l + d; if (ll >= 0 && ll < L) { t += b[ll * C + k]; n++; } } c[l * C + k] = t / n; }
                a = c;
            }
            // Le plein d'une zone, même étroite, vaut 1 (le flou ne l'éteint pas).
            for (let i = 0; i < a.length; i++) a[i] = Math.min(1, a[i] * 1.6);
            const lire = (u, v) => {
                const x = Math.max(0, Math.min(C - 1.001, u * C - 0.5)), y = Math.max(0, Math.min(L - 1.001, v * L - 0.5));
                const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, i = y0 * C + x0;
                const h = a[i] + (a[i + 1] - a[i]) * fx, b2 = a[i + C] + (a[i + C + 1] - a[i + C]) * fx;
                return h + (b2 - h) * fy;
            };
            // Les cellules où il y a quelque chose, élargies de ce que la zone
            // peut être tordue (TORSION) : on ne calcule que là.
            const base = new Uint8Array(C * L);
            for (let i = 0; i < a.length; i++) if (a[i] > 0.005) base[i] = 1;
            const D = Math.ceil(TORSION * C) + 1, ligne = new Uint8Array(C * L), actif = new Uint8Array(C * L);
            for (let l = 0; l < L; l++) for (let k = 0; k < C; k++) {
                if (!base[l * C + k]) continue;
                for (let kk = Math.max(0, k - D); kk <= Math.min(C - 1, k + D); kk++) ligne[l * C + kk] = 1;
            }
            for (let l = 0; l < L; l++) for (let k = 0; k < C; k++) {
                if (!ligne[l * C + k]) continue;
                for (let ll = Math.max(0, l - D); ll <= Math.min(L - 1, l + D); ll++) actif[ll * C + k] = 1;
            }
            return { lire, actif, C, L };
        }

        // --- LE BORD ------------------------------------------------------------
        // La profondeur de la déchirure (en part du petit côté). Partout : un bord
        // mince, léger, qui fluctue (Nico : « que ça aille moins sur la carte… que
        // ça fluctue, mais que sur les bords »). Dans une zone peinte : les
        // morsures, les grandes déchirures.
        function profondeur(u, v, g, coins, z) {
            // v284 — Nico : « sans peinture, juste un bord fin en mode parchemin,
        // sur tout le bord, et pas épais » : une déchirure à peine marquée,
        // régulière tout autour (des fibres, une très légère ondulation).
        let p = 0.0015
                + 0.003 * fbm(u * 4, v * 4, g, 3)                                    // l'ondulation
                + 0.0016 * fbm(u * 70, v * 70, g + 200, 2);                          // les fibres
            for (const c of coins) p += 0.004 * Math.exp(-Math.hypot(u - c[0], v - c[1]) / 0.02);   // les coins s'usent à peine
            if (z > 0) {
                p += z * (0.012 + 0.03 * fbm(u * 3, v * 3, g + 50, 3)
                    + 0.06 * Math.max(0, fbm(u * 11, v * 11, g + 110, 3) - 0.4)
                    + 0.006 * fbm(u * 70, v * 70, g + 250, 2)
                    + 0.14 * Math.max(0, fbm(u * 1.6, v * 1.6, g + 300, 2) - 0.5));
            }
            return p;
        }

        // Calcule les deux images d'une carte (largeur × hauteur en pixels de
        // calcul) ; `zones` : la grille peinte en DEV ({ colonnes, lignes, cases }),
        // ou rien. Rend { masque, usure } : deux tableaux RGBA.
        function calculer(W, H, graine, zones) {
            const s = Math.min(W, H), px = 1 / s, bande = BANDE * s;
            const m = new Uint8ClampedArray(W * H * 4), o = new Uint8ClampedArray(W * H * 4);
            for (let i = 0; i < W * H; i++) { m[i * 4] = m[i * 4 + 1] = m[i * 4 + 2] = 255; m[i * 4 + 3] = 255; }
            const coins = [[0, 0], [W / s, 0], [0, H / s], [W / s, H / s]];
            const g = graine | 0;
            const champ = champDesZones(zones);
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
            for (let y = 0; y < H; y++) {
                const dy = Math.min(y, H - 1 - y), v = y * px;
                const ligneZone = champ ? Math.max(0, Math.min(champ.L - 1, Math.floor(y / H * champ.L))) : 0;
                for (let x = 0; x < W; x++) {
                    const dbord = Math.min(x, W - 1 - x, dy);
                    const prochesDuBord = dbord <= bande;
                    const dansZone = !!champ && champ.actif[ligneZone * champ.C + Math.min(champ.C - 1, Math.floor(x / W * champ.C))] === 1;
                    if (!prochesDuBord && !dansZone) continue;
                    const u = x * px;
                    // La zone est lue un peu de travers (un champ de bruit la tord) :
                    // ni rond de pinceau, ni escalier de cases ne se voient.
                    const z = champ ? champ.lire(x / W + 2 * TORSION * (fbm(u * 4, v * 4, g + 800, 3) - 0.5), y / H + 2 * TORSION * (fbm(u * 4, v * 4, g + 850, 3) - 0.5) * W / H) : 0;
                    const k = (y * W + x) * 4;
                    let alpha = 1, brun = 0, noir = 0, frange = 0;
                    // 1. LE BORD : partout mince et léger ; brûlé et déchiré dans les zones peintes.
                    if (prochesDuBord) {
                        const dechire = dbord * px - profondeur(u, v, g, coins, z);
                        alpha = Math.max(0, Math.min(1, dechire / px + 0.5));
                        if (dechire >= -px) {
                            const e = Math.max(0, dechire);
                            const tache = 0.8 + 0.4 * fbm(u * 24, v * 24, g + 500, 2) + z * 0.5 * (fbm(u * 24, v * 24, g + 500, 2) - 0.5);
                            // Le liseré bruni : fin et régulier tout autour (un peu plus large où c'est peint).
                            const large = 0.003;
                            const brulee = z * lisse(0.25, 0.5, fbm(u * 2.4, v * 2.4, g + 400, 3));
                            const fondu = 1 - lisse(BANDE * 0.55, BANDE * 0.95, dbord * px);
                            brun += fondu * tache * (0.55 * Math.exp(-e / large) + 0.12 * Math.exp(-e / (2.5 * large)) + z * 0.5 * Math.exp(-e / 0.016));
                            noir += fondu * tache * brulee * (1.1 * Math.exp(-e / (0.002 + 0.004 * z + 0.4 * large)) + z * 0.5 * Math.exp(-e / 0.024));
                            frange += (1 - Math.min(1, brulee * 2)) * 0.4 * Math.exp(-e / 0.0014);
                        }
                    }
                    // 2. DANS LES ZONES PEINTES : la brûlure gagne le cœur de la zone,
                    //    en taches irrégulières ; le plus brûlé se perce.
                    if (z > 0.02) {
                        const q = z + 2.4 * (fbm(u * 6.5, v * 6.5, g + 600, 4) - 0.5) + 0.3 * (bruit(u * 30, v * 30, g + 620) - 0.5);
                        const grain = 0.75 + 0.45 * bruit(u * 40, v * 40, g + 650);
                        // Le noir serre le bord du trou ; le roussi s'étend autour, en taches.
                        const charbon = Math.pow(lisse(SEUIL_TROU - 0.5, SEUIL_TROU - 0.01, q), 1.5);
                        noir += grain * charbon;
                        brun += 0.55 * (0.55 + 0.9 * fbm(u * 24, v * 24, g + 500, 2)) * lisse(SEUIL_TROU - 1.0, SEUIL_TROU - 0.35, q) * (1 - 0.6 * charbon);
                        if (q > SEUIL_TROU) alpha = Math.min(alpha, 1 - lisse(SEUIL_TROU, SEUIL_TROU + 0.03, q));
                    }
                    m[k + 3] = Math.round(255 * alpha);
                    if (alpha > 0) poser(k, brun, noir, frange);
                }
            }
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
self.onmessage = (e) => { const d = e.data, r = calculer(d.W, d.H, d.g, d.zones);
  self.postMessage({ id: d.id, masque: r.masque, usure: r.usure }, [r.masque.buffer, r.usure.buffer]); };`;
            travailleur = new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })));
            travailleur.onmessage = (e) => { const t = attente.get(e.data.id); attente.delete(e.data.id); if (t) t.resoudre(e.data); };
            travailleur.onerror = () => {
                travailleur = false;
                attente.forEach((t) => t.resoudre(calculer(t.W, t.H, t.g, t.zones)));
                attente.clear();
            };
        } catch (e) { travailleur = false; }
        return travailleur;
    }
    function tableaux(W, H, g, zones) {
        const w = ouvrier();
        if (!w) return Promise.resolve(calculer(W, H, g, zones));
        return new Promise((resoudre) => { const id = ++numero; attente.set(id, { resoudre, W, H, g, zones }); w.postMessage({ id, W, H, g, zones }); });
    }

    const enUrl = (toile) => new Promise((resoudre) => {
        if (typeof toile.toBlob === "function") toile.toBlob((b) => resoudre(b ? URL.createObjectURL(b) : toile.toDataURL("image/png")), "image/png");
        else resoudre(toile.toDataURL("image/png"));
    });

    // LES ZONES PEINTES, sous une forme unique : { colonnes, lignes, cases
    // (Uint8Array), signature } — la grille arrive en base64 (la base) ou en
    // cases (le brouillon du pinceau). Les bits en base64 : le même codage que
    // les zones de nuages (cartes_regionales.js).
    function encoder(cases) {
        const octets = new Uint8Array(Math.ceil(cases.length / 8));
        for (let i = 0; i < cases.length; i++) if (cases[i]) octets[i >> 3] |= (1 << (i & 7));
        let s = "";
        for (let i = 0; i < octets.length; i++) s += String.fromCharCode(octets[i]);
        return btoa(s);
    }
    function decoder(texte, total) {
        const cases = new Uint8Array(total);
        let s = "";
        try { s = atob(texte || ""); } catch (e) { return cases; }
        for (let i = 0; i < total; i++) cases[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
        return cases;
    }
    function normaliserZones(zones) {
        if (!zones || !zones.cases) return null;
        const colonnes = Number(zones.colonnes) | 0, lignes = Number(zones.lignes) | 0;
        if (!(colonnes > 0) || !(lignes > 0)) return null;
        const total = colonnes * lignes;
        let cases, texte;
        if (typeof zones.cases === "string") { texte = zones.cases; cases = decoder(texte, total); }
        else { cases = Uint8Array.from({ length: total }, (_, i) => (zones.cases[i] ? 1 : 0)); texte = encoder(cases); }
        if (!cases.some(x => x)) return null;
        return { colonnes, lignes, cases, signature: `${colonnes}x${lignes}:${texte}` };
    }

    // Les deux images d'une carte, en adresses. Gardées (une par carte et par
    // peinture) ; `provisoire` (l'aperçu pendant que le DEV peint) : pas gardées.
    function fabriquer(largeur, hauteur, graine, zones, provisoire) {
        const z = normaliserZones(zones);
        const cle = `${graine}:${largeur}x${hauteur}:${z ? z.signature : "-"}`;
        const calcul = async () => {
            const t0 = performance.now();
            const r = await tableaux(largeur, hauteur, graine | 0, z ? { colonnes: z.colonnes, lignes: z.lignes, cases: z.cases } : null);
            const toile = (donnees) => { const c = document.createElement("canvas"); c.width = largeur; c.height = hauteur;
                c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(donnees.buffer || donnees), largeur, hauteur), 0, 0); return c; };
            const [m, u] = await Promise.all([enUrl(toile(r.masque)), enUrl(toile(r.usure))]);
            const ms = Math.round(performance.now() - t0);
            return { masque: m, usure: u, largeur, hauteur, graine, zones: !!z, provisoire: !!provisoire, ms };
        };
        if (provisoire && !cache.has(cle)) return calcul();
        if (!cache.has(cle)) cache.set(cle, calcul());
        return cache.get(cle);
    }

    // Pose le bord sur `element` : son masque, et la couche d'usure (insérée
    // juste après `apres`, ou en premier enfant). `aspect` = largeur / hauteur
    // de l'élément ; le calcul se fait sur `cote` pixels pour le grand côté ;
    // `zones` : là où le DEV a peint l'usure (brûlures, déchirures, trous).
    const dimensions = (aspect, cote) => ({ largeur: Math.round(aspect >= 1 ? cote : cote * aspect), hauteur: Math.round(aspect >= 1 ? cote / aspect : cote) });
    // Lancer le calcul d'avance (la carte s'ouvre : il tourne pendant la plongée).
    function preparer(options) {
        const o = options || {}, d = dimensions(o.aspect || 1, o.cote || 2048);
        return fabriquer(d.largeur, d.hauteur, o.graine || 1, o.zones || null);
    }
    const oublierProvisoire = (element) => {
        (element.__urlsProvisoires || []).forEach(u => { try { if (String(u).startsWith("blob:")) URL.revokeObjectURL(u); } catch (e) { /* déjà libérée */ } });
        element.__urlsProvisoires = null;
    };
    async function appliquer(element, options) {
        if (!element) return null;
        const o = options || {};
        const { largeur, hauteur } = dimensions(o.aspect || 1, o.cote || 2048);
        const jeton = {};
        // Une autre carte que la dernière : son bord à elle ne doit pas s'y voir, même un instant.
        if (element.__graineParchemin !== (o.graine || 1)) retirer(element);
        element.__bordParchemin = jeton;
        element.__graineParchemin = o.graine || 1;
        const r = await fabriquer(largeur, hauteur, o.graine || 1, o.zones || null, !!o.provisoire);
        if (element.__bordParchemin !== jeton) {               // une autre carte (ou peinture) entre-temps
            if (r.provisoire) [r.masque, r.usure].forEach(u => { try { URL.revokeObjectURL(u); } catch (e) { /* rien */ } });
            return null;
        }
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
        // L'aperçu d'avant (pas gardé) est libéré une fois remplacé à l'écran.
        oublierProvisoire(element);
        if (r.provisoire) element.__urlsProvisoires = [r.masque, r.usure];
        element.classList.add("bord-parchemin");
        element.__zonesParchemin = !!r.zones;
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
        oublierProvisoire(element);
        element.classList.remove("bord-parchemin");
    }

    window.BordsParchemin = { fabriquer, preparer, appliquer, retirer, calculer, encoder, decoder, normaliserZones, dimensions,
                              ouvrier: () => !!ouvrier() };
    // Les graines : la carte du monde, et chaque carte régionale (la sienne).
    window.graineParcheminRegion = (n) => 7919 * Number(n) + 13;

    // LA CARTE DU MONDE : dès que la page est là (le calcul tourne à part).
    const ASPECT_MONDE = 3840 / 2160;
    function poserSurLeMonde() {
        const monde = document.getElementById("carte-fond-jeu");
        // L'usure peinte en DEV (usure_parchemin.js) a pu arriver d'abord : on la garde.
        if (monde && !monde.__bordParchemin) appliquer(monde, { graine: 1, aspect: ASPECT_MONDE, cote: 2048, zones: window.ZONES_USURE_MONDE || null })
            .catch(e => console.error("Bord de parchemin (monde) :", e));
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", poserSurLeMonde);
    else setTimeout(poserSurLeMonde, 0);
})();
