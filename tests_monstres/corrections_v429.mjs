// v429 — LES BONUS D'ÉTAT MULTIPLES S'ADDITIONNENT (et le Pugiliste Vargen précisé).
// Nico : « En cas de bonus d'état multiples > somme, et c'est valable pour tout sur ce
// jeu. » Une carte qui pose déjà un état, plus l'arme (ou deux objets) qui le pose,
// plus le talent : les chances s'ajoutent (le jet ne tire jamais au-delà de 100) ;
// la provocation du Protecteur aussi. (Le décor : celui de corrections_v427_pugiliste.)
// Lancer : node tests_monstres/corrections_v429.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const RACINE = process.env.IVALIS_RACINE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const titre = (t) => console.log("\n" + t);
const section = async (corps) => { try { await corps(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 160)); } };
const lire = (f) => { try { return fs.readFileSync(path.join(RACINE, f), 'utf-8'); } catch (e) { return ""; } };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' }); res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({}); export const getApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true, size: 0 });
  export const setDoc = async () => {}; export const updateDoc = async () => {}; export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a}); export const where = (...a) => ({a});
  export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
p.on('dialog', d => d.accept());
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' }));
await p.goto(base + '/index.html');
await p.waitForFunction(() => typeof window.appliquerEquipementALaCarte === "function" && typeof window.atoutRace === "function"
                              && typeof window.talentParId === "function", null, { timeout: 15000 });

await p.evaluate(() => {
  window.__heros = (extra) => ({ idPersonnage: "P1", prenom: "Grak", race: "Vargen", classe: "", xp: 6400, camp: "Allié", Etats_Alteres: [],
    caracs: { force: 14, dex: 14, con: 12, int: 10, sag: 10, cha: 10 }, talents: { TAL_PUGILISTE: 1 }, talentsChoix: {}, ...extra });
  window.__epee = { nom: "Épée", modele: "Épée", type: "Arme légère" };
  window.__baton = { nom: "Bâton", modele: "Bâton", type: "Arme magique" };
  window.__bague = { nom: "Bague", modele: "Bagues DPS", bague: true };
  window.__sort = () => [{ nom: "Boule de feu", typeRes: "Magique", valeurBrute: 10, isRanged: true, rangeMax: 5, cibles: ["M"] }];
  window.__carte = (lanceur, attaques, alterations, arme) => {
    const s = { attaques, alterations };
    window.appliquerEquipementALaCarte(s, lanceur, arme || "Magie");
    return s.alterations.map(a => ({ nom: a.nom, chance: a.chance, duree: a.duree, venuDuTalent: !!a.venuDuTalent, cibles: a.cibles }));
  };
});


titre("1. L'ÉQUIPEMENT ET LA CARTE : LA SOMME");
await section(async () => {
  const r = await p.evaluate(() => {
    const vrai = window.etatsEquipementPourCarte;
    const humain = window.__heros({ race: "Humain", talents: {} });
    const avec = (etats, fn) => { window.etatsEquipementPourCarte = () => etats; try { return fn(); } finally { window.etatsEquipementPourCarte = vrai; } };
    const coup = () => [{ nom: "Coup", typeRes: "Physique", valeurBrute: 10, cibles: ["M"] }];
    return {
      carteEtArme: avec([{ etat: "Saignement", chance: 20 }], () => window.__carte(humain, coup(), [{ nom: "Saignement", chance: 30, duree: 2, cibles: ["M"] }], "Arme légère")),
      deuxObjets: avec([{ etat: "Brûlé", chance: 10 }, { etat: "Brûlé", chance: 15 }], () => window.__carte(humain, coup(), [], "Arme légère")),
      armeSeule: avec([{ etat: "Étourdi", chance: 12 }], () => window.__carte(humain, coup(), [], "Arme légère")),
      talentEtBague: avec([{ etat: "Saignement", chance: 20 }], () => window.__carte(window.__heros({ equipMainDroite: window.__bague }), window.__sort(), [])),
      talentBagueCarte: avec([{ etat: "Saignement", chance: 20 }], () => window.__carte(window.__heros({ equipMainDroite: window.__bague }), window.__sort(), [{ nom: "Saignement", chance: 40, duree: 2, cibles: ["M"] }]))
    };
  });
  const ch = (l, nom) => (l.find(a => a.nom === nom) || {}).chance;
  verifier("une carte à 30 % de Saignement + une arme à 20 % : 50 % (et plus le meilleur des deux)", ch(r.carteEtArme, "Saignement") === 50 && r.carteEtArme.length === 1, JSON.stringify(r.carteEtArme));
  verifier("deux objets qui brûlent (10 et 15) : 25 %, un seul Brûlé", ch(r.deuxObjets, "Brûlé") === 25 && r.deuxObjets.length === 1, JSON.stringify(r.deuxObjets));
  verifier("une arme seule : sa chance telle quelle (12 %)", ch(r.armeSeule, "Étourdi") === 12, JSON.stringify(r.armeSeule));
  // (v431) Le Pugiliste est une augmentation max (+10) : seulement sur le Saignement du sort ; l'arme, elle, s'ajoute partout.
  verifier("(v431) un sort sans Saignement : le Pugiliste ne donne rien, la bague ajoute le sien (20 %)", ch(r.talentEtBague, "Saignement") === 20, JSON.stringify(r.talentEtBague));
  verifier("(v431) …et avec une carte qui fait déjà saigner à 40 : 40 + 10 (Pugiliste) + 20 (bague) = 70", ch(r.talentBagueCarte, "Saignement") === 70, JSON.stringify(r.talentBagueCarte));
});

titre("2. LA PROVOCATION DU PROTECTEUR : LA SOMME AUSSI");
await section(async () => {
  const r = await p.evaluate(() => {
    const vrai = window.atoutRace;
    window.atoutRace = (perso) => ({ ...(vrai(perso) || {}), provocationAttaques: 10 });
    try {
      const h = window.__heros({ race: "Humain", talents: {} });
      window.PERSOS_PARTIE = [{ idPersonnage: "M", camp: "Ennemi" }, { idPersonnage: "P1", camp: "Allié" }];
      const coup = [{ nom: "Coup", typeRes: "Physique", valeurBrute: 10, cibles: ["M"] }];
      return { seule: window.__carte(h, coup.map(x => ({ ...x })), [], "Arme légère"),
               avecCarte: window.__carte(h, coup.map(x => ({ ...x })), [{ nom: "Provocation", chance: 25, duree: 1, cibles: ["M"] }], "Arme légère") };
    } finally { window.atoutRace = vrai; }
  });
  const ch = (l) => (l.find(a => a.nom === "Provocation") || {}).chance;
  // (v431) une augmentation max ne sert que l'effet que porte le sort : sans Provocation, rien.
  verifier("(v431) la classe seule, sur une carte qui ne provoque pas : rien", ch(r.seule) === undefined, JSON.stringify(r.seule));
  verifier("une carte qui provoque déjà à 25 % : 25 + 10 = 35", ch(r.avecCarte) === 35, JSON.stringify(r.avecCarte));
});

titre("3. LE CODE NE GARDE PLUS « LE MEILLEUR DES DEUX »");
await section(async () => {
  const m = lire("moteur_effets.js");
  verifier("moteur_effets.js : plus de Math.max sur la chance d'un état déjà là", !/dejaLa\.chance = Math\.max|deja\.chance = Math\.max/.test(m));
});

await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
