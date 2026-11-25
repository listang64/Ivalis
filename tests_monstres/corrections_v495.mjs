// v495 — LE CONSEIL QU'ON CLÔT (SON HISTORIQUE EFFACÉ), LA BANDE DU HAUT SUR IPAD, LE RETOUR À LA GESTION EN TOURNANT LA PAGE,
// THÉMÈS JAMAIS JOUÉ EN EXPÉDITION.
// Lancer : node tests_monstres/corrections_v495.mjs
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

titre("1. THÉMÈS N'EST JAMAIS UN PERSONNAGE JOUÉ (camp_pur.js)");
await section(async () => {
  const persos = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", creeLe: 1 }, { idPersonnage: "T1", idJoueur: "J1", prenom: "Thémès", creeLe: 2 }];
  verifier("une fiche d'aventurier créée au nom de Thémès n'est pas un de ses personnages jouables", JSON.stringify(CP.personnagesDuJoueur("J1", persos).map(h => h.idPersonnage)) === '["H1"]');
  verifier("…ni sa fiche de PNJ (PNJ_THEMES_…), ni un narrateur", CP.estThemesPerso({ idPersonnage: "PNJ_THEMES_P1" }) && CP.estThemesPerso({ prenom: "Themes" }) && CP.estThemesPerso({ narrateur: true }) && !CP.estThemesPerso({ prenom: "Thorin" }));
  verifier("prendre une place avec Thémès : refusé, même s'il était dans la liste", /Thémès ne part jamais/.test(CP.peutPrendrePlace({ Montee: true, Emplacements: [null, null, null] }, 0, "PNJ_THEMES_P1", "J1", ["PNJ_THEMES_P1"])));
  verifier("ni dans la liste des personnages du camp, ni dans l'arène", !CP.personnagesLibres({ Membres: { PNJ_THEMES_P1: { Type: "pnj", Narrateur: true }, A: { Type: "pnj" } } }).includes("PNJ_THEMES_P1")
    && CP.persosArene(persos).map(h => h.idPersonnage).join() === "H1");
});

titre("2. LA BANDE DU HAUT SUR IPAD (index.html, style.css)");
await section(async () => {
  const ix = lire("index.html"), st = lire("style.css");
  verifier("une bande fixe en haut de la page, la première chose du corps de la page", /<body>\s*<!--[\s\S]*?-->\s*<div class="bande-haut-ipad" aria-hidden="true"><\/div>/.test(ix));
  verifier("sur iPad seulement : fixe, toute la largeur, 12 px (plus de 10, comme le veut WebKit), invisible, sans clic, tout devant",
    /\.bande-haut-ipad \{ display: none; \}/.test(st) && /@supports \(-webkit-touch-callout: none\) \{\s*\.bande-haut-ipad \{ display: block; position: fixed; inset: 0 0 auto; height: 12px; background-color: #000;\s*background-clip: text; -webkit-background-clip: text; pointer-events: none; z-index: 2147483647; \}/.test(st));
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

titre("3. METTRE FIN AU CONSEIL : SON HISTORIQUE EFFACÉ");
await section(async () => {
  await p.evaluate(() => window.CAMP_SCENE.ouvrir()); await p.waitForTimeout(2600);
  const r = await p.evaluate(async () => {
    window.confirm = () => true;
    const refus = await window.CONSEIL.ouvrir();
    await new Promise(r => setTimeout(r, 300));
    await window.CONSEIL.envoyer("Je propose une fête.");
    await new Promise(r => setTimeout(r, 200));
    const avant = Object.keys(window.__docs).filter(k => k.startsWith("Systeme_Parties/P1/Conseil_Messages/")).length;
    const id = (window.__docs["Systeme_Parties/P1"].Conseil || {}).Id;
    const bouton = document.querySelector('#ecran-conseil [data-cs="finir"]');
    const texte = bouton ? bouton.textContent : "";
    bouton.click();
    await new Promise(r => setTimeout(r, 800));
    return { refus, avant, id, texte, apres: Object.keys(window.__docs).filter(k => k.startsWith("Systeme_Parties/P1/Conseil_Messages/")).length,
             conseil: window.__docs["Systeme_Parties/P1"].Conseil || null, ferme: !document.getElementById("ecran-conseil").classList.contains("visible") };
  });
  verifier("un bouton « Mettre fin au conseil »", r.texte === "Mettre fin au conseil", r.texte);
  verifier("…il efface l'historique du conseil et le retire de la partie ; l'écran se ferme", r.refus === "" && r.avant >= 2 && r.apres === 0 && r.conseil === null && r.ferme, JSON.stringify(r));
  const r2 = await p.evaluate(async () => { await window.CONSEIL.ouvrir(); await new Promise(r => setTimeout(r, 300)); const c = window.__docs["Systeme_Parties/P1"].Conseil; window.CONSEIL.fermerVue(); return { id: c && c.Id, n: Object.keys(window.__docs).filter(k => k.startsWith("Systeme_Parties/P1/Conseil_Messages/")).length }; });
  verifier("le conseil suivant repart de zéro (un nouveau, seul le mot d'accueil de Thémès)", r2.id && r2.id !== r.id && r2.n === 1, JSON.stringify(r2));
});

titre("4. LA GESTION : TOURNER LA PAGE EN ARRIÈRE RAMÈNE À LA GESTION");
await section(async () => {
  await p.evaluate(() => document.querySelector('[data-camp="gestion"]').click()); await p.waitForTimeout(3500);
  const essai = (sel) => p.evaluate(async (sel) => {
    const g = window.GRIMOIRE, pf = g.pageFlip(), G = window.GESTION_CAMP;
    if (!G.ouverte()) { G.ouvrir(); await new Promise(r => setTimeout(r, 2500)); }
    const b = document.querySelector(sel); if (!b) return { absent: true };
    b.click(); await new Promise(r => setTimeout(r, 4000));
    const ici = pf.getCurrentPageIndex();
    pf.flipPrev(); await new Promise(r => setTimeout(r, 3500));
    return { ici, gestion: g.indexDe(G.pages()[0]), apres: pf.getCurrentPageIndex(), ouverte: G.ouverte() };
  }, sel);
  const fiche = await essai('.membre-gestion[data-membre="H1"] .nom-gestion');
  verifier("le nom ouvre sa fiche ; la page tournée en arrière : la gestion", fiche.ici > fiche.gestion && fiche.ouverte, JSON.stringify(fiche));
  const fils = await essai('.membre-gestion[data-membre="H2"] .portrait-gestion');
  verifier("le portrait ouvre ses fils invisibles (rangés après les fiches) ; la page tournée en arrière : la gestion", fils.ici > fiche.ici && fils.ouverte, JSON.stringify(fils));
});

titre("5. L'EXPÉDITION : THÉMÈS JAMAIS DANS LA LISTE");
await section(async () => {
  const r = await p.evaluate(async () => {
    window.PERSOS_JOUEURS_PARTIE.push({ idPersonnage: "T1", idJoueur: "J1", prenom: "Thémès", niveau: 1, creeLe: 9, actif: false });
    const liste = window.EXPEDITION.jouablesExpedition("J1");
    return { liste, arene: window.CAMP.regles.persosArene(window.PERSOS_JOUEURS_PARTIE).map(h => h.idPersonnage) };
  });
  verifier("ni ses personnages (une fiche à son nom), ni ceux du camp, ni l'arène", !r.liste.siens.includes("T1") && !r.liste.libres.some(id => /THEMES/.test(id)) && !r.arene.includes("T1"), JSON.stringify(r));
});

titre("6. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 495 ou plus", v >= 495 && JSON.parse(lire("version.json")).version >= 495, `${v}`);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
