// v279 — LE RÉCIT NE REPREND QUE QUAND CHACUN EST REVENU ; LA GRILLE SANS
// MINUTEUR ; LES NUAGES RÉALISTES.
//
// Nico : « le RP ne reprend pas au bout de 60 s : il faut que chacun quitte la
// fenêtre butin, sinon ça reste sur pause » ; « pareil pour le mode dev pour
// régler la grille, pas de timer » ; « quand je clique sur une région je n'ai
// pas l'animation avec les nuages » ; « sur les cartes régionales les nuages
// sont très moches… refais ça de zéro et fais des tests, je veux que ce soit
// réaliste » ; « pas des nuages en masse opaque : différents contrastes à
// l'intérieur, des nuages dispersés sur les bords et pas de bord net » ;
// « quitte à voir par endroits la map en dessous, ce n'est pas bien grave ».
//
// Sur la VRAIE page (faux Firestore, IA simulées), les nuages calculés en
// WebGL (le navigateur des bancs a une carte graphique logicielle). Se charge
// sur l'ancien code (IVALIS_RACINE) : il y échoue, sans planter.
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
const MONDE = `<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2160"><rect width="3840" height="2160" fill="#4f7a9a"/><path d="M600 500 C1200 300 2200 400 3000 800 C3400 1300 2800 1900 1900 1800 C1000 1750 300 1300 600 500Z" fill="#b9a46a"/></svg>`;
const REGION = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1500"><rect width="2400" height="1500" fill="#5f8a3f"/>${Array.from({length:60},(_,i)=>`<circle cx="${(i*397)%2400}" cy="${(i*263)%1500}" r="${30+(i*17)%60}" fill="#244a1c" opacity="0.8"/>`).join("")}<path d="M0 1100 C600 1000 1200 1250 2400 1050" stroke="#3b6fa0" stroke-width="40" fill="none"/></svg>`;
const URL_ARENE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1789076932/arene_s5qs3e.png";
const URL_PORTRAIT_KORE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1/PNJ/portrait_kore.png";

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const ctxN = await b.newContext({ viewport: { width: 1194, height: 834 }, reducedMotion: 'reduce' });
const p = await ctxN.newPage();
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => {
  const u = r.request().url();
  const corps = /map_wx8s89/.test(u) ? MONDE : /IMG_1[89]|IMG_2189/.test(u) ? REGION : /Combats\/Cartes|carte_combat/.test(u) ? CARTE : /arene/.test(u) ? ARENE : /portrait|PNJ/.test(u) ? PORTRAIT : PION;
  r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'}, body: corps });
});

// GEMINI SIMULÉ, reconnu à la consigne de chaque MIA.
const requetes = [], openai = [], cloudinary = [];
const faux = { verdict: { combat: true, raison: "Les gardes de Dame Koré tirent leurs lances sur les héros.", adversaires: "Dame Koré et ses gardes" },
               cle2EnPanne: false, peintures: true, nombre: 2 };
await p.exposeFunction('__fauxGemini', (o) => Object.assign(faux, o));
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
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
  else if (mia === "MIA_PEINTURE_MURS") texte = JSON.stringify({ cases: faux.peintures ? [1, 2, 3, 999] : [] });
  else if (mia === "MIA_PEINTURE_INACCESSIBLE") texte = JSON.stringify({ cases: faux.peintures ? [3, 10, 11] : [] });
  else if (mia === "MIA_PEINTURE_DIFFICILE") texte = JSON.stringify({ cases: faux.peintures ? [20, 21] : [] });
  else if (mia === "MIA_SPAWN") texte = JSON.stringify(faux.peintures ? { heros: 30, ennemis: 45, renforts: [2, 50, 60], raison: "Face à face dans la cour." } : {});
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
  Object.assign(window.REGLAGES_COMBAT_RP || {}, { battementMs: 400, relaisMs: 1500, regleurFraisMs: 4000,
    attenteVerdictMs: 1500, narrationApresMs: { victoire: 50, defaite: 50 }, abandonMs: 400 });
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
titre("1. LA VICTOIRE : LE RÉCIT ATTEND QUE CHACUN AIT QUITTÉ LE BUTIN");
// =========================================================================
const etatEnCours = (id, extra = {}) => ({ Id: id, Etat: "en_cours", ID_Rencontre: "renc_" + id, Message: 0, Createur: { id: "P_09:x", t: Date.now() },
  Lieu: { Titre: "La cour", Description: "Une cour.", Interieur: false }, Ennemis: { Apparition: 1, Tirage: { depart: [{ nom: "Garde" }], renforts: [] }, Visuels: {} }, ...extra });
await section(async () => {
  await p.evaluate(() => { window.__ajouts = []; });
  const avant = requetes.length;
  await ecrirePartie({ Combat_RP: etatEnCours("v1"), ID_Rencontre: "renc_v1",
    Fin_Combat: { id: "f1", idRencontre: "renc_v1", issue: "victoire", ts: Date.now(), participants: ["H1", "H2"], blessures: {} },
    Butin: { idRencontre: "renc_v1", etape: "termine", resolu: true, ouvert: true, pool: [] } });
  await p.evaluate(() => { window.rejoindreCombatRP(); const f = document.getElementById("fenetre-butin"); if (f) f.style.display = "flex"; });
  // Nico quitte sa dernière fenêtre de butin (la croix).
  await p.evaluate(() => window.fermerButinLocalement());
  await p.waitForTimeout(400);
  const r1 = await p.evaluate(() => ({ combat: document.getElementById("fenetre-combat").style.display, chat: document.getElementById("fenetre-chatbox").style.display,
    sortis: Object.keys((window.__docs["Systeme_Parties/P1"].Combat_RP || {}).Sortis || {}), etat: (window.__docs["Systeme_Parties/P1"].Combat_RP || {}).Etat,
    ouvert: window.__docs["Systeme_Parties/P1"].Butin.ouvert, attendus: window.joueursAttendusCombatRP ? window.joueursAttendusCombatRP(window.__docs["Systeme_Parties/P1"].Fin_Combat) : null }));
  verifier("Nico quitte sa fenêtre de butin : il revient au récit, et le dit", r1.combat === "none" && r1.chat === "flex" && JSON.stringify(r1.sortis) === '["P_01"]', JSON.stringify(r1));
  verifier("les joueurs attendus : ceux des héros du combat (Nico, Ben)", JSON.stringify(r1.attendus) === '["P_01","P_02"]', JSON.stringify(r1.attendus));
  verifier("Ben n'a pas quitté le sien : le récit reste en pause, le butin reste ouvert pour lui", r1.etat === "en_cours" && r1.ouvert === true, `${r1.etat} / ${r1.ouvert}`);
  // Plus de minuteur : 3 s plus tard (le minuteur d'avant était réglé ici sur 600 s, il n'existe plus du tout).
  const sansMinuteur = await p.evaluate(() => !("butinOublieMs" in (window.REGLAGES_COMBAT_RP || {})) && !("grilleSansRegleurMs" in (window.REGLAGES_COMBAT_RP || {})));
  await p.waitForTimeout(3000);
  const r2 = await p.evaluate(() => ({ etat: (window.__docs["Systeme_Parties/P1"].Combat_RP || {}).Etat, ouvert: window.__docs["Systeme_Parties/P1"].Butin.ouvert,
    destin: (window.__ajouts || []).some(a => a.data.Auteur_ID === "DESTIN") }));
  verifier("aucun minuteur ne referme le butin ni ne relance le récit", sansMinuteur && r2.etat === "en_cours" && r2.ouvert === true && !r2.destin, JSON.stringify(r2));
  verifier("le MJ ne parle pas encore", !requetes.slice(avant).some(x => x.mia === "NARRATEUR"));
  // « Fermer », dans un combat du récit, ne referme que pour soi.
  const fermer = await p.evaluate(async () => { const d = window.__docs["Systeme_Parties/P1"]; await window.fermerFenetreButin(); return d.Butin.ouvert; });
  verifier("« Fermer » ne referme le butin que pour soi", fermer === true, String(fermer));
  // Ben quitte le sien (depuis son poste).
  await p.evaluate(() => { const c = window.__docs["Systeme_Parties/P1"].Combat_RP; c.Sortis = Object.assign({}, c.Sortis, { P_02: Date.now() }); });
  await ecrirePartie({ ID_Rencontre: null });
  const fini = await attendreQue(async () => !(await crp()), 10000);
  const r3 = await p.evaluate(() => ({ destin: (window.__ajouts || []).find(a => a.data.Auteur_ID === "DESTIN"), ouvert: window.__docs["Systeme_Parties/P1"].Butin.ouvert }));
  const narr = requetes.slice(avant).find(x => x.mia === "NARRATEUR");
  verifier("tous revenus : le Destin, puis le MJ raconte la victoire", fini && !!r3.destin && !!narr && /REMPORTÉ/.test(narr.systeme), r3.destin && r3.destin.data.Texte);
  verifier("le butin se referme alors pour de bon", r3.ouvert === false, String(r3.ouvert));
});

// =========================================================================
titre("2. LA DÉFAITE : PAREIL, LE RÉCIT ATTEND TOUT LE MONDE");
// =========================================================================
await section(async () => {
  const avant = requetes.length;
  await ecrirePartie({ Combat_RP: etatEnCours("d1"), ID_Rencontre: "renc_d1", Butin: null,
    Fin_Combat: { id: "f2", idRencontre: "renc_d1", issue: "defaite", ts: Date.now(), participants: ["H1", "H2"], blessures: {} } });
  await p.evaluate(() => window.rejoindreCombatRP());
  await p.waitForTimeout(5000);
  const r1 = await p.evaluate(() => ({ combat: document.getElementById("fenetre-combat").style.display, etat: (window.__docs["Systeme_Parties/P1"].Combat_RP || {}).Etat,
    sortis: Object.keys((window.__docs["Systeme_Parties/P1"].Combat_RP || {}).Sortis || {}) }));
  verifier("Nico revient après son « Défaite » ; Ben pas encore : pause", r1.combat === "none" && r1.etat === "en_cours" && JSON.stringify(r1.sortis) === '["P_01"]', JSON.stringify(r1));
  verifier("le MJ ne parle pas", !requetes.slice(avant).some(x => x.mia === "NARRATEUR"));
  await p.evaluate(() => { const c = window.__docs["Systeme_Parties/P1"].Combat_RP; c.Sortis = Object.assign({}, c.Sortis, { P_02: Date.now() }); });
  await ecrirePartie({ ID_Rencontre: null });
  const fini = await attendreQue(async () => !(await crp()), 10000);
  const narr = requetes.slice(avant).find(x => x.mia === "NARRATEUR");
  verifier("Ben revenu : le MJ raconte la défaite", fini && !!narr && /PERDU/.test(narr.systeme));
  await ecrirePartie({ Fin_Combat: null });
});

// =========================================================================
titre("3. LA GRILLE : PAS DE MINUTEUR, ELLE ATTEND UN JOUEUR EN MODE DEV");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { localStorage.setItem("ivalis_DEV_MODE", "off"); window.fermerCombat && window.fermerCombat(); });
  await p.evaluate(() => window.forcerCombatRP());
  const carte = await attendreQue(async () => !!((await crp()) || {}).Carte, 15000);
  await p.waitForTimeout(4000);
  const r = await p.evaluate(() => ({ grille: !!(window.__docs["Systeme_Parties/P1"].Combat_RP || {}).Grille, etat: (window.__docs["Systeme_Parties/P1"].Combat_RP || {}).Etat }));
  verifier("la carte est prête, personne en mode DEV : la grille attend (pas de validation seule)", carte && !r.grille && r.etat === "preparation", JSON.stringify(r));
  await p.evaluate(() => { localStorage.setItem("ivalis_DEV_MODE", "on"); window.rejoindreCombatRP(); });
  await p.waitForTimeout(400);
  const boite = await p.evaluate(() => (document.getElementById("boite-grille-rp") || {}).style?.display);
  verifier("un joueur passe en mode DEV : la boîte s'ouvre pour lui", boite === "flex", boite);
  await p.evaluate(() => document.getElementById("boite-grille-valider").click());
  const suite = await attendreQue(async () => ((await crp()) || {}).Etat === "en_cours", 20000);
  verifier("il valide : la préparation reprend jusqu'au combat", suite);
  await p.evaluate(() => window.abandonnerCombatRP());
  await attendreQue(async () => !(await crp()), 8000);
  await p.evaluate(() => { window.fermerCombat && window.fermerCombat(); window.fermerToutesLesFenetres && window.fermerToutesLesFenetres(); });
});

// =========================================================================
titre("4. LA ZONE DES NUAGES : UNE DISTANCE AU BORD, PAS UN FLOU");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const N = window.NuagesRealistes;
    const col = 120, lig = 80, g = new Uint8Array(col * lig);
    for (let l = 10; l < 70; l++) for (let k = 10; k < 60; k++) g[l * col + k] = 1;       // un grand carré
    for (let l = 40; l < 43; l++) for (let k = 70; k < 115; k++) g[l * col + k] = 1;      // un trait de 3 cases
    const z = N.zoneDouce(g, col, lig, 18);
    const v = (k, l) => z[l * col + k];
    return { coeur: v(35, 40), bord: v(10, 40), dehors: v(2, 5), loin: v(90, 10), trait: v(90, 41), juste: v(8, 40), dehors20: v(85, 70) };
  });
  verifier("au cœur de la zone : 1 ; loin dehors : 0", r.coeur === 1 && r.loin === 0, JSON.stringify(r));
  verifier("au bord : 0,5 ; la bande s'étend des deux côtés (pas de bord net)", Math.abs(r.bord - 0.5) < 0.05 && r.juste > 0.35 && r.juste < 0.5, `${r.bord.toFixed(2)} / ${r.juste.toFixed(2)}`);
  verifier("un trait fin peint reste une zone de nuages (un flou l'aurait effacé)", r.trait > 0.5, r.trait.toFixed(2));
});

// =========================================================================
titre("5. LES NUAGES D'UNE CARTE RÉGIONALE : RÉALISTES, PAS UNE MASSE");
// =========================================================================
// La carte 1 (2400 × 1500, grille 240 × 150) : une grande zone peinte à gauche.
const ZONE = { k0: 30, k1: 120, l0: 25, l1: 125 };
await p.evaluate(({ ZONE }) => {
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => e.style.display = e.id === "ecran-jeu" ? "block" : "none");
  window.fermerToutesLesFenetres && window.fermerToutesLesFenetres();
  window.recadrerCarte && window.recadrerCarte();
  window.appliquerRegionsDeLaBase && window.appliquerRegionsDeLaBase({ Prochain_Numero: 14, Regions: { 1: { Numero: 1, Points: [{x:850,y:620},{x:1450,y:620},{x:1450,y:1080},{x:850,y:1080}] } } });
  const col = 240, lig = 150, g = new Uint8Array(col * lig);
  for (let l = ZONE.l0; l < ZONE.l1; l++) for (let k = ZONE.k0; k < ZONE.k1; k++) g[l * col + k] = 1;
  if (window.CARTES_REGIONALES && window.CARTES_REGIONALES[1]) window.CARTES_REGIONALES[1].nuages = { colonnes: col, lignes: lig, cases: window.encoderGrilleNuages(g) };
}, { ZONE });
await section(async () => {
  await p.evaluate(() => window.ouvrirCarteRegionale(1, { sansTransition: true }));
  await p.waitForTimeout(800);
  // L'écran : la carte (2400 × 1500) calée sur 834 px de haut — une case = 834/150 px.
  const geo = await p.evaluate(() => { const c = window.cadrageCarteRegion(); return { panX: c.panX, panY: c.panY, z: c.zoom }; });
  const ecranDe = (k, l) => ({ x: geo.panX + k * 10 * geo.z, y: geo.panY + l * 10 * geo.z });
  const a = ecranDe(55, 50), b = ecranDe(95, 100);       // le cœur de la zone
  const lecture = (x0, y0, x1, y1, t) => p.evaluate(({ x0, y0, x1, y1, t }) => { const r = window.pixelsNuagesEcran(x0, y0, x1, y1, t); return r ? { l: r.largeur, h: r.hauteur, d: Array.from(r.data) } : null; }, { x0, y0, x1, y1, t });
  const coeur = await lecture(a.x, a.y, b.x, b.y, 40);
  const stats = (r) => {
    let n = 0, somme = 0, minces = 0, epais = 0; const lum = [];
    for (let i = 0; i < r.d.length; i += 4) {
      const al = r.d[i + 3] / 255; n++; somme += al;
      if (al < 0.5) minces++;
      if (al > 0.8) { epais++; lum.push((r.d[i] + r.d[i + 1] + r.d[i + 2]) / 3 / al); }
    }
    const moy = lum.reduce((s, x) => s + x, 0) / Math.max(1, lum.length);
    const ecart = Math.sqrt(lum.reduce((s, x) => s + (x - moy) * (x - moy), 0) / Math.max(1, lum.length));
    return { alpha: somme / n, minces: minces / n, epais: epais / n, lumiere: moy, contraste: ecart };
  };
  const s1 = coeur && stats(coeur);
  verifier("le moteur WebGL dessine les nuages de la carte", !!coeur, coeur ? `${coeur.l}×${coeur.h}` : "aucune lecture");
  verifier("au cœur : bien couvert, mais PAS une masse opaque (des endroits minces, la carte transparaît)",
           !!s1 && s1.alpha > 0.45 && s1.alpha < 0.95 && s1.minces > 0.05 && s1.epais > 0.25, JSON.stringify(s1 && { alpha: s1.alpha.toFixed(2), minces: s1.minces.toFixed(2), epais: s1.epais.toFixed(2) }));
  verifier("du contraste à l'intérieur (sommets clairs, creux gris-bleu)", !!s1 && s1.contraste > 10, s1 && `écart-type ${s1.contraste.toFixed(1)}`);
  // Les couleurs : blanc-gris, jamais beige.
  const couleur = (r) => { let R = 0, G = 0, B = 0, n = 0; for (let i = 0; i < r.d.length; i += 4) { const al = r.d[i + 3]; if (al < 200) continue; R += r.d[i] / al * 255; G += r.d[i + 1] / al * 255; B += r.d[i + 2] / al * 255; n++; } return n ? [R / n, G / n, B / n].map(Math.round) : null; };
  const c1 = coeur && couleur(coeur);
  verifier("blanc et gris-bleu, jamais beige (le bleu tient le rouge)", !!c1 && c1[2] >= c1[0] - 10 && c1[0] > 160, JSON.stringify(c1));
  // Les bords : un profil horizontal qui traverse le bord droit de la zone (k = 120).
  const g0 = ecranDe(96, 40), g1 = ecranDe(144, 110);
  const bord = await lecture(g0.x, g0.y, g1.x, g1.y, 40);
  const colonnes = []; if (bord) for (let x = 0; x < bord.l; x++) { let s = 0; for (let y = 0; y < bord.h; y++) s += bord.d[(y * bord.l + x) * 4 + 3]; colonnes.push(s / bord.h / 255); }
  const saut = colonnes.slice(1).reduce((m, v, i) => Math.max(m, Math.abs(v - colonnes[i])), 0);
  const tiers = (i) => { const n = colonnes.length; const t = colonnes.slice(Math.floor(i * n / 3), Math.floor((i + 1) * n / 3)); return t.reduce((s, x) => s + x, 0) / Math.max(1, t.length); };
  verifier("pas de bord net : la couverture décroît par degrés en traversant le bord", colonnes.length > 20 && saut < 0.12 && tiers(0) > tiers(1) && tiers(1) > tiers(2),
           `saut max ${saut.toFixed(3)}, tiers ${[0, 1, 2].map(i => tiers(i).toFixed(2)).join(" > ")}`);
  // Au-delà du bord : des nuages dispersés (des amas séparés, pas une frange continue).
  const h0 = ecranDe(122, 30), h1 = ecranDe(134, 120);
  const dehors = await lecture(h0.x, h0.y, h1.x, h1.y, 40);
  let presents = 0, total = 0, changements = 0;
  if (dehors) for (let y = 0; y < dehors.h; y += 2) { let avant = null; for (let x = 0; x < dehors.l; x++) { const al = dehors.d[(y * dehors.l + x) * 4 + 3] / 255, nuage = al > 0.3 && dehors.d[(y * dehors.l + x) * 4] > 40; total++; if (nuage) presents++; if (avant !== null && nuage !== avant) changements++; avant = nuage; } }
  verifier("juste au-delà du bord : des nuages dispersés (ni rien, ni un mur)", total > 0 && presents / total > 0.02 && presents / total < 0.6, `${(presents / Math.max(1, total) * 100).toFixed(0)} % de nuages`);
  // Loin de la zone : rien (seule une ombre peut tomber près des nuages).
  const l0 = ecranDe(200, 100), l1 = ecranDe(230, 140);
  const loin = await lecture(l0.x, l0.y, l1.x, l1.y, 40);
  let loinNuages = 0; if (loin) for (let i = 0; i < loin.d.length; i += 4) if (loin.d[i + 3] > 10 && loin.d[i] > 30) loinNuages++;
  verifier("loin des zones peintes : aucun nuage", !!loin && loinNuages === 0, `${loinNuages}`);
  // L'ANIMATION : fluide d'une image à l'autre, et la matière dérive au vent.
  const im1 = await lecture(a.x, a.y, b.x, b.y, 40), im2 = await lecture(a.x, a.y, b.x, b.y, 40.04), im3 = await lecture(a.x, a.y, b.x, b.y, 48);
  const diff = (u, v) => u.d.reduce((s, x, i) => s + Math.abs(x - v.d[i]), 0) / u.d.length;
  const dPas = diff(im1, im2), dLoin = diff(im1, im3);
  verifier("d'une image à la suivante : presque rien ne change (pas de saut, pas de clignotement)", dPas < 1.5, dPas.toFixed(2));
  verifier("en huit secondes : les nuages ont dérivé", dLoin > 6, dLoin.toFixed(2));
  const s3 = stats(im3);
  verifier("la zone reste couverte autant (le vent déplace, il ne vide pas)", Math.abs(s3.alpha - s1.alpha) < 0.15, `${s1.alpha.toFixed(2)} → ${s3.alpha.toFixed(2)}`);
  await p.screenshot({ path: '/tmp/claude-0/-home-user-Ivalis/3718c626-55b5-577c-9b4f-a49012fd3784/scratchpad/v279_carte_nuages.png' }).catch(() => {});
  // LE ZOOM : la toile suit la partie visible, à la résolution de l'écran ; le grain fin vient.
  await p.evaluate(() => window.zoomerCarteRegion(3, 300, 420));
  await p.waitForTimeout(300);
  const z = await p.evaluate(() => { window.dessinerNuagesRegionMaintenant(40); const t = document.getElementById("carte-region-nuages"), c = window.cadrageCarteRegion();
    return { styleL: parseFloat(t.style.width), visible: 1194 / c.zoom, pixels: t.width * t.height, ecran: t.width / (parseFloat(t.style.width) * c.zoom) }; });
  verifier("zoomée ×3 : la toile ne couvre que ce qu'on voit (plus une marge), nette à l'écran",
           z.styleL < z.visible * 1.3 && z.styleL > z.visible * 0.9 && z.pixels <= 900000 && z.ecran > 0.5, JSON.stringify(z));
  await p.evaluate(() => window.zoomerCarteRegion(1 / 3, 300, 420));
  // L'ordre des calques : le titre et la peinture DEV au-dessus des nuages.
  const ordre = await p.evaluate(() => [...document.getElementById("carte-region").children].map(e => e.id));
  verifier("le titre reste au-dessus des nuages", ordre.indexOf("carte-region-nuages") < ordre.indexOf("carte-region-titre"), ordre.join(","));
  await p.evaluate(() => window.fermerCarteRegionale({ sansTransition: true }));
});

// =========================================================================
titre("6. LA TRAVERSÉE : JOUÉE MÊME QUAND L'IPAD DEMANDE DE RÉDUIRE LES ANIMATIONS");
// =========================================================================
await section(async () => {
  const reduit = await p.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  // L'horloge du navigateur à la main : la traversée est lue image par image,
  // aux vrais instants, quelle que soit la vitesse de la machine du banc.
  await p.clock.install();
  await p.clock.pauseAt(new Date(Date.now() + 2000));
  await p.evaluate(() => {
    window.__sonde = []; window.__sondeActive = true;
    const pas = () => { if (!window.__sondeActive) return;
      const s = window.SONDE_TRAVERSEE; const t = document.getElementById("traversee-nuages");
      window.__sonde.push({ t: performance.now(), phase: s && s.phase, couverture: s ? s.couverture : null, voile: s ? s.voile : null, toile: !!t, gl: !!(t && t.__gl !== false && t.getContext && t.width > 0), ouverte: window.carteRegionaleOuverte(), bouton: (document.getElementById("btn-retour-monde") || {}).style ? document.getElementById("btn-retour-monde").style.display : null });
      requestAnimationFrame(pas); };
    requestAnimationFrame(pas);
    window.surClicRegion(1);
  });
  for (let t = 100; t <= 5000; t += 100) {
    await p.clock.runFor(100);
    if (t === 900) await p.screenshot({ path: '/tmp/claude-0/-home-user-Ivalis/3718c626-55b5-577c-9b4f-a49012fd3784/scratchpad/v279_traversee.png' }).catch(() => {});
  }
  await p.clock.resume();
  await p.waitForFunction(() => window.carteRegionaleOuverte() === 1 && !window.TRAVERSEE_EN_COURS, null, { timeout: 15000 }).catch(() => null);
  await p.waitForTimeout(300);
  const s = await p.evaluate(() => { window.__sondeActive = false; return window.__sonde; });
  const phases = [...new Set(s.filter(x => x.phase).map(x => x.phase))];
  const avecToile = s.filter(x => x.toile).length;
  const plein = s.findIndex(x => x.voile >= 0.999);
  const premiere = s.findIndex(x => x.ouverte === 1);
  const entree = s.filter(x => x.phase === "entree").map(x => x.couverture);
  const sortie = s.filter(x => x.phase === "sortie").map(x => x.couverture);
  const monte = entree.every((v, i) => i === 0 || v >= entree[i - 1] - 1e-6), descend = sortie.every((v, i) => i === 0 || v <= sortie[i - 1] + 1e-6);
  verifier("le navigateur demande de réduire les animations (comme l'iPad)", reduit === true);
  verifier("la traversée se joue quand même : entrée, cœur, sortie", JSON.stringify(phases) === '["entree","coeur","sortie"]' && avecToile > 60, `${phases.join(",")} (${avecToile} images)`);
  verifier("les nuages s'épaississent, couvrent l'écran, puis se dissipent", monte && descend && plein >= 0 && entree.length > 30 && sortie.length > 30, `${entree.length} / ${sortie.length}`);
  verifier("la carte régionale prend la place sous l'écran couvert", premiere >= 0 && plein >= 0 && premiere >= plein && s[premiere].voile >= 0.999, `plein ${plein}, région ${premiere}`);
  const boutonPendant = s.filter(x => x.toile && x.bouton === "flex").length;
  const boutonFin = await p.evaluate(() => document.getElementById("btn-retour-monde").style.display);
  verifier("le bouton de retour ne flotte pas sur les nuages : il vient une fois la traversée finie", boutonPendant === 0 && avecToile > 0 && boutonFin === "flex", `${boutonPendant} image(s) pendant, « ${boutonFin} » à la fin`);
  const fin = await p.evaluate(() => ({ toile: !!document.getElementById("traversee-nuages"), en: window.TRAVERSEE_EN_COURS }));
  verifier("à la fin, la toile s'en va", !fin.toile && fin.en === false);
  await p.evaluate(() => window.fermerCarteRegionale({ sansTransition: true }));
});

// =========================================================================
titre("7. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json') || "{}").version;
  verifier("version 279 ou plus (trace_combat.js, version.json)", vTrace >= 279 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const vv = (f) => Number((html.match(new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  verifier("nuages_realistes.js chargé avant cartes_regionales.js ; les modules touchés ont changé de version",
           /nuages_realistes\.js\?v=\d+/.test(html) && html.indexOf("nuages_realistes.js") < html.indexOf("cartes_regionales.js?v=")
           && vv("cartes_regionales.js") >= 5 && vv("combat_rp.js") >= 2 && vv("style.css") >= 110);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
