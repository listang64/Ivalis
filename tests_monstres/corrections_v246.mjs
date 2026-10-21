// LES ZONES PROCÉDURALES, EN JEU (v246).
//
// Nico, devant le Studio : « Parfait, tu peux intégrer les zones de glace /
// feu / poison et électrique, j'adore. »
//
//   1. LE PLATEAU DU COMBAT : chaque élément est UNE plaque procédurale
//      (zones_procedurales.js), sans contour, sous les pions ; plus de nappe
//      SVG par case pour eux ; le soin garde la sienne ;
//   2. LES QUATRE ENSEMBLE, et deux zones collées du même élément : une seule
//      plaque, sans couture ;
//   3. UNE ZONE QUI SE POSE gagne le terrain depuis son centre ; une case qui
//      s'en va quitte la plaque ; un élément qui disparaît s'efface en fondu ;
//      rien ne se redessine pour rien ;
//   4. UN PLATEAU RECONSTRUIT (comme une page ouverte en plein combat) : la
//      plaque est posée d'un coup ; la retenue (le tour pas encore rejoué)
//      tient ; sans le moteur procédural, l'ancienne nappe revient.
import fs from 'fs';
import { ouvrirStudio } from './_studio_commun.mjs';

const { p, verifier, fin } = await ouvrirStudio();
const DOSSIER = '/tmp/claude-0/-home-user-Ivalis/3718c626-55b5-577c-9b4f-a49012fd3784/scratchpad/v246';
fs.mkdirSync(DOSSIER, { recursive: true });

const fleur = (c) => [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => ({ q: c.q + dq, r: c.r + dr }));

// Le Studio fermé : on regarde le plateau du combat lui-même.
await p.evaluate(() => {
  window.fermerStudioAnimation();
  const param = document.getElementById("conteneur-parametres");
  if (param) { param.style.display = "none"; param.classList.remove("ouvert"); }
  const fc = document.getElementById("fenetre-combat");
  if (fc) fc.style.display = "block";
  // Le plateau cadré sur les zones (pour les captures).
  const tp = document.getElementById("transform-plateau");
  if (tp) tp.style.transform = "translate(-437px, -160px) scale(0.9)";
  window.ZONES_PERSISTANTES = {};
  const PRE = { glace: "givre", feu: "feu", poison: "poison", electrique: "elec" };
  // (Sur l'ancien code, pas de plaque : le banc compte ce qui manque au lieu de planter.)
  window.__couches = () => (typeof window.couchesZonesDuCombat === "function" ? window.couchesZonesDuCombat() : {});
  window.__couche = (type) => window.__couches()[type] || { cases: () => [], couvertureEn: () => 0, el: null };
  window.__P = (c) => window.PLATEAU_VTT.hexToPixel(c.q, c.r);
  // Ce que montre VRAIMENT le sol de la plaque en un point de la carte (pendant qu'elle avance aussi).
  window.__sol = (type, c) => {
    const s = document.querySelector(`#zones-procedurales .${PRE[type]}-couche canvas.${PRE[type]}-sol`);
    if (!s) return 0;
    const racine = s.parentElement, P = window.__P(c);
    const i = Math.floor((P.x - parseFloat(racine.style.left)) / parseFloat(racine.style.width) * s.width);
    const j = Math.floor((P.y - parseFloat(racine.style.top)) / parseFloat(racine.style.height) * s.height);
    if (i < 0 || j < 0 || i >= s.width || j >= s.height) return 0;
    return s.getContext("2d").getImageData(i, j, 1, 1).data[3] / 255;
  };
  window.__nappes = () => {
    const svg = document.getElementById("svg-zones-persistantes");
    return svg ? [...svg.querySelectorAll("g[clip-path]")].filter(g => g.getAttribute("clip-path") === "url(#zp-clip-hex)").length : 0;
  };
  window.__plaques = (type) => document.querySelectorAll(`#zones-procedurales .${PRE[type]}-couche`).length;
  window.__attendre = (ms) => new Promise(r => setTimeout(r, ms));
});

const A = fleur({ q: 3, r: -2 }), B = fleur({ q: 6, r: -3 });

console.log("\n1. LE PLATEAU DU COMBAT : UNE PLAQUE PAR ÉLÉMENT, SANS CONTOUR");
{
  const r = await p.evaluate(async (A) => {
    window.ZONES_PERSISTANTES = { z1: { type: "glace", hexes: A } };
    window.appliquerZonesPersistantes();
    await window.__attendre(1800);
    const calque = document.getElementById("zones-procedurales");
    const svg = document.getElementById("svg-zones-persistantes");
    const c = window.__couche("glace");
    return {
      plaques: window.__plaques("glace"), nappes: window.__nappes(),
      traits: calque ? calque.querySelectorAll("polygon, path, line").length : -1,
      centres: A.map(x => +c.couvertureEn(window.__P(x).x, window.__P(x).y).toFixed(2)),
      sol: A.map(x => +window.__sol("glace", x).toFixed(2)),
      loin: c.couvertureEn(window.__P({ q: -4, r: 3 }).x, window.__P({ q: -4, r: 3 }).y),
      dans: !!(calque && calque.parentElement && calque.parentElement.id === "transform-plateau"),
      avant: !!(calque && svg && calque.nextElementSibling === svg),
      style: calque ? [calque.style.zIndex, calque.style.pointerEvents, calque.style.position].join() : "",
      // Le plateau zoomé (#transform-plateau) est sous le calque des pions, son voisin (z 3).
      sousLesPions: (() => {
        const t = document.getElementById("conteneur-tokens-vtt"), tp = document.getElementById("transform-plateau");
        const z = getComputedStyle(tp).zIndex;
        return !!(t && calque && tp.contains(calque) && t.parentElement === tp.parentElement && +getComputedStyle(t).zIndex > 0 && (z === "auto" || +z < +getComputedStyle(t).zIndex));
      })(),
      brume: document.querySelectorAll("#zones-procedurales .givre-brume").length,
      eclats: document.querySelectorAll("#zones-procedurales .givre-eclat").length
    };
  }, A);
  verifier("une zone de glace en jeu : UNE plaque de givre, plus aucune nappe SVG", r.plaques === 1 && r.nappes === 0, JSON.stringify({ plaques: r.plaques, nappes: r.nappes }));
  verifier("…sans contour (aucun trait)", r.traits === 0, String(r.traits));
  verifier("…elle couvre le centre de ses 7 cases (et le sol s'y voit), rien loin d'elle",
           r.centres.every(x => x > 0.9) && r.sol.every(x => x > 0.15) && r.loin === 0, JSON.stringify({ centres: r.centres, sol: r.sol }));
  verifier("…dans le plateau (#transform-plateau), sous la nappe SVG, z 3, sans capter les clics",
           r.dans && r.avant && r.style === "3,none,absolute", JSON.stringify({ dans: r.dans, avant: r.avant, style: r.style }));
  verifier("…sous les pions", r.sousLesPions);
  verifier("…avec sa brume au vent et ses scintillements, comme au Studio", r.brume >= 1 && r.eclats >= 3, JSON.stringify({ brume: r.brume, eclats: r.eclats }));
  await p.screenshot({ path: `${DOSSIER}/1_glace_en_jeu.png` });
}

console.log("\n2. LES QUATRE ENSEMBLE ; DEUX ZONES COLLÉES : UNE PLAQUE");
{
  const r = await p.evaluate(async ({ A, B }) => {
    window.ZONES_PERSISTANTES = {
      z1: { type: "glace", hexes: A },
      z2: { type: "feu", hexes: [{ q: -3, r: 1 }, { q: -2, r: 1 }, { q: -3, r: 2 }] },
      z3: { type: "feu", hexes: [{ q: -1, r: 1 }, { q: -2, r: 2 }] },
      z4: { type: "poison", hexes: [{ q: 0, r: 3 }, { q: 1, r: 3 }, { q: 1, r: 2 }] },
      z5: { type: "electrique", hexes: B },
      z6: { type: "soin", hexes: [{ q: -4, r: -1 }, { q: -3, r: -1 }] }
    };
    window.appliquerZonesPersistantes();
    await window.__attendre(2200);
    const feu = window.__couche("feu");
    // La couture entre z2 et z3 : la ligne qui va du centre de (-2, 1) au centre de (-1, 1).
    const a = window.__P({ q: -2, r: 1 }), b = window.__P({ q: -1, r: 1 });
    const ligne = Array.from({ length: 21 }, (_, i) => feu.couvertureEn(a.x + (b.x - a.x) * i / 20, a.y + (b.y - a.y) * i / 20));
    return {
      plaques: ["glace", "feu", "poison", "electrique"].map(t => window.__plaques(t)).join(),
      nappes: window.__nappes(), feu: feu.cases().length,
      couture: +Math.min(...ligne).toFixed(2),
      soins: (() => { const svg = document.getElementById("svg-zones-persistantes"); return svg ? svg.querySelectorAll("g[clip-path]").length : 0; })(),
      fumee: document.querySelectorAll("#zones-procedurales .feu-fumee").length,
      flammes: document.querySelectorAll("#zones-procedurales .feu-flammes").length,
      miasme: document.querySelectorAll("#zones-procedurales .poison-miasme").length,
      bulles: document.querySelectorAll("#zones-procedurales .poison-bulle").length,
      arcs: document.querySelectorAll("#zones-procedurales .elec-arcs canvas").length,
      plasma: document.querySelectorAll("#zones-procedurales .elec-plasma").length
    };
  }, { A, B });
  verifier("glace, feu, poison et foudre : chacun SA plaque", r.plaques === "1,1,1,1", r.plaques);
  verifier("deux zones de feu collées : un seul brasier de 5 cases, sans couture", r.feu === 5 && r.couture > 0.9, JSON.stringify({ feu: r.feu, couture: r.couture }));
  verifier("le soin garde sa nappe SVG (une par case), lui seul", r.nappes === 2 && r.soins === 2, JSON.stringify({ nappes: r.nappes, soins: r.soins }));
  verifier("le brasier a sa fumée et ses flammes ; le marais son miasme et ses bulles ; la foudre ses arcs et son plasma",
           r.fumee >= 1 && r.flammes >= 1 && r.miasme >= 1 && r.bulles >= 1 && r.arcs >= 1 && r.plasma >= 1, JSON.stringify(r));
  await p.screenshot({ path: `${DOSSIER}/2_les_quatre_en_jeu.png` });
}

console.log("\n3. UNE ZONE QUI SE POSE, QUI S'EN VA ; RIEN POUR RIEN");
{
  const r = await p.evaluate(async ({ A, B }) => {
    // Rien ne bouge : rappeler la fonction ne redessine rien.
    const avant = [...document.querySelectorAll("#zones-procedurales canvas")];
    for (let i = 0; i < 5; i++) window.appliquerZonesPersistantes();
    await window.__attendre(80);
    const memes = [...document.querySelectorAll("#zones-procedurales canvas")];
    const res = { memes: avant.length > 0 && avant.length === memes.length && avant.every((c, i) => c === memes[i] && c.isConnected) };
    // Une nouvelle zone de glace, plus loin, collée à la première : elle gagne depuis son centre.
    const C = [{ q: 4, r: 0 }, { q: 5, r: 0 }, { q: 5, r: -1 }, { q: 4, r: 1 }, { q: 3, r: 1 }];
    window.ZONES_PERSISTANTES.z7 = { type: "glace", hexes: C };
    window.appliquerZonesPersistantes();
    await window.__attendre(250);
    res.tot = { centre: window.__sol("glace", { q: 4, r: 0 }), bord: window.__sol("glace", { q: 3, r: 1 }), loin: window.__sol("glace", { q: 5, r: -1 }) };
    await window.__attendre(1800);
    res.tard = { centre: window.__sol("glace", { q: 4, r: 0 }), bord: window.__sol("glace", { q: 3, r: 1 }), loin: window.__sol("glace", { q: 5, r: -1 }) };
    res.glace = window.__couche("glace").cases().length;
    res.plaques = window.__plaques("glace");
    // La zone z7 s'éteint : ses cases quittent la plaque, la première reste.
    delete window.ZONES_PERSISTANTES.z7;
    window.appliquerZonesPersistantes();
    await window.__attendre(150);
    const g = window.__couche("glace");
    res.apres = { cases: g.cases().length, z7: +g.couvertureEn(window.__P({ q: 4, r: 1 }).x, window.__P({ q: 4, r: 1 }).y).toFixed(2),
                  A: +g.couvertureEn(window.__P(A[0]).x, window.__P(A[0]).y).toFixed(2), plaques: window.__plaques("glace") };
    // La foudre disparaît du plateau : sa plaque s'efface en fondu, puis s'en va.
    delete window.ZONES_PERSISTANTES.z5;
    window.appliquerZonesPersistantes();
    await window.__attendre(200);
    const el = document.querySelector("#zones-procedurales .elec-couche");
    res.fondu = el ? +getComputedStyle(el).opacity : -1;
    await window.__attendre(800);
    res.partie = { plaques: window.__plaques("electrique"), couche: !window.__couches().electrique };
    // Elle revient : une plaque neuve.
    window.ZONES_PERSISTANTES.z5 = { type: "electrique", hexes: B };
    window.appliquerZonesPersistantes();
    await window.__attendre(1800);
    res.revient = { plaques: window.__plaques("electrique"), centre: +window.__sol("electrique", B[0]).toFixed(2) };
    return res;
  }, { A, B });
  verifier("rappeler la fonction sans rien changer ne redessine rien (les mêmes canvas)", r.memes);
  verifier("une zone de glace qui se pose : elle part de son centre, ses bords suivent",
           r.tot.centre > 0.15 && r.tot.loin < r.tot.centre * 0.5 && r.tard.loin > 0.15 && r.tard.bord > 0.15,
           JSON.stringify({ tot: r.tot, tard: r.tard }));
  verifier("…et rejoint la plaque de la première : toujours UNE plaque (12 cases)", r.plaques === 1 && r.glace === 12, JSON.stringify({ plaques: r.plaques, glace: r.glace }));
  verifier("la zone s'éteint : ses cases quittent la plaque, la première reste", r.apres.cases === 7 && r.apres.z7 === 0 && r.apres.A > 0.9 && r.apres.plaques === 1,
           JSON.stringify(r.apres));
  verifier("un élément qui quitte le plateau s'efface en fondu, puis sa plaque s'en va", r.fondu > 0 && r.fondu < 0.95 && r.partie.plaques === 0 && r.partie.couche,
           JSON.stringify({ fondu: r.fondu, partie: r.partie }));
  verifier("…et revient sur une plaque neuve", r.revient.plaques === 1 && r.revient.centre > 0.1, JSON.stringify(r.revient));
}

console.log("\n4. EN PLEIN COMBAT, PLATEAU RECONSTRUIT, RETENUE, SECOURS");
{
  const r = await p.evaluate(async ({ A }) => {
    const res = {};
    // Le plateau reconstruit (le calque est parti avec lui) : la plaque revient d'un coup, sans avancer.
    document.getElementById("zones-procedurales")?.remove();
    document.getElementById("svg-zones-persistantes")?.remove();
    window.appliquerZonesPersistantes();
    await window.__attendre(120);
    res.reconstruit = { plaques: ["glace", "feu", "poison", "electrique"].map(t => window.__plaques(t)).join(),
                        bord: +window.__sol("glace", A[6]).toFixed(2), soins: window.__nappes() };
    // La retenue : un tour pas encore rejoué ne montre pas sa zone.
    window.EVENEMENT_ATTENDU = true;
    window.ZONES_PERSISTANTES.z8 = { type: "poison", hexes: [{ q: -5, r: 4 }] };
    window.appliquerZonesPersistantes();
    await window.__attendre(100);
    res.retenu = window.__couche("poison").cases().length;
    window.EVENEMENT_ATTENDU = false;
    window.appliquerZonesPersistantes();
    await window.__attendre(100);
    res.libere = window.__couche("poison").cases().length;
    // La réinitialisation du combat : tout part.
    window.ZONES_PERSISTANTES = {};
    window.appliquerZonesPersistantes();
    await window.__attendre(900);
    res.vide = { plaques: document.querySelectorAll("#zones-procedurales .zone-proc").length, couches: Object.keys(window.__couches()).length, nappes: window.__nappes() };
    // Sans le moteur procédural (un script qui n'a pas chargé) : l'ancienne nappe revient.
    const moteur = window.creerCoucheProcedurale;
    window.creerCoucheProcedurale = undefined;
    window.ZONES_PERSISTANTES = { z1: { type: "feu", hexes: [{ q: 1, r: 0 }, { q: 2, r: 0 }] } };
    window.appliquerZonesPersistantes();
    res.secours = { nappes: window.__nappes(), plaques: document.querySelectorAll("#zones-procedurales .zone-proc").length };
    window.creerCoucheProcedurale = moteur;
    window.ZONES_PERSISTANTES = {};
    window.appliquerZonesPersistantes();
    return res;
  }, { A });
  verifier("un plateau reconstruit : les quatre plaques reviennent d'un coup (sans avancer), le soin aussi",
           r.reconstruit.plaques === "1,1,1,1" && r.reconstruit.bord > 0.15 && r.reconstruit.soins === 2, JSON.stringify(r.reconstruit));
  verifier("la retenue tient : un tour pas encore rejoué ne montre pas sa zone, puis elle vient", r.retenu === 3 && r.libere === 4,
           JSON.stringify({ retenu: r.retenu, libere: r.libere }));
  verifier("la réinitialisation du combat : plus aucune plaque ni nappe", r.vide.plaques === 0 && r.vide.couches === 0 && r.vide.nappes === 0, JSON.stringify(r.vide));
  verifier("sans le moteur procédural, le feu retrouve sa nappe SVG (une par case)", r.secours.nappes === 2 && r.secours.plaques === 0, JSON.stringify(r.secours));
}

await fin();
