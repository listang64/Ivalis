// v486 — LE CLAN NOMADE, ÉTAPE 10 : LA TÂCHE EN COURS.
// Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md) : « Renommer l'onglet « Mission » en « Tâche en cours ».
// Détection, dans le RP, qu'une nouvelle tâche commence (ou création après un conseil) ; création avec le créateur de
// missions existant ; une seule tâche active ; détail caché aux joueurs. Récompenses versées à la caisse du groupe
// (normale 40–80 drachmes et 10–20 provisions, difficile 100–200 et 20–40). Les événements du camp (fête…) sont des
// tâches à part entière, avec leurs étapes en RP, et rapportent de l'XP et du moral. Lieu repéré par l'éclaireur : si
// le conseil vote pour aller voir, créer la tâche avec le lieu sur la carte. » « Quand l'expédition revient au camp, on
// a la possibilité d'annuler la tâche en cours. »
// Lancer : node tests_monstres/corrections_v486.mjs
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

// =========================================================================
titre("1. LES RÈGLES DE LA TÂCHE (camp_pur.js)");
// =========================================================================
await section(async () => {
  const n = [], d = [];
  for (let k = 0; k < 200; k++) { n.push(CP.recompenseTache("normale", "mission")); d.push(CP.recompenseTache("difficile", "mission")); }
  verifier("une tâche normale : 40 à 80 drachmes, 10 à 20 provisions (pour la caisse du groupe)", n.every(r => r.Drachmes >= 40 && r.Drachmes <= 80 && r.Provisions >= 10 && r.Provisions <= 20)
    && n.some(r => r.Drachmes === 40) && n.some(r => r.Drachmes === 80));
  verifier("une tâche difficile : 100 à 200 drachmes, 20 à 40 provisions", d.every(r => r.Drachmes >= 100 && r.Drachmes <= 200 && r.Provisions >= 20 && r.Provisions <= 40));
  const f = CP.recompenseTache("normale", "fete");
  verifier("une fête : de l'XP et +10 de moral pour le groupe", f.Xp > 0 && f.Moral === 10 && !f.Drachmes);
  verifier("les récompenses dites en clair", CP.texteRecompense({ Drachmes: 60, Provisions: 15 }).join(" ; ") === "60 drachmes pour la caisse du groupe ; 15 provisions pour le camp");
  const t = CP.tacheDuSujet({ Titre: "Organiser une fête", Resume: "Le clan a besoin de souffler.", Type: "fete" }, { maintenant: 5, region: 7, regionNom: "Forêt" });
  verifier("une tâche tirée d'un sujet du conseil : commanditée par le conseil ; la fête, en étapes à accomplir en RP, au camp",
    t.Commanditaire === "Le conseil du clan" && /de quoi décorer/.test(t.Objectif) && /un prêtre/.test(t.Objectif) && t.Lieu.Type === "camp" && t.Type_Tache === "fete" && t.Region === 7);
  verifier("déplacer le camp, recruter : la tâche passe par son bouton", !!CP.TACHES_A_BOUTON.deplacer && !!CP.TACHES_A_BOUTON.recruter && !CP.TACHES_A_BOUTON.fete);
  const pr = CP.promptDetectionTache("Le prêtre vous tend la clé : « Ramenez-moi l'idole. » Thorin acquiesce.", ["Thorin : J'accepte."]);
  verifier("MIA_TACHE : les héros viennent-ils d'accepter une tâche (pas seulement d'en entendre parler) ?", /MIA_TACHE/.test(pr) && /ACCEPTER clairement/.test(pr) && /pas seulement d'en entendre parler/.test(pr) && /Thorin : J'accepte/.test(pr));
  verifier("…sa réponse relue : non, rien ; oui, la tâche (difficulté normale par défaut)", CP.lireDetectionTache('{"nouvelle":false}') === null && CP.lireDetectionTache("n'importe quoi") === null
    && CP.lireDetectionTache('{"nouvelle":true,"titre":"L\'idole volée","resume":"r","commanditaire":"Le prêtre","objectif":"o"}').difficulte === "normale");
  const camp = { Position: { Region: 7, x: 0.5, y: 0.5 } };
  const places = Array.from({ length: 50 }, () => CP.placePresDuCamp(camp));
  verifier("le lieu repéré par l'éclaireur : sur la carte, tout près du camp (même région)", places.every(q => q.Region === 7 && Math.hypot(q.x - 0.5, q.y - 0.5) >= 0.079 && Math.hypot(q.x - 0.5, q.y - 0.5) <= 0.201));
});

// =========================================================================
//  LA PAGE
// =========================================================================
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);
await p.evaluate(() => {
  window.jouerSonClic = () => {}; window.jouerSonEvenement = () => {};
  localStorage.setItem("ID_JOUEUR_COURANT", "J1");
  window.__docs = window.__docs || {}; window.ID_PARTIE_COURANTE = "P1";
  window.CARTES_REGIONALES = { 7: { nom: "La Forêt des Murmures" } };
  window.PERSOS_JOUEURS_PARTIE = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", actif: true, creeLe: 1 }];
  window.__docs["Personnages/H1"] = { Prenom: "Thorin", XP: 0 };
  window.__docs["Systeme_Parties/P1"] = { Position_Groupe: { Region: 7, x: 0.5, y: 0.5 },
    Camp: { Position: { Region: 7, x: 0.5, y: 0.5 }, Caisse: 40, Provisions: 10, Membres: { PNJ_THEMES_P1: { Narrateur: true, Moral: 60 }, H1: { Type: "heros", Moral: 60 }, PNJ_ARA: { Type: "pnj", Moral: 60 } } } };
  window.appliquerVoyageDeLaPartie = (d) => { window.PARTIE_DATA = d; window.appliquerCampDeLaPartie(d); if (window.appliquerMissionDeLaPartie) window.appliquerMissionDeLaPartie(d); };
  window.__relaisPartie = true;
  window.PARTIE_DATA = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]));
  window.appliquerCampDeLaPartie(window.PARTIE_DATA);
  window.cleGemini = () => "cle"; window.__prompts = [];
  window.fetchGemini = async (usage, corps) => {
    const c = JSON.parse(corps), texte = ((c.systemInstruction || {}).parts || [{}])[0].text || c.contents[0].parts[0].text;
    window.__prompts.push(texte);
    let rep = "{}";
    if (/MIA_MISSIONS/.test(texte)) rep = JSON.stringify([{ difficulte: "normale", titre: "Un titre inventé", resume: "Un résumé.", region: 7, commanditaire: "Quelqu'un", details: "Des détails.", objectif: "Un objectif.", lettre: "Une lettre.",
      lieu: { id_existant: null, nom: "La clairière", type: "clairière", description: "Une clairière." } }]);
    if (/MIA_TACHE/.test(texte)) rep = JSON.stringify(window.__detection || { nouvelle: false });
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: rep }] } }] }) };
  };
});
const partie = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"])));
const fiche = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1/Guilde/Mission"] || null)));

titre("2. LE CONSEIL A VOTÉ : LA TÂCHE EN COURS");
await section(async () => {
  const m = await p.evaluate(async () => window.TACHE_EN_COURS.depuisConseil({ Id: "S2", Type: "fete", Titre: "Organiser une fête", Resume: "Le clan a besoin de souffler." }));
  await p.waitForTimeout(400);
  const d = await partie(), f = await fiche(), pr = await p.evaluate(() => window.__prompts.find(t => /MIA_MISSIONS/.test(t)) || "");
  verifier("la tâche est écrite par le créateur de missions, d'après le sujet du conseil", /LA MISSION À ÉCRIRE/.test(pr) && /Organiser une fête/.test(pr) && /un prêtre/.test(pr), pr.slice(0, 80));
  verifier("…elle devient la tâche en cours (son titre, le conseil pour commanditaire, au camp)", d.Mission_En_Cours && d.Mission_En_Cours.Titre === "Organiser une fête" && f && f.Mission.Commanditaire === "Le conseil du clan"
    && f.Mission.Lieu.Nom === "Le camp du clan" && f.Lieu_Position.x === 0.5 && f.Lieu_Position.Region === 7, JSON.stringify(f && f.Mission).slice(0, 200));
  verifier("…ses récompenses fixées à la création (une fête : XP et moral)", f.Mission.Recompense && f.Mission.Recompense.Moral === 10 && f.Mission.Recompense.Xp > 0 && f.Mission.Type_Tache === "fete");
  const m2 = await p.evaluate(async () => window.TACHE_EN_COURS.depuisConseil({ Id: "S1", Type: "lieu", Titre: "Aller voir le lieu repéré", Resume: "Vif a repéré un lieu." }));
  await p.waitForTimeout(400);
  const d2 = await partie(), f2 = await fiche(), fin = await p.evaluate(() => Object.entries(window.__docs).filter(([k]) => k.includes("/Missions_Terminees/")).map(([, v]) => v));
  verifier("une tâche votée remplace la tâche en cours (la fête, rangée « remplacée »)", d2.Mission_En_Cours.Titre === "Aller voir le lieu repéré" && fin.length === 1 && fin[0].Statut === "remplacee" && fin[0].Mission.Titre === "Organiser une fête");
  verifier("…le lieu repéré : sur la carte, près du camp ; ses récompenses en drachmes et provisions", f2.Lieu_Position.Region === 7 && Math.hypot(f2.Lieu_Position.x - 0.5, f2.Lieu_Position.y - 0.5) > 0.07
    && f2.Mission.Recompense.Drachmes >= 40 && f2.Mission.Recompense.Provisions >= 10, JSON.stringify(f2.Lieu_Position));
  const r3 = await p.evaluate(async () => window.TACHE_EN_COURS.depuisConseil({ Id: "S3", Type: "deplacer", Titre: "Déplacer le camp", Resume: "" }));
  await p.waitForTimeout(300);
  const d3 = await partie();
  verifier("déplacer le camp : la tâche en cours s'efface, le bouton prendra le relais", r3 && r3.bouton === "deplacer" && !d3.Mission_En_Cours, JSON.stringify(r3));
});

titre("3. UNE TÂCHE ACCEPTÉE DANS LE RP (MIA_TACHE)");
await section(async () => {
  await p.evaluate(() => window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))));
  const non = await p.evaluate(async () => { window.__detection = { nouvelle: false }; return window.TACHE_EN_COURS.detecter("Le marchand parle d'une idole perdue.", [{ Auteur_Nom: "Thorin", Texte: "Intéressant." }]); });
  verifier("les héros en entendent seulement parler : rien", non === null && !(await partie()).Mission_En_Cours);
  const oui = await p.evaluate(async () => { window.__detection = { nouvelle: true, titre: "L'idole volée", resume: "Retrouver l'idole du temple.", commanditaire: "Le prêtre Kallias", objectif: "Rapporter l'idole.", difficulte: "difficile" };
    return window.TACHE_EN_COURS.detecter("« Ramenez-moi l'idole », supplie Kallias. Thorin accepte.", [{ Auteur_Nom: "Thorin", Texte: "Marché conclu." }]); });
  await p.waitForTimeout(400);
  const d = await partie(), f = await fiche(), pr = await p.evaluate(() => window.__prompts.filter(t => /MIA_MISSIONS/.test(t)).slice(-1)[0] || "");
  verifier("acceptée : le créateur l'écrit d'après elle, elle devient la tâche en cours (difficile : 100 à 200 drachmes)", oui && d.Mission_En_Cours && /L'idole volée/.test(pr) && /Kallias/.test(pr)
    && f.Mission.Difficulte === "difficile" && f.Mission.Recompense.Drachmes >= 100, JSON.stringify(d.Mission_En_Cours));
  const avant = await p.evaluate(() => window.__prompts.length);
  await p.evaluate(() => window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))));
  const deja = await p.evaluate(async () => window.TACHE_EN_COURS.detecter("Encore une quête ?", []));
  verifier("…une tâche déjà en cours : pas de détection (une seule tâche à la fois)", deja === null && (await p.evaluate(() => window.__prompts.length)) === avant);
  verifier("le narrateur lance la détection après chaque page (ia_master.js)", /window\.TACHE_EN_COURS\.detecter\(reponseTexte, historiqueReduit\)/.test(lire("ia_master.js")));
});

titre("4. LES RÉCOMPENSES VONT DANS LA CAISSE DU GROUPE");
await section(async () => {
  const f = await fiche();
  const ok = await p.evaluate(async () => window.MISSIONS_GUILDE.terminerMission("reussie", "L'idole est rendue."));
  await p.waitForTimeout(600);
  const d = await partie();
  verifier("la tâche réussie : ses drachmes et ses provisions rejoignent la caisse et la réserve", ok && d.Camp.Caisse === 40 + f.Mission.Recompense.Drachmes && d.Camp.Provisions === 10 + f.Mission.Recompense.Provisions
    && d.Camp.Recompenses_Versees.includes(f.Mission.Id), `${d.Camp.Caisse} / ${d.Camp.Provisions}`);
  const encore = await p.evaluate(async (id) => window.TACHE_EN_COURS.verserRecompense({ Id: id, Recompense: { Drachmes: 999 } }), f.Mission.Id);
  verifier("…une seule fois", encore === null && (await partie()).Camp.Caisse === d.Camp.Caisse);
  const fete = await p.evaluate(async () => { await window.TACHE_EN_COURS.verserRecompense({ Id: "F1", Titre: "La fête", Type_Tache: "fete", Recompense: { Drachmes: 0, Provisions: 0, Xp: 100, Moral: 10 } });
    return { h1: window.__docs["Personnages/H1"], camp: window.__docs["Systeme_Parties/P1"].Camp }; });
  verifier("une fête : de l'XP pour les héros et +10 de moral pour tout le clan", fete.h1.XP === 100 && fete.camp.Membres.PNJ_ARA.Moral === 70 && fete.camp.Membres.H1.Moral === 70, JSON.stringify(fete.h1));
  const g = lire("grimoire_mission.js");
  verifier("le parchemin des récompenses les écrit", /R\.texteRecompense\(\(accomplieAffichee\.Mission \|\| \{\}\)\.Recompense\)/.test(g) && /ligne-recompense/.test(g));
});

titre("5. « TÂCHE EN COURS » ; L'ANNULER AU RETOUR D'UNE EXPÉDITION");
await section(async () => {
  const g = lire("grimoire_mission.js"), gr = lire("grimoire.js");
  verifier("l'onglet « Mission » s'appelle « Tâche en cours » (la page, le marque-page)", /titre-mission-en-cours">Tâche en cours</.test(g) && /Aucune tâche en cours/.test(g) && /title="La tâche en cours"/.test(gr) && !/Mission en cours</.test(g));
  verifier("…une tâche à bouton votée au conseil : la page le dit", /Le conseil a voté : <b>/.test(g));
  await p.evaluate(async () => { await window.TACHE_EN_COURS.creer({ simple: true, titre: "Tenir le camp", resume: "Garder le feu.", type: "autre", garderTitre: true }); });
  await p.waitForTimeout(300);
  await p.evaluate(() => window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))));
  const sansCle = await partie();
  verifier("sans IA, une tâche simple tirée du sujet", sansCle.Mission_En_Cours && sansCle.Mission_En_Cours.Titre === "Tenir le camp");
  await p.evaluate(() => window.dispatchEvent(new CustomEvent("ivalis-retour-expedition", { detail: { Numero: 1, Jours: 2, Membres: [], archive: Promise.resolve() } })));
  await p.waitForTimeout(500);
  const d = await partie();
  verifier("au retour d'une expédition : la tâche en cours peut être annulée (la gestion du camp le propose)", d.Camp.Annulation_Tache && d.Camp.Annulation_Tache.Mission === d.Mission_En_Cours.Id
    && /Annuler la tâche en cours \(vote du groupe\)/.test(lire("grimoire_gestion.js")), JSON.stringify(d.Camp.Annulation_Tache));
});

titre("6. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 486 ou plus (trace_combat.js, version.json)", v >= 486 && JSON.parse(lire("version.json")).version >= 486, `${v}`);
  verifier("index.html charge tache_en_cours.js", /tache_en_cours\.js\?v=\d+/.test(lire("index.html")));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
