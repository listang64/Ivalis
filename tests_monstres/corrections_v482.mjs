// v482 — LE CLAN NOMADE, ÉTAPE 5 : LE TEMPS ET LA JOURNÉE DU CAMP.
// Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md) : « À chaque jour de voyage (seul le voyage fait avancer
// le temps), dans cet ordre : production des tâches ; consommation des provisions (camp, et expédition sur ses
// propres provisions ; distribution par ordre de priorité en cas de manque : Thémès > PNJ > mercenaires >
// personnages achetés > héros principaux) ; usure de la jauge ; solde des mercenaires ; moral (repos, repas, faim,
// solde) et départ d'un PNJ après 8 jours à 0 ; jets (blessure de chasse, peaux, lieu repéré) ; guérison (soigneur,
// repos) ; camp à 0 provision : arrêt s'il est en déplacement et conseil extraordinaire ; un journal de la journée. »
// Lancer : node tests_monstres/corrections_v482.mjs
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
const suite = (valeurs) => { let i = 0; return () => valeurs[i++ % valeurs.length]; };
const calme = () => 0.99;   // ni peau, ni blessure, ni lieu repéré
const campDe = (membres, plus = {}) => ({ Provisions: 28, Caisse: 40, Ressources: { Jauge: 90 }, Membres: membres, ...plus });

// =========================================================================
titre("1. UNE JOURNÉE ORDINAIRE : PRODUCTION, CONSOMMATION, USURE (camp_pur.js)");
// =========================================================================
await section(async () => {
  const camp = campDe({ a: { Tache: "chasser", Moral: 60 }, b: { Tache: "chasser", Moral: 60 }, c: { Tache: "cueillir", Moral: 60 }, d: { Tache: "cuisiner", Moral: 60 }, e: { Moral: 60 }, f: { Moral: 60 } });
  const infos = { a: { caracs: { dex: 12 } }, b: { caracs: { dex: 13 } }, c: { caracs: { int: 10 } }, d: { caracs: { int: 12 } } };
  const gele = JSON.stringify(camp);
  const r = CP.journeeDuCamp({ camp, infos, partis: [], jour: 1, dateJeu: "Jour 12 de l'an 3" }, calme);
  verifier("l'exemple du document : +10 produit, 4 mangé (la cuisine en épargne 2) : 28 → 34 provisions", r.camp.Provisions === 34 && r.evenements.production === 10, String(r.camp.Provisions));
  verifier("la jauge s'use : −1 pour le camp, −1 par chasseur ou cueilleur (90 → 86)", r.camp.Ressources.Jauge === 86);
  verifier("le moral : +3 pour le repos (ceux sans tâche), +2 pour le repas cuisiné (tous)", r.camp.Membres.e.Moral === 65 && r.camp.Membres.a.Moral === 62
    && r.moraux.find(m => m.id === "e").raison === "le repos, un repas cuisiné");
  verifier("…chaque variation inscrite dans le camp (pour les fils invisibles)", r.camp.Membres.e.Moral_Historique.slice(-1)[0].Delta === 5 && r.camp.Membres.e.Moral_Historique.slice(-1)[0].Date_Jeu === "Jour 12 de l'an 3");
  verifier("le journal de la journée est gardé ; le compteur de jours avance", r.camp.Journal.length === 1 && /rapportent 10 provisions/.test(r.camp.Journal[0].Lignes[0]) && r.camp.Jours_Ecoules === 1);
  verifier("les données reçues ne sont pas modifiées", JSON.stringify(camp) === gele);
  const seul = CP.journeeDuCamp({ camp: campDe({ d: { Tache: "cuisiner", Moral: 60 }, e: { Moral: 60 } }), infos: { d: { caracs: { int: 8 } } }, partis: [] }, calme);
  verifier("un seul cuisinier à m −1 : le repas ne donne que +1", seul.camp.Membres.e.Moral === 64 && seul.camp.Membres.d.Moral === 61, `${seul.camp.Membres.e.Moral} / ${seul.camp.Membres.d.Moral}`);
});

titre("2. LE MANQUE : L'ORDRE DE PRIORITÉ ET LA FAIM");
await section(async () => {
  verifier("l'ordre : Thémès, puis les PNJ, les mercenaires, les personnages achetés, les héros principaux",
    CP.rangProvisions("PNJ_THEMES_P1", {}, []) === 0 && CP.rangProvisions("x", { Type: "pnj" }, []) === 1 && CP.rangProvisions("x", { Type: "mercenaire" }, []) === 2
    && CP.rangProvisions("x", { Type: "achete" }, []) === 3 && CP.rangProvisions("H1", { Type: "heros" }, ["H1"]) === 4 && CP.rangProvisions("H9", { Type: "heros" }, ["H1"]) === 1);
  const membres = { PNJ_THEMES_P1: { Narrateur: true, Moral: 60 }, P1: { Type: "pnj", Moral: 60 }, M1: { Type: "mercenaire", Moral: 60 }, A1: { Type: "achete", Moral: 60 }, H1: { Type: "heros", Moral: 60 } };
  const r = CP.journeeDuCamp({ camp: campDe(membres, { Provisions: 3 }), infos: { H1: { heros: true } }, partis: [], principaux: ["H1"] }, calme);
  verifier("3 provisions pour 5 : Thémès, le PNJ et le mercenaire mangent ; l'acheté et le héros principal ont faim", JSON.stringify(r.evenements.affames.sort()) === '["A1","H1"]' && r.camp.Provisions === 0, JSON.stringify(r.evenements.affames));
  verifier("…la faim : −10 de moral (le repos compte quand même : 60 + 3 − 10)", r.camp.Membres.H1.Moral === 53 && r.camp.Membres.A1.Moral === 53 && r.camp.Membres.P1.Moral === 63, `${r.camp.Membres.H1.Moral} ${r.camp.Membres.P1.Moral}`);
  verifier("le camp à zéro : un conseil extraordinaire doit se réunir (une seule fois)", r.evenements.conseilExtraordinaire && r.camp.Conseil_Extraordinaire && /plus de provisions/.test(r.camp.Conseil_Extraordinaire.Raison)
    && !CP.journeeDuCamp({ camp: r.camp, infos: {}, partis: [], principaux: ["H1"] }, calme).evenements.conseilExtraordinaire);
  const dep = CP.journeeDuCamp({ camp: campDe({ P1: { Moral: 60 } }, { Provisions: 0, Deplacement: { En_Cours: true } }), infos: {}, partis: [] }, calme);
  verifier("…et s'il est en déplacement, il s'arrête là où il est", dep.evenements.arret === true);
  const ordre = new Set();
  for (let k = 0; k < 40; k++) ordre.add(CP.distribuer(["a", "b", "c"], 2, () => 1).mangent.join());
  verifier("au hasard à l'intérieur d'un même rang", ordre.size > 1, [...ordre].join(" | "));
});

titre("3. L'EXPÉDITION MANGE SUR SES PROPRES PROVISIONS");
await section(async () => {
  const membres = { PNJ_THEMES_P1: { Narrateur: true, Moral: 60 }, H1: { Type: "heros", Moral: 60 }, H2: { Type: "heros", Moral: 60 }, P1: { Moral: 60 } };
  const r = CP.journeeDuCamp({ camp: campDe(membres, { Provisions: 10 }), infos: {}, partis: ["PNJ_THEMES_P1", "H1", "H2"], expedition: { Provisions: 5, Economie_Provisions: 1 } }, calme);
  verifier("le camp nourrit ceux qui restent (1), l'expédition ses membres (3, moins 1 grâce au suiveur de Dextérité)", r.camp.Provisions === 9 && r.expedition.Provisions === 3, `${r.camp.Provisions} / ${r.expedition.Provisions}`);
  const vide = CP.journeeDuCamp({ camp: campDe(membres, { Provisions: 10 }), infos: {}, partis: ["PNJ_THEMES_P1", "H1", "H2"], expedition: { Provisions: 1 }, principaux: ["H1", "H2"] }, calme);
  verifier("…plus de vivres en route : ceux qui ne mangent pas ont faim (Thémès en dernier)", vide.evenements.expeditionAffamee && vide.evenements.affames.length === 2 && !vide.evenements.affames.includes("PNJ_THEMES_P1") && vide.expedition.Provisions === 0);
});

titre("4. LA SOLDE DES MERCENAIRES, LE MORAL À ZÉRO");
await section(async () => {
  let camp = campDe({ M1: { Type: "mercenaire", Tache: "chasser", Moral: 40 } }, { Caisse: 4 });
  let r = CP.journeeDuCamp({ camp, infos: {}, partis: [] }, calme);
  verifier("3 drachmes de solde par jour", r.camp.Caisse === 1 && r.camp.Membres.M1.Jours_Sans_Solde === 0);
  for (let k = 0; k < 4; k++) r = CP.journeeDuCamp({ camp: r.camp, infos: {}, partis: [] }, calme);
  verifier("sans solde : −5 de moral par jour", r.camp.Membres.M1.Jours_Sans_Solde === 4 && r.camp.Membres.M1.Moral < 40, JSON.stringify(r.camp.Membres.M1).slice(0, 120));
  r = CP.journeeDuCamp({ camp: r.camp, infos: {}, partis: [] }, calme);
  verifier("…après 5 jours sans solde, il part", !r.camp.Membres.M1 && r.departs[0].id === "M1" && /quitte le clan/.test(r.journal.join(" ")));
  camp = campDe({ P1: { Tache: "chasser", Moral: 0, Jours_Moral_Zero: 7 }, H1: { Tache: "chasser", Moral: 0, Jours_Moral_Zero: 7 } }, { Ressources: { Jauge: 0 } });
  r = CP.journeeDuCamp({ camp, infos: { H1: { heros: true } }, partis: [] }, calme);
  verifier("à 0 de moral pendant 8 jours, le PNJ quitte le clan (pas un héros)", !r.camp.Membres.P1 && r.camp.Membres.H1 && r.camp.Membres.H1.Jours_Moral_Zero === 8);
});

titre("5. LES JETS : BLESSURE DE CHASSE, PEAU, LIEU REPÉRÉ, ENTRAÎNEMENT");
await section(async () => {
  verifier("la table des blessures de chasse (d10, jamais de mort)", CP.blessureChasse(3).nom === "Égratignure de ronces" && CP.blessureChasse(6).nom === "Cheville foulée" && CP.blessureChasse(9).interdit === "tout"
    && CP.blessureChasse(10).malus.force === -2 && CP.BLESSURES_CHASSE.every(b => !/mort/i.test(b.effet)));
  // Un seul chasseur (m 0) : la peau (non : 0.9), le d20 (1 : blessé), le d10 (0.85 → 9 : chute dans un ravin).
  let r = CP.journeeDuCamp({ camp: campDe({ C1: { Tache: "chasser", Moral: 60 } }), infos: { C1: { caracs: { dex: 10 } } }, partis: [] }, suite([0.9, 0, 0.85, 0.99]));
  const b = r.camp.Membres.C1.Blessure_Chasse;
  verifier("d20 + m ≤ 2 : blessé (ici une chute dans un ravin : repos forcé 4 jours)", b && b.Nom === "Chute dans un ravin" && b.Jours === 4 && b.Interdit === "tout" && r.evenements.blessures[0].id === "C1", JSON.stringify(b));
  r = CP.journeeDuCamp({ camp: r.camp, infos: { C1: { caracs: { dex: 10 } } }, partis: [] }, calme);
  verifier("…le lendemain il ne chasse pas, il se repose (+3), et guérit deux fois plus vite (4 → 2)", r.evenements.production === 0 && r.camp.Membres.C1.Blessure_Chasse.Jours === 2 && r.moraux[0].raison === "le repos", JSON.stringify(r.camp.Membres.C1));
  r = CP.journeeDuCamp({ camp: r.camp, infos: {}, partis: [] }, calme);
  verifier("…puis il est remis", !r.camp.Membres.C1.Blessure_Chasse && /remis de sa blessure/.test(r.journal.join(" ")));
  const peau = CP.journeeDuCamp({ camp: campDe({ C1: { Tache: "chasser", Moral: 60 } }), infos: { C1: { caracs: { dex: 10 } } }, partis: [] }, suite([0.1, 0.99]));
  verifier("une chance sur 4 de ramener une peau, vendue 3 drachmes", peau.evenements.peaux === 1 && peau.camp.Caisse === 43);
  verifier("l'éclaireur : 20 % (m −1) à 40 % (m +3)", CP.chanceEclaireur(-1) === 0.2 && CP.chanceEclaireur(0) === 0.25 && CP.chanceEclaireur(1) === 0.3 && CP.chanceEclaireur(3) === 0.4 && CP.chanceEclaireur(5) === 0.4);
  const ecl = CP.journeeDuCamp({ camp: campDe({ E1: { Tache: "eclaireur", Moral: 60 } }), infos: { E1: { caracs: { dex: 12 } } }, partis: [], jour: 4 }, suite([0.29]));
  verifier("…un lieu repéré : il en parlera au prochain conseil", ecl.evenements.lieuRepere && ecl.camp.Lieux_Reperes[0].Par === "E1" && /prochain conseil/.test(ecl.journal.join(" ")));
  const ent = CP.journeeDuCamp({ camp: campDe({ T1: { Tache: "entrainer", Recrue: "R1", Moral: 60 }, R1: { Moral: 60 } }), infos: { T1: { niveau: 3, caracs: { cha: 14 } }, R1: { niveau: 1 } }, partis: [] }, calme);
  verifier("l'entraîneur : +(20 + 10 × m) XP à sa recrue (m +2 : 40)", ent.xp.length === 1 && ent.xp[0].id === "R1" && ent.xp[0].xp === 40, JSON.stringify(ent.xp));
});

titre("6. LA GUÉRISON : LE TEMPS, LE REPOS, LE SOIGNEUR");
await section(async () => {
  const membres = { S1: { Tache: "soigner", Moral: 60 }, H1: { Tache: "chasser", Moral: 60 }, H2: { Tache: "cueillir", Moral: 60 }, H3: { Moral: 60 } };
  const infos = { S1: { caracs: { sag: 12 } }, H1: { heros: true, convalescence: 10 }, H2: { heros: true, convalescence: 3 }, H3: { heros: true, convalescence: 5 } };
  const r = CP.journeeDuCamp({ camp: campDe(membres), infos, partis: [] }, calme);
  verifier("le soigneur (m +1) soigne 1 patient, celui qui a le plus de jours de convalescence", /soigne H1\./.test(r.journal.join(" ")), r.journal.join(" "));
  verifier("les jours de guérison des héros : 1 (le temps) + 1 (repos) + 1 (soigné)", r.soinsHeros.H1 === 2 && r.soinsHeros.H2 === 1 && r.soinsHeros.H3 === 2, JSON.stringify(r.soinsHeros));
  const nul = CP.journeeDuCamp({ camp: campDe(membres), infos: { ...infos, S1: { caracs: { sag: 10 } } }, partis: [] }, calme);
  verifier("un soigneur à m 0 ne soigne pas", nul.soinsHeros.H1 === 1 && !/soigne/.test(nul.journal.join(" ")));
});

titre("7. LE COMMERCE : PAYÉ AU PREMIER JOUR, UNE SEULE FOIS");
await section(async () => {
  const camp = campDe({ C1: { Tache: "commercer", Moral: 60, Commerce: { Sens: "achat", Quantite: 5, Prix: 12, Paye: false } }, V1: { Tache: "commercer", Moral: 60, Commerce: { Sens: "vente", Quantite: 4, Prix: 5, Paye: false } } });
  let r = CP.journeeDuCamp({ camp, infos: {}, partis: [] }, calme);
  verifier("l'achat : payé tout de suite (−12), les provisions arriveront au retour de l'expédition", r.camp.Membres.C1.Commerce.Paye && r.camp.Membres.C1.Commerce.A_Livrer === 5 && /arriveront au camp au retour/.test(r.journal.join(" ")));
  verifier("la vente : les provisions partent, les drachmes rentrent (40 − 12 + 5 = 33 ; 28 − 4 − 2 mangées = 22)", r.camp.Caisse === 33 && r.camp.Provisions === 22 && r.camp.Membres.V1.Commerce.Paye, `${r.camp.Caisse} / ${r.camp.Provisions}`);
  r = CP.journeeDuCamp({ camp: r.camp, infos: {}, partis: [] }, calme);
  verifier("le lendemain : rien de plus (une fois, jusqu'au prochain conseil)", r.camp.Caisse === 33 && r.camp.Provisions === 20);
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

titre("8. LE JOUR DE VOYAGE FAIT TOURNER LE CAMP (camp.js)");
await section(async () => {
  const r = await p.evaluate(async () => {
    window.jouerSonClic = () => {};
    localStorage.setItem("ID_JOUEUR_COURANT", "J1");
    window.__docs = window.__docs || {}; window.ID_PARTIE_COURANTE = "P1";
    window.__docs["Date_En_Jeu/actuelle"] = { Jour: "12", Annee: "3" };
    window.PERSOS_JOUEURS_PARTIE = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", niveau: 1, Blessures: [{ uid: "u1", id: "BLE_TENDON_TOUCHE", jours: 10 }] }];
    window.blessuresDuPerso = (h) => h.Blessures || [];
    window.CARACS_PARTIE = { H1: { dex: 10 } };
    window.__docs["Personnages/H1"] = { Prenom: "Thorin", XP: 0 };
    window.__docs["Monde_PNJ/PNJ_T"] = { Nom_PNJ: "Tara", Caracs: { cha: 14 }, Niveau: 3 };
    window.__docs["Monde_PNJ/PNJ_F"] = { Nom_PNJ: "Faim", Niveau: 1 };
    window.__docs["Systeme_Parties/P1"] = { Heros_Principaux: { J1: "H1" }, Camp: { Position: { Region: 7, x: 0.5, y: 0.5 }, Provisions: 1, Caisse: 10, Ressources: { Jauge: 90 },
      Membres: { H1: { Type: "heros", Joueur: "J1", Tache: null, Moral: 60 }, PNJ_T: { Type: "pnj", Tache: "entrainer", Recrue: "H1", Moral: 60 }, PNJ_F: { Type: "pnj", Tache: null, Moral: 60 } } } };
    window.__docs["Systeme_Parties/P1/Ames/H1"] = { id: "H1", type: "heros", nom: "Thorin" };
    window.PARTIE_DATA = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]));
    window.appliquerCampDeLaPartie(window.PARTIE_DATA);
    const res = await window.journeeDuCamp({ cle: "V1:2" });
    const deux = await window.journeeDuCamp({ cle: "V1:2" });
    return { res: res && { journal: res.journal, affames: res.evenements.affames }, deux, partie: window.__docs["Systeme_Parties/P1"], h1: window.__docs["Personnages/H1"],
             souvenirs: Object.entries(window.__docs).filter(([k]) => k.startsWith("Systeme_Parties/P1/Souvenirs/")).map(([, v]) => v), ame: window.__docs["Systeme_Parties/P1/Ames/H1"] };
  });
  const c = r.partie.Camp;
  verifier("la journée est écrite dans la partie (le camp, son journal, la date en jeu), une seule fois par jour de voyage",
    r.res && r.deux === null && c.Derniere_Journee === "V1:2" && c.Jours_Ecoules === 1 && c.Journal[0].Date_Jeu === "Jour 12 de l'an 3", JSON.stringify(c).slice(0, 200));
  verifier("1 provision pour 3 : le héros principal a faim, il ne mange qu'après les PNJ", r.res && r.res.affames.length === 2 && r.res.affames.includes("H1") && c.Provisions === 0, JSON.stringify(r.res && r.res.affames));
  verifier("…la faim dans ses fils invisibles : un souvenir et une humeur triste", r.souvenirs.some(s => s.ame === "H1" && /faim/.test(s.texte)) && r.ame.humeur && r.ame.humeur.emotion === "tristesse");
  verifier("l'entraînement : l'XP de la recrue (Tara, m +2 : +40)", r.h1.XP === 40, JSON.stringify(r.h1));
  verifier("la guérison du héros : sa blessure « jours » décomptée (10 → 8 : le temps et le repos)", r.h1.Blessures && r.h1.Blessures[0].jours === 8, JSON.stringify(r.h1.Blessures));
  verifier("le camp à zéro : le conseil extraordinaire est noté", c.Conseil_Extraordinaire && /plus de provisions/.test(c.Conseil_Extraordinaire.Raison));
  const v = lire("voyage_groupe.js");
  verifier("chaque jour de voyage appelle la journée du camp (voyage_groupe.js, le poste qui a fait passer le jour)", /r\.jourSuivant && typeof window\.journeeDuCamp === "function"/.test(v) && /journeeDuCamp\(\{ cle: `\$\{id\}:\$\{r\.jour\}` \}\)/.test(v));
});

titre("9. LA GESTION MONTRE LES DERNIERS JOURS ; LE BOUTON DEV FAIT PASSER UN JOUR");
await section(async () => {
  const g = lire("grimoire_gestion.js");
  verifier("les derniers jours (le journal), le conseil extraordinaire, le bouton DEV", /Les derniers jours/.test(g) && /Un conseil extraordinaire doit se réunir/.test(g) && /Faire passer un jour au camp \(DEV\)/.test(g) && /journeeDuCamp\(\{ cle: "dev_"/.test(g));
});

titre("10. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 482 ou plus (trace_combat.js, version.json)", v >= 482 && JSON.parse(lire("version.json")).version >= 482, `${v}`);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
