// LA CLASSE ASSASSIN.
//
// Nico : « LVL1 : gagne un boost de 15 % de chance de critique pour 2 tours
// lorsqu'il met un ennemi KO. LV5 : COMP Assaut mortel. Maître des poisons
// (passif) : quand il empoisonne, baisse la fatigue de la cible de 18 % et
// enlève 10 % PV max, sur 2 tours. Assaut mortel : 0 de fatigue, une fois par
// combat, sur deux cibles adjacentes : 100 % d'empoisonnement + 10 dégâts
// physiques, INIT 100. »
// Ses réponses : paliers 1, 5 et 10 (le Maître des poisons au niveau 10) ;
// pas de cumul du bonus ; tout KO compte (poison et étalement compris) ; le
// poison du maître remplace l'ordinaire et mord « par tour » (18 % + 10 % à
// chaque fin de manche, 2 manches), dégâts magiques avec réductions ; il vaut
// pour tous ses poisons ; l'Assaut mortel se vise comme une zone de deux
// cases au contact, et empoisonne même si le coup est esquivé.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat, ETAT_INSTINCT_TUEUR } from '../combat_etat.js';
import { resoudreCarte, critiqueDe, POISON_MAITRE } from '../moteur_pur.js';
import { validerIntention, appliquerIntention, vieillirLesEtats, ticsDeFinDeManche } from '../cerveau_combat.js';
import { infligerOpportunite } from '../mouvement_pur.js';
import { misEnScene } from '../pont_combat.js';
import { creerRegime } from '../regime_cerveau.js';

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
const XP = { 1: 0, 4: 1800, 5: 2500, 9: 6400, 10: 7900 };

const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const assassin = (niveau, extra = {}) => fiche("S", { classe: "Assassin", xp: XP[niveau], ...extra });

// S (l'Assassin) en (0,0) ; M1 (1,0) et M2 (1,-1) au contact et côte à côte ;
// M4 (-1,0) au contact, de l'autre côté ; M3 (3,0) loin ; A (allié) en (0,1).
const monde = (niveau = 10, positions = {}) => {
    const fiches = [assassin(niveau), fiche("M1"), fiche("M2"), fiche("M3"), fiche("M4"), fiche("A")];
    const pos = { S: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 1, r: -1 }, M3: { q: 3, r: 0 },
                  M4: { q: -1, r: 0 }, A: { q: 0, r: 1 }, ...positions };
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: fiches, positions: pos,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["S", "M1", "M2", "M3", "M4", "A"];
    e.phase = "Resolution";
    return e;
};
const enTete = (e, id, carte) => { e.file = [{ id, carte, initiative: 100, pas: 0 }, { id: "M3", carte: "X", initiative: 10, pas: 0 }]; return e; };
const assaut = (cibles, extra = {}) => ({ id: "I" + Math.random(), type: "classe", acteur: "S", idCarte: "CLASSE_ASSAUT_MORTEL", cibles, ...extra });
// Une carte jouée par `lanceur` sur `cible` : dégâts, et des états qui prennent.
const lancer = (e, lanceur, cible, valeur, extra = {}) => resoudreCarte(e, {
    type: "carte", idLanceur: lanceur, idCarte: "C", critique: false,
    attaques: valeur > 0 ? [{ valeurBrute: valeur, typeRes: "Physique", cibles: [cible] }] : [],
    alterations: (extra.alterations || []).map(a => ({ ...a, cibles: [cible] })),
    jets: { attaqueRatee: false, parCible: { [cible]: { esquive: !!extra.esquive,
            etats: Object.fromEntries((extra.alterations || []).map(a => [a.nom, true])) } } } });
const POISON = { nom: "Empoisonnement", chance: 100, duree: 2, estPoison: true };
const instinct = (c) => (c.etats || []).find(x => x.nom === ETAT_INSTINCT_TUEUR);

console.log("\n=========================================================");
console.log("  L'ASSASSIN");
console.log("=========================================================");

// =========================================================================
console.log("\n1. LES PALIERS : 1, 5 ET 10");
// =========================================================================
{
    const a1 = w.atoutClasse(assassin(1)), a5 = w.atoutClasse(assassin(5)), a9 = w.atoutClasse(assassin(9)), a10 = w.atoutClasse(assassin(10));
    verifier("niveau 1 : +15 de critique sur KO, ni technique ni maître",
             a1.critiqueSurKO === 15 && !(a1.techniques || []).length && !a1.maitrePoisons, JSON.stringify(a1));
    verifier("niveau 5 : Assaut mortel", JSON.stringify(a5.techniques) === '["CLASSE_ASSAUT_MORTEL"]', JSON.stringify(a5.techniques));
    verifier("niveau 9 : pas encore maître des poisons", !a9.maitrePoisons);
    verifier("niveau 10 : maître des poisons (le bonus ne double pas)", a10.maitrePoisons === true && a10.critiqueSurKO === 15);
    const e = monde(10);
    verifier("en combat : l'atout est sur le combattant",
             e.combattants.S.atouts.critiqueSurKO === 15 && e.combattants.S.atouts.maitrePoisons === true
             && e.combattants.S.atouts.techniques.includes("CLASSE_ASSAUT_MORTEL"));
    verifier("et sur personne d'autre", e.combattants.A.atouts.critiqueSurKO === 0 && e.combattants.A.atouts.maitrePoisons === false);
    const carte = w.carteTechniqueClasse("CLASSE_ASSAUT_MORTEL");
    verifier("la carte : initiative 100, fatigue 0", carte.Initiative === 100 && carte.Fatigue === 0 && carte.Nom === "Assaut mortel");
}

// =========================================================================
console.log("\n2. INSTINCT DU TUEUR : +15 DE CRITIQUE, 2 MANCHES, SUR TOUT KO");
// =========================================================================
{
    const e = monde(1);
    const base = critiqueDe(e.combattants.S);
    const r = lancer(e, "S", "M1", 500);
    const s = r.etat.combattants.S;
    verifier("M1 tombe sous ses coups : l'Instinct du tueur, 2 manches",
             r.etat.combattants.M1.aTerre && instinct(s) && instinct(s).duree === 2, JSON.stringify(instinct(s)));
    verifier("+15 de critique", critiqueDe(s) === base + 15, `${base} → ${critiqueDe(s)}`);
    verifier("rejoué depuis le journal : même bonus", critiqueDe(appliquerEntree(e, { etapes: r.etapes }).combattants.S) === base + 15);

    const t = clonerEtat(r.etat);
    vieillirLesEtats(t);
    const encore = critiqueDe(t.combattants.S) === base + 15;
    vieillirLesEtats(t);
    verifier("il tient la manche du KO et la suivante, puis s'éteint", encore && critiqueDe(t.combattants.S) === base,
             String(critiqueDe(t.combattants.S)));

    const vieilli = clonerEtat(r.etat); vieillirLesEtats(vieilli);
    const second = lancer(vieilli, "S", "M2", 500).etat.combattants.S;
    verifier("un second KO relance la durée, sans cumul (une seule fois +15)",
             second.etats.filter(x => x.nom === ETAT_INSTINCT_TUEUR).length === 1 && instinct(second).duree === 2
             && critiqueDe(second) === base + 15, JSON.stringify(second.etats));

    const allie = lancer(monde(1), "S", "A", 500).etat.combattants.S;
    verifier("abattre un allié ne compte pas", !instinct(allie));
    const autre = lancer(monde(1), "A", "M1", 500).etat.combattants;
    verifier("un KO d'un autre héros ne lui donne rien", !instinct(autre.S) && !instinct(autre.A));

    // KO par son POISON, au tic de fin de manche.
    const p = lancer(monde(1, {}), "S", "M1", 0, { alterations: [POISON] }).etat;
    p.combattants.M1.pv = 3;
    p.file = [];
    const tics = ticsDeFinDeManche(p);
    verifier("son poison achève M1 en fin de manche : l'Instinct (3, vieillit juste après)",
             p.combattants.M1.aTerre && instinct(p.combattants.S) && instinct(p.combattants.S).duree === 3,
             JSON.stringify(instinct(p.combattants.S)));
    vieillirLesEtats(p);
    verifier("il vaut donc encore les 2 manches qui viennent", instinct(p.combattants.S) && instinct(p.combattants.S).duree === 2);
    verifier("l'étape dit qui a fait tomber M1", tics.some(x => x.type === "chute" && x.cible === "M1" && x.acteur === "S"));

    // KO par son ÉTALEMENT.
    const et = monde(1);
    et.combattants.M1.pv = 2;
    et.combattants.M1.etats = [{ nom: "Étalement", duree: 1, tics: [5], idSource: "S" }];
    et.file = [];
    ticsDeFinDeManche(et);
    verifier("son étalement achève M1 : l'Instinct aussi", et.combattants.M1.aTerre && !!instinct(et.combattants.S));

    const etale = resoudreCarte(monde(1), { type: "carte", idLanceur: "S", idCarte: "C", critique: false,
        attaques: [{ valeurBrute: 10, typeRes: "Physique", estEtalement: true, toursEtalement: 2, cibles: ["M1"] }],
        alterations: [], jets: { parCible: { M1: { esquive: false, etats: {} } } } }).etat;
    verifier("l'étalement retient qui l'a posé", (etale.combattants.M1.etats.find(x => x.nom === "Étalement") || {}).idSource === "S");

    // KO par une attaque d'opportunité.
    const o = monde(1);
    o.combattants.M1.pv = 1;
    infligerOpportunite(o, "M1", "S", { attaquant: "S", cible: "M1", evitee: false, montant: 8 }, { q: 1, r: 0 });
    verifier("une attaque d'opportunité qui achève : l'Instinct aussi", o.combattants.M1.aTerre && !!instinct(o.combattants.S));

    const scene = misEnScene({ type: "etats", cible: "S", pose: ETAT_INSTINCT_TUEUR, liste: r.etat.combattants.S.etats }, r.etat);
    verifier("l'écran sait montrer l'état posé", !!scene && scene.geste !== undefined, JSON.stringify(scene).slice(0, 80));
}

// =========================================================================
console.log("\n3. MAÎTRE DES POISONS (NIVEAU 10) : 18 % D'ÉNERGIE ET 10 % DES PV, À CHAQUE MANCHE, 2 MANCHES");
// =========================================================================
{
    const e = lancer(monde(10), "S", "M1", 0, { alterations: [POISON] }).etat;
    const p = e.combattants.M1.etats.find(x => x.nom === "Empoisonnement");
    verifier("le poison posé est celui du maître, 2 manches, signé S",
             !!p && p.maitre === true && p.duree === 2 && p.idSource === "S", JSON.stringify(p));
    e.file = [];
    ticsDeFinDeManche(e);
    const m1 = e.combattants.M1;
    verifier("1re fin de manche : -18 d'énergie, -10 PV", m1.fatigue === 82 && m1.pv === 90, `${m1.fatigue} / ${m1.pv}`);
    vieillirLesEtats(e);
    ticsDeFinDeManche(e);
    verifier("2e fin de manche : encore -18 et -10", m1.fatigue === 64 && m1.pv === 80, `${m1.fatigue} / ${m1.pv}`);
    vieillirLesEtats(e);
    ticsDeFinDeManche(e);
    verifier("puis il s'arrête", m1.fatigue === 64 && m1.pv === 80 && !m1.etats.some(x => x.nom === "Empoisonnement"),
             `${m1.fatigue} / ${m1.pv}`);
    verifier("les chiffres de la règle", POISON_MAITRE.energiePct === 18 && POISON_MAITRE.pvMaxPct === 10 && POISON_MAITRE.manches === 2);

    const mag = lancer(monde(10), "S", "M1", 0, { alterations: [POISON] }).etat;
    mag.combattants.M1.def.magique = 50;
    mag.file = [];
    ticsDeFinDeManche(mag);
    // Règle de Nico : le poison frappe désormais en dégâts BRUTS — la
    // défense magique ne le réduit plus.
    verifier("la part des PV est brute : défense magique 50 %, toujours -10", mag.combattants.M1.pv === 90, String(mag.combattants.M1.pv));

    const n9 = lancer(monde(9), "S", "M1", 0, { alterations: [POISON] }).etat;
    n9.file = [];
    ticsDeFinDeManche(n9); vieillirLesEtats(n9); ticsDeFinDeManche(n9);
    verifier("niveau 9 : le poison ordinaire (10 et 8, une seule fois)",
             n9.combattants.M1.fatigue === 90 && n9.combattants.M1.pv === 92, `${n9.combattants.M1.fatigue} / ${n9.combattants.M1.pv}`);

    const autre = lancer(monde(10), "A", "M1", 0, { alterations: [POISON] }).etat;
    verifier("le poison d'un autre héros reste ordinaire", !autre.combattants.M1.etats.find(x => x.nom === "Empoisonnement").maitre);

    const rejoue = appliquerEntree(monde(10), { etapes: lancer(monde(10), "S", "M1", 0, { alterations: [POISON] }).etapes });
    verifier("rejoué depuis le journal : poison de maître", rejoue.combattants.M1.etats.find(x => x.nom === "Empoisonnement").maitre === true);
}

// =========================================================================
console.log("\n4. ASSAUT MORTEL : UNE ZONE DE DEUX CASES AU CONTACT, 10 PHYSIQUES + POISON À COUP SÛR");
// =========================================================================
{
    const e = enTete(monde(5), "S", "CLASSE_ASSAUT_MORTEL");
    const ok = (cibles) => validerIntention(e, assaut(cibles));
    verifier("M1 et M2 (au contact, côte à côte) : accepté", ok(["M1", "M2"]).ok, ok(["M1", "M2"]).raison);
    verifier("un seul ennemi : accepté", ok(["M1"]).ok);
    verifier("un ennemi loin : refusé", !ok(["M1", "M3"]).ok, ok(["M1", "M3"]).raison);
    verifier("deux ennemis au contact mais pas côte à côte : refusé", !ok(["M1", "M4"]).ok, ok(["M1", "M4"]).raison);
    verifier("un allié : refusé", !ok(["A"]).ok);
    verifier("trois cibles, ou aucune : refusé", !ok(["M1", "M2", "M4"]).ok && !ok([]).ok);
    verifier("niveau 4 : il ne l'a pas", !validerIntention(enTete(monde(4), "S", "CLASSE_ASSAUT_MORTEL"), assaut(["M1"])).ok);

    // Le poste ne décide que des cibles : des dégâts trafiqués sont ignorés.
    const pas = appliquerIntention(e, assaut(["M1", "M2"], { attaques: [{ valeurBrute: 999 }] }));
    const c = pas.etat.combattants;
    verifier("10 dégâts physiques à chacun", c.M1.pv === 90 && c.M2.pv === 90, `${c.M1.pv} / ${c.M2.pv}`);
    verifier("et l'empoisonnement à chacun", ["M1", "M2"].every(id => c[id].etats.some(x => x.nom === "Empoisonnement")));
    verifier("niveau 5 : poison ordinaire", !c.M1.etats.find(x => x.nom === "Empoisonnement").maitre);
    verifier("technique marquée « utilisée », tour clos, aucune énergie",
             c.S.techniquesUtilisees.includes("CLASSE_ASSAUT_MORTEL") && pas.etat.file[0].id === "M3" && c.S.fatigue === 100);
    verifier("l'état reste cohérent", verifierEtatCombat(pas.etat).length === 0, verifierEtatCombat(pas.etat).join(" | "));
    const rejoue = appliquerEntree(e, pas.entree).combattants;
    verifier("rejoué depuis le journal : mêmes PV, mêmes poisons",
             rejoue.M1.pv === 90 && rejoue.M2.pv === 90 && rejoue.M2.etats.some(x => x.nom === "Empoisonnement"));
    const encore = enTete(clonerEtat(pas.etat), "S", "CLASSE_ASSAUT_MORTEL");
    verifier("une seconde fois dans le combat : refusée", !validerIntention(encore, assaut(["M1"])).ok);

    const esq = enTete(monde(5), "S", "CLASSE_ASSAUT_MORTEL");
    esq.combattants.M1.def.esquive = 100;
    const pe = appliquerIntention(esq, assaut(["M1", "M2"])).etat.combattants;
    verifier("M1 esquive : pas de dégâts, mais empoisonné quand même",
             pe.M1.pv === 100 && pe.M1.etats.some(x => x.nom === "Empoisonnement") && pe.M2.pv === 90, `${pe.M1.pv}`);

    const arm = enTete(monde(5), "S", "CLASSE_ASSAUT_MORTEL");
    arm.combattants.M1.def.physique = 50;
    verifier("l'armure réduit les 10 dégâts (50 % → 5)", appliquerIntention(arm, assaut(["M1"])).etat.combattants.M1.pv === 95);

    const n10 = enTete(monde(10), "S", "CLASSE_ASSAUT_MORTEL");
    const p10 = appliquerIntention(n10, assaut(["M1"])).etat.combattants.M1.etats.find(x => x.nom === "Empoisonnement");
    verifier("niveau 10 : l'Assaut pose le poison du maître", !!p10 && p10.maitre === true);

    const faible = enTete(monde(5), "S", "CLASSE_ASSAUT_MORTEL");
    faible.combattants.M1.pv = 5;
    const tue = appliquerIntention(faible, assaut(["M1"])).etat.combattants;
    verifier("un KO à l'Assaut mortel donne l'Instinct du tueur", tue.M1.aTerre && !!instinct(tue.S));

    const scene = misEnScene({ type: "techniqueClasse", acteur: "S", idCarte: "CLASSE_ASSAUT_MORTEL" }, e);
    verifier("à l'écran : « 🗡️ Assaut mortel » sur le pion", scene.geste === "message" && /Assaut mortel/.test(scene.texte));
}

// =========================================================================
console.log("\n4 bis. LA DEMANDE PART AU CERVEAU AVEC SES CIBLES");
// =========================================================================
{
    const ecrits = [];
    const regime = creerRegime({ io: { lot: async (ops) => { ecrits.push(...ops); } }, idPartie: "P", poste: "P_1" });
    await regime.demanderTechniqueClasse("S", "CLASSE_ASSAUT_MORTEL", null, ["M1", "M2"]);
    const d = (ecrits[0] || {}).data || {};
    verifier("l'intention « classe » écrite porte les deux ennemis",
             d.type === "classe" && d.idCarte === "CLASSE_ASSAUT_MORTEL" && JSON.stringify(d.cibles) === '["M1","M2"]',
             JSON.stringify(d).slice(0, 160));
}

// =========================================================================
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

// =========================================================================
console.log("\n5. EN COMBAT : L'ASSAUT MORTEL SE VISE COMME UNE ZONE DE DEUX CASES");
// =========================================================================
{
  const r = await p.evaluate(async (EFFETS) => {
    window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
    document.getElementById("fenetre-combat").style.display = "block";
    window.jouerSonClic = () => {};
    window.PLATEAU_VTT = { getCaseState: () => ({}), hexToPixel: (q, r) => ({ x: 300 + q * 60, y: 300 + r * 60 }),
                           pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {} };
    window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
    window.PERSOS_PARTIE = [
      { idPersonnage: "S1", camp: "Allié", prenom: "Ombre", classe: "Assassin", xp: 2500,
        PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 100, fatigueActuelle: 100, Etats_Alteres: [], statut: "Vivant" },
      { idPersonnage: "M1", camp: "Ennemi", estMonstre: true, prenom: "Gnoll", PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" },
      { idPersonnage: "M2", camp: "Ennemi", estMonstre: true, prenom: "Chacal", PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" },
      { idPersonnage: "A1", camp: "Allié", prenom: "Cybile", PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }
    ];
    window.TOKENS_VTT_DATA = { S1: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 1, r: -1 }, A1: { q: 0, r: 1 } };
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
    window.COMBAT_INDEX_PERSO = 0;
    window.COMPETENCES_CACHE = {};
    window.CACHE_COMPETENCES_GLOBAL = { S1: {} };
    window.CHEMIN_MOUVEMENT = []; window.ZONES_PERSISTANTES = {};
    const demandes = [];
    window.regimeDemande = { actif: () => true, enVol: () => false,
                             techniqueClasse: (a, id, cible, cibles) => { demandes.push([a, id, cible || null, cibles || null]); } };

    window.lancerTechniqueClasse("CLASSE_ASSAUT_MORTEL", "S1");
    await new Promise(r => setTimeout(r, 150));
    const st = window.ETAT_CIBLAGE || {};
    const ciblage = { zone: !!st.isZone, cases: (st.zoneHexesBase || []).length, technique: st.techniqueClasse,
                      centre: st.zoneCenterHex };
    // La zone, tournée vers M1 et M2 (pas de rotation : (1,0) et (1,-1)).
    st.zoneRotationStep = 0;
    window.validerZoneAoE();
    const apres = !!(window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif);

    // Puis tournée d'un cran vers l'allié : seul l'ennemi part.
    window.TOKENS_VTT_DATA = { S1: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 5, r: 5 }, A1: { q: 1, r: -1 } };
    window.lancerTechniqueClasse("CLASSE_ASSAUT_MORTEL", "S1");
    await new Promise(r => setTimeout(r, 150));
    window.ETAT_CIBLAGE.zoneRotationStep = 0;
    window.validerZoneAoE();

    // Personne dans la zone : on le dit, rien ne part.
    const alertes = []; window.alert = (m) => alertes.push(m);
    window.TOKENS_VTT_DATA = { S1: { q: 0, r: 0 }, M1: { q: 4, r: 0 }, M2: { q: 5, r: 5 }, A1: { q: 0, r: 1 } };
    window.lancerTechniqueClasse("CLASSE_ASSAUT_MORTEL", "S1");
    await new Promise(r => setTimeout(r, 150));
    window.validerZoneAoE();
    const resteOuvert = !!(window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif);
    if (typeof window.nettoyerCiblage === "function") window.nettoyerCiblage();
    return { ciblage, apres, demandes, alertes, resteOuvert };
  }, EFFETS_PAR_ID);
  verifier("le lancement ouvre un ciblage de zone de deux cases au contact",
           r.ciblage.zone && r.ciblage.cases === 2 && r.ciblage.technique === "CLASSE_ASSAUT_MORTEL"
           && r.ciblage.centre && r.ciblage.centre.q === 0 && r.ciblage.centre.r === 0, JSON.stringify(r.ciblage));
  verifier("valider : la technique part avec les deux ennemis de la zone, le ciblage se ferme",
           JSON.stringify(r.demandes[0]) === '["S1","CLASSE_ASSAUT_MORTEL",null,["M1","M2"]]' && !r.apres, JSON.stringify(r.demandes[0]));
  verifier("un allié dans la zone n'est pas visé", JSON.stringify(r.demandes[1]) === '["S1","CLASSE_ASSAUT_MORTEL",null,["M1"]]',
           JSON.stringify(r.demandes[1]));
  verifier("zone vide : un message, rien n'est envoyé, on peut tourner la zone",
           r.demandes.length === 2 && r.alertes.length === 1 && /Aucun ennemi/.test(r.alertes[0]) && r.resteOuvert, JSON.stringify(r.alertes));
}

// =========================================================================
console.log("\n6. LA FICHE PERSO ET LA FICHE DE CLASSE");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    document.getElementById("fenetre-combat").style.display = "none";
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
    const fiche = document.getElementById("fenetre-fiche-perso");
    fiche.style.display = "flex";
    document.getElementById("champ-id-personnage").value = "S1";
    window.PERSOS_PARTIE = [{ idPersonnage: "S1", prenom: "Ombre", classe: "Assassin", xp: 2500, couleur: "#335", deckEquipe: [], PV_Max: 40 }];
    window.PERSOS_JOUEURS_PARTIE = window.PERSOS_PARTIE;
    window.CACHE_COMPETENCES_GLOBAL = { S1: {} };
    await window.chargerOngletCompetences("S1", 6);
    const techniques = [...document.querySelectorAll(".technique-classe")].map(x => [x.dataset.technique, x.dataset.statut]);

    fiche.style.display = "none";
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    await window.ouvrirChoixClasse();
    window.ouvrirFicheClasse("CLASSE_ASSASSIN");
    const d = document.getElementById("descriptif-fiche-classe");
    return { techniques, visible: getComputedStyle(d).display !== "none",
             niveaux: [...d.querySelectorAll(".palier-classe-niveau")].map(x => x.textContent.trim()), texte: d.textContent };
  });
  await p.screenshot({ path: "/tmp/claude-0/assassin_classe.png" });
  verifier("fiche perso niveau 5 : Assaut mortel dans les techniques de classe",
           JSON.stringify(r.techniques) === '[["CLASSE_ASSAUT_MORTEL","Une fois par combat"]]', JSON.stringify(r.techniques));
  verifier("fiche de classe : présentation et paliers Niv. 1 / 5 / 10",
           r.visible && JSON.stringify(r.niveaux) === '["Niv. 1","Niv. 5","Niv. 10"]', JSON.stringify(r.niveaux));
  verifier("Instinct du tueur, Assaut mortel, Maître des poisons y sont dits",
           /Instinct du tueur/.test(r.texte) && /Assaut mortel/.test(r.texte) && /Maître des poisons/.test(r.texte));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
