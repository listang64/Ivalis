// v490 — LE CLAN NOMADE, LE RESTE : JOUER UN PERSONNAGE DU CAMP, SES COMPÉTENCES, LE CAMP À LA CRÉATION DE LA PARTIE.
// Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md) : « En cliquant sur un emplacement, le joueur ouvre la liste
// des personnages qu'il peut jouer : d'abord ses propres personnages, puis, en dessous, les personnages du camp libres
// pour tous » ; « Tous les autres PNJ du camp peuvent être incarnés par n'importe quel joueur » ; « N'importe quel joueur
// peut lui créer ses compétences » (Nico : ce sont les joueurs qui les feront) ; « Si le héros principal meurt, le joueur
// choisit son nouveau héros principal parmi les PNJ disponibles » ; « À terme : automatique à la création d'une partie
// (camp à un endroit aléatoire, 100 drachmes, 28 provisions, Thémès) ».
// Lancer : node tests_monstres/corrections_v490.mjs
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
titre("1. LES PERSONNAGES DU CAMP LIBRES POUR TOUS (camp_pur.js)");
// =========================================================================
const campRegles = { Membres: {
  PNJ_THEMES_P1: { Type: "pnj", Nom: "Thémès", Narrateur: true }, H1: { Type: "heros", Nom: "Aria", Joueur: "J1" },
  A: { Type: "invite", Nom: "Brann" }, B: { Type: "mercenaire", Nom: "Aldo" }, ACH: { Type: "achete", Nom: "Sel", Joueur: "J2" },
  R: { Type: "recrue_clan", Nom: "Cyra", Libre: true, Joueur: "J1" } } };
await section(async () => {
  verifier("libres : les PNJ, invités, mercenaires et recrues du clan ; pas Thémès, ni les héros, ni les personnages achetés",
    CP.libreAuCamp("A", campRegles.Membres.A) && CP.libreAuCamp("B", campRegles.Membres.B) && CP.libreAuCamp("R", campRegles.Membres.R)
    && !CP.libreAuCamp("PNJ_THEMES_P1", campRegles.Membres.PNJ_THEMES_P1) && !CP.libreAuCamp("H1", campRegles.Membres.H1) && !CP.libreAuCamp("ACH", campRegles.Membres.ACH));
  verifier("la liste du camp, par nom", JSON.stringify(CP.personnagesLibres(campRegles)) === JSON.stringify(["B", "A", "R"]), JSON.stringify(CP.personnagesLibres(campRegles)));
  const persos = [{ idPersonnage: "H1", idJoueur: "J1", creeLe: 1 }, { idPersonnage: "R", idJoueur: "J1", creeLe: 2, librePourTous: true }];
  const j = CP.jouablesExpedition("J1", persos, campRegles, { Suiveurs: ["B"] });
  verifier("ce qu'il peut jouer : les siens, puis ceux du camp (pas le suiveur qui part déjà)", JSON.stringify(j) === JSON.stringify({ siens: ["H1"], libres: ["A", "R"] }), JSON.stringify(j));
  verifier("le héros principal se choisit parmi les personnages qui appartiennent uniquement au joueur (pas un personnage libre)",
    JSON.stringify(CP.personnagesDuJoueur("J1", persos).map(h => h.idPersonnage)) === '["H1"]' && CP.herosPrincipal("J1", persos, { J1: "R" }) === "H1");
  const sansRien = [{ idPersonnage: "H9", idJoueur: "J3", statut: "Mort" }, { idPersonnage: "A", idJoueur: "J3", librePourTous: true }];
  verifier("…sauf s'il n'en a plus : son héros principal mort, un PNJ du camp qu'il joue", CP.herosPrincipal("J3", sansRien, { J3: "A" }) === "A" && CP.herosPrincipal("J3", sansRien, {}) === null);
  verifier("l'incarner la première fois : il lui faut sa classe ; un héros, Thémès ou un mort, non",
    /pas encore de classe/.test(CP.peutIncarner(campRegles, "B", { Nom_PNJ: "Aldo" })) && CP.peutIncarner(campRegles, "A", { Nom_PNJ: "Brann", Classe: "Guerrier" }) === ""
    && CP.peutIncarner(campRegles, "R", null) === "" && /pas libre/.test(CP.peutIncarner(campRegles, "H1", null)) && /pas libre/.test(CP.peutIncarner(campRegles, "PNJ_THEMES_P1", null))
    && /mort/.test(CP.peutIncarner(campRegles, "A", { Classe: "Guerrier", Statut: "Mort" })));
  const f = CP.ficheIncarnee("A", { Nom_PNJ: "Brann", Race: "Nain", Classe: "Guerrier", URL_Cloudinary: "u.png", XP: 140, Images_Camp: [{ url: "c1" }] }, { partie: "P1", joueur: "J2", caracs: { force: 14, con: 15 }, maintenant: 5 });
  verifier("sa fiche d'aventurier : son nom, sa race, sa classe, son XP, ses images ; à ce joueur, libre pour tous ; au repos",
    f.ID_Personnage === "A" && f.Prenom_Personnage === "Brann" && f.Race === "Nain" && f.Classe === "Guerrier" && f.XP === 140 && f.URL_Cloudinary === "u.png" && f.Images_Camp.length === 1
    && f.ID_Joueur === "J2" && f.ID_Partie === "P1" && f.Libre_Pour_Tous === true && f.PNJ_Source === "A" && f.Actif === false && f.Statut === "Vivant" && f.Camp === "Allié", JSON.stringify(f).slice(0, 160));
  verifier("…ses PV et ses objets par ses caracs, comme à la création (app.js) ; pas de compétences : les joueurs les forgent",
    f.PV_Max === 70 && f.Objets_Max === 5 && f.Competences_Max === 6 && f.Deck_Equipe.length === 0 && /return 50 \+ 4 \* \(con - 10\);/.test(lire("app.js")));
  verifier("le camp de la création de la partie : une région au hasard, avec sa carte (et ses terrains, quand on sait les lire)",
    CP.regionAuHasard({ 1: { image: "a" }, 2: { image: null }, 3: { image: "b" } }, () => true, () => 0.99) === 3 && CP.regionAuHasard({ 1: { image: "a" }, 3: { image: "b" } }, n => n === 1, () => 0.99) === 1
    && CP.regionAuHasard({ 2: { image: null } }) === 0);
  const calme = () => 0.99;
  const r = CP.journeeDuCamp({ camp: { Provisions: 10, Membres: { A: { Type: "invite", Nom: "Brann", Tache: null, Moral: 60 } } }, infos: { A: { incarne: true, caracs: {} } }, partis: [] }, calme);
  verifier("les blessures de sa fiche guérissent au camp, comme celles d'un héros", r && r.soinsHeros && r.soinsHeros.A >= 1, JSON.stringify(r && r.soinsHeros));
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

titre("2. JOUER UN PERSONNAGE DU CAMP EN EXPÉDITION (expedition.js)");
await section(async () => {
  const r = await p.evaluate(async () => {
    const attendre = (ms) => new Promise(r => setTimeout(r, ms));
    window.__docs = window.__docs || {}; window.ID_PARTIE_COURANTE = "P1";
    localStorage.setItem("ID_JOUEUR_COURANT", "J1");
    window.__docs["Monde_PNJ/A"] = { Nom_PNJ: "Brann", Race: "Nain", Classe: "Guerrier", Caracs: { force: 14, dex: 10, con: 15, int: 8, sag: 10, cha: 9 }, URL_Cloudinary: "brann.png", XP: 40, Statut: "Vivant", ID_Partie: "P1" };
    window.__docs["Monde_PNJ/B"] = { Nom_PNJ: "Aldo", Race: "Humain", Statut: "Vivant", ID_Partie: "P1" };
    window.__docs["Personnages/H1"] = { ID_Personnage: "H1", ID_Partie: "P1", ID_Joueur: "J1", Prenom_Personnage: "Aria", Race: "Humain", Classe: "Pisteur", Statut: "Vivant", Actif: true, Cree_Le: 1 };
    window.__docs["Systeme_Parties/P1"] = { Camp: { Position: { Region: 7, x: 0.5, y: 0.5 }, Caisse: 100, Provisions: 20, Membres: {
        PNJ_THEMES_P1: { Type: "pnj", Nom: "Thémès", Narrateur: true, Moral: 60 }, H1: { Type: "heros", Nom: "Aria", Joueur: "J1", Moral: 60 },
        A: { Type: "invite", Nom: "Brann", Moral: 60 }, B: { Type: "mercenaire", Nom: "Aldo", Moral: 40 }, ACH: { Type: "achete", Nom: "Sel", Joueur: "J2", Moral: 100 } } },
      Expedition: { Numero: 1, Montee: true, Emplacements: [null, null, null], Suiveurs: [], Provisions_Prevues: 5 } };
    window.PERSOS_JOUEURS_PARTIE = [window.persoDocVersFront("H1", window.__docs["Personnages/H1"])];
    window.appliquerVoyageDeLaPartie = (d) => { window.PARTIE_DATA = d; window.appliquerCampDeLaPartie(d); };
    window.__relaisPartie = true;
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"])));
    const X = window.EXPEDITION;
    const liste = X.jouablesExpedition();
    const refusB = await X.prendrePlace(0, "B");
    const okA = await X.prendrePlace(0, "A");
    await attendre(80);
    const copie = (v) => v ? JSON.parse(JSON.stringify(v)) : null;
    const fiche = copie(window.__docs["Personnages/A"]), caracs = copie(window.__docs["Caracteristiques/A"]);
    const ram = (window.PERSOS_JOUEURS_PARTIE || []).find(h => h.idPersonnage === "A"), enRam = ram ? { idJoueur: ram.idJoueur, librePourTous: ram.librePourTous } : null;
    const place = (window.__docs["Systeme_Parties/P1"].Expedition.Emplacements || [])[0];
    const principal = ((window.__docs["Systeme_Parties/P1"].Heros_Principaux) || {}).J1 || null;
    const actifs = { H1: window.__docs["Personnages/H1"].Actif, A: (window.__docs["Personnages/A"] || {}).Actif };
    const infos = await window.CAMP.infosMembres();
    // Un autre joueur : il ne prend pas le personnage d'une place déjà prise…
    localStorage.setItem("ID_JOUEUR_COURANT", "J2");
    const vol = await X.prendrePlace(1, "A");
    const apresVol = window.__docs["Personnages/A"].ID_Joueur;
    // …mais le prend quand elle est libérée (« pas exclusif ») : la même fiche, à lui.
    localStorage.setItem("ID_JOUEUR_COURANT", "J1"); await X.quitterPlace(0); await attendre(30);
    localStorage.setItem("ID_JOUEUR_COURANT", "J2");
    const prise = await X.prendrePlace(1, "A"); await attendre(50);
    return { liste, refusB, okA, fiche, caracs, enRam: enRam && { idJoueur: enRam.idJoueur, libre: enRam.librePourTous }, place, principal, actifs,
             infoA: infos.A, vol, apresVol, prise, apresPrise: window.__docs["Personnages/A"].ID_Joueur, nbFiches: Object.keys(window.__docs).filter(k => k.startsWith("Personnages/")).length };
  });
  verifier("la liste : les siens (Aria), puis ceux du camp libres pour tous (Aldo, Brann ; pas Thémès ni le personnage acheté)",
    JSON.stringify(r.liste) === JSON.stringify({ siens: ["H1"], libres: ["B", "A"] }), JSON.stringify(r.liste));
  verifier("un PNJ sans classe : la place est refusée (la classe d'abord, dans la Gestion du camp)", /pas encore de classe/.test(r.refusB), r.refusB);
  verifier("prendre Brann : la place est à lui", r.okA === "" && r.place && r.place.Perso === "A" && r.place.Joueur === "J1", r.okA + " " + JSON.stringify(r.place));
  verifier("…il reçoit sa fiche d'aventurier (même identifiant), à ce joueur, libre pour tous, ses caracs de PNJ",
    r.fiche && r.fiche.ID_Joueur === "J1" && r.fiche.Libre_Pour_Tous === true && r.fiche.PNJ_Source === "A" && r.fiche.Classe === "Guerrier" && r.fiche.XP === 40 && r.caracs && r.caracs.con === 15, JSON.stringify(r.fiche).slice(0, 140));
  verifier("…la partie le sait tout de suite (la liste des héros)", r.enRam && r.enRam.idJoueur === "J1" && r.enRam.libre === true, JSON.stringify(r.enRam));
  verifier("…il est le héros joué (actif), Aria au repos ; le héros principal reste Aria (pas de choix écrit pour Brann)", r.actifs.A === true && r.actifs.H1 === false && r.principal !== "A", JSON.stringify(r.actifs) + " " + r.principal);
  verifier("la Gestion du camp : il reste un PNJ du camp (il peut partir s'il est malheureux), ses caracs et sa classe de sa fiche", r.infoA && r.infoA.incarne === true && r.infoA.heros === false && r.infoA.caracs.con === 15 && r.infoA.classe === "Guerrier", JSON.stringify(r.infoA).slice(0, 140));
  verifier("un autre joueur ne le prend pas pendant qu'il part avec quelqu'un (sa fiche ne change pas de main)", /part déjà/.test(r.vol) && r.apresVol === "J1", r.vol + " " + r.apresVol);
  verifier("la place libérée, un autre joueur le prend : la même fiche passe à lui", r.prise === "" && r.apresPrise === "J2" && r.nbFiches === 2, `${r.prise} ${r.apresPrise} ${r.nbFiches}`);
  const g = lire("grimoire_groupe.js");
  verifier("la page Expédition : les personnages du camp sont des boutons comme les siens (grimoire_groupe.js)", /EXP_\(\)\.jouablesExpedition\(moi\)/.test(g) && /libres\.map\(id => bouton\(id, classeLibre\(id\)\)\)/.test(g));
});

titre("3. LES COMPÉTENCES : LA FORGE OUVERTE À TOUS POUR UN PERSONNAGE DU CAMP ; LE HÉROS PRINCIPAL MORT");
await section(async () => {
  const fi = lire("grimoire_fiches.js");
  verifier("tous les contrôles « c'est mon personnage » de la fiche (caracs, talents, compétences, Forge, inventaire) l'acceptent", (fi.match(/\|\| !!h\.librePourTous;/g) || []).length === 7);
  verifier("aucune compétence générée pour une recrue : ce sont les joueurs qui les forgent", !/genererCompetences|competencesDeRecrue/.test(lire("recrutement.js") + lire("expedition.js")));
  const r = await p.evaluate(async () => {
    localStorage.setItem("ID_JOUEUR_COURANT", "J3");
    window.__docs["Personnages/H9"] = { ID_Personnage: "H9", ID_Partie: "P1", ID_Joueur: "J3", Prenom_Personnage: "Ivo", Statut: "Mort", Cree_Le: 3 };
    window.PERSOS_JOUEURS_PARTIE.push(window.persoDocVersFront("H9", window.__docs["Personnages/H9"]));
    const F = window.GRIMOIRE_FICHES;
    const html = F.htmlChoixHeros();
    const ok = await F.definirHerosPrincipal("A");
    await new Promise(r => setTimeout(r, 50));
    return { html, ok, joueur: window.__docs["Personnages/A"].ID_Joueur, choix: (window.__docs["Systeme_Parties/P1"].Heros_Principaux || {}).J3, principal: F.herosPrincipalDe("J3"), html2: F.htmlChoixHeros() };
  });
  verifier("plus de personnage à soi (son héros mort) : le menu propose les personnages du camp", /Les personnages du camp/.test(r.html) && /value="A"/.test(r.html) && /value="B"/.test(r.html) && /Choisis un personnage du camp/.test(r.html), r.html.replace(/\s+/g, " ").slice(0, 200));
  verifier("…en choisir un l'incarne et en fait son héros principal (non exclusif)", r.ok === true && r.joueur === "J3" && r.choix === "A" && r.principal === "A", JSON.stringify({ ok: r.ok, j: r.joueur, c: r.choix, p: r.principal }));
  verifier("…le menu le montre choisi, avec « Sa fiche »", /value="A" selected/.test(r.html2) && /data-fa="fiche-principal"/.test(r.html2));
});

titre("4. LE CAMP À LA CRÉATION DE LA PARTIE (app.js, camp.js)");
await section(async () => {
  verifier("une nouvelle partie naît avec « Camp_A_Creer » (app.js, creerNouvellePartie)", /Statut: "En_cours",[\s\S]{0,200}Camp_A_Creer: true/.test(lire("app.js")));
  const r = await p.evaluate(async () => {
    const attendre = (ms) => new Promise(r => setTimeout(r, ms));
    localStorage.setItem("ID_JOUEUR_COURANT", "J1");
    window.ID_PARTIE_COURANTE = "P2";
    window.PERSOS_JOUEURS_PARTIE = []; window.PERSOS_PARTIE = [];
    window.CARTES_REGIONALES = { 4: { nom: "Les Collines Rousses", image: "collines.jpg" }, 9: { nom: "La Mer", image: null } };
    // Un autre poste a pris la main il y a peu : on ne pose rien.
    window.__docs["Systeme_Parties/P2"] = { ID_Partie: "P2", Statut: "En_cours", Camp_A_Creer: { Par: "J9", Le: Date.now() } };
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P2"])));
    await attendre(300);
    const attente = !window.__docs["Systeme_Parties/P2"].Camp;
    // La partie toute neuve : le premier poste pose le camp.
    window.__docs["Systeme_Parties/P2"].Camp_A_Creer = true;
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P2"])));
    for (let i = 0; i < 40 && !window.__docs["Systeme_Parties/P2"].Camp; i++) await attendre(100);
    await attendre(100);
    const d = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P2"]));
    const encore = await window.CAMP.creerCampAuto();
    // Un héros arrive après : il est du clan, et Thémès l'aime ; la recrue du clan est libre pour tous.
    window.__docs["Personnages/N1"] = { ID_Personnage: "N1", ID_Partie: "P2", ID_Joueur: "J1", Prenom_Personnage: "Nora", Statut: "Vivant", Cree_Le: 9 };
    window.__docs["Personnages/R1"] = { ID_Personnage: "R1", ID_Partie: "P2", ID_Joueur: "J2", Prenom_Personnage: "Rix", Statut: "Vivant", Cree_Le: 10 };
    window.__docs["Systeme_Parties/P2"].Camp.Recrutement_En_Cours = { Par: "J2", Le: 1 };
    window.appliquerVoyageDeLaPartie(JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P2"])));
    await attendre(50);
    window.PERSOS_JOUEURS_PARTIE = ["N1", "R1"].map(id => window.persoDocVersFront(id, window.__docs["Personnages/" + id]));
    await window.CAMP.rattraperMembres();
    await attendre(80);
    const m = window.__docs["Systeme_Parties/P2"].Camp.Membres;
    return { attente, d, encore, alertes: window.__alertes || 0, n1: m.N1, r1: m.R1, libreR1: window.__docs["Personnages/R1"].Libre_Pour_Tous,
             lienN1: window.__docs["Systeme_Parties/P2/Liens/PNJ_THEMES_P2~N1"] || null, lienR1: !!window.__docs["Systeme_Parties/P2/Liens/PNJ_THEMES_P2~R1"],
             themes: window.__docs["Monde_PNJ/PNJ_THEMES_P2"] || null };
  });
  const c = r.d.Camp || {};
  verifier("un autre poste pose déjà le camp (sa main est récente) : rien n'est posé deux fois", r.attente);
  verifier("la partie toute neuve : son camp se pose tout seul, dans une région au hasard qui a sa carte",
    c.Position && c.Position.Region === 4 && c.Position.x > 0 && c.Position.x < 1, JSON.stringify(c.Position));
  verifier("…100 drachmes, 28 provisions, Thémès (sa fiche) ; le drapeau tombe", c.Caisse === 100 && c.Provisions === 28 && c.Membres && c.Membres.PNJ_THEMES_P2 && r.themes && r.themes.Nom_PNJ === "Thémès" && !("Camp_A_Creer" in r.d),
    JSON.stringify({ caisse: c.Caisse, prov: c.Provisions, drapeau: r.d.Camp_A_Creer }));
  verifier("…le groupe part du camp (sa place sur la carte)", r.d.Position_Groupe && r.d.Position_Groupe.Region === 4 && r.d.Position_Groupe.x === c.Position.x, JSON.stringify(r.d.Position_Groupe));
  verifier("…une seule fois : un second poste ne le recrée pas", r.encore === null);
  verifier("un héros arrivé après est du clan, et Thémès l'aime (son lien, l'affection au maximum)", r.n1 && r.n1.Type === "heros" && r.lienN1 && r.lienR1, JSON.stringify(r.lienN1).slice(0, 120));
  verifier("la recrue créée pour le groupe arrive libre pour tous (sa fiche d'aventurier le dit)", r.r1 && r.r1.Type === "recrue_clan" && r.libreR1 === true, JSON.stringify(r.r1));
});

titre("5. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 490 ou plus (trace_combat.js, version.json)", v >= 490 && JSON.parse(lire("version.json")).version >= 490, `${v}`);
  const idx = lire("index.html");
  const imports = ["conseil.js", "recrutement.js", "retour_camp.js", "camp_avatars.js", "camp.js", "camp_scene.js", "tache_en_cours.js", "deplacement_camp.js", "expedition.js"].map(f => (lire(f).match(/camp_pur\.js\?v=(\d+)/) || [])[1]);
  verifier("tous les modules lisent les mêmes règles (camp_pur.js, une seule version)", new Set(imports).size === 1 && imports[0] !== undefined, imports.join(","));
  verifier("index.html monte les fichiers touchés", /src="expedition\.js\?v=(\d+)"/.test(idx) && Number(idx.match(/src="expedition\.js\?v=(\d+)"/)[1]) >= 8 && Number(idx.match(/src="camp\.js\?v=(\d+)"/)[1]) >= 13 && Number(idx.match(/src="grimoire_fiches\.js\?v=(\d+)"/)[1]) >= 27);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
