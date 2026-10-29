// v285 — LA TABLE EN BOIS derrière les cartes (images/table_bois.jpg).
// v286 — un carreau RÉPÉTABLE (sans couture), posé en mosaïque sous la carte
// et qui la suit (glisse, zoom) ; des joints irréguliers, ébréchés, pas noirs.
//
// L'image est fabriquée une fois pour toutes, ici, puis rangée dans le dépôt :
// le jeu ne fait que l'afficher (aucun calcul sur l'iPad). Pour la refaire :
//     node tests_monstres/_fabriquer_table_bois.mjs [graine]
// Planches de noyer sombre : cernes en arches (le tronc coupé de biais), nœuds
// que le fil contourne, fibres et pores, joints entre planches.
import fs from 'fs';
import path from 'path';
const RACINE = process.env.IVALIS_RACINE || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const GRAINE = Number(process.argv[2] || 21), W = 2560, H = 1600;

const GENERATEUR = String.raw`
// La table en bois, en carreau RÉPÉTABLE (v286) : ce qui sort à droite rentre
// à gauche, ce qui sort en bas rentre en haut — la table se pose sous la carte
// en mosaïque, sans couture, et suit la carte quand elle glisse ou zoome.
function fabriquerBois(W, H, graine) {
  let s = graine >>> 0;
  const alea = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const GX = new Float32Array(256), GY = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const a = alea() * Math.PI * 2; GX[i] = Math.cos(a); GY[i] = Math.sin(a); }
  const hache = (i, j, o) => { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(o + 1, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) & 255; };
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const mod = (a, n) => ((a % n) + n) % n;
  // Un bruit de Perlin périodique en x (période px, en cases) ; y libre.
  function perlin(x, y, px, o) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const X0 = mod(xi, px), X1 = mod(xi + 1, px);
    const a = hache(X0, yi, o), b = hache(X1, yi, o), c = hache(X0, yi + 1, o), d = hache(X1, yi + 1, o);
    const g = (h, dx, dy) => GX[h] * dx + GY[h] * dy;
    const u = fade(xf), v = fade(yf);
    const n0 = g(a, xf, yf) + u * (g(b, xf - 1, yf) - g(a, xf, yf));
    const n1 = g(c, xf, yf - 1) + u * (g(d, xf - 1, yf - 1) - g(c, xf, yf - 1));
    return n0 + v * (n1 - n0);
  }
  // u : la place en x sur le carreau (0 → 1) ; fx : combien de cases sur sa largeur.
  const fbm = (u, y, fx, o, n) => { let t = 0, a = 0.5, f = 1, m = 0; for (let i = 0; i < n; i++) { t += a * perlin(u * fx * f, y * f, fx * f, o + i * 7); m += a; a *= 0.5; f *= 2; } return t / m; };
  const lisse = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const ech = H / 1600;
  const enroule = (dx) => dx - W * Math.round(dx / W);

  // --- les planches : leurs joints, irréguliers, d'un bout à l'autre ---
  const NP = 5;
  const hauts = Array.from({ length: NP }, () => 0.8 + 0.4 * alea());
  const somme = hauts.reduce((q, x) => q + x, 0);
  const bases = [0]; for (let k = 0; k < NP; k++) bases.push(bases[k] + hauts[k] / somme * H);
  const joints = [];               // joints[k][px] : la ligne du joint k (k = NP : le joint 0, un carreau plus bas)
  for (let k = 0; k < NP; k++) {
    const ligne = new Float32Array(W), o = 300 + k * 13;
    for (let px = 0; px < W; px++) {
      const u = px / W;
      ligne[px] = bases[k] + ech * (20 * fbm(u, 0.5, 2, o, 3) + 5 * fbm(u, 3.5, 17, o + 3, 2) + 1.2 * fbm(u, 6.5, 120, o + 4, 1));
    }
    joints.push(ligne);
  }
  joints.push(joints[0].map(y => y + H));
  // L'ouverture du joint : fine, inégale, ébréchée par endroits.
  const ouverture = [];
  for (let k = 0; k < NP; k++) {
    const o = new Float32Array(W), g = 400 + k * 17;
    for (let px = 0; px < W; px++) {
      const u = px / W;
      // tantôt les planches se touchent presque, tantôt la fente s'ouvre ; des éclats
      const ebreche = Math.max(0, fbm(u, 7.5, 45, g, 2) - 0.15) * 22;
      o[px] = ech * Math.max(0.4, 0.4 + 4.2 * Math.max(0, 0.5 + 1.4 * fbm(u, 1.5, 7, g + 1, 3)) + ebreche);
    }
    ouverture.push(o);
  }
  ouverture.push(ouverture[0]);

  const planches = [];
  for (let k = 0; k < NP; k++) {
    const h = bases[k + 1] - bases[k];
    // 0 ou 2 coupes : deux longueurs de bois aboutées (celle qui passe le bord du carreau s'y raccorde).
    const coupes = alea() < 0.5 ? [] : (() => { const a = alea() * W, l = W * (0.3 + 0.4 * alea()); return [a, a + l]; })();
    const nb = coupes.length ? 2 : 1;
    const bouts = [];
    for (let b2 = 0; b2 < nb; b2++) {
      const noeuds = [];
      const n = alea() < 0.3 ? 0 : (alea() < 0.65 ? 1 : 2);
      for (let j = 0; j < n; j++) {
        const R = h * (0.035 + 0.06 * alea());
        let x = alea() * W;
        if (nb === 2) { const de = b2 === 1 ? coupes[0] : coupes[1], l = b2 === 1 ? coupes[1] - coupes[0] : W - (coupes[1] - coupes[0]); x = de + (0.15 + 0.7 * alea()) * l; }
        noeuds.push({ x: mod(x, W), y: (alea() - 0.5) * h * 0.75, R, ex: 1.2 + 0.6 * alea(), ang: (alea() - 0.5) * 0.3, fente: alea() < 0.35 });
      }
      bouts.push({ y0: (alea() < 0.5 ? -1 : 1) * h * (0.35 + 0.6 * alea()), z0: h * (0.25 + 0.4 * alea()), amplZ: h * (0.3 + 0.5 * alea()), pente: h * (0.1 + 0.2 * alea()),
        pas: H * (0.0045 + 0.005 * alea()), ton: 0.85 + 0.25 * alea(), rouge: (alea() - 0.5) * 0.14, o: Math.floor(alea() * 1000), noeuds });
    }
    planches.push({ h, coupes, bouts, o: k * 31 + 5 });
  }

  const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d"); const img = ctx.createImageData(W, H); const d = img.data;
  const C_TOT = [98, 60, 35], C_TARD = [38, 20, 10], C_JOINT = [40, 24, 13];

  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const u = px / W;
      let y = py; if (y < joints[0][px]) y += H;
      let k = 0; while (k < NP - 1 && y >= joints[k + 1][px]) k++;
      const pl = planches[k];
      const haut = y - joints[k][px], bas = joints[k + 1][px] - y;
      const ly = y - (bases[k] + bases[k + 1]) / 2;
      // le bout de planche, et la coupe la plus proche
      let bi = 0, dc = 1e9;
      if (pl.coupes.length) {
        const gig = (c) => c + ech * (9 * fbm(0.5, (py + c) / (90 * ech), 1, pl.o + 9, 3) + 0.03 * (y - bases[k]));
        const c1 = gig(pl.coupes[0]), c2 = gig(pl.coupes[1]);
        const xx = px < c1 - W / 2 ? px + W : px;
        bi = (xx >= c1 && xx < c2) || (px + W >= c1 && px + W < c2) ? 1 : 0;
        dc = Math.min(Math.abs(enroule(px - c1)), Math.abs(enroule(px - c2)));
      }
      const bo = pl.bouts[bi];
      // les cernes : le tronc coupé de biais et qui s'effile — des arches
      const meandre = 0.12 * pl.h * fbm(u, 0.5, 2, bo.o, 3) + bo.pente * fbm(u, 9.5, 1, bo.o + 13, 2);
      const dy = ly - bo.y0 - meandre;
      const dz = bo.z0 + bo.amplZ * (0.5 + fbm(u, 3.3, 2, bo.o + 1, 2));
      let r = Math.sqrt(dy * dy + dz * dz);
      r += 2.2 * ech * fbm(u, ly / (30 * ech), 16, bo.o + 2, 4);
      let dansNoeud = 0, rn = 0, fente = 0, halo = 0, qxN = 0, qyN = 0;
      for (const n of bo.noeuds) {
        const ax = enroule(px - n.x), ay = ly - n.y;
        const ca = Math.cos(n.ang), sa = Math.sin(n.ang);
        const qx = (ax * ca + ay * sa) / n.ex, qy = -ax * sa + ay * ca;
        const dist = Math.hypot(qx, qy) * (1 + 0.1 * fbm(0.5, qy / n.R * 1.5 + qx / n.R * 0.7, 1, bo.o + 9, 2));
        const bosse = Math.exp(-((ax / (n.R * n.ex * 3.2)) ** 2 + (ay / (n.R * 2.2)) ** 2));
        r += n.R * 2.4 * bosse;
        halo = Math.max(halo, Math.exp(-(((dist - n.R) / (n.R * 0.9)) ** 2)) * (dist > n.R ? 1 : 0));
        if (dist < n.R * 1.1) {
          const kk = 1 - lisse(n.R * 0.85, n.R * 1.08, dist);
          if (kk > dansNoeud) { dansNoeud = kk; rn = dist / n.R; qxN = qx; qyN = qy;
            fente = n.fente ? Math.exp(-(((qy - 0.12 * n.R * Math.sin(qx / n.R * 4)) / (n.R * 0.03)) ** 2)) * (1 - lisse(0.3, 0.9, Math.abs(qx) / n.R)) : 0; }
        }
      }
      const t = r / bo.pas, f = t - Math.floor(t);
      const fort = 0.45 + 0.55 * lisse(-0.25, 0.35, fbm(u, t * 0.13, 5, bo.o + 3, 2));
      const tard = (lisse(0.3, 0.9, f) * (1 - lisse(0.9, 1.0, f)) + 0.75 * (1 - lisse(0.0, 0.08, f))) * fort;
      // les fibres et les pores courent le long de la planche
      const fibre = fbm(u, ly / (1.3 * ech), 28, bo.o + 4, 3);
      const pore = lisse(0.22, 0.5, perlin(u * 512, ly / (0.55 * ech), 512, bo.o + 5)) * (0.5 + 0.5 * tard);
      const brin = perlin(u * 64, ly / (0.35 * ech), 64, bo.o + 8);
      const veine = fbm(u, (0.5 * r + 0.5 * ly) / (45 * ech), 2, bo.o + 6, 3);
      let m = 0.12 + tard * 0.6 + pore * 0.3 + fibre * 0.5 + brin * 0.12 - veine * 0.35 + halo * 0.12;
      m = Math.min(1, Math.max(0, m));
      let R0 = C_TOT[0] + (C_TARD[0] - C_TOT[0]) * m, V0 = C_TOT[1] + (C_TARD[1] - C_TOT[1]) * m, B0 = C_TOT[2] + (C_TARD[2] - C_TOT[2]) * m;
      const ton = bo.ton * (1 + 0.15 * fbm(u, ly / (200 * ech), 3, bo.o + 7, 2));
      const rouge = bo.rouge + 0.08 * veine;
      R0 *= ton * (1 + rouge); V0 *= ton; B0 *= ton * (1 - rouge);
      if (dansNoeud > 0) {
        const angle = Math.atan2(qyN, qxN);
        const rk = rn * 4.2 + 1.1 * fbm(0.5, Math.cos(angle) * 1.5 + rn + Math.sin(angle) * 2.1, 1, bo.o + 11, 3);
        const fk = rk - Math.floor(rk);
        const rayon = Math.pow(Math.abs(perlin(angle * 2.2, rn * 0.6, 1e6, bo.o + 12)), 0.5);
        const mk = 0.5 + 0.16 * lisse(0.3, 0.95, fk) + 0.2 * (1 - rayon) + 0.15 * (1 - lisse(0, 0.35, rn)) + 0.3 * lisse(0.7, 1.0, rn);
        const nr = 96 - 62 * mk, nv = 50 - 34 * mk, nb = 26 - 18 * mk;
        R0 += (nr - R0) * dansNoeud; V0 += (nv - V0) * dansNoeud; B0 += (nb - B0) * dansNoeud;
      }
      const sombre = Math.min(1, fente * 0.9);
      R0 *= 1 - 0.8 * sombre; V0 *= 1 - 0.8 * sombre; B0 *= 1 - 0.8 * sombre;
      // LES JOINTS : une fente fine et inégale, brun très sombre (pas noire),
      // des arêtes arrondies et usées, plus ou moins marquées.
      const oH = ouverture[k][px], oB = ouverture[k + 1][px];
      const usure = 0.45 + 0.55 * Math.min(1, Math.max(0, 0.5 + 1.4 * fbm(u, k * 3.7, 14, pl.o + 21, 3)));
      let creux = 0, eclat = 0;
      if (haut < oH) creux = Math.max(creux, 1);
      else creux = Math.max(creux, usure * 0.4 * Math.exp(-(haut - oH) / ((1.5 + 2.5 * usure) * ech)));
      if (bas < oB) creux = Math.max(creux, 1);
      else creux = Math.max(creux, usure * 0.55 * Math.exp(-(bas - oB) / ((2 + 3 * usure) * ech)));
      // l'arête du haut d'une planche accroche un peu de lumière
      if (haut >= oH) eclat = 0.16 * usure * Math.exp(-(((haut - oH - 2 * ech) / (1.6 * ech)) ** 2));
      if (bas >= oB) eclat = Math.max(eclat, 0.07 * usure * Math.exp(-(((bas - oB - 1.2 * ech) / (0.9 * ech)) ** 2)));
      if (dc < 1e8) {
        const oc = ech * Math.max(0.4, 0.5 + 3 * Math.max(0, 0.5 + 1.4 * fbm(0.5, py / (40 * ech), 1, pl.o + 23, 2)));
        if (dc < oc) creux = Math.max(creux, 0.95);
        else creux = Math.max(creux, usure * 0.5 * Math.exp(-(dc - oc) / (2 * ech)));
      }
      const fond = creux >= 1 ? 1 : creux;
      const jr = C_JOINT[0] * (0.7 + 0.3 * fibre), jv = C_JOINT[1] * (0.7 + 0.3 * fibre), jb = C_JOINT[2] * (0.7 + 0.3 * fibre);
      if (creux >= 0.95) { R0 = R0 * 0.4 + jr * 0.6; V0 = V0 * 0.4 + jv * 0.6; B0 = B0 * 0.4 + jb * 0.6; }
      else { R0 *= 1 - 0.45 * fond; V0 *= 1 - 0.45 * fond; B0 *= 1 - 0.45 * fond; }
      R0 *= 1 + eclat; V0 *= 1 + eclat; B0 *= 1 + eclat;
      const grain = 1 + 0.03 * (alea() - 0.5);
      const i = (py * W + px) * 4;
      d[i] = R0 * grain; d[i + 1] = V0 * grain; d[i + 2] = B0 * grain; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // quelques rayures fines, à peine claires (redessinées de l'autre côté du bord)
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 26; i++) {
    const x = alea() * W, y = alea() * H, l = (20 + alea() * 120) * ech, a = (alea() - 0.5) * 0.9 + (alea() < 0.5 ? 0 : Math.PI / 2 * (alea() - 0.5));
    const c1 = (alea() - 0.5) * 20, c2 = (alea() - 0.5) * 20;
    ctx.strokeStyle = "rgba(150,110,80," + (0.03 + 0.05 * alea()) + ")"; ctx.lineWidth = 0.6 + alea() * 0.8;
    for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) {
      ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.quadraticCurveTo(x + ox + Math.cos(a) * l / 2 + c1, y + oy + Math.sin(a) * l / 2 + c2, x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); ctx.stroke();
    }
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
