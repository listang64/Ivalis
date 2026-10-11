// LES MURS DE PIERRE DU STUDIO : ILS SORTENT DE TERRE ENSEMBLE, DANS LA
// POUSSIÈRE ET LES CAILLOUX (v236).
//
// Nico : « Dans le Studio, on va revoir l'animation du mur de pierre. On garde
// le fait qu'il sorte de terre comme ça, juste il faut que tous les murs de
// pierre sortent de terre en même temps. De plus, fais un effet de nuage de
// poussière et des cailloux qui volent de partout avant de disparaître en
// fondu. Pareil pour l'animation du mur détruit : nuage de poussière. »
//
//   • « Mur de terre » : chaque case touchée lève sa roche (le dessin du jeu)
//     AU MÊME INSTANT — avant, elles sortaient l'une après l'autre ;
//   • au pied de chaque mur, un nuage de poussière qui gonfle, roule et se
//     dissipe, et des cailloux projetés en cloche dans toutes les directions,
//     qui retombent puis s'effacent en fondu ;
//   • l'animation dure le temps que tout retombe : rien n'est coupé net, rien
//     ne reste, et les murs restent sur la carte ;
//   • « Mur de terre effondré » : un plus gros nuage, plus large, et ses
//     cailloux ; les gravats restent.
import { ouvrirStudio } from './_studio_commun.mjs';

const { p, verifier, fin } = await ouvrirStudio();

// Les espions : chaque bouffée de poussière et chaque caillou posés, avec
// leurs images clés, leur départ et l'heure où leur animation finit.
await p.evaluate(() => {
  window.__case = (id) => { const el = document.getElementById(id); return { q: +el.dataset.q, r: +el.dataset.r }; };
  window.__relever = () => {
    const vus = { poussiere: [], caillou: [], murs: [], removedAvantFin: 0 };
    const t0 = performance.now();
    const noter = (el) => {
      if (!el.classList) return;
      const sorte = el.classList.contains("anim-poussiere") ? "poussiere" : el.classList.contains("anim-caillou") ? "caillou" : null;
      if (sorte) {
        // L'animation est lancée juste après la pose : on la lit au prochain tour.
        queueMicrotask(() => {
          const an = el.getAnimations()[0];
          const tm = an ? an.effect.getComputedTiming() : null;
          const kf = an ? an.effect.getKeyframes() : [];
          vus[sorte].push({ el, x: parseFloat(el.style.left), y: parseFloat(el.style.top),
                            fin: performance.now() + (tm ? tm.delay + tm.duration : 0), kf });
        });
      }
      if (el.classList.contains("anim-mur")) {
        queueMicrotask(() => {
          const roche = el.querySelector("canvas");
          const an = roche ? roche.getAnimations()[0] : null;
          vus.murs.push({ depart: performance.now() - t0 + (an ? an.effect.getComputedTiming().delay : 0) });
        });
      }
    };
    const obs = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(noter)));
    obs.observe(document.getElementById("studio-pions"), { childList: true, subtree: true });
    vus.arreter = () => obs.disconnect();
    return vus;
  };
  // Où va un élément animé : le déplacement de sa dernière image clé, et le
  // plus haut qu'il monte (y le plus négatif).
  window.__trajet = (kf) => {
    const xy = (k) => {
      // (Le navigateur réécrit « -50% + -12px » en « -50% - 12px ».)
      const m = String(k.transform || "").match(/translate\(calc\(-50% ([+-]) ([\d.]+)px\), calc\(-50% ([+-]) ([\d.]+)px\)\)/);
      return m ? { x: (m[1] === "-" ? -1 : 1) * +m[2], y: (m[3] === "-" ? -1 : 1) * +m[4] } : { x: 0, y: 0 };
    };
    const pts = kf.map(xy);
    return { fin: pts[pts.length - 1], haut: Math.min(...pts.map(q => q.y)), opaciteFin: +kf[kf.length - 1].opacity,
             opaciteMax: Math.max(...kf.map(k => +(k.opacity === undefined ? 1 : k.opacity))) };
  };
});

// Trois cases en ligne au nord du héros.
const ligne = await p.evaluate(() => {
  window.replacerPionsStudio();
  const h = window.__case("studio-pion-heros");
  return [{ q: h.q - 1, r: h.r - 1 }, { q: h.q, r: h.r - 2 }, { q: h.q + 1, r: h.r - 3 }];
});

console.log("\n1. « MUR DE TERRE » : TOUS LES MURS SORTENT DE TERRE EN MÊME TEMPS");
const r = await p.evaluate(async (ligne) => {
  const vus = window.__relever();
  const t0 = performance.now();
  await window.jouerAnimationStudio("mur-terre", { cases: ligne });
  const duree = performance.now() - t0;
  vus.arreter();
  const finMax = Math.max(...vus.poussiere.map(v => v.fin), ...vus.caillou.map(v => v.fin));
  const trajets = (liste) => liste.map(v => ({ ...window.__trajet(v.kf), x: v.x, y: v.y }));
  const res = { murs: vus.murs.map(m => Math.round(m.depart)), poussiere: trajets(vus.poussiere), caillou: trajets(vus.caillou),
                restent: document.querySelectorAll("#studio-pions .anim-poussiere, #studio-pions .anim-caillou").length,
                surCarte: window.terrainStudio().murs.length, avantFin: Math.round(performance.now() - finMax), duree: Math.round(duree) };
  return res;
}, ligne);
verifier("trois murs levés, qui restent sur la carte", r.murs.length === 3 && r.surCarte === 3, `${r.murs.length} / ${r.surCarte}`);
verifier("ils sortent de terre AU MÊME INSTANT (écart < 40 ms)", r.murs.length === 3 && Math.max(...r.murs) - Math.min(...r.murs) < 40, JSON.stringify(r.murs));

console.log("\n2. UN NUAGE DE POUSSIÈRE AU PIED DE CHAQUE MUR");
{
  const P = r.poussiere;
  verifier("des bouffées de poussière (au moins dix par mur)", P.length >= 30, String(P.length));
  // Toutes roulent vers l'extérieur ; le nuage, dans son ensemble, monte
  // (celles qui roulent vers nous peuvent finir un peu plus bas).
  const montee = P.reduce((t, b) => t + b.fin.y, 0) / Math.max(1, P.length);
  verifier("elles gonflent et roulent vers l'extérieur, le nuage monte", P.length > 0 && P.every(t => Math.hypot(t.fin.x, t.fin.y) > 4) && montee < -5,
           `montée moyenne ${montee.toFixed(1)} px`);
  verifier("puis se dissipent en fondu (dernière image : opacité 0)", P.length > 0 && P.every(t => t.opaciteFin === 0 && t.opaciteMax > 0.5));
}

console.log("\n3. DES CAILLOUX QUI VOLENT DE PARTOUT, PUIS S'EFFACENT EN FONDU");
{
  const C = r.caillou;
  verifier("des cailloux projetés (au moins douze par mur)", C.length >= 36, String(C.length));
  verifier("en cloche : ils montent avant de retomber", C.length > 0 && C.every(t => t.haut < t.fin.y - 5), JSON.stringify(C.slice(0, 2)));
  // De partout : autour de chaque mur, ils partent dans les quatre quarts.
  const quarts = new Set(C.map(t => (t.fin.x >= 0 ? "E" : "O") + (t.fin.y >= 0 ? "S" : "N")));
  verifier("dans toutes les directions (les quatre quarts autour du mur)", quarts.size === 4, [...quarts].join(","));
  verifier("et finissent en fondu (dernière image : opacité 0)", C.length > 0 && C.every(t => t.opaciteFin === 0 && t.opaciteMax === 1));
}

console.log("\n4. RIEN N'EST COUPÉ NET, RIEN NE RESTE");
verifier("l'animation attend que la poussière retombe et que les cailloux s'effacent", r.avantFin >= -30, `${r.avantFin} ms (durée ${r.duree} ms)`);
verifier("plus une bouffée ni un caillou une fois finie", r.restent === 0, String(r.restent));

console.log("\n5. « MUR DE TERRE EFFONDRÉ » : UN GROS NUAGE DE POUSSIÈRE");
{
  const e = await p.evaluate(async (c) => {
    const vus = window.__relever();
    await window.jouerAnimationStudio("mur-effondre", { cases: [c] });
    vus.arreter();
    const finMax = Math.max(...vus.poussiere.map(v => v.fin), ...vus.caillou.map(v => v.fin));
    const portee = (liste) => Math.max(...liste.map(v => { const t = window.__trajet(v.kf); return Math.hypot(t.fin.x, t.fin.y); }));
    return { poussiere: vus.poussiere.length, caillou: vus.caillou.length, fondu: [...vus.poussiere, ...vus.caillou].every(v => +v.kf[v.kf.length - 1].opacity === 0),
             portee: Math.round(portee(vus.poussiere)), gravats: window.terrainStudio().gravats, avantFin: Math.round(performance.now() - finMax),
             restent: document.querySelectorAll("#studio-pions .anim-poussiere, #studio-pions .anim-caillou").length, c: `${c.q}_${c.r}` };
  }, ligne[1]);
  verifier("le mur qui tombe soulève un gros nuage (au moins quatorze bouffées)", e.poussiere >= 14, String(e.poussiere));
  verifier("et projette ses cailloux de partout", e.caillou >= 16, String(e.caillou));
  verifier("tout s'efface en fondu, sans rien couper ni laisser", e.fondu && e.avantFin >= -30 && e.restent === 0, JSON.stringify(e));
  verifier("le tas de gravats reste sur la case", e.gravats.includes(e.c), JSON.stringify(e.gravats));
  // Plus large que celui d'un mur qui sort.
  const sortie = Math.max(...r.poussiere.map(t => Math.hypot(t.fin.x, t.fin.y)));
  verifier("un nuage plus large que celui d'un mur qui sort", e.portee > sortie, `${e.portee} px contre ${Math.round(sortie)} px`);
}

// Pour les yeux : les murs qui sortent ensemble, dans la poussière ; l'effondrement.
{
  const D = '/tmp/claude-0';
  // Une muraille au sud du héros, bien dans le cadre.
  const vue = await p.evaluate(() => {
    window.replacerPionsStudio(); window.recentrerStudio();
    const h = window.__case("studio-pion-heros");
    return [{ q: h.q - 2, r: h.r + 1 }, { q: h.q - 1, r: h.r + 1 }, { q: h.q, r: h.r + 1 }];
  });
  await p.evaluate((vue) => { window.jouerAnimationStudio("mur-terre", { cases: vue }); }, vue);
  await p.waitForTimeout(260);
  await p.locator(".studio-scene").screenshot({ path: `${D}/v236_murs_sortent.png` });
  await p.waitForTimeout(450);
  await p.locator(".studio-scene").screenshot({ path: `${D}/v236_murs_cailloux.png` });
  await p.waitForTimeout(2600);
  await p.evaluate((c) => { window.jouerAnimationStudio("mur-effondre", { cases: [c] }); }, vue[1]);
  await p.waitForTimeout(1150);
  await p.locator(".studio-scene").screenshot({ path: `${D}/v236_mur_effondre.png` });
  await p.waitForTimeout(3000);
}

await fin();
