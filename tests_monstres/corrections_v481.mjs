// v481 — LE CLAN NOMADE, ÉTAPE 4 : LA GESTION DU CAMP.
// Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md) : « Double page : trésorerie (caisse du groupe),
// provisions, jauge des ressources, bilan du jour (production − consommation), liste des personnages du camp
// (clic → fils invisibles). Assignation des tâches, bloquée pendant qu'une expédition est en cours hors du camp,
// avec leurs limites : 2 cuisiniers, 1 soigneur, 1 forgeron, 1 éclaireur, 2 entraîneurs (chacun avec une recrue
// choisie, de niveau inférieur), 1 intendant (en plus d'un autre rôle), obligatoire dès qu'au moins un personnage
// reste au camp. Commercer : à l'assignation, saisir combien de provisions acheter. Moral de chaque personnage,
// héros principaux compris, affiché dans son fil invisible ; chaque hausse ou baisse de moral est prise en compte
// par les fils invisibles. »
// Lancer : node tests_monstres/corrections_v481.mjs
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
titre("1. LES TÂCHES ET LEURS CHIFFRES (camp_pur.js)");
// =========================================================================
await section(async () => {
  verifier("m = (carac − 10) ÷ 2, arrondi vers le bas (8 → −1, 10 → 0, 13 → +1, 16 → +3)",
    CP.modificateur(8) === -1 && CP.modificateur(10) === 0 && CP.modificateur(13) === 1 && CP.modificateur(16) === 3 && CP.modificateur(9) === -1 && CP.modificateur(undefined) === 0);
  verifier("une tâche à deux caracs prend la meilleure (cueillir : Intelligence ou Force ; entraîner : Charisme ou Sagesse)",
    CP.mDeTache("cueillir", { int: 8, force: 14 }) === 2 && CP.mDeTache("entrainer", { cha: 12, sag: 16 }) === 3 && CP.mDeTache("chasser", { dex: 15 }) === 2);
  verifier("le moral : 80 ou plus +1 au m, 10 à 29 −1, moins de 10 ne travaille plus",
    CP.mAvecMoral(1, 80) === 2 && CP.mAvecMoral(1, 79) === 1 && CP.mAvecMoral(1, 30) === 1 && CP.mAvecMoral(1, 29) === 0 && CP.mAvecMoral(1, 10) === 0 && CP.mAvecMoral(1, 9) === null);
  verifier("le rendement selon la jauge : 60+ 100 %, 30-59 50 %, 1-29 25 %, 0 rien",
    CP.rendementJauge(60) === 1 && CP.rendementJauge(59) === 0.5 && CP.rendementJauge(30) === 0.5 && CP.rendementJauge(29) === 0.25 && CP.rendementJauge(1) === 0.25 && CP.rendementJauge(0) === 0);
  verifier("les limites : 2 cuisiniers, 1 soigneur, 1 forgeron, 1 éclaireur, 2 entraîneurs",
    CP.TACHES.cuisiner.max === 2 && CP.TACHES.soigner.max === 1 && CP.TACHES.forger.max === 1 && CP.TACHES.eclaireur.max === 1 && CP.TACHES.entrainer.max === 2 && !CP.TACHES.chasser.max);
});

titre("2. LE BILAN DU JOUR : L'EXEMPLE DU DOCUMENT");
await section(async () => {
  // « Un camp de 6 membres en forêt (jauge 90), avec 2 chasseurs à m +1, 1 cueilleur à m 0 et 1 cuisinier à m +1,
  // gagne +6 provisions par jour. Après 8 jours, la jauge passe sous 60 et le bilan tombe à +1. Vers 15 jours, elle
  // passe sous 30 et le camp est en déficit. »
  const camp = { Membres: { a: { Tache: "chasser", Moral: 60 }, b: { Tache: "chasser", Moral: 60 }, c: { Tache: "cueillir", Moral: 60 }, d: { Tache: "cuisiner", Moral: 60 }, e: { Moral: 60 }, f: { Moral: 60 } }, Ressources: { Jauge: 90 } };
  const infos = { a: { caracs: { dex: 12 } }, b: { caracs: { dex: 13 } }, c: { caracs: { int: 10, force: 9 } }, d: { caracs: { int: 12 } } };
  const b = CP.bilanDuJour(camp, infos, []);
  verifier("jauge 90 : chasse 8, cueillette 2, consommation 6 − 2 (la cuisine) = 4 : +6 par jour", b.production === 10 && b.consommation === 4 && b.net === 6 && b.chasse === 8 && b.cueillette === 2, JSON.stringify(b));
  const usure = 1 + 3;   // −1 pour le camp, −1 par chasseur ou cueilleur
  let j = 90, jour = 0; while (j >= 60) { j -= usure; jour++; }
  verifier("après 8 jours (−4 par jour), la jauge passe sous 60 : +1 par jour", jour === 8 && CP.bilanDuJour({ ...camp, Ressources: { Jauge: j } }, infos, []).net === 1, `${jour} jours, jauge ${j}`);
  while (j >= 30) { j -= usure; jour++; }
  verifier("vers 15 jours, sous 30 : le camp est en déficit", jour >= 15 && jour <= 16 && CP.bilanDuJour({ ...camp, Ressources: { Jauge: j } }, infos, []).net < 0, `${jour} jours`);
  const seul = CP.bilanDuJour({ Membres: { a: { Tache: "cuisiner" }, b: { Tache: "cuisiner" } }, Ressources: { Jauge: 90 } }, { a: { caracs: { int: 16 } }, b: { caracs: { int: 16 } } }, []);
  verifier("la consommation du camp ne descend jamais sous 1 par jour", seul.consommation === 1, JSON.stringify(seul));
  const parti = CP.bilanDuJour(camp, infos, ["a", "e"]);
  verifier("les membres en expédition ne mangent pas au camp et n'y travaillent pas", parti.presents === 4 && parti.chasse === 4 && parti.consommation === 2, JSON.stringify(parti));
  const triste = CP.bilanDuJour({ ...camp, Membres: { ...camp.Membres, a: { Tache: "chasser", Moral: 5 } } }, infos, []);
  verifier("un chasseur au moral sous 10 ne chasse plus", triste.chasse === 4, JSON.stringify(triste));
});

titre("3. QUI PEUT PRENDRE QUELLE TÂCHE");
await section(async () => {
  const camp = { Caisse: 20, Provisions: 6, Membres: { PNJ_THEMES_P1: { Narrateur: true }, a: { Tache: "cuisiner" }, b: { Tache: "cuisiner" }, c: { Tache: "soigner" }, d: {}, e: {}, f: { Tache: "entrainer", Recrue: "d" } } };
  const infos = { a: { niveau: 3 }, d: { niveau: 1 }, e: { niveau: 3, caracs: { cha: 14 } }, f: { niveau: 4 } };
  verifier("pas de troisième cuisinier, pas de second soigneur", /Pas plus de 2 cuisiniers/.test(CP.peutAssigner(camp, "d", "cuisiner", { infos })) && /Pas plus de un soigneur/.test(CP.peutAssigner(camp, "d", "soigner", { infos })));
  verifier("…mais celui qui l'est déjà peut le rester ; chasser n'a pas de limite", CP.peutAssigner(camp, "a", "cuisiner", { infos }) === "" && CP.peutAssigner(camp, "d", "chasser", { infos }) === "");
  verifier("Thémès ne prend pas de tâche (il part avec chaque expédition)", /Thémès/.test(CP.peutAssigner(camp, "PNJ_THEMES_P1", "chasser", { infos })));
  verifier("pendant une expédition hors du camp : rien ne change", /expédition est en cours/.test(CP.peutAssigner(camp, "d", "chasser", { infos, bloque: true })));
  verifier("entraîner : une recrue choisie, de niveau inférieur", /recrue/.test(CP.peutAssigner(camp, "e", "entrainer", { infos })) && /niveau inférieur/.test(CP.peutAssigner(camp, "d", "entrainer", { infos, recrue: "e" }))
    && CP.peutAssigner(camp, "e", "entrainer", { infos, recrue: "d" }) === "", CP.peutAssigner(camp, "e", "entrainer", { infos, recrue: "d" }));
  const m = CP.mDeTache("commercer", infos.e.caracs);
  verifier("commercer : jusqu'à (5 + 2 × m) provisions (3 au moins)", CP.maxCommerce(-1) === 3 && CP.maxCommerce(0) === 5 && CP.maxCommerce(2) === 9
    && /pas échanger plus de 9/.test(CP.peutAssigner(camp, "e", "commercer", { infos, commerce: { sens: "vente", quantite: 10 } })));
  verifier("…le prix : 3 drachmes l'achat, 1 la vente, ±10 % par point de m sur le total, arrondi",
    CP.prixCommerce("achat", 5, 0) === 15 && CP.prixCommerce("achat", 5, 2) === 12 && CP.prixCommerce("achat", 5, -1) === 17 && CP.prixCommerce("vente", 5, 2) === 6 && CP.prixCommerce("vente", 4, -1) === 4);
  verifier("…pas plus que ce que la caisse peut payer ; pas plus de provisions qu'on n'en a à vendre",
    /Pas assez de drachmes/.test(CP.peutAssigner(camp, "e", "commercer", { infos, commerce: { sens: "achat", quantite: 9 } })) && /pas autant de provisions/.test(CP.peutAssigner(camp, "e", "commercer", { infos, commerce: { sens: "vente", quantite: 7 } }))
    && CP.peutAssigner(camp, "e", "commercer", { infos, commerce: { sens: "achat", quantite: 7 } }) === "");
  verifier("l'intendant : jamais Thémès ; il en faut un dès qu'un personnage reste au camp", /Thémès/.test(CP.peutEtreIntendant(camp, "PNJ_THEMES_P1", [])) && CP.peutEtreIntendant(camp, "d", []) === ""
    && CP.intendantManquant(camp, []) && !CP.intendantManquant({ ...camp, Intendant: "d" }, []) && !CP.intendantManquant({ Membres: { PNJ_THEMES_P1: { Narrateur: true }, a: {} } }, ["a"]));
  verifier("le moral : borné entre 0 et 100 ; une variation de 5 ou plus touche l'humeur (joyeux, triste)", CP.moralBorne(130) === 100 && CP.moralBorne(-4) === 0
    && CP.humeurDuMoral(3) === null && CP.humeurDuMoral(5).emotion === "joie" && CP.humeurDuMoral(-10).emotion === "tristesse" && CP.humeurDuMoral(-15).intensite === 3);
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

titre("4. DU CAMP À LA GESTION : UNE DOUBLE PAGE DU LIVRE");
await section(async () => {
  await p.evaluate(() => window.CAMP_SCENE.ouvrir()); await p.waitForTimeout(1000);
  await p.evaluate(() => document.querySelector('[data-camp="gestion"]').click());
  await p.waitForTimeout(3500);
  const r = await p.evaluate(() => ({ campOuvert: window.CAMP_SCENE.ouvert(), ouverte: window.GESTION_CAMP.ouverte(), dansLeLivre: window.GRIMOIRE.pagesGestion().length === 2,
    titres: [...document.querySelectorAll(".page-gestion .titre-page-fiche")].map(x => x.textContent) }));
  verifier("« Gestion du camp » : le camp se referme, le livre s'ouvre sur sa double page", !r.campOuvert && r.ouverte && r.dansLeLivre && r.titres.join("|") === "Gestion du camp|Les membres du camp", JSON.stringify(r));
});

const lireG = () => p.evaluate(() => { const v = (k) => (document.querySelector(`[data-gestion="${k}"]`) || {}).textContent;
  return { caisse: v("caisse"), provisions: v("provisions"), jauge: v("jauge"), rendement: v("rendement"), production: v("production"), consommation: v("consommation"), net: v("net") }; });
const camp = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"].Camp)));
const choisir = async (id, valeur, gc = "tache") => { await p.evaluate(([id, valeur, gc]) => { const s = document.querySelector(`.page-gestion [data-gc="${gc}"][data-id="${id}"]`); s.value = valeur; s.dispatchEvent(new Event("change", { bubbles: true })); }, [id, valeur, gc]); await p.waitForTimeout(400); };
const note = () => p.evaluate(() => (document.querySelector(".note-gestion") || {}).textContent || "");

titre("5. LA PAGE DE GAUCHE : LA CAISSE, LES PROVISIONS, LA JAUGE, LE BILAN");
await section(async () => {
  const g = await lireG();
  verifier("la caisse du groupe (40 drachmes), les provisions (28), la jauge (90, rendement 100 %)", g.caisse === "40" && g.provisions === "28" && g.jauge === "90" && g.rendement === "100 %", JSON.stringify(g));
  verifier("le bilan du jour sans tâche : 5 au camp, 5 provisions mangées, rien de produit (−5)", g.production === "±0" && g.consommation === "−5" && g.net === "−5", JSON.stringify(g));
  const avis = await p.evaluate(() => [...document.querySelectorAll(".page-gestion-gauche .avis-gestion")].map(x => x.textContent).join(" | "));
  verifier("…les provisions dureront 5 jours ; il faut un intendant", /dureront 5 jours/.test(avis) && /intendant/.test(avis), avis);
});

titre("6. LES MEMBRES ET LEURS TÂCHES");
await section(async () => {
  const l = await p.evaluate(() => [...document.querySelectorAll(".membre-gestion")].map(m => ({ id: m.dataset.membre, select: !!m.querySelector(".select-tache"), fixe: (m.querySelector(".tache-fixe") || {}).textContent || "",
    moral: (m.querySelector(".moral-gestion b") || {}).textContent })));
  verifier("tous les membres : Thémès d'abord (« part avec chaque expédition »), puis les héros, puis les PNJ", l.map(x => x.id).join() === "PNJ_THEMES_P1,H2,H1,PNJ_ARA,PNJ_BORS"
    && /chaque expédition/.test(l[0].fixe) && l.slice(1).every(x => x.select), JSON.stringify(l));
  verifier("…le moral de chacun", l.find(x => x.id === "PNJ_BORS").moral === "85" && l.find(x => x.id === "H1").moral === "60");
  await choisir("PNJ_BORS", "chasser"); await choisir("PNJ_ARA", "cueillir"); await choisir("H1", "cuisiner");
  const c = await camp(), g = await lireG();
  verifier("donner une tâche : elle est écrite dans le camp", c.Membres.PNJ_BORS.Tache === "chasser" && c.Membres.PNJ_ARA.Tache === "cueillir" && c.Membres.H1.Tache === "cuisiner", JSON.stringify(c.Membres));
  // Bors : dex 14 → m +2, moral 85 → +3 : chasse 6 ; Ara : int 13 → m +1 : cueillette 3 ; Thorin int 12 → m +1 : la cuisine épargne 2.
  verifier("…et le bilan suit : chasse 6 (m +2, +1 de moral), cueillette 3, consommation 5 − 2 : +6", g.production === "+9" && g.consommation === "−3" && g.net === "+6", JSON.stringify(g));
  await choisir("H2", "cuisiner");
  const plein = await p.evaluate(() => { const o = [...document.querySelectorAll('.page-gestion [data-gc="tache"][data-id="PNJ_ARA"] option')].find(x => x.value === "cuisiner"); return { dis: o.disabled, t: o.textContent }; });
  verifier("deux cuisiniers : l'option est « complet » pour les autres", plein.dis && /complet/.test(plein.t), JSON.stringify(plein));
  await choisir("H2", "soigner");
  await choisir("PNJ_ARA", "soigner");
  const refus = await note(), c2 = await camp();
  verifier("un second soigneur est refusé, un mot le dit", c2.Membres.H2.Tache === "soigner" && c2.Membres.PNJ_ARA.Tache === "cueillir" && /soigneur/.test(refus), refus);
  await choisir("H2", "");
  verifier("« Repos » : la tâche est retirée", (await camp()).Membres.H2.Tache === null);
});

titre("7. ENTRAÎNER ET COMMERCER : LE DÉTAIL DEMANDÉ");
await section(async () => {
  await choisir("H1", "entrainer");
  const recrues = await p.evaluate(() => [...document.querySelectorAll('.page-gestion [data-gc="recrue"][data-id="H1"] option')].map(o => o.value).filter(Boolean));
  verifier("entraîner : choisir la recrue parmi ceux de niveau inférieur (pas Thémès)", recrues.sort().join() === "H2,PNJ_ARA,PNJ_BORS" && (await camp()).Membres.H1.Tache === "cuisiner", recrues.join());
  await choisir("H1", "PNJ_ARA", "recrue");
  let c = await camp();
  verifier("…la recrue choisie : la tâche est donnée", c.Membres.H1.Tache === "entrainer" && c.Membres.H1.Recrue === "PNJ_ARA", JSON.stringify(c.Membres.H1));
  await choisir("H2", "commercer");
  const form = await p.evaluate(() => { const f = document.querySelector('.commerce-gestion[data-id="H2"]'); return f ? { max: f.querySelector("input").max, prix: f.querySelector(".prix-gestion").textContent } : null; });
  verifier("commercer : acheter ou vendre, combien (5 + 2 × m au plus), et le prix", form && form.max === "5" && /15/.test(form.prix), JSON.stringify(form));
  await p.evaluate(() => { const i = document.querySelector('.quantite-gestion[data-id="H2"]'); i.value = "4"; i.dispatchEvent(new Event("change", { bubbles: true })); });
  await p.waitForTimeout(200);
  await p.evaluate(() => document.querySelector('.valider-commerce[data-id="H2"]').click()); await p.waitForTimeout(400);
  c = await camp();
  verifier("…validé : la tâche, la quantité, le prix (12 drachmes), à payer au premier jour", c.Membres.H2.Tache === "commercer" && c.Membres.H2.Commerce.Sens === "achat" && c.Membres.H2.Commerce.Quantite === 4
    && c.Membres.H2.Commerce.Prix === 12 && c.Membres.H2.Commerce.Paye === false, JSON.stringify(c.Membres.H2));
});

titre("8. L'INTENDANT");
await section(async () => {
  const options = await p.evaluate(() => [...document.querySelectorAll(".select-intendant option")].map(o => o.value).filter(Boolean));
  verifier("au choix : tous les membres sauf Thémès", options.sort().join() === "H1,H2,PNJ_ARA,PNJ_BORS", options.join());
  await p.evaluate(() => { const s = document.querySelector(".select-intendant"); s.value = "PNJ_ARA"; s.dispatchEvent(new Event("change", { bubbles: true })); });
  await p.waitForTimeout(400);
  const c = await camp(), avis = await p.evaluate(() => [...document.querySelectorAll(".page-gestion-gauche .avis-gestion")].map(x => x.textContent).join(" | "));
  verifier("nommé : il garde sa tâche ; plus d'avis « il faut un intendant »", c.Intendant === "PNJ_ARA" && c.Membres.PNJ_ARA.Tache === "cueillir" && !/intendant/.test(avis), avis);
});

titre("9. PENDANT UNE EXPÉDITION, LES POSTES NE CHANGENT PAS");
await section(async () => {
  await p.evaluate(() => { const d = window.__docs["Systeme_Parties/P1"]; d.Expedition = { En_Cours: true, Membres: ["H1", "PNJ_THEMES_P1"] }; window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(d))); });
  await p.waitForTimeout(1300);
  const r = await p.evaluate(async () => ({ desactives: [...document.querySelectorAll(".page-gestion select")].every(s => s.disabled),
    avis: document.querySelector(".page-gestion-gauche .avis-gestion").textContent, h1: (document.querySelector('.membre-gestion[data-membre="H1"] .tache-fixe') || {}).textContent,
    refus: await window.CAMP.assignerTache("PNJ_BORS", "cueillir") }));
  verifier("les menus sont figés, un mot le dit ; ceux qui sont partis : « en expédition »", r.desactives && /expédition est en cours/.test(r.avis) && r.h1 === "En expédition", JSON.stringify(r));
  verifier("…et la base refuse aussi", /expédition est en cours/.test(r.refus) && (await camp()).Membres.PNJ_BORS.Tache === "chasser");
  await p.evaluate(() => { const d = window.__docs["Systeme_Parties/P1"]; delete d.Expedition; window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(d))); });
  await p.waitForTimeout(1300);
});

titre("10. LE MORAL DANS LES FILS INVISIBLES");
await section(async () => {
  const faits = await p.evaluate(async () => window.CAMP.changerMoral([{ id: "PNJ_BORS", delta: -10, raison: "la faim", dateJeu: "Jour 3" }, { id: "H1", delta: 3, raison: "le repos" }]));
  const d = await p.evaluate(() => ({ camp: window.__docs["Systeme_Parties/P1"].Camp, ame: window.__docs["Systeme_Parties/P1/Ames/PNJ_BORS"], ameH1: window.__docs["Systeme_Parties/P1/Ames/H1"],
    souvenirs: Object.entries(window.__docs).filter(([k]) => k.startsWith("Systeme_Parties/P1/Souvenirs/")).map(([, v]) => v) }));
  verifier("le moral change dans le camp, chaque variation inscrite", d.camp.Membres.PNJ_BORS.Moral === 75 && d.camp.Membres.H1.Moral === 63
    && d.camp.Membres.PNJ_BORS.Moral_Historique.slice(-1)[0].Delta === -10 && d.camp.Membres.PNJ_BORS.Moral_Historique.slice(-1)[0].Raison === "la faim", JSON.stringify(d.camp.Membres.PNJ_BORS));
  verifier("…une baisse de 10 : un souvenir et une humeur triste dans ses fils invisibles ; +3 : pas d'humeur",
    d.souvenirs.some(s => s.ame === "PNJ_BORS" && /Mon moral baisse \(−10\) : la faim/.test(s.texte)) && d.ame.humeur && d.ame.humeur.emotion === "tristesse" && !(d.ameH1.humeur), JSON.stringify(d.ame.humeur));
  await p.evaluate(() => document.querySelector('.page-gestion [data-gc="ame"][data-id="PNJ_BORS"]').click());
  await p.waitForTimeout(3500);
  const l = await p.evaluate(() => ({ moral: (document.querySelector(".moral-liens b") || {}).textContent, variations: [...document.querySelectorAll(".variations-moral-liens li")].map(x => x.textContent.trim()),
    retour: (document.querySelector('.retour-liens[data-cb="gestion"]') || {}).textContent }));
  verifier("un clic sur un membre : ses fils invisibles, avec sa jauge de moral et ses variations", l.moral === "75" && /−10 la faim/.test(l.variations[0] || ""), JSON.stringify(l));
  verifier("…et « ← Revenir à la gestion du camp »", /gestion du camp/.test(l.retour || ""));
  await p.evaluate(() => document.querySelector('.retour-liens[data-cb="gestion"]').click()); await p.waitForTimeout(3000);
  verifier("le retour ramène à la double page de gestion", await p.evaluate(() => window.GESTION_CAMP.ouverte()));
});

titre("11. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 481 ou plus (trace_combat.js, version.json)", v >= 481 && JSON.parse(lire("version.json")).version >= 481, `${v}`);
  const ix = lire("index.html");
  verifier("index.html charge la gestion du camp et son style", /grimoire_gestion\.js\?v=\d+/.test(ix) && /grimoire_gestion\.css\?v=\d+/.test(ix));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
