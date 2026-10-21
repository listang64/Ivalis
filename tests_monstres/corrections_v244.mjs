// LA ZONE DE FEU DU STUDIO, PROCÉDURALE (v244).
//
// Nico : « Comme les zones de glace, fais aussi de façon procédurale les zones
// de feu du Studio. »
//
//   1. LE BRASIER : une seule plaque pour les cases visées (zones_procedurales.js),
//      sans contour ; le sol calciné, sombre et translucide ; rien loin de lui ;
//   2. LES BRAISES : des fissures qui rougeoient, sur un calque qui s'éclaire
//      (écran) et respire, avec son halo flou ;
//   3. LE FEU GAGNE depuis le cœur de la zone ;
//   4. DEUX ZONES COLLÉES : un seul brasier, sans couture ;
//   5. LES FLAMMES ET LA FUMÉE au vent ; la fumée part sous le vent ; les
//      étincelles s'envolent avec lui ;
//   6. PROCÉDURAL : le même brasier pour les mêmes cases ; le même moteur que le
//      givre (qui reste ce qu'il était) ;
//   7. LE TERRAIN : la glace éteint le feu, le feu fond la glace ; « Replacer »
//      efface tout ; le feu d'une démonstration ne reste pas ; le combat garde
//      sa nappe.
import fs from 'fs';
import { ouvrirStudio } from './_studio_commun.mjs';

const { p, verifier, fin } = await ouvrirStudio();

const fleur = (c) => [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => ({ q: c.q + dq, r: c.r + dr }));
const A = fleur({ q: 3, r: -3 }), B = fleur({ q: 5, r: -4 });
// (Sur l'ancien code, pas de brasier : le banc compte ce qui manque au lieu de planter.)
const FEU = `(typeof window.coucheStudio === "function" && window.coucheStudio("feu")) || { opaciteEn: () => 0, couvertureEn: () => 0, braisesEn: () => 0, voileEn: () => 0, vent: () => ({ angle: 0 }) }`;

console.log("\n1. LE BRASIER : UNE SEULE PLAQUE, SANS CONTOUR, LE SOL CALCINÉ");
{
  const r = await p.evaluate(async ({ A, FEU }) => {
    window.replacerPionsStudio();
    const joue = await window.jouerAnimationStudio("zone-feu", { cases: A });
    const f = (0, eval)(FEU);
    const P = (c) => window.PLATEAU_VTT.hexToPixel(c.q, c.r);
    const sol = document.querySelector("#studio-feu canvas.feu-sol");
    let n = 0, lum = 0, alpha = 0;
    if (sol) {
      const d = sol.getContext("2d").getImageData(0, 0, sol.width, sol.height).data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 30) { n++; lum += (d[i] + d[i + 1] + d[i + 2]) / 3; alpha += d[i + 3]; }
    }
    return { joue, moteur: typeof window.creerCoucheFeu === "function",
             zones: window.terrainStudio().zones.filter(z => z.type === "feu").length,
             plaques: document.querySelectorAll("#studio-feu .feu-couche").length,
             nappes: document.querySelectorAll('#studio-zones .studio-nappe[data-type="feu"]').length,
             traits: document.querySelectorAll("#studio-feu polygon, #studio-feu path, #studio-feu line").length,
             centres: A.map(c => +f.couvertureEn(P(c).x, P(c).y).toFixed(2)),
             loin: f.couvertureEn(P({ q: 8, r: -6 }).x, P({ q: 8, r: -6 }).y),
             lum: n ? lum / n : 255, alpha: n ? alpha / n / 255 : 0 };
  }, { A, FEU });
  verifier("le Studio a son brasier (zones_procedurales.js) et la zone de feu se joue", r.moteur && r.joue);
  verifier("les 7 cases visées sont des cases de feu du terrain", r.zones === 7, String(r.zones));
  verifier("UN brasier, pas une nappe hexagonale par case ; aucun trait (pas de contour)", r.plaques === 1 && r.nappes === 0 && r.traits === 0, JSON.stringify(r));
  verifier("le feu couvre le centre de chaque case, et rien loin de lui", r.centres.every(x => x > 0.9) && r.loin === 0, JSON.stringify(r.centres));
  verifier("le sol calciné : sombre, et translucide (le terrain se devine dessous)", r.lum < 70 && r.alpha > 0.25 && r.alpha < 0.8, `${r.lum.toFixed(0)} / ${r.alpha.toFixed(2)}`);
}

console.log("\n2. LES BRAISES : DES FISSURES QUI ROUGEOIENT ET RESPIRENT");
{
  const r = await p.evaluate(({ A, FEU }) => {
    const f = (0, eval)(FEU);
    const braises = document.querySelector("#studio-feu canvas.feu-braises"), halo = document.querySelector("#studio-feu canvas.feu-halo");
    let n = 0, total = 0, orange = 0;
    if (braises) {
      const d = braises.getContext("2d").getImageData(0, 0, braises.width, braises.height).data;
      for (let i = 0; i < d.length; i += 4) { total++; if (d[i + 3] > 40) { n++; if (d[i] === 255 && d[i + 1] < 230 && d[i + 2] < 120) orange++; } }
    }
    const respire = (el) => !!el && el.getAnimations().some(a => a.effect.getComputedTiming().iterations === Infinity);
    return { braises: !!braises, part: total ? n / total : 0, orange: n ? orange / n : 0,
             ecran: !!braises && getComputedStyle(braises).mixBlendMode === "screen",
             respire: respire(braises) && respire(halo), flou: !!halo && /blur/.test(halo.style.filter) };
  }, { A, FEU });
  verifier("un calque de braises : des fissures (une petite part de la plaque), orange", r.braises && r.part > 0.005 && r.part < 0.25 && r.orange > 0.9, JSON.stringify(r));
  verifier("…qui s'éclairent (mélange « écran »), respirent, avec un halo flou", r.ecran && r.respire && r.flou, JSON.stringify(r));
}

console.log("\n3. LE FEU GAGNE DEPUIS LE CŒUR DE LA ZONE");
{
  const r = await p.evaluate(async (A) => {
    window.replacerPionsStudio();
    const P = (c) => window.PLATEAU_VTT.hexToPixel(c.q, c.r);
    const fini = window.jouerAnimationStudio("zone-feu", { cases: A });
    await new Promise(r => setTimeout(r, 450));
    const sol = document.querySelector("#studio-feu canvas.feu-sol");
    const couche = sol && sol.parentElement;
    const lire = (c) => {
      if (!sol) return -1;
      const k = sol.width / parseFloat(couche.style.width);
      const x = Math.floor((P(c).x - parseFloat(couche.style.left)) * k), y = Math.floor((P(c).y - parseFloat(couche.style.top)) * k);
      const d = sol.getContext("2d").getImageData(x - 6, y - 6, 13, 13).data;
      let s = 0; for (let i = 3; i < d.length; i += 4) s += d[i];
      return s / (d.length / 4) / 255;
    };
    const tot = { coeur: lire(A[0]), bord: Math.max(...A.slice(1).map(lire)) };
    await fini;
    return { tot, apres: { coeur: lire(A[0]), bord: Math.min(...A.slice(1).map(lire)) } };
  }, A);
  verifier("à mi-chemin : le cœur brûle, le bord pas encore (ou à peine)", r.tot.coeur > 0.2 && r.tot.bord < r.tot.coeur * 0.6, JSON.stringify(r.tot));
  verifier("à la fin : toutes les cases brûlent", r.apres.coeur > 0.2 && r.apres.bord > 0.2, JSON.stringify(r.apres));
}

console.log("\n4. DEUX ZONES COLLÉES : UN SEUL BRASIER, SANS COUTURE");
{
  const r = await p.evaluate(async ({ A, B, FEU }) => {
    window.replacerPionsStudio();
    await window.jouerAnimationStudio("zone-feu", { cases: A });
    await window.jouerAnimationStudio("zone-feu", { cases: B });
    const f = (0, eval)(FEU);
    const P = (c) => window.PLATEAU_VTT.hexToPixel(c.q, c.r);
    const a = P(A[0]), b = P(B[0]), trait = [];
    for (let i = 0; i <= 24; i++) trait.push(f.couvertureEn(a.x + (b.x - a.x) * i / 24, a.y + (b.y - a.y) * i / 24));
    return { plaques: document.querySelectorAll("#studio-feu .feu-couche").length, zones: window.terrainStudio().zones.length, min: Math.min(...trait) };
  }, { A, B, FEU });
  verifier("toujours UN brasier, 12 cases de feu", r.plaques === 1 && r.zones === 12, JSON.stringify(r));
  verifier("d'un cœur de zone à l'autre, à travers leur jonction : aucune couture", r.min > 0.95, String(r.min));
}

console.log("\n5. LES FLAMMES, LA FUMÉE SOUS LE VENT, LES ÉTINCELLES");
{
  const r = await p.evaluate(async ({ B, FEU }) => {
    const f = (0, eval)(FEU);
    const flammes = document.querySelector("#studio-feu .feu-flammes"), fumee = document.querySelector("#studio-feu .feu-fumee");
    const voiles = (g) => g ? [...g.querySelectorAll(".feu-voile")] : [];
    const derive = (g) => voiles(g).length === 2 && voiles(g).every(v => v.getAnimations().some(a => (a.effect.getKeyframes()[0].transform || "").includes("translateX")
                                                                                              && a.effect.getComputedTiming().iterations === Infinity));
    // Les flammes vacillent vite ; la fumée respire lentement.
    const vacille = voiles(flammes).every(v => v.getAnimations().some(a => a.effect.getKeyframes().length >= 5 && a.effect.getComputedTiming().duration < 1500));
    const masque = (g) => g ? /^url\("?data:image\/png/.test(getComputedStyle(g).webkitMaskImage || getComputedStyle(g).maskImage || "") : false;
    // Sous le vent, au-delà du bord de la zone, la fumée ; au vent, presque rien.
    const P = (c) => window.PLATEAU_VTT.hexToPixel(c.q, c.r);
    // (B est sous le vent de A : on lit en aval de B, et en amont de A.)
    const v = f.vent(), R = window.PLATEAU_VTT.hexSize, cb = P({ q: 5, r: -4 }), ca = P({ q: 3, r: -3 });
    let sous = 0, au = 0;
    for (let d = 3.3; d <= 3.95; d += 0.15) { sous += f.voileEn("fumee", cb.x + Math.cos(v.angle) * R * d, cb.y + Math.sin(v.angle) * R * d);
                                           au += f.voileEn("fumee", ca.x - Math.cos(v.angle) * R * d, ca.y - Math.sin(v.angle) * R * d); }
    const etincelles = [...document.querySelectorAll("#studio-feu .feu-etincelle")];
    const envol = etincelles.length > 0 && etincelles.every(e => e.getAnimations().some(a => {
      const k = a.effect.getKeyframes(), fin = (k[k.length - 1].transform || "").match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/);
      return fin && Math.sign(+fin[1]) === Math.sign(Math.cos(v.angle)) && +fin[3] > 1.2;
    }));
    return { flammes: derive(flammes), fumee: derive(fumee), vacille, ecran: !!flammes && /zone-proc-ecran/.test(flammes.className),
             masques: masque(flammes) && masque(fumee), sous, au, etincelles: etincelles.length, envol };
  }, { B, FEU });
  verifier("des flammes : deux voiles qui dérivent au vent sans fin, qui s'éclairent (écran) et vacillent vite",
           r.flammes && r.ecran && r.vacille && r.masques, JSON.stringify(r));
  verifier("une fumée : deux voiles qui dérivent, dans son masque", r.fumee, JSON.stringify(r));
  verifier("la fumée part sous le vent, au-delà de la zone (et pas au vent)", r.sous > 0.5 && r.sous > r.au * 3, `${r.sous.toFixed(2)} / ${r.au.toFixed(2)}`);
  verifier("des étincelles s'envolent avec le vent (elles grandissent : elles montent)", r.etincelles >= 12 && r.envol, String(r.etincelles));
}

console.log("\n6. PROCÉDURAL, ET LE MÊME MOTEUR QUE LE GIVRE");
{
  const r = await p.evaluate((A) => {
    const conteneur = document.getElementById("studio-feu");
    if (!conteneur || typeof window.creerCoucheFeu !== "function") return { memes: false, givre: false };
    const opts = { R: window.PLATEAU_VTT.hexSize, pixel: (q, r) => window.PLATEAU_VTT.hexToPixel(q, r), graine: 7 };
    const somme = (c, sel) => { const s = c.el.querySelector(sel); const d = s.getContext("2d").getImageData(0, 0, s.width, s.height).data;
                                let t = 0; for (let i = 0; i < d.length; i += 7) t = (t * 31 + d[i]) % 1000003; return t; };
    const c1 = window.creerCoucheFeu(conteneur, opts), c2 = window.creerCoucheFeu(conteneur, opts);
    c1.poser(A); c2.poser(A);
    const res = { memes: somme(c1, "canvas.feu-sol") === somme(c2, "canvas.feu-sol") && somme(c1, "canvas.feu-braises") === somme(c2, "canvas.feu-braises") };
    const g = window.creerCoucheGivre(conteneur, opts);
    g.poser(A);
    res.givre = !!g.el.querySelector("canvas.givre-sol") && !g.el.querySelector("canvas.feu-braises") && g.el.classList.contains("givre-couche")
             && typeof window.creerCoucheProcedurale === "function" && ["glace", "feu"].every(t => (window.TYPES_ZONES_PROCEDURALES || []).includes(t));
    [c1, c2, g].forEach(c => c.detruire());
    return res;
  }, A);
  verifier("les mêmes cases donnent le même brasier (sol et braises)", r.memes);
  verifier("le givre sort du même moteur (zones_procedurales.js), avec sa recette à lui", r.givre);
  const MOTEUR = '/home/user/Ivalis/zones_procedurales.js';
  const src = fs.existsSync(MOTEUR) ? fs.readFileSync(MOTEUR, 'utf-8') : null;
  verifier("rien d'une image : pas de fichier ni d'URL d'image dans le moteur", !!src && !/\.(png|jpe?g|webp|gif|svg)["'`]|https?:\/\//.test(src));
}

console.log("\n7. LE TERRAIN : LA GLACE ÉTEINT LE FEU, « REPLACER », LE FEU QUI PASSE, LE COMBAT");
{
  const r = await p.evaluate(async ({ A, FEU }) => {
    window.replacerPionsStudio();
    await window.jouerAnimationStudio("zone-feu", { cases: A });
    const P = (c) => window.PLATEAU_VTT.hexToPixel(c.q, c.r);
    const c = A[3];
    const avant = (0, eval)(FEU).couvertureEn(P(c).x, P(c).y);
    await window.jouerAnimationStudio("zone-glace", { cases: [c] });
    const t = window.terrainStudio();
    const g = (typeof window.givreStudio === "function" && window.givreStudio()) || { couvertureEn: () => 0 };
    const res = { avant, apres: (0, eval)(FEU).couvertureEn(P(c).x, P(c).y), gele: g.couvertureEn(P(c).x, P(c).y),
                  glace: t.zones.some(z => z.q === c.q && z.r === c.r && z.type === "glace"), feu: t.zones.filter(z => z.type === "feu").length };
    window.replacerPionsStudio();
    res.vide = document.querySelectorAll("#studio-feu .feu-couche, #studio-givre .givre-couche").length === 0 && window.terrainStudio().zones.length === 0;
    // Le Géomancien dans ses flammes : une seule petite plaque pendant la démonstration, qui ne reste pas.
    let pendant = 0;
    const obs = setInterval(() => { pendant = Math.max(pendant, document.querySelectorAll("#studio-feu .feu-couche").length); }, 30);
    await window.jouerAnimationStudio("zones-sans-danger");
    clearInterval(obs);
    await new Promise(r => setTimeout(r, 2500));
    res.demo = { pendant, apres: document.querySelectorAll("#studio-feu .feu-couche").length };
    await window.jouerAnimationStudio("entree-zone");
    await new Promise(r => setTimeout(r, 2500));
    res.entree = document.querySelectorAll("#studio-feu .feu-couche, #studio-givre .givre-couche").length;
    window.ZONES_PERSISTANTES = { z1: { type: "feu", hexes: [{ q: 3, r: 1 }] } };
    window.appliquerZonesPersistantes();
    // (Validé, le brasier est intégré au combat en v246 : la même plaque, plus de nappe.)
    const svg = document.getElementById("svg-zones-persistantes");
    res.jeu = !!document.querySelector("#zones-procedurales .feu-couche") && !(svg && svg.querySelector('g[clip-path="url(#zp-clip-hex)"]'));
    window.ZONES_PERSISTANTES = {};
    window.appliquerZonesPersistantes();
    return res;
  }, { A, FEU });
  verifier("de la glace sur une case qui brûle : le feu s'y éteint, elle gèle", r.avant > 0.5 && r.apres < 0.5 && r.gele > 0.5 && r.glace && r.feu === 6, JSON.stringify(r));
  verifier("« Replacer » efface le brasier et le givre avec le terrain", r.vide);
  verifier("le Géomancien dans ses flammes : un seul petit brasier le temps de la démonstration, qui ne reste pas",
           r.demo.pendant === 1 && r.demo.apres === 0, JSON.stringify(r.demo));
  verifier("le feu et la glace d'une entrée de zone ne restent pas", r.entree === 0, String(r.entree));
  verifier("le combat pose le même brasier (validé, intégré en v246)", r.jeu);
}

console.log("\n8. LE CATALOGUE");
{
  const r = await p.evaluate(() => {
    const a = (window.ANIMATIONS_COMBAT || []).find(x => x.id === "zone-feu");
    return { nb: (window.ANIMATIONS_COMBAT || []).length, cible: !!(a && a.ciblage), desc: a ? a.description : "" };
  });
  // (v248 : la zone de pièges en plus — 144 ; v250 : la zone de soin — 145.)
  verifier("toujours 145 animations ; la zone de feu se cible et dit ce qu'elle fait",
           r.nb === 145 && r.cible && /braises/.test(r.desc) && /fumée/.test(r.desc) && /contour/.test(r.desc), JSON.stringify(r));
}

await fin();
