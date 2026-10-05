// LA CLASSE MÉDICUS.
//
// Nico : « Lvl1 : Regen naturel +5 % / +1 compétence. Lvl5 : COMP Soin
// d'urgence. Lvl10 : COMP Prise en charge par Medicus. Soin d'urgence : 0 de
// fatigue, une fois par combat, soigne tous les alliés de 12 PV où qu'ils
// soient, INIT 70. Prise en charge : 0 de fatigue, une fois par combat,
// réanime un allié adjacent KO avec 30 % de PV, repousse d'un hexagone tous
// les ennemis adjacents à l'allié, INIT 0. »
// Ses réponses : la régénération de fatigue de fin de manche ; +1 compétence
// comme le Nécromancien ; le soin vaut pour tous les alliés debout, Médicus
// compris, avec les règles des soins ; la réanimation : 30 % arrondi au-dessus,
// états effacés, rejoue à la manche suivante ; les ennemis reculent comme une
// Poussée ; la case la plus proche si quelqu'un se tient sur le corps ; sans
// allié KO à côté, la technique n'est pas consommée. Et : « seul le Médicus
// peut voir le fantôme des tokens alliés morts, en très faible opacité ».
// Puis : « Médicus : +1 en soin au lvl1. »
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat } from '../combat_etat.js';
import { SOIN_URGENCE } from '../moteur_pur.js';
import { validerIntention, appliquerIntention, regenererFinDeManche } from '../cerveau_combat.js';
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

console.log("\n=========================================================");
console.log("  LE MÉDICUS");
console.log("=========================================================");

// =========================================================================
console.log("\n1. NIVEAU 1 : +5 DE RÉGÉNÉRATION DE FATIGUE, +1 COMPÉTENCE");
// =========================================================================
{
    const a1 = w.atoutClasse(medicus(1)), a5 = w.atoutClasse(medicus(5)), a10 = w.atoutClasse(medicus(10));
    verifier("niveau 1 : regen +5, +1 compétence, +1 aux soins, pas de technique",
             a1.regenFatigue === 5 && a1.competences === 1 && a1.bonusSoin === 1 && !(a1.techniques || []).length, JSON.stringify(a1));
    verifier("niveau 5 : Soin d'urgence", JSON.stringify(a5.techniques) === '["CLASSE_SOIN_URGENCE"]');
    verifier("niveau 10 : et la Prise en charge",
             JSON.stringify(a10.techniques) === '["CLASSE_SOIN_URGENCE","CLASSE_PRISE_EN_CHARGE"]' && a10.regenFatigue === 5);
    verifier("la fiche annonce 40 % de régénération (35 + 5)", w.regenerationCombattant(medicus(1)) === 40
             && w.regenerationCombattant(fiche("X")) === 35, String(w.regenerationCombattant(medicus(1))));
    verifier("+1 compétence, comme le Nécromancien (7)", w.competencesMaxCombattant(medicus(1)) === 7
             && w.competencesMaxCombattant(fiche("X")) === 6);
    const e = monde(1);
    e.combattants.D.fatigue = 50; e.combattants.B.fatigue = 50;
    regenererFinDeManche(e);
    // (Un Humain a 110 d'énergie : 40 % → 44, 35 % → 38.)
    verifier("en fin de manche : 40 % pour lui, 35 % pour un autre", e.combattants.D.fatigue === 94 && e.combattants.B.fatigue === 88,
             `${e.combattants.D.fatigue} / ${e.combattants.B.fatigue}`);
    verifier("les cartes : Soin d'urgence init 70, Prise en charge init 0, fatigue 0",
             w.carteTechniqueClasse("CLASSE_SOIN_URGENCE").Initiative === 70 && w.carteTechniqueClasse("CLASSE_PRISE_EN_CHARGE").Initiative === 0
             && w.carteTechniqueClasse("CLASSE_SOIN_URGENCE").Fatigue === 0 && w.carteTechniqueClasse("CLASSE_PRISE_EN_CHARGE").Fatigue === 0);
    verifier("estDeLaClasse lit « Medicus » sans accent", w.estDeLaClasse({ classe: "Medicus" }, "Médicus") && !w.estDeLaClasse({ classe: "Hoplite" }, "Médicus"));
}

// =========================================================================
console.log("\n2. SOIN D'URGENCE : 12 PV À TOUS LES ALLIÉS DEBOUT, OÙ QU'ILS SOIENT");
// =========================================================================
{
    const e = enTete(monde(5, {}, { B: { race: "Ethéré" } }), "CLASSE_SOIN_URGENCE");
    e.combattants.D.etats = [{ nom: "Brûlé", duree: 2 }];
    verifier("l'intention est acceptée", validerIntention(e, intention("CLASSE_SOIN_URGENCE")).ok);
    const pas = appliquerIntention(e, intention("CLASSE_SOIN_URGENCE"));
    const c = pas.etat.combattants;
    verifier("le Médicus brûlé : 6 (la moitié)", c.D.pv === 56, String(c.D.pv));
    verifier("l'allié loin (Éthéré, +30 %) : 16", c.B.pv === 66, String(c.B.pv));
    verifier("l'allié KO : rien, il reste KO", c.A.pv === 0 && c.A.aTerre);
    verifier("les ennemis : rien", c.M1.pv === 50 && c.M3.pv === 50);
    verifier("technique utilisée, tour clos, aucune énergie",
             c.D.techniquesUtilisees.includes("CLASSE_SOIN_URGENCE") && pas.etat.file[0].id === "M3" && c.D.fatigue === 100);
    const plein = enTete(monde(5, {}, { B: { PV_Actuels: 95 } }), "CLASSE_SOIN_URGENCE");
    verifier("jamais au-delà des PV max (95 → 100)", appliquerIntention(plein, intention("CLASSE_SOIN_URGENCE")).etat.combattants.B.pv === 100);
    const sursis = enTete(monde(5), "CLASSE_SOIN_URGENCE");
    Object.assign(sursis.combattants.B, { pv: 0, sursis: { tours: 2 } });
    verifier("un Nécromancien en sursis n'est pas soigné", appliquerIntention(sursis, intention("CLASSE_SOIN_URGENCE")).etat.combattants.B.pv === 0);
    const rejoue = appliquerEntree(e, pas.entree).combattants;
    verifier("rejoué depuis le journal : mêmes PV", rejoue.D.pv === 56 && rejoue.B.pv === 66);
    verifier("une seconde fois : refusée", !validerIntention(enTete(clonerEtat(pas.etat), "CLASSE_SOIN_URGENCE"), intention("CLASSE_SOIN_URGENCE")).ok);
    verifier("niveau 4 : il ne l'a pas", !validerIntention(enTete(monde(4), "CLASSE_SOIN_URGENCE"), intention("CLASSE_SOIN_URGENCE")).ok);
    verifier("le chiffre de la règle", SOIN_URGENCE === 12);
}

// =========================================================================
console.log("\n3. PRISE EN CHARGE : RELEVER UN ALLIÉ KO ADJACENT, REPOUSSER LES ENNEMIS");
// =========================================================================
{
    const e = enTete(monde(10), "CLASSE_PRISE_EN_CHARGE");
    verifier("l'allié KO tombe bien à terre au départ", e.combattants.A.aTerre === true);
    const ok = (cible) => validerIntention(e, intention("CLASSE_PRISE_EN_CHARGE", cible));
    verifier("sur l'allié KO adjacent : accepté", ok("A").ok, ok("A").raison);
    verifier("sur un allié debout : refusé", !ok("B").ok, ok("B").raison);
    verifier("sur un ennemi : refusé", !ok("M1").ok);
    verifier("sans cible : refusé", !ok(undefined).ok);
    const loin = enTete(monde(10, { A: { q: 3, r: -2 } }), "CLASSE_PRISE_EN_CHARGE");
    verifier("un allié KO trop loin : refusé", !validerIntention(loin, intention("CLASSE_PRISE_EN_CHARGE", "A")).ok);
    verifier("niveau 9 : il ne l'a pas", !validerIntention(enTete(monde(9), "CLASSE_PRISE_EN_CHARGE"), intention("CLASSE_PRISE_EN_CHARGE", "A")).ok);

    e.combattants.A.etats = [{ nom: "Empoisonnement", duree: 2 }];
    const pas = appliquerIntention(e, intention("CLASSE_PRISE_EN_CHARGE", "A"));
    const c = pas.etat.combattants;
    verifier("A se relève avec 30 PV (30 % de 100), sur sa case", !c.A.aTerre && c.A.pv === 30 && c.A.q === 1 && c.A.r === 0,
             JSON.stringify({ pv: c.A.pv, q: c.A.q, r: c.A.r }));
    verifier("ses états sont effacés", c.A.etats.length === 0);
    verifier("M1 recule d'une case, à l'opposé de A (2,0 → 3,0)", c.M1.q === 3 && c.M1.r === 0, `${c.M1.q},${c.M1.r}`);
    verifier("M2 recule aussi (1,1 → 1,2)", c.M2.q === 1 && c.M2.r === 2, `${c.M2.q},${c.M2.r}`);
    verifier("M3, loin, ne bouge pas", c.M3.q === 6 && c.M3.r === -3);
    verifier("technique utilisée, tour clos", c.D.techniquesUtilisees.includes("CLASSE_PRISE_EN_CHARGE") && pas.etat.file[0].id === "M3");
    verifier("l'état reste cohérent", verifierEtatCombat(pas.etat).length === 0, verifierEtatCombat(pas.etat).join(" | "));
    const rejoue = appliquerEntree(e, pas.entree).combattants;
    verifier("rejoué depuis le journal : debout, 30 PV, ennemis repoussés",
             !rejoue.A.aTerre && rejoue.A.pv === 30 && rejoue.A.etats.length === 0 && rejoue.M1.q === 3 && rejoue.M2.r === 2);

    const impair = enTete(monde(10, {}, { A: { PV_Max: 45 } }), "CLASSE_PRISE_EN_CHARGE");
    verifier("30 % arrondi au-dessus (45 → 14)", appliquerIntention(impair, intention("CLASSE_PRISE_EN_CHARGE", "A")).etat.combattants.A.pv === 14);

    // Quelqu'un se tient sur le corps (un KO libère sa case).
    const occupe = enTete(monde(10, { M1: { q: 1, r: 0 } }), "CLASSE_PRISE_EN_CHARGE");
    const po = appliquerIntention(occupe, intention("CLASSE_PRISE_EN_CHARGE", "A")).etat.combattants;
    const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
    verifier("M1 sur le corps : A se relève sur la case libre la plus proche",
             !po.A.aTerre && !(po.A.q === 1 && po.A.r === 0) && dist(po.A, { q: 1, r: 0 }) === 1
             && !Object.values(po).some(x => x.id !== "A" && !x.aTerre && x.q === po.A.q && x.r === po.A.r),
             JSON.stringify({ q: po.A.q, r: po.A.r }));

    // Un mur derrière M1 : la poussée est bloquée.
    const mur = enTete(monde(10), "CLASSE_PRISE_EN_CHARGE");
    const plateau = { etatCase: (q, r) => ({ bloquee: q === 3 && r === 0 }) };
    const pm = appliquerIntention(mur, intention("CLASSE_PRISE_EN_CHARGE", "A"), plateau);
    verifier("un mur derrière M1 : il ne bouge pas, « Poussée bloquée »",
             pm.etat.combattants.M1.q === 2 && pm.entree.etapes.some(x => x.type === "message" && x.cible === "M1" && /bloquée/.test(x.texte)));

    const scene = misEnScene({ type: "reanimation", cible: "A", acteur: "D", pvApres: 30 }, e);
    verifier("à l'écran : « ✚ Relevé ! » sur l'allié", scene.geste === "message" && /Relevé/.test(scene.texte));
    const nom = misEnScene({ type: "techniqueClasse", acteur: "D", idCarte: "CLASSE_SOIN_URGENCE" }, e);
    verifier("et le nom de la technique sur le Médicus", /Soin d'urgence/.test(nom.texte));
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
console.log("\n4. EN COMBAT : LE CHOIX DE L'ALLIÉ KO, ET RIEN SANS LUI");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    document.getElementById("fenetre-combat").style.display = "block";
    window.jouerSonClic = () => {};
    window.PERSOS_PARTIE = [
      { idPersonnage: "D1", camp: "Allié", prenom: "Galien", classe: "Médicus", xp: 7900, PV_Max: 40, PV_Actuels: 40, statut: "Vivant" },
      { idPersonnage: "A1", camp: "Allié", prenom: "Cybile", PV_Max: 40, PV_Actuels: 0, statut: "Inconscient", urlToken: "x.png" },
      { idPersonnage: "A2", camp: "Allié", prenom: "Jade", PV_Max: 40, PV_Actuels: 40, statut: "Vivant" },
      { idPersonnage: "A3", camp: "Allié", prenom: "Loin", PV_Max: 40, PV_Actuels: 0, statut: "Inconscient" },
      { idPersonnage: "M1", camp: "Ennemi", estMonstre: true, prenom: "Gnoll", PV_Max: 40, PV_Actuels: 0, statut: "Mort" }
    ];
    window.TOKENS_VTT_DATA = { D1: { q: 0, r: 0 }, A1: { q: 1, r: 0, url: "x.png" }, A2: { q: 0, r: 1 }, A3: { q: 4, r: 0, url: "y.png" }, M1: { q: -1, r: 0 } };
    const demandes = [];
    window.regimeDemande = { actif: () => true, enVol: () => false,
                             techniqueClasse: (a, id, cible) => { demandes.push([a, id, cible || null]); } };
    window.lancerTechniqueClasse("CLASSE_PRISE_EN_CHARGE", "D1");
    const fen = document.getElementById("fenetre-choix-rempart");
    const proposes = [...fen.querySelectorAll(".choix-rempart-allie span")].map(x => x.textContent);
    const titre = fen.querySelector(".choix-rempart-titre").textContent;
    fen.querySelector(".choix-rempart-allie").click();

    // Personne à relever : un message, rien n'est envoyé.
    window.TOKENS_VTT_DATA.A1 = { q: 3, r: 3, url: "x.png" };
    window.lancerTechniqueClasse("CLASSE_PRISE_EN_CHARGE", "D1");
    const vide = { boutons: fen.querySelectorAll(".choix-rempart-allie").length, texte: fen.textContent };
    window.fermerChoixRempart();
    window.lancerTechniqueClasse("CLASSE_SOIN_URGENCE", "D1");
    return { proposes, titre, demandes, vide };
  });
  verifier("la fenêtre propose le seul allié KO adjacent", JSON.stringify(r.proposes) === '["Cybile"]' && /Prise en charge/.test(r.titre),
           JSON.stringify(r.proposes));
  verifier("le choix envoie la Prise en charge sur lui ; le Soin d'urgence part seul",
           JSON.stringify(r.demandes) === '[["D1","CLASSE_PRISE_EN_CHARGE","A1"],["D1","CLASSE_SOIN_URGENCE",null]]', JSON.stringify(r.demandes));
  verifier("sans allié KO à côté : rien n'est envoyé, la technique resservira",
           r.vide.boutons === 0 && /resservira/.test(r.vide.texte), r.vide.texte.slice(0, 120));
}

// =========================================================================
console.log("\n5. LES FANTÔMES : LE SEUL MÉDICUS VOIT SES ALLIÉS TOMBÉS");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    window.PLATEAU_VTT = window.PLATEAU_VTT || { getCaseState: () => ({}), hexToPixel: (q, r) => ({ x: 300 + q * 60, y: 300 + r * 60 }),
                                                 pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {} };
    window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
    window.TOKENS_VTT_DATA = { D1: { q: 0, r: 0, url: "d.png" }, A1: { q: 1, r: 0, url: "x.png" }, A2: { q: 0, r: 1, url: "z.png" },
                               A3: { q: 4, r: 0, url: "y.png" }, M1: { q: -1, r: 0 } };
    const vue = () => {
      window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
      const fantomes = [...document.querySelectorAll(".token-fantome-ko")];
      return { fantomes: fantomes.map(f => f.id).sort(),
               opacite: fantomes[0] ? parseFloat(fantomes[0].querySelector(".fantome-ko-portrait").style.opacity) : null,
               cranes: fantomes.filter(f => f.querySelector(".fantome-ko-crane svg")).map(f => f.id).sort(),
               opaciteCrane: fantomes[0] && fantomes[0].querySelector(".fantome-ko-crane")
                 ? parseFloat(fantomes[0].querySelector(".fantome-ko-crane").style.opacity) : null,
               clic: fantomes[0] ? getComputedStyle(fantomes[0]).pointerEvents : null,
               pions: [...document.querySelectorAll(".token-vtt:not(.token-fantome-ko)")].map(t => t.id).sort() };
    };
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];        // le joueur du Médicus
    const medicus = vue();
    // La Prise en charge déjà jouée : plus de tête de mort.
    window.PERSOS_PARTIE[0].techniquesUtilisees = ["CLASSE_PRISE_EN_CHARGE"];
    const apresUsage = vue();
    window.PERSOS_PARTIE[0].techniquesUtilisees = [];
    // Un Médicus de niveau 5 n'a pas encore la technique.
    const xp = window.PERSOS_PARTIE[0].xp; window.PERSOS_PARTIE[0].xp = 2500;
    const niveau5 = vue();
    window.PERSOS_PARTIE[0].xp = xp;
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[2]];        // un autre joueur
    const autre = vue();
    return { medicus, autre, apresUsage, niveau5 };
  });
  verifier("le joueur du Médicus voit les fantômes de ses alliés KO (pas de l'ennemi mort)",
           JSON.stringify(r.medicus.fantomes) === '["fantome-A1","fantome-A3"]', JSON.stringify(r.medicus.fantomes));
  verifier("très pâles, et on ne peut pas cliquer dessus", r.medicus.opacite > 0 && r.medicus.opacite <= 0.25 && r.medicus.clic === "none",
           `${r.medicus.opacite} ${r.medicus.clic}`);
  verifier("les vivants restent des pions normaux", JSON.stringify(r.medicus.pions) === '["token-A2","token-D1"]', JSON.stringify(r.medicus.pions));
  verifier("un autre joueur ne voit aucun fantôme", r.autre.fantomes.length === 0, JSON.stringify(r.autre.fantomes));
  verifier("une tête de mort, légère, sur chaque allié tombé tant que la Prise en charge est là",
           JSON.stringify(r.medicus.cranes) === '["fantome-A1","fantome-A3"]' && r.medicus.opaciteCrane > 0.4 && r.medicus.opaciteCrane < 1,
           `${JSON.stringify(r.medicus.cranes)} ${r.medicus.opaciteCrane}`);
  verifier("Prise en charge déjà jouée : plus de tête de mort (le fantôme reste)",
           r.apresUsage.cranes.length === 0 && r.apresUsage.fantomes.length === 2, JSON.stringify(r.apresUsage.cranes));
  verifier("Médicus niveau 5 (pas encore la technique) : pas de tête de mort", r.niveau5.cranes.length === 0);
}

// =========================================================================
console.log("\n6. UN ALLIÉ RELEVÉ REVIENT DANS LE JEU (Combattants_Hors_Jeu)");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    window.ID_PARTIE_COURANTE = "P";
    window.REINITIALISATION_COMBAT_EN_COURS = false;
    window.PARTIE_DATA = { Ordre_Initiative: ["D1", "A1", "A2"], Combattants_Hors_Jeu: ["A1"] };
    let ecrit = null;
    window.modifierPartie = async (f) => { ecrit = f().maj; return {}; };
    // La fiche locale dit encore A1 à zéro : le cerveau, lui, le dit debout.
    await window.synchroniserCombattantsHorsJeu([], ["D1", "A1", "A2"]);
    const releve = ecrit && ecrit.Combattants_Hors_Jeu;
    ecrit = null;
    window.PARTIE_DATA = { Ordre_Initiative: ["D1", "A1", "A2"], Combattants_Hors_Jeu: [] };
    await window.synchroniserCombattantsHorsJeu(["A1"], ["D1", "A2"]);
    return { releve, tombe: ecrit && ecrit.Combattants_Hors_Jeu };
  });
  verifier("relevé par le cerveau : il sort des hors-jeu", JSON.stringify(r.releve) === '[]', JSON.stringify(r.releve));
  verifier("tombé : il y entre, comme avant", JSON.stringify(r.tombe) === '["A1"]', JSON.stringify(r.tombe));
}

// =========================================================================
console.log("\n7. LA FICHE PERSO ET LA FICHE DE CLASSE");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    document.getElementById("fenetre-combat").style.display = "none";
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
    const fiche = document.getElementById("fenetre-fiche-perso");
    fiche.style.display = "flex";
    document.getElementById("champ-id-personnage").value = "D1";
    window.PERSOS_PARTIE = [{ idPersonnage: "D1", prenom: "Galien", classe: "Médicus", xp: 2500, couleur: "#335", deckEquipe: [], PV_Max: 40 }];
    window.PERSOS_JOUEURS_PARTIE = window.PERSOS_PARTIE;
    window.CACHE_COMPETENCES_GLOBAL = { D1: {} };
    await window.chargerOngletCompetences("D1", 7);
    const techniques = [...document.querySelectorAll(".technique-classe")].map(x => [x.dataset.technique, x.dataset.statut]);
    fiche.style.display = "none";
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    await window.ouvrirChoixClasse();
    window.ouvrirFicheClasse("CLASSE_MEDICUS");
    const d = document.getElementById("descriptif-fiche-classe");
    return { techniques, visible: getComputedStyle(d).display !== "none",
             niveaux: [...d.querySelectorAll(".palier-classe-niveau")].map(x => x.textContent.trim()), texte: d.textContent };
  });
  await p.screenshot({ path: "/tmp/claude-0/medicus_classe.png" });
  verifier("fiche perso niveau 5 : Soin d'urgence acquis, Prise en charge au niveau 10",
           JSON.stringify(r.techniques) === '[["CLASSE_SOIN_URGENCE","Une fois par combat"],["CLASSE_PRISE_EN_CHARGE","Niveau 10 requis"]]',
           JSON.stringify(r.techniques));
  verifier("fiche de classe : paliers Niv. 1 / 5 / 10", r.visible && JSON.stringify(r.niveaux) === '["Niv. 1","Niv. 5","Niv. 10"]');
  verifier("Soin d'urgence et Prise en charge y sont dits", /Soin d'urgence/.test(r.texte) && /Prise en charge/.test(r.texte) && /12 PV/.test(r.texte));
}

// =========================================================================
console.log("\n8. +1 À CHACUN DE SES SOINS");
// =========================================================================
{
  const r = await p.evaluate(() => {
    const carte = () => ({ attaques: [{ nom: "Soin", valeurBrute: 5, isHeal: true, cibles: ["A1"] },
                                      { nom: "Soin 2", valeurBrute: 3, isHeal: true, cibles: ["A2"] },
                                      { nom: "Coup", valeurBrute: 4, typeRes: "Physique", cibles: ["M1"] },
                                      { nom: "Bouclier", valeurBrute: 10, isShield: true, cibles: ["A1"] }], alterations: [] });
    const enrichir = (perso) => { const st = carte(); window.appliquerEquipementALaCarte(st, perso, ""); return st.attaques.map(a => a.valeurBrute); };
    return { medicus: enrichir({ idPersonnage: "D1", camp: "Allié", classe: "Médicus", xp: 0 }),
             sansAccent: enrichir({ idPersonnage: "D2", camp: "Allié", classe: "medicus", xp: 0 }),
             autre: enrichir({ idPersonnage: "X", camp: "Allié", classe: "Oracle", xp: 0 }) };
  });
  verifier("Médicus : chaque soin +1 (5 → 6, 3 → 4), ni le coup ni le bouclier",
           JSON.stringify(r.medicus) === "[6,4,4,10]", JSON.stringify(r.medicus));
  verifier("le nom se lit sans accent", JSON.stringify(r.sansAccent) === "[6,4,4,10]");
  verifier("une autre classe : rien", JSON.stringify(r.autre) === "[5,3,4,10]", JSON.stringify(r.autre));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
