// v275 — LE DÉPLACEMENT DES PJ.
//
// Nico : supprimer l'ancien déplacement du groupe (la grille, le fanion, la
// génération de lieux à l'arrivée). Sur la carte du monde, l'image du groupe au
// centre de la boîte de sa région ; sur les cartes régionales, un marqueur ; des
// tailles réglables et un téléport dans le bouton DEV rouge. Un bouton voyage,
// en haut à côté de celui qui déplie le menu : un pointillé rouge droit et une
// croix (le monde), des routes compliquées sur le terrain praticable (la
// région) ; un vote chez tous (un « non » annule, le DEV force) ; l'image du
// groupe glisse lentement ; en région, « JOUR 1 », les nuits au campement
// (repartir ou rester, tous d'accord), la date qui avance, le message du
// campement, le chat nettoyé à chaque départ (le cimetière tous les 4
// voyages). Les terrains praticables : des boîtes régionales en DEV ; en
// changeant de région, le groupe apparaît au bord du terrain, du côté d'où il
// vient.
//
// Sur la VRAIE page, Firestore en mémoire (transactions comprises).
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(76)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const titre = (t) => console.log("\n" + t);
const section = async (corps) => { try { await corps(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 160)); } };
const lire = (f) => { try { return fs.readFileSync(path.join(RACINE, f), 'utf-8'); } catch (e) { return ""; } };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' }); res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({}); export const getApp = () => ({});`;
// Firestore en mémoire : les écritures (setDoc, updateDoc aux chemins pointés,
// deleteField, les lots, les transactions) changent window.__docs, et toute
// écriture de la partie revient au jeu comme l'écoute la lui donnerait.
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, ...c) => ({ col: c.join("/") });
  const SUPPR = { __supprimer: true };
  const docs = () => (window.__docs = window.__docs || {});
  const cloner = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const estMap = (v) => v && typeof v === "object" && !Array.isArray(v) && !v.__supprimer;
  function fusionner(cible, src) {
    Object.entries(src).forEach(([k, v]) => {
      if (v && v.__supprimer) { delete cible[k]; return; }
      if (estMap(v)) { if (!estMap(cible[k])) cible[k] = {}; fusionner(cible[k], v); return; }
      cible[k] = cloner(v);
    });
  }
  function nettoyer(v) { if (estMap(v)) { Object.keys(v).forEach(k => { if (v[k] && v[k].__supprimer) delete v[k]; else nettoyer(v[k]); }); } return v; }
  function ecrire(chemin, data, mode) {
    const d = docs();
    if (mode === "set") d[chemin] = nettoyer(cloner(Object.fromEntries(Object.entries(data).filter(([k, v]) => !(v && v.__supprimer)))));
    else if (mode === "merge") { d[chemin] = d[chemin] || {}; fusionner(d[chemin], data); }
    else if (mode === "update") {
      if (!d[chemin]) throw new Error("document absent : " + chemin);
      Object.entries(data).forEach(([cle, v]) => {
        const parts = cle.split("."); let o = d[chemin];
        for (let i = 0; i < parts.length - 1; i++) { if (!estMap(o[parts[i]])) o[parts[i]] = {}; o = o[parts[i]]; }
        const f = parts[parts.length - 1];
        if (v && v.__supprimer) delete o[f]; else o[f] = nettoyer(cloner(v));
      });
    }
    (window.__journal = window.__journal || []).push({ chemin, mode, data: JSON.parse(JSON.stringify(data, (k, v) => v && v.__supprimer ? "<supprimé>" : v)) });
    if (chemin.startsWith("Systeme_Parties/") && window.__relaisPartie && typeof window.appliquerVoyageDeLaPartie === "function") {
      const copie = cloner(d[chemin]);
      setTimeout(() => window.appliquerVoyageDeLaPartie(copie), 0);
    }
  }
  export const getDoc = async (ref) => { const d = docs()[ref.chemin]; return { exists: () => !!d, data: () => cloner(d || {}) }; };
  export const query = (c, ...contraintes) => ({ col: c.col, contraintes });
  export const where = (champ, op, valeur) => ({ type: "where", champ, op, valeur });
  export const orderBy = (champ) => ({ type: "orderBy", champ }); export const limit = (n) => ({ type: "limit", n });
  export const getDocs = async (q) => {
    const col = q.col; const w = (q.contraintes || []).filter(c => c && c.type === "where");
    const liste = Object.entries(docs()).filter(([k]) => k.startsWith(col + "/") && k.split("/").length === col.split("/").length + 1)
      .filter(([, v]) => w.every(c => c.op === "==" ? v[c.champ] === c.valeur : c.op === "in" ? c.valeur.includes(v[c.champ]) : true))
      .map(([k, v]) => ({ id: k.split("/").pop(), ref: { chemin: k }, data: () => cloner(v) }))
      .sort((a, b) => (a.data().Timestamp || 0) - (b.data().Timestamp || 0));
    return { forEach: (f) => liste.forEach(f), docs: liste, empty: liste.length === 0, size: liste.length };
  };
  export const setDoc = async (ref, data, options) => { ecrire(ref.chemin, data, options && options.merge ? "merge" : "set"); (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data: JSON.parse(JSON.stringify(data)), options }); };
  export const updateDoc = async (ref, data) => { ecrire(ref.chemin, data, "update"); (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data: JSON.parse(JSON.stringify(data, (k, v) => v && v.__supprimer ? "<supprimé>" : v)) }); };
  export const deleteDoc = async (ref) => { delete docs()[ref.chemin]; (window.__suppressions = window.__suppressions || []).push(ref.chemin); };
  let n = 0;
  export const addDoc = async (c, data) => { const id = "m" + (++n) + "_" + Date.now(); docs()[c.col + "/" + id] = cloner(data); (window.__ajouts = window.__ajouts || []).push({ col: c.col, id, data: cloner(data) }); return { id }; };
  export const deleteField = () => SUPPR; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (k) => k; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const writeBatch = () => { const ops = []; return { set(r, d, o){ ops.push(() => ecrire(r.chemin, d, o && o.merge ? "merge" : "set")); }, update(r, d){ ops.push(() => ecrire(r.chemin, d, "update")); },
    delete(r){ ops.push(() => { delete docs()[r.chemin]; (window.__suppressions = window.__suppressions || []).push(r.chemin); }); }, commit: async () => { ops.forEach(f => f()); } }; };
  export const runTransaction = async (_d, fn) => {
    window.__transactions = (window.__transactions || 0) + 1;
    const ops = [];
    const tx = { get: async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => cloner(d || {}) }; },
                 update(r, d) { ops.push(() => ecrire(r.chemin, d, "update")); return tx; },
                 set(r, d, o) { ops.push(() => ecrire(r.chemin, d, o && o.merge ? "merge" : "set")); return tx; } };
    const res = await fn(tx);
    ops.forEach(f => f());
    return res;
  };
  export const Timestamp = { now: () => Date.now() };
`;
const MONDE = `<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2160"><rect width="3840" height="2160" fill="#4f7a9a"/><path d="M600 500 C1200 300 2200 400 3000 800 C3400 1300 2800 1900 1900 1800 C1000 1750 300 1300 600 500Z" fill="#b9a46a"/></svg>`;
const REGION = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1500"><rect width="2400" height="1500" fill="#6f9a4f"/>${Array.from({length:40},(_,i)=>`<circle cx="${(i*397)%2400}" cy="${(i*263)%1500}" r="${30+(i*17)%60}" fill="#244a1c" opacity="0.8"/>`).join("")}<path d="M0 1100 C600 1000 1200 1250 2400 1050" stroke="#3b6fa0" stroke-width="40" fill="none"/></svg>`;
const IMAGES = {
  bfvzfg: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="90" fill="#7a4a1c"/><text x="100" y="118" font-size="60" text-anchor="middle" fill="#fff">G</text></svg>`,
  xtlhvg: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="240"><path d="M100 230 L20 90 A80 80 0 1 1 180 90 Z" fill="#a3141b"/><circle cx="100" cy="85" r="35" fill="#fff"/></svg>`,
  ds54xr: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="95" fill="#e8d5a5" stroke="#5c3a21" stroke-width="8"/><path d="M100 25 L120 100 L100 175 L80 100Z" fill="#a3141b"/></svg>`,
  lbr2mo: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="95" fill="#5c3a21"/></svg>`
};
const URL_MONDE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1792842687/B713FC3C-F7B3-4C38-B3DA-4040AC5D34F3_bfvzfg.png";
const URL_REGION = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1792842655/41915054-FA63-4BFF-AEB0-6D95E07E47AA_xtlhvg.png";
const URL_BOUTON = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1792843931/IMG_2196_ds54xr.png";
const CAMPEMENT = "Après plusieurs heures de marche, vous décidez de vous arrêter pour passer la nuit au cœur de la nature. Le campement est désormais installé, les affaires rangées et les tentes dressées. Au centre du camp, un feu crépite doucement, diffusant sa chaleur réconfortante tandis que les dernières lueurs du jour disparaissent derrière l'horizon. La nuit s'installe peu à peu, enveloppant les environs d'un calme presque irréel. Seuls le bruissement des feuilles, les sons lointains de la faune nocturne et le crépitement des flammes viennent troubler le silence. La lumière dansante du feu projette des ombres mouvantes sur les alentours, tandis que l'obscurité dissimule peu à peu ce qui se trouve au-delà de votre petit refuge.";

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => {
  const u = r.request().url();
  const cle = Object.keys(IMAGES).find(k => u.includes(k));
  const corps = /map_wx8s89/.test(u) ? MONDE : /IMG_1[89]|IMG_2189/.test(u) ? REGION : cle ? IMAGES[cle] : `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>`;
  r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'}, body: corps });
});
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);

// La table : une partie, deux joueurs (Thorin, Lyra), le groupe dans la
// région 1. Trois boîtes sur la carte du monde (1 à l'ouest, 2 à l'est, 4 au
// milieu, sans carte) ; la carte 2 a un terrain praticable et un village.
const VILLAGE = "L_00042_Brumefosse";
await p.evaluate(({ VILLAGE }) => {
  window.jouerSonClic = () => {}; window.confirm = () => true;
  localStorage.setItem("ivalis_DEV_MODE", "on");
  localStorage.setItem("ID_JOUEUR_COURANT", "P_01");
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => e.style.display = e.id === "ecran-jeu" ? "block" : "none");
  window.recadrerCarte();
  window.__docs = window.__docs || {};
  window.ID_PARTIE_COURANTE = "P1";
  window.__docs["Systeme_Parties/P1"] = { Lieu_Actuel: "", Voyages_Effectues: 1, Position_Groupe: { Region: 1, x: 0.3, y: 0.5 } };
  window.__docs["Date_En_Jeu/actuelle"] = { Jour: "12", Annee: "3" };
  window.DATE_EN_JEU_ACTUELLE = { jour: "12", annee: "3" };
  window.PERSOS_JOUEURS_PARTIE = [
    { idPersonnage: "H1", idJoueur: "P_01", prenom: "Thorin", camp: "Allié", statut: "Vivant", actif: true },
    { idPersonnage: "H2", idJoueur: "P_02", prenom: "Lyra", camp: "Allié", statut: "Vivant", actif: true },
    { idPersonnage: "H3", idJoueur: "P_03", prenom: "Ombre", camp: "Allié", statut: "Vivant", actif: true, estIllusion: true },
    { idPersonnage: "H4", idJoueur: "P_04", prenom: "Gorm", camp: "Allié", statut: "Mort", actif: true }];
  window.__nettoyages = [];
  window.__vraiNettoyage = window.nettoyerChatVoyage;
  window.nettoyerChatVoyage = async (o) => { window.__nettoyages.push(o); return true; };
  if (typeof window.actualiserRegionsDev === "function") window.actualiserRegionsDev();
  window.appliquerRegionsDeLaBase({ Prochain_Numero: 16, Regions: {
    1: { Numero: 1, Points: [{ x: 850, y: 620 }, { x: 1450, y: 620 }, { x: 1450, y: 1080 }, { x: 850, y: 1080 }] },
    2: { Numero: 2, Points: [{ x: 2300, y: 700 }, { x: 2900, y: 700 }, { x: 2900, y: 1200 }, { x: 2300, y: 1200 }] },
    4: { Numero: 4, Points: [{ x: 1700, y: 1250 }, { x: 2100, y: 1250 }, { x: 2100, y: 1650 }, { x: 1700, y: 1650 }] } } });
  window.appliquerCartesRegionalesDeLaBase([{ id: "2", data: { Numero: 2, Aspect: 1.6, Prochain_Terrain: 2,
    Terrains: { 1: { Numero: 1, Points: [{ x: 0.15, y: 0.2 }, { x: 0.85, y: 0.2 }, { x: 0.85, y: 0.8 }, { x: 0.15, y: 0.8 }] } } } }]);
  window.__docs["Cartes_Regionales/2"] = { Numero: 2, Aspect: 1.6, Prochain_Terrain: 2, Terrains: { 1: { Numero: 1, Points: [{ x: 0.15, y: 0.2 }, { x: 0.85, y: 0.2 }, { x: 0.85, y: 0.8 }, { x: 0.15, y: 0.8 }] } } };
  if (typeof window.appliquerVillagesDeLaBase === "function")
    window.appliquerVillagesDeLaBase([{ id: VILLAGE, data: { Nom_Du_Lieu: "Brumefosse", Carte_Regionale: 2, Position_Region: { x: 0.7, y: 0.66, taille: 0.08 }, URL_Calque_Region: "" } }]);
  document.getElementById("btn-rouvrir-menu").style.display = "block";
  window.__relaisPartie = true;
  if (typeof window.appliquerVoyageDeLaPartie === "function") window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"])));
}, { VILLAGE });
await p.waitForTimeout(400);

const partie = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"] || {})));
const ecrirePartie = (maj) => p.evaluate((maj) => {
  const d = window.__docs["Systeme_Parties/P1"];
  Object.entries(maj).forEach(([k, v]) => { if (v === null) delete d[k]; else d[k] = v; });
  if (typeof window.appliquerVoyageDeLaPartie === "function") window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(d)));
}, maj);
// Changer de joueur (le même écran, vu par Thorin ou par Lyra).
const joueur = (id) => p.evaluate((id) => { localStorage.setItem("ID_JOUEUR_COURANT", id); if (typeof window.dessinerVoyageGroupe === "function") window.dessinerVoyageGroupe(); }, id);
const ecranMonde = (n) => p.evaluate((n) => { const c = window.centreRegion(window.REGIONS_CARTE[n].points); const r = document.getElementById("carte-fond-jeu").getBoundingClientRect();
  const z = window.cadrageCarteMonde().zoom; return { x: r.left + c.x * z, y: r.top + c.y * z }; }, n);
const ecranRegion = (fx, fy) => p.evaluate(({ fx, fy }) => { const c = window.cadrageCarteRegion(); const e = document.getElementById("ecran-jeu").getBoundingClientRect();
  return { x: e.left + c.panX + fx * c.largeur * c.zoom, y: e.top + c.panY + fy * c.hauteur * c.zoom }; }, { fx, fy });
const centre = (id) => p.evaluate((id) => { const el = document.getElementById(id); if (!el) return null; const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.width, h: r.height, d: getComputedStyle(el).display }; }, id);
const etat = () => p.evaluate(() => typeof window.etatVoyageGroupe === "function" ? window.etatVoyageGroupe() : null);
const annonce = () => p.evaluate(() => { const a = document.getElementById("annonce-voyage"); return a && a.classList.contains("visible") ? a.textContent : ""; });
const proposer = async (versRegion) => {
  await p.click("#btn-voyage");
  const c = await ecranMonde(versRegion);
  await p.mouse.click(c.x, c.y);
  await p.waitForTimeout(150);
  await p.click('#bandeau-voyage [data-action="valider"]');
  await p.waitForTimeout(150);
};

// =========================================================================
titre("1. L'ANCIEN DÉPLACEMENT N'EXISTE PLUS (GRILLE, FANION, LIEUX INVENTÉS À L'ARRIVÉE)");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => ({
    dom: ["pion-groupe", "grille-hexagonale", "modale-voyage", "texte-modale-voyage", "conteneur-icones-carte"].filter(id => document.getElementById(id)),
    icones: document.querySelectorAll(".icone-carte-lieu").length,
    fonctions: ["toggleGrille", "executerVoyage", "deplacerPionVers", "creerNouveauLieu", "dessinerIconesCarte", "calculerDistanceHex",
                "dessinerGrilleHexagonale", "placerPionSurHex"].filter(f => typeof window[f] === "function") }));
  verifier("plus de grille, de fanion, de pop-up « Long Périple », d'icônes de lieux", r.dom.length === 0 && r.icones === 0, r.dom.join(", "));
  verifier("plus de fonctions de l'ancien voyage (grille, distance hexagonale, MIA_CARTO…)", r.fonctions.length === 0, r.fonctions.join(", "));
  const app = lire('app.js'), ia = lire('ia_master.js');
  verifier("app.js : plus de Proposition_Voyage ni de création de lieu à l'arrivée", !/Proposition_Voyage/.test(app) && !/creerNouveauLieu/.test(app) && !/Tuile_ID/.test(app));
  verifier("ia_master.js : MIA_CARTO (le lieu inventé à chaque arrivée) n'existe plus", !/window\.creerNouveauLieu\s*=/.test(ia));
  verifier("l'écoute de la partie donne la main au voyage du groupe (voyage_groupe.js)", /appliquerVoyageDeLaPartie\(dataPartie\)/.test(app));
});

// =========================================================================
titre("2. LA CARTE DU MONDE : L'IMAGE DU GROUPE, AU CENTRE DE LA BOÎTE DE SA RÉGION");
// =========================================================================
await section(async () => {
  const pion = await centre("pion-groupe-monde");
  const c1 = await ecranMonde(1);
  const r = await p.evaluate(() => { const el = document.getElementById("pion-groupe-monde"); return { src: el.src, doigts: getComputedStyle(el).pointerEvents, zoom: window.cadrageCarteMonde().zoom }; });
  verifier("l'image du groupe (celle de Nico)", r.src === "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1792842687/B713FC3C-F7B3-4C38-B3DA-4040AC5D34F3_bfvzfg.png", r.src);
  verifier("au centre de la boîte de clic de la région 1", pion && pion.d === "block" && Math.abs(pion.x - c1.x) < 1.5 && Math.abs(pion.y - c1.y) < 1.5,
           pion && `${pion.x.toFixed(1)},${pion.y.toFixed(1)} / ${c1.x.toFixed(1)},${c1.y.toFixed(1)}`);
  verifier("sa taille suit la carte (150 px de carte, au zoom de l'écran)", Math.abs(pion.l - 150 * r.zoom) < 1, `${pion.l.toFixed(1)} / ${(150 * r.zoom).toFixed(1)}`);
  verifier("elle ne prend pas le doigt (les régions restent cliquables)", r.doigts === "none");
  // Sans position en base, le village où se trouve le groupe la donne.
  await ecrirePartie({ Position_Groupe: null, Lieu_Actuel: "L_00042_Brumefosse" });
  const pion2 = await centre("pion-groupe-monde"), c2 = await ecranMonde(2);
  verifier("sans position, le village du Lieu_Actuel la donne (région 2)", Math.abs(pion2.x - c2.x) < 1.5 && Math.abs(pion2.y - c2.y) < 1.5);
  await ecrirePartie({ Lieu_Actuel: "" });
  const pion3 = await centre("pion-groupe-monde");
  verifier("ni position ni village : pas d'image", pion3.d === "none");
  await ecrirePartie({ Position_Groupe: { Region: 1, x: 0.3, y: 0.5 } });
});

// =========================================================================
titre("3. LE BOUTON VOYAGE : EN HAUT, À CÔTÉ DE CELUI QUI DÉPLIE LE MENU, LA MÊME TAILLE");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => { const b = document.getElementById("btn-voyage"), m = document.getElementById("btn-rouvrir-menu");
    const rb = b.getBoundingClientRect(), rm = m.getBoundingClientRect();
    return { src: b.src, d: getComputedStyle(b).display, lb: rb.width, lm: rm.width, hautB: rb.top, hautM: rm.top, droiteB: rb.right, gaucheM: rm.left }; });
  verifier("l'image de Nico", r.src === "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1792843931/IMG_2196_ds54xr.png", r.src);
  verifier("visible, menu rangé, la même largeur que le bouton du menu", r.d === "block" && Math.abs(r.lb - r.lm) < 0.5, `${r.lb} / ${r.lm}`);
  verifier("à la même hauteur, juste à sa gauche", Math.abs(r.hautB - r.hautM) < 0.5 && r.droiteB <= r.gaucheM && r.gaucheM - r.droiteB < 20, `${r.droiteB} → ${r.gaucheM}`);
  await p.evaluate(() => { document.getElementById("btn-rouvrir-menu").style.display = "none"; });
  await p.waitForTimeout(50);
  const cache = await p.evaluate(() => getComputedStyle(document.getElementById("btn-voyage")).display);
  verifier("il se range avec lui (menu déplié)", cache === "none");
  await p.evaluate(() => { document.getElementById("btn-rouvrir-menu").style.display = "block"; });
  await p.waitForTimeout(50);
});

// =========================================================================
titre("4. LE MODE VOYAGE SUR LE MONDE : UNE CROIX ROUGE ET UN POINTILLÉ ROUGE DROIT");
// =========================================================================
await section(async () => {
  await p.click("#btn-voyage");
  const r0 = await p.evaluate(() => ({ bandeau: getComputedStyle(document.getElementById("bandeau-voyage")).display, texte: document.getElementById("bandeau-voyage").textContent,
                                      choix: document.getElementById("calque-regions").classList.contains("choix") }));
  verifier("le mode s'ouvre chez celui qui a cliqué : un bandeau « touchez la région »", r0.bandeau === "block" && /Touchez la région/.test(r0.texte));
  verifier("toutes les régions se touchent", r0.choix);
  const c1 = await ecranMonde(1);
  await p.mouse.click(c1.x, c1.y);
  await p.waitForTimeout(100);
  verifier("sa propre région : « déjà dans cette région »", /déjà dans cette région/.test(await annonce()));
  const c2 = await ecranMonde(2);
  await p.mouse.click(c2.x, c2.y);
  await p.waitForTimeout(1700);
  const r = await p.evaluate(() => { const svg = document.getElementById("calque-voyage-monde"), t = svg.querySelector(".trace-voyage"), x = svg.querySelector(".croix-voyage");
    const st = t && getComputedStyle(t); const e = window.etatVoyageGroupe();
    return { d: t && t.getAttribute("d"), tirets: t && t.getAttribute("stroke-dasharray"), couleur: st && st.stroke, croix: x && x.getAttribute("transform"),
             croixVisible: x && getComputedStyle(x.querySelector(".croix-voyage-dessin")).opacity, prop: e.choix && e.choix.proposition, carte: window.carteRegionaleOuverte(),
             nuages: !!document.getElementById("traversee-nuages"), texte: document.getElementById("bandeau-voyage").textContent }; });
  const c = await p.evaluate(() => [window.centreRegion(window.REGIONS_CARTE[1].points), window.centreRegion(window.REGIONS_CARTE[2].points)]);
  const pts = (r.d || "").replace(/[ML]/g, " ").trim().split(/\s+/).map(Number);
  verifier("un trait droit, du groupe au centre de la région touchée", pts.length === 4 && Math.abs(pts[0] - c[0].x) < 1 && Math.abs(pts[2] - c[1].x) < 1 && Math.abs(pts[3] - c[1].y) < 1, r.d);
  verifier("pointillé, rouge", !!r.tirets && /rgb\(179, 18, 26\)/.test(r.couleur), `${r.tirets} ${r.couleur}`);
  verifier("une croix rouge à l'arrivée (dessinée une fois le trait tracé)", r.croix === `translate(${Math.round(c[1].x)} ${Math.round(c[1].y)})` && Number(r.croixVisible) > 0.9, r.croix);
  verifier("la région touchée ne s'ouvre pas (ni carte, ni nuages)", r.carte === null && !r.nuages);
  verifier("le bandeau propose : « Vers La vallée de souffre », Valider", /Vers La vallée de souffre/.test(r.texte) && /Valider le voyage/.test(r.texte), r.texte.slice(0, 60));
  await p.screenshot({ path: "/tmp/claude-0/v275_monde_trace.png" });
  await p.keyboard.press("Escape");
  const r2 = await p.evaluate(() => ({ e: window.etatVoyageGroupe().choix, d: getComputedStyle(document.getElementById("bandeau-voyage")).display,
                                      trace: document.querySelectorAll("#calque-voyage-monde .trace-voyage").length, choix: document.getElementById("calque-regions").classList.contains("choix") }));
  verifier("Échap annule : plus de mode, de bandeau ; les régions redeviennent normales", r2.e === null && r2.d === "none" && !r2.choix);
});

// =========================================================================
titre("5. LE VOTE : UNE PETITE BOÎTE EN HAUT À DROITE, CHEZ TOUS");
// =========================================================================
await section(async () => {
  await proposer(2);
  const v = (await partie()).Voyage_Groupe;
  verifier("le voyage part au vote (Voyage_Groupe en base, en transaction)", v && v.Etat === "vote" && v.Type === "monde" && v.Arrivee.Region === 2, v && v.Etat);
  verifier("votent : chaque joueur qui a un héros actif (ni illusion, ni mort)",
           v && JSON.stringify(v.Votants) === JSON.stringify([{ id: "P_01", nom: "Thorin" }, { id: "P_02", nom: "Lyra" }]), JSON.stringify(v && v.Votants));
  verifier("celui qui propose a voté oui", v && v.Votes.P_01 === "oui" && !v.Votes.P_02);
  const r = await p.evaluate(() => { const el = document.getElementById("boite-voyage"), rr = el.getBoundingClientRect();
    return { d: getComputedStyle(el).display, droite: innerWidth - rr.right, haut: rr.top, l: rr.width, texte: el.textContent,
             boutons: [...el.querySelectorAll("button")].map(b => b.textContent.trim() + (b.disabled ? "(x)" : "")),
             occupe: document.getElementById("btn-voyage").classList.contains("occupe") }; });
  verifier("la boîte : en haut à droite, petite", r.d === "block" && r.droite < 30 && r.haut < 140 && r.l <= 320, `${r.droite} ${r.haut} ${r.l}`);
  verifier("on y lit qui propose, où, et qui a voté", /Thorin propose de partir vers La vallée de souffre/.test(r.texte) && /Lyra/.test(r.texte), r.texte.slice(0, 90));
  verifier("chez Thorin : déjà d'accord ; Annuler ; Forcer (DEV)", JSON.stringify(r.boutons) === JSON.stringify(["✔ D'accord(x)", "Annuler", "Forcer le départ (DEV)"]), JSON.stringify(r.boutons));
  verifier("le bouton voyage est pris tant que le voyage n'est pas fini", r.occupe);
  await p.click("#btn-voyage");
  verifier("…et le dit si on le touche", /déjà en cours/.test(await annonce()));
  await joueur("P_02");
  await p.evaluate(() => window.dessinerVoyageGroupe());
  const b2 = await p.evaluate(() => [...document.querySelectorAll("#boite-voyage button")].map(b => b.textContent.trim()));
  verifier("chez Lyra : Partir, Refuser", b2[0] === "Partir" && b2[1] === "Refuser", JSON.stringify(b2));
});

// =========================================================================
titre("6. UN « NON » ANNULE TOUT");
// =========================================================================
await section(async () => {
  await p.click('#boite-voyage [data-action="non"]');
  await p.waitForTimeout(150);
  const d = await partie();
  verifier("le voyage est effacé, et l'on sait qui a refusé", !d.Voyage_Groupe && d.Voyage_Annule && d.Voyage_Annule.Par === "Lyra", JSON.stringify(d.Voyage_Annule));
  const r = await p.evaluate(() => ({ boite: getComputedStyle(document.getElementById("boite-voyage")).display, trace: document.querySelectorAll("#calque-voyage-monde .trace-voyage").length }));
  verifier("chez tous : « Voyage annulé : Lyra a refusé. », la boîte s'en va", /Voyage annulé : Lyra a refusé/.test(await annonce()) && r.boite === "none");
  verifier("le groupe n'a pas bougé", d.Position_Groupe.Region === 1 && d.Voyages_Effectues === 1);
});

// =========================================================================
titre("7. TOUS D'ACCORD : L'IMAGE DU GROUPE GLISSE LENTEMENT ; AUCUN JOUR NE PASSE");
// =========================================================================
await section(async () => {
  await joueur("P_01");
  await proposer(2);
  await joueur("P_02");
  await p.evaluate(() => { window.__nettoyages = []; window.__ajouts = []; });
  const t0 = Date.now();
  await p.click('#boite-voyage [data-action="oui"]');
  await p.waitForTimeout(100);
  const d = await partie();
  verifier("le dernier oui donne le départ : en marche", d.Voyage_Groupe && d.Voyage_Groupe.Etat === "marche" && d.Voyage_Groupe.Jour === 1, d.Voyage_Groupe && d.Voyage_Groupe.Etat);
  verifier("le groupe quitte son lieu ; le compteur des voyages avance", d.Lieu_Actuel === "" && d.Voyages_Effectues === 2);
  const n = await p.evaluate(() => window.__nettoyages);
  verifier("le chat est nettoyé au départ (cimetière : pas ce voyage-ci)", n.length === 1 && n[0].cimetiere === false, JSON.stringify(n));
  const c1 = await ecranMonde(1), c2 = await ecranMonde(2);
  const xs = [];
  for (let i = 0; i < 4; i++) { await p.waitForTimeout(1100); xs.push((await centre("pion-groupe-monde")).x); }
  verifier("l'image glisse vers l'est, pas à pas", xs.every((x, i) => i === 0 || x > xs[i - 1] + 1) && xs[0] > c1.x && xs[3] < c2.x + 1, xs.map(x => x.toFixed(0)).join(" → "));
  await p.screenshot({ path: "/tmp/claude-0/v275_monde_marche.png" });
  for (let i = 0; i < 80 && (await partie()).Voyage_Groupe; i++) await p.waitForTimeout(150);
  const duree = Date.now() - t0;
  const f = await partie();
  verifier("lentement : plusieurs secondes de route", duree > 3500, `${duree} ms`);
  verifier("à l'arrivée : le groupe est dans la région 2, le voyage est fini", !f.Voyage_Groupe && f.Position_Groupe && f.Position_Groupe.Region === 2 && f.Voyage_Termine, JSON.stringify(f.Position_Groupe));
  const pion = await centre("pion-groupe-monde");
  verifier("l'image est au centre de la boîte de la région 2", Math.abs(pion.x - c2.x) < 1.5 && Math.abs(pion.y - c2.y) < 1.5);
  const date = await p.evaluate(() => window.__docs["Date_En_Jeu/actuelle"]);
  verifier("un changement de région ne compte aucun jour ; pas de campement", date.Jour === "12" && (await p.evaluate(() => (window.__ajouts || []).length)) === 0, date.Jour);
  // Le bord du terrain, du côté d'où l'on vient (la région 1 est à l'ouest).
  const pos = f.Position_Groupe;
  verifier("il apparaît au bord ouest du terrain praticable de la carte 2 (d'où il vient)", pos.x > 0.15 && pos.x < 0.2 && pos.y > 0.3 && pos.y < 0.7, JSON.stringify(pos));
});

// =========================================================================
titre("8. EN CHANGEANT DE RÉGION : AU BORD DU TERRAIN, DANS LA DIRECTION D'OÙ L'ON VIENT");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => ({
    est: window.pointArriveeRegion(2, { dx: 1, dy: 0 }), nord: window.pointArriveeRegion(2, { dx: 0, dy: -1 }),
    diag: window.pointArriveeRegion(2, { dx: -1, dy: 1 }), sansTerrain: window.pointArriveeRegion(3, { dx: 1, dy: 0 }),
    dedans: [window.pointArriveeRegion(2, { dx: 1, dy: 0 }), window.pointArriveeRegion(2, { dx: 0, dy: -1 }), window.pointArriveeRegion(2, { dx: -1, dy: 1 })]
      .every(q => window.pointSurTerrainRegion(2, q.x, q.y)) }));
  verifier("venant de l'est : au bord est", r.est.x > 0.8 && r.est.x < 0.85 && Math.abs(r.est.y - 0.5) < 0.01, JSON.stringify(r.est));
  verifier("venant du nord : au bord nord", r.nord.y > 0.2 && r.nord.y < 0.25 && Math.abs(r.nord.x - 0.5) < 0.01, JSON.stringify(r.nord));
  verifier("venant du sud-ouest : vers ce coin-là", r.diag.x < 0.5 && r.diag.y > 0.5, JSON.stringify(r.diag));
  verifier("toujours SUR le terrain (un peu en dedans du bord)", r.dedans);
  verifier("une carte sans terrain tracé : le bord de la carte, un peu en dedans", r.sansTerrain.x > 0.9 && r.sansTerrain.x < 0.95, JSON.stringify(r.sansTerrain));
  // Une forme creuse (un U) : le point retombe sur le terrain.
  const u = await p.evaluate(() => {
    window.appliquerCartesRegionalesDeLaBase([{ id: "2", data: window.__docs["Cartes_Regionales/2"] },
      { id: "5", data: { Numero: 5, Aspect: 1, Terrains: { 1: { Numero: 1, Points: [{x:.1,y:.1},{x:.3,y:.1},{x:.3,y:.7},{x:.7,y:.7},{x:.7,y:.1},{x:.9,y:.1},{x:.9,y:.9},{x:.1,y:.9}] } } } }]);
    const q = window.pointArriveeRegion(5, { dx: 0, dy: -1 });
    return { q, dedans: window.pointSurTerrainRegion(5, q.x, q.y) };
  });
  verifier("un terrain en U : l'apparition reste sur le terrain", u.dedans, JSON.stringify(u.q));
});

// =========================================================================
titre("9. LES TERRAINS PRATICABLES (DEV) : LES BOÎTES RÉGIONALES");
// =========================================================================
await section(async () => {
  await p.evaluate(async () => { await window.ouvrirCarteRegionale(2, { sansTransition: true }); window.basculerPopupRegions(true); });
  await p.waitForTimeout(300);
  const r0 = await p.evaluate(() => ({ section: !!document.querySelector("#regions-dev-carte #regions-dev-terrains #case-terrains-visibles"),
    svg: getComputedStyle(document.getElementById("carte-region-terrains")).display, total: document.getElementById("terrains-dev-total").textContent }));
  verifier("une ancre « Terrains praticables » dans la popup rouge de la carte régionale", r0.section, r0.total);
  verifier("hors édition, les terrains sont invisibles", r0.svg === "none");
  await p.click("#case-terrains-visibles");
  const r1 = await p.evaluate(() => ({ svg: getComputedStyle(document.getElementById("carte-region-terrains")).display, n: document.querySelectorAll("#carte-region-terrains .terrain").length }));
  verifier("« Afficher les terrains » : le terrain de la carte se voit (vert)", r1.svg === "block" && r1.n === 1);
  await p.screenshot({ path: "/tmp/claude-0/v275_terrains.png" });
  await p.evaluate(() => { window.__ecrits = []; window.__majs = []; });
  await p.click("#btn-terrain-nouveau");
  await p.waitForTimeout(100);
  const e1 = await p.evaluate(() => window.__ecrits.filter(x => x.chemin === "Cartes_Regionales/2").map(x => x.data));
  const t2 = e1.length && e1[0].Terrains && e1[0].Terrains[2];
  verifier("« + Nouveau terrain » : un rectangle n° 2, enregistré dans la fiche de la carte", !!t2 && t2.Numero === 2 && t2.Points.length === 4 && e1[0].Aspect === 1.6,
           JSON.stringify(e1[0] && Object.keys(e1[0])));
  // Le coin haut gauche, tiré de 60 px.
  const coin = await p.evaluate(() => { const r = document.querySelector('#carte-region-terrains .terrain[data-numero="2"] [data-role="point"][data-index="0"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.move(coin.x, coin.y); await p.mouse.down(); await p.mouse.move(coin.x - 30, coin.y - 30, { steps: 3 }); await p.mouse.move(coin.x - 60, coin.y - 60, { steps: 3 }); await p.mouse.up();
  await p.waitForTimeout(100);
  const apres = await p.evaluate(() => window.terrainsRegion(2).find(t => t.numero === 2).points[0]);
  const avant = t2.Points[0];
  const zoom = await p.evaluate(() => window.cadrageCarteRegion().zoom);
  verifier("un coin se tire (et la carte ne glisse pas)", Math.abs((avant.x - apres.x) * 2400 * zoom - 60) < 3 && Math.abs((avant.y - apres.y) * 1500 * zoom - 60) < 3, `${JSON.stringify(avant)} → ${JSON.stringify(apres)}`);
  // Un clic sur un bord : un point de plus ; double-clic sur un point : il s'en va.
  const bord = await p.evaluate(() => { const l = document.querySelector('#carte-region-terrains .terrain[data-numero="2"] [data-role="bord"][data-index="1"]');
    const a = l.getBoundingClientRect(); return { x: a.left + a.width / 2, y: a.top + a.height / 2 }; });
  await p.mouse.click(bord.x, bord.y);
  const n5 = await p.evaluate(() => window.terrainsRegion(2).find(t => t.numero === 2).points.length);
  const pt = await p.evaluate(() => { const r = document.querySelector('#carte-region-terrains .terrain[data-numero="2"] [data-role="point"][data-index="2"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.dblclick(pt.x, pt.y);
  await p.waitForTimeout(100);
  const n4 = await p.evaluate(() => window.terrainsRegion(2).find(t => t.numero === 2).points.length);
  verifier("un clic sur un bord ajoute un point ; un double-clic le retire", n5 === 5 && n4 === 4, `${n5} / ${n4}`);
  const derniere = await p.evaluate(() => window.__ecrits.filter(x => x.chemin === "Cartes_Regionales/2").pop().data.Terrains[2].Points.length);
  verifier("chaque geste s'enregistre", derniere === 4);
  await p.click("#btn-terrain-supprimer");
  await p.waitForTimeout(100);
  const m = await p.evaluate(() => window.__majs.filter(x => x.chemin === "Cartes_Regionales/2").map(x => x.data));
  const restants = await p.evaluate(() => window.terrainsRegion(2).length);
  verifier("« Supprimer ce terrain » : il s'efface de la fiche", m.some(x => x["Terrains.2"] === "<supprimé>") && restants === 1, JSON.stringify(m));
  await p.evaluate(() => window.choisirOutilRegion("pinceau"));
  const r3 = await p.evaluate(() => ({ e: window.editionTerrainsRegion(), svg: getComputedStyle(document.getElementById("carte-region-terrains")).display }));
  verifier("prendre le pinceau range les terrains (un seul outil à la fois)", !r3.e && r3.svg === "none");
  await p.evaluate(() => { window.choisirOutilRegion("pinceau"); window.basculerPopupRegions(false); });
});

// =========================================================================
titre("10. LE MODE VOYAGE SUR LA CARTE RÉGIONALE : DES ROUTES COMPLIQUÉES, SUR LE TERRAIN");
// =========================================================================
let propRegion = null;
await section(async () => {
  await ecrirePartie({ Position_Groupe: { Region: 2, x: 0.25, y: 0.6 } });
  const marqueur = await p.evaluate(() => { const el = document.getElementById("pion-groupe-region"), c = window.cadrageCarteRegion(), r = el.getBoundingClientRect();
    return { src: el.src, d: getComputedStyle(el).display, x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.width, attendu: 0.07 * c.hauteur * c.zoom }; });
  const ici = await ecranRegion(0.25, 0.6);
  verifier("le marqueur du groupe sur la carte régionale (l'image de Nico), à sa place", marqueur.src === "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1792842655/41915054-FA63-4BFF-AEB0-6D95E07E47AA_xtlhvg.png" && marqueur.d === "block"
           && Math.abs(marqueur.x - ici.x) < 1.5 && Math.abs(marqueur.y - ici.y) < 1.5, `${marqueur.x.toFixed(1)} / ${ici.x.toFixed(1)}`);
  verifier("sa taille : 7 % de la hauteur de la carte", Math.abs(marqueur.l - marqueur.attendu) < 1, `${marqueur.l.toFixed(1)} / ${marqueur.attendu.toFixed(1)}`);
  await p.click("#btn-voyage");
  const dehors = await ecranRegion(0.5, 0.9);
  await p.mouse.click(dehors.x, dehors.y);
  await p.waitForTimeout(100);
  const r0 = await etat();
  verifier("hors du terrain praticable : refusé, « Terrain impraticable »", /Terrain impraticable/.test(await annonce()) && r0.choix && !r0.choix.proposition);
  await p.evaluate(() => window.graineHasardVoyage(275));
  const vise = await ecranRegion(0.8, 0.3);
  await p.mouse.click(vise.x, vise.y);
  await p.waitForTimeout(2100);
  propRegion = (await etat()).choix.proposition;
  const t = propRegion.trace;
  const g = await p.evaluate((t) => {
    const A = t[0], B = t[t.length - 1], asp = 1.6;
    let ecart = 0; t.forEach(q => { const dx = (B.x - A.x) * asp, dy = B.y - A.y, l = Math.hypot(dx, dy); ecart = Math.max(ecart, Math.abs(((q.x - A.x) * asp) * dy - (q.y - A.y) * dx) / l); });
    let virages = 0; for (let i = 2; i < t.length; i++) { const a = Math.atan2(t[i-1].y - t[i-2].y, (t[i-1].x - t[i-2].x) * asp), b = Math.atan2(t[i].y - t[i-1].y, (t[i].x - t[i-1].x) * asp); if (Math.abs(b - a) > 0.02) virages++; }
    return { ecart, virages, surTerrain: t.every(q => window.pointSurTerrainRegion(2, q.x, q.y)) };
  }, t);
  verifier("le pointillé part du groupe et arrive au point touché", Math.abs(t[0].x - 0.25) < 1e-3 && Math.abs(t[0].y - 0.6) < 1e-3
           && Math.abs(t[t.length - 1].x - 0.8) < 0.01 && Math.abs(t[t.length - 1].y - 0.3) < 0.01, JSON.stringify([t[0], t[t.length - 1]]));
  verifier("une route compliquée : des courbes, loin de la ligne droite", t.length >= 60 && g.ecart > 0.02 && g.virages > 20, `écart ${g.ecart.toFixed(3)}, ${g.virages} virages`);
  verifier("elle reste sur le terrain praticable", g.surTerrain);
  // (v276 : la journée est passée de 45 % à 30 % de la hauteur de la carte.)
  const distanceJour = await p.evaluate(() => window.DISTANCE_JOUR_VOYAGE || 0.45);
  const jours = Math.max(1, Math.ceil(propRegion.longueur / distanceJour - 0.1));
  verifier("la marche se compte en jours (une journée = une part de la hauteur de la carte)", propRegion.jours === jours && jours >= 2, `${propRegion.longueur} → ${propRegion.jours} j`);
  const r = await p.evaluate(() => ({ texte: document.getElementById("bandeau-voyage").textContent, d: document.querySelector("#carte-region-voyage .trace-voyage") && document.querySelector("#carte-region-voyage .trace-voyage").getAttribute("d"),
                                      croix: !!document.querySelector("#carte-region-voyage .croix-voyage") }));
  verifier("dessiné sur la carte (pointillé, croix) ; le bandeau dit les jours", !!r.d && r.croix && new RegExp(`≈ ${jours} jours de marche`).test(r.texte), r.texte.slice(0, 70));
  await p.screenshot({ path: "/tmp/claude-0/v275_region_trace.png" });
  // Au hasard : un autre tirage, une autre route.
  const autre = await p.evaluate(() => { window.graineHasardVoyage(9); const c = window.genererCheminVoyage(2, { x: 0.25, y: 0.6 }, { x: 0.8, y: 0.3 }); window.graineHasardVoyage(null); return c.trace; });
  verifier("chaque tracé est tiré au hasard", JSON.stringify(autre) !== JSON.stringify(t));
  // Un village touché : la destination exacte.
  const v = await ecranRegion(0.715, 0.67);
  await p.mouse.click(v.x, v.y);
  await p.waitForTimeout(200);
  const pv = (await etat()).choix.proposition;
  verifier("un village touché : sa place exacte, et son lieu", pv.arrivee.Lieu === "L_00042_Brumefosse" && pv.arrivee.x === 0.7 && pv.arrivee.y === 0.66 && pv.arrivee.Nom === "Brumefosse",
           JSON.stringify(pv.arrivee));
  await p.mouse.click(vise.x, vise.y);
  await p.waitForTimeout(200);
  propRegion = (await etat()).choix.proposition;
});

// =========================================================================
titre("11. LA MARCHE : « JOUR 1 », LES NUITS, REPARTIR OU RESTER (TOUS D'ACCORD)");
// =========================================================================
await section(async () => {
  await joueur("P_01");
  await p.click('#bandeau-voyage [data-action="valider"]');
  await p.waitForTimeout(150);
  await joueur("P_02");
  await p.evaluate(() => { window.__nettoyages = []; window.__ajouts = []; });
  await p.click('#boite-voyage [data-action="oui"]');
  await p.waitForTimeout(400);
  const r0 = await p.evaluate(() => { const a = document.getElementById("annonce-jour-voyage"); return { visible: a && a.classList.contains("visible"), texte: a && a.textContent.trim() }; });
  verifier("« JOUR 1 » au départ, en grand", r0.visible && r0.texte === "JOUR 1", r0.texte);
  await p.screenshot({ path: "/tmp/claude-0/v275_jour1.png" });
  const v = (await partie()).Voyage_Groupe;
  verifier("en marche, jour 1 sur " + (v && v.Jours), v && v.Etat === "marche" && v.Jour === 1 && v.Jours >= 2);
  // Le marqueur suit la route.
  await p.waitForTimeout(3600);
  // (Sa place sur la carte ; l'image, elle, se balance un peu en marchant.)
  const suit = await p.evaluate(() => { const e = window.etatVoyageGroupe(), q = window.pointDuVoyageGroupe(e.anim.f), c = window.cadrageCarteRegion();
    const el = document.getElementById("pion-groupe-region");
    return { f: e.anim.f, dx: parseFloat(el.style.left) - q.x * c.largeur, dy: parseFloat(el.style.top) - q.y * c.hauteur, marche: el.classList.contains("en-marche") }; });
  verifier("le marqueur avance sur le pointillé (et marche)", suit.f > 0.02 && suit.f < v.Etapes[0] && Math.abs(suit.dx) < 0.5 && Math.abs(suit.dy) < 0.5 && suit.marche, JSON.stringify(suit));
  await p.screenshot({ path: "/tmp/claude-0/v275_region_marche.png" });
  for (let i = 0; i < 80 && (await partie()).Voyage_Groupe.Etat === "marche"; i++) await p.waitForTimeout(150);
  const d = await partie();
  const camp = await p.evaluate(() => window.pointDuVoyageGroupe(window.etatVoyageGroupe().voyage.Etapes[0]));
  verifier("la nuit tombe : le groupe s'arrête le long de sa route (le camp)", d.Voyage_Groupe.Etat === "nuit" && Math.abs(d.Voyage_Groupe.Camp.x - camp.x) < 1e-3
           && d.Position_Groupe.x === d.Voyage_Groupe.Camp.x && d.Position_Groupe.y === d.Voyage_Groupe.Camp.y, JSON.stringify(d.Voyage_Groupe.Camp));
  const msg = await p.evaluate(() => (window.__ajouts || []).filter(a => a.col === "Messages_Chat"));
  verifier("le Destin pose le message du campement (le texte de Nico)", msg.length === 1 && msg[0].data.Auteur_ID === "DESTIN" && msg[0].data.Auteur_Nom === "Destin"
           && msg[0].data.Texte.startsWith(CAMPEMENT) && /La soirée vous appartient\. Que souhaitez-vous faire \?$/.test(msg[0].data.Texte) && msg[0].data.ID_Partie === "P1", msg.length);
  const r1 = await p.evaluate(() => ({ voile: document.getElementById("voile-nuit-voyage").classList.contains("visible"), camp: document.getElementById("pion-groupe-region").classList.contains("campement"),
    texte: document.getElementById("boite-voyage").textContent, boutons: [...document.querySelectorAll("#boite-voyage button")].map(b => b.textContent.trim()) }));
  verifier("la nuit sur la carte, le feu du campement sous le groupe", r1.voile && r1.camp);
  verifier("chez tous : « Nuit 1 », Repartir / Rester ici", /Nuit 1 au campement/.test(r1.texte) && r1.boutons.includes("Repartir") && r1.boutons.includes("Rester ici"), JSON.stringify(r1.boutons));
  await p.screenshot({ path: "/tmp/claude-0/v275_nuit.png" });
  verifier("la date n'a pas encore bougé (la nuit n'est pas finie)", (await p.evaluate(() => window.__docs["Date_En_Jeu/actuelle"].Jour)) === "12");
  // Pas d'accord : rien ne bouge.
  await joueur("P_01");
  await p.click('#boite-voyage [data-action="repartir"]');
  await joueur("P_02");
  await p.click('#boite-voyage [data-action="rester"]');
  await p.waitForTimeout(150);
  const d2 = await partie();
  const t2 = await p.evaluate(() => document.getElementById("boite-voyage").textContent);
  verifier("Thorin repart, Lyra reste : rien ne se passe", d2.Voyage_Groupe.Etat === "nuit" && d2.Voyage_Groupe.Choix_Nuit.P_01 === "repartir" && d2.Voyage_Groupe.Choix_Nuit.P_02 === "rester"
           && /Pas d'accord/.test(t2));
  await p.click('#boite-voyage [data-action="repartir"]');
  await p.waitForTimeout(300);
  const d3 = await partie();
  const r3 = await p.evaluate(() => { const a = document.getElementById("annonce-jour-voyage"); return { texte: a.textContent.trim(), visible: a.classList.contains("visible"), n: window.__nettoyages }; });
  verifier("tous repartent : jour 2, « JOUR 2 »", d3.Voyage_Groupe.Etat === "marche" && d3.Voyage_Groupe.Jour === 2 && r3.visible && r3.texte === "JOUR 2", r3.texte);
  verifier("la nuit passée : la date avance d'un jour (13)", (await p.evaluate(() => window.__docs["Date_En_Jeu/actuelle"].Jour)) === "13");
  verifier("le chat est nettoyé à la reprise (pas de cimetière)", r3.n.length === 2 && r3.n[1].cimetiere === false, JSON.stringify(r3.n));
  // Fin du jour 2 : on reste ici.
  await p.evaluate(() => window.finirMarcheVoyage());
  await p.waitForTimeout(150);
  const d4 = await partie();
  if (d4.Voyage_Groupe && d4.Voyage_Groupe.Etat === "nuit") {
    await joueur("P_01"); await p.click('#boite-voyage [data-action="rester"]');
    await joueur("P_02"); await p.click('#boite-voyage [data-action="rester"]');
    await p.waitForTimeout(150);
    const d5 = await partie();
    verifier("tous restent : le voyage s'arrête au campement (la nouvelle place du groupe)", !d5.Voyage_Groupe && d5.Position_Groupe.x === d4.Voyage_Groupe.Camp.x
             && d5.Position_Groupe.y === d4.Voyage_Groupe.Camp.y && d5.Lieu_Actuel === "", JSON.stringify(d5.Position_Groupe));
    verifier("…et la nuit compte (14)", (await p.evaluate(() => window.__docs["Date_En_Jeu/actuelle"].Jour)) === "14");
  } else verifier("(la route de ce tirage devait durer plus de deux jours)", false, JSON.stringify(d4.Voyage_Groupe && d4.Voyage_Groupe.Jours));
});

// =========================================================================
titre("12. JUSQU'AU VILLAGE : LE LIEU_ACTUEL À L'ARRIVÉE ; LE DEV FORCE");
// =========================================================================
await section(async () => {
  await ecrirePartie({ Position_Groupe: { Region: 2, x: 0.55, y: 0.62 } });
  await joueur("P_01");
  await p.click("#btn-voyage");
  const v = await ecranRegion(0.7, 0.66);
  await p.mouse.click(v.x, v.y);
  await p.waitForTimeout(150);
  await p.click('#bandeau-voyage [data-action="valider"]');
  await p.waitForTimeout(150);
  await p.click('#boite-voyage [data-action="forcer"]');
  await p.waitForTimeout(150);
  const d = await partie();
  verifier("« Forcer le départ (DEV) » : en marche sans attendre Lyra", d.Voyage_Groupe && d.Voyage_Groupe.Etat === "marche" && d.Voyage_Groupe.Jours === 1);
  await p.evaluate(() => window.finirMarcheVoyage());
  await p.waitForTimeout(150);
  const f = await partie();
  verifier("arrivé au village : sa place exacte, et Lieu_Actuel = le village", !f.Voyage_Groupe && f.Position_Groupe.x === 0.7 && f.Position_Groupe.y === 0.66 && f.Lieu_Actuel === "L_00042_Brumefosse",
           JSON.stringify([f.Position_Groupe, f.Lieu_Actuel]));
  verifier("un voyage d'un jour : pas de nuit, la date ne bouge pas", (await p.evaluate(() => window.__docs["Date_En_Jeu/actuelle"].Jour)) === "14");
});

// =========================================================================
titre("13. CHACUN EST AMENÉ SUR LA CARTE DU VOYAGE, CENTRÉ SUR LE TRAJET");
// =========================================================================
await section(async () => {
  await p.evaluate(async () => { await window.fermerCarteRegionale({ sansTransition: true }); window.recadrerCarte(); });
  await p.waitForTimeout(200);
  // Lyra propose, sur la carte 2, pendant que Thorin regarde le monde.
  await ecrirePartie({ Voyage_Groupe: { Id: "Vlyra1", Type: "region", Etat: "vote", Initiateur: { id: "P_02", nom: "Lyra" },
    Votants: [{ id: "P_01", nom: "Thorin" }, { id: "P_02", nom: "Lyra" }], Votes: { P_02: "oui" },
    Depart: { Region: 2, x: 0.2, y: 0.66 }, Arrivee: { Region: 2, x: 0.5, y: 0.3, Lieu: null, Nom: "" },
    Trace: [{ x: 0.2, y: 0.66 }, { x: 0.35, y: 0.5 }, { x: 0.5, y: 0.3 }], Aspect: 1.6, Longueur: 0.8, Jours: 2, Etapes: [0.5, 1], Jour: 1, Cree_Le: Date.now() } });
  for (let i = 0; i < 40 && !(await p.evaluate(() => window.carteRegionaleOuverte() === 2 && !window.TRAVERSEE_EN_COURS)); i++) await p.waitForTimeout(150);
  await p.waitForTimeout(1600);
  // (Centrée sur ce qu'on voit à gauche de la boîte de vote.)
  const r = await p.evaluate(() => { const c = window.cadrageCarteRegion(), e = document.getElementById("ecran-jeu").getBoundingClientRect();
    const boite = document.getElementById("boite-voyage").getBoundingClientRect();
    return { carte: window.carteRegionaleOuverte(), x: c.panX + 0.35 * c.largeur * c.zoom - (boite.left - 10) / 2, texte: document.getElementById("boite-voyage").textContent,
             auBord: Math.abs(c.panX - (e.width - c.largeur * c.zoom)) < 1 }; });
  verifier("la carte régionale du voyage s'ouvre chez Thorin", r.carte === 2);
  verifier("centrée sur le trajet, à gauche de la boîte de vote (autant que la carte le permet)", Math.abs(r.x) < 5 || (r.x > 0 && r.auBord), `${r.x.toFixed(1)} ${r.auBord ? "(carte au bord)" : ""}`);
  verifier("Thorin a la boîte de vote : « Lyra propose… »", /Lyra propose de partir/.test(r.texte));
  await joueur("P_01");
  await p.click('#boite-voyage [data-action="non"]');
  await p.waitForTimeout(150);
  // Un voyage du monde pendant qu'on regarde une carte régionale : retour au monde.
  await ecrirePartie({ Voyage_Annule: null, Voyage_Groupe: { Id: "Vlyra2", Type: "monde", Etat: "vote", Initiateur: { id: "P_02", nom: "Lyra" },
    Votants: [{ id: "P_01", nom: "Thorin" }, { id: "P_02", nom: "Lyra" }], Votes: { P_02: "oui" },
    Depart: { Region: 1 }, Arrivee: { Region: 4, Nom: "Volcanisse", Lieu: null }, Trace: [{ x: 1150, y: 850 }, { x: 1900, y: 1450 }], Aspect: 1, Longueur: 960, Jours: 0, Etapes: [1], Jour: 1, Cree_Le: Date.now() } });
  for (let i = 0; i < 40 && (await p.evaluate(() => window.carteRegionaleOuverte() !== null || window.TRAVERSEE_EN_COURS)); i++) await p.waitForTimeout(150);
  await p.waitForTimeout(1600);
  const r2 = await p.evaluate(() => ({ carte: window.carteRegionaleOuverte(), c: window.cadrageCarteMonde(), boite: document.getElementById("boite-voyage").getBoundingClientRect().left,
                                      min: window.bornesCarteMonde(innerWidth, window.hauteurDalle ? window.hauteurDalle() : innerHeight).min }));
  const milieu = (1150 + 1900) / 2 * r2.c.zoom + r2.c.panX - (r2.boite - 10) / 2;
  verifier("un voyage du monde ramène sur la carte du monde, centrée sur le trajet", r2.carte === null && (Math.abs(milieu) < 5 || (milieu > 0 && Math.abs(r2.c.panX - r2.min) < 1)),
           `${milieu.toFixed(1)} ${Math.abs(r2.c.panX - r2.min) < 1 ? "(carte au bord)" : ""}`);
  await p.click('#boite-voyage [data-action="non"]');
  await p.waitForTimeout(150);
});

// =========================================================================
titre("14. LE CHAT DU VOYAGE : SANS UN MOT DES JOUEURS, PAS D'IA ; LE CIMETIÈRE TOUS LES 4 VOYAGES");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => {
    const vrai = window.__vraiNettoyage;
    const appels = { archive: [], cimetiere: 0 };
    const archive = window.processusArchivageChat, cimetiere = window.incinererPnjMorts;
    // L'archivage (la chronique, les souvenirs) est simulé : il efface le chat, comme le vrai.
    window.processusArchivageChat = async (o) => { appels.archive.push({ lieu: o && o.lieu, cimetiere: o && o.cimetiere, n: o && o.messages && o.messages.length });
      (o.messages || []).forEach(m => { delete window.__docs["Messages_Chat/" + m.id]; }); return true; };
    window.incinererPnjMorts = async () => { appels.cimetiere++; return true; };
    const mettre = (id, auteur, t) => { window.__docs["Messages_Chat/" + id] = { ID_Partie: "P1", Auteur_ID: auteur, Texte: "…", Timestamp: t }; };
    // 1. La nuit : seulement le Destin (le campement) et le Maître du Temps.
    mettre("a", "DESTIN", 1); mettre("b", "SYSTEME_TEMPS", 2);
    window.__docs["Messages_Chat/autre"] = { ID_Partie: "P9", Auteur_ID: "H9", Texte: "ailleurs", Timestamp: 3 };
    await vrai({ cimetiere: false });
    const r1 = { archive: appels.archive.length, restants: Object.keys(window.__docs).filter(k => k.startsWith("Messages_Chat/")) };
    // 2. Un joueur a écrit : l'archivage (la chronique, les souvenirs du lieu quitté).
    mettre("c", "DESTIN", 4); mettre("d", "H1", 5);
    await vrai({ lieu: "L_00042_Brumefosse", cimetiere: true });
    const r2 = JSON.parse(JSON.stringify(appels.archive));
    // 3. Rien d'écrit, mais c'est le 4e voyage : le cimetière, sans IA.
    appels.archive = []; mettre("e", "DESTIN", 6);
    await vrai({ cimetiere: true });
    window.processusArchivageChat = archive; window.incinererPnjMorts = cimetiere;
    return { r1, r2, r3: { archive: appels.archive.length, cimetiere: appels.cimetiere, restants: Object.keys(window.__docs).filter(k => k.startsWith("Messages_Chat/")) } };
  });
  verifier("rien d'écrit par les joueurs : pas d'IA, les messages de la partie sont effacés", r.r1.archive === 0 && JSON.stringify(r.r1.restants) === JSON.stringify(["Messages_Chat/autre"]),
           JSON.stringify(r.r1));
  verifier("un joueur a écrit : l'archivage, avec le lieu quitté et le cimetière demandé", r.r2.length === 1 && r.r2[0].lieu === "L_00042_Brumefosse" && r.r2[0].cimetiere === true && r.r2[0].n === 2,
           JSON.stringify(r.r2));
  verifier("le cimetière, même sans IA, quand c'est son tour", r.r3.archive === 0 && r.r3.cimetiere === 1);
  // Le compteur : le 4e voyage brûle le cimetière, pas le 5e.
  await p.evaluate(() => { window.__nettoyages = []; });
  await ecrirePartie({ Voyage_Groupe: null, Voyage_Annule: null, Voyages_Effectues: 3, Position_Groupe: { Region: 2, x: 0.5, y: 0.5 } });
  await joueur("P_01");
  await proposer(1);
  await p.click('#boite-voyage [data-action="forcer"]');
  await p.waitForTimeout(150);
  await p.evaluate(() => window.finirMarcheVoyage());
  await p.waitForTimeout(150);
  await proposer(2);
  await p.click('#boite-voyage [data-action="forcer"]');
  await p.waitForTimeout(150);
  await p.evaluate(() => window.finirMarcheVoyage());
  await p.waitForTimeout(150);
  const n = await p.evaluate(() => window.__nettoyages.map(o => o.cimetiere));
  verifier("le cimetière tous les 4 voyages (4e : oui ; 5e : non)", JSON.stringify(n) === "[true,false]", JSON.stringify(n));
  const ia = lire('ia_master.js');
  verifier("le bouton « archiver » garde son cimetière (par défaut)", /opts\.cimetiere !== false/.test(ia));
});

// =========================================================================
titre("15. LE BOUTON DEV ROUGE : LES TAILLES DU GROUPE ET LE TÉLÉPORT");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.basculerPopupRegions(true); window.__ecrits = []; });
  const r0 = await p.evaluate(() => ({ monde: !!document.querySelector("#regions-dev-monde #taille-groupe-monde") && !!document.querySelector("#regions-dev-monde #btn-groupe-teleport-monde"),
                                      region: !!document.querySelector("#regions-dev-carte #taille-groupe-region") && !!document.querySelector("#regions-dev-carte #btn-groupe-teleport-region") }));
  verifier("une taille et un téléport, sur le monde comme sur la carte régionale", r0.monde && r0.region);
  const l0 = (await centre("pion-groupe-monde")).l;
  await p.evaluate(() => { const i = document.getElementById("taille-groupe-monde"); i.value = "300"; i.dispatchEvent(new Event("input")); i.dispatchEvent(new Event("change")); });
  await p.waitForTimeout(100);
  const l1 = (await centre("pion-groupe-monde")).l;
  const e = await p.evaluate(() => window.__ecrits.filter(x => x.chemin === "Carte_Monde/Groupe").map(x => x.data));
  verifier("la taille du monde change l'image (×2) et s'enregistre pour toutes les parties", Math.abs(l1 / l0 - 2) < 0.02 && e.length && e[e.length - 1].Taille_Monde === 300,
           `${l0.toFixed(1)} → ${l1.toFixed(1)} ${JSON.stringify(e)}`);
  await p.evaluate(() => window.appliquerReglagesGroupeDeLaBase({ Taille_Monde: 200, Taille_Region: 0.1 }));
  const l2 = (await centre("pion-groupe-monde")).l, z = await p.evaluate(() => window.cadrageCarteMonde().zoom);
  verifier("un autre poste l'a changée : on suit la base", Math.abs(l2 - 200 * z) < 1);
  // Le téléport du monde.
  await p.click("#btn-groupe-teleport-monde");
  const b = await p.evaluate(() => document.getElementById("bandeau-voyage").textContent);
  verifier("« Déplacer le groupe » : touchez une région", /Téléport du groupe/.test(b) && /Touchez une région/.test(b));
  const c4 = await ecranMonde(4);
  await p.mouse.click(c4.x, c4.y);
  await p.waitForTimeout(150);
  const d = await partie();
  const pion = await centre("pion-groupe-monde");
  verifier("un clic sur une région : le groupe y est, en base", d.Position_Groupe.Region === 4 && d.Lieu_Actuel === "" && Math.abs(pion.x - c4.x) < 1.5, JSON.stringify(d.Position_Groupe));
  // Le téléport sur une carte régionale : un village.
  await p.evaluate(async () => { await window.ouvrirCarteRegionale(2, { sansTransition: true }); window.basculerPopupRegions(true); });
  await p.waitForTimeout(200);
  await p.click("#btn-groupe-teleport-region");
  const v = await ecranRegion(0.7, 0.66);
  await p.mouse.click(v.x, v.y);
  await p.waitForTimeout(150);
  const d2 = await partie();
  verifier("sur la carte régionale, un village : le groupe y est (Lieu_Actuel)", d2.Position_Groupe.Region === 2 && d2.Position_Groupe.x === 0.7 && d2.Lieu_Actuel === "L_00042_Brumefosse",
           JSON.stringify([d2.Position_Groupe, d2.Lieu_Actuel]));
  const m = await p.evaluate(() => { const r = document.getElementById("pion-groupe-region").getBoundingClientRect(), c = window.cadrageCarteRegion(); return { l: r.width, attendu: 0.1 * c.hauteur * c.zoom }; });
  verifier("la taille régionale suit la base (10 % de la hauteur)", Math.abs(m.l - m.attendu) < 1, `${m.l.toFixed(1)} / ${m.attendu.toFixed(1)}`);
  await p.click("#btn-groupe-teleport-region");
  const pt = await ecranRegion(0.4, 0.4);
  await p.mouse.click(pt.x, pt.y);
  await p.waitForTimeout(150);
  const d3 = await partie();
  verifier("…ou un point : le groupe y est, hors du village", Math.abs(d3.Position_Groupe.x - 0.4) < 0.002 && Math.abs(d3.Position_Groupe.y - 0.4) < 0.002 && d3.Lieu_Actuel === "");
  await p.evaluate(() => { localStorage.removeItem("ivalis_DEV_MODE"); window.actualiserRegionsDev(); });
  const refus = await p.evaluate(() => ({ t: window.basculerTeleportGroupe(true), s: window.reglerTailleGroupe("monde", 500) }));
  verifier("hors DEV : ni téléport, ni taille", refus.t === false && refus.s === null);
  await p.evaluate(() => { localStorage.setItem("ivalis_DEV_MODE", "on"); window.actualiserRegionsDev(); window.basculerPopupRegions(false); });
});

// =========================================================================
titre("16. UN VOYAGE LAISSÉ EN MARCHE (TOUS LES POSTES FERMÉS) : IL S'ACHÈVE AU RETOUR");
// =========================================================================
await section(async () => {
  await ecrirePartie({ Voyage_Groupe: { Id: "Vvieux", Type: "region", Etat: "marche", Initiateur: { id: "P_01", nom: "Thorin" },
    Votants: [{ id: "P_01", nom: "Thorin" }, { id: "P_02", nom: "Lyra" }], Votes: { P_01: "oui", P_02: "oui" },
    Depart: { Region: 2, x: 0.4, y: 0.4 }, Arrivee: { Region: 2, x: 0.6, y: 0.5, Lieu: null, Nom: "" },
    Trace: [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.5 }], Aspect: 1.6, Longueur: 0.33, Jours: 1, Etapes: [1], Jour: 1,
    Debut_Marche: Date.now() - 3600000, Duree_Marche_Ms: 6000, Delai_Depart_Ms: 1900, Cree_Le: Date.now() - 3600000 } });
  await p.waitForTimeout(900);
  const d = await partie();
  verifier("il se termine aussitôt (sans rejouer la marche)", !d.Voyage_Groupe && d.Position_Groupe.x === 0.6 && d.Position_Groupe.y === 0.5, JSON.stringify(d.Position_Groupe));
});

// =========================================================================
titre("17. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json') || "{}").version;
  verifier("version 275 ou plus (trace_combat.js, version.json)", vTrace >= 275 && vJson === vTrace, `${vTrace} / ${vJson}`);
  verifier("terrains_regionaux.js et voyage_groupe.js chargés", /terrains_regionaux\.js\?v=\d+/.test(html) && /voyage_groupe\.js\?v=\d+/.test(html));
  const v = (f) => Number((html.match(new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  verifier("app.js, ia_master.js, regions_carte.js, cartes_regionales.js, villages_regionaux.js et style.css ont changé de version",
           v("app.js") >= 124 && v("ia_master.js") >= 8 && v("regions_carte.js") >= 4 && v("cartes_regionales.js") >= 4 && v("villages_regionaux.js") >= 2 && v("style.css") >= 107);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
