// v241 — LA CARTE DU MONDE FIXE, ET CINQ CORRECTIONS DU COMBAT.
//
// Nico :
//  « La map monde en arrière-plan, quand on arrive après le charger partie,
//    j'aimerais qu'elle soit fixe en plein écran, qu'on ne puisse plus zoomer
//    ou dézoomer, que la hauteur de l'image soit toujours fixée à l'écran ; en
//    largeur, qu'on puisse faire glisser la map à droite ou à gauche si elle
//    n'est pas affichée en entier, avec un clic souris maintenu ou le doigt
//    sur iPad ; et si la map ne rentre pas en entier, la positionner toujours
//    par défaut le plus à gauche possible. »
//  « Un bug avec mon personnage Vampire Ankylar : le coût de tous mes
//    déplacements à 6, mais au moment de le faire, décompté normalement. »
//  « Mes bannières de compétences sont grisées alors que j'ai la fatigue
//    requise (même si je peux les sélectionner) — l'état se rafraîchit
//    peut-être avant l'animation du gain de fatigue de fin de tour ? »
//  « Une compétence avec surpuissance : il ne l'a pas prise en compte car
//    c'est mis en DOT. »
//  « Des états affichés en bulle sur le token, mais pas en image sous le
//    portrait de la piste d'initiative pour nous expliquer à quoi ça
//    correspond. »
//  « Un cheat : +20 % à tous les effets des sorts des monstres après leur
//    création (donc pas dans la fatigue). »
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(76)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

console.log("\n=========================================================");
console.log("  v241 — CARTE DU MONDE, CASES, BANNIÈRES, SURPUISSANCE, ÉTATS, TRICHE");
console.log("=========================================================");

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
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async (ref) => { const d = (window.__docs || {})[ref.chemin]; return { exists: () => !!d, data: () => d || {} }; };
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data }); };
  export const updateDoc = async () => {};
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
// Une carte du monde factice, à la taille de la vraie (3840 × 2160) : graduée,
// pour que la capture montre le calage (bord gauche, hauteur pleine).
const CARTE_FACTICE = `<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2160" viewBox="0 0 3840 2160">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#7a9a5a"/><stop offset="0.5" stop-color="#c8b27a"/><stop offset="1" stop-color="#5a7fa0"/></linearGradient></defs>
  <rect width="3840" height="2160" fill="url(#g)"/>
  ${Array.from({ length: 16 }, (_, i) => `<line x1="${i * 256}" y1="0" x2="${i * 256}" y2="2160" stroke="#3b2a1a" stroke-width="6" opacity="0.35"/>`).join("")}
  <rect x="8" y="8" width="3824" height="2144" fill="none" stroke="#8b0000" stroke-width="16"/>
  <text x="60" y="260" font-size="200" font-family="serif" fill="#3b2a1a">◀ BORD GAUCHE</text>
  <text x="3780" y="260" font-size="200" font-family="serif" fill="#3b2a1a" text-anchor="end">BORD DROIT ▶</text>
  <text x="60" y="2100" font-size="120" font-family="serif" fill="#3b2a1a">bas de la carte</text>
</svg>`;
const EFFETS = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/effets_reels.json', 'utf-8'));
const EFFETS_PAR_ID = Object.fromEntries((Array.isArray(EFFETS) ? EFFETS : Object.values(EFFETS)).map(e => [e.id, e]));
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.request().url().includes('map_wx8s89')
  ? r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'}, body: CARTE_FACTICE })
  : r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
                body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#5a3a20"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

console.log("\n1. LA CARTE DU MONDE : FIXE, HAUTEUR CALÉE, GLISSE EN LARGEUR");
{
  // L'écran du jeu, seul à l'écran (comme après « Charger partie »).
  await p.evaluate(() => {
    window.__ecransCaches = [];
    document.querySelectorAll("body > div").forEach(d => {
      if (d.id === "ecran-jeu") return;
      if (getComputedStyle(d).display !== "none") { window.__ecransCaches.push([d, d.style.display]); d.style.display = "none"; }
    });
    document.getElementById("ecran-jeu").style.display = "block";
    // (v275) Le fanion et sa grille ne sont plus : une cible posée sur la
    // carte reçoit le clic à leur place (une région, le pion du groupe).
    window.__grille = 0;
    const cible = document.createElement("div");
    cible.id = "__cible-clic-carte";
    cible.style.cssText = "position:absolute;left:0;top:0;width:3840px;height:2160px;";
    cible.addEventListener("click", () => { window.__grille++; });
    document.getElementById("carte-fond-jeu").appendChild(cible);
  });
  const lire = () => p.evaluate(() => {
    const c = typeof window.cadrageCarteMonde === "function" ? window.cadrageCarteMonde() : null;
    const carte = document.getElementById("carte-fond-jeu");
    const r = carte.getBoundingClientRect();
    const h = typeof window.hauteurDalle === "function" ? window.hauteurDalle() : innerHeight;
    return { c, gauche: Math.round(r.left), haut: Math.round(r.top), largeur: Math.round(r.width), hauteur: Math.round(r.height), ecranH: h, ecranL: innerWidth,
             glissable: document.getElementById("conteneur-carte-fond").classList.contains("carte-glissable") };
  });
  // Les gestes, donnés au conteneur (souris, molette, doigts).
  const geste = (type, args) => p.evaluate(({ type, args }) => {
    const cont = document.getElementById("conteneur-carte-fond");
    const fen = (t, x) => window.dispatchEvent(new MouseEvent(t, { clientX: x, clientY: 400, bubbles: true }));
    if (type === "molette") cont.dispatchEvent(new WheelEvent("wheel", { deltaY: args.dy || 0, deltaX: args.dx || 0, ctrlKey: !!args.ctrl, clientX: 500, clientY: 400, bubbles: true, cancelable: true }));
    if (type === "glisser") {
      cont.dispatchEvent(new MouseEvent("mousedown", { clientX: args.de, clientY: 400, button: 0, bubbles: true }));
      (args.par || []).forEach(x => fen("mousemove", x));
      fen("mousemove", args.vers);
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: args.vers, clientY: 400, bubbles: true }));
    }
    if (type === "doigts") {
      const t = (id, x, y) => new Touch({ identifier: id, target: cont, clientX: x, clientY: y });
      const ev = (nom, touches) => cont.dispatchEvent(new TouchEvent(nom, { touches, changedTouches: touches, bubbles: true, cancelable: true }));
      if (args.pincer) {
        ev("touchstart", [t(1, 500, 400), t(2, 600, 400)]);
        ev("touchmove", [t(1, 400, 400), t(2, 700, 400)]);
        ev("touchend", []);
      } else {
        ev("touchstart", [t(1, args.de, 400)]);
        ev("touchmove", [t(1, (args.de + args.vers) / 2, 400)]);
        ev("touchmove", [t(1, args.vers, 400)]);
        ev("touchend", []);
      }
    }
    if (type === "clicFanion") document.getElementById("__cible-clic-carte").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, { type, args: args || {} });

  await p.evaluate(() => window.recadrerCarte());
  const r0 = await lire();
  const zoomAttendu = r0.ecranH / 2160;
  verifier("calée à gauche : bord gauche de la carte au bord de l'écran", r0.gauche === 0 && r0.c && r0.c.panX === 0, JSON.stringify(r0));
  verifier("la hauteur de l'image = la hauteur de l'écran", Math.abs(r0.hauteur - r0.ecranH) <= 1 && r0.haut === 0
           && r0.c && Math.abs(r0.c.zoom - zoomAttendu) < 1e-9, `${r0.hauteur} / ${r0.ecranH}`);
  verifier("iPad : plus large que l'écran, elle glisse (la main au survol)", r0.largeur > r0.ecranL && r0.glissable, `${r0.largeur} > ${r0.ecranL}`);
  await p.screenshot({ path: "/tmp/claude-0/v241_carte_ipad.png" });

  await geste("molette", { dy: 120 });
  const r1 = await lire();
  verifier("la molette ne zoome plus : elle fait glisser (120 px)", r1.c && Math.abs(r1.c.zoom - zoomAttendu) < 1e-9 && r1.c.panX === -120 && r1.haut === 0,
           JSON.stringify(r1.c));
  await geste("molette", { dy: -500, ctrl: true });
  const r1b = await lire();
  verifier("ctrl + molette (le zoom du navigateur) : rien ne bouge", r1b.c && r1b.c.panX === -120 && Math.abs(r1b.c.zoom - zoomAttendu) < 1e-9);

  await p.evaluate(() => window.recadrerCarte());
  await geste("glisser", { de: 700, par: [650, 600], vers: 500 });
  const r2 = await lire();
  verifier("clic maintenu et glissé de 200 px vers la gauche : −200, pas en hauteur", r2.c && r2.c.panX === -200 && r2.c.panY === 0 && r2.haut === 0,
           JSON.stringify(r2.c));
  await geste("glisser", { de: 900, vers: -3000 });
  const r3 = await lire();
  const min = r3.ecranL - Math.round(3840 * zoomAttendu);
  verifier("trop loin à gauche : le bord droit s'arrête au bord de l'écran", r3.c && Math.abs(r3.gauche + r3.largeur - r3.ecranL) <= 1, `${r3.gauche} + ${r3.largeur} vs ${r3.ecranL}`);
  await geste("glisser", { de: 100, vers: 4000 });
  const r4 = await lire();
  verifier("trop loin à droite : le bord gauche s'arrête au bord de l'écran", r4.c && r4.c.panX === 0 && r4.gauche === 0, JSON.stringify(r4.c));

  // Un glissé qui se termine sur la carte (une région, le pion) ne vaut pas un clic.
  await geste("glisser", { de: 600, vers: 450 });
  await geste("clicFanion");
  const apresGlisse = await p.evaluate(() => window.__grille);
  await geste("clicFanion");
  const apresClic = await p.evaluate(() => window.__grille);
  verifier("le clic qui finit un glissé ne vaut pas un clic ; un vrai clic, si", apresGlisse === 0 && apresClic === 1, `${apresGlisse} / ${apresClic}`);
  await p.evaluate(() => document.getElementById("__cible-clic-carte").remove());

  await p.evaluate(() => window.recadrerCarte());
  await geste("doigts", { de: 600, vers: 450 });
  const r5 = await lire();
  verifier("au doigt (iPad) : glissé de 150 px", r5.c && r5.c.panX === -150 && r5.c.panY === 0, JSON.stringify(r5.c));
  await geste("doigts", { pincer: true });
  const r6 = await lire();
  verifier("pincer à deux doigts : plus de zoom", r6.c && Math.abs(r6.c.zoom - zoomAttendu) < 1e-9 && r6.c.panX === -150, JSON.stringify(r6.c));

  // Un écran plus large que la carte : centrée, immobile.
  await p.setViewportSize({ width: 2400, height: 834 });
  await p.waitForTimeout(450);
  const r7 = await lire();
  verifier("écran plus large que la carte : hauteur pleine, centrée, ne glisse pas",
           Math.abs(r7.hauteur - r7.ecranH) <= 1 && Math.abs(r7.gauche - (r7.ecranL - r7.largeur) / 2) <= 1 && !r7.glissable, JSON.stringify(r7));
  await geste("glisser", { de: 900, vers: 500 });
  const r8 = await lire();
  verifier("…et le glissé n'y fait rien", r8.gauche === r7.gauche);
  // Retour à l'iPad, tourné : toujours calée, toujours entre ses bornes.
  await p.setViewportSize({ width: 1194, height: 834 });
  await p.waitForTimeout(450);
  const r9 = await lire();
  verifier("retour à l'iPad (redimensionnement) : hauteur calée, aucun vide sur les côtés",
           Math.abs(r9.hauteur - r9.ecranH) <= 1 && r9.gauche <= 0 && r9.gauche + r9.largeur >= r9.ecranL - 1, JSON.stringify(r9));
  // Un écran PC 1920 × 1080 : la carte fait 1920 de large, pile.
  await p.setViewportSize({ width: 1600, height: 1000 });
  await p.waitForTimeout(450);
  await p.evaluate(() => window.recadrerCarte());
  const r10 = await lire();
  verifier("PC 1600 × 1000 : hauteur calée, calée à gauche", Math.abs(r10.hauteur - r10.ecranH) <= 1 && r10.gauche === 0, JSON.stringify(r10));
  await p.setViewportSize({ width: 1194, height: 834 });
  await p.waitForTimeout(450);
  await p.evaluate(() => {
    (window.__ecransCaches || []).forEach(([d, s]) => { d.style.display = s; });
    document.getElementById("ecran-jeu").style.display = "none";
  });
}

await p.evaluate(async (EFFETS) => {
  window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
  window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
}, EFFETS_PAR_ID);

console.log("\n2. LE VAMPIRE ANKYLAR : LE PRIX DES CASES APRÈS UN COMBAT");
{
  const r = await p.evaluate(() => {
    document.getElementById("fenetre-combat").style.display = "block";
    window.PLATEAU_VTT = { getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
                           hexToPixel: (q, r) => ({ x: q * 60, y: r * 60 }) };
    window.afficherMessageFlottantHex = () => {};
    const poser = (memoire) => {
      window.TOKENS_VTT_DATA = { V: { q: 0, r: 0 } };
      window.PERSOS_PARTIE = [{ idPersonnage: "V", idJoueur: "NICO", camp: "Allié", prenom: "Vlad", race: "Ankylar", classe: "Vampire", xp: 2500,
        PV_Max: 42, PV_Actuels: 42, Fatigue_Max: 100, fatigueActuelle: 100, Etats_Alteres: [] }];
      window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
      window.COMBAT_INDEX_PERSO = 0;
      window.TOKEN_SELECTIONNE = "V";
      window.COMBAT_FATIGUE_ACTUELLE = 100;
      window.COUT_COMPETENCE_SELECTIONNEE = 0;
      window.CHEMIN_MOUVEMENT = [];
      window.CHEMIN_START_NODE = { q: 0, r: 0 };
      window.MOUVEMENT_COUT_TOTAL = 0;
      window.PAS_PARCOURUS_TOUR = memoire;
      // Un NOUVEAU combat : manche 1, rien de marché en base.
      window.PARTIE_DATA = { Tour_Combat: 1, Phase_Combat: "Resolution",
        File_Attente_Combat: [{ idPersonnage: "V", idCarte: "C1", pasParcourus: 0 }] };
    };
    const tracer = (n) => { for (let i = 1; i <= n; i++) window.ajouterEtapeMouvement(i, 0); return window.CHEMIN_MOUVEMENT.map(e => e.cost); };
    // Le combat d'avant, manche 1 : 7 cases marchées (copie locale, il y a une minute).
    poser({ id: "V", tour: 1, pas: 7, quand: Date.now() - 60000 });
    const apresAncien = tracer(4);
    // L'ancienne forme de la copie (sans date) : elle n'est plus crue non plus.
    poser({ id: "V", tour: 1, pas: 7 });
    const sansDate = tracer(4);
    // Le même tour, la base pas encore revenue : la copie fraîche compte.
    poser({ id: "V", tour: 1, pas: 3, quand: Date.now() });
    const fraiche = tracer(2);
    // Un combat qui se ferme ou repart efface la copie.
    window.PAS_PARCOURUS_TOUR = { id: "V", tour: 1, pas: 7, quand: Date.now() };
    window.oublierLeCombatSurLesFiches();
    const oubliee = JSON.stringify(window.PAS_PARCOURUS_TOUR);
    return { apresAncien, sansDate, fraiche, oubliee };
  });
  verifier("nouveau combat, 7 cases marchées au précédent : 2, 2, 2, 4 (pas 6, 6, 6, 6)", r.apresAncien.join(",") === "2,2,2,4", r.apresAncien.join(","));
  verifier("une copie d'avant cette version (sans date) n'est plus crue", r.sansDate.join(",") === "2,2,2,4", r.sansDate.join(","));
  verifier("le même tour, la base en retard : la copie fraîche fait foi (4, 4)", r.fraiche.join(",") === "4,4", r.fraiche.join(","));
  verifier("un combat fermé ou réinitialisé efface la copie", /"pas":0/.test(r.oubliee) && /"id":null/.test(r.oubliee), r.oubliee);
}

console.log("\n3. LES BANNIÈRES : PLUS GRISES QUAND L'ÉNERGIE REVIENT");
{
  const r = await p.evaluate(async () => {
    document.getElementById("fenetre-combat").style.display = "block";
    const fiche = (fatigue) => ({ idPersonnage: "H1", idJoueur: "NICO", prenom: "Ilda", classe: "", xp: 0, couleur: "#335", camp: "Allié",
      deckEquipe: ["C1"], PV_Max: 50, PV_Actuels: 50, Fatigue_Max: 100, fatigueActuelle: fatigue, Etats_Alteres: [] });
    window.PERSOS_PARTIE = [fiche(10)];
    window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 } };
    window.CACHE_COMPETENCES_GLOBAL = { H1: { C1: { Nom: "Coup de lance", Arme: "", Initiative: 40, Fatigue: 30, Effets_Compiles: [] } } };
    window.COMPETENCES_CACHE = {};
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]]; window.COMBAT_INDEX_PERSO = 0;
    window.COMBAT_FATIGUE_ACTUELLE = 10;
    window.PARTIE_DATA = { Phase_Combat: "Preparation", File_Attente_Combat: [] };
    window.ID_PARTIE_COURANTE = "P";
    window.chargerCompetencesCombat("H1", "#335");
    await new Promise(r => setTimeout(r, 80));
    const ban = () => document.getElementById("combat-carte-C1");
    const couleur = () => getComputedStyle(ban().querySelector(".texte-nom-banniere")).color;
    const avant = { grise: ban().classList.contains("banniere-epuisee"), couleur: couleur() };
    // Le gain d'énergie de fin de manche : la nouvelle fiche arrive (un
    // nouvel objet, comme chaque instantané), la liste du volet garde l'ancien.
    window.PERSOS_PARTIE = [fiche(80)];
    window.actualiserBannieresEpuisees();
    const apres = { grise: ban().classList.contains("banniere-epuisee"), couleur: couleur(),
                    style: ban().querySelector(".texte-nom-banniere").style.color };
    // Et l'énergie qui retombe la regrise.
    window.PERSOS_PARTIE = [fiche(5)];
    window.actualiserBannieresEpuisees();
    const regrise = { grise: ban().classList.contains("banniere-epuisee"), couleur: couleur() };
    return { avant, apres, regrise };
  });
  verifier("10 d'énergie pour une carte à 30 : grisée", r.avant.grise && r.avant.couleur === "rgb(136, 136, 136)", JSON.stringify(r.avant));
  verifier("80 d'énergie (fiche fraîche) : la bannière se rallume", !r.apres.grise, JSON.stringify(r.apres));
  verifier("…et son texte avec (plus de gris écrit en dur)", r.apres.couleur === "rgb(224, 208, 176)", JSON.stringify(r.apres));
  verifier("l'énergie retombe : regrisée", r.regrise.grise && r.regrise.couleur === "rgb(136, 136, 136)", JSON.stringify(r.regrise));
}

console.log("\n4. LA SURPUISSANCE D'UNE COMPÉTENCE EN DOT");
{
  // 8 crans d'Attaque Magique (80 de fatigue), étalés : 16 PC ÷ 1,3 → 61.
  const r = await p.evaluate(async () => {
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", camp: "Allié", prenom: "Ilda", classe: "", race: "Humain", xp: 0,
                              PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 200, fatigueActuelle: 200, Etats_Alteres: [], statut: "Vivant" },
                            { idPersonnage: "M1", camp: "Ennemi", prenom: "Gnoll", estMonstre: true, Palier: "Normal",
                              PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }];
    window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } };
    const act = (extra) => ({ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 8, mods: { EFF_DUREE_ETALEMENT_DEGATS: 1 }, zoneHexes: [],
                              baseDuree: 0, modsDuree: {}, element: "Feu", ...extra });
    window.COMPETENCES_CACHE = {
      // Une carte forgée AVANT v241 : sa fatigue réduite, rien d'autre.
      VIEILLE: { Nom: "Brasier lent", Arme: "Magie", Fatigue: 61, Initiative: 39, Composants: { actions: [act({})] }, Effets_Compiles: [] },
      // Une carte forgée depuis : sa puissance écrite.
      NEUVE: { Nom: "Brasier lent", Arme: "Magie", Fatigue: 61, Fatigue_Surpuissance: 80, Initiative: 39, Composants: { actions: [act({})] }, Effets_Compiles: [] },
      // La même sans étalement, à 61 : pas de surpuissance.
      SANS: { Nom: "Brasier", Arme: "Magie", Fatigue: 61, Initiative: 39, Composants: { actions: [act({ mods: {} , count: 6 })] }, Effets_Compiles: [] }
    };
    window.CACHE_COMPETENCES_GLOBAL = { H1: window.COMPETENCES_CACHE };
    const lire = async (id) => {
      const x = (await window.demarrerCiblage(id, { extraire: true, idLanceur: "H1" })) || {};
      const a = (x.attaques || [])[0] || {};
      return { v: a.valeurBrute, s: a.surpuissance || 1, etale: !!a.estEtalement };
    };
    return { vieille: await lire("VIEILLE"), neuve: await lire("NEUVE"), sans: await lire("SANS"),
             puissanceVieille: window.fatigueDeSurpuissance(window.COMPETENCES_CACHE.VIEILLE, window.PERSOS_PARTIE[0]),
             puissanceSans: window.fatigueDeSurpuissance(window.COMPETENCES_CACHE.SANS, window.PERSOS_PARTIE[0]) };
  });
  verifier("une carte d'avant, étalée (61 de fatigue, 80 avant l'étalement) : sa puissance relue = 80", r.puissanceVieille === 80, String(r.puissanceVieille));
  verifier("…elle frappe ×1,25 : 24 → 30, toujours étalée", r.vieille.v === 30 && r.vieille.s === 1.25 && r.vieille.etale, JSON.stringify(r.vieille));
  verifier("une carte forgée depuis (Fatigue_Surpuissance 80) : ×1,25 aussi", r.neuve.v === 30 && r.neuve.s === 1.25, JSON.stringify(r.neuve));
  verifier("sans étalement, à 61 : pas de surpuissance (6 × 3 = 18)", r.sans.v === 18 && r.sans.s === 1 && r.puissanceSans === 61, JSON.stringify(r.sans));

  // La Forge : la même carte, construite à la main.
  const f = await p.evaluate(async () => {
    window.__docs = { "Personnages/P1": { Classe: "", XP: 0, Race: "Humain" }, "Caracteristiques/P1": { Intelligence: 20, Sagesse: 12 } };
    document.getElementById("champ-id-personnage").value = "P1";
    window.OUVERTURE_FORGE_EN_COURS = false;
    await window.ouvrirCreationCompetence();
    window.forgeState.armePrincipale = "Magie";
    const eff = (id) => window.forgeState.effetsBDD.find(e => e.id === id);
    window.forgeState.actions = [{ idInst: "A", baseEffet: eff("EFF_ATTAQUE_MAGIQUE"), count: 8, mods: { EFF_DUREE_ETALEMENT_DEGATS: 1 },
                                   zoneHexes: [], baseDuree: 0, modsDuree: {}, element: "Feu" }];
    document.getElementById("forge-nom").value = "Brasier lent";
    window.rafraichirForge();
    const s = document.getElementById("forge-surpuissance");
    const ligne = document.querySelector("#forge-contenu-carte .forge-valeur-surpuissante");
    const bilan = { ...window.forgeState.bilan };
    window.__ecrits = [];
    await window.sauvegarderCompetence();
    const e = (window.__ecrits || []).find(x => /Competences/.test(x.chemin));
    return { fatigue: document.getElementById("forge-fatigue-val").textContent, active: s.classList.contains("active"), texte: s.textContent,
             ligne: ligne ? ligne.textContent : null, bilan, ecrit: e ? { Fatigue: e.data.Fatigue, Fatigue_Surpuissance: e.data.Fatigue_Surpuissance } : null };
  });
  verifier("la Forge : 61 de fatigue, et « Surpuissance ×1,25 … 80 avant l'étalement »",
           f.fatigue === "61" && f.active && /×1,25/.test(f.texte) && /80 avant l'étalement/.test(f.texte), `${f.fatigue} | ${f.texte}`);
  verifier("la valeur annoncée sur l'attaque : → 30 de dégâts avec la surpuissance", /→ 30 de dégâts/.test(f.ligne || ""), String(f.ligne));
  verifier("enregistrée : Fatigue 61, Fatigue_Surpuissance 80", f.ecrit && f.ecrit.Fatigue === 61 && f.ecrit.Fatigue_Surpuissance === 80, JSON.stringify(f.ecrit));
}

// (v253 : la triche ne vaut plus que pour les chances d'état — Nico : « 20 %
// uniquement sur leurs effets d'état, style Glacé, Peur… pas les dégâts ni les
// soins ». Les dégâts et le soin de la créature restent ceux de sa carte.)
console.log("\n5. LA TRICHE DES SORTS DES CRÉATURES : +20 % AUX ÉTATS, FATIGUE INCHANGÉE");
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
    return { coup: await lire("COUP", "M1"), soin: await lire("SOIN", "M1"), heros: await lire("COUP", "H1"),
             fatigue: cartes.COUP.Fatigue,
             zombie: window.multiplicateurSortsMonstre({ estMonstre: true, zombie: true }),
             compagnon: window.multiplicateurSortsMonstre({ estMonstre: true, compagnonDe: "P" }),
             monstre: window.multiplicateurSortsMonstre({ estMonstre: true }) };
  });
  verifier("une créature : 4 × 3 = 12 dégâts, pas un de plus", r.coup.v === 12, JSON.stringify(r.coup));
  verifier("…et sa Confusion : 12 % → 14 %", r.coup.alt.includes("Confusion:14"), JSON.stringify(r.coup.alt));
  verifier("son soin : 6, pas un de plus", r.soin.v === 6, JSON.stringify(r.soin));
  verifier("la même carte chez un héros : 12 et 12 % (pas de triche)", r.heros.v === 12 && r.heros.alt.includes("Confusion:12"), JSON.stringify(r.heros));
  verifier("la fatigue de la carte ne bouge pas (35)", r.fatigue === 35);
  verifier("×1,2 pour une créature ; ni le zombie ni le compagnon", r.monstre === 1.2 && r.zombie === 1 && r.compagnon === 1,
           JSON.stringify([r.monstre, r.zombie, r.compagnon]));
}

console.log("\n6. LES ÉTATS SOUS LES PORTRAITS DE LA PISTE");
{
  const r = await p.evaluate(async () => {
    const bandeau = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png";
    const sans = window.imageEtat({ nom: "Charmé", duree: 2 }, 18);
    const peur = window.imageEtat({ nom: "Provocation", duree: 2, icone: bandeau }, 18);
    const avec = window.imageEtat({ nom: "Brûlé", duree: 2, icone: "https://res.cloudinary.com/x/brule.png" }, 18);
    const d = document.createElement("div"); d.innerHTML = sans;
    const m = d.firstElementChild;
    // La piste, dessinée pour de vrai : un héros charmé, sous Rempart, brûlé.
    document.getElementById("fenetre-combat").style.display = "block";
    window.PERSOS_PARTIE = [
      { idPersonnage: "H1", idJoueur: "P_01", camp: "Allié", prenom: "Ilda", PV_Max: 40, PV_Actuels: 30, Fatigue_Max: 100, fatigueActuelle: 100,
        Etats_Alteres: [{ nom: "Charmé", duree: 2 }, { nom: "Rempart", duree: 3 }, { nom: "Brûlé", duree: 2, icone: "https://res.cloudinary.com/x/brule.png" },
                        { nom: "Provocation", duree: 2, icone: bandeau }], statut: "Vivant" },
      { idPersonnage: "M1", camp: "Ennemi", estMonstre: true, prenom: "Gnoll", PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }];
    window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, M1: { q: 2, r: 0 } };
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]]; window.COMBAT_INDEX_PERSO = 0;
    window.REGIME_CERVEAU = true; window.PISTE_MANCHE = { manche: 0, ordre: [] };
    window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"],
                           File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C", initiative: 50 }, { idPersonnage: "M1", idCarte: "C", initiative: 30 }] };
    try { window.appliquerTokensVTT(window.TOKENS_VTT_DATA); } catch (e) {}
    window.afficherPisteInitiative(window.PARTIE_DATA.File_Attente_Combat, "Resolution");
    await new Promise(r => setTimeout(r, 200));
    const t = document.querySelector('.piste-tuile[data-id="H1"]');
    const medaillons = t ? [...t.querySelectorAll(".medaillon-etat")].map(x => x.dataset.etat) : [];
    const images = t ? [...t.querySelectorAll("img")].filter(i => /brule/.test(i.src)).length : 0;
    // Les bulles du pion : une par état.
    const pion = document.getElementById("token-H1");
    const bulles = pion ? [...pion.querySelectorAll(".point-etat-token")].map(x => x.dataset.etat) : [];
    return { sans, peur: /medaillon-etat/.test(peur) && !/<img/.test(peur), avec: /<img/.test(avec) && !/medaillon/.test(avec),
             titre: m && m.title, symbole: m && m.textContent, fond: m && m.style.background, medaillons, images, bulles };
  });
  verifier("un état sans image (Charmé) : un médaillon, son nom au survol, son symbole", r.titre === "Charmé" && r.symbole === "💘", JSON.stringify({ t: r.titre, s: r.symbole }));
  verifier("…de la couleur de sa bulle sur le pion (rose, #ec407a)", /236, 64, 122|#ec407a/i.test(r.fond || ""), String(r.fond));
  verifier("l'image de bandeau (Provocation, Peur, Élan, Repli) : un médaillon aussi", r.peur);
  verifier("un état qui a son image la garde (Brûlé)", r.avec);
  verifier("sous le portrait de la piste : Charmé, Rempart, Provocation en médaillons, Brûlé en image",
           JSON.stringify(r.medaillons) === '["Charmé","Rempart","Provocation"]' && r.images === 1, JSON.stringify(r.medaillons) + " / " + r.images);
  // La planche des médaillons, pour la capture.
  await p.evaluate(() => {
    const planche = document.createElement("div");
    planche.id = "planche-medaillons";
    planche.style.cssText = "position: fixed; left: 20px; top: 20px; z-index: 99999; background: #1a0f08; border: 2px solid #a8841f; border-radius: 12px; padding: 14px 18px; display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px 18px; font-family: serif; color: #e8d5a5;";
    ["Charmé", "Rempart", "Mur de bouclier", "Nuée de chauve-souris", "Bouclier anti-magie", "Ténèbres étalées",
     "Instinct du tueur", "Bouclier des Sages", "Étalement", "Soin étalé", "Élan", "Repli", "Provocation", "Peur", "Plaie rouverte", "Béni"]
      .forEach(nom => {
        const c = document.createElement("div");
        c.style.cssText = "display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 12px; width: 90px; text-align: center;";
        c.innerHTML = window.imageEtat({ nom, duree: 2 }, 34) + `<span>${nom}</span>`;
        planche.appendChild(c);
      });
    document.body.appendChild(planche);
  });
  const planche = await p.$("#planche-medaillons");
  if (planche) await planche.screenshot({ path: "/tmp/claude-0/v241_medaillons_etats.png" });
  await p.evaluate(() => document.getElementById("planche-medaillons").remove());
}

verifier("aucune erreur de page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
