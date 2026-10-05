// L'ÉNERGIE SOUS LA CARTE EN COMBAT, ET L'ENCART DU REPOS LONG.
//
// Nico : « sous la carte, quand on choisit une compétence à jouer, la jauge de
// fatigue de notre personnage avec la fatigue actuelle, et dans une autre
// couleur clignotante la fatigue perdue, avec le chiffre qu'il restera. Pour le
// repos long, à la place de la carte un petit encart qui dit repos long et
// combien on régénère, et en dessous cette même jauge avec la fatigue en plus. »
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
await p.waitForTimeout(1500);

// Le combat : mon héros à 62 d'énergie, une carte à 22.
const preparer = (extra = {}) => p.evaluate((extra) => {
  const f = document.getElementById("fenetre-combat");
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (!e.contains(f)) e.style.display = "none"; });
  f.style.display = "block";
  for (let e = f.parentElement; e && e !== document.body; e = e.parentElement) if (getComputedStyle(e).display === "none") e.style.display = "block";
  window.HEROS_BANC = { idPersonnage: "P1", prenom: "Aelis", race: "Elfe", fatigueActuelle: 62, fatigueMax: 100, ...extra };
  window.COMBAT_PERSOS_JOUEUR = [window.HEROS_BANC]; window.COMBAT_INDEX_PERSO = 0;
  window.PARTIE_DATA = { Phase_Combat: "Preparation" };
  window.MOUVEMENT_COUT_TOTAL = 0;
  window.herosPourCarte = () => window.HEROS_BANC;
  window.COMPETENCES_CACHE["C1"] = { Nom: "Taille croisée", Fatigue: 22, Initiative: 78, Effets_Compiles: [{ nom: "Attaque légère", desc: "6 dégâts" }], Composants: { actions: [] } };
  window.COMPETENCES_CACHE["C2"] = { Nom: "Coup lourd", Fatigue: 80, Initiative: 20, Effets_Compiles: [], Composants: { actions: [] } };
  return window.fatigueMaxCombattant(window.HEROS_BANC);
}, extra);

const lire = () => p.evaluate(() => {
  const c = document.getElementById("apercu-carte-hd-competence");
  const j = c && c.querySelector(".jauge-energie-apercu");
  const rc = c.getBoundingClientRect();
  if (!j) return { jauge: false, hauteur: rc.height, encart: !!c.querySelector(".encart-repos-long"), texte: c.textContent.replace(/\s+/g, " ") };
  const rj = j.getBoundingClientRect();
  const pleine = j.querySelector(".jauge-energie-pleine"), delta = j.querySelector(".jauge-energie-delta");
  const msg = [...c.children].find(d => /Énergie Insuffisante/i.test(d.textContent));
  return { jauge: true, sousLaCarte: rj.top >= rc.bottom - 1, hauteur: rc.height,
           libelle: j.querySelector(".jauge-energie-libelle").textContent.replace(/\s+/g, " ").trim(),
           apres: j.querySelector(".jauge-energie-apres").textContent,
           pleine: parseFloat(pleine.style.width), deltaG: parseFloat(delta.style.left), deltaL: parseFloat(delta.style.width),
           anim: getComputedStyle(delta).animationName, couleur: getComputedStyle(delta).backgroundImage,
           classe: j.className, encart: !!c.querySelector(".encart-repos-long"), texte: c.textContent.replace(/\s+/g, " "),
           message: msg ? msg.getBoundingClientRect().top >= rj.bottom : null };
});

console.log("1. UNE CARTE CHOISIE : L'ÉNERGIE ACTUELLE, LA PERTE QUI CLIGNOTE, CE QUI RESTERA");
const max = await preparer();
await p.evaluate(() => window.afficherApercuCarteHD("C1"));
let r = await lire();
verifier("la jauge est sous la carte", r.jauge && r.sousLaCarte, JSON.stringify(r).slice(0, 120));
verifier("elle dit l'énergie actuelle et ce qui restera : 62 → 40", /Énergie 62/.test(r.libelle) && r.apres === "40", r.libelle);
verifier("la partie pleine = ce qui restera (40 %)", Math.abs(r.pleine - 40 / max * 100) < 0.1, `${r.pleine} (max ${max})`);
verifier("la perte (22) est la partie colorée, juste après", Math.abs(r.deltaG - 40 / max * 100) < 0.1 && Math.abs(r.deltaL - 22 / max * 100) < 0.1, `${r.deltaG} + ${r.deltaL}`);
verifier("en rouge, et elle clignote", /perte/.test(r.classe) && r.anim === "clignote-energie" && /255, 107, 107|224, 31, 31/.test(r.couleur), r.anim);

console.log("\n2. LE TRAJET DÉJÀ TRACÉ COMPTE AUSSI");
await p.evaluate(() => { window.MOUVEMENT_COUT_TOTAL = 10; window.masquerApercuCarteHD(true); window.afficherApercuCarteHD("C1"); });
r = await lire();
verifier("22 de carte + 10 de trajet : il restera 30", r.apres === "30" && Math.abs(r.deltaL - 32 / max * 100) < 0.1, `${r.apres} ${r.deltaL}`);

console.log("\n3. UNE CARTE TROP CHÈRE");
await p.evaluate(() => { window.MOUVEMENT_COUT_TOTAL = 0; window.masquerApercuCarteHD(true); window.afficherApercuCarteHD("C2"); });
r = await lire();
verifier("il restera 0, et la jauge dit ce qui manque (18)", r.apres === "0" && /il manque 18/.test(r.libelle), r.libelle);
verifier("toute l'énergie actuelle clignote", r.pleine === 0 && Math.abs(r.deltaL - 62 / max * 100) < 0.1, `${r.pleine} ${r.deltaL}`);
verifier("« Énergie insuffisante » s'écrit sous la jauge, sans la chevaucher", r.message === true, r.message);

console.log("\n4. PAS DE JAUGE QUAND IL N'Y A RIEN À CHOISIR");
await p.evaluate(() => { window.masquerApercuCarteHD(true); window.afficherApercuCarteHD("C1", true); });
verifier("carte retenue (verrouillée) : pas de jauge", !(await lire()).jauge);
await p.evaluate(() => { window.PARTIE_DATA.Phase_Combat = "Resolution"; window.masquerApercuCarteHD(true); window.afficherApercuCarteHD("C1"); });
verifier("pendant la résolution : pas de jauge", !(await lire()).jauge);
await p.evaluate(() => { window.PARTIE_DATA.Phase_Combat = "Preparation"; window.HEROS_BANC.estMonstre = true; window.masquerApercuCarteHD(true); window.afficherApercuCarteHD("C1"); window.HEROS_BANC.estMonstre = false; });
verifier("carte d'une créature : pas de jauge", !(await lire()).jauge);
await p.evaluate(() => { document.getElementById("fenetre-combat").style.display = "none"; window.masquerApercuCarteHD(true); window.afficherApercuCarteHD("C1");
                         document.getElementById("fenetre-combat").style.display = "block"; });
verifier("hors combat (fiche perso) : pas de jauge", !(await lire()).jauge);

console.log("\n5. LE REPOS LONG : UN ENCART À LA PLACE DE LA CARTE, LE GAIN EN VERT");
await p.evaluate(() => { window.masquerApercuCarteHD(true); window.choisirReposLongDansVolet(); });
r = await lire();
const gain = Math.min(max - 62, Math.floor(max * 0.35));
verifier("l'encart « Repos long » remplace la carte", r.encart && /Repos long/i.test(r.texte) && r.hauteur > 100 && r.hauteur < 200, `${r.hauteur}px`);
verifier(`il dit combien il rend : +${gain}`, r.texte.includes(`+${gain}`), r.texte.slice(0, 120));
verifier(`la jauge : 62 → ${62 + gain}`, /Énergie 62/.test(r.libelle) && r.apres === String(62 + gain), r.libelle);
verifier("la partie pleine = l'énergie actuelle, le gain juste après", Math.abs(r.pleine - 62 / max * 100) < 0.1 && Math.abs(r.deltaL - gain / max * 100) < 0.1, `${r.pleine} + ${r.deltaL}`);
verifier("en vert, et il clignote", /gain/.test(r.classe) && r.anim === "clignote-energie" && /141, 255, 171|35, 209, 96/.test(r.couleur), r.couleur);
verifier("le repos reste le choix retenu (bouton fin de tour)", await p.evaluate(() => window.CARTE_APERCU && window.CARTE_APERCU.idCarte === "REPOS_LONG"));
const cap = process.env.CAPTURE;
if (cap) { await p.waitForTimeout(300); await p.screenshot({ path: cap + "_repos.png" }); }

console.log("\n6. ÉNERGIE DÉJÀ PLEINE, PUIS RETOUR À UNE CARTE");
await p.evaluate(() => { window.HEROS_BANC.fatigueActuelle = 9999; window.masquerApercuCarteHD(true); window.choisirReposLongDansVolet(); });
r = await lire();
verifier("énergie pleine : l'encart le dit, rien ne clignote", /déjà pleine/.test(r.texte) && r.deltaL === 0, r.texte.slice(0, 90));
await p.evaluate(() => { window.HEROS_BANC.fatigueActuelle = 62; window.masquerApercuCarteHD(true); window.afficherApercuCarteHD("C1"); });
r = await lire();
verifier("une carte rouverte reprend sa taille de carte (476 px)", Math.round(r.hauteur) === 476 && !r.encart, `${r.hauteur}`);
if (cap) { await p.waitForTimeout(300); await p.screenshot({ path: cap + "_carte.png" }); }

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
