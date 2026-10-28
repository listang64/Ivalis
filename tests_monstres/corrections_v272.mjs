// v272 — LES CARTES RÉGIONALES.
//
// Nico : un clic sur une région zoome dessus, des nuages de plus en plus
// épais, la caméra les traverse (une boucle), la carte régionale arrive un peu
// trop grande et revient à sa taille ; le retour fait le chemin inverse. La
// carte régionale est calée sur la hauteur de l'écran, glisse en largeur, se
// zoome (molette, doigts) sans descendre sous la hauteur de l'écran. Le menu se
// range ; un bouton beige à flèche, à gauche de celui du menu, ramène au monde.
// En DEV : un pinceau peint des zones rouges provisoires, une gomme les
// efface, « Valider » les change en nuages procéduraux beige foncé qui
// bougent ; le titre doré se déplace et se redimensionne, enregistré en
// sortant du mode. Une fiche par carte en base (Cartes_Regionales/{numéro}).
//
// Sur la VRAIE page (index.html, cartes_regionales.js, regions_carte.js,
// app.js, style.css), Firestore remplacé par une mémoire, Cloudinary par des
// images générées (une carte du monde 3840 × 2160, une région 2400 × 1500).
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(76)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const titre = (t) => console.log("\n" + t);
// Une section qui lève une exception (l'ancien code n'a pas ces fonctions)
// compte comme un échec, et le banc continue.
const section = async (corps) => { try { await corps(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 120)); } };
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf-8');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' }); res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({}); export const getApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, ...c) => ({ col: c.join("/") });
  const docs = () => (window.__docs = window.__docs || {});
  export const getDoc = async (ref) => { const d = docs()[ref.chemin]; return { exists: () => !!d, data: () => JSON.parse(JSON.stringify(d || {})) }; };
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data: JSON.parse(JSON.stringify(data)), options }); };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data }); };
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a}); export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
  export const writeBatch = () => ({ set(){}, update(){}, delete(){}, commit: async () => {} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
// Une carte du monde et des cartes régionales de démonstration.
const MONDE = `<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2160"><defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f7a9a"/><stop offset="1" stop-color="#2d4a63"/></linearGradient></defs><rect width="3840" height="2160" fill="url(#m)"/><path d="M600 500 C1200 300 2200 400 3000 800 C3400 1300 2800 1900 1900 1800 C1000 1750 300 1300 600 500Z" fill="#b9a46a"/><path d="M900 700 C1300 600 1500 800 1400 1000 C1200 1150 900 1050 900 700Z" fill="#3f6b34"/><text x="1150" y="880" font-size="60" fill="#fff" font-family="serif">Forêt</text></svg>`;
const REGION = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1500"><defs><radialGradient id="r" cx="0.5" cy="0.5" r="0.7"><stop offset="0" stop-color="#6f9a4f"/><stop offset="1" stop-color="#2f4d26"/></radialGradient></defs><rect width="2400" height="1500" fill="url(#r)"/>${Array.from({length:60},(_,i)=>`<circle cx="${(i*397)%2400}" cy="${(i*263)%1500}" r="${30+(i*17)%60}" fill="#244a1c" opacity="0.8"/>`).join("")}<path d="M0 1100 C600 1000 1200 1250 2400 1050" stroke="#3b6fa0" stroke-width="40" fill="none"/><rect x="1500" y="420" width="120" height="90" fill="#8a5a33"/></svg>`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => {
  const u = r.request().url();
  const corps = /map_wx8s89/.test(u) ? MONDE : /IMG_1[89]|IMG_2189/.test(u) ? REGION : `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>`;
  r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'}, body: corps });
});
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);
await p.evaluate(() => {
  window.jouerSonClic = () => {}; window.confirm = () => true;
  localStorage.removeItem("ivalis_DEV_MODE");
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => e.style.display = e.id === "ecran-jeu" ? "block" : "none");
  window.recadrerCarte();
  window.appliquerRegionsDeLaBase({ Prochain_Numero: 14, Regions: {
    1: { Numero: 1, Points: [{ x: 850, y: 620 }, { x: 1450, y: 620 }, { x: 1450, y: 1080 }, { x: 850, y: 1080 }] },
    4: { Numero: 4, Points: [{ x: 2400, y: 900 }, { x: 2800, y: 900 }, { x: 2800, y: 1300 }, { x: 2400, y: 1300 }] } } });
  if (typeof window.appliquerCartesRegionalesDeLaBase === "function") window.appliquerCartesRegionalesDeLaBase([]);
});
await p.waitForTimeout(300);
const ecranDe = (numero) => p.evaluate((n) => { const c = window.centreRegion(window.REGIONS_CARTE[n].points); const r = document.getElementById("carte-fond-jeu").getBoundingClientRect();
  const z = window.cadrageCarteMonde().zoom; return { x: r.left + c.x * z, y: r.top + c.y * z }; }, numero);

// =========================================================================
titre("1. LES TREIZE CARTES ET LEURS BOÎTES");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => ({
    numeros: Object.keys(window.CARTES_REGIONALES).map(Number).sort((a, b) => a - b),
    noms: [1, 7, 13].map(n => window.CARTES_REGIONALES[n].nom),
    sansImage: Object.values(window.CARTES_REGIONALES).filter(c => !c.image).map(c => c.numero),
    actions: Object.keys(window.ACTIONS_REGIONS).filter(n => typeof window.ACTIONS_REGIONS[n] === "function").map(Number).sort((a, b) => a - b),
    active: !!document.querySelector('#calque-regions .region.active[data-numero="1"]'),
    url: window.urlImageCarteRegionale(window.CARTES_REGIONALES[1].image)
  }));
  verifier("treize cartes, numérotées comme les boîtes (1 à 13)", JSON.stringify(r.numeros) === JSON.stringify([1,2,3,4,5,6,7,8,9,10,11,12,13]));
  verifier("leurs noms (la forêt des murmures, l'île aux marchés, les îlots maudits)",
           r.noms[0] === "La forêt des murmures" && r.noms[1] === "L'île aux marchés" && r.noms[2] === "Les îlots maudits", r.noms.join(" / "));
  verifier("Volcanisse (4) et Arcaï (9) attendent leur image", JSON.stringify(r.sansImage) === "[4,9]");
  verifier("chaque boîte 1 à 13 a son action ; en jeu, elle prend le clic", r.actions.length === 13 && r.active);
  verifier("l'image est servie compressée et limitée (Cloudinary)", /\/upload\/w_4096,c_limit,q_auto,f_auto\//.test(r.url), r.url);
});

// =========================================================================
titre("2. VOLCANISSE : « CARTE À VENIR », SANS TRANSITION");
// =========================================================================
await section(async () => {
  const c = await ecranDe(4);
  await p.mouse.click(c.x, c.y);
  await p.waitForTimeout(250);
  const r = await p.evaluate(() => ({ ouverte: window.carteRegionaleOuverte(), annonce: (document.getElementById("annonce-carte-region") || {}).textContent,
    visible: !!document.querySelector(".annonce-carte-region.visible"), nuages: !!document.getElementById("traversee-nuages") }));
  verifier("un clic annonce « Volcanisse — carte à venir »", r.annonce === "Volcanisse — carte à venir" && r.visible, r.annonce);
  verifier("…et rien ne s'ouvre (ni carte, ni nuages)", r.ouverte === null && !r.nuages);
  await p.waitForTimeout(2800);
});

// =========================================================================
titre("3. L'ALLER : PLONGÉE, NUAGES, ARRIVÉE");
// =========================================================================
const cadrageMondeAvant = await p.evaluate(() => window.cadrageCarteMonde());
await section(async () => {
  await p.evaluate(() => {
    // Une sonde, à chaque image : le zoom de la carte du monde, la couverture
    // des nuages au centre de l'écran, l'échelle de la vue régionale.
    window.__sonde = []; window.__sondeActive = true;
    const pas = () => {
      if (!window.__sondeActive) return;
      const monde = new DOMMatrix(getComputedStyle(document.getElementById("carte-fond-jeu")).transform).a;
      const toile = document.getElementById("traversee-nuages");
      let couverture = null;
      if (toile && toile.width) { const d = toile.getContext("2d").getImageData(toile.width >> 1, toile.height >> 1, 1, 1).data; couverture = d[3]; }
      const vue = document.getElementById("vue-carte-region");
      const echelle = vue && vue.style.display !== "none" ? new DOMMatrix(getComputedStyle(vue).transform).a : null;
      window.__sonde.push({ t: performance.now(), monde, couverture, echelle, ouverte: window.carteRegionaleOuverte() });
      requestAnimationFrame(pas);
    };
    requestAnimationFrame(pas);
  });
  const c = await ecranDe(1);
  await p.mouse.click(c.x, c.y);
  await p.waitForFunction(() => window.carteRegionaleOuverte() === 1 && !window.TRAVERSEE_EN_COURS, null, { timeout: 15000 }).catch(() => null);
  await p.waitForTimeout(1600);
  const s = await p.evaluate(() => { window.__sondeActive = false; return window.__sonde; });
  const zoomBase = cadrageMondeAvant.zoom;
  const plongee = Math.max(...s.map(x => x.monde));
  const couvertes = s.filter(x => x.couverture !== null);
  const pleine = s.findIndex(x => x.couverture >= 250);
  const premiereRegion = s.findIndex(x => x.ouverte === 1);
  const echelles = s.filter(x => x.echelle !== null).map(x => x.echelle);
  verifier("la carte du monde plonge vers la région (zoom ×2 ou plus)", plongee >= zoomBase * 2, `${zoomBase.toFixed(3)} → ${plongee.toFixed(3)}`);
  verifier("les nuages arrivent, s'épaississent jusqu'à couvrir l'écran", couvertes.length > 10 && pleine >= 0, `${couvertes.length} images, pleine à ${pleine}`);
  verifier("la carte régionale prend la place SOUS les nuages (écran couvert)", premiereRegion >= 0 && pleine >= 0 && premiereRegion >= pleine && (s[premiereRegion].couverture || 0) >= 250,
           `pleine ${pleine}, région ${premiereRegion}`);
  verifier("elle arrive un peu trop grande (≈ ×1,12) et revient à sa taille", echelles.length > 0 && Math.max(...echelles) > 1.08 && Math.abs(echelles[echelles.length - 1] - 1) < 0.005,
           `${Math.max(...echelles).toFixed(3)} → ${echelles[echelles.length - 1]}`);
  const fin = await p.evaluate(() => {
    const retour = document.getElementById("btn-retour-monde").getBoundingClientRect();
    const rouvrir = document.getElementById("btn-rouvrir-menu").getBoundingClientRect();
    return { traversee: window.TRAVERSEE_EN_COURS, toile: !!document.getElementById("traversee-nuages"), replie: window.menuLateralReplie(),
             retour: { d: getComputedStyle(document.getElementById("btn-retour-monde")).display, droite: retour.right, haut: retour.top, l: retour.width },
             rouvrir: { gauche: rouvrir.left, haut: rouvrir.top, l: rouvrir.width, visible: getComputedStyle(document.getElementById("btn-rouvrir-menu")).display },
             couleur: getComputedStyle(document.getElementById("btn-retour-monde")).backgroundImage };
  });
  verifier("les nuages sont partis", fin.traversee === false && !fin.toile);
  verifier("le menu s'est rangé", fin.replie === true);
  verifier("le bouton retour, beige, à gauche de celui qui rouvre le menu, à sa hauteur",
           fin.retour.d === "flex" && fin.rouvrir.visible === "block" && fin.retour.droite <= fin.rouvrir.gauche && Math.abs(fin.retour.haut - fin.rouvrir.haut) <= 2
           && /rgb\(2[0-9]{2}, 2[0-9]{2}, 1[6-9][0-9]\)|rgb\(23[0-9], 21[0-9], 1[6-9][0-9]\)/.test(fin.couleur), JSON.stringify([fin.retour, fin.rouvrir]));
});

// =========================================================================
titre("4. LA CARTE RÉGIONALE : CALÉE SUR LA HAUTEUR, GLISSE, ZOOME (JAMAIS EN DESSOUS)");
// =========================================================================
await section(async () => {
  const c0 = await p.evaluate(() => ({ ...window.cadrageCarteRegion(), ecranL: innerWidth, ecranH: innerHeight }));
  verifier("sa hauteur est celle de l'écran", Math.abs(c0.hauteur * c0.zoom - c0.ecranH) < 1 && c0.zoom === c0.base, `${(c0.hauteur * c0.zoom).toFixed(1)} / ${c0.ecranH}`);
  verifier("plus large que l'écran : elle déborde des deux côtés, sans vide", c0.panX <= 0 && c0.panX + c0.largeur * c0.zoom >= c0.ecranL, `${c0.panX.toFixed(1)}`);
  await p.mouse.move(600, 400); await p.mouse.down(); await p.mouse.move(2000, 400, { steps: 6 }); await p.mouse.up();
  const c1 = await p.evaluate(() => window.cadrageCarteRegion());
  verifier("glissée tout à droite : son bord gauche s'arrête au bord de l'écran", Math.abs(c1.panX) < 0.5, `${c1.panX}`);
  // La molette, au-dessus d'un point : il ne bouge pas sous le pointeur.
  const sous = await p.evaluate(() => { const c = window.cadrageCarteRegion(); return { x: (500 - c.panX) / c.zoom, y: (300 - c.panY) / c.zoom }; });
  await p.mouse.move(500, 300);
  for (let i = 0; i < 4; i++) { await p.mouse.wheel(0, -240); await p.waitForTimeout(30); }
  const c2 = await p.evaluate(() => window.cadrageCarteRegion());
  const apres = { x: (500 - c2.panX) / c2.zoom, y: (300 - c2.panY) / c2.zoom };
  verifier("la molette zoome", c2.zoom > c0.base * 1.5, `× ${(c2.zoom / c0.base).toFixed(2)}`);
  verifier("…autour du pointeur (le point visé reste sous lui)", Math.hypot(apres.x - sous.x, apres.y - sous.y) < 2, JSON.stringify([sous, apres]));
  for (let i = 0; i < 30; i++) await p.mouse.wheel(0, -600);
  const c3 = await p.evaluate(() => window.cadrageCarteRegion());
  verifier("au plus ×4", Math.abs(c3.zoom - c0.base * 4) < 1e-6, `× ${(c3.zoom / c0.base).toFixed(2)}`);
  for (let i = 0; i < 40; i++) await p.mouse.wheel(0, 600);
  const c4 = await p.evaluate(() => ({ ...window.cadrageCarteRegion(), ecranH: innerHeight }));
  verifier("on ne dézoome jamais au-delà de la hauteur de l'écran", Math.abs(c4.zoom - c0.base) < 1e-9 && Math.abs(c4.panY) < 1e-6, `× ${(c4.zoom / c0.base).toFixed(3)}, panY ${c4.panY}`);
  // Deux doigts (iPad) : des pointeurs tactiles qui s'écartent.
  const r = await p.evaluate(() => {
    const vue = document.getElementById("vue-carte-region");
    const ev = (type, id, x, y) => vue.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, pointerType: "touch", bubbles: true, cancelable: true }));
    const avant = window.cadrageCarteRegion().zoom;
    ev("pointerdown", 11, 560, 400); ev("pointerdown", 12, 640, 400);
    // De 80 à 200 pixels d'écart : ×2,5.
    for (let k = 1; k <= 8; k++) { ev("pointermove", 11, 560 - k * 7.5, 400); ev("pointermove", 12, 640 + k * 7.5, 400); }
    ev("pointerup", 11, 500, 400); ev("pointerup", 12, 700, 400);
    return { avant, apres: window.cadrageCarteRegion().zoom };
  });
  verifier("deux doigts qui s'écartent zooment (×2,5 ici)", Math.abs(r.apres / r.avant - 2.5) < 0.05, `${(r.apres / r.avant).toFixed(2)}`);
  await p.evaluate(() => { for (let i = 0; i < 20; i++) window.zoomerCarteRegion(0.5); });
});

// =========================================================================
titre("5. LE DEV : PINCEAU, GOMME, NUAGES");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { localStorage.setItem("ivalis_DEV_MODE", "on"); window.__ecrits = []; window.actualiserRegionsDev(); window.basculerPopupRegions(true); });
  const r0 = await p.evaluate(() => ({ monde: getComputedStyle(document.getElementById("regions-dev-monde")).display, carte: getComputedStyle(document.getElementById("regions-dev-carte")).display,
    titre: document.getElementById("regions-dev-titre").textContent, nom: document.getElementById("regions-dev-carte-nom").textContent,
    semees: (window.__ecrits || []).filter(e => /^Cartes_Regionales\//.test(e.chemin)).map(e => e.data) }));
  verifier("la popup DEV montre les outils de la carte régionale (plus ceux des boîtes)", r0.monde === "none" && r0.carte === "block" && r0.titre === "Carte régionale" && /1 · La forêt des murmures/.test(r0.nom));
  verifier("un poste DEV crée en base la fiche de chaque carte (numéro, nom, image, description)",
           r0.semees.length === 13 && r0.semees.every(d => d.Numero > 0 && d.Nom && "Image" in d && d.Description === ""), `${r0.semees.length} fiches`);
  await p.evaluate(() => { window.__ecrits = []; window.choisirOutilRegion("pinceau"); window.reglerTaillePinceauRegion(40); });
  await p.mouse.move(300, 300); await p.mouse.down(); await p.mouse.move(700, 450, { steps: 15 }); await p.mouse.up();
  await p.mouse.move(200, 600); await p.mouse.down(); await p.mouse.move(520, 620, { steps: 10 }); await p.mouse.up();
  const r1 = await p.evaluate(() => {
    const g = window.grilleNuagesRegion(), c = window.cadrageCarteRegion();
    const caseEcran = (x, y) => { const cell = c.largeur / 240; return g[Math.floor(((y - c.panY) / c.zoom) / cell) * 240 + Math.floor(((x - c.panX) / c.zoom) / cell)]; };
    return { peintes: g.reduce((s, v) => s + v, 0), dedans: caseEcran(500, 375), dehors: caseEcran(900, 150),
             rouge: getComputedStyle(document.getElementById("carte-region-peinture")).display, nuagesCaches: document.getElementById("carte-region-nuages").style.visibility,
             ecrits: window.__ecrits.length, valider: document.getElementById("btn-region-valider-nuages").disabled, actif: document.getElementById("btn-region-pinceau").classList.contains("actif") };
  });
  verifier("le pinceau peint des cases sous son passage, pas ailleurs", r1.peintes > 50 && r1.dedans === 1 && r1.dehors === 0, `${r1.peintes} cases`);
  verifier("les zones rouges se voient (semi-transparentes), les nuages s'effacent pendant ce temps", r1.rouge === "block" && r1.nuagesCaches === "hidden");
  verifier("c'est provisoire : rien n'est écrit en base ; « Valider » s'allume", r1.ecrits === 0 && r1.valider === false && r1.actif === true);
  const rouge = await p.evaluate(() => { const t = document.getElementById("carte-region-peinture"); const ctx = t.getContext("2d");
    let max = 0, r = 0; const d = ctx.getImageData(0, 0, t.width, t.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > max) { max = d[i]; r = d[i - 3]; } return { max, r }; });
  verifier("…en rouge, à demi transparent", rouge.r > 180 && rouge.max > 80 && rouge.max < 200, JSON.stringify(rouge));
  await p.evaluate(() => window.choisirOutilRegion("gomme"));
  await p.mouse.move(480, 360); await p.mouse.down(); await p.mouse.move(540, 400, { steps: 4 }); await p.mouse.up();
  const r2 = await p.evaluate(() => { const g = window.grilleNuagesRegion(); return g.reduce((s, v) => s + v, 0); });
  verifier("la gomme efface", r2 < r1.peintes && r2 > 0, `${r1.peintes} → ${r2}`);
  // Annuler, puis repeindre et valider.
  await p.evaluate(() => window.annulerNuagesRegion());
  const r3 = await p.evaluate(() => window.grilleNuagesRegion().reduce((s, v) => s + v, 0));
  verifier("« Annuler la peinture » revient à ce qui est enregistré (rien encore)", r3 === 0);
  await p.evaluate(() => window.choisirOutilRegion("pinceau"));
  for (const [x, y] of [[250, 250], [250, 330], [250, 410]]) { await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 500, y + 40, { steps: 15 }); await p.mouse.up(); }
  const peintes = await p.evaluate(() => window.grilleNuagesRegion().reduce((s, v) => s + v, 0));
  await p.evaluate(() => window.validerNuagesRegion());
  await p.waitForTimeout(700);
  const r4 = await p.evaluate(() => {
    const e = (window.__ecrits || []).filter(x => x.chemin === "Cartes_Regionales/1").pop();
    const g = e && e.data.Nuages ? window.decoderGrilleNuages(e.data.Nuages.cases, e.data.Nuages.colonnes * e.data.Nuages.lignes) : null;
    return { ecrit: !!e, fusion: !!(e && e.options && e.options.merge), nuages: e && e.data.Nuages && { colonnes: e.data.Nuages.colonnes, lignes: e.data.Nuages.lignes },
             relu: g ? g.reduce((s, v) => s + v, 0) : -1, rouge: getComputedStyle(document.getElementById("carte-region-peinture")).display,
             visibles: document.getElementById("carte-region-nuages").style.visibility, outil: document.getElementById("btn-region-pinceau").classList.contains("actif") };
  });
  verifier("« Valider » écrit la grille dans la fiche (Cartes_Regionales/1, en fusion)", r4.ecrit && r4.fusion && r4.nuages && r4.nuages.colonnes === 240 && r4.nuages.lignes === 150, JSON.stringify(r4.nuages));
  verifier("…exactement ce qui était peint (relue depuis la base)", r4.relu === peintes, `${r4.relu} / ${peintes}`);
  verifier("le rouge disparaît, les nuages paraissent, le pinceau se repose", r4.rouge === "none" && r4.visibles === "visible" && !r4.outil);
  const pixels = async () => p.evaluate(() => {
    const t = document.getElementById("carte-region-nuages"), ctx = t.getContext("2d"), c = window.cadrageCarteRegion();
    const vers = (x, y) => [Math.floor((x - c.panX) / c.zoom / c.largeur * t.width), Math.floor((y - c.panY) / c.zoom / c.hauteur * t.height)];
    const zone = (x0, y0, x1, y1) => { const [a, b] = vers(x0, y0), [e, f] = vers(x1, y1); return ctx.getImageData(a, b, Math.max(1, e - a), Math.max(1, f - b)).data; };
    const dedans = zone(380, 320, 620, 380), dehors = zone(900, 650, 1100, 750);
    let n = 0, r = 0, g = 0, bl = 0, opaques = 0, somme = 0;
    for (let i = 0; i < dedans.length; i += 4) { if (dedans[i + 3] > 200) { opaques++; r += dedans[i]; g += dedans[i + 1]; bl += dedans[i + 2]; } n++; somme += dedans[i] + dedans[i + 3]; }
    let dehorsOpaques = 0; for (let i = 3; i < dehors.length; i += 4) if (dehors[i] > 10) dehorsOpaques++;
    return { part: opaques / n, couleur: opaques ? [r / opaques, g / opaques, bl / opaques].map(Math.round) : null, dehorsOpaques, somme, brut: Array.from(dedans.slice(0, 400)) };
  });
  const v1 = await pixels();
  await p.waitForTimeout(1300);
  const v2 = await pixels();
  verifier("des nuages couvrent la zone peinte", v1.part > 0.7, `${(v1.part * 100).toFixed(0)} %`);
  verifier("beige foncé : ni blancs, ni gris (rouge > vert > bleu, pas trop clairs)", !!v1.couleur && v1.couleur[0] > v1.couleur[1] && v1.couleur[1] > v1.couleur[2] && v1.couleur[0] < 215 && v1.couleur[0] - v1.couleur[2] > 25,
           JSON.stringify(v1.couleur));
  verifier("rien hors des zones peintes", v1.dehorsOpaques === 0, `${v1.dehorsOpaques}`);
  const ecart = v1.brut.reduce((s, x, i) => s + Math.abs(x - v2.brut[i]), 0) / v1.brut.length;
  verifier("ils bougent : 1,3 s plus tard, la matière a changé", ecart > 1, `écart ${ecart.toFixed(2)}`);
  // Un autre poste : la fiche relue de la base porte les mêmes nuages.
  const r5 = await p.evaluate(() => {
    const e = (window.__ecrits || []).filter(x => x.chemin === "Cartes_Regionales/1").pop();
    window.appliquerCartesRegionalesDeLaBase([{ id: "1", data: { Numero: 1, Nom: "La forêt des murmures", Nuages: e.data.Nuages } }]);
    return { a: window.CARTES_REGIONALES[1].nuages.cases === e.data.Nuages.cases };
  });
  verifier("relus de la base, ce sont les mêmes nuages (pour toutes les parties)", r5.a === true);
});

// =========================================================================
titre("6. LE TITRE : DORÉ, ACCROCHÉ À LA CARTE, DÉPLAÇABLE EN DEV");
// =========================================================================
await section(async () => {
  const r0 = await p.evaluate(() => {
    const el = document.getElementById("carte-region-titre"), t = el.querySelector(".carte-region-titre-texte");
    const st = getComputedStyle(t), c = window.cadrageCarteRegion();
    const nomCombat = document.getElementById("voile-tour-nom");
    const reference = nomCombat ? getComputedStyle(nomCombat) : null;
    return { texte: t.textContent, police: st.fontFamily, policeCombat: reference && reference.fontFamily, fondCombat: reference && reference.backgroundImage, clip: st.webkitBackgroundClip || st.backgroundClip, fond: st.backgroundImage,
             dansCarte: el.parentElement.id === "carte-region", x: parseFloat(el.style.left) / c.largeur, y: parseFloat(el.style.top) / c.hauteur };
  });
  verifier("le nom de la carte, dans la police et l'or brossé du nom des combattants", r0.texte === "La forêt des murmures" && !!r0.policeCombat
           && r0.police === r0.policeCombat && /text/.test(r0.clip) && r0.fond === r0.fondCombat,
           JSON.stringify([r0.texte, r0.police, r0.policeCombat, r0.clip]));
  verifier("accroché à la carte (en pixels de l'image), en haut au centre par défaut", r0.dansCarte && Math.abs(r0.x - 0.5) < 0.01 && Math.abs(r0.y - 0.09) < 0.01, `${r0.x.toFixed(2)}, ${r0.y.toFixed(2)}`);
  await p.evaluate(() => { window.__ecrits = []; document.getElementById("case-region-titre").click(); });
  const avant = await p.evaluate(() => { const el = document.getElementById("carte-region-titre"); const r = el.getBoundingClientRect(); const h = el.querySelector(".carte-region-titre-poignee").getBoundingClientRect();
    return { edition: el.classList.contains("edition"), x: r.left + r.width / 2, y: r.top + r.height / 2, poignee: { x: h.left + h.width / 2, y: h.top + h.height / 2, visible: h.width > 0 },
             titre: { ...window.CARTES_REGIONALES[1].titre } }; });
  verifier("« Édition du titre » : le cadre et le carré du coin haut droit", avant.edition && avant.poignee.visible && avant.poignee.x > avant.x && avant.poignee.y < avant.y);
  await p.mouse.move(avant.x, avant.y); await p.mouse.down(); await p.mouse.move(avant.x - 150, avant.y + 200, { steps: 8 }); await p.mouse.up();
  const deplace = await p.evaluate(() => ({ ...window.CARTES_REGIONALES[1].titre }));
  verifier("le glisser le déplace", deplace.x < avant.titre.x - 0.03 && deplace.y > avant.titre.y + 0.05, JSON.stringify(deplace));
  // Le carré, vers le bas à gauche : plus petit ; puis (il a bougé avec le
  // titre) vers le haut à droite : plus grand.
  const carre = () => p.evaluate(() => { const h = document.querySelector(".carte-region-titre-poignee").getBoundingClientRect(); return { x: h.left + h.width / 2, y: h.top + h.height / 2 }; });
  const q1 = await carre();
  await p.mouse.move(q1.x, q1.y); await p.mouse.down(); await p.mouse.move(q1.x - 25, q1.y + 25, { steps: 6 }); await p.mouse.up();
  const retreci = await p.evaluate(() => window.CARTES_REGIONALES[1].titre.taille);
  const q2 = await carre();
  await p.mouse.move(q2.x, q2.y); await p.mouse.down(); await p.mouse.move(q2.x + 35, q2.y - 35, { steps: 6 }); await p.mouse.up();
  const grandi = await p.evaluate(() => window.CARTES_REGIONALES[1].titre.taille);
  verifier("le carré du coin le rétrécit (vers le bas à gauche) et l'agrandit (vers le haut à droite)", retreci < deplace.taille && grandi > retreci,
           `${deplace.taille} → ${retreci.toFixed(3)} → ${grandi.toFixed(3)}`);
  const ecritsPendant = await p.evaluate(() => window.__ecrits.length);
  await p.evaluate(() => document.getElementById("case-region-titre").click());
  const r1 = await p.evaluate(() => { const e = window.__ecrits.filter(x => x.chemin === "Cartes_Regionales/1").pop();
    return { e: e && e.data.Titre, local: window.CARTES_REGIONALES[1].titre, edition: document.getElementById("carte-region-titre").classList.contains("edition") }; });
  verifier("rien n'est écrit pendant l'édition ; en sortant du mode, le titre s'enregistre", ecritsPendant === 0 && !!r1.e && Math.abs(r1.e.x - r1.local.x) < 1e-3 && Math.abs(r1.e.taille - r1.local.taille) < 1e-3 && !r1.edition,
           JSON.stringify(r1.e));
  // Relue de la base par un autre poste.
  const r2 = await p.evaluate(() => { const nuages = window.CARTES_REGIONALES[1].nuages;
    window.appliquerCartesRegionalesDeLaBase([{ id: "1", data: { Numero: 1, Titre: { x: 0.3, y: 0.4, taille: 0.1 }, Nuages: nuages } }]);
    const el = document.getElementById("carte-region-titre"), c = window.cadrageCarteRegion();
    return { x: parseFloat(el.style.left) / c.largeur, y: parseFloat(el.style.top) / c.hauteur, taille: parseFloat(el.style.fontSize) / c.hauteur }; });
  verifier("la place relue de la base s'applique", Math.abs(r2.x - 0.3) < 1e-3 && Math.abs(r2.y - 0.4) < 1e-3 && Math.abs(r2.taille - 0.1) < 1e-3, JSON.stringify(r2));
  // Le titre suit la carte quand on zoome.
  const z = await p.evaluate(() => { const el = document.getElementById("carte-region-titre"); const a = el.getBoundingClientRect().width; window.zoomerCarteRegion(2); const b = el.getBoundingClientRect().width; window.zoomerCarteRegion(0.5); return b / a; });
  verifier("il grandit avec la carte quand on zoome", Math.abs(z - 2) < 0.05, z.toFixed(2));
  await p.evaluate(() => window.basculerPopupRegions(false));
});

// =========================================================================
titre("7. LE RETOUR : NUAGES, PUIS LA CARTE DU MONDE QUI SE DÉZOOME");
// =========================================================================
await section(async () => {
  await p.evaluate(() => {
    window.__sonde = []; window.__sondeActive = true;
    const pas = () => { if (!window.__sondeActive) return;
      window.__sonde.push({ monde: new DOMMatrix(getComputedStyle(document.getElementById("carte-fond-jeu")).transform).a, nuages: !!document.getElementById("traversee-nuages"), ouverte: window.carteRegionaleOuverte() });
      requestAnimationFrame(pas); };
    requestAnimationFrame(pas);
  });
  await p.click("#btn-retour-monde");
  await p.waitForFunction(() => window.carteRegionaleOuverte() === null && !window.TRAVERSEE_EN_COURS, null, { timeout: 15000 }).catch(() => null);
  await p.waitForTimeout(1600);
  const s = await p.evaluate(() => { window.__sondeActive = false; return window.__sonde; });
  const r = await p.evaluate(() => ({ monde: window.cadrageCarteMonde(), vue: getComputedStyle(document.getElementById("vue-carte-region")).display,
    retour: getComputedStyle(document.getElementById("btn-retour-monde")).display, transform: document.getElementById("carte-fond-jeu").style.transform }));
  const fermeture = s.findIndex(x => x.ouverte === null);
  verifier("les nuages passent", s.some(x => x.nuages));
  verifier("la carte du monde revient plongée sur la région, puis se dézoome",
           fermeture >= 0 && s[fermeture].monde >= cadrageMondeAvant.zoom * 2 && Math.abs(s[s.length - 1].monde - cadrageMondeAvant.zoom) < 1e-3,
           `${fermeture >= 0 ? s[fermeture].monde.toFixed(3) : "?"} → ${s[s.length - 1].monde.toFixed(3)}`);
  verifier("…jusqu'à son cadrage d'avant (calée sur la hauteur, même glissement)",
           Math.abs(r.monde.zoom - cadrageMondeAvant.zoom) < 1e-9 && Math.abs(r.monde.panX - cadrageMondeAvant.panX) < 0.5, JSON.stringify(r.monde));
  verifier("la carte régionale et le bouton retour s'en vont", r.vue === "none" && r.retour === "none");
  // Rouverte : elle reprend ses nuages et son titre.
  await p.evaluate(() => window.ouvrirCarteRegionale(1, { sansTransition: true }));
  await p.waitForTimeout(400);
  const r2 = await p.evaluate(() => ({ ouverte: window.carteRegionaleOuverte(), vide: document.getElementById("carte-region-nuages").dataset.vide, zoom: window.cadrageCarteRegion().zoom === window.cadrageCarteRegion().base }));
  verifier("rouverte : ses nuages sont là, cadrée sur la hauteur", r2.ouverte === 1 && r2.vide === "0" && r2.zoom);
  await p.evaluate(() => window.fermerCarteRegionale({ sansTransition: true }));
});

// =========================================================================
titre("8. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json')).version;
  verifier("version 272 ou plus (trace_combat.js, version.json)", vTrace >= 272 && vJson === vTrace, `${vTrace} / ${vJson}`);
  verifier("cartes_regionales.js est chargé (après regions_carte.js), style.css a changé de version",
           /regions_carte\.js\?v=\d+[\s\S]*cartes_regionales\.js\?v=\d+/.test(html) && Number((html.match(/style\.css\?v=(\d+)/) || [])[1]) >= 103);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
