// v421 — LES RENCONTRES RÉCENTES (rencontres_recit.js).
//
// Nico : « quand on clôture un chapitre RP, une IA cherche le type de rencontre
// dans ce chapitre et le range en secret dans la base du groupe ; pas gros, très
// bref ; on envoie cette liste au narrateur afin de ne pas tomber toujours sur le
// même type de rencontre » ; « 5 chapitres » ; « évite » ; aussi à l'IA qui
// compose les ennemis. Sur la VRAIE page (le harnais du banc v418_moteur).
// Lancer : node tests_monstres/corrections_v421.mjs
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
await p.exposeFunction('__fauxGemini', (o) => Object.assign(faux, o));
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
    r.fulfill({ contentType: 'text/event-stream', headers: {'Access-Control-Allow-Origin':'*'},
      body: ["La route s'étire devant la compagnie.\n"].map(t => "data: " + JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }], usageMetadata: { totalTokenCount: 30 } }) + "\r\n\r\n").join("") });
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

const ch = (numero, ...types) => ({ numero, titre: "Chapitre " + numero, ts: numero, rencontres: types.map(type => ({ type, resume: "résumé " + type })) });

// =========================================================================
titre("1. LES RÈGLES : LE CATALOGUE, LES CINQ DERNIERS CHAPITRES, LES PISTES");
// =========================================================================
await section(async () => {
  await preparerTable();
  const r = await G((CH) => {
    const R = window.RENCONTRES;
    const six = CH;
    return {
      net: R.nettoyer({ rencontres: [{ type: "combat-humains", resume: "  bandits   sur la route " }, { type: "dragon-rose", resume: "?" }, { type: "combat-humains" }, { type: "taverne" }, { type: "enigme" }, { type: "ruines" }, { type: "rite" }] }),
      compte: R.compter(six), pistes: R.pistes(six),
      narr: R.contexteNarrateur(six), vide: R.contexteNarrateur([]),
      enn: R.contexteEnnemis(six), ennVide: R.contexteEnnemis([{ numero: 1, rencontres: [{ type: "taverne" }] }]),
      nb: Object.keys(R.TYPES).length, fenetre: R.FENETRE,
      tournent: [3, 4, 5, 6].map(k => R.pistes([{ numero: k, rencontres: [{ type: "taverne" }] }]).join(","))
    };
  }, [ch(1, "rite"), ch(2, "combat-humains", "taverne"), ch(3, "combat-humains"), ch(4, "embuscade", "combat-humains"), ch(5, "taverne"), ch(6, "negociation")]);
  verifier("un catalogue fixe (16 types), une fenêtre de 5 chapitres", r.nb === 16 && r.fenetre === 5);
  verifier("ce que rend l'IA est relu : types connus, une fois chacun, quatre au plus, résumé propre", JSON.stringify(r.net.map(x => x.type)) === '["combat-humains","taverne","enigme","ruines"]' && r.net[0].resume === "bandits sur la route", JSON.stringify(r.net));
  verifier("le compte des 5 derniers chapitres (le 1er, et son rite, est sorti de la fenêtre)", JSON.stringify(r.compte) === '[["combat-humains",3],["taverne",2],["embuscade",1],["negociation",1]]', JSON.stringify(r.compte));
  verifier("les pistes : des types absents de la fenêtre (le rite, vu il y a longtemps, passe après les jamais vus)", r.pistes.length === 3 && !r.pistes.some(t => ["combat-humains", "taverne", "embuscade", "negociation", "rite"].includes(t)), JSON.stringify(r.pistes));
  verifier("les pistes tournent d'un chapitre à l'autre (pas toujours les mêmes)", new Set(r.tournent).size === 4, JSON.stringify(r.tournent));
  verifier("le bloc du Narrateur : déjà vu (×3, ×2), « évite », des pistes", /--- RENCONTRES RÉCENTES \(varie\) ---/.test(r.narr) && /combat contre des humains \(bandits, soldats, mercenaires\) ×3, fête, taverne ou banquet ×2, embuscade, négociation ou marchandage\./.test(r.narr) && /Évite de reproposer/.test(r.narr) && /Pistes peu exploitées : /.test(r.narr), r.narr);
  verifier("…et rien tant qu'aucun chapitre n'est rangé", r.vide === "");
  verifier("pour MIA_ENNEMIS : seulement les combats (humains ×3, embuscade), varier si le récit ne l'impose pas", /combat contre des humains[^\n]*×3, embuscade\. Si le récit n'impose pas qui attaque, varie/.test(r.enn) && !/taverne/.test(r.enn) && r.ennVide === "", r.enn);
});

// =========================================================================
titre("2. LA CLÔTURE D'UN CHAPITRE : MIA_RENCONTRES LIT, LE GROUPE GARDE EN SECRET");
// =========================================================================
await section(async () => {
  await G((o) => window.__fauxGemini(o), { rencontres: [{ type: "combat-humains", resume: "des bandits sur la route d'Aulis" }, { type: "taverne", resume: "une nuit à la Chouette" }, { type: "licorne", resume: "?" }] });
  const avant = requetes.length;
  const res = await G(async () => {
    const t = Date.now() - 60000;
    const msgs = [{ id: "a1", ID_Partie: "P1", Auteur_ID: "H1", Auteur_Nom: "Thorin", Texte: "Je dégaine ma hache face aux bandits.", Timestamp: t },
                  { id: "a2", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Texte: "Les bandits fuient ; le soir, la taverne de la Chouette vous accueille.", Est_Narration_IA: true, Timestamp: t + 1000 }];
    return window.GRIMOIRE_RECIT.archiverChapitre(msgs);
  });
  verifier("le chapitre est rangé (n° 1, son titre)", !!res && res.numero === 1, JSON.stringify(res));
  const ok = await attendreQue(() => G(() => ((window.__docs["Systeme_Parties/P1"] || {}).Rencontres_Recentes || []).length === 1), 6000);
  const l = await G(() => window.__docs["Systeme_Parties/P1"].Rencontres_Recentes);
  verifier("Rencontres_Recentes (la fiche de la partie) : le chapitre 1, combat contre des humains et taverne (la licorne écartée)", ok && l[0].numero === 1 && JSON.stringify(l[0].rencontres.map(x => x.type)) === '["combat-humains","taverne"]' && l[0].titre === "La route d'Aulis", JSON.stringify(l));
  const appel = requetes.slice(avant).find(x => x.qui === "MIA_RENCONTRES");
  verifier("un seul petit appel, qui a lu le chapitre et connaît le catalogue", requetes.slice(avant).filter(x => x.qui === "MIA_RENCONTRES").length === 1 && /bandits/.test(appel.texte) && /combat-surnaturel/.test(appel.systeme));
  verifier("rien n'est écrit dans le chat (les joueurs ne le voient pas)", await G(() => !(window.__ajouts || []).some(a => a.col === "Messages_Chat" && /rencontre/i.test(a.data.Texte || ""))));
});

// =========================================================================
titre("3. DIX CHAPITRES GARDÉS AU PLUS ; UN CHAPITRE RELU REMPLACE LE SIEN");
// =========================================================================
await section(async () => {
  const l = await G(async () => {
    for (let n = 2; n <= 12; n++) await window.RENCONTRES.enregistrer("P1", { numero: n, titre: "C" + n, rencontres: [{ type: "enigme", resume: "" }], ts: n });
    await window.RENCONTRES.enregistrer("P1", { numero: 12, titre: "C12 bis", rencontres: [{ type: "rite", resume: "" }], ts: 99 });
    return window.__docs["Systeme_Parties/P1"].Rencontres_Recentes;
  });
  verifier("les dix derniers (3 à 12), le 12 remplacé", l.length === 10 && l[0].numero === 3 && l[9].numero === 12 && l[9].rencontres[0].type === "rite", JSON.stringify(l.map(x => x.numero)));
});

// =========================================================================
titre("4. LE NARRATEUR LE LIT À CHAQUE TOUR");
// =========================================================================
await section(async () => {
  await G((CH) => { window.__docs["Systeme_Parties/P1"].Rencontres_Recentes = CH; }, [ch(1, "combat-humains"), ch(2, "combat-humains", "taverne"), ch(3, "combat-humains")]);
  await ecrire("H2", "Lyra", "Je contemple la mer.");
  const reqs = await tour();
  const ctx = contexteNarrateur(reqs);
  verifier("« RENCONTRES RÉCENTES (varie) » : combat contre des humains ×3, taverne, « évite », des pistes", /RENCONTRES RÉCENTES \(varie\)[\s\S]*Déjà vu dans les 3 derniers chapitres : combat contre des humains[^\n]*×3, fête, taverne ou banquet\. Évite de reproposer[^\n]*Pistes peu exploitées : [^\n]+\./.test(ctx), ctx.slice(ctx.indexOf("RENCONTRES RÉCENTES") - 5, ctx.indexOf("RENCONTRES RÉCENTES") + 400));
});

// =========================================================================
titre("5. LE BRANCHEMENT");
// =========================================================================
await section(async () => {
  const cr = lire("combat_rp.js"), gr = lire("grimoire_recit.js"), gp = lire("grimoire_parametres.js"), ix = lire("index.html");
  verifier("MIA_ENNEMIS reçoit les combats des derniers chapitres", /contexteEnnemis\(partie\.Rencontres_Recentes\)/.test(cr) && /\$\{listePnj\}\$\{combatsRecents\}/.test(cr));
  verifier("la clôture lance MIA_RENCONTRES avec le titre, et range sans attendre", /analyserChapitre\(texte\)/.test(gr) && /RENCONTRES\.apresChapitre\(idPartie, promesseRencontres, numero, titre\)/.test(gr));
  verifier("les Paramètres (le Maître du Jeu) ont « Rencontres récentes »", /\["rencontres", "Rencontres récentes", \(\) => ouvrirRencontres\(\)\]/.test(gp));
  verifier("index.html charge rencontres_recit.js", /<script type="module" src="rencontres_recit\.js\?v=\d+"><\/script>/.test(ix));
  verifier("aucune erreur de page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
});

await b.close(); serveur.close();
console.log(`\n${echecs === 0 ? "TOUT EST BON" : echecs + " ÉCHEC(S)"}`);
process.exit(echecs ? 1 : 0);
