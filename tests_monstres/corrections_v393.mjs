// v393 — LE BOUTON DU TOUR S'ÉTEINT APRÈS LA COMPÉTENCE ; LES JAUGES DU PION DEUX FOIS MOINS ÉPAISSES ;
// LES CRÉATURES : SEULE LA TRICHE DU NIVEAU DU GROUPE.
// Nico : « en combat, quand on valide la compétence, il y a bien Fin de tour, mais quand l'animation
// se passe ça se remet sur Valider compétence : affiche plutôt direct la version grisée » ; « quand on
// clique sur un token, réduis de moitié la grosseur des deux jauges » ; « vérifie que les monstres
// n'ont en bonus de dégâts que les bonus liés au niveau du groupe, plus les bonus fixes d'avant ».
// (La mise en place du livre : celle de corrections_v373.)
//
// Lancer : node tests_monstres/corrections_v393.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lire = (f) => { try { return fs.readFileSync(path.join(RACINE, f), 'utf-8'); } catch (e) { return ""; } };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' }); res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({}); export const getApp = () => ({}); export const BANC_IVALIS = true;`;
// Une petite base en mémoire : ce qui s'écrit (setDoc, addDoc, updateDoc) se relit (getDoc, transactions).
const FAUX_FIRESTORE = `
  const docs = () => (window.__docs = window.__docs || {});
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...c) => ({ chemin: c.join("/") }); export const collection = (_db, ...c) => ({ col: c.join("/") });
  export const getDoc = async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => d || {}, id: r.chemin.split("/").pop() }; };
  export const query = (c) => c; export const where = () => ({}); export const orderBy = () => ({}); export const limit = () => ({});
  export const getDocs = async () => ({ forEach() {}, docs: [], empty: true, size: 0 });
  export const setDoc = async (r, d) => { docs()[r.chemin] = d; (window.__sets = window.__sets || []).push({ chemin: r.chemin, data: d }); };
  export const updateDoc = async (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d }); docs()[r.chemin] = Object.assign({}, docs()[r.chemin] || {}, d); };
  export const deleteDoc = async () => {};
  export const addDoc = async (c, d) => { (window.__ajouts = window.__ajouts || []).push({ col: c.col, data: d }); const id = "A" + window.__ajouts.length; docs()[c.col + "/" + id] = d; return { id }; };
  export const onSnapshot = () => () => {}; export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
  export const runTransaction = async (_db, f) => f({ get: async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => d || {} }; },
      update: (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d, tx: true }); docs()[r.chemin] = Object.assign({}, docs()[r.chemin] || {}, d); } });
  export const increment = (k) => k; export const deleteField = () => null;
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const serverTimestamp = () => Date.now();
  export class FieldPath {} export const Timestamp = { now: () => Date.now() };
`;
const CAPTURES = process.env.V393_CAPTURES || "";
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
// La table (le banc n'a pas Internet) : du bois dessiné sur place, 1672 × 941.
const TABLE = await (async () => { const pg = await b.newPage(); const u = await pg.evaluate(() => { const c = document.createElement("canvas"); c.width = 1672; c.height = 941;
  const x = c.getContext("2d"); x.fillStyle = "#130c06"; x.fillRect(0, 0, 1672, 941); x.fillStyle = "#7a4a26"; x.fillRect(170, 55, 1470, 835); return c.toDataURL("image/png"); });
  await pg.close(); return Buffer.from(u.split(",")[1], "base64"); })();
// Les cartes régionales (le banc n'a pas Internet) : dessinées sur place ; le
// désert d'Etheria (5) et l'île aux marchés (7) en paysage, les autres en portrait.
const dessinerCarte = async (w, h, teinte, texte) => { const pg = await b.newPage(); const u = await pg.evaluate(([w, h, teinte, texte]) => { const c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d"); x.fillStyle = teinte; x.fillRect(0, 0, w, h); x.strokeStyle = "#3a2210"; x.lineWidth = 12; x.strokeRect(20, 20, w - 40, h - 40);
  x.fillStyle = "#3a2210"; x.font = "bold 90px serif"; x.fillText(texte, 80, h / 2); return c.toDataURL("image/png"); }, [w, h, teinte, texte]);
  await pg.close(); return Buffer.from(u.split(",")[1], "base64"); };
const CARTE_PORTRAIT = await dessinerCarte(1000, 1400, "#c9b48a", "PORTRAIT");
const CARTE_PAYSAGE = await dessinerCarte(1800, 1100, "#b9c48a", "PAYSAGE");
const imagesDemandees = [];
const p = await b.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
// Les IA (Gemini), simulées : le Narrateur lite, les annonces, le titre d'un chapitre.
const appelsIA = [];
let iaEnPanne = false, refusPlume = false, panneCle1 = false;
await p.route('**', r => { const u = r.request().url();
  if (u.startsWith(base)) return r.continue();
  if (/BG_tjiigl/.test(u)) return r.fulfill({ status: 200, contentType: 'image/png', body: TABLE });
  if (/res\.cloudinary\.com\/.*IMG_(1894|1892|1900|1893|1897|1903|1979|2189|1984|1977|1981|2229|2230|2231|2238|2239|2240|2241|2242|2243|2244|2248)_/.test(u)) { imagesDemandees.push(u); return r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: /IMG_1893|IMG_1903|IMG_2231/.test(u) ? CARTE_PAYSAGE : CARTE_PORTRAIT }); }
  return r.abort(); });
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**/generativelanguage.googleapis.com/**', r => {
  const corps = JSON.parse(r.request().postData() || "{}");
  const sys = ((corps.systemInstruction || {}).parts || [{}])[0].text || "", txt = (((corps.contents || [])[0] || {}).parts || [{}])[0].text || "";
  const cle = new URL(r.request().url()).searchParams.get("key");
  appelsIA.push({ url: r.request().url(), sys, txt, cle, config: corps.generationConfig || {} });
  if (panneCle1 && cle === "cle-banc") return r.fulfill({ status: 402, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: '{"error":{"message":"Your prepayment credits are depleted"}}' });
  if (refusPlume && /gemini-3\.8-flash/.test(r.request().url())) return r.fulfill({ status: 404, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: '{"error":{"message":"inconnu"}}' });
  if (iaEnPanne) return r.fulfill({ status: 500, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: '{"error":{"message":"panne"}}' });
  let rep = "Je vois Thorin lever sa chope bien haut ; il trinque, avec un sourire qui ne présage rien de bon, « à la santé de ce vieux grincheux de Varos ! »";
  if (/donnes leur titre aux chapitres/.test(sys)) rep = "La tournée du nain";
  else if (/annonce du jeu/.test(sys)) rep = "Le jour se lève sur la route, et je compte nos pas.";
  r.fulfill({ status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'},
    body: JSON.stringify({ candidates: [{ content: { parts: [{ text: rep }] } }], usageMetadata: { totalTokenCount: 120 } }) });
});
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && /Grimoire/.test(m.text())) console.log('CONSOLE', m.text()); });
await p.goto(base + '/index.html'); await p.waitForTimeout(1200);
const titre = (t) => console.log("\n" + t);
const section = async (f) => { try { await f(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 180)); } };
const etat = () => p.evaluate(() => window.grimoireEtat());
const page = () => p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex());
const attendreQue = async (f, ms = 6000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await p.waitForTimeout(100); } return false; };
const cliquer = (sel) => p.evaluate((sel) => document.querySelector(sel).click(), sel);
const centre = (sel) => p.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, sel);
const dans = (x, y, sel) => p.evaluate(([x, y, sel]) => { const el = document.elementFromPoint(x, y); return !!(el && el.closest(sel)); }, [x, y, sel]);
const dessus = (x, y) => p.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? (el.id || "") + "|" + (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) : "rien"; }, [x, y]);
const angleDe = (t) => { const m = /matrix\(([-\d.e]+), ([-\d.e]+)/.exec(t || ""); return m ? Math.atan2(Number(m[2]), Number(m[1])) * 180 / Math.PI : 0; };
const relayer = (msgs, initial) => p.evaluate(([m, i]) => window.livreRecitMessages(m, { initial: i }), [msgs, !!initial]);

// Le joueur J1 joue Thorin ; J2 joue Lyra.
await p.evaluate(() => {
  localStorage.setItem("ID_JOUEUR_COURANT", "J1"); localStorage.setItem("ivalis_GEMINI_API_KEY", "cle-banc"); localStorage.setItem("ivalis_GEMINI_API_KEY_2", "cle-seconde");
  window.__sons = []; window.__clics = 0; window.__appels = []; window.__entrees = []; window.__tours = 0; window.__jets = []; window.__vieux = [];
  window.jouerSonEvenement = (id) => { window.__sons.push([id, Date.now()]); return true; };
  window.jouerSonClic = () => { window.__clics++; };
  window.fermerToutesLesFenetres = () => {};
  window.COMPTE_JOUEUR = { nom: "Ben", email: "ben@ivalis.fr", admin: false };
  window.LISTE_PARTIES_CACHE = [{ id: "P1", nom: "Les Lames d'Héra" }];
  const heros = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Thorin", nom: "Ironfoot", race: "Nain", classe: "Guerrier", actif: true, urlCloudinary: "portrait-thorin.png" },
                 { idPersonnage: "H2", idJoueur: "J2", prenom: "Lyra", nom: "Sombreval", actif: true, urlCloudinary: "" }];
  window.PERSOS_JOUEURS_PARTIE = heros; window.PERSOS_PARTIE = heros.slice();
  window.PORTES_GRIMOIRE = {
    verifierCle: async () => true, creerPartie: async () => "P_NEUVE",
    verifierMdpPartie: async (id, m) => ({ ok: m === "sel" }),
    entrerDansPartie: (id) => { window.__entrees.push(id); window.ID_PARTIE_COURANTE = id; document.getElementById("ecran-jeu").style.display = "block"; }
  };
  ["ouvrirChatbox", "ouvrirMenuPersonnages", "ouvrirPopupRencontre", "ouvrirParametres"].forEach(n => { window[n] = () => window.__appels.push(n); });
  window.declencherTourIA = async () => { window.__tours++; };
  window.__vraiJet = window.lancerJetPourHeros;
  window.lancerJetPourHeros = async (id, c) => { window.__jets.push([id, c]); return true; };
  // L'ancien chat : ce qu'il ferait par-dessus le livre.
  window.lancerRecitDynamique = () => window.__vieux.push("parchemin");
  window.majRecitDynamique = () => window.__vieux.push("parchemin+");
  window.annoncerJetsDemandes = () => window.__vieux.push("bandeau");
  const attente = window.afficherEcranAttente;
  window.afficherEcranAttente = (t) => { window.__vieux.push("attente:" + (t || "")); };
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== "ecran-grimoire") e.style.display = "none"; });
  window.afficherGrimoire();
});
await p.waitForTimeout(1300);
await p.evaluate(() => window.ouvrirGrimoire());
await p.waitForTimeout(1200);


// Les boîtes de la carte du livre (dans le désordre) : 1 la forêt, 3 le désert (paysage),
// 7 le mont Pletia, 8 l'île aux marchés (paysage). Le groupe est dans le désert (5).
const boite = (n, x, y) => ({ numero: n, points: [{ x, y }, { x: x + 140, y }, { x: x + 140, y: y + 110 }, { x, y: y + 110 }] });
await p.evaluate((zones) => {
  window.ZONES_LIVRE = zones;
  window.__nuages = 0;
  const vraies = window.jouerTraverseeNuages;
  window.jouerTraverseeNuages = async (o) => { window.__nuages++; return vraies ? vraies(o) : null; };
}, { 8: boite(8, 1000, 520), 1: boite(1, 180, 200), 3: boite(3, 380, 560), 7: boite(7, 1150, 220) });
await cliquer("#grimoire-btn-charger");
await p.waitForTimeout(700);
await cliquer('#grimoire-liste-parties [data-id="P1"]');
await p.waitForTimeout(150);
await p.fill("#grimoire-mdp-partie", "sel");
await p.evaluate(() => window.appliquerVoyageDeLaPartie && window.appliquerVoyageDeLaPartie({ Position_Groupe: { Region: 5, x: 0.42, y: 0.55 } }));
await cliquer("#grimoire-valider-partie");
await p.evaluate(() => window.appliquerVoyageDeLaPartie && window.appliquerVoyageDeLaPartie({ Position_Groupe: { Region: 5, x: 0.42, y: 0.55 } }));
const pose = () => attendreQue(() => p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getState() === "read" && !window.GRIMOIRE.defileEnCours()), 8000);
await p.waitForTimeout(1500);

// =========================================================================
titre("1. LA COMPÉTENCE PARTIE : LE BOUTON DU TOUR RESTE ÉTEINT");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    window.PARTIE_DATA = Object.assign({}, window.PARTIE_DATA || {}, { Phase_Combat: "Resolution", File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C1" }] });
    window.COMBAT_PERSOS_JOUEUR = [{ idPersonnage: "H1", idJoueur: "J1" }]; window.COMBAT_INDEX_PERSO = 0;
    window.ETAT_CIBLAGE = null; window.CHEMIN_MOUVEMENT = [];
    const vrai = window.regimeDemande; let enVol = false;
    window.regimeDemande = Object.assign({}, vrai || {}, { actif: () => true, enVol: (id) => enVol && (!id || id === "H1") });
    window.actualiserBoutonFinTour(); const avant = window.MODE_BOUTON_FINTOUR;
    window.ETAT_CIBLAGE = { actif: true }; window.actualiserBoutonFinTour(); const vise = window.MODE_BOUTON_FINTOUR;
    // La cible validée : le ciblage se ferme, la carte part (la demande est en vol) — l'animation se joue.
    window.ETAT_CIBLAGE = null; enVol = true; window.actualiserBoutonFinTour();
    const pendant = { mode: window.MODE_BOUTON_FINTOUR, peut: window.PEUT_PASSER_TOUR, img: document.getElementById("img-hud-fintour").src };
    // La fin du tour rejouée : la demande tombe, la file passe au suivant.
    enVol = false; window.PARTIE_DATA.File_Attente_Combat = [{ idPersonnage: "H2", idCarte: "C9" }]; window.actualiserBoutonFinTour();
    const apres = window.MODE_BOUTON_FINTOUR;
    window.regimeDemande = vrai;
    return { avant, vise, pendant, apres };
  });
  verifier("mon tour, une carte en attente : « Valider compétence » ; en visant : « Fin de tour »", r.avant === "lancer" && r.vise === "fin_de_tour", JSON.stringify(r));
  verifier("la carte partie (l'animation se joue) : le bouton grisé, sans action — plus « Valider compétence »", r.pendant.mode === "eteint" && r.pendant.peut === false && /IMG_2134/.test(r.pendant.img), JSON.stringify(r.pendant));
  verifier("… puis le tour d'un autre : toujours éteint", r.apres === "eteint", r.apres);
  verifier("le bouton se rafraîchit dès que la demande part", /demandeEnVol = \(acteur \|\| ""\) \+ "\|" \+ nombre\(etat && etat\.manche, 1\);\s*\/\/[^\n]*\n\s*setTimeout\(\(\) => \{ if \(typeof window\.actualiserBoutonFinTour === "function"\) window\.actualiserBoutonFinTour\(\); \}, 0\);/.test(lire("regime_cerveau.js")));
});

// =========================================================================
titre("2. LES JAUGES DU PION SÉLECTIONNÉ : DEUX FOIS MOINS ÉPAISSES");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const t = document.createElement("div"); t.className = "token-vtt"; t.style.cssText = "position:absolute;left:300px;top:300px;width:200px;height:200px";
    t.innerHTML = `<div class="jauges-selection-token"><div class="jauge-selection jauge-selection-vie"></div><div class="jauge-selection jauge-selection-fatigue"></div></div>`;
    document.body.appendChild(t);
    const b = t.querySelector(".jauges-selection-token").getBoundingClientRect(), j = t.querySelector(".jauge-selection").getBoundingClientRect();
    const petit = document.createElement("div"); petit.className = "token-vtt"; petit.style.cssText = "position:absolute;left:600px;top:300px;width:20px;height:20px";
    petit.innerHTML = t.innerHTML; document.body.appendChild(petit);
    const pb = petit.querySelector(".jauges-selection-token").getBoundingClientRect(), pj = petit.querySelector(".jauge-selection").getBoundingClientRect();
    t.remove(); petit.remove();
    return { bloc: Math.round(b.height), jauge: Math.round(j.height), largeur: Math.round(b.width), petitBloc: Math.round(pb.height), petiteJauge: Math.round(pj.height) };
  });
  verifier("sur un pion de 200 px : le bloc fait 15 % (30 px, avant 60), chaque jauge 46 % du bloc ; la largeur ne change pas", r.bloc === 30 && r.jauge === 14 && r.largeur === 168, JSON.stringify(r));
  verifier("au plus petit cadrage : les planchers aussi divisés par deux (16 px, 7 px par jauge)", r.petitBloc === 16 && r.petiteJauge === 7, JSON.stringify(r));
});

// =========================================================================
titre("3. LES CRÉATURES : SEULE LA TRICHE DU NIVEAU DU GROUPE");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const mp = window.moteurPur, statures = ["Petit", "Normal", "Élite", "Boss"];
    const lire = () => ({ niveau: window.NIVEAU_GROUPE, triche: window.tricheMonstresActuelle(), parStature: statures.map(s => mp.bonusMonstreDe({ estMonstre: true, palier: s })),
      chef: mp.bonusMonstreDe({ estMonstre: true, palier: "Normal", leader: true }), heros: mp.bonusMonstreDe({ estMonstre: false, palier: "Boss" }),
      coup: mp.appliquerBonusMonstre(20, mp.bonusMonstreDe({ estMonstre: true, palier: "Boss" })) });
    const n1 = lire();
    const avant = window.NIVEAU_GROUPE; window.NIVEAU_GROUPE = 6; window.appliquerReglagesMonstres(window.REGLAGES_MONSTRES_BRUTS); const n6 = lire();
    window.NIVEAU_GROUPE = avant; window.appliquerReglagesMonstres(window.REGLAGES_MONSTRES_BRUTS);
    return { n1, n6, leader: window.REGLAGES_MONSTRES.leader.degats };
  });
  verifier("niveau 1 : +8 % pour toutes les statures (plus de +10 % fixes par stature comme avant)", r.n1.triche === 8 && r.n1.parStature.every(x => x === 8), JSON.stringify(r.n1));
  verifier("niveau 6 : la triche suit le niveau (+17 %), la même pour toutes", r.n6.triche === 17 && r.n6.parStature.every(x => x === 17), JSON.stringify(r.n6));
  verifier("un coup de 20 d'un Boss au niveau 1 : 21,6 (20 + 8 %) ; un héros n'a rien", r.n1.coup === 21.6 && r.n1.heros === 0, JSON.stringify(r.n1));
  verifier("(le chef garde son bonus de chef, en plus : +15 %)", r.n1.chef === 8 + r.leader && r.leader === 15, JSON.stringify(r));
  verifier("la chaîne de dégâts des créatures ne lit que ce bonus (bonusMonstreDe)", (lire("moteur_pur.js").match(/appliquerBonusMonstre\(attaque\.valeurBrute, bonusMonstre\)/g) || []).length === 2 && /const pct = window\.tricheDuNiveau\(window\.NIVEAU_GROUPE \|\| 1, tricheNiveau\);/.test(lire("monstres.js")));
});

// =========================================================================
titre("4. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire("index.html"), v = (f) => Number((new RegExp('["/]' + f.replace(".", "\\.") + '\\?v=(\\d+)"').exec(html) || [])[1]);
  verifier("index.html charge les nouvelles versions (ou plus récentes)", v("combat.js") >= 181 && v("regime_cerveau.js") >= 56 && v("style.css") >= 147);
  verifier("la version du jeu : 393 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lire("trace_combat.js")) || [])[1]) >= 393 && JSON.parse(lire("version.json")).version >= 393);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
