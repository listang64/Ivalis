// v261 — LES CASES D'APPARITION DES ENNEMIS (le pinceau SPAWN)
//
// Nico : « dans les paramètres de combat, à côté des dessins de murs etc.,
// fais-moi un bouton pour générer des hexagones de spawn ennemis. »
//
// CE BANC SERT LA VRAIE PAGE (index.html, combat.js, Plateau.js, monstres.js),
// avec un faux Firestore qui garde ses écritures et ses écoutes :
//   1. le bouton SPAWN est dans la barre, à côté de GOMME / MURS / DIFFICILE ;
//   2. un seul pinceau en main : prendre SPAWN repose MURS (qui s'enregistre),
//      et l'inverse ;
//   3. on peint à la souris (un geste, plusieurs cases), on efface en
//      repartant d'une case peinte ;
//   4. reposé, il enregistre Tuiles_Spawn_Ennemis dans Combat_VTT ;
//   5. les cases se dessinent en rouge, pinceau en main SEULEMENT (ni au
//      repos, ni sous l'œil d'or des joueurs) ;
//   6. un autre poste les reçoit par l'écoute du terrain ; un pinceau en main
//      n'est pas écrasé ; fermer le combat sans valider remet la couche
//      enregistrée ;
//   7. les créatures (rencontre ET renforts) entrent sur une case peinte
//      libre ; pleines, elles débordent à côté ; un mur peint par-dessus en
//      retire une ; sans case peinte, autour du repère comme avant ;
//   8. un ennemi déployé par le bouton PIONS aussi ;
//   9. la demande des repères ne réclame plus que celui des héros quand des
//      cases sont peintes — et seul ce repère s'écrit ;
//  10. les versions.
// Le banc se charge sur l'ancien code (il y échoue, sans planter).
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) {
    res.writeHead(404); res.end('non trouvé'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(76)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf-8');

const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async (ref) => { const d = (window.__docs || {})[ref.chemin]; return { exists: () => !!d, data: () => d || {} }; };
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data, options }); };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data }); };
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = (ref, rappel) => {
    (window.__ECOUTES_FS = window.__ECOUTES_FS || []).push({ chemin: ref && ref.chemin, rappel });
    return () => {};
  };
  export const query = (...a) => ({a});
  export const where = (...a) => ({a}); export const orderBy = (...a) => ({a});
  export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(1500);

// =========================================================================
//  LE MONDE : un vrai plateau, une partie, aucun pion.
// =========================================================================
await p.evaluate(() => {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById('fenetre-combat').style.display = 'block';
  window.initialiserPlateau();
  window.ID_PARTIE_COURANTE = "P1";
  window.PARTIE_DATA = { Tour_Combat: 1 };
  window.TOKENS_VTT_DATA = {};
  window.jouerSonClic = () => {};
  window.__docs = {};
  // Le point d'écran d'une case (le geste du MJ y pose la souris).
  window.__ecran = (q, r) => {
    const px = window.PLATEAU_VTT.hexToPixel(q, r);
    return { x: window.VTT_POS_X + px.x * window.VTT_SCALE, y: window.VTT_POS_Y + px.y * window.VTT_SCALE };
  };
  // Un geste de souris réel sur le plateau : appui sur la première case,
  // glissé par les suivantes, relâché.
  window.__geste = (cases) => {
    const conteneur = document.getElementById("conteneur-plateau-vtt");
    const ev = (type, c, cible) => { const e = window.__ecran(c.q, c.r);
      cible.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: e.x, clientY: e.y })); };
    ev("mousedown", cases[0], conteneur);
    cases.slice(1).forEach(c => ev("mousemove", c, window));
    ev("mouseup", cases[cases.length - 1], window);
  };
  window.__spawns = () => Object.keys(window.PLATEAU_VTT.gridState)
    .filter(k => window.PLATEAU_VTT.gridState[k].isSpawnEnnemi).sort();
  window.__basculer = (nom) => { if (typeof window[nom] === "function") window[nom](); };
  // Les remplissages du canevas (drawHex ne remplit qu'une case colorée).
  window.__FILLS = [];
  const ctx = window.PLATEAU_VTT.ctx;
  const fillOrig = ctx.fill.bind(ctx);
  ctx.fill = function (...a) { window.__FILLS.push(ctx.fillStyle); return fillOrig(...a); };
  window.__textes = [];
  const texteOrig = ctx.fillText.bind(ctx);
  ctx.fillText = function (t, ...a) { window.__textes.push(t); return texteOrig(t, ...a); };
});
const ROUGE_SPAWN = 'rgba(196, 28, 28, 0.42)';
const dessiner = () => p.evaluate(() => {
  window.__FILLS.length = 0; window.__textes.length = 0;
  window.PLATEAU_VTT.renderMap();
  return { fills: window.__FILLS.slice(), textes: window.__textes.slice() };
});

console.log("\n=========================================================");
console.log("  1. LE BOUTON SPAWN, À CÔTÉ DES MURS");
console.log("=========================================================");
{
  const r = await p.evaluate(() => {
    const spawn = document.getElementById("btn-spawn-vtt"), murs = document.getElementById("btn-murs-vtt");
    const diff = document.getElementById("btn-difficile-vtt");
    const bloc = (x) => x && x.parentElement && x.parentElement.parentElement;
    return { existe: !!spawn, memeBarre: !!spawn && bloc(spawn) === bloc(murs) && bloc(spawn) === bloc(diff),
             dansMenu: !!spawn && !!spawn.closest("#menu-dev-combat"),
             etiquette: spawn ? spawn.parentElement.textContent.replace(/\s+/g, " ").trim() : "",
             apresDifficile: !!spawn && bloc(diff) && [...bloc(diff).children].indexOf(spawn.parentElement) > [...bloc(diff).children].indexOf(diff.parentElement),
             clic: spawn ? spawn.getAttribute("onclick") : "", losange: spawn ? getComputedStyle(spawn).transform : "" };
  });
  verifier("le bouton existe, dans la barre des paramètres de combat", r.existe && r.dansMenu);
  verifier("à côté de GOMME, MURS et DIFFICILE (même groupe, juste après DIFFICILE)", r.memeBarre && r.apresDifficile);
  verifier("étiqueté « SPAWN », avec sa tête de mort", /SPAWN/.test(r.etiquette) && /☠/.test(r.etiquette), r.etiquette);
  verifier("un losange, comme ses voisins", r.losange !== "none" && r.losange !== "", r.losange);
  verifier("il prend le pinceau des cases d'apparition", /toggleModeSpawnEnnemisHex/.test(r.clic || ""), r.clic);
}

console.log("\n=========================================================");
console.log("  2. UN SEUL PINCEAU EN MAIN");
console.log("=========================================================");
{
  const r = await p.evaluate(() => {
    window.__ecrits = [];
    window.__basculer("toggleModeMursHex");
    const avant = { murs: window.VTT_MODE_MURS };
    window.__basculer("toggleModeSpawnEnnemisHex");
    const apres = { murs: window.VTT_MODE_MURS, spawn: window.VTT_MODE_SPAWN,
                    actif: document.getElementById("btn-spawn-vtt")?.classList.contains("actif"),
                    mursActif: document.getElementById("btn-murs-vtt")?.classList.contains("actif"),
                    ecritMurs: (window.__ecrits || []).some(e => e.chemin === "Combat_VTT/P1" && "Tuiles_Murs" in e.data) };
    window.__basculer("toggleModeTerrainDifficileHex");
    const ensuite = { spawn: window.VTT_MODE_SPAWN, difficile: window.VTT_MODE_DIFFICILE,
                      ecritSpawn: (window.__ecrits || []).some(e => e.chemin === "Combat_VTT/P1" && "Tuiles_Spawn_Ennemis" in e.data) };
    window.__basculer("toggleModeTerrainDifficileHex");
    return { avant, apres, ensuite, fin: { murs: window.VTT_MODE_MURS, spawn: window.VTT_MODE_SPAWN, difficile: window.VTT_MODE_DIFFICILE } };
  });
  verifier("prendre SPAWN repose MURS", r.avant.murs === true && r.apres.murs === false && r.apres.spawn === true, JSON.stringify(r.apres));
  verifier("le losange SPAWN s'allume, celui des murs s'éteint", r.apres.actif === true && r.apres.mursActif === false);
  verifier("les murs reposés s'enregistrent (Tuiles_Murs)", r.apres.ecritMurs);
  verifier("prendre un autre pinceau repose SPAWN, qui s'enregistre", r.ensuite.spawn === false && r.ensuite.difficile === true && r.ensuite.ecritSpawn);
  verifier("tout reposé à la fin", !r.fin.murs && !r.fin.spawn && !r.fin.difficile, JSON.stringify(r.fin));
}

console.log("\n=========================================================");
console.log("  3. PEINDRE ET EFFACER À LA SOURIS");
console.log("=========================================================");
{
  const r = await p.evaluate(() => {
    window.__ecrits = [];
    window.__basculer("toggleModeSpawnEnnemisHex");
    window.__geste([{ q: 6, r: -2 }, { q: 7, r: -2 }, { q: 8, r: -2 }]);
    const peintes = window.__spawns();
    window.__geste([{ q: 7, r: -2 }]);                         // repartir d'une case peinte : on efface
    const effacee = window.__spawns();
    window.__geste([{ q: 7, r: -1 }, { q: 7, r: -2 }]);        // un geste neuf qui repasse : il peint
    const repeinte = window.__spawns();
    const murs = Object.keys(window.PLATEAU_VTT.gridState).filter(k => window.PLATEAU_VTT.gridState[k].isBlocked);
    return { peintes, effacee, repeinte, murs, pan: window.VTT_POS_X };
  });
  verifier("un geste peint les trois cases traversées", JSON.stringify(r.peintes) === '["6,-2","7,-2","8,-2"]', JSON.stringify(r.peintes));
  verifier("repartir d'une case peinte l'efface", JSON.stringify(r.effacee) === '["6,-2","8,-2"]', JSON.stringify(r.effacee));
  verifier("un geste neuf, parti d'une case vide, peint tout ce qu'il traverse",
           JSON.stringify(r.repeinte) === '["6,-2","7,-1","7,-2","8,-2"]', JSON.stringify(r.repeinte));
  verifier("le pinceau SPAWN ne pose aucun mur", r.murs.length === 0, JSON.stringify(r.murs));
}

console.log("\n=========================================================");
console.log("  4. REPOSÉ, IL ENREGISTRE LA COUCHE");
console.log("=========================================================");
{
  const r = await p.evaluate(async () => {
    window.__ecrits = [];
    window.__basculer("toggleModeSpawnEnnemisHex");
    await new Promise(r => setTimeout(r, 30));
    return { mode: window.VTT_MODE_SPAWN, ecrits: (window.__ecrits || []).filter(e => e.chemin === "Combat_VTT/P1") };
  });
  const e = r.ecrits.find(x => x.data && x.data.Tuiles_Spawn_Ennemis);
  verifier("le pinceau est reposé", r.mode === false);
  verifier("Combat_VTT reçoit Tuiles_Spawn_Ennemis, les quatre cases", !!e && JSON.stringify([...e.data.Tuiles_Spawn_Ennemis].sort()) === '["6,-2","7,-1","7,-2","8,-2"]',
           JSON.stringify(e && e.data));
  verifier("en fusion, sans toucher au reste du terrain", !!e && e.options && e.options.merge === true && Object.keys(e.data).length === 1);
}

console.log("\n=========================================================");
console.log("  5. ROUGES, PINCEAU EN MAIN SEULEMENT");
console.log("=========================================================");
{
  const repos = await dessiner();
  await p.evaluate(() => { window.VTT_REVELER_TERRAIN = true; });
  const oeil = await dessiner();
  await p.evaluate(() => { window.VTT_REVELER_TERRAIN = false; window.__basculer("toggleModeSpawnEnnemisHex"); });
  const enMain = await dessiner();
  const autre = await p.evaluate(() => { window.__basculer("toggleModeMursHex"); return true; }) && await dessiner();
  await p.evaluate(() => window.__basculer("toggleModeMursHex"));
  const nb = (l) => l.fills.filter(f => f === ROUGE_SPAWN).length;
  verifier("au repos : invisibles", nb(repos) === 0, `${nb(repos)}`);
  verifier("sous l'œil d'or des joueurs : invisibles aussi", nb(oeil) === 0, `${nb(oeil)}`);
  verifier("pinceau SPAWN en main : les quatre cases en rouge", nb(enMain) === 4, `${nb(enMain)}`);
  verifier("…chacune avec sa tête de mort ☠", enMain.textes.filter(t => t === "☠").length === 4, `${enMain.textes.length}`);
  verifier("avec le pinceau des murs : invisibles", nb(autre) === 0, `${nb(autre)}`);
}

console.log("\n=========================================================");
console.log("  6. LES AUTRES POSTES, LE PINCEAU EN MAIN, LA FERMETURE");
console.log("=========================================================");
{
  const r = await p.evaluate(() => {
    window.__ECOUTES_FS = [];
    window.ecouterTerrainVTT();
    const ecoute = (window.__ECOUTES_FS || []).find(e => e.chemin === "Combat_VTT/P1");
    if (!ecoute) return { ecoute: false };
    const livrer = (data) => ecoute.rappel({ exists: () => true, data: () => data });
    // Un autre appareil a peint deux cases.
    livrer({ Tuiles_Spawn_Ennemis: ["2,3", "3,3"] });
    const recues = window.__spawns();
    // Le MJ peint ici, pinceau en main : un instantané (un pion bouge) ne l'écrase pas.
    window.__basculer("toggleModeSpawnEnnemisHex");
    window.__geste([{ q: 4, r: 3 }]);
    livrer({ Tuiles_Spawn_Ennemis: ["2,3", "3,3"] });
    const gardees = window.__spawns();
    // Il ferme le combat sans reposer le pinceau : rien de validé n'existe.
    window.fermerCombat();
    const apresFermeture = window.__spawns();
    return { ecoute: true, recues, gardees, apresFermeture, mode: window.VTT_MODE_SPAWN,
             enregistre: (window.TERRAIN_VTT_ENREGISTRE || {}).spawns };
  });
  verifier("l'écoute du terrain applique les cases reçues", r.ecoute && JSON.stringify(r.recues) === '["2,3","3,3"]', JSON.stringify(r.recues));
  verifier("…et les garde de côté (TERRAIN_VTT_ENREGISTRE.spawns)", JSON.stringify(r.enregistre) === '["2,3","3,3"]', JSON.stringify(r.enregistre));
  verifier("pinceau en main, un instantané n'écrase pas ce qu'on peint", JSON.stringify(r.gardees) === '["2,3","3,3","4,3"]', JSON.stringify(r.gardees));
  verifier("fermer sans valider : la couche enregistrée revient, le pinceau reposé",
           JSON.stringify(r.apresFermeture) === '["2,3","3,3"]' && r.mode === false, JSON.stringify(r.apresFermeture));
  await p.evaluate(() => { document.getElementById('fenetre-combat').style.display = 'block'; });
}

console.log("\n=========================================================");
console.log("  7. LES CRÉATURES ENTRENT PAR LES CASES PEINTES");
console.log("=========================================================");
{
  const r = await p.evaluate(async () => {
    const res = {};
    const pose = (tokens) => typeof window.caseApparitionEnnemi === "function" ? window.caseApparitionEnnemi(tokens) : null;
    window.appliquerSpawnEnnemis && window.appliquerSpawnEnnemis(["10,0", "11,0", "12,0"]);
    window.PARTIE_DATA.Spawn_Ennemis = { q: -8, r: 4 };            // un repère ailleurs : les cases passent devant
    // 300 tirages sur un plateau vide : toujours une case peinte, les trois sortent.
    const vues = new Set();
    let horsCases = 0;
    for (let i = 0; i < 300; i++) { const h = pose({}); if (!h) { horsCases++; continue; } const k = h.q + "," + h.r; vues.add(k); if (!["10,0", "11,0", "12,0"].includes(k)) horsCases++; }
    res.vues = [...vues].sort(); res.horsCases = horsCases;
    // Deux prises : la troisième est la seule libre.
    res.derniere = []; for (let i = 0; i < 50; i++) { const h = pose({ A: { q: 10, r: 0 }, B: { q: 12, r: 0 } }); res.derniere.push(h && (h.q + "," + h.r)); }
    res.derniere = [...new Set(res.derniere)];
    // Toutes prises : à côté de l'une d'elles, jamais sur un pion.
    const pleines = { A: { q: 10, r: 0 }, B: { q: 11, r: 0 }, C: { q: 12, r: 0 } };
    const debord = []; for (let i = 0; i < 50; i++) debord.push(pose(pleines));
    const dist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((-a.q - a.r) - (-b.q - b.r)));
    res.debordOk = debord.every(h => h && !Object.values(pleines).some(t => t.q === h.q && t.r === h.r)
                                     && Object.values(pleines).some(t => dist(t, h) === 1));
    // Un mur peint par-dessus une case la retire.
    window.PLATEAU_VTT.setCaseState(11, 0, { isBlocked: true });
    const sansMur = new Set(); for (let i = 0; i < 100; i++) { const h = pose({}); sansMur.add(h && (h.q + "," + h.r)); }
    res.sansMur = [...sansMur].sort();
    window.PLATEAU_VTT.setCaseState(11, 0, { isBlocked: false });
    // Le cœur des cases sert de repère quand aucun n'est posé.
    delete window.PARTIE_DATA.Spawn_Ennemis;
    res.coeur = typeof window.pointApparition === "function" ? window.pointApparition("Ennemi") : null;
    // Plus de case peinte : autour du repère, comme avant.
    window.appliquerSpawnEnnemis && window.appliquerSpawnEnnemis([]);
    window.PARTIE_DATA.Spawn_Ennemis = { q: -8, r: 4 };
    const avant = []; for (let i = 0; i < 40; i++) avant.push(pose({}));
    res.commeAvant = avant.every(h => h && dist(h, { q: -8, r: 4 }) <= 2);
    res.sansRepere = typeof window.pointApparition === "function" ? (delete window.PARTIE_DATA.Spawn_Ennemis, window.pointApparition("Ennemi")) : "?";

    // LA VRAIE POSE D'UNE CRÉATURE (monstres.js) : la rencontre et les renforts.
    window.appliquerSpawnEnnemis && window.appliquerSpawnEnnemis(["10,0", "11,0", "12,0"]);
    window.gabaritMonstre = () => ({ Palier: "Normal" });
    window.creerMonstreDepuisGabarit = async () => {};
    const tokens = {};
    const poses = [];
    for (let i = 0; i < 4; i++) {
      const id = await window.poserMonstreSurTerrain({ archetype: "DPS CAC", palier: "Normal", nom: "Gob " + i }, tokens);
      poses.push(id && tokens[id] ? tokens[id].q + "," + tokens[id].r : null);
    }
    res.poses = poses;
    // Un renfort, par le vrai chemin (entrerRenfortMonstre).
    window.__docs["Systeme_Parties/P1"] = { Reserve_Monstres: [{ archetype: "DPS CAC", palier: "Normal", nom: "Renfort" }] };
    window.MONSTRES_PARTIE = [];
    window.PERSOS_JOUEURS_PARTIE = [{ idPersonnage: "H1", camp: "Allié" }, { idPersonnage: "H2", camp: "Allié" }];
    window.TOKENS_VTT_DATA = { X: { q: 10, r: 0 }, Y: { q: 11, r: 0 } };
    window.enregistrerPionsVTT = async () => {};
    window.sauvegarderReserveMonstres = async () => {};
    window.equiperCompetencesMonstre = async () => {};
    const idR = await window.entrerRenfortMonstre();
    res.renfort = idR && window.TOKENS_VTT_DATA[idR] ? window.TOKENS_VTT_DATA[idR].q + "," + window.TOKENS_VTT_DATA[idR].r : null;
    return res;
  });
  verifier("plateau vide : toujours sur une case peinte, même avec un repère ailleurs", r.horsCases === 0, `${r.horsCases} hors des cases`);
  verifier("au hasard : les trois cases sortent", JSON.stringify(r.vues) === '["10,0","11,0","12,0"]', JSON.stringify(r.vues));
  verifier("deux cases prises : la troisième, toujours", JSON.stringify(r.derniere) === '["11,0"]', JSON.stringify(r.derniere));
  verifier("toutes prises : à une case de l'une d'elles, jamais sur un pion", r.debordOk);
  verifier("un mur peint par-dessus en retire une", JSON.stringify(r.sansMur) === '["10,0","12,0"]', JSON.stringify(r.sansMur));
  // v263 : plus de repère tiré des cases — on le redemande à chaque réinitialisation.
  verifier("sans repère posé, pas de repère (le cœur des cases ne sert plus, v263)", r.coeur === null, JSON.stringify(r.coeur));
  verifier("sans case peinte : autour du repère, comme avant", r.commeAvant);
  verifier("ni case ni repère : pas de repère", r.sansRepere === null, JSON.stringify(r.sansRepere));
  verifier("la vraie pose (monstres.js) : trois créatures sur les trois cases",
           r.poses.slice(0, 3).every(x => ["10,0", "11,0", "12,0"].includes(x)) && new Set(r.poses.slice(0, 3)).size === 3, JSON.stringify(r.poses));
  verifier("la quatrième déborde, sans s'empiler", !!r.poses[3] && !r.poses.slice(0, 3).includes(r.poses[3]), r.poses[3]);
  verifier("un renfort (entrerRenfortMonstre) entre sur la case restée libre", r.renfort === "12,0", r.renfort);
}

console.log("\n=========================================================");
console.log("  8. LE BOUTON PIONS : UN ENNEMI SANS PION ENTRE AUTOUR DE SON REPÈRE (v263)");
console.log("=========================================================");
{
  const r = await p.evaluate(async () => {
    window.appliquerSpawnEnnemis && window.appliquerSpawnEnnemis(["-5,6"]);
    window.PARTIE_DATA.Spawn_Allies = { q: 2, r: 2 };
    window.PARTIE_DATA.Spawn_Ennemis = { q: 9, r: 9 };
    window.TOKENS_VTT_DATA = {};
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", camp: "Allié", statut: "Vivant", urlToken: "u1" },
                            { idPersonnage: "M9", camp: "Ennemi", statut: "Vivant", estMonstre: true, urlToken: "u2" }];
    window.enregistrerPionsVTT = async () => {};
    window.appliquerTokensVTT = () => {};
    await window.genererTokensCombat();
    const t = window.TOKENS_VTT_DATA;
    const dist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((-a.q - a.r) - (-b.q - b.r)));
    return { ennemi: t.M9 && (t.M9.q + "," + t.M9.r), ennemiPres: !!t.M9 && dist(t.M9, { q: 9, r: 9 }) <= 2,
             herosPres: !!t.H1 && dist(t.H1, { q: 2, r: 2 }) <= 2 };
  });
  // v263 : le déploiement est une première arrivée, autour du repère des
  // ennemis ; les cases peintes sont celles des renforts.
  verifier("l'ennemi autour de son repère, pas sur la case peinte (v263)", r.ennemiPres && r.ennemi !== "-5,6", r.ennemi);
  verifier("le héros, lui, autour de son repère", r.herosPres);
}

console.log("\n=========================================================");
console.log("  9. LA DEMANDE DES REPÈRES : LES DEUX, CASES PEINTES OU NON (v263)");
console.log("=========================================================");
{
  const r = await p.evaluate(async () => {
    const res = {};
    const calque = () => document.getElementById("placement-apparition").style.display === "flex";
    const titre = () => document.getElementById("placement-apparition-titre").innerText;
    const clic = async (q, r) => {
      const conteneur = document.getElementById("conteneur-plateau-vtt");
      const e = window.__ecran(q, r);
      ["mousedown", "mouseup", "click"].forEach(type =>
        conteneur.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: e.x, clientY: e.y })));
      await new Promise(r => setTimeout(r, 20));
    };
    // Des cases peintes, aucun repère : v263, on demande les deux quand même.
    window.appliquerSpawnEnnemis && window.appliquerSpawnEnnemis(["10,0", "11,0"]);
    delete window.PARTIE_DATA.Spawn_Allies; delete window.PARTIE_DATA.Spawn_Ennemis;
    window.APPARITION_REPORTEE = false; window.arreterPlacementApparition(); window.__majs = [];
    window.verifierPointsApparition();
    res.ouverte = calque(); res.titre = titre();
    await clic(1, 1);
    res.titreEnnemis = calque() ? titre() : "(fermée)";
    await clic(9, -3);
    res.fermee = !calque();
    res.majs = (window.__majs || []).filter(m => m.chemin === "Systeme_Parties/P1").map(m => m.data);
    res.memoire = { allies: window.PARTIE_DATA.Spawn_Allies, ennemis: window.PARTIE_DATA.Spawn_Ennemis };
    // Sans case peinte : les deux, comme avant.
    window.appliquerSpawnEnnemis && window.appliquerSpawnEnnemis([]);
    delete window.PARTIE_DATA.Spawn_Allies; delete window.PARTIE_DATA.Spawn_Ennemis;
    window.APPARITION_REPORTEE = false; window.arreterPlacementApparition(); window.__majs = [];
    window.verifierPointsApparition();
    res.t1 = titre();
    await clic(1, 1);
    res.t2 = calque() ? titre() : "(fermée)";
    await clic(9, -3);
    res.deux = (window.__majs || []).filter(m => m.chemin === "Systeme_Parties/P1").map(m => m.data);
    window.arreterPlacementApparition();
    return res;
  });
  verifier("cases peintes : la demande s'ouvre sur les héros", r.ouverte && /héros/i.test(r.titre), r.titre);
  // v263 (Nico : « quand on réinitialise un combat, on choisit encore les
  // spawn joueur et ennemi ») : les cases peintes ne dispensent plus du repère.
  verifier("…puis sur les ennemis, cases peintes ou non (v263)", /ennemis/i.test(r.titreEnnemis), r.titreEnnemis);
  verifier("deux clics la ferment", r.fermee);
  verifier("les deux repères s'écrivent", r.majs.length === 1 && r.majs[0].Spawn_Allies && r.majs[0].Spawn_Allies.q === 1
           && r.majs[0].Spawn_Ennemis && r.majs[0].Spawn_Ennemis.q === 9, JSON.stringify(r.majs));
  verifier("sans case peinte : héros, puis ennemis, puis les deux écrits",
           /héros/i.test(r.t1) && /ennemis/i.test(r.t2) && r.deux.length === 1
           && r.deux[0].Spawn_Allies && r.deux[0].Spawn_Allies.q === 1 && r.deux[0].Spawn_Ennemis && r.deux[0].Spawn_Ennemis.q === 9,
           `${r.t1} → ${r.t2} → ${JSON.stringify(r.deux)}`);
}

console.log("\n=========================================================");
console.log("  10. LES VERSIONS");
console.log("=========================================================");
{
  const html = lire('index.html');
  // Au moins 261 : les versions suivantes montent encore les numéros.
  const n = (re, txt) => Number((txt.match(re) || [])[1] || 0);
  const vTrace = n(/VERSION_IVALIS = (\d+);/, lire('trace_combat.js')), vJson = n(/"version": (\d+)/, lire('version.json'));
  verifier("version 261 ou plus (trace_combat.js, version.json)", vTrace >= 261 && vJson === vTrace, `${vTrace} / ${vJson}`);
  verifier("combat.js v146+, Plateau.js v4+, monstres.js v36+, style.css v93+",
           n(/combat\.js\?v=(\d+)"/, html) >= 146 && n(/Plateau\.js\?v=(\d+)"/, html) >= 4
           && n(/monstres\.js\?v=(\d+)"/, html) >= 36 && n(/style\.css\?v=(\d+)"/, html) >= 93);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\n✅ TOUT EST BON" : `\n❌ ${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
