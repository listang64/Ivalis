// LE COMPAGNON DU PISTEUR : LE NOM RP DE SON ATTAQUE, TROUVÉ PAR L'IA.
//
// Nico : « dans le descriptif de l'attaque, c'est marqué TECHNIQUE et
// technique inconnue de ce poste. Fais en sorte qu'une IA crée un nom RP à
// cette attaque quand on crée le compagnon. »
//   - nommerAttaqueCompagnon (app.js) demande le nom à Gemini (ici simulé) ;
//   - assurerNomAttaqueCompagnon l'écrit sur la fiche du maître
//     (Compagnon_Attaque), une seule fois ;
//   - il voyage : fiche → front → document du compagnon (Nom_Attaque) →
//     fiche de combat (nomAttaque), que lit la fenêtre de tour
//     (fenetre_tour.mjs).
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
// GEMINI, SIMULÉ : il répond par un appel de fonction, comme le vrai ; ce
// qu'il reçoit est gardé pour être relu.
let reponseGemini = "« Croc du chasseur. »";
const demandesGemini = [];
await p.route('**generativelanguage.googleapis.com/**', async r => {
  demandesGemini.push(JSON.parse(r.request().postData() || "{}"));
  if (reponseGemini === null) return r.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  r.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name: "nommerAttaque", args: { nom: reponseGemini } } }] } }] }) });
});
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

console.log("\n=========================================================");
console.log("  LE NOM RP DE L'ATTAQUE DU COMPAGNON");
console.log("=========================================================");

const SRC_APP = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8');
const debut = SRC_APP.indexOf("function frontVersPersoDoc(");
const SRC_DOC = SRC_APP.slice(debut, SRC_APP.indexOf("\n}\n", debut) + 3);

await p.evaluate(() => localStorage.setItem("ivalis_GEMINI_API_KEY", "CLE_TEST"));
const r = await p.evaluate(async (srcDoc) => {
  const res = {};
  const loup = { nom: "Fauve", description: "un grand loup gris aux yeux d'ambre" };
  res.nom = await window.nommerAttaqueCompagnon(loup);
  res.nettoyes = [window.nettoyerNomAttaque('"ruée des cornes!"'), window.nettoyerNomAttaque("   "),
                  window.nettoyerNomAttaque("Un nom beaucoup trop long pour tenir sur la plaque de la fenêtre de tour")];
  res.sansDescription = await window.nommerAttaqueCompagnon({ nom: "Rien", description: " " });
  // Écrit une fois sur la fiche du maître.
  window.__majs = [];
  const heros = { idPersonnage: "PERSO_P", compagnon: { ...loup } };
  res.assure = await window.assurerNomAttaqueCompagnon(heros);
  res.majs = JSON.parse(JSON.stringify(window.__majs));
  res.surLeHeros = heros.compagnon.attaque;
  window.__majs = [];
  res.deuxieme = await window.assurerNomAttaqueCompagnon(heros);
  res.majsDeuxieme = window.__majs.length;
  // Le voyage : fiche → front → document du compagnon.
  const front = window.persoDocVersFront("PERSO_P", { Prenom_Personnage: "Lyra", Classe: "Pisteur",
    Compagnon_Nom: "Fauve", Compagnon_Description: "loup", Compagnon_Attaque: "Croc du chasseur" });
  res.front = front.compagnon && front.compagnon.attaque;
  res.monstre = window.donneesCompagnon({ idPersonnage: "PERSO_P", compagnon: front.compagnon }).Nom_Attaque;
  const frontVersPersoDoc = new Function(srcDoc + "; return frontVersPersoDoc;")();
  try { res.doc = frontVersPersoDoc({ prenom: "Lyra", compagnon: front.compagnon }, "PERSO_P").Compagnon_Attaque; }
  catch (e) { res.doc = "erreur : " + e.message; }
  return res;
}, SRC_DOC);
verifier("Gemini nomme l'attaque, nettoyée (« Croc du chasseur »)", r.nom === "Croc du chasseur", JSON.stringify(r.nom));
const demande = demandesGemini[0] || {};
const texteDemande = JSON.stringify(demande);
verifier("il reçoit la description de la bête et son nom", /loup gris aux yeux d'ambre/.test(texteDemande) && /Fauve/.test(texteDemande));
verifier("il doit répondre par un appel de fonction (nommerAttaque)",
         (demande.toolConfig || {}).functionCallingConfig && demande.toolConfig.functionCallingConfig.mode === "ANY");
verifier("nettoyage : guillemets, ponctuation finale, majuscule, 40 signes",
         r.nettoyes[0] === "Ruée des cornes" && r.nettoyes[1] === "" && r.nettoyes[2].length <= 40 && !/\s$/.test(r.nettoyes[2]),
         JSON.stringify(r.nettoyes));
// Deux appels en tout : le nommage, puis celui de assurerNomAttaqueCompagnon —
// la bête sans description n'en a fait aucun.
verifier("sans description : pas d'appel, rien", r.sansDescription === "" && demandesGemini.length === 2
         && !demandesGemini.some(d => /Rien/.test(JSON.stringify(d))), String(demandesGemini.length));
verifier("écrit sur la fiche du maître : Compagnon_Attaque, et rien d'autre",
         r.assure === "Croc du chasseur" && r.majs.length === 1 && r.majs[0].chemin === "Personnages/PERSO_P"
         && JSON.stringify(r.majs[0].data) === '{"Compagnon_Attaque":"Croc du chasseur"}', JSON.stringify(r.majs));
verifier("déjà nommé : ni IA ni écriture", r.deuxieme === "Croc du chasseur" && r.majsDeuxieme === 0 && demandesGemini.length === 2,
         `${r.majsDeuxieme} écriture(s), ${demandesGemini.length} appel(s)`);
verifier("il voyage : fiche → front → document du compagnon (Nom_Attaque)",
         r.front === "Croc du chasseur" && r.monstre === "Croc du chasseur", `${r.front} / ${r.monstre}`);
verifier("…et la fiche réécrite le garde", r.doc === "Croc du chasseur", String(r.doc));

// L'IA muette : rien n'est écrit, on retentera.
reponseGemini = null;
const muet = await p.evaluate(async () => {
  window.__majs = [];
  const nom = await window.assurerNomAttaqueCompagnon({ idPersonnage: "PERSO_Q", compagnon: { nom: "Brume", description: "un faucon" } });
  return { nom, majs: window.__majs.length };
});
verifier("l'IA muette : rien n'est écrit (on retentera au prochain combat)", muet.nom === "" && muet.majs === 0, JSON.stringify(muet));

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
