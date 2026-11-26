// v497 — L'AFFECTION, ET LES LIENS FORTS : L'AMITIÉ PROFONDE ET L'AMOUR.
// Nico : « un système d'affection, qui peut se transformer en amour ou amitié profonde entre les personnages » ;
// attirances découvertes en jouant ; plusieurs liens possibles ; pas d'effet en combat ; l'amour entre les héros de
// deux joueurs (s'ils sont d'accord) ; Thémès : une amitié, jamais un amour.
// Lancer : node tests_monstres/corrections_v497.mjs
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
      .filter(([, v]) => w.every(c => { const x = String(c.champ).split(".").reduce((o, k) => o == null ? o : o[k], v); return c.op === "==" ? x === c.valeur : c.op === "in" ? c.valeur.includes(x) : true; }))
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




const P = await import(path.join(RACINE, 'social_pur.js'));
const CP = await import(path.join(RACINE, 'camp_pur.js'));

titre("1. LES RÈGLES (social_pur.js)");
await section(async () => {
  verifier("un septième axe : l'attirance (0 à 100)", P.AXES.includes("attirance") && P.BORNES.attirance[0] === 0 && P.BORNES.attirance[1] === 100 && P.NOMS_AXES.attirance === "Attirance");
  verifier("trois actions la font naître ou reculer : un geste tendre, courtiser, repousser", P.ACTIONS.geste_tendre.cible.attirance > 0 && P.ACTIONS.courtiser.acteur.attirance > 0 && P.ACTIONS.repousser.cible.attirance < 0);
  const ames = { A: { id: "A", type: "pnj", nom: "Ara", psyche: {} }, B: { id: "B", type: "pnj", nom: "Bors", psyche: {} }, PNJ_THEMES_P1: { id: "PNJ_THEMES_P1", type: "pnj", nom: "Thémès", Narrateur: true, psyche: {} } };
  const r = P.appliquerEvenements({ ames, liens: {} }, [{ type: "geste_tendre", acteur: "A", cible: "B", gravite: 2, resume: "x" }, { type: "geste_tendre", acteur: "A", cible: "PNJ_THEMES_P1", gravite: 2, resume: "y" }], { presents: ["A", "B", "PNJ_THEMES_P1"] });
  verifier("un geste tendre : l'attirance naît des deux côtés", r.etat.liens["B~A"].axes.attirance > 0 && r.etat.liens["A~B"].axes.attirance > 0);
  verifier("…jamais envers Thémès, ni de Thémès (une amitié, jamais un amour)", !(r.etat.liens["PNJ_THEMES_P1~A"] && r.etat.liens["PNJ_THEMES_P1~A"].axes.attirance) && !(r.etat.liens["A~PNJ_THEMES_P1"] && r.etat.liens["A~PNJ_THEMES_P1"].axes.attirance));
  const proche = { attachement: 80, confiance: 60, familiarite: 60 };
  verifier("l'affection : 0,5 attachement + 0,3 confiance + 0,2 familiarité ; les paliers", P.affection(proche) === 70 && P.palierAffection(proche) === "proche" && P.palierAffection({ attachement: 50, confiance: 40 }) === "sympathie"
    && P.palierAffection({ attachement: 80, confiance: 60, familiarite: 20 }) === "affection");
  verifier("très proche avec de l'attirance : un amour ; sans : une amitié profonde ; Thémès : toujours une amitié",
    P.evolutionLienFort({ de: "A", vers: "B", axes: { ...proche, attirance: 50 } }, ames).type === "amour" && P.evolutionLienFort({ de: "A", vers: "B", axes: proche }, ames).type === "amitie"
    && P.evolutionLienFort({ de: "A", vers: "PNJ_THEMES_P1", axes: { ...proche, attirance: 90 } }, ames).type === "amitie");
  verifier("un PNJ : son lien se scelle tout seul ; un héros : son joueur décide (« proposer »)", P.evolutionLienFort({ de: "A", vers: "B", axes: proche }, ames).action === "sceller"
    && P.evolutionLienFort({ de: "H", vers: "A", axes: proche }, { ...ames, H: { type: "heros" } }).action === "proposer");
  verifier("une trahison (l'affection s'effondre) : le lien se brise ; un amour sans attirance s'éteint en amitié",
    P.evolutionLienFort({ de: "A", vers: "B", axes: { attachement: 10 }, fort: { type: "amour" } }, ames).action === "rompre"
    && JSON.stringify(P.evolutionLienFort({ de: "A", vers: "B", axes: { ...proche, attirance: 5 }, fort: { type: "amour" } }, ames)) === '{"action":"eteindre","type":"amitie"}');
  verifier("un lien déclaré entre deux héros ne se défait jamais tout seul", P.evolutionLienFort({ de: "H", vers: "J", axes: {}, fort: { type: "amour" }, declare: true }, {}).action === null);
  // Le camp : une paire qui a son alchimie, qui travaille ensemble et s'accorde, se découvre une attirance (jamais avec Thémès).
  let paire = null;
  for (let i = 0; i < 200 && !paire; i++) if (P.alchimie("X" + i, "Y")) paire = ["X" + i, "Y"];
  const tendre = { traits: { empathie: 90, sociabilite: 90, orgueil: 10 } };
  const ev = CP.evolutionAffinites({ presents: paire, jours: 12, taches: { [paire[0]]: "chasser", Y: "chasser" }, psyches: { [paire[0]]: tendre, Y: tendre }, moraux: {} });
  const sansAlchimie = (() => { for (let i = 0; i < 200; i++) if (!P.alchimie("Z" + i, "Y")) return "Z" + i; })();
  const ev2 = CP.evolutionAffinites({ presents: [sansAlchimie, "Y"], jours: 12, taches: { [sansAlchimie]: "chasser", Y: "chasser" }, psyches: { [sansAlchimie]: tendre, Y: tendre }, moraux: {} });
  const ev3 = CP.evolutionAffinites({ presents: ["PNJ_THEMES_P1", paire[0]], jours: 12, taches: {}, psyches: {}, moraux: {}, membres: { PNJ_THEMES_P1: { Narrateur: true } } });
  verifier("au camp, une paire qui a son alchimie se découvre une attirance (une paire sur quatre, jamais avec Thémès)",
    ev.every(x => x.axes.attirance > 0) && ev2.every(x => !x.axes.attirance) && ev3.every(x => !x.axes.attirance), JSON.stringify(ev[0] && ev[0].axes));
  let n = 0; for (let i = 0; i < 400; i++) if (P.alchimie("Q" + i, "R" + i)) n++;
  verifier("…une sur quatre environ", Math.abs(n / 400 - 0.25) < 0.06, `${n}/400`);
});

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);
await p.evaluate(() => {
  window.jouerSonClic = () => {}; window.confirm = () => true; localStorage.setItem("ID_JOUEUR_COURANT", "J1"); localStorage.setItem("ivalis_DEV_MODE", "on");
  window.__docs = window.__docs || {}; window.ID_PARTIE_COURANTE = "P1";
  window.__docs["Systeme_Parties/P1"] = { Nom_Du_Groupe: "Les Lames" };
  window.appliquerVoyageDeLaPartie = (d) => { window.PARTIE_DATA = d; };
  window.__relaisPartie = true;
  window.PARTIE_DATA = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]));
  window.PERSOS_JOUEURS_PARTIE = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", statut: "Vivant" }, { idPersonnage: "H2", idJoueur: "J2", prenom: "Lyra", statut: "Vivant" }];
  const ame = (id, type, nom) => { window.__docs["Systeme_Parties/P1/Ames/" + id] = { id, type, nom, psyche: {}, statut: "vivant" }; };
  ame("A", "pnj", "Ara"); ame("H1", "heros", "Thorin"); ame("H2", "heros", "Lyra");
  window.__docs["Systeme_Parties/P1/Liens/A~H1"] = { de: "A", vers: "H1", axes: { confiance: 60, attachement: 80, familiarite: 60, attirance: 50, respect: 0, dette: 0, crainte: 0 } };
  window.__docs["Systeme_Parties/P1/Liens/H1~A"] = { de: "H1", vers: "A", axes: { confiance: 20, attachement: 20, familiarite: 30, attirance: 0, respect: 0, dette: 0, crainte: 0 } };
});

titre("2. UN PNJ S'ÉPREND D'UN HÉROS : SON LIEN SE SCELLE, LE JOUEUR DIT CE QUE RESSENT SON HÉROS");
await section(async () => {
  const r = await p.evaluate(async () => {
    const faits = await window.SOCIAL.verifierLiensForts("P1", ["A~H1"]);
    await new Promise(r => setTimeout(r, 50));
    const lien = window.__docs["Systeme_Parties/P1/Liens/A~H1"], partie = window.__docs["Systeme_Parties/P1"];
    const souv = Object.entries(window.__docs).filter(([k]) => k.startsWith("Systeme_Parties/P1/Souvenirs/fort_")).map(([, v]) => v);
    window.PARTIE_DATA = JSON.parse(JSON.stringify(partie));
    window.LIENS_FORTS.majPostits();
    const postit = document.querySelector('#postits-liens-forts .postit-lien-fort[data-cle="H1~A"]');
    return { faits, fort: lien.fort, prop: (partie.Liens_Proposes || {})["H1~A"], souv: souv.map(s => s.texte), moments: (window.__docs["Systeme_Parties/P1/Social/etat"] || {}).momentsLiens || [],
             postit: postit ? postit.textContent.replace(/\s+/g, " ").trim() : "", boutons: postit ? [...postit.querySelectorAll("[data-lf]")].map(x => x.dataset.lf) : [] };
  });
  verifier("Ara, très proche et attirée : son amour pour Thorin se scelle", r.fort && r.fort.type === "amour", JSON.stringify(r.faits));
  verifier("…un souvenir (« Je crois que j'aime Thorin »), un moment pour le narrateur", r.souv.some(t => /aime Thorin/.test(t)) && r.moments.some(m => /Ara vient de comprendre qu'il·elle aime Thorin/.test(m.texte)));
  verifier("…le joueur de Thorin reçoit un post-it : que ressent Thorin ? (amitié, amour, rien de plus)", r.prop && r.prop.joueur === "J1" && /Que ressent Thorin/.test(r.postit) && r.boutons.join() === "amitie,amour,rien", r.postit.slice(0, 160));
  const rep = await p.evaluate(async () => {
    document.querySelector('#postits-liens-forts .postit-lien-fort[data-cle="H1~A"] [data-lf="amour"]').click();
    await new Promise(r => setTimeout(r, 300));
    return { lien: window.__docs["Systeme_Parties/P1/Liens/H1~A"], prop: (window.__docs["Systeme_Parties/P1"].Liens_Proposes || {})["H1~A"] || null };
  });
  verifier("le joueur choisit « de l'amour » : le lien de Thorin vers Ara est un amour choisi, le post-it s'en va", rep.lien.fort && rep.lien.fort.type === "amour" && rep.lien.fort.choisi && !rep.prop, JSON.stringify(rep.lien.fort));
  const ctx = await p.evaluate(async () => window.SOCIAL.contexteDuMJ({ idPartie: "P1", pnjs: [{ id: "A", fiche: { Nom_PNJ: "Ara" } }], heros: [{ idPersonnage: "H1", prenom: "Thorin" }] }));
  verifier("le narrateur le sait : « Ara et Thorin : ils s'aiment », avec pudeur ; le moment à jouer", /LES CŒURS/.test(ctx) && /Ara et Thorin : ils s'aiment/.test(ctx) && /pudeur/.test(ctx) && /À l'instant : Ara vient de comprendre/.test(ctx), ctx.slice(ctx.indexOf("LES CŒURS"), ctx.indexOf("LES CŒURS") + 200));
  const ctx2 = await p.evaluate(async () => window.SOCIAL.contexteDuMJ({ idPartie: "P1", pnjs: [{ id: "A", fiche: { Nom_PNJ: "Ara" } }], heros: [{ idPersonnage: "H1", prenom: "Thorin" }] }));
  verifier("…le moment ne se joue qu'une fois", !/À l'instant/.test(ctx2) && /ils s'aiment/.test(ctx2));
});

titre("3. LA RUPTURE");
await section(async () => {
  const r = await p.evaluate(async () => {
    await window.SOCIAL.ajusterLien("P1", "A", "H1", { attachement: -40, confiance: -30 });
    await new Promise(r => setTimeout(r, 50));
    return { lien: window.__docs["Systeme_Parties/P1/Liens/A~H1"], souv: Object.keys(window.__docs).some(k => k.startsWith("Systeme_Parties/P1/Souvenirs/rupture_A~H1")) };
  });
  verifier("une trahison (l'affection s'effondre) : l'amour d'Ara se brise, elle s'en souvient", !r.lien.fort && r.lien.rupture && r.lien.rupture.type === "amour" && r.souv, JSON.stringify(r.lien.rupture));
});

titre("4. DEUX HÉROS : UNE DÉCLARATION, L'AUTRE JOUEUR ACCEPTE");
await section(async () => {
  const r = await p.evaluate(async () => {
    const refus = await window.LIENS_FORTS.declarer("H1", "H2", "amour");
    await new Promise(r => setTimeout(r, 50));
    const decl = (window.__docs["Systeme_Parties/P1"].Declarations_Liens || {})["H1~H2"];
    localStorage.setItem("ID_JOUEUR_COURANT", "J2");
    window.PARTIE_DATA = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]));
    window.LIENS_FORTS.majPostits();
    const postit = document.querySelector('#postits-liens-forts .postit-lien-fort[data-decl="H1~H2"]');
    const texte = postit ? postit.textContent.replace(/\s+/g, " ").trim() : "";
    if (postit) postit.querySelector('[data-lf="accepter"]').click();
    await new Promise(r => setTimeout(r, 300));
    localStorage.setItem("ID_JOUEUR_COURANT", "J1");
    return { refus, decl, texte, l12: window.__docs["Systeme_Parties/P1/Liens/H1~H2"], l21: window.__docs["Systeme_Parties/P1/Liens/H2~H1"], reste: (window.__docs["Systeme_Parties/P1"].Declarations_Liens || {})["H1~H2"] || null };
  });
  verifier("Thorin déclare son amour à Lyra : la déclaration attend le joueur de Lyra", r.refus === "" && r.decl && r.decl.pour === "J2" && /Thorin déclare son amour à Lyra/.test(r.texte), r.texte.slice(0, 120));
  verifier("…accepté : un amour des deux côtés, déclaré (jamais défait tout seul)", r.l12.fort.type === "amour" && r.l21.fort.type === "amour" && r.l12.declare && r.l21.declare && !r.reste);
  const f = await p.evaluate(async () => { await window.LIENS_FORTS.lire(true); return { thorin: window.LIENS_FORTS.deLui("H1").map(x => x.id).sort(), icone: window.LIENS_FORTS.icone("H2"), nom: window.LIENS_FORTS.nom("A") }; });
  verifier("les liens chers de Thorin (le cache de la partie) : Lyra, Ara (son amour choisi) ; la marque ❤", JSON.stringify(f.thorin) === '["A","H2"]' && f.icone === "❤" && f.nom === "Ara", JSON.stringify(f));
  const d = await p.evaluate(async () => { await window.LIENS_FORTS.defaire("H1", "H2"); return { l12: window.__docs["Systeme_Parties/P1/Liens/H1~H2"].fort || null, l21: window.__docs["Systeme_Parties/P1/Liens/H2~H1"].fort || null }; });
  verifier("défaire un lien déclaré : des deux côtés", !d.l12 && !d.l21);
});

titre("5. CE QU'ON VOIT");
await section(async () => {
  const r = await p.evaluate(async () => {
    const M = await import("/grimoire_liens.js?v=14");
    const pts = M.disposerRadar([{ id: "A", axes: { attachement: 80 }, lien: { fort: { type: "amour" } }, reciproque: false }, { id: "B", axes: { attachement: 80 }, lien: { fort: { type: "amitie" } }, reciproque: true }], { P: window.SOCIAL });
    return pts.map(q => [q.id, q.couleur, q.pointilles, q.epaisseur]);
  });
  verifier("le réseau : un fil rouge pour l'amour (en pointillé s'il n'est pas réciproque), doré pour l'amitié profonde", JSON.stringify(r) === JSON.stringify([["A", "#b3121b", true, 3.6], ["B", "#b8862a", false, 3.6]]), JSON.stringify(r));
  const gl = lire("grimoire_liens.js"), gf = lire("grimoire_fiches.js"), gg = lire("grimoire_gestion.js"), dp = lire("discussion_privee.js");
  verifier("l'encart d'un lien : son lien fort (réciproque ou non), sinon le palier d'affection", /function htmlCoeur\(l, choix\)/.test(gl) && /Affection : \$\{echapper\(P\.NOMS_PALIERS\[pal\]\)\}/.test(gl));
  verifier("la fiche : « Liens chers », déclarer depuis son héros principal au héros d'un autre joueur, défaire", /<div class="titre-encart">Liens chers<\/div>/.test(gf) && /data-fa="declarer-lien" data-type="amour"/.test(gf) && /data-fa="defaire-lien"/.test(gf));
  verifier("la gestion du camp : ❤ ou ✦ à côté du nom ; la discussion privée : le PNJ le sait (avec pudeur)", /\$\{marqueLien\(id\)\}/.test(gg) && /TU L'AIMES/.test(dp));
  verifier("aucun effet en combat (rien dans le moteur)", !/fort\.type|liensForts|LIENS_FORTS/.test(lire("cerveau_combat.js") + lire("moteur_pur.js") + lire("combat_etat.js")));
  const ix = lire("index.html");
  verifier("index.html charge le module et son style", /src="liens_forts\.js\?v=\d+"/.test(ix) && /href="liens_forts\.css\?v=\d+"/.test(ix));
});

titre("6. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 497 ou plus", v >= 497 && JSON.parse(lire("version.json")).version >= 497, `${v}`);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
