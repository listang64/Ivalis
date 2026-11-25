// v478 — LE CLAN NOMADE, ÉTAPE 2 : LE CAMP, THÉMÈS ET LES DONNÉES.
// Le document « Ivalis — Le clan nomade » (CLAN_NOMADE.md) : « Sur le document de la partie, ajouter le camp :
// position sur la carte, caisse du groupe (drachmes), provisions, jauge des ressources naturelles, membres et leur
// tâche, intendant, tâche en cours, numéro de la prochaine expédition, réputation chiffrée par région. Bourse
// personnelle de chaque joueur (vide pour l'instant). Bouton DEV provisoire, à côté de l'autre : crée Thémès et
// fait apparaître l'icône du camp dans la carte régionale de la Forêt des Murmures (100 drachmes, 28 provisions).
// Thémès : vieil homme humain, sage et bienveillant ; seul narrateur ; affection au maximum pour les personnages
// des joueurs ; ne combat jamais ; ne peut être ni blessé ni tué ; ne peut pas être intendant. Jauge des
// ressources : une capture de la carte autour du camp, une valeur de 0 à 100 selon le tableau des terrains. Le
// logo du camp sur la carte globale. »
// Lancer : node tests_monstres/corrections_v478.mjs
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
const SP = await import(path.join(RACINE, 'social_pur.js'));

// =========================================================================
titre("1. LES CHIFFRES DU CAMP (camp_pur.js)");
// =========================================================================
await section(async () => {
  verifier("au départ : 100 drachmes dans la caisse du groupe, 28 provisions", CP.CAMP_DEPART.caisse === 100 && CP.CAMP_DEPART.provisions === 28);
  verifier("le moral de départ : PNJ de départ, invité, héros principal 60 ; mercenaire 40 ; personnage acheté 100",
    CP.MORAL_DEPART.pnj === 60 && CP.MORAL_DEPART.invite === 60 && CP.MORAL_DEPART.heros === 60 && CP.MORAL_DEPART.mercenaire === 40 && CP.MORAL_DEPART.achete === 100);
  const c = CP.campInitial({ partie: "P1", position: { Region: 7, x: 0.4, y: 0.6 }, jauge: 90, terrain: "Forêt", maintenant: 5,
    membres: [{ id: "H1", nom: "Thorin", joueur: "J1" }, { id: "H2", nom: "Lyra", joueur: "J2" }] });
  const ids = Object.keys(c.Membres);
  verifier("le camp : sa place, sa caisse, ses provisions, sa jauge", c.Position.Region === 7 && c.Position.x === 0.4 && c.Caisse === 100 && c.Provisions === 28 && c.Ressources.Jauge === 90 && c.Ressources.Terrain === "Forêt", JSON.stringify(c).slice(0, 200));
  verifier("ses membres : Thémès d'abord (PNJ, narrateur), puis les héros des joueurs, sans tâche, moral 60",
    ids[0] === "PNJ_THEMES_P1" && c.Membres.PNJ_THEMES_P1.Narrateur === true && c.Membres.PNJ_THEMES_P1.Type === "pnj" && c.Membres.H1.Type === "heros" && c.Membres.H1.Joueur === "J1"
    && ids.every(i => c.Membres[i].Tache === null && c.Membres[i].Moral === 60), JSON.stringify(c.Membres));
  verifier("pas d'intendant, la prochaine expédition est la n° 1, la réputation par région vide", c.Intendant === null && c.Prochaine_Expedition === 1 && JSON.stringify(c.Reputation_Regions) === "{}");
});

titre("2. THÉMÈS");
await section(async () => {
  const t = CP.THEMES;
  verifier("un vieil homme humain, sage et bienveillant", t.nom === "Thémès" && t.race === "Humain" && /vieil homme humain, sage et bienveillant/.test(t.physique));
  verifier("seul narrateur ; ne combat jamais ; ne peut être ni blessé ni tué ; reste à vie ; jamais intendant ; part en expédition",
    t.narrateur && t.combat === false && t.immortel && t.resteAVie && t.intendantPossible === false && t.partEnExpedition);
  const l = CP.lienThemesVers("PNJ_THEMES_P1", "H1");
  verifier("son affection pour un héros : au maximum (affinité des fils invisibles = 100)", SP.affinite(l.axes) === 100 && l.de === "PNJ_THEMES_P1" && l.vers === "H1", String(SP.affinite(l.axes)));
  verifier("sa psyché est valide pour les fils invisibles (sage : prudent ; bienveillant : empathique)",
    JSON.stringify(SP.psycheValide(t.psyche).traits) === JSON.stringify(t.psyche.traits) && t.psyche.traits.empathie >= 80 && t.psyche.traits.prudence >= 70);
});

titre("3. LA JAUGE DES RESSOURCES : LE TABLEAU DES TERRAINS");
await section(async () => {
  const cas = [["Forêt de pins", 95, 95], ["Une rivière", 50, 80], ["Plaine", 99, 80], ["prairie", 61, 61], ["Colline", 10, 40], ["Montagne", 70, 60],
               ["Marais", undefined, 40], ["Désert de sable", 5, 10], ["Neige", 35, 30], ["foret_riviere", 85, 85]];
  const r = cas.map(([t, v]) => CP.jaugeDuTerrain(t, v));
  verifier("forêt/rivière 80-100, plaine 60-80, colline/montagne 40-60, marais 30-50, désert/neige 10-30 (la valeur de l'IA ramenée dans sa fourchette)",
    cas.every(([, , attendu], i) => r[i] === attendu), JSON.stringify(r));
  verifier("un terrain inconnu : la valeur bornée entre 0 et 100", CP.jaugeDuTerrain("brume étrange", 130) === 100 && CP.jaugeDuTerrain("", undefined) === 50);
  verifier("la région « Forêt des Murmures » se retrouve par son nom", CP.regionNommee({ 3: { nom: "Les Plaines d'Or" }, 7: { nom: "La Forêt des murmures" } }, "Forêt des Murmures") === 7);
  const env = lire("environnement_mj.js");
  verifier("MIA_RESSOURCES reçoit la capture de la carte autour du camp, et le tableau des terrains",
    /window\.estimerRessourcesA = async function/.test(env) && /const decoupe = await decouper\(p\);/.test(env) && /Forêt ou rivière : 80 à 100/.test(env) && /Désert ou neige : 10 à 30/.test(env));
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
  window.jouerSonClic = () => {}; window.__alertes = []; window.alert = (t) => window.__alertes.push(t); window.confirm = () => true;
  localStorage.setItem("ivalis_DEV_MODE", "on");
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => e.style.display = e.id === "ecran-jeu" ? "block" : "none");
  window.__docs = window.__docs || {};
  window.ID_PARTIE_COURANTE = "P1";
  window.__docs["Systeme_Parties/P1"] = { Lieu_Actuel: "" };
  window.PERSOS_JOUEURS_PARTIE = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", statut: "Vivant" }, { idPersonnage: "H2", idJoueur: "J2", prenom: "Lyra", statut: "Vivant" },
    { idPersonnage: "H3", idJoueur: "J3", prenom: "Gorm", statut: "Mort" }];
  window.CARTES_REGIONALES = { 3: { nom: "Les Plaines d'Or" }, 7: { nom: "La Forêt des Murmures" } };
  window.__places = []; window.placePoiValable = (n, x, y) => { window.__places.push(n); return true; };
  window.__ressources = []; window.estimerRessourcesA = async (pos) => { window.__ressources.push(pos); return { terrain: "Forêt ou rivière", valeur: 120 }; };
  if (typeof window.actualiserRegionsDev === "function") window.actualiserRegionsDev();
});

titre("4. LE BOUTON DEV : THÉMÈS ET LE CAMP, EN FORÊT DES MURMURES");
await section(async () => {
  const bouton = await p.evaluate(() => { const b = document.getElementById("btn-camp-dev"), r = document.getElementById("btn-regions-dev");
    return { existe: !!b, voisin: !!(b && r && b.parentNode === r.parentNode), visible: !!(b && b.getBoundingClientRect().width > 0) }; });
  verifier("un bouton DEV, à côté de celui des régions, visible en mode DEV", bouton.existe && bouton.voisin && bouton.visible, JSON.stringify(bouton));
  // (v491) Le bouton DEV refait désormais l'avatar de Thémès et les images du camp (corrections_v491) ; le camp, lui,
  // naît avec la partie (v490) : sa création se vérifie ici par la fonction.
  await p.evaluate(() => window.CAMP.creerCampDev()); await p.waitForTimeout(600);
  const d = await p.evaluate(() => ({ partie: window.__docs["Systeme_Parties/P1"], fiche: window.__docs["Monde_PNJ/PNJ_THEMES_P1"], ame: window.__docs["Systeme_Parties/P1/Ames/PNJ_THEMES_P1"],
    l1: window.__docs["Systeme_Parties/P1/Liens/PNJ_THEMES_P1~H1"], l2: window.__docs["Systeme_Parties/P1/Liens/PNJ_THEMES_P1~H2"], l3: window.__docs["Systeme_Parties/P1/Liens/PNJ_THEMES_P1~H3"],
    places: window.__places, ressources: window.__ressources, alertes: window.__alertes }));
  const c = d.partie.Camp || {};
  verifier("le camp est posé dans la Forêt des Murmures (région 7), à une place où l'on peut marcher", c.Position && c.Position.Region === 7 && d.places.every(n => n === 7) && c.Position.x > 0.1 && c.Position.x < 0.9, JSON.stringify(c.Position));
  verifier("…100 drachmes, 28 provisions", c.Caisse === 100 && c.Provisions === 28);
  verifier("…la jauge estimée sur la capture de la carte autour du camp, ramenée au tableau (forêt : 100 au plus)", d.ressources.length === 1 && d.ressources[0].Region === 7 && c.Ressources.Jauge === 100 && c.Ressources.Terrain === "Forêt ou rivière", JSON.stringify(c.Ressources));
  verifier("…ses membres : Thémès et les héros vivants (pas le mort)", Object.keys(c.Membres || {}).join() === "PNJ_THEMES_P1,H1,H2", Object.keys(c.Membres || {}).join());
  verifier("…l'intendant, la prochaine expédition, la réputation par région", c.Intendant === null && c.Prochaine_Expedition === 1 && JSON.stringify(c.Reputation_Regions) === "{}");
  verifier("la bourse de chaque joueur : prête, vide", JSON.stringify(d.partie.Bourses_Joueurs) === "{}");
  verifier("Thémès a sa fiche (Monde_PNJ) : humain, narrateur, ne combat pas, immortel, membre du clan",
    d.fiche && d.fiche.Nom_PNJ === "Thémès" && d.fiche.Race === "Humain" && d.fiche.Narrateur && d.fiche.Ne_Combat_Pas && d.fiche.Immortel && d.fiche.Membre_Du_Clan && d.fiche.ID_Partie === "P1", JSON.stringify(d.fiche || {}).slice(0, 160));
  verifier("…son âme (sa psyché de vieux sage bienveillant)", d.ame && d.ame.type === "pnj" && d.ame.psyche && d.ame.psyche.traits.empathie >= 80 && d.ame.Narrateur);
  verifier("…une affection au maximum pour les personnages des joueurs (fils invisibles)", d.l1 && d.l2 && !d.l3 && d.l1.axes.confiance === 100 && d.l1.axes.respect === 100 && d.l1.axes.attachement === 100);
  verifier("un mot le dit (la jauge comprise)", d.alertes.some(t => /Thémès/.test(t) && /100\/100/.test(t)), JSON.stringify(d.alertes));
});

titre("5. LE LOGO DU CAMP SUR LES CARTES");
await section(async () => {
  const r = await p.evaluate(() => {
    window.appliquerCampDeLaPartie(window.__docs["Systeme_Parties/P1"]);
    const camp = window.__docs["Systeme_Parties/P1"].Camp;
    const ici = window.elementCampCarte(7, { largeur: 1000, hauteur: 600 }), ailleurs = window.elementCampCarte(3, { largeur: 1000, hauteur: 600 });
    window.placerCampMonde((n) => (n === 7 ? { x: 120, y: 80 } : null), 44);
    const monde = document.getElementById("camp-monde");
    return { ici: ici && { left: parseFloat(ici.style.left), top: parseFloat(ici.style.top), w: parseFloat(ici.style.width), src: ici.querySelector("img").src },
             ailleurs: !!ailleurs, attendu: { x: camp.Position.x * 1000 - 18, y: camp.Position.y * 600 - 18 },
             monde: monde && { src: monde.src, left: monde.style.left, top: monde.style.top, w: monde.style.width, vu: monde.style.display }, logo: window.IMAGE_GROUPE_MONDE,
             hook: /elementCampCarte/.test(String(window.dessinerVillagesRegion)) };
  });
  verifier("sur la carte régionale du camp : le logo de la carte du monde, à sa place", r.ici && r.ici.src === r.logo && Math.abs(r.ici.left - r.attendu.x) < 0.5 && Math.abs(r.ici.top - r.attendu.y) < 0.5 && r.ici.w === 36, JSON.stringify(r).slice(0, 240));
  verifier("…pas sur une autre région", !r.ailleurs);
  verifier("…dessiné avec les villages de la carte", r.hook);
  verifier("sur la carte du monde : le même logo, au centre de la région du camp", r.monde && r.monde.src === r.logo && r.monde.left === "120px" && r.monde.top === "80px" && r.monde.w === "44px" && r.monde.vu === "block", JSON.stringify(r.monde));
});

titre("6. SANS FORÊT DES MURMURES : RIEN N'EST CRÉÉ");
await section(async () => {
  const r = await p.evaluate(async () => { window.__docs["Systeme_Parties/P2"] = {}; window.ID_PARTIE_COURANTE = "P2"; window.appliquerCampDeLaPartie({});
    window.CARTES_REGIONALES = { 3: { nom: "Les Plaines d'Or" } }; window.__alertes = [];
    const c = await window.CAMP.creerCampDev(); return { c, doc: window.__docs["Systeme_Parties/P2"], alertes: window.__alertes }; });
  verifier("la région introuvable : pas de camp, un mot le dit", r.c === null && !r.doc.Camp && r.alertes.some(t => /introuvable/.test(t)), JSON.stringify(r));
});

titre("7. LES VERSIONS");
await section(async () => {
  const v = await p.evaluate(() => window.VERSION_IVALIS);
  verifier("version 478 ou plus (trace_combat.js, version.json)", v >= 478 && JSON.parse(lire("version.json")).version >= 478, `${v} / ${JSON.parse(lire("version.json")).version}`);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
