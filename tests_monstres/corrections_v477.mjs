// v477 — LE CLAN NOMADE, ÉTAPES 0 ET 1 : L'INVENTAIRE, LE NETTOYAGE DE L'ANCIEN SYSTÈME.
// Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md) : « Retirer la page village et Eraldur (entrée du
// sommaire, page, boutons DEV liés) ; garder les villages régionaux comme lieux qu'on visite. Retirer le Hall de
// guilde et le tableau des missions (génération des 6 missions, feuilles, vote d'acceptation, décalages
// normales/difficiles) ; garder le créateur d'une mission, qui servira aux tâches. Retirer le bouton « Les
// clans », le Livre des clans et la réinitialisation de clan dans les Paramètres. »
// Lancer : node tests_monstres/corrections_v477.mjs
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
    if (chemin.startsWith("Systeme_Parties/") && chemin.split("/").length === 2 && window.__relaisPartie && typeof window.appliquerVoyageDeLaPartie === "function") {
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


// =========================================================================
titre("0. L'INVENTAIRE : CLAN_NOMADE.md");
// =========================================================================
await section(async () => {
  const doc = lire("CLAN_NOMADE.md");
  verifier("l'inventaire est écrit : retiré, réutilisé, modifié ; les points ambigus", /### Retiré/.test(doc) && /### Réutilisé/.test(doc) && /### Modifié/.test(doc) && /## Points ambigus/.test(doc));
});

// =========================================================================
titre("1. CE QUI A DISPARU DU CODE");
// =========================================================================
await section(async () => {
  const existe = (f) => fs.existsSync(path.join(RACINE, f));
  verifier("le Hall de guilde et les clans : grimoire_guilde.js/.css, grimoire_clans.js/.css supprimés",
    !existe("grimoire_guilde.js") && !existe("grimoire_guilde.css") && !existe("grimoire_clans.js") && !existe("grimoire_clans.css"));
  const html = lire("index.html");
  verifier("index.html ne les charge plus, ni les boutons DEV d'Eraldur", !/grimoire_guilde|grimoire_clans|btn-eraldur|creerEraldur|poserPastilleEraldur/.test(html));
  const vr = lire("villages_regionaux.js");
  verifier("villages_regionaux.js : plus d'Eraldur (ni sa création, ni sa page)", !/Eraldur|Hub_Aventuriers|allerAuVillage/.test(vr));
  const g = lire("grimoire.js");
  verifier("grimoire.js : plus de page du village ni de Hall", !/pagesVillage|pageVillage|LIEUX_VILLAGE|pagesGuilde|GRIMOIRE_GUILDE|IMAGE_VILLAGE/.test(g));
  const mg = lire("missions_guilde.js");
  verifier("missions_guilde.js : plus de tableau, de feuille, de vote, de post-it, de décalage",
    !/Guilde", "Tableau"|NB_MISSIONS|DUREE_JOURS|ouvrirFeuille|voterMission|Vote_Mission|postit-mission|DECALAGES|decalageNiveauMission|tirerDecalage/.test(mg));
  verifier("monstres.js : le niveau des créatures est celui du groupe (plus de décalage)", /window\.niveauDesCreatures = \(\) => Math\.max\(1, window\.NIVEAU_GROUPE \|\| 1\);/.test(lire("monstres.js")));
  const pr = lire("grimoire_parametres.js");
  verifier("les Paramètres : plus de « Les clans » ni de réinitialisation", !/ouvrirClans|reinitialiserUnClan|param-clan-reset|CLANS_IVALIS/.test(pr));
  const gf = lire("grimoire_fiches.js");
  verifier("la liste des personnages : plus de collection « Clans », de fanion ni de nom de clan", !/collection\(db, "Clans"\)|clansBase|cadre-banniere-clan|nomClan/.test(gf));
});

// =========================================================================
titre("2. CE QUI RESTE : LE CRÉATEUR D'UNE MISSION, SA FICHE, SON SUIVI");
// =========================================================================
await section(async () => {
  const mg = lire("missions_guilde.js");
  ["genererMission", "lancerMission", "preparerMission", "promptPlan", "contexteMissionMJ", "suivreApresMJ", "terminerMission", "ecrireNotes", "voterAbandon", "marqueMission", "sceauCire", "missionsReussies"]
    .forEach(f => verifier(`missions_guilde.js garde ${f}`, new RegExp(`(export (async )?function ${f}\\b|export const ${f}\\b)`).test(mg)));
  verifier("le défilement rapide tourne toujours les pages à 0,07 s (repris du banc v434)", /const DEFILE = \{ tourne: 70, pause: 8,/.test(lire("grimoire.js")) && /setTimeout\(pas, DEFILE\.pause\)/.test(lire("grimoire.js")));
});

// =========================================================================
//  LA PAGE
// =========================================================================
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);

titre("3. DANS LA PAGE : PLUS DE HALL, DE CLANS NI DE TABLEAU ; LA MISSION EN COURS RESTE");
await section(async () => {
  const r = await p.evaluate(() => ({
    guilde: typeof window.GRIMOIRE_GUILDE, clans: typeof window.CLANS_IVALIS, eraldur: typeof window.creerEraldur, village: typeof (window.GRIMOIRE || {}).allerAuVillage,
    mission: typeof window.GRIMOIRE_MISSION, api: window.MISSIONS_GUILDE ? Object.keys(window.MISSIONS_GUILDE).sort() : [],
    niveau: (window.NIVEAU_GROUPE = 4, window.niveauDesCreatures()) }));
  verifier("plus de Hall de guilde, de clans, d'Eraldur, de page du village", r.guilde === "undefined" && r.clans === "undefined" && r.eraldur === "undefined" && r.village === "undefined", JSON.stringify(r).slice(0, 160));
  verifier("la double page « Mission en cours » est toujours là", r.mission === "object");
  verifier("l'API des missions : le créateur et le lancement, plus le vote ni le tableau",
    r.api.includes("genererMission") && r.api.includes("lancerMission") && !r.api.includes("voterMission") && !r.api.includes("renouveler") && !r.api.includes("ouvrirFeuille"), r.api.join(","));
  verifier("le niveau des créatures : celui du groupe (4)", r.niveau === 4, String(r.niveau));
});

titre("4. LE GROUPE : PLUS DE « LES CLANS › » (v479 : LE MENU « MON HÉROS PRINCIPAL »)");
await section(async () => {
  const gg = lire("grimoire_groupe.js");
  verifier("le bouton « Les clans › » n'est plus sur la page du Groupe", !/Les clans ›<\/span>/.test(gg) && /htmlChoixHeros/.test(gg));
  verifier("…et plus de double page de clan par joueur", !/pageBanniereClan|construireClans/.test(lire("grimoire_fiches.js")));
});

titre("5. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 477 ou plus (trace_combat.js, version.json)", v >= 477 && JSON.parse(lire("version.json")).version >= 477, `${v} / ${JSON.parse(lire("version.json")).version}`);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
