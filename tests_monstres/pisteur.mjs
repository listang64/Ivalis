// LA CLASSE PISTEUR.
//
// Nico : « Pisteur : Lvl1 : un compagnon animal indépendant en combat. PV = 25
// / ESQUIVE = 15 % / ATTAQUE = 6 dégâts bruts // arme à distance : +1 dégât.
// Lvl5 : Tir précis (0 fatigue, une fois par combat) : un ennemi à portée 5
// est immobilisé, INIT 100. Lvl10 : Lien de sang (0 fatigue, une fois par
// combat) : soigne intégralement son compagnon au cac, INIT 100. Après avoir
// choisi cette classe, une fenêtre intermédiaire demande à quoi ressemble
// votre compagnon (taille maxi : un cheval) ; au moment de créer le perso, ça
// crée aussi l'image du compagnon (en paysage), qui aura son propre pion en
// combat. Il spawn en même temps que les joueurs. »
// Ses réponses : joué par l'IA comme le zombie (3 cases, sans fatigue, va vers
// l'ennemi le plus proche et frappe au contact) ; juste après son maître ;
// parade 0, aucune résistance ; mêmes chiffres à tous les niveaux ; les ennemis
// peuvent le viser ; KO jusqu'à la fin du combat, il revient avec 25 PV au
// suivant ; si le Pisteur tombe, il continue ; +1 sur chaque attaque d'une
// compétence à arme à distance ; Tir précis : ligne de vue, immobilisé à coup
// sûr, 2 manches ; Lien de sang : relève aussi le compagnon KO, plein ; un nom
// en plus de la description ; un pion d'une case, même pour un cheval.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat, COMPAGNON,
         compagnonDe, placerCompagnons, profanateurPourZombie, creerDes } from '../combat_etat.js';
import { esquiveDe, paradeDe, aLEtat } from '../moteur_pur.js';
import { jouerCompagnon, prochainPas, ouvrirManche, validerIntention, avancerFile } from '../cerveau_combat.js';
import { renfortsDuTour, misEnScene } from '../pont_combat.js';

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
const XP = { 1: 0, 4: 1800, 5: 2500, 9: 6400, 10: 7900 };
const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const pisteur = (niveau, extra = {}) => fiche("P", { classe: "Pisteur", xp: XP[niveau], ...extra });
// Le compagnon tel que le jeu le crée (donneesCompagnon, monstres.js), une
// fois passé par persoDocVersFront : une créature de son camp.
const compagnon = (extra = {}) => fiche("C", { estMonstre: true, camp: "Allié", compagnonDe: "P",
    PV_Max: 25, PV_Actuels: 25, Esquive: 15, Parade: 0, ...extra });
// P (0,0) ; C, son compagnon, au contact (0,1) ; M1 (5,0) ; M2 (-3,0) ; H (-1,0).
const monde = (niveau = 10, positions = {}, autres = ["M1", "M2", "H"]) => {
    const fiches = [pisteur(niveau), compagnon(), ...autres.map(id => fiche(id))];
    const pos = { P: { q: 0, r: 0 }, C: { q: 0, r: 1 }, M1: { q: 5, r: 0 }, M2: { q: -3, r: 0 }, H: { q: -1, r: 0 }, ...positions };
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: fiches, positions: pos,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["P", "C", ...autres];
    e.phase = "Resolution";
    return e;
};

console.log("\n=========================================================");
console.log("  LE PISTEUR");
console.log("=========================================================");

console.log("\n1. LES PALIERS");
{
    const a1 = w.atoutRace(pisteur(1)), a5 = w.atoutRace(pisteur(5)), a10 = w.atoutRace(pisteur(10));
    verifier("niveau 1 : le compagnon, +1 aux tirs", a1.compagnon === true && a1.bonusDistance === 1 && !(a1.techniques || []).length,
             JSON.stringify(a1));
    verifier("niveau 5 : Tir précis", JSON.stringify(a5.techniques) === '["CLASSE_TIR_PRECIS"]');
    verifier("niveau 10 : Lien de sang (et toujours +1, pas +3)", JSON.stringify(a10.techniques) === '["CLASSE_TIR_PRECIS","CLASSE_LIEN_DE_SANG"]'
             && a10.bonusDistance === 1);
    const tir = w.TECHNIQUES_CLASSE.CLASSE_TIR_PRECIS, lien = w.TECHNIQUES_CLASSE.CLASSE_LIEN_DE_SANG;
    verifier("Tir précis : init 100, 0 fatigue, un ennemi à 5 cases, en vue", tir.Initiative === 100 && tir.Fatigue === 0
             && tir.cible === "ennemi" && tir.portee === 5 && tir.ligneDeVue === true);
    verifier("Lien de sang : init 100, 0 fatigue, son compagnon", lien.Initiative === 100 && lien.Fatigue === 0 && lien.cible === "compagnon");
    verifier("écrit en clair", /compagnon/.test(w.texteAtout("compagnon", true)) && /\+1 dégât/.test(w.texteAtout("bonusDistance", 1)));
    verifier("le compagnon : 25 PV, 15 % d'esquive, 6 dégâts, 3 cases", COMPAGNON.pv === 25 && COMPAGNON.esquive === 15
             && COMPAGNON.degats === 6 && COMPAGNON.pas === 3);
}

console.log("\n2. LE COMPAGNON EN COMBAT");
{
    const e = monde(1);
    const c = e.combattants.C;
    verifier("une créature de son camp, liée à son maître", c.compagnon && c.compagnon.idMaitre === "P" && c.camp === "Allié"
             && c.estMonstre === true, JSON.stringify(c.compagnon));
    verifier("25 PV, 15 % d'esquive, ni parade ni résistance", c.pv === 25 && c.pvMax === 25 && esquiveDe(c) === 15
             && paradeDe(c) === 0 && c.def.physique === 0 && c.def.magique === 0);
    verifier("compagnonDe(P) le trouve ; un autre héros n'en a pas", compagnonDe(e, "P") && compagnonDe(e, "P").id === "C" && !compagnonDe(e, "H"));
    verifier("l'état est cohérent", verifierEtatCombat(e).length === 0, verifierEtatCombat(e).join(" | "));
    verifier("un Profanateur ennemi n'en fait jamais un zombie", profanateurPourZombie(e, c, "M1") === null);
}

console.log("\n3. IL JOUE JUSTE APRÈS SON MAÎTRE");
{
    const e = monde(1); e.phase = "Preparation";
    const file = [{ idPersonnage: "M1", idCarte: "X", initiative: 80 }, { idPersonnage: "C", idCarte: "COMPAGNON_ATTAQUE", initiative: 0 },
                  { idPersonnage: "P", idCarte: "Y", initiative: 50 }, { idPersonnage: "H", idCarte: "Z", initiative: 40 },
                  { idPersonnage: "M2", idCarte: "X", initiative: 10 }];
    const pas = ouvrirManche(e, file, creerDes(1));
    const ordre = pas.etat.file.map(f => f.id).join(",");
    verifier("file : M1, P, C, H, M2", ordre === "M1,P,C,H,M2", ordre);
    verifier("avec l'initiative de son maître (la piste le montre à côté)", pas.etat.file[2].initiative === 50);
    verifier("rejoué depuis le journal : la même file", appliquerEntree(e, pas.entree).file.map(f => f.id).join(",") === "M1,P,C,H,M2");
    // Son maître KO : il garde sa place.
    const sansP = monde(1); sansP.phase = "Preparation"; sansP.combattants.P.aTerre = true; sansP.combattants.P.pv = 0;
    const p2 = ouvrirManche(sansP, file, creerDes(1));
    verifier("maître KO : le compagnon joue quand même (à sa place, en dernier)", p2.etat.file.map(f => f.id).join(",") === "M1,H,M2,C",
             p2.etat.file.map(f => f.id).join(","));
    verifier("placerCompagnons ne touche pas une file sans compagnon",
             placerCompagnons(e, [{ id: "M1" }, { id: "P" }]).map(f => f.id).join(",") === "M1,P");
}

console.log("\n4. SON TOUR : 3 CASES SANS FATIGUE, PUIS 6 DÉGÂTS BRUTS");
{
    const tourDe = (posM1, extra = {}) => {
        const e = monde(1, { M1: posM1, M2: { q: -9, r: 9 }, P: { q: -1, r: 0 }, C: { q: 0, r: 0 }, H: { q: -8, r: 0 } });
        Object.assign(e.combattants.M1.def, extra);
        e.file = [{ id: "C", carte: "COMPAGNON_ATTAQUE", initiative: 50, pas: 0 }, { id: "M1", carte: "X", initiative: 10, pas: 0 }];
        return e;
    };
    const loin = tourDe({ q: 6, r: 0 });
    const fatigue = loin.combattants.C.fatigue;
    const p1 = jouerCompagnon(loin, "C");
    const c1 = p1.etat.combattants.C;
    verifier("ennemi à 6 cases : il avance de 3, sans fatigue", c1.q === 3 && c1.r === 0 && c1.fatigue === fatigue, `(${c1.q},${c1.r}) ${c1.fatigue}`);
    verifier("trop loin pour frapper : il le dit ; son tour se clôt", p1.entree.etapes.some(x => x.type === "renonce" && /compagnon/.test(x.raison))
             && p1.etat.file[0].id === "M1");
    const proche = tourDe({ q: 4, r: 0 }, { physique: 60 });
    const p2 = jouerCompagnon(proche, "C");
    verifier("ennemi à 4 cases : 3 pas, puis 6 dégâts — bruts, l'armure (60 %) n'y fait rien",
             p2.etat.combattants.C.q === 3 && p2.etat.combattants.M1.pv === 94, `${p2.etat.combattants.C.q} ${p2.etat.combattants.M1.pv}`);
    const rejoue = appliquerEntree(proche, p2.entree).combattants;
    verifier("rejoué depuis le journal", rejoue.M1.pv === 94 && rejoue.C.q === 3);
    const auto = prochainPas(tourDe({ q: 1, r: 0 }), [], {});
    verifier("le cerveau le joue tout seul, sans carte", auto && auto.creature === "C" && auto.etat.combattants.M1.pv === 94);
    const esquive = tourDe({ q: 1, r: 0 }, { esquive: 100 });
    verifier("la cible peut l'esquiver", jouerCompagnon(esquive, "C").etat.combattants.M1.pv === 100);
    // Les ennemis le visent comme n'importe qui.
    const vise = monde(1); vise.combattants.C.pv = 3;
    const ia = prochainPas(Object.assign(vise, { file: [{ id: "C", carte: "COMPAGNON_ATTAQUE", initiative: 0, pas: 0 }] }), [], {});
    verifier("il est dans le camp des héros : les créatures le voient comme une cible", ia && ia.creature === "C");
}

console.log("\n5. KO : À TERRE JUSQU'À LA FIN DU COMBAT");
{
    const e = monde(1); e.combattants.C.aTerre = true; e.combattants.C.pv = 0; e.phase = "Preparation";
    const p = ouvrirManche(e, [{ idPersonnage: "P", idCarte: "Y", initiative: 50 }, { idPersonnage: "C", idCarte: "COMPAGNON_ATTAQUE", initiative: 0 }], creerDes(1));
    verifier("KO : la manche suivante s'ouvre sans lui", p.etat.file.map(f => f.id).join(",") === "P");
    const tete = monde(1); tete.combattants.C.aTerre = true; tete.combattants.C.pv = 0;
    tete.file = [{ id: "C", carte: "COMPAGNON_ATTAQUE", initiative: 0, pas: 0 }, { id: "H", carte: "Z", initiative: 0, pas: 0 }];
    const passe = prochainPas(tete, [], {});
    verifier("tombé avant son tour : son tour est passé", passe && passe.passe === "C" && passe.etat.file[0].id === "H");
    // Ni mort de la réserve, ni renfort.
    const memoire = { annonces: new Set(), attente: [], clePrecedente: null };
    const etatDe = (t, liste) => ({ manche: 1, phase: "Resolution", file: [{ id: t }],
        combattants: Object.fromEntries(liste.map(c => [c.id, { estMonstre: true, ...c }])) });
    renfortsDuTour(etatDe("P", [{ id: "C", compagnon: { idMaitre: "P" } }, { id: "M1" }]), memoire);
    const r1 = renfortsDuTour(etatDe("P", [{ id: "C", compagnon: { idMaitre: "P" }, aTerre: true }, { id: "M1" }]), memoire);
    const r2 = renfortsDuTour(etatDe("M1", [{ id: "C", compagnon: { idMaitre: "P" }, aTerre: true }, { id: "M1" }]), memoire);
    verifier("son KO n'est pas une mort de la réserve : aucun renfort", !r1.morts.length && r1.renforts === 0 && r2.renforts === 0);
}

console.log("\n6. NIVEAU 5 : TIR PRÉCIS");
{
    const tir = (niveau, cible, plateau, pos = {}) => {
        const e = monde(niveau, pos);
        e.file = [{ id: "P", carte: "CLASSE_TIR_PRECIS", initiative: 100, pas: 0 }, { id: "M1", carte: "X", initiative: 10, pas: 0 }];
        return { e, pas: prochainPas(e, [{ id: "i1", type: "classe", acteur: "P", idCarte: "CLASSE_TIR_PRECIS", cible }], { plateau }) };
    };
    const { e, pas } = tir(5, "M1");
    const m1 = pas.etat.combattants.M1;
    const immo = (m1.etats || []).find(x => x.nom === "Immobilisation");
    verifier("ennemi à 5 cases : immobilisé, 2 manches, à coup sûr", immo && immo.duree === 2 && !pas.refus, JSON.stringify(immo));
    verifier("la technique est consommée, le tour se clôt", pas.etat.combattants.P.techniquesUtilisees.includes("CLASSE_TIR_PRECIS")
             && pas.etat.file[0].id === "M1");
    verifier("rejoué depuis le journal", aLEtat(appliquerEntree(e, pas.entree).combattants.M1, "Immobilisation"));
    const scene = misEnScene(pas.entree.etapes.find(x => x.type === "techniqueClasse"), pas.etat);
    verifier("à l'écran : « 🎯 Tir précis »", scene && /Tir précis/.test(scene.texte));
    verifier("à 6 cases : refusé", tir(5, "M1", null, { M1: { q: 6, r: 0 } }).pas.refus === true);
    verifier("un allié : refusé", tir(5, "H").pas.refus === true);
    const mur = { etatCase: (q, r) => ({ bloquee: q === 2 && r === 0, supprimee: false, difficile: false }) };
    const cache = tir(5, "M1", mur);
    verifier("derrière un mur : refusé (pas de ligne de vue)", cache.pas.refus === true && /ligne de vue/.test(cache.pas.raison), cache.pas.raison);
    verifier("niveau 4 : il ne l'a pas", tir(4, "M1").pas.refus === true);
    const immunise = monde(5); immunise.combattants.M1.atouts.immunites = ["Immobilisation"];
    immunise.file = [{ id: "P", carte: "CLASSE_TIR_PRECIS", initiative: 100, pas: 0 }];
    const pi = prochainPas(immunise, [{ id: "i1", type: "classe", acteur: "P", idCarte: "CLASSE_TIR_PRECIS", cible: "M1" }], {});
    verifier("une cible insensible : rien (et c'est dit)", !aLEtat(pi.etat.combattants.M1, "Immobilisation")
             && pi.entree.etapes.some(x => x.type === "etatRate"));
    const deux = clonerEtat(pas.etat); deux.file = [{ id: "P", carte: "CLASSE_TIR_PRECIS", initiative: 100, pas: 0 }];
    verifier("une fois par combat", validerIntention(deux, { id: "i2", type: "classe", acteur: "P", idCarte: "CLASSE_TIR_PRECIS", cible: "M2" }).ok === false);
}

console.log("\n7. NIVEAU 10 : LIEN DE SANG");
{
    const lien = (niveau, prep, pos = {}) => {
        const e = monde(niveau, pos);
        prep(e);
        e.file = [{ id: "P", carte: "CLASSE_LIEN_DE_SANG", initiative: 100, pas: 0 }, { id: "M1", carte: "X", initiative: 10, pas: 0 }];
        return { e, pas: prochainPas(e, [{ id: "i1", type: "classe", acteur: "P", idCarte: "CLASSE_LIEN_DE_SANG" }], {}) };
    };
    const blesse = lien(10, e => { e.combattants.C.pv = 4; e.combattants.C.etats = [{ nom: "Brûlé", duree: 2 }]; });
    verifier("blessé, au contact : 4 → 25 PV", blesse.pas.etat.combattants.C.pv === 25 && !blesse.pas.refus
             && blesse.pas.entree.etapes.some(x => x.type === "soin" && x.cible === "C" && x.montant === 21));
    // Plein soin même sous une brûlure (−50 % de soins) : « intégralement ».
    verifier("intégralement, même brûlé", blesse.pas.etat.combattants.C.pv === 25);
    const ko = lien(10, e => { e.combattants.C.aTerre = true; e.combattants.C.pv = 0; e.combattants.C.etats = [{ nom: "Saignement", duree: 2 }]; });
    const c = ko.pas.etat.combattants.C;
    verifier("KO, au contact : relevé avec ses 25 PV, ses états effacés", !c.aTerre && c.pv === 25 && c.etats.length === 0
             && ko.pas.entree.etapes.some(x => x.type === "reanimation" && x.cible === "C"));
    const rejoue = appliquerEntree(ko.e, ko.pas.entree).combattants.C;
    verifier("rejoué depuis le journal", !rejoue.aTerre && rejoue.pv === 25);
    // Relevé, il rejoue dès la manche suivante.
    const suite = clonerEtat(ko.pas.etat); suite.phase = "Preparation";
    const m = ouvrirManche(suite, [{ idPersonnage: "C", idCarte: "COMPAGNON_ATTAQUE", initiative: 0 }, { idPersonnage: "P", idCarte: "Y", initiative: 30 }], creerDes(1));
    verifier("relevé : il rejoue dès la manche suivante, après son maître", m.etat.file.map(f => f.id).join(",") === "P,C");
    verifier("indemne : refusé (pas gâché)", lien(10, () => {}).pas.refus === true);
    const loin = lien(10, e => { e.combattants.C.pv = 4; }, { C: { q: 0, r: 3 } });
    verifier("pas au contact : refusé", loin.pas.refus === true && /contact/.test(loin.pas.raison), loin.pas.raison);
    verifier("niveau 9 : il ne l'a pas", lien(9, e => { e.combattants.C.pv = 4; }).pas.refus === true);
    verifier("à l'écran : « 🩸 Lien de sang »", /Lien de sang/.test(misEnScene(blesse.pas.entree.etapes.find(x => x.type === "techniqueClasse"), blesse.pas.etat).texte));
    // Le Pisteur à terre : son compagnon se bat toujours.
    const seul = monde(1, { M1: { q: 0, r: 2 } }); seul.combattants.P.aTerre = true; seul.combattants.P.pv = 0;
    seul.file = [{ id: "C", carte: "COMPAGNON_ATTAQUE", initiative: 0, pas: 0 }];
    const ps = prochainPas(seul, [], {});
    verifier("le Pisteur tombé, son compagnon se bat encore", ps && ps.creature === "C" && ps.etat.combattants.M1.pv === 94);
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
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/"), col: chemin[0], id: chemin[chemin.length - 1] });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data) => { (window.__sets = window.__sets || []).push({ chemin: ref.chemin, data }); };
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
// Une petite image PNG (un carré brun), pour les réponses de l'IA d'images.
const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgYGD4z8DAwMDAwMDAAAANBAEB0yB2PQAAAABJRU5ErkJggg==";
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
const appelsIA = [];
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"><rect width="900" height="300" fill="#5a3a20"/></svg>' }));
await p.route('**api.openai.com/**', r => {
  const req = r.request();
  appelsIA.push({ url: req.url(), corps: req.postData() || "" });
  r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify({ data: [{ b64_json: PNG_B64 }] }) });
});
let depots = 0;
await p.route('**api.cloudinary.com/**', r => {
  depots++;
  r.fulfill({ contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'},
              body: JSON.stringify({ secure_url: `https://res.cloudinary.com/x/image/upload/v1/compagnon_${depots}.png`, public_id: `compagnon_${depots}` }) });
});
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

console.log("\n8. +1 DÉGÂT À CHAQUE ATTAQUE D'UNE COMPÉTENCE À ARME À DISTANCE");
{
  const r = await p.evaluate(() => {
    const lanceur = (classe, xp = 0) => ({ idPersonnage: "P", prenom: "P", race: "Humain", classe, xp, camp: "Allié",
                                           Etats_Alteres: [], equipArmure: null, equipMainDroite: null, equipMainGauche: null });
    const carte = () => ({ attaques: [{ nom: "Tir", valeurBrute: 5, typeRes: "Physique", cibles: ["M1"] },
                                      { nom: "Tir 2", valeurBrute: 3, typeRes: "Physique", cibles: ["M1"] },
                                      { nom: "Soin", valeurBrute: 4, isHeal: true, cibles: ["P"] }], alterations: [] });
    const essai = (classe, arme) => { const s = carte(); window.appliquerEquipementALaCarte(s, lanceur(classe), arme); return s.attaques.map(a => a.valeurBrute); };
    return { distance: essai("Pisteur", "Arme légère Distance"), cac: essai("Pisteur", "Arme légère CAC"),
             autre: essai("Sentinelle", "Arme légère Distance") };
  });
  verifier("Pisteur, arme à distance : 5 → 6, 3 → 4 (le soin ne bouge pas)", JSON.stringify(r.distance) === "[6,4,4]", JSON.stringify(r.distance));
  verifier("Pisteur, arme de corps à corps : rien", JSON.stringify(r.cac) === "[5,3,4]", JSON.stringify(r.cac));
  verifier("une autre classe, arme à distance : rien", JSON.stringify(r.autre) === "[5,3,4]", JSON.stringify(r.autre));
}

console.log("\n9. LA CRÉATION : SON NOM, SON ALLURE");
{
  await p.evaluate(async () => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    window.GENRE_SELECTIONNE_TEMP = "Femelle";
    window.RACE_SELECTIONNEE_TEMP = "Humain";
    window.__identite = 0;
    window.ouvrirEtapeIdentite = () => { window.__identite++; };
    await window.ouvrirChoixClasse();
    window.ouvrirFicheClasse("CLASSE_PISTEUR");
  });
  const fiche = await p.evaluate(() => {
    const d = document.getElementById("descriptif-fiche-classe");
    return { titre: document.getElementById("titre-fiche-classe").textContent, texte: d.textContent,
             niveaux: [...d.querySelectorAll(".palier-classe-niveau")].map(x => x.textContent.trim()) };
  });
  await p.screenshot({ path: "/tmp/claude-0/pisteur_classe.png" });
  verifier("fiche de classe : Niv. 1 / 5 / 10, compagnon 25 PV, Tir précis, Lien de sang",
           JSON.stringify(fiche.niveaux) === '["Niv. 1","Niv. 5","Niv. 10"]' && /25 PV/.test(fiche.texte) && /15 % d'esquive/.test(fiche.texte)
           && /Tir précis/.test(fiche.texte) && /Lien de sang/.test(fiche.texte) && /cheval/.test(fiche.texte));
  verifier("pour une héroïne : « Pisteuse »", fiche.titre === "Pisteuse", fiche.titre);
  const r = await p.evaluate(() => {
    window.validerClasse();
    const f = document.getElementById("fenetre-compagnon");
    const ouverte = !!f && getComputedStyle(f).display === "flex";
    const identiteAvant = window.__identite;
    window.validerCompagnon();
    const erreurVide = document.getElementById("erreur-compagnon").textContent;
    document.getElementById("champ-compagnon-nom").value = "Croc-Gris";
    document.getElementById("champ-compagnon-description").value = "Un grand loup gris cendré, une oreille déchirée, des yeux ambrés.";
    return { ouverte, identiteAvant, erreurVide, texte: f.textContent };
  });
  await p.screenshot({ path: "/tmp/claude-0/pisteur_compagnon.png" });
  verifier("Pisteur validé : la fenêtre du compagnon s'ouvre (pas encore l'identité)", r.ouverte && r.identiteAvant === 0);
  verifier("elle dit la taille maximale : un cheval", /cheval/.test(r.texte));
  verifier("vide : refusé, avec un mot", /nom/.test(r.erreurVide), r.erreurVide);
  const v = await p.evaluate(() => {
    window.validerCompagnon();
    return { temp: window.COMPAGNON_TEMP, identite: window.__identite,
             ferme: getComputedStyle(document.getElementById("fenetre-compagnon")).display === "none",
             pourPisteur: window.compagnonPourCreation("Pisteur"), pourAutre: window.compagnonPourCreation("Sentinelle") };
  });
  verifier("validé : gardé en mémoire, puis l'identité du héros", v.temp && v.temp.nom === "Croc-Gris" && v.identite === 1 && v.ferme);
  verifier("joint au héros créé — seulement pour un Pisteur", v.pourPisteur && v.pourPisteur.nom === "Croc-Gris"
           && /loup/.test(v.pourPisteur.description) && v.pourAutre === null);
  const s = await p.evaluate(() => {
    window.validerRaceEtGenre = window.validerRaceEtGenre;
    window.ouvrirFicheClasse("CLASSE_SENTINELLE"); window.validerClasse();
    return { apres: window.COMPAGNON_TEMP, identite: window.__identite };
  });
  verifier("une autre classe choisie ensuite : le compagnon est oublié", s.apres === null && s.identite === 2);
}

console.log("\n10. LA FICHE GARDE SON COMPAGNON");
{
  const r = await p.evaluate(async () => {
    const front = window.persoDocVersFront("PERSO_1", { Classe: "Pisteur", Prenom_Personnage: "Lyra",
        Compagnon_Nom: "Croc-Gris", Compagnon_Description: "Un loup", Compagnon_Image: "https://i/img.png", Compagnon_Token: "https://i/tok.png" });
    const sans = window.persoDocVersFront("PERSO_2", { Classe: "Sentinelle" });
    window.__sets = [];
    await window.sauvegarderFichePersonnage({ ...front, idPersonnage: "PERSO_1" }, true);
    const ecrit = (window.__sets.find(x => /PERSO_1/.test(x.chemin)) || {}).data || {};
    return { compagnon: front.compagnon, sans: sans.compagnon,
             ecrit: { n: ecrit.Compagnon_Nom, d: ecrit.Compagnon_Description, i: ecrit.Compagnon_Image, t: ecrit.Compagnon_Token } };
  });
  verifier("lue : nom, description, image, pion", r.compagnon && r.compagnon.nom === "Croc-Gris" && r.compagnon.token === "https://i/tok.png");
  verifier("un héros sans compagnon : null", r.sans === null);
  verifier("réécrite en entier : le compagnon ne se perd pas", r.ecrit.n === "Croc-Gris" && r.ecrit.d === "Un loup"
           && r.ecrit.i === "https://i/img.png" && r.ecrit.t === "https://i/tok.png", JSON.stringify(r.ecrit));
}

console.log("\n11. SON IMAGE EN PAYSAGE, PUIS SON PION");
{
  const r = await p.evaluate(async () => {
    localStorage.setItem("ivalis_OPENAI_API_KEY", "k"); localStorage.setItem("ivalis_CLOUDINARY_CLOUD_NAME", "c");
    localStorage.setItem("ivalis_CLOUDINARY_API_KEY", "k"); localStorage.setItem("ivalis_CLOUDINARY_API_SECRET", "s");
    window.__majs = [];
    const ok = await window.genererCompagnonEnArrierePlan({ prenom: "Lyra", compagnon: { nom: "Croc-Gris",
        description: "Un dragon colossal de trente mètres, aux écailles noires" } }, "PERSO_1");
    return { ok, majs: window.__majs.map(m => ({ chemin: m.chemin, cles: Object.keys(m.data), data: m.data })) };
  });
  const generation = appelsIA.find(a => /generations/.test(a.url));
  const corps = generation ? JSON.parse(generation.corps) : {};
  verifier("une génération en 1536×1024 (paysage)", corps.size === "1536x1024", corps.size);
  verifier("le prompt porte sa description, son nom, la taille d'un cheval et le fond magenta",
           /dragon colossal/.test(corps.prompt || "") && /Croc-Gris/.test(corps.prompt || "") && /cheval/.test(corps.prompt || "")
           && /MAGENTA/.test(corps.prompt || ""));
  const edition = appelsIA.find(a => /edits/.test(a.url));
  verifier("puis le pion : une édition à partir de son image (« animal companion »)", edition && /animal companion/.test(edition.corps));
  const image = r.majs.find(m => m.cles.includes("Compagnon_Image"));
  const pion = r.majs.find(m => m.cles.includes("Compagnon_Token"));
  verifier("écrits sur la fiche du héros : Compagnon_Image, puis Compagnon_Token", r.ok === true && image && pion
           && /Personnages\/PERSO_1/.test(image.chemin) && /Personnages\/PERSO_1/.test(pion.chemin)
           && !r.majs.some(m => m.cles.includes("URL_Token")), JSON.stringify(r.majs.map(m => m.cles)));
}

console.log("\n12. AU COMBAT : IL APPARAÎT AVEC LES HÉROS, AVEC SON PION");
{
  const r = await p.evaluate(async () => {
    document.getElementById("fenetre-combat").style.display = "block";
    window.ID_PARTIE_COURANTE = "PARTIE_T";
    window.PARTIE_DATA = { Spawn_Allies: { q: 0, r: 0 }, Spawn_Ennemis: { q: 8, r: 0 } };
    window.PLATEAU_VTT = { getCaseState: () => ({}), hexToPixel: (q, r) => ({ x: 300 + q * 60 + r * 30, y: 300 + r * 52 }),
                           pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {} };
    window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
    if (!document.getElementById("conteneur-tokens-vtt")) {
      const c = document.createElement("div"); c.id = "conteneur-tokens-vtt"; document.body.appendChild(c);
    }
    let enregistres = [];
    window.enregistrerPionsVTT = async (...ids) => { enregistres = ids; };
    window.TOKENS_VTT_DATA = {};
    window.__sets = [];
    const heros = window.persoDocVersFront("H1", { Classe: "Pisteur", Prenom_Personnage: "Lyra", URL_Token: "https://res.cloudinary.com/x/lyra.png",
        Compagnon_Nom: "Croc-Gris", Compagnon_Description: "Un loup", Compagnon_Image: "https://res.cloudinary.com/x/loup.png",
        Compagnon_Token: "https://res.cloudinary.com/x/loup_pion.png" });
    const autre = window.persoDocVersFront("H2", { Classe: "Sentinelle", Prenom_Personnage: "Bran", URL_Token: "https://res.cloudinary.com/x/bran.png" });
    window.PERSOS_PARTIE = [heros, autre];
    await window.genererTokensCombat();
    const doc = (window.__sets.find(x => /Monstres\/COMPAGNON_H1/.test(x.chemin)) || {}).data || null;
    const t = window.TOKENS_VTT_DATA;
    const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
    // Le document revient par l'écoute des monstres : une créature de son camp.
    const front = window.persoDocVersFront("COMPAGNON_H1", doc || {});
    front.estMonstre = true; front.compagnonDe = (doc || {}).Compagnon_De || "";
    window.PERSOS_PARTIE = [heros, autre, front];
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    const img = document.querySelector("#token-COMPAGNON_H1 .token-img-main");
    // La victoire ne l'attend pas, et il ne la fait pas à lui seul.
    window.estCombattantMort = (id) => id === "M1";
    window.xpDeLaCreature = () => 10;
    window.MONSTRES_PARTIE = [front];
    const seulGagne = window.combatGagne();
    window.MONSTRES_PARTIE = [front, { idPersonnage: "M1", statut: "Mort" }];
    const gagne = window.combatGagne(), xp = window.xpDeLaVictoire();
    return { doc, compagnon: t.COMPAGNON_H1, maitre: t.H1, autres: Object.keys(t), enregistres,
             adjacent: t.COMPAGNON_H1 && t.H1 ? dist(t.COMPAGNON_H1, t.H1) : -1,
             src: img && img.getAttribute("src"), classe: document.getElementById("token-COMPAGNON_H1")?.classList.contains("token-compagnon"),
             seulGagne, gagne, xp };
  });
  verifier("un document Monstres COMPAGNON_<héros> : son camp, 25 PV, 15 % d'esquive, parade 0",
           r.doc && r.doc.Camp === "Allié" && r.doc.Compagnon_De === "H1" && r.doc.PV_Max === 25 && r.doc.PV_Actuels === 25
           && r.doc.Esquive === 15 && r.doc.Parade === 0 && r.doc.Def_Physique === 0 && r.doc.Prenom_Personnage === "Croc-Gris",
           JSON.stringify(r.doc || {}).slice(0, 140));
  verifier("posé au contact de son maître, enregistré avec les héros", r.adjacent === 1 && r.enregistres.includes("COMPAGNON_H1")
           && r.enregistres.includes("H1"), `${r.adjacent} ${JSON.stringify(r.enregistres)}`);
  verifier("un seul compagnon : la Sentinelle n'en a pas", !r.autres.includes("COMPAGNON_H2"));
  verifier("sur le plateau : son propre pion", /loup_pion/.test(r.src || "") && r.classe, r.src);
  verifier("seul sur le plateau, il ne fait pas une victoire", r.seulGagne === false);
  verifier("debout, il n'empêche pas la victoire ; il ne rapporte pas d'XP", r.gagne === true && r.xp === 10, `${r.gagne} ${r.xp}`);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
