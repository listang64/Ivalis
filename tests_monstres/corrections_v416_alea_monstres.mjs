// v416 — L'ALÉATOIRE DES CRÉATURES, RÉGLÉ PAR NICO. Nico : « Pour la génération de
// combat, retire la valeur aléatoire qui s'applique aux monstres. Remplace-la par la
// possibilité, dans "Monstres", de définir la variable aléatoire qui s'applique aux
// ennemis sous la forme d'une plage qui va de tant à tant, par exemple dégâts −15 % à
// +20 %. Avec, pour tous les monstres, un encart modifiable : Variable Dégâts %
// aléatoire : mini / max ; Variable Résistance magique % aléatoire mini / max ;
// Variable Résistance physique % aléatoire mini / max. Fais en sorte qu'on puisse
// choisir le bonus minimum et maximum, et qu'il puisse être négatif. Le % de dégâts
// s'ajoute à celui existant en fonction du level et si c'est un leader. Pour les
// résistances, la valeur en % s'ajoute à la valeur de résistance du monstre. »
// (La mise en place du livre : celle de corrections_v406_triche.)
//
// Lancer : IVALIS_RACINE=$(pwd) node tests_monstres/corrections_v416_alea_monstres.mjs
//          (V416_CAPTURES=dossier : les captures)
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lire = (f) => { try { return fs.readFileSync(path.join(RACINE, f), 'utf-8'); } catch (e) { return ""; } };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' }); res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({}); export const getApp = () => ({}); export const BANC_IVALIS = true;`;
// Une petite base en mémoire : ce qui s'écrit (setDoc, addDoc, updateDoc) se relit (getDoc, transactions).
// Les écouteurs (onSnapshot) sont gardés : le banc leur envoie lui-même un instantané.
const FAUX_FIRESTORE = `
  const docs = () => (window.__docs = window.__docs || {});
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...c) => ({ chemin: c.join("/") }); export const collection = (_db, ...c) => ({ col: c.join("/") });
  export const getDoc = async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => d || {}, id: r.chemin.split("/").pop() }; };
  export const query = (c) => c; export const where = () => ({}); export const orderBy = () => ({}); export const limit = () => ({});
  export const getDocs = async () => ({ forEach() {}, docs: [], empty: true, size: 0 });
  export const setDoc = async (r, d) => { docs()[r.chemin] = d; (window.__sets = window.__sets || []).push({ chemin: r.chemin, data: d }); };
  export const updateDoc = async (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d }); docs()[r.chemin] = Object.assign({}, docs()[r.chemin] || {}, d); };
  export const deleteDoc = async () => {};
  export const addDoc = async (c, d) => { (window.__ajouts = window.__ajouts || []).push({ col: c.col, data: d }); const id = "A" + window.__ajouts.length; docs()[c.col + "/" + id] = d; return { id }; };
  export const onSnapshot = (q, cb) => { (window.__ecoutes = window.__ecoutes || []).push({ q, cb }); return () => {}; };
  export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
  export const runTransaction = async (_db, f) => f({ get: async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => d || {} }; },
      update: (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d, tx: true }); docs()[r.chemin] = Object.assign({}, docs()[r.chemin] || {}, d); } });
  export const increment = (k) => k; export const deleteField = () => null;
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const serverTimestamp = () => Date.now();
  export class FieldPath {} export const Timestamp = { now: () => Date.now() };
`;
const CAPTURES = process.env.V416_CAPTURES || "";
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
// La table (le banc n'a pas Internet) : du bois dessiné sur place, 1672 × 941.
const TABLE = await (async () => { const pg = await b.newPage(); const u = await pg.evaluate(() => { const c = document.createElement("canvas"); c.width = 1672; c.height = 941;
  const x = c.getContext("2d"); x.fillStyle = "#130c06"; x.fillRect(0, 0, 1672, 941); x.fillStyle = "#7a4a26"; x.fillRect(170, 55, 1470, 835); return c.toDataURL("image/png"); });
  await pg.close(); return Buffer.from(u.split(",")[1], "base64"); })();
const p = await b.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
await p.route('**', r => { const u = r.request().url();
  if (u.startsWith(base)) return r.continue();
  if (/BG_tjiigl/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: TABLE });
  return r.abort(); });
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1200);
const titre = (t) => console.log("\n" + t);
const section = async (f) => { try { await f(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 180)); } };
const attendreQue = async (f, ms = 6000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await p.waitForTimeout(100); } return false; };
const cliquer = (sel) => p.evaluate((sel) => document.querySelector(sel).click(), sel);
const cap = async (nom) => { if (CAPTURES) await p.screenshot({ path: CAPTURES + "/" + nom + ".png" }); };

// Le joueur J1 joue Thorin ; J2 joue Lyra.
await p.evaluate(() => {
  localStorage.setItem("ID_JOUEUR_COURANT", "J1");
  window.jouerSonEvenement = () => true; window.jouerSonClic = () => {};
  window.fermerToutesLesFenetres = () => {};
  window.COMPTE_JOUEUR = { nom: "Ben", email: "ben@ivalis.fr", admin: false };
  window.LISTE_PARTIES_CACHE = [{ id: "P1", nom: "Les Lames d'Héra" }];
  const heros = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", nom: "Ironfoot", race: "Nain", classe: "Guerrier", actif: true, urlCloudinary: "" },
                 { idPersonnage: "H2", idJoueur: "J2", prenom: "Lyra", nom: "Sombreval", actif: true, urlCloudinary: "" }];
  window.PERSOS_JOUEURS_PARTIE = heros; window.PERSOS_PARTIE = heros.slice();
  window.PORTES_GRIMOIRE = {
    verifierCle: async () => true, creerPartie: async () => "P_NEUVE",
    verifierMdpPartie: async (id, m) => ({ ok: m === "sel" }),
    entrerDansPartie: (id) => { window.ID_PARTIE_COURANTE = id; document.getElementById("ecran-jeu").style.display = "block"; }
  };
  ["ouvrirChatbox", "ouvrirMenuPersonnages", "ouvrirPopupRencontre", "ouvrirParametres"].forEach(n => { window[n] = () => {}; });
  window.declencherTourIA = async () => {};
  window.lancerJetPourHeros = async () => true;
  window.lancerRecitDynamique = () => {}; window.majRecitDynamique = () => {}; window.annoncerJetsDemandes = () => {};
  window.afficherEcranAttente = () => {};
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== "ecran-grimoire") e.style.display = "none"; });
  window.afficherGrimoire();
});
await p.waitForTimeout(1300);
await p.evaluate(() => window.ouvrirGrimoire());
await p.waitForTimeout(1200);
await p.evaluate(() => { window.ZONES_LIVRE = {}; window.jouerTraverseeNuages = async () => null; });
await cliquer("#grimoire-btn-charger");
await p.waitForTimeout(700);
await cliquer('#grimoire-liste-parties [data-id="P1"]');
await p.waitForTimeout(150);
await p.fill("#grimoire-mdp-partie", "sel");
await p.evaluate(() => window.appliquerVoyageDeLaPartie && window.appliquerVoyageDeLaPartie({ Position_Groupe: { Region: 5, x: 0.42, y: 0.55 } }));
await cliquer("#grimoire-valider-partie");
await p.evaluate(() => window.appliquerVoyageDeLaPartie && window.appliquerVoyageDeLaPartie({ Position_Groupe: { Region: 5, x: 0.42, y: 0.55 } }));
const pose = () => attendreQue(() => p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getState() === "read" && !window.GRIMOIRE.defileEnCours()), 8000);
await p.waitForTimeout(1500);
await p.evaluate(() => {
  window.verifierMdpParametres = async (m) => m === "rune";
  window.confirmerRetourMenu = () => {}; window.confirmerQuitterJeu = () => {};
});

const reglages = () => p.evaluate(() => (window.__sets || []).filter(x => x.chemin === "Monstres_Modeles/_REGLAGES").map(x => x.data));
const saisir = async (ligne, borne, valeur) => {
  const sel = `#corps-reglages-alea input[data-ligne="${ligne}"][data-borne="${borne}"]`;
  await p.evaluate(() => { window.__sets = []; });
  await p.fill(sel, String(valeur)); await p.press(sel, "Tab"); await p.waitForTimeout(150);
  return { valeur: await p.evaluate((sel) => document.querySelector(sel).value, sel), ecrit: await reglages() };
};
const cases = () => p.evaluate(() => Object.fromEntries(["degats", "resMagique", "resPhysique"].map(l =>
  [l, [...document.querySelectorAll(`#corps-reglages-alea input[data-ligne="${l}"]`)].map(i => i.dataset.borne + "=" + i.value).join(" ")])));
const enMemoire = () => p.evaluate(() => JSON.stringify(window.REGLAGES_MONSTRES.alea));
// Un gabarit : 10 % de résistance physique, 20 % de magique.
const GAB = { Cle: "dps_cac__normal", Archetype: "DPS CAC", Palier: "Normal", PV: 60, Res_Physique: 10, Res_Magique: 20,
              Parade_Esquive: 15, Fatigue_Max: 120, Regeneration: 30, Repos_Long: 90, Nombre_Actions: 1, XP_Groupe: 100 };
// Des plages posées comme si elles venaient de la base.
const poser = (alea) => p.evaluate((alea) => { window.appliquerReglagesMonstres(alea); }, alea);
const creer = (n, leader) => p.evaluate(async ([gab, n, leader]) => {
  window.ID_PARTIE_COURANTE = "P1";
  const fiches = [];
  for (let i = 0; i < n; i++) {
    const extra = { Initiative: 10, Critique: 5, ...(leader ? window.champsLeader(gab) : {}) };
    fiches.push(await window.creerMonstreDepuisGabarit("MONSTRE_T" + i, gab, extra));
  }
  return fiches;
}, [GAB, n, !!leader]);

titre("1. PLUS AUCUNE VARIATION DES ANCIENNES STATS (les ±5 % de la v270)");
await section(async () => {
  const src = lire("monstres.js");
  verifier("le code n'a plus varierStatsMonstre ni ses ±5 %", !/varierStatsMonstre\s*=|VARIATION_STATS_MONSTRE_PCT\s*=|STATS_VARIEES_MONSTRE/.test(src));
  await p.evaluate(() => { window.NIVEAU_GROUPE = 3; });
  await poser(null);
  const f = await creer(40);
  const tricheV = await p.evaluate(() => window.tricheActuelle().pv);
  const attendu = { PV_Max: 60 + tricheV, PV_Actuels: 60 + tricheV, Fatigue_Max: 120, Fatigue_Actuelle: 120, Def_Physique: 10, Def_Magique: 20,
                    Esquive: 15, Parade: 15, Regeneration: 30, Repos_Long: 90, Initiative: 10, Critique: 5, XP_Groupe: 100, Nombre_Actions: 1 };
  const ecarts = [];
  f.forEach(d => Object.keys(attendu).forEach(k => { if (d[k] !== attendu[k]) ecarts.push(`${k}=${d[k]}`); }));
  verifier("40 créatures (aléa 0 / 0) : toutes leurs stats = celles du gabarit, à l'unité", f.length === 40 && ecarts.length === 0, ecarts.slice(0, 4).join(" "));
  verifier("…plus de Variation_Stats sur la fiche", f.every(d => !("Variation_Stats" in d)));
  verifier("…l'aléa tiré est sur la fiche, à 0 (Alea_Degats_Pct, Alea_Res_Magique_Pct, Alea_Res_Physique_Pct)",
           f.every(d => d.Alea_Degats_Pct === 0 && d.Alea_Res_Magique_Pct === 0 && d.Alea_Res_Physique_Pct === 0), JSON.stringify(f[0]));
  const pct = await p.evaluate(() => window.moteurPur.bonusMonstreDe({ estMonstre: true, palier: "Normal" }));
  verifier("…et le % de dégâts reste celui du niveau du groupe (niveau 3 : 10 %)", pct === 10, String(pct));
});

titre("2. L'ENCART DANS PARAMÈTRES › MONSTRES");
await section(async () => {
  await pose();
  await cliquer("#grimoire-btn-parametres"); await p.waitForTimeout(500); await pose(); await p.waitForTimeout(500);
  await p.fill("#grimoire-mdp-param", "rune"); await cliquer("#grimoire-param-deverrouiller"); await p.waitForTimeout(400);
  await cliquer("#grimoire-param-monstres"); await p.waitForTimeout(700);
  await p.evaluate(() => { window.appliquerReglagesMonstres(null); window.dessinerReglagesMonstres(); });
  await p.waitForTimeout(200);
  const r = await p.evaluate(() => {
    const bloc = document.getElementById("corps-reglages-alea");
    const table = bloc && bloc.querySelector("table");
    const calque = document.getElementById("grimoire-param-large").getBoundingClientRect();
    const ins = bloc ? [...bloc.querySelectorAll("input")] : [];
    const rects = ins.map(i => i.getBoundingClientRect());
    return { dansLeLivre: !!document.querySelector("#grimoire-param-large #corps-reglages-alea"),
      nom: (document.querySelector("#reglages-alea .reglages-monstres-nom") || {}).textContent || "",
      titres: table ? [...table.querySelectorAll("tbody tr")].map(t => t.dataset.ligne + "=" + t.querySelector("td").textContent.trim()).join(" | ") : "",
      entetes: table ? [...table.querySelectorAll("thead th")].map(th => th.textContent.trim()).join(",") : "", n: ins.length,
      visibles: rects.every(x => x.width > 18 && x.height > 10), dedans: rects.every(x => x.left >= calque.left - 1 && x.right <= calque.right + 1) };
  });
  verifier("l'encart « L'aléatoire des créatures » est dans la page Monstres du livre", r.dansLeLivre && /aléatoire des créatures/.test(r.nom), JSON.stringify(r));
  verifier("trois lignes : Dégâts, Résistance magique, Résistance physique (% aléatoire)",
           r.titres === "degats=Variable Dégâts % aléatoire | resMagique=Variable Résistance magique % aléatoire | resPhysique=Variable Résistance physique % aléatoire", r.titres);
  verifier("deux colonnes Mini / Maxi, six cases visibles dans la double page", r.entetes === ",Mini,Maxi" && r.n === 6 && r.visibles && r.dedans, JSON.stringify(r));
  const c = await cases();
  verifier("au départ, 0 / 0 partout (aucun aléa)", JSON.stringify(c) === JSON.stringify({ degats: "min=0 max=0", resMagique: "min=0 max=0", resPhysique: "min=0 max=0" }), JSON.stringify(c));
  await p.evaluate(() => document.getElementById("reglages-alea").scrollIntoView({ block: "center" })); await p.waitForTimeout(200);
  await cap("v416_alea_encart");
});

titre("3. IL S'ENREGISTRE, ACCEPTE LE NÉGATIF, CORRIGE UN MINI AU-DESSUS DU MAXI");
await section(async () => {
  const a = await saisir("degats", "min", -15);
  verifier("dégâts mini à −15 : accepté, écrit en base (Alea_Degats_Min / _Max seuls)", a.valeur === "-15" && a.ecrit.length === 1
           && JSON.stringify(a.ecrit[0]) === '{"Alea_Degats_Min":-15,"Alea_Degats_Max":0}', JSON.stringify(a));
  const b2 = await saisir("degats", "max", 20);
  verifier("dégâts maxi à +20 : la plage −15 % à +20 % de Nico", b2.valeur === "20" && JSON.stringify(b2.ecrit[0]) === '{"Alea_Degats_Min":-15,"Alea_Degats_Max":20}'
           && (await enMemoire()).includes('"degats":{"min":-15,"max":20}'), JSON.stringify(b2.ecrit));
  const c = await saisir("resPhysique", "max", -5);
  verifier("résistance physique maxi à −5 (mini 0) : échangés → −5 / 0, dans les deux cases",
           c.valeur === "0" && (await cases()).resPhysique === "min=-5 max=0" && JSON.stringify(c.ecrit[0]) === '{"Alea_Res_Physique_Min":-5,"Alea_Res_Physique_Max":0}',
           JSON.stringify([c, await cases()]));
  const d = await saisir("resMagique", "min", 30);
  verifier("résistance magique mini à 30 (maxi 0) : échangés → 0 / 30", (await cases()).resMagique === "min=0 max=30"
           && JSON.stringify(d.ecrit[0]) === '{"Alea_Res_Magique_Min":0,"Alea_Res_Magique_Max":30}', JSON.stringify([d, await cases()]));
  const e = await saisir("degats", "min", -999), f = await saisir("degats", "max", 999);
  verifier("bornes : −100 % à +300 %", e.valeur === "-100" && f.valeur === "300", `${e.valeur} / ${f.valeur}`);
  const g = await saisir("degats", "max", "");
  verifier("une case vidée garde sa valeur (300)", g.valeur === "300" && (await enMemoire()).includes('"degats":{"min":-100,"max":300}'), g.valeur);
  // Un autre réglage de la page (le leader) ne remet pas l'aléa à zéro sur ce poste.
  await p.evaluate(() => { const i = document.querySelector('#corps-reglages-leader input[data-cle="pv"]'); i.value = "15"; window.modifierReglageMonstre("leader", "pv", i); });
  verifier("changer le leader garde l'aléa réglé", (await enMemoire()).includes('"degats":{"min":-100,"max":300}') && (await enMemoire()).includes('"resMagique":{"min":0,"max":30}'), await enMemoire());
  // Lu en base sur un autre poste : un mini au-dessus du maxi est rangé, une valeur folle bornée.
  const autre = await p.evaluate(() => JSON.stringify(window.normaliserReglagesMonstres({ Alea_Degats_Min: 25, Alea_Degats_Max: -10, Alea_Res_Magique_Min: -500, Alea_Res_Physique_Max: "" }).alea));
  verifier("lu en base : 25 / −10 → −10 / 25 ; −500 → −100 ; vide → 0", autre === '{"degats":{"min":-10,"max":25},"resMagique":{"min":-100,"max":0},"resPhysique":{"min":0,"max":0}}', autre);
});

titre("4. UNE PLAGE FIXE (MINI = MAXI) : LA CRÉATURE REÇOIT EXACTEMENT CES VALEURS");
await section(async () => {
  await poser({ Alea_Degats_Min: 12, Alea_Degats_Max: 12, Alea_Res_Magique_Min: 7, Alea_Res_Magique_Max: 7, Alea_Res_Physique_Min: 10, Alea_Res_Physique_Max: 10 });
  const f = await creer(10);
  verifier("10 créatures : +12 % de dégâts, +7 rés. magique, +10 rés. physique sur la fiche",
           f.every(d => d.Alea_Degats_Pct === 12 && d.Alea_Res_Magique_Pct === 7 && d.Alea_Res_Physique_Pct === 10), JSON.stringify(f[0]));
  verifier("Nico : 10 % de résistance physique + 10 = 20 % ; magique 20 + 7 = 27 %", f.every(d => d.Def_Physique === 20 && d.Def_Magique === 27),
           `${f[0].Def_Physique} / ${f[0].Def_Magique}`);
  verifier("…le reste ne bouge pas (PV, esquive, parade, fatigue)", f.every(d => d.Esquive === 15 && d.Parade === 15 && d.Fatigue_Max === 120 && d.PV_Max === f[0].PV_Max));
  const l = await creer(1, true);
  const bonusL = await p.evaluate(() => window.REGLAGES_MONSTRES.leader.resistances);
  verifier("un leader aussi, sur ses défenses de leader : 10 + 15 + 10 = 35 %", l[0].Leader === true && l[0].Def_Physique === 10 + bonusL + 10
           && l[0].Def_Magique === 20 + bonusL + 7 && l[0].Alea_Degats_Pct === 12, JSON.stringify([l[0].Def_Physique, l[0].Def_Magique, bonusL]));
  // Bornée comme le noyau borne la résistance (jamais plus de 100 %, jamais sous 0).
  const bornes = await p.evaluate(() => {
    window.appliquerReglagesMonstres({ Alea_Res_Physique_Min: 10, Alea_Res_Physique_Max: 10, Alea_Res_Magique_Min: -30, Alea_Res_Magique_Max: -30 });
    return window.tirerAleaMonstre({ Def_Physique: 95, Def_Magique: 20 });
  });
  verifier("95 % + 10 → 100 % ; 20 % − 30 → 0 %", bornes.Def_Physique === 100 && bornes.Def_Magique === 0, JSON.stringify(bornes));
});

// Une petite table de combat pour le noyau (le même module que la page), nourrie par
// l'écouteur des monstres (ecouterMonstresPartie), comme en jeu.
await p.evaluate(async () => {
  const CE = await import("./combat_etat.js");
  window.__CE = CE;
  const fiche = (id, camp, extra = {}) => ({ idPersonnage: id, camp, prenom: id, PV_Max: 100, PV_Actuels: 40, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
  window.__fiche = fiche;
  // Le document Monstres d'une créature, tel que l'écouteur le reçoit → la fiche du jeu.
  window.__depuisLaBase = (doc) => {
    window.ecouterMonstresPartie("P1");
    const e = (window.__ecoutes || []).filter(x => x.q && x.q.col === "Monstres").pop();
    try { e.cb({ forEach: (f) => f({ id: "MONSTRE_A", data: () => doc }) }); } catch (err) { /* la recomposition hors combat */ }
    return (window.MONSTRES_PARTIE || []).find(m => m.idPersonnage === "MONSTRE_A");
  };
  window.__jouer = (monstre, lanceur, cible, valeur, typeRes) => {
    const etat = CE.construireEtatCombat({ idPartie: "P1", cerveau: "P1", graine: 5,
      combattants: [fiche("H1", "Allié", { idJoueur: "P1" }), { ...monstre, PV_Actuels: 40, statut: "Vivant", Etats_Alteres: [] }],
      positions: { H1: { q: 0, r: 0 }, MONSTRE_A: { q: 1, r: 0 } },
      partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: [lanceur], File_Attente_Combat: [{ idPersonnage: lanceur, idCarte: "C" }] } });
    const r = window.moteurPur.resoudreCarte(etat, { type: "carte", idLanceur: lanceur, idCarte: "C", critique: false,
      attaques: [{ valeurBrute: valeur, typeRes: typeRes || "Physique", isHeal: false, cibles: [cible] }], alterations: [],
      jets: { attaqueRatee: false, parCible: { [cible]: { esquive: false, etats: {} } } } });
    return { perte: 40 - r.etat.combattants[cible].pv, combattant: etat.combattants.MONSTRE_A };
  };
});
const docMonstre = (extra) => ({ ID_Partie: "P1", Camp: "Ennemi", Statut: "Vivant", Palier: "Normal", Archetype: "DPS CAC", Prenom_Personnage: "Gob",
  PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100, Def_Physique: 0, Def_Magique: 0, Esquive: 0, Parade: 0, Critique: 0, ...extra });

titre("5. LES DÉGÂTS : BASE × (1 + (NIVEAU/LEADER + ALÉA) / 100), PAR LE VRAI MOTEUR");
await section(async () => {
  const r = await p.evaluate(([d0, d1, d2, d3]) => {
    const pct = window.moteurPur.bonusMonstreDe({ estMonstre: true, palier: "Normal" });
    const chef = window.moteurPur.leaderActuel().degats;
    const sans = window.__depuisLaBase(d0), avec = window.__depuisLaBase(d1), neg = window.__depuisLaBase(d2), lead = window.__depuisLaBase(d3);
    const j = (m) => window.__jouer(m, "MONSTRE_A", "H1", 20);
    return { pct, chef, fiche: avec && avec.aleaDegats, sans: j(sans), avec: j(avec), neg: j(neg), lead: j(lead) };
  }, [docMonstre({ Alea_Degats_Pct: 0 }), docMonstre({ Alea_Degats_Pct: 12 }), docMonstre({ Alea_Degats_Pct: -30 }), docMonstre({ Alea_Degats_Pct: 12, Leader: true })]);
  const attendu = (alea, leader) => Math.round(20 * (1 + (r.pct + (leader ? r.chef : 0) + alea) / 100));
  verifier("le document (Alea_Degats_Pct 12) arrive sur la fiche du jeu (aleaDegats) puis dans le combattant",
           r.fiche === 12 && r.avec.combattant.aleaDegats === 12, JSON.stringify([r.fiche, r.avec.combattant.aleaDegats]));
  verifier(`sans aléa : 20 × (1 + ${r.pct}/100) = ${attendu(0)}`, r.sans.perte === attendu(0), String(r.sans.perte));
  verifier(`aléa +12 : 20 × (1 + (${r.pct} + 12)/100) = ${attendu(12)}`, r.avec.perte === attendu(12) && r.avec.perte === 24, String(r.avec.perte));
  verifier(`aléa −30 : 20 × (1 + (${r.pct} − 30)/100) = ${attendu(-30)}`, r.neg.perte === attendu(-30) && r.neg.perte === 16, String(r.neg.perte));
  verifier(`leader + aléa +12 : 20 × (1 + (${r.pct} + ${r.chef} + 12)/100) = ${attendu(12, true)}`, r.lead.perte === attendu(12, true) && r.lead.perte === 27, String(r.lead.perte));
  // L'aperçu de la carte d'une créature (combat.js, ligneEffetsCarte) : ce que le moteur fera tomber.
  const apercu = await p.evaluate(() => [12, -30].map(alea => { const boite = document.createElement("div");
    boite.innerHTML = window.ligneEffetsCarte({ Nom: "Griffes", Fatigue: 30, Initiative: 40, Composants: { actions: [] }, Effets_Compiles: [
      { nom: "Attaque légère", desc: "20 dégats physique", isMod: false }] },
      { idPersonnage: "MONSTRE_A", estMonstre: true, Palier: "Normal", aleaDegats: alea });
    return [...boite.querySelectorAll(".encart-chiffre")].map(x => x.textContent).join(" "); }).join(" / "));
  verifier("l'aperçu de sa carte le dit aussi : 20 → 24 (+12) / 20 → 16 (−30)", apercu === "24 / 16", apercu);
});

titre("6. LA RÉSISTANCE TIRÉE PROTÈGE VRAIMENT AU COMBAT");
await section(async () => {
  const r = await p.evaluate((d) => {
    window.appliquerReglagesMonstres({ Alea_Res_Physique_Min: 10, Alea_Res_Physique_Max: 10 });
    const fiche = window.tirerAleaMonstre({ ...d });
    const m = window.__depuisLaBase(fiche);
    const coup = window.__jouer(m, "H1", "MONSTRE_A", 50);
    return { def: fiche.Def_Physique, defCombat: coup.combattant.def.physique, perte: coup.perte };
  }, docMonstre({ Def_Physique: 10 }));
  verifier("10 % + 10 = 20 % au combat : un coup de 50 en fait 40", r.def === 20 && r.defCombat === 20 && r.perte === 40, JSON.stringify(r));
});

titre("7. AVEC 0 / 0, RIEN NE CHANGE ; AVEC UNE PLAGE, LES TIRAGES Y RESTENT");
await section(async () => {
  const r0 = await p.evaluate(() => { window.appliquerReglagesMonstres(null);
    const d = { Def_Physique: 33, Def_Magique: 0 }; const avant = JSON.stringify(d);
    window.tirerAleaMonstre(d);
    return { avant, apres: JSON.stringify({ Def_Physique: d.Def_Physique, Def_Magique: d.Def_Magique }), alea: [d.Alea_Degats_Pct, d.Alea_Res_Magique_Pct, d.Alea_Res_Physique_Pct] }; });
  verifier("0 / 0 : défenses intactes, aléas à 0", r0.avant === r0.apres && r0.alea.every(v => v === 0), JSON.stringify(r0));
  const r = await p.evaluate(() => {
    window.appliquerReglagesMonstres({ Alea_Degats_Min: -15, Alea_Degats_Max: 20, Alea_Res_Magique_Min: -5, Alea_Res_Magique_Max: 5, Alea_Res_Physique_Min: 3, Alea_Res_Physique_Max: 8 });
    const t = Array.from({ length: 2000 }, () => window.tirerAleaMonstre({ Def_Physique: 30, Def_Magique: 30 }));
    const bouts = [() => 0, () => 0.999999].map(f => window.tirerAleaMonstre({ Def_Physique: 30, Def_Magique: 30 }, f));
    const de = (k) => t.map(x => x[k]);
    return { deg: de("Alea_Degats_Pct"), mag: de("Alea_Res_Magique_Pct"), phy: de("Alea_Res_Physique_Pct"),
             coherent: t.every(x => x.Def_Physique === 30 + x.Alea_Res_Physique_Pct && x.Def_Magique === 30 + x.Alea_Res_Magique_Pct), bouts };
  });
  const dans = (v, a, z) => v.every(x => Number.isInteger(x) && x >= a && x <= z);
  const atteint = (v, a, z) => v.includes(a) && v.includes(z) && new Set(v).size === z - a + 1;
  verifier("2000 tirages : dégâts entiers dans [−15, 20], chaque valeur sortie, bornes comprises", dans(r.deg, -15, 20) && atteint(r.deg, -15, 20), `${Math.min(...r.deg)}…${Math.max(...r.deg)}`);
  verifier("…résistance magique dans [−5, 5], physique dans [3, 8]", dans(r.mag, -5, 5) && atteint(r.mag, -5, 5) && dans(r.phy, 3, 8) && atteint(r.phy, 3, 8));
  verifier("…et chaque défense = la sienne + son tirage", r.coherent);
  verifier("un tirage à 0 donne le mini, à 0,999999 le maxi", r.bouts[0].Alea_Degats_Pct === -15 && r.bouts[1].Alea_Degats_Pct === 20
           && r.bouts[0].Alea_Res_Physique_Pct === 3 && r.bouts[1].Alea_Res_Physique_Pct === 8, JSON.stringify(r.bouts.map(x => x.Alea_Degats_Pct)));
  const f = await creer(30);
  verifier("30 créatures créées : chacune dans les plages, pas toutes pareilles", f.every(d => d.Alea_Degats_Pct >= -15 && d.Alea_Degats_Pct <= 20
           && d.Def_Physique === 10 + d.Alea_Res_Physique_Pct && d.Def_Magique === 20 + d.Alea_Res_Magique_Pct) && new Set(f.map(d => d.Alea_Degats_Pct)).size > 3);
  await poser(null);
  verifier("pas d'erreur dans la page", !erreurs.length, erreurs.slice(0, 3).join(" | "));
});

await b.close(); serveur.close();
console.log("\n" + (echecs ? `${echecs} CONTRÔLE(S) EN ÉCHEC` : "TOUS LES CONTRÔLES PASSENT"));
process.exit(echecs ? 1 : 0);
