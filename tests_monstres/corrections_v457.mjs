// v457 — LE RP DANS LES COMBATS ET SUR LA ROUTE.
// Nico : « en combat RP, que les PNJ ennemis parlent de temps en temps en balançant une phrase rôle play : au début du
// tour, une chance sur quatre, selon le caractère de l'ennemi et la situation. L'écran devient noir comme le dialogue
// privé, on voit l'avatar ennemi et la phrase ; un clic n'importe où ferme la fenêtre et le combat se poursuit. Pareil
// quand un joueur tombe KO : une phrase d'un des PNJ nommés encore présents. »
// « Lors des déplacements sur la carte, 30 % de chance qu'au lieu d'un POI, un des PNJ qui nous suivent ouvre pour
// tous la fenêtre de dialogue, visible par tous, et commence à parler à l'un des joueurs (« NOM DU HÉROS, … ») ; ce
// joueur peut entamer la discussion, les autres lisent. »
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
const S = process.env.V457_CAPTURES || "";
const cap = async (nom) => { if (S) await p.screenshot({ path: S + "/" + nom + ".png" }); };


// =========================================================================
titre("1. LE PONT DU COMBAT : LA RÉPLIQUE APRÈS LE DÉBUT D'UN TOUR ET LA CHUTE, JAMAIS BLOQUANTE");
// =========================================================================
await section(async () => {
  const { creerPont } = await import('../pont_combat.js');
  const vus = [], traces = [];
  const pont = creerPont({ replique: async (e) => { vus.push(e.type); if (e.casse) throw new Error("panne"); }, reaction: async () => true, pause: async () => {}, tracer: (i, t) => traces.push(t) });
  await pont.animer({ type: "tour", file: [{ id: "M1" }], phase: "Resolution", manche: 1, ontJoue: [] }, { combattants: { M1: { id: "M1" } } });
  await pont.animer({ type: "chute", cible: "H1", acteur: "M1" }, { combattants: { H1: { id: "H1" } } });
  await pont.animer({ type: "pas", acteur: "H1", de: { q: 0, r: 0 }, vers: { q: 1, r: 0 } }, { combattants: {} });
  verifier("le début d'un tour et une chute passent par la réplique ; un pas, non", vus.join(",") === "tour,chute", vus.join(","));
  let leve = false;
  try { await pont.animer({ type: "tour", casse: true, file: [] }, { combattants: {} }); } catch (e) { leve = true; }
  verifier("une réplique en panne n'arrête pas la partie (tracée)", !leve && traces.some(t => /réplique en échec/.test(t)), JSON.stringify(traces));
  const rc = fs.readFileSync(path.join(RACINE, "regime_cerveau.js"), "utf-8");
  verifier("le jeu branche la réplique du combat du récit (regime_cerveau.js)", /replique: \(etape, etat\) => window\.repliqueCombatRP \? window\.repliqueCombatRP\(etape, etat\) : null/.test(rc));
});

// Le combat du récit : Dame Koré (PNJ nommé, son portrait), un molosse, Thorin et Lyra.
const KORE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1/PNJ/kore.png";
const poserCombat = (repliques) => p.evaluate(([repliques, KORE]) => {
  window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Thorin", camp: "Allié" }, { idPersonnage: "H2", prenom: "Lyra", camp: "Allié" },
    { idPersonnage: "M1", nom: "Dame Koré", estMonstre: true, pnjNomme: "Dame Koré", urlCloudinary: KORE }, { idPersonnage: "M2", nom: "Molosse", estMonstre: true }];
  window.PARTIE_DATA = window.PARTIE_DATA || {};
  window.PARTIE_DATA.Combat_RP = { Id: "C_457", Etat: "en_cours", Raison: "Dame Koré veut le collier.", ...(repliques ? { Repliques: repliques } : {}) };
  if (typeof window.appliquerCombatRPDeLaPartie === "function") { try { window.appliquerCombatRPDeLaPartie(window.PARTIE_DATA); } catch (e) {} }
}, [repliques, KORE]);
const REPLIQUES = [{ Nom: "Dame Koré", Debut: ["D1", "D2", "D3"], Blesse: ["B1", "B2"], Seul: ["S1", "S2"], Ko: ["Reste à terre, vermine.", "Un de moins !"] }];
const etatCombat = (o) => ({ manche: 1, combattants: { H1: { id: "H1", pv: 30, pvMax: 40 }, H2: { id: "H2", pv: 30, pvMax: 40 },
  M1: { id: "M1", estMonstre: true, pv: 80, pvMax: 100 }, M2: { id: "M2", estMonstre: true, pv: 20, pvMax: 20 }, ...(o || {}) } });

// =========================================================================
titre("2. AU DÉBUT DE SON TOUR : UNE CHANCE SUR QUATRE, LA MÊME SUR CHAQUE POSTE, SELON LA SITUATION");
// =========================================================================
await section(async () => {
  await poserCombat(REPLIQUES);
  const r = await p.evaluate(([etat]) => {
    const dire = (id, manche, et) => window.repliqueDuMomentCombatRP({ type: "tour", file: [{ id }], phase: "Resolution", manche, ontJoue: ["H1"] }, et || etat);
    let parle = 0, memes = true; const phrases = new Set();
    for (let m = 1; m <= 400; m++) { const a = dire("M1", m), b = dire("M1", m); if (JSON.stringify(a) !== JSON.stringify(b)) memes = false; if (a) { parle++; phrases.add(a.texte); } }
    let molosse = 0; for (let m = 1; m <= 200; m++) if (dire("M2", m)) molosse++;
    const premier = [...Array(400).keys()].map(i => i + 1).find(m => dire("M1", m));
    const blesse = dire("M1", premier, { ...etat, combattants: { ...etat.combattants, M1: { id: "M1", estMonstre: true, pv: 20, pvMax: 100 } } });
    const seule = dire("M1", premier, { ...etat, combattants: { ...etat.combattants, M2: { id: "M2", estMonstre: true, aTerre: true } } });
    const exemple = dire("M1", premier);
    return { parle, memes, phrases: [...phrases], molosse, blesse, seule, exemple, premier };
  }, [etatCombat()]);
  verifier("Dame Koré parle environ une fois sur quatre (400 tours)", r.parle > 70 && r.parle < 130, `${r.parle}/400`);
  verifier("…le même tirage sur chaque poste (le combat, la manche, le combattant)", r.memes);
  verifier("…en forme : ses phrases de début de tour, variées", r.phrases.every(x => /^D\d$/.test(x)) && r.phrases.length === 3, JSON.stringify(r.phrases));
  verifier("…avec son nom et son portrait", r.exemple && r.exemple.nom === "Dame Koré" && r.exemple.image === KORE, JSON.stringify(r.exemple));
  verifier("grièvement blessée (≤ 35 % de ses PV) : ses phrases de blessée", r.blesse && /^B\d$/.test(r.blesse.texte), JSON.stringify(r.blesse));
  verifier("la dernière de son camp debout : ses phrases de solitude", r.seule && /^S\d$/.test(r.seule.texte), JSON.stringify(r.seule));
  verifier("une créature sans nom (le molosse) ne parle jamais", r.molosse === 0, String(r.molosse));
  await poserCombat(null);
  const sans = await p.evaluate(([etat, m]) => window.repliqueDuMomentCombatRP({ type: "tour", file: [{ id: "M1" }], phase: "Resolution", manche: m, ontJoue: ["H1"] }, etat), [etatCombat(), r.premier]);
  verifier("sans répliques écrites (pas encore prêtes), rien", sans === null, JSON.stringify(sans));
});

// =========================================================================
titre("3. UN HÉROS TOMBE : UNE PHRASE D'UN PNJ NOMMÉ ENCORE DEBOUT");
// =========================================================================
await section(async () => {
  await poserCombat(REPLIQUES);
  const r = await p.evaluate(([etat]) => {
    const ko = (cible, et) => window.repliqueDuMomentCombatRP({ type: "chute", cible, acteur: "M2" }, et || etat);
    return { thorin: ko("H1"), lyra: ko("H2"), molosse: ko("M2"),
             koreATerre: ko("H1", { ...etat, combattants: { ...etat.combattants, M1: { id: "M1", estMonstre: true, aTerre: true } } }) };
  }, [etatCombat()]);
  verifier("Thorin tombe : Dame Koré le nargue", r.thorin && r.thorin.nom === "Dame Koré" && /^(Reste à terre, vermine\.|Un de moins !)$/.test(r.thorin.texte), JSON.stringify(r.thorin));
  // (v459) Nico : « ne lui fais pas dire son nom : ce n'est pas dit que le personnage connaisse le nom du héros ».
  verifier("(v459) …sans dire son nom (elle ne le connaît pas forcément)", r.thorin && !/Thorin/.test(r.thorin.texte), JSON.stringify(r.thorin));
  verifier("…Lyra aussi (toujours une phrase à la chute d'un héros), sans son nom", r.lyra && !!r.lyra.texte && !/Lyra/.test(r.lyra.texte), JSON.stringify(r.lyra));
  // Une réplique écrite avant la v459, avec la marque {heros} : elle la perd.
  await poserCombat([{ Nom: "Dame Koré", Debut: ["D1"], Blesse: [], Seul: [], Ko: ["Un de moins, {heros} !"] }]);
  const vieille = await p.evaluate(([etat]) => window.repliqueDuMomentCombatRP({ type: "chute", cible: "H1", acteur: "M2" }, etat), [etatCombat()]);
  verifier("(v459) une réplique d'avant, avec la marque du nom : la marque s'efface", vieille && vieille.texte === "Un de moins !", JSON.stringify(vieille));
  verifier("une créature qui tombe : rien", r.molosse === null);
  verifier("Dame Koré déjà à terre : personne pour parler", r.koreATerre === null);
});

// =========================================================================
titre("4. LA FENÊTRE : LE NOIR DU DIALOGUE PRIVÉ, L'AVATAR, LA PHRASE ; UN CLIC N'IMPORTE OÙ LA FERME");
// =========================================================================
await section(async () => {
  await poserCombat([{ Nom: "Dame Koré", Debut: ["*Elle lève son sceptre* À genoux, chiens d'Eraldur !"], Blesse: [], Seul: [], Ko: ["Reste à terre, toi."] }]);
  await p.evaluate(([etat]) => { window.__repliqueFinie = null;
    window.repliqueCombatRP({ type: "chute", cible: "H1", acteur: "M1" }, etat).then(v => { window.__repliqueFinie = v; }); }, [etatCombat()]);
  await p.waitForTimeout(400);
  const f = await p.evaluate(() => { const el = document.querySelector(".discussion-privee.replique-combat"); if (!el) return null;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    return { fond: cs.backgroundColor, plein: r.width >= innerWidth - 1 && r.height >= innerHeight - 1, img: (el.querySelector("img.avatar-dp.pnj") || {}).src || "",
             nom: (el.querySelector(".nom-dp") || {}).textContent, texte: (el.querySelector(".texte-dp") || {}).textContent, enCours: window.__repliqueFinie === null }; });
  verifier("l'écran noir (comme le dialogue privé), en plein écran", f && /rgba\(0, 0, 0, 0\.8/.test(f.fond) && f.plein, JSON.stringify(f));
  verifier("…l'avatar de Dame Koré, son nom, sa phrase", f && f.img === KORE && f.nom === "Dame Koré" && /Reste à terre, toi/.test(f.texte), JSON.stringify(f));
  verifier("…le combat attend (l'animation n'est pas finie)", f && f.enCours);
  await cap("v457_replique");
  await p.mouse.click(40, 60); await p.waitForTimeout(200);
  verifier("un clic n'importe où : la fenêtre se ferme, le combat se poursuit", await p.evaluate(() => !document.querySelector(".replique-combat") && window.__repliqueFinie === true));
  // Le geste entre astérisques, en italique doré (comme le dialogue privé).
  await p.evaluate(([etat]) => { window.PARTIE_DATA.Combat_RP.Repliques[0].Debut = ["*Elle lève son sceptre* À genoux !"];
    for (let m = 1; m < 400; m++) { const e = { type: "tour", file: [{ id: "M1" }], phase: "Resolution", manche: m, ontJoue: [] }; if (window.repliqueDuMomentCombatRP(e, etat)) { window.repliqueCombatRP(e, etat); break; } } }, [etatCombat()]);
  await p.waitForTimeout(300);
  verifier("le geste entre astérisques, à part (en italique)", await p.evaluate(() => { const g = document.querySelector(".replique-combat .geste-dp"); return !!g && g.textContent === "Elle lève son sceptre"; }));
  await p.evaluate(() => document.querySelector(".replique-combat").click());
});

// =========================================================================
titre("5. LES RÉPLIQUES S'ÉCRIVENT PENDANT LA PRÉPARATION, POUR CHAQUE PNJ NOMMÉ");
// =========================================================================
await section(async () => {
  await p.evaluate(() => {
    const d = window.__docs["Systeme_Parties/P1"];
    d.Combat_RP = { Id: "C_457", Etat: "preparation", Raison: "Dame Koré veut le collier.", Ennemis: { Tirage: { depart: [{ nom: "Dame Koré", pnj: "Dame Koré" }, { nom: "Molosse" }], renforts: [] } } };
    window.PARTIE_DATA = JSON.parse(JSON.stringify(d));
    if (typeof window.appliquerCombatRPDeLaPartie === "function") { try { window.appliquerCombatRPDeLaPartie(JSON.parse(JSON.stringify(d))); } catch (e) {} }
  });
  const avant = requetes.length;
  await p.evaluate(() => window.ecrireLesRepliquesCombatRP());
  const req = requetes.slice(avant).find(x => /répliques de combat/.test(x.systeme));
  const rep = await p.evaluate(() => (window.__docs["Systeme_Parties/P1"].Combat_RP || {}).Repliques);
  verifier("l'IA reçoit les PNJ nommés affrontés (pas le molosse) et ce qui a déclenché le combat", !!req && /Dame Koré/.test(req.texte) && !/Molosse/.test(req.texte) && /veut le collier/.test(req.texte), req ? req.texte.slice(0, 200) : "aucune");
  verifier("…selon leur caractère et la situation (début, blessé, seul, héros à terre)", !!req && /caractère/.test(req.systeme) && /quand un des héros tombe à terre/.test(req.systeme), "");
  verifier("(v459) …jamais le nom d'un héros (le PNJ ne le connaît pas forcément)", !!req && /JAMAIS LE NOM D'UN HÉROS/.test(req.systeme) && !/\{heros\}/.test(req.systeme), "");
  verifier("rangées sur le combat (Combat_RP.Repliques)", Array.isArray(rep) && rep.length === 1 && rep[0].Nom === "Dame Koré" && rep[0].Debut.length === 3 && rep[0].Ko.length === 3, JSON.stringify(rep));
  const src = fs.readFileSync(path.join(RACINE, "combat_rp.js"), "utf-8");
  verifier("…en fond pendant la préparation (le combat ne les attend pas)", /!c\.Repliques && !fait\("repliques"\)\) lancer\("repliques", ecrireLesRepliques\);/.test(src));
  await p.evaluate(() => { delete window.__docs["Systeme_Parties/P1"].Combat_RP; delete window.PARTIE_DATA.Combat_RP; window.appliquerCombatRPDeLaPartie({}); });
});

// =========================================================================
titre("6. EN VOYAGE : AVEC UN SUIVEUR, 30 % DES POI DEVIENNENT UNE DISCUSSION SUR LA ROUTE");
// =========================================================================
const MIRA = { id: "PNJ_mira", nom: "Mira", etat: "avec", depuis: "Jour 3 de l'an 3" };
await section(async () => {
  await p.evaluate((MIRA) => {
    window.appliquerReglagesGroupeDeLaBase({ Chance_POI: 1 });
    window.__docs["Monde_PNJ/PNJ_mira"] = { Nom_PNJ: "Mira", Race: "Humain", Occupation: "Éclaireuse", URL_Cloudinary: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1/PNJ/mira.png", Style_De_Parole: "moqueuse, directe" };
  }, MIRA);
  await lancerVoyageRegional({ x: 0.25, y: 0.6 }, { x: 0.8, y: 0.3 });
  const compter = (avec) => p.evaluate(([avec, MIRA]) => {
    const d = window.__docs["Systeme_Parties/P1"]; if (avec) d.Suiveurs = [MIRA]; else delete d.Suiveurs;
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(d)));
    const v = d.Voyage_Groupe; let dia = 0, poi = 0, f = true;
    for (let i = 0; i < 400; i++) { const x = window.planifierPoiVoyage(v, 1); if (!x) continue; if (x.Dialogue) { dia++; const j = { de: 0, a: v.Etapes[0] }; if (!(x.f > j.de && x.f < j.a)) f = false; } else poi++; }
    return { dia, poi, f };
  }, [avec, MIRA]);
  const avec = await compter(true), sans = await compter(false);
  verifier("avec un suiveur : environ 30 % de discussions à la place des POI (400 tirages)", avec.dia > 85 && avec.dia < 155 && avec.dia + avec.poi === 400, JSON.stringify(avec));
  verifier("…la halte sur la route de la journée (pas de place à côté)", avec.f);
  verifier("sans suiveur : toujours un POI", sans.dia === 0 && sans.poi === 400, JSON.stringify(sans));
});

// =========================================================================
titre("7. LA HALTE : LE SUIVEUR INTERPELLE UN HÉROS (« THORIN, … »), CHACUN VOIT LA FENÊTRE");
// =========================================================================
let fDialogue = 0;
await section(async () => {
  // La marche du jour 1 s'arrête sur la discussion prévue.
  fDialogue = await p.evaluate((MIRA) => {
    const d = window.__docs["Systeme_Parties/P1"]; d.Suiveurs = [MIRA];
    const v = d.Voyage_Groupe, f = Math.round(v.Etapes[0] * 0.5 * 10000) / 10000;
    Object.assign(v, { Etat: "marche", Jour: 1, Segment: null, Poi_Prevu: { Id: "D_TEST", f, Dialogue: true }, Debut_Marche: Date.now(), Duree_Marche_Ms: 4000, Delai_Depart_Ms: 0 });
    window.__vraisVotants = window.votantsVoyageGroupe;
    window.votantsVoyageGroupe = () => [{ id: "P_01", nom: "Thorin" }];
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(d)));
    return f;
  }, MIRA);
  await p.waitForTimeout(300);
  await p.evaluate(() => window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))));
  await p.evaluate(() => window.finirMarcheVoyage());
  const ok = await attendreQue(async () => { const x = (await partie()).Discussion_Route; return x && x.tour === "pnj"; }, 8000);
  const pt = await partie(), dr = pt.Discussion_Route || {};
  verifier("la marche s'arrête (Etat « dialogue »), sans POI", pt.Voyage_Groupe && pt.Voyage_Groupe.Etat === "dialogue" && !pt.Voyage_Groupe.Poi && pt.Voyage_Groupe.Dialogue.f === fDialogue, JSON.stringify(pt.Voyage_Groupe && pt.Voyage_Groupe.Etat));
  verifier("Mira ouvre le dialogue avec un héros du groupe, par son nom (« Thorin, … »)", ok && dr.idPnj === "PNJ_mira" && dr.idHeros === "H1" && dr.joueur === "P_01" && /^Thorin, /.test((dr.lignes || [])[0].texte), JSON.stringify(dr));
  const req = requetes.filter(x => /Sur la route, pendant la marche/.test(x.systeme)).pop();
  verifier("…l'IA sait qu'elle engage la conversation devant la compagnie, avec sa façon de parler", !!req && /C'EST TOI QUI ENGAGES LA CONVERSATION/.test(req.systeme) && /devant le reste de la compagnie/.test(req.systeme) && /moqueuse/.test(req.systeme), "");
  // Lyra (P_02) lit : pas d'encart pour écrire, la phrase de Mira, « Thorin va lui répondre… ».
  await joueur("P_02");
  await p.evaluate(() => { const x = window.DISCUSSION.route(); window.DISCUSSION.appliquerRoute(null); window.DISCUSSION.appliquerRoute(x); });
  const l = await p.evaluate(() => { const f = document.getElementById("discussion-route"); if (!f) return null;
    return { form: !!f.querySelector("form.encart-dp.pj"), texte: f.querySelector(".encart-dp.pnj .texte-dp").textContent, suite: f.querySelector(".suite-dp").textContent,
             img: (f.querySelector("img.avatar-dp.pnj") || {}).src || "", quitter: !f.querySelector(".quitter-dp").hidden, fond: getComputedStyle(f).backgroundColor }; });
  verifier("chez Lyra : la fenêtre (le noir du dialogue privé), Mira et sa phrase", l && /Thorin, tu ronfles/.test(l.texte) && /mira\.png/.test(l.img) && /rgba\(0, 0, 0, 0\.8/.test(l.fond), JSON.stringify(l));
  verifier("…elle lit seulement : pas d'encart pour écrire, « Thorin va lui répondre… »", l && !l.form && /Thorin va lui répondre/.test(l.suite) && !l.quitter, JSON.stringify(l));
  await p.mouse.click(300, 300); await p.waitForTimeout(150);
  verifier("…un toucher ne lui donne pas la parole", await p.evaluate(() => document.getElementById("discussion-route").dataset.tour === "pnj"));
  await cap("v457_route_lyra");
});

// =========================================================================
titre("8. THORIN RÉPOND ; AU TOUR DU PNJ, SA PHRASE EN BAS ; LE PNJ PARTI, LA MARCHE REPREND");
// =========================================================================
await section(async () => {
  await joueur("P_01");
  await p.evaluate(() => { const x = window.DISCUSSION.route(); window.DISCUSSION.appliquerRoute(null); window.DISCUSSION.appliquerRoute(x); });
  await p.mouse.click(300, 300); await p.waitForTimeout(150);
  const t = await p.evaluate(() => { const f = document.getElementById("discussion-route"); return { tour: f.dataset.tour, rappel: f.querySelector(".rappel-dp").textContent, saisie: !f.querySelector(".saisie-dp").disabled }; });
  verifier("chez Thorin : un toucher, à lui de répondre (la phrase de Mira en bas)", t.tour === "pj" && /Mira/.test(t.rappel) && /ronfles/.test(t.rappel) && t.saisie, JSON.stringify(t));
  await p.fill("#discussion-route .saisie-dp", "Moi ? Jamais de la vie.");
  await p.keyboard.press("Enter");
  await attendreQue(async () => ((await partie()).Discussion_Route || {}).lignes?.length === 3, 6000);
  const dr = (await partie()).Discussion_Route;
  verifier("sa réponse et celle de Mira, pour tous (Discussion_Route)", dr.lignes[1].qui === "pj" && dr.lignes[1].texte === "Moi ? Jamais de la vie." && /Menteur/.test(dr.lignes[2].texte) && dr.tour === "pnj", JSON.stringify(dr.lignes));
  const req = requetes.filter(x => /Sur la route, pendant la marche/.test(x.systeme)).pop();
  verifier("…l'IA a toute la discussion (Mira lui répond)", !!req && /Tu lui réponds/.test(req.systeme) && /Jamais de la vie/.test(req.texte), "");
  await p.waitForTimeout(200);
  const b = await p.evaluate(() => { const f = document.getElementById("discussion-route"); return { tour: f.dataset.tour, rappel: f.querySelector(".rappel-dp").textContent, cache: f.querySelector(".rappel-dp").hidden, pnj: f.querySelector(".encart-dp.pnj .texte-dp").textContent }; });
  verifier("au tour de Mira : la phrase de Thorin en bas, comme celle du PNJ", b.tour === "pnj" && !b.cache && /Thorin/.test(b.rappel) && /Jamais de la vie/.test(b.rappel) && /Menteur/.test(b.pnj), JSON.stringify(b));
  await cap("v457_route_thorin");
  // Lyra voit la même chose (la phrase de Thorin en bas).
  await joueur("P_02");
  await p.evaluate(() => { const x = window.DISCUSSION.route(); window.DISCUSSION.appliquerRoute(null); window.DISCUSSION.appliquerRoute(x); });
  verifier("…chez Lyra aussi", await p.evaluate(() => /Jamais de la vie/.test(document.querySelector("#discussion-route .rappel-dp").textContent)));
  await joueur("P_01");
  await p.evaluate(() => { const x = window.DISCUSSION.route(); window.DISCUSSION.appliquerRoute(null); window.DISCUSSION.appliquerRoute(x); });
  reglagesFaux.partir = true;
  await p.mouse.click(300, 300); await p.waitForTimeout(150);
  await p.fill("#discussion-route .saisie-dp", "Va donc.");
  await p.keyboard.press("Enter");
  await attendreQue(async () => ((await partie()).Discussion_Route || {}).tour === "parti", 6000);
  verifier("Mira met fin à la discussion (« parti »)", ((await partie()).Discussion_Route || {}).tour === "parti");
  await p.waitForTimeout(200);
  await p.mouse.click(300, 300);
  await attendreQue(async () => !(await partie()).Discussion_Route, 6000);
  await p.waitForTimeout(400);
  const pt = await partie();
  const ds = await p.evaluate(() => Object.entries(window.__docs).filter(([k]) => /^Systeme_Parties\/P1\/Discussions\//.test(k)).map(([, v]) => v).filter(v => v.route));
  verifier("un toucher : la fenêtre se ferme pour tous (plus de Discussion_Route)", !pt.Discussion_Route && !(await p.evaluate(() => !!document.getElementById("discussion-route"))));
  verifier("…la marche reprend d'où elle s'était arrêtée, jusqu'au bout de la journée", pt.Voyage_Groupe && pt.Voyage_Groupe.Etat === "marche" && pt.Voyage_Groupe.Segment && pt.Voyage_Groupe.Segment.de === fDialogue && pt.Voyage_Groupe.Segment.a === pt.Voyage_Groupe.Etapes[0], JSON.stringify(pt.Voyage_Groupe && pt.Voyage_Groupe.Segment));
  verifier("…la discussion rangée (devant la compagnie) pour MIA_SOCIAL", ds.length === 1 && ds[0].lignes.length === 5 && ds[0].nomPnj === "Mira", JSON.stringify(ds.map(x => x.lignes.length)));
});

// =========================================================================
titre("9. UNE HALTE RESTÉE SANS DISCUSSION (SON POSTE FERMÉ) : LA ROUTE REPREND D'ELLE-MÊME");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { const d = window.__docs["Systeme_Parties/P1"], v = d.Voyage_Groupe;
    Object.assign(v, { Etat: "dialogue", Dialogue: { Id: "D_VIEUX", f: 0.1, Le: Date.now() - 120000 }, Segment: null }); delete d.Discussion_Route;
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(d))); });
  verifier("au bout d'une minute, n'importe quel poste fait reprendre la marche", await attendreQue(async () => ((await partie()).Voyage_Groupe || {}).Etat === "marche", 4000));
  await p.evaluate(() => { if (window.__vraisVotants) window.votantsVoyageGroupe = window.__vraisVotants; });
});

// =========================================================================
titre("10. (v460) UN PNJ QUI NAÎT : SON A PRIORI ENVERS LES HÉROS (BACKGROUND, SCÈNE, HASARD) DANS SA PREMIÈRE IMPRESSION");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => {
    const S = window.SOCIAL, vrai = Math.random;
    const psyche = { prudence: 50, impulsivite: 50, loyaute: 50, empathie: 50, orgueil: 50, sociabilite: 50, valeurs: ["famille"], objectifs: ["tenir l'auberge"], faille: "naïve", masque: "souriante" };
    Math.random = () => 0.9;   // pas de hasard : l'a priori de l'IA
    await S.naissancePnj("P1", "PNJ_hela", { nom: "Héla", psyche, disposition_heros: "chaleureux", disposition_raison: "Elle accueille tous les voyageurs comme ses enfants." }, {});
    Math.random = () => 0.05;  // sympathique de nature, malgré un garde méfiant
    await S.naissancePnj("P1", "PNJ_brann", { nom: "Brann", psyche, disposition_heros: "mefiant", disposition_raison: "Une alerte aux portes." }, {});
    Math.random = () => 0.9;
    await S.naissancePnj("P1", "PNJ_ozan", { nom: "Ozan", psyche }, {});
    Math.random = vrai;
    const ames = { hela: window.__docs["Systeme_Parties/P1/Social_Ames/PNJ_hela"] || null };
    const cleAme = Object.keys(window.__docs).find(k => /PNJ_hela$/.test(k) && !/Monde_PNJ/.test(k));
    const chemin = cleAme ? cleAme.replace(/PNJ_hela$/, "") : "";
    const ame = (id) => window.__docs[chemin + id] || null;
    const heros = [{ idPersonnage: "H1", prenom: "Thorin" }];
    await S.assurerAmes({ idPartie: "P1", pnjs: ["PNJ_hela", "PNJ_brann", "PNJ_ozan"].map(id => ({ id, fiche: { Nom_PNJ: id } })), heros, reputation: 0 });
    const liens = await S.lireLiens("P1", ["PNJ_hela", "PNJ_brann", "PNJ_ozan"]);
    const vers = (id) => (liens[S.cleLien(id, "H1")] || {}).axes || null;
    return { chemin, hela: ame("PNJ_hela") && ame("PNJ_hela").disposition, brann: ame("PNJ_brann") && ame("PNJ_brann").disposition, ozan: ame("PNJ_ozan") && ame("PNJ_ozan").disposition,
             lHela: vers("PNJ_hela"), lBrann: vers("PNJ_brann"), lOzan: vers("PNJ_ozan") };
  });
  verifier("Héla, aubergiste chaleureuse (l'IA) : son a priori gardé sur son âme, avec sa raison", r.hela && r.hela.niveau === 2 && r.hela.nature === "" && /voyageurs/.test(r.hela.raison), JSON.stringify(r.hela));
  verifier("Brann, garde méfiant… mais sympathique de nature (le hasard)", r.brann && r.brann.base === -2 && r.brann.niveau === 1 && r.brann.nature === "sympathique", JSON.stringify(r.brann));
  verifier("Ozan, sans a priori donné : neutre", r.ozan && r.ozan.niveau === 0, JSON.stringify(r.ozan));
  verifier("à la première rencontre : Héla fait d'emblée confiance à Thorin (+25) et s'y attache (+20)", r.lHela && r.lHela.confiance === 25 && r.lHela.attachement === 20, JSON.stringify(r.lHela));
  verifier("…Brann le sympathique, un peu (+12) ; Ozan, rien", r.lBrann && r.lBrann.confiance === 12 && r.lOzan && r.lOzan.confiance === 0, JSON.stringify([r.lBrann, r.lOzan]));
  const ia = fs.readFileSync(path.join(RACINE, "ia_master.js"), "utf-8"), so = fs.readFileSync(path.join(RACINE, "social.js"), "utf-8");
  verifier("MIA_CASTING et MIA_PNJ demandent l'a priori (d'après le background et la scène)", (ia.match(/disposition_heros: window\.SOCIAL\.schemaDisposition\(\)/g) || []).length === 2 && /A PRIORI ENVERS LES HÉROS/.test(so));
  verifier("…MIA_AME aussi, pour un PNJ né sans âme", /disposition_heros: schemaDisposition\(\), disposition_raison: schemaRaisonDisposition\(\)/.test(so) && /Pour un PNJ, ajoute aussi son a priori/.test(so));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
