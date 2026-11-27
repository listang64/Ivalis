// v506 — La peau verdâtre des Gobs (images, PNJ) ; les cerveaux des fils invisibles avec les membres du camp et les
// suiveurs ; le texte envoyé qui ne revient plus dans le post-it (la dictée) ; la magie, courante à Ivalis, pour les IA
// qui racontent ; une attaque délibérée d'un héros déclenche le combat (au camp aussi).
// Lancer : node tests_monstres/corrections_v506.mjs
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
  window.__docs["Systeme_Parties/P1/Presence/J2"] = { Le: Date.now() + 3600000, Joueur: "J2" };   // (v505) Lyra est connectée
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


titre("1. LES GOBS ONT LA PEAU VERDÂTRE");
await section(async () => {
  const r = await p.evaluate(() => ({ gob: window.traitsImposesRace("Gob"), gobs: window.traitsImposesRace("Gobs"), geant: window.traitsImposesRace("Gob géant"), humain: window.traitsImposesRace("Humain"),
    camp: window.CAMP_AVATARS.promptImageCamp("Zik", "réparer un seau", true, "Gob, bricoleur", window.traitsImposesRace("Gob")) }));
  verifier("un trait imposé pour les Gobs (et les Gobs géants) : peau verdâtre, jamais claire ; rien pour un humain", /TEINTES VERDÂTRES/.test(r.gob) && /JAMAIS une peau claire/.test(r.gob) && r.gobs === r.gob && r.geant === r.gob && r.humain === "", r.gob);
  verifier("…les images du camp : la règle de l'espèce passe devant l'image de référence", /RÈGLE DE L'ESPÈCE \(PRIORITAIRE SUR TOUT, MÊME SUR L'IMAGE DE RÉFÉRENCE\) : UN GOB A TOUJOURS LA PEAU/.test(r.camp));
  const ia = lire("ia_master.js"), ca = lire("camp_avatars.js");
  verifier("…le portrait d'un PNJ (prioritaire même sur sa description), et sa description par l'IA", /RÈGLE DE L'ESPÈCE \(PRIORITAIRE SUR TOUT, MÊME SUR LA DESCRIPTION\)/.test(ia) && /\(Rappel, prioritaire : /.test(ia)
    && (ia.match(/Un Gob a TOUJOURS la peau verdâtre/g) || []).length === 2 && /trait: typeof window\.traitsImposesRace === "function" \? window\.traitsImposesRace\(f\.Race\)/.test(ca) && /window\.traitsImposesRace\(h\.race\)/.test(ca));
});

titre("2. LA MAGIE EST COURANTE");
await section(async () => {
  const r = await p.evaluate(() => {
    const h = window.PERSOS_JOUEURS_PARTIE[0];
    return { regle: window.REGLE_MAGIE_IVALIS || "", conseil: window.CAMP.regles.promptConseil({ sujets: [] }), rapport: window.CAMP.regles.promptRapportIntendant({ jours: 2, intendant: "Ara", journal: [], presents: [] }),
             pnj: window.DISCUSSION.promptPnj({ nomPnj: "Ara", fiche: {}, heros: h, lignes: [] }, { souvenirs: [] }), prive: window.RP_PRIVE.promptMJ({ nomPnj: "Ara", fiche: {}, heros: h }, { souvenirs: [] }) };
  });
  verifier("la règle : la magie est normale, personne ne traite quelqu'un de sorcier ou de sorcière", /LA MAGIE EST COURANTE À IVALIS/.test(r.regle) && /sorcier ou de sorcière/.test(r.regle), r.regle.slice(0, 120));
  verifier("…le conseil, le rapport de l'intendant, les PNJ en privé, le moment à part la reçoivent", [r.conseil, r.rapport, r.pnj, r.prive].every(t => t.includes(r.regle)));
  const ia = lire("ia_master.js"), rec = lire("grimoire_recit.js"), cr = lire("combat_rp.js");
  verifier("…le narrateur (quel que soit son cerveau) et sa plume aussi ; plus de « la sorcière » comme insulte", /const magie = window\.REGLE_MAGIE_IVALIS/.test(ia) && /PROMPT_NARRATEUR_LITE \+ \(window\.REGLE_MAGIE_IVALIS/.test(rec) && !/« la sorcière »/.test(cr));
});

titre("3. LES CERVEAUX : LES MEMBRES DU CAMP ET LES SUIVEURS SONT DES ÂMES DE LA SCÈNE");
await section(async () => {
  const r = await p.evaluate(async () => {
    const auCamp = await window.CAMP.pnjsDuRecit();
    const d = window.__docs["Systeme_Parties/P1"];
    window.PARTIE_DATA = { ...JSON.parse(JSON.stringify(d)), Position_Groupe: { Region: 7, x: 0.95, y: 0.1 }, Expedition: { En_Cours: true, Membres: ["H1", "PNJ_THEMES_P1", "PNJ_DEX"], Suiveurs: ["PNJ_DEX"] } };
    window.appliquerCampDeLaPartie(window.PARTIE_DATA);
    const enExpe = await window.CAMP.pnjsDuRecit();
    window.PARTIE_DATA = JSON.parse(JSON.stringify(d)); window.appliquerCampDeLaPartie(window.PARTIE_DATA);
    return { auCamp: auCamp.map(x => x.id + ":" + x.fiche.Nom_PNJ + ":" + x.fiche.idDoc).sort(), enExpe: enExpe.map(x => x.id) };
  });
  verifier("au camp : ses membres PNJ présents (pas Thémès, pas les héros), avec leur fiche", JSON.stringify(r.auCamp) === '["PNJ_ARA:Ara:PNJ_ARA","PNJ_DEX:Vif:PNJ_DEX","PNJ_SAG:Sage:PNJ_SAG"]', JSON.stringify(r));
  verifier("…en expédition : ses suiveurs", JSON.stringify(r.enExpe) === '["PNJ_DEX"]', JSON.stringify(r.enExpe));
  const ia = lire("ia_master.js");
  verifier("…les fils invisibles les lisent, même sans PNJ de lieu (au camp, en pleine nature)", /\(lieuFinal \|\| nomsPnjPresents\.length \|\| duClan\.length\)/.test(ia) && /duClan\.forEach\(x => \{ if \(!vus\.has\(x\.id\)\) vus\.set\(x\.id, x\); \}\)/.test(ia));
});

titre("4. LE POST-IT : LE TEXTE ENVOYÉ N'Y REVIENT PLUS");
await section(async () => {
  const rec = lire("grimoire_recit.js"), cs = lire("conseil.js");
  verifier("le récit : une dictée arrêtée (l'envoi l'arrête) n'écrit plus ses derniers mots dans le papier vidé", /if \(!dictee\.voulue \|\| dictee\.reco !== reco\) return;/.test(rec) && /dictee\.reco = null;\s+\/\/ \(v506\)/.test(rec) && /if \(dictee\.reco !== reco\) return;/.test(rec));
  verifier("…le conseil aussi : envoyer, ou poser un post-it, arrête la dictée", /ev\.preventDefault\(\); if \(dictee\.voulue\) arreterDictee\(\);/.test(cs) && /quoi === "poser"\) \{\s+if \(dictee\.voulue\) arreterDictee\(\);/.test(cs) && /if \(!dictee\.voulue \|\| dictee\.reco !== reco\) return;/.test(cs));
  // Le vrai geste, au conseil : la dictée tourne, on envoie, sa dernière phrase arrive après coup.
  const r = await p.evaluate(async () => {
    let reco = null;
    window.SpeechRecognition = class { constructor() { reco = this; } start() {} stop() {} abort() {} };
    window.CONSEIL.envoyer = async () => "";
    await window.CONSEIL.ouvrir(); await new Promise(r => setTimeout(r, 400));
    const t = document.getElementById("texte-conseil"); t.value = "";
    document.querySelector('#saisie-conseil [data-cs="micro"]').click();
    reco.onresult({ results: [Object.assign([{ transcript: "Je propose une fête" }], { isFinal: false })] });
    const avant = t.value;
    document.getElementById("saisie-conseil").dispatchEvent(new Event("submit", { cancelable: true }));
    reco.onresult({ results: [Object.assign([{ transcript: "Je propose une fête" }], { isFinal: true })] });   // trop tard
    const apres = t.value;
    window.CONSEIL.fermerVue();
    return { avant, apres };
  });
  verifier("…vérifié : la phrase arrivée après l'envoi ne réécrit pas le champ", r.avant === "Je propose une fête" && r.apres === "", JSON.stringify(r));
});

titre("5. LE COMBAT : UNE ATTAQUE DÉLIBÉRÉE D'UN HÉROS");
await section(async () => {
  const r = await p.evaluate(async () => {
    window.cleGemini = () => "cle"; let corps = null;
    window.fetchGemini = async (u, c) => { corps = JSON.parse(c); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ combat: true, raison: "Thorin attaque Bors.", adversaires: "Bors" }) }] } }] }) }; };
    window.PARTIE_DATA = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"])); window.appliquerCampDeLaPartie(window.PARTIE_DATA);
    const ts = Date.now(), au = window.CAMP.auCamp();
    const annonce = await window.annoncerDetectionCombat(ts);
    await window.detecterCombatRP({ ts, texteMJ: "Thorin se jette sur Bors pour tenter de le frapper.", messages: [{ Auteur_Nom: "Thorin", Texte: "J'attaque Bors." }] });
    return { au, annonce, sys: corps && corps.systemInstruction.parts[0].text, txt: corps && corps.contents[0].parts[0].text, etat: (window.__docs["Systeme_Parties/P1"].Combat_RP || {}).Etat };
  });
  verifier("au camp, la détection s'annonce ; MIA_COMBAT sait qu'au camp seule une attaque délibérée d'un héros compte", r.au && r.annonce === true && /LA SCÈNE SE PASSE AU CAMP DU CLAN/.test(r.txt || ""), JSON.stringify({ au: r.au, annonce: r.annonce }));
  verifier("…« tenter de frapper » est une attaque portée (le livre raconte toujours une tentative) : un combat", /une attaque PORTÉE, pas une intention/.test(r.sys || "") && r.etat && r.etat !== "aucun", r.etat);
  verifier("…le narrateur au camp ne l'empêche plus", /si un héros attaque délibérément quelqu'un, ne l'en empêche pas/.test(await p.evaluate(() => window.CAMP.contexteMJ())));
});

titre("6. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 506 ou plus", v >= 506 && JSON.parse(lire("version.json")).version >= 506, `${v}`);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
