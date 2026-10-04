// LE BOUTON PROVISOIRE « AJOUTER LES EFFETS DE CLASSE ».
//
// Nico : « les effets de combat de classe comme Lumière et Vampirisme ne sont
// pas dans ma liste d'effets de combat dans Paramètres : mets-les, ou crée-moi
// un bouton provisoire pour les intégrer sans toucher au reste. »
// Ils ne vivaient qu'en copie locale (MIGRATION_EFFETS). Le bouton crée dans
// Combat_Effets ceux qui y MANQUENT — jamais une écriture sur un effet déjà
// présent (retouché à la main ou non), jamais sur un autre effet.
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
  export const getDoc = async (ref) => { (window.__lus = window.__lus || []).push(ref.chemin); const d = (window.__docs || {})[ref.chemin]; return { exists: () => !!d, data: () => d || {} }; };
  export const getDocs = async (q) => { const col = (q && q.col) || (q && q.a && q.a[0] && q.a[0].col);
    const docs = Object.entries(window.__docs || {}).filter(([k]) => k.startsWith(col + "/")).map(([k, v]) => ({ id: k.split("/")[1], data: () => v }));
    return { forEach: (f) => docs.forEach(f), docs, empty: docs.length === 0 }; };
  export const setDoc = async (ref, data) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data }); (window.__docs = window.__docs || {})[ref.chemin] = data; };
  export const updateDoc = async (ref, data) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data, update: true }); };
  export const deleteDoc = async (ref) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, supprime: true }); };
  export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({ a, col: a[0] && a[0].col });
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
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
const alertes = [];
p.on('dialog', async d => { alertes.push(d.message()); await d.accept(); });
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

console.log("\n1. LE BOUTON EST DANS LA GESTION DES EFFETS");
{
  const r = await p.evaluate(() => {
    const btn = document.getElementById("btn-installer-effets-classe");
    return { existe: !!btn, dansGestion: !!(btn && btn.closest("#etape-gestion-effets")), texte: btn && btn.textContent.trim() };
  });
  verifier("le bouton « Ajouter les effets de classe » est là", r.existe && r.dansGestion, JSON.stringify(r));
}

console.log("\n2. UN CLIC : SEULS LES EFFETS DE CLASSE QUI MANQUENT SONT CRÉÉS");
{
  const r = await p.evaluate(async () => {
    // La base : Ténèbres déjà là, retouché à la main ; un effet ordinaire.
    window.__docs = {
      "Combat_Effets/EFF_TENEBRES": { Nom: "Ténèbres", Valeur: 4, Cout_PT: "3", Notes: "Nico l'a rééquilibré" },
      "Combat_Effets/EFF_ATTAQUE_LEGERE": { Nom: "Attaque légère", Valeur: 2 }
    };
    window.__ecrits = [];
    document.getElementById("btn-installer-effets-classe").click();
    await new Promise(r => setTimeout(r, 400));
    return { ecrits: window.__ecrits, docs: window.__docs, cache: Object.keys(window.EFFETS_BDD_CACHE || {}).sort(),
             attendus: window.MIGRATION_EFFETS.map(m => [m.id, m.champs]) };
  });
  const chemins = r.ecrits.map(e => e.chemin).sort();
  verifier("Lumière et Vampirisme créés, rien d'autre", JSON.stringify(chemins) === '["Combat_Effets/EFF_LUMIERE","Combat_Effets/EFF_VAMPIRISME"]',
           JSON.stringify(chemins));
  const lum = r.attendus.find(a => a[0] === "EFF_LUMIERE")[1], vam = r.attendus.find(a => a[0] === "EFF_VAMPIRISME")[1];
  verifier("avec exactement les champs du jeu", JSON.stringify(r.docs["Combat_Effets/EFF_LUMIERE"]) === JSON.stringify(lum)
           && JSON.stringify(r.docs["Combat_Effets/EFF_VAMPIRISME"]) === JSON.stringify(vam));
  verifier("Ténèbres, déjà là et retouché, n'est pas touché", r.docs["Combat_Effets/EFF_TENEBRES"].Notes === "Nico l'a rééquilibré"
           && !r.ecrits.some(e => /TENEBRES|ATTAQUE/.test(e.chemin)));
  verifier("aucune mise à jour ni suppression", !r.ecrits.some(e => e.update || e.supprime));
  verifier("la Forge les voit aussitôt (cache rechargé)", r.cache.includes("EFF_LUMIERE") && r.cache.includes("EFF_VAMPIRISME"));
  verifier("le message dit ce qui a été ajouté et ce qui était déjà là",
           alertes.some(a => /Ajouté.*Lumière.*Vampirisme/s.test(a) && /Déjà dans la liste.*Ténèbres/s.test(a)), JSON.stringify(alertes));
}

console.log("\n3. UN SECOND CLIC NE FAIT PLUS RIEN");
{
  const r = await p.evaluate(async () => {
    window.__ecrits = [];
    document.getElementById("btn-installer-effets-classe").click();
    await new Promise(r => setTimeout(r, 400));
    return window.__ecrits.length;
  });
  verifier("aucune écriture", r === 0, `${r}`);
  verifier("« Rien à ajouter. »", /Rien à ajouter/.test(alertes[alertes.length - 1] || ""));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
