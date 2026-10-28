// v276 — LA JOURNÉE DE MARCHE À 30 % ; CE QUE LE MAÎTRE DU JEU SAIT DU DÉCOR.
//
// Nico : « réduis les distances avant chaque nuit : de 45 %, mets plutôt
// 30 %. » Puis : un outil IA qui dit au MJ dans quel décor sont les héros. Hors
// d'un lieu connu, ils sont « dans la nature » : on découpe un carré autour
// d'eux (avec le point exact du groupe), une IA analyse le terrain, et le MJ
// le reçoit à chaque réponse, avec la région où ils sont (son descriptif, son
// lore) — des rencontres, oui ; des bâtiments inventés, non. Le descriptif
// envoyé s'écrit dans la console.
//
// Sur la VRAIE page, Firestore en mémoire (transactions comprises), Gemini simulé.
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
// GEMINI SIMULÉ : MIA_TERRAIN (une image jointe) rend un terrain ; le
// narrateur (une consigne système) rend un récit. Chaque requête est gardée.
const requetes = [];
await p.route('**generativelanguage.googleapis.com/**', async r => {
  const corps = JSON.parse(r.request().postData() || "{}");
  const parts = (corps.contents && corps.contents[0] && corps.contents[0].parts) || [];
  const image = parts.find(x => x.inline_data);
  const systeme = corps.systemInstruction ? corps.systemInstruction.parts.map(x => x.text).join("\n") : "";
  requetes.push({ image: !!image, mime: image && image.inline_data.mime_type, taille: image ? image.inline_data.data.length : 0,
                  donnees: image ? image.inline_data.data : "", texte: parts.filter(x => x.text).map(x => x.text).join("\n"), systeme,
                  temperature: corps.generationConfig && corps.generationConfig.temperature });
  let texte = "";
  if (image) texte = JSON.stringify({ terrain: "lisière d'une forêt de pins, sur un sol de cendres", sous_le_groupe: "Un tapis d'aiguilles grises et de cendre tiède.",
    alentours: { nord: "la forêt s'épaissit", est: "une rivière ocre", sud: "une plaine de soufre", ouest: "des collines pelées" },
    elements_notables: ["une rivière ocre", "des fumerolles"], resume_mj: "Le groupe se tient à la lisière d'une pinède grise, la cendre crisse sous ses bottes." });
  else if (systeme) texte = "Le vent tourne ; une odeur de soufre monte de la plaine.";
  else texte = JSON.stringify({});
  r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'},
              body: JSON.stringify({ candidates: [{ content: { parts: [{ text: texte }] } }], usageMetadata: { totalTokenCount: 10 } }) });
});
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
const consoles = []; p.on('console', m => consoles.push(m.text()));
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
  window.__docs["Systeme_Parties/P1"] = { Lieu_Actuel: "", Voyages_Effectues: 1, Position_Groupe: { Region: 2, x: 0.4, y: 0.5 } };
  ["GEMINI_API_KEY", "OPENAI_API_KEY", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].forEach(k => localStorage.setItem("ivalis_" + k, "cle-" + k));
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
    Description: "Une vallée de soufre et de forges ; les Ankylars y font la loi depuis Volcanisse.",
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
// Changer de joueur.
const joueur = (id) => p.evaluate((id) => { localStorage.setItem("ID_JOUEUR_COURANT", id); if (typeof window.dessinerVoyageGroupe === "function") window.dessinerVoyageGroupe(); }, id);
const terrains = () => requetes.filter(q => q.image);

// =========================================================================
titre("1. LA JOURNÉE DE MARCHE : 30 % DE LA HAUTEUR DE LA CARTE (AU LIEU DE 45 %)");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => ({ d: window.DISTANCE_JOUR_VOYAGE, j: [0.25, 0.31, 0.45, 0.6, 0.9].map(l => window.joursDeMarcheVoyage(l)) }));
  verifier("une journée = 30 % de la hauteur de la carte", r.d === 0.3, r.d);
  verifier("les jours suivent (0,25 → 1 ; 0,31 → 1 ; 0,45 → 2 ; 0,6 → 2 ; 0,9 → 3)", JSON.stringify(r.j) === "[1,1,2,2,3]", JSON.stringify(r.j));
  const src = lire('voyage_groupe.js');
  verifier("(et plus de 45 % dans le code)", /const DISTANCE_JOUR = 0\.30;/.test(src) && !/DISTANCE_JOUR = 0\.45/.test(src));
});

// =========================================================================
titre("2. « DANS LA NATURE » EN BASE (SITUATION), « DANS UN LIEU » AU VILLAGE");
// =========================================================================
await section(async () => {
  await p.evaluate(async () => { window.__docs["Systeme_Parties/P1"].Analyse_Terrain = null; await window.teleporterGroupe({ Region: 2, x: 0.4, y: 0.5, Lieu: "" }); });
  await p.waitForTimeout(300);
  const d1 = await partie();
  verifier("téléporté en pleine nature : Lieu_Actuel vide, Situation « Dans la nature »", d1.Lieu_Actuel === "" && d1.Situation === "Dans la nature", d1.Situation);
  await p.evaluate(async () => { await window.teleporterGroupe({ Region: 2, x: 0.7, y: 0.66, Lieu: "L_00042_Brumefosse" }); });
  await p.waitForTimeout(150);
  const d2 = await partie();
  verifier("au village : « Dans un lieu »", d2.Lieu_Actuel === "L_00042_Brumefosse" && d2.Situation === "Dans un lieu", d2.Situation);
  const src = lire('voyage_groupe.js');
  verifier("chaque écriture du lieu (départ, camp, arrivée, rester, téléport) dit la situation",
           (src.match(/Lieu_Actuel: "", Situation: SITUATION_NATURE/g) || []).length >= 4 && /Situation: situationDe\(v\.Arrivee\.Lieu\)/.test(src));
});

// =========================================================================
titre("3. LE CARRÉ DÉCOUPÉ : 25 % DE LA HAUTEUR AUTOUR DU GROUPE, ET SON POINT EXACT");
// =========================================================================
await section(async () => {
  const c = await p.evaluate(() => ({ milieu: window.cadreDecoupeTerrain({ x: 0.5, y: 0.5 }, 2400, 1500), bord: window.cadreDecoupeTerrain({ x: 0.02, y: 0.95 }, 2400, 1500) }));
  verifier("un carré de 25 % de la hauteur, centré sur le groupe", c.milieu.cote === 375 && c.milieu.gauche === 1013 && c.milieu.haut === 563
           && Math.abs(c.milieu.point.x - 187.5) < 1 && Math.abs(c.milieu.point.y - 187.5) < 1, JSON.stringify(c.milieu));
  verifier("près d'un bord : le carré reste dans l'image, le point garde sa place exacte", c.bord.gauche === 0 && c.bord.haut === 1125
           && Math.abs(c.bord.point.x - 48) < 1 && Math.abs(c.bord.point.y - 300) < 1, JSON.stringify(c.bord));
  const d = await p.evaluate(async () => {
    const r = await window.decouperTerrainGroupe({ Lieu_Actuel: "", Position_Groupe: { Region: 2, x: 0.02, y: 0.95 } });
    if (!r) return null;
    const img = new Image(); img.src = r.donnees; await img.decode();
    const t = document.createElement("canvas"); t.width = img.width; t.height = img.height; const ctx = t.getContext("2d"); ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(Math.round(r.point.x), Math.round(r.point.y), 1, 1).data, coin = ctx.getImageData(t.width - 5, 5, 1, 1).data;
    return { l: img.width, h: img.height, jpeg: r.donnees.startsWith("data:image/jpeg"), px: [...px].slice(0, 3), coin: [...coin].slice(0, 3), point: r.point };
  });
  verifier("une image JPEG carrée (375 px : la taille de la découpe)", d && d.jpeg && d.l === 375 && d.h === 375, d && `${d.l}×${d.h}`);
  verifier("le point rouge du groupe y est dessiné, à sa place exacte", d && d.px[0] > 180 && d.px[1] < 90 && d.px[2] < 90, d && JSON.stringify(d.px));
  verifier("…et le reste est la carte", d && !(d.coin[0] > 180 && d.coin[1] < 90), d && JSON.stringify(d.coin));
});

// =========================================================================
titre("4. MIA_TERRAIN : L'IA LIT LE TERRAIN, UNE FOIS PAR POSITION");
// =========================================================================
await section(async () => {
  await p.evaluate(async () => { await window.teleporterGroupe({ Region: 2, x: 0.4, y: 0.5, Lieu: "" }); });
  for (let i = 0; i < 30 && !(await partie()).Analyse_Terrain; i++) await p.waitForTimeout(100);
  const q = terrains().pop();
  verifier("le groupe s'arrête en pleine nature : l'analyse part d'elle-même", !!q && q.image && q.mime === "image/jpeg" && q.taille > 1000, q && q.mime);
  verifier("la consigne : le nord en haut, le point rouge = le groupe, ne rien inventer", q && /nord est en HAUT/.test(q.texte) && /POINT ROUGE/.test(q.texte)
           && /sans rien inventer/.test(q.texte) && /La vallée de souffre/.test(q.texte), q && q.texte.slice(0, 80));
  verifier("elle sait l'échelle (une journée de marche) et les lieux connus proches", q && /journée\(s\) de marche/.test(q.texte) && /Brumefosse \(village\), à environ 1,5 jours de marche à l'est/.test(q.texte),
           q && (q.texte.match(/Lieux connus[^\n]*/) || [""])[0]);
  verifier("une IA froide (température basse)", q && q.temperature <= 0.3, q && q.temperature);
  const a = (await partie()).Analyse_Terrain;
  verifier("le résultat est gardé dans la partie, avec la clé de la position", a && a.Cle === "2:0.400:0.500" && a.Region === 2 && /lisière d'une forêt de pins/.test(a.Terrain)
           && /cendre crisse/.test(a.Descriptif) && /au nord, la forêt s'épaissit/.test(a.Descriptif), a && a.Cle);
  verifier("la console le montre", consoles.some(t => /\[MIA_Terrain\]/.test(t) && /cendre crisse/.test(t)));
  const n0 = terrains().length;
  await p.evaluate(() => window.analyserTerrainGroupe());
  verifier("la même position : pas de nouvelle analyse", terrains().length === n0);
  await p.evaluate(() => window.analyserTerrainGroupe({ forcer: true }));
  verifier("…sauf si on la force (DEV)", terrains().length === n0 + 1);
  await p.evaluate(async () => { await window.teleporterGroupe({ Region: 2, x: 0.7, y: 0.66, Lieu: "L_00042_Brumefosse" }); });
  await p.waitForTimeout(300);
  verifier("dans un lieu connu : pas d'analyse d'image", terrains().length === n0 + 1);
});

// =========================================================================
titre("5. CE QUE REÇOIT LE MJ : LA RÉGION, LE TERRAIN, LES LIEUX PROCHES, LA CONSIGNE");
// =========================================================================
let blocNature = "";
await section(async () => {
  await p.evaluate(async () => { await window.teleporterGroupe({ Region: 2, x: 0.4, y: 0.5, Lieu: "" }); });
  for (let i = 0; i < 30 && !((await partie()).Analyse_Terrain || {}).Cle; i++) await p.waitForTimeout(100);
  const n0 = terrains().length;
  blocNature = await p.evaluate(async () => window.contexteEnvironnementMJ(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))));
  verifier("dans la nature : la région et la situation", /Région : La vallée de souffre\. Le groupe est DANS LA NATURE/.test(blocNature), blocNature.slice(0, 120));
  verifier("le point exact où se tient le groupe", /Position exacte sur la carte de la région : x = 0\.4, y = 0\.5/.test(blocNature));
  verifier("le terrain lu sur la carte (l'analyse gardée, pas refaite)", /cendre crisse/.test(blocNature) && /Alentours : au nord/.test(blocNature) && terrains().length === n0);
  verifier("les lieux connus à proximité, direction et temps de marche", /Lieux connus à proximité : Brumefosse \(village\), à environ 1,5 jours de marche à l'est/.test(blocNature),
           (blocNature.match(/Lieux connus[^\n]*/) || [""])[0]);
  verifier("la consigne : des rencontres, oui ; aucun bâtiment inventé", /des rencontres/.test(blocNature) && /AUCUN bâtiment, village, ruine ni lieu construit/.test(blocNature));
  verifier("le descriptif RP de la région", /Descriptif de La vallée de souffre : Une vallée de soufre et de forges/.test(blocNature));
  verifier("et son lore (la cité de Volcanisse, l'Ordre d'Ivalis)", /La cité de Volcanisse/.test(blocNature) && /L'Ordre d'Ivalis/.test(blocNature));
  verifier("le texte envoyé s'écrit dans la console (Nico : « pour que je puisse contrôler »)", consoles.some(t => /Environnement envoyé au maître du jeu/.test(t) && /DANS LA NATURE/.test(t)));
  await p.evaluate(async () => { await window.teleporterGroupe({ Region: 2, x: 0.7, y: 0.66, Lieu: "L_00042_Brumefosse" }); });
  const blocLieu = await p.evaluate(async () => window.contexteEnvironnementMJ(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))));
  verifier("dans un lieu connu : le lieu et la région, sans terrain ni consigne de nature", /Le groupe se trouve dans un lieu connu : Brumefosse/.test(blocLieu)
           && /Descriptif de La vallée de souffre/.test(blocLieu) && !/DANS LA NATURE/.test(blocLieu) && !/AUCUN bâtiment/.test(blocLieu), blocLieu.slice(0, 120));
});

// =========================================================================
titre("6. LE TOUR DU MJ : LE DÉCOR EST DANS SA CONSIGNE, À CHAQUE RÉPONSE");
// =========================================================================
await section(async () => {
  await p.evaluate(async () => { await window.teleporterGroupe({ Region: 2, x: 0.4, y: 0.5, Lieu: "" }); });
  for (let i = 0; i < 30 && !((await partie()).Analyse_Terrain || {}).Cle; i++) await p.waitForTimeout(100);
  await p.evaluate(() => {
    window.__docs["Messages_Chat/m1"] = { ID_Partie: "P1", Auteur_ID: "H1", Auteur_Nom: "Thorin", Texte: "Je scrute l'horizon.", Timestamp: 1 };
    window.__ajouts = [];
  });
  const n0 = terrains().length;
  await p.evaluate(() => window.declencherTourIA());
  await p.waitForTimeout(300);
  const narr = requetes.filter(q => /Continue l.histoire/.test(q.systeme)).pop();
  verifier("le narrateur reçoit « Type : Dans la nature » et le bloc du décor", narr && /Type : Dans la nature/.test(narr.systeme) && /--- OÙ SE TROUVE LE GROUPE ---/.test(narr.systeme)
           && /cendre crisse/.test(narr.systeme) && /AUCUN bâtiment/.test(narr.systeme) && /Descriptif de La vallée de souffre/.test(narr.systeme), narr && narr.systeme.slice(0, 100));
  verifier("en pleine nature, pas de réputation locale (elle n'a de sens que dans un lieu)", narr && !/RÉPUTATION DU GROUPE DANS CE LIEU/.test(narr.systeme));
  verifier("l'analyse gardée sert (pas de nouvelle lecture d'image)", terrains().length === n0);
  const msg = await p.evaluate(() => (window.__ajouts || []).filter(a => a.col === "Messages_Chat" && a.data.Auteur_ID === "MJ"));
  verifier("le MJ répond dans le chat", msg.length === 1 && /odeur de soufre/.test(msg[0].data.Texte));
  // Le groupe a bougé sans analyse (un autre poste sans clé) : le tour la fait.
  await p.evaluate(() => { const d = window.__docs["Systeme_Parties/P1"]; d.Position_Groupe = { Region: 2, x: 0.3, y: 0.4 }; delete d.Analyse_Terrain; d.IA_En_Cours = false; });
  await p.evaluate(() => window.declencherTourIA());
  await p.waitForTimeout(300);
  const narr2 = requetes.filter(q => /Continue l.histoire/.test(q.systeme)).pop();
  verifier("une position sans analyse : le tour du MJ la fait d'abord", terrains().length === n0 + 1 && /x = 0\.3, y = 0\.4/.test(narr2.systeme) && /cendre crisse/.test(narr2.systeme));
  // Dans un lieu connu, le contexte d'avant reste (la fiche, la réputation).
  await p.evaluate(() => { const d = window.__docs["Systeme_Parties/P1"]; d.Lieu_Actuel = "L_00042_Brumefosse"; d.Situation = "Dans un lieu"; d.IA_En_Cours = false;
    window.__docs["Monde_Lieux/L_00042_Brumefosse"] = { Nom_Du_Lieu: "Brumefosse", Description_Global: "Un hameau de charbonniers.", Reputations: {} }; });
  await p.evaluate(() => window.declencherTourIA());
  await p.waitForTimeout(300);
  const narr3 = requetes.filter(q => /Continue l.histoire/.test(q.systeme)).pop();
  verifier("dans un lieu : sa fiche, sa réputation, et la région", /Type : Lieu/.test(narr3.systeme) && /charbonniers/.test(narr3.systeme)
           && /RÉPUTATION DU GROUPE DANS CE LIEU/.test(narr3.systeme) && /lieu connu : Brumefosse/.test(narr3.systeme) && !/AUCUN bâtiment/.test(narr3.systeme));
});

// =========================================================================
titre("7. LE VOYAGE PRÉPARE L'ANALYSE : AU CAMP, À L'ARRIVÉE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { const d = window.__docs["Systeme_Parties/P1"]; d.Lieu_Actuel = ""; d.Situation = "Dans la nature"; d.Position_Groupe = { Region: 2, x: 0.25, y: 0.6 }; delete d.Analyse_Terrain;
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(d))); });
  await p.evaluate(async () => { await window.ouvrirCarteRegionale(2, { sansTransition: true }); });
  await p.waitForTimeout(300);
  const n0 = terrains().length;
  await joueur("P_01");
  await p.evaluate(async () => {
    window.basculerModeVoyage(true);
    const c = window.cadrageCarteRegion(), e = document.getElementById("ecran-jeu").getBoundingClientRect();
    window.surChoixPointRegion(e.left + c.panX + 0.8 * c.largeur * c.zoom, e.top + c.panY + 0.3 * c.hauteur * c.zoom);
    await window.proposerVoyageGroupe();
    await new Promise(r => setTimeout(r, 100));
    await window.forcerVoyageGroupe();
  });
  await p.waitForTimeout(150);
  const v = (await partie()).Voyage_Groupe;
  verifier("(un voyage de plusieurs jours part)", v && v.Etat === "marche" && v.Jours >= 2, v && v.Jours);
  await p.evaluate(() => window.finirMarcheVoyage());
  for (let i = 0; i < 30 && terrains().length === n0; i++) await p.waitForTimeout(100);
  const d = await partie();
  verifier("la nuit tombe : le terrain du camp est analysé aussitôt", d.Voyage_Groupe && d.Voyage_Groupe.Etat === "nuit" && terrains().length === n0 + 1
           && d.Analyse_Terrain && d.Analyse_Terrain.Cle === `2:${d.Position_Groupe.x.toFixed(3)}:${d.Position_Groupe.y.toFixed(3)}`, d.Analyse_Terrain && d.Analyse_Terrain.Cle);
  await p.evaluate(() => window.choisirNuitVoyageGroupe("rester", { forcer: true }));
  await p.waitForTimeout(300);
  verifier("on reste au camp (même place) : pas de nouvelle analyse", terrains().length === n0 + 1);
});

// =========================================================================
titre("8. LE BOUTON DEV : « CE QUE LE MJ VOIT » (DANS LA CONSOLE)");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => ({ monde: !!document.querySelector("#regions-dev-monde .btn-tester-environnement"), region: !!document.querySelector("#regions-dev-carte .btn-tester-environnement") }));
  verifier("un bouton dans la section « Le groupe », sur le monde et sur la carte régionale", r.monde && r.region);
  const n0 = terrains().length, c0 = consoles.length;
  const texte = await p.evaluate(() => window.testerEnvironnementMJ());
  verifier("il relit le terrain (forcé) et écrit dans la console ce que le MJ recevrait", terrains().length === n0 + 1 && /DANS LA NATURE/.test(texte)
           && consoles.slice(c0).some(t => /Environnement envoyé au maître du jeu/.test(t)));
});

// =========================================================================
titre("9. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json') || "{}").version;
  verifier("version 276 ou plus (trace_combat.js, version.json)", vTrace >= 276 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const v = (f) => Number((html.match(new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  verifier("environnement_mj.js chargé ; ia_master.js, voyage_groupe.js, villages_regionaux.js ont changé de version",
           /environnement_mj\.js\?v=\d+/.test(html) && v("ia_master.js") >= 9 && v("voyage_groupe.js") >= 2 && v("villages_regionaux.js") >= 3);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
