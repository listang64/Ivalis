// LA CLASSE CHASSEUR DE MAGES.
//
// Nico : « lvl1 : +10 % Résistance magique (passé à 13 % ensuite). lvl5 : SKILL Lumière. lvl10 : tous
// les sorts de lumière ont 30 % de chance d'aveugler la cible et tous les
// personnages adjacents. Nouvel effet de combat : Lumières (CHASSEUR DE MAGE),
// 1 pt, INTELLIGENCE, 15 % de chance d'ignorer la résistance magique de la
// cible sur ce sort (max 60 %). »
// Ses réponses : un sous-effet, dans les menus Magique et Physique, posable
// seulement sur une action à dégâts magiques ; un jet par cible, imposé par un
// critique ; réservé à la classe dès le niveau 5, jamais aux monstres ; au
// niveau 10, un jet par cible touchée, qui aveugle la cible et les ENNEMIS
// qui la touchent, pas d'esquive pour les voisins, l'Aveuglement normal.
//
// Puis, Nico : « chasseur de mage : lvl1 : +10% Résistance magique / SKILL :
// Lumière : 15% chance d'ignorer la résistance magique de la cible sur ce sort
// (Max 60%) et 8% chance d'aveugler /// lvl5 : Compétence : Bouclier
// anti-magie : 0 fatigue, sur deux tours renvoie tous les dégâts magiques à la
// cible, INIT 200 /// lvl10 : Appel de la lumière, 0 fatigue, aveugle tous les
// combattants sur la map. » (Et : « Appel de la lumière aveugle tout le monde
// sur le champ de bataille », lui compris.) L'aveuglement de la Lumière ne prend plus que sa
// cible.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree } from '../combat_etat.js';
import { resoudreCarte, tirerDesCarte, defMagiqueDe, DUREE_AVEUGLE_LUMIERE, ETAT_ANTIMAGIE } from '../moteur_pur.js';
import { validerIntention, appliquerIntention, vieillirLesEtats } from '../cerveau_combat.js';
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
const chasseur = (niveau, extra = {}) => fiche("C", { classe: "Chasseur de mages", xp: XP[niveau], ...extra });

// C en (0,0) ; M1 (la cible) en (2,0) ; M2 (2,-1) et M3 (3,0) touchent M1 ;
// A (allié de C) en (1,1) touche M1 aussi ; M4 (6,0) loin.
const monde = (niveau = 10) => {
    const fiches = [chasseur(niveau), fiche("M1"), fiche("M2"), fiche("M3"), fiche("M4"), fiche("A")];
    const pos = { C: { q: 0, r: 0 }, M1: { q: 2, r: 0 }, M2: { q: 2, r: -1 }, M3: { q: 3, r: 0 }, M4: { q: 6, r: 0 }, A: { q: 1, r: 1 } };
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: fiches, positions: pos,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["C", "M1", "M2", "M3", "M4", "A"];
    e.phase = "Resolution";
    Object.values(e.combattants).forEach(c => { if (c.id.startsWith("M")) c.def.magique = 50; });
    return e;
};
// Des dés qui tombent toujours sur 1 (tout réussit), ou toujours sur 100.
const desA = (v) => ({ d100: () => v, parmi: (l) => l[0], fraction: () => 0, graine: () => 1 });
const sort = (chance, extra = {}) => ({ type: "carte", idLanceur: "C", idCarte: "S", critique: !!extra.critique,
    attaques: [{ nom: "Attaque Magique", valeurBrute: 10, typeRes: extra.typeRes || "Magique", rangeMax: 3,
                 ...(chance ? { chanceLumiere: chance, iconeAveugle: "oeil.svg" } : {}), cibles: ["M1"] }],
    alterations: [] });
const jouer = (e, action, des) => resoudreCarte(e, { ...action, jets: tirerDesCarte(e, action, "C", action.critique, des) });
const aveugle = (c) => (c.etats || []).find(x => x.nom === "Aveuglé");

console.log("\n=========================================================");
console.log("  LE CHASSEUR DE MAGES");
// =========================================================================
console.log("\n1. LES PALIERS : +10 RÉSISTANCE MAGIQUE ET LUMIÈRE, BOUCLIER ANTI-MAGIE, APPEL DE LA LUMIÈRE");
// =========================================================================
{
    const a1 = w.atoutClasse(chasseur(1)), a5 = w.atoutClasse(chasseur(5)), a10 = w.atoutClasse(chasseur(10));
    verifier("niveau 1 : +10 de défense magique, Lumière, 8 % d'aveugler",
             a1.defMagique === 10 && JSON.stringify(a1.effets) === '["EFF_LUMIERE"]' && a1.lumiereAveugle === 8
             && !(a1.techniques || []).length, JSON.stringify(a1));
    verifier("niveau 5 : le Bouclier anti-magie", JSON.stringify(a5.techniques) === '["CLASSE_BOUCLIER_ANTIMAGIE"]');
    verifier("niveau 10 : + l'Appel de la lumière (plus de 30 %)",
             JSON.stringify(a10.techniques) === '["CLASSE_BOUCLIER_ANTIMAGIE","CLASSE_APPEL_LUMIERE"]' && a10.lumiereAveugle === 8);
    const ba = w.TECHNIQUES_CLASSE.CLASSE_BOUCLIER_ANTIMAGIE, al = w.TECHNIQUES_CLASSE.CLASSE_APPEL_LUMIERE;
    verifier("Bouclier anti-magie : init 200, aucune fatigue, sur soi",
             ba.Initiative === 200 && ba.Fatigue === 0 && ba.cible === "soi" && ba.niveau === 5);
    verifier("Appel de la lumière : aucune fatigue, niveau 10", al.Fatigue === 0 && al.niveau === 10 && al.cible === "soi");
    verifier("la fiche annonce +10 de résistance magique",
             w.defMagiqueCombattant(chasseur(1)) === w.defMagiqueCombattant(fiche("X")) + 10);
    const e = monde(1);
    verifier("en combat : défense magique 10, atout d'aveuglement 8",
             defMagiqueDe(e.combattants.C) === 10 && e.combattants.C.atouts.lumiereAveugle === 8);
}

// =========================================================================
console.log("\n2. LUMIÈRE : LE SORT PASSE OUTRE LA DÉFENSE MAGIQUE");
// =========================================================================
{
    const sansLumiere = jouer(monde(5), sort(0), desA(100)).etat.combattants.M1.pv;
    verifier("sans Lumière : 10 magiques sur 50 % de défense → 5", sansLumiere === 95, String(sansLumiere));
    const prend = jouer(monde(5), sort(60), desA(1)).etat.combattants.M1.pv;
    verifier("Lumière qui prend : les 10, sans défense magique", prend === 90, String(prend));
    const rate = jouer(monde(5), sort(15), desA(50)).etat.combattants.M1.pv;
    verifier("Lumière qui rate (50 > 15) : la défense compte", rate === 95, String(rate));
    const crit = monde(5);
    const r = jouer(crit, sort(15, { critique: true }), desA(50)).etat.combattants.M1.pv;
    verifier("un critique l'impose (20 sans défense)", r === 80, String(r));
    const phys = monde(5);
    phys.combattants.M1.def.physique = 50;
    verifier("sur un coup physique, elle ne fait rien", jouer(phys, sort(60, { typeRes: "Physique" }), desA(1)).etat.combattants.M1.pv === 95);
    // Une carte sans Lumière ne tire pas un dé de plus.
    let tires = 0;
    tirerDesCarte(monde(10), sort(0), "C", false, { ...desA(100), d100: () => { tires++; return 100; } });
    verifier("une carte sans Lumière ne consomme aucun dé de plus", tires === 1, `${tires} dé(s)`);
    const e = monde(5);
    const action = sort(60);
    const pas = jouer(e, action, desA(1));
    verifier("rejoué depuis le journal : mêmes PV", appliquerEntree(e, { etapes: pas.etapes }).combattants.M1.pv === 90);
}

// =========================================================================
console.log("\n3. LE SORT DE LUMIÈRE AVEUGLE SA CIBLE (8 %), DÈS LE NIVEAU 1");
// =========================================================================
{
    const e = monde(1);
    const r = jouer(e, sort(15), desA(1));
    const c = r.etat.combattants;
    verifier("la cible M1 est aveuglée, 2 manches, 4 cases autour d'elle",
             !!aveugle(c.M1) && aveugle(c.M1).duree === DUREE_AVEUGLE_LUMIERE && aveugle(c.M1).cases.length === 4
             && aveugle(c.M1).cases.every(h => Math.abs(h.q - 2) <= 1 && Math.abs(h.r) <= 1), JSON.stringify(aveugle(c.M1)));
    verifier("ses voisins (M2, M3), l'allié, le Chasseur : non",
             !aveugle(c.M2) && !aveugle(c.M3) && !aveugle(c.A) && !aveugle(c.M4) && !aveugle(c.C));
    verifier("l'écran le dit : « Éblouis »", r.etapes.some(x => x.type === "message" && /blouis/.test(x.texte)));
    const rejoue = appliquerEntree(e, { etapes: r.etapes }).combattants;
    verifier("rejoué depuis le journal : aveuglé", !!aveugle(rejoue.M1));

    // Le jet de 8 % raté : personne. (Dés dans l'ordre : esquive, Lumière,
    // puis l'aveuglement — le 3e tombe sur 9.)
    let n = 0;
    const jets = tirerDesCarte(monde(1), sort(15), "C", false, { ...desA(1), d100: () => { n++; return n === 3 ? 9 : 1; } });
    verifier("le jet d'aveuglement raté (9 > 8) : rien", jets.parCible.M1.lumiereAveugle === false && !jets.parCible.M1.noirLumiere,
             JSON.stringify(jets.parCible.M1));
    n = 0;
    const jets8 = tirerDesCarte(monde(1), sort(15), "C", false, { ...desA(1), d100: () => { n++; return n === 3 ? 8 : 1; } });
    verifier("8 : réussi", jets8.parCible.M1.lumiereAveugle === true);

    const esq = monde(1);
    esq.combattants.M1.def.esquive = 100;
    verifier("la cible esquive : pas d'aveuglement", !aveugle(jouer(esq, sort(15), desA(1)).etat.combattants.M1));
    const imm = monde(1);
    imm.combattants.M1.atouts.immunites = ["Aveuglé"];
    const ri = jouer(imm, sort(15), desA(1));
    verifier("une cible immunisée ne l'est pas", !aveugle(ri.etat.combattants.M1)
             && ri.etapes.some(x => x.type === "etatRate" && x.cible === "M1" && x.immunise));
    const sansLum = jouer(monde(10), sort(0), desA(1)).etat.combattants;
    verifier("un sort sans Lumière : pas d'aveuglement", !aveugle(sansLum.M1));
}

// =========================================================================
console.log("\n3 bis. LE BOUCLIER ANTI-MAGIE : LES SORTS REPARTENT SUR LEUR LANCEUR");
// =========================================================================
{
    const enTete = (e, id, carte) => { e.file = [{ id, carte, initiative: 200, pas: 0 }, { id: "M1", carte: "X", initiative: 10, pas: 0 }]; return e; };
    const bouclier = { id: "B1", type: "classe", acteur: "C", idCarte: "CLASSE_BOUCLIER_ANTIMAGIE" };
    const e = enTete(monde(5), "C", "CLASSE_BOUCLIER_ANTIMAGIE");
    verifier("niveau 5 : accepté", validerIntention(e, bouclier).ok, validerIntention(e, bouclier).raison || "");
    verifier("niveau 4 : il ne l'a pas", !validerIntention(enTete(monde(4), "C", "CLASSE_BOUCLIER_ANTIMAGIE"), bouclier).ok);
    const pas = appliquerIntention(e, bouclier);
    const etat = (pas.etat.combattants.C.etats || []).find(x => x.nom === ETAT_ANTIMAGIE);
    verifier("l'état sur lui, 2 manches, aucune fatigue", etat && etat.duree === 2 && pas.etat.combattants.C.fatigue === 100);
    verifier("une fois par combat", !validerIntention(enTete(clonerEtat(pas.etat), "C", "CLASSE_BOUCLIER_ANTIMAGIE"), bouclier).ok);
    const titre = misEnScene(pas.entree.etapes.find(x => x.type === "techniqueClasse"), pas.etat);
    verifier("à l'écran : « 🔮 Bouclier anti-magie »", titre && /Bouclier anti-magie/.test(titre.texte));

    // M1 lui lance 20 magiques : M1 les prend (50 % de défense → 10), lui rien.
    const frappe = (typeRes, valeur = 20) => resoudreCarte(clonerEtat(pas.etat), { type: "carte", idLanceur: "M1", idCarte: "X", critique: false,
        attaques: [{ nom: "Boule", valeurBrute: valeur, typeRes, isRanged: true, rangeMax: 3, cibles: ["C"] }], alterations: [],
        jets: { attaqueRatee: false, parCible: { C: { esquive: false, etats: {} } } } });
    const r = frappe("Magique");
    verifier("un sort sur lui : il ne prend rien", r.etat.combattants.C.pv === 100, String(r.etat.combattants.C.pv));
    verifier("le lanceur prend son propre sort, avec ses défenses (20 → 10)", r.etat.combattants.M1.pv === 90, String(r.etat.combattants.M1.pv));
    verifier("ça se dit : « 🔮 Renvoyé ! »", r.etapes.some(x => x.type === "message" && /Renvoyé/.test(x.texte)));
    verifier("rejoué depuis le journal : mêmes PV", appliquerEntree(pas.etat, { etapes: r.etapes }).combattants.M1.pv === 90);
    const phys = frappe("Physique");
    verifier("un coup physique, lui, le touche", phys.etat.combattants.C.pv === 80 && phys.etat.combattants.M1.pv === 100,
             `${phys.etat.combattants.C.pv} / ${phys.etat.combattants.M1.pv}`);
    // Deux boucliers face à face : le coup renvoyé ne repart pas.
    const deux = clonerEtat(pas.etat);
    deux.combattants.M1.etats = [{ nom: ETAT_ANTIMAGIE, duree: 2 }];
    const ping = resoudreCarte(deux, { type: "carte", idLanceur: "M1", idCarte: "X", critique: false,
        attaques: [{ nom: "Boule", valeurBrute: 20, typeRes: "Magique", cibles: ["C"] }], alterations: [],
        jets: { attaqueRatee: false, parCible: { C: { esquive: false, etats: {} } } } });
    verifier("deux boucliers face à face : renvoyé une fois, pas de ping-pong", ping.etat.combattants.M1.pv === 90 && ping.etat.combattants.C.pv === 100);
    const vieux = clonerEtat(pas.etat);
    vieillirLesEtats(vieux);
    const encore = (vieux.combattants.C.etats || []).some(x => x.nom === ETAT_ANTIMAGIE);
    vieillirLesEtats(vieux);
    verifier("il tient la manche en cours et la suivante", encore && !(vieux.combattants.C.etats || []).some(x => x.nom === ETAT_ANTIMAGIE));
}

// =========================================================================
console.log("\n3 ter. L'APPEL DE LA LUMIÈRE : TOUT LE PLATEAU AVEUGLÉ");
// =========================================================================
{
    const enTete = (e) => { e.file = [{ id: "C", carte: "CLASSE_APPEL_LUMIERE", initiative: 100, pas: 0 }, { id: "M1", carte: "X", initiative: 10, pas: 0 }]; return e; };
    const appel = { id: "L1", type: "classe", acteur: "C", idCarte: "CLASSE_APPEL_LUMIERE" };
    const e = enTete(monde(10));
    e.combattants.M4.aTerre = true;
    e.combattants.M3.atouts.immunites = ["Aveuglé"];
    verifier("niveau 10 : accepté", validerIntention(e, appel).ok, validerIntention(e, appel).raison || "");
    verifier("niveau 9 : il ne l'a pas", !validerIntention(enTete(monde(9)), appel).ok);
    const pas = appliquerIntention(e, appel);
    const c = pas.etat.combattants;
    verifier("ennemis, alliés ET le Chasseur aveuglés, 2 manches, chacun son noir",
             [c.M1, c.M2, c.A, c.C].every(x => aveugle(x) && aveugle(x).duree === DUREE_AVEUGLE_LUMIERE && aveugle(x).cases.length === 4));
    verifier("le noir de M2 est autour de M2", aveugle(c.M2).cases.every(h => Math.abs(h.q - 2) <= 1 && Math.abs(h.r + 1) <= 1));
    verifier("le noir du Chasseur est autour de lui", aveugle(c.C).cases.every(h => Math.abs(h.q) <= 1 && Math.abs(h.r) <= 1));
    verifier("pas un KO, pas un immunisé", !aveugle(c.M4) && !aveugle(c.M3)
             && pas.entree.etapes.some(x => x.type === "etatRate" && x.cible === "M3"));
    verifier("aucune fatigue, une fois par combat", c.C.fatigue === 100 && !validerIntention(enTete(clonerEtat(pas.etat)), appel).ok);
    const rejoue = appliquerEntree(e, pas.entree).combattants;
    verifier("rejoué depuis le journal : mêmes noirs", JSON.stringify(aveugle(rejoue.M2)) === JSON.stringify(aveugle(c.M2)));
    const titre = misEnScene(pas.entree.etapes.find(x => x.type === "techniqueClasse"), pas.etat);
    verifier("à l'écran : « ☀️ Appel de la lumière »", titre && /Appel de la lumière/.test(titre.texte));
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
  export const getDoc = async (ref) => { const d = (window.__docs || {})[ref.chemin]; return { exists: () => !!d, data: () => d || {} }; };
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
console.log("\n4. LA FORGE : LUMIÈRE POUR LE SEUL CHASSEUR DE MAGES, SUR UN SORT À DÉGÂTS MAGIQUES");
// =========================================================================
{
  const r = await p.evaluate(async (EFFETS) => {
    window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
    delete window.EFFETS_BDD_CACHE.EFF_LUMIERE;
    window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
    const forgePour = async (perso) => {
      window.__docs = { "Personnages/P1": perso, "Caracteristiques/P1": {} };
      document.getElementById("champ-id-personnage").value = "P1";
      window.OUVERTURE_FORGE_EN_COURS = false;
      await window.ouvrirCreationCompetence();
      return (window.forgeState.effetsBDD || []).map(e => e.id);
    };
    const c4 = await forgePour({ Classe: "Chasseur de mages", XP: 0, Race: "Humain" });
    window.fermerForgeCompetence();
    const autre = await forgePour({ Classe: "Protecteur", XP: 9000, Race: "Humain" });
    window.fermerForgeCompetence();
    const c5 = await forgePour({ Classe: "Chasseur de mages", XP: 2500, Race: "Humain" });
    window.forgeState.armePrincipale = "Magie";
    const menus = (idEffet) => {
      window.forgeState.actions = [];
      window.ajouterComposantPrincipal(idEffet);
      return [...document.querySelectorAll("#forge-contenu-carte select")].map(s => [...s.options]
        .filter(o => /Lumi/.test(o.textContent)).map(o => (s.options[0].textContent + " : " + o.textContent + (o.disabled ? " [X]" : ""))))
        .flat();
    };
    const surMagique = menus("EFF_ATTAQUE_MAGIQUE");
    window.forgeState.armePrincipale = "Arme légère CAC";
    const surPhysique = menus("EFF_ATTAQUE_LEGERE");
    window.forgeState.armePrincipale = "Magie";
    const surSoin = menus("EFF_SOIN");
    window.fermerForgeCompetence();
    return { c4: c4.includes("EFF_LUMIERE"), autre: autre.includes("EFF_LUMIERE"), c5: c5.includes("EFF_LUMIERE"),
             surMagique, surPhysique, surSoin, monstres: window.paletteEffetsMonstres().some(e => e.id === "EFF_LUMIERE") };
  }, EFFETS_PAR_ID);
  verifier("le Chasseur de mages l'a dans la Forge dès le niveau 1", r.c5 && r.c4);
  verifier("pas une autre classe", !r.autre);
  verifier("jamais les monstres", !r.monstres);
  // (Avec l'arme Magie, la Forge n'ouvre pas de menu Physique.)
  verifier("sur une Attaque Magique : proposée (⚡ 5)",
           r.surMagique.length === 1 && /Magique : Lumière \(⚡ 5\)/.test(r.surMagique[0]), JSON.stringify(r.surMagique));
  verifier("sur une attaque physique : dans les menus Magique et Physique, « non compatible »",
           r.surPhysique.length === 2 && r.surPhysique.every(x => /non compatible/.test(x))
           && r.surPhysique.some(x => /Physique/.test(x)),
           JSON.stringify(r.surPhysique));
  verifier("sur un soin : « non compatible »", r.surSoin.length > 0 && r.surSoin.every(x => /non compatible/.test(x)), JSON.stringify(r.surSoin));

  const ex = await p.evaluate(async () => {
    window.PERSOS_PARTIE = [{ idPersonnage: "C1", camp: "Allié", prenom: "Varn", classe: "Chasseur de mages", xp: 2500,
                              PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }];
    window.TOKENS_VTT_DATA = { C1: { q: 0, r: 0 } };
    window.COMPETENCES_CACHE = { S1: { Nom: "Rayon", Arme: "Magie", Fatigue: 10, Initiative: 50,
      Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 2, mods: { EFF_LUMIERE: 2 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } },
      S2: { Nom: "Lame", Arme: "Arme légère CAC", Fatigue: 10, Initiative: 50,
      Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_LEGERE", count: 1, mods: { EFF_LUMIERE: 4 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } },
      S3: { Nom: "Rayon max", Arme: "Magie", Fatigue: 10, Initiative: 50,
      Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 1, mods: { EFF_LUMIERE: 6 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } } };
    window.CACHE_COMPETENCES_GLOBAL = { C1: window.COMPETENCES_CACHE };
    const lire = async (id) => ((await window.demarrerCiblage(id, { extraire: true, idLanceur: "C1" })) || {}).attaques || [];
    return { s1: (await lire("S1"))[0], s2: (await lire("S2"))[0], s3: (await lire("S3"))[0] };
  });
  verifier("une Attaque Magique avec Lumière ×2 part avec 30 % de chance", ex.s1 && ex.s1.chanceLumiere === 30, JSON.stringify(ex.s1).slice(0, 150));
  verifier("plafonnée à 60 % (×6 → 60)", ex.s3 && ex.s3.chanceLumiere === 60);
  verifier("une attaque physique n'emporte aucune Lumière", ex.s2 && !ex.s2.chanceLumiere);
}

// =========================================================================
console.log("\n5. LA FICHE DE CLASSE");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    await window.ouvrirChoixClasse();
    window.ouvrirFicheClasse("CLASSE_CHASSEUR_DE_MAGES");
    const d = document.getElementById("descriptif-fiche-classe");
    return { visible: getComputedStyle(d).display !== "none",
             niveaux: [...d.querySelectorAll(".palier-classe-niveau")].map(x => x.textContent.trim()), texte: d.textContent };
  });
  await p.screenshot({ path: "/tmp/claude-0/chasseur_classe.png" });
  verifier("présentation et paliers Niv. 1 / 5 / 10", r.visible && JSON.stringify(r.niveaux) === '["Niv. 1","Niv. 5","Niv. 10"]');
  verifier("résistance magique, Lumière, Bouclier anti-magie, Appel de la lumière y sont dits",
           /\+10 % de résistance magique/.test(r.texte) && /Lumière/.test(r.texte) && /8 % de chance d'aveugler/.test(r.texte)
           && /Bouclier anti-magie/.test(r.texte) && /Appel de la lumière/.test(r.texte));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
