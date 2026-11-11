// v363 — CORRECTIF : LES FICHES BLOQUÉES (« Maximum call stack size exceeded »).
// Nico : « je peux même pas aller sur la liste des personnages dans le bouton sommaire ;
// mon frère Adrien ne peut même pas créer de personnage ». La console : une boucle sans fin
// talents.js → atoutRace → bonusEquipement (objets.js) → bonusEquip → talents.js…
// La cause : bonusEquipement lisait atoutRace (le Berserker de la v360, le Protecteur de la
// v347) ; atoutRace lit les talents, et un talent qui dépend d'une caractéristique relit
// l'équipement (caracPourTalents). Il lit maintenant la classe seule (atoutClasse).
//
// Lancer : node tests_monstres/corrections_v363.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lire = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8');

console.log("\n1. LE CODE");
{
    const corps = lire("objets.js").slice(lire("objets.js").indexOf("window.bonusEquipement = function"));
    const fonction = corps.slice(0, corps.indexOf("\n};"));
    verifier("bonusEquipement n'appelle plus atoutRace (seulement atoutClasse)", !/window\.atoutRace\(/.test(fonction) && /window\.atoutClasse\(/.test(fonction));
    verifier("version 363 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lire("trace_combat.js")) || [])[1]) >= 363
             && JSON.parse(lire("version.json")).version >= 363);
}

const RACINE = '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id }); export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {}; export const updateDoc = async () => {}; export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "n" }); export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const increment = (n) => n;
  export const serverTimestamp = () => Date.now(); export const onSnapshot = () => () => {};
  export const query = (...a) => ({a}); export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
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

console.log("\n2. UN HÉROS AVEC UN TALENT QUI DÉPEND D'UNE CARACTÉRISTIQUE");
{
  const r = await p.evaluate(() => {
    const essai = (perso) => { try {
        const a = window.atoutRace(perso); const e = window.bonusEquip(perso, "resPhys"); const pv = window.pvMaxCombattant(perso);
        return { ok: true, a, e, pv };
      } catch (err) { return { ok: false, err: String(err.message || err) }; } };
    const hache = { uid: "u1", nom: "Hache à deux mains", deuxMains: true, bonus: { degatsPhys: 2 } };
    const masse = { uid: "u2", nom: "Masse à deux mains", deuxMains: true, bonus: { degatsPhys: 3 } };
    const base = { idPersonnage: "H1", race: "Humain", xp: 6400, PV_Max: 50, talents: { TAL_MAITRE_ELEMENTS: 1 } };
    return {
      sorcier: essai({ ...base, classe: "Sorcier" }),
      berserker: essai({ ...base, classe: "Berserker", equipMainDroite: hache, equipMainGauche: masse }),
      protecteur: essai({ ...base, classe: "Protecteur" }),
      sansClasse: essai({ ...base, classe: "" })
    };
  });
  verifier("un Sorcier avec « Maître des éléments » : plus de boucle sans fin", r.sorcier.ok, r.sorcier.err || "");
  verifier("le talent compte toujours (chance sur les états élémentaires)", r.sorcier.ok && typeof r.sorcier.a.chanceElementaire === "number", JSON.stringify(r.sorcier.a || {}).slice(0, 120));
  verifier("un Berserker de niveau 9 à deux armes à deux mains : −10 % de résistance physique", r.berserker.ok && r.berserker.e === -10, JSON.stringify(r.berserker).slice(0, 160));
  verifier("un Protecteur, un héros sans classe : pareil, sans erreur", r.protecteur.ok && r.sansClasse.ok);
}
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
