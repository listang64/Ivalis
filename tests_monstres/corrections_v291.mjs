// v291 — LE NARRATEUR PLUS VIF : GEMINI 3.8 FLASH, LE PARCHEMIN QUI S'OUVRE
// PENDANT QUE LE MJ ÉCRIT, LES PNJ PEINTS PENDANT LA LECTURE.
//
// Nico : « met moi Gemini 3.8 Flash en réflexion moyenne, avec possibilité
// dans paramètre de mettre en low la réflexion. Ou de changer pour essayer
// Argon. » Et : « on peut lancer le rp avec l'animation parchemin narrateur et
// quand c'est au moment du pnj de parler on affiche son nom ; si l'image n'est
// pas finie d'être créée ça se met en attente ? On gagnerait du temps. »
//
// Sur la VRAIE page, Firestore en mémoire, Gemini (en flux), OpenAI et
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
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'}, body: PORTRAIT }));
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// LE MJ ÉCRIT EN TROIS MORCEAUX (flux SSE) ; Myrto, nouvelle venue, parle.
const MORCEAUX = ["Les portes du temple s'ouvrent dans un grincement.\n",
                  "Une jeune femme s'avance : c'est Myrto, la porteuse d'eau.\nMyrto : « Bienvenue, étrangers ! »\n",
                  "Dame Koré vous observe en silence."];
const requetes = [], openai = [];
const faux = { argonRefuse: false, delaiPortraitMs: 3000 };
await p.exposeFunction('__fauxGemini', (o) => Object.assign(faux, o));
const appel = (nom, args) => JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: nom, args } }] } }] });
await p.route('**generativelanguage.googleapis.com/**', async r => {
  const url = r.request().url();
  const corps = JSON.parse(r.request().postData() || "{}");
  const systeme = corps.systemInstruction ? corps.systemInstruction.parts.map(x => x.text).join("\n") : "";
  const modele = (url.match(/models\/([^:]+):/) || [])[1] || "";
  const qui = /Continue l'histoire/.test(systeme) ? "NARRATEUR" : /IA de casting/.test(systeme) ? "CASTING" : /MIA_PNJ, le forgeron/.test(systeme) ? "FORGE"
            : /MIA_Batiment/.test(systeme) ? "BATIMENT" : (systeme.match(/Tu es (MIA_[A-Z_]+)/) || [])[1] || "AUTRE";
  requetes.push({ qui, modele, url, t: Date.now(), generationConfig: corps.generationConfig || {}, safety: corps.safetySettings || [] });
  const json = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body });
  if (qui === "NARRATEUR") {
    if (faux.argonRefuse && modele === "gemini-4-argon") { json(JSON.stringify({ error: { code: 403, message: "Argon est réservé au forfait payant." } }), 403); return; }
    const sse = MORCEAUX.map((t, i) => "data: " + JSON.stringify({ candidates: [{ content: { parts: i === 0 ? [{ text: "pensée cachée", thought: true }, { text: t }] : [{ text: t }] } }],
                                                              usageMetadata: { totalTokenCount: 40 + i } }) + "\r\n\r\n").join("");
    r.fulfill({ contentType: 'text/event-stream', headers: {'Access-Control-Allow-Origin':'*'}, body: sse });
    return;
  }
  if (qui === "CASTING") { json(appel("signalerNoms", { noms: ["Myrto"] })); return; }
  if (qui === "FORGE") { json(appel("creerNouveauxPNJ", { pnjs: [{ nom: "Myrto", physique: "Jeune femme, cheveux bruns, amphore sur l'épaule", occupation: "Porteuse d'eau", race: "Humain", secret: "Elle espionne pour Koré", style_parole: "Vive" }] })); return; }
  if (qui === "BATIMENT") { json(appel("gererDecor", { action: "aucun" })); return; }
  if (qui === "MIA_COMBAT") { json(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ combat: false, raison: "Un accueil." }) }] } }] })); return; }
  json(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }], usageMetadata: { totalTokenCount: 5 } }));
});
await p.route('**api.openai.com/**', async r => {
  openai.push({ t: Date.now(), url: r.request().url() });
  await new Promise(res => setTimeout(res, faux.delaiPortraitMs));
  r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ data: [{ b64_json: PNG }] }) });
});
await p.route('**api.cloudinary.com/**', async r => {
  r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ secure_url: `https://res.cloudinary.com/dlkjq4kvg/image/upload/v1/PNJ/myrto_${Date.now()}.png` }) });
});
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);
// v300 : les portraits des PNJ sont en pause (ia_master.js) ; ce banc les rallume pour les vérifier.
await p.evaluate(() => { window.PORTRAITS_PNJ_EN_PAUSE = false; });
// Un vrai flux : la réponse du narrateur arrive morceau par morceau, une
// demi-seconde entre chaque (la route la livrerait d'un bloc).
await p.evaluate(() => {
  const vrai = window.fetch.bind(window);
  window.fetch = async (url, o) => {
    const r = await vrai(url, o);
    if (!/:streamGenerateContent/.test(String(url)) || !r.ok) return r;
    const morceaux = (await r.text()).split(/(?<=\r\n\r\n)/);
    const enc = new TextEncoder();
    const flux = new ReadableStream({ async start(c) {
      for (const m of morceaux) { c.enqueue(enc.encode(m)); await new Promise(res => setTimeout(res, 500)); }
      c.close();
    } });
    return new Response(flux, { status: r.status, headers: r.headers });
  };
});

const preparerTable = () => p.evaluate((URL_PORTRAIT_KORE) => {
  window.jouerSonClic = () => {}; window.confirm = () => true; window.alert = () => {};
  localStorage.setItem("ID_JOUEUR_COURANT", "P_01");
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  ["GEMINI_API_KEY", "GEMINI_API_KEY_2", "OPENAI_API_KEY", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].forEach(k => localStorage.setItem("ivalis_" + k, "cle-" + k));
  window.ID_PARTIE_COURANTE = "P1";
  window.__docs = {};
  window.__docs["Systeme_Parties/P1"] = { Lieu_Actuel: "L_1", Situation: "Dans un lieu", Ordre_Initiative: ["H1", "H2"], Index_Initiative: 0 };
  window.__docs["Monde_Lieux/L_1"] = { Nom_Du_Lieu: "Le temple d'Héra", Description_Global: "Un temple de marbre blanc." };
  window.__docs["Monde_PNJ/PNJ_KORE"] = { Nom_PNJ: "Dame Koré", ID_Lieu: "L_1", Race: "Humain", Occupation: "Grande prêtresse", Statut: "Vivant",
    Description_Physique: "Une prêtresse au visage sévère.", URL_Cloudinary: URL_PORTRAIT_KORE };
  window.__docs["Cerveau_IA/INST_10895"] = { Titre_Menu: "MJ", Contenu_Direct: "Tu es le Maître du Jeu de test." };
  window.DATE_EN_JEU_ACTUELLE = { jour: "12", annee: "3" };
  window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Thorin" }, { idPersonnage: "H2", prenom: "Lyra" }];
  const t0 = Date.now() - 100000;
  window.__docs["Messages_Chat/c1"] = { ID_Partie: "P1", Auteur_ID: "H1", Auteur_Nom: "Thorin", Texte: "Je pousse les portes du temple.", Timestamp: t0 };
  window.__ajouts = []; window.__journal = [];
}, URL_PORTRAIT_KORE);
const attendreQue = async (f, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await p.waitForTimeout(100); } return false; };
// Le message du MJ et toutes ses versions, dans l'ordre (l'ajout, puis chaque mise à jour).
const versionsDuMessage = () => p.evaluate(() => {
  const ajout = (window.__ajouts || []).find(a => a.col === "Messages_Chat" && a.data.Est_Narration_IA);
  if (!ajout) return [];
  const majs = (window.__journal || []).filter(j => j.chemin === "Messages_Chat/" + ajout.id).map(j => ({ t: j.t, ...j.data }));
  return [{ t: ajout.t, ...ajout.data }, ...majs];
});

// =========================================================================
titre("1. LES RÉGLAGES DU NARRATEUR : 3.8 FLASH EN RÉFLEXION MOYENNE, BASSE OU ARGON AU CHOIX");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    localStorage.removeItem("ivalis_MJ_MODELE"); localStorage.removeItem("ivalis_MJ_REFLEXION");
    const defaut = typeof window.reglagesNarrateur === "function" ? window.reglagesNarrateur() : null;
    const modele = document.getElementById("mj-modele"), reflexion = document.getElementById("mj-reflexion");
    const options = (s) => s ? Array.from(s.options).map(o => o.value) : [];
    const fenetre = document.getElementById("etape-ia-parametre");
    return { defaut, modeles: options(modele), reflexions: options(reflexion), dansLaFenetre: !!(fenetre && modele && fenetre.contains(modele) && fenetre.contains(reflexion)),
             titre: fenetre ? fenetre.querySelector("h2").textContent : "" };
  });
  verifier("par défaut : Gemini 3.8 Flash, réflexion moyenne", !!r.defaut && r.defaut.modele === "gemini-3.8-flash" && r.defaut.reflexion === "medium", JSON.stringify(r.defaut));
  verifier("Paramètres : le choix du modèle (3.8 Flash, Argon, Flash-Lite)", ["gemini-3.8-flash", "gemini-4-argon", "gemini-flash-lite-latest"].every(m => r.modeles.includes(m)), r.modeles.join(", "));
  verifier("Paramètres : la réflexion moyenne ou basse", r.reflexions.includes("medium") && r.reflexions.includes("low"), r.reflexions.join(", "));
  if (process.env.V291_CAPTURES) {
    await p.evaluate(() => { document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => e.style.display = e.id === "ecran-jeu" ? "block" : "none");
      const f = document.getElementById("etape-ia-parametre"); window.__cachesV291 = [];
      for (let e = f; e && e !== document.body; e = e.parentElement) { window.__cachesV291.push([e, e.style.cssText]); e.style.display = e === f ? "block" : (getComputedStyle(e).display === "none" ? "block" : e.style.display); e.style.opacity = "1"; e.style.visibility = "visible"; }
      f.style.position = "fixed"; f.style.left = "50%"; f.style.top = "50%"; f.style.transform = "translate(-50%, -50%)"; f.style.zIndex = "99999"; });
    await p.waitForTimeout(300);
    await p.locator("#etape-ia-parametre").screenshot({ path: process.env.V291_CAPTURES + "/v291_reglages.png" });
    await p.evaluate(() => { (window.__cachesV291 || []).forEach(([e, css]) => { e.style.cssText = css; }); });
  }
  verifier("dans la fenêtre des réglages du narrateur (avec la température)", r.dansLaFenetre && /narrateur/i.test(r.titre), r.titre);
  const s = await p.evaluate(() => {
    window.naviguerFenetre = window.naviguerFenetre || (() => {});
    document.getElementById("mj-modele").value = "gemini-4-argon";
    document.getElementById("mj-reflexion").value = "low";
    window.sauvegarderTemperature();
    const apres = window.reglagesNarrateur();
    localStorage.setItem("ivalis_MJ_MODELE", "un-modele-inconnu"); localStorage.setItem("ivalis_MJ_REFLEXION", "n'importe");
    const repli = window.reglagesNarrateur();
    return { stocke: [localStorage.getItem("ivalis_MJ_MODELE"), localStorage.getItem("ivalis_MJ_REFLEXION")], apres, repli };
  });
  verifier("Sauvegarder garde Argon et la réflexion basse", s.apres.modele === "gemini-4-argon" && s.apres.reflexion === "low", JSON.stringify(s.apres));
  verifier("un réglage inconnu revient à 3.8 Flash, réflexion moyenne", s.repli.modele === "gemini-3.8-flash" && s.repli.reflexion === "medium", JSON.stringify(s.repli));
});

// =========================================================================
titre("2. LE TOUR DU MJ : LA REQUÊTE, LE FLUX, LE MESSAGE QUI PART AVANT LA FIN");
// =========================================================================
let versions = [];
await section(async () => {
  await preparerTable();
  await p.evaluate(() => { localStorage.removeItem("ivalis_MJ_MODELE"); localStorage.removeItem("ivalis_MJ_REFLEXION"); });
  const avant = requetes.length;
  await p.evaluate(() => { window.declencherTourIA(); });
  await attendreQue(async () => (await versionsDuMessage()).some(v => v.PNJ_Prets === true), 15000);
  versions = await versionsDuMessage();
  const narr = requetes.slice(avant).filter(x => x.qui === "NARRATEUR");
  const n = narr[0] || {};
  verifier("le narrateur parle à gemini-3.8-flash, en flux (streamGenerateContent, alt=sse)", n.modele === "gemini-3.8-flash" && /:streamGenerateContent\?alt=sse/.test(n.url || ""), (n.url || "").replace(/key=[^&]+/, "key=…").slice(0, 140));
  verifier("en réflexion moyenne (thinkingLevel: medium)", ((n.generationConfig || {}).thinkingConfig || {}).thinkingLevel === "medium", JSON.stringify(n.generationConfig));
  verifier("sans filtre : les quatre catégories en BLOCK_NONE", (n.safety || []).length === 4 && n.safety.every(x => x.threshold === "BLOCK_NONE"), JSON.stringify((n.safety || []).map(x => x.threshold)));
  const premier = versions[0] || {};
  verifier("le message part dès le premier paragraphe fini, marqué « en cours »", premier.Recit_En_Cours === true && /portes du temple/.test(premier.Texte || "") && !/en silence/.test(premier.Texte || ""),
           (premier.Texte || "").slice(0, 80));
  const fin = versions.find(v => v.Recit_En_Cours === false) || {};
  verifier("puis il grandit jusqu'au texte complet (« en cours » levé)", /Dame Koré vous observe en silence|Koré<\/strong>.*en silence|en silence/.test(fin.Texte || "") && versions.length >= 3, `${versions.length} versions`);
  verifier("le parchemin s'ouvre bien avant que le MJ ait fini d'écrire", !!fin.t && fin.t - (premier.t || 0) >= 400, `${(fin.t || 0) - (premier.t || 0)} ms d'avance`);
  verifier("les pensées du modèle ne s'écrivent pas dans le récit", versions.every(v => !/pensée cachée/.test(v.Texte || "")));
  const tEnCours = premier.t || 0;
  const iCasting = requetes.slice(avant).find(x => x.qui === "CASTING");
  verifier("la recherche des nouveaux PNJ vient APRÈS l'ouverture du parchemin", !!iCasting && iCasting.t >= tEnCours, iCasting ? `${iCasting.t - tEnCours} ms après` : "pas de recherche");
  const peinture = openai[openai.length - 1];
  verifier("et le portrait aussi (le récit n'attend plus la peinture pour partir)", !!peinture && peinture.t >= tEnCours, peinture ? `${peinture.t - tEnCours} ms après` : "aucune peinture");
});

await section(async () => {
  const iAttendus = versions.findIndex(v => Array.isArray(v.PNJ_Attendus) && v.PNJ_Attendus.includes("Myrto"));
  const iPortrait = versions.findIndex(v => /pnj-chat-hover"><strong>Myrto<\/strong><img src="https:\/\/res\.cloudinary\.com\/[^"]*myrto/.test(v.Texte || ""));
  const iPrets = versions.findIndex(v => v.PNJ_Prets === true);
  verifier("le message annonce les nouveaux venus (PNJ_Attendus : Myrto)", iAttendus >= 0, JSON.stringify(versions.map(v => v.PNJ_Attendus)));
  verifier("puis pose le portrait de Myrto dans le texte, dès qu'il est peint", iPortrait > iAttendus && iAttendus >= 0, `${iAttendus} → ${iPortrait}`);
  verifier("puis dit que tout est prêt (PNJ_Prets)", iPrets >= iPortrait && iPortrait >= 0, `${iPortrait} → ${iPrets}`);
  verifier("Dame Koré (déjà connue) garde son portrait dans le texte", /pnj-chat-hover"><strong>Dame Koré<\/strong><img src="[^"]*portrait_kore/.test((versions[versions.length - 1] || {}).Texte || ""));
  const fiche = await p.evaluate(() => Object.entries(window.__docs).find(([k, v]) => k.startsWith("Monde_PNJ/") && v.Nom_PNJ === "Myrto"));
  verifier("la fiche de Myrto est rangée au temple, avec son portrait", !!fiche && fiche[1].ID_Lieu === "L_1" && /myrto/.test(fiche[1].URL_Cloudinary || ""), fiche ? JSON.stringify({ lieu: fiche[1].ID_Lieu, url: fiche[1].URL_Cloudinary }) : "");
  const verrou = await p.evaluate(() => window.__docs["Systeme_Parties/P1"].IA_En_Cours);
  verifier("le verrou du MJ est relâché à la fin", verrou === false, String(verrou));
});

// =========================================================================
titre("3. LA RÉFLEXION BASSE, FLASH-LITE, ET ARGON REFUSÉ → FLASH-LITE PREND LE RELAIS");
// =========================================================================
await section(async () => {
  const tour = async (modele, reflexion, o = {}) => {
    await preparerTable();
    await p.evaluate(({ modele, reflexion }) => { localStorage.setItem("ivalis_MJ_MODELE", modele); localStorage.setItem("ivalis_MJ_REFLEXION", reflexion); }, { modele, reflexion });
    await window_faux(o);
    const avant = requetes.length;
    await p.evaluate(() => { window.declencherTourIA(); });
    await attendreQue(async () => (await versionsDuMessage()).some(v => v.PNJ_Prets === true), 15000);
    return { narr: requetes.slice(avant).filter(x => x.qui === "NARRATEUR"), versions: await versionsDuMessage() };
  };
  const window_faux = (o) => p.evaluate((o) => window.__fauxGemini(o), Object.assign({ argonRefuse: false, delaiPortraitMs: 200 }, o));
  const bas = await tour("gemini-3.8-flash", "low");
  verifier("réflexion basse : thinkingLevel: low", ((bas.narr[0] || {}).generationConfig || {}).thinkingConfig?.thinkingLevel === "low", JSON.stringify((bas.narr[0] || {}).generationConfig));
  const lite = await tour("gemini-flash-lite-latest", "medium");
  verifier("Flash-Lite : pas de réflexion demandée (il n'en a pas)", (lite.narr[0] || {}).modele === "gemini-flash-lite-latest" && !((lite.narr[0] || {}).generationConfig || {}).thinkingConfig,
           JSON.stringify((lite.narr[0] || {}).generationConfig));
  const argon = await tour("gemini-4-argon", "medium", { argonRefuse: true });
  verifier("Argon refusé (403) : Flash-Lite prend le relais tout de suite, le récit part quand même",
           argon.narr.length === 2 && argon.narr[0].modele === "gemini-4-argon" && argon.narr[1].modele === "gemini-flash-lite-latest"
           && argon.narr[1].t - argon.narr[0].t < 2500 && argon.versions.length > 0 && /portes du temple/.test(argon.versions[argon.versions.length - 1].Texte || ""),
           argon.narr.map(x => x.modele).join(" → "));
  const argonOk = await tour("gemini-4-argon", "medium");
  verifier("Argon accepté : il écrit le récit, en réflexion moyenne", argonOk.narr.length === 1 && argonOk.narr[0].modele === "gemini-4-argon" && argonOk.narr[0].generationConfig.thinkingConfig?.thinkingLevel === "medium",
           argonOk.narr.map(x => x.modele).join(" → "));
  await p.evaluate(() => { localStorage.removeItem("ivalis_MJ_MODELE"); localStorage.removeItem("ivalis_MJ_REFLEXION"); });
});

// =========================================================================
titre("4. LE PARCHEMIN : LE NOM DU NOUVEAU VENU, L'ATTENTE DU PORTRAIT, PUIS SA RÉPLIQUE");
// =========================================================================
const etatParchemin = () => p.evaluate(() => {
  const o = document.getElementById("ecran-recit-dynamique"), nom = document.getElementById("nom-recit-dynamique");
  const img = document.getElementById("portrait-recit-dynamique"), att = document.getElementById("attente-recit-dynamique");
  const contenu = document.getElementById("contenu-texte-recit");
  return { ouvert: !!o && o.style.display !== "none", nom: nom ? nom.textContent : "", nomVisible: !!nom && nom.style.display !== "none" && nom.style.opacity === "1",
           portrait: img ? img.getAttribute("src") || "" : "", portraitVisible: !!img && img.style.opacity === "1",
           attente: att ? att.textContent : "", attenteVisible: !!att && att.classList.contains("visible") && getComputedStyle(att).opacity !== "0",
           texte: contenu ? contenu.textContent : "", texteVisible: contenu ? contenu.style.opacity === "1" : false };
});
const cliquer = () => p.evaluate(() => document.getElementById("ecran-recit-dynamique").click());
const P1 = "Les portes du temple s'ouvrent.";
const P2_SANS = "Myrto : « Bienvenue, étrangers ! »";
const P2_AVEC = `<span class="pnj-chat-hover"><strong>Myrto</strong><img src="https://res.cloudinary.com/dlkjq4kvg/image/upload/v1/PNJ/myrto_final.png" class="pnj-hover-img"></span> : « Bienvenue, étrangers ! »`;
await section(async () => {
  await p.evaluate(() => { if (typeof window.fermerRecitDynamique === "function") { try { window.fermerRecitDynamique(); } catch (e) {} } });
  await p.waitForTimeout(1700);
  const ts = Date.now();
  await p.evaluate(({ ts, t }) => window.lancerRecitDynamique(t, { ts, enCours: false, pnjAttendus: ["Myrto"], pnjPrets: false }), { ts, t: P1 + "<br>" + P2_SANS });
  await p.waitForTimeout(1600);
  await cliquer(); await p.waitForTimeout(150); await cliquer();       // finir la frappe, puis page suivante
  await p.waitForTimeout(1500);
  const e1 = await etatParchemin();
  if (process.env.V291_CAPTURES) await p.screenshot({ path: process.env.V291_CAPTURES + "/v291_attente_portrait.png" });
  verifier("au moment où Myrto parle sans portrait : son nom s'affiche", e1.ouvert && e1.nom === "Myrto" && e1.nomVisible, JSON.stringify({ nom: e1.nom, visible: e1.nomVisible }));
  verifier("« Le portrait se dessine… » et le parchemin attend (la réplique ne s'écrit pas)", e1.attenteVisible && /portrait se dessine/.test(e1.attente) && !/Bienvenue/.test(e1.texte),
           JSON.stringify({ attente: e1.attente, visible: e1.attenteVisible, texte: e1.texte.slice(0, 40) }));
  await p.evaluate(({ ts, t }) => window.majRecitDynamique(ts, t, { enCours: false, pnjAttendus: ["Myrto"], pnjPrets: false }), { ts, t: P1 + "<br>" + P2_AVEC });
  await p.waitForTimeout(1800);
  const e2 = await etatParchemin();
  verifier("le portrait arrive : il apparaît, et la réplique s'écrit", e2.portraitVisible && /myrto_final/.test(e2.portrait) && /Bienvenue, étrangers/.test(e2.texte) && !e2.attenteVisible,
           JSON.stringify({ portrait: e2.portrait.slice(-20), texte: e2.texte.slice(0, 40), attente: e2.attenteVisible }));
  verifier("le nom au-dessus reste Myrto, sans le « Myrto : » répété dans la réplique", e2.nom === "Myrto" && !/^\s*Myrto\s*:/.test(e2.texte), e2.texte.slice(0, 30));
});

await section(async () => {
  await p.evaluate(() => window.fermerRecitDynamique()); await p.waitForTimeout(1700);
  const ts = Date.now();
  await p.evaluate(({ ts, t }) => window.lancerRecitDynamique(t, { ts, enCours: false, pnjAttendus: ["Myrto"], pnjPrets: false }), { ts, t: P2_SANS });
  await p.waitForTimeout(1800);
  const e1 = await etatParchemin();
  await cliquer(); await p.waitForTimeout(1200);
  const e2 = await etatParchemin();
  verifier("un toucher passe l'attente : la réplique s'écrit sans portrait", e1.attenteVisible && /Bienvenue/.test(e2.texte) && !e2.attenteVisible && !e2.portraitVisible,
           JSON.stringify({ avant: e1.attenteVisible, texte: e2.texte.slice(0, 30) }));
  await p.evaluate(() => window.fermerRecitDynamique()); await p.waitForTimeout(1700);
  const ts2 = Date.now();
  await p.evaluate(({ ts, t }) => window.lancerRecitDynamique(t, { ts, enCours: false, pnjAttendus: null, pnjPrets: false }), { ts: ts2, t: "Thorin : « On y va, les amis. »" });
  await p.waitForTimeout(1800);
  const e3 = await etatParchemin();
  verifier("la réplique d'un héros n'attend jamais de portrait", /On y va/.test(e3.texte) && !e3.attenteVisible, e3.texte.slice(0, 30));
  await p.evaluate(() => window.fermerRecitDynamique()); await p.waitForTimeout(1700);
  const ts3 = Date.now();
  await p.evaluate(({ ts, t }) => window.lancerRecitDynamique(t, { ts }), { ts: ts3, t: P2_SANS });
  await p.waitForTimeout(1800);
  const e4 = await etatParchemin();
  verifier("un message d'avant (sans état) se lit comme avant, sans attente", /Bienvenue/.test(e4.texte) && !e4.attenteVisible, e4.texte.slice(0, 30));
});

// =========================================================================
titre("5. LE MJ ÉCRIT ENCORE : LE PARCHEMIN ATTEND LA SUITE AU LIEU DE SE FERMER");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.fermerRecitDynamique()); await p.waitForTimeout(1700);
  const ts = Date.now();
  await p.evaluate(({ ts, t }) => window.lancerRecitDynamique(t, { ts, enCours: true, pnjAttendus: null, pnjPrets: false }), { ts, t: P1 });
  await p.waitForTimeout(1600);
  await cliquer(); await p.waitForTimeout(150); await cliquer();
  await p.waitForTimeout(1300);
  const e1 = await etatParchemin();
  verifier("au bout du texte reçu : le parchemin reste ouvert, « Le Maître du Jeu écrit… »", e1.ouvert && e1.attenteVisible && /écrit/.test(e1.attente), JSON.stringify({ ouvert: e1.ouvert, attente: e1.attente }));
  await cliquer(); await p.waitForTimeout(400);
  verifier("un toucher ne le ferme pas pendant qu'il écrit", (await etatParchemin()).ouvert);
  await p.evaluate(({ ts, t }) => window.majRecitDynamique(ts, t, { enCours: false, pnjAttendus: [], pnjPrets: true }), { ts, t: P1 + "<br>La suite arrive enfin, dans la lumière des torches." });
  await p.waitForTimeout(1200);
  const e2 = await etatParchemin();
  verifier("la suite arrive : elle s'écrit aussitôt", /La suite arrive enfin/.test(e2.texte) && !e2.attenteVisible, e2.texte.slice(0, 40));
  await p.evaluate(({ ts, t }) => window.majRecitDynamique(ts + 1, t, { enCours: false, pnjPrets: true }), { ts, t: "Un autre récit." });
  await p.waitForTimeout(300);
  verifier("la mise à jour d'un autre message ne touche pas ce parchemin", /La suite arrive enfin/.test((await etatParchemin()).texte));
  await cliquer(); await p.waitForTimeout(150); await cliquer(); await p.waitForTimeout(2200);
  verifier("à la fin du récit complet, le parchemin se referme", !(await etatParchemin()).ouvert);
});

// =========================================================================
titre("6. LE CHAT SUIT LE MESSAGE QUI GRANDIT");
// =========================================================================
await section(async () => {
  const app = lire("app.js");
  verifier("l'écoute du chat traite les messages modifiés (redessinés à leur place)", /change\.type === "modified"/.test(app) && /insertBefore\(nouveau, suivant\)/.test(app));
  verifier("et passe chaque version au parchemin (majRecitDynamique), avec son état", /majRecitDynamique\(data\.Timestamp, data\.Texte, etatRecitDuMessage\(data\)\)/.test(app)
           && /lancerRecitDynamique\(recitDeclenche, \{ ts: recitHorodatage, \.\.\.recitEtat \}\)/.test(app));
  const index = lire("index.html");
  const v = (re) => Number((index.match(re) || [])[1] || 0);
  verifier("versions : ia_master, recit_dynamique, app, style, trace du combat", v(/ia_master\.js\?v=(\d+)"/) >= 12 && v(/recit_dynamique\.js\?v=(\d+)"/) >= 6 && v(/app\.js\?v=(\d+)"/) >= 130
           && v(/style\.css\?v=(\d+)"/) >= 120 && v(/trace_combat\.js\?v=(\d+)"/) >= 196
           && Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]) >= 291 && Number((lire("version.json").match(/"version": (\d+)/) || [])[1]) >= 291);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
