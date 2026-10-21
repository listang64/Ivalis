// LES GRAVATS DU STUDIO, PROCÉDURAUX (v247).
//
// Nico : « Ensuite, dans le même esprit que ceux-là [les zones procédurales],
// refais-moi les zones de gravats, de terrain difficile, quand les murs se
// brisent. »
//
//   1. UN ÉBOULIS : tous les tas ne font qu'UNE plaque (zones_procedurales.js,
//      recette « gravats »), sans contour : la terre retournée (brune, presque
//      opaque), un petit monticule par case éclairé en haut à gauche, des
//      pierres cassées avec leurs ombres, des cailloux qui roulent au-delà de
//      la terre ; une poussière légère au vent, des bouffées qui se lèvent ;
//   2. COMME LES ZONES : deux tas voisins sans couture ; le même dessin pour
//      les mêmes cases ; l'éboulis gagne depuis le cœur ;
//   3. LES MURS QUI SE BRISENT : l'éboulis gagne la case du mur tombé, deux
//      murs tombés côte à côte n'en font qu'un ; un mur levé sur des gravats
//      les couvre ; « Replacer » efface tout ;
//   4. LE CATALOGUE le dit ; le combat garde ses tas tant que Nico n'a pas
//      validé.
import { ouvrirStudio } from './_studio_commun.mjs';

const { p, verifier, fin } = await ouvrirStudio();

// (Sur l'ancien code, pas d'éboulis : le banc compte ce qui manque au lieu de planter.)
await p.evaluate(() => {
  window.__case = (id) => { const el = document.getElementById(id); return { q: +el.dataset.q, r: +el.dataset.r }; };
  window.__P = (c) => window.PLATEAU_VTT.hexToPixel(c.q, c.r);
  window.__plaque = () => (typeof window.gravatsStudio === "function" && window.gravatsStudio())
    || { cases: () => [], couvertureEn: () => 0, opaciteEn: () => 0, voileEn: () => 0, el: null };
  // Ce que montre VRAIMENT le sol de l'éboulis en un point de la carte : [r, g, b, a].
  window.__px = (x, y) => {
    const s = document.querySelector("#studio-gravats .gravats-couche canvas.gravats-sol");
    if (!s) return [0, 0, 0, 0];
    const racine = s.parentElement;
    const i = Math.floor((x - parseFloat(racine.style.left)) / parseFloat(racine.style.width) * s.width);
    const j = Math.floor((y - parseFloat(racine.style.top)) / parseFloat(racine.style.height) * s.height);
    if (i < 0 || j < 0 || i >= s.width || j >= s.height) return [0, 0, 0, 0];
    return [...s.getContext("2d").getImageData(i, j, 1, 1).data];
  };
  window.__attendre = (ms) => new Promise(r => setTimeout(r, ms));
});

const R = await p.evaluate(() => window.PLATEAU_VTT.hexSize);

console.log("\n1. UN ÉBOULIS : LA TERRE, LES PIERRES, LA POUSSIÈRE");
{
  const r = await p.evaluate(async () => {
    window.replacerPionsStudio();
    const h = window.__case("studio-pion-heros");
    const pts = [{ q: h.q + 1, r: h.r - 2 }, { q: h.q + 2, r: h.r - 2 }, { q: h.q + 2, r: h.r - 3 }, { q: h.q + 4, r: h.r - 3 }];
    const t0 = performance.now();
    const joue = await window.jouerAnimationStudio("gravats", { cases: pts });
    const ms = performance.now() - t0;
    await window.__attendre(1500);
    const g = window.__plaque(), calque = document.getElementById("studio-gravats");
    const R = window.PLATEAU_VTT.hexSize;
    // La terre, les pierres : la couleur moyenne, les tons clairs (le dessus des pierres) et sombres (leurs ombres).
    let n = 0, r = 0, gg = 0, b = 0, a = 0, clairs = 0, sombres = 0;
    const s = calque.querySelector("canvas.gravats-sol");
    if (s) {
      const d = s.getContext("2d").getImageData(0, 0, s.width, s.height).data;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 30) {
        n++; r += d[i]; gg += d[i + 1]; b += d[i + 2]; a += d[i + 3];
        const l = (d[i] + d[i + 1] + d[i + 2]) / 3;
        if (l > 120 && d[i + 3] > 200) clairs++;
        if (l < 55 && d[i + 3] > 120) sombres++;
      }
    }
    // Le monticule : la pente en haut à gauche du cœur est plus claire que celle d'en bas à droite (hors pierres).
    let haut = 0, nh = 0, bas = 0, nb = 0;
    pts.forEach(c => {
      const o = window.__P(c);
      for (let k = 0; k < 400; k++) {
        const ang = k * 2.39996, d = R * (0.3 + 0.35 * ((k * 0.618) % 1));
        const x = o.x + Math.cos(ang) * d, y = o.y + Math.sin(ang) * d;
        const v = window.__px(x, y), l = (v[0] + v[1] + v[2]) / 3;
        if (v[3] < 120 || l > 115 || l < 50) continue;   // les pierres et leurs ombres à part
        const cote = Math.cos(ang) * 0.6 + Math.sin(ang) * 0.8;
        if (cote < -0.5) { haut += l; nh++; } else if (cote > 0.5) { bas += l; nb++; }
      }
    });
    // Des cailloux qui roulent au-delà de la terre : du sol opaque là où la plaque ne couvre plus.
    let roulent = 0;
    pts.forEach(c => {
      const o = window.__P(c);
      for (let k = 0; k < 900; k++) {
        const ang = k * 2.39996, d = R * (0.85 + 0.6 * ((k * 0.618) % 1));
        const x = o.x + Math.cos(ang) * d, y = o.y + Math.sin(ang) * d;
        if (g.couvertureEn(x, y) < 0.05 && window.__px(x, y)[3] > 200) roulent++;
      }
    });
    const voile = calque.querySelector(".gravats-poussiere .zone-proc-voile");
    const bouffees = [...calque.querySelectorAll(".gravats-bouffee")];
    return {
      joue, ms: Math.round(ms), plaques: calque.querySelectorAll(".gravats-couche").length, imgs: calque.querySelectorAll("img").length,
      traits: calque.querySelectorAll("polygon, path, line").length, cases: g.cases().length, terrain: window.terrainStudio().gravats.length,
      centres: pts.map(c => +g.couvertureEn(window.__P(c).x, window.__P(c).y).toFixed(2)),
      loin: g.couvertureEn(window.__P({ q: h.q - 3, r: h.r + 3 }).x, window.__P({ q: h.q - 3, r: h.r + 3 }).y),
      couleur: n ? [r / n, gg / n, b / n].map(Math.round) : [0, 0, 0], alpha: n ? +(a / n / 255).toFixed(2) : 0,
      clairs: n ? +(clairs / n).toFixed(3) : 0, sombres: n ? +(sombres / n).toFixed(3) : 0,
      pente: { haut: nh ? Math.round(haut / nh) : 0, bas: nb ? Math.round(bas / nb) : 0 }, roulent,
      voile: !!voile && voile.getAnimations().some(an => an.effect.getComputedTiming().iterations === Infinity && /translateX/.test(JSON.stringify(an.effect.getKeyframes()))),
      bouffees: bouffees.length, respirent: bouffees.length > 0 && bouffees.every(e => e.getAnimations().some(an => an.effect.getComputedTiming().iterations === Infinity))
    };
  });
  verifier("« Gravats » se joue ; ses 4 cases sont des gravats sur le terrain", r.joue && r.terrain === 4 && r.cases === 4, JSON.stringify({ joue: r.joue, terrain: r.terrain, cases: r.cases }));
  verifier("UN éboulis, plus de tas d'images ; aucun trait (pas de contour)", r.plaques === 1 && r.imgs === 0 && r.traits === 0, JSON.stringify({ plaques: r.plaques, imgs: r.imgs, traits: r.traits }));
  verifier("il couvre le centre de chaque case, et rien loin de lui", r.centres.every(x => x > 0.9) && r.loin === 0, JSON.stringify(r.centres));
  verifier("de la terre : brune (rouge > vert > bleu), presque opaque", r.couleur[0] > r.couleur[1] && r.couleur[1] > r.couleur[2] && r.alpha > 0.55 && r.alpha <= 0.95,
           JSON.stringify({ couleur: r.couleur, alpha: r.alpha }));
  verifier("des pierres : le dessus clair et l'ombre sombre, en nombre", r.clairs > 0.03 && r.sombres > 0.03, JSON.stringify({ clairs: r.clairs, sombres: r.sombres }));
  verifier("un petit monticule par case, éclairé en haut à gauche", r.pente.haut > r.pente.bas + 6, JSON.stringify(r.pente));
  verifier("des cailloux roulent au-delà de la terre", r.roulent >= 8, String(r.roulent));
  verifier("une poussière légère qui traîne au vent ; des bouffées qui se lèvent", r.voile && r.bouffees >= 4 && r.respirent, JSON.stringify({ voile: r.voile, bouffees: r.bouffees }));
}

console.log("\n2. COMME LES ZONES : SANS COUTURE, LE MÊME DESSIN, DEPUIS LE CŒUR");
{
  const r = await p.evaluate(async () => {
    window.replacerPionsStudio();
    const h = window.__case("studio-pion-heros");
    const A = { q: h.q + 2, r: h.r - 2 }, B = { q: h.q + 3, r: h.r - 2 }, C = { q: h.q + 4, r: h.r - 2 };
    const g0 = () => window.__plaque();
    // Trois cases en ligne : l'éboulis part du milieu (le cœur) ; les bouts suivent.
    const vus = { B: null, A: null, C: null };
    let fini = false;
    const t0 = performance.now();
    const sonde = () => {
      [["A", A], ["B", B], ["C", C]].forEach(([n, c]) => { const P = window.__P(c); if (vus[n] === null && window.__px(P.x, P.y)[3] > 60) vus[n] = performance.now() - t0; });
      if (!fini) requestAnimationFrame(sonde);
    };
    requestAnimationFrame(sonde);
    await window.jouerAnimationStudio("gravats", { cases: [A, B, C] });
    await window.__attendre(1200);
    fini = true;
    // La couture : la ligne de centre à centre entre A et B.
    const a = window.__P(A), b = window.__P(B), g = g0();
    const ligne = Array.from({ length: 21 }, (_, i) => g.couvertureEn(a.x + (b.x - a.x) * i / 20, a.y + (b.y - a.y) * i / 20));
    // Le même dessin pour les mêmes cases : une deuxième plaque, posée d'un coup, sur les mêmes cases.
    let memes = false;
    if (typeof window.creerCoucheGravats === "function") {
      const div = document.createElement("div");
      div.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;";
      document.getElementById("studio-gravats").appendChild(div);
      const autre = window.creerCoucheGravats(div, { R: window.PLATEAU_VTT.hexSize, pixel: (q, r) => window.PLATEAU_VTT.hexToPixel(q, r), graine: 7 });
      await autre.poser([A, B, C]);
      const s1 = document.querySelector("#studio-gravats > .gravats-couche canvas.gravats-sol"), s2 = div.querySelector("canvas.gravats-sol");
      const d1 = s1.getContext("2d").getImageData(0, 0, s1.width, s1.height).data, d2 = s2.getContext("2d").getImageData(0, 0, s2.width, s2.height).data;
      memes = s1.width === s2.width && d1.length === d2.length && d1.every((v, i) => Math.abs(v - d2[i]) <= 1);
      autre.detruire(); div.remove();
    }
    // Le calcul : sept cases d'un coup.
    let ms = -1;
    if (typeof window.creerCoucheGravats === "function") {
      const div = document.createElement("div");
      const c = window.creerCoucheGravats(div, { R: window.PLATEAU_VTT.hexSize, pixel: (q, r) => window.PLATEAU_VTT.hexToPixel(q, r), graine: 7 });
      const t = performance.now();
      c.poser([[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => ({ q: h.q + 3 + dq, r: h.r + 1 + dr })));
      ms = performance.now() - t;
      c.detruire();
    }
    return { vus, couture: +Math.min(...ligne).toFixed(2), plaques: document.querySelectorAll("#studio-gravats .gravats-couche").length, memes, ms: Math.round(ms) };
  });
  verifier("trois cases en ligne : UN éboulis, sans couture entre deux tas", r.plaques === 1 && r.couture > 0.9, JSON.stringify({ plaques: r.plaques, couture: r.couture }));
  verifier("il gagne depuis le cœur (la case du milieu), les bouts ensuite",
           r.vus.B !== null && r.vus.A !== null && r.vus.C !== null && r.vus.B < r.vus.A && r.vus.B < r.vus.C, JSON.stringify(r.vus));
  verifier("le même dessin pour les mêmes cases (rien n'est tiré au hasard)", r.memes);
  verifier("le calcul : sept cases en moins d'une seconde", r.ms >= 0 && r.ms < 1000, `${r.ms} ms`);
}

console.log("\n3. LES MURS QUI SE BRISENT");
{
  const r = await p.evaluate(async () => {
    window.replacerPionsStudio();
    const h = window.__case("studio-pion-heros");
    const ligne = [{ q: h.q + 1, r: h.r - 2 }, { q: h.q + 2, r: h.r - 2 }, { q: h.q + 3, r: h.r - 2 }];
    window.VITESSE_ANIMATIONS = 2;
    await window.jouerAnimationStudio("mur-terre", { cases: ligne });
    await window.jouerAnimationStudio("mur-effondre", { cases: [ligne[1]] });
    const un = { cases: window.__plaque().cases().length, terrain: window.terrainStudio().gravats.slice(), murs: window.terrainStudio().murs.length };
    await window.jouerAnimationStudio("mur-effondre", { cases: [ligne[2]] });
    await window.__attendre(1300);
    const g = window.__plaque();
    const deux = { cases: g.cases().length, plaques: document.querySelectorAll("#studio-gravats .gravats-couche").length,
                   murs: window.terrainStudio().murs.length };
    const a = window.__P(ligne[1]), b = window.__P(ligne[2]);
    deux.couture = +Math.min(...Array.from({ length: 21 }, (_, i) => g.couvertureEn(a.x + (b.x - a.x) * i / 20, a.y + (b.y - a.y) * i / 20))).toFixed(2);
    // Un mur levé sur les gravats les couvre : l'éboulis s'y retire.
    await window.jouerAnimationStudio("mur-terre", { cases: [ligne[2]] });
    await window.__attendre(300);
    const couvert = { cases: window.__plaque().cases().length, terrain: window.terrainStudio().gravats.length,
                      la: +window.__plaque().couvertureEn(b.x, b.y).toFixed(2) };
    window.VITESSE_ANIMATIONS = 1;
    window.replacerPionsStudio();
    const vide = document.querySelectorAll("#studio-gravats *").length === 0 && window.terrainStudio().gravats.length === 0
                 && (typeof window.gravatsStudio !== "function" || window.gravatsStudio() === null);
    return { un, deux, couvert, vide, milieu: `${ligne[1].q}_${ligne[1].r}` };
  });
  verifier("le mur du milieu tombe : l'éboulis gagne sa case (et elle seule)", r.un.cases === 1 && r.un.terrain.join() === r.milieu && r.un.murs === 2, JSON.stringify(r.un));
  verifier("deux murs tombés côte à côte : UN éboulis de deux cases, sans couture",
           r.deux.cases === 2 && r.deux.plaques === 1 && r.deux.couture > 0.9 && r.deux.murs === 1, JSON.stringify(r.deux));
  verifier("un mur levé sur des gravats les couvre : l'éboulis s'y retire", r.couvert.cases === 1 && r.couvert.terrain === 1 && r.couvert.la < 0.5, JSON.stringify(r.couvert));
  verifier("« Replacer » efface l'éboulis avec le terrain", r.vide);
}

console.log("\n4. LE CATALOGUE ; LE COMBAT (SES TAS, PUIS L'ÉBOULIS EN v249)");
{
  const r = await p.evaluate(() => {
    const a = (id) => (window.ANIMATIONS_COMBAT || []).find(x => x.id === id) || {};
    // Le combat gardait le tas de dessinerGravatsTerre tant que Nico n'avait pas
    // validé ; validé, l'éboulis y est intégré en v249 : plus d'image, une plaque.
    window.GRAVATS_TERRE = { "3_1": true };
    window.appliquerMursTerre();
    const plaque = typeof window.gravatsDuCombat === "function" && window.gravatsDuCombat();
    const jeu = document.querySelectorAll("#calque-murs-terre img.gravats-terre").length === 0 && plaque ? window.casesGravatsDuCombat().length : 0;
    window.GRAVATS_TERRE = {};
    window.appliquerMursTerre();
    return { nb: (window.ANIMATIONS_COMBAT || []).length, gravats: a("gravats").description || "", effondre: a("mur-effondre").description || "",
             types: window.TYPES_ZONES_PROCEDURALES || [], jeu, moteur: typeof window.creerCoucheGravats === "function" };
  });
  // (v248 : la zone de pièges en plus — 144.)
  verifier("toujours 144 animations ; « Gravats » et « Mur effondré » parlent d'éboulis, sans contour",
           r.nb === 144 && /éboulis/.test(r.gravats) && /contour/.test(r.gravats) && /éboulis/.test(r.effondre), JSON.stringify({ nb: r.nb }));
  // (v249 : les pièges sont devenus une zone du combat — cinq.)
  verifier("le moteur sait faire des gravats (creerCoucheGravats), qui ne sont pas une zone", r.moteur && !r.types.includes("gravats") && r.types.length === 5, r.types.join());
  verifier("le combat pose le même éboulis (validé, intégré en v249)", r.jeu === 1, String(r.jeu));
}

void R;
await fin();
