// v427 — LE PUGILISTE VARGEN FAIT SAIGNER SUR TOUS SES SORTS, SANS PLAFOND.
//
// Nico : « Wargen, talent pugilat > +15 % de saignement (pas max) sur tous
// les sorts, à la place d'empoisonnement. »
//
// Depuis la v416, le Pugiliste Vargen (sans arme, ou seulement des bagues)
// avait +15 % de faire saigner sur ses seuls coups PHYSIQUES, plafonnés à 100.
// Désormais : sur tous ses sorts, magiques compris, et sans plafond sur la
// chance de la carte (95 + 15 = 110). Le jet (chanceFaceA, moteur_pur.js), lui,
// ne tire jamais au-delà de 100 : 110 vaut 100, et 75 face à une résistance.
// La condition « sans arme » ne bouge pas.
//
// Sur la VRAIE page : le texte du talent, ce que la carte emporte. Puis dans
// Node : la chance au jet, et le Saignement d'un sort qui prend sur la cible.
// Lancer : node tests_monstres/corrections_v427_pugiliste.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const RACINE = process.env.IVALIS_RACINE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const titre = (t) => console.log("\n" + t);
const section = async (corps) => { try { await corps(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 160)); } };
const lire = (f) => { try { return fs.readFileSync(path.join(RACINE, f), 'utf-8'); } catch (e) { return ""; } };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' }); res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({}); export const getApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true, size: 0 });
  export const setDoc = async () => {}; export const updateDoc = async () => {}; export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a}); export const where = (...a) => ({a});
  export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
p.on('dialog', d => d.accept());
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' }));
await p.goto(base + '/index.html');
await p.waitForFunction(() => typeof window.appliquerEquipementALaCarte === "function" && typeof window.atoutRace === "function"
                              && typeof window.talentParId === "function", null, { timeout: 15000 });

await p.evaluate(() => {
  window.__heros = (extra) => ({ idPersonnage: "P1", prenom: "Grak", race: "Vargen", classe: "", xp: 6400, camp: "Allié", Etats_Alteres: [],
    caracs: { force: 14, dex: 14, con: 12, int: 10, sag: 10, cha: 10 }, talents: { TAL_PUGILISTE: 1 }, talentsChoix: {}, ...extra });
  window.__epee = { nom: "Épée", modele: "Épée", type: "Arme légère" };
  window.__baton = { nom: "Bâton", modele: "Bâton", type: "Arme magique" };
  window.__bague = { nom: "Bague", modele: "Bagues DPS", bague: true };
  window.__sort = () => [{ nom: "Boule de feu", typeRes: "Magique", valeurBrute: 10, isRanged: true, rangeMax: 5, cibles: ["M"] }];
  window.__carte = (lanceur, attaques, alterations, arme) => {
    const s = { attaques, alterations };
    window.appliquerEquipementALaCarte(s, lanceur, arme || "Magie");
    return s.alterations.map(a => ({ nom: a.nom, chance: a.chance, duree: a.duree, venuDuTalent: !!a.venuDuTalent, cibles: a.cibles }));
  };
});

let alterationSort = null;

titre("1. LE TEXTE DU TALENT");
await section(async () => {
  const r = await p.evaluate(() => ({
    texte: window.talentParId("TAL_PUGILISTE").texte,
    resume: window.resumeTalent(window.__heros({}), "TAL_PUGILISTE"),
    resumeHumain: window.resumeTalent(window.__heros({ race: "Humain" }), "TAL_PUGILISTE"),
    resumeArme: window.resumeTalent(window.__heros({ equipMainDroite: window.__epee }), "TAL_PUGILISTE")
  }));
  // (v431) Nico : « retire l'augmentation de 15 % de saignement et mets à la place une augmentation max de 10 % ».
  verifier("(v431) le texte : Vargen +10 % max de Saignement sur ses sorts qui font saigner, au-delà de la limite",
           /^Sans arme équipée/.test(r.texte) && /Vargen : en plus \+10 % max de Saignement sur ses sorts qui font saigner, au-delà de la limite \(à mains nues pour une attaque physique, même armé pour un sort magique\)/.test(r.texte)
           && !/empoison/i.test(r.texte), r.texte);
  verifier("(v431) le résumé d'un Vargen mains nues : « +10 % max de Saignement sur ses sorts qui font saigner »",
           /\+10 % max de Saignement sur ses sorts qui font saigner, \+6 % de critique/.test(r.resume) && !/empoison/i.test(r.resume), r.resume);
  verifier("le résumé d'un Humain n'en parle pas", !/saign|empoison/i.test(r.resumeHumain), r.resumeHumain);
  verifier("(v431) le résumé d'un Vargen armé : seulement sur ses sorts magiques", /seulement \+10 % max de Saignement sur ses sorts magiques/.test(r.resumeArme), r.resumeArme);
  const sources = ["talents.js", "moteur_effets.js", "app.js", "combat_etat.js", "moteur_pur.js", "cerveau_combat.js", "pont_combat.js"].map(lire).join("\n");
  verifier("aucune trace de chancePoisonPhysique dans le code du jeu", !/chancePoisonPhysique/.test(sources));
  const bloc = (lire("moteur_effets.js").match(/LE PUGILISTE VARGEN[\s\S]*?\n    \}\n/) || [""])[0];
  verifier("le bloc du talent (moteur_effets.js) : physique à mains nues, sort magique toujours, sans plafond",
           !!bloc && /chanceSaignementSort/.test(bloc) && /chanceSaignementPhysique/.test(bloc) && !/Math\.min\(100/.test(bloc) && !/Empoisonnement/.test(bloc));
});

titre("2. CE QUE LA CARTE EMPORTE (appliquerEquipementALaCarte)");
await section(async () => {
  const r = await p.evaluate(() => {
    const coup = () => [{ nom: "Coup de poing", typeRes: "Physique", valeurBrute: 10, cibles: ["M"] }];
    return {
      sort: window.__carte(window.__heros({}), window.__sort(), []),
      sortBague: window.__carte(window.__heros({ equipMainDroite: window.__bague }), window.__sort(), []),
      a95: window.__carte(window.__heros({}), window.__sort(), [{ nom: "Saignement", chance: 95, duree: 2, cibles: ["M"] }]),
      physique95: window.__carte(window.__heros({}), coup(), [{ nom: "Saignement", chance: 95, duree: 2, cibles: ["M"] }], "Sans arme / Arme rp"),
      coup: window.__carte(window.__heros({}), coup(), [], "Sans arme / Arme rp"),
      humain: window.__carte(window.__heros({ race: "Humain" }), window.__sort(), []),
      humain95: window.__carte(window.__heros({ race: "Humain" }), window.__sort(), [{ nom: "Saignement", chance: 95, duree: 2, cibles: ["M"] }]),
      armeEpee: window.__carte(window.__heros({ equipMainDroite: window.__epee }), window.__sort(), []),
      armeBaton: window.__carte(window.__heros({ equipMainDroite: window.__baton }), window.__sort(), []),
      armeCoup: window.__carte(window.__heros({ equipMainDroite: window.__epee }), coup(), [], "Arme légère"),
      armeSort95: window.__carte(window.__heros({ equipMainDroite: window.__epee }), window.__sort(), [{ nom: "Saignement", chance: 50, duree: 2, cibles: ["M"] }]),
      armeMixte: window.__carte(window.__heros({ equipMainDroite: window.__epee }), [...coup(), ...window.__sort()], [], "Arme légère"),
      soin: window.__carte(window.__heros({}), [{ nom: "Soin", isHeal: true, valeurBrute: 10, cibles: ["P1"] }], []),
      gabarit: window.GABARITS_ETATS_EQUIPEMENT["Saignement"]
    };
  });
  // (v431) « Les augmentations max ne s'appliquent que sur les effets du même nom associés à un sort » :
  // +10 par-dessus la limite d'un sort qui fait déjà saigner ; rien sur un sort qui n'en a pas.
  const s = r.a95.find(a => a.nom === "Saignement");
  alterationSort = s || null;
  verifier("(v431) Vargen Pugiliste, sort magique SANS Saignement : rien d'ajouté", r.sort.length === 0, JSON.stringify(r.sort));
  verifier("…et aucun Empoisonnement", !r.sort.some(a => a.nom === "Empoisonnement"), JSON.stringify(r.sort));
  verifier("(v431) Vargen avec une bague seulement, sort sans Saignement : rien non plus", r.sortBague.length === 0, JSON.stringify(r.sortBague));
  verifier("(v431) un sort qui fait déjà saigner à 95 % : 95 + 10 = 105, au-delà de la limite, un seul Saignement",
           r.a95.filter(a => a.nom === "Saignement").length === 1 && r.a95[0].chance === 105, JSON.stringify(r.a95));
  verifier("(v431) un coup physique à 95 % (mains nues) : 105 aussi", r.physique95.length === 1 && r.physique95[0].chance === 105, JSON.stringify(r.physique95));
  verifier("(v431) un coup physique sans Saignement : rien", r.coup.length === 0, JSON.stringify(r.coup));
  verifier("un Humain Pugiliste, sort magique : rien", r.humain.length === 0, JSON.stringify(r.humain));
  verifier("un Humain Pugiliste, sort à 95 % : reste à 95", r.humain95.length === 1 && r.humain95[0].chance === 95, JSON.stringify(r.humain95));
  verifier("(v431) un Vargen armé, sort magique sans Saignement : rien", r.armeEpee.length === 0 && r.armeBaton.length === 0, JSON.stringify([r.armeEpee, r.armeBaton]));
  verifier("(v429) un Vargen armé, coup physique : rien (mains nues exigées)", r.armeCoup.length === 0, JSON.stringify(r.armeCoup));
  verifier("(v429) un Vargen armé, carte qui frappe physiquement ET par la magie : rien (le physique demande les mains nues)", r.armeMixte.length === 0, JSON.stringify(r.armeMixte));
  verifier("(v431) un Vargen armé, sort magique qui fait saigner à 50 : 60 (même armé pour un sort magique)", r.armeSort95.length === 1 && r.armeSort95[0].chance === 60, JSON.stringify(r.armeSort95));
  verifier("un soin : rien", r.soin.length === 0, JSON.stringify(r.soin));
});

await b.close();
serveur.close();

titre("3. AU JET ET SUR LA CIBLE (moteur_pur.js, Node)");
await section(async () => {
  const importer = (f) => import(pathToFileURL(path.join(RACINE, f)).href);
  const { construireEtatCombat } = await importer('combat_etat.js');
  const { resoudreCarte, chanceEtatDe } = await importer('moteur_pur.js');
  const fiche = (id, camp, extra = {}) => ({ idPersonnage: id, prenom: id, race: "", classe: "", camp, estMonstre: camp === "Ennemi", joueur: "",
    xp: 0, PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Critique: 0,
    Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
  const e = construireEtatCombat({ idPartie: "P", cerveau: "P1", graine: 1,
    combattants: [fiche("P1", "Allié", { race: "Vargen" }), fiche("M", "Ennemi")],
    positions: { P1: { q: 0, r: 0 }, M: { q: 3, r: 0 } }, partie: { Tour_Combat: 1 } });
  e.ordre = ["P1", "M"]; e.phase = "Resolution";
  const M = e.combattants.M;
  const resistant = { ...M, atouts: { ...(M.atouts || {}), resistances: ["Saignement"] } };
  verifier("le jet d'un sort à 10 % se fait à 10", chanceEtatDe(e.combattants.P1, { nom: "Saignement", chance: 10 }, M, {}) === 10);
  verifier("110 % au jet : 100 (le dé ne tire jamais au-delà)", chanceEtatDe(e.combattants.P1, { nom: "Saignement", chance: 110 }, M, {}) === 100);
  verifier("110 % face à une cible qui résiste : 75, comme 100 % (l'excédent ne compte pas)",
           chanceEtatDe(e.combattants.P1, { nom: "Saignement", chance: 110 }, resistant, {}) === 75
           && chanceEtatDe(e.combattants.P1, { nom: "Saignement", chance: 100 }, resistant, {}) === 75);
  verifier("la carte du sort emporte bien un Saignement (section 2)", !!alterationSort);
  const alt = { nom: "Saignement", chance: alterationSort.chance, duree: alterationSort.duree, cibles: alterationSort.cibles };
  const r = resoudreCarte(e, { type: "carte", idLanceur: "P1", idCarte: "C", critique: false,
    attaques: [{ nom: "Boule de feu", typeRes: "Magique", valeurBrute: 10, isRanged: true, rangeMax: 5, cibles: ["M"] }], alterations: [alt],
    jets: { attaqueRatee: false, parCible: { M: { esquive: false, etats: { "Saignement": true } } } } });
  const etatM = r.etat.combattants.M.etats.find(x => x.nom === "Saignement");
  verifier("un sort à distance, jet réussi : la cible saigne, le Vargen en est l'auteur",
           !!etatM && etatM.duree === alt.duree && etatM.idSource === "P1", JSON.stringify(etatM));
  verifier("…et rien d'Empoisonné", !r.etat.combattants.M.etats.some(x => x.nom === "Empoisonnement"));
});

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
