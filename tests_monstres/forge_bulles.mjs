// LA FORGE EXPLIQUE SES EFFETS, ET LES BARRES DE DÉFILEMENT S'HABILLENT.
//
// Nico : « dans la Forge, pour tous les sous-effets listés : sur PC, au
// survol de la souris, une petite bulle s'affiche à côté pour expliquer le
// détail de cet effet ; sur iPad, si on reste le doigt dessus 2 secondes la
// bulle apparaît, et disparaît si on appuie ailleurs. » Et : « dans la liste
// des personnages et dans la Forge, quand une barre de défilement apparaît,
// elle est toute grise et moche ».
//   - les menus de sous-effets ne sont plus des <select> (une option native
//     n'a pas de survol, et ouvre la roue d'iOS) : un menu à nous, dont chaque
//     ligne porte data-bulle-effet ;
//   - la bulle dit le texte de l'effet et ses Notes du grimoire ;
//   - le survol (souris) l'ouvre et la ferme ; l'appui de 2 s (doigt) l'ouvre
//     sans choisir l'effet, un appui ailleurs la ferme ; un toucher court
//     choisit l'effet, comme avant.
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
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"><rect width="900" height="300" fill="#5a3a20"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

console.log("\n=========================================================");
console.log("  LES BULLES DE LA FORGE, LES BARRES DE DÉFILEMENT");
console.log("=========================================================");

await p.evaluate(async (EFFETS) => {
  window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
  window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
  // Les Notes du grimoire en ligne (l'instantané des bancs est plus ancien).
  const etourdit = Object.values(window.EFFETS_BDD_CACHE).find(e => /tourdi/i.test(e.Nom || ""));
  if (etourdit) etourdit.Notes = "EFFET ETAT ÉTOURDIT = -30% d'esquive / parade ET 20% de chance de louper sa technique";
  window.__docs = { "Personnages/P1": { Classe: "Assassin", XP: 0, Race: "Humain" }, "Caracteristiques/P1": { Force: 14, Dexterite: 14 } };
  document.getElementById("champ-id-personnage").value = "P1";
  window.OUVERTURE_FORGE_EN_COURS = false;
  await window.ouvrirCreationCompetence();
  window.forgeState.armePrincipale = "Arme lourde CAC";
  window.ajouterComposantPrincipal("EFF_ATTAQUE_LOURDE");
  window.rafraichirForge();
}, EFFETS_PAR_ID);

console.log("\n1. UN MENU À NOUS, PLUS UN <select>");
const m = await p.evaluate(() => {
  const menus = [...document.querySelectorAll("#forge-contenu-carte .forge-menu")];
  return { selects: document.querySelectorAll("#forge-contenu-carte select").length, menus: menus.length,
           boutons: menus.map(x => x.querySelector(".forge-menu-bouton").textContent.trim()),
           options: document.querySelectorAll("#forge-contenu-carte .forge-menu-option[data-bulle-effet]").length,
           etourdit: !!document.querySelector('#forge-contenu-carte .forge-menu-option[data-mod="' +
             (Object.values(window.EFFETS_BDD_CACHE).find(e => /tourdi/i.test(e.Nom || "")) || {}).id + '"]') };
});
verifier("plus de <select> sous l'attaque : quatre menus à nous", m.selects === 0 && m.menus === 4, JSON.stringify(m.boutons));
verifier("chaque sous-effet listé porte sa bulle", m.options > 5, String(m.options));
verifier("Étourdit est dans la liste", m.etourdit);

console.log("\n2. À LA SOURIS : LE SURVOL");
const idEtourdit = await p.evaluate(() => (Object.values(window.EFFETS_BDD_CACHE).find(e => /tourdi/i.test(e.Nom || "")) || {}).id);
await p.click("#forge-contenu-carte .forge-menu:nth-child(2) .forge-menu-bouton");
const ouvert = await p.evaluate(() => { const l = document.getElementById("forge-menu-liste-ouverte"); return l ? getComputedStyle(l).display : "absente"; });
verifier("un clic sur « + Physique » ouvre la liste", ouvert === "block", ouvert);
const entiere = await p.evaluate(() => {
  const l = document.getElementById("forge-menu-liste-ouverte");
  const r = l.getBoundingClientRect();
  // Le dernier sous-effet de la liste est-il visible (pas caché sous la carte) ?
  const derniers = [...l.querySelectorAll(".forge-menu-option")];
  l.scrollTop = l.scrollHeight;
  const d = derniers[derniers.length - 1].getBoundingClientRect();
  const visible = document.elementFromPoint(d.left + 10, d.top + d.height / 2);
  return { dansEcran: r.top >= 0 && r.bottom <= innerHeight, dernierVisible: !!visible && derniers[derniers.length - 1].contains(visible) };
});
verifier("la liste n'est plus coupée par la carte : son dernier effet se voit", entiere.dansEcran && entiere.dernierVisible, JSON.stringify(entiere));
const opt = `#forge-menu-liste-ouverte .forge-menu-option[data-mod="${idEtourdit}"]`;
await p.hover(opt);
await p.waitForTimeout(50);
const bulle = await p.evaluate((sel) => {
  const b = document.getElementById("bulle-effet-forge"), o = document.querySelector(sel);
  const rb = b.getBoundingClientRect(), ro = o.getBoundingClientRect();
  return { visible: b.style.display === "block", texte: b.textContent, aCote: rb.left >= ro.right - 1 || rb.right <= ro.left + 1,
           dansEcran: rb.left >= 0 && rb.right <= innerWidth && rb.top >= 0 && rb.bottom <= innerHeight };
}, opt);
verifier("au survol, la bulle s'ouvre à côté de l'effet", bulle.visible && bulle.aCote && bulle.dansEcran, JSON.stringify({ ...bulle, texte: undefined }));
verifier("elle dit son texte ET le détail de l'état (Notes du grimoire)",
         /chance d'étourdir/i.test(bulle.texte) && /-30% d'esquive/.test(bulle.texte) && !/EFFET ETAT/.test(bulle.texte) && /fatigue par cran/.test(bulle.texte),
         bulle.texte);
await p.screenshot({ path: "/tmp/claude-0/forge_bulle.png" });
await p.mouse.move(5, 5);
await p.waitForTimeout(50);
verifier("la souris s'en va : la bulle se ferme",
         await p.evaluate(() => document.getElementById("bulle-effet-forge").style.display === "none"));
// Le clic choisit, comme avant.
await p.click(opt);
const choisi = await p.evaluate((id) => ({ mods: Object.keys(window.forgeState.actions[0].mods), ferme: !document.querySelector(".forge-menu.ouvert") && !document.getElementById("forge-menu-liste-ouverte") }), idEtourdit);
verifier("un clic sur l'option l'ajoute à l'attaque, et le menu se referme", choisi.mods.includes(idEtourdit) && choisi.ferme, JSON.stringify(choisi));
verifier("l'effet posé garde sa bulle", await p.evaluate((id) => !!document.querySelector(`#forge-contenu-carte .forge-sous-effet [data-bulle-effet="${id}"]`), idEtourdit));

console.log("\n3. AU DOIGT : L'APPUI DE 2 SECONDES");
const tactile = await p.evaluate(async () => {
  const res = { delai: window.DELAI_APPUI_LONG_BULLE };
  window.DELAI_APPUI_LONG_BULLE = 150;    // le banc n'attend pas 2 s
  // Deux sous-effets posés atteignent le plafond de fatigue (les menus se
  // grisent, c'est la règle) : on repart d'une attaque nue à chaque essai.
  const aZero = () => { window.forgeState.actions[0].mods = {}; window.rafraichirForge(); };
  aZero();
  const bouton = document.querySelector("#forge-contenu-carte .forge-menu:nth-child(1) .forge-menu-bouton");
  bouton.click();
  const o = document.querySelector("#forge-menu-liste-ouverte .forge-menu-option[data-mod]");
  const b = () => document.getElementById("bulle-effet-forge").style.display === "block";
  const r = o.getBoundingClientRect();
  const doigt = (type, el, x = r.left + 5, y = r.top + 5) => el.dispatchEvent(new PointerEvent(type, { pointerType: "touch", bubbles: true, cancelable: true, clientX: x, clientY: y }));
  const modsAvant = Object.keys(window.forgeState.actions[0].mods).length;
  // Appui court : pas de bulle, l'effet est choisi.
  doigt("pointerdown", o); await new Promise(r => setTimeout(r, 50)); doigt("pointerup", o); o.click();
  res.courtBulle = b(); res.courtChoisi = Object.keys(window.forgeState.actions[0].mods).length === modsAvant + 1;
  // Appui long : la bulle, sans choisir.
  aZero();
  document.querySelector("#forge-contenu-carte .forge-menu:nth-child(1) .forge-menu-bouton").click();
  const o2 = document.querySelector("#forge-menu-liste-ouverte .forge-menu-option[data-mod]");
  if (!o2) return { debug: [...document.querySelectorAll("#forge-contenu-carte .forge-menu")].map(m => m.className + " | " + m.querySelector(".forge-menu-bouton").disabled + " | " + m.querySelectorAll(".forge-menu-option[data-mod]").length), choisi: Object.keys(window.forgeState.actions[0].mods) };
  const n2 = Object.keys(window.forgeState.actions[0].mods).length;
  const cout2 = window.forgeState.actions[0].mods[o2.dataset.mod] || 0;
  doigt("pointerdown", o2); await new Promise(r => setTimeout(r, 250));
  res.longBulle = b();
  doigt("pointerup", o2); o2.click();
  res.longNeChoisitPas = Object.keys(window.forgeState.actions[0].mods).length === n2 && (window.forgeState.actions[0].mods[o2.dataset.mod] || 0) === cout2;
  // Le doigt glisse : pas de bulle.
  window.cacherBulleEffet();
  doigt("pointerdown", o2); doigt("pointermove", o2, r.left + 40, r.top + 40); await new Promise(r => setTimeout(r, 250));
  res.glisseBulle = b(); doigt("pointerup", o2);
  // Un appui ailleurs la ferme.
  doigt("pointerdown", o2); await new Promise(r => setTimeout(r, 250)); doigt("pointerup", o2); o2.click();
  res.avantAilleurs = b();
  doigt("pointerdown", document.getElementById("forge-nom"));
  res.apresAilleurs = b();
  window.DELAI_APPUI_LONG_BULLE = res.delai;
  return res;
});
if (tactile.debug) console.log("DEBUG", JSON.stringify(tactile));
verifier("le délai est de 2 secondes", tactile.delai === 2000, String(tactile.delai));
verifier("toucher court : pas de bulle, l'effet est choisi", !tactile.courtBulle && tactile.courtChoisi, JSON.stringify(tactile));
verifier("appui long : la bulle s'ouvre, et l'effet n'est PAS choisi", tactile.longBulle && tactile.longNeChoisitPas);
verifier("le doigt qui glisse (défilement) n'ouvre pas la bulle", !tactile.glisseBulle);
verifier("un appui ailleurs la ferme", tactile.avantAilleurs && !tactile.apresAilleurs);

console.log("\n4. LE GRIMOIRE D'AJOUT AUSSI");
const grim = await p.evaluate(() => { window.ouvrirMenuAjoutForge();
  return document.querySelectorAll("#forge-menu-caracs .forge-grimoire-ligne[data-bulle-effet]").length; });
verifier("chaque effet du grimoire d'ajout porte sa bulle", grim > 5, String(grim));

console.log("\n5. LES BARRES DE DÉFILEMENT AU DESIGN DU JEU");
const barres = await p.evaluate(() => {
  const lire = (el) => el ? getComputedStyle(el).scrollbarColor + " | " + getComputedStyle(el).scrollbarWidth : "absent";
  return { persos: lire(document.getElementById("liste-html-persos")), forge: lire(document.querySelector("#modale-creation-competence")),
           grimoire: lire(document.getElementById("modale-menu-ajout")), menu: lire(document.querySelector(".forge-menu-liste")),
           cachee: lire(document.getElementById("vue-grille-classes")) };
});
const bronze = (v) => /rgb\(140, 106, 69\)/.test(v) && /thin/.test(v);
verifier("liste des personnages : curseur de bronze, barre fine", bronze(barres.persos), barres.persos);
verifier("la Forge, son grimoire, ses menus : pareil", bronze(barres.forge) && bronze(barres.grimoire) && bronze(barres.menu),
         `${barres.forge} / ${barres.grimoire} / ${barres.menu}`);
verifier("une zone qui cachait sa barre la garde cachée", /none/.test(barres.cachee), barres.cachee);

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
