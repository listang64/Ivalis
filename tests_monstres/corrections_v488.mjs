// v488 — LE CLAN NOMADE, ÉTAPE 12 : LE RECRUTEMENT.
// Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md) : « Reprendre le système de recrutement actuel : un PNJ qui
// accepte rejoint directement le camp au lieu de devenir suiveur. Mercenaires et PNJ qui demandent de l'argent en RP :
// payés avec la caisse du groupe, puis rejoignent le camp ; mercenaires : 30 drachmes à l'embauche, 3 par jour, moral 40.
// Invitation en RP : moral 60. Recrues : niveau 1 ; caracs aléatoires, cohérentes avec leur background, mêmes règles que
// les autres personnages ; classe et compétences données par n'importe quel joueur. Personnage créé de toutes pièces
// (300 drachmes) : acheté par un joueur avec sa bourse (exclusif, moral 100), ou recruté pour le groupe par une tâche votée
// au conseil, avec la caisse. Dans les fils invisibles d'un PNJ, un bouton DEV rouge pour forcer son recrutement. »
// Lancer : node tests_monstres/corrections_v488.mjs
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
titre("1. LES RÈGLES DU RECRUTEMENT (camp_pur.js)");
// =========================================================================
await section(async () => {
  verifier("un mercenaire : 30 drachmes à l'embauche ; un personnage créé de toutes pièces : 300", CP.PRIX_MERCENAIRE === 30 && CP.PRIX_PERSONNAGE === 300);
  verifier("le moral d'arrivée : invité 60, mercenaire 40, acheté 100 ; la recrue du clan, libre pour tous",
    CP.membreRecrue("invite", "A").Moral === 60 && CP.membreRecrue("mercenaire", "B").Moral === 40 && CP.membreRecrue("achete", "C").Moral === 100 && CP.membreRecrue("recrue_clan", "D", { libre: true }).Libre === true
    && CP.membreRecrue("invite", "A").Tache === null && CP.membreRecrue("bizarre", "E").Type === "invite");
  let ok = true, haut = 0;
  for (let k = 0; k < 200; k++) {
    const c = CP.caracsDeRecrue(["dex", "sag"]);
    if (CP.coutCaracs(c) !== CP.POINTS_CREATION || Object.values(c).some(v => v < 8 || v > 16)) ok = false;
    if (c.dex >= c.force && c.dex >= c.cha) haut++;
  }
  verifier("les caracs d'une recrue : l'achat de points du jeu (22 points, de 8 à 16)", ok);
  verifier("…cohérentes avec son personnage (ses caracs marquées en tête, le plus souvent)", haut > 170, `${haut}/200`);
  verifier("payer : la caisse doit avoir de quoi", CP.peutEngager({ Caisse: 29 }, 30) !== "" && CP.peutEngager({ Caisse: 30 }, 30) === "");
  verifier("acheter : 300 drachmes dans sa bourse", /Il faut 300/.test(CP.peutAcheter({ J1: 120 }, "J1")) && CP.peutAcheter({ J1: 300 }, "J1") === "");
  verifier("recruter pour le groupe : après le vote du conseil, avec 300 drachmes dans la caisse, une recrue à la fois",
    /conseil doit d'abord voter/.test(CP.peutRecruterPourLeGroupe({ Caisse: 500 })) && /n'a pas 300/.test(CP.peutRecruterPourLeGroupe({ Caisse: 200, Recrutement_Vote: {} }))
    && CP.peutRecruterPourLeGroupe({ Caisse: 300, Recrutement_Vote: {} }) === "" && /déjà en train/.test(CP.peutRecruterPourLeGroupe({ Caisse: 300, Recrutement_Vote: {}, Recrutement_En_Cours: {} })));
  const camp = { Achats_En_Attente: { J1: {} }, Recrutement_En_Cours: { Par: "J2" } };
  const a = CP.arriveeDuHeros(camp, { id: "H9", nom: "Neuf", joueur: "J1" }), r = CP.arriveeDuHeros(camp, { id: "H8", nom: "Huit", joueur: "J2" }), n = CP.arriveeDuHeros(camp, { id: "H7", nom: "Sept", joueur: "J3" });
  verifier("un héros né après le camp : acheté (moral 100, à son joueur), recrue du clan (pour tous) ou héros (moral 60)",
    a.membre.Type === "achete" && a.membre.Moral === 100 && a.efface === "achat" && r.membre.Type === "recrue_clan" && r.membre.Libre && r.efface === "recrutement" && n.membre.Type === "heros" && n.membre.Moral === 60);
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
  window.jouerSonClic = () => {}; window.alert = () => {};
  localStorage.setItem("ID_JOUEUR_COURANT", "J1"); localStorage.setItem("ivalis_DEV_MODE", "on");
  window.__docs = window.__docs || {}; window.ID_PARTIE_COURANTE = "P1";
  window.PERSOS_JOUEURS_PARTIE = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", actif: true, creeLe: 1 }];
  window.PERSOS_PARTIE = window.PERSOS_JOUEURS_PARTIE.slice();
  window.__docs["Monde_PNJ/PNJ_ARA"] = { Nom_PNJ: "Ara", Occupation: "Herboriste", Race: "Humaine", ID_Partie: "P1" };
  window.__docs["Monde_PNJ/PNJ_BRUTUS"] = { Nom_PNJ: "Brutus", Occupation: "Mercenaire", ID_Partie: "P1" };
  window.__docs["Monde_PNJ/PNJ_KORE"] = { Nom_PNJ: "Koré", Occupation: "Bergère", ID_Partie: "P1" };
  window.__docs["Systeme_Parties/P1"] = { Bourses_Joueurs: {}, Camp: { Position: { Region: 7, x: 0.5, y: 0.5 }, Caisse: 50, Provisions: 20, Membres: { PNJ_THEMES_P1: { Narrateur: true, Moral: 60 }, H1: { Type: "heros", Joueur: "J1", Moral: 60 } } } };
  window.appliquerVoyageDeLaPartie = (d) => { window.PARTIE_DATA = d; window.appliquerCampDeLaPartie(d); };
  window.__relaisPartie = true;
  window.PARTIE_DATA = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]));
  window.appliquerCampDeLaPartie(window.PARTIE_DATA);
  window.cleGemini = () => "cle";
  window.fetchGemini = async (u, corps) => { const t = JSON.parse(corps).contents[0].parts[0].text;
    const rep = /MIA_CARACS/.test(t) ? JSON.stringify({ ordre: ["sag", "int", "dex", "con", "cha", "force"] }) : "{}";
    return { json: async () => ({ candidates: [{ content: { parts: [{ text: rep }] } }] }) }; };
  window.__creations = 0; window.GRIMOIRE_CREATION = { ...(window.GRIMOIRE_CREATION || {}), commencer: () => { window.__creations++; return true; } };
});
const partie = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"])));

titre("2. UN PNJ INVITÉ REJOINT LE CAMP");
await section(async () => {
  const refus = await p.evaluate(async () => window.RECRUTEMENT.rejoindreLeCamp("PNJ_ARA", { type: "invite", par: "Thorin" }));
  const d = await partie(), f = await p.evaluate(() => window.__docs["Monde_PNJ/PNJ_ARA"]);
  const souvenir = await p.evaluate(() => Object.entries(window.__docs).filter(([k]) => k.startsWith("Systeme_Parties/P1/Souvenirs/")).map(([, v]) => v).find(s => s.ame === "PNJ_ARA"));
  verifier("il entre dans le camp (moral 60, sans tâche) — pas dans la compagnie", refus === "" && d.Camp.Membres.PNJ_ARA && d.Camp.Membres.PNJ_ARA.Type === "invite" && d.Camp.Membres.PNJ_ARA.Moral === 60, refus);
  verifier("…au niveau 1, avec des caracs de 22 points rangées d'après son métier (l'herboriste : la Sagesse d'abord)", f.Membre_Du_Clan && f.Niveau === 1 && f.Caracs && CP.coutCaracs(f.Caracs) === 22 && f.Caracs.sag >= f.Caracs.force, JSON.stringify(f.Caracs));
  verifier("…il sait qu'il vit au camp (un souvenir)", souvenir && /rejoint le clan nomade/.test(souvenir.texte));
  const deux = await p.evaluate(async () => window.RECRUTEMENT.rejoindreLeCamp("PNJ_ARA", { type: "invite" }));
  verifier("…une seconde fois : non", /déjà du clan/.test(deux), deux);
});

titre("3. UN MERCENAIRE ENGAGÉ CONTRE DES DRACHMES");
await section(async () => {
  await p.evaluate(() => window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))));
  const r = await p.evaluate(async () => {
    const avant = window.GROUPE.detecterDemandes;
    window.GROUPE.detecterDemandes = async () => [{ type: "engager", pnj: "Brutus", heros: "Thorin", prix: 30 }];
    try {
      const res = await window.GROUPE.avantLeMJ({ messages: [{ Auteur_ID: "H1", Auteur_Nom: "Thorin", Texte: "Brutus, je t'engage pour trente drachmes.", Timestamp: 5 }],
        env: { pnjsPresents: { b: { idDoc: "PNJ_BRUTUS", Nom_PNJ: "Brutus" } } }, demanderJets: async () => {} });
      return { contexte: res.contexte };
    } finally { window.GROUPE.detecterDemandes = avant; }
  });
  const d = await partie();
  verifier("« je t'engage » : payé par la caisse du groupe (50 − 30), il rejoint le camp (moral 40, la solde courra)", d.Camp.Caisse === 20 && d.Camp.Membres.PNJ_BRUTUS && d.Camp.Membres.PNJ_BRUTUS.Type === "mercenaire" && d.Camp.Membres.PNJ_BRUTUS.Moral === 40, JSON.stringify(d.Camp.Membres.PNJ_BRUTUS));
  verifier("…le narrateur le sait (il rejoindra le camp, contre une solde)", /ACCEPTE d'être engagé par Thorin pour 30 drachmes/.test(r.contexte || ""), (r.contexte || "").slice(0, 200).replace(/\n/g, " "));
  await p.evaluate(() => window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))));
  const pauvre = await p.evaluate(async () => window.RECRUTEMENT.engager("PNJ_KORE", 30, "Thorin"));
  verifier("…sans les drachmes, pas d'engagement", /n'a pas 30 drachmes/.test(pauvre) && !(await partie()).Camp.Membres.PNJ_KORE, pauvre);
  const g = lire("groupe.js");
  verifier("le recrutement actuel : celui qui accepte rejoint le camp au lieu de suivre la compagnie (avec un camp)", /ACCEPTE de rejoindre le clan/.test(g) && /recruesCamp\.push\(\{ id: f\.idDoc, nom: f\.Nom_PNJ, type: "invite"/.test(g) && /"engager"/.test(g));
});

titre("4. UN PERSONNAGE À 300 DRACHMES");
await section(async () => {
  const sans = await p.evaluate(async () => window.RECRUTEMENT.acheterPersonnage());
  verifier("acheter sans 300 drachmes dans sa bourse : non", /Il faut 300/.test(sans), sans);
  await p.evaluate(async () => { await window.RECRUTEMENT.remplirBourseDev(); });
  const r = await p.evaluate(async () => { const x = await window.RECRUTEMENT.acheterPersonnage(); return { x, creations: window.__creations }; });
  let d = await partie();
  verifier("acheté avec sa bourse : 300 drachmes en moins, la création s'ouvre, le camp l'attend", r.x === "" && d.Bourses_Joueurs.J1 === 0 && r.creations === 1 && d.Camp.Achats_En_Attente.J1, JSON.stringify(d.Bourses_Joueurs));
  // Le héros créé arrive : il rejoint le camp comme personnage acheté (moral 100, à son joueur).
  await p.evaluate(() => { window.PERSOS_JOUEURS_PARTIE.push({ idPersonnage: "H9", idJoueur: "J1", prenom: "Neuf", actif: false, creeLe: 9 }); window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))); });
  await p.waitForTimeout(16000);
  d = await partie();
  verifier("…le personnage créé rejoint le camp : acheté, moral 100, à son joueur", d.Camp.Membres.H9 && d.Camp.Membres.H9.Type === "achete" && d.Camp.Membres.H9.Moral === 100 && d.Camp.Membres.H9.Joueur === "J1" && !(d.Camp.Achats_En_Attente || {}).J1, JSON.stringify(d.Camp.Membres.H9));
  await p.evaluate(() => { const c = window.__docs["Systeme_Parties/P1"].Camp; c.Caisse = 320; c.Recrutement_Vote = { Conseil: "C1" }; window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]))); });
  const g = await p.evaluate(async () => { const x = await window.RECRUTEMENT.recruterPourLeGroupe(); const y = await window.RECRUTEMENT.recruterPourLeGroupe(); return { x, y }; });
  d = await partie();
  verifier("recruté pour le groupe (le conseil l'a voté) : la caisse paie 300, le premier qui clique le crée", g.x === "" && d.Camp.Caisse === 20 && d.Camp.Recrutement_En_Cours.Par === "J1" && !d.Camp.Recrutement_Vote && /conseil doit d'abord voter|déjà/.test(g.y), JSON.stringify(g));
});

titre("5. LA CLASSE D'UNE RECRUE ; LE BOUTON DEV DES FILS INVISIBLES");
await section(async () => {
  const r = await p.evaluate(async () => window.RECRUTEMENT.choisirClasse("PNJ_ARA", "Prêtre de lumière"));
  verifier("la classe d'une recrue, donnée par n'importe quel joueur", r === "" && (await p.evaluate(() => window.__docs["Monde_PNJ/PNJ_ARA"].Classe)) === "Prêtre de lumière");
  const g = lire("grimoire_gestion.js"), l = lire("grimoire_liens.js");
  verifier("la gestion du camp : la classe des recrues, l'achat (la bourse), la recrue votée", /data-gc="classe"/.test(g) && /Acheter un personnage/.test(g) && /Créer la recrue votée au conseil/.test(g));
  verifier("les fils invisibles d'un PNJ : un bouton DEV rouge pour forcer son recrutement", /Forcer son recrutement dans le camp/.test(l) && /cb === "recruter-dev"/.test(l) && /modeDev\(\)/.test(l));
  const dev = await p.evaluate(async () => window.RECRUTEMENT.rejoindreLeCamp("PNJ_KORE", { type: "invite", par: "le mode DEV" }));
  const d = await partie();
  verifier("…le PNJ entre dans l'effectif comme s'il avait été recruté (moral 60, niveau 1, ses caracs)", dev === "" && d.Camp.Membres.PNJ_KORE.Moral === 60 && (await p.evaluate(() => window.__docs["Monde_PNJ/PNJ_KORE"].Niveau)) === 1);
});

titre("6. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 488 ou plus (trace_combat.js, version.json)", v >= 488 && JSON.parse(lire("version.json")).version >= 488, `${v}`);
  verifier("index.html charge recrutement.js", /recrutement\.js\?v=\d+/.test(lire("index.html")));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
