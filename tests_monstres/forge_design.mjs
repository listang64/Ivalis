// LA FORGE AUX COULEURS DU JEU, SANS ESPACES BIZARRES.
//
// Nico : « redesign la Forge, qu'elle soit plus jolie et qu'elle suive le même
// design que le jeu ; profites-en pour revoir les espaces bizarres sur certains
// effets. » Les descriptions des effets héritaient le centrage de
// .modale-parchemin-jeu : « 3 dégâts magique » flottait au milieu de la ligne.
// Ce banc vérifie, sur la vraie page : le texte des effets aligné à gauche, plus
// un seul bleu « appli » (#2563eb, #3b82f6) dans la Forge ni le grimoire, les
// médaillons, le parchemin, l'arme et le bouton Valider aux couleurs du jeu.
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

const r = await p.evaluate(async (EFFETS) => {
  window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
  window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
  window.__docs = { "Personnages/P1": { Classe: "Chasseur de mages", XP: 2500, Race: "Humain" }, "Caracteristiques/P1": { Intelligence: 18, Sagesse: 16 } };
  document.getElementById("champ-id-personnage").value = "P1";
  window.OUVERTURE_FORGE_EN_COURS = false;
  await window.ouvrirCreationCompetence();
  window.forgeState.armePrincipale = "Magie";
  window.ajouterComposantPrincipal("EFF_ATTAQUE_MAGIQUE");
    window.choisirElementForge("Feu"); // une Attaque Magique a toujours un élément (elements_magiques.mjs)
  window.forgeState.actions[0].mods = { EFF_DISTANCE: 1 };
  document.getElementById("forge-nom").value = "Rayon";
  window.rafraichirForge();
  window.ouvrirMenuAjoutForge();
  const forge = document.getElementById("modale-creation-competence");
  const grimoire = document.getElementById("modale-menu-ajout");
  const html = forge.outerHTML + grimoire.outerHTML;
  const cs = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e) : null; };
  const desc = document.querySelector("#forge-contenu-carte .forge-action .forge-desc");
  const descMod = document.querySelector("#forge-contenu-carte .forge-sous-effet .forge-desc");
  const nom = document.querySelector("#forge-contenu-carte .forge-action .forge-nom-effet");
  return {
    bleus: (html.match(/#2563eb|#3b82f6|37, 99, 235|59, 130, 246/gi) || []).length,
    alignDesc: desc && getComputedStyle(desc).textAlign, alignMod: descMod && getComputedStyle(descMod).textAlign,
    // La description commence là où commence le nom : plus de décalage.
    ecartDesc: desc && nom ? Math.round(desc.getBoundingClientRect().left - nom.getBoundingClientRect().left) : null,
    texteDesc: desc && desc.textContent.trim(),
    fondForge: cs("#modale-creation-competence").backgroundColor,
    bandeau: !!document.querySelector("#modale-creation-competence .forge-bandeau .forge-medaillon-fatigue #forge-fatigue-val"),
    parchemin: cs("#modale-creation-competence .forge-parchemin") && cs("#modale-creation-competence .forge-parchemin").borderTopColor,
    arme: cs("#forge-weapon-tag-container .forge-arme") && cs("#forge-weapon-tag-container .forge-arme").backgroundImage,
    valider: cs("#btn-valider-forge").backgroundImage, validerActif: !document.getElementById("btn-valider-forge").disabled,
    grimoireLignes: grimoire.querySelectorAll(".forge-grimoire-ligne").length,
    grimoireAlign: cs("#forge-menu-caracs .forge-grimoire-ligne") && cs("#forge-menu-caracs .forge-grimoire-ligne").textAlign
  };
}, EFFETS_PAR_ID);

console.log("1. LA FORGE EST HABILLÉE COMME LE JEU");
verifier("plus un seul bleu « appli » dans la Forge ni le grimoire", r.bleus === 0, `${r.bleus}`);
verifier("fond parchemin (#e8d5a5)", r.fondForge === "rgb(232, 213, 165)", r.fondForge);
verifier("bandeau à médaillons (fatigue)", r.bandeau);
verifier("parchemin bordé d'or", r.parchemin === "rgb(168, 132, 31)", r.parchemin);
verifier("l'arme : un sceau de cuir (dégradé)", /gradient/.test(r.arme || ""), r.arme);
verifier("Valider : vert, comme les validations du jeu", /gradient/.test(r.valider || "") && r.validerActif, r.valider);

console.log("\n2. PLUS D'ESPACES BIZARRES");
verifier("la description d'un effet est alignée à gauche", r.alignDesc === "left" && r.alignMod === "left", `${r.alignDesc} / ${r.alignMod}`);
verifier("…et commence sous son nom (aucun décalage)", r.ecartDesc === 0, `${r.ecartDesc}px`);
verifier("le texte est bien celui de l'effet (3 dégâts magique)", /^3 dégâts magique/.test(r.texteDesc || ""), r.texteDesc);
verifier("le grimoire, à gauche lui aussi, a ses lignes", r.grimoireLignes > 5 && r.grimoireAlign === "left", `${r.grimoireLignes} ${r.grimoireAlign}`);

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
