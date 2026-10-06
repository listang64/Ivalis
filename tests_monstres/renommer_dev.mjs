// RENOMMER UN HÉROS DEPUIS L'ONGLET DEV DE SA FICHE.
//
// Nico : « dans l'onglet dev des fiches perso, fais-moi un champ pour changer
// les noms des personnages. »
// Le nom affiché partout est le prénom (Prenom_Personnage). Le champ se
// remplit à l'ouverture de la fiche (afficherStatsCombat) ; « Renommer »
// l'écrit sur la fiche du héros et le montre tout de suite (titre, listes en
// mémoire).
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
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
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
console.log("  RENOMMER UN HÉROS (ONGLET DEV)");
console.log("=========================================================");

const r = await p.evaluate(async () => {
  const res = {};
  const onglet = document.getElementById("onglet-dev");
  res.champ = !!onglet.querySelector("#dev-nom-perso") && !!onglet.querySelector("#btn-dev-renommer");
  // Le champ se remplit à l'ouverture de la fiche.
  const heros = { idPersonnage: "PERSO_7", prenom: "Lyra", race: "Humain", classe: "Pisteur", xp: 0, Etats_Alteres: [] };
  window.PERSOS_PARTIE = [{ ...heros }];
  window.PERSOS_JOUEURS_PARTIE = [{ ...heros }];
  try { window.afficherStatsCombat(heros); } catch (e) { res.erreurAffichage = String(e); }
  res.prerempli = document.getElementById("dev-nom-perso").value;
  // Renommer.
  document.getElementById("champ-id-personnage").value = "PERSO_7";
  document.getElementById("titre-nom-personnage").innerText = "Lyra";
  document.getElementById("dev-nom-perso").value = "  Lyra   la Rousse ";
  window.__majs = [];
  await window.renommerPersoDev();
  res.majs = JSON.parse(JSON.stringify(window.__majs));
  res.titre = document.getElementById("titre-nom-personnage").innerText;
  res.liste = window.PERSOS_PARTIE[0].prenom + " / " + window.PERSOS_JOUEURS_PARTIE[0].prenom;
  res.champApres = document.getElementById("dev-nom-perso").value;
  // Un nom vide : refusé, rien n'est écrit.
  const alertes = [];
  window.alert = (m) => alertes.push(m);
  document.getElementById("dev-nom-perso").value = "   ";
  window.__majs = [];
  await window.renommerPersoDev();
  res.videMajs = window.__majs.length; res.videAlerte = alertes.slice();
  // Sans fiche ouverte : refusé.
  document.getElementById("champ-id-personnage").value = "";
  document.getElementById("dev-nom-perso").value = "Bran";
  await window.renommerPersoDev();
  res.sansFiche = window.__majs.length === 0 && alertes.length === 2;
  // Une écriture qui échoue : le nom à l'écran ne change pas.
  document.getElementById("champ-id-personnage").value = "PERSO_7";
  window.__echecMaj = true;
  document.getElementById("dev-nom-perso").value = "Morgane";
  await window.renommerPersoDev();
  window.__echecMaj = false;
  res.apresEchec = document.getElementById("titre-nom-personnage").innerText;
  // La touche Entrée valide aussi.
  window.__majs = [];
  document.getElementById("dev-nom-perso").value = "Morgane";
  document.getElementById("dev-nom-perso").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await new Promise(r => setTimeout(r, 100));
  res.entree = JSON.parse(JSON.stringify(window.__majs));
  return res;
});
verifier("l'onglet DEV a un champ « Nom du héros » et un bouton « Renommer »", r.champ === true);
verifier("à l'ouverture de la fiche, le champ porte son nom", r.prenommer === undefined && r.prerempli === "Lyra", `${r.prerempli} ${r.erreurAffichage || ""}`);
verifier("« Renommer » écrit Prenom_Personnage sur SA fiche (espaces nettoyés)",
         r.majs.length === 1 && r.majs[0].chemin === "Personnages/PERSO_7" && r.majs[0].data.Prenom_Personnage === "Lyra la Rousse"
         && Object.keys(r.majs[0].data).length === 1, JSON.stringify(r.majs));
verifier("tout de suite à l'écran : le titre de la fiche, les listes en mémoire", r.titre === "Lyra la Rousse"
         && r.liste === "Lyra la Rousse / Lyra la Rousse" && r.champApres === "Lyra la Rousse", `${r.titre} | ${r.liste}`);
verifier("un nom vide : refusé, rien n'est écrit", r.videMajs === 0 && /nom/.test(r.videAlerte[0] || ""), JSON.stringify(r.videAlerte));
verifier("sans fiche ouverte : refusé", r.sansFiche === true);
verifier("une écriture qui échoue : le nom affiché ne change pas", r.apresEchec === "Lyra la Rousse", r.apresEchec);
verifier("la touche Entrée renomme aussi", r.entree.length === 1 && r.entree[0].data.Prenom_Personnage === "Morgane", JSON.stringify(r.entree));

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
