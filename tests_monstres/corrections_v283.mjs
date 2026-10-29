// v283 — LE BORD DE PARCHEMIN PLUS DISCRET ; LE PINCEAU D'USURE (DEV).
//
// Nico : « tu peux rendre la carte usée sur les bords, que ça aille moins de
// force ? Que ça aille moins sur la carte, au risque de plus voir la carte ;
// que ça fluctue, mais que sur les bords. Attends, encore mieux… crée-moi un
// pinceau dans DEV pour que je puisse peindre les zones où tu peux brûler,
// faire des trous, etc. »
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

// Les zones de test : un disque sur le bord haut (à gauche), un au milieu.
const ZONES = { colonnes: 160, lignes: 100, disques: [[40, 0, 14], [110, 55, 10]] };

// =========================================================================
titre("1. PAR DÉFAUT : UN BORD FIN, LÉGER, QUI FLUCTUE — LA CARTE SE VOIT");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const B = window.BordsParchemin, W = 640, H = 400, s = Math.min(W, H);
    if (!B) return { e: [] };
    const etude = (g) => {
      const { masque: m, usure: o } = B.calculer(W, H, g);
      const a = (x, y) => m[(y * W + x) * 4 + 3];
      // La déchirure le long des bords haut et bas, loin des coins.
      const prof = [];
      for (let x = Math.round(0.1 * W); x < 0.9 * W; x += 3) {
        let y = 0; while (y < H / 2 && a(x, y) < 128) y++; prof.push(y / s);
        let y2 = H - 1; while (y2 > H / 2 && a(x, y2) < 128) y2--; prof.push((H - 1 - y2) / s);
      }
      const moy = prof.reduce((q, z) => q + z, 0) / prof.length, max = Math.max(...prof);
      const ecart = Math.sqrt(prof.reduce((q, z) => q + (z - moy) ** 2, 0) / prof.length);
      let perces = 0; const marge = Math.round(0.05 * s);
      for (let y = marge; y < H - marge; y++) for (let x = marge; x < W - marge; x++) if (a(x, y) < 128) perces++;
      // L'usure ne mord pas sur la carte : rien de marqué au-delà de 6 % du bord.
      let noir = 0, brun = 0, loin = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, al = o[i * 4 + 3];
        if (m[i * 4 + 3] < 200 || al < 60) continue;
        const d = Math.min(x, y, W - 1 - x, H - 1 - y) / s;
        if (d > 0.06) loin++;
        const lum = (o[i * 4] + o[i * 4 + 1] + o[i * 4 + 2]) / 3;
        if (al >= 120 && lum < 45) noir++; else if (lum < 130) brun++;
      }
      return { centre: a(W >> 1, H >> 1), coin: a(0, 0), moy, max, ecart, perces, noir, brun, loin };
    };
    return { e: Array.from({ length: 12 }, (_, i) => etude(i * 7919 + 13)) };
  });
  const e = r.e;
  const f = (x) => x.toFixed(4);
  verifier("le cœur intact, les coins usés", e.length === 12 && e.every(x => x.centre === 255 && x.coin === 0), JSON.stringify(e.map(x => [x.centre, x.coin])));
  verifier("un bord fin : la déchirure mord peu (en moyenne moins de 2,5 % du petit côté)", e.length === 12 && e.every(x => x.moy > 0.003 && x.moy < 0.025), JSON.stringify(e.map(x => f(x.moy))));
  verifier("…et jamais profond (moins de 3,5 % au plus creux)", e.length === 12 && e.every(x => x.max < 0.035), JSON.stringify(e.map(x => f(x.max))));
  verifier("il fluctue (ce n'est pas une règle)", e.length === 12 && e.every(x => x.ecart > 0.0008), JSON.stringify(e.map(x => f(x.ecart))));
  verifier("ni trou, ni brûlure", e.length === 12 && e.every(x => x.perces === 0 && x.noir < 200), JSON.stringify(e.map(x => [x.perces, x.noir])));
  verifier("bruni, mais seulement le long du bord (rien au-delà de 6 %)", e.length === 12 && e.every(x => x.brun > 300 && x.loin === 0), JSON.stringify(e.map(x => [x.brun, x.loin])));
});

// =========================================================================
titre("2. LÀ OÙ L'USURE EST PEINTE : DÉCHIRÉ, BRÛLÉ, PERCÉ — ET SEULEMENT LÀ");
// =========================================================================
await section(async () => {
  const r = await p.evaluate((Z) => {
    const B = window.BordsParchemin, W = 640, H = 400, s = Math.min(W, H);
    if (!B) return { e: [] };
    const cases = new Uint8Array(Z.colonnes * Z.lignes);
    Z.disques.forEach(([cx, cy, rr]) => { for (let l = 0; l < Z.lignes; l++) for (let c = 0; c < Z.colonnes; c++) if (Math.hypot(c + 0.5 - cx, l + 0.5 - cy) <= rr) cases[l * Z.colonnes + c] = 1; });
    const zones = { colonnes: Z.colonnes, lignes: Z.lignes, cases };
    const etude = (g) => {
      const nu = B.calculer(W, H, g), z = B.calculer(W, H, g, zones);
      const a = (m, x, y) => m[(y * W + x) * 4 + 3];
      // La déchirure du bord haut, sous le disque peint (x de 18 % à 32 %) et sans zone.
      const profondeur = (m) => { let t = 0, n = 0; for (let x = Math.round(0.18 * W); x < 0.32 * W; x += 2) { let y = 0; while (y < H / 2 && a(m, x, y) < 128) y++; t += y; n++; } return t / n / s; };
      // Dans le disque du milieu : le noir, les trous.
      let noirMilieu = 0, trouMilieu = 0, noirZoneBord = 0;
      for (let y = Math.round(0.35 * H); y < 0.75 * H; y++) for (let x = Math.round(0.55 * W); x < 0.85 * W; x++) {
        const i = y * W + x; if (z.masque[i * 4 + 3] < 128) { trouMilieu++; continue; }
        const lum = (z.usure[i * 4] + z.usure[i * 4 + 1] + z.usure[i * 4 + 2]) / 3; if (z.usure[i * 4 + 3] >= 120 && lum < 60) noirMilieu++;
      }
      for (let y = 0; y < 0.25 * H; y++) for (let x = Math.round(0.1 * W); x < 0.4 * W; x++) {
        const i = y * W + x; if (z.masque[i * 4 + 3] < 200) continue;
        const lum = (z.usure[i * 4] + z.usure[i * 4 + 1] + z.usure[i * 4 + 2]) / 3; if (z.usure[i * 4 + 3] >= 120 && lum < 60) noirZoneBord++;
      }
      // Loin des zones (le quart bas-droit, et le bord gauche bas) : pixel pour pixel le bord par défaut.
      let differents = 0;
      for (let y = Math.round(0.8 * H); y < H; y++) for (let x = 0; x < W; x++) {
        if (x > 0.15 * W && x < 0.5 * W) continue;
        const i = (y * W + x) * 4; for (let k = 0; k < 4; k++) if (nu.masque[i + k] !== z.masque[i + k] || nu.usure[i + k] !== z.usure[i + k]) { differents++; break; }
      }
      return { pNu: profondeur(nu.masque), pZ: profondeur(z.masque), noirMilieu, trouMilieu, noirZoneBord, differents };
    };
    const e = Array.from({ length: 12 }, (_, i) => etude(i * 7919 + 13));
    // La même grille en base64 (comme en base) : le même bord.
    let memeTexte = false;
    if (typeof B.encoder === "function") {
      const t = B.calculer(W, H, 13, { colonnes: Z.colonnes, lignes: Z.lignes, cases: Array.from(cases) });
      const n = B.normaliserZones({ colonnes: Z.colonnes, lignes: Z.lignes, cases: B.encoder(cases) });
      const t2 = B.calculer(W, H, 13, { colonnes: n.colonnes, lignes: n.lignes, cases: n.cases });
      memeTexte = t.masque.every((v, i) => v === t2.masque[i]);
    }
    return { e, memeTexte };
  }, ZONES);
  const e = r.e;
  verifier("sur un bord peint : la déchirure plonge (au moins 2,5 fois plus profond)", e.length === 12 && e.every(x => x.pZ > 2.5 * x.pNu && x.pZ > 0.02),
           JSON.stringify(e.map(x => [x.pNu.toFixed(3), x.pZ.toFixed(3)])));
  verifier("…et noircit (brûlé)", e.length === 12 && e.every(x => x.noirZoneBord > 150), JSON.stringify(e.map(x => x.noirZoneBord)));
  verifier("au milieu de la carte, là où c'est peint : brûlé", e.length === 12 && e.every(x => x.noirMilieu > 150), JSON.stringify(e.map(x => x.noirMilieu)));
  const perces = e.filter(x => x.trouMilieu > 30).length;
  verifier("…et souvent percé (au moins 8 cartes sur 12)", perces >= 8, `${perces} / 12 : ${JSON.stringify(e.map(x => x.trouMilieu))}`);
  verifier("loin de ce qui est peint : exactement le bord fin par défaut", e.length === 12 && e.every(x => x.differents === 0), JSON.stringify(e.map(x => x.differents)));
  verifier("la grille en base64 (comme en base) donne le même bord que ses cases", r.memeTexte === true);
});

// =========================================================================
titre("3. LE PINCEAU DE LA CARTE RÉGIONALE : « NUAGES » OU « USURE DU PARCHEMIN »");
// =========================================================================
await section(async () => {
  await attendreQue(async () => await p.evaluate(() => !!document.querySelector("#carte-region > .parchemin-usure")), 10000);
  const masqueRegion = () => p.evaluate(() => { const el = document.getElementById("carte-region"); return el.style.webkitMaskImage || el.style.maskImage || ""; });
  const avant = await masqueRegion();
  const ui = await p.evaluate(() => {
    const ok = typeof window.choisirCalqueRegion === "function";
    const calque = ok ? window.choisirCalqueRegion("usure") : null;
    const aide = document.getElementById("aide-calque-usure");
    const bouton = document.getElementById("btn-region-calque-usure");
    return { calque, actif: !!(bouton && bouton.classList.contains("actif")), aide: !!(aide && aide.style.display !== "none"),
             valider: (document.getElementById("btn-region-valider-nuages") || {}).textContent };
  });
  verifier("deux calques au pinceau ; « Usure du parchemin » choisi, son aide affichée", ui.calque === "usure" && ui.actif && ui.aide && /usure/i.test(ui.valider || ""), JSON.stringify(ui));
  // On peint le coin haut-gauche de la carte (à l'écran).
  const peint = await p.evaluate(() => {
    window.choisirOutilRegion("pinceau");
    window.reglerTaillePinceauRegion(80);
    const c = window.cadrageCarteRegion(), e = document.getElementById("ecran-jeu").getBoundingClientRect();
    const X = (fx) => e.left + c.panX + fx * c.largeur * c.zoom, Y = (fy) => e.top + c.panY + fy * c.hauteur * c.zoom;
    window.peindreCarteRegion(X(0.02), Y(0.03), X(0.3), Y(0.03));
    const toile = document.getElementById("carte-region-peinture");
    const d = toile.getContext("2d").getImageData(0, 0, toile.width, toile.height).data;
    let orange = 0, rouge = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 40) continue; if (d[i + 1] > 80) orange++; else rouge++; }
    const u = window.grilleUsureRegion ? window.grilleUsureRegion() : [], n = window.grilleNuagesRegion();
    return { usure: [...(u || [])].filter(x => x).length, nuages: [...n].filter(x => x).length, orange, rouge, calque: toile.dataset.calque };
  });
  verifier("le trait d'usure se peint en orange, sur la grille de l'usure (pas celle des nuages)", peint.usure > 20 && peint.nuages === 0 && peint.orange > 50 && peint.rouge === 0, JSON.stringify(peint));
  const apercu = await attendreQue(async () => (await masqueRegion()) !== avant, 8000);
  verifier("un instant après le trait : l'aperçu du bord (déchiré, brûlé là où c'est peint)", apercu);
  // Les nuages, puis retour à l'usure : chaque calque garde son brouillon.
  const deux = await p.evaluate(() => {
    window.choisirCalqueRegion("nuages");
    const c = window.cadrageCarteRegion(), e = document.getElementById("ecran-jeu").getBoundingClientRect();
    window.peindreCarteRegion(e.left + c.panX + 0.6 * c.largeur * c.zoom, e.top + c.panY + 0.6 * c.hauteur * c.zoom);
    const nuages = [...window.grilleNuagesRegion()].filter(x => x).length;
    window.choisirCalqueRegion("usure");
    return { nuages, usure: [...window.grilleUsureRegion()].filter(x => x).length };
  });
  verifier("chaque calque garde son brouillon (nuages et usure, côte à côte)", deux.nuages > 0 && deux.usure === peint.usure, JSON.stringify(deux));
  const ecrits = await p.evaluate(async () => { window.__ecrits = []; await window.validerNuagesRegion(); return window.__ecrits; });
  const eU = ecrits.find(x => x.chemin === "Cartes_Regionales/2");
  verifier("« Valider l'usure » : Cartes_Regionales/2.Usure (colonnes, lignes, cases), sans toucher aux nuages",
           eU && eU.data.Usure && eU.data.Usure.colonnes > 0 && typeof eU.data.Usure.cases === "string" && !("Nuages" in eU.data), JSON.stringify(ecrits).slice(0, 200));
  const apres = await p.evaluate(() => ({ usure: !!(window.CARTES_REGIONALES[2] || {}).usure, nuages: !!(window.CARTES_REGIONALES[2] || {}).nuages,
                                          zones: !!document.getElementById("carte-region").__zonesParchemin, outil: window.outilCarteRegion() }));
  await attendreQue(async () => await p.evaluate(() => !!document.getElementById("carte-region").__zonesParchemin), 8000);
  const zonesPosees = await p.evaluate(() => !!document.getElementById("carte-region").__zonesParchemin);
  verifier("le bord de la carte suit l'usure enregistrée ; les nuages attendent encore leur validation", apres.usure && !apres.nuages && zonesPosees && apres.outil === null, JSON.stringify([apres, zonesPosees]));
  const nuagesValides = await p.evaluate(async () => { window.choisirCalqueRegion("nuages"); window.__ecrits = []; await window.validerNuagesRegion();
    const e = window.__ecrits.find(x => x.chemin === "Cartes_Regionales/2"); return e ? Object.keys(e.data).filter(k => k !== "Numero" && k !== "Nom") : []; });
  verifier("…puis « Valider les nuages » n'écrit que les nuages", nuagesValides.length === 1 && nuagesValides[0] === "Nuages", JSON.stringify(nuagesValides));
  await p.screenshot({ path: S + "/v283_region.png" });
  // Un autre poste DEV efface l'usure : le bord redevient fin.
  const m1 = await masqueRegion();
  await p.evaluate(() => { const d = JSON.parse(JSON.stringify(window.__docs["Cartes_Regionales/2"] || {})); delete d.Usure;
    window.appliquerCartesRegionalesDeLaBase([{ id: "2", data: Object.assign({ Numero: 2, Aspect: 1.6 }, d, { Nuages: (window.CARTES_REGIONALES[2] || {}).nuages }) }]); });
  const redevenu = await attendreQue(async () => (await masqueRegion()) !== m1 && !(await p.evaluate(() => document.getElementById("carte-region").__zonesParchemin)), 8000);
  verifier("l'usure effacée ailleurs (la base) : le bord redevient fin ici", redevenu);
  // Annuler un brouillon d'usure : l'aperçu s'en va.
  const m2 = await masqueRegion();
  await p.evaluate(() => { window.choisirCalqueRegion("usure"); window.choisirOutilRegion("pinceau");
    const c = window.cadrageCarteRegion(), e = document.getElementById("ecran-jeu").getBoundingClientRect();
    window.peindreCarteRegion(e.left + c.panX + 0.97 * c.largeur * c.zoom, e.top + c.panY + 0.5 * c.hauteur * c.zoom); });
  await attendreQue(async () => (await masqueRegion()) !== m2, 8000);
  await p.evaluate(() => window.annulerNuagesRegion());
  const revenu = await attendreQue(async () => (await masqueRegion()) === m2, 8000);
  verifier("« Annuler la peinture » : l'aperçu s'en va, le bord enregistré revient", revenu);
  await p.evaluate(() => { window.choisirOutilRegion(null); });
});

// =========================================================================
titre("4. LE PINCEAU DE LA CARTE DU MONDE");
// =========================================================================
await section(async () => {
  await p.evaluate(async () => { await window.fermerCarteRegionale({ sansTransition: true }); window.basculerPopupRegions(true); });
  await p.waitForTimeout(200);
  const masqueMonde = () => p.evaluate(() => { const el = document.getElementById("carte-fond-jeu"); return el.style.webkitMaskImage || el.style.maskImage || ""; });
  await attendreQue(async () => /^url/.test(await masqueMonde()), 10000);
  const avant = await masqueMonde();
  const ui = await p.evaluate(() => {
    const sec = document.getElementById("regions-dev-usure-monde");
    const outil = typeof window.choisirOutilUsureMonde === "function" ? window.choisirOutilUsureMonde("pinceau") : null;
    if (typeof window.reglerTaillePinceauUsureMonde === "function") window.reglerTaillePinceauUsureMonde(70);
    const t = document.getElementById("carte-monde-usure-peinture");
    return { section: !!(sec && sec.offsetParent), outil, toile: !!t && getComputedStyle(t).display !== "none" && getComputedStyle(t).pointerEvents === "auto",
             actif: !!(document.getElementById("btn-monde-usure-pinceau") || { classList: { contains: () => false } }).classList.contains("actif") };
  });
  verifier("la popup DEV de la carte du monde : « L'usure du parchemin », pinceau en main", ui.section && ui.outil === "pinceau" && ui.toile && ui.actif, JSON.stringify(ui));
  // Un vrai glissé de souris, en haut à gauche de la carte : on peint, la carte ne glisse pas.
  const depart = await p.evaluate(() => {
    const pts = [[60, 60], [120, 40], [200, 30], [40, 200]];
    const bon = pts.find(([x, y]) => { const el = document.elementFromPoint(x, y); return el && el.id === "carte-monde-usure-peinture"; });
    return { bon, pan: window.cadrageCarteMonde().panX };
  });
  if (depart.bon) {
    await p.mouse.move(depart.bon[0], depart.bon[1]); await p.mouse.down();
    for (let k = 1; k <= 8; k++) await p.mouse.move(depart.bon[0] + k * 30, depart.bon[1] + (k % 2) * 6);
    await p.mouse.up();
  } else await p.evaluate(() => window.peindreUsureMonde && window.peindreUsureMonde(60, 60, 300, 60));
  const peint = await p.evaluate(() => ({ cases: window.grilleUsureMonde ? [...window.grilleUsureMonde()].filter(x => x).length : 0, pan: window.cadrageCarteMonde().panX,
                                          valider: !(document.getElementById("btn-monde-usure-valider") || { disabled: true }).disabled }));
  verifier("un glissé à la souris peint la grille de la carte du monde", peint.cases > 20 && peint.valider, JSON.stringify([depart.bon, peint]));
  verifier("…sans faire glisser la carte", peint.pan === depart.pan, `${depart.pan} → ${peint.pan}`);
  const apercu = await attendreQue(async () => (await masqueMonde()) !== avant, 10000);
  verifier("un instant après : l'aperçu du bord de la carte du monde", apercu);
  await p.screenshot({ path: S + "/v283_monde_peinture.png" });
  const ecrits = await p.evaluate(async () => { window.__ecrits = []; const ok = window.validerUsureMonde ? await window.validerUsureMonde() : false; return { ok, ecrits: window.__ecrits }; });
  const e = ecrits.ecrits.find(x => x.chemin === "Carte_Monde/Parchemin");
  verifier("« Valider l'usure » : Carte_Monde/Parchemin.Usure (240 × 135, en base64)", ecrits.ok && e && e.data.Usure && e.data.Usure.colonnes === 240 && e.data.Usure.lignes === 135 && typeof e.data.Usure.cases === "string",
           JSON.stringify(ecrits).slice(0, 200));
  const range = await p.evaluate(() => { const t = document.getElementById("carte-monde-usure-peinture"); return { outil: window.outilUsureMonde(), cache: getComputedStyle(t).display === "none" }; });
  verifier("validé : le pinceau se range, l'orange disparaît", range.outil === null && range.cache, JSON.stringify(range));
  await attendreQue(async () => await p.evaluate(() => !!document.getElementById("carte-fond-jeu").__zonesParchemin), 10000);
  await p.waitForTimeout(300);
  await p.screenshot({ path: S + "/v283_monde.png" });
  // Sans outil : la carte glisse de nouveau sous la souris.
  const glisse = await p.evaluate(() => window.glisserCarteMonde(-400));
  await p.mouse.move(400, 400); await p.mouse.down(); await p.mouse.move(600, 400, { steps: 5 }); await p.mouse.up();
  const pan2 = await p.evaluate(() => window.cadrageCarteMonde().panX);
  verifier("sans pinceau en main, la carte glisse comme avant", pan2 !== glisse, `${glisse} → ${pan2}`);
  // La base (un autre poste) : l'usure effacée → le bord fin ; rendue → le bord usé.
  const m1 = await masqueMonde();
  await p.evaluate(() => window.appliquerUsureMondeDeLaBase && window.appliquerUsureMondeDeLaBase({}));
  const fin = await attendreQue(async () => (await masqueMonde()) !== m1 && !(await p.evaluate(() => document.getElementById("carte-fond-jeu").__zonesParchemin)), 10000);
  verifier("l'usure effacée ailleurs : le bord du monde redevient fin", fin);
  // Le DEV s'éteint : le pinceau se lâche.
  const dev = await p.evaluate(() => { window.choisirOutilUsureMonde("pinceau"); localStorage.setItem("ivalis_DEV_MODE", "off"); window.actualiserRegionsDev();
    const r = window.outilUsureMonde(); localStorage.setItem("ivalis_DEV_MODE", "on"); window.actualiserRegionsDev(); return r; });
  verifier("le mode DEV éteint : le pinceau se lâche", dev === null, String(dev));
});

// =========================================================================
titre("5. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json') || "{}").version;
  verifier("version 283 ou plus (trace_combat.js, version.json)", vTrace >= 283 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const vv = (f) => Number((html.match(new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  verifier("usure_monde.js chargé ; les fichiers touchés ont changé de version",
           /usure_monde\.js\?v=\d+/.test(html) && vv("bords_parchemin.js") >= 2 && vv("cartes_regionales.js") >= 8 && vv("style.css") >= 113,
           JSON.stringify([vv("bords_parchemin.js"), vv("cartes_regionales.js"), vv("style.css")]));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
