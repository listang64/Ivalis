// v480 — LE CLAN NOMADE, ÉTAPE 3 : LA PAGE DU CAMP.
// Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md) : « Entrée « Le camp » dans le sommaire. Transitions :
// à l'ouverture, fondu au noir puis fondu vers l'image du camp, pendant que le livre entier glisse vers le bas et
// disparaît ; au retour vers le livre, transition inverse. Image en 9 couches. Cadrage : bord à bord ; si elle
// dépasse en hauteur, le bas reste collé au bas de l'écran. Outil DEV des encarts (boîtes aux proportions égales,
// couche, couleur semi-transparente, image de référence, sauvegarde, « Copier le code »). Encarts du compagnon du
// pisteur. Placement au hasard des présents (expédition exclue). Clic sur un personnage → discussion privée, sauf
// le sien et celui d'un autre joueur connecté. Les cinq boutons sur aquarelle. Changer de héros principal. Avatars
// du camp : deux images en scène, des pieds à la tête, deux poses tirées au hasard, refaites si l'armure change. »
// Et : « Flâner dans le camp (récit du camp, jamais de combat). »
// Lancer : node tests_monstres/corrections_v480.mjs
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
titre("1. LES RÈGLES DE LA PAGE DU CAMP (camp_pur.js)");
// =========================================================================
await section(async () => {
  verifier("la liste des poses : 44 poses, toutes différentes", CP.POSES_CAMP.length === 44 && new Set(CP.POSES_CAMP).size === 44);
  let toujoursDeux = true;
  for (let k = 0; k < 300; k++) { const [a, b] = CP.deuxPoses(); if (a === b || !CP.POSES_CAMP.includes(a) || !CP.POSES_CAMP.includes(b)) toujoursDeux = false; }
  verifier("deux poses tirées au hasard dans la liste, jamais deux fois la même", toujoursDeux && CP.deuxPoses(suite([0, 0])).join() === [CP.POSES_CAMP[0], CP.POSES_CAMP[1]].join());
  const deux = [{ url: "a" }, { url: "b" }];
  verifier("les images sont à faire : il n'en a pas deux, ou son armure a changé", CP.imagesCampAFaire([], "", "") && CP.imagesCampAFaire([{ url: "a" }], "", "")
    && !CP.imagesCampAFaire(deux, "cuir", "cuir") && CP.imagesCampAFaire(deux, "cuir", "maille") && !CP.imagesCampAFaire(deux, "", ""));
  const camp = { Membres: { T: {}, P1: {}, H1: {} } };
  verifier("présents au camp : les membres et les héros principaux, sauf ceux partis en expédition",
    CP.presentsAuCamp(camp, ["H1", "H2"], ["P1"]).sort().join() === "H1,H2,T");
  const encarts = { 1: { type: "perso" }, 2: { type: "perso" }, 3: {}, 4: { type: "compagnon_gros" }, 5: { type: "compagnon_air" }, 6: { type: "compagnon_petit" } };
  const gens = ["A", "B", "C", "D", "E"].map(id => ({ id, images: [id + "1", id + "2"] })).concat([{ id: "SANS", images: [] }]);
  const vus = new Set(); let bon = true;
  for (let k = 0; k < 200; k++) {
    const pl = CP.placerAuCamp(encarts, gens, [{ id: "LOUP", gabarit: "sol_gros", image: "loup" }, { id: "AIGLE", gabarit: "air", image: "aigle" }]);
    const persos = ["1", "2", "3"].map(n => pl[n]).filter(Boolean);
    // (v494) Chacun n'a que 50 % de chance d'apparaître (corrections_v494) : au plus un par encart, jamais deux fois le même.
    if (persos.length > 3 || new Set(persos.map(x => x.id)).size !== persos.length || persos.some(x => x.id === "SANS" || !x.image.startsWith(x.id))) bon = false;
    if ((pl[4] && (pl[4].id !== "LOUP" || !pl[4].compagnon)) || (pl[5] && pl[5].id !== "AIGLE") || pl[6]) bon = false;
    persos.forEach(x => vus.add(x.id + ":" + x.image));
  }
  verifier("le placement : un personnage par encart « perso », tirés au hasard s'ils sont trop nombreux, une de leurs deux images",
    bon && vus.size === 10, `${vus.size} combinaisons vues`);
  verifier("…le compagnon dans l'encart de son gabarit (sol gros, airs) ; un personnage sans image n'est pas placé", bon);
  const moi = "J1", connectes = new Set(["J1", "J2"]);
  verifier("cliquer : la discussion avec un PNJ, ou le personnage d'un joueur absent",
    CP.peutDiscuterAuCamp({ id: "T", joueur: "" }, moi, connectes) && CP.peutDiscuterAuCamp({ id: "H3", joueur: "J3" }, moi, connectes));
  verifier("…pas avec son propre personnage, ni celui d'un joueur connecté",
    !CP.peutDiscuterAuCamp({ id: "H1", joueur: "J1" }, moi, connectes) && !CP.peutDiscuterAuCamp({ id: "H2", joueur: "J2" }, moi, connectes));
  verifier("connecté : un signe de vie il y a moins de 2 min 30", CP.estConnecte(1000, 1000 + 149000) && !CP.estConnecte(1000, 1000 + 151000) && !CP.estConnecte(undefined, 5));
  const c = { Position: { Region: 7, x: 0.5, y: 0.5 } };
  verifier("le clan est au camp : son pion sur l'icône du camp, ou pas encore placé ; pas en expédition",
    CP.groupeAuCamp(c, { Region: 7, x: 0.52, y: 0.51 }, null) && CP.groupeAuCamp(c, null, null) && CP.groupeAuCamp(c, { Region: 7, x: null, y: null }, null)
    && !CP.groupeAuCamp(c, { Region: 7, x: 0.8, y: 0.5 }, null) && !CP.groupeAuCamp(c, { Region: 3, x: 0.5, y: 0.5 }, null)
    && !CP.groupeAuCamp(c, null, { En_Cours: true }) && !CP.groupeAuCamp(null, null, null));
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
// Les images en scène : un personnage debout (2 × 3).
await p.route('https://img/**', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#a33"/></svg>' }));
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);
await p.evaluate(() => {
  window.jouerSonClic = () => {}; window.__alertes = []; window.alert = (t) => window.__alertes.push(t); window.confirm = () => true;
  localStorage.setItem("ivalis_DEV_MODE", "on");
  localStorage.setItem("ID_JOUEUR_COURANT", "J1");
  window.__docs = window.__docs || {};
  window.ID_PARTIE_COURANTE = "P1";
  const camp = { Position: { Region: 7, x: 0.5, y: 0.5 }, Caisse: 100, Provisions: 28,
    Membres: { PNJ_THEMES_P1: { Type: "pnj", Nom: "Thémès" }, PNJ_ARA: { Type: "pnj", Nom: "Ara" }, PNJ_LOIN: { Type: "pnj", Nom: "Loin" }, PNJ_NU: { Type: "pnj", Nom: "Nu" },
               H1: { Type: "heros", Joueur: "J1" }, H2: { Type: "heros", Joueur: "J2" }, H3: { Type: "heros", Joueur: "J3" }, H1B: { Type: "heros", Joueur: "J1" } } };
  window.__docs["Systeme_Parties/P1"] = { Camp: camp, Heros_Principaux: { J1: "H1" }, Expedition: { Membres: ["PNJ_LOIN"] } };
  window.PARTIE_DATA = window.__docs["Systeme_Parties/P1"];
  window.appliquerCampDeLaPartie(window.PARTIE_DATA);
  const img = (id) => [{ url: `https://img/${id}_1.png`, pose: "a" }, { url: `https://img/${id}_2.png`, pose: "b" }];
  window.PERSOS_JOUEURS_PARTIE = [
    { idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", statut: "Vivant", creeLe: 1, imagesCamp: img("H1") },
    { idPersonnage: "H1B", idJoueur: "J1", prenom: "Bran", statut: "Vivant", creeLe: 2, imagesCamp: img("H1B") },
    { idPersonnage: "H2", idJoueur: "J2", prenom: "Lyra", statut: "Vivant", creeLe: 1, imagesCamp: img("H2"),
      compagnon: { nom: "Croc", image: "https://img/croc.png", gabarit: "sol_gros" } },
    { idPersonnage: "H3", idJoueur: "J3", prenom: "Gorm", statut: "Vivant", creeLe: 1, imagesCamp: img("H3") }];
  window.__docs["Monde_PNJ/PNJ_THEMES_P1"] = { Nom_PNJ: "Thémès", Statut: "Vivant", Images_Camp: img("THEMES") };
  window.__docs["Monde_PNJ/PNJ_ARA"] = { Nom_PNJ: "Ara", Statut: "Vivant", Images_Camp: img("ARA"), URL_Cloudinary: "https://img/ara.png" };
  window.__docs["Monde_PNJ/PNJ_LOIN"] = { Nom_PNJ: "Loin", Statut: "Vivant", Images_Camp: img("LOIN") };
  window.__docs["Monde_PNJ/PNJ_NU"] = { Nom_PNJ: "Nu", Statut: "Vivant", URL_Cloudinary: "https://img/nu.png" };
  // Les joueurs connectés : J1 (moi) et J2 ; J3 est parti il y a longtemps.
  window.__docs["Systeme_Parties/P1/Presence/J2"] = { Le: Date.now(), Joueur: "J2" };
  window.__docs["Systeme_Parties/P1/Presence/J3"] = { Le: Date.now() - 10 * 60000, Joueur: "J3" };
  // 12 encarts « perso » (plus que de présents), et les trois du compagnon.
  const encarts = {};
  for (let n = 1; n <= 12; n++) encarts[n] = { x: 0.05 + (n % 6) * 0.15, y: n <= 6 ? 0.35 : 0.6, cote: 0.08, couche: (n % 9) + 1, type: "perso" };
  encarts[13] = { x: 0.2, y: 0.8, cote: 0.06, couche: 2, type: "compagnon_gros" };
  encarts[14] = { x: 0.4, y: 0.8, cote: 0.04, couche: 2, type: "compagnon_petit" };
  encarts[15] = { x: 0.6, y: 0.1, cote: 0.05, couche: 8, type: "compagnon_air" };
  window.CAMP_SCENE.lireEncarts({ Encarts: encarts, Prochain_Numero: 16 });
  window.__discussions = []; window.DISCUSSION = { ouvrir: (s) => { window.__discussions.push(s); return true; } };
  window.__recit = 0; window.GRIMOIRE_RECIT = { ...(window.GRIMOIRE_RECIT || {}), allerAuRecit: () => { window.__recit++; } };
  // Le livre est à l'écran, ouvert.
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== "ecran-grimoire") e.style.display = "none"; });
  window.afficherGrimoire();
});
await p.waitForTimeout(1300);
await p.evaluate(() => window.ouvrirGrimoire());
await p.waitForTimeout(1200);
await p.evaluate(() => {
  // La note du sommaire (posée par le chapitre « index », en partie).
  if (!document.getElementById("grimoire-note-index")) { const n = document.createElement("p"); n.id = "grimoire-note-index"; document.getElementById("ecran-grimoire").appendChild(n); }
});

titre("2. LE SOMMAIRE : « LE CAMP » OUVRE SA PAGE");
await section(async () => {
  const g = lire("grimoire.js");
  verifier("l'entrée « Le camp » du sommaire ouvre la page du camp (plus de « bientôt »)",
    /camp: \(\) => window\.CAMP_SCENE && window\.CAMP_SCENE\.ouvrir\(\)/.test(g) && !/Le camp se prépare : il arrive bientôt/.test(g) && /\["camp", ?"Le camp"\]/.test(g));
  const ix = lire("index.html");
  verifier("index.html charge la scène, les avatars du camp et leur style", /camp_scene\.js\?v=\d+/.test(ix) && /camp_avatars\.js\?v=\d+/.test(ix) && /camp_scene\.css\?v=\d+/.test(ix));
  const sans = await p.evaluate(async () => { const c = window.CAMP.lire(); window.appliquerCampDeLaPartie({}); const r = await window.CAMP_SCENE.ouvrir();
    const n = document.getElementById("grimoire-note-index"); window.appliquerCampDeLaPartie(window.PARTIE_DATA); return { r, note: n ? n.textContent : "" }; });
  verifier("sans camp : la page ne s'ouvre pas, un mot le dit", sans.r === false && /n'existe pas encore/.test(sans.note), JSON.stringify(sans));
});

titre("3. LA TRANSITION : LE LIVRE GLISSE VERS LE BAS, FONDU AU NOIR, PUIS LE CAMP");
await section(async () => {
  const pendant = p.evaluate(() => window.CAMP_SCENE.ouvrir());
  await p.waitForTimeout(250);
  const mi = await p.evaluate(() => {
    const g = document.getElementById("ecran-grimoire"), e = document.getElementById("ecran-camp");
    const livre = document.getElementById("grimoire-livre"), table = document.getElementById("grimoire-table");
    return { versCamp: g.classList.contains("vers-le-camp"), glisse: livre ? getComputedStyle(livre).translate : "", tableGlisse: table ? getComputedStyle(table).translate : "",
             campVisible: !!(e && e.classList.contains("visible")) };
  });
  const r = await pendant;
  await p.waitForTimeout(800);
  const fin = await p.evaluate(() => {
    const e = document.getElementById("ecran-camp"), livre = document.getElementById("grimoire-livre");
    const y = (s) => parseFloat(String(s || "0 0").split(" ")[1] || "0");
    return { ouvert: window.CAMP_SCENE.ouvert(), visible: e.classList.contains("visible"), opacite: getComputedStyle(e).opacity, z: getComputedStyle(e).zIndex,
             livreY: y(getComputedStyle(livre).translate), hauteur: innerHeight, tableOpacite: getComputedStyle(document.getElementById("grimoire-table")).opacity };
  });
  // (v491) « L'écran derrière le livre devient noir, puis le camp apparaît, PUIS le livre se baisse » (corrections_v491).
  verifier("à l'ouverture : d'abord le noir (la table s'éteint, le livre ne bouge pas encore)", mi.versCamp && (!mi.glisse || mi.glisse === "none" || mi.glisse === "0px") && (mi.tableGlisse === "none" || mi.tableGlisse === "" || mi.tableGlisse === "0px"), JSON.stringify(mi));
  verifier("…le camp n'apparaît qu'après le fondu au noir", !mi.campVisible);
  verifier("à la fin : la page du camp est là, par-dessus le livre ; le livre est sorti par le bas ; la table éteinte",
    r === true && fin.ouvert && fin.visible && Number(fin.opacite) > 0.9 && Number(fin.z) > 30 && fin.livreY >= fin.hauteur && Number(fin.tableOpacite) < 0.05, JSON.stringify(fin));
});

titre("4. L'IMAGE EN 9 COUCHES, BORD À BORD, LE BAS COLLÉ AU BAS DE L'ÉCRAN");
await section(async () => {
  const r = await p.evaluate(() => {
    const d = document.getElementById("decor-camp"), b = d.getBoundingClientRect();
    const couches = [...document.querySelectorAll(".couche-camp")].map(i => ({ n: Number(i.dataset.couche), src: i.getAttribute("src"), z: Number(getComputedStyle(i).zIndex) }));
    return { couches, liens: window.CAMP_SCENE.COUCHES, gauche: b.left, largeur: b.width, bas: b.bottom, ecran: { l: innerWidth, h: innerHeight } };
  });
  verifier("9 couches, dans l'ordre du document (IMG_2313 au 1er plan … IMG_2321 au 9e)", r.couches.length === 9 && r.couches.every((c, i) => c.n === i + 1 && c.src === r.liens[i])
    && /IMG_2313_v6mfqi/.test(r.couches[0].src) && /IMG_2321_xemtvn/.test(r.couches[8].src));
  verifier("…la couche 1 tout au-dessus, la 9 tout au fond", r.couches.every((c, i) => i === 0 || c.z < r.couches[i - 1].z), r.couches.map(c => c.z).join());
  verifier("bord à bord, le bas de l'image au bas de l'écran", Math.abs(r.gauche) < 1 && Math.abs(r.largeur - r.ecran.l) < 1 && Math.abs(r.bas - r.ecran.h) < 1, JSON.stringify(r).slice(-120));
  await p.setViewportSize({ width: 1400, height: 700 }); await p.waitForTimeout(200);
  const large = await p.evaluate(() => { const b = document.getElementById("decor-camp").getBoundingClientRect(); return { top: b.top, bas: b.bottom, l: b.width, h: innerHeight, w: innerWidth }; });
  verifier("un écran plus large : l'image dépasse en haut (tronquée), le bas reste collé", large.top < 0 && Math.abs(large.bas - large.h) < 1 && Math.abs(large.l - large.w) < 1, JSON.stringify(large));
  await p.setViewportSize({ width: 1194, height: 834 }); await p.waitForTimeout(200);
});

titre("5. LES PERSONNAGES DU CAMP, PLACÉS AU HASARD");
await section(async () => {
  // (v494) Chacun n'a que 50 % de chance d'apparaître : on retire jusqu'à ce que tous les présents soient placés.
  await p.evaluate(async () => { for (let k = 0; k < 600 && Object.keys(window.CAMP_SCENE.placement()).length < 7; k++) await window.CAMP_SCENE.preparerPersonnages(); });
  const r = await p.evaluate(() => {
    const pl = window.CAMP_SCENE.placement();
    const persos = [...document.querySelectorAll(".perso-camp")].map(b => ({ id: b.dataset.perso, src: b.querySelector("img").getAttribute("src"),
      z: Number(getComputedStyle(b.closest(".encart-camp")).zIndex), couche: 0 }));
    return { pl, persos, encarts: window.CAMP_SCENE.encarts() };
  });
  const ids = r.persos.map(x => x.id).sort();
  verifier("présents : Thémès, Ara, les héros (principaux ou non) ; ni le membre parti en expédition, ni celui sans images",
    ids.join() === ["COMPAGNON_H2", "H1", "H1B", "H2", "H3", "PNJ_ARA", "PNJ_THEMES_P1"].sort().join(), ids.join());
  verifier("…chacun montre une de ses deux images en scène", r.persos.filter(x => !x.id.startsWith("COMPAGNON")).every(x => new RegExp(`/${x.id.replace("PNJ_", "").replace("_P1", "")}_[12]\\.png$`).test(x.src)), r.persos.map(x => x.src).join(" "));
  const loup = Object.entries(r.pl).find(([, v]) => v.id === "COMPAGNON_H2");
  verifier("le compagnon du pisteur (gros gabarit) dans l'encart « sol, gros »", loup && r.encarts[loup[0]].type === "compagnon_gros" && loup[1].image === "https://img/croc.png", JSON.stringify(loup));
  const couchesOk = await p.evaluate(() => Object.entries(window.CAMP_SCENE.placement()).every(([n, v]) => {
    const b = document.querySelector(`.perso-camp[data-perso="${v.id}"]`); const e = window.CAMP_SCENE.encarts()[n];
    return b && Number(getComputedStyle(b.closest(".encart-camp")).zIndex) === (10 - e.couche) * 10 + 5; }));
  verifier("chaque encart entre les couches du décor (devant sa couche, derrière celle du dessus)", couchesOk);
  const tirages = await p.evaluate(async () => { const vus = new Set(); for (let k = 0; k < 12; k++) { await window.CAMP_SCENE.preparerPersonnages(); vus.add(JSON.stringify(window.CAMP_SCENE.placement())); } return vus.size; });
  verifier("à chaque retour sur la page, un autre placement", tirages > 3, String(tirages));
  // (v494) Chacun n'a que 50 % de chance d'apparaître : on retire jusqu'à ce que tous les présents soient placés.
  await p.evaluate(async () => { for (let k = 0; k < 600 && Object.keys(window.CAMP_SCENE.placement()).length < 7; k++) await window.CAMP_SCENE.preparerPersonnages(); });
  const taille = await p.evaluate(() => { const b = document.querySelector('.perso-camp[data-perso="H1"]'); const e = b.closest(".encart-camp").getBoundingClientRect(); const i = b.querySelector("img").getBoundingClientRect();
    return { e: e.height, i: i.height, bas: Math.abs(i.bottom - e.bottom) }; });
  verifier("l'image jamais plus haute que son encart, les pieds en bas", taille.i <= taille.e + 0.5 && taille.bas < 1.5, JSON.stringify(taille));
});

titre("6. CLIQUER SUR UN PERSONNAGE : LA DISCUSSION PRIVÉE");
await section(async () => {
  // (v494) Chacun n'a que 50 % de chance d'apparaître : on retire jusqu'à ce que tous les présents soient placés.
  await p.evaluate(async () => { for (let k = 0; k < 600 && Object.keys(window.CAMP_SCENE.placement()).length < 7; k++) await window.CAMP_SCENE.preparerPersonnages(); });
  const clic = async (id) => p.evaluate(async (id) => { window.__discussions = []; const b = document.querySelector(`.perso-camp[data-perso="${id}"]`);
    if (!b) return "absent"; b.querySelector("img").click(); await new Promise(r => setTimeout(r, 120)); return window.__discussions.map(s => s.id + "|" + s.nom).join(); }, id);
  const ara = await clic("PNJ_ARA"), h3 = await clic("H3"), h1 = await clic("H1"), h1b = await clic("H1B"), h2 = await clic("H2");
  verifier("un PNJ du camp : la discussion s'ouvre avec lui", ara === "PNJ_ARA|Ara", ara);
  verifier("le héros d'un joueur absent : la discussion s'ouvre (il est traité comme un PNJ)", h3 === "H3|Gorm", h3);
  verifier("son propre personnage (principal ou non) : rien", h1 === "" && h1b === "", `${h1} / ${h1b}`);
  verifier("le héros principal d'un joueur connecté : rien", h2 === "", h2);
});

titre("7. LES CINQ BOUTONS SUR AQUARELLE, LE HÉROS PRINCIPAL, LE RETOUR AU LIVRE");
await section(async () => {
  const r = await p.evaluate(() => {
    const bs = [...document.querySelectorAll(".barre-camp .bouton-camp")];
    const barre = document.querySelector(".barre-camp").getBoundingClientRect();
    return { textes: bs.map(b => b.textContent.trim()), lavis: bs.every(b => b.querySelector("svg.lavis")), haut: barre.top, retour: !!document.querySelector(".retour-livre-camp"),
             heros: (() => { const s = document.querySelector("#heros-camp select.liste-heros-principal"); return s ? { valeur: s.value, options: [...s.options].map(o => o.value) } : null; })(),
             titre: (document.querySelector("#heros-camp .titre-choix-heros") || {}).textContent };
  });
  verifier("en haut de l'image : Former le conseil, Gestion du camp, Flâner dans le camp, Expédition, Déplacer le camp",
    r.textes.join("|") === "Former le conseil|Gestion du camp|Flâner dans le camp|Expédition|Déplacer le camp" && r.haut < 60, r.textes.join("|"));
  verifier("…écrits sur une aquarelle (le lavis du livre)", r.lavis);
  // (v494) Plus de menu « Mon héros principal » dans le camp : une case dans la Gestion du camp (corrections_v494).
  verifier("plus de menu « Mon héros principal » dans le camp (la case est dans la Gestion)", !r.heros && !r.titre, JSON.stringify(r.heros));
  const dep = await p.evaluate(async () => { document.querySelector('[data-camp="deplacer"]').click(); await new Promise(r => setTimeout(r, 100));
    return { ouvert: window.CAMP_SCENE.ouvert(), note: document.getElementById("note-camp").textContent, eteint: document.querySelector('[data-camp="deplacer"]').classList.contains("eteint") }; });
  verifier("« Déplacer le camp » sans vote du conseil : refusé, un mot le dit, la page reste", dep.ouvert && /conseil/.test(dep.note) && dep.eteint, JSON.stringify(dep));
  await p.evaluate(() => document.querySelector('[data-camp="flaner"]').click());
  await p.waitForTimeout(2600);   // (v491) le livre remonte, puis le noir, puis la table
  const fl = await p.evaluate(() => ({ ouvert: window.CAMP_SCENE.ouvert(), recit: window.__recit, versCamp: document.getElementById("ecran-grimoire").classList.contains("vers-le-camp"),
    camp: document.getElementById("ecran-camp").classList.contains("affiche"), livreY: getComputedStyle(document.getElementById("grimoire-livre")).translate }));
  verifier("« Flâner dans le camp » : retour au livre (il remonte), sur la page du récit", !fl.ouvert && fl.recit === 1 && !fl.versCamp && !fl.camp && (fl.livreY === "none" || fl.livreY === "0px" || fl.livreY === ""), JSON.stringify(fl));
  await p.evaluate(() => window.CAMP_SCENE.ouvrir()); await p.waitForTimeout(900);
  await p.evaluate(() => document.querySelector('[data-camp="livre"]').click()); await p.waitForTimeout(1600);
  const lv = await p.evaluate(() => ({ ouvert: window.CAMP_SCENE.ouvert(), table: getComputedStyle(document.getElementById("grimoire-table")).opacity }));
  verifier("« ‹ Le livre » : la transition inverse, la table revient", !lv.ouvert && Number(lv.table) > 0.95, JSON.stringify(lv));
});

titre("8. L'OUTIL DEV DES ENCARTS");
await section(async () => {
  await p.evaluate(() => window.CAMP_SCENE.ouvrir()); await p.waitForTimeout(900);
  const vu = await p.evaluate(() => getComputedStyle(document.querySelector(".dev-encarts-camp")).display);
  verifier("en mode DEV : le bouton des encarts", vu !== "none", vu);
  await p.click(".dev-encarts-camp"); await p.waitForTimeout(150);
  const ed = await p.evaluate(() => { const e = [...document.querySelectorAll(".encart-camp.edition")];
    return { n: e.length, ref: e.every(x => x.querySelector(".reference-encart") && /E782C57D/.test(x.querySelector(".reference-encart").src)),
             couleurs: new Set(e.map(x => x.style.background)).size, transparent: e.every(x => /hsla\(.*0\.35\)/.test(x.getAttribute("style"))),
             carre: e.every(x => Math.abs(x.getBoundingClientRect().width - x.getBoundingClientRect().height) < 0.5) }; });
  verifier("les encarts : des boîtes carrées, une couleur semi-transparente chacune, l'image de référence dedans",
    ed.n === 15 && ed.ref && ed.couleurs > 10 && ed.transparent && ed.carre, JSON.stringify(ed));
  await p.evaluate(() => [...document.querySelectorAll(".outils-encarts-camp button")].find(b => b.dataset.outil === "nouveau").click()); await p.waitForTimeout(150);
  const n = await p.evaluate(() => Object.keys(window.CAMP_SCENE.encarts()).length);
  verifier("« + Encart » en crée un nouveau (le n° 16)", n === 16 && !!(await p.$('[data-encart="16"]')));
  const avant = await p.evaluate(() => ({ ...window.CAMP_SCENE.encarts()["16"] }));
  const box = await (await p.$('[data-encart="16"]')).boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2 + 119.4, box.y + box.height / 2 - 50, { steps: 5 }); await p.mouse.up();
  await p.waitForTimeout(150);
  const apres = await p.evaluate(() => ({ e: { ...window.CAMP_SCENE.encarts()["16"] }, base: window.__docs["Carte_Livre/Camp_Encarts"] }));
  verifier("glisser : il se déplace, et c'est sauvé dans la base (pour toutes les parties)",
    Math.abs(apres.e.x - avant.x - 0.1) < 0.005 && apres.e.y < avant.y && apres.base && apres.base.Encarts["16"] && Math.abs(apres.base.Encarts["16"].x - apres.e.x) < 1e-9 && apres.base.Prochain_Numero === 17, JSON.stringify(apres.e));
  const poignee = await (await p.$('[data-poignee="16"]')).boundingBox();
  await p.mouse.move(poignee.x + 4, poignee.y + 4); await p.mouse.down(); await p.mouse.move(poignee.x + 64, poignee.y + 10, { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(150);
  const red = await p.evaluate(() => { const e = window.CAMP_SCENE.encarts()["16"], el = document.querySelector('[data-encart="16"]').getBoundingClientRect(); return { cote: e.cote, w: el.width, h: el.height }; });
  verifier("étirer par la poignée : il grandit et reste carré", red.cote > apres.e.cote + 0.03 && Math.abs(red.w - red.h) < 0.5, JSON.stringify(red));
  const couche = await p.evaluate(async () => {
    const outil = (o) => [...document.querySelectorAll(".outils-encarts-camp button")].find(b => b.dataset.outil === o).click();
    const c0 = window.CAMP_SCENE.encarts()["16"].couche;
    outil("descendre"); await new Promise(r => setTimeout(r, 60)); const c1 = window.CAMP_SCENE.encarts()["16"].couche;
    const z1 = Number(getComputedStyle(document.querySelector('[data-encart="16"]')).zIndex);
    outil("monter"); await new Promise(r => setTimeout(r, 60)); outil("monter"); await new Promise(r => setTimeout(r, 60));
    const c2 = window.CAMP_SCENE.encarts()["16"].couche, z2 = Number(getComputedStyle(document.querySelector('[data-encart="16"]')).zIndex);
    const sel = document.querySelector(".outils-encarts-camp select"); sel.value = "compagnon_air"; sel.dispatchEvent(new Event("change")); await new Promise(r => setTimeout(r, 60));
    return { c0, c1, c2, z1, z2, type: window.CAMP_SCENE.encarts()["16"].type, base: window.__docs["Carte_Livre/Camp_Encarts"].Encarts["16"] };
  });
  verifier("la couche : ▼ le fait passer derrière, ▲ devant (entre les couches du décor)",
    couche.c1 === couche.c0 + 1 && couche.c2 === couche.c0 - 1 && couche.z1 === (10 - couche.c1) * 10 + 5 && couche.z2 === (10 - couche.c2) * 10 + 5 && couche.z2 > couche.z1, JSON.stringify(couche));
  verifier("le type : personnage, ou compagnon (sol gros, sol petit, airs) — sauvé", couche.type === "compagnon_air" && couche.base.type === "compagnon_air" && couche.base.couche === couche.c2);
  const code = await p.evaluate(() => window.CAMP_SCENE.codeDesEncarts());
  let lu = null; try { lu = JSON.parse(code.replace(/^export const ENCARTS_DEFAUT = /, "").replace(/;$/, "")); } catch (e) {}
  verifier("« Copier le code » : les encarts (positions, tailles, couches, types), prêts à coller dans ENCARTS_DEFAUT",
    /^export const ENCARTS_DEFAUT = \{/.test(code) && lu && Object.keys(lu).length === 16 && lu["16"].type === "compagnon_air" && ["x", "y", "cote", "couche", "type"].every(k => k in lu["1"]), code.slice(0, 120));
  verifier("…et le code a sa place dans camp_scene.js (valable pour toutes les parties futures)", /export const ENCARTS_DEFAUT = \{/.test(lire("camp_scene.js")));
  await p.evaluate(() => [...document.querySelectorAll(".outils-encarts-camp button")].find(b => b.dataset.outil === "fermer").click()); await p.waitForTimeout(100);
  const sorti = await p.evaluate(() => ({ edition: document.querySelectorAll(".encart-camp.edition").length, persos: document.querySelectorAll(".perso-camp").length }));
  verifier("« Fermer » : retour aux personnages", sorti.edition === 0 && sorti.persos > 0, JSON.stringify(sorti));
  const sansDev = await p.evaluate(async () => { localStorage.setItem("ivalis_DEV_MODE", "off"); await new Promise(r => setTimeout(r, 1700));
    const v = getComputedStyle(document.querySelector(".dev-encarts-camp")).display; localStorage.setItem("ivalis_DEV_MODE", "on"); return v; });
  verifier("hors mode DEV : pas de bouton des encarts", sansDev === "none", sansDev);
});

titre("9. AU CAMP, JAMAIS DE COMBAT VENU DE L'EXTÉRIEUR (v506 : une attaque délibérée se joue)");
await section(async () => {
  const r = await p.evaluate(async () => {
    window.cleGemini = () => "cle";
    window.PARTIE_DATA = { ...window.PARTIE_DATA, Expedition: null, Position_Groupe: { Region: 7, x: 0.51, y: 0.5 } };
    window.positionGroupeBrute = () => window.PARTIE_DATA.Position_Groupe;
    const auCamp = window.CAMP.auCamp(), ctx = window.CAMP.contexteMJ();
    const annonce = await window.annoncerDetectionCombat(Date.now());
    window.PARTIE_DATA = { ...window.PARTIE_DATA, Position_Groupe: { Region: 7, x: 0.9, y: 0.2 } };
    const loin = window.CAMP.auCamp(), ctxLoin = window.CAMP.contexteMJ();
    return { auCamp, ctx, annonce, loin, ctxLoin, combat: window.__docs["Systeme_Parties/P1"].Combat_RP || null };
  });
  verifier("le groupe sur l'icône du camp : au camp", r.auCamp === true && r.loin === false);
  // (v506) Nico : « j'ai volontairement attaqué un PNJ, mais ça ne me déclenche pas de combat » : au camp, aucune attaque ne
  // vient de l'extérieur, mais un héros qui attaque délibérément quelqu'un se bat (MIA_COMBAT le sait).
  verifier("…v506 : la détection s'annonce aussi au camp (pour une attaque délibérée d'un héros)", r.annonce === true && r.combat && r.combat.Etat === "detection", JSON.stringify(r.combat));
  verifier("…le narrateur sait qu'il est au camp : aucun danger extérieur, mais une attaque délibérée d'un héros se joue", /LE CAMP DU CLAN/.test(r.ctx) && /aucun danger ne vient de l'extérieur/.test(r.ctx) && /si un héros attaque délibérément/.test(r.ctx) && r.ctxLoin === "");
  const ia = lire("ia_master.js"), cr = lire("combat_rp.js");
  verifier("…le narrateur le reçoit (ia_master.js), MIA_COMBAT sait la scène au camp (combat_rp.js)", /window\.CAMP\.contexteMJ\(\)/.test(ia) && /LA SCÈNE SE PASSE AU CAMP DU CLAN/.test(cr) && !/window\.CAMP\.auCamp\(\)\) return false;/.test(cr));
});

titre("10. LES DEUX IMAGES EN SCÈNE (camp_avatars.js)");
await section(async () => {
  const r = await p.evaluate(async () => {
    const A = window.CAMP_AVATARS;
    const pr = A.promptImageCamp("Thorin", "fendre une bûche à la hache", true, "");
    window.__dessins = []; window.__hebergees = []; window.__oubliees = [];
    window.imageVersBlobPng = async (u) => ({ blob: u });
    window.dessinerAvecReferences = async (perso, armure, prompt) => { window.__dessins.push({ perso: perso && perso.blob, armure: armure && armure.blob, prompt }); return "data:image/png;base64,AAA"; };
    window.hebergerDetoure = async (src) => { const u = "https://img/heberge_" + (window.__hebergees.length + 1) + ".png"; window.__hebergees.push(src); return u; };
    window.peutIllustrerLesObjets = () => true;
    window.oublierImages = async (urls) => { window.__oubliees.push(...urls); };
    const imgs = await A.dessinerImagesCamp({ id: "H1", nom: "Thorin", reference: "https://img/thorin.png", armure: { uid: "a1", image: "https://img/armure.png" } });
    return { pr, imgs, dessins: window.__dessins };
  });
  verifier("le prompt : le personnage EN ENTIER, des pieds à la tête, dans sa pose, sur fond magenta (pour le détourage)",
    /EN ENTIER, DES PIEDS À LA TÊTE/.test(r.pr) && /fendre une bûche à la hache/.test(r.pr) && /MAGENTA/.test(r.pr) && /À L'IDENTIQUE/.test(r.pr) && /armure/.test(r.pr));
  verifier("deux images, deux poses différentes, chacune hébergée détourée", r.imgs && r.imgs.length === 2 && r.imgs[0].pose !== r.imgs[1].pose && r.imgs.every(i => /heberge_/.test(i.url)), JSON.stringify(r.imgs));
  verifier("…l'image actuelle du personnage et celle de son armure en référence", r.dessins.length === 2 && r.dessins.every(d => d.perso === "https://img/thorin.png" && d.armure === "https://img/armure.png"));
  // La veille : Ara n'a pas d'images → elle les reçoit ; Thorin change d'armure → refaites, les anciennes effacées.
  const v = await p.evaluate(async () => {
    window.PERSOS_JOUEURS_PARTIE.forEach(h => { h.imagesCamp = h.imagesCamp || []; });
    const h1 = window.PERSOS_JOUEURS_PARTIE.find(h => h.idPersonnage === "H1");
    window.__docs["Personnages/H1"] = { Prenom: "Thorin" };
    Object.keys(window.CAMP.lire().Membres).forEach(id => { if (id !== "PNJ_NU") { const f = window.__docs["Monde_PNJ/" + id]; if (f) f.Images_Camp_Armure = ""; } });
    window.PERSOS_JOUEURS_PARTIE.forEach(h => { h.imagesCampArmure = h.idPersonnage === "H1" ? "vieille" : ""; h.equipArmure = h.idPersonnage === "H1" ? { nom: "Cuirasse", uid: "neuve", image: "https://img/cuirasse.png" } : null; h.urlCloudinary = "https://img/" + h.idPersonnage + ".png"; });
    window.__dessins = []; window.__oubliees = []; window.__hebergees = [];
    window.fetchGemini = async () => ({ json: async () => ({ candidates: [{ content: { parts: [{ text: '{"gabarit":"sol_gros"}' }] } }] }) });
    const t0 = await window.CAMP_AVATARS.veiller();
    const apres1 = { nu: window.__docs["Monde_PNJ/PNJ_NU"], h1: window.__docs["Personnages/H1"] || null };
    const t1 = await window.CAMP_AVATARS.veiller();
    return { t0, t1, nu: apres1.nu, h1: window.__docs["Personnages/H1"], oubliees: window.__oubliees, dessins: window.__dessins.length };
  });
  verifier("la veille : un membre sans images (« Nu ») reçoit ses deux images, le verrou relâché",
    v.t0 === true && Array.isArray(v.nu.Images_Camp) && v.nu.Images_Camp.length === 2 && v.nu.Images_Camp_En_Cours === 0, JSON.stringify(v.nu).slice(0, 200));
  verifier("…un héros qui a changé d'armure : ses deux images refaites (l'armure notée), les anciennes effacées",
    v.t1 === true && v.h1 && v.h1.Images_Camp && v.h1.Images_Camp.length === 2 && v.h1.Images_Camp_Armure === "neuve" && v.oubliees.includes("https://img/H1_1.png") && v.oubliees.includes("https://img/H1_2.png"), JSON.stringify(v.h1).slice(0, 200));
  const gab = await p.evaluate(async () => {
    const h2 = window.PERSOS_JOUEURS_PARTIE.find(h => h.idPersonnage === "H2");
    h2.compagnon = { nom: "Bec", description: "un aigle royal", image: "https://img/bec.png", gabarit: "" };
    window.__docs["Personnages/H2"] = { Prenom: "Lyra" };
    window.fetchGemini = async (role, corps) => { window.__consigne = JSON.parse(corps).contents[0].parts[0].text; return { json: async () => ({ candidates: [{ content: { parts: [{ text: '{"gabarit":"air"}' }] } }] }) }; };
    await window.CAMP_AVATARS.veiller();
    return { doc: window.__docs["Personnages/H2"], consigne: window.__consigne };
  });
  verifier("le compagnon : une IA dit s'il est au sol (gros ou petit) ou dans les airs (MIA_GABARIT)",
    gab.doc.Compagnon_Gabarit === "air" && /MIA_GABARIT/.test(gab.consigne) && /aigle royal/.test(gab.consigne), JSON.stringify(gab.doc));
  const app = lire("app.js");
  verifier("la fiche du héros lit ses images en scène, son armure dessinée, le gabarit du compagnon (app.js)",
    /imagesCamp: Array\.isArray\(d\.Images_Camp\)/.test(app) && /imagesCampArmure: d\.Images_Camp_Armure/.test(app) && /gabarit: d\.Compagnon_Gabarit/.test(app));
});

titre("11. LES MEMBRES ET LA PRÉSENCE (camp.js)");
await section(async () => {
  const r = await p.evaluate(async () => {
    const ens = await window.CAMP.joueursConnectes();
    return { ens: [...ens].sort() };
  });
  verifier("les joueurs connectés : moi, et ceux qui ont donné signe de vie il y a peu", r.ens.join() === "J1,J2", r.ens.join());
  const c = lire("camp.js");
  verifier("chaque poste donne signe de vie chaque minute ; les héros nés après le camp le rejoignent (moral 60)",
    /setInterval\(signeDeVie, 60000\)/.test(c) && /"Camp\.Membres\." \+ h\.id/.test(c) && (/CP\.MORAL_DEPART\.heros/.test(c) || /CP\.arriveeDuHeros\(camp, h/.test(c)));
});

titre("12. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 480 ou plus (trace_combat.js, version.json)", v >= 480 && JSON.parse(lire("version.json")).version >= 480, `${v} / ${JSON.parse(lire("version.json")).version}`);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
