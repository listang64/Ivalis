// v285 — LA TABLE EN BOIS derrière les cartes (images/table_bois.jpg).
//
// L'image est fabriquée une fois pour toutes, ici, puis rangée dans le dépôt :
// le jeu ne fait que l'afficher (aucun calcul sur l'iPad). Pour la refaire :
//     node tests_monstres/_fabriquer_table_bois.mjs [graine]
// Planches de noyer sombre : cernes en arches (le tronc coupé de biais), nœuds
// que le fil contourne, fibres et pores, joints entre planches, vernis usé.
import fs from 'fs';
import path from 'path';
const RACINE = process.env.IVALIS_RACINE || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const GRAINE = Number(process.argv[2] || 21), W = 2560, H = 1600;

const GENERATEUR = String.raw`
// Générateur de la table en bois (exécuté dans une page) : rend un canvas.
function fabriquerBois(W, H, graine) {
  // --- hasard et bruit de Perlin ---
  let s = graine >>> 0;
  const alea = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const P = new Uint16Array(512); { const q = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(alea() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; } for (let i = 0; i < 512; i++) P[i] = q[i & 255]; }
  const GX = new Float32Array(256), GY = new Float32Array(256); for (let i = 0; i < 256; i++) { const a = alea() * Math.PI * 2; GX[i] = Math.cos(a); GY[i] = Math.sin(a); }
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  function perlin(x, y, o) {
    x += o * 17.13; y += o * 31.7;
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const g = (h, dx, dy) => GX[h] * dx + GY[h] * dy;
    const a = P[P[X] + Y], b = P[P[X + 1] + Y], c = P[P[X] + Y + 1], d = P[P[X + 1] + Y + 1];
    const u = fade(xf), v = fade(yf);
    const n0 = g(a, xf, yf) + u * (g(b, xf - 1, yf) - g(a, xf, yf));
    const n1 = g(c, xf, yf - 1) + u * (g(d, xf - 1, yf - 1) - g(c, xf, yf - 1));
    return n0 + v * (n1 - n0);               // ~[-0.7, 0.7]
  }
  const fbm = (x, y, o, n) => { let t = 0, a = 0.5, f = 1, m = 0; for (let i = 0; i < n; i++) { t += a * perlin(x * f, y * f, o + i * 7); m += a; a *= 0.5; f *= 2.03; } return t / m; };
  const lisse = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  // --- les planches ---
  const planches = [];
  let y = -Math.round(alea() * H * 0.08);
  while (y < H) {
    const h = Math.round(H * (0.2 + 0.05 * alea()));
    const coupes = [-1e9];
    if (alea() < 0.45) coupes.push(Math.round(W * (0.15 + 0.7 * alea())));
    coupes.push(1e9);
    const bouts = [];
    for (let k = 0; k + 1 < coupes.length; k++) {
      const noeuds = [];
      const n = alea() < 0.3 ? 0 : (alea() < 0.65 ? 1 : 2);
      for (let j = 0; j < n; j++) {
        const R = h * (0.035 + 0.06 * alea());
        const de = Math.max(coupes[k], 0), a2 = Math.min(W, coupes[k + 1]);
        noeuds.push({ x: de + (0.1 + 0.8 * alea()) * (a2 - de), y: (alea() - 0.5) * h * 0.75, R, ex: 1.2 + 0.6 * alea(), ang: (alea() - 0.5) * 0.3, fente: alea() < 0.35 });
      }
      bouts.push({
        de: coupes[k], a: coupes[k + 1],
        y0: (alea() - 0.5) * h * 1.2, z0: h * (0.15 + 0.35 * alea()), amplZ: h * (0.5 + 0.8 * alea()), pente: (alea() - 0.5) * 0.08,
        pas: H * (0.0045 + 0.005 * alea()), ton: 0.85 + 0.25 * alea(), rouge: (alea() - 0.5) * 0.14, o: Math.floor(alea() * 1000), noeuds,
        x0: alea() * 4000,
      });
    }
    planches.push({ y, h, bouts });
    y += h;
  }

  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d"); const img = ctx.createImageData(W, H); const d = img.data;
  // couleurs : noyer sombre (bois de printemps, bois d'été)
  const C_TOT = [98, 60, 35], C_TARD = [38, 20, 10];
  const ech = H / 1600;                               // les détails suivent la taille de l'image

  for (const pl of planches) {
    for (let py = Math.max(0, pl.y); py < Math.min(H, pl.y + pl.h); py++) {
      const ly = py - pl.y - pl.h / 2;
      const dJoint = Math.min(py - pl.y, pl.y + pl.h - 1 - py) / ech;
      for (let px = 0; px < W; px++) {
        let bi = 0; while (px >= pl.bouts[bi].a) bi++;
        const bo = pl.bouts[bi];
        const lx = px + bo.x0 * ech;
        // les cernes : la planche coupe le tronc de biais, le tronc s'effile —
        // les cernes s'ouvrent en arches (« cathédrales »).
        const meandre = 0.12 * pl.h * fbm(lx / (1100 * ech), 0.5, bo.o, 3);
        const dy = ly - bo.y0 - bo.pente * px - meandre;
        const dz = bo.z0 + bo.amplZ * (0.5 + fbm(lx / (2800 * ech), 3.3, bo.o + 1, 2));
        let r = Math.sqrt(dy * dy + dz * dz);
        r += 2.2 * ech * fbm(lx / (160 * ech), ly / (30 * ech), bo.o + 2, 4);
        // les nœuds : le fil s'écarte et les contourne
        let dansNoeud = 0, rn = 0, fente = 0, halo = 0, qxN = 0, qyN = 0;
        for (const n of bo.noeuds) {
          const ax = px - n.x, ay = ly - n.y;
          const ca = Math.cos(n.ang), sa = Math.sin(n.ang);
          const qx = (ax * ca + ay * sa) / n.ex, qy = -ax * sa + ay * ca;
          const dist = Math.hypot(qx, qy) * (1 + 0.1 * fbm(qx / n.R * 1.5, qy / n.R * 1.5, bo.o + 9, 2));
          const bosse = Math.exp(-((ax / (n.R * n.ex * 3.2)) ** 2 + (ay / (n.R * 2.2)) ** 2));
          r += n.R * 2.4 * bosse;
          halo = Math.max(halo, Math.exp(-(((dist - n.R) / (n.R * 0.9)) ** 2)) * (dist > n.R ? 1 : 0));
          if (dist < n.R * 1.1) {
            const k = 1 - lisse(n.R * 0.85, n.R * 1.08, dist);
            if (k > dansNoeud) { dansNoeud = k; rn = dist / n.R; qxN = qx; qyN = qy;
              fente = n.fente ? Math.exp(-(((qy - 0.12 * n.R * Math.sin(qx / n.R * 4)) / (n.R * 0.03)) ** 2)) * (1 - lisse(0.3, 0.9, Math.abs(qx) / n.R)) : 0; }
          }
        }
        // le cerne : clair au printemps, il fonce peu à peu jusqu'au bois d'été, puis repart net
        const t = r / bo.pas, f = t - Math.floor(t);
        const fort = 0.45 + 0.55 * lisse(-0.25, 0.35, fbm(lx / (500 * ech), t * 0.13, bo.o + 3, 2));
        const tard = (lisse(0.3, 0.9, f) * (1 - lisse(0.9, 1.0, f)) + 0.75 * (1 - lisse(0.0, 0.08, f))) * fort;
        // les fibres et les pores courent le long de la planche
        const fibre = fbm(lx / (90 * ech), ly / (1.3 * ech), bo.o + 4, 3);
        const pore = lisse(0.22, 0.5, perlin(lx / (5 * ech), ly / (0.55 * ech), bo.o + 5)) * (0.5 + 0.5 * tard);
        const brin = perlin(lx / (40 * ech), ly / (0.35 * ech), bo.o + 8);           // les brins, très fins
        const veine = fbm(lx / (1300 * ech), (0.5 * r + 0.5 * ly) / (45 * ech), bo.o + 6, 3);     // les veines de couleur du cœur
        let m = 0.12 + tard * 0.6 + pore * 0.3 + fibre * 0.5 + brin * 0.12 - veine * 0.35 + halo * 0.12;
        m = Math.min(1, Math.max(0, m));
        let R0 = C_TOT[0] + (C_TARD[0] - C_TOT[0]) * m, V0 = C_TOT[1] + (C_TARD[1] - C_TOT[1]) * m, B0 = C_TOT[2] + (C_TARD[2] - C_TOT[2]) * m;
        const ton = bo.ton * (1 + 0.15 * fbm(lx / (900 * ech), ly / (200 * ech), bo.o + 7, 2));
        const rouge = bo.rouge + 0.08 * veine;
        R0 *= ton * (1 + rouge); V0 *= ton; B0 *= ton * (1 - rouge);
        // dans le nœud : ses propres cernes, serrés, roux sombre
        if (dansNoeud > 0) {
          const angle = Math.atan2(qyN, qxN);
          const rk = rn * 4.2 + 1.1 * fbm(Math.cos(angle) * 1.5 + rn, Math.sin(angle) * 1.5, bo.o + 11, 3);
          const fk = rk - Math.floor(rk);
          const rayon = Math.pow(Math.abs(perlin(angle * 2.2, rn * 0.6, bo.o + 12)), 0.5);        // les fibres qui rayonnent
          const mk = 0.5 + 0.16 * lisse(0.3, 0.95, fk) + 0.2 * (1 - rayon) + 0.15 * (1 - lisse(0, 0.35, rn)) + 0.3 * lisse(0.7, 1.0, rn);
          const nr = 96 - 62 * mk, nv = 50 - 34 * mk, nb = 26 - 18 * mk;
          R0 += (nr - R0) * dansNoeud; V0 += (nv - V0) * dansNoeud; B0 += (nb - B0) * dansNoeud;
        }
        const sombre = Math.min(1, fente * 0.9);
        R0 *= 1 - 0.8 * sombre; V0 *= 1 - 0.8 * sombre; B0 *= 1 - 0.8 * sombre;
        // les joints entre planches, et entre deux bouts d'une même planche
        let joint;
        if (dJoint < 1.5) joint = 0.12 + 0.2 * dJoint;
        else joint = 1 - 0.3 * Math.exp(-(dJoint - 1.5) / 3);
        if (py - pl.y >= 2 * ech && py - pl.y < 3.5 * ech) joint *= 1.12;   // l'arête du haut accroche la lumière
        if (pl.bouts.length > 1) {
          const dc = Math.abs(px - pl.bouts[0].a) / ech;
          if (dc < 1.2) joint *= 0.15; else joint *= 1 - 0.25 * Math.exp(-(dc - 1.2) / 2.5);
        }
        const k = (py * W + px) * 4;
        d[k] = R0 * joint; d[k + 1] = V0 * joint; d[k + 2] = B0 * joint; d[k + 3] = 255;
      }
    }
  }
  // --- la lumière : un vernis usé, une lumière douce, le pourtour dans l'ombre ---
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const u = px / W - 0.5, v = py / H - 0.5;
    const vign = 1 - 0.55 * lisse(0.25, 0.75, Math.hypot(u * 1.1, v * 1.3) * 1.25);
    const lum = 1 + 0.12 * Math.exp(-((u + 0.12) ** 2 / 0.08 + (v + 0.18) ** 2 / 0.05));
    const vernis = 1 + 0.05 * fbm(px / 500, py / 500, 77, 3);
    const grain = 1 + 0.03 * (alea() - 0.5);
    const f = vign * lum * vernis * grain, k = (py * W + px) * 4;
    d[k] = Math.min(255, d[k] * f); d[k + 1] = Math.min(255, d[k + 1] * f); d[k + 2] = Math.min(255, d[k + 2] * f);
  }
  ctx.putImageData(img, 0, 0);
  // quelques rayures fines, à peine claires
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 22; i++) {
    const x = alea() * W, y = alea() * H, l = 30 + alea() * 260, a = (alea() - 0.5) * 0.9 + (alea() < 0.5 ? 0 : Math.PI / 2 * (alea() - 0.5));
    ctx.strokeStyle = "rgba(150,110,80," + (0.03 + 0.05 * alea()) + ")"; ctx.lineWidth = 0.6 + alea() * 0.8;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * l / 2 + (alea() - 0.5) * 20, y + Math.sin(a) * l / 2 + (alea() - 0.5) * 20, x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
  return cv;
}
`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch(); const p = await b.newPage();
await p.setContent('<html><body></body></html>'); await p.addScriptTag({ content: GENERATEUR });
const url = await p.evaluate(([W, H, g]) => fabriquerBois(W, H, g).toDataURL("image/jpeg", 0.82), [W, H, GRAINE]);
const sortie = path.join(RACINE, 'images', 'table_bois.jpg');
fs.writeFileSync(sortie, Buffer.from(url.split(",")[1], "base64"));
console.log("images/table_bois.jpg :", W + "×" + H, fs.statSync(sortie).size, "octets");
await b.close();
