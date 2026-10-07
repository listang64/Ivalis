// L'ONGLET « APERÇU » DE LA FICHE (ex-Statistiques).
//
// Nico : « J'aimerais que tu me refasses une refonte graphique propre de
// l'onglet Statistiques perso dans la fiche perso. On va renommer cet onglet :
// Aperçu. Plus joli et plus lisible. L'encart des effets de race et de classe,
// ça va, tu peux le laisser, mais le reste change. »
//   - un en-tête : blason (initiale), nom, puces Race / Classe / Niveau ;
//   - Vitalité : trois tuiles (PV, fatigue max, régénération) ;
//   - Réflexes (esquive, parade, critique) et Résistances (défenses), chaque
//     pourcentage avec sa jauge sur 100 ;
//   - l'encart race/classe, inchangé, en dessous.
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(70)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
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
const erreurs = [];
const ouvrir = async (largeur) => {
  const p = await b.newPage({ viewport: { width: largeur, height: 900 } });
  p.on('pageerror', e => erreurs.push(e.message));
  await p.route('**', r => {
    const url = r.request().url();
    if (url.startsWith(base)) return r.continue();
    if (url.includes('firebase-app.js')) return r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP });
    if (url.includes('firebase-firestore.js')) return r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE });
    return r.abort();
  });
  await p.goto(base + '/index.html');
  await p.waitForTimeout(2000);
  await p.evaluate(() => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
    const fiche = document.getElementById("fenetre-fiche-perso");
    fiche.style.display = "flex"; fiche.style.left = "2vw"; fiche.style.top = "10px";
    const bouton = [...document.querySelectorAll(".onglet-btn")].find(x => x.textContent.trim() === "Aperçu");
    if (bouton) bouton.click();
    window.afficherStatsCombat({ prenom: "Morvak", nom: "Cendrelame", race: "Gob", classe: "Sorcier", XP: 2500, PV_Max: 50,
                                 Fatigue_Max: 100, Regeneration: 35, Esquive: 12, Parade: 0, Critique: 8, Def_Physique: 6, Def_Magique: 14 });
  });
  await p.waitForTimeout(600);
  return p;
};

console.log("\n=========================================================");
console.log("  L'ONGLET APERÇU");
console.log("=========================================================");

const p = await ouvrir(1194);
const r = await p.evaluate(() => {
  const onglets = [...document.querySelectorAll(".conteneur-onglets .onglet-btn")].map(x => x.textContent.trim());
  const o = document.getElementById("onglet-stats");
  const txt = (id) => (document.getElementById(id) || {}).innerText;
  const jauge = (id) => { const l = o.querySelector(`.apercu-ligne[data-stat="${id}"]`);
    const j = l && l.querySelector(".apercu-jauge-remplie"), t = l && l.querySelector(".apercu-jauge");
    return j && t ? Math.round(j.getBoundingClientRect().width / t.getBoundingClientRect().width * 100) : -1; };
  const sections = [...o.querySelectorAll(".apercu-section-titre")].map(x => x.textContent.trim());
  const encart = document.getElementById("encart-bonus-race-classe");
  const dernierBloc = [...o.querySelectorAll(".apercu-bloc")].pop();
  return {
    onglets, visible: getComputedStyle(o).display !== "none",
    nom: txt("stats-nom-perso"), blason: txt("stats-blason"),
    race: txt("stat-race"), classe: txt("stat-classe"), niveau: txt("stat-niveau"),
    vitalite: [txt("stat-pv"), txt("stat-fatigue"), txt("stat-regen")],
    pourcents: ["stat-esquive", "stat-parade", "stat-critique", "stat-defphys", "stat-defmag"].map(txt),
    jauges: ["stat-esquive", "stat-parade", "stat-critique", "stat-defphys", "stat-defmag"].map(jauge),
    paradeNulle: o.querySelector('.apercu-ligne[data-stat="stat-parade"]').classList.contains("apercu-ligne-nulle"),
    sections,
    encartApres: !!encart && encart.closest("#onglet-stats") === o && encart.textContent.includes("Sorcier")
      && (dernierBloc.compareDocumentPosition(encart) & Node.DOCUMENT_POSITION_FOLLOWING) > 0,
    styleEnLigne: o.querySelectorAll("div[style*='grid-template-columns']").length,
    colonnes: getComputedStyle(o.querySelector(".apercu-colonnes")).gridTemplateColumns.split(" ").length
  };
});
await p.screenshot({ path: "/tmp/claude-0/apercu_fiche.png" });
verifier("l'onglet s'appelle « Aperçu » (plus « Statistiques »)", r.onglets.includes("Aperçu") && !r.onglets.includes("Statistiques"),
         JSON.stringify(r.onglets));
verifier("l'en-tête : blason à l'initiale, nom, Race / Classe / Niveau",
         r.visible && r.blason === "M" && r.nom === "Morvak Cendrelame" && r.race === "Gob" && r.classe === "Sorcier" && r.niveau === "5",
         JSON.stringify({ blason: r.blason, nom: r.nom, race: r.race, classe: r.classe, niveau: r.niveau }));
verifier("trois sections : Vitalité, Réflexes, Résistances", JSON.stringify(r.sections) === '["Vitalité","Réflexes","Résistances"]',
         JSON.stringify(r.sections));
verifier("Vitalité : PV, fatigue max, régénération — les chiffres du combat (Gob : +3 esquive)",
         JSON.stringify(r.vitalite) === '["50","100","35%"]' && r.pourcents[0] === "15%", JSON.stringify(r.vitalite) + " " + r.pourcents[0]);
verifier("chaque pourcentage a sa jauge à sa mesure (sur 100)",
         r.jauges.every((j, i) => Math.abs(j - parseInt(r.pourcents[i])) <= 1), JSON.stringify(r.jauges) + " / " + JSON.stringify(r.pourcents));
verifier("une valeur nulle (parade 0 %) se grise", r.paradeNulle && r.pourcents[1] === "0%");
verifier("l'encart race/classe est gardé, sous les chiffres", r.encartApres);
verifier("plus de tuiles en style en ligne : tout passe par la feuille de style", r.styleEnLigne === 0 && r.colonnes === 2);

console.log("\n  SUR UN ÉCRAN ÉTROIT");
const q = await ouvrir(420);
const e = await q.evaluate(() => {
  const o = document.getElementById("onglet-stats");
  return { colonnes: getComputedStyle(o.querySelector(".apercu-colonnes")).gridTemplateColumns.split(" ").length,
           deborde: o.scrollWidth > o.clientWidth + 1 };
});
await q.screenshot({ path: "/tmp/claude-0/apercu_etroit.png" });
verifier("les colonnes s'empilent, rien ne déborde", e.colonnes === 1 && !e.deborde, JSON.stringify(e));

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
