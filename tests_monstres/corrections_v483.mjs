// v483 — LE CLAN NOMADE, ÉTAPE 6 : LES EXPÉDITIONS.
// Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md) : « Renommer « Le groupe » en « Expédition » dans le
// sommaire. Page Expédition : trois emplacements, bouton « Monter l'expédition », liste des personnages jouables
// (ceux du joueur, puis ceux du camp), nom du joueur en petit sous chaque personnage. Thémès part automatiquement ;
// 0 à 2 suiveurs (ils quittent leur tâche, consomment 1 provision par jour, donnent leur bonus à tout le groupe :
// Force +1 équipement, Dextérité −1 provision par jour, autres caracs +1 aux tests du groupe). Provisions emportées,
// compteur de jours et décompte des provisions. Début de l'expédition quand le groupe quitte la case du camp ; fin
// quand il y revient (personnages retirés des emplacements, butin versé à la réserve). Archive : Expédition 1, 2…
// Mode arène (test) : avant chaque combat, choisir le personnage de chaque joueur. »
// Lancer : node tests_monstres/corrections_v483.mjs
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
titre("1. LES RÈGLES DE L'EXPÉDITION (camp_pur.js)");
// =========================================================================
await section(async () => {
  verifier("le bonus d'un suiveur : sa meilleure caractéristique (Force : équipement ; Dextérité : −1 provision par jour ; les autres : +1 aux tests)",
    CP.bonusSuiveur({ force: 15, dex: 10 }).carac === "force" && CP.bonusSuiveur({ dex: 15 }).carac === "dex" && CP.bonusSuiveur({ sag: 14 }).carac === "sag" && /tests de Sagesse/.test(CP.bonusSuiveur({ sag: 14 }).texte)
    && CP.bonusSuiveur({ force: 12, cha: 12 }).carac === "force");
  const caracs = { D1: { dex: 15 }, D2: { dex: 14 }, S1: { sag: 14 }, F1: { force: 16 } };
  const b = CP.bonusExpedition(["D1", "D2", "S1", "F1"], (id) => caracs[id]);
  verifier("le bonus du groupe : deux suiveurs de Dextérité économisent 2 provisions par jour ; +1 Sagesse ; +1 équipement", b.economie === 2 && b.tests.sag === 1 && b.equipement === 1, JSON.stringify(b));
  const camp = { Provisions: 20, Intendant: null, Membres: { PNJ_THEMES_P1: { Narrateur: true }, H1: { Tache: "chasser" }, H2: {}, D1: { Tache: "cueillir" }, S1: { Tache: "commercer", Commerce: { Sens: "achat", Quantite: 3, Prix: 9, Paye: false } }, A1: { Tache: "chasser" } } };
  const exp = { ...CP.expeditionVide(1, 8), Emplacements: [{ Perso: "H1", Joueur: "J1" }, null, null], Suiveurs: ["D1", "S1"] };
  verifier("ceux qui partent : les personnages des places, Thémès (toujours), les suiveurs", CP.membresExpedition(exp, camp).join() === "H1,PNJ_THEMES_P1,D1,S1");
  verifier("ce que l'expédition mange : 1 par membre, moins 1 par suiveur de Dextérité (4 − 1 = 3)", CP.consommationExpedition(exp, camp, (id) => caracs[id]) === 3);
  verifier("une place : un joueur par place, un personnage à lui, jamais deux fois le même",
    CP.peutPrendrePlace(exp, 1, "H2", "J2", ["H2"]) === "" && /déjà une place/.test(CP.peutPrendrePlace(exp, 1, "H3", "J1", ["H3"])) && /déjà prise/.test(CP.peutPrendrePlace(exp, 0, "H2", "J2", ["H2"]))
    && /ne peux pas jouer/.test(CP.peutPrendrePlace(exp, 1, "H2", "J2", [])) && /part déjà/.test(CP.peutPrendrePlace(exp, 1, "D1", "J2", ["D1"])) && /n'existe pas/.test(CP.peutPrendrePlace(exp, 3, "H2", "J2", ["H2"])));
  verifier("les suiveurs : deux au plus, jamais Thémès (il part toujours)", /Pas plus de 2/.test(CP.peutEmmener(exp, camp, "A1")) && /Thémès part toujours/.test(CP.peutEmmener({ ...exp, Suiveurs: [] }, camp, "PNJ_THEMES_P1"))
    && CP.peutEmmener({ ...exp, Suiveurs: [] }, camp, "A1") === "");
  const d = { Camp: { ...camp, Position: { Region: 7, x: 0.5, y: 0.5 } }, Position_Groupe: { Region: 7, x: 0.5, y: 0.5 } };
  verifier("partir du camp sans expédition montée : refusé", /Montez d'abord l'expédition/.test(CP.refusDepartDuCamp(d)));
  verifier("…personne n'a pris place : refusé ; un membre reste sans intendant : refusé", /Personne n'a encore pris place/.test(CP.refusDepartDuCamp({ ...d, Expedition: CP.expeditionVide(1) }))
    && /intendant/.test(CP.refusDepartDuCamp({ ...d, Expedition: exp })));
  verifier("…avec un intendant, on part ; loin du camp, aucune règle (le voyage d'avant)", CP.refusDepartDuCamp({ ...d, Camp: { ...d.Camp, Intendant: "A1" }, Expedition: exp }) === ""
    && CP.refusDepartDuCamp({ ...d, Position_Groupe: { Region: 7, x: 0.9, y: 0.1 } }) === "");
  const dep = CP.departExpedition({ Camp: camp, Expedition: exp }, { caracsDe: (id) => caracs[id], maintenant: 5, dateJeu: "Jour 3" });
  verifier("le départ : les provisions emportées sont prises sur la réserve (20 → 12)", dep.Camp.Provisions === 12 && dep.Expedition.Provisions === 8 && dep.Expedition.En_Cours && dep.Expedition.Jours === 0);
  verifier("…ceux qui partent quittent leur tâche (un commerce non payé est annulé) ; ceux qui restent la gardent",
    dep.Camp.Membres.H1.Tache === null && dep.Camp.Membres.D1.Tache === null && !dep.Camp.Membres.S1.Commerce && dep.Camp.Membres.A1.Tache === "chasser");
  verifier("…les membres de l'expédition, son bonus, sa date", dep.Expedition.Membres.join() === "H1,PNJ_THEMES_P1,D1,S1" && dep.Expedition.Economie_Provisions === 1 && dep.Expedition.Bonus.tests.sag === 1 && dep.Expedition.Debut.Date_Jeu === "Jour 3");
  const campRetour = { ...dep.Camp, Membres: { ...dep.Camp.Membres, A1: { Tache: "commercer", Commerce: { Sens: "achat", Quantite: 4, Paye: true, A_Livrer: 4 } } } };
  const ret = CP.retourExpedition({ Camp: campRetour, Expedition: { ...dep.Expedition, Provisions: 3, Jours: 6 } }, { maintenant: 9, dateJeu: "Jour 9" });
  verifier("le retour : ce qui reste et les achats du commerce rejoignent la réserve (12 + 3 + 4)", ret.Camp.Provisions === 19 && !ret.Camp.Membres.A1.Commerce.A_Livrer && ret.resume.Livraisons[0].quantite === 4);
  verifier("…l'expédition est gardée dans l'histoire du camp ; la prochaine porte le numéro 2", ret.Camp.Prochaine_Expedition === 2 && ret.Camp.Expeditions_Passees[0].Jours === 6 && ret.Camp.Dernier_Retour.Numero === 1);
  const j = CP.journeeDuCamp({ camp: dep.Camp, infos: {}, partis: dep.Expedition.Membres, expedition: dep.Expedition }, () => 0.99);
  verifier("la journée en route : le compteur de jours de l'expédition, ses provisions (8 − 3)", j.expedition.Jours === 1 && j.expedition.Provisions === 5, JSON.stringify(j.expedition).slice(0, 120));
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
  window.jouerSonClic = () => {}; window.__alertes = []; window.alert = (t) => window.__alertes.push(t); window.confirm = () => true;
  window.COMPTE_JOUEUR = { nom: "Ben", email: "ben@ivalis.fr", admin: false };
  window.LISTE_PARTIES_CACHE = [{ id: "P1", nom: "Les Lames d'Héra" }];
  window.PERSOS_JOUEURS_PARTIE = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", classe: "Protecteur", niveau: 3, creeLe: 1, actif: true },
    { idPersonnage: "H1B", idJoueur: "J1", prenom: "Bran", classe: "Pisteur", niveau: 1, creeLe: 2, actif: false },
    { idPersonnage: "H2", idJoueur: "J2", prenom: "Lyra", classe: "Pisteur", niveau: 2, creeLe: 1, actif: true }];
  window.PERSOS_PARTIE = window.PERSOS_JOUEURS_PARTIE.filter(h => h.actif);
  window.__bascules = []; window.basculerActivationPersonnage = async (id, actif) => { window.__bascules.push([id, actif]); const h = window.PERSOS_JOUEURS_PARTIE.find(x => x.idPersonnage === id); if (h) h.actif = actif; };
  window.CARACS_PARTIE = { H1: { force: 14, sag: 10 }, H1B: { dex: 12 }, H2: { dex: 15 } };
  window.__docs = window.__docs || {};
  window.__docs["Monde_PNJ/PNJ_THEMES_P1"] = { Nom_PNJ: "Thémès", Narrateur: true };
  window.__docs["Monde_PNJ/PNJ_DEX"] = { Nom_PNJ: "Vif", Caracs: { dex: 15 } };
  window.__docs["Monde_PNJ/PNJ_SAG"] = { Nom_PNJ: "Sage", Caracs: { sag: 14 } };
  window.__docs["Monde_PNJ/PNJ_ARA"] = { Nom_PNJ: "Ara", Caracs: { int: 12 } };
  window.__docs["Date_En_Jeu/actuelle"] = { Jour: "20", Annee: "3" };
  window.__docs["Systeme_Parties/P1"] = { Position_Groupe: { Region: 7, x: 0.5, y: 0.5 }, Heros_Principaux: { J1: "H1" },
    Camp: { Position: { Region: 7, x: 0.5, y: 0.5 }, Caisse: 40, Provisions: 30, Ressources: { Jauge: 90 }, Intendant: null, Prochaine_Expedition: 1,
      Membres: { PNJ_THEMES_P1: { Type: "pnj", Nom: "Thémès", Narrateur: true, Moral: 60 }, H1: { Type: "heros", Joueur: "J1", Moral: 60 }, H1B: { Type: "heros", Joueur: "J1", Moral: 60 },
                 H2: { Type: "heros", Joueur: "J2", Moral: 60 }, PNJ_DEX: { Type: "pnj", Tache: "chasser", Moral: 60 }, PNJ_SAG: { Type: "pnj", Tache: "cueillir", Moral: 60 }, PNJ_ARA: { Type: "pnj", Tache: "cueillir", Moral: 60 } } } };
  window.PORTES_GRIMOIRE = { verifierCle: async () => true, creerPartie: async () => "P_NEUVE", verifierMdpPartie: async (id, m) => ({ ok: m === "sel" }),
    entrerDansPartie: (id) => { window.ID_PARTIE_COURANTE = id; document.getElementById("ecran-jeu").style.display = "block"; } };
  // L'écoute de la partie (app.js) : ici le camp et l'expédition seulement (pas le dessin du voyage).
  window.appliquerVoyageDeLaPartie = (d) => { window.PARTIE_DATA = d; window.appliquerCampDeLaPartie(d); };
  window.__relaisPartie = true;
  window.PARTIE_DATA = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]));
  window.appliquerCampDeLaPartie(window.PARTIE_DATA);
  window.positionGroupeBrute = () => (window.PARTIE_DATA || {}).Position_Groupe || null;
  window.__archives = []; window.nettoyerChatVoyage = async (o) => { window.__archives.push(o); return true; };
  window.__retours = []; window.addEventListener("ivalis-retour-expedition", (e) => window.__retours.push(e.detail));
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
const partie = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"])));
const relayer = () => p.evaluate(() => window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))));
const geste = async (sel) => { await p.evaluate((sel) => document.querySelector(sel).click(), sel); await p.waitForTimeout(500); };

titre("2. LE SOMMAIRE : « EXPÉDITION » À LA PLACE DE « GROUPE »");
await section(async () => {
  verifier("l'entrée du sommaire s'appelle « Expédition »", /\["groupe", "Expédition"\]/.test(lire("grimoire.js")));
  const r = await p.evaluate(() => [...document.querySelectorAll("#ecran-grimoire .entree-index")].map(x => x.textContent.replace(/\s+/g, " ").trim()).join(" | "));
  verifier("…dans le livre", /Expédition/.test(r) && !/I- Groupe/.test(r), r);
});

titre("3. LA PAGE EXPÉDITION : MONTER L'EXPÉDITION, PRENDRE SA PLACE");
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_GROUPE.ouvrir()); await p.waitForTimeout(3000);
  const a = await p.evaluate(() => ({ titre: (document.querySelector(".page-expedition-gauche .nom-du-groupe") || {}).textContent, monter: !!document.querySelector('[data-gp="monter"]'),
    droite: (document.querySelector(".page-expedition-droite .titre-page-fiche") || {}).textContent }));
  verifier("avec un camp : la double page de l'expédition (« Expédition 1 », « Monter l'expédition »)", /Expédition 1/.test(a.titre || "") && a.monter && a.droite === "Ceux qui partent aussi", JSON.stringify(a));
  await geste('[data-gp="monter"]');
  let d = await partie();
  verifier("« Monter l'expédition » : trois places vides, aucun suiveur, 10 provisions prévues", d.Expedition && d.Expedition.Montee && !d.Expedition.En_Cours && d.Expedition.Emplacements.length === 3 && d.Expedition.Emplacements.every(x => x === null) && d.Expedition.Provisions_Prevues === 10, JSON.stringify(d.Expedition));
  await relayer(); await p.waitForTimeout(400);
  await geste('[data-gp="place"][data-i="0"]');
  const liste = await p.evaluate(() => ({ siens: [...document.querySelectorAll('[data-gp="choisir-perso"]')].map(x => x.dataset.id), camp: [...document.querySelectorAll(".perso-camp-place")].map(x => x.textContent) }));
  verifier("une place : d'abord ses propres personnages, puis les personnages du camp", liste.siens.join() === "H1,H1B" && liste.camp.length >= 3 && liste.camp.includes("Lyra"), JSON.stringify(liste));
  await geste('[data-gp="choisir-perso"][data-id="H1B"]');
  d = await partie(); await relayer(); await p.waitForTimeout(500);
  verifier("choisir Bran : il prend la place, avec le nom du joueur ; il devient le héros joué", d.Expedition.Emplacements[0] && d.Expedition.Emplacements[0].Perso === "H1B" && d.Expedition.Emplacements[0].Nom_Joueur === "Ben"
    && d.Heros_Principaux.J1 === "H1B", JSON.stringify(d.Expedition.Emplacements));
  const vue = await p.evaluate(() => ({ joueur: (document.querySelector(".place-expedition.prise .joueur-place") || {}).textContent, autresPlaces: [...document.querySelectorAll('[data-gp="place"]')].map(x => x.disabled) }));
  verifier("…sous le personnage, le nom du joueur en petit ; il n'a qu'une place", vue.joueur === "Ben" && vue.autresPlaces.every(Boolean), JSON.stringify(vue));
});

titre("4. LES SUIVEURS ET LES PROVISIONS");
await section(async () => {
  await geste('[data-gp="ouvrir-suiveurs"]'); await p.waitForTimeout(600);
  const choix = await p.evaluate(() => [...document.querySelectorAll('[data-gp="emmener"]')].map(x => x.dataset.id));
  verifier("emmener un suiveur : les membres du camp (pas Thémès, pas ceux qui ont une place)", choix.includes("PNJ_DEX") && choix.includes("PNJ_SAG") && !choix.includes("PNJ_THEMES_P1") && !choix.includes("H1B"), choix.join());
  await geste('[data-gp="emmener"][data-id="PNJ_DEX"]'); await relayer(); await p.waitForTimeout(300);
  await geste('[data-gp="ouvrir-suiveurs"]'); await p.waitForTimeout(400);
  await geste('[data-gp="emmener"][data-id="PNJ_SAG"]'); await relayer(); await p.waitForTimeout(600);
  const d = await partie();
  const vue = await p.evaluate(() => ({ bonus: [...document.querySelectorAll(".page-expedition-droite .bonus-suiveur")].map(x => x.textContent), plus: !!document.querySelector('[data-gp="ouvrir-suiveurs"]'),
    ligne: [...document.querySelectorAll(".page-expedition-droite .ligne-expedition")].map(x => x.textContent.replace(/\s+/g, " ")).join(" | ") }));
  verifier("deux suiveurs, leur bonus affiché ; pas de troisième", d.Expedition.Suiveurs.join() === "PNJ_DEX,PNJ_SAG" && vue.bonus.some(t => /provision dépensée/.test(t)) && vue.bonus.some(t => /Sagesse/.test(t)) && !vue.plus, JSON.stringify(vue));
  verifier("…le bonus du groupe, ce qu'il mange par jour (4 − 1 = 3) et combien de jours il tiendra (10 → 3 jours)", /−1 provision par jour/.test(vue.ligne) && /\+1 aux tests de Sagesse/.test(vue.ligne) && /−3 par jour : de quoi tenir 3 jours/.test(vue.ligne), vue.ligne);
  await p.evaluate(() => { const i = document.querySelector(".provisions-expedition"); i.value = "12"; i.dispatchEvent(new Event("change", { bubbles: true })); });
  await p.waitForTimeout(500);
  verifier("les provisions à emporter (12)", (await partie()).Expedition.Provisions_Prevues === 12);
});

titre("5. PARTIR DU CAMP : IL FAUT UNE EXPÉDITION, ET UN INTENDANT");
await section(async () => {
  await relayer(); await p.waitForTimeout(200);
  const r1 = await p.evaluate(() => window.EXPEDITION.refusDepart());
  verifier("Ara reste au camp sans intendant : on ne part pas", /intendant/.test(r1), r1);
  const voyage = await p.evaluate(async () => window.proposerVoyageGroupe({ type: "region", depart: { Region: 7, x: 0.5, y: 0.5 }, arrivee: { Region: 7, x: 0.8, y: 0.3 }, trace: [{ x: 0.5, y: 0.5 }, { x: 0.8, y: 0.3 }] }));
  verifier("…le voyage proposé est refusé, un mot le dit", voyage && /intendant/.test(voyage.refus || "") && (await p.evaluate(() => window.__alertes.slice(-1)[0] || "")).includes("intendant"), JSON.stringify(voyage));
  await p.evaluate(async () => { await window.CAMP.nommerIntendant("PNJ_ARA"); }); await relayer(); await p.waitForTimeout(200);
  verifier("avec un intendant, rien ne retient l'expédition", (await p.evaluate(() => window.EXPEDITION.refusDepart())) === "");
  verifier("le voyage ne range plus le récit à chaque départ quand il y a un camp", /Avec un camp, le récit se range à la fin de chaque expédition/.test(lire("voyage_groupe.js")));
});

titre("6. LE DÉPART : LE GROUPE QUITTE LA CASE DU CAMP");
await section(async () => {
  await p.evaluate(() => { const d = window.__docs["Systeme_Parties/P1"]; d.Voyage_Groupe = { Id: "V1", Etat: "marche", Jour: 1 }; });
  await relayer(); await p.waitForTimeout(1200);
  const d = await partie();
  verifier("le voyage part : l'expédition commence (en cours, ses membres, ses provisions prises au camp : 30 → 18)", d.Expedition.En_Cours && d.Expedition.Membres.join() === "H1B,PNJ_THEMES_P1,PNJ_DEX,PNJ_SAG"
    && d.Expedition.Provisions === 12 && d.Camp.Provisions === 18, JSON.stringify(d.Expedition).slice(0, 220));
  verifier("…les suiveurs ont quitté leur tâche ; l'intendant reste", d.Camp.Membres.PNJ_DEX.Tache === null && d.Camp.Membres.PNJ_SAG.Tache === null && d.Camp.Intendant === "PNJ_ARA" && d.Camp.Membres.PNJ_ARA.Tache === "cueillir");
  const at = await p.evaluate(() => { const h = window.PERSOS_JOUEURS_PARTIE.find(x => x.idPersonnage === "H1B"); const a = window.atoutRace(h) || {}; const e = window.atoutExpedition(h); return { tests: (a.testsCarac || {}), e }; });
  verifier("le suiveur de Sagesse : +1 aux tests de Sagesse des héros de l'expédition", at.e.testsCarac && at.e.testsCarac.sag === 1 && at.tests.sag >= 1, JSON.stringify(at));
  const bloque = await p.evaluate(() => ({ postes: window.CAMP.postesBloques(), auCamp: window.CAMP.auCamp() }));
  verifier("pendant l'expédition : plus « au camp », les postes sont figés", bloque.postes && !bloque.auCamp);
  await p.evaluate(async () => { await window.journeeDuCamp({ cle: "V1:2" }); }); await relayer(); await p.waitForTimeout(1300);
  const j = await partie();
  verifier("un jour de voyage : l'expédition mange ses provisions (12 − 3), son compteur avance ; le camp les siennes (Ara cueille 3, les 3 restés en mangent 3)",
    j.Expedition.Provisions === 9 && j.Expedition.Jours === 1 && j.Camp.Provisions === 18 && /3 provisions/.test(j.Camp.Journal.slice(-1)[0].Lignes.join(" ")), `${j.Expedition.Provisions} / ${j.Expedition.Jours} / ${j.Camp.Provisions}`);
  const vue = await p.evaluate(() => (document.querySelector('[data-exp="etat"]') || {}).textContent);
  verifier("…la fiche de l'expédition : en route depuis 1 jour", /En route depuis 1 jour/.test(vue || ""), vue);
});

titre("7. LE RETOUR : LE GROUPE REVIENT SUR LA CASE DU CAMP");
await section(async () => {
  await p.evaluate(() => { const d = window.__docs["Systeme_Parties/P1"]; d.Position_Groupe = { Region: 7, x: 0.8, y: 0.3 }; delete d.Voyage_Groupe; });
  await relayer(); await p.waitForTimeout(800);
  verifier("loin du camp, sans voyage : l'expédition continue", !!(await partie()).Expedition);
  const avant = (await partie()).Camp.Provisions;
  await p.evaluate(() => { const d = window.__docs["Systeme_Parties/P1"]; d.Position_Groupe = { Region: 7, x: 0.51, y: 0.5 }; });
  await relayer(); await p.waitForTimeout(1200);
  const d = await partie(), r = await p.evaluate(() => ({ archives: window.__archives, retours: window.__retours }));
  verifier("revenu au camp : l'expédition se termine, les places se vident, les provisions qui restent rentrent (+9)", !d.Expedition && d.Camp.Provisions === avant + 9, `${avant} → ${d.Camp.Provisions}`);
  verifier("…la prochaine sera l'expédition 2 ; celle-ci est gardée", d.Camp.Prochaine_Expedition === 2 && d.Camp.Expeditions_Passees.length === 1 && d.Camp.Dernier_Retour.Numero === 1);
  verifier("…son récit est rangé dans le livre comme « Expédition 1 » (une seule fois)", r.archives.length === 1 && r.archives[0].expedition === 1 && r.archives[0].cimetiere === true, JSON.stringify(r.archives));
  verifier("…le retour est annoncé (pour le rapport de l'intendant)", r.retours.length === 1 && r.retours[0].Numero === 1);
});

titre("8. L'ARCHIVE : « EXPÉDITION N » DANS LE SOMMAIRE");
await section(async () => {
  const rec = lire("grimoire_recit.js"), ia = lire("ia_master.js");
  verifier("le chapitre rangé à la fin d'une expédition s'appelle « Expédition N — son titre »", /if \(o\.expedition\) titre = `Expédition \$\{o\.expedition\} — \$\{titre\}`/.test(rec) && /Expedition: Number\(o\.expedition\)/.test(rec));
  verifier("…le numéro passe du voyage au livre (ia_master.js)", /expedition: opts\.expedition \}\);/.test(ia) && /archiverChapitre\(messages, \{ expedition: opts\.expedition \}\)/.test(ia));
  verifier("le chapitre en cours : « Expédition N, en cours », ou « Au camp, entre deux expéditions »", /Expédition \$\{expRecit\.Numero \|\| ""\}, en cours/.test(rec) && /Au camp, entre deux expéditions/.test(rec));
});

titre("9. LE MODE ARÈNE (TEST)");
await section(async () => {
  await p.evaluate(async () => { await window.EXPEDITION.areneActive(true); await window.EXPEDITION.choisirPourArene("H1"); });
  await relayer(); await p.waitForTimeout(300);
  const r = await p.evaluate(() => ({ choix: window.__docs["Systeme_Parties/P1"].Arene_Choix, combattants: (window.PERSOS_PARTIE || []).filter(x => x && x.idJoueur).map(x => x.idPersonnage).sort() }));
  verifier("chacun choisit son combattant de l'arène, indépendamment du héros actif (Thorin pour J1 ; Lyra garde son actif)", r.choix.Actif === true && r.choix.Choix.J1 === "H1" && r.combattants.join() === "H1,H2", JSON.stringify(r));
  await p.evaluate(() => { const d = window.__docs["Systeme_Parties/P1"]; d.Combat_RP = { Etat: "en_cours" }; window.PARTIE_DATA = JSON.parse(JSON.stringify(d)); window.recomposerCombattants(); });
  const rp = await p.evaluate(() => (window.PERSOS_PARTIE || []).filter(x => x && x.idJoueur).map(x => x.idPersonnage).sort().join());
  verifier("…pas pendant le combat du récit (le héros actif de l'histoire combat)", rp === "H1B,H2", rp);
  await p.evaluate(() => { const d = window.__docs["Systeme_Parties/P1"]; delete d.Combat_RP; window.PARTIE_DATA = JSON.parse(JSON.stringify(d)); });
  await p.evaluate(() => window.GRIMOIRE_COMBATS && window.GRIMOIRE_COMBATS.ouvrir && window.GRIMOIRE_COMBATS.ouvrir()); await p.waitForTimeout(2500);
  const ui = await p.evaluate(() => ({ case: !!document.querySelector('[data-combats-arene="actif"]'), coche: (document.querySelector('[data-combats-arene="actif"]') || {}).checked,
    options: [...document.querySelectorAll('[data-combats-arene="choix"] option')].map(o => o.value).filter(Boolean) }));
  verifier("la double page des combats : la case du mode arène, et le choix de son combattant parmi les siens", ui.case && ui.coche && ui.options.join() === "H1,H1B", JSON.stringify(ui));
});

titre("10. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 483 ou plus (trace_combat.js, version.json)", v >= 483 && JSON.parse(lire("version.json")).version >= 483, `${v}`);
  verifier("index.html charge expedition.js", /expedition\.js\?v=\d+/.test(lire("index.html")));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
