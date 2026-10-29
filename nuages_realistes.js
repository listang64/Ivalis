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
//  L'USAGE : creerTraversee(toile) — la caméra qui traverse des couches de
//  nuages, de plus en plus denses, quand on entre dans une région ou qu'on en
//  sort. (Les nuages posés sur les cartes régionales — creerNappe — sont
//  retirés en v286 : Nico n'en garde que la traversée.)
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
float fbm6(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { v += a * bruit(p); p = TOURNE * p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return v / 0.984375;
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

    window.NuagesRealistes = { creerTraversee };
})();
