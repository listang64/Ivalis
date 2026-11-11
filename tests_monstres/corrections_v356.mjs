// v356 — LA REFONTE DES CLASSES : LE CHASSEUR DE MAGES.
// Nico : « NIVEAU 1 : +10 % Résistance magique, +2 dégâts physiques contre les monstres de
// type Mage et Soutien. NIVEAU 3 : +10 % Résistance magique, +1 compétence. NIVEAU 5 :
// Bouclier anti-magie (renvoie à l'expéditeur tous les dégâts magiques, INIT 200, réserve 20
// pour 2 tours). NIVEAU 9 : Briseur d'arcane (une fois par combat : 1,5× la résistance
// magique de la cible en dégâts bruts, INIT 100). » Ses réponses : la Maîtrise de la lumière
// est retirée ; le +2 sur toutes ses attaques ; le Bouclier tient 2 manches tant qu'il est
// maintenu, lui ne prend rien ; le Briseur vise un ennemi à 5 cases, en vue.
// (Le détail de la classe : chasseur_de_mages.mjs.)
//
// Lancer : node tests_monstres/corrections_v356.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { RESERVES_TECHNIQUES, ARCHETYPES_MAGES_SOUTIENS, actionBriseurArcane } from '../moteur_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lireFichier = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8');

const w = {};
new Function('window', lireFichier('experience.js'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);

console.log("\n1. LES RÈGLES");
{
    verifier("la réserve du Bouclier : 20 par manche, 2 manches, il se relâche",
             JSON.stringify(RESERVES_TECHNIQUES.CLASSE_BOUCLIER_ANTIMAGIE) === '{"parTour":20,"tours":2,"nom":"Anti-magie maintenu"}');
    verifier("les archétypes visés : les deux Mages et le Soutien",
             JSON.stringify(ARCHETYPES_MAGES_SOUTIENS) === '["DPS MAGE CAC","DPS MAGE DISTANCE","SOUTIEN"]');
    const a = actionBriseurArcane("C", { id: "M", def: { magique: 31 } }).attaques[0];
    verifier("le Briseur : brut, 31 % → 46, à 5 cases", a.brut === true && a.valeurBrute === 46 && a.rangeMax === 5 && a.cibles[0] === "M");
    // (v359 : la Maîtrise et l'Appel de la lumière reviennent — au Prêtre de la lumière.)
    const chasseur = (xp) => w.atoutClasse({ classe: "Chasseur de mages", race: "Humain", xp });
    verifier("le Chasseur n'a plus ni Maîtrise ni Appel de la lumière (ils sont au Prêtre depuis la v359)",
             !chasseur(7900).maitriseLumiere && !(chasseur(7900).techniques || []).includes("CLASSE_APPEL_LUMIERE"));
}

// La fiche de classe dans la vraie page.
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

console.log("\n2. LA FICHE DE CLASSE ET LE VOLET");
{
  const r = await p.evaluate(async () => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    await window.ouvrirChoixClasse();
    window.ouvrirFicheClasse("CLASSE_CHASSEUR_DE_MAGES");
    const d = document.getElementById("descriptif-fiche-classe");
    const perso = { classe: "Chasseur de mages", race: "Humain", xp: 6400 };
    return { niveaux: [...d.querySelectorAll(".palier-classe-niveau")].map(x => x.textContent.trim()), texte: d.textContent,
             bonus: window.htmlBonusRaceClasse ? window.htmlBonusRaceClasse(perso).replace(/<[^>]+>/g, " ") : "" };
  });
  verifier("paliers Niv. 1 / 3 / 5 / 9", JSON.stringify(r.niveaux) === '["Niv. 1","Niv. 3","Niv. 5","Niv. 9"]', JSON.stringify(r.niveaux));
  verifier("la fiche dit +10 %, Mage et Soutien, la réserve du Bouclier, le Briseur ; plus la lumière",
           /\+10 % de résistance magique/.test(r.texte) && /Mage et Soutien/.test(r.texte) && /Réserve : 20/.test(r.texte)
           && /Briseur d'arcane/.test(r.texte) && !/Appel de la lumière|Maîtrise de la lumière/.test(r.texte));
  verifier("l'onglet Statistiques : +2 contre Mage et Soutien, les deux techniques",
           /\+2 dégâts contre les monstres Mage et Soutien/.test(r.bonus) && /Bouclier anti-magie/.test(r.bonus) && /Briseur d(\'|&#39;|&#x27;|&apos;)arcane/.test(r.bonus),
           r.bonus.replace(/\s+/g, " ").slice(0, 300));
}
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
verifier("version 356 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lireFichier("trace_combat.js")) || [])[1]) >= 356
         && JSON.parse(lireFichier("version.json")).version >= 356);
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
