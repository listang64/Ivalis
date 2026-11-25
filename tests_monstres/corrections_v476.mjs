// v476 — LES ARMES DU NOUVEAU TABLEAU DE NICO.
// Nico : « J'ai mis à jour les armes du jeu, tu vas comparer avec ce qu'il y a déjà en jeu et faire les modifs
// nécessaires » ; « on ne peut pas faire d'attaque sans portée avec une arme à distance » ; « toutes les armes à
// distance sont considérées comme à 2 mains » ; « une technique avec une arme à distance a au moins 1 de portée :
// la Forge affiche portée arme + la portée ajoutée sur la compétence, le calcul se fait pour le combat » ;
// « une attaque de zone (arme à distance) est une attaque à distance, rien au corps à corps » ; « lances et
// javelots, à une main, ne vont pas en main gauche et ne laissent en main secondaire qu'un bouclier ou une
// bague » ; « à la création, le choix parmi toutes les armes grises, sauf corps à corps à deux mains et
// boucliers » ; « 2X Effet = 2 fois le même effet (+5 % saignement max ×2 = +10 %, +8 % de résistance magique
// pendant 2 tours ×2 = +16 % pendant 2 tours) ».
// Lancer : node tests_monstres/corrections_v476.mjs
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

// =========================================================================
titre("1. LE CATALOGUE (objets.js, hors page)");
// =========================================================================
const w = {};
new Function('window', lire('objets.js'))(w);
const modele = (n) => w.MODELES_OBJETS.find(m => m.modele === n);
await section(async () => {
  const distance = w.MODELES_OBJETS.filter(m => m.type === "Arme légère Distance");
  verifier("quatre armes à distance : Fronde, Arc court, Gantelet lance-fléchette, Sarbacane",
    distance.map(m => m.modele).sort().join() === "Arc court,Fronde,Gantelet lance-fléchette,Sarbacane", distance.map(m => m.modele).join());
  verifier("…toutes à deux mains", distance.every(m => m.deuxMains === true));
  const fronde = w.objetAuxReglesDuJour({ nom: "Fronde", modele: "Fronde", type: "Arme légère Distance", deuxMains: false, uid: "f" });
  verifier("une fronde trouvée avant (à une main) se lit à deux mains", fronde.deuxMains === true);
  verifier("Gantelet : +1 portée, 3 / 9 / 12 / 15 % de critique",
    ["Commun", "Rare", "Très rare", "Épique"].map(r => modele("Gantelet lance-fléchette").paliers[r].critique).join() === "3,9,12,15");
  verifier("Sarbacane : portée 1 / 2 / 2 / 2, empoisonnement max 5 / 10 / 15 / 20 %",
    ["Commun", "Rare", "Très rare", "Épique"].map(r => modele("Sarbacane").paliers[r].portee + ":" + modele("Sarbacane").paliers[r].etatsPropres[0].chance).join() === "1:5,2:10,2:15,2:20");
  const leger = w.fabriquerObjet(modele("Bouclier léger"), "Commun");
  verifier("Bouclier léger : de l'esquive (3 à 5 %), plus de parade", leger.bonus.esquive >= 3 && leger.bonus.esquive <= 5 && !leger.bonus.parade, JSON.stringify(leger.bonus));
  const lourd = w.fabriquerObjet(modele("Bouclier lourd"), "Rare");
  verifier("Bouclier lourd rare : 26 à 28 de parade, +1 au coût de déplacement", lourd.bonus.parade >= 26 && lourd.bonus.parade <= 28 && lourd.bonus.coutDeplacement === 1);
  verifier("Masse 10 / 20 / 30 / 35 % d'ignorer l'armure",
    ["Commun", "Rare", "Très rare", "Épique"].map(r => modele("Masse").paliers[r].ignoreArmure).join() === "10,20,30,35");
  const hache = w.fabriquerObjet(modele("Hache"), "Commun");
  verifier("Hache commune : « +5% de chance de saignement max » (une augmentation max)", hache.effetTexte === "+5% de chance de saignement max", hache.effetTexte);
  verifier("Dague : plus aucun effet avant l'épique, « +1 Effet A » à l'épique",
    w.tirerEffetsObjet(modele("Dague"), "Très rare").length === 0 && w.tirerEffetsObjet(modele("Dague"), "Épique").length === 1);
  verifier("Arc court rare : déjà un Effet B", w.tirerEffetsObjet(modele("Arc court"), "Rare").length === 1);
  const effB = new Set(w.EFFETS_B.map(e => e.cle));
  verifier("…tiré dans le réservoir B (arme à distance)", w.tirerEffetsObjet(modele("Arc court"), "Rare").every(e => effB.has(e.cle)));
  verifier("Arc court très rare : « + 2 Effet B » = deux effets différents", (() => { const t = w.tirerEffetsObjet(modele("Arc court"), "Très rare"); return t.length === 2 && t[0].cle !== t[1].cle; })());
});

// =========================================================================
titre("2. « 2X EFFET » : LE MÊME EFFET, DEUX FOIS");
// =========================================================================
await section(async () => {
  const saign = w.EFFETS_A.find(e => e.etat === "Saignement");
  verifier("Exemple 1 de Nico : 2 × « +5 % saignement max » = +10 %", w.multiplierEffetObjet(saign, 2).chance === 10 && saign.chance === 5);
  const init = w.multiplierEffetObjet({ buffSoi: { initiative: 10, tours: 2 } }, 2);
  verifier("Effet C : +10 d'initiative pendant 2 tours ×2 = +20 pendant 2 tours", init.buffSoi.initiative === 20 && init.buffSoi.tours === 2);
  const beni = w.multiplierEffetObjet({ beniSoin: { resMag: 8, tours: 2 } }, 2);
  verifier("Exemple 2 : +8 % de résistance magique pendant 2 tours ×2 = +16 % pendant 2 tours", beni.beniSoin.resMag === 16 && beni.beniSoin.tours === 2);
  // (v492) Tableau de Nico : « +1 soin + 1 (Effet C ou Effet B) + 2X Effet C ».
  const effB2 = new Set(w.EFFETS_B.map(e => e.cle)), effC2 = new Set(w.EFFETS_C.map(e => e.cle));
  const lots = []; for (let i = 0; i < 300; i++) lots.push(w.tirerEffetsObjet(modele("Bagues Soins"), "Épique"));
  const deuxFois = (e) => (e.bonus && e.bonus.soin === 2) || (e.beniSoin && (e.beniSoin.resMag === 16 || e.beniSoin.resPhys === 16 || e.beniSoin.degatsPct === 10 || e.beniSoin.initiative === 20) && e.beniSoin.tours === 2);
  verifier("Bague de soin épique : un effet C compté deux fois, et un autre effet (C ou B), différent",
    lots.every(l => l.length === 2 && effC2.has(l[0].cle) && deuxFois(l[0]) && (effC2.has(l[1].cle) || effB2.has(l[1].cle)) && l[1].cle !== l[0].cle)
      && lots.some(l => effB2.has(l[1].cle) && !effC2.has(l[1].cle)) && lots.some(l => effC2.has(l[1].cle)), JSON.stringify(lots.slice(0, 2)));
  verifier("les effets C : pour le personnage soigné pendant 2 tours (résistances +8 %, dégâts +5 %, initiative +10)",
    JSON.stringify(w.EFFETS_C.map(e => e.beniSoin || e.bonus)) === JSON.stringify([{ soin: 1 }, { resMag: 8, tours: 2 }, { resPhys: 8, tours: 2 }, { degatsPct: 5, tours: 2 }, { initiative: 10, tours: 2 }]));
  const hacheEpique = []; for (let i = 0; i < 300; i++) hacheEpique.push(w.fabriquerObjet(modele("Hache à deux mains"), "Épique"));
  const fusion = hacheEpique.find(o => (o.etats || []).length === 1 && o.etats[0].chance === 20);
  verifier("le même état que l'arme (hache : saignement 10 % + « 2X » saignement 5 %) : une seule ligne à 20 %",
    !!fusion && hacheEpique.every(o => (o.etats || []).filter(e => e.etat === "Saignement").length === 1));
});

// =========================================================================
titre("3. LA LANCE COURTE : PARADE (FORCE) OU ESQUIVE (DEXTÉRITÉ)");
// =========================================================================
await section(async () => {
  const lance = w.fabriquerObjet(modele("Lance courte"), "Rare");
  const porteur = (id, force, dex) => { w.CARACS_PARTIE = { [id]: { force, dex } }; return { idPersonnage: id, equipMainDroite: lance }; };
  const fort = w.bonusEquipement(porteur("F", 14, 10)), agile = w.bonusEquipement(porteur("A", 10, 15));
  verifier("Force 14, Dextérité 10 : +6 de parade", fort.parade === 6 && fort.esquive === 0, JSON.stringify({ p: fort.parade, e: fort.esquive }));
  verifier("Force 10, Dextérité 15 : +6 d'esquive", agile.esquive === 6 && agile.parade === 0, JSON.stringify({ p: agile.parade, e: agile.esquive }));
  verifier("elle se porte avec la Force OU la Dextérité", w.texteCaracsObjet(lance) === "Force ou Dextérité", w.texteCaracsObjet(lance));
});

// =========================================================================
titre("4. LA CRÉATION : UNE ARME GRISE AU CHOIX");
// =========================================================================
await section(async () => {
  const choix = w.armesDeDepartAuChoix().map(m => m.modele);
  verifier("15 armes : sans bouclier ni arme de corps à corps à deux mains",
    choix.length === 15 && !choix.some(c => /Bouclier|à deux mains/.test(c)), choix.join(", "));
  const d = w.equipementDeDepart("Sarbacane", "Armure légère");
  verifier("« Sarbacane » : une sarbacane commune, sans prérequis, à deux mains",
    d.arme && d.arme.modele === "Sarbacane" && d.arme.rarete === "Commun" && d.arme.prerequis === 0 && d.arme.deuxMains === true && !d.bouclier);
  const ancien = w.equipementDeDepart("Arme légère + Bouclier", "Armure légère");
  verifier("un ancien choix (« Arme légère + Bouclier ») reste compris", ancien.arme && ancien.bouclier && ancien.bouclier.type === "Bouclier");
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
await p.evaluate(() => {
  window.jouerSonClic = () => {}; window.confirm = () => true;
  window.__docs = window.__docs || {};
  window.ID_PARTIE_COURANTE = "P1";
  window.CARACS_PARTIE = { H1: { force: 14, dex: 14, con: 10, int: 10, sag: 10, cha: 10 } };
});

// =========================================================================
titre("5. LES ÉTATS D'ARME SONT DES AUGMENTATIONS MAX (en combat)");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const gourdin = window.fabriquerObjet(window.MODELES_OBJETS.find(m => m.modele === "Gourdin"), "Rare");   // +10 % étourdissement max
    const heros = { idPersonnage: "H1", prenom: "Thorin", camp: "Allié", race: "Humain", equipMainDroite: gourdin, Etats_Alteres: [] };
    const carte = (alterations) => { const s = { attaques: [{ nom: "Coup", typeRes: "Physique", valeurBrute: 8, cibles: ["M"] }], alterations };
      window.appliquerEquipementALaCarte(s, heros, "Arme lourde CAC"); return s.alterations; };
    return { avec: carte([{ nom: "Étourdi", chance: 20, duree: 2, cibles: ["M"] }]), sans: carte([]), texte: gourdin.effetTexte };
  });
  verifier("une carte qui étourdit à 20 % + un gourdin rare (+10 % max) : 30 %", r.avec.length === 1 && r.avec[0].chance === 30, JSON.stringify(r.avec));
  verifier("une carte qui n'étourdit pas : le gourdin ne lui donne pas l'état", r.sans.length === 0, JSON.stringify(r.sans));
  verifier("le gourdin l'annonce ainsi : « +10% de chance d'étourdissement max »", r.texte === "+10% de chance d'étourdissement max", r.texte);
});

// =========================================================================
titre("6. LES ARMES À DISTANCE : TOUJOURS DE LA PORTÉE, LA ZONE À DISTANCE");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const fab = (m, rar) => window.fabriquerObjet(window.MODELES_OBJETS.find(x => x.modele === m), rar || "Commun");
    const h = (arme) => ({ idPersonnage: "H1", prenom: "Thorin", camp: "Allié", race: "Humain", equipMainDroite: arme || null, equipMainGauche: arme || null, Etats_Alteres: [] });
    const arc = fab("Arc court"), sarba = fab("Sarbacane", "Rare");
    return {
      nu: window.porteeAvecArme(h(), false, 1, "Arme légère Distance"),
      arc: window.porteeAvecArme(h(arc), false, 1, "Arme légère Distance"),
      sarba: window.porteeAvecArme(h(sarba), false, 1, "Arme légère Distance"),
      distanceForge: window.porteeAvecArme(h(arc), true, 3, "Arme légère Distance"),
      melee: window.porteeAvecArme(h(), false, 1, "Arme légère CAC"),
      sansLanceur: window.porteeAvecArme(null, false, 1, "Arme légère Distance")
    };
  });
  verifier("une technique d'arme à distance, sans arme en main : 1 de portée d'arme quand même (2 cases, à distance)", r.nu.isRanged && r.nu.rangeMax === 2, JSON.stringify(r.nu));
  verifier("…avec un arc court (+1) : 2 cases, à distance", r.arc.isRanged && r.arc.rangeMax === 2, JSON.stringify(r.arc));
  verifier("…avec une sarbacane rare (+2) : 3 cases", r.sarba.isRanged && r.sarba.rangeMax === 3, JSON.stringify(r.sarba));
  verifier("…portée de l'arme + la Distance de la Forge : 3 + 1 = 4", r.distanceForge.rangeMax === 4, JSON.stringify(r.distanceForge));
  verifier("une technique de corps à corps ne change pas (1 case, au contact)", !r.melee.isRanged && r.melee.rangeMax === 1);
  verifier("même sans lanceur connu, la technique d'arme à distance tire de loin", r.sansLanceur.isRanged && r.sansLanceur.rangeMax === 2);
  const z = await p.evaluate(async () => {
    window.EFFETS_BDD_CACHE = { EFF_ATT_L: { Nom: "Attaque légère", Cout_PT: "2", Modificateur: "DEXTÉRITÉ", Type_Mecanique: "Action/Global", Type_Mecanique_2: "Physique",
      Valeur: 5, Pourcent_Base: 0, Pourcent_Max: 0, Tours: 0, Effet_Base: "Inflige 5 dégâts physiques." } };
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Thorin", camp: "Allié", race: "Humain", PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [] }];
    window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 } };
    window.COMPETENCES_CACHE = window.COMPETENCES_CACHE || {};
    const extraire = async (arme) => {
      window.COMPETENCES_CACHE.C_V476 = { Nom: "Volée", Arme: arme, Fatigue: 20,
        Composants: { actions: [{ idInst: "A1", baseEffetId: "EFF_ATT_L", count: 1, mods: {}, zoneHexes: [{ q: 1, r: 0 }, { q: 2, r: 0 }] }] } };
      const c = await window.demarrerCiblage("C_V476", { extraire: true, idLanceur: "H1" });
      return c ? { isZone: c.isZone, centre: c.zoneCenterHex, ranged: (c.attaques[0] || {}).isRanged } : null;
    };
    return { distance: await extraire("Arme légère Distance"), contact: await extraire("Arme légère CAC") };
  });
  verifier("une attaque de zone d'arme à distance se pose à distance (pas collée au lanceur)", z.distance && z.distance.isZone && z.distance.centre === null && z.distance.ranged === true, JSON.stringify(z));
  verifier("…la même zone au corps à corps reste collée au lanceur", z.contact && z.contact.isZone && z.contact.centre !== null, JSON.stringify(z.contact));
});

// =========================================================================
titre("7. LA FORGE : « PORTÉE DE L'ARME + N », LA CATÉGORIE « ARME À DISTANCE »");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const bdd = [
      { id: "EFF_ATT_L", Nom: "Attaque légère", Cout_PT: "2", Modificateur: "DEXTÉRITÉ", Type_Mecanique: "Action/Global", Type_Mecanique_2: "Physique", Valeur: 5, Pourcent_Base: 0, Pourcent_Max: 0, Tours: 0, Effet_Base: "Inflige 5 dégâts physiques." },
      { id: "EFF_DIST", Nom: "Distance", Cout_PT: "2", Modificateur: "AUCUN", Type_Mecanique: "Spatial", Type_Mecanique_2: "Aucun", Valeur: 1, Pourcent_Base: 0, Pourcent_Max: 0, Tours: 0, Effet_Base: "1 hexagone" }];
    const forge = (arme, mods) => {
      Object.assign(window.forgeState, { statsPerso: {}, caracs: { dex: 14 }, effetsBDD: bdd, armePrincipale: arme,
        actions: [{ idInst: "A1", baseEffet: bdd[0], count: 1, mods, zoneHexes: [], baseDuree: 0, modsDuree: {} }] });
      window.rafraichirForge();
      const c = document.getElementById("forge-contenu-carte");
      return { textes: [...c.querySelectorAll(".forge-desc")].map(x => x.textContent.trim()), mention: !!c.querySelector(".forge-portee-arme") };
    };
    return { distance: forge("Arme légère Distance", { EFF_DIST: 2 }), sansDistance: forge("Arme légère Distance", {}),
             contact: forge("Arme polyvalente", { EFF_DIST: 2 }), bouton: (document.getElementById("btn-arme-legere-distance") || {}).textContent };
  });
  verifier("arme à distance + 2 crans de Distance : « Portée de l'arme + 2 hexagone »", r.distance.textes.some(t => /^Portée de l'arme \+ 2 hexagone/.test(t)), JSON.stringify(r.distance.textes));
  verifier("…sans Distance posée : « 🏹 Portée de l'arme » sous l'attaque", r.sansDistance.mention, JSON.stringify(r.sansDistance));
  verifier("une arme polyvalente garde le nombre de cases (1 + 2 = 3)", r.contact.textes.some(t => /^3 hexagone/.test(t)) && !r.contact.mention, JSON.stringify(r.contact.textes));
  verifier("le menu des armes de la Forge : « 🏹 Arme à distance »", (r.bouton || "").trim() === "🏹 Arme à distance", r.bouton);
});

// =========================================================================
titre("8. LANCES ET JAVELOTS : MAIN DROITE, ET RIEN QU'UN BOUCLIER OU UNE BAGUE À CÔTÉ");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => {
    const fab = (m) => window.fabriquerObjet(window.MODELES_OBJETS.find(x => x.modele === m), "Commun");
    const lance = fab("Lance courte"), jav = fab("Javelots"), dague = fab("Dague"), bouclier = fab("Bouclier intermédiaire"), bague = fab("Bagues Soins");
    const avecLance = { equipMainDroite: lance, equipMainGauche: null };
    const res = {
      lance: window.mainsPossibles({}, lance), javelots: window.mainsPossibles({}, jav),
      dagueALance: window.mainsPossibles(avecLance, dague), bouclierALance: window.mainsPossibles(avecLance, bouclier),
      bagueALance: window.mainsPossibles(avecLance, bague), deuxMains: window.armeMainDroiteSeule(fab("Lance à deux mains")),
      perdus: window.objetsEcrasesPar({ equipMainDroite: null, equipMainGauche: dague }, lance, "Droite").map(o => o.uid === dague.uid),
      gardeBouclier: window.objetsEcrasesPar({ equipMainDroite: null, equipMainGauche: bouclier }, lance, "Droite").length
    };
    window.__docs["Personnages/H7"] = { Equip_Main_Gauche: dague };
    window.PERSOS_PARTIE = [{ idPersonnage: "H7", prenom: "Ilia", equipMainDroite: null, equipMainGauche: dague }];
    window.signalerCompetencesBloquees = async () => {}; window.oublierImages = async () => {};
    await window.equiperObjet("H7", lance, "Gauche");
    const d = window.__docs["Personnages/H7"];
    res.equipe = { droite: d.Equip_Main_Droite && d.Equip_Main_Droite.modele, gauche: d.Equip_Main_Gauche || null };
    return res;
  });
  verifier("une lance courte : la main droite seulement", JSON.stringify(r.lance) === '["Droite"]', JSON.stringify(r.lance));
  verifier("des javelots : la main droite seulement", JSON.stringify(r.javelots) === '["Droite"]');
  verifier("à côté d'une lance, une dague ne peut que la remplacer", JSON.stringify(r.dagueALance) === '["Droite"]', JSON.stringify(r.dagueALance));
  verifier("…un bouclier ou une bague, eux, vont en main gauche", r.bouclierALance.includes("Gauche") && r.bagueALance.includes("Gauche"));
  verifier("la lance à deux mains n'est pas concernée", r.deuxMains === false);
  verifier("équiper une lance à côté d'une dague annonce la dague perdue ; un bouclier, lui, reste", r.perdus.join() === "true" && r.gardeBouclier === 0);
  verifier("demandée en main gauche, la lance va en main droite, et la dague quitte la gauche", r.equipe.droite === "Lance courte" && r.equipe.gauche === null, JSON.stringify(r.equipe));
  verifier("la fiche (prendre en main depuis le stockage) suit la même règle",
    /armeMainDroiteSeule/.test(lire("grimoire_fiches.js")) && /la main gauche ne tient qu'un bouclier ou une bague/.test(lire("grimoire_fiches.js")));
});

// =========================================================================
titre("9. L'ESQUIVE DE L'ÉQUIPEMENT, LE FORMULAIRE DE CRÉATION, LES VERSIONS");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const leger = window.fabriquerObjet(window.MODELES_OBJETS.find(x => x.modele === "Bouclier léger"), "Épique");
    const h = { idPersonnage: "H2", prenom: "Lyra", camp: "Allié", race: "Humain", Esquive: 15, equipMainGauche: leger, Etats_Alteres: [] };
    return { esquive: window.esquiveCombattant(h), sans: window.esquiveCombattant({ ...h, equipMainGauche: null }),
             options: [...document.querySelectorAll("#champ-type-arme option")].map(o => o.value), v: window.VERSION_IVALIS };
  });
  verifier("un bouclier léger épique (+8 % d'esquive) : 15 → 23 d'esquive", r.esquive === r.sans + 8, `${r.sans} → ${r.esquive}`);
  verifier("le formulaire de création propose les 15 armes grises permises", JSON.stringify(r.options.filter(o => !/^Armure/.test(o)).sort()) === JSON.stringify(w.armesDeDepartAuChoix().map(m => m.modele).sort()), r.options.join(", "));
  verifier("version 476 ou plus (trace_combat.js, version.json)", r.v >= 476 && JSON.parse(lire("version.json")).version >= 476, `${r.v} / ${JSON.parse(lire("version.json")).version}`);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
