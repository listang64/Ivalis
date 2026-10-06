// LA CLASSE ORACLE.
//
// Nico : « Oracle : Lvl1 : +10 d'initiative. Lvl5 : COMP Arrêt du temps.
// Lvl10 : COMP Retour arrière. Arrêt du temps (ORACLE), 0 fatigue (une fois
// par combat) : permet de regarder l'initiative de tout le monde, et relancer
// une autre de ses compétences de son choix en définissant son initiative
// soi-même avec une petite popup qui apparaît. INIT 200. Retour arrière
// (ORACLE), 0 fatigue (une fois par combat) : agit comme un repos long, mais il
// doit choisir une autre compétence. Donc en gros il fait un repos long et
// ensuite il fait sa compétence avec sa fatigue mise à jour. »
// Ses réponses : le +10 sur ses compétences forgées seulement ; la fenêtre
// montre tout le monde trié par initiative, avec la compétence de chacun ; il
// joue donc deux fois dans la manche ; initiative libre de 0 à 199 ; la
// compétence relancée coûte sa fatigue, une compétence de son deck (pas une
// technique de classe, pas le repos long), grisée si trop chère ; le Retour
// arrière se choisit avec une compétence en préparation, le repos compte tout
// de suite pour ce qu'il peut se payer ; la compétence garde son initiative,
// le repos se prend au début de son tour ; pas d'Arrêt du temps ni de repos
// long avec un Retour arrière.
//
// Partie 1 : le VRAI code des règles (app.js, experience.js) et le VRAI noyau
// (moteur_pur, combat_etat, cerveau_combat), sans navigateur.
// Partie 2 : la vraie page (préparation, fenêtre de l'Arrêt du temps, fiche).
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat } from '../combat_etat.js';
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
const XP = { 1: 0, 4: 1800, 5: 2500, 9: 6400, 10: 7900 };
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

console.log("\n=========================================================");
console.log("  L'ORACLE");
console.log("=========================================================");

console.log("\n1. LES PALIERS");
{
    const a1 = w.atoutRace(oracle(1)), a5 = w.atoutRace(oracle(5)), a10 = w.atoutRace(oracle(10));
    verifier("niveau 1 : +10 d'initiative, pas de technique", a1.initiative === 10 && !(a1.techniques || []).length, JSON.stringify(a1));
    verifier("niveau 5 : l'Arrêt du temps", JSON.stringify(a5.techniques) === '["CLASSE_ARRET_TEMPS"]');
    verifier("niveau 10 : + le Retour arrière", JSON.stringify(a10.techniques) === '["CLASSE_ARRET_TEMPS","CLASSE_RETOUR_ARRIERE"]');
    const at = w.TECHNIQUES_CLASSE.CLASSE_ARRET_TEMPS, ra = w.TECHNIQUES_CLASSE.CLASSE_RETOUR_ARRIERE;
    verifier("Arrêt du temps : init 200, aucune fatigue, niveau 5", at.Initiative === 200 && at.Fatigue === 0 && at.niveau === 5 && at.classe === "Oracle");
    verifier("Retour arrière : aucune fatigue, niveau 10", ra.Fatigue === 0 && ra.niveau === 10 && ra.classe === "Oracle");
    verifier("la fiche l'écrit en clair", w.texteAtout("initiative", 10) === "+10 d'initiative sur ses compétences");
}

console.log("\n2. L'ARRÊT DU TEMPS : UNE SECONDE ENTRÉE DANS LA FILE, À L'INITIATIVE CHOISIE");
{
    const avecFile = (niveau = 5) => {
        const e = monde(niveau);
        e.file = [{ id: "O", carte: "CLASSE_ARRET_TEMPS", initiative: 200, pas: 0 },
                  { id: "M1", carte: "MC", initiative: 150, pas: 0 },
                  { id: "A", carte: "AC", initiative: 80, pas: 0 },
                  { id: "M2", carte: "MC", initiative: 40, pas: 0 }];
        return e;
    };
    const arret = (cible, initiative) => ({ id: "T1", type: "classe", acteur: "O", idCarte: "CLASSE_ARRET_TEMPS",
                                            ...(cible !== undefined ? { cible } : {}), ...(initiative !== undefined ? { initiative } : {}) });
    const e = avecFile();
    verifier("niveau 5 : accepté (compétence C2, initiative 100)", validerIntention(e, arret("C2", 100)).ok, validerIntention(e, arret("C2", 100)).raison || "");
    verifier("niveau 4 : il ne l'a pas", !validerIntention(avecFile(4), arret("C2", 100)).ok);
    verifier("sans compétence : refusé", !validerIntention(e, arret(undefined, 100)).ok);
    verifier("pas une technique de classe, pas le repos long",
             !validerIntention(e, arret("CLASSE_RETOUR_ARRIERE", 100)).ok && !validerIntention(e, arret("REPOS_LONG", 100)).ok);
    verifier("initiative hors de 0–199, ou pas entière : refusé",
             !validerIntention(e, arret("C2", 200)).ok && !validerIntention(e, arret("C2", -1)).ok
             && !validerIntention(e, arret("C2", 12.5)).ok && !validerIntention(e, arret("C2")).ok);
    verifier("0 et 199 : acceptés", validerIntention(e, arret("C2", 0)).ok && validerIntention(e, arret("C2", 199)).ok);

    const pas = appliquerIntention(e, arret("C2", 100));
    verifier("la file : M1 150, puis O (C2) à 100, puis A 80, M2 40", fileDe(pas.etat) === "M1:MC:150 O:C2:100 A:AC:80 M2:MC:40", fileDe(pas.etat));
    verifier("la technique est consommée, sans fatigue", pas.etat.combattants.O.techniquesUtilisees.includes("CLASSE_ARRET_TEMPS")
             && pas.etat.combattants.O.fatigue === 100);
    verifier("l'état reste cohérent (O une seule fois dans la file)", verifierEtatCombat(pas.etat).length === 0, verifierEtatCombat(pas.etat).join(" | "));
    verifier("rejoué depuis le journal : même file", fileDe(appliquerEntree(e, pas.entree)) === fileDe(pas.etat));
    verifier("une fois par combat", !validerIntention(Object.assign(clonerEtat(pas.etat), {
        file: [{ id: "O", carte: "CLASSE_ARRET_TEMPS", initiative: 200, pas: 0 }, ...pas.etat.file.filter(f => f.id !== "O")] }), arret("C2", 50)).ok);
    const titre = misEnScene(pas.entree.etapes.find(x => x.type === "techniqueClasse"), pas.etat);
    verifier("à l'écran : « ⏳ Arrêt du temps », puis « Rejouera à 100 »", titre && /Arrêt du temps/.test(titre.texte)
             && pas.entree.etapes.some(x => x.type === "message" && /Rejouera à 100/.test(x.texte)));
    verifier("la file projetée garde la marque", fileDepuisEtat(pas.etat).some(f => f.idPersonnage === "O" && f.arretDuTemps));

    const egal = appliquerIntention(avecFile(), arret("C2", 80));
    verifier("à égalité (80), il passe APRÈS celui qui y était", fileDe(egal.etat) === "M1:MC:150 A:AC:80 O:C2:80 M2:MC:40", fileDe(egal.etat));
    const vite = appliquerIntention(avecFile(), arret("C2", 199));
    verifier("à 199 : il rejoue tout de suite", vite.etat.file[0].id === "O" && vite.etat.file[0].carte === "C2");
    const fin = appliquerIntention(avecFile(), arret("C2", 0));
    verifier("à 0 : il joue en dernier", fin.etat.file[fin.etat.file.length - 1].id === "O");

    // Son second tour venu, il joue C2 et la paie.
    const second = clonerEtat(vite.etat);
    const carte = { id: "I2", type: "carte", acteur: "O", idCarte: "C2", coutFatigue: 30, attaques: [], alterations: [] };
    verifier("son second tour : la compétence choisie est acceptée", validerIntention(second, carte).ok, validerIntention(second, carte).raison || "");
    const joue = appliquerIntention(second, carte);
    verifier("…et coûte sa fatigue (100 − 30)", joue.etat.combattants.O.fatigue === 70 && joue.etat.file[0].id === "M1",
             `${joue.etat.combattants.O.fatigue} ${fileDe(joue.etat)}`);
}

console.log("\n3. LE RETOUR ARRIÈRE : LE REPOS AU DÉBUT DE SON TOUR, PUIS LA COMPÉTENCE");
{
    const prepa = (niveau = 10, extraO = { Fatigue_Actuelle: 20 }) => monde(niveau, extraO, { Phase_Combat: "Preparation" });
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
    const n9 = ouvrirManche(prepa(9), fileRA(true), creerDes(1)).etat.combattants.O;
    verifier("niveau 9 : il ne l'a pas — aucun repos", n9.fatigue === 20 && !(n9.techniquesUtilisees || []).length);
    const deja = prepa(); deja.combattants.O.techniquesUtilisees = ["CLASSE_RETOUR_ARRIERE"];
    verifier("déjà jouée dans ce combat : aucun repos", ouvrirManche(deja, fileRA(true), creerDes(1)).etat.combattants.O.fatigue === 20);
    const plein = ouvrirManche(prepa(10, { Fatigue_Actuelle: 100 }), fileRA(true), creerDes(1)).etat.combattants.O;
    verifier("jamais au-dessus du plein (100 → 110)", plein.fatigue === 110);
    const direct = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: [oracle(10, { Fatigue_Actuelle: 20 }), fiche("M1")],
        positions: POS, regles: REGLES, partie: { Tour_Combat: 1, Phase_Combat: "Resolution", File_Attente_Combat: fileRA(true) } });
    verifier("un combat qui s'ouvre sur lui : repos dès l'état de départ", direct.combattants.O.fatigue === 58
             && direct.file[0].reposPris === true);
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
console.log("\n4. EN PRÉPARATION : +10 D'INITIATIVE, LE RETOUR ARRIÈRE QUI ATTEND SA COMPÉTENCE");
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
    await window.jouerCarteCombat("CLASSE_ARRET_TEMPS");
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

    await window.jouerReposLong();
    const reposRefuse = ecrits.length === nbAvant && alertes.some(a => /Retour arrière/.test(a));
    await window.jouerCarteCombat("CLASSE_ARRET_TEMPS");
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
    return { ordre, c2Avant, c1, arret, rienEcrit, enAttente, c2Apres, cadreRA, fatigueChoix, choisissable, jauge,
             reposRefuse, arretRefuse, c2, vide, annule, sansRA };
  });
  verifier("le volet : ses compétences, puis Arrêt du temps et Retour arrière, puis le repos",
           JSON.stringify(r.ordre) === '["C1","C2","CLASSE_ARRET_TEMPS","CLASSE_RETOUR_ARRIERE","REPOS_LONG"]', JSON.stringify(r.ordre));
  verifier("une compétence forgée part avec +10 (40 → 50)", r.c1 && r.c1.initiative === 50 && !r.c1.retourArriere, JSON.stringify(r.c1));
  verifier("l'Arrêt du temps garde son 200 (pas de +10)", r.arret && r.arret.idCarte === "CLASSE_ARRET_TEMPS" && r.arret.initiative === 200);
  verifier("Retour arrière : rien n'est inscrit, il attend sa compétence", r.rienEcrit && r.enAttente === "O1");
  verifier("sa bannière est surlignée", /ban_cible/.test(r.cadreRA), r.cadreRA);
  verifier("le repos compte déjà : C2 (70) n'est plus grisée (50 + 38 = 88)",
           r.c2Avant && !r.c2Apres && r.fatigueChoix === 88, `${r.c2Avant} ${r.c2Apres} ${r.fatigueChoix}`);
  verifier("l'aperçu de C2 : « Choisir » possible, la jauge part de 88", r.choisissable && /88/.test(r.jauge), r.jauge.replace(/\s+/g, " "));
  verifier("pas de repos long en plus", r.reposRefuse);
  verifier("pas d'autre technique de classe avec lui", r.arretRefuse);
  verifier("C2 inscrite à 40 (30 + 10), marquée Retour arrière", r.c2 && r.c2.idCarte === "C2" && r.c2.initiative === 40 && r.c2.retourArriere === true,
           JSON.stringify(r.c2));
  verifier("…et l'attente est levée", r.vide === null);
  verifier("le choisir deux fois l'annule ; la carte suivante part sans lui", r.annule === null && r.sansRA && !r.sansRA.retourArriere);
}

console.log("\n5. SON TOUR VENU : LA FENÊTRE DE L'ARRÊT DU TEMPS");
{
  const r = await p.evaluate(async () => {
    window.PARTIE_DATA = { Phase_Combat: "Resolution", File_Attente_Combat: [
      { idPersonnage: "O1", idCarte: "CLASSE_ARRET_TEMPS", initiative: 200 },
      { idPersonnage: "M1", idCarte: "MC", initiative: 120 },
      { idPersonnage: "A1", idCarte: "REPOS_LONG", initiative: 0 }] };
    window.PERSOS_PARTIE.push({ idPersonnage: "A1", prenom: "Bran", camp: "Allié" });
    window.CACHE_COMPETENCES_GLOBAL.M1 = { MC: { Nom: "Coup de griffe", Initiative: 120, Fatigue: 0 } };
    const demandes = [];
    window.regimeDemande = { actif: () => true, enVol: () => false,
      etat: () => ({ combattants: { O1: { fatigue: 50 } } }),
      techniqueClasse: (...a) => demandes.push(a) };
    window.lancerTechniqueClasse("CLASSE_ARRET_TEMPS", "O1");
    const f = document.getElementById("fenetre-arret-temps");
    const lignes = [...f.querySelectorAll(".arret-temps-ligne")].map(l => l.textContent.replace(/\s+/g, " ").trim());
    const boutons = [...f.querySelectorAll(".arret-temps-competence")].map(b => [b.dataset.id, b.disabled]);
    const validerAvant = document.getElementById("arret-temps-valider").disabled;
    window.choisirCompetenceArretTemps("C2");                 // trop chère : ignorée
    const apresC2 = document.getElementById("arret-temps-valider").disabled;
    f.querySelector('.arret-temps-competence[data-id="C1"]').click();
    const initProposee = document.getElementById("arret-temps-initiative").value;
    document.getElementById("arret-temps-initiative").value = "120";
    await new Promise(r => setTimeout(r, 50));
    return { visible: getComputedStyle(f).display !== "none", titre: f.querySelector(".choix-rempart-titre").textContent,
             lignes, boutons, validerAvant, apresC2, initProposee, demandes };
  });
  await p.screenshot({ path: "/tmp/claude-0/oracle_arret_temps.png" });
  verifier("la fenêtre s'ouvre : « ⏳ Arrêt du temps »", r.visible && /Arrêt du temps/.test(r.titre));
  verifier("la manche, triée : lui (200), le Gnoll (120, Coup de griffe), Bran (repos)",
           r.lignes.length === 3 && /^200 Pythia Arrêt du temps/.test(r.lignes[0]) && /^120 Gnoll Coup de griffe/.test(r.lignes[1])
           && /Bran Repos long/.test(r.lignes[2]), JSON.stringify(r.lignes));
  verifier("ses compétences : C1 libre, C2 (70) grisée avec 50 d'énergie",
           JSON.stringify(r.boutons) === '[["C1",false],["C2",true]]', JSON.stringify(r.boutons));
  verifier("rien de choisi : « Arrêter le temps » éteint ; C2 ne se choisit pas", r.validerAvant && r.apresC2);
  verifier("C1 choisie : son initiative proposée (40 + 10 = 50)", r.initProposee === "50", r.initProposee);
  const lu = await p.evaluate(async () => {
    const demandes = [];
    window.regimeDemande.techniqueClasse = (...a) => demandes.push(a);
    window.lancerTechniqueClasse("CLASSE_ARRET_TEMPS", "O1");
    document.querySelector('#fenetre-arret-temps .arret-temps-competence[data-id="C1"]').click();
    document.getElementById("arret-temps-initiative").value = "120";
    window.validerArretDuTemps();
    window.lancerTechniqueClasse("CLASSE_ARRET_TEMPS", "O1");
    document.querySelector('#fenetre-arret-temps .arret-temps-competence[data-id="C1"]').click();
    document.getElementById("arret-temps-initiative").value = "250";
    window.validerArretDuTemps();
    demandes.cachee = getComputedStyle(document.getElementById("fenetre-arret-temps")).display === "none";
    return { demandes, cachee: demandes.cachee };
  }).then(x => Object.assign(x.demandes, { cachee: x.cachee }));
  verifier("valider : la fenêtre se ferme", lu.cachee);
  verifier("la demande part : Arrêt du temps, C1, initiative 120",
           JSON.stringify(lu[0]) === '["O1","CLASSE_ARRET_TEMPS","C1",null,{"initiative":120}]', JSON.stringify(lu[0]));
  verifier("250 tapé : ramené à 199", lu[1] && lu[1][4].initiative === 199, JSON.stringify(lu[1]));
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
  verifier("présentation et paliers Niv. 1 / 5 / 10", r.visible && JSON.stringify(r.niveaux) === '["Niv. 1","Niv. 5","Niv. 10"]');
  verifier("+10 d'initiative, Arrêt du temps et Retour arrière y sont dits",
           /\+10 d'initiative/.test(r.texte) && /Arrêt du temps/.test(r.texte) && /Retour arrière/.test(r.texte));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
