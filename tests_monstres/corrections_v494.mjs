// v494 — LE CAMP : LA TRANSITION EN PARTIE, L'IPAD, LA GESTION (PROPRIÉTAIRE, PERSONNAGE PRINCIPAL, CARAC DÉTERMINANTE,
// CADRE DORÉ, RECRUE DEV), LES POSES NEUTRES, 50 % DE CHANCE D'APPARAÎTRE, LES ENCARTS DE NICO, PLUS DE BOUTONS PROVISOIRES.
// Lancer : node tests_monstres/corrections_v494.mjs
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

titre("1. LES RÈGLES (camp_pur.js)");
await section(async () => {
  verifier("plus de bûche fendue ni d'animal du camp (la chèvre) ; deux poses neutres à la place",
    !CP.POSES_CAMP.some(p => /fendre une bûche|caresser un animal/.test(p)) && CP.POSES_CAMP.includes("se tenir debout, détendu, les bras le long du corps")
    && CP.POSES_CAMP.includes("se tenir debout, les mains croisées devant soi, le regard tranquille") && CP.POSES_CAMP.length === 44);
  const encarts = {}; for (let n = 1; n <= 20; n++) encarts[n] = { type: "perso" };
  const persos = Array.from({ length: 10 }, (_, i) => ({ id: "p" + i, images: ["u" + i] }));
  let montres = 0; const N = 2000;
  for (let k = 0; k < N; k++) montres += Object.keys(CP.placerAuCamp(encarts, persos, [])).length;
  const part = montres / (N * 10);
  verifier("un personnage qui a un encart libre : 50 % de chance d'apparaître", Math.abs(part - 0.5) < 0.03, (part * 100).toFixed(1) + " %");
  let c = 0; for (let k = 0; k < N; k++) c += Object.keys(CP.placerAuCamp({ 1: { type: "compagnon_gros" } }, [], [{ id: "C", gabarit: "sol_gros", image: "x" }])).length;
  verifier("…le compagnon aussi", Math.abs(c / N - 0.5) < 0.04, (100 * c / N).toFixed(1) + " %");
  verifier("la carac déterminante d'un rôle (au lieu de m)", CP.caracsDeTache("chasser") === "Dextérité" && CP.caracsDeTache("cueillir") === "Intelligence ou Force" && CP.caracsDeTache("entrainer") === "Charisme ou Sagesse");
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

titre("2. LA TRANSITION EN PARTIE : LE CAMP DANS LE MÊME CONTENEUR QUE LE LIVRE");
await section(async () => {
  const r = await p.evaluate(async () => {
    const g = document.getElementById("ecran-grimoire"), t = g.querySelector(".grimoire-table"), t0 = performance.now(), j = [];
    let glisse = null; const anim = Element.prototype.animate;
    Element.prototype.animate = function (k, o) { if (glisse === null && JSON.stringify(k).includes("120vh")) glisse = performance.now() - t0; return anim.call(this, k, o); };
    const pr = window.CAMP_SCENE.ouvrir();
    for (const ms of [300, 700]) { await new Promise(r => setTimeout(r, ms === 300 ? 300 : 400)); j.push({ ms, table: Number(getComputedStyle(t).opacity), avant: Number(getComputedStyle(g, "::before").opacity), cls: g.className }); }
    await pr;
    Element.prototype.animate = anim;
    const e = document.getElementById("ecran-camp");
    return { j, glisse, enJeu: g.parentNode.id, campDans: e.parentNode.id, zLivre: getComputedStyle(g).zIndex, zCamp: getComputedStyle(e).zIndex, ouvert: window.CAMP_SCENE.ouvert() };
  });
  verifier("en partie, le livre est dans l'écran de jeu, le camp aussi (sinon le livre ne passe jamais devant)", r.enJeu === "ecran-jeu" && r.campDans === "ecran-jeu", `${r.enJeu} / ${r.campDans}`);
  verifier("1. l'écran derrière le livre devient noir (la table s'éteint)", r.j[0].table < 0.6 && r.j[0].avant === 1, JSON.stringify(r.j[0]));
  verifier("2. le noir s'efface sur le camp, le livre devant lui (z 33 contre 32)", /camp-dessous/.test(r.j[1].cls) && r.j[1].avant < 1 && Number(r.zLivre) >= 33 && Number(r.zCamp) === 32, JSON.stringify(r.j[1]) + ` z ${r.zLivre}/${r.zCamp}`);
  verifier("3. puis le livre se baisse ; le camp est ouvert", r.glisse >= 1100 && r.ouvert, `${Math.round(r.glisse)} ms`);
  const camp = await p.evaluate(() => ({ heros: !!document.getElementById("heros-camp"), dev: !!document.getElementById("btn-camp-dev") }));
  verifier("plus de boîte « Mon héros principal » dans le camp ; plus de bouton DEV provisoire", !camp.heros && !camp.dev, JSON.stringify(camp));
  const top = await p.evaluate(() => getComputedStyle(document.querySelector(".barre-camp")).top);
  verifier("sur PC, les boutons du haut restent où ils étaient (14 px)", top === "14px", top);
  const css = lire("camp_scene.css"), dp = lire("discussion_privee.css");
  verifier("sur iPad (écran tactile), les boutons du haut et « Quitter la discussion » descendent de 40 px",
    /@media \(hover: none\) and \(pointer: coarse\) \{\s*\.barre-camp \{ top: calc\(max\(14px, env\(safe-area-inset-top\)\) \+ 40px\); \}/.test(css) && /@media \(hover: none\) and \(pointer: coarse\) \{\s*\.quitter-dp \{ top: calc\(2\.5vh \+ 40px\); \}/.test(dp));
  const ipad = await b.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });
  await ipad.setContent(`<style>${css}</style><div class="ecran-camp affiche visible"><div class="barre-camp"></div></div>`);
  const topIpad = await ipad.evaluate(() => getComputedStyle(document.querySelector(".barre-camp")).top);
  verifier("…vérifié sur un écran tactile émulé", topIpad === "54px", topIpad);
  await ipad.close();
  const enc = await p.evaluate(() => window.CAMP_SCENE.encarts());
  const cs = lire("camp_scene.js"), m = cs.match(/export const ENCARTS_DEFAUT = (\{[\s\S]*?\n\});/), def = m ? JSON.parse(m[1]) : {};
  verifier("les encarts de Nico (14, dont les trois du compagnon)", Object.keys(def).length === 14 && def[6].x === 0.3698 && def[6].couche === 9 && def[12].type === "compagnon_petit" && def[13].type === "compagnon_air" && def[14].type === "compagnon_gros" && def[5].x === 0.4647);
});

titre("3. LA GESTION DU CAMP");
await section(async () => {
  await p.evaluate(() => document.querySelector('[data-camp="gestion"]').click()); await p.waitForTimeout(3500);
  await p.evaluate(() => window.GESTION_CAMP && window.GESTION_CAMP.lireInfos && window.GESTION_CAMP.lireInfos(true)); await p.waitForTimeout(600);
  const r = await p.evaluate(() => {
    const ligne = (id) => document.querySelector(`.membre-gestion[data-membre="${id}"]`);
    const txt = (id) => (ligne(id) ? ligne(id).querySelector(".qui-gestion").textContent : "");
    return { h1: txt("H1"), h2: txt("H2"), caseH1: !!(ligne("H1") && ligne("H1").querySelector('[data-gc="principal"]')), caseH2: !!(ligne("H2") && ligne("H2").querySelector('[data-gc="principal"]')),
             caseAra: !!(ligne("PNJ_ARA") && ligne("PNJ_ARA").querySelector('[data-gc="principal"]')), cocheH1: !!(ligne("H1") && (ligne("H1").querySelector('[data-gc="principal"]') || {}).checked),
             dorH1: !!(ligne("H1") && ligne("H1").querySelector(".portrait-gestion.principal")), dorH2: !!(ligne("H2") && ligne("H2").querySelector(".portrait-gestion.principal")),
             dorAra: !!(ligne("PNJ_ARA") && ligne("PNJ_ARA").querySelector(".portrait-gestion.principal")),
             options: [...document.querySelectorAll('.page-gestion [data-gc="tache"][data-id="PNJ_ARA"] option')].map(o => o.textContent),
             dev: (document.querySelector(".recrue-dev-gestion") || {}).textContent || "", dernier: (() => { const g = document.querySelector(".page-gestion-gauche"); const enfants = g ? [...g.querySelectorAll(":scope > *")].filter(x => !x.classList.contains("note-gestion")) : []; return enfants.length ? enfants[enfants.length - 1].className : ""; })() };
  });
  verifier("à qui appartient un héros (« Héros de toi », « Héros de Lyra-joueur »)", /Héros de toi/.test(r.h1) && /Héros de /.test(r.h2), `${r.h1} / ${r.h2}`);
  verifier("la case « Personnage principal » : sur ses héros seulement", r.caseH1 && !r.caseH2 && !r.caseAra && r.cocheH1);
  verifier("le cadre doré autour des personnages principaux des joueurs (pas des PNJ)", r.dorH1 && r.dorH2 && !r.dorAra, JSON.stringify({ h1: r.dorH1, h2: r.dorH2, ara: r.dorAra }));
  verifier("le rôle dit sa carac déterminante (plus de « m +0 »)", r.options.some(o => /^Chasser \(Dextérité\)/.test(o)) && r.options.some(o => /^Cueillir \(Intelligence ou Force\)/.test(o)) && !r.options.some(o => /\(m /.test(o)), r.options.slice(1, 4).join(" | "));
  verifier("en tout dernier sur la page de gauche (DEV) : recruter un PNJ pour le camp, gratuitement, en rouge", /Recruter un PNJ pour le camp, gratuitement \(DEV\)/.test(r.dev) && r.dernier === "recrue-dev-gestion", r.dernier);
  const lire_ = (s) => lire(s);
  verifier("le style : cadre doré, titre rouge", /\.portrait-gestion\.principal \{ border: [^}]*#c9a227/.test(lire_("grimoire_gestion.css")) && /\.dev-rouge \{ color: #8a1a10/.test(lire_("grimoire_gestion.css")));
  // La recrue DEV : un PNJ de la partie, hors du camp.
  const rec = await p.evaluate(async () => {
    window.__docs["Monde_PNJ/PNJ_ZED"] = { Nom_PNJ: "Zed", ID_Partie: "P1", Statut: "Vivant", Race: "Humain" };
    const liste = await window.RECRUTEMENT.pnjsHorsDuCamp();
    window.__docs["Systeme_Parties/P1"].Camp.Membres.PNJ_ZED && delete window.__docs["Systeme_Parties/P1"].Camp.Membres.PNJ_ZED;
    const refus = await window.RECRUTEMENT.rejoindreLeCamp("PNJ_ZED", { type: "invite", par: "J1" });
    return { liste: liste.map(x => x.id), refus, membre: (window.__docs["Systeme_Parties/P1"].Camp.Membres || {}).PNJ_ZED || null };
  });
  verifier("…la liste : les PNJ de la partie hors du camp ; il entre au camp sans rien payer", rec.liste.includes("PNJ_ZED") && !rec.liste.includes("PNJ_ARA") && rec.refus === "" && rec.membre && rec.membre.Type === "invite", JSON.stringify(rec));
  // Le personnage principal choisi d'une case.
  const pr = await p.evaluate(async () => {
    window.PERSOS_JOUEURS_PARTIE.push({ idPersonnage: "H1B", idJoueur: "J1", prenom: "Bran", niveau: 1, creeLe: 5, actif: false });
    window.__docs["Systeme_Parties/P1"].Camp.Membres.H1B = { Type: "heros", Joueur: "J1", Moral: 60 };
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"])));
    await window.GESTION_CAMP.lireInfos(true); await new Promise(r => setTimeout(r, 400));
    const c = document.querySelector('.membre-gestion[data-membre="H1B"] [data-gc="principal"]');
    if (!c) return { absente: true };
    c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(r => setTimeout(r, 500));
    return { choix: (window.__docs["Systeme_Parties/P1"].Heros_Principaux || {}).J1 };
  });
  verifier("cocher la case : il devient son personnage principal", pr.choix === "H1B", JSON.stringify(pr));
});

titre("4. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 494 ou plus", v >= 494 && JSON.parse(lire("version.json")).version >= 494, `${v}`);
  const imports = ["conseil.js", "recrutement.js", "retour_camp.js", "camp_avatars.js", "camp.js", "camp_scene.js", "tache_en_cours.js", "deplacement_camp.js", "expedition.js"].map(f => (lire(f).match(/camp_pur\.js\?v=(\d+)/) || [])[1]);
  verifier("tous les modules lisent les mêmes règles (camp_pur.js)", new Set(imports).size === 1 && Number(imports[0]) >= 15, imports.join(","));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
