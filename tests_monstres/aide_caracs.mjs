// LA RÉPARTITION DES CARACTÉRISTIQUES DIT À QUOI SERT CHACUNE.
//
// Nico : « dans le panneau pour créer les caractéristiques d'un nouveau perso,
// rajoute sous chaque carac chaque effet de combat lié, que l'on sache dans
// quoi placer les points. Quelque chose de discret et joli. Et sur une ligne
// en dessous, ce pour quoi cette carac pourra être jouée en RP (pour la
// dextérité : saut, adresse, etc.). »
// Les effets sont ceux du Codex (feuille CRÉA COMP) ; la Constitution, qui n'y
// porte aucun effet, donne les points de vie.
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
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async (ref) => {
    window.__lecturesJoueurs = (window.__lecturesJoueurs || 0) + (ref && ref.col === "Joueurs" ? 1 : 0);
    const docs = ref && ref.col === "Joueurs" ? [
      { id: "J_NICO", data: () => ({ Nom: "Nico", ID_Joueur: "J_NICO" }) },
      { id: "J_ALIX", data: () => ({ Nom: "Alix", ID_Joueur: "J_ALIX" }) },
      { id: "J_BRUNO", data: () => ({ Nom: "Bruno" }) },
      { id: "J_VIDE", data: () => ({}) } ] : [];
    return { forEach: (f) => docs.forEach(f), docs, empty: docs.length === 0 };
  };
  export const setDoc = async () => {};
  export const updateDoc = async (ref, data) => { if (window.__echecMaj) throw new Error("hors ligne"); (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data }); };
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
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

console.log("\n=========================================================");
console.log("  À QUOI SERT CHAQUE CARACTÉRISTIQUE");
console.log("=========================================================");

const r = await p.evaluate(() => {
  window.ouvrirModaleCreationCaracs();
  const lignes = [...document.querySelectorAll("#grille-creation-caracs .ligne-creation-carac")];
  return lignes.map(l => ({
    id: l.dataset.carac,
    nom: l.querySelector(".nom-carac-creation").innerText,
    effets: [...l.querySelectorAll(".aide-carac-effet")].map(e => e.textContent),
    rp: (l.querySelector(".aide-carac-rp") || {}).textContent || "",
    boutons: l.querySelectorAll(".btn-plus-moins").length,
    taillePolice: parseFloat(getComputedStyle(l.querySelector(".aide-carac-effet") || l).fontSize)
  }));
});
const parId = Object.fromEntries(r.map(x => [x.id, x]));
verifier("six caractéristiques, chacune avec ses effets et son RP",
         r.length === 6 && r.every(x => x.effets.length > 0 && x.rp.length > 10), r.map(x => `${x.id}:${x.effets.length}`).join(" "));
verifier("les compteurs sont toujours là (− et +)", r.every(x => x.boutons === 2));
verifier("Dextérité : Attaque légère, Contre, Bond, Repli, Aveuglement, Empoisonnement",
         JSON.stringify(parId.dex.effets) === JSON.stringify(["Attaque légère", "Contre", "Bond", "Repli", "Aveuglement", "Empoisonnement"]),
         parId.dex.effets.join(", "));
verifier("et son RP : saut, adresse…", /saut/.test(parId.dex.rp) && /adresse/.test(parId.dex.rp), parId.dex.rp);
verifier("Constitution : les points de vie", parId.con.effets.join() === "Points de vie max", parId.con.effets.join());
verifier("discret : de petites étiquettes (11 px au plus)", r.every(x => x.taillePolice <= 11), String(r[0].taillePolice));

// FIDÈLE AU CODEX (feuille CRÉA COMP, relevée le 07/10) et au grimoire en
// ligne (Combat_Effets, relu en lecture seule le même jour) : chaque effet sous
// la caractéristique qui le module. Les effets de classe (Ténèbres, Lumière,
// Vampirisme) n'y sont pas : on ne les forge pas à la création. L'instantané
// effets_reels.json des bancs est plus ancien (sans Saignement, Empoisonnement
// encore sans caractéristique) : on ne s'y fie pas ici.
const CODEX = {
  force: ["Attaque lourde", "Étourdit", "Poussée", "Provocations", "Saignement"],
  dex:   ["Attaque légère", "Contre", "Bond", "Repli", "Aveuglement", "Empoisonnement"],
  int:   ["Attaque magique", "Glacé", "Brûlé", "Électrifié", "Traction magique"],
  sag:   ["Soin", "Purification", "Bouclier magique", "Absorption"],
  cha:   ["Mots de pouvoirs", "Confusion", "Peur", "Immobilisation", "Illusion"]
};
const ecarts = Object.keys(CODEX).filter(id => JSON.stringify(parId[id].effets) !== JSON.stringify(CODEX[id]))
  .map(id => `${id} : ${parId[id].effets.join(", ")}`);
verifier("chaque caractéristique liste exactement les effets du Codex", ecarts.length === 0, ecarts.join(" | "));
verifier("aucun effet de classe (Ténèbres, Lumière, Vampirisme)",
         !r.some(x => x.effets.some(e => /Ténèbres|Lumière|Vampirisme/.test(e))));

// La fenêtre, à l'écran d'un iPad : elle tient (ou défile) et se montre.
const vue = await p.evaluate(() => {
  const m = document.getElementById("modale-creation-caracs");
  document.body.appendChild(m);
  m.style.position = "fixed";
  m.style.display = "block";
  const b = m.getBoundingClientRect();
  return { haut: Math.round(b.top), bas: Math.round(b.bottom), hauteurVue: window.innerHeight,
           defile: getComputedStyle(m).overflowY };
});
verifier("elle ne sort pas de l'écran (au pire, elle défile)", vue.haut >= 0 && vue.bas <= vue.hauteurVue && vue.defile === "auto",
         JSON.stringify(vue));
await p.locator("#modale-creation-caracs").screenshot({ path: "/tmp/claude-0/aide_caracs.png" });

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
