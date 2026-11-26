// v485 — LE CLAN NOMADE, ÉTAPE 9 : LE CONSEIL AUTOUR DU FEU.
// Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md) : « Page « Former le conseil », bloquée pendant une
// expédition hors du camp ; conseil extraordinaire automatique quand le camp n'a plus de provisions. Récit à part,
// uniquement des paroles ; Thémès raconte ; même réglage d'IA que le narrateur. Réponse de l'IA en JSON (répliques,
// post-it, avis des PNJ). Le compte rendu des 5 dernières expéditions. Post-its : 3 sujets au maximum, un par joueur,
// les PNJ sans enchaîner ; l'éclaireur annonce vite un lieu repéré. Chat avec un encart et un petit avatar par membre.
// Vote des joueurs seulement, modifiable, final dès que tous les joueurs connectés ont voté ; bulles des PNJ ; égalité :
// les PNJ, puis le sort. Le résultat devient une tâche ; moral +5 pour les PNJ suivis, −3 pour les ignorés. »
// Lancer : node tests_monstres/corrections_v485.mjs
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
titre("1. LES RÈGLES DU CONSEIL (camp_pur.js)");
// =========================================================================
await section(async () => {
  let c = CP.conseilVide("C1", { maintenant: 1 });
  const J1 = { id: "J1", nom: "Thorin", type: "joueur" }, P = (id) => ({ id, nom: id, type: "pnj" });
  verifier("un sujet par joueur", CP.peutProposer(c, J1) === "" && (c.Sujets.push(CP.nouveauSujet(c, { titre: "Une fête", type: "fete", par: J1 })), /déjà proposé/.test(CP.peutProposer(c, J1))));
  c.Sujets.push(CP.nouveauSujet(c, { titre: "Partir", type: "deplacer", par: P("Ara") }));
  verifier("les PNJ peuvent proposer, mais pas à la suite", /vient déjà/.test(CP.peutProposer(c, P("Bors"))) && CP.peutProposer(c, { id: "J2", type: "joueur" }) === "");
  c.Sujets.push(CP.nouveauSujet(c, { titre: "Recruter", type: "recruter", par: { id: "J2", nom: "Lyra", type: "joueur" } }));
  verifier("3 sujets au plus : les trois premiers", /ses 3 sujets/.test(CP.peutProposer(c, { id: "J3", type: "joueur" })) && c.Sujets.map(s => s.Id).join() === "S1,S2,S3");
  verifier("un sujet garde son titre, son résumé, son type (inconnu : « autre »), qui l'a proposé", c.Sujets[0].Type === "fete" && c.Sujets[0].Par.nom === "Thorin" && CP.nouveauSujet(c, { titre: "x", type: "bizarre", par: J1 }).Type === "autre");
  c.Votes = { J1: "S1" };
  verifier("le vote final attend tous les joueurs connectés", CP.resultatVote(c, ["J1", "J2"]) === null && CP.resultatVote(c, ["J1"]).sujet.Id === "S1");
  c.Votes = { J1: "S1", J2: "S3" }; c.Avis_PNJ = { A: "S3", B: "S3", C: "S1" };
  const r = CP.resultatVote(c, ["J1", "J2"]);
  verifier("égalité entre joueurs : le sujet où le plus de PNJ sont placés l'emporte", r.sujet.Id === "S3" && r.egalite && !r.tirage);
  c.Avis_PNJ = { A: "S3", C: "S1" };
  const tires = new Set(); for (let k = 0; k < 30; k++) tires.add(CP.resultatVote(c, ["J1", "J2"]).sujet.Id);
  verifier("…si l'égalité persiste, on tire au sort", tires.size === 2 && CP.resultatVote(c, ["J1", "J2"], () => 0).tirage === true);
  const m = CP.moralApresConseil({ A: "S3", B: "S1", C: null }, "S3");
  verifier("+5 de moral aux PNJ dont l'avis est suivi, −3 aux ignorés, rien sans avis", m.length === 2 && m.find(x => x.id === "A").delta === 5 && m.find(x => x.id === "B").delta === -3);
  const pr = CP.promptConseil({ extraordinaire: true, raison: "plus de provisions", pnjs: [{ nom: "Ara", caractere: "sociable", moral: 70 }], heros: ["Thorin"], sujets: c.Sujets, memoire: "- Expédition 1 : 4 jours" });
  verifier("la consigne : Thémès anime ; uniquement des paroles ; répliques courtes ; les sujets avec leur id ; la mémoire ; le JSON",
    /Tu es Thémès/.test(pr) && /UNIQUEMENT DE PAROLES/.test(pr) && /conseil extraordinaire \(plus de provisions\)/.test(pr) && /\[S1\] Une fête/.test(pr) && /Expédition 1 : 4 jours/.test(pr) && /"repliques"/.test(pr) && /"postit"/.test(pr) && /"avis"/.test(pr));
  const pnjs = [{ id: "PNJ_ARA", nom: "Ara" }, { id: "PNJ_BORS", nom: "Bors" }];
  const lu = CP.lireReponseConseil('```json\n{"repliques":[{"qui":"Ara","texte":"Une fête !"},{"qui":"Inconnu","texte":"?"},{"qui":"Thémès","texte":"Écoutons-la."}],"postit":{"titre":"Chasser au loin","resume":"…","type":"vivres","par":"Bors"},"avis":{"Ara":"S1","Bors":"S9","Zed":"S1"}}\n```', c, pnjs);
  verifier("la réponse de l'IA relue : les répliques des PNJ présents et de Thémès seulement ; le post-it et son auteur ; les avis valides",
    lu.repliques.map(x => x.id).join() === "PNJ_ARA,THEMES" && lu.postit.par === "PNJ_BORS" && lu.postit.type === "vivres" && lu.avis.PNJ_ARA === "S1" && lu.avis.PNJ_BORS === null && !("Zed" in lu.avis), JSON.stringify(lu));
  verifier("…une réponse illisible : rien", CP.lireReponseConseil("pas du json", c, pnjs).repliques.length === 0);
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
  window.jouerSonClic = () => {};
  localStorage.setItem("ID_JOUEUR_COURANT", "J1");
  window.__docs = window.__docs || {}; window.ID_PARTIE_COURANTE = "P1";
  window.PERSOS_JOUEURS_PARTIE = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", creeLe: 1 }, { idPersonnage: "H2", idJoueur: "J2", prenom: "Lyra", creeLe: 1 }];
  ["Ara", "Bors", "Cleo", "Vif"].forEach(n => { window.__docs["Monde_PNJ/PNJ_" + n.toUpperCase()] = { Nom_PNJ: n }; });
  window.__docs["Monde_PNJ/PNJ_THEMES_P1"] = { Nom_PNJ: "Thémès", Narrateur: true };
  window.__docs["Systeme_Parties/P1/Presence/J2"] = { Le: Date.now(), Joueur: "J2" };
  window.__docs["Recits_Chapitres/c1"] = { ID_Partie: "P1", Numero: 1, Titre: "Expédition 1 — Les loups de la crête", Expedition: 1 };
  window.__docs["Systeme_Parties/P1"] = { Position_Groupe: { Region: 7, x: 0.5, y: 0.5 }, Heros_Principaux: {},
    Camp: { Position: { Region: 7, x: 0.5, y: 0.5 }, Caisse: 40, Provisions: 12, Ressources: { Jauge: 60 }, Lieux_Reperes: [{ Par: "PNJ_VIF", Jour: 3 }],
      Expeditions_Passees: [{ Numero: 1, Jours: 4, Membres: ["H1"] }],
      Membres: { PNJ_THEMES_P1: { Narrateur: true, Moral: 60 }, H1: { Type: "heros", Moral: 60 }, H2: { Type: "heros", Moral: 60 },
                 PNJ_ARA: { Type: "pnj", Moral: 60 }, PNJ_BORS: { Type: "pnj", Moral: 60 }, PNJ_CLEO: { Type: "pnj", Moral: 60 }, PNJ_VIF: { Type: "pnj", Tache: "eclaireur", Moral: 60 } } } };
  window.appliquerVoyageDeLaPartie = (d) => { window.PARTIE_DATA = d; window.appliquerCampDeLaPartie(d); };
  window.__relaisPartie = true;
  window.PARTIE_DATA = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]));
  window.appliquerCampDeLaPartie(window.PARTIE_DATA);
  window.positionGroupeBrute = () => (window.PARTIE_DATA || {}).Position_Groupe || null;
  window.__taches = []; window.TACHE_EN_COURS = { depuisConseil: async (s) => { window.__taches.push(s); } };
});
const partie = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"])));
const msgs = () => p.evaluate(() => Object.entries(window.__docs).filter(([k]) => k.startsWith("Systeme_Parties/P1/Conseil_Messages/")).map(([, v]) => v).sort((a, b) => a.Timestamp - b.Timestamp));

titre("2. FORMER LE CONSEIL");
await section(async () => {
  const bloque = await p.evaluate(() => { window.PARTIE_DATA = { ...window.PARTIE_DATA, Expedition: { En_Cours: true, Membres: ["H1"] } }; const r = window.CONSEIL.peutOuvrir(); window.PARTIE_DATA = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"])); return r; });
  verifier("pendant une expédition hors du camp : pas de conseil", /expédition est en cours/.test(bloque), bloque);
  const refus = await p.evaluate(async () => window.CONSEIL.ouvrir());
  await p.waitForTimeout(700);
  const d = await partie(), m = await msgs();
  verifier("« Former le conseil » : le conseil se réunit (une fois), sa page s'ouvre en fondu", refus === "" && d.Conseil && d.Conseil.Ouvert && await p.evaluate(() => document.getElementById("ecran-conseil").classList.contains("affiche") && window.CONSEIL.ouverte()), refus);
  verifier("l'éclaireur annonce vite le lieu repéré : un premier post-it", d.Conseil.Sujets.length === 1 && d.Conseil.Sujets[0].Type === "lieu" && d.Conseil.Sujets[0].Par.id === "PNJ_VIF" && m.some(x => x.Auteur_ID === "PNJ_VIF" && /éclaireur/.test(x.Texte)), JSON.stringify(d.Conseil.Sujets));
  verifier("…Thémès ouvre le conseil (un récit à part : ses propres messages)", m[0].Type === "themes" && m[0].Auteur_Nom === "Thémès" && m.every(x => x.Conseil === d.Conseil.Id));
  await p.evaluate(async () => { await window.CONSEIL.ouvrir(); });
  verifier("…le rouvrir ne crée pas de second conseil", (await partie()).Conseil.Id === d.Conseil.Id && (await msgs()).length === m.length);
});

titre("3. PARLER ET PROPOSER : LE CHAT, LES POST-ITS");
await section(async () => {
  await p.evaluate(async () => { await window.CONSEIL.proposer("Organiser une fête", "Le clan a besoin de souffler.", "fete"); });
  await p.evaluate(() => window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))));
  const deux = await p.evaluate(async () => window.CONSEIL.proposer("Encore un", "", "autre"));
  verifier("un joueur propose un sujet (son post-it) ; pas un second", (await partie()).Conseil.Sujets[1].Titre === "Organiser une fête" && /déjà proposé/.test(deux), deux);
  await p.evaluate(async () => { window.CONSEIL.planifierIA(3600000); await window.CONSEIL.envoyer("Je dis qu'il nous faut une fête, et vite."); });
  const m = await msgs();
  verifier("ce que le joueur écrit : une réplique au nom de son héros", m.slice(-1)[0].Type === "joueur" && m.slice(-1)[0].Auteur_Nom === "Thorin" && /une fête/.test(m.slice(-1)[0].Texte));
  const r = await p.evaluate(async () => {
    window.cleGemini = () => "cle"; window.__appels = [];
    window.fetchGemini = async (usage, corps, o) => { window.__appels.push({ usage, corps: JSON.parse(corps), modele: o && o.modele });
      return { json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ repliques: [{ qui: "Ara", texte: "Une fête ? Avec quoi, des racines ?" }, { qui: "Bors", texte: "Moi, je dis qu'on va chasser plus loin." }],
        postit: { titre: "Chasser plus loin", resume: "Une grande chasse au-delà de la crête.", type: "vivres", par: "Bors" }, avis: { Ara: "S1", Bors: "S3", Cleo: "S2" } }) }] } }] }) }; };
    const rep = await window.CONSEIL.repondre();
    return { rep: rep && rep.repliques.length, appel: window.__appels[0] };
  });
  await p.evaluate(() => window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))));
  const d = await partie(), m2 = await msgs(), sys = r.appel.corps.systemInstruction.parts[0].text;
  // (v501) Nico : « la même IA que pour les dialogues privés » (plus rapide que le réglage du narrateur).
  verifier("l'IA répond (celle des discussions privées, v501), en JSON", r.appel.usage === "discussion" && r.appel.modele === "gemini-3.8-flash" && r.appel.corps.generationConfig.responseMimeType === "application/json");
  verifier("…elle sait les PNJ présents (pas les partis), les sujets, la mémoire des 5 dernières expéditions", /- Ara/.test(sys) && /- Vif/.test(sys) && /\[S2\] Organiser une fête/.test(sys) && /Les loups de la crête/.test(sys), sys.slice(0, 160).replace(/\n/g, " "));
  verifier("les répliques des PNJ (ils se répondent entre eux)", m2.slice(-2).map(x => x.Auteur_Nom).join() === "Ara,Bors" && m2.slice(-2).every(x => x.Type === "pnj"));
  verifier("le post-it proposé par un PNJ (après celui d'un joueur), et la bulle de chaque PNJ sur le sujet qu'il préfère",
    d.Conseil.Sujets.length === 3 && d.Conseil.Sujets[2].Par.id === "PNJ_BORS" && d.Conseil.Avis_PNJ.PNJ_ARA === "S1" && d.Conseil.Avis_PNJ.PNJ_BORS === "S3" && d.Conseil.Avis_PNJ.PNJ_CLEO === "S2" && !d.Conseil.IA, JSON.stringify(d.Conseil.Avis_PNJ));
  await p.evaluate(() => window.CONSEIL.rafraichir()); await p.waitForTimeout(200);
  const vue = await p.evaluate(() => ({ messages: document.querySelectorAll(".message-conseil").length, avatars: document.querySelectorAll(".message-conseil .avatar-conseil").length,
    postits: [...document.querySelectorAll(".postit-conseil")].map(x => ({ t: x.querySelector(".titre-postit").textContent, b: [...x.querySelectorAll(".bulle-pnj-postit")].map(y => y.textContent) })), proposer: !!document.querySelector('[data-cs="proposer"]') }));
  verifier("la page : un encart et un petit avatar par prise de parole ; les post-its et les bulles des PNJ", vue.messages === m2.length && vue.avatars === m2.length && vue.postits.length === 3
    && vue.postits[1].b.includes("Cleo") && vue.postits[2].b.includes("Bors") && !vue.proposer, JSON.stringify(vue));
});

titre("4. LE VOTE, LE RÉSULTAT, LES CONSÉQUENCES");
await section(async () => {
  await p.evaluate(async () => { await window.CONSEIL.voter("S2"); });
  await p.waitForTimeout(300);
  verifier("un vote ; le vote final attend tous les joueurs connectés (Lyra n'a pas voté)", (await partie()).Conseil.Ouvert === true && (await partie()).Conseil.Votes.J1 === "S2");
  await p.evaluate(async () => { await window.CONSEIL.voter("S1"); await window.CONSEIL.voter("S2"); });
  verifier("…on peut changer son vote tant que le vote final n'a pas eu lieu", (await partie()).Conseil.Votes.J1 === "S2");
  await p.evaluate(async () => { window.__docs["Systeme_Parties/P1"].Conseil.Votes.J2 = "S3"; window.__docs["Systeme_Parties/P1"].Conseil.Avis_PNJ.PNJ_VIF = "S2"; window.PARTIE_DATA = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"])); await window.CONSEIL.verifierVote(); });
  await p.waitForTimeout(500);
  const d = await partie(), m = await msgs(), t = await p.evaluate(() => window.__taches);
  verifier("1 voix partout : l'avis des PNJ départage (la fête : Cleo et Vif) — le vote est clos", !d.Conseil.Ouvert && d.Conseil.Resultat.Sujet.Id === "S2" && d.Conseil.Resultat.Egalite && !d.Conseil.Resultat.Tirage, JSON.stringify(d.Conseil.Resultat));
  verifier("le choix gagnant devient la tâche du groupe (elle remplacera la tâche en cours)", d.Camp.Tache_Votee && d.Camp.Tache_Votee.Type === "fete" && t.length === 1 && t[0].Titre === "Organiser une fête");
  verifier("…Thémès l'annonce", /Le conseil a décidé/.test(m.slice(-1)[0].Texte) && m.slice(-1)[0].Type === "themes");
  verifier("+5 de moral aux PNJ suivis (Cleo, Vif), −3 aux ignorés (Ara, Bors)", d.Camp.Membres.PNJ_CLEO.Moral === 65 && d.Camp.Membres.PNJ_VIF.Moral === 65 && d.Camp.Membres.PNJ_ARA.Moral === 57 && d.Camp.Membres.PNJ_BORS.Moral === 57,
    ["PNJ_CLEO", "PNJ_VIF", "PNJ_ARA", "PNJ_BORS"].map(i => d.Camp.Membres[i].Moral).join());
  verifier("…le lieu repéré, non retenu, reste à voir ; le conseil est gardé dans l'histoire du camp", d.Camp.Lieux_Reperes.length === 1 && d.Camp.Conseils_Passes.slice(-1)[0].Resultat === "Organiser une fête");
  const code = lire("conseil.js");
  verifier("déplacer le camp ou recruter, votés : le bouton et le recrutement s'ouvrent (étapes 11 et 12)", /Deplacement_Vote = \{ Conseil: c\.Id/.test(code) && /Recrutement_Vote = \{ Conseil: c\.Id/.test(code));
});

titre("5. LE CONSEIL EXTRAORDINAIRE");
await section(async () => {
  // (v502) Le conseil extraordinaire se réunit une fois que le joueur est dans la page du camp.
  await p.evaluate(() => { window.CAMP_SCENE.ouvert = () => true; });
  await p.evaluate(() => { window.CONSEIL.fermerVue(); const d = window.__docs["Systeme_Parties/P1"]; d.Camp.Conseil_Extraordinaire = { Raison: "Le camp n'a plus de provisions." }; d.Camp.Provisions = 0;
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(d))); });
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))));
  await p.waitForTimeout(800);
  const d = await partie();
  const ouverte = await p.evaluate(() => window.CONSEIL.ouverte());
  verifier("le camp n'a plus de provisions : un conseil extraordinaire s'ouvre tout seul, sa page aussi", d.Conseil.Ouvert && d.Conseil.Extraordinaire && d.Conseil.Sujets[0].Titre === "Le manque cruel de vivres" && ouverte, JSON.stringify(d.Conseil.Sujets.map(s => s.Titre)));
  await p.evaluate(() => document.querySelector('[data-cs="quitter"]').click());
  await p.evaluate(() => window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))));
  await p.waitForTimeout(600);
  verifier("« ‹ Le camp » : la page se ferme (et ne se rouvre pas d'elle-même)", !(await p.evaluate(() => window.CONSEIL.ouverte())));
  const scene = lire("camp_scene.js");
  verifier("le bouton « Former le conseil » de la page du camp l'ouvre", /window\.CONSEIL\.peutOuvrir/.test(scene) && /return window\.CONSEIL\.ouvrir\(\)/.test(scene));
});

titre("6. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 485 ou plus (trace_combat.js, version.json)", v >= 485 && JSON.parse(lire("version.json")).version >= 485, `${v}`);
  verifier("index.html charge le conseil et son style", /conseil\.js\?v=\d+/.test(lire("index.html")) && /conseil\.css\?v=\d+/.test(lire("index.html")));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
