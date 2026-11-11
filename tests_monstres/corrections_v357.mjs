// v357 — LA REFONTE DES CLASSES : LE SORCIER.
// Nico : « NIVEAU 1 : Ténèbres, +1 portée de base sur tous les sorts. NIVEAU 3 : Charme
// fratricide (30 de fatigue, une fois par combat, INIT 105, portée 5). NIVEAU 5 : Transfert
// (0, une fois par combat, INIT 100, portée infinie même derrière les murs). NIVEAU 9 : les
// sorts à distance ne subissent plus de réduction de portée au corps-à-corps. »
// (Le détail de la classe : sorcier.mjs — sa partie navigateur demande effets_reels.json ;
// le ciblage du plateau, qui n'en a pas besoin, est rejoué ici.)
//
// Lancer : node tests_monstres/corrections_v357.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { COUTS_TECHNIQUES, coutDeTechnique, PORTEE_CHARME } from '../moteur_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lireFichier = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8');
const w = {};
new Function('window', lireFichier('experience.js'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);
const XP = { 1: 0, 2: 700, 3: 1200, 4: 1800, 5: 2500, 8: 5200, 9: 6400 };
const sorcier = (n) => ({ classe: "Sorcier", race: "Humain", xp: XP[n] });

console.log("\n1. LES PALIERS ET LES RÈGLES");
{
    const a = (n) => w.atoutClasse(sorcier(n));
    verifier("niveau 1 : Ténèbres et +1 portée, sans le « pas de malus au contact »",
             JSON.stringify(a(1).effets) === '["EFF_TENEBRES"]' && a(1).porteeSorts === 1 && !a(1).sortsSansMalusContact);
    verifier("niveau 3 : Charme ; niveau 5 : Transfert ; niveau 9 : sans malus au contact",
             JSON.stringify(a(3).techniques) === '["CLASSE_CHARME_FRATRICIDE"]' && !(a(2).techniques || []).length
             && JSON.stringify(a(5).techniques) === '["CLASSE_CHARME_FRATRICIDE","CLASSE_TRANSFERT"]' && !(a(4).techniques || []).includes("CLASSE_TRANSFERT")
             && a(9).sortsSansMalusContact === true && !a(8).sortsSansMalusContact);
    verifier("le Charme coûte 30 dans le moteur, et vise à 5 cases", coutDeTechnique("CLASSE_CHARME_FRATRICIDE") === 30 && PORTEE_CHARME === 5
             && coutDeTechnique("CLASSE_TRANSFERT") === 0 && COUTS_TECHNIQUES.CLASSE_CHARME_FRATRICIDE === 30);
    const c = lireFichier("classes.js");
    verifier("la fiche : Charme au 3 (30 de fatigue, 5 cases), Transfert au 5 (où qu'il soit), sorts à bout portant au 9",
             /niveau: 3, titre: "Technique : Charme fratricide"/.test(c) && /30 de fatigue · un ennemi à 5 cases/.test(c)
             && /niveau: 5, titre: "Technique : Transfert"/.test(c) && /où qu'il soit/.test(c) && /niveau: 9, titre: "Sorts à bout portant"/.test(c));
    verifier("version 357 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lireFichier("trace_combat.js")) || [])[1]) >= 357
             && JSON.parse(lireFichier("version.json")).version >= 357);
}

const RACINE = '/home/user/Ivalis';
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

const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async (ref) => {
    const d = (window.__docs || {})[ref.chemin];
    return { exists: () => !!d, data: () => d || {} };
  };
  export const getDocs = async (ref) => {
    const liste = ((window.__collections || {})[ref.col] || []).map(([id, d]) => ({ id, data: () => d }));
    return { forEach: (f) => liste.forEach(f), docs: liste, empty: liste.length === 0 };
  };
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data, options }); };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data }); };
  export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a});
  export const where = (...a) => ({a}); export const orderBy = (...a) => ({a});
  export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#5a3d7a"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

console.log("\n2. LE CHARME ET LE TRANSFERT SE VISENT SUR LE PLATEAU, COMME UN SORT");
// v233 (Nico : « Charme fratricide, pour cibler, enlève les noms et fais un
// ciblage visuel comme n'importe quel autre sort ; pareil pour le Transfert »).
{
  const viser = (idCarte, essais) => p.evaluate(async ({ idCarte, essais }) => {
    document.getElementById("fenetre-combat").style.display = "block";
    window.jouerSonClic = () => {};
    window.estCombattantMort = (id) => id === "K";
    // Deux murs de la carte : (3,0) devant l'Ogre, (0,-2) devant le Chacal.
    const murs = new Set(["3,0", "0,-2"]);
    window.PLATEAU_VTT = { getCaseState: (q, r) => ({ isBlocked: murs.has(`${q},${r}`) }), hexToPixel: (q, r) => ({ x: 300 + q * 60, y: 300 + r * 60 }),
                           pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {} };
    window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
    const f = (id, extra) => ({ idPersonnage: id, camp: "Allié", PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 100, fatigueActuelle: 100,
                                Etats_Alteres: [], statut: "Vivant", ...extra });
    window.PERSOS_PARTIE = [f("S", { prenom: "Ysolde", classe: "Sorcier", xp: 7900 }), f("A", { prenom: "Bran" }), f("K", { prenom: "Tombé" }),
      f("M1", { camp: "Ennemi", estMonstre: true, prenom: "Gnoll" }), f("M3", { camp: "Ennemi", estMonstre: true, prenom: "Chacal" }),
      f("M4", { camp: "Ennemi", estMonstre: true, prenom: "Ogre" }), f("M6", { camp: "Ennemi", estMonstre: true, prenom: "Loin" }),
      f("I", { camp: "Ennemi", estMonstre: true, prenom: "Leurre", estIllusion: true })];
    window.TOKENS_VTT_DATA = { S: { q: 0, r: 0 }, A: { q: 0, r: 1 }, K: { q: 1, r: -1 }, M1: { q: 2, r: 0 }, M3: { q: 0, r: -3 },
                               M4: { q: 4, r: 0 }, M6: { q: 6, r: 0 }, I: { q: -1, r: 0 } };
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]]; window.COMBAT_INDEX_PERSO = 0;
    window.COMPETENCES_CACHE = {}; window.CACHE_COMPETENCES_GLOBAL = { S: {} };
    window.CHEMIN_MOUVEMENT = []; window.ZONES_PERSISTANTES = {};
    const demandes = [];
    window.regimeDemande = { actif: () => true, enVol: () => false, etat: () => null,
                             techniqueClasse: (a, id, cible) => { demandes.push([a, id, cible || null]); } };
    const fenetre = () => { const x = document.getElementById("fenetre-choix-rempart"); return !!x && x.style.display !== "none"; };
    const avant = fenetre();
    window.lancerTechniqueClasse(idCarte, "S");
    await new Promise(r => setTimeout(r, 150));
    const st = window.ETAT_CIBLAGE || {};
    const ouvert = { actif: !!st.actif, technique: st.techniqueClasse, fenetre: fenetre() && !avant };
    // Chaque combattant touché sur le plateau : accepté, ou refusé.
    const acceptes = [];
    essais.forEach(id => {
      window.ajouterCibleCiblage(id);
      if (st.cibleUnique === id) { acceptes.push(id); window.ajouterCibleCiblage(id); }
    });
    window.ajouterCibleCiblage(acceptes[0]);
    await window.declencherResolutionAvecBondEventuel();
    const ferme = !(window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif);
    if (typeof window.nettoyerCiblage === "function") window.nettoyerCiblage();
    return { ouvert, acceptes, demandes, ferme };
  }, { idCarte, essais });
  const essais = ["S", "A", "K", "M1", "M3", "M4", "M6", "I"];
  const ch = await viser("CLASSE_CHARME_FRATRICIDE", essais);
  verifier("Charme : le lancement ouvre le ciblage du plateau (plus de fenêtre de noms)",
           ch.ouvert.actif && ch.ouvert.technique === "CLASSE_CHARME_FRATRICIDE" && !ch.ouvert.fenetre, JSON.stringify(ch.ouvert));
  verifier("…seul l'ennemi debout, à 5 cases et en vue, se vise (ni allié, ni leurre, ni trop loin, ni derrière un mur)",
           JSON.stringify(ch.acceptes) === '["M1"]', JSON.stringify(ch.acceptes));
  verifier("validé : la technique part sur lui, le ciblage se ferme",
           ch.ferme && JSON.stringify(ch.demandes) === '[["S","CLASSE_CHARME_FRATRICIDE","M1"]]', JSON.stringify(ch.demandes));
  const tr = await viser("CLASSE_TRANSFERT", essais);
  verifier("Transfert : alliés ET ennemis debout, à toute distance (v357), même derrière un mur (ni lui-même, ni un tombé, ni un leurre)",
           tr.ouvert.actif && !tr.ouvert.fenetre && JSON.stringify(tr.acceptes) === '["A","M1","M3","M4","M6"]', JSON.stringify(tr));
  verifier("…validé : la technique part sur le premier", tr.ferme && JSON.stringify(tr.demandes) === '[["S","CLASSE_TRANSFERT","A"]]', JSON.stringify(tr.demandes));
}


verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
