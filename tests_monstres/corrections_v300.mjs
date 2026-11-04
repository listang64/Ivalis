// v300 — LE GRIMOIRE : RETOUCHES, PUIS LE RÉCIT DANS LE LIVRE (PARTIE 3).
//
// Retouches. Nico : « Journal d'un aventurier, sans couleur de surlignage, un
// peu plus gros » ; « enlève le surlignage jaune sur l'index, un trait
// grossier à la plume dessous de chaque ligne » ; « les 4 petits boutons, en
// haut à droite » ; « le marque-page index, réduis sa taille » ; « le livre,
// une fois la partie chargée, à la même place que dans le menu principal ; il
// masque l'ancienne interface ; masque la map, laisse le fond beige » ; « sur
// PC il prend toute la fenêtre : laisse une marge raisonnable au-dessus » ;
// « les anciennes fenêtres s'ouvrent au-dessus du livre ».
//
// Partie 3. Nico : « intégrer la partie chatbox au livre » — l'index et un
// second marque-page (une plume) vont au récit ; un sommaire des chapitres
// (chargés seulement à la demande) ; plus de bulles : le Narrateur écrit à la
// première personne ; les joueurs écrivent sur un parchemin qui sort du livre
// côté droit, le texte part en poussière vers le livre pendant que le
// Narrateur lite le récrit ; le post-it Narrateur lance le MJ ; quand il écrit
// (et quand des dés attendent), le parchemin rentre ; une note par jet demandé
// sort du livre, le joueur touche le dé, la note rentre, un petit dé reste
// dans la marge ; le Narrateur repart seul, les dés lancés ; le texte s'écrit
// progressivement, au bruit de la plume ; un nom touché : une bande de papier
// sort à gauche avec le portrait ; les portraits des PNJ en pause.
//
// Lancer : node tests_monstres/corrections_v300.mjs
// (IVALIS_RACINE=… pour un autre dossier ; V300_CAPTURES=dossier pour les captures.)
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lire = (f) => { try { return fs.readFileSync(path.join(RACINE, f), 'utf-8'); } catch (e) { return ""; } };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' }); res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({}); export const getApp = () => ({}); export const BANC_IVALIS = true;`;
// Une petite base en mémoire : ce qui s'écrit (setDoc, addDoc, updateDoc) se relit (getDoc, transactions).
const FAUX_FIRESTORE = `
  const docs = () => (window.__docs = window.__docs || {});
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...c) => ({ chemin: c.join("/") }); export const collection = (_db, ...c) => ({ col: c.join("/") });
  export const getDoc = async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => d || {}, id: r.chemin.split("/").pop() }; };
  export const query = (c) => c; export const where = () => ({}); export const orderBy = () => ({}); export const limit = () => ({});
  export const getDocs = async () => ({ forEach() {}, docs: [], empty: true, size: 0 });
  export const setDoc = async (r, d) => { docs()[r.chemin] = d; (window.__sets = window.__sets || []).push({ chemin: r.chemin, data: d }); };
  export const updateDoc = async (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d }); docs()[r.chemin] = Object.assign({}, docs()[r.chemin] || {}, d); };
  export const deleteDoc = async () => {};
  export const addDoc = async (c, d) => { (window.__ajouts = window.__ajouts || []).push({ col: c.col, data: d }); const id = "A" + window.__ajouts.length; docs()[c.col + "/" + id] = d; return { id }; };
  export const onSnapshot = () => () => {}; export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
  export const runTransaction = async (_db, f) => f({ get: async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => d || {} }; },
      update: (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d, tx: true }); docs()[r.chemin] = Object.assign({}, docs()[r.chemin] || {}, d); } });
  export const increment = (k) => k; export const deleteField = () => null;
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const serverTimestamp = () => Date.now();
  export class FieldPath {} export const Timestamp = { now: () => Date.now() };
`;
const CAPTURES = process.env.V300_CAPTURES || "";
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
// Les IA (Gemini), simulées : le Narrateur lite, les annonces, le titre d'un chapitre.
const appelsIA = [];
let iaEnPanne = false;
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**/generativelanguage.googleapis.com/**', r => {
  const corps = JSON.parse(r.request().postData() || "{}");
  const sys = ((corps.systemInstruction || {}).parts || [{}])[0].text || "", txt = (((corps.contents || [])[0] || {}).parts || [{}])[0].text || "";
  appelsIA.push({ url: r.request().url(), sys, txt });
  if (iaEnPanne) return r.fulfill({ status: 500, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: '{"error":{"message":"panne"}}' });
  let rep = "Je vois Thorin lever sa chope bien haut ; il trinque, avec un sourire qui ne présage rien de bon, « à la santé de ce vieux grincheux de Varos ! »";
  if (/donnes leur titre aux chapitres/.test(sys)) rep = "La tournée du nain";
  else if (/annonce du jeu/.test(sys)) rep = "Le jour se lève sur la route, et je compte nos pas.";
  r.fulfill({ status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'},
    body: JSON.stringify({ candidates: [{ content: { parts: [{ text: rep }] } }], usageMetadata: { totalTokenCount: 120 } }) });
});
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && /Grimoire/.test(m.text())) console.log('CONSOLE', m.text()); });
await p.goto(base + '/index.html'); await p.waitForTimeout(1200);
const titre = (t) => console.log("\n" + t);
const section = async (f) => { try { await f(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 180)); } };
const etat = () => p.evaluate(() => window.grimoireEtat());
const page = () => p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex());
const attendreQue = async (f, ms = 6000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await p.waitForTimeout(100); } return false; };
const cliquer = (sel) => p.evaluate((sel) => document.querySelector(sel).click(), sel);
const centre = (sel) => p.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, sel);
const dans = (x, y, sel) => p.evaluate(([x, y, sel]) => { const el = document.elementFromPoint(x, y); return !!(el && el.closest(sel)); }, [x, y, sel]);
const dessus = (x, y) => p.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? (el.id || "") + "|" + (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) : "rien"; }, [x, y]);
const angleDe = (t) => { const m = /matrix\(([-\d.e]+), ([-\d.e]+)/.exec(t || ""); return m ? Math.atan2(Number(m[2]), Number(m[1])) * 180 / Math.PI : 0; };
const relayer = (msgs, initial) => p.evaluate(([m, i]) => window.livreRecitMessages(m, { initial: i }), [msgs, !!initial]);

// Le joueur J1 joue Thorin ; J2 joue Lyra.
await p.evaluate(() => {
  localStorage.setItem("ID_JOUEUR_COURANT", "J1"); localStorage.setItem("ivalis_GEMINI_API_KEY", "cle-banc");
  window.__sons = []; window.__clics = 0; window.__appels = []; window.__entrees = []; window.__tours = 0; window.__jets = []; window.__vieux = [];
  window.jouerSonEvenement = (id) => { window.__sons.push([id, Date.now()]); return true; };
  window.jouerSonClic = () => { window.__clics++; };
  window.fermerToutesLesFenetres = () => {};
  window.COMPTE_JOUEUR = { nom: "Ben", email: "ben@ivalis.fr", admin: false };
  window.LISTE_PARTIES_CACHE = [{ id: "P1", nom: "Les Lames d'Héra" }];
  const heros = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", nom: "Ironfoot", race: "Nain", classe: "Guerrier", actif: true, urlCloudinary: "portrait-thorin.png" },
                 { idPersonnage: "H2", idJoueur: "J2", prenom: "Lyra", nom: "Sombreval", actif: true, urlCloudinary: "" }];
  window.PERSOS_JOUEURS_PARTIE = heros; window.PERSOS_PARTIE = heros.slice();
  window.PORTES_GRIMOIRE = {
    verifierCle: async () => true, creerPartie: async () => "P_NEUVE",
    verifierMdpPartie: async (id, m) => ({ ok: m === "sel" }),
    entrerDansPartie: (id) => { window.__entrees.push(id); window.ID_PARTIE_COURANTE = id; document.getElementById("ecran-jeu").style.display = "block"; }
  };
  ["ouvrirChatbox", "ouvrirMenuPersonnages", "ouvrirPopupRencontre", "ouvrirParametres"].forEach(n => { window[n] = () => window.__appels.push(n); });
  window.declencherTourIA = async () => { window.__tours++; };
  window.__vraiJet = window.lancerJetPourHeros;
  window.lancerJetPourHeros = async (id, c) => { window.__jets.push([id, c]); return true; };
  // L'ancien chat : ce qu'il ferait par-dessus le livre.
  window.lancerRecitDynamique = () => window.__vieux.push("parchemin");
  window.majRecitDynamique = () => window.__vieux.push("parchemin+");
  window.annoncerJetsDemandes = () => window.__vieux.push("bandeau");
  const attente = window.afficherEcranAttente;
  window.afficherEcranAttente = (t) => { window.__vieux.push("attente:" + (t || "")); };
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== "ecran-grimoire") e.style.display = "none"; });
  window.afficherGrimoire();
});
await p.waitForTimeout(1300);
await p.evaluate(() => window.ouvrirGrimoire());
await p.waitForTimeout(1200);

// =========================================================================
titre("1. RETOUCHES : LE JOURNAL, LE SOULIGNÉ, LES BOUTONS EN HAUT, LE MARQUE-PAGE, LA MARGE");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const e = document.querySelector(".journal-entete"), u = parseFloat(document.getElementById("grimoire-scene").style.getPropertyValue("--u"));
    const nav = document.getElementById("menu-navigation-bas"), rn = nav.getBoundingClientRect();
    const m = document.getElementById("grimoire-marque-page"), k = document.querySelector(".grimoire-fond-livre").getBoundingClientRect().width / 2000;
    return { texte: e.innerText.trim(), surligne: !!document.querySelector(".journal-entete .surligneur, .nom-surligne"), taille: parseFloat(getComputedStyle(e).fontSize) / u,
             nav: nav.parentNode.id, haut: rn.top, droite: innerWidth - rn.right, largeurMarque: m.getBoundingClientRect().width, k, mw: parseFloat(getComputedStyle(m).width) / k };
  });
  verifier("« Journal d'un aventurier », sans surlignage", r.texte === "Journal d'un aventurier" && !r.surligne, r.texte);
  verifier("… un peu plus gros (6,6 % de la page au lieu de 5)", r.taille > 6 && r.taille < 8, r.taille.toFixed(2));
  verifier("les petits boutons, en haut à droite (dans le livre)", r.nav === "ecran-grimoire" && r.haut < 30 && r.droite < 30, `haut ${r.haut.toFixed(0)}, droite ${r.droite.toFixed(0)}`);
  verifier("le marque-page de l'index, plus petit (66 au lieu de 92, en unités du livre)", Math.abs(r.mw - 66) < 2, r.mw.toFixed(1));
  // La marge du haut : sur un écran de PC, le livre la laisse ; sur iPad, elle y était déjà.
  for (const [w, h] of [[1920, 1080], [1440, 900], [1194, 834]]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(400);
    const g = await p.evaluate(() => { const f = document.querySelector(".grimoire-fond-livre").getBoundingClientRect(); return { haut: f.top, bas: innerHeight - f.bottom, vh: innerHeight, w: f.width, vw: innerWidth }; });
    verifier(`${w} × ${h} : une marge raisonnable au-dessus du livre, posé en bas`, g.haut >= g.vh * 0.1 && g.bas <= g.vh * 0.013 + 1 && g.w <= g.vw, `${g.haut.toFixed(0)} px au-dessus, ${g.bas.toFixed(0)} dessous`);
  }
});

// =========================================================================
titre("2. LA PARTIE CHARGÉE : LE LIVRE À SA PLACE, SUR LE FOND BEIGE ; LES ANCIENNES FENÊTRES PAR-DESSUS");
// =========================================================================
let avantPartie = null;
await section(async () => {
  avantPartie = await p.evaluate(() => { const r = document.getElementById("grimoire-scene").getBoundingClientRect(); return [r.left, r.top, r.width]; });
  await cliquer("#grimoire-btn-charger");
  await p.waitForTimeout(700);
  await cliquer('#grimoire-liste-parties [data-id="P1"]');
  await p.waitForTimeout(150);
  await p.fill("#grimoire-mdp-partie", "sel");
  await cliquer("#grimoire-valider-partie");
  await p.waitForTimeout(1300);
  await relayer([], true);
  const r = await p.evaluate(() => {
    const ecran = document.getElementById("ecran-grimoire"), sc = document.getElementById("grimoire-scene").getBoundingClientRect();
    return { e: window.grimoireEtat(), parent: ecran.parentNode.id, fond: getComputedStyle(ecran, "::before").opacity, place: [sc.left, sc.top, sc.width],
             menu: getComputedStyle(document.getElementById("menu-lateral")).display, nav: document.getElementById("menu-navigation-bas").parentNode.id,
             navHaut: document.getElementById("menu-navigation-bas").getBoundingClientRect().top };
  });
  verifier("le livre s'ouvre à l'index, à la même place que dans le menu", r.e.enPartie && r.e.page === 3 && r.place.every((v, i) => Math.abs(v - avantPartie[i]) < 1.5), JSON.stringify(r.place.map(Math.round)));
  verifier("le fond beige reste ; la carte est masquée", r.fond === "1" && await dans(5, 5, "#ecran-grimoire") && await dans(r.place[0] / 2, 400, "#ecran-grimoire"), await dessus(5, 5));
  verifier("l'ancien menu de droite se cache ; les petits boutons restent en haut à droite", r.menu === "none" && r.nav === "ecran-grimoire" && r.navHaut < 30, `${r.menu}, ${r.nav}`);
  // Une ancienne fenêtre (ici le combat) s'ouvre par-dessus le livre.
  const f = await p.evaluate(() => { const el = document.getElementById("fenetre-combat"); el.style.display = "block"; const r = el.getBoundingClientRect(); const x = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); const ok = !!(x && x.closest("#fenetre-combat")); el.style.display = "none"; return ok; });
  verifier("les anciennes fenêtres (le combat…) s'ouvrent par-dessus le livre", f);
  await cliquer("#grimoire-index-fiches");
  await p.waitForTimeout(200);
  verifier("« Les fiches personnages » ouvre encore l'ancienne fenêtre", (await p.evaluate(() => window.__appels.join(","))) === "ouvrirMenuPersonnages");
  await cliquer("#grimoire-index-carte");
  await p.waitForTimeout(200);
  verifier("« Carte du monde » : bientôt dans le livre", /bientôt/.test(await p.evaluate(() => document.getElementById("grimoire-note-index").textContent)));
  const sou = await p.evaluate(() => [...document.querySelectorAll(".entree-index-texte")].map(t => decodeURIComponent(getComputedStyle(t).backgroundImage)));
  verifier("l'index souligné à la plume : un trait d'encre sous chaque ligne, plus de jaune", sou.length === 6 && sou.every(s => /rgba\(20,12,6/.test(s) && !/236,190,60/.test(s)), sou.length);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v300_index.png" });
});

// =========================================================================
titre("3. LE RÉCIT : L'INDEX ET LE MARQUE-PAGE À LA PLUME Y VONT ; LE SOMMAIRE");
// =========================================================================
const NARRATION = `J'ai connu des tavernes plus accueillantes que <span class="pnj-chat-hover"><strong>Le Chaudron Fêlé</strong><img src="chaudron.png" class="pnj-hover-img"></span>, mais rarement d'aussi bruyantes.<br>Derrière le comptoir, <strong style="color: #e8d5a5;">Varos</strong> essuie une chope avec un chiffon plus sale qu'elle. « On ne sert pas les nains avant midi », grogne-t-il sans lever les yeux.<br>Thorin, bien sûr, prend ça pour une invitation. Lyra soupire. Moi, je compte les sorties.`;
const M = [
  { idDoc: "m1", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: NARRATION, Timestamp: 1000 },
  { idDoc: "m2", ID_Partie: "P1", Auteur_ID: "H1", Auteur_Nom: "Thorin", Texte: "je tape sur le comptoir", Texte_Livre: "Thorin abat son poing sur le comptoir, et je vois trois chopes sauter de frayeur.", Livre: true, Timestamp: 2000 },
  { idDoc: "m2b", ID_Partie: "P1", Auteur_ID: "H2", Auteur_Nom: "Lyra", Texte: "je regarde les sorties", Timestamp: 2100 }
];
await section(async () => {
  await relayer(M, true);
  const m = await p.evaluate(() => {
    const a = document.getElementById("grimoire-marque-page").getBoundingClientRect(), b = document.getElementById("grimoire-marque-recit");
    const rb = b.getBoundingClientRect();
    return { existe: !!b, actif: !b.classList.contains("inactif"), decale: rb.left - a.left, angleA: getComputedStyle(document.getElementById("grimoire-marque-page")).transform, angleB: getComputedStyle(b).transform,
             plume: !!b.querySelector("svg.dessin-marque path.feuille"), haut: rb.top };
  });
  verifier("un second marque-page, à la plume, un peu décalé du premier", m.existe && m.plume && m.decale > 20 && m.decale < 120, `${m.decale.toFixed(0)} px plus loin`);
  verifier("… penché de l'autre côté, allumé en partie", angleDe(m.angleB) > 2 && angleDe(m.angleA) < -2 && m.actif, `${angleDe(m.angleB).toFixed(1)}°`);
  await cliquer("#grimoire-index-recit");
  await p.waitForTimeout(1000);
  const r = await p.evaluate(() => ({ page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), n: window.grimoireEtat().nbPages,
    entete: (document.querySelector("#grimoire-suite-2 .numero-chapitre") || {}).textContent, sous: (document.querySelector("#grimoire-suite-2 .titre-chapitre") || {}).textContent }));
  verifier("« Le récit » de l'index : les pages tournent jusqu'au chapitre en cours", r.page === 7 && r.entete === "Chapitre I" && /en cours/.test(r.sous), JSON.stringify(r));
  await p.evaluate(() => window.grimoireAllerIndex());
  await p.waitForTimeout(900);
  const mp = await centre("#grimoire-marque-recit");
  await p.mouse.click(mp.x, mp.y - mp.h * 0.3);
  await p.waitForTimeout(1000);
  verifier("le marque-page à la plume y va aussi", (await page()) === 7, String(await page()));
  await p.evaluate(() => window.GRIMOIRE.allerALaPage(5));
  await p.waitForTimeout(900);
  const s = await p.evaluate(() => ({ titre: (document.querySelector("#grimoire-suite-0 .titre-sommaire") || {}).textContent, lignes: [...document.querySelectorAll(".ligne-sommaire")].map(l => l.innerText.replace(/\s+/g, " ").trim()) }));
  verifier("avant le chapitre, le sommaire du récit : le chapitre en cours", s.titre === "Le récit" && s.lignes.join("|") === "I Le chapitre en cours", JSON.stringify(s));
  await cliquer('.ligne-sommaire[data-recit="courant"]');
  await p.waitForTimeout(1000);
  verifier("… qui ramène au chapitre", (await page()) === 7);
});

// =========================================================================
titre("4. LE LIVRE : LE NARRATEUR EN PROSE, LES NOMS, L'ANCIEN CHAT QUI SE TAIT");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const paras = [...document.querySelectorAll("#grimoire-suite-2 .para-recit")];
    return { paras: paras.map(p => p.innerText.replace(/\s+/g, " ").trim()), noms: [...document.querySelectorAll("#grimoire-suite-2 .nom-livre")].map(a => a.dataset.nom),
             caches: document.querySelectorAll(".mot.a-ecrire").length, bulles: document.querySelectorAll("#grimoire-suite-2 .bulle, #grimoire-suite-2 img").length };
  });
  verifier("la narration en paragraphes de livre (sans balises, sans bulles)", r.paras.length === 5 && /^J'ai connu des tavernes/.test(r.paras[0]) && r.bulles === 0, r.paras.length + " paragraphes");
  verifier("la ligne d'un joueur : celle du livre (récrite), pas ses mots bruts", r.paras.some(t => /trois chopes sauter de frayeur/.test(t)) && !r.paras.some(t => /je tape sur le comptoir/.test(t)));
  verifier("une ligne d'avant le livre (sans récriture) : rapportée telle quelle", r.paras.some(t => /Lyra : « je regarde les sorties »/.test(t)), r.paras[4]);
  verifier("les PNJ et les héros nommés se touchent", ["Le Chaudron Fêlé", "Varos", "Thorin", "Lyra"].every(n => r.noms.includes(n)), r.noms.join(","));
  verifier("ce qui était écrit avant l'arrivée est là d'un coup (pas d'encre qui coule)", r.caches === 0, String(r.caches));
  // Une nouvelle page du Narrateur : l'ancien parchemin, l'écran d'attente et le bandeau ne s'ouvrent plus.
  await p.evaluate(() => { window.__vieux = []; window.lancerRecitDynamique("x"); window.afficherEcranAttente(); window.annoncerJetsDemandes({}); window.afficherEcranAttente("archivage"); });
  verifier("l'ancien chat se tait (parchemin, écran d'attente, bandeau des dés)", (await p.evaluate(() => window.__vieux.join(","))) === "attente:archivage", await p.evaluate(() => window.__vieux.join(",")));
});

// =========================================================================
titre("5. LA PLUME : LE TEXTE NOUVEAU S'ÉCRIT VITE, MOT APRÈS MOT, AU BRUIT DE LA PLUME");
// =========================================================================
const M2 = M.concat([{ idDoc: "m3", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Recit_En_Cours: true,
  Texte: "Varos lève enfin les yeux. Il considère Thorin longuement, puis éclate d'un rire qui fait trembler les poutres et tinter les chopes pendues au-dessus du comptoir.", Timestamp: 3000 }]);
await section(async () => {
  await p.evaluate(() => { window.__sons = []; });
  await relayer(M2);
  await p.waitForTimeout(250);
  const a = await p.evaluate(() => ({ caches: document.querySelectorAll('.para-recit[data-e="m3"] .mot.a-ecrire').length, total: document.querySelectorAll('.para-recit[data-e="m3"] .mot').length }));
  verifier("la page nouvelle du Narrateur s'écrit : au début, presque tout reste à écrire", a.total > 20 && a.caches > a.total * 0.7, `${a.caches}/${a.total}`);
  await p.waitForTimeout(1000);
  const b1 = await p.evaluate(() => document.querySelectorAll('.para-recit[data-e="m3"] .mot.ecrit').length);
  verifier("… vite : une quinzaine de mots par seconde", b1 >= 12 && b1 <= 26, `${b1} mots en ~1,25 s`);
  // Le texte grandit pendant qu'il s'écrit (le Narrateur n'a pas fini) : la plume continue.
  const M3 = M2.map(m => m.idDoc === "m3" ? { ...m, Recit_En_Cours: false, Texte: m.Texte + "<br>« Un nain qui frappe mon comptoir, c'est un nain qui paie sa tournée », dit-il en posant trois chopes devant nous." } : m);
  await relayer(M3);
  await attendreQue(() => p.evaluate(() => document.querySelectorAll('.para-recit[data-e="m3"] .mot.a-ecrire').length === 0), 6000);
  const c = await p.evaluate(() => ({ restants: document.querySelectorAll('.mot.a-ecrire').length, paras: document.querySelectorAll('.para-recit[data-e="m3"]:not(.suite)').length,
    sons: window.__sons.filter(s => s[0] === "plume-ecrit").length }));
  verifier("le texte qui arrive pendant l'écriture s'écrit à la suite, jusqu'au bout", c.restants === 0 && c.paras === 2, JSON.stringify(c));
  verifier("le bruit de la plume qui gratte le parchemin", c.sons >= 10, `${c.sons} grattements`);
});

// =========================================================================
titre("6. LE PARCHEMIN D'ÉCRITURE ET LE POST-IT DU NARRATEUR");
// =========================================================================
let M4 = null;
await section(async () => {
  const r = await p.evaluate(() => {
    const e = document.getElementById("recit-ecriture"), pap = e.querySelector(".papier-ecriture").getBoundingClientRect(), droite = document.getElementById("grimoire-suite-3").getBoundingClientRect();
    const pi = document.getElementById("recit-postit"), rp = pi.getBoundingClientRect();
    return { sorti: e.classList.contains("sortie"), place: document.getElementById("recit-saisie").placeholder, pap: [pap.left, pap.right, pap.top, pap.bottom], page: [droite.left, droite.right, droite.top, droite.bottom],
             postit: pi.classList.contains("sortie"), postitDepasse: rp.right > droite.right + 5, postitTexte: pi.innerText.trim() };
  });
  // v301 : le parchemin est devenu un marque-page au-dessus de la page de droite (corrections_v301).
  verifier("sur les pages du récit, le parchemin d'écriture sort (v301 : au-dessus de la page droite)", r.sorti && r.pap[0] > r.page[0] && r.pap[1] < r.page[1] && r.pap[2] < r.page[2], JSON.stringify(r.pap.map(Math.round)));
  verifier("… pour écrire ce que son héros dit ou fait", r.place === "Ce que Thorin dit ou fait…", r.place);
  verifier("le post-it « Narrateur » dépasse du côté droit du livre", r.postit && r.postitDepasse && r.postitTexte === "Narrateur", r.postitTexte);
  // Le texte de la page de droite ne passe jamais sous le parchemin : elle garde sa marge basse.
  const marge = await p.evaluate(() => { const c = document.querySelector("#grimoire-suite-3 .page-recit"); return parseFloat(getComputedStyle(c).paddingBottom) / c.getBoundingClientRect().height; });
  verifier("v301 : la page de droite n'a plus à garder de marge basse", marge < 0.1, marge.toFixed(2));
  // Sur l'index, le parchemin et le post-it rentrent.
  await p.evaluate(() => window.grimoireAllerIndex());
  await p.waitForTimeout(900);
  const i = await p.evaluate(() => ({ e: document.getElementById("recit-ecriture").classList.contains("sortie"), p: document.getElementById("recit-postit").classList.contains("sortie") }));
  verifier("ailleurs dans le livre (l'index), ils rentrent", !i.e && !i.p, JSON.stringify(i));
  await p.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit());
  await p.waitForTimeout(1000);
  // ÉCRIRE : la poussière, le Narrateur lite, la ligne du livre.
  await p.evaluate(() => { window.__sons = []; window.__ajouts = []; });
  const texte = "Je lève ma chope et je trinque à la santé de ce vieux grincheux de Varos !";
  await p.fill("#recit-saisie", texte);
  await p.press("#recit-saisie", "Enter");
  await p.waitForTimeout(350);
  const vol = await p.evaluate(() => ({ lettres: document.querySelectorAll(".recit-poussiere .poussiere-texte span").length, grains: document.querySelectorAll(".recit-poussiere .grain-poussiere").length,
    vide: document.getElementById("recit-saisie").value === "", rentre: !document.getElementById("recit-ecriture").classList.contains("sortie"), son: window.__sons.some(s => s[0] === "poussiere-envol") }));
  verifier("validé : le texte se détache en lettres qui partent en poussière", vol.lettres === texte.length && vol.grains > 20 && vol.vide, `${vol.lettres} lettres, ${vol.grains} grains`);
  verifier("… le parchemin rentre pendant le vol, un souffle l'accompagne", vol.rentre && vol.son);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v300_poussiere.png" });
  await attendreQue(() => p.evaluate(() => (window.__ajouts || []).some(a => a.col === "Messages_Chat")), 5000);
  const ajout = await p.evaluate(() => (window.__ajouts || []).find(a => a.col === "Messages_Chat"));
  const lite = appelsIA.find(a => /Narrateur d'Ivalis/.test(a.sys) && /CE QU'ÉCRIT SON JOUEUR/.test(a.txt));
  verifier("le Narrateur lite (Flash-Lite) reçoit les mots du joueur et la fin du livre", lite && /gemini-flash-lite-latest/.test(lite.url) && lite.txt.includes(texte) && /trois chopes/.test(lite.txt) && /Thorin Ironfoot/.test(lite.txt), lite ? lite.txt.slice(0, 80) : "aucun appel");
  verifier("… et sa consigne : première personne, garder l'essence, ne pas inventer la suite", lite && /première personne/.test(lite.sys) && /essence/.test(lite.sys) && /n'invente/.test(lite.sys));
  verifier("la ligne part dans la partie : les mots du joueur et ceux du livre", ajout && ajout.data.Texte === texte && /trinque/.test(ajout.data.Texte_Livre) && ajout.data.Livre === true && ajout.data.Auteur_ID === "H1", ajout ? ajout.data.Texte_Livre.slice(0, 60) : "rien");
  M4 = M2.map(m => m.idDoc === "m3" ? { ...m, Recit_En_Cours: false } : m).concat([{ idDoc: "m4", ...ajout.data, Timestamp: 4000 }]);
  await relayer(M4);
  await p.waitForTimeout(150);
  const s = await p.evaluate(() => ({ caches: document.querySelectorAll('.para-recit[data-e="m4"] .mot.a-ecrire').length, sorti: document.getElementById("recit-ecriture").classList.contains("sortie") }));
  verifier("elle s'écrit à son tour dans le livre, à l'encre ; le parchemin ressort", s.caches > 5 && s.sorti, JSON.stringify(s));
  await attendreQue(() => p.evaluate(() => document.querySelectorAll('.mot.a-ecrire').length === 0), 5000);
  // Le Narrateur lite en panne : la ligne part quand même, telle quelle.
  iaEnPanne = true;
  await p.evaluate(() => { window.__ajouts = []; });
  await p.fill("#recit-saisie", "Je cherche la sortie de derrière");
  await cliquer("#recit-envoyer");
  await attendreQue(() => p.evaluate(() => (window.__ajouts || []).length > 0), 5000);
  iaEnPanne = false;
  const secours = await p.evaluate(() => (window.__ajouts[0] || {}).data || {});
  verifier("le Narrateur lite muet : la ligne part quand même, telle quelle", secours.Texte_Livre === "Thorin : « Je cherche la sortie de derrière »", secours.Texte_Livre);
  // Le livre a maintenant 5 lignes : le Narrateur lite n'a reçu que les 4 dernières.
  const lite2 = appelsIA.filter(a => /CE QU'ÉCRIT SON JOUEUR/.test(a.txt)).slice(-1)[0];
  const lignes = lite2 ? lite2.txt.split("LE HÉROS")[0].split("\n").filter(l => l.trim() && !/DERNIÈRES LIGNES/.test(l)) : [];
  verifier("… le Narrateur lite ne reçoit que les 4 dernières lignes du livre", lignes.length === 4 && !/J'ai connu des tavernes/.test(lite2.txt) && /trinque/.test(lite2.txt), `${lignes.length} lignes`);
  // Le post-it : le Narrateur écrit la suite.
  await p.evaluate(() => { window.__tours = 0; });
  const pc = await centre("#recit-postit");
  await p.mouse.click(pc.x + pc.w * 0.3, pc.y);
  await p.waitForTimeout(200);
  verifier("le post-it lance le Narrateur (la séquence du MJ)", (await p.evaluate(() => window.__tours)) === 1);
  // Le Narrateur écrit : le parchemin rentre chez tout le monde, le post-it s'éteint.
  await p.evaluate(() => window.livreRecitPartie({ IA_En_Cours: true }));
  await p.waitForTimeout(150);
  const v = await p.evaluate(() => ({ e: document.getElementById("recit-ecriture").classList.contains("sortie"), p: document.getElementById("recit-postit").classList.contains("eteint"), d: document.getElementById("recit-postit").disabled }));
  verifier("le Narrateur écrit : le parchemin rentre, le post-it s'éteint (pas d'écran de chargement)", !v.e && v.p && v.d, JSON.stringify(v));
  await p.mouse.click(pc.x + pc.w * 0.3, pc.y);
  await p.waitForTimeout(150);
  verifier("… et ne se relance pas", (await p.evaluate(() => window.__tours)) === 1);
  await p.evaluate(() => window.livreRecitPartie({ IA_En_Cours: false }));
  await p.waitForTimeout(200);
  verifier("il a fini : le parchemin ressort", await p.evaluate(() => document.getElementById("recit-ecriture").classList.contains("sortie")));
});

// =========================================================================
titre("7. LES DÉS : UNE NOTE PAR JET SORT DU LIVRE ; LE DÉ DANS LA MARGE ; LE NARRATEUR REPART");
// =========================================================================
await section(async () => {
  const arbitre = { idDoc: "m5", ID_Partie: "P1", Auteur_ID: "ARBITRE_DES", Auteur_Nom: "Arbitre des dés", Texte: "🎲 …", Timestamp: 5000,
    Jets_Demandes: [{ idPerso: "H1", heros: "Thorin", caracteristique: "CHARISME", difficulte: "moyenne", action: "trinquer sans vexer Varos" },
                    { idPerso: "H2", heros: "Lyra", caracteristique: "SAGESSE", difficulte: "facile", action: "repérer la porte de derrière" }] };
  const M5 = M4.concat([arbitre]);
  await relayer(M5);
  await p.waitForTimeout(900);
  const n = await p.evaluate(() => [...document.querySelectorAll(".note-de")].map(el => ({ sortie: el.classList.contains("sortie"), aMoi: el.classList.contains("a-moi"), texte: el.innerText.replace(/\s+/g, " ").trim(),
    penche: el.style.getPropertyValue("--penche"), bouton: !el.querySelector(".note-lancer").disabled, haut: el.getBoundingClientRect().top })));
  const livreHaut = await p.evaluate(() => document.getElementById("grimoire-suite-2").getBoundingClientRect().top);
  verifier("une note par jet demandé sort du haut du livre", n.length === 2 && n.every(x => x.sortie && x.haut < livreHaut - 30), JSON.stringify(n.map(x => Math.round(x.haut))));
  verifier("… pas bien droite, avec le héros, le jet, la difficulté, l'action", n.every(x => x.penche && x.penche !== "0.0deg") && /Thorin jet de Charisme · moyenne trinquer sans vexer Varos/.test(n[0].texte), n[0].texte);
  verifier("seul le joueur du héros peut toucher son dé", n[0].aMoi && n[0].bouton && !n[1].aMoi && !n[1].bouton);
  const ecr = await p.evaluate(() => ({ e: document.getElementById("recit-ecriture").classList.contains("sortie"), p: document.getElementById("recit-postit").disabled }));
  verifier("pendant que les dés attendent, personne n'écrit (le parchemin rentre)", !ecr.e && ecr.p, JSON.stringify(ecr));
  verifier("rien de la demande ne s'écrit dans le récit", !(await p.evaluate(() => [...document.querySelectorAll(".para-recit")].some(p => /Charisme|SAGESSE|jet de/i.test(p.innerText)))));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v300_des.png" });
  await p.evaluate(() => { window.__jets = []; document.querySelector('.note-de.a-moi .note-lancer').click(); });
  await p.waitForTimeout(200);
  verifier("le dé touché lance le jet demandé (sans ouvrir la fiche)", JSON.stringify(await p.evaluate(() => window.__jets)) === '[["H1","CHARISME"]]', JSON.stringify(await p.evaluate(() => window.__jets)));
  // Le jet de Thorin tombe ; celui de Lyra manque encore : sa note reste, le Narrateur attend.
  await p.evaluate(() => { window.__tours = 0; });
  const jetThorin = { idDoc: "m6", ID_Partie: "P1", Auteur_ID: "H1", Auteur_Nom: "Thorin Ironfoot", Texte: "🎲 Jet de **CHARISME** pour **Thorin Ironfoot** : Résultat : 14 +1 = **15**", Timestamp: 6000 };
  const M6 = M5.concat([jetThorin]);
  await relayer(M6);
  await p.waitForTimeout(900);
  const apres = await p.evaluate(() => ({ notes: document.querySelectorAll(".note-de").length, tours: window.__tours,
    de: (() => { const d = document.querySelector('.para-recit[data-e="m4"] .de-marge'); return d ? { total: d.innerText.trim(), titre: d.title, x: d.getBoundingClientRect().left, para: d.parentNode.getBoundingClientRect().left } : null; })() }));
  verifier("le jet lancé : sa note rentre dans le livre (l'autre attend)", apres.notes === 1, String(apres.notes));
  verifier("dans la marge, un petit dé et son résultat, à côté de l'action", apres.de && apres.de.total === "15" && /Charisme : 14 \+1 = 15/.test(apres.de.titre) && apres.de.x < apres.de.para, JSON.stringify(apres.de));
  verifier("un jet manque encore : le Narrateur attend", apres.tours === 0);
  // Le jet de Lyra (un autre joueur) : la dernière note rentre ; le Narrateur repart chez celui qui a lancé le dernier dé.
  const M7 = M6.concat([{ idDoc: "m7", ID_Partie: "P1", Auteur_ID: "H2", Auteur_Nom: "Lyra", Texte: "🎲 Jet de **SAGESSE** pour **Lyra Sombreval** : Résultat : 20 +2 = **22**", Timestamp: 7000 }]);
  await relayer(M7);
  await p.waitForTimeout(1200);
  verifier("le dernier dé lancé par un autre joueur : c'est son poste qui relance le Narrateur", (await p.evaluate(() => window.__tours)) === 0 && (await p.evaluate(() => document.querySelectorAll(".note-de").length)) === 0);
  // Même scène, mais c'est mon héros qui lance le dernier dé : le Narrateur repart tout seul, une fois.
  const M8 = M4.concat([{ ...arbitre, idDoc: "m8", Timestamp: 8000, Jets_Demandes: [arbitre.Jets_Demandes[0]] }]);
  await relayer(M8);
  await p.waitForTimeout(300);
  await relayer(M8.concat([{ ...jetThorin, idDoc: "m9", Timestamp: 9000, Texte: "🎲 Jet de **CHARISME** pour **Thorin Ironfoot** : Résultat : 1 +1 = **2**" }]));
  await p.waitForTimeout(1200);
  verifier("tous les dés lancés (le dernier par mon héros) : le Narrateur repart tout seul", (await p.evaluate(() => window.__tours)) === 1, String(await p.evaluate(() => window.__tours)));
  verifier("un 1 naturel : le petit dé de la marge en rouge", await p.evaluate(() => !!document.querySelector(".de-marge.fumble")));
});

// =========================================================================
titre("7 bis. LE COMBAT DU RÉCIT : SA NOTE SORT DU LIVRE (L'ANCIEN PARCHEMIN SE TAIT)");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.__combat = 0; window.rejoindreCombatRP = () => { window.__combat++; }; });
  await p.evaluate(() => window.livreRecitPartie({ IA_En_Cours: false, Combat_RP: { Etat: "detection" } }));
  await p.waitForTimeout(800);
  const d = await p.evaluate(() => { const n = document.querySelector(".note-combat"); return n ? { sortie: n.classList.contains("sortie"), texte: n.innerText.trim(), bouton: !!n.querySelector("button") } : null; });
  verifier("le Narrateur a vu venir un combat : « Le destin hésite… » sort du livre", d && d.sortie && /destin hésite/.test(d.texte) && !d.bouton, JSON.stringify(d));
  await p.evaluate(() => window.livreRecitPartie({ IA_En_Cours: false, Combat_RP: { Etat: "preparation", Adversaires: "trois brigands" } }));
  await p.waitForTimeout(300);
  const c = await p.evaluate(() => ({ texte: document.querySelector(".note-combat").innerText.replace(/\s+/g, " ").trim(), ecriture: document.getElementById("recit-ecriture").classList.contains("sortie") }));
  verifier("puis : « Face à trois brigands — Combattre » ; pendant le combat, on n'écrit pas", /Face à trois brigands Combattre/.test(c.texte) && !c.ecriture, JSON.stringify(c));
  await p.evaluate(() => document.querySelector(".note-combattre").click());
  await p.waitForTimeout(150);
  verifier("le bouton rejoint le combat (rejoindreCombatRP)", (await p.evaluate(() => window.__combat)) === 1);
  await p.evaluate(() => window.livreRecitPartie({ IA_En_Cours: false, Combat_RP: { Etat: "aucun" } }));
  await p.waitForTimeout(900);
  verifier("le combat fini : la note rentre, le parchemin ressort", (await p.evaluate(() => !document.querySelector(".note-combat") && document.getElementById("recit-ecriture").classList.contains("sortie"))));
});

// =========================================================================
titre("8. UN NOM TOUCHÉ : LA BANDE DU PORTRAIT SORT DU LIVRE CÔTÉ GAUCHE");
// =========================================================================
await section(async () => {
  await relayer(M4);
  await p.waitForTimeout(300);
  const nom = await centre('#grimoire-suite-2 .nom-livre[data-nom="Thorin"]');
  await p.mouse.click(nom.x, nom.y);
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const el = document.getElementById("recit-portrait"), b = el.querySelector(".bande-portrait").getBoundingClientRect(), g = document.getElementById("grimoire-suite-2").getBoundingClientRect();
    return { sortie: el.classList.contains("sortie"), img: (el.querySelector("img") || {}).getAttribute ? el.querySelector("img").getAttribute("src") : "", nom: document.getElementById("recit-portrait-nom").textContent,
             gauche: b.left < g.left + g.width * 0.5, haute: b.top < g.top };
  });
  verifier("Thorin touché : une bande de papier sort (v301 : du haut de la page gauche), avec son portrait", r.sortie && r.img === "portrait-thorin.png" && r.nom === "Thorin Ironfoot" && r.gauche && r.haute, JSON.stringify(r));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v300_portrait.png" });
  const varos = await centre('#grimoire-suite-2 .nom-livre[data-nom="Varos"]');
  await p.mouse.click(varos.x, varos.y);
  await p.waitForTimeout(600);
  const v = await p.evaluate(() => ({ sil: !!document.querySelector("#recit-portrait .silhouette"), nom: document.getElementById("recit-portrait-nom").textContent }));
  verifier("un PNJ sans portrait (les portraits sont en pause) : une silhouette à la plume", v.sil && v.nom === "Varos", JSON.stringify(v));
  await p.mouse.click(600, 20);
  await p.waitForTimeout(600);
  verifier("un toucher ailleurs : la bande rentre dans le livre", !(await p.evaluate(() => document.getElementById("recit-portrait").classList.contains("sortie"))));
});

// =========================================================================
titre("9. LES PAGES : LE RÉCIT SE COUPE AU MOT, CONTINUE, ET LE LECTEUR LE SUIT");
// =========================================================================
await section(async () => {
  const phrase = "Nous marchons longtemps dans la poussière dorée de la route d'Arcaï, et je note chaque pas, chaque juron de Thorin, chaque silence de Lyra, comme on garde des pierres précieuses dans une bourse trop petite.";
  const long = Array.from({ length: 9 }, (_, i) => `${i + 1}. ${phrase}`).join("<br>");
  const M9 = M4.concat([{ idDoc: "m10", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: long, Timestamp: 10000 }]);
  await p.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit());
  await p.waitForTimeout(800);
  const avant = await page();
  await relayer(M9);
  await attendreQue(() => p.evaluate(() => document.querySelectorAll('.mot.a-ecrire').length === 0), 20000);
  await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    const pages = [...document.querySelectorAll(".page-suite .page-recit")];
    return { n: window.GRIMOIRE_RECIT.etat().pagesRecit, deborde: pages.filter(c => c.scrollHeight > c.clientHeight + 2).length,
             orphelins: pages.filter(c => { const m = c.querySelector(".mot"); return m && /^[»!?:;]/.test(m.textContent.trim()); }).length,
             suites: document.querySelectorAll(".para-recit.suite").length, page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), total: window.grimoireEtat().nbPages };
  });
  verifier("le récit s'étend sur plusieurs pages, toujours en nombre pair", r.n >= 4 && r.n % 2 === 0, `${r.n} pages`);
  verifier("aucune page ne déborde ; un paragraphe coupé continue sur la page suivante", r.deborde === 0 && r.suites >= 1, JSON.stringify(r));
  verifier("jamais de ponctuation seule en haut d'une page", r.orphelins === 0);
  verifier("le lecteur sur la dernière double page : le livre tourne avec le récit", avant === 7 && r.page >= 9 && r.page >= r.total - 3, `${avant} → ${r.page} (sur ${r.total})`);
});

// =========================================================================
titre("10. LES CHAPITRES : RANGÉS AVEC LEUR TITRE, RELUS À LA DEMANDE ; LE DESTIN RÉCRIT");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.__ajouts = []; window.__sets = []; });
  const res = await p.evaluate((m) => window.GRIMOIRE_RECIT.archiverChapitre(m.map(x => ({ id: x.idDoc, ...x }))), M4);
  const st = await p.evaluate(() => ({ ajouts: window.__ajouts.filter(a => a.col === "Recits_Chapitres").map(a => a.data), sets: window.__sets.map(s => ({ chemin: s.chemin, n: (s.data.Entrees || []).length, types: (s.data.Entrees || []).map(e => e.type).join(",") })) }));
  const titreIA = appelsIA.find(a => /donnes leur titre aux chapitres/.test(a.sys));
  verifier("un chapitre fini se range : son numéro, son titre écrit d'après ce qui a été vécu", res && res.titre === "La tournée du nain" && st.ajouts[0] && st.ajouts[0].Numero === 1 && st.ajouts[0].ID_Partie === "P1" && titreIA && /trois chopes/.test(titreIA.txt), JSON.stringify(st.ajouts[0]));
  verifier("… et ses pages à part (Recits_Textes) : seul le chapitre ouvert se charge", st.sets.length === 1 && st.sets[0].chemin === "Recits_Textes/" + res.id && st.sets[0].n >= 4 && /narration/.test(st.sets[0].types), JSON.stringify(st.sets));
  await p.evaluate(() => window.GRIMOIRE.allerALaPage(5));
  await p.waitForTimeout(900);
  const s = await p.evaluate(() => [...document.querySelectorAll(".ligne-sommaire")].map(l => l.innerText.replace(/\s+/g, " ").trim()));
  verifier("le sommaire : « I La tournée du nain », puis le chapitre II en cours", s.join("|") === "I La tournée du nain|II Le chapitre en cours", s.join("|"));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v300_sommaire.png" });
  await cliquer(`.ligne-sommaire[data-recit="chap:${res.id}"]`);
  await p.waitForTimeout(1200);
  const l = await p.evaluate(() => ({ page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), lecture: window.GRIMOIRE_RECIT.etat().lecture,
    titre: (document.querySelector("#grimoire-suite-2 .titre-chapitre") || {}).textContent, num: (document.querySelector("#grimoire-suite-2 .numero-chapitre") || {}).textContent,
    texte: document.getElementById("grimoire-suite-2").innerText, ecriture: document.getElementById("recit-ecriture").classList.contains("sortie") }));
  verifier("un chapitre relu : chargé à la demande, ses pages, son titre", l.page === 7 && l.lecture === res.id && l.num === "Chapitre I" && l.titre === "La tournée du nain" && /J'ai connu des tavernes/.test(l.texte), JSON.stringify({ ...l, texte: "" }));
  verifier("… on ne l'écrit plus (pas de parchemin)", !l.ecriture);
  await cliquer('.lien-recit[data-recit="courant"]');
  await p.waitForTimeout(900);
  verifier("« Revenir au chapitre en cours »", (await p.evaluate(() => window.GRIMOIRE_RECIT.etat().lecture)) === null);
  // Le Destin et le Maître du Temps : un poste réserve l'annonce, la récrit dans la voix du Narrateur.
  await p.evaluate(() => { window.__majs = []; window.__docs["Messages_Chat/t1"] = { Texte: "⏳ *1 jour de voyage s'est écoulé...*" }; });
  await relayer(M4.concat([{ idDoc: "t1", ID_Partie: "P1", Auteur_ID: "SYSTEME_TEMPS", Auteur_Nom: "Maître du Temps", Texte: "⏳ *1 jour de voyage s'est écoulé...*", Timestamp: 11000 }]));
  await attendreQue(() => p.evaluate(() => window.__majs.some(m => m.data.Texte_Livre)), 4000);
  const t = await p.evaluate(() => ({ reserve: window.__majs.some(m => m.tx && m.data.Livre_Plume === "J1"), texte: (window.__majs.find(m => m.data.Texte_Livre) || { data: {} }).data.Texte_Livre }));
  verifier("le Maître du Temps s'écrit dans la voix du Narrateur (un seul poste le récrit)", t.reserve && t.texte === "Le jour se lève sur la route, et je compte nos pas.", JSON.stringify(t));
});

// =========================================================================
titre("11. LE NARRATEUR, LES PORTRAITS EN PAUSE, LES PORTES DU JEU");
// =========================================================================
await section(async () => {
  const ia = lire("ia_master.js"), app = lire("app.js"), index = lire("index.html");
  verifier("le cerveau du Narrateur par défaut : témoin du groupe, « je », drôle et sombre à la fois", /const PROMPT_NARRATEUR_LIVRE = `Tu es le Narrateur d'Ivalis/.test(ia) && /tu dis « je »/.test(ia) && /humour léger/.test(ia) && /sombre et de l'épique/.test(ia) && /let instructionMJ = PROMPT_NARRATEUR_LIVRE;/.test(ia));
  verifier("le Narrateur ne lit que le livre (les lignes récrites des joueurs)", /function ligneDuLivre\(m\)/.test(ia) && /historiqueReduit\.map\(ligneDuLivre\)/.test(ia));
  verifier("les portraits des PNJ en pause (les fiches se créent toujours)", /window\.PORTRAITS_PNJ_EN_PAUSE = true;/.test(ia) && /if \(window\.PORTRAITS_PNJ_EN_PAUSE !== false\) return "";/.test(ia));
  verifier("l'archivage range le chapitre dans le livre avant de vider le chat", ia.indexOf("GRIMOIRE_RECIT.archiverChapitre(messages)") > 0 && ia.indexOf("GRIMOIRE_RECIT.archiverChapitre(messages)") < ia.indexOf("// 5. Autodestruction du chat"));
  verifier("app.js relaie les messages et l'état de la partie au livre, et lance un dé sans la fiche", /window\.livreRecitMessages\(snap\.docs/.test(app) && /window\.livreRecitPartie\(dataPartie\)/.test(app) && /window\.lancerJetPourHeros = async function/.test(app));
  const v = (re) => Number((index.match(re) || [])[1] || 0);
  verifier("le récit dans son propre fichier (grimoire_recit.js, .css), chargé après app.js et les comptes", index.indexOf('src="grimoire_recit.js?v=') > index.indexOf('src="comptes.js?v=') && index.indexOf('src="comptes.js?v=') > index.indexOf('src="app.js?v=') && /grimoire_recit\.css\?v=\d+/.test(index));
  verifier("versions", v(/grimoire\.js\?v=(\d+)"/) >= 4 && v(/grimoire\.css\?v=(\d+)"/) >= 4 && v(/fabrique_sons\.js\?v=(\d+)"/) >= 20 && v(/ia_master\.js\?v=(\d+)"/) >= 18 && v(/app\.js\?v=(\d+)"/) >= 136
           && v(/trace_combat\.js\?v=(\d+)"/) >= 205 && Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]) >= 300 && JSON.parse(lire("version.json") || "{}").version >= 300);
  // Le vrai lancer de dé depuis le livre (app.js) : la même valeur que le d20 de la fiche.
  const j = await p.evaluate(async () => {
    window.__majs = []; window.CARACS_PARTIE = Object.assign(window.CARACS_PARTIE || {}, { H1: { cha: 14 } });
    const ok = await window.__vraiJet("H1", "CHARISME");
    const m = window.__majs.find(x => x.data && x.data.Action_Des);
    return { ok, chemin: m && m.chemin, d: m && m.data.Action_Des };
  });
  verifier("le dé de la note : le vrai jet (même valeur que le d20 de la fiche, la même scène)", j.ok && j.chemin === "Systeme_Parties/P1" && j.d.caract === "CHARISME" && j.d.modificateur === 2 && j.d.idPerso === "H1"
           && j.d.totalFinal === j.d.resultatBrut + 2 && j.d.resultatBrut >= 1 && j.d.resultatBrut <= 20, JSON.stringify(j));
  // Retour au menu : le livre perd les pages du récit.
  await p.evaluate(() => window.confirmerRetourMenu());
  await p.waitForTimeout(1300);
  const s = await p.evaluate(() => ({ etatPf: window.GRIMOIRE_PAGEFLIP.getState(), n: window.grimoireEtat().nbPages, actif: window.GRIMOIRE_RECIT.etat().actif, ecriture: !!document.getElementById("recit-ecriture"), plume: document.getElementById("grimoire-marque-recit").classList.contains("inactif") }));
  verifier("retour au menu : le livre perd le récit, le marque-page à la plume s'éteint", s.n === 6 && !s.actif && !s.ecriture && s.plume, JSON.stringify(s));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
