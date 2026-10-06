// LA CLASSE SENTINELLE.
//
// Nico : « Sentinelle : Lvl1 : +6 aux dégâts d'opportunité / +20 % de soins
// reçus en plus. Lvl5 : débloque le Passif Défenseur : quand l'ennemi entre
// dans son champ d'action cac (case adjacente ou 2 cases pour lance lourde),
// proc une chance de 30 % de déclencher une attaque d'opportunité. Lvl10 :
// COMP Fureur de la sentinelle, 0 fatigue (une fois par combat) : repousse
// d'une case tous les belligérants qui lui sont adjacents et fait à chacun une
// attaque d'opportunité. INIT 20. »
// Ses réponses : le +6 vaut pour toutes ses attaques d'opportunité ; les +20 %
// comme l'Éthéré ; le Défenseur se déclenche quand l'ennemi entre DE LUI-MÊME
// (marche, Bond, Repli, fuite de la Peur — pas poussé ni tiré) ; 30 % puis le
// jet d'esquive/parade normal ; un seul jet par ennemi et par déplacement ;
// avec une arme à allonge, sa zone passe à 2 cases (attaque d'opportunité
// classique comprise) ; la Fureur : les ennemis seulement, l'attaque puis la
// poussée, refusée sans ennemi au contact.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, combattantDepuisFiche } from '../combat_etat.js';
import { resoudreCarte } from '../moteur_pur.js';
import { validerIntention, appliquerIntention } from '../cerveau_combat.js';
import { resoudreMouvement, resoudreBond, resoudrePeur, resoudreRepli, porteeDeMenace } from '../mouvement_pur.js';
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
const XP = { 1: 0, 4: 1800, 5: 2500, 9: 6400, 10: 7900 };
const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const sentinelle = (niveau, extra = {}) => fiche("S", { classe: "Sentinelle", xp: XP[niveau], ...extra });
const monde = (niveau = 10, positions = {}, autres = ["M1", "M2", "A"]) => {
    const fiches = [sentinelle(niveau), ...autres.map(id => fiche(id))];
    // (A, l'allié, est loin par défaut : il frapperait lui aussi qui quitte son contact.)
    const pos = { S: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 4, r: 0 }, A: { q: -5, r: 5 }, H: { q: -1, r: 0 }, ...positions };
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: fiches, positions: pos,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["S", ...autres];
    e.phase = "Resolution";
    return e;
};
// Des dés posés à la main : `valeurs` dans l'ordre, puis 100 (rien ne réussit).
const desA = (...valeurs) => { const v = [...valeurs]; const tires = [];
    return { tires, d100: () => { const x = v.length ? v.shift() : 100; tires.push(x); return x; }, fraction: () => 0, parmi: (l) => l[0] }; };
const pv = (r, id) => r.etat.combattants[id].pv;
const marcher = (e, id, chemin, des) => resoudreMouvement(e, { idLanceur: id, chemin }, des);

console.log("\n=========================================================");
console.log("  LA SENTINELLE");
console.log("=========================================================");

console.log("\n1. LES PALIERS");
{
    const a1 = w.atoutRace(sentinelle(1)), a5 = w.atoutRace(sentinelle(5)), a10 = w.atoutRace(sentinelle(10));
    verifier("niveau 1 : +6 d'opportunité, +20 % de soins reçus", a1.degatsOpportunite === 6 && a1.soinsRecus === 20
             && !a1.defenseur && !(a1.techniques || []).length, JSON.stringify(a1));
    verifier("niveau 5 : Défenseur 30 %, zone à 2 cases avec allonge", a5.defenseur === 30 && a5.allongeOpportunite === true);
    verifier("niveau 10 : la Fureur de la sentinelle", JSON.stringify(a10.techniques) === '["CLASSE_FUREUR_SENTINELLE"]');
    const f = w.TECHNIQUES_CLASSE.CLASSE_FUREUR_SENTINELLE;
    verifier("Fureur : init 20, aucune fatigue, niveau 10", f.Initiative === 20 && f.Fatigue === 0 && f.niveau === 10 && f.classe === "Sentinelle");
    const e = monde(10);
    verifier("en combat : les atouts voyagent", e.combattants.S.atouts.degatsOpportunite === 6 && e.combattants.S.atouts.defenseur === 30
             && e.combattants.S.atouts.allongeOpportunite === true && e.combattants.S.atouts.soinsRecus === 20);
    const lance = combattantDepuisFiche(sentinelle(5), { q: 0, r: 0 }, { ...REGLES, bonusEquip: (f, cle) => cle === "allonge" ? 1 : 0 });
    verifier("l'allonge de l'arme est retenue dans l'état", lance.mod.allonge === 1 && porteeDeMenace(lance) === 2
             && porteeDeMenace(e.combattants.S) === 1);
}

console.log("\n2. NIVEAU 1 : +6 AUX ATTAQUES D'OPPORTUNITÉ, +20 % DE SOINS");
{
    const e = monde(1);
    const r = marcher(e, "M1", [{ q: 2, r: 0 }], desA());
    verifier("M1 quitte son contact : 14 dégâts (8 + 6)", pv(r, "M1") === 86, String(pv(r, "M1")));
    const h = monde(1, { S: { q: 9, r: 9 }, H: { q: 0, r: 0 } }, ["M1", "H"]);
    verifier("un autre héros : 8", pv(marcher(h, "M1", [{ q: 2, r: 0 }], desA()), "M1") === 92);
    const arm = monde(1); arm.combattants.M1.def.physique = 50;
    verifier("l'armure réduit les 14 (50 % → 7)", pv(marcher(arm, "M1", [{ q: 2, r: 0 }], desA()), "M1") === 93);
    const soin = resoudreCarte(Object.assign(monde(1), {}), { type: "carte", idLanceur: "A", idCarte: "X", critique: false,
        attaques: [{ nom: "Soin", valeurBrute: 10, isHeal: true, cibles: ["S"] }], alterations: [],
        jets: { attaqueRatee: false, parCible: { S: { esquive: false, etats: {} } } } });
    const blesse = monde(1); blesse.combattants.S.pv = 50;
    const soinBlesse = resoudreCarte(blesse, { type: "carte", idLanceur: "A", idCarte: "X", critique: false,
        attaques: [{ nom: "Soin", valeurBrute: 10, isHeal: true, cibles: ["S"] }], alterations: [],
        jets: { attaqueRatee: false, parCible: { S: { esquive: false, etats: {} } } } });
    void soin;
    verifier("un soin de 10 lui rend 12 (+20 %)", soinBlesse.etat.combattants.S.pv === 62, String(soinBlesse.etat.combattants.S.pv));
}

console.log("\n3. NIVEAU 5 : LE DÉFENSEUR");
{
    // M2 en (4,0) marche vers la Sentinelle (0,0) : il entre dans sa zone en (1,0).
    const chemin = [{ q: 3, r: 0 }, { q: 2, r: 0 }, { q: 1, r: 0 }];
    const base = () => monde(5, { M1: { q: 9, r: 9 } });
    const des = desA(30);
    const r = marcher(base(), "M2", chemin, des);
    verifier("il entre au contact, le jet fait 30 : 14 dégâts", pv(r, "M2") === 86 && r.etapes.some(x => x.type === "message" && /Défenseur/.test(x.texte)),
             `${pv(r, "M2")} dés ${des.tires}`);
    verifier("deux jets : les 30 %, puis l'esquive/parade", des.tires.length === 2, String(des.tires));
    const rate = marcher(base(), "M2", chemin, desA(31));
    verifier("31 : rien ne part", pv(rate, "M2") === 100 && !rate.etapes.some(x => x.type === "opportunite"));
    const pare = monde(5, { M1: { q: 9, r: 9 } }); pare.combattants.M2.def.parade = 50;
    const rp = marcher(pare, "M2", chemin, desA(30, 40));
    verifier("le coup part, mais la parade le stoppe", pv(rp, "M2") === 100 && rp.etapes.some(x => x.type === "opportunite" && x.evitee && x.defenseur));
    const n4 = monde(4, { M1: { q: 9, r: 9 } });
    const d4 = desA(1);
    verifier("niveau 4 : pas de Défenseur (aucun dé)", pv(marcher(n4, "M2", chemin, d4), "M2") === 100 && d4.tires.length === 0);
    // Entrer, sortir, rentrer dans le même déplacement : un seul jet.
    const va = desA(100, 100, 100);
    const r3 = marcher(base(), "M2", [{ q: 3, r: 0 }, { q: 2, r: 0 }, { q: 1, r: 0 }, { q: 2, r: -1 }, { q: 1, r: -1 }], va);
    verifier("entrer, sortir, rentrer : un seul jet de Défenseur (+ l'opportunité en sortant)",
             va.tires.length === 2 && r3.etapes.filter(x => x.type === "opportunite" && !x.defenseur).length === 1, String(va.tires));
    // L'allonge : 2 cases.
    const lance = base(); lance.combattants.S.mod.allonge = 1;
    const rl = marcher(lance, "M2", [{ q: 3, r: 0 }, { q: 2, r: 0 }], desA(30));
    verifier("avec une lance : il frappe dès 2 cases", pv(rl, "M2") === 86, String(pv(rl, "M2")));
    const sans = marcher(base(), "M2", [{ q: 3, r: 0 }, { q: 2, r: 0 }], desA(30));
    verifier("sans allonge : rien à 2 cases", pv(sans, "M2") === 100);
    const lanceN1 = monde(1, { M1: { q: 2, r: 0 } }); lanceN1.combattants.S.mod.allonge = 1;
    verifier("niveau 1 avec une lance : la zone reste d'une case", pv(marcher(lanceN1, "M1", [{ q: 3, r: 0 }], desA()), "M1") === 100);
    const sortie = monde(5, { M1: { q: 2, r: 0 } }); sortie.combattants.S.mod.allonge = 1;
    verifier("avec une lance : qui quitte ses 2 cases prend l'opportunité classique (14)",
             pv(marcher(sortie, "M1", [{ q: 3, r: 0 }], desA()), "M1") === 86);
    // Rejoué depuis le journal (le vrai cerveau, ses vrais dés).
    const e = base(); e.file = [{ id: "M2", carte: "X", initiative: 10, pas: 0 }, { id: "S", carte: "Y", initiative: 5, pas: 0 }];
    const pas = appliquerIntention(e, { id: "I1", type: "mouvement", acteur: "M2", chemin });
    verifier("rejoué depuis le journal : mêmes PV", appliquerEntree(e, pas.entree).combattants.M2.pv === pas.etat.combattants.M2.pv);
}

console.log("\n4. LE DÉFENSEUR ET LES AUTRES DÉPLACEMENTS");
{
    // Le Bond : atterrir au contact.
    const b = monde(5, { M1: { q: 9, r: 9 }, M2: { q: 3, r: 0 } });
    const rb = resoudreBond(b, { idLanceur: "M2", vers: { q: 1, r: 0 }, portee: 3 }, desA(30));
    verifier("un Bond qui atterrit au contact : Défenseur", pv(rb, "M2") === 86, String(pv(rb, "M2")));
    // La Peur : fuir en passant par sa zone. M2 (2,0) fuit A (4,0) : sa
    // première case est (2,-1), au contact de la Sentinelle en (2,-2).
    const p = monde(5, { S: { q: 2, r: -2 }, M1: { q: 9, r: 9 }, M2: { q: 2, r: 0 }, A: { q: 4, r: 0 } });
    const peur = clonerEtat(p);
    const etapesPeur = resoudrePeur(peur, "A", "M2", desA(30), undefined);
    const premier = etapesPeur.find(x => x.type === "pas");
    // 14 du Défenseur en entrant, puis 14 de l'opportunité classique en ressortant.
    verifier("une fuite qui entre dans sa zone : Défenseur (14), puis l'opportunité en ressortant (14)",
             premier && premier.vers.q === 2 && premier.vers.r === -1
             && etapesPeur.some(x => x.type === "message" && /Défenseur/.test(x.texte)) && peur.combattants.M2.pv === 72,
             etapesPeur.filter(x => x.type === "pas").map(x => `${x.vers.q},${x.vers.r}`).join(" ") + " pv " + peur.combattants.M2.pv);
    // Le Repli : il se dérobe, sans dé.
    const rep = monde(5, { M1: { q: 9, r: 9 }, M2: { q: 3, r: 0 } });
    const desRep = desA();
    const etapesRep = resoudreRepli(clonerEtat(rep), "M2", { q: 1, r: 0 }, desRep);
    verifier("un Repli qui entre dans sa zone s'en dérobe, sans dé",
             etapesRep.some(x => x.type === "opportunite" && x.evitee && x.defenseur && /Repli/.test(x.mot)) && desRep.tires.length === 0,
             JSON.stringify(etapesRep.map(x => x.type)));
    // Poussé dans sa zone par un autre : rien.
    const pousse = monde(5, { M1: { q: 9, r: 9 }, M2: { q: 3, r: 0 }, A: { q: 4, r: 0 } });
    const rp = resoudreCarte(pousse, { type: "carte", idLanceur: "A", idCarte: "X", critique: false, attaques: [],
        alterations: [{ nom: "Poussée", chance: 100, cases: 2, cibles: ["M2"] }],
        jets: { attaqueRatee: false, parCible: { M2: { esquive: false, etats: { "Poussée": true } } } } });
    verifier("poussé dans sa zone par un autre : rien", rp.etat.combattants.M2.q === 1 && rp.etat.combattants.M2.pv === 100
             && !rp.etapes.some(x => x.type === "opportunite"), `${rp.etat.combattants.M2.q}`);
}

console.log("\n5. LA FUREUR DE LA SENTINELLE");
{
    // S (0,0) ; M1 (1,0) et M2 (-1,0) au contact ; A, un allié, au contact (0,1) ; M3 loin.
    const e = monde(10, { M2: { q: -1, r: 0 }, M3: { q: 6, r: 0 }, A: { q: 0, r: 1 } }, ["M1", "M2", "A", "M3"]);
    e.combattants.M2.def.physique = 50;
    e.file = [{ id: "S", carte: "CLASSE_FUREUR_SENTINELLE", initiative: 20, pas: 0 }, { id: "M1", carte: "X", initiative: 10, pas: 0 }];
    const i = { id: "F1", type: "classe", acteur: "S", idCarte: "CLASSE_FUREUR_SENTINELLE" };
    verifier("niveau 10, des ennemis au contact : acceptée", validerIntention(e, i).ok, validerIntention(e, i).raison || "");
    const n9 = monde(9); n9.file = [{ id: "S", carte: "CLASSE_FUREUR_SENTINELLE", initiative: 20, pas: 0 }];
    verifier("niveau 9 : il ne l'a pas", !validerIntention(n9, i).ok);
    const seul = monde(10, { M1: { q: 5, r: 0 } }); seul.file = [{ id: "S", carte: "CLASSE_FUREUR_SENTINELLE", initiative: 20, pas: 0 }];
    verifier("personne au contact : refusée (pas gâchée)", !validerIntention(seul, i).ok, validerIntention(seul, i).raison);
    const pas = appliquerIntention(e, i);
    const c = pas.etat.combattants;
    verifier("M1 : 14 dégâts, repoussé en (2,0)", c.M1.pv === 86 && c.M1.q === 2 && c.M1.r === 0, `${c.M1.pv} (${c.M1.q},${c.M1.r})`);
    verifier("M2 (50 % d'armure) : 7, repoussé en (-2,0)", c.M2.pv === 93 && c.M2.q === -2, `${c.M2.pv} (${c.M2.q},${c.M2.r})`);
    verifier("l'allié et l'ennemi loin : rien", c.A.pv === 100 && c.A.q === 0 && c.A.r === 1 && c.M3.pv === 100 && c.M3.q === 6);
    verifier("aucune fatigue, une fois par combat", c.S.fatigue === 100
             && !validerIntention(Object.assign(clonerEtat(pas.etat), { file: [{ id: "S", carte: "CLASSE_FUREUR_SENTINELLE", initiative: 20, pas: 0 }] }), i).ok);
    const rejoue = appliquerEntree(e, pas.entree).combattants;
    verifier("rejoué depuis le journal : mêmes PV, mêmes cases", rejoue.M1.pv === 86 && rejoue.M1.q === 2 && rejoue.M2.q === -2);
    const titre = misEnScene(pas.entree.etapes.find(x => x.type === "techniqueClasse"), pas.etat);
    verifier("à l'écran : « ⚔️ Fureur de la sentinelle »", titre && /Fureur de la sentinelle/.test(titre.texte));
    // Poussée bloquée : le coup porte quand même.
    const bloque = monde(10, { M2: { q: 2, r: 0 } }, ["M1", "M2", "A"]);
    bloque.file = [{ id: "S", carte: "CLASSE_FUREUR_SENTINELLE", initiative: 20, pas: 0 }];
    const rb = appliquerIntention(bloque, i);
    verifier("poussée bloquée (un pion derrière) : le coup porte, il reste", rb.etat.combattants.M1.pv === 86 && rb.etat.combattants.M1.q === 1
             && rb.entree.etapes.some(x => x.type === "message" && /Poussée bloquée/.test(x.texte)));
    // Qui esquive est repoussé quand même.
    const esq = monde(10); esq.combattants.M1.def.esquive = 100;
    esq.file = [{ id: "S", carte: "CLASSE_FUREUR_SENTINELLE", initiative: 20, pas: 0 }];
    const re = appliquerIntention(esq, i).etat.combattants.M1;
    verifier("il esquive le coup : repoussé quand même", re.pv === 100 && re.q === 2);
}

// =========================================================================
//  PARTIE 2 : LA VRAIE PAGE
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
console.log("\n6. LA FICHE DE CLASSE ET LES BONUS EN CLAIR");
{
  const r = await p.evaluate(async () => {
    document.getElementById("fenetre-combat").style.display = "none";
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    await window.ouvrirChoixClasse();
    window.ouvrirFicheClasse("CLASSE_SENTINELLE");
    const d = document.getElementById("descriptif-fiche-classe");
    const detail = window.detailBonusRaceClasse({ race: "Humain", classe: "Sentinelle", xp: 7900 }).classe;
    return { visible: getComputedStyle(d).display !== "none",
             niveaux: [...d.querySelectorAll(".palier-classe-niveau")].map(x => x.textContent.trim()), texte: d.textContent,
             lignes: detail.paliers.map(p => p.lignes.join(" · ")) };
  });
  await p.screenshot({ path: "/tmp/claude-0/sentinelle_classe.png" });
  verifier("présentation et paliers Niv. 1 / 5 / 10", r.visible && JSON.stringify(r.niveaux) === '["Niv. 1","Niv. 5","Niv. 10"]');
  verifier("le descriptif dit +6, +20 %, Défenseur 30 %, allonge, Fureur",
           /\+6/.test(r.texte) && /\+20 %/.test(r.texte) && /Défenseur/.test(r.texte) && /30 %/.test(r.texte)
           && /allonge/.test(r.texte) && /Fureur de la sentinelle/.test(r.texte));
  verifier("l'onglet Statistiques écrit chaque atout en clair",
           /\+6 aux dégâts de ses attaques d'opportunité/.test(r.lignes[0]) && /\+20 % de soins reçus/.test(r.lignes[0])
           && /Défenseur : 30 %/.test(r.lignes[1]) && /2 cases avec une arme à allonge/.test(r.lignes[1])
           && /Fureur de la sentinelle/.test(r.lignes[2]), JSON.stringify(r.lignes));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
