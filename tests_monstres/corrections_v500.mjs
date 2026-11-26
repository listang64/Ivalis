// v500 — LE CAMP ET SA GESTION : le retour au livre sans disparition, les encarts de Nico, les outils DEV groupés,
// les membres en expédition, les listes de rôles (beige, + et −), les encarts dessinés, parler en privé, renvoyer (DEV).
// Lancer : node tests_monstres/corrections_v500.mjs
import path from 'path';
import fs from 'fs';
import http from 'http';

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

titre("1. LES RÈGLES (camp_pur.js)");
await section(async () => {
  const camp = { Intendant: "A", Membres: { T: { Narrateur: true }, A: { Tache: "chasser" }, B: { Tache: "entrainer", Recrue: "A" }, C: { Tache: "commercer", Commerce: { Paye: false } } } };
  const m = CP.sansRolePourExpedition(camp, "A");
  verifier("choisi pour l'expédition : il perd son rôle (et l'intendance, et d'être la recrue d'un autre)", m["Camp.Membres.A.Tache"] === null && m["Camp.Intendant"] === null && m["Camp.Membres.B.Recrue"] === null, JSON.stringify(m));
  verifier("…un commerce pas encore payé s'annule ; Thémès n'a rien à perdre", CP.sansRolePourExpedition(camp, "C")["Camp.Membres.C.Commerce"] === null && Object.keys(CP.sansRolePourExpedition({ Membres: { PNJ_THEMES_P1: { Narrateur: true, Tache: "x" } } }, "PNJ_THEMES_P1")).length === 0);
  const exp = { Montee: true, Emplacements: [{ Perso: "A" }, null, null], Suiveurs: ["B"] };
  verifier("en expédition (montée) : les places et les suiveurs, pas Thémès", JSON.stringify(CP.enExpedition(exp, camp)) === '["A","B"]' && JSON.stringify(CP.enExpedition({ En_Cours: true, Membres: ["A", "T"] }, camp)) === '["A"]' && CP.enExpedition(null, camp).length === 0);
  const c2 = { Provisions: 50, Caisse: 0, Membres: { A: { Tache: null, Moral: 60 }, B: { Tache: null, Moral: 60 } } };
  const j = CP.journeeDuCamp({ camp: c2, infos: {}, partis: [], choisis: ["A"], principaux: [], jour: 1 }, () => 0.99);
  verifier("choisi pour l'expédition : ni repos ni travail (pas de +3 de moral du repos)", !(j.deltas || {}).A || !(j.deltas.A || []).some(d => /repos/.test(d.raison)), JSON.stringify((j.deltas || {}).A || j.moral || null));
});
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);
const cliquer = (sel) => p.evaluate((sel) => document.querySelector(sel).click(), sel);
await p.evaluate(() => {
  localStorage.setItem("ID_JOUEUR_COURANT", "J1"); localStorage.setItem("ivalis_DEV_MODE", "on");
  window.jouerSonClic = () => {}; window.alert = () => {}; window.confirm = () => true;
  window.COMPTE_JOUEUR = { nom: "Ben", email: "ben@ivalis.fr", admin: false };
  window.LISTE_PARTIES_CACHE = [{ id: "P1", nom: "Les Lames d'Héra" }];
  window.PERSOS_JOUEURS_PARTIE = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", classe: "Protecteur", niveau: 3, creeLe: 1, actif: true },
    { idPersonnage: "H2", idJoueur: "J2", prenom: "Lyra", classe: "Pisteur", niveau: 2, creeLe: 1, actif: true }];
  window.PERSOS_PARTIE = window.PERSOS_JOUEURS_PARTIE.slice();
  window.CARACS_PARTIE = { H1: { force: 14, dex: 10, int: 12, sag: 10, cha: 15 }, H2: { force: 10, dex: 15, int: 10, sag: 12, cha: 10 } };
  window.__docs = window.__docs || {};
  window.__docs["Monde_PNJ/PNJ_THEMES_P1"] = { Nom_PNJ: "Thémès", Narrateur: true };
  window.__docs["Monde_PNJ/PNJ_ARA"] = { Nom_PNJ: "Ara", Occupation: "Cueilleuse", Caracs: { int: 13, force: 8 }, Niveau: 1 };
  window.__docs["Monde_PNJ/PNJ_BORS"] = { Nom_PNJ: "Bors", Occupation: "Chasseur", Caracs: { dex: 14, sag: 6 }, Niveau: 1 };
  window.__docs["Systeme_Parties/P1"] = { Camp: { Position: { Region: 7, x: 0.5, y: 0.5 }, Caisse: 40, Provisions: 28, Ressources: { Jauge: 90, Terrain: "Forêt ou rivière" }, Intendant: null,
    Membres: { PNJ_THEMES_P1: { Type: "pnj", Nom: "Thémès", Narrateur: true, Tache: null, Moral: 60 }, H1: { Type: "heros", Joueur: "J1", Tache: null, Moral: 60 },
               H2: { Type: "heros", Joueur: "J2", Tache: null, Moral: 60 }, PNJ_ARA: { Type: "pnj", Tache: null, Moral: 60 }, PNJ_BORS: { Type: "pnj", Tache: null, Moral: 85 } } } };
  ["Thémès:PNJ_THEMES_P1:pnj", "Thorin:H1:heros", "Lyra:H2:heros", "Ara:PNJ_ARA:pnj", "Bors:PNJ_BORS:pnj"].forEach(x => { const [nom, id, type] = x.split(":");
    window.__docs["Systeme_Parties/P1/Ames/" + id] = { id, type, nom, ref: id, psyche: {}, statut: "vivant" }; });
  window.PORTES_GRIMOIRE = { verifierCle: async () => true, creerPartie: async () => "P_NEUVE", verifierMdpPartie: async (id, m) => ({ ok: m === "sel" }),
    entrerDansPartie: (id) => { window.ID_PARTIE_COURANTE = id; document.getElementById("ecran-jeu").style.display = "block"; } };
  // L'écoute de la partie : chaque écriture revient au jeu (app.js le fait en vrai).
  const voyage = window.appliquerVoyageDeLaPartie;
  window.appliquerVoyageDeLaPartie = (d) => { window.PARTIE_DATA = d; window.appliquerCampDeLaPartie(d); return voyage ? voyage(d) : undefined; };
  window.__relaisPartie = true;
  window.PARTIE_DATA = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]));
  window.appliquerCampDeLaPartie(window.PARTIE_DATA);
  window.positionGroupeBrute = () => null;
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== "ecran-grimoire") e.style.display = "none"; });
  window.afficherGrimoire();
});
await p.waitForTimeout(1300);
await p.evaluate(() => window.ouvrirGrimoire());
await p.waitForTimeout(1200);
await cliquer("#grimoire-btn-charger"); await p.waitForTimeout(700);
await cliquer('#grimoire-liste-parties [data-id="P1"]'); await p.waitForTimeout(150);
await p.fill("#grimoire-mdp-partie", "sel");
await cliquer("#grimoire-valider-partie");
await p.waitForTimeout(1800);
await p.evaluate(() => { window.ID_PARTIE_COURANTE = "P1"; });


titre("2. LE RETOUR AU LIVRE : LE LIVRE NE DISPARAÎT PLUS");
await section(async () => {
  await p.evaluate(() => window.CAMP_SCENE.ouvrir()); await p.waitForTimeout(2600);
  const r = await p.evaluate(async () => {
    const g = document.getElementById("ecran-grimoire"), e = document.getElementById("ecran-camp"), j = [];
    const pr = window.CAMP_SCENE.fermer();
    const t0 = performance.now();
    while (performance.now() - t0 < 2300) {
      await new Promise(r => setTimeout(r, 60));
      j.push({ t: Math.round(performance.now() - t0), zLivre: Number(getComputedStyle(g).zIndex), campVisible: e.classList.contains("affiche") && Number(getComputedStyle(e).opacity) > 0.01, cls: g.className });
    }
    await pr;
    return j;
  });
  const sous = r.filter(x => x.campVisible && x.zLivre < 32);
  verifier("tant que le camp se voit, le livre reste devant lui (z ≥ 33)", sous.length === 0, JSON.stringify(sous.slice(0, 2)));
  verifier("…le noir revient sur le camp, le livre devant (camp-noir)", r.some(x => /camp-dessous/.test(x.cls) && /camp-noir/.test(x.cls)));
  verifier("…puis tout redevient normal", !/camp-dessous|camp-noir|vers-le-camp/.test(r[r.length - 1].cls), r[r.length - 1].cls);
  const cs = lire("camp_scene.js"), mm = cs.match(/export const ENCARTS_DEFAUT = (\{[\s\S]*?\n\});/), def = mm ? JSON.parse(mm[1]) : {};
  const nico = { 6: [0.3776, 0.6848, 0.1154, 9], 13: [0.6357, 0.3125, 0.0977, 3], 14: [0.4818, 0.7241, 0.08, 9], 1: [-0.1193, 0.366, 0.4118, 4], 12: [0.3827, 0.7495, 0.1539, 1] };
  verifier("les encarts de Nico (v500 : le 6, le 13 et le 14 bougent)", Object.keys(def).length === 14 && Object.entries(nico).every(([k, v]) => JSON.stringify([def[k].x, def[k].y, def[k].cote, def[k].couche]) === JSON.stringify(v)), JSON.stringify(def[13]));
});

titre("3. LA GESTION DU CAMP");
await section(async () => {
  await p.evaluate(() => window.CAMP_SCENE.ouvrir()); await p.waitForTimeout(2600);
  await p.evaluate(() => document.querySelector('[data-camp="gestion"]').click()); await p.waitForTimeout(3500);
  await p.evaluate(() => window.GESTION_CAMP.lireInfos(true)); await p.waitForTimeout(600);
  const g = await p.evaluate(() => {
    const gauche = document.querySelector(".page-gestion-gauche");
    const dev = gauche.querySelector(".outils-dev-gestion");
    const avant = dev ? [...gauche.querySelectorAll(".lien-dev, .recrue-dev-gestion")].filter(x => !dev.contains(x)).length : -1;
    return { recrue: !!(dev && dev.querySelector(".recrue-dev-gestion")), dev: !!dev, sep: dev ? dev.querySelector(".separation-dev-gestion").textContent.trim() : "", boutons: dev ? [...dev.querySelectorAll(".lien-dev")].map(x => x.dataset.gc) : [], avant,
             encarts: [...gauche.querySelectorAll(".encart-gestion")].map(x => x.querySelector(".sous-titre-groupe").textContent.trim()), cadres: gauche.querySelectorAll(".encart-gestion > .cadre-main").length };
  });
  verifier("les outils DEV groupés sous une séparation rouge « DEV », rien de DEV ailleurs", g.dev && g.sep === "DEV" && g.avant === 0, JSON.stringify(g));
  verifier("…passer un jour, +20 provisions, +100 drachmes dans la caisse, la bourse, la recrue gratuite", ["jour-dev", "provisions-dev", "caisse-dev", "bourse-dev"].every(x => g.boutons.includes(x)) && g.recrue, g.boutons.join(","));
  verifier("les ressources alentour et le bilan du jour dans deux encarts dessinés à la main", JSON.stringify(g.encarts) === '["Les ressources alentour","Le bilan du jour"]' && g.cadres === 2, JSON.stringify(g));
  const pv = await p.evaluate(async () => {
    const a = window.__docs["Systeme_Parties/P1"].Camp.Provisions, c = window.__docs["Systeme_Parties/P1"].Camp.Caisse;
    window.GESTION_CAMP.agir(document.querySelector('[data-gc="provisions-dev"]')); await new Promise(r => setTimeout(r, 300));
    window.GESTION_CAMP.agir(document.querySelector('[data-gc="caisse-dev"]')); await new Promise(r => setTimeout(r, 300));
    return [window.__docs["Systeme_Parties/P1"].Camp.Provisions - a, window.__docs["Systeme_Parties/P1"].Camp.Caisse - c];
  });
  verifier("+20 provisions, +100 drachmes (DEV)", pv.join() === "20,100", pv.join());
  // La liste des rôles : beige, + et −.
  const l = await p.evaluate(async () => {
    window.GESTION_CAMP.agir(document.querySelector('.membre-gestion[data-membre="PNJ_BORS"] [data-gc="ouvrir-choix"]')); await new Promise(r => setTimeout(r, 200));
    const ul = document.querySelector('.membre-gestion[data-membre="PNJ_BORS"] .liste-choix-gestion');
    const opt = (t) => ul && ul.querySelector(`[data-valeur="${t}"]`);
    const r = { fond: ul ? getComputedStyle(ul).backgroundColor : "", chasser: opt("chasser") ? (opt("chasser").querySelector(".plus-choix") || {}).textContent || "" : "?",
                soigner: opt("soigner") ? (opt("soigner").querySelector(".moins-choix") || {}).textContent || "" : "?", plusVert: opt("chasser") && opt("chasser").querySelector(".plus-choix") ? getComputedStyle(opt("chasser").querySelector(".plus-choix")).color : "" };
    window.GESTION_CAMP.agir(opt("chasser")); await new Promise(r => setTimeout(r, 400));
    r.tache = window.__docs["Systeme_Parties/P1"].Camp.Membres.PNJ_BORS.Tache;
    r.ferme = !document.querySelector('.membre-gestion[data-membre="PNJ_BORS"] .liste-choix-gestion');
    window.GESTION_CAMP.agir(document.querySelector('.page-gestion-gauche [data-gc="ouvrir-choix"][data-quoi="intendant"]')); await new Promise(r => setTimeout(r, 200));
    const ui = document.querySelector('.page-gestion-gauche .liste-choix-gestion');
    r.fondIntendant = ui ? getComputedStyle(ui).backgroundColor : "";
    window.GESTION_CAMP.agir(ui.querySelector('[data-valeur="PNJ_ARA"]')); await new Promise(r => setTimeout(r, 400));
    r.intendant = window.__docs["Systeme_Parties/P1"].Camp.Intendant;
    return r;
  });
  verifier("la liste des rôles : fond beige clair", l.fond === "rgb(244, 233, 210)", l.fond);
  verifier("…des + verts selon sa carac (Bors, Dex 14 : chasser ++), des − s'il n'est pas bon (Sag 6 : soigner −−)", l.chasser === "++" && l.soigner === "−−" && l.plusVert === "rgb(47, 122, 42)", JSON.stringify(l));
  verifier("…choisir un rôle le donne, la liste se referme", l.tache === "chasser" && l.ferme);
  verifier("l'intendant : la même liste beige", l.fondIntendant === "rgb(244, 233, 210)" && l.intendant === "PNJ_ARA", JSON.stringify(l));
  // En expédition : son rôle perdu, l'encart noirci, « En Expédition », en fin de liste.
  const e = await p.evaluate(async () => {
    const d = window.__docs["Systeme_Parties/P1"];
    d.Expedition = { Montee: true, Numero: 1, Emplacements: [null, null, null], Suiveurs: [], Provisions_Prevues: 0 };
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(d)));
    const refus = await window.EXPEDITION.emmener("PNJ_BORS"); await new Promise(r => setTimeout(r, 300));
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"])));
    window.GESTION_CAMP.maj(); await new Promise(r => setTimeout(r, 200));
    const li = document.querySelector('.membre-gestion[data-membre="PNJ_BORS"]'), tous = [...document.querySelectorAll(".membre-gestion")];
    return { refus, tache: window.__docs["Systeme_Parties/P1"].Camp.Membres.PNJ_BORS.Tache, parti: li.classList.contains("parti"), tampon: (li.querySelector(".tampon-expedition") || {}).textContent || "",
             dernier: tous[tous.length - 1].dataset.membre, choix: !!li.querySelector('[data-gc="ouvrir-choix"]'), filtre: getComputedStyle(li.querySelector(".corps-membre-gestion")).filter, parler: !!li.querySelector('[data-gc="parler"]') };
  });
  verifier("emmené en expédition : il perd son rôle au camp", e.refus === "" && e.tache === null, JSON.stringify(e));
  verifier("…son encart noirci, « En Expédition » en gros, en fin de liste, plus de rôle à choisir", e.parti && e.tampon === "En Expédition" && e.dernier === "PNJ_BORS" && !e.choix && /brightness/.test(e.filtre) && !e.parler, JSON.stringify(e));
  // Les avatars plus gros, centrés ; parler en privé ; le − rouge DEV.
  const m = await p.evaluate(async () => {
    const li = [...document.querySelectorAll('.membre-gestion[data-membre="PNJ_ARA"]')].find(x => x.getBoundingClientRect().width > 0), por = li.querySelector(".portrait-gestion"), u = parseFloat(getComputedStyle(li).getPropertyValue("--u")) || 0;
    const coin = li.querySelector(".coin-membre-gestion"), rl = li.getBoundingClientRect(), rc = coin ? coin.getBoundingClientRect() : null;
    const taille = por.getBoundingClientRect().width / u, align = getComputedStyle(li).alignItems;
    let ouvert = null; const avant = window.DISCUSSION.ouvrir; window.DISCUSSION.ouvrir = (s) => { ouvert = s; return true; };
    window.GESTION_CAMP.agir(li.querySelector('[data-gc="parler"]'));
    window.DISCUSSION.ouvrir = avant;
    const h1 = document.querySelector('.membre-gestion[data-membre="H1"]'), themes = document.querySelector('.membre-gestion[data-membre="PNJ_THEMES_P1"]');
    window.GESTION_CAMP.agir(li.querySelector('[data-gc="renvoyer-dev"]')); await new Promise(r => setTimeout(r, 400));
    return { taille, align, coinDroite: rc ? Math.round(rl.right - rc.right) : -1, coinBas: rc ? Math.round(rl.bottom - rc.bottom) : -1,
             ouvert: ouvert && { id: ouvert.id, nom: ouvert.nom, occupation: (ouvert.fiche || {}).Occupation }, parlerHeros: !!h1.querySelector('[data-gc="parler"]'),
             renvoyerThemes: !!themes.querySelector('[data-gc="renvoyer-dev"]'), renvoye: !window.__docs["Systeme_Parties/P1"].Camp.Membres.PNJ_ARA, intendant: window.__docs["Systeme_Parties/P1"].Camp.Intendant,
             rouge: getComputedStyle(document.querySelector('[data-gc="renvoyer-dev"]')).backgroundColor };
  });
  verifier("les avatars des membres plus gros (13 unités), centrés sur leur encart", Math.abs(m.taille - 13) < 0.6 && m.align === "center", JSON.stringify(m));
  verifier("💬 en bas à droite de l'encart : parler en privé (sa fiche de PNJ)", m.coinDroite <= 2 && m.coinBas <= 20 && m.ouvert && m.ouvert.id === "PNJ_ARA" && m.ouvert.nom === "Ara" && m.ouvert.occupation === "Cueilleuse" && !m.parlerHeros, JSON.stringify(m));
  verifier("DEV : un tout petit − rouge pour le renvoyer du camp (pas Thémès) ; l'intendance se libère", m.renvoye && m.intendant === null && !m.renvoyerThemes && m.rouge === "rgb(163, 32, 26)", JSON.stringify(m));
  const sansDev = await p.evaluate(async () => { localStorage.setItem("ivalis_DEV_MODE", "off"); window.GESTION_CAMP.maj(); const r = { outils: !!document.querySelector(".outils-dev-gestion"), moins: !!document.querySelector('[data-gc="renvoyer-dev"]') }; localStorage.setItem("ivalis_DEV_MODE", "on"); window.GESTION_CAMP.maj(); return r; });
  verifier("hors mode DEV : ni outils DEV, ni −", !sansDev.outils && !sansDev.moins, JSON.stringify(sansDev));
});

titre("4. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 500 ou plus", v >= 500 && JSON.parse(lire("version.json")).version >= 500, `${v}`);
  const imports = ["conseil.js", "recrutement.js", "retour_camp.js", "camp_avatars.js", "camp.js", "camp_scene.js", "tache_en_cours.js", "deplacement_camp.js", "expedition.js"].map(f => (lire(f).match(/camp_pur\.js\?v=(\d+)/) || [])[1]);
  verifier("tous les modules lisent les mêmes règles (camp_pur.js ≥ 20)", new Set(imports).size === 1 && Number(imports[0]) >= 20, imports.join(","));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
