// =========================================================================
//  IVALIS — LES ZONES PROCÉDURALES : GIVRE, BRASIER, POISON, FOUDRE, PIÈGES, GRAVATS
// =========================================================================
//  Nico, dans le Studio d'animation : « J'aimerais qu'on revoie l'animation
//  des zones de glace. Je ne veux pas de contour, mais quelque chose de plus
//  réaliste vu du dessus : une zone de givre qui vient un peu en
//  transparence au-dessus du terrain existant, avec un petit effet de brume
//  glacée soufflée par le vent. Si plusieurs zones sont collées, ça fait comme
//  une grosse zone. Quelque chose de procédural. » Puis : « Comme les zones
//  de glace, fais aussi de façon procédurale les zones de feu du Studio. » Et :
//  « Refais dans le même état d'esprit les zones poison et électrique. » Et
//  (v247) : « Dans le même esprit, refais-moi les zones de gravats, de terrain
//  difficile, quand les murs se brisent. » Puis (v248) : « Et pour les zones
//  avec juste des dégâts normaux, fais des chausse-trappes sur le sol, en
//  mode procédural pareil. »
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
//      sous le vent, au-delà de la zone ; des étincelles qui s'envolent ;
//    • LE POISON (poison) : une boue acide translucide, vert vif sur les
//      bords, vert noir dans les flaques, luisante ; le terrain fané autour,
//      quelques éclaboussures ; des bulles qui gonflent et éclatent ; un
//      miasme lourd qui rampe sous le vent ;
//    • LA FOUDRE (electrique) : le sol ionisé, à peine bleui, marqué de
//      figures de Lichtenberg (les brûlures ramifiées de la foudre) qui
//      grésillent ; des arcs qui claquent au hasard d'un point à l'autre ; un
//      voile de plasma ; des étincelles qui crépitent ;
//    • LES PIÈGES (neutre, la zone qui ne fait que des dégâts) : le sol
//      piétiné, à peine assombri, griffé, quelques traces de rouille ; des
//      chausse-trappes semées partout (trois pointes au sol, la quatrième
//      dressée), chacune tournée au hasard, avec son ombre, du fer plus ou
//      moins rouillé ; des reflets qui accrochent la lumière sur les pointes ;
//    • LES GRAVATS (gravats) : la terre retournée, un petit monticule par
//      case éclairé en haut à gauche ; des pierres cassées (gros blocs au
//      cœur, moellons autour, cailloux qui roulent jusqu'au bord et au-delà),
//      chacune avec son ombre ; la poussière du mur ; une poussière légère
//      qui traîne sous le vent, une bouffée qui se lève de loin en loin.
//
//  `creerCoucheProcedurale(conteneur, { type, R, pixel, graine, vent })` rend
//  la couche (`creerCoucheGivre`, `creerCoucheFeu`, `creerCouchePoison`,
//  `creerCoucheElectrique`, `creerCouchePieges`, `creerCoucheGravats` : la
//  même, d'un élément) ;
//  elle vit dans le repère de la carte (le conteneur est posé sur elle).
//  `ajouter(cases, { depuis, duree })` : l'élément gagne les nouvelles cases
//  depuis `depuis` (la plaque grandit) ; `poser(cases)` : sans animation ;
//  `retirer(cases)`, `vider()`, `detruire()`. Le Studio s'en sert
//  (studio_animation.js) ; le combat aussi pour les quatre zones (v246,
//  combat.js) ; il garde ses tas de gravats et sa nappe de pièges tant que
//  Nico n'a pas validé.
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
            .elec-etincelle { width: 2px; height: 2px; margin: -1px 0 0 -1px; background: #ffffff;
                              box-shadow: 0 0 3px 1px rgba(170, 225, 255, 1), 0 0 9px 3px rgba(90, 170, 255, 0.6); }
            .poison-bulle { border-radius: 50%; border: 1.5px solid rgba(215, 255, 150, 0.7);
                            background: radial-gradient(circle at 34% 32%, rgba(255, 255, 255, 0.55), rgba(170, 225, 90, 0.18) 38%, rgba(90, 140, 30, 0.08) 70%); }
            .piege-reflet { width: 2px; height: 2px; margin: -1px 0 0 -1px; background: #ffffff;
                            box-shadow: 0 0 2px 1px rgba(235, 240, 250, 0.95), 0 0 6px 2px rgba(200, 210, 230, 0.5); }
            .gravats-bouffee { border-radius: 50%; background: radial-gradient(circle, rgba(214, 198, 168, 0.75), rgba(200, 182, 150, 0.3) 45%, rgba(190, 172, 140, 0) 70%); }
            .zone-proc-arcs { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
            .zone-proc-arcs canvas { opacity: 0; }
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
        fumee: (f) => [58, 52, 50, entre(0.42, 0.86, f) * 215],
        // Le miasme du poison : un vert sale, lourd.
        miasme: (f) => [120, 175, 62, entre(0.44, 0.86, f) * 205],
        // Le plasma de la foudre : un bleu pâle, à peine là.
        plasma: (f) => [150, 205, 255, entre(0.55, 0.92, f) * 190],
        // La poussière des gravats : un beige sec, en volutes légères.
        poussiere: (f) => [206, 190, 160, entre(0.5, 0.9, f) * 200]
    };
    const tuilesFaites = {};
    function tuile(nom) {
        if (tuilesFaites[nom]) return tuilesFaites[nom];
        const N = 128, c = document.createElement("canvas");
        c.width = c.height = N;
        const ctx = c.getContext("2d"), img = ctx.createImageData(N, N);
        const graine = { brume: 911, flamme: 313, fumee: 521, miasme: 641, plasma: 733, poussiere: 857 }[nom] || 1;
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

    // LES FIGURES DE LICHTENBERG : les brûlures ramifiées que la foudre laisse au
    // sol — des marches au hasard qui bifurquent, de plus en plus fines. Les
    // mêmes traits pour le sol (brûlés) et pour la lueur (qui grésille).
    function lichtenberg(liste, { R, graine, pixel }) {
        const traits = [];
        const marcher = (x, y, ang, pas, larg, rang, h) => {
            for (let i = 0; i < pas; i++) {
                ang += (hacher(h, i, 3) - 0.5) * 1.2;
                const L = R * (0.05 + 0.04 * hacher(h, i, 5));
                const x2 = x + Math.cos(ang) * L, y2 = y + Math.sin(ang) * L;
                traits.push([x, y, x2, y2, larg * (1 - i / (pas * 1.4))]);
                if (rang < 3 && hacher(h, i, 7) < 0.2) marcher(x2, y2, ang + (hacher(h, i, 9) < 0.5 ? -1 : 1) * (0.5 + 0.5 * hacher(h, i, 11)),
                                                              Math.floor(pas * 0.6), larg * 0.65, rang + 1, h * 17 + i);
                x = x2; y = y2;
            }
        };
        liste.forEach(c => {
            const p = pixel(c.q, c.r), h0 = (c.q * 48611 + c.r * 96823 + graine) | 0;
            for (let f = 0; f < 2; f++) {
                const ang = hacher(h0, f, 1) * Math.PI * 2, d = R * 0.5 * Math.sqrt(hacher(h0, f, 2));
                marcher(p.x + Math.cos(ang) * d, p.y + Math.sin(ang) * d, hacher(h0, f, 4) * Math.PI * 2, 16, 1.6, 0, h0 + f * 101);
            }
        });
        return traits;
    }
    const tracerTraits = (ctx, traits, couleur, epaisseur, k) => {
        ctx.lineCap = "round";
        ctx.strokeStyle = couleur;
        // Trois épaisseurs (tronc, branches, brindilles) : un seul tracé par classe.
        [[1.2, Infinity, 1.4], [0.8, 1.2, 1], [0, 0.8, 0.6]].forEach(([min, max, l]) => {
            ctx.lineWidth = l * epaisseur / k;
            ctx.beginPath();
            traits.forEach(t => { if (t[4] >= min && t[4] < max) { ctx.moveTo(t[0], t[1]); ctx.lineTo(t[2], t[3]); } });
            ctx.stroke();
        });
    };
    // UN ARC : un éclair brisé d'un point à l'autre (déplacement du milieu, récursif).
    function arc(ctx, x1, y1, x2, y2, ecart, profondeur, h) {
        if (profondeur <= 0) { ctx.lineTo(x2, y2); return; }
        const mx = (x1 + x2) / 2 + (hacher(h, profondeur, 1) - 0.5) * ecart, my = (y1 + y2) / 2 + (hacher(h, profondeur, 2) - 0.5) * ecart;
        arc(ctx, x1, y1, mx, my, ecart * 0.55, profondeur - 1, h * 3 + 1);
        arc(ctx, mx, my, x2, y2, ecart * 0.55, profondeur - 1, h * 3 + 2);
    }

    // UN CAILLOU vu d'en haut : un polygone irrégulier (de la roche cassée),
    // son ombre portée en bas à droite, la lumière en haut à gauche, une face
    // plate plus claire, une arête vive, une arête sombre.
    function caillou(cf, { x, y, r, h, haut }) {
        const n = 5 + Math.floor(hacher(h, 4, 61) * 4);
        const rot = hacher(h, 5, 61) * Math.PI * 2, allonge = 0.62 + 0.38 * hacher(h, 6, 61);
        const pts = [];
        for (let i = 0; i < n; i++) {
            const a = (i + (hacher(h, 10 + i, 61) - 0.5) * 0.7) / n * Math.PI * 2;
            const rr = r * (0.76 + 0.32 * hacher(h, 20 + i, 61));
            const lx = Math.cos(a) * rr, ly = Math.sin(a) * rr * allonge;
            pts.push([x + lx * Math.cos(rot) - ly * Math.sin(rot), y + lx * Math.sin(rot) + ly * Math.cos(rot)]);
        }
        const chemin = (dx, dy, e) => {
            cf.beginPath();
            pts.forEach(([px, py], i) => { const X = x + (px - x) * e + dx, Y = y + (py - y) * e + dy; if (i) cf.lineTo(X, Y); else cf.moveTo(X, Y); });
            cf.closePath();
        };
        // L'ombre, douce : deux passes, plus haut il est, plus elle s'écarte.
        const porte = 0.2 + 0.18 * haut;
        cf.fillStyle = "rgba(24, 16, 10, 0.26)"; chemin(r * (porte + 0.12), r * (porte + 0.18), 1.16); cf.fill();
        cf.fillStyle = "rgba(24, 16, 10, 0.42)"; chemin(r * porte, r * (porte + 0.06), 1.0); cf.fill();
        // La roche : un gris brun, chaque pierre la sienne.
        const L = 31 + 16 * hacher(h, 7, 61) + 8 * haut, S = 5 + 9 * hacher(h, 8, 61), T = 28 + 14 * hacher(h, 9, 61);
        const g = cf.createLinearGradient(x - r * 0.7, y - r * 0.8, x + r * 0.7, y + r * 0.8);
        g.addColorStop(0, `hsl(${T}, ${S}%, ${L + 15}%)`); g.addColorStop(0.5, `hsl(${T}, ${S}%, ${L}%)`); g.addColorStop(1, `hsl(${T}, ${S}%, ${L - 17}%)`);
        cf.fillStyle = g; chemin(0, 0, 1); cf.fill();
        // La face plate, tournée vers la lumière.
        cf.fillStyle = `hsla(${T}, ${S}%, ${L + 16}%, 0.45)`; chemin(-r * 0.13, -r * 0.15, 0.58); cf.fill();
        // Les arêtes : vive en haut à gauche, sombre en bas à droite.
        cf.lineJoin = "round";
        for (let i = 0; i < n; i++) {
            const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
            const nx = by - ay, ny = -(bx - ax), lum = -(nx * 0.6 + ny * 0.8) / (Math.hypot(nx, ny) || 1);
            if (Math.abs(lum) < 0.25) continue;
            cf.strokeStyle = lum > 0 ? `hsla(${T}, ${S}%, ${L + 28}%, ${(0.55 * lum).toFixed(2)})` : `rgba(26, 18, 12, ${(-0.5 * lum).toFixed(2)})`;
            cf.lineWidth = Math.max(0.5, r * 0.09);
            cf.beginPath(); cf.moveTo(ax, ay); cf.lineTo(bx, by); cf.stroke();
        }
        // Parfois, une fêlure.
        if (hacher(h, 30, 61) < 0.35 && r > 3) {
            const a = hacher(h, 31, 61) * Math.PI;
            cf.strokeStyle = "rgba(30, 22, 16, 0.45)"; cf.lineWidth = Math.max(0.4, r * 0.05);
            cf.beginPath(); cf.moveTo(x - Math.cos(a) * r * 0.55, y - Math.sin(a) * r * 0.45); cf.lineTo(x + Math.cos(a + 0.4) * r * 0.1, y + Math.sin(a + 0.4) * r * 0.1);
            cf.lineTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.5); cf.stroke();
        }
    }

    // LES CHAUSSE-TRAPPES : semées sur un réseau régulier de la carte, chaque
    // point déplacé au hasard (un semis sans amas ni trou, sans couture entre
    // deux cases, le même quelle que soit la plaque), parfois deux tombées
    // ensemble ; seules restent celles qui tombent franchement dans la zone.
    function semerPieges(liste, { R, graine, pixel, profondeur }) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        liste.forEach(c => { const p = pixel(c.q, c.r); x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
        const d = R * 0.6, dy = d * 0.866, pieges = [];
        const garder = (x, y, s, rot, h) => { if (profondeur(x, y) >= s * 0.9) pieges.push({ x, y, s, rot, h }); };
        for (let j = Math.floor((y0 - R) / dy); j <= Math.ceil((y1 + R) / dy); j++) {
            for (let i = Math.floor((x0 - R) / d) - 1; i <= Math.ceil((x1 + R) / d) + 1; i++) {
                const h = (Math.imul(i, 7919) ^ Math.imul(j, 104729) ^ Math.imul(graine, 31)) | 0;
                if (hacher(h, 1, 81) < 0.12) continue;
                const x = (i + (j & 1) * 0.5 + (hacher(h, 2, 81) - 0.5) * 0.7) * d;
                const y = (j + (hacher(h, 3, 81) - 0.5) * 0.7) * dy;
                const s = R * (0.16 + 0.06 * hacher(h, 4, 81));
                garder(x, y, s, hacher(h, 5, 81) * Math.PI * 2, h);
                if (hacher(h, 6, 81) < 0.2) {
                    const a = hacher(h, 7, 81) * Math.PI * 2;
                    garder(x + Math.cos(a) * s * 1.8, y + Math.sin(a) * s * 1.8, s * 0.92, hacher(h, 8, 81) * Math.PI * 2, (h * 3 + 1) | 0);
                }
            }
        }
        return pieges;
    }
    // UNE CHAUSSE-TRAPPE vue d'en haut : trois pointes à plat (une arête, une
    // face au clair, une face à l'ombre), la quatrième dressée, que l'on voit
    // courte vers le haut de l'écran (comme les murs, qui montent vers le
    // haut) ; leurs ombres en bas à droite, la dressée la plus longue ; un nœud
    // au centre ; le fer plus ou moins rouillé.
    function chausseTrappe(cf, { x, y, s, rot, h }) {
        const rouille = hacher(h, 9, 81) < 0.45 ? hacher(h, 19, 81) * 0.45 : 0;
        const fer = (l) => {
            const a = [l * 0.92, l * 0.95, l * 1.03], b = [l * 1.2 + 18, l * 0.72 + 4, l * 0.45];
            return `rgb(${a.map((v, i) => Math.round(Math.min(255, v + (b[i] - v) * rouille))).join(",")})`;
        };
        const w = s * 0.19;
        const bras = [0, 1, 2].map(i => ({ a: rot + i * 2 * Math.PI / 3 + (hacher(h, 10 + i, 81) - 0.5) * 0.3, l: s * (0.85 + 0.3 * hacher(h, 13 + i, 81)) }));
        const dressee = { a: -Math.PI / 2 + (hacher(h, 16, 81) - 0.5) * 0.5, l: s * 0.55 };
        const pointe = (ox, oy, a, l, e) => {
            const px = -Math.sin(a) * e, py = Math.cos(a) * e;
            cf.beginPath(); cf.moveTo(ox + px, oy + py); cf.lineTo(ox + Math.cos(a) * l, oy + Math.sin(a) * l); cf.lineTo(ox - px, oy - py); cf.closePath();
        };
        // Les ombres.
        cf.fillStyle = "rgba(14, 10, 8, 0.4)";
        bras.forEach(b => { pointe(x + s * 0.12, y + s * 0.16, b.a, b.l, w * 1.1); cf.fill(); });
        pointe(x + s * 0.05, y + s * 0.07, Math.atan2(0.8, 0.6), s * 0.95, w * 0.9); cf.fill();
        // Les pointes : chacune deux faces, l'une tournée vers la lumière (en haut à gauche).
        const facettes = (b) => {
            const ex = x + Math.cos(b.a) * b.l, ey = y + Math.sin(b.a) * b.l, px = -Math.sin(b.a) * w, py = Math.cos(b.a) * w;
            const lum = -(px * 0.6 + py * 0.8) / w;
            [[1, lum], [-1, -lum]].forEach(([sg, l]) => {
                cf.fillStyle = fer(l > 0 ? 78 + 80 * l : 40 + 18 * (1 + l));
                cf.beginPath(); cf.moveTo(x + px * sg, y + py * sg); cf.lineTo(ex, ey); cf.lineTo(x, y); cf.closePath(); cf.fill();
            });
        };
        bras.forEach(facettes);
        facettes(dressee);
        // Le nœud, et l'éclat de la pointe dressée.
        cf.fillStyle = fer(58);
        cf.beginPath(); cf.arc(x, y, w * 0.9, 0, Math.PI * 2); cf.fill();
        cf.fillStyle = fer(165);
        cf.beginPath(); cf.arc(x - w * 0.3, y - w * 0.35, w * 0.35, 0, Math.PI * 2); cf.fill();
        cf.fillStyle = "rgba(240, 244, 250, 0.75)";
        cf.beginPath(); cf.arc(x + Math.cos(dressee.a) * dressee.l * 0.92, y + Math.sin(dressee.a) * dressee.l * 0.92, w * 0.28, 0, Math.PI * 2); cf.fill();
    }

    // =====================================================================
    //  LES RECETTES
    // =====================================================================
    //  `sol(x, y, p, outils)` : le pixel du sol — [r, g, b, a, couverture] ou
    //  null — en un point de la carte à la profondeur `p` (sa distance au bord,
    //  positive dedans) ; `lueur` (le feu) : le pixel des braises, sur un
    //  calque à part qui respire ; `decor` : ce qui se trace par-dessus (les
    //  fougères de givre, les pierres des gravats), découpé par la plaque sauf
    //  `decorDebord` (des cailloux roulent au-delà) ; `voiles` : brume,
    //  flammes, fumée, poussière ; `eclats` ; `frange` : la couleur du front
    //  qui avance. Les outils : R, graine, pixel, k, profondeur, versCase.
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
        },

        poison: {
            classe: "poison", marge: 2.0,
            // LA BOUE ACIDE : vert vif sur les bords, vert noir dans les flaques,
            // luisante ; le terrain fané autour, quelques éclaboussures.
            sol(x, y, p, { R, graine }) {
                if (p < -R * 0.5) return null;
                const n1 = fbm(x / (R * 0.5), y / (R * 0.5), 3, graine + 5);
                const bord = p + (n1 - 0.5) * R * 0.8;
                const m = entre(-R * 0.08, R * 0.32, bord);
                const n4 = fbm(x / (R * 0.1), y / (R * 0.1), 2, graine + 57);
                const tache = bord > -R * 0.35 ? entre(0.66, 0.8, n4) * entre(-R * 0.35, -R * 0.02, bord) * 0.8 : 0;
                const couvre = Math.max(m, tache);
                // Le terrain fané juste autour : un jaunissement, sans trait.
                const fane = bord > -R * 0.45 && couvre < 0.5 ? entre(-R * 0.45, -R * 0.05, bord) * 0.16 : 0;
                if (couvre <= 0.003 && fane <= 0.003) return null;
                if (couvre <= 0.003) return [150, 128, 58, fane, 0];
                // Des flaques larges et lisses (un liquide ne fait pas de grain).
                const n2 = fbm(x / (R * 0.42), y / (R * 0.42), 2, graine + 23);
                const n3 = bruit(x / (R * 0.05), y / (R * 0.05), graine + 37);
                const profond = entre(0.52, 0.28, n2) * 0.85;
                // Des reflets mouillés, doux et étirés : la boue luit.
                const reflet = entre(0.7, 0.9, fbm((x + y * 0.35) / (R * 0.22), y / (R * 0.44), 2, graine + 91)) * (1 - profond) * 0.7;
                const r = 158 - 88 * profond + n3 * 6 + reflet * 70, g = 210 - 100 * profond + n3 * 8 + reflet * 40, b = 42 - 14 * profond + reflet * 80;
                const a = couvre * (0.28 + 0.24 * profond + 0.05 * n3 + 0.18 * reflet) + fane * (1 - couvre);
                return [r, g, b, Math.min(0.75, a), couvre];
            },
            voiles: [
                // Le miasme : lourd, lent, il rampe sous le vent et déborde un peu.
                { nom: "miasme", classe: "poison-miasme", ecran: false, sousLeVent: 0.6,
                  masque: (p, n, R) => entre(-R * 0.6, R * 0.4, p + (n - 0.5) * R * 0.6),
                  couches: [{ tuile: "miasme", l: 6, h: 3.2, op: 0.42, v: 0.32 }, { tuile: "miasme", l: 4, h: 2.4, op: 0.3, v: 0.22 }] }
            ],
            eclats: { parCase: 4, classe: "poison-bulle", geste: "bulle" },
            frange: [170, 235, 80]
        },

        electrique: {
            classe: "elec", marge: 1.6,
            // LE SOL IONISÉ : un voile bleu nuit, à peine là, granuleux ; quelques
            // poussières chargées qui brillent.
            sol(x, y, p, { R, graine }) {
                if (p < -R * 0.45) return null;
                const n1 = fbm(x / (R * 0.5), y / (R * 0.5), 3, graine + 9);
                const bord = p + (n1 - 0.5) * R * 0.7;
                const m = entre(-R * 0.06, R * 0.3, bord);
                if (m <= 0.003) return null;
                const n2 = fbm(x / (R * 0.3), y / (R * 0.3), 3, graine + 27);
                const n3 = bruit(x / (R * 0.03), y / (R * 0.03), graine + 43);
                const poussiere = hacher(Math.floor(x * 1.2), Math.floor(y * 1.2), graine + 67) > 0.992 ? 1 : 0;
                if (poussiere) return [205, 232, 255, m * 0.55, m];
                return [38 + n3 * 14, 52 + n3 * 18, 96 + n2 * 30, Math.min(0.5, m * (0.16 + 0.12 * n2 + 0.06 * n3)), m];
            },
            // Les brûlures ramifiées au sol…
            decor(cf, liste, outils) { tracerTraits(cf, lichtenberg(liste, outils), "rgba(22, 28, 60, 0.55)", 1.6, outils.k); },
            // …et leur lueur, qui grésille.
            decorLueur(cf, liste, outils) { tracerTraits(cf, lichtenberg(liste, outils), "rgba(175, 222, 255, 0.9)", 1.1, outils.k); },
            respiration: { lueur: [1, 0.35, 0.9, 0.2, 1, 0.55, 0.95, 0.3, 1], duree: 900, halo: [0.7, 0.25, 0.8, 0.15, 0.6, 0.7], dureeHalo: 1300 },
            // Les arcs : des éclairs brisés entre deux points de la zone, chacun
            // sur son image, qui claque un instant, au hasard.
            arcs: {
                images: 6,
                dessiner(ctx, liste, { R, graine, pixel }, n) {
                    for (let a = 0; a < 2; a++) {
                        const h = (graine * 131 + n * 977 + a * 53) | 0;
                        const c1 = liste[Math.floor(hacher(h, 1, 1) * liste.length)], c2 = liste[Math.floor(hacher(h, 2, 1) * liste.length)];
                        const p1 = pixel(c1.q, c1.r), p2 = pixel(c2.q, c2.r);
                        const x1 = p1.x + (hacher(h, 3, 1) - 0.5) * R, y1 = p1.y + (hacher(h, 4, 1) - 0.5) * R;
                        let x2 = p2.x + (hacher(h, 5, 1) - 0.5) * R, y2 = p2.y + (hacher(h, 6, 1) - 0.5) * R;
                        // Trop court (la même case) : il saute un peu plus loin.
                        if (Math.hypot(x2 - x1, y2 - y1) < R * 0.8) { const g = hacher(h, 7, 1) * Math.PI * 2; x2 = x1 + Math.cos(g) * R * 1.1; y2 = y1 + Math.sin(g) * R * 1.1; }
                        const ecart = Math.hypot(x2 - x1, y2 - y1) * 0.35;
                        [[R * 0.16, "rgba(110, 180, 255, 0.22)"], [R * 0.06, "rgba(160, 215, 255, 0.6)"], [R * 0.022, "rgba(255, 255, 255, 0.95)"]].forEach(([l, c]) => {
                            ctx.strokeStyle = c; ctx.lineWidth = l; ctx.lineCap = "round"; ctx.lineJoin = "round";
                            ctx.beginPath(); ctx.moveTo(x1, y1); arc(ctx, x1, y1, x2, y2, ecart, 5, h); ctx.stroke();
                        });
                    }
                }
            },
            voiles: [
                // Un voile de plasma, à peine là, qui vacille.
                { nom: "plasma", classe: "elec-plasma", ecran: true, vacille: true,
                  masque: (p, n, R) => entre(0, R * 0.45, p + (n - 0.5) * R * 0.6),
                  couches: [{ tuile: "plasma", l: 3.4, h: 1.6, op: 0.26, v: 1.4 }, { tuile: "plasma", l: 2.4, h: 1.2, op: 0.18, v: 2.0 }] }
            ],
            eclats: { parCase: 4, classe: "elec-etincelle", geste: "crepite" },
            frange: [150, 210, 255]
        },

        neutre: {
            classe: "piege", marge: 1.2,
            // LE SOL PIÉTINÉ : une terre à peine assombrie, sans bord net, griffée
            // (du fer traîné), quelques traces de rouille.
            sol(x, y, p, { R, graine }) {
                if (p < -R * 0.4) return null;
                const n1 = fbm(x / (R * 0.5), y / (R * 0.5), 3, graine + 15);
                const bord = p + (n1 - 0.5) * R * 0.6;
                const m = entre(-R * 0.1, R * 0.3, bord);
                if (m <= 0.003) return null;
                const n2 = fbm(x / (R * 0.22), y / (R * 0.22), 3, graine + 33);
                const n3 = bruit(x / (R * 0.03), y / (R * 0.03), graine + 45);
                // Quelques éraflures, par endroits : un bruit étiré dont on ne garde que les crêtes.
                const e = fbm((x * 0.8 + y * 0.6) / (R * 0.05), (y * 0.8 - x * 0.6) / (R * 0.5), 2, graine + 57);
                const griffe = entre(0.9, 0.97, 1 - Math.abs(2 * e - 1)) * entre(0.6, 0.78, fbm(x / (R * 0.4), y / (R * 0.4), 2, graine + 59));
                const rouille = entre(0.74, 0.86, fbm(x / (R * 0.12), y / (R * 0.12), 2, graine + 63)) * 0.5;
                const r = 58 + 16 * n3 + rouille * 50, g = 50 + 13 * n3 + rouille * 16, b = 44 + 10 * n3;
                const a = m * (0.15 + 0.12 * entre(0.35, 0.7, n2) + 0.05 * n3 + 0.1 * griffe + 0.08 * rouille);
                return [r, g, b, Math.min(0.5, a), m];
            },
            // Les chausse-trappes, semées partout dans la zone.
            decor(cf, liste, outils) {
                semerPieges(liste, outils).sort((a, b) => a.y - b.y).forEach(pt => chausseTrappe(cf, pt));
            },
            decorDebord: true,
            voiles: [],
            // Un reflet, de loin en loin, sur la pointe dressée d'une chausse-trappe sur trois.
            eclats: { parCase: 0, classe: "piege-reflet", geste: "scintille",
                      points: (liste, outils) => semerPieges(liste, outils).filter(pt => hacher(pt.h, 17, 81) < 0.34)
                          .map(pt => ({ x: pt.x, y: pt.y - pt.s * 0.5, h: hacher(pt.h, 18, 81) })) },
            frange: null
        },

        gravats: {
            classe: "gravats", marge: 1.5,
            // LA TERRE RETOURNÉE : un sol brun, en mottes, un petit monticule par
            // case (éclairé en haut à gauche, dans l'ombre en bas à droite) ; la
            // poussière du mur, plus claire vers les bords ; au-delà, une poudre
            // beige retombée, sans trait, et des grains épars.
            sol(x, y, p, { R, graine, pixel, versCase }) {
                if (p < -R * 0.62) return null;
                const n1 = fbm(x / (R * 0.45), y / (R * 0.45), 3, graine + 13);
                const bord = p + (n1 - 0.5) * R * 0.7;
                const m = entre(-R * 0.12, R * 0.26, bord);
                const poudre = bord > -R * 0.62 ? entre(-R * 0.62, -R * 0.04, bord) : 0;
                // Des grains, des petits cailloux : nombreux sur la terre, rares dans la poudre.
                const gx = x / (R * 0.075), gy = y / (R * 0.075), ix = Math.floor(gx), iy = Math.floor(gy);
                let grain = null;
                const amas = entre(0.35, 0.75, fbm(x / (R * 0.35), y / (R * 0.35), 2, graine + 79));
                if (hacher(ix, iy, graine + 71) > 0.97 - (0.22 + 0.4 * amas) * Math.max(m, poudre * 0.3)) {
                    const cx = ix + 0.3 + 0.4 * hacher(ix, iy, graine + 72), cy = iy + 0.3 + 0.4 * hacher(ix, iy, graine + 73);
                    const rr = 0.09 + 0.24 * Math.pow(hacher(ix, iy, graine + 74), 2);
                    const dx = gx - cx, dy = gy - cy, d = Math.sqrt(dx * dx + dy * dy);
                    if (d < rr) grain = { lum: -(dx * 0.6 + dy * 0.8) / rr, t: hacher(ix, iy, graine + 75) };
                    else if (d < rr * 1.45 && dx + dy > 0) grain = { ombre: 1 };
                }
                if (m <= 0.003 && poudre <= 0.003 && !grain) return null;
                if (grain && grain.lum !== undefined) {
                    const l = 96 + 34 * grain.lum + 28 * grain.t;
                    return [l, l * 0.9, l * 0.78, Math.max(0.85, m), m];
                }
                if (m <= 0.003) return grain ? [40, 28, 18, 0.25 * poudre + 0.1, 0] : [190, 172, 140, poudre * 0.18, 0];
                // Le monticule de la case : une butte douce, dont la pente se tourne vers la lumière.
                const c = versCase(x, y), o = pixel(c.q, c.r);
                const dx = (x - o.x) / R, dy = (y - o.y) / R, d = Math.sqrt(dx * dx + dy * dy);
                const butte = Math.max(0, 1 - d * d / 0.85);
                const pente = d > 0.02 ? -(dx * 0.6 + dy * 0.8) / d * Math.min(1, d * 1.8) * butte : 0;
                const n2 = fbm(x / (R * 0.17), y / (R * 0.17), 3, graine + 29);
                const n3 = bruit(x / (R * 0.022), y / (R * 0.022), graine + 41);
                const motte = entre(0.42, 0.72, n2);
                let r = 100 + 52 * pente - 30 * motte + 14 * n3, g = 76 + 42 * pente - 24 * motte + 11 * n3, b = 52 + 30 * pente - 16 * motte + 8 * n3;
                // La poussière du mur : par plaques, et plus vers le bord.
                const poussiere = Math.min(0.7, (1 - entre(0, R * 0.5, bord)) * 0.45 + 0.35 * entre(0.6, 0.82, fbm(x / (R * 0.3), y / (R * 0.3), 2, graine + 47)));
                r += (186 - r) * poussiere * 0.55; g += (168 - g) * poussiere * 0.55; b += (136 - b) * poussiere * 0.55;
                if (grain && grain.ombre) { r *= 0.72; g *= 0.72; b *= 0.72; }
                const a = m * (0.74 + 0.16 * butte + 0.05 * n3) + poudre * 0.18 * (1 - m);
                return [r, g, b, Math.min(0.92, a), m];
            },
            // LES PIERRES : de gros blocs au cœur de chaque case, des moellons autour,
            // des cailloux qui roulent jusqu'au bord et au-delà ; les plus hauts
            // (près du cœur) posés par-dessus les autres.
            decor(cf, liste, { R, graine, pixel, profondeur }) {
                const pierres = [];
                const FAMILLES = [
                    { n: 5, rMin: 0.14, rMax: 0.25, loin: 0.42, dedans: 0.7 },
                    { n: 18, rMin: 0.075, rMax: 0.14, loin: 0.72, dedans: 0.45 },
                    { n: 34, rMin: 0.03, rMax: 0.065, loin: 1.05, dedans: -6 }
                ];
                liste.forEach(c => {
                    const p = pixel(c.q, c.r), h0 = (c.q * 73856 + c.r * 19349 + graine) | 0;
                    FAMILLES.forEach((f, fi) => {
                        for (let s = 0; s < f.n; s++) {
                            const h = (h0 * 31 + fi * 1009 + s * 7) | 0;
                            const ang = hacher(h, 1, 61) * Math.PI * 2, d = R * f.loin * Math.sqrt(hacher(h, 2, 61));
                            const x = p.x + Math.cos(ang) * d, y = p.y + Math.sin(ang) * d;
                            const r = R * (f.rMin + (f.rMax - f.rMin) * hacher(h, 3, 61));
                            // Les blocs restent sur la terre ; les cailloux roulent jusqu'à la poudre.
                            if (profondeur(x, y) < r * f.dedans) continue;
                            pierres.push({ x, y, r, h, haut: Math.max(0, 1 - d / (R * 1.1)) * (fi === 2 ? 0.5 : 1) });
                        }
                    });
                });
                pierres.sort((a, b) => a.haut - b.haut).forEach(pt => caillou(cf, pt));
            },
            decorDebord: true,
            voiles: [
                // Une poussière légère, qui traîne et s'en va doucement sous le vent.
                { nom: "poussiere", classe: "gravats-poussiere", ecran: false, sousLeVent: 0.5,
                  masque: (p, n, R) => entre(-R * 0.6, R * 0.4, p + (n - 0.5) * R * 0.6),
                  couches: [{ tuile: "poussiere", l: 6, h: 3, op: 0.24, v: 0.45 }, { tuile: "poussiere", l: 4.2, h: 2.2, op: 0.16, v: 0.3 }] }
            ],
            eclats: { parCase: 2, classe: "gravats-bouffee", geste: "bouffee" },
            frange: [215, 196, 160]
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
        if (recette.lueur || recette.decorLueur) {
            lueur = document.createElement("canvas");
            lueur.className = `${pre}-braises zone-proc-ecran`;
            halo = document.createElement("canvas");
            halo.className = `${pre}-halo zone-proc-ecran`;
            halo.style.filter = `blur(${Math.max(2, R * 0.08).toFixed(1)}px)`;
            racine.appendChild(halo);
            racine.appendChild(lueur);
            // Le feu respire lentement ; la foudre grésille.
            const r = recette.respiration || { lueur: [1, 0.72, 0.95, 0.6, 0.9, 1], duree: 2600, halo: [0.6, 0.35, 0.7, 0.45, 0.6], dureeHalo: 3300 };
            if (typeof lueur.animate === "function") {
                lueur.animate(r.lueur.map(o => ({ opacity: o })), { duration: r.duree, iterations: Infinity, easing: "ease-in-out" });
                halo.animate(r.halo.map(o => ({ opacity: o })), { duration: r.dureeHalo, iterations: Infinity, easing: "ease-in-out" });
            }
        }
        let voiles = [], eclats = [], arcs = null;
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
            const outils = { R, graine, pixel, k, profondeur, versCase };

            const toile = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
            const plein = toile(W, H), masque = toile(W, H), braises = recette.lueur || recette.decorLueur ? toile(W, H) : null;
            const cp = plein.getContext("2d"), cm = masque.getContext("2d");
            const ip = cp.createImageData(W, H), im = cm.createImageData(W, H);
            const ib = recette.lueur ? braises.getContext("2d").createImageData(W, H) : null;
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
            if (ib) braises.getContext("2d").putImageData(ib, 0, 0);

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

            // LE DÉCOR TRACÉ (les fougères de givre, les brûlures de la foudre — et
            // leur lueur), découpé par le masque.
            const tracer = (fonction, cible, libre) => {
                const deco = toile(W, H), cf = deco.getContext("2d");
                cf.setTransform(k, 0, 0, k, -E.x0 * k, -E.y0 * k);
                fonction(cf, liste, outils);
                cf.setTransform(1, 0, 0, 1, 0, 0);
                if (!libre) {
                    cf.globalCompositeOperation = "destination-in";
                    cf.drawImage(masque, 0, 0);
                }
                cible.getContext("2d").drawImage(deco, 0, 0);
            };
            if (recette.decor) tracer(recette.decor, plein, recette.decorDebord);
            if (recette.decorLueur) tracer(recette.decorLueur, braises);

            // LES ARCS (la foudre) : chacun sur son image, en demi-définition (ils sont flous de lumière).
            const imagesArcs = recette.arcs ? Array.from({ length: recette.arcs.images }, (_, n) => {
                const ka = k * 0.6, c = toile(Math.max(1, Math.round(W * 0.6)), Math.max(1, Math.round(H * 0.6))), ctx = c.getContext("2d");
                ctx.setTransform(ka, 0, 0, ka, -E.x0 * ka, -E.y0 * ka);
                recette.arcs.dessiner(ctx, liste, outils, n);
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.globalCompositeOperation = "destination-in";
                // Le masque un peu épaissi : un arc peut lécher le bord.
                ctx.drawImage(masque, 0, 0, c.width, c.height);
                return c;
            }) : [];

            // LES ÉCLATS : quelques-uns par case, là où la plaque est franche.
            const points = [];
            if (recette.eclats.points) recette.eclats.points(liste, outils).forEach(pt => {
                if (pt.x >= E.x0 && pt.y >= E.y0 && pt.x < E.x0 + E.l && pt.y < E.y0 + E.h) points.push({ x: pt.x - E.x0, y: pt.y - E.y0, h: pt.h });
            });
            liste.forEach(c => {
                const p = pixel(c.q, c.r), h0 = (c.q * 7349 + c.r * 2903 + graine) | 0;
                for (let s = 0; s < recette.eclats.parCase; s++) {
                    const ang = hacher(h0, s, 51) * Math.PI * 2, d = R * 0.8 * Math.sqrt(hacher(h0, s, 52));
                    const x = p.x + Math.cos(ang) * d, y = p.y + Math.sin(ang) * d;
                    const i = Math.floor((x - E.x0) * k), j = Math.floor((y - E.y0) * k);
                    if (i >= 0 && j >= 0 && i < W && j < H && im.data[(j * W + i) * 4 + 3] > 160) points.push({ x: x - E.x0, y: y - E.y0, h: hacher(h0, s, 53) });
                }
            });
            return { ...E, k, plein, masque, braises, masquesVoiles, imagesArcs, points, cases: liste };
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
                if (recette.eclats.geste === "bulle") {
                    // Une bulle gonfle sur la boue, tremble, et crève.
                    const t = R * (0.1 + 0.12 * pt.h), periode = 1800 + pt.h * 2400;
                    e.style.width = e.style.height = t + "px";
                    e.style.margin = `${-t / 2}px 0 0 ${-t / 2}px`;
                    e.animate([{ opacity: 0, transform: "scale(0.2)" }, { opacity: 0.9, transform: "scale(0.55)", offset: 0.2 },
                               { opacity: 0.9, transform: "scale(0.95)", offset: 0.72 }, { opacity: 0.9, transform: "scale(1)", offset: 0.8 },
                               { opacity: 0, transform: "scale(1.35)", offset: 0.86 }, { opacity: 0, transform: "scale(0.2)" }],
                              { duration: periode, delay: (retard || 0) + pt.h * periode, iterations: Infinity, easing: "ease-out" });
                } else if (recette.eclats.geste === "bouffee") {
                    // Une bouffée de poussière se lève, s'étale et retombe, de loin en loin.
                    const t = R * (0.35 + 0.25 * pt.h), periode = 4200 + pt.h * 4800;
                    e.style.width = e.style.height = t + "px";
                    e.style.margin = `${-t / 2}px 0 0 ${-t / 2}px`;
                    e.animate([{ opacity: 0, transform: "translate(0px, 0px) scale(0.3)" }, { opacity: 0, transform: "translate(0px, 0px) scale(0.3)", offset: 0.55 },
                               { opacity: 0.55, transform: `translate(${(ux * R * 0.08).toFixed(1)}px, ${(uy * R * 0.08).toFixed(1)}px) scale(0.9)`, offset: 0.66 },
                               { opacity: 0, transform: `translate(${(ux * R * 0.35).toFixed(1)}px, ${(uy * R * 0.35).toFixed(1)}px) scale(1.6)` }],
                              { duration: periode, delay: (retard || 0) + pt.h * periode, iterations: Infinity, easing: "ease-out" });
                } else if (recette.eclats.geste === "crepite") {
                    // Une étincelle claque deux fois, vite, et disparaît.
                    const periode = 900 + pt.h * 1300, o = 0.2 + pt.h * 0.6;
                    e.animate([{ opacity: 0, transform: "scale(0.5)" }, { opacity: 0, offset: o }, { opacity: 1, transform: "scale(1.6)", offset: o + 0.03 },
                               { opacity: 0.1, transform: "scale(0.7)", offset: o + 0.06 }, { opacity: 1, transform: "scale(1.3)", offset: o + 0.09 },
                               { opacity: 0, transform: "scale(0.5)", offset: o + 0.14 }, { opacity: 0, transform: "scale(0.5)" }],
                              { duration: periode, delay: (retard || 0) + pt.h * 400, iterations: Infinity });
                } else if (recette.eclats.geste === "envol") {
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
        function arcsDe(d) {
            if (!d.imagesArcs.length) return null;
            const b = document.createElement("div");
            b.className = `zone-proc-arcs ${pre}-arcs zone-proc-ecran`;
            d.imagesArcs.forEach((src, n) => {
                const c = document.createElement("canvas");
                c.width = src.width; c.height = src.height;
                c.getContext("2d").drawImage(src, 0, 0);
                b.appendChild(c);
                if (typeof c.animate !== "function") return;
                // Un éclat bref (un double coup), à un instant à lui, dans une période à lui.
                const h = hacher(graine, n, 991), periode = 1100 + h * 1500, o = 0.1 + hacher(graine, n, 992) * 0.7;
                c.animate([{ opacity: 0 }, { opacity: 0, offset: o }, { opacity: 1, offset: o + 0.02 }, { opacity: 0.25, offset: o + 0.05 },
                           { opacity: 0.9, offset: o + 0.07 }, { opacity: 0, offset: o + 0.12 }, { opacity: 0 }],
                          { duration: periode, iterations: Infinity });
            });
            return b;
        }
        function changerArcs(d, fondu, retard) {
            const nouveaux = arcsDe(d), anciens = arcs;
            arcs = nouveaux;
            if (nouveaux) racine.insertBefore(nouveaux, eclats[0] || null);
            if (!anciens) return;
            if (!fondu || typeof anciens.animate !== "function") { anciens.remove(); return; }
            if (nouveaux) nouveaux.animate([{ opacity: 0 }, { opacity: 1 }], { duration: fondu, delay: retard || 0, fill: "both" });
            anciens.animate([{ opacity: 1 }, { opacity: 0 }], { duration: fondu, delay: retard || 0, fill: "both" }).finished.then(() => anciens.remove(), () => anciens.remove());
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
                changerVoiles(d, 0); changerArcs(d, 0); eclater(d, 0);
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
                    changerArcs(d, duree * 0.5, duree * 0.5);
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
                    if (arcs) { arcs.remove(); arcs = null; }
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
    window.creerCouchePoison = (conteneur, options) => window.creerCoucheProcedurale(conteneur, { ...(options || {}), type: "poison" });
    window.creerCoucheElectrique = (conteneur, options) => window.creerCoucheProcedurale(conteneur, { ...(options || {}), type: "electrique" });
    window.creerCouchePieges = (conteneur, options) => window.creerCoucheProcedurale(conteneur, { ...(options || {}), type: "neutre" });
    window.creerCoucheGravats = (conteneur, options) => window.creerCoucheProcedurale(conteneur, { ...(options || {}), type: "gravats" });
    // Toutes les recettes (le Studio les essaie toutes).
    window.RECETTES_PROCEDURALES = Object.keys(RECETTES);
    // Les zones persistantes que le combat dessine ainsi (v246) : les quatre
    // éléments validés. Les pièges et les gravats attendent leur validation.
    window.TYPES_ZONES_PROCEDURALES = ["glace", "feu", "poison", "electrique"];
})();
