// v484 — LE CLAN NOMADE, ÉTAPES 7 ET 8 : THÉMÈS DANS LE RÉCIT, LE RETOUR AU CAMP.
// Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md) : « Remplacer le narrateur « en off » par Thémès, qui
// parle et interagit dans le récit. Défaite : Thémès reste caché et continue d'écrire. » « Le retour au camp : calcul
// d'un coup, selon le nombre de jours écoulés : évolution des affinités entre personnages qui ont partagé une tâche
// ou un repas, une ou deux petites scènes tous les 3 jours, événements du camp. Rapport de l'intendant en RP (il
// remplace la chronique du camp et le récit du retour) ; pas de rapport si personne n'est resté au camp. »
// Lancer : node tests_monstres/corrections_v484.mjs
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
const suite = (valeurs) => { let i = 0; return () => valeurs[i++ % valeurs.length]; };

// =========================================================================
titre("1. THÉMÈS, LE NARRATEUR (étape 7)");
// =========================================================================
await section(async () => {
  const t = CP.CONSIGNES_THEMES;
  verifier("le narrateur est Thémès : un vieil homme humain, sage et bienveillant, qui écrit l'histoire dans son manuscrit", /Tu t'appelles Thémès/.test(t) && /vieil homme humain, sage et bienveillant/.test(t) && /manuscrit/.test(t));
  verifier("…il parle et interagit dans le récit, sans décider pour les héros", /tu parles, tu interagis/.test(t) && /Tu ne décides jamais à la place d'un héros/.test(t));
  verifier("…il ne se bat jamais, ne peut être ni blessé ni tué ; après une défaite, il est resté caché et continue d'écrire", /ne te bats jamais/.test(t) && /ni blessé ni tué/.test(t) && /perdu un combat, tu es resté caché/.test(t) && /continues d'écrire/.test(t));
  const ia = lire("ia_master.js");
  verifier("le narrateur reçoit ces consignes dès que le clan a un camp (ia_master.js, camp.js)", /window\.CAMP\.consignesThemes\(\)/.test(ia) && /\(themes \? "\\n\\n" \+ themes : ""\)/.test(ia) && /consignesThemes = \(\) => \(camp \? CP\.CONSIGNES_THEMES : ""\)/.test(lire("camp.js")));
});

titre("2. LES AFFINITÉS AU RETOUR (étape 8)");
await section(async () => {
  const tendre = { traits: { empathie: 85, sociabilite: 70, orgueil: 20, impulsivite: 30 } }, fier = { traits: { empathie: 20, sociabilite: 30, orgueil: 85, impulsivite: 75 } }, fier2 = { traits: { empathie: 25, sociabilite: 40, orgueil: 80 } };
  verifier("deux âmes tendres s'accordent ; deux orgueils se heurtent", CP.compatibilite(tendre, tendre) > 0.5 && CP.compatibilite(fier, fier2) < 0 && CP.compatibilite(tendre, tendre, 20, 20) < CP.compatibilite(tendre, tendre, 70, 70));
  const e = CP.evolutionAffinites({ presents: ["A", "B", "C"], jours: 9, taches: { A: "chasser", B: "chasser", C: null }, psyches: { A: tendre, B: tendre, C: fier }, moraux: { A: 70, B: 70, C: 40 } });
  const ab = e.find(x => x.de === "A" && x.vers === "B"), ac = e.find(x => x.de === "A" && x.vers === "C"), ba = e.find(x => x.de === "B" && x.vers === "A");
  verifier("ceux qui ont chassé ensemble se rapprochent (familiarité, attachement, confiance), dans les deux sens", ab && ab.ensemble && ab.axes.familiarite === 9 && ab.axes.attachement > 0 && ab.axes.confiance > 0 && ba && ba.axes.familiarite === 9, JSON.stringify(ab));
  verifier("…ceux qui ont seulement partagé les repas, moins (et selon leur psyché)", ac && !ac.ensemble && ac.axes.familiarite === 5 && (ac.axes.attachement || 0) <= 0 && !("confiance" in ac.axes), JSON.stringify(ac));
  verifier("sans jours, rien", CP.evolutionAffinites({ presents: ["A", "B"], jours: 0 }).length === 0);
});

titre("3. LES PETITES SCÈNES ET LES ÉVÉNEMENTS");
await section(async () => {
  verifier("une ou deux petites scènes tous les 3 jours", CP.nombreDeScenes(2) === 0 && CP.nombreDeScenes(6, () => 0.1) === 2 && CP.nombreDeScenes(6, () => 0.9) === 4 && CP.nombreDeScenes(9, suite([0.1, 0.9, 0.1])) === 4);
  const ev = CP.evenementsDuCamp(12, ["A", "B"], suite([0.1, 0.1, 0.5, 0.1, 0.4, 0.1, 0.1, 0.6, 0.1, 0.9]), { A: "Ara", B: "Bors" });
  const types = ev.map(x => x.type);
  verifier("par tranche de 3 jours, une chance sur trois d'un événement : tempête, maladie, bête qui rôde, voyageur", types.join() === "tempete,maladie,bete,voyageur", types.join());
  verifier("…la tempête gâche des provisions ; la fièvre et la bête pèsent sur le moral ; le voyageur attend le conseil",
    ev[0].provisions < 0 && ev[1].moral[0].delta === -5 && /Ara|Bors/.test(ev[1].texte) && ev[2].moral.length === 2 && ev[3].conseil === true);
  verifier("…jamais d'attaque du camp ; personne au camp, rien", !ev.some(x => /attaqu/i.test(x.texte)) && CP.evenementsDuCamp(12, [], () => 0).length === 0);
  const pr = CP.promptRapportIntendant({ numero: 2, jours: 6, intendant: "Ara", caractere: "sociable", heros: ["Thorin"], journal: ["La chasse rapporte 5 provisions."], evenements: ["Une tempête a gâché 3 provisions."],
    caisse: 40, provisions: 22, jauge: 70, moraux: ["Ara 65/100"], scenes: 2, presents: ["Ara", "Bors"] });
  verifier("le rapport : l'intendant parle (« »), Thémès écrit ; le journal, les événements, les ressources, le moral, 2 petites scènes", /Ara, l'intendant resté au camp, fait son rapport/.test(pr) && /Thémès/.test(pr)
    && /La chasse rapporte 5 provisions/.test(pr) && /tempête/.test(pr) && /40 drachmes/.test(pr) && /22 provisions/.test(pr) && /Ara 65\/100/.test(pr) && /Glisse 2 petites scènes/.test(pr) && /Pas de combat/.test(pr));
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

titre("4. LE RETOUR AU CAMP : LES ÉVÉNEMENTS, LES LIENS, LE RAPPORT DE L'INTENDANT");
await section(async () => {
  const r = await p.evaluate(async () => {
    window.jouerSonClic = () => {};
    localStorage.setItem("ID_JOUEUR_COURANT", "J1"); localStorage.removeItem("ivalis_DEV_MODE");
    window.__docs = window.__docs || {}; window.ID_PARTIE_COURANTE = "P1";
    window.PERSOS_JOUEURS_PARTIE = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", niveau: 2 }];
    window.__docs["Monde_PNJ/PNJ_ARA"] = { Nom_PNJ: "Ara" }; window.__docs["Monde_PNJ/PNJ_BORS"] = { Nom_PNJ: "Bors" }; window.__docs["Monde_PNJ/PNJ_THEMES_P1"] = { Nom_PNJ: "Thémès" };
    window.__docs["Systeme_Parties/P1/Ames/PNJ_ARA"] = { id: "PNJ_ARA", type: "pnj", nom: "Ara", psyche: { traits: { empathie: 80, sociabilite: 75 } } };
    window.__docs["Systeme_Parties/P1/Ames/PNJ_BORS"] = { id: "PNJ_BORS", type: "pnj", nom: "Bors", psyche: { traits: { empathie: 75, sociabilite: 70 } } };
    window.__docs["Systeme_Parties/P1"] = { Camp: { Position: { Region: 7, x: 0.5, y: 0.5 }, Caisse: 40, Provisions: 20, Ressources: { Jauge: 70 }, Intendant: "PNJ_ARA", Jours_Ecoules: 6,
      Journal: [{ Jour: 5, Lignes: ["La chasse rapporte 4 provisions."] }, { Jour: 6, Lignes: ["Bors se blesse à la chasse : morsure."] }],
      Membres: { PNJ_THEMES_P1: { Narrateur: true, Moral: 60 }, H1: { Type: "heros", Moral: 60 }, PNJ_ARA: { Type: "pnj", Tache: "chasser", Moral: 70 }, PNJ_BORS: { Type: "pnj", Tache: "chasser", Moral: 65 } } } };
    window.PARTIE_DATA = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]));
    window.appliquerCampDeLaPartie(window.PARTIE_DATA);
    window.cleGemini = () => "cle";
    window.__prompts = [];
    window.fetchGemini = async (role, corps) => { window.__prompts.push(JSON.parse(corps).contents[0].parts[0].text);
      return { json: async () => ({ candidates: [{ content: { parts: [{ text: "Ara nous attend près du feu. « Six jours, et pas un de moins, dit-elle. Bors a encore voulu jouer au héros avec un sanglier. »" }] } }] }) }; };
    // Une tempête au premier tiers (0.1 : un événement ; 0.1 : la tempête ; 0.5 : la perte), puis plus rien.
    const seq = [0.1, 0.1, 0.5, 0.9, 0.9, 0.9, 0.9]; let i = 0;
    const res = await window.RETOUR_CAMP.apresLeRetour({ Numero: 1, Jours: 6, Membres: ["H1", "PNJ_THEMES_P1"], archive: Promise.resolve() }, () => seq[Math.min(i++, seq.length - 1)]);
    const msgs = Object.entries(window.__docs).filter(([k]) => k.startsWith("Messages_Chat/")).map(([, v]) => v);
    return { res: res && { evenements: res.evenements.map(x => x.type), ecarts: res.ecarts.length, intendant: res.intendant }, msgs, camp: window.__docs["Systeme_Parties/P1"].Camp,
             lien: window.__docs["Systeme_Parties/P1/Liens/PNJ_ARA~PNJ_BORS"] || window.__docs["Systeme_Parties/P1/Liens/" + Object.keys(window.__docs).filter(k => k.includes("/Liens/")).map(k => k.split("/Liens/")[1])[0]],
             liens: Object.keys(window.__docs).filter(k => k.includes("/Liens/")), prompt: window.__prompts[0] || "" };
  });
  verifier("les événements de l'absence : ici une tempête (des provisions gâchées, notée au journal)", r.res && r.res.evenements.join() === "tempete" && r.camp.Provisions < 20 && /tempête/.test(r.camp.Journal.slice(-1)[0].Lignes.join(" ")), JSON.stringify(r.res));
  verifier("les liens entre ceux qui ont chassé ensemble au camp (Ara et Bors) se resserrent, sans le mode DEV", r.liens.length === 2 && r.lien && r.lien.axes.familiarite > 0 && r.lien.axes.attachement > 0 && r.lien.derniers.slice(-1)[0].type === "camp", JSON.stringify(r.lien && r.lien.axes));
  verifier("le rapport de l'intendant (Ara) : demandé avec le journal, les ressources, les petites scènes", r.res.intendant === "PNJ_ARA" && /Ara, l'intendant resté au camp/.test(r.prompt) && /Bors se blesse à la chasse/.test(r.prompt) && /petite/.test(r.prompt), r.prompt.slice(0, 120).replace(/\n/g, " "));
  verifier("…une page de Thémès dans le récit (un message du narrateur), gardée aussi dans le camp", r.msgs.length === 1 && r.msgs[0].Est_Narration_IA && /Ara nous attend près du feu/.test(r.msgs[0].Texte) && r.msgs[0].Rapport_Intendant.Expedition === 1
    && r.camp.Dernier_Rapport && /Six jours/.test(r.camp.Dernier_Rapport.Texte), JSON.stringify(r.msgs[0] || {}).slice(0, 160));
  const vide = await p.evaluate(async () => {
    const c = window.__docs["Systeme_Parties/P1"].Camp; c.Membres = { PNJ_THEMES_P1: { Narrateur: true }, H1: { Type: "heros" } };
    window.appliquerCampDeLaPartie({ Camp: c });
    const avant = Object.keys(window.__docs).filter(k => k.startsWith("Messages_Chat/")).length;
    const res = await window.RETOUR_CAMP.apresLeRetour({ Numero: 2, Jours: 3, Membres: ["H1", "PNJ_THEMES_P1"], archive: Promise.resolve() });
    return { res, apres: Object.keys(window.__docs).filter(k => k.startsWith("Messages_Chat/")).length - avant };
  });
  verifier("personne n'est resté au camp : pas de rapport", vide.res && vide.res.rapport === "" && vide.apres === 0, JSON.stringify(vide));
  const exp = lire("expedition.js");
  verifier("le retour attend que le récit de l'expédition soit rangé (le rapport ouvre la page suivante)", /detail: \{ \.\.\.r, archive \}/.test(exp) && /await r\.archive/.test(lire("retour_camp.js")));
});

titre("5. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 484 ou plus (trace_combat.js, version.json)", v >= 484 && JSON.parse(lire("version.json")).version >= 484, `${v}`);
  verifier("index.html charge retour_camp.js", /retour_camp\.js\?v=\d+/.test(lire("index.html")));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
