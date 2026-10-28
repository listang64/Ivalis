// v281 — LA LISTE DE NICO : LE POI OÙ L'ON EST, LES CARRÉS DE MOITIÉ, LE NOM
// DES LIEUX À LA PLUME, LE « ! » DORÉ, L'IMAGE DU GROUPE RÉGLABLE, LA
// CONNEXION AUTOMATIQUE, LE FEU DE CAMP, LE TOUR DE PAROLE, LA JOURNÉE À 20 %.
//
// Nico : « quand le groupe décide d'aller voir un POI, une fois arrivés ils y
// sont : pas besoin de demander s'ils veulent rester une fois le RP lancé » ;
// « réduis par deux la taille des carrés des villages et POI, n'affiche plus
// le carré jaune au survol, et le dessin dans le carré doit prendre plus de
// place pour ne pas perdre en taille » ; « dans le panneau DEV, un outil pour
// modifier la taille et la position de l'image du groupe sur la map, pour
// qu'elle pointe exactement où il se trouve ; bouton d'édition activé, une
// croix rouge précisément là où est le groupe » ; « dans le menu compte, une
// case à cocher : connexion automatique » ; « la nuit, en déplacement :
// Repartir (renommé Repartir à l'aube), Rester, et un bouton Discuter autour du
// feu de camp qui ouvre la chatbox — d'ailleurs, quand on l'ouvre à la main,
// l'avatar de celui à qui c'est le tour de parler n'est pas affiché » ; « sur
// l'image générée de chaque lieu ou village, en dessous, le nom du lieu en
// petit, marron foncé, style plume sur parchemin, en arc de cercle inversé,
// avec des variations aléatoires jusqu'à écrire droit » ; « le point
// d'exclamation des POI : juste le !, en doré, qui sursaute légèrement sur
// place » ; « le temps de marche avant la nuit, passe à 20 % ».
//
// Sur la VRAIE page, Firestore en mémoire (transactions), Gemini, OpenAI et
// Cloudinary simulés. Se charge sur l'ancien code (IVALIS_RACINE) : il y
// échoue, sans planter.
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
titre("1. LA JOURNÉE DE MARCHE : 20 % DE LA HAUTEUR DE LA CARTE ; LE MJ VOIT AUSSI LOIN");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => ({ d: window.DISTANCE_JOUR_VOYAGE, j: [0.19, 0.21, 0.4, 0.45].map(l => window.joursDeMarcheVoyage(l)),
    proches: (window.lieuxProchesDuGroupe ? window.lieuxProchesDuGroupe({ Position_Groupe: { Region: 2, x: 0.4, y: 0.5 }, Lieu_Actuel: "" }) : []).map(l => l.texte) }));
  verifier("une journée = 20 % de la hauteur de la carte (Nico : « passe à 20 % »)", r.d === 0.2, r.d);
  verifier("les jours suivent : 0,19 → 1 ; 0,21 → 1 ; 0,40 → 2 ; 0,45 → 3", JSON.stringify(r.j) === "[1,1,2,3]", JSON.stringify(r.j));
  verifier("le MJ connaît toujours les lieux à 0,5 carte (≈ 2,5 jours) : le rayon ne rétrécit pas", r.proches.some(t => /Brumefosse \(village\), à environ 2,5 jours de marche/.test(t)), JSON.stringify(r.proches));
});

// =========================================================================
titre("2. LE « ! » DES POI : LE SIGNE SEUL, DORÉ, QUI SURSAUTE SUR PLACE");
// =========================================================================
await section(async () => {
  await lancerVoyageRegional({ x: 0.25, y: 0.6 }, { x: 0.8, y: 0.3 });
  await finir();
  const w = await v();
  const r = await p.evaluate(() => {
    const el = document.getElementById("poi-voyage"), s = el && el.querySelector(".poi-voyage-signe");
    const st = getComputedStyle(el), ss = s && getComputedStyle(s);
    let images = []; for (const f of document.styleSheets) { try { for (const regle of f.cssRules) if (regle.name === "poi-sursaut") images.push(regle.cssText); } catch (e) {} }
    return { d: st.display, enfants: el ? el.children.length : 0, halo: !!document.querySelector(".poi-voyage-halo"), texte: el && el.textContent.trim(),
             fondPastille: st.backgroundImage, rond: st.borderRadius, fond: ss && ss.backgroundImage, clip: ss && (ss.webkitBackgroundClip || ss.backgroundClip),
             anim: ss && ss.animationName, duree: ss && ss.animationDuration, cles: images.join(" ") };
  });
  verifier("un POI en vue : le signe est là", w && w.Etat === "poi" && r.d === "flex" && r.texte === "!", w && w.Etat);
  verifier("juste le « ! » : ni pastille ronde, ni halo", r.enfants === 1 && !r.halo && r.fondPastille === "none" && (r.rond === "0px" || r.rond === ""), JSON.stringify([r.enfants, r.fondPastille, r.rond]));
  verifier("doré : un dégradé d'or dans la lettre", /247, 211, 90/.test(r.fond || "") && /text/.test(r.clip || ""), `${(r.fond || "").slice(0, 70)} ${r.clip}`);
  verifier("il sursaute sur place, en boucle (se tasse, bondit un peu, retombe)", r.anim === "poi-sursaut" && /translateY\(-16%\)/.test(r.cles) && /scale\(1\.1, 0\.88\)/.test(r.cles), r.anim);
  await p.screenshot({ path: S + "/v281_poi_signe.png" });
});

// =========================================================================
titre("3. ARRIVÉS AU POI, ILS Y SONT : PAS DE QUESTION, LE CHAT S'OUVRE, LE MJ PARLE");
// =========================================================================
let idPoi = null;
await section(async () => {
  await p.evaluate(() => { window.__ajouts = []; window.__tourIA = 0; const vrai = window.declencherTourIA; window.declencherTourIA = async () => { window.__tourIA++; return vrai && vrai(); };
    window.fermerToutesLesFenetres && window.fermerToutesLesFenetres(); });
  reglagesFaux.poiRetard = 1800;
  await joueur("P_01"); await p.evaluate(() => window.voterPoiGroupe("oui"));
  await joueur("P_02"); await p.evaluate(() => window.voterPoiGroupe("oui"));
  await p.waitForTimeout(150);
  await finir();
  const h = await v();
  const b1 = await p.evaluate(() => ({ texte: document.getElementById("boite-voyage").textContent.trim(), boutons: [...document.querySelectorAll("#boite-voyage button")].map(x => x.textContent.trim()) }));
  verifier("le lieu se révèle encore : on attend au bord, sans question", h && h.Etat === "halte" && b1.boutons.length === 0 && /Vous approchez/.test(b1.texte), JSON.stringify(b1));
  await attendreQue(async () => !(await v()), 8000);
  await p.waitForTimeout(700);
  const d = await partie();
  idPoi = d.Lieu_Actuel;
  const r = await p.evaluate(() => ({ chat: document.getElementById("fenetre-chatbox").style.display, tour: window.__tourIA,
    msg: (window.__ajouts || []).filter(a => a.col === "Messages_Chat").map(a => a.data), boite: getComputedStyle(document.getElementById("boite-voyage")).display,
    boutons: [...document.querySelectorAll("#boite-voyage button")].map(x => x.textContent.trim()) }));
  verifier("le lieu né : le voyage s'achève là, le groupe y est (Voyage_Termine.Poi)", !d.Voyage_Groupe && d.Voyage_Termine && d.Voyage_Termine.Poi && d.Voyage_Termine.Poi.Lieu === idPoi
           && /^L_/.test(idPoi) && d.Situation === "Dans un lieu" && d.Position_Groupe.Region === 2, JSON.stringify(d.Voyage_Termine));
  verifier("aucune question : ni « Reprendre la route », ni « Rester ici »", r.boite === "none" && r.boutons.length === 0, JSON.stringify(r.boutons));
  verifier("le chat s'ouvre ; le Destin pose l'arrivée ; le MJ est réveillé", r.chat === "flex" && r.msg.some(m => m.Auteur_ID === "DESTIN" && /s'approche de/.test(m.Texte)) && r.tour === 1, `${r.chat} ${r.tour}`);
  const bord = await p.evaluate((dd) => { const lieu = window.VILLAGES_REGIONAUX[dd.Lieu_Actuel]; return lieu && Math.hypot((dd.Position_Groupe.x - lieu.x) * 1.6, dd.Position_Groupe.y - lieu.y); }, d);
  verifier("le groupe s'arrête au bord du lieu (son dessin reste visible)", bord > 0.005 && bord < 0.1, bord && bord.toFixed(3));
  reglagesFaux.poiRetard = 0;
});

// =========================================================================
titre("4. LES CARRÉS DES VILLAGES ET DES POI : DEUX FOIS PLUS PETITS, LE DESSIN LES REMPLIT");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.fermerToutesLesFenetres && window.fermerToutesLesFenetres(); });
  await attendreQue(async () => !!(await p.evaluate((id) => (window.__docs["Monde_Lieux/" + id] || {}).URL_Calque_Region, idPoi)), 6000);
  // Un village d'avant (8 %, sans Calque_Plein) et le POI né (4 %, plein).
  await p.evaluate(() => window.appliquerLieuLocal("L_00042_Brumefosse", { Nom_Du_Lieu: "Brumefosse", Carte_Regionale: 2, Position_Region: { x: 0.7, y: 0.66, taille: 0.08 },
    URL_Calque_Region: "https://res.cloudinary.com/demo/image/upload/v1/Villages_Regions/ancien.png" }));
  await p.waitForTimeout(200);
  const r = await p.evaluate((idPoi) => {
    const c = window.cadrageCarteRegion(), H = c.hauteur;
    const lire = (id) => { const el = document.querySelector(`.village-region[data-id="${id}"]`); const img = el && el.querySelector("img.village-calque");
      return el && { cote: parseFloat(el.style.width) / H, ancien: !!img && img.classList.contains("ancien"), imgL: img && img.getBoundingClientRect().width / el.getBoundingClientRect().width,
                     masque: img && (getComputedStyle(img).webkitMaskImage || getComputedStyle(img).maskImage) }; };
    return { tPoi: window.TAILLE_POI, fiche: window.__docs["Monde_Lieux/" + idPoi], ancien: lire("L_00042_Brumefosse"), poi: lire(idPoi) };
  }, idPoi);
  verifier("un POI naît dans un carré de 4 % (au lieu de 8 %), son calque plein", r.tPoi === 0.04 && r.fiche.Position_Region.taille === 0.04 && r.fiche.Calque_Plein === true, JSON.stringify(r.fiche.Position_Region));
  verifier("à l'écran, son carré fait 4 % de la carte", r.poi && Math.abs(r.poi.cote - 0.04) < 1e-6 && !r.poi.ancien, JSON.stringify(r.poi));
  verifier("un village d'avant : son carré aussi est réduit de moitié (4 %)…", r.ancien && Math.abs(r.ancien.cote - 0.04) < 1e-6, JSON.stringify(r.ancien));
  verifier("…et son dessin garde sa taille : on n'en montre que le centre, fondu au bord", r.ancien && r.ancien.ancien && Math.abs(r.ancien.imgL - 2) < 0.01 && /radial-gradient/.test(r.ancien.masque || ""),
           JSON.stringify(r.ancien));
  // Le dessin des prochains : le modèle peint presque tout le carré.
  const m = await p.evaluate(() => {
    const t = window.masqueCentreVillage(), d = t.getContext("2d").getImageData(0, 0, 1024, 1024).data, a = (x, y) => d[(y * 1024 + x) * 4 + 3];
    const plein = (v) => { const c = document.createElement("canvas"); c.width = c.height = 1024; const x = c.getContext("2d"); x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(0, 0, 1024, 1024); return c; };
    const { toile } = window.composerCalqueVillage(plein(100), plein(100), 512), k = toile.getContext("2d"), al = (x, y) => k.getImageData(x, y, 1, 1).data[3];
    return { masque: { aDessiner: a(512, 110), bord: a(512, 30), coin: a(40, 40) }, calque: { a072: al(256, 70), bord: al(256, 3) }, prompt: window.promptImageVillage("huts") };
  });
  verifier("le modèle peint jusqu'à 86 % du demi-côté (au lieu de 60 %)", m.masque.aDessiner === 0 && m.masque.bord === 255 && m.masque.coin === 255, JSON.stringify(m.masque));
  verifier("le calque est plein jusqu'à 80 % (au lieu de 58 %), fondu vers son bord", m.calque.a072 === 255 && m.calque.bord === 0, JSON.stringify(m.calque));
  verifier("la consigne : remplir l'image, un mince liseré intact", /fill most of the image/.test(m.prompt) && /thin margin/.test(m.prompt) && !/outer quarter/.test(m.prompt));
  // Plus de carré jaune au survol (DEV).
  const centre = await p.evaluate(() => { const el = document.querySelector('.village-region[data-id="L_00042_Brumefosse"]'); const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await p.mouse.move(centre.x, centre.y);
  await p.waitForTimeout(100);
  const survol = await p.evaluate(() => { const el = document.querySelector('.village-region[data-id="L_00042_Brumefosse"]'); return { dev: document.getElementById("carte-region-villages").classList.contains("dev"), survole: el.matches(":hover"), contour: getComputedStyle(el).outlineStyle }; });
  verifier("plus de carré jaune au survol", survol.dev && survol.survole && survol.contour === "none", JSON.stringify(survol));
  await p.mouse.move(5, 5);
});

// =========================================================================
titre("5. LE NOM DE CHAQUE LIEU, À LA PLUME, EN ARC SOUS SON DESSIN");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const el = document.querySelector('.village-region[data-id="L_00042_Brumefosse"]'), svg = el && el.querySelector("svg.village-nom");
    const t = svg && svg.querySelector("text"), tp = svg && svg.querySelector("textPath"), st = t && getComputedStyle(t), chemin = svg && svg.querySelector("path");
    const cote = el.getBoundingClientRect().height, b = svg && svg.getBoundingClientRect(), e = el.getBoundingClientRect();
    return { nom: tp && tp.textContent, police: st && st.fontFamily, style: st && st.fontStyle, couleur: st && st.fill, d: chemin && chemin.getAttribute("d"),
             haut: b && (b.top - e.top) / cote, centre: b && Math.abs((b.left + b.width / 2) - (e.left + e.width / 2)), taille: t && parseFloat(t.getAttribute("font-size")) / parseFloat(el.style.height),
             href: tp && tp.getAttribute("href"), tous: [...document.querySelectorAll(".village-region")].every(x => x.querySelector("svg.village-nom textPath")) };
  });
  verifier("sous chaque lieu, son nom (Brumefosse)", r.nom === "Brumefosse" && r.tous && /^#arc-nom-/.test(r.href || ""), JSON.stringify([r.nom, r.href]));
  verifier("à la plume : IM Fell English, en italique, marron foncé", /IM Fell English/.test(r.police || "") && r.style === "italic" && r.couleur === "rgb(58, 34, 15)", `${r.police} ${r.style} ${r.couleur}`);
  verifier("en petit, sous le dessin, centré", r.taille > 0.15 && r.taille < 0.35 && r.haut > 0.75 && r.haut < 0.95 && r.centre < 1.5, JSON.stringify([r.taille, r.haut, r.centre]));
  const c = await p.evaluate(() => {
    const k = Array.from({ length: 400 }, (_, i) => window.courbureEtiquetteLieu("L_" + i + "_Lieu"));
    const arc = (id) => { const svg = document.createElement("div"); return window.courbureEtiquetteLieu(id); };
    return { min: Math.min(...k), max: Math.max(...k), droits: k.filter(x => x === 0).length / k.length, stable: window.courbureEtiquetteLieu("L_7_X") === window.courbureEtiquetteLieu("L_7_X") };
  });
  verifier("l'arc varie au hasard, de franc à tout droit (stable pour un même lieu)", c.min === 0 && c.max > 0.9 && c.droits > 0.1 && c.droits < 0.4 && c.stable, JSON.stringify(c));
  const forme = await p.evaluate(() => {
    const ids = Array.from({ length: 400 }, (_, i) => "L_" + i + "_Lieu");
    const droit = ids.find(id => window.courbureEtiquetteLieu(id) === 0), courbe = ids.find(id => window.courbureEtiquetteLieu(id) > 0.8);
    window.appliquerLieuLocal(droit, { Nom_Du_Lieu: "Droite", Carte_Regionale: 2, Position_Region: { x: 0.3, y: 0.3, taille: 0.04 }, Calque_Plein: true });
    window.appliquerLieuLocal(courbe, { Nom_Du_Lieu: "Courbe", Carte_Regionale: 2, Position_Region: { x: 0.3, y: 0.7, taille: 0.04 }, Calque_Plein: true });
    const q = (id) => { const d = document.querySelector(`.village-region[data-id="${id}"] svg.village-nom path`).getAttribute("d").match(/-?[\d.]+/g).map(Number); return { yBout: d[1], yControle: d[3] }; };
    return { droit: q(droit), courbe: q(courbe) };
  });
  verifier("un nom droit : la ligne est droite ; un nom en arc : le milieu descend (un arc « inversé »)",
           Math.abs(forme.droit.yControle - forme.droit.yBout) < 1e-6 && forme.courbe.yControle > forme.courbe.yBout + 1, JSON.stringify(forme));
  const cache = await p.evaluate(() => { const el = document.querySelector('.village-region[data-id="L_00042_Brumefosse"]'); el.classList.add("cache");
    const d = getComputedStyle(el.querySelector("svg.village-nom")).display; el.classList.remove("cache"); return d; });
  verifier("un lieu sous les nuages : son nom aussi se cache", cache === "none", cache);
  const long = await p.evaluate(() => {
    window.appliquerLieuLocal("L_09999_Long", { Nom_Du_Lieu: "Le Hameau des Charbonniers de l'Ouest", Carte_Regionale: 2, Position_Region: { x: 0.5, y: 0.2, taille: 0.04 }, Calque_Plein: true });
    const svg = document.querySelector('.village-region[data-id="L_09999_Long"] svg.village-nom'), t = svg.querySelector("text"), chemin = svg.querySelector("path");
    return { texte: t.getComputedTextLength(), chemin: chemin.getTotalLength() };
  });
  verifier("un nom long tient en entier sur son arc (rien ne se coupe)", long.texte > 0 && long.texte <= long.chemin, JSON.stringify(long));
  await p.evaluate(() => { const c = window.cadrageCarteRegion(); window.zoomerCarteRegion && window.zoomerCarteRegion(3, 0.7 * c.largeur * c.zoom + c.panX, 0.66 * c.hauteur * c.zoom + c.panY); });
  await p.waitForTimeout(300);
  await p.screenshot({ path: S + "/v281_nom_lieu.png" });
  await p.evaluate(() => { window.zoomerCarteRegion && window.zoomerCarteRegion(1 / 3, 600, 400); });
});

// =========================================================================
titre("6. LA NUIT : « REPARTIR À L'AUBE », « RESTER ICI », ET LE FEU DE CAMP QUI OUVRE LE CHAT");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.appliquerReglagesGroupeDeLaBase({ Chance_POI: 0 }); window.fermerToutesLesFenetres && window.fermerToutesLesFenetres(); });
  await lancerVoyageRegional({ x: 0.25, y: 0.6 }, { x: 0.8, y: 0.3 });
  await finir();
  const n = await v();
  const r = await p.evaluate(() => ({ boutons: [...document.querySelectorAll("#boite-voyage button")].map(b => b.textContent.trim()), texte: document.getElementById("boite-voyage").textContent }));
  verifier("la nuit : « Repartir à l'aube » et « Rester ici »", n && n.Etat === "nuit" && r.boutons.includes("Repartir à l'aube") && r.boutons.includes("Rester ici") && !r.boutons.includes("Repartir"), JSON.stringify(r.boutons));
  verifier("…et « Discuter autour du feu de camp »", r.boutons.some(b => /Discuter autour du feu de camp/.test(b)));
  await p.click('#boite-voyage [data-action="feu-de-camp"]');
  await p.waitForTimeout(200);
  const f = await p.evaluate(() => ({ chat: document.getElementById("fenetre-chatbox").style.display, boite: getComputedStyle(document.getElementById("boite-voyage")).display }));
  const n2 = await v();
  verifier("un toucher : le chat s'ouvre ; le vote de la nuit attend (rien de choisi)", f.chat === "flex" && n2.Etat === "nuit" && Object.keys(n2.Choix_Nuit || {}).length === 0, JSON.stringify(f));
  await p.evaluate(() => window.discuterAutourDuFeu());
  verifier("un second toucher ne le referme pas", (await p.evaluate(() => document.getElementById("fenetre-chatbox").style.display)) === "flex");
  await p.screenshot({ path: S + "/v281_nuit.png" });
  await p.evaluate(() => { window.fermerToutesLesFenetres && window.fermerToutesLesFenetres(); window.choisirNuitVoyageGroupe("rester", { forcer: true }); });
  await p.waitForTimeout(150);
});

// =========================================================================
titre("7. LE TOUR DE PAROLE : L'AVATAR DE CELUI QUI PARLE, MÊME QUAND L'ORDRE DÉSIGNE UNE CRÉATURE");
// =========================================================================
await section(async () => {
  const t = await p.evaluate(() => {
    const H = [{ idPersonnage: "H1", prenom: "Thorin" }, { idPersonnage: "H2", prenom: "Lyra" }, { idPersonnage: "M1", prenom: "Loup", estMonstre: true },
               { idPersonnage: "H3", prenom: "Ombre", estIllusion: true }, { idPersonnage: "H5", prenom: "Absent", actif: false }];
    const tour = (o, i) => window.tourDeParole({ Ordre_Initiative: o, Index_Initiative: i }, H);
    return { normal: tour(["H1", "H2"], 1).id, monstre: tour(["M1", "H1", "H2"], 0), inconnu: tour(["X9", "Y8"], 0), mj: tour(["H1"], 999).index,
             leurre: tour(["H3", "H5", "H2"], 0).id, vide: tour([], 0).index };
  });
  verifier("l'ordre normal : Lyra", t.normal === "H2");
  verifier("l'ordre désigne une créature : le tour passe au héros suivant (Thorin)", t.monstre.id === "H1" && t.monstre.index === 1, JSON.stringify(t.monstre));
  verifier("un leurre, un héros sorti du jeu : sautés aussi", t.leurre === "H2");
  verifier("personne de valable dans l'ordre (ou l'ordre vide) : le MJ", t.inconnu.index === 999 && t.mj === 999 && t.vide === 999);
  // Le mélange (après chaque réponse du MJ) ne prend plus que les héros.
  const ordre = await p.evaluate(async () => {
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Thorin" }, { idPersonnage: "H2", prenom: "Lyra" }, { idPersonnage: "M1", prenom: "Loup", estMonstre: true }, { idPersonnage: "H3", prenom: "Ombre", estIllusion: true }];
    await window.relancerInitiativeChat();
    return window.__docs["Systeme_Parties/P1"].Ordre_Initiative;
  });
  verifier("le mélange ne prend plus que les héros (ni créature, ni leurre)", Array.isArray(ordre) && ordre.length === 2 && ordre.every(x => x === "H1" || x === "H2"), JSON.stringify(ordre));
  // Les bulles du chat, ouvert à la main, l'ordre sur une créature.
  const b = await p.evaluate(async () => {
    window.PARTIE_DATA = Object.assign({}, window.PARTIE_DATA, { Ordre_Initiative: ["M1", "H1", "H2"], Index_Initiative: 0, Lieu_Actuel: "" });
    window.ouvrirChatbox();
    window.afficherBullesChat([{ idPersonnage: "H1", idJoueur: "P_01", prenom: "Thorin", urlCloudinary: "https://res.cloudinary.com/x/portrait_thorin.png" },
                               { idPersonnage: "H2", idJoueur: "P_02", prenom: "Lyra", urlCloudinary: "https://res.cloudinary.com/x/portrait_lyra.png" }]);
    const vus = [...document.querySelectorAll(".bulle-portrait-hover-joueur, .bulle-portrait-hover-mj")].filter(i => getComputedStyle(i).display !== "none").map(i => i.src.split("/").pop());
    return { vus, actif: [...document.querySelectorAll("#zone-noms-bulles .tour-actif")].map(e => e.innerText) };
  });
  verifier("chat ouvert à la main, l'ordre sur une créature : l'avatar de Thorin s'affiche", b.actif.join() === "Thorin" && b.vus.join() === "portrait_thorin.png", JSON.stringify(b));
  await p.evaluate(() => { window.fermerToutesLesFenetres && window.fermerToutesLesFenetres(); });
});

// =========================================================================
titre("8. L'IMAGE DU GROUPE, RÉGLABLE EN DEV : LA CROIX ROUGE À SA PLACE EXACTE");
// =========================================================================
await section(async () => {
  await ecrirePartie({ Voyage_Groupe: null, Position_Groupe: { Region: 2, x: 0.4, y: 0.5 }, Lieu_Actuel: "" });
  await p.evaluate(() => { window.basculerPopupRegions && window.basculerPopupRegions(true); window.basculerReglagePionGroupe(true); });
  await p.waitForTimeout(150);
  const r = await p.evaluate(() => {
    const c = window.cadrageCarteRegion(), croix = document.getElementById("croix-groupe-region"), pion = document.getElementById("pion-groupe-region");
    const b = croix.getBoundingClientRect(), e = document.getElementById("carte-region").getBoundingClientRect();
    return { visible: getComputedStyle(croix).display, gauche: parseFloat(croix.style.left) / c.largeur, haut: parseFloat(croix.style.top) / c.hauteur,
             largeurEcran: b.width, reglable: pion.classList.contains("reglable"), bouton: document.getElementById("btn-reglage-pion-region").textContent,
             bloc: getComputedStyle(document.getElementById("reglage-pion-region")).display, curseurs: !!document.getElementById("decalage-pion-region-x") && !!document.getElementById("decalage-pion-region-y") };
  });
  verifier("bouton activé : une croix rouge, précisément à la place du groupe", r.visible === "block" && Math.abs(r.gauche - 0.4) < 1e-6 && Math.abs(r.haut - 0.5) < 1e-6, JSON.stringify(r));
  verifier("…d'une taille fixe à l'écran (lisible à tout zoom)", Math.abs(r.largeurEcran - 26) < 2, r.largeurEcran);
  verifier("le panneau DEV : le bouton, les curseurs du décalage (et la taille, déjà là)", /Terminer le réglage/.test(r.bouton) && r.bloc === "block" && r.curseurs, r.bouton);
  // Les curseurs : l'image se décale, la croix reste ; c'est enregistré pour toutes les parties.
  const s = await p.evaluate(() => {
    window.reglerDecalageGroupe("region", "y", -0.45, true); window.reglerDecalageGroupe("region", "x", 0.1, true);
    const c = window.cadrageCarteRegion(), pion = document.getElementById("pion-groupe-region"), cote = window.etatVoyageGroupe().reglages.tailleRegion * c.hauteur;
    return { mt: parseFloat(pion.style.marginTop) / cote, ml: parseFloat(pion.style.marginLeft) / cote, croix: parseFloat(document.getElementById("croix-groupe-region").style.left) / c.largeur,
             base: window.__docs["Carte_Monde/Groupe"], valeur: document.getElementById("decalage-pion-region-y-valeur").textContent };
  });
  verifier("un curseur : l'image se décale (en parts de sa largeur), la croix reste", Math.abs(s.mt + 0.45) < 1e-6 && Math.abs(s.ml - 0.1) < 1e-6 && Math.abs(s.croix - 0.4) < 1e-6 && s.valeur === "-45 %", JSON.stringify(s));
  verifier("…enregistré pour toutes les parties (Carte_Monde/Groupe)", s.base && s.base.Decalage_Region && s.base.Decalage_Region.y === -0.45 && s.base.Decalage_Region.x === 0.1, JSON.stringify(s.base && s.base.Decalage_Region));
  // Glisser l'image du doigt.
  const avant = await p.evaluate(() => { const b = document.getElementById("pion-groupe-region").getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, d: { ...window.etatVoyageGroupe().reglages.decalageRegion }, panX: window.cadrageCarteRegion().panX }; });
  await p.mouse.move(avant.x, avant.y); await p.mouse.down(); await p.mouse.move(avant.x + 24, avant.y + 12, { steps: 4 }); await p.mouse.up();
  await p.waitForTimeout(150);
  const apres = await p.evaluate(() => { const c = window.cadrageCarteRegion(); return { d: { ...window.etatVoyageGroupe().reglages.decalageRegion }, panX: c.panX, cote: window.etatVoyageGroupe().reglages.tailleRegion * c.hauteur * c.zoom, base: window.__docs["Carte_Monde/Groupe"].Decalage_Region }; });
  verifier("glissée du doigt, l'image suit (la carte, elle, ne bouge pas) ; enregistré au lâcher", Math.abs((apres.d.x - avant.d.x) * apres.cote - 24) < 1.5 && Math.abs((apres.d.y - avant.d.y) * apres.cote - 12) < 1.5
           && apres.panX === avant.panX && Math.abs(apres.base.x - apres.d.x) < 1e-3, JSON.stringify([avant.d, apres.d]));
  // Le réglage venu de la base (un autre poste) ; la fin du réglage.
  const fin = await p.evaluate(() => {
    window.appliquerReglagesGroupeDeLaBase({ Decalage_Region: { x: 0, y: -0.5 } });
    const d = { ...window.etatVoyageGroupe().reglages.decalageRegion };
    window.basculerReglagePionGroupe(false);
    return { d, croix: getComputedStyle(document.getElementById("croix-groupe-region")).display, reglable: document.getElementById("pion-groupe-region").classList.contains("reglable"),
             bloc: getComputedStyle(document.getElementById("reglage-pion-region")).display, mt: parseFloat(document.getElementById("pion-groupe-region").style.marginTop) };
  });
  verifier("le décalage venu de la base s'applique", fin.d.x === 0 && fin.d.y === -0.5, JSON.stringify(fin.d));
  verifier("bouton relâché : plus de croix, l'image ne se glisse plus, le décalage reste", fin.croix === "none" && !fin.reglable && fin.bloc === "none" && fin.mt < 0, JSON.stringify(fin));
  // Sur la carte du monde aussi.
  const monde = await p.evaluate(() => { window.basculerReglagePionGroupe(true); const x = document.getElementById("croix-groupe-monde"), pm = document.getElementById("pion-groupe-monde");
    const r = { croix: x && getComputedStyle(x).display, memePlace: x && pm && x.style.left === pm.style.left && x.style.top === pm.style.top, boutonMonde: !!document.getElementById("btn-reglage-pion-monde") };
    window.basculerReglagePionGroupe(false); return r; });
  verifier("sur la carte du monde aussi : la croix au centre de la région du groupe", monde.croix === "block" && monde.memePlace && monde.boutonMonde, JSON.stringify(monde));
  await p.evaluate(() => { window.basculerReglagePionGroupe(true); });
  await p.screenshot({ path: S + "/v281_reglage_pion.png" });
  await p.evaluate(() => { window.basculerReglagePionGroupe(false); window.basculerPopupRegions && window.basculerPopupRegions(false); });
});

// =========================================================================
titre("9. LA CONNEXION AUTOMATIQUE, DANS LE MENU DU COMPTE");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    localStorage.removeItem("ivalis_CONNEXION_AUTO");
    const barre = document.getElementById("barre-compte"); barre.style.display = "flex";
    window.basculerMenuCompte(true);
    const caseAuto = document.getElementById("case-connexion-auto"), menu = document.getElementById("menu-compte");
    const r = { dansMenu: !!caseAuto && menu.contains(caseAuto), libelle: caseAuto && caseAuto.closest("label").textContent.trim(), coche: caseAuto && caseAuto.checked };
    return r;
  });
  verifier("une case « Connexion automatique » dans le menu du compte", r.dansMenu && r.libelle === "Connexion automatique", r.libelle);
  verifier("cochée par défaut (on reste connecté d'un lancement à l'autre)", r.coche === true);
  await p.evaluate(() => document.getElementById("case-connexion-auto").click());
  const r2 = await p.evaluate(() => { const v = localStorage.getItem("ivalis_CONNEXION_AUTO"); window.basculerMenuCompte(false); window.basculerMenuCompte(true);
    return { v, coche: document.getElementById("case-connexion-auto").checked, fonction: window.connexionAutomatique() }; });
  verifier("décochée : retenu sur l'appareil, et relu à la réouverture du menu", r2.v === "off" && r2.coche === false && r2.fonction === false, JSON.stringify(r2));
  await p.evaluate(() => document.getElementById("case-connexion-auto").click());
  verifier("recochée : de nouveau automatique", (await p.evaluate(() => localStorage.getItem("ivalis_CONNEXION_AUTO"))) === "on");
  const src = lire('comptes.js');
  verifier("la session suit le choix (Firebase : locale et durable, ou le temps de l'application) ; le mot de passe n'est jamais gardé",
           /indexedDBLocalPersistence/.test(src) && /browserSessionPersistence/.test(src) && /setPersistence/.test(src) && /await appliquerConnexionAuto\(\)/.test(src)
           && !/localStorage\.setItem\([^)]*(mdp|password|Mot_De_Passe)/i.test(src));
  await p.evaluate(() => { window.basculerMenuCompte(false); document.getElementById("barre-compte").style.display = "none"; });
});

// =========================================================================
titre("10. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json') || "{}").version;
  verifier("version 281 ou plus (trace_combat.js, version.json)", vTrace >= 281 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const vv = (f) => Number((html.match(new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  verifier("les modules touchés ont changé de version ; la police de la plume est chargée",
           vv("voyage_groupe.js") >= 4 && vv("villages_regionaux.js") >= 5 && vv("poi_creation.js") >= 2 && vv("comptes.js") >= 3 && vv("app.js") >= 126
           && vv("environnement_mj.js") >= 4 && vv("style.css") >= 111 && /family=IM\+Fell\+English/.test(html));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
