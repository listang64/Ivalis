// v504 — LES FICHES ET LA GESTION : plus de déclaration d'amitié ou d'amour depuis la fiche d'un autre joueur ; la jauge
// de rétablissement d'un blessé sous son moral ; les bannières des compétences retracées (irrégulières, chacune la
// sienne) avec, en leur centre, une aquarelle de la couleur de leur type (rouge physique, bleu magique, vert soin, mêlées).
// Lancer : node tests_monstres/corrections_v504.mjs
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
  window.__docs["Monde_PNJ/PNJ_BORS"] = { Nom_PNJ: "Bors", Occupation: "Chasseur", Caracs: { dex: 14 }, Niveau: 1 };
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


titre("1. LE RÉTABLISSEMENT (blessures.js)");
await section(async () => {
  const r = await p.evaluate(() => ({
    rien: window.retablissement([]), definitif: window.retablissement([{ id: "BLE_OEIL_BORGNE" }]),
    plaie: window.retablissement([{ id: "BLE_PLAIE_OUVERTE", jours: 9 }, { id: "BLE_COUPURE_FINE", jours: 1 }]) }));
  verifier("aucune blessure, ou seulement définitive : pas de jauge", r.rien === null && r.definitif === null);
  verifier("la blessure la plus longue : 9 jours restants sur 18, guérie à moitié", r.plaie && r.plaie.jours === 9 && r.plaie.total === 18 && Math.abs(r.plaie.pct - 0.5) < 1e-9, JSON.stringify(r.plaie));
});

titre("2. LA GESTION : LE RÉTABLISSEMENT SOUS LE MORAL");
await section(async () => {
  await p.evaluate(() => { window.PERSOS_JOUEURS_PARTIE.find(h => h.idPersonnage === "H1").blessures = [{ id: "BLE_PLAIE_OUVERTE", jours: 9 }]; });
  await p.evaluate(() => window.CAMP_SCENE.ouvrir()); await p.waitForTimeout(2600);
  await p.evaluate(() => document.querySelector('[data-camp="gestion"]').click()); await p.waitForTimeout(3500);
  await p.evaluate(() => window.GESTION_CAMP.lireInfos(true)); await p.waitForTimeout(600);
  const g = await p.evaluate(() => {
    const li = document.querySelector('.membre-gestion[data-membre="H1"]'), r = li && li.querySelector(".retablissement-gestion");
    const apres = r && r.previousElementSibling;
    return { la: !!r, texte: r ? r.textContent.replace(/\s+/g, " ").trim() : "", largeur: r ? r.querySelector(".barre-retablissement-gestion i").style.width : "", sousMoral: !!(apres && apres.classList.contains("moral-gestion")),
             autre: !!document.querySelector('.membre-gestion[data-membre="PNJ_ARA"] .retablissement-gestion') };
  });
  verifier("Thorin blessé : « Rétablissement », la jauge à 50 %, 9 jours, juste sous son moral", g.la && /Rétablissement/.test(g.texte) && /9 j/.test(g.texte) && g.largeur === "50%" && g.sousMoral, JSON.stringify(g));
  verifier("…pas de jauge pour un personnage sans blessure", !g.autre);
});

titre("3. LA FICHE : PLUS DE DÉCLARATION, LES BANNIÈRES");
await section(async () => {
  const t = await p.evaluate(() => {
    const T = window.GRIMOIRE_FICHES.typesDeCompetence;
    return { phys: T({ Effets_Compiles: [{ nom: "Attaque", desc: "12 dégâts physiques" }] }), mag: T({ Effets_Compiles: [{ nom: "Attaque magique", desc: "9 dégâts magiques" }] }),
             soin: T({ Effets_Compiles: [{ nom: "Soin", desc: "8 PV" }] }), mixte: T({ Effets_Compiles: [{ nom: "Attaque", desc: "6 dégâts physiques" }, { nom: "Soin", desc: "4 PV" }] }),
             rien: T({ Effets_Compiles: [{ nom: "Bouclier", desc: "10" }] }) };
  });
  verifier("le type d'une compétence : physique, magique, soin ; deux types ; rien pour un bouclier", JSON.stringify(t.phys) === '["physique"]' && JSON.stringify(t.mag) === '["magique"]' && JSON.stringify(t.soin) === '["soin"]'
    && JSON.stringify(t.mixte) === '["physique","soin"]' && t.rien.length === 0, JSON.stringify(t));
  const b = await p.evaluate(async () => {
    window.CACHE_COMPETENCES_GLOBAL = window.CACHE_COMPETENCES_GLOBAL || {};
    window.CACHE_COMPETENCES_GLOBAL.H1 = {
      C1: { Nom: "Coup d'estoc", Initiative: 7, Effets_Compiles: [{ nom: "Attaque", desc: "12 dégâts physiques" }] },
      C2: { Nom: "Trait de flamme", Initiative: 5, Effets_Compiles: [{ nom: "Attaque magique", desc: "9 dégâts magiques" }] },
      C3: { Nom: "Mains chaudes", Initiative: 3, Effets_Compiles: [{ nom: "Soin", desc: "8 PV" }] },
      C4: { Nom: "Lame sacrée", Initiative: 4, Effets_Compiles: [{ nom: "Attaque", desc: "6 dégâts physiques" }, { nom: "Attaque magique", desc: "5 dégâts magiques" }] },
      C5: { Nom: "Garde", Initiative: 2, Effets_Compiles: [{ nom: "Bouclier", desc: "10" }] },
      C6: { Nom: "Frappe sûre", Initiative: 6, Effets_Compiles: [{ nom: "Attaque", desc: "8 dégâts physiques" }] } };
    window.GRIMOIRE_FICHES.ouvrir("H1", "onglet-competences"); await new Promise(r => setTimeout(r, 2500));
    const ban = [...document.querySelectorAll('#grimoire-fiches-comp-g .banniere-livre')];
    const de = (id) => ban.find(x => x.dataset.id === id);
    const types = (id) => { const a = de(id) && de(id).querySelector(".aquarelle-banniere"); return a ? a.dataset.types : ""; };
    const couleur = (id) => { const p = de(id) && de(id).querySelector(".aquarelle-banniere path"); return p ? p.getAttribute("fill") : ""; };
    const formes = ban.map(x => x.querySelector(".plaque-banniere .plaque").getAttribute("d"));
    const pointes = new Set(ban.map(x => x.querySelector(".plaque-banniere").dataset.pointe));
    const a = de("C1") && de("C1").querySelector(".aquarelle-banniere"), r = a && a.getBoundingClientRect(), rb = de("C1") && de("C1").getBoundingClientRect();
    return { n: ban.length, c1: types("C1"), c2: types("C2"), c3: types("C3"), c4: types("C4"), c5: types("C5"), rouge: couleur("C1"), bleu: couleur("C2"), vert: couleur("C3"),
             taches4: de("C4") ? de("C4").querySelectorAll(".tache-banniere").length : 0, melange: de("C4") ? getComputedStyle(de("C4").querySelector(".tache-banniere")).mixBlendMode : "",
             toutesDifferentes: new Set(formes).size === formes.length, pointes: [...pointes], centre: r && rb ? Math.abs((r.left + r.width / 2) - (rb.left + rb.width * 0.55)) / rb.width : 1,
             sousTitre: de("C1") ? Number(getComputedStyle(de("C1").querySelector(".aquarelle-banniere")).zIndex) < Number(getComputedStyle(de("C1").querySelector(".titre-banniere")).zIndex) : false };
  });
  verifier("une aquarelle au centre : rouge pour les dégâts physiques, bleue pour les magiques, verte pour le soin", b.c1 === "physique" && b.c2 === "magique" && b.c3 === "soin" && b.rouge === "#b3261e" && b.bleu === "#2f62a8" && b.vert === "#3f8f35" && b.centre < 0.12 && b.sousTitre, JSON.stringify(b));
  verifier("…deux types : les deux couleurs mêlées (deux taches qui se fondent)", b.c4 === "physique magique" && b.taches4 === 2 && b.melange === "multiply", JSON.stringify(b));
  verifier("…une compétence sans dégâts ni soin : pas d'aquarelle", b.c5 === "");
  verifier("les bannières : tracées chacune à sa façon (toutes différentes, plusieurs formes de pointe)", b.n >= 6 && b.toutesDifferentes && b.pointes.length >= 2, JSON.stringify({ n: b.n, diff: b.toutesDifferentes, p: b.pointes }));
  const l = await p.evaluate(async () => {
    window.LIENS_FORTS = window.LIENS_FORTS || {};
    window.GRIMOIRE_FICHES.ouvrir("H2"); await new Promise(r => setTimeout(r, 1500));
    return { declarer: document.querySelectorAll('[data-fa="declarer-lien"], .declarer-lien-fiche').length };
  });
  const gf = lire("grimoire_fiches.js");
  verifier("la fiche du héros d'un autre joueur : plus d'encart pour déclarer une amitié profonde ou un amour", l.declarer === 0 && !/data-fa="declarer-lien"/.test(gf) && !/declarer-lien-fiche/.test(lire("grimoire_fiches.css")), JSON.stringify(l));
});

titre("4. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 504 ou plus", v >= 504 && JSON.parse(lire("version.json")).version >= 504, `${v}`);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
