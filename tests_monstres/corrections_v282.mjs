// v282 — PENDANT UN COMBAT DU RÉCIT, LE GROUPE NE BOUGE PAS ; LES BORDS DE
// PARCHEMIN DES CARTES.
//
// Nico : « quand un combat RP est en cours, bloque la possibilité de se
// déplacer sur la map » ; « sur les bords de mes images de map globale et de
// maps régionales, un effet de bord de parchemin usé, un peu déchiré, noirci à
// quelques endroits, peut-être parfois un peu de trous, de façon aléatoire et
// procédurale ».
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

const S = '/tmp/claude-0/-home-user-Ivalis/3718c626-55b5-577c-9b4f-a49012fd3784/scratchpad';

// =========================================================================
titre("1. UN COMBAT DU RÉCIT EN COURS : LE GROUPE NE SE DÉPLACE PAS");
// =========================================================================
await section(async () => {
  await ecrirePartie({ Voyage_Groupe: null, Position_Groupe: { Region: 2, x: 0.4, y: 0.5 }, Lieu_Actuel: "", Combat_RP: { Etat: "en_cours", Id: "C1" } });
  await joueur("P_01");
  const r = await p.evaluate(async () => {
    window.__annonces = [];
    const b = document.getElementById("btn-voyage");
    const mode = window.basculerModeVoyage(true);
    const annonce = (document.getElementById("annonce-voyage") || document.querySelector(".annonce-voyage") || {}).textContent || document.body.textContent.includes("Un combat est en cours") ;
    return { mode, choix: window.choixVoyageGroupe(), bloque: b && b.classList.contains("bloque"), titre: b && b.title, annonce: String(annonce), drapeau: typeof window.deplacementBloqueParCombat === "function" && window.deplacementBloqueParCombat() };
  });
  verifier("le bouton voyage est éteint, son titre le dit", r.bloque && /combat est en cours/.test(r.titre), r.titre);
  verifier("toucher « Voyager » : rien (le mode voyage ne s'ouvre pas), et on le dit", r.mode === false && r.choix === null && r.drapeau && /combat est en cours|true/.test(r.annonce), JSON.stringify(r));
  const prop = await p.evaluate(() => window.proposerVoyageGroupe({ type: "region", depart: { Region: 2, x: 0.4, y: 0.5 }, arrivee: { Region: 2, x: 0.6, y: 0.5 }, trace: [{ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }], longueur: 0.3, jours: 2, etapes: [0.5, 1] }));
  verifier("proposer un voyage (même par le code) : refusé", prop && prop.combat === true && !(await v()), JSON.stringify(prop));
  // Un vote ouvert avant le combat : « oui » ne fait pas partir, « non » reste possible.
  await ecrirePartie({ Combat_RP: null });
  await lancerVoyageRegional({ x: 0.25, y: 0.6 }, { x: 0.8, y: 0.3 });
  await finir();                                   // la nuit (ou un POI) tombe
  await p.evaluate(() => window.appliquerReglagesGroupeDeLaBase({ Chance_POI: 0 }));
  let w = await v();
  if (w && w.Etat === "poi") { await p.evaluate(() => window.voterPoiGroupe("non")); await finir(); w = await v(); }
  await ecrirePartie({ Combat_RP: { Etat: "en_cours", Id: "C2" } });
  const nuit = await p.evaluate(async () => ({ repartir: await window.choisirNuitVoyageGroupe("repartir"), forcer: await window.forcerVoyageGroupe() }));
  const w2 = await v();
  verifier("la nuit pendant un combat : « Repartir à l'aube » refusé (même forcé), le camp reste", w && w.Etat === "nuit" && nuit.repartir.combat && nuit.forcer.combat && w2.Etat === "nuit" && w2.Jour === w.Jour,
           JSON.stringify([w && w.Etat, nuit]));
  const reste = await p.evaluate(async () => window.choisirNuitVoyageGroupe("rester", { forcer: true }));
  verifier("…« Rester ici » reste permis (on ne bouge pas)", !(await v()) && reste && reste.reste === true, JSON.stringify(reste));
  // Le combat fini : on peut repartir.
  await ecrirePartie({ Combat_RP: null });
  const apres = await p.evaluate(() => { const m = window.basculerModeVoyage(true); const b = document.getElementById("btn-voyage"); const r = { m, bloque: b.classList.contains("bloque") }; window.basculerModeVoyage(false); return r; });
  verifier("le combat fini : le voyage revient", apres.m === true && !apres.bloque, JSON.stringify(apres));
  // Un combat qui commence ferme le mode voyage ouvert.
  const ferme = await p.evaluate(() => { window.basculerModeVoyage(true); return !!window.choixVoyageGroupe(); });
  await ecrirePartie({ Combat_RP: { Etat: "preparation", Id: "C3" } });
  const ferme2 = await p.evaluate(() => window.choixVoyageGroupe());
  verifier("un combat qui commence (même en préparation) ferme le mode voyage ouvert", ferme && ferme2 === null);
  await ecrirePartie({ Combat_RP: null });
});

// =========================================================================
titre("2. LES BORDS DE PARCHEMIN : DÉCHIRÉS, NOIRCIS PAR ENDROITS, PARFOIS TROUÉS");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const B = window.BordsParchemin, W = 640, H = 400, s = Math.min(W, H);
    if (!B) return { e: [], meme: false, differents: 0 };
    const etude = (g) => {
      const { masque: m, usure: o } = B.calculer(W, H, g);
      const a = (x, y) => m[(y * W + x) * 4 + 3];
      // La déchirure le long du bord haut : où la carte commence, colonne par colonne.
      const debuts = []; for (let x = 0; x < W; x += 4) { let y = 0; while (y < H / 2 && a(x, y) < 128) y++; debuts.push(y); }
      const moy = debuts.reduce((q, z) => q + z, 0) / debuts.length, ecart = Math.sqrt(debuts.reduce((q, z) => q + (z - moy) ** 2, 0) / debuts.length);
      let sauts = 0; for (let i = 1; i < debuts.length; i++) sauts = Math.max(sauts, Math.abs(debuts[i] - debuts[i - 1]));
      // Les trous : des pixels percés, loin du bord.
      let perces = 0; const marge = Math.round(0.07 * s);
      for (let y = marge; y < H - marge; y++) for (let x = marge; x < W - marge; x++) if (a(x, y) < 128) perces++;
      // L'usure : du noir (brûlé) par endroits, du brun ailleurs ; rien au cœur.
      let noir = 0, brun = 0, coeur = 0;
      for (let i = 0; i < W * H; i++) { const al = o[i * 4 + 3]; if (m[i * 4 + 3] < 200 || al < 120) continue; const lum = (o[i * 4] + o[i * 4 + 1] + o[i * 4 + 2]) / 3; if (lum < 45) noir++; else if (lum < 130) brun++; }
      for (let y = Math.round(0.2 * H); y < 0.8 * H; y++) for (let x = Math.round(0.2 * W); x < 0.8 * W; x++) coeur = Math.max(coeur, o[(y * W + x) * 4 + 3]);
      return { centre: a(W >> 1, H >> 1), coin: a(0, 0), moy: moy / s, ecart: ecart / s, sauts, perces, noir, brun, coeur, somme: m.reduce((q, z, i) => (i & 3) === 3 ? (q + z * (i % 97)) % 1000003 : q, 0) };
    };
    const graines = Array.from({ length: 12 }, (_, i) => i * 7919 + 13);
    const e = graines.map(etude);
    const e0bis = etude(graines[0]);
    return { e, meme: e0bis.somme === e[0].somme, differents: new Set(e.map(x => x.somme)).size };
  });
  const e = r.e;
  verifier("le cœur de la carte intact ; les coins rongés", e.length === 12 && e.every(x => x.centre === 255 && x.coin === 0 && x.coeur === 0), JSON.stringify(e.map(x => [x.centre, x.coin, x.coeur])));
  // v284 : le bord sans peinture est plus fin (moins de 1 % en moyenne).
  verifier("un bord déchiré : la ligne ondule et se déchiquette (pas une règle)", e.length === 12 && e.every(x => x.ecart > 0.004 && x.moy > 0.003 && x.moy < 0.08 && x.sauts >= 2),
           JSON.stringify(e.slice(0, 4).map(x => [x.moy.toFixed(3), x.ecart.toFixed(4), x.sauts])));
  // v283 — Nico : « que ça aille moins sur la carte » ; les trous et les
  // brûlures ne naissent plus que là où le DEV a peint l'usure
  // (corrections_v283.mjs) : sans zone peinte, un bord fin et bruni.
  const troues = e.filter(x => x.perces > 20).length;
  verifier("(v283) sans zone peinte : aucun trou", troues === 0, `${troues} cartes trouées sur 12`);
  verifier("(v283) sans zone peinte : bruni, pas brûlé", e.length === 12 && e.every(x => x.noir < 200 && x.brun > 300), JSON.stringify(e.slice(0, 4).map(x => [x.noir, x.brun])));
  verifier("aléatoire mais stable : une même carte a toujours le même bord, chaque carte le sien", r.meme && r.differents === 12, `${r.differents} bords différents`);
  // Sur la page : la carte du monde, la carte régionale ouverte.
  await attendreQue(async () => await p.evaluate(() => !!document.querySelector("#carte-fond-jeu > .parchemin-usure") && !!document.querySelector("#carte-region > .parchemin-usure")), 10000);
  const page = await p.evaluate(async () => {
    if (!window.BordsParchemin) return { monde: false, region: false, ordre: [], fond: getComputedStyle(document.getElementById("conteneur-carte-fond")).backgroundColor, ouvrier: false, graines: [0, 0] };
    const monde = document.getElementById("carte-fond-jeu"), region = document.getElementById("carte-region");
    const masque = (el) => el.style.webkitMaskImage || el.style.maskImage || "";
    const usureR = region.querySelector(":scope > .parchemin-usure");
    const enfants = [...region.children].map(x => x.id || x.className);
    return { monde: /^url\(/.test(masque(monde)) && monde.firstElementChild.classList.contains("parchemin-usure"),
             taille: getComputedStyle(monde).webkitMaskSize || getComputedStyle(monde).maskSize,
             region: /^url\(/.test(masque(region)) && !!usureR, ordre: enfants.slice(0, 4), fond: getComputedStyle(document.getElementById("conteneur-carte-fond")).backgroundColor,
             ouvrier: window.BordsParchemin.ouvrier(), graines: [window.graineParcheminRegion(1), window.graineParcheminRegion(2)] };
  });
  verifier("la carte du monde : découpée, son usure posée sous tout le reste", page.monde && /100%/.test(page.taille || ""), JSON.stringify([page.monde, page.taille]));
  verifier("la carte régionale : découpée (image, nuages, lieux), l'usure juste sur l'image", page.region && page.ordre[0] === "carte-region-image" && page.ordre[1] === "parchemin-usure", JSON.stringify(page.ordre));
  verifier("posées sur un fond sombre, comme sur une table", page.fond === "rgb(26, 20, 12)", page.fond);
  verifier("calculé à part (un Worker) : la traversée des nuages ne s'arrête pas", page.ouvrier === true);
  verifier("chaque carte régionale a sa graine", page.graines[0] !== page.graines[1]);
  await p.screenshot({ path: S + "/v282_region.png" });
});

// =========================================================================
titre("3. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json') || "{}").version;
  verifier("version 282 ou plus (trace_combat.js, version.json)", vTrace >= 282 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const vv = (f) => Number((html.match(new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  verifier("bords_parchemin.js chargé avant les cartes ; les modules touchés ont changé de version",
           /bords_parchemin\.js\?v=\d+/.test(html) && html.indexOf("bords_parchemin.js") < html.indexOf("cartes_regionales.js?v=")
           && vv("cartes_regionales.js") >= 7 && vv("voyage_groupe.js") >= 5 && vv("style.css") >= 112);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
