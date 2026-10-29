// v285 — UN BORD UN PEU PLUS VARIÉ ; LA TABLE EN BOIS SOUS LES CARTES ; LE
// TITRE AU-DESSUS DES BRÛLURES.
//
// Nico : « pour l'effet parchemin de base sur tous les bords des maps, faire
// un tout petit peu plus de variation dans la taille. J'aimerais qu'en
// arrière-plan, derrière les maps globale et les maps régionales, tu me fasses
// la texture d'une table en bois nervuré, un bois marron foncé et vraiment
// réaliste, avec des nœuds etc. Un seul fond pour toutes les maps, et qui
// s'adapte à tous les écrans. » — « et les titres des maps ne doivent pas être
// impactés par les trous des brûlures : le titre apparaît au-dessus. »
//
// Sur la VRAIE page (faux Firestore à transactions). Se charge sur l'ancien
// code (IVALIS_RACINE) : il y échoue, sans planter.
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(76)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const titre = (t) => console.log("\n" + t);
const section = async (corps) => { try { await corps(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 160)); } };
const lire = (f) => { try { return fs.readFileSync(path.join(RACINE, f), 'utf-8'); } catch (e) { return ""; } };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg' };
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
// GEMINI SIMULÉ : MIA_TERRAIN (une image jointe), MIA_POI (sa consigne), le
// narrateur. OPENAI ET CLOUDINARY SIMULÉS : le calque, l'illustration.
const requetes = [], openai = [], cloudinary = [];
const reglagesFaux = { poiRetard: 0, poiPanne: false };
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
await p.route('**generativelanguage.googleapis.com/**', async r => {
  const corps = JSON.parse(r.request().postData() || "{}");
  const parts = (corps.contents && corps.contents[0] && corps.contents[0].parts) || [];
  const image = parts.find(x => x.inline_data);
  const systeme = corps.systemInstruction ? corps.systemInstruction.parts.map(x => x.text).join("\n") : "";
  requetes.push({ image: !!image, texte: parts.filter(x => x.text).map(x => x.text).join("\n"), systeme, temperature: corps.generationConfig && corps.generationConfig.temperature });
  let texte = "";
  if (/MIA_POI/.test(systeme)) {
    if (reglagesFaux.poiRetard) await new Promise(f => setTimeout(f, reglagesFaux.poiRetard));
    if (reglagesFaux.poiPanne) { r.fulfill({ status: 500, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ error: { message: "panne simulée" } }) }); return; }
    texte = JSON.stringify({ nom: "Kalymnos", type_lieu: "Hameau de charbonniers", description: "Trois huttes de branchages autour de meules fumantes ; des visages noircis.",
      securite: "Moyenne", peuple: "Humains", accroche_mj: "Le fils du charbonnier a disparu dans la pinède depuis trois jours.", stigmates: "Une odeur de bois brûlé.",
      batiments: [{ nom: "La meule d'Hestor", description: "Une meule géante qui fume nuit et jour.", stigmates: "Chaleur sèche.", prompt_image: "a large charcoal kiln" },
                  { nom: "La hutte de l'ancienne", description: "Des herbes pendent du toit.", stigmates: "Odeur de sauge.", prompt_image: "a herb hut" }],
      visuel_carte: "three small huts around smoking charcoal kilns", prompt_image: "a tiny charcoal burners hamlet in a pine forest" });
  } else if (image) texte = JSON.stringify({ terrain: "lisière d'une forêt de pins", sous_le_groupe: "Un tapis d'aiguilles grises.", alentours: { nord: "la forêt", est: "une rivière", sud: "une plaine", ouest: "des collines" },
      elements_notables: ["une rivière"], resume_mj: "La lisière d'une pinède grise." });
  else if (/Continue l'histoire/.test(systeme)) texte = "Des volutes de fumée montent entre les pins ; une voix vous hèle.";
  else texte = JSON.stringify({});
  r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'},
              body: JSON.stringify({ candidates: [{ content: { parts: [{ text: texte }] } }], usageMetadata: { totalTokenCount: 10 } }) });
});
await p.route('**api.openai.com/**', async r => {
  const u = r.request().url();
  const d = r.request().postData() || "";
  openai.push({ url: u, prompt: (d.match(/name="prompt"\r\n\r\n([^\r]*)/) || [])[1] || (u.includes("generations") ? (JSON.parse(d || "{}").prompt || "") : "") });
  r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ data: [{ b64_json: PNG }] }) });
});
await p.route('**api.cloudinary.com/**', async r => {
  const d = r.request().postData() || "";
  const dossier = (d.match(/name="folder"\r\n\r\n([^\r]*)/) || [])[1] || "";
  cloudinary.push(dossier);
  r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ secure_url: `https://res.cloudinary.com/dlkjq4kvg/image/upload/v1/${dossier}/image_${cloudinary.length}.png` }) });
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
const joueur = (id) => p.evaluate((id) => { localStorage.setItem("ID_JOUEUR_COURANT", id); if (typeof window.dessinerVoyageGroupe === "function") window.dessinerVoyageGroupe(); }, id);
const attendreQue = async (f, ms = 6000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await p.waitForTimeout(100); } return false; };
const v = async () => (await partie()).Voyage_Groupe || null;
// Un voyage régional de la carte 2, proposé par Thorin, accepté par Lyra.
const lancerVoyageRegional = async (de, vers) => {
  await p.evaluate(({ de }) => { const d = window.__docs["Systeme_Parties/P1"]; d.Lieu_Actuel = ""; d.Situation = "Dans la nature"; d.Position_Groupe = { Region: 2, x: de.x, y: de.y };
    delete d.Voyage_Groupe; delete d.Voyage_Annule; window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(d))); }, { de });
  await joueur("P_01");
  await p.evaluate(({ vers }) => {
    window.basculerModeVoyage(true);
    const c = window.cadrageCarteRegion(), e = document.getElementById("ecran-jeu").getBoundingClientRect();
    window.surChoixPointRegion(e.left + c.panX + vers.x * c.largeur * c.zoom, e.top + c.panY + vers.y * c.hauteur * c.zoom);
    return window.proposerVoyageGroupe();
  }, { vers });
  await p.waitForTimeout(100);
  await joueur("P_02");
  await p.evaluate(() => window.voterVoyageGroupe("oui"));
  await p.waitForTimeout(150);
};
// Joue la marche en cours jusqu'à son terme (sans attendre l'écran).
const finir = async () => { await p.evaluate(() => window.finirMarcheVoyage()); await p.waitForTimeout(150); };

await p.evaluate(async () => { await window.ouvrirCarteRegionale(2, { sansTransition: true }); });
await p.waitForTimeout(300);
const S = '/tmp/claude-0/-home-user-Ivalis/3718c626-55b5-577c-9b4f-a49012fd3784/scratchpad';

// =========================================================================
titre("1. LE BORD DE BASE : UN TOUT PETIT PEU PLUS DE VARIATION DANS LA TAILLE");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const B = window.BordsParchemin, W = 2048, H = 1280, s = Math.min(W, H);
    return [13, 7932, 15851, 23770, 31689, 1].map(g => {
      const m = B.calculer(W, H, g).masque, a = (x, y) => m[(y * W + x) * 4 + 3];
      const prof = [];
      for (let x = Math.round(0.1 * W); x < 0.9 * W; x += 4) {
        let y = 0; while (y < H / 2 && a(x, y) < 128) y++; prof.push(y / s);
        let y2 = H - 1; while (y2 > H / 2 && a(x, y2) < 128) y2--; prof.push((H - 1 - y2) / s);
      }
      const moy = prof.reduce((q, z) => q + z, 0) / prof.length;
      const ec = Math.sqrt(prof.reduce((q, z) => q + (z - moy) ** 2, 0) / prof.length);
      return { moy, ec, max: Math.max(...prof) };
    });
  });
  const ecMoyen = r.reduce((q, x) => q + x.ec, 0) / r.length;
  // v284 : un écart de 0,0005 à 0,0007 du petit côté ; on le veut nettement plus, sans excès.
  verifier("la largeur du bord varie davantage (écart moyen > 0,0008 du petit côté)", ecMoyen > 0.0008 && ecMoyen < 0.0025, ecMoyen.toFixed(5) + " " + JSON.stringify(r.map(x => x.ec.toFixed(4))));
  verifier("…en restant un bord fin (moyenne < 0,6 %, jamais plus de 1 %)", r.every(x => x.moy > 0.0015 && x.moy < 0.006 && x.max < 0.01), JSON.stringify(r.map(x => [x.moy.toFixed(4), x.max.toFixed(4)])));
});

// =========================================================================
titre("2. LE TITRE DE LA CARTE RÉGIONALE, AU-DESSUS DES BRÛLURES");
// =========================================================================
await section(async () => {
  // Une usure peinte en plein sur le titre : la carte y est brûlée, percée.
  await p.evaluate(() => {
    const carte = window.CARTES_REGIONALES[2];
    const C = 160, L = 100, cases = new Array(C * L).fill(0);
    const cx = carte.titre.x * C, cy = carte.titre.y * L;
    for (let l = 0; l < L; l++) for (let c = 0; c < C; c++) if (Math.hypot((c + 0.5 - cx) / 1.6, l + 0.5 - cy) < 22) cases[l * C + c] = 1;
    const d = Object.assign({}, window.__docs["Cartes_Regionales/2"], { Usure: { colonnes: C, lignes: L, cases: window.BordsParchemin.encoder(Uint8Array.from(cases)) } });
    window.__docs["Cartes_Regionales/2"] = d;
    window.appliquerCartesRegionalesDeLaBase([{ id: "2", data: d }]);
  });
  const pose = await attendreQue(async () => await p.evaluate(() => !!document.getElementById("carte-region").__zonesParchemin), 15000);
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const t = document.getElementById("carte-region-titre"), carte = document.getElementById("carte-region");
    // Le titre ne doit avoir aucun ancêtre découpé par un masque.
    let masque = null;
    for (let e = t && t.parentElement; e; e = e.parentElement) { const st = getComputedStyle(e); const mi = st.maskImage || st.webkitMaskImage; if (mi && mi !== "none") { masque = e.id || e.className; break; } }
    const dessus = document.getElementById("carte-region-dessus");
    const st = (e) => e ? [e.style.transform, e.style.width, e.style.height].join("|") : "";
    const r1 = t.getBoundingClientRect(), c = window.cadrageCarteRegion(), e = document.getElementById("ecran-jeu").getBoundingClientRect();
    const fiche = window.CARTES_REGIONALES[2];
    const attendu = { x: e.left + c.panX + fiche.titre.x * c.largeur * c.zoom, y: e.top + c.panY + fiche.titre.y * c.hauteur * c.zoom };
    return { masqueCarte: !!(carte.style.maskImage || carte.style.webkitMaskImage), masque, dansCarte: carte.contains(t),
             jumeau: !!dessus && st(dessus) === st(carte), ecart: Math.hypot(r1.left + r1.width / 2 - attendu.x, r1.top + r1.height / 2 - attendu.y),
             texte: t.textContent, haut: dessus && getComputedStyle(dessus).zIndex };
  });
  verifier("la carte est bien brûlée là (usure posée, masque sur la carte)", pose && r.masqueCarte, JSON.stringify(r));
  verifier("le titre n'est plus dans le calque découpé : aucun masque au-dessus de lui", !r.dansCarte && r.masque === null, JSON.stringify([r.dansCarte, r.masque]));
  verifier("…il est sur un calque jumeau (même taille, même cadrage), à sa place", r.jumeau && r.ecart < 2, JSON.stringify([r.jumeau, r.ecart.toFixed(2), r.texte]));
  await p.screenshot({ path: S + "/v285_titre.png" });
  // DEV : le titre se déplace toujours à la souris.
  const dep = await p.evaluate(() => { window.basculerEditionTitreRegion(true); const r = document.getElementById("carte-region-titre").getBoundingClientRect();
    const x = r.left + r.width * 0.4, y = r.top + r.height * 0.5, sous = document.elementFromPoint(x, y);
    return { x, y, avant: window.CARTES_REGIONALES[2].titre.x, sous: sous && (sous.id || sous.className), edition: document.getElementById("carte-region-titre").className }; });
  await p.mouse.move(dep.x, dep.y); await p.mouse.down(); await p.mouse.move(dep.x + 80, dep.y, { steps: 5 }); await p.mouse.up();
  const apres = await p.evaluate(() => { const x = window.CARTES_REGIONALES[2].titre.x; window.basculerEditionTitreRegion(false); return x; });
  verifier("DEV : le titre se déplace toujours à la souris", apres > dep.avant + 0.01 && dep.sous === "carte-region-titre-texte", JSON.stringify([dep.avant, apres, dep.sous]));
  // On fait glisser la carte : le titre la suit.
  await p.evaluate(() => { window.zoomerCarteRegion && window.zoomerCarteRegion(1.3); });
  const box = await p.evaluate(() => { const r = document.getElementById("vue-carte-region").getBoundingClientRect(); return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5 }; });
  await p.mouse.move(box.x, box.y); await p.mouse.down(); await p.mouse.move(box.x - 60, box.y - 40, { steps: 5 }); await p.mouse.up();
  const suit = await p.evaluate(() => { const a = document.getElementById("carte-region"), b = document.getElementById("carte-region-dessus"); return a.style.transform === b.style.transform && a.style.transform; });
  verifier("la carte glisse : le titre la suit (même cadrage)", !!suit, String(suit));
  // Pixels : au centre du titre, ce sont les lettres qu'on voit (claires), pas le trou.
  const centre = await p.evaluate(() => { const r = document.getElementById("carte-region-titre").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const vis = await p.evaluate(async ({ centre }) => {
    // Le titre retiré puis remis : les pixels de son emplacement changent (il se voit).
    const t = document.getElementById("carte-region-titre");
    return { w: centre.w, h: centre.h, opacite: getComputedStyle(t).opacity, visible: getComputedStyle(t).visibility, aff: getComputedStyle(t).display };
  }, { centre });
  verifier("le titre se voit (taille, opacité)", vis.w > 20 && vis.h > 8 && Number(vis.opacite) > 0.5 && vis.visible === "visible" && vis.aff !== "none", JSON.stringify(vis));
  const pastilles = await p.evaluate(() => { const c = document.getElementById("carte-region-pastilles"); return !!c && document.getElementById("carte-region").contains(c); });
  verifier("les pastilles des villages sont toujours posées sur la carte", pastilles);
});

// =========================================================================
titre("3. LA TABLE EN BOIS SOUS TOUTES LES CARTES");
// =========================================================================
await section(async () => {
  const img = await p.evaluate(() => new Promise(ok => { const i = new Image(); i.onload = () => ok({ l: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => ok(null); i.src = "images/sable.jpg"; }));
  // (v288 : la table en bois a laissé place au sable, images/sable.jpg.)
  verifier("l'image du sol est là (v288 : images/sable.jpg, grande)", !!img && img.l >= 1500 && img.h >= 1500, JSON.stringify(img));
  // v286 : la table n'est plus le fond fixe des deux vues, mais un calque lié à
  // chaque carte (#table-monde, #carte-region-table), en mosaïque (corrections_v286).
  const fonds = await p.evaluate(() => ["table-monde", "carte-region-table"].map(id => { const el = document.getElementById(id); const st = el && getComputedStyle(el, "::before"); return { id, img: st ? st.backgroundImage : "", rep: st ? st.backgroundRepeat : "" }; }));
  verifier("le même sol sous la carte du monde et sous les cartes régionales", fonds.every(f => /sable\.jpg/.test(f.img)) && fonds[0].img === fonds[1].img, JSON.stringify(fonds.map(f => f.img)));
  verifier("…(v286) en mosaïque, liée à la carte : elle couvre tout écran", fonds.every(f => f.rep === "repeat"), JSON.stringify(fonds));
  // Un écran très large : la carte du monde ne le couvre pas, la table se voit sur les côtés.
  await p.evaluate(() => window.fermerCarteRegionale && window.fermerCarteRegionale());
  await p.waitForTimeout(600);
  for (const [l, h, nom] of [[1900, 700, "large"], [390, 844, "telephone"]]) {
    await p.setViewportSize({ width: l, height: h });
    await p.evaluate(() => { window.dispatchEvent(new Event("resize")); window.recadrerCarte && window.recadrerCarte(); });
    await p.waitForTimeout(500);
    await p.screenshot({ path: S + `/v285_table_${nom}.png` });
  }
  await p.setViewportSize({ width: 1900, height: 700 });
  await p.evaluate(() => { window.dispatchEvent(new Event("resize")); window.recadrerCarte && window.recadrerCarte(); });
  await p.waitForTimeout(500);
  const cote = await p.evaluate(() => {
    const r = document.getElementById("carte-fond-jeu").getBoundingClientRect();
    return { gauche: r.left, couvre: getComputedStyle(document.getElementById("conteneur-carte-fond")).backgroundImage };
  });
  const png = await p.screenshot({ clip: { x: 5, y: 100, width: Math.max(10, Math.floor(cote.gauche) - 20), height: 500 } });
  const stats = await p.evaluate(async (b64) => {
    const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode();
    const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const x = c.getContext("2d"); x.drawImage(i, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0, s = [0, 0, 0], s2 = 0;
    for (let k = 0; k < d.length; k += 4) { n++; s[0] += d[k]; s[1] += d[k + 1]; s[2] += d[k + 2]; s2 += d[k] * d[k]; }
    const m = s.map(v => v / n); return { r: m[0], v: m[1], b: m[2], ec: Math.sqrt(s2 / n - m[0] * m[0]) };
  }, png.toString("base64"));
  verifier("écran large : sur le côté, c'est du bois (brun, veiné — pas un aplat)", cote.gauche > 40 && stats.r > stats.v && stats.v > stats.b && stats.r > 30 && stats.ec > 4, JSON.stringify([cote.gauche, stats]));
});

// =========================================================================
titre("4. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json') || "{}").version;
  verifier("version 285 ou plus (trace_combat.js, version.json)", vTrace >= 285 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const v = (f) => Number((html.match(new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  verifier("les fichiers touchés ont changé de version", v("style.css") >= 114 && v("bords_parchemin.js") >= 4 && v("cartes_regionales.js") >= 9 && v("villages_regionaux.js") >= 6 && v("terrains_regionaux.js") >= 2 && v("voyage_groupe.js") >= 6,
           JSON.stringify(["style.css", "bords_parchemin.js", "cartes_regionales.js", "villages_regionaux.js", "terrains_regionaux.js", "voyage_groupe.js"].map(v)));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
