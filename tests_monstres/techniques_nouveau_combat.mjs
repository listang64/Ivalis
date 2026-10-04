// ENCHAÎNER LES COMBATS SANS RECHARGER : LES TECHNIQUES DE CLASSE REVIENNENT.
//
// Signalé en partie : « l'Assaut mortel n'avait pas été utilisé et il a été
// grisé tout du long » — après un premier combat où il avait servi, sans
// recharger la page. Les techniques jouées descendent sur les fiches en
// mémoire (techniquesUtilisees) et y restaient d'une rencontre à l'autre.
//
// Ce banc vérifie, sur la vraie page :
//   • la bannière lit l'état du combat EN COURS, pas la fiche : une fiche qui
//     traîne la technique d'avant ne la grise plus ;
//   • jouée dans CE combat, elle est grisée ; jouée dans une AUTRE rencontre
//     (état d'avant pas encore remplacé), elle ne l'est pas ;
//   • oublierLeCombatSurLesFiches vide les fiches, et il est appelé à la
//     réinitialisation et à l'ouverture d'une nouvelle rencontre.
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

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

const scenario = (fiche, etat, rencontre) => p.evaluate(({ fiche, etat, rencontre }) => {
  document.getElementById("fenetre-combat").style.display = "block";
  window.jouerSonClic = () => {};
  window.PERSOS_PARTIE = [
    { idPersonnage: "S", prenom: "Rine", classe: "Assassin", xp: 7900, couleur: "#335", camp: "Allié", idJoueur: "P_01",
      deckEquipe: ["C1"], PV_Max: 50, PV_Actuels: 50, Fatigue_Max: 100, fatigueActuelle: 60, ...fiche },
    { idPersonnage: "M1", prenom: "Gnoll", camp: "Ennemi", estMonstre: true, PV_Max: 40, PV_Actuels: 40 }
  ];
  window.TOKENS_VTT_DATA = { S: { q: 0, r: 0 }, M1: { q: 1, r: 0 } };
  window.CACHE_COMPETENCES_GLOBAL = { S: { C1: { Nom: "Coup", Arme: "", Initiative: 40, Fatigue: 10, Effets_Compiles: [] } } };
  window.COMPETENCES_CACHE = {};
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]]; window.COMBAT_INDEX_PERSO = 0;
  window.COMBAT_FATIGUE_ACTUELLE = 60;
  window.PARTIE_DATA = { Phase_Combat: "Preparation", File_Attente_Combat: [], ID_Rencontre: rencontre };
  window.ID_PARTIE_COURANTE = "P";
  window.regimeDemande = { ...(window.regimeDemande || {}), actif: () => !!etat, enVol: () => false, etat: () => etat };
  const lire = () => {
    const b = document.getElementById("combat-carte-CLASSE_ASSAUT_MORTEL");
    return b ? b.classList.contains("banniere-epuisee") : null;
  };
  window.chargerCompetencesCombat("S", "#335");
  const auChargement = lire();
  window.actualiserBannieresEpuisees();
  return { auChargement, apresActualisation: lire(),
           utilisee: window.techniqueClasseUtilisee(window.PERSOS_PARTIE[0], "CLASSE_ASSAUT_MORTEL") };
}, { fiche, etat, rencontre });

const etatDe = (combat, utilisees) => ({ combat, combattants: { S: { id: "S", techniquesUtilisees: utilisees }, M1: { id: "M1" } } });

console.log("1. LA FICHE TRAÎNE LA TECHNIQUE DU COMBAT D'AVANT, L'ÉTAT EST NEUF");
{
  const r = await scenario({ techniquesUtilisees: ["CLASSE_ASSAUT_MORTEL"] }, etatDe("R2", undefined), "R2");
  verifier("la bannière n'est pas grisée au chargement du volet", r.auChargement === false, JSON.stringify(r));
  verifier("ni après une actualisation", r.apresActualisation === false);
  verifier("la technique n'est pas « déjà utilisée »", r.utilisee === false);
}

console.log("\n2. JOUÉE DANS CE COMBAT : GRISÉE");
{
  const r = await scenario({}, etatDe("R2", ["CLASSE_ASSAUT_MORTEL"]), "R2");
  verifier("grisée au chargement et après actualisation", r.auChargement === true && r.apresActualisation === true, JSON.stringify(r));
  verifier("« déjà utilisée »", r.utilisee === true);
}

console.log("\n3. L'ÉTAT EST CELUI D'UNE AUTRE RENCONTRE : RIEN N'A SERVI DANS CELLE-CI");
{
  const r = await scenario({ techniquesUtilisees: ["CLASSE_ASSAUT_MORTEL"] }, etatDe("R1", ["CLASSE_ASSAUT_MORTEL"]), "R2");
  verifier("pas grisée", r.auChargement === false && r.apresActualisation === false, JSON.stringify(r));
}

console.log("\n4. LES FICHES SONT VIDÉES À LA RÉINITIALISATION ET À L'OUVERTURE");
{
  const r = await p.evaluate(() => {
    window.PERSOS_PARTIE = [{ idPersonnage: "S", techniquesUtilisees: ["CLASSE_ASSAUT_MORTEL"], sursis: { tours: 2 } },
                            { idPersonnage: "M1", estMonstre: true }];
    window.MONSTRES_PARTIE = [{ idPersonnage: "M1", techniquesUtilisees: ["X"] }];
    window.COMBAT_PERSOS_JOUEUR = [{ idPersonnage: "S", techniquesUtilisees: ["CLASSE_ASSAUT_MORTEL"] }];
    if (typeof window.oublierLeCombatSurLesFiches !== "function") return { absente: true };
    window.oublierLeCombatSurLesFiches();
    return { s: window.PERSOS_PARTIE[0], m: window.MONSTRES_PARTIE[0], j: window.COMBAT_PERSOS_JOUEUR[0] };
  });
  verifier("oublierLeCombatSurLesFiches existe dans la page", !r.absente);
  verifier("héros : techniques et sursis effacés",
           r.s && JSON.stringify(r.s.techniquesUtilisees) === "[]" && r.s.sursis === null, JSON.stringify(r.s));
  verifier("créatures et liste du poste aussi",
           r.m && JSON.stringify(r.m.techniquesUtilisees) === "[]" && JSON.stringify(r.j.techniquesUtilisees) === "[]");
  const src = fs.readFileSync(new URL('../regime_cerveau.js', import.meta.url), 'utf8');
  const fermer = src.slice(src.indexOf("window.regimeFermerLeCombat = async function() {"));
  verifier("appelé à la réinitialisation (regimeFermerLeCombat)",
           /^window\.regimeFermerLeCombat = async function\(\) \{\s*window\.oublierLeCombatSurLesFiches\(\);/.test(fermer));
  const ouvrir = src.slice(src.indexOf("if (!memeCombat) {"), src.indexOf("REGIME.ouvrir(sourceDuJeu())"));
  verifier("appelé à l'ouverture d'une nouvelle rencontre", /window\.oublierLeCombatSurLesFiches\(\)/.test(ouvrir));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
