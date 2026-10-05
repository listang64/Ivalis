// LA CLASSE SORCIER (ex-Nécromancien).
//
// Nico : « Necromancien remplacé son nom par sorcier. Sorcier : lvl1 SKILL :
// Ténèbres / +1 portée de base sur tous les sorts / pas de réduction au cac
// avec les sorts a distance. lvl5 : COMP : Charme fratricide. lvl10 : COMP :
// Transfert. Charme fratricide (Sorcier) 0 fatigue (une fois par combat) :
// oblige un ennemi à faire sa compétence sur un de ses alliés. INIT 105,
// portée 3. Transfert (sorcier) 0 fatigue (une fois par combat) : change sa
// place avec sa cible et se soigne de 10 PV. INIT 100, portée 5. Virer la
// classe Ensorceleur. » Puis : « Transfert : se tp sur un ennemi même hors
// vue, genre derrière un mur. »
//
// Partie 1 : le VRAI code des règles (app.js, experience.js) et le VRAI noyau
// (moteur_pur, combat_etat, cerveau_combat), sans navigateur.
// Partie 2 : la vraie page (portée affichée et extraite, fenêtre de ciblage
// des techniques, classes lues en base).
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree } from '../combat_etat.js';
import { resoudreCarte, ETAT_CHARME, SOIN_TRANSFERT } from '../moteur_pur.js';
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
const sorcier = (niveau, extra = {}) => fiche("S", { classe: "Sorcier", xp: XP[niveau], ...extra });

// S en (0,0) ; M1 à 2 cases (2,0), M2 collé à M1 (3,0), M3 loin (8,0) ;
// A, un allié, au contact (0,1) ; H, un héros sans classe, à 3 cases (-3,0).
const POS = { S: { q: 0, r: 0 }, M1: { q: 2, r: 0 }, M2: { q: 3, r: 0 }, M3: { q: 8, r: 0 },
              A: { q: 0, r: 1 }, H: { q: -3, r: 0 } };
const monde = (niveau = 10, extraS = {}) => {
    const fiches = [sorcier(niveau, extraS), fiche("M1"), fiche("M2"), fiche("M3"), fiche("A"), fiche("H")];
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: fiches, positions: POS,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["S", "M1", "M2", "M3", "A", "H"];
    e.phase = "Resolution";
    return e;
};
const enTete = (e, id, carte) => {
    e.file = [{ id, carte, initiative: 100, pas: 0 }, { id: id === "M1" ? "A" : "M1", carte: "X", initiative: 10, pas: 0 }];
    return e;
};
const pos = (c) => `${c.q},${c.r}`;

console.log("\n=========================================================");
console.log("  LE SORCIER");
console.log("=========================================================");

console.log("\n1. LES PALIERS, ET L'ANCIEN NOM");
{
    const a1 = w.atoutRace(sorcier(1)), a5 = w.atoutRace(sorcier(5)), a10 = w.atoutRace(sorcier(10));
    verifier("niveau 1 : Ténèbres, +1 portée de sort, sans malus au contact",
             JSON.stringify(a1.effets) === '["EFF_TENEBRES"]' && a1.porteeSorts === 1 && a1.sortsSansMalusContact === true
             && !(a1.techniques || []).length, JSON.stringify(a1));
    verifier("…et plus rien de l'ancien Nécromancien (+8 PV, +1 compétence, sursis)",
             !a10.pvMax && !a10.competences && !a10.sursis, JSON.stringify(a10));
    verifier("niveau 5 : Charme fratricide", JSON.stringify(a5.techniques) === '["CLASSE_CHARME_FRATRICIDE"]');
    verifier("niveau 10 : + Transfert", JSON.stringify(a10.techniques) === '["CLASSE_CHARME_FRATRICIDE","CLASSE_TRANSFERT"]');
    const ch = w.TECHNIQUES_CLASSE.CLASSE_CHARME_FRATRICIDE, tr = w.TECHNIQUES_CLASSE.CLASSE_TRANSFERT;
    verifier("Charme : init 105, aucune fatigue, un ennemi à 3 cases",
             ch.Initiative === 105 && ch.Fatigue === 0 && ch.cible === "ennemi" && ch.portee === 3 && ch.niveau === 5, JSON.stringify(ch).slice(0, 120));
    verifier("Transfert : init 100, aucune fatigue, un ennemi à 5 cases",
             tr.Initiative === 100 && tr.Fatigue === 0 && tr.cible === "ennemi" && tr.portee === 5 && tr.niveau === 10);
    verifier("un héros resté « Nécromancien » est un Sorcier",
             w.nomActuelClasse("Nécromancien") === "Sorcier" && w.nomActuelClasse("NECROMANCIEN") === "Sorcier"
             && w.atoutRace(fiche("N", { classe: "Nécromancien", xp: XP[10] })).techniques.length === 2
             && w.estDeLaClasse({ classe: "Nécromancien" }, "Sorcier"));
    verifier("une autre classe garde son nom", w.nomActuelClasse("Oracle") === "Oracle");
    verifier("l'Ensorceleur n'a rien", Object.keys(w.atoutClasse(fiche("E", { classe: "Ensorceleur", xp: XP[10] }))).length === 0);
}

console.log("\n2. +1 CASE DE PORTÉE SUR TOUS SES SORTS");
{
    const s = sorcier(1), ondari = sorcier(1, { race: "Ondari" }), autre = fiche("H", { race: "Ondari" });
    verifier("un sort au contact : +1 (il porte à 2 cases)", w.bonusPorteeMagique(s, true, false) === 1);
    verifier("un sort à distance : +1", w.bonusPorteeMagique(s, true, true) === 1);
    verifier("un coup physique : rien", w.bonusPorteeMagique(s, false, true) === 0);
    verifier("Ondari Sorcier à distance : les deux s'ajoutent (+2), au contact +1",
             w.bonusPorteeMagique(ondari, true, true) === 2 && w.bonusPorteeMagique(ondari, true, false) === 1);
    verifier("un Ondari sans classe : rien au contact, +1 à distance",
             w.bonusPorteeMagique(autre, true, false) === 0 && w.bonusPorteeMagique(autre, true, true) === 1);
}

console.log("\n3. AUCUNE RÉDUCTION AU CONTACT POUR SES SORTS À DISTANCE");
{
    const sortTire = (lanceur, typeRes = "Magique") => {
        const e = monde(1); e.combattants.M1.q = 1; e.combattants.M1.r = 0;   // au contact
        if (lanceur === "H") { e.combattants.H.q = 2; e.combattants.H.r = -1; }
        const r = resoudreCarte(e, { type: "carte", idLanceur: lanceur, idCarte: "C", critique: false,
            attaques: [{ nom: "Attaque", valeurBrute: 10, typeRes, isRanged: true, rangeMax: 3, cibles: ["M1"] }],
            alterations: [], jets: { attaqueRatee: false, parCible: { M1: { esquive: false, etats: {} } } } });
        return 100 - r.etat.combattants.M1.pv;
    };
    verifier("le Sorcier, sort à distance tiré au contact : 10 pleins", sortTire("S") === 10, `${sortTire("S")}`);
    verifier("un autre héros : 7 (×0,7)", sortTire("H") === 7, `${sortTire("H")}`);
    verifier("le Sorcier, tir PHYSIQUE au contact : 7 (seuls les sorts)", sortTire("S", "Physique") === 7, `${sortTire("S", "Physique")}`);
    verifier("l'atout voyage dans le combattant", monde(1).combattants.S.atouts.sortsSansMalusContact === true
             && !monde(1).combattants.H.atouts.sortsSansMalusContact);
}

console.log("\n4. LE CHARME FRATRICIDE");
{
    const charme = (cible = "M1") => ({ id: "I1", type: "classe", acteur: "S", idCarte: "CLASSE_CHARME_FRATRICIDE", cible });
    const e = enTete(monde(5), "S", "CLASSE_CHARME_FRATRICIDE");
    verifier("niveau 5 : accepté sur un ennemi à 2 cases", validerIntention(e, charme()).ok, validerIntention(e, charme()).raison || "");
    verifier("niveau 4 : il ne l'a pas", !validerIntention(enTete(monde(4), "S", "CLASSE_CHARME_FRATRICIDE"), charme()).ok);
    verifier("pas sur un allié", !validerIntention(e, charme("A")).ok);
    verifier("pas au-delà de 3 cases", !validerIntention(e, charme("M3")).ok, validerIntention(e, charme("M3")).raison || "");
    const loin3 = enTete(monde(5), "S", "CLASSE_CHARME_FRATRICIDE"); loin3.combattants.M3.q = 3; loin3.combattants.M3.r = -3;
    verifier("à 3 cases pile : accepté", validerIntention(loin3, charme("M3")).ok);

    const pas = appliquerIntention(e, charme());
    const M1 = pas.etat.combattants.M1, S = pas.etat.combattants.S;
    const etatCharme = (M1.etats || []).find(x => x.nom === ETAT_CHARME);
    verifier("M1 est Charmé (2 manches), le Sorcier ne perd aucune fatigue",
             etatCharme && etatCharme.duree === 2 && S.fatigue === 100 && S.techniquesUtilisees.includes("CLASSE_CHARME_FRATRICIDE"),
             JSON.stringify(M1.etats));
    verifier("une fois par combat", !validerIntention(enTete(clonerEtat(pas.etat), "S", "CLASSE_CHARME_FRATRICIDE"), charme()).ok);
    verifier("rejoué depuis le journal : même état", JSON.stringify(appliquerEntree(e, pas.entree).combattants.M1.etats)
             === JSON.stringify(M1.etats));
    const titre = misEnScene(pas.entree.etapes.find(x => x.type === "techniqueClasse"), pas.etat);
    verifier("à l'écran : « 🌀 Charme fratricide »", titre && /Charme fratricide/.test(titre.texte), JSON.stringify(titre));

    // Son tour venu, M1 vise le Sorcier : le coup part sur M2, son allié.
    const tour = enTete(clonerEtat(pas.etat), "M1", "C");
    const coup = appliquerIntention(tour, { id: "I2", type: "carte", acteur: "M1", idCarte: "C", coutFatigue: 0,
        attaques: [{ nom: "Attaque Légère", valeurBrute: 10, typeRes: "Physique", rangeMax: 2, cibles: ["S"] }], alterations: [] });
    const apres = coup.etat.combattants;
    verifier("le coup visait le Sorcier : il frappe M2, son allié", apres.S.pv === 100 && apres.M2.pv < 100,
             `S ${apres.S.pv} / M2 ${apres.M2.pv}`);
    verifier("le charme s'use sur cette carte", !(apres.M1.etats || []).some(x => x.nom === ETAT_CHARME));
    verifier("et ça se dit : « Charmé : frappe son allié ! »",
             coup.entree.etapes.some(x => x.type === "message" && /Charmé : frappe son allié/.test(x.texte)));
    verifier("rejoué depuis le journal : mêmes PV", appliquerEntree(tour, coup.entree).combattants.M2.pv === apres.M2.pv);

    // Aucun allié à portée : la carte se perd.
    const seul = enTete(clonerEtat(pas.etat), "M1", "C");
    seul.combattants.M2.q = 9; seul.combattants.M2.r = 4;
    const rate = appliquerIntention(seul, { id: "I3", type: "carte", acteur: "M1", idCarte: "C", coutFatigue: 0,
        attaques: [{ nom: "Attaque Légère", valeurBrute: 10, typeRes: "Physique", rangeMax: 2, cibles: ["S"] }], alterations: [] });
    verifier("personne à portée : la carte se perd, personne n'est touché",
             rate.etat.combattants.S.pv === 100 && rate.etat.combattants.M2.pv === 100
             && rate.entree.etapes.some(x => x.type === "message" && /aucun allié à portée/.test(x.texte)));
    verifier("…et le charme est usé quand même", !(rate.etat.combattants.M1.etats || []).some(x => x.nom === ETAT_CHARME));

    // Inutilisé, il s'éteint au bout de 2 manches.
    const vieux = clonerEtat(pas.etat);
    vieillirLesEtats(vieux);
    const encore = (vieux.combattants.M1.etats || []).some(x => x.nom === ETAT_CHARME);
    vieillirLesEtats(vieux);
    verifier("inutilisé : il tient 1 manche, puis s'éteint à la 2e",
             encore && !(vieux.combattants.M1.etats || []).some(x => x.nom === ETAT_CHARME));
}

console.log("\n5. LE TRANSFERT");
{
    const transfert = (cible = "M1") => ({ id: "T1", type: "classe", acteur: "S", idCarte: "CLASSE_TRANSFERT", cible });
    const e = enTete(monde(10, { PV_Actuels: 40 }), "S", "CLASSE_TRANSFERT");
    verifier("niveau 10 : accepté sur un ennemi à 2 cases", validerIntention(e, transfert()).ok, validerIntention(e, transfert()).raison || "");
    verifier("pas sur un allié", !validerIntention(e, transfert("H")).ok);
    verifier("niveau 9 : il ne l'a pas", !validerIntention(enTete(monde(9), "S", "CLASSE_TRANSFERT"), transfert()).ok);
    verifier("pas au-delà de 5 cases", !validerIntention(e, transfert("M3")).ok);
    verifier("pas sur soi", !validerIntention(e, transfert("S")).ok);
    const ko = enTete(monde(10), "S", "CLASSE_TRANSFERT"); ko.combattants.M1.aTerre = true;
    verifier("pas sur un combattant à terre", !validerIntention(ko, transfert()).ok);

    const pas = appliquerIntention(e, transfert());
    const S = pas.etat.combattants.S, H = pas.etat.combattants.M1;
    verifier("les places sont échangées", pos(S) === "2,0" && pos(H) === "0,0", `S ${pos(S)} / M1 ${pos(H)}`);
    verifier(`il se soigne de ${SOIN_TRANSFERT} PV (40 → 50), sans fatigue`, S.pv === 50 && S.fatigue === 100, `${S.pv}`);
    verifier("une fois par combat", !validerIntention(enTete(clonerEtat(pas.etat), "S", "CLASSE_TRANSFERT"), transfert()).ok);
    const rejoue = appliquerEntree(e, pas.entree).combattants;
    verifier("rejoué depuis le journal : mêmes places, mêmes PV",
             pos(rejoue.S) === "2,0" && pos(rejoue.M1) === "0,0" && rejoue.S.pv === 50);
    const bonds = pas.entree.etapes.filter(x => x.type === "bond");
    verifier("deux bonds à l'écran (ni pas, ni attaque d'opportunité)",
             bonds.length === 2 && bonds.every(b => b.transfert) && !pas.entree.etapes.some(x => x.type === "opportunite"));
    const titre = misEnScene(pas.entree.etapes.find(x => x.type === "techniqueClasse"), pas.etat);
    verifier("à l'écran : « 🔄 Transfert »", titre && /Transfert/.test(titre.texte));

    const plein = appliquerIntention(enTete(monde(10, { PV_Actuels: 95 }), "S", "CLASSE_TRANSFERT"), transfert());
    verifier("jamais au-dessus de ses PV max", plein.etat.combattants.S.pv === 100);
    const br = enTete(monde(10, { PV_Actuels: 40 }), "S", "CLASSE_TRANSFERT");
    br.combattants.S.etats = [{ nom: "Brûlé", duree: 3 }];
    const brule = appliquerIntention(br, transfert()).etat.combattants.S.pv;
    verifier("brûlé : le soin est réduit comme tout soin (−50 % : 40 → 45)", brule === 45, `${brule}`);
    // Derrière un mur : la ligne de vue ne compte pas.
    const mur = enTete(monde(10), "S", "CLASSE_TRANSFERT");
    mur.combattants.M1.q = 4; mur.combattants.M1.r = 0;
    const MURS = { etatCase: (q, r) => ({ bloquee: q === 2 && r >= -2 && r <= 2, supprimee: false, difficile: false }) };
    const derriere = appliquerIntention(mur, transfert(), MURS);
    verifier("derrière un mur, hors de vue : il passe quand même",
             validerIntention(mur, transfert()).ok && pos(derriere.etat.combattants.S) === "4,0"
             && pos(derriere.etat.combattants.M1) === "0,0", pos(derriere.etat.combattants.S));
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
  export const getDoc = async (ref) => {
    const d = (window.__docs || {})[ref.chemin];
    return { exists: () => !!d, data: () => d || {} };
  };
  export const getDocs = async (ref) => {
    const liste = ((window.__collections || {})[ref.col] || []).map(([id, d]) => ({ id, data: () => d }));
    return { forEach: (f) => liste.forEach(f), docs: liste, empty: liste.length === 0 };
  };
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data, options }); };
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
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#5a3d7a"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

console.log("\n6. LA PORTÉE : CE QUE LA CARTE ANNONCE ET CE QUE LE COMBAT VISE");
{
  const r = await p.evaluate(async (EFFETS) => {
    window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
    window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
    window.jouerSonClic = () => {};
    window.PLATEAU_VTT = { getCaseState: () => ({}), hexToPixel: (q, r) => ({ x: 300 + q * 60, y: 300 + r * 60 }),
                           pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {} };
    window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
    const carte = { Nom: "Trait d'ombre", Arme: "Magie", Fatigue: 10, Initiative: 20,
      Effets_Compiles: [{ nom: "Attaque Magique", desc: "3 dégâts magiques", isMod: false }],
      Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 1, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } };
    const coup = { ...carte, Nom: "Coup", Effets_Compiles: [], Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_LEGERE", count: 1, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } };
    const sorcier = { idPersonnage: "S", camp: "Allié", prenom: "Ysolde", classe: "Sorcier", xp: 0, race: "Humain" };
    const necro = { ...sorcier, classe: "Nécromancien" };
    const autre = { ...sorcier, classe: "Hoplite" };
    const extraire = async (perso, c) => {
      window.PERSOS_PARTIE = [{ ...perso, PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 100, fatigueActuelle: 100, Etats_Alteres: [], statut: "Vivant" },
        { idPersonnage: "M1", camp: "Ennemi", estMonstre: true, prenom: "Gnoll", PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }];
      window.TOKENS_VTT_DATA = { S: { q: 0, r: 0 }, M1: { q: 2, r: 0 } };
      window.TOKEN_SELECTIONNE = "S";
      window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]]; window.COMBAT_INDEX_PERSO = 0;
      window.REGIME_CERVEAU = true;
      window.COMPETENCES_CACHE = { C1: c }; window.CACHE_COMPETENCES_GLOBAL = { S: window.COMPETENCES_CACHE };
      window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1, File_Attente_Combat: [{ idPersonnage: "S", idCarte: "C1", initiative: 20 }] };
      window.CHEMIN_MOUVEMENT = []; window.ZONES_PERSISTANTES = {};
      const etat = await window.demarrerCiblage("C1", { extraire: true, idLanceur: "S" });
      const a = ((etat && etat.attaques) || [])[0] || {};
      return { isRanged: a.isRanged, rangeMax: a.rangeMax, affiche: window.porteeReelleCarte(c, window.PERSOS_PARTIE[0]).portee };
    };
    return { sorcier: await extraire(sorcier, carte), necro: await extraire(necro, carte),
             autre: await extraire(autre, carte), coup: await extraire(sorcier, coup) };
  }, EFFETS_PAR_ID);
  verifier("un sort au contact du Sorcier se vise à 2 cases", r.sorcier.isRanged === true && r.sorcier.rangeMax === 2, JSON.stringify(r.sorcier));
  verifier("…et la carte annonce la même portée (2)", r.sorcier.affiche === 2);
  verifier("l'ancien nom (Nécromancien) aussi", r.necro.rangeMax === 2 && r.necro.isRanged === true);
  verifier("une autre classe : 1 case, au contact", r.autre.rangeMax === 1 && !r.autre.isRanged && r.autre.affiche === 1, JSON.stringify(r.autre));
  verifier("un coup physique du Sorcier : 1 case", r.coup.rangeMax === 1 && !r.coup.isRanged, JSON.stringify(r.coup));
}

console.log("\n7. LA FENÊTRE DE CIBLAGE DES TECHNIQUES");
{
  const ouvrir = (idCarte) => p.evaluate((idCarte) => {
    window.jouerSonClic = () => {};
    window.estCombattantMort = (id) => id === "K";
    window.PERSOS_PARTIE = [
      { idPersonnage: "S", camp: "Allié", prenom: "Ysolde", classe: "Sorcier", xp: 7900 },
      { idPersonnage: "A", camp: "Allié", prenom: "Bran" },
      { idPersonnage: "K", camp: "Allié", prenom: "Tombé" },
      { idPersonnage: "M1", camp: "Ennemi", estMonstre: true, prenom: "Gnoll" },
      { idPersonnage: "M4", camp: "Ennemi", estMonstre: true, prenom: "Ogre" },
      { idPersonnage: "M6", camp: "Ennemi", estMonstre: true, prenom: "Loin" },
      { idPersonnage: "I", camp: "Ennemi", estMonstre: true, prenom: "Leurre", estIllusion: true }];
    window.TOKENS_VTT_DATA = { S: { q: 0, r: 0 }, A: { q: 0, r: 1 }, K: { q: 1, r: -1 }, M1: { q: 2, r: 0 },
                               M4: { q: 4, r: 0 }, M6: { q: 6, r: 0 }, I: { q: 1, r: 0 } };
    window.__demandes = [];
    window.regimeDemande = { techniqueClasse: (...a) => window.__demandes.push(a), etat: () => null };
    window.lancerTechniqueClasse(idCarte, "S");
    const f = document.getElementById("fenetre-choix-rempart");
    return { titre: f.querySelector(".choix-rempart-titre").textContent,
             noms: [...f.querySelectorAll(".choix-rempart-allie span")].map(x => x.textContent),
             visible: getComputedStyle(f).display !== "none" };
  }, idCarte);
  const ch = await ouvrir("CLASSE_CHARME_FRATRICIDE");
  await p.screenshot({ path: "/tmp/claude-0/sorcier_charme.png" });
  verifier("Charme : « 🌀 Charme fratricide », les ennemis debout à 3 cases",
           ch.visible && /Charme fratricide/.test(ch.titre) && JSON.stringify(ch.noms) === '["Gnoll"]', JSON.stringify(ch));
  const choisi = await p.evaluate(() => {
    document.querySelector(".choix-rempart-allie").click();
    return window.__demandes[0];
  });
  verifier("un clic : la technique part sur lui", JSON.stringify(choisi) === '["S","CLASSE_CHARME_FRATRICIDE","M1"]', JSON.stringify(choisi));
  const tr = await ouvrir("CLASSE_TRANSFERT");
  await p.screenshot({ path: "/tmp/claude-0/sorcier_transfert.png" });
  verifier("Transfert : « 🔄 Transfert », les ennemis debout à 5 cases, même hors de vue",
           /Transfert/.test(tr.titre) && JSON.stringify([...tr.noms].sort()) === '["Gnoll","Ogre"]' , JSON.stringify(tr));
}

console.log("\n8. LES CLASSES LUES EN BASE : LE NÉCROMANCIEN DEVENU SORCIER, PLUS D'ENSORCELEUR");
{
  const r = await p.evaluate(async () => {
    window.__collections = { Classes: [
      ["CLASSE_HOPLITE", { Nom: "Hoplite", Ordre: 7 }],
      ["CLASSE_NECROMANCIEN", { Nom: "Nécromancien", Ordre: 11, Image_Tarot: "https://res.cloudinary.com/x/image/upload/v1/necro.png" }],
      ["CLASSE_ENSORCELEUR", { Nom: "Ensorceleur", Ordre: 12 }]] };
    window.CLASSES_CACHE = null;
    const classes = await window.chargerClasses();
    return classes.map(c => [c.id, c.nom, c.imageTarot]);
  });
  const ids = r.map(x => x[0]);
  verifier("le document Nécromancien se lit « Sorcier » (id CLASSE_SORCIER), mêmes images",
           r.some(x => x[0] === "CLASSE_SORCIER" && x[1] === "Sorcier" && /necro\.png/.test(x[2])), JSON.stringify(r));
  verifier("l'Ensorceleur n'est plus proposé", !ids.includes("CLASSE_ENSORCELEUR") && ids.length === 2, ids.join(","));
  const fiche = await p.evaluate(() => window.detailBonusRaceClasse({ classe: "Nécromancien", xp: 2500, race: "Humain" }).classe);
  verifier("la fiche d'un héros « Nécromancien » affiche Sorcier, avec ses 3 paliers",
           fiche.nom === "Sorcier" && fiche.paliers.length === 3, JSON.stringify(fiche).slice(0, 120));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
