// LES COMPTES DES JOUEURS, DE BOUT EN BOUT (v259) — CONTRE L'ÉMULATEUR FIREBASE.
//
// Ce banc n'est pas dans la suite (son nom commence par « _ ») : il lui faut
// l'émulateur Firebase (Java + firebase-tools) et les modules npm `firebase`
// 9.23.0 et `@firebase/rules-unit-testing`, dans un dossier donné par
// IVALIS_EMUL (le node_modules). On le lance ainsi, depuis ce dossier-là :
//
//   IVALIS_EMUL=$PWD/node_modules npx firebase emulators:exec \
//       --only auth,firestore --project demo-ivalis \
//       "node /home/user/Ivalis/tests_monstres/_comptes_emulateur.mjs"
//
// (firebase.json : auth sur 127.0.0.1:9099, firestore sur 127.0.0.1:8085.)
//
// LA VRAIE PAGE, LES VRAIS MODULES FIREBASE (les fichiers « CDN » du paquet
// npm, servis à la place de gstatic), LES VRAIES RÈGLES (firestore.rules) :
// seule la configuration pointe vers l'émulateur. Chaque appareil est un
// contexte de navigateur à part — sa session à lui, comme un vrai iPad.
//
// 1. LES RÈGLES, seules (Nico, Ben, Adrien, une demande, la validation…).
// 2. LE JEU : la reprise de Nico (mauvaise clé, puis la bonne), la session
//    qui survit au rechargement, la demande de Gaston, acceptée par Nico, la
//    page de Gaston qui s'ouvre d'elle-même, la demande refusée, le nom déjà
//    repris, le mauvais mot de passe, le changement de mot de passe, l'oubli,
//    la déconnexion.
//
// REGLES_OUVERTES=1 : LA PÉRIODE DE TRANSITION. Les nouvelles règles ne sont
// pas encore publiées (la base est ouverte, comme avant les comptes) : le jeu
// doit marcher tout pareil — la Clé de Rune est alors vérifiée par la page
// elle-même, avant de créer le compte. (La partie 1 est sautée.)
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createRequire } from 'module';

const EMUL = process.env.IVALIS_EMUL;
if (!EMUL || !fs.existsSync(EMUL)) { console.error("IVALIS_EMUL doit désigner le node_modules de l'émulateur."); process.exit(2); }
const require = createRequire(EMUL + '/');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const F = require('firebase/firestore');

const RACINE = '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(80)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const passe = async (l, p) => { try { await assertSucceeds(p); verifier(l, true); } catch (e) { verifier(l, false, String(e.message).slice(0, 160)); } };
const refuse = async (l, p) => { try { await assertFails(p); verifier(l, true); } catch (e) { verifier(l, false, "accepté à tort"); } };

const OUVERT = process.env.REGLES_OUVERTES === "1";
const REGLES_OUVERTES = `rules_version = '2';
service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read: if true; allow write: if true; } } }`;
const env = await initializeTestEnvironment({ projectId: 'demo-ivalis',
  firestore: { rules: OUVERT ? REGLES_OUVERTES : fs.readFileSync(RACINE + '/firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 } });
if (OUVERT) console.log("\n  (RÈGLES OUVERTES : la période de transition, avant la publication des nouvelles règles)");
const semer = async () => {
  await env.clearFirestore();
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-ivalis/accounts', { method: 'DELETE' });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await F.setDoc(F.doc(db, 'Joueurs', 'P_01'), { ID_Joueur: 'P_01', Nom: 'Nico' });
    await F.setDoc(F.doc(db, 'Joueurs', 'P_02'), { ID_Joueur: 'P_02', Nom: 'Ben' });
    await F.setDoc(F.doc(db, 'Joueurs', 'P_03'), { ID_Joueur: 'P_03', Nom: 'Adrien' });
    await F.setDoc(F.doc(db, 'MDP_Nouvelle_Partie', 'config'), { mdp_nouvelle_partie: 'Rune 42', mdp_parametres: 'param' });
    await F.setDoc(F.doc(db, 'Personnages', 'PERSO_1'), { ID_Joueur: 'P_01', Prenom: 'Aldric' });
    await F.setDoc(F.doc(db, 'Personnages', 'PERSO_1', 'Competences', 'C1'), { Nom: 'Coup' });
    await F.setDoc(F.doc(db, 'Date_En_Jeu', 'actuelle'), { Jour: 3, Annee: 812 });
  });
};

// =========================================================================
console.log("\n=========================================================");
console.log("  LES COMPTES DES JOUEURS, CONTRE L'ÉMULATEUR");
console.log("=========================================================");
console.log("\n1. LES RÈGLES");
// =========================================================================
await semer();
if (!OUVERT) {
  const ctx = (uid, email) => env.authenticatedContext(uid, { email }).firestore();
  const anonyme = env.unauthenticatedContext().firestore();
  const profil = (db, uid, email, nom, norm, extra, ancienId) => {
    const b = F.writeBatch(db);
    b.set(F.doc(db, 'Noms_Utilisateurs', norm), { Uid: uid, Nom: nom });
    b.set(F.doc(db, 'Comptes', uid), { Uid: uid, Email: email, Nom: nom, Nom_Normalise: norm, Cree_Le: F.serverTimestamp(), ...extra });
    if (ancienId) b.update(F.doc(db, 'Joueurs', ancienId), { Uid: uid });
    return b.commit();
  };
  await refuse("un inconnu ne lit pas les personnages", F.getDoc(F.doc(anonyme, 'Personnages', 'PERSO_1')));
  await refuse("ni la Clé de Rune", F.getDoc(F.doc(anonyme, 'MDP_Nouvelle_Partie', 'config')));
  await passe("il peut demander si un nom est pris", F.getDoc(F.doc(anonyme, 'Noms_Utilisateurs', 'nico')));
  await refuse("pas lister les noms", F.getDocs(F.collection(anonyme, 'Noms_Utilisateurs')));
  const nico = ctx('u-nico', 'nico@ivalis.fr');
  await refuse("Nico avec une mauvaise Clé de Rune", profil(nico, 'u-nico', 'nico@ivalis.fr', 'Nico', 'nico', { Statut: 'Valide', Role: 'admin', ID_Joueur: 'P_01', Cle: 'mauvaise' }, 'P_01'));
  await refuse("Nico qui se ferait joueur P_02", profil(nico, 'u-nico', 'nico@ivalis.fr', 'Nico', 'nico', { Statut: 'Valide', Role: 'admin', ID_Joueur: 'P_02', Cle: 'Rune 42' }, 'P_02'));
  await refuse("une autre adresse que celle du compte", profil(nico, 'u-nico', 'autre@ivalis.fr', 'Nico', 'nico', { Statut: 'Valide', Role: 'admin', ID_Joueur: 'P_01', Cle: 'Rune 42' }, 'P_01'));
  await passe("Nico avec la bonne Clé (espaces autour compris)", profil(nico, 'u-nico', 'nico@ivalis.fr', 'Nico', 'nico', { Statut: 'Valide', Role: 'admin', ID_Joueur: 'P_01', Cle: '  Rune 42 ' }, 'P_01'));
  await passe("Nico lit ses personnages, et leurs sous-collections", Promise.all([F.getDoc(F.doc(nico, 'Personnages', 'PERSO_1')), F.getDoc(F.doc(nico, 'Personnages', 'PERSO_1', 'Competences', 'C1'))]));
  await passe("Nico écrit dans le jeu", F.setDoc(F.doc(nico, 'Personnages', 'PERSO_1'), { PV: 30 }, { merge: true }));
  const voleur = ctx('u-voleur', 'voleur@ivalis.fr');
  await refuse("un second compte « nico » (nom déjà pris)", profil(voleur, 'u-voleur', 'voleur@ivalis.fr', 'Nico', 'nico', { Statut: 'Valide', Role: 'admin', ID_Joueur: 'P_01', Cle: 'Rune 42' }, 'P_01'));
  const ben = ctx('u-ben', 'ben@ivalis.fr');
  await refuse("Ben en simple demande sous son ancien nom", profil(ben, 'u-ben', 'ben@ivalis.fr', 'Ben', 'ben', { Statut: 'En_attente', Role: 'joueur', ID_Joueur: '' }));
  await passe("Ben avec la Clé", profil(ben, 'u-ben', 'ben@ivalis.fr', 'Ben', 'ben', { Statut: 'Valide', Role: 'admin', ID_Joueur: 'P_02', Cle: 'Rune 42' }, 'P_02'));
  const adrien = ctx('u-adrien', 'adrien@ivalis.fr');
  await refuse("Adrien qui se ferait admin", profil(adrien, 'u-adrien', 'adrien@ivalis.fr', 'Adrien', 'adrien', { Statut: 'Valide', Role: 'admin', ID_Joueur: 'P_03', Cle: 'Rune 42' }, 'P_03'));
  await passe("Adrien avec la Clé, joueur", profil(adrien, 'u-adrien', 'adrien@ivalis.fr', 'Adrien', 'adrien', { Statut: 'Valide', Role: 'joueur', ID_Joueur: 'P_03', Cle: 'Rune 42' }, 'P_03'));
  const gaston = ctx('u-gaston', 'gaston@ivalis.fr');
  await refuse("Gaston qui se validerait lui-même", profil(gaston, 'u-gaston', 'gaston@ivalis.fr', 'Gaston', 'gaston', { Statut: 'Valide', Role: 'joueur', ID_Joueur: 'P_09' }));
  await passe("Gaston demande à entrer", profil(gaston, 'u-gaston', 'gaston@ivalis.fr', 'Gaston', 'gaston', { Statut: 'En_attente', Role: 'joueur', ID_Joueur: '' }));
  await passe("il lit son compte", F.getDoc(F.doc(gaston, 'Comptes', 'u-gaston')));
  await refuse("pas celui de Nico", F.getDoc(F.doc(gaston, 'Comptes', 'u-nico')));
  await refuse("ni les personnages", F.getDoc(F.doc(gaston, 'Personnages', 'PERSO_1')));
  await refuse("ni les joueurs, ni la Clé de Rune", F.getDoc(F.doc(gaston, 'Joueurs', 'P_01')));
  await refuse("…la Clé de Rune non plus", F.getDoc(F.doc(gaston, 'MDP_Nouvelle_Partie', 'config')));
  await refuse("il ne change pas son statut", F.updateDoc(F.doc(gaston, 'Comptes', 'u-gaston'), { Statut: 'Valide', ID_Joueur: 'P_09' }));
  await refuse("Adrien (joueur) ne liste pas les demandes", F.getDocs(F.query(F.collection(adrien, 'Comptes'), F.where('Statut', '==', 'En_attente'))));
  await refuse("Adrien ne valide pas", F.updateDoc(F.doc(adrien, 'Comptes', 'u-gaston'), { Statut: 'Valide', ID_Joueur: 'P_04' }));
  await refuse("ni par la porte du jeu", F.setDoc(F.doc(adrien, 'Comptes', 'u-gaston'), { Statut: 'Valide' }, { merge: true }));
  await refuse("ni sur un joueur", F.setDoc(F.doc(adrien, 'Joueurs', 'P_01'), { Uid: 'u-adrien' }, { merge: true }));
  await passe("Nico liste les demandes", F.getDocs(F.query(F.collection(nico, 'Comptes'), F.where('Statut', '==', 'En_attente'))));
  await refuse("Nico ne change pas l'e-mail d'un compte", F.updateDoc(F.doc(nico, 'Comptes', 'u-gaston'), { Email: 'x@y.fr' }));
}

// =========================================================================
console.log("\n2. LE JEU");
// =========================================================================
await semer();
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
// La configuration du jeu, tournée vers l'émulateur (le reste du fichier à l'identique).
const CONFIG_EMUL = `
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { initializeFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
const app = initializeApp({ apiKey: "demo-cle", authDomain: "demo-ivalis.firebaseapp.com", projectId: "demo-ivalis" });
export const db = initializeFirestore(app, { experimentalForceLongPolling: true });
connectFirestoreEmulator(db, "127.0.0.1", 8085);
export default app;`;
const SDK = (nom) => fs.readFileSync(path.join(EMUL, 'firebase', nom), 'utf-8');
const PIXEL = `<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4" fill="#333"/></svg>`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const navigateur = await chromium.launch();
const erreurs = [];
const appareil = async (nom) => {
  const contexte = await navigateur.newContext({ viewport: { width: 1194, height: 834 } });
  await contexte.addInitScript(() => { window.__EMULATEURS_IVALIS = { auth: "http://127.0.0.1:9099" }; });
  const p = await contexte.newPage();
  p.on('dialog', d => d.accept());
  p.on("pageerror", e => erreurs.push(`${nom} : ${e.message} ${(e.stack || "").slice(0, 300)}`)); p.on("console", m => { if (m.type() === "error") console.log("   [console " + nom + "] " + m.text().slice(0, 200)); });
  await p.route('**', r => {
    const u = r.request().url();
    if (u.startsWith(base)) {
      if (/\/firebase-config\.js/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: CONFIG_EMUL });
      return r.continue();
    }
    const sdk = /gstatic\.com\/firebasejs\/9\.23\.0\/(firebase-[a-z]+\.js)$/.exec(u);
    if (sdk) return r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: SDK(sdk[1]) });
    if (/127\.0\.0\.1:(9099|8085)/.test(u)) return r.continue();
    if (/res\.cloudinary\.com/.test(u)) return r.fulfill({ contentType: 'image/svg+xml', body: PIXEL });
    return r.abort();
  });
  await p.goto(base + '/index.html');
  await p.waitForFunction(() => window.ComptesIvalis && window.ComptesIvalis.phase !== "chargement", null, { timeout: 15000 });
  return { p, contexte };
};
// Le sceau passé : l'écran de connexion (l'accueil et ses sept secondes sont sautés).
const ecran = async (p) => {
  await p.evaluate(() => { document.getElementById("ecran-accueil").style.display = "none"; window.afficherEcranConnexion(); });
  await p.waitForTimeout(1000);
};
const phase = (p, voulue, ms = 12000) => p.waitForFunction((v) => window.ComptesIvalis.phase === v, voulue, { timeout: ms }).then(() => true, () => false);
const texte = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.trim() : null; }, sel);
const visible = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== "none" && e.offsetParent !== null; }, sel);
const remplir = async (p, champs) => { for (const [sel, v] of Object.entries(champs)) await p.fill(sel, v); };
const lireJeu = (p) => p.evaluate(async () => {
  const fs = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js");
  const { db } = await import("./firebase-config.js?v=2");
  try { const s = await fs.getDoc(fs.doc(db, "Personnages", "PERSO_1")); return s.exists() ? "lu" : "vide"; }
  catch (e) { return e.code || "erreur"; }
});
const etatPage = (p) => p.evaluate(() => ({
  phase: window.ComptesIvalis.phase, id: localStorage.getItem("ID_JOUEUR_COURANT"), porte: window.PorteJoueur.ouverte,
  titre: document.querySelector(".titre-etranger").textContent, compte: window.COMPTE_JOUEUR,
  identification: getComputedStyle(document.getElementById("ecran-identification")).display
}));

// --- L'appareil de Nico ---------------------------------------------------
const A = await appareil("Nico");
{
  const { p } = A;
  await ecran(p);
  const e = await etatPage(p);
  verifier("un nouvel appareil : l'écran de connexion, porte fermée, aucun joueur",
           e.phase === "deconnecte" && !e.porte && !e.id && /PRÉSENTE-TOI/.test(e.titre), JSON.stringify(e).slice(0, 160));
  verifier("deux onglets : Se connecter, Créer un compte",
           JSON.stringify(await p.$$eval(".onglet-connexion", b => b.map(x => x.textContent.trim()))) === '["Se connecter","Créer un compte"]');
  verifier("le jeu n'a rien lu dans la base (porte fermée)", (await p.evaluate(() => Object.keys(window.EFFETS_BDD_CACHE || {}).length)) === 0);
  await p.click('.onglet-connexion[data-vue="inscription"]');
  verifier("la Clé de Rune est cachée pour un nom quelconque", !(await visible(p, ".champ-cle")));
  await remplir(p, { "#inscription-email": "nico@ivalis.fr", "#inscription-nom": "nico" });
  verifier("…et paraît pour « nico » : « Tu reprends Nico et ses personnages »",
           (await visible(p, ".champ-cle")) && /Tu reprends Nico/.test(await texte(p, "#note-inscription")));
  await remplir(p, { "#inscription-mdp": "secret1", "#inscription-mdp2": "secret2", "#inscription-cle": "Rune 42" });
  await p.click('#form-inscription button[type="submit"]');
  verifier("deux mots de passe différents : refusé tout de suite",
           /pas identiques/.test(await texte(p, "#message-connexion")));
  await remplir(p, { "#inscription-mdp": "secret1", "#inscription-mdp2": "secret1", "#inscription-cle": "mauvaise" });
  await p.click('#form-inscription button[type="submit"]');
  if (OUVERT) {
    // La base laisse lire la Clé : la page la vérifie AVANT de créer le compte.
    await p.waitForFunction(() => /Clé de Rune est incorrecte/.test(document.getElementById("message-connexion").textContent), null, { timeout: 8000 }).catch(() => {});
    verifier("une mauvaise Clé : refusée par la page, AUCUN compte créé",
             /La Clé de Rune est incorrecte/.test(await texte(p, "#message-connexion"))
             && (await p.evaluate(() => window.ComptesIvalis.phase)) === "deconnecte", await texte(p, "#message-connexion"));
  } else {
    const incomplet = await phase(p, "incomplet");
    await p.waitForTimeout(300);
    verifier("une mauvaise Clé : le compte existe, mais il lui manque son nom",
             incomplet && /Clé de Rune est incorrecte/.test(await texte(p, "#message-connexion")), await texte(p, "#message-connexion"));
  }
  verifier("le nom reste saisi, la Clé est redemandée",
           (await p.inputValue("#inscription-nom")) === "nico" && (await visible(p, ".champ-cle")));
  await remplir(p, { "#inscription-cle": "Rune 42" });
  await p.click('#form-inscription button[type="submit"]');
  const ok = await phase(p, "valide");
  await p.waitForTimeout(300);
  const e2 = await etatPage(p);
  verifier("la bonne Clé : Nico reconnu, joueur P_01, porte ouverte",
           ok && e2.id === "P_01" && e2.porte && e2.compte && e2.compte.admin === true, JSON.stringify(e2.compte));
  verifier("« BIENVENUE, NICO », puis le menu", /BIENVENUE, NICO/.test(e2.titre));
  await p.waitForFunction(() => getComputedStyle(document.getElementById("ecran-identification")).display === "none", null, { timeout: 6000 }).catch(() => {});
  verifier("l'écran de connexion s'en va", (await etatPage(p)).identification === "none");
  verifier("sur le menu : « ⚜ Nico », Demandes d'inscription, Mon compte, Se déconnecter",
           (await visible(p, "#barre-compte")) && (await texte(p, "#barre-compte-nom")) === "Nico"
           && (await p.evaluate(() => window.basculerMenuCompte(true))) && (await visible(p, "#btn-demandes")) && (await visible(p, "#btn-mon-compte")) && (await visible(p, "#btn-se-deconnecter")));
  verifier("Nico lit le jeu", (await lireJeu(p)) === "lu");
  await p.waitForTimeout(800);
  verifier("le jeu s'est chargé derrière la porte (la date en jeu)", /3/.test(await texte(p, "#affichage-jour") || ""), await texte(p, "#affichage-jour"));

  // La mise à jour du jeu (un rechargement) : la session reste.
  await p.reload();
  await p.waitForFunction(() => window.ComptesIvalis && window.ComptesIvalis.phase === "valide", null, { timeout: 15000 }).catch(() => {});
  await ecran(p);
  const e3 = await etatPage(p);
  verifier("APRÈS UN RECHARGEMENT : toujours Nico, sans rien retaper", e3.phase === "valide" && e3.id === "P_01" && /BIENVENUE, NICO/.test(e3.titre),
           JSON.stringify({ phase: e3.phase, id: e3.id }));
  verifier("…et aucun formulaire", !(await p.$("#form-connexion")) && !(await p.$("#form-inscription")));
}

// --- Gaston demande à entrer -------------------------------------------------
const B = await appareil("Gaston");
{
  const { p } = B;
  await ecran(p);
  await p.click('.onglet-connexion[data-vue="inscription"]');
  await remplir(p, { "#inscription-email": "gaston@ivalis.fr", "#inscription-nom": "Gaston", "#inscription-mdp": "gaston1", "#inscription-mdp2": "gaston1" });
  verifier("pour Gaston : « Nico ou Ben validera ta demande »", /Nico ou Ben validera/.test(await texte(p, "#note-inscription")));
  await p.click('#form-inscription button[type="submit"]');
  const attente = await phase(p, "attente");
  const e = await etatPage(p);
  verifier("sa demande est envoyée : en attente, porte fermée, aucun joueur",
           attente && !e.porte && !e.id, JSON.stringify({ phase: e.phase, id: e.id }));
  verifier("« Nico ou Ben doit l'accepter : cette page s'ouvrira d'elle-même »", /Nico ou Ben doit l'accepter/.test(await texte(p, "#panneau-connexion")));
  if (!OUVERT) verifier("il ne lit pas le jeu", (await lireJeu(p)) === "permission-denied");
}

// --- Nico accepte ------------------------------------------------------------
{
  const { p } = A;
  await p.waitForFunction(() => window.ComptesIvalis.demandes.length === 1, null, { timeout: 8000 }).catch(() => {});
  verifier("chez Nico, la pastille : 1 demande", (await texte(p, "#pastille-demandes")) === "1" && (await visible(p, "#pastille-demandes")));
  await p.evaluate(() => window.basculerMenuCompte(true));
  await p.click("#btn-demandes");
  verifier("la fenêtre : Gaston, son e-mail", /Gaston/.test(await texte(p, "#liste-demandes")) && /gaston@ivalis\.fr/.test(await texte(p, "#liste-demandes")));
  await p.click('.demande-inscription [data-decision="accepter"]');
  await p.waitForFunction(() => /accepté/.test(document.getElementById("message-demandes").textContent), null, { timeout: 8000 }).catch(() => {});
  verifier("« Gaston est accepté (joueur P_04) »", /Gaston est accepté \(joueur P_04\)/.test(await texte(p, "#message-demandes")), await texte(p, "#message-demandes"));
  await p.waitForTimeout(500);
  verifier("plus de demande en attente", /Aucune demande/.test(await texte(p, "#liste-demandes")) && !(await visible(p, "#pastille-demandes")));
  await p.evaluate(() => window.fermerModalesCompte());
}
{
  const { p } = B;
  const ok = await phase(p, "valide");
  const e = await etatPage(p);
  verifier("CHEZ GASTON, LA PAGE S'OUVRE D'ELLE-MÊME : joueur P_04, porte ouverte",
           ok && e.id === "P_04" && e.porte && /BIENVENUE, GASTON/.test(e.titre), JSON.stringify({ phase: e.phase, id: e.id, titre: e.titre }));
  verifier("il lit le jeu", (await lireJeu(p)) === "lu");
  await p.evaluate(() => window.basculerMenuCompte(true));
  verifier("pas de Demandes pour lui (il n'est pas admin)", !(await visible(p, "#btn-demandes")));
  await B.contexte.close();
}

// --- Hugo, refusé --------------------------------------------------------------
const C = await appareil("Hugo");
{
  const { p } = C;
  await ecran(p);
  await p.click('.onglet-connexion[data-vue="inscription"]');
  await remplir(p, { "#inscription-email": "hugo@ivalis.fr", "#inscription-nom": "Hugo", "#inscription-mdp": "hugo12", "#inscription-mdp2": "hugo12" });
  await p.click('#form-inscription button[type="submit"]');
  await phase(p, "attente");
  await A.p.waitForFunction(() => window.ComptesIvalis.demandes.length === 1, null, { timeout: 8000 }).catch(() => {});
  await A.p.evaluate(() => window.basculerMenuCompte(true));
  await A.p.click("#btn-demandes");
  await A.p.click('.demande-inscription [data-decision="refuser"]');
  const refuse_ = await phase(p, "refuse");
  verifier("refusé par Nico : « Ta demande d'inscription a été refusée »", refuse_ && /refusée/.test(await texte(p, "#panneau-connexion")));
  if (!OUVERT) verifier("il ne lit toujours rien", (await lireJeu(p)) === "permission-denied");
  await A.p.evaluate(() => window.fermerModalesCompte());
  await C.contexte.close();
}

// --- Un quatrième appareil : le nom déjà repris, les mots de passe ------------
const D = await appareil("Tablette");
{
  const { p } = D;
  await ecran(p);
  await p.click('.onglet-connexion[data-vue="inscription"]');
  await remplir(p, { "#inscription-email": "faux@ivalis.fr", "#inscription-nom": "Nico", "#inscription-mdp": "faux123", "#inscription-mdp2": "faux123", "#inscription-cle": "Rune 42" });
  await p.click('#form-inscription button[type="submit"]');
  await p.waitForFunction(() => /repris/.test(document.getElementById("message-connexion").textContent), null, { timeout: 8000 }).catch(() => {});
  verifier("reprendre Nico une seconde fois : « Nico a déjà été repris »", /Nico a déjà été repris/.test(await texte(p, "#message-connexion")),
           await texte(p, "#message-connexion"));
  verifier("…et aucun compte n'a été créé pour rien", (await p.evaluate(() => window.ComptesIvalis.phase)) === "deconnecte");
  await p.click('.onglet-connexion[data-vue="connexion"]');
  await remplir(p, { "#connexion-email": "nico@ivalis.fr", "#connexion-mdp": "mauvais" });
  await p.click('#form-connexion button[type="submit"]');
  await p.waitForFunction(() => /incorrect/.test(document.getElementById("message-connexion").textContent), null, { timeout: 8000 }).catch(() => {});
  verifier("un mauvais mot de passe : « E-mail ou mot de passe incorrect »", /E-mail ou mot de passe incorrect/.test(await texte(p, "#message-connexion")),
           await texte(p, "#message-connexion"));
  await remplir(p, { "#connexion-mdp": "secret1" });
  await p.click('#form-connexion button[type="submit"]');
  verifier("le bon : Nico, sur cet appareil aussi", (await phase(p, "valide")) && (await etatPage(p)).id === "P_01");

  // Mon compte : changer de mot de passe.
  await p.waitForTimeout(3200);
  await p.evaluate(() => window.basculerMenuCompte(true));
  await p.click("#btn-mon-compte");
  verifier("Mon compte : son nom, son e-mail, son rôle",
           (await texte(p, "#compte-nom")) === "Nico" && (await texte(p, "#compte-email")) === "nico@ivalis.fr" && /inscriptions/.test(await texte(p, "#compte-role")));
  await remplir(p, { "#compte-mdp-actuel": "pasLeBon", "#compte-mdp-nouveau": "nouveau9", "#compte-mdp-confirmer": "nouveau9" });
  await p.click('#form-changer-mdp button[type="submit"]');
  await p.waitForFunction(() => document.getElementById("message-compte").textContent.length > 0, null, { timeout: 8000 }).catch(() => {});
  verifier("le mot de passe actuel faux : refusé", /actuel est incorrect/.test(await texte(p, "#message-compte")), await texte(p, "#message-compte"));
  await remplir(p, { "#compte-mdp-actuel": "secret1", "#compte-mdp-nouveau": "nouveau9", "#compte-mdp-confirmer": "nouveau9" });
  await p.click('#form-changer-mdp button[type="submit"]');
  await p.waitForFunction(() => /changé/.test(document.getElementById("message-compte").textContent), null, { timeout: 8000 }).catch(() => {});
  verifier("le bon : « Ton mot de passe est changé »", /mot de passe est changé/.test(await texte(p, "#message-compte")), await texte(p, "#message-compte"));
  await p.evaluate(() => window.fermerModalesCompte());

  // Se déconnecter : la page repart de zéro, sans joueur.
  await Promise.all([p.waitForNavigation({ timeout: 15000 }).catch(() => {}), p.evaluate(() => window.basculerMenuCompte(true)).then(() => p.click("#btn-se-deconnecter"))]);
  await p.waitForFunction(() => window.ComptesIvalis && window.ComptesIvalis.phase !== "chargement", null, { timeout: 15000 }).catch(() => {});
  await ecran(p);
  const e = await etatPage(p);
  verifier("SE DÉCONNECTER : retour à l'écran de connexion, plus de joueur, porte fermée",
           e.phase === "deconnecte" && !e.id && !e.porte, JSON.stringify({ phase: e.phase, id: e.id }));
  await remplir(p, { "#connexion-email": "nico@ivalis.fr", "#connexion-mdp": "secret1" });
  await p.click('#form-connexion button[type="submit"]');
  await p.waitForFunction(() => /incorrect/.test(document.getElementById("message-connexion").textContent), null, { timeout: 8000 }).catch(() => {});
  verifier("l'ancien mot de passe ne marche plus", /incorrect/.test(await texte(p, "#message-connexion")));
  await remplir(p, { "#connexion-mdp": "nouveau9" });
  await p.click('#form-connexion button[type="submit"]');
  verifier("le nouveau, si", await phase(p, "valide"));
  await p.evaluate(() => window.seDeconnecter());
  await p.waitForTimeout(1500);
  await p.waitForFunction(() => window.ComptesIvalis && window.ComptesIvalis.phase !== "chargement", null, { timeout: 15000 }).catch(() => {});
  await ecran(p);
  // L'oubli.
  await remplir(p, { "#connexion-email": "nico@ivalis.fr" });
  await p.click('[data-action="mdp-oublie"]');
  await p.waitForFunction(() => /e-mail vient de partir/.test(document.getElementById("message-connexion").textContent), null, { timeout: 8000 }).catch(() => {});
  verifier("Mot de passe oublié : « un e-mail vient de partir »", /e-mail vient de partir/.test(await texte(p, "#message-connexion")), await texte(p, "#message-connexion"));
  const courriels = await (await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-ivalis/oobCodes')).json();
  verifier("…et l'émulateur l'a bien envoyé (réinitialisation, à nico@ivalis.fr)",
           (courriels.oobCodes || []).some(c => c.requestType === "PASSWORD_RESET" && c.email === "nico@ivalis.fr"));
  await D.contexte.close();
}

verifier("aucune erreur JavaScript dans les pages", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await A.contexte.close();
await navigateur.close();
serveur.close();
await env.cleanup();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
