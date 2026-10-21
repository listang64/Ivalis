// LES CHAUSSE-TRAPPES ET LES GRAVATS, EN JEU (v249).
//
// Nico, devant le Studio (v247, v248) : « Vas-y, intègre-les. »
//
//   1. LES PIÈGES : sur le plateau du combat, une zone qui ne fait que des
//      dégâts (« neutre ») est la plaque de chausse-trappes du Studio, plus
//      une nappe SVG ; elle gagne depuis son centre ; le soin garde sa nappe ;
//   2. LES GRAVATS : tous les tas du plateau forment UN éboulis procédural
//      (#calque-murs-terre), plus d'images ; un mur qui tombe : l'éboulis
//      gagne sa case depuis elle ; un mur levé dessus le couvre ; le terrain
//      reste difficile ;
//   3. RIEN POUR RIEN, LE PLATEAU RECONSTRUIT, LA RÉINITIALISATION, LE
//      SECOURS : rappeler ne redessine rien ; un plateau reconstruit repose
//      tout d'un coup ; « Réinitialiser » efface l'éboulis en fondu ; sans le
//      moteur, les tas d'avant.
import fs from 'fs';
import { ouvrirStudio } from './_studio_commun.mjs';

const { p, verifier, fin } = await ouvrirStudio();
const DOSSIER = '/tmp/claude-0/-home-user-Ivalis/3718c626-55b5-577c-9b4f-a49012fd3784/scratchpad/v249';
fs.mkdirSync(DOSSIER, { recursive: true });

const fleur = (c) => [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => ({ q: c.q + dq, r: c.r + dr }));

// Le Studio fermé : le plateau du combat lui-même.
await p.evaluate(() => {
  window.fermerStudioAnimation();
  const param = document.getElementById("conteneur-parametres");
  if (param) { param.style.display = "none"; param.classList.remove("ouvert"); }
  const fc = document.getElementById("fenetre-combat");
  if (fc) fc.style.display = "block";
  // Le même cadrage pour le plateau et le calque des murs (zoomé à part, comme au combat).
  ["transform-plateau", "transform-murs"].forEach(id => { const t = document.getElementById(id); if (t) t.style.transform = "translate(-437px, -160px) scale(0.9)"; });
  window.ZONES_PERSISTANTES = {}; window.MURS_TERRE = {}; window.GRAVATS_TERRE = {};
  window.__P = (c) => window.PLATEAU_VTT.hexToPixel(c.q, c.r);
  // (Sur l'ancien code, pas de plaque : le banc compte ce qui manque au lieu de planter.)
  window.__pieges = () => (typeof window.couchesZonesDuCombat === "function" ? window.couchesZonesDuCombat().neutre : null) || { cases: () => [], couvertureEn: () => 0 };
  window.__eboulis = () => (typeof window.gravatsDuCombat === "function" && window.gravatsDuCombat()) || { cases: () => [], couvertureEn: () => 0 };
  window.__casesEboulis = () => (typeof window.casesGravatsDuCombat === "function" ? window.casesGravatsDuCombat() : []);
  window.__px = (sel, c, dx = 0, dy = 0) => {
    const s = document.querySelector(sel);
    if (!s) return [0, 0, 0, 0];
    const racine = s.parentElement, P = window.__P(c);
    const i = Math.floor((P.x + dx - parseFloat(racine.style.left)) / parseFloat(racine.style.width) * s.width);
    const j = Math.floor((P.y + dy - parseFloat(racine.style.top)) / parseFloat(racine.style.height) * s.height);
    if (i < 0 || j < 0 || i >= s.width || j >= s.height) return [0, 0, 0, 0];
    return [...s.getContext("2d").getImageData(i, j, 1, 1).data];
  };
  // La part de fer (pixels gris opaques) d'une case, dans le sol d'une plaque.
  window.__fer = (sel, c) => {
    const R = window.PLATEAU_VTT.hexSize; let n = 0, k = 0;
    for (let j = 0; j < 300; j++) {
      const a = j * 2.39996, d = R * 0.8 * Math.sqrt((j + 0.5) / 300);
      const v = window.__px(sel, c, Math.cos(a) * d, Math.sin(a) * d); n++;
      if (v[3] > 200 && Math.max(v[0], v[1], v[2]) - Math.min(v[0], v[1], v[2]) < 40) k++;
    }
    return k / n;
  };
  window.__nappes = () => {
    const svg = document.getElementById("svg-zones-persistantes");
    return svg ? [...svg.querySelectorAll("g[clip-path]")].filter(g => g.getAttribute("clip-path") === "url(#zp-clip-hex)").length : 0;
  };
  window.__attendre = (ms) => new Promise(r => setTimeout(r, ms));
});

const A = fleur({ q: 3, r: -2 });
const SOL_PIEGES = "#zones-procedurales .piege-couche canvas.piege-sol";
const SOL_GRAVATS = "#calque-murs-terre .gravats-couche canvas.gravats-sol";

console.log("\n1. LES PIÈGES : LA PLAQUE DE CHAUSSE-TRAPPES DU STUDIO");
{
  const r = await p.evaluate(async ({ A, SOL }) => {
    window.ZONES_PERSISTANTES = { z1: { type: "neutre", hexes: A }, z2: { type: "soin", hexes: [{ q: -4, r: -1 }] } };
    window.appliquerZonesPersistantes();
    await window.__attendre(1800);
    const c = window.__pieges();
    return {
      plaques: document.querySelectorAll("#zones-procedurales .piege-couche").length, nappes: window.__nappes(),
      traits: document.querySelectorAll("#zones-procedurales polygon, #zones-procedurales path, #zones-procedurales line").length,
      centres: A.map(x => +c.couvertureEn(window.__P(x).x, window.__P(x).y).toFixed(2)),
      fer: A.map(x => +window.__fer(SOL, x).toFixed(3)),
      reflets: document.querySelectorAll("#zones-procedurales .piege-reflet").length
    };
  }, { A, SOL: SOL_PIEGES });
  verifier("une zone de dégâts simples en jeu : UNE plaque de pièges ; seul le soin garde une nappe SVG", r.plaques === 1 && r.nappes === 1,
           JSON.stringify({ plaques: r.plaques, nappes: r.nappes }));
  verifier("…sans contour, qui couvre ses 7 cases", r.traits === 0 && r.centres.every(x => x > 0.9), JSON.stringify(r.centres));
  verifier("…semée de chausse-trappes dans chaque case, avec leurs reflets", r.fer.every(x => x > 0.02) && r.reflets >= 5, JSON.stringify({ fer: r.fer, reflets: r.reflets }));
  const g = await p.evaluate(async ({ SOL }) => {
    // Une deuxième zone de pièges, en ligne : elle gagne depuis sa case du milieu.
    const B = [{ q: 6, r: -3 }, { q: 7, r: -3 }, { q: 8, r: -3 }];
    window.ZONES_PERSISTANTES.z3 = { type: "neutre", hexes: B };
    const vus = {}; let fini = false; const t0 = performance.now();
    const sonde = () => {
      B.forEach((x, i) => { if (vus[i] === undefined && window.__px(SOL, x)[3] > 10) vus[i] = Math.round(performance.now() - t0); });
      if (!fini) requestAnimationFrame(sonde);
    };
    requestAnimationFrame(sonde);
    window.appliquerZonesPersistantes();
    await window.__attendre(1800);
    fini = true;
    return { vus, cases: window.__pieges().cases().length, plaques: document.querySelectorAll("#zones-procedurales .piege-couche").length };
  }, { SOL: SOL_PIEGES });
  verifier("une nouvelle zone de pièges gagne depuis son centre et rejoint la plaque", g.vus[1] !== undefined && g.vus[0] !== undefined && g.vus[2] !== undefined
           && g.vus[1] < Math.min(g.vus[0], g.vus[2]) && g.cases === 10 && g.plaques === 1, JSON.stringify(g));
  await p.screenshot({ path: `${DOSSIER}/1_pieges_en_jeu.png` });
}

console.log("\n2. LES GRAVATS : UN ÉBOULIS, PLUS DE TAS D'IMAGES");
{
  const r = await p.evaluate(async ({ SOL }) => {
    window.ZONES_PERSISTANTES = {};
    window.appliquerZonesPersistantes();
    window.MURS_TERRE = { M1: { id: "M1", q: 1, r: 1, pv: 10, pvMax: 10, idLanceur: "H1" }, M2: { id: "M2", q: 2, r: 1, pv: 10, pvMax: 10, idLanceur: "H1" },
                          M3: { id: "M3", q: 3, r: 1, pv: 10, pvMax: 10, idLanceur: "H1" } };
    // Des gravats : deux cases libres, une sous un mur (elle ne compte pas).
    window.GRAVATS_TERRE = { "0_2": true, "1_2": true, "1_1": true };
    window.appliquerMursTerre();
    await window.__attendre(1500);
    const calque = document.getElementById("calque-murs-terre"), e = window.__eboulis();
    const res = {
      plaques: calque.querySelectorAll(".gravats-couche").length, imgs: calque.querySelectorAll("img.gravats-terre").length,
      cases: window.__casesEboulis(), dans: !!calque.querySelector("#gravats-proceduraux .gravats-couche"),
      centres: [{ q: 0, r: 2 }, { q: 1, r: 2 }].map(c => +e.couvertureEn(window.__P(c).x, window.__P(c).y).toFixed(2)),
      sousLeMur: +e.couvertureEn(window.__P({ q: 1, r: 1 }).x, window.__P({ q: 1, r: 1 }).y).toFixed(2),
      difficile: !!window.etatCaseCombat(0, 2, "X").isDifficult, pierres: +window.__fer(SOL, { q: 0, r: 2 }).toFixed(3)
    };
    // Le mur du milieu tombe : ses gravats gagnent la case, depuis elle.
    delete window.MURS_TERRE.M2;
    window.GRAVATS_TERRE["2_1"] = true;
    window.appliquerMursTerre();
    await window.__attendre(120);
    const tot = window.__px(SOL, { q: 2, r: 1 }, window.PLATEAU_VTT.hexSize * 0.75, 0)[3];
    await window.__attendre(1500);
    res.chute = { tot, tard: window.__px(SOL, { q: 2, r: 1 }, window.PLATEAU_VTT.hexSize * 0.75, 0)[3],
                  centre: +window.__eboulis().couvertureEn(window.__P({ q: 2, r: 1 }).x, window.__P({ q: 2, r: 1 }).y).toFixed(2),
                  cases: window.__casesEboulis(), plaques: calque.querySelectorAll(".gravats-couche").length };
    // Un mur levé sur des gravats les couvre.
    window.MURS_TERRE.M4 = { id: "M4", q: 0, r: 2, pv: 10, pvMax: 10, idLanceur: "H1" };
    window.appliquerMursTerre();
    await window.__attendre(150);
    res.couvert = { cases: window.__casesEboulis(), la: +window.__eboulis().couvertureEn(window.__P({ q: 0, r: 2 }).x, window.__P({ q: 0, r: 2 }).y).toFixed(2) };
    return res;
  }, { SOL: SOL_GRAVATS });
  verifier("les tas du plateau : UN éboulis dans le calque des gravats, plus aucune image", r.plaques === 1 && r.imgs === 0 && r.dans, JSON.stringify({ plaques: r.plaques, imgs: r.imgs }));
  verifier("…sur les deux cases libres, pas sous le mur", JSON.stringify(r.cases) === '["0_2","1_2"]' && r.centres.every(x => x > 0.9) && r.sousLeMur < 0.5,
           JSON.stringify({ cases: r.cases, centres: r.centres, sousLeMur: r.sousLeMur }));
  verifier("…avec ses pierres ; le terrain y reste difficile", r.pierres > 0.02 && r.difficile, JSON.stringify({ pierres: r.pierres, difficile: r.difficile }));
  verifier("un mur tombe : l'éboulis gagne sa case depuis elle (le bord vient après), et rejoint le reste",
           r.chute.tot < 100 && r.chute.tard > 100 && r.chute.centre > 0.9 && r.chute.cases.includes("2_1") && r.chute.plaques === 1, JSON.stringify(r.chute));
  verifier("un mur levé sur des gravats les couvre : l'éboulis s'y retire", !r.couvert.cases.includes("0_2") && r.couvert.la < 0.5, JSON.stringify(r.couvert));
  await p.screenshot({ path: `${DOSSIER}/2_eboulis_en_jeu.png` });
}

console.log("\n3. RIEN POUR RIEN ; PLATEAU RECONSTRUIT ; RÉINITIALISATION ; SECOURS");
{
  const r = await p.evaluate(async () => {
    const calque = () => document.getElementById("calque-murs-terre");
    const avant = [...calque().querySelectorAll("canvas")];
    for (let i = 0; i < 5; i++) window.appliquerMursTerre();
    await window.__attendre(60);
    const res = { memes: avant.length > 0 && avant.every(c => c.isConnected) && [...calque().querySelectorAll("canvas")].length === avant.length };
    // Le plateau reconstruit : le calque part avec lui ; l'éboulis revient d'un coup.
    calque().remove();
    window.appliquerMursTerre();
    await window.__attendre(80);
    res.reconstruit = { cases: window.__casesEboulis(), bord: window.__px("#calque-murs-terre .gravats-couche canvas.gravats-sol", { q: 1, r: 2 }, window.PLATEAU_VTT.hexSize * 0.7, 0)[3] };
    // La réinitialisation du combat : plus de murs ni de gravats ; l'éboulis s'efface en fondu.
    window.ZONES_PERSISTANTES = { z1: { type: "neutre", hexes: [{ q: 5, r: 2 }] } };
    window.appliquerZonesPersistantes();
    window.effacerMursTerre();
    window.ZONES_PERSISTANTES = {};
    window.appliquerZonesPersistantes();
    await window.__attendre(200);
    const el = calque().querySelector(".gravats-couche");
    res.fondu = el ? +getComputedStyle(el).opacity : -1;
    await window.__attendre(800);
    res.vide = { gravats: calque().querySelectorAll(".gravats-couche, img").length, pieges: document.querySelectorAll("#zones-procedurales .zone-proc").length, cases: window.__casesEboulis().length };
    // Sans le moteur : les tas d'avant.
    const moteur = window.creerCoucheGravats;
    window.creerCoucheGravats = undefined;
    window.GRAVATS_TERRE = { "4_2": true };
    window.appliquerMursTerre();
    res.secours = calque().querySelectorAll("img.gravats-terre").length;
    window.creerCoucheGravats = moteur;
    window.GRAVATS_TERRE = {};
    window.appliquerMursTerre();
    return res;
  });
  verifier("rappeler le dessin des murs sans rien changer ne redessine pas l'éboulis", r.memes);
  // (Deux cases : la troisième est sous le mur levé juste avant.)
  verifier("un plateau reconstruit : l'éboulis revient d'un coup (sans avancer)", r.reconstruit.cases.join() === "1_2,2_1" && r.reconstruit.bord > 60, JSON.stringify(r.reconstruit));
  verifier("la réinitialisation : l'éboulis s'efface en fondu, puis plus rien (ni pièges)", r.fondu > 0 && r.fondu < 0.95 && r.vide.gravats === 0 && r.vide.pieges === 0 && r.vide.cases === 0,
           JSON.stringify({ fondu: r.fondu, vide: r.vide }));
  verifier("sans le moteur procédural, les tas d'avant reviennent", r.secours === 1, String(r.secours));
}

console.log("\n4. POUR LES YEUX : LES PIÈGES, L'ÉBOULIS ET LES MURS ENSEMBLE");
{
  await p.evaluate(async (A) => {
    window.ZONES_PERSISTANTES = { z1: { type: "neutre", hexes: A }, z2: { type: "feu", hexes: [{ q: -2, r: 1 }, { q: -3, r: 2 }, { q: -2, r: 2 }] } };
    window.appliquerZonesPersistantes();
    window.MURS_TERRE = { M1: { id: "M1", q: 1, r: 1, pv: 10, pvMax: 10, idLanceur: "H1" }, M3: { id: "M3", q: 3, r: 1, pv: 10, pvMax: 10, idLanceur: "H1" } };
    window.GRAVATS_TERRE = { "2_1": true, "1_2": true, "0_2": true };
    window.appliquerMursTerre();
    await window.__attendre(2000);
  }, A);
  await p.screenshot({ path: `${DOSSIER}/3_ensemble.png` });
}

await fin();
