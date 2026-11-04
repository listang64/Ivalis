// v309 — LE GRIMOIRE DES RACES DANS LES COMBATS DU RÉCIT.
//
// Nico : « les monstres générés par l'IA combat ne semblent pas suivre les races
// de mon monde : elle m'a créé genre un orc », puis : « le descriptif des races
// est inscrit dans la BDD, et je les rentre dans les Paramètres, onglet Race.
// Récupère l'accès ici. » Les fiches de Monde_Races (Nom, Descriptif_Physique,
// Place_Monde) sont lues à chaque combat ; MIA_ENNEMIS et MIA_BESTIAIRE les
// reçoivent dans « le monde » ; le pion d'un ennemi qui nomme un peuple du
// Grimoire est dessiné avec l'apparence que le Grimoire donne à ce peuple.
//
// Lancer : node tests_monstres/corrections_v309.mjs
// (IVALIS_RACINE=… pour un autre dossier.)
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
  if ((faux.cle2EnPanne && cle === "cle-GEMINI_API_KEY_2") || (faux.cle1EnPanne && cle === "cle-GEMINI_API_KEY")) {
    r.fulfill({ status: 429, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ error: { message: "quota" } }) });
    return;
  }
  let texte = "{}";
  if (mia === "MIA_COMBAT") texte = JSON.stringify(faux.verdict);
  else if (mia === "MIA_CHAMP_DE_BATAILLE") texte = JSON.stringify({ titre: "La cour du temple d'Héra", interieur: true,
      description: "Une cour dallée bordée d'un portique de colonnes au nord ; un bassin sacré au centre ; des gravats au sud-ouest ; une porte de bronze à l'est." });
  else if (mia === "MIA_ENNEMIS" && /habille les créatures/.test(systeme)) {
    const n = (texteU.match(/^\d+\. /gm) || []).length;
    texte = JSON.stringify({ creatures: Array.from({ length: n }, (_, i) => ({ numero: i + 1, nom: ["Chef de clan vargen", "Traqueur vargen", "Hurleur du clan", "Chasseuse vargen", "Brute du clan", "Guetteur vargen", "Pisteur", "Croc-gris"][i % 8] + (i > 7 ? " l'Ancien" : ""), visuel: i === 0 ? "chef" : i % 2 ? "vargen" : "bete", pnj: "" })),
      visuels: [{ cle: "chef", description_physique: "Un Vargen massif, chef de clan, cuirasse de bronze, hache de bronze" },
                { cle: "vargen", description_physique: "Un guerrier vargen au glaive, pagne de cuir" },
                { cle: "bete", description_physique: "Un grand loup gris des steppes" }] });
  } else if (mia === "MIA_ENNEMIS") texte = JSON.stringify({ nombre: faux.nombre,
      ennemis: [{ nom: "Chef de clan vargen", pnj: "", description_physique: "Un Vargen massif, chef de clan" }, { nom: "Traqueur vargen", pnj: "", description_physique: "Un guerrier vargen au glaive" }],
      renforts: [{ nom: "Loup des steppes", description_physique: "Un grand loup gris" }] });
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
  window.__docs["Systeme_Parties/P1"] = { Position_Groupe: { Region: 4 }, Lieu_Actuel: "L_1", Situation: "Dans un lieu", Ordre_Initiative: ["H1", "H2"], Index_Initiative: 999, Tour_Combat: 1, Phase_Combat: "Preparation" };
  window.__docs["Monde_Lieux/L_1"] = { Nom_Lieu: "Le temple d'Héra", Type_Lieu: "Sanctuaire", Description: "Un temple de marbre blanc sur une colline, sa cour dallée, son bassin sacré." };
  window.__docs["Monde_PNJ/PNJ_KORE"] = { Nom_PNJ: "Dame Koré", ID_Lieu: "L_1", Race: "Humain", Occupation: "Grande prêtresse", Statut: "Vivant",
    Description_Physique: "Une prêtresse au visage sévère, cheveux noirs tressés d'or.", URL_Cloudinary: URL_PORTRAIT_KORE };
  window.__docs["Cerveau_IA/INST_55501"] = { ID_Instruction: "INST_55501", Titre_Menu: "Style map crea", Statut_Actif: "on",
    Contenu_Direct: "STYLE DE TEST : carte dessinée à la main à l'encre sur un vieux parchemin, vue de dessus absolue." };
  window.__docs["Cerveau_IA/INST_10895"] = { Titre_Menu: "MJ", Contenu_Direct: "Tu es le Maître du Jeu de test." };
  window.__docs["Combat_VTT/P1"] = { URL_Map: URL_ARENE, Taille_Hex: 60, Opacite_Grille: 0.8, Tuiles_Murs: ["0,0", "1,0"], Tuiles_Supprimees: ["5,5"], Tuiles_Difficiles: [], Tuiles_Spawn_Ennemis: ["2,2"], Tokens: {} };
  // LE GRIMOIRE DES RACES (Paramètres → Races) : deux fiches, dont une race
  // inventée pour le banc, qui n'existe que dans la base.
  window.__docs["Monde_Races/R_VARGEN"] = { Nom: "Vargen", Descriptif_Physique: "Humanoïdes lupins de deux mètres, pelage gris cendré, museau de loup, yeux ambrés, oreilles pointues tatouées de runes rouges.",
    Place_Monde: "Clans nomades des steppes du nord, ennemis jurés du Concordia d'Arcaï." };
  window.__docs["Monde_Races/R_SYLVAIN"] = { Nom: "Sylvaride", Descriptif_Physique: "Peau d'écorce fendillée, cheveux de lichen vert, yeux sans pupille couleur de sève.", Place_Monde: "" };
  window.__docs["Monde_Races/R_VIDE"] = { Nom: "", Descriptif_Physique: "fiche vide, à ignorer" };
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
  window.__docs["Messages_Chat/c99"] = { ID_Partie: "P1", Auteur_ID: "H1", Auteur_Nom: "Thorin", Texte: "Je brandis ma hache et je frappe le chef du clan vargen !", Timestamp: t0 + 50000 };
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
titre("1. LE MONDE SANS LE GRIMOIRE : LES PEUPLES ÉCRITS DANS lore_ivalis.js");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => { const sauve = window.RACES_MONDE; window.RACES_MONDE = undefined;
    const m = window.contexteEnnemisIvalis(4); window.RACES_MONDE = sauve; return m; });
  verifier("sans fiche lue, les peuples d'Elyria écrits dans le code restent la liste", /- Vargens : peuple bestial/.test(r) && /- Ankylars :/.test(r), r.slice(0, 80));
});

// =========================================================================
titre("2. LA LECTURE DU GRIMOIRE DES RACES (Monde_Races)");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => {
    const races = typeof window.chargerRacesDuMonde === "function" ? await window.chargerRacesDuMonde() : null;
    const monde = window.contexteEnnemisIvalis(4);
    return { races, monde, nommees: typeof window.racesNommeesDans === "function" ? {
      vargen: window.racesNommeesDans("Un guerrier vargen au glaive").map(x => x.nom),
      pluriel: window.racesNommeesDans("Trois Vargens hurlent").map(x => x.nom),
      sylvaride: window.racesNommeesDans("Une sylvaride armée d'un arc").map(x => x.nom),
      gobelin: window.racesNommeesDans("Un gobelin, un orc").map(x => x.nom),
      rien: window.racesNommeesDans("Un grand loup gris").map(x => x.nom) } : null };
  });
  verifier("window.chargerRacesDuMonde lit les fiches nommées de Monde_Races", Array.isArray(r.races) && r.races.length === 2 && r.races.map(x => x.Nom).sort().join(",") === "Sylvaride,Vargen", JSON.stringify(r.races && r.races.map(x => x.Nom)));
  verifier("le monde donné aux IA : l'APPARENCE du Grimoire pour le Vargen", /- Vargen : APPARENCE : Humanoïdes lupins de deux mètres, pelage gris cendré/.test(r.monde));
  verifier("… et sa PLACE DANS LE MONDE", /PLACE DANS LE MONDE : Clans nomades des steppes du nord/.test(r.monde));
  verifier("le Vargen n'apparaît qu'une fois (la fiche remplace le texte écrit « Vargens »)", (r.monde.match(/- Vargens? :/g) || []).length === 1 && !/peuple bestial et puissant/.test(r.monde), (r.monde.match(/- Vargens? :/g) || []).join(" "));
  verifier("une race qui n'existe que dans le Grimoire est un peuple du monde", /- Sylvaride : APPARENCE : Peau d'écorce fendillée/.test(r.monde));
  verifier("les peuples pas encore dans le Grimoire gardent leur texte (Ankylars, Gobs…)", /- Ankylars : humanoïdes reptiliens/.test(r.monde) && /- Gobs :/.test(r.monde));
  verifier("l'interdit demeure : jamais d'orc, d'elfe, de nain, de gobelin…", /jamais d'orc/.test(r.monde) && /de gobelin, de troll/.test(r.monde));
  verifier("la fiche sans nom est ignorée", !/fiche vide/.test(r.monde));
  const n = r.nommees || {};
  verifier("un texte qui nomme un peuple du Grimoire le retrouve (vargen, Vargens, sylvaride)",
           JSON.stringify(n.vargen) === '["Vargen"]' && JSON.stringify(n.pluriel) === '["Vargen"]' && JSON.stringify(n.sylvaride) === '["Sylvaride"]', JSON.stringify(n));
  verifier("… mais pas « gobelin » ni une bête sans peuple", JSON.stringify(n.gobelin) === "[]" && JSON.stringify(n.rien) === "[]", JSON.stringify(n));
});

// =========================================================================
titre("3. UN COMBAT DU RÉCIT : MIA_ENNEMIS ET LES PIONS SUIVENT LE GRIMOIRE");
// =========================================================================
await section(async () => {
  // Une race modifiée dans les Paramètres compte au combat suivant.
  await p.evaluate(() => { window.__docs["Monde_Races/R_VARGEN"].Descriptif_Physique += " Crinière tressée d'os."; });
  const avant = requetes.length, avantImg = openai.length;
  const ok = await p.evaluate(() => window.forcerCombatRP());
  // (v313 : les ennemis composés attendent qu'un joueur les valide)
  await attendreQue(async () => { const c = await crp(); return !!c && !!c.Ennemis; }, 20000);
  await p.evaluate(() => window.validerEnnemisCombatRP());
  const pret = await attendreQue(async () => { const c = await crp(); return !!c && !!c.Ennemis && c.Tokens && Object.keys(c.Ennemis.Visuels || {}).every(k => c.Tokens[k] !== undefined); }, 20000);
  const reqs = requetes.slice(avant).filter(x => x.mia === "MIA_ENNEMIS");
  verifier("le combat se prépare jusqu'aux pions", ok && pret, `${ok} ${pret}`);
  verifier("MIA_ENNEMIS (le récit, puis l'habillage) reçoit l'apparence du Grimoire, relue à ce combat",
           reqs.length === 2 && reqs.every(x => /- Vargen : APPARENCE : Humanoïdes lupins[^\n]*Crinière tressée d'os/.test(x.texte)), `${reqs.length} appel(s)`);
  verifier("sa consigne : une description qui suit fidèlement l'apparence du peuple",
           reqs.length === 2 && reqs.every(x => /L'APPARENCE D'UN PEUPLE \(v309\)/.test(x.systeme)));
  const pions = openai.slice(avantImg).filter(x => /medallion/.test(x.prompt));
  const chef = pions.find(x => /Vargen massif/.test(x.prompt)), guerrier = pions.find(x => /guerrier vargen/.test(x.prompt)), loup = pions.find(x => /grand loup gris des steppes/.test(x.prompt));
  verifier("le pion du chef vargen : sa description + l'apparence d'un Vargen selon le Grimoire",
           !!chef && /What a Vargen looks like in this world: Humanoïdes lupins de deux mètres[^)]*Crinière tressée d'os/.test(chef.prompt), chef ? chef.prompt.slice(0, 120) : `${pions.length} pion(s)`);
  verifier("… le guerrier vargen aussi", !!guerrier && /What a Vargen looks like in this world/.test(guerrier.prompt));
  verifier("le loup (aucun peuple nommé) : sa description seule", !!loup && !/looks like in this world/.test(loup.prompt), pions.map(x => x.prompt.slice(0, 200)).join(" || "));
  verifier("le dessin garde l'interdit : jamais d'orc", !!chef && /never draw an orc/.test(chef.prompt));
});

// =========================================================================
titre("4. LES NOMS DU BESTIAIRE (monstres.js) LISENT AUSSI LE GRIMOIRE");
// =========================================================================
await section(async () => {
  const m = lire('monstres.js');
  const i = m.indexOf('window.nommerMonstresIA'), j = m.indexOf('contexteEnnemisIvalis(region)', i);
  verifier("window.nommerMonstresIA relit le Grimoire avant de composer le monde", i > 0 && j > i && m.slice(i, j).includes('await window.chargerRacesDuMonde()'));
});

// =========================================================================
titre("5. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json') || "{}").version;
  verifier("version 309 ou plus (trace_combat.js, version.json)", vTrace >= 309 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const vv = (f) => Number((html.match(new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  verifier("lore_ivalis.js, combat_rp.js, monstres.js, trace_combat.js ont changé de version",
           vv("lore_ivalis.js") >= 4 && vv("combat_rp.js") >= 6 && vv("monstres.js") >= 45 && vv("trace_combat.js") >= 214);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
