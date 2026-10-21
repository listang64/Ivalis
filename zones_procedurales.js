// =========================================================================
//  IVALIS — LES ZONES PROCÉDURALES : LE GIVRE ET LE BRASIER
// =========================================================================
//  Nico, dans le Studio d'animation : « J'aimerais qu'on revoie l'animation
//  des zones de glace. Je ne veux pas de contour, mais quelque chose de plus
//  réaliste vu du dessus : une zone de givre qui vient un peu en
//  transparence au-dessus du terrain existant, avec un petit effet de brume
//  glacée soufflée par le vent. Si plusieurs zones sont collées, ça fait comme
//  une grosse zone. Quelque chose de procédural. » Puis : « Comme les zones
//  de glace, fais aussi de façon procédurale les zones de feu du Studio. »
//
//  UNE COUCHE couvre TOUTES les cases d'un même élément : leur union, pas une
//  nappe par case. Le dessin part de la distance de chaque point au BORD DE
//  L'UNION (les côtés de case qu'aucune case de l'élément ne prolonge) — deux
//  zones qui se touchent n'ont ni couture ni cloison : c'est une seule plaque.
//  Rien n'est une image : tout naît du bruit (fBm), calculé en coordonnées de
//  la carte, l'emprise calée sur la grille des pixels — une case garde son
//  dessin quand la plaque s'agrandit. Ce que chaque élément y met, c'est sa
//  RECETTE :
//
//    • LE GIVRE (glace) : une pellicule blanc-bleu translucide, granuleuse,
//      plus épaisse au cœur ; des fougères de givre à 60° ; une brume glacée
//      que le vent pousse ; des éclats qui scintillent ;
//    • LE BRASIER (feu) : le sol calciné, brun puis noir vers le cœur, sans
//      bord net ; des veines de braises qui rougeoient et respirent ; des
//      flammes qui dansent et se couchent dans le vent ; une fumée qui s'en va
//      sous le vent, au-delà de la zone ; des étincelles qui s'envolent.
//
//  `creerCoucheProcedurale(conteneur, { type, R, pixel, graine, vent })` rend
//  la couche (`creerCoucheGivre`, `creerCoucheFeu` : la même, d'un élément) ;
//  elle vit dans le repère de la carte (le conteneur est posé sur elle).
//  `ajouter(cases, { depuis, duree })` : l'élément gagne les nouvelles cases
//  depuis `depuis` (la plaque grandit) ; `poser(cases)` : sans animation ;
//  `retirer(cases)`, `vider()`, `detruire()`. Le Studio s'en sert
//  (studio_animation.js) ; le combat garde ses nappes tant que Nico ne les a
//  pas validées.
// =========================================================================
(function () {
    // --- LE BRUIT ---------------------------------------------------------
    // Un hachage entier (déterministe) → [0, 1).
    function hacher(ix, iy, graine) {
        let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(graine | 0, 1442695041);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    }
    const lisse = (t) => t * t * (3 - 2 * t);
    // Bruit de valeur ; `periode` (en cellules) le rend raccordable (une tuile se répète sans couture).
    function bruit(x, y, graine, periode) {
        const x0 = Math.floor(x), y0 = Math.floor(y);
        const fx = lisse(x - x0), fy = lisse(y - y0);
        const m = (v) => periode ? ((v % periode) + periode) % periode : v;
        const a = hacher(m(x0), m(y0), graine), b = hacher(m(x0 + 1), m(y0), graine);
        const c = hacher(m(x0), m(y0 + 1), graine), d = hacher(m(x0 + 1), m(y0 + 1), graine);
        return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    }
    // Le bruit fractal (fBm) : `octaves` couches, chacune deux fois plus fine.
    function fbm(x, y, octaves, graine, periode) {
        let s = 0, amp = 0.5, total = 0, f = 1;
        for (let o = 0; o < octaves; o++) {
            s += amp * bruit(x * f, y * f, graine + o * 101, periode ? periode * f : 0);
            total += amp; amp *= 0.5; f *= 2;
        }
        return s / total;
    }
    const entre = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

    // --- LA GÉOMÉTRIE DES CASES (hexagones à bords plats) ------------------
    const VOISINS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const cle = (q, r) => q + "," + r;
    // Le côté d'une case partagé avec sa voisine `i` (VOISINS[i]) : ses deux coins.
    // Avec les sommets à 0°, 60°… le côté vers la voisine d'angle φ va de φ−30° à φ+30°.
    const ANGLE_VOISIN = [30, -30, -90, -150, 150, 90];
    function coteVers(cx, cy, R, i) {
        const a1 = (ANGLE_VOISIN[i] - 30) * Math.PI / 180, a2 = (ANGLE_VOISIN[i] + 30) * Math.PI / 180;
        return [cx + R * Math.cos(a1), cy + R * Math.sin(a1), cx + R * Math.cos(a2), cy + R * Math.sin(a2)];
    }
    function distanceSegment(px, py, s) {
        const dx = s[2] - s[0], dy = s[3] - s[1];
        const t = Math.max(0, Math.min(1, ((px - s[0]) * dx + (py - s[1]) * dy) / (dx * dx + dy * dy || 1)));
        const ex = px - (s[0] + dx * t), ey = py - (s[1] + dy * t);
        return Math.sqrt(ex * ex + ey * ey);
    }

    // --- LE STYLE (une fois) ---------------------------------------------
    function injecterStyle() {
        if (document.getElementById("style-zones-procedurales")) return;
        const s = document.createElement("style");
        s.id = "style-zones-procedurales";
        s.textContent = `
            .zone-proc { position: absolute; pointer-events: none; }
            .zone-proc canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
            .zone-proc .zone-proc-ecran { mix-blend-mode: screen; }
            .zone-proc-voiles { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: hidden;
                                -webkit-mask-size: 100% 100%; mask-size: 100% 100%; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; }
            .zone-proc-vent { position: absolute; left: 50%; top: 50%; }
            .zone-proc-voile { position: absolute; left: 0; top: 0; background-repeat: repeat; will-change: transform; }
            .zone-proc-eclat { position: absolute; width: 3px; height: 3px; margin: -1.5px 0 0 -1.5px; border-radius: 50%; opacity: 0; }
            .givre-eclat { background: #ffffff; box-shadow: 0 0 3px 1px rgba(210, 240, 255, 0.95), 0 0 7px 2px rgba(160, 220, 255, 0.45); }
            .feu-etincelle { background: #ffe2a0; box-shadow: 0 0 3px 1px rgba(255, 170, 60, 0.95), 0 0 8px 3px rgba(255, 90, 20, 0.5); }
        `;
        document.head.appendChild(s);
    }

    // --- LES TUILES (brume, flammes, fumée) : du bruit qui se raccorde ------
    const TUILES = {
        brume: (f) => [236, 246, 255, entre(0.47, 0.83, f) * 235],
        // Les flammes : rouge-orangé sur les franges, jaune puis presque blanc au cœur.
        flamme: (f) => {
            const t = entre(0.62, 0.95, f);
            return [255, Math.round(60 + 150 * t), Math.round(10 + 120 * t * t), entre(0.56, 0.9, f) * 235];
        },
        fumee: (f) => [58, 52, 50, entre(0.42, 0.86, f) * 215]
    };
    const tuilesFaites = {};
    function tuile(nom) {
        if (tuilesFaites[nom]) return tuilesFaites[nom];
        const N = 128, c = document.createElement("canvas");
        c.width = c.height = N;
        const ctx = c.getContext("2d"), img = ctx.createImageData(N, N);
        const graine = { brume: 911, flamme: 313, fumee: 521 }[nom] || 1;
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                // 4 cellules de base par tuile, période 4 (puis 8, 16…) : raccordable.
                const v = TUILES[nom](fbm(x / N * 4, y / N * 4, 5, graine, 4));
                const i = (y * N + x) * 4;
                img.data[i] = v[0]; img.data[i + 1] = v[1]; img.data[i + 2] = v[2]; img.data[i + 3] = Math.round(v[3]);
            }
        }
        ctx.putImageData(img, 0, 0);
        tuilesFaites[nom] = c.toDataURL("image/png");
        return tuilesFaites[nom];
    }

    // =====================================================================
    //  LES RECETTES
    // =====================================================================
    //  `sol(x, y, p, outils)` : le pixel du sol — [r, g, b, a, couverture] ou
    //  null — en un point de la carte à la profondeur `p` (sa distance au bord,
    //  positive dedans) ; `lueur` (le feu) : le pixel des braises, sur un
    //  calque à part qui respire ; `decor` : ce qui se trace par-dessus (les
    //  fougères de givre) ; `voiles` : brume, flammes, fumée ; `eclats` ;
    //  `frange` : la couleur du front qui avance.
    const RECETTES = {
        glace: {
            classe: "givre", marge: 1.6,
            sol(x, y, p, { R, graine }) {
                if (p < -R * 0.45) return null;
                const e1 = R * 0.55, e2 = R * 0.3, e3 = R * 0.022, e4 = R * 0.09;
                // Le bord ronge le terrain : décalé par un bruit large, ni droit ni hexagonal.
                const n1 = fbm(x / e1, y / e1, 3, graine);
                const bord = p + (n1 - 0.5) * R * 0.7;
                const m = entre(-R * 0.06, R * 0.34, bord);
                // Des grains de givre au-delà du bord, là où le froid a déjà mordu.
                const n4 = fbm(x / e4, y / e4, 2, graine + 53);
                const tache = bord > -R * 0.32 ? entre(0.62, 0.78, n4) * entre(-R * 0.32, -R * 0.02, bord) * 0.7 : 0;
                const couvre = Math.max(m, tache);
                if (couvre <= 0.003) return null;
                // Une pellicule : mince et translucide, un peu plus épaisse au cœur et par
                // grandes plaques douces (n2) ; le grain fin du givre (n3) la rend mate.
                const n2 = fbm(x / e2, y / e2, 3, graine + 17);
                const n3 = bruit(x / e3, y / e3, graine + 29);
                const coeur = entre(0, R * 1.1, p);
                // Quelques aiguilles qui accrochent la lumière (des pixels francs, épars).
                const aiguille = hacher(Math.floor(x * 1.4), Math.floor(y * 1.4), graine + 61) > 0.988 ? 0.3 : 0;
                const a = couvre * (0.19 + 0.2 * entre(0.3, 0.75, n2) + 0.12 * n3 + 0.1 * coeur + aiguille);
                // Le blanc du givre, le bleu de la glace claire là où la pellicule s'amincit.
                const bleu = 1 - entre(0.25, 0.7, n2);
                return [214 - bleu * 30 + n3 * 22, 236 - bleu * 10 + n3 * 10, 255, Math.min(0.7, a), couvre];
            },
            // LES FOUGÈRES DE GIVRE : des tiges qui se ramifient à 60°, des étoiles de rosée gelée.
            decor(cf, liste, { R, graine, pixel, k }) {
                const tiges = [], etoiles = [];
                const pousser = (x, y, ang, L, rang, h) => {
                    const x2 = x + Math.cos(ang) * L, y2 = y + Math.sin(ang) * L;
                    tiges.push([x, y, x2, y2, rang]);
                    if (rang >= 2) return;
                    const n = rang === 0 ? 5 : 3;
                    for (let b = 1; b <= n; b++) {
                        const t = b / (n + 1), bx = x + (x2 - x) * t, by = y + (y2 - y) * t;
                        const jeu = (hacher(h, b, 5) - 0.5) * 0.3;
                        const l = L * (0.34 + 0.18 * hacher(h, b, 7)) * (1 - t * 0.55);
                        pousser(bx, by, ang + Math.PI / 3 + jeu, l, rang + 1, h * 7 + b);
                        pousser(bx, by, ang - Math.PI / 3 - jeu, l * (0.7 + 0.3 * hacher(h, b, 9)), rang + 1, h * 13 + b);
                    }
                };
                liste.forEach(c => {
                    const p = pixel(c.q, c.r), h0 = (c.q * 92821 + c.r * 68917 + graine) | 0;
                    for (let f = 0; f < 6; f++) {
                        const ang = hacher(h0, f, 1) * Math.PI * 2, d = R * 0.85 * Math.sqrt(hacher(h0, f, 2));
                        pousser(p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, hacher(h0, f, 3) * Math.PI * 2, R * (0.13 + 0.15 * hacher(h0, f, 4)), 0, h0 + f * 31);
                    }
                    for (let s = 0; s < 5; s++) {
                        const ang = hacher(h0, s, 21) * Math.PI * 2, d = R * 0.85 * Math.sqrt(hacher(h0, s, 22));
                        etoiles.push([p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, R * (0.02 + 0.025 * hacher(h0, s, 23)), hacher(h0, s, 24) * Math.PI]);
                    }
                });
                // Un halo d'abord (le givre diffuse la lumière), puis le trait net — un seul
                // tracé par rang et par passe : des milliers de petits traits d'un coup.
                cf.lineCap = "round";
                [[2.6, 0.07], [0.8, 0.34]].forEach(([epais, alpha]) => {
                    [0, 1, 2].forEach(rang => {
                        cf.strokeStyle = `rgba(255,255,255,${(alpha * (1 - rang * 0.22)).toFixed(3)})`;
                        cf.lineWidth = epais * (1.1 - rang * 0.3) / k * 1.5;
                        cf.beginPath();
                        tiges.forEach(t => { if (t[4] === rang) { cf.moveTo(t[0], t[1]); cf.lineTo(t[2], t[3]); } });
                        cf.stroke();
                    });
                    cf.strokeStyle = `rgba(255,255,255,${(alpha * 0.9).toFixed(3)})`;
                    cf.lineWidth = epais * 0.7 / k * 1.5;
                    cf.beginPath();
                    etoiles.forEach(([x, y, l, a0]) => {
                        for (let b = 0; b < 3; b++) {
                            const a = a0 + b * Math.PI / 3;
                            cf.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l); cf.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
                        }
                    });
                    cf.stroke();
                });
            },
            // La brume déborde un peu de la plaque, bord flou.
            voiles: [{
                nom: "brume", classe: "givre-brume", ecran: false,
                masque: (p, n, R) => entre(-R * 0.75, R * 0.35, p + (n - 0.5) * R * 0.6),
                couches: [{ tuile: "brume", l: 6.4, h: 2.6, op: 0.52, v: 1 }, { tuile: "brume", l: 4.0, h: 1.8, op: 0.36, v: 0.62 }]
            }],
            eclats: { parCase: 3, classe: "givre-eclat", geste: "scintille" },
            frange: null
        },

        feu: {
            classe: "feu", marge: 2.4,
            // LE SOL CALCINÉ : roussi sur les franges, noir de suie vers le cœur ; des
            // cendres claires par endroits. Le terrain se devine dessous.
            sol(x, y, p, { R, graine }) {
                if (p < -R * 0.5) return null;
                const e1 = R * 0.5, e2 = R * 0.24, e3 = R * 0.03;
                const n1 = fbm(x / e1, y / e1, 3, graine + 3);
                const bord = p + (n1 - 0.5) * R * 0.75;
                const m = entre(-R * 0.12, R * 0.38, bord);
                if (m <= 0.003) return null;
                const n2 = fbm(x / e2, y / e2, 3, graine + 19);
                const n3 = bruit(x / e3, y / e3, graine + 31);
                const suie = entre(0.05 * R, 0.75 * R, bord);           // 0 sur la frange roussie, 1 au cœur
                const cendre = entre(0.66, 0.8, n2) * suie * 0.55;
                const a = m * (0.34 + 0.24 * suie + 0.1 * n3);
                const r = 92 - 62 * suie + cendre * 70 + n3 * 10, g = 58 - 40 * suie + cendre * 66 + n3 * 6, b = 30 - 18 * suie + cendre * 60;
                return [r, g, b, Math.min(0.78, a), m];
            },
            // LES BRAISES : des fissures fines (un bruit « en crêtes ») qui rougeoient
            // dans la suie, plus ou moins vives par endroits, jamais sur la frange ;
            // orange, jaunes seulement au plus chaud.
            lueur(x, y, p, { R, graine }) {
                if (p < R * 0.02) return null;
                const e = R * 0.42;
                const n = fbm(x / e, y / e, 3, graine + 71);
                const crete = 1 - Math.abs(2 * n - 1);
                const fissure = entre(0.86, 0.985, crete);
                if (fissure <= 0.01) return null;
                const vive = 0.35 + 0.65 * entre(0.3, 0.75, fbm(x / (R * 0.3), y / (R * 0.3), 2, graine + 83));
                const h = fissure * vive * entre(R * 0.05, R * 0.55, p + (fbm(x / (R * 0.5), y / (R * 0.5), 2, graine + 3) - 0.5) * R * 0.75);
                if (h <= 0.01) return null;
                return [255, 70 + 130 * h * h, 15 + 60 * h * h * h, Math.min(0.85, h * 0.95)];
            },
            voiles: [
                // La fumée s'en va sous le vent, au-delà de la zone.
                { nom: "fumee", classe: "feu-fumee", ecran: false, sousLeVent: 1.0,
                  masque: (p, n, R) => entre(-R * 0.7, R * 0.45, p + (n - 0.5) * R * 0.6),
                  couches: [{ tuile: "fumee", l: 7, h: 3, op: 0.4, v: 0.6 }, { tuile: "fumee", l: 4.6, h: 2.2, op: 0.28, v: 0.42 }] },
                // Les flammes dansent dedans, couchées par le vent.
                { nom: "flammes", classe: "feu-flammes", ecran: true, vacille: true,
                  masque: (p, n, R) => entre(R * 0.02, R * 0.5, p + (n - 0.5) * R * 0.7),
                  couches: [{ tuile: "flamme", l: 3.0, h: 1.3, op: 0.56, v: 2.4 }, { tuile: "flamme", l: 2.1, h: 0.95, op: 0.42, v: 3.4 }] }
            ],
            eclats: { parCase: 3, classe: "feu-etincelle", geste: "envol" },
            frange: [255, 150, 50]
        }
    };

    // =====================================================================
    //  LA COUCHE
    // =====================================================================
    window.creerCoucheProcedurale = function (conteneur, options) {
        injecterStyle();
        const opts = options || {};
        const recette = RECETTES[opts.type] || RECETTES.glace;
        const R = opts.R || 50;
        const pixel = opts.pixel;
        const graine = opts.graine || 7;
        // Le vent : sa direction (radians, 0 = vers la droite) et sa force (px de carte par seconde).
        const vent = { angle: opts.vent && opts.vent.angle !== undefined ? opts.vent.angle : 0.32,
                       vitesse: opts.vent && opts.vent.vitesse ? opts.vent.vitesse : R * 0.55 };
        const ux = Math.cos(vent.angle), uy = Math.sin(vent.angle);
        const o0 = pixel(0, 0), o1 = pixel(1, 0), o2 = pixel(0, 1);
        // De la carte vers la case (l'inverse exact de `pixel`, qui est linéaire).
        const versCase = (x, y) => {
            const ax = o1.x - o0.x, ay = o1.y - o0.y, bx = o2.x - o0.x, by = o2.y - o0.y;
            const det = ax * by - ay * bx || 1;
            const dx = x - o0.x, dy = y - o0.y;
            const fq = (dx * by - dy * bx) / det, fr = (ax * dy - ay * dx) / det;
            // Arrondi cubique.
            const fs = -fq - fr;
            let q = Math.round(fq), r = Math.round(fr); const s = Math.round(fs);
            const eq = Math.abs(q - fq), er = Math.abs(r - fr), es = Math.abs(s - fs);
            if (eq > er && eq > es) q = -r - s; else if (er > es) r = -q - s;
            return { q, r };
        };
        const pre = recette.classe;

        const racine = document.createElement("div");
        racine.className = `zone-proc zone-proc-${opts.type || "glace"} ${pre}-couche`;
        conteneur.appendChild(racine);
        const sol = document.createElement("canvas");
        sol.className = `${pre}-sol`;
        racine.appendChild(sol);
        // Les braises (le feu) : un calque net et son halo, qui respirent.
        let lueur = null, halo = null;
        if (recette.lueur) {
            lueur = document.createElement("canvas");
            lueur.className = `${pre}-braises zone-proc-ecran`;
            halo = document.createElement("canvas");
            halo.className = `${pre}-halo zone-proc-ecran`;
            halo.style.filter = `blur(${Math.max(2, R * 0.08).toFixed(1)}px)`;
            racine.appendChild(halo);
            racine.appendChild(lueur);
            if (typeof lueur.animate === "function") {
                lueur.animate([{ opacity: 1 }, { opacity: 0.72 }, { opacity: 0.95 }, { opacity: 0.6 }, { opacity: 0.9 }, { opacity: 1 }],
                              { duration: 2600, iterations: Infinity, easing: "ease-in-out" });
                halo.animate([{ opacity: 0.6 }, { opacity: 0.35 }, { opacity: 0.7 }, { opacity: 0.45 }, { opacity: 0.6 }],
                             { duration: 3300, iterations: Infinity, easing: "ease-in-out" });
            }
        }
        let voiles = [], eclats = [];
        const cases = new Map();
        let rendu = null;          // le dernier dessin : { x0, y0, l, h, k, plein, masque, braises… }
        let lecture = Promise.resolve();
        let detruite = false;

        // L'EMPRISE : le rectangle de la carte que couvre la plaque (et ses voiles).
        function emprise(liste) {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            liste.forEach(c => { const p = pixel(c.q, c.r); x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
            const marge = R * recette.marge;
            return { x0: Math.floor(x0 - marge), y0: Math.floor(y0 - marge), l: Math.ceil(x1 - x0 + 2 * marge), h: Math.ceil(y1 - y0 + 2 * marge) };
        }

        // LE DESSIN DE LA PLAQUE pour un ensemble de cases : le sol, son masque, les
        // braises, les masques des voiles, les points des éclats.
        function dessiner(liste) {
            const E0 = emprise(liste);
            // La finesse : 1,25 pixel par pixel de carte, moins sur une très grande plaque.
            const k = Math.max(0.6, Math.min(opts.finesse || 1.25, Math.sqrt(2000000 / Math.max(1, E0.l * E0.h))));
            // L'emprise calée sur la grille des pixels de la carte : quand la plaque
            // grandit, un même point tombe sur le même pixel — son dessin ne bouge pas.
            const x0 = Math.floor(E0.x0 * k) / k, y0 = Math.floor(E0.y0 * k) / k;
            const W = Math.max(1, Math.ceil((E0.x0 + E0.l - x0) * k)), H = Math.max(1, Math.ceil((E0.y0 + E0.h - y0) * k));
            const E = { x0, y0, l: W / k, h: H / k };
            const dedans = new Set(liste.map(c => cle(c.q, c.r)));

            // Les côtés du bord de l'union, rangés par cellules (pour n'en tester que quelques-uns).
            const BANDE = R * 0.9, CELL = R * 1.2;
            const bacs = new Map();
            liste.forEach(c => {
                const p = pixel(c.q, c.r);
                VOISINS.forEach(([dq, dr], i) => {
                    if (dedans.has(cle(c.q + dq, c.r + dr))) return;
                    const s = coteVers(p.x, p.y, R, i);
                    const gx0 = Math.floor((Math.min(s[0], s[2]) - BANDE) / CELL), gx1 = Math.floor((Math.max(s[0], s[2]) + BANDE) / CELL);
                    const gy0 = Math.floor((Math.min(s[1], s[3]) - BANDE) / CELL), gy1 = Math.floor((Math.max(s[1], s[3]) + BANDE) / CELL);
                    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
                        const kk = gx + "|" + gy;
                        if (!bacs.has(kk)) bacs.set(kk, []);
                        bacs.get(kk).push(s);
                    }
                });
            });
            // La profondeur d'un point : sa distance au bord, positive dedans, négative dehors.
            const profondeur = (x, y) => {
                const c = versCase(x, y);
                const liste2 = bacs.get(Math.floor(x / CELL) + "|" + Math.floor(y / CELL));
                let d = BANDE;
                if (liste2) for (const s of liste2) { const v = distanceSegment(x, y, s); if (v < d) d = v; }
                return dedans.has(cle(c.q, c.r)) ? d : -d;
            };
            const outils = { R, graine, pixel, k };

            const toile = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
            const plein = toile(W, H), masque = toile(W, H), braises = recette.lueur ? toile(W, H) : null;
            const cp = plein.getContext("2d"), cm = masque.getContext("2d");
            const ip = cp.createImageData(W, H), im = cm.createImageData(W, H);
            const ib = braises ? braises.getContext("2d").createImageData(W, H) : null;
            for (let j = 0; j < H; j++) {
                const y = E.y0 + (j + 0.5) / k;
                for (let i = 0; i < W; i++) {
                    const x = E.x0 + (i + 0.5) / k;
                    const p = profondeur(x, y);
                    const v = recette.sol(x, y, p, outils);
                    if (!v) continue;
                    const idx = (j * W + i) * 4;
                    ip.data[idx] = Math.round(v[0]); ip.data[idx + 1] = Math.round(v[1]); ip.data[idx + 2] = Math.round(v[2]);
                    ip.data[idx + 3] = Math.round(v[3] * 255);
                    im.data[idx] = im.data[idx + 1] = im.data[idx + 2] = 255;
                    im.data[idx + 3] = Math.round(v[4] * 255);
                    if (ib) {
                        const l = recette.lueur(x, y, p, outils);
                        if (l) { ib.data[idx] = l[0]; ib.data[idx + 1] = Math.round(l[1]); ib.data[idx + 2] = Math.round(l[2]); ib.data[idx + 3] = Math.round(l[3] * 255); }
                    }
                }
            }
            cp.putImageData(ip, 0, 0);
            cm.putImageData(im, 0, 0);
            if (braises) braises.getContext("2d").putImageData(ib, 0, 0);

            // LES MASQUES DES VOILES (brume, fumée, flammes), en basse définition ;
            // la fumée part sous le vent (`sousLeVent`, en cases).
            const kb = 0.3, WB = Math.max(1, Math.round(E.l * kb)), HB = Math.max(1, Math.round(E.h * kb));
            const masquesVoiles = recette.voiles.map(vo => {
                const c = toile(WB, HB), ctx = c.getContext("2d"), img = ctx.createImageData(WB, HB);
                const dx = (vo.sousLeVent || 0) * R * ux, dy = (vo.sousLeVent || 0) * R * uy;
                for (let j = 0; j < HB; j++) {
                    const y = E.y0 + (j + 0.5) / kb;
                    for (let i = 0; i < WB; i++) {
                        const x = E.x0 + (i + 0.5) / kb;
                        // Sous le vent : la profondeur lue un peu en amont — le voile s'étire en aval.
                        const p = dx || dy ? Math.max(profondeur(x, y), profondeur(x - dx, y - dy), profondeur(x - dx * 0.5, y - dy * 0.5)) : profondeur(x, y);
                        const a = vo.masque(p, fbm(x / (R * 0.55), y / (R * 0.55), 3, graine + 41), R);
                        const idx = (j * WB + i) * 4;
                        img.data[idx] = img.data[idx + 1] = img.data[idx + 2] = 255;
                        img.data[idx + 3] = Math.round(a * 255);
                    }
                }
                ctx.putImageData(img, 0, 0);
                return c;
            });

            // LE DÉCOR TRACÉ (les fougères de givre), découpé par le masque.
            if (recette.decor) {
                const deco = toile(W, H), cf = deco.getContext("2d");
                cf.setTransform(k, 0, 0, k, -E.x0 * k, -E.y0 * k);
                recette.decor(cf, liste, outils);
                cf.setTransform(1, 0, 0, 1, 0, 0);
                cf.globalCompositeOperation = "destination-in";
                cf.drawImage(masque, 0, 0);
                cp.drawImage(deco, 0, 0);
            }

            // LES ÉCLATS : quelques-uns par case, là où la plaque est franche.
            const points = [];
            liste.forEach(c => {
                const p = pixel(c.q, c.r), h0 = (c.q * 7349 + c.r * 2903 + graine) | 0;
                for (let s = 0; s < recette.eclats.parCase; s++) {
                    const ang = hacher(h0, s, 51) * Math.PI * 2, d = R * 0.8 * Math.sqrt(hacher(h0, s, 52));
                    const x = p.x + Math.cos(ang) * d, y = p.y + Math.sin(ang) * d;
                    const i = Math.floor((x - E.x0) * k), j = Math.floor((y - E.y0) * k);
                    if (i >= 0 && j >= 0 && i < W && j < H && im.data[(j * W + i) * 4 + 3] > 160) points.push({ x: x - E.x0, y: y - E.y0, h: hacher(h0, s, 53) });
                }
            });
            return { ...E, k, plein, masque, braises, masquesVoiles, points, cases: liste };
        }

        // Les calques affichés à la taille de la plaque.
        const calques = () => [sol, halo, lueur].filter(Boolean);
        function placer(d) {
            racine.style.left = d.x0 + "px"; racine.style.top = d.y0 + "px";
            racine.style.width = d.l + "px"; racine.style.height = d.h + "px";
            calques().forEach(c => { c.width = d.plein.width; c.height = d.plein.height; });
        }
        // LES VOILES : chacun ses couches de bruit qui dérivent avec le vent, dans son masque.
        function voilesDe(d) {
            return recette.voiles.map((vo, n) => {
                const b = document.createElement("div");
                b.className = `zone-proc-voiles ${vo.classe}${vo.ecran ? " zone-proc-ecran" : ""}`;
                const url = `url(${d.masquesVoiles[n].toDataURL("image/png")})`;
                b.style.webkitMaskImage = url; b.style.maskImage = url;
                const diag = Math.ceil(Math.hypot(d.l, d.h)) + 2;
                const v = document.createElement("div");
                v.className = `zone-proc-vent ${pre}-vent`;
                v.style.transform = `translate(-50%, -50%) rotate(${vent.angle}rad)`;
                v.style.width = v.style.height = diag + "px";
                vo.couches.forEach((c, m) => {
                    const el = document.createElement("div");
                    el.className = `zone-proc-voile ${pre}-voile`;
                    const L = c.l * R, Hh = c.h * R;
                    el.style.width = (diag + L) + "px"; el.style.height = diag + "px";
                    el.style.backgroundImage = `url(${tuile(c.tuile)})`;
                    el.style.backgroundSize = `${L}px ${Hh}px`;
                    el.style.backgroundPosition = `${m * L * 0.37}px ${m * Hh * 0.53}px`;
                    el.style.opacity = String(c.op);
                    v.appendChild(el);
                    // Une tuile de plus que la largeur : la dérive d'une tuile boucle sans saut.
                    const duree = L / (vent.vitesse * c.v) * 1000;
                    if (typeof el.animate === "function") {
                        el.animate([{ transform: `translateX(${-L}px)` }, { transform: "translateX(0px)" }], { duration: duree, iterations: Infinity, easing: "linear" });
                        // La brume et la fumée respirent ; les flammes vacillent, vite et sans régularité.
                        if (vo.vacille) el.animate([{ opacity: c.op }, { opacity: c.op * 0.6 }, { opacity: c.op * 1.05 }, { opacity: c.op * 0.7 }, { opacity: c.op * 0.95 }, { opacity: c.op }],
                                                   { duration: 700 + m * 260, iterations: Infinity, easing: "ease-in-out" });
                        else el.animate([{ opacity: c.op }, { opacity: c.op * 0.55 }, { opacity: c.op }], { duration: 5200 + m * 1900, iterations: Infinity, easing: "ease-in-out" });
                    }
                });
                b.appendChild(v);
                return b;
            });
        }
        function eclater(d, retard) {
            eclats.forEach(e => e.remove());
            eclats = d.points.map(pt => {
                const e = document.createElement("div");
                e.className = `zone-proc-eclat ${recette.eclats.classe}`;
                e.style.left = pt.x + "px"; e.style.top = pt.y + "px";
                racine.appendChild(e);
                if (typeof e.animate !== "function") return e;
                if (recette.eclats.geste === "envol") {
                    // Une étincelle s'élève (elle grandit, vue d'en haut) et file avec le vent.
                    const periode = 1300 + pt.h * 1500, loin = R * (0.9 + pt.h * 0.9);
                    e.animate([{ opacity: 0, transform: "translate(0px, 0px) scale(0.5)" },
                               { opacity: 1, transform: `translate(${(ux * loin * 0.15).toFixed(1)}px, ${(uy * loin * 0.15).toFixed(1)}px) scale(0.9)`, offset: 0.12 },
                               { opacity: 0.85, transform: `translate(${(ux * loin * 0.6).toFixed(1)}px, ${(uy * loin * 0.6 - R * 0.1).toFixed(1)}px) scale(1.5)`, offset: 0.6 },
                               { opacity: 0, transform: `translate(${(ux * loin).toFixed(1)}px, ${(uy * loin - R * 0.18).toFixed(1)}px) scale(1.9)` }],
                              { duration: periode, delay: (retard || 0) + pt.h * periode, iterations: Infinity, easing: "ease-out" });
                } else {
                    const periode = 2600 + pt.h * 4200;
                    e.animate([{ opacity: 0, transform: "scale(0.4)" }, { opacity: 0, transform: "scale(0.4)", offset: 0.82 },
                               { opacity: 1, transform: "scale(1.25)", offset: 0.88 }, { opacity: 0, transform: "scale(0.4)", offset: 0.95 },
                               { opacity: 0, transform: "scale(0.4)" }],
                              { duration: periode, delay: (retard || 0) + pt.h * periode, iterations: Infinity });
                }
                return e;
            });
        }
        function changerVoiles(d, fondu, retard) {
            const nouveaux = voilesDe(d);
            const avant = calques().length ? calques()[calques().length - 1] : sol;
            nouveaux.forEach((nv, i) => racine.insertBefore(nv, (i === 0 ? avant : nouveaux[i - 1]).nextSibling));
            const anciens = voiles;
            voiles = nouveaux;
            if (!fondu || typeof racine.animate !== "function") { anciens.forEach(a => a.remove()); return; }
            nouveaux.forEach(nv => nv.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fondu, delay: retard || 0, easing: "ease-in-out", fill: "both" }));
            anciens.forEach(a => a.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fondu, delay: retard || 0, easing: "ease-in-out", fill: "both" }).finished
                .then(() => a.remove(), () => a.remove()));
        }

        // LA PLAQUE QUI GAGNE : depuis `depuis`, un front irrégulier avance ;
        // derrière lui, la nouvelle plaque ; devant, l'ancienne. Le feu a sa
        // frange : le front rougeoie.
        function ramper(ancien, d, depuis, duree) {
            return new Promise(fin => {
                const W = sol.width, H = sol.height, k = d.k;
                const ox = (depuis.x - d.x0) * k, oy = (depuis.y - d.y0) * k;
                // Jusqu'où il doit aller : la case la plus lointaine, et son bord.
                const loin = (Math.max(...d.cases.map(c => { const q = pixel(c.q, c.r); return Math.hypot((q.x - d.x0) * k - ox, (q.y - d.y0) * k - oy); })) + R * 1.5 * k);
                const tmp = document.createElement("canvas"); tmp.width = W; tmp.height = H;
                const ct = tmp.getContext("2d");
                const N = 72, bosses = Array.from({ length: N }, (_, i) => fbm(i / N * 9, 0.5, 3, graine + 77, 9));
                const front = (c, rayon) => {
                    const g = c.createRadialGradient(ox, oy, rayon * 0.62, ox, oy, rayon);
                    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(1, "rgba(255,255,255,0)");
                    c.fillStyle = g;
                    c.beginPath();
                    for (let i = 0; i <= N; i++) {
                        const a = i / N * Math.PI * 2, rr = rayon * (0.86 + 0.3 * bosses[i % N]);
                        if (i === 0) c.moveTo(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr); else c.lineTo(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr);
                    }
                    c.closePath(); c.fill();
                };
                // Les calques qui gagnent : le sol, et les braises s'il y en a.
                const paires = [[sol, ancien && ancien.plein, d.plein, ancien && ancien.k], ...(lueur ? [[lueur, ancien && ancien.braises, d.braises, ancien && ancien.k]] : [])];
                const anneau = (rayon) => {
                    // La frange du feu : un anneau orange au front, sur la nouvelle plaque seulement.
                    const [r0, g0, b0] = recette.frange;
                    ct.globalCompositeOperation = "source-over";
                    ct.clearRect(0, 0, W, H);
                    const g = ct.createRadialGradient(ox, oy, rayon * 0.55, ox, oy, rayon);
                    g.addColorStop(0, `rgba(${r0},${g0},${b0},0)`); g.addColorStop(0.75, `rgba(${r0},${g0},${b0},0.85)`); g.addColorStop(1, `rgba(${r0},${g0},${b0},0)`);
                    ct.fillStyle = g; ct.fillRect(0, 0, W, H);
                    ct.globalCompositeOperation = "destination-in";
                    ct.drawImage(d.masque, 0, 0);
                };
                const t0 = performance.now();
                const image = (t) => {
                    if (detruite) return fin();
                    const u = Math.min(1, (t - t0) / duree), e = 1 - Math.pow(1 - u, 1.5);
                    const rayon = Math.max(1, e * loin);
                    paires.forEach(([cv, de, vers, kAncien]) => {
                        const ctx = cv.getContext("2d");
                        ctx.globalCompositeOperation = "source-over";
                        ctx.clearRect(0, 0, W, H);
                        if (de) {
                            ctx.drawImage(de, (ancien.x0 - d.x0) * k, (ancien.y0 - d.y0) * k, de.width * k / kAncien, de.height * k / kAncien);
                            ctx.globalCompositeOperation = "destination-out";
                            front(ctx, rayon);
                            ctx.globalCompositeOperation = "source-over";
                        }
                        if (!vers) return;
                        ct.globalCompositeOperation = "source-over";
                        ct.clearRect(0, 0, W, H);
                        ct.drawImage(vers, 0, 0);
                        ct.globalCompositeOperation = "destination-in";
                        front(ct, rayon);
                        ctx.drawImage(tmp, 0, 0);
                    });
                    if (recette.frange && u < 1) {
                        anneau(rayon);
                        const ctx = (lueur || sol).getContext("2d");
                        ctx.globalCompositeOperation = "lighter";
                        ctx.globalAlpha = 1 - u * 0.6;
                        ctx.drawImage(tmp, 0, 0);
                        ctx.globalAlpha = 1;
                        ctx.globalCompositeOperation = "source-over";
                    }
                    if (halo) { const ch = halo.getContext("2d"); ch.clearRect(0, 0, W, H); ch.drawImage(lueur, 0, 0); }
                    if (u < 1) requestAnimationFrame(image);
                    else { montrer(d); fin(); }
                };
                requestAnimationFrame(image);
            });
        }

        function montrer(d) {
            const tracer = (cv, src) => { const ctx = cv.getContext("2d"); ctx.globalCompositeOperation = "source-over"; ctx.clearRect(0, 0, cv.width, cv.height); if (src) ctx.drawImage(src, 0, 0); };
            tracer(sol, d.plein);
            if (lueur) { tracer(lueur, d.braises); tracer(halo, d.braises); }
        }
        function lire(quoi, x, y) {
            if (!rendu || !rendu[quoi]) return 0;
            const i = Math.floor((x - rendu.x0) * rendu.k), j = Math.floor((y - rendu.y0) * rendu.k);
            if (i < 0 || j < 0 || i >= rendu[quoi].width || j >= rendu[quoi].height) return 0;
            return rendu[quoi].getContext("2d").getImageData(i, j, 1, 1).data[3] / 255;
        }

        const couche = {
            el: racine,
            type: opts.type || "glace",
            cases: () => [...cases.values()].map(c => ({ q: c.q, r: c.r })),
            // Sans animation : la plaque telle qu'elle est (un redessin, une reprise).
            poser(liste) {
                (liste || []).forEach(c => cases.set(cle(c.q, c.r), { q: c.q, r: c.r }));
                if (!cases.size) return couche.vider(0);
                const d = dessiner([...cases.values()]);
                placer(d); montrer(d);
                changerVoiles(d, 0); eclater(d, 0);
                rendu = d;
                return Promise.resolve(true);
            },
            // L'élément gagne de nouvelles cases : il avance depuis `depuis` ({q, r} ou {x, y}).
            ajouter(liste, p = {}) {
                lecture = lecture.then(async () => {
                    if (detruite) return false;
                    const neuves = (liste || []).filter(c => c && !cases.has(cle(c.q, c.r)));
                    if (!neuves.length) return false;
                    neuves.forEach(c => cases.set(cle(c.q, c.r), { q: c.q, r: c.r }));
                    const d = dessiner([...cases.values()]);
                    const ancien = rendu;
                    placer(d);
                    rendu = d;
                    let depuis = p.depuis;
                    if (depuis && depuis.q !== undefined) depuis = pixel(depuis.q, depuis.r);
                    if (!depuis) depuis = pixel(neuves[0].q, neuves[0].r);
                    const duree = p.duree || 1400;
                    // Les voiles et les éclats suivent le front (ils ne le devancent pas).
                    changerVoiles(d, duree * 0.7, duree * 0.25);
                    eclater(d, duree * 0.6);
                    await ramper(ancien, d, depuis, duree);
                    return true;
                });
                return lecture;
            },
            // Les cases ôtées (le feu fond la glace, la glace éteint le feu) : la plaque se redessine sans elles.
            retirer(liste) {
                (liste || []).forEach(c => cases.delete(cle(c.q, c.r)));
                // Après ce qui avance encore (sinon sa fin redessinerait les cases ôtées).
                lecture = lecture.then(() => detruite ? false : couche.poser([]));
                return lecture;
            },
            // Tout part (`duree` : en fondu).
            vider(duree = 450) {
                cases.clear();
                rendu = null;
                const finir = () => {
                    calques().forEach(c => c.getContext("2d").clearRect(0, 0, c.width, c.height));
                    voiles.forEach(v => v.remove()); voiles = [];
                    eclats.forEach(e => e.remove()); eclats = [];
                    racine.style.opacity = "";
                };
                if (!duree || typeof racine.animate !== "function") { finir(); return Promise.resolve(true); }
                return racine.animate([{ opacity: 1 }, { opacity: 0 }], { duration: duree, fill: "forwards" }).finished
                    .then(() => { racine.getAnimations().forEach(a => a.cancel()); finir(); return true; }, () => true);
            },
            detruire() {
                detruite = true;
                racine.remove();
            },
            // Pour les bancs : l'opacité du sol en un point de la carte, sa couverture
            // (0 à 1 : l'élément est-il là, quelle que soit son épaisseur), ses braises.
            opaciteEn(x, y) { return lire("plein", x, y); },
            couvertureEn(x, y) { return lire("masque", x, y); },
            braisesEn(x, y) { return lire("braises", x, y); },
            // Le masque d'un voile (« brume », « fumee », « flammes ») en un point de la carte.
            voileEn(nom, x, y) {
                const n = recette.voiles.findIndex(v => v.nom === nom);
                if (!rendu || n < 0) return 0;
                const c = rendu.masquesVoiles[n], kb = c.width / rendu.l;
                const i = Math.floor((x - rendu.x0) * kb), j = Math.floor((y - rendu.y0) * kb);
                if (i < 0 || j < 0 || i >= c.width || j >= c.height) return 0;
                return c.getContext("2d").getImageData(i, j, 1, 1).data[3] / 255;
            },
            vent: () => ({ ...vent })
        };
        return couche;
    };
    window.creerCoucheGivre = (conteneur, options) => window.creerCoucheProcedurale(conteneur, { ...(options || {}), type: "glace" });
    window.creerCoucheFeu = (conteneur, options) => window.creerCoucheProcedurale(conteneur, { ...(options || {}), type: "feu" });
    window.TYPES_ZONES_PROCEDURALES = Object.keys(RECETTES);
})();
