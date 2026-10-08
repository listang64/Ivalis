// LA TRACTION RÉPARTIE : PLUSIEURS CRANS, PLUSIEURS CIBLES, AU CHOIX DU JOUEUR.
//
// Nico : « si je mets 3 tractions magiques sur une compétence, vérifie que je
// peux cibler trois cibles différentes » ; « au choix du joueur » ; « s'il y a
// une attaque après les tractions, ça tape la première cible ».
//   - 3 crans (15 % chacun au grimoire) se répartissent : 1 cible à 45 %,
//     2 cibles à 30 + 15 %, 3 cibles à 15 % ; plafond du grimoire par cible ;
//   - chaque toucher pose un cran ; retoucher une cible lui en ajoute un tant
//     qu'il en reste, puis la retire ;
//   - l'attaque de la carte frappe la PREMIÈRE cible ; les autres sont tirées ;
//   - à l'envoi, une Traction par cible (eclaterTractionRepartie).
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat } from '../combat_etat.js';
import { resoudreCarte } from '../moteur_pur.js';

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
const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});

console.log("\n=========================================================");
console.log("  LA TRACTION RÉPARTIE");
console.log("=========================================================");

console.log("\n1. LE NOYAU : DEUX TRACTIONS, DEUX CIBLES, L'ATTAQUE SUR LA PREMIÈRE");
{
    const monde = () => {
        const fiches = [fiche("H"), fiche("M1"), fiche("M2")];
        const e = construireEtatCombat({ idPartie: "P", cerveau: "H", graine: 1, combattants: fiches,
            positions: { H: { q: 0, r: 0 }, M1: { q: 3, r: 0 }, M2: { q: 0, r: 3 } }, partie: { Tour_Combat: 1 }, regles: REGLES });
        e.ordre = ["H", "M1", "M2"]; e.phase = "Resolution";
        return e;
    };
    const tr = (id, chance) => ({ nom: "Traction", chance, cases: 3, duree: 0, estTraction: true, avantAttaque: true, cibles: [id] });
    const carte = (jets) => ({ type: "carte", idLanceur: "H", idCarte: "C", critique: false,
        attaques: [{ nom: "Attaque Magique", valeurBrute: 10, typeRes: "Magique", isRanged: true, rangeMax: 3, cibles: ["M1"] }],
        alterations: [tr("M1", 30), tr("M2", 15)], jets });
    const r = resoudreCarte(monde(), carte({ attaqueRatee: false, parCible: {
        M1: { esquive: false, etats: { Traction: true } }, M2: { esquive: false, etats: { Traction: true } } } }));
    const c = r.etat.combattants;
    const tirees = r.etapes.filter(x => x.type === "traction").map(x => x.cible);
    verifier("les deux cibles sont tirées vers le lanceur", JSON.stringify(tirees) === '["M1","M2"]'
             && Math.max(Math.abs(c.M1.q), Math.abs(c.M1.r)) < 3 && Math.max(Math.abs(c.M2.q), Math.abs(c.M2.r)) < 3,
             JSON.stringify({ tirees, M1: [c.M1.q, c.M1.r], M2: [c.M2.q, c.M2.r] }));
    // (Tirée au contact, M1 prend le tir à −30 % : 7.)
    verifier("seule la première prend l'attaque", c.M1.pv === 93 && c.M2.pv === 100, `M1 ${c.M1.pv}, M2 ${c.M2.pv}`);
    const r2 = resoudreCarte(monde(), carte({ attaqueRatee: false, parCible: {
        M1: { esquive: false, etats: { Traction: true } }, M2: { esquive: true, etats: { Traction: true } } } }));
    const esq = r2.etapes.filter(x => x.type === "esquive").map(x => x.cible);
    verifier("une cible seulement tirée qui esquive : son esquive est dite, elle ne bouge pas",
             JSON.stringify(esq) === '["M2"]' && r2.etat.combattants.M2.r === 3, JSON.stringify(esq));
}
//  LA VRAIE PAGE (extraction et ciblage réels)
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
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async (ref) => { const d = (window.__docs || {})[ref.chemin]; return { exists: () => !!d, data: () => d || {} }; };
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data }); };
  export const updateDoc = async () => {};
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

await p.evaluate((EFFETS) => {
  window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
  window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
  document.getElementById("fenetre-combat").style.display = "block";
  window.positionnerTokenVTT = window.positionnerTokenVTT || ((div) => {
    const px = window.PLATEAU_VTT.hexToPixel(parseFloat(div.dataset.q), parseFloat(div.dataset.r));
    div.style.left = px.x + "px"; div.style.top = px.y + "px";
  });
  window.PLATEAU_VTT = { hexSize: 40, getCaseState: () => ({}), getHexesInRadius: () => [],
                         hexToPixel: (q, r) => ({ x: 400 + 40 * Math.sqrt(3) * (q + r / 2), y: 300 + 60 * r }),
                         pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {} };
  window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
  window.afficherMessageFlottantHex = (q, r, t) => { (window.__messages = window.__messages || []).push(t); };
  window.PERSOS_PARTIE = [
    { idPersonnage: "H1", camp: "Allié", prenom: "Ilda", race: "Humain", xp: 0, PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" },
    { idPersonnage: "M1", camp: "Ennemi", prenom: "Gnoll", estMonstre: true, PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" },
    { idPersonnage: "M2", camp: "Ennemi", prenom: "Rat", estMonstre: true, PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" },
    { idPersonnage: "M3", camp: "Ennemi", prenom: "Loup", estMonstre: true, PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" },
    { idPersonnage: "M4", camp: "Ennemi", prenom: "Ours", estMonstre: true, PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }];
  window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, M1: { q: 3, r: 0 }, M2: { q: 0, r: 3 }, M3: { q: -3, r: 3 }, M4: { q: 0, r: -3 } };
  const act = (id, count, extra = {}) => ({ baseEffetId: id, count, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {}, ...extra });
  window.COMPETENCES_CACHE = {
    // Trois crans de Traction, PUIS une Attaque Magique à distance.
    TRIPLE: { Nom: "Rappel", Arme: "Magie", Fatigue: 20, Initiative: 50,
              Composants: { actions: [act("EFF_TRACTION_MAGIQUE", 3), act("EFF_ATTAQUE_MAGIQUE", 1, { element: "Feu", mods: { EFF_DISTANCE: 2 } })] } },
    SIMPLE: { Nom: "Tire", Arme: "Magie", Fatigue: 10, Initiative: 50,
              Composants: { actions: [act("EFF_TRACTION_MAGIQUE", 1)] } }
  };
  window.CACHE_COMPETENCES_GLOBAL = { H1: window.COMPETENCES_CACHE };
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
  window.COMBAT_INDEX_PERSO = 0;
  if (typeof window.appliquerTokensVTT === "function") window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
}, EFFETS_PAR_ID);

console.log("\n2. L'EXTRACTION GARDE LES CRANS");
{
  const ex = await p.evaluate(async () => {
    const r = (await window.demarrerCiblage("TRIPLE", { extraire: true, idLanceur: "H1" })) || {};
    const t = (r.alterations || []).find(a => a.estTraction) || {};
    return { crans: t.crans, parCran: t.chanceParCran, plafond: t.plafond, chance: t.chance, avant: !!t.avantAttaque };
  });
  verifier("3 crans, 15 % par cran, plafond 60 % ; chance d'ensemble 45 %, jouée avant l'attaque",
           ex.crans === 3 && ex.parCran === 15 && ex.plafond === 60 && ex.chance === 45 && ex.avant, JSON.stringify(ex));
}

console.log("\n3. LE CIBLAGE : TROIS CIBLES AU CHOIX");
await p.exposeFunction("__capture", () => p.screenshot({ path: "/tmp/claude-0/traction_repartie.png" }));
{
  const r = await p.evaluate(async () => {
    await window.demarrerCiblage("TRIPLE", { idLanceur: "H1" });
    const s = window.ETAT_CIBLAGE;
    const lire = () => ({ unique: s.cibleUnique, rep: { ...s.repartitionTraction }, ordre: [...s.ordreTraction],
      attaque: [...(s.attaques[0].cibles || [])], traction: [...((s.alterations.find(a => a.estTraction) || {}).cibles || [])],
      badges: Object.fromEntries([...document.querySelectorAll(".badge-traction")].map(b => [b.closest("[id^='token-']").id.replace("token-", ""), b.textContent])) });
    const etapes = {};
    window.__messages = [];
    window.ajouterCibleCiblage("M1"); window.ajouterCibleCiblage("M2"); window.ajouterCibleCiblage("M3");
    etapes.trois = lire();
    window.ajouterCibleCiblage("M4");
    etapes.quatrieme = { ...lire(), message: window.__messages.slice(-1)[0] };
    window.ajouterCibleCiblage("M1");          // plus de cran : M1 se retire
    etapes.retrait = lire();
    window.ajouterCibleCiblage("M2");          // un cran revenu : M2 passe à 2
    etapes.deux = lire();
    await window.__capture();
    // L'envoi, intercepté : une Traction par cible.
    window.regimeDemande = { actif: () => true, carte: async (id, charge) => { window.__envoi = charge; } };
    await window.declencherResolution();
    const envoi = window.__envoi || {};
    etapes.envoi = { tractions: (envoi.alterations || []).filter(a => a.estTraction).map(a => `${a.cibles.join()}:${a.chance}`),
                     attaque: ((envoi.attaques || [])[0] || {}).cibles };
    return etapes;
  });
  verifier("trois touchers : trois cibles à 15 %, l'attaque sur la première (M1)",
           JSON.stringify(r.trois.rep) === '{"M1":1,"M2":1,"M3":1}' && r.trois.unique === "M1"
           && JSON.stringify(r.trois.attaque) === '["M1"]' && JSON.stringify(r.trois.traction) === '["M1","M2","M3"]',
           JSON.stringify(r.trois));
  verifier("chaque cible tirée porte sa part (⚔️ sur celle qui prend l'attaque)",
           r.trois.badges.M1 === "⚔️ 🧲 15 %" && r.trois.badges.M2 === "🧲 15 %" && r.trois.badges.M3 === "🧲 15 %", JSON.stringify(r.trois.badges));
  verifier("une 4e cible : refusée, plus de cran à poser", !r.quatrieme.rep.M4 && /Plus de traction/.test(r.quatrieme.message || ""),
           r.quatrieme.message);
  verifier("retoucher M1 sans cran libre la retire : M2 devient la première (l'attaque passe sur elle)",
           !r.retrait.rep.M1 && r.retrait.unique === "M2" && JSON.stringify(r.retrait.attaque) === '["M2"]', JSON.stringify(r.retrait));
  verifier("retoucher M2 avec un cran libre : M2 à 30 %, M3 à 15 %",
           JSON.stringify(r.deux.rep) === '{"M2":2,"M3":1}' && r.deux.badges.M2 === "⚔️ 🧲 30 %" && r.deux.badges.M3 === "🧲 15 %",
           JSON.stringify(r.deux.badges));
  verifier("à l'envoi : une Traction par cible (M2 30 %, M3 15 %), l'attaque sur M2",
           JSON.stringify(r.envoi.tractions) === '["M2:30","M3:15"]' && JSON.stringify(r.envoi.attaque) === '["M2"]', JSON.stringify(r.envoi));
}

console.log("\n4. UN SEUL CRAN : RIEN NE CHANGE");
{
  const r = await p.evaluate(async () => {
    await window.demarrerCiblage("SIMPLE", { idLanceur: "H1" });
    const s = window.ETAT_CIBLAGE;
    window.ajouterCibleCiblage("M1");
    const a = { unique: s.cibleUnique, rep: Object.keys(s.repartitionTraction || {}).length };
    window.ajouterCibleCiblage("M2");
    const b = { unique: s.cibleUnique, cibles: [...s.alterations[0].cibles] };
    window.nettoyerCiblage();
    return { a, b };
  });
  verifier("un toucher choisit la cible, un autre la remplace (cible unique)", r.a.unique === "M1" && r.a.rep === 0
           && r.b.unique === "M2" && JSON.stringify(r.b.cibles) === '["M2"]', JSON.stringify(r));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
