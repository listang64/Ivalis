// v430 — LE NARRATEUR COUPÉ SE REPREND ; LE CERVEAU DU PNJ ; LE SOUVENIR DU DÉPART ;
// L'ILLUSTRATEUR PLUS RARE ; LE RETOUR SUR L'APP (iPad).
// Nico : « le Maître du jeu était en train d'écrire et ça s'est arrêté en pleine phrase,
// puis le cerveau des fils invisibles est apparu, mais le narrateur n'a pas continué » ;
// « dans l'icône du petit cerveau, c'est toujours PJ → PNJ : il faudrait mettre quand ça
// modifie la relation du PNJ » ; « quand un PNJ quitte le groupe, inscrire dans ses
// souvenirs un très léger résumé de ce moment » ; « il génère une image à chaque
// génération du narrateur » (→ les moments forts seulement) ; « sur iPad, quand je swap
// sur une autre app et que je reviens, tout s'affiche en tout petit ».
// (Le décor : celui du banc v421.) Lancer : node tests_monstres/corrections_v430.mjs
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

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'}, body: PORTRAIT }));
await p.route('**api.openai.com/**', r => r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ data: [] }) }));

// LES IA : MIA_GROUPE dit les demandes qu'on lui prépare ; le Narrateur raconte en une ligne.
const faux = { demandes: [], morts: [], rencontres: [] };

const requetes = [];
const appel = (nom, args) => JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: nom, args } }] } }] });
await p.route('**generativelanguage.googleapis.com/**', async r => {
  const corps = JSON.parse(r.request().postData() || "{}");
  const systeme = corps.systemInstruction ? corps.systemInstruction.parts.map(x => x.text).join("\n") : "";
  const texteU = ((corps.contents && corps.contents[0] && corps.contents[0].parts) || []).filter(x => x.text).map(x => x.text).join("\n");
  const qui = /Continue l'histoire/.test(systeme) ? "NARRATEUR" : /Tu es Mia, l'IA d'analyse/.test(systeme) ? "MIA_FILTRE" : (systeme.match(/Tu es (MIA_[A-Z_]+)/) || [])[1] || "AUTRE";
  requetes.push({ qui, t: Date.now(), systeme, texte: texteU });
  const json = (body) => r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body });
  if (qui === "NARRATEUR") {
    // (v430) Le Narrateur du banc : une réponse coupée au milieu d'une phrase (MAX_TOKENS),
    // puis, à la reprise (« Ta réponse a été coupée »), la fin de la phrase.
    const reprise = (corps.contents || []).length > 1;
    const morceaux = reprise ? (faux.reprise || [[" de la vieille tour, et nous repartons.", "STOP"]]) : (faux.premiere || [["La route s'étire devant la compagnie.\n", "STOP"]]);
    faux.appelsNarrateur = (faux.appelsNarrateur || 0) + 1;
    if (reprise) faux.dernierContenus = corps.contents;
    r.fulfill({ contentType: 'text/event-stream', headers: {'Access-Control-Allow-Origin':'*'},
      body: morceaux.map(([t, fin]) => "data: " + JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] }, ...(fin ? { finishReason: fin } : {}) }], usageMetadata: { totalTokenCount: 30 } }) + "\r\n\r\n").join("") });
    return;
  }
  if (qui === "MIA_RENCONTRES") { json(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ rencontres: faux.rencontres || [] }) }] } }], usageMetadata: { totalTokenCount: 40 } })); return; }
  if (/donnes leur titre aux chapitres/.test(systeme)) { json(JSON.stringify({ candidates: [{ content: { parts: [{ text: "La route d'Aulis" }] } }] })); return; }
  if (qui === "MIA_GROUPE") { json(appel("demandesCompagnie", { demandes: faux.demandes })); return; }
  if (qui === "MIA_DES") { json(appel("deciderJets", { jets: [] })); return; }
  if (qui === "MIA_FILTRE") { json(appel("selectionnerPNJ", { noms: [] })); return; }
  if (qui === "MIA_CASTING") { json(appel("preparerPNJ", { pnjs: [] })); return; }
  if (qui === "MIA_MORT") { json(appel("declarerMorts", { noms_morts: faux.morts })); return; }
  if (qui === "MIA_COMBAT") { json(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ combat: false, raison: "Rien." }) }] } }] })); return; }
  json(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }], usageMetadata: { totalTokenCount: 5 } }));
});
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
if (process.env.V418_DEBUG) p.on('console', m => { const t = m.text(); if (/compagnie|Tour IA|GROUPE|MIA_DES|Arbitre|erreur|Erreur/i.test(t)) console.log("   [console]", t.slice(0, 300)); });
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);

const attendreQue = async (f, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await p.waitForTimeout(100); } return false; };
const G = (f, a) => p.evaluate(f, a);
// LA TABLE : Thorin (H1) et Lyra (H2, Pisteuse, son loup Croc-Gris « joueur et protecteur ») au port (L_1) ;
// Doros (il aime Thorin), Dame Koré (elle hésite), Myrto (elle déteste Lyra).
const preparerTable = () => G(() => {
  window.jouerSonClic = () => {}; window.confirm = () => true; window.alert = () => {};
  localStorage.setItem("ID_JOUEUR_COURANT", "J1");
  ["GEMINI_API_KEY", "GEMINI_API_KEY_2", "OPENAI_API_KEY", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].forEach(k => localStorage.setItem("ivalis_" + k, "cle-" + k));
  window.ID_PARTIE_COURANTE = "P1";
  const d = window.__docs = {};
  d["Systeme_Parties/P1"] = { Lieu_Actuel: "L_1", Ordre_Initiative: ["H1", "H2"], Index_Initiative: 0 };
  d["Monde_Lieux/L_1"] = { Nom_Du_Lieu: "Le port de Mégara", Reputations: { P1: { Score: 3, Tags: ["généreux"] } } };
  d["Monde_Lieux/L_2"] = { Nom_Du_Lieu: "Le bourg d'Aulis" };
  d["Cerveau_IA/INST_10895"] = { Titre_Menu: "MJ", Contenu_Direct: "Tu es le Maître du Jeu de test." };
  const fiche = (id, nom, metier) => { d["Monde_PNJ/" + id] = { Nom_PNJ: nom, Occupation: metier, Race: "Humain", ID_Partie: "P1", ID_Lieu: "L_1", ID_Batiment: "", Statut: "Vivant", URL_Cloudinary: "", Version_Creation: 417 }; };
  fiche("PNJ_DOROS", "Doros", "Docker"); fiche("PNJ_KORE", "Dame Koré", "Prêtresse"); fiche("PNJ_MYRTO", "Myrto", "Tavernière");
  const P = "Systeme_Parties/P1/";
  const ame = (id, type, nom, traits) => { d[P + "Ames/" + id] = { id, type, nom, ref: id, statut: "vivant", humeur: null, psyche: { traits: { prudence: 50, impulsivite: 50, loyaute: 50, empathie: 50, orgueil: 50, sociabilite: 50, ...(traits || {}) }, valeurs: [], objectifs: [], faille: "", masque: "", style: "" } }; };
  ame("PNJ_DOROS", "pnj", "Doros"); ame("PNJ_KORE", "pnj", "Dame Koré"); ame("PNJ_MYRTO", "pnj", "Myrto"); ame("H1", "heros", "Thorin"); ame("H2", "heros", "Lyra");
  window.__lien = (de, vers, axes, extra) => { d[`${P}Liens/${de}~${vers}`] = { de, vers, axes: { confiance: 0, respect: 0, attachement: 0, dette: 0, crainte: 0, familiarite: 40, ...axes }, origine: "rencontre", etiquette: "", histoire: "", derniers: [], ...(extra || {}) }; };
  window.__lien("PNJ_DOROS", "H1", { confiance: 60, respect: 40, attachement: 50 });     // affinité 51,5
  window.__lien("PNJ_DOROS", "H2", { confiance: 30, respect: 20, attachement: 30 });
  window.__lien("PNJ_KORE", "H2", { confiance: 30, respect: 30, attachement: 20 });       // affinité 26,5 : la zone grise
  window.__lien("PNJ_MYRTO", "H1", { confiance: 70, respect: 50, attachement: 60 });
  window.__lien("PNJ_MYRTO", "H2", { confiance: -60, respect: -30, attachement: -50 });    // −49 : elle ne la supporte pas
  d[P + "Social/etat"] = { tour: 1, compteur: 0, historique: [], messages: [] };
  d["Personnages/H2"] = { Prenom: "Lyra" };
  window.DATE_EN_JEU_ACTUELLE = { jour: "12", annee: "3" };
  const heros = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", actif: true },
                 { idPersonnage: "H2", idJoueur: "J2", prenom: "Lyra", classe: "Pisteur", actif: true,
                   compagnon: { nom: "Croc-Gris", description: "Un grand loup gris", caractere: "joueur et protecteur", image: "", token: "", blessures: [], mort: false } }];
  window.PERSOS_PARTIE = heros; window.PERSOS_JOUEURS_PARTIE = heros;
  window.__ajouts = []; window.__journal = [];
});
let horloge = Date.now() - 500000;
// (toujours après la dernière narration écrite par le tour, qui porte l'heure réelle)
const tic = () => (horloge = Math.max(horloge, Date.now()) + 1000);
const ecrire = (auteur, nom, texte) => G(([a, n, t, ts]) => { window.__docs["Messages_Chat/m" + ts] = { ID_Partie: "P1", Auteur_ID: a, Auteur_Nom: n, Texte: t, Timestamp: ts }; }, [auteur, nom, texte, tic()]);
const narration = () => G((ts) => { window.__docs["Messages_Chat/n" + ts] = { ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Texte: "Le récit avance.", Est_Narration_IA: true, Timestamp: ts }; }, tic());
const compagnie = () => G(() => ((window.__docs["Systeme_Parties/P1"] || {}).Suiveurs) || []);
const tour = async () => {
  const avant = requetes.length;
  await G(() => { window.__fini = false; window.declencherTourIA().then(() => { window.__fini = true; }); });
  await attendreQue(() => G(() => window.__fini && window.__docs["Systeme_Parties/P1"].IA_En_Cours === false), 20000);
  await p.waitForTimeout(400);
  return requetes.slice(avant);
};
const contexteNarrateur = (reqs) => ((reqs.find(x => x.qui === "NARRATEUR") || {}).systeme) || "";


const narrationFinale = () => G(() => Object.values(window.__docs).filter(m => m && m.Est_Narration_IA && m.Auteur_ID === "MJ" && m.Texte !== "Le récit avance.")
  .sort((a, b) => (b.Timestamp || 0) - (a.Timestamp || 0))[0] || null);

titre("1. LA RÈGLE : UNE RÉPONSE COUPÉE, ET LE RACCORD");
await section(async () => {
  const r = await G(() => ({
    coupeMax: window.reponseCoupeeNarrateur("Nous marchons vers la", "MAX_TOKENS"),
    sansPoint: window.reponseCoupeeNarrateur("Nous marchons vers la", "STOP"),
    finie: window.reponseCoupeeNarrateur("Nous marchons vers la tour.", "STOP"),
    finieGuillemet: window.reponseCoupeeNarrateur("« Allons-y ! »", "STOP"),
    finieQuestion: window.reponseCoupeeNarrateur("Que faites-vous ?\n", undefined),
    mot: window.raccorderNarrateur("Nous marchons vers la tou", "r de guet."),
    motNeuf: window.raccorderNarrateur("Nous marchons vers la", " tour de guet."),
    apresPoint: window.raccorderNarrateur("La nuit tombe.", "Le vent se lève."),
    paragraphe: window.raccorderNarrateur("La nuit tombe.", "\n\nLe vent se lève.")
  }));
  verifier("coupée par la limite de longueur (MAX_TOKENS) : à reprendre", r.coupeMax === true);
  verifier("arrêtée sans ponctuation finale : à reprendre", r.sansPoint === true);
  verifier("finie par un point, un guillemet, une question : rien à reprendre", !r.finie && !r.finieGuillemet && !r.finieQuestion, JSON.stringify(r));
  verifier("le raccord : un mot coupé se recolle (« tou » + « r de guet »)", r.mot === "Nous marchons vers la tour de guet.", r.mot);
  verifier("…un mot neuf garde son espace ; après un point, une espace ; un saut de paragraphe reste", r.motNeuf === "Nous marchons vers la tour de guet." && r.apresPoint === "La nuit tombe. Le vent se lève." && r.paragraphe === "La nuit tombe.\nLe vent se lève.", JSON.stringify([r.motNeuf, r.apresPoint, r.paragraphe]));
});

titre("2. UN VRAI TOUR : LE NARRATEUR S'ARRÊTE EN PLEINE PHRASE, PUIS REPREND");
await section(async () => {
  await preparerTable();
  await ecrire("H1", "Thorin", "Je regarde au loin.");
  faux.premiere = [["Nous longeons les quais. ", null], ["Au loin se dresse la silhouette", "MAX_TOKENS"]];
  faux.reprise = [[" de la vieille tour de guet, et nous pressons le pas.", "STOP"]];
  faux.appelsNarrateur = 0;
  await tour();
  const m = await narrationFinale();
  verifier("le Narrateur est rappelé une fois pour finir sa phrase", faux.appelsNarrateur === 2, String(faux.appelsNarrateur));
  verifier("…avec ce qu'il avait déjà écrit, et la consigne de reprendre sans répéter", !!faux.dernierContenus && faux.dernierContenus.length === 3 && faux.dernierContenus[1].role === "model"
    && /silhouette$/.test(faux.dernierContenus[1].parts[0].text) && /Continue EXACTEMENT là où elle s'arrête/.test(faux.dernierContenus[2].parts[0].text));
  verifier("le récit est complet dans le livre (la phrase finie, plus « en cours »)", !!m && /se dresse la silhouette de la vieille tour de guet, et nous pressons le pas\./.test(m.Texte) && m.Recit_En_Cours === false, m && JSON.stringify([m.Texte, m.Recit_En_Cours]));
  faux.premiere = [["La route s'étire devant la compagnie.\n", "STOP"]];
  faux.appelsNarrateur = 0;
  await ecrire("H1", "Thorin", "J'avance.");
  await tour();
  verifier("une réponse finie : aucun rappel", faux.appelsNarrateur === 1, String(faux.appelsNarrateur));
});

titre("3. LE PETIT CERVEAU : SEULEMENT CE QUE RESSENT LE PNJ");
await section(async () => {
  const r = await G(() => {
    const ames = { H1: { nom: "Thorin", type: "heros" }, PNJ_DOROS: { nom: "Doros", type: "pnj" }, PNJ_KORE: { nom: "Dame Koré", type: "pnj" } };
    return window.SOCIAL.lignesDeMarge([
      { de: "H1", vers: "PNJ_DOROS", axe: "confiance", avant: 0, apres: 4 },
      { de: "PNJ_DOROS", vers: "H1", axe: "attachement", avant: 10, apres: 13 },
      { de: "PNJ_DOROS", vers: "PNJ_KORE", axe: "respect", avant: 0, apres: -2 }
    ], ames).map(l => l.texte);
  });
  verifier("Doros → Thorin et Doros → Dame Koré ; plus jamais Thorin → Doros", r.length === 2 && r.some(t => /^Doros → Thorin : attachement \+3/.test(t)) && r.some(t => /^Doros → Dame Koré : respect −2/.test(t)) && !r.some(t => /^Thorin/.test(t)), JSON.stringify(r));
});

titre("4. UN PNJ QUI QUITTE LE GROUPE : SON SOUVENIR DU DÉPART");
await section(async () => {
  await preparerTable();
  await G(() => {
    const d = window.__docs;
    d["Systeme_Parties/P1"].Suiveurs = [{ id: "PNJ_DOROS", nom: "Doros", etat: "avec", depuis: "Jour 3 de l'an 3", ts: 1000 }];
    d["Systeme_Parties/P1/Souvenirs/s1"] = { ame: "PNJ_DOROS", texte: "Thorin m'a sauvé des bandits sur la route d'Aulis.", sujets: ["H1"], importance: 3, tour: 2, Le: 5000 };
    d["Systeme_Parties/P1/Souvenirs/s2"] = { ame: "PNJ_DOROS", texte: "Lyra a partagé son pain avec moi.", sujets: ["H2"], importance: 1, tour: 3, Le: 6000 };
    d["Systeme_Parties/P1/Souvenirs/s0"] = { ame: "PNJ_DOROS", texte: "Un vieux souvenir d'avant.", sujets: [], importance: 3, tour: 0, Le: 500 };
  });
  await G(() => window.GROUPE.renvoyer("PNJ_DOROS"));
  const sv = await attendreQue(() => G(() => Object.entries(window.__docs).some(([k, v]) => k.startsWith("Systeme_Parties/P1/Souvenirs/depart_PNJ_DOROS"))), 4000)
    ? await G(() => Object.entries(window.__docs).find(([k]) => k.startsWith("Systeme_Parties/P1/Souvenirs/depart_PNJ_DOROS"))[1]) : null;
  verifier("renvoyé depuis le livre : un souvenir du départ, important, au sujet des héros", !!sv && sv.importance === 3 && JSON.stringify(sv.sujets) === '["H1","H2"]', sv && JSON.stringify(sv));
  verifier("…bref : la séparation, depuis quand, ce qu'il en retient (le plus fort d'abord, rien d'avant)", !!sv && /^La compagnie s'est séparée de moi\. J'ai voyagé avec Thorin et Lyra depuis le Jour 3 de l'an 3 ; j'en retiens : Thorin m'a sauvé des bandits sur la route d'Aulis ; Lyra a partagé son pain avec moi\.$/.test(sv.texte) && sv.texte.length <= 300, sv && sv.texte);
  const r = await G(async () => {
    const heros = window.GROUPE.herosDeLaPartie();
    const s = { id: "PNJ_KORE", nom: "Dame Koré", depuis: "Jour 5 de l'an 3", ts: 1 };
    const a = await window.GROUPE.souvenirDuDepart("P1", s, { type: "partir", quand: "Jour 12 de l'an 3", lieu: "Le port de Mégara", raison: "il est parti de lui-même" }, heros);
    const b = await window.GROUPE.souvenirDuDepart("P1", s, { type: "laisser", quand: "Jour 12 de l'an 3", lieu: "Le port de Mégara", raison: "prié d'attendre par Thorin" }, heros);
    const c = await window.GROUPE.souvenirDuDepart("P1", s, { type: "mort", quand: "Jour 12 de l'an 3" }, heros);
    return [a && a.texte, b && b.texte, c];
  });
  verifier("parti de lui-même : « J'ai quitté la compagnie de mon propre chef, à Le port de Mégara… »", /^J'ai quitté la compagnie de mon propre chef, à Le port de Mégara\. J'ai voyagé avec Thorin et Lyra depuis le Jour 5 de l'an 3\.$/.test(r[0] || ""), r[0]);
  verifier("laissé à attendre : « …m'a demandé de l'attendre ici (c'est Thorin qui me l'a demandé) »", /^La compagnie m'a demandé de l'attendre ici \(c'est Thorin qui me l'a demandé\), à Le port de Mégara\. J'ai voyagé avec Thorin et Lyra depuis le Jour 5 de l'an 3\.$/.test(r[1] || ""), r[1]);
  verifier("…sans reprendre l'ancien départ dans « ce qu'il en retient »", !/j'en retiens/.test(r[1] || ""), r[1]);
  verifier("un mort n'écrit pas de souvenir", r[2] === null);
});

titre("5. L'ILLUSTRATEUR : LES MOMENTS FORTS SEULEMENT");
await section(async () => {
  const src = lire("illustrations_recit.js");
  verifier("plus de croquis forcé (forcerApres 0)", await G(() => window.REGLAGES_ILLUSTRATIONS && window.REGLAGES_ILLUSTRATIONS.forcerApres === 0));
  verifier("l'agent est strict : moments forts, une force notée de 1 à 10, 8 au moins", /SEULEMENT LES MOMENTS FORTS/.test(src) && /"force"/.test(src) && /force de 8 ou plus/.test(src) && /Number\(avis\.force\) >= \(R\.forceMin \|\| 8\)/.test(src));
});

titre("6. LE RETOUR SUR L'APP (iPad) : TOUT SE REMESURE");
await section(async () => {
  const n = await G(async () => {
    let compte = 0; const f = () => compte++;
    window.addEventListener("resize", f);
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise(r => setTimeout(r, 1500));
    window.removeEventListener("resize", f);
    return compte;
  });
  verifier("au retour au premier plan : trois remesures (60 ms, 400 ms, 1,2 s)", n >= 3, String(n));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
