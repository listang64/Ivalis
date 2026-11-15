// v405 — LA MISE À TERRE DES CRÉATURES ; LE BOUCLIER MAGIQUE AVANT L'ARMURE ; L'ARCANE
// CONTRE LA RÉSISTANCE MAGIQUE. Nico :
//   « quand un token ennemi est mort, il n'a pas l'animation de chute (KO) pareille
//     que les joueurs : corrige ça » ;
//   « quand un ennemi attaque un bouclier magique, la résistance physique et magique
//     ne s'applique pas » (une nouvelle règle : le bouclier prend le coup entier ;
//     brisé, le surplus passe sur la vie, réduit par la résistance, puis ÷ 2) ;
//   « vérifie que les dégâts de type arcanique ne sont pas des dégâts bruts mais
//     qu'ils font face à la résistance magique de la cible ».
// (La mise en place du plateau : celle de piste_initiative.mjs — la vraie page.)
//
// Lancer : node tests_monstres/corrections_v405.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
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

// Mêmes doublures Firebase que demarrage_reel.mjs : rien n'écrit nulle part,
// tout le reste (combat.js, mouvement.js, moteur_effets.js, competences.js)
// est le vrai code.
const FAUX_APP = `export const initializeApp = () => ({ nom: "faux" });`;
const FAUX_FIRESTORE = `
  // firebase-config.js fabrique la base avec des options (le transport sondé
  // plutôt que subi, pour l'iPad) : le bouchon doit donc offrir cette porte-là,
  // sinon le module ne se charge pas et rien du jeu ne s'initialise.
  export const initializeFirestore = () => ({ faux: true });
  export const getFirestore = () => ({ faux: true });
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {};
  export const updateDoc = async () => {};
  export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "neuf" });
  export const deleteField = () => "«champ supprimé»";
  export class FieldPath { constructor(...segments) { this.segments = segments; } }
  export const arrayUnion = (...v) => v;
  export const arrayRemove = (...v) => v;
  export const increment = (n) => n;
  export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({ a });
  export const where = (...a) => ({ a });
  export const orderBy = (...a) => ({ a });
  export const limit = (...a) => ({ a });
  export const writeBatch = () => ({ update: () => {}, set: () => {}, delete: () => {}, commit: async () => {} });
  export const runTransaction = async (_db, fn) => fn({
    get: async () => ({ exists: () => true, data: () => ({}) }), update: () => {}, set: () => {} });
  export const Timestamp = { now: () => Date.now() };
`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });

await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({
  contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({
  contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE }));

const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });


await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

// =========================================================================
//  LE MONDE : deux héros, deux créatures.
// =========================================================================
const monde = () => p.evaluate(() => {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById("fenetre-combat").style.display = "block";

  window.jouerSonClic = () => {};
  window.estCombattantMort = (id) => (window.MORTS || []).includes(id);
  window.estMonstre = (id) => String(id).startsWith("M");
  window.sequenceTourEnAttente = () => false;
  window.MORTS = [];

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
    statut: "Vivant", Force: 10, Dexterite: 10, Intelligence: 10, Constitution: 10
  }, extra || {});

  window.PERSOS_PARTIE = [
    fiche("H1", { idJoueur: "P_01", prenom: "Cybile", urlCloudinary: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1786114507/Les_humains_h0ubwh.png" }),
    fiche("H2", { idJoueur: "P_02", prenom: "Pliors", PV_Actuels: 30 }),
    fiche("M1", { camp: "Ennemi", estMonstre: true, prenom: "Invocateur de saignées", PV_Max: 45, PV_Actuels: 45 }),
    fiche("M2", { camp: "Ennemi", estMonstre: true, prenom: "Chien des tombes", PV_Max: 40, PV_Actuels: 20 })
  ];
  // H1 a un portrait de fiche ET un token de plateau DIFFÉRENTS : c'est ce qui
  // permet de vérifier que la piste montre bien le second, pas le premier.
  window.TOKENS_VTT_DATA = {
    H1: { q: 0, r: 0, url: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1786114507/token_h1_rond.png" },
    H2: { q: 0, r: 1 }, M1: { q: 2, r: 0 }, M2: { q: 3, r: 0 }
  };
  window.TOKEN_SELECTIONNE = null;
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
  window.COMBAT_INDEX_PERSO = 0;
  window.ZONES_PERSISTANTES = {};
  window.CHEMIN_MOUVEMENT = [];
  window.REGIME_CERVEAU = true;
  window.PISTE_MANCHE = { manche: 0, ordre: [] };
  window.PARTIE_DATA = { Phase_Combat: "Preparation", Tour_Combat: 1,
                         Ordre_Initiative: ["H1", "H2", "M1", "M2"], File_Attente_Combat: [] };
  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
});

// La file d'une manche, telle que la préparation l'écrit (triée par initiative).
const manche = (n, ...entrees) => p.evaluate(({ n, entrees }) => {
  window.PARTIE_DATA.Tour_Combat = n;
  window.PARTIE_DATA.Phase_Combat = "Resolution";
  window.PARTIE_DATA.File_Attente_Combat = entrees;
  window.afficherPisteInitiative(entrees, "Resolution");
}, { n, entrees });

// La file avance : la tête a fini son tour.
const tourSuivant = () => p.evaluate(() => {
  const reste = window.PARTIE_DATA.File_Attente_Combat.slice(1);
  window.PARTIE_DATA.File_Attente_Combat = reste;
  window.afficherPisteInitiative(reste, "Resolution");
});

const finDeManche = (n) => p.evaluate((n) => {
  window.PARTIE_DATA.Tour_Combat = n;
  window.PARTIE_DATA.Phase_Combat = "Preparation";
  window.PARTIE_DATA.File_Attente_Combat = [];
  window.afficherPisteInitiative([], "Preparation");
}, n);

// Ce que la piste montre vraiment, mesuré dans la page.
const lirePiste = () => p.evaluate(() => {
  const piste = document.getElementById("piste-initiative");
  if (!piste) return null;
  const tuiles = [...piste.querySelectorAll(".piste-tuile")];
  return {
    rect: piste.getBoundingClientRect(),
    dansHudBasDroite: !!piste.closest("#combat-hud-bas-droite"),
    ombres: piste.querySelectorAll(".piste-ombre-sol").length,
    bandeaux: piste.querySelectorAll(".piste-fond").length,
    ordre: tuiles
      .slice()
      .sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left))
      .map(t => ({
        id: t.dataset.id,
        gauche: parseFloat(t.style.left),
        aJoue: t.classList.contains("a-joue"),
        opacite: parseFloat(getComputedStyle(t).opacity).toFixed(2),
        scintille: !!t.querySelector(".piste-scintillement"),
        initiative: (t.querySelector("span") || {}).innerText,
        couleurTexte: t.querySelector("span") ? getComputedStyle(t.querySelector("span")).color : null,
        couleurBordure: t.querySelector('div[style*="border-radius: 50%"][style*="z-index: 3"]')
          ? getComputedStyle(t.querySelector('div[style*="border-radius: 50%"][style*="z-index: 3"]')).borderTopColor
          : null,
        couleurFond: t.querySelector('div[style*="border-radius: 50%"][style*="z-index: 3"]')
          ? getComputedStyle(t.querySelector('div[style*="border-radius: 50%"][style*="z-index: 3"]')).backgroundColor
          : null,
        jauges: t.querySelectorAll('div[style*="rotate(30deg)"], div[style*="rotate(-30deg)"]').length,
        etats: t.querySelectorAll('img[src*="upload"]').length - (t.querySelector("img[src*='IMG_2137']") ? 1 : 0),
        rond: !!t.querySelector('div[style*="border-radius: 50%"][style*="overflow: hidden"]'),
        largeur: t.getBoundingClientRect().width
      }))
  };
});

await monde();

const lire = (f) => { try { return fs.readFileSync(path.join(RACINE, f), 'utf-8'); } catch (e) { return ""; } };
const section = async (f) => { try { await f(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 180)); } };
const { construireEtatCombat, creerDes, encaisserBouclier } = await import(path.join(RACINE, 'combat_etat.js'));
const MP = await import(path.join(RACINE, 'moteur_pur.js'));
const MV = await import(path.join(RACINE, 'mouvement_pur.js'));
const PC = await import(path.join(RACINE, 'pont_combat.js'));

// Un héros (armure 40 % physique et magique) attaqué par une goule.
const fiche = (id, extra) => ({ idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Critique: 0,
  Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
const coupDeGoule = (bouclier, attaque) => {
  const etat = construireEtatCombat({ idPartie: "P1", cerveau: "P_03", graine: 5,
    combattants: [fiche("H1", { camp: "Allié", idJoueur: "P_03", Def_Physique: 40, Def_Magique: 40, Bouclier_Actuel: bouclier }), fiche("M1", { camp: "Ennemi", estMonstre: true, nom: "Goule" })],
    positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } },
    partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["M1", "H1"], File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "C2" }] } });
  etat.combattants.H1.bouclier = bouclier; etat.combattants.H1.bouclierMax = bouclier;
  const action = { type: "carte", idLanceur: "M1", idCarte: "C2", attaques: [{ cibles: ["H1"], ...attaque }], alterations: [] };
  action.jets = MP.tirerDesCarte(etat, action, "M1", false, creerDes(5));
  const r = MP.resoudreCarte(etat, action);
  const h = r.etat.combattants.H1;
  return { pv: h.pv, bouclier: h.bouclier, etape: r.etapes.find(e => e.type === "degats" && e.cible === "H1") || {} };
};

console.log("\n1. LE BOUCLIER MAGIQUE PREND LE COUP ENTIER (L'ARMURE NE JOUE QUE SUR LE SURPLUS)");
await section(async () => {
  let r = coupDeGoule(0, { nom: "Griffes", valeurBrute: 30, typeRes: "Physique" });
  verifier("sans bouclier : l'armure (40 %) réduit le coup, 30 → 18", r.pv === 42 && r.etape.montant === 18, JSON.stringify(r));
  r = coupDeGoule(50, { nom: "Griffes", valeurBrute: 30, typeRes: "Physique" });
  verifier("un bouclier de 50 : il prend le coup ENTIER, sans l'armure (50 → 20), la vie intacte", r.bouclier === 20 && r.pv === 60 && r.etape.montant === 30 && r.etape.surBouclier === 30, JSON.stringify(r));
  r = coupDeGoule(50, { nom: "Trait d'ombre", valeurBrute: 30, typeRes: "Magique" });
  verifier("…de même pour la magie (la résistance magique ne joue pas sur le bouclier)", r.bouclier === 20 && r.pv === 60, JSON.stringify(r));
  r = coupDeGoule(20, { nom: "Griffes", valeurBrute: 30, typeRes: "Physique" });
  verifier("un bouclier de 20 se brise : le surplus (10), réduit par l'armure (6), ÷ 2 → la vie perd 3", r.bouclier === 0 && r.pv === 57 && r.etape.surBouclier === 20 && r.etape.bouclierBrise, JSON.stringify(r));
  const e = encaisserBouclier(20, 30, 0.4), e0 = encaisserBouclier(20, 30);
  verifier("encaisserBouclier : avec l'armure (0,4) 20 / 3 ; sans armure donnée, la règle d'avant (20 / 5)", e.surBouclier === 20 && e.versPv === 3 && e0.versPv === 5, JSON.stringify({ e, e0 }));
  // L'écran (v404) : la vie dit ce qu'elle perd, le bouclier ce qu'il encaisse.
  const etat = construireEtatCombat({ idPartie: "G", cerveau: "P_03", graine: 4, combattants: [fiche("H1", { camp: "Allié", idJoueur: "P_03" }), fiche("M1", { camp: "Ennemi", estMonstre: true })],
    positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } }, partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"], File_Attente_Combat: [] } });
  etat.combattants.H1.bouclier = 20; etat.combattants.H1.bouclierMax = 20;
  const vu = PC.misEnScene({ type: "degats", cible: "H1", acteur: "M1", montant: 30, surBouclier: 20, bouclierBrise: true, bouclierApres: 0, pvApres: 57 }, etat);
  verifier("à l'écran : « -3 » sur la vie, « Bouclier brisé ! -20 🛡️ » sur le dôme", vu.texte === "-3" && vu.reaction.texte === "Bouclier brisé ! -20 🛡️", JSON.stringify({ t: vu.texte, r: vu.reaction.texte }));
  // Les autres coups qui frappent un bouclier : l'opportunité, la zone.
  const op = (() => {
    const s = construireEtatCombat({ idPartie: "G", cerveau: "P_03", graine: 4, combattants: [fiche("H1", { camp: "Allié", idJoueur: "P_03", Def_Physique: 50 }), fiche("M1", { camp: "Ennemi", estMonstre: true })],
      positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } }, partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"], File_Attente_Combat: [] } });
    s.combattants.H1.bouclier = 20; s.combattants.H1.bouclierMax = 20;
    const coup = { attaquant: "M1", cible: "H1", brut: 8, montant: 4 };
    const etapes = MV.infligerOpportunite(s, "H1", "M1", coup, { q: 0, r: 0 });
    const d = etapes.find(x => x.type === "degats") || {};
    return { bouclier: s.combattants.H1.bouclier, pv: s.combattants.H1.pv, montant: d.montant, sur: d.surBouclier };
  })();
  verifier("l'attaque d'opportunité (8, armure 50 %) : le bouclier prend les 8 entiers", op.bouclier === 12 && op.pv === 60 && op.montant === 8 && op.sur === 8, JSON.stringify(op));
  const s = lire("moteur_pur.js");
  verifier("les zones et l'impact cinétique suivent la même règle (le coup entier, l'armure en paramètre)",
    /encaisserBouclier\(cible\.bouclier, montant, part\)/.test(s) && /encaisserBouclier\(c\.bouclier, montant, reduction\)/.test(s));
  r = coupDeGoule(20, { nom: "Morsure étalée", valeurBrute: 30, typeRes: "Physique", estEtalement: true, toursEtalement: 2 });
  verifier("un coup étalé garde sa règle : rien au lancement (ses parts tombent en fin de manche)", r.bouclier === 20 && r.pv === 60, JSON.stringify(r));
});

console.log("\n2. L'ARCANE FAIT FACE À LA RÉSISTANCE MAGIQUE (PAS DE DÉGÂTS BRUTS)");
await section(async () => {
  const r = coupDeGoule(0, { nom: "Attaque magique", valeurBrute: 30, typeRes: "Magique", element: "Arcane", etatElement: null });
  verifier("une attaque magique d'arcane (30) contre 40 % de résistance magique : 18", r.pv === 42 && r.etape.montant === 18, JSON.stringify(r));
  verifier("…ni brute, ni « mentale » : un coup magique (chiffre bleu)", r.etape.nature === "magique" && !r.etape.brut, JSON.stringify(r.etape));
  const c = MP.chaineDeDegats({ pv: 60, pvMax: 60, bouclier: 0, etats: [], def: { magique: 40 }, resistances: ["Brûlé", "Glacé", "Électrifié"] },
    { valeurBrute: 30, typeRes: "Magique", element: "Arcane", etatElement: null }, {});
  verifier("…et aucune résistance d'élément ne la réduit davantage (l'arcane n'en a pas)", c.degats === 18 && !c.resiste, JSON.stringify(c));
  const effets = lire("moteur_effets.js");
  verifier("la carte : une « attaque magique » est Magique, et seule la Distorsion mentale frappe brut",
    /const typeRes = \(nomLower\.includes\("magique"\)[^\n]*\n\s*\? "Magique" : "Physique";/.test(effets)
    && /estDistorsionNom\(effBase\.Nom\) && !isHeal \? \{ distorsion: true, brut: true \}/.test(effets) && !/element === "Arcane"[^\n]*brut/.test(effets));
  verifier("(le Briseur d'arcane du Chasseur de mages reste brut, voulu : 1,5 × la résistance magique)", /nom: "Briseur d'arcane", typeRes: "Magique", brut: true/.test(lire("moteur_pur.js")));
});

console.log("\n3. LA MISE À TERRE D'UNE CRÉATURE, COMME CELLE D'UN HÉROS");
await section(async () => {
  verifier("(la règle de mort recopiée ci-dessous est bien celle de combat.js)", lire("combat.js").includes('return p.statut === "Mort" || (pvMax > 0 && pv <= 0);'));
  verifier("le statut fait partie des champs que le cerveau tient (pont_combat.js)", /"statut"\s*\n?\s*\];/.test(lire("pont_combat.js")) || /CHAMPS_COMBAT_PROTEGES = \[[\s\S]*"statut"[\s\S]*?\];/.test(lire("pont_combat.js")));
  const r = await p.evaluate(async () => {
    const out = {};
    const PC = window.pontCombat;
    // (le plateau de piste_initiative.mjs remplace estCombattantMort : on remet la vraie règle, combat.js)
    window.estCombattantMort = function(idCombattant) {
        const p = (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === idCombattant);
        if (!p) return false;
        const pvMax = window.pvMaxCombattant(p);
        const pv = parseInt(p.PV_Actuels) || 0;
        if (p.statut !== "Mort" && p.sursis && (parseInt(p.sursis.tours) || 0) > 0) return false;
        return p.statut === "Mort" || (pvMax > 0 && pv <= 0);
    };
    const redessiner = () => window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    const fiche = (id) => window.PERSOS_PARTIE.find(f => f.idPersonnage === id);
    // Le cerveau tient le combat : M1 et H1 sont à lui.
    const cerveau = { M1: { id: "M1" }, H1: { id: "H1" } };
    // 1. Le cerveau vient de publier : la goule M1 tombe. Son document revient « Mort »
    //    (marquerMonstreMort) AVANT que l'écran n'ait rejoué le coup.
    const fraiches = window.PERSOS_PARTIE.map(f => f.idPersonnage === "M1" ? { ...f, statut: "Mort" } : { ...f });
    window.PERSOS_PARTIE = PC.fusionnerFichesCombat(fraiches, window.PERSOS_PARTIE, cerveau);
    redessiner();
    out.statutGarde = fiche("M1").statut;
    out.pionLa = !!document.getElementById("token-M1");
    // 2. L'écran rejoue le coup qui abat (la vie à zéro, « chute ») puis la projection l'applique.
    await window.animerReactionCombat({ sorte: "coup-physique", pion: "M1", depuis: "H1", chute: true });
    fiche("M1").PV_Actuels = 0; fiche("M1").statut = "Inconscient";
    redessiner();
    out.retenu = !!document.getElementById("token-M1");
    // 3. La chute : la mise à terre se joue sur le pion.
    out.ko = await window.animerReactionCombat({ sorte: "ko", pion: "M1", depuis: "H1" });
    const el = document.getElementById("token-M1");
    out.cache = !!el && getComputedStyle(el).opacity === "0";
    // L'ANCIEN CHEMIN, pour mémoire : le statut « Mort » arrivé tel quel retirait le pion avant la chute.
    const g = fiche("M2");
    g.statut = "Mort"; redessiner();
    out.avant = { pion: !!document.getElementById("token-M2"), ko: await window.animerReactionCombat({ sorte: "ko", pion: "M2", depuis: "H1" }) };
    return out;
  });
  verifier("le cerveau publie « Mort » avant le rejeu : la fiche garde son statut de combat (le pion reste)", r.statutGarde === "Vivant" && r.pionLa, JSON.stringify(r));
  verifier("le coup qui abat la retient sur le plateau, la vie à zéro", r.retenu, JSON.stringify(r));
  verifier("…et elle s'effondre : la mise à terre se joue (« À terre ! »), puis le pion s'efface", r.ko === true && r.cache, JSON.stringify(r));
  verifier("(sans ce correctif, le statut « Mort » arrivé tel quel retirait le pion : pas de mise à terre)", r.avant.pion === false && r.avant.ko === false, JSON.stringify(r.avant));
});

console.log("\n4. LA VERSION");
await section(async () => {
  const v = JSON.parse(lire("version.json")).version;
  verifier("version.json et VERSION_IVALIS d'accord (405 ou plus)", v >= 405 && new RegExp("VERSION_IVALIS = " + v + ";").test(lire("trace_combat.js")), String(v));
  const html = lire("index.html");
  verifier("index.html charge les nouvelles versions (combat_etat 63, moteur_pur 87, mouvement_pur 29, pont_combat 60 — table d'import comprise)",
    (html.match(/combat_etat\.js\?v=63/g) || []).length === 2 && (html.match(/moteur_pur\.js\?v=(8[7-9]|9\d)/g) || []).length === 2
    && (html.match(/mouvement_pur\.js\?v=29/g) || []).length === 2 && (html.match(/pont_combat\.js\?v=60/g) || []).length === 2);
  verifier("pas d'erreur dans la page", !erreurs.length, erreurs.slice(0, 3).join(" | "));
});

await b.close(); serveur.close();
console.log(echecs ? `\n${echecs} CONTRÔLE(S) EN ÉCHEC` : "\nTOUS LES CONTRÔLES PASSENT");
process.exit(echecs ? 1 : 0);
