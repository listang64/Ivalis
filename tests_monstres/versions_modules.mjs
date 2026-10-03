// LE MÊME MODULE, À LA MÊME VERSION, POUR TOUT LE MONDE.
//
// Signalé en partie : « la compétence de classe Assaut mortel n'a rien fait du
// tout », « Soin d'urgence non plus ». La trace le montrait : la technique
// était acceptée, notée comme jouée… et rien d'autre (2 étapes). Le cerveau
// tournait sur un moteur ANCIEN. index.html chargeait regime_cerveau.js?v=33,
// mais celui-ci importait './cerveau_combat.js' — sans numéro de version :
// une adresse que le navigateur gardait en cache après un déploiement. La page
// se rechargeait toute seule (mise_a_jour.js) avec l'interface neuve et le
// moteur d'avant.
//
// La carte des imports (index.html) renvoie chaque import interne vers la
// même adresse versionnée que sa balise <script>. Ce banc vérifie :
//   - que chaque import interne d'un module y figure ;
//   - que sa version est celle de la balise ;
//   - que la carte précède tout module ;
//   - dans la vraie page : aucun module du moteur demandé sans ?v=, aucun
//     chargé deux fois.
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

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

const html = fs.readFileSync(`${RACINE}/index.html`, 'utf-8');
const carteBrute = (html.match(/<script type="importmap">([\s\S]*?)<\/script>/) || [])[1];
let carte = {};
try { carte = JSON.parse(carteBrute).imports || {}; } catch (e) { carte = {}; }

console.log("\n=========================================================");
console.log("  LA CARTE DES IMPORTS");
console.log("=========================================================");

console.log("\n1. LA CARTE, DANS LE TEXTE");
{
    verifier("index.html porte une carte des imports lisible", Object.keys(carte).length > 0);
    const posCarte = html.indexOf('<script type="importmap">');
    const posModule = html.search(/^\s*<script type="module"/m);
    verifier("elle précède le premier module", posCarte > 0 && posCarte < posModule);

    // Tous les imports internes sans version, dans tous les fichiers du jeu.
    const fichiers = fs.readdirSync(RACINE).filter(f => f.endsWith('.js'));
    const imports = new Set();
    fichiers.forEach(f => {
        const s = fs.readFileSync(`${RACINE}/${f}`, 'utf-8');
        for (const m of s.matchAll(/from\s+['"](\.\/[^'"?]+\.js)['"]/g)) imports.add(m[1]);
    });
    const manquants = [...imports].filter(i => !carte[i]);
    verifier("chaque import interne sans version est dans la carte", manquants.length === 0, manquants.join(", ") || `${imports.size} imports`);

    const ecarts = [];
    Object.entries(carte).forEach(([cle, val]) => {
        const fichier = cle.replace("./", "");
        const balise = html.match(new RegExp(`<script[^>]*src="${fichier.replace(/\./g, "\\.")}\\?v=(\\d+)"`));
        const vCarte = (val.match(/\?v=(\d+)$/) || [])[1];
        if (!vCarte) ecarts.push(`${cle} sans ?v=`);
        else if (balise && balise[1] !== vCarte) ecarts.push(`${fichier} : balise v${balise[1]}, carte v${vCarte}`);
        if (!fs.existsSync(`${RACINE}/${fichier}`)) ecarts.push(`${fichier} introuvable`);
    });
    verifier("chaque entrée a la version de sa balise <script>", ecarts.length === 0, ecarts.join(" | "));
}

console.log("\n2. DANS LA VRAIE PAGE");
{
    const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
    const b = await chromium.launch();
    const p = await b.newPage();
    const demandes = [];
    await p.route('**', r => {
        const url = r.request().url();
        if (url.startsWith(base)) { demandes.push(url.slice(base.length)); return r.continue(); }
        if (url.includes('firebase-app.js')) return r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP });
        if (url.includes('firebase-firestore.js')) return r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE });
        return r.abort();
    });
    await p.goto(base + '/index.html');
    await p.waitForTimeout(2500);
    const moteur = ["combat_etat.js", "moteur_pur.js", "mouvement_pur.js", "ia_pure.js", "cerveau_combat.js",
                    "spectateur_combat.js", "depot_firestore.js", "pont_combat.js", "playlist.js"];
    const sansVersion = demandes.filter(d => moteur.some(m => d === "/" + m));
    verifier("aucun module du moteur n'est demandé sans ?v=", sansVersion.length === 0, sansVersion.join(", "));
    const doubles = moteur.filter(m => demandes.filter(d => d.split("?")[0] === "/" + m).length > 1);
    verifier("chacun n'est chargé qu'une fois (un seul exemplaire)", doubles.length === 0, doubles.join(", "));
    const cerveau = demandes.find(d => d.startsWith("/cerveau_combat.js"));
    verifier("le cerveau est celui de la version annoncée", !!carte["./cerveau_combat.js"] && cerveau === "/" + carte["./cerveau_combat.js"].replace("./", ""), cerveau);
    await b.close();
}
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
