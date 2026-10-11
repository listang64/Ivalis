// LES CORRECTIONS DE LA v235.
//
// Nico :
// 1. « Les renforts qui arrivent en combat, j'ai l'impression qu'ils spawnent
//    direct et pas au début du tour d'après. » Une créature perdue libère sa
//    place ; le renfort entre quand la manche suivante s'ouvre (renfortsDuTour
//    compte par manche), et la victoire attend tant que la réserve n'est pas
//    vide (combatGagne).
// 2. « Change les déplacements pour les monstres : petits 6, normal 5, élite 4,
//    boss 4. » (pasMaxDe, ia_pure.js ; pasMaxMonstre, monstres_ia.js)
// 3. « Il y a un bug avec la confusion : il a fait son attaque et après il a
//    fait "confus s'enfuit". L'attaque ne se fait que quand il est confus et le
//    fait sur un allié à lui ou sur soi-même ; s'il fuit il ne la fait pas. Et
//    s'il n'est plus confus alors il fait son attaque normale. »
// 4. « L'animation de à terre, tu ne l'as pas implantée du Studio, en tout cas
//    en jeu c'est pas la même. » Le pion abattu restait invisible : la vie à
//    zéro, le redessin le retirait AVANT sa mise à terre. Le coup qui abat le
//    retient (`chute`), la mise à terre du Studio le fait tomber.
// 5. « La validation de la cible ou la croix pour annuler se met en dessous de
//    l'effet aveugle de l'hexagone d'à côté : mets-les au-dessus. »
// 6. « Les boss, mets-leur qu'ils puissent effectuer deux compétences durant
//    leurs tours. »
import fs from 'fs';
import http from 'http';
import path from 'path';
import { construireEtatCombat, entreeDeFile } from '../combat_etat.js';
import { jouerCreature, appliquerIntention } from '../cerveau_combat.js';
import * as IA from '../ia_pure.js';
const { casesAccessibles } = IA;
// (Lu sans déstructurer : contre l'ancien code, qui n'avait qu'un plafond
// unique, le banc doit échouer sur ses contrôles plutôt qu'à l'import.)
const pasMaxDe = IA.pasMaxDe || (() => IA.PAS_MAX_CREATURE);
import { renfortsDuTour, fileDepuisEtat, misEnScene } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(70)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, camp, extra = {}) => ({
    idPersonnage: id, camp, prenom: id, PV_Max: 60, PV_Actuels: 60,
    Fatigue_Max: 100, Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Critique: 0,
    Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});
const carteM = (idCarte = "CM", valeur = 8, fatigue = 5) => ({ idCarte, infos: { portee: 1, fatigue },
    attaques: [{ valeurBrute: valeur, rangeMax: 1, typeRes: "Physique" }], alterations: [] });
const textes = (pas) => (pas && pas.entree ? pas.entree.etapes : []).map(e => e.texte || e.type);

console.log("\n=========================================================");
console.log("  LES CORRECTIONS DE LA v235");
console.log("=========================================================");

console.log("\n1. LES RENFORTS ENTRENT AU DÉBUT DE LA MANCHE SUIVANTE");
{
    const memoire = { annonces: new Set(), attente: [], clePrecedente: null };
    const etatDe = (manche, tete, combattants) => ({ manche, phase: "Resolution", file: [{ id: tete }],
        combattants: Object.fromEntries(combattants.map(c => [c.id, { estMonstre: c.id.startsWith("M"), ...c }])) });
    const r1 = renfortsDuTour(etatDe(1, "P", [{ id: "P" }, { id: "M1" }, { id: "M2" }]), memoire);
    verifier("personne ne tombe : aucun renfort", r1.renforts === 0 && !r1.morts.length);
    const r2 = renfortsDuTour(etatDe(1, "P", [{ id: "P" }, { id: "M1", aTerre: true }, { id: "M2" }]), memoire);
    verifier("M1 tombe : marqué mort, le renfort attend", JSON.stringify(r2.morts) === '["M1"]' && r2.renforts === 0);
    const r3 = renfortsDuTour(etatDe(1, "M2", [{ id: "P" }, { id: "M1", aTerre: true }, { id: "M2" }]), memoire);
    verifier("le tour de P s'achève, M2 joue : TOUJOURS pas de renfort (même manche)", r3.renforts === 0, JSON.stringify(r3));
    const r4 = renfortsDuTour(etatDe(1, "P", [{ id: "P" }, { id: "M1", aTerre: true }, { id: "M2" }]), memoire);
    verifier("ni au tour d'après dans la même manche", r4.renforts === 0);
    const r5 = renfortsDuTour(etatDe(2, "P", [{ id: "P" }, { id: "M1", aTerre: true }, { id: "M2" }]), memoire);
    verifier("la manche 2 s'ouvre : le renfort entre (un seul)", r5.renforts === 1 && !r5.morts.length, JSON.stringify(r5));
    const r6 = renfortsDuTour(etatDe(2, "M2", [{ id: "P" }, { id: "M1", aTerre: true }, { id: "M2" }]), memoire);
    verifier("et une seule fois", r6.renforts === 0);
}

console.log("\n2. LES DÉPLACEMENTS DES CRÉATURES SELON LEUR PALIER");
{
    verifier("pasMaxDe : petit 6, normal 5, élite 4, boss 4",
             pasMaxDe({ palier: "Petit" }) === 6 && pasMaxDe({ palier: "Normal" }) === 5
             && pasMaxDe({ palier: "Élite" }) === 4 && pasMaxDe({ palier: "Boss" }) === 4,
             [pasMaxDe({ palier: "Petit" }), pasMaxDe({ palier: "Normal" }), pasMaxDe({ palier: "Élite" }), pasMaxDe({ palier: "Boss" })].join("/"));
    const loin = (palier) => construireEtatCombat({
        idPartie: "P1", cerveau: "P_01", graine: 5,
        combattants: [fiche("H1", "Allié", { idJoueur: "P_01" }),
                      fiche("M1", "Ennemi", { estMonstre: true, Palier: palier })],
        positions: { H1: { q: 0, r: 0 }, M1: { q: 12, r: 0 } },
        partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["M1", "H1"],
                  File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "CM" }] } });
    const pasDe = (palier) => {
        const pas = jouerCreature(loin(palier), "M1", carteM(), null);
        return (pas && pas.entree ? pas.entree.etapes : []).filter(e => e.type === "pas" && e.acteur === "M1").length;
    };
    const plusLoin = (palier) => Math.max(...casesAccessibles(loin(palier), "M1", null).map(h => h.chemin.length));
    for (const [palier, n] of [["Petit", 6], ["Normal", 5], ["Élite", 4], ["Boss", 4]]) {
        verifier(`${palier.padEnd(6)} : ${n} cases au plus loin, et il les marche vers sa proie`,
                 plusLoin(palier) === n && pasDe(palier) === n, `${plusLoin(palier)} / ${pasDe(palier)} pas`);
    }
}

console.log("\n3. LA CONFUSION : L'ATTAQUE NE PART QUE DE TRAVERS OU GUÉRIE");
{
    const CONFUS = [{ nom: "Confusion", duree: 3 }];
    const monde = (g) => construireEtatCombat({
        idPartie: "P1", cerveau: "P_01", graine: g,
        combattants: [fiche("H1", "Allié", { idJoueur: "P_01" }),
                      fiche("M1", "Ennemi", { estMonstre: true, Etats_Alteres: CONFUS }),
                      fiche("M2", "Ennemi", { estMonstre: true })],
        positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 2, r: 0 } },
        partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["M1", "H1", "M2"],
                  File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "CM" }] } });
    const vus = {};
    for (let g = 1; g <= 600; g++) {
        const pas = jouerCreature(monde(g), "M1", carteM(), null);
        const t = textes(pas);
        const issue = t.includes("Confus : s'enfuit !") ? "fuite"
            : t.includes("Confus : ne fait rien") ? "rien"
            : t.includes("Confusion dissipée !") ? "dissipee"
            : (t.includes("Confus : attaque un allié !") || t.includes("Confus : s'inflige sa propre compétence !")) ? "travers" : "autre";
        if (!vus[issue]) vus[issue] = { g, pas, t };
    }
    verifier("(les quatre issues se rencontrent)", ["fuite", "rien", "dissipee", "travers"].every(k => vus[k]),
             Object.keys(vus).join(","));
    if (vus.fuite) {
        const { pas, t } = vus.fuite;
        verifier("il s'enfuit : SANS lancer sa carte (aucune étape « carte »)", !t.includes("carte"), t.join(","));
        verifier("… le héros n'a rien pris, l'énergie de la carte n'est pas dépensée",
                 pas.etat.combattants.H1.pv === 60 && !pas.entree.etapes.some(e => e.type === "fatigue" && e.depense),
                 `${pas.etat.combattants.H1.pv} PV`);
        verifier("… et il fuit pour de bon (des pas après l'annonce)",
                 pas.entree.etapes.slice(t.indexOf("Confus : s'enfuit !")).some(e => e.type === "pas" && e.acteur === "M1"));
    }
    if (vus.rien) {
        const { pas, t } = vus.rien;
        verifier("rien : « Confus : ne fait rien », pas de carte, pas de dégâts",
                 !t.includes("carte") && pas.etat.combattants.H1.pv === 60, t.join(","));
        verifier("… et il reste confus", pas.etat.combattants.M1.etats.some(e => e.nom === "Confusion"));
    }
    if (vus.dissipee) {
        const { pas, t } = vus.dissipee;
        const iFin = t.indexOf("Confusion dissipée !"), iCarte = t.indexOf("carte");
        verifier("dissipée : il n'est plus confus AVANT sa carte, puis attaque normalement",
                 iFin >= 0 && iCarte > iFin && pas.etat.combattants.H1.pv < 60, `${t.join(",")} → ${pas.etat.combattants.H1.pv} PV`);
        verifier("… et n'est plus confus", !pas.etat.combattants.M1.etats.some(e => e.nom === "Confusion"));
    }
    if (vus.travers) {
        const { pas, t } = vus.travers;
        const c = pas.etat.combattants;
        verifier("de travers : la carte part, sur lui ou sur un allié, jamais sur le héros",
                 t.includes("carte") && c.H1.pv === 60 && (c.M1.pv < 60 || c.M2.pv < 60), `M1 ${c.M1.pv}, M2 ${c.M2.pv}`);
    }
    // Le joueur, même règle : sa fuite ne lance rien.
    const joueur = (g) => construireEtatCombat({
        idPartie: "P1", cerveau: "P_01", graine: g,
        combattants: [fiche("MOI", "Allié", { idJoueur: "P_01", Etats_Alteres: CONFUS }), fiche("GOB", "Ennemi", { estMonstre: true })],
        positions: { MOI: { q: 0, r: 0 }, GOB: { q: 2, r: 0 } },
        partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["MOI", "GOB"],
                  File_Attente_Combat: [{ idPersonnage: "MOI", idCarte: "C1" }] } });
    let fuiteJoueur = null;
    for (let g = 1; g <= 400 && !fuiteJoueur; g++) {
        const pas = appliquerIntention(joueur(g), { id: "I1", type: "carte", acteur: "MOI", poste: "P_01", idCarte: "C1",
            attaques: [{ valeurBrute: 10, cibles: ["GOB"], rangeMax: 3, typeRes: "Physique" }], alterations: [], coutFatigue: 5 }, null);
        if (textes(pas).includes("Confus : s'enfuit !")) fuiteJoueur = pas;
    }
    verifier("un héros confus qui fuit ne lance pas sa carte non plus",
             !!fuiteJoueur && !textes(fuiteJoueur).includes("carte") && fuiteJoueur.etat.combattants.GOB.pv === 60,
             fuiteJoueur ? textes(fuiteJoueur).join(",") : "");
}

console.log("\n4. LE COUP QUI ABAT RETIENT LE PION JUSQU'À SA MISE À TERRE");
{
    const avant = { manche: 1, combattants: { H1: { id: "H1", pv: 5, pvMax: 40 }, M1: { id: "M1", pv: 40 } } };
    const scene = misEnScene({ type: "degats", cible: "H1", acteur: "M1", champ: "pv", pvApres: 0, nature: "physique", valeur: 5 }, avant);
    const blesse = misEnScene({ type: "degats", cible: "H1", acteur: "M1", champ: "pv", pvApres: 3, nature: "physique", valeur: 2 }, avant);
    const poison = misEnScene({ type: "degats", cible: "H1", champ: "pv", pvApres: 0, valeur: 5 }, avant);
    verifier("le coup qui abat le dit (chute)", !!(scene.reaction && scene.reaction.chute), JSON.stringify(scene.reaction));
    verifier("un coup qui n'abat pas, non", !!blesse.reaction && !blesse.reaction.chute, JSON.stringify(blesse.reaction));
    verifier("un poison qui abat retient aussi le pion", !!(poison.reaction && poison.reaction.sorte === "retenir" && poison.reaction.chute),
             JSON.stringify(poison.reaction));
}

console.log("\n5. LE BOSS EFFECTUE DEUX COMPÉTENCES DANS SON TOUR");
{
    const monde = (palier, positions) => construireEtatCombat({
        idPartie: "P1", cerveau: "P_01", graine: 11,
        combattants: [fiche("H1", "Allié", { idJoueur: "P_01", PV_Max: 200, PV_Actuels: 200 }),
                      fiche("M1", "Ennemi", { estMonstre: true, Palier: palier })],
        positions: positions || { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } },
        partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["M1", "H1"],
                  File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "CM", idCarte2: "CM2" }] } });
    const boss = jouerCreature(monde("Boss"), "M1", carteM("CM", 8, 5), null, carteM("CM2", 6, 7));
    const cartesBoss = (boss ? boss.entree.etapes : []).filter(e => e.type === "carte").map(e => e.carte);
    verifier("un boss : deux cartes, la première puis la seconde", JSON.stringify(cartesBoss) === '["CM","CM2"]', JSON.stringify(cartesBoss));
    // (Entre les deux, il peut faire un pas de côté : il le paie aussi.)
    const marche = (boss ? boss.entree.etapes : []).filter(e => e.type === "pas" && e.acteur === "M1").reduce((t, e) => t + e.cout, 0);
    verifier("… les deux paient leur énergie (100 − 5 − 7, et sa marche)", boss && boss.etat.combattants.M1.fatigue === 88 - marche,
             `${boss && boss.etat.combattants.M1.fatigue} (marche ${marche})`);
    verifier("… et son tour se clôt une seule fois (il quitte la file)", boss && !(boss.etat.file || []).some(f => f.id === "M1"));
    const normal = jouerCreature(monde("Normal"), "M1", carteM("CM", 8, 5), null, carteM("CM2", 6, 7));
    const cartesNormal = (normal ? normal.entree.etapes : []).filter(e => e.type === "carte").map(e => e.carte);
    verifier("une créature d'un autre palier n'en joue qu'une", JSON.stringify(cartesNormal) === '["CM"]', JSON.stringify(cartesNormal));
    // Loin de sa proie : 4 cases de marche pour TOUT le tour, pas 4 par carte.
    const loin = jouerCreature(monde("Boss", { H1: { q: 0, r: 0 }, M1: { q: 9, r: 0 } }), "M1", carteM("CM", 8, 5), null, carteM("CM2", 6, 7));
    const pasLoin = (loin ? loin.entree.etapes : []).filter(e => e.type === "pas" && e.acteur === "M1").length;
    verifier("loin de sa proie : 4 cases pour tout le tour (pas 4 de plus pour la seconde)", pasLoin === 4, `${pasLoin} pas`);
    // La file : la seconde carte voyage de la partie au cerveau, et retour.
    const e = entreeDeFile({ idPersonnage: "M1", idCarte: "CM", idCarte2: "CM2", initiative: 30 });
    verifier("la file du cerveau garde la seconde carte (entreeDeFile)", e.carte2 === "CM2", JSON.stringify(e));
    const f = fileDepuisEtat({ file: [{ id: "M1", carte: "CM", carte2: "CM2", initiative: 30, pas: 0 }] });
    verifier("… et la rend à la partie (fileDepuisEtat)", f[0].idCarte2 === "CM2", JSON.stringify(f[0]));
}

// =========================================================================
//  PARTIE 2 : LA VRAIE PAGE
// =========================================================================
const RACINE = '/home/user/Ivalis';
const CAPTURES = '/tmp/claude-0';
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
const EFFETS = JSON.parse(fs.readFileSync(`${RACINE}/tests_monstres/effets_reels.json`, 'utf-8'));
const EFFETS_PAR_ID = Object.fromEntries((Array.isArray(EFFETS) ? EFFETS : Object.values(EFFETS)).map(e => [e.id, e]));

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 2 });
await p.route('**', r => {
  const url = r.request().url();
  if (url.startsWith(base)) return r.continue();
  if (url.includes('firebase-app.js')) return r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP });
  if (url.includes('firebase-firestore.js')) return r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE });
  const teinte = url.includes('pion-S') ? '#3a6ea5' : url.includes('pion-M1') ? '#a53a3a' : '#5a3d7a';
  if (url.includes('res.cloudinary.com')) return r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="96" fill="${teinte}" stroke="#e8d5a5" stroke-width="6"/></svg>` });
  return r.abort();
});
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

// Le plateau : S, le lanceur (aveuglé : le noir couvre des cases autour de
// M1 et sous S), en (0,0) ; M1, la cible, en (3,0).
const preparer = (extra) => p.evaluate(async ({ EFFETS, extra }) => {
  document.documentElement.style.setProperty("--app-h", "600px");
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
  document.getElementById("fenetre-combat").style.display = "block";
  window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
  window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
  window.jouerSonClic = () => {};
  window.afficherMessageFlottantHex = () => {};
  window.PLATEAU_VTT = { hexSize: 50, getCaseState: () => ({}), hexToPixel: (q, r) => ({ x: 120 + q * 75, y: 260 + r * 87 + q * 43 }),
                         pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {}, getHexesInRadius: () => [] };
  window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
  window.ZONES_PERSISTANTES = {};
  const noir = (extra && extra.noir) || [];
  const f = (id, x) => ({ idPersonnage: id, camp: "Allié", PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 100, fatigueActuelle: 100,
                          Etats_Alteres: [], statut: "Vivant", race: "Humain", ...x });
  window.PERSOS_PARTIE = [f("S", { prenom: "Ysolde", classe: "Hoplite", xp: 0,
                                   Etats_Alteres: noir.length ? [{ nom: "Aveuglé", duree: 2, cases: noir }] : [] }),
                          f("M1", { camp: "Ennemi", estMonstre: true, prenom: "Gnoll", PV_Actuels: (extra && extra.pvM1) !== undefined ? extra.pvM1 : 23 })];
  window.MONSTRES_PARTIE = [window.PERSOS_PARTIE[1]];
  const img = (id) => "https://res.cloudinary.com/ivalis/image/upload/pion-" + id + ".png";
  window.TOKENS_VTT_DATA = { S: { q: 0, r: 0, taille: 55, url: img("S") }, M1: { q: 3, r: 0, taille: 55, url: img("M1") } };
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]]; window.COMBAT_INDEX_PERSO = 0;
  window.REGIME_CERVEAU = true;
  const carte = { Nom: "Trait perçant", Fatigue: 10, Initiative: 20,
    Effets_Compiles: [{ nom: "Attaque légère", desc: "6 dégâts physiques", isMod: false }, { nom: "Distance", desc: "3 hexagones", isMod: true }],
    Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_LEGERE", count: 1, mods: { EFF_DISTANCE: 2 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } };
  window.COMPETENCES_CACHE = { C1: carte }; window.CACHE_COMPETENCES_GLOBAL = { S: window.COMPETENCES_CACHE };
  window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1, File_Attente_Combat: [{ idPersonnage: "S", idCarte: "C1", initiative: 20 }] };
  window.CHEMIN_MOUVEMENT = [];
  window.TOKEN_SELECTIONNE = "S";
  window.MURS_TERRE = {}; window.GRAVATS_TERRE = {};
  window.appliquerMursTerre();
  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
  if (typeof window.dessinerBrouillardAveuglement === "function") window.dessinerBrouillardAveuglement();
}, { EFFETS: EFFETS_PAR_ID, extra: extra || null });

// CE QUI SE VOIT À UN ENDROIT, et la preuve que le noir est bien peint
// dessous : on cache un instant l'élément mesuré (et son calque) et on demande
// qui est là — ce doit être le brouillard.
const auDessusDuNoir = (selecteur, fx = 0.5, fy = 0.5) => p.evaluate(({ sel, fx, fy }) => {
  const el = document.querySelector(sel);
  if (!el) return { existe: false };
  const r = el.getBoundingClientRect();
  const x = r.left + r.width * fx, y = r.top + r.height * fy;
  const svg = document.getElementById("svg-brouillard-aveugle");
  const touchables = svg ? [svg, ...svg.querySelectorAll("*")] : [];
  touchables.forEach(n => n.style.pointerEvents = "auto");
  const avant = el.style.pointerEvents;
  el.style.pointerEvents = "auto";
  const dessus = document.elementFromPoint(x, y);
  const vis = el.style.visibility;
  el.style.visibility = "hidden";
  const dessous = document.elementFromPoint(x, y);
  el.style.visibility = vis;
  el.style.pointerEvents = avant;
  touchables.forEach(n => n.style.pointerEvents = "none");
  return { existe: true, visible: !!dessus && (el === dessus || el.contains(dessus)),
           noirDessous: !!svg && !!dessous && svg.contains(dessous),
           dessus: dessus ? (dessus.className && dessus.className.baseVal !== undefined ? dessus.tagName : (dessus.className || dessus.tagName)) + "" : null,
           dessous: dessous ? dessous.tagName : null, x: Math.round(x), y: Math.round(y) };
}, { sel: selecteur, fx, fy });

console.log("\n6. LA BULLE ✔ ET LA CROIX ✖ PASSENT AU-DESSUS DU NOIR DE L'AVEUGLÉ");
{
  await preparer({ noir: [{ q: 3, r: 1 }, { q: 2, r: 1 }, { q: 4, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }, { q: 1, r: 0 }, { q: 0, r: 0 }] });
  const v = await p.evaluate(async () => {
    await window.demarrerCiblage("C1", { idLanceur: "S" });
    window.ajouterCibleCiblage("M1");
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    return { actif: !!(window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif), cible: window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.cibleUnique,
             noir: !!document.getElementById("svg-brouillard-aveugle") };
  });
  verifier("(le ciblage est ouvert sur M1, le noir est dessiné)", v.actif && v.cible === "M1" && v.noir, JSON.stringify(v));
  const ordre = await p.evaluate(() => {
    const haut = document.getElementById("calque-ciblage-haut"), noir = document.getElementById("calque-brouillard-vtt");
    return { zHaut: +getComputedStyle(haut).zIndex, zNoir: +getComputedStyle(noir).zIndex,
             apres: !!(noir.compareDocumentPosition(haut) & Node.DOCUMENT_POSITION_FOLLOWING) };
  });
  verifier("le calque des boutons est AU-DESSUS du calque du brouillard", ordre.zHaut > ordre.zNoir && ordre.apres, JSON.stringify(ordre));
  const bulle = await auDessusDuNoir("#calque-ciblage-haut .bulle-validation-cible, #token-M1 .bulle-validation-cible", 0.5, 0.85);
  const croix = await auDessusDuNoir("#calque-ciblage-haut .croix-annuler-ciblage, #token-S .croix-annuler-ciblage", 0.5, 0.85);
  verifier("(le noir est bien peint sous la bulle et sous la croix)", bulle.noirDessous && croix.noirDessous, JSON.stringify([bulle.dessous, croix.dessous]));
  verifier("la bulle ✔ se voit et se clique par-dessus le noir", bulle.existe && bulle.visible, JSON.stringify(bulle));
  verifier("la croix ✖ aussi", croix.existe && croix.visible, JSON.stringify(croix));
  await p.screenshot({ path: `${CAPTURES}/v235_bulle_noir.png`, clip: { x: 0, y: 190, width: 470, height: 290 } });
  await p.evaluate(() => { if (typeof window.nettoyerCiblage === "function") window.nettoyerCiblage(); });
}

console.log("\n7. EN JEU : LE PION ABATTU RESTE LÀ, PUIS TOMBE (la mise à terre du Studio)");
{
  await preparer({ pvM1: 23 });
  await p.evaluate(async () => {
    const pion = () => document.getElementById("token-M1");
    const visible = () => !!pion() && pion().style.display !== "none" && getComputedStyle(pion()).opacity !== "0";
    window.__visible = visible;
    // L'étape de dégâts descend : M1 à 0 PV, le redessin le passerait pour mort.
    window.__retenu = await window.animerReactionCombat({ sorte: "retenir", pion: "M1", chute: true });
    window.PERSOS_PARTIE[1].PV_Actuels = 0;
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    window.__apresDegats = visible();
    // La mise à terre : le geste du Studio, sur le vrai pion.
    window.__joue = null;
    window.__vraie = window.jouerAnimationJeu;
    window.jouerAnimationJeu = (id, sc) => { window.__joue = id; return window.__vraie(id, sc); };
    window.__ko = window.animerReactionCombat({ sorte: "ko", pion: "M1" });
  });
  await p.waitForTimeout(450);
  const pendant = await p.evaluate(() => window.__visible());
  // En pleine chute (la bascule va de 0,45 à 0,8 des 1,5 s du geste).
  await p.waitForTimeout(350);
  await p.screenshot({ path: `${CAPTURES}/v235_mise_a_terre.png`, clip: { x: 230, y: 280, width: 240, height: 190 } });
  const r = await p.evaluate(async () => {
    const pion = () => document.getElementById("token-M1");
    await window.__ko;
    window.jouerAnimationJeu = window.__vraie;
    const apresChute = pion() ? getComputedStyle(pion()).opacity : "absent";
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    return { retenu: window.__retenu, apresDegats: window.__apresDegats, joue: window.__joue, apresChute,
             retire: !pion() || pion().style.display === "none", libre: !window.pionRetenu("M1") };
  });
  r.pendant = pendant;
  verifier("le coup qui abat retient le pion", r.retenu === true, JSON.stringify(r));
  verifier("à 0 PV, le redessin le laisse sur le plateau", r.apresDegats, JSON.stringify(r));
  verifier("la mise à terre jouée est celle du Studio (jeu-mise-a-terre)", r.joue === "jeu-mise-a-terre", String(r.joue));
  verifier("le pion est là pendant qu'il tombe", r.pendant);
  verifier("tombé, il ne se relève pas, puis le redessin le retire", r.apresChute === "0" && r.retire && r.libre, JSON.stringify(r));
}

console.log("\n8. LA VICTOIRE ATTEND LES RENFORTS DE LA RÉSERVE");
{
  await preparer({ pvM1: 0 });
  const v = await p.evaluate(() => {
    window.MONSTRES_PARTIE[0].statut = "Mort";
    const sans = window.combatGagne();
    window.PARTIE_DATA.Reserve_Monstres = [{ idPersonnage: "M9" }];
    const avec = window.combatGagne();
    window.PARTIE_DATA.Reserve_Monstres = [];
    return { sans, avec };
  });
  verifier("le dernier ennemi abattu, réserve vide : victoire", v.sans === true, JSON.stringify(v));
  verifier("des renforts en réserve : pas encore", v.avec === false, JSON.stringify(v));
}

console.log("\n9. EN PRÉPARATION : UN BOSS CHOISIT DEUX COMPÉTENCES, ET MARCHE 4 CASES");
{
  const r = await p.evaluate(() => {
    const deck = { CA: { Nom: "Griffe", Fatigue: 10, Initiative: 30, Effets_Compiles: [{ nom: "Attaque lourde", desc: "12 dégâts physiques" }] },
                   CB: { Nom: "Rugissement", Fatigue: 8, Initiative: 20, Effets_Compiles: [{ nom: "Attaque légère", desc: "6 dégâts physiques" }] } };
    const m = (palier, fatigue) => ({ idPersonnage: "B1", camp: "Ennemi", estMonstre: true, Palier: palier, prenom: "Boss",
                                      fatigueActuelle: fatigue, Fatigue_Max: 100, deckEquipe: ["CA", "CB"], Etats_Alteres: [] });
    window.CACHE_COMPETENCES_GLOBAL = { ...(window.CACHE_COMPETENCES_GLOBAL || {}), B1: deck };
    const premiere = { id: "CA", data: deck.CA };
    const s = window.secondeCarteBoss(m("Boss", 100), premiere);
    const pauvre = window.secondeCarteBoss(m("Boss", 12), premiere);
    const elite = window.secondeCarteBoss(m("Élite", 100), premiere);
    const repos = window.secondeCarteBoss(m("Boss", 100), { id: "REPOS_LONG", repos: true, data: { Fatigue: 0 } });
    return { s: s && s.id, pauvre: pauvre && pauvre.id, elite: elite && elite.id, repos: repos && repos.id,
             pas: ["Petit", "Normal", "Élite", "Boss"].map(x => window.pasMaxMonstre({ Palier: x })) };
  });
  verifier("un boss prend une SECONDE compétence, différente de la première", r.s === "CB", JSON.stringify(r));
  verifier("plus de quoi la payer après la première : une seule", r.pauvre === null, JSON.stringify(r));
  verifier("une élite : une seule", r.elite === null);
  verifier("une première carte qui est un repos : pas de seconde", r.repos === null);
  verifier("l'IA de préparation juge la portée avec 6 / 5 / 4 / 4 cases", JSON.stringify(r.pas) === "[6,5,4,4]", JSON.stringify(r.pas));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
