// v295 (et v296) — L'ARBITRE DES DÉS : AVANT LE MJ, UNE IA RAPIDE DIT S'IL FAUT UN JET.
//
// Nico : « quand on cliquera sur MJ, une IA hyper rapide analyse juste les
// derniers messages des joueurs et dit si oui ou non il faut un lancer de
// dés suite à l'action d'un joueur. Si non, ça lance le MJ narrateur. Si
// oui, elle dit aux joueurs concernés quel lancer faire. Ça doit être rapide.
// Un prompt qui prend en compte les caracs et comment les appliquer. »
//
// Sur la VRAIE page, Firestore en mémoire, Gemini (MIA_DES, narrateur en
// flux…) simulé : un tour avec un jet demandé, le MJ qui attend les dés, le
// jet lancé, puis le MJ ; un tour sans jet ; les garde-fous. Se charge sur
// l'ancien code (IVALIS_RACINE) : il y échoue, sans planter.
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
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'}, body: PORTRAIT }));
const faux = { arbitre: [], arbitreEnPanne: false };
await p.exposeFunction('__faux', (o) => Object.assign(faux, o));
const requetes = [];
const appel = (nom, args) => JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: nom, args } }] } }], usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 30 } });
await p.route('**generativelanguage.googleapis.com/**', async r => {
  const url = r.request().url();
  const corps = JSON.parse(r.request().postData() || "{}");
  const systeme = corps.systemInstruction ? corps.systemInstruction.parts.map(x => x.text).join("\n") : "";
  const texteU = ((corps.contents && corps.contents[0] && corps.contents[0].parts) || []).filter(x => x.text).map(x => x.text).join("\n");
  const qui = /Continue l'histoire/.test(systeme) ? "NARRATEUR" : /Tu es MIA_DES/.test(systeme) ? "MIA_DES" : /Tu es MIA_CASTING/.test(systeme) ? "MIA_CASTING"
            : /IA de casting/.test(systeme) ? "DETECTION" : /MIA_Batiment/.test(systeme) ? "BATIMENT" : (systeme.match(/Tu es (MIA_[A-Z_]+)/) || [])[1] || "AUTRE";
  requetes.push({ qui, t: Date.now(), url, systeme, texte: texteU, generationConfig: corps.generationConfig || {}, histoire: qui === "NARRATEUR" ? texteU : "" });
  const json = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body });
  if (qui === "NARRATEUR") {
    r.fulfill({ contentType: 'text/event-stream', headers: {'Access-Control-Allow-Origin':'*'},
      body: "data: " + JSON.stringify({ candidates: [{ content: { parts: [{ text: "La porte cède dans un fracas de bois.\nLa salle du trésor s'ouvre devant vous." }] } }], usageMetadata: { promptTokenCount: 9000, candidatesTokenCount: 300 } }) + "\r\n\r\n" });
    return;
  }
  if (qui === "MIA_DES") {
    await new Promise(res => setTimeout(res, 300));
    if (faux.arbitreEnPanne) { json(JSON.stringify({ error: { message: "panne" } }), 500); return; }
    json(appel("deciderJets", { jets: faux.arbitre })); return;
  }
  if (qui === "MIA_CASTING") { json(appel("preparerPNJ", { pnjs: [] })); return; }
  if (qui === "DETECTION") { json(appel("signalerNoms", { noms: [] })); return; }
  if (qui === "BATIMENT") { json(appel("gererDecor", { action: "aucun" })); return; }
  if (qui === "MIA_COMBAT") { json(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ combat: false, raison: "Rien." }) }] } }] })); return; }
  json(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }));
});
await p.route('**api.openai.com/**', r => r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ data: [] }) }));
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);

let tMsg = Date.now() - 200000;
const preparerTable = () => p.evaluate((t0) => {
  window.jouerSonClic = () => {}; window.alert = () => {};
  window.__confirmations = []; window.__reponseConfirm = false;
  window.confirm = (q) => { window.__confirmations.push(q); return window.__reponseConfirm; };
  localStorage.setItem("ID_JOUEUR_COURANT", "P_01");
  localStorage.removeItem("ivalis_MJ_MODELE"); localStorage.removeItem("ivalis_MJ_REFLEXION");
  ["GEMINI_API_KEY", "GEMINI_API_KEY_2", "OPENAI_API_KEY", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].forEach(k => localStorage.setItem("ivalis_" + k, "cle-" + k));
  window.ID_PARTIE_COURANTE = "P1";
  window.__docs = {};
  window.__docs["Systeme_Parties/P1"] = { Lieu_Actuel: "L_1", Situation: "Dans un lieu", Ordre_Initiative: ["H1", "H2"], Index_Initiative: 999 };
  window.__docs["Monde_Lieux/L_1"] = { Nom_Du_Lieu: "Le temple d'Héra", Description_Global: "Un temple de marbre." };
  window.__docs["Cerveau_IA/INST_10895"] = { Titre_Menu: "MJ", Contenu_Direct: "Tu es le Maître du Jeu de test." };
  window.DATE_EN_JEU_ACTUELLE = { jour: "12", annee: "3" };
  window.PERSOS_PARTIE = [{ idPersonnage: "H1", idJoueur: "P_01", prenom: "Thorin" }, { idPersonnage: "H2", idJoueur: "P_02", prenom: "Lyra" }];
  window.__docs["Messages_Chat/n0"] = { ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Texte: "Une lourde porte de bronze vous barre la route ; un prêtre vous observe.", Est_Narration_IA: true, Timestamp: t0 };
  window.__ajouts = []; window.__journal = [];
}, tMsg);
const ecrireMessage = (m) => p.evaluate((m) => { window.__docs["Messages_Chat/" + m.id] = { ID_Partie: "P1", ...m }; }, { ...m, Timestamp: (tMsg += 1000) });
const attendreQue = async (f, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await p.waitForTimeout(100); } return false; };
const verrouLibre = () => p.evaluate(() => window.__docs["Systeme_Parties/P1"].IA_En_Cours === false);
const tour = async () => {
  const avant = requetes.length;
  await p.evaluate(() => { window.__ajouts = []; window.declencherTourIA(); });
  await attendreQue(verrouLibre, 15000);
  await p.waitForTimeout(400);
  return { reqs: requetes.slice(avant), ajouts: await p.evaluate(() => (window.__ajouts || []).filter(a => a.col === "Messages_Chat").map(a => a.data)) };
};

// =========================================================================
titre("1. UNE ACTION RISQUÉE : L'ARBITRE DEMANDE LE JET, LE MJ NE PARLE PAS");
// =========================================================================
let t1 = null;
await section(async () => {
  await preparerTable();
  await ecrireMessage({ id: "a1", Auteur_ID: "H1", Auteur_Nom: "Thorin", Texte: "J'enfonce la porte de bronze d'un coup d'épaule !" });
  await ecrireMessage({ id: "a2", Auteur_ID: "H2", Auteur_Nom: "Lyra", Texte: "Je salue le prêtre poliment." });
  await p.evaluate((o) => window.__faux(o), { arbitreEnPanne: false, arbitre: [
    { heros: "Thorin", caracteristique: "FORCE", difficulte: "difficile", action: "enfoncer la porte de bronze" },
    { heros: "Lyra", caracteristique: "SORCELLERIE", difficulte: "moyenne", action: "carac inventée" },
    { heros: "Gandalf", caracteristique: "CHARISME", difficulte: "facile", action: "héros inconnu" }] });
  t1 = await tour();
  const des = t1.reqs.find(x => x.qui === "MIA_DES");
  verifier("au clic, MIA_DES est consultée en premier", !!des && t1.reqs[0].qui === "MIA_DES", t1.reqs.map(x => x.qui).join(" → "));
  // v304 : Nico, « l'IA qui détermine les lancés de dés semble ne pas fonctionner » — le modèle du Narrateur, réflexion basse.
  verifier("rapide : Gemini 3.8 Flash (v304), réflexion basse, température 0", !!des && /gemini-3\.8-flash:generateContent/.test(des.url) && des.generationConfig.temperature === 0 && des.generationConfig.thinkingConfig && des.generationConfig.thinkingConfig.thinkingLevel === "low");
  verifier("elle lit la dernière narration et les actions des joueurs depuis", !!des && /lourde porte de bronze/.test(des.texte) && /Thorin : J'enfonce la porte/.test(des.texte) && /Lyra : Je salue le prêtre/.test(des.texte));
  verifier("le narrateur ne parle PAS (on attend les dés)", !t1.reqs.some(x => x.qui === "NARRATEUR") && !t1.ajouts.some(a => a.Est_Narration_IA));
  const msg = t1.ajouts.find(a => a.Auteur_ID === "ARBITRE_DES");
  verifier("l'Arbitre des dés annonce le jet dans le chat", !!msg && msg.Auteur_Nom === "Arbitre des dés" && /🎲 Thorin : jet de Force — difficulté difficile \(enfoncer la porte de bronze\)/.test(msg.Texte), msg && msg.Texte);
  verifier("seulement les jets valables : pas de carac inventée, pas de héros inconnu", !!msg && msg.Jets_Demandes.length === 1 && msg.Jets_Demandes[0].idPerso === "H1" && msg.Jets_Demandes[0].caracteristique === "FORCE",
           msg && JSON.stringify(msg.Jets_Demandes));
  const partie = await p.evaluate(() => window.__docs["Systeme_Parties/P1"]);
  // v296 : pas de nouveau tour de parole ; les dés se lancent à tout moment.
  verifier("le tour de parole ne repart PAS (v296 : les dés se lancent à tout moment)", partie.Index_Initiative === 999 && JSON.stringify(partie.Ordre_Initiative) === '["H1","H2"]' && partie.IA_En_Cours === false,
           JSON.stringify({ i: partie.Index_Initiative, ordre: partie.Ordre_Initiative, verrou: partie.IA_En_Cours }));
});

await section(async () => {
  const des = t1.reqs.find(x => x.qui === "MIA_DES") || { systeme: "" };
  const s = des.systeme;
  verifier("son prompt : les six caractéristiques et ce qu'elles couvrent", ["FORCE : soulever", "DEXTÉRITÉ : sauter", "CONSTITUTION : endurance", "INTELLIGENCE : se souvenir", "SAGESSE : percevoir", "CHARISME : persuader"].every(x => s.includes(x)));
  verifier("… la manière compte (forcer = Force, crocheter = Dextérité, convaincre = Charisme)", /forcer une porte = FORCE ; la crocheter = DEXTÉRITÉ ; convaincre le garde de l'ouvrir = CHARISME/.test(s));
  verifier("… un jet dès que l'action est tentée et incertaine ; dans le doute, un jet (v304)", /DEMANDE UN JET dès qu'un héros TENTE maintenant/.test(s) && /n'est pas acquise/.test(s) && /DANS LE DOUTE, DEMANDE UN JET/.test(s));
  verifier("… jamais pour un combat, jamais deux fois, un seul jet par héros", /JAMAIS DE JET POUR UN COMBAT/.test(s) && /JAMAIS DEUX FOIS/.test(s) && /Un seul jet par héros/.test(s));
  verifier("… les cinq difficultés, expliquées", ["facile :", "moyenne :", "difficile :", "très difficile :", "héroïque :"].every(x => s.includes(x)));
});

// =========================================================================
titre("2. LA TABLE LE VOIT : LE BANDEAU DORÉ, LE D20 QUI BRILLE DANS LA FICHE");
// =========================================================================
await section(async () => {
  const msg = t1.ajouts.find(a => a.Auteur_ID === "ARBITRE_DES");
  const r = await p.evaluate((msg) => {
    window.annoncerJetsDemandes(msg);
    const b = document.getElementById("bandeau-jets-demandes");
    window.JETS_DEMANDES = msg.Jets_Demandes;
    window.afficherStatsFinales({ force: 14, dex: 12, con: 12, int: 10, sag: 10, cha: 8 }, "H1");
    const brille = Array.from(document.querySelectorAll(".bloc-stat-final.jet-demande")).map(e => e.getAttribute("data-carac"));
    window.afficherStatsFinales({ force: 14, dex: 12, con: 12, int: 10, sag: 10, cha: 8 }, "H2");
    const brilleLyra = document.querySelectorAll(".bloc-stat-final.jet-demande").length;
    return { visible: !!b && b.classList.contains("visible"), texte: b ? b.textContent : "", aMoi: !!(b && b.querySelector(".a-moi")), brille, brilleLyra };
  }, msg);
  if (process.env.V295_CAPTURES) {
    await p.evaluate((msg) => { document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => e.style.display = e.id === "ecran-jeu" ? "block" : "none"); window.annoncerJetsDemandes(msg); }, msg);
    await p.waitForTimeout(600);
    await p.screenshot({ path: process.env.V295_CAPTURES + "/v295_bandeau.png" });
  }
  verifier("un bandeau doré l'annonce à toute la table", r.visible && /Thorin/.test(r.texte) && /jet de Force — difficile/.test(r.texte), r.texte.slice(0, 120));
  verifier("le joueur de Thorin lit « À toi : ouvre ta fiche… » (sans attendre son tour de parole)", r.aMoi && /À toi : ouvre ta fiche et touche le d20 de Force/.test(r.texte) && !/tour de parole/.test(r.texte));
  verifier("dans la fiche de Thorin, le d20 de Force brille (et lui seul)", r.brille.join(",") === "force", r.brille.join(","));
  verifier("rien ne brille dans la fiche de Lyra", r.brilleLyra === 0);
  const app = lire("app.js");
  verifier("le chat suit les jets demandés (narration : on efface ; jet lancé : on retire le sien)", /const suivreJetsDemandes/.test(app) && /m\.Est_Narration_IA\) \{ window\.JETS_DEMANDES = \[\]/.test(app) && /annoncerJetsDemandes\(data\)/.test(app));
});

// =========================================================================
titre("3. ON RECLIQUE SUR MJ SANS AVOIR LANCÉ : ON PRÉVIENT ; PUIS LE JET, PUIS LE MJ");
// =========================================================================
await section(async () => {
  // Le message de l'Arbitre est déjà dans le chat (Firestore, à son heure) :
  // la suite s'écrit après lui.
  tMsg = Date.now();
  await p.evaluate(() => { window.__reponseConfirm = false; window.__confirmations = []; });
  const t = await tour();
  const q = await p.evaluate(() => window.__confirmations);
  verifier("le jet de Thorin manque : on prévient (« En attente : le jet de Thorin (Force) »)", q.length === 1 && /En attente : le jet de Thorin \(Force\)/.test(q[0]), q.join(" | "));
  verifier("on répond non : ni MIA_DES ni narrateur", t.reqs.length === 0 && t.ajouts.length === 0, t.reqs.map(x => x.qui).join(","));
  // Thorin lance son dé (le message que poste le jeu).
  await ecrireMessage({ id: "jet", Auteur_ID: "H1", Auteur_Nom: "Thorin", Texte: "🎲 Jet de **FORCE** pour **Thorin** : Résultat : 13 +2 = **15**" });
  await p.evaluate(() => { window.__confirmations = []; });
  const t2 = await tour();
  verifier("le jet est lancé : plus d'avertissement, et MIA_DES n'est pas rappelée (rien de neuf à arbitrer)", (await p.evaluate(() => window.__confirmations.length)) === 0 && !t2.reqs.some(x => x.qui === "MIA_DES"));
  const narr = t2.reqs.find(x => x.qui === "NARRATEUR");
  verifier("le narrateur raconte, en lisant la demande et le résultat du dé", !!narr && /Arbitre des dés : 🎲 Thorin : jet de Force — difficulté difficile/.test(narr.histoire) && /Jet de \*\*FORCE\*\* pour \*\*Thorin\*\* : Résultat : 13 \+2 = \*\*15\*\*/.test(narr.histoire),
           narr ? narr.histoire.slice(-300) : "");
  verifier("et sa réponse part dans le parchemin", t2.ajouts.some(a => a.Est_Narration_IA && /La porte cède/.test(a.Texte)));
});

await section(async () => {
  // Répondre « oui » à l'avertissement lance le MJ quand même.
  await preparerTable();
  await ecrireMessage({ id: "arb2", Auteur_ID: "ARBITRE_DES", Auteur_Nom: "Arbitre des dés", Texte: "🎲 Lyra : jet de Charisme — difficulté moyenne",
    Jets_Demandes: [{ idPerso: "H2", heros: "Lyra", caracteristique: "CHARISME", difficulte: "moyenne", action: "convaincre le prêtre" }] });
  await p.evaluate(() => { window.__reponseConfirm = true; });
  const t = await tour();
  verifier("« Lancer le MJ quand même » : le narrateur part", t.reqs.some(x => x.qui === "NARRATEUR") && !t.reqs.some(x => x.qui === "MIA_DES"));
});

// =========================================================================
titre("4. AUCUN JET : LE NARRATEUR PART AUSSITÔT, SANS RIEN ÉCRIRE DE PLUS");
// =========================================================================
await section(async () => {
  await preparerTable();
  await ecrireMessage({ id: "b1", Auteur_ID: "H2", Auteur_Nom: "Lyra", Texte: "Je demande au prêtre le nom de ce temple." });
  await p.evaluate((o) => window.__faux(o), { arbitre: [], arbitreEnPanne: false });
  const t = await tour();
  const iDes = t.reqs.findIndex(x => x.qui === "MIA_DES"), iNarr = t.reqs.findIndex(x => x.qui === "NARRATEUR");
  verifier("MIA_DES dit « aucun jet », puis le narrateur, dans le même clic", iDes === 0 && iNarr > iDes, t.reqs.map(x => x.qui).join(" → "));
  verifier("rien de visible entre les deux : pas de message de l'Arbitre", !t.ajouts.some(a => a.Auteur_ID === "ARBITRE_DES") && t.ajouts.some(a => a.Est_Narration_IA));
  verifier("l'arbitrage ne retarde presque pas le MJ (moins de 2,5 s ici)", iDes >= 0 && iNarr > 0 && t.reqs[iNarr].t - t.reqs[iDes].t < 2500, `${t.reqs[iNarr] && t.reqs[iDes] ? t.reqs[iNarr].t - t.reqs[iDes].t : "?"} ms`);
});

// =========================================================================
titre("5. LES GARDE-FOUS : PANNE, PAS D'ACTION, APRÈS UN COMBAT, MÊME JET DEUX FOIS");
// =========================================================================
await section(async () => {
  await preparerTable();
  await ecrireMessage({ id: "c1", Auteur_ID: "H1", Auteur_Nom: "Thorin", Texte: "J'escalade la colonne." });
  await p.evaluate((o) => window.__faux(o), { arbitreEnPanne: true });
  const t = await tour();
  verifier("MIA_DES en panne : le MJ raconte quand même", t.reqs.some(x => x.qui === "MIA_DES") && t.reqs.some(x => x.qui === "NARRATEUR"));
  await preparerTable();
  await p.evaluate((o) => window.__faux(o), { arbitreEnPanne: false, arbitre: [{ heros: "Thorin", caracteristique: "FORCE", difficulte: "facile", action: "x" }] });
  const u = await tour();
  verifier("aucune action des joueurs depuis la narration : pas d'arbitrage, le MJ part", !u.reqs.some(x => x.qui === "MIA_DES") && u.reqs.some(x => x.qui === "NARRATEUR"));
  await preparerTable();
  await ecrireMessage({ id: "d1", Auteur_ID: "H1", Auteur_Nom: "Thorin", Texte: "Je frappe le garde !" });
  const avant = requetes.length;
  await p.evaluate(() => { window.declencherTourIA({ issueCombat: "--- ISSUE DU COMBAT ---\nVictoire." }); });
  await attendreQue(verrouLibre, 15000); await p.waitForTimeout(300);
  const v = requetes.slice(avant);
  verifier("après un combat (son issue est jouée) : pas d'arbitrage", !v.some(x => x.qui === "MIA_DES") && v.some(x => x.qui === "NARRATEUR"));
  // Une action déjà arbitrée, et un nouveau message du même héros après la demande.
  await preparerTable();
  await ecrireMessage({ id: "e1", Auteur_ID: "H1", Auteur_Nom: "Thorin", Texte: "J'enfonce la porte." });
  await ecrireMessage({ id: "e2", Auteur_ID: "ARBITRE_DES", Auteur_Nom: "Arbitre des dés", Texte: "🎲 Thorin : jet de Force — difficulté difficile",
    Jets_Demandes: [{ idPerso: "H1", heros: "Thorin", caracteristique: "FORCE", difficulte: "difficile", action: "enfoncer la porte" }] });
  await ecrireMessage({ id: "e3", Auteur_ID: "H1", Auteur_Nom: "Thorin", Texte: "🎲 Jet de **FORCE** pour **Thorin** : Résultat : 4 +2 = **6**" });
  await ecrireMessage({ id: "e4", Auteur_ID: "H1", Auteur_Nom: "Thorin", Texte: "Je réessaie en prenant mon élan !" });
  await p.evaluate((o) => window.__faux(o), { arbitre: [{ heros: "Thorin", caracteristique: "FORCE", difficulte: "difficile", action: "réessayer" }] });
  const w = await tour();
  const des = w.reqs.find(x => x.qui === "MIA_DES");
  verifier("seule l'action écrite après la demande est arbitrée, avec les jets déjà demandés en mémoire", !!des && /Je réessaie/.test(des.texte) && !/Thorin : J'enfonce la porte\./.test(des.texte) && /JETS DÉJÀ DEMANDÉS CE TOUR/.test(des.texte));
  verifier("le même jet n'est jamais redemandé : le MJ raconte", !w.ajouts.some(a => a.Auteur_ID === "ARBITRE_DES") && w.reqs.some(x => x.qui === "NARRATEUR"));
});

await section(async () => {
  const index = lire("index.html");
  const v = (re) => Number((index.match(re) || [])[1] || 0);
  verifier("versions : ia_master, app, style, trace du combat", v(/ia_master\.js\?v=(\d+)"/) >= 16 && v(/app\.js\?v=(\d+)"/) >= 132 && v(/style\.css\?v=(\d+)"/) >= 122 && v(/trace_combat\.js\?v=(\d+)"/) >= 200
           && Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]) >= 295 && Number((lire("version.json").match(/"version": (\d+)/) || [])[1]) >= 295);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
