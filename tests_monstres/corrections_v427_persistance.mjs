// v427 — LA PERSISTANCE TERRAIN SE RÈGLE : SON COÛT, SES DÉGÂTS AU LANCEMENT ET
// DANS LA ZONE. Nico :
//   « Possibilité d'établir et changer le coût en fatigue de l'effet Persistance :
//     possibilité de mettre une valeur ou un %, fixe ou % au choix, modifiable.
//     Ensuite, pour l'effet, possibilité de modifier librement :
//      - les dégâts lorsque le sort est lancé sur la cible, en % des dégâts fixés
//        sur le sort à la création (exemple : 40 % des dégâts) ;
//      - les dégâts lorsque la cible se déplace sur une case de la zone du sort, ou
//        termine son tour sur la zone, en % des dégâts fixés sur le sort.
//     Affiche ces différents dégâts lors de la création du sort (la Forge), entre
//     parenthèses à côté, avec 2 couleurs différentes. »
//
// Les réglages vivent sur l'effet « Persistance terrain » du grimoire
// (Combat_Effets) : Persistance_Cout_Mode (« fixe » / « pourcent »),
// Persistance_Cout_Pourcent, Persistance_Degats_Lancement, Persistance_Degats_Zone.
// Absents (tous les effets enregistrés avant la v427) : rien ne change.
//
//   1. le noyau : la part au lancement (chaineDeDegats) et la part de la zone
//      (creerZonePure → traverserZones, fin de manche comprise), décimales gardées ;
//   2. le cerveau : une carte de héros et une carte de créature, de bout en bout ;
//   3. la vraie page : l'extraction de la carte (moteur_effets.js) pose les parts ;
//   4. la Forge : coût fixe, coût en %, et les deux dégâts entre parenthèses ;
//   5. l'éditeur des effets (Paramètres > Le monde et ses règles > Effets de combat).
//
// Lancer : node tests_monstres/corrections_v427_persistance.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(72)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const section = async (f) => { try { await f(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.stack || e).slice(0, 300)); } };

const { construireEtatCombat, creerDes } = await import(path.join(RACINE, 'combat_etat.js'));
const MP = await import(path.join(RACINE, 'moteur_pur.js'));
const MV = await import(path.join(RACINE, 'mouvement_pur.js'));
const CC = await import(path.join(RACINE, 'cerveau_combat.js'));

const fiche = (id, extra) => ({ idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, Fatigue_Actuelle: 100,
  Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Etats_Alteres: [],
  statut: "Vivant", ...extra });
const cible = (extra) => ({ id: "C", pv: 60, pvMax: 60, bouclier: 0, etats: [], def: {}, ...extra });

// =========================================================================
console.log("\n1. LE NOYAU : LES DEUX PARTS, ET RIEN QUAND ELLES MANQUENT");
// =========================================================================
await section(async () => {
  const sans = MP.chaineDeDegats(cible(), { valeurBrute: 10, typeRes: "Magique" }, {});
  const a40 = MP.chaineDeDegats(cible(), { valeurBrute: 10, typeRes: "Magique", partLancement: 40 }, {});
  const crit = MP.chaineDeDegats(cible(), { valeurBrute: 10, typeRes: "Magique", partLancement: 40 }, { critique: true });
  verifier("sans réglage : le coup entier (10)", sans.degats === 10 || sans.versPv === 10, JSON.stringify(sans));
  verifier("40 % au lancement : 4 sur 10", a40.versPv === 4 || a40.degats === 4, JSON.stringify(a40));
  verifier("le critique double, puis la part (10 × 2 × 40 % = 8)", crit.versPv === 8 || crit.degats === 8, JSON.stringify(crit));
  // L'arrondi vient à la toute fin : 7 × 40 % = 2,8, moitié d'armure → 1,4 → 1.
  // (Arrondi trop tôt : 3, puis 1,5 → 2.)
  const dec = MP.chaineDeDegats(cible({ def: { magique: 50 }, Def_Magique: 50 }),
                                { valeurBrute: 7, typeRes: "Magique", partLancement: 40 }, {});
  const attenduDec = Math.round(7 * 0.4 * (1 - MP.defMagiqueDe(cible({ def: { magique: 50 }, Def_Magique: 50 })) / 100));
  verifier("les décimales traversent la chaîne (2,8 avant l'armure)", (dec.versPv ?? dec.degats) === attenduDec, `${JSON.stringify(dec)} attendu ${attenduDec}`);

  const etat = construireEtatCombat({ idPartie: "P", cerveau: "P_01", graine: 3, combattants: [fiche("L")],
                                      positions: { L: { q: 0, r: 0 } }, partie: { Tour_Combat: 1 } });
  const hexes = [{ q: 1, r: 0 }];
  const zSans = MP.creerZonePure(etat, { attaques: [{ valeurBrute: 10, typeRes: "Magique" }] }, hexes, "L");
  const z60 = MP.creerZonePure(etat, { attaques: [{ valeurBrute: 10, typeRes: "Magique", partZone: 60 }] }, hexes, "L");
  const z15 = MP.creerZonePure(etat, { attaques: [{ valeurBrute: 7, typeRes: "Magique", partZone: 15 }] }, hexes, "L");
  const z0 = MP.creerZonePure(etat, { attaques: [{ valeurBrute: 10, typeRes: "Magique", partZone: 0 }] }, hexes, "L");
  verifier("sans réglage : la zone garde les dégâts du sort (10)", zSans && zSans.degats.valeurBrute === 10, JSON.stringify(zSans && zSans.degats));
  verifier("60 % dans la zone : 6", z60 && z60.degats.valeurBrute === 6, JSON.stringify(z60 && z60.degats));
  verifier("la part de la zone garde ses décimales (7 × 15 % = 1,05)", z15 && Math.abs(z15.degats.valeurBrute - 1.05) < 1e-9, JSON.stringify(z15 && z15.degats));
  verifier("0 % et aucun état : pas de nappe fantôme", z0 === null, JSON.stringify(z0));
});

// =========================================================================
console.log("\n2. LE CERVEAU, DE BOUT EN BOUT : LANCEMENT, PAS DANS LA ZONE, FIN DE MANCHE");
// =========================================================================
const mondeCombat = () => construireEtatCombat({
  idPartie: "GAME_V427", cerveau: "P_01", graine: 427,
  combattants: [
    fiche("H1", { idJoueur: "P_01", camp: "Allié", prenom: "Cybile" }),
    fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Goule" }),
    fiche("M2", { estMonstre: true, camp: "Ennemi", nom: "Spectre" })
  ],
  positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 1, r: 2 } },
  partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1", "M2"],
            File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C_H1" }, { idPersonnage: "M1", idCarte: "C_M1" },
                                  { idPersonnage: "M2", idCarte: "C_M2" }] }
});
// La carte telle que moteur_effets.js l'envoie au cerveau (regime_cerveau.js, demanderCarte).
const carteHeros = (parts) => ({
  id: "INT_V427", type: "carte", acteur: "H1", poste: "P_01", idCarte: "C_H1", coutFatigue: 20,
  attaques: [{ nom: "Attaque Magique", typeRes: "Magique", valeurBrute: 10, isRanged: false, rangeMax: 1,
               isHeal: false, isShield: false, cibles: ["M1"], ...parts }],
  alterations: [], persistanceTerrain: true, zoneHexes: [{ q: 1, r: 0 }, { q: 1, r: 1 }]
});
const zoneDe = (etat) => Object.values(etat.zones || {})[0];

await section(async () => {
  // Sans réglage : le comportement d'avant la v427.
  const avant = CC.appliquerIntention(mondeCombat(), carteHeros({}), null);
  verifier("sans réglage : la cible prend les 10 du sort au lancement", avant.etat.combattants.M1.pv === 50, `${avant.etat.combattants.M1.pv} PV`);
  verifier("sans réglage : la nappe garde 10", zoneDe(avant.etat) && zoneDe(avant.etat).degats.valeurBrute === 10, JSON.stringify(zoneDe(avant.etat)));

  // 40 % au lancement, 60 % dans la zone.
  const pas = CC.appliquerIntention(mondeCombat(), carteHeros({ partLancement: 40, partZone: 60 }), null);
  const etat = pas.etat;
  verifier("40 % au lancement : la cible ne perd que 4 PV", etat.combattants.M1.pv === 56, `${etat.combattants.M1.pv} PV`);
  const zone = zoneDe(etat);
  verifier("la nappe est posée avec 60 % des dégâts (6)", zone && zone.degats.valeurBrute === 6, JSON.stringify(zone && zone.degats));

  // M2 met le pied dans la zone : 6.
  const marche = MV.resoudreMouvement(etat, { idLanceur: "M2", chemin: [{ q: 1, r: 1 }] }, creerDes(11), null);
  verifier("une case de la zone franchie : 6 PV (60 % de 10)", marche.etat.combattants.M2.pv === 54, `${marche.etat.combattants.M2.pv} PV`);

  // M1 termine la manche dessus : 6 encore.
  const fin = JSON.parse(JSON.stringify(etat));
  MP.zonesDeFinDeManche(fin, creerDes(5));
  verifier("finir la manche sur la zone : 6 PV (60 % de 10)", fin.combattants.M1.pv === 50, `${fin.combattants.M1.pv} PV (56 avant)`);
});

await section(async () => {
  // Une créature : sa carte passe par la même extraction, puis par jouerCreature.
  const etat = mondeCombat();
  etat.file = [{ id: "M1", carte: "C_M1" }];
  const carte = { idCarte: "C_M1",
    infos: { portee: 1, fatigue: 20, estZone: true, estAttaqueSimple: true, zoneHexes: [{ q: -1, r: 0 }],
             zoneEstADistance: false, persistanceTerrain: true },
    attaques: [{ valeurBrute: 10, typeRes: "Physique", partLancement: 40, partZone: 60 }], alterations: [] };
  const pas = CC.jouerCreature(etat, "M1", carte, null);
  // Son tour clôt la manche (elle est seule dans la file) : la cible, debout
  // sur la nappe, la subit aussitôt en fin de manche — 4 puis 6.
  const coups = ((pas && pas.entree.etapes) || []).filter(e => e.type === "degats" && e.cible === "H1");
  verifier("une créature : 40 % au lancement (4 PV)", coups.length > 0 && coups[0].montant === 4 && !coups[0].zone, JSON.stringify(coups));
  verifier("…puis, finissant la manche sur la nappe : 60 % (6 PV)", coups.length === 2 && coups[1].montant === 6 && !!coups[1].zone
           && pas.etat.combattants.H1.pv === 50, `${pas && pas.etat.combattants.H1.pv} PV`);
  const zone = pas && zoneDe(pas.etat);
  verifier("une créature : sa nappe porte 60 % (6)", zone && zone.degats.valeurBrute === 6, JSON.stringify(zone && zone.degats));
});

// =========================================================================
//  LA VRAIE PAGE
// =========================================================================
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) {
    res.writeHead(404); res.end('non trouvé'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;

// Un Firestore en mémoire : setDoc retient ce qu'on lui écrit (l'éditeur des effets).
const FAUX_APP = `export const initializeApp = () => ({ nom: "faux" });`;
const FAUX_FIRESTORE = `
  const BASE = (globalThis.__BASE_FIRESTORE = globalThis.__BASE_FIRESTORE || {});
  export const initializeFirestore = () => ({ faux: true });
  export const getFirestore = () => ({ faux: true });
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async (ref) => ({ exists: () => !!BASE[ref.chemin], data: () => ({ ...(BASE[ref.chemin] || {}) }) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data, opts) => {
    BASE[ref.chemin] = (opts && opts.merge) ? { ...(BASE[ref.chemin] || {}), ...data } : { ...data };
  };
  export const updateDoc = async () => {};
  export const deleteDoc = async (ref) => { delete BASE[ref.chemin]; };
  export const addDoc = async () => ({ id: "neuf" });
  export const deleteField = () => "«champ supprimé»";
  export class FieldPath { constructor(...segments) { this.segments = segments; } }
  export const arrayUnion = (...v) => v;
  export const arrayRemove = (...v) => v;
  export const increment = (n) => n;
  export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({ a });
  export const where = (...a) => ({ a });
  export const orderBy = (...a) => ({ a });
  export const limit = (...a) => ({ a });
  export const writeBatch = () => ({ update: () => {}, set: () => {}, delete: () => {}, commit: async () => {} });
  export const runTransaction = async (_db, fn) => fn({
    get: async () => ({ exists: () => true, data: () => ({}) }), update: () => {}, set: () => {} });
  export const Timestamp = { now: () => Date.now() };
`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({
  contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({
  contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

// Le grimoire de la page : une Attaque Magique (10 par cran, 2 PC), une Zone, et la
// Persistance terrain (3 PC) — d'abord telle qu'en base avant la v427.
const PERSISTANCE_ANCIENNE = { Nom: "Persistance terrain", Cout_PT: "3", Modificateur: "AUCUN",
  Type_Mecanique: "Spatial", Type_Mecanique_2: "Aucun", Valeur: 0, Pourcent_Base: 0, Pourcent_Max: 0, Tours: 3,
  Effet_Base: "Laisse une zone dangereuse pendant 3 tours." };
const REGLEE = { ...PERSISTANCE_ANCIENNE, Persistance_Degats_Lancement: 40, Persistance_Degats_Zone: 60 };
const grimoire = (persistance) => p.evaluate((persistance) => {
  window.EFFETS_BDD_CACHE = {
    EFF_ATT: { Nom: "Attaque Magique", Cout_PT: "2", Modificateur: "INTELLIGENCE", Type_Mecanique: "Action/Global",
               Valeur: 10, Pourcent_Base: 0, Pourcent_Max: 0, Tours: 0, Effet_Base: "Inflige 10 dégâts magiques." },
    EFF_ZONE: { Nom: "Zone", Cout_PT: "1", Modificateur: "AUCUN", Type_Mecanique: "Spatial", Valeur: 0 },
    EFF_PERS: persistance
  };
}, persistance);

// =========================================================================
console.log("\n3. L'EXTRACTION DE LA CARTE (moteur_effets.js) POSE LES PARTS");
// =========================================================================
const extraire = (mods) => p.evaluate(async (mods) => {
  window.jouerSonClic = () => {};
  window.PERSOS_PARTIE = [{ idPersonnage: "M1", prenom: "Goule", camp: "Ennemi", estMonstre: true, PV_Max: 40, PV_Actuels: 40 }];
  window.TOKENS_VTT_DATA = { M1: { q: 0, r: 0 } };
  window.COMPETENCES_CACHE = window.COMPETENCES_CACHE || {};
  window.COMPETENCES_CACHE.C_V427 = { Nom: "Nappe", Arme: "Magie", Fatigue: 25,
    Composants: { actions: [{ idInst: "A1", baseEffetId: "EFF_ATT", count: 1, mods, zoneHexes: [] }] } };
  const carte = await window.demarrerCiblage("C_V427", { extraire: true, idLanceur: "M1" });
  return carte ? { persistance: carte.persistanceTerrain, attaques: carte.attaques.map(a => ({ v: a.valeurBrute, l: a.partLancement, z: a.partZone })) } : null;
}, mods);
await section(async () => {
  await grimoire(PERSISTANCE_ANCIENNE);
  const ancienne = await extraire({ EFF_PERS: 1 });
  verifier("effet d'avant la v427 : aucune part posée (la carte d'avant)",
    ancienne && ancienne.persistance && ancienne.attaques[0].l === undefined && ancienne.attaques[0].z === undefined, JSON.stringify(ancienne));
  await grimoire(REGLEE);
  const reglee = await extraire({ EFF_PERS: 1 });
  verifier("effet réglé (40 % / 60 %) : partLancement 40, partZone 60, dégâts du sort intacts (10)",
    reglee && reglee.attaques[0].l === 40 && reglee.attaques[0].z === 60 && reglee.attaques[0].v === 10, JSON.stringify(reglee));
  const sansPersistance = await extraire({});
  verifier("une carte sans Persistance n'en reçoit aucune",
    sansPersistance && sansPersistance.attaques[0].l === undefined && sansPersistance.attaques[0].z === undefined, JSON.stringify(sansPersistance));
});

// =========================================================================
console.log("\n4. LA FORGE : COÛT FIXE, COÛT EN %, ET LES DEUX DÉGÂTS ENTRE PARENTHÈSES");
// =========================================================================
const forger = (persistance, avecPersistance = true) => p.evaluate(({ persistance, avecPersistance }) => {
  document.getElementById("overlay-jeu-modale").style.display = "block";
  document.getElementById("modale-creation-competence").style.display = "block";
  const bdd = Object.entries({ ...window.EFFETS_BDD_CACHE, EFF_PERS: persistance }).map(([id, e]) => ({ id, ...e, Type_Mecanique_2: e.Type_Mecanique_2 || "Aucun" }));
  window.EFFETS_BDD_CACHE.EFF_PERS = persistance;
  Object.assign(window.forgeState, {
    statsPerso: {}, caracs: { int: 16 }, effetsBDD: bdd, armePrincipale: "Magie",
    actions: [{ idInst: "A1", baseEffet: bdd.find(e => e.id === "EFF_ATT"), count: 2,
                mods: avecPersistance ? { EFF_PERS: 1 } : {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }]
  });
  window.rafraichirForge();
  const carte = document.getElementById("forge-contenu-carte");
  const lancement = carte.querySelector(".forge-persistance-lancement");
  const zone = carte.querySelector(".forge-persistance-zone");
  return {
    pc: document.getElementById("forge-cout-pc").innerText,
    fatigue: document.getElementById("forge-fatigue-val").innerText,
    lancement: lancement ? lancement.innerText : null, zone: zone ? zone.innerText : null,
    couleurLancement: lancement ? getComputedStyle(lancement).color : null,
    couleurZone: zone ? getComputedStyle(zone).color : null,
    aCote: lancement ? lancement.closest(".forge-desc").innerText : null,
    bulle: window.texteBulleEffet("EFF_PERS", "A1")
  };
}, { persistance, avecPersistance });
await section(async () => {
  await grimoire(PERSISTANCE_ANCIENNE);
  const sans = await forger(PERSISTANCE_ANCIENNE, false);
  verifier("Attaque Magique ×2 seule : 4 PC, 20 de fatigue", sans.pc === "4.0 PC" && sans.fatigue === "20", JSON.stringify([sans.pc, sans.fatigue]));
  verifier("sans Persistance sur la carte : pas de parenthèses", sans.lancement === null && sans.zone === null);

  const fixe = await forger(PERSISTANCE_ANCIENNE);
  verifier("coût fixe (effet d'avant la v427) : +3 PC → 7 PC, 35 de fatigue", fixe.pc === "7.0 PC" && fixe.fatigue === "35", JSON.stringify([fixe.pc, fixe.fatigue]));
  verifier("…et la bulle dit « ⚡ 15 de fatigue par cran »", /⚡ 15 de fatigue par cran/.test(fixe.bulle), fixe.bulle.slice(-80));
  verifier("sans réglage : (20 au lancement) (20 dans la zone)", fixe.lancement === "(20 au lancement)" && fixe.zone === "(20 dans la zone)", JSON.stringify([fixe.lancement, fixe.zone]));

  const fixe5 = await forger({ ...PERSISTANCE_ANCIENNE, Cout_PT: "5", Persistance_Cout_Mode: "fixe", Persistance_Cout_Pourcent: 50 });
  verifier("coût fixe changé (5 PC) : 9 PC, 45 de fatigue (le % est ignoré en mode fixe)", fixe5.pc === "9.0 PC" && fixe5.fatigue === "45", JSON.stringify([fixe5.pc, fixe5.fatigue]));

  const pourcent = await forger({ ...REGLEE, Persistance_Cout_Mode: "pourcent", Persistance_Cout_Pourcent: 50 });
  verifier("coût en % (50 % de la carte) : 4 PC + 2 → 6 PC, 30 de fatigue", pourcent.pc === "6.0 PC" && pourcent.fatigue === "30", JSON.stringify([pourcent.pc, pourcent.fatigue]));
  verifier("…et la bulle dit « ⚡ +50 % du coût de la carte »", /⚡ \+50 % du coût de la carte/.test(pourcent.bulle), pourcent.bulle.slice(-80));
  const pourcent25 = await forger({ ...REGLEE, Persistance_Cout_Mode: "pourcent", Persistance_Cout_Pourcent: 25 });
  verifier("coût en % modifié (25 %) : 5 PC, 25 de fatigue", pourcent25.pc === "5.0 PC" && pourcent25.fatigue === "25", JSON.stringify([pourcent25.pc, pourcent25.fatigue]));

  verifier("40 % au lancement : (8 au lancement) à côté des 20 dégâts", pourcent.lancement === "(8 au lancement)" && /20/.test(pourcent.aCote), JSON.stringify([pourcent.lancement, pourcent.aCote]));
  verifier("60 % dans la zone : (12 dans la zone)", pourcent.zone === "(12 dans la zone)", pourcent.zone);
  verifier("deux couleurs différentes", !!pourcent.couleurLancement && !!pourcent.couleurZone && pourcent.couleurLancement !== pourcent.couleurZone
           && pourcent.couleurLancement !== "rgb(0, 0, 0)" && pourcent.couleurZone !== "rgb(0, 0, 0)", `${pourcent.couleurLancement} / ${pourcent.couleurZone}`);
  const decimal = await forger({ ...REGLEE, Persistance_Degats_Lancement: 33, Persistance_Degats_Zone: 12.5 });
  // (v466) Nico : « lorsqu'on met une persistance, afficher les dégâts réels arrondis à l'entier le plus proche ».
  verifier("(v466) les dégâts réels, arrondis à l'entier le plus proche (20 × 33 % = 6,6 → 7 ; 12,5 % = 2,5 → 3)",
           decimal.lancement === "(7 au lancement)" && decimal.zone === "(3 dans la zone)", JSON.stringify([decimal.lancement, decimal.zone]));
});

// =========================================================================
console.log("\n4 bis. (v466) LA 2E CASE DE ZONE NE COMPTE PAS LA PERSISTANCE ; LA SURPUISSANCE SUR SES DEUX DÉGÂTS");
// =========================================================================
// Nico : « pour la création de la 2e zone, nous avons un pourcentage qui s'applique au coût du sort : n'applique pas ce
// pourcentage de coût supplémentaire sur l'effet persistance » ; « avec une persistance et une surpuissance, applique la
// surpuissance aux 2 valeurs de dégâts et affiche-les en dessous de la surpuissance ».
await section(async () => {
  const c = await p.evaluate(() => {
    const att = { id: "EFF_ATT", Nom: "Attaque Magique", Cout_PT: "2", Valeur: 10 };
    const zone = { id: "EFF_ZONE2", Nom: "Zone", Cout_PT: "1", Zone_Pct_2: "50" };
    const pers = { id: "EFF_PERS", Nom: "Persistance terrain", Cout_PT: "3" };
    const act = (mods) => ({ idInst: "A9", baseEffet: att, count: 5, mods, zoneHexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }], baseDuree: 0, modsDuree: {} });
    const bdd = [att, zone, pers];
    return { zone: window.coutDUneActionForge(act({ EFF_ZONE2: 2 }), bdd, {}, 5).cout, zonePers: window.coutDUneActionForge(act({ EFF_ZONE2: 2, EFF_PERS: 1 }), bdd, {}, 5).cout };
  });
  verifier("(v466) la 2e case de zone (50 % du sort) : sur l'attaque seulement, pas sur la persistance (10 + 5 + 3 = 18, plus 19,5)", c.zone === 15 && c.zonePers === 18, JSON.stringify(c));
  const s = await p.evaluate((REGLEE) => {
    const bdd = Object.entries({ ...window.EFFETS_BDD_CACHE, EFF_PERS: REGLEE }).map(([id, e]) => ({ id, ...e, Type_Mecanique_2: e.Type_Mecanique_2 || "Aucun" }));
    window.EFFETS_BDD_CACHE.EFF_PERS = REGLEE;
    Object.assign(window.forgeState, { statsPerso: {}, caracs: { int: 16 }, effetsBDD: bdd, armePrincipale: "Magie",
      actions: [{ idInst: "A1", baseEffet: bdd.find(e => e.id === "EFF_ATT"), count: 8, mods: { EFF_PERS: 1 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }] });
    window.rafraichirForge();
    const carte = document.getElementById("forge-contenu-carte"), sous = carte.querySelector(".forge-persistance-surpuissante");
    const desc = carte.querySelector(".forge-desc");
    return { fatigue: document.getElementById("forge-fatigue-val").innerText, bandeau: document.getElementById("forge-surpuissance").textContent,
             valeur: (carte.querySelector(".forge-valeur-surpuissante") || {}).innerText || "", sous: sous ? sous.innerText : "",
             apres: !!sous && !!(carte.querySelector(".forge-valeur-surpuissante").compareDocumentPosition(sous) & Node.DOCUMENT_POSITION_FOLLOWING),
             couleurs: sous ? [...sous.querySelectorAll(".forge-persistance-lancement, .forge-persistance-zone")].map(x => getComputedStyle(x).color) : [],
             parentheses: [...desc.querySelectorAll(":scope > .forge-persistance-lancement, :scope > .forge-persistance-zone")].map(x => x.innerText) };
  }, REGLEE);
  verifier("(v466) 95 de fatigue (16 + 3 PC) : la 2e surpuissance, ×1,35 (100 avant)", s.fatigue === "95" && /×1,35/.test(s.bandeau), JSON.stringify([s.fatigue, s.bandeau]));
  // (v469) Nico : « s'il y a une surpuissance avec persistance, n'affiche pas les valeurs avant surpuissance de lancement
  // et de zone, ni le total de dégâts autre que persistance : une ligne avec les dégâts de création de la technique et la
  // surpuissance avec le multiplicateur, puis sur une même ligne les dégâts au lancement et dans la zone (avec surpuissance) ».
  verifier("(v469) plus les valeurs d'avant la surpuissance (pas de « (32 au lancement) (48 dans la zone) »)", s.parentheses.length === 0, JSON.stringify(s.parentheses));
  verifier("(v469) une ligne : les dégâts de création et la surpuissance (« 80 de dégâts à la création · surpuissance ×1,35 »), plus le total « → 108 »",
           s.valeur === "80 de dégâts à la création · surpuissance ×1,35" && !/108/.test(s.valeur), JSON.stringify(s.valeur));
  verifier("(v469) puis, sur une même ligne, ses deux dégâts surpuissants : « 43 au lancement · 65 dans la zone » (arrondis)", s.sous === "43 au lancement · 65 dans la zone" && s.apres, JSON.stringify(s.sous));
  verifier("(v466) …dans les deux couleurs de la persistance", s.couleurs.length === 2 && s.couleurs[0] !== s.couleurs[1], JSON.stringify(s.couleurs));
});

// =========================================================================
console.log("\n5. L'ÉDITEUR DES EFFETS : LES RÉGLAGES S'ÉCRIVENT DANS Combat_Effets");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async (ancienne) => {
    window.jouerSonClic = () => {};
    document.getElementById("tbody-effets").innerHTML = "";
    window.ajouterLigneEffetHTML("EFF_PERS", ancienne);
    window.ajouterLigneEffetHTML("EFF_ATT", { Nom: "Attaque Magique", Cout_PT: "2" });
    const out = {
      sousLigne: !!document.getElementById("ligne-persistance-EFF_PERS"),
      sousLigneAttaque: !!document.getElementById("ligne-persistance-EFF_ATT"),
      modeDefaut: document.getElementById("pers-mode-EFF_PERS").value,
      lancementDefaut: document.getElementById("pers-lancement-EFF_PERS").value,
      placeholder: document.getElementById("pers-lancement-EFF_PERS").placeholder
    };
    // Sauver sans rien toucher : l'ancien comportement s'écrit tel quel.
    await window.sauvegarderEffetLigne("EFF_PERS");
    out.parDefaut = { ...globalThis.__BASE_FIRESTORE["Combat_Effets/EFF_PERS"] };
    out.regles = window.reglagesPersistance(out.parDefaut);
    // Nico règle : 30 % du coût de la carte, 40 % au lancement, 60 % dans la zone.
    document.getElementById("pers-mode-EFF_PERS").value = "pourcent";
    document.getElementById("pers-cout-EFF_PERS").value = "30";
    document.getElementById("pers-lancement-EFF_PERS").value = "40";
    document.getElementById("pers-zone-EFF_PERS").value = "60";
    await window.sauvegarderEffetLigne("EFF_PERS");
    out.ecrit = { ...globalThis.__BASE_FIRESTORE["Combat_Effets/EFF_PERS"] };
    await window.sauvegarderEffetLigne("EFF_ATT");
    out.attaque = { ...globalThis.__BASE_FIRESTORE["Combat_Effets/EFF_ATT"] };
    // Rouvert : la ligne relit ce qui a été écrit.
    document.getElementById("tbody-effets").innerHTML = "";
    window.ajouterLigneEffetHTML("EFF_PERS", out.ecrit);
    out.relu = ["mode", "cout", "lancement", "zone"].map(k => document.getElementById(`pers-${k}-EFF_PERS`).value);
    return out;
  }, PERSISTANCE_ANCIENNE);
  verifier("la Persistance terrain a sa ligne de réglages, l'Attaque non", r.sousLigne && !r.sousLigneAttaque);
  verifier("ouverte sur un effet d'avant la v427 : coût fixe, champs vides (100 %)", r.modeDefaut === "fixe" && r.lancementDefaut === "" && r.placeholder === "100", JSON.stringify(r));
  verifier("sauvée telle quelle : fixe, 100 % / 100 %", r.parDefaut.Persistance_Cout_Mode === "fixe" && r.parDefaut.Persistance_Degats_Lancement === 100
           && r.parDefaut.Persistance_Degats_Zone === 100 && r.parDefaut.Cout_PT === "3", JSON.stringify(r.parDefaut));
  verifier("…et le moteur la lit comme avant", !r.regles.coutEnPourcent && r.regles.lancement === 100 && r.regles.zone === 100, JSON.stringify(r.regles));
  verifier("réglée : « pourcent », 30, 40, 60 écrits en nombres", r.ecrit.Persistance_Cout_Mode === "pourcent" && r.ecrit.Persistance_Cout_Pourcent === 30
           && r.ecrit.Persistance_Degats_Lancement === 40 && r.ecrit.Persistance_Degats_Zone === 60, JSON.stringify(r.ecrit));
  verifier("un autre effet n'écrit aucun champ de Persistance", !Object.keys(r.attaque).some(k => k.startsWith("Persistance_")), JSON.stringify(r.attaque));
  verifier("rouverte, la ligne relit ses réglages", JSON.stringify(r.relu) === JSON.stringify(["pourcent", "30", "40", "60"]), JSON.stringify(r.relu));
  verifier("pas d'erreur dans la page", !erreurs.length, erreurs.slice(0, 3).join(" | "));
});

await b.close(); serveur.close();
console.log(echecs ? `\n${echecs} CONTRÔLE(S) EN ÉCHEC` : "\nTOUS LES CONTRÔLES PASSENT");
process.exit(echecs ? 1 : 0);
