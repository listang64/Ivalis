// v303 — LE RÉCIT D'UN SEUL SOUFFLE : LA PLUME DU NARRATEUR, LA POUSSIÈRE PLUS LENTE.
//
// Nico : « le texte qui part dans le parchemin, réduis un peu la vitesse de
// l'animation pour que ça coordonne bien » ; « l'IA qui retravaille le texte
// des joueurs, il va falloir la mettre mieux, quitte à mettre la version
// payante : elle commence toujours par "Je vois Untel faire…", et tous les
// paragraphes ; ça casse le récit. J'aimerais que le récit soit fluide et
// continu, en intégrant ce que disent ou font les joueurs. »
//
// Lancer : node tests_monstres/corrections_v303.mjs
// (IVALIS_RACINE=… pour un autre dossier ; V303_CAPTURES=dossier pour les captures.)
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
const CAPTURES = process.env.V303_CAPTURES || "";
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
// Les IA (Gemini), simulées : le Narrateur lite, les annonces, le titre d'un chapitre.
const appelsIA = [];
let iaEnPanne = false, refusPlume = false;
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**/generativelanguage.googleapis.com/**', r => {
  const corps = JSON.parse(r.request().postData() || "{}");
  const sys = ((corps.systemInstruction || {}).parts || [{}])[0].text || "", txt = (((corps.contents || [])[0] || {}).parts || [{}])[0].text || "";
  appelsIA.push({ url: r.request().url(), sys, txt, config: corps.generationConfig || {} });
  if (refusPlume && /gemini-3\.8-flash/.test(r.request().url())) return r.fulfill({ status: 404, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: '{"error":{"message":"inconnu"}}' });
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

const NARRATION = `La salle du Chaudron Fêlé sent la bière tiède et le chien mouillé. Derrière le comptoir, <strong style="color: #e8d5a5;">Varos</strong> essuie une chope sans nous accorder un regard.<br>Thorin, bien sûr, prend ce silence pour une invitation, et s'approche du comptoir en faisant sonner ses bottes sur les dalles.`;
const M = [{ idDoc: "m1", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: NARRATION, Timestamp: 1000 }];
await cliquer("#grimoire-btn-charger");
await p.waitForTimeout(700);
await cliquer('#grimoire-liste-parties [data-id="P1"]');
await p.waitForTimeout(150);
await p.fill("#grimoire-mdp-partie", "sel");
await cliquer("#grimoire-valider-partie");
await p.waitForTimeout(1300);
await relayer(M, true);
await p.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit());
await attendreQue(() => p.evaluate(() => document.getElementById("recit-ecriture").classList.contains("sortie")), 5000);
await p.waitForTimeout(700);

// =========================================================================
titre("1. LA POUSSIÈRE, PLUS LENTE : ELLE VOLE LE TEMPS QUE LA PLUME RÉCRIVE");
// =========================================================================
let ajout = null;
await section(async () => {
  await p.evaluate(() => { window.__ajouts = []; });
  const texte = "Je tape du poing sur le comptoir et je réclame une chope, et vite !";
  await p.fill("#recit-saisie", texte);
  const t0 = Date.now();
  await p.press("#recit-saisie", "Enter");
  await p.waitForTimeout(200);
  const v = await p.evaluate(() => {
    const anims = [...document.querySelectorAll(".recit-poussiere .poussiere-texte span")].flatMap(sp => sp.getAnimations());
    const durees = anims.map(a => a.effect.getTiming().duration), fins = anims.map(a => a.effect.getTiming().duration + a.effect.getTiming().delay);
    return { n: anims.length, min: Math.min(...durees), max: Math.max(...durees), fin: Math.max(...fins) };
  });
  verifier("chaque lettre vole plus longtemps (1,5 à 2,4 s, au lieu de 0,85 à 1,45 s)", v.n > 40 && v.min >= 1500 && v.max <= 2400, JSON.stringify(v));
  verifier("le vol entier dure deux à trois secondes et demie", v.fin >= 2000 && v.fin <= 3800, `${v.fin.toFixed(0)} ms`);
  await attendreQue(() => p.evaluate(() => (window.__ajouts || []).some(a => a.col === "Messages_Chat")), 8000);
  const duree = Date.now() - t0;
  ajout = await p.evaluate(() => (window.__ajouts || []).find(a => a.col === "Messages_Chat"));
  verifier("la ligne part quand la poussière s'est posée (et la plume a fini)", ajout && duree >= 1800, `${duree} ms`);
});

// =========================================================================
titre("2. LA PLUME DU NARRATEUR : LE MODÈLE DU NARRATEUR, ET UNE CONSIGNE POUR ENCHAÎNER");
// =========================================================================
await section(async () => {
  const plume = appelsIA.filter(a => /CE QU'ÉCRIT SON JOUEUR/.test(a.txt)).slice(-1)[0];
  verifier("la plume, c'est Gemini 3.8 Flash (le modèle du Narrateur), réflexion basse", plume && /models\/gemini-3\.8-flash:generateContent/.test(plume.url) && plume.config.thinkingConfig && plume.config.thinkingConfig.thinkingLevel === "low", plume ? plume.url.split("models/")[1].split("?")[0] : "aucun appel");
  verifier("elle écrit la suite de la dernière ligne du livre, dans le même paragraphe", plume && /JUSTE APRÈS la dernière ligne du livre, dans le même paragraphe/.test(plume.sys) && /tu continues la dernière/.test(plume.txt));
  verifier("elle ne commence jamais par « Je vois » (ni « Je regarde », « J'observe »…), et varie ses débuts", plume && /Ne commence JAMAIS par « Je vois », « Je regarde », « J'observe »/.test(plume.sys) && /varie tes débuts/.test(plume.sys));
  verifier("le « je » seulement s'il apporte quelque chose ; l'essence du joueur gardée, rien d'inventé", plume && /jamais pour dire qu'il voit/.test(plume.sys) && /essence/.test(plume.sys) && /N'invente ni la suite/.test(plume.sys));
  // Le modèle refusé (inconnu, quota…) : Flash-Lite reprend la plume.
  refusPlume = true;
  await p.evaluate(() => { window.__ajouts = []; });
  await p.fill("#recit-saisie", "Je souris à Varos.");
  await p.press("#recit-saisie", "Enter");
  await attendreQue(() => p.evaluate(() => (window.__ajouts || []).some(a => a.col === "Messages_Chat")), 8000);
  refusPlume = false;
  const dernier = appelsIA.slice(-2).map(a => a.url.split("models/")[1].split(":")[0]);
  const a2 = await p.evaluate(() => ((window.__ajouts || []).find(a => a.col === "Messages_Chat") || { data: {} }).data);
  verifier("le modèle refusé : Flash-Lite reprend la plume, la ligne part récrite", dernier.join(",") === "gemini-3.8-flash,gemini-flash-lite-latest" && /trinque/.test(a2.Texte_Livre || ""), dernier.join(","));
});

// =========================================================================
titre("3. LE RÉCIT D'UN SEUL SOUFFLE : LA LIGNE DU JOUEUR CONTINUE LE PARAGRAPHE");
// =========================================================================
await section(async () => {
  const avant = await p.evaluate(() => document.querySelectorAll(".page-suite .para-recit").length);
  const M2 = M.concat([{ idDoc: "m2", ...ajout.data, Timestamp: 2000 }]);
  await relayer(M2);
  await p.waitForTimeout(250);
  const r = await p.evaluate(() => {
    const paras = [...document.querySelectorAll(".page-suite .para-recit")];
    const dernier = paras[paras.length - 1];
    return { n: paras.length, dernier: dernier.innerText.replace(/\s+/g, " ").trim(), entrees: [...new Set([...dernier.querySelectorAll(".mot")].map(m => m.dataset.e))],
             caches: document.querySelectorAll('.mot[data-e="m2"].a-ecrire').length, total: document.querySelectorAll('.mot[data-e="m2"]').length };
  });
  verifier("la ligne du joueur ne commence pas de nouveau paragraphe", r.n === avant && r.n === 2, `${avant} → ${r.n}`);
  verifier("elle continue le dernier paragraphe, à la suite du Narrateur", r.entrees.join(",") === "m1,m2" && /sur les dalles\. Je vois Thorin lever sa chope/.test(r.dernier), r.dernier.slice(-90));
  verifier("… et s'y écrit à l'encre, mot après mot", r.total > 10 && r.caches > r.total * 0.6, `${r.caches}/${r.total}`);
  await attendreQue(() => p.evaluate(() => document.querySelectorAll(".mot.a-ecrire").length === 0), 6000);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v303_fil.png" });
  // Un dé lancé pour cette action : le petit dé de la marge se pose sur la ligne de son premier mot.
  const M3 = M2.concat([{ idDoc: "a1", ID_Partie: "P1", Auteur_ID: "ARBITRE_DES", Auteur_Nom: "Arbitre des dés", Texte: "🎲", Timestamp: 2500, Jets_Demandes: [{ idPerso: "H1", heros: "Thorin", caracteristique: "CHARISME", difficulte: "moyenne", action: "trinquer" }] },
                         { idDoc: "j1", ID_Partie: "P1", Auteur_ID: "H1", Auteur_Nom: "Thorin Ironfoot", Texte: "🎲 Jet de **CHARISME** pour **Thorin Ironfoot** : Résultat : 12 +2 = **14**", Timestamp: 3000 }]);
  await relayer(M3);
  await p.waitForTimeout(400);
  const d = await p.evaluate(() => {
    const de = document.querySelector('.de-marge[data-e="m2"]'), mot = document.querySelector('.mot[data-e="m2"]'), para = de && de.closest(".para-recit");
    if (!de || !mot) return null;
    const a = de.getBoundingClientRect(), b = mot.getBoundingClientRect(), c = para.getBoundingClientRect();
    return { total: de.innerText.trim(), ecartLigne: Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)), marge: a.right <= c.left + 2, hautPara: Math.abs(a.top - c.top) };
  });
  verifier("le petit dé se pose sur la ligne de l'action, dans la marge (même au milieu d'un paragraphe)", d && d.total === "14" && d.ecartLigne < 14 && d.marge && d.hautPara > 10, JSON.stringify(d));
});

await section(async () => {
  const index = lire("index.html");
  const v = (re) => Number((index.match(re) || [])[1] || 0);
  verifier("versions", v(/grimoire_recit\.js\?v=(\d+)"/) >= 4 && v(/grimoire_recit\.css\?v=(\d+)"/) >= 3 && v(/trace_combat\.js\?v=(\d+)"/) >= 208
           && Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]) >= 303 && JSON.parse(lire("version.json") || "{}").version >= 303);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
