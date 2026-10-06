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
        ombre(ctx, 70, PIED_Y + 4, 54, 24, 0.45);
        const masses = [];
        const nb = 2 + Math.floor(alea() * 2);
        for (let i = 0; i < nb; i++) {
            const a = alea() * Math.PI * 2, d = 6 + alea() * 12;
            masses.push({ x: 64 + Math.cos(a) * d, y: PIED_Y - 4 + Math.sin(a) * d * 0.5,
                          rayon: 18 + alea() * 9, hauteur: 56 + alea() * 34 });
        }
        // Le cœur du pilier, le plus large, au centre.
        masses.push({ x: 64, y: PIED_Y, rayon: 34 + alea() * 4, hauteur: 50 + alea() * 16 });
        masses.sort((a, b) => a.y - b.y).forEach(m => masse(ctx, alea, m.x, m.y, m.rayon, m.hauteur, roche));
        // Parfois des cailloux au pied.
        if (alea() < 0.7) {
            const n = 2 + Math.floor(alea() * 3);
            for (let i = 0; i < n; i++) {
                const a = 0.15 * Math.PI + alea() * 0.7 * Math.PI;
                const x = 64 + Math.cos(a) * (40 + alea() * 12), y = PIED_Y + Math.sin(a) * (18 + alea() * 8);
                const r = 4 + alea() * 4;
                ombre(ctx, x + 2, y + 2, r * 1.6, r * 0.8, 0.35);
                masse(ctx, alea, x, y, r, r * 0.9, [roche[0], roche[1] + 2, roche[2]]);
            }
        }
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
    window.dessinerMurTerre = function (graine, voisins, graineTeinte) {
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
        const rayonInt = Math.min(...(voisins || []).filter(Boolean).map(v => Math.hypot(v.dx, v.dy) / 2)) || 56;
        const largeur = rayonInt * 0.42;
        const pieces = [];
        // Le cœur.
        const nbMurs = liens.filter(v => v.etat === "mur").length;
        const nCoeur = 7;
        const depart = alea() * Math.PI * 2;
        const coeur = [];
        for (let i = 0; i < nCoeur; i++) {
            const a = depart + (i / nCoeur) * Math.PI * 2;
            // Un carrefour (2 bras ou plus) a un cœur plus large : pas de creux
            // entre ses bras.
            const rr = rayonInt * (nbMurs >= 2 ? 0.74 + alea() * 0.08 : 0.62 + alea() * 0.1);
            coeur.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, h: HAUTEUR_MUR + (alea() - 0.3) * 7 });
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
                const pts = [P(0, largeur, HAUTEUR_MUR), P(d * 0.55, largeur * (0.94 + alea() * 0.1), HAUTEUR_MUR + (alea() - 0.5) * 3),
                             P(bout, largeur, HAUTEUR_MUR), P(bout, -largeur, HAUTEUR_MUR),
                             P(d * 0.55, -largeur * (0.94 + alea() * 0.1), HAUTEUR_MUR + (alea() - 0.5) * 3), P(0, -largeur, HAUTEUR_MUR)];
                pieces.push({ pts, joints: new Set([2]) });       // l'arête 2→3 est le joint
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
        // L'ombre, sous la roche seulement.
        ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
        pieces.forEach(pc => {
            ctx.beginPath();
            pc.pts.forEach((p, k) => { const b = vers(p); k ? ctx.lineTo(b.x + 2, b.y + 2) : ctx.moveTo(b.x + 2, b.y + 2); });
            ctx.closePath();
            ctx.fill();
        });
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
                faces.push({ a, b, y: Math.max(a.y, b.y), lumiere: -0.7 * nx - 0.7 * ny + 0.55 });
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
            // Strates et éclats sur la face.
            ctx.save();
            ctx.clip();
            for (let k = 1; k <= 3; k++) {
                const t = k / 4 + (alea() - 0.5) * 0.06;
                const y0 = ba.y + (ha.y - ba.y) * t, y1 = bb.y + (hb.y - bb.y) * t;
                ctx.strokeStyle = "rgba(35, 28, 22, 0.3)";
                ctx.beginPath();
                ctx.moveTo(ba.x, y0 + (alea() - 0.5) * 2);
                ctx.lineTo((ba.x + bb.x) / 2, (y0 + y1) / 2 + (alea() - 0.5) * 3);
                ctx.lineTo(bb.x, y1 + (alea() - 0.5) * 2);
                ctx.stroke();
            }
            for (let k = 0; k < 8; k++) {
                const u = alea(), v = alea();
                ctx.fillStyle = alea() < 0.5 ? "rgba(255, 248, 235, 0.18)" : "rgba(20, 14, 10, 0.25)";
                ctx.fillRect(ba.x + (bb.x - ba.x) * u, ba.y + (bb.y - ba.y) * u + (ha.y - ba.y) * v, 1.6, 1.6);
            }
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
        // Grain et fissures du dessus.
        ctx.save();
        ctx.beginPath();
        pieces.forEach(pc => pc.pts.forEach((p, k) => { const t = haut(p); k ? ctx.lineTo(t.x, t.y) : ctx.moveTo(t.x, t.y); }));
        ctx.clip();
        for (let k = 0; k < 50; k++) {
            ctx.fillStyle = alea() < 0.5 ? "rgba(255, 250, 240, 0.16)" : "rgba(30, 20, 12, 0.18)";
            ctx.fillRect(MUR_CX + (alea() - 0.5) * 2 * rayonInt, MUR_CY - HAUTEUR_MUR + (alea() - 0.5) * 2 * rayonInt, 1.5, 1.5);
        }
        ctx.strokeStyle = "rgba(40, 28, 18, 0.45)";
        for (let k = 0; k < 2; k++) {
            const a = alea() * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(MUR_CX + Math.cos(a) * rayonInt * 0.4, MUR_CY - HAUTEUR_MUR + Math.sin(a) * rayonInt * 0.4);
            ctx.lineTo(MUR_CX + (alea() - 0.5) * 8, MUR_CY - HAUTEUR_MUR + (alea() - 0.5) * 8);
            ctx.lineTo(MUR_CX - Math.cos(a + 0.4) * rayonInt * 0.35, MUR_CY - HAUTEUR_MUR - Math.sin(a + 0.4) * rayonInt * 0.35);
            ctx.stroke();
        }
        ctx.restore();
        // Les éclats tombés au pied d'un bout cassé.
        debris.sort((a, b) => a.y - b.y).forEach(e => {
            const b = vers(e);
            ombre(ctx, b.x + 1.5, b.y + 1.5, e.r * 1.5, e.r * 0.8, 0.35);
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
    const tuile = (graine, voisins, graineTeinte) => {
        const signature = (voisins || []).map(v => (v.etat || "-")[0] + Math.round(v.dx) + "," + Math.round(v.dy)).join("|");
        const cle = "mur|" + graine + "|" + signature + "|" + (graineTeinte || "");
        if (!CACHE.has(cle)) {
            try { CACHE.set(cle, window.dessinerMurTerre(graine, voisins, graineTeinte)); }
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
        const R = window.PLATEAU_VTT.hexSize || 40;
        const morceaux = [];
        const vise = window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif ? window.ETAT_CIBLAGE.cibleUnique : null;
        Object.keys(window.GRAVATS_TERRE || {}).sort().forEach(cle => {
            const [q, r] = cle.split("_").map(Number);
            if (window.murEnCase(q, r)) return;
            const px = window.PLATEAU_VTT.hexToPixel(q, r);
            const t = R * 1.8;
            const src = image("gravats", cle);
            if (src) morceaux.push(`<img class="gravats-terre" alt="" src="${src}" style="left:${px.x - t / 2}px;top:${px.y - t / 2}px;width:${t}px;height:${t}px">`);
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
            const dessin = m.projet ? tuile(m.id, null, null) : tuile(m.id, window.voisinsDuMur(m.q, m.r, echelle), m.idLanceur);
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
        calque.innerHTML = morceaux.filter(x => typeof x === "string").join("");
        const ensemble = morceaux.find(x => typeof x !== "string");
        if (ensemble) calque.insertBefore(ensemble, calque.firstChild ? calque.querySelector(".mur-terre, .mur-terre-jauge, .mur-terre-projet") : null);
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
