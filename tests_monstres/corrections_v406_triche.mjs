// v406 (B) — LA TRICHE DES MONSTRES EN TROIS LIGNES INDÉPENDANTES. Nico : « Dans
// Paramètres > Monstres, j'aimerais qu'on rechange le tableau de saisie de triche de
// monstre par niveau. Je veux que Dégâts en pourcentage, Points de vie en valeur fixe
// et Soins en valeur fixe soient indépendants les uns des autres et modifiables par
// mes soins. » (La mise en place du livre : celle de corrections_v402.)
//
// Lancer : IVALIS_RACINE=$(pwd) node tests_monstres/corrections_v406_triche.mjs
//          (V406_CAPTURES=dossier : les captures)
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
  export const onSnapshot = () => () => {}; export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
  export const runTransaction = async (_db, f) => f({ get: async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => d || {} }; },
      update: (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d, tx: true }); docs()[r.chemin] = Object.assign({}, docs()[r.chemin] || {}, d); } });
  export const increment = (k) => k; export const deleteField = () => null;
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const serverTimestamp = () => Date.now();
  export class FieldPath {} export const Timestamp = { now: () => Date.now() };
`;
const CAPTURES = process.env.V406_CAPTURES || "";
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
// La table (le banc n'a pas Internet) : du bois dessiné sur place, 1672 × 941.
const TABLE = await (async () => { const pg = await b.newPage(); const u = await pg.evaluate(() => { const c = document.createElement("canvas"); c.width = 1672; c.height = 941;
  const x = c.getContext("2d"); x.fillStyle = "#130c06"; x.fillRect(0, 0, 1672, 941); x.fillStyle = "#7a4a26"; x.fillRect(170, 55, 1470, 835); return c.toDataURL("image/png"); });
  await pg.close(); return Buffer.from(u.split(",")[1], "base64"); })();
// Les cartes régionales (le banc n'a pas Internet) : dessinées sur place ; le
// désert d'Etheria (5) et l'île aux marchés (7) en paysage, les autres en portrait.
const dessinerCarte = async (w, h, teinte, texte) => { const pg = await b.newPage(); const u = await pg.evaluate(([w, h, teinte, texte]) => { const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d"); x.fillStyle = teinte; x.fillRect(0, 0, w, h); x.strokeStyle = "#3a2210"; x.lineWidth = 12; x.strokeRect(20, 20, w - 40, h - 40);
  x.fillStyle = "#3a2210"; x.font = "bold 90px serif"; x.fillText(texte, 80, h / 2); return c.toDataURL("image/png"); }, [w, h, teinte, texte]);
  await pg.close(); return Buffer.from(u.split(",")[1], "base64"); };
const CARTE_PORTRAIT = await dessinerCarte(1000, 1400, "#c9b48a", "PORTRAIT");
const CARTE_PAYSAGE = await dessinerCarte(1800, 1100, "#b9c48a", "PAYSAGE");
const imagesDemandees = [];
const p = await b.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
// Les IA (Gemini), simulées : le Narrateur lite, les annonces, le titre d'un chapitre.
const appelsIA = [];
let iaEnPanne = false, refusPlume = false, panneCle1 = false;
await p.route('**', r => { const u = r.request().url();
  if (u.startsWith(base)) return r.continue();
  if (/BG_tjiigl/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: TABLE });
  if (/res\.cloudinary\.com\/.*IMG_(1894|1892|1900|1893|1897|1903|1979|2189|1984|1977|1981|2229|2230|2231|2238|2239|2240|2241|2242|2243|2244|2248)_/.test(u)) { imagesDemandees.push(u); return r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: /IMG_1893|IMG_1903|IMG_2231/.test(u) ? CARTE_PAYSAGE : CARTE_PORTRAIT }); }
  return r.abort(); });
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**/generativelanguage.googleapis.com/**', r => {
  const corps = JSON.parse(r.request().postData() || "{}");
  const sys = ((corps.systemInstruction || {}).parts || [{}])[0].text || "", txt = (((corps.contents || [])[0] || {}).parts || [{}])[0].text || "";
  const cle = new URL(r.request().url()).searchParams.get("key");
  appelsIA.push({ url: r.request().url(), sys, txt, cle, config: corps.generationConfig || {} });
  if (panneCle1 && cle === "cle-banc") return r.fulfill({ status: 402, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: '{"error":{"message":"Your prepayment credits are depleted"}}' });
  if (refusPlume && /gemini-3\.8-flash/.test(r.request().url())) return r.fulfill({ status: 404, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: '{"error":{"message":"inconnu"}}' });
  if (iaEnPanne) return r.fulfill({ status: 500, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: '{"error":{"message":"panne"}}' });
  let rep = "Je vois Thorin lever sa chope bien haut ; il trinque, avec un sourire qui ne présage rien de bon, « à la santé de ce vieux grincheux de Varos ! »";
  if (/donnes leur titre aux chapitres/.test(sys)) rep = "La tournée du nain";
  else if (/annonce du jeu/.test(sys)) rep = "Le jour se lève sur la route, et je compte nos pas.";
  r.fulfill({ status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'},
    body: JSON.stringify({ candidates: [{ content: { parts: [{ text: rep }] } }], usageMetadata: { totalTokenCount: 120 } }) });
});
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && /Grimoire/.test(m.text())) console.log('CONSOLE', m.text()); });
await p.goto(base + '/index.html'); await p.waitForTimeout(1200);
const titre = (t) => console.log("\n" + t);
const section = async (f) => { try { await f(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 180)); } };
const etat = () => p.evaluate(() => window.grimoireEtat());
const page = () => p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex());
const attendreQue = async (f, ms = 6000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await p.waitForTimeout(100); } return false; };
const cliquer = (sel) => p.evaluate((sel) => document.querySelector(sel).click(), sel);
const centre = (sel) => p.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, sel);
const dans = (x, y, sel) => p.evaluate(([x, y, sel]) => { const el = document.elementFromPoint(x, y); return !!(el && el.closest(sel)); }, [x, y, sel]);
const dessus = (x, y) => p.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? (el.id || "") + "|" + (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) : "rien"; }, [x, y]);
const angleDe = (t) => { const m = /matrix\(([-\d.e]+), ([-\d.e]+)/.exec(t || ""); return m ? Math.atan2(Number(m[2]), Number(m[1])) * 180 / Math.PI : 0; };
const relayer = (msgs, initial) => p.evaluate(([m, i]) => window.livreRecitMessages(m, { initial: i }), [msgs, !!initial]);

// Le joueur J1 joue Thorin ; J2 joue Lyra.
await p.evaluate(() => {
  localStorage.setItem("ID_JOUEUR_COURANT", "J1"); localStorage.setItem("ivalis_GEMINI_API_KEY", "cle-banc"); localStorage.setItem("ivalis_GEMINI_API_KEY_2", "cle-seconde");
  window.__sons = []; window.__clics = 0; window.__appels = []; window.__entrees = []; window.__tours = 0; window.__jets = []; window.__vieux = [];
  window.jouerSonEvenement = (id) => { window.__sons.push([id, Date.now()]); return true; };
  window.jouerSonClic = () => { window.__clics++; };
  window.fermerToutesLesFenetres = () => {};
  window.COMPTE_JOUEUR = { nom: "Ben", email: "ben@ivalis.fr", admin: false };
  window.LISTE_PARTIES_CACHE = [{ id: "P1", nom: "Les Lames d'Héra" }];
  const heros = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", nom: "Ironfoot", race: "Nain", classe: "Guerrier", actif: true, urlCloudinary: "portrait-thorin.png" },
                 { idPersonnage: "H2", idJoueur: "J2", prenom: "Lyra", nom: "Sombreval", actif: true, urlCloudinary: "" }];
  window.PERSOS_JOUEURS_PARTIE = heros; window.PERSOS_PARTIE = heros.slice();
  window.PORTES_GRIMOIRE = {
    verifierCle: async () => true, creerPartie: async () => "P_NEUVE",
    verifierMdpPartie: async (id, m) => ({ ok: m === "sel" }),
    entrerDansPartie: (id) => { window.__entrees.push(id); window.ID_PARTIE_COURANTE = id; document.getElementById("ecran-jeu").style.display = "block"; }
  };
  ["ouvrirChatbox", "ouvrirMenuPersonnages", "ouvrirPopupRencontre", "ouvrirParametres"].forEach(n => { window[n] = () => window.__appels.push(n); });
  window.declencherTourIA = async () => { window.__tours++; };
  window.__vraiJet = window.lancerJetPourHeros;
  window.lancerJetPourHeros = async (id, c) => { window.__jets.push([id, c]); return true; };
  // L'ancien chat : ce qu'il ferait par-dessus le livre.
  window.lancerRecitDynamique = () => window.__vieux.push("parchemin");
  window.majRecitDynamique = () => window.__vieux.push("parchemin+");
  window.annoncerJetsDemandes = () => window.__vieux.push("bandeau");
  const attente = window.afficherEcranAttente;
  window.afficherEcranAttente = (t) => { window.__vieux.push("attente:" + (t || "")); };
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== "ecran-grimoire") e.style.display = "none"; });
  window.afficherGrimoire();
});
await p.waitForTimeout(1300);
await p.evaluate(() => window.ouvrirGrimoire());
await p.waitForTimeout(1200);


// Les boîtes de la carte du livre (dans le désordre) : 1 la forêt, 3 le désert (paysage),
// 7 le mont Pletia, 8 l'île aux marchés (paysage). Le groupe est dans le désert (5).
const boite = (n, x, y) => ({ numero: n, points: [{ x, y }, { x: x + 140, y }, { x: x + 140, y: y + 110 }, { x, y: y + 110 }] });
await p.evaluate((zones) => {
  window.ZONES_LIVRE = zones;
  window.__nuages = 0;
  const vraies = window.jouerTraverseeNuages;
  window.jouerTraverseeNuages = async (o) => { window.__nuages++; return vraies ? vraies(o) : null; };
}, { 8: boite(8, 1000, 520), 1: boite(1, 180, 200), 3: boite(3, 380, 560), 7: boite(7, 1150, 220) });
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
const cap = async (nom) => { if (CAPTURES) await p.screenshot({ path: CAPTURES + "/" + nom + ".png" }); };
await p.evaluate(() => {
  window.verifierMdpParametres = async (m) => m === "rune";
  window.confirmerRetourMenu = () => window.__appels.push("retour-menu");
  window.confirmerQuitterJeu = () => window.__appels.push("quitter-jeu");
});
const visible = (sel) => p.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0 && r.width > 0 && r.height > 0; }, sel);
const vueParam = () => p.evaluate(() => window.GRIMOIRE_PARAMETRES.vue());


const reglages = () => p.evaluate(() => (window.__sets || []).filter(x => x.chemin === "Monstres_Modeles/_REGLAGES").map(x => x.data));
const saisir = async (ligne, niveau, valeur) => {
  const sel = `#corps-triche-niveau input[data-ligne="${ligne}"][data-niveau="${niveau}"]`;
  await p.evaluate(() => { window.__sets = []; });
  await p.fill(sel, String(valeur)); await p.press(sel, "Tab"); await p.waitForTimeout(150);
  return { valeur: await p.evaluate((sel) => document.querySelector(sel).value, sel), ecrit: await reglages() };
};
const lignes = () => p.evaluate(() => Object.fromEntries(["degats", "pv", "soins"].map(l =>
  [l, [...document.querySelectorAll(`#corps-triche-niveau input[data-ligne="${l}"]`)].map(i => i.value).join("/")])));

titre("1. PARAMÈTRES > MONSTRES, DANS LE LIVRE : TROIS LIGNES PAR NIVEAU");
await section(async () => {
  await pose();
  await cliquer("#grimoire-btn-parametres"); await p.waitForTimeout(500); await pose(); await p.waitForTimeout(500);
  await p.fill("#grimoire-mdp-param", "rune"); await cliquer("#grimoire-param-deverrouiller"); await p.waitForTimeout(400);
  await cliquer("#grimoire-param-monstres"); await p.waitForTimeout(700);
  await p.evaluate(() => { window.VARIATION_STATS_MONSTRE_PCT = 0; window.NIVEAU_GROUPE = 3; window.appliquerReglagesMonstres(null); window.dessinerReglagesMonstres(); });
  await p.waitForTimeout(200);
  const r = await p.evaluate(() => {
    const bloc = document.getElementById("corps-triche-niveau");
    const table = bloc.querySelector("table");
    const calque = document.getElementById("grimoire-param-large").getBoundingClientRect();
    const cases = [...bloc.querySelectorAll("input[data-niveau]")];
    const rects = cases.map(i => i.getBoundingClientRect());
    const tr = table.getBoundingClientRect();
    return { dansLeLivre: !!document.querySelector("#grimoire-param-large #corps-triche-niveau"),
      titres: [...table.querySelectorAll("tbody tr")].map(t => t.dataset.ligne + "=" + t.querySelector("td").textContent.trim()).join(" | "),
      entetes: [...table.querySelectorAll("thead th")].map(th => th.textContent.trim()).join(","), n: cases.length,
      visibles: rects.every(x => x.width > 18 && x.height > 10), dedans: rects.every(x => x.left >= calque.left - 1 && x.right <= calque.right + 1)
        && tr.left >= calque.left - 1 && tr.right <= calque.right + 1,
      deborde: table.parentElement.scrollWidth > table.parentElement.clientWidth + 1,
      surligne: [...table.querySelectorAll(".niveau-actuel")].map(c => c.tagName + (c.cellIndex)).join(","),
      aide: (document.querySelector("#reglages-triche-niveau .reglages-monstres-aide") || {}).textContent || "",
      texte: (document.querySelector(".niveau-groupe-reglages") || {}).textContent || "" };
  });
  verifier("la page Monstres s'ouvre dans le livre, avec l'encart de la triche", r.dansLeLivre, JSON.stringify(r));
  verifier("trois lignes : Dégâts en plus (%), Points de vie en plus, Soins en plus",
           r.titres === "degats=Dégâts en plus (%) | pv=Points de vie en plus | soins=Soins en plus", r.titres);
  verifier("dix niveaux chacune (le dernier : 10+), 30 cases", r.entetes === "Niveau,1,2,3,4,5,6,7,8,9,10+" && r.n === 30, `${r.entetes} (${r.n})`);
  verifier("valeurs de départ : dégâts et PV = celles d'avant, soins à 0", JSON.stringify(await lignes()) === JSON.stringify({
    degats: "8/9/10/11/15/17/19/21/23/25", pv: "8/9/10/11/15/17/19/21/23/25", soins: "0/0/0/0/0/0/0/0/0/0" }), JSON.stringify(await lignes()));
  verifier("le niveau du groupe (3) surligné sur toute la colonne (en-tête et trois cases)", r.surligne === "TH3,TD3,TD3,TD3", r.surligne);
  verifier("toutes les cases lisibles, le tableau tient dans la double page sans déborder", r.visibles && r.dedans && !r.deborde, JSON.stringify(r));
  verifier("l'aide de l'encart et le niveau du groupe disent les trois", /% de dégâts, PV et soins/.test(r.aide)
           && /créatures \+10 % de dégâts, \+10 PV, \+0 aux soins/.test(r.texte), `${r.aide} — ${r.texte}`);
  await p.evaluate(() => document.getElementById("reglages-triche-niveau").scrollIntoView({ block: "center" })); await p.waitForTimeout(200);
  await cap("v406_triche_trois_lignes");
});

// Une petite table de combat pour le noyau (le même module que la page).
await p.evaluate(async () => {
  const CE = await import("./combat_etat.js");
  const fiche = (id, camp, extra = {}) => ({ idPersonnage: id, camp, prenom: id, PV_Max: 100, PV_Actuels: 40, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
  window.__jouer = (lanceur, cible, valeur, soin, leader) => {
    const etat = CE.construireEtatCombat({ idPartie: "P1", cerveau: "P1", graine: 5,
      combattants: [fiche("H1", "Allié", { idJoueur: "P1" }), fiche("H2", "Allié", { idJoueur: "P1" }),
                    fiche("M1", "Ennemi", { estMonstre: true, Palier: "Normal", ...(leader ? { leader: true } : {}) }), fiche("M2", "Ennemi", { estMonstre: true, Palier: "Normal" })],
      positions: { H1: { q: 0, r: 0 }, H2: { q: 0, r: 1 }, M1: { q: 1, r: 0 }, M2: { q: 1, r: 1 } },
      partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["M1", "H1"], File_Attente_Combat: [{ idPersonnage: lanceur, idCarte: "C" }] } });
    const r = window.moteurPur.resoudreCarte(etat, { type: "carte", idLanceur: lanceur, idCarte: "C", critique: false,
      attaques: [{ valeurBrute: valeur, typeRes: "Physique", isHeal: !!soin, cibles: [cible] }], alterations: [],
      jets: { attaqueRatee: false, parCible: { [cible]: { esquive: false, etats: {} } } } });
    return r.etat.combattants[cible].pv - 40;
  };
  window.__gab = { Cle: "dps_cac__normal", Archetype: "DPS CAC", Palier: "Normal", PV: 60, Res_Physique: 20, Res_Magique: 10, Fatigue_Max: 100 };
});
const moteur = () => p.evaluate(async () => ({
  coup: window.__jouer("M1", "H1", 20), soin: window.__jouer("M1", "M2", 10, true), soinHeros: window.__jouer("H1", "H2", 10, true),
  coupChef: window.__jouer("M1", "H1", 20, false, true), soinChef: window.__jouer("M1", "M2", 10, true, true),
  pct: window.moteurPur.bonusMonstreDe({ estMonstre: true, palier: "Boss" }), fixe: window.moteurPur.soinsMonstresActuels(),
  pv: await (async () => { const d = await window.creerMonstreDepuisGabarit("MONSTRE_T" + Math.random(), window.__gab, {}); return d ? d.PV_Max : null; })(),
  pvChef: window.champsLeader(window.__gab).PV_Max }));

titre("2. CHAQUE LIGNE S'ENREGISTRE SEULE ET S'APPLIQUE TOUT DE SUITE");
await section(async () => {
  const m0 = await moteur();
  verifier("au départ (niveau 3) : coups +10 %, soins tels quels, PV +10", m0.coup === -22 && m0.soin === 10 && m0.pct === 10 && m0.fixe === 0 && m0.pv === 70 && m0.pvChef === 85, JSON.stringify(m0));

  const d = await saisir("degats", 3, 42);
  const m1 = await moteur(), l1 = await lignes();
  verifier("dégâts du niveau 3 à 42 : seul Triche_Degats_Par_Niveau s'écrit", d.ecrit.length === 1 && JSON.stringify(Object.keys(d.ecrit[0])) === '["Triche_Degats_Par_Niveau"]'
           && JSON.stringify(d.ecrit[0].Triche_Degats_Par_Niveau) === '{"1":8,"2":9,"3":42,"4":11,"5":15,"6":17,"7":19,"8":21,"9":23,"10":25}', JSON.stringify(d.ecrit));
  verifier("…le moteur frappe à +42 % (20 → 28), mais ni les soins ni les PV ne bougent", m1.pct === 42 && m1.coup === -28 && m1.soin === 10 && m1.pv === 70, JSON.stringify(m1));
  verifier("…les deux autres lignes restent telles quelles", l1.pv === "8/9/10/11/15/17/19/21/23/25" && l1.soins === "0/0/0/0/0/0/0/0/0/0", JSON.stringify(l1));

  const v = await saisir("pv", 3, 30);
  const m2 = await moteur(), l2 = await lignes();
  verifier("PV du niveau 3 à 30 : seul Triche_PV_Par_Niveau s'écrit", v.ecrit.length === 1 && JSON.stringify(Object.keys(v.ecrit[0])) === '["Triche_PV_Par_Niveau"]'
           && v.ecrit[0].Triche_PV_Par_Niveau["3"] === 30 && v.ecrit[0].Triche_PV_Par_Niveau["4"] === 11, JSON.stringify(v.ecrit));
  verifier("…une créature créée : 60 + 30 PV ; un leader : 60 + 30 + 15", m2.pv === 90 && m2.pvChef === 105, JSON.stringify(m2));
  verifier("…les dégâts gardent leurs +42 %, les soins rien", m2.coup === -28 && m2.soin === 10 && l2.degats.split("/")[2] === "42", JSON.stringify([m2, l2]));

  const s = await saisir("soins", 3, 5);
  const m3 = await moteur(), l3 = await lignes();
  verifier("soins du niveau 3 à 5 : seul Triche_Soins_Par_Niveau s'écrit", s.ecrit.length === 1 && JSON.stringify(Object.keys(s.ecrit[0])) === '["Triche_Soins_Par_Niveau"]'
           && JSON.stringify(s.ecrit[0].Triche_Soins_Par_Niveau) === '{"1":0,"2":0,"3":5,"4":0,"5":0,"6":0,"7":0,"8":0,"9":0,"10":0}', JSON.stringify(s.ecrit));
  verifier("…un soin de créature : 10 + 5 = 15 ; un soin de héros : 10", m3.fixe === 5 && m3.soin === 15 && m3.soinHeros === 10, JSON.stringify(m3));
  verifier("…le leader garde son % : soin 10 × 1,15 + 5 = 16,5 → 17 ; coup 20 × 1,57 = 31,4 → 31", m3.soinChef === 17 && m3.coupChef === -31, JSON.stringify(m3));
  verifier("…dégâts et PV n'ont pas bougé", m3.coup === -28 && m3.pv === 90 && l3.degats.split("/")[2] === "42" && l3.pv.split("/")[2] === "30", JSON.stringify([m3, l3]));
  const t = await p.evaluate(() => (document.querySelector(".niveau-groupe-reglages") || {}).textContent || "");
  verifier("le niveau du groupe le dit : +42 % de dégâts, +30 PV, +5 aux soins", /\+42 % de dégâts, \+30 PV, \+5 aux soins/.test(t), t);
  // L'aperçu de la carte d'une créature (combat.js, ligneEffetsCarte) : ce que le moteur fera tomber.
  const apercu = await p.evaluate(() => { const boite = document.createElement("div");
    boite.innerHTML = window.ligneEffetsCarte({ Nom: "Griffes", Fatigue: 30, Initiative: 40, Composants: { actions: [] }, Effets_Compiles: [
      { nom: "Attaque légère", desc: "20 dégats physique", isMod: false }, { nom: "Soin", desc: "10 soins", isMod: false }] },
      { idPersonnage: "M1", estMonstre: true, Palier: "Normal" });
    return [...boite.querySelectorAll(".encart-chiffre")].map(x => x.textContent).join(" "); });
  verifier("l'aperçu d'une carte de créature : 20 → 28 (dégâts +42 %), soin 10 → 15 (+5)", apercu === "28 15", apercu);
  // Au niveau 4, les valeurs du niveau 4.
  const n4 = await p.evaluate(() => { window.NIVEAU_GROUPE = 4; window.appliquerReglagesMonstres(window.REGLAGES_MONSTRES_BRUTS);
    const r = { t: window.tricheActuelle(), fixe: window.moteurPur.soinsMonstresActuels(), pct: window.moteurPur.bonusMonstreDe({ estMonstre: true, palier: "Petit" }) };
    window.NIVEAU_GROUPE = 3; window.appliquerReglagesMonstres(window.REGLAGES_MONSTRES_BRUTS); return r; });
  verifier("le groupe passe niveau 4 : 11 %, 11 PV, 0 aux soins", n4.t.degats === 11 && n4.t.pv === 11 && n4.t.soins === 0 && n4.fixe === 0 && n4.pct === 11, JSON.stringify(n4));
  await p.evaluate(() => document.getElementById("reglages-triche-niveau").scrollIntoView({ block: "center" })); await p.waitForTimeout(200);
  await cap("v406_triche_saisies");
});

titre("3. LES BORNES ; UNE CASE VIDÉE GARDE SA VALEUR");
await section(async () => {
  const a = await saisir("degats", 5, 999), b2 = await saisir("degats", 6, -100);
  const c = await saisir("pv", 5, 999), d = await saisir("pv", 6, -5);
  const e = await saisir("soins", 5, 9999), f = await saisir("soins", 6, -3);
  verifier("dégâts bornés de −50 à 300 %", a.valeur === "300" && b2.valeur === "-50", `${a.valeur} / ${b2.valeur}`);
  verifier("PV bornés de 0 à 500", c.valeur === "500" && d.valeur === "0", `${c.valeur} / ${d.valeur}`);
  verifier("soins bornés de 0 à 500", e.valeur === "500" && f.valeur === "0", `${e.valeur} / ${f.valeur}`);
  const g = await saisir("pv", 3, "");
  verifier("une case vidée garde sa valeur (PV du niveau 3 : 30)", g.valeur === "30", g.valeur);
});

titre("4. LA REPRISE DES VALEURS D'AVANT");
await section(async () => {
  const r = await p.evaluate(() => {
    const lire = () => ({ d: window.REGLAGES_MONSTRES.tricheDegats.join("/"), pv: window.REGLAGES_MONSTRES.trichePV.join("/"), s: window.REGLAGES_MONSTRES.tricheSoins.join("/") });
    const res = {};
    window.appliquerReglagesMonstres({ Triche_Par_Niveau: { "1": 3, "2": 4, "3": 5, "4": 6, "5": 7, "6": 8, "7": 9, "8": 10, "9": 11, "10": 30 } }); res.v402 = lire();
    window.appliquerReglagesMonstres({ Triche_Niveau: { Base_1_4: 3, Par_Niveau_1_4: 2, Base_5_10: 0, Par_Niveau_5_10: 3 } }); res.formules = lire();
    window.appliquerReglagesMonstres({ Triche_Par_Niveau: { "1": 3, "2": 4, "3": 5, "4": 6, "5": 7, "6": 8, "7": 9, "8": 10, "9": 11, "10": 30 },
                                       Triche_PV_Par_Niveau: { "1": 50 }, Triche_Soins_Par_Niveau: { "2": 7 } }); res.melange = lire();
    window.appliquerReglagesMonstres(null); res.rien = lire();
    return res;
  });
  verifier("la valeur unique de la v402 (Triche_Par_Niveau) donne les dégâts ET les PV ; soins à 0", r.v402.d === "3/4/5/6/7/8/9/10/11/30" && r.v402.pv === r.v402.d && r.v402.s === "0/0/0/0/0/0/0/0/0/0", JSON.stringify(r.v402));
  verifier("les anciennes formules (Triche_Niveau) aussi", r.formules.d === "5/7/9/11/15/18/21/24/27/30" && r.formules.pv === r.formules.d && r.formules.s === "0/0/0/0/0/0/0/0/0/0", JSON.stringify(r.formules));
  verifier("une ligne saisie l'emporte, case par case, sur l'ancienne valeur", r.melange.d === "3/4/5/6/7/8/9/10/11/30" && r.melange.pv === "50/4/5/6/7/8/9/10/11/30" && r.melange.s === "0/7/0/0/0/0/0/0/0/0", JSON.stringify(r.melange));
  verifier("rien en base : 8 … 25, 8 … 25, et des 0", r.rien.d === "8/9/10/11/15/17/19/21/23/25" && r.rien.pv === r.rien.d && r.rien.s === "0/0/0/0/0/0/0/0/0/0", JSON.stringify(r.rien));
});

titre("5. LES VERSIONS");
await section(async () => {
  const html = lire("index.html");
  const v = (re) => (html.match(re) || []).map(m => Number(m.replace(/\D+/g, " ").trim().split(" ").pop()));
  const mp = v(/moteur_pur\.js\?v=\d+/g), mo = v(/monstres\.js\?v=\d+/g), co = v(/"combat\.js\?v=\d+/g);
  verifier("index.html : moteur_pur.js 88+ (les deux), monstres.js 52+, combat.js 184+", mp.length === 2 && mp.every(n => n >= 88) && mo.every(n => n >= 52) && co.every(n => n >= 184), JSON.stringify({ mp, mo, co }));
  verifier("pas d'erreur dans la page", !erreurs.length, erreurs.slice(0, 3).join(" | "));
});

await b.close(); serveur.close();
console.log("\n" + (echecs ? `${echecs} CONTRÔLE(S) EN ÉCHEC` : "TOUS LES CONTRÔLES PASSENT"));
process.exit(echecs ? 1 : 0);
