// UNE VALEUR À VIRGULE GARDE SON DEMI-POINT, ARRONDI AU PLUS PROCHE.
//
// Nico : « est-ce que je peux mettre 1 pt de dégâts dans la Forge qui fait
// 1,5 point de dégâts ? Il pourra prendre en compte le 0,5 ? » — « Arrondi au
// plus près. » La Forge calculait juste (3 crans × 1,5 = 4,5) mais le moteur
// lisait la valeur en entier : 1,5 devenait 1 avant même les défenses. Elle
// traverse désormais la chaîne telle quelle et n'est arrondie qu'une fois, là
// où le moteur arrondissait déjà : 1,5 → 2, 4,5 → 5, un critique double AVANT
// (1,5 → 3). Les soins, boucliers et nappes au sol suivent la même règle.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { chaineDeDegats, resoudreCarte, decimal, creerZonePure, poserZone, traverserZones } from '../moteur_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const cible = (extra = {}) => ({ id: "M", camp: "Ennemi", pv: 50, pvMax: 50, fatigue: 40, bouclier: 0, etats: [],
    def: { esquive: 0, parade: 0, physique: 0, magique: 0, critique: 0 }, ...extra });
const coup = (v, extra = {}) => chaineDeDegats(cible(extra.cible), { valeurBrute: v, typeRes: extra.type || "Physique", ...(extra.attaque || {}) },
                                               { critique: !!extra.critique, distance: extra.distance || 2 }).degats;

console.log("\n1. LES DÉGÂTS : LE DEMI-POINT COMPTE, ARRONDI AU PLUS PROCHE");
{
    verifier("1,5 → 2", coup(1.5) === 2, `${coup(1.5)}`);
    verifier("« 1,5 » écrit à la française → 2", coup("1,5") === 2);
    verifier("3 crans de 1,5 = 4,5 → 5", coup(4.5) === 5, `${coup(4.5)}`);
    verifier("7,5 → 8", coup(7.5) === 8);
    verifier("un entier ne bouge pas (10 → 10)", coup(10) === 10);
    verifier("critique : doublé AVANT l'arrondi (1,5 → 3, 4,5 → 9)", coup(1.5, { critique: true }) === 3 && coup(4.5, { critique: true }) === 9);
    verifier("avec 50 % de résistance : 4,5 → 2,25 → 2", coup(4.5, { cible: { def: { esquive: 0, parade: 0, physique: 50, magique: 0, critique: 0 } } }) === 2);
    verifier("decimal lit 1,5 / 1.5 / 2 / vide", decimal("1,5") === 1.5 && decimal(1.5) === 1.5 && decimal("2") === 2 && decimal("") === 0);
}

console.log("\n2. SOINS ET BOUCLIERS : MÊME RÈGLE");
{
    const etat = { combattants: {
        L: { id: "L", camp: "Allié", pv: 50, pvMax: 50, fatigue: 100, bouclier: 0, etats: [], def: { esquive: 0, parade: 0, physique: 0, magique: 0, critique: 0 }, q: 0, r: 0 },
        A: { id: "A", camp: "Allié", pv: 20, pvMax: 50, fatigue: 100, bouclier: 0, etats: [], def: { esquive: 0, parade: 0, physique: 0, magique: 0, critique: 0 }, q: 1, r: 0 } },
        ordre: ["L", "A"], file: [], zones: {} };
    const jouer = (attaque, critique = false) => resoudreCarte(etat, { type: "carte", idLanceur: "L", idCarte: "C", critique, alterations: [],
        attaques: [{ ...attaque, cibles: ["A"] }], jets: { attaqueRatee: false, parCible: { A: { esquive: false, etats: {} } } } }).etat.combattants.A;
    verifier("un soin de 1,5 rend 2 PV", jouer({ valeurBrute: 1.5, typeRes: "Magique", isHeal: true }).pv === 22);
    verifier("critique : 1,5 → 3 PV", jouer({ valeurBrute: 1.5, typeRes: "Magique", isHeal: true }, true).pv === 23);
    verifier("un bouclier de 2,5 points → 3", jouer({ valeurBrute: 2.5, typeRes: "Magique", isShield: true, isHeal: true }).bouclier === 3,
             `${jouer({ valeurBrute: 2.5, typeRes: "Magique", isShield: true, isHeal: true }).bouclier}`);
    verifier("des dégâts de 1,5 sur l'allié : 2", jouer({ valeurBrute: 1.5, typeRes: "Physique" }).pv === 18);
}
//  LA VRAIE PAGE
// =========================================================================
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
  export const getDoc = async (ref) => { const d = (window.__docs || {})[ref.chemin]; return { exists: () => !!d, data: () => d || {} }; };
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
const EFFETS = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/effets_reels.json', 'utf-8'));
const EFFETS_PAR_ID = Object.fromEntries((Array.isArray(EFFETS) ? EFFETS : Object.values(EFFETS)).map(e => [e.id, e]));
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

console.log("\n3. LA FORGE ET LA CARTE : 1,5 PAR CRAN");
{
  const r = await p.evaluate(async (EFFETS) => {
    window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
    const base = window.EFFETS_BDD_CACHE.EFF_ATTAQUE_LEGERE;
    base.Valeur = "1,5";
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", camp: "Allié", prenom: "Varn", PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }];
    window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 } };
    window.COMPETENCES_CACHE = { S1: { Nom: "Lame", Arme: "Arme légère CAC", Fatigue: 10, Initiative: 50,
      Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_LEGERE", count: 3, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } } };
    window.CACHE_COMPETENCES_GLOBAL = { H1: window.COMPETENCES_CACHE };
    const extraite = (((await window.demarrerCiblage("S1", { extraire: true, idLanceur: "H1" })) || {}).attaques || [])[0] || {};
    return { valeur: extraite.valeurBrute };
  }, EFFETS_PAR_ID);
  verifier("3 crans d'une attaque à 1,5 : la carte part avec 4,5", r.valeur === 4.5, JSON.stringify(r.valeur));
  // Le texte de la Forge (competences.js est un module : la fonction est
  // prise telle quelle dans la source).
  const SRC_COMP = fs.readFileSync('/home/user/Ivalis/competences.js', 'utf-8');
  const fonctionDe = (nom) => { const d = SRC_COMP.indexOf("function " + nom + "("); return SRC_COMP.slice(d, SRC_COMP.indexOf("\n}\n", d) + 2); };
  const formatter = new Function('window', [fonctionDe("parseFrenchFloat"), fonctionDe("bonusPorteeDeRace"), fonctionDe("formatterTexteEffet"),
                                            "return formatterTexteEffet;"].join("\n"))({});
  const eff = (valeur) => ({ id: "E", Nom: "Attaque légère", Valeur: valeur, Pourcent_Base: 0, Effet_Base: valeur + " dégâts physiques" });
  const t1 = formatter(eff("1,5"), 3, { baseEffet: eff("1,5") });
  const t2 = formatter(eff("1,1"), 3, { baseEffet: eff("1,1") });
  verifier("la Forge l'écrit à la française : « 4,5 dégâts »", /^4,5 dégâts/.test(t1), t1);
  verifier("sans décimales parasites : 3 × 1,1 → « 3,3 »", /^3,3 dégâts/.test(t2), t2);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
