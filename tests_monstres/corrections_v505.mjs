// v505 — Les bannières (l'aquarelle tout du long ; pas de rouge pour une attaque restée au premier cran), la gestion
// (le tampon lisible, le défilement gardé, les encarts centrés), les têtes dans les ronds, les quotas du conseil (3 PNJ,
// 2 joueurs), le genre des héros dans la plume, le narrateur lancé par les seuls joueurs connectés, les habitants du camp
// pour le narrateur, l'expédition en solo (les héros des compagnons absents) et le groupe de l'expédition.
// Lancer : node tests_monstres/corrections_v505.mjs
// Lancer : node tests_monstres/corrections_v483.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(76)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const titre = (t) => console.log("\n" + t);
const section = async (corps) => { try { await corps(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 160)); } };
const lire = (f) => { try { return fs.readFileSync(path.join(RACINE, f), 'utf-8'); } catch (e) { return ""; } };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' }); res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({}); export const getApp = () => ({});`;
// Firestore en mémoire : les écritures (setDoc, updateDoc aux chemins pointés,
// deleteField, les lots, les transactions) changent window.__docs, et toute
// écriture de la partie revient au jeu comme l'écoute la lui donnerait.
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, ...c) => ({ col: c.join("/") });
  const SUPPR = { __supprimer: true };
  const docs = () => (window.__docs = window.__docs || {});
  const cloner = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const estMap = (v) => v && typeof v === "object" && !Array.isArray(v) && !v.__supprimer;
  function fusionner(cible, src) {
    Object.entries(src).forEach(([k, v]) => {
      if (v && v.__supprimer) { delete cible[k]; return; }
      if (estMap(v)) { if (!estMap(cible[k])) cible[k] = {}; fusionner(cible[k], v); return; }
      cible[k] = cloner(v);
    });
  }
  function nettoyer(v) { if (estMap(v)) { Object.keys(v).forEach(k => { if (v[k] && v[k].__supprimer) delete v[k]; else nettoyer(v[k]); }); } return v; }
  function ecrire(chemin, data, mode) {
    const d = docs();
    if (mode === "set") d[chemin] = nettoyer(cloner(Object.fromEntries(Object.entries(data).filter(([k, v]) => !(v && v.__supprimer)))));
    else if (mode === "merge") { d[chemin] = d[chemin] || {}; fusionner(d[chemin], data); }
    else if (mode === "update") {
      if (!d[chemin]) throw new Error("document absent : " + chemin);
      Object.entries(data).forEach(([cle, v]) => {
        const parts = cle.split("."); let o = d[chemin];
        for (let i = 0; i < parts.length - 1; i++) { if (!estMap(o[parts[i]])) o[parts[i]] = {}; o = o[parts[i]]; }
        const f = parts[parts.length - 1];
        if (v && v.__supprimer) delete o[f]; else o[f] = nettoyer(cloner(v));
      });
    }
    (window.__journal = window.__journal || []).push({ chemin, mode, data: JSON.parse(JSON.stringify(data, (k, v) => v && v.__supprimer ? "<supprimé>" : v)) });
    if (chemin.startsWith("Systeme_Parties/") && chemin.split("/").length === 2 && window.__relaisPartie && typeof window.appliquerVoyageDeLaPartie === "function") {
      const copie = cloner(d[chemin]);
      setTimeout(() => window.appliquerVoyageDeLaPartie(copie), 0);
    }
  }
  export const getDoc = async (ref) => { const d = docs()[ref.chemin]; return { exists: () => !!d, data: () => cloner(d || {}) }; };
  export const query = (c, ...contraintes) => ({ col: c.col, contraintes });
  export const where = (champ, op, valeur) => ({ type: "where", champ, op, valeur });
  export const orderBy = (champ) => ({ type: "orderBy", champ }); export const limit = (n) => ({ type: "limit", n });
  export const getDocs = async (q) => {
    const col = q.col; const w = (q.contraintes || []).filter(c => c && c.type === "where");
    const liste = Object.entries(docs()).filter(([k]) => k.startsWith(col + "/") && k.split("/").length === col.split("/").length + 1)
      .filter(([, v]) => w.every(c => c.op === "==" ? v[c.champ] === c.valeur : c.op === "in" ? c.valeur.includes(v[c.champ]) : true))
      .map(([k, v]) => ({ id: k.split("/").pop(), ref: { chemin: k }, data: () => cloner(v) }))
      .sort((a, b) => (a.data().Timestamp || 0) - (b.data().Timestamp || 0));
    return { forEach: (f) => liste.forEach(f), docs: liste, empty: liste.length === 0, size: liste.length };
  };
  export const setDoc = async (ref, data, options) => { ecrire(ref.chemin, data, options && options.merge ? "merge" : "set"); (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data: JSON.parse(JSON.stringify(data)), options }); };
  export const updateDoc = async (ref, data) => { ecrire(ref.chemin, data, "update"); (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data: JSON.parse(JSON.stringify(data, (k, v) => v && v.__supprimer ? "<supprimé>" : v)) }); };
  export const deleteDoc = async (ref) => { delete docs()[ref.chemin]; (window.__suppressions = window.__suppressions || []).push(ref.chemin); };
  let n = 0;
  export const addDoc = async (c, data) => { const id = "m" + (++n) + "_" + Date.now(); docs()[c.col + "/" + id] = cloner(data); (window.__ajouts = window.__ajouts || []).push({ col: c.col, id, data: cloner(data) }); return { id }; };
  export const deleteField = () => SUPPR; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (k) => k; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const writeBatch = () => { const ops = []; return { set(r, d, o){ ops.push(() => ecrire(r.chemin, d, o && o.merge ? "merge" : "set")); }, update(r, d){ ops.push(() => ecrire(r.chemin, d, "update")); },
    delete(r){ ops.push(() => { delete docs()[r.chemin]; (window.__suppressions = window.__suppressions || []).push(r.chemin); }); }, commit: async () => { ops.forEach(f => f()); } }; };
  export const runTransaction = async (_d, fn) => {
    window.__transactions = (window.__transactions || 0) + 1;
    const ops = [];
    const tx = { get: async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => cloner(d || {}) }; },
                 update(r, d) { ops.push(() => ecrire(r.chemin, d, "update")); return tx; },
                 set(r, d, o) { ops.push(() => ecrire(r.chemin, d, o && o.merge ? "merge" : "set")); return tx; } };
    const res = await fn(tx);
    ops.forEach(f => f());
    return res;
  };
  export const Timestamp = { now: () => Date.now() };
`;




const CP = await import(path.join(RACINE, 'camp_pur.js'));

titre("1. LES RÈGLES");
await section(async () => {
  const c = CP.conseilVide("C1");
  const J = (id) => ({ id, nom: id, type: "joueur" }), N = (id) => ({ id, nom: id, type: "pnj" });
  const poser = (par) => { const r = CP.peutProposer(c, par); if (!r) c.Sujets.push(CP.nouveauSujet(c, { titre: "x", type: "autre", par })); return r; };
  const r = [poser(N("A")), poser(N("B")), poser(J("J1")), poser(N("C")), poser(J("J1")), poser(J("J2")), poser(J("J3")), poser(N("D"))];
  verifier("le conseil : 3 places pour les PNJ (à la suite, possible), 2 pour les joueurs", r[0] === "" && r[1] === "" && r[2] === "" && r[3] === "" && /déjà proposé/.test(r[4]) && r[5] === "" && /Le conseil a déjà ses 5 sujets/.test(r[6]) && /5 sujets/.test(r[7]) && c.Sujets.length === 5, JSON.stringify(r));
  const c2 = CP.conseilVide("C2"); c2.Sujets.push(CP.nouveauSujet(c2, { titre: "x", par: N("A") }));
  verifier("…un même PNJ ne propose qu'un sujet ; la 4e idée de PNJ attend", /déjà proposé/.test(CP.peutProposer(c2, N("A"))) && (() => { ["B", "C"].forEach(x => c2.Sujets.push(CP.nouveauSujet(c2, { titre: "x", par: N(x) }))); return /3 places des PNJ/.test(CP.peutProposer(c2, N("D"))); })());
  verifier("…la consigne de l'IA : un seul à la fois, selon le RP", /si le RP l'amène/.test(CP.promptConseil({ sujets: [] })) && /jamais deux dans la même réponse/.test(CP.promptConseil({ sujets: [] })));
});
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);
const cliquer = (sel) => p.evaluate((sel) => document.querySelector(sel).click(), sel);
await p.evaluate(() => {
  localStorage.setItem("ID_JOUEUR_COURANT", "J1"); localStorage.setItem("ivalis_DEV_MODE", "on");
  window.jouerSonClic = () => {}; window.__alertes = []; window.alert = (t) => window.__alertes.push(t); window.confirm = () => true;
  window.COMPTE_JOUEUR = { nom: "Ben", email: "ben@ivalis.fr", admin: false };
  window.LISTE_PARTIES_CACHE = [{ id: "P1", nom: "Les Lames d'Héra" }];
  window.PERSOS_JOUEURS_PARTIE = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", classe: "Protecteur", niveau: 3, creeLe: 1, actif: true },
    { idPersonnage: "H1B", idJoueur: "J1", prenom: "Bran", classe: "Pisteur", niveau: 1, creeLe: 2, actif: false },
    { idPersonnage: "H2", idJoueur: "J2", prenom: "Lyra", classe: "Pisteur", niveau: 2, creeLe: 1, actif: true }];
  window.PERSOS_PARTIE = window.PERSOS_JOUEURS_PARTIE.filter(h => h.actif);
  window.__bascules = []; window.basculerActivationPersonnage = async (id, actif) => { window.__bascules.push([id, actif]); const h = window.PERSOS_JOUEURS_PARTIE.find(x => x.idPersonnage === id); if (h) h.actif = actif; };
  window.CARACS_PARTIE = { H1: { force: 14, sag: 10 }, H1B: { dex: 12 }, H2: { dex: 15 } };
  window.__docs = window.__docs || {};
  window.__docs["Monde_PNJ/PNJ_THEMES_P1"] = { Nom_PNJ: "Thémès", Narrateur: true };
  window.__docs["Monde_PNJ/PNJ_DEX"] = { Nom_PNJ: "Vif", Caracs: { dex: 15 } };
  window.__docs["Monde_PNJ/PNJ_SAG"] = { Nom_PNJ: "Sage", Caracs: { sag: 14 } };
  window.__docs["Monde_PNJ/PNJ_ARA"] = { Nom_PNJ: "Ara", Caracs: { int: 12 } };
  window.__docs["Date_En_Jeu/actuelle"] = { Jour: "20", Annee: "3" };
  window.__docs["Systeme_Parties/P1"] = { Position_Groupe: { Region: 7, x: 0.5, y: 0.5 }, Heros_Principaux: { J1: "H1" },
    Camp: { Position: { Region: 7, x: 0.5, y: 0.5 }, Caisse: 40, Provisions: 30, Ressources: { Jauge: 90 }, Intendant: null, Prochaine_Expedition: 1,
      Membres: { PNJ_THEMES_P1: { Type: "pnj", Nom: "Thémès", Narrateur: true, Moral: 60 }, H1: { Type: "heros", Joueur: "J1", Moral: 60 }, H1B: { Type: "heros", Joueur: "J1", Moral: 60 },
                 H2: { Type: "heros", Joueur: "J2", Moral: 60 }, PNJ_DEX: { Type: "pnj", Tache: "chasser", Moral: 60 }, PNJ_SAG: { Type: "pnj", Tache: "cueillir", Moral: 60 }, PNJ_ARA: { Type: "pnj", Tache: "cueillir", Moral: 60 } } } };
  window.PORTES_GRIMOIRE = { verifierCle: async () => true, creerPartie: async () => "P_NEUVE", verifierMdpPartie: async (id, m) => ({ ok: m === "sel" }),
    entrerDansPartie: (id) => { window.ID_PARTIE_COURANTE = id; document.getElementById("ecran-jeu").style.display = "block"; } };
  // L'écoute de la partie (app.js) : ici le camp et l'expédition seulement (pas le dessin du voyage).
  window.appliquerVoyageDeLaPartie = (d) => { window.PARTIE_DATA = d; window.appliquerCampDeLaPartie(d); };
  window.__relaisPartie = true;
  window.PARTIE_DATA = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]));
  window.appliquerCampDeLaPartie(window.PARTIE_DATA);
  window.positionGroupeBrute = () => (window.PARTIE_DATA || {}).Position_Groupe || null;
  window.__archives = []; window.nettoyerChatVoyage = async (o) => { window.__archives.push(o); return true; };
  window.__retours = []; window.addEventListener("ivalis-retour-expedition", (e) => window.__retours.push(e.detail));
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== "ecran-grimoire") e.style.display = "none"; });
  window.afficherGrimoire();
});
await p.waitForTimeout(1300);
await p.evaluate(() => window.ouvrirGrimoire());
await p.waitForTimeout(1200);
await cliquer("#grimoire-btn-charger"); await p.waitForTimeout(700);
await cliquer('#grimoire-liste-parties [data-id="P1"]'); await p.waitForTimeout(150);
await p.fill("#grimoire-mdp-partie", "sel");
await cliquer("#grimoire-valider-partie");
await p.waitForTimeout(1800);
await p.evaluate(() => { window.ID_PARTIE_COURANTE = "P1"; });
const partie = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"])));
const relayer = () => p.evaluate(() => window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))));
const geste = async (sel) => { await p.evaluate((sel) => document.querySelector(sel).click(), sel); await p.waitForTimeout(500); };


titre("2. LES BANNIÈRES DES COMPÉTENCES");
await section(async () => {
  const t = await p.evaluate(() => {
    const T = window.GRIMOIRE_FICHES.typesDeCompetence;
    const att = (count) => ({ Effets_Compiles: [{ nom: "Attaque", desc: "6 dégâts physiques", isMod: false }, { nom: "Saignement", desc: "…", isMod: true }], Composants: { actions: [{ baseEffetId: "E1", count }] } });
    return { un: T(att(1)), trois: T(att(3)), ancien: T({ Effets_Compiles: [{ nom: "Attaque", desc: "6 dégâts physiques" }] }),
             mixte: T({ Effets_Compiles: [{ nom: "Attaque", desc: "6 dégâts physiques", isMod: false }, { nom: "Soin", desc: "4 PV", isMod: false }], Composants: { actions: [{ count: 1 }, { count: 1 }] } }) };
  });
  verifier("une attaque restée au premier cran (dégâts pas montés) : pas de tache rouge ; montée : rouge", t.un.length === 0 && JSON.stringify(t.trois) === '["physique"]' && JSON.stringify(t.ancien) === '["physique"]' && JSON.stringify(t.mixte) === '["soin"]', JSON.stringify(t));
  const b = await p.evaluate(async () => {
    window.CACHE_COMPETENCES_GLOBAL = { H1: { C1: { Nom: "Coup d'estoc", Initiative: 7, Effets_Compiles: [{ nom: "Attaque", desc: "12 dégâts physiques" }] } } };
    window.GRIMOIRE_FICHES.ouvrir("H1", "onglet-competences"); await new Promise(r => setTimeout(r, 2500));
    const ban = document.querySelector('#grimoire-fiches-comp-g .banniere-livre[data-id="C1"]');
    const a = ban.querySelector(".aquarelle-banniere").getBoundingClientRect(), m = ban.querySelector(".medaillon-banniere").getBoundingClientRect(), rb = ban.getBoundingClientRect();
    return { gauche: a.left - m.left, largeurMed: m.width, droite: rb.right - a.right, largeur: a.width / rb.width };
  });
  verifier("l'aquarelle tout le long de la bannière, sauf le médaillon de l'initiative", b.gauche >= b.largeurMed * 0.9 && b.droite < 10 && b.largeur > 0.75, JSON.stringify(b));
});

titre("3. LA GESTION DU CAMP");
await section(async () => {
  await p.evaluate(() => { window.CAMP_SCENE.ouvert = () => false; window.GESTION_CAMP.ouvrir(); }); await p.waitForTimeout(3000);
  await p.evaluate(() => window.GESTION_CAMP.lireInfos(true)); await p.waitForTimeout(600);
  const g = await p.evaluate(async () => {
    const d = document.querySelector(".page-gestion-droite.defile-fiche");
    d.style.maxHeight = "200px"; d.scrollTop = 120; const avant = d.scrollTop;
    window.GESTION_CAMP.agir(document.querySelector('.membre-gestion[data-membre="PNJ_ARA"] [data-gc="ouvrir-choix"]')); await new Promise(r => setTimeout(r, 100));
    const apres = document.querySelector(".page-gestion-droite.defile-fiche");
    const r = { avant, apres: apres.scrollTop, meme: apres !== d };
    window.GESTION_CAMP.agir(document.querySelector('.membre-gestion[data-membre="PNJ_ARA"] [data-gc="ouvrir-choix"]'));
    const enc = document.querySelector(".encart-gestion");
    r.centre = getComputedStyle(enc).textAlign + "/" + getComputedStyle(enc).alignItems;
    const img = document.querySelector(".portrait-gestion img"); r.tete = img ? getComputedStyle(img).objectPosition : "(pas d'image)";
    return r;
  });
  verifier("ouvrir un menu (redessine la page) : la page reste où elle était", g.avant > 0 && Math.abs(g.apres - g.avant) <= 1, JSON.stringify(g));
  verifier("les ressources alentour et le bilan du jour : centrés", g.centre === "center/center", g.centre);
  const css = lire("grimoire_gestion.css") + lire("conseil.css") + lire("grimoire_groupe.css") + lire("rp_prive.css");
  verifier("le tampon « En Expédition » : un fond légèrement assombri derrière le mot", /\.tampon-expedition \{[^}]*background: rgba\(40, 20, 8, 0\.28\)/.test(lire("grimoire_gestion.css")));
  verifier("les avatars dans leurs ronds : un peu plus bas (les têtes centrées), partout", (css.match(/object-position: 50% 3%/g) || []).length >= 4 && !/portrait-gestion img \{[^}]*15%/.test(css));
});

titre("4. LE NARRATEUR : LE GENRE, LES JOUEURS CONNECTÉS, LES HABITANTS DU CAMP");
await section(async () => {
  const r = await p.evaluate(() => ({ f: ["Femelle", "Féminine", "femme", "F"].map(window.estGenreFeminin), m: ["Male", "Mâle", "Masculin", "Homme"].map(window.estGenreFeminin),
    seul: window.GRIMOIRE_RECIT.attendusConnectes(["J1", "J2"], new Set(["J1"]), "J1"), deux: window.GRIMOIRE_RECIT.attendusConnectes(["J1", "J2"], new Set(["J1", "J2"]), "J1"),
    inconnu: window.GRIMOIRE_RECIT.attendusConnectes(["J1", "J2"], null, "J1") }));
  verifier("le genre féminin reconnu sous toutes ses formes (« Féminine » aussi)", r.f.every(Boolean) && !r.m.some(Boolean), JSON.stringify(r));
  verifier("lancer le narrateur : seuls les joueurs connectés sont attendus (seul : il part)", JSON.stringify(r.seul) === '["J1"]' && JSON.stringify(r.deux) === '["J1","J2"]' && JSON.stringify(r.inconnu) === '["J1","J2"]', JSON.stringify(r));
  const rec = lire("grimoire_recit.js");
  verifier("la plume : le genre de chaque héros du groupe, et la consigne d'accorder celui qui écrit", /LES HÉROS DU GROUPE \(accorde chacun selon son genre\)/.test(rec) && /ACCORDE \$\{String\(heros\.prenom/.test(rec));
  const h = await p.evaluate(async () => { await window.CAMP.infosMembres(); return window.CAMP.habitantsDuCamp(); });
  verifier("le narrateur au camp : la liste de ses SEULS habitants (pas d'artisans inventés)", /LES MEMBRES DU CLAN AU CAMP \(ce sont les SEULS habitants/.test(h) && /- Vif/.test(h) && /- Sage/.test(h) && /- Ara/.test(h) && /- Thorin \(héros, Protecteur\)/.test(h) && /chasse/.test(h), h);
});

titre("5. L'EXPÉDITION EN SOLO : LES HÉROS DES COMPAGNONS ABSENTS");
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_GROUPE.ouvrir()); await p.waitForTimeout(3000);
  await geste('[data-gp="monter"]'); await relayer(); await p.waitForTimeout(400);
  await geste('[data-gp="place"][data-i="0"]'); await p.waitForTimeout(400);
  await geste('#choix-bulles-expedition .bulle-expedition[data-id="H1"]'); await relayer(); await p.waitForTimeout(500);
  const v = await p.evaluate(async () => {
    const bouton = document.querySelector('[data-gp="place"][data-i="1"]'); const texte = bouton ? bouton.textContent.replace(/\s+/g, " ").trim() : ""; const actif = bouton && !bouton.disabled;
    if (bouton) bouton.click(); await new Promise(r => setTimeout(r, 700));
    const o = document.getElementById("choix-bulles-expedition");
    return { texte, actif, groupes: o ? [...o.querySelectorAll(".sous-titre-bulles-expedition")].map(x => x.textContent) : [], ids: o ? [...o.querySelectorAll(".bulle-expedition")].map(x => x.dataset.id) : [] };
  });
  verifier("sa place prise, il peut encore emmener un compagnon absent (Lyra, joueuse absente)", v.actif && /compagnon absent/.test(v.texte) && v.groupes.includes("Les personnages de tes compagnons absents") && JSON.stringify(v.ids) === '["H2"]', JSON.stringify(v));
  await geste('#choix-bulles-expedition .bulle-expedition[data-id="H2"]'); await relayer(); await p.waitForTimeout(500);
  const d = await partie();
  const pl = (d.Expedition.Emplacements || [])[1] || {};
  verifier("…Lyra part : la place reste à sa joueuse, menée par celui qui l'a emmenée", pl.Perso === "H2" && pl.Joueur === "J2" && pl.Par === "J1", JSON.stringify(pl));
  const laisser = await p.evaluate(() => !!document.querySelector('[data-gp="quitter-place"][data-i="1"]'));
  verifier("…il peut aussi la laisser", laisser);
  await geste('[data-gp="ouvrir-suiveurs"]'); await p.waitForTimeout(400);
  await geste('#choix-bulles-expedition .bulle-expedition[data-id="PNJ_DEX"]'); await relayer(); await p.waitForTimeout(400);
  const ctx = await p.evaluate(() => {
    const x = window.__docs["Systeme_Parties/P1"]; x.Expedition = { ...x.Expedition, En_Cours: true, Membres: ["H1", "H2", "PNJ_THEMES_P1", "PNJ_DEX"] };
    window.PARTIE_DATA = JSON.parse(JSON.stringify(x));
    return { heros: window.GROUPE.herosDeLaPartie().map(h => h.idPersonnage).sort(), ctx: window.EXPEDITION.contexteExpeditionMJ() };
  });
  verifier("le récit compte Lyra (emmenée), et le narrateur s'appuie sur tout le groupe : héros, Thémès, suiveurs", JSON.stringify(ctx.heros) === '["H1","H2"]' && /LE GROUPE DE L'EXPÉDITION \(ils sont TOUS là/.test(ctx.ctx)
    && /- Thorin \(héros, Protecteur/.test(ctx.ctx) && /- Lyra \(héros, Pisteur/.test(ctx.ctx) && /- Vif \(suiveur/.test(ctx.ctx) && /les suiveurs aussi/.test(ctx.ctx), ctx.ctx);
});

titre("6. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 505 ou plus", v >= 505 && JSON.parse(lire("version.json")).version >= 505, `${v}`);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
