// L'ŒIL D'OR : RÉVÉLER LES MURS ET LE TERRAIN DIFFICILE, LE TEMPS D'UN APPUI.
//
// Les murs et le terrain difficile ne se voient QUE quand le Maître du Jeu a
// son pinceau en main (VTT_MODE_MURS / VTT_MODE_DIFFICILE) — le reste du
// temps, un joueur qui a oublié où est un mur doit deviner à l'aveugle. Un
// petit bouton en forme d'œil doré, collé juste au-dessus du bouton de fin de
// tour, les révèle tant qu'on le maintient enfoncé, sans jamais toucher au
// pinceau : réutiliser VTT_MODE_MURS/VTT_MODE_DIFFICILE pour ça aurait aussi
// armé le clic-pour-peindre pendant tout l'appui, avec le risque bien réel
// d'une case modifiée par erreur d'un joueur qui ne fait que regarder.
//
// CE BANC SERT LA VRAIE PAGE, INSTANCIE LE VRAI Plateau, ET PRESSE LE VRAI
// BOUTON DU DOM (pas d'appel direct aux fonctions) :
//   • relâché, les murs et le terrain difficile posés restent invisibles ;
//   • un appui (mousedown) les révèle, sans jamais allumer VTT_MODE_MURS ni
//     VTT_MODE_DIFFICILE — le pinceau reste au repos ;
//   • le relâchement (mouseup, ou la souris qui quitte le bouton) les cache
//     à nouveau ;
//   • le bouton est bien collé au bord droit de l'écran, juste au-dessus du
//     bandeau du bas.
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
  // Les écoutes sont gardées : le banc peut ainsi livrer lui-même un
  // instantané de Combat_VTT, comme le ferait Firestore après l'écriture d'un
  // autre appareil.
  export const onSnapshot = (ref, rappel) => {
    (window.__ECOUTES_FS = window.__ECOUTES_FS || []).push({ chemin: ref && ref.chemin, rappel });
    return () => {};
  };
  export const query = (...a) => ({a});
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
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml',
  headers: {'Access-Control-Allow-Origin':'*'},
  body: `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="132" viewBox="0 0 450 132"><rect width="450" height="132" fill="#2a1d12"/></svg>` }));

const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));

await p.goto(base + '/index.html');
await p.waitForTimeout(1500);

// =========================================================================
//  LE MONDE : un plateau réel, avec un mur et une case de terrain difficile
//  posés à des coordonnées connues.
// =========================================================================
await p.evaluate(() => {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById('fenetre-combat').style.display = 'block';

  window.initialiserPlateau();
  window.PLATEAU_VTT.setCaseState(0, 0, { isBlocked: true });
  window.PLATEAU_VTT.setCaseState(1, 0, { isDifficult: true });

  // On espionne les remplissages du pinceau (fill), le seul geste que
  // drawHex fait pour un mur ou une case difficile — le cas « standard »,
  // lui, ne fait que tracer un contour (stroke), jamais un fill.
  window.__FILLS = [];
  const ctx = window.PLATEAU_VTT.ctx;
  const fillOrig = ctx.fill.bind(ctx);
  ctx.fill = function (...args) { window.__FILLS.push(ctx.fillStyle); return fillOrig(...args); };
});

// L'œil d'or montre murs et terrain difficile à 50 % d'opacité (demande de
// Nico : on doit voir le décor à travers).
const COULEUR_MUR = 'rgba(0, 0, 0, 0.5)';
const COULEUR_DIFFICILE = 'rgba(155, 89, 182, 0.5)';
const COULEUR_MUR_PINCEAU = 'rgba(0, 0, 0, 0.85)';

const dessiner = () => p.evaluate(() => {
  window.__FILLS.length = 0;
  window.PLATEAU_VTT.renderMap();
  return window.__FILLS.slice();
});

console.log("\n=========================================================");
console.log("  1. RELÂCHÉ, LE MUR ET LE TERRAIN DIFFICILE RESTENT INVISIBLES");
console.log("=========================================================");
{
  const fills = await dessiner();
  verifier("aucun remplissage de mur sans outil ni œil d'or", !fills.includes(COULEUR_MUR),
           JSON.stringify(fills));
  verifier("aucun remplissage de terrain difficile non plus", !fills.includes(COULEUR_DIFFICILE),
           JSON.stringify(fills));
}

console.log("\n=========================================================");
console.log("  2. UN APPUI SUR LE VRAI BOUTON LES RÉVÈLE — SANS ARMER LE PINCEAU");
console.log("=========================================================");
{
  const bouton = await p.$('#btn-hud-reveler-terrain');
  verifier("le bouton existe dans le DOM", !!bouton);

  const box = await bouton.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(100);

  const etat = await p.evaluate(() => ({
    reveler: window.VTT_REVELER_TERRAIN,
    murs: window.VTT_MODE_MURS,
    difficile: window.VTT_MODE_DIFFICILE
  }));
  verifier("le drapeau de révélation s'allume", etat.reveler === true, etat.reveler);
  verifier("le pinceau des murs reste éteint", etat.murs === false, etat.murs);
  verifier("le pinceau du terrain difficile reste éteint", etat.difficile === false, etat.difficile);

  const fills = await p.evaluate(() => { window.__FILLS.length = 0; window.PLATEAU_VTT.renderMap(); return window.__FILLS.slice(); });
  verifier("le mur est bien peint pendant l'appui", fills.includes(COULEUR_MUR), JSON.stringify(fills));
  verifier("le terrain difficile aussi", fills.includes(COULEUR_DIFFICILE), JSON.stringify(fills));
  verifier("et le mur l'est à 50 %, pas en noir presque plein", !fills.includes(COULEUR_MUR_PINCEAU), JSON.stringify(fills));

  await p.mouse.up();
  await p.waitForTimeout(100);
}

console.log("\n=========================================================");
console.log("  3. LE RELÂCHEMENT LES CACHE À NOUVEAU");
console.log("=========================================================");
{
  const etat = await p.evaluate(() => window.VTT_REVELER_TERRAIN);
  verifier("le drapeau s'éteint au relâchement", etat === false, etat);

  const fills = await dessiner();
  verifier("le mur redevient invisible", !fills.includes(COULEUR_MUR), JSON.stringify(fills));
  verifier("le terrain difficile aussi", !fills.includes(COULEUR_DIFFICILE), JSON.stringify(fills));
}

console.log("\n=========================================================");
console.log("  4. LA SOURIS QUI QUITTE LE BOUTON COUPE AUSSI LA RÉVÉLATION");
console.log("=========================================================");
{
  const bouton = await p.$('#btn-hud-reveler-terrain');
  const box = await bouton.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(80);
  const allume = await p.evaluate(() => window.VTT_REVELER_TERRAIN);
  // On sort largement du bouton avant de relâcher — mouseleave doit avoir
  // déjà coupé la révélation, comme les autres boutons du bandeau (scale
  // qui revient à 1 dès qu'on quitte le cercle).
  await p.mouse.move(box.x - 300, box.y - 300);
  await p.waitForTimeout(80);
  await p.mouse.up();
  const apresSortie = await p.evaluate(() => window.VTT_REVELER_TERRAIN);
  verifier("l'appui avait bien allumé la révélation", allume === true, allume);
  verifier("quitter le bouton en cours d'appui l'éteint déjà", apresSortie === false, apresSortie);
}

console.log("\n=========================================================");
console.log("  5. LE BOUTON EST COLLÉ AU BORD DROIT, AU-DESSUS DU BANDEAU");
console.log("=========================================================");
{
  const g = await p.evaluate(() => {
    const bouton = document.getElementById('btn-hud-reveler-terrain').getBoundingClientRect();
    const bandeau = document.getElementById('combat-hud-bas-droite').getBoundingClientRect();
    return {
      ecartDroite: window.innerWidth - bouton.right,
      basBouton: bouton.bottom,
      hautBandeau: bandeau.top,
      largeur: bouton.width, hauteur: bouton.height
    };
  });
  verifier("le bouton colle au bord droit de l'écran (petit écart)", g.ecartDroite >= 0 && g.ecartDroite < 60,
           `${g.ecartDroite}px`);
  verifier("il est bien AU-DESSUS du bandeau, pas dessus", g.basBouton <= g.hautBandeau + 1,
           `bas du bouton ${g.basBouton} / haut du bandeau ${g.hautBandeau}`);
  verifier("il est petit et discret (pas un gros bouton)", g.largeur > 0 && g.largeur <= 44 && g.hauteur <= 44,
           `${g.largeur}×${g.hauteur}`);
}

// =========================================================================
//  LES CASES QUE L'ŒIL « OUBLIAIT »
// =========================================================================
//  Signalé en partie : « le bouton ne montre pas tous les murs et terrains
//  difficiles, il en oublie ». Trois raisons, chacune vérifiée ici.
const appuyer = async () => {
  const box = await (await p.$('#btn-hud-reveler-terrain')).boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(80);
};
const relacher = async () => { await p.mouse.up(); await p.waitForTimeout(80); };
// Les remplissages d'UNE case précise : on lit le pixel au centre de son
// hexagone, sur le vrai canvas.
const couleurCase = (q, r) => p.evaluate(([q, r]) => {
  const pl = window.PLATEAU_VTT;
  pl.renderMap();
  const { x, y } = pl.hexToPixel(q, r);
  const d = pl.ctx.getImageData(Math.round(x * pl.ratioRendu), Math.round(y * pl.ratioRendu), 1, 1).data;
  return d[3];   // l'opacité suffit : une case non peinte reste transparente
}, [q, r]);

console.log("\n=========================================================");
console.log("  6. UNE CASE GOMMÉE EST INFRANCHISSABLE : L'ŒIL LA MONTRE");
console.log("=========================================================");
{
  // Une case gommée seule, un mur peint par-dessus une case gommée, un terrain
  // difficile peint par-dessus une case gommée. L'outil de peinture montrait
  // les deux derniers ; l'œil, aucun des trois.
  await p.evaluate(() => {
    window.PLATEAU_VTT.setCaseState(4, 0, { isDeleted: true });
    window.PLATEAU_VTT.setCaseState(5, 0, { isDeleted: true, isBlocked: true });
    window.PLATEAU_VTT.setCaseState(6, 0, { isDeleted: true, isDifficult: true });
  });
  const relache = { gomme: await couleurCase(4, 0), murGomme: await couleurCase(5, 0), difficileGomme: await couleurCase(6, 0) };
  verifier("relâché, une case gommée reste invisible (pas de grille)",
           relache.gomme === 0 && relache.murGomme === 0 && relache.difficileGomme === 0, JSON.stringify(relache));

  await appuyer();
  const presse = { gomme: await couleurCase(4, 0), murGomme: await couleurCase(5, 0), difficileGomme: await couleurCase(6, 0) };
  verifier("l'œil montre la case gommée, infranchissable", Math.abs(presse.gomme - 128) <= 8, `alpha ${presse.gomme} (50 % ≈ 128)`);
  verifier("et le mur peint par-dessus une case gommée", Math.abs(presse.murGomme - 128) <= 8, `alpha ${presse.murGomme}`);
  verifier("et la case difficile gommée (infranchissable, elle aussi)", presse.difficileGomme >= 120,
           `alpha ${presse.difficileGomme}`);

  console.log("\n=========================================================");
  console.log("  7. LES PIONS DEVIENNENT TRANSPARENTS PENDANT L'APPUI");
  console.log("=========================================================");
  const pendant = await p.evaluate(() => getComputedStyle(document.getElementById("conteneur-tokens-vtt")).opacity);
  await relacher();
  const apres = await p.evaluate(() => getComputedStyle(document.getElementById("conteneur-tokens-vtt")).opacity);
  verifier("pendant l'appui, on voit le sol à travers les pions", parseFloat(pendant) < 0.6, `opacité ${pendant}`);
  verifier("relâché, les pions redeviennent pleins", parseFloat(apres) === 1, `opacité ${apres}`);
}

console.log("\n=========================================================");
console.log("  8. UN MUR EN COURS DE PEINTURE N'EST PLUS EFFACÉ PAR UN INSTANTANÉ");
console.log("=========================================================");
{
  // Le MJ peint un mur. Pendant ce temps, un autre appareil écrit dans
  // Combat_VTT (un pion qui bouge) : l'instantané rapporte la liste des murs
  // ENREGISTRÉE, sans le mur neuf. Avant, la couche entière était remise à
  // cette liste — et le mur du MJ disparaissait avant même d'être validé.
  const r = await p.evaluate(() => {
    window.ID_PARTIE_COURANTE = window.ID_PARTIE_COURANTE || "GAME_BANC";
    window.__ECOUTES_FS = [];
    window.ecouterTerrainVTT();
    const ecoute = window.__ECOUTES_FS.find(e => String(e.chemin || "").startsWith("Combat_VTT/"));
    if (!ecoute) return { erreur: "écoute de Combat_VTT introuvable" };
    const livrer = (data) => ecoute.rappel({ exists: () => true, data: () => JSON.parse(JSON.stringify(data)) });
    const enBase = { Tuiles_Supprimees: [], Tuiles_Murs: ["0,0"], Tuiles_Difficiles: ["1,0"] };
    livrer(enBase);

    window.toggleModeMursHex();                                   // le pinceau en main
    window.PLATEAU_VTT.setCaseState(2, 2, { isBlocked: true });    // un mur neuf, pas encore validé
    livrer({ ...enBase, Tokens: {} });                             // un autre appareil écrit
    const garde = !!window.PLATEAU_VTT.getCaseState(2, 2).isBlocked;
    const ancien = !!window.PLATEAU_VTT.getCaseState(0, 0).isBlocked;
    window.toggleModeMursHex();                                   // validé : le losange est reposé
    return { garde, ancien, ecoute: true };
  });
  verifier("le banc livre bien l'instantané de Combat_VTT", r && r.ecoute, JSON.stringify(r));
  verifier("le mur en cours de peinture survit à l'instantané", r && r.garde);
  verifier("et les murs déjà enregistrés sont toujours là", r && r.ancien);
}

console.log("\n=========================================================");
console.log("  9. FERMER SANS VALIDER NE LAISSE PAS DE MUR FANTÔME");
console.log("=========================================================");
{
  // Le pinceau est reposé en fermant la fenêtre de combat : rien n'est
  // enregistré (c'est voulu). Mais le mur restait dans la mémoire de CET
  // appareil — invisible, jamais envoyé aux autres, et pourtant bloquant
  // pour les chemins calculés ici. Un mur que l'œil des joueurs ne pouvait
  // pas montrer, puisqu'il n'existait que chez le MJ.
  const r = await p.evaluate(() => {
    const ecoute = window.__ECOUTES_FS.find(e => String(e.chemin || "").startsWith("Combat_VTT/"));
    ecoute.rappel({ exists: () => true, data: () => ({ Tuiles_Supprimees: [], Tuiles_Murs: ["0,0"], Tuiles_Difficiles: [] }) });
    window.toggleModeMursHex();
    window.PLATEAU_VTT.setCaseState(3, 3, { isBlocked: true });
    window.fermerCombat();
    return {
      fantome: !!window.PLATEAU_VTT.getCaseState(3, 3).isBlocked,
      enregistre: !!window.PLATEAU_VTT.getCaseState(0, 0).isBlocked,
      pinceauRepose: window.VTT_MODE_MURS === false
    };
  });
  verifier("le pinceau est bien reposé", r.pinceauRepose);
  verifier("le mur non validé ne survit pas dans la mémoire de l'appareil", !r.fantome);
  verifier("le mur enregistré, lui, reste", r.enregistre);
}

// Le pinceau du MJ, lui, garde son noir presque plein : on doit voir ce qu'on peint.
{
  const fillsPinceau = await p.evaluate(() => { window.VTT_MODE_MURS = true; window.__FILLS.length = 0;
    window.PLATEAU_VTT.renderMap(); const f = window.__FILLS.slice(); window.VTT_MODE_MURS = false;
    window.PLATEAU_VTT.renderMap(); return f; });
  verifier("le pinceau des murs du MJ reste en noir presque plein (0.85)", fillsPinceau.includes(COULEUR_MUR_PINCEAU),
           JSON.stringify(fillsPinceau.slice(0, 4)));
}
verifier("aucune erreur JavaScript pendant tout le banc", erreurs.length === 0, erreurs.slice(0, 2).join(" | "));

await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
