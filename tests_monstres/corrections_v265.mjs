// v265 — L'AURA DU LEADER, LE NOM DES ÉTATS, LE NOM DANS L'ENCART, LES ZONES PHYSIQUES, LA DISTORSION
//
// Nico :
//  · « Refais l'anneau rouge autour des tokens des leaders : plus organique,
//    plus joli, un peu plus discret, qui ondule doucement autour. Quand je
//    zoome ou dézoome, ça déplace ce cercle : corrige ça. »
//  · « Les symboles des états à gauche du bouton fin de tour : en plus du
//    nombre de tours restants, indique aussi le nom de l'état quand on clique
//    dessus. »
//  · « Dans l'encart de la compétence qui va être jouée, déplace un peu vers la
//    droite le nom du personnage pour qu'il n'empiète pas sur les états. »
//  · « L'animation d'une attaque légère ou lourde en zone : enlève les zones
//    rouges qui explosent au sol, ne garde que le coup sur chaque ennemi. »
//  · « Refais l'animation de Distorsion mentale : des ondes psychiques qui
//    déforment l'image en dessous vers la cible, et à la réception des dégâts
//    la cible se déforme un peu sur elle-même avant de redevenir normale. »
//
// DANS LE NOYAU (Node) :
//   1. le pont : la zone d'une attaque légère ou lourde n'explose plus au sol
//      quand son geste a frappé ; les autres zones, si.
// SUR LA VRAIE PAGE (faux Firestore) :
//   2. l'aura du leader : un anneau SVG qui ondule, centré au pion à tous les
//      zooms, sans animation de transform ;
//   3. la bulle d'un état : son nom et ses tours ;
//   4. le nom dans l'encart : un peu plus à droite, jamais sous un état ;
//   5. la Distorsion mentale : trois ondes, le sol déformé sous les pions, la
//      cible qui se tord, tout rangé après ;
//   6. les versions.
// Le banc se charge sur l'ancien code (IVALIS_RACINE) : il y échoue, sans planter.
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const essai = (f, d = null) => { try { return f(); } catch (e) { return d; } };
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf-8');
const titre = (t) => { console.log("\n========================================================="); console.log("  " + t); console.log("========================================================="); };

const PC = await import(path.join(RACINE, 'pont_combat.js'));

titre("1. LA ZONE D'UNE ATTAQUE LÉGÈRE OU LOURDE N'EXPLOSE PLUS AU SOL");
{
  const combattant = (id, camp, q) => ({ id, nom: id, camp, estMonstre: camp === "Ennemi", estIllusion: false, joueur: "", race: "", couleur: "",
    personnalite: "brutal", palier: "Normal", pv: 50, pvMax: 50, bouclier: 0, bouclierMax: 0, fatigue: 50, fatigueMax: 100, q, r: 0, etats: [], aTerre: false,
    def: { esquive: 0, parade: 0, physique: 0, magique: 0, critique: 0 }, atouts: {}, equip: {}, mod: {}, stats: {} });
  const etat = { format: 1, version: 3, manche: 1, phase: "Resolution", graine: 1, file: [], ordre: ["H1", "M1", "M2"], zones: {},
                 combattants: { H1: combattant("H1", "Allié", 0), M1: combattant("M1", "Ennemi", 1), M2: combattant("M2", "Ennemi", 2) } };
  const ZONE = [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 1, r: 1 }];
  const vus = [];
  let gesteReussit = true;
  const pont = essai(() => PC.creerPont({
    ruee: async () => vus.push("ruee"), projectile: async () => vus.push("projectile"),
    attaque: async (d) => { vus.push("attaque:" + (d.frappe || d.sort || "?")); return gesteReussit; },
    zoneCarte: async () => vus.push("zone"), jauge: () => {}, message: () => {}, pause: async () => {}
  }), null);
  const jouer = async (e) => { vus.length = 0; if (pont) await pont.animer(e, etat).catch(() => {}); return vus.join(","); };
  const carte = (extra) => ({ type: "carte", acteur: "H1", carte: "C", cibles: ["M1", "M2"], touches: ["M1", "M2"], zone: ZONE, ...extra });
  const legere = await jouer(carte({ frappe: "legere" }));
  const lourde = await jouer(carte({ frappe: "lourde" }));
  verifier("attaque légère en zone : le coup sur chaque ennemi, pas d'explosion au sol", legere === "attaque:legere", legere);
  verifier("attaque lourde en zone : de même", lourde === "attaque:lourde", lourde);
  const sort = await jouer(carte({ projectile: "boule", element: "Feu" }));
  verifier("un sort de zone : ses cases explosent toujours", /zone$/.test(sort), sort);
  gesteReussit = false;
  const sansGeste = await jouer(carte({ frappe: "lourde" }));
  verifier("un geste qui n'a pas pu se jouer : la ruée, puis les cases (rien ne reste invisible)", sansGeste === "attaque:lourde,ruee,zone", sansGeste);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;

const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  const docs = () => (window.__docs = window.__docs || {});
  export const getDoc = async (ref) => { const d = docs()[ref.chemin]; return { exists: () => !!d, data: () => JSON.parse(JSON.stringify(d || {})) }; };
  export const getDocs = async (ref) => { const l = ((window.__collections || {})[ref && ref.col] || []).map(x => ({ id: x.id, data: () => x.data }));
    return { forEach: (f) => l.forEach(f), docs: l, empty: l.length === 0 }; };
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data, options });
    docs()[ref.chemin] = options && options.merge ? { ...(docs()[ref.chemin] || {}), ...data } : data; };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data });
    if (docs()[ref.chemin]) Object.assign(docs()[ref.chemin], JSON.parse(JSON.stringify(data))); };
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a}); export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
  export const writeBatch = () => { const ops = []; return { set(ref, d){ ops.push({ chemin: ref.chemin, data: d }); }, update(ref, d){ ops.push({ chemin: ref.chemin, data: d }); },
    delete(){}, commit: async () => { (window.__lots = window.__lots || []).push(...ops); } }; };
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
// La plaque de l'encart (injoignable d'ici) : un bouchon carré.
const PLAQUE = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect x="120" y="160" width="890" height="840" rx="40" fill="#1d1712"/></svg>`;
const PION = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="96" fill="#c44"/></svg>`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: /IMG_2122/.test(r.request().url()) ? PLAQUE : PION }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(1500);
await p.evaluate(() => {
  window.__ou = (f, d) => { try { return f(); } catch (e) { return d; } };
  window.__ouAsync = async (f, d) => { try { return await f(); } catch (e) { return d; } };
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById('fenetre-combat').style.display = 'block';
  window.initialiserPlateau();
  window.ID_PARTIE_COURANTE = "P1";
  window.PARTIE_DATA = { Tour_Combat: 1 };
  window.TOKENS_VTT_DATA = {};
  window.jouerSonClic = () => {};
  window.__docs = { "Systeme_Parties/P1": { Ordre_Initiative: ["H1", "H2"] } };
  window.__hex = (t) => t ? t.q + "," + t.r : null;
  window.__dist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((-a.q - a.r) - (-b.q - b.r)));
  window.__ecran = (q, r) => { const px = window.PLATEAU_VTT.hexToPixel(q, r);
    return { x: window.VTT_POS_X + px.x * window.VTT_SCALE, y: window.VTT_POS_Y + px.y * window.VTT_SCALE }; };
  // Les héros du groupe : XP 0 → niveau 1, 1200 → 3, 2500 → 5, 6400 → 9.
  window.__heros = (liste) => liste.map(([id, prenom, xp, extra]) => ({ idPersonnage: id, prenom, camp: "Allié", xp, PV_Max: 40, PV_Actuels: 40,
    Fatigue_Max: 100, fatigueActuelle: 100, Etats_Alteres: [], statut: "Vivant", ...(extra || {}) }));
});

await p.evaluate(async () => {
  // Une carte quadrillée, pour que le sol déformé se voie (et se copie).
  const motif = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200"><defs>
    <pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="#6b5a3e"/>
    <rect x="1" y="1" width="18" height="18" fill="#8a7650"/><path d="M0 20 H40 M20 0 V40" stroke="#4a3d28" stroke-width="2"/></pattern></defs>
    <rect width="1600" height="1200" fill="url(#p)"/></svg>`;
  const img = document.getElementById("image-map-vtt");
  await new Promise(r => { img.onload = r; img.onerror = r; img.src = "data:image/svg+xml," + encodeURIComponent(motif); });
  img.style.display = "block";
  window.PLATEAU_VTT.resize(1600, 1200);
  const f = (id, extra) => ({ idPersonnage: id, prenom: id, camp: "Ennemi", estMonstre: true, Palier: "Normal", PV_Max: 60, PV_Actuels: 60,
    Fatigue_Max: 100, fatigueActuelle: 100, Etats_Alteres: [], statut: "Vivant", ...extra });
  window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Aldric", camp: "Allié", PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, fatigueActuelle: 100,
                            Etats_Alteres: [], statut: "Vivant", urlToken: "https://res.cloudinary.com/x/pion.png" },
                          f("M1", { leader: true }), f("M2")];
  window.TOKENS_VTT_DATA = { H1: { q: 1, r: 1, taille: 48, url: "https://res.cloudinary.com/x/pion.png" }, M1: { q: 5, r: 0, taille: 48 }, M2: { q: 7, r: 0, taille: 48 } };
  window.VTT_SCALE = 1.4; window.VTT_POS_X = 80; window.VTT_POS_Y = 120;
  window.appliquerTransformPlateau();
  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
  await new Promise(r => setTimeout(r, 300));
});

titre("2. L'AURA DU LEADER : ORGANIQUE, QUI ONDULE, ET QUI NE BOUGE PLUS AU ZOOM");
{
  const r = await p.evaluate(async () => {
    const res = {};
    const aura = () => { const t = document.getElementById("token-M1"); return t && t.querySelector(".aura-leader"); };
    const a = aura();
    res.existe = !!a;
    res.autre = !!(document.getElementById("token-M2") || document.createElement("i")).querySelector(".aura-leader");
    res.svg = !!(a && a.querySelector("svg"));
    // v271 : le feu rouge de Nico remplace l'anneau qui ondulait — ses nappes
    // tournent à travers un champ de turbulence (le mouvement), et l'anneau
    // collé au pion reste rouge.
    res.formes = a && a.querySelector("svg feTurbulence") ? a.querySelectorAll("svg animateTransform[type='rotate']").length : 0;
    res.couleur = a ? [...a.querySelectorAll("circle")].map(x => x.getAttribute("stroke")).filter(Boolean)[0] : null;
    res.animationsCss = a ? [a, ...a.querySelectorAll("*")].filter(x => x instanceof HTMLElement).some(x => getComputedStyle(x).animationName !== "none") : true;
    res.transform = a ? getComputedStyle(a).transform : "";
    const mesures = [];
    for (const s of [1, 3, 0.6, 1.4]) {
      window.VTT_SCALE = s; window.appliquerTransformPlateau();
      await new Promise(r2 => requestAnimationFrame(() => requestAnimationFrame(r2)));
      const t = document.getElementById("token-M1"), x = aura();
      const rt = t.getBoundingClientRect(), ra = x.getBoundingClientRect();
      mesures.push({ s, dx: Math.round((ra.left + ra.width / 2) - (rt.left + rt.width / 2)), dy: Math.round((ra.top + ra.height / 2) - (rt.top + rt.height / 2)),
                     ratio: +(ra.width / rt.width).toFixed(2) });
    }
    res.mesures = mesures;
    // Redessiné (une nouvelle du combat), il reprend où le temps en est.
    const svg = aura() && aura().querySelector("svg");
    res.temps = svg && typeof svg.getCurrentTime === "function" ? svg.getCurrentTime() : -1;
    return res;
  });
  verifier("le pion du leader porte son aura, et lui seul", r.existe && !r.autre);
  verifier("un anneau dessiné (SVG), rouge", r.svg && /^#ff/i.test(r.couleur || ""), r.couleur);
  verifier("IL BOUGE : au moins trois nappes tournent à travers la turbulence (v271)", r.formes >= 3, `${r.formes}`);
  verifier("aucune animation CSS, aucun transform : rien qui se fige à l'ancienne taille", !r.animationsCss && (r.transform === "none" || r.transform === ""), `${r.animationsCss} ${r.transform}`);
  verifier("CENTRÉ SUR LE PION À TOUS LES ZOOMS (×1, ×3, ×0,6, ×1,4), à la même taille relative",
           r.mesures.length === 4 && r.mesures.every(m => Math.abs(m.dx) <= 1 && Math.abs(m.dy) <= 1 && m.ratio === r.mesures[0].ratio), JSON.stringify(r.mesures));
  verifier("redessiné, il reprend là où le temps en est (pas de saut au début)", r.temps > 1, `${r.temps}`);
}

titre("3. LA BULLE D'UN ÉTAT : SON NOM ET SES TOURS");
{
  const r = await p.evaluate(async () => {
    window.herosDuPoste = () => window.PERSOS_PARTIE[0];
    // (Engagé n'a plus de symbole depuis la v267 : un autre état, le Glacé.)
    window.PERSOS_PARTIE[0].Etats_Alteres = [{ nom: "Brûlé", duree: 2 }, { nom: "Glacé", duree: 1 }];
    document.getElementById("combat-hud-bas-droite").style.display = "block";
    window.__ou(() => window.actualiserPisteEtats(), null);
    await new Promise(r2 => setTimeout(r2, 100));
    const tuile = document.querySelector('.etat-piste[data-nom="Brûlé"]');
    if (!tuile) return { tuile: false };
    tuile.click();
    await new Promise(r2 => setTimeout(r2, 300));
    const bulle = tuile.querySelector(".etat-piste-duree");
    const autre = document.querySelector('.etat-piste[data-nom="Glacé"]');
    autre.click();
    await new Promise(r2 => setTimeout(r2, 300));
    const b2 = autre.querySelector(".etat-piste-duree");
    return { tuile: true, nom: (bulle.querySelector(".etat-piste-nom") || {}).textContent, tours: (bulle.querySelector(".etat-piste-tours") || {}).textContent,
             nom2: (b2.querySelector(".etat-piste-nom") || {}).textContent, tours2: (b2.querySelector(".etat-piste-tours") || {}).textContent,
             premiereEteinte: !bulle.classList.contains("visible") };
  });
  verifier("toucher un état : son nom, « Brûlé »", r.tuile && r.nom === "Brûlé", JSON.stringify(r));
  verifier("…et ses tours restants, dessous : « 2 Tours »", r.tours === "2 Tours", r.tours);
  verifier("un autre : « Glacé », « 1 Tour » — et la première bulle s'éteint", r.nom2 === "Glacé" && r.tours2 === "1 Tour" && r.premiereEteinte, JSON.stringify(r));
}

titre("4. LE NOM DANS L'ENCART : UN PEU PLUS À DROITE, JAMAIS SOUS UN ÉTAT");
{
  const r = await p.evaluate(async () => {
    window.herosDuPoste = () => null;
    const etats = ["Brûlé", "Glacé", "Électrifié", "Peur", "Étourdi", "Saignement"].map(n => ({ nom: n, duree: 2 }));
    window.PERSOS_PARTIE[1].Etats_Alteres = etats;
    window.CACHE_COMPETENCES_GLOBAL = { M1: { C1: { Nom: "Hurlement putride", Arme: "Magie", Fatigue: 40, Initiative: 50, Composants: { actions: [] },
      Effets_Compiles: [{ nom: "Distorsion mentale", desc: "9 dégat brut", isMod: false }] } } };
    window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"], File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "C1", initiative: 50 }] };
    window.EVENEMENT_ATTENDU = { acteur: "M1", idCarte: "C1", manche: 1, v: 1 };
    window.__ou(() => window.rafraichirVoileTour(), null);
    await new Promise(r2 => setTimeout(r2, 700));
    window.__ou(() => window.appliquerReglagesEncart(), null);
    window.__ou(() => window.rafraichirVoileTour(), null);
    await new Promise(r2 => setTimeout(r2, 200));
    const e = document.getElementById("voile-tour-encart").getBoundingClientRect();
    const n = document.getElementById("voile-tour-nom").getBoundingClientRect();
    const icones = [...document.getElementById("voile-tour-etats").children].map(x => x.getBoundingClientRect());
    const touche = icones.filter(i => n.left < i.right - 1 && n.right > i.left + 1 && n.top < i.bottom - 1 && n.bottom > i.top + 1).length;
    const boite = document.getElementById("voile-tour-etats").getBoundingClientRect();
    const premiere = Math.max(...icones.map(i => i.bottom));
    const res = { reglage: window.REGLAGES_HUD.encartNom.x, icones: icones.length, touche, nomX: +((n.left - e.left) / e.width * 100).toFixed(1),
                  rangees: new Set(icones.map(i => Math.round(i.top))).size,
                  basDesEtats: +((premiere - e.top) / e.height * 100).toFixed(1), hautReglé: window.REGLAGES_HUD.encartEtats.y,
                  tailleIcone: +((icones[0] || { height: 0 }).height / e.height * 100).toFixed(1) };
    window.EVENEMENT_ATTENDU = null;
    window.PARTIE_DATA = { Phase_Combat: "Preparation", Tour_Combat: 1, File_Attente_Combat: [] };
    window.__ou(() => window.rafraichirVoileTour(), null);
    return res;
  });
  verifier("sa place réglée : un peu plus à droite (2 % au lieu de −5 %)", r.reglage === 2 && r.nomX >= 1.5, `${r.reglage} → ${r.nomX} %`);
  verifier("six états, sur deux rangées : AUCUNE icône sous le nom", r.icones === 6 && r.rangees >= 2 && r.touche === 0, JSON.stringify(r));
  verifier("les rangées en plus MONTENT : la plus basse reste à sa place réglée", Math.abs(r.basDesEtats - (r.hautReglé + r.tailleIcone)) <= 1.5,
           `bas ${r.basDesEtats} % pour ${r.hautReglé} + ${r.tailleIcone}`);
}

titre("5. LA DISTORSION MENTALE : DES ONDES QUI DÉFORMENT, UNE CIBLE QUI SE TORD");
{
  const r = await p.evaluate(async () => {
    window.VTT_SCALE = 1.4; window.appliquerTransformPlateau();
    await new Promise(r2 => setTimeout(r2, 1500));
    const sons = []; const vrai = window.jouerSonCombat;
    window.jouerSonCombat = (id, f) => { sons.push(id); return vrai ? vrai(id, f) : null; };
    let maxArcs = 0, sol = null, torsion = false, filtre = false, tokenAnime = false;
    let fini = false;
    const sonder = () => {
      maxArcs = Math.max(maxArcs, document.querySelectorAll("#conteneur-tokens-vtt .anim-arc-mots").length);
      const s = document.querySelector("#conteneur-tokens-vtt .anim-sol-distorsion");
      if (s && !sol) sol = { canevas: !!s.querySelector("canvas"), z: Number(getComputedStyle(s).zIndex),
                             zPion: Number(getComputedStyle(document.getElementById("token-M1")).zIndex) };
      const img = document.querySelector("#token-M2 .token-img-main");
      if (img && /url\(.*anim-torsion/.test(img.style.filter || "")) filtre = true;
      const t = document.getElementById("token-M2");
      if (t && t.getAnimations().some(an => (an.effect && an.effect.getKeyframes ? an.effect.getKeyframes() : []).some(k => /skew/.test(k.transform || "")))) tokenAnime = true;
      if (!fini) requestAnimationFrame(sonder);
    };
    requestAnimationFrame(sonder);
    const fait = await window.__ouAsync(() => window.animerAttaqueCombat({ pion: "H1", cibles: ["M2"], projectile: "magie", sort: "mots", touches: ["M2"] }), false);
    await new Promise(r2 => setTimeout(r2, 100));
    fini = true;
    window.jouerSonCombat = vrai;
    const restes = document.querySelectorAll(".anim-sol-distorsion, .anim-arc-mots").length;
    const filtresRestants = document.querySelectorAll('filter[id^="anim-torsion-"]').length;
    const imgFin = (document.querySelector("#token-M2 .token-img-main") || {}).style;
    return { fait, maxArcs, sol, filtre, tokenAnime, sons, restes, filtresRestants, filtreFin: imgFin ? imgFin.filter : "?" };
  });
  verifier("le geste se joue (la voix : « mots »)", r.fait === true && r.sons.includes("mots"), JSON.stringify(r.sons));
  verifier("trois ondes, sur leurs crêtes", r.maxArcs === 3, `${r.maxArcs}`);
  verifier("LE SOL SE DÉFORME : une copie de la carte, redessinée sous les ondes", !!r.sol && r.sol.canevas, JSON.stringify(r.sol));
  verifier("…SOUS les pions (on voit toujours le lanceur et la cible)", !!r.sol && r.sol.z < r.sol.zPion, JSON.stringify(r.sol));
  verifier("À LA RÉCEPTION, LA CIBLE SE TORD : son pion s'écrase et se penche", r.tokenAnime);
  verifier("…et son image ondule (un filtre de turbulence, le temps du coup)", r.filtre);
  verifier("puis tout redevient normal : rien ne reste (ondes, sol, filtres)", r.restes === 0 && r.filtresRestants === 0 && !/anim-torsion/.test(r.filtreFin || ""),
           `${r.restes} / ${r.filtresRestants} / « ${r.filtreFin} »`);
}

titre("6. LES VERSIONS");
{
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS = (\d+)/) || [])[1]);
  const vJson = essai(() => JSON.parse(lire('version.json')).version, 0);
  verifier("version 265 ou plus (trace_combat.js, version.json)", vTrace >= 265 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const v = (f) => [...html.matchAll(new RegExp('["/ ]' + f.replace(".", "\\.") + "\\?v=(\\d+)", "g"))].map(x => Number(x[1]));
  const ok = (f, min) => v(f).length > 0 && v(f).every(x => x >= min) && new Set(v(f)).size === 1;
  verifier("combat.js v150+, animations_catalogue.js v21+, pont_combat.js v45+ (deux fois), hud_disposition.js v7+, style.css v96+",
           ok("combat.js", 150) && ok("animations_catalogue.js", 21) && ok("pont_combat.js", 45) && ok("hud_disposition.js", 7) && ok("style.css", 96),
           ["combat.js", "animations_catalogue.js", "pont_combat.js", "hud_disposition.js", "style.css"].map(f => v(f).join("/")).join(" · "));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
