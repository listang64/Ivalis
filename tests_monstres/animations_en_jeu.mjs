// LES ANIMATIONS DU STUDIO, IMPLANTÉES EN JEU
//
// Nico, dans le Studio d'animation : « Marche du Vargen, Bond, Repli (sans le
// logo bleu), Pas de retraite offert par l'arme, Fuite sous la Peur (sans le
// smiley), Fuite sous la Confusion, Hémorragie interne, Arrivée d'un
// renfort, Apparition d'une Illusion, Déploiement des pions en début de
// combat : tu peux les implanter en jeu. »
//
//   1. LE NOYAU : un pas porte sa manière — la fuite (peur / confusion), la
//      case offerte par un pas de retraite — et le pont la transmet, avec le
//      transfert d'un bond, la case qui saigne, l'illusion qui arrive ;
//   2. LE VRAI PLATEAU (index.html, les vrais pions d'appliquerTokensVTT) :
//      chaque pas joue SON geste du Studio, ses sons, ses mots — au premier
//      pas seulement ce qui ne se dit qu'une fois — et finit sur sa case ; un
//      humain garde la marche d'avant, le Transfert son saut ;
//   3. LES ENTRÉES EN SCÈNE : renfort, illusion, déploiement — le vrai pion
//      reste caché pendant que sa copie descend, un redessin ne coupe rien,
//      et il n'y a pas de déploiement en plein combat.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { resoudrePeur, resoudreMouvement } from '../mouvement_pur.js';
import { construireEtatCombat, clonerEtat } from '../combat_etat.js';
import { misEnScene, creerPont } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(72)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, extra = {}) => ({
  idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, Fatigue_Actuelle: 100,
  Esquive: 0, Parade: 0, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const monde = (extraH1 = {}) => construireEtatCombat({
  idPartie: "G", cerveau: "P_01", graine: 7,
  combattants: [fiche("H1", { idJoueur: "P_01", camp: "Allié", prenom: "Naomi", ...extraH1 }),
                fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Goule" })],
  positions: { H1: { q: 0, r: 0 }, M1: { q: 6, r: 0 } },
  partie: { Phase_Combat: "Resolution", Tour_Combat: 2, Ordre_Initiative: ["H1", "M1"],
            File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C" }, { idPersonnage: "M1", idCarte: "C" }] }
});
const des = { d100: () => 99, fraction: () => 0.5, graine: () => 1 };
const plaine = { etatCase: () => ({ bloquee: false, supprimee: false, difficile: false }) };

console.log("\n1. LE NOYAU ET LE PONT : CHAQUE PAS DIT SA MANIÈRE");
{
  const s1 = clonerEtat(monde());
  const peur = resoudrePeur(s1, "M1", "H1", des, plaine).filter(e => e.type === "pas");
  const s2 = clonerEtat(monde());
  const confus = resoudrePeur(s2, "H1", "H1", des, plaine, { exempte: null, fuite: "confusion" }).filter(e => e.type === "pas");
  verifier("une fuite sous la Peur : chaque pas porte « fuite: peur »", peur.length > 0 && peur.every(e => e.fuite === "peur"), String(peur.length));
  verifier("une fuite sous la Confusion : « fuite: confusion »", confus.length > 0 && confus.every(e => e.fuite === "confusion"));
  const cerveau = fs.readFileSync('/home/user/Ivalis/cerveau_combat.js', 'utf-8');
  verifier("le cerveau fait fuir le confus avec « fuite: confusion »", /resoudrePeur\([^)]*\{ exempte: null, fuite: "confusion" \}\)/.test(cerveau));
  // Le pas de retraite offert par l'arme : l'état « Repli » (hexApresAttaque : 1).
  const s3 = monde({ Etats_Alteres: [{ nom: "Repli", duree: 1, bonusEquip: { hexApresAttaque: 1 } }] });
  const marche = resoudreMouvement(s3, { idLanceur: "H1", chemin: [{ q: 1, r: 0 }, { q: 2, r: 0 }] }, des, plaine).etapes.filter(e => e.type === "pas");
  verifier("le pas de retraite : la case offerte est marquée « offert », la suivante non",
           marche.length === 2 && marche[0].offert === true && marche[0].cout === 0 && !marche[1].offert, JSON.stringify(marche.map(m => [m.cout, !!m.offert])));

  const etat = monde();
  const pasPeur = misEnScene({ type: "pas", acteur: "H1", de: { q: 0, r: 0 }, vers: { q: -1, r: 0 }, cout: 2, fuite: "peur" }, etat);
  const pasOffert = misEnScene({ type: "pas", acteur: "H1", de: { q: 0, r: 0 }, vers: { q: 1, r: 0 }, cout: 0, offert: true }, etat);
  const bond = misEnScene({ type: "bond", acteur: "H1", de: { q: 0, r: 0 }, vers: { q: 2, r: 0 }, transfert: true }, etat);
  const sang = misEnScene({ type: "degats", cible: "H1", montant: 2, pvApres: 58, bouclierApres: 0, tic: "Hémorragie interne" }, etat);
  const leurre = misEnScene({ type: "arrivee", combattant: { id: "ILL_1", estIllusion: true } }, etat);
  const renfort = misEnScene({ type: "arrivee", combattant: { id: "M9" } }, etat);
  verifier("le pont transmet la fuite et la case offerte", pasPeur.fuite === "peur" && pasOffert.offert === true);
  verifier("…le transfert d'un bond, la case qui saigne, l'illusion qui arrive",
           bond.transfert === true && sang.hemorragie === true && leurre.illusion === true && !renfort.illusion && renfort.pion === "M9");

  const vus = [];
  const pont = creerPont({
    pas: async (d) => vus.push(["pas", d.fuite || "", !!d.offert]),
    bond: async (d) => vus.push(["bond", !!d.transfert]),
    repli: async (d) => vus.push(["repli", d.texte]),
    hemorragie: async (d) => vus.push(["hemorragie", d.pion]),
    jauge: () => vus.push(["jauge"]),
    arrivee: async (d) => vus.push(["arrivee", d.pion, !!d.illusion]),
    pause: async () => {}
  });
  await pont.animer({ type: "repli", acteur: "H1", de: { q: 0, r: 0 }, vers: { q: 0, r: -3 } }, etat);
  await pont.animer({ type: "pas", acteur: "H1", de: { q: 0, r: 0 }, vers: { q: -1, r: 0 }, cout: 2, fuite: "confusion" }, etat);
  await pont.animer({ type: "bond", acteur: "H1", de: { q: 0, r: 0 }, vers: { q: 2, r: 0 }, transfert: true }, etat);
  await pont.animer({ type: "degats", cible: "H1", montant: 2, pvApres: 58, bouclierApres: 0, tic: "Hémorragie interne" }, etat);
  await pont.animer({ type: "arrivee", combattant: { id: "ILL_1", estIllusion: true } }, etat);
  verifier("le pont appelle l'annonce du repli (sans logo), le pas en fuite, le bond-transfert",
           JSON.stringify(vus.slice(0, 3)) === JSON.stringify([["repli", "Repli : sans opportunité"], ["pas", "confusion", false], ["bond", true]]),
           JSON.stringify(vus.slice(0, 3)));
  verifier("…la case qui saigne AVANT son chiffre, puis l'arrivée de l'illusion",
           JSON.stringify(vus.slice(3)) === JSON.stringify([["hemorragie", "H1"], ["jauge"], ["arrivee", "ILL_1", true]]), JSON.stringify(vus.slice(3)));
}

// =========================================================================
//  2. LE VRAI PLATEAU
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
  window.PERSOS_PARTIE = [f("H1", { prenom: "Naomi", race: "Humain" }), f("V1", { prenom: "Kael", race: "Vargen" }),
                          f("M1", { camp: "Ennemi", estMonstre: true, prenom: "Goule" })];
  const url = "https://res.cloudinary.com/x/image/upload/portrait.png";
  window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0, url, taille: 55 }, V1: { q: -2, r: 2, url, taille: 55 }, M1: { q: 4, r: 0, taille: 55 } };
  window.ZONES_PERSISTANTES = {};
  window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 2, File_Attente_Combat: [] };
  window.DELAI_DEPLOIEMENT_MS = 0;
  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
  // Les espions : les sons demandés, les mots qui montent.
  window.__sons = []; window.__textes = [];
  const vraiSon = window.jouerSonCombat;
  window.jouerSonCombat = (id, f) => { window.__sons.push(id); return vraiSon(id, f); };
  const vraiTexte = window.afficherMessageFlottantHex;
  window.afficherMessageFlottantHex = (q, r, t, c, o) => { window.__textes.push(t); return vraiTexte(q, r, t, c, o); };
  window.__noter = () => { window.__sons = []; window.__textes = []; };
  // Pendant une animation : ce qui paraît dans le calque des pions.
  window.__sonder = (selecteur) => {
    let max = 0; let fini = false;
    const tour = () => { max = Math.max(max, document.querySelectorAll(selecteur).length); if (!fini) requestAnimationFrame(tour); };
    requestAnimationFrame(tour);
    return () => { fini = true; return max; };
  };
  window.__surCase = (id, c) => {
    const el = document.getElementById("token-" + id);
    const px = window.PLATEAU_VTT.hexToPixel(c.q, c.r);
    return !!el && +el.dataset.q === c.q && +el.dataset.r === c.r
      && Math.abs(parseFloat(el.style.left) - px.x) < 1 && Math.abs(parseFloat(el.style.top) - px.y) < 1
      && el.getAnimations().length === 0;
  };
});

console.log("\n2. LES PAS SUR LE VRAI PLATEAU");
{
  const r = await p.evaluate(async () => {
    const res = {};
    // La foulée du Vargen : deux pas d'un trajet.
    window.__noter();
    const fin = window.__sonder("#conteneur-tokens-vtt .anim-figurant");
    await window.jouerAnimationPas({ idToken: "V1", de: { q: -2, r: 2 }, vers: { q: -1, r: 2 } });
    const textes1 = [...window.__textes];
    await window.jouerAnimationPas({ idToken: "V1", de: { q: -1, r: 2 }, vers: { q: 0, r: 2 } });
    await new Promise(r => setTimeout(r, 120));   // le dernier son, la dernière silhouette
    res.vargen = { silhouettes: fin(), sons: window.__sons, textes1, textes2: window.__textes.slice(textes1.length),
                   surCase: window.__surCase("V1", { q: 0, r: 2 }), sorte: window.sortePasDeCombat({ idToken: "V1" }) };
    // Un humain : la marche d'avant (aucune silhouette, la transition d'avant).
    await new Promise(r => setTimeout(r, 600));   // les silhouettes du Vargen se sont effacées
    window.__noter();
    const fin2 = window.__sonder("#conteneur-tokens-vtt .anim-figurant");
    await window.jouerAnimationPas({ idToken: "H1", de: { q: 0, r: 0 }, vers: { q: 1, r: 0 } });
    res.humain = { silhouettes: fin2(), sorte: window.sortePasDeCombat({ idToken: "H1" }),
                   transition: document.getElementById("token-H1").style.transition, sons: window.__sons };
    // Le repli : l'annonce, puis un pas qui file.
    window.__noter();
    await window.annoncerRepliCombat({ pion: "H1", texte: "Repli : sans opportunité", couleur: "#ccc" });
    const fin3 = window.__sonder("#conteneur-tokens-vtt .anim-figurant");
    await window.jouerAnimationPas({ idToken: "H1", de: { q: 1, r: 0 }, vers: { q: 1, r: -1 }, repli: true });
    await new Promise(r => setTimeout(r, 120));
    res.repli = { sons: window.__sons, textes: window.__textes, silhouettes: fin3(), surCase: window.__surCase("H1", { q: 1, r: -1 }) };
    // Le pas de retraite offert : l'empreinte dorée.
    window.__noter();
    const fin4 = window.__sonder('#conteneur-tokens-vtt .anim-effet[style*="polygon(25% 0"]');
    await window.jouerAnimationPas({ idToken: "H1", de: { q: 1, r: -1 }, vers: { q: 0, r: -1 }, offert: true });
    res.offert = { empreintes: fin4(), sons: window.__sons, textes: window.__textes, surCase: window.__surCase("H1", { q: 0, r: -1 }) };
    return res;
  });
  verifier("le Vargen marche à sa foulée : une silhouette laissée sur chaque case quittée", r.vargen.sorte === "vargen" && r.vargen.silhouettes >= 1, `${r.vargen.silhouettes}`);
  verifier("…le pas léger à chaque case", r.vargen.sons.filter(s => s === "pas-leger").length === 2, JSON.stringify(r.vargen.sons));
  verifier("« Foulée du Vargen : ½ ⚡ » au premier pas du trajet, pas au second",
           r.vargen.textes1.includes("Foulée du Vargen : ½ ⚡") && !r.vargen.textes2.includes("Foulée du Vargen : ½ ⚡"), JSON.stringify([r.vargen.textes1, r.vargen.textes2]));
  verifier("…et il finit posé net sur sa case", r.vargen.surCase);
  verifier("un humain garde la marche d'avant (pas de silhouette, sa transition)",
           r.humain.sorte === null && r.humain.silhouettes === 0 && /left 0\.4s/.test(r.humain.transition), r.humain.transition);
  verifier("le repli s'annonce : son souffle, « Repli : sans opportunité », sans logo",
           r.repli.sons[0] === "repli" && r.repli.textes.includes("Repli : sans opportunité") && !r.repli.textes.some(t => /↩/.test(t)), JSON.stringify(r.repli));
  verifier("…puis son pas file en laissant son ombre, et finit sur sa case", r.repli.silhouettes >= 1 && r.repli.surCase);
  verifier("la case offerte : l'empreinte dorée, « Pas gratuit », le pas léger",
           r.offert.empreintes === 1 && r.offert.textes.includes("Pas gratuit") && r.offert.sons.includes("pas-leger") && r.offert.surCase, JSON.stringify(r.offert));
}

console.log("\n3. LA FUITE, LE SANG, LE BOND");
{
  const r = await p.evaluate(async () => {
    const res = {};
    const img = () => document.querySelector("#token-M1 .token-img-main, #token-M1 img");
    window.__noter();
    await window.jouerAnimationPas({ idToken: "M1", de: { q: 4, r: 0 }, vers: { q: 5, r: 0 }, fuite: "peur" });
    const textes1 = [...window.__textes], sons1 = [...window.__sons];
    const teinte = img() ? img().style.filter : "";
    await window.jouerAnimationPas({ idToken: "M1", de: { q: 5, r: 0 }, vers: { q: 6, r: 0 }, fuite: "peur" });
    res.peur = { textes1, sons1, textes2: window.__textes.slice(textes1.length), teinte, surCase: window.__surCase("M1", { q: 6, r: 0 }) };
    await new Promise(r => setTimeout(r, 2300));
    res.peur.apres = img() ? img().style.filter : "";
    // La confusion.
    window.__noter();
    const fin = window.__sonder("#conteneur-tokens-vtt .anim-effet span");
    await window.jouerAnimationPas({ idToken: "M1", de: { q: 6, r: 0 }, vers: { q: 6, r: 1 }, fuite: "confusion" });
    res.confusion = { sons: window.__sons, teinte: img() ? img().style.filter : "", etoiles: fin(), surCase: window.__surCase("M1", { q: 6, r: 1 }) };
    // L'hémorragie interne.
    window.__noter();
    const fin2 = window.__sonder("#conteneur-tokens-vtt .anim-effet");
    await window.animerHemorragieCombat({ pion: "H1" });
    const t1 = [...window.__textes];
    await window.animerHemorragieCombat({ pion: "H1" });
    res.sang = { sons: window.__sons, t1, t2: window.__textes.slice(t1.length), gouttes: fin2() };
    // Le bond, puis le Transfert (qui garde son saut). La base dit déjà la case
    // d'arrivée (le combat la projette juste après l'animation, et le bond
    // finit par redessiner les pions d'après elle).
    window.TOKENS_VTT_DATA.H1 = { ...window.TOKENS_VTT_DATA.H1, q: 2, r: -1 };
    window.__noter();
    const fin3 = window.__sonder("#conteneur-tokens-vtt .anim-ombre");
    await window.jouerAnimationBond({ idToken: "H1", depart: { q: 0, r: -1 }, arrivee: { q: 2, r: -1 } });
    res.bond = { sons: window.__sons, textes: window.__textes, ombre: fin3(), surCase: window.__surCase("H1", { q: 2, r: -1 }) };
    window.TOKENS_VTT_DATA.H1 = { ...window.TOKENS_VTT_DATA.H1, q: 1, r: -1 };
    window.__noter();
    await window.jouerAnimationBond({ idToken: "H1", depart: { q: 2, r: -1 }, arrivee: { q: 1, r: -1 }, transfert: true });
    res.transfert = { sons: window.__sons, case: document.getElementById("token-H1").dataset.q + "," + document.getElementById("token-H1").dataset.r };
    return res;
  });
  verifier("la fuite sous la Peur : son, « Peur : il s'enfuit ! », la course — sans smiley",
           r.peur.sons1.includes("peur") && r.peur.sons1.includes("course") && r.peur.textes1.includes("Peur : il s'enfuit !")
           && !r.peur.textes1.some(t => /😱/.test(t)), JSON.stringify([r.peur.sons1, r.peur.textes1]));
  verifier("…il s'assombrit le temps de la fuite, le mot n'est dit qu'une fois",
           /brightness\(0\.55\)/.test(r.peur.teinte) && !r.peur.textes2.includes("Peur : il s'enfuit !"), r.peur.teinte);
  verifier("…la fuite finie, sa teinte s'en va ; il est sur sa case", r.peur.apres === "" && r.peur.surCase, `« ${r.peur.apres} »`);
  verifier("la fuite sous la Confusion : son, des « ? » qui tournent, teinte violette",
           r.confusion.sons.includes("confusion") && r.confusion.etoiles >= 3 && /hue-rotate\(225deg\)/.test(r.confusion.teinte) && r.confusion.surCase,
           JSON.stringify(r.confusion));
  verifier("l'hémorragie interne : le son qui saigne, des gouttes, « Hémorragie interne » une fois",
           r.sang.sons.filter(s => s === "saignement").length === 2 && r.sang.gouttes >= 6 && r.sang.t1.includes("Hémorragie interne")
           && !r.sang.t2.includes("Hémorragie interne"), JSON.stringify(r.sang));
  verifier("le bond : l'envol, l'ombre au sol, la réception, « Bond ! », posé sur sa case",
           r.bond.sons.includes("bond-envol") && r.bond.sons.includes("reception") && r.bond.ombre === 1 && r.bond.textes.includes("Bond !") && r.bond.surCase,
           JSON.stringify(r.bond));
  verifier("le Transfert garde son saut à lui (pas l'envol du bond)", !r.transfert.sons.includes("bond-envol") && r.transfert.case === "1,-1", JSON.stringify(r.transfert));
}

console.log("\n4. LES ENTRÉES EN SCÈNE");
{
  const r = await p.evaluate(async () => {
    const res = {};
    const ajouter = (id, extra, q, r) => {
      window.PERSOS_PARTIE.push(Object.assign({ idPersonnage: id, prenom: id, camp: "Ennemi", estMonstre: true, PV_Max: 30, PV_Actuels: 30,
        Fatigue_Max: 50, fatigueActuelle: 50, Etats_Alteres: [], statut: "Vivant" }, extra || {}));
      window.TOKENS_VTT_DATA[id] = { q, r, taille: 55 };
    };
    // UN RENFORT annoncé par le journal avant d'être dessiné.
    window.__noter();
    await window.annoncerArriveeCombat({ pion: "M2" });
    ajouter("M2", {}, 3, 2);
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    await new Promise(r => setTimeout(r, 500));
    const reel = document.getElementById("token-M2");
    res.renfortPendant = { cache: reel.classList.contains("pion-en-entree") && getComputedStyle(reel).visibility === "hidden",
                           copie: !!document.querySelector("#conteneur-tokens-vtt .anim-figurant") };
    // Un redessin en pleine entrée ne la coupe pas.
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    const reel2 = document.getElementById("token-M2");
    res.renfortRedessin = { cache: reel2.classList.contains("pion-en-entree"), copie: !!document.querySelector("#conteneur-tokens-vtt .anim-figurant") };
    await new Promise(r => setTimeout(r, 2500));
    const fin = document.getElementById("token-M2");
    res.renfortApres = { visible: !fin.classList.contains("pion-en-entree") && getComputedStyle(fin).visibility === "visible",
                         copie: !!document.querySelector("#conteneur-tokens-vtt .anim-figurant"), sons: window.__sons, textes: window.__textes };
    // UNE ILLUSION, déjà dessinée quand le journal l'annonce.
    window.__noter();
    ajouter("ILL_1", { camp: "Allié", estMonstre: false, estIllusion: true }, -1, 1);
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    const promesse = window.annoncerArriveeCombat({ pion: "ILL_1", illusion: true });
    await new Promise(r => setTimeout(r, 300));
    res.illusionPendant = document.getElementById("token-ILL_1").classList.contains("pion-en-entree");
    await promesse;
    await new Promise(r => setTimeout(r, 2200));
    res.illusion = { sons: window.__sons, textes: window.__textes, visible: !document.getElementById("token-ILL_1").classList.contains("pion-en-entree") };
    // EN PLEIN COMBAT, un pion qui paraît sans annonce ne se « déploie » pas.
    window.__noter();
    ajouter("M3", {}, 5, 2);
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    await new Promise(r => setTimeout(r, 200));
    res.pleinCombat = { cache: document.getElementById("token-M3").classList.contains("pion-en-entree"), sons: window.__sons };
    // LE DÉPLOIEMENT, au début du combat : deux pions qui paraissent.
    window.PARTIE_DATA = { Phase_Combat: "Preparation", Tour_Combat: 1, File_Attente_Combat: [] };
    window.__noter();
    const fin2 = window.__sonder('#conteneur-tokens-vtt .anim-effet[style*="polygon(25% 0"]');
    window.PERSOS_PARTIE.push({ idPersonnage: "H2", prenom: "Ben", camp: "Allié", PV_Max: 60, PV_Actuels: 60, Etats_Alteres: [], statut: "Vivant" });
    window.TOKENS_VTT_DATA.H2 = { q: -3, r: 0, url: "https://res.cloudinary.com/x/image/upload/portrait.png", taille: 55 };
    ajouter("M4", {}, 5, -2);
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    await new Promise(r => setTimeout(r, 250));
    res.deploiementPendant = ["H2", "M4"].map(id => document.getElementById("token-" + id).classList.contains("pion-en-entree"));
    await new Promise(r => setTimeout(r, 2400));
    res.deploiement = { cases: fin2(), sons: window.__sons, textes: window.__textes,
                        visibles: ["H2", "M4"].every(id => !document.getElementById("token-" + id).classList.contains("pion-en-entree")),
                        reste: document.querySelectorAll("#conteneur-tokens-vtt .anim-effet").length };
    return res;
  });
  verifier("un renfort annoncé : le vrai pion reste caché pendant que sa copie descend", r.renfortPendant.cache && r.renfortPendant.copie, JSON.stringify(r.renfortPendant));
  verifier("…un redessin du plateau en pleine entrée ne la coupe pas", r.renfortRedessin.cache && r.renfortRedessin.copie, JSON.stringify(r.renfortRedessin));
  verifier("…puis il paraît, la copie s'en va : « Renfort ! », l'apparition et la réception",
           r.renfortApres.visible && !r.renfortApres.copie && r.renfortApres.textes.includes("Renfort !")
           && r.renfortApres.sons.includes("apparition") && r.renfortApres.sons.includes("reception"), JSON.stringify(r.renfortApres));
  verifier("une illusion : les éclats convergent, « Illusion », son pion reparaît",
           r.illusionPendant && r.illusion.sons.includes("illusion") && r.illusion.textes.includes("Illusion") && r.illusion.visible, JSON.stringify(r.illusion));
  verifier("en plein combat, un pion qui paraît sans annonce ne se « déploie » pas", !r.pleinCombat.cache && !r.pleinCombat.sons.includes("deploiement"),
           JSON.stringify(r.pleinCombat));
  verifier("le déploiement en début de combat : chaque nouveau pion descend sur sa case illuminée",
           r.deploiementPendant.every(Boolean) && r.deploiement.cases === 2 && r.deploiement.visibles, JSON.stringify(r.deploiement));
  verifier("…un seul son de déploiement, « Déploiement » une fois, rien ne reste",
           r.deploiement.sons.filter(s => s === "deploiement").length === 1 && r.deploiement.textes.filter(t => t === "Déploiement").length === 1
           && r.deploiement.reste === 0, JSON.stringify(r.deploiement));
}

// Pour les yeux : le bond et un renfort, saisis en plein vol.
if (process.env.CAPTURE_DIR) {
  await p.evaluate(() => { window.jouerAnimationBond({ idToken: "H1", depart: { q: 1, r: -1 }, arrivee: { q: 3, r: -2 } }); });
  await p.waitForTimeout(480);
  await p.screenshot({ path: `${process.env.CAPTURE_DIR}/jeu_bond.png`, clip: { x: 250, y: 150, width: 560, height: 380 } });
  await p.waitForTimeout(1200);
  await p.evaluate(() => { window.jouerAnimationPas({ idToken: "V1", de: { q: 0, r: 2 }, vers: { q: 1, r: 2 } }); });
  await p.waitForTimeout(150);
  await p.screenshot({ path: `${process.env.CAPTURE_DIR}/jeu_vargen.png`, clip: { x: 250, y: 150, width: 560, height: 380 } });
  await p.waitForTimeout(800);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
