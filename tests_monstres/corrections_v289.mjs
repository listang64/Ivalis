// v289 — LES PAS DU MARAUDEUR ET LA CROIX À LA PLUME.
//
// Nico : « on va changer la croix rouge et le trait pointillé des déplacements.
// Tu vas garder l'animation progressive, et à la place du pointillé, tu vas
// mettre des petits pas qui avancent vers la destination, un peu comme la
// carte du Maraudeur dans Harry Potter. Pour la croix, tu vas la faire plus en
// mode manuscrite, comme si c'était une plume qui dessinait, mais pas trop
// épaisse non plus. Et pour la couleur des pas et de la croix, du marron
// foncé. »
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
// Une proposition de voyage sur la carte 2, du groupe vers (0,75 ; 0,4).
const proposer = async (vers) => {
  await joueur("P_01");
  await p.evaluate(({ vers }) => {
    const d = window.__docs["Systeme_Parties/P1"]; d.Position_Groupe = { Region: 2, x: 0.3, y: 0.5 }; delete d.Voyage_Groupe;
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(d)));
    if (window.choixVoyageGroupe()) window.basculerModeVoyage(false);
    window.basculerModeVoyage(true);
    const c = window.cadrageCarteRegion(), e = document.getElementById("ecran-jeu").getBoundingClientRect();
    window.surChoixPointRegion(e.left + c.panX + vers.x * c.largeur * c.zoom, e.top + c.panY + vers.y * c.hauteur * c.zoom);
  }, { vers });
};
const etatDuTrace = () => p.evaluate(() => {
  const svg = document.getElementById("carte-region-voyage");
  const pas = [...svg.querySelectorAll(".pas-voyage")];
  const vus = pas.filter(g => Number(getComputedStyle(g.querySelector(".pas-voyage-dessin")).opacity) > 0.5).length;
  const masques = [...svg.querySelectorAll(".croix-plume-masque")].map(m => parseFloat(getComputedStyle(m).strokeDashoffset));
  return { n: pas.length, vus, masques };
});

// =========================================================================
titre("1. DES PAS QUI AVANCENT VERS LA DESTINATION, UN À UN");
// =========================================================================
await section(async () => {
  await proposer({ x: 0.75, y: 0.4 });
  await p.waitForTimeout(800);          // un peu moins de la moitié du dessin (1,8 s)
  const milieu = await etatDuTrace();
  await p.waitForTimeout(2300);
  const fin = await etatDuTrace();
  verifier("des pas à la place du pointillé (plus de tirets ni de trait rouge)", fin.n > 8 && await p.evaluate(() => !document.querySelector("#carte-region-voyage [stroke-dasharray]")), String(fin.n));
  verifier("animation progressive : à mi-chemin, une partie des pas seulement ; tous à la fin", milieu.vus > 0 && milieu.vus < milieu.n * 0.8 && fin.vus === fin.n, JSON.stringify([milieu.vus, milieu.n, fin.vus]));
  verifier("la croix se trace APRÈS les pas : rien à mi-chemin, ses deux traits tracés à la fin", milieu.masques.length === 2 && milieu.masques.every(x => x > 1) && fin.masques.every(x => Math.abs(x) < 0.5),
           JSON.stringify([milieu.masques.map(Math.round), fin.masques.map(Math.round)]));
  await p.screenshot({ path: S + "/v289_pas.png" });
  const g = await p.evaluate(() => {
    const svg = document.getElementById("carte-region-voyage"), c = window.cadrageCarteRegion(), e = Math.max(2, c.hauteur * 0.0065);
    const pts = svg.querySelector(".trace-voyage").getAttribute("d").replace(/[ML]/g, " ").trim().split(/\s+/).map(Number);
    const P = []; for (let i = 0; i < pts.length; i += 2) P.push({ x: pts[i], y: pts[i + 1] });
    // Le point de la route le plus proche, et sa direction.
    const proche = (x, y) => { let m = null; for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)), qx = a.x + dx * t, qy = a.y + dy * t, d = Math.hypot(x - qx, y - qy);
      if (!m || d < m.d) m = { d, cote: Math.sign(dx * (y - a.y) - dy * (x - a.x)), angle: Math.atan2(dy, dx) * 180 / Math.PI }; } return m; };
    const pas = [...svg.querySelectorAll(".pas-voyage")].map(el => { const n = el.getAttribute("transform").match(/-?[\d.]+/g).map(Number); return { x: n[0], y: n[1], a: n[2] }; });
    const infos = pas.map(q => ({ ...proche(q.x, q.y), a: q.a }));
    const fin = P[P.length - 1], dernier = pas[pas.length - 1];
    const couleur = getComputedStyle(svg.querySelector(".pas-voyage")).fill;
    const ecarts = pas.slice(1).map((q, i) => Math.hypot(q.x - pas[i].x, q.y - pas[i].y));
    const ell = svg.querySelectorAll(".pas-voyage ellipse").length;
    return { e, alterne: infos.every((x, i) => i === 0 || x.cote === -infos[i - 1].cote), pres: infos.every(x => x.d < e * 1.6),
             oriente: infos.every(x => { let d = Math.abs(((x.a - x.angle) % 360 + 540) % 360 - 180); return d < 20; }),
             avantCroix: Math.hypot(dernier.x - fin.x, dernier.y - fin.y) > e * 2, couleur, regulier: Math.max(...ecarts) / Math.min(...ecarts), pieds: ell / pas.length };
  });
  verifier("pied gauche, pied droit : de part et d'autre de la route, tout près d'elle", g.alterne && g.pres, JSON.stringify([g.alterne, g.pres]));
  verifier("tournés dans le sens de la marche, d'un pas régulier, jusqu'à la croix", g.oriente && g.regulier < 1.5 && g.avantCroix, JSON.stringify([g.oriente, g.regulier.toFixed(2), g.avantCroix]));
  verifier("chaque pas : une semelle et un talon, en marron foncé", g.pieds === 2 && /rgb\(58, 34, 15\)/.test(g.couleur), JSON.stringify([g.pieds, g.couleur]));
});

// =========================================================================
titre("2. LA CROIX À LA PLUME : MANUSCRITE, PAS TROP ÉPAISSE, MARRON FONCÉ");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const svg = document.getElementById("carte-region-voyage"), c = window.cadrageCarteRegion(), e = Math.max(2, c.hauteur * 0.0065);
    const traits = [...svg.querySelectorAll(".croix-voyage-trait")];
    const etude = traits.map(t => {
      const n = t.getAttribute("d").replace(/[MLZ]/g, " ").trim().split(/\s+/).map(Number);
      const pts = []; for (let i = 0; i < n.length; i += 2) pts.push([n[i], n[i + 1]]);
      const N = pts.length / 2 - 1, g = pts.slice(0, N + 1), d = pts.slice(N + 1).reverse();
      const largeurs = g.map((a, i) => Math.hypot(a[0] - d[i][0], a[1] - d[i][1]));
      const milieux = g.map((a, i) => [(a[0] + d[i][0]) / 2, (a[1] + d[i][1]) / 2]);
      const A = milieux[0], B = milieux[N], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const ecart = Math.max(...milieux.map(m => Math.abs((B[0] - A[0]) * (A[1] - m[1]) - (A[0] - m[0]) * (B[1] - A[1])) / (L || 1)));
      return { max: Math.max(...largeurs), bouts: Math.max(largeurs[0], largeurs[N]), courbe: ecart / L, L };
    });
    const st = traits[0] && getComputedStyle(traits[0]);
    return { e, n: traits.length, etude, couleur: st && st.fill, avant: svg.querySelector(".croix-voyage").getAttribute("transform"), html: svg.querySelector(".croix-voyage").innerHTML };
  });
  verifier("deux traits de plume (des formes pleines, plus des lignes droites)", r.n === 2 && r.etude.every(t => t.L > r.e * 3), JSON.stringify(r.etude.map(t => t.L.toFixed(1))));
  verifier("effilés : fins aux bouts, pleins au milieu", r.etude.every(t => t.bouts < t.max * 0.35), JSON.stringify(r.etude.map(t => [t.bouts.toFixed(2), t.max.toFixed(2)])));
  verifier("pas trop épais (au plus 0,45 épaisseur de trait, soit bien moins que l'ancienne croix)", r.etude.every(t => t.max <= r.e * 0.45 && t.max > r.e * 0.2), JSON.stringify([r.e.toFixed(2), ...r.etude.map(t => t.max.toFixed(2))]));
  verifier("manuscrits : un peu courbes, la croix un peu penchée", r.etude.some(t => t.courbe > 0.005) && /rotate\(/.test(r.avant), JSON.stringify([r.etude.map(t => t.courbe.toFixed(3)), r.avant]));
  verifier("en marron foncé", /rgb\(58, 34, 15\)/.test(r.couleur || ""), r.couleur);
  // Redessinée (la même proposition) : la même main, pas un nouveau geste.
  const encore = await p.evaluate(() => { const svg = document.getElementById("carte-region-voyage"); delete svg.dataset.cle; window.dessinerVoyageGroupe(); return svg.querySelector(".croix-voyage").innerHTML; });
  verifier("redessinée, la croix garde le même geste", encore.replace(/animation-delay:\d+ms/g, "") === r.html.replace(/animation-delay:\d+ms/g, ""), "");
  const c = await p.evaluate(() => { const r = document.querySelector("#carte-region-voyage .croix-voyage").getBoundingClientRect(); return { x: r.left, y: r.top }; });
  await p.waitForTimeout(2800);          // redessinée, la proposition rejoue ses pas et sa croix
  await p.screenshot({ path: S + "/v289_croix.png", clip: { x: Math.max(0, Math.round(c.x) - 160), y: Math.max(0, Math.round(c.y) - 110), width: 340, height: 230 } });
});

// =========================================================================
titre("3. LA CARTE DU MONDE AUSSI ; MOUVEMENT RÉDUIT : TOUT EST LÀ D'UN COUP");
// =========================================================================
await section(async () => {
  await p.evaluate(async () => { window.basculerModeVoyage(false); await window.fermerCarteRegionale({ sansTransition: true }); });
  await p.waitForTimeout(300);
  await p.evaluate(() => { window.basculerModeVoyage(true); const r = window.REGIONS_CARTE[4]; const c = window.centreRegion(r.points);
    const carte = document.getElementById("carte-fond-jeu").getBoundingClientRect();
    window.surChoixPointMonde ? window.surChoixPointMonde(carte.left + c.x / 3840 * carte.width, carte.top + c.y / 2160 * carte.height)
      : document.elementFromPoint(carte.left + c.x / 3840 * carte.width, carte.top + c.y / 2160 * carte.height).dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: carte.left + c.x / 3840 * carte.width, clientY: carte.top + c.y / 2160 * carte.height })); });
  await p.waitForTimeout(2200);
  const monde = await p.evaluate(() => { const svg = document.getElementById("calque-voyage-monde"); return { pas: svg.querySelectorAll(".pas-voyage").length, croix: svg.querySelectorAll(".croix-voyage-trait").length }; });
  verifier("sur la carte du monde : des pas et la croix à la plume", monde.pas > 3 && monde.croix === 2, JSON.stringify(monde));
  await p.evaluate(() => window.basculerModeVoyage(false));
  await p.emulateMedia({ reducedMotion: "reduce" });
  await p.evaluate(async () => { await window.ouvrirCarteRegionale(2, { sansTransition: true }); });
  await p.waitForTimeout(300);
  await proposer({ x: 0.7, y: 0.6 });
  await p.waitForTimeout(150);
  const r = await etatDuTrace();
  verifier("« réduire les animations » : tous les pas et la croix aussitôt, sans animation", r.n > 5 && r.vus === r.n && r.masques.every(x => Math.abs(x) < 0.5)
           && await p.evaluate(() => !document.querySelector("#carte-region-voyage .a-venir")), JSON.stringify(r));
  await p.emulateMedia({ reducedMotion: "no-preference" });
});

// =========================================================================
titre("4. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json') || "{}").version;
  verifier("version 289 ou plus (trace_combat.js, version.json)", vTrace >= 289 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const v = (f) => Number((html.match(new RegExp("[\"/]" + f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  const fichiers = { "style.css": 118, "voyage_groupe.js": 9 };
  verifier("les fichiers touchés ont changé de version", Object.entries(fichiers).every(([f, n]) => v(f) >= n), JSON.stringify(Object.keys(fichiers).map(v)));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
