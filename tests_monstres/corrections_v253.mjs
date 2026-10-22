// LES CORRECTIONS DE LA v253.
//
//   1. « J'ai un sort avec trois fois Traction magique. Au moment de la
//      sélection de cible, j'ai sélectionné ma première cible et ça a lancé
//      direct la traction sans avoir pu faire les deux autres. On devrait
//      pouvoir sélectionner les trois cibles une à une et ensuite ça tracte
//      les trois cibles en même temps. »
//   2. « Fais en sorte que les zones persistantes de dégâts puissent se mettre
//      avec les autres zones persistantes. »
//   3. « Les ennemis n'ont toujours pas reçu les dégâts des zones
//      persistantes, en tout cas ceux qui sont en statique dans la zone d'un
//      tour à l'autre. »
//   4. « Dans le menu Paramètres > Outils, crée-moi un bouton avec dedans le
//      tableau des possibilités de rencontre des monstres par difficulté, que
//      je puisse modifier comme bon me semble. »
//   5. « Le jet de blessure : fais en sorte qu'il ne se fasse que quand le
//      combat est perdu. Si le perso tombe KO en combat mais que le combat est
//      gagné, alors il n'aura aucune blessure. »
//   6. « Tu as mis pour les monstres une triche de 20 % sur tous leurs effets,
//      alors que ça doit être 20 % uniquement sur leurs effets d'état, style
//      Glacé, Peur, etc. Pas les dégâts ni les soins. »
import fs from 'fs'; import http from 'http'; import path from 'path';
import * as MP from '../moteur_pur.js';
import * as SP from '../spectateur_combat.js';
import { construireEtatCombat, creerDes } from '../combat_etat.js';
import { cloturerTour } from '../cerveau_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(74)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const fiche = (id, camp, extra = {}) => ({
    idPersonnage: id, camp, prenom: id, PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});
const monde = (positions, extra = {}) => {
    const ids = Object.keys(positions);
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 3,
        combattants: ids.map(id => fiche(id, id.startsWith("H") ? "Allié" : "Ennemi", id.startsWith("H") ? { idJoueur: "P" } : { estMonstre: true })),
        positions, partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ids } });
    e.phase = "Resolution"; e.ordre = ids;
    return Object.assign(e, extra);
};
const zone = (id, type, hexes, degats, extra = {}) => ({ id, type, hexes, degats: { valeurBrute: degats, typeRes: "Brut" },
    soin: null, etat: null, dureeRestante: 3, idLanceur: "H1", ...extra });

console.log("\n=========================================================");
console.log("  LES CORRECTIONS DE LA v253");
console.log("=========================================================");

console.log("\n1a. TROIS TRACTIONS, TROIS CIBLES, TIRÉES ENSEMBLE (le cerveau, le spectateur)");
{
    const e = monde({ H1: { q: 0, r: 0 }, M1: { q: 3, r: 0 }, M2: { q: 0, r: 3 }, M3: { q: -3, r: 3 } });
    const tr = (id, chance) => ({ nom: "Traction", chance, cases: 3, duree: 0, estTraction: true, avantAttaque: true, cibles: [id] });
    const r = MP.resoudreCarte(e, { type: "carte", idLanceur: "H1", idCarte: "C", critique: false, attaques: [],
        alterations: [tr("M1", 60), tr("M2", 15), tr("M3", 15)],
        jets: { attaqueRatee: false, parCible: { M1: { esquive: false, etats: { Traction: true } }, M2: { esquive: false, etats: { Traction: true } },
                                                 M3: { esquive: false, etats: { Traction: false } } } } });
    const etapes = r.etapes;
    const tirees = etapes.filter(x => x.type === "traction").map(x => x.cible);
    verifier("le cerveau tire chaque cible de son lot (M3 rate son jet)", JSON.stringify(tirees) === '["M1","M2"]', JSON.stringify(tirees));
    const i = etapes.findIndex(x => x.type === "traction");
    const groupe = typeof SP.groupeDeTractions === "function" ? SP.groupeDeTractions(etapes, i) : [];
    verifier("le spectateur joue les tirées d'un même coup (le jet raté avec)", groupe.length === 3
             && groupe.map(x => x.cible).join() === "M1,M2,M3", groupe.map(x => x.type + ":" + x.cible).join(" "));
    const seule = typeof SP.groupeDeTractions === "function"
        ? SP.groupeDeTractions([{ type: "traction", cible: "M1" }, { type: "degats", cible: "M1" }], 0) : null;
    verifier("une seule tirée : rien ne change (jouée seule)", Array.isArray(seule) && seule.length === 0);
    const meme = typeof SP.groupeDeTractions === "function"
        ? SP.groupeDeTractions([{ type: "traction", cible: "M1" }, { type: "traction", cible: "M1" }], 0) : null;
    verifier("deux tirées de la même cible : l'une après l'autre", Array.isArray(meme) && meme.length === 0);
}

console.log("\n2. LES ZONES DE DÉGÂTS SE POSENT SUR LES AUTRES");
{
    const e = monde({ H1: { q: 0, r: 0 }, M1: { q: 3, r: 0 } });
    MP.poserZone(e, zone("zp_feu", "feu", [{ q: 2, r: 0 }, { q: 3, r: 0 }], 5));
    const etapes = MP.poserZone(e, zone("zp_pieges", "neutre", [{ q: 3, r: 0 }, { q: 4, r: 0 }], 4));
    const cases = (id) => ((e.zones[id] || {}).hexes || []);
    verifier("des chausse-trappes sur le feu : le feu garde ses deux cases",
             cases("zp_feu").length === 2 && cases("zp_pieges").length === 2, JSON.stringify(Object.keys(e.zones)));
    verifier("(et rien n'est annoncé retiré ni amputé)", etapes.filter(x => x.type === "zone").length === 1);
    MP.poserZone(e, zone("zp_glace", "glace", [{ q: 3, r: 0 }], 3));
    verifier("de la glace sur le feu : elle le remplace sur sa case, les pièges restent",
             cases("zp_feu").length === 1 && cases("zp_feu")[0].q === 2 && cases("zp_pieges").length === 2,
             JSON.stringify({ feu: cases("zp_feu"), pieges: cases("zp_pieges") }));
    MP.poserZone(e, zone("zp_pieges2", "neutre", [{ q: 4, r: 0 }], 2));
    verifier("des pièges sur des pièges : les nouveaux remplacent les anciens", cases("zp_pieges").length === 1 && !!e.zones.zp_pieges2);
    const avant = e.combattants.M1.pv;
    const des = creerDes(11);
    const touche = MP.traverserZones(e, "M1", { q: 3, r: 0 }, des).filter(x => x.type === "degats").map(x => x.zone + ":" + x.montant);
    verifier("qui marche sur la case : la glace ET les pièges le frappent (3 + 4)", touche.length === 2 && avant - e.combattants.M1.pv === 7,
             touche.join(" "));
}

console.log("\n3. QUI RESTE DANS UNE ZONE LA SUBIT À CHAQUE FIN DE MANCHE");
{
    const e = monde({ H1: { q: 0, r: 0 }, M1: { q: 3, r: 0 }, M2: { q: 5, r: 0 }, M3: { q: 8, r: 0 } });
    MP.poserZone(e, zone("zp_feu", "feu", [{ q: 3, r: 0 }, { q: 5, r: 0 }], 6));
    // M2 y entre pendant la manche : il paie à l'entrée.
    MP.traverserZones(e, "M2", { q: 5, r: 0 }, creerDes(4));
    const pvM2 = e.combattants.M2.pv;
    e.file = [{ id: "M3" }];
    const clot = cloturerTour(e, creerDes(9));
    const frappes = (clot ? clot.etapes : []).filter(x => x.type === "degats" && x.zone).map(x => x.cible + ":" + x.montant);
    verifier("M1, immobile dans le feu : la fin de manche le brûle (6)", frappes.includes("M1:6") && e.combattants.M1.pv === 94, frappes.join(" "));
    verifier("M2, entré pendant la manche : déjà brûlé, pas deux fois", !frappes.some(f => f.startsWith("M2")) && e.combattants.M2.pv === pvM2, frappes.join(" "));
    verifier("M3, hors de la zone : rien", !frappes.some(f => f.startsWith("M3")));
    const ordre = (clot ? clot.etapes : []).map(x => x.type);
    verifier("la morsure passe avant le vieillissement de la zone",
             ordre.indexOf("degats") >= 0 && ordre.indexOf("degats") < ordre.lastIndexOf("zone"), ordre.join(","));
    verifier("la zone a vieilli d'une manche (3 → 2)", (e.zones.zp_feu || {}).dureeRestante === 2);
    // La manche suivante : M2 n'a pas bougé, il brûle aussi.
    e.file = [{ id: "M3" }];
    const clot2 = cloturerTour(e, creerDes(10));
    const frappes2 = (clot2 ? clot2.etapes : []).filter(x => x.type === "degats" && x.zone).map(x => x.cible);
    verifier("la manche d'après : M1 et M2, restés dedans, brûlent", frappes2.includes("M1") && frappes2.includes("M2"), frappes2.join(" "));
    // Dernière manche de la nappe : elle mord encore, puis s'efface.
    if (e.zones.zp_feu) e.zones.zp_feu.dureeRestante = 1;
    e.file = [{ id: "M3" }];
    const clot3 = cloturerTour(e, creerDes(12));
    const frappes3 = (clot3 ? clot3.etapes : []).filter(x => x.type === "degats" && x.zone).length;
    verifier("une nappe à sa dernière manche mord encore, puis s'efface", frappes3 === 2 && !e.zones.zp_feu, `${frappes3}`);
    // Une fin de tour qui n'est pas une fin de manche : personne ne brûle.
    const e2 = monde({ H1: { q: 0, r: 0 }, M1: { q: 3, r: 0 } });
    MP.poserZone(e2, zone("zp_feu", "feu", [{ q: 3, r: 0 }], 6));
    e2.file = [{ id: "H1" }, { id: "M1" }];
    const mi = cloturerTour(e2, creerDes(9));
    verifier("un tour qui s'achève en pleine manche : pas de morsure", !(mi ? mi.etapes : []).some(x => x.type === "degats"));
    // KO dans les flammes.
    const e3 = monde({ H1: { q: 0, r: 0 }, M1: { q: 3, r: 0 } });
    e3.combattants.M1.pv = 4;
    MP.poserZone(e3, zone("zp_feu", "feu", [{ q: 3, r: 0 }], 6));
    e3.file = [{ id: "M1" }];
    const ko = cloturerTour(e3, creerDes(9));
    verifier("à bout de forces, il tombe dans les flammes", e3.combattants.M1.aTerre === true
             && (ko ? ko.etapes : []).some(x => x.type === "chute" && x.cible === "M1"));
}

// =========================================================================
//  DANS LA PAGE DU JEU
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
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") }); export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data, opt) => { (window.__setDocs = window.__setDocs || []).push({ chemin: ref && ref.chemin, data: JSON.parse(JSON.stringify(data)), opt }); };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref && ref.chemin, data }); };
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => ({ increment: n }); export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a});
  export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
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
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: { 'Access-Control-Allow-Origin': '*' },
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="95" fill="#2a6ad8"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);
await p.evaluate(() => { window.__ou = (f, d) => { try { return f(); } catch (e) { return d; } }; });

console.log("\n1b. LE CIBLAGE : LES TROIS CIBLES UNE À UNE, PUIS ✔");
await p.evaluate((EFFETS) => {
  window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
  window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
  document.getElementById("fenetre-combat").style.display = "block";
  window.PLATEAU_VTT = { hexSize: 40, getCaseState: () => ({}), getHexesInRadius: () => [],
                         hexToPixel: (q, r) => ({ x: 400 + 40 * Math.sqrt(3) * (q + r / 2), y: 300 + 60 * r }),
                         pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {} };
  window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
  window.afficherMessageFlottantHex = (q, r, t) => { (window.__messages = window.__messages || []).push(t); };
  const f = (id, extra) => ({ idPersonnage: id, prenom: id, camp: "Ennemi", estMonstre: true, PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant", ...extra });
  window.PERSOS_PARTIE = [f("H1", { camp: "Allié", estMonstre: false, prenom: "Yasmina", race: "Ondari", xp: 0 }), f("M1"), f("M2"), f("M3"), f("M4")];
  window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, M1: { q: 3, r: 0 }, M2: { q: 0, r: 3 }, M3: { q: -3, r: 3 }, M4: { q: 0, r: -3 } };
  const act = (id, count, extra = {}) => ({ baseEffetId: id, count, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {}, ...extra });
  // « Traction de masse », la vraie carte de Yasmina : trois lignes Traction
  // magique (×4, ×1, ×1 — 60, 15 et 15 %), rien d'autre.
  window.COMPETENCES_CACHE = {
    MASSE: { Nom: "Traction de masse", Arme: "Magie", Fatigue: 30, Initiative: 70, Element: "Aucun",
             Composants: { actions: [act("EFF_TRACTION_MAGIQUE", 4), act("EFF_TRACTION_MAGIQUE", 1), act("EFF_TRACTION_MAGIQUE", 1)] } },
    TRIPLE: { Nom: "Rappel", Arme: "Magie", Fatigue: 20, Initiative: 50,
              Composants: { actions: [act("EFF_TRACTION_MAGIQUE", 3), act("EFF_ATTAQUE_MAGIQUE", 1, { element: "Feu", mods: { EFF_DISTANCE: 2 } })] } }
  };
  window.CACHE_COMPETENCES_GLOBAL = { H1: window.COMPETENCES_CACHE };
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
  window.COMBAT_INDEX_PERSO = 0;
  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
}, EFFETS_PAR_ID);
{
  const r = await p.evaluate(async () => {
    const lancees = [];
    const vraie = window.declencherResolutionAvecBondEventuel;
    window.declencherResolutionAvecBondEventuel = () => { lancees.push(1); };
    await window.demarrerCiblage("MASSE", { idLanceur: "H1" });
    const s = window.ETAT_CIBLAGE;
    const bulles = () => document.querySelectorAll(".bulle-validation-cible").length;
    const badges = () => Object.fromEntries([...document.querySelectorAll(".badge-traction")].map(x => [x.closest("[id^='token-']").id.replace("token-", ""), x.textContent]));
    const toucher = (id) => document.getElementById("token-" + id).click();
    window.__messages = [];
    const out = {};
    toucher("M1"); out.un = { bulles: bulles(), badges: badges(), msg: window.__messages.slice(-1)[0] };
    toucher("M2"); out.deux = { bulles: bulles(), badges: badges(), msg: window.__messages.slice(-1)[0] };
    toucher("M3"); out.trois = { bulles: bulles(), badges: badges(), msg: window.__messages.slice(-1)[0] };
    toucher("M4"); out.quatre = { msg: window.__messages.slice(-1)[0], ordre: [...(s.ordreTraction || [])] };
    toucher("M2"); out.retrait = { bulles: bulles(), badges: badges(), ordre: [...(s.ordreTraction || [])] };
    toucher("M4"); out.remis = { bulles: bulles(), badges: badges() };
    out.lancees = lancees.length;
    // ✔ : la carte part, une Traction par cible, chacune sa chance.
    window.regimeDemande = { actif: () => true, carte: async (id, charge) => { window.__envoi = charge; } };
    window.declencherResolutionAvecBondEventuel = vraie;
    const bulle = document.querySelector(".bulle-validation-cible");
    if (bulle) bulle.click();
    await new Promise(res => setTimeout(res, 300));
    const envoi = (window.__envoi || {}).alterations || [];
    out.envoi = envoi.filter(a => a.estTraction).map(a => `${(a.cibles || []).join()}:${a.chance}${a.avantAttaque ? "" : "!"}`);
    if (window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif) window.nettoyerCiblage();
    // Une seule ligne ×3 (crans au choix) : le ✔ attend aussi les trois.
    window.__envoi = null;
    await window.demarrerCiblage("TRIPLE", { idLanceur: "H1" });
    toucher("M1"); const c1 = bulles();
    toucher("M1"); const c2 = bulles();
    toucher("M1"); const c3 = bulles();
    out.crans = { c1, c2, c3, badge: badges().M1 };
    window.nettoyerCiblage();
    return out;
  });
  verifier("1re cible : la 1re Traction (60 %), « 2 à poser », pas encore de ✔",
           r.un.badges.M1 === "🧲 60 %" && /60 % · 2 à poser/.test(r.un.msg || "") && r.un.bulles === 0, JSON.stringify(r.un));
  verifier("2e cible : la 2e Traction (15 %), toujours pas de ✔",
           r.deux.badges.M2 === "🧲 15 %" && r.deux.badges.M1 === "🧲 60 %" && r.deux.bulles === 0, JSON.stringify(r.deux));
  verifier("3e cible : 15 %, tout est posé — le ✔ apparaît",
           r.trois.badges.M3 === "🧲 15 %" && r.trois.bulles > 0, JSON.stringify(r.trois));
  verifier("rien n'est parti tout seul en route", r.lancees === 0, `${r.lancees}`);
  verifier("une 4e cible : refusée, plus de traction à poser", /Plus de traction/.test(r.quatre.msg || "") && r.quatre.ordre.join() === "M1,M2,M3",
           JSON.stringify(r.quatre));
  verifier("retoucher M2 la retire : M3 remonte au 2e lot, le ✔ s'en va",
           r.retrait.ordre.join() === "M1,M3" && !r.retrait.badges.M2 && r.retrait.bulles === 0, JSON.stringify(r.retrait));
  verifier("une autre à sa place : de nouveau trois, de nouveau ✔", r.remis.badges.M4 === "🧲 15 %" && r.remis.bulles > 0, JSON.stringify(r.remis));
  verifier("au ✔ : trois Tractions, une par cible (60 / 15 / 15), jouées ensemble en tête",
           JSON.stringify(r.envoi) === '["M1:60","M3:15","M4:15"]', JSON.stringify(r.envoi));
  verifier("une ligne ×3 répartie au choix : le ✔ attend que les trois crans soient posés",
           r.crans.c1 === 0 && r.crans.c2 === 0 && r.crans.c3 > 0 && /45 %/.test(r.crans.badge || ""), JSON.stringify(r.crans));
}

console.log("\n4. PARAMÈTRES > OUTILS : LES RENCONTRES PAR DIFFICULTÉ, MODIFIABLES");
{
  const r = await p.evaluate(async () => {
    const out = {};
    const bouton = document.getElementById("btn-table-rencontres");
    const outils = document.getElementById("etape-menu-outils");
    out.bouton = !!bouton && !!outils && outils.contains(bouton);
    window.__ou(() => window.ouvrirTableRencontres(), null);
    await new Promise(res => setTimeout(res, 400));
    const fen = document.getElementById("etape-rencontres-monstres");
    out.ouverte = !!fen && getComputedStyle(fen).display !== "none";
    const lire = (diff) => [...document.querySelectorAll(`.bloc-rencontre[data-difficulte="${diff}"] tbody tr`)]
      .map(tr => [...tr.querySelectorAll("input")].map(i => i.value).join("/"));
    out.normale = lire("Normale"); out.difficile = lire("Difficile"); out.tres = lire("Très difficile");
    // On change une case : Normale, 1re ligne → 2 Petits au lieu d'1.
    window.__setDocs = [];
    const caseP = document.querySelector('.bloc-rencontre[data-difficulte="Normale"] input[data-ligne="0"][data-palier="Petit"]');
    if (caseP) { caseP.value = "2"; caseP.dispatchEvent(new Event("change")); }
    await new Promise(res => setTimeout(res, 50));
    out.apresCase = lire("Normale")[0];
    out.ecrit = (window.__setDocs || []).filter(d => d.chemin === "Monstres_Modeles/_RENCONTRES")
      .map(d => JSON.stringify(d.data.Normale && d.data.Normale[0]) + (d.opt && d.opt.merge ? "+merge" : ""));
    // Très difficile : une seule possibilité, 1 Boss et 2 Élites.
    const T = window.__ou(() => JSON.parse(JSON.stringify(window.TABLE_RENCONTRES)), null);
    if (T) {
      T["Très difficile"] = [{ Petit: 1, Normal: 0, "Élite": 2, Boss: 1 }];
      await window.__ou(() => window.enregistrerTableRencontres(T), null);
    }
    // Le bestiaire (un archetype par stature suffit à tirer une rencontre).
    const vraiGabarit = window.gabaritMonstre;
    window.gabaritMonstre = (a, pal) => (a === "DPS CAC" ? { Archetype: a, Palier: pal } : null);
    const tirages = [];
    for (let k = 0; k < 6; k++) tirages.push((window.tirerCompositionRencontre("Très difficile") || []).map(m => m.palier).join(","));
    out.tirages = [...new Set(tirages)];
    out.tresLignes = lire("Très difficile");
    // Ajouter, retirer une possibilité.
    const ajout = document.querySelector('.bloc-rencontre[data-difficulte="Difficile"] .btn-ajouter-rencontre');
    if (ajout) ajout.click();
    await new Promise(res => setTimeout(res, 50));
    out.apresAjout = lire("Difficile").length;
    const retrait = document.querySelectorAll('.bloc-rencontre[data-difficulte="Difficile"] .btn-retirer-rencontre')[0];
    if (retrait) retrait.click();
    await new Promise(res => setTimeout(res, 50));
    out.apresRetrait = lire("Difficile").length;
    // Une ligne sans créature ne se tire jamais.
    const T2 = window.__ou(() => JSON.parse(JSON.stringify(window.TABLE_RENCONTRES)), null);
    if (T2) {
      T2["Normale"] = [{ Petit: 0, Normal: 0, "Élite": 0, Boss: 0 }, { Petit: 0, Normal: 3, "Élite": 0, Boss: 0 }];
      await window.__ou(() => window.enregistrerTableRencontres(T2), null);
    }
    const vides = [];
    for (let k = 0; k < 8; k++) vides.push((window.tirerCompositionRencontre("Normale") || []).length);
    out.vides = [...new Set(vides)];
    out.chances = [...document.querySelectorAll('.bloc-rencontre[data-difficulte="Normale"] .rencontre-chance')].map(x => x.textContent);
    // Un autre poste l'a changée : la base l'apporte ici.
    window.__ou(() => window.appliquerTableRencontres({ Normale: [{ Petit: 4, Normal: 0, "Élite": 0, Boss: 0 }] }), null);
    out.ailleurs = (window.tirerCompositionRencontre("Normale") || []).map(m => m.palier).join(",");
    out.ailleursDifficile = (window.__ou(() => window.TABLE_RENCONTRES["Difficile"].length, 0));
    window.gabaritMonstre = vraiGabarit;
    // Rétablir l'origine.
    window.confirm = () => true;
    await window.__ou(() => window.retablirTableRencontres(), null);
    out.retabli = lire("Normale").length + "|" + lire("Difficile").length + "|" + lire("Très difficile").length;
    window.__ou(() => window.fermerTableRencontres(), null);
    return out;
  });
  verifier("un bouton « Rencontres par difficulté » dans Paramètres > Outils", r.bouton === true);
  verifier("il ouvre le tableau", r.ouverte === true);
  verifier("Normale : les cinq possibilités d'origine (Petit/Normal)",
           JSON.stringify(r.normale) === '["1/3/0/0","2/2/0/0","3/1/0/0","5/0/0/0","0/4/0/0"]', JSON.stringify(r.normale));
  verifier("Difficile : les mêmes, plus une Élite", JSON.stringify(r.difficile) === '["1/3/1/0","2/2/1/0","3/1/1/0","5/0/1/0","0/4/1/0"]', JSON.stringify(r.difficile));
  verifier("Très difficile : les mêmes, plus un Boss", JSON.stringify(r.tres) === '["1/3/0/1","2/2/0/1","3/1/0/1","5/0/0/1","0/4/0/1"]', JSON.stringify(r.tres));
  verifier("une case changée : le tableau la garde", r.apresCase === "2/3/0/0", r.apresCase);
  verifier("…et s'écrit tout de suite (Monstres_Modeles/_RENCONTRES, fusionné)",
           r.ecrit.length === 1 && r.ecrit[0] === '{"Petit":2,"Normal":3,"Élite":0,"Boss":0}+merge', r.ecrit.join(" | "));
  verifier("la rencontre tirée suit le tableau : Boss et Élites devant, puis le Petit",
           JSON.stringify(r.tirages) === '["Boss,Élite,Élite,Petit"]' && JSON.stringify(r.tresLignes) === '["1/0/2/1"]', JSON.stringify(r.tirages));
  verifier("+ Ajouter : une possibilité de plus ; ✖ : une de moins", r.apresAjout === 6 && r.apresRetrait === 5, `${r.apresAjout} → ${r.apresRetrait}`);
  verifier("une ligne sans créature ne se tire jamais (et le dit)", JSON.stringify(r.vides) === "[3]" && r.chances[0] === "jamais" && r.chances[1] === "100 %",
           JSON.stringify({ vides: r.vides, chances: r.chances }));
  verifier("un autre poste change la table : ce poste tire la sienne", r.ailleurs === "Petit,Petit,Petit,Petit" && r.ailleursDifficile === 5, r.ailleurs);
  verifier("Rétablir l'origine : cinq possibilités partout", r.retabli === "5|5|5", r.retabli);
  const src = fs.readFileSync('/home/user/Ivalis/monstres.js', 'utf-8');
  verifier("le document des rencontres n'est pas lu comme un gabarit", /startsWith\("_"\)/.test(src) && /_RENCONTRES/.test(src));
}

console.log("\n5. LA BLESSURE : SEULEMENT QUAND LE COMBAT EST PERDU");
{
  const r = await p.evaluate(async () => {
    localStorage.setItem("ID_JOUEUR_COURANT", "J1");
    window.ID_PARTIE_COURANTE = "PARTIE";
    const base = { camp: "Allié", race: "Humain", PV_Max: 60, Fatigue_Max: 100, caracs: { con: 10 }, talents: {}, deckEquipe: ["K1"] };
    const heros = () => [
      { ...base, idPersonnage: "P1", prenom: "Aldric", idJoueur: "J1", PV_Actuels: 0, blessures: [] },
      { ...base, idPersonnage: "P2", prenom: "Bryn", idJoueur: "J2", PV_Actuels: 30, blessures: [{ uid: "c1", id: "BLE_COURBATURES", combats: 1 }] }];
    const jouer = async (issue, rencontre) => {
      window.__partie = { ID_Rencontre: rencontre };
      window.PARTIE_DATA = { ...window.__partie };
      window.modifierPartie = async (fn) => { const res = fn(JSON.parse(JSON.stringify(window.__partie))); if (!res) return null; Object.assign(window.__partie, res.maj); return res.resultat; };
      window.PERSOS_PARTIE = heros(); window.PERSOS_JOUEURS_PARTIE = window.PERSOS_PARTIE;
      window.MONSTRES_PARTIE = [{ idPersonnage: "M1", camp: "Ennemi", estMonstre: true, statut: "Mort", PV_Max: 20, PV_Actuels: 0 }];
      window.__majs = [];
      const hasard = Math.random; Math.random = () => 0.79;
      try { await window.cloturerCombat(issue); } finally { Math.random = hasard; }
      const fin = window.__partie.Fin_Combat || {};
      const fiches = window.__majs.filter(m => m.data && m.data.Blessures);
      return { issue: fin.issue, blessures: Object.keys(fin.blessures || {}),
               p1: (fiches.find(m => m.chemin === "Personnages/P1") || { data: { Blessures: [] } }).data.Blessures.map(x => x.id),
               p2: (fiches.find(m => m.chemin === "Personnages/P2") || {}).data };
    };
    return { victoire: await jouer("victoire", "RV"), defaite: await jouer("defaite", "RD") };
  });
  verifier("victoire, Aldric à terre : aucun jet, aucune blessure", r.victoire.issue === "victoire" && r.victoire.blessures.length === 0
           && r.victoire.p1.length === 0, JSON.stringify(r.victoire));
  verifier("(ses vieilles blessures « combats » se décomptent quand même : Bryn guérit)", !!r.victoire.p2 && r.victoire.p2.Blessures.length === 0);
  verifier("défaite, Aldric à terre : son jet, sa blessure", r.defaite.issue === "defaite" && JSON.stringify(r.defaite.blessures) === '["P1"]'
           && r.defaite.p1.length === 1, JSON.stringify(r.defaite));
}

console.log("\n6. LA TRICHE DES SORTS DES CRÉATURES : LES ÉTATS SEULEMENT");
{
  const r = await p.evaluate(async () => {
    window.PERSOS_PARTIE = [{ idPersonnage: "M1", camp: "Ennemi", prenom: "Gnoll", estMonstre: true, Palier: "Normal",
                              PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" },
                            { idPersonnage: "H1", camp: "Allié", prenom: "Ilda", classe: "", race: "Humain", xp: 0,
                              PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }];
    window.TOKENS_VTT_DATA = { M1: { q: 0, r: 0 }, H1: { q: 1, r: 0 } };
    const carte = (actions) => ({ Nom: "Griffes", Arme: "Arme lourde CAC", Fatigue: 35, Initiative: 65, Composants: { actions }, Effets_Compiles: [] });
    const cartes = {
      COUP: carte([{ baseEffetId: "EFF_ATTAQUE_LOURDE", count: 4, mods: { EFF_CONFUSION: 2 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }]),
      SOIN: carte([{ baseEffetId: "EFF_SOIN", count: 2, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }])
    };
    window.CACHE_COMPETENCES_GLOBAL = { M1: cartes, H1: { COUP: JSON.parse(JSON.stringify(cartes.COUP)) } };
    const lire = async (id, qui) => {
      window.COMPETENCES_CACHE = {};
      const x = (await window.demarrerCiblage(id, { extraire: true, idLanceur: qui })) || {};
      const a = (x.attaques || [])[0] || {};
      return { v: a.valeurBrute, alt: (x.alterations || []).map(z => `${z.nom}:${z.chance}`) };
    };
    const libelle = (document.querySelector(".reglages-monstres-sorts") || {}).textContent || "";
    return { coup: await lire("COUP", "M1"), soin: await lire("SOIN", "M1"), heros: await lire("COUP", "H1"),
             libelle: libelle.replace(/\s+/g, " ").trim() };
  });
  verifier("la créature frappe comme sa carte : 12 (pas ×1,2)", r.coup.v === 12, JSON.stringify(r.coup));
  verifier("son soin aussi : 6", r.soin.v === 6, JSON.stringify(r.soin));
  verifier("sa Confusion, elle, prend les 20 % : 12 → 14 %", r.coup.alt.includes("Confusion:14"), JSON.stringify(r.coup.alt));
  verifier("chez un héros, rien ne bouge (12, Confusion 12 %)", r.heros.v === 12 && r.heros.alt.includes("Confusion:12"), JSON.stringify(r.heros));
  verifier("le réglage le dit : les chances d'état de leurs sorts", /Chances d'état de leurs sorts/.test(r.libelle) && !/dégâts, soins/.test(r.libelle), r.libelle);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
