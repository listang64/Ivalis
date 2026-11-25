// v479 — PLUS DE LIVRE DES CLANS : LE MENU « MON HÉROS PRINCIPAL ».
// Nico : « les clans et ce système de clan n'existent plus ; enlève la popup pour créer un clan. Pour la liste des
// persos, crée autre chose sans réutiliser ces pages de clans : quelque chose de plus simple, comme une liste
// déroulante pour sélectionner son héros principal ; il faut que ça reste intuitif. » Le document du clan nomade :
// « le premier personnage d'un joueur est son héros principal » ; « changer de héros principal, parmi les
// personnages qui appartiennent uniquement au joueur ».
// Lancer : node tests_monstres/corrections_v479.mjs
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

titre("1. LA RÈGLE (camp_pur.js)");
await section(async () => {
  const persos = [{ idPersonnage: "H2", idJoueur: "J1", creeLe: 200 }, { idPersonnage: "H1", idJoueur: "J1", creeLe: 100 }, { idPersonnage: "H3", idJoueur: "J2", creeLe: 50 },
                  { idPersonnage: "H4", idJoueur: "J1", creeLe: 10, statut: "Mort" }, { idPersonnage: "I1", idJoueur: "J1", creeLe: 5, estIllusion: true }];
  verifier("ses personnages, dans l'ordre de leur création (ni les morts, ni les illusions, ni ceux des autres)", CP.personnagesDuJoueur("J1", persos).map(h => h.idPersonnage).join() === "H1,H2");
  verifier("le premier personnage d'un joueur est son héros principal", CP.herosPrincipal("J1", persos, {}) === "H1");
  verifier("…sauf s'il en a choisi un autre parmi les siens", CP.herosPrincipal("J1", persos, { J1: "H2" }) === "H2");
  verifier("…jamais le personnage d'un autre joueur", CP.herosPrincipal("J1", persos, { J1: "H3" }) === "H1");
  verifier("…ni un mort (le suivant prend sa place)", CP.herosPrincipal("J1", persos, { J1: "H4" }) === "H1");
  verifier("sans personnage : aucun", CP.herosPrincipal("J9", persos, {}) === null);
});

titre("2. LE CODE : PLUS DE PAGES DE CLANS NI DE POPUP");
await section(async () => {
  const gf = lire("grimoire_fiches.js");
  verifier("grimoire_fiches.js : plus de pages de clans (pageClan, construireClans, pagesClans)", !/function pageClan|construireClans|pagesClans|IMAGE_CLANS/.test(gf));
  verifier("plus de popup de clan nulle part (grimoire_clans.js supprimé, rien dans index.html)", !fs.existsSync(path.join(RACINE, "grimoire_clans.js")) && !/popup-clan|grimoire_clans/.test(lire("index.html")));
});

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);

titre("3. LE MENU « MON HÉROS PRINCIPAL »");
await section(async () => {
  const r = await p.evaluate(async () => {
    window.jouerSonClic = () => {};
    localStorage.setItem("ID_JOUEUR_COURANT", "J1");
    window.__docs = window.__docs || {}; window.ID_PARTIE_COURANTE = "P1"; window.__docs["Systeme_Parties/P1"] = {}; window.PARTIE_DATA = {};
    window.PERSOS_JOUEURS_PARTIE = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", classe: "Protecteur", creeLe: 100, actif: true },
      { idPersonnage: "H2", idJoueur: "J1", prenom: "Kaya", classe: "Pisteur", creeLe: 200, actif: false }, { idPersonnage: "H3", idJoueur: "J2", prenom: "Lyra", creeLe: 50, actif: true }];
    window.PERSOS_PARTIE = window.PERSOS_JOUEURS_PARTIE.map(h => ({ ...h }));
    window.__bascules = []; window.basculerActivationPersonnage = async (id, actif) => { window.__bascules.push([id, actif]); };
    const html = window.GRIMOIRE_FICHES.htmlChoixHeros();
    const d = document.createElement("div"); d.innerHTML = html; document.body.appendChild(d);
    const avant = [...d.querySelectorAll("option")].map(o => [o.value, o.selected, o.textContent.trim()]);
    const l = d.querySelector(".liste-heros-principal"); l.value = "H2"; l.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(r => setTimeout(r, 400));
    return { avant, boutons: [...d.querySelectorAll("button")].map(x => x.dataset.fa), base: window.__docs["Systeme_Parties/P1"], bascules: window.__bascules };
  });
  verifier("les options : ses personnages (Thorin, Kaya), Thorin choisi par défaut (le premier)", JSON.stringify(r.avant.map(o => [o[0], o[1]])) === '[["H1",true],["H2",false]]' && /Thorin/.test(r.avant[0][2]), JSON.stringify(r.avant));
  verifier("« Sa fiche » et « + Nouvel aventurier »", JSON.stringify(r.boutons) === '["fiche-principal","creer"]', JSON.stringify(r.boutons));
  verifier("choisir Kaya : la partie le retient (Heros_Principaux)", r.base.Heros_Principaux && r.base.Heros_Principaux.J1 === "H2", JSON.stringify(r.base));
  verifier("…et Kaya devient le héros joué, Thorin passe au repos", JSON.stringify(r.bascules) === '[["H2",true],["H1",false]]', JSON.stringify(r.bascules));
});

titre("4. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 479 ou plus", v >= 479 && JSON.parse(lire("version.json")).version >= 479, `${v}`);
});
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
