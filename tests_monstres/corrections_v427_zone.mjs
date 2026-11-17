// v427 — LE COÛT DE LA ZONE, PALIER PAR PALIER.
// Nico : « Zone (avec un % pour la première zone, puis des fixes. 1 / 2 / 3 / 4 / 5 et +) ».
// Les paliers sont les cases PAYANTES de la zone (la première case reste offerte,
// la 5e payante du Géomancien aussi) : la 1re payante coûte un % du coût de la
// technique, la 2e, la 3e et la 4e un coût fixe chacune, chaque case à partir de
// la 5e le coût « 5 et + ». Réglé dans l'éditeur des effets de combat, sur la
// ligne de la Zone ; un réglage vide garde le PT de la Zone par case, comme avant.
// (La mise en place du livre et de la Forge : celle de corrections_v392.)
//
// Lancer : node tests_monstres/corrections_v427_zone.mjs
// (v429) Nico a précisé : « 1re zone toujours gratuite, c'est à partir de la 2e > %, 3 etc. > fixe » :
// la 2e case en % (Zone_Pct_2), la 3e et la 4e en fixe, la 5e et les suivantes au fixe « 5 et + ».
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' }); res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({}); export const getApp = () => ({}); export const BANC_IVALIS = true;`;
// Une petite base en mémoire : ce qui s'écrit se relit, et une collection se liste (l'éditeur des effets).
const FAUX_FIRESTORE = `
  const docs = () => (window.__docs = window.__docs || {});
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...c) => ({ chemin: c.join("/") }); export const collection = (_db, ...c) => ({ col: c.join("/") });
  export const getDoc = async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => d || {}, id: r.chemin.split("/").pop() }; };
  export const query = (c) => c; export const where = () => ({}); export const orderBy = () => ({}); export const limit = () => ({});
  export const getDocs = async (q) => {
    const col = (q && q.col) || "";
    const liste = Object.entries(docs()).filter(([k]) => col && k.startsWith(col + "/") && k.split("/").length === col.split("/").length + 1)
      .map(([k, v]) => ({ id: k.split("/").pop(), ref: { chemin: k }, data: () => JSON.parse(JSON.stringify(v)) }));
    return { forEach: (f) => liste.forEach(f), docs: liste, empty: liste.length === 0, size: liste.length };
  };
  export const setDoc = async (r, d, o) => { docs()[r.chemin] = (o && o.merge) ? Object.assign({}, docs()[r.chemin] || {}, d) : d; (window.__sets = window.__sets || []).push({ chemin: r.chemin, data: d }); };
  export const updateDoc = async (r, d) => { docs()[r.chemin] = Object.assign({}, docs()[r.chemin] || {}, d); };
  export const deleteDoc = async (r) => { delete docs()[r.chemin]; };
  export const addDoc = async (c, d) => { const id = "A" + Math.random().toString(36).slice(2, 8); docs()[c.col + "/" + id] = d; return { id }; };
  export const onSnapshot = () => () => {}; export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
  export const runTransaction = async (_db, f) => f({ get: async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => d || {} }; },
      update: (r, d) => { docs()[r.chemin] = Object.assign({}, docs()[r.chemin] || {}, d); } });
  export const increment = (k) => k; export const deleteField = () => null;
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const serverTimestamp = () => Date.now();
  export class FieldPath {} export const Timestamp = { now: () => Date.now() };
`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1200);
const titre = (t) => console.log("\n" + t);
const section = async (f) => { try { await f(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 180)); } };
const attendreQue = async (f, ms = 6000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await p.waitForTimeout(100); } return false; };
const cliquer = (sel) => p.evaluate((sel) => document.querySelector(sel).click(), sel);
const proche = (a, b) => Math.abs(a - b) < 1e-9;

// Le joueur J1 joue Thorin.
await p.evaluate(() => {
  localStorage.setItem("ID_JOUEUR_COURANT", "J1"); localStorage.setItem("ivalis_GEMINI_API_KEY", "cle-banc");
  window.jouerSonEvenement = () => true; window.jouerSonClic = () => {}; window.fermerToutesLesFenetres = () => {};
  window.COMPTE_JOUEUR = { nom: "Ben", email: "ben@ivalis.fr", admin: false };
  window.LISTE_PARTIES_CACHE = [{ id: "P1", nom: "Les Lames d'Héra" }];
  const heros = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", nom: "Ironfoot", race: "Nain", classe: "Guerrier", actif: true, urlCloudinary: "" }];
  window.PERSOS_JOUEURS_PARTIE = heros; window.PERSOS_PARTIE = heros.slice();
  window.PORTES_GRIMOIRE = { verifierCle: async () => true, creerPartie: async () => "P_NEUVE", verifierMdpPartie: async (id, m) => ({ ok: m === "sel" }),
    entrerDansPartie: (id) => { window.ID_PARTIE_COURANTE = id; document.getElementById("ecran-jeu").style.display = "block"; } };
  ["ouvrirChatbox", "ouvrirMenuPersonnages", "ouvrirPopupRencontre", "ouvrirParametres"].forEach(n => { window[n] = () => {}; });
  window.declencherTourIA = async () => {}; window.lancerJetPourHeros = async () => true;
  window.lancerRecitDynamique = () => {}; window.majRecitDynamique = () => {}; window.annoncerJetsDemandes = () => {}; window.afficherEcranAttente = () => {};
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
const pose = () => attendreQue(() => p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getState() === "read" && !window.GRIMOIRE.defileEnCours()), 8000);
await p.waitForTimeout(2500);

// Les effets : une Attaque légère à 1 PT le cran, une Zone à 1,5 PT (le réglage d'avant).
const ZONE_REGLEE = { Zone_Pct_2: "50", Zone_Fixe_3: "2", Zone_Fixe_4: "2,5", Zone_Fixe_5plus: "4" };
await p.evaluate(() => {
  const e = (Nom, Modificateur, t1, extra) => Object.assign({ Nom, Modificateur, Type_Mecanique: t1, Type_Mecanique_2: "", Cout_PT: "1", Valeur: 5, Tours: "0", Max_Stacks: 5, Effet_Base: "5 dégâts physique" }, extra || {});
  window.EFFETS_BDD_CACHE = { A1: e("Attaque légère", "DEXTÉRITÉ", "Action/Global"),
    Z: e("Zone", "AUCUN", "Spatial", { Valeur: 1, Cout_PT: "1,5", Effet_Base: "1 hexagone" }), D: e("Distance", "AUCUN", "Spatial", { Valeur: 1, Effet_Base: "1 hexagone" }) };
  window.CACHE_COMPETENCES_GLOBAL = { H1: {} };
  window.__docs = window.__docs || {}; window.__docs["Personnages/H1"] = { Niveau: 3, xp: 1000 }; window.__docs["Caracteristiques/H1"] = { force: 10, dex: 15, con: 12, int: 13, sag: 14, cha: 8 };
});
await p.evaluate(() => window.GRIMOIRE_FICHES.ouvrir("H1", "onglet-competences")); await p.waitForTimeout(3000); await pose();
await p.evaluate(() => document.querySelector("#grimoire-fiches-comp-g .bouton-forger").click()); await p.waitForTimeout(3000); await pose();

// =========================================================================
titre("1. LE CALCUL (coutCasesZone, app.js)");
// =========================================================================
await section(async () => {
  const r = await p.evaluate((reglee) => {
    const c = (eff, n, tech) => { const z = window.coutCasesZone(eff, n, 1.5); return z.fixe + tech * z.pct / 100; };
    const avant = { Nom: "Zone", Cout_PT: "1,5" };
    const vides = { Nom: "Zone", Cout_PT: "1,5", Zone_Pct_2: "", Zone_Fixe_3: " ", Zone_Fixe_4: null, Zone_Fixe_5plus: "" };
    const z = { Nom: "Zone", Cout_PT: "1,5", ...reglee };
    return {
      defaut: [0, 1, 4, 5, 14].map(n => c(avant, n, 20)), vides: [0, 1, 6].map(n => c(vides, n, 20)),
      regle: [0, 1, 2, 3, 4, 5, 6, 14].map(n => c(z, n, 20)),
      pct: window.coutCasesZone(z, 1, 1.5), sansFixes: [1, 3].map(n => c({ Nom: "Zone", Cout_PT: "1,5", Zone_Pct_2: "25" }, n, 8)),
      zero: c({ Nom: "Zone", Cout_PT: "1,5", Zone_Pct_2: "0", Zone_Fixe_3: "0" }, 2, 20),
      paliers: window.ZONE_PALIERS
    };
  }, ZONE_REGLEE);
  verifier("sans réglage (un effet d'avant) : 1,5 PT par case payante, comme avant", JSON.stringify(r.defaut) === JSON.stringify([0, 1.5, 6, 7.5, 21]), JSON.stringify(r.defaut));
  verifier("des réglages laissés vides : pareil", JSON.stringify(r.vides) === JSON.stringify([0, 1.5, 9]), JSON.stringify(r.vides));
  verifier("1re case offerte ; la 2e : 50 % d'une technique à 20 PC → 10 PC", proche(r.regle[1], 10) && r.pct.pct === 50 && r.pct.fixe === 0, JSON.stringify(r.pct));
  verifier("3e : +2 (fixe) → 12 ; 4e : +2,5 → 14,5", proche(r.regle[2], 12) && proche(r.regle[3], 14.5), JSON.stringify(r.regle));
  verifier("5e et + : +4 par case → 18,5 (5e), 22,5 (6e), 26,5 (7e), 58,5 (15e)", proche(r.regle[4], 18.5) && proche(r.regle[5], 22.5) && proche(r.regle[6], 26.5) && proche(r.regle[7], 58.5), JSON.stringify(r.regle));
  verifier("aucune case payante : rien, même avec un %", r.regle[0] === 0);
  verifier("seul le % réglé : la 2e case en %, les suivantes au PT d'avant", proche(r.sansFixes[0], 2) && proche(r.sansFixes[1], 2 + 1.5 + 1.5), JSON.stringify(r.sansFixes));
  verifier("un 0 écrit vaut 0 (pas le PT d'avant)", r.zero === 0, String(r.zero));
  verifier("les quatre réglages : 2e (%), 3e, 4e, 5e et +", JSON.stringify(r.paliers) === '["Zone_Pct_2","Zone_Fixe_3","Zone_Fixe_4","Zone_Fixe_5plus"]');
});

// =========================================================================
titre("2. LA FORGE : LE COÛT AFFICHÉ");
// =========================================================================
// Une Attaque légère à 4 crans (4 PC) avec une zone de 7 cases (6 payantes).
const SEPT = [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 1 }];
const forger = (zone) => p.evaluate(([zone]) => {
  window.forgeState.armePrincipale = "Sans arme / Arme rp"; window.forgeState.actions = []; window.rafraichirForge();
  window.ajouterComposantPrincipal("A1"); const a = window.forgeState.actions[0]; a.count = 4; a.mods.Z = zone.length; a.zoneHexes = zone.map(h => ({ ...h }));
  window.rafraichirForge();
  const lu = { pc: document.getElementById("forge-cout-pc").innerText, fatigue: document.getElementById("forge-fatigue-val").innerText,
               initiative: document.getElementById("forge-initiative-val").innerText, bilan: window.forgeState.bilan.totalPC };
  window.ouvrirEditeurZone(a.idInst); lu.editeur = document.getElementById("zone-cout-affichage").innerText;
  // Une case de moins dans l'éditeur : le prix suit les cases cochées.
  const derniere = window.forgeState.selectedZoneHexes[window.forgeState.selectedZoneHexes.length - 1];
  window.clicHexagoneZone(derniere.q, derniere.r); lu.editeurMoins = document.getElementById("zone-cout-affichage").innerText;
  window.fermerEditeurZone(false);
  return lu;
}, [zone]);
const regler = (champs) => p.evaluate((champs) => {
  const z = window.EFFETS_BDD_CACHE.Z; window.ZONE_PALIERS.forEach(k => delete z[k]); Object.assign(z, champs);
  window.forgeState.effetsBDD.find(e => e.id === "Z") && Object.assign(window.forgeState.effetsBDD.find(e => e.id === "Z"), z,
    Object.fromEntries(window.ZONE_PALIERS.map(k => [k, z[k]])));
}, champs);
await section(async () => {
  await regler({});
  const d = await forger(SEPT);
  // 4 + 6 × 1,5 = 13 PC → 65 de fatigue ; dans l'éditeur, 9 PC (6 payantes), puis 7,5 (5).
  verifier("par défaut : 4 + 6 × 1,5 = 13 PC, 65 de fatigue (comme avant)", d.pc === "13.0 PC" && d.fatigue === "65" && proche(d.bilan, 13), JSON.stringify(d));
  verifier("… l'éditeur de zone : 9 PC, puis 7,5 PC avec une case de moins", d.editeur === "9 PC" && d.editeurMoins === "7.5 PC", JSON.stringify(d));
  await regler(ZONE_REGLEE);
  const r = await forger(SEPT);
  // 1re offerte ; 2e : 50 % de 4 = 2 ; 3e 2 ; 4e 2,5 ; 5e, 6e, 7e : 4 × 3 → 18,5 ; total 22,5 PC → 112 de fatigue.
  verifier("réglée : 2 (50 % de 4) + 2 + 2,5 + 4 × 3 = 18,5 PC de zone ; 22,5 PC, 112 de fatigue", r.pc === "22.5 PC" && r.fatigue === "112" && proche(r.bilan, 22.5), JSON.stringify(r));
  verifier("… l'éditeur de zone : 18,5 PC, puis 14,5 PC avec une case de moins", r.editeur === "18.5 PC" && r.editeurMoins === "14.5 PC", JSON.stringify(r));
  const un = await forger([{ q: 1, r: 0 }, { q: 2, r: 0 }]);
  verifier("2 cases : la 2e, 50 % de 4 = 2 PC de zone ; 6 PC, 30 de fatigue", un.pc === "6.0 PC" && un.fatigue === "30" && un.editeur === "2 PC" && un.editeurMoins === "Gratuit", JSON.stringify(un));
  // Le % se prend sur le reste de l'action : avec 6 crans, la 2e case vaut 3.
  const r6 = await p.evaluate(() => { const a = window.forgeState.actions[0]; a.count = 6; window.rafraichirForge(); return window.forgeState.bilan.totalPC; });
  verifier("le % suit le coût de la technique (6 crans : 6 + 3 = 9 PC)", proche(r6, 9), String(r6));
});

// =========================================================================
titre("3. LE GÉOMANCIEN : SA 5e CASE PAYANTE RESTE OFFERTE");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const bdd = window.forgeState.effetsBDD; const A1 = bdd.find(e => e.id === "A1");
    const act = { baseEffet: A1, count: 4, mods: { Z: 7 }, zoneHexes: new Array(7).fill(0).map((_, i) => ({ q: i, r: 0 })), baseDuree: 0, modsDuree: {} };
    const geo = { Classe: "Géomancien", XP: 0, Race: "Ankylar" }, autre = { Classe: "Sentinelle", XP: 0, Race: "Ankylar" };
    return { geo: window.coutDUneActionForge(act, bdd, geo, 5).cout, autre: window.coutDUneActionForge(act, bdd, autre, 5).cout };
  });
  // 6 payantes ; lui en paie 5 : 2 + 2 + 2,5 + 4 + 4 = 14,5 (+ 4) ; un autre 22,5.
  verifier("7 cases : lui 18,5 PC (une case « 5 et + » de moins), un autre 22,5", proche(r.geo, 18.5) && proche(r.autre, 22.5), JSON.stringify(r));
});

// =========================================================================
titre("4. LES SORTS DES MONSTRES : LE MÊME COMPTE (coutPCChantier)");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => {
    const src = await (await fetch("/monstres_competences.js")).text();
    const w = Object.create(window);
    const { coutPCChantier } = new Function("window", src.replace(/^import[\s\S]*?from\s+"[^"]+";/gm, "") + "\n;return { coutPCChantier };")(w);
    const bdd = window.forgeState.effetsBDD; const A1 = bdd.find(e => e.id === "A1"), Z = bdd.find(e => e.id === "Z");
    const chantier = (n) => ({ actions: [{ baseEffet: A1, count: 4, baseDuree: 0, zoneHexes: new Array(n).fill(0).map((_, i) => ({ q: i, r: 0 })),
                                           modsEffets: [{ effet: Z, count: n, duree: 0 }] }] });
    const forge = (n) => window.coutDUneActionForge({ baseEffet: A1, count: 4, mods: { Z: n }, zoneHexes: new Array(n).fill(0).map((_, i) => ({ q: i, r: 0 })), baseDuree: 0, modsDuree: {} }, bdd, null, 5).cout;
    return [2, 4, 7, 12].map(n => [coutPCChantier(chantier(n), bdd), forge(n)]);
  });
  verifier("un monstre paie sa zone comme la Forge (2, 4, 7, 12 cases)", r.every(([m, f]) => proche(m, f)), JSON.stringify(r));
  verifier("… réglée : 7 cases = 22,5 PC", proche(r[2][0], 22.5), JSON.stringify(r[2]));
});

// =========================================================================
titre("5. L'ÉDITEUR DES EFFETS DE COMBAT : LES PALIERS DE LA ZONE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => {
    window.__docs["Combat_Effets/Z"] = { Nom: "Zone", Cout_PT: "1,5", Modificateur: "AUCUN", Type_Mecanique: "Spatial" };
    window.__docs["Combat_Effets/A1"] = { Nom: "Attaque légère", Cout_PT: "1", Modificateur: "DEXTÉRITÉ", Type_Mecanique: "Action/Global" };
  });
  await p.evaluate(() => window.chargerTableauEffets()); await p.waitForTimeout(300);
  const l = await p.evaluate(() => ({
    zone: !!document.getElementById("ligne-zone-Z"), autre: !!document.getElementById("ligne-zone-A1"),
    champs: ["zone-pct2-Z", "zone-fixe3-Z", "zone-fixe4-Z", "zone-fixe5-Z"].map(id => { const el = document.getElementById(id); return el ? el.value : null; }),
    texte: (document.getElementById("ligne-zone-Z") || {}).innerText || ""
  }));
  verifier("la ligne de la Zone a ses paliers (et pas les autres effets)", l.zone && !l.autre, JSON.stringify(l));
  verifier("un effet d'avant : les quatre réglages vides", JSON.stringify(l.champs) === '["","","",""]', JSON.stringify(l.champs));
  verifier("écrit en clair : 1re case offerte, 2e en %, 3e, 4e, 5e et +", /1re case offerte/.test(l.texte) && /%/.test(l.texte) && /5e et \+/.test(l.texte), l.texte.replace(/\s+/g, " ").slice(0, 160));
  // On règle et on sauvegarde avec le 💾 de la ligne.
  const s = await p.evaluate(async () => {
    const v = { "zone-pct2-Z": "40", "zone-fixe3-Z": "2", "zone-fixe4-Z": "", "zone-fixe5-Z": "3" };
    Object.entries(v).forEach(([id, x]) => { document.getElementById(id).value = x; });
    await window.sauvegarderEffetLigne("Z");
    const autre = window.__docs["Combat_Effets/A1"]; await window.sauvegarderEffetLigne("A1");
    return { z: window.__docs["Combat_Effets/Z"], a: window.__docs["Combat_Effets/A1"] };
  });
  verifier("sauvegardé dans Combat_Effets : 40 %, 2, (vide), 3",
           s.z.Zone_Pct_2 === "40" && s.z.Zone_Fixe_3 === "2" && s.z.Zone_Fixe_4 === "" && s.z.Zone_Fixe_5plus === "3" && s.z.Cout_PT === "1,5", JSON.stringify(s.z));
  verifier("un autre effet n'en reçoit pas", !("Zone_Pct_2" in s.a), JSON.stringify(s.a));
  // Relu : les réglages reviennent dans les cases ; et le vide de la 4e garde le PT de la Zone.
  await p.evaluate(() => window.chargerTableauEffets()); await p.waitForTimeout(300);
  const relu = await p.evaluate(() => ["zone-pct2-Z", "zone-fixe3-Z", "zone-fixe4-Z", "zone-fixe5-Z"].map(id => document.getElementById(id).value));
  verifier("relu : les réglages reviennent", JSON.stringify(relu) === '["40","2","","3"]', JSON.stringify(relu));
  const c = await p.evaluate(() => { const z = window.__docs["Combat_Effets/Z"]; const x = window.coutCasesZone(z, 5, 1.5); return x.fixe + 10 * x.pct / 100; });
  // 5 payantes (6 cases) : 2e 40 % de 10 = 4 ; 3e 2 ; 4e (vide → 1,5) ; 5e et 6e : 3 + 3 → 13,5.
  verifier("le compte qui en sort : 4 + 2 + 1,5 (vide) + 3 + 3 = 13,5", proche(c, 13.5), String(c));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
