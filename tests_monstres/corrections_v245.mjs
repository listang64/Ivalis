// LES ZONES DE POISON ET DE FOUDRE DU STUDIO, PROCÉDURALES (v245).
//
// Nico : « Après, dans le Studio, refais dans le même état d'esprit les zones
// poison et électrique. »
//
//   1. LE POISON : un seul marais (zones_procedurales.js), sans contour ; une
//      boue verte translucide ; des bulles qui gonflent et crèvent ; un miasme
//      lourd qui rampe sous le vent ;
//   2. LA FOUDRE : un seul champ, sans contour ; un sol à peine bleui ; des
//      brûlures ramifiées (Lichtenberg) dont la lueur grésille ; des arcs qui
//      claquent un instant, au hasard ; un voile de plasma ; des étincelles
//      qui crépitent ;
//   3. L'UN ET L'AUTRE : l'élément gagne depuis le cœur ; deux zones collées
//      sans couture ; le même dessin pour les mêmes cases ;
//   4. LE TERRAIN : une case n'a qu'un élément (les quatre) ; « Replacer »
//      efface tout ; le combat garde ses nappes.
import { ouvrirStudio } from './_studio_commun.mjs';

const { p, verifier, fin } = await ouvrirStudio();

const fleur = (c) => [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => ({ q: c.q + dq, r: c.r + dr }));
const A = fleur({ q: 3, r: -3 }), B = fleur({ q: 5, r: -4 });
// (Sur l'ancien code, pas de plaque : le banc compte ce qui manque au lieu de planter.)
const COUCHE = (type) => `(typeof window.coucheStudio === "function" && window.coucheStudio("${type}")) || { opaciteEn: () => 0, couvertureEn: () => 0, braisesEn: () => 0, voileEn: () => 0, vent: () => ({ angle: 0 }) }`;

// Ce qu'une plaque donne à voir : sa couleur moyenne, son opacité, ce qui la couvre.
const releve = (type, conteneur, classe) => p.evaluate(({ type, conteneur, classe, A, C }) => {
  const c = (0, eval)(C);
  const P = (x) => window.PLATEAU_VTT.hexToPixel(x.q, x.r);
  const sol = document.querySelector(`#${conteneur} canvas.${classe}-sol`);
  let n = 0, r = 0, g = 0, b = 0, a = 0;
  if (sol) {
    const d = sol.getContext("2d").getImageData(0, 0, sol.width, sol.height).data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 30) { n++; r += d[i]; g += d[i + 1]; b += d[i + 2]; a += d[i + 3]; }
  }
  return { plaques: document.querySelectorAll(`#${conteneur} .${classe}-couche`).length,
           zones: window.terrainStudio().zones.filter(z => z.type === type).length,
           nappes: document.querySelectorAll(`#studio-zones .studio-nappe[data-type="${type}"]`).length,
           traits: document.querySelectorAll(`#${conteneur} polygon, #${conteneur} path, #${conteneur} line`).length,
           centres: A.map(x => +c.couvertureEn(P(x).x, P(x).y).toFixed(2)), loin: c.couvertureEn(P({ q: 8, r: -6 }).x, P({ q: 8, r: -6 }).y),
           couleur: n ? [r / n, g / n, b / n].map(Math.round) : [0, 0, 0], alpha: n ? a / n / 255 : 0 };
}, { type, conteneur, classe, A, C: COUCHE(type) });

console.log("\n1. LE POISON : UN MARAIS, DES BULLES, UN MIASME SOUS LE VENT");
{
  const joue = await p.evaluate(async (A) => { window.replacerPionsStudio(); return window.jouerAnimationStudio("zone-poison", { cases: A }); }, A);
  const r = await releve("poison", "studio-poison", "poison");
  verifier("la zone de poison se joue ; ses 7 cases sont du poison sur le terrain", joue && r.zones === 7, JSON.stringify({ joue, zones: r.zones }));
  verifier("UN marais, pas une nappe par case ; aucun trait (pas de contour)", r.plaques === 1 && r.nappes === 0 && r.traits === 0, JSON.stringify(r));
  verifier("il couvre le centre de chaque case, et rien loin de lui", r.centres.every(x => x > 0.9) && r.loin === 0, JSON.stringify(r.centres));
  verifier("une boue verte (le vert l'emporte), translucide", r.couleur[1] > r.couleur[0] && r.couleur[0] > r.couleur[2] && r.alpha > 0.2 && r.alpha < 0.75,
           JSON.stringify({ couleur: r.couleur, alpha: +r.alpha.toFixed(2) }));
  const b = await p.evaluate(({ A, C }) => {
    const c = (0, eval)(C);
    const bulles = [...document.querySelectorAll("#studio-poison .poison-bulle")];
    const crevent = bulles.length > 0 && bulles.every(e => e.getAnimations().some(a => {
      const k = a.effect.getKeyframes(), max = Math.max(...k.map(f => +((f.transform || "").match(/scale\(([\d.]+)\)/) || [0, 0])[1]));
      return a.effect.getComputedTiming().iterations === Infinity && max > 1.2 && +k[k.length - 2].opacity === 0;
    }));
    const tailles = new Set(bulles.map(e => e.style.width)).size;
    const miasme = document.querySelector("#studio-poison .poison-miasme");
    const voiles = miasme ? [...miasme.querySelectorAll(".poison-voile")] : [];
    // Le miasme rampe sous le vent : il déborde en aval (B est en aval de A), presque pas en amont.
    const P = (x) => window.PLATEAU_VTT.hexToPixel(x.q, x.r), v = c.vent(), R = window.PLATEAU_VTT.hexSize, ca = P(A[0]);
    let sous = 0, au = 0;
    for (let d = 3.25; d <= 3.7; d += 0.09) { sous += c.voileEn("miasme", ca.x + Math.cos(v.angle) * R * d, ca.y + Math.sin(v.angle) * R * d);
                                          au += c.voileEn("miasme", ca.x - Math.cos(v.angle) * R * d, ca.y - Math.sin(v.angle) * R * d); }
    return { bulles: bulles.length, crevent, tailles, voiles: voiles.length,
             lent: voiles.every(x => x.getAnimations().some(a => (a.effect.getKeyframes()[0].transform || "").includes("translateX") && a.effect.getComputedTiming().duration > 15000)),
             sous, au };
  }, { A, C: COUCHE("poison") });
  verifier("des bulles, de tailles diverses, qui gonflent et crèvent sans fin", b.bulles >= 14 && b.crevent && b.tailles > 3, JSON.stringify(b));
  verifier("un miasme : deux voiles qui dérivent lentement (un gaz lourd)", b.voiles === 2 && b.lent, JSON.stringify(b));
  verifier("…qui rampe sous le vent (au-delà du bord en aval, presque rien en amont)", b.sous > 1 && b.sous > b.au * 3, `${b.sous.toFixed(2)} / ${b.au.toFixed(2)}`);
}

console.log("\n2. LA FOUDRE : UN CHAMP, DES BRÛLURES QUI GRÉSILLENT, DES ARCS QUI CLAQUENT");
{
  const joue = await p.evaluate(async (A) => { window.replacerPionsStudio(); return window.jouerAnimationStudio("zone-foudre", { cases: A }); }, A);
  const r = await releve("electrique", "studio-electrique", "elec");
  verifier("la zone de foudre se joue ; ses 7 cases sont « électriques » sur le terrain (comme au combat)", joue && r.zones === 7, JSON.stringify({ joue, zones: r.zones }));
  verifier("UN champ, pas une nappe par case ; aucun trait vectoriel (pas de contour)", r.plaques === 1 && r.nappes === 0 && r.traits === 0, JSON.stringify(r));
  verifier("il couvre le centre de chaque case, et rien loin de lui", r.centres.every(x => x > 0.9) && r.loin === 0, JSON.stringify(r.centres));
  verifier("le sol à peine bleui (le bleu l'emporte, très translucide)", r.couleur[2] > r.couleur[0] && r.alpha < 0.45, JSON.stringify({ couleur: r.couleur, alpha: +r.alpha.toFixed(2) }));
  const e = await p.evaluate(() => {
    const lueur = document.querySelector("#studio-electrique canvas.elec-braises"), halo = document.querySelector("#studio-electrique canvas.elec-halo");
    let traits = 0, bleus = 0;
    if (lueur) {
      const d = lueur.getContext("2d").getImageData(0, 0, lueur.width, lueur.height).data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 60) { traits++; if (d[i + 2] > d[i] && d[i + 2] > 200) bleus++; }
    }
    const vite = (el) => !!el && el.getAnimations().some(a => a.effect.getComputedTiming().iterations === Infinity && a.effect.getComputedTiming().duration < 1500);
    const arcs = [...document.querySelectorAll("#studio-electrique .elec-arcs canvas")];
    const claquent = arcs.length > 0 && arcs.every(c => c.getAnimations().some(a => {
      const k = a.effect.getKeyframes();
      return a.effect.getComputedTiming().iterations === Infinity && Math.max(...k.map(f => +f.opacity)) === 1 && +k[0].opacity === 0 && +k[k.length - 1].opacity === 0;
    }));
    const dessines = arcs.every(c => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) return true; return false; });
    const plasma = document.querySelector("#studio-electrique .elec-plasma");
    const etincelles = [...document.querySelectorAll("#studio-electrique .elec-etincelle")];
    return { traits, bleus, ecran: !!lueur && getComputedStyle(lueur).mixBlendMode === "screen", vite: vite(lueur) && vite(halo),
             arcs: arcs.length, claquent, dessines, plasma: !!plasma && /zone-proc-ecran/.test(plasma.className),
             etincelles: etincelles.length, crepitent: etincelles.every(x => x.getAnimations().some(a => a.effect.getComputedTiming().duration < 2500)) };
  });
  verifier("des brûlures ramifiées dont la lueur bleu-blanc s'éclaire (écran)", e.traits > 300 && e.bleus > e.traits * 0.5 && e.ecran, JSON.stringify(e));
  verifier("…et grésille (une respiration rapide, lueur et halo)", e.vite, JSON.stringify(e));
  verifier("six arcs, dessinés, qui claquent chacun un instant puis s'éteignent", e.arcs === 6 && e.claquent && e.dessines, JSON.stringify(e));
  verifier("un voile de plasma (écran) ; des étincelles qui crépitent vite", e.plasma && e.etincelles >= 14 && e.crepitent, JSON.stringify(e));
}

console.log("\n3. L'UN ET L'AUTRE : LE CŒUR D'ABORD, SANS COUTURE, PROCÉDURAL");
for (const [id, type, conteneur, classe] of [["zone-poison", "poison", "studio-poison", "poison"], ["zone-foudre", "electrique", "studio-electrique", "elec"]]) {
  const r = await p.evaluate(async ({ id, type, conteneur, classe, A, B, C }) => {
    window.replacerPionsStudio();
    const P = (x) => window.PLATEAU_VTT.hexToPixel(x.q, x.r);
    const fini = window.jouerAnimationStudio(id, { cases: A });
    await new Promise(r => setTimeout(r, 450));
    const sol = document.querySelector(`#${conteneur} canvas.${classe}-sol`);
    const couche = sol && sol.parentElement;
    const lire = (x) => {
      if (!sol) return -1;
      const k = sol.width / parseFloat(couche.style.width);
      const i = Math.floor((P(x).x - parseFloat(couche.style.left)) * k), j = Math.floor((P(x).y - parseFloat(couche.style.top)) * k);
      const d = sol.getContext("2d").getImageData(i - 6, j - 6, 13, 13).data;
      let s = 0; for (let n = 3; n < d.length; n += 4) s += d[n];
      return s / (d.length / 4) / 255;
    };
    const mi = { coeur: lire(A[0]), bord: Math.max(...A.slice(1).map(lire)) };
    await fini;
    await window.jouerAnimationStudio(id, { cases: B });
    const c = (0, eval)(C);
    const a = P(A[0]), b = P(B[0]), trait = [];
    for (let i = 0; i <= 24; i++) trait.push(c.couvertureEn(a.x + (b.x - a.x) * i / 24, a.y + (b.y - a.y) * i / 24));
    // Le même dessin pour les mêmes cases.
    const opts = { type, R: window.PLATEAU_VTT.hexSize, pixel: (q, r) => window.PLATEAU_VTT.hexToPixel(q, r), graine: 7 };
    let memes = false;
    if (typeof window.creerCoucheProcedurale === "function" && document.getElementById(conteneur)) {
      const somme = (x) => { const s = x.el.querySelector("canvas"); const d = s.getContext("2d").getImageData(0, 0, s.width, s.height).data;
                             let t = 0; for (let i = 0; i < d.length; i += 7) t = (t * 31 + d[i]) % 1000003; return t; };
      const c1 = window.creerCoucheProcedurale(document.getElementById(conteneur), opts), c2 = window.creerCoucheProcedurale(document.getElementById(conteneur), opts);
      c1.poser(A); c2.poser(A); memes = somme(c1) === somme(c2) && somme(c1) > 0; c1.detruire(); c2.detruire();
    }
    return { mi, plaques: document.querySelectorAll(`#${conteneur} .${classe}-couche`).length, zones: window.terrainStudio().zones.length, min: Math.min(...trait), memes };
  }, { id, type, conteneur, classe, A, B, C: COUCHE(type) });
  verifier(`${type} : à mi-chemin, le cœur est pris, le bord pas encore`, r.mi.coeur > 0.1 && r.mi.bord < r.mi.coeur * 0.6, JSON.stringify(r.mi));
  verifier(`${type} : deux zones collées, une seule plaque de 12 cases, sans couture`, r.plaques === 1 && r.zones === 12 && r.min > 0.95, JSON.stringify(r));
  verifier(`${type} : le même dessin pour les mêmes cases`, r.memes);
}

console.log("\n4. LE TERRAIN : UN ÉLÉMENT PAR CASE, « REPLACER », LE COMBAT");
{
  const r = await p.evaluate(async ({ A, CP, CE }) => {
    window.replacerPionsStudio();
    const P = (x) => window.PLATEAU_VTT.hexToPixel(x.q, x.r);
    await window.jouerAnimationStudio("zone-poison", { cases: A });
    const c = A[3];
    const avant = (0, eval)(CP).couvertureEn(P(c).x, P(c).y);
    await window.jouerAnimationStudio("zone-foudre", { cases: [c] });
    const t = window.terrainStudio();
    const res = { avant, apres: (0, eval)(CP).couvertureEn(P(c).x, P(c).y), charge: (0, eval)(CE).couvertureEn(P(c).x, P(c).y),
                  types: t.zones.filter(z => z.q === c.q && z.r === c.r).map(z => z.type), poison: t.zones.filter(z => z.type === "poison").length };
    // Les quatre ensemble, puis « Replacer ».
    await window.jouerAnimationStudio("zone-glace", { cases: [{ q: 1, r: 2 }] });
    await window.jouerAnimationStudio("zone-feu", { cases: [{ q: -2, r: 2 }] });
    res.quatre = ["#studio-givre .givre-couche", "#studio-feu .feu-couche", "#studio-poison .poison-couche", "#studio-electrique .elec-couche"]
      .map(s => document.querySelectorAll(s).length).join();
    window.replacerPionsStudio();
    res.vide = document.querySelectorAll(".zone-proc").length === 0 && window.terrainStudio().zones.length === 0;
    // Le combat gardait ses nappes de poison et de foudre ; validés, ils y sont
    // intégrés en v246 : les mêmes plaques, plus de nappe.
    window.ZONES_PERSISTANTES = { z1: { type: "poison", hexes: [{ q: 3, r: 1 }] }, z2: { type: "electrique", hexes: [{ q: 4, r: 1 }] } };
    window.appliquerZonesPersistantes();
    const svg = document.getElementById("svg-zones-persistantes");
    res.jeu = document.querySelectorAll("#zones-procedurales .poison-couche, #zones-procedurales .elec-couche").length
            - (svg ? svg.querySelectorAll('g[clip-path="url(#zp-clip-hex)"]').length : 0);
    window.ZONES_PERSISTANTES = {};
    window.appliquerZonesPersistantes();
    return res;
  }, { A, CP: COUCHE("poison"), CE: COUCHE("electrique") });
  verifier("de la foudre sur une case empoisonnée : le poison y cède, la case est électrique", r.avant > 0.5 && r.apres < 0.5 && r.charge > 0.5
           && r.types.join() === "electrique" && r.poison === 6, JSON.stringify(r));
  verifier("glace, feu, poison et foudre : chacun sa plaque", r.quatre === "1,1,1,1", r.quatre);
  verifier("« Replacer » efface les quatre", r.vide);
  verifier("le combat pose les mêmes plaques de poison et de foudre (validées, intégrées en v246)", r.jeu === 2, String(r.jeu));
}

console.log("\n5. LE CATALOGUE");
{
  const r = await p.evaluate(() => {
    const a = (id) => (window.ANIMATIONS_COMBAT || []).find(x => x.id === id) || {};
    return { nb: (window.ANIMATIONS_COMBAT || []).length, poison: a("zone-poison"), foudre: a("zone-foudre"),
             types: window.TYPES_ZONES_PROCEDURALES || [] };
  });
  // (v248 : la zone de pièges en plus — 144.)
  verifier("toujours 144 animations ; poison et foudre se ciblent et disent ce qu'ils font (sans contour)",
           r.nb === 144 && !!r.poison.ciblage && !!r.foudre.ciblage && /bulles/.test(r.poison.description || "") && /miasme/.test(r.poison.description || "")
           && /arcs/.test(r.foudre.description || "") && /contour/.test(r.poison.description || "") && /contour/.test(r.foudre.description || ""), JSON.stringify({ nb: r.nb }));
  verifier("le moteur connaît les quatre éléments", ["glace", "feu", "poison", "electrique"].every(t => r.types.includes(t)), r.types.join());
}

await fin();
