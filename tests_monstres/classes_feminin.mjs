// LES NOMS DE CLASSE AU FÉMININ.
//
// Nico : « J'aimerais qu'en fonction du sexe choisi pour la race, les noms des
// classes s'adaptent pour ceux qui ont un féminin. Genre pisteur > pisteuse ;
// sorcier > sorcière ; etc. »
// C'est de l'affichage : la fiche garde le nom de la classe (« Sorcier »), et
// les règles le lisent ainsi. Puis : « juste assassin utilise-le pour les deux
// sexes. » Et le Mage du chaos et l'Élémentariste : « Arrive bientôt » sur
// l'image, l'image moins opaque.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const w = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/experience.js', 'utf-8'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);

console.log("\n1. LA RÈGLE");
{
    const f = (n) => w.nomClasseGenre(n, "Femelle");
    verifier("Pisteuse, Sorcière, Protectrice, Chasseuse de mages, Profanatrice, Géomancienne",
             f("Pisteur") === "Pisteuse" && f("Sorcier") === "Sorcière" && f("Protecteur") === "Protectrice"
             && f("Chasseur de mages") === "Chasseuse de mages"
             && f("Profanateur") === "Profanatrice" && f("Géomancien") === "Géomancienne");
    verifier("inchangées : Assassin, Sentinelle, Oracle, Vampire, Mage du chaos, Médicus, Élémentariste",
             ["Assassin", "Sentinelle", "Oracle", "Vampire", "Mage du chaos", "Médicus", "Élémentariste"].every(n => f(n) === n));
    verifier("un héros (Male) garde le masculin", w.nomClasseGenre("Sorcier", "Male") === "Sorcier" && w.nomClasseGenre("Pisteur", "") === "Pisteur");
    verifier("les anciens noms suivent : Nécromancienne → Sorcière, Hoplite → Protectrice",
             f("Nécromancien") === "Sorcière" && f("Hoplite") === "Protectrice" && w.nomClasseGenre("Hoplite", "Male") === "Protecteur");
    verifier("sans accents ni majuscules : « sorcier », « CHASSEUR DE MAGES »",
             f("sorcier") === "Sorcière" && f("CHASSEUR DE MAGES") === "Chasseuse de mages");
    verifier("les règles ne bougent pas : une Sorcière est de la classe Sorcier",
             w.estDeLaClasse({ classe: "Sorcier", genre: "Femelle" }, "Sorcier")
             && w.atoutRace({ classe: "Sorcier", genre: "Femelle", race: "Humain", xp: 0 }).porteeSorts === 1);
    const d = w.detailBonusRaceClasse({ race: "Humain", classe: "Pisteur", genre: "Femelle", xp: 0 });
    verifier("l'encart des statistiques dit « Pisteuse »", d.classe.nom === "Pisteuse", d.classe.nom);
}

// =========================================================================
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
console.log("\n2. LE CHOIX DE CLASSE D'UNE HÉROÏNE");
{
  const r = await p.evaluate(async () => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    window.RACE_SELECTIONNEE_TEMP = "Humain";
    window.GENRE_SELECTIONNE_TEMP = "Femelle";
    await window.ouvrirChoixClasse();
    const noms = [...document.querySelectorAll("#grille-classes .carte-classe-nom")].map(x => x.textContent.trim());
    window.ouvrirFicheClasse("CLASSE_SORCIER");
    const titre = document.getElementById("titre-fiche-classe").textContent;
    window.ouvrirFicheClasse("CLASSE_SORCIER");
    window.ouvrirEtapeIdentite = () => {};
    window.validerClasse();
    const retenue = document.getElementById("champ-classe").value;
    window.GENRE_SELECTIONNE_TEMP = "Male";
    await window.ouvrirChoixClasse();
    const nomsH = [...document.querySelectorAll("#grille-classes .carte-classe-nom")].map(x => x.textContent.trim());
    window.GENRE_SELECTIONNE_TEMP = "Femelle";
    await window.ouvrirChoixClasse();
    // Les classes qui arrivent bientôt.
    const carte = (id) => document.querySelector(`.carte-classe[data-classe="${id}"]`);
    const bientot = ["CLASSE_MAGE_DU_CHAOS", "CLASSE_ELEMENTARISTE"].map(id => ({
      texte: (carte(id).querySelector(".carte-classe-bientot-texte") || {}).textContent || "",
      opacite: parseFloat(getComputedStyle(carte(id).querySelector(".carte-classe-image")).opacity) }));
    const autre = { texte: !!carte("CLASSE_SORCIER").querySelector(".carte-classe-bientot-texte"),
                    opacite: parseFloat(getComputedStyle(carte("CLASSE_SORCIER").querySelector(".carte-classe-image")).opacity) };
    window.afficherGrilleClasses();
    window.ouvrirFicheClasse("CLASSE_ELEMENTARISTE");
    const fermee = getComputedStyle(document.getElementById("vue-fiche-classe")).display === "none";
    const message = (document.getElementById("message-classe-interdite") || {}).textContent || "";
    return { noms, titre, retenue, nomsH, bientot, autre, fermee, message };
  });
  await p.evaluate(async () => { await window.ouvrirChoixClasse(); document.getElementById("vue-grille-classes").scrollTop = 9999; });
  await p.screenshot({ path: "/tmp/claude-0/classes_feminin.png" });
  verifier("la grille : Pisteuse, Assassin, Chasseuse de mages, Profanatrice, Géomancienne, Protectrice, Sorcière",
           ["Pisteuse", "Assassin", "Chasseuse de mages", "Profanatrice", "Géomancienne", "Protectrice", "Sorcière"].every(n => r.noms.includes(n))
           && !r.noms.includes("Sorcier") && r.noms.includes("Sentinelle") && r.noms.length === 13, r.noms.join(", "));
  verifier("la fiche de classe s'intitule « Sorcière »", r.titre === "Sorcière", r.titre);
  verifier("mais la fiche du personnage retient « Sorcier »", r.retenue === "Sorcier", r.retenue);
  verifier("Mage du chaos et Élémentariste : « Arrive bientôt », image à 35 %",
           r.bientot.every(b => b.texte === "Arrive bientôt" && Math.abs(b.opacite - 0.35) < 0.01), JSON.stringify(r.bientot));
  verifier("les autres : ni texte ni voile", !r.autre.texte && r.autre.opacite === 1);
  verifier("elles ne s'ouvrent pas : un message le dit", r.fermee && /arrive bientôt/.test(r.message), r.message);
  verifier("un héros : la grille au masculin", r.nomsH.includes("Sorcier") && r.nomsH.includes("Pisteur") && !r.nomsH.includes("Sorcière"));
}

console.log("\n3. LA FICHE D'UNE HÉROÏNE");
{
  const r = await p.evaluate(() => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
    window.afficherStatsCombat({ prenom: "Ysolde", race: "Humain", classe: "Sorcier", genre: "Femelle", XP: 0, PV_Max: 50, Fatigue_Max: 100 });
    const a = { classe: document.getElementById("stat-classe").innerText,
                encart: document.querySelector('#encart-bonus-race-classe [data-bloc="classe"] .bonus-titre').textContent };
    window.afficherStatsCombat({ prenom: "Varn", race: "Humain", classe: "Sorcier", genre: "Male", XP: 0, PV_Max: 50, Fatigue_Max: 100 });
    a.classeH = document.getElementById("stat-classe").innerText;
    window.afficherStatsCombat({ Prenom_Personnage: "Jade", Race: "Humain", Classe: "Nécromancien", Genre: "Femelle", PV_Max: 30 });
    a.ancienne = document.getElementById("stat-classe").innerText;
    return a;
  });
  verifier("en tête des statistiques : « Sorcière »", r.classe === "Sorcière", r.classe);
  verifier("l'encart : « 📜 Classe : Sorcière »", /Classe : Sorcière/.test(r.encart), r.encart);
  verifier("un héros : « Sorcier »", r.classeH === "Sorcier", r.classeH);
  verifier("une fiche ancienne (« Nécromancien », champ Genre) : « Sorcière »", r.ancienne === "Sorcière", r.ancienne);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
