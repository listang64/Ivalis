// L'ENCART DE TOUR FIGÉ, ET LE BOUTON OK.
//
// Nico : « le bouton OK pour voir l'animation du personnage en cours, fais-le
// plus petit et mets-le en dessous de la barre d'initiative ». Puis, après avoir
// réglé l'encart avec l'outil provisoire « ⚙ HUD » : « c'est bon, tu peux figer
// ça et virer le bouton HUD ».
//
// Sur la VRAIE page (les mêmes bouchons que hud_heros.mjs) : le OK est mesuré
// sous la piste ; les nombres de Nico sont ceux du code ; et on mesure À
// L'ÉCRAN que l'encart les applique. L'outil, lui, a disparu : ni fichier, ni
// ligne dans index.html, ni poignée en combat.
import fs from 'fs';
import http from 'http';
import path from 'path';

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

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  // firebase-config.js fabrique la base avec des options (le transport sondé
  // plutôt que subi, pour l'iPad) : le bouchon doit donc offrir cette porte-là,
  // sinon le module ne se charge pas et rien du jeu ne s'initialise.
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
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));

// Les images du décor sont injoignables depuis le bac à sable. On sert un
// rectangle connu à la place : l'avatar doit avoir une taille pour qu'on puisse
// dire s'il dépasse du bouton, et le bandeau une hauteur pour que la boîte de
// l'anneau se pose quelque part.
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml',
  headers: {'Access-Control-Allow-Origin':'*'},
  body: `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="132" viewBox="0 0 450 132"><rect width="450" height="132" fill="#2a1d12"/></svg>` }));

const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));

await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

// =========================================================================
//  LE MONDE : mon héros, un compagnon, et une créature.
// =========================================================================
await p.evaluate(() => {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById("fenetre-combat").style.display = "block";

  window.jouerSonClic = () => {};
  window.estCombattantMort = () => false;
  window.estMonstre = (id) => String(id).startsWith("M");
  window.PERSOS_PARTIE = [
    { idPersonnage: "H1", camp: "Allié", prenom: "Cybile", nom: "",
      urlCloudinary: "https://res.cloudinary.com/dlkjq4kvg/image/upload/heroine.png",
      PV_Max: 70, PV_Actuels: 45, Fatigue_Max: 110, fatigueActuelle: 110,
      Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant" },
    { idPersonnage: "M1", camp: "Ennemi", estMonstre: true, prenom: "Gnoll",
      PV_Max: 40, PV_Actuels: 12, Fatigue_Max: 60, fatigueActuelle: 10,
      Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant" },
    // UN LEURRE POSÉ PAR MON HÉROS. Il porte SON ID_Joueur — à dessein : c'est
    // ce qui permet d'effacer ses illusions avec lui. Et il n'est pas une
    // créature. Tout ce qui demandait « mes héros » par le seul filtre du
    // joueur le ramassait donc avec eux.
    { idPersonnage: "ILLUSION_abc", camp: "Allié", idJoueur: "P_01", estIllusion: true,
      prenom: "Illusion de", nom: "Cybile",
      urlCloudinary: "https://res.cloudinary.com/dlkjq4kvg/image/upload/leurre.png",
      PV_Max: 1, PV_Actuels: 1, Fatigue_Max: 0, fatigueActuelle: 0,
      Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant" }
  ];
  window.PERSOS_PARTIE[0].idJoueur = "P_01";
  try { localStorage.setItem("ID_JOUEUR_COURANT", "P_01"); } catch (e) {}
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
  window.COMBAT_INDEX_PERSO = 0;
  window.PARTIE_DATA = { Phase_Combat: "Preparation", Tour_Combat: 1,
                         Ordre_Initiative: ["H1", "M1"], File_Attente_Combat: [] };
  window.actualiserHudHeros();
});
await p.waitForTimeout(500);


// =========================================================================
console.log("\n1. LE BOUTON OK : PETIT, CENTRÉ, JUSTE SOUS LA PISTE D'INITIATIVE");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    window.CACHE_COMPETENCES_GLOBAL = { M1: { C_M1: { Nom: "Hurlement putride",
      Composants: { actions: [{ zoneHexes: [{ q: 0, r: 0 }] }] },
      Effets_Compiles: [{ nom: "Mot de pouvoir", desc: "9 dégâts", isMod: false }] } } };
    window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"],
      File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "C_M1", initiative: 50 }] };
    window.EVENEMENT_ATTENDU = { acteur: "M1", idCarte: "C_M1", manche: 1, v: 1 };
    // L'étape « un OK à donner » : c'est elle, et elle seule, qui montre le bouton.
    window.etatSequenceTour = () => ({ okVisible: true, message: "", masquee: false });
    // Une piste d'une hauteur inhabituelle : le bouton doit suivre SON bas réel,
    // pas une valeur apprise par cœur.
    document.getElementById("piste-initiative").style.height = "150px";
    window.rafraichirVoileTour();
    await new Promise(res => setTimeout(res, 700));
    const ok = document.getElementById("voile-tour-ok");
    const piste = document.getElementById("piste-initiative").getBoundingClientRect();
    const b = ok.getBoundingClientRect();
    return { affiche: getComputedStyle(ok).display !== "none", haut: b.top, bas: b.bottom, hauteur: b.height,
             centre: b.left + b.width / 2, largeurFenetre: window.innerWidth, basPiste: piste.bottom,
             police: parseFloat(getComputedStyle(ok).fontSize) };
  });
  verifier("le OK est affiché quand l'étape le demande", r.affiche);
  verifier("il est juste sous la piste d'initiative (10 px)", Math.abs(r.haut - (r.basPiste + 10)) <= 1,
           `(haut ${r.haut.toFixed(0)}, bas de la piste ${r.basPiste.toFixed(0)})`);
  verifier("il est centré horizontalement", Math.abs(r.centre - r.largeurFenetre / 2) <= 2, `(${r.centre.toFixed(0)} / ${r.largeurFenetre / 2})`);
  verifier("il est petit (police 15 px, moins de 40 px de haut)", r.police <= 16 && r.hauteur < 40,
           `(police ${r.police}, hauteur ${r.hauteur.toFixed(0)})`);
  await p.evaluate(() => { delete window.etatSequenceTour; window.EVENEMENT_ATTENDU = null;
    window.PARTIE_DATA = { Phase_Combat: "Preparation", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"], File_Attente_Combat: [] };
    window.rafraichirVoileTour(); });
  await p.waitForTimeout(600);
}

// =========================================================================
console.log("\n2. LES NOMBRES DE NICO SONT DANS LE CODE");
// =========================================================================
const FIGES = {
  encart:        { gauche: 52, bas: -8, largeur: 740 },
  encartFond:    { x: -1.5, y: 16, echelle: 68 },
  encartPion:    { x: -2.5, y: 34, taille: 41 },
  encartAvatar:  { x: -8.5, bas: 0, hauteur: 62 },
  encartEtats:   { x: -3.5, y: 78, largeur: 22, taille: 5, ecart: 1.4 },
  encartNom:     { x: -5, y: 85, taille: 8 },
  encartCarte:   { x: 33, y: 46, taille: 3.6 },
  encartDetail:  { x: 40, y: 53, taille: 2.1, largeur: 74 },
  encartAttente: { x: 39.5, y: 90, taille: 2.5 }
};
{
  const r = await p.evaluate((g) => { const o = {}; g.forEach(k => o[k] = window.REGLAGES_HUD[k]); return o; }, Object.keys(FIGES));
  for (const [cle, val] of Object.entries(FIGES))
    verifier(`${cle} = ${JSON.stringify(val)}`, JSON.stringify(r[cle]) === JSON.stringify(val), JSON.stringify(r[cle]));
}

// =========================================================================
console.log("\n3. ET L'ÉCRAN LES APPLIQUE (écran 1366×1024, plaque de 740 px)");
// =========================================================================
{
  await p.setViewportSize({ width: 1366, height: 1024 });
  const m = await p.evaluate(async () => {
    window.CACHE_COMPETENCES_GLOBAL = { M1: { C_M1: { Nom: "Hurlement putride",
      Composants: { actions: [{ zoneHexes: [{ q: 0, r: 0 }] }] },
      Effets_Compiles: [{ nom: "Mot de pouvoir", desc: "9 dégâts", isMod: false }] } } };
    window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"],
      File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "C_M1", initiative: 50 }] };
    window.EVENEMENT_ATTENDU = { acteur: "M1", idCarte: "C_M1", manche: 1, v: 1 };
    window.rafraichirVoileTour();
    await new Promise(res => setTimeout(res, 700));
    window.appliquerReglagesEncart();
    const e = document.getElementById("voile-tour-encart").getBoundingClientRect();
    const rel = (id) => { const b = document.getElementById(id).getBoundingClientRect();
      return { x: (b.left - e.left) / e.width * 100, y: (b.top - e.top) / e.height * 100 }; };
    return { gauche: e.left, largeur: e.width, nom: rel("voile-tour-nom"), carte: rel("voile-tour-carte"),
             attente: rel("voile-tour-attente"), bas: rel("voile-tour-bas") };
  });
  const pres = (a, b) => Math.abs(a - b) <= 0.6;
  verifier("la plaque fait 740 px, à 52 px du bord", pres(m.largeur, 740) && pres(m.gauche, 52),
           `(${m.largeur.toFixed(1)} px, gauche ${m.gauche.toFixed(1)})`);
  verifier("le nom du combattant est en bas à gauche (-5 %, 85 %)", pres(m.nom.x, -5) && pres(m.nom.y, 85),
           `(${m.nom.x.toFixed(1)}, ${m.nom.y.toFixed(1)})`);
  verifier("le nom de la technique au milieu (33 %, 46 %)", pres(m.carte.x, 33) && pres(m.carte.y, 46),
           `(${m.carte.x.toFixed(1)}, ${m.carte.y.toFixed(1)})`);
  verifier("le détail dessous (40 %, 53 %)", pres(m.bas.x, 40) && pres(m.bas.y, 53),
           `(${m.bas.x.toFixed(1)}, ${m.bas.y.toFixed(1)})`);
  verifier("la ligne d'attente en bas (39,5 %, 90 %)", pres(m.attente.x, 39.5) && pres(m.attente.y, 90),
           `(${m.attente.x.toFixed(1)}, ${m.attente.y.toFixed(1)})`);
}

// =========================================================================
console.log("\n4. LE BOUTON « ⚙ HUD » A DISPARU");
// =========================================================================
{
  await p.waitForTimeout(800);   // l'ancien outil montrait sa poignée au bout de 600 ms en combat
  const r = await p.evaluate(() => ({
    poignee: !!document.getElementById("reglage-encart-poignee"),
    boite: !!document.getElementById("reglage-encart"),
    fonction: typeof window.basculerReglageEncart,
    boutonHud: [...document.querySelectorAll("button, div")].some(el => el.children.length === 0 && /⚙\s*HUD/.test(el.textContent))
  }));
  verifier("plus de poignée ni de boîte en combat", !r.poignee && !r.boite && !r.boutonHud);
  verifier("plus de fonction de réglage", r.fonction === "undefined", r.fonction);
  verifier("index.html ne charge plus l'outil", !/reglage_encart\.js/.test(fs.readFileSync(`${RACINE}/index.html`, "utf-8")));
  verifier("et le fichier est parti", !fs.existsSync(`${RACINE}/reglage_encart.js`));
}

// =========================================================================
console.log("\n5. LES ÉTATS SOUS LE PORTRAIT SUIVENT LA FICHE, EN DIRECT");
// =========================================================================
//  Nico voyait son héros « en feu » sur l'encart alors qu'il n'avait plus
//  aucun état : les icônes n'étaient redessinées qu'à l'ouverture du tour.
{
  const BRULE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1788181101/IMG_2087_q6chof.png";
  const icones = () => p.evaluate(() => document.querySelectorAll("#voile-tour-etats img").length);
  await p.evaluate((icone) => {
    const h = window.PERSOS_PARTIE.find(x => x.idPersonnage === "H1");
    h.Etats_Alteres = [{ nom: "Brûlé", duree: 1, icone }, { nom: "Brûlé", duree: 1, icone }];
    window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"],
      File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C_H1", initiative: 60 }] };
    window.EVENEMENT_ATTENDU = { acteur: "H1", idCarte: "C_H1", manche: 1, v: 2 };
    window.rafraichirVoileTour();
  }, BRULE);
  await p.waitForTimeout(700);
  verifier("héros brûlé : une seule icône de feu sous son portrait (pas deux)", (await icones()) === 1, String(await icones()));

  // La brûlure tombe (fin de manche) : la fiche change, l'encart n'est PAS rouvert.
  await p.evaluate(() => {
    window.PERSOS_PARTIE.find(x => x.idPersonnage === "H1").Etats_Alteres = [];
    window.rafraichirAffichageCombat();
  });
  await p.waitForTimeout(200);
  verifier("la brûlure tombe : l'icône disparaît sans rouvrir le tour", (await icones()) === 0, String(await icones()));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
