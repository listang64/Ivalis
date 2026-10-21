// LA ZONE DE PIÈGES DU STUDIO, PROCÉDURALE (v248).
//
// Nico : « Et aussi pour les zones avec juste des dégâts normaux, fais des
// chausse-trappes sur le sol, en mode procédural pareil. (Rajoute cet effet
// dans les zones du Studio.) »
//
//   1. LES CHAUSSE-TRAPPES : la zone « neutre » du combat (« Terrain piégé »)
//      est au Studio UNE plaque (zones_procedurales.js), sans contour : le sol
//      à peine assombri, semé de chausse-trappes de fer, chacune avec son
//      ombre, partout dans la zone et nulle part ailleurs ; des reflets ;
//   2. COMME LES ZONES : deux zones sans couture ; le même dessin pour les
//      mêmes cases, et une case garde ses pièges quand la plaque grandit ;
//      les pièges gagnent depuis le cœur ;
//   3. LE TERRAIN : une case n'a qu'une zone (le feu chasse les pièges, les
//      pièges chassent le feu) ; « Replacer » efface tout ;
//   4. LE CATALOGUE (144 animations, son propre son) ; le combat garde sa
//      nappe de pièges tant que Nico n'a pas validé.
import { ouvrirStudio } from './_studio_commun.mjs';

const { p, verifier, fin } = await ouvrirStudio();

const fleur = (c) => [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => ({ q: c.q + dq, r: c.r + dr }));
const A = fleur({ q: 3, r: -3 });

// (Sur l'ancien code, pas de plaque : le banc compte ce qui manque au lieu de planter.)
await p.evaluate(() => {
  window.__P = (c) => window.PLATEAU_VTT.hexToPixel(c.q, c.r);
  window.__couche = (type) => (typeof window.coucheStudio === "function" && window.coucheStudio(type))
    || { cases: () => [], couvertureEn: () => 0, opaciteEn: () => 0, el: null };
  // Le sol d'une plaque (ses pixels) et sa place sur la carte.
  window.__sol = (sel) => {
    const s = document.querySelector(sel);
    if (!s) return null;
    const racine = s.parentElement;
    return { s, d: s.getContext("2d").getImageData(0, 0, s.width, s.height).data, x0: parseFloat(racine.style.left), y0: parseFloat(racine.style.top),
             k: s.width / parseFloat(racine.style.width) };
  };
  window.__px = (sol, x, y) => {
    if (!sol) return [0, 0, 0, 0];
    const i = Math.floor((x - sol.x0) * sol.k), j = Math.floor((y - sol.y0) * sol.k);
    if (i < 0 || j < 0 || i >= sol.s.width || j >= sol.s.height) return [0, 0, 0, 0];
    const n = (j * sol.s.width + i) * 4;
    return [sol.d[n], sol.d[n + 1], sol.d[n + 2], sol.d[n + 3]];
  };
  window.__attendre = (ms) => new Promise(r => setTimeout(r, ms));
});

console.log("\n1. LES CHAUSSE-TRAPPES : UNE PLAQUE, SEMÉE DE FER");
{
  const r = await p.evaluate(async (A) => {
    window.replacerPionsStudio();
    const joue = await window.jouerAnimationStudio("zone-pieges", { cases: A });
    await window.__attendre(400);
    const R = window.PLATEAU_VTT.hexSize, c = window.__couche("neutre"), cont = document.getElementById("studio-pieges") || document.createElement("div");
    const sol = window.__sol("#studio-pieges .piege-couche canvas.piege-sol");
    // Les pixels : le fer (opaque, gris), les ombres (sombres, à demi), le sol (le reste).
    let fer = 0, gris = 0, ombres = 0, sols = 0, aSol = 0, n = 0;
    if (sol) for (let i = 0; i < sol.d.length; i += 4) {
      const a = sol.d[i + 3]; if (a < 8) continue;
      n++;
      const r = sol.d[i], g = sol.d[i + 1], b = sol.d[i + 2], l = (r + g + b) / 3;
      if (a > 200) { fer++; if (Math.max(r, g, b) - Math.min(r, g, b) < 40) gris++; }
      else if (a > 60 && l < 40) ombres++;
      else { sols++; aSol += a / 255; }
    }
    // Du fer dans chaque case ; rien d'opaque à plus de 0,3 rayon hors de la zone.
    const parCase = A.map(x => {
      const o = window.__P(x); let k = 0;
      for (let j = 0; j < 300; j++) { const a = j * 2.39996, d = R * 0.8 * Math.sqrt((j + 0.5) / 300); if (window.__px(sol, o.x + Math.cos(a) * d, o.y + Math.sin(a) * d)[3] > 200) k++; }
      return k;
    });
    const centres = A.map(window.__P);
    let dehors = 0, vus = 0;
    centres.forEach(o => {
      for (let j = 0; j < 500; j++) {
        const a = j * 2.39996, d = R * (1.3 + 0.8 * ((j * 0.618) % 1));
        const x = o.x + Math.cos(a) * d, y = o.y + Math.sin(a) * d;
        if (centres.some(q => Math.hypot(q.x - x, q.y - y) < R * 1.3)) continue;
        vus++; if (window.__px(sol, x, y)[3] > 128) dehors++;
      }
    });
    const reflets = [...cont.querySelectorAll(".piege-reflet")];
    return {
      joue, plaques: cont.querySelectorAll(".piege-couche").length, zones: window.terrainStudio().zones.filter(z => z.type === "neutre").length,
      nappes: document.querySelectorAll('#studio-zones .studio-nappe[data-type="neutre"]').length, traits: cont.querySelectorAll("polygon, path, line").length,
      centres: A.map(x => +c.couvertureEn(window.__P(x).x, window.__P(x).y).toFixed(2)),
      loin: c.couvertureEn(window.__P({ q: -3, r: 3 }).x, window.__P({ q: -3, r: 3 }).y),
      fer: n ? +(fer / n).toFixed(3) : 0, gris: fer ? +(gris / fer).toFixed(2) : 0, ombres: n ? +(ombres / n).toFixed(3) : 0,
      aSol: sols ? +(aSol / sols).toFixed(2) : 1, parCase, dehors, vus,
      reflets: reflets.length, brillent: reflets.length > 0 && reflets.every(e => e.getAnimations().some(an => an.effect.getComputedTiming().iterations === Infinity))
    };
  }, A);
  verifier("« Zone de pièges » se joue ; ses 7 cases sont une zone « neutre » sur le terrain", r.joue && r.zones === 7, JSON.stringify({ joue: r.joue, zones: r.zones }));
  verifier("UNE plaque, plus de nappe SVG ; aucun trait (pas de contour)", r.plaques === 1 && r.nappes === 0 && r.traits === 0, JSON.stringify({ plaques: r.plaques, nappes: r.nappes, traits: r.traits }));
  verifier("elle couvre le centre de chaque case, et rien loin d'elle", r.centres.every(x => x > 0.9) && r.loin === 0, JSON.stringify(r.centres));
  verifier("le sol, à peine assombri (translucide)", r.aSol > 0.03 && r.aSol < 0.4, String(r.aSol));
  verifier("du fer : des chausse-trappes grises, opaques, en nombre", r.fer > 0.03 && r.fer < 0.3 && r.gris > 0.6, JSON.stringify({ fer: r.fer, gris: r.gris }));
  verifier("chacune son ombre", r.ombres > 0.01, String(r.ombres));
  verifier("semées dans chaque case de la zone", r.parCase.every(k => k >= 8), JSON.stringify(r.parCase));
  verifier("…et nulle part au-delà", r.vus > 200 && r.dehors === 0, JSON.stringify({ dehors: r.dehors, vus: r.vus }));
  verifier("des reflets qui accrochent la lumière, de loin en loin", r.reflets >= 5 && r.brillent, String(r.reflets));
}

console.log("\n2. COMME LES ZONES : SANS COUTURE, LE MÊME SEMIS, DEPUIS LE CŒUR");
{
  const r = await p.evaluate(async (A) => {
    const R = window.PLATEAU_VTT.hexSize;
    // Le centre de la fleur, avant et après qu'une deuxième zone collée la rejoigne.
    const o = window.__P(A[0]);
    const lire = () => {
      const sol = window.__sol("#studio-pieges .piege-couche canvas.piege-sol"), v = [];
      for (let y = -R * 0.5; y <= R * 0.5; y += 2) for (let x = -R * 0.5; x <= R * 0.5; x += 2) v.push(window.__px(sol, o.x + x, o.y + y).join());
      return v.join("|");
    };
    const avant = lire();
    // Trois cases en ligne, la première collée à la fleur : le cœur est celle du milieu.
    const B = [{ q: 5, r: -3 }, { q: 6, r: -3 }, { q: 7, r: -3 }];
    const vus = {};
    let fini = false;
    const t0 = performance.now();
    const sonde = () => {
      const c = window.__couche("neutre");
      B.forEach((x, i) => { if (vus[i] === undefined && c.opaciteEn(window.__P(x).x, window.__P(x).y) >= 0 && window.__px(window.__sol("#studio-pieges .piege-couche canvas.piege-sol"), window.__P(x).x, window.__P(x).y)[3] > 10) vus[i] = performance.now() - t0; });
      if (!fini) requestAnimationFrame(sonde);
    };
    requestAnimationFrame(sonde);
    await window.jouerAnimationStudio("zone-pieges", { cases: B });
    await window.__attendre(400);
    fini = true;
    const apres = lire();
    const c = window.__couche("neutre");
    // La couture : de A[1] (q 4, r -3) à B[0] (q 5, r -3).
    const a = window.__P({ q: 4, r: -3 }), b = window.__P({ q: 5, r: -3 });
    const ligne = Array.from({ length: 21 }, (_, i) => c.couvertureEn(a.x + (b.x - a.x) * i / 20, a.y + (b.y - a.y) * i / 20));
    // Le même dessin pour les mêmes cases, d'un coup.
    let memes = false, ms = -1;
    if (typeof window.creerCouchePieges === "function") {
      const div = document.createElement("div");
      (document.getElementById("studio-pieges") || document.body).appendChild(div);
      const autre = window.creerCouchePieges(div, { R, pixel: (q, r) => window.PLATEAU_VTT.hexToPixel(q, r), graine: 7 });
      const t = performance.now();
      await autre.poser([...A, ...B]);
      ms = performance.now() - t;
      const s1 = document.querySelector("#studio-pieges > .piege-couche canvas.piege-sol"), s2 = div.querySelector("canvas.piege-sol");
      const d1 = s1.getContext("2d").getImageData(0, 0, s1.width, s1.height).data, d2 = s2.getContext("2d").getImageData(0, 0, s2.width, s2.height).data;
      memes = s1.width === s2.width && d1.length === d2.length && d1.every((v, i) => Math.abs(v - d2[i]) <= 1);
      autre.detruire(); div.remove();
    }
    return { garde: avant.length > 100 && avant === apres && /,2[0-9][0-9]$|,2[0-9][0-9]\|/.test(avant), cases: c.cases().length,
             plaques: document.querySelectorAll("#studio-pieges .piege-couche").length, couture: +Math.min(...ligne).toFixed(2), vus, memes, ms: Math.round(ms) };
  }, A);
  verifier("une deuxième zone collée : toujours UNE plaque (10 cases), sans couture", r.plaques === 1 && r.cases === 10 && r.couture > 0.9,
           JSON.stringify({ plaques: r.plaques, cases: r.cases, couture: r.couture }));
  verifier("la case du cœur garde ses chausse-trappes quand la plaque grandit", r.garde);
  verifier("le même semis pour les mêmes cases (rien n'est tiré au hasard)", r.memes);
  verifier("les pièges gagnent depuis le cœur de la zone (la case du milieu d'abord)",
           r.vus[0] !== undefined && r.vus[1] !== undefined && r.vus[2] !== undefined && r.vus[1] < Math.min(r.vus[0], r.vus[2]), JSON.stringify(r.vus));
  verifier("le calcul : dix cases en moins d'une seconde", r.ms >= 0 && r.ms < 1000, `${r.ms} ms`);
}

console.log("\n3. LE TERRAIN : UNE ZONE PAR CASE ; « REPLACER »");
{
  const r = await p.evaluate(async (A) => {
    const c = A[1], P = window.__P(c);
    const avant = window.__couche("neutre").couvertureEn(P.x, P.y);
    await window.jouerAnimationStudio("zone-feu", { cases: [c] });
    await window.__attendre(300);
    const res = { avant, apres: window.__couche("neutre").couvertureEn(P.x, P.y), feu: window.__couche("feu").couvertureEn(P.x, P.y),
                  types: window.terrainStudio().zones.filter(z => z.q === c.q && z.r === c.r).map(z => z.type) };
    // Des pièges posés sur le feu le chassent.
    await window.jouerAnimationStudio("zone-pieges", { cases: [c] });
    await window.__attendre(300);
    res.retour = { pieges: window.__couche("neutre").couvertureEn(P.x, P.y), feu: window.__couche("feu").couvertureEn(P.x, P.y),
                   types: window.terrainStudio().zones.filter(z => z.q === c.q && z.r === c.r).map(z => z.type) };
    window.replacerPionsStudio();
    res.vide = document.querySelectorAll("#studio-pieges .piege-couche").length === 0 && window.terrainStudio().zones.length === 0;
    return res;
  }, A);
  verifier("du feu sur une case piégée : les pièges y cèdent, la case brûle", r.avant > 0.5 && r.apres < 0.5 && r.feu > 0.5 && r.types.join() === "feu", JSON.stringify(r));
  verifier("des pièges sur le feu : le feu cède, la case est piégée", r.retour.pieges > 0.5 && r.retour.feu < 0.5 && r.retour.types.join() === "neutre", JSON.stringify(r.retour));
  verifier("« Replacer » efface les pièges", r.vide);
}

console.log("\n4. LE CATALOGUE ; LE COMBAT (SA NAPPE, PUIS LES PIÈGES EN v249)");
{
  const r = await p.evaluate(() => {
    const liste = window.ANIMATIONS_COMBAT || [];
    const a = liste.find(x => x.id === "zone-pieges") || {};
    const i = liste.findIndex(x => x.id === "zone-pieges"), j = liste.findIndex(x => x.id === "zone-poison");
    // Le combat gardait sa nappe SVG pour une zone « neutre » ; validées, les
    // chausse-trappes y sont intégrées en v249 : une plaque, plus de nappe.
    window.ZONES_PERSISTANTES = { z1: { type: "neutre", hexes: [{ q: 3, r: 1 }] } };
    window.appliquerZonesPersistantes();
    const svg = document.getElementById("svg-zones-persistantes");
    const jeu = { nappes: svg ? svg.querySelectorAll('g[clip-path="url(#zp-clip-hex)"]').length : 0, plaques: document.querySelectorAll("#zones-procedurales .zone-proc").length };
    window.ZONES_PERSISTANTES = {};
    window.appliquerZonesPersistantes();
    return { nb: liste.length, cible: !!a.ciblage, desc: a.description || "", section: a.section, apres: i === j + 1,
             son: !!(window.SONS_COMBAT || {})["zone-pieges"], types: window.TYPES_ZONES_PROCEDURALES || [], recettes: window.RECETTES_PROCEDURALES || [], jeu };
  });
  verifier("144 animations ; « Zone de pièges » se cible, juste après le poison, en section 7", r.nb === 144 && r.cible && r.apres && r.section === 7, JSON.stringify({ nb: r.nb, section: r.section }));
  verifier("…et dit ce qu'elle fait : des chausse-trappes, sans contour", /chausse-trappes/.test(r.desc) && /contour/.test(r.desc) && /ombre/.test(r.desc));
  verifier("son bruit à elle : du fer qui tinte (« zone-pieges »)", r.son);
  verifier("le moteur connaît les pièges ; le combat aussi (v249)", r.recettes.includes("neutre") && r.types.includes("neutre"), JSON.stringify({ recettes: r.recettes, types: r.types }));
  verifier("le combat pose les mêmes chausse-trappes (validées, intégrées en v249)", r.jeu.nappes === 0 && r.jeu.plaques === 1, JSON.stringify(r.jeu));
}

await fin();
