// v502 — L'EXPÉDITION ET SON RETOUR : le récit ne compte que ses membres, le choix d'une place ou d'un suiveur en
// bulles animées, un bouton à l'aquarelle pour revenir au camp, le retour (le rapport de l'intendant d'abord, puis le
// camp, puis le conseil extraordinaire), un rapport sans chiffres, un clan toujours du côté des héros, l'annulation
// forcée d'une tâche (DEV).
// Lancer : node tests_monstres/corrections_v502.mjs
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

titre("1. LES RÈGLES (camp_pur.js)");
await section(async () => {
  const pr = CP.promptRapportIntendant({ numero: 2, jours: 5, intendant: "Ara", heros: ["Thorin"], journal: ["La chasse rapporte 4 provisions."], evenements: [], caisse: 0, provisions: 3, jauge: 35,
    moraux: [`Bors est ${CP.motMoral(75)}`], scenes: 1, presents: ["Ara", "Bors"] });
  verifier("le rapport de l'intendant : des mots (« de bonne humeur », « la caisse est vide »), aucun chiffre de jeu", /Bors est de bonne humeur/.test(pr) && /la caisse est vide/.test(pr) && /presque épuisés/.test(pr) && /AUCUN CHIFFRE/.test(pr)
    && !/75|\/100|drachmes dans la caisse|0 drachmes|3 provisions/.test(pr), pr.slice(pr.indexOf("L'état"), pr.indexOf("L'état") + 140));
  verifier("…les mots du moral, des vivres, de la caisse, des alentours", CP.motMoral(85) === "le cœur léger, joyeux" && CP.motMoral(5) === "au plus bas, à bout" && CP.motProvisions(0, 3) === "il ne reste plus rien à manger"
    && CP.motProvisions(100, 3) === "des réserves abondantes" && CP.motCaisse(500) === "la caisse est bien garnie" && /épuisés/.test(CP.motAlentours(20)));
  const r = CP.REGLE_CLAN_LOYAL(["Ara", "Thalia"]);
  verifier("le clan est du côté des héros : jamais un traître, un complice, un menteur (ni le conseil du clan)", /Ara, Thalia/.test(r) && /traître, un complice, un menteur/.test(r) && /ni du conseil du clan/.test(r) && /Les antagonistes viennent d'ailleurs/.test(r));
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


titre("2. LE CHOIX D'UNE PLACE : LES BULLES DES AVATARS, SUR UN VOILE NOIR LÉGER");
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_GROUPE.ouvrir()); await p.waitForTimeout(3000);
  const aq = await p.evaluate(() => { const b = document.querySelector('.page-expedition-gauche [data-gp="camp"]'); return b ? { texte: b.textContent.trim(), lavis: !!b.querySelector(".lavis"), cadre: !!b.querySelector(".cadre-main") } : null; });
  verifier("un bouton à l'aquarelle pour revenir au camp", aq && /Revenir au camp/.test(aq.texte) && aq.lavis && aq.cadre, JSON.stringify(aq));
  const camp = await p.evaluate(async () => { let n = 0; const o = window.CAMP_SCENE.ouvrir; window.CAMP_SCENE.ouvrir = () => { n++; return true; }; document.querySelector('.page-expedition-gauche [data-gp="camp"]').click(); window.CAMP_SCENE.ouvrir = o; return n; });
  verifier("…il ouvre le camp", camp === 1);
  await geste('[data-gp="monter"]'); await relayer(); await p.waitForTimeout(400);
  await geste('[data-gp="place"][data-i="0"]'); await p.waitForTimeout(500);
  const v = await p.evaluate(() => {
    const o = document.getElementById("choix-bulles-expedition");
    if (!o) return null;
    const bulles = [...o.querySelectorAll(".bulle-expedition")];
    return { visible: o.classList.contains("visible"), fond: getComputedStyle(o).backgroundColor, titre: o.querySelector(".titre-bulles-expedition").textContent,
             bulles: bulles.map(b => ({ id: b.dataset.id, nom: b.querySelector(".nom-bulle-expedition").textContent, metier: (b.querySelector(".profession-bulle-expedition") || {}).textContent || "", rond: !!b.querySelector(".rond-bulle-expedition"),
               delai: getComputedStyle(b).transitionDelay, camp: !!b.closest(".camp-place") })),
             dansLeLivre: !!document.querySelector(".page-expedition-gauche .choix-place-expedition") };
  });
  verifier("« Prendre cette place » : un voile noir léger, les bulles des avatars (plus d'encart dans le livre)", v && v.visible && /rgba\(0, 0, 0, 0\.3/.test(v.fond) && !v.dansLeLivre && v.titre === "Qui part ?", JSON.stringify(v && { fond: v.fond, titre: v.titre }));
  verifier("…ses aventuriers, leur nom et leur profession en dessous ; une apparition en cascade", v && v.bulles.some(x => x.id === "H1" && x.nom === "Thorin" && x.metier === "Protecteur" && x.rond) && v.bulles.filter(x => x.delai !== "0s").length >= 1 && !v.bulles.some(x => x.id === "H2"), JSON.stringify(v && v.bulles));
  await geste('#choix-bulles-expedition .bulle-expedition[data-id="H1"]'); await relayer(); await p.waitForTimeout(500);
  const d = await partie();
  verifier("toucher une bulle : il prend la place, les bulles s'en vont", ((d.Expedition.Emplacements || [])[0] || {}).Perso === "H1" && !(await p.evaluate(() => !!document.getElementById("choix-bulles-expedition"))), JSON.stringify(d.Expedition.Emplacements));
  // Le suiveur : pareil.
  await geste('[data-gp="ouvrir-suiveurs"]'); await p.waitForTimeout(500);
  const s = await p.evaluate(() => { const o = document.getElementById("choix-bulles-expedition"); return o ? { titre: o.querySelector(".titre-bulles-expedition").textContent, bulles: [...o.querySelectorAll(".bulle-expedition")].map(b => ({ id: b.dataset.id, nom: b.querySelector(".nom-bulle-expedition").textContent, detail: (b.querySelector(".profession-bulle-expedition") || {}).textContent || "" })) } : null; });
  verifier("« Emmener un suiveur » : les bulles aussi (son bonus sous son nom)", s && s.titre === "Qui suit l'expédition ?" && s.bulles.some(x => x.id === "PNJ_DEX" && x.nom === "Vif" && /provision|Dextérité|−1/.test(x.detail)), JSON.stringify(s));
  await p.evaluate(() => document.getElementById("choix-bulles-expedition").click()); await p.waitForTimeout(400);
  verifier("…toucher le voile ferme sans rien choisir", !(await p.evaluate(() => !!document.getElementById("choix-bulles-expedition"))) && !((await partie()).Expedition.Suiveurs || []).length);
  await geste('[data-gp="ouvrir-suiveurs"]'); await p.waitForTimeout(500);
  await geste('#choix-bulles-expedition .bulle-expedition[data-id="PNJ_DEX"]'); await relayer(); await p.waitForTimeout(400);
  verifier("…toucher une bulle : il suit l'expédition", ((await partie()).Expedition.Suiveurs || []).includes("PNJ_DEX"));
});

titre("3. EN EXPÉDITION, LE RÉCIT NE COMPTE QUE SES MEMBRES");
await section(async () => {
  await p.evaluate(() => window.CAMP.infosMembres());
  const r = await p.evaluate(() => {
    const d = window.__docs["Systeme_Parties/P1"];
    d.Expedition = { ...d.Expedition, En_Cours: true, Membres: ["H1", "PNJ_THEMES_P1", "PNJ_DEX"] };
    window.PARTIE_DATA = JSON.parse(JSON.stringify(d));
    window.PERSOS_JOUEURS_PARTIE.find(h => h.idPersonnage === "H2").actif = true;
    const heros = window.GROUPE.herosDeLaPartie().map(h => h.idPersonnage), ctx = window.EXPEDITION.contexteExpeditionMJ();
    return { heros, ctx };
  });
  verifier("les héros du récit : ceux de l'expédition (Thorin), pas Lyra restée au camp", JSON.stringify(r.heros) === '["H1"]', JSON.stringify(r.heros));
  verifier("le narrateur le sait : qui en est, qui est resté au camp (ne les fais pas apparaître)", /SEULS font partie de l'expédition : Thorin, Thémès, Vif/.test(r.ctx) && /Restés au camp \(ILS NE SONT PAS LÀ[^)]*\) : [^\n]*Lyra/.test(r.ctx) && /Sage/.test(r.ctx) && !/Restés au camp[^\n]*Thorin/.test(r.ctx), r.ctx);
  const ia = lire("ia_master.js");
  verifier("…dans le contexte du narrateur, ses fils invisibles et ce qui suit le tour", (ia.match(/enJeu\(/g) || []).length >= 3 && /contexteExpeditionMJ\(\)/.test(ia));
  const ct = await p.evaluate(() => window.CAMP.consignesThemes());
  verifier("le narrateur (Thémès) : le clan est du côté des héros, ses PNJ nommés", /LE CLAN EST DU CÔTÉ DES HÉROS/.test(ct) && /Vif/.test(ct) && /Ara/.test(ct) && !/Thorin/.test(ct.slice(ct.indexOf("LE CLAN"))), ct.slice(ct.indexOf("LE CLAN"), ct.indexOf("LE CLAN") + 160));
  const mg = lire("missions_guilde.js");
  verifier("les missions et leur plan aussi (plus d'intrigue où un PNJ du clan est mauvais)", /Rien d'anachronique, rien de farfelu ; pas de technologie moderne\.\$\{regleClan\(\)\}/.test(mg) && /avec ses secrets\.\$\{regleClan\(\)\}/.test(mg));
});

titre("4. LE RETOUR : LE RAPPORT D'ABORD, PUIS LE CAMP, PUIS LE CONSEIL EXTRAORDINAIRE");
await section(async () => {
  const r = await p.evaluate(async () => {
    let ouvert = false, ouvertures = 0;
    window.CAMP_SCENE.ouvert = () => ouvert;
    window.CAMP_SCENE.ouvrir = async () => { ouvertures++; ouvert = true; setTimeout(() => window.CONSEIL.veiller(), 0); return true; };
    const d = window.__docs["Systeme_Parties/P1"];
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(d)));          // l'expédition en cours, vue par ce poste
    delete d.Expedition;
    d.Camp.Dernier_Retour = { Numero: 1, Jours: 4, Membres: ["H1", "PNJ_THEMES_P1", "PNJ_DEX"] };
    d.Camp.Conseil_Extraordinaire = { Raison: "Plus de vivres", Le: Date.now() };
    d.Camp.Provisions = 0;
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(d)));          // le retour
    await new Promise(r => setTimeout(r, 600));
    const avantRapport = { ouvertures, conseil: !!window.__docs["Systeme_Parties/P1"].Conseil, vue: window.CONSEIL.ouverte() };
    d.Camp.Dernier_Rapport = { Expedition: 1, Intendant: "PNJ_ARA", Texte: "De retour au camp, Ara nous fait son rapport : « On a mangé maigre. »", Le: Date.now() };
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(d)));          // le rapport, dans le récit
    await new Promise(r => setTimeout(r, 3000));
    const pendantLecture = { ouvertures, conseil: !!window.__docs["Systeme_Parties/P1"].Conseil };
    return { avantRapport, pendantLecture, delai: window.EXPEDITION.delaiLecture(d.Camp.Dernier_Rapport.Texte) };
  });
  verifier("le groupe revient : ni camp, ni conseil extraordinaire tant que le rapport n'est pas là", r.avantRapport.ouvertures === 0 && !r.avantRapport.conseil && !r.avantRapport.vue, JSON.stringify(r.avantRapport));
  verifier("…le rapport dans le récit : le temps de le lire (9 s au moins), rien ne s'ouvre", r.pendantLecture.ouvertures === 0 && !r.pendantLecture.conseil && r.delai >= 9000, JSON.stringify(r));
  await p.waitForTimeout(Math.max(0, r.delai - 3000) + 1500);
  const f = await p.evaluate(() => ({ conseil: window.__docs["Systeme_Parties/P1"].Conseil || null, vue: window.CONSEIL.ouverte() }));
  verifier("…puis le camp s'ouvre tout seul, et le conseil extraordinaire s'y réunit", f.conseil && f.conseil.Extraordinaire && f.vue, JSON.stringify({ c: f.conseil && f.conseil.Extraordinaire, vue: f.vue }));
  await p.evaluate(() => window.CONSEIL.fermerVue());
});

titre("5. LA TÂCHE : ANNULER EN FORÇANT LE VOTE (DEV)");
await section(async () => {
  const gm = lire("grimoire_mission.js"), mg = lire("missions_guilde.js");
  verifier("pendant un vote d'abandon, en mode DEV : « Annuler (DEV : forcer le vote) », en rouge", /estDevMission\(\) \? `<button type="button" class="lien-dev forcer-abandon" data-mi="abandon-forcer">Annuler \(DEV : forcer le vote\)<\/button>`/.test(gm)
    && /\.forcer-abandon \{[^}]*color: #a3201a/.test(lire("grimoire_mission.css")));
  verifier("…il termine la tâche (abandonnée) sans attendre les votes, en mode DEV seulement", /export async function forcerAbandon\(\)[\s\S]{0,200}ivalis_DEV_MODE[\s\S]{0,200}terminerMission\("abandonnee"/.test(mg) && /voterAbandon, forcerAbandon,/.test(mg));
});

titre("6. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 502 ou plus", v >= 502 && JSON.parse(lire("version.json")).version >= 502, `${v}`);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
