// LES CORRECTIONS DE LA v254.
//
//   1. « Quand le bouton DEV est activé, fais un petit bouton coche à côté du
//      bouton œil en combat. Quand coché, plus besoin d'appuyer sur l'écran
//      pour voir les tours se jouer : dès que c'est prêt, ça lance les
//      animations. »
//   2. « Rajoute dans le panneau DEV la possibilité de retirer les blessures
//      d'un personnage. »
import fs from 'fs'; import http from 'http'; import path from 'path';
import { spawnSync } from 'child_process';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(74)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

console.log("\n=========================================================");
console.log("  LES CORRECTIONS DE LA v254");
console.log("=========================================================");

const RACINE = '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") }); export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {};
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref && ref.chemin, data: JSON.parse(JSON.stringify(data)) }); };
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a});
  export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: { 'Access-Control-Allow-Origin': '*' },
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="95" fill="#2a6ad8"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

console.log("\n1. LA CASE, À CÔTÉ DE L'ŒIL, EN MODE DÉVELOPPEUR SEULEMENT");
{
  const r = await p.evaluate(async () => {
    const ou = (f, d) => { try { return f(); } catch (e) { return d; } };
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
    document.getElementById("fenetre-combat").style.display = "block";
    try { localStorage.removeItem("ivalis_LECTURE_AUTO"); } catch (e) {}
    window.basculerDevMode(false);
    const bouton = () => document.getElementById("btn-hud-lecture-auto");
    const vue = () => !!bouton() && getComputedStyle(bouton()).display !== "none";
    const sansDev = vue();
    window.basculerDevMode(true);
    const avecDev = vue();
    const caseAuto = document.getElementById("case-lecture-auto");
    const oeil = document.getElementById("btn-hud-reveler-terrain").getBoundingClientRect();
    const ici = bouton() ? bouton().getBoundingClientRect() : null;
    return { sansDev, avecDev, decochee: !!caseAuto && caseAuto.checked === false,
             aGauche: !!ici && ici.right <= oeil.left + 1 && oeil.left - ici.right < 30,
             memeHauteur: !!ici && Math.abs((ici.top + ici.bottom) / 2 - (oeil.top + oeil.bottom) / 2) < 4,
             fonctions: ou(() => typeof window.lancerLectureAutoDev, "absente") };
  });
  verifier("hors mode DEV : pas de case", r.sansDev === false);
  verifier("en mode DEV : la case apparaît, décochée", r.avecDev === true && r.decochee, JSON.stringify(r));
  verifier("juste à gauche de l'œil, à sa hauteur", r.aGauche && r.memeHauteur, JSON.stringify(r));
}

console.log("\n2. COCHÉE : LE TOUR S'OUVRE SANS TOUCHER L'ÉCRAN");
{
  const r = await p.evaluate(async () => {
    const attendre = (ms) => new Promise(res => setTimeout(res, ms));
    const ou = (f, d) => { try { return f(); } catch (e) { return d; } };
    const vraiRegime = window.regimeDemande, vraiSon = window.jouerSonClic;
    window.__ok = 0; window.__sons = 0;
    window.regimeDemande = { actif: () => true, ok: () => { window.__ok++; window.EVENEMENT_ATTENDU = null; return true; } };
    window.jouerSonClic = () => { window.__sons++; };
    const tour = (n) => ({ acteur: "M1", tour: 1, n, idCarte: null, type: "tour" });
    const out = {};
    // Décochée : le tour attend le toucher, comme toujours.
    window.EVENEMENT_ATTENDU = tour(1);
    out.decochee = ou(() => window.lancerLectureAutoDev(), "absente");
    await attendre(50);
    out.attendToujours = !!window.EVENEMENT_ATTENDU && window.__ok === 0;
    // On coche devant ce tour qui attend : il part tout de suite.
    const caseAuto = document.getElementById("case-lecture-auto");
    if (caseAuto) { caseAuto.checked = true; caseAuto.dispatchEvent(new Event("change")); }
    await attendre(50);
    out.cocheePart = { ok: window.__ok, attendu: !!window.EVENEMENT_ATTENDU, sons: window.__sons };
    out.retenue = ou(() => localStorage.getItem("ivalis_LECTURE_AUTO"), null);
    out.allume = !!document.querySelector("#btn-hud-lecture-auto.active");
    // Le tour suivant s'annonce : il part seul.
    window.EVENEMENT_ATTENDU = tour(2);
    out.suivant = ou(() => window.lancerLectureAutoDev(), false);
    await attendre(50);
    out.suivantParti = window.__ok === 2 && !window.EVENEMENT_ATTENDU;
    // Le toucher, lui, marche toujours (et fait son petit bruit).
    window.EVENEMENT_ATTENDU = tour(3);
    window.jouerSequenceTour(new MouseEvent("click"));
    out.toucher = { ok: window.__ok, sons: window.__sons };
    // Le mode DEV coupé : la case disparaît, et le tour attend de nouveau le toucher.
    window.basculerDevMode(false);
    window.EVENEMENT_ATTENDU = tour(4);
    out.sansDev = ou(() => window.lancerLectureAutoDev(), "absente");
    await attendre(50);
    out.sansDevAttend = !!window.EVENEMENT_ATTENDU && window.__ok === 3;
    out.caseCachee = getComputedStyle(document.getElementById("btn-hud-lecture-auto") || document.body).display === "none";
    window.EVENEMENT_ATTENDU = null;
    window.regimeDemande = vraiRegime; window.jouerSonClic = vraiSon;
    return out;
  });
  verifier("décochée : le tour attend le toucher", r.decochee === false && r.attendToujours, JSON.stringify(r));
  verifier("cochée devant un tour qui attend : il part tout de suite, sans bruit de clic",
           r.cocheePart.ok === 1 && !r.cocheePart.attendu && r.cocheePart.sons === 0, JSON.stringify(r.cocheePart));
  verifier("le choix reste sur ce poste, et la case s'allume", r.retenue === "on" && r.allume, `${r.retenue} ${r.allume}`);
  verifier("le tour suivant part seul", r.suivant === true && r.suivantParti);
  verifier("toucher l'écran marche toujours (avec son clic)", r.toucher.ok === 3 && r.toucher.sons === 1, JSON.stringify(r.toucher));
  verifier("mode DEV coupé : la case disparaît et le tour attend de nouveau", r.sansDev === false && r.sansDevAttend && r.caseCachee,
           JSON.stringify({ sansDev: r.sansDev, attend: r.sansDevAttend, cachee: r.caseCachee }));
  const src = fs.readFileSync(RACINE + '/regime_cerveau.js', 'utf-8');
  const fenetre = src.slice(src.indexOf("surFenetre: (entree) => {"), src.indexOf("surFenetre: (entree) => {") + 900);
  verifier("le régime du cerveau la déclenche à chaque tour qui attend (surFenetre)", /lancerLectureAutoDev\(\)/.test(fenetre));
}
console.log("\n3. LE PANNEAU DEV : RETIRER LES BLESSURES D'UN PERSONNAGE");
{
  const r = await p.evaluate(async () => {
    const ou = (f, d) => { try { return f(); } catch (e) { return d; } };
    window.confirm = () => true;
    const alertes = []; window.alert = (t) => alertes.push(t);
    const perso = { idPersonnage: "P5", prenom: "Morvak", nom: "Cendrelame", race: "Gob", classe: "Sorcier", xp: 0, PV_Max: 50,
      Etats_Alteres: [], talents: {}, statut: "Mort", mortDefinitive: true,
      blessures: [{ uid: "t", id: "BLE_TYMPAN_CREVE", definitif: true }, { uid: "g", id: "BLE_GENOU_AFFAIBLI", combats: 2 },
                  { uid: "d", id: "BLE_DECHIRURE_MUSCULAIRE", soins: true }] };
    window.PERSOS_PARTIE = [perso]; window.PERSOS_JOUEURS_PARTIE = [perso];
    window.actualiserBlessuresApercu(perso);
    const lire = () => [...document.querySelectorAll("#dev-blessures-liste .dev-blessure-ligne")].map(l =>
      ((l.querySelector(".dev-blessure-nom") || l.querySelector("span") || {}).textContent || "") + (l.querySelector(".btn-dev-soigner") ? " +Soigner" : "") + (l.querySelector(".btn-dev-retirer") ? " +Retirer" : ""));
    const tout = () => (document.querySelector("#dev-blessures-liste .btn-dev-retirer-tout") || {}).textContent || "";
    const out = { avant: lire(), tout: tout() };
    window.__majs = [];
    const bouton = [...document.querySelectorAll("#dev-blessures-liste .dev-blessure-ligne")].find(l => l.dataset.uid === "t");
    const btn = bouton && bouton.querySelector(".btn-dev-retirer");
    if (btn) btn.click();
    await new Promise(res => setTimeout(res, 100));
    out.un = { maj: (window.__majs || [])[0], lignes: lire() };
    window.__majs = [];
    await ou(() => window.retirerToutesBlessuresDev(), null);
    out.tous = { maj: (window.__majs || [])[0], lignes: lire(), vide: (document.querySelector("#dev-blessures-liste .dev-blessures-vide") || {}).textContent,
                 mort: perso.mortDefinitive, statut: perso.statut, encart: document.querySelectorAll("#encart-blessures .blessure-ligne").length };
    window.BLESSURES_FICHE = null;
    out.sansFiche = await ou(() => window.retirerToutesBlessuresDev(), "absente");
    out.alertes = alertes;
    return out;
  });
  verifier("le panneau DEV liste TOUTES les blessures, chacune « Retirer »",
           r.avant.length === 3 && r.avant.every(x => x.endsWith("+Retirer")), JSON.stringify(r.avant));
  verifier("« Soigner » reste pour celle qui attend les soins en ville",
           r.avant.filter(x => x.includes("+Soigner")).join() === "Déchirure musculaire +Soigner +Retirer", JSON.stringify(r.avant));
  verifier("et un bouton pour tout retirer (et relever le héros mort)", /Tout retirer et le relever/.test(r.tout), r.tout);
  verifier("Retirer le Tympan crevé (définitif) : il part de la fiche, la liste suit",
           !!r.un.maj && r.un.maj.chemin === "Personnages/P5" && r.un.maj.data.Blessures.map(x => x.uid).join() === "g,d" && r.un.lignes.length === 2,
           JSON.stringify(r.un));
  verifier("Tout retirer : plus aucune blessure, et le héros mort se relève",
           !!r.tous.maj && r.tous.maj.data.Blessures.length === 0 && r.tous.maj.data.Mort_Definitive === false && r.tous.maj.data.Statut === "Vivant",
           JSON.stringify(r.tous.maj));
  verifier("…tout de suite à l'écran (fiche relevée, panneau et encart vides)",
           r.tous.mort === false && r.tous.statut === "Vivant" && r.tous.lignes.length === 0 && /Aucune blessure/.test(r.tous.vide || "") && r.tous.encart === 0,
           JSON.stringify(r.tous));
  verifier("sans fiche ouverte : rien n'est écrit, on le dit", r.sansFiche === false && r.alertes.length === 1, JSON.stringify(r.alertes));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();

console.log("\n4. EN VRAI : UN COMBAT COMPLET, ADRIEN NE TOUCHE JAMAIS L'ÉCRAN");
{
  const r = spawnSync(process.execPath, ['combat_complet.mjs'], { cwd: RACINE + '/tests_monstres',
    env: { ...process.env, LECTURE_AUTO_DEV: "Adrien" }, encoding: 'utf-8', timeout: 270000 });
  const sortie = (r.stdout || "") + (r.stderr || "");
  const lignes = sortie.split("\n").filter(l => /Adrien : (la case|chaque tour s'est ouvert|son écran)/.test(l));
  lignes.forEach(l => console.log("   " + l.trim()));
  verifier("les trois contrôles de la lecture automatique passent", lignes.length === 3 && lignes.every(l => /\bOK\b/.test(l)),
           lignes.length + " ligne(s)");
  verifier("et tout le combat complet aussi (Nico et Ben tapent, Adrien non)", r.status === 0,
           (sortie.match(/^.*ÉCHEC.*$/m) || [""])[0].trim().slice(0, 140));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
