// =========================================================================
//  LES MURS DE TERRE DU GÉOMANCIEN (niveau 5) — CÔTÉ ÉCRAN
// =========================================================================
//  Les murs vivent dans l'état du cerveau (etat.murs, etat.gravats) ; la
//  projection les descend ici (window.MURS_TERRE, window.GRAVATS_TERRE,
//  regime_cerveau.js). Ce fichier :
//
//    1. les fait lire au terrain de l'écran (etatCaseCombat) : déplacement,
//       ligne de vue, cases d'arrivée — un mur bloque, des gravats ralentissent ;
//    2. les DESSINE, sans IA : un pilier de roche vu de dessus, un peu en
//       perspective, de quelques masses taillées à facettes, parfois des
//       cailloux au pied ; cassé, des gravats de terre sur la case ;
//    3. ouvre la POSE des murs : le Géomancien touche les cases, 20 de
//       fatigue par mur, puis lève le tout.
//
//  Le hasard des dessins est tiré d'une graine (l'id du mur, la case des
//  gravats) : tous les écrans dessinent la même roche.
(function () {
    window.MURS_TERRE = window.MURS_TERRE || {};
    window.GRAVATS_TERRE = window.GRAVATS_TERRE || {};

    const cleCase = (q, r) => `${Number(q) || 0}_${Number(r) || 0}`;
    window.murEnCase = function (q, r) {
        const murs = window.MURS_TERRE || {};
        const id = Object.keys(murs).sort().find(k => murs[k] && murs[k].q === q && murs[k].r === r);
        return id ? murs[id] : null;
    };
    window.estIdMur = (id) => !!(id && (window.MURS_TERRE || {})[id]);

    const persoDe = (id) => (window.PERSOS_PARTIE || []).find(p => p && p.idPersonnage === id) || null;
    const atoutDe = (id) => {
        const p = persoDe(id);
        return (p && typeof window.atoutRace === "function") ? (window.atoutRace(p) || {}) : {};
    };

    // LE TERRAIN DE L'ÉCRAN, murs et gravats compris. `idQui` : celui qui
    // marche — le Géomancien traverse ses murs (sans s'y arrêter : la case
    // garde `murTerre`) et ne sent pas le terrain difficile.
    window.etatCaseCombat = function (q, r, idQui) {
        const base = (window.PLATEAU_VTT && typeof window.PLATEAU_VTT.getCaseState === "function")
            ? (window.PLATEAU_VTT.getCaseState(q, r) || {}) : {};
        const e = { ...base };
        const mur = window.murEnCase(q, r);
        if (mur) {
            e.murTerre = mur;
            const traverse = idQui && mur.idLanceur === idQui && atoutDe(idQui).traverseSesMurs;
            if (!traverse) e.isBlocked = true;
        }
        if ((window.GRAVATS_TERRE || {})[cleCase(q, r)]) { e.isDifficult = true; e.gravats = true; }
        if (idQui && e.isDifficult && atoutDe(idQui).terrainFacile) e.isDifficult = false;
        return e;
    };

    // ---------------------------------------------------------------------
    //  LE DESSIN
    // ---------------------------------------------------------------------
    function hasard(graine) {
        let h = 2166136261 >>> 0;
        for (const ch of String(graine || "mur")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
        return () => {
            h = (h + 0x6D2B79F5) >>> 0;
            let t = h;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const teinte = (l, s, a = 1) => `hsla(${l[0]}, ${s}%, ${l[1]}%, ${a})`;

    // UNE MASSE DE ROCHE : un prisme à facettes. Sa base est un polygone
    // irrégulier aplati (la perspective), son sommet le même, plus haut et un
    // peu resserré. Les faces se dessinent du fond vers l'avant, éclairées du
    // haut à gauche, puis le dessus, plus clair, avec ses fissures.
    function masse(ctx, alea, cx, cy, rayon, hauteur, couleur) {
        const n = 5 + Math.floor(alea() * 3);
        const depart = alea() * Math.PI * 2;
        const bas = [], haut = [];
        const retrait = 0.78 + alea() * 0.12;
        for (let i = 0; i < n; i++) {
            const a = depart + (i / n) * Math.PI * 2 + (alea() - 0.5) * 0.35;
            const rr = rayon * (0.78 + alea() * 0.38);
            bas.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr * 0.55, a });
            const rh = rr * retrait * (0.92 + alea() * 0.12);
            haut.push({ x: cx + Math.cos(a) * rh + (alea() - 0.5) * rayon * 0.08,
                        y: cy - hauteur * (0.92 + alea() * 0.16) + Math.sin(a) * rh * 0.55, a });
        }
        const faces = [];
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const milieu = (bas[i].a + bas[j].a) / 2 + (bas[j].a < bas[i].a ? Math.PI : 0);
            faces.push({ pts: [bas[i], bas[j], haut[j], haut[i]], y: (bas[i].y + bas[j].y) / 2,
                         lumiere: Math.cos(milieu - (-2.35)) });
        }
        faces.sort((f, g) => f.y - g.y);
        faces.forEach(f => {
            const clarte = couleur[1] - 6 + Math.max(-0.5, f.lumiere) * 14;
            ctx.beginPath();
            f.pts.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
            ctx.closePath();
            const g = ctx.createLinearGradient(0, cy - hauteur, 0, cy + rayon * 0.5);
            g.addColorStop(0, teinte([couleur[0], clarte + 8], couleur[2]));
            g.addColorStop(1, teinte([couleur[0], clarte - 9], couleur[2] + 4));
            ctx.fillStyle = g;
            ctx.fill();
            ctx.strokeStyle = "rgba(30, 24, 18, 0.5)";
            ctx.lineWidth = 1;
            ctx.stroke();
            // Les strates : des lignes de lit, un peu de travers, sur la face.
            if (f.y > cy - rayon * 0.2) {
                ctx.save();
                ctx.clip();
                const lits = 2 + Math.floor(alea() * 3);
                for (let k = 1; k <= lits; k++) {
                    const t = k / (lits + 1) + (alea() - 0.5) * 0.08;
                    const a0 = { x: f.pts[0].x + (f.pts[3].x - f.pts[0].x) * t, y: f.pts[0].y + (f.pts[3].y - f.pts[0].y) * t };
                    const a1 = { x: f.pts[1].x + (f.pts[2].x - f.pts[1].x) * t, y: f.pts[1].y + (f.pts[2].y - f.pts[1].y) * t };
                    ctx.strokeStyle = "rgba(35, 28, 22, 0.35)";
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(a0.x, a0.y + (alea() - 0.5) * 2);
                    ctx.lineTo((a0.x + a1.x) / 2, (a0.y + a1.y) / 2 + (alea() - 0.5) * 3);
                    ctx.lineTo(a1.x, a1.y + (alea() - 0.5) * 2);
                    ctx.stroke();
                    ctx.strokeStyle = "rgba(255, 245, 230, 0.12)";
                    ctx.beginPath();
                    ctx.moveTo(a0.x, a0.y + 1.2);
                    ctx.lineTo(a1.x, a1.y + 1.2);
                    ctx.stroke();
                }
                // Des éclats : quelques points clairs et sombres.
                for (let k = 0; k < 6; k++) {
                    const u = alea(), v = alea();
                    const x = f.pts[0].x + (f.pts[1].x - f.pts[0].x) * u + (f.pts[3].x - f.pts[0].x) * v;
                    const y = f.pts[0].y + (f.pts[1].y - f.pts[0].y) * u + (f.pts[3].y - f.pts[0].y) * v;
                    ctx.fillStyle = alea() < 0.5 ? "rgba(255, 248, 235, 0.18)" : "rgba(20, 14, 10, 0.25)";
                    ctx.fillRect(x, y, 1.6, 1.6);
                }
                ctx.restore();
            }
        });
        // Les grosses masses (pas les cailloux) : la roche moins lisse.
        if (rayon >= 14) {
            faces.filter(f => f.y > cy - rayon * 0.2).forEach(f => {
                ctx.save();
                ctx.beginPath();
                f.pts.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
                ctx.closePath();
                ctx.clip();
                detaillerFace(ctx, alea, f.pts[0], f.pts[1], f.pts[2], f.pts[3]);
                ctx.restore();
            });
        }
        // Quelques fissures verticales sur les faces de devant.
        ctx.strokeStyle = "rgba(25, 16, 10, 0.5)";
        ctx.lineWidth = 1.2;
        faces.filter(f => f.y > cy).forEach(f => {
            if (alea() < 0.5) return;
            const t = 0.3 + alea() * 0.4;
            const x0 = f.pts[0].x + (f.pts[1].x - f.pts[0].x) * t, y0 = f.pts[0].y + (f.pts[1].y - f.pts[0].y) * t;
            const x1 = f.pts[3].x + (f.pts[2].x - f.pts[3].x) * t, y1 = f.pts[3].y + (f.pts[2].y - f.pts[3].y) * t;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo((x0 + x1) / 2 + (alea() - 0.5) * 4, (y0 + y1) / 2);
            ctx.lineTo(x0 + (alea() - 0.5) * 3, y0 - (y0 - y1) * 0.25);
            ctx.stroke();
        });
        // Le dessus.
        ctx.beginPath();
        haut.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
        ctx.closePath();
        const dessus = ctx.createRadialGradient(cx - rayon * 0.3, cy - hauteur - rayon * 0.2, 1, cx, cy - hauteur, rayon * 1.1);
        dessus.addColorStop(0, teinte([couleur[0], couleur[1] + 16], couleur[2] - 4));
        dessus.addColorStop(1, teinte([couleur[0], couleur[1] + 2], couleur[2]));
        ctx.fillStyle = dessus;
        ctx.fill();
        if (rayon >= 14) {
            ctx.save();
            ctx.clip();
            const T = Math.ceil(rayon * 2.4);
            texturePierre(ctx, cx - T / 2, cy - hauteur - T / 2, T, T, [couleur[0], couleur[1] + 9, couleur[2]],
                          Math.floor(alea() * 5000), Math.floor(alea() * 5000), Math.floor(alea() * 1e6));
            ctx.restore();
            ctx.beginPath();
            haut.forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
            ctx.closePath();
        }
        ctx.strokeStyle = "rgba(30, 20, 12, 0.55)";
        ctx.stroke();
        if (alea() < 0.8) {
            ctx.strokeStyle = "rgba(40, 28, 18, 0.55)";
            ctx.beginPath();
            const a = alea() * Math.PI;
            ctx.moveTo(cx + Math.cos(a) * rayon * 0.5, cy - hauteur + Math.sin(a) * rayon * 0.2);
            ctx.lineTo(cx + (alea() - 0.5) * rayon * 0.3, cy - hauteur + (alea() - 0.5) * rayon * 0.15);
            ctx.lineTo(cx - Math.cos(a) * rayon * 0.4, cy - hauteur - Math.sin(a) * rayon * 0.18);
            ctx.stroke();
        }
        // QUELQUES CAILLOUX SUR LE DESSUS d'une grosse masse (Nico : « j'aime
        // bien l'idée d'avoir quelques cailloux sur le dessus, mets-en plus »).
        if (rayon < 14) return 0;
        const sur = [];
        const nb = 3 + Math.floor(alea() * 4) + Math.floor(rayon / 12);
        for (let k = 0; k < nb; k++) {
            const a = alea() * Math.PI * 2, d = Math.sqrt(alea()) * rayon * 0.6;
            sur.push({ x: cx + Math.cos(a) * d, y: cy - hauteur + Math.sin(a) * d * 0.55, r: tailleCaillouDessus(alea) });
        }
        sur.sort((u, v) => u.y - v.y).forEach(c => masse(ctx, alea, c.x, c.y, c.r, c.r * (0.4 + alea() * 0.5),
            [couleur[0] + Math.floor((alea() - 0.5) * 8), couleur[1] + Math.floor((alea() - 0.5) * 12), couleur[2]]));
        return sur.length;
    }
    // Des petits surtout, quelques moyens.
    function tailleCaillouDessus(alea) {
        const u = alea();
        return u < 0.2 ? 2.6 + alea() * 1.4 : 1.0 + alea() * 1.6;
    }

    // Une ombre douce au pied, vers le bas à droite.
    function ombre(ctx, cx, cy, rx, ry, force = 0.4) {
        const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, rx);
        g.addColorStop(0, `rgba(0, 0, 0, ${force})`);
        g.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, ry / rx);
        ctx.translate(-cx, -cy);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // LE PILIER : 128 × 160, la case au pied (64, 118). Deux ou trois masses
    // soudées en un gros pilier, et parfois quelques cailloux tout autour.
    const LARGEUR = 128, HAUTEUR = 160, PIED_Y = 118;
    window.dessinerPilierTerre = function (graine) {
        const canvas = document.createElement("canvas");
        canvas.width = LARGEUR; canvas.height = HAUTEUR;
        const ctx = canvas.getContext("2d");
        const alea = hasard(graine);
        // Une roche grise, à peine teintée de terre.
        const roche = [26 + Math.floor(alea() * 16), 44 + Math.floor(alea() * 8), 8 + Math.floor(alea() * 9)];
        // Pas d'ombre portée : de la terre soulevée tout autour du pied.
        const tour = [];
        for (let i = 0; i < 12; i++) {
            const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 1) / 12) * Math.PI * 2;
            tour.push([{ x: 64 + Math.cos(a0) * 36, y: PIED_Y + Math.sin(a0) * 20 }, { x: 64 + Math.cos(a1) * 36, y: PIED_Y + Math.sin(a1) * 20 },
                       Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2)]);
        }
        terreSoulevee(ctx, alea, tour, 64, PIED_Y);
        const masses = [];
        const nb = 2 + Math.floor(alea() * 2);
        for (let i = 0; i < nb; i++) {
            const a = alea() * Math.PI * 2, d = 6 + alea() * 12;
            masses.push({ x: 64 + Math.cos(a) * d, y: PIED_Y - 4 + Math.sin(a) * d * 0.5,
                          rayon: 18 + alea() * 9, hauteur: 56 + alea() * 34 });
        }
        // Le cœur du pilier, le plus large, au centre.
        masses.push({ x: 64, y: PIED_Y, rayon: 34 + alea() * 4, hauteur: 50 + alea() * 16 });
        canvas.nbCaillouxDessus = 0;
        masses.sort((a, b) => a.y - b.y).forEach(m => { canvas.nbCaillouxDessus += masse(ctx, alea, m.x, m.y, m.rayon, m.hauteur, roche) || 0; });
        // Des gravats au pied, devant.
        gravatsAuPied(ctx, alea, tour.filter(t => t[3] > 0.05), 64, PIED_Y, roche);
        return canvas;
    };

    // LES GRAVATS : 128 × 128, à plat sur la case. Une tache de terre
    // retournée, des éclats de roche et de la poussière.
    window.dessinerGravatsTerre = function (graine) {
        const canvas = document.createElement("canvas");
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext("2d");
        const alea = hasard(graine);
        const terre = [26 + Math.floor(alea() * 8), 26 + Math.floor(alea() * 6), 30];
        for (let i = 0; i < 4; i++) {
            const x = 64 + (alea() - 0.5) * 34, y = 64 + (alea() - 0.5) * 26, r = 26 + alea() * 16;
            const g = ctx.createRadialGradient(x, y, 2, x, y, r);
            g.addColorStop(0, teinte([terre[0], terre[1]], terre[2], 0.55));
            g.addColorStop(1, teinte([terre[0], terre[1]], terre[2], 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        const n = 12 + Math.floor(alea() * 8);
        const eclats = [];
        for (let i = 0; i < n; i++) {
            const a = alea() * Math.PI * 2, d = Math.sqrt(alea()) * 40;
            eclats.push({ x: 64 + Math.cos(a) * d, y: 64 + Math.sin(a) * d * 0.75, r: 2.5 + alea() * 5.5 });
        }
        eclats.sort((a, b) => a.y - b.y).forEach(e => {
            ombre(ctx, e.x + 1.5, e.y + 1.5, e.r * 1.5, e.r * 0.8, 0.35);
            masse(ctx, alea, e.x, e.y, e.r, e.r * (0.4 + alea() * 0.5), [26 + Math.floor(alea() * 12), 44 + Math.floor(alea() * 8), 12]);
        });
        ctx.fillStyle = "rgba(60, 44, 30, 0.55)";
        for (let i = 0; i < 40; i++) {
            ctx.fillRect(64 + (alea() - 0.5) * 84, 64 + (alea() - 0.5) * 64, 1.2, 1.2);
        }
        return canvas;
    };

    // ---------------------------------------------------------------------
    //  LES MURS QUI SE SUIVENT
    // ---------------------------------------------------------------------
    //  Un mur posé à côté d'un autre forme avec lui UNE muraille : chaque case
    //  dessine un cœur de roche, puis un BRAS vers chaque case voisine murée,
    //  jusqu'au milieu de leur bord commun — même largeur, même hauteur, même
    //  teinte (celle du Géomancien) des deux côtés : les deux moitiés se
    //  rejoignent pile sur la frontière, dans n'importe quelle direction, et
    //  la perspective suit (la roche monte toujours vers le haut de l'écran).
    //  Vers une voisine CASSÉE (des gravats), un moignon déchiqueté et des
    //  éclats tombés. Rien ne sort de la case au sol.
    //
    //  `voisins` : les 6 directions, { dx, dy, etat } — dx, dy : le centre de
    //  la case voisine, en pixels du dessin ; etat : "mur", "casse" ou rien.
    const MUR_L = 128, MUR_H = 200, MUR_CX = 64, MUR_CY = 130;
    const HAUTEUR_MUR = 62;
    const dansPolygone = (pt, poly) => {
        let dedans = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
            const a = poly[i], b = poly[j];
            if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) dedans = !dedans;
        }
        return dedans;
    };
    // UN DESSUS DE PIERRE, CALCULÉ PIXEL PAR PIXEL : un bruit fractal (des
    // bosses de toutes tailles) éclairé du haut à gauche — le relief —, un
    // grain fin, et un réseau de fissures qui suit les creux du bruit. Le
    // motif se lit dans les coordonnées DU PLATEAU (ox, oy) : deux murs voisins
    // continuent la même pierre, sans raccord.
    function bruitValeur(graine) {
        const h = (x, y) => {
            let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(graine, 1274126177)) | 0;
            n = Math.imul(n ^ (n >>> 13), 1274126177);
            n ^= n >>> 16;
            return (n >>> 0) / 4294967296;
        };
        const lisse = (t) => t * t * (3 - 2 * t);
        return (x, y) => {
            const xi = Math.floor(x), yi = Math.floor(y), u = lisse(x - xi), v = lisse(y - yi);
            const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
            return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
        };
    }
    function hslVersRgb(h, s, l) {
        s /= 100; l /= 100;
        const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
        const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
        return [f(0) * 255, f(8) * 255, f(4) * 255];
    }
    function texturePierre(ctx, x0, y0, w, h, couleur, ox, oy, graine) {
        const L = Math.max(1, Math.ceil(w)), H = Math.max(1, Math.ceil(h));
        const tampon = document.createElement("canvas");
        tampon.width = L; tampon.height = H;
        const tctx = tampon.getContext("2d");
        const img = tctx.createImageData(L, H);
        const n1 = bruitValeur(graine >>> 0), n2 = bruitValeur((graine * 7 + 13) >>> 0), n3 = bruitValeur((graine * 31 + 5) >>> 0);
        const fbm = (x, y) => n1(x / 22, y / 22) * 0.5 + n1(x / 11 + 17, y / 11 + 3) * 0.25
                            + n1(x / 5.5 + 41, y / 5.5 + 29) * 0.15 + n1(x / 2.7 + 7, y / 2.7 + 61) * 0.1;
        const [r0, g0, b0] = hslVersRgb(couleur[0], couleur[2], couleur[1]);
        for (let j = 0; j < H; j++) {
            for (let i = 0; i < L; i++) {
                const X = ox + i, Y = oy + j;
                const f = fbm(X, Y);
                // Le relief : la pente vers la lumière (haut-gauche) éclaire.
                const pente = (fbm(X - 1, Y - 1) - fbm(X + 1, Y + 1)) * 3.2;
                // Les fissures : là où le second bruit passe par sa crête.
                const crete = 1 - Math.abs(2 * n2(X / 13, Y / 13) - 1);
                const fissure = crete > 0.95 ? (crete - 0.95) / 0.05 : 0;
                const fine = 1 - Math.abs(2 * n3(X / 6, Y / 6) - 1);
                const fissureFine = fine > 0.975 ? (fine - 0.975) / 0.025 * 0.5 : 0;
                const grain = (n3(X * 0.9, Y * 0.9) - 0.5) * 0.08;
                const k = 1 + (f - 0.5) * 0.3 + pente + grain - fissure * 0.38 - fissureFine * 0.25;
                const o = (j * L + i) * 4;
                img.data[o] = Math.max(0, Math.min(255, r0 * k));
                img.data[o + 1] = Math.max(0, Math.min(255, g0 * k));
                img.data[o + 2] = Math.max(0, Math.min(255, b0 * k));
                img.data[o + 3] = 255;
            }
        }
        tctx.putImageData(img, 0, 0);
        ctx.drawImage(tampon, x0, y0);
    }
    const graineDe = (texte) => { let h = 2166136261 >>> 0; for (const ch of String(texte || "")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; };

    // LA ROCHE MOINS LISSE : sur une face (le quadrilatère pied a→b, sommet
    // b→a), des taches claires et sombres, des fissures qui se ramifient, des
    // contours de blocs, des ébréchures au bord du haut et du grain.
    function detaillerFace(ctx, alea, ba, bb, hb, ha) {
        const point = (u, v) => ({ x: ba.x + (bb.x - ba.x) * u + (ha.x - ba.x) * v,
                                   y: ba.y + (bb.y - ba.y) * u + (ha.y - ba.y) * v });
        const largeurFace = Math.hypot(bb.x - ba.x, bb.y - ba.y), hauteurFace = Math.abs(ha.y - ba.y);
        if (largeurFace < 3 || hauteurFace < 4) return;
        // Les taches (la roche n'a pas une teinte égale).
        for (let k = 0; k < 4 + Math.floor(largeurFace / 6); k++) {
            const c = point(alea(), alea());
            ctx.fillStyle = alea() < 0.5 ? `rgba(255, 246, 228, ${0.06 + alea() * 0.08})` : `rgba(25, 18, 12, ${0.08 + alea() * 0.1})`;
            ctx.beginPath();
            ctx.ellipse(c.x, c.y, 2 + alea() * Math.min(9, largeurFace / 2), 1.5 + alea() * 5, (alea() - 0.5) * 0.8, 0, Math.PI * 2);
            ctx.fill();
        }
        // Les blocs : quelques joints en escalier, comme une roche fendue.
        ctx.strokeStyle = "rgba(30, 22, 16, 0.32)";
        ctx.lineWidth = 0.9;
        for (let k = 0; k < 2; k++) {
            let u = alea() * 0.8 + 0.1, v = 0.15 + alea() * 0.25;
            let p0 = point(u, v);
            ctx.beginPath(); ctx.moveTo(p0.x, p0.y);
            for (let e = 0; e < 3; e++) {
                v = Math.min(0.95, v + 0.15 + alea() * 0.2);
                u = Math.max(0, Math.min(1, u + (alea() - 0.5) * 0.35));
                const p1 = point(u, v); ctx.lineTo(p1.x, p1.y);
            }
            ctx.stroke();
        }
        // Des bosses en relief : un éclat de pierre qui dépasse, éclairé en
        // haut à gauche, ombré en bas à droite.
        for (let k = 0; k < 2 + Math.floor(largeurFace / 9); k++) {
            const c = point(0.1 + alea() * 0.8, 0.1 + alea() * 0.8), r = 2 + alea() * Math.min(5, largeurFace / 3);
            const n = 5 + Math.floor(alea() * 3), pts = [];
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2, rr = r * (0.7 + alea() * 0.5);
                pts.push({ x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr * 0.8 });
            }
            ctx.beginPath(); pts.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.closePath();
            ctx.fillStyle = `rgba(255, 246, 228, ${0.08 + alea() * 0.08})`;
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = "rgba(25, 18, 12, 0.4)";
            ctx.beginPath(); pts.slice(0, Math.ceil(n / 2) + 1).forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke();
            ctx.strokeStyle = "rgba(255, 248, 235, 0.3)";
            ctx.beginPath(); pts.slice(Math.ceil(n / 2)).concat([pts[0]]).forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.stroke();
        }
        // Les fissures : du haut vers le bas, en zigzag, avec une branche.
        ctx.strokeStyle = "rgba(22, 15, 10, 0.55)";
        ctx.lineWidth = 1.1;
        for (let k = 0; k < 1 + Math.floor(alea() * 2); k++) {
            let u = 0.15 + alea() * 0.7, v = 1;
            let pf = point(u, v);
            ctx.beginPath(); ctx.moveTo(pf.x, pf.y);
            const pas = 3 + Math.floor(alea() * 3);
            let branche = null;
            for (let e = 0; e < pas; e++) {
                v -= (0.5 + alea() * 0.4) / pas;
                u = Math.max(0.02, Math.min(0.98, u + (alea() - 0.5) * 0.18));
                pf = point(u, v); ctx.lineTo(pf.x, pf.y);
                if (!branche && alea() < 0.4) branche = { u, v };
            }
            ctx.stroke();
            if (branche) {
                const b0 = point(branche.u, branche.v), b1 = point(branche.u + (alea() - 0.5) * 0.3, branche.v - 0.15 - alea() * 0.15);
                ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y); ctx.stroke();
                ctx.lineWidth = 1.1;
            }
        }
        // Les ébréchures du bord du haut : de petits éclats clairs.
        for (let k = 0; k < 2 + Math.floor(alea() * 3); k++) {
            const u = alea(), c = point(u, 0.97), t = 2 + alea() * 3;
            ctx.fillStyle = "rgba(255, 248, 235, 0.22)";
            ctx.beginPath(); ctx.moveTo(c.x - t, c.y); ctx.lineTo(c.x + t, c.y); ctx.lineTo(c.x + (alea() - 0.5) * t, c.y + t * 1.2); ctx.closePath(); ctx.fill();
            ctx.fillStyle = "rgba(20, 14, 10, 0.3)";
            ctx.fillRect(c.x - 0.5, c.y + t * 1.2, 1.2, 1.2);
        }
        // Le grain.
        for (let k = 0; k < 10 + Math.floor(largeurFace / 2); k++) {
            const c = point(alea(), alea());
            ctx.fillStyle = alea() < 0.5 ? "rgba(255, 248, 235, 0.2)" : "rgba(20, 14, 10, 0.28)";
            ctx.fillRect(c.x, c.y, 1.3 + alea(), 1.3 + alea());
        }
    }

    // La case au sol, dans le dessin (bords plats, comme le plateau) : rien de
    // ce qu'on pose au pied ne doit en sortir.
    const RAYON_CASE = MUR_L / 1.9;
    function dansLaCase(x, y, cx, cy, marge = 3) {
        const R = RAYON_CASE - marge, dx = Math.abs(x - cx), dy = Math.abs(y - cy);
        return dx <= R && dy <= R * Math.sqrt(3) / 2 && Math.sqrt(3) * dx + dy <= Math.sqrt(3) * R;
    }

    // La terre soulevée au pied de la roche : de petites mottes brunes le
    // long d'un contour (la roche vient de percer le sol).
    function terreSoulevee(ctx, alea, pieds, cx, cy, libre = () => true) {
        pieds.forEach(([a, b]) => {
            const n = 2 + Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 7);
            for (let k = 0; k < n; k++) {
                const t = alea();
                const x = a.x + (b.x - a.x) * t + (alea() - 0.5) * 4, y = a.y + (b.y - a.y) * t + (alea() - 0.2) * 4;
                if (!dansLaCase(x, y, cx, cy) || !libre(x, y)) continue;
                const r = 2.5 + alea() * 4;
                ctx.fillStyle = `hsla(${26 + Math.floor(alea() * 10)}, ${28 + Math.floor(alea() * 12)}%, ${20 + Math.floor(alea() * 12)}%, ${0.55 + alea() * 0.3})`;
                ctx.beginPath(); ctx.ellipse(x, y, r * 1.4, r * 0.8, (alea() - 0.5) * 0.6, 0, Math.PI * 2); ctx.fill();
            }
        });
    }

    // Les gravats au pied : des cailloux le long d'un contour, sans sortir de
    // la case. PLEIN DE CAILLOUX, DE TOUTES TAILLES, À CHEVAL SUR LE PIED
    // (Nico : « à la base des murs, plein de cailloux de différentes tailles
    // pour masquer la ligne des murs au sol ») : quelques gros blocs, des
    // moyens, une poussière de petits ; une partie mord sur la roche, le reste
    // roule un peu devant — la jonction mur-sol ne se lit plus comme un trait.
    function gravatsAuPied(ctx, alea, pieds, cx, cy, roche, libre = () => true) {
        const cailloux = [];
        const taille = () => {
            const u = alea();
            return u < 0.12 ? 4.5 + alea() * 3        // un gros bloc de temps en temps
                 : u < 0.45 ? 2.6 + alea() * 1.9     // des moyens
                 : 1.1 + alea() * 1.5;               // et beaucoup de petits
        };
        pieds.forEach(([a, b, nx, ny]) => {
            const longueur = Math.hypot(b.x - a.x, b.y - a.y);
            const n = 5 + Math.floor(alea() * 3) + Math.floor(longueur / 5);
            for (let k = 0; k < n; k++) {
                const t = alea(), r = taille();
                // À cheval sur la ligne du pied : de -r (sur la roche) à +7.
                const ecart = -r * 0.6 + alea() * (7 + r * 0.6);
                const x = a.x + (b.x - a.x) * t + nx * ecart, y = a.y + (b.y - a.y) * t + ny * ecart;
                if (!dansLaCase(x, y, cx, cy, r + 1) || !libre(x, y)) continue;
                cailloux.push({ x, y, r });
            }
        });
        cailloux.sort((u, v) => u.y - v.y).forEach(c => {
            masse(ctx, alea, c.x, c.y, c.r, c.r * (0.5 + alea() * 0.7),
                  [roche[0] + Math.floor((alea() - 0.5) * 8), roche[1] + Math.floor((alea() - 0.5) * 10), roche[2]]);
        });
        return cailloux.length;
    }

    window.ASSOMBRIR_MUR_TERRE = 11;
    window.dessinerMurTerre = function (graine, voisins, graineTeinte, origine) {
        const liens = (voisins || []).filter(v => v && (v.etat === "mur" || v.etat === "casse"));
        const canvas = document.createElement("canvas");
        canvas.width = MUR_L; canvas.height = MUR_H;
        const ctx = canvas.getContext("2d");
        // Seul, sans voisin : le pilier d'avant, posé au même pied.
        if (liens.length === 0) {
            ctx.drawImage(window.dessinerPilierTerre(graine), 0, MUR_CY - PIED_Y);
            return canvas;
        }
        const alea = hasard(graine);
        const aleaTeinte = hasard(graineTeinte || graine);
        const roche = [26 + Math.floor(aleaTeinte() * 16), 44 + Math.floor(aleaTeinte() * 8), 8 + Math.floor(aleaTeinte() * 9)];
        // AUSSI FONCÉ QU'UN PILIER SEUL (Nico : « les murs sont moins foncés
        // que les piliers ») : la même roche donnait un mur nettement plus
        // clair (115 de clarté moyenne contre 91, mesuré sur douze tirages) —
        // son dessus de pierre, large et plat, l'emporte. La roche du mur est
        // donc descendue d'autant (geomancien.mjs mesure l'écart).
        roche[1] -= window.ASSOMBRIR_MUR_TERRE;
        const rayonInt = Math.min(...(voisins || []).filter(Boolean).map(v => Math.hypot(v.dx, v.dy) / 2)) || 56;
        const largeur = rayonInt * 0.42;
        const pieces = [];
        // Le cœur.
        const nbMurs = liens.filter(v => v.etat === "mur").length;
        const nCoeur = 10;
        const depart = alea() * Math.PI * 2;
        const coeur = [];
        for (let i = 0; i < nCoeur; i++) {
            const a = depart + (i / nCoeur) * Math.PI * 2;
            // Un carrefour (2 bras ou plus) a un cœur plus large : pas de creux
            // entre ses bras.
            const rr = rayonInt * (nbMurs >= 2 ? 0.72 + alea() * 0.1 : 0.58 + alea() * 0.16);
            coeur.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, h: HAUTEUR_MUR + (alea() - 0.4) * 18 });
        }
        pieces.push({ pts: coeur, joints: new Set() });
        const debris = [];
        liens.forEach(v => {
            const mx = v.dx / 2, my = v.dy / 2, d = Math.hypot(mx, my);
            const ux = mx / d, uy = my / d, px = -uy, py = ux;
            const P = (t, s, h) => ({ x: ux * t + px * s, y: uy * t + py * s, h });
            if (v.etat === "mur") {
                // Un bras jusqu'au bord : ses deux coins sur le bord sont
                // exacts (la voisine a les mêmes), le reste un peu brut.
                // (Quatre pixels de recouvrement sur le joint, sous la voisine : deux images
                // bord à bord laisseraient passer un fil d'herbe.)
                const bout = d + 4;
                // Des flancs bosselés (vers l'intérieur seulement) et une crête
                // inégale — le joint, lui, reste exact.
                const flanc = (signe) => [0.2, 0.38, 0.56, 0.74].map(t =>
                    P(d * (t + (alea() - 0.5) * 0.06), signe * largeur * (0.84 + alea() * 0.16), HAUTEUR_MUR + (alea() - 0.55) * 16));
                const pts = [P(0, largeur, HAUTEUR_MUR), ...flanc(1), P(bout, largeur, HAUTEUR_MUR), P(bout, -largeur, HAUTEUR_MUR),
                             ...flanc(-1).reverse(), P(0, -largeur, HAUTEUR_MUR)];
                pieces.push({ pts, joints: new Set([5]) });       // l'arête 5→6 est le joint
            } else {
                // Un moignon cassé : la roche s'arrête net, en dents, plus bas.
                const L = d * (0.5 + alea() * 0.1);
                const pts = [P(0, largeur, HAUTEUR_MUR), P(L * (0.8 + alea() * 0.2), largeur * 0.95, HAUTEUR_MUR * (0.55 + alea() * 0.3))];
                for (let k = 1; k <= 3; k++) {
                    const s2 = largeur * (1 - k / 2);
                    pts.push(P(L * (0.75 + alea() * 0.35), s2 * 0.9, HAUTEUR_MUR * (0.35 + alea() * 0.4)));
                }
                pts.push(P(L * (0.8 + alea() * 0.2), -largeur * 0.95, HAUTEUR_MUR * (0.55 + alea() * 0.3)), P(0, -largeur, HAUTEUR_MUR));
                pieces.push({ pts, joints: new Set(), casse: true });
                const n = 3 + Math.floor(alea() * 3);
                for (let k = 0; k < n; k++) {
                    const t = d * (0.76 + alea() * 0.14), s2 = (alea() - 0.5) * largeur * 1.4;
                    debris.push({ x: ux * t + px * s2, y: uy * t + py * s2, r: 2.5 + alea() * 3 });
                }
            }
        });
        // LES COINS PARTAGÉS : deux voisines murées côte à côte (qui se
        // touchent aussi entre elles) forment un triangle de murs ; chacun
        // remplit son coin jusqu'au sommet commun des trois cases, sinon un
        // creux reste au milieu.
        const parAngle = (voisins || []).filter(Boolean).map(v => ({ ...v, a: Math.atan2(v.dy, v.dx) }))
            .sort((x, y) => x.a - y.a);
        parAngle.forEach((v, i) => {
            const w = parAngle[(i + 1) % parAngle.length];
            if (!w || v === w || v.etat !== "mur" || w.etat !== "mur") return;
            let ecart = w.a - v.a; if (ecart < 0) ecart += Math.PI * 2;
            if (ecart > Math.PI / 2) return;                      // pas deux voisines contiguës
            const m1 = { x: v.dx / 2, y: v.dy / 2 }, m2 = { x: w.dx / 2, y: w.dy / 2 };
            const sx = m1.x + m2.x, sy = m1.y + m2.y, ns = Math.hypot(sx, sy) || 1;
            const rs = Math.hypot(m1.x, m1.y) / Math.cos(Math.PI / 6) + 4;
            const sommet = { x: sx / ns * rs, y: sy / ns * rs, h: HAUTEUR_MUR };
            pieces.push({ pts: [{ x: 0, y: 0, h: HAUTEUR_MUR }, { ...m1, h: HAUTEUR_MUR }, sommet, { ...m2, h: HAUTEUR_MUR }],
                          joints: new Set([1, 2]) });
        });
        const vers = (p) => ({ x: MUR_CX + p.x, y: MUR_CY + p.y });
        const haut = (p) => ({ x: MUR_CX + p.x, y: MUR_CY + p.y - p.h });
        // PAS D'OMBRE PORTÉE : la roche sort du sol. À son pied, de la terre
        // soulevée (le contour de chaque pièce, hors joints).
        const contours = [];
        pieces.forEach(pc => {
            const n = pc.pts.length;
            const gx = pc.pts.reduce((t, p) => t + p.x, 0) / n, gy = pc.pts.reduce((t, p) => t + p.y, 0) / n;
            for (let i = 0; i < n; i++) {
                if (pc.joints.has(i)) continue;
                const a = pc.pts[i], b = pc.pts[(i + 1) % n];
                const ex = b.x - a.x, ey = b.y - a.y, l2 = Math.hypot(ex, ey) || 1;
                let nx = ey / l2, ny = -ex / l2;
                if (nx * ((a.x + b.x) / 2 - gx) + ny * ((a.y + b.y) / 2 - gy) < 0) { nx = -nx; ny = -ny; }
                const mx = (a.x + b.x) / 2 + nx, my = (a.y + b.y) / 2 + ny;
                if (pieces.some(autre => autre !== pc && dansPolygone({ x: mx, y: my }, autre.pts))) continue;
                contours.push([vers(a), vers(b), nx, ny]);
            }
        });
        // Ni terre ni gravats du côté d'une voisine murée : sa roche passe
        // devant, des cailloux y ressortiraient par-dessus.
        const versMurs = liens.filter(v => v.etat === "mur").map(v => {
            const d = Math.hypot(v.dx, v.dy) / 2; return { ux: v.dx / 2 / d, uy: v.dy / 2 / d, d };
        });
        const libre = (x, y) => versMurs.every(m => ((x - MUR_CX) * m.ux + (y - MUR_CY) * m.uy) < m.d * 0.3);
        terreSoulevee(ctx, alea, contours, MUR_CX, MUR_CY, libre);
        // LE VOLUME D'ABORD, en roche sombre : chaque arête monte de son pied à
        // son sommet. Les angles rentrants entre le cœur et ses bras ne
        // laissent plus voir l'herbe — juste une ombre de roche.
        ctx.fillStyle = teinte([roche[0], roche[1] - 22], roche[2] + 4);
        pieces.forEach(pc => {
            const n = pc.pts.length;
            for (let i = 0; i < n; i++) {
                if (pc.joints.has(i)) continue;
                const a = pc.pts[i], b = pc.pts[(i + 1) % n];
                const ba = vers(a), bb = vers(b), hb = haut(b), ha = haut(a);
                ctx.beginPath();
                ctx.moveTo(ba.x, ba.y); ctx.lineTo(bb.x, bb.y); ctx.lineTo(hb.x, hb.y); ctx.lineTo(ha.x, ha.y);
                ctx.closePath();
                ctx.fill();
            }
        });
        // Les faces de devant (tournées vers le bas de l'écran), d'arrière
        // en avant ; ni les joints, ni les arêtes cachées dans une autre pièce.
        const faces = [];
        pieces.forEach((pc, ip) => {
            const n = pc.pts.length;
            const gx = pc.pts.reduce((t, p) => t + p.x, 0) / n, gy = pc.pts.reduce((t, p) => t + p.y, 0) / n;
            for (let i = 0; i < n; i++) {
                if (pc.joints.has(i)) continue;
                const a = pc.pts[i], b = pc.pts[(i + 1) % n];
                const ex = b.x - a.x, ey = b.y - a.y, longueur = Math.hypot(ex, ey) || 1;
                let nx = ey / longueur, ny = -ex / longueur;
                const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                if (nx * (mx - gx) + ny * (my - gy) < 0) { nx = -nx; ny = -ny; }
                const cachee = pieces.some((autre, j) => j !== ip && dansPolygone({ x: mx + nx * 0.8, y: my + ny * 0.8 }, autre.pts));
                pc.cachees = pc.cachees || new Set();
                if (cachee) pc.cachees.add(i);
                if (ny <= 0.05 || cachee) continue;
                faces.push({ a, b, y: Math.max(a.y, b.y), lumiere: -0.7 * nx - 0.7 * ny + 0.55 + (alea() - 0.5) * 0.6 });
            }
        });
        faces.sort((f, g) => f.y - g.y).forEach(f => {
            const ba = vers(f.a), bb = vers(f.b), hb = haut(f.b), ha = haut(f.a);
            const clarte = roche[1] - 6 + Math.max(-0.5, Math.min(1, f.lumiere)) * 12;
            ctx.beginPath();
            ctx.moveTo(ba.x, ba.y); ctx.lineTo(bb.x, bb.y); ctx.lineTo(hb.x, hb.y); ctx.lineTo(ha.x, ha.y);
            ctx.closePath();
            const g = ctx.createLinearGradient(0, MUR_CY - HAUTEUR_MUR, 0, MUR_CY + rayonInt);
            g.addColorStop(0, teinte([roche[0], clarte + 8], roche[2]));
            g.addColorStop(1, teinte([roche[0], clarte - 9], roche[2] + 4));
            ctx.fillStyle = g;
            ctx.fill();
            // Une arête de pied marquée, les arêtes montantes à peine.
            ctx.strokeStyle = "rgba(30, 24, 18, 0.5)";
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(ba.x, ba.y); ctx.lineTo(bb.x, bb.y); ctx.stroke();
            ctx.strokeStyle = "rgba(30, 24, 18, 0.16)";
            ctx.beginPath(); ctx.moveTo(ba.x, ba.y); ctx.lineTo(ha.x, ha.y); ctx.stroke();
            // Strates, taches, blocs, fissures, ébréchures, grain — dans la
            // face seulement (on retrace son contour : le chemin courant est
            // celui du dernier trait).
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(ba.x, ba.y); ctx.lineTo(bb.x, bb.y); ctx.lineTo(hb.x, hb.y); ctx.lineTo(ha.x, ha.y);
            ctx.closePath();
            ctx.clip();
            for (let k = 1; k <= 3; k++) {
                const t = k / 4 + (alea() - 0.5) * 0.06;
                const y0 = ba.y + (ha.y - ba.y) * t, y1 = bb.y + (hb.y - bb.y) * t;
                ctx.strokeStyle = "rgba(35, 28, 22, 0.26)";
                ctx.beginPath();
                ctx.moveTo(ba.x, y0 + (alea() - 0.5) * 2);
                ctx.lineTo((ba.x + bb.x) / 2, (y0 + y1) / 2 + (alea() - 0.5) * 3);
                ctx.lineTo(bb.x, y1 + (alea() - 0.5) * 2);
                ctx.stroke();
            }
            detaillerFace(ctx, alea, ba, bb, hb, ha);
            ctx.restore();
        });
        // Les dessus, d'une seule teinte (celle de la voisine aussi).
        const dessus = teinte([roche[0], roche[1] + 9], roche[2]);
        pieces.forEach(pc => {
            ctx.beginPath();
            pc.pts.forEach((p, k) => { const t = haut(p); k ? ctx.lineTo(t.x, t.y) : ctx.moveTo(t.x, t.y); });
            ctx.closePath();
            ctx.fillStyle = pc.casse ? teinte([roche[0], roche[1] + 3], roche[2]) : dessus;
            ctx.fill();
        });
        // Le contour du dessus, sauf les joints et les arêtes fondues.
        ctx.strokeStyle = "rgba(30, 22, 16, 0.55)";
        ctx.lineWidth = 1.1;
        pieces.forEach(pc => {
            const n = pc.pts.length;
            for (let i = 0; i < n; i++) {
                if (pc.joints.has(i) || (pc.cachees && pc.cachees.has(i))) continue;
                const a = haut(pc.pts[i]), b = haut(pc.pts[(i + 1) % n]);
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            }
        });
        // Grain et fissures du dessus — dans l'union des dessus. Tous les
        // contours tournent dans le même sens : sinon, là où le cœur et un bras
        // se recouvrent, leurs sens opposés s'annulent et la zone sort du découpage.
        ctx.save();
        ctx.beginPath();
        pieces.forEach(pc => {
            const t = pc.pts.map(haut);
            const aire = t.reduce((acc, p, i) => { const q = t[(i + 1) % t.length]; return acc + p.x * q.y - q.x * p.y; }, 0);
            (aire < 0 ? t.slice().reverse() : t).forEach((p, k) => k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
            ctx.closePath();
        });
        ctx.clip();
        // La pierre du dessus, dans les coordonnées du plateau : la même
        // d'une case à sa voisine.
        const T = Math.ceil(rayonInt * 2.6);
        const gx = MUR_CX - T / 2, gy = MUR_CY - HAUTEUR_MUR - T / 2;
        texturePierre(ctx, gx, gy, T, T, [roche[0], roche[1] + 9, roche[2]],
                      Math.round((origine ? origine.x : 0) + gx - MUR_CX), Math.round((origine ? origine.y : 0) + gy - MUR_CY + HAUTEUR_MUR),
                      graineDe(graineTeinte || graine));
        ctx.restore();
        ctx.strokeStyle = "rgba(30, 22, 16, 0.5)";
        ctx.lineWidth = 1;
        pieces.forEach(pc => {
            const n = pc.pts.length;
            for (let i = 0; i < n; i++) {
                if (pc.joints.has(i) || (pc.cachees && pc.cachees.has(i))) continue;
                const a = haut(pc.pts[i]), b = haut(pc.pts[(i + 1) % n]);
                ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            }
        });
        // DES CAILLOUX SUR LE DESSUS, semés dans chaque pièce (le cœur et ses
        // bras), à l'écart de ses bords.
        const surLeDessus = [];
        pieces.forEach(pc => {
            const n = pc.pts.length;
            const g = { x: pc.pts.reduce((t, p) => t + p.x, 0) / n, y: pc.pts.reduce((t, p) => t + p.y, 0) / n };
            const h = pc.pts.reduce((t, p) => t + (p.h || 0), 0) / n;
            const nb = 3 + Math.floor(alea() * 4);
            for (let k = 0; k < nb; k++) {
                const v = pc.pts[Math.floor(alea() * n)], w = pc.pts[Math.floor(alea() * n)];
                const t = 0.1 + alea() * 0.55, u = alea();
                const x = g.x + ((v.x * u + w.x * (1 - u)) - g.x) * t, y = g.y + ((v.y * u + w.y * (1 - u)) - g.y) * t;
                surLeDessus.push({ x: MUR_CX + x, y: MUR_CY + y - h, r: tailleCaillouDessus(alea) });
            }
        });
        surLeDessus.sort((u, v) => u.y - v.y).forEach(c => masse(ctx, alea, c.x, c.y, c.r, c.r * (0.4 + alea() * 0.5),
            [roche[0] + Math.floor((alea() - 0.5) * 8), roche[1] + 6 + Math.floor((alea() - 0.5) * 12), roche[2]]));
        canvas.nbCaillouxDessus = surLeDessus.length;
        // Des gravats au pied (devant : ceux de derrière seraient cachés).
        // TOUT LE LONG DU PIED, jonctions comprises : le filtre de la terre
        // (libre, 30 % du bras) laissait nu le pied du mur entre deux cases —
        // la ligne mur-sol s'y lisait comme un trait. Les cailloux vont
        // jusqu'à 90 % du bras ; au-delà, c'est la case voisine qui en pose.
        const libreCailloux = (x, y) => versMurs.every(m => ((x - MUR_CX) * m.ux + (y - MUR_CY) * m.uy) < m.d * 0.9);
        // (Le compte reste sur le canvas : le banc le lit.)
        canvas.nbCailloux = gravatsAuPied(ctx, alea, contours.filter(c => c[3] > 0.05), MUR_CX, MUR_CY, roche, libreCailloux);
        // Les éclats tombés au pied d'un bout cassé.
        debris.sort((a, b) => a.y - b.y).forEach(e => {
            const b = vers(e);
            masse(ctx, alea, b.x, b.y, e.r, e.r * (0.6 + alea() * 0.6), [roche[0], roche[1] + 2, roche[2]]);
        });
        return canvas;
    };

    // Les 6 voisines d'une case de mur, vues du dessin (pixels du canvas).
    const DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    window.voisinsDuMur = function (q, r, echelle) {
        const ici = window.PLATEAU_VTT.hexToPixel(q, r);
        return DIRECTIONS.map(([dq, dr]) => {
            const la = window.PLATEAU_VTT.hexToPixel(q + dq, r + dr);
            const etat = window.murEnCase(q + dq, r + dr) ? "mur"
                : ((window.GRAVATS_TERRE || {})[cleCase(q + dq, r + dr)] ? "casse" : null);
            return { dx: (la.x - ici.x) * echelle, dy: (la.y - ici.y) * echelle, etat };
        });
    };

    // Les dessins, gardés : un canvas par mur et par voisinage (un mur qui
    // gagne ou perd une voisine se redessine), une image par tas de gravats.
    const CACHE = new Map();
    const tuile = (graine, voisins, graineTeinte, origine) => {
        const signature = (voisins || []).map(v => (v.etat || "-")[0] + Math.round(v.dx) + "," + Math.round(v.dy)).join("|");
        const cle = "mur|" + graine + "|" + signature + "|" + (graineTeinte || "") + "|" + (origine ? Math.round(origine.x) + "," + Math.round(origine.y) : "");
        if (!CACHE.has(cle)) {
            try { CACHE.set(cle, window.dessinerMurTerre(graine, voisins, graineTeinte, origine)); }
            catch (e) { CACHE.set(cle, null); }
        }
        return CACHE.get(cle);
    };
    const image = (genre, graine) => {
        const cle = genre + "|" + graine;
        if (!CACHE.has(cle)) {
            try { CACHE.set(cle, window.dessinerGravatsTerre(graine).toDataURL("image/png")); }
            catch (e) { CACHE.set(cle, ""); }
        }
        return CACHE.get(cle);
    };

    // ---------------------------------------------------------------------
    //  LE CALQUE : sous les pions, au-dessus des nappes, dans le plateau
    //  transformé (il suit le zoom et le défilement tout seul).
    // ---------------------------------------------------------------------
    window.appliquerMursTerre = function () {
        const plateau = document.getElementById("transform-plateau");
        if (!plateau || !window.PLATEAU_VTT) return;
        let calque = document.getElementById("calque-murs-terre");
        if (!calque) {
            calque = document.createElement("div");
            calque.id = "calque-murs-terre";
            plateau.appendChild(calque);
        }
        // LES MURS AU-DESSUS DES PIONS : leur propre calque (#transform-murs,
        // zoomé comme le plateau, sous le brouillard) — la roche cache qui se
        // tient derrière elle. Les gravats, eux, restent au sol, sous les pions.
        const zoneHaute = document.getElementById("transform-murs") || plateau;
        let haut = document.getElementById("calque-murs-terre-haut");
        if (!haut) {
            haut = document.createElement("div");
            haut.id = "calque-murs-terre-haut";
            zoneHaute.appendChild(haut);
        }
        const R = window.PLATEAU_VTT.hexSize || 40;
        const morceaux = [];
        const sol = [];
        const vise = window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif ? window.ETAT_CIBLAGE.cibleUnique : null;
        Object.keys(window.GRAVATS_TERRE || {}).sort().forEach(cle => {
            const [q, r] = cle.split("_").map(Number);
            if (window.murEnCase(q, r)) return;
            const px = window.PLATEAU_VTT.hexToPixel(q, r);
            const t = R * 1.8;
            const src = image("gravats", cle);
            if (src) sol.push(`<img class="gravats-terre" alt="" src="${src}" style="left:${px.x - t / 2}px;top:${px.y - t / 2}px;width:${t}px;height:${t}px">`);
        });
        // TOUS LES MURS DANS UN SEUL CANVAS, du haut de l'écran vers le bas (la
        // roche du devant passe devant). Une image par mur laissait un fil
        // sombre à chaque raccord : le bord transparent d'une image agrandie
        // fonce un peu. Composés ensemble, les morceaux se soudent sans couture.
        const l = R * 1.9, h = l * MUR_H / MUR_L, echelle = MUR_L / l;
        const yEcran = (m) => window.PLATEAU_VTT.hexToPixel(m.q, m.r).y;
        const murs = Object.values(window.MURS_TERRE || {}).sort((a, b) => (yEcran(a) - yEcran(b)) || (a.q - b.q));
        const projets = (window.POSE_MURS ? window.POSE_MURS.cases : []).map((c, i) => ({ ...c, projet: true, id: "projet_" + i + "_" + c.q + "_" + c.r }));
        const tous = [...murs, ...projets].map(m => {
            const px = window.PLATEAU_VTT.hexToPixel(m.q, m.r);
            const dessin = m.projet ? tuile(m.id, null, null)
                : tuile(m.id, window.voisinsDuMur(m.q, m.r, echelle), m.idLanceur, { x: px.x * echelle, y: px.y * echelle });
            return { m, px, x0: px.x - l / 2, y0: px.y - h * MUR_CY / MUR_H, dessin };
        }).filter(t => t.dessin);
        if (tous.length > 0) {
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
            // Le mur visé, entouré de rouge par-dessus.
            tous.filter(t => vise && t.m.id === vise).forEach(t => {
                ctx.save();
                ctx.shadowColor = "#ff4c4c";
                ctx.shadowBlur = 14;
                ctx.drawImage(t.dessin, (t.x0 - minX) * echelle, (t.y0 - minY) * echelle);
                ctx.restore();
            });
            ensemble.className = "murs-terre-ensemble";
            ensemble.style.cssText = `position:absolute;left:${minX}px;top:${minY}px;width:${maxX - minX}px;height:${maxY - minY}px;pointer-events:none`;
            morceaux.push(ensemble);
        }
        // Une balise par mur (son nom, ses PV ; le visé), et sa jauge s'il est entamé.
        murs.forEach(m => {
            const px = window.PLATEAU_VTT.hexToPixel(m.q, m.r);
            const blesse = Number(m.pv) < Number(m.pvMax);
            if (blesse) {
                morceaux.push(`<span class="mur-terre-jauge" style="left:${px.x - R * 0.6}px;top:${px.y + R * 0.55}px;width:${R * 1.2}px">
                     <span style="width:${Math.max(0, Math.min(100, 100 * Number(m.pv) / Number(m.pvMax)))}%"></span></span>`);
            }
            morceaux.push(`<span class="mur-terre${vise === m.id ? " mur-terre-vise" : ""}" data-mur="${m.id}" title="Mur de terre : ${m.pv} / ${m.pvMax} PV"
                style="left:${px.x - R * 0.7}px;top:${px.y - R * 0.7}px;width:${R * 1.4}px;height:${R * 1.4}px"></span>`);
        });
        projets.forEach(() => morceaux.push(`<span class="mur-terre-projet"></span>`));
        calque.innerHTML = sol.join("");
        haut.innerHTML = morceaux.filter(x => typeof x === "string").join("");
        const ensemble = morceaux.find(x => typeof x !== "string");
        if (ensemble) haut.insertBefore(ensemble, haut.firstChild);
    };

    // ---------------------------------------------------------------------
    //  LA POSE DES MURS (la technique Mur de terre)
    // ---------------------------------------------------------------------
    const COUT_PAR_MUR = 20, PORTEE = 5;
    const distance = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

    function energieDe(idLanceur) {
        const demande = window.regimeDemande;
        const etat = demande && typeof demande.etat === "function" ? demande.etat() : null;
        const c = etat && etat.combattants && etat.combattants[idLanceur];
        if (c) return Number(c.fatigue) || 0;
        const p = persoDe(idLanceur) || {};
        return parseInt(p.fatigueActuelle) || 0;
    }

    // Une case où lever un mur : à 5 cases au plus, en vue, ni mur ni trou,
    // pas la sienne. (Quelqu'un dessus : il sera repoussé.)
    window.casePourMurTerre = function (idLanceur, hex) {
        const ici = (window.TOKENS_VTT_DATA || {})[idLanceur];
        if (!ici || !hex) return "Case invalide";
        const d = distance(ici, hex);
        if (d < 1) return "Pas sur vous";
        if (d > PORTEE) return "Hors de portée";
        const e = window.etatCaseCombat(hex.q, hex.r);
        if (e.isBlocked || e.isDeleted) return "Case impraticable";
        if (typeof window.verifierLigneDeVueVTT === "function" && !window.verifierLigneDeVueVTT(ici, hex)) return "Vue obstruée";
        return null;
    };

    window.POSE_MURS = null;
    function rendreBandeau() {
        const pose = window.POSE_MURS;
        const bandeau = document.getElementById("bandeau-pose-murs");
        if (!pose || !bandeau) return;
        const n = pose.cases.length, cout = n * COUT_PAR_MUR, energie = energieDe(pose.idLanceur);
        bandeau.querySelector(".pose-murs-compte").textContent =
            `${n} mur${n > 1 ? "s" : ""} · ${cout} ⚡ / ${energie} ⚡`;
        const ok = bandeau.querySelector(".pose-murs-valider");
        ok.disabled = n === 0 || cout > energie;
        window.appliquerMursTerre();
    }
    window.toucherCaseMurTerre = function (hex) {
        const pose = window.POSE_MURS;
        if (!pose || !hex) return;
        const i = pose.cases.findIndex(c => c.q === hex.q && c.r === hex.r);
        if (i >= 0) {
            pose.cases.splice(i, 1);
        } else {
            const raison = window.casePourMurTerre(pose.idLanceur, hex);
            if (raison) {
                if (typeof window.afficherMessageFlottantHex === "function") window.afficherMessageFlottantHex(hex.q, hex.r, raison, "#aaaaaa");
                return;
            }
            if ((pose.cases.length + 1) * COUT_PAR_MUR > energieDe(pose.idLanceur)) {
                if (typeof window.afficherMessageFlottantHex === "function") window.afficherMessageFlottantHex(hex.q, hex.r, "Plus assez d'énergie", "#ff8a65");
                return;
            }
            pose.cases.push({ q: hex.q, r: hex.r });
        }
        if (typeof window.jouerSonClic === "function") window.jouerSonClic();
        rendreBandeau();
    };
    window.fermerPoseMursTerre = function () {
        const pose = window.POSE_MURS;
        if (pose && pose.nettoyer) try { pose.nettoyer(); } catch (e) {}
        window.POSE_MURS = null;
        const bandeau = document.getElementById("bandeau-pose-murs");
        if (bandeau) bandeau.remove();
        window.appliquerMursTerre();
    };
    window.validerPoseMursTerre = function () {
        const pose = window.POSE_MURS;
        if (!pose || pose.cases.length === 0) return;
        if (pose.cases.length * COUT_PAR_MUR > energieDe(pose.idLanceur)) return;
        const cases = pose.cases.map(c => ({ q: c.q, r: c.r }));
        const idLanceur = pose.idLanceur;
        window.fermerPoseMursTerre();
        if (typeof window.jouerSonClic === "function") window.jouerSonClic();
        const demande = window.regimeDemande;
        if (demande && typeof demande.techniqueClasse === "function") {
            demande.techniqueClasse(idLanceur, "CLASSE_MUR_DE_TERRE", null, undefined, { murs: cases });
        }
    };
    window.ouvrirPoseMursTerre = function (idLanceur) {
        window.fermerPoseMursTerre();
        window.POSE_MURS = { idLanceur, cases: [], nettoyer: null };
        const bandeau = document.createElement("div");
        bandeau.id = "bandeau-pose-murs";
        bandeau.className = "bandeau-pose-murs";
        bandeau.innerHTML = `
            <div class="pose-murs-titre">🪨 Mur de terre</div>
            <div class="pose-murs-texte">Touchez les cases où lever un mur (à ${PORTEE} cases, en vue) — ${COUT_PAR_MUR} ⚡ par mur. Touchez-en un de nouveau pour l'enlever.</div>
            <div class="pose-murs-compte"></div>
            <div class="pose-murs-boutons">
                <button type="button" class="pose-murs-valider" onclick="window.validerPoseMursTerre()">Lever les murs</button>
                <button type="button" class="pose-murs-annuler" onclick="window.fermerPoseMursTerre()">Annuler</button>
            </div>`;
        document.body.appendChild(bandeau);
        if (typeof window.armerClicFrancPlateau === "function") {
            window.POSE_MURS.nettoyer = window.armerClicFrancPlateau((x, y) => {
                if (!window.PLATEAU_VTT) return;
                const hex = window.PLATEAU_VTT.pixelToHex((x - window.VTT_POS_X) / window.VTT_SCALE,
                                                         (y - window.VTT_POS_Y) / window.VTT_SCALE);
                window.toucherCaseMurTerre(hex);
            });
        }
        rendreBandeau();
    };
})();
