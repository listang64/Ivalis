// LE PETIT BOND DU DÉPLACEMENT — POUR LES CRÉATURES AUSSI
//
// Question de Nico : « les ennemis, quand ils se déplacent, ont-ils aussi
// l'animation de saut comme les joueurs ? »
//
// La réponse ne se lit pas dans le code : `jouerAnimationPas` grossit le pion
// de 12 % à chaque case, mais elle le fait sur `.token-img-main`, et les pions
// de créature sont construits par une AUTRE branche d'appliquerTokensVTT que
// ceux des joueurs — celle qui pose l'image commune des ennemis à la place du
// portrait. Une branche qui aurait oublié cette classe, ou qui l'aurait nommée
// autrement, et la créature glisserait d'une case à l'autre sans un bond,
// pendant que les héros sautillent. Ça ne se verrait dans aucun test de logique.
//
// Ce banc regarde donc les VRAIS pions, construits par le VRAI code, et mesure
// l'échelle de leur image PENDANT le pas :
//   • le héros bondit ;
//   • la créature bondit AUTANT, et au même rythme ;
//   • les deux retombent à l'échelle normale et finissent sur la bonne case.
//
// Le journal, lui, est déjà tenu ailleurs : cerveau_combat.mjs vérifie qu'un
// tour de créature émet bien des étapes « pas » une par case (« elle marche… »),
// et pont_combat.mjs qu'une étape « pas » appelle l'animation, quel que soit le
// pion. Ce qui manquait est ce dernier maillon : que l'animation ait quelque
// chose à faire grossir quand le pion est une créature.
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

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
  export const setDoc = async () => {}; export const updateDoc = async () => {};
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {}; export const query = (...a) => ({a});
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
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript',
  headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript',
  headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE }));
// Le portrait du héros et l'image commune des ennemis vivent sur Cloudinary,
// injoignable d'ici : un carré de proportions connues fait l'affaire. Ce qui
// compte n'est pas ce que l'image montre, c'est qu'elle existe et qu'on la
// fasse grossir.
await p.route('**res.cloudinary.com/**', r => r.fulfill({ contentType: 'image/svg+xml',
  headers: { 'Access-Control-Allow-Origin': '*' },
  body: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#6b4423"/></svg>` }));

const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));

await p.goto(base + '/index.html');
await p.waitForTimeout(1800);

// =========================================================================
//  LE MONDE : un héros, une créature, et de VRAIS pions sur le plateau.
// =========================================================================
await p.evaluate(() => {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById("fenetre-combat").style.display = "block";

  window.jouerSonClic = () => {};
  window.estCombattantMort = () => false;
  window.estMonstre = (id) => String(id).startsWith("M");
  window.sequenceTourEnAttente = () => false;
  window.caseOccupeeParVivant = () => false;
  window.listerEnnemisAuContact = () => [];
  window.zonesPersistantesSurCase = () => [];

  window.PLATEAU_VTT = {
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    hexToPixel: (q, r) => ({ x: 300 + q * 60, y: 300 + r * 60 }),
    pixelToHex: () => ({ q: 0, r: 0 }),
    renderMap: () => {}
  };
  window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;

  const fiche = (id, extra) => Object.assign({
    idPersonnage: id, prenom: id, camp: "Allié", PV_Max: 60, PV_Actuels: 60,
    Fatigue_Max: 100, fatigueActuelle: 100, Bouclier_Actuel: 0, Etats_Alteres: [],
    statut: "Vivant", Taille_Token: 55
  }, extra || {});

  window.PERSOS_PARTIE = [
    // Un héros avec son portrait…
    fiche("H1", { prenom: "Cybile", urlCloudinary: "https://res.cloudinary.com/x/image/upload/portrait.png" }),
    // …et une créature, qui passe par l'AUTRE branche de construction du pion.
    fiche("M1", { camp: "Ennemi", estMonstre: true, prenom: "Gnoll" })
  ];
  // LE PION PORTE SON IMAGE DANS SA PROPRE ENTRÉE, pas dans la fiche : c'est
  // `data.url` que lit appliquerTokensVTT. Sans elle, l'image du héros part sur
  // src="undefined", son `onerror` la passe en display:none — et une image
  // cachée n'a pas d'échelle calculée. Le banc croirait alors que le héros ne
  // bondit pas, ce qui est faux : il ne serait simplement pas là.
  window.TOKENS_VTT_DATA = {
    H1: { q: 0, r: 0, url: "https://res.cloudinary.com/x/image/upload/portrait.png", taille: 55 },
    M1: { q: 4, r: 0, taille: 55 }
  };
  window.TOKEN_SELECTIONNE = null;
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
  window.COMBAT_INDEX_PERSO = 0;
  window.ZONES_PERSISTANTES = {};
  window.CHEMIN_MOUVEMENT = [];
  window.REGIME_CERVEAU = true;
  window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1, File_Attente_Combat: [] };

  // LES VRAIS PIONS, PAR LE VRAI CODE. C'est tout l'objet du banc : si la
  // branche des créatures oubliait l'image, il n'y aurait rien à faire bondir.
  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
});

// =========================================================================
//  LA MESURE : l'échelle de l'image, pendant le pas.
// =========================================================================
//  On ne lit pas le style écrit (il dirait « scale(1.12) » même si rien ne
//  bougeait à l'écran) : on lit la matrice CALCULÉE, celle que le navigateur
//  applique vraiment, pendant que l'animation court.
const bondir = (idToken, de, vers) => p.evaluate(async ({ idToken, de, vers }) => {
  const div = document.getElementById("token-" + idToken);
  if (!div) return { existe: false };
  const img = div.querySelector(".token-img-main");
  if (!img) return { existe: true, image: false };

  const echelle = () => {
    const t = getComputedStyle(img).transform;
    if (!t || t === "none") return 1;
    const m = t.match(/matrix\(([^,]+),/);
    return m ? parseFloat(m[1]) : 1;
  };

  const mesures = [];
  const animation = window.jouerAnimationPas({ idToken, de, vers });
  for (let i = 0; i < 14; i++) {
    await new Promise(r => setTimeout(r, 30));
    mesures.push(echelle());
  }
  await animation;
  await new Promise(r => setTimeout(r, 60));

  return {
    existe: true, image: true,
    max: Math.max(...mesures),
    fin: echelle(),
    caseFinale: { q: parseFloat(div.dataset.q), r: parseFloat(div.dataset.r) },
    profil: mesures.map(v => v.toFixed(2)).join(" ")
  };
}, { idToken, de, vers });

const heros = await bondir("H1", { q: 0, r: 0 }, { q: 1, r: 0 });
const creature = await bondir("M1", { q: 4, r: 0 }, { q: 3, r: 0 });

console.log("\n1. LE HÉROS BONDIT EN MARCHANT");
verifier("son pion existe sur le plateau", heros.existe === true);
verifier("et il porte bien une image", heros.image === true);
verifier("SON IMAGE GROSSIT PENDANT LE PAS", heros.max > 1.05, `${heros.max}×`);
verifier("puis retombe à sa taille", Math.abs(heros.fin - 1) < 0.02, `${heros.fin}×`);
verifier("et il finit sur la case visée",
         heros.caseFinale && heros.caseFinale.q === 1 && heros.caseFinale.r === 0,
         JSON.stringify(heros.caseFinale));
console.log(`     profil du héros    : ${heros.profil}`);

console.log("\n2. LA CRÉATURE AUSSI — C'EST LA QUESTION POSÉE");
// Son pion est construit par une autre branche que celui du héros : l'image
// commune des ennemis remplace le portrait. Si cette branche ne posait pas la
// classe que l'animation cherche, la créature glisserait sans bondir.
verifier("son pion existe sur le plateau", creature.existe === true);
verifier("ET IL PORTE UNE IMAGE QUE L'ANIMATION PEUT SAISIR", creature.image === true);
verifier("ELLE BONDIT ELLE AUSSI", creature.max > 1.05, `${creature.max}×`);
verifier("EXACTEMENT AUTANT QUE LE HÉROS",
         Math.abs(creature.max - heros.max) < 0.02, `${creature.max}× contre ${heros.max}×`);
verifier("elle retombe à sa taille", Math.abs(creature.fin - 1) < 0.02, `${creature.fin}×`);
verifier("et elle finit sur la case visée",
         creature.caseFinale && creature.caseFinale.q === 3 && creature.caseFinale.r === 0,
         JSON.stringify(creature.caseFinale));
console.log(`     profil de la créature : ${creature.profil}`);

verifier("aucune erreur JavaScript pendant tout le banc", erreurs.length === 0, erreurs.slice(0, 2).join(" | "));

await b.close();
serveur.close();
console.log(echecs === 0
  ? "\n✅ Les créatures sautillent comme les héros, du même bond."
  : `\n❌ ${echecs} vérification(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
