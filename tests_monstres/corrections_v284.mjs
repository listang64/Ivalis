// v284 — SANS PEINTURE, UN BORD FIN DE PARCHEMIN, TOUT AUTOUR, PAS ÉPAIS.
//
// Nico : « et sans peinture, fais juste un bord fin en mode parchemin sur
// tout le bord, et pas épais ».
//
// Le calcul du bord (bords_parchemin.js) mesuré à la taille réelle (2048 ×
// 1280), sans zone peinte ; une zone peinte garde ses déchirures. Se charge
// sur l'ancien code (IVALIS_RACINE) : il y échoue, sans planter.
import fs from 'fs';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(76)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const titre = (t) => console.log("\n" + t);
const section = async (corps) => { try { await corps(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 160)); } };
const lire = (f) => { try { return fs.readFileSync(path.join(RACINE, f), 'utf-8'); } catch (e) { return ""; } };

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage();
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.setContent(`<html><body><div id="carte-fond-jeu" style="width:384px;height:216px"></div></body></html>`);
await p.addScriptTag({ content: lire('bords_parchemin.js') });

// =========================================================================
titre("1. SANS PEINTURE : UN BORD FIN, RÉGULIER, TOUT AUTOUR");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const B = window.BordsParchemin, W = 2048, H = 1280, s = Math.min(W, H);
    const etude = (g) => {
      const { masque: m, usure: o } = B.calculer(W, H, g);
      const a = (x, y) => m[(y * W + x) * 4 + 3];
      // La déchirure, sur les quatre côtés, loin des coins.
      const prof = [];
      for (let x = Math.round(0.1 * W); x < 0.9 * W; x += 8) {
        let y = 0; while (y < H / 2 && a(x, y) < 128) y++; prof.push(y / s);
        let y2 = H - 1; while (y2 > H / 2 && a(x, y2) < 128) y2--; prof.push((H - 1 - y2) / s);
      }
      for (let y = Math.round(0.1 * H); y < 0.9 * H; y += 8) {
        let x = 0; while (x < W / 2 && a(x, y) < 128) x++; prof.push(x / s);
        let x2 = W - 1; while (x2 > W / 2 && a(x2, y) < 128) x2--; prof.push((W - 1 - x2) / s);
      }
      const moy = prof.reduce((q, z) => q + z, 0) / prof.length, max = Math.max(...prof);
      // Les coins : à peine usés.
      let coin = 0; while (coin < H / 2 && a(coin, coin) < 128) coin++;
      // Le liseré : marqué (alpha ≥ 60) seulement tout près du bord ; présent sur chaque tronçon des quatre côtés.
      let loin = 0, noir = 0, perces = 0;
      const marge = Math.round(0.03 * s);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, al = o[i * 4 + 3], d = Math.min(x, y, W - 1 - x, H - 1 - y);
        if (m[i * 4 + 3] < 128) { if (d > marge) perces++; continue; }
        if (al < 60) continue;
        if (d / s > 0.02) loin++;
        if ((o[i * 4] + o[i * 4 + 1] + o[i * 4 + 2]) / 3 < 45 && al >= 120) noir++;
      }
      const troncon = (x0, y0, dx, dy, nx, ny) => {     // le long d'un côté : 20 tronçons, chacun a son liseré
        let vides = 0;
        for (let t = 0; t < 20; t++) {
          let vu = false;
          for (let k = 0; k < 40 && !vu; k++) {
            const f = 0.05 + 0.9 * (t + k / 40) / 20;
            const bx = Math.round(x0 + dx * f * (W - 1)), by = Math.round(y0 + dy * f * (H - 1));
            for (let e = 0; e < 0.02 * s && !vu; e++) { const x = bx + nx * e, y = by + ny * e, i = y * W + x; if (m[i * 4 + 3] > 200 && o[i * 4 + 3] >= 60) vu = true; }
          }
          if (!vu) vides++;
        }
        return vides;
      };
      const vides = troncon(0, 0, 1, 0, 0, 1) + troncon(0, H - 1, 1, 0, 0, -1) + troncon(0, 0, 0, 1, 1, 0) + troncon(W - 1, 0, 0, 1, -1, 0);
      return { moy, max, coin: coin / s, loin, noir, perces, vides };
    };
    return Array.from({ length: 6 }, (_, i) => etude(i * 7919 + 13));
  });
  const f = (x) => x.toFixed(4);
  verifier("la déchirure est fine (en moyenne moins de 0,6 % du petit côté)", r.every(x => x.moy > 0.0015 && x.moy < 0.006), JSON.stringify(r.map(x => f(x.moy))));
  verifier("…et pas épaisse nulle part (moins de 1 % au plus creux, coins à moins de 2 %)", r.every(x => x.max < 0.01 && x.coin < 0.02), JSON.stringify(r.map(x => [f(x.max), f(x.coin)])));
  verifier("un liseré de parchemin sur tout le tour (aucun tronçon sans)", r.every(x => x.vides === 0), JSON.stringify(r.map(x => x.vides)));
  verifier("…qui ne mord pas sur la carte (rien de marqué au-delà de 2 %)", r.every(x => x.loin === 0), JSON.stringify(r.map(x => x.loin)));
  verifier("ni trou, ni brûlure", r.every(x => x.perces === 0 && x.noir === 0), JSON.stringify(r.map(x => [x.perces, x.noir])));
});

// =========================================================================
titre("2. LÀ OÙ L'USURE EST PEINTE, ELLE RESTE");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const B = window.BordsParchemin, W = 640, H = 400;
    const cases = new Uint8Array(160 * 100);
    for (let l = 0; l < 100; l++) for (let c = 0; c < 160; c++) if (Math.hypot(c + 0.5 - 40, l + 0.5) <= 14) cases[l * 160 + c] = 1;
    const prof = (m) => { let t = 0, n = 0; for (let x = 115; x < 205; x += 2) { let y = 0; while (y < H / 2 && m[(y * W + x) * 4 + 3] < 128) y++; t += y; n++; } return t / n; };
    return [13, 7932, 15851].map(g => [prof(B.calculer(W, H, g).masque), prof(B.calculer(W, H, g, { colonnes: 160, lignes: 100, cases }).masque)]);
  });
  verifier("un bord peint se déchire toujours profondément", r.every(([nu, z]) => z > 4 * Math.max(1, nu)), JSON.stringify(r.map(([a, z]) => [a.toFixed(1), z.toFixed(1)])));
});

// =========================================================================
titre("3. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json') || "{}").version;
  verifier("version 284 ou plus (trace_combat.js, version.json)", vTrace >= 284 && vJson === vTrace, `${vTrace} / ${vJson}`);
  verifier("bords_parchemin.js a changé de version", Number((html.match(/bords_parchemin\.js\?v=(\d+)/) || [])[1]) >= 3);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
