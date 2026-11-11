// LA CLASSE ORACLE.
//
// v355, la refonte des classes (Nico) : « NIVEAU 1 : +8 Initiative. Les
// attaques arcaniques réduisent l'initiative de l'ennemi en fonction de la
// fatigue accumulée : à partir de 30 Fatigue −5, de 60 −10, de 90 −15. La
// réduction s'applique au tour actuel et au tour suivant. NIVEAU 3 : −40 % de
// coût en fatigue pour les points investis dans « Initiative + ». +1
// compétence. NIVEAU 5 : COMPÉTENCE Retour dans le passé — tous les
// personnages reprennent les positions qu'ils occupaient 3 tours auparavant.
// NIVEAU 9 : COMPÉTENCE Retour arrière. »
// Ses réponses : la fatigue qui compte est le coût de l'attaque ; le +8 sur
// ses compétences forgées ; le Retour dans le passé remplace l'Arrêt du temps
// (une fois par combat, initiative 100, 0 fatigue ; moins de 3 manches : les
// positions du début) ; seules les positions changent, les KO et les
// nouveaux venus restent, une case prise renvoie à la case libre la plus
// proche.
// Le Retour arrière (inchangé, passé du niveau 10 au 9) : il se choisit avec
// une compétence en préparation ; au début de son tour, un repos long, puis
// la compétence avec la fatigue remise à jour.
//
// Partie 1 : le VRAI code des règles (app.js, experience.js) et le VRAI noyau
// (moteur_pur, combat_etat, cerveau_combat), sans navigateur.
// Partie 2 : la vraie page (préparation, Retour dans le passé, fiche).
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat } from '../combat_etat.js';
import { malusArcanique, resoudreCarte } from '../moteur_pur.js';
import { validerIntention, appliquerIntention, ouvrirManche, avancerFile } from '../cerveau_combat.js';
import { misEnScene, fileDepuisEtat } from '../pont_combat.js';
import { creerDes } from '../combat_etat.js';

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
const XP = { 1: 0, 3: 1200, 4: 1800, 5: 2500, 8: 5200, 9: 6400, 10: 7900 };
const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const oracle = (niveau, extra = {}) => fiche("O", { classe: "Oracle", xp: XP[niveau], ...extra });
// Humain : 110 de jauge (+10). Repos long : 35 % → 38.
const POS = { O: { q: 0, r: 0 }, M1: { q: 3, r: 0 }, M2: { q: 4, r: 0 }, A: { q: 0, r: 1 } };
const monde = (niveau = 10, extraO = {}, partie = {}) => {
    const fiches = [oracle(niveau, extraO), fiche("M1"), fiche("M2"), fiche("A")];
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: fiches, positions: POS,
                                     partie: { Tour_Combat: 1, ...partie }, regles: REGLES });
    e.ordre = ["O", "M1", "M2", "A"];
    if (!partie.Phase_Combat) e.phase = "Resolution";
    return e;
};
const fileDe = (e) => e.file.map(f => `${f.id}:${f.carte}:${f.initiative}`).join(" ");
const suiteDe = (e) => e.file.filter(f => f.id !== "O").map(f => `${f.id}:${f.carte}:${f.initiative}`).join(" ");

console.log("\n=========================================================");
console.log("  L'ORACLE");
console.log("=========================================================");

console.log("\n1. LES PALIERS");
{
    const a1 = w.atoutRace(oracle(1)), a3 = w.atoutRace(oracle(3)), a5 = w.atoutRace(oracle(5)), a9 = w.atoutRace(oracle(9));
    const c1 = w.atoutClasse ? w.atoutClasse(oracle(1)) : a1, c3 = w.atoutClasse ? w.atoutClasse(oracle(3)) : a3;
    verifier("niveau 1 : +8 d'initiative, l'arcane qui ralentit, pas de technique",
             a1.initiative === 8 && a1.arcaneRalentit === true && !(a1.techniques || []).length, JSON.stringify(a1));
    verifier("niveau 3 : Initiative + à −40 %, +1 compétence",
             a3.reductionInitiativePlus === 40 && (c3.competences || 0) - (c1.competences || 0) === 1, JSON.stringify(c3));
    verifier("niveau 5 : le Retour dans le passé (plus d'Arrêt du temps)", JSON.stringify(a5.techniques) === '["CLASSE_RETOUR_PASSE"]', JSON.stringify(a5.techniques));
    verifier("niveau 9 : + le Retour arrière", JSON.stringify(a9.techniques) === '["CLASSE_RETOUR_PASSE","CLASSE_RETOUR_ARRIERE"]');
    verifier("niveau 8 : pas encore le Retour arrière", !(w.atoutRace(oracle(8)).techniques || []).includes("CLASSE_RETOUR_ARRIERE"));
    const rp = w.TECHNIQUES_CLASSE.CLASSE_RETOUR_PASSE, ra = w.TECHNIQUES_CLASSE.CLASSE_RETOUR_ARRIERE;
    verifier("Retour dans le passé : init 100, aucune fatigue, niveau 5, sur soi",
             rp && rp.Initiative === 100 && rp.Fatigue === 0 && rp.niveau === 5 && rp.classe === "Oracle" && rp.cible === "soi");
    verifier("Retour arrière : aucune fatigue, niveau 9", ra.Fatigue === 0 && ra.niveau === 9 && ra.classe === "Oracle");
    verifier("l'Arrêt du temps n'existe plus", !w.TECHNIQUES_CLASSE.CLASSE_ARRET_TEMPS);
    verifier("la fiche l'écrit en clair", w.texteAtout("initiative", 8) === "+8 d'initiative sur ses compétences"
             && /arcaniques/.test(w.texteAtout("arcaneRalentit", true)) && /40 %/.test(w.texteAtout("reductionInitiativePlus", 40)));
}

console.log("\n2. L'ARCANE QUI RALENTIT : CETTE MANCHE ET LA SUIVANTE");
{
    verifier("le malus selon le coût : 29 → 0, 30 → 5, 59 → 5, 60 → 10, 90 → 15, 140 → 15",
             [29, 30, 59, 60, 90, 140].map(malusArcanique).join(",") === "0,5,5,10,15,15");
    const avecFile = (niveau = 1) => {
        const e = monde(niveau);
        e.file = [{ id: "O", carte: "C1", initiative: 120, pas: 0 },
                  { id: "M1", carte: "MC", initiative: 70, pas: 0 },
                  { id: "A", carte: "AC", initiative: 64, pas: 0 },
                  { id: "M2", carte: "MC", initiative: 40, pas: 0 }];
        return e;
    };
    const sort = (cout, extra = {}) => ({ id: "I1", type: "carte", acteur: "O", idCarte: "C1", coutFatigue: cout,
        attaques: [{ cibles: ["M1"], element: "Arcane", typeRes: "Magique", degats: 4, rangeMax: 5, ...extra }], alterations: [],
        jets: { parCible: { M1: {} } } });
    const e = avecFile();
    const pas = appliquerIntention(e, sort(60));
    verifier("validée", validerIntention(e, sort(60)).ok, validerIntention(e, sort(60)).raison || "");
    verifier("coût 60 : le Gnoll perd 10 cette manche (70 → 60) et passe derrière Bran (64)",
             suiteDe(pas.etat) === "A:AC:64 M1:MC:60 M2:MC:40", fileDe(pas.etat));
    const ralenti = pas.etat.combattants.M1.etats.find(x => x.nom === "Ralenti");
    verifier("…et porte « Ralenti » (−10, 2 manches)", ralenti && ralenti.malusInitiative === 10 && ralenti.duree === 2, JSON.stringify(ralenti));
    verifier("rejoué depuis le journal : même file, même état", fileDe(appliquerEntree(e, pas.entree)) === fileDe(pas.etat)
             && appliquerEntree(e, pas.entree).combattants.M1.etats.some(x => x.nom === "Ralenti"));
    verifier("l'état reste cohérent", verifierEtatCombat(pas.etat).length === 0, verifierEtatCombat(pas.etat).join(" | "));
    verifier("coût 29 : rien", suiteDe(appliquerIntention(avecFile(), sort(29)).etat) === suiteDe(avecFile()));
    verifier("un sort de feu : rien", suiteDe(appliquerIntention(avecFile(), sort(90, { element: "Feu" })).etat) === suiteDe(avecFile()));
    // Esquivé : le jet est tranché d'avance (noyau pur, resoudreCarte).
    const esquive = { ...sort(90), idLanceur: "O", jets: { parCible: { M1: { esquive: true } } } };
    const rEsq = resoudreCarte(avecFile(), esquive);
    verifier("esquivé : rien", !rEsq.etat.combattants.M1.etats.length && suiteDe(rEsq.etat) === suiteDe(avecFile()));
    const rTouche = resoudreCarte(avecFile(), { ...sort(90), idLanceur: "O" });
    verifier("touché, coût 90 : −15 (70 → 55)", rTouche.etat.file.find(f => f.id === "M1").initiative === 55);
    const sans = monde(1); sans.combattants.O.atouts.arcaneRalentit = false;
    sans.file = avecFile().file;
    verifier("sans l'atout (un autre mage) : rien", suiteDe(appliquerIntention(sans, sort(90)).etat) === suiteDe(avecFile()));

    // La manche suivante : son initiative baisse à l'ouverture.
    const prochaine = clonerEtat(pas.etat);
    prochaine.phase = "Preparation"; prochaine.file = [];
    prochaine.combattants.M1.etats = prochaine.combattants.M1.etats.map(x => x.nom === "Ralenti" ? { ...x, duree: 1 } : x);
    const ouverte = ouvrirManche(prochaine, [{ idPersonnage: "O", idCarte: "C1", initiative: 50 },
        { idPersonnage: "M1", idCarte: "MC", initiative: 55 }, { idPersonnage: "M2", idCarte: "MC", initiative: 30 }], creerDes(3));
    verifier("la manche suivante : le Gnoll ouvre à 55 − 10 = 45, derrière l'Oracle (50)",
             fileDe(ouverte.etat) === "O:C1:50 M1:MC:45 M2:MC:30", fileDe(ouverte.etat));
    verifier("rejoué depuis le journal", fileDe(appliquerEntree(prochaine, ouverte.entree)) === fileDe(ouverte.etat));
}

console.log("\n3. LE RETOUR ARRIÈRE : LE REPOS AU DÉBUT DE SON TOUR, PUIS LA COMPÉTENCE");
{
    const prepa = (niveau = 9, extraO = { Fatigue_Actuelle: 20 }) => monde(niveau, extraO, { Phase_Combat: "Preparation" });
    const fileRA = (oracleEnTete) => oracleEnTete
        ? [{ idPersonnage: "O", idCarte: "C3", initiative: 60, retourArriere: true }, { idPersonnage: "M1", idCarte: "MC", initiative: 50 }]
        : [{ idPersonnage: "M1", idCarte: "MC", initiative: 90 }, { idPersonnage: "O", idCarte: "C3", initiative: 60, retourArriere: true }];

    // En tête dès l'ouverture de la manche.
    const e = prepa();
    const pas = ouvrirManche(e, fileRA(true), creerDes(1));
    const O = pas.etat.combattants.O;
    verifier("en tête à l'ouverture : repos tout de suite (20 + 38 = 58)", O.fatigue === 58, String(O.fatigue));
    verifier("la technique est consommée", O.techniquesUtilisees.includes("CLASSE_RETOUR_ARRIERE"));
    verifier("l'entrée garde sa compétence, marquée « repos pris »",
             pas.etat.file[0].carte === "C3" && pas.etat.file[0].retourArriere && pas.etat.file[0].reposPris);
    verifier("rejoué depuis le journal : même fatigue", appliquerEntree(e, pas.entree).combattants.O.fatigue === 58);
    const scene = misEnScene(pas.entree.etapes.find(x => x.type === "techniqueClasse"), pas.etat);
    verifier("à l'écran : « ⏪ Retour arrière »", scene && /Retour arrière/.test(scene.texte));
    const carte = { id: "I3", type: "carte", acteur: "O", idCarte: "C3", coutFatigue: 50, attaques: [], alterations: [] };
    verifier("la compétence de 50 passe, avec la fatigue remise à jour", validerIntention(pas.etat, carte).ok);
    verifier("sans le repos (20), elle aurait été refusée", !validerIntention(Object.assign(clonerEtat(pas.etat), {
        combattants: { ...pas.etat.combattants, O: { ...pas.etat.combattants.O, fatigue: 20 } } }), carte).ok);
    const joue = appliquerIntention(pas.etat, carte);
    verifier("jouée : 58 − 50 = 8, pas de second repos", joue.etat.combattants.O.fatigue === 8, String(joue.etat.combattants.O.fatigue));

    // Pas en tête : le repos attend son tour.
    const e2 = prepa();
    const ouvre = ouvrirManche(e2, fileRA(false), creerDes(1));
    verifier("pas en tête : rien à l'ouverture", ouvre.etat.combattants.O.fatigue === 20);
    const apresM1 = avancerFile(ouvre.etat, creerDes(2));
    verifier("son tour arrive : le repos se prend (58)", apresM1.etat.combattants.O.fatigue === 58 && apresM1.etat.file[0].id === "O",
             `${apresM1.etat.combattants.O.fatigue} ${fileDe(apresM1.etat)}`);
    verifier("rejoué depuis le journal", appliquerEntree(ouvre.etat, apresM1.entree).combattants.O.fatigue === 58);
    verifier("la file projetée garde la marque", fileDepuisEtat(apresM1.etat)[0].retourArriere === true);

    // Les gardes.
    const n8 = ouvrirManche(prepa(8), fileRA(true), creerDes(1)).etat.combattants.O;
    verifier("niveau 8 : il ne l'a pas — aucun repos", n8.fatigue === 20 && !(n8.techniquesUtilisees || []).length);
    const deja = prepa(); deja.combattants.O.techniquesUtilisees = ["CLASSE_RETOUR_ARRIERE"];
    verifier("déjà jouée dans ce combat : aucun repos", ouvrirManche(deja, fileRA(true), creerDes(1)).etat.combattants.O.fatigue === 20);
    const plein = ouvrirManche(prepa(9, { Fatigue_Actuelle: 100 }), fileRA(true), creerDes(1)).etat.combattants.O;
    verifier("jamais au-dessus du plein (100 → 110)", plein.fatigue === 110);
    const direct = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: [oracle(9, { Fatigue_Actuelle: 20 }), fiche("M1")],
        positions: POS, regles: REGLES, partie: { Tour_Combat: 1, Phase_Combat: "Resolution", File_Attente_Combat: fileRA(true) } });
    verifier("un combat qui s'ouvre sur lui : repos dès l'état de départ", direct.combattants.O.fatigue === 58
             && direct.file[0].reposPris === true);
}

console.log("\n3 bis. LE RETOUR DANS LE PASSÉ : LES POSITIONS D'IL Y A 3 MANCHES");
{
    // Le passé se note à chaque ouverture de manche.
    let e = monde(5, {}, { Phase_Combat: "Preparation" });
    const fileManche = [{ idPersonnage: "O", idCarte: "C1", initiative: 50 }, { idPersonnage: "M1", idCarte: "MC", initiative: 40 }];
    const trace = [];
    for (let m = 1; m <= 5; m++) {
        e.manche = m; e.phase = "Preparation"; e.file = [];
        const pas = ouvrirManche(e, fileManche, creerDes(m));
        verifier(`manche ${m} : rejouée depuis le journal, même passé`, JSON.stringify(appliquerEntree(e, pas.entree).positionsPassees)
                 === JSON.stringify(pas.etat.positionsPassees));
        e = pas.etat;
        trace.push(e.positionsPassees.map(p => p.manche).join(""));
        e.combattants.M1.q = 3 + m;        // le Gnoll avance d'une case par manche
    }
    verifier("on ne garde que les 4 dernières manches", trace[4] === "2345", trace.join(" "));
    verifier("la manche 2 : le Gnoll était en (4,0)", e.positionsPassees.find(p => p.manche === 2).positions.M1.q === 4);

    // Le lancer, manche 5 : retour aux positions de la manche 2.
    const lancer = { id: "R1", type: "classe", acteur: "O", idCarte: "CLASSE_RETOUR_PASSE" };
    e.phase = "Resolution";
    e.file = [{ id: "O", carte: "CLASSE_RETOUR_PASSE", initiative: 100, pas: 0 }, { id: "M1", carte: "MC", initiative: 40, pas: 0 }];
    e.combattants.O.q = 1; e.combattants.A.q = 2; e.combattants.A.r = 2;
    verifier("niveau 5 : accepté", validerIntention(e, lancer).ok, validerIntention(e, lancer).raison || "");
    const n4 = clonerEtat(e); n4.combattants.O.atouts.techniques = [];
    verifier("sans la technique (niveau 4) : refusé", !validerIntention(n4, lancer).ok);
    const pas = appliquerIntention(e, lancer);
    const pos = (id) => `${pas.etat.combattants[id].q},${pas.etat.combattants[id].r}`;
    verifier("manche 5 (Gnoll en (8,0)) → les positions de la manche 2 : Gnoll (4,0), Oracle (0,0), Bran (0,1)",
             pos("M1") === "4,0" && pos("O") === "0,0" && pos("A") === "0,1", `${pos("M1")} ${pos("O")} ${pos("A")}`);
    verifier("seules les positions changent (PV, fatigue)", pas.etat.combattants.M1.pv === e.combattants.M1.pv
             && pas.etat.combattants.O.fatigue === e.combattants.O.fatigue);
    verifier("rejoué depuis le journal : mêmes cases", JSON.stringify(appliquerEntree(e, pas.entree).combattants) === JSON.stringify(pas.etat.combattants));
    verifier("l'état reste cohérent", verifierEtatCombat(pas.etat).length === 0, verifierEtatCombat(pas.etat).join(" | "));
    verifier("une fois par combat", !validerIntention(Object.assign(clonerEtat(pas.etat), { file: e.file }), lancer).ok);
    const titre = misEnScene(pas.entree.etapes.find(x => x.type === "techniqueClasse"), pas.etat);
    verifier("à l'écran : « ⌛ Retour dans le passé »", titre && /Retour dans le passé/.test(titre.texte));

    // Moins de 3 manches : le début du combat.
    const tot = clonerEtat(e); tot.manche = 3;
    tot.positionsPassees = [{ manche: 1, positions: { O: { q: 0, r: 0 }, M1: { q: 9, r: 0 }, A: { q: 0, r: 1 } } },
                            { manche: 2, positions: { O: { q: 0, r: 0 }, M1: { q: 8, r: 0 }, A: { q: 0, r: 1 } } }];
    verifier("manche 3 (pas encore 3 manches jouées) : le début du combat",
             appliquerIntention(tot, lancer).etat.combattants.M1.q === 9);

    // Une case prise par quelqu'un qui n'a pas de passé (un nouveau venu) :
    // la case libre la plus proche. Deux qui échangent : sans se gêner.
    const pris = clonerEtat(e);
    pris.combattants.M2.q = 4; pris.combattants.M2.r = 0;     // M2 n'est pas dans le passé
    pris.positionsPassees = pris.positionsPassees.map(p => ({ ...p, positions: Object.fromEntries(Object.entries(p.positions).filter(([k]) => k !== "M2")) }));
    const apres = appliquerIntention(pris, lancer).etat.combattants;
    verifier("sa case est prise (par un nouveau venu) : la libre la plus proche", `${apres.M2.q},${apres.M2.r}` === "4,0"
             && !(apres.M1.q === 4 && apres.M1.r === 0) && Math.abs(apres.M1.q - 4) + Math.abs(apres.M1.r) <= 2, `${apres.M1.q},${apres.M1.r}`);
    const echange = clonerEtat(e);
    echange.combattants.O.q = 0; echange.combattants.O.r = 1; echange.combattants.A.q = 0; echange.combattants.A.r = 0;
    const ech = appliquerIntention(echange, lancer).etat.combattants;
    verifier("deux qui ont échangé leurs cases reprennent chacun la sienne", ech.O.r === 0 && ech.A.r === 1 && ech.O.q === 0 && ech.A.q === 0);
    const ko = clonerEtat(e); ko.combattants.M1.aTerre = true; ko.combattants.M1.pv = 0;
    verifier("un KO reste où il est", appliquerIntention(ko, lancer).etat.combattants.M1.q === e.combattants.M1.q);
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
console.log("\n4. EN PRÉPARATION : +8 D'INITIATIVE, LE RETOUR ARRIÈRE QUI ATTEND SA COMPÉTENCE");
{
  const r = await p.evaluate(async () => {
    document.getElementById("fenetre-combat").style.display = "block";
    window.PERSOS_PARTIE = [
      { idPersonnage: "O1", prenom: "Pythia", classe: "Oracle", xp: 7900, couleur: "#335", camp: "Allié", race: "Humain",
        deckEquipe: ["C1", "C2"], PV_Max: 50, PV_Actuels: 50, Fatigue_Max: 100, fatigueActuelle: 50 },
      { idPersonnage: "M1", prenom: "Gnoll", camp: "Ennemi", estMonstre: true, PV_Max: 40, PV_Actuels: 40 }
    ];
    window.TOKENS_VTT_DATA = { O1: { q: 0, r: 0 }, M1: { q: 2, r: 0 } };
    window.CACHE_COMPETENCES_GLOBAL = { O1: {
      C1: { Nom: "Vision", Arme: "", Initiative: 40, Fatigue: 10, Effets_Compiles: [] },
      C2: { Nom: "Oracle de feu", Arme: "", Initiative: 30, Fatigue: 70, Effets_Compiles: [] } } };
    window.COMPETENCES_CACHE = {};
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]]; window.COMBAT_INDEX_PERSO = 0;
    window.PARTIE_DATA = { Phase_Combat: "Preparation", File_Attente_Combat: [] };
    window.ID_PARTIE_COURANTE = "P";
    window.chargerCompetencesCombat("O1", "#335");
    const ban = (id) => document.getElementById("combat-carte-" + id);
    const ordre = [...document.querySelectorAll("#combat-liste-competences .banniere-carte-combat")].map(x => x.dataset.cardId);
    const c2Avant = ban("C2").classList.contains("banniere-epuisee");

    const alertes = []; window.alert = (m) => alertes.push(m);
    const ecrits = [];
    window.modifierPartieOuEchec = async (f) => { const res = f({ Phase_Combat: "Preparation", File_Attente_Combat: [] }); ecrits.push(res && res.maj); return { ok: true }; };
    window.avecCarteJouee = (d, id) => [id]; window.toutLeMondeAJoue = () => false;
    const derniere = () => { const e = ecrits[ecrits.length - 1]; return e && e.File_Attente_Combat && e.File_Attente_Combat[0]; };

    await window.jouerCarteCombat("C1");
    const c1 = derniere();
    await window.jouerCarteCombat("CLASSE_RETOUR_PASSE");
    const arret = derniere();

    // Le Retour arrière : rien ne part, il attend sa compétence.
    const nbAvant = ecrits.length;
    await window.jouerCarteCombat("CLASSE_RETOUR_ARRIERE");
    const rienEcrit = ecrits.length === nbAvant;
    const enAttente = window.RETOUR_ARRIERE_EN_ATTENTE;
    const c2Apres = ban("C2").classList.contains("banniere-epuisee");
    const cadreRA = document.getElementById("cadre-combat-CLASSE_RETOUR_ARRIERE").style.backgroundImage;
    const fatigueChoix = window.fatiguePourChoisir(window.PERSOS_PARTIE[0]);
    // L'aperçu de C2 : la jauge part de l'énergie après le repos, et « Choisir » est possible.
    await window.afficherApercuCarteHD("C2", false, true);
    const choisissable = window.CARTE_APERCU && window.CARTE_APERCU.choisissable;
    const jauge = (document.querySelector("#apercu-carte-hd-competence .jauge-energie-libelle") || {}).textContent || "";
    // LE RAFRAÎCHISSEMENT SUIVANT (Nico : « on peut sélectionner une autre
    // compétence, mais après tout se grise, on n'a pas le temps »). Chaque
    // nouvelle de la partie repasse par actualiserEtatCarteCombat : il
    // regrisait C2 et la désélectionnait avec l'énergie d'AVANT le repos.
    window.CARTE_EN_APERCU = null;   // l'aperçu ci-dessus fermé : un vrai clic de sélection
    window.gererClicCarteCombat("C2");
    const c2Choisie = ban("C2").dataset.actif;
    window.actualiserEtatCarteCombat();
    window.actualiserEtatCarteCombat();
    const apresRafraichi = { grisee: ban("C2").classList.contains("banniere-epuisee"), actif: ban("C2").dataset.actif,
                             c1: ban("C1").classList.contains("banniere-epuisee") };

    await window.jouerReposLong();
    const reposRefuse = ecrits.length === nbAvant && alertes.some(a => /Retour arrière/.test(a));
    await window.jouerCarteCombat("CLASSE_RETOUR_PASSE");
    const arretRefuse = ecrits.length === nbAvant && alertes.some(a => /technique de classe/.test(a));

    await window.jouerCarteCombat("C2");
    const c2 = derniere();
    const vide = window.RETOUR_ARRIERE_EN_ATTENTE;

    // Choisi deux fois : annulé.
    await window.jouerCarteCombat("CLASSE_RETOUR_ARRIERE");
    await window.jouerCarteCombat("CLASSE_RETOUR_ARRIERE");
    const annule = window.RETOUR_ARRIERE_EN_ATTENTE;
    await window.jouerCarteCombat("C1");
    const sansRA = derniere();
    return { ordre, c2Avant, c1, arret, rienEcrit, enAttente, c2Apres, cadreRA, fatigueChoix, choisissable, jauge, c2Choisie, apresRafraichi,
             reposRefuse, arretRefuse, c2, vide, annule, sansRA };
  });
  verifier("le volet : ses compétences, puis Retour dans le passé et Retour arrière, puis le repos",
           JSON.stringify(r.ordre) === '["C1","C2","CLASSE_RETOUR_PASSE","CLASSE_RETOUR_ARRIERE","REPOS_LONG"]', JSON.stringify(r.ordre));
  verifier("une compétence forgée part avec +8 (40 → 48)", r.c1 && r.c1.initiative === 48 && !r.c1.retourArriere, JSON.stringify(r.c1));
  verifier("le Retour dans le passé garde son 100 (pas de +8)", r.arret && r.arret.idCarte === "CLASSE_RETOUR_PASSE" && r.arret.initiative === 100);
  verifier("Retour arrière : rien n'est inscrit, il attend sa compétence", r.rienEcrit && r.enAttente === "O1");
  verifier("sa bannière est surlignée", /ban_cible/.test(r.cadreRA), r.cadreRA);
  verifier("le repos compte déjà : C2 (70) n'est plus grisée (50 + 38 = 88)",
           r.c2Avant && !r.c2Apres && r.fatigueChoix === 88, `${r.c2Avant} ${r.c2Apres} ${r.fatigueChoix}`);
  verifier("l'aperçu de C2 : « Choisir » possible, la jauge part de 88", r.choisissable && /88/.test(r.jauge), r.jauge.replace(/\s+/g, " "));
  verifier("C2 sélectionnée après le Retour arrière", r.c2Choisie === "true", r.c2Choisie);
  verifier("le rafraîchissement suivant ne regrise pas C2 et ne la désélectionne pas",
           r.apresRafraichi.grisee === false && r.apresRafraichi.actif === "true" && r.apresRafraichi.c1 === false,
           JSON.stringify(r.apresRafraichi));
  verifier("pas de repos long en plus", r.reposRefuse);
  verifier("pas d'autre technique de classe avec lui", r.arretRefuse);
  verifier("C2 inscrite à 38 (30 + 8), marquée Retour arrière", r.c2 && r.c2.idCarte === "C2" && r.c2.initiative === 38 && r.c2.retourArriere === true,
           JSON.stringify(r.c2));
  verifier("…et l'attente est levée", r.vide === null);
  verifier("le choisir deux fois l'annule ; la carte suivante part sans lui", r.annule === null && r.sansRA && !r.sansRA.retourArriere);
}

console.log("\n5. SON TOUR VENU : LE RETOUR DANS LE PASSÉ PART SANS FENÊTRE ; LA FORGE");
{
  const r = await p.evaluate(async () => {
    const demandes = [];
    window.regimeDemande = { actif: () => true, enVol: () => false,
      etat: () => ({ combattants: { O1: { fatigue: 50 } } }),
      techniqueClasse: (...a) => demandes.push(a) };
    window.lancerTechniqueClasse("CLASSE_RETOUR_PASSE", "O1");
    // La Forge : « Initiative + » (3 PT le cran, +8) pour un Oracle niveau 1, puis niveau 3.
    const initPlus = { id: "INIT", Nom: "Initiative +", Cout_PT: "3", Valeur: "8" };
    const act = { baseEffet: { id: "COUP", Nom: "Coup", Cout_PT: "4" }, count: 1, mods: { INIT: 2 }, zoneHexes: [], baseDuree: 0, modsDuree: {} };
    const n1 = window.coutDUneActionForge(act, [initPlus], { classe: "Oracle", race: "Humain", xp: 0 }, 5);
    const n3 = window.coutDUneActionForge(act, [initPlus], { classe: "Oracle", race: "Humain", xp: 1200 }, 5);
    const autre = window.coutDUneActionForge(act, [initPlus], { classe: "Assassin", race: "Humain", xp: 1200 }, 5);
    const socle = window.coutDUneActionForge({ baseEffet: initPlus, count: 2, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} },
                                             [initPlus], { classe: "Oracle", race: "Humain", xp: 1200 }, 5);
    return { demandes, n1, n3, autre, socle };
  });
  verifier("lancé : la demande part tout de suite (aucune fenêtre)",
           JSON.stringify(r.demandes[0]) === '["O1","CLASSE_RETOUR_PASSE"]', JSON.stringify(r.demandes));
  verifier("Forge, niveau 1 : 2 crans d'Initiative + coûtent 6 PT (+ 4 du coup)", Math.abs(r.n1.cout - 10) < 1e-9, JSON.stringify(r.n1));
  verifier("Forge, niveau 3 : 40 % de moins sur l'Initiative + (3,6 PT), le coup ne change pas", Math.abs(r.n3.cout - 7.6) < 1e-9, JSON.stringify(r.n3));
  verifier("…et l'initiative gagnée reste la même (+8 par cran, sa fatigue remboursée)",
           Math.abs(r.n1.initBonus - (16 + 30)) < 1e-9 && Math.abs(r.n3.initBonus - (16 + 18)) < 1e-9, `${r.n1.initBonus} ${r.n3.initBonus}`);
  verifier("une autre classe : prix plein", Math.abs(r.autre.cout - 10) < 1e-9);
  verifier("Initiative + en effet de base : la même ristourne (2 × 1,8)", Math.abs(r.socle.cout - 3.6) < 1e-9, JSON.stringify(r.socle));
}

console.log("\n6. LA FICHE DE CLASSE");
{
  const r = await p.evaluate(async () => {
    document.getElementById("fenetre-combat").style.display = "none";
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    await window.ouvrirChoixClasse();
    window.ouvrirFicheClasse("CLASSE_ORACLE");
    const d = document.getElementById("descriptif-fiche-classe");
    return { visible: getComputedStyle(d).display !== "none",
             niveaux: [...d.querySelectorAll(".palier-classe-niveau")].map(x => x.textContent.trim()), texte: d.textContent };
  });
  await p.screenshot({ path: "/tmp/claude-0/oracle_classe.png" });
  verifier("présentation et paliers Niv. 1 / 3 / 5 / 9", r.visible && JSON.stringify(r.niveaux) === '["Niv. 1","Niv. 3","Niv. 5","Niv. 9"]', JSON.stringify(r.niveaux));
  verifier("+8 d'initiative, l'arcane, Initiative + à −40 %, Retour dans le passé et Retour arrière y sont dits",
           /\+8 d'initiative/.test(r.texte) && /arcaniques/.test(r.texte) && /40 %/.test(r.texte)
           && /Retour dans le passé/.test(r.texte) && /Retour arrière/.test(r.texte) && !/Arrêt du temps/.test(r.texte));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
