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

    const CACHE = new Map();
    const image = (genre, graine) => {
        const cle = genre + "|" + graine;
        if (!CACHE.has(cle)) {
            try {
                const c = genre === "mur" ? window.dessinerPilierTerre(graine) : window.dessinerGravatsTerre(graine);
                CACHE.set(cle, c.toDataURL("image/png"));
            } catch (e) {
                CACHE.set(cle, "");
            }
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
        Object.values(window.MURS_TERRE || {}).sort((a, b) => (a.r - b.r) || (a.q - b.q)).forEach(m => {
            const px = window.PLATEAU_VTT.hexToPixel(m.q, m.r);
            const l = R * 1.9, h = l * HAUTEUR / LARGEUR;
            const src = image("mur", m.id);
            const blesse = Number(m.pv) < Number(m.pvMax);
            const jauge = blesse
                ? `<span class="mur-terre-jauge" style="left:${px.x - R * 0.6}px;top:${px.y + R * 0.55}px;width:${R * 1.2}px">
                     <span style="width:${Math.max(0, Math.min(100, 100 * Number(m.pv) / Number(m.pvMax)))}%"></span></span>` : "";
            morceaux.push(`<img class="mur-terre${vise === m.id ? " mur-terre-vise" : ""}" data-mur="${m.id}" alt="Mur de terre (${m.pv} PV)" title="Mur de terre : ${m.pv} / ${m.pvMax} PV"
                src="${src}" style="left:${px.x - l / 2}px;top:${px.y - h * PIED_Y / HAUTEUR}px;width:${l}px;height:${h}px">${jauge}`);
        });
        (window.POSE_MURS ? window.POSE_MURS.cases : []).forEach((c, i) => {
            const px = window.PLATEAU_VTT.hexToPixel(c.q, c.r);
            const l = R * 1.9, h = l * HAUTEUR / LARGEUR;
            const src = image("mur", "projet_" + i + "_" + c.q + "_" + c.r);
            morceaux.push(`<img class="mur-terre mur-terre-projet" alt="" src="${src}" style="left:${px.x - l / 2}px;top:${px.y - h * PIED_Y / HAUTEUR}px;width:${l}px;height:${h}px">`);
        });
        calque.innerHTML = morceaux.join("");
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
