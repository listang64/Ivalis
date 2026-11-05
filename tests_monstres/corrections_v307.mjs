// v307 — LE RÉCIT AÉRÉ, LES PAGES D'APRÈS DÉJÀ ÉCRITES, LE PAPIER QUI RESTE,
// LE POST-IT QUI RENTRE ; LE MARQUE-PAGE DU RÉCIT DEUX FOIS ; PASSER UN COMBAT
// (DEV) ; LE HALO DU LEADER À 60 % ; LES PEUPLES DU MONDE.
//
// Nico : « quand les joueurs écrivent leur texte, fais que l'IA saute quand même
// une ligne pour aérer le texte » ; « quand le texte s'écrit sur les pages
// d'après, fais-les écrire directement » ; « quand un joueur écrit et que
// l'animation se joue, ne replie pas de suite le papier ; on le replie quand le
// narrateur écrit » ; « quand on clique sur le marque-page du narrateur, fais-le
// rentrer complètement, qu'il ressorte quand le narrateur a fini » ; « dans le
// bouton dev, un bouton pour skip un combat, comme s'il était gagné » ;
// « l'animation rouge sous les leaders, 60 % » ; « les monstres ne suivent pas
// les races de mon monde : un orc » ; « le marque-page du récit : une deuxième
// fois, l'index des chapitres ».
//
// Lancer : node tests_monstres/corrections_v307.mjs
// (IVALIS_RACINE=… pour un autre dossier ; V307_CAPTURES=dossier pour les captures.)
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
const CAPTURES = process.env.V307_CAPTURES || "";
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
// La table (le banc n'a pas Internet) : du bois dessiné sur place, 1672 × 941.
const TABLE = await (async () => { const pg = await b.newPage(); const u = await pg.evaluate(() => { const c = document.createElement("canvas"); c.width = 1672; c.height = 941;
  const x = c.getContext("2d"); x.fillStyle = "#130c06"; x.fillRect(0, 0, 1672, 941); x.fillStyle = "#7a4a26"; x.fillRect(170, 55, 1470, 835); return c.toDataURL("image/png"); });
  await pg.close(); return Buffer.from(u.split(",")[1], "base64"); })();
const p = await b.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
// Les IA (Gemini), simulées : le Narrateur lite, les annonces, le titre d'un chapitre.
const appelsIA = [];
let iaEnPanne = false, refusPlume = false, panneCle1 = false;
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : /BG_tjiigl/.test(r.request().url()) ? r.fulfill({ status: 200, contentType: 'image/png', body: TABLE }) : r.abort());
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

// La partie se charge.
await cliquer("#grimoire-btn-charger");
await p.waitForTimeout(700);
await cliquer('#grimoire-liste-parties [data-id="P1"]');
await p.waitForTimeout(150);
await p.fill("#grimoire-mdp-partie", "sel");
await cliquer("#grimoire-valider-partie");
await p.waitForTimeout(400);
await attendreQue(async () => (await page()) === 5, 4000);
await p.waitForTimeout(600);
const NARRATION = `La salle du Chaudron Fêlé sent la bière tiède et le chien mouillé. Derrière le comptoir, <strong style="color: #e8d5a5;">Varos</strong> essuie une chope sans nous accorder un regard.<br>Thorin, bien sûr, prend ce silence pour une invitation.`;
const M = [{ idDoc: "m1", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: NARRATION, Timestamp: 1000 }];
await relayer(M, true);
await p.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit());
await attendreQue(() => p.evaluate(() => document.getElementById("recit-ecriture").classList.contains("sortie")), 6000);
await p.waitForTimeout(700);
const sorti = (id) => p.evaluate((id) => document.getElementById(id).classList.contains("sortie"), id);

// =========================================================================
titre("1. LA LIGNE D'UN JOUEUR : SON PARAGRAPHE ; LE PAPIER RESTE SORTI PENDANT LE VOL");
// =========================================================================
let ajout = null;
await section(async () => {
  await p.evaluate(() => { window.__ajouts = []; });
  await p.fill("#recit-saisie", "Je tape du poing sur le comptoir et je réclame une chope !");
  await p.press("#recit-saisie", "Enter");
  await p.waitForTimeout(400);
  const pendant = await p.evaluate(() => ({ sortie: document.getElementById("recit-ecriture").classList.contains("sortie"), vol: document.querySelectorAll(".recit-poussiere .poussiere-texte span").length, lecture: document.getElementById("recit-saisie").readOnly }));
  verifier("le texte part en poussière, le papier d'écriture reste à sa place", pendant.vol > 20 && pendant.sortie, JSON.stringify(pendant));
  await attendreQue(() => p.evaluate(() => (window.__ajouts || []).some(a => a.col === "Messages_Chat")), 9000);
  ajout = await p.evaluate(() => (window.__ajouts || []).find(a => a.col === "Messages_Chat"));
  verifier("… toujours sorti quand la ligne part dans le livre", await sorti("recit-ecriture"));
  const plume = appelsIA.filter(a => /CE QU'ÉCRIT SON JOUEUR/.test(a.txt)).slice(-1)[0];
  verifier("la plume enchaîne avec le récit, en ouvrant un nouveau paragraphe (pour aérer)", plume && /en ouvrant un nouveau paragraphe \(pour aérer le texte\)/.test(plume.sys));
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.turnToPage(window.GRIMOIRE.premiereDeLaSuite() + 2));
  await relayer(M.concat([{ idDoc: "m2", ...ajout.data, Timestamp: 2000 }]));
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => { const paras = [...document.querySelectorAll(".page-suite .para-recit")]; return { n: paras.length, dernier: paras[paras.length - 1].dataset.e, ecriture: document.getElementById("recit-ecriture").classList.contains("sortie") }; });
  verifier("dans le livre, la ligne du joueur a son propre paragraphe", r.n === 3 && r.dernier === "m2", JSON.stringify(r));
  verifier("… et le papier reste sorti pendant qu'elle s'écrit (ce n'est pas le Narrateur)", r.ecriture);
  await attendreQue(() => p.evaluate(() => document.querySelectorAll(".mot.a-ecrire").length === 0), 8000);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v307_ligne_aeree.png" });
});

// =========================================================================
titre("2. LE NARRATEUR : SON POST-IT RENTRE TOUT ENTIER ; LE PAPIER SE REPLIE QUAND IL ÉCRIT");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.__tours = 0; });
  verifier("le post-it du Narrateur est sorti, prêt", await sorti("recit-postit"));
  await p.evaluate(() => document.getElementById("recit-postit").click());
  await p.waitForTimeout(700);
  const a = await p.evaluate(() => { const el = document.getElementById("recit-postit"), r = el.getBoundingClientRect(), d = document.getElementById("grimoire-suite-3").getBoundingClientRect();
    return { sortie: el.classList.contains("sortie"), depasse: r.right - d.right, tours: window.__tours }; });
  verifier("touché : le Narrateur est appelé, le post-it rentre tout entier dans le livre", !a.sortie && a.depasse <= 1 && a.tours === 1, JSON.stringify(a));
  // Le Narrateur réfléchit (le verrou), puis écrit sa page.
  await p.evaluate(() => window.livreRecitPartie({ IA_En_Cours: true }));
  await p.waitForTimeout(600);
  verifier("pendant qu'il réfléchit : post-it et papier d'écriture rentrés", !(await sorti("recit-postit")) && !(await sorti("recit-ecriture")));
  await p.evaluate(() => window.livreRecitPartie({ IA_En_Cours: false }));
  const longue = Array.from({ length: 3 }, (_, i) => `${i + 1}. Varos pose une chope devant Thorin, sans un mot, puis se penche lentement par-dessus le comptoir pour lui souffler quelque chose à l'oreille.`).join("<br>");
  const M3 = M.concat([{ idDoc: "m2", ...ajout.data, Timestamp: 2000 }, { idDoc: "m3", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: longue, Timestamp: 3000 }]);
  await relayer(M3);
  await p.waitForTimeout(500);
  verifier("sa page s'écrit : ils restent rentrés", !(await sorti("recit-postit")) && !(await sorti("recit-ecriture")) && (await p.evaluate(() => document.querySelectorAll(".mot.a-ecrire").length)) > 0);
  await attendreQue(() => p.evaluate(() => document.querySelectorAll(".mot.a-ecrire").length === 0), 15000);
  await attendreQue(async () => (await sorti("recit-postit")) && (await sorti("recit-ecriture")), 4000);
  verifier("il a fini : le post-it et le papier ressortent", (await sorti("recit-postit")) && (await sorti("recit-ecriture")));
});

// =========================================================================
titre("3. LES PAGES D'APRÈS S'ÉCRIVENT TOUT DE SUITE (LE LIVRE NE TOURNE PAS SEUL)");
// =========================================================================
await section(async () => {
  const phrase = "Nous marchons longtemps dans la poussière dorée de la route d'Arcaï, et je note chaque pas, chaque juron de Thorin, chaque silence de Lyra, comme on garde des pierres précieuses dans une bourse trop petite.";
  const long = Array.from({ length: 9 }, (_, i) => `${i + 1}. ${phrase}`).join("<br>");
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.turnToPage(window.GRIMOIRE.premiereDeLaSuite() + 2));
  await relayer(M.concat([{ idDoc: "m9", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: long, Timestamp: 9000 }]));
  await attendreQue(() => p.evaluate(() => document.querySelectorAll(".mot.a-ecrire").length === 0), 20000);
  const r = await p.evaluate(() => ({ ici: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), pages: window.GRIMOIRE_RECIT.etat().pagesRecit, reste: document.querySelectorAll(".mot.a-ecrire").length,
    apres: [...document.querySelectorAll(".page-suite")].slice(4).some(pg => pg.querySelector(".mot.ecrit, .mot:not(.a-ecrire)")) }));
  verifier("tout le récit s'est écrit, même sur les pages pas encore ouvertes ; le livre est resté page 9", r.ici === (await p.evaluate(() => window.GRIMOIRE.premiereDeLaSuite() + 2)) && r.pages >= 4 && r.reste === 0 && r.apres, JSON.stringify(r));
});

// =========================================================================
titre("4. LE MARQUE-PAGE DU RÉCIT : LA DERNIÈRE PAGE, PUIS L'INDEX DES CHAPITRES");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.grimoireAllerIndex());
  await attendreQue(async () => (await page()) === 3 && !(await p.evaluate(() => window.GRIMOIRE.defileEnCours())), 6000);
  await p.waitForTimeout(400);
  await p.evaluate(() => document.getElementById("grimoire-marque-recit").click());
  await attendreQue(() => p.evaluate(() => !window.GRIMOIRE.defileEnCours() && window.GRIMOIRE_PAGEFLIP.getState() === "read"), 6000);
  await p.waitForTimeout(400);
  const derniere = await p.evaluate(() => { const n = window.GRIMOIRE_RECIT.etat().pagesRecit, d = window.GRIMOIRE.premiereDeLaSuite() + 2 + Math.max(n, 2) - 1; return d % 2 === 1 ? d : d - 1; });
  const un = await page();
  verifier("une fois : la dernière double page du récit", un === derniere, `${un} (attendu ${derniere})`);
  await p.evaluate(() => document.getElementById("grimoire-marque-recit").click());
  await attendreQue(() => p.evaluate(() => !window.GRIMOIRE.defileEnCours() && window.GRIMOIRE_PAGEFLIP.getState() === "read"), 6000);
  await p.waitForTimeout(400);
  verifier("deux fois : l'index des chapitres (le sommaire, page 7)", (await page()) === (await p.evaluate(() => window.GRIMOIRE.premiereDeLaSuite())), String(await page()));
  await p.evaluate(() => document.getElementById("grimoire-marque-recit").click());
  await attendreQue(() => p.evaluate(() => !window.GRIMOIRE.defileEnCours() && window.GRIMOIRE_PAGEFLIP.getState() === "read"), 6000);
  await p.waitForTimeout(400);
  verifier("trois fois : de nouveau la dernière page du récit", (await page()) === derniere);
});

// =========================================================================
titre("5. DEV : PASSER UN COMBAT LANCÉ, COMME S'IL ÉTAIT GAGNÉ");
// =========================================================================
await section(async () => {
  const b = await p.evaluate(() => { const el = document.getElementById("btn-passer-combat-rp"); return el ? { dansNouveau: !!el.closest("#dev-onglet-nouveau"), texte: el.textContent } : null; });
  verifier("dans le bouton DEV rouge, onglet Nouveau : « Passer le combat »", b && b.dansNouveau && /Passer le combat/.test(b.texte), JSON.stringify(b));
  const r = await p.evaluate(async () => {
    window.__tourArgs = []; window.__ajouts = []; window.__reinit = 0;
    window.declencherTourIA = async (o) => { window.__tourArgs.push(o || null); };
    window.reinitialiserCombat = async () => { window.__reinit++; };
    window.confirm = () => true;
    const c = { Id: "crp_test", Etat: "preparation", Adversaires: "trois brigands", Ennemis: { Tirage: { depart: [{ nom: "Brigand balafré" }], renforts: [] } } };
    window.__docs["Systeme_Parties/P1"] = Object.assign({}, window.__docs["Systeme_Parties/P1"] || {}, { Combat_RP: c });
    window.PARTIE_DATA = Object.assign({}, window.PARTIE_DATA || {}, { Combat_RP: { ...c } });
    const ok = await window.passerCombatRP();
    return { ok, tour: window.__tourArgs[0], message: ((window.__ajouts || []).find(a => a.col === "Messages_Chat") || { data: {} }).data.Texte, reinit: window.__reinit,
             reste: (window.__docs["Systeme_Parties/P1"] || {}).Combat_RP };
  });
  verifier("le combat se termine aussitôt : le plateau se vide", r.ok && r.reinit === 1, JSON.stringify({ ok: r.ok, reinit: r.reinit }));
  verifier("le récit reprend sur une victoire : le Narrateur raconte la fin du combat", /ont eu le dessus/.test(r.message || "") && r.tour && /REMPORTÉ la bataille/.test(r.tour.issueCombat || ""), (r.message || "") + " | " + ((r.tour && r.tour.issueCombat) || "").slice(0, 80));
  verifier("… et le combat du récit est effacé de la partie", !r.reste, JSON.stringify(r.reste));
});

// =========================================================================
titre("6. LE HALO ROUGE DU LEADER À 60 % ; LES PEUPLES DE CE MONDE SEULEMENT");
// =========================================================================
await section(async () => {
  verifier("le halo rouge sous le pion du leader : opacité 60 %", /\.aura-leader \{[^}]*opacity: 0\.6;/.test(lire("style.css")));
  const monde = await p.evaluate(() => window.contexteEnnemisIvalis(1));
  verifier("les IA du combat reçoivent les SEULS peuples d'Elyria", /les SEULS peuples qui existent/.test(monde) && ["Humains", "Ankylars", "Gobs", "Vargens", "Ondaris", "Ophiors", "Éthérés"].every(n => monde.includes(n)));
  verifier("… et l'interdit : jamais d'orc, d'elfe, de nain, de gobelin, de troll…", /jamais d'orc/.test(monde) && /d'elfe, de nain, de gobelin, de troll, d'ogre/.test(monde) && /mythologie antique/.test(monde));
  verifier("le dessin des pions ennemis : jamais un orc, un elfe, un nain…", /never draw an orc, elf, dwarf, goblin, troll or ogre/.test(lire("app.js")));
});

await section(async () => {
  const index = lire("index.html");
  const v = (re) => Number((index.match(re) || [])[1] || 0);
  verifier("versions", v(/grimoire\.js\?v=(\d+)"/) >= 10 && v(/grimoire_recit\.js\?v=(\d+)"/) >= 7 && v(/grimoire_recit\.css\?v=(\d+)"/) >= 6 && v(/grimoire_carte\.js\?v=(\d+)"/) >= 2
           && v(/combat_rp\.js\?v=(\d+)"/) >= 5 && v(/lore_ivalis\.js\?v=(\d+)"/) >= 3 && v(/app\.js\?v=(\d+)"/) >= 137 && v(/style\.css\?v=(\d+)"/) >= 123 && v(/trace_combat\.js\?v=(\d+)"/) >= 212
           && Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]) >= 307 && JSON.parse(lire("version.json") || "{}").version >= 307);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
