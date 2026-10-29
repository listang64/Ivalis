// v278 — LES COMBATS BRANCHÉS SUR LE RÉCIT.
//
// Nico : le bouton de combat ouvre deux encarts (« Combat en cours » de CETTE
// partie, « Arène de combat ») ; après la réponse du MJ, MIA_COMBAT juge s'il y
// a agression ; à la fin du parchemin, un bouton COMBATTRE (rouge, gouttes de
// sang) ; dans le chat, « Combat en cours » tant que le combat dure. L'IA
// prépare la rencontre : le lieu du combat (15 derniers messages, le lieu),
// la carte (le style « Style map crea » des paramètres + cette description),
// les ennemis (l'apparition 1 à 4 d'après le récit, les renforts imaginés,
// les pions — un PNJ nommé depuis son avatar), la boîte de la grille (mode
// DEV, priorité à Nico et Ben), la grille numérotée et les trois MIA de
// peinture, MIA_SPAWN (6 derniers messages) ; puis le combat, et le retour au
// récit : le MJ apprend l'issue, les blessures, le lieu saccagé. Une seconde
// clé Gemini pour les IA du combat (champ, fichier JSON).
//
// Sur la VRAIE page, Firestore en mémoire (transactions), Gemini, OpenAI et
// Cloudinary simulés. Se charge sur l'ancien code (IVALIS_RACINE) : il y
// échoue, sans planter.
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
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
// Firestore en mémoire : chaque écriture change window.__docs ; une écriture
// de la partie revient au jeu comme l'écoute la lui donnerait (__surPartie).
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
    (window.__journal = window.__journal || []).push({ chemin, mode, t: Date.now(), data: JSON.parse(JSON.stringify(data, (k, v) => v && v.__supprimer ? "<supprimé>" : v)) });
    if (chemin === "Systeme_Parties/P1" && typeof window.__surPartie === "function") {
      const copie = cloner(d[chemin]);
      setTimeout(() => window.__surPartie(copie), 0);
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
  export const setDoc = async (ref, data, options) => { ecrire(ref.chemin, data, options && options.merge ? "merge" : "set"); };
  export const updateDoc = async (ref, data) => { ecrire(ref.chemin, data, "update"); };
  export const deleteDoc = async (ref) => { delete docs()[ref.chemin]; (window.__suppressions = window.__suppressions || []).push(ref.chemin); };
  let n = 0;
  export const addDoc = async (c, data) => { const id = "m" + (++n) + "_" + Date.now(); docs()[c.col + "/" + id] = cloner(data); (window.__ajouts = window.__ajouts || []).push({ col: c.col, id, t: Date.now(), data: cloner(data) }); return { id }; };
  export const deleteField = () => SUPPR; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (k) => k; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const writeBatch = () => { const ops = []; return { set(r, d, o){ ops.push(() => ecrire(r.chemin, d, o && o.merge ? "merge" : "set")); }, update(r, d){ ops.push(() => ecrire(r.chemin, d, "update")); },
    delete(r){ ops.push(() => { delete docs()[r.chemin]; }); }, commit: async () => { ops.forEach(f => f()); } }; };
  export const runTransaction = async (_d, fn) => {
    const ops = [];
    const tx = { get: async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => cloner(d || {}) }; },
                 update(r, d) { ops.push(() => ecrire(r.chemin, d, "update")); return tx; },
                 set(r, d, o) { ops.push(() => ecrire(r.chemin, d, o && o.merge ? "merge" : "set")); return tx; },
                 delete(r) { ops.push(() => { delete docs()[r.chemin]; }); return tx; } };
    const res = await fn(tx);
    ops.forEach(f => f());
    return res;
  };
  export const Timestamp = { now: () => Date.now() };
`;
// LES IMAGES : la carte de combat (1536 × 1024), l'arène, les pions, les portraits.
const CARTE = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024"><rect width="1536" height="1024" fill="#c9b48a"/><rect x="0" y="0" width="1536" height="120" fill="#5a4a3a"/><circle cx="760" cy="520" r="120" fill="#3b6fa0"/><rect x="300" y="700" width="200" height="60" fill="#7a5a3a"/></svg>`;
const ARENE = `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1200"><rect width="1800" height="1200" fill="#8a7a5a"/></svg>`;
const PION = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="90" fill="#6b3d1e"/></svg>`;
const PORTRAIT = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="520"><rect width="300" height="520" fill="#ff00ff"/><ellipse cx="150" cy="200" rx="90" ry="160" fill="#c08a5a"/></svg>`;
const URL_ARENE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1789076932/arene_s5qs3e.png";
const URL_PORTRAIT_KORE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1/PNJ/portrait_kore.png";

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => {
  const u = r.request().url();
  const corps = /Combats\/Cartes|carte_combat/.test(u) ? CARTE : /arene/.test(u) ? ARENE : /portrait|PNJ/.test(u) ? PORTRAIT : PION;
  r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'}, body: corps });
});

// GEMINI SIMULÉ, reconnu à la consigne de chaque MIA.
const requetes = [], openai = [], cloudinary = [];
const faux = { verdict: { combat: true, raison: "Les gardes de Dame Koré tirent leurs lances sur les héros.", adversaires: "Dame Koré et ses gardes" },
               cle2EnPanne: false, peintures: true, nombre: 2 };
await p.exposeFunction('__fauxGemini', (o) => Object.assign(faux, o));
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
// Les cadres que « voit » MIA_TERRAIN_COMBAT (v287) : deux colonnes, un bassin,
// des gravats — et un cadre démesuré, à écarter.
const CADRES_TERRAIN = [
  { sorte: "mur", nom: "colonne ouest", box_2d: [60, 100, 170, 170] },
  { sorte: "mur", nom: "colonne est", box_2d: [60, 300, 170, 370] },
  { sorte: "infranchissable", nom: "bassin sacré", box_2d: [400, 420, 600, 580] },
  { sorte: "difficile", nom: "gravats", box_2d: [750, 80, 950, 300] },
  { sorte: "mur", nom: "tout le temple", box_2d: [0, 0, 900, 900] },
  { sorte: "brouillard", nom: "inconnu", box_2d: [1, 2, 3, 4] }
];
await p.route('**generativelanguage.googleapis.com/**', async r => {
  const url = r.request().url();
  const cle = (url.match(/key=([^&]+)/) || [])[1] || "";
  const corps = JSON.parse(r.request().postData() || "{}");
  const parts = (corps.contents && corps.contents[0] && corps.contents[0].parts) || [];
  const image = parts.find(x => x.inline_data);
  const systeme = corps.systemInstruction ? corps.systemInstruction.parts.map(x => x.text).join("\n") : "";
  const texteU = parts.filter(x => x.text).map(x => x.text).join("\n");
  const mia = (systeme.match(/Tu es (MIA_[A-Z_]+)/) || [])[1] || (/Continue l'histoire/.test(systeme) ? "NARRATEUR" : "AUTRE");
  requetes.push({ mia, cle, image: !!image, imageTaille: image ? image.inline_data.data.length : 0, texte: texteU, systeme, temperature: corps.generationConfig && corps.generationConfig.temperature });
  if (faux.cle2EnPanne && cle === "cle-GEMINI_API_KEY_2") {
    r.fulfill({ status: 429, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ error: { message: "quota" } }) });
    return;
  }
  let texte = "{}";
  if (mia === "MIA_COMBAT") texte = JSON.stringify(faux.verdict);
  else if (mia === "MIA_CHAMP_DE_BATAILLE") texte = JSON.stringify({ titre: "La cour du temple d'Héra", interieur: true,
      description: "Une cour dallée bordée d'un portique de colonnes au nord ; un bassin sacré au centre ; des gravats au sud-ouest ; une porte de bronze à l'est." });
  else if (mia === "MIA_ENNEMIS" && /habille les créatures/.test(systeme)) {
    const n = (texteU.match(/^\d+\. /gm) || []).length;
    texte = JSON.stringify({ creatures: Array.from({ length: n }, (_, i) => i === 0 ? { numero: 1, nom: "Dame Koré", visuel: "kore", pnj: "Dame Koré" }
        : { numero: i + 1, nom: ["Garde à la lance", "Garde au bouclier", "Archer du temple", "Prêtresse armée", "Garde d'airain", "Chien du temple", "Sentinelle", "Gardien de l'autel"][(i - 1) % 8] + (i > 8 ? " l'Ancien" : ""), visuel: i % 2 ? "garde" : "archer", pnj: "" }),
      visuels: [{ cle: "kore", description_physique: "Une prêtresse au visage sévère" }, { cle: "garde", description_physique: "Un garde casqué de bronze, lance au poing" },
                { cle: "archer", description_physique: "Un archer au visage tatoué, capuche de lin" }] });
  } else if (mia === "MIA_ENNEMIS") texte = JSON.stringify({ nombre: faux.nombre,
      ennemis: [{ nom: "Dame Koré", pnj: "Dame Koré", description_physique: "Une prêtresse au visage sévère" }, { nom: "Garde à la lance", pnj: "", description_physique: "Un garde casqué" }],
      renforts: [{ nom: "Archer du temple", description_physique: "Un archer tatoué" }] });
  // (v287 : une seule IA encadre les zones sur la carte nue ; MIA_SPAWN répond en coordonnées.)
  else if (mia === "MIA_TERRAIN_COMBAT") texte = JSON.stringify({ elements: faux.peintures ? CADRES_TERRAIN : [] });
  else if (mia === "MIA_SPAWN") texte = JSON.stringify(faux.peintures ? { heros: [500, 150], ennemis: [500, 850], renforts: [[60, 960], [950, 960], [500, 500]], raison: "Face à face dans la cour." } : {});
  else if (mia === "NARRATEUR") texte = "Le silence retombe sur la cour du temple ; le sang des gardes se mêle à l'eau du bassin.";
  r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'},
              body: JSON.stringify({ candidates: [{ content: { parts: [{ text: texte }] } }], usageMetadata: { totalTokenCount: 10 } }) });
});
await p.route('**api.openai.com/**', async r => {
  const u = r.request().url();
  const d = r.request().postData() || "";
  const prompt = u.includes("generations") ? (JSON.parse(d || "{}").prompt || "") : ((d.match(/name="prompt"\r\n\r\n([\s\S]*?)\r\n--/) || [])[1] || "");
  const json = u.includes("generations") ? JSON.parse(d || "{}") : {};
  openai.push({ url: u, prompt, taille: json.size || (d.match(/name="size"\r\n\r\n([^\r]*)/) || [])[1], qualite: json.quality || (d.match(/name="quality"\r\n\r\n([^\r]*)/) || [])[1] });
  if (faux.openaiEnPanne) { r.fulfill({ status: 500, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ error: { message: "panne" } }) }); return; }
  r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ data: [{ b64_json: PNG }] }) });
});
await p.route('**api.cloudinary.com/**', async r => {
  const d = r.request().postData() || "";
  const dossier = (d.match(/name="folder"\r\n\r\n([^\r]*)/) || [])[1] || "divers";
  cloudinary.push(dossier);
  r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ secure_url: `https://res.cloudinary.com/dlkjq4kvg/image/upload/v1/${dossier}/image_${cloudinary.length}.png` }) });
});
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
const consoles = []; p.on('console', m => consoles.push(m.text()));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);

// LA TABLE : une partie au temple d'Héra (lieu L_1), Dame Koré (PNJ nommé, avec
// son avatar), deux héros, 18 messages, le style des cartes dans Cerveau_IA,
// l'arène sur le plateau.
await p.evaluate(({ URL_ARENE, URL_PORTRAIT_KORE }) => {
  window.jouerSonClic = () => {}; window.confirm = () => true; window.alert = () => {};
  localStorage.setItem("ivalis_DEV_MODE", "on");
  localStorage.setItem("ID_JOUEUR_COURANT", "P_01");
  window.COMPTE_JOUEUR = { nom: "Nico" };
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => e.style.display = e.id === "ecran-jeu" ? "block" : "none");
  ["GEMINI_API_KEY", "GEMINI_API_KEY_2", "OPENAI_API_KEY", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].forEach(k => localStorage.setItem("ivalis_" + k, "cle-" + k));
  window.VARIATION_STATS_MONSTRE_PCT = 0;
  window.ID_PARTIE_COURANTE = "P1";
  window.__docs = window.__docs || {};
  window.__docs["Systeme_Parties/P1"] = { Lieu_Actuel: "L_1", Situation: "Dans un lieu", Ordre_Initiative: ["H1", "H2"], Index_Initiative: 999, Tour_Combat: 1, Phase_Combat: "Preparation" };
  window.__docs["Monde_Lieux/L_1"] = { Nom_Lieu: "Le temple d'Héra", Type_Lieu: "Sanctuaire", Description: "Un temple de marbre blanc sur une colline, sa cour dallée, son bassin sacré." };
  window.__docs["Monde_PNJ/PNJ_KORE"] = { Nom_PNJ: "Dame Koré", ID_Lieu: "L_1", Race: "Humain", Occupation: "Grande prêtresse", Statut: "Vivant",
    Description_Physique: "Une prêtresse au visage sévère, cheveux noirs tressés d'or.", URL_Cloudinary: URL_PORTRAIT_KORE };
  window.__docs["Cerveau_IA/INST_55501"] = { ID_Instruction: "INST_55501", Titre_Menu: "Style map crea", Statut_Actif: "on",
    Contenu_Direct: "STYLE DE TEST : carte dessinée à la main à l'encre sur un vieux parchemin, vue de dessus absolue." };
  window.__docs["Cerveau_IA/INST_10895"] = { Titre_Menu: "MJ", Contenu_Direct: "Tu es le Maître du Jeu de test." };
  window.__docs["Combat_VTT/P1"] = { URL_Map: URL_ARENE, Taille_Hex: 60, Opacite_Grille: 0.8, Tuiles_Murs: ["0,0", "1,0"], Tuiles_Supprimees: ["5,5"], Tuiles_Difficiles: [], Tuiles_Spawn_Ennemis: ["2,2"], Tokens: {} };
  window.__docs["Date_En_Jeu/actuelle"] = { Jour: "12", Annee: "3" };
  window.DATE_EN_JEU_ACTUELLE = { jour: "12", annee: "3" };
  const heros = (id, joueur, prenom) => ({ idPersonnage: id, idJoueur: joueur, prenom, nom: "", camp: "Allié", statut: "Vivant", actif: true,
    PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, fatigueActuelle: 100, Bouclier_Actuel: 0, Etats_Alteres: [], urlToken: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1/Tokens/" + id + ".png", urlCloudinary: "" });
  window.PERSOS_JOUEURS_PARTIE = [heros("H1", "P_01", "Thorin"), heros("H2", "P_02", "Lyra")];
  window.PERSOS_PARTIE = window.PERSOS_JOUEURS_PARTIE.slice();
  window.__docs["Personnages/H1"] = { Prenom_Personnage: "Thorin", ID_Partie: "P1", ID_Joueur: "P_01", PV_Max: 60, PV_Actuels: 60 };
  window.__docs["Personnages/H2"] = { Prenom_Personnage: "Lyra", ID_Partie: "P1", ID_Joueur: "P_02", PV_Max: 60, PV_Actuels: 60 };
  const t0 = Date.now() - 100000;
  for (let i = 0; i < 18; i++) {
    const mj = i % 3 === 2;
    window.__docs["Messages_Chat/c" + i] = { ID_Partie: "P1", Auteur_ID: mj ? "MJ" : (i % 3 ? "H2" : "H1"), Auteur_Nom: mj ? "MJ" : (i % 3 ? "Lyra" : "Thorin"),
      Texte: mj ? `<strong>Réponse du MJ numéro ${i}</strong>` : `Message de joueur numéro ${i}`, Est_Narration_IA: mj, Timestamp: t0 + i * 1000 };
  }
  window.__docs["Messages_Chat/c99"] = { ID_Partie: "P1", Auteur_ID: "H1", Auteur_Nom: "Thorin", Texte: "Je brandis ma hache et je frappe le garde de Dame Koré !", Timestamp: t0 + 50000 };
  if (typeof window.initialiserPlateau === "function") window.initialiserPlateau();
  if (typeof window.appliquerTerrain === "function") window.appliquerTerrain(URL_ARENE, 60, 0.8);
  window.TOKENS_VTT_DATA = {};
  window.PARTIE_DATA = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]));
  window.__surPartie = (copie) => {
    window.PARTIE_DATA = copie;
    if (typeof window.appliquerCombatRPDeLaPartie === "function") window.appliquerCombatRPDeLaPartie(copie);
  };
  // Le banc va vite : les attentes de la vraie table, raccourcies.
  Object.assign(window.REGLAGES_COMBAT_RP || {}, { battementMs: 400, relaisMs: 1500, regleurFraisMs: 4000, grilleSansRegleurMs: 600000,
    attenteVerdictMs: 1500, narrationApresMs: { victoire: 50, defaite: 50 }, abandonMs: 400, butinOublieMs: 600000 });
}, { URL_ARENE, URL_PORTRAIT_KORE });
await p.waitForTimeout(600);

const partie = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"] || {})));
const crp = async () => (await partie()).Combat_RP || null;
const vtt = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__docs["Combat_VTT/P1"] || {})));
const ecrirePartie = (maj) => p.evaluate((maj) => {
  const d = window.__docs["Systeme_Parties/P1"];
  Object.entries(maj).forEach(([k, v]) => { if (v === null) delete d[k]; else d[k] = v; });
  window.__surPartie(JSON.parse(JSON.stringify(d)));
}, maj);
const attendreQue = async (f, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await p.waitForTimeout(100); } return false; };

// =========================================================================
titre("1. LA SECONDE CLÉ GEMINI : LE CHAMP, LE FICHIER JSON, LE CHOIX DE LA CLÉ");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => {
    const champ = document.getElementById("cle-gemini-2");
    const dansLOnglet = !!document.querySelector("#etape-cles-api #cle-gemini-2");
    window.ouvrirClesApi && window.ouvrirClesApi();
    const prerempli = champ ? champ.value : null;
    if (champ) champ.value = "  nouvelle-cle-2  ";
    window.sauvegarderClesApi && window.sauvegarderClesApi();
    const enregistree = localStorage.getItem("ivalis_GEMINI_API_KEY_2");
    localStorage.setItem("ivalis_GEMINI_API_KEY_2", "cle-GEMINI_API_KEY_2");
    // Le fichier exemple.
    let blob = null; const vrai = URL.createObjectURL;
    URL.createObjectURL = (x) => { blob = x; return "blob:essai"; };
    try { window.creerFichierExempleClesApi && window.creerFichierExempleClesApi(); } finally { URL.createObjectURL = vrai; }
    const exemple = blob ? JSON.parse(await blob.text()) : {};
    // L'import.
    const fichier = new File([JSON.stringify({ GEMINI_API_KEY: "a1", GEMINI_API_KEY_2: "b2", OPENAI_API_KEY: "c3" })], "cles.json", { type: "application/json" });
    if (window.importerFichierClesApi) window.importerFichierClesApi({ target: { files: [fichier], value: "x" } });
    await new Promise(res => setTimeout(res, 200));
    const importee = champ ? champ.value : null;
    window.prefillClesApi && window.prefillClesApi();
    return { dansLOnglet, prerempli, enregistree, exemple: Object.keys(exemple), importee,
             ordreCombat: window.clesGeminiPour ? window.clesGeminiPour("combat") : null, ordreMJ: window.clesGeminiPour ? window.clesGeminiPour() : null };
  });
  verifier("un champ GEMINI_API_KEY_2 dans l'onglet des clés API", r.dansLOnglet);
  verifier("il se remplit et s'enregistre dans ce navigateur", r.prerempli === "cle-GEMINI_API_KEY_2" && r.enregistree === "nouvelle-cle-2", `${r.prerempli} / ${r.enregistree}`);
  verifier("le fichier exemple JSON porte GEMINI_API_KEY_2", r.exemple.includes("GEMINI_API_KEY_2") && r.exemple.includes("GEMINI_API_KEY"), r.exemple.join(","));
  verifier("l'import d'un fichier remplit le champ de la seconde clé", r.importee === "b2", r.importee);
  verifier("les IA du combat prennent la seconde clé, le MJ la première",
           JSON.stringify(r.ordreCombat) === '["cle-GEMINI_API_KEY_2","cle-GEMINI_API_KEY"]' && JSON.stringify(r.ordreMJ) === '["cle-GEMINI_API_KEY","cle-GEMINI_API_KEY_2"]',
           JSON.stringify(r.ordreCombat) + " " + JSON.stringify(r.ordreMJ));
  // Une seconde clé à court de quota passe la main à la première.
  await p.evaluate(() => window.__fauxGemini({ cle2EnPanne: true }));
  const avant = requetes.length;
  const ok = await p.evaluate(async () => { try { const res = await window.fetchGemini("combat", JSON.stringify({ contents: [{ parts: [{ text: "x" }] }] })); return res.status; } catch (e) { return String(e); } });
  const cles = requetes.slice(avant).map(x => x.cle);
  await p.evaluate(() => window.__fauxGemini({ cle2EnPanne: false }));
  verifier("une seconde clé refusée (429) : la première prend le relais", ok === 200 && cles.join(",") === "cle-GEMINI_API_KEY_2,cle-GEMINI_API_KEY", `${ok} ${cles.join(",")}`);
  const vide = await p.evaluate(() => { const v = localStorage.getItem("ivalis_GEMINI_API_KEY_2"); localStorage.setItem("ivalis_GEMINI_API_KEY_2", ""); const c = window.cleGemini("combat"); localStorage.setItem("ivalis_GEMINI_API_KEY_2", v); return c; });
  verifier("sans seconde clé, les combats prennent la première", vide === "cle-GEMINI_API_KEY", vide);
});

// =========================================================================
titre("2. LE BOUTON DE COMBAT : « COMBAT EN COURS » ET « ARÈNE DE COMBAT »");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    window.ouvrirPopupRencontre();
    const modale = document.getElementById("modale-pre-combat");
    const encarts = [...modale.querySelectorAll(".encart-combat")].map(e => e.id);
    const enCours = document.getElementById("encart-combat-en-cours");
    const arene = document.getElementById("encart-arene");
    const avant = { enCoursInactif: enCours && enCours.classList.contains("inactif"), areneInactive: arene && arene.classList.contains("inactif"),
                    texte: (document.getElementById("encart-combat-en-cours-texte") || {}).textContent || "", dev: (document.getElementById("encart-combat-dev") || {}).style?.display };
    arene && arene.click();
    const combatOuvert = document.getElementById("fenetre-combat").style.display;
    window.fermerCombat && window.fermerCombat();
    window.fermerToutesLesFenetres && window.fermerToutesLesFenetres();
    return { encarts, avant, combatOuvert, ordre: encarts.indexOf("encart-combat-en-cours") < encarts.indexOf("encart-arene") };
  });
  verifier("deux encarts, « Combat en cours » au-dessus de « Arène de combat »", r.encarts.length === 2 && r.ordre, r.encarts.join(","));
  verifier("sans combat du récit : « Aucun combat en cours », l'arène ouverte", r.avant.enCoursInactif === true && r.avant.areneInactive === false && /Aucun combat/.test(r.avant.texte), JSON.stringify(r.avant));
  verifier("l'arène ouvre la fenêtre de combat telle qu'on la connaît", r.combatOuvert === "block", r.combatOuvert);
  verifier("en mode DEV, le bouton pour lancer un combat du récit", r.avant.dev === "flex", r.avant.dev);
  const r2 = await p.evaluate(() => {
    const vrai = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]));
    window.appliquerCombatRPDeLaPartie && window.appliquerCombatRPDeLaPartie({ ...vrai, Combat_RP: { Id: "x", Etat: "preparation", Adversaires: "des loups", Createur: { id: "AUTRE:zz", t: Date.now() } } });
    window.ouvrirPopupRencontre();
    const enCours = document.getElementById("encart-combat-en-cours"), arene = document.getElementById("encart-arene");
    const etat = { enCoursActif: enCours && !enCours.classList.contains("inactif"), areneInactive: arene && arene.classList.contains("inactif"),
                   texte: (document.getElementById("encart-combat-en-cours-texte") || {}).textContent || "", note: (arene && arene.querySelector(".encart-combat-note") || {}).textContent || "" };
    window.validerPopupRencontre();
    const areneRefusee = document.getElementById("fenetre-combat").style.display !== "block";
    enCours && enCours.click();
    const rejoint = document.getElementById("fenetre-combat").style.display === "block";
    const voile = document.getElementById("voile-combat-rp");
    const voilePlein = !!voile && voile.style.display !== "none" && voile.classList.contains("plein") && /Création du champ de bataille en cours/.test(voile.textContent);
    window.fermerCombat(); window.fermerToutesLesFenetres();
    window.appliquerCombatRPDeLaPartie(vrai);
    return { ...etat, areneRefusee, rejoint, voilePlein };
  });
  verifier("un combat du récit se prépare : l'encart s'active (« se prépare… »), l'arène se ferme", r2.enCoursActif && r2.areneInactive && /se prépare/.test(r2.texte) && /Fermée/.test(r2.note), JSON.stringify(r2));
  verifier("l'arène refuse de s'ouvrir pendant le combat du récit", r2.areneRefusee);
  verifier("l'encart mène au combat ; avant la carte : « Création du champ de bataille en cours… »", r2.rejoint && r2.voilePlein, JSON.stringify(r2));
});

// =========================================================================
titre("3. LE PARCHEMIN : « LE DESTIN HÉSITE… », PUIS COMBATTRE (OU RIEN)");
// =========================================================================
const lireParchemin = async () => {
  for (let i = 0; i < 40; i++) {
    const fin = await p.evaluate(() => !!document.getElementById("fin-recit-combat") || document.getElementById("ecran-recit-dynamique")?.style.display === "none");
    if (fin) return;
    await p.evaluate(() => document.getElementById("ecran-recit-dynamique")?.click());
    await p.waitForTimeout(120);
  }
};
await section(async () => {
  const ts = Date.now();
  await ecrirePartie({ Combat_RP: { Id: "crp_essai", Etat: "detection", Message: ts, Le: Date.now() } });
  await p.evaluate((ts) => window.lancerRecitDynamique("Les gardes s'avancent.<br>« Rendez-vous ! » crie Dame Koré.", { ts }), ts);
  await p.waitForTimeout(1300);
  await lireParchemin();
  const attente = await p.evaluate(() => ({ fin: !!document.getElementById("fin-recit-combat"), texte: (document.getElementById("fin-recit-combat") || {}).textContent || "",
                                           ouvert: document.getElementById("ecran-recit-dynamique")?.style.display }));
  verifier("le verdict n'est pas tombé : la dernière page attend (« Le destin hésite… »)", attente.fin && /Le destin hésite/.test(attente.texte) && attente.ouvert === "block", JSON.stringify(attente));
  await p.evaluate(() => document.getElementById("ecran-recit-dynamique").click());
  const resteLa = await p.evaluate(() => !!document.getElementById("fin-recit-combat"));
  verifier("un toucher sur le parchemin ne la referme pas", resteLa);
  await ecrirePartie({ Combat_RP: { Id: "crp_essai", Etat: "preparation", Message: ts, Adversaires: "Dame Koré et ses gardes", Createur: { id: "AUTRE:zz", t: Date.now() } } });
  await p.waitForTimeout(150);
  const bouton = await p.evaluate(() => {
    const b = document.getElementById("bouton-combattre");
    return b ? { mot: b.textContent.trim(), gouttes: b.querySelectorAll(".goutte-sang").length, fond: getComputedStyle(b).backgroundImage, titre: (document.querySelector(".fin-recit-combat-titre") || {}).textContent } : null;
  });
  verifier("le verdict est COMBAT : un beau bouton « Combattre », rouge, des gouttes de sang", !!bouton && /Combattre/i.test(bouton.mot) && bouton.gouttes >= 6 && /linear-gradient/.test(bouton.fond),
           JSON.stringify(bouton && { ...bouton, fond: bouton.fond.slice(0, 40) }));
  verifier("il dit qui l'on affronte", !!bouton && /Dame Koré/.test(bouton.titre || ""), bouton && bouton.titre);
  await p.screenshot({ path: '/tmp/claude-0/-home-user-Ivalis/3718c626-55b5-577c-9b4f-a49012fd3784/scratchpad/v278_bouton.png' }).catch(() => {});
  await p.evaluate(() => document.getElementById("bouton-combattre").click());
  await p.waitForTimeout(300);
  const apres = await p.evaluate(() => ({ combat: document.getElementById("fenetre-combat").style.display, fin: !!document.getElementById("fin-recit-combat") }));
  verifier("COMBATTRE envoie directement dans le combat en cours", apres.combat === "block" && !apres.fin, JSON.stringify(apres));
  await p.evaluate(() => { window.fermerCombat(); window.fermerToutesLesFenetres(); });
  await p.waitForTimeout(1600);

  // Pas de combat : le parchemin se referme.
  const ts2 = Date.now();
  await ecrirePartie({ Combat_RP: { Id: "crp_essai2", Etat: "detection", Message: ts2, Le: Date.now() } });
  await p.evaluate((ts) => window.lancerRecitDynamique("Rien ne se passe.", { ts }), ts2);
  await p.waitForTimeout(1300);
  await lireParchemin();
  await ecrirePartie({ Combat_RP: { Id: "crp_essai2", Etat: "aucun", Message: ts2 } });
  await p.waitForTimeout(1800);
  const ferme = await p.evaluate(() => ({ fin: !!document.getElementById("fin-recit-combat"), ouvert: document.getElementById("ecran-recit-dynamique")?.style.display }));
  verifier("le verdict est « pas de combat » : le parchemin se referme", !ferme.fin && ferme.ouvert === "none", JSON.stringify(ferme));

  // Un verdict qui ne vient jamais : la dernière page n'attend pas plus de 30 s (1,5 s au banc).
  const ts3 = Date.now();
  await ecrirePartie({ Combat_RP: { Id: "crp_essai3", Etat: "detection", Message: ts3, Le: Date.now() } });
  await p.evaluate((ts) => window.lancerRecitDynamique("Le vent souffle.", { ts }), ts3);
  await p.waitForTimeout(1300);
  await lireParchemin();
  await p.waitForTimeout(3300);
  const delai = await p.evaluate(() => document.getElementById("ecran-recit-dynamique")?.style.display);
  verifier("sans verdict, la dernière page se referme d'elle-même", delai === "none", delai);
  await ecrirePartie({ Combat_RP: null });
});

// =========================================================================
titre("4. LA DÉTECTION : MIA_COMBAT APRÈS LA RÉPONSE DU MJ, EN MÊME TEMPS QUE LES AUTRES IA");
// =========================================================================
let tsMessage = 0;
await section(async () => {
  await p.evaluate(() => { window.__journal = []; window.__ajouts = []; });
  const avant = requetes.length;
  await p.evaluate(() => window.declencherTourIA());
  const lance = await attendreQue(async () => ((await crp()) || {}).Etat === "preparation", 8000);
  const c = await crp();
  const r = await p.evaluate(() => {
    const j = window.__journal || [];
    const iDetection = j.findIndex(x => x.chemin === "Systeme_Parties/P1" && x.data.Combat_RP && x.data.Combat_RP.Etat === "detection");
    const msg = (window.__ajouts || []).find(a => a.col === "Messages_Chat" && a.data.Est_Narration_IA);
    const iDetectionT = iDetection >= 0 ? j[iDetection].t : 0;
    return { detection: iDetection >= 0 ? j[iDetection].data.Combat_RP : null, avantLeMessage: !!msg && iDetectionT <= msg.t, ts: msg ? msg.data.Timestamp : 0 };
  });
  tsMessage = r.ts;
  const reqs = requetes.slice(avant);
  const combat = reqs.find(x => x.mia === "MIA_COMBAT");
  const iCombat = reqs.findIndex(x => x.mia === "MIA_COMBAT"), iNarr = reqs.findIndex(x => x.mia === "NARRATEUR");
  verifier("la partie annonce le verdict AVANT le message du MJ (le parchemin saura attendre)", !!r.detection && r.avantLeMessage && Number(r.detection.Message) === r.ts, JSON.stringify(r.detection));
  verifier("MIA_COMBAT juge après la réponse du MJ", !!combat && iCombat > iNarr, `${iNarr} → ${iCombat}`);
  verifier("elle lit les actions des joueurs depuis la réponse précédente, et la nouvelle réponse",
           !!combat && /Je brandis ma hache/.test(combat.texte) && /LA RÉPONSE QUE LE MAÎTRE DU JEU VIENT DE DONNER/.test(combat.texte) && /Le silence retombe|silence/.test(combat.texte) === true,
           combat ? combat.texte.slice(0, 160).replace(/\n/g, " | ") : "");
  verifier("elle prend la seconde clé (une IA du combat), à basse température", !!combat && combat.cle === "cle-GEMINI_API_KEY_2" && combat.temperature <= 0.3, combat && `${combat.cle} ${combat.temperature}`);
  verifier("agression détectée : le combat se prépare, sur ce poste", lance && !!c && c.Etat === "preparation" && /^P_01:/.test((c.Createur || {}).id || "") && /Dame Koré/.test(c.Adversaires || ""), JSON.stringify(c && { Etat: c.Etat, Createur: c.Createur, Adversaires: c.Adversaires }));
});

// =========================================================================
titre("5. LA PRÉPARATION : LE LIEU, LA CARTE, LES ENNEMIS, LES PIONS");
// =========================================================================
await section(async () => {
  const pret = await attendreQue(async () => { const c = await crp(); return !!c && !!c.Carte && !!c.Ennemis && c.Tokens && Object.keys(c.Ennemis.Visuels || {}).every(k => c.Tokens[k] !== undefined); }, 15000);
  const c = await crp();
  const v = await vtt();
  verifier("tout est prêt jusqu'aux pions", pret, JSON.stringify(c && Object.keys(c)));
  verifier("l'arène est mise de côté (sa carte, sa grille, ses couches) et le plateau vidé",
           !!v.Arene_Sauvegarde && v.Arene_Sauvegarde.URL_Map === URL_ARENE && JSON.stringify(v.Arene_Sauvegarde.Tuiles_Murs) === '["0,0","1,0"]' && c.Remise === true,
           JSON.stringify(v.Arene_Sauvegarde));
  const lieu = requetes.find(x => x.mia === "MIA_CHAMP_DE_BATAILLE");
  const lignes = lieu ? (lieu.texte.split("--- LES 15 DERNIERS MESSAGES ---")[1] || "").trim().split("\n").filter(Boolean) : [];
  verifier("MIA_CHAMP_DE_BATAILLE lit les 15 derniers messages et le lieu actuel", !!lieu && lignes.length === 15 && /temple de marbre blanc/.test(lieu.texte) && /Je brandis ma hache/.test(lieu.texte),
           `${lignes.length} lignes`);
  verifier("sa description est gardée (le lieu, intérieur ou non)", !!c.Lieu && /cour dallée/.test(c.Lieu.Description) && c.Lieu.Interieur === true && c.Lieu.Titre === "La cour du temple d'Héra", JSON.stringify(c.Lieu).slice(0, 120));
  const carte = openai.find(x => /STYLE DE TEST/.test(x.prompt));
  verifier("la carte : le style « Style map crea » des paramètres + la description du lieu", !!carte && /cour dallée bordée d'un portique/.test(carte.prompt), carte ? carte.prompt.slice(0, 90) : "aucune");
  verifier("les mêmes réglages que les portraits des héros : gpt-image, qualité medium ; en paysage", !!carte && carte.qualite === "medium" && carte.taille === "1536x1024", carte && `${carte.qualite} ${carte.taille}`);
  verifier("la carte est hébergée et posée sur le plateau (couches remises à zéro)", /Combats\/Cartes/.test(c.Carte) && v.URL_Map === c.Carte && (v.Tuiles_Murs || []).length === 0, `${c.Carte} / ${v.URL_Map}`);
  const ennemis = requetes.filter(x => x.mia === "MIA_ENNEMIS");
  verifier("MIA_ENNEMIS lit le récit et les PNJ nommés présents (Dame Koré)", ennemis.length === 2 && /Dame Koré \(Humain, Grande prêtresse\)/.test(ennemis[0].texte), `${ennemis.length} appel(s)`);
  const tirage = c.Ennemis.Tirage;
  verifier("deux ennemis engagés dans le récit → Apparition 2, le cas tiré selon ses règles", c.Ennemis.Apparition === 2 && tirage.apparition === 2 && tirage.depart.length >= 1, `${c.Ennemis.Apparition} / cas ${tirage.cas} (${tirage.depart.length} + ${tirage.renforts.length})`);
  const noms = [...tirage.depart, ...tirage.renforts].map(m => m.nom);
  verifier("chaque créature est nommée, renforts compris, tous les noms différents", noms.length > 0 && noms.every(Boolean) && new Set(noms).size === noms.length, noms.join(", "));
  verifier("le premier du départ est Dame Koré, le PNJ nommé (avec son avatar)", tirage.depart[0].nom === "Dame Koré" && tirage.depart[0].pnj === "Dame Koré" && tirage.depart[0].portrait === URL_PORTRAIT_KORE, JSON.stringify(tirage.depart[0]).slice(0, 160));
  const vis = c.Ennemis.Visuels;
  verifier("des visuels partagés (au plus 5) : un pion par apparence, pas par créature", Object.keys(vis).length >= 2 && Object.keys(vis).length <= 5 && Object.keys(vis).every(k => /^v\d$/.test(k)), Object.keys(vis).join(","));
  const pions = openai.filter(x => /medallion/.test(x.prompt));
  const depuisPortrait = pions.filter(x => /images\/edits/.test(x.url));
  const directs = pions.filter(x => /images\/generations/.test(x.url));
  verifier("le pion de Dame Koré part de son avatar (comme un héros)", depuisPortrait.length === 1 && /reference/.test(depuisPortrait[0].prompt), `${depuisPortrait.length}`);
  verifier("les autres : token direct, d'après leur apparence, même médaillon, même qualité",
           directs.length === Object.keys(vis).length - 1 && directs.every(x => /described below/.test(x.prompt) && x.qualite === "low" && x.taille === "1024x1024"),
           `${directs.length} / ${Object.keys(vis).length - 1} ${directs[0] ? directs[0].prompt.slice(0, 140) : ""}`);
  verifier("les pions sont détourés et hébergés (Tokens/Ennemis)", Object.values(c.Tokens).every(u => /Tokens\/Ennemis/.test(u)), JSON.stringify(c.Tokens));
  verifier("toutes ces IA de texte prennent la seconde clé", requetes.filter(x => /^MIA_(CHAMP|ENNEMIS)/.test(x.mia)).every(x => x.cle === "cle-GEMINI_API_KEY_2"));
});

// =========================================================================
titre("6. LA BOÎTE DE LA GRILLE : LES JOUEURS EN MODE DEV, PRIORITÉ À NICO ET BEN");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.rejoindreCombatRP());
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const voile = document.getElementById("voile-combat-rp"), boite = document.getElementById("boite-grille-rp");
    return { bandeau: !!voile && voile.classList.contains("bandeau") && /Les ennemis se préparent/.test(voile.textContent),
             boite: !!boite && boite.style.display === "flex", qui: (document.getElementById("boite-grille-qui") || {}).textContent || "",
             carte: document.getElementById("image-map-vtt").src };
  });
  verifier("la carte s'ouvre dans la fenêtre de combat, l'attente devient un bandeau", r.bandeau && /Combats\/Cartes/.test(r.carte), JSON.stringify(r));
  verifier("un joueur en mode DEV (Nico) voit la boîte et a la main", r.boite && /C'est toi/.test(r.qui), r.qui);
  const regleurs = ((await crp()) || {}).Regleurs || {};
  verifier("il s'inscrit devant la boîte (nom, présence)", !!regleurs.P_01 && regleurs.P_01.nom === "Nico", JSON.stringify(regleurs));
  // Priorité : Adrien est arrivé avant, Ben après ; Nico parti, c'est Ben qui a la main.
  const prio = await p.evaluate(() => {
    const t = Date.now();
    const c = { Regleurs: { P_03: { nom: "Adrien", t, depuis: t - 9000 }, P_02: { nom: "Ben", t, depuis: t - 1000 }, P_01: { nom: "Nico", t, depuis: t } } };
    const sansNico = { Regleurs: { P_03: c.Regleurs.P_03, P_02: c.Regleurs.P_02 } };
    const seulAdrien = { Regleurs: { P_03: c.Regleurs.P_03, P_01: { nom: "Nico", t: t - 60000, depuis: t } } };
    return [window.teneurGrilleCombatRP(c), window.teneurGrilleCombatRP(sansNico), window.teneurGrilleCombatRP(seulAdrien)];
  });
  verifier("la main : Nico d'abord, puis Ben, sinon le premier arrivé (un absent ne compte plus)", JSON.stringify(prio) === '["P_01","P_02","P_03"]', JSON.stringify(prio));
  // Adrien (P_03) en DEV, Nico présent : il voit la boîte en lecture.
  const lecture = await p.evaluate(async () => {
    localStorage.setItem("ID_JOUEUR_COURANT", "P_03"); window.COMPTE_JOUEUR = { nom: "Adrien" };
    window.actualiserCombatRPAffichage();
    const boite = document.getElementById("boite-grille-rp");
    const r = { lecture: boite.classList.contains("en-lecture"), qui: document.getElementById("boite-grille-qui").textContent,
                bloque: [...boite.querySelectorAll("button")].every(x => x.disabled) };
    localStorage.setItem("ID_JOUEUR_COURANT", "P_01"); window.COMPTE_JOUEUR = { nom: "Nico" };
    window.actualiserCombatRPAffichage();
    return r;
  });
  verifier("un autre joueur DEV voit « Nico règle la grille… », sans pouvoir y toucher", lecture.lecture && /Nico règle la grille/.test(lecture.qui) && lecture.bloque, JSON.stringify(lecture));
  // Un joueur hors DEV ne la voit pas.
  const horsDev = await p.evaluate(() => { localStorage.setItem("ivalis_DEV_MODE", "off"); window.actualiserCombatRPAffichage();
    const v = document.getElementById("boite-grille-rp").style.display; localStorage.setItem("ivalis_DEV_MODE", "on"); window.actualiserCombatRPAffichage(); return v; });
  verifier("hors mode DEV, pas de boîte", horsDev === "none", horsDev);
  // Nico règle : + + → 62, l'aperçu part pour les autres ; il valide.
  await p.evaluate(() => { document.querySelector('#boite-grille-rp [data-d="1"]').click(); document.querySelector('#boite-grille-rp [data-d="1"]').click(); });
  await p.waitForTimeout(600);
  const apercu = await p.evaluate(() => ({ local: window.PLATEAU_VTT.hexSize, valeur: document.getElementById("boite-grille-valeur").textContent, base: (window.__docs["Systeme_Parties/P1"].Combat_RP || {}).Apercu_Grille }));
  verifier("les hexagones grandissent sous ses yeux, et chez les autres (aperçu)", apercu.local === 62 && apercu.valeur === "62" && apercu.base === 62, JSON.stringify(apercu));
  await p.evaluate(() => document.getElementById("boite-grille-valider").click());
  await p.waitForTimeout(300);
  const g = (await crp()).Grille, tv = (await vtt()).Taille_Hex;
  verifier("validée : la taille est enregistrée, et l'IA de peinture se lance", !!g && g.Taille === 62 && g.Par === "P_01" && tv === 62, JSON.stringify(g) + " " + tv);
});

// =========================================================================
titre("7. LA GRILLE, LES ZONES (v287 : MIA_TERRAIN_COMBAT encadre, le jeu passe sur la grille), MIA_SPAWN");
// =========================================================================
await section(async () => {
  const pret = await attendreQue(async () => ((await crp()) || {}).Etat === "en_cours", 15000);
  verifier("zones, positions, déploiement : le combat commence", pret, JSON.stringify(((await crp()) || {}).Etat));
  const geo = await p.evaluate(() => {
    const cases = window.casesGrilleCombatRP(1536, 1024, 62);
    const P = window.PLATEAU_VTT;
    const ecarts = cases.slice(0, 40).map(c => { const px = P.hexToPixel(c.q, c.r); return Math.hypot(px.x - c.x, px.y - c.y); });
    const numeros = cases.map(c => c.n);
    return { n: cases.length, uniques: new Set(numeros).size === cases.length, de1: Math.min(...numeros) === 1 && Math.max(...numeros) === cases.length,
             dedans: cases.every(c => c.x >= 0 && c.x <= 1536 && c.y >= 0 && c.y <= 1024), ecart: Math.max(...ecarts), plateau: [P.largeurLogique, P.hauteurLogique] };
  });
  verifier("une case = un numéro, de 1 à N, toutes dans l'image", geo.n > 100 && geo.uniques && geo.de1 && geo.dedans, `${geo.n} cases`);
  verifier("la géométrie est celle du plateau (mêmes centres que Plateau.js)", geo.ecart < 0.01 && geo.plateau[0] === 1536, `écart ${geo.ecart} ${geo.plateau}`);
  const zones = requetes.filter(x => x.mia === "MIA_TERRAIN_COMBAT");
  verifier("UNE seule IA pour les zones (plus trois lectures de numéros)", zones.length === 1 && !requetes.some(x => /^MIA_PEINTURE_/.test(x.mia)), requetes.map(x => x.mia).filter(m => /TERRAIN|PEINTURE/.test(m)).join(","));
  verifier("elle reçoit la carte nue et la description du lieu", zones.length === 1 && zones[0].image && zones[0].imageTaille > 2000 && /bassin sacré/.test(zones[0].texte), zones[0] && [zones[0].imageTaille, zones[0].texte.slice(0, 200)].join(" "));
  const v = await vtt();
  const attendu = await p.evaluate((cadres) => {
    const cases = window.casesGrilleCombatRP(1536, 1024, 62);
    const z = window.zonesDepuisCadres(cadres, cases, 1536, 1024, 62);
    const centre = (cle) => cases.find(c => c.cle === cle);
    const dans = (cle, b) => { const c = centre(cle); return c.x >= b[1] / 1000 * 1536 - 40 && c.x <= b[3] / 1000 * 1536 + 40 && c.y >= b[0] / 1000 * 1024 - 40 && c.y <= b[2] / 1000 * 1024 + 40; };
    return { z, mursDansColonnes: z.murs.every(k => dans(k, cadres[0].box_2d) || dans(k, cadres[1].box_2d)), bassin: z.inaccessibles.every(k => dans(k, cadres[2].box_2d)),
             gravats: z.difficiles.every(k => dans(k, cadres[3].box_2d)) };
  }, CADRES_TERRAIN);
  verifier("les cadres passés sur la grille : murs, bassin infranchissable, gravats difficiles", JSON.stringify(v.Tuiles_Murs) === JSON.stringify(attendu.z.murs)
           && JSON.stringify(v.Tuiles_Supprimees) === JSON.stringify(attendu.z.inaccessibles) && JSON.stringify(v.Tuiles_Difficiles) === JSON.stringify(attendu.z.difficiles)
           && v.Tuiles_Murs.length > 0 && v.Tuiles_Supprimees.length > 0 && v.Tuiles_Difficiles.length > 0,
           JSON.stringify([v.Tuiles_Murs.length, v.Tuiles_Supprimees.length, v.Tuiles_Difficiles.length]));
  verifier("…seulement sous leurs cadres ; le cadre démesuré et la sorte inconnue écartés", attendu.mursDansColonnes && attendu.bassin && attendu.gravats && attendu.z.refuses === 2,
           JSON.stringify([attendu.mursDansColonnes, attendu.bassin, attendu.gravats, attendu.z.refuses]));
  const spawn = requetes.find(x => x.mia === "MIA_SPAWN");
  const six = spawn ? (spawn.texte.split("DERNIERS MESSAGES DU RÉCIT ---")[1] || "").trim().split("\n").filter(Boolean) : [];
  verifier("MIA_SPAWN : la carte aux cases teintées et les 6 derniers messages", !!spawn && spawn.image && six.length === 6, `${six.length} lignes`);
  const pt = await partie();
  const pos = await p.evaluate(({ h, e, cle }) => {
    const cases = window.casesGrilleCombatRP(1536, 1024, 62), k = (q) => cases.find(c => c.q === q.q && c.r === q.r);
    const ch = k(h), ce = k(e);
    const bloquees = new Set([...(cle.m || []), ...(cle.s || [])]);
    return { h: ch && [ch.x / 1536, ch.y / 1024], e: ce && [ce.x / 1536, ce.y / 1024], libres: ch && ce && !bloquees.has(ch.cle) && !bloquees.has(ce.cle) };
  }, { h: pt.Spawn_Allies || {}, e: pt.Spawn_Ennemis || {}, cle: { m: v.Tuiles_Murs, s: v.Tuiles_Supprimees } });
  verifier("les repères des héros (à gauche) et des ennemis (à droite), là où MIA_SPAWN l'a dit",
           !!pos.h && !!pos.e && Math.abs(pos.h[0] - 0.15) < 0.06 && Math.abs(pos.h[1] - 0.5) < 0.08 && Math.abs(pos.e[0] - 0.85) < 0.06 && Math.abs(pos.e[1] - 0.5) < 0.08 && pos.libres,
           JSON.stringify(pos));
  verifier("les entrées des renforts : trois, sur des cases libres (le point dans le bassin ramené au bord)",
           (v.Tuiles_Spawn_Ennemis || []).length === 3 && v.Tuiles_Spawn_Ennemis.every(k => !v.Tuiles_Murs.includes(k) && !v.Tuiles_Supprimees.includes(k)), JSON.stringify(v.Tuiles_Spawn_Ennemis));
  await p.screenshot({ path: '/tmp/claude-0/-home-user-Ivalis/3718c626-55b5-577c-9b4f-a49012fd3784/scratchpad/v278_zones.png' }).catch(() => {});
});

// =========================================================================
titre("8. LE DÉPLOIEMENT : LES HÉROS, LA RENCONTRE ET SES PIONS, LE PNJ EN PIED");
// =========================================================================
let idRencontre = "";
await section(async () => {
  const c = await crp(); const pt = await partie(); const v = await vtt();
  idRencontre = c.ID_Rencontre;
  verifier("la rencontre est née (ID_Rencontre gardé dans le combat du récit)", !!c.ID_Rencontre && c.ID_Rencontre === pt.ID_Rencontre && pt.Apparition_Rencontre === 2, `${c.ID_Rencontre} / ${pt.ID_Rencontre}`);
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
  const tok = v.Tokens || {};
  verifier("les héros autour de leur repère", tok.H1 && tok.H2 && dist(tok.H1, pt.Spawn_Allies) <= 3 && dist(tok.H2, pt.Spawn_Allies) <= 3, JSON.stringify([tok.H1, tok.H2, pt.Spawn_Allies]));
  const monstres = await p.evaluate(() => Object.entries(window.__docs).filter(([k]) => k.startsWith("Monstres/")).map(([k, d]) => ({ id: k.split("/")[1], ...d })));
  const kore = monstres.find(m => m.Prenom_Personnage === "Dame Koré");
  verifier("les créatures du départ autour du repère des ennemis, chacune avec SON pion", monstres.length === c.Ennemis.Tirage.depart.length
           && monstres.every(m => tok[m.id] && dist(tok[m.id], pt.Spawn_Ennemis) <= 3 && /Tokens\/Ennemis/.test(m.URL_Token)), monstres.map(m => `${m.Prenom_Personnage}:${m.URL_Token ? "pion" : "-"}`).join(", "));
  verifier("Dame Koré : PNJ nommé, son avatar gardé pour le bandeau", !!kore && kore.PNJ_Nomme === "Dame Koré" && kore.URL_Cloudinary === URL_PORTRAIT_KORE, kore && JSON.stringify({ p: kore.PNJ_Nomme, u: kore.URL_Cloudinary }));
  verifier("les renforts attendent avec leur nom et leur pion", (pt.Reserve_Monstres || []).length === c.Ennemis.Tirage.renforts.length && (pt.Reserve_Monstres || []).every(m => m.nom && /Tokens\/Ennemis/.test(m.token || "")),
           `${(pt.Reserve_Monstres || []).length} en réserve`);
  const r = await p.evaluate(({ kore, URL_PORTRAIT_KORE }) => {
    // Le pion sur le plateau, et la fenêtre de tour de Dame Koré.
    const front = window.persoDocVersFront ? window.persoDocVersFront(kore.id, kore) : {};
    const m = { ...front, estMonstre: true, pnjNomme: kore.PNJ_Nomme, camp: "Ennemi", statut: "Vivant" };
    const autre = { idPersonnage: "M_X", estMonstre: true, urlToken: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1/Tokens/Ennemis/x.png", camp: "Ennemi" };
    const pion = window.imagePionCreature(autre).url;
    window.PERSOS_PARTIE = [...window.PERSOS_PARTIE.filter(x => !x.estMonstre), m];
    window.EVENEMENT_EN_COURS = { acteur: kore.id, idCarte: "X" };
    const ouverte = document.getElementById("fenetre-combat").style.display;
    document.getElementById("fenetre-combat").style.display = "block";
    try { window.rafraichirVoileTour([], "Resolution"); } catch (e) { return { erreur: e.message, ouverte }; }
    const boite = document.getElementById("voile-tour-pion-boite"), img = document.getElementById("voile-tour-pion");
    return { pion, ouverte, enPied: !!boite && boite.classList.contains("pion-avatar-entier"), src: img ? img.getAttribute("src") || "" : "" };
  }, { kore, URL_PORTRAIT_KORE });
  verifier("une créature des combats du récit montre son propre pion", /Tokens\/Ennemis\/x\.png/.test(r.pion || ""), r.pion);
  verifier("le bandeau du tour de Dame Koré : son avatar, en pied, comme un héros", r.enPied && /portrait_kore/.test(r.src || ""), JSON.stringify(r));
  const voile = await p.evaluate(() => ({ voile: (document.getElementById("voile-combat-rp") || {}).style?.display, boite: (document.getElementById("boite-grille-rp") || {}).style?.display }));
  verifier("tout est prêt : le message d'attente et la boîte disparaissent", voile.voile === "none" && voile.boite === "none", JSON.stringify(voile));
  await p.evaluate(() => { window.EVENEMENT_EN_COURS = null; window.rafraichirVoileTour && window.rafraichirVoileTour(); });
});

// =========================================================================
titre("9. LE CHAT PENDANT LE COMBAT : « COMBAT EN COURS », LE MJ SE TAIT");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.fermerCombat(); window.ouvrirChatbox(); });
  await p.waitForTimeout(200);
  const r = await p.evaluate(async () => {
    const bandeau = document.getElementById("bandeau-combat-chat");
    const saisie = document.getElementById("zone-saisie-chat");
    window.__ajouts = [];
    const d = window.__docs["Systeme_Parties/P1"]; d.Index_Initiative = 0; d.Ordre_Initiative = ["H1"];
    window.PARTIE_DATA.Index_Initiative = 0; window.PARTIE_DATA.Ordre_Initiative = ["H1"];
    document.getElementById("input-chat").value = "Je veux parler !";
    await window.envoyerMessageChat();
    const envoye = (window.__ajouts || []).filter(a => a.col === "Messages_Chat").length;
    const avantMJ = (window.__ajouts || []).length;
    await window.declencherTourIA();
    return { bandeau: !!bandeau && bandeau.style.display === "flex" && /Combat en cours/.test(bandeau.textContent), saisie: saisie.style.display,
             envoye, mjMuet: (window.__ajouts || []).length === avantMJ, bouton: !!(bandeau && bandeau.querySelector(".bandeau-combat-bouton")) };
  });
  verifier("dans le chat : « Combat en cours » à la place de la saisie", r.bandeau && r.saisie === "none", JSON.stringify(r));
  verifier("plus un message ne s'écrit, même à son tour", r.envoye === 0, r.envoye);
  verifier("le MJ se tait jusqu'à la fin du combat", r.mjMuet);
  await p.evaluate(() => document.querySelector("#bandeau-combat-chat .bandeau-combat-bouton").click());
  const rejoint = await p.evaluate(() => document.getElementById("fenetre-combat").style.display);
  verifier("le bandeau mène au combat", r.bouton && rejoint === "block", rejoint);
});

// =========================================================================
titre("10. LA VICTOIRE : LA DERNIÈRE FENÊTRE DE BUTIN, LE RETOUR AU RÉCIT, LE MJ");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.__ajouts = []; });
  const avant = requetes.length;
  // Le combat est gagné, le butin réparti et refermé ; le plateau nettoyé.
  await ecrirePartie({ Fin_Combat: { id: "fin_1", idRencontre, issue: "victoire", ts: Date.now(), participants: ["H1", "H2"], blessures: {} },
                       Butin: { idRencontre, etape: "termine", resolu: true, ouvert: false } });
  await p.waitForTimeout(300);
  const retour = await p.evaluate(() => ({ combat: document.getElementById("fenetre-combat").style.display, chat: document.getElementById("fenetre-chatbox").style.display }));
  verifier("la fenêtre de combat se ferme et le récit revient (le chat)", retour.combat === "none" && retour.chat === "flex", JSON.stringify(retour));
  // (v279 : le récit attend que CHAQUE joueur du combat soit revenu — Lyra aussi.)
  await p.evaluate(() => { const c = window.__docs["Systeme_Parties/P1"].Combat_RP; c.Sortis = Object.assign({}, c.Sortis, { P_02: Date.now() }); });
  await ecrirePartie({ ID_Rencontre: null });
  const fini = await attendreQue(async () => !(await crp()), 10000);
  const narr = requetes.slice(avant).find(x => x.mia === "NARRATEUR");
  const destin = await p.evaluate(() => (window.__ajouts || []).find(a => a.col === "Messages_Chat" && a.data.Auteur_ID === "DESTIN"));
  verifier("un message du Destin, puis le MJ narrateur", !!destin && !!narr, destin && destin.data.Texte);
  verifier("le MJ apprend la victoire et le lieu saccagé (combat à l'intérieur)", !!narr && /REMPORTÉ/.test(narr.systeme) && /SACCAGÉ/.test(narr.systeme), narr ? narr.systeme.split("--- LE COMBAT")[1]?.slice(0, 160) : "");
  verifier("le combat du récit est clos : le chat se rouvre", fini && await p.evaluate(() => document.getElementById("zone-saisie-chat").style.display !== "none"));
  const v = await vtt();
  verifier("l'arène retrouve sa carte, sa grille et ses couches", v.URL_Map === URL_ARENE && JSON.stringify(v.Tuiles_Murs) === '["0,0","1,0"]' && !v.Arene_Sauvegarde, `${v.URL_Map} ${JSON.stringify(v.Tuiles_Murs)}`);
});

// =========================================================================
titre("11. LA DÉFAITE : LES BLESSURES, LA MORT, LA SUITE À INVENTER");
// =========================================================================
await section(async () => {
  const resume = await p.evaluate(() => window.resumeCombatPourMJ({ Lieu: { Titre: "La crypte", Interieur: true }, Ennemis: { Tirage: { depart: [{ nom: "Le Roi-Liche", pnj: "Le Roi-Liche" }], renforts: [{ nom: "Goule" }] } } },
    { issue: "defaite", blessures: { H1: { nom: "Thorin", tirages: [{ id: "BLE_COTES_FELEES", nom: "Côtes fêlées", texte: "La respiration est douloureuse" }] },
                                     H2: { nom: "Lyra", tirages: [{ id: "BLE_MORT", nom: "Mort", texte: "" }] } } }));
  verifier("l'issue : les héros ont perdu", /PERDU/.test(resume), resume.split("\n")[1]);
  verifier("les blessures de chacun, et la mort", /Thorin : Côtes fêlées \(La respiration est douloureuse\)/.test(resume) && /Lyra : MORT/.test(resume), resume.split("\n").filter(l => /^- /.test(l)).slice(0, 2).join(" | "));
  verifier("la consigne : composer avec les blessures, inventer une suite pour les vivants", /invente une suite crédible/.test(resume) && /Ceux qui sont morts ne reviennent pas/.test(resume));
  verifier("à l'intérieur : le lieu saccagé ; les adversaires nommés", /SACCAGÉ/.test(resume) && /Le Roi-Liche \(PNJ nommé\)/.test(resume));
  // Un combat perdu, en vrai : chacun revient quand son « Défaite » s'est refermé.
  await ecrirePartie({ Combat_RP: { Id: "crp_def", Etat: "en_cours", ID_Rencontre: "renc_def", Lieu: { Titre: "La crypte", Interieur: false }, Ennemis: { Tirage: { depart: [{ nom: "Goule" }], renforts: [] } } },
                       ID_Rencontre: "renc_def", Fin_Combat: null, Butin: null });
  await p.evaluate(() => window.rejoindreCombatRP());
  await p.evaluate(() => { window.__ajouts = []; let v = document.getElementById("fin-combat-voile"); if (!v) { v = document.createElement("div"); v.id = "fin-combat-voile"; document.body.appendChild(v); } v.style.display = "flex"; v.innerHTML = "<div>Défaite</div>"; });
  const avant = requetes.length;
  await ecrirePartie({ Fin_Combat: { id: "fin_def", idRencontre: "renc_def", issue: "defaite", ts: Date.now(), blessures: { H1: { nom: "Thorin", tirages: [{ id: "BLE_COTES_FELEES", nom: "Côtes fêlées", texte: "Respiration douloureuse" }] } } } });
  await p.waitForTimeout(2500);
  const encore = await p.evaluate(() => document.getElementById("fenetre-combat").style.display);
  await p.evaluate(() => { const v = document.getElementById("fin-combat-voile"); v.style.display = "none"; v.innerHTML = ""; });
  await p.waitForTimeout(2000);
  const revenu = await p.evaluate(() => document.getElementById("fenetre-combat").style.display);
  verifier("le grand « Défaite » d'abord, puis le retour au récit", encore === "block" && revenu === "none", `${encore} → ${revenu}`);
  await p.evaluate(() => { const c = window.__docs["Systeme_Parties/P1"].Combat_RP; c.Sortis = Object.assign({}, c.Sortis, { P_02: Date.now() }); });
  await ecrirePartie({ ID_Rencontre: null });
  await attendreQue(async () => !(await crp()), 8000);
  const narr = requetes.slice(avant).find(x => x.mia === "NARRATEUR");
  verifier("le MJ apprend la défaite et les blessures de Thorin", !!narr && /PERDU/.test(narr.systeme) && /Côtes fêlées/.test(narr.systeme) && !/SACCAGÉ/.test(narr.systeme), narr ? "" : "aucun narrateur");
  await ecrirePartie({ Fin_Combat: null });
});

// =========================================================================
titre("12. LE RELAIS, LES REPLIS");
// =========================================================================
await section(async () => {
  // La préparation d'un autre poste, muet depuis longtemps : ce poste reprend.
  await p.evaluate(() => { const d = window.__docs["Systeme_Parties/P1"]; delete d.Spawn_Allies; delete d.Spawn_Ennemis; });
  await p.evaluate(() => window.__fauxGemini({ openaiEnPanne: true, peintures: false }));
  await ecrirePartie({ Combat_RP: { Id: "crp_relais", Etat: "preparation", Message: 0, Createur: { id: "P_02:parti", t: Date.now() - 999999 }, Remise: true,
                                    Lieu: { Titre: "Un pont", Description: "Un pont de pierre au-dessus d'un torrent.", Interieur: false } } });
  const repris = await attendreQue(async () => /^P_01:/.test((((await crp()) || {}).Createur || {}).id || ""), 4000);
  verifier("un poste muet depuis trop longtemps : un autre poste qui a les clés reprend", repris, JSON.stringify(((await crp()) || {}).Createur));
  // La carte ne vient pas (OpenAI en panne) : le combat a lieu sur celle de l'arène.
  const carte = await attendreQue(async () => !!((await crp()) || {}).Carte, 8000);
  const c = await crp();
  verifier("sans dessin, la carte de l'arène sert de champ de bataille", carte && c.Carte === URL_ARENE, c && c.Carte);
  // Personne en mode DEV devant la boîte : la grille attend (v279 : pas de
  // minuteur) ; un joueur DEV la valide.
  await p.evaluate(() => { localStorage.setItem("ivalis_DEV_MODE", "off"); window.fermerCombat(); window.poursuivreCombatRP(); });
  await p.waitForTimeout(2500);
  const attend = !((await crp()) || {}).Grille;
  await p.evaluate(() => { localStorage.setItem("ivalis_DEV_MODE", "on"); return window.validerGrilleCombatRP(60); });
  const auto = await attendreQue(async () => !!((await crp()) || {}).Grille, 8000);
  verifier("sans joueur DEV, la grille attend ; un joueur DEV la valide", attend && auto && ((await crp()).Grille || {}).Par === "P_01", JSON.stringify(((await crp()) || {}).Grille));
  await p.evaluate(() => localStorage.setItem("ivalis_DEV_MODE", "off"));
  // Les MIA de peinture muettes : rien n'est peint, les positions sont posées quand même.
  const enCours = await attendreQue(async () => ((await crp()) || {}).Etat === "en_cours", 15000);
  const pt = await partie();
  verifier("les MIA muettes : les repères et les renforts sont posés quand même (repli)", enCours && !!pt.Spawn_Allies && !!pt.Spawn_Ennemis && ((await vtt()).Tuiles_Spawn_Ennemis || []).length > 0,
           JSON.stringify([pt.Spawn_Allies, pt.Spawn_Ennemis, ((await vtt()).Tuiles_Spawn_Ennemis || []).length]));
  await p.evaluate(() => { localStorage.setItem("ivalis_DEV_MODE", "on"); window.__fauxGemini({ openaiEnPanne: false, peintures: true }); });
  // Le combat effacé du plateau (réinitialisé à la main) : le récit reprend sans lui.
  await ecrirePartie({ ID_Rencontre: null });
  await p.waitForTimeout(900);
  await ecrirePartie({});
  const abandonne = await attendreQue(async () => !(await crp()), 4000);
  verifier("un combat effacé du plateau : le combat du récit se clôt", abandonne);
  // Pas de combat : le récit continue.
  await p.evaluate(() => window.__fauxGemini({ verdict: { combat: false, raison: "Une simple discussion." } }));
  await p.evaluate(() => window.declencherTourIA());
  const aucun = await attendreQue(async () => ((await crp()) || {}).Etat === "aucun", 8000);
  verifier("MIA_COMBAT ne voit pas d'agression : rien ne se prépare", aucun && !(await p.evaluate(() => window.combatRPActif())));
});

// =========================================================================
titre("13. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json') || "{}").version;
  verifier("version 278 ou plus (trace_combat.js, version.json)", vTrace >= 278 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const vv = (f) => Number((html.match(new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  verifier("cles_gemini.js et combat_rp.js chargés ; les modules touchés ont changé de version",
           /cles_gemini\.js\?v=\d+/.test(html) && /combat_rp\.js\?v=\d+/.test(html) && vv("ia_master.js") >= 11 && vv("app.js") >= 125 && vv("combat.js") >= 156
           && vv("monstres.js") >= 43 && vv("recit_dynamique.js") >= 5 && vv("style.css") >= 109);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
