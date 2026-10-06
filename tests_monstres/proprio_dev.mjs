// CONFIER UN HÉROS À UN AUTRE JOUEUR DEPUIS L'ONGLET DEV DE SA FICHE.
//
// Nico : « dans le panneau dev de la fiche perso, fais un encart de sélection
// pour changer l'appartenance d'un personnage à un autre joueur. »
// L'appartenance, c'est ID_Joueur sur la fiche (Personnages). La liste vient
// de la collection Joueurs ; le joueur actuel y est présélectionné à
// l'ouverture de la fiche (afficherStatsCombat).
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
console.log("  CONFIER UN HÉROS À UN AUTRE JOUEUR (ONGLET DEV)");
console.log("=========================================================");

const r = await p.evaluate(async () => {
  const res = {};
  const onglet = document.getElementById("onglet-dev");
  res.encart = !!onglet.querySelector("select#dev-proprio-perso") && !!onglet.querySelector("#btn-dev-proprio");
  const heros = { idPersonnage: "PERSO_7", prenom: "Lyra", idJoueur: "J_NICO", race: "Humain", classe: "Pisteur", xp: 0, Etats_Alteres: [] };
  window.PERSOS_PARTIE = [{ ...heros }];
  window.PERSOS_JOUEURS_PARTIE = [{ ...heros }];
  try { window.afficherStatsCombat(heros); } catch (e) { res.erreurAffichage = String(e); }
  await new Promise(r => setTimeout(r, 100));
  const select = document.getElementById("dev-proprio-perso");
  res.options = [...select.options].map(o => o.value + ":" + o.textContent);
  res.choisi = select.value;
  document.getElementById("champ-id-personnage").value = "PERSO_7";
  document.getElementById("titre-nom-personnage").innerText = "Lyra";
  const confirmes = []; window.confirm = (m) => { confirmes.push(m); return true; };
  const alertes = []; window.alert = (m) => alertes.push(m);
  // Le même joueur : rien n'est écrit.
  window.__majs = [];
  await window.reattribuerPersoDev();
  res.memeJoueur = window.__majs.length === 0 && /déjà/.test(alertes[0] || "");
  // Confier à Alix.
  select.value = "J_ALIX";
  await window.reattribuerPersoDev();
  res.majs = JSON.parse(JSON.stringify(window.__majs));
  res.confirme = confirmes[0] || "";
  res.listes = window.PERSOS_PARTIE[0].idJoueur + " / " + window.PERSOS_JOUEURS_PARTIE[0].idJoueur;
  res.champProprio = document.getElementById("champ-id-joueur-perso").value;
  // Annulé à la confirmation : rien n'est écrit.
  window.confirm = () => false;
  select.value = "J_BRUNO";
  window.__majs = [];
  await window.reattribuerPersoDev();
  res.annule = window.__majs.length === 0;
  // Une écriture qui échoue : la sélection revient au propriétaire actuel.
  window.confirm = () => true;
  window.__echecMaj = true;
  select.value = "J_BRUNO";
  await window.reattribuerPersoDev();
  window.__echecMaj = false;
  res.apresEchec = { select: select.value, liste: window.PERSOS_PARTIE[0].idJoueur };
  // Sans fiche ouverte : refusé.
  document.getElementById("champ-id-personnage").value = "";
  window.__majs = [];
  await window.reattribuerPersoDev();
  res.sansFiche = window.__majs.length === 0;
  // Un héros d'un propriétaire inconnu de la liste (le MJ) : il reste affiché.
  window.afficherStatsCombat({ ...heros, idPersonnage: "PERSO_8", idJoueur: "MJ" });
  await new Promise(r => setTimeout(r, 100));
  res.mj = { valeur: select.value, options: [...select.options].map(o => o.textContent) };
  res.lectures = window.__lecturesJoueurs;
  return res;
});
verifier("l'onglet DEV a une liste « Joueur du héros » et un bouton « Confier »", r.encart === true);
verifier("la liste : les joueurs de la collection Joueurs, triés, sans les fiches vides",
         JSON.stringify(r.options) === JSON.stringify(["J_ALIX:Alix", "J_BRUNO:Bruno", "J_NICO:Nico"]), JSON.stringify(r.options));
verifier("à l'ouverture de la fiche, son joueur est présélectionné", r.choisi === "J_NICO" && !r.erreurAffichage, `${r.choisi} ${r.erreurAffichage || ""}`);
verifier("le même joueur : refusé, rien n'est écrit", r.memeJoueur === true);
verifier("« Confier » demande confirmation en nommant le héros et le joueur", /Lyra/.test(r.confirme) && /Alix/.test(r.confirme), r.confirme);
verifier("écrit ID_Joueur sur SA fiche, et rien d'autre",
         r.majs.length === 1 && r.majs[0].chemin === "Personnages/PERSO_7" && r.majs[0].data.ID_Joueur === "J_ALIX"
         && Object.keys(r.majs[0].data).length === 1, JSON.stringify(r.majs));
verifier("tout de suite en mémoire : les listes de la partie, le propriétaire de la fiche ouverte",
         r.listes === "J_ALIX / J_ALIX" && r.champProprio === "J_ALIX", `${r.listes} | ${r.champProprio}`);
verifier("annulé à la confirmation : rien n'est écrit", r.annule === true);
verifier("une écriture qui échoue : la liste revient au joueur actuel", r.apresEchec.select === "J_ALIX" && r.apresEchec.liste === "J_ALIX",
         JSON.stringify(r.apresEchec));
verifier("sans fiche ouverte : refusé", r.sansFiche === true);
verifier("un héros du MJ : « MJ » reste affiché et choisi", r.mj.valeur === "MJ" && r.mj.options[0] === "MJ", JSON.stringify(r.mj));
verifier("la collection Joueurs n'est lue qu'une fois", r.lectures === 1, String(r.lectures));

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
