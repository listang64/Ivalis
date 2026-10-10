// LES ATTAQUES DU STUDIO, IMPLANTÉES EN JEU
//
// Nico : « Coup d'épée au corps à corps, attaque légère, attaque lourde,
// attaque à distance, attaque magique feu : tu peux implanter. »
//
//   1. LE NOYAU : l'étape carte dit la manière de frapper d'une attaque
//      PHYSIQUE (légère, lourde, sinon le coup d'épée), l'élément d'un sort
//      (un seul), et qui est vraiment touché (`touches`) ;
//   2. LE PONT : il les transmet ; le geste du Studio remplace la ruée et le
//      projectile quand il convient, sinon la ruée d'avant reste ;
//   3. LE VRAI PLATEAU : chaque geste, ses sons ; le coup reçu (le sang, la
//      chair) seulement sur la cible touchée ; aucun chiffre dans le geste (il
//      vient, une fois, à l'étape des dégâts) ; les cas qui gardent la ruée.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { resoudreCarte } from '../moteur_pur.js';
import { construireEtatCombat } from '../combat_etat.js';
import { misEnScene, creerPont } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(76)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, extra = {}) => ({
  idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, Fatigue_Actuelle: 100,
  Esquive: 0, Parade: 0, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const monde = () => construireEtatCombat({
  idPartie: "G", cerveau: "P_01", graine: 7,
  combattants: [fiche("H1", { idJoueur: "P_01", camp: "Allié", prenom: "Naomi" }),
                fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Goule" }),
                fiche("M2", { estMonstre: true, camp: "Ennemi", nom: "Spectre" })],
  positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 1, r: -1 } },
  partie: { Phase_Combat: "Resolution", Tour_Combat: 2, Ordre_Initiative: ["H1", "M1", "M2"],
            File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C" }, { idPersonnage: "M1", idCarte: "C" }, { idPersonnage: "M2", idCarte: "C" }] }
});
const coup = (nom, typeRes = "Physique", extra = {}) => ({ nom, typeRes, valeurBrute: 10, isHeal: false, isShield: false, rangeMax: 1, cibles: ["M1"], ...extra });
const carteDe = (attaques, parCible = {}) => resoudreCarte(monde(), { type: "carte", idLanceur: "H1", idCarte: "C", attaques, alterations: [],
                                                                      jets: { parCible } }).etapes.find(e => e.type === "carte");

console.log("\n1. LE NOYAU : LA MANIÈRE DE FRAPPER, L'ÉLÉMENT, QUI EST TOUCHÉ");
{
  verifier("« Attaque légère » : frappe légère", carteDe([coup("Attaque légère")]).frappe === "legere");
  verifier("« Attaque lourde » : frappe lourde", carteDe([coup("Attaque lourde")]).frappe === "lourde");
  verifier("une autre attaque physique : le coup d'épée", carteDe([coup("Assaut")]).frappe === "epee");
  verifier("une attaque magique au contact ne frappe pas à l'épée", !("frappe" in carteDe([coup("Attaque magique", "Magique")])));
  const feu = carteDe([coup("Attaque magique", "Magique", { isRanged: true, rangeMax: 4, element: "Feu", elements: ["Feu"] })]);
  verifier("un sort de Feu le dit (et part en boule de magie)", feu.element === "Feu" && feu.projectile === "magie", JSON.stringify(feu));
  verifier("un sort à deux éléments ne dit pas d'élément", !("element" in carteDe([coup("Attaque magique", "Magique", { isRanged: true, element: "Feu", elements: ["Feu", "Glace"] })])));
  const tir = carteDe([coup("Attaque légère", "Physique", { isRanged: true, rangeMax: 4 })]);
  verifier("un tir physique : une flèche, et sa frappe", tir.projectile === "fleche" && tir.frappe === "legere");
  const deux = carteDe([coup("Attaque lourde", "Physique", { cibles: ["M1", "M2"] })], { M2: { esquive: true } });
  verifier("qui est vraiment touché : la goule oui, le spectre esquive", JSON.stringify(deux.touches) === '["M1"]', JSON.stringify(deux.touches));
  verifier("…tout esquivé : personne", JSON.stringify(carteDe([coup("Attaque lourde")], { M1: { esquive: true } }).touches) === "[]");
  const soin = carteDe([{ nom: "Soin", typeRes: "Magique", valeurBrute: 10, isHeal: true, isShield: false, cibles: ["H1"] }]);
  verifier("un soin ne dit rien de tout ça", !("touches" in soin) && !("frappe" in soin) && !("element" in soin), JSON.stringify(soin));
}

console.log("\n2. LE PONT : LE GESTE DU STUDIO, OU LA RUÉE D'AVANT");
{
  const etat = monde();
  const sc = misEnScene({ type: "carte", acteur: "H1", carte: "C", cibles: ["M1"], frappe: "lourde", element: "Feu", touches: ["M1"] }, etat);
  verifier("le pont transmet la frappe, l'élément, les touchés", sc.frappe === "lourde" && sc.element === "Feu" && JSON.stringify(sc.touches) === '["M1"]');
  const vus = [];
  let reponse = true;
  const pont = creerPont({
    ruee: async () => vus.push(["ruee"]), projectile: async () => vus.push(["projectile"]),
    attaque: async (d) => { vus.push(["attaque", d.frappe, d.element, (d.touches || []).join(","), d.projectile]); return reponse; },
    zoneCarte: async () => vus.push(["zone"]), pause: async () => {}
  });
  const jouer = async (e) => { vus.length = 0; await pont.animer(e, etat); return JSON.stringify(vus); };
  verifier("le geste du Studio joue, À LA PLACE de la ruée et du projectile",
           await jouer({ type: "carte", acteur: "H1", carte: "C", cibles: ["M1"], projectile: "fleche", frappe: "legere", touches: ["M1"] })
           === '[["attaque","legere",null,"M1","fleche"]]');
  verifier("…puis les cases d'une zone, s'il y en a",
           await jouer({ type: "carte", acteur: "H1", carte: "C", cibles: ["M1"], projectile: "magie", element: "Feu", touches: [], zone: [{ q: 1, r: 0 }] })
           === '[["attaque",null,"Feu","","magie"],["zone"]]');
  reponse = false;
  verifier("le geste ne convient pas : la ruée et le projectile d'avant",
           await jouer({ type: "carte", acteur: "H1", carte: "C", cibles: ["M1"], projectile: "magie", touches: ["M1"] })
           === '[["attaque",null,null,"M1","magie"],["ruee"],["projectile"]]');
  const regime = fs.readFileSync('/home/user/Ivalis/regime_cerveau.js', 'utf-8');
  verifier("le jeu le branche (regime_cerveau.js → animations_jeu.js)", regime.includes("attaque: (d) => window.animerAttaqueCombat ? window.animerAttaqueCombat(d) : false"));
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
                          f("Z1", { prenom: "Zombie", estMonstre: true, zombie: true }),
                          f("M1", { camp: "Ennemi", estMonstre: true, prenom: "Goule" }), f("M2", { camp: "Ennemi", estMonstre: true, prenom: "Spectre" })];
  const url = "https://res.cloudinary.com/x/image/upload/portrait.png";
  window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0, url, taille: 55 }, H2: { q: -3, r: 2, url, taille: 55 }, Z1: { q: 3, r: 1, taille: 55 },
                             M1: { q: 4, r: 0, taille: 55 }, M2: { q: 5, r: 0, taille: 55 } };
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
  // Les images clés jouées sur un pion (le petit saut, une secousse).
  window.__images = (id) => {
    const el = document.getElementById("token-" + id), vues = new Set(), images = []; let fini = false;
    const tour = () => { el.getAnimations().forEach(an => { if (!vues.has(an)) { vues.add(an); images.push(an.effect.getKeyframes().map(k => k.transform || "")); } });
                         if (!fini) requestAnimationFrame(tour); };
    requestAnimationFrame(tour);
    return () => { fini = true; return images; };
  };
  window.__surCase = (id, c) => {
    const el = document.getElementById("token-" + id);
    const px = window.PLATEAU_VTT.hexToPixel(c.q, c.r);
    return !!el && +el.dataset.q === c.q && +el.dataset.r === c.r
      && Math.abs(parseFloat(el.style.left) - px.x) < 1 && Math.abs(parseFloat(el.style.top) - px.y) < 1
      && el.getAnimations().length === 0;
  };
  window.__attendre = (ms) => new Promise(r => setTimeout(r, ms));
});

console.log("\n3. LE CHOIX DU GESTE");
{
  const r = await p.evaluate(() => {
    const g = (d) => window.gesteAttaqueCombat({ touches: [], ...d });
    return {
      epee: g({ frappe: "epee" }), legere: g({ frappe: "legere" }), lourde: g({ frappe: "lourde" }),
      tir: g({ projectile: "fleche", frappe: "legere" }), feu: g({ projectile: "magie", element: "Feu" }),
      foudre: g({ projectile: "magie", element: "Foudre" }), magieContact: g({}), soin: g({ projectile: "soin" }),
      technique: g({ frappe: "epee", carte: "CLASSE_ASSAUT_MORTEL" }), compagnon: g({ frappe: "epee", carte: "COMPAGNON_ATTAQUE" }),
      journalDAvant: window.gesteAttaqueCombat({ frappe: "epee" })
    };
  });
  verifier("coup d'épée, légère, lourde, tir, boule de feu : chacune son geste",
           r.epee === "jeu-coup-epee" && r.legere === "jeu-attaque-legere" && r.lourde === "jeu-attaque-lourde"
           && r.tir === "jeu-attaque-distance" && r.feu === "jeu-boule-de-feu", JSON.stringify(r));
  // v234 : la foudre a son geste (animations_en_jeu_4.mjs).
  verifier("…les autres gardent la ruée : un sort sans élément au contact, un soin, une technique, le compagnon, un journal d'avant",
           r.foudre === "jeu-attaque-foudre" && [r.magieContact, r.soin, r.technique, r.compagnon, r.journalDAvant].every(x => x === null), JSON.stringify(r));
}

console.log("\n4. LES ATTAQUES SUR LE VRAI PLATEAU");
{
  const r = await p.evaluate(async () => {
    window.TOKENS_VTT_DATA.H1 = { ...window.TOKENS_VTT_DATA.H1, q: 3, r: 0 };
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    const sang = () => window.__sonder('#conteneur-tokens-vtt .anim-effet[style*="rgb(196, 20, 28)"]');
    const jouer = async (d) => {
      await window.__attendre(1700);
      window.__noter();
      const s = sang(), lames = window.__sonder("#conteneur-tokens-vtt .entaille-lame"), plantees = window.__sonder("#conteneur-tokens-vtt .anim-fleche-plantee"),
            langues = window.__sonder("#conteneur-tokens-vtt .anim-langue-feu"), boules = window.__sonder("#conteneur-tokens-vtt .anim-boule-feu");
      const fait = await window.animerAttaqueCombat({ pion: "H1", cibles: ["M1"], ...d });
      await window.__attendre(100);
      return { fait, sons: window.__sons, textes: window.__textes, sang: s(), lames: lames(), plantees: plantees(), langues: langues(), boules: boules(),
               surCase: window.__surCase("H1", { q: 3, r: 0 }) };
    };
    return {
      epee: await jouer({ frappe: "epee", touches: ["M1"] }),
      epeeRatee: await jouer({ frappe: "epee", touches: [] }),
      legere: await jouer({ frappe: "legere", touches: ["M1"] }),
      lourde: await jouer({ frappe: "lourde", touches: ["M1"] }),
      tir: await jouer({ projectile: "fleche", frappe: "legere", touches: ["M1"] }),
      tirRate: await jouer({ projectile: "fleche", frappe: "legere", touches: [] }),
      feu: await jouer({ projectile: "magie", element: "Feu", touches: ["M1"] }),
      feuRate: await jouer({ projectile: "magie", element: "Feu", touches: [] }),
      foudre: await jouer({ projectile: "magie", element: "Foudre", touches: ["M1"] })
    };
  });
  const chiffre = (x) => x.textes.some(t => /^-\d/.test(t));
  verifier("le coup d'épée : la lame, l'entaille effilée, la chair et le sang sur la cible touchée",
           r.epee.fait && r.epee.sons.includes("lame-souffle") && r.epee.sons.includes("entaille-chair") && r.epee.lames >= 1 && r.epee.sang >= 1 && r.epee.surCase,
           JSON.stringify(r.epee));
  verifier("…esquivé : la lame passe, ni chair ni sang", r.epeeRatee.fait && r.epeeRatee.lames >= 1 && !r.epeeRatee.sons.includes("entaille-chair") && r.epeeRatee.sang === 0,
           JSON.stringify(r.epeeRatee));
  verifier("l'attaque légère : deux coups de dague, deux entailles l'une après l'autre",
           r.legere.sons.filter(s => s === "dague").length === 2 && r.legere.sons.filter(s => s === "entaille-chair").length === 2 && r.legere.lames >= 1 && r.legere.sang >= 1,
           JSON.stringify(r.legere.sons));
  verifier("l'attaque lourde : l'élan, le choc sourd, la chair", r.lourde.sons.includes("lourd-elan") && r.lourde.sons.includes("lourd-impact")
           && r.lourde.sons.includes("entaille-chair") && r.lourde.sang >= 1, JSON.stringify(r.lourde.sons));
  verifier("le tir : l'arc se tend, la flèche part, se plante dans la chair",
           JSON.stringify(r.tir.sons.filter(s => ["arc-tendu", "tir", "fleche-impact"].includes(s))) === '["arc-tendu","tir","fleche-impact"]' && r.tir.plantees === 1 && r.tir.sang >= 1,
           JSON.stringify(r.tir));
  verifier("…raté : la flèche file au-delà, ne se plante pas", r.tirRate.plantees === 0 && !r.tirRate.sons.includes("fleche-impact"), JSON.stringify(r.tirRate));
  verifier("la boule de feu : la flamme tout le chemin, l'explosion, la gerbe de feu",
           r.feu.sons.includes("feu-vol") && r.feu.sons.includes("feu-explosion") && r.feu.boules >= 1 && r.feu.langues >= 6, JSON.stringify(r.feu));
  verifier("…ratée : elle s'écrase sur la case, plus petite", r.feuRate.langues > 0 && r.feuRate.langues < 6, String(r.feuRate.langues));
  verifier("aucun chiffre dans le geste (l'étape des dégâts le dira, une fois)",
           ![r.epee, r.legere, r.lourde, r.tir, r.feu].some(chiffre), JSON.stringify([r.epee, r.legere, r.lourde, r.tir, r.feu].map(x => x.textes)));
  // v234 (Nico : « attaque magique : garde juste le son de l'électricité, pas
  // de son quand la cible reçoit les dégâts ») : la foudre a son geste.
  verifier("un sort de foudre joue son geste, avec le seul son de l'électricité",
           r.foudre.fait === true && JSON.stringify(r.foudre.sons) === '["foudre"]', JSON.stringify(r.foudre));
}

// Pour les yeux : la flèche plantée, la boule de feu, en jeu.
if (process.env.CAPTURE_DIR) {
  // Au ralenti, pour la voir voler puis éclater.
  await p.evaluate(() => { window.VITESSE_ANIMATIONS = 0.3; window.TOKENS_VTT_DATA.H1 = { ...window.TOKENS_VTT_DATA.H1, q: 1, r: 0 };
                           window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
                           window.animerAttaqueCombat({ pion: "H1", cibles: ["M1"], projectile: "magie", element: "Feu", touches: ["M1"] }); });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${process.env.CAPTURE_DIR}/jeu_boule_de_feu_vol.png`, clip: { x: 440, y: 250, width: 360, height: 240 } });
  await p.waitForTimeout(1300);
  await p.screenshot({ path: `${process.env.CAPTURE_DIR}/jeu_boule_de_feu.png`, clip: { x: 440, y: 250, width: 360, height: 240 } });
  await p.waitForTimeout(3500);
  await p.evaluate(() => { window.VITESSE_ANIMATIONS = 1; window.TOKENS_VTT_DATA.H1 = { ...window.TOKENS_VTT_DATA.H1, q: 3, r: 0 };
                           window.appliquerTokensVTT(window.TOKENS_VTT_DATA); });
  await p.evaluate(() => { window.animerAttaqueCombat({ pion: "H1", cibles: ["M1"], projectile: "fleche", frappe: "legere", touches: ["M1"] }); });
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${process.env.CAPTURE_DIR}/jeu_fleche.png`, clip: { x: 500, y: 290, width: 300, height: 220 } });
  await p.waitForTimeout(1500);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
