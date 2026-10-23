// LE PROFANATEUR : LES POINTES DE GLACE (NIVEAU 5), ET SES ANIMATIONS EN JEU (v239).
//
// Nico : « Profanateur lvl5 : Compétence : Pointes de glace : 1 fois par
// combat, 0 fatigue, créer en cône devant le lanceur une zone de terrain de
// pics de glace (effet gelée standard, 75 % de chance de gelée, et enlève 5 %
// des PV max de la cible). » Puis, pour le Studio : « relève des zombies,
// zombie qui marche et qui attaque, sursis, soin refusé en sursis, fin de
// sursis, relève des zombies à 2 cases : on garde, tu peux intégrer. »
//
//   1. LE CÔNE : trois rangs (2, 3, 4 cases), dans six directions ;
//   2. LE CERVEAU : la technique à son niveau, une fois, le cône exact ; la
//      zone de glace (3 manches) ; ceux qui s'y tiennent, puis qui y entrent :
//      5 % des PV max sans défense, 75 % d'être Glacé (2 manches) ;
//   3. LE PONT : le nom de la technique ; la relève (à 1 et à 2 cases), le
//      sursis qui commence, le coup et le soin ignorés, la fin du sursis ont
//      leur geste ;
//   4. LE VRAI PLATEAU : chaque geste, ses sons, ses mots ; le zombie qui
//      titube ; le ciblage du cône.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, appliquerEntree, verifierEtatCombat, creerDes, tomber } from '../combat_etat.js';
import * as MP from '../moteur_pur.js';
// (Lu sans exiger ce qui est neuf : sur l'ancien code, le banc dit ce qui manque au lieu de planter.)
const { traverserZones, vieillirZones, resoudreCarte } = MP;
const conePointesGlace = MP.conePointesGlace || (() => []);
const orientationCone = MP.orientationCone || (() => -1);
const pointesDeGlace = MP.pointesDeGlace || (() => []);
const POINTES_GLACE = MP.POINTES_GLACE || {};
import { validerIntention, appliquerIntention } from '../cerveau_combat.js';
import { misEnScene } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(80)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const w = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/experience.js', 'utf-8'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);
const REGLES = {
    pvMax: w.pvMaxCombattant, fatigueMax: w.fatigueMaxCombattant,
    esquive: w.esquiveCombattant, parade: w.paradeCombattant,
    defPhysique: w.defPhysiqueCombattant, defMagique: w.defMagiqueCombattant,
    critique: w.critiqueCombattant, atouts: w.atoutRace, bonusEquip: w.bonusEquip
};
const XP = { 1: 0, 4: 1800, 5: 2500, 10: 7900 };
const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Ondari", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
// P (0,0) ; le cône « 0 » : (1,0) (1,-1) | (2,0) (2,-1) (2,-2) | (3,0) (3,-1) (3,-2) (3,-3).
// M1 dedans (armure 50 %), M2 dedans (3,-2), V un Vampire allié dedans (2,0),
// M3 dehors (-1,0), H dehors (0,1).
const monde = (niveau = 5, graine = 1) => {
    const fiches = [fiche("P", { classe: "Profanateur", xp: XP[niveau] }), fiche("M1", { Def_Physique: 50 }), fiche("M2"),
                    fiche("V", { classe: "Vampire", xp: 0 }), fiche("M3"), fiche("H")];
    const pos = { P: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 3, r: -2 }, V: { q: 2, r: 0 }, M3: { q: -1, r: 0 }, H: { q: 0, r: 1 } };
    const e = construireEtatCombat({ idPartie: "G", cerveau: "P", graine, combattants: fiches, positions: pos,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["P", "M1", "M2", "V", "M3", "H"];
    e.phase = "Resolution";
    e.file = [{ id: "P", carte: "CLASSE_POINTES_GLACE", initiative: 100, pas: 0 }, { id: "M3", carte: "X", initiative: 10, pas: 0 }];
    return e;
};
const cle = (h) => h.q + "," + h.r;
const intention = (cases, extra = {}) => ({ id: "I" + Math.random(), type: "classe", acteur: "P", idCarte: "CLASSE_POINTES_GLACE", cases, ...extra });

console.log("\n1. LE CÔNE : TROIS RANGS DEVANT LE PROFANATEUR, DANS SIX DIRECTIONS");
{
    const c0 = conePointesGlace({ q: 0, r: 0 }, 0);
    const rang = (h) => Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(h.q + h.r));
    verifier("9 cases : 2 au premier rang, 3 au deuxième, 4 au troisième",
             c0.length === 9 && [1, 2, 3].map(k => c0.filter(h => rang(h) === k).length).join() === "2,3,4", c0.map(cle).join(" "));
    verifier("le premier rang est celui de l'Assaut mortel ((1,0) et (1,-1))", c0.slice(0, 2).map(cle).join(" ") === "1,0 1,-1");
    const toutes = [0, 1, 2, 3, 4, 5].map(p => conePointesGlace({ q: 2, r: -1 }, p).map(cle).sort().join(" "));
    verifier("six directions, six cônes différents, chacun sans case en double", new Set(toutes).size === 6
             && toutes.every(t => new Set(t.split(" ")).size === 9));
    verifier("orientationCone reconnaît chaque direction, dans n'importe quel ordre",
             [0, 1, 2, 3, 4, 5].every(p => orientationCone({ q: 2, r: -1 }, [...conePointesGlace({ q: 2, r: -1 }, p)].reverse()) === p));
    const decale = conePointesGlace({ q: 1, r: 0 }, 0);
    verifier("…et refuse un cône décalé, amputé ou grossi", orientationCone({ q: 0, r: 0 }, decale) === -1
             && orientationCone({ q: 0, r: 0 }, c0.slice(0, 8)) === -1 && orientationCone({ q: 0, r: 0 }, [...c0, { q: 4, r: 0 }]) === -1);
}

console.log("\n2. LE CERVEAU : LA TECHNIQUE, LA ZONE DE GLACE, CEUX QUI S'Y TIENNENT");
{
    const cone = conePointesGlace({ q: 0, r: 0 }, 0);
    const e = monde(5);
    verifier("niveau 5, le cône exact : accepté", validerIntention(e, intention(cone)).ok, validerIntention(e, intention(cone)).raison);
    verifier("un cône décalé : refusé", !validerIntention(e, intention(conePointesGlace({ q: 1, r: 0 }, 0))).ok);
    verifier("sans cases : refusé", !validerIntention(e, intention(undefined)).ok);
    verifier("niveau 4 : il ne l'a pas", !validerIntention(monde(4), intention(cone)).ok, validerIntention(monde(4), intention(cone)).raison);

    const pas = appliquerIntention(e, intention(cone));
    const s = pas.etat, z = Object.values(s.zones || {})[0];
    verifier("une zone de glace sur les 9 cases, 3 manches, à son nom",
             !!z && z.type === "glace" && z.hexes.length === 9 && z.dureeRestante === POINTES_GLACE.manches && z.idLanceur === "P"
             && z.etat && z.etat.nom === "Glacé" && z.etat.chance === 75 && z.etat.duree === 2, JSON.stringify(z && { ...z, hexes: z.hexes.length }));
    verifier("ceux qui s'y tiennent : 5 % de leurs PV max, sans défense (M1, armure 50 % : -5 ; M2 : -5)",
             s.combattants.M1.pv === 95 && s.combattants.M2.pv === 95, `${s.combattants.M1.pv} / ${s.combattants.M2.pv}`);
    verifier("ceux du dehors n'ont rien", s.combattants.M3.pv === 100 && s.combattants.H.pv === 100 && s.combattants.P.pv === 100);
    // v260 : le Vampire RÉSISTE au gel (plus d'immunité) — 75 % → 50 %.
    const glaceV = s.combattants.V.etats.some(x => x.nom === "Glacé");
    verifier("le Vampire (résiste au gel, v260) : ses PV, et Glacé à 50 % au lieu de 75",
             s.combattants.V.pv === 95 && MP.chanceFaceA(s.combattants.V, "Glacé", 75) === 50
             && !pas.entree.etapes.some(x => x.type === "etatRate" && x.cible === "V" && x.immunise)
             && (glaceV || pas.entree.etapes.some(x => x.type === "etatRate" && x.cible === "V" && x.resiste)
                 || !pas.entree.etapes.some(x => x.type === "etats" && x.cible === "V")));
    verifier("la technique : marquée, aucune fatigue, le tour clos",
             s.combattants.P.techniquesUtilisees.includes("CLASSE_POINTES_GLACE") && s.combattants.P.fatigue === 100 && s.file[0].id === "M3");
    const t = pas.entree.etapes.find(x => x.type === "techniqueClasse");
    verifier("l'étape de la technique porte ses cases", t && (t.cases || []).length === 9);
    verifier("l'état reste cohérent, et se rejoue à l'identique depuis le journal",
             verifierEtatCombat(s).length === 0 && JSON.stringify(appliquerEntree(e, pas.entree).zones) === JSON.stringify(s.zones),
             verifierEtatCombat(s).join(" | "));
    const deux = appliquerIntention(s, intention(cone));
    verifier("une seule fois par combat", !validerIntention(s, intention(cone)).ok);
    void deux;

    // 75 % d'être Glacé, sur beaucoup de graines.
    let pris = 0, n = 0;
    for (let g = 1; g <= 400; g++) {
        const r = appliquerIntention(monde(5, g), intention(cone)).etat;
        n++; if (r.combattants.M2.etats.some(x => x.nom === "Glacé" && x.duree === 2)) pris++;
    }
    verifier("Glacé (2 manches) environ 3 fois sur 4", Math.abs(pris / n - 0.75) < 0.06, `${pris}/${n}`);

    // Qui y entre ensuite : la même chose (avec des dés imposés : pas d'esquive, la gelée prend).
    const des = (jets) => { const v = creerDes(5), f = [...jets]; return { ...v, d100: () => f.length ? f.shift() : v.d100() }; };
    const ap = JSON.parse(JSON.stringify(s));
    ap.combattants.H.q = 1; ap.combattants.H.r = -1;
    const entre = traverserZones(ap, "H", { q: 1, r: -1 }, des([99, 60]));
    verifier("qui y entre ensuite : -5 PV bruts et Glacé (jet 60 ≤ 75)", ap.combattants.H.pv === 95 && ap.combattants.H.etats.some(x => x.nom === "Glacé")
             && entre.some(x => x.type === "degats" && x.brut === true), JSON.stringify(entre.map(x => x.type)));
    const ap2 = JSON.parse(JSON.stringify(s));
    traverserZones(ap2, "H", { q: 1, r: -1 }, des([99, 80]));
    verifier("…jet 80 > 75 : pas Glacé", ap2.combattants.H.pv === 95 && !ap2.combattants.H.etats.some(x => x.nom === "Glacé"));
    const ap3 = JSON.parse(JSON.stringify(s));
    ap3.combattants.H.def = { ...(ap3.combattants.H.def || {}), esquive: 30 };
    traverserZones(ap3, "H", { q: 1, r: -1 }, des([10, 1]));
    verifier("une esquive (comme toute zone) : rien", ap3.combattants.H.pv === 100 && !ap3.combattants.H.etats.some(x => x.nom === "Glacé"));
    // Elle s'efface au bout de 3 manches.
    const vieille = JSON.parse(JSON.stringify(s));
    const restes = [1, 2, 3].map(() => { vieillirZones(vieille); return Object.keys(vieille.zones || {}).length; });
    verifier("elle s'efface au bout de 3 manches", JSON.stringify(restes) === "[1,1,0]", JSON.stringify(restes));
    // Les cases gommées de la carte n'en sont pas.
    const gomme = { etatCase: (q, r) => ({ supprimee: q === 3, bloquee: false, difficile: false }) };
    const g = JSON.parse(JSON.stringify(monde(5)));
    pointesDeGlace(g, "P", cone, creerDes(3), gomme);
    verifier("les cases gommées de la carte n'en sont pas (5 sur 9)", ((Object.values(g.zones || {})[0] || {}).hexes || []).length === 5);
}

console.log("\n3. LE PONT : LA TECHNIQUE, LA RELÈVE, LE SURSIS");
{
    const e = monde(10);
    const s = (x) => misEnScene(x, e);
    const t = s({ type: "techniqueClasse", acteur: "P", idCarte: "CLASSE_POINTES_GLACE", cible: "P", utilisees: [] });
    verifier("la technique dit son nom : « ❄️ Pointes de glace »", t.texte === "❄️ Pointes de glace", t.texte);
    const z1 = s({ type: "zombie", cible: "M1", acteur: "P", camp: "Allié", pv: 15, pvMax: 15 });
    const z2 = s({ type: "zombie", cible: "M2", acteur: "P", camp: "Allié", pv: 15, pvMax: 15 });
    const e2 = monde(10); e2.combattants.M3.q = 2; e2.combattants.M3.r = -1;
    const z3 = misEnScene({ type: "zombie", cible: "M3", acteur: "P" }, e2);
    verifier("la relève : son geste (qui dit le mot), au contact du Profanateur",
             z1.reaction && (z1.reaction || {}).sorte === "releve-zombie" && (z1.reaction || {}).remplace && (z1.reaction || {}).depuis === "P" && (z1.reaction || {}).loin === false
             && (z1.reaction || {}).texte === "🧟 Se relève en zombie !", JSON.stringify(z1.reaction));
    verifier("…à 2 cases (ou plus : tué de sa main) : le grand sceau", (z3.reaction || {}).loin === true && (z2.reaction || {}).loin === true);
    const debut = s({ type: "sursis", cible: "P", acteur: "M1", tours: 2, entame: false, pvApres: 0, debut: true });
    const decompte = s({ type: "sursis", cible: "P", tours: 1, entame: false, pvApres: 0 });
    verifier("le sursis qui commence : son geste, qui dit « 💀 Sursis : 2 tours »",
             debut.reaction && (debut.reaction || {}).sorte === "sursis" && (debut.reaction || {}).remplace && (debut.reaction || {}).texte === "💀 Sursis : 2 tours");
    verifier("…le décompte garde son mot", !decompte.reaction && decompte.texte === "💀 Sursis : 1 tour");
    const coup = s({ type: "message", cible: "P", acteur: "M1", texte: "Sursis 💀", couleur: "#b388ff", sursis: "coup" });
    const soin = s({ type: "message", cible: "P", acteur: "H", texte: "Sursis : aucun soin 💀", couleur: "#b388ff", sursis: "soin" });
    verifier("le coup ignoré et le soin refusé : leur geste (qui dit le mot)",
             (coup.reaction || {}).sorte === "sursis-coup" && (coup.reaction || {}).depuis === "M1" && (coup.reaction || {}).remplace
             && (soin.reaction || {}).sorte === "sursis-soin-refuse" && (soin.reaction || {}).texte === "Sursis : aucun soin 💀");
    const fin = s({ type: "chute", cible: "P", acteur: "P", finSursis: true }), ko = s({ type: "chute", cible: "M1", acteur: "P" });
    verifier("la fin du sursis : son geste ; une chute ordinaire garde la mise à terre",
             (fin.reaction || {}).sorte === "sursis-fin" && (fin.reaction || {}).remplace && (ko.reaction || {}).sorte === "ko");

    // Le moteur le dit.
    const m = monde(10);
    m.combattants.P.pv = 0; m.combattants.P.sursis = { tours: 2, entame: false };
    const frappe = resoudreCarte(m, { type: "carte", idLanceur: "M1", idCarte: "C", critique: false, alterations: [],
        attaques: [{ nom: "Coup", valeurBrute: 9, typeRes: "Physique", cibles: ["P"] }], jets: { parCible: { P: { esquive: false, etats: {} } } } });
    const soigne = resoudreCarte(m, { type: "carte", idLanceur: "H", idCarte: "C", critique: false, alterations: [],
        attaques: [{ nom: "Soin", valeurBrute: 9, isHeal: true, cibles: ["P"] }], jets: { parCible: { P: { esquive: false, etats: {} } } } });
    verifier("en sursis, le moteur dit ce qui a été ignoré (sursis : « coup », « soin »)",
             frappe.etapes.some(x => x.type === "message" && x.sursis === "coup") && soigne.etapes.some(x => x.type === "message" && x.sursis === "soin"));
    const t0 = monde(10); t0.combattants.P.pv = 0;
    const tombe = tomber(t0, "P", "M1");
    verifier("le sursis qui commence le dit (« debut »)", tombe[0].type === "sursis" && tombe[0].debut === true, JSON.stringify(tombe));
}

// =========================================================================
//  4. LE VRAI PLATEAU
// =========================================================================
const RACINE = '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id }); export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {}; export const updateDoc = async () => {};
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {}; export const query = (...a) => ({a});
  export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com/**', r => r.fulfill({ contentType: 'image/svg+xml', headers: { 'Access-Control-Allow-Origin': '*' },
  body: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="95" fill="#2a6ad8"/></svg>` }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(1800);

await p.evaluate(() => {
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById("fenetre-combat").style.display = "block";
  window.jouerSonClic = () => {};
  window.estCombattantMort = (id) => !!(window.__morts || {})[id];
  window.sequenceTourEnAttente = () => false;
  const s = 36;
  window.PLATEAU_VTT = {
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    hexToPixel: (q, r) => ({ x: 420 + 1.5 * s * q, y: 330 + s * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r) }),
    pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {}, hexSize: s
  };
  window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
  const f = (id, extra) => Object.assign({ idPersonnage: id, prenom: id, camp: "Allié", PV_Max: 60, PV_Actuels: 60,
    Fatigue_Max: 100, fatigueActuelle: 100, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant" }, extra || {});
  window.PERSOS_PARTIE = [f("P1", { prenom: "Morg", race: "Ondari", classe: "Profanateur", xp: 7900 }),
                          f("Z1", { prenom: "Goule", estMonstre: true, zombie: true }),
                          f("M1", { camp: "Ennemi", estMonstre: true, prenom: "Spectre" }),
                          f("M2", { camp: "Ennemi", estMonstre: true, prenom: "Ombre" })];
  const url = "https://res.cloudinary.com/x/image/upload/portrait.png";
  window.TOKENS_VTT_DATA = { P1: { q: 0, r: 0, url, taille: 55 }, Z1: { q: -2, r: 2, taille: 55 }, M1: { q: 1, r: 0, taille: 55 }, M2: { q: 2, r: -2, taille: 55 } };
  window.ZONES_PERSISTANTES = {};
  window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 2, File_Attente_Combat: [] };
  window.DELAI_DEPLOIEMENT_MS = 0;
  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
  window.__sons = []; window.__textes = [];
  const vraiSon = window.jouerSonCombat;
  window.jouerSonCombat = (id, f) => { window.__sons.push(id); return vraiSon(id, f); };
  const vraiTexte = window.afficherMessageFlottantHex;
  window.afficherMessageFlottantHex = (q, r, t, c, o) => { window.__textes.push(t); return vraiTexte(q, r, t, c, o); };
  window.__noter = () => { window.__sons = []; window.__textes = []; };
  window.__guetter = () => {
    const vus = { textes: new Set(), lames: 0, grand: 0, cache: false, figurants: 0 }; let fini = false;
    const tour = () => {
      document.querySelectorAll("#conteneur-tokens-vtt .anim-effet").forEach(e => {
        vus.textes.add((e.textContent || "").trim());
        if (e.querySelector && e.querySelector("polygon") && parseFloat(e.style.width) > 36 * 1.12 * 2.5) vus.grand++;
        if (e.classList.contains("anim-figurant")) vus.figurants++;
      });
      vus.lames = Math.max(vus.lames, document.querySelectorAll("#conteneur-tokens-vtt .entaille-lame").length);
      if (document.querySelector("#conteneur-tokens-vtt .pion-en-entree")) vus.cache = true;
      if (!fini) requestAnimationFrame(tour);
    };
    requestAnimationFrame(tour);
    return () => { fini = true; return { textes: [...vus.textes].join(" "), lames: vus.lames, grand: vus.grand, cache: vus.cache, figurants: vus.figurants }; };
  };
  window.__animsDe = (id) => {
    const el = document.getElementById("token-" + id), vues = new Set(), images = []; let fini = false;
    const tour = () => { if (el) el.getAnimations().forEach(an => { if (!vues.has(an)) { vues.add(an); images.push(an.effect.getKeyframes().map(k => (k.transform || "") + "|" + (k.filter || ""))); } });
                         if (!fini) requestAnimationFrame(tour); };
    requestAnimationFrame(tour);
    return () => { fini = true; return images; };
  };
  window.__attendre = (ms) => new Promise(r => setTimeout(r, ms));
});

console.log("\n4. LE VRAI PLATEAU : LE ZOMBIE QUI TITUBE, QUI SE RELÈVE ; LE SURSIS");
{
  const r = await p.evaluate(async () => {
    const res = {};
    // LE ZOMBIE QUI MARCHE.
    window.__noter();
    let a = window.__animsDe("Z1");
    res.sorte = window.sortePasDeCombat({ idToken: "Z1" });
    await window.jouerAnimationPas({ idToken: "Z1", de: { q: -2, r: 2 }, vers: { q: -1, r: 2 }, cout: 0 });
    await window.__attendre(100);
    const imgs = a();
    // Il tangue : une rotation qui n'est pas nulle au milieu de la foulée.
    const tangue = imgs.some(k => k.some(x => (x.match(/rotate\((-?[\d.]+)deg\)/g) || []).some(m => Math.abs(parseFloat(m.slice(7))) > 0.01)));
    res.pas = { sons: window.__sons, tangue, surCase: +document.getElementById("token-Z1").dataset.q === -1 };
    // LA RELÈVE AU CONTACT (le pion est encore là, éteint par sa chute).
    await window.__attendre(300);
    window.__noter();
    document.getElementById("token-M1").style.opacity = "0";
    let g = window.__guetter();
    const t0 = performance.now();
    res.releve = { joue: await window.animerReactionCombat({ sorte: "releve-zombie", pion: "M1", depuis: "P1", loin: false, texte: "🧟 Se relève en zombie !" }) };
    await window.__attendre(3200);
    Object.assign(res.releve, g(), { sons: window.__sons, textes2: window.__textes, ms: performance.now() - t0,
                                     visible: getComputedStyle(document.getElementById("token-M1")).opacity === "1"
                                              && !document.getElementById("token-M1").classList.contains("pion-en-entree") });
    // LA RELÈVE À 2 CASES, PION ABSENT : il se relève quand le plateau le redessine.
    window.__noter();
    window.__morts = { M2: true };
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    res.absent = !document.getElementById("token-M2");
    g = window.__guetter();
    res.loin = { joue: await window.animerReactionCombat({ sorte: "releve-zombie", pion: "M2", depuis: "P1", loin: true, texte: "🧟 Se relève en zombie !" }) };
    await window.__attendre(200);
    res.loin.attente = window.__sons.length === 0;
    window.__morts = {};
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    await window.__attendre(3600);
    Object.assign(res.loin, g(), { sons: window.__sons, textes2: window.__textes,
                                   visible: !!document.getElementById("token-M2") && !document.getElementById("token-M2").classList.contains("pion-en-entree") });
    // LE SURSIS QUI COMMENCE.
    window.__noter();
    g = window.__guetter(); a = window.__animsDe("P1");
    res.sursis = { joue: await window.animerReactionCombat({ sorte: "sursis", pion: "P1", texte: "💀 Sursis : 2 tours", couleur: "#b388ff" }) };
    Object.assign(res.sursis, g(), { sons: window.__sons, textes2: window.__textes, gris: a().flat().some(x => /grayscale\(1\)/.test(x)) });
    await window.__attendre(600);
    // UN COUP IGNORÉ.
    window.__noter();
    g = window.__guetter();
    res.coup = { joue: await window.animerReactionCombat({ sorte: "sursis-coup", pion: "P1", depuis: "M1", texte: "Sursis 💀", couleur: "#b388ff" }) };
    Object.assign(res.coup, g(), { sons: window.__sons, textes2: window.__textes });
    await window.__attendre(600);
    // UN SOIN REFUSÉ.
    window.__noter();
    res.soin = { joue: await window.animerReactionCombat({ sorte: "sursis-soin-refuse", pion: "P1", texte: "Sursis : aucun soin 💀", couleur: "#b388ff" }) };
    Object.assign(res.soin, { sons: window.__sons, textes2: window.__textes });
    await window.__attendre(600);
    // LA FIN DU SURSIS.
    window.__noter();
    g = window.__guetter();
    res.fin = { joue: await window.animerReactionCombat({ sorte: "sursis-fin", pion: "P1" }) };
    Object.assign(res.fin, g(), { sons: window.__sons, textes2: window.__textes, eteint: document.getElementById("token-P1").style.opacity === "0" });
    await window.__attendre(1600);
    res.reste = document.querySelectorAll("#conteneur-tokens-vtt .anim-effet").length;
    return res;
  });
  verifier("le zombie qui marche : il titube, d'un pas lourd, gémit au premier pas, et reste sur sa case",
           r.sorte === "zombie" && r.pas.sons.includes("zombie") && r.pas.sons.includes("pas-lourd") && r.pas.tangue && r.pas.surCase, JSON.stringify(r.pas));
  verifier("la relève au contact : sa copie se relève sur le sceau vert (le vrai pion caché), sons et mot",
           r.releve.joue === true && r.releve.cache && r.releve.figurants >= 1 && r.releve.sons.includes("zombie") && r.releve.sons.includes("releve")
           && r.releve.textes2.includes("🧟 Se relève en zombie !") && !r.releve.grand, JSON.stringify({ ...r.releve, textes: undefined }));
  verifier("…puis le vrai pion reparaît", r.releve.visible);
  verifier("la relève à 2 cases, pion absent : elle attend qu'il soit redessiné, puis le grand sceau du Profanateur",
           r.absent && r.loin.joue === true && r.loin.attente && r.loin.sons.includes("releve") && r.loin.grand >= 1 && r.loin.visible
           && r.loin.textes2.includes("🧟 Se relève en zombie !"), JSON.stringify({ ...r.loin, textes: undefined }));
  verifier("le sursis qui commence : grisé, le sablier, son mot, son son",
           r.sursis.joue && r.sursis.gris && r.sursis.textes.includes("⏳") && r.sursis.textes2.includes("💀 Sursis : 2 tours") && r.sursis.sons.includes("sursis"),
           JSON.stringify(r.sursis));
  verifier("un coup ignoré : une entaille grise, un bruit sourd, « Sursis 💀 »",
           r.coup.joue && r.coup.lames >= 1 && r.coup.sons.includes("coup-sourd") && r.coup.textes2.includes("Sursis 💀"), JSON.stringify(r.coup));
  verifier("un soin refusé : le soin vient, se ternit — « Sursis : aucun soin 💀 »",
           r.soin.joue && r.soin.sons.includes("soin") && r.soin.sons.includes("refus") && r.soin.textes2.includes("Sursis : aucun soin 💀"), JSON.stringify(r.soin));
  verifier("la fin du sursis : le sablier renversé, la chute, « Fin du sursis », le pion éteint",
           r.fin.joue && r.fin.textes.includes("⌛") && r.fin.sons.includes("chute") && r.fin.textes2.includes("Fin du sursis") && r.fin.eteint, JSON.stringify(r.fin));
  verifier("rien ne reste", r.reste === 0, String(r.reste));
}

console.log("\n5. LE CIBLAGE : LE CÔNE TOURNE AUTOUR DU PROFANATEUR, ET PART AU CERVEAU");
{
  const r = await p.evaluate(async () => {
    window.TOKENS_VTT_DATA = { P1: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 5, r: 5 } };
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
    window.COMBAT_INDEX_PERSO = 0;
    window.COMPETENCES_CACHE = {}; window.CACHE_COMPETENCES_GLOBAL = { P1: {} };
    window.CHEMIN_MOUVEMENT = [];
    const demandes = [];
    window.regimeDemande = { actif: () => true, enVol: () => false, etat: () => null,
                             techniqueClasse: (a, id, cible, cibles, extra) => { demandes.push({ a, id, cible: cible || null, cibles: cibles || null, extra: extra || null }); } };
    const technique = window.techniquesDeClasse(window.PERSOS_PARTIE[0]);
    window.lancerTechniqueClasse("CLASSE_POINTES_GLACE", "P1");
    await new Promise(r => setTimeout(r, 150));
    const st = window.ETAT_CIBLAGE || {};
    const ciblage = { zone: !!st.isZone, cases: (st.zoneHexesBase || []).length, technique: st.techniqueClasse, centre: st.zoneCenterHex };
    st.zoneRotationStep = 2;
    window.validerZoneAoE();
    // Personne dans le cône : la zone part quand même (c'est du terrain).
    window.lancerTechniqueClasse("CLASSE_POINTES_GLACE", "P1");
    await new Promise(r => setTimeout(r, 150));
    window.ETAT_CIBLAGE.zoneRotationStep = 4;
    window.validerZoneAoE();
    if (typeof window.nettoyerCiblage === "function") window.nettoyerCiblage();
    return { technique, ciblage, demandes, ouvert: !!(window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif) };
  });
  const attendu = (pas) => conePointesGlace({ q: 0, r: 0 }, pas).map(cle).sort().join(" ");
  const recu = (i) => ((r.demandes[i] || {}).extra || {}).cases ? r.demandes[i].extra.cases.map(cle).sort().join(" ") : "";
  verifier("le Profanateur de niveau 10 a la technique", JSON.stringify(r.technique) === '["CLASSE_POINTES_GLACE"]', JSON.stringify(r.technique));
  verifier("le lancement ouvre un ciblage de zone de 9 cases autour de lui",
           r.ciblage.zone && r.ciblage.cases === 9 && r.ciblage.technique === "CLASSE_POINTES_GLACE" && r.ciblage.centre && r.ciblage.centre.q === 0,
           JSON.stringify(r.ciblage));
  verifier("valider : les cases du cône (tourné) partent au cerveau, le ciblage se ferme",
           r.demandes.length === 2 && r.demandes[0].a === "P1" && r.demandes[0].id === "CLASSE_POINTES_GLACE" && recu(0) === attendu(2)
           && recu(1) === attendu(4) && !r.ouvert, JSON.stringify(r.demandes.map(d => d.extra)));
  const regime = fs.readFileSync(`${RACINE}/regime_cerveau.js`, 'utf-8');
  verifier("la demande fait voyager les cases (regime_cerveau.js)", /extra && Array\.isArray\(extra\.cases\)/.test(regime));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
