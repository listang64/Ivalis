// v387 — LA CRÉATION D'UN HÉROS, LA FORGE, LE RÉCIT, LES MARQUE-PAGES : UNE VINGTAINE DE RETOUCHES.
// Nico : « pour les Vargens enlève la taille des cornes ; enlève la couleur dominante et la couleur
// du token ; une bulle de saisie dessinée à la main plutôt qu'un trait ; Qui es-tu ? plus gros,
// centré, une aquarelle dorée dessous ; le bouton La suite arrête de bouger ; plus de Renoncer à ce
// héros ; une flèche en bas de page quand on peut descendre ; effacer la compétence d'un autre perso
// met du temps ; la Forge : le choix de l'arme centré qui glisse, une aquarelle par carac, sous les
// sous-effets et les + et -, le nom en bulle, Le codex centré, un marque-page Refermer en biais ; un
// marque-page dépasse à droite ; la plume du RP grise le papier des autres ; les marque-pages de
// gauche en tissu ; les papiers des avatars en parchemin ; le fondu des images moins agressif ;
// l'ombre des onglets en dégradé ; le marque-page de marche en haut à gauche sous la loupe ; le
// verre de la loupe noir au repos ».
// (La mise en place du livre : celle de corrections_v373.)
//
// Lancer : node tests_monstres/corrections_v387.mjs
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
const CAPTURES = process.env.V387_CAPTURES || "";
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
await p.evaluate(() => window.appliquerVoyageDeLaPartie && window.appliquerVoyageDeLaPartie({ Position_Groupe: { Region: 5, x: 0.42, y: 0.55 } }));
await p.waitForTimeout(2500);
const cap = async (nom) => { if (CAPTURES) await p.screenshot({ path: CAPTURES + "/" + nom + ".png" }); };
const action = (sel) => p.evaluate((sel) => { const b = document.querySelector(sel); if (!b) return false; b.click(); return true; }, sel);
const PNG1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
await p.route(/res\.cloudinary\.com\/.*IMG_22(49|5[0-5])_/, r => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PNG1, "base64") }));

// =========================================================================
titre("1. LA CRÉATION : LES CHAMPS RETIRÉS, LE TITRE, LES BULLES, PLUS DE « RENONCER »");
// =========================================================================
await section(async () => {
  const html = lire("index.html");
  verifier("plus de taille des cornes (ni le champ, ni son groupe)", !/champ-cornes|groupe-cornes/.test(html) && !/groupe-cornes/.test(lire("creation_personnage.js")));
  verifier("plus de couleur dominante ni de couleur du token", !/champ-couleurs"|champ-couleur-token/.test(html) && !/champ-couleur-token|champ-couleurs"/.test(lire("creation_personnage.js") + lire("app.js")));
  await p.evaluate(() => window.GRIMOIRE_FICHES.allerAuxAventuriers()); await p.waitForTimeout(2600); await pose();
  await action(".page-clan .nouvel-aventurier"); await p.waitForTimeout(2800); await pose();
  verifier("plus de « Renoncer à ce héros » sur les pages", await p.evaluate(() => !document.querySelector(".renoncer-creation") && ![...document.querySelectorAll(".page-creation")].some(pg => /Renoncer/.test(pg.textContent))));
  await p.evaluate(() => document.querySelector('#grimoire-creation-race-2 [data-genre="Male"]').click()); await p.waitForTimeout(2800); await pose();
  const f = await p.evaluate(() => ({ fleches: document.querySelectorAll(".page-classe.gauche .fleche-defile").length, classes: document.querySelectorAll(".page-classe.gauche").length }));
  verifier("chaque page de gauche des classes a sa flèche de bas de page", f.fleches > 0 && f.fleches === f.classes, JSON.stringify(f));
  // Un descriptif trop long : la flèche se montre ; lu jusqu'en bas, elle s'efface.
  const fl = await p.evaluate(async () => {
    const pg = window.GRIMOIRE_CREATION.page("classe-0"), z = pg.querySelector(".defile-fiche"), fl = pg.querySelector(".fleche-defile");
    z.querySelector(".descriptif-creation").insertAdjacentHTML("beforeend", "<p>" + "Une longue histoire. ".repeat(400) + "</p>");
    await new Promise(r => setTimeout(r, 600)); const avant = fl.classList.contains("visible");
    z.scrollTop = z.scrollHeight; await new Promise(r => setTimeout(r, 600));
    const cs = getComputedStyle(fl);
    return { avant, apres: fl.classList.contains("visible"), animation: cs.animationName, position: cs.position };
  });
  verifier("trop long : la flèche se montre, immobile ; lu jusqu'en bas, elle s'efface", fl.avant && !fl.apres && fl.animation === "none" && fl.position === "absolute", JSON.stringify(fl));
  await p.evaluate(() => { const b = [...document.querySelectorAll('[data-ca="classe"]')][1]; b.click(); }); await p.waitForTimeout(2800); await pose();
  await p.evaluate(() => window.GRIMOIRE.allerALaPage(window.GRIMOIRE.indexDe(window.GRIMOIRE_CREATION.page("form1-g")))); await p.waitForTimeout(2600); await pose();
  const t = await p.evaluate(() => {
    const h = document.querySelector("#grimoire-creation-form1-g .titre-qui"), pg = h.closest(".page-grimoire").getBoundingClientRect(), r = h.getBoundingClientRect();
    const l = h.querySelector(":scope > .lavis"), sous = document.querySelector("#grimoire-creation-form1-g .titre-creation:not(.titre-qui)");
    const autre = document.querySelector("#grimoire-creation-form1-d .bloc-formulaire h4");
    const champ = document.getElementById("champ-nom"), cs = getComputedStyle(champ);
    const tour = document.querySelector(".tourner-creation");
    return { texte: h.textContent.trim(), centre: Math.abs((r.left + r.right) / 2 - (pg.left + pg.right) / 2) / pg.width, taille: parseFloat(getComputedStyle(h).fontSize), tailleH4: parseFloat(getComputedStyle(autre).fontSize),
      lavis: !!l, couleur: l ? l.querySelector("path").getAttribute("fill") : "", bulle: /data:image\/svg\+xml/.test(cs.backgroundImage), bord: cs.borderBottomWidth, deborde: champ.getBoundingClientRect().right <= champ.closest(".contenu-page").getBoundingClientRect().right + 1,
      tourne: getComputedStyle(tour).animationName };
  });
  verifier("« Qui es-tu ? » : centré sur sa page, bien plus gros que les titres des parties", t.texte === "Qui es-tu ?" && t.centre < 0.04 && t.taille > t.tailleH4 * 2, JSON.stringify(t));
  verifier("… une aquarelle dorée dessous", t.lavis && /^#(d9a93a|e8c25a|b8862a)$/i.test(t.couleur), JSON.stringify(t));
  verifier("les champs : une bulle dessinée (plus de trait dessous), qui tient dans la page", t.bulle && t.bord === "0px" && t.deborde, JSON.stringify(t));
  verifier("« La suite » ne bouge plus", t.tourne === "none", t.tourne);
  await cap("v387_qui_es_tu");
  await p.evaluate(() => window.GRIMOIRE_CREATION.terminer()); await p.waitForTimeout(800);
});

// =========================================================================
titre("2. EFFACER LA COMPÉTENCE D'UN AUTRE : LE LIVRE N'ATTEND PLUS LA FIN DU RÉSEAU");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => {
    window.CACHE_COMPETENCES_GLOBAL = window.CACHE_COMPETENCES_GLOBAL || {};
    window.CACHE_COMPETENCES_GLOBAL.H2 = { CX: { Nom: "Coup bas", Initiative: 40 }, CY: { Nom: "Garde", Initiative: 20 } };
    window.ID_PERSONNAGE_DECK = "H2"; window.ID_PARTIE_COURANTE = window.ID_PARTIE_COURANTE || "P1";
    const conf = window.confirm; window.confirm = () => true;
    let lacher; const avant = window.modifierPartie; window.modifierPartie = () => new Promise(res => { lacher = res; });
    let maj = 0; const f = window.GRIMOIRE_FICHES.majPlus; window.GRIMOIRE_FICHES.majPlus = () => { maj++; };
    const fin = window.supprimerCompetencePerso("CX");
    await new Promise(r => setTimeout(r, 300));
    const pendant = { cache: !!window.CACHE_COMPETENCES_GLOBAL.H2.CX, autre: !!window.CACHE_COMPETENCES_GLOBAL.H2.CY, maj };
    lacher(null); await fin;
    window.confirm = conf; window.modifierPartie = avant; window.GRIMOIRE_FICHES.majPlus = f;
    return pendant;
  });
  verifier("dès le document effacé, la carte quitte les caches et le livre se redessine (la file du combat encore en cours)", !r.cache && r.autre && r.maj >= 1, JSON.stringify(r));
  verifier("la bannière du livre s'efface tout de suite, avant le réseau", /querySelectorAll\("\.rang-banniere"\)/.test(lire("competences.js")));
});

// =========================================================================
titre("3. LA FORGE : L'ARME AU CENTRE QUI GLISSE, LES AQUARELLES, LA BULLE, « REFERMER »");
// =========================================================================
await section(async () => {
  await p.evaluate(() => {
    const e = (Nom, Modificateur, t1, extra) => Object.assign({ Nom, Modificateur, Type_Mecanique: t1, Type_Mecanique_2: "", Cout_PT: "1", Valeur: 5, Tours: "0", Max_Stacks: 5, Description: "Inflige [X] dégâts." }, extra || {});
    window.EFFETS_BDD_CACHE = { E1: e("Attaque légère", "DEXTÉRITÉ", "Action/Global"), E2: e("Feinte", "DEXTÉRITÉ", "Action/Global"), E3: e("Coup puissant", "FORCE", "Action/Global"),
      E4: e("Soin", "SAGESSE", "Action/Global"), E5: e("Bouclier", "CONSTITUTION", "Action/Global"), E7: e("Zone", "AUCUN", "Spatial"), E8: e("Saignement", "FORCE", "Physique", { Tours: "2" }) };
    window.CACHE_COMPETENCES_GLOBAL.H1 = {};
    window.__docs = window.__docs || {}; window.__docs["Personnages/H1"] = { Niveau: 3, xp: 1000 }; window.__docs["Caracteristiques/H1"] = { force: 10, dex: 15, con: 12, int: 13, sag: 10, cha: 8 };
  });
  await p.evaluate(() => window.GRIMOIRE_FICHES.ouvrir("H1", "onglet-competences")); await p.waitForTimeout(3000); await pose();
  await action("#grimoire-fiches-comp-g .bouton-forger"); await p.waitForTimeout(3000); await pose();
  await p.evaluate(() => { window.outilsForge.typesArmesEquipeesPourForge = () => new Set(["Arme légère CAC"]); window.rafraichirForge(); }); await p.waitForTimeout(800);
  const o = await p.evaluate(() => {
    const d = document.getElementById("grimoire-fiches-forge-d"), pr = d.getBoundingClientRect(), a = document.querySelector('#forge-livre-armes [data-arme="Magie"]').getBoundingClientRect();
    const titre = d.querySelector(".titre-page-fiche").getBoundingClientRect(), m = document.getElementById("forge-marque-refermer");
    return { centre: d.querySelector(".page-codex").classList.contains("au-centre"), y: ((a.top + a.bottom) / 2 - pr.top) / pr.height, x: Math.abs((a.left + a.right) / 2 - (pr.left + pr.right) / 2) / pr.width,
      liste: getComputedStyle(document.getElementById("forge-livre-codex")).display, titre: Math.abs((titre.left + titre.right) / 2 - (pr.left + pr.right) / 2) / pr.width,
      bouton: !!document.querySelector(".fermer-forge"), marque: m ? m.className : "", marqueAu: m ? m.getBoundingClientRect().top < document.getElementById("grimoire-livre").getBoundingClientRect().top : false };
  });
  verifier("à l'ouverture : le choix de l'arme seul, au milieu de la page, sans la liste", o.centre && o.y > 0.35 && o.y < 0.75 && o.x < 0.08 && o.liste === "none", JSON.stringify(o));
  verifier("« Le codex » centré sur sa page", o.titre < 0.03, JSON.stringify(o));
  verifier("plus de bouton Refermer ; un marque-page « Refermer » sort en haut de la page de droite", !o.bouton && /sortie/.test(o.marque) && o.marqueAu, JSON.stringify(o));
  await cap("v387_forge_ouverte");
  const g = await p.evaluate(async () => {
    document.querySelector('#forge-livre-armes [data-arme="Arme légère CAC"]').click();
    await new Promise(r => setTimeout(r, 150));
    const b = document.querySelector('#forge-livre-armes .arme-forge.choisie'), anims = b ? b.getAnimations().length : 0, op = parseFloat(getComputedStyle(document.getElementById("forge-livre-codex")).opacity);
    await new Promise(r => setTimeout(r, 1400));
    return { anims, op, fin: parseFloat(getComputedStyle(document.getElementById("forge-livre-codex")).opacity), centre: document.querySelector(".page-codex").classList.contains("au-centre") };
  });
  verifier("choisie : elle glisse à sa place en haut, la liste des effets vient en fondu", g.anims > 0 && g.op < 0.3 && g.fin === 1 && !g.centre, JSON.stringify(g));
  const c = await p.evaluate(() => [...document.querySelectorAll("#forge-menu-caracs .forge-grimoire-groupe")].map(gr => ({ carac: gr.dataset.carac, lavis: !!gr.querySelector(":scope > .lavis-carac"), couleur: (gr.querySelector(":scope > .lavis-carac path") || { getAttribute: () => "" }).getAttribute("fill") })));
  verifier("une grosse aquarelle par caractéristique, sous tous ses effets, d'une couleur chacune", c.length >= 4 && c.every(x => x.lavis) && new Set(c.map(x => x.couleur)).size === c.length, JSON.stringify(c));
  await p.evaluate(() => { window.ajouterComposantPrincipal("E1"); }); await p.waitForTimeout(800);
  const s = await p.evaluate(() => ({ menus: [...document.querySelectorAll("#forge-contenu-carte .forge-menu-bouton")].map(b => !!b.querySelector(":scope > .lavis")),
    compteurs: [...document.querySelectorAll("#forge-contenu-carte .forge-compteur")].map(b => !!b.querySelector(":scope > .lavis")),
    nom: /data:image\/svg\+xml/.test(getComputedStyle(document.getElementById("forge-nom")).backgroundImage) }));
  verifier("une aquarelle discrète sous + Spatial, + Physique… et sous les + et -", s.menus.length >= 3 && s.menus.every(Boolean) && s.compteurs.length >= 1 && s.compteurs.every(Boolean), JSON.stringify(s));
  verifier("le nom de la technique : la bulle dessinée à la main", s.nom, JSON.stringify(s));
  const fl = await p.evaluate(() => ["grimoire-fiches-forge-g", "grimoire-fiches-forge-d"].map(id => !!document.querySelector("#" + id + " > .fleche-defile")));
  verifier("les deux pages de la Forge ont leur flèche de bas de page", fl.every(Boolean), JSON.stringify(fl));
  await cap("v387_forge");
  await p.evaluate(() => document.getElementById("forge-marque-refermer").click()); await p.waitForTimeout(2500); await pose();
  const f = await p.evaluate(() => ({ forge: document.body.classList.contains("forge-livre"), marque: document.getElementById("forge-marque-refermer").className }));
  verifier("le marque-page referme la Forge, puis rentre dans le livre", !f.forge && !/sortie/.test(f.marque), JSON.stringify(f));
});

// =========================================================================
titre("4. LE RÉCIT : LE PAPIER « LECTURE TERMINÉE » CACHÉ, LA PLUME QUI GRISE LES AUTRES");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.livreRecitMessages([{ idDoc: "m1", ID_Partie: "P1", Auteur_ID: "MJ_IA", Auteur_Nom: "Narrateur", Est_Narration_IA: true, Texte: "La taverne est pleine.", Timestamp: Date.now() - 600000 }], { initial: true }));
  await p.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit()); await p.waitForTimeout(3500); await pose(); await p.waitForTimeout(800);
  const h = await p.evaluate(() => { const l = document.querySelector("#recit-lecture .papier-ecriture").getBoundingClientRect(), b = document.getElementById("grimoire-livre").getBoundingClientRect();
    return { haut: l.top, pages: b.top + b.height * (62 - 44) / (1117 - 44 * 0) }; });
  verifier("rangé, le papier « Lecture terminée » ne dépasse plus du haut de la page de droite", h.haut > h.pages, JSON.stringify(h));
  await p.evaluate(() => window.livreRecitPartie({ Plume_Recit: { Joueur: "J2", Nom: "Lyra", Depuis: Date.now() } })); await p.waitForTimeout(600);
  const g = await p.evaluate(() => ({ grise: document.getElementById("recit-ecriture").classList.contains("grise"), lecture: document.getElementById("recit-saisie").readOnly, texte: document.getElementById("recit-plume-occupee").textContent }));
  verifier("un autre joueur a écrit sa première lettre : mon papier se grise, son nom dessus", g.grise && g.lecture && /Lyra écrit/.test(g.texte), JSON.stringify(g));
  await p.evaluate(() => window.livreRecitPartie({ Plume_Recit: { Joueur: "J2", Nom: "Lyra", Depuis: Date.now() - 120000 } })); await p.waitForTimeout(400);
  verifier("sans une lettre depuis 90 s, la plume est libre (personne ne reste bloqué)", await p.evaluate(() => !document.getElementById("recit-ecriture").classList.contains("grise")));
  await p.evaluate(() => window.livreRecitPartie({ Plume_Recit: null })); await p.waitForTimeout(300);
  await p.evaluate(() => { window.__plumes = []; window.__partie = {}; window.modifierPartie = async (f) => { const r = f(window.__partie); window.__plumes.push(r); if (r && r.maj) Object.assign(window.__partie, r.maj); return r ? (r.resultat !== undefined ? r.resultat : true) : null; }; });
  await p.focus("#recit-saisie"); await p.keyboard.type("J"); await p.waitForTimeout(300);
  const pris = await p.evaluate(() => JSON.parse(JSON.stringify(window.__partie)));
  verifier("ma première lettre : la plume est à moi, sur la partie", pris.Plume_Recit && pris.Plume_Recit.Joueur === "J1" && pris.Plume_Recit.Nom === "Thorin", JSON.stringify(pris));
  await p.keyboard.type("e vais au comptoir."); await p.waitForTimeout(200);
  verifier("… et elle n'est pas réécrite à chaque lettre", await p.evaluate(() => window.__plumes.length === 1));
  // Un autre a pris la plume juste avant moi (deux premières lettres en même temps).
  await p.evaluate(() => { window.__partie = { Plume_Recit: { Joueur: "J2", Nom: "Lyra", Depuis: Date.now() } }; });
  await p.evaluate(() => { window.__plumes = []; });
  await p.keyboard.press("Control+a"); await p.keyboard.press("Backspace"); await p.waitForTimeout(300);
  const rendue = await p.evaluate(() => JSON.parse(JSON.stringify([window.__plumes, window.__partie])));
  verifier("tout effacé : je rends la plume — sauf si un autre l'a déjà (je n'efface pas la sienne)", rendue[0].length === 1 && rendue[0][0] === null && rendue[1].Plume_Recit.Joueur === "J2", JSON.stringify(rendue));
  await p.evaluate(() => { window.__partie = {}; window.__plumes = []; window.livreRecitPartie({ Plume_Recit: null }); }); await p.waitForTimeout(300);
  await p.focus("#recit-saisie"); await p.keyboard.type("Salut"); await p.waitForTimeout(300);
  await p.keyboard.press("Enter"); await p.waitForTimeout(4000);
  const envoi = await p.evaluate(() => JSON.parse(JSON.stringify([window.__partie, (window.__ajouts || []).some(a => a.col === "Messages_Chat" && a.data.Texte === "Salut")])));
  verifier("envoyé : la plume redevient libre pour les autres", envoi[1] && envoi[0].Plume_Recit === null, JSON.stringify(envoi));
});

// =========================================================================
titre("5. LES MARQUE-PAGES, LES PAPIERS, LES IMAGES, LA LOUPE");
// =========================================================================
await section(async () => {
  const m = await p.evaluate(() => ["grimoire-marque-menu", "grimoire-marque-page", "grimoire-marque-recit"].map(id => {
    const pap = document.querySelector("#" + id + " .marque-papier"), cs = getComputedStyle(pap), av = getComputedStyle(pap, "::before"), tr = document.querySelector("#" + id + " .dessin-marque path");
    return { trame: (cs.backgroundImage.match(/repeating-linear-gradient/g) || []).length, fond: cs.backgroundImage.match(/rgb\(\d+, \d+, \d+\)/g).slice(-1)[0], couture: av.borderLeftStyle, fil: getComputedStyle(tr).stroke };
  }));
  verifier("les trois marque-pages de gauche : une trame de tissu, des coutures, chacun sa couleur, le logo brodé", m.every(x => x.trame >= 2 && x.couture === "dashed" && x.fil !== "rgb(18, 11, 6)") && new Set(m.map(x => x.fond)).size === 3, JSON.stringify(m));
  const pa = await p.evaluate(() => { const cs = getComputedStyle(document.querySelector("#recit-avatar .papier-usure")); return { points: (cs.clipPath.match(/%/g) || []).length / 2, fibres: /feTurbulence/.test(cs.backgroundImage), coin: getComputedStyle(document.querySelector("#recit-avatar .papier-usure"), "::before").content }; });
  verifier("les papiers des avatars : un bord déchiré plus fin, des fibres, un coin relevé", pa.points > 50 && pa.fibres && pa.coin !== "none", JSON.stringify(pa));
  const css = lire("grimoire_recit.css"), cc = lire("grimoire_creation.css");
  verifier("les images du récit : une toute petite marge fondue (le voile vers la page de gauche reste)", /fond-recit\.droite \{[^}]*#000 calc\(100% - var\(--fondu-bord\)\), transparent 100%/.test(css) /* (v388) un liseré encore plus fin */ && /fond-recit\.gauche \{[^}]*0\.55\) 82%/.test(css) && !/#000 9%, #000 91%/.test(css));
  verifier("… et de même pour les images des peuples et des classes", /\.fond-classe\.droite \{ -webkit-mask-image: linear-gradient\(to right, #000 0, #000 calc\(100% - var\(--fondu-bord\)\), transparent 100%\)/.test(cc) && /\.fond-classe\.gauche \{[^}]*#000 var\(--fondu-bord\)/.test(cc) /* (v388) */);
  verifier("l'ombre des onglets des peuples et des classes s'éteint en dégradé, sans marche au bord de la page", /\.papier-onglet::after \{[^}]*0\.36\) calc\(var\(--bord\)[^}]*rgba\(34, 17, 5, 0\) calc\(\(var\(--bord\) \+ 84\)/.test(cc) && !/0\.7\) calc\(var\(--bord\)/.test(cc));
  const lc = lire("loupe_cartes.css");
  verifier("sous la loupe, le marque-page de la marche en haut à gauche ; le verre au repos noir", /\.loupe-postit \{ position: absolute; top: 0; left: 28px;/.test(lc) && /\.loupe-lentille, \.loupe-voile \{ background: radial-gradient\(circle at 42% 38%, #2b2b2b 0, #111 48%, #000 100%\); \}/.test(lc));
});

// =========================================================================
titre("6. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire("index.html");
  // (v388) Au moins ces versions : les suivantes les montent encore.
  const auMoins = [["style.css", 144], ["grimoire.css", 18], ["grimoire_recit.css", 21], ["loupe_cartes.css", 5], ["grimoire_fiches.css", 9], ["grimoire_creation.css", 8],
    ["app.js", 173], ["grimoire_recit.js", 25], ["grimoire_fiches.js", 13], ["grimoire_creation.js", 11], ["creation_personnage.js", 28], ["competences.js", 75]];
  verifier("index.html charge les nouvelles versions (ou plus récentes)", auMoins.every(([f, n]) => Number((new RegExp('["/]' + f.replace(".", "\\.") + '\\?v=(\\d+)"').exec(html) || [])[1]) >= n));
  verifier("la version du jeu : 387 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lire("trace_combat.js")) || [])[1]) >= 387 && JSON.parse(lire("version.json")).version >= 387);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
