// LE SAIGNEMENT, ET LE GRIMOIRE MIS À JOUR DES NOUVELLES RÈGLES.
//
// Nico : « nouvel effet : Saignement, pt 1, FORCE, 15 % de chance d'appliquer
// saignement (max 75 %), dure 2 tours. Inflige 8 % de dégâts physiques des PV
// max de la cible ; le déplacement coûte 2 fatigue de plus par hexagone. » Et :
// « regarde que le tableau dans effets de combat est bien à jour aussi avec
// tous ces changements. » Le jeu n'écrit jamais seul dans le grimoire : un
// bouton (provisoire) le propose au MJ, sur confirmation.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat } from '../combat_etat.js';
import { SAIGNEMENT, ETAT_SAIGNEMENT, POISON_MAITRE, CASES_AVEUGLEES, CONFUSION_TRAVERS, CONFUSION_FUITE,
         CONFUSION_DISSIPEE, resoudreCarte } from '../moteur_pur.js';
import { ticsDeFinDeManche, vieillirLesEtats } from '../cerveau_combat.js';
import { coutDuPas, planifierTrajet, CHANCE_REPLI_OPPORTUNITE } from '../mouvement_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

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
const monde = (extraH = {}) => {
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: [fiche("H", extraH), fiche("M1")],
        positions: { H: { q: 0, r: 0 }, M1: { q: 5, r: 0 } }, partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["H", "M1"]; e.phase = "Resolution";
    return e;
};
const SAIGNE = { nom: ETAT_SAIGNEMENT, duree: 2 };

console.log("\n1. LA RÈGLE : 8 % DES PV MAX EN PHYSIQUE À CHAQUE MANCHE, +2 PAR CASE");
{
    verifier("8 %, physique, +2 de fatigue par case", SAIGNEMENT.pvMaxPct === 8 && SAIGNEMENT.typeRes === "Physique" && SAIGNEMENT.coutDeplacement === 2);
    const e = monde(); e.combattants.H.etats = [{ ...SAIGNE }];
    ticsDeFinDeManche(e);
    verifier("1re fin de manche : -8 PV (100 → 92)", e.combattants.H.pv === 92, `${e.combattants.H.pv}`);
    vieillirLesEtats(e); ticsDeFinDeManche(e);
    verifier("2e : encore -8 (84)", e.combattants.H.pv === 84, `${e.combattants.H.pv}`);
    vieillirLesEtats(e); ticsDeFinDeManche(e);
    verifier("puis il s'arrête (2 tours)", e.combattants.H.pv === 84 && !e.combattants.H.etats.some(x => x.nom === ETAT_SAIGNEMENT));
    const arm = monde({ Def_Physique: 50 }); arm.combattants.H.etats = [{ ...SAIGNE }]; ticsDeFinDeManche(arm);
    verifier("l'armure réduit (50 % → -4)", arm.combattants.H.pv === 96, `${arm.combattants.H.pv}`);
    const mag = monde({ Def_Magique: 50 }); mag.combattants.H.etats = [{ ...SAIGNE }]; ticsDeFinDeManche(mag);
    verifier("la défense magique, non (-8)", mag.combattants.H.pv === 92, `${mag.combattants.H.pv}`);
    const bou = monde({ Bouclier_Actuel: 20, Bouclier_Max: 20 }); bou.combattants.H.etats = [{ ...SAIGNE }];
    const et = ticsDeFinDeManche(bou);
    verifier("le bouclier encaisse d'abord", bou.combattants.H.pv === 100 && bou.combattants.H.bouclier === 12);
    verifier("le tic porte son nom", et.some(x => x.tic === ETAT_SAIGNEMENT));
}

console.log("\n2. CHAQUE CASE COÛTE 2 DE PLUS");
{
    const e = monde(); const H = e.combattants.H;
    const sain = [1, 2, 4, 7].map(n => coutDuPas(H, n, false, false));
    H.etats = [{ ...SAIGNE }];
    const saigne = [1, 2, 4, 7].map(n => coutDuPas(H, n, false, false));
    verifier("cases 1, 2, 4, 7 : 2/2/4/6 → 4/4/6/8", JSON.stringify(sain) === "[2,2,4,6]" && JSON.stringify(saigne) === "[4,4,6,8]",
             `${sain} → ${saigne}`);
    verifier("sur un sol difficile : 4 + 2 = 6", coutDuPas(H, 1, true, false) === 6);
    H.etats = [{ ...SAIGNE }, { nom: "Glacé", duree: 2 }];
    verifier("Glacé ET saignant : 2 × 2 + 2 = 6", coutDuPas(H, 1, false, false) === 6);
    const vargen = monde({ race: "Vargen" }); vargen.combattants.H.etats = [{ ...SAIGNE }];
    verifier("un Vargen (÷2) : 1 + 2 = 3 — la plaie coûte autant au prédateur", coutDuPas(vargen.combattants.H, 1, false, false) === 3,
             `${coutDuPas(vargen.combattants.H, 1, false, false)}`);
    const t = monde(); t.combattants.H.etats = [{ ...SAIGNE }];
    const trajet = planifierTrajet(t, "H", [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }], null, {});
    verifier("un trajet de 3 cases : 4 + 4 + 4 = 12", trajet.cout === 12, `${trajet.cout}`);
    const src = fs.readFileSync('/home/user/Ivalis/mouvement.js', 'utf8');
    verifier("l'aperçu du chemin (mouvement.js) dit la même chose", /estSaignant\) baseCost \+= 2/.test(src));
}

console.log("\n3. LES AUTRES RÈGLES DE CETTE SÉRIE");
{
    verifier("maître des poisons : 9 % des PV max", POISON_MAITRE.pvMaxPct === 9);
    verifier("aveuglement : 4 cases", CASES_AVEUGLEES === 4);
    verifier("confusion : 40 / 20 / 20 (+ 20 de rien)", CONFUSION_TRAVERS === 40 && CONFUSION_FUITE === 20 && CONFUSION_DISSIPEE === 20);
    verifier("repli : toutes les attaques d'opportunité évitées", CHANCE_REPLI_OPPORTUNITE === 100);
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
  export const doc = (_db, ...s) => ({ chemin: s.join("/"), col: s[0], id: s[s.length - 1] });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async (ref) => { const d = (window.__docs || {})[ref.chemin]; return { exists: () => !!d, data: () => d || {} }; };
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data, options }); (window.__docs = window.__docs || {})[ref.chemin] = JSON.parse(JSON.stringify(data)); };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data }); const d = (window.__docs = window.__docs || {}); d[ref.chemin] = { ...(d[ref.chemin] || {}), ...data }; };
  export const deleteDoc = async (ref) => { (window.__effaces = window.__effaces || []).push(ref.chemin); delete (window.__docs || {})[ref.chemin]; };
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
const HACHE = { nom: "Hache à deux mains", modele: "Hache à deux mains", type: "Arme lourde CAC", uid: "U1",
                deuxMains: true, image: "https://res.cloudinary.com/x/hache.png" };
const PERSO = { Prenom_Personnage: "Aelis", Race: "Elfe", Genre: "Femme", Classe: "Hoplite", XP: 0,
                URL_Cloudinary: "https://res.cloudinary.com/x/ref.png", URL_Avatar_Equipe: "https://res.cloudinary.com/x/avatar.png",
                Equip_Main_Droite: HACHE, Equip_Main_Gauche: HACHE };

await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(1500);

console.log("\n4. LA FORGE : LE SAIGNEMENT POUR TOUS, ET SON ÉTAT SUR LA CARTE");
{
  const r = await p.evaluate(async ({ EFFETS }) => {
    window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
    delete window.EFFETS_BDD_CACHE.EFF_SAIGNEMENT;
    window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
    window.__docs = { "Personnages/P1": { Classe: "", XP: 0, Race: "Humain" }, "Caracteristiques/P1": { force: 14 } };
    document.getElementById("champ-id-personnage").value = "P1";
    window.OUVERTURE_FORGE_EN_COURS = false;
    await window.ouvrirCreationCompetence();
    const s = window.forgeState.effetsBDD.find(e => e.id === "EFF_SAIGNEMENT");
    window.fermerForgeCompetence();
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", camp: "Allié", prenom: "Ama", PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }];
    window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 } };
    window.COMPETENCES_CACHE = { S1: { Nom: "Entaille", Arme: "Arme lourde CAC", Fatigue: 10, Initiative: 70,
      Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_LOURDE", count: 1, mods: { EFF_SAIGNEMENT: 2 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } } };
    window.CACHE_COMPETENCES_GLOBAL = { H1: window.COMPETENCES_CACHE };
    const ex = (await window.demarrerCiblage("S1", { extraire: true, idLanceur: "H1" })) || {};
    return { forge: s && { type: s.Type_Mecanique, mod: s.Modificateur }, alt: (ex.alterations || []).find(a => a.nom === "Saignement") };
  }, { EFFETS: EFFETS_PAR_ID });
  verifier("le Saignement est dans la Forge de n'importe quel héros (sous-effet Physique, Force)",
           r.forge && r.forge.type === "Physique" && r.forge.mod === "FORCE", JSON.stringify(r.forge));
  verifier("deux crans : 30 % de chance, 2 tours, avec son icône",
           r.alt && r.alt.chance === 30 && r.alt.duree === 2 && /^data:image\/svg/.test(r.alt.icone || ""), JSON.stringify(r.alt).slice(0, 160));
}

console.log("\n5. LE GRIMOIRE (Combat_Effets) MIS À JOUR, SUR CONFIRMATION DU MJ");
{
  const r = await p.evaluate(async () => {
    window.__ecrits = [];
    window.__docs = {};                    // EFF_SAIGNEMENT absent de la base
    let demande = "";
    window.confirm = (m) => { demande = m; return true; };
    window.alert = () => {};
    window.chargerTableauEffets = async () => {};
    const ok = await window.mettreAJourGrimoireRegles();
    const bouton = document.getElementById("btn-maj-grimoire");
    return { ok, demande, ecrits: window.__ecrits, bouton: !!bouton && bouton.closest("#etape-gestion-effets") !== null };
  });
  const par = Object.fromEntries(r.ecrits.map(e => [e.chemin.split("/").pop(), e]));
  verifier("le bouton est dans l'écran du Grimoire du moteur", r.bouton);
  verifier("le MJ voit la liste avant toute écriture", /EFF_SAIGNEMENT \(ajouté\)/.test(r.demande) && /EFF_CONFUSION/.test(r.demande), r.demande.slice(0, 120));
  verifier("7 effets écrits, toujours en « merge » (seuls les champs listés)", r.ok === 7 && r.ecrits.every(e => e.options && e.options.merge === true),
           Object.keys(par).join(","));
  const notes = (id) => ((par[id] || {}).data || {});
  verifier("Empoisonnement : bruts, et le maître à 9 %", /dégâts bruts/.test(notes("EFF_EMPOISONNEMENT").Notes) && /9 % des PV max/.test(notes("EFF_EMPOISONNEMENT").Notes));
  verifier("Brûlé : dégâts magiques, défense magique appliquée", /dégâts magiques \(défense magique appliquée\)/.test(notes("EFF_BRULE").Notes));
  verifier("Confusion : 40 / 20 / 20 / 20", /40 %/.test(notes("EFF_CONFUSION").Notes) && /allié/.test(notes("EFF_CONFUSION").Notes)
           && (notes("EFF_CONFUSION").Notes.match(/20 %/g) || []).length === 3);
  verifier("Aveuglement : 4 hexagones", /4 hexagones/.test(notes("EFF_AVEUGLEMENT").Notes));
  verifier("Repli : évite toutes les attaques d'opportunité, plus de 60 %",
           /évite toutes les attaques d'opportunité/.test(notes("EFF_REPLI").Effet_Base) && !/60/.test(notes("EFF_REPLI").Notes));
  verifier("Vampirisme : marqué retiré (Baiser du vampire)", /Baiser du vampire/.test(notes("EFF_VAMPIRISME").Notes));
  const s = notes("EFF_SAIGNEMENT");
  verifier("Saignement ajouté en entier (Force, 1 pt, 15/75, 2 tours, physique, 8 %, +2)",
           s.Nom === "Saignement" && s.Modificateur === "FORCE" && s.Cout_PT === "1" && s.Pourcent_Base === 15 && s.Pourcent_Max === 75
           && s.Tours === 2 && s.Type_Mecanique === "Physique" && /8%/.test(s.Notes) && /2 de fatigue/.test(s.Notes), JSON.stringify(s).slice(0, 120));
  const deja = await p.evaluate(async () => {
    window.__ecrits = []; window.__docs = { "Combat_Effets/EFF_SAIGNEMENT": { Nom: "Saignement (retouché)" } };
    await window.mettreAJourGrimoireRegles();
    return window.__ecrits.map(e => e.chemin);
  });
  verifier("un Saignement déjà en base n'est pas écrasé", !deja.includes("Combat_Effets/EFF_SAIGNEMENT") && deja.length === 6, deja.join(","));
  const refuse = await p.evaluate(async () => { window.__ecrits = []; window.confirm = () => false; await window.mettreAJourGrimoireRegles(); return window.__ecrits.length; });
  verifier("le MJ refuse : rien n'est écrit", refuse === 0);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
