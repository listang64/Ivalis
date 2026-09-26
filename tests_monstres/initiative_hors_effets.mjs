// L'INITIATIVE NE PAIE PAS POUR CERTAINS EFFETS.
//
// L'initiative d'une carte, c'est ce qui reste de 100 une fois la fatigue
// payée : plus une carte coûte, plus elle part tard. L'Absorption en était déjà
// exemptée (son coût était « rendu » à l'initiative). Nico : « l'effet Contre
// et Aveuglement, Brûlure, Empoisonnement, Glacé, Électrifié, Peur, Confusion
// ne doivent pas compter dans le calcul de l'initiative. »
//
// Vérifié deux fois, sur le grimoire réel (effets_reels.json) :
//   1. LA VRAIE FORGE (competences.js, rafraichirForge) sur la vraie page :
//      ajouter l'un de ces effets coûte de la fatigue, mais ne change pas
//      l'initiative affichée. Un effet qui n'est pas dans la liste
//      (Immobilisation, Étourdi) la fait toujours baisser.
//   2. LE GÉNÉRATEUR DE MONSTRES (monstres_competences.js) : sa liste est la
//      même que celle de la Forge, mot pour mot.
import fs from 'fs';
import http from 'http';
import path from 'path';

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

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  // firebase-config.js fabrique la base avec des options (le transport sondé
  // plutôt que subi, pour l'iPad) : le bouchon doit donc offrir cette porte-là,
  // sinon le module ne se charge pas et rien du jeu ne s'initialise.
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {}; export const updateDoc = async () => {};
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {}; export const query = (...a) => ({a});
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

// Les images du décor sont injoignables depuis le bac à sable. On sert un
// rectangle connu à la place : l'avatar doit avoir une taille pour qu'on puisse
// dire s'il dépasse du bouton, et le bandeau une hauteur pour que la boîte de
// l'anneau se pose quelque part.
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml',
  headers: {'Access-Control-Allow-Origin':'*'},
  body: `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="132" viewBox="0 0 450 132"><rect width="450" height="132" fill="#2a1d12"/></svg>` }));

const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));

await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

const EFFETS = JSON.parse(fs.readFileSync(`${RACINE}/tests_monstres/effets_reels.json`, 'utf-8'));
const effets = Object.entries(EFFETS).map(([id, e]) => ({ ...e, id }));
// L'Aveuglement vient d'une migration : on l'ajoute s'il manque à l'instantané.
if (!effets.some(e => e.Nom === "Aveuglement"))
  effets.push({ id: "EFF_AVEUGLEMENT", Nom: "Aveuglement", Cout_PT: "1", Type_Mecanique: "Physique",
                Type_Mecanique_2: "Aucun", Modificateur: "DEXTÉRITÉ", Pourcent_Base: 10, Pourcent_Max: 70, Tours: 2, Valeur: 0 });
const id = (nom) => (effets.find(e => e.Nom === nom) || {}).id;

// La vraie Forge : une attaque légère, plus (ou non) un sous-effet.
const forger = (sousEffet, crans = 2) => p.evaluate(({ effets, attaque, sousEffet, crans }) => {
  const base = effets.find(e => e.id === attaque);
  window.forgeState.effetsBDD = effets;
  window.forgeState.caracs = { force: 16, dex: 16, con: 16, int: 16, sag: 16, cha: 16 };
  window.forgeState.statsPerso = {};
  window.forgeState.armePrincipale = "Arme polyvalente";
  window.forgeState.actions = [{ idInst: "A1", baseEffet: base, count: 1, baseDuree: 0,
                                 mods: sousEffet ? { [sousEffet]: crans } : {}, modsDuree: {}, zoneHexes: [] }];
  window.rafraichirForge();
  return { init: parseInt(document.getElementById("forge-initiative-val").innerText),
           fatigue: parseInt(document.getElementById("forge-fatigue-val").innerText) };
}, { effets, attaque: id("Attaque légère"), sousEffet, crans });

console.log("\n1. LA VRAIE FORGE");
{
  const nue = await forger(null);
  verifier("la carte nue a une initiative et une fatigue", nue.init > 0 && nue.fatigue > 0, JSON.stringify(nue));
  for (const nom of ["Contre", "Aveuglement", "Brûlé", "Empoisonnement", "Glacé", "Électrifié", "Peur", "Confusion", "Absorption"]) {
    if (!id(nom)) { verifier(`${nom} présent dans le grimoire`, false); continue; }
    const r = await forger(id(nom));
    verifier(`${nom} : coûte sa fatigue, ne retarde pas la carte`, r.fatigue > nue.fatigue && r.init === nue.init,
             `fatigue ${nue.fatigue}→${r.fatigue}, init ${nue.init}→${r.init}`);
  }
  for (const nom of ["Immobilisation", "Étourdit"]) {
    const r = await forger(id(nom));
    verifier(`${nom} (hors liste) : la carte part toujours plus tard`, r.init < nue.init,
             `init ${nue.init}→${r.init}`);
  }
}

console.log("\n1 bis. L'ÉTALEMENT NE REMISE QUE LA ZONE, LES DÉGÂTS ET LA DISTANCE");
{
  // Règle de Nico : la ristourne de fatigue de l'Étalement (« Cout / 1.2 »)
  // ne s'applique qu'à la zone, aux dégâts et à la distance — pas aux effets
  // associés. Attaque légère ×2 (2 PC chacune), Étalement, Brûlé ×2 (1 PC).
  const pc = await p.evaluate(({ effets, attaque, dot, brule, dist }) => {
    const base = effets.find(e => e.id === attaque);
    window.forgeState.effetsBDD = effets;
    window.forgeState.actions = [{ idInst: "A1", baseEffet: base, count: 2, baseDuree: 0,
                                   mods: { [dot]: 1, [brule]: 2 }, modsDuree: {}, zoneHexes: [] }];
    window.rafraichirForge();
    const avecEtat = parseFloat(document.getElementById("forge-cout-pc").innerText);
    window.forgeState.actions[0].mods = { [dot]: 1, [dist]: 2 };
    window.rafraichirForge();
    const avecDistance = parseFloat(document.getElementById("forge-cout-pc").innerText);
    return { avecEtat, avecDistance };
  }, { effets, attaque: id("Attaque légère"), dot: id("Durée étalement dégâts"), brule: id("Brûlé"), dist: id("Distance") });
  const coutDist = parseFloat(String(effets.find(e => e.Nom === "Distance").Cout_PT).replace(",", "."));
  verifier("attaque + étalement + Brûlé : 4/1,2 + 2 (l'état se paie plein pot)", Math.abs(pc.avecEtat - (4 / 1.2 + 2)) < 0.06,
           `${pc.avecEtat} PC (avant : ${(6 / 1.2).toFixed(1)})`);
  verifier("attaque + étalement + Distance : tout est remisé", Math.abs(pc.avecDistance - (4 + 2 * coutDist) / 1.2) < 0.06,
           `${pc.avecDistance} PC`);
}

console.log("\n2. LE GÉNÉRATEUR DE MONSTRES SUIT LA MÊME LISTE");
{
  const forge = await p.evaluate(() => window.MOTS_HORS_INITIATIVE);
  const srcM = fs.readFileSync(`${RACINE}/monstres_competences.js`, 'utf-8');
  const m = srcM.match(/const MOTS_HORS_INITIATIVE = (\[[\s\S]*?\]);/);
  const monstres = m ? eval(m[1]) : null;
  verifier("même liste mot pour mot", JSON.stringify(forge) === JSON.stringify(monstres),
           `${JSON.stringify(forge)} / ${JSON.stringify(monstres)}`);
  const init = srcM.slice(srcM.indexOf("function initiativeChantier"), srcM.indexOf("const fatigueDe ="));
  verifier("initiativeChantier la lit pour les socles ET les sous-effets",
           (init.match(/horsInitiative\(/g) || []).length === 2);

  // Et la vraie fonction, sur une carte de créature construite à la main :
  // attaque légère + 2 crans d'un sous-effet, 20 de fatigue payée.
  global.window = { EFFETS_BDD_CACHE: EFFETS, gabaritMonstre: () => null };
  global.localStorage = { getItem: () => null };
  global.document = { getElementById: () => null };
  const initiativeChantier = eval(srcM.replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '') + '\n;initiativeChantier');
  const eff = (nom) => effets.find(e => e.Nom === nom);
  const carte = (nom) => ({ actions: [{ baseEffet: eff("Attaque légère"), count: 1,
                                        modsEffets: nom ? [{ effet: eff(nom), count: 2 }] : [] }] });
  const nue = initiativeChantier(carte(null), effets, 20);
  verifier("créature, carte nue à 20 de fatigue : 80", nue === 80, String(nue));
  for (const nom of ["Glacé", "Peur", "Confusion", "Empoisonnement"]) {
    const v = initiativeChantier(carte(nom), effets, 30);
    verifier(`créature + ${nom} (30 de fatigue) : son coût rendu, 80`, v === 80, String(v));
  }
  const imm = initiativeChantier(carte("Immobilisation"), effets, 30);
  verifier("créature + Immobilisation (hors liste) : 70", imm === 70, String(imm));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
