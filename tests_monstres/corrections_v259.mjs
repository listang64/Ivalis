// LES CORRECTIONS DE LA v259 : LES COMPTES DES JOUEURS.
//
//   « Remplace le "Qui es-tu, étranger ?" par une connexion avec son mail, nom
//   d'utilisateur et mot de passe perso et protégé, sans avoir à se reconnecter
//   à chaque mise à jour. Les boutons qui vont bien sur le menu principal.
//   Enregistre Nico, Ben et Adrien pour que nos persos restent utilisables avec
//   nos anciens noms. Les nouvelles demandes d'inscription, Nico ou Ben doit
//   les valider. »
//
// Ce banc-ci tourne avec la suite, sans réseau : la porte du joueur, la page
// d'un banc (qui se comporte en compte validé), la page SANS compte (qui ne lit
// RIEN dans la base, et lit tout dès que la porte s'ouvre), les noms, et la
// cohérence entre comptes.js et firestore.rules.
//
// LE PARCOURS COMPLET — inscription, reprise de Nico avec la Clé de Rune,
// demande acceptée par Nico, session qui survit au rechargement, mot de passe
// changé, oublié — et LES RÈGLES elles-mêmes se jouent contre l'émulateur
// Firebase : _comptes_emulateur.mjs (hors suite, voir son en-tête).
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(80)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lire = (f) => { try { return fs.readFileSync(RACINE + '/' + f, 'utf-8'); } catch (e) { return ""; } };

console.log("\n=========================================================");
console.log("  LES CORRECTIONS DE LA v259 : LES COMPTES DES JOUEURS");
console.log("=========================================================");

console.log("\n1. LA PORTE DU JOUEUR");
{
  const w = {};
  try { new Function('window', lire('porte_joueur.js'))(w); } catch (e) {}
  const P = w.PorteJoueur;
  const journal = [];
  if (P) {
    P.quand(() => journal.push("a"));
    P.quand(() => { throw new Error("boum"); });
    P.quand(() => journal.push("b"));
  }
  verifier("fermée : rien ne part", !!P && P.ouverte === false && journal.length === 0);
  const errConsole = console.error; console.error = () => {};
  if (P) P.ouvrir();
  console.error = errConsole;
  verifier("ouverte : tout part, dans l'ordre, une erreur n'arrête pas les autres", JSON.stringify(journal) === '["a","b"]', JSON.stringify(journal));
  if (P) { P.quand(() => journal.push("c")); P.ouvrir(); }
  verifier("une fois ouverte : tout de suite, et rien ne repart deux fois", JSON.stringify(journal) === '["a","b","c"]', JSON.stringify(journal));
}

// --- La page, avec un faux Firebase qui note chaque accès à la base ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end(''); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const note = (nom) => `(window.__acces = window.__acces || []).push({ f: "${nom}", cible: JSON.stringify(arguments[0] || null).slice(0, 90) });`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  export function getDoc() { ${note("getDoc")} return Promise.resolve({ exists: () => false, data: () => ({}) }); }
  export function getDocs() { ${note("getDocs")} return Promise.resolve({ forEach: () => {}, docs: [], empty: true }); }
  export function setDoc() { ${note("setDoc")} return Promise.resolve(); }
  export function updateDoc() { ${note("updateDoc")} return Promise.resolve(); }
  export function deleteDoc() { ${note("deleteDoc")} return Promise.resolve(); }
  export function addDoc() { ${note("addDoc")} return Promise.resolve({ id: "n" }); }
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export function onSnapshot() { ${note("onSnapshot")} return () => {}; }
  export const query = (...a) => ({a});
  export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export function runTransaction(_d, fn) { ${note("runTransaction")} return fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} }); }
  export const Timestamp = { now: () => Date.now() };
`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const erreurs = [];
// `app` : le faux firebase-app.js. Sans getApp, c'est un banc ; avec, la page
// croit au vrai Firebase — et firebase-auth.js, injoignable, la laisse sans compte.
const ouvrirPage = async (app, nom) => {
  const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
  p.on('pageerror', e => erreurs.push(`${nom} : ${e.message}`));
  await p.addInitScript(() => { try { localStorage.setItem("ID_JOUEUR_COURANT", "P_02"); } catch (e) {} });
  await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
  await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: app }));
  await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
  await p.goto(base + '/index.html');
  await p.waitForTimeout(2500);
  return p;
};
const acces = (p) => p.evaluate(() => (window.__acces || []).map(a => a.f + " " + a.cible));

console.log("\n2. UN BANC (faux Firebase, sans Auth) : comme un compte déjà validé");
{
  const p = await ouvrirPage(`export const initializeApp = () => ({});`, "banc");
  const e = await p.evaluate(() => ({
    phase: window.ComptesIvalis && window.ComptesIvalis.phase,
    porte: !!(window.PorteJoueur && window.PorteJoueur.ouverte),
    id: localStorage.getItem("ID_JOUEUR_COURANT")
  }));
  verifier("le banc est reconnu : porte ouverte, le joueur posé par le banc gardé", e.phase === "banc" && e.porte && e.id === "P_02", JSON.stringify(e));
  const a = await acces(p);
  verifier("le jeu a lu ce qu'il lit au démarrage (date, parties, effets, carte…)",
           a.some(x => /Date_En_Jeu/.test(x)) && a.some(x => /Combat_Effets/.test(x)) && a.some(x => /Monstres_Modeles\/_REGLAGES/.test(x)),
           `${a.length} accès`);
  verifier("PLUS DE LISTE DES NOMS À TOUCHER (ni la liste, ni son écoute des Joueurs)",
           !(await p.$("#liste-noms-joueurs")) && !a.some(x => /"col":"Joueurs"/.test(x)) && !(await p.evaluate(() => typeof window.validerIdentification === "function")));
  await p.evaluate(() => { document.getElementById("ecran-accueil").style.display = "none"; if (window.afficherEcranConnexion) window.afficherEcranConnexion(); });
  await p.waitForTimeout(300);
  verifier("après le sceau : « BIENVENUE », sans formulaire", /BIENVENUE/.test(await p.textContent(".titre-etranger")) && !(await p.$("#form-connexion")));
  await p.waitForTimeout(3300);
  verifier("puis le menu (l'écran de connexion s'en va)", await p.evaluate(() => getComputedStyle(document.getElementById("ecran-identification")).display === "none"));
  verifier("pas de barre de compte pour un banc", await p.evaluate(() => { const el = document.getElementById("barre-compte"); return !!el && getComputedStyle(el).display === "none"; }));
  const n = await p.evaluate(() => {
    const C = window.ComptesIvalis;
    if (!C) return {};
    return { norm: C.normaliserNom("  Nicô   Le  Grand "), court: C.verifierNom("A"), long: C.verifierNom("x".repeat(21)),
             bizarre: C.verifierNom("名前"), bon: C.verifierNom("Jean-Luc d'Ivalis"),
             mdp: C.messageErreur({ code: "auth/wrong-password" }), pris: C.messageErreur({ code: "auth/email-already-in-use" }),
             anciens: JSON.stringify(C.ANCIENS_JOUEURS) };
  });
  verifier("un nom se compare sans accents, en minuscules, espaces tassés", n.norm === "nico le grand", n.norm);
  verifier("2 à 20 caractères, lettres latines, chiffres, espaces, tirets, apostrophes",
           !!n.court && !!n.long && !!n.bizarre && n.bon === "", JSON.stringify([n.court, n.bizarre, n.bon]));
  verifier("les erreurs en français", /E-mail ou mot de passe incorrect/.test(n.mdp) && /connecte-toi plutôt/.test(n.pris));
  verifier("les anciens : Nico P_01 et Ben P_02 (admins), Adrien P_03",
           n.anciens === '{"nico":{"id":"P_01","nom":"Nico","role":"admin"},"ben":{"id":"P_02","nom":"Ben","role":"admin"},"adrien":{"id":"P_03","nom":"Adrien","role":"joueur"}}', n.anciens);
  await p.close();
}

console.log("\n3. SANS COMPTE, LA PAGE NE LIT RIEN DANS LA BASE");
{
  const p = await ouvrirPage(`export const initializeApp = () => ({}); export const getApp = () => ({});`, "sans compte");
  const e = await p.evaluate(() => ({ phase: window.ComptesIvalis && window.ComptesIvalis.phase, porte: !!(window.PorteJoueur && window.PorteJoueur.ouverte) }));
  const avant = await acces(p);
  verifier("le service de connexion injoignable : porte fermée", e.phase === "indisponible" && !e.porte, JSON.stringify(e));
  verifier("AUCUN ACCÈS À LA BASE (les règles le refuseraient)", avant.length === 0, avant.join(" | "));
  await p.evaluate(() => { document.getElementById("ecran-accueil").style.display = "none"; if (window.afficherEcranConnexion) window.afficherEcranConnexion(); });
  await p.waitForTimeout(1200);
  verifier("l'écran le dit, et propose de réessayer", /ne répond pas/.test((await p.$("#panneau-connexion")) ? await p.textContent("#panneau-connexion") : "")
           && !!(await p.$('[data-action="recharger"]')) && /PRÉSENTE-TOI/.test(await p.textContent(".titre-etranger")));
  verifier("la porte retient le préchargement aussi (les effets ne sont pas lus)",
           await p.evaluate(async () => { await window.prechargerLeJeu(); return !(window.__acces || []).some(a => /Combat_Effets/.test(a.cible)); }));
  // La porte s'ouvre (un compte reconnu) : tout part.
  await p.evaluate(() => window.PorteJoueur && window.PorteJoueur.ouvrir());
  await p.waitForTimeout(500);
  const apres = await acces(p);
  const attendus = { "la date en jeu": /Date_En_Jeu\/actuelle/, "les parties en cours": /Systeme_Parties/, "les effets": /Combat_Effets/,
                     "les lieux de la carte": /Monde_Lieux/, "les factions": /Monde_Factions/, "les réglages des monstres": /_REGLAGES/,
                     "la table des rencontres": /_RENCONTRES/, "les régions de la carte": /Carte_Monde\/Regions/ };
  const manquent = Object.entries(attendus).filter(([, re]) => !apres.some(x => re.test(x))).map(([n]) => n);
  verifier("LA PORTE OUVERTE : tout ce que le démarrage lisait part alors", manquent.length === 0, manquent.length ? "manquent : " + manquent.join(", ") : `${apres.length} accès`);
  await p.close();
}

console.log("\n4. LE MENU ET SES FENÊTRES");
{
  const html = lire('index.html');
  verifier("la barre du compte : nom, Demandes d'inscription, Mon compte, Se déconnecter",
           /id="barre-compte"/.test(html) && /id="btn-demandes"/.test(html) && /ouvrirMonCompte\(\)/.test(html) && /seDeconnecter\(\)/.test(html));
  verifier("les fenêtres Mon compte (changer de mot de passe) et Demandes d'inscription",
           /id="modale-compte"/.test(html) && /id="form-changer-mdp"/.test(html) && /id="modale-demandes"/.test(html));
  const scripts = [...html.matchAll(/<script[^>]*src="([^"?]+)/g)].map(m => m[1]);
  const premierModule = html.search(/<script type="module" src=/);
  verifier("la porte se charge avant tout module, les comptes juste après app.js",
           html.indexOf('src="porte_joueur.js') > 0 && html.indexOf('src="porte_joueur.js') < premierModule
           && scripts.indexOf("comptes.js") === scripts.indexOf("app.js") + 1, scripts.slice(scripts.indexOf("app.js"), scripts.indexOf("app.js") + 2).join(","));
}

console.log("\n5. LES RÈGLES ET LE CODE DISENT LA MÊME CHOSE");
{
  const regles = lire('firestore.rules');
  const comptes = lire('comptes.js');
  const anciens = [["nico", "P_01", "admin"], ["ben", "P_02", "admin"], ["adrien", "P_03", "joueur"]];
  verifier("les trois anciens, avec leur numéro et leur rôle, dans les règles comme dans comptes.js",
           anciens.every(([n, id, r]) => new RegExp(`d\\.Nom_Normalise == "${n}"\\s*&& d\\.ID_Joueur == "${id}" && d\\.Role == "${r}"`).test(regles)
                                       && new RegExp(`${n}:\\s*Object\\.freeze\\(\\{ id: "${id}",[^}]*role: "${r}"`).test(comptes)));
  verifier("le jeu n'est ouvert qu'aux comptes validés, comptes et joueurs à part",
           /match \/\{collection\}\/\{document=\*\*\}/.test(regles) && /allow read, write: if valide\(\)\s*&& !\(collection in \["Comptes", "Noms_Utilisateurs", "Joueurs"\]\)/.test(regles));
  verifier("seuls les admins valident ; la Clé de Rune comparée côté serveur",
           /allow update: if admin\(\) && decisionValide\(\)/.test(regles) && /d\.Cle\.trim\(\) == string\(cfg\.mdp_nouvelle_partie\)\.trim\(\)/.test(regles));
  verifier("la porte n'ouvre que sur un compte que la base a enregistré",
           /includeMetadataChanges: true/.test(comptes) && /hasPendingWrites/.test(comptes));
}

verifier("aucune erreur JavaScript dans les pages", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
