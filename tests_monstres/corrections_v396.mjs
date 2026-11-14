// v396 — LE CHAT VOCAL DE LA TABLE (vocal.js) : le papier en bas à gauche du livre,
// les joueurs et leurs points magiques (rouge / vert / plus vert quand on parle /
// violet pendant la dictée), Rejoindre, couper son micro, couper le son des autres
// ou d'un joueur, les voix qui baissent pendant la lecture, 4 voix au plus.
//
// DEUX POSTES, POUR DE VRAI : deux pages Chromium (J1 joue Thorin, J2 joue Lyra)
// se parlent en WebRTC, avec un faux micro (un bip). Leur Firestore est une
// petite base en mémoire, partagée par Node : ce qu'une page écrit sous « Vocal/ »,
// l'autre le reçoit dans ses onSnapshot. (La mise en place du livre : celle de
// corrections_v395.)
//
// Lancer : node tests_monstres/corrections_v396.mjs   (V396_CAPTURES=dossier : les captures)
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
// La base : en mémoire dans chaque page ; sous « Vocal/ », partagée par Node (__fsPartage).
const FAUX_FIRESTORE = `
  const docs = () => (window.__docs = window.__docs || {});
  const partage = (c) => /^Vocal\\//.test(c);
  const ecouteurs = [];
  const parent = (chemin) => chemin.split("/").slice(0, -1).join("/");
  const accepte = (q, chemin, data) => parent(chemin) === q.col && (q.conds || []).every(c => data && data[c.f] === c.v);
  const instantane = (vue, ch) => ({ docChanges: () => ch, forEach: (f) => Object.keys(vue).forEach(id => f({ id, data: () => vue[id] })),
      get docs() { return Object.keys(vue).map(id => ({ id, data: () => vue[id] })); }, size: Object.keys(vue).length, empty: !Object.keys(vue).length });
  window.__fsNotifier = (changes) => {
    ecouteurs.forEach(e => {
      const ch = [];
      changes.forEach(c => {
        const id = c.chemin.split("/").pop(), avant = e.vue[id];
        if (c.data && accepte(e.q, c.chemin, c.data)) { e.vue[id] = c.data; ch.push({ type: avant ? "modified" : "added", doc: { id, data: () => c.data } }); }
        else if (!c.data && avant && parent(c.chemin) === e.q.col) { delete e.vue[id]; ch.push({ type: "removed", doc: { id, data: () => avant } }); }
      });
      if (ch.length && !e.fini) e.cb(instantane(e.vue, ch));
    });
  };
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...c) => ({ chemin: c.join("/") }); export const collection = (_db, ...c) => ({ col: c.join("/") });
  export const getDoc = async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => d || {}, id: r.chemin.split("/").pop() }; };
  export const query = (c, ...conds) => ({ col: c.col, conds: conds.filter(x => x && x.f) });
  export const where = (f, op, v) => ({ f, op, v }); export const orderBy = () => ({}); export const limit = () => ({});
  export const getDocs = async () => ({ forEach() {}, docs: [], empty: true, size: 0 });
  export const setDoc = async (r, d) => { if (partage(r.chemin)) return window.__fsPartage({ op: "set", chemin: r.chemin, data: d });
      docs()[r.chemin] = d; (window.__sets = window.__sets || []).push({ chemin: r.chemin, data: d }); };
  export const updateDoc = async (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d }); docs()[r.chemin] = Object.assign({}, docs()[r.chemin] || {}, d); };
  export const deleteDoc = async (r) => { if (partage(r.chemin)) return window.__fsPartage({ op: "delete", chemin: r.chemin }); };
  export const addDoc = async (c, d) => { if (partage(c.col)) { const id = await window.__fsPartage({ op: "add", col: c.col, data: d }); return { id }; }
      (window.__ajouts = window.__ajouts || []).push({ col: c.col, data: d }); const id = "A" + window.__ajouts.length; docs()[c.col + "/" + id] = d; return { id }; };
  export const onSnapshot = (ref, cb) => {
    const q = ref.chemin ? null : { col: ref.col, conds: ref.conds || [] };
    if (!q || !partage(q.col)) return () => {};
    const e = { q, cb, vue: {}, fini: false };
    ecouteurs.push(e);
    window.__fsLire(q.col).then(tous => { const ch = []; tous.forEach(t => { if (accepte(q, t.chemin, t.data)) { const id = t.chemin.split("/").pop(); e.vue[id] = t.data; ch.push({ type: "added", doc: { id, data: () => t.data } }); } });
      if (!e.fini) cb(instantane(e.vue, ch)); });
    return () => { e.fini = true; };
  };
  export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
  export const runTransaction = async (_db, f) => f({ get: async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => d || {} }; },
      update: (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d, tx: true }); docs()[r.chemin] = Object.assign({}, docs()[r.chemin] || {}, d); } });
  export const increment = (k) => k; export const deleteField = () => null;
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const serverTimestamp = () => Date.now();
  export class FieldPath {} export const Timestamp = { now: () => Date.now() };
`;
const CAPTURES = process.env.V396_CAPTURES || "";
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const TABLE = await (async () => { const pg = await b.newPage(); const u = await pg.evaluate(() => { const c = document.createElement("canvas"); c.width = 1672; c.height = 941;
  const x = c.getContext("2d"); x.fillStyle = "#130c06"; x.fillRect(0, 0, 1672, 941); x.fillStyle = "#7a4a26"; x.fillRect(170, 55, 1470, 835); return c.toDataURL("image/png"); });
  await pg.close(); return Buffer.from(u.split(",")[1], "base64"); })();

// LA BASE PARTAGÉE (Node) : chemin -> données ; chaque écriture est redite aux deux pages.
const base_ = new Map();
const pages = [];
let numero = 0;
const diffuser = (changes) => pages.forEach(pg => pg.evaluate((c) => window.__fsNotifier && window.__fsNotifier(c), changes).catch(() => {}));
const ecrire = (op) => {
  if (op.op === "add") { const id = "S" + (++numero); base_.set(op.col + "/" + id, op.data); diffuser([{ chemin: op.col + "/" + id, data: op.data }]); return id; }
  if (op.op === "set") { base_.set(op.chemin, op.data); diffuser([{ chemin: op.chemin, data: op.data }]); return null; }
  if (op.op === "delete") { if (base_.has(op.chemin)) { base_.delete(op.chemin); diffuser([{ chemin: op.chemin, data: null }]); } return null; }
  return null;
};

const erreurs = [];
async function poste(joueur, nomCompte) {
  const ctx = await b.newContext({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
  await ctx.grantPermissions(["microphone"], { origin: base });
  const p = await ctx.newPage();
  await p.exposeFunction("__fsPartage", (op) => ecrire(op));
  await p.exposeFunction("__fsLire", (col) => [...base_.entries()].filter(([c]) => c.split("/").slice(0, -1).join("/") === col).map(([chemin, data]) => ({ chemin, data })));
  await p.route('**', r => { const u = r.request().url();
    if (u.startsWith(base)) return r.continue();
    if (/BG_tjiigl/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: TABLE });
    return r.abort(); });
  await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
  await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
  p.on('pageerror', e => erreurs.push(joueur + ": " + e.message));
  p.on('console', m => { if (m.type() === 'error' && /Vocal|Grimoire/.test(m.text())) console.log('CONSOLE', joueur, m.text()); });
  await p.goto(base + '/index.html'); await p.waitForTimeout(1200);
  await p.evaluate(([joueur, nomCompte]) => {
    localStorage.setItem("ID_JOUEUR_COURANT", joueur);
    window.jouerSonEvenement = () => true; window.jouerSonClic = () => {};
    window.fermerToutesLesFenetres = () => {};
    window.COMPTE_JOUEUR = { nom: nomCompte, email: "", admin: false };
    window.LISTE_PARTIES_CACHE = [{ id: "P1", nom: "Les Lames d'Héra" }];
    const heros = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", nom: "Ironfoot", actif: true, urlCloudinary: "" },
                   { idPersonnage: "H2", idJoueur: "J2", prenom: "Lyra", nom: "Sombreval", actif: true, urlCloudinary: "" },
                   { idPersonnage: "H3", idJoueur: "J3", prenom: "Kael", nom: "", actif: true, urlCloudinary: "" }];
    window.PERSOS_JOUEURS_PARTIE = heros; window.PERSOS_PARTIE = heros.slice();
    window.nomDuJoueurLivre = (id) => ({ J1: "Ben", J2: "Nico", J3: "Adrien" })[id] || id;
    window.PORTES_GRIMOIRE = {
      verifierCle: async () => true, creerPartie: async () => "P_NEUVE",
      verifierMdpPartie: async (id, m) => ({ ok: m === "sel" }),
      entrerDansPartie: (id) => { window.ID_PARTIE_COURANTE = id; document.getElementById("ecran-jeu").style.display = "block"; }
    };
    ["ouvrirChatbox", "ouvrirMenuPersonnages", "ouvrirPopupRencontre", "ouvrirParametres"].forEach(n => { window[n] = () => {}; });
    window.declencherTourIA = async () => {};
    window.lancerRecitDynamique = () => {}; window.majRecitDynamique = () => {}; window.annoncerJetsDemandes = () => {};
    window.afficherEcranAttente = () => {};
    // La dictée : une reconnaissance vocale de banc (elle n'écoute rien).
    window.SpeechRecognition = class { start() { window.__dicteeLancee = (window.__dicteeLancee || 0) + 1; } stop() { setTimeout(() => this.onend && this.onend(), 10); } abort() { this.stop(); } };
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== "ecran-grimoire") e.style.display = "none"; });
    window.afficherGrimoire();
  }, [joueur, nomCompte]);
  await p.waitForTimeout(1300);
  await p.evaluate(() => window.ouvrirGrimoire());
  await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector("#grimoire-btn-charger").click());
  await p.waitForTimeout(700);
  await p.evaluate(() => document.querySelector('#grimoire-liste-parties [data-id="P1"]').click());
  await p.waitForTimeout(150);
  await p.fill("#grimoire-mdp-partie", "sel");
  await p.evaluate(() => document.querySelector("#grimoire-valider-partie").click());
  await p.waitForTimeout(2500);
  pages.push(p);
  return p;
}

const titre = (t) => console.log("\n" + t);
const section = async (f) => { try { await f(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 180)); } };
const attendreQue = async (p, f, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await p.waitForTimeout(100); } return false; };
const vocal = (p) => p.evaluate(() => window.GRIMOIRE_VOCAL.etat());
const couleur = async (p, id) => ((await vocal(p)).joueurs.find(j => j.id === id) || {}).couleur;
const pointDOM = (p, id) => p.evaluate((id) => { const li = document.querySelector(`.vocal-joueur[data-joueur="${id}"] .point-magique`); return li ? li.className : ""; }, id);
const toucher = (p, sel) => p.evaluate((sel) => document.querySelector(sel).click(), sel);
const cap = async (p, nom) => { if (CAPTURES) await p.screenshot({ path: CAPTURES + "/" + nom + ".png" }); };

const p1 = await poste("J1", "Ben");
const p2 = await poste("J2", "Nico");

titre("1. LE PAPIER : EN BAS À GAUCHE DU LIVRE, LES JOUEURS DE LA TABLE");
await section(async () => {
  const r = await p1.evaluate(() => {
    const papier = document.getElementById("papier-vocal"), scene = document.getElementById("grimoire-scene");
    if (!papier) return null;
    const rp = papier.getBoundingClientRect(), rs = scene.getBoundingClientRect();
    const s = parseFloat(getComputedStyle(scene).getPropertyValue("--s")) || 1;
    return { sorti: papier.classList.contains("sortie"), droite: rp.right, gaucheLivre: rs.left + 251 * s, haut: rp.top, milieuLivre: rs.top + 1117 * s / 2,
      bas: rp.bottom, basLivre: rs.top + 1117 * s, noms: [...document.querySelectorAll(".vocal-joueur .nom-vocal")].map(n => n.textContent.trim()),
      rejoindre: !!document.querySelector('#vocal-actions [data-vocal="rejoindre"]') };
  });
  verifier("le papier est là, sorti", !!r && r.sorti, JSON.stringify(r));
  verifier("…à gauche du livre (il sort de sous la page de gauche)", r && r.droite <= r.gaucheLivre + 30 && r.droite > r.gaucheLivre - 200, JSON.stringify(r && { d: r.droite, g: r.gaucheLivre }));
  verifier("…en bas (sous la moitié du livre, dans le livre)", r && r.haut > r.milieuLivre && r.bas <= r.basLivre + 20, JSON.stringify(r && { h: r.haut, m: r.milieuLivre, b: r.bas, bl: r.basLivre }));
  verifier("les joueurs de la table (un héros actif) : moi d'abord (Ben), Nico, Adrien", r && r.noms.join(",") === "Ben,Nico,Adrien", r && r.noms.join(","));
  // (v396) Nico : « les noms grisés si pas connectés au jeu, en noir si connectés ».
  verifier("Ben et Nico ont la partie ouverte (Vocal/P1/EnJeu) : leurs noms en noir", await attendreQue(p1, () => p1.evaluate(() =>
    ["J1", "J2"].every(j => !document.querySelector(`.vocal-joueur[data-joueur="${j}"]`).classList.contains("hors-jeu")))) && base_.has("Vocal/P1/EnJeu/J2"));
  const gris = await p1.evaluate(() => { const li = document.querySelector('.vocal-joueur[data-joueur="J3"]'); return { classe: li && li.className, couleur: li && getComputedStyle(li.querySelector(".nom-vocal")).color,
    noir: getComputedStyle(document.querySelector('.vocal-joueur[data-joueur="J2"] .nom-vocal')).color }; });
  verifier("Adrien n'est pas connecté : son nom grisé", /hors-jeu/.test(gris.classe || "") && gris.couleur !== gris.noir, JSON.stringify(gris));
  verifier("un bouton « Rejoindre »", r && r.rejoindre);
  verifier("personne dans le vocal : deux points rouges", (await couleur(p1, "J1")) === "rouge" && (await couleur(p1, "J2")) === "rouge" && /rouge/.test(await pointDOM(p1, "J2")));
  await cap(p1, "v396_papier");
});

titre("2. REJOINDRE : LE MICRO, LA PRÉSENCE, LE POINT VERT");
await section(async () => {
  await toucher(p1, '[data-vocal="rejoindre"]');
  await attendreQue(p1, async () => (await vocal(p1)).micro === "ok");
  const e = await vocal(p1);
  verifier("Ben rejoint : son micro s'ouvre", e.rejoint && e.micro === "ok", JSON.stringify(e));
  verifier("…sa présence est écrite (Vocal/P1/Presents/J1, Etat ok)", base_.get("Vocal/P1/Presents/J1") && base_.get("Vocal/P1/Presents/J1").Etat === "ok", JSON.stringify(base_.get("Vocal/P1/Presents/J1")));
  verifier("…son point est vert chez lui", (await couleur(p1, "J1")) === "vert");
  verifier("…et chez Nico, qui n'a pas encore rejoint", await attendreQue(p2, async () => (await couleur(p2, "J1")) === "vert"));
  verifier("les gestes : le micro, le son des autres, Quitter", await p1.evaluate(() => ["micro", "casque", "quitter"].every(a => !!document.querySelector(`#vocal-actions [data-vocal="${a}"]`))));
});

titre("3. NICO REJOINT : LES DEUX POSTES SE PARLENT (WebRTC)");
await section(async () => {
  await toucher(p2, '[data-vocal="rejoindre"]');
  const relies = await attendreQue(p1, async () => {
    const a = await vocal(p1), c = await vocal(p2);
    return a.pairs.length === 1 && c.pairs.length === 1 && a.pairs[0].etat === "connected" && c.pairs[0].etat === "connected";
  }, 15000);
  const a = await vocal(p1), c = await vocal(p2);
  verifier("la connexion est établie des deux côtés", relies, JSON.stringify({ a: a.pairs, c: c.pairs }));
  verifier("Ben (J1 < J2) a appelé, Nico a répondu", await p1.evaluate(() => true) && a.pairs[0] && a.pairs[0].id === "J2" && c.pairs[0] && c.pairs[0].id === "J1");
  const son = await attendreQue(p2, () => p2.evaluate(() => [...document.querySelectorAll("audio.vocal-son")].some(x => x.srcObject && x.srcObject.getAudioTracks().length)), 5000);
  verifier("le son de Ben arrive chez Nico (une piste audio)", son);
  verifier("les signaux lus sont effacés de la base", await attendreQue(p1, async () => ![...base_.keys()].some(k => k.startsWith("Vocal/P1/Signaux/")), 5000),
    String([...base_.keys()].filter(k => k.includes("Signaux")).length));
  // Le faux micro de Chromium bipe : le point de Ben s'allume chez Nico.
  const parle = await attendreQue(p2, async () => /parle/.test(await pointDOM(p2, "J1")), 8000);
  verifier("Ben parle (le bip du faux micro) : son point devient plus vert chez Nico", parle, await pointDOM(p2, "J1"));
  const parleMoi = await attendreQue(p1, async () => /parle/.test(await pointDOM(p1, "J1")), 8000);
  verifier("…et chez lui aussi", parleMoi);
  await cap(p2, "v396_deux_voix");
});

titre("4. COUPER SON MICRO");
await section(async () => {
  await toucher(p1, '[data-vocal="micro"]');
  await p1.waitForTimeout(300);
  const e = await vocal(p1);
  const piste = await p1.evaluate(() => { const a = window.GRIMOIRE_VOCAL.etat(); return a.coupe; });
  verifier("le micro de Ben se coupe : son point rouge, chez lui", e.coupe && piste && (await couleur(p1, "J1")) === "rouge");
  verifier("…l'icône barrée", await p1.evaluate(() => document.querySelector('[data-vocal="micro"]').classList.contains("coupe")));
  verifier("…et chez Nico (Etat « coupe »)", await attendreQue(p2, async () => (await couleur(p2, "J1")) === "rouge"), JSON.stringify(base_.get("Vocal/P1/Presents/J1")));
  await toucher(p1, '[data-vocal="micro"]');
  verifier("rouvert : vert de nouveau, des deux côtés", await attendreQue(p2, async () => (await couleur(p2, "J1")) === "vert") && (await couleur(p1, "J1")) === "vert");
});

titre("5. COUPER LE SON DES AUTRES, OU D'UN SEUL JOUEUR");
await section(async () => {
  await toucher(p2, '[data-vocal="casque"]');
  await p2.waitForTimeout(1500);
  let e = await vocal(p2);
  verifier("Nico coupe le son des autres : le volume de Ben tombe à 0", e.sourdine && e.pairs[0].volume === 0 && e.pairs[0].gain < 0.05, JSON.stringify(e.pairs));
  await toucher(p2, '[data-vocal="casque"]');
  await p2.waitForTimeout(1500);
  e = await vocal(p2);
  verifier("…le rend : 1", !e.sourdine && e.pairs[0].volume === 1 && e.pairs[0].gain > 0.95, JSON.stringify(e.pairs));
  await toucher(p2, '.vocal-joueur[data-joueur="J1"] [data-vocal="muet"]');
  await p2.waitForTimeout(1500);
  e = await vocal(p2);
  verifier("un toucher sur le nom de Ben : sa voix seule se coupe", e.muets.includes("J1") && e.pairs[0].gain < 0.05, JSON.stringify(e));
  verifier("…son nom barré", await p2.evaluate(() => document.querySelector('.vocal-joueur[data-joueur="J1"]').classList.contains("muet")));
  await toucher(p2, '.vocal-joueur[data-joueur="J1"] [data-vocal="muet"]');
  await p2.waitForTimeout(1500);
  e = await vocal(p2);
  verifier("…un autre toucher la rend", !e.muets.length && e.pairs[0].gain > 0.95);
});

titre("6. LA LECTURE : LES VOIX BAISSENT TANT QU'ON N'A PAS FINI DE LIRE");
await section(async () => {
  await p2.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit()); await p2.waitForTimeout(2500);
  const narration = { idDoc: "n1", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Lecture_Attendue: true,
    Texte: "Le vent tombe sur la plaine ; au loin, une torche s'allume.", Timestamp: Date.now() };
  await p2.evaluate((m) => window.livreRecitMessages([m], { initial: true }), narration);
  const baisse = await attendreQue(p2, async () => (await vocal(p2)).lecture, 8000);
  verifier("le Narrateur a écrit : les voix baissent chez Nico", baisse);
  await attendreQue(p2, () => p2.evaluate(() => document.getElementById("recit-lecture").classList.contains("sortie")), 15000);
  await p2.waitForTimeout(1500);
  let e = await vocal(p2);
  verifier("…à 35 % (la voix de Ben), tant que « Lecture terminée » attend", e.lecture && Math.abs(e.pairs[0].gain - 0.35) < 0.05, JSON.stringify(e.pairs));
  verifier("…une petite note sur le papier", await p2.evaluate(() => /Lecture/.test(document.getElementById("vocal-note").textContent)));
  await cap(p2, "v396_lecture");
  await toucher(p2, "#recit-lecture-bouton");
  await p2.waitForTimeout(1500);
  e = await vocal(p2);
  verifier("Nico a fini de lire : les voix reviennent (même si Ben lit encore)", !e.lecture && e.pairs[0].gain > 0.95, JSON.stringify(e.pairs));
});

titre("7. LA DICTÉE DU RP : LE MICRO DU VOCAL SE FERME, UN POINT VIOLET");
await section(async () => {
  // Le papier d'écriture de Nico (la lecture de Ben n'est pas attendue chez lui : tout le monde a lu ?)
  await p2.evaluate((m) => window.livreRecitMessages([m], {}), { idDoc: "n1", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Lecture_Attendue: true,
    Texte: "Le vent tombe sur la plaine ; au loin, une torche s'allume.", Timestamp: Date.now(), Lectures: { J1: Date.now(), J2: Date.now() } });
  await p2.waitForTimeout(800);
  await p2.evaluate(() => document.getElementById("recit-micro").click());
  await p2.waitForTimeout(400);
  const e = await vocal(p2);
  const pistes = await p2.evaluate(() => [...document.querySelectorAll("audio")].length);
  verifier("la dictée commence : le vocal de Nico est en dictée", e.dictee && (await couleur(p2, "J2")) === "violet", JSON.stringify(e));
  verifier("…son micro est rendu (plus de piste ouverte)", e.micro !== "ok" && await p2.evaluate(() => window.__dicteeLancee >= 1));
  verifier("…Ben voit un point violet", await attendreQue(p1, async () => (await couleur(p1, "J2")) === "violet"), JSON.stringify(base_.get("Vocal/P1/Presents/J2")));
  verifier("…en dictée, le point de Nico ne s'allume pas chez Ben", !/parle/.test(await pointDOM(p1, "J2")) || await attendreQue(p1, async () => !/parle/.test(await pointDOM(p1, "J2")), 2000));
  await cap(p1, "v396_dictee");
  await p2.evaluate(() => document.getElementById("recit-micro").click());
  const retour = await attendreQue(p2, async () => { const x = await vocal(p2); return !x.dictee && x.micro === "ok"; }, 5000);
  verifier("la dictée finie : le micro se rouvre, vert", retour && (await couleur(p2, "J2")) === "vert", JSON.stringify(await vocal(p2)));
  verifier("…vert chez Ben aussi, toujours relié", await attendreQue(p1, async () => (await couleur(p1, "J2")) === "vert") && (await vocal(p1)).pairs[0].etat === "connected");
  verifier("…la voix de Nico repart vers Ben (le point de Nico s'allume)", await attendreQue(p1, async () => /parle/.test(await pointDOM(p1, "J2")), 8000));
  void pistes;
});

titre("8. QUITTER LE VOCAL");
await section(async () => {
  await toucher(p1, '[data-vocal="quitter"]');
  await p1.waitForTimeout(500);
  const e = await vocal(p1);
  verifier("Ben quitte : plus de micro, plus de connexion", !e.rejoint && e.micro !== "ok" && !e.pairs.length, JSON.stringify(e));
  verifier("…sa présence est effacée", !base_.has("Vocal/P1/Presents/J1"));
  verifier("…chez Nico : la connexion fermée, le point de Ben rouge", await attendreQue(p2, async () => { const x = await vocal(p2); return !x.pairs.length && (await couleur(p2, "J1")) === "rouge"; }));
  verifier("…« Rejoindre » revient", await p1.evaluate(() => !!document.querySelector('[data-vocal="rejoindre"]')));
});

titre("9. QUATRE VOIX AU PLUS");
await section(async () => {
  // Nico (J2) est dedans ; trois autres arrivent (J3, J4, J5) : la table est pleine pour Ben.
  ["J3", "J4", "J5"].forEach(j => ecrire({ op: "set", chemin: "Vocal/P1/Presents/" + j, data: { Nom: j, Etat: "ok", Vu: Date.now() + 60000, Session: "x" + j } }));
  await p1.waitForTimeout(600);
  await toucher(p1, '[data-vocal="rejoindre"]');
  await p1.waitForTimeout(600);
  const e = await vocal(p1);
  verifier("Ben ne rejoint pas une table de 4 voix", !e.rejoint, JSON.stringify(e));
  verifier("…le papier le dit", await p1.evaluate(() => /pleine/.test(document.getElementById("vocal-note").textContent)));
  const r = await p1.evaluate(() => { const rp = document.getElementById("papier-vocal").getBoundingClientRect(), rs = document.getElementById("grimoire-scene").getBoundingClientRect();
    const s = parseFloat(getComputedStyle(document.getElementById("grimoire-scene")).getPropertyValue("--s")) || 1; return { bas: rp.bottom, basLivre: rs.top + 1117 * s }; });
  verifier("…cinq noms et une note : le papier tient encore dans le livre", r.bas <= r.basLivre + 20, JSON.stringify(r));
  await cap(p1, "v396_table_pleine");
  ["J3", "J4", "J5"].forEach(j => ecrire({ op: "delete", chemin: "Vocal/P1/Presents/" + j }));
  await p1.waitForTimeout(400);
});

titre("10. UNE PRÉSENCE OUBLIÉE (PLUS DE BATTEMENT) N'EST PLUS LÀ");
await section(async () => {
  ecrire({ op: "set", chemin: "Vocal/P1/Presents/J3", data: { Nom: "Adrien", Etat: "ok", Vu: Date.now() - 120000, Session: "vieux" } });
  await p1.waitForTimeout(500);
  verifier("un joueur sans nouvelles depuis 2 minutes : point rouge, et pas de connexion", (await couleur(p2, "J3")) !== "vert" && !(await vocal(p2)).pairs.some(x => x.id === "J3"));
  ecrire({ op: "delete", chemin: "Vocal/P1/Presents/J3" });
});

titre("11. SORTIR DE LA PARTIE");
await section(async () => {
  await p2.evaluate(() => window.GRIMOIRE_VOCAL.sortir());
  const r = await p2.evaluate(() => ({ papier: !!document.getElementById("papier-vocal"), e: window.GRIMOIRE_VOCAL.etat() }));
  verifier("le papier s'en va, le vocal se ferme", !r.papier && !r.e.rejoint && !r.e.partie, JSON.stringify(r));
  verifier("…la présence de Nico est effacée", !base_.has("Vocal/P1/Presents/J2") && !base_.has("Vocal/P1/EnJeu/J2"));
  verifier("…chez Ben, le nom de Nico se grise", await attendreQue(p1, () => p1.evaluate(() => document.querySelector('.vocal-joueur[data-joueur="J2"]').classList.contains("hors-jeu"))));
  verifier("grimoire.js fait entrer et sortir le vocal avec la partie", /GRIMOIRE_VOCAL\.entrer\(/.test(lire("grimoire.js")) && /GRIMOIRE_VOCAL\.sortir\(\)/.test(lire("grimoire.js")));
});

titre("12. LES FICHIERS ET LA VERSION");
await section(async () => {
  const html = lire("index.html");
  verifier("index.html charge vocal.js et vocal.css", /<script type="module" src="vocal\.js\?v=\d+"><\/script>/.test(html) && /href="vocal\.css\?v=\d+"/.test(html));
  verifier("vocal.js importe le même firebase-config que les autres", /firebase-config\.js\?v=2"/.test(lire("vocal.js")));
  const v = JSON.parse(lire("version.json")).version;
  verifier("version.json et VERSION_IVALIS d'accord (396 ou plus)", v >= 396 && new RegExp("VERSION_IVALIS = " + v + ";").test(lire("trace_combat.js")), String(v));
  verifier("pas d'erreur dans les pages", !erreurs.length, erreurs.slice(0, 3).join(" | "));
});

await b.close(); serveur.close();
console.log(echecs ? `\n${echecs} CONTRÔLE(S) EN ÉCHEC` : "\nTOUT EST BON");
process.exit(echecs ? 1 : 0);
