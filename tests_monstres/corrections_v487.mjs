// v487 — LE CLAN NOMADE, ÉTAPE 11 : LE DÉPLACEMENT DU CAMP.
// Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md) : « Tâche « Déplacer le camp » votée au conseil, puis bouton
// « Déplacer le camp » : déplacement sur la carte sur le même principe que l'expédition. Compteur de jours et décompte des
// provisions pendant le déplacement. Coût : 2 provisions par membre et par jour, moins la réduction du forgeron. Risque
// d'événement : 20 % par jour, moins la réduction de l'éclaireur ; l'événement se joue en RP. À 0 provision : le camp
// s'arrête là où il est, et un conseil extraordinaire s'ouvre. À l'arrivée : nouvelle estimation de la jauge. »
// Lancer : node tests_monstres/corrections_v487.mjs
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
const suite = (valeurs) => { let i = 0; return () => valeurs[i++ % valeurs.length]; };

// =========================================================================
titre("1. LES RÈGLES DU DÉPLACEMENT (camp_pur.js)");
// =========================================================================
await section(async () => {
  verifier("le forgeron : (10 % + 5 % × m) de moins, 5 % au moins ; personne : rien", CP.reductionForgeron(2) === 0.2 && CP.reductionForgeron(-1) === 0.05 && CP.reductionForgeron(null) === 0);
  verifier("l'éclaireur : le risque baisse de (5 + 2 × m) points", CP.reductionEclaireur(2) === 0.09 && CP.reductionEclaireur(0) === 0.05 && CP.reductionEclaireur(null) === 0);
  const camp = { Provisions: 20, Membres: { a: {}, b: {}, c: { Tache: "forger", Moral: 60 }, d: { Tache: "eclaireur", Moral: 60 } }, Deplacement: { En_Cours: true } };
  const infos = { c: { caracs: { force: 14 } }, d: { caracs: { dex: 14 } } };
  verifier("2 provisions par membre et par jour, moins le forgeron (4 × 2 × 0,8 → 7)", CP.coutDuDeplacement(camp, infos) === 7 && CP.coutDuDeplacement({ Membres: { a: {}, b: {}, c: {} } }, {}) === 6);
  verifier("20 % de risque par jour, moins l'éclaireur (20 − 9 = 11 %)", Math.abs(CP.risqueDeLaRoute(camp, infos) - 0.11) < 1e-9 && CP.risqueDeLaRoute({ Membres: {} }, {}) === 0.2);
  verifier("le bouton : seulement après le vote du conseil ; jamais pendant une expédition ni deux fois",
    /conseil doit d'abord voter/.test(CP.peutDeplacer({ Membres: {} }, {})) && CP.peutDeplacer({ Deplacement_Vote: {} }, {}) === "" && /expédition est partie/.test(CP.peutDeplacer({ Deplacement_Vote: {} }, { Expedition: { En_Cours: true } }))
    && /déjà en route/.test(CP.peutDeplacer({ Deplacement_Vote: {}, Deplacement: { En_Cours: true } }, {})));
  const r = CP.journeeDuDeplacement({ camp, infos, position: { Region: 7, x: 0.62, y: 0.41 }, jour: 3 }, () => 0.99);
  verifier("un jour de route : les provisions baissent (20 − 7), le compteur de jours avance, le camp suit le clan sur la carte",
    r.camp.Provisions === 13 && r.camp.Deplacement.Jours === 1 && r.camp.Position.x === 0.62 && r.evenements.cout === 7 && /jour 1 du déplacement/.test(r.journal[0]), JSON.stringify(r.camp.Position));
  const ev = CP.journeeDuDeplacement({ camp, infos }, suite([0.05, 0.1]));
  verifier("…un événement de la route (ici une embuscade), à jouer en RP", ev.evenements.evenementRoute && ev.evenements.evenementRoute.type === "embuscade" && /embuscade/.test(ev.journal.join(" ")));
  const faim = CP.journeeDuDeplacement({ camp: { ...camp, Provisions: 5, Membres: { PNJ_THEMES_P1: { Narrateur: true, Moral: 60 }, P1: { Moral: 60 }, H1: { Moral: 60 }, H2: { Moral: 60 } } }, infos: {}, principaux: ["H1", "H2"] }, () => 0.99);
  verifier("à court : ceux qui ne mangent pas ont faim (les héros principaux en dernier), −10 de moral", faim.evenements.affames.sort().join() === "H1,H2" && faim.camp.Membres.H1.Moral === 50 && faim.camp.Provisions === 0, JSON.stringify(faim.evenements.affames));
  verifier("…à zéro : le camp s'arrête là où il est, un conseil extraordinaire s'ouvre", faim.evenements.arret && faim.camp.Conseil_Extraordinaire && /s'arrête là où il est/.test(faim.journal.join(" ")));
  verifier("en route, le clan n'est pas « au camp » ; il part sans expédition montée", !CP.groupeAuCamp({ Position: { Region: 7, x: 0.5, y: 0.5 }, Deplacement: { En_Cours: true } }, null, null)
    && CP.refusDepartDuCamp({ Camp: { Position: { Region: 7, x: 0.5, y: 0.5 }, Membres: {}, Deplacement: { En_Cours: true } }, Position_Groupe: null }) === "");
  const fin = CP.finDuDeplacement({ Position: { Region: 7, x: 0.5, y: 0.5 }, Deplacement: { En_Cours: true, Jours: 4, Depart: { Region: 7, x: 0.5, y: 0.5 } }, Tache_Votee: { Type: "deplacer" } }, { Region: 7, x: 0.8, y: 0.2 }, { maintenant: 9 });
  verifier("l'arrivée : le camp se pose où est le clan ; le déplacement est gardé ; la tâche « Déplacer le camp » est faite",
    fin.Position.x === 0.8 && !fin.Deplacement && fin.Deplacements_Passes[0].Jours === 4 && !fin.Tache_Votee);
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
await p.evaluate(() => {
  window.jouerSonClic = () => {}; window.alert = () => {};
  localStorage.setItem("ID_JOUEUR_COURANT", "J1");
  window.__docs = window.__docs || {}; window.ID_PARTIE_COURANTE = "P1";
  window.PERSOS_JOUEURS_PARTIE = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", creeLe: 1 }];
  window.CARACS_PARTIE = { H1: { force: 14 } };
  window.__docs["Monde_PNJ/PNJ_ARA"] = { Nom_PNJ: "Ara" };
  window.__docs["Date_En_Jeu/actuelle"] = { Jour: "30", Annee: "3" };
  window.__docs["Systeme_Parties/P1"] = { Position_Groupe: { Region: 7, x: 0.5, y: 0.5 }, Heros_Principaux: { J1: "H1" },
    Camp: { Position: { Region: 7, x: 0.5, y: 0.5 }, Caisse: 40, Provisions: 20, Ressources: { Jauge: 20, Terrain: "Marais" }, Deplacement_Vote: { Conseil: "C1" }, Tache_Votee: { Type: "deplacer", Titre: "Déplacer le camp" },
      Membres: { PNJ_THEMES_P1: { Narrateur: true, Moral: 60 }, H1: { Type: "heros", Tache: "forger", Moral: 60 }, PNJ_ARA: { Type: "pnj", Moral: 60 } } } };
  window.appliquerVoyageDeLaPartie = (d) => { window.PARTIE_DATA = d; window.appliquerCampDeLaPartie(d); };
  window.__relaisPartie = true;
  window.PARTIE_DATA = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]));
  window.appliquerCampDeLaPartie(window.PARTIE_DATA);
  window.positionGroupeBrute = () => (window.PARTIE_DATA || {}).Position_Groupe || null;
  window.__ressources = []; window.estimerRessourcesA = async (pos) => { window.__ressources.push(pos); return { terrain: "Forêt ou rivière", valeur: 92 }; };
});
const partie = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"])));
const relayer = () => p.evaluate(() => window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))));

titre("2. LE BOUTON « DÉPLACER LE CAMP »");
await section(async () => {
  verifier("le conseil l'a voté : le bouton est libre", (await p.evaluate(() => window.DEPLACEMENT_CAMP.peutDeplacer())) === "");
  const r = await p.evaluate(async () => window.DEPLACEMENT_CAMP.commencer());
  const d = await partie();
  verifier("il met le camp en route (le compteur à zéro, d'où il part) ; le vote est consommé", r === "" && d.Camp.Deplacement.En_Cours && d.Camp.Deplacement.Jours === 0 && d.Camp.Deplacement.Depart.x === 0.5 && !d.Camp.Deplacement_Vote, JSON.stringify(d.Camp.Deplacement));
  await relayer();
  verifier("…une seconde fois : non", /déjà en route/.test(await p.evaluate(() => window.DEPLACEMENT_CAMP.peutDeplacer())));
  verifier("…le voyage peut partir sans expédition", (await p.evaluate(() => window.EXPEDITION.refusDepart())) === "");
  const scene = lire("camp_scene.js");
  verifier("la page du camp : le bouton éteint tant que le conseil ne l'a pas voté, puis il lance le déplacement", /DEPLACEMENT_CAMP\.peutDeplacer/.test(scene) && /window\.DEPLACEMENT_CAMP\.commencer\(\)/.test(scene));
});

titre("3. LA ROUTE : LES JOURS, LES PROVISIONS, L'ÉVÉNEMENT");
await section(async () => {
  await p.evaluate(() => { const d = window.__docs["Systeme_Parties/P1"]; d.Voyage_Groupe = { Id: "V9", Etat: "marche", Jour: 1 }; });
  await relayer(); await p.waitForTimeout(500);
  verifier("le voyage du clan part : le déplacement le note", (await partie()).Camp.Deplacement.Voyage === "V9");
  const r = await p.evaluate(async () => {
    const d = window.__docs["Systeme_Parties/P1"]; d.Position_Groupe = { Region: 7, x: 0.6, y: 0.45 };
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(d)));
    const hasard = Math.random; Math.random = () => 0.01;
    try { const res = await window.journeeDuCamp({ cle: "V9:2" }); return res && { cout: res.evenements.cout, ev: res.evenements.evenementRoute && res.evenements.evenementRoute.type }; } finally { Math.random = hasard; }
  });
  await p.waitForTimeout(300);
  const d = await partie(), msgs = await p.evaluate(() => Object.entries(window.__docs).filter(([k]) => k.startsWith("Messages_Chat/")).map(([, v]) => v));
  // 3 membres × 2 = 6, moins 15 % (le forgeron, m +2… ici 20 %) : ceil(4,8) = 5.
  verifier("un jour de route : 2 provisions par membre moins le forgeron (20 → 15), le compteur, le camp avec le clan", r && r.cout === 5 && d.Camp.Provisions === 15 && d.Camp.Deplacement.Jours === 1 && d.Camp.Position.x === 0.6, JSON.stringify(r));
  verifier("…l'événement de la route s'écrit dans le récit (le Destin), pour le jouer en RP", r.ev === "embuscade" && msgs.some(m => m.Auteur_ID === "DESTIN" && /embuscade/.test(m.Texte)));
  const g = lire("grimoire_gestion.js");
  verifier("la gestion du camp montre la route : les jours, les provisions, ce qu'on mange par jour, le risque", /Le camp est en route depuis/.test(g) && /P\.coutDuDeplacement\(camp, infos\)/.test(g) && /P\.risqueDeLaRoute\(camp, infos\)/.test(g));
});

titre("4. L'ARRIVÉE : LE CAMP SE POSE, LA JAUGE EST RÉESTIMÉE");
await section(async () => {
  await p.evaluate(() => { const d = window.__docs["Systeme_Parties/P1"]; delete d.Voyage_Groupe; d.Position_Groupe = { Region: 7, x: 0.7, y: 0.3 }; });
  await relayer(); await p.waitForTimeout(800);
  const d = await partie(), res = await p.evaluate(() => window.__ressources);
  verifier("le voyage s'achève : le camp se pose où est le clan, le déplacement est fini et gardé", !d.Camp.Deplacement && d.Camp.Position.x === 0.7 && d.Camp.Deplacements_Passes.length === 1 && !d.Camp.Tache_Votee, JSON.stringify(d.Camp.Position));
  verifier("…une nouvelle estimation de la jauge des ressources (le marais laisse place à la forêt)", res.length === 1 && res[0].x === 0.7 && d.Camp.Ressources.Jauge === 92 && d.Camp.Ressources.Terrain === "Forêt ou rivière", JSON.stringify(d.Camp.Ressources));
  await relayer();
  verifier("…le clan est de nouveau au camp", await p.evaluate(() => window.CAMP.auCamp()));
});

titre("5. À ZÉRO PROVISION : L'ARRÊT ET LE CONSEIL EXTRAORDINAIRE");
await section(async () => {
  await p.evaluate(() => { const d = window.__docs["Systeme_Parties/P1"]; d.Camp.Deplacement_Vote = { Conseil: "C2" }; d.Camp.Provisions = 3; window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(d))); });
  await p.evaluate(async () => window.DEPLACEMENT_CAMP.commencer());
  await p.evaluate(() => { const d = window.__docs["Systeme_Parties/P1"]; d.Voyage_Groupe = { Id: "V10", Etat: "marche", Jour: 1 }; d.Position_Groupe = { Region: 7, x: 0.75, y: 0.35 }; window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(d))); });
  await p.waitForTimeout(400);
  await p.evaluate(async () => { const hasard = Math.random; Math.random = () => 0.99; try { await window.journeeDuCamp({ cle: "V10:2" }); } finally { Math.random = hasard; } });
  await p.waitForTimeout(600);
  const d = await partie();
  verifier("plus de provisions en route : le camp s'arrête là où il est (le voyage s'arrête aussi)", !d.Camp.Deplacement && !d.Voyage_Groupe && d.Camp.Position.x === 0.75 && d.Camp.Deplacements_Passes.slice(-1)[0].Arret === true, JSON.stringify(d.Camp.Position));
  verifier("…un conseil extraordinaire doit se réunir", d.Camp.Conseil_Extraordinaire && /plus de provisions/.test(d.Camp.Conseil_Extraordinaire.Raison));
});

titre("6. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 487 ou plus (trace_combat.js, version.json)", v >= 487 && JSON.parse(lire("version.json")).version >= 487, `${v}`);
  verifier("index.html charge deplacement_camp.js", /deplacement_camp\.js\?v=\d+/.test(lire("index.html")));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
