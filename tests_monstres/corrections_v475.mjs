// v475 — LES IMAGES LÉGÈRES, LA FORGE, LES DRACHMES, LES MAINS, LE VOYAGE SANS NUIT,
// LE NARRATEUR, LES FILS INVISIBLES ET LE MULTIPLICATEUR DE PERSISTANCE.
// Nico : « vérifie que chaque lien d'image a bien /q_auto,f_auto/ » ; « dans la forge, une flèche haut et bas
// pour monter ou baisser l'effet dans l'ordre où les effets se font » ; « une seule monnaie : les drachmes » ;
// « avec une persistance et une surpuissance, précise en dessous des dégâts : "avec la surpuissance" » ;
// « vérifie qu'on ne peut pas mettre 2 lances en main, ni 2 frondes » ; « plus de pause chaque nuit : on double
// le temps en jours de marche, les jours défilent pendant la marche, la date en haut du livre en tourniquet » ;
// le narrateur (réactions corporelles, combat vécu en jeu, continuité) ; les fils invisibles (connaissance de
// l'événement, ouï-dire, sens des conséquences, « −0 ») ; « un multiplicateur de persistance sur les chances
// d'état, au lancement et dans la zone, avant la surpuissance et les bonus ».
// Lancer : node tests_monstres/corrections_v475.mjs
// Lancer : node tests_monstres/corrections_v457.mjs
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
    if (chemin.startsWith("Systeme_Parties/") && chemin.split("/").length === 2 && window.__relaisPartie && typeof window.appliquerVoyageDeLaPartie === "function") {
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
  const corps = /map_wx8s89/.test(u) ? MONDE : /IMG_1[89]|IMG_2189|IMG_22(29|30|31)/.test(u) ? REGION : cle ? IMAGES[cle] : `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>`;
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
  } else if (/Sur la route, pendant la marche/.test(systeme)) {
    texte = /C'EST TOI QUI ENGAGES LA CONVERSATION/.test(systeme) ? JSON.stringify({ replique: reglagesFaux.ouverture || "Thorin, tu ronfles comme un ours, la nuit. Tu le sais, au moins ?", partir: false })
      : JSON.stringify({ replique: reglagesFaux.partir ? "*hausse les épaules* Bon. Je retourne à l'arrière." : "Ha ! Menteur. Toute la compagnie t'entend.", partir: !!reglagesFaux.partir });
  } else if (/répliques de combat/.test(systeme)) texte = JSON.stringify({ pnj: [{ nom: "Dame Koré", debut: ["Vous n'auriez jamais dû venir ici.", "*Elle lève son sceptre* À genoux !", "Encore debout ?"],
      blesse: ["Je saigne… mais vous paierez.", "Ce n'est qu'une égratignure."], seul: ["Lâches ! Vous m'abandonnez ?", "Seule, je suffirai."],
      ko: ["Reste à terre, toi.", "Un de moins !", "*rit* Le nain ne se relèvera pas."] }] });
  else if (image) texte = JSON.stringify({ terrain: "lisière d'une forêt de pins", sous_le_groupe: "Un tapis d'aiguilles grises.", alentours: { nord: "la forêt", est: "une rivière", sud: "une plaine", ouest: "des collines" },
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
  // (v378 : plus de menu latéral ni de petit bouton qui le rouvrait.)
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
await p.waitForTimeout(400);



await p.evaluate(async () => { window.appliquerReglagesGroupeDeLaBase({ Chance_POI: 0 }); await window.ouvrirCarteRegionale(2, { sansTransition: true }); });
await p.waitForTimeout(400);

// =========================================================================
titre("1. LES IMAGES : /q_auto,f_auto/ SUR CHAQUE LIEN CLOUDINARY");
// =========================================================================
await section(async () => {
  const fichiers = fs.readdirSync(RACINE).filter(f => /\.(js|html|css)$/.test(f));
  const sans = [];
  fichiers.forEach(f => (lire(f).match(/https:\/\/res\.cloudinary\.com\/[^"'\s)`]+\/image\/upload\/[^"'\s)`$]+/g) || [])
    .filter(u => !/q_auto/.test(u) && !/\/upload\/$/.test(u)).forEach(u => sans.push(f + " : " + u.slice(-40))));
  verifier("aucun lien d'image Cloudinary sans q_auto,f_auto dans le code", sans.length === 0, sans.slice(0, 3).join(" | "));
  const retours = ["app.js", "ia_master.js"].map(f => (lire(f).match(/return [^;\n]*secure_url[^;\n]*;/g) || []).filter(l => !/q_auto/.test(l)));
  verifier("…et les images hébergées en cours de jeu repartent avec (q_auto,f_auto)", retours.every(r => r.length === 0), JSON.stringify(retours));
});

// =========================================================================
titre("2. LA FORGE : MONTER ET DESCENDRE UN EFFET ; « AVEC LA SURPUISSANCE » SOUS LES DÉGÂTS PERSISTANTS");
// =========================================================================
const PERSISTANCE = { Nom: "Persistance terrain", Cout_PT: "3", Modificateur: "AUCUN", Type_Mecanique: "Spatial", Type_Mecanique_2: "Aucun",
  Valeur: 0, Pourcent_Base: 0, Pourcent_Max: 0, Tours: 3, Effet_Base: "Laisse une zone dangereuse pendant 3 tours.", Persistance_Degats_Lancement: 40, Persistance_Degats_Zone: 60 };
const BRULE = { Nom: "Brûlé", Cout_PT: "2", Modificateur: "AUCUN", Type_Mecanique: "Magique", Type_Mecanique_2: "Aucun", Valeur: 0, Pourcent_Base: 10, Pourcent_Max: 60,
  Tours: 2, Effet_Base: "10% de chance de brûler la cible (max 60%).", Persistance_Mult_Lancement: 0.8, Persistance_Mult_Zone: 0.4 };
await p.evaluate(({ PERSISTANCE, BRULE }) => {
  window.EFFETS_BDD_CACHE = {
    EFF_ATT: { Nom: "Attaque Magique", Cout_PT: "2", Modificateur: "INTELLIGENCE", Type_Mecanique: "Action/Global", Type_Mecanique_2: "Aucun",
               Valeur: 10, Pourcent_Base: 0, Pourcent_Max: 0, Tours: 0, Effet_Base: "Inflige 10 dégâts magiques." },
    EFF_SOIN: { Nom: "Soin", Cout_PT: "2", Modificateur: "SAGESSE", Type_Mecanique: "Action/Global", Type_Mecanique_2: "Aucun", Valeur: 8, Pourcent_Base: 0, Pourcent_Max: 0, Tours: 0, Effet_Base: "Soigne 8 PV." },
    EFF_PERS: PERSISTANCE, EFF_BRULE: BRULE
  };
}, { PERSISTANCE, BRULE });
await section(async () => {
  const r = await p.evaluate(() => {
    const bdd = Object.entries(window.EFFETS_BDD_CACHE).map(([id, e]) => ({ id, ...e }));
    const eff = (id) => bdd.find(e => e.id === id);
    Object.assign(window.forgeState, { statsPerso: {}, caracs: { int: 16, sag: 14 }, effetsBDD: bdd, armePrincipale: "Magie",
      actions: [{ idInst: "A1", baseEffet: eff("EFF_ATT"), count: 1, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} },
                { idInst: "A2", baseEffet: eff("EFF_SOIN"), count: 1, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }] });
    window.rafraichirForge();
    const carte = document.getElementById("forge-contenu-carte");
    const fleches = [...carte.querySelectorAll(".forge-action")].map(a => [...a.querySelectorAll(".forge-btn-ordre")].map(b => b.disabled));
    window.deplacerActionForge("A2", -1);
    const ordre = window.forgeState.actions.map(a => a.idInst);
    const titres = [...document.querySelectorAll("#forge-contenu-carte .forge-action > .forge-ligne .forge-nom-effet")].map(x => x.textContent.trim());
    window.deplacerActionForge("A2", -1);
    const borne = window.forgeState.actions.map(a => a.idInst);
    window.forgeState.actions = window.forgeState.actions.slice(0, 1);
    window.rafraichirForge();
    const seule = document.querySelectorAll("#forge-contenu-carte .forge-btn-ordre").length;
    return { fleches, ordre, titres, borne, seule };
  });
  verifier("chaque effet a sa flèche ▲ et ▼ (le premier ne monte pas, le dernier ne descend pas)", JSON.stringify(r.fleches) === "[[true,false],[false,true]]", JSON.stringify(r.fleches));
  verifier("▲ sur le soin : il passe devant l'attaque (l'ordre de la carte, celui du combat)", r.ordre.join() === "A2,A1" && r.titres[0] === "Soin", JSON.stringify([r.ordre, r.titres]));
  verifier("…déjà premier, il ne monte plus", r.borne.join() === "A2,A1");
  verifier("un seul effet : pas de flèches", r.seule === 0, r.seule);
  const s = await p.evaluate(() => {
    const bdd = Object.entries(window.EFFETS_BDD_CACHE).map(([id, e]) => ({ id, ...e }));
    Object.assign(window.forgeState, { statsPerso: {}, caracs: { int: 16 }, effetsBDD: bdd, armePrincipale: "Magie",
      actions: [{ idInst: "A1", baseEffet: bdd.find(e => e.id === "EFF_ATT"), count: 8, mods: { EFF_PERS: 1 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }] });
    window.rafraichirForge();
    const sous = document.querySelector("#forge-contenu-carte .forge-persistance-surpuissante");
    const mention = sous && sous.querySelector(".forge-persistance-mention");
    return { bandeau: document.getElementById("forge-surpuissance").textContent, mention: mention ? mention.textContent : "",
             dessous: mention ? getComputedStyle(mention).display : "", derniere: !!(mention && sous.lastElementChild === mention),
             degats: sous ? [...sous.querySelectorAll(".forge-persistance-lancement, .forge-persistance-zone")].map(x => x.textContent) : [] };
  });
  verifier("une persistance surpuissante : « avec la surpuissance », en dessous des dégâts au lancement et dans la zone",
    s.mention === "avec la surpuissance" && s.dessous === "block" && s.derniere && s.degats.length === 2 && /au lancement/.test(s.degats[0]) && /dans la zone/.test(s.degats[1]), JSON.stringify(s));
});

// =========================================================================
titre("3. UNE SEULE MONNAIE : LES DRACHMES");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => ({
    neuve: window.drachmesDeLaFiche({ Drachmes: 12, Pieces_Laiton: 5, Or: 3 }),
    pieces: window.drachmesDeLaFiche({ Pieces_Laiton: 5, Pieces_Bronze: 65 }),
    or: window.drachmesDeLaFiche({ Or: 9 }),
    vide: window.drachmesDeLaFiche({}),
    libelle: (document.querySelector(".libelle-or") || {}).textContent }));
  verifier("une fiche qui a ses drachmes : elles seules comptent", r.neuve === 12, r.neuve);
  verifier("une ancienne fiche : ses laitons, plus ses bronzes changés à 30 pour 1 (5 + 2)", r.pieces === 7, r.pieces);
  verifier("…ou l'ancien « Or »", r.or === 9 && r.vide === 0, JSON.stringify([r.or, r.vide]));
  verifier("le bandeau de l'inventaire dit « Drachmes »", r.libelle === "Drachmes", r.libelle);
  const fiches = lire("grimoire_fiches.js"), app = lire("app.js");
  verifier("la fiche du livre : une seule pièce, « drachmes » (plus de laiton ni de bronze)", /<span>drachmes<\/span>/.test(fiches) && !/piece\("bronze"\)/.test(fiches) && /Drachmes: v/.test(fiches));
  verifier("…et la fiche s'enregistre en Drachmes", /Drachmes: donnees\.drachmes/.test(app) && /\{ Drachmes: valeur \}/.test(app));
  verifier("les IA le savent : la seule monnaie du monde est la drachme", /seule monnaie du monde est la DRACHME/.test(lire("lore_ivalis.js")));
});

// =========================================================================
titre("4. LES MAINS : JAMAIS DEUX BOUCLIERS, DEUX LANCES NI DEUX FRONDES");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const arme = (modele, uid, extra) => ({ nom: modele, modele, uid, type: "Arme lourde CAC", emplacement: "Main", ...(extra || {}) });
    const lance = { equipMainDroite: arme("Lance courte", "a"), equipMainGauche: null };
    const fronde = { equipMainDroite: null, equipMainGauche: arme("Fronde", "f", { type: "Arme légère Distance" }) };
    return {
      lance: window.mainsPossibles(lance, arme("Lance courte", "b")),
      lanceDague: window.mainsPossibles(lance, arme("Dague", "d")),
      fronde: window.mainsPossibles(fronde, arme("Fronde", "g", { type: "Arme légère Distance" })),
      bouclier: window.mainsPossibles({ equipMainDroite: { nom: "B", type: "Bouclier", uid: "s" } }, { nom: "B2", type: "Bouclier", uid: "t" }),
      deuxMains: window.familleUniqueEnMain(arme("Lance à deux mains", "z", { deuxMains: true })),
      memeUid: window.memeFamilleUnique(arme("Lance courte", "a"), arme("Lance courte", "a")) };
  });
  verifier("une lance en main droite : une seconde lance ne peut que la remplacer (main droite)", JSON.stringify(r.lance) === '["Droite"]', JSON.stringify(r.lance));
  // (v476) À côté d'une lance, la main gauche ne prend plus qu'un bouclier ou une bague.
  verifier("…une dague, elle, ne peut que la remplacer (v476)", JSON.stringify(r.lanceDague) === '["Droite"]');
  verifier("une fronde en main gauche : une seconde fronde ne peut que la remplacer", JSON.stringify(r.fronde) === '["Gauche"]', JSON.stringify(r.fronde));
  verifier("deux boucliers : toujours interdit", JSON.stringify(r.bouclier) === '["Droite"]');
  verifier("une lance à deux mains est aussi une lance (le Berserker n'en tient pas deux)", r.deuxMains === "lance");
  verifier("la même arme (même identifiant) n'est pas un doublon", r.memeUid === false);
  verifier("prendre en main depuis le stockage refuse le doublon", /memeFamilleUnique\(objet, o\)/.test(lire("grimoire_fiches.js")));
});

// =========================================================================
titre("5. LE VOYAGE : PLUS DE NUIT, LES JOURS DÉFILENT PENDANT LA MARCHE, LA DATE QUI ROULE");
// =========================================================================
await section(async () => {
  const d = await p.evaluate(() => ({ dist: window.DISTANCE_JOUR_VOYAGE, j: [0.09, 0.1, 0.25, 0.45].map(l => window.joursDeMarcheVoyage(l)) }));
  verifier("deux fois plus de jours pour la même route (10 % de carte par jour)", d.dist === 0.1 && JSON.stringify(d.j) === "[1,1,3,5]", JSON.stringify(d));
  await p.evaluate(() => { window.__docs["Date_En_Jeu/actuelle"] = { Jour: "99", Annee: "3" }; window.DATE_EN_JEU_ACTUELLE = { jour: "99", annee: "3" }; });
  await lancerVoyageRegional({ x: 0.25, y: 0.6 }, { x: 0.75, y: 0.45 });
  const v0 = await v();
  verifier("le départ : la marche du jour 1", v0 && v0.Etat === "marche" && v0.Jour === 1 && v0.Jours >= 3, JSON.stringify(v0 && [v0.Etat, v0.Jour, v0.Jours]));
  const etats = [];
  let dates = [];
  for (let i = 0; i < 12; i++) {
    const w = await v();
    if (!w) break;
    await finir();
    await p.waitForTimeout(80);
    const apres = await v(), date = await p.evaluate(() => JSON.parse(JSON.stringify(window.__docs["Date_En_Jeu/actuelle"])));
    etats.push(apres ? apres.Etat + apres.Jour : "fin");
    dates.push(date.Jour);
    if (i === 0) {
      const roule = await p.evaluate(() => { const el = document.getElementById("date-voyage");
        return el ? { visible: el.classList.contains("visible"), texte: el.textContent.replace(/\s+/g, " "), roulent: [...el.querySelectorAll(".chiffre-date.roule")].map(x => x.textContent),
                      fixes: [...el.querySelectorAll(".chiffre-date:not(.roule)")].map(x => x.textContent) } : null; });
      verifier("la fin du jour 1 : pas de nuit, la marche file sur le jour 2", apres && apres.Etat === "marche" && apres.Jour === 2, etats.join());
      verifier("…la date avance d'un jour (99 → 100), gardée sur le voyage", date.Jour === "100" && apres.Date_Avant.Jour === "99" && apres.Date_Apres.Jour === "100", JSON.stringify([date, apres.Date_Avant, apres.Date_Apres]));
      verifier("…sans attendre : la journée suivante part aussitôt", Number(apres.Delai_Depart_Ms) === 0, apres.Delai_Depart_Ms);
      verifier("la date apparaît en haut du livre, en fondu", roule && roule.visible && /Jour .* de l'an 3/.test(roule.texte), JSON.stringify(roule));
      verifier("…ses chiffres qui changent roulent (9→0, 9→0, et le 1 qui arrive), l'an reste", roule && roule.roulent.length === 3 && roule.fixes.includes("3"), JSON.stringify(roule));
      const centre = await p.evaluate(() => { const el = document.getElementById("date-voyage").getBoundingClientRect(), l = document.getElementById("grimoire-livre");
        const r = l ? l.getBoundingClientRect() : { left: 0, width: innerWidth, top: 0 }; return { ecart: Math.abs(el.left + el.width / 2 - (r.left + r.width / 2)), haut: el.top - r.top }; });
      verifier("…centrée en haut", centre.ecart < 3 && centre.haut < 60, JSON.stringify(centre));
    }
    if (!apres) break;
  }
  verifier("jamais de nuit ni de campement, jusqu'à l'arrivée", etats.length >= 3 && !etats.some(e => /nuit/.test(e)) && etats[etats.length - 1] === "fin", etats.join());
  verifier("un jour de plus à chaque journée de marche (Jours − 1 en tout)", Number(dates[dates.length - 1]) === 99 + v0.Jours - 1, JSON.stringify(dates));
  verifier("plus de « JOUR 2 » en grand", !/annoncerJour\(k\)/.test(lire("voyage_groupe.js").replace(/function annoncerJour\(k\)/, "")));
  const ici = await p.evaluate(() => ({ fin: window.__docs["Systeme_Parties/P1"].Voyage_Termine, lieu: window.__docs["Systeme_Parties/P1"].Situation }));
  verifier("l'arrivée : le voyage s'achève", ici.fin && ici.fin.Id === v0.Id, JSON.stringify(ici));
});

// =========================================================================
titre("6. LE NARRATEUR : RÉACTIONS, COMBAT VÉCU EN JEU, CONTINUITÉ DU MONDE");
// =========================================================================
await section(async () => {
  const ia = lire("ia_master.js"), crp = lire("combat_rp.js");
  verifier("« évite de répéter les mêmes réactions corporelles ; une émotion établie n'est pas redécrite »", /Évite de répéter les mêmes réactions corporelles du narrateur/.test(ia) && /Une émotion déjà établie n'a pas besoin d'être redécrite à chaque échange/.test(ia));
  verifier("le combat se vit en jeu : une reprise à partir du résultat réel (« Kréon gît dans la mousse »)", /n'imagine jamais un combat qui vient de se passer/.test(ia) && /Kréon gît dans la mousse, blessé mais vivant/.test(crp) && !/Ne rejoue pas le combat coup par coup : raconte la fin/.test(crp));
  verifier("la continuité : relire le lieu, les présents, les événements (cité → hameau, jour → nuit…)", /CONTINUITÉ DU MONDE/.test(ia) && /une cité reste une cité/.test(ia));
  verifier("ces règles partent TOUJOURS, même avec le cerveau de la base (INST_10895)", /instructionMJ \+ "\\n\\n" \+ CONSIGNES_NARRATEUR_TOUJOURS/.test(ia));
});

// =========================================================================
titre("7. LES FILS INVISIBLES : SAVOIR CE QUI S'EST PASSÉ, L'OUÏ-DIRE, LE BON SENS, PAS DE « −0 »");
// =========================================================================
await section(async () => {
  const P = await import('../social_pur.js');
  const psy = { traits: { prudence: 50, impulsivite: 50, loyaute: 50, empathie: 50, orgueil: 50, sociabilite: 50 }, valeurs: ["honneur"] };
  const ames = { T: { id: "T", type: "heros", nom: "Tartuf", psyche: psy }, Th: { id: "Th", type: "pnj", nom: "Thalia", psyche: psy },
                 S: { id: "S", type: "pnj", nom: "Syrinx", psyche: psy }, M: { id: "M", type: "pnj", nom: "Mael", psyche: psy } };
  const ctx = { presents: ["T", "Th", "S", "M"], tour: 1, historique: [] };
  let r = P.appliquerEvenements({ ames, liens: {} }, [{ type: "sauver", acteur: "T", cible: "S", gravite: 3, resume: "Tartuf sauve Syrinx.", temoins: ["M"] }], ctx);
  const de = (q, vers) => r.changements.filter(c => c.de === q && (!vers || c.vers === vers));
  verifier("Thalia n'a rien vu (restée au village) : aucun de ses liens ne bouge", de("Th").length === 0);
  verifier("Mael l'a vu : son regard sur Tartuf change", de("M", "T").some(c => c.axe === "confiance" && c.apres > c.avant));
  const temoin = de("M", "T").find(c => c.axe === "confiance").apres;
  r = P.appliquerEvenements(r.etat, [{ type: "raconter", acteur: "S", cible: "Th", gravite: 3, resume: "Syrinx raconte.", temoins: [], rapporte: { type: "sauver", acteur: "T", cible: "S" } }], ctx);
  const ouiDire = de("Th", "T");
  verifier("Syrinx le raconte à Thalia : elle l'apprend, son regard sur Tartuf change", ouiDire.some(c => c.axe === "respect" && c.apres > c.avant) && !ouiDire.some(c => c.axe === "dette"), JSON.stringify(ouiDire.map(c => c.axe)));
  verifier("…moins fort qu'un témoin direct (×0,3)", (ouiDire.find(c => c.axe === "confiance") || {}).apres < temoin, `${(ouiDire.find(c => c.axe === "confiance") || {}).apres} < ${temoin}`);
  const rejet = P.appliquerEvenements(r.etat, [{ type: "raconter", acteur: "S", cible: "Th", gravite: 1, resume: "?", temoins: [], rapporte: { type: "sauver", acteur: "X", cible: "S" } }], ctx);
  verifier("on ne raconte pas l'acte d'un inconnu", rejet.rejets.length === 1);
  r = P.appliquerEvenements({ ames, liens: {} }, [{ type: "defendre", acteur: "Th", cible: "T", gravite: 2, resume: "Thalia défend les aventuriers.", temoins: ["M"] },
                                                  { type: "s_opposer", acteur: "Th", cible: "M", gravite: 2, resume: "Thalia s'oppose à Mael.", temoins: [] }], ctx);
  const mael = Object.fromEntries(de("M", "Th").map(c => [c.axe, c.apres - c.avant]));
  verifier("Thalia s'oppose à Mael en défendant les aventuriers : Mael → Thalia, confiance et attachement en baisse", mael.confiance < 0 && mael.attachement < 0 && mael.crainte > 0, JSON.stringify(mael));
  verifier("…et Mael est en colère", (r.etat.ames.M.humeur || {}).emotion === "colere");
  const ancien = P.appliquerEvenements({ ames, liens: {} }, [{ type: "aider", acteur: "T", cible: "S", gravite: 1, resume: "x" }], ctx);
  verifier("une scène d'avant la v475 (sans témoins nommés) : tous les présents en sont témoins, comme avant", ["Th", "M"].every(t => ancien.changements.some(c => c.de === t)));
  const soc = lire("social.js");
  verifier("MIA_SOCIAL nomme les témoins, connaît « raconter » et « s_opposer »", /« temoins »/.test(soc) && /c'est l'action « raconter »/.test(soc) && /ajoute « s_opposer »/.test(soc) && /required: \["type", "acteur", "cible", "gravite", "resume", "temoins"\]/.test(soc));
  verifier("plus de « attachement −0 » : un écart qui s'arrondit à zéro ne s'écrit ni ne s'affiche", /Math\.abs\(c\.apres - c\.avant\) >= 0\.5/.test(soc) && /Math\.round\(Math\.abs\(Number\(v\) \|\| 0\)\) > 0/.test(lire("grimoire_liens.js")));
});

// =========================================================================
titre("8. LE MULTIPLICATEUR DE PERSISTANCE DES ÉTATS : AU LANCEMENT, DANS LA ZONE");
// =========================================================================
await section(async () => {
  const base = await p.evaluate(() => ({ m: window.multiplicateursPersistanceEtat({ Persistance_Mult_Lancement: 0.8, Persistance_Mult_Zone: "0,4" }),
    defaut: window.multiplicateursPersistanceEtat({}), c: window.chancesEtatAvecPersistance(100, 0, { lancement: 0.8, zone: 0.4 }),
    bonus: window.chancesEtatAvecPersistance(100, 5, { lancement: 0.8, zone: 0.4 }) }));
  verifier("0,8 et 0,4 : de 100 % de base, 80 % au lancement et 40 % dans la zone", base.c.lancement === 80 && base.c.zone === 40 && base.m.zone === 0.4, JSON.stringify(base));
  verifier("…la surpuissance ou un talent (+5) s'ajoute APRÈS le multiplicateur : 85 et 45", base.bonus.lancement === 85 && base.bonus.zone === 45);
  verifier("sans réglage : ×1 (rien ne change)", base.defaut.lancement === 1 && base.defaut.zone === 1);
  const carte = await p.evaluate(async () => {
    window.jouerSonClic = () => {};
    window.PERSOS_PARTIE = [{ idPersonnage: "M1", prenom: "Goule", camp: "Ennemi", estMonstre: true, PV_Max: 40, PV_Actuels: 40 }];
    window.TOKENS_VTT_DATA = { M1: { q: 0, r: 0 } };
    window.COMPETENCES_CACHE = window.COMPETENCES_CACHE || {};
    const extraire = async (mods) => {
      window.COMPETENCES_CACHE.C_V475 = { Nom: "Nappe ardente", Arme: "Magie", Fatigue: 25,
        Composants: { actions: [{ idInst: "A1", baseEffetId: "EFF_ATT", count: 1, mods, zoneHexes: [] }] } };
      const c = await window.demarrerCiblage("C_V475", { extraire: true, idLanceur: "M1" });
      const b = c && c.alterations.find(a => a.nom === "Brûlé");
      return b ? { chance: b.chance, ecart: b.ecartZone || 0 } : null;
    };
    const sans = await extraire({ EFF_BRULE: 6 });
    const avec = await extraire({ EFF_BRULE: 6, EFF_PERS: 1 });
    return { sans, avec, tricheMonstre: typeof window.multiplicateurSortsMonstre === "function" ? window.multiplicateurSortsMonstre(window.PERSOS_PARTIE[0]) : 1 };
  });
  const t = carte.tricheMonstre || 1;
  verifier("en combat, sans persistance : la chance du grimoire (6 crans × 10, max 60), rien de multiplié", carte.sans && carte.sans.chance === Math.min(100, Math.round(60 * t)) && carte.sans.ecart === 0, JSON.stringify(carte));
  verifier("avec la persistance : ×0,8 au lancement (48), l'écart de la zone retenu (48 − 24)", carte.avec && carte.avec.chance === Math.min(100, Math.round(48 * t)) && carte.avec.ecart === Math.round(24 * t), JSON.stringify(carte));
  const { creerZonePure } = await import('../moteur_pur.js');
  const zone = creerZonePure({ version: 3, combattants: {} }, { attaques: [], alterations: [{ persistante: true, nom: "Brûlé", chance: 53, ecartZone: 24, duree: 2, typeZone: "feu" }] }, [{ q: 0, r: 0 }], null);
  verifier("la nappe garde la chance de la zone (le lancement moins l'écart, bonus compris : 53 − 24 = 29)", zone && zone.etat.chance === 29, JSON.stringify(zone && zone.etat));
  const forge = await p.evaluate(() => {
    const bdd = Object.entries(window.EFFETS_BDD_CACHE).map(([id, e]) => ({ id, ...e }));
    const act = { idInst: "A1", baseEffet: bdd.find(e => e.id === "EFF_ATT"), count: 1, mods: { EFF_BRULE: 6, EFF_PERS: 1 }, zoneHexes: [], baseDuree: 0, modsDuree: {} };
    Object.assign(window.forgeState, { statsPerso: {}, caracs: { int: 10 }, effetsBDD: bdd, armePrincipale: "Magie", actions: [act] });
    window.rafraichirForge();
    const lignes = [...document.querySelectorAll("#forge-contenu-carte .forge-sous-effet .forge-desc")].map(x => x.innerHTML);
    const gras = [...document.querySelectorAll("#forge-contenu-carte .forge-chance-persistance")].map(x => ({ t: x.textContent, b: getComputedStyle(x).fontWeight }));
    const aug = window.augmentationsMaxForge(bdd.find(e => e.id === "EFF_BRULE"), act);
    act.mods = { EFF_BRULE: 6 };
    window.rafraichirForge();
    const sansPers = document.querySelectorAll("#forge-contenu-carte .forge-chance-persistance").length;
    return { gras, sansPers, aug };
  });
  verifier("dans la Forge, en gras à la fin de l'effet : « 48 % avec persistance au lancement » · « 24 % dans la zone » (+ la surpuissance de la carte, après)",
    forge.gras.length === 2 && forge.gras[0].t === `${48 + forge.aug} % avec persistance au lancement` && forge.gras[1].t === `${24 + forge.aug} % dans la zone` && Number(forge.gras[0].b) >= 700, JSON.stringify([forge.gras, forge.aug]));
  verifier("…sans persistance sur la carte, rien de plus", forge.sansPers === 0);
  const editeur = await p.evaluate(() => {
    document.getElementById("tbody-effets").innerHTML = "";
    window.ajouterLigneEffetHTML("E_BRULE", { Nom: "Brûlé", Pourcent_Base: 10, Pourcent_Max: 60, Persistance_Mult_Lancement: 0.8, Persistance_Mult_Zone: 0.4 });
    window.ajouterLigneEffetHTML("E_PERS", { Nom: "Persistance terrain" });
    window.ajouterLigneEffetHTML("E_DEG", { Nom: "Attaque Magique", Valeur: 10 });
    const l = (id) => document.getElementById("mult-pers-" + id);
    return { lancement: l("lancement-E_BRULE") && l("lancement-E_BRULE").value, zone: l("zone-E_BRULE") && l("zone-E_BRULE").value,
             pers: !!document.getElementById("ligne-mult-persistance-E_PERS"), deg: !!document.getElementById("ligne-mult-persistance-E_DEG") };
  });
  verifier("l'éditeur des effets : sous un effet à chance, × au lancement et × dans la zone", editeur.lancement === "0.8" && editeur.zone === "0.4", JSON.stringify(editeur));
  verifier("…pas sous la Persistance elle-même, ni sous un effet sans chance", !editeur.pers && !editeur.deg);
  verifier("…et l'enregistrement les écrit (Persistance_Mult_Lancement, Persistance_Mult_Zone)", /newData\.Persistance_Mult_Lancement = mult\(/.test(lire("app.js")) && /newData\.Persistance_Mult_Zone = mult\(/.test(lire("app.js")));
});

// =========================================================================
titre("9. LES VERSIONS");
// =========================================================================
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 475 ou plus (trace_combat.js, version.json)", v >= 475 && JSON.parse(lire("version.json")).version >= 475, `${v} / ${JSON.parse(lire("version.json")).version}`);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
