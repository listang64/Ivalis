// v287 — LE VOYAGE PLUS FIN, LES POI PRÈS DU GROUPE, LE CHAT, LES ENNEMIS DU
// MONDE ANTIQUE, LES ZONES DU TERRAIN, LA DÉFAITE.
//
// Nico :
//   · « la croix rouge de déplacement et le trait pointillé : moins épais (divise par trois) » ;
//   · « les POI doivent être à côté du chemin, et surtout du pion là où il est, et jamais après l'arrivée » ;
//   · « quand le chat est ouvert, à la place du bouton déplacement, une croix pour fermer le chatbox » ;
//   · « dans le chatbox, un bouton pour que ton perso passe son tour : il ne dit rien » ;
//   · « la génération des tokens ennemis : en suivant les races et le RP, dans un monde antique » ;
//     « les noms des ennemis doivent être représentatifs du RP » ;
//   · « réduis un peu la taille des tokens sur la piste d'initiative » ;
//   · « l'IA qui génère les zones (mur, terrain difficile) a fait n'importe quoi : un truc mieux ficelé » ;
//   · « réduis en taille l'effet sous les tokens leaders » ;
//   · « quand le combat a été perdu : Uncaught TypeError: Cannot set properties of null (setting
//     'file') at tour (combat_etat.js) … et ne lance pas de demande de spawn » ;
//   · « après avoir perdu, le RP nous dit qu'on a tué des mercenaires alors qu'on n'a rien tué :
//     envoie au MJ le bilan des pertes et blessures ».
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
await p.waitForTimeout(400);
const S = '/tmp/claude-0/-home-user-Ivalis/3718c626-55b5-577c-9b4f-a49012fd3784/scratchpad';

// =========================================================================
titre("1. LE TRACÉ DU VOYAGE (v289 : des pas et une croix à la plume, voir corrections_v289)");
// =========================================================================
await section(async () => {
  await lancerVoyageRegional({ x: 0.3, y: 0.5 }, { x: 0.75, y: 0.4 });
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => { const svg = document.getElementById("carte-region-voyage");
    return { pas: svg.querySelectorAll(".pas-voyage").length, croix: svg.querySelectorAll(".croix-voyage-trait").length }; });
  // (v287 divisait par trois le pointillé et la croix ; v289 les remplace.)
  verifier("(v289) le pointillé est devenu des pas, la croix deux traits de plume", r.pas > 5 && r.croix === 2, JSON.stringify(r));
  await p.screenshot({ path: S + "/v287_trace.png" });
});

// =========================================================================
titre("2. LES POI : À CÔTÉ DU GROUPE, SUR LE CÔTÉ DE LA ROUTE, JAMAIS APRÈS L'ARRIVÉE");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    window.appliquerReglagesGroupeDeLaBase({ Chance_POI: 1 });
    const v = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"].Voyage_Groupe));
    const asp = Number(v.Aspect) || 1;
    const pts = [];
    for (let i = 0; i < 150; i++) {
      for (let k = 1; k <= (Number(v.Jours) || 1); k++) {
        const q = window.planifierPoiVoyage(v, k);
        if (!q) continue;
        // Le point de la route où le groupe s'arrête, et la direction de la route.
        const P = (f) => { const t = v.Trace, cumul = [0]; for (let j = 1; j < t.length; j++) cumul.push(cumul[j - 1] + Math.hypot((t[j].x - t[j - 1].x) * asp, t[j].y - t[j - 1].y));
          const cible = f * cumul[cumul.length - 1]; let j = 1; while (j < cumul.length - 1 && cumul[j] < cible) j++; const u = (cible - cumul[j - 1]) / ((cumul[j] - cumul[j - 1]) || 1);
          return { x: t[j - 1].x + (t[j].x - t[j - 1].x) * u, y: t[j - 1].y + (t[j].y - t[j - 1].y) * u }; };
        const g = P(q.f), a = P(Math.max(0, q.f - 0.02)), b = P(Math.min(1, q.f + 0.02));
        const dir = { x: (b.x - a.x) * asp, y: b.y - a.y }, l = Math.hypot(dir.x, dir.y) || 1;
        const vers = { x: (q.x - g.x) * asp, y: q.y - g.y }, dist = Math.hypot(vers.x, vers.y);
        const cos = (dir.x * vers.x + dir.y * vers.y) / (l * (dist || 1));
        pts.push({ f: q.f, dist, cos, proche: window.partProcheDuVoyage(q.x, q.y, v) });
      }
    }
    return pts;
  });
  const n = r.length;
  verifier("des POI se tirent (chance 100 %)", n > 50, String(n));
  verifier("à côté du groupe : entre 6 % et 13 % de la hauteur de la carte de lui (avant : 10 à 20 %)", r.every(x => x.dist >= 0.055 && x.dist <= 0.131),
           JSON.stringify([Math.min(...r.map(x => x.dist)).toFixed(3), Math.max(...r.map(x => x.dist)).toFixed(3)]));
  verifier("sur le côté de la route, pas devant le groupe (angle à la route ≥ 70°)", r.every(x => x.cos <= Math.cos(70 * Math.PI / 180) + 1e-6),
           Math.max(...r.map(x => x.cos)).toFixed(3));
  verifier("jamais après l'arrivée : ni le moment, ni la place (la route la plus proche n'est pas plus loin que le groupe)", r.every(x => x.f < 0.999 && x.proche <= x.f + 0.016),
           JSON.stringify(r.filter(x => x.proche > x.f + 0.016).slice(0, 3)));  // (le pas de mesure de la route : 0,005)
  await p.evaluate(() => { const d = window.__docs["Systeme_Parties/P1"]; delete d.Voyage_Groupe; window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(d))); });
});

// =========================================================================
titre("3. LE CHAT : LA CROIX QUI LE FERME, « PASSER » SON TOUR");
// =========================================================================
await section(async () => {
  await p.evaluate(async () => { await window.fermerCarteRegionale({ sansTransition: true }); });
  await p.waitForTimeout(200);
  const avant = await p.evaluate(() => { const b = document.getElementById("btn-voyage"); return { src: b && b.getAttribute("src"), titre: b && b.title }; });
  await p.evaluate(() => window.ouvrirChatbox());
  await p.waitForTimeout(200);
  const ouvert = await p.evaluate(() => { const b = document.getElementById("btn-voyage"); return { src: b.getAttribute("src"), titre: b.title, vu: getComputedStyle(b).display, croix: b.classList.contains("fermer-chat") }; });
  await p.screenshot({ path: S + "/v287_chat.png" });
  verifier("chat ouvert : à la place du bouton voyage, une croix qui ferme le chat", ouvert.croix && /svg/.test(ouvert.src) && ouvert.src !== avant.src && /Fermer le chat/.test(ouvert.titre) && ouvert.vu !== "none",
           JSON.stringify([ouvert.titre, ouvert.vu, avant.titre]));
  await p.evaluate(() => document.getElementById("btn-voyage").click());
  await p.waitForTimeout(200);
  const ferme = await p.evaluate(() => { const b = document.getElementById("btn-voyage"); return { chat: document.getElementById("fenetre-chatbox").style.display, src: b.getAttribute("src"), mode: typeof window.modeChoixCarte === "function" ? window.modeChoixCarte() : null }; });
  verifier("un clic sur la croix : le chat se ferme, le bouton redevient « Voyager » (sans lancer de voyage)", ferme.chat !== "flex" && ferme.src === avant.src && !ferme.mode, JSON.stringify(ferme));
  // PASSER SON TOUR : seulement à son tour ; rien ne s'écrit dans le chat.
  const r = await p.evaluate(async () => {
    window.PERSOS_PARTIE = window.PERSOS_PARTIE && window.PERSOS_PARTIE.length ? window.PERSOS_PARTIE : window.PERSOS_JOUEURS_PARTIE;
    const d = window.__docs["Systeme_Parties/P1"];
    d.Ordre_Initiative = ["H1", "H2"]; d.Index_Initiative = 1;
    window.PARTIE_DATA = Object.assign(window.PARTIE_DATA || {}, { Ordre_Initiative: ["H1", "H2"], Index_Initiative: 1 });
    localStorage.setItem("ID_JOUEUR_COURANT", "P_01");
    window.__ajouts = [];
    const refus = await window.passerTourChat();
    const apresRefus = window.__docs["Systeme_Parties/P1"].Index_Initiative;
    localStorage.setItem("ID_JOUEUR_COURANT", "P_02");
    const ok = await window.passerTourChat();
    const apres = window.__docs["Systeme_Parties/P1"].Index_Initiative;
    localStorage.setItem("ID_JOUEUR_COURANT", "P_01");
    const btn = document.getElementById("btn-passer-tour");
    return { refus, apresRefus, ok, apres, messages: (window.__ajouts || []).filter(a => a.col === "Messages_Chat").length, bouton: !!btn && btn.closest("#zone-saisie-chat") !== null, texte: btn && btn.textContent };
  });
  verifier("un bouton « Passer » dans la saisie du chat", r.bouton && /Passer/.test(r.texte || ""), r.texte);
  verifier("pas son tour : refusé, rien ne bouge", r.refus === false && r.apresRefus === 1, JSON.stringify([r.refus, r.apresRefus]));
  verifier("son tour : le tour passe au suivant (ici le MJ), sans aucun message", r.ok === true && r.apres === 999 && r.messages === 0, JSON.stringify([r.ok, r.apres, r.messages]));
});

// =========================================================================
titre("4. LES ENNEMIS : LES PEUPLES, LE RÉCIT, L'ANTIQUITÉ ; DES NOMS QUI DISENT QUI ILS SONT");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => {
    const ctx = typeof window.contexteEnnemisIvalis === "function" ? window.contexteEnnemisIvalis(2) : "";
    window.__docs["Systeme_Parties/P1"].Position_Groupe = { Region: 2, x: 0.4, y: 0.5 };
    window.PARTIE_DATA.Position_Groupe = { Region: 2, x: 0.4, y: 0.5 };
    window.PARTIE_DATA.Combat_RP = { Etat: "en_cours", Raison: "Des contrebandiers attaquent la caravane.", Adversaires: "une bande de contrebandiers" };
    const avant = requetes_mia();
    const noms = await window.nommerMonstresIA([{ archetype: "DPS CAC", palier: "Normal" }, { archetype: "TANK CAC", palier: "Normal", leader: true }, { archetype: "DPS DISTANCE", palier: "Petit" }]);
    delete window.PARTIE_DATA.Combat_RP;
    return { ctx, noms, avant };
    function requetes_mia() { return 0; }
  });
  const req = requetes.filter(x => /MIA_BESTIAIRE/.test(x.systeme || "")).pop();
  verifier("le contexte du monde : l'Antiquité, les sept peuples d'Elyria, la région du groupe", /ANTIQUE/.test(r.ctx) && ["Humains", "Ankylars", "Gobs", "Vargens", "Ondaris", "Ophiors", "Éthérés"].every(x => r.ctx.includes(x)) && /Volcanisse|Région :/.test(r.ctx),
           r.ctx.slice(0, 120));
  verifier("MIA_BESTIAIRE (renforts, pièges, arène) : monde antique, peuples, région, et le combat du récit", !!req && /ANTIQUE FANTASTIQUE/.test(req.systeme) && /Ankylars/.test(req.systeme) && /contrebandiers attaquent/.test(req.systeme) && !/médiéval-fantastique sombre/.test(req.systeme),
           req ? req.systeme.slice(0, 160) : "aucune requête");
  verifier("…des noms qui disent qui ils sont (peuple, bande, métier), pas de bestiaire générique", !!req && /LE NOM DIT QUI IL EST|Le nom dit qui il est/.test(req.systeme) && /jamais de nom médiéval/i.test(req.systeme), "");
  verifier("les noms de secours sont de ce monde (plus de gobelin, troll ni arbalétrier)", r.noms.length === 3 && r.noms.every(n => !/gobelin|troll|arbalétrier/i.test(n)), JSON.stringify(r.noms));
  const src = lire('combat_rp.js');
  verifier("MIA_ENNEMIS et l'habillage reçoivent le monde (peuples, région) et ses règles (peuple, Antiquité, noms du récit)",
           (src.match(/--- LE MONDE ---/g) || []).length >= 2 && /contexteEnnemisIvalis/.test(src) && /LE NOM DIT QUI (ILS SONT|IL EST) DANS LE RÉCIT/.test(src) && /jamais médiévales/.test(src), "");
  verifier("le pion d'un ennemi : l'Antiquité dans la commande du dessin", /Greco-Roman antiquity/.test(lire('app.js')), "");
});

// =========================================================================
titre("5. LA PISTE D'INITIATIVE UN PEU PLUS PETITE ; L'AURA DU LEADER RÉDUITE");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const a = window.auraLeader();
    const feu = a.querySelector("#aura-feu"), halo = a.querySelector("#aura-halo-feu");
    const anneau = [...a.querySelectorAll("circle")].filter(c => c.getAttribute("fill") === "none").map(c => Number(c.getAttribute("r")));
    return { echelle: window.ECHELLE_PISTE_INITIATIVE, feu: Number(feu && feu.getAttribute("r")), halo: Number(halo && halo.getAttribute("r")), anneau };
  });
  verifier("la piste d'initiative : ×1,7 (au lieu de ×2)", r.echelle === 1.7, String(r.echelle));
  // Le pion a un rayon de 50 : la fumée allait jusqu'à 96, le halo jusqu'à 80.
  verifier("l'aura du leader : la fumée et le halo vont un peu plus qu'à moitié moins loin du pion", r.feu > 72 && r.feu < 78 && r.halo > 64 && r.halo < 68, JSON.stringify([r.feu, r.halo]));
  verifier("…l'anneau reste collé au bord du médaillon", r.anneau.length >= 3 && r.anneau.every(x => Math.abs(x - 51) < 0.5), JSON.stringify(r.anneau));
});

// =========================================================================
titre("6. LES ZONES DU TERRAIN : DES CADRES, PASSÉS SUR LA GRILLE AVEC DES GARDE-FOUS");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    if (typeof window.zonesDepuisCadres !== "function") return null;
    const cases = window.casesGrilleCombatRP(1536, 1024, 60);
    const centre = (cle) => cases.find(c => c.cle === cle);
    const un = window.zonesDepuisCadres([{ sorte: "mur", box_2d: [100, 100, 200, 200] }], cases, 1536, 1024, 60);
    const dedans = un.murs.every(k => { const c = centre(k); return c.x >= 153.6 - 30 && c.x <= 307.2 + 30 && c.y >= 102.4 - 30 && c.y <= 204.8 + 30; });
    const geant = window.zonesDepuisCadres([{ sorte: "mur", box_2d: [0, 0, 1000, 700] }], cases, 1536, 1024, 60);
    // Trop de murs : les plus grands cadres partent jusqu'à repasser sous 45 %.
    const beaucoup = window.zonesDepuisCadres(Array.from({ length: 12 }, (_, i) => ({ sorte: "mur", box_2d: [0, i * 83, 1000, i * 83 + 80] })), cases, 1536, 1024, 60);
    const priorite = window.zonesDepuisCadres([{ sorte: "difficile", box_2d: [400, 400, 600, 600] }, { sorte: "mur", box_2d: [400, 400, 600, 600] }], cases, 1536, 1024, 60);
    return { n: cases.length, un: un.murs.length, dedans, geant: geant.murs.length, geantRefuse: geant.refuses,
             beaucoup: (beaucoup.murs.length) / cases.length, ecartes: beaucoup.ecartes,
             prio: [priorite.murs.length, priorite.difficiles.length] };
  });
  verifier("un cadre → les cases qu'il couvre (au moins à moitié), et rien autour", !!r && r.un > 0 && r.dedans, JSON.stringify(r && [r.un, r.dedans]));
  verifier("un cadre démesuré (plus du tiers de la carte) est écarté", !!r && r.geant === 0 && r.geantRefuse === 1, JSON.stringify(r && [r.geant, r.geantRefuse]));
  verifier("trop de murs : les plus grands cadres retirés, la carte reste praticable (≤ 45 % bloqué)", !!r && r.beaucoup <= 0.45 && r.ecartes > 0, JSON.stringify(r && [r.beaucoup.toFixed(2), r.ecartes]));
  verifier("un mur l'emporte sur un terrain difficile au même endroit", !!r && r.prio[0] > 0 && r.prio[1] === 0, JSON.stringify(r && r.prio));
  const src = lire('combat_rp.js');
  verifier("une seule IA encadre les zones sur la carte nue (plus de lecture de numéros)", /Tu es MIA_TERRAIN_COMBAT/.test(src) && /box_2d/.test(src) && !/MIA_PEINTURE_MURS/.test(src), "");
});

// =========================================================================
titre("7. LA DÉFAITE : PLUS DE PLANTAGE, PLUS DE RENFORTS, LE VRAI BILAN AU MJ");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => {
    const etatMod = await import("./combat_etat.js");
    let plante = null;
    try { etatMod.appliquerEtape(null, { type: "tour", file: [], phase: "Preparation" }); } catch (e) { plante = e.message; }
    const resultat = etatMod.appliquerEtape(null, { type: "tour", file: [] });
    // Tous les héros à terre : aucun renfort, aucune lecture de la réserve.
    window.PERSOS_PARTIE = [
      { idPersonnage: "H1", idJoueur: "P_01", prenom: "Thorin", camp: "Allié", statut: "Vivant", PV_Actuels: 0, actif: true },
      { idPersonnage: "H2", idJoueur: "P_02", prenom: "Lyra", camp: "Allié", statut: "Vivant", PV_Actuels: 0, actif: true },
      { idPersonnage: "M1", prenom: "Mercenaire de la Cendre", camp: "Ennemi", statut: "Vivant", PV_Actuels: 30, estMonstre: true }];
    window.MONSTRES_PARTIE = [{ idPersonnage: "M1", prenom: "Mercenaire de la Cendre", statut: "Vivant", PV_Actuels: 30 }];
    const vraiPvMax = window.pvMaxCombattant;
    window.pvMaxCombattant = () => 40;
    const vraiHeros = window.estHerosDuButin;
    window.estHerosDuButin = (x) => x && (x.idPersonnage === "H1" || x.idPersonnage === "H2");
    let lectures = 0;
    const vraiLire = window.lireReserveMonstres;
    window.lireReserveMonstres = async () => { lectures++; return [{ nom: "Renfort", entreeManche: 1 }]; };
    const perdu = window.combatPerduOuClos ? window.combatPerduOuClos() : null;
    const renforts = await window.entrerRenfortsPrevus(3, { terrainVide: false });
    const releve = await window.entrerRenfortsDeReleve();
    const bilan = window.bilanDuCombat ? window.bilanDuCombat(window.PERSOS_PARTIE.filter(x => window.estHerosDuButin(x))) : null;
    const resume = window.resumeCombatPourMJ({ Lieu: { Titre: "La route", Interieur: false }, Ennemis: { Tirage: { depart: [{ nom: "Mercenaire de la Cendre" }], renforts: [{ nom: "Archer de la Cendre" }] } } },
      { issue: "defaite", blessures: {}, bilan });
    window.lireReserveMonstres = vraiLire; window.pvMaxCombattant = vraiPvMax; window.estHerosDuButin = vraiHeros;
    return { plante, resultat, perdu, renforts, releve, lectures, bilan, resume };
  });
  verifier("plus de « Cannot set properties of null (setting 'file') » : une étape sur un combat effacé ne fait rien", r.plante === null && r.resultat === null, String(r.plante));
  verifier("tous les héros à terre : le combat est perdu", r.perdu === true, String(r.perdu));
  verifier("…et plus aucun renfort n'entre (ni prévu, ni de relève) — la réserve n'est même pas lue", Array.isArray(r.renforts) && r.renforts.length === 0 && r.releve.length === 0 && r.lectures === 0,
           JSON.stringify([r.renforts, r.releve, r.lectures]));
  verifier("le bilan : chaque ennemi engagé (debout ou tombé, ses PV), chaque héros", !!r.bilan && r.bilan.ennemis.length === 1 && r.bilan.ennemis[0].tombe === false && /30\/40/.test(r.bilan.ennemis[0].pv)
           && r.bilan.heros.length === 2 && r.bilan.heros.every(h => h.tombe), JSON.stringify(r.bilan));
  verifier("le MJ le reçoit : AUCUN ennemi tombé, et la consigne de n'inventer aucun mort", /AUCUN n'est tombé/.test(r.resume) && /Mercenaire de la Cendre : encore debout/.test(r.resume)
           && /n'ont abattu PERSONNE/.test(r.resume) && /Respecte EXACTEMENT ce bilan/.test(r.resume) && !/Archer de la Cendre/.test(r.resume), r.resume.slice(0, 400));
  const src = lire('blessures_ui.js');
  verifier("la fin du combat garde ce bilan (Fin_Combat.bilan)", /bilan: bilanDuCombat\(heros\)/.test(src), "");
  const spec = lire('spectateur_combat.js');
  verifier("le spectateur s'arrête si le combat est effacé pendant une animation", /if \(efface\(\)\) break;/.test(spec), "");
});

// =========================================================================
titre("8. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json') || "{}").version;
  verifier("version 287 ou plus (trace_combat.js, version.json)", vTrace >= 287 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const v = (f) => Number((html.match(new RegExp("[\"/]" + f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  const fichiers = { "style.css": 116, "app.js": 128, "combat.js": 157, "combat_etat.js": 45, "spectateur_combat.js": 9, "monstres.js": 44, "blessures_ui.js": 6, "combat_rp.js": 3, "lore_ivalis.js": 2, "voyage_groupe.js": 8 };
  verifier("les fichiers touchés ont changé de version", Object.entries(fichiers).every(([f, n]) => v(f) >= n), JSON.stringify(Object.keys(fichiers).map(v)));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
