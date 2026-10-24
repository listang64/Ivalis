// v264 — L'ENCART DIT LE MONTANT QUI TOMBERA
//
// Nico, sur l'encart de la compétence jouée : « la triche et la surpuissance
// doivent être prises en compte directement. Et la surpuissance, tu indiques
// juste "surpuissance", pas le calcul. »
//
// Sur la vraie page (faux Firestore) :
//   1. un héros : le montant multiplié par sa surpuissance (×1,25 dès 70 de
//      fatigue, ×1,35 dès 100), arrondi comme le moteur ; le mot
//      « Surpuissance » en or, plus de « ×1,25 » ; rien sous 70 ;
//   2. une créature : sa triche selon le niveau du groupe (8 % au niveau 1,
//      15 % au niveau 5), leader compris (+15), par la même fonction que le
//      moteur ; un zombie (sans stature) n'en a pas ;
//   3. les versions.
// Le banc se charge sur l'ancien code (IVALIS_RACINE) : il y échoue, sans planter.
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const essai = (f, d = null) => { try { return f(); } catch (e) { return d; } };
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf-8');
const titre = (t) => { console.log("\n========================================================="); console.log("  " + t); console.log("========================================================="); };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
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
  const docs = () => (window.__docs = window.__docs || {});
  export const getDoc = async (ref) => { const d = docs()[ref.chemin]; return { exists: () => !!d, data: () => JSON.parse(JSON.stringify(d || {})) }; };
  export const getDocs = async (ref) => { const l = ((window.__collections || {})[ref && ref.col] || []).map(x => ({ id: x.id, data: () => x.data }));
    return { forEach: (f) => l.forEach(f), docs: l, empty: l.length === 0 }; };
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data, options });
    docs()[ref.chemin] = options && options.merge ? { ...(docs()[ref.chemin] || {}), ...data } : data; };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data });
    if (docs()[ref.chemin]) Object.assign(docs()[ref.chemin], JSON.parse(JSON.stringify(data))); };
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a}); export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
  export const writeBatch = () => { const ops = []; return { set(ref, d){ ops.push({ chemin: ref.chemin, data: d }); }, update(ref, d){ ops.push({ chemin: ref.chemin, data: d }); },
    delete(){}, commit: async () => { (window.__lots = window.__lots || []).push(...ops); } }; };
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
// La plaque de l'encart (injoignable d'ici) : un bouchon carré.
const PLAQUE = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect x="120" y="160" width="890" height="840" rx="40" fill="#1d1712"/></svg>`;
const PION = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="96" fill="#c44"/></svg>`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: /IMG_2122/.test(r.request().url()) ? PLAQUE : PION }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(1500);
await p.evaluate(() => {
  window.__ou = (f, d) => { try { return f(); } catch (e) { return d; } };
  window.__ouAsync = async (f, d) => { try { return await f(); } catch (e) { return d; } };
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById('fenetre-combat').style.display = 'block';
  window.initialiserPlateau();
  window.ID_PARTIE_COURANTE = "P1";
  window.PARTIE_DATA = { Tour_Combat: 1 };
  window.TOKENS_VTT_DATA = {};
  window.jouerSonClic = () => {};
  window.__docs = { "Systeme_Parties/P1": { Ordre_Initiative: ["H1", "H2"] } };
  window.__hex = (t) => t ? t.q + "," + t.r : null;
  window.__dist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((-a.q - a.r) - (-b.q - b.r)));
  window.__ecran = (q, r) => { const px = window.PLATEAU_VTT.hexToPixel(q, r);
    return { x: window.VTT_POS_X + px.x * window.VTT_SCALE, y: window.VTT_POS_Y + px.y * window.VTT_SCALE }; };
  // Les héros du groupe : XP 0 → niveau 1, 1200 → 3, 2500 → 5, 6400 → 9.
  window.__heros = (liste) => liste.map(([id, prenom, xp, extra]) => ({ idPersonnage: id, prenom, camp: "Allié", xp, PV_Max: 40, PV_Actuels: 40,
    Fatigue_Max: 100, fatigueActuelle: 100, Etats_Alteres: [], statut: "Vivant", ...(extra || {}) }));
});

// Une carte de chaque nature, lue par l'encart pour un lanceur donné.
await p.evaluate(() => {
  window.__carte = (fatigue) => ({ Nom: "Lame des cendres", Arme: "Magie", Fatigue: fatigue, Initiative: 40, Composants: { actions: [] }, Effets_Compiles: [
    { nom: "Attaque légère", desc: "12 dégats physique", isMod: false },
    { nom: "Attaque Magique", desc: "9 dégâts magique · 🔥 Feu", isMod: false },
    { nom: "Brûlé", desc: "20% chance de brûlure sur 2 tour (Max 60%)", isMod: true },
    { nom: "Distorsion mentale", desc: "5 dégat brut", isMod: false },
    { nom: "Soin", desc: "6 soins", isMod: false } ] });
  window.__lire = (fatigue, lanceur) => {
    const boite = document.createElement("div");
    boite.innerHTML = window.__ou(() => window.ligneEffetsCarte(window.__carte(fatigue), lanceur), "");
    const montants = [...boite.querySelectorAll(".encart-montant")];
    return { chiffres: montants.map(d => (d.querySelector(".encart-chiffre") || {}).textContent || "").join(" "),
             surp: montants.map(d => (d.querySelector(".encart-surpuissance") || {}).textContent || "").join("|"),
             texte: boite.textContent.replace(/\s+/g, " ") };
  };
  window.__niveau = (xp) => { window.PERSOS_JOUEURS_PARTIE = window.__heros([["H1", "Aldric", xp]]); window.__ou(() => window.recomposerCombattants(), null); return window.NIVEAU_GROUPE; };
});

titre("1. UN HÉROS : SA SURPUISSANCE COMPTÉE, ET DITE D'UN MOT");
{
  const r = await p.evaluate(() => {
    const heros = { idPersonnage: "H1", prenom: "Aldric", camp: "Allié" };
    const surp = (f) => window.__ou(() => window.multiplicateurSurpuissance(f), 1);
    // Ce que le moteur fait de la valeur de la carte (moteur_effets.js).
    const moteur = (v, f) => surp(f) > 1 ? Math.round(v * surp(f)) : v;
    return { a80: window.__lire(80, heros), a100: window.__lire(100, heros), a30: window.__lire(30, heros),
             attendu80: [12, 9, 5, 6].map(v => moteur(v, 80)).join(" "), attendu100: [12, 9, 5, 6].map(v => moteur(v, 100)).join(" ") };
  });
  verifier("80 de fatigue (×1,25) : 15, 11, 6, 8 — ce que le moteur fera tomber", r.a80.chiffres === "15 11 6 8" && r.a80.chiffres === r.attendu80, `${r.a80.chiffres} (moteur : ${r.attendu80})`);
  verifier("à côté de chacun, le mot « Surpuissance »", r.a80.surp === "Surpuissance|Surpuissance|Surpuissance|Surpuissance", r.a80.surp);
  verifier("plus de calcul affiché (ni « ×1,25 », ni « ×1,35 »)", !/×/.test(r.a80.texte) && !/×/.test(r.a100.texte), r.a80.texte.slice(0, 90));
  verifier("100 de fatigue (×1,35) : 16, 12, 7, 8", r.a100.chiffres === "16 12 7 8" && r.a100.chiffres === r.attendu100, `${r.a100.chiffres} (moteur : ${r.attendu100})`);
  verifier("30 de fatigue : les chiffres de la carte, sans le mot", r.a30.chiffres === "12 9 5 6" && r.a30.surp === "|||", `${r.a30.chiffres} « ${r.a30.surp} »`);
}

titre("2. UNE CRÉATURE : SA TRICHE SELON LE NIVEAU DU GROUPE");
{
  const r = await p.evaluate(() => {
    const res = {};
    const normal = { idPersonnage: "M1", prenom: "Goule", camp: "Ennemi", estMonstre: true, Palier: "Normal" };
    const MP = window.moteurPur || {};
    // Ce que le moteur fait tomber, arrondi à l'unité pour l'affichage.
    const moteur = (v, c) => Math.round(MP.appliquerBonusMonstre(v, MP.bonusMonstreDe(c)));
    res.niveau1 = window.__niveau(0);
    res.n1 = window.__lire(80, normal);
    res.attendu1 = [12, 9, 5, 6].map(v => window.__ou(() => moteur(v, { estMonstre: true, palier: "Normal" }), null)).join(" ");
    res.chef = window.__lire(80, { ...normal, leader: true });
    res.attenduChef = [12, 9, 5, 6].map(v => window.__ou(() => moteur(v, { estMonstre: true, palier: "Normal", leader: true }), null)).join(" ");
    res.niveau5 = window.__niveau(2500);
    res.n5 = window.__lire(80, normal);
    res.zombie = window.__lire(80, { idPersonnage: "Z1", prenom: "Zombie", camp: "Allié", estMonstre: true, zombie: true });
    window.__niveau(0);
    return res;
  });
  verifier("groupe niveau 1 (+8 %) : 13, 10, 5, 6 — ce que le moteur fera tomber", r.niveau1 === 1 && r.n1.chiffres === "13 10 5 6" && r.n1.chiffres === r.attendu1,
           `${r.n1.chiffres} (moteur : ${r.attendu1})`);
  verifier("une créature n'a jamais de surpuissance (80 de fatigue ou pas)", r.n1.surp === "|||" && !/Surpuissance/.test(r.n1.texte), r.n1.surp);
  verifier("un leader (+8 + 15 = 23 %) : 15, 11, 6, 7", r.chef.chiffres === "15 11 6 7" && r.chef.chiffres === r.attenduChef, `${r.chef.chiffres} (moteur : ${r.attenduChef})`);
  verifier("groupe niveau 5 (+15 %) : 14, 10, 6, 7", r.niveau5 === 5 && r.n5.chiffres === "14 10 6 7", `${r.n5.chiffres}`);
  verifier("un zombie (sans stature) : les chiffres de la carte", r.zombie.chiffres === "12 9 5 6", r.zombie.chiffres);
}

titre("3. LES VERSIONS");
{
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS = (\d+)/) || [])[1]);
  const vJson = essai(() => JSON.parse(lire('version.json')).version, 0);
  verifier("version 264 ou plus (trace_combat.js, version.json)", vTrace >= 264 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const v = (f) => Number((html.match(new RegExp('["/ ]' + f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  verifier("combat.js v149+, trace_combat.js v175+", v("combat.js") >= 149 && v("trace_combat.js") >= 175, `${v("combat.js")} / ${v("trace_combat.js")}`);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
