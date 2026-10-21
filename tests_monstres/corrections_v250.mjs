// LA ZONE DE SOIN DU STUDIO, PROCÉDURALE (v250).
//
// Nico : « Dans le même esprit que les autres, fais la zone de soin et mets-la
// dans le Studio. Je verrais bien comme de la lumière blanche qui jaillit par
// endroits du sol, comme un soin de paladin, tu sais. »
//
//   1. LA LUMIÈRE : une plaque (zones_procedurales.js, recette « soin »), sans
//      contour : une clarté blanc doré, translucide ; par endroits, des
//      sources de lumière qui respirent ; de leurs cœurs, des colonnes de
//      lumière blanche qui jaillissent vers le haut de l'écran, tour à tour ;
//      des étincelles qui montent ; un voile de clarté ;
//   2. COMME LES ZONES : sans couture, le même dessin, depuis le cœur, une
//      case qui garde ses sources ;
//   3. LE TERRAIN : une zone par case ; « Replacer » ;
//   4. LE CATALOGUE (145 animations) ; le combat garde sa nappe de soin.
import { ouvrirStudio } from './_studio_commun.mjs';

const { p, verifier, fin } = await ouvrirStudio();

const fleur = (c) => [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => ({ q: c.q + dq, r: c.r + dr }));
const A = fleur({ q: 3, r: -3 });

// (Sur l'ancien code, pas de plaque : le banc compte ce qui manque au lieu de planter.)
await p.evaluate(() => {
  window.__P = (c) => window.PLATEAU_VTT.hexToPixel(c.q, c.r);
  window.__couche = (type) => (typeof window.coucheStudio === "function" && window.coucheStudio(type))
    || { cases: () => [], couvertureEn: () => 0, opaciteEn: () => 0, braisesEn: () => 0, voileEn: () => 0, el: null };
  window.__toile = (sel) => {
    const s = document.querySelector(sel);
    if (!s) return null;
    const racine = s.parentElement;
    return { s, d: s.getContext("2d").getImageData(0, 0, s.width, s.height).data, x0: parseFloat(racine.style.left), y0: parseFloat(racine.style.top),
             k: s.width / parseFloat(racine.style.width), racine };
  };
  window.__attendre = (ms) => new Promise(r => setTimeout(r, ms));
});

console.log("\n1. LA LUMIÈRE : CLARTÉ, SOURCES, COLONNES, ÉTINCELLES");
{
  const r = await p.evaluate(async (A) => {
    window.replacerPionsStudio();
    const t0 = performance.now();
    const joue = await window.jouerAnimationStudio("zone-soin", { cases: A });
    const ms = performance.now() - t0;
    await window.__attendre(600);
    const R = window.PLATEAU_VTT.hexSize, c = window.__couche("soin");
    const cont = document.getElementById("studio-soin") || document.createElement("div");
    // La clarté : sa couleur moyenne et son opacité.
    const sol = window.__toile("#studio-soin .sacre-couche canvas.sacre-sol");
    let n = 0, rr = 0, gg = 0, bb = 0, aa = 0;
    if (sol) for (let i = 0; i < sol.d.length; i += 4) if (sol.d[i + 3] > 8) { n++; rr += sol.d[i]; gg += sol.d[i + 1]; bb += sol.d[i + 2]; aa += sol.d[i + 3]; }
    // Les sources : des taches franches (pas une nappe), sur le calque qui respire.
    const lueur = window.__toile("#studio-soin .sacre-couche canvas.sacre-braises");
    let vives = 0, toutes = 0;
    if (lueur) for (let i = 3; i < lueur.d.length; i += 4) { toutes++; if (lueur.d[i] > 200) vives++; }
    const calqueLueur = cont.querySelector("canvas.sacre-braises");
    const respire = !!calqueLueur && calqueLueur.classList.contains("zone-proc-ecran")
      && calqueLueur.getAnimations().some(an => an.effect.getComputedTiming().iterations === Infinity);
    // Les colonnes : posées sur une source, plus hautes que larges, qui montent depuis leur pied.
    const rayons = [...cont.querySelectorAll(".sacre-rayon")];
    const racine = cont.querySelector(".sacre-couche");
    const ox = racine ? parseFloat(racine.style.left) : 0, oy = racine ? parseFloat(racine.style.top) : 0;
    const colonnes = rayons.map(e => {
      const w = parseFloat(e.style.width), h = parseFloat(e.style.height);
      const x = ox + parseFloat(e.style.left), y = oy + parseFloat(e.style.top);
      const an = e.getAnimations()[0];
      const kf = an ? an.effect.getKeyframes() : [];
      return { w, h, pied: c.braisesEn(x, y), origine: getComputedStyle(e).transformOrigin, marge: e.style.marginTop,
               infini: !!an && an.effect.getComputedTiming().iterations === Infinity,
               jaillit: kf.length > 2 && /scale\(0\.6, 0\.1\)/.test(kf[0].transform || "") && /scale\(1, 1\)/.test(JSON.stringify(kf)),
               op: +getComputedStyle(e).opacity, delai: an ? an.effect.getTiming().delay : 0 };
    });
    const etincelles = [...cont.querySelectorAll(".sacre-etincelle")];
    const montent = etincelles.length > 0 && etincelles.every(e => e.getAnimations().some(an => {
      const k = an.effect.getKeyframes(), m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(k[k.length - 1].transform || "");
      return an.effect.getComputedTiming().iterations === Infinity && m && +m[2] < -10;
    }));
    return {
      joue, ms: Math.round(ms), plaques: cont.querySelectorAll(".sacre-couche").length, zones: window.terrainStudio().zones.filter(z => z.type === "soin").length,
      nappes: document.querySelectorAll('#studio-zones .studio-nappe[data-type="soin"]').length, traits: cont.querySelectorAll("polygon, path, line").length,
      centres: A.map(x => +c.couvertureEn(window.__P(x).x, window.__P(x).y).toFixed(2)),
      loin: c.couvertureEn(window.__P({ q: -3, r: 3 }).x, window.__P({ q: -3, r: 3 }).y),
      couleur: n ? [rr / n, gg / n, bb / n].map(Math.round) : [0, 0, 0], alpha: n ? +(aa / n / 255).toFixed(2) : 0,
      vives: toutes ? +(vives / toutes).toFixed(3) : 0, respire,
      colonnes: colonnes.length, surSources: colonnes.filter(k => k.pied > 0.5).length, // (L'origine de la transformation, lue en pixels : au pied de la colonne.)
      dressees: colonnes.every(k => k.h >= k.w * 1.9 && Math.abs(parseFloat(k.origine.split(" ")[1]) - k.h) < 1 && Math.abs(parseFloat(k.marge) + k.h) < 0.5),
      animees: colonnes.every(k => k.infini && k.jaillit), allumees: colonnes.filter(k => k.op > 0.3).length,
      decalees: new Set(colonnes.map(k => Math.round(k.delai / 100))).size,
      etincelles: etincelles.length, montent,
      aura: cont.querySelectorAll(".sacre-aura.zone-proc-ecran").length
    };
  }, A);
  verifier("« Zone de soin » se joue ; ses 7 cases sont une zone de soin sur le terrain", r.joue && r.zones === 7, JSON.stringify({ joue: r.joue, zones: r.zones }));
  verifier("UNE plaque, plus de nappe SVG ; aucun trait (pas de contour)", r.plaques === 1 && r.nappes === 0 && r.traits === 0, JSON.stringify({ plaques: r.plaques, nappes: r.nappes, traits: r.traits }));
  verifier("elle couvre le centre de chaque case, et rien loin d'elle", r.centres.every(x => x > 0.9) && r.loin === 0, JSON.stringify(r.centres));
  verifier("une clarté blanc doré (rouge ≥ vert > bleu, tous clairs), translucide", r.couleur[0] >= r.couleur[1] && r.couleur[1] > r.couleur[2] && r.couleur[2] > 190 && r.alpha > 0.05 && r.alpha < 0.45,
           JSON.stringify({ couleur: r.couleur, alpha: r.alpha }));
  verifier("des sources de lumière par endroits (des taches, pas une nappe), qui respirent", r.vives > 0.005 && r.vives < 0.2 && r.respire, JSON.stringify({ vives: r.vives, respire: r.respire }));
  verifier("des colonnes de lumière, une par source, chacune posée sur sa source", r.colonnes >= 7 && r.surSources === r.colonnes, JSON.stringify({ colonnes: r.colonnes, surSources: r.surSources }));
  verifier("…dressées vers le haut de l'écran depuis leur pied, qui jaillissent (en boucle)", r.dressees && r.animees, JSON.stringify({ dressees: r.dressees, animees: r.animees }));
  verifier("…tour à tour : certaines allumées, d'autres éteintes, à des moments différents", r.allumees >= 1 && r.allumees < r.colonnes && r.decalees >= 4,
           JSON.stringify({ allumees: r.allumees, decalees: r.decalees }));
  verifier("des étincelles qui montent ; un voile de clarté", r.etincelles >= 10 && r.montent && r.aura === 1, JSON.stringify({ etincelles: r.etincelles, aura: r.aura }));
}

console.log("\n2. COMME LES ZONES : SANS COUTURE, LE MÊME DESSIN, DEPUIS LE CŒUR");
{
  const r = await p.evaluate(async (A) => {
    const R = window.PLATEAU_VTT.hexSize, o = window.__P(A[0]);
    const lire = () => {
      const t = window.__toile("#studio-soin .sacre-couche canvas.sacre-braises"), v = [];
      if (!t) return "";
      for (let y = -R * 0.5; y <= R * 0.5; y += 3) for (let x = -R * 0.5; x <= R * 0.5; x += 3) {
        const i = Math.floor((o.x + x - t.x0) * t.k), j = Math.floor((o.y + y - t.y0) * t.k);
        v.push(t.d[(j * t.s.width + i) * 4 + 3]);
      }
      return v.join(",");
    };
    const avant = lire();
    const B = [{ q: 5, r: -3 }, { q: 6, r: -3 }, { q: 7, r: -3 }];
    const vus = {}; let fini = false; const t0 = performance.now();
    const sonde = () => {
      const t = window.__toile("#studio-soin .sacre-couche canvas.sacre-sol");
      B.forEach((x, i) => {
        if (vus[i] !== undefined || !t) return;
        const P = window.__P(x), ii = Math.floor((P.x - t.x0) * t.k), jj = Math.floor((P.y - t.y0) * t.k);
        if (ii >= 0 && jj >= 0 && ii < t.s.width && jj < t.s.height && t.d[(jj * t.s.width + ii) * 4 + 3] > 5) vus[i] = Math.round(performance.now() - t0);
      });
      if (!fini) requestAnimationFrame(sonde);
    };
    requestAnimationFrame(sonde);
    await window.jouerAnimationStudio("zone-soin", { cases: B });
    await window.__attendre(300);
    fini = true;
    const apres = lire(), c = window.__couche("soin");
    const a = window.__P({ q: 4, r: -3 }), b = window.__P({ q: 5, r: -3 });
    const ligne = Array.from({ length: 21 }, (_, i) => c.couvertureEn(a.x + (b.x - a.x) * i / 20, a.y + (b.y - a.y) * i / 20));
    let memes = false, ms = -1;
    if (typeof window.creerCoucheSoin === "function") {
      const div = document.createElement("div");
      (document.getElementById("studio-soin") || document.body).appendChild(div);
      const autre = window.creerCoucheSoin(div, { R, pixel: (q, r) => window.PLATEAU_VTT.hexToPixel(q, r), graine: 7 });
      const t = performance.now();
      await autre.poser([...A, ...B]);
      ms = performance.now() - t;
      const s1 = document.querySelector("#studio-soin > .sacre-couche canvas.sacre-sol"), s2 = div.querySelector("canvas.sacre-sol");
      const d1 = s1.getContext("2d").getImageData(0, 0, s1.width, s1.height).data, d2 = s2.getContext("2d").getImageData(0, 0, s2.width, s2.height).data;
      memes = s1.width === s2.width && d1.length === d2.length && d1.every((v, i) => Math.abs(v - d2[i]) <= 1);
      autre.detruire(); div.remove();
    }
    return { garde: avant.length > 50 && avant === apres && /2[0-9][0-9]/.test(avant), plaques: document.querySelectorAll("#studio-soin .sacre-couche").length,
             cases: c.cases().length, couture: +Math.min(...ligne).toFixed(2), vus, memes, ms: Math.round(ms) };
  }, A);
  verifier("une deuxième zone collée : toujours UNE plaque (10 cases), sans couture", r.plaques === 1 && r.cases === 10 && r.couture > 0.9,
           JSON.stringify({ plaques: r.plaques, cases: r.cases, couture: r.couture }));
  verifier("la case du cœur garde ses sources quand la plaque grandit", r.garde);
  verifier("le même dessin pour les mêmes cases (rien n'est tiré au hasard)", r.memes);
  verifier("la lumière gagne depuis le cœur de la zone (la case du milieu d'abord)",
           r.vus[0] !== undefined && r.vus[1] !== undefined && r.vus[2] !== undefined && r.vus[1] < Math.min(r.vus[0], r.vus[2]), JSON.stringify(r.vus));
  verifier("le calcul : dix cases en moins d'une seconde", r.ms >= 0 && r.ms < 1000, `${r.ms} ms`);
}

console.log("\n3. LE TERRAIN : UNE ZONE PAR CASE ; « REPLACER »");
{
  const r = await p.evaluate(async (A) => {
    const c = A[1], P = window.__P(c);
    const avant = window.__couche("soin").couvertureEn(P.x, P.y);
    await window.jouerAnimationStudio("zone-feu", { cases: [c] });
    await window.__attendre(300);
    const res = { avant, apres: window.__couche("soin").couvertureEn(P.x, P.y), feu: window.__couche("feu").couvertureEn(P.x, P.y),
                  types: window.terrainStudio().zones.filter(z => z.q === c.q && z.r === c.r).map(z => z.type) };
    await window.jouerAnimationStudio("zone-soin", { cases: [c] });
    await window.__attendre(300);
    res.retour = { soin: window.__couche("soin").couvertureEn(P.x, P.y), feu: window.__couche("feu").couvertureEn(P.x, P.y),
                   types: window.terrainStudio().zones.filter(z => z.q === c.q && z.r === c.r).map(z => z.type) };
    window.replacerPionsStudio();
    res.vide = document.querySelectorAll("#studio-soin .sacre-couche").length === 0 && window.terrainStudio().zones.length === 0;
    return res;
  }, A);
  verifier("du feu sur une case bénie : la lumière y cède, la case brûle", r.avant > 0.5 && r.apres < 0.5 && r.feu > 0.5 && r.types.join() === "feu", JSON.stringify(r));
  verifier("de la lumière sur le feu : le feu cède, la case est bénie", r.retour.soin > 0.5 && r.retour.feu < 0.5 && r.retour.types.join() === "soin", JSON.stringify(r.retour));
  verifier("« Replacer » efface la lumière", r.vide);
}

console.log("\n4. LE CATALOGUE ; LE COMBAT GARDE SA NAPPE DE SOIN");
{
  const r = await p.evaluate(() => {
    const liste = window.ANIMATIONS_COMBAT || [];
    const a = liste.find(x => x.id === "zone-soin") || {};
    const i = liste.findIndex(x => x.id === "zone-soin"), j = liste.findIndex(x => x.id === "zone-pieges");
    window.ZONES_PERSISTANTES = { z1: { type: "soin", hexes: [{ q: 3, r: 1 }] } };
    window.appliquerZonesPersistantes();
    const svg = document.getElementById("svg-zones-persistantes");
    const jeu = { nappes: svg ? svg.querySelectorAll('g[clip-path="url(#zp-clip-hex)"]').length : 0, plaques: document.querySelectorAll("#zones-procedurales .zone-proc").length };
    window.ZONES_PERSISTANTES = {};
    window.appliquerZonesPersistantes();
    return { nb: liste.length, cible: !!a.ciblage, desc: a.description || "", section: a.section, apres: i === j + 1,
             types: window.TYPES_ZONES_PROCEDURALES || [], recettes: window.RECETTES_PROCEDURALES || [], jeu };
  });
  verifier("145 animations ; « Zone de soin » se cible, juste après les pièges, en section 7", r.nb === 145 && r.cible && r.apres && r.section === 7, JSON.stringify({ nb: r.nb, section: r.section }));
  verifier("…et dit ce qu'elle fait : des colonnes de lumière, un soin de paladin, sans contour", /colonnes de lumière/.test(r.desc) && /paladin/.test(r.desc) && /contour/.test(r.desc));
  verifier("le moteur sait faire la lumière ; le combat, lui, ne la dessine pas encore ainsi", r.recettes.includes("soin") && !r.types.includes("soin"), JSON.stringify({ types: r.types }));
  verifier("le combat garde sa nappe de soin tant que le Studio n'est pas validé", r.jeu.nappes === 1 && r.jeu.plaques === 0, JSON.stringify(r.jeu));
}

await fin();
