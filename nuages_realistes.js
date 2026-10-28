// =========================================================================
//  IVALIS — LES NUAGES RÉALISTES (v279)
// =========================================================================
//  Nico : « sur les cartes régionales les nuages sont très moches, c'est que
//  des formes opaques beige ; ça ne ressemble absolument pas à des nuages et
//  l'animation fait des trucs bizarres… refais ça de zéro et fais des tests,
//  je veux que ce soit réaliste ».
//
//  LES NUAGES SONT CALCULÉS PAR LA CARTE GRAPHIQUE (WebGL), pixel par pixel :
//    · la matière : un bruit fractal (plusieurs octaves de bruit lissé, chaque
//      octave deux fois plus fine), DÉFORMÉ par un second bruit (« domain
//      warping ») — ce qui donne les volutes, les bourrelets et les filaments
//      des vrais nuages, au lieu de boules ;
//    · le relief : l'épaisseur du nuage sert de hauteur ; le soleil vient du
//      nord-ouest : la face tournée vers lui est blanche, l'autre gris-bleu ;
//    · les bords : minces, translucides, effilochés — on voit la carte au
//      travers ; le cœur est épais et la cache ;
//    · l'ombre portée : un peu plus loin que le nuage, au sud-est, la carte
//      s'assombrit doucement ;
//    · le mouvement : le vent fait dériver la matière lentement et en continu,
//      et les volutes se déforment ; la zone couverte, elle, ne bouge pas.
//
//  DEUX USAGES :
//    · creerNappe(toile) : les nuages posés sur une carte régionale, dans les
//      zones peintes en DEV (un « masque » : la grille des zones, adoucie) ;
//    · creerTraversee(toile) : la caméra qui traverse des couches de nuages,
//      de plus en plus denses, quand on entre dans une région ou qu'on en sort.
//
//  Sans WebGL (très rare), `ok` vaut false : l'appelant prend son repli.
//  Script simple (pas un module) : chargé avant cartes_regionales.js.
// =========================================================================
(function () {
    const VERTEX = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
    // v_uv : (0, 0) en haut à gauche, comme l'image de la carte.
    v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
    gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

    // Le bruit : un hachage sans sinus (stable sur toutes les cartes
    // graphiques), un bruit de valeur à interpolation quintique, ses octaves.
    const BRUIT = `
precision highp float;
float hachage(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
float bruit(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = hachage(i), b = hachage(i + vec2(1.0, 0.0));
    float c = hachage(i + vec2(0.0, 1.0)), d = hachage(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
const mat2 TOURNE = mat2(0.80, 0.60, -0.60, 0.80);
float fbm3(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) { v += a * bruit(p); p = TOURNE * p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return v / 0.875;
}
float fbm6(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { v += a * bruit(p); p = TOURNE * p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return v / 0.984375;
}`;

    // LA NAPPE (carte régionale). u_vue : la part de la carte que couvre la
    // toile (x0, y0, largeur, hauteur, en fraction de la carte) ; u_aspect :
    // largeur / hauteur de la carte ; u_t : le temps (s) ; u_graine : une
    // graine par carte.
    //
    // UN CUMULUS VU DU CIEL : une ENVELOPPE (la zone peinte, très adoucie, son
    // bord déformé par un bruit large) et une MATIÈRE fractale douce (bruit à
    // six octaves, à peine déformé — une déformation forte donnait des stries).
    // Au cœur, l'enveloppe est haute : tout est couvert, en volutes. Au bord,
    // seuls les reliefs les plus hauts dépassent : le nuage se casse en
    // lambeaux et en petits nuages, translucides. Le relief est éclairé sur une
    // version lissée de la matière (une lumière douce, sans grain).
    const NAPPE = BRUIT + `
uniform sampler2D u_masque;
uniform vec4 u_vue;
uniform float u_aspect;
uniform float u_t;
uniform float u_graine;
uniform float u_detail;        // 0 vue entière, 1 au zoom fort : le grain fin apparaît
varying vec2 v_uv;

float masque(vec2 uv) {
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
    return texture2D(u_masque, uv).r;
}
float fbm4(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { v += a * bruit(p); p = TOURNE * p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return v / 0.9375;
}
// L'enveloppe, lente : la zone peinte, son bord qui ondule.
float enveloppe(vec2 uv, vec2 p) {
    vec2 q = vec2(fbm3(p * 0.30 + vec2(0.0, u_t * 0.010)), fbm3(p * 0.30 + vec2(5.2, 1.3) - vec2(u_t * 0.008, 0.0)));
    return masque(uv + (q - 0.5) * 0.12);
}
// La matière, qui dérive avec le vent : la douce sans les plus fines octaves
// (pour la lumière), la fine avec (pour la forme).
vec2 ventDe(float t) { return vec2(0.034, 0.012) * t; }
float matiereDouce(vec2 p) {
    vec2 w = vec2(fbm3(p * 0.5 + 3.1), fbm3(p * 0.5 + 8.7));
    return fbm4(p + (w - 0.5) * 0.55 + ventDe(u_t));
}
float matiere(vec2 p) {
    vec2 w = vec2(fbm3(p * 0.5 + 3.1), fbm3(p * 0.5 + 8.7));
    vec2 q = p + (w - 0.5) * 0.55 + ventDe(u_t);
    // Des cellules de convection : un bruit « en crête », qui fait les amas.
    float crete = 1.0 - abs(2.0 * fbm4(q * 0.8 + 11.0) - 1.0);
    return fbm6(q) * 0.72 + crete * 0.28;
}
// La quantité de nuages selon la zone : jamais tout le ciel, même au cœur
// (des trouées où la carte transparaît), et encore quelques nuages épars
// juste au-delà du bord peint.
float quantiteDe(float zone) { return mix(0.30, 0.70, zone); }
void main() {
    vec2 uv = u_vue.xy + v_uv * u_vue.zw;
    vec2 p = vec2(uv.x * u_aspect, uv.y) * 4.2 + vec2(u_graine, u_graine * 0.61);
    vec2 soleil = normalize(vec2(-0.62, -0.78));
    // LA ZONE ne fait que doser LA QUANTITÉ de nuages (Nico : « pas des nuages
    // en masse opaque… des nuages dispersés sur les bords et pas de bord
    // net ») : nombreux et épais au cœur, de plus en plus rares vers le dehors.
    // C'est la matière qui décide OÙ ils sont.
    float zone = enveloppe(uv, p);
    float zoneOmbre = enveloppe(uv + soleil * 0.032, p + soleil * 0.032 * 4.2);
    float dO = matiereDouce(p + soleil * 0.032 * 4.2);
    float hO = clamp((dO - 0.5) * 4.2, -1.0, 1.0) + (quantiteDe(zoneOmbre) - 0.5) * 2.4;
    float ombreSol = smoothstep(0.0, 0.7, hO) * smoothstep(0.0, 0.12, zoneOmbre) * 0.30;
    if (zone < 0.005) { gl_FragColor = vec4(0.0, 0.0, 0.0, ombreSol); return; }
    float m = matiere(p);
    float d0 = matiereDouce(p);
    // La densité : les masses (moyennes échelles) et leur grain (fines), étirés.
    float masses = clamp((d0 - 0.5) * 4.2, -1.0, 1.0);
    float grain = clamp((m - d0) * 3.0, -1.0, 1.0);
    // De près, le grain le plus fin (des octaves de plus, au zoom).
    if (u_detail > 0.01) {
        vec2 qf = p * 9.0 + ventDe(u_t) * 9.0;
        grain = clamp(grain + (fbm3(qf) - 0.5) * 1.1 * u_detail, -1.0, 1.0);
    }
    float h = masses + grain * 0.30 + (quantiteDe(zone) - 0.5) * 2.4;
    // Épais là où la densité est forte, mince et translucide ailleurs : la
    // carte transparaît entre les masses, même au cœur (Nico : « quitte à voir
    // par endroits la map en dessous »).
    float masse = smoothstep(0.0, 0.70, h);
    float couverture = masse * smoothstep(0.0, 0.12, zone);
    // LA LUMIÈRE : le relief des masses, éclairé du nord-ouest — sommets
    // blancs, flancs et creux gris-bleu.
    float d1 = matiereDouce(p + soleil * 0.035);
    float relief = clamp((d0 - d1) * 13.0, -1.0, 1.0);
    float epaisseur = smoothstep(0.0, 1.3, h);
    float lumiere = clamp(0.50 + relief * 0.48 + epaisseur * 0.24 + grain * 0.10 * u_detail, 0.0, 1.0);
    vec3 ombre = vec3(0.44, 0.49, 0.60);
    vec3 clair = vec3(1.0, 0.993, 0.972);
    vec3 couleur = mix(ombre, clair, lumiere);
    // Les voiles minces sont plus gris ; le grain fin nuance à peine la teinte.
    couleur = mix(couleur * vec3(0.86, 0.88, 0.92), couleur, smoothstep(0.1, 0.8, masse)) * (1.0 + grain * 0.05);
    gl_FragColor = vec4(couleur * couverture, couverture + ombreSol * (1.0 - couverture));
}`;

    // LA TRAVERSÉE. K couches régulièrement espacées en profondeur foncent vers
    // la caméra (leur grain grossit comme 1 / distance). u_avance : combien de
    // couches ont déjà passé la caméra ; u_couverture : 0 ciel clair, 1 ciel
    // bouché ; u_voile : le blanc du cœur, qui couvre tout l'écran.
    const TRAVERSEE = BRUIT + `
uniform vec2 u_res;
uniform float u_avance;
uniform float u_couverture;
uniform float u_voile;
varying vec2 v_uv;
const int K = 7;
void main() {
    vec2 ecran = (v_uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
    float f = fract(u_avance);
    float premiere = floor(u_avance);
    vec4 cumul = vec4(0.0);
    for (int j = 0; j < K; j++) {
        // De la plus proche à la plus lointaine (composition d'avant en arrière).
        float z = (float(j) + 1.0 - f) / float(K);
        float id = premiere + 1.0 + float(j);
        vec2 decalage = vec2(hachage(vec2(id, 3.1)), hachage(vec2(7.7, id))) * 80.0;
        vec2 p = ecran * (0.35 + z * 5.0) + decalage;
        float n = fbm6(p);
        float nSoleil = fbm6(p + vec2(-0.05, -0.07) * (0.35 + z * 5.0));
        float seuil = mix(0.80, 0.30, u_couverture);
        float d = smoothstep(seuil, seuil + 0.22, n);
        float approche = smoothstep(1.0, 0.72, z) * smoothstep(0.015, 0.16, z);
        float a = d * approche * (0.55 + 0.45 * u_couverture);
        float lumiere = clamp(0.82 + (n - nSoleil) * 5.5, 0.0, 1.0);
        vec3 couleur = mix(vec3(0.60, 0.65, 0.74), vec3(1.0, 0.993, 0.975), lumiere);
        // Au loin, la brume pâlit les couleurs.
        couleur = mix(couleur, vec3(0.90, 0.93, 0.97), z * 0.45);
        cumul.rgb += (1.0 - cumul.a) * couleur * a;
        cumul.a += (1.0 - cumul.a) * a;
    }
    vec3 voile = vec3(0.965, 0.972, 0.985);
    cumul.rgb = cumul.rgb * (1.0 - u_voile) + voile * u_voile;
    cumul.a = cumul.a * (1.0 - u_voile) + u_voile;
    gl_FragColor = cumul;
}`;

    function compiler(gl, type, source) {
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            const erreur = gl.getShaderInfoLog(s);
            gl.deleteShader(s);
            throw new Error("Nuages : " + erreur);
        }
        return s;
    }
    function programme(gl, fragment) {
        const p = gl.createProgram();
        gl.attachShader(p, compiler(gl, gl.VERTEX_SHADER, VERTEX));
        gl.attachShader(p, compiler(gl, gl.FRAGMENT_SHADER, fragment));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("Nuages : " + gl.getProgramInfoLog(p));
        return p;
    }
    // Le contexte WebGL d'une toile, son programme et son carré plein écran.
    function preparer(toile, fragment) {
        let gl = null;
        try {
            gl = toile.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: false })
                || toile.getContext("experimental-webgl");
        } catch (e) { gl = null; }
        if (!gl) return null;
        try {
            const prog = programme(gl, fragment);
            const tampon = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, tampon);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
            const pos = gl.getAttribLocation(prog, "a_pos");
            gl.useProgram(prog);
            gl.enableVertexAttribArray(pos);
            gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
            const u = {};
            const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
            for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(prog, i); u[info.name] = gl.getUniformLocation(prog, info.name); }
            return { gl, prog, u };
        } catch (e) {
            console.error(e);
            return null;
        }
    }
    function ajusterTaille(toile, largeur, hauteur) {
        const l = Math.max(1, Math.round(largeur)), h = Math.max(1, Math.round(hauteur));
        if (toile.width !== l || toile.height !== h) { toile.width = l; toile.height = h; }
    }
    // Lire des pixels juste après le dessin (les bancs, et la sonde de couverture).
    function lire(gl, x, y, l, h) {
        const px = new Uint8Array(l * h * 4);
        gl.readPixels(x, gl.drawingBufferHeight - y - h, l, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return px;
    }

    // --- LA NAPPE ------------------------------------------------------------
    function creerNappe(toile) {
        const ctx = preparer(toile, NAPPE);
        if (!ctx) return { ok: false };
        const { gl, u } = ctx;
        const texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.uniform1i(u.u_masque, 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        return {
            ok: true,
            // `douce` : la grille des zones, adoucie (0 à 1), `colonnes` × `lignes`.
            poserMasque(douce, colonnes, lignes) {
                const octets = new Uint8Array(colonnes * lignes);
                for (let i = 0; i < octets.length; i++) octets[i] = Math.max(0, Math.min(255, Math.round(douce[i] * 255)));
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, colonnes, lignes, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, octets);
            },
            // o : { t, vue: {x0, y0, l, h}, aspect, graine, largeur, hauteur }
            dessiner(o) {
                ajusterTaille(toile, o.largeur, o.hauteur);
                gl.viewport(0, 0, toile.width, toile.height);
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);
                gl.uniform4f(u.u_vue, o.vue.x0, o.vue.y0, o.vue.l, o.vue.h);
                gl.uniform1f(u.u_aspect, o.aspect);
                gl.uniform1f(u.u_t, o.t % 3600);
                gl.uniform1f(u.u_graine, o.graine || 0);
                gl.uniform1f(u.u_detail, Math.max(0, Math.min(1, o.detail || 0)));
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            },
            lire(x, y, l, h) { return lire(gl, x, y, l, h); },
            perdu: () => gl.isContextLost(),
            detruire() { const ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); }
        };
    }

    // --- LA TRAVERSÉE --------------------------------------------------------
    function creerTraversee(toile) {
        const ctx = preparer(toile, TRAVERSEE);
        if (!ctx) return { ok: false };
        const { gl, u } = ctx;
        return {
            ok: true,
            // o : { largeur, hauteur, avance, couverture, voile }
            dessiner(o) {
                ajusterTaille(toile, o.largeur, o.hauteur);
                gl.viewport(0, 0, toile.width, toile.height);
                gl.clearColor(0, 0, 0, 0);
                gl.clear(gl.COLOR_BUFFER_BIT);
                gl.uniform2f(u.u_res, toile.width, toile.height);
                gl.uniform1f(u.u_avance, o.avance);
                gl.uniform1f(u.u_couverture, o.couverture);
                gl.uniform1f(u.u_voile, o.voile);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            },
            lire(x, y, l, h) { return lire(gl, x, y, l, h); },
            detruire() { const ext = gl.getExtension("WEBGL_lose_context"); if (ext) ext.loseContext(); }
        };
    }

    // LA ZONE DES NUAGES, prête pour la carte graphique : une distance signée
    // au bord de la zone peinte (en cases ; positive dedans), ramenée à 0…1
    // sur une bande de ± `bande` cases autour du bord. Un flou ferait fondre
    // les petites zones peintes ; la distance les garde, et donne au bord la
    // place de s'effilocher.
    function zoneDouce(grille, colonnes, lignes, bande) {
        const INF = 1e6, n = colonnes * lignes;
        const distance = (dedans) => {
            const d = new Float32Array(n);
            for (let i = 0; i < n; i++) d[i] = (!!grille[i]) === dedans ? INF : 0;
            const a = 1, b = Math.SQRT2;
            for (let l = 0; l < lignes; l++) for (let c = 0; c < colonnes; c++) {
                const i = l * colonnes + c; let v = d[i];
                if (c > 0) v = Math.min(v, d[i - 1] + a);
                if (l > 0) { v = Math.min(v, d[i - colonnes] + a); if (c > 0) v = Math.min(v, d[i - colonnes - 1] + b); if (c < colonnes - 1) v = Math.min(v, d[i - colonnes + 1] + b); }
                d[i] = v;
            }
            for (let l = lignes - 1; l >= 0; l--) for (let c = colonnes - 1; c >= 0; c--) {
                const i = l * colonnes + c; let v = d[i];
                if (c < colonnes - 1) v = Math.min(v, d[i + 1] + a);
                if (l < lignes - 1) { v = Math.min(v, d[i + colonnes] + a); if (c < colonnes - 1) v = Math.min(v, d[i + colonnes + 1] + b); if (c > 0) v = Math.min(v, d[i + colonnes - 1] + b); }
                d[i] = v;
            }
            return d;
        };
        // Pour une case peinte : sa distance au dehors ; pour une case vide :
        // sa distance au dedans.
        const versDehors = distance(true), versDedans = distance(false);
        const B = Math.max(1, bande || 12);
        const zone = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const signe = grille[i] ? (versDehors[i] - 0.5) : -(versDedans[i] - 0.5);
            zone[i] = Math.max(0, Math.min(1, 0.5 + signe / (2 * B)));
        }
        return zone;
    }

    window.NuagesRealistes = { creerNappe, creerTraversee, zoneDouce };
})();
