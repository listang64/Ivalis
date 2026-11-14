// v392 — LA ZONE D'UN SOIN COMPREND LE LANCEUR ; L'ENCART DE LA FORGE CENTRÉ ; LE MODE DE CHAQUE APPARITION.
// Nico : « pour un sort de soin, quand on met une zone, que l'on puisse aussi sélectionner
// l'emplacement du personnage lanceur » ; « dans l'aperçu des compétences (l'encart de la Forge),
// mets les chiffres et symboles centrés dans leur encart » ; « dans le choix des apparitions en
// mode arène, que l'on puisse choisir dans chaque apparition quel mode choisir ». (L'arène qui
// mettait en jeu tous les héros : le double coché de la création, réglé en v391.)
// (La mise en place du livre : celle de corrections_v373.)
//
// Lancer : node tests_monstres/corrections_v392.mjs
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
const CAPTURES = process.env.V392_CAPTURES || "";
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

// La Forge, ouverte sur Kaya (H1), avec quelques effets.
await p.evaluate(() => {
  const e = (Nom, Modificateur, t1, extra) => Object.assign({ Nom, Modificateur, Type_Mecanique: t1, Type_Mecanique_2: "", Cout_PT: "1", Valeur: 5, Tours: "0", Max_Stacks: 5, Effet_Base: "5 dégâts physique" }, extra || {});
  window.EFFETS_BDD_CACHE = { A1: e("Attaque légère", "DEXTÉRITÉ", "Action/Global"), S1: e("Soin", "SAGESSE", "Action/Global", { Effet_Base: "Soigne 5 PV" }),
    Z: e("Zone", "AUCUN", "Spatial", { Valeur: 1, Cout_PT: "1,5", Effet_Base: "1 hexagone" }), D: e("Distance", "AUCUN", "Spatial", { Valeur: 1, Effet_Base: "1 hexagone" }),
    P: e("Empoisonnement", "DEXTÉRITÉ", "Physique", { Effet_Base: "30% chance d'empoisonner", Pourcent_Base: 15 }) };
  window.CACHE_COMPETENCES_GLOBAL = { H1: {} };
  window.__docs = window.__docs || {}; window.__docs["Personnages/H1"] = { Niveau: 3, xp: 1000 }; window.__docs["Caracteristiques/H1"] = { force: 10, dex: 15, con: 12, int: 13, sag: 14, cha: 8 };
});
await p.evaluate(() => window.GRIMOIRE_FICHES.ouvrir("H1", "onglet-competences")); await p.waitForTimeout(3000); await pose();
await p.evaluate(() => document.querySelector("#grimoire-fiches-comp-g .bouton-forger").click()); await p.waitForTimeout(3000); await pose();

// =========================================================================
titre("1. LA ZONE D'UN SOIN : LA CASE DU LANCEUR SE COCHE");
// =========================================================================
await section(async () => {
  const zone = (idAction) => p.evaluate((id) => { window.ouvrirEditeurZone(id); const c = document.querySelector('#zone-hex-grid polygon[data-lanceur]');
    return { lanceur: c ? c.getAttribute("data-lanceur") : null, texte: document.getElementById("zone-description-texte").innerText }; }, idAction);
  await p.evaluate(() => { window.forgeState.armePrincipale = "Magie"; window.forgeState.actions = []; window.rafraichirForge(); window.ajouterComposantPrincipal("S1"); window.forgeState.actions[0].mods.Z = 1; window.rafraichirForge(); });
  const idSoin = await p.evaluate(() => window.forgeState.actions[0].idInst);
  const a = await zone(idSoin);
  verifier("un soin au contact : la case du lanceur est cochable (et l'éditeur le dit)", a.lanceur === "soin" && /sa propre case/.test(a.texte), JSON.stringify(a));
  const b = await p.evaluate(() => { window.clicHexagoneZone(0, 0); window.clicHexagoneZone(1, 0); const avant = window.forgeState.selectedZoneHexes.map(h => h.q + "," + h.r);
    window.clicHexagoneZone(1, 0); const apres = window.forgeState.selectedZoneHexes.map(h => h.q + "," + h.r);
    const rouge = document.querySelector('#zone-hex-grid polygon[data-lanceur]').getAttribute("fill");
    window.fermerEditeurZone(true); return { avant, apres, rouge, enregistre: window.forgeState.actions[0].zoneHexes.map(h => h.q + "," + h.r) }; });
  verifier("cochée, elle compte dans la zone et reste cochée quand on retire une voisine", JSON.stringify(b.avant) === '["0,0","1,0"]' && JSON.stringify(b.apres) === '["0,0"]' && /255, 76, 76/.test(b.rouge), JSON.stringify(b));
  verifier("… et la zone du soin est enregistrée avec elle", JSON.stringify(b.enregistre) === '["0,0"]', JSON.stringify(b.enregistre));
  await p.evaluate(() => { window.forgeState.armePrincipale = "Sans arme / Arme rp"; window.forgeState.actions = []; window.rafraichirForge(); window.ajouterComposantPrincipal("A1"); window.forgeState.actions[0].mods.Z = 1; window.rafraichirForge(); });
  const idAtt = await p.evaluate(() => window.forgeState.actions[0].idInst);
  const c = await zone(idAtt);
  const d = await p.evaluate(() => { window.clicHexagoneZone(0, 0); const r = window.forgeState.selectedZoneHexes.length; window.fermerEditeurZone(false); return r; });
  verifier("une attaque au contact : la case du lanceur reste grise et figée", c.lanceur === "fige" && d === 0, JSON.stringify([c, d]));
});

// =========================================================================
titre("2. L'ENCART DE LA FORGE : LES CHIFFRES ET LEURS SYMBOLES CENTRÉS");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.forgeState.armePrincipale = "Arme légère Distance"; window.outilsForge.typesArmesEquipeesPourForge = () => new Set(["Arme légère Distance"]); window.forgeState.actions = []; window.rafraichirForge();
    window.ajouterComposantPrincipal("A1"); const a = window.forgeState.actions[0]; a.count = 3; a.mods.D = 2; a.mods.P = 1; window.ajouterComposantPrincipal("S1"); document.getElementById("forge-nom").value = "Tir précis"; window.rafraichirForge(); });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { const z = document.querySelector("#grimoire-fiches-forge-g .defile-fiche"); z.scrollTop = document.getElementById("forge-livre-apercu").offsetTop - 40; }); await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const carte = document.querySelector("#forge-livre-apercu .apercu-forge"), corps = carte.querySelector(".carte-effets-encart").getBoundingClientRect();
    return [...carte.querySelectorAll(".encart-montant")].map(m => { const s = m.querySelector(".encart-symbole, svg"), c = m.querySelector(".encart-chiffre");
      const rs = s.getBoundingClientRect(), rc = c.getBoundingClientRect(), gauche = Math.min(rs.left, rc.left), droite = Math.max(rs.right, rc.right);
      return { centre: Math.abs((gauche + droite) / 2 - (corps.left + corps.right) / 2), milieu: Math.abs((rs.top + rs.bottom) / 2 - (rc.top + rc.bottom) / 2), haut: rs.height }; });
  });
  verifier("chaque montant (symbole + chiffre) est centré dans l'encart", r.length === 2 && r.every(x => x.centre < 3), JSON.stringify(r));
  verifier("… et le chiffre est calé au milieu de son symbole", r.every(x => x.milieu < Math.max(2, x.haut * 0.12)), JSON.stringify(r));
  await cap("v392_encart");
});

// =========================================================================
titre("3. L'ARÈNE : LE MODE DE CHAQUE APPARITION");
// =========================================================================
await section(async () => {
  await p.evaluate(() => document.getElementById("forge-marque-refermer").click()); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    window.PLATEAU_VTT = window.PLATEAU_VTT || { hexToPixel: () => ({ x: 0, y: 0 }) }; window.ID_PARTIE_COURANTE = window.ID_PARTIE_COURANTE || "P1";
    window.ouvrirGenerationRencontre();
    const blocs = [...document.querySelectorAll(".choix-apparition-rencontre[data-apparition]")].filter(b => b.dataset.apparition !== "aleatoire");
    return blocs.map(b => ({ n: b.dataset.apparition, modes: [...b.querySelectorAll(".mode-apparition")].map(x => x.textContent) }));
  });
  const table = await p.evaluate(() => [1, 2, 3, 4].map(n => window.APPARITIONS[n].cas.map(c => c.nom)));
  verifier("sous chaque apparition, « Au hasard » puis ses modes (ceux de la table)", r.length === 4 && r.every((b, i) => JSON.stringify(b.modes) === JSON.stringify(["Au hasard", ...table[i]])), JSON.stringify(r.map(b => b.modes.length)));
  const c = await p.evaluate(() => { document.querySelector('.choix-apparition-rencontre[data-apparition="2"] .mode-apparition[data-cas="1"]').click();
    const choisis = [...document.querySelectorAll(".mode-apparition.choisi")].map(b => b.textContent);
    return { app: window.APPARITION_RENCONTRE_CHOISIE, mode: window.MODE_RENCONTRE_CHOISI, choisis, actif: document.querySelector('.choix-apparition-rencontre[data-apparition="2"]').classList.contains("actif") }; });
  verifier("toucher « Les éclaireurs qui fuient » choisit l'apparition 2 et ce mode", c.app === 2 && c.mode === 1 && c.actif && JSON.stringify(c.choisis) === '["Les éclaireurs qui fuient"]', JSON.stringify(c));
  const t = await p.evaluate(() => { const noms = new Set(); for (let i = 0; i < 25; i++) { const x = window.tirerApparition(2, 1); noms.add((x.cas && x.cas.nom) || x.nomCas || JSON.stringify(Object.keys(x))); } return [...noms]; });
  verifier("le tirage suit le mode choisi (25 fois de suite)", t.length === 1 && /éclaireurs/i.test(t[0]), JSON.stringify(t));
  const h = await p.evaluate(() => { document.querySelector('.choix-apparition-rencontre[data-apparition="3"]').click();
    return { app: window.APPARITION_RENCONTRE_CHOISIE, mode: window.MODE_RENCONTRE_CHOISI, choisi: (document.querySelector('.choix-apparition-rencontre[data-apparition="3"] .mode-apparition.choisi') || {}).textContent }; });
  verifier("toucher l'apparition elle-même : son mode au hasard", h.app === 3 && h.mode === null && h.choisi === "Au hasard", JSON.stringify(h));
  const v = await p.evaluate(async () => { document.querySelector('.choix-apparition-rencontre[data-apparition="1"] .mode-apparition[data-cas="4"]').click();
    let recu = null; const vrai = window.genererRencontreMonstres; window.genererRencontreMonstres = async (choix, options) => { recu = { choix, cas: options && options.cas }; };
    await window.validerGenerationRencontre(); window.genererRencontreMonstres = vrai; return recu; });
  verifier("« Valider » invoque la rencontre avec ce mode", JSON.stringify(v) === '{"choix":1,"cas":4}', JSON.stringify(v));
  await p.evaluate(() => window.fermerGenerationRencontre());
});

// =========================================================================
titre("4. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire("index.html"), v = (f) => Number((new RegExp('["/]' + f.replace(".", "\\.") + '\\?v=(\\d+)"').exec(html) || [])[1]);
  verifier("index.html charge les nouvelles versions (ou plus récentes)", v("competences.js") >= 77 && v("apparitions.js") >= 4 && v("monstres.js") >= 50 && v("style.css") >= 146 && v("grimoire_fiches.css") >= 10);
  verifier("la version du jeu : 392 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lire("trace_combat.js")) || [])[1]) >= 392 && JSON.parse(lire("version.json")).version >= 392);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
