// v404 — LE BOUCLIER MAGIQUE BRISÉ, ENFIN MONTRÉ JUSTE ; LE VOLUME DE CHAQUE JOUEUR.
// 1. Nico : « le bouclier prend les dégâts ; s'il y a un surplus pour les points de
//    vie, il s'applique directement aux points de vie de celui qui vient de perdre
//    son bouclier, mais divisé par deux ». Le calcul le faisait (encaisserBouclier) ;
//    l'écran disait le coup ENTIER sur la barre de vie (« −30 » pour −10) : on croyait
//    le coup réduit. Le bouclier dit ce qu'il encaisse, la vie ce qu'elle perd.
// 2. Nico : « à côté des noms des joueurs dans le papier du chat vocal, un petit
//    bouton : quand on clique, s'ouvre, fluide, une tirette pour régler le volume de
//    ce joueur précisément ». Deux vrais postes en WebRTC (la mise en place de
//    corrections_v396).
//
// Lancer : node tests_monstres/corrections_v404.mjs   (V404_CAPTURES=dossier : les captures)
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
const CAPTURES = process.env.V404_CAPTURES || "";
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
    // (v401) les sons du vocal sont retenus : le cor quand une voix arrive, la retraite quand elle part
    window.__sonsVocal = []; window.jouerSonEvenement = (id) => { if (/^cor-/.test(id)) window.__sonsVocal.push(id); return true; }; window.jouerSonClic = () => {};
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
const { misEnScene } = await import(path.join(RACINE, 'pont_combat.js'));
const { construireEtatCombat } = await import(path.join(RACINE, 'combat_etat.js'));
const { chaineDeDegats } = await import(path.join(RACINE, 'moteur_pur.js'));

titre("1. LE BOUCLIER MAGIQUE BRISÉ : LE BOUCLIER DIT CE QU'IL ENCAISSE, LA VIE CE QU'ELLE PERD");
await section(async () => {
  // La règle, au moteur : bouclier 10, coup 30 → le bouclier tombe, la vie perd (30 − 10) ÷ 2 = 10.
  const c = chaineDeDegats({ pv: 60, pvMax: 60, bouclier: 10, etats: [], def: {} }, { valeurBrute: 30, typeRes: "Physique" }, {});
  verifier("le moteur : le bouclier encaisse 10, la vie perd le surplus ÷ 2 (10)", c.versBouclier === 10 && c.bouclierApres === 0 && c.versPv === 10 && c.bouclierBrise, JSON.stringify(c));
  const c2 = chaineDeDegats({ pv: 60, pvMax: 60, bouclier: 10, etats: [], def: {} }, { valeurBrute: 6, typeRes: "Magique" }, {});
  verifier("…un coup plus petit que le bouclier : tout sur le bouclier, rien sur la vie", c2.versBouclier === 6 && c2.bouclierApres === 4 && c2.versPv === 0, JSON.stringify(c2));
  // L'écran.
  const fiche = (id, extra) => ({ idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
  const etat = construireEtatCombat({ idPartie: "G", cerveau: "P_03", graine: 4,
    combattants: [fiche("H1", { idJoueur: "P_03", camp: "Allié", prenom: "Naomi" }), fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Goule" })],
    positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } }, partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"], File_Attente_Combat: [] } });
  etat.combattants.H1.bouclier = 10; etat.combattants.H1.bouclierMax = 10;
  const brise = misEnScene({ type: "degats", cible: "H1", acteur: "M1", montant: 30, surBouclier: 10, bouclierBrise: true, bouclierApres: 0, pvApres: 50, nature: "physique" }, etat);
  verifier("le coup traverse : sur la barre de vie, « -10 » (ce qu'elle perd), plus « -30 »", brise.champ === "pv" && brise.texte === "-10" && brise.de === 60 && brise.vers === 50, JSON.stringify({ t: brise.texte, de: brise.de, vers: brise.vers }));
  verifier("…le bouclier qui vole en éclats dit ce qu'il a encaissé : « Bouclier brisé ! -10 🛡️ »", brise.reaction && brise.reaction.sorte === "bouclier-brise" && brise.reaction.texte === "Bouclier brisé ! -10 🛡️", JSON.stringify(brise.reaction));
  const critique = misEnScene({ type: "degats", cible: "H1", acteur: "M1", montant: 30, surBouclier: 10, bouclierBrise: true, bouclierApres: 0, pvApres: 50, critique: true }, etat);
  verifier("…un critique garde son « ! » sur ce que la vie perd", critique.texte === "-10 !", critique.texte);
  const dessus = misEnScene({ type: "degats", cible: "H1", acteur: "M1", montant: 6, surBouclier: 6, bouclierApres: 4, pvApres: 60 }, etat);
  verifier("un coup tout entier sur le bouclier : « -6 » sur le bouclier (inchangé)", dessus.champ === "bouclier" && dessus.texte === "-6" && dessus.de === 10 && dessus.vers === 4, JSON.stringify({ c: dessus.champ, t: dessus.texte }));
  const exact = misEnScene({ type: "degats", cible: "H1", acteur: "M1", montant: 10, surBouclier: 10, bouclierBrise: true, bouclierApres: 0, pvApres: 60 }, etat);
  verifier("un coup qui brise le bouclier sans le dépasser : « -10 » sur le bouclier, « Bouclier brisé ! »", exact.champ === "bouclier" && exact.texte === "-10" && !exact.reaction.texte, JSON.stringify({ c: exact.champ, t: exact.texte, r: exact.reaction }));
  etat.combattants.H1.bouclier = 0; etat.combattants.H1.bouclierMax = 0;
  const sans = misEnScene({ type: "degats", cible: "H1", acteur: "M1", montant: 30, surBouclier: 0, bouclierApres: 0, pvApres: 30 }, etat);
  verifier("sans bouclier : le coup entier, comme avant (« -30 »)", sans.champ === "pv" && sans.texte === "-30", sans.texte);
  verifier("l'animation du bouclier brisé affiche ce texte (animations_catalogue.js)", /o\.texte\(sc\.calque, sc\.lanceur, sc\.texte \|\| "Bouclier brisé !"/.test(lire("animations_catalogue.js")));
});

titre("2. LE VOLUME DE CHAQUE JOUEUR : UN BOUTON, UNE TIRETTE QUI GLISSE");
await section(async () => {
  await toucher(p1, '[data-vocal="rejoindre"]');
  await toucher(p2, '[data-vocal="rejoindre"]');
  const relies = await attendreQue(p2, async () => { const a = await vocal(p1), c = await vocal(p2); return a.pairs[0] && c.pairs[0] && a.pairs[0].etat === "connected" && c.pairs[0].etat === "connected"; }, 15000);
  verifier("(les deux postes sont reliés)", relies);
  const avant = await p2.evaluate(() => {
    const ligne = (id) => document.querySelector(`.vocal-joueur[data-joueur="${id}"]`);
    const r = ligne("J1").querySelector(".reglage-voix");
    return { boutonBen: !!ligne("J1").querySelector('[data-vocal="reglage"]'), boutonMoi: !!ligne("J2").querySelector('[data-vocal="reglage"]'),
             ferme: !r.classList.contains("ouvert") && r.offsetHeight === 0, transition: getComputedStyle(r).transitionProperty };
  });
  verifier("un petit bouton à côté du nom de Ben (et pas à côté du sien)", avant.boutonBen && !avant.boutonMoi, JSON.stringify(avant));
  verifier("…la tirette est rangée, et elle glisse (hauteur et fondu)", avant.ferme && /max-height/.test(avant.transition) && /opacity/.test(avant.transition), JSON.stringify(avant));
  await toucher(p2, '.vocal-joueur[data-joueur="J1"] [data-vocal="reglage"]');
  // À mi-chemin du glissé, puis à la fin : elle s'ouvre en douceur.
  await p2.waitForTimeout(120);
  // (sa vraie hauteur : le papier est penché, sa boîte englobante ne dit pas zéro)
  const mi = await p2.evaluate(() => document.querySelector('.vocal-joueur[data-joueur="J1"] .reglage-voix').offsetHeight);
  await p2.waitForTimeout(500);
  const ouvert = await p2.evaluate(() => { const r = document.querySelector('.vocal-joueur[data-joueur="J1"] .reglage-voix'); const t = r.querySelector("input");
    return { h: r.offsetHeight, op: getComputedStyle(r).opacity, valeur: t.value, texte: r.querySelector(".valeur-voix").textContent, min: t.min, max: t.max }; });
  verifier("un toucher : la tirette sort en glissant (à mi-chemin, puis en entier)", mi > 0 && mi < ouvert.h && ouvert.h > 10 && ouvert.op === "1", `${mi} → ${ouvert.h}`);
  verifier("…de 0 à 150 %, à 100 % au départ", ouvert.min === "0" && ouvert.max === "150" && ouvert.valeur === "100" && ouvert.texte === "100 %", JSON.stringify(ouvert));
  await cap(p2, "v404_tirette");
  // On la tire à 40 % : la voix de Ben baisse, tout de suite.
  await p2.evaluate(() => { const t = document.querySelector('.vocal-joueur[data-joueur="J1"] .tirette-voix'); t.focus(); t.value = "40"; t.dispatchEvent(new Event("input", { bubbles: true })); });
  await p2.waitForTimeout(1500);
  let e = await vocal(p2);
  verifier("tirée à 40 % : la voix de Ben passe à 0,4", Math.abs(e.pairs[0].volume - 0.4) < 0.001 && Math.abs(e.pairs[0].gain - 0.4) < 0.04, JSON.stringify(e.pairs));
  verifier("…le chiffre suit (« 40 % »), et ce poste s'en souvient", await p2.evaluate(() => document.querySelector('.vocal-joueur[data-joueur="J1"] .valeur-voix').textContent === "40 %"
    && JSON.parse(localStorage.getItem("ivalis_vocal_volumes") || "{}").J1 === 0.4));
  // Pendant qu'on la tient, la liste ne se redessine pas sous le doigt.
  const tenue = await p2.evaluate(async () => { const t = document.querySelector('.vocal-joueur[data-joueur="J1"] .tirette-voix');
    window.GRIMOIRE_VOCAL.basculerSourdine(); window.GRIMOIRE_VOCAL.basculerSourdine(); await new Promise(r => setTimeout(r, 50));
    return document.querySelector('.vocal-joueur[data-joueur="J1"] .tirette-voix') === t; });
  verifier("…tenue au doigt, elle ne se redessine pas (elle ne saute pas)", tenue);
  await p2.evaluate(() => { const t = document.querySelector('.vocal-joueur[data-joueur="J1"] .tirette-voix'); t.value = "150"; t.dispatchEvent(new Event("input", { bubbles: true })); t.dispatchEvent(new Event("change", { bubbles: true })); t.blur(); });
  await p2.waitForTimeout(1500);
  e = await vocal(p2);
  verifier("au plus fort : 150 % (la voix de Ben plus forte que les autres)", Math.abs(e.pairs[0].volume - 1.5) < 0.001 && e.pairs[0].gain > 1.4, JSON.stringify(e.pairs));
  // Avec la lecture : les deux se multiplient (35 % × 150 %).
  await p2.evaluate(() => window.dispatchEvent(new CustomEvent("ivalis-lecture", { detail: { active: true } })));
  await p2.waitForTimeout(1500);
  e = await vocal(p2);
  verifier("pendant la lecture : 35 % × 150 % = 52,5 %", Math.abs(e.pairs[0].volume - 0.525) < 0.001, JSON.stringify(e.pairs));
  await p2.evaluate(() => window.dispatchEvent(new CustomEvent("ivalis-lecture", { detail: { active: false } })));
  // La sourdine coupe tout, même un 150 %.
  await toucher(p2, '[data-vocal="casque"]'); await p2.waitForTimeout(300);
  verifier("la sourdine coupe tout, même à 150 %", (await vocal(p2)).pairs[0].volume === 0);
  await toucher(p2, '[data-vocal="casque"]');
  // Un autre toucher la range.
  await toucher(p2, '.vocal-joueur[data-joueur="J1"] [data-vocal="reglage"]'); await p2.waitForTimeout(600);
  verifier("un autre toucher sur le bouton : la tirette rentre", await p2.evaluate(() => document.querySelector('.vocal-joueur[data-joueur="J1"] .reglage-voix').offsetHeight === 0));
  // Le papier, calé par le bas : il grandit vers le haut, jamais sous le livre.
  const r = await p2.evaluate(() => { const rp = document.getElementById("papier-vocal").getBoundingClientRect(), rs = document.getElementById("grimoire-scene").getBoundingClientRect();
    const s = parseFloat(getComputedStyle(document.getElementById("grimoire-scene")).getPropertyValue("--s")) || 1; return { bas: rp.bottom, basLivre: rs.top + 1117 * s }; });
  verifier("le papier tient dans le livre (calé par le bas, il grandit vers le haut)", r.bas < r.basLivre, JSON.stringify(r));
});

titre("3. LA VERSION");
await section(async () => {
  const v = JSON.parse(lire("version.json")).version;
  verifier("version.json et VERSION_IVALIS d'accord (404)", v === 404 && new RegExp("VERSION_IVALIS = " + v + ";").test(lire("trace_combat.js")), String(v));
  const html = lire("index.html");
  verifier("index.html charge les nouvelles versions (pont_combat 59 ×2, animations_catalogue 26, vocal 3)", (html.match(/pont_combat\.js\?v=59/g) || []).length === 2 && /animations_catalogue\.js\?v=26"/.test(html) && /vocal\.js\?v=3"/.test(html) && /vocal\.css\?v=2"/.test(html));
  verifier("pas d'erreur dans les pages", !erreurs.length, erreurs.slice(0, 3).join(" | "));
});

await b.close(); serveur.close();
console.log(echecs ? `\n${echecs} CONTRÔLE(S) EN ÉCHEC` : "\nTOUT EST BON");
process.exit(echecs ? 1 : 0);
