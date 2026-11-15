// v403 — LA LUEUR DE LA PISTE QUI RESPIRE ; LA SÉPARATION SOUS « CHARGER PARTIE » ;
// L'AURA DU LEADER EN ORANGE. Nico : « sur la piste d'initiative, celui à qui c'est de
// jouer, son token clignote en doré : fais que l'animation soit fluide, en fondu
// apparition / disparition, comme si ça respirait » ; « sur la page principale, sous
// Charger partie, une belle séparation (la même que sous « le jeu de rôle ») » ;
// « l'effet autour du token du leader, mets-le en orange plutôt que rouge ».
// (La mise en place : celle de piste_initiative.mjs — la vraie page, la vraie piste.)
//
// Lancer : node tests_monstres/corrections_v403.mjs
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

console.log("\n1. LA LUEUR DE CELUI QUI JOUE : UNE RESPIRATION, PLUS UN CLIGNOTEMENT");
await section(async () => {
  const file = [{ idPersonnage: "H1", initiative: 30 }, { idPersonnage: "M1", initiative: 20 }, { idPersonnage: "H2", initiative: 10 }];
  await manche(2, ...file);
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const lueur = document.querySelector('.piste-tuile[data-id="H1"] .piste-scintillement');
    window.__lueur = lueur;
    const st = lueur ? getComputedStyle(lueur) : null;
    const anim = lueur && lueur.getAnimations ? lueur.getAnimations()[0] : null;
    const images = anim ? anim.effect.getKeyframes().map(k => ({ o: +k.offset.toFixed(2), op: Number(k.opacity) })) : [];
    return { existe: !!lueur, nom: st && st.animationName, duree: st && st.animationDuration, sens: st && st.animationDirection, rythme: st && st.animationTimingFunction,
             delai: lueur ? lueur.style.animationDelay : "", images };
  });
  verifier("la lueur dorée est sous celui qui joue", r.existe, JSON.stringify(r));
  verifier("…une respiration lente (3,2 s), sans aller-retour sec ni à-coup (ease-in-out)", r.nom === "scintillementPiste" && r.duree === "3.2s" && r.sens === "normal" && r.rythme === "ease-in-out", JSON.stringify(r));
  const debut = r.images.find(k => k.o === 0), milieu = r.images.find(k => k.o === 0.5), fin = r.images.find(k => k.o === 1);
  verifier("…elle naît presque de rien, s'épanouit, puis s'efface en fondu (0,08 → 0,9 → 0,08)", !!debut && !!milieu && !!fin && debut.op < 0.15 && milieu.op > 0.8 && fin.op === debut.op, JSON.stringify(r.images));
  verifier("…et reprend où en est la respiration (sa phase suit l'horloge)", /^-\d+(\.\d+)?s$/.test(r.delai), r.delai);
  // La piste se redessine à chaque nouvelle : la lueur ne doit plus être recréée (c'était le clignotement).
  const garde = await p.evaluate(async () => {
    const avant = window.__lueur;
    for (let i = 0; i < 6; i++) { window.afficherPisteInitiative(window.PARTIE_DATA.File_Attente_Combat, "Resolution"); await new Promise(r => setTimeout(r, 40)); }
    const apres = document.querySelector('.piste-tuile[data-id="H1"] .piste-scintillement');
    const a = apres && apres.getAnimations ? apres.getAnimations()[0] : null;
    return { meme: avant === apres, temps: a ? a.currentTime : null };
  });
  verifier("six redessins de la piste : la même lueur, jamais recréée (plus de saut)", garde.meme, JSON.stringify(garde));
  // Un vrai changement (un état qui arrive) recrée la tuile : la lueur reprend en phase, pas à zéro.
  const phase = await p.evaluate(async () => {
    window.PERSOS_PARTIE[0].Etats_Alteres = [{ nom: "Brûlé", duree: 2 }];
    window.afficherPisteInitiative(window.PARTIE_DATA.File_Attente_Combat, "Resolution");
    const l = document.querySelector('.piste-tuile[data-id="H1"] .piste-scintillement');
    const a = l && l.getAnimations ? l.getAnimations()[0] : null;
    const attendu = performance.now() % 3200;
    // (où en est la respiration : la progression de l'animation, son décalage compris)
    const t = a ? (a.effect.getComputedTiming().progress || 0) * 3200 : -1;
    window.PERSOS_PARTIE[0].Etats_Alteres = [];
    return { neuve: l !== window.__lueur, ecart: Math.min(Math.abs(t - attendu), 3200 - Math.abs(t - attendu)) };
  });
  verifier("un état qui arrive recrée la lueur : elle reprend en phase (pas de retour à zéro)", phase.neuve && phase.ecart < 120, JSON.stringify(phase));
  await tourSuivant();
  const suivant = await p.evaluate(() => ({ h1: !!document.querySelector('.piste-tuile[data-id="H1"] .piste-scintillement'), m1: !!document.querySelector('.piste-tuile[data-id="M1"] .piste-scintillement') }));
  verifier("le tour passe : la lueur passe au suivant", !suivant.h1 && suivant.m1, JSON.stringify(suivant));
});

console.log("\n2. L'AURA DU LEADER : ORANGE, PLUS ROUGE");
await section(async () => {
  const r = await p.evaluate(() => {
    const html = window.auraLeader().innerHTML.toLowerCase();
    const couleurs = [...new Set(html.match(/#[0-9a-f]{6}/g) || [])];
    // Une teinte « rouge » : un rouge fort, presque pas de vert.
    const teinte = (c) => { const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16); return { r, g, b }; };
    const rouges = couleurs.filter(c => { const t = teinte(c); return t.r > 150 && t.g < 60 && t.b < 60; });
    const oranges = couleurs.filter(c => { const t = teinte(c); return t.r > 180 && t.g >= 80 && t.g <= 200 && t.b < 120; });
    return { couleurs, rouges, oranges };
  });
  verifier("plus aucune teinte rouge dans l'aura", !r.rouges.length, JSON.stringify(r.rouges));
  verifier("…des teintes orange à la place (feu, fumée, anneau, éclats)", r.oranges.length >= 8, JSON.stringify(r.couleurs));
  verifier("…le même dessin, la même transparence (60 %, style.css)", /\.aura-leader \{[^}]*opacity: 0\.6;/.test(lire("style.css")));
});

console.log("\n3. LA SÉPARATION SOUS « CHARGER PARTIE » (LE JOURNAL)");
await section(async () => {
  await p.evaluate(() => { if (typeof window.afficherGrimoire === "function") window.afficherGrimoire(); });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    const charger = document.getElementById("grimoire-btn-charger");
    const sep = charger && charger.nextElementSibling;
    const titre = document.querySelector("#grimoire-page-1 .fleuron");
    return { existe: !!sep && sep.classList.contains("fleuron-journal"), suivant: sep && sep.nextElementSibling ? sep.nextElementSibling.id : "",
             meme: !!sep && !!titre && sep.innerHTML.replace(/\s+/g, " ").trim() === titre.innerHTML.replace(/\s+/g, " ").trim() };
  });
  verifier("un fleuron juste sous « Charger partie », avant « Paramètres »", r.existe && r.suivant === "grimoire-btn-parametres", JSON.stringify(r));
  verifier("…le même que sous « le jeu de rôle » (page de titre)", r.meme, JSON.stringify(r));
});

console.log("\n4. LA VERSION");
await section(async () => {
  const v = JSON.parse(lire("version.json")).version;
  verifier("version.json et VERSION_IVALIS d'accord (403)", v === 403 && new RegExp("VERSION_IVALIS = " + v + ";").test(lire("trace_combat.js")), String(v));
  const html = lire("index.html");
  verifier("index.html charge les nouvelles versions", /src="combat\.js\?v=183"/.test(html) && /grimoire\.js\?v=34"/.test(html) && /grimoire\.css\?v=24"/.test(html) && /style\.css\?v=149"/.test(html));
  verifier("pas d'erreur dans la page", !erreurs.length, erreurs.slice(0, 3).join(" | "));
});

await b.close(); serveur.close();
console.log(echecs ? `\n${echecs} CONTRÔLE(S) EN ÉCHEC` : "\nTOUS LES CONTRÔLES PASSENT");
process.exit(echecs ? 1 : 0);
