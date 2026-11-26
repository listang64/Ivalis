// v499 — L'AMITIÉ PROFONDE QUI DEVIENT AMOUR ; LE FLIRT EN RP FAIT BOUGER L'ATTIRANCE.
// Nico : « Amitié profonde peut passer en amour oui. Et pareil en rp si un joueur flirt avec un pnj ça fait bouger ou
// non l'attirance. »
// Lancer : node tests_monstres/corrections_v499.mjs
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

titre("1. LES RÈGLES (social_pur.js)");
await section(async () => {
  const ames = { A: { id: "A", type: "pnj", nom: "Ara", psyche: {} }, H: { id: "H", type: "heros", nom: "Thorin", psyche: {} }, PNJ_THEMES_P1: { id: "PNJ_THEMES_P1", type: "pnj", nom: "Thémès", Narrateur: true, psyche: {} } };
  const proche = { confiance: 70, attachement: 80, familiarite: 70 };
  const ev = (de, vers, axes, extra = {}) => P.evolutionLienFort({ de, vers, axes, fort: { type: "amitie" }, ...extra }, ames);
  verifier("une amitié profonde sans assez d'attirance (39) reste une amitié", ev("A", "H", { ...proche, attirance: 39 }).action === null);
  verifier("un PNJ : à 40 d'attirance, son amitié devient d'elle-même un amour (« approfondir »)", JSON.stringify(ev("A", "H", { ...proche, attirance: 40 })) === '{"action":"approfondir","type":"amour"}');
  verifier("un héros : son joueur décide (« proposerAmour »)", JSON.stringify(ev("H", "A", { ...proche, attirance: 55 })) === '{"action":"proposerAmour","type":"amour"}');
  verifier("…plus jamais redemandé s'il a préféré rester ami (amourRefuse)", ev("H", "A", { ...proche, attirance: 90 }, { amourRefuse: true }).action === null);
  verifier("Thémès : son amitié ne devient jamais un amour", ev("PNJ_THEMES_P1", "H", { ...proche, attirance: 90 }).action === null && ev("A", "PNJ_THEMES_P1", { ...proche, attirance: 90 }).action === null);
  verifier("deux héros déclarés : rien de tout seul (ils se déclarent de nouveau)", ev("H", "A", { ...proche, attirance: 90 }, { declare: true }).action === null);
  verifier("le moment pour le narrateur", /n'est plus seulement de l'amitié : c'est de l'amour/.test(P.momentDuLien("Ara", "Thorin", "approfondir", "amour")));
  verifier("la réceptivité au flirt : rien si le PNJ en veut au héros, 0,5 indifférent, jusqu'à 1,5 s'il a de l'affection",
    P.receptiviteAttirance({ attachement: -30, confiance: -20 }) === 0 && P.receptiviteAttirance({}) === 0.5 && P.receptiviteAttirance({ attachement: 90, confiance: 90, familiarite: 90 }) === 1.5
    && P.receptiviteAttirance({ attachement: 30, confiance: 20, familiarite: 20 }) > 0.5);
  // Le flirt en RP : Thorin (héros) courtise Ara (PNJ), tel que MIA_SOCIAL le relève dans le récit.
  const flirt = (axesAraVersThorin) => {
    const etat = { ames: { A: { ...ames.A }, H: { ...ames.H } }, liens: axesAraVersThorin ? { "A~H": { de: "A", vers: "H", axes: { ...P.axesVides(), ...axesAraVersThorin } } } : {} };
    const r = P.appliquerEvenements(etat, [{ type: "courtiser", acteur: "H", cible: "A", gravite: 1, discret: true, resume: "Thorin complimente Ara sur ses yeux.", temoins: [] }], { presents: ["A", "H"], tour: 1 });
    return { ara: P.nombre(((r.etat.liens["A~H"] || {}).axes || {}).attirance) - P.nombre((axesAraVersThorin || {}).attirance), thorin: P.nombre(((r.etat.liens["H~A"] || {}).axes || {}).attirance) };
  };
  const inconnu = flirt(null), amie = flirt({ attachement: 70, confiance: 60, familiarite: 60 }), fachee = flirt({ attachement: -40, confiance: -40 });
  verifier("un joueur flirte avec un PNJ : l'attirance du héros monte, celle du PNJ aussi", inconnu.thorin > 0 && inconnu.ara > 0, JSON.stringify(inconnu));
  verifier("…le PNJ y est plus sensible s'il est déjà proche du héros", amie.ara > inconnu.ara, `${inconnu.ara} < ${amie.ara}`);
  verifier("…et pas du tout s'il lui en veut", fachee.ara === 0 && fachee.thorin > 0, JSON.stringify(fachee));
  const s = lire("social.js");
  verifier("la consigne de MIA_SOCIAL : le flirt d'un joueur avec un PNJ, même seulement dit, est « courtiser »", /y compris quand un joueur fait flirter son héros avec un PNJ, même s'il ne fait que le dire/.test(s) && !/L'attirance se découvre, rarement/.test(s));
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
  ame("A", "pnj", "Ara"); ame("B", "pnj", "Bors"); ame("H1", "heros", "Thorin"); ame("H2", "heros", "Lyra");
  const proche = { confiance: 70, attachement: 80, familiarite: 70, respect: 0, dette: 0, crainte: 0 };
  // Ara et Thorin : une amitié profonde des deux côtés ; l'attirance d'Ara a grandi.
  window.__docs["Systeme_Parties/P1/Liens/A~H1"] = { de: "A", vers: "H1", axes: { ...proche, attirance: 45 }, fort: { type: "amitie", le: 1 } };
  window.__docs["Systeme_Parties/P1/Liens/H1~A"] = { de: "H1", vers: "A", axes: { ...proche, attirance: 10 }, fort: { type: "amitie", le: 1, choisi: true } };
  // Bors : Thorin est son ami profond, et Thorin s'est épris de lui.
  window.__docs["Systeme_Parties/P1/Liens/H1~B"] = { de: "H1", vers: "B", axes: { ...proche, attirance: 60 }, fort: { type: "amitie", le: 1, choisi: true } };
});

titre("2. ARA (PNJ) : SON AMITIÉ DEVIENT AMOUR ; LE JOUEUR DE THORIN DIT SI C'EST RÉCIPROQUE");
await section(async () => {
  const r = await p.evaluate(async () => {
    const faits = await window.SOCIAL.verifierLiensForts("P1", ["A~H1"]);
    await new Promise(r => setTimeout(r, 50));
    const partie = window.__docs["Systeme_Parties/P1"];
    window.PARTIE_DATA = JSON.parse(JSON.stringify(partie));
    window.LIENS_FORTS.majPostits();
    const postit = document.querySelector('#postits-liens-forts .postit-lien-fort[data-cle="H1~A"]');
    const souv = Object.entries(window.__docs).filter(([k]) => k.startsWith("Systeme_Parties/P1/Souvenirs/fort_A~H1")).map(([, v]) => v.texte);
    return { faits, fort: window.__docs["Systeme_Parties/P1/Liens/A~H1"].fort, prop: (partie.Liens_Proposes || {})["H1~A"], souv,
             moments: ((window.__docs["Systeme_Parties/P1/Social/etat"] || {}).momentsLiens || []).map(m => m.texte),
             postit: postit ? postit.textContent.replace(/\s+/g, " ").trim() : "", boutons: postit ? [...postit.querySelectorAll("[data-lf]")].map(x => x.dataset.lf) : [] };
  });
  verifier("l'amitié d'Ara pour Thorin devient un amour (depuis l'amitié)", r.fort.type === "amour" && r.fort.depuis === "amitie", JSON.stringify(r.faits));
  verifier("…un souvenir, un moment pour le narrateur", r.souv.some(t => /plus seulement de l'amitié : je l'aime/.test(t)) && r.moments.some(t => /Ara s'aperçoit/.test(t)));
  verifier("…le joueur de Thorin : « Est-ce devenu de l'amour ? » (de l'amour / rester amis)", r.prop && r.prop.evolution === "amour" && /Est-ce devenu de l'amour/.test(r.postit) && r.boutons.join() === "amour,rien", r.postit.slice(0, 160));
  const rep = await p.evaluate(async () => {
    document.querySelector('#postits-liens-forts .postit-lien-fort[data-cle="H1~A"] [data-lf="rien"]').click();
    await new Promise(r => setTimeout(r, 300));
    const l = window.__docs["Systeme_Parties/P1/Liens/H1~A"];
    window.__docs["Systeme_Parties/P1/Liens/H1~A"].axes.attirance = 80;   // même si son attirance grandit encore
    const encore = await window.SOCIAL.verifierLiensForts("P1", ["H1~A"]);
    return { fort: l.fort, refuse: l.amourRefuse, encore, prop: (window.__docs["Systeme_Parties/P1"].Liens_Proposes || {})["H1~A"] || null };
  });
  verifier("« rester amis » : Thorin garde son amitié, on ne le lui redemande plus", rep.fort.type === "amitie" && rep.refuse === true && !rep.prop && rep.encore.length === 0, JSON.stringify(rep));
});

titre("3. THORIN (HÉROS) S'ÉPREND DE SON AMI BORS : SON JOUEUR DÉCIDE");
await section(async () => {
  const r = await p.evaluate(async () => {
    const faits = await window.SOCIAL.verifierLiensForts("P1", ["H1~B"]);
    await new Promise(r => setTimeout(r, 50));
    window.PARTIE_DATA = JSON.parse(JSON.stringify(window.__docs["Systeme_Parties/P1"]));
    window.LIENS_FORTS.majPostits();
    const postit = document.querySelector('#postits-liens-forts .postit-lien-fort[data-cle="H1~B"]');
    const texte = postit ? postit.textContent.replace(/\s+/g, " ").trim() : "";
    const avant = window.__docs["Systeme_Parties/P1/Liens/H1~B"].fort.type;
    if (postit) postit.querySelector('[data-lf="amour"]').click();
    await new Promise(r => setTimeout(r, 300));
    return { faits, texte, avant, fort: window.__docs["Systeme_Parties/P1/Liens/H1~B"].fort, prop: (window.__docs["Systeme_Parties/P1"].Liens_Proposes || {})["H1~B"] || null };
  });
  verifier("pas tout seul : le post-it au joueur de Thorin", r.avant === "amitie" && r.faits.some(f => f.action === "proposerAmour") && /Thorin tient profondément à Bors… et peut-être plus/.test(r.texte), r.texte.slice(0, 140));
  verifier("« de l'amour » : son amitié devient un amour choisi", r.fort.type === "amour" && r.fort.choisi && r.fort.depuis === "amitie" && !r.prop, JSON.stringify(r.fort));
});

titre("4. DEUX HÉROS DÉJÀ AMIS PROFONDS : LA FICHE PERMET DE DÉCLARER UN AMOUR");
await section(async () => {
  const gf = lire("grimoire_fiches.js");
  verifier("déjà amis : seul « Déclarer un amour » reste", /const dejaAmis = !!avecMoi && \[avecMoi\.sien, avecMoi\.envers\]\.every\(l => !l \|\| l\.fort\.type === "amitie"\)/.test(gf)
    && /\$\{avecMoi \? "" : `<button[^`]*data-type="amitie"/.test(gf));
  const r = await p.evaluate(async () => {
    ["H1~H2", "H2~H1"].forEach(k => { const [de, vers] = k.split("~"); window.__docs["Systeme_Parties/P1/Liens/" + k] = { de, vers, declare: true, axes: {}, fort: { type: "amitie", le: 1, choisi: true } }; });
    await window.LIENS_FORTS.declarer("H1", "H2", "amour");
    await window.SOCIAL.repondreDeclaration("P1", "H1~H2", true);
    return [window.__docs["Systeme_Parties/P1/Liens/H1~H2"].fort.type, window.__docs["Systeme_Parties/P1/Liens/H2~H1"].fort.type];
  });
  verifier("…acceptée : l'amitié déclarée devient un amour des deux côtés", r.join() === "amour,amour", r.join());
});

titre("5. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  const ix = lire("index.html");
  verifier("version 499 ; social.js?v=19, liens_forts.js?v=2, grimoire_fiches.js?v=29 ; social_pur.js?v=8", v === 499 && JSON.parse(lire("version.json")).version === 499
    && /src="social\.js\?v=19"/.test(ix) && /src="liens_forts\.js\?v=2"/.test(ix) && /src="grimoire_fiches\.js\?v=29"/.test(ix) && /social_pur\.js\?v=8"/.test(lire("social.js")), `${v}`);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
