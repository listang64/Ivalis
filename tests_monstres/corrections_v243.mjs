// LA ZONE DE GLACE DU STUDIO, PROCÉDURALE (v243).
//
// Nico : « Toujours dans le Studio, j'aimerais qu'on revoie l'animation des
// zones de glace. Je ne veux pas de contour, mais quelque chose de plus
// réaliste vu du dessus : une zone de givre qui vient un peu en transparence
// au-dessus du terrain existant, avec un petit effet de brume glacée soufflée
// par le vent. Si plusieurs zones sont collées, ça fait comme une grosse zone.
// Quelque chose de procédural. »
//
//   1. LA PLAQUE : les cases visées gèlent, une seule plaque (zones_procedurales.js) ; pas
//      de nappe hexagonale ni de liseré ; translucide ; rien loin d'elle ;
//   2. LE GIVRE RAMPE depuis le cœur de la zone ;
//   3. DEUX ZONES COLLÉES : une seule plaque, sans couture entre elles ;
//   4. LA BRUME qui dérive au vent, les scintillements ;
//   5. PROCÉDURAL : le même dessin pour les mêmes cases, rien d'une image ;
//   6. LE TERRAIN : le feu fait fondre sa case, « Replacer » efface tout, la
//      glace qui passe (entrée de zone) ne reste pas ; le combat garde sa
//      nappe tant que le Studio n'est pas validé.
import fs from 'fs';
import { ouvrirStudio } from './_studio_commun.mjs';
// (Sur l'ancien code, pas de givre : le banc compte ce qui manque au lieu de planter.)

const { p, verifier, fin } = await ouvrirStudio();

// Deux fleurs de 7 cases qui se recouvrent en partie, loin de la case gommée (0,0).
const fleur = (c) => [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => ({ q: c.q + dq, r: c.r + dr }));
const A = fleur({ q: 3, r: -3 }), B = fleur({ q: 5, r: -4 });

console.log("\n1. LA PLAQUE : UNE SEULE, SANS CONTOUR, TRANSLUCIDE");
{
  const r = await p.evaluate(async (A) => {
    window.replacerPionsStudio();
    const ok = typeof window.creerCoucheGivre === "function";
    const t0 = performance.now();
    const joue = await window.jouerAnimationStudio("zone-glace", { cases: A });
    const ms = performance.now() - t0;
    const t = window.terrainStudio();
    const g = typeof window.givreStudio === "function" ? window.givreStudio() : null;
    const P = (c) => window.PLATEAU_VTT.hexToPixel(c.q, c.r);
    const couches = document.querySelectorAll("#studio-givre .givre-couche").length;
    const nappesGlace = document.querySelectorAll('#studio-zones .studio-nappe[data-type="glace"]').length;
    const traits = document.querySelectorAll("#studio-givre polygon, #studio-givre path, #studio-givre line").length;
    const centres = g ? A.map(c => g.opaciteEn(P(c).x, P(c).y)) : [];
    const loin = g ? g.opaciteEn(P({ q: 8, r: -6 }).x, P({ q: 8, r: -6 }).y) : 1;
    // La plus forte opacité de toute la plaque : un voile, jamais un aplat.
    const sol = document.querySelector("#studio-givre canvas.givre-sol");
    // (Les fines tiges des fougères de givre brillent plus : on lit le 99e centile, et la moyenne.)
    const vus = [];
    if (sol) { const d = sol.getContext("2d").getImageData(0, 0, sol.width, sol.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) vus.push(d[i]); }
    vus.sort((a, b) => a - b);
    const max = vus.length ? vus[Math.floor(vus.length * 0.99)] : 0, n = vus.length, moyenne = vus.reduce((s, v) => s + v, 0) / Math.max(1, n) / 255;
    return { ok, joue, ms, zones: t.zones.filter(z => z.type === "glace").length, couches, nappesGlace, traits,
             centres: centres.map(x => +x.toFixed(2)), loin, max: max / 255, moyenne, n };
  }, A);
  verifier("le Studio a son givre (zones_procedurales.js) et la zone de glace se joue", r.ok && r.joue, JSON.stringify({ ok: r.ok, joue: r.joue }));
  verifier("les 7 cases visées sont des cases de glace du terrain", r.zones === 7, String(r.zones));
  verifier("UNE plaque de givre, pas une nappe hexagonale par case", r.couches === 1 && r.nappesGlace === 0, JSON.stringify({ couches: r.couches, nappes: r.nappesGlace }));
  verifier("pas de contour : aucun trait vectoriel (polygone, liseré) dans le givre", r.traits === 0, String(r.traits));
  verifier("du givre au centre de chaque case", r.centres.length === 7 && r.centres.every(x => x > 0.12), JSON.stringify(r.centres));
  verifier("translucide : 99 % du givre sous 75 % d'opacité, la moyenne sous 50 % (le terrain se voit)",
           r.max > 0.2 && r.max <= 0.75 && r.moyenne < 0.5, `${r.max.toFixed(2)} / ${r.moyenne.toFixed(2)}`);
  verifier("rien loin de la plaque", r.loin === 0, String(r.loin));
}

console.log("\n2. LE GIVRE RAMPE DEPUIS LE CŒUR DE LA ZONE");
{
  const r = await p.evaluate(async (A) => {
    window.replacerPionsStudio();
    const P = (c) => window.PLATEAU_VTT.hexToPixel(c.q, c.r);
    const fini = window.jouerAnimationStudio("zone-glace", { cases: A });
    await new Promise(r => setTimeout(r, 450));
    const sol = document.querySelector("#studio-givre canvas.givre-sol");
    const couche = sol && sol.parentElement;
    const lire = (c) => {
      if (!sol) return -1;
      const k = sol.width / parseFloat(couche.style.width);
      const x = Math.floor((P(c).x - parseFloat(couche.style.left)) * k), y = Math.floor((P(c).y - parseFloat(couche.style.top)) * k);
      // La moyenne d'un petit carré (le grain du givre varie d'un pixel à l'autre).
      const d = sol.getContext("2d").getImageData(x - 6, y - 6, 13, 13).data;
      let s = 0; for (let i = 3; i < d.length; i += 4) s += d[i];
      return s / (d.length / 4) / 255;
    };
    const tot = { coeur: lire(A[0]), bord: Math.max(...A.slice(1).map(lire)) };
    await fini;
    const apres = { coeur: lire(A[0]), bord: Math.min(...A.slice(1).map(lire)) };
    return { tot, apres };
  }, A);
  verifier("à mi-chemin : le cœur est gelé, les cases du bord pas encore (ou à peine)",
           r.tot.coeur > 0.1 && r.tot.bord < r.tot.coeur * 0.6, JSON.stringify(r.tot));
  verifier("à la fin : toutes les cases sont gelées", r.apres.coeur > 0.1 && r.apres.bord > 0.1, JSON.stringify(r.apres));
}

console.log("\n3. DEUX ZONES COLLÉES : UNE SEULE GROSSE PLAQUE, SANS COUTURE");
{
  const r = await p.evaluate(async ({ A, B }) => {
    window.replacerPionsStudio();
    await window.jouerAnimationStudio("zone-glace", { cases: A });
    await window.jouerAnimationStudio("zone-glace", { cases: B });
    const g = (typeof window.givreStudio === "function" && window.givreStudio()) || { opaciteEn: () => 0, couvertureEn: () => 0 };
    const P = (c) => window.PLATEAU_VTT.hexToPixel(c.q, c.r);
    const cle = (c) => c.q + "," + c.r;
    const union = new Map([...A, ...B].map(c => [cle(c), c]));
    const V = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    // Les cases « intérieures » (toutes leurs voisines gelées) : le givre y est
    // plein, au centre comme sur les côtés qu'elles partagent — pas de couture.
    const interieures = [...union.values()].filter(c => V.every(([dq, dr]) => union.has(cle({ q: c.q + dq, r: c.r + dr }))));
    const centres = interieures.map(c => g.couvertureEn(P(c).x, P(c).y));
    // D'un cœur à l'autre (de la zone A à la zone B), le long du trait : jamais de creux.
    const cotes = [];
    const a = P(A[0]), b = P(B[0]);
    for (let i = 0; i <= 24; i++) cotes.push(g.couvertureEn(a.x + (b.x - a.x) * i / 24, a.y + (b.y - a.y) * i / 24));
    // Et là où les deux zones se touchent : une case de A et une de B voisines.
    const jointures = [];
    A.forEach(a => B.forEach(b => { if (V.some(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r) && !union.has(cle(a)) === false) {
      const pa = P(a), pb = P(b); jointures.push(g.couvertureEn((pa.x + pb.x) / 2, (pa.y + pb.y) / 2)); } }));
    return { couches: document.querySelectorAll("#studio-givre .givre-couche").length, zones: window.terrainStudio().zones.length,
             n: interieures.length, centres: Math.min(...centres), cotes: Math.min(...cotes), nc: cotes.length,
             jointures: jointures.length ? Math.min(...jointures) : -1, nj: jointures.length };
  }, { A, B });
  verifier("toujours UNE plaque (les deux zones n'en font qu'une), 12 cases de glace", r.couches === 1 && r.zones === 12, JSON.stringify({ couches: r.couches, zones: r.zones }));
  verifier("au cœur de la grosse plaque : le givre est plein au centre des cases", r.n >= 2 && r.centres > 0.97, JSON.stringify({ n: r.n, min: r.centres }));
  verifier("…et d'un cœur de zone à l'autre, à travers leur jonction : aucune couture", r.nc === 25 && r.cotes > 0.95, JSON.stringify({ n: r.nc, min: r.cotes }));
  verifier("là où les deux zones se touchent, le givre passe de l'une à l'autre", r.nj >= 2 && r.jointures > 0.9, JSON.stringify({ n: r.nj, min: r.jointures }));
}

console.log("\n4. LA BRUME AU VENT, LES SCINTILLEMENTS");
{
  const r = await p.evaluate(async () => {
    const brume = document.querySelectorAll("#studio-givre .givre-brume");
    const voiles = [...document.querySelectorAll("#studio-givre .givre-brume .givre-voile")];
    const vent = document.querySelector("#studio-givre .givre-vent");
    const masque = brume[0] ? (getComputedStyle(brume[0]).webkitMaskImage || getComputedStyle(brume[0]).maskImage || "") : "";
    const derive = voiles.map(v => v.getAnimations().find(a => (a.effect.getKeyframes()[0].transform || "").includes("translateX")));
    const avant = voiles.map(v => getComputedStyle(v).transform);
    await new Promise(r => setTimeout(r, 600));
    const apres = voiles.map(v => getComputedStyle(v).transform);
    return { brume: brume.length, voiles: voiles.length, masque: /^url\("?data:image\/png/.test(masque),
             derive: derive.every(a => a && a.effect.getComputedTiming().iterations === Infinity),
             bouge: avant.some((t, i) => t !== apres[i]), tourne: vent ? /rotate/.test(vent.style.transform) : false,
             tuile: voiles.every(v => /data:image\/png/.test(v.style.backgroundImage)),
             eclats: document.querySelectorAll("#studio-givre .givre-eclat").length,
             scintillent: [...document.querySelectorAll("#studio-givre .givre-eclat")].every(e => e.getAnimations().length > 0) };
  });
  verifier("une brume, deux voiles, dans le masque de la plaque", r.brume === 1 && r.voiles === 2 && r.masque, JSON.stringify(r));
  verifier("les voiles dérivent sans fin, dans le sens du vent (le calque est tourné)", r.derive && r.bouge && r.tourne, JSON.stringify(r));
  verifier("…une tuile de bruit, calculée (pas une image du jeu)", r.tuile);
  verifier("des éclats qui scintillent sur la plaque", r.eclats >= 12 && r.scintillent, String(r.eclats));
}

console.log("\n5. PROCÉDURAL : LE MÊME DESSIN POUR LES MÊMES CASES");
{
  const r = await p.evaluate((A) => {
    const conteneur = document.getElementById("studio-givre");
    if (!conteneur || typeof window.creerCoucheGivre !== "function") return { memes: false, autre: false, garde: false };
    const opts = { R: window.PLATEAU_VTT.hexSize, pixel: (q, r) => window.PLATEAU_VTT.hexToPixel(q, r), graine: 7 };
    const somme = (c) => { const s = c.el.querySelector("canvas.givre-sol"); const d = s.getContext("2d").getImageData(0, 0, s.width, s.height).data;
                           let t = 0; for (let i = 0; i < d.length; i += 7) t = (t * 31 + d[i]) % 1000003; return t; };
    const c1 = window.creerCoucheGivre(conteneur, opts), c2 = window.creerCoucheGivre(conteneur, opts), c3 = window.creerCoucheGivre(conteneur, { ...opts, graine: 8 });
    c1.poser(A); c2.poser(A); c3.poser(A);
    const res = { memes: somme(c1) === somme(c2), autre: somme(c1) !== somme(c3) };
    // Une case garde son givre quand la plaque s'agrandit (bruit en coordonnées de la carte).
    const P = window.PLATEAU_VTT.hexToPixel(A[0].q, A[0].r);
    const zone = () => { let s = 0; for (let dx = -6; dx <= 6; dx += 2) for (let dy = -6; dy <= 6; dy += 2) s += c1.opaciteEn(P.x + 7 + dx, P.y - 5 + dy); return s; };
    const avant = zone();
    c1.poser([{ q: A[0].q - 3, r: A[0].r + 1 }]);
    res.garde = Math.abs(zone() - avant) < 0.05;
    [c1, c2, c3].forEach(c => c.detruire());
    return res;
  }, A);
  verifier("les mêmes cases donnent le même givre (le bruit est déterministe)", r.memes);
  verifier("une autre graine, un autre givre", r.autre);
  verifier("une case garde son givre quand la plaque s'agrandit", r.garde);
  const src = fs.readFileSync('/home/user/Ivalis/zones_procedurales.js', 'utf-8');
  verifier("rien d'une image : pas de fichier ni d'URL d'image dans zones_procedurales.js", !/\.(png|jpe?g|webp|gif|svg)["'`]|https?:\/\//.test(src));
}

console.log("\n6. LE TERRAIN : LE FEU FOND LA GLACE, « REPLACER » EFFACE, LA GLACE QUI PASSE NE RESTE PAS");
{
  const r = await p.evaluate(async (A) => {
    window.replacerPionsStudio();
    await window.jouerAnimationStudio("zone-glace", { cases: A });
    const P = (c) => window.PLATEAU_VTT.hexToPixel(c.q, c.r);
    const leGivre = () => (typeof window.givreStudio === "function" && window.givreStudio()) || { opaciteEn: () => 0, couvertureEn: () => 0 };
    const c = A[3];
    const avant = leGivre().couvertureEn(P(c).x, P(c).y);
    await window.jouerAnimationStudio("zone-feu", { cases: [c] });
    const t = window.terrainStudio();
    const res = { avant, apres: leGivre().couvertureEn(P(c).x, P(c).y),
                  feu: t.zones.some(z => z.q === c.q && z.r === c.r && z.type === "feu"), glace: t.zones.filter(z => z.type === "glace").length };
    window.replacerPionsStudio();
    res.vide = document.querySelectorAll("#studio-givre .givre-couche").length === 0 && window.terrainStudio().zones.length === 0;
    await window.jouerAnimationStudio("entree-zone");
    await new Promise(r => setTimeout(r, 2500));
    res.passe = document.querySelectorAll("#studio-givre .givre-couche").length;
    // Le combat garde sa nappe de glace (le Studio d'abord, le jeu après validation).
    window.ZONES_PERSISTANTES = { z1: { type: "glace", hexes: [{ q: 3, r: 1 }] } };
    window.appliquerZonesPersistantes();
    const svg = document.getElementById("svg-zones-persistantes");
    res.jeu = !!(svg && svg.querySelector('g[clip-path="url(#zp-clip-hex)"]'));
    window.ZONES_PERSISTANTES = {};
    window.appliquerZonesPersistantes();
    return res;
  }, A);
  verifier("du feu posé sur une case gelée : elle fond (la plaque s'ouvre là), elle brûle", r.avant > 0.5 && r.apres < 0.5 && r.feu && r.glace === 6, JSON.stringify(r));
  verifier("« Replacer » efface la plaque avec le terrain", r.vide);
  verifier("la glace d'une démonstration (entrée de zone) ne reste pas sur la carte", r.passe === 0, String(r.passe));
  verifier("le combat garde sa nappe de glace tant que le Studio n'est pas validé", r.jeu);
}

console.log("\n7. LE CATALOGUE");
{
  const r = await p.evaluate(() => {
    const a = (window.ANIMATIONS_COMBAT || []).find(x => x.id === "zone-glace");
    return { nb: (window.ANIMATIONS_COMBAT || []).length, cible: !!(a && a.ciblage), desc: a ? a.description : "" };
  });
  verifier("toujours 143 animations ; la zone de glace se cible et dit ce qu'elle fait",
           r.nb === 143 && r.cible && /brume/.test(r.desc) && /contour/.test(r.desc), JSON.stringify(r));
}

await fin();
