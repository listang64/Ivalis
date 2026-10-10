// LA DEUXIÈME LISTE DU STUDIO, IMPLANTÉE EN JEU
//
// Nico : « attaque magique : garde juste le son de l'électricité, pas de son
// quand la cible reçoit les dégâts, et ensuite intègre-la ; attaque magique de
// glace, multi-élémentaire, mots de pouvoir, lumière : tu peux intégrer ; coup
// critique : mets un son plus sourd et épique et tu peux intégrer ; attaque
// d'opportunité ; créature qui frappe un mur de pierre : enlève juste
// l'émoticône pioche ; coup reçu physique / magique / brut ; esquive ; parade ;
// contre ; absorption ; le bouclier magique encaisse le coup ; le bouclier
// magique se brise ; mise à terre / KO ; illusion brisée ; soin ; soin de
// zone ; soin étalé ; bouclier magique création ; purification ; bénédictions
// magique, physique, offensive ; repos long ; régénération de fin de manche ;
// dépense d'énergie d'une compétence : tu peux intégrer. »
//
//   1. LE NOYAU dit ce que l'écran doit savoir : le sort (Mots de pouvoir,
//      plusieurs éléments, Lumière), le soin de zone ou étalé, la nature du
//      coup, l'Absorption, la dépense d'énergie, la bénédiction, le mur frappé ;
//   2. LE PONT en tire la réaction ; elle remplace le geste d'avant (esquive,
//      chute, opportunité) ou l'accompagne (le coup reçu sous le chiffre) ;
//   3. LE VRAI PLATEAU : chaque geste se joue, avec ses sons, sans chiffre de
//      trop ; le pion mis à terre ne se relève pas ;
//   4. LE STUDIO : la foudre sans son à la réception, le critique sourd et
//      épique, le mur frappé sans pioche.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { resoudreCarte } from '../moteur_pur.js';
import { construireEtatCombat } from '../combat_etat.js';
import { misEnScene, creerPont } from '../pont_combat.js';
import { jouerCreature } from '../cerveau_combat.js';
import { plateauDeCombat } from '../combat_etat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, extra = {}) => ({
  idPersonnage: id, PV_Max: 60, PV_Actuels: 40, Fatigue_Max: 100, Fatigue_Actuelle: 100,
  Esquive: 0, Parade: 0, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const monde = () => construireEtatCombat({
  idPartie: "G", cerveau: "P_01", graine: 7,
  combattants: [fiche("H1", { idJoueur: "P_01", camp: "Allié", prenom: "Naomi" }), fiche("H2", { camp: "Allié", prenom: "Ben" }),
                fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Goule" }),
                fiche("M2", { estMonstre: true, camp: "Ennemi", nom: "Spectre" })],
  positions: { H1: { q: 0, r: 0 }, H2: { q: 0, r: 1 }, M1: { q: 1, r: 0 }, M2: { q: 1, r: -1 } },
  partie: { Phase_Combat: "Resolution", Tour_Combat: 2, Ordre_Initiative: ["H1", "M1", "M2", "H2"],
            File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C" }] }
});
const coup = (nom, typeRes = "Physique", extra = {}) => ({ nom, typeRes, valeurBrute: 10, isHeal: false, isShield: false, rangeMax: 1, cibles: ["M1"], ...extra });
const soin = (extra = {}) => ({ nom: "Soin", typeRes: "Magique", valeurBrute: 8, isHeal: true, isShield: false, rangeMax: 1, cibles: ["H2"], ...extra });
const resoudre = (action, etat = monde()) => resoudreCarte(etat, { type: "carte", idLanceur: "H1", idCarte: "C", alterations: [], jets: { parCible: {} }, ...action }).etapes;
const carteDe = (action, etat) => resoudre(action, etat).find(e => e.type === "carte");

console.log("\n1. LE NOYAU : CE QUE L'ÉCRAN DOIT SAVOIR");
{
  verifier("les Mots de pouvoir : sort « mots »", carteDe({ attaques: [coup("Mots de pouvoirs", "Magique")] }).sort === "mots");
  const multi = carteDe({ attaques: [coup("Attaque Magique", "Magique", { element: "Feu", elements: ["Feu", "Glace", "Foudre"] })] });
  verifier("plusieurs éléments : sort « multi », pas d'élément seul", multi.sort === "multi" && !("element" in multi), JSON.stringify(multi));
  const lum = carteDe({ attaques: [coup("Attaque Magique", "Magique", { chanceLumiere: 15 })] });
  verifier("un sort de Lumière sans élément : sort « lumiere »", lum.sort === "lumiere", JSON.stringify(lum));
  const glace = carteDe({ attaques: [coup("Attaque Magique", "Magique", { element: "Glace", elements: ["Glace"] })] });
  verifier("un sort de Glace dit son élément, sans autre sort", glace.element === "Glace" && !("sort" in glace));
  verifier("une attaque physique ne dit pas de sort", !("sort" in carteDe({ attaques: [coup("Attaque lourde")] })));
  const zone = carteDe({ attaques: [soin({ cibles: ["H1", "H2"] })], zoneVisee: [{ q: 0, r: 0 }, { q: 0, r: 1 }] });
  verifier("un soin de zone dit ses cases", JSON.stringify(zone.soinZone) === '[{"q":0,"r":0},{"q":0,"r":1}]', JSON.stringify(zone));
  verifier("un soin étalé le dit", carteDe({ attaques: [soin({ estEtalement: true, toursEtalement: 3 })] }).soinEtale === true);
  verifier("une attaque de zone ne passe pas pour un soin de zone",
           !("soinZone" in carteDe({ attaques: [coup("Attaque lourde")], zoneVisee: [{ q: 1, r: 0 }] })));
  const nature = (a) => (resoudre({ attaques: [a] }).find(e => e.type === "degats") || {}).nature;
  verifier("la nature du coup : physique, magique, brut",
           nature(coup("Attaque lourde")) === "physique" && nature(coup("Attaque Magique", "Magique")) === "magique"
           && nature(coup("Poison", "Physique", { brut: true })) === "brut",
           [nature(coup("Attaque lourde")), nature(coup("Attaque Magique", "Magique")), nature(coup("Poison", "Physique", { brut: true }))].join(","));
  const avecAbs = monde(); avecAbs.combattants.M1.etats = [{ nom: "Absorption", valeurAbs: 40, duree: 2 }];
  const drain = resoudre({ attaques: [coup("Attaque Magique", "Magique")] }, avecAbs).find(e => e.type === "soin");
  verifier("l'Absorption : son soin le dit", drain && drain.absorption === true && drain.drain === true, JSON.stringify(drain));
  const cout = resoudre({ attaques: [coup("Attaque lourde")], coutFatigue: 12 }).find(e => e.type === "fatigue");
  verifier("la dépense d'énergie de la carte : 12", cout && cout.depense === 12, JSON.stringify(cout));
  const beni = resoudre({ attaques: [soin()], jets: { parCible: {}, equipBenedictions: [{ resMag: 10, tours: 1 }, { degatsPct: 5, tours: 1 }] } })
    .filter(e => e.type === "etats" && e.pose === "Béni").map(e => e.benediction);
  verifier("la bénédiction dit laquelle : magique, offensive", JSON.stringify(beni) === '["magique","offensive"]', JSON.stringify(beni));
  // Une créature enfermée frappe le mur : le journal dit sa case, sans pioche.
  const prison = construireEtatCombat({ idPartie: "G", cerveau: "P_01", graine: 7,
    combattants: [fiche("H1", { camp: "Allié" }), fiche("M1", { estMonstre: true, camp: "Ennemi" })],
    positions: { H1: { q: -5, r: 0 }, M1: { q: 0, r: 0 } }, partie: { Phase_Combat: "Resolution", Tour_Combat: 1 } });
  prison.ordre = ["M1", "H1"]; prison.phase = "Resolution";
  prison.file = [{ id: "M1", carte: "GRIFFE", initiative: 10, pas: 0 }];
  prison.murs = {};
  [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].forEach(([q, r]) => { prison.murs[`MUR_T_${q}_${r}`] = { id: `MUR_T_${q}_${r}`, q, r, pv: 10, pvMax: 10, idLanceur: "G" }; });
  const griffe = { idCarte: "GRIFFE", infos: { portee: 1, fatigue: 0 }, attaques: [{ nom: "Griffe", valeurBrute: 4, typeRes: "Physique", isRanged: false, rangeMax: 1 }], alterations: [] };
  const mot = jouerCreature(prison, "M1", griffe, plateauDeCombat(null, prison)).entree.etapes.find(e => e.frappeMur);
  verifier("la frappe d'un mur : le journal dit la case, et plus de pioche",
           !!mot && Number.isFinite(mot.frappeMur.q) && !/⛏/.test(mot.texte), JSON.stringify(mot));
}

console.log("\n2. LE PONT : LA RÉACTION, QUI REMPLACE OU ACCOMPAGNE");
{
  const etat = monde();
  etat.combattants.H2.bouclier = 6;
  const r = (e) => (misEnScene(e, etat).reaction || {}).sorte || null;
  verifier("coup reçu : physique, magique, brut",
           r({ type: "degats", cible: "M1", acteur: "H1", montant: 5, pvApres: 35, nature: "physique" }) === "coup-physique"
           && r({ type: "degats", cible: "M1", acteur: "H1", montant: 5, pvApres: 35, nature: "magique" }) === "coup-magique"
           && r({ type: "degats", cible: "M1", acteur: "H1", montant: 5, pvApres: 35, nature: "brut" }) === "coup-brut");
  verifier("le Contre rendu, le bouclier qui encaisse, qui se brise, qui se pose",
           r({ type: "degats", cible: "H1", acteur: "M1", montant: 2, pvApres: 38, renvoi: true }) === "contre"
           && r({ type: "degats", cible: "H2", acteur: "M1", montant: 4, surBouclier: 4, bouclierApres: 2, pvApres: 40, nature: "physique" }) === "bouclier-encaisse"
           && r({ type: "degats", cible: "H2", acteur: "M1", montant: 9, surBouclier: 6, bouclierApres: 0, pvApres: 37, bouclierBrise: true, nature: "physique" }) === "bouclier-brise"
           && r({ type: "degats", cible: "H2", acteur: "H1", bouclierApres: 12, gainBouclier: 6 }) === "bouclier-cree");
  verifier("un journal d'avant (sans nature) : pas de coup reçu inventé", r({ type: "degats", cible: "M1", acteur: "H1", montant: 5, pvApres: 35 }) === null);
  verifier("esquive, parade : elles remplacent le recul d'avant",
           r({ type: "esquive", cible: "M1", acteur: "H1" }) === "esquive" && r({ type: "esquive", cible: "M1", acteur: "H1", parade: true }) === "parade"
           && misEnScene({ type: "esquive", cible: "M1", acteur: "H1" }, etat).reaction.remplace === true);
  verifier("l'Absorption, une part de soin étalé, un soin ; le drain du vampire seul",
           r({ type: "soin", cible: "M1", montant: 3, pvApres: 43, drain: true, absorption: true }) === "absorption"
           && r({ type: "soin", cible: "H2", montant: 3, pvApres: 43, tic: "Soin étalé" }) === "soin-tic"
           && r({ type: "soin", cible: "H2", acteur: "H1", montant: 8, pvApres: 48 }) === "soin"
           && r({ type: "soin", cible: "H1", montant: 4, pvApres: 44, drain: true, vampirisme: true }) === null);
  verifier("la purification, la bénédiction",
           r({ type: "etats", cible: "H2", purifie: true, retires: ["Brûlé"], liste: [] }) === "purification"
           && r({ type: "etats", cible: "H2", pose: "Béni", benediction: "physique", liste: [] }) === "benediction-physique");
  const en = misEnScene({ type: "fatigue", cible: "H1", fatigueApres: 88, depense: 12 }, etat);
  verifier("la dépense d'énergie : de 100 à 88, « -12 ⚡ »", en.reaction.sorte === "depense" && en.reaction.de === 100 && en.reaction.vers === 88 && en.reaction.texte === "-12 ⚡",
           JSON.stringify(en.reaction));
  verifier("le repos long, la régénération",
           r({ type: "fatigue", cible: "H1", fatigueApres: 100, repos: true }) === "repos"
           && r({ type: "fatigue", cible: "H1", fatigueApres: 100, regeneration: 5 }) === "regen");
  verifier("une énergie qui bouge sans raison connue : rien, comme avant", misEnScene({ type: "fatigue", cible: "H1", fatigueApres: 90 }, etat).geste === "rien");
  etat.combattants.M2.estIllusion = true;
  verifier("la chute : mise à terre, ou l'illusion brisée",
           r({ type: "chute", cible: "M1", acteur: "H1" }) === "ko" && r({ type: "chute", cible: "M2", acteur: "H1" }) === "illusion-brisee");
  verifier("l'opportunité, la frappe d'un mur",
           r({ type: "opportunite", attaquant: "M1", cible: "H1" }) === "opportunite"
           && r({ type: "message", cible: "M1", acteur: "M1", texte: "Frappe le mur", frappeMur: { q: 2, r: 0 } }) === "frappe-mur");

  // Le pont joue : la réaction remplace (esquive, chute) ou accompagne (jauge).
  const vus = [];
  let reponse = true;
  const pont = creerPont({
    jauge: () => vus.push("jauge"), message: (p, t) => vus.push("message:" + t), esquive: () => vus.push("esquive-d-avant"),
    opportunite: async () => vus.push("opportunite-d-avant"), ruee: async () => vus.push("ruee"),
    attaque: async () => false,
    reaction: async (d) => { vus.push("reaction:" + d.sorte); return reponse; }, pause: async () => {}
  });
  const jouer = async (e) => { vus.length = 0; await pont.animer(e, etat); return vus.join(" "); };
  verifier("l'esquive du Studio remplace l'esquive d'avant", await jouer({ type: "esquive", cible: "M1", acteur: "H1" }) === "reaction:esquive");
  verifier("la mise à terre du Studio remplace « À terre ! »", await jouer({ type: "chute", cible: "M1", acteur: "H1" }) === "reaction:ko");
  const ensemble = await jouer({ type: "degats", cible: "M1", acteur: "H1", montant: 5, pvApres: 35, nature: "magique" });
  verifier("le coup reçu accompagne le chiffre (les deux, ensemble)", ensemble.split(" ").sort().join(" ") === "jauge reaction:coup-magique", ensemble);
  verifier("le critique s'annonce par le Studio (plus de « Critique ! » d'avant)",
           (await jouer({ type: "carte", acteur: "H1", carte: "C", cibles: ["M1"], critique: true })).startsWith("reaction:critique ruee"));
  verifier("le soin de zone fleurit après la carte", (await jouer({ type: "carte", acteur: "H1", carte: "C", cibles: ["H2"], soinZone: [{ q: 0, r: 1 }] })) === "ruee reaction:soin-zone");
  reponse = false;
  verifier("une réaction qui ne sait pas se jouer : le geste d'avant", await jouer({ type: "esquive", cible: "M1", acteur: "H1" }) === "reaction:esquive esquive-d-avant");
  verifier("…le critique d'avant", (await jouer({ type: "carte", acteur: "H1", carte: "C", cibles: ["M1"], critique: true })).startsWith("reaction:critique message:Critique !"));
  const pontNu = creerPont({ jauge: () => vus.push("jauge"), esquive: () => vus.push("esquive-d-avant"), pause: async () => {} });
  vus.length = 0; await pontNu.animer({ type: "esquive", cible: "M1", acteur: "H1" }, etat);
  verifier("sans geste du Studio (un banc, un poste sans catalogue) : rien ne change", vus.join(" ") === "esquive-d-avant");
  const regime = fs.readFileSync('/home/user/Ivalis/regime_cerveau.js', 'utf-8');
  verifier("le jeu le branche (regime_cerveau.js → animations_jeu.js)", regime.includes("reaction: (d) => window.animerReactionCombat ? window.animerReactionCombat(d) : false"));
}

// =========================================================================
//  3. LE VRAI PLATEAU
// =========================================================================
const RACINE = '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
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
  window.estCombattantMort = () => false;
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
  window.PERSOS_PARTIE = [f("H1", { prenom: "Naomi", race: "Humain" }), f("H2", { prenom: "Ben", race: "Humain" }),
                          f("M1", { camp: "Ennemi", estMonstre: true, prenom: "Goule" }), f("M2", { camp: "Ennemi", estMonstre: true, prenom: "Spectre" }),
                          f("M3", { camp: "Ennemi", estMonstre: true, prenom: "Leurre" })];
  const url = "https://res.cloudinary.com/x/image/upload/portrait.png";
  window.TOKENS_VTT_DATA = { H1: { q: 2, r: 0, url, taille: 55 }, H2: { q: 2, r: 1, url, taille: 55 },
                             M1: { q: 4, r: 0, taille: 55 }, M2: { q: 4, r: -1, taille: 55 }, M3: { q: 6, r: 0, taille: 55 } };
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
  window.__sonder = (selecteur) => {
    let max = 0; let fini = false;
    const tour = () => { max = Math.max(max, document.querySelectorAll(selecteur).length); if (!fini) requestAnimationFrame(tour); };
    requestAnimationFrame(tour);
    return () => { fini = true; return max; };
  };
  window.__attendre = (ms) => new Promise(r => setTimeout(r, ms));
  window.__secoue = (id) => { const el = document.getElementById("token-" + id); let vu = false, fini = false;
    const tour = () => { if (el.getAnimations().length) vu = true; if (!fini) requestAnimationFrame(tour); }; requestAnimationFrame(tour);
    return () => { fini = true; return vu; }; };
});

console.log("\n3. LES SORTS ET LES ATTAQUES SUR LE VRAI PLATEAU");
{
  const r = await p.evaluate(async () => {
    const jouer = async (d, sondes = {}) => {
      await window.__attendre(1500);
      window.__noter();
      const s = Object.fromEntries(Object.entries(sondes).map(([k, sel]) => [k, window.__sonder(sel)]));
      const secoueM1 = window.__secoue("M1");
      const fait = await window.animerAttaqueCombat({ pion: "H1", cibles: ["M1"], ...d });
      await window.__attendre(80);
      return { fait, sons: window.__sons, textes: window.__textes, secoueM1: secoueM1(),
               ...Object.fromEntries(Object.entries(s).map(([k, f]) => [k, f()])) };
    };
    return {
      foudre: await jouer({ projectile: "magie", element: "Foudre", touches: ["M1"] }),
      foudreRatee: await jouer({ projectile: "magie", element: "Foudre", touches: [] }),
      glace: await jouer({ projectile: "magie", element: "Glace", touches: ["M1"] }, { pics: "#conteneur-tokens-vtt .anim-pic-glace" }),
      glaceContact: await jouer({ element: "Glace", touches: ["M1"] }, { pics: "#conteneur-tokens-vtt .anim-pic-glace" }),
      multi: await jouer({ projectile: "magie", sort: "multi", touches: ["M1"] }),
      mots: await jouer({ projectile: "magie", sort: "mots", touches: ["M1"] }, { arcs: "#conteneur-tokens-vtt .anim-arc-mots" }),
      lumiere: await jouer({ projectile: "magie", sort: "lumiere", touches: ["M1"] }, { rayon: "#conteneur-tokens-vtt .anim-rayon-lumiere" }),
      deux: await jouer({ projectile: "magie", element: "Glace", cibles: ["M1", "M2"], touches: ["M1"] }, { pics: "#conteneur-tokens-vtt .anim-pic-glace" })
    };
  });
  const chiffre = (x) => x.textes.some(t => /^[-+]\d/.test(t));
  verifier("la foudre : le seul son de l'électricité, la cible secouée", r.foudre.fait && JSON.stringify(r.foudre.sons) === '["foudre"]' && r.foudre.secoueM1, JSON.stringify(r.foudre));
  verifier("…manquée : l'éclair claque à côté, la cible ne bouge pas", r.foudreRatee.fait && !r.foudreRatee.secoueM1);
  verifier("la glace : cinq pics se forment, filent et se plantent", r.glace.fait && r.glace.pics === 5 && r.glace.sons.includes("glace-formation")
           && r.glace.sons.filter(s => s === "glace-plante").length === 5, JSON.stringify(r.glace));
  verifier("…au contact aussi (un sort sans projectile garde son élément)", r.glaceContact.fait && r.glaceContact.pics === 5);
  verifier("…deux cibles : trois pics chacune, ne se plantent que dans la touchée", r.deux.pics === 6 && r.deux.sons.filter(s => s === "glace-plante").length === 3,
           JSON.stringify(r.deux));
  verifier("le sort multi-élémentaire : trois orbes, l'explosion", r.multi.fait && r.multi.sons.includes("feu-explosion") && r.multi.secoueM1, JSON.stringify(r.multi.sons));
  verifier("les Mots de pouvoir : trois ondes de voix", r.mots.fait && r.mots.arcs === 3 && r.mots.sons.includes("mots"), JSON.stringify(r.mots));
  verifier("la Lumière : l'arc, le rayon", r.lumiere.fait && r.lumiere.rayon === 1 && r.lumiere.sons.includes("lumiere"), JSON.stringify(r.lumiere));
  verifier("aucun chiffre dans ces gestes (l'étape des dégâts le dira)", !Object.values(r).some(chiffre), JSON.stringify(Object.values(r).map(x => x.textes)));
}

console.log("\n4. LES RÉACTIONS SUR LE VRAI PLATEAU");
{
  const r = await p.evaluate(async () => {
    const reagir = async (d, sondes = {}) => {
      await window.__attendre(1300);
      window.__noter();
      const s = Object.fromEntries(Object.entries(sondes).map(([k, sel]) => [k, window.__sonder(sel)]));
      const fait = await window.animerReactionCombat(d);
      await window.__attendre(80);
      return { fait, sons: window.__sons, textes: window.__textes, ...Object.fromEntries(Object.entries(s).map(([k, f]) => [k, f()])) };
    };
    const sang = '#conteneur-tokens-vtt .anim-effet[style*="rgb(196, 20, 28)"]';
    const out = {
      physique: await reagir({ sorte: "coup-physique", pion: "M1", depuis: "H1" }, { sang }),
      magique: await reagir({ sorte: "coup-magique", pion: "M1", depuis: "H1" }),
      brut: await reagir({ sorte: "coup-brut", pion: "M1", depuis: "H1" }),
      esquive: await reagir({ sorte: "esquive", pion: "M1", depuis: "H1", texte: "Esquivé 💨" }),
      parade: await reagir({ sorte: "parade", pion: "M1", depuis: "H1", texte: "Paré 🛡️" }, { arc: "#conteneur-tokens-vtt .anim-parade" }),
      contre: await reagir({ sorte: "contre", pion: "H1", depuis: "M1" }, { sang }),
      absorption: await reagir({ sorte: "absorption", pion: "M1", depuis: "H1" }),
      encaisse: await reagir({ sorte: "bouclier-encaisse", pion: "H2", depuis: "M1" }, { dome: "#conteneur-tokens-vtt .anim-dome" }),
      brise: await reagir({ sorte: "bouclier-brise", pion: "H2", depuis: "M1" }, { dome: "#conteneur-tokens-vtt .anim-dome" }),
      cree: await reagir({ sorte: "bouclier-cree", pion: "H2" }, { dome: "#conteneur-tokens-vtt .anim-dome" }),
      soin: await reagir({ sorte: "soin", pion: "H2", depuis: "H1" }),
      tic: await reagir({ sorte: "soin-tic", pion: "H2" }, { sceau: "#conteneur-tokens-vtt .anim-sceau-soin" }),
      zone: await reagir({ sorte: "soin-zone", pion: "H1", cases: [{ q: 2, r: 0 }, { q: 2, r: 1 }, { q: 3, r: 0 }] }, { cases: "#conteneur-tokens-vtt .anim-case-soin" }),
      etale: await reagir({ sorte: "soin-etale", pion: "H1", cibles: ["H1", "H2"] }, { sceau: "#conteneur-tokens-vtt .anim-sceau-soin" }),
      purification: await reagir({ sorte: "purification", pion: "H2" }, { tache: "#conteneur-tokens-vtt .anim-tache-purifiee" }),
      benMag: await reagir({ sorte: "benediction-magique", pion: "H2" }),
      benPhys: await reagir({ sorte: "benediction-physique", pion: "H2" }),
      benOff: await reagir({ sorte: "benediction-offensive", pion: "H2" }),
      repos: await reagir({ sorte: "repos", pion: "H1", de: 40, vers: 75, max: 100, texte: "+35 ⚡" }),
      regen: await reagir({ sorte: "regen", pion: "H1", de: 75, vers: 80, max: 100, texte: "+5 ⚡" }),
      depense: await reagir({ sorte: "depense", pion: "H1", de: 80, vers: 68, max: 100, texte: "-12 ⚡" }),
      opportunite: await reagir({ sorte: "opportunite", pion: "M1", depuis: "H1" }, { sang }),
      mur: await reagir({ sorte: "frappe-mur", pion: "M1", mur: { q: 5, r: 0 } }),
      critique: await reagir({ sorte: "critique", pion: "H1" }, { message: "#conteneur-tokens-vtt .anim-message-critique" }),
      inconnue: await reagir({ sorte: "danse", pion: "H1" }),
      sansPion: await reagir({ sorte: "soin", pion: "INCONNU" })
    };
    // Le coup reçu d'un geste d'attaque du Studio n'est pas rejoué à l'étape des dégâts.
    await window.__attendre(1300);
    await window.animerAttaqueCombat({ pion: "H1", cibles: ["M1"], frappe: "epee", touches: ["M1"] });
    out.apresAttaque = await reagir({ sorte: "coup-physique", pion: "M1", depuis: "H1" }, { sang });
    // LA MISE À TERRE : il s'effondre et ne se relève pas.
    out.ko = await reagir({ sorte: "ko", pion: "M2", depuis: "H1" });
    out.ko.cache = getComputedStyle(document.getElementById("token-M2")).opacity === "0";
    out.illusion = await reagir({ sorte: "illusion-brisee", pion: "M3", depuis: "H1" });
    out.illusion.cache = getComputedStyle(document.getElementById("token-M3")).opacity === "0";
    return out;
  });
  const chiffres = (x) => x.textes.filter(t => /^-\d/.test(t) && !/⚡/.test(t));
  verifier("coup reçu physique : la lame, la chair, le sang", r.physique.fait && r.physique.sons.includes("entaille-chair") && r.physique.sang >= 1, JSON.stringify(r.physique));
  verifier("coup reçu magique, brut : leurs sons", r.magique.sons.includes("impact-magique") && r.brut.sons.includes("impact-brut"));
  verifier("l'esquive : le pas de côté, son mot", r.esquive.fait && r.esquive.sons.includes("esquive") && r.esquive.textes.includes("Esquivé 💨"), JSON.stringify(r.esquive));
  verifier("la parade : l'arc d'acier, « Paré 🛡️ »", r.parade.arc === 1 && r.parade.sons.includes("parade") && r.parade.textes.includes("Paré 🛡️"), JSON.stringify(r.parade));
  verifier("le Contre : le revers doré, l'attaquant saigne", r.contre.textes.includes("Contre !") && r.contre.sang >= 1, JSON.stringify(r.contre));
  verifier("l'Absorption : l'aura qui avale", r.absorption.sons.includes("absorption") && r.absorption.textes.includes("Absorbé"));
  verifier("le bouclier encaisse, se brise, se pose : le dôme", r.encaisse.dome === 1 && r.brise.dome === 1 && r.cree.dome === 1
           && r.encaisse.sons.includes("bouclier-impact") && r.brise.sons.includes("bris-verre") && r.cree.sons.includes("bouclier"),
           JSON.stringify([r.encaisse, r.brise, r.cree].map(x => x.sons)));
  verifier("le soin, sa part étalée (le sceau), la zone qui fleurit (trois cases), le soin étalé posé (deux sceaux)",
           r.soin.sons.includes("soin") && r.tic.sceau === 1 && r.zone.cases === 3 && r.etale.sceau === 2,
           JSON.stringify({ tic: r.tic.sceau, zone: r.zone.cases, etale: r.etale.sceau }));
  verifier("la purification : la tache arrachée", r.purification.tache === 1 && r.purification.sons.includes("purification"));
  verifier("les trois bénédictions : leurs mots", r.benMag.textes.includes("+ Résistance magique") && r.benPhys.textes.includes("+ Résistance physique")
           && r.benOff.textes.includes("+ Dégâts"));
  verifier("repos long, régénération, dépense : l'énergie se voit (« +35 ⚡ », « +5 ⚡ », « -12 ⚡ »)",
           r.repos.textes.includes("+35 ⚡") && r.repos.sons.includes("repos") && r.regen.textes.includes("+5 ⚡") && r.depense.textes.includes("-12 ⚡")
           && r.depense.sons.includes("depense"), JSON.stringify([r.repos.textes, r.regen.textes, r.depense.textes]));
  verifier("l'opportunité : « Opportunité ! », le coup au passage", r.opportunite.textes.includes("Opportunité !") && r.opportunite.sang >= 1, JSON.stringify(r.opportunite));
  verifier("la frappe d'un mur : les coups, sans pioche", r.mur.fait && r.mur.sons.filter(s => s === "pioche").length === 2 && !r.mur.textes.some(t => /⛏/.test(t)),
           JSON.stringify(r.mur));
  verifier("le critique : « COUP CRITIQUE ! » et le son sourd et épique", r.critique.message === 1 && JSON.stringify(r.critique.sons) === '["critique-epique"]',
           JSON.stringify(r.critique));
  verifier("une réaction inconnue, un pion absent : le geste d'avant garde la main", r.inconnue.fait === false && r.sansPion.fait === false);
  verifier("après un coup d'épée du Studio, l'étape des dégâts ne rejoue pas le coup reçu", r.apresAttaque.fait && r.apresAttaque.sons.length === 0 && r.apresAttaque.sang === 0,
           JSON.stringify(r.apresAttaque));
  verifier("la mise à terre : « À terre ! », et il ne se relève pas", r.ko.textes.includes("À terre !") && r.ko.sons.includes("chute") && r.ko.cache, JSON.stringify(r.ko));
  verifier("l'illusion brisée : les éclats, le leurre disparaît", r.illusion.textes.includes("Illusion brisée") && r.illusion.sons.includes("bris-verre") && r.illusion.cache);
  verifier("aucune réaction n'écrit de chiffre de dégâts (l'étape le dit)", !Object.values(r).some(x => chiffres(x).length),
           JSON.stringify(Object.values(r).map(chiffres)));
}

console.log("\n5. LE STUDIO : FOUDRE, CRITIQUE, MUR");
{
  const cat = fs.readFileSync(`${RACINE}/animations_catalogue.js`, 'utf-8');
  const bloc = (id) => { const i = cat.indexOf(`id: "${id}"`); return cat.slice(i, cat.indexOf("\n        }", i)); };
  verifier("la foudre du Studio : plus de son de décharge à la réception", !/decharge/.test(bloc("attaque-foudre")) && /o\.son\("foudre"\)/.test(bloc("attaque-foudre")));
  verifier("le coup critique du Studio : le son sourd et épique", /critique-epique/.test(bloc("coup-critique")) && !/critique-charge/.test(bloc("coup-critique")));
  verifier("le mur frappé du Studio : plus d'émoticône pioche", !/⛏/.test(bloc("frappe-mur")));
  const son = await p.evaluate(async () => {
    const f = window.SONS_COMBAT && window.SONS_COMBAT["critique-epique"];
    if (!f) return null;
    const ctx = new OfflineAudioContext(1, 44100 * 2, 44100);
    f(ctx, ctx.destination);
    const rendu = await ctx.startRendering();
    const d = rendu.getChannelData(0);
    let max = 0; for (let i = 0; i < d.length; i++) max = Math.max(max, Math.abs(d[i]));
    // Sourd : l'énergie des 300 premières ms est surtout grave (peu de passages par zéro).
    let zeros = 0; for (let i = 1; i < 13230; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) zeros++;
    let tard = 0; for (let i = 44100; i < 44100 + 4410; i++) tard = Math.max(tard, Math.abs(d[i]));
    return { max, zeros, tard };
  });
  verifier("le son du critique sonne, grave, et tient au-delà d'une seconde",
           son && son.max > 0.1 && son.zeros < 900 && son.tard > 0.005, JSON.stringify(son));
}

// Pour les yeux.
if (process.env.CAPTURE_DIR) {
  const capt = async (nom, fn, attente, clip) => {
    await p.evaluate(() => new Promise(r => setTimeout(r, 1500)));
    await p.evaluate(fn);
    await p.waitForTimeout(attente);
    await p.screenshot({ path: `${process.env.CAPTURE_DIR}/${nom}.png`, clip });
  };
  const zone = { x: 450, y: 320, width: 320, height: 210 };
  await p.evaluate(() => { window.PERSOS_PARTIE.forEach(x => { x.PV_Actuels = 60; }); ["M2", "M3"].forEach(id => { const el = document.getElementById("token-" + id); if (el) el.style.opacity = ""; }); });
  await capt("jeu_foudre", () => { window.animerAttaqueCombat({ pion: "H1", cibles: ["M1"], projectile: "magie", element: "Foudre", touches: ["M1"] }); }, 520, zone);
  await capt("jeu_glace", () => { window.animerAttaqueCombat({ pion: "H1", cibles: ["M1"], projectile: "magie", element: "Glace", touches: ["M1"] }); }, 1350, zone);
  await capt("jeu_multi", () => { window.animerAttaqueCombat({ pion: "H1", cibles: ["M1"], projectile: "magie", sort: "multi", touches: ["M1"] }); }, 1050, zone);
  await capt("jeu_lumiere", () => { window.animerAttaqueCombat({ pion: "H1", cibles: ["M1"], projectile: "magie", sort: "lumiere", touches: ["M1"] }); }, 560, zone);
  await capt("jeu_critique", () => { window.animerReactionCombat({ sorte: "critique", pion: "H1" }); }, 500, zone);
  await capt("jeu_parade", () => { window.animerReactionCombat({ sorte: "parade", pion: "M1", depuis: "H1", texte: "Paré 🛡️" }); }, 200, zone);
  await capt("jeu_bouclier_brise", () => { window.animerReactionCombat({ sorte: "bouclier-brise", pion: "H2", depuis: "M1" }); }, 560, zone);
  await capt("jeu_soin_zone", () => { window.animerReactionCombat({ sorte: "soin-zone", pion: "H1", cases: [{ q: 2, r: 0 }, { q: 2, r: 1 }, { q: 3, r: 0 }, { q: 1, r: 1 }] }); }, 650, zone);
  await capt("jeu_benediction", () => { window.animerReactionCombat({ sorte: "benediction-offensive", pion: "H2" }); }, 700, zone);
  await capt("jeu_repos", () => { window.animerReactionCombat({ sorte: "repos", pion: "H1", de: 40, vers: 75, max: 100, texte: "+35 ⚡" }); }, 1700, zone);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
