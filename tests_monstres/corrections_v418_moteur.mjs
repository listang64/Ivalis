// v418 — LA COMPAGNIE : LE MOTEUR DES SUIVEURS (groupe_pur.js, groupe.js, le tour du MJ).
//
// Nico : « des PNJ peuvent nous suivre : on leur demande en RP, le moteur décide
// (seuils, et un jet de Charisme entre les deux) ; trois au plus ; ils suivent le
// groupe partout ; ils peuvent partir d'eux-mêmes (en prévenant d'abord, et le
// départ est joué dans le récit) ; on peut les renvoyer ou les laisser quelque part
// (« attends-nous ici ») ; le Narrateur les joue, et le compagnon du Pisteur aussi
// (son caractère) ; ils ne combattent que dans le récit ; un groupe vaincu : jets
// de blessure pour les suiveurs et le compagnon. » Sur la VRAIE page (le harnais
// du banc v411).
// Lancer : node tests_monstres/corrections_v418_moteur.mjs
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
const faux = { demandes: [], morts: [] };
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

// =========================================================================
titre("1. LES RÈGLES (groupe_pur.js)");
// =========================================================================
await section(async () => {
  await preparerTable();
  const r = await G(() => {
    const GR = window.GROUPE, A = (c, r, a, d) => ({ confiance: c, respect: r, attachement: a, dette: d || 0 });
    return {
      oui: GR.deciderRecrutement({ axesDemandeur: A(60, 40, 50), nbSuiveurs: 0 }),
      non: GR.deciderRecrutement({ axesDemandeur: A(5, 5, 5), nbSuiveurs: 0 }),
      gris: GR.deciderRecrutement({ axesDemandeur: A(30, 30, 20), nbSuiveurs: 0 }),
      grisOk: GR.deciderRecrutement({ axesDemandeur: A(30, 30, 20), nbSuiveurs: 0, jet: { total: 18 } }),
      grisRate: GR.deciderRecrutement({ axesDemandeur: A(30, 30, 20), nbSuiveurs: 0, jet: { total: 9 } }),
      dette: GR.deciderRecrutement({ axesDemandeur: A(30, 30, 20, 60), nbSuiveurs: 0 }),
      attache: GR.deciderRecrutement({ axesDemandeur: A(60, 40, 50), nbSuiveurs: 0, attache: true }),
      veto: GR.deciderRecrutement({ axesDemandeur: A(60, 40, 50), affAutres: [-40], nbSuiveurs: 0 }),
      complet: GR.deciderRecrutement({ axesDemandeur: A(90, 90, 90), nbSuiveurs: 3 }),
      deja: GR.deciderRecrutement({ axesDemandeur: A(90, 90, 90), dejaSuiveur: true }),
      depart: [GR.verdictDepart({ loyaute: 10 }), GR.verdictDepart({ loyaute: -8 }), GR.verdictDepart({ loyaute: -30 }), GR.verdictDepart({ loyaute: -30, averti: true }), GR.verdictDepart({ loyaute: 5, averti: true })],
      jet: GR.lireJet("🎲 Jet de **CHARISME** pour **Lyra** : Résultat : 14 +2 = **16**"),
      mots: [GR.parleDuGroupe("Doros, rejoins-nous !"), GR.parleDuGroupe("Attends-nous ici, veux-tu ?"), GR.parleDuGroupe("Je commande une bière.")],
      loyaute: GR.loyaute([A(60, 40, 50), A(-20, -20, -20)]),
      max: GR.MAX_SUIVEURS
    };
  });
  verifier("affinité 51 : il accepte", r.oui.verdict === "oui", JSON.stringify(r.oui));
  verifier("affinité 5 : il refuse", r.non.verdict === "non");
  verifier("affinité 26 : la zone grise, un jet de Charisme (difficulté entre 11 et 17)", r.gris.verdict === "jet" && r.gris.dd >= 11 && r.gris.dd <= 17, JSON.stringify(r.gris));
  verifier("…réussi (18) il suit ; raté (9) il refuse", r.grisOk.verdict === "oui" && r.grisRate.verdict === "non");
  verifier("une dette envers le héros aide (zone grise → oui)", r.dette.verdict === "oui", JSON.stringify(r.dette));
  verifier("des attaches ici retiennent (51 − 15 : zone grise)", r.attache.verdict === "jet", JSON.stringify(r.attache));
  verifier("une affinité ≤ −30 envers un membre : non", r.veto.verdict === "non");
  verifier("trois suiveurs au plus", r.max === 3 && r.complet.verdict === "non" && /complète/.test(r.complet.raison));
  verifier("déjà suiveur : rien à décider", r.deja.verdict === "deja");
  verifier("le départ : rester, prévenir, prévenir d'abord, partir après avoir prévenu, s'apaiser", JSON.stringify(r.depart) === '["rester","avertir","avertir","partir","apaise"]', JSON.stringify(r.depart));
  verifier("un jet du chat se lit (Charisme, Lyra, 16)", r.jet && r.jet.carac === "CHARISME" && r.jet.nom === "Lyra" && r.jet.total === 16);
  verifier("le filtre des mots : rejoindre, attendre ici — pas une bière", JSON.stringify(r.mots) === "[true,true,false]");
  verifier("la loyauté : la moyenne des affinités envers les héros", r.loyaute === Math.round((51.5 - 20) / 2), String(r.loyaute));
});

// =========================================================================
titre("2. « DOROS, REJOINS-NOUS ! » : IL ACCEPTE, LE NARRATEUR LE SAIT");
// =========================================================================
await section(async () => {
  await ecrire("H1", "Thorin", "Doros, rejoins-nous ! La route sera longue.");
  await G((o) => window.__fauxGemini(o), { demandes: [{ type: "recruter", pnj: "Doros", heros: "Thorin" }] });
  const reqs = await tour();
  if (process.env.V418_DEBUG) console.log(reqs.map(x => x.qui), await G(() => window.__logs));
  verifier("MIA_GROUPE a lu la demande", reqs.some(x => x.qui === "MIA_GROUPE"));
  const c = await compagnie();
  verifier("Doros entre dans la compagnie (avec nous, depuis le Jour 12 de l'an 3)", c.length === 1 && c[0].id === "PNJ_DOROS" && c[0].etat === "avec" && c[0].depuis === "Jour 12 de l'an 3", JSON.stringify(c));
  const ctx = contexteNarrateur(reqs);
  verifier("le Narrateur reçoit LA COMPAGNIE : Doros, et Croc-Gris avec son caractère", /--- LA COMPAGNIE/.test(ctx) && /- Doros \(Docker\) : suiveur/.test(ctx) && /Croc-Gris : le compagnon animal de Lyra[^\n]*caractère : joueur et protecteur/.test(ctx), ctx.slice(ctx.indexOf("LA COMPAGNIE"), ctx.indexOf("LA COMPAGNIE") + 400));
  verifier("…ils ne combattent que dans le récit", /combattent SEULEMENT dans le récit/.test(ctx));
  verifier("…et la décision à jouer : Doros ACCEPTE", /DÉCISIONS DE LA COMPAGNIE[\s\S]*Doros ACCEPTE de rejoindre la compagnie \(demandé par Thorin/.test(ctx));
});

// =========================================================================
titre("3. SANS DEMANDE : PAS D'APPEL À MIA_GROUPE ; LA COMPAGNIE RESTE DANS LE CONTEXTE");
// =========================================================================
await section(async () => {
  await narration();
  await ecrire("H2", "Lyra", "Je contemple la mer.");
  const reqs = await tour();
  verifier("aucun appel à MIA_GROUPE (le filtre des mots)", !reqs.some(x => x.qui === "MIA_GROUPE"));
  const ctx3 = contexteNarrateur(reqs);
  verifier("Doros est toujours dans LA COMPAGNIE du Narrateur, sans décision", /- Doros \(Docker\) : suiveur/.test(ctx3) && !/DÉCISIONS DE LA COMPAGNIE/.test(ctx3), reqs.map(x => x.qui).join(",") + " " + ctx3.slice(ctx3.indexOf("LA COMPAGNIE"), ctx3.indexOf("LA COMPAGNIE") + 700));
});

// =========================================================================
titre("4. LA ZONE GRISE : DAME KORÉ HÉSITE — UN JET DE CHARISME D'ABORD");
// =========================================================================
await section(async () => {
  await narration();
  await ecrire("H2", "Lyra", "Dame Koré, venez avec nous, je vous en prie.");
  await G((o) => window.__fauxGemini(o), { demandes: [{ type: "recruter", pnj: "Dame Koré", heros: "Lyra" }] });
  let reqs = await tour();
  const demande = await G(() => (window.__ajouts || []).filter(a => a.col === "Messages_Chat" && a.data.Auteur_ID === "ARBITRE_DES").pop());
  verifier("l'Arbitre demande un jet de Charisme à Lyra (convaincre Dame Koré)", !!demande && demande.data.Jets_Demandes[0].caracteristique === "CHARISME" && demande.data.Jets_Demandes[0].idPerso === "H2" && /Dame Koré/.test(demande.data.Jets_Demandes[0].action), JSON.stringify(demande && demande.data.Jets_Demandes));
  verifier("…et le Narrateur ne parle pas encore", !reqs.some(x => x.qui === "NARRATEUR"));
  verifier("…Koré n'est pas encore dans la compagnie", (await compagnie()).length === 1);
  await G((ts) => { window.__docs["Messages_Chat/arb" + ts] = { ...(window.__ajouts.filter(a => a.data.Auteur_ID === "ARBITRE_DES").pop().data), Timestamp: ts }; }, tic());
  await ecrire("H2", "Lyra", "🎲 Jet de **CHARISME** pour **Lyra** : Résultat : 17 +1 = **18**");
  reqs = await tour();
  const c = await compagnie();
  verifier("le jet réussi (18) : Dame Koré suit la compagnie", c.some(s => s.id === "PNJ_KORE" && s.etat === "avec"), JSON.stringify(c));
  verifier("…le Narrateur le joue (« se laisse convaincre »)", /Dame Koré ACCEPTE[^\n]*se laisse convaincre \(Charisme 18 contre \d+\)/.test(contexteNarrateur(reqs)));
});

// =========================================================================
titre("5. MYRTO NE SUPPORTE PAS LYRA : ELLE REFUSE, MÊME SI ELLE AIME THORIN");
// =========================================================================
await section(async () => {
  await narration();
  await ecrire("H1", "Thorin", "Myrto, viens avec nous !");
  await G((o) => window.__fauxGemini(o), { demandes: [{ type: "recruter", pnj: "Myrto", heros: "Thorin" }] });
  const reqs = await tour();
  verifier("Myrto refuse (elle ne supporte pas un membre)", !(await compagnie()).some(s => s.id === "PNJ_MYRTO") && /Myrto REFUSE de suivre la compagnie[^\n]*ne supporte pas un membre/.test(contexteNarrateur(reqs)));
});

// =========================================================================
titre("6. ILS SUIVENT LE GROUPE PARTOUT, MÊME EN PLEINE NATURE");
// =========================================================================
await section(async () => {
  const env2 = await G(async () => { const e = await window.preparerEnvironnementIvalis("L_2"); return Object.values(e.pnjsPresents).map(f => [f.Nom_PNJ, !!f.Suiveur]); });
  verifier("au bourg d'Aulis (L_2) : Doros et Koré sont là (suiveurs)", JSON.stringify(env2.sort()) === JSON.stringify([["Dame Koré", true], ["Doros", true]]), JSON.stringify(env2));
  await p.waitForTimeout(200);
  verifier("…et leur place en base a suivi (ID_Lieu L_2)", await G(() => window.__docs["Monde_PNJ/PNJ_DOROS"].ID_Lieu === "L_2" && window.__docs["Monde_PNJ/PNJ_KORE"].ID_Lieu === "L_2"));
  verifier("…Myrto, elle, est restée au port", await G(() => window.__docs["Monde_PNJ/PNJ_MYRTO"].ID_Lieu === "L_1"));
  const nature = await G(async () => Object.keys((await window.preparerEnvironnementIvalis(null)).pnjsPresents).sort());
  verifier("en pleine nature : la compagnie est là aussi", JSON.stringify(nature) === '["Dame Koré","Doros"]', JSON.stringify(nature));
  verifier("…sans perdre sa place (la dernière connue, L_2)", await G(() => window.__docs["Monde_PNJ/PNJ_DOROS"].ID_Lieu === "L_2"));
});

// =========================================================================
titre("7. « ATTENDS-NOUS ICI » : KORÉ RESTE À AULIS ET SORT DU GROUPE");
// =========================================================================
await section(async () => {
  await G(() => { window.__docs["Systeme_Parties/P1"].Lieu_Actuel = "L_2"; });
  await narration();
  await ecrire("H2", "Lyra", "Dame Koré, attendez-nous ici, nous reviendrons.");
  await G((o) => window.__fauxGemini(o), { demandes: [{ type: "laisser", pnj: "Dame Koré", heros: "Lyra" }] });
  const reqs = await tour();
  const k = (await compagnie()).find(s => s.id === "PNJ_KORE") || {};
  verifier("Koré : laissée en arrière, au bourg d'Aulis", k.etat === "laisse" && k.lieu === "Le bourg d'Aulis", JSON.stringify(k));
  verifier("…le Narrateur le joue (« RESTE ICI »)", /Dame Koré RESTE ICI à attendre la compagnie/.test(contexteNarrateur(reqs)));
  await G(() => { window.__docs["Systeme_Parties/P1"].Lieu_Actuel = "L_1"; });
  const port = await G(async () => Object.keys((await window.preparerEnvironnementIvalis("L_1")).pnjsPresents).sort());
  verifier("de retour au port : Doros suit, Koré est restée à Aulis", port.includes("Doros") && !port.includes("Dame Koré") && await G(() => window.__docs["Monde_PNJ/PNJ_KORE"].ID_Lieu === "L_2"), JSON.stringify(port));
});

// =========================================================================
titre("8. DOROS SE FÂCHE : IL PRÉVIENT, PUIS S'EN VA (ET LE NARRATEUR LE RACONTE)");
// =========================================================================
await section(async () => {
  await G(() => { window.__lien("PNJ_DOROS", "H1", { confiance: -20, respect: -10, attachement: -10 }); window.__lien("PNJ_DOROS", "H2", { confiance: -10, respect: 0, attachement: -5 }); });
  await narration();
  await ecrire("H1", "Thorin", "Je marche en tête.");
  let reqs = await tour();
  let d = (await compagnie()).find(s => s.id === "PNJ_DOROS") || {};
  verifier("loyauté −8 : il prévient (averti), il reste", d.etat === "avec" && d.averti === true, JSON.stringify(d));
  verifier("…le Narrateur : Doros est MÉCONTENT, un avertissement", /Doros est MÉCONTENT \(loyauté -\d+\)/.test(contexteNarrateur(reqs)));
  await G(() => { window.__lien("PNJ_DOROS", "H1", { confiance: -50, respect: -30, attachement: -40 }); window.__lien("PNJ_DOROS", "H2", { confiance: -30, respect: -20, attachement: -30 }); });
  await narration();
  await ecrire("H1", "Thorin", "Je presse le pas.");
  reqs = await tour();
  d = (await compagnie()).find(s => s.id === "PNJ_DOROS") || {};
  verifier("après l'avertissement, loyauté très basse : il s'en va (parti)", d.etat === "parti", JSON.stringify(d));
  verifier("…le Narrateur raconte son départ (« QUITTE LA COMPAGNIE de lui-même »)", /Doros QUITTE LA COMPAGNIE de lui-même/.test(contexteNarrateur(reqs)));
  const port = await G(async () => Object.values((await window.preparerEnvironnementIvalis(null)).pnjsPresents).map(f => f.Nom_PNJ));
  verifier("en pleine nature, plus personne ne suit", port.length === 0, JSON.stringify(port));
});

// =========================================================================
titre("9. UN GROUPE VAINCU : LES BLESSURES DE LA COMPAGNIE");
// =========================================================================
await section(async () => {
  // Doros revient dans la compagnie ; le dé de la blessure tombe sur 50 pour lui (la Mort), sur 1 pour le loup.
  await G(() => { window.__docs["Systeme_Parties/P1"].Suiveurs = [{ id: "PNJ_DOROS", nom: "Doros", etat: "avec", depuis: "Jour 12 de l'an 3", ts: 1 }]; });
  const tires = await G(async () => { const des = [0.99, 0.30]; let i = 0; return window.GROUPE.tirerBlessuresCompagnie(() => des[Math.min(i++, des.length - 1)]); });
  verifier("une blessure pour Doros (suiveur) et pour Croc-Gris (compagnon)", !!tires["PNJ_PNJ_DOROS"] && !!tires["COMPAGNON_H2"] && tires["PNJ_PNJ_DOROS"].tirages[0].id === "BLE_MORT", JSON.stringify(Object.keys(tires)));
  await G(async (t) => window.GROUPE.ecrireBlessuresCompagnie(t, () => 0.5), tires);
  verifier("Doros meurt : sa fiche (Statut Mort) et la compagnie (mort)", await G(() => window.__docs["Monde_PNJ/PNJ_DOROS"].Statut === "Mort" && window.__docs["Systeme_Parties/P1"].Suiveurs[0].etat === "mort"));
  const loup = await G(() => window.__docs["Personnages/H2"]);
  verifier("Croc-Gris : sa blessure sur la fiche de Lyra (Compagnon_Blessures), vivant", Array.isArray(loup.Compagnon_Blessures) && loup.Compagnon_Mort === false && (await G(() => window.PERSOS_PARTIE[1].compagnon.blessures.length)) === loup.Compagnon_Blessures.length, JSON.stringify(loup));
  const resume = await G((t) => window.resumeCombatPourMJ({ Ennemis: { Tirage: { depart: [], renforts: [] } } }, { issue: "defaite", blessures: {}, blessuresCompagnie: t }), tires);
  verifier("le Narrateur apprend les blessures de la compagnie (Doros MORT, le compagnon de Lyra)", /Les blessures de la compagnie/.test(resume) && /- Doros : MORT/.test(resume) && /Croc-Gris \(le compagnon de Lyra\)/.test(resume), resume.slice(resume.indexOf("compagnie") - 30, resume.indexOf("compagnie") + 200));
  const mortLoup = await G(async () => { window.PERSOS_PARTIE[1].compagnon.mort = true; return await window.poserCompagnonSurTerrain(window.PERSOS_PARTIE[1], {}); });
  verifier("un compagnon mort ne se pose plus sur le terrain", mortLoup === null);
  await G(() => { window.PERSOS_PARTIE[1].compagnon.mort = false; });
});

// =========================================================================
titre("10. LE RESTE DU BRANCHEMENT");
// =========================================================================
await section(async () => {
  const bu = lire("blessures_ui.js"), cr = lire("combat_rp.js"), ap = lire("app.js"), gc = lire("grimoire_creation.js"), cl = lire("classes.js");
  verifier("cloturerCombat tire (défaite) et écrit les blessures de la compagnie", /issue === "defaite" && window\.GROUPE[^\n]*tirerBlessuresCompagnie/.test(bu) && /ecrireBlessuresCompagnie\(fin\.blessuresCompagnie/.test(bu));
  verifier("les suiveurs ne sont jamais des ennemis (composerLesEnnemis)", /x\.Nom_PNJ && !x\.Suiveur/.test(cr));
  verifier("la fiche garde le caractère, les blessures et la mort du compagnon", /Compagnon_Caractere: donnees\.compagnon\.caractere/.test(ap) && /caractere: d\.Compagnon_Caractere/.test(ap) && /Compagnon_Mort: !!donnees\.compagnon\.mort/.test(ap));
  verifier("la création du compagnon a un encart « Son caractère » (livre et ancienne fenêtre)", /id="creation-compagnon-caractere"/.test(gc) && /id="champ-compagnon-caractere"/.test(cl));
  const c = await G(() => { window.COMPAGNON_TEMP = { nom: "Croc", description: "Un loup", caractere: "agressif" }; return window.compagnonPourCreation("Pisteur"); });
  verifier("…et il part avec le héros créé", !!c && c.caractere === "agressif", JSON.stringify(c));
  verifier("aucune erreur de page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
});

await b.close(); serveur.close();
console.log(`\n${echecs === 0 ? "TOUT EST BON" : echecs + " ÉCHEC(S)"}`);
process.exit(echecs ? 1 : 0);
