// v286 — LES LIEUX ENTOURÉS À LA PLUME ; LE VENT DES NUAGES ; LA TABLE LIÉE À
// LA CARTE ; PLUS DE NUAGES SUR LES CARTES RÉGIONALES.
//
// Nico :
//   · « sur les maps rapprochées, le nom des lieux plus vers le haut, afin
//     qu'il soit dans la partie basse du carré de découpe de l'image générée » ;
//   · « le carré de sélection d'un lieu : un rond / ovale imparfait rouge,
//     comme si on avait entouré à la main sur la carte ; quand on sélectionne
//     un lieu, le bruit d'une plume qui entoure quelque chose sur un
//     parchemin ; quand on clique ailleurs, la sélection disparaît en fondu » ;
//   · « pour les transitions entre map globale et régionale, un bruit de vent,
//     comme si on traversait des nuages » ;
//   · « la table en bois : les rainures entre les planches sont trop droites,
//     trop parfaites et trop noires » ;
//   · « la table doit être liée à l'image : si on déplace l'image, la table
//     doit bouger avec, et pareil pour le zoom » ;
//   · « enlève le bouton pour faire les nuages dans les maps régionales, et
//     tous les nuages des maps régionales ; on garde juste les nuages des
//     transitions ».
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

// Des nuages peints AVANT v286 sur toute la carte 2 : ils doivent être ignorés.
await p.evaluate(() => {
  const C = 240, L = 150, tout = new Uint8Array(C * L).fill(1);
  const d = Object.assign({}, window.__docs["Cartes_Regionales/2"], { Nuages: { colonnes: C, lignes: L, cases: window.encoderGrilleNuages(tout) } });
  window.__docs["Cartes_Regionales/2"] = d;
  window.appliquerCartesRegionalesDeLaBase([{ id: "2", data: d }]);
  // Les sons joués : relevés.
  window.__sons = [];
  const vrai = window.jouerSonEvenement;
  window.jouerSonEvenement = (id, f) => { window.__sons.push(id); return vrai ? vrai(id, f) : false; };
});
await p.evaluate(async () => { await window.ouvrirCarteRegionale(2, { sansTransition: true }); });
await p.waitForTimeout(400);
const S = '/tmp/claude-0/-home-user-Ivalis/3718c626-55b5-577c-9b4f-a49012fd3784/scratchpad';
const VILLAGE_ID = VILLAGE;

// =========================================================================
titre("1. PLUS DE NUAGES SUR LES CARTES RÉGIONALES (ceux de la traversée restent)");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const v = document.querySelector('.village-region[data-id="L_00042_Brumefosse"]');
    return { toile: !!document.getElementById("carte-region-nuages"), bouton: !!document.getElementById("btn-region-calque-nuages"),
             calque: window.choisirCalqueRegion ? window.choisirCalqueRegion("nuages") : null, grille: window.grilleNuagesRegion ? window.grilleNuagesRegion() : "absente",
             village: !!v, cache: !!(v && v.classList.contains("cache")), nappe: !!(window.NuagesRealistes && window.NuagesRealistes.creerNappe),
             traversee: !!(window.NuagesRealistes && window.NuagesRealistes.creerTraversee), valider: (document.getElementById("btn-region-valider-nuages") || {}).textContent,
             poi: typeof window.placePoiValable === "function" ? window.placePoiValable(2, 0.4, 0.4) : null };
  });
  verifier("plus de toile de nuages sur la carte régionale, ni de bouton « Nuages »", !r.toile && !r.bouton, JSON.stringify([r.toile, r.bouton]));
  verifier("le pinceau ne peint plus que l'usure (« Valider l'usure »)", r.calque === "usure" && /usure/i.test(r.valider || ""), JSON.stringify([r.calque, r.valider]));
  verifier("des nuages peints avant, en base, sont ignorés : rien n'est caché", r.grille === null && r.village && !r.cache && r.poi === true, JSON.stringify([r.grille === null, r.village, r.cache, r.poi]));
  verifier("le moteur des nuages ne garde que la traversée", !r.nappe && r.traversee, JSON.stringify([r.nappe, r.traversee]));
  // Peindre et valider : n'écrit que l'usure.
  const ecrits = await p.evaluate(async () => {
    window.choisirOutilRegion("pinceau");
    const c = window.cadrageCarteRegion(), e = document.getElementById("ecran-jeu").getBoundingClientRect();
    window.peindreCarteRegion(e.left + c.panX + 0.05 * c.largeur * c.zoom, e.top + c.panY + 0.05 * c.hauteur * c.zoom);
    window.__ecrits = []; await window.validerNuagesRegion();
    const x = window.__ecrits.find(e => e.chemin === "Cartes_Regionales/2");
    return x ? Object.keys(x.data).filter(k => k !== "Numero" && k !== "Nom") : [];
  });
  verifier("…et « Valider » n'écrit que l'usure du parchemin", ecrits.length === 1 && ecrits[0] === "Usure", JSON.stringify(ecrits));
});

// =========================================================================
titre("2. LE NOM DU LIEU, DANS LE BAS DU CARRÉ DE L'IMAGE");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const el = document.querySelector('.village-region[data-id="L_00042_Brumefosse"]'), b = el.getBoundingClientRect();
    const t = el.querySelector(".village-nom-texte").getBoundingClientRect();
    return { haut: (t.top - b.top) / b.height, bas: (t.bottom - b.top) / b.height, milieu: (t.top + t.bottom) / 2 - b.top };
  });
  verifier("le nom est dans la partie basse du carré (entre 60 % et 100 % de sa hauteur)", r.haut > 0.6 && r.bas <= 1.04, JSON.stringify([r.haut.toFixed(2), r.bas.toFixed(2)]));
  // Toutes les courbures : l'arc reste dans le bas du carré.
  const toutes = await p.evaluate(() => {
    const ids = ["a", "Brumefosse", "Kalymnos", "L_1", "L_2", "L_3", "L_77", "Port-Sel", "Hautegarde", "x9"];
    return ids.map(id => {
      window.appliquerLieuLocal("T_" + id, { Nom_Du_Lieu: "Les Hauts-de-" + id, Carte_Regionale: 2, Position_Region: { x: 0.3, y: 0.3, taille: 0.1 }, Calque_Plein: true });
      const el = document.querySelector(`.village-region[data-id="T_${id}"]`), b = el.getBoundingClientRect(), t = el.querySelector(".village-nom-texte").getBoundingClientRect();
      return [(t.top - b.top) / b.height, (t.bottom - b.top) / b.height];
    });
  });
  verifier("…quelle que soit la courbure de l'arc (10 noms)", toutes.every(([h, b]) => h > 0.55 && b <= 1.05), JSON.stringify(toutes.map(([h, b]) => [h.toFixed(2), b.toFixed(2)])));
  await p.evaluate(() => window.appliquerVillagesDeLaBase([{ id: "L_00042_Brumefosse", data: { Nom_Du_Lieu: "Brumefosse", Carte_Regionale: 2, Position_Region: { x: 0.7, y: 0.66, taille: 0.08 }, URL_Calque_Region: "" } }]));
});

// =========================================================================
titre("3. LA SÉLECTION D'UN LIEU : ENTOURÉ À LA MAIN, À LA PLUME ; UN CLIC AILLEURS L'EFFACE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.choisirOutilRegion && window.outilCarteRegion() && window.choisirOutilRegion(window.outilCarteRegion()); window.__sons = [];
    // Zoomé sur le lieu, pour bien le voir.
    const b = document.querySelector('.village-region[data-id="L_00042_Brumefosse"]').getBoundingClientRect();
    window.zoomerCarteRegion(3.5, b.left + b.width / 2, b.top + b.height / 2); });
  const centre = await p.evaluate(() => { const b = document.querySelector('.village-region[data-id="L_00042_Brumefosse"]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height * 0.4 }; });
  await p.mouse.click(centre.x, centre.y);
  await p.waitForTimeout(120);
  await p.screenshot({ path: S + "/v286_cercle_trace.png" });
  const r = await p.evaluate(() => {
    const el = document.querySelector('.village-region[data-id="L_00042_Brumefosse"]'), b = el.getBoundingClientRect();
    const svg = el.querySelector(".village-cercle"), chemin = svg && svg.querySelector("path");
    const st = chemin && getComputedStyle(chemin);
    const d = chemin ? chemin.getAttribute("d").replace(/[ML]/g, " ").trim().split(/\s+/).map(Number) : [];
    const c = chemin ? chemin.getBoundingClientRect() : null;
    return { selection: el.classList.contains("selectionne"), cercle: !!svg, trace: !!(svg && svg.classList.contains("trace")),
             couleur: st && st.stroke, rempli: st && st.fill, contour: getComputedStyle(el).outlineStyle,
             debutFin: d.length > 4 ? Math.hypot(d[0] - d[d.length - 2], d[1] - d[d.length - 1]) / b.width : 0,
             entoure: c ? [c.left < b.left + b.width * 0.05, c.right > b.right - b.width * 0.05, c.top < b.top + b.height * 0.1, c.bottom > b.bottom - b.height * 0.1] : [],
             largeur: c ? c.width / b.width : 0, hauteur: c ? c.height / b.height : 0, sons: window.__sons.slice() };
  });
  verifier("un clic sur le lieu (DEV) : il est choisi, entouré d'un trait rouge, sans le carré jaune", r.selection && r.cercle && /rgb\(165, 20, 28\)/.test(r.couleur || "") && r.rempli === "none" && r.contour === "none", JSON.stringify([r.selection, r.couleur, r.rempli, r.contour]));
  verifier("…un ovale imparfait autour du lieu, qui ne se referme pas tout à fait", r.entoure.every(x => x) && r.debutFin > 0.02 && r.largeur > 1.1 && r.largeur < 1.8 && r.hauteur > 1.0 && r.hauteur < 1.7, JSON.stringify([r.entoure, r.debutFin.toFixed(3), r.largeur.toFixed(2), r.hauteur.toFixed(2)]));
  verifier("…qui se trace à l'écran, au bruit d'une plume", r.trace && r.sons.includes("plume-entoure"), JSON.stringify(r.sons));
  await p.waitForTimeout(700);
  // Un nouveau dessin de la carte ne retrace pas le cercle.
  const fixe = await p.evaluate(() => { window.dessinerVillagesRegion(); const ch = document.querySelector(".village-cercle path");
    return { off: parseFloat(getComputedStyle(ch).strokeDashoffset), sons: window.__sons.length }; });
  verifier("une fois tracé, il reste (un nouveau dessin de la carte ne le retrace pas)", Math.abs(fixe.off) < 0.5 && fixe.sons === 1, JSON.stringify(fixe));
  await p.screenshot({ path: S + "/v286_cercle.png" });
  // Un clic ailleurs sur la carte : il s'efface en fondu.
  const ailleurs = await p.evaluate(() => { const r = document.getElementById("vue-carte-region").getBoundingClientRect(); return { x: r.left + r.width * 0.2, y: r.top + r.height * 0.75 }; });
  await p.mouse.click(ailleurs.x, ailleurs.y);
  await p.waitForTimeout(150);
  const fondu = await p.evaluate(() => { const svg = document.querySelector(".village-cercle"); return { selection: !!document.querySelector(".village-region.selectionne"), efface: !!(svg && svg.classList.contains("efface")), opacite: svg ? Number(getComputedStyle(svg).opacity) : -1 }; });
  verifier("un clic ailleurs : la sélection part, le cercle s'efface en fondu", !fondu.selection && fondu.efface && fondu.opacite > 0.05 && fondu.opacite < 0.95, JSON.stringify(fondu));
  await p.waitForTimeout(600);
  const parti = await p.evaluate(() => !!document.querySelector(".village-cercle"));
  verifier("…puis il n'est plus là", !parti);
  // Glisser la carte ne désélectionne pas.
  await p.mouse.click(centre.x, centre.y);
  await p.waitForTimeout(100);
  await p.mouse.move(ailleurs.x, ailleurs.y); await p.mouse.down(); await p.mouse.move(ailleurs.x + 40, ailleurs.y - 30, { steps: 4 }); await p.mouse.up();
  const garde = await p.evaluate(() => !!document.querySelector(".village-region.selectionne"));
  verifier("faire glisser la carte ne défait pas la sélection", garde);
  await p.evaluate(() => { window.selectionnerVillageRegion(null); window.zoomerCarteRegion(1 / 3.5); });
});

// =========================================================================
titre("4. LES SONS : LA PLUME, LE VENT DES NUAGES");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => {
    const mesure = async (id, duree) => {
      const f = (window.SONS_EVENEMENTS || {})[id];
      if (!f) return null;
      const ctx = new OfflineAudioContext(1, Math.round(44100 * duree), 44100);
      f(ctx, ctx.destination);
      const buf = await ctx.startRendering(), d = buf.getChannelData(0);
      const rms = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, b - a)); };
      const n = d.length, q = (k) => rms(Math.floor(n * k / 10), Math.floor(n * (k + 1) / 10));
      let crete = 0; for (let i = 0; i < n; i++) crete = Math.max(crete, Math.abs(d[i]));
      return { tout: rms(0, n), tranches: Array.from({ length: 10 }, (_, k) => q(k)), crete };
    };
    return { plume: await mesure("plume-entoure", 0.9), vent: await mesure("vent-nuages", 3.8) };
  });
  verifier("la plume : un grattement bref (moins d'une seconde), audible, sans saturer", !!r.plume && r.plume.tout > 0.01 && r.plume.crete < 1 && r.plume.tranches[9] < r.plume.tranches[2] * 0.2,
           JSON.stringify(r.plume && [r.plume.tout.toFixed(3), r.plume.crete.toFixed(2)]));
  verifier("le vent : il enfle, tient, retombe (environ trois secondes et demie)", !!r.vent && r.vent.tout > 0.01 && r.vent.crete < 1 && r.vent.tranches[4] > r.vent.tranches[0] * 1.5 && r.vent.tranches[4] > r.vent.tranches[9] * 1.5,
           JSON.stringify(r.vent && r.vent.tranches.map(x => x.toFixed(3))));
  // Une vraie traversée (fermer puis rouvrir la carte) : le vent souffle.
  await p.evaluate(() => { window.__sons = []; });
  await p.evaluate(() => window.fermerCarteRegionale());
  await p.waitForTimeout(300);
  await p.evaluate(() => window.ouvrirCarteRegionale(2));
  const sons = await p.evaluate(() => window.__sons.slice());
  verifier("la traversée des nuages (retour au monde, puis vers la région) : le vent souffle à chaque fois", sons.filter(s => s === "vent-nuages").length === 2, JSON.stringify(sons));
});

// =========================================================================
titre("5. LA TABLE EN BOIS SUIT LA CARTE (GLISSER, ZOOMER, PLONGER)");
// =========================================================================
await section(async () => {
  // L'image : un carreau qui se raccorde (droite ↔ gauche, bas ↔ haut), aux joints irréguliers et pas noirs.
  const img = await p.evaluate(() => new Promise(ok => { const i = new Image(); i.onload = () => {
    const c = document.createElement("canvas"); c.width = i.naturalWidth; c.height = i.naturalHeight; const x = c.getContext("2d"); x.drawImage(i, 0, 0);
    const W = c.width, H = c.height, d = x.getImageData(0, 0, W, H).data, L = (px, py) => { const k = (py * W + px) * 4; return 0.3 * d[k] + 0.59 * d[k + 1] + 0.11 * d[k + 2]; };
    // Le bord du carreau comparé aux frontières de blocs JPEG (8 px) à l'intérieur
    // de l'image : un raccord parfait n'y fait pas plus d'écart qu'elles.
    let bordX = 0, voisinX = 0, bordY = 0, voisinY = 0;
    const blocsX = [640, 1280, 1920].filter(k => k < W), blocsY = [400, 800, 1200].filter(k => k < H);
    for (let y = 0; y < H; y += 2) { bordX += Math.abs(L(W - 1, y) - L(0, y)); blocsX.forEach(k => { voisinX += Math.abs(L(k - 1, y) - L(k, y)) / blocsX.length; }); }
    for (let x2 = 0; x2 < W; x2 += 2) { bordY += Math.abs(L(x2, H - 1) - L(x2, 0)); blocsY.forEach(k => { voisinY += Math.abs(L(x2, k - 1) - L(x2, k)) / blocsY.length; }); }
    // Les rangées : une rainure droite et noire ferait une rangée moyenne très sombre.
    const rangees = []; for (let y = 0; y < H; y++) { let s = 0; for (let x2 = 0; x2 < W; x2 += 4) s += L(x2, y); rangees.push(s / (W / 4)); }
    const triees = rangees.slice().sort((a, b) => a - b), mediane = triees[H >> 1];
    let noirs = 0; for (let k = 0; k < W * H * 4; k += 16) if (0.3 * d[k] + 0.59 * d[k + 1] + 0.11 * d[k + 2] < 8) noirs++;
    ok({ W, H, raccordX: bordX / voisinX, raccordY: bordY / voisinY, rangeeMin: triees[0] / mediane, noirs: noirs / (W * H / 4) }); };
    i.onerror = () => ok(null); i.src = "images/sable.jpg?v=" + Date.now(); }));
  // (v288 : le bois a laissé place au sable — ses joints avec lui ; le sol se raccorde toujours.)
  verifier("le carreau du sol se raccorde sans couture (droite ↔ gauche, bas ↔ haut)", !!img && img.raccordX < 1.35 && img.raccordY < 1.35, JSON.stringify(img && [img.raccordX.toFixed(2), img.raccordY.toFixed(2)]));
  verifier("…sans rangée sombre d'un bout à l'autre, sans noir", !!img && img.rangeeMin > 0.62 && img.noirs < 0.0005, JSON.stringify(img && [img.rangeeMin.toFixed(2), img.noirs.toFixed(5)]));
  // Carte régionale : la table est un calque jumeau, mêmes transform, taille.
  await attendreQue(async () => await p.evaluate(() => window.carteRegionaleOuverte() === 2 && !window.TRAVERSEE_EN_COURS), 8000);
  await p.waitForTimeout(600);
  const jumeaux = () => p.evaluate(() => { const a = document.getElementById("carte-region"), t = document.getElementById("carte-region-table");
    return t ? { egal: a.style.transform === t.style.transform && a.style.width === t.style.width && a.style.height === t.style.height, transform: t.style.transform,
                 fond: getComputedStyle(t, "::before").backgroundImage, avant: !!(t.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) } : null; });
  const j0 = await jumeaux();
  verifier("carte régionale : la table est un calque sous la carte, au même cadrage", !!j0 && j0.egal && j0.avant && /sable\.jpg/.test(j0.fond), JSON.stringify(j0));
  // Le bois, avant et après un glissé de la carte (la carte et son titre
  // masqués le temps de la mesure, pour voir la table dessous) : il a suivi.
  await p.evaluate(() => { window.zoomerCarteRegion(1.5); ["carte-region", "carte-region-dessus"].forEach(id => document.getElementById(id).style.visibility = "hidden"); });
  await p.waitForTimeout(200);
  const cad0 = await p.evaluate(() => window.cadrageCarteRegion());
  const zone = { x: 500, y: 330 };
  const pixels = async (x, y) => {
    const png = await p.screenshot({ clip: { x, y, width: 100, height: 100 } });
    return p.evaluate(async (b64) => { const i = new Image(); i.src = "data:image/png;base64," + b64; await i.decode(); const c = document.createElement("canvas"); c.width = 100; c.height = 100; const x = c.getContext("2d"); x.drawImage(i, 0, 0); return Array.from(x.getImageData(0, 0, 100, 100).data); }, png.toString("base64"));
  };
  const ecart = (a, b) => { let s = 0, n = 0; for (let k = 0; k < a.length; k += 4) { s += Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]); n += 2; } return s / n; };
  const avant = await pixels(zone.x, zone.y);
  await p.evaluate(() => window.glisserCarteRegion(-60, 0));
  await p.waitForTimeout(150);
  const cad1 = await p.evaluate(() => window.cadrageCarteRegion());
  const dx = Math.round(cad1.panX - cad0.panX), dy = Math.round(cad1.panY - cad0.panY);
  const suivi = await pixels(zone.x + dx, zone.y + dy), immobile = await pixels(zone.x, zone.y);
  const eSuivi = ecart(avant, suivi), eImmobile = ecart(avant, immobile);
  await p.evaluate(() => ["carte-region", "carte-region-dessus"].forEach(id => document.getElementById(id).style.visibility = ""));
  verifier("on fait glisser la carte : le bois glisse avec elle (même motif, décalé d'autant)", Math.abs(dx) > 20 && eSuivi < 4 && eImmobile > eSuivi * 2.5, JSON.stringify({ dx, dy, eSuivi: eSuivi.toFixed(2), eImmobile: eImmobile.toFixed(2) }));
  await p.evaluate(() => window.zoomerCarteRegion(2));
  const j1 = await jumeaux();
  verifier("on zoome : la table zoome avec la carte", !!j1 && j1.egal && j1.transform !== j0.transform, JSON.stringify(j1 && j1.transform));
  await p.screenshot({ path: S + "/v286_region_table.png" });
  // Carte du monde : même chose, et pendant la plongée vers la région.
  await p.evaluate(() => window.fermerCarteRegionale({ sansTransition: true }));
  await p.waitForTimeout(200);
  const monde = await p.evaluate(() => { const a = document.getElementById("carte-fond-jeu"), t = document.getElementById("table-monde");
    return t ? { egal: getComputedStyle(a).transform === getComputedStyle(t).transform, fond: getComputedStyle(t, "::before").backgroundImage } : null; });
  verifier("carte du monde : la table suit la carte", !!monde && monde.egal && /sable\.jpg/.test(monde.fond), JSON.stringify(monde));
  await p.evaluate(() => { window.__plongee = window.ouvrirCarteRegionale(2); });
  await p.waitForTimeout(400);
  const plonge = await p.evaluate(() => { const a = getComputedStyle(document.getElementById("carte-fond-jeu")).transform, t = getComputedStyle(document.getElementById("table-monde")).transform; return { a, t }; });
  verifier("…et pendant la plongée vers la région, la table plonge avec la carte", plonge.a === plonge.t && plonge.a !== "none", JSON.stringify(plonge));
  await p.evaluate(() => window.__plongee);
  await attendreQue(async () => await p.evaluate(() => !window.TRAVERSEE_EN_COURS), 8000);
  await p.waitForTimeout(500);
  const apres = await p.evaluate(() => getComputedStyle(document.getElementById("carte-fond-jeu")).transform === getComputedStyle(document.getElementById("table-monde")).transform);
  verifier("…et après (la plongée défaite, le monde et sa table ensemble)", apres);
  await p.evaluate(() => window.fermerCarteRegionale({ sansTransition: true }));
  await p.setViewportSize({ width: 1700, height: 700 });
  await p.evaluate(() => { window.dispatchEvent(new Event("resize")); window.recadrerCarte && window.recadrerCarte(); });
  await p.waitForTimeout(400);
  await p.screenshot({ path: S + "/v286_monde_table.png" });
  await p.setViewportSize({ width: 1194, height: 834 });
});

// =========================================================================
titre("6. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json') || "{}").version;
  verifier("version 286 ou plus (trace_combat.js, version.json)", vTrace >= 286 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const v = (f) => Number((html.match(new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  const fichiers = { "style.css": 115, "app.js": 127, "nuages_realistes.js": 3, "cartes_regionales.js": 10, "villages_regionaux.js": 7, "voyage_groupe.js": 7, "fabrique_sons.js": 17 };
  verifier("les fichiers touchés ont changé de version", Object.entries(fichiers).every(([f, n]) => v(f) >= n), JSON.stringify(Object.keys(fichiers).map(v)));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
