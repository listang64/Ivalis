// v489 — LE CLAN NOMADE, ÉTAPE 13 : LA RÉPUTATION PAR RÉGION ET LES FINITIONS.
// Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md) : « Réputation du groupe par région : score chiffré, affiché
// sur la page de gauche de chaque région (nom du groupe, puis jauge de réputation) ; utilisée par le RP. Retirer les
// mentions restantes de l'ancien système (textes, aides, Paramètres). »
// Lancer : node tests_monstres/corrections_v489.mjs
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




const CP = await import(path.join(RACINE, 'camp_pur.js'));

// =========================================================================
titre("1. LA RÉPUTATION PAR RÉGION (camp_pur.js)");
// =========================================================================
await section(async () => {
  verifier("un score chiffré par région, de −100 à +100 (0 au départ)", CP.reputationRegion({ Reputation_Regions: { 7: 35 } }, 7) === 35 && CP.reputationRegion({}, 3) === 0);
  verifier("l'écho d'un lieu : trois fois son écart, borné", CP.echoReputation(0, 2) === 6 && CP.echoReputation(10, -3) === 1 && CP.echoReputation(95, 4) === 100 && CP.echoReputation(-98, -5) === -100);
  verifier("ses mots : honnis, mal vus, peu connus, bien vus, adulés", CP.motReputationRegion(-80) === "honnis" && CP.motReputationRegion(-30) === "mal vus" && CP.motReputationRegion(0) === "peu connus"
    && CP.motReputationRegion(30) === "bien vus" && CP.motReputationRegion(70) === "adulés");
  const t = CP.contexteReputationRegion("Les Lames d'Héra", "La Forêt des Murmures", 40);
  verifier("le narrateur la reçoit : le clan, la région, le score, ce qu'il change pour les habitants", /LA RÉPUTATION DU CLAN DANS LA RÉGION/.test(t) && /La Forêt des Murmures/.test(t) && /les membres du clan « Les Lames d'Héra » sont bien vus/.test(t) && /\+40/.test(t) && /même là où le clan n'est jamais passé/.test(t));
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

titre("2. L'ÉCHO DES LIEUX ; LA JAUGE DES PAGES DE RÉGION ; LE NARRATEUR");
await section(async () => {
  const r = await p.evaluate(async () => {
    window.__docs = window.__docs || {}; window.ID_PARTIE_COURANTE = "P1";
    window.LISTE_PARTIES_CACHE = [{ id: "P1", nom: "Les Lames d'Héra" }];
    window.CARTES_REGIONALES = { 7: { nom: "La Forêt des Murmures" }, 3: { nom: "Les Plaines d'Or" } };
    window.__docs["Systeme_Parties/P1"] = { Position_Groupe: { Region: 7, x: 0.3, y: 0.3 }, Camp: { Position: { Region: 7, x: 0.5, y: 0.5 }, Membres: {}, Reputation_Regions: {} } };
    window.appliquerVoyageDeLaPartie = (d) => { window.PARTIE_DATA = d; window.appliquerCampDeLaPartie(d); };
    window.__relaisPartie = true;
    window.PARTIE_DATA = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]));
    window.appliquerCampDeLaPartie(window.PARTIE_DATA);
    window.positionGroupeBrute = () => (window.PARTIE_DATA || {}).Position_Groupe;
    const e1 = await window.CAMP.echoReputation(7, 3);
    const e2 = await window.CAMP.echoReputation(7, 2);
    await new Promise(r => setTimeout(r, 50));
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"])));
    const zone = document.createElement("div"); zone.className = "reputation-region"; zone.dataset.region = "7"; document.body.appendChild(zone);
    const autre = document.createElement("div"); autre.className = "reputation-region"; autre.dataset.region = "3"; document.body.appendChild(autre);
    window.majReputationRegions();
    return { e1, e2, rep: window.__docs["Systeme_Parties/P1"].Camp.Reputation_Regions, zone: zone.textContent.replace(/\s+/g, " ").trim(), jauge: !!zone.querySelector(".jauge-reputation-region i.pos"),
             autre: autre.textContent.replace(/\s+/g, " ").trim(), ctx: window.CAMP.contexteReputationMJ() };
  });
  verifier("la réputation d'un lieu change : sa région en garde l'écho (+9, puis +6 : 15)", r.e1 === 9 && r.e2 === 15 && r.rep[7] === 15, JSON.stringify(r.rep));
  verifier("la page de gauche de la région : le nom du groupe, puis la jauge de sa réputation", /Les Lames d'Héra/.test(r.zone) && r.jauge && /peu connus \(\+15\)/.test(r.zone), r.zone);
  verifier("…chaque région la sienne (les Plaines d'Or : 0)", /peu connus \(0\)/.test(r.autre), r.autre);
  verifier("le narrateur sait la réputation du clan dans la région où il est", /La Forêt des Murmures/.test(r.ctx) && /\+15/.test(r.ctx), r.ctx.slice(0, 120).replace(/\n/g, " "));
  const ia = lire("ia_master.js"), reg = lire("grimoire_regions.js");
  verifier("MIA_REPUTATION fait l'écho (ia_master.js) ; le narrateur reçoit la réputation de la région", /window\.CAMP\.echoReputation\(snapLieu\.data\(\)\.Carte_Regionale, nouveauScore - scoreActuel\)/.test(ia) && /window\.CAMP\.contexteReputationMJ\(\)/.test(ia));
  verifier("les pages de région posent la place de la jauge (grimoire_regions.js)", /class="reputation-region" data-region=/.test(reg) && /window\.majReputationRegions\(\)/.test(reg));
});

titre("3. LES DERNIÈRES MENTIONS DE L'ANCIEN SYSTÈME");
await section(async () => {
  const m = lire("missions_guilde.js");
  verifier("le narrateur ne parle plus de « mission de guilde » : la tâche du clan", /--- LA TÂCHE EN COURS DU CLAN ---/.test(m) && /les tâches du clan nomade d'Ivalis/.test(m) && /une tâche du clan \(une mission\)/.test(m) && !/missions de la guilde|mission de guilde dans/.test(m));
  const fichiers = ["grimoire.js", "grimoire_groupe.js", "grimoire_parametres.js", "grimoire_fiches.js", "grimoire_mission.js", "camp_scene.js", "index.html"];
  const restes = fichiers.filter(f => /Eraldur|Hall de guilde|tableau des missions|« Les clans »|Livre des clans</.test(lire(f).split("\n").filter(l => !/^\s*\/\/|^\s*\/\*|\$\{\/\*/.test(l)).join("\n")));
  verifier("plus d'Eraldur, de Hall de guilde, de tableau des missions ni de Livre des clans dans ce qui s'affiche", restes.length === 0, restes.join(", "));
});

titre("4. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 489 ou plus (trace_combat.js, version.json)", v >= 489 && JSON.parse(lire("version.json")).version >= 489, `${v}`);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
