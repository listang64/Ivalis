// v503 — LES PNJ DU CAMP, LA CARTE, LE MOMENT À PART : la classe d'un PNJ par les pages des classes de la création,
// sa fiche d'aventurier, le texte du déplacement sous la jauge (le titre ne remonte plus), le descriptif pour le MJ en
// haut, et « L'inviter en privé » : un RP à part, dans le livre, chez le seul joueur qui l'a ouvert.
// Lancer : node tests_monstres/corrections_v503.mjs
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

const etat = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"])));

titre("1. LA CLASSE D'UN PNJ DU CAMP : LES PAGES DES CLASSES DE LA CRÉATION");
await section(async () => {
  await p.evaluate(() => window.CAMP_SCENE.ouvrir()); await p.waitForTimeout(2600);
  await p.evaluate(() => document.querySelector('[data-camp="gestion"]').click()); await p.waitForTimeout(3500);
  await p.evaluate(() => window.GESTION_CAMP.lireInfos(true)); await p.waitForTimeout(600);
  const b = await p.evaluate(() => { const li = document.querySelector('.membre-gestion[data-membre="PNJ_ARA"]'); const x = li && li.querySelector('[data-gc="choisir-classe"]'); return { bouton: x ? x.textContent.trim() : "", select: !!(li && li.querySelector("select.select-classe")), heros: !!document.querySelector('.membre-gestion[data-membre="H1"] [data-gc="choisir-classe"]') }; });
  verifier("un PNJ entré au camp : « Choisir sa classe » (plus de liste déroulante), pas pour les héros", b.bouton === "Choisir sa classe" && !b.select && !b.heros, JSON.stringify(b));
  const c = await p.evaluate(async () => {
    window.GESTION_CAMP.agir(document.querySelector('.membre-gestion[data-membre="PNJ_ARA"] [data-gc="choisir-classe"]'));
    await new Promise(r => setTimeout(r, 2500));
    const g = window.GRIMOIRE, cr = window.GRIMOIRE_CREATION, s = cr.sections(), ici = g.pageFlip().getCurrentPageIndex(), premiere = g.indexDe(cr.page("classe-0"));
    return { actif: cr.actif(), pour: cr.pourPnj(), ici, premiere, classes: s.classes.length };
  });
  verifier("…la première page des classes s'ouvre, pour Ara", c.actif && c.pour && c.pour.id === "PNJ_ARA" && c.classes > 0 && Math.abs(c.ici - c.premiere) <= 1, JSON.stringify(c));
  const v = await p.evaluate(async () => {
    const bouton = document.querySelector('.page-classe [data-ca="classe"]');
    const nom = bouton ? bouton.closest(".page-classe").dataset.classe : "";
    if (bouton) bouton.click();
    await new Promise(r => setTimeout(r, 3500));
    const g = window.GRIMOIRE, ig = g.indexDe(window.GESTION_CAMP.pages()[0]), ici = g.pageFlip().getCurrentPageIndex();
    return { nom, classe: (window.__docs["Monde_PNJ/PNJ_ARA"] || {}).Classe, actif: window.GRIMOIRE_CREATION.actif(), surGestion: ici === ig || ici === ig + 1 };
  });
  verifier("…une classe choisie : écrite sur sa fiche, et retour direct aux membres du camp", !!v.classe && !v.actif && v.surGestion, JSON.stringify(v));
});

titre("2. LA FICHE D'AVENTURIER D'UN PNJ DU CAMP");
await section(async () => {
  const r = await p.evaluate(async () => {
    window.__docs["Monde_PNJ/PNJ_ZED"] = { Nom_PNJ: "Zed", ID_Partie: "P1", Statut: "Vivant", Race: "Humain", URL_Cloudinary: "https://x/zed.png" };
    const refus = await window.RECRUTEMENT.rejoindreLeCamp("PNJ_ZED", { type: "invite", par: "J1" });
    const f = window.__docs["Personnages/PNJ_ZED"] || null;
    return { refus, f: f && { libre: f.Libre_Pour_Tous, partie: f.ID_Partie, joueur: f.ID_Joueur, prenom: f.Prenom_Personnage, actif: f.Actif }, caracs: !!window.__docs["Caracteristiques/PNJ_ZED"],
             liste: (window.PERSOS_JOUEURS_PARTIE || []).some(h => h.idPersonnage === "PNJ_ZED") };
  });
  verifier("un PNJ qui rejoint le camp (le bouton DEV aussi) reçoit sa fiche d'aventurier, libre pour tous, sans joueur", r.refus === "" && r.f && r.f.libre && r.f.partie === "P1" && r.f.joueur === "" && r.f.prenom === "Zed" && r.f.actif === false && r.caracs && r.liste, JSON.stringify(r));
  const o = await p.evaluate(async () => {
    delete window.__docs["Personnages/PNJ_BORS"];
    let ouvert = null; const av = window.GRIMOIRE_FICHES.ouvrir; window.GRIMOIRE_FICHES.ouvrir = (id) => { ouvert = id; };
    await window.GESTION_CAMP.lireInfos(true); window.GESTION_CAMP.maj();
    const nom = document.querySelector('.membre-gestion[data-membre="PNJ_BORS"] [data-gc="fiche"]');
    await window.GESTION_CAMP.agir(nom);
    window.GRIMOIRE_FICHES.ouvrir = av;
    return { ouvert, fiche: !!window.__docs["Personnages/PNJ_BORS"] };
  });
  verifier("un PNJ du camp recruté avant : son nom crée sa fiche et l'ouvre (plus les fils invisibles)", o.ouvert === "PNJ_BORS" && o.fiche, JSON.stringify(o));
});

titre("3. LA CARTE RÉGIONALE : LE TEXTE SOUS LA JAUGE, LE DESCRIPTIF EN HAUT");
await section(async () => {
  const js = lire("grimoire_regions.js"), css = lire("grimoire_regions.css");
  verifier("le titre ne remonte plus quand une fenêtre du voyage s'écrit", !/\.page-region\.avec-voyage \.region-titre-page \{ top: 6%/.test(css));
  verifier("…la fenêtre s'écrit juste sous le titre et la jauge de réputation", /ici\.style\.top = `\$\{Math\.round\(titre\.offsetTop \+ titre\.offsetHeight \+ 10\)\}px`/.test(js));
  verifier("le descriptif pour le MJ (DEV) : en haut de la page, hors du titre", /\$\{reputation\}<\/div>\$\{boutonDescriptif\(r\)\}`/.test(js) && /\.page-region > \.bouton-descriptif-region \{ position: absolute; top: 2\.6%/.test(css));
  const m = await p.evaluate(async () => {
    const page = document.createElement("div"); page.className = "page-region page-grimoire"; page.style.cssText = "position:relative;width:600px;height:800px;--u:6px";
    page.innerHTML = `<div class="region-titre-page"><span class="region-nom">Forêt</span><div class="reputation-region"><span class="groupe-reputation-region">Les Lames</span></div></div><button class="bouton-descriptif-region">✎</button>`;
    document.body.appendChild(page);
    const t = page.querySelector(".region-titre-page"), b = page.querySelector(".bouton-descriptif-region");
    const r = { titreHaut: t.offsetTop, boutonHaut: b.getBoundingClientRect().top - page.getBoundingClientRect().top };
    page.classList.add("avec-voyage"); r.titreApres = t.offsetTop;
    page.remove(); return r;
  });
  verifier("…vérifié : le titre ne bouge pas, le bouton est en haut", m.titreApres === m.titreHaut && m.boutonHaut < 40, JSON.stringify(m));
});

titre("4. « L'INVITER EN PRIVÉ » : UN MOMENT À PART, DANS LE LIVRE");
await section(async () => {
  const r = await p.evaluate(async () => {
    window.__appelsMJ = [];
    window.fetchGemini = async (usage, corps, o) => { const c = JSON.parse(corps); window.__appelsMJ.push({ usage, modele: o && o.modele, sys: c.systemInstruction.parts[0].text, txt: c.contents[0].parts[0].text });
      const n = window.__appelsMJ.length;
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: n === 1 ? "Bors te suit jusqu'au bord de la rivière. « Alors, qu'est-ce que tu voulais me dire ? »" : "Bors hausse les épaules. « Je n'en sais rien, moi. »" }] } }] }) }; };
    window.CAMP_SCENE.ouvert = () => true;
    window.CAMP_SCENE.fermer = (puis) => { if (puis) puis(); return true; };
    const h = window.PERSOS_JOUEURS_PARTIE.find(x => x.idPersonnage === "H1");
    window.GROUPE.herosDeLaPartie = () => [h];
    await window.DISCUSSION.ouvrir({ id: "PNJ_BORS", nom: "Bors", fiche: { Nom_PNJ: "Bors", Occupation: "Chasseur" } });
    const bouton = document.querySelector("#discussion-privee .inviter-dp");
    const texte = bouton ? bouton.textContent : "";
    if (bouton) bouton.click();
    await new Promise(r => setTimeout(r, 3500));
    const g = window.GRIMOIRE, pages = g.pagesPrive(), ici = g.pageFlip().getCurrentPageIndex(), i = pages.length ? g.indexDe(pages[0]) : -1;
    const sc = Object.entries(window.__docs).filter(([k]) => /^Systeme_Parties\/P1\/RP_Prives\/[^/]+$/.test(k)).map(([, v]) => v);
    return { texte, pages: pages.length, surLaPage: ici === i || ici === i + 1, scene: sc[0] || null, ligne: (document.querySelector("#grimoire-prive-d .ligne-prive.mj") || {}).textContent || "",
             gauche: (document.querySelector("#grimoire-prive-g .nom-prive") || {}).textContent || "", appel: window.__appelsMJ[0] && { usage: window.__appelsMJ[0].usage, modele: window.__appelsMJ[0].modele, sys: window.__appelsMJ[0].sys },
             discussion: !!document.getElementById("discussion-privee") };
  });
  verifier("au camp, la discussion privée a son bouton « L'inviter en privé »", r.texte === "L'inviter en privé", r.texte);
  verifier("…il ouvre une double page du livre : le PNJ à gauche, le récit à droite (la discussion se ferme)", r.pages === 2 && r.surLaPage && r.gauche === "Bors" && /bord de la rivière/.test(r.ligne) && !r.discussion, JSON.stringify(r).slice(0, 300));
  verifier("…une scène à ce joueur seul (Systeme_Parties/P1/RP_Prives : Joueur J1, Bors, Thorin)", r.scene && r.scene.Joueur === "J1" && r.scene.Pnj === "PNJ_BORS" && r.scene.Heros === "H1" && r.scene.Ouvert === true, JSON.stringify(r.scene));
  verifier("…le MJ (l'IA des discussions privées) raconte et joue Bors ; jamais à la place du héros ; pas de combat", r.appel && r.appel.usage === "discussion" && r.appel.modele === "gemini-3.8-flash" && /scène PRIVÉE/.test(r.appel.sys) && /JAMAIS à la place de Thorin/.test(r.appel.sys), JSON.stringify(r.appel).slice(0, 200));
  const e = await p.evaluate(async () => {
    const t = document.querySelector("#grimoire-prive-d .texte-prive"); t.value = "Je lui demande s'il a peur de l'hiver.";
    t.form.requestSubmit(); await new Promise(r => setTimeout(r, 800));
    const lignes = [...document.querySelectorAll("#grimoire-prive-d .ligne-prive")].map(x => x.className.replace("ligne-prive ", "") + ":" + x.textContent.trim().slice(0, 40));
    const msgs = Object.entries(window.__docs).filter(([k]) => /RP_Prives\/[^/]+\/Messages\//.test(k)).map(([, v]) => v.Qui);
    return { lignes, msgs, dernier: window.__appelsMJ.slice(-1)[0].txt.slice(-300) };
  });
  verifier("écrire : le joueur agit, le MJ répond (la scène gardée dans la base)", e.lignes.length === 3 && /^pj:Thorin/.test(e.lignes[1]) && /^mj:Bors hausse/.test(e.lignes[2]) && JSON.stringify(e.msgs.sort()) === '["mj","mj","pj"]' && /peur de l'hiver/.test(e.dernier), JSON.stringify(e));
  const f = await p.evaluate(async () => {
    let analyse = null, camp = 0; const av = window.DISCUSSION.analyser; window.DISCUSSION.analyser = async (pp, id, x) => { analyse = { id, n: x.lignes.length }; };
    window.CAMP_SCENE.ouvrir = () => { camp++; return true; };
    document.querySelector('#grimoire-prive-g [data-prive="camp"]').click(); await new Promise(r => setTimeout(r, 500));
    window.DISCUSSION.analyser = av;
    const sc = Object.entries(window.__docs).filter(([k]) => /^Systeme_Parties\/P1\/RP_Prives\/[^/]+$/.test(k)).map(([, v]) => v)[0];
    return { analyse, camp, pages: window.GRIMOIRE.pagesPrive().length, ouvert: sc.Ouvert };
  });
  verifier("« Revenir au camp » : la scène close, les fils invisibles la lisent, la page s'en va, le camp revient", f.analyse && f.analyse.n === 3 && f.camp === 1 && f.pages === 0 && f.ouvert === false, JSON.stringify(f));
});

titre("5. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS), ix = lire("index.html");
  verifier("version 503 ou plus ; rp_prive.js et rp_prive.css chargés", v >= 503 && /src="rp_prive\.js\?v=\d+"/.test(ix) && /href="rp_prive\.css\?v=\d+"/.test(ix), `${v}`);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
