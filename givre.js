// =========================================================================
//  IVALIS — LE GIVRE : LA ZONE DE GLACE, PROCÉDURALE
// =========================================================================
//  Nico, dans le Studio d'animation : « J'aimerais qu'on revoie l'animation
//  des zones de glace. Je ne veux pas de contour, mais quelque chose de plus
//  réaliste vu du dessus : une zone de givre qui vient un peu en
//  transparence au-dessus du terrain existant, avec un petit effet de brume
//  glacée soufflée par le vent. Si plusieurs zones sont collées, ça fait comme
//  une grosse zone. Quelque chose de procédural. »
//
//  UNE COUCHE DE GIVRE couvre TOUTES les cases gelées à la fois : leur union,
//  pas une nappe par case. Le dessin part de la distance de chaque point au
//  BORD DE L'UNION (les côtés de case qu'aucune case gelée ne prolonge) —
//  deux zones qui se touchent n'ont donc ni couture ni cloison : c'est une
//  seule plaque. Rien n'est une image : tout naît du bruit (fBm), calculé en
//  coordonnées de la carte, si bien qu'une case garde son givre quand la
//  plaque s'agrandit.
//
//    • le SOL : une pellicule blanc-bleu translucide, granuleuse, plus
//      épaisse au cœur, par plaques (givre blanc, glace plus claire) ; le
//      bord ronge le terrain de façon irrégulière, sans trait ;
//    • les FOUGÈRES DE GIVRE : des cristaux qui se ramifient à 60° (la glace
//      est hexagonale), quelques étoiles de rosée gelée ;
//    • la BRUME : deux voiles de bruit qui dérivent dans le sens du vent,
//      étirés par lui, au-dessus de la plaque et un peu au-delà ;
//    • des SCINTILLEMENTS : de petits éclats qui s'allument et s'éteignent.
//
//  `creerCoucheGivre(conteneur, { R, pixel, graine, vent })` rend la couche ;
//  elle vit dans le repère de la carte (le conteneur est posé sur elle).
//  `ajouter(cases, { depuis, duree })` : le givre rampe depuis `depuis` sur
//  les nouvelles cases (la plaque grandit) ; `poser(cases)` : sans animation ;
//  `vider()`, `detruire()`. Le Studio s'en sert (studio_animation.js) ; le
//  combat garde sa nappe tant que Nico ne l'a pas validée.
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
    // Bruit de valeur ; `periode` (en cellules) le rend raccordable (la brume se répète sans couture).
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
        if (document.getElementById("style-givre")) return;
        const s = document.createElement("style");
        s.id = "style-givre";
        s.textContent = `
            .givre-couche { position: absolute; pointer-events: none; }
            .givre-couche canvas.givre-sol { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
            .givre-brume { position: absolute; left: 0; top: 0; width: 100%; height: 100%; overflow: hidden;
                           -webkit-mask-size: 100% 100%; mask-size: 100% 100%; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat; }
            .givre-vent { position: absolute; left: 50%; top: 50%; }
            .givre-voile { position: absolute; left: 0; top: 0; background-repeat: repeat; will-change: transform; }
            .givre-eclat { position: absolute; width: 3px; height: 3px; margin: -1.5px 0 0 -1.5px; border-radius: 50%; opacity: 0;
                           background: #ffffff; box-shadow: 0 0 3px 1px rgba(210, 240, 255, 0.95), 0 0 7px 2px rgba(160, 220, 255, 0.45); }
        `;
        document.head.appendChild(s);
    }

    // --- LA BRUME : une tuile de bruit qui se raccorde sur ses bords --------
    let tuileBrume = null;
    function tuile() {
        if (tuileBrume) return tuileBrume;
        const N = 128, c = document.createElement("canvas");
        c.width = c.height = N;
        const ctx = c.getContext("2d"), img = ctx.createImageData(N, N);
        for (let y = 0; y < N; y++) {
            for (let x = 0; x < N; x++) {
                // 4 cellules de base par tuile, période 4 (puis 8, 16…) : raccordable.
                const f = fbm(x / N * 4, y / N * 4, 5, 911, 4);
                const a = entre(0.47, 0.83, f);
                const i = (y * N + x) * 4;
                img.data[i] = 236; img.data[i + 1] = 246; img.data[i + 2] = 255;
                img.data[i + 3] = Math.round(a * 235);
            }
        }
        ctx.putImageData(img, 0, 0);
        tuileBrume = c.toDataURL("image/png");
        return tuileBrume;
    }

    // =====================================================================
    //  LA COUCHE
    // =====================================================================
    window.creerCoucheGivre = function (conteneur, options) {
        injecterStyle();
        const opts = options || {};
        const R = opts.R || 50;
        const pixel = opts.pixel;
        const graine = opts.graine || 7;
        // Le vent : sa direction (radians, 0 = vers la droite) et sa force (px de carte par seconde).
        const vent = { angle: opts.vent && opts.vent.angle !== undefined ? opts.vent.angle : 0.32,
                       vitesse: opts.vent && opts.vent.vitesse ? opts.vent.vitesse : R * 0.55 };
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

        const racine = document.createElement("div");
        racine.className = "givre-couche";
        racine.dataset.givre = "1";
        conteneur.appendChild(racine);
        const sol = document.createElement("canvas");
        sol.className = "givre-sol";
        racine.appendChild(sol);
        let brume = null, eclats = [];
        const cases = new Map();
        let rendu = null;          // le dernier dessin : { x0, y0, l, h, k, plein, masque }
        let lecture = Promise.resolve();
        let detruite = false;

        // L'EMPRISE : le rectangle de la carte que couvre la plaque (et sa brume).
        function emprise(liste) {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            liste.forEach(c => { const p = pixel(c.q, c.r); x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
            const marge = R * 1.6;
            return { x0: Math.floor(x0 - marge), y0: Math.floor(y0 - marge), l: Math.ceil(x1 - x0 + 2 * marge), h: Math.ceil(y1 - y0 + 2 * marge) };
        }

        // LE DESSIN DE LA PLAQUE pour un ensemble de cases : le sol, son masque,
        // le masque (plus large) de la brume, les points où scintiller.
        function dessiner(liste) {
            const E0 = emprise(liste);
            // La finesse : 1,25 pixel par pixel de carte, moins sur une très grande plaque.
            const k = Math.max(0.6, Math.min(opts.finesse || 1.25, Math.sqrt(2000000 / Math.max(1, E0.l * E0.h))));
            // L'emprise calée sur la grille des pixels de la carte : quand la plaque
            // grandit, un même point tombe sur le même pixel — son givre ne bouge pas.
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

            const plein = document.createElement("canvas"); plein.width = W; plein.height = H;
            const masque = document.createElement("canvas"); masque.width = W; masque.height = H;
            const kb = 0.3, WB = Math.max(1, Math.round(E.l * kb)), HB = Math.max(1, Math.round(E.h * kb));
            const masqueBrume = document.createElement("canvas"); masqueBrume.width = WB; masqueBrume.height = HB;
            const cp = plein.getContext("2d"), cm = masque.getContext("2d"), cb = masqueBrume.getContext("2d");
            const ip = cp.createImageData(W, H), im = cm.createImageData(W, H), ib = cb.createImageData(WB, HB);
            const e1 = R * 0.55, e2 = R * 0.3, e3 = R * 0.022, e4 = R * 0.09;
            for (let j = 0; j < H; j++) {
                const y = E.y0 + (j + 0.5) / k;
                for (let i = 0; i < W; i++) {
                    const x = E.x0 + (i + 0.5) / k;
                    const p = profondeur(x, y);
                    const idx = (j * W + i) * 4;
                    if (p < -R * 0.45) continue;
                    // Le bord ronge le terrain : décalé par un bruit large, ni droit ni hexagonal.
                    const n1 = fbm(x / e1, y / e1, 3, graine);
                    const bord = p + (n1 - 0.5) * R * 0.7;
                    const m = entre(-R * 0.06, R * 0.34, bord);
                    // Des grains de givre au-delà du bord, là où le froid a déjà mordu.
                    const n4 = fbm(x / e4, y / e4, 2, graine + 53);
                    const tache = bord > -R * 0.32 ? entre(0.62, 0.78, n4) * entre(-R * 0.32, -R * 0.02, bord) * 0.7 : 0;
                    const couvre = Math.max(m, tache);
                    if (couvre <= 0.003) continue;
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
                    ip.data[idx] = Math.round(214 - bleu * 30 + n3 * 22);
                    ip.data[idx + 1] = Math.round(236 - bleu * 10 + n3 * 10);
                    ip.data[idx + 2] = 255;
                    ip.data[idx + 3] = Math.round(Math.min(0.7, a) * 255);
                    im.data[idx] = im.data[idx + 1] = im.data[idx + 2] = 255;
                    im.data[idx + 3] = Math.round(couvre * 255);
                }
            }
            cp.putImageData(ip, 0, 0);
            cm.putImageData(im, 0, 0);
            // La brume déborde un peu de la plaque, bord flou.
            for (let j = 0; j < HB; j++) {
                const y = E.y0 + (j + 0.5) / kb;
                for (let i = 0; i < WB; i++) {
                    const x = E.x0 + (i + 0.5) / kb;
                    const b = entre(-R * 0.75, R * 0.35, profondeur(x, y) + (fbm(x / e1, y / e1, 3, graine + 41) - 0.5) * R * 0.6);
                    const idx = (j * WB + i) * 4;
                    ib.data[idx] = ib.data[idx + 1] = ib.data[idx + 2] = 255;
                    ib.data[idx + 3] = Math.round(b * 255);
                }
            }
            cb.putImageData(ib, 0, 0);

            // LES FOUGÈRES DE GIVRE : des tiges qui se ramifient à 60°, sur le masque.
            const fougeres = document.createElement("canvas"); fougeres.width = W; fougeres.height = H;
            const cf = fougeres.getContext("2d");
            cf.setTransform(k, 0, 0, k, -E.x0 * k, -E.y0 * k);
            cf.lineCap = "round";
            const tiges = [];
            // Une tige, ses rameaux à ±60° (un peu de jeu : rien n'est parfait dehors).
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
            const etoiles = [];
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
            // Un halo d'abord (le givre diffuse la lumière), puis le trait net.
            // (Un seul tracé par rang et par passe : des milliers de petits traits d'un coup.)
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
            cf.setTransform(1, 0, 0, 1, 0, 0);
            cf.globalCompositeOperation = "destination-in";
            cf.drawImage(masque, 0, 0);
            cp.drawImage(fougeres, 0, 0);

            // LES SCINTILLEMENTS : deux ou trois par case, là où le givre est franc.
            const points = [];
            liste.forEach(c => {
                const p = pixel(c.q, c.r), h0 = (c.q * 7349 + c.r * 2903 + graine) | 0;
                for (let s = 0; s < 3; s++) {
                    const ang = hacher(h0, s, 51) * Math.PI * 2, d = R * 0.8 * Math.sqrt(hacher(h0, s, 52));
                    const x = p.x + Math.cos(ang) * d, y = p.y + Math.sin(ang) * d;
                    const i = Math.floor((x - E.x0) * k), j = Math.floor((y - E.y0) * k);
                    if (i >= 0 && j >= 0 && i < W && j < H && im.data[(j * W + i) * 4 + 3] > 160) points.push({ x: x - E.x0, y: y - E.y0, h: hacher(h0, s, 53) });
                }
            });
            return { ...E, k, plein, masque, masqueBrume, points, cases: liste };
        }

        // Le sol affiché : la plaque entière, ou en train de ramper.
        function placer(d) {
            racine.style.left = d.x0 + "px"; racine.style.top = d.y0 + "px";
            racine.style.width = d.l + "px"; racine.style.height = d.h + "px";
            sol.width = d.plein.width; sol.height = d.plein.height;
        }
        // LA BRUME : deux voiles qui dérivent avec le vent, dans le masque de la plaque.
        function brumeDe(d) {
            const b = document.createElement("div");
            b.className = "givre-brume";
            const url = `url(${d.masqueBrume.toDataURL("image/png")})`;
            b.style.webkitMaskImage = url; b.style.maskImage = url;
            const diag = Math.ceil(Math.hypot(d.l, d.h)) + 2;
            const v = document.createElement("div");
            v.className = "givre-vent";
            v.style.transform = `translate(-50%, -50%) rotate(${vent.angle}rad)`;
            v.style.width = v.style.height = diag + "px";
            const src = tuile();
            const voiles = [{ l: R * 6.4, h: R * 2.6, op: 0.52, v: 1 }, { l: R * 4.0, h: R * 1.8, op: 0.36, v: 0.62 }].map((c, n) => {
                const el = document.createElement("div");
                el.className = "givre-voile";
                el.style.width = (diag + c.l) + "px"; el.style.height = diag + "px";
                el.style.backgroundImage = `url(${src})`;
                el.style.backgroundSize = `${c.l}px ${c.h}px`;
                el.style.backgroundPosition = `${n * c.l * 0.37}px ${n * c.h * 0.53}px`;
                el.style.opacity = String(c.op);
                v.appendChild(el);
                // Une tuile de plus que la largeur : la dérive d'une tuile boucle sans saut.
                const duree = c.l / (vent.vitesse * c.v) * 1000;
                if (typeof el.animate === "function") {
                    el.animate([{ transform: `translateX(${-c.l}px)` }, { transform: "translateX(0px)" }], { duration: duree, iterations: Infinity, easing: "linear" });
                    // Elle respire : ni tout à fait là, ni tout à fait partie.
                    el.animate([{ opacity: c.op }, { opacity: c.op * 0.55 }, { opacity: c.op }], { duration: 5200 + n * 1900, iterations: Infinity, easing: "ease-in-out" });
                }
                return el;
            });
            void voiles;
            b.appendChild(v);
            return b;
        }
        function scintiller(d, retard) {
            eclats.forEach(e => e.remove());
            eclats = d.points.map(pt => {
                const e = document.createElement("div");
                e.className = "givre-eclat";
                e.style.left = pt.x + "px"; e.style.top = pt.y + "px";
                racine.appendChild(e);
                if (typeof e.animate === "function") {
                    const periode = 2600 + pt.h * 4200;
                    e.animate([{ opacity: 0, transform: "scale(0.4)" }, { opacity: 0, transform: "scale(0.4)", offset: 0.82 },
                               { opacity: 1, transform: "scale(1.25)", offset: 0.88 }, { opacity: 0, transform: "scale(0.4)", offset: 0.95 },
                               { opacity: 0, transform: "scale(0.4)" }],
                              { duration: periode, delay: (retard || 0) + pt.h * periode, iterations: Infinity });
                }
                return e;
            });
        }
        function changerBrume(d, fondu) {
            const nouvelle = brumeDe(d);
            racine.insertBefore(nouvelle, sol.nextSibling);
            const ancienne = brume;
            brume = nouvelle;
            if (!fondu || typeof nouvelle.animate !== "function") { if (ancienne) ancienne.remove(); return; }
            nouvelle.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fondu, easing: "ease-in-out", fill: "both" });
            if (ancienne) ancienne.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fondu, easing: "ease-in-out", fill: "both" }).finished
                .then(() => ancienne.remove(), () => ancienne.remove());
        }

        // LE GIVRE QUI RAMPE : depuis `depuis`, un front irrégulier gagne la
        // plaque ; derrière lui, la nouvelle plaque ; devant, l'ancienne.
        function ramper(ancien, d, depuis, duree) {
            return new Promise(fin => {
                const ctx = sol.getContext("2d");
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
                const t0 = performance.now();
                const image = (t) => {
                    if (detruite) return fin();
                    const u = Math.min(1, (t - t0) / duree), e = 1 - Math.pow(1 - u, 1.5);
                    const rayon = Math.max(1, e * loin);
                    ctx.globalCompositeOperation = "source-over";
                    ctx.clearRect(0, 0, W, H);
                    if (ancien) {
                        ctx.drawImage(ancien.plein, (ancien.x0 - d.x0) * k, (ancien.y0 - d.y0) * k, ancien.plein.width * k / ancien.k, ancien.plein.height * k / ancien.k);
                        ctx.globalCompositeOperation = "destination-out";
                        front(ctx, rayon);
                        ctx.globalCompositeOperation = "source-over";
                    }
                    ct.globalCompositeOperation = "source-over";
                    ct.clearRect(0, 0, W, H);
                    ct.drawImage(d.plein, 0, 0);
                    ct.globalCompositeOperation = "destination-in";
                    front(ct, rayon);
                    ctx.drawImage(tmp, 0, 0);
                    if (u < 1) requestAnimationFrame(image);
                    else { ctx.globalCompositeOperation = "source-over"; ctx.clearRect(0, 0, W, H); ctx.drawImage(d.plein, 0, 0); fin(); }
                };
                requestAnimationFrame(image);
            });
        }

        function montrer(d) {
            const ctx = sol.getContext("2d");
            ctx.clearRect(0, 0, sol.width, sol.height);
            ctx.drawImage(d.plein, 0, 0);
        }

        function lire(quoi, x, y) {
            if (!rendu) return 0;
            const i = Math.floor((x - rendu.x0) * rendu.k), j = Math.floor((y - rendu.y0) * rendu.k);
            if (i < 0 || j < 0 || i >= rendu[quoi].width || j >= rendu[quoi].height) return 0;
            return rendu[quoi].getContext("2d").getImageData(i, j, 1, 1).data[3] / 255;
        }

        const couche = {
            el: racine,
            cases: () => [...cases.values()].map(c => ({ q: c.q, r: c.r })),
            // Sans animation : la plaque telle qu'elle est (un redessin, une reprise).
            poser(liste) {
                (liste || []).forEach(c => cases.set(cle(c.q, c.r), { q: c.q, r: c.r }));
                if (!cases.size) return couche.vider(0);
                const d = dessiner([...cases.values()]);
                placer(d); montrer(d);
                changerBrume(d, 0); scintiller(d, 0);
                rendu = d;
                return Promise.resolve(true);
            },
            // Le givre gagne de nouvelles cases : il rampe depuis `depuis` ({q, r} ou {x, y}).
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
                    if (!depuis) { const c0 = pixel(neuves[0].q, neuves[0].r); depuis = c0; }
                    const duree = p.duree || 1400;
                    changerBrume(d, duree * 0.9);
                    scintiller(d, duree * 0.6);
                    await ramper(ancien, d, depuis, duree);
                    return true;
                });
                return lecture;
            },
            // Les cases fondues : la plaque se redessine sans elles.
            retirer(liste) {
                (liste || []).forEach(c => cases.delete(cle(c.q, c.r)));
                return couche.poser([]);
            },
            // Tout fond (`duree` : en fondu).
            vider(duree = 450) {
                cases.clear();
                rendu = null;
                const finir = () => { const ctx = sol.getContext("2d"); ctx.clearRect(0, 0, sol.width, sol.height); if (brume) brume.remove(); brume = null;
                                      eclats.forEach(e => e.remove()); eclats = []; racine.style.opacity = ""; };
                if (!duree || typeof racine.animate !== "function") { finir(); return Promise.resolve(true); }
                return racine.animate([{ opacity: 1 }, { opacity: 0 }], { duration: duree, fill: "forwards" }).finished
                    .then(() => { racine.getAnimations().forEach(a => a.cancel()); finir(); return true; }, () => true);
            },
            detruire() {
                detruite = true;
                racine.remove();
            },
            // Pour les bancs : l'opacité du givre en un point de la carte, et sa
            // couverture (0 à 1 : le givre est-il là, quelle que soit son épaisseur).
            opaciteEn(x, y) { return lire("plein", x, y); },
            couvertureEn(x, y) { return lire("masque", x, y); }
        };
        return couche;
    };
})();
