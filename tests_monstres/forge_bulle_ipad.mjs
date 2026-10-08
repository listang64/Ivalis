// LA BULLE DES EFFETS DE LA FORGE, AU DOIGT, SUR IPAD
//
// Nico : « Sur iPad, quand je laisse le doigt sur un sous-effet dans la Forge,
// ça ne me met pas une bulle avec le descriptif du truc. Corrige ça. »
//
// La cause : Safari abandonne le POINTEUR au bout d'une demi-seconde de doigt
// immobile (il y voit le début d'une sélection de texte, d'un glisser-déposer,
// d'un défilement) et envoie `pointercancel` — qui arrêtait le minuteur de
// 2 secondes. Le doigt est pourtant toujours posé : les événements « touch »
// continuent. Ce banc rejoue exactement cette séquence dans un navigateur
// tactile, et vérifie :
//   • doigt posé, `pointercancel` d'iOS, doigt immobile : la bulle s'ouvre ;
//   • doigt posé puis qui glisse (défilement) : pas de bulle ;
//   • toucher court : pas de bulle, l'effet est choisi ;
//   • deux doigts (zoom) : pas de bulle ;
//   • un vrai appui long (protocole du navigateur) sur un effet de la carte ;
//   • rien ne se sélectionne sous le doigt (user-select, touch-callout).
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

//  LA VRAIE PAGE
// =========================================================================
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
  export const getDoc = async (ref) => { const d = (window.__docs || {})[ref.chemin]; return { exists: () => !!d, data: () => d || {} }; };
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {};
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data }); };
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
const EFFETS = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/effets_reels.json', 'utf-8'));
const EFFETS_PAR_ID = Object.fromEntries((Array.isArray(EFFETS) ? EFFETS : Object.values(EFFETS)).map(e => [e.id, e]));
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
// Un iPad : écran tactile.
const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
const p = await ctx.newPage();
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"><rect width="900" height="300" fill="#5a3a20"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

await p.evaluate(async (EFFETS) => {
  window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
  window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
  window.__docs = { "Personnages/P1": { Classe: "Assassin", XP: 0, Race: "Humain" }, "Caracteristiques/P1": { Force: 14, Dexterite: 14 } };
  document.getElementById("champ-id-personnage").value = "P1";
  window.OUVERTURE_FORGE_EN_COURS = false;
  await window.ouvrirCreationCompetence();
  window.forgeState.armePrincipale = "Arme lourde CAC";
  window.ajouterComposantPrincipal("EFF_ATTAQUE_LOURDE");
  window.rafraichirForge();
}, EFFETS_PAR_ID);

const DELAI_REEL = await p.evaluate(() => window.DELAI_APPUI_LONG_BULLE);
verifier("l'appui long dure toujours 2 secondes", DELAI_REEL === 2000, String(DELAI_REEL));
verifier("le navigateur du banc est bien tactile", await p.evaluate(() => "ontouchstart" in window));

// La séquence d'iOS, rejouée à la main : `pointerdown` + `touchstart`, puis
// `pointercancel` au bout d'un instant ; le doigt reste, ou glisse, ou se lève.
const scenario = (etapes) => p.evaluate(async (etapes) => {
  window.DELAI_APPUI_LONG_BULLE = 300;    // le banc n'attend pas 2 s
  window.cacherBulleEffet();
  window.forgeState.actions[0].mods = {};
  window.rafraichirForge();
  document.querySelector("#forge-contenu-carte .forge-menu:nth-child(1) .forge-menu-bouton").click();
  const o = document.querySelector("#forge-menu-liste-ouverte .forge-menu-option[data-mod]");
  const r = o.getBoundingClientRect();
  const x0 = r.left + 8, y0 = r.top + 6;
  const pointeur = (type, x, y) => o.dispatchEvent(new PointerEvent(type, { pointerType: "touch", pointerId: 7, isPrimary: true,
    bubbles: true, cancelable: type !== "pointercancel", clientX: x, clientY: y }));
  const touche = (type, points) => {
    const t = points.map((pt, i) => new Touch({ identifier: i + 1, target: o, clientX: pt[0], clientY: pt[1] }));
    const fin = type === "touchend" || type === "touchcancel";
    o.dispatchEvent(new TouchEvent(type, { touches: fin ? [] : t, targetTouches: fin ? [] : t, changedTouches: t,
                                          bubbles: true, cancelable: true }));
  };
  const attendre = (ms) => new Promise(r => setTimeout(r, ms));
  const mods = () => Object.keys(window.forgeState.actions[0].mods).length;
  const avant = mods();
  for (const [quoi, a, b2] of etapes) {
    if (quoi === "attendre") await attendre(a);
    else if (quoi === "pointerdown" || quoi === "pointerup" || quoi === "pointercancel" || quoi === "pointermove")
      pointeur(quoi, x0 + (a || 0), y0 + (b2 || 0));
    else if (quoi === "deuxDoigts") touche("touchstart", [[x0, y0], [x0 + 60, y0 + 60]]);
    else if (quoi === "click") o.click();
    else touche(quoi, [[x0 + (a || 0), y0 + (b2 || 0)]]);
  }
  const bulle = document.getElementById("bulle-effet-forge");
  const res = { bulle: !!bulle && bulle.style.display === "block", pour: bulle && bulle.dataset.pour,
                titre: bulle ? (bulle.querySelector(".bulle-effet-titre") || {}).textContent : null,
                choisi: mods() > avant, mod: o.dataset.mod };
  window.DELAI_APPUI_LONG_BULLE = 2000;
  return res;
}, etapes);

console.log("\n1. LE DOIGT RESTE POSÉ, ET SAFARI ANNULE LE POINTEUR");
{
  const r = await scenario([["pointerdown"], ["touchstart"], ["attendre", 80], ["pointercancel"], ["attendre", 400]]);
  verifier("malgré le pointercancel d'iOS : la bulle s'ouvre", r.bulle, JSON.stringify(r));
  verifier("c'est la bulle de cet effet, avec son titre", r.pour === r.mod && !!r.titre, `${r.pour} « ${r.titre} »`);
  const fin = await scenario([["pointerdown"], ["touchstart"], ["attendre", 80], ["pointercancel"], ["attendre", 400],
                              ["touchend"], ["click"]]);
  verifier("le doigt se lève : l'effet n'a PAS été choisi pour autant", fin.bulle && !fin.choisi, JSON.stringify(fin));
}

console.log("\n2. LE DOIGT GLISSE (DÉFILEMENT DE LA LISTE)");
{
  const r = await scenario([["pointerdown"], ["touchstart"], ["attendre", 60], ["pointercancel"],
                            ["touchmove", 0, 25], ["touchmove", 0, 60], ["attendre", 400], ["touchend"]]);
  verifier("pas de bulle : c'était un défilement", !r.bulle, JSON.stringify(r));
  const petit = await scenario([["pointerdown"], ["touchstart"], ["attendre", 60], ["pointercancel"],
                                ["touchmove", 3, 4], ["attendre", 400]]);
  verifier("un doigt qui tremble de quelques pixels : la bulle s'ouvre quand même", petit.bulle, JSON.stringify(petit));
}

console.log("\n3. LE TOUCHER COURT CHOISIT L'EFFET");
{
  const r = await scenario([["pointerdown"], ["touchstart"], ["attendre", 60], ["pointerup"], ["touchend"], ["click"], ["attendre", 400]]);
  verifier("pas de bulle, et l'effet est choisi", !r.bulle && r.choisi, JSON.stringify(r));
}

console.log("\n4. DEUX DOIGTS (ZOOM) : PAS DE BULLE");
{
  const r = await scenario([["deuxDoigts"], ["attendre", 400]]);
  verifier("deux doigts posés : pas de bulle", !r.bulle, JSON.stringify(r));
}

console.log("\n5. UN VRAI APPUI LONG SUR UN EFFET DE LA CARTE");
{
  const cible = await p.evaluate(() => {
    window.cacherBulleEffet();
    window.fermerMenusSousEffets();
    const el = document.querySelector("#forge-contenu-carte .forge-nom-effet[data-bulle-effet]");
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2, id: el.dataset.bulleEffet };
  });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cible.x, y: cible.y }] });
  await p.waitForTimeout(1200);
  const pendant = await p.evaluate(() => document.getElementById("bulle-effet-forge")?.style.display === "block");
  await p.waitForTimeout(1100);
  const apres = await p.evaluate(() => { const b = document.getElementById("bulle-effet-forge");
    return { ouverte: !!b && b.style.display === "block", pour: b && b.dataset.pour }; });
  if (process.env.CAPTURE_DIR) await p.screenshot({ path: process.env.CAPTURE_DIR + "/forge_bulle_ipad.png" });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  verifier("au bout d'1,2 s, pas encore", !pendant);
  verifier("au bout de 2 s, doigt toujours posé : la bulle de cet effet", apres.ouverte && apres.pour === cible.id, JSON.stringify(apres));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 30, y: 30 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const fermee = await p.evaluate(() => document.getElementById("bulle-effet-forge").style.display !== "block");
  verifier("un appui ailleurs la referme", fermee);
}

console.log("\n6. RIEN NE SE SÉLECTIONNE SOUS LE DOIGT");
{
  const r = await p.evaluate(() => {
    document.querySelector("#forge-contenu-carte .forge-menu:nth-child(1) .forge-menu-bouton").click();
    const lire = (el) => { const cs = getComputedStyle(el);
      return { select: cs.userSelect || cs.webkitUserSelect, callout: cs.webkitTouchCallout || "(non lu)" }; };
    const res = { carte: lire(document.querySelector("#forge-contenu-carte .forge-nom-effet[data-bulle-effet]")),
                  option: lire(document.querySelector("#forge-menu-liste-ouverte .forge-menu-option")) };
    window.ouvrirMenuAjoutForge();
    res.grimoire = lire(document.querySelector("#forge-menu-caracs .forge-grimoire-ligne[data-bulle-effet]"));
    window.fermerMenuAjoutForge();
    return res;
  });
  verifier("un effet posé sur la carte : user-select none", r.carte.select === "none", JSON.stringify(r.carte));
  verifier("une ligne de la liste des sous-effets : user-select none", r.option.select === "none", JSON.stringify(r.option));
  verifier("une ligne du grimoire d'ajout : user-select none", r.grimoire.select === "none", JSON.stringify(r.grimoire));
}

verifier("aucune erreur JavaScript pendant tout le banc", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
