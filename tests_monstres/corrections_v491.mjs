// v491 — LE CAMP, SES IMAGES ET SES FINITIONS ; LES IMAGES ALLÉGÉES ; LE CONSEIL ; L'ARÈNE.
// Nico : les images lourdes redimensionnées (une largeur maximale au lien, nettes sur un écran de PC) ; les encarts du
// camp ; les avatars chargés pendant la transition, en q_auto,f_auto ; la transition « noir, puis le camp, PUIS le livre
// se baisse » (et l'inverse) ; ni halo ni zoom au survol ; une ombre légère au pied ; les deux pieds à la même hauteur
// (prompt) ; les boutons espacés selon l'écran ; les encarts du compagnon (DEV) ; la gestion (l'image : les fils
// invisibles, le nom : la fiche) ; l'image rognée en haut et en bas ; les héros non joués au conseil ; le bouton DEV de
// Thémès et de toutes les images ; l'arène (un joueur, trois combattants) ; le clic au pixel.
// Lancer : node tests_monstres/corrections_v491.mjs
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
titre("1. LES IMAGES ALLÉGÉES (une largeur maximale au lien)");
// =========================================================================
await section(async () => {
  const vg = lire("voyage_groupe.js"), cb = lire("combat.js"), crp = lire("combat_rp.js"), ix = lire("index.html"), gr = lire("grimoire.js"), cr = lire("cartes_regionales.js");
  verifier("les deux pions du groupe : 500 de large au plus", /upload\/w_500,c_limit,q_auto,f_auto\/v1792842687\//.test(vg) && /upload\/w_500,c_limit,q_auto,f_auto\/v1792842655\//.test(vg));
  verifier("l'arène : 1280 au plus (combat.js, combat_rp.js)", /w_1280,c_limit,q_auto,f_auto\/v1789076932\/arene/.test(cb) && /w_1280,c_limit,q_auto,f_auto\/v1789076932\/arene/.test(crp));
  verifier("le voile de tour de combat : 1000 au plus (son encart fait 760 au plus)", /w_1000,c_limit,q_auto,f_auto\/v1789309133\/IMG_2122/.test(ix));
  verifier("la couverture du livre (1300) et le fond du sommaire (1100)", /w_1300,c_limit,q_auto,f_auto\/v1793823356\/IMG_2214/.test(gr) && /w_1100,c_limit,q_auto,f_auto\/v1794693462\//.test(gr));
  verifier("le village et le Hall de guilde ne sont plus chargés nulle part", !/IMG_2275_ncxeo8/.test(gr + ix + lire("grimoire_regions.js")) && !/Hall de guilde/.test(gr.split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n")));
  verifier("les cartes régionales : la page du livre à 900 ; un lien déjà « q_auto,f_auto » reçoit quand même sa largeur", /reduireCloudinary\(url, 900\)/.test(cr) && /\(q_auto,f_auto\\\/\)\?/.test(cr));
});

// =========================================================================
titre("2. LES RÈGLES (camp_pur.js) : ROGNAGE, CONSEIL, ARÈNE, THÉMÈS");
// =========================================================================
await section(async () => {
  const b = CP.bornesVisibles(4, 6, (x, y) => (y >= 2 && y <= 4 && x === 1) ? 255 : 0);
  verifier("l'image rognée au premier et au dernier pixel visible (en haut, en bas)", b && b.haut === 2 && b.bas === 4 && CP.bornesVisibles(2, 2, () => 0) === null, JSON.stringify(b));
  verifier("…par une transformation Cloudinary (rien à réenvoyer), compressée", CP.urlRognee("https://res.cloudinary.com/x/image/upload/q_auto,f_auto/v1/a.png", 1024, { haut: 12, bas: 1499 })
    === "https://res.cloudinary.com/x/image/upload/c_crop,x_0,y_12,w_1024,h_1488/q_auto,f_auto/v1/a.png");
  const camp = { Membres: { PNJ_THEMES_P1: { Type: "pnj", Narrateur: true }, H1: { Type: "heros", Joueur: "J1" }, H1B: { Type: "heros", Joueur: "J1" }, H2: { Type: "heros", Joueur: "J2" },
    H3: { Type: "heros", Joueur: "J3" }, A: { Type: "pnj" }, LOIN: { Type: "pnj" } } };
  const persos = [{ idPersonnage: "H1", idJoueur: "J1", creeLe: 1 }, { idPersonnage: "H1B", idJoueur: "J1", creeLe: 2 }, { idPersonnage: "H2", idJoueur: "J2", creeLe: 1 }, { idPersonnage: "H3", idJoueur: "J3", creeLe: 1 }];
  const p = CP.pnjsDuConseil(camp, persos, { J1: "H1" }, new Set(["J1", "J2"]), ["LOIN"]);
  verifier("le conseil : les héros secondaires et ceux des joueurs absents y parlent comme des PNJ ; pas les héros joués, ni Thémès, ni l'expédition",
    JSON.stringify(p.sort()) === JSON.stringify(["A", "H1B", "H3"]), JSON.stringify(p));
  const tous = CP.persosArene([{ idPersonnage: "a" }, { idPersonnage: "b", estIllusion: true }, { idPersonnage: "c", statut: "Mort" }, { idPersonnage: "d" }, { idPersonnage: "e" }, { idPersonnage: "f" }]);
  let l = []; ["a", "d", "e", "f"].forEach(id => { l = CP.choisirCombattantArene(l, id, true); });
  verifier("l'arène : tous les personnages vivants ; trois combattants au plus ; décocher en retire un", tous.length === 4 && l.length === 3 && JSON.stringify(CP.choisirCombattantArene(l, "d", false)) === '["a","e"]', JSON.stringify(l));
  verifier("…les combattants choisis remplacent les héros actifs (mode arène allumé seulement)", CP.combattantsArene({ Actif: true, Combattants: ["d", "a"] }, tous).map(h => h.idPersonnage).join() === "a,d"
    && CP.combattantsArene({ Actif: false, Combattants: ["d"] }, tous) === null && CP.combattantsArene({ Actif: true, Combattants: [] }, tous) === null);
  const d = CP.donneesPortraitThemes({ Race: "Humain", Description_Physique: "Une longue barbe blanche.", Genre: "Homme" });
  verifier("l'avatar de Thémès part de sa fiche, pour le générateur des héros", d.race === "Humain" && d.genre === "Homme" && /barbe blanche/.test(d.signes) && /vieil/.test(d.age) && !!d.style);
  const ca = lire("camp_avatars.js");
  verifier("le prompt des images du camp : les deux pieds à la même hauteur, sur la même ligne", /SES DEUX PIEDS SONT À LA MÊME HAUTEUR, posés sur la même ligne horizontale/.test(ca));
  verifier("chaque image créée est rognée en haut et en bas avant d'être rangée", /images\.push\(\{ url: await rognerHautBas\(url\), pose \}\)/.test(ca));
});

// =========================================================================
//  LA PAGE
// =========================================================================
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) || r.request().url().startsWith("https://img/") ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
// Un personnage debout : la moitié gauche de l'image est transparente (pour le clic au pixel).
await p.route('https://img/**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: /ARA/.test(r.request().url()) ? '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect x="100" width="100" height="300" fill="#a33"/></svg>'
                                       : '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="300"><rect width="200" height="300" fill="#3a3"/></svg>' }));
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);
await p.evaluate(() => {
  window.jouerSonClic = () => {}; window.__alertes = []; window.alert = (t) => window.__alertes.push(t); window.confirm = () => true;
  localStorage.setItem("ivalis_DEV_MODE", "on"); localStorage.setItem("ID_JOUEUR_COURANT", "J1");
  window.__docs = window.__docs || {}; window.ID_PARTIE_COURANTE = "P1";
  const camp = { Position: { Region: 7, x: 0.5, y: 0.5 }, Caisse: 100, Provisions: 28,
    Membres: { PNJ_THEMES_P1: { Type: "pnj", Nom: "Thémès", Narrateur: true }, PNJ_ARA: { Type: "pnj", Nom: "Ara" }, H1: { Type: "heros", Joueur: "J1" }, H2: { Type: "heros", Joueur: "J2" } } };
  window.__docs["Systeme_Parties/P1"] = { Camp: camp, Heros_Principaux: { J1: "H1" } };
  window.PARTIE_DATA = window.__docs["Systeme_Parties/P1"];
  window.appliquerCampDeLaPartie(window.PARTIE_DATA);
  const img = (id) => [{ url: `https://img/${id}_1.png`, pose: "a" }, { url: `https://img/${id}_2.png`, pose: "b" }];
  window.PERSOS_JOUEURS_PARTIE = [
    { idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", classe: "Pisteur", statut: "Vivant", creeLe: 1, imagesCamp: img("H1"), actif: true },
    { idPersonnage: "H2", idJoueur: "J2", prenom: "Lyra", statut: "Vivant", creeLe: 1, imagesCamp: img("H2"), actif: false }];
  window.__docs["Personnages/H1"] = { ID_Joueur: "J1", Prenom_Personnage: "Thorin", Images_Camp: img("H1") };
  window.__docs["Personnages/H2"] = { ID_Joueur: "J2", Prenom_Personnage: "Lyra", Images_Camp: img("H2") };
  window.__docs["Monde_PNJ/PNJ_THEMES_P1"] = { Nom_PNJ: "Thémès", Race: "Humain", Statut: "Vivant", Description_Physique: "Une longue barbe blanche.", Images_Camp: img("THEMES") };
  window.__docs["Monde_PNJ/PNJ_ARA"] = { Nom_PNJ: "Ara", Statut: "Vivant", Images_Camp: img("ARA"), URL_Cloudinary: "https://img/ara.png" };
  window.__discussions = []; window.DISCUSSION = { ouvrir: (s) => { window.__discussions.push(s); return true; } };
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== "ecran-grimoire") e.style.display = "none"; });
  window.afficherGrimoire();
});
await p.waitForTimeout(1300);
await p.evaluate(() => window.ouvrirGrimoire());
await p.waitForTimeout(1200);

titre("3. LA TRANSITION : LE NOIR, PUIS LE CAMP, PUIS LE LIVRE SE BAISSE (ET L'INVERSE)");
await section(async () => {
  const r = await p.evaluate(async () => {
    const t0 = performance.now(), journal = [];
    const g = document.getElementById("ecran-grimoire");
    const obs = new MutationObserver(() => {
      const e = document.getElementById("ecran-camp");
      journal.push({ t: performance.now() - t0, g: [...g.classList].filter(c => /camp/.test(c)).join(" "), camp: e ? [...e.classList].filter(c => c !== "ecran-camp").join(" ") : "" });
    });
    obs.observe(g, { attributes: true, attributeFilter: ["class"] });
    const e0 = document.getElementById("ecran-camp"); if (e0) obs.observe(e0, { attributes: true, attributeFilter: ["class"] });
    let glisse = null; const anim = Element.prototype.animate;
    Element.prototype.animate = function (k, o) { if (glisse === null && JSON.stringify(k).includes("120vh")) glisse = performance.now() - t0; return anim.call(this, k, o); };
    const ok = await window.CAMP_SCENE.ouvrir();
    const ouverture = { ok, glisse, journal: journal.slice(), fin: [...g.classList].join(" ") };
    journal.length = 0;
    const e = document.getElementById("ecran-camp"); obs.observe(e, { attributes: true, attributeFilter: ["class"] });
    const t1 = performance.now();
    let remonte = null; Element.prototype.animate = anim;
    const ferme = window.CAMP_SCENE.fermer();
    await new Promise(r => setTimeout(r, 100));
    const pendantRemontee = { campVisible: e.classList.contains("visible"), dessous: g.classList.contains("camp-dessous"), cache: g.classList.contains("camp-ouvert") };
    await ferme;
    obs.disconnect();
    return { ouverture, pendantRemontee, fermeture: journal.map(j => ({ ...j, t: j.t - (t1 - t0) })), finFerme: [...g.classList].join(" "), campApres: e.className };
  });
  const j = r.ouverture.journal, quand = (f) => (j.find(f) || {}).t;
  const tNoir = quand(x => /vers-le-camp/.test(x.g)), tCamp = quand(x => /visible/.test(x.camp)), tDessous = quand(x => /camp-dessous/.test(x.g));
  verifier("1. l'écran derrière le livre devient noir d'abord (le camp n'est pas encore là)", tNoir !== undefined && tCamp > tNoir + 400, JSON.stringify({ tNoir, tCamp }));
  verifier("2. puis le camp apparaît, derrière le livre (le noir s'efface sur lui)", tDessous !== undefined && tDessous >= tCamp - 5, JSON.stringify({ tCamp, tDessous }));
  verifier("3. PUIS le livre se baisse (après l'apparition du camp)", r.ouverture.glisse !== null && r.ouverture.glisse >= tDessous + 500, JSON.stringify({ glisse: r.ouverture.glisse, tDessous }));
  verifier("…le livre parti ne retient plus rien (caché)", r.ouverture.ok && /camp-ouvert/.test(r.ouverture.fin), r.ouverture.fin);
  verifier("l'inverse : le livre remonte d'abord, devant le camp encore visible…", r.pendantRemontee.campVisible && r.pendantRemontee.dessous && !r.pendantRemontee.cache, JSON.stringify(r.pendantRemontee));
  const f = r.fermeture, tPlusDessous = (f.find(x => !/camp-dessous/.test(x.g)) || {}).t, tCampParti = (f.find(x => !/visible/.test(x.camp) && x.camp !== undefined) || {}).t, tTable = (f.find(x => !/vers-le-camp/.test(x.g)) || {}).t;
  // (v500) Le noir revient sur le camp le livre restant devant (camp-noir) : camp-dessous ne tombe qu'avec le camp.
  const tCampNoir = (f.find(x => /camp-noir/.test(x.g)) || {}).t;
  verifier("…puis le camp s'efface dans le noir, puis l'écran derrière le livre revient", tCampNoir >= 700 && tTable >= tCampNoir + 500 && tPlusDessous >= tCampNoir + 500 && !/vers-le-camp|camp-dessous|camp-ouvert|camp-noir/.test(r.finFerme), JSON.stringify({ tCampNoir, tPlusDessous, tCampParti, tTable, fin: r.finFerme }));
  const css = lire("camp_scene.css");
  verifier("le livre passe devant le camp pendant qu'il glisse (camp-dessous), le noir s'efface en fondu", /#ecran-grimoire\.camp-dessous \{ z-index: 33; \}/.test(css) && /#ecran-grimoire\.camp-dessous::before \{ opacity: 0; \}/.test(css));
  const cs = lire("camp_scene.js");
  verifier("les avatars se chargent pendant le noir (préparés et décodés avant d'apparaître)", /const pret = preparerPersonnages\(\)\.then\(\(\) => precharger\(\)\)/.test(cs) && /await Promise\.race\(\[pret, attendre\(ATTENTE_IMAGES_MAX\)\]\)/.test(cs));
});

titre("4. LES PERSONNAGES DU CAMP : NI HALO NI ZOOM, UNE OMBRE AU PIED, LE CLIC AU PIXEL ; LES BOUTONS ; LES ENCARTS");
await section(async () => {
  await p.evaluate(() => window.CAMP_SCENE.ouvrir()); await p.waitForTimeout(400);
  const r = await p.evaluate(async () => {
    const enc = {}; enc[1] = { x: 0.3, y: 0.3, cote: 0.3, couche: 2, type: "perso" }; enc[2] = { x: 0.3, y: 0.3, cote: 0.3, couche: 5, type: "perso" };
    // Ara est au camp avec un seul autre : Thémès (les héros partent à l'expédition du banc).
    window.PARTIE_DATA = { ...window.PARTIE_DATA, Expedition: { Membres: ["H1", "H2"] } };
    window.CAMP_SCENE.lireEncarts({ Encarts: enc, Prochain_Numero: 3 });
    await window.CAMP_SCENE.preparerPersonnages();
    // (v494) 50 % de chance d'apparaître : on retire jusqu'à avoir les deux.
    for (let k = 0; k < 200 && Object.keys(window.CAMP_SCENE.placement()).length < 2; k++) await window.CAMP_SCENE.preparerPersonnages();
    await window.CAMP_SCENE.precharger();
    await new Promise(r => setTimeout(r, 300));
    const pl = window.CAMP_SCENE.placement(), devant = pl[1] && pl[1].id, derriere = pl[2] && pl[2].id;
    const imgs = [...document.querySelectorAll("#encarts-camp .silhouette-camp img")];
    const i1 = document.querySelector(`.perso-camp[data-perso="${devant}"] img`).getBoundingClientRect();
    // L'image d'Ara fait 200 × 300, sa moitié gauche transparente ; les autres sont pleines.
    const droite = window.CAMP_SCENE.toucherPerso(i1.left + i1.width * 0.8, i1.top + i1.height * 0.5);
    const gauche = window.CAMP_SCENE.toucherPerso(i1.left + i1.width * 0.2, i1.top + i1.height * 0.5);
    const dehors = window.CAMP_SCENE.toucherPerso(5, 5);
    const ombre = getComputedStyle(document.querySelector(".silhouette-camp"), "::after");
    const img = getComputedStyle(imgs[0]);
    const urls = window.CAMP_SCENE.urlCamp("https://res.cloudinary.com/x/image/upload/v1/a.png") + " | " + window.CAMP_SCENE.urlCamp("https://res.cloudinary.com/x/image/upload/q_auto,f_auto/v1/a.png");
    const barre = getComputedStyle(document.querySelector(".barre-camp"));
    const boutons = [...document.querySelectorAll(".bouton-camp")].map(x => x.getBoundingClientRect());
    return { devant, derriere, droite, gauche, dehors, ombre: { contenu: ombre.content, fond: ombre.backgroundImage }, filtre: img.filter, pe: img.pointerEvents, urls,
             barre: barre.justifyContent, etendue: boutons.length ? boutons[boutons.length - 1].right - boutons[0].left : 0, largeur: innerWidth };
  });
  verifier("le clic se juge au pixel : sur l'image, le personnage ; dans son vide, celui de derrière ; ailleurs, personne",
    r.droite === r.devant && r.gauche === (r.devant === "PNJ_ARA" ? r.derriere : r.devant) && r.devant !== r.derriere && r.dehors === null && [r.devant, r.derriere].includes("PNJ_ARA"), JSON.stringify(r).slice(0, 220));
  const css = lire("camp_scene.css");
  verifier("ni halo ni grossissement au survol", !/\.perso-camp:hover|silhouette-camp[^{]*:hover|perso-camp[^{]*:hover/.test(css) && !/\.perso-camp[^}]*scale\(/.test(css) && r.filtre === "none", r.filtre);
  verifier("une ombre légère au pied (un dégradé, pas de filtre)", /radial-gradient/.test(r.ombre.fond) && r.ombre.contenu === '""', JSON.stringify(r.ombre).slice(0, 120));
  verifier("toute image du camp passe compressée (q_auto,f_auto), les anciennes comprises", r.urls === "https://res.cloudinary.com/x/image/upload/q_auto,f_auto/v1/a.png | https://res.cloudinary.com/x/image/upload/q_auto,f_auto/v1/a.png", r.urls);
  verifier("les boutons du haut s'espacent sur toute la largeur de l'écran", r.barre === "space-evenly" && r.etendue > r.largeur * 0.6, `${r.barre} ${Math.round(r.etendue)}/${r.largeur}`);
  const clic = await p.evaluate(async (id) => { window.__discussions = []; const b = document.querySelector(`.perso-camp[data-perso="${id}"] img`).getBoundingClientRect();
    document.getElementById("ecran-camp").dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: b.left + b.width * 0.8, clientY: b.top + b.height * 0.5 }));
    await new Promise(r => setTimeout(r, 150)); return window.__discussions.map(s => s.id).join(); }, r.devant);
  verifier("cliquer sur le personnage (au pixel) ouvre la discussion", clic === r.devant || (r.devant === "H1" && clic === ""), `${clic} / ${r.devant}`);
  const enc = await p.evaluate(async () => {
    window.CAMP_SCENE.entrerEdition(); await new Promise(r => setTimeout(r, 50));
    const boutons = [...document.querySelectorAll("#outils-encarts-camp [data-outil]")].map(b => b.dataset.outil);
    document.querySelector('[data-outil="nouveau-compagnon_air"]').click(); await new Promise(r => setTimeout(r, 80));
    const e = window.CAMP_SCENE.encarts(), dernier = e[Math.max(...Object.keys(e).map(Number))];
    window.CAMP_SCENE.quitterEdition();
    return { boutons, dernier };
  });
  verifier("l'outil DEV : des boutons pour créer les encarts du compagnon du pisteur (sol gros, sol petit, airs)",
    ["nouveau-compagnon_gros", "nouveau-compagnon_petit", "nouveau-compagnon_air"].every(x => enc.boutons.includes(x)) && enc.dernier && enc.dernier.type === "compagnon_air", JSON.stringify(enc));
  const cs = lire("camp_scene.js");
  const m = cs.match(/export const ENCARTS_DEFAUT = (\{[\s\S]*?\n\});/);
  const def = m ? JSON.parse(m[1]) : {};
  verifier("les encarts de Nico pour toutes les parties (11 au moins, leurs couches)", Object.keys(def).length >= 11 && def[1].x === -0.1193 && def[7].cote === 0.4008 && def[5].couche === 9 && def[11].y === 0.6118);
  await p.evaluate(() => window.CAMP_SCENE.fermer()); await p.waitForTimeout(2200);
});

titre("5. LA GESTION : L'IMAGE OUVRE LES FILS INVISIBLES, LE NOM LA FICHE ; THÉMÈS ET TOUTES LES IMAGES REFAITES (DEV)");
await section(async () => {
  const g = lire("grimoire_gestion.js"), li = lire("grimoire_liens.js");
  verifier("l'image : ses fils invisibles, son âme exacte (jamais un autre PNJ au nom voisin)", /data-gc="ame" data-id="\$\{echapper\(id\)\}" title="Ses fils invisibles/.test(g) && /depuisGestion: true, exact: true/.test(g) && /else if \(o\.nom && !o\.exact\)/.test(li) && /x\.ref === o\.id/.test(li));
  const r = await p.evaluate(async () => {
    const vus = []; const F = window.GRIMOIRE_FICHES.ouvrir, L = window.GRIMOIRE_LIENS && window.GRIMOIRE_LIENS.ouvrir;
    window.GRIMOIRE_FICHES.ouvrir = (id) => vus.push("fiche:" + id);
    if (window.GRIMOIRE_LIENS) window.GRIMOIRE_LIENS.ouvrir = (o) => vus.push("fils:" + o.id + (o.exact ? ":exact" : ""));
    const clic = async (gc, id) => { const b = document.createElement("button"); b.dataset.gc = gc; b.dataset.id = id; await window.GESTION_CAMP.agir(b); };
    await clic("fiche", "H1"); await clic("fiche", "PNJ_ARA"); await clic("ame", "H2");
    await new Promise(r => setTimeout(r, 100));
    window.GRIMOIRE_FICHES.ouvrir = F; if (L) window.GRIMOIRE_LIENS.ouvrir = L;
    return vus;
  });
  // (v503) Un PNJ du camp sans fiche d'aventurier en reçoit une : son nom l'ouvre.
  verifier("le nom : sa fiche (v503 : un PNJ du camp reçoit la sienne) ; l'image : ses fils invisibles", JSON.stringify(r) === JSON.stringify(["fiche:H1", "fiche:PNJ_ARA", "fils:H2:exact"]), JSON.stringify(r));
  const t = await p.evaluate(async () => {
    window.__portrait = null; window.genererPortraitHeros = async (d) => { window.__portrait = d; return "https://res.cloudinary.com/x/image/upload/q_auto,f_auto/v1/themes.png"; };
    window.__oublies = []; window.oublierImages = async (l) => { window.__oublies.push(...l); };
    const r = await window.CAMP_AVATARS.refaireTout({ sansConfirmer: true });
    return { r, portrait: window.__portrait, themes: window.__docs["Monde_PNJ/PNJ_THEMES_P1"], h1: window.__docs["Personnages/H1"].Images_Camp, ara: window.__docs["Monde_PNJ/PNJ_ARA"].Images_Camp, oublies: window.__oublies.length,
             bouton: (document.getElementById("btn-camp-dev") || {}).getAttribute ? document.getElementById("btn-camp-dev").getAttribute("onclick") : "" };
  });
  verifier("le bouton DEV : l'avatar de Thémès, fait comme celui d'un personnage joueur, d'après sa fiche", t.portrait && /barbe blanche/.test(t.portrait.signes) && t.themes.URL_Cloudinary === "https://res.cloudinary.com/x/image/upload/q_auto,f_auto/v1/themes.png", JSON.stringify(t.portrait).slice(0, 120));
  verifier("…toutes les images du camp effacées (Thémès compris), puis refaites une à une par la veille", t.r && t.h1.length === 0 && t.ara.length === 0 && t.themes.Images_Camp.length === 0 && t.oublies === 8, JSON.stringify({ r: t.r, oublies: t.oublies }));
  // (v494) Le bouton DEV provisoire est retiré (Nico) ; refaireTout reste (window.CAMP_AVATARS).
  verifier("…le bouton DEV provisoire est retiré (refaireTout reste dans CAMP_AVATARS)", !t.bouton && typeof (await p.evaluate(() => typeof window.CAMP_AVATARS.refaireTout)) === "string", t.bouton);
});

titre("6. LE MODE ARÈNE : UN JOUEUR CHOISIT LES TROIS COMBATTANTS PARMI TOUS");
await section(async () => {
  const r = await p.evaluate(async () => {
    window.appliquerVoyageDeLaPartie = (d) => { window.PARTIE_DATA = d; window.appliquerCampDeLaPartie(d); };
    window.__relaisPartie = true;
    window.__docs["Systeme_Parties/P1"].Arene_Choix = { Actif: true };
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"])));
    const X = window.EXPEDITION;
    const a = await X.choisirPourArene("H2", true), b2 = await X.choisirPourArene("H1", true);
    await new Promise(r => setTimeout(r, 80));
    const choix = window.__docs["Systeme_Parties/P1"].Arene_Choix;
    if (typeof window.recomposerCombattants === "function") window.recomposerCombattants();
    const combattants = (window.PERSOS_PARTIE || []).filter(h => !h.estMonstre).map(h => h.idPersonnage + ":" + (h.actif !== false));
    return { a, b2, choix, combattants };
  });
  verifier("un seul joueur coche les combattants, parmi tous les personnages (même ceux des autres)", r.a === "" && r.b2 === "" && JSON.stringify(r.choix.Combattants) === '["H2","H1"]' && r.choix.Par === "J1", JSON.stringify(r.choix));
  verifier("…ils combattent, même un héros au repos (Lyra)", r.combattants.sort().join() === "H1:true,H2:true", r.combattants.join());
  const gc = lire("grimoire_combats.js");
  verifier("la page des combats : la liste de tous les personnages, trois cases au plus", /data-combats-arene="perso"/.test(gc) && /choisis les \$\{max\} combattants/.test(gc));
});

titre("7. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 491 ou plus (trace_combat.js, version.json)", v >= 491 && JSON.parse(lire("version.json")).version >= 491, `${v}`);
  const imports = ["conseil.js", "recrutement.js", "retour_camp.js", "camp_avatars.js", "camp.js", "camp_scene.js", "tache_en_cours.js", "deplacement_camp.js", "expedition.js"].map(f => (lire(f).match(/camp_pur\.js\?v=(\d+)/) || [])[1]);
  verifier("tous les modules lisent les mêmes règles (camp_pur.js, une seule version)", new Set(imports).size === 1 && Number(imports[0]) >= 14, imports.join(","));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
