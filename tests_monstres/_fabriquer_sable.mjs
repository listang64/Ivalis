// v288 — LE SABLE sous les cartes (images/sable.jpg). Nico : « plutôt que la
// table en bois, fais-moi du sable réaliste et irrégulier, comme si les cartes
// étaient posées à même le sable ».
//
// L'image est fabriquée une fois pour toutes, ici, puis rangée dans le dépôt :
// le jeu ne fait que l'afficher. Pour la refaire :
//     node tests_monstres/_fabriquer_sable.mjs [graine]
// Un carreau carré RÉPÉTABLE (sans couture) : de larges ondulations, des rides
// de vent dissymétriques qui se tordent, bifurquent et s'effacent par plaques,
// des grains de toutes couleurs (sombres, quartz, roux) plus ou moins triés
// par le vent, quelques cailloux à moitié enfouis ; une lumière rasante.
import fs from 'fs';
import path from 'path';
const RACINE = process.env.IVALIS_RACINE || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const GRAINE = Number(process.argv[2] || 5), COTE = 1600;

const GENERATEUR = String.raw`
// Le sable, en carreau RÉPÉTABLE (v288) : ce qui sort d'un côté rentre de
// l'autre — posé en mosaïque sous la carte, sans couture.
function fabriquerSable(W, graine) {
  const H = W;
  let s = graine >>> 0;
  const alea = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const GX = new Float32Array(256), GY = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const a = alea() * Math.PI * 2; GX[i] = Math.cos(a); GY[i] = Math.sin(a); }
  const hache = (i, j, o) => { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(o + 1, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) & 255; };
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const mod = (a, n) => ((a % n) + n) % n;
  // Perlin périodique dans les deux sens (période p cases).
  function perlin(x, y, p, o) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const X0 = mod(xi, p), X1 = mod(xi + 1, p), Y0 = mod(yi, p), Y1 = mod(yi + 1, p);
    const a = hache(X0, Y0, o), b = hache(X1, Y0, o), c = hache(X0, Y1, o), d = hache(X1, Y1, o);
    const g = (h, dx, dy) => GX[h] * dx + GY[h] * dy;
    const u = fade(xf), v = fade(yf);
    const n0 = g(a, xf, yf) + u * (g(b, xf - 1, yf) - g(a, xf, yf));
    const n1 = g(c, xf, yf - 1) + u * (g(d, xf - 1, yf - 1) - g(c, xf, yf - 1));
    return n0 + v * (n1 - n0);
  }
  // u, v dans [0, 1) ; f cases sur le carreau.
  const fbm = (u, v, f, o, n) => { let t = 0, a = 0.5, k = 1, m = 0; for (let i = 0; i < n; i++) { t += a * perlin(u * f * k, v * f * k, f * k, o + i * 7); m += a; a *= 0.5; k *= 2; } return t / m; };
  const lisse = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // 1. LE RELIEF : de larges ondulations, des rides de vent (dissymétriques,
  //    douces au vent, raides sous le vent), par plaques, qui se tordent.
  const haut = new Float32Array(W * H), tache = new Float32Array(W * H), tache2 = new Float32Array(W * H);
  const ride = (p) => { const f = p - Math.floor(p); return f < 0.72 ? lisse(0, 0.72, f) : 1 - lisse(0.72, 1, f); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const dune = fbm(u, v, 2, 11, 4);
    // la torsion : forte et lente (les rides s'écartent, se rejoignent, bifurquent), plus des frissons
    const torsion = fbm(u, v, 2, 21, 3) * 4.2 + fbm(u, v, 5, 31, 2) * 1.3 + fbm(u, v, 13, 33, 2) * 0.3;
    const plaque = lisse(-0.25, 0.35, fbm(u, v, 3, 41, 3));
    const rides = ride(31 * u + 12 * v + torsion);
    const plaque2 = lisse(0.0, 0.4, fbm(u, v, 4, 51, 2));
    const rides2 = ride(-10 * u + 25 * v + torsion * 0.7 + fbm(u, v, 6, 61, 2) * 1.2);
    const micro = ride(83 * u + 30 * v + torsion * 2.2 + fbm(u, v, 16, 63, 2) * 1.5);
    const grain = perlin(u * 512, v * 512, 512, 71) * 0.5 + perlin(u * 1024, v * 1024, 1024, 72) * 0.5;
    const force = 0.55 + 0.45 * lisse(-0.4, 0.4, fbm(u, v, 6, 45, 2));     // des rides plus ou moins marquées
    haut[y * W + x] = 11 * dune + 1.0 * force * plaque * rides + 0.5 * plaque2 * (1 - plaque) * rides2
                    + 0.12 * (1 - 0.7 * plaque) * micro + 0.1 * grain;
    tache[y * W + x] = fbm(u, v, 5, 81, 3);
    tache2[y * W + x] = fbm(u, v, 7, 91, 2);
  }
  // 2. LA LUMIÈRE : rasante, du haut à gauche.
  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d"); const img = ctx.createImageData(W, H); const d = img.data;
  const L = [-0.62, -0.5, 0.6], nl = Math.hypot(...L); L[0] /= nl; L[1] /= nl; L[2] /= nl;
  const base = [206, 176, 128];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const xm = (x - 1 + W) % W, xp = (x + 1) % W, ym = (y - 1 + H) % H, yp = (y + 1) % H;
    const gx = (haut[y * W + xp] - haut[y * W + xm]) * 0.5 * 2.1 * Math.pow(W / 2048, -0.3), gy = (haut[yp * W + x] - haut[ym * W + x]) * 0.5 * 2.1 * Math.pow(W / 2048, -0.3);
    const n = [-gx, -gy, 1], nn = Math.hypot(...n);
    const diffus = Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / nn);
    let lum = 0.44 + 0.66 * diffus;
    // les grains : chacun sa couleur
    const r0 = alea();
    let R = base[0], V = base[1], B = base[2];
    const t = tache[y * W + x];
    R *= 1 + 0.06 * t; V *= 1 + 0.03 * t; B *= 1 - 0.05 * t;           // plus doré, plus pâle, par endroits
    const j = 0.92 + 0.16 * alea();
    // des grains sombres plus ou moins nombreux selon l'endroit (le sable trié par le vent)
    const sombres = 0.006 + 0.022 * lisse(-0.2, 0.5, tache2[y * W + x]);
    if (r0 < sombres) { const k = 0.6 + 0.25 * alea(); R *= k; V *= k * 0.94; B *= k * 0.9; }   // grains sombres
    else if (r0 < sombres + 0.025) { R *= 1.12; V *= 1.12; B *= 1.16; }                       // quartz clair
    else if (r0 < sombres + 0.04) { R *= 1.07; V *= 0.88; B *= 0.74; }                        // grains roux
    const i = (y * W + x) * 4;
    d[i] = Math.min(255, R * lum * j); d[i + 1] = Math.min(255, V * lum * j); d[i + 2] = Math.min(255, B * lum * j); d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // 3. QUELQUES CAILLOUX ET DÉBRIS, à moitié enfouis (redessinés de l'autre côté du bord).
  const caillou = (x, y, r, teinte) => {
    for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) {
      const cx = x + ox, cy = y + oy;
      if (cx < -r * 3 || cx > W + r * 3 || cy < -r * 3 || cy > H + r * 3) continue;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(teinte.a);
      ctx.fillStyle = "rgba(60,40,20,0.35)"; ctx.beginPath(); ctx.ellipse(r * 0.35, r * 0.3, r * 1.05, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();  // l'ombre
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
      g.addColorStop(0, teinte.clair); g.addColorStop(1, teinte.sombre);
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, r, r * teinte.e, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  };
  const teintes = [["#b7aa98", "#5e5446"], ["#c9b08c", "#6e5a40"], ["#8f8a82", "#3e3a34"], ["#d8cdb8", "#8a7a62"], ["#a07a58", "#4e3622"]];
  for (let k = 0; k < 28; k++) {
    const [clair, sombre] = teintes[Math.floor(alea() * teintes.length)];
    const r = alea() < 0.8 ? 1.5 + alea() * 3 : 4 + alea() * 6;
    caillou(alea() * W, alea() * H, r * W / 2048, { clair, sombre, e: 0.55 + alea() * 0.4, a: alea() * Math.PI });
  }
  return cv;
}
`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch(); const p = await b.newPage();
await p.setContent('<html><body></body></html>'); await p.addScriptTag({ content: GENERATEUR });
const url = await p.evaluate(([c, g]) => fabriquerSable(c, g).toDataURL("image/jpeg", 0.8), [COTE, GRAINE]);
const sortie = path.join(RACINE, 'images', 'sable.jpg');
fs.writeFileSync(sortie, Buffer.from(url.split(",")[1], "base64"));
console.log("images/sable.jpg :", COTE + "×" + COTE, fs.statSync(sortie).size, "octets");
await b.close();
