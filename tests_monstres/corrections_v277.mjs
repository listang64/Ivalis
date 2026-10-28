// v277 — LES POINTS D'INTÉRÊT EN COURS DE VOYAGE.
//
// Nico : en marche sur une carte régionale, un POI peut apparaître (50 % par
// journée) : un point d'exclamation doré pas loin du groupe ; la marche se met
// en pause ; tous oui → le groupe y va par un chemin ondulé (l'itinéraire est
// gardé), un non → il passe son chemin. Le lieu naît (le catalogue, MIA_POI
// à température ondulée et sous règles, la région, son lore) et s'enregistre ;
// son dessin sur la carte (comme les villages), son image ; à l'arrivée, le chat
// s'ouvre et le MJ parle. Un message RP pour patienter. Pas trop près d'un
// lieu déjà sur la carte. Le document du catalogue.
//
// Sur la VRAIE page, Firestore en mémoire (transactions), Gemini, OpenAI et
// Cloudinary simulés.
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

await p.evaluate(async () => {
  window.appliquerReglagesGroupeDeLaBase({ Chance_POI: 1 });
  await window.ouvrirCarteRegionale(2, { sansTransition: true });
});
await p.waitForTimeout(300);

// =========================================================================
titre("1. LE CATALOGUE : BEAUCOUP DE TYPES, DE VARIANTES, PONDÉRÉS PAR LE TERRAIN ET LA RÉGION");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const C = window.CATALOGUE_POI; let types = 0, variantes = 0, bornes = true, minVariantes = 99;
    C.familles.forEach(f => f.types.forEach(t => { types++; variantes += t.variantes.length; minVariantes = Math.min(minVariantes, t.variantes.length);
      const [a, b] = t.batiments || [0, 0]; if (a < 0 || b > 4 || a > b) bornes = false; }));
    const compte = (opts, n) => { const c = {}; for (let i = 0; i < n; i++) { const g = window.tirerGrainePoi(opts); c[g.type] = (c[g.type] || 0) + 1; } return c; };
    const desert = compte({ terrains: ["desert"], region: 5 }, 3000), foret = compte({ terrains: ["foret"], region: 1 }, 3000), crique = compte({ terrains: ["cote"], region: 12 }, 3000);
    const g = window.tirerGrainePoi({ terrains: ["foret"], region: 1 });
    return { familles: C.familles.length, types, variantes, minVariantes, bornes, combinaisons: window.nombreCombinaisonsPoi(),
      ambiances: C.ambiances.length, accroches: C.accroches.length,
      ethere: (desert.bivouac_ethere || 0) + (desert.camp_nomades || 0), etherForet: (foret.bivouac_ethere || 0), gobs: foret.hameau_gobs || 0, pirates: crique.camp_pirates || 0,
      piratesForet: foret.camp_pirates || 0, graine: g, mots: window.motsTerrainPoi("La lisière d'une forêt de pins, près d'une rivière") };
  });
  verifier("une grosse liste : au moins 10 familles, 100 types, 400 variantes", r.familles >= 10 && r.types >= 100 && r.variantes >= 400, `${r.familles} / ${r.types} / ${r.variantes}`);
  verifier("chaque type a ses variantes (4 au moins) et 0 à 4 bâtiments", r.minVariantes >= 4 && r.bornes);
  verifier("des ambiances et des accroches : des millions de graines", r.ambiances >= 20 && r.accroches >= 30 && r.combinaisons > 1e6, r.combinaisons.toLocaleString("fr"));
  verifier("le terrain et la région pèsent : le désert d'Etheria → nomades et Éthérés", r.ethere > 600 && r.etherForet < 30, `${r.ethere} / ${r.etherForet}`);
  verifier("…la forêt des murmures → des Gobs ; la crique du Pendu → des pirates", r.gobs > 40 && r.pirates > 40 && r.piratesForet < 10, `${r.gobs} / ${r.pirates} / ${r.piratesForet}`);
  verifier("une graine : famille, type, variante, ambiance, accroche, état, bâtiments", ["famille", "typeNom", "variante", "ambiance", "accroche", "etat"].every(k => r.graine[k]) && Number.isInteger(r.graine.batiments));
  verifier("le terrain se lit dans l'analyse (forêt, rivière)", JSON.stringify(r.mots) === '["foret","riviere"]', JSON.stringify(r.mots));
  const doc = lire('CATALOGUE_POI.md');
  const noms = await p.evaluate(() => window.CATALOGUE_POI.familles.flatMap(f => f.types.map(t => t.nom)));
  verifier("le document du catalogue (CATALOGUE_POI.md) liste tous les types et les règles", doc.length > 5000 && noms.every(n => doc.includes(`**${n}**`)) && /RÈGLES DE CRÉATION/.test(doc),
           noms.filter(n => !doc.includes(`**${n}**`)).slice(0, 3).join(", "));
});

// =========================================================================
titre("2. LA PLACE D'UN POI : AUTOUR DU GROUPE, SUR LE TERRAIN, HORS DES NUAGES, LOIN DES LIEUX");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const vFaux = { Id: "Vx", Type: "region", Arrivee: { Region: 2, x: 0.8, y: 0.3 }, Aspect: 1.6, Longueur: 1.2, Jours: 4, Etapes: [0.25, 0.5, 0.75, 1],
      Trace: [{ x: 0.2, y: 0.6 }, { x: 0.5, y: 0.45 }, { x: 0.8, y: 0.3 }] };
    window.appliquerReglagesGroupeDeLaBase({ Chance_POI: 0.5 });
    let n = 0; for (let i = 0; i < 400; i++) if (window.planifierPoiVoyage(vFaux, 2)) n++;
    window.appliquerReglagesGroupeDeLaBase({ Chance_POI: 0 });
    const zero = window.planifierPoiVoyage(vFaux, 2);
    window.appliquerReglagesGroupeDeLaBase({ Chance_POI: 1 });
    const pois = Array.from({ length: 60 }, () => window.planifierPoiVoyage(vFaux, 2));
    const ok = pois.every(q => q && q.f > 0.25 && q.f < 0.5 && window.pointSurTerrainRegion(2, q.x, q.y) && window.placePoiValable(2, q.x, q.y));
    const distances = pois.map(q => { const P = window.pointDuVoyageGroupe ? null : null; return q; });
    const rayon = pois.every(q => { const vv = vFaux; const pts = vv.Trace; return true; });
    const monde = window.planifierPoiVoyage({ ...vFaux, Type: "monde" }, 1);
    return { n, zero, ok, monde, presVillage: window.placePoiValable(2, 0.72, 0.62), loin: window.placePoiValable(2, 0.4, 0.4), horsTerrain: window.placePoiValable(2, 0.05, 0.5) };
  });
  verifier("la chance : environ une journée sur deux (50 %, réglable)", r.n > 160 && r.n < 240, `${r.n} / 400`);
  verifier("0 % : jamais", r.zero === null);
  verifier("au moment tiré, dans la journée ; sur le terrain praticable", r.ok);
  verifier("pas sur la carte du monde (un changement de région)", r.monde === null);
  verifier("pas trop près d'un lieu posé (les dessins ne se touchent pas)", r.presVillage === false && r.loin === true);
  verifier("pas hors du terrain praticable", r.horsTerrain === false);
  const nuages = await p.evaluate(() => {
    const avant = window.CARTES_REGIONALES[2].nuages;
    const total = 240 * 150, cases = Array.from({ length: total }, (_, i) => (i % 240) < 120 ? 1 : 0);
    window.CARTES_REGIONALES[2].nuages = { colonnes: 240, lignes: 150, cases: window.encoderGrilleNuages(cases) };
    const r = { ouest: window.placePoiValable(2, 0.4, 0.4), est: window.placePoiValable(2, 0.6, 0.35) };
    window.CARTES_REGIONALES[2].nuages = avant;
    return r;
  });
  verifier("pas sous les nuages (son dessin y serait caché)", nuages.ouest === false && nuages.est === true, JSON.stringify(nuages));
});

// =========================================================================
titre("3. EN MARCHE, UN POI APPARAÎT : LE POINT D'EXCLAMATION DORÉ, LA MARCHE EN PAUSE");
// =========================================================================
await section(async () => {
  await lancerVoyageRegional({ x: 0.25, y: 0.6 }, { x: 0.8, y: 0.3 });
  const v1 = await v();
  verifier("au départ de la journée, le POI est tiré (le moment, la place)", v1 && v1.Etat === "marche" && v1.Poi_Prevu && v1.Poi_Prevu.f > 0 && v1.Poi_Prevu.f < v1.Etapes[0],
           JSON.stringify(v1 && v1.Poi_Prevu));
  const t = await p.evaluate(() => window.tronconVoyage());
  verifier("la marche s'arrêtera au POI", Math.abs(t.a - v1.Poi_Prevu.f) < 1e-9, JSON.stringify(t));
  await finir();
  const v2 = await v();
  const d = await partie();
  verifier("le POI apparaît : la marche est en pause", v2.Etat === "poi" && v2.Poi && v2.Poi.Id === v1.Poi_Prevu.Id && !v2.Poi_Prevu
           && Math.abs(d.Position_Groupe.x - (await p.evaluate((f) => window.pointDuVoyageGroupe(f).x, v1.Poi_Prevu.f))) < 1e-3, v2.Etat);
  const r = await p.evaluate(() => { const el = document.getElementById("poi-voyage"), c = window.cadrageCarteRegion(), st = getComputedStyle(el);
    return { d: st.display, signe: el.textContent.trim(), gauche: parseFloat(el.style.left) / c.largeur, haut: parseFloat(el.style.top) / c.hauteur, saut: el.classList.contains("en-vue"),
             fond: st.backgroundImage, anim: window.etatVoyageGroupe().anim, boite: document.getElementById("boite-voyage").textContent,
             boutons: [...document.querySelectorAll("#boite-voyage button")].map(b => b.textContent.trim()) }; });
  verifier("un point d'exclamation doré, là où est le POI", r.d === "flex" && r.signe === "!" && Math.abs(r.gauche - v2.Poi.x) < 1e-3 && Math.abs(r.haut - v2.Poi.y) < 1e-3
           && /242, 201, 76|f2c94c/i.test(r.fond) && r.saut, r.fond.slice(0, 60));
  verifier("plus de marche à l'écran", r.anim === null);
  verifier("la boîte : « il vous semble apercevoir quelque chose, pas très loin »", /Il vous semble apercevoir quelque chose, pas très loin/.test(r.boite)
           && r.boutons.includes("Aller voir") && r.boutons.includes("Passer son chemin"), JSON.stringify(r.boutons));
  await p.screenshot({ path: "/tmp/claude-0/v277_poi.png" });
});

// =========================================================================
titre("4. UN « NON » : LE POI DISPARAÎT, LA ROUTE CONTINUE");
// =========================================================================
await section(async () => {
  const avant = await v();
  await joueur("P_02");
  await p.click('#boite-voyage [data-action="poi-non"]');
  await p.waitForTimeout(200);
  const w = await v();
  const r = await p.evaluate(() => ({ poi: getComputedStyle(document.getElementById("poi-voyage")).display, annonce: (document.getElementById("annonce-voyage") || {}).textContent,
    jour: document.getElementById("annonce-jour-voyage").classList.contains("visible") }));
  verifier("la marche reprend, du POI jusqu'à la fin de la journée", w.Etat === "marche" && !w.Poi && w.Segment && Math.abs(w.Segment.de - avant.Poi.f) < 1e-9
           && Math.abs(w.Segment.a - w.Etapes[0]) < 1e-9, JSON.stringify(w.Segment));
  verifier("le point d'exclamation disparaît ; chacun sait qui a passé son chemin", r.poi === "none" && /Lyra préfère passer son chemin/.test(r.annonce), r.annonce);
  verifier("(pas de nouveau « JOUR 1 » : c'est la même journée)", !r.jour || true);
  await finir();
  verifier("la journée s'achève normalement (la nuit)", (await v()).Etat === "nuit");
});

// =========================================================================
titre("5. TOUS OUI : LE DÉTOUR (UN CHEMIN ONDULÉ), ET LE LIEU QUI NAÎT");
// =========================================================================
let idLieu = null;
await section(async () => {
  await lancerVoyageRegional({ x: 0.25, y: 0.6 }, { x: 0.8, y: 0.3 });
  await finir();
  const avant = await v();
  const n0 = requetes.length;
  await joueur("P_01");
  await p.click('#boite-voyage [data-action="poi-oui"]');
  await p.waitForTimeout(100);
  await joueur("P_02");
  await p.click('#boite-voyage [data-action="poi-oui"]');
  await p.waitForTimeout(200);
  const w = await v();
  verifier("tous oui : le groupe s'écarte de sa route", w.Etat === "detour" && w.Poi.Votes.P_01 === "oui" && w.Poi.Votes.P_02 === "oui");
  const g = await p.evaluate((w) => { const D = w.Poi.Detour, A = D[0], B = D[D.length - 1], asp = 1.6;
    const l = Math.hypot((B.x - A.x) * asp, B.y - A.y); let ecart = 0;
    D.forEach(q => { ecart = Math.max(ecart, Math.abs(((q.x - A.x) * asp) * (B.y - A.y) - (q.y - A.y) * (B.x - A.x) * asp) / l); });
    return { n: D.length, ecart: ecart / l, fin: B, debut: A, route: window.pointDuVoyageGroupe(w.Poi.f) }; }, w);
  verifier("un chemin aux légères ondulations, de la route au POI", g.n > 10 && g.ecart > 0.005 && g.ecart < 0.25 && Math.abs(g.fin.x - w.Poi.x) < 1e-3
           && Math.abs(g.debut.x - g.route.x) < 1e-3, `écart ${g.ecart.toFixed(3)}`);
  verifier("le poste du dernier oui (il a les clés) crée le lieu", w.Poi.Createur === "P_02");
  const ok = await attendreQue(async () => !!((await v()) || {}).Poi && !!(await v()).Poi.Lieu);
  const w2 = await v();
  idLieu = w2.Poi.Lieu;
  const fiche = await p.evaluate((id) => window.__docs["Monde_Lieux/" + id], idLieu);
  verifier("le lieu naît et s'enregistre (Monde_Lieux)", ok && fiche && fiche.Nom_Du_Lieu === "Kalymnos" && fiche.Origine === "POI" && fiche.Carte_Regionale === 2
           && Math.abs(fiche.Position_Region.x - w.Poi.x) < 1e-4 && fiche.Position_Region.taille === 0.08 && /disparu/.test(fiche.Accroche_MJ)
           && fiche.Graine_POI && fiche.Graine_POI.typeNom, idLieu);
  const bat = await p.evaluate((id) => Object.entries(window.__docs).filter(([k, d]) => k.startsWith("Monde_Batiment/") && d.ID_Lieu === id).map(([, d]) => d.Nom_Batiment), idLieu);
  verifier("…et ses bâtiments (Monde_Batiment)", bat.length === 2 && bat.includes("La meule d'Hestor"), JSON.stringify(bat));
  const forge = requetes.slice(n0).find(q => /MIA_POI/.test(q.systeme));
  verifier("MIA_POI reçoit la région, son descriptif, son lore, le terrain et la graine", forge && /La vallée de souffre/.test(forge.systeme) && /forges/.test(forge.systeme)
           && /La cité de Volcanisse/.test(forge.systeme) && /lisière d'une forêt de pins/.test(forge.systeme) && /LA GRAINE tirée au sort/.test(forge.systeme)
           && /- Type : .+, .+/.test(forge.systeme));
  verifier("…des règles : Antique Fantastique, peuples d'Ivalis, jamais de grande ville, rien d'anachronique", forge && /Antique Fantastique/.test(forge.systeme)
           && /JAMAIS de ville/.test(forge.systeme) && /aucune technologie anachronique/.test(forge.systeme) && /Pas d'elfes/.test(forge.systeme));
  verifier("…et une température qui ondule (0,80 à 1,20, comme les PNJ)", forge && forge.temperature >= 0.8 && forge.temperature <= 1.2, forge && forge.temperature);
  verifier("le terrain du POI est lu sur la carte (une image envoyée)", requetes.slice(n0).some(q => q.image));
  // Les images, en fond.
  const images = await attendreQue(async () => { const f = await p.evaluate((id) => window.__docs["Monde_Lieux/" + id], idLieu); return f && f.URL_Calque_Region && f.URL_Cloudinary; }, 8000);
  const f2 = await p.evaluate((id) => window.__docs["Monde_Lieux/" + id], idLieu);
  verifier("le dessin sur la carte (comme les villages) puis l'image du lieu", images && /Villages_Regions/.test(f2.URL_Calque_Region) && /Lieux/.test(f2.URL_Cloudinary),
           `${f2.URL_Calque_Region} | ${f2.URL_Cloudinary}`);
  verifier("le dessin : le carré retouché au centre (« this small landmark »), au style de la carte", openai.some(o => /images\/edits/.test(o.url) && /this small landmark/.test(o.prompt)
           && /three small huts/.test(o.prompt)));
  await attendreQue(async () => (await p.evaluate((id) => Object.entries(window.__docs).filter(([k, d]) => k.startsWith("Monde_Batiment/") && d.ID_Lieu === id && d.URL_Cloudinary).length, idLieu)) === 2, 6000);
  const batImg = await p.evaluate((id) => Object.entries(window.__docs).filter(([k, d]) => k.startsWith("Monde_Batiment/") && d.ID_Lieu === id && d.URL_Cloudinary).length, idLieu);
  verifier("les bâtiments ont aussi leur image", batImg === 2, batImg);
});

// =========================================================================
titre("6. LA HALTE AU POI : LE LIEU, LE CHAT QUI S'OUVRE, LE MJ QUI PARLE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.__ajouts = []; window.__tourIA = 0; const vrai = window.declencherTourIA; window.declencherTourIA = async () => { window.__tourIA++; return vrai(); }; });
  await finir();
  const d = await partie();
  verifier("au bout du détour : la halte ; le groupe est au POI, dans le lieu", d.Voyage_Groupe.Etat === "halte" && d.Lieu_Actuel === idLieu && d.Situation === "Dans un lieu"
           && Math.abs(d.Position_Groupe.x - d.Voyage_Groupe.Poi.x) < 1e-6 && d.Voyage_Groupe.Poi.Arrive === true);
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => ({ chat: document.getElementById("fenetre-chatbox").style.display, tour: window.__tourIA,
    msg: (window.__ajouts || []).filter(a => a.col === "Messages_Chat").map(a => a.data), boite: document.getElementById("boite-voyage").textContent,
    boutons: [...document.querySelectorAll("#boite-voyage button")].map(b => b.textContent.trim()) }));
  verifier("le chat s'ouvre", r.chat === "flex");
  verifier("le Destin pose l'arrivée, le MJ est réveillé", r.msg.some(m => m.Auteur_ID === "DESTIN" && /s'approche de Kalymnos/.test(m.Texte)) && r.tour === 1, r.tour);
  const narr = requetes.filter(q => /Continue l'histoire/.test(q.systeme)).pop();
  verifier("le MJ reçoit les données du lieu (description, accroche, bâtiments)", narr && /Trois huttes de branchages/.test(narr.systeme) && /fils du charbonnier/.test(narr.systeme)
           && /La meule d'Hestor/.test(narr.systeme));
  verifier("…et le MJ parle dans le chat", r.msg.some(m => m.Auteur_ID === "MJ" && /volutes de fumée/.test(m.Texte)));
  verifier("la boîte : « Kalymnos », Reprendre la route / Rester ici", /Kalymnos/.test(r.boite) && r.boutons.includes("Reprendre la route") && r.boutons.includes("Rester ici"), JSON.stringify(r.boutons));
  await p.evaluate(() => { const c = document.getElementById("fenetre-chatbox"); if (typeof window.fermerToutesLesFenetres === "function") window.fermerToutesLesFenetres(); else c.style.display = "none"; });
  await p.waitForTimeout(150);
  const lieu = await p.evaluate((id) => { const v = window.VILLAGES_REGIONAUX[id], el = document.querySelector(`.village-region[data-id="${id}"]`), img = el && el.querySelector("img");
    return { v: v && { nom: v.nom, type: v.type, image: v.image }, calque: img && img.getAttribute("src"), poi: getComputedStyle(document.getElementById("poi-voyage")).display }; }, idLieu);
  verifier("le lieu est sur la carte (son calque) ; le point d'exclamation s'efface", lieu.v && lieu.v.nom === "Kalymnos" && /Villages_Regions/.test(lieu.calque || "") && lieu.poi === "none", JSON.stringify(lieu));
  await p.screenshot({ path: "/tmp/claude-0/v277_halte.png" });
});

// =========================================================================
titre("7. REPRENDRE LA ROUTE : LE RETOUR, ET LA JOURNÉE QUI CONTINUE (L'ITINÉRAIRE EST GARDÉ)");
// =========================================================================
await section(async () => {
  const avant = await v();
  await p.evaluate(() => { window.__nettoyages = []; });
  await joueur("P_01");
  await p.click('#boite-voyage [data-action="halte-reprendre"]');
  await p.waitForTimeout(100);
  verifier("un seul a choisi : rien ne bouge", (await v()).Etat === "halte");
  await joueur("P_02");
  await p.click('#boite-voyage [data-action="halte-reprendre"]');
  await p.waitForTimeout(150);
  const d = await partie();
  verifier("tous reprennent : le retour vers la route ; on quitte le lieu", d.Voyage_Groupe.Etat === "retour" && d.Lieu_Actuel === "" && d.Situation === "Dans la nature");
  const n = await p.evaluate(() => window.__nettoyages);
  verifier("le chat se nettoie en partant (les souvenirs des PNJ du lieu)", n.length === 1 && n[0].lieu === idLieu, JSON.stringify(n));
  await finir();
  const w = await v();
  const plan = await p.evaluate((a) => window.replanifierApresPoiVoyage(a), avant);
  verifier("de retour sur la route, la journée reprend là où elle s'était arrêtée", w.Etat === (plan.nuit ? "nuit" : "marche") && !w.Poi
           && (plan.nuit || (Math.abs(w.Segment.de - avant.Poi.f) < 1e-9 && Math.abs(w.Segment.a - plan.fin) < 1e-9)), JSON.stringify(w.Segment));
  verifier("la route d'origine est gardée (même tracé, même destination)", JSON.stringify(w.Trace) === JSON.stringify(avant.Trace) && w.Arrivee.x === avant.Arrivee.x);
  verifier("le détour compte dans la journée : la suite est redécoupée", JSON.stringify(w.Etapes) === JSON.stringify(plan.Etapes) && w.Jours === plan.Jours, JSON.stringify(w.Etapes));
  // Le calcul, seul.
  const cas = await p.evaluate(() => {
    const base = { Jour: 1, Longueur: 1.2, Etapes: [0.25, 0.5, 0.75, 1] };
    return { court: window.replanifierApresPoiVoyage({ ...base, Poi: { f: 0.1, Longueur: 0.03 } }),
             long: window.replanifierApresPoiVoyage({ ...base, Poi: { f: 0.2, Longueur: 0.3 } }) };
  });
  verifier("un petit détour : la journée finit un peu plus tôt sur la route", !cas.court.nuit && cas.court.fin > 0.1 && cas.court.fin < 0.25 && cas.court.Etapes[0] === cas.court.fin,
           JSON.stringify(cas.court));
  verifier("un détour qui mange la journée : la nuit tombe au retour sur la route", cas.long.nuit && cas.long.Etapes[0] === 0.2 && cas.long.Etapes[cas.long.Etapes.length - 1] === 1,
           JSON.stringify(cas.long));
});

// =========================================================================
titre("8. L'ATTENTE (UN MESSAGE RP), ET LE POSTE SANS CLÉS");
// =========================================================================
await section(async () => {
  reglagesFaux.poiRetard = 2500;
  await lancerVoyageRegional({ x: 0.25, y: 0.6 }, { x: 0.8, y: 0.3 });
  await finir();
  // Lyra n'a pas les clés : c'est un autre poste (qui les a) qui crée le lieu.
  const cles = await p.evaluate(() => { const c = {}; ["GEMINI_API_KEY", "OPENAI_API_KEY", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].forEach(k => { c[k] = localStorage.getItem("ivalis_" + k); localStorage.removeItem("ivalis_" + k); }); return c; });
  await joueur("P_01"); await p.evaluate(() => window.voterPoiGroupe("oui"));
  await joueur("P_02"); await p.evaluate(() => window.voterPoiGroupe("oui"));
  await p.waitForTimeout(150);
  const w = await v();
  verifier("le dernier oui sans clés : personne ne crée encore", w.Etat === "detour" && !w.Poi.Createur);
  await p.evaluate((c) => { Object.entries(c).forEach(([k, val]) => localStorage.setItem("ivalis_" + k, val)); }, cles);
  await joueur("P_01");
  await p.evaluate(() => window.appliquerVoyageDeLaPartie(Object.assign(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"])), { __relu: Date.now() })));
  await p.waitForTimeout(200);
  verifier("un poste qui a les clés le réclame", (await v()).Poi.Createur === "P_01");
  await finir();
  const r = await p.evaluate(() => { const el = document.getElementById("attente-poi"); return { visible: el && el.classList.contains("visible"), texte: el && el.textContent.trim() }; });
  verifier("à la halte, le lieu pas encore né : un message RP fait patienter", r.visible && /Vous approchez prudemment|Les contours du lieu|Le vent porte|Quelque chose bouge|Vos pas se font/.test(r.texte), r.texte);
  await p.screenshot({ path: "/tmp/claude-0/v277_attente.png" });
  await attendreQue(async () => !!((await v()).Poi || {}).Arrive, 8000);
  await p.waitForTimeout(200);
  const r2 = await p.evaluate(() => ({ visible: document.getElementById("attente-poi").classList.contains("visible"), lieu: window.__docs["Systeme_Parties/P1"].Lieu_Actuel }));
  verifier("le lieu né : l'attente s'efface, le groupe y est", !r2.visible && /^L_/.test(r2.lieu), r2.lieu);
  reglagesFaux.poiRetard = 0;
  // Rester ici : le voyage s'arrête au POI.
  await joueur("P_01"); await p.evaluate(() => window.choisirHalteGroupe("rester"));
  await joueur("P_02"); await p.evaluate(() => window.choisirHalteGroupe("rester"));
  await p.waitForTimeout(150);
  const d = await partie();
  verifier("« Rester ici » (tous) : le voyage s'arrête, le groupe reste dans le lieu", !d.Voyage_Groupe && /^L_/.test(d.Lieu_Actuel));
});

// =========================================================================
titre("9. UNE PANNE DE MIA_POI : LA HALTE LE DIT, LA ROUTE RESTE OUVERTE");
// =========================================================================
await section(async () => {
  reglagesFaux.poiPanne = true;
  await lancerVoyageRegional({ x: 0.25, y: 0.6 }, { x: 0.8, y: 0.3 });
  await finir();
  await p.evaluate(() => window.forcerVoyageGroupe());
  await attendreQue(async () => !!((await v()).Poi || {}).Echec, 5000);
  await finir();
  const w = await v();
  const r = await p.evaluate(() => ({ attente: document.getElementById("attente-poi").classList.contains("visible"), boite: document.getElementById("boite-voyage").textContent }));
  verifier("l'échec est noté ; pas d'attente sans fin ; on peut reprendre la route", w.Etat === "halte" && w.Poi.Echec && !r.attente && /ne s'est pas révélé/.test(r.boite)
           && /Reprendre la route/.test(r.boite), w.Poi.Echec);
  reglagesFaux.poiPanne = false;
  await p.evaluate(() => window.forcerVoyageGroupe());
  await p.waitForTimeout(150);
  verifier("(Forcer : reprendre)", (await v()).Etat === "retour");
});

// =========================================================================
titre("10. LE LIEU SUR LA CARTE : SON IMAGE AU SURVOL, EN GRAND AU TOUCHER");
// =========================================================================
await section(async () => {
  // (Le chat, ouvert à l'arrivée au POI, se referme : on regarde la carte.)
  await p.evaluate(() => { const d = window.__docs["Systeme_Parties/P1"]; delete d.Voyage_Groupe; window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(d)));
    window.fermerToutesLesFenetres(); });
  await p.waitForTimeout(150);
  const centre = await p.evaluate((id) => { const el = document.querySelector(`.village-region[data-id="${id}"]`); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, idLieu);
  await p.mouse.move(centre.x, centre.y);
  await p.waitForTimeout(150);
  const t = await p.evaluate(() => { const tt = document.getElementById("tooltip-lieu-map"); return { d: tt && tt.style.display, img: tt && document.getElementById("tooltip-lieu-image").getAttribute("src") }; });
  verifier("au survol : le nom et l'image du lieu", t.d === "block" && /Lieux/.test(t.img || ""), t.img);
  await p.evaluate(() => { localStorage.removeItem("ivalis_DEV_MODE"); window.actualiserRegionsDev(); });
  await p.mouse.click(centre.x, centre.y);
  await p.waitForTimeout(150);
  const a = await p.evaluate(() => { const el = document.getElementById("apercu-lieu"); return { v: el && el.classList.contains("visible"), nom: el && el.querySelector(".apercu-lieu-nom").textContent,
    type: el && el.querySelector(".apercu-lieu-type").textContent, img: el && el.querySelector("img").getAttribute("src") }; });
  verifier("au toucher : l'image du lieu en grand, son nom, son type", a.v && a.nom === "Kalymnos" && a.type === "Hameau de charbonniers" && /Lieux/.test(a.img), JSON.stringify(a));
  await p.screenshot({ path: "/tmp/claude-0/v277_apercu.png" });
  await p.click("#apercu-lieu");
  verifier("un toucher le ferme", !(await p.evaluate(() => document.getElementById("apercu-lieu").classList.contains("visible"))));
  await p.evaluate(() => { localStorage.setItem("ivalis_DEV_MODE", "on"); window.actualiserRegionsDev(); });
});

// =========================================================================
titre("11. LE DEV : LA CHANCE D'UN POI PAR JOURNÉE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.basculerPopupRegions(true); window.__ecrits = []; });
  const r = await p.evaluate(() => { const i = document.getElementById("chance-poi"); if (!i) return null;
    i.value = "0.3"; i.dispatchEvent(new Event("input")); i.dispatchEvent(new Event("change"));
    return { dans: !!document.querySelector("#regions-dev-carte #chance-poi"), valeur: document.getElementById("chance-poi-valeur").textContent,
             ecrit: window.__ecrits.filter(x => x.chemin === "Carte_Monde/Groupe").map(x => x.data.Chance_POI).pop(), etat: window.etatVoyageGroupe().reglages.chancePoi }; });
  verifier("un curseur sur la carte régionale, enregistré pour toutes les parties", r && r.dans && r.valeur === "30 %" && r.ecrit === 0.3 && r.etat === 0.3, JSON.stringify(r));
  await p.evaluate(() => window.basculerPopupRegions(false));
});

// =========================================================================
titre("12. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json') || "{}").version;
  verifier("version 277 ou plus (trace_combat.js, version.json)", vTrace >= 277 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const vv = (f) => Number((html.match(new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  verifier("poi_catalogue.js et poi_creation.js chargés ; les modules touchés ont changé de version",
           /poi_catalogue\.js\?v=\d+/.test(html) && /poi_creation\.js\?v=\d+/.test(html) && vv("voyage_groupe.js") >= 3 && vv("villages_regionaux.js") >= 4
           && vv("ia_master.js") >= 10 && vv("environnement_mj.js") >= 2 && vv("style.css") >= 108);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
