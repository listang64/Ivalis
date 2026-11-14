// v391 — LA CRÉATION FINIT SUR LA FICHE, LES BAGUES DE DÉPART, UN SEUL HÉROS COCHÉ, UN SEUL SOIN.
// Nico : « à la création d'un perso, quand on valide les caracs, que ça aille sur la première page de
// cette fiche personnage » ; « pour le choix des armes, l'option bague de soin ou de dégâts » ;
// « quand on crée un nouveau perso, j'ai deux personnages de cochés : que le dernier soit celui de
// coché » ; « dans la Forge, quand on met un soin, qu'on ne puisse plus mettre un autre effet de soin ».
// (L'Ondari garde son +1 de portée sur les seuls sorts magiques à distance : Nico, « on ne change
// pas cette règle ».) (La mise en place du livre : celle de corrections_v373.)
//
// Lancer : node tests_monstres/corrections_v391.mjs
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
const CAPTURES = process.env.V391_CAPTURES || "";
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
await p.evaluate(() => window.appliquerVoyageDeLaPartie && window.appliquerVoyageDeLaPartie({ Position_Groupe: { Region: 5, x: 0.42, y: 0.55 } }));
await p.waitForTimeout(2500);
const cap = async (nom) => { if (CAPTURES) await p.screenshot({ path: CAPTURES + "/" + nom + ".png" }); };

// =========================================================================
titre("1. LES CARACS VALIDÉES : LA PREMIÈRE PAGE DE LA FICHE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_FICHES.allerAuxAventuriers()); await p.waitForTimeout(2600); await pose();
  await p.evaluate(() => document.querySelector(".page-clan .nouvel-aventurier").click()); await p.waitForTimeout(2800); await pose();
  // La répartition validée, app.js demande la fiche sur l'inventaire : le livre ouvre la première page.
  await p.evaluate(() => window.ouvrirFichePerso("H1", "Thorin", "Ironfoot", "#2a1a0f", "onglet-inventaire"));
  await p.waitForTimeout(3500); await pose();
  const r = await p.evaluate(() => { const f = window.GRIMOIRE_FICHES.pages(); return { creation: window.GRIMOIRE_CREATION.actif(), heros: window.GRIMOIRE_FICHES.herosAffiche(),
    ici: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), fiche: window.GRIMOIRE.indexDe(f["fiche-g"]), inv: window.GRIMOIRE.indexDe(f["inv-g"]) }; });
  verifier("la création finie, le livre s'ouvre sur la première page de la fiche (plus l'inventaire)", !r.creation && r.heros === "H1" && Math.abs(r.ici - r.fiche) <= 1 && Math.abs(r.ici - r.inv) > 1, JSON.stringify(r));
  await cap("v391_fiche");
});

// =========================================================================
titre("2. L'ARME DE DÉPART : UNE BAGUE DE SOIN OU UNE BAGUE DE DÉGÂTS");
// =========================================================================
await section(async () => {
  const o = await p.evaluate(() => [...document.querySelectorAll("#champ-type-arme option")].map(x => [x.value, x.textContent.trim()]));
  verifier("le choix propose la bague de soin et la bague de dégâts (plus « Magie (bague) »)", JSON.stringify(o.filter(x => /Magie/.test(x[0]))) === '[["Magie Soins","Magie : bague de soin"],["Magie DPS","Magie : bague de dégâts"]]', JSON.stringify(o));
  const t = await p.evaluate(() => {
    const tire = (choix) => Array.from({ length: 12 }, () => { const a = window.equipementDeDepart(choix, "Armure légère").arme; return a ? [a.type, !!a.bague, a.carac] : null; });
    return { soin: tire("Magie Soins"), degats: tire("Magie DPS"), ancien: tire("Magie") };
  });
  verifier("« bague de soin » : toujours une bague de Sagesse (la bague de soin)", t.soin.every(x => x && x[0] === "Magie" && x[1] && x[2] === "SAGESSE"), JSON.stringify(t.soin.slice(0, 3)));
  verifier("« bague de dégâts » : toujours une bague d'Intelligence (la bague de dégâts)", t.degats.every(x => x && x[0] === "Magie" && x[1] && x[2] === "INTELLIGENCE"), JSON.stringify(t.degats.slice(0, 3)));
  verifier("« Magie » d'une fiche d'avant : toujours une bague", t.ancien.every(x => x && x[0] === "Magie" && x[1]), JSON.stringify(t.ancien.slice(0, 3)));
});

// =========================================================================
titre("3. UN NOUVEAU HÉROS : LUI SEUL EST COCHÉ");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => {
    window.ID_PARTIE_COURANTE = "P1";
    (window.__docs = window.__docs || {})["Systeme_Parties/P1"] = { Ordre_Initiative: ["H1", "H2"] };
    window.PERSOS_JOUEURS_PARTIE.forEach(h => { h.actif = true; });
    window.PERSOS_JOUEURS_PARTIE.push({ idPersonnage: "H3", idJoueur: "J1", prenom: "Kaya", actif: true });
    window.PERSOS_PARTIE = window.PERSOS_JOUEURS_PARTIE.map(h => ({ ...h }));
    window.__majs = [];
    const res = await window.sauvegarderFichePersonnage({ idPartie: "P1", idJoueur: "J1", idPersonnage: "", prenom: "Neo", nom: "", race: "Humain", genre: "Male", classe: "",
      typeArme: "Magie Soins", typeArmure: "Armure légère", couleur: "#2a1a0f" }, true);
    const actif = (l, id) => { const h = (l || []).find(x => x.idPersonnage === id); return h ? h.actif !== false : null; };
    return { id: res.id, h1: actif(window.PERSOS_JOUEURS_PARTIE, "H1"), h3: actif(window.PERSOS_JOUEURS_PARTIE, "H3"), lyra: actif(window.PERSOS_JOUEURS_PARTIE, "H2"),
      partie: actif(window.PERSOS_PARTIE, "H1"), base: window.__majs.filter(m => m.data && m.data.Actif === false).map(m => m.chemin), neuf: (window.__docs["Personnages/" + res.id] || {}).Actif,
      main: ((window.__docs["Personnages/" + res.id] || {}).Equip_Main_Gauche || {}).carac };
  });
  verifier("les autres héros du joueur passent au repos (en mémoire et dans la base)", r.h1 === false && r.h3 === false && r.partie !== true && r.base.includes("Personnages/H1") && r.base.includes("Personnages/H3"), JSON.stringify(r));
  verifier("… le nouveau reste coché, et le héros d'un autre joueur ne bouge pas", r.neuf !== false && r.lyra === true && !r.base.includes("Personnages/H2"), JSON.stringify(r));
  verifier("… et il naît avec sa bague de soin (main gauche)", r.main === "SAGESSE", String(r.main));
});

// =========================================================================
titre("4. LA FORGE : UN SEUL SOIN PAR TECHNIQUE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => {
    const e = (Nom, Modificateur, t1, extra) => Object.assign({ Nom, Modificateur, Type_Mecanique: t1, Type_Mecanique_2: "", Cout_PT: "1", Valeur: 5, Tours: "0", Max_Stacks: 5, Effet_Base: "5 PV" }, extra || {});
    window.EFFETS_BDD_CACHE = { S1: e("Soin", "SAGESSE", "Action/Global"), S2: e("Soin d'urgence", "SAGESSE", "Action/Global"), A1: e("Attaque légère", "DEXTÉRITÉ", "Action/Global"),
      SM: e("Soin léger", "AUCUN", "Magique"), D: e("Distance", "AUCUN", "Spatial", { Valeur: 1, Effet_Base: "1 hexagone" }) };
    window.CACHE_COMPETENCES_GLOBAL = { H1: {} };
    window.__docs["Personnages/H1"] = { Niveau: 3, xp: 1000, Race: "Ondari" }; window.__docs["Caracteristiques/H1"] = { force: 10, dex: 15, con: 12, int: 13, sag: 14, cha: 8 };
    window.PERSOS_JOUEURS_PARTIE.forEach(h => { if (h.idPersonnage === "H1") h.actif = true; });
  });
  await p.evaluate(() => window.GRIMOIRE_FICHES.ouvrir("H1", "onglet-competences")); await p.waitForTimeout(3000); await pose();
  await p.evaluate(() => document.querySelector("#grimoire-fiches-comp-g .bouton-forger").click()); await p.waitForTimeout(3000); await pose();
  const etat = () => p.evaluate(() => { const ligne = (id) => { const l = document.querySelector(`#forge-menu-caracs [data-bulle-effet="${id}"]`); return l ? !l.classList.contains("desactive") : null; };
    const act = window.forgeState.actions[0], SM = window.forgeState.effetsBDD.find(x => x.id === "SM");
    return { s1: ligne("S1"), s2: ligne("S2"), a1: ligne("A1"), sousSoin: act ? window.outilsForge.etatSousEffet(SM, act) : null }; });
  await p.evaluate(() => { window.forgeState.armePrincipale = "Magie"; window.forgeState.actions = []; window.rafraichirForge(); window.ouvrirMenuAjoutForge(); }); await p.waitForTimeout(400);
  const avant = await etat();
  verifier("sans soin sur la carte : les deux soins se posent", avant.s1 === true && avant.s2 === true, JSON.stringify(avant));
  await p.evaluate(() => { window.ajouterComposantPrincipal("S1"); window.ouvrirMenuAjoutForge(); }); await p.waitForTimeout(400);
  const apres = await etat();
  verifier("un soin posé : l'autre soin se grise dans le codex (le reste ne change pas)", apres.s2 === false && apres.a1 === avant.a1, JSON.stringify([avant, apres]));
  verifier("… et le sous-effet de soin ne s'offre plus sur l'action", apres.sousSoin === "masque", JSON.stringify(apres));
  await cap("v391_forge_soin");
  verifier("LIA suit la même règle (un seul soin par technique)", /O\.estUnSoinDeBase\(eff\.Nom\) && fs\.actions\.some\(a => O\.estUnSoinDeBase\(a\.baseEffet\.Nom\)\)/.test(lire("lia_forge.js")));
  // L'Ondari (Nico : la règle ne change pas) : +1 sur un sort à distance, rien sur une arme.
  const o = await p.evaluate(() => { const act = window.forgeState.actions[0], D = window.forgeState.effetsBDD.find(x => x.id === "D"); return window.outilsForge.formatterTexteEffet(D, 1, act); });
  verifier("(rappel) l'Ondari : un soin à distance porte une case plus loin dans la Forge", o === "3 hexagone", o);
  await p.evaluate(() => document.getElementById("forge-marque-refermer").click()); await p.waitForTimeout(2000);
});

// =========================================================================
titre("5. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire("index.html"), v = (f) => Number((new RegExp('["/]' + f.replace(".", "\\.") + '\\?v=(\\d+)"').exec(html) || [])[1]);
  verifier("index.html charge les nouvelles versions (ou plus récentes)", v("app.js") >= 175 && v("competences.js") >= 76 && v("grimoire_creation.js") >= 12 && v("lia_forge.js") >= 10 && v("objets.js") >= 24);
  verifier("la version du jeu : 391 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lire("trace_combat.js")) || [])[1]) >= 391 && JSON.parse(lire("version.json")).version >= 391);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
