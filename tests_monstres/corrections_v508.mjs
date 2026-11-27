// v508 — LE VOLET DES COMPÉTENCES DEVIENT UNE PAGE DE PARCHEMIN, ET SES BANNIÈRES CELLES DE LA FICHE.
// Nico : « à la place de la lanière de cuir qui descend avec les bannières dedans, faire dépasser un peu une page de
// parchemin. Quand on clique dessus elle glisse vers la droite, juste ce qu'il faut pour faire apparaître les bannières
// des compétences du personnage. Pour ces bannières, le même visuel qu'elles ont dans la fiche personnage. Au survol de
// la souris ou quand on clique dessus sur iPad, ça fait sortir un post-it, légèrement pas trop droit, avec dessiné dessus
// la compétence (comme dans la fiche personnage). Quand un autre est pointé ou sélectionné, il sort direct décalé en
// hauteur, et l'autre en dessous rentre vers la gauche. »
// Lancer : node tests_monstres/corrections_v508.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(96)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lireFichier = (f) => fs.readFileSync(path.join('/home/user/Ivalis', f), 'utf-8');

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

const preparer = async () => {
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
  document.getElementById("fenetre-combat").style.display = "block";
  const coup = { Nom: "Coup de taille", Initiative: 40, Fatigue: 10, Arme: "", Effets_Compiles: [{ nom: "Dégâts physiques", desc: "8 dégâts", isMod: false }] };
  const feu = { Nom: "Boule de feu", Initiative: 20, Fatigue: 25, Arme: "", Effets_Compiles: [{ nom: "Dégâts magiques", desc: "12 dégâts", isMod: false }] };
  const cher = { Nom: "Frappe ruineuse", Initiative: 10, Fatigue: 90, Arme: "", Effets_Compiles: [{ nom: "Dégâts physiques", desc: "30 dégâts", isMod: false }] };
  window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Aldo", classe: "", xp: 0, couleur: "#335", camp: "Allié",
      deckEquipe: ["C1", "C2", "C3"], PV_Max: 50, PV_Actuels: 50, Fatigue_Max: 50, fatigueActuelle: 50, Etats_Alteres: [] }];
  window.CACHE_COMPETENCES_GLOBAL = { H1: { C1: coup, C2: feu, C3: cher } };
  window.COMPETENCES_CACHE = {};
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]]; window.COMBAT_INDEX_PERSO = 0;
  window.COMBAT_FATIGUE_ACTUELLE = 50;
  window.PARTIE_DATA = { Phase_Combat: "Preparation", File_Attente_Combat: [] };
  window.chargerCompetencesCombat("H1", "#335");
  window.installerVoletCompetences();
  await new Promise(r => setTimeout(r, 120));
};
await p.evaluate(preparer);

console.log("\n1. LA PAGE DE PARCHEMIN, REPLIÉE À GAUCHE");
{
  const r = await p.evaluate(() => {
    const page = document.getElementById("volet-laniere");
    const b = page.getBoundingClientRect();
    return { tag: page.tagName, classe: page.className, fond: getComputedStyle(page).backgroundImage, droite: b.right, gauche: b.left, haut: b.top, h: b.height,
      ouvert: !!window.VOLET_COMPETENCES_OUVERT, pe: getComputedStyle(page).pointerEvents,
      ban: document.getElementById("combat-carte-C1").getBoundingClientRect().right };
  });
  verifier("une page du livre (images/grimoire/page.webp), plus la lanière de cuir", r.classe.includes("page-volet") && /images\/grimoire\/page\.webp/.test(r.fond), r.fond.slice(0, 80));
  verifier("repliée : seul son bord droit dépasse du bord gauche de l'écran (34 px)", !r.ouvert && Math.abs(r.droite - 34) <= 2 && r.gauche < 0, JSON.stringify(r));
  verifier("repliée : aucune bannière ne se voit", r.ban <= 2, String(r.ban));
  verifier("la page se touche (c'est elle qu'on clique)", r.pe === "auto");
}

console.log("\n2. UN CLIC : ELLE GLISSE VERS LA DROITE, JUSTE ASSEZ POUR LES BANNIÈRES");
{
  await p.click("#volet-laniere", { position: { x: 340, y: 300 }, force: true }).catch(() => {});
  await p.evaluate(() => { if (!window.VOLET_COMPETENCES_OUVERT) window.toggleVoletCompetences(); });
  const milieu = await p.evaluate(async () => { await new Promise(r => setTimeout(r, 200)); return document.getElementById("volet-contenu").getAnimations().map(a => a.animationName); });
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const page = document.getElementById("volet-laniere").getBoundingClientRect();
    const bans = [...document.querySelectorAll("#combat-liste-competences .banniere-carte-combat")].map(e => e.getBoundingClientRect());
    return { ouvert: window.VOLET_COMPETENCES_OUVERT, gauche: page.left, droite: page.right,
      dedans: bans.every(b => b.left >= page.left && b.right <= page.right + 1), n: bans.length };
  });
  verifier("l'animation fait glisser (voletGlisse), pas descendre", milieu.includes("voletGlisse"), milieu.join(","));
  verifier("ouverte : la page est posée au bord de l'écran, toute visible", r.ouvert && Math.abs(r.gauche) <= 1, JSON.stringify(r));
  verifier("les bannières (3 compétences + le Repos long) sont sur la page", r.n === 4 && r.dedans, JSON.stringify(r));
}

console.log("\n3. LES BANNIÈRES DE LA FICHE PERSONNAGE");
{
  const r = await p.evaluate(() => {
    const c1 = document.getElementById("combat-carte-C1"), c2 = document.getElementById("combat-carte-C2"), c3 = document.getElementById("combat-carte-C3");
    return {
      plaque: !!c1.querySelector("svg.dessin-banniere.plaque-banniere") && !!c1.querySelector("svg.dessin-banniere.medaillon-banniere"),
      init: (c1.querySelector(".init-banniere") || {}).textContent, titre: (c1.querySelector(".titre-banniere") || {}).textContent,
      rouge: (c1.querySelector(".aquarelle-banniere") || { dataset: {} }).dataset.types, bleu: (c2.querySelector(".aquarelle-banniere") || { dataset: {} }).dataset.types,
      differentes: c1.querySelector(".plaque-banniere").innerHTML !== c2.querySelector(".plaque-banniere").innerHTML,
      cadreCache: getComputedStyle(document.getElementById("cadre-combat-C1")).display,
      epuisee: c3.classList.contains("banniere-epuisee"), grise: getComputedStyle(c3).filter,
      repos: !!document.querySelector("#combat-carte-REPOS_LONG svg.plaque-banniere") };
  });
  verifier("tracées à l'encre comme dans la fiche (plaque + médaillon)", r.plaque && r.repos);
  verifier("l'initiative dans le médaillon, le nom sur la plaque", r.init === "40" && r.titre === "Coup de taille", `${r.init} / ${r.titre}`);
  verifier("l'aquarelle du type : rouge (physique) / bleu (magique)", r.bleu === "magique" && (r.rouge === undefined || r.rouge === "physique"), `${r.rouge} / ${r.bleu}`);
  verifier("chacune la sienne (le tracé change d'une bannière à l'autre)", r.differentes);
  verifier("l'ancien bandeau d'image ne se montre plus (gardé caché pour le code)", r.cadreCache === "none");
  verifier("trop chère : grisée, comme avant", r.epuisee && /grayscale/.test(r.grise), r.grise);
}

const postits = () => p.evaluate(() => [...document.querySelectorAll(".postit-competence")].map(e => ({ carte: e.dataset.carte, sorti: e.classList.contains("sorti"),
  rentre: e.classList.contains("rentre"), top: e.getBoundingClientRect().top, left: e.getBoundingClientRect().left, penche: e.style.getPropertyValue("--penche"),
  dessin: !!e.querySelector(".carte-encre .carte-entete .carte-titre"), titre: (e.querySelector(".carte-titre") || {}).textContent,
  fond: getComputedStyle(e).backgroundImage })));

console.log("\n4. À LA SOURIS : LE SURVOL SORT LE POST-IT");
{
  await p.hover("#combat-carte-C1", { force: true }).catch(() => {});
  const box = await p.evaluate(() => { const b = document.querySelector('.rang-banniere-combat[data-card-id="C1"] .boite-banniere-combat').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await p.mouse.move(box.x, box.y);
  await p.waitForTimeout(450);
  const a = await postits();
  const pageDroite = await p.evaluate(() => document.getElementById("volet-laniere").getBoundingClientRect().right);
  const ban1 = await p.evaluate(() => document.getElementById("combat-carte-C1").getBoundingClientRect().top);
  verifier("un post-it sort, avec la carte de la compétence dessinée (comme la fiche)", a.length === 1 && a[0].carte === "C1" && a[0].sorti && a[0].dessin && a[0].titre === "Coup de taille", JSON.stringify(a));
  verifier("il sort de sous la page, à droite", a[0] && a[0].left > pageDroite - 60, `${a[0] && a[0].left} / ${pageDroite}`);
  verifier("légèrement penché, jamais droit", a[0] && Math.abs(parseFloat(a[0].penche)) >= 1 && Math.abs(parseFloat(a[0].penche)) <= 4, a[0] && a[0].penche);
  verifier("à la hauteur de sa bannière", a[0] && Math.abs(a[0].top - ban1) < 60, `${a[0] && a[0].top} / ${ban1}`);
  verifier("papier jaune d'un post-it", a[0] && /gradient/.test(a[0].fond));

  const box2 = await p.evaluate(() => { const b = document.querySelector('.rang-banniere-combat[data-card-id="C2"] .boite-banniere-combat').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await p.mouse.move(box2.x, box2.y);
  await p.waitForTimeout(80);
  const b = await postits();
  const nouveau = b.find(x => x.carte === "C2"), ancien = b.find(x => x.carte === "C1");
  verifier("un autre pointé : le sien sort direct, décalé en hauteur", nouveau && nouveau.sorti && !nouveau.rentre && nouveau.top > a[0].top + 20, JSON.stringify(b));
  verifier("…et l'autre rentre vers la gauche", ancien && ancien.rentre, JSON.stringify(ancien));
  await p.waitForTimeout(600);
  verifier("puis s'efface (un seul post-it reste)", (await postits()).length === 1);

  await p.mouse.click(box2.x, box2.y);
  await p.waitForTimeout(150);
  const choix = await p.evaluate(() => ({ actif: document.getElementById("combat-carte-C2").dataset.actif, apercu: window.CARTE_EN_APERCU }));
  verifier("à la souris, le clic choisit la compétence (comme avant)", choix.actif === "true" && choix.apercu === "C2", JSON.stringify(choix));
  await p.mouse.click(box2.x, box2.y);   // on la relâche
  await p.mouse.move(900, 700);
  await p.waitForTimeout(1000);
  verifier("la souris s'en va : le post-it rentre", (await postits()).length === 0);
}

console.log("\n5. AU DOIGT (iPad) : LE PREMIER TOUCHER MONTRE, LE SECOND CHOISIT");
{
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: false });
  const t = await ctx.newPage();
  await t.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
  await t.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
  await t.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
  await t.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"><rect width="900" height="300" fill="#5a3a20"/></svg>' }));
  t.on('pageerror', e => erreurs.push("iPad : " + e.message));
  await t.goto(base + '/index.html');
  await t.waitForTimeout(2000);
  await t.evaluate(preparer);
  await t.evaluate(() => window.toggleVoletCompetences(true));
  await t.waitForTimeout(700);
  const centre = (id) => t.evaluate((id) => { const b = document.querySelector(`.rang-banniere-combat[data-card-id="${id}"] .boite-banniere-combat`).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, id);
  const c1 = await centre("C1");
  await t.touchscreen.tap(c1.x, c1.y);
  await t.waitForTimeout(450);
  const e1 = await t.evaluate(() => ({ postit: [...document.querySelectorAll(".postit-competence:not(.rentre)")].map(e => e.dataset.carte), actif: document.getElementById("combat-carte-C1").dataset.actif }));
  verifier("1er toucher : le post-it sort, rien n'est encore choisi", e1.postit.join() === "C1" && e1.actif === "false", JSON.stringify(e1));
  const c2 = await centre("C2");
  await t.touchscreen.tap(c2.x, c2.y);
  await t.waitForTimeout(100);
  const e2 = await t.evaluate(() => ({ postit: [...document.querySelectorAll(".postit-competence:not(.rentre)")].map(e => e.dataset.carte), rentre: [...document.querySelectorAll(".postit-competence.rentre")].map(e => e.dataset.carte), actif: document.getElementById("combat-carte-C2").dataset.actif }));
  verifier("toucher une autre : la sienne sort, l'autre rentre", e2.postit.join() === "C2" && e2.rentre.join() === "C1" && e2.actif === "false", JSON.stringify(e2));
  await t.touchscreen.tap(c2.x, c2.y);
  await t.waitForTimeout(150);
  const e3 = await t.evaluate(() => ({ actif: document.getElementById("combat-carte-C2").dataset.actif, apercu: window.CARTE_EN_APERCU }));
  verifier("2e toucher sur la même : elle est choisie", e3.actif === "true" && e3.apercu === "C2", JSON.stringify(e3));
  const r = await centre("REPOS_LONG");
  await t.touchscreen.tap(r.x, r.y); await t.waitForTimeout(400);
  const e4a = await t.evaluate(() => [...document.querySelectorAll(".postit-competence:not(.rentre)")].map(e => e.dataset.carte + ":" + (e.querySelector(".carte-titre") || {}).textContent));
  await t.touchscreen.tap(r.x, r.y); await t.waitForTimeout(150);
  const e4 = await t.evaluate(() => (window.CARTE_APERCU || {}).idCarte);
  verifier("le Repos long : son post-it, puis choisi au second toucher", e4a.join() === "REPOS_LONG:Repos long" && e4 === "REPOS_LONG", JSON.stringify({ e4a, e4 }));
  await t.evaluate(() => window.toggleVoletCompetences(false));
  await t.waitForTimeout(600);
  verifier("le volet se replie : les post-its rentrent avec lui", (await t.evaluate(() => document.querySelectorAll(".postit-competence").length)) === 0);
  await ctx.close();
}

console.log("\n6. LES VERSIONS");
{
  const html = lireFichier("index.html");
  verifier("version 508 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lireFichier("trace_combat.js")) || [])[1]) >= 508 && JSON.parse(lireFichier("version.json")).version >= 508);
  verifier("index.html : combat.js?v=191, style.css?v=162, grimoire_fiches.js?v=32 ou plus",
    Number((html.match(/combat\.js\?v=(\d+)"/) || [])[1]) >= 191 && Number((html.match(/style\.css\?v=(\d+)"/) || [])[1]) >= 162 && Number((html.match(/grimoire_fiches\.js\?v=(\d+)"/) || [])[1]) >= 32);
}
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
