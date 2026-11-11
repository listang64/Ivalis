// v351 — LA REFONTE DES CLASSES : LE MÉDICUS.
// Nico : « niveau 1 : régénération naturelle +5 %, +1 compétence, +1 soin sur les sorts de
// soins. Niveau 3 : +1 soin sur les sorts de soins, +5 % d'esquive. Niveau 5 : Soin d'urgence,
// +1 aux soins. Niveau 9 : Prise en charge par Médicus (réanime un allié adjacent KO avec 40 %
// de PV, repousse d'un hexagone tous les ennemis adjacents à l'allié, INIT 0 ; réserve 20
// pendant 2 tours pour le Médicus et le joueur réanimé). » Ses réponses : la réserve dès le
// lancement ; elle ne se relâche pas ; le Soin d'urgence reste à 12 ; « +1 aux soins » est le
// même bonus (+3 en tout). (Le reste de la classe : medicus.mjs.)
//
// Lancer : node tests_monstres/corrections_v351.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat , creerDes } from '../combat_etat.js';
import { SOIN_URGENCE , reserveMaintenueDe, PART_REANIMATION } from '../moteur_pur.js';
import { validerIntention, appliquerIntention, regenererFinDeManche , cloturerTour, ouvrirManche } from '../cerveau_combat.js';
import { misEnScene } from '../pont_combat.js';

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
const XP = { 1: 0, 2: 700, 3: 1200, 4: 1800, 5: 2500, 8: 5200, 9: 6400, 10: 7900 };

const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0, Regeneration: 35,
    PV_Max: 100, PV_Actuels: 50, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const medicus = (niveau, extra = {}) => fiche("D", { classe: "Médicus", xp: XP[niveau], ...extra });

// D (le Médicus) en (0,0) ; A (allié KO) en (1,0) ; B (allié debout, loin) en
// (5,0) ; M1 (2,0) et M2 (1,1) entourent A ; M3 loin.
const monde = (niveau = 10, positions = {}, extras = {}) => {
    const fiches = [medicus(niveau, extras.D), fiche("A", { PV_Actuels: 0, ...(extras.A || {}) }), fiche("B", extras.B),
                    fiche("M1"), fiche("M2"), fiche("M3")];
    const pos = { D: { q: 0, r: 0 }, A: { q: 1, r: 0 }, B: { q: 5, r: 0 }, M1: { q: 2, r: 0 }, M2: { q: 1, r: 1 },
                  M3: { q: 6, r: -3 }, ...positions };
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: fiches, positions: pos,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["D", "A", "B", "M1", "M2", "M3"];
    e.phase = "Resolution";
    return e;
};
const enTete = (e, carte) => { e.file = [{ id: "D", carte, initiative: 70, pas: 0 }, { id: "M3", carte: "X", initiative: 10, pas: 0 }]; return e; };
const intention = (idCarte, cible) => ({ id: "I" + Math.random(), type: "classe", acteur: "D", idCarte, ...(cible ? { cible } : {}) });


const lireFichier = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8');
const reserve = (c) => (c.etats || []).find(x => x && x.maintien === "CLASSE_PRISE_EN_CHARGE");
const finDeManche = (e) => { const s = clonerEtat(e); s.file = [{ id: "M3", carte: "X", initiative: 1, pas: 0 }];
    const clot = cloturerTour(s, creerDes(s.graine)); return { etat: s, etapes: clot.etapes }; };
const sansRegain = (e) => { Object.values(e.combattants).forEach(c => { c.stats = { ...(c.stats || {}), Regeneration: 0 }; c.atouts = { ...(c.atouts || {}), regenFatigue: 0 }; }); return e; };

console.log("\n1. LES PALIERS : 1, 3, 5, 9 ; LES SOINS À +1, +2, +3");
{
    const a = (n) => w.atoutClasse(medicus(n));
    verifier("niveau 1 : +1 aux soins, +5 % de régénération, +1 compétence", a(1).bonusSoin === 1 && a(1).regenFatigue === 5 && a(1).competences === 1);
    verifier("niveau 3 : +2 aux soins, +5 % d'esquive", a(3).bonusSoin === 2 && a(3).esquive === 5);
    verifier("niveau 5 : Soin d'urgence, +3 aux soins", a(5).bonusSoin === 3 && JSON.stringify(a(5).techniques) === '["CLASSE_SOIN_URGENCE"]');
    verifier("niveau 9 : la Prise en charge", JSON.stringify(a(9).techniques) === '["CLASSE_SOIN_URGENCE","CLASSE_PRISE_EN_CHARGE"]');
    verifier("en combat : +5 d'esquive au niveau 3", monde(3).combattants.D.def.esquive === monde(2).combattants.D.def.esquive + 5);
}

console.log("\n2. PRISE EN CHARGE : 40 % DES PV, ET LA RÉSERVE DE 20 POUR LUI ET LE RÉANIMÉ");
{
    const e = sansRegain(enTete(monde(9), "CLASSE_PRISE_EN_CHARGE"));
    e.combattants.A.fatigue = 60;
    const pas = appliquerIntention(e, intention("CLASSE_PRISE_EN_CHARGE", "A"));
    const D = pas.etat.combattants.D, A = pas.etat.combattants.A;
    verifier("réanimé avec 40 PV (40 %)", !A.aTerre && A.pv === 40 && PART_REANIMATION === 40);
    // (v361 : la réserve est bloquée, jamais dépensée.)
    verifier("rien n'est dépensé (100 / 60) ; 20 bloqués chez chacun", D.fatigue === 100 && A.fatigue === 60
             && reserveMaintenueDe(D) === 20 && reserveMaintenueDe(A) === 20, `${D.fatigue} / ${A.fatigue}`);
    verifier("chacun porte la réserve : 20, 2 manches, sans « Relâcher »", [D, A].every(c => { const r = reserve(c);
             return r && r.reserve === 20 && r.duree === 2 && !r.differee && r.sansRelache === true; }), JSON.stringify([reserve(D), reserve(A)]));
    const f1 = finDeManche(pas.etat);
    verifier("fin de la manche de la réanimation : rien de pris, 20 toujours bloqués chez chacun",
             f1.etat.combattants.D.fatigue === 100 && f1.etat.combattants.A.fatigue === 60
             && reserveMaintenueDe(f1.etat.combattants.D) === 20 && reserveMaintenueDe(f1.etat.combattants.A) === 20);
    const f2 = finDeManche(f1.etat);
    verifier("fin de la manche suivante : rien de pris, les réserves s'en vont",
             f2.etat.combattants.D.fatigue === 100 && f2.etat.combattants.A.fatigue === 60 && !reserve(f2.etat.combattants.D) && !reserve(f2.etat.combattants.A),
             `${f2.etat.combattants.D.fatigue} / ${f2.etat.combattants.A.fatigue}`);
    verifier("rejoué depuis le journal : mêmes énergies, mêmes réserves", (() => { const r = appliquerEntree(e, pas.entree).combattants;
             return r.D.fatigue === 100 && r.A.fatigue === 60 && !!reserve(r.A); })());
    // Le réanimé presque vide : 5 d'énergie, 20 à bloquer — sa réserve tombe en fin de manche, il reste debout.
    const vide = sansRegain(enTete(monde(9), "CLASSE_PRISE_EN_CHARGE")); vide.combattants.A.fatigue = 5;
    const pv = appliquerIntention(vide, intention("CLASSE_PRISE_EN_CHARGE", "A")).etat;
    verifier("le réanimé à 5 d'énergie : rien n'est pris (5)", pv.combattants.A.fatigue === 5);
    const court = finDeManche(pv);
    verifier("à court : sa réserve tombe, il reste debout avec ses PV", !reserve(court.etat.combattants.A) && !court.etat.combattants.A.aTerre
             && court.etat.combattants.A.pv === 40 && court.etapes.some(x => x.type === "message" && x.cible === "A" && /à court/.test(x.texte)));
    const pauvre = enTete(monde(9), "CLASSE_PRISE_EN_CHARGE"); pauvre.combattants.D.fatigue = 19;
    const ref = validerIntention(pauvre, intention("CLASSE_PRISE_EN_CHARGE", "A"));
    verifier("le Médicus à 19 : refusée (pas gâchée)", !ref.ok && /20/.test(ref.raison), ref.raison);
    // « Relâcher » envoyé quand même dans la file : ignoré.
    const f = finDeManche(pas.etat).etat;
    const ouvert = ouvrirManche(f, [{ idPersonnage: "D", idCarte: "C", initiative: 50, relacher: ["CLASSE_PRISE_EN_CHARGE"] },
                                    { idPersonnage: "A", idCarte: "C", initiative: 40, relacher: ["CLASSE_PRISE_EN_CHARGE"] }], creerDes(1));
    verifier("« Relâcher » dans la file : ignoré, la réserve reste", !!reserve(ouvert.etat.combattants.D) && !!reserve(ouvert.etat.combattants.A));
}

console.log("\n3. LE SOIN D'URGENCE RESTE À 12");
{
    const e = enTete(monde(5), "CLASSE_SOIN_URGENCE");
    const pas = appliquerIntention(e, intention("CLASSE_SOIN_URGENCE"));
    verifier("12 PV, malgré +3 aux soins (B : 50 → 62)", pas.etat.combattants.B.pv === 62, String(pas.etat.combattants.B.pv));
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

console.log("\n4. EN PRÉPARATION : LA RÉSERVE BLOQUÉE, SANS BOUTON « RELÂCHER »");
{
  const r = await p.evaluate(async () => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
    document.getElementById("fenetre-combat").style.display = "block";
    const prix = { nom: "Prise en charge (réserve)", maintien: "CLASSE_PRISE_EN_CHARGE", reserve: 20, duree: 1, dejaPaye: false, liens: [], sansRelache: true, desc: "…" };
    window.PERSOS_PARTIE = [{ idPersonnage: "D1", prenom: "Galien", classe: "Médicus", xp: 6400, couleur: "#335", camp: "Allié",
        deckEquipe: [], PV_Max: 50, PV_Actuels: 50, Fatigue_Max: 100, fatigueActuelle: 50, Etats_Alteres: [prix], techniquesUtilisees: ["CLASSE_PRISE_EN_CHARGE"] }];
    window.CACHE_COMPETENCES_GLOBAL = { D1: {} };
    window.COMPETENCES_CACHE = {};
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]]; window.COMBAT_INDEX_PERSO = 0;
    window.PARTIE_DATA = { Phase_Combat: "Preparation", File_Attente_Combat: [] };
    window.RELACHES_EN_ATTENTE = { D1: ["CLASSE_PRISE_EN_CHARGE"] };   // (même forcé, il ne compte pas)
    const h = window.PERSOS_PARTIE[0];
    window.chargerCompetencesCombat("D1", "#335");
    await new Promise(r => setTimeout(r, 80));
    const encart = document.querySelector("#combat-liste-competences .encart-maintien");
    return { encart: !!encart, texte: encart && encart.textContent.replace(/\s+/g, " ").trim(), bouton: !!document.querySelector(".maintien-relacher"),
             bloque: window.reserveMaintenueBloquee(h), dispo: window.fatiguePourChoisir(h) };
  });
  verifier("le volet montre la réserve (✚, 20 bloqués), sans bouton « Relâcher »", r.encart && /Prise en charge/.test(r.texte) && /20 bloqués/.test(r.texte) && !r.bouton,
           JSON.stringify(r));
  verifier("20 restent bloqués même si « Relâcher » était demandé (50 → 30 pour choisir)", r.bloque === 20 && r.dispo === 30, JSON.stringify(r));
}

{
  const c = lireFichier("classes.js");
  verifier("la fiche de classe : 3 (+2 soins, +5 % d'esquive), 5 (+3), 9 (40 %, réserve 20)", /niveau: 3, titre: "Mains sûres"/.test(c) && /\+5 % d'esquive/.test(c)
           && /\+3 en tout/.test(c) && /niveau: 9, titre: "Technique : Prise en charge par Médicus"/.test(c) && /40 % de ses PV/.test(c) && /réserve de 20/.test(c));
  verifier("version 351 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lireFichier("trace_combat.js")) || [])[1]) >= 351
           && JSON.parse(lireFichier("version.json")).version >= 351);
}
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
