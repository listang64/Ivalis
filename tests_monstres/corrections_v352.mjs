// v352 — LA REFONTE DES CLASSES : LE PISTEUR.
// Nico : « niveau 1 : un compagnon animal indépendant (25 PV, 17 % d'esquive, 7 dégâts
// physiques). Niveau 3 : Lancer de bolas, +1 dégât pour le compagnon. Niveau 5 : +5 PV et +1
// dégât pour le compagnon, +2 soins quand le joueur soigne son compagnon. Niveau 9 : Lien de
// sang, +5 PV et +1 dégât pour le compagnon. Lancer de bolas : un ennemi à portée 5 est
// immobilisé, init 100, sans arme à distance. » Ses réponses : les bolas remplacent le Tir
// précis (même effet) ; dégâts physiques ; le +1 aux tirs disparaît ; les +2 soins : ceux du
// Pisteur sur son compagnon. (Le reste de la classe : pisteur.mjs.)
//
// Lancer : node tests_monstres/corrections_v352.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat, COMPAGNON,
         compagnonDe, placerCompagnons, profanateurPourZombie, creerDes } from '../combat_etat.js';
import { esquiveDe, paradeDe, aLEtat , resoudreCarte } from '../moteur_pur.js';
import { jouerCompagnon, prochainPas, ouvrirManche, validerIntention, avancerFile } from '../cerveau_combat.js';
import { renfortsDuTour, misEnScene } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(70)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const w = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/experience.js', 'utf-8'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);
const REGLES = {
    pvMax: w.pvMaxCombattant, fatigueMax: w.fatigueMaxCombattant,
    esquive: w.esquiveCombattant, parade: w.paradeCombattant,
    defPhysique: w.defPhysiqueCombattant, defMagique: w.defMagiqueCombattant,
    critique: w.critiqueCombattant, atouts: w.atoutRace, bonusEquip: w.bonusEquip
};
const XP = { 1: 0, 2: 700, 3: 1200, 4: 1800, 5: 2500, 8: 5200, 9: 6400, 10: 7900 };
const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const pisteur = (niveau, extra = {}) => fiche("P", { classe: "Pisteur", xp: XP[niveau], ...extra });
// Le compagnon tel que le jeu le crée (donneesCompagnon, monstres.js), une
// fois passé par persoDocVersFront : une créature de son camp.
const compagnon = (extra = {}) => fiche("C", { estMonstre: true, camp: "Allié", compagnonDe: "P",
    PV_Max: 25, PV_Actuels: 25, Esquive: 15, Parade: 0, ...extra });
// P (0,0) ; C, son compagnon, au contact (0,1) ; M1 (5,0) ; M2 (-3,0) ; H (-1,0).
const monde = (niveau = 10, positions = {}, autres = ["M1", "M2", "H"]) => {
    const fiches = [pisteur(niveau), compagnon(), ...autres.map(id => fiche(id))];
    const pos = { P: { q: 0, r: 0 }, C: { q: 0, r: 1 }, M1: { q: 5, r: 0 }, M2: { q: -3, r: 0 }, H: { q: -1, r: 0 }, ...positions };
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: fiches, positions: pos,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["P", "C", ...autres];
    e.phase = "Resolution";
    return e;
};


const lireFichier = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8');
// Le compagnon au contact de M1 (armure 0 ou choisie), à son tour.
const morsure = (niveau, armure = 0) => { const e = monde(niveau, { M1: { q: 1, r: 1 } }); e.combattants.M1.def.physique = armure;
    e.file = [{ id: "C", carte: "COMPAGNON_ATTAQUE", initiative: 50, pas: 0 }, { id: "M1", carte: "X", initiative: 10, pas: 0 }];
    return jouerCompagnon(e, "C"); };
const soin = (niveau, lanceur, cible) => { const e = monde(niveau); e.combattants[cible].pv = 10;
    return resoudreCarte(e, { type: "carte", idLanceur: lanceur, idCarte: "S", critique: false, alterations: [],
        attaques: [{ nom: "Soin", valeurBrute: 10, typeRes: "Magique", isHeal: true, cibles: [cible] }],
        jets: { attaqueRatee: false, parCible: { [cible]: { esquive: false, etats: {} } } } }).etat.combattants[cible].pv; };

console.log("\n1. LE COMPAGNON FRAPPE 7, PUIS 8, 9, 10 — EN PHYSIQUE");
{
    const pv = (n) => morsure(n).etat.combattants.M1.pv;
    verifier("niveau 1 : 7 dégâts", pv(1) === 93, String(pv(1)));
    verifier("niveau 3 : 8 ; niveau 5 : 9 ; niveau 9 : 10", pv(3) === 92 && pv(5) === 91 && pv(9) === 90, [pv(3), pv(5), pv(9)].join(" "));
    verifier("niveau 2 : toujours 7 ; niveau 8 : 9", pv(2) === 93 && pv(8) === 91);
    verifier("physiques : l'armure (50 %) les réduit (niveau 9 : 10 → 5)", morsure(9, 50).etat.combattants.M1.pv === 95,
             String(morsure(9, 50).etat.combattants.M1.pv));
    verifier("rejoué depuis le journal : mêmes PV", (() => { const e = monde(9, { M1: { q: 1, r: 1 } });
             e.file = [{ id: "C", carte: "COMPAGNON_ATTAQUE", initiative: 50, pas: 0 }]; const p2 = jouerCompagnon(e, "C");
             return appliquerEntree(e, p2.entree).combattants.M1.pv === 90; })());
}

console.log("\n2. NIVEAU 5 : +2 PV À CHAQUE SOIN QUE LE PISTEUR DONNE À SON COMPAGNON");
{
    verifier("le Pisteur (niveau 5) soigne son compagnon de 10 : +12", soin(5, "P", "C") === 22, String(soin(5, "P", "C")));
    verifier("niveau 4 : +10", soin(4, "P", "C") === 20);
    verifier("le Pisteur soigne un autre allié : +10", soin(5, "P", "H") === 20);
    verifier("un autre héros soigne le compagnon : +10", soin(5, "H", "C") === 20);
}

console.log("\n3. LES TEXTES");
{
    const c = lireFichier("classes.js");
    verifier("la fiche : 1 (25 PV, 17 %, 7 physiques), 3 Lancer de bolas, 5 (+5 PV, +1, +2 soins), 9 Lien de sang (35 PV, 10 dégâts)",
             /25 PV · 17 % d'esquive · 7 dégâts physiques/.test(c) && /niveau: 3, titre: "Technique : Lancer de bolas"/.test(c)
             && /\+2 PV à chaque soin que le Pisteur donne/.test(c) && /niveau: 9, titre: "Technique : Lien de sang"/.test(c) && /35 PV, 10 dégâts/.test(c)
             && !/arme à distance"\]/.test(c));
    verifier("version 352 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lireFichier("trace_combat.js")) || [])[1]) >= 352
             && JSON.parse(lireFichier("version.json")).version >= 352);
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
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {};
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
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"><rect width="900" height="300" fill="#5a3a20"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

console.log("\n4. LE DOCUMENT DU COMPAGNON : 25 PV, PUIS 30 ET 35 ; 17 % D'ESQUIVE");
{
  const r = await p.evaluate(() => {
    const XP = { 1: 0, 4: 1800, 5: 2500, 8: 5200, 9: 6400 };
    window.ID_PARTIE_COURANTE = "P";
    const d = (n) => window.donneesCompagnon({ idPersonnage: "H1", prenom: "Ara", race: "Humain", classe: "Pisteur", xp: XP[n], camp: "Allié",
                                               compagnon: { nom: "Croc", image: "" } });
    return [1, 4, 5, 8, 9].map(n => { const x = d(n); return [n, x.PV_Max, x.PV_Actuels, x.Esquive]; });
  });
  verifier("PV : 25 (niv. 1 à 4), 30 (5 à 8), 35 (9) ; esquive 17", JSON.stringify(r) === '[[1,25,25,17],[4,25,25,17],[5,30,30,17],[8,30,30,17],[9,35,35,17]]',
           JSON.stringify(r));
}
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
