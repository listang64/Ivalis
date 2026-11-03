// v297 — LE GRIMOIRE : L'ACCUEIL DEVIENT UN VIEUX LIVRE (StPageFlip).
//
// Nico : « tout le jeu aura comme interface un vieux grimoire » ; d'abord
// l'accueil : la couverture sur fond beige, le livre qui s'ouvre et grossit,
// le titre à gauche, le journal du joueur à droite (Nouvelle partie, Charger
// partie, Compte), une double page par chapitre, tourner en arrière pour
// revenir, puis l'ancienne interface. Sur la VRAIE page (banc), les portes
// du jeu remplacées par des témoins. Se charge sur l'ancien code : il y
// échoue, sans planter.
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lire = (f) => { try { return fs.readFileSync(path.join(RACINE, f), 'utf-8'); } catch (e) { return ""; } };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' }); res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({}); export const getApp = () => ({}); export const BANC_IVALIS = true;`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...c) => ({ chemin: c.join("/") }); export const collection = (_db, ...c) => ({ col: c.join("/") });
  export const getDoc = async (r) => ({ exists: () => false, data: () => ({}) });
  export const query = (c) => c; export const where = () => ({}); export const orderBy = () => ({}); export const limit = () => ({});
  export const getDocs = async () => ({ forEach() {}, docs: [], empty: true, size: 0 });
  export const setDoc = async () => {}; export const updateDoc = async (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d }); };
  export const deleteDoc = async () => {}; export const addDoc = async (c, d) => { (window.__ajouts = window.__ajouts || []).push({ col: c.col, data: d }); return { id: "m" }; };
  export const onSnapshot = () => () => {}; export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
  export const runTransaction = async () => null; export const increment = (k) => k; export const deleteField = () => null;
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const serverTimestamp = () => Date.now();
  export class FieldPath {} export const Timestamp = { now: () => Date.now() };
`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1200);
const titre = (t) => console.log("\n" + t);
const section = async (f) => { try { await f(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 160)); } };
const etat = () => p.evaluate(() => window.grimoireEtat ? window.grimoireEtat() : null);
const attendreQue = async (f, ms = 6000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await p.waitForTimeout(100); } return false; };
const cliquer = (sel) => p.evaluate((sel) => document.querySelector(sel).click(), sel);
// Les pages bien posées sur le livre dessiné : la zone des pages de l'image (x 251 → 1765, y 62 → 1046 sur 2000 × 1117).
const alignement = () => p.evaluate(() => {
  const fond = document.querySelector(".grimoire-fond-livre").getBoundingClientRect();
  const k = fond.width / 2000;
  const g = document.getElementById("grimoire-page-1").getBoundingClientRect(), d = document.getElementById("grimoire-page-2").getBoundingClientRect();
  const attendu = { gauche: fond.left + 251 * k, dos: fond.left + 1008 * k, droite: fond.left + 1765 * k, haut: fond.top + 62 * k, bas: fond.top + 1046 * k };
  return { ecart: Math.max(Math.abs(g.left - attendu.gauche), Math.abs(g.right - attendu.dos), Math.abs(d.left - attendu.dos), Math.abs(d.right - attendu.droite), Math.abs(g.top - attendu.haut), Math.abs(g.bottom - attendu.bas)), k };
});

// =========================================================================
titre("1. APRÈS LA CONNEXION : LE GRIMOIRE FERMÉ, SUR FOND BEIGE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => {
    window.jouerSonClic = () => {};
    window.COMPTE_JOUEUR = { nom: "Nico", email: "nico@ivalis.fr", admin: true };
    window.LISTE_PARTIES_CACHE = [{ id: "P1", nom: "Les Lames d'Héra" }, { id: "P2", nom: "La Compagnie du Sel" }];
    document.getElementById("ecran-accueil").style.display = "none";
    window.afficherEcranConnexion();   // un banc : le joueur est reconnu, l'accueil enchaîne
  });
  const vu = await attendreQue(async () => !!(await etat()) && (await etat()).visible, 6000);
  await p.waitForTimeout(1300);
  const r = await p.evaluate(() => {
    const ecran = document.getElementById("ecran-grimoire"), scene = document.getElementById("grimoire-scene");
    const fond = getComputedStyle(ecran).backgroundImage + getComputedStyle(ecran, "::before").backgroundImage /* v299 : le fond sur ::before */, couv = document.querySelector(".page-couverture img");
    const rc = couv.getBoundingClientRect();
    return { menu: getComputedStyle(document.getElementById("ecran-menu")).display, ferme: scene.classList.contains("ferme"),
             fondBeige: /radial-gradient/.test(fond) && /241, 230, 207|rgb\(241/.test(fond), couverture: couv.complete && couv.naturalWidth === 1344 && /couverture\.webp/.test(couv.src),
             couvCentre: Math.abs((rc.left + rc.right) / 2 - innerWidth / 2), livreOuvertCache: getComputedStyle(document.querySelector(".grimoire-fond-livre")).opacity === "0",
             pf: !!window.GRIMOIRE_PAGEFLIP, page: window.GRIMOIRE_PAGEFLIP ? window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex() : -1, zoom: getComputedStyle(scene).transform };
  });
  verifier("après l'écran noir de connexion, le grimoire apparaît (à la place de l'ancien menu)", vu && r.menu === "none", r.menu);
  verifier("sur fond beige", r.fondBeige);
  verifier("livre fermé : on ne voit que la couverture (les Chroniques d'Ivalis)", r.ferme && r.couverture && r.livreOuvertCache && r.page === 0, JSON.stringify({ ferme: r.ferme, page: r.page }));
  verifier("la couverture est au centre de l'écran, un peu plus petite (zoom)", r.couvCentre < 3 && /matrix\(0\.82/.test(r.zoom), `${r.couvCentre.toFixed(1)} px du centre, ${r.zoom.slice(0, 30)}`);
  verifier("StPageFlip (vendor/page-flip, 2.0.7) tient le livre", r.pf);
});

// =========================================================================
titre("2. UN TOUCHER : LA COUVERTURE TOURNE, LE LIVRE S'OUVRE ET GROSSIT");
// =========================================================================
await section(async () => {
  await p.mouse.click(597, 417);
  await p.waitForTimeout(150);                 // v299 : la page tourne en 0,5 s
  const pendant = await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getState());
  await p.waitForTimeout(1400);
  const r = await p.evaluate(() => {
    const scene = document.getElementById("grimoire-scene"), fond = document.querySelector(".grimoire-fond-livre").getBoundingClientRect();
    return { page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), ouvert: scene.classList.contains("ouvert"), zoom: getComputedStyle(scene).transform,
             livreVisible: getComputedStyle(document.querySelector(".grimoire-fond-livre")).opacity === "1", haut: fond.top, bas: innerHeight - fond.bottom, largeur: fond.width, vw: innerWidth,
             image: /livre_ouvert\.webp/.test(document.querySelector(".grimoire-fond-livre").src) };
  });
  verifier("la couverture tourne avec StPageFlip (animation de page)", pendant === "flipping" || pendant === "fold_corner", pendant);
  verifier("le livre ouvert apparaît, sur la double page titre + journal", r.page === 1 && r.ouvert && r.livreVisible && r.image, JSON.stringify({ page: r.page, ouvert: r.ouvert }));
  // v298 : « ne l'agrandis pas, juste descends-le » : tout le livre tient à l'écran, posé en bas.
  verifier("il grossit (zoom levé), tout entier à l'écran, posé en bas (v298)", r.zoom === "none" && r.bas >= 0 && r.bas < 20 && r.largeur > r.vw * 0.9 && r.largeur <= r.vw, `bas ${r.bas.toFixed(0)} px, haut ${r.haut.toFixed(0)} px, largeur ${r.largeur.toFixed(0)}/${r.vw}`);
  const a = await alignement();
  verifier("les deux pages se posent exactement sur celles du livre dessiné", a.ecart < 3, `${a.ecart.toFixed(1)} px`);
});

// =========================================================================
titre("3. LES DEUX PAGES : LA TEXTURE, LE TITRE, LE JOURNAL À LA PLUME");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const avant = (id) => getComputedStyle(document.getElementById(id), "::before");
    const g = avant("grimoire-page-1"), d = avant("grimoire-page-2");
    const t = (sel) => (document.querySelector(sel) || {}).textContent || "";
    const nom = document.querySelector(".nom-surligne");
    return { texG: /page\.webp/.test(g.backgroundImage) && /matrix\(-1, 0, 0, 1/.test(g.transform), texD: /page\.webp/.test(d.backgroundImage) && (d.transform === "none" || /matrix\(1, 0, 0, 1/.test(d.transform)),
             titre: t(".titre-ivalis"), sous: t(".titre-sous"), auteurs: document.querySelector(".titre-auteurs").innerText.replace(/\s+/g, " ").trim(),
             journal: t(".journal-entete").replace(/\s+/g, " ").trim(), sansNom: !nom, surligne: !!nom && !!nom.querySelector(".surligneur path") && nom.querySelector("b").textContent === "Nico",
             bordure: document.querySelectorAll("#grimoire-page-2 .bordure-plume path").length >= 2 && getComputedStyle(document.querySelector("#grimoire-page-2 .bordure-plume path")).stroke === "rgb(18, 11, 6)",
             entrees: Array.from(document.querySelectorAll(".journal-entrees .bouton-grimoire")).map(b => b.textContent.trim() + (b.querySelectorAll(".cadre-main path").length === 2 ? "✎" : "")) };
  });
  verifier("texture de page : à droite telle quelle, à gauche retournée (bord lisse vers le dos)", r.texG && r.texD);
  verifier("page de gauche : « Ivalis — le jeu de rôle »", /Ivalis/i.test(r.titre) && /le jeu de rôle/.test(r.sous), `${r.titre} / ${r.sous}`);
  verifier("… « Imaginé par Benjamin et Nicolas Duval »", r.auteurs === "Imaginé par Benjamin et Nicolas Duval", r.auteurs);
  // v300 : Nico, « remplace "Journal de …" par : Journal d'un aventurier, sans surlignage, un peu plus gros ».
  verifier("page de droite : « Journal d'un aventurier » (v300 ; « Journal de Nico » surligné en v297)", r.journal === "Journal d'un aventurier" && r.sansNom, r.journal);
  verifier("… bordée à la plume noire", r.bordure);
  verifier("… Nouvelle partie, Charger partie, Compte, dans des cadres tracés à la main", r.entrees.join(",") === "Nouvelle partie✎,Charger partie✎,Compte✎", r.entrees.join(","));
  if (process.env.V297_CAPTURES) await p.screenshot({ path: process.env.V297_CAPTURES + "/v297_journal.png" });
});

// =========================================================================
titre("4. CHARGER PARTIE : LA PAGE TOURNE TOUTE SEULE ; LE SCEAU, PUIS LA PARTIE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => {
    window.__appels = [];
    window.PORTES_GRIMOIRE_VRAIES = window.PORTES_GRIMOIRE;
    window.PORTES_GRIMOIRE = {
      verifierCle: async (s) => { window.__appels.push(["cle", s]); return s === "rune"; },
      creerPartie: async (n, m) => { window.__appels.push(["creer", n, m]); return "P_NEUVE"; },
      verifierMdpPartie: async (id, s) => { window.__appels.push(["mdp", id, s]); return { ok: s === "sel" }; },
      entrerDansPartie: (id) => { window.__appels.push(["entrer", id]); }
    };
  });
  await cliquer("#grimoire-btn-charger");
  await p.waitForTimeout(1500);
  let r = await p.evaluate(() => ({ page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), titre: document.querySelector("#grimoire-page-3 h2").textContent,
    parties: Array.from(document.querySelectorAll("#grimoire-liste-parties .bouton-grimoire")).map(b => b.textContent.trim()) }));
  verifier("« Charger partie » : le livre tourne tout seul vers la double page des archives", r.page === 3 && r.titre === "Archives d'Ivalis", JSON.stringify(r));
  verifier("les sessions en cours, chacune dans son cadre", r.parties.join(",") === "Les Lames d'Héra,La Compagnie du Sel", r.parties.join(","));
  await p.evaluate(() => window.grimoirePartiesMaj([{ id: "P1", nom: "Les Lames d'Héra" }, { id: "P2", nom: "La Compagnie du Sel" }, { id: "P3", nom: "Les Fils d'Arcaï" }]));
  verifier("la liste suit les parties en direct", (await p.evaluate(() => document.querySelectorAll("#grimoire-liste-parties .bouton-grimoire").length)) === 3);
  await cliquer('#grimoire-liste-parties [data-id="P2"]');
  await p.waitForTimeout(200);
  // Le champ prend le doigt et le clavier (StPageFlip n'y voit pas une page tournée).
  const champ = await p.$("#grimoire-mdp-partie");
  const bb = await champ.boundingBox();
  await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await p.keyboard.type("mauvais");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(300);
  r = await p.evaluate(() => ({ sceau: (document.querySelector("#grimoire-sceau-partie h3") || {}).textContent, texte: document.getElementById("grimoire-sceau-partie").textContent,
    msg: document.getElementById("grimoire-msg-partie").textContent, page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), appels: window.__appels.slice() }));
  verifier("une session choisie : le sceau de sécurité, sur la page de droite", r.sceau === "Sceau de sécurité" && /La Compagnie du Sel/.test(r.texte));
  verifier("le champ se tape au clavier, sans tourner la page", r.page === 3 && JSON.stringify(r.appels) === '[["mdp","P2","mauvais"]]', JSON.stringify(r.appels));
  verifier("mauvais mot de passe : « Mot de passe incorrect. »", r.msg === "Mot de passe incorrect.", r.msg);
  await p.fill("#grimoire-mdp-partie", "sel");
  await cliquer("#grimoire-valider-partie");
  await p.waitForTimeout(1200);
  r = await p.evaluate(() => ({ appels: window.__appels.slice(-1), ecran: getComputedStyle(document.getElementById("ecran-grimoire")).display, enPartie: window.grimoireEtat().enPartie }));
  // v299 : le grimoire ne s'efface plus, il se pose sur la carte, ouvert à l'index (corrections_v299).
  verifier("le bon : on entre dans la partie (v299 : le livre reste, par-dessus la carte)", JSON.stringify(r.appels) === '[["entrer","P2"]]' && r.ecran === "block" && r.enPartie === true, JSON.stringify(r));
});

// =========================================================================
titre("5. RETOUR AU MENU : LE GRIMOIRE SE ROUVRE SUR LE JOURNAL");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.fermerToutesLesFenetres = () => {}; window.confirmerRetourMenu(); });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => ({ e: window.grimoireEtat(), menu: getComputedStyle(document.getElementById("ecran-menu")).display, jeu: getComputedStyle(document.getElementById("ecran-jeu")).display }));
  verifier("« Retour au menu » : le grimoire, ouvert sur le journal (pas l'ancien menu)", r.e.visible && r.e.ouvert && r.e.page === 1 && r.menu === "none" && r.jeu === "none", JSON.stringify(r));
  const a = await alignement();
  verifier("… toujours bien posé sur le livre", a.ecart < 3, `${a.ecart.toFixed(1)} px`);
});

// =========================================================================
titre("6. NOUVELLE PARTIE : LA CLÉ DE RUNE, PUIS LE GROUPE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.__appels = []; });
  await cliquer("#grimoire-btn-nouvelle");
  await p.waitForTimeout(1500);
  let r = await p.evaluate(() => ({ page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), titre: document.querySelector("#grimoire-page-3 h2").textContent,
    cle: !document.getElementById("grimoire-form-cle").hidden, groupe: !document.getElementById("grimoire-form-groupe").hidden }));
  verifier("« Nouvelle partie » : le livre tourne vers sa double page ; la Clé de Rune d'abord", r.page === 3 && r.titre === "Nouvelle partie" && r.cle && !r.groupe, JSON.stringify(r));
  await p.fill("#grimoire-saisie-cle", "faux");
  await cliquer("#grimoire-valider-cle");
  await p.waitForTimeout(200);
  verifier("mauvaise clé : « Clé incorrecte. »", (await p.evaluate(() => document.getElementById("grimoire-msg-cle").textContent)) === "Clé incorrecte.");
  await p.fill("#grimoire-saisie-cle", "rune");
  await p.press("#grimoire-saisie-cle", "Enter");
  await p.waitForTimeout(200);
  r = await p.evaluate(() => ({ cle: !document.getElementById("grimoire-form-cle").hidden, groupe: !document.getElementById("grimoire-form-groupe").hidden }));
  verifier("la bonne clé : le nom du groupe et son mot de passe", !r.cle && r.groupe);
  await cliquer("#grimoire-creer-groupe");
  await p.waitForTimeout(150);
  verifier("sans nom ni mot de passe : le grimoire les exige", /exige un nom de groupe/.test(await p.evaluate(() => document.getElementById("grimoire-msg-groupe").textContent)));
  await p.fill("#grimoire-nom-groupe", "Les Veilleurs");
  await p.fill("#grimoire-mdp-groupe", "nuit");
  await cliquer("#grimoire-creer-groupe");
  await p.waitForTimeout(1200);
  r = await p.evaluate(() => ({ appels: window.__appels.slice(), enPartie: window.grimoireEtat().enPartie }));
  verifier("le groupe est fondé, et l'on entre dans la nouvelle partie", JSON.stringify(r.appels.slice(-2)) === '[["creer","Les Veilleurs","nuit"],["entrer","P_NEUVE"]]' && r.enPartie === true, JSON.stringify(r.appels));
});

// =========================================================================
titre("7. COMPTE ; REVENIR AU JOURNAL EN TOURNANT LA PAGE ; REFERMER");
// =========================================================================
await section(async () => {
  await p.evaluate(() => {
    window.__compte = [];
    window.basculerConnexionAuto = (c) => window.__compte.push(["auto", c]);
    window.connexionAutomatique = () => true;
    window.changerMotDePasseCompte = async (a, n, c) => { window.__compte.push(["mdp", a, n, c]); return { ok: true, texte: "Ton mot de passe est changé." }; };
    window.seDeconnecter = () => window.__compte.push(["deconnexion"]);
    window.ouvrirDemandesInscription = () => window.__compte.push(["demandes"]);
    window.afficherGrimoire({ ouvert: true });
  });
  await p.waitForTimeout(1300);
  await cliquer("#grimoire-btn-compte");
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => ({ page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), lignes: Array.from(document.querySelectorAll(".ligne-compte")).map(l => Array.from(l.children).map(x => x.textContent.trim()).join(" ")),
    auto: document.getElementById("grimoire-connexion-auto").checked, demandes: !!document.getElementById("grimoire-btn-demandes") }));
  verifier("« Compte » : sa double page (nom, e-mail, rôle)", r.page === 3 && r.lignes.join("|") === "Nom Nico|E-mail nico@ivalis.fr|Rôle Valide les inscriptions", r.lignes.join("|"));
  verifier("… la connexion automatique, et pour Nico et Ben les demandes d'inscription", r.auto && r.demandes);
  await cliquer("#grimoire-connexion-auto");
  await p.fill("#grimoire-mdp-actuel", "a"); await p.fill("#grimoire-mdp-nouveau", "bbbbbb"); await p.fill("#grimoire-mdp-confirmer", "bbbbbb");
  await cliquer("#grimoire-changer-mdp");
  await p.waitForTimeout(200);
  await cliquer("#grimoire-btn-demandes");
  const c = await p.evaluate(() => ({ appels: window.__compte, msg: document.getElementById("grimoire-msg-mdp").textContent }));
  verifier("la case, le mot de passe (sur la page de droite) et les demandes répondent", JSON.stringify(c.appels) === '[["auto",false],["mdp","a","bbbbbb","bbbbbb"],["demandes"]]' && c.msg === "Ton mot de passe est changé.", JSON.stringify(c));
  // Tourner la page en arrière, en la faisant glisser : retour au journal.
  const g = await p.evaluate(() => { const r = document.getElementById("grimoire-page-3").getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height * 0.85, w: r.width }; });
  await p.mouse.move(g.x, g.y); await p.mouse.down();
  for (let i = 1; i <= 20; i++) { await p.mouse.move(g.x + g.w * 1.5 * i / 20, g.y - 8 * i / 20); await p.waitForTimeout(20); }
  await p.mouse.up();
  await p.waitForTimeout(1500);
  verifier("glisser la page vers la droite : on revient au journal (l'écran principal)", (await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex())) === 1);
  // Au-delà du chapitre, rien : le livre revient au chapitre.
  await cliquer("#grimoire-btn-charger");
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.flipNext("top"));
  await p.waitForTimeout(2600);
  verifier("on ne peut pas tourner au-delà du chapitre (le livre y revient)", (await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex())) === 3);
  await cliquer("#grimoire-page-3 .revenir");
  await p.waitForTimeout(1500);
  verifier("« ← Revenir au journal » ramène aussi au journal", (await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex())) === 1);
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.flipPrev("top"));
  await p.waitForTimeout(1600);
  const f = await p.evaluate(() => ({ page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), ferme: document.getElementById("grimoire-scene").classList.contains("ferme"), attrape: getComputedStyle(document.getElementById("grimoire-attrape")).display }));
  verifier("tourner jusqu'à la couverture referme le livre (et un toucher le rouvrira)", f.page === 0 && f.ferme && f.attrape === "block", JSON.stringify(f));
});

// =========================================================================
titre("8. TOUS LES ÉCRANS : LE LIVRE SUIT LA TAILLE ; LES PORTES DU JEU");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.ouvrirGrimoire());
  await p.waitForTimeout(1600);
  for (const [w, h] of [[1440, 900], [844, 390], [390, 844]]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(500);
    const a = await alignement();
    const dbl = await p.evaluate(() => { const g = document.getElementById("grimoire-page-1").getBoundingClientRect(), d = document.getElementById("grimoire-page-2").getBoundingClientRect(); return g.width > 0 && d.width > 0 && d.left >= g.right - 2; });
    verifier(`${w} × ${h} : double page, posée sur le livre`, a.ecart < 3 && dbl, `${a.ecart.toFixed(1)} px`);
  }
  await p.setViewportSize({ width: 1194, height: 834 });
  const portes = await p.evaluate(() => { const v = window.PORTES_GRIMOIRE_VRAIES || {}; return ["verifierCle", "creerPartie", "verifierMdpPartie", "entrerDansPartie"].every(k => typeof v[k] === "function"); });
  verifier("app.js ouvre au grimoire les mêmes portes que les anciennes modales", portes);
  const index = lire("index.html");
  verifier("la page charge StPageFlip (vendor, MIT) puis le grimoire", /vendor\/page-flip\/page-flip\.browser\.js\?v=2\.0\.7/.test(index) && /grimoire\.js\?v=\d+/.test(index) && /grimoire\.css\?v=\d+/.test(index)
           && fs.existsSync(path.join(RACINE, "vendor/page-flip/LICENSE")) && Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]) >= 297);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
