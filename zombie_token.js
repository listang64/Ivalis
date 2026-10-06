// =========================================================================
//  LE PION D'UN ZOMBIE (Profanateur, niveau 5) — SANS IA
// =========================================================================
//  Nico : « un algo qui grignote un peu l'image du token, et dessine un peu de
//  sang dessus, un effet zombie, sans avoir besoin d'IA pour refaire une
//  image ». Tout se fait ici, dans un <canvas>, à partir de l'image du pion :
//
//    1. la teinte cadavérique : désaturée, tirée vers le vert-gris ;
//    2. les morsures : des bouchées irrégulières arrachées au bord du
//       médaillon, ourlées de sang ;
//    3. le sang : quelques éclaboussures et des coulures, posées seulement sur
//       ce qui reste de l'image (jamais dans le vide).
//
//  Le hasard est TIRÉ D'UNE GRAINE (l'identifiant de la créature) : les trois
//  écrans dessinent exactement le même zombie, et le même à chaque fois.
//  Le résultat est gardé en mémoire (une image par URL et par graine).
(function () {
    const CACHE = new Map();          // "url|graine" → dataURL (ou null si l'image refuse)
    const EN_COURS = new Map();       // "url|graine" → Promise

    // Un petit générateur déterministe (FNV-1a puis mulberry32).
    function hasard(graine) {
        let h = 2166136261 >>> 0;
        for (const ch of String(graine || "zombie")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
        return () => {
            h = (h + 0x6D2B79F5) >>> 0;
            let t = h;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Une bouchée : un contour en dents de scie (des marques de dents), le
    // rayon tiré point par point. La même graine donne la même bouchée : on
    // peut la tracer plusieurs fois (l'ourlet de sang, puis le trou).
    function bouchee(ctx, cx, cy, rayon, alea, gonfle) {
        const n = 16 + Math.floor(alea() * 6);
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
            const a = (i / n) * Math.PI * 2;
            const dent = (i % 2 === 0) ? 1 : 0.72 + alea() * 0.2;
            const r = rayon * dent * (0.85 + alea() * 0.3) * (gonfle || 1);
            const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
    }

    // Une éclaboussure : une tache, et des gouttelettes autour.
    function eclaboussure(ctx, cx, cy, rayon, alea) {
        ctx.beginPath();
        ctx.arc(cx, cy, rayon, 0, Math.PI * 2);
        ctx.fill();
        const n = 5 + Math.floor(alea() * 6);
        for (let i = 0; i < n; i++) {
            const a = alea() * Math.PI * 2, d = rayon * (1.1 + alea() * 1.4);
            ctx.beginPath();
            ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rayon * (0.08 + alea() * 0.22), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Le dessin lui-même, sur une image déjà chargée. Rend le <canvas>.
    window.dessinerPionZombie = function (image, graine, taille) {
        const T = Math.max(64, Math.round(taille || 256));
        const canvas = document.createElement("canvas");
        canvas.width = T; canvas.height = T;
        const ctx = canvas.getContext("2d");
        const alea = hasard(graine);

        // L'image, contenue dans le carré (comme le pion : object-fit contain).
        const iw = image.naturalWidth || image.width || T, ih = image.naturalHeight || image.height || T;
        const echelle = Math.min(T / iw, T / ih);
        const w = iw * echelle, h = ih * echelle;
        ctx.drawImage(image, (T - w) / 2, (T - h) / 2, w, h);

        // 1. LA TEINTE CADAVÉRIQUE.
        const pixels = ctx.getImageData(0, 0, T, T);
        const d = pixels.data;
        for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] === 0) continue;
            // Désaturé, assombri, tiré vers un vert-gris de chair morte.
            const lum = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];
            const zr = lum * 0.62 + 10, zg = lum * 0.74 + 20, zb = lum * 0.52 + 8;
            d[i]     = Math.round(d[i] * 0.3 + zr * 0.7);
            d[i + 1] = Math.round(d[i + 1] * 0.3 + zg * 0.7);
            d[i + 2] = Math.round(d[i + 2] * 0.3 + zb * 0.7);
        }
        ctx.putImageData(pixels, 0, 0);

        // Des taches de pourriture : quelques ombres verdâtres, floues.
        ctx.globalCompositeOperation = "source-atop";
        const nbTaches = 3 + Math.floor(alea() * 3);
        for (let i = 0; i < nbTaches; i++) {
            const a = alea() * Math.PI * 2, dist = T * 0.38 * Math.sqrt(alea()), r = T * (0.06 + alea() * 0.08);
            const x = T / 2 + Math.cos(a) * dist, y = T / 2 + Math.sin(a) * dist;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, "rgba(34, 48, 18, 0.45)");
            g.addColorStop(1, "rgba(34, 48, 18, 0)");
            ctx.fillStyle = g;
            ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        ctx.globalCompositeOperation = "source-over";

        // 2. LES MORSURES, au bord du médaillon : d'abord un ourlet de sang
        //    (posé sur l'image seulement), puis la bouchée arrachée dedans.
        const centre = T / 2, bord = T * 0.47;
        const morsures = [];
        const nbMorsures = 4 + Math.floor(alea() * 3);
        const depart = alea() * Math.PI * 2;
        for (let i = 0; i < nbMorsures; i++) {
            const a = depart + (i / nbMorsures) * Math.PI * 2 + (alea() - 0.5) * 0.7;
            const r = T * (0.07 + alea() * 0.06);
            morsures.push({ x: centre + Math.cos(a) * bord, y: centre + Math.sin(a) * bord, r,
                            graine: Math.floor(alea() * 1e9) });
        }
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "rgba(72, 4, 4, 0.92)";
        morsures.forEach(m => bouchee(ctx, m.x, m.y, m.r, hasard(m.graine), 1.22));
        ctx.fillStyle = "rgba(140, 14, 10, 0.75)";
        morsures.forEach(m => bouchee(ctx, m.x, m.y, m.r, hasard(m.graine), 1.1));
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "#000";
        morsures.forEach(m => bouchee(ctx, m.x, m.y, m.r, hasard(m.graine), 1));

        // 3. LE SANG : des éclaboussures et des coulures, sur l'image seulement.
        ctx.globalCompositeOperation = "source-atop";
        const nbSang = 2 + Math.floor(alea() * 3);
        for (let i = 0; i < nbSang; i++) {
            const a = alea() * Math.PI * 2, dist = T * 0.34 * Math.sqrt(alea());
            ctx.fillStyle = alea() < 0.5 ? "rgba(128, 8, 8, 0.85)" : "rgba(86, 0, 0, 0.9)";
            eclaboussure(ctx, centre + Math.cos(a) * dist, centre + Math.sin(a) * dist, T * (0.025 + alea() * 0.04), alea);
        }
        // Les coulures partent des morsures du haut et descendent, fines,
        // pour finir en goutte.
        ctx.fillStyle = "rgba(104, 4, 4, 0.9)";
        morsures.filter(m => m.y < centre + T * 0.1).forEach(m => {
            const nb = 1 + Math.floor(alea() * 2);
            for (let k = 0; k < nb; k++) {
                const x0 = m.x + (alea() - 0.5) * m.r * 1.4;
                const y0 = m.y + m.r * 0.9;
                const long = T * (0.07 + alea() * 0.16), large = T * (0.010 + alea() * 0.012);
                ctx.beginPath();
                ctx.moveTo(x0 - large, y0);
                ctx.quadraticCurveTo(x0 - large * 0.4, y0 + long * 0.6, x0, y0 + long);
                ctx.quadraticCurveTo(x0 + large * 0.4, y0 + long * 0.6, x0 + large, y0);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.arc(x0, y0 + long, large * 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        ctx.globalCompositeOperation = "source-over";
        return canvas;
    };

    // L'image zombie d'une URL de pion, pour cette graine : un dataURL, ou null
    // si l'image ne peut pas être lue (CORS) — le pion garde alors l'original
    // avec un simple filtre CSS.
    window.imageZombie = function (url, graine) {
        const cle = url + "|" + graine;
        if (CACHE.has(cle)) return Promise.resolve(CACHE.get(cle));
        if (EN_COURS.has(cle)) return EN_COURS.get(cle);
        const promesse = new Promise(resolve => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => {
                try {
                    const url64 = window.dessinerPionZombie(image, graine, 256).toDataURL("image/png");
                    CACHE.set(cle, url64);
                    resolve(url64);
                } catch (e) {
                    console.warn("Pion zombie : image illisible, filtre CSS à la place.", e);
                    CACHE.set(cle, null);
                    resolve(null);
                }
            };
            image.onerror = () => { CACHE.set(cle, null); resolve(null); };
            image.src = url;
        }).finally(() => EN_COURS.delete(cle));
        EN_COURS.set(cle, promesse);
        return promesse;
    };
    window.imageZombieEnCache = (url, graine) => CACHE.get(url + "|" + graine) || null;
})();
