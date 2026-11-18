// v442 — LES MISSIONS DE GUILDE : LE TABLEAU (LA GÉNÉRATION, LES ENCARTS, LA FEUILLE).
// Nico : « dans les encarts du panneau des missions, pour chaque encart une mission générée par une IA ; si vide,
// ça se crée après avoir chargé la partie ; les missions se renouvellent tous les 30 jours (en jeu) ; un tableau par
// partie ; six missions, un peu plus de C, une seule A, deux au plus. Dans l'encart : le rang, un petit séparateur
// dessiné, le titre, un résumé très rapide ; des écritures différentes, comme à la main ; le texte suit
// l'inclinaison. Un clic : une page parchemin glisse du bas de l'écran (région, détail, commanditaire, objectif, le
// mot du commanditaire à la première personne), son bas caché sous le bord, en bas un sceau rouge « Accepter la
// mission » ; un clic dehors la ferme ; le bruit d'une page qu'on attrape. » Sur la vraie page (le décor du banc v424).
// Lancer : node tests_monstres/corrections_v442.mjs
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
    (window.__journal = window.__journal || []).push({ chemin, mode, t: Date.now(), data: JSON.parse(JSON.stringify(data, (k, v) => v && v.__supprimer ? "<supprimé>" : v)) });
    if (chemin === "Systeme_Parties/P1" && typeof window.__surPartie === "function") {
      const copie = cloner(d[chemin]);
      setTimeout(() => window.__surPartie(copie), 0);
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
  export const setDoc = async (ref, data, options) => { ecrire(ref.chemin, data, options && options.merge ? "merge" : "set"); };
  export const updateDoc = async (ref, data) => { ecrire(ref.chemin, data, "update"); };
  export const deleteDoc = async (ref) => { delete docs()[ref.chemin]; (window.__suppressions = window.__suppressions || []).push(ref.chemin); };
  let n = 0;
  export const addDoc = async (c, data) => { const id = "m" + (++n) + "_" + Date.now(); docs()[c.col + "/" + id] = cloner(data); (window.__ajouts = window.__ajouts || []).push({ col: c.col, id, t: Date.now(), data: cloner(data) }); return { id }; };
  export const deleteField = () => SUPPR; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (k) => k; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const writeBatch = () => { const ops = []; return { set(r, d, o){ ops.push(() => ecrire(r.chemin, d, o && o.merge ? "merge" : "set")); }, update(r, d){ ops.push(() => ecrire(r.chemin, d, "update")); },
    delete(r){ ops.push(() => { delete docs()[r.chemin]; }); }, commit: async () => { ops.forEach(f => f()); } }; };
  export const runTransaction = async (_d, fn) => {
    const ops = [];
    const tx = { get: async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => cloner(d || {}) }; },
                 update(r, d) { ops.push(() => ecrire(r.chemin, d, "update")); return tx; },
                 set(r, d, o) { ops.push(() => ecrire(r.chemin, d, o && o.merge ? "merge" : "set")); return tx; },
                 delete(r) { ops.push(() => { delete docs()[r.chemin]; }); return tx; } };
    const res = await fn(tx);
    ops.forEach(f => f());
    return res;
  };
  export const Timestamp = { now: () => Date.now() };
`;
const CAPTURES = process.env.V442_CAPTURES || "";
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
// Le village (le banc n'a pas Internet) : un dessin à fond transparent, 1672 × 941, avec un repère à chaque bord.
const VILLAGE = await (async () => { const pg = await b.newPage(); const u = await pg.evaluate(() => { const c = document.createElement("canvas"); c.width = 1672; c.height = 941;
  const x = c.getContext("2d"); x.fillStyle = "rgba(90,60,30,0.85)"; x.beginPath(); x.ellipse(836, 470, 760, 420, 0, 0, 7); x.fill();
  x.fillStyle = "#e9d8b0"; x.font = "bold 120px serif"; x.fillText("VILLAGE", 560, 500); x.fillStyle = "#c00"; x.fillRect(0, 0, 40, 941); x.fillStyle = "#00c"; x.fillRect(1632, 0, 40, 941);
  return c.toDataURL("image/png"); }); await pg.close(); return Buffer.from(u.split(",")[1], "base64"); })();
const villageDemande = [];
await p.route(/res\.cloudinary\.com\/.*IMG_2275_ncxeo8/, r => { villageDemande.push(r.request().url()); r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: VILLAGE }); });
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
const cap = async (nom) => { if (CAPTURES) await p.screenshot({ path: CAPTURES + "/" + nom + ".png" }); };
await p.evaluate(() => {
  window.verifierMdpParametres = async (m) => m === "rune";
  window.confirmerRetourMenu = () => window.__appels.push("retour-menu");
  window.confirmerQuitterJeu = () => window.__appels.push("quitter-jeu");
});
const visible = (sel) => p.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0 && r.width > 0 && r.height > 0; }, sel);
const vueParam = () => p.evaluate(() => window.GRIMOIRE_PARAMETRES.vue());

// Le portrait de Doros (le banc n'a pas Internet) : un petit carré servi sur place.
const PNG_DOROS = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
await p.route(/PNJ\/doros\.png/, r => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: PNG_DOROS }));
// LE RÉSEAU DE LA PARTIE : Doros (le centre), Koré, Myrto (morte), Thorin et Lyra, et seize autres que Doros connaît.
const graine = (i) => ((i * 37) % 100) - 50;
await p.evaluate(() => {
  const d = window.__docs, P = "Systeme_Parties/P1/";
  const ame = (id, type, nom, extra) => { d[P + "Ames/" + id] = { id, type, nom, ref: id, statut: "vivant", humeur: null,
    psyche: { traits: { prudence: 20, impulsivite: 80, loyaute: 60, empathie: 40, orgueil: 90, sociabilite: 50 }, valeurs: ["honneur"], objectifs: ["Venger son honneur contre Thorin"], faille: "Il ne pardonne pas", masque: "Bourru", style: "Rauque" }, ...(extra || {}) }; };
  const fiche = (id, nom, metier, url) => { d["Monde_PNJ/" + id] = { Nom_PNJ: nom, Occupation: metier, Race: "Humain", ID_Partie: "P1", ID_Lieu: "L_1", Statut: "Vivant", URL_Cloudinary: url || "", Secret_Mental: "Il vole la recette", Version_Creation: 414 }; };
  ame("PNJ_DOROS", "pnj", "Doros", { humeur: { emotion: "colere", intensite: 2, cause: "Thorin l'a humilié", jusquA: 9 } }); fiche("PNJ_DOROS", "Doros", "Docker", "https://res.cloudinary.com/x/image/upload/v1/PNJ/doros.png");
  ame("PNJ_KORE", "pnj", "Dame Koré"); fiche("PNJ_KORE", "Dame Koré", "Grande prêtresse");
  ame("PNJ_MYRTO", "pnj", "Myrto", { statut: "mort" }); fiche("PNJ_MYRTO", "Myrto", "Tavernière");
  ame("H1", "heros", "Thorin"); ame("H2", "heros", "Lyra");
  const L = (de, vers, axes, extra) => { d[`${P}Liens/${de}~${vers}`] = { de, vers, axes: { confiance: 0, respect: 0, attachement: 0, dette: 0, crainte: 0, familiarite: 60, ...axes }, origine: "rencontre", etiquette: "", histoire: "", derniers: [], ...(extra || {}) }; };
  L("PNJ_DOROS", "H1", { confiance: -60, respect: -40, attachement: -70, crainte: 10, familiarite: 30 }, { derniers: [{ n: 1, tour: 1, resume: "Thorin a humilié Doros au marché.", ecarts: { respect: -8, attachement: -10 } }] });
  L("PNJ_DOROS", "H2", { confiance: 60, attachement: 70, respect: 50, dette: 45, familiarite: 80 });
  L("PNJ_DOROS", "PNJ_KORE", { respect: 40, crainte: 20, confiance: 10, familiarite: 90 }, { origine: "preexistant", etiquette: "patron", histoire: "Koré possède les quais." });
  L("PNJ_DOROS", "PNJ_MYRTO", { attachement: 50, confiance: 40, familiarite: 70 });
  L("H1", "PNJ_DOROS", { attachement: -20, familiarite: 40 }); L("H2", "PNJ_DOROS", { attachement: 30, confiance: 20, familiarite: 50 });
  L("PNJ_KORE", "PNJ_DOROS", { respect: 10, confiance: 15, familiarite: 90 }, { etiquette: "employé" });
  for (let i = 1; i <= 14; i++) { ame("PNJ_N" + i, "pnj", "Voisin " + i); fiche("PNJ_N" + i, "Voisin " + i, "Pêcheur"); L("PNJ_DOROS", "PNJ_N" + i, { confiance: ((i * 37) % 100) - 50, attachement: ((i * 53) % 100) - 50, familiarite: 10 + i * 3 }); }
  d[P + "Souvenirs/s1"] = { ame: "PNJ_DOROS", texte: "Thorin m'a humilié au marché, devant mes frères.", sujets: ["H1"], importance: 3, tour: 1, dateJeu: "Jour 2 de l'an 1000" };
  d[P + "Social/etat"] = { tour: 3, compteur: 1, historique: [], messages: [] };
  d[P + "Evenements_Sociaux/000001"] = { numero: 1, tour: 1, type: "humilier", acteur: "H1", cible: "PNJ_DOROS", gravite: 2, resume: "Thorin a humilié Doros au marché.", temoins: [], annule: false,
    changements: [{ de: "PNJ_DOROS", vers: "H1", axe: "respect", avant: -32, apres: -40 }, { de: "PNJ_DOROS", vers: "H1", axe: "attachement", avant: -60, apres: -70 }] };
});
const G = (f, a) => p.evaluate(f, a);
const lien = (de, vers) => G(([de, vers]) => window.__docs[`Systeme_Parties/P1/Liens/${de}~${vers}`] || null, [de, vers]);
const surLaDoublePage = () => G(() => { const [g] = window.GRIMOIRE.pagesLiens(); const i = window.GRIMOIRE.indexDe(g), ici = window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(); return i > 0 && (ici === i || ici === i + 1); });
const noeuds = () => G(() => [...document.querySelectorAll("#grimoire-liens-d .noeud-liens:not(.centre)")].map(n => ({ id: n.dataset.id, aff: Number(n.dataset.aff), x: parseFloat(n.style.left), y: parseFloat(n.style.top) })));
const toucher = (sel) => G((sel) => { const el = document.querySelector(sel); if (!el) return false; el.click(); return true; }, sel);
// (les pages que le livre tient vraiment, pas seulement celles qu'on lui a demandées)
const dansLeLivre = () => G(() => { const [g] = window.GRIMOIRE_LIENS.pages(); return !!g && window.GRIMOIRE.indexDe(g) >= 0; });
// La page qui suit la dernière des Aventuriers.
const apresLesAventuriers = () => G(() => { const f = window.GRIMOIRE.pagesFiches().slice(-1)[0]; const i = window.GRIMOIRE.indexDe(f);
  const c = window.GRIMOIRE.pagesCombats()[0], l = window.GRIMOIRE_LIENS.pages()[0];
  return i < 0 ? "?" : window.GRIMOIRE.indexDe(c) === i + 1 ? "combats" : (l && window.GRIMOIRE.indexDe(l) === i + 1) ? "liens" : "autre"; });
const deverrouiller = async () => {
  await G(() => window.GRIMOIRE_PARAMETRES.ouvrir());
  await pose();
  await p.fill("#grimoire-mdp-param", "rune");
  await cliquer("#grimoire-param-deverrouiller");
  return attendreQue(() => G(() => !!document.getElementById("grimoire-param-liens")), 4000);
};

// =========================================================================

// LA COMPAGNIE : Doros suit le groupe ; Dame Koré a été laissée au bourg d'Aulis ; Lyra (Pisteuse) a son loup.
await G(() => {
  const d = window.__docs;
  d["Systeme_Parties/P1"] = { ...(d["Systeme_Parties/P1"] || {}), Lieu_Actuel: "L_1",
    Suiveurs: [{ id: "PNJ_DOROS", nom: "Doros", etat: "avec", depuis: "Jour 10 de l'an 3", ts: 1 },
               { id: "PNJ_KORE", nom: "Dame Koré", etat: "laisse", depuis: "Jour 8 de l'an 3", lieu: "Le bourg d'Aulis", quand: "Jour 11 de l'an 3", ts: 2 }] };
  d["Monde_Lieux/L_1"] = { Nom_Du_Lieu: "Le port de Mégara", Reputations: { P1: { Score: 3, Tags: ["généreux"] } } };
  window.PARTIE_DATA = { ...(window.PARTIE_DATA || {}), Lieu_Actuel: "L_1" };
  window.DATE_EN_JEU_ACTUELLE = { jour: "12", annee: "3" };
  window.confirm = () => true; window.alert = () => {};
  // (Doros aime bien le groupe, cette fois)
  d["Systeme_Parties/P1/Liens/PNJ_DOROS~H1"].axes = { confiance: 50, respect: 30, attachement: 40, dette: 0, crainte: 0, familiarite: 50 };
  const lyra = window.PERSOS_JOUEURS_PARTIE[1];
  lyra.classe = "Pisteur";
  lyra.compagnon = { nom: "Croc-Gris", description: "Un grand loup gris", caractere: "joueur et protecteur", image: "", token: "", blessures: [], mort: false };
  window.PERSOS_PARTIE[1] = lyra;
});
const surGroupe = () => G(() => { const [g] = window.GRIMOIRE.pagesGroupe(); const i = window.GRIMOIRE.indexDe(g), ici = window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(); return i > 0 && (ici === i || ici === i + 1); });
const texte = (sel) => G((sel) => { const el = document.querySelector(sel); return el ? el.textContent.replace(/\s+/g, " ").trim() : ""; }, sel);
const ici = () => G(() => window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex());




const surVillage = () => G(() => { const [g] = window.GRIMOIRE.pagesVillage(); const i = window.GRIMOIRE.indexDe(g), ici = window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(); return i > 0 && (ici === i || ici === i + 1); });
const surHall = () => G(() => window.GRIMOIRE_GUILDE.vue() === "hall" && window.GRIMOIRE_GUILDE.ouverte());
const surPiece = (id) => G((id) => { const [g] = window.GRIMOIRE_GUILDE.pagesPiece(); if (!g) return false; const i = window.GRIMOIRE.indexDe(g), ici = window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(); return i > 0 && (ici === i || ici === i + 1) && window.GRIMOIRE_GUILDE.piece() === id; }, id);
const surClan = (n) => G((n) => { const c = window.GRIMOIRE_FICHES.pages().clans; const i = window.GRIMOIRE.indexDe(c[2 * n]), ici = window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(); return i > 0 && (ici === i || ici === i + 1); }, n);
const tournerEnArriere = async () => { await G(() => window.GRIMOIRE_PAGEFLIP.flipPrev("top")); await p.waitForTimeout(200); await pose(); };

// Les faux OpenAI et Cloudinary : un fanion rouge et or sur fond blanc (avec un cœur blanc, brodé), 300 × 450.
const FANION_B64 = await p.evaluate(() => { const c = document.createElement("canvas"); c.width = 300; c.height = 450; const x = c.getContext("2d");
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, 300, 450); x.fillStyle = "#6b3a1a"; x.fillRect(40, 30, 220, 12);
  x.fillStyle = "#b3261e"; x.beginPath(); x.moveTo(70, 42); x.lineTo(230, 42); x.lineTo(230, 380); x.lineTo(150, 330); x.lineTo(70, 380); x.closePath(); x.fill();
  x.fillStyle = "#ffffff"; x.fillRect(130, 150, 40, 40); x.fillStyle = "#e8c25a"; x.fillRect(110, 220, 80, 20);
  return c.toDataURL("image/png").split(",")[1]; });
const appels = { openai: [], cloud: [], detruits: [] };
let fichierDepose = "";
await p.route('https://api.openai.com/**', r => { appels.openai.push(JSON.parse(r.request().postData() || "{}"));
  r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ data: [{ b64_json: FANION_B64 }] }) }); });
await p.route('https://api.cloudinary.com/**', r => { const u = r.request().url(), corps = r.request().postData() || "";
  if (/destroy/.test(u)) { appels.detruits.push(corps); return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{"result":"ok"}' }); }
  appels.cloud.push(corps); const m = /data:image\/png;base64,([A-Za-z0-9+/=]+)/.exec(corps); fichierDepose = m ? m[1] : "";
  r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ secure_url: "https://res.cloudinary.com/banc/image/upload/v1/Clans/fanion_" + appels.cloud.length + ".png" }) }); });
await p.route(/res\.cloudinary\.com\/banc\/image\/upload\/.*Clans\/fanion_/, r => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: fichierDepose ? Buffer.from(fichierDepose, "base64") : Buffer.from(FANION_B64, "base64") }));
const TABLEAU = await (async () => { const pg = await b.newPage(); const u = await pg.evaluate(() => { const c = document.createElement("canvas"); c.width = 1536; c.height = 1024; const x = c.getContext("2d");
  x.fillStyle = "#6b4423"; x.fillRect(0, 0, 1536, 1024); x.fillStyle = "#e9d8b0"; x.fillRect(100, 150, 500, 300); x.fillRect(900, 550, 500, 380); x.fillStyle = "#c00"; x.fillRect(0, 0, 30, 1024); x.fillStyle = "#00c"; x.fillRect(1506, 0, 30, 1024);
  return c.toDataURL("image/png"); }); await pg.close(); return Buffer.from(u.split(",")[1], "base64"); })();
// (v436) Le fond du Hall : un dessin servi sur place (ou la vraie image, V436_IMAGE=chemin, pour une capture).
const FOND_HALL = process.env.V436_IMAGE ? fs.readFileSync(process.env.V436_IMAGE) : TABLEAU;
const hallDemande = [];
await p.route(/BE4AA9CB-5F9D-4AA1-BC61-38390295F166_ncq5cc/, r => { hallDemande.push(r.request().url()); r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: FOND_HALL }); });
const tableauDemande = [];
// (la vraie image, V437_TABLEAU=chemin, pour une capture)
const IMAGE_TABLEAU_BANC = process.env.V437_TABLEAU ? fs.readFileSync(process.env.V437_TABLEAU) : TABLEAU;
await p.route(/486DA9A4-10CC-430C-B103-A9E7B9EE1787_okyu3f/, r => { tableauDemande.push(r.request().url()); r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: IMAGE_TABLEAU_BANC }); });
await G(() => { localStorage.setItem("ivalis_OPENAI_API_KEY", "sk-banc"); localStorage.setItem("ivalis_CLOUDINARY_CLOUD_NAME", "banc");
  localStorage.setItem("ivalis_CLOUDINARY_API_KEY", "k"); localStorage.setItem("ivalis_CLOUDINARY_API_SECRET", "s"); });

// =========================================================================

// LE FAUX MIA_MISSIONS : six missions, la première dans un lieu existant (Kesh), la deuxième dans un lieu inconnu.
const appelsMissions = [];
await p.route('**/generativelanguage.googleapis.com/**', r => {
  const corps = JSON.parse(r.request().postData() || "{}");
  const sys = ((corps.systemInstruction || {}).parts || [{}])[0].text || "";
  if (!/MIA_MISSIONS/.test(sys)) return r.fallback();
  appelsMissions.push(sys);
  const rangs = (/dans cet ordre de rangs : ([ABC, ]+)\./.exec(sys) || [, ""])[1].split(", ");
  const n = appelsMissions.length;
  const liste = rangs.map((rg, k) => ({ rang: rg, titre: `Mission ${k + 1} (${rg}) — tirage ${n}`, resume: `Résumé court de la mission ${k + 1}.`, region: k === 2 ? 99 : 5,
    commanditaire: `Commanditaire ${k + 1}, marchand d'huile`, details: `Les détails de la mission ${k + 1}. Une deuxième phrase.`, objectif: `Objectif ${k + 1}.`,
    lettre: `Je vous écris, braves gens. Moi, commanditaire ${k + 1}, je compte sur vous.`,
    lieu: k === 0 ? { id_existant: "L_KESH", nom: "Kesh", type: "village", description: "Un village de toile." }
        : k === 1 ? { id_existant: "L_INCONNU", nom: "La grotte des Murmures", type: "grotte", description: "Une grotte humide." }
        : { id_existant: null, nom: `Le lieu ${k + 1}`, type: "ruine", description: "Des pierres." } }));
  r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(liste) }] } }] }) });
});
// Les six encarts de Nico (Carte_Livre/Tableau_Missions), les lieux de la région 5, la date (an 3, jour 12).
const ENCARTS = { 1: [0.1, 0.18, 0.2, 0.2, -6], 2: [0.42, 0.14, 0.13, 0.26, 0], 3: [0.62, 0.17, 0.2, 0.2, 6], 4: [0.1, 0.5, 0.15, 0.27, -3], 5: [0.37, 0.53, 0.26, 0.24, 4], 6: [0.66, 0.5, 0.18, 0.28, 3] };
await G((E) => {
  const enc = {}; Object.entries(E).forEach(([n, [x, y, l, h, a]]) => { enc[n] = { Numero: Number(n), x, y, l, h, angle: a }; });
  window.__docs["Carte_Livre/Tableau_Missions"] = { Prochain_Numero: 7, Encarts: enc };
  window.appliquerVillagesDeLaBase([
    { id: "L_KESH", data: { Nom_Du_Lieu: "Kesh", Type_Lieu: "Village", Carte_Regionale: 5, Position_Region: { x: 0.3, y: 0.7, taille: 0.05 } } },
    { id: "L_ERALDUR", data: { Nom_Du_Lieu: "Eraldur", Type_Lieu: "Village", Carte_Regionale: 5, Hub_Aventuriers: true, Position_Region: { x: 0.6, y: 0.4, taille: 0.06 } } }]);
  window.DATE_EN_JEU_ACTUELLE = { jour: "12", annee: "3" };
  window.NIVEAU_GROUPE = 3;
}, ENCARTS);
const tableau = () => G(() => window.__docs["Systeme_Parties/P1/Guilde/Tableau"] || null);

titre("1. LES RANGS : SIX MISSIONS, UNE A (DEUX AU PLUS), UN PEU PLUS DE C QUE DE B");
await section(async () => {
  const r = await G(() => { const t = { n: 0, six: true, a12: true, unB: true, C: 0, B: 0, A: 0, deuxA: 0 };
    for (let i = 0; i < 2000; i++) { const x = window.MISSIONS_GUILDE.tirerRangs(); const c = (k) => x.filter(v => v === k).length;
      t.six = t.six && x.length === 6; t.a12 = t.a12 && c("A") >= 1 && c("A") <= 2; t.unB = t.unB && c("B") >= 1; t.C += c("C"); t.B += c("B"); t.A += c("A"); if (c("A") === 2) t.deuxA++; }
    return t; });
  verifier("toujours six missions ; une A, deux au plus ; au moins une B", r.six && r.a12 && r.unB, JSON.stringify(r));
  verifier("…un peu plus de C que de B ; deux A seulement de temps en temps", r.C > r.B * 1.1 && r.deuxA > 200 && r.deuxA < 800, JSON.stringify(r));
});

titre("2. LA PARTIE CHARGÉE, LE TABLEAU VIDE : MIA_MISSIONS ÉCRIT LES SIX MISSIONS");
await section(async () => {
  verifier("les six missions arrivent en base (Systeme_Parties/P1/Guilde/Tableau)", await attendreQue(async () => { const t = await tableau(); return t && Array.isArray(t.Missions) && t.Missions.length === 6; }, 12000));
  const t = await tableau(), sys = appelsMissions[0] || "";
  verifier("une seule IA appelée", appelsMissions.length === 1, String(appelsMissions.length));
  verifier("le jour de leur arrivée (an 3, jour 12 : 3 × 365 + 12), le verrou levé", t.Jour_Absolu === 3 * 365 + 12 && !t.Generation_En_Cours, JSON.stringify([t.Jour_Absolu, t.Generation_En_Cours]));
  verifier("le prompt : les trois rangs, les régions, les lieux existants (Eraldur à part), le niveau du groupe", /Rang C : le rang le plus faible/.test(sys) && /Rang A : les missions les plus dures/.test(sys)
           && /Région 5/.test(sys) && /L_KESH : Kesh/.test(sys) && /Eraldur, le village de la guilde : pas de mission dedans/.test(sys) && /niveau 3/.test(sys), sys.slice(0, 120));
  const m = t.Missions;
  verifier("chaque mission : rang, titre, résumé, région, commanditaire, détails, objectif, le mot du commanditaire", m.every(x => x.Id && /^[ABC]$/.test(x.Rang) && x.Titre && x.Resume && x.Region && x.Commanditaire && x.Details && x.Objectif && /Je vous écris/.test(x.Lettre)), JSON.stringify(m[0]).slice(0, 200));
  verifier("les rangs suivent le tirage (une A au moins)", m.filter(x => x.Rang === "A").length >= 1 && m.every((x, k) => x.Titre.includes(`(${x.Rang})`)), JSON.stringify(m.map(x => x.Rang)));
  verifier("un lieu existant est repris (Kesh : son identifiant, sa région)", m[0].Lieu.Id === "L_KESH" && m[0].Lieu.Nom === "Kesh" && m[0].Region === 5, JSON.stringify(m[0].Lieu));
  verifier("…un identifiant inconnu devient un nouveau lieu ; une région inconnue (99) est corrigée", m[1].Lieu.Id === null && m[1].Lieu.Nom === "La grotte des Murmures" && m[2].Region !== 99, JSON.stringify([m[1].Lieu, m[2].Region]));
  verifier("six écritures à la main, toutes différentes", new Set(m.map(x => x.Ecriture)).size === 6 && m.every(x => ["Caveat", "Dancing Script", "Kalam", "Homemade Apple", "Indie Flower", "Satisfy"].includes(x.Ecriture)), JSON.stringify(m.map(x => x.Ecriture)));
});

titre("3. LE RENOUVELLEMENT : PAS AVANT 30 JOURS EN JEU ; UN SEUL POSTE À LA FOIS");
await section(async () => {
  await p.waitForTimeout(3000);
  verifier("le tableau frais n'est pas réécrit", appelsMissions.length === 1, String(appelsMissions.length));
  await G(() => { window.DATE_EN_JEU_ACTUELLE = { jour: "41", annee: "3" }; });
  await p.waitForTimeout(3000);
  verifier("29 jours plus tard : toujours pas", appelsMissions.length === 1, String(appelsMissions.length));
  // Un autre poste est en train de les écrire : on attend.
  await G(() => { window.__docs["Systeme_Parties/P1/Guilde/Tableau"].Generation_En_Cours = Date.now(); window.DATE_EN_JEU_ACTUELLE = { jour: "42", annee: "3" }; });
  await p.waitForTimeout(3000);
  verifier("30 jours, mais un autre poste les écrit (le verrou) : ce poste attend", appelsMissions.length === 1, String(appelsMissions.length));
  await G(() => { delete window.__docs["Systeme_Parties/P1/Guilde/Tableau"].Generation_En_Cours; });
  // (la veille réessaie une minute après un essai : ici, le renouvellement directement)
  await G(() => window.MISSIONS_GUILDE.renouveler());
  const t = await tableau();
  verifier("30 jours : les six missions sont remplacées en base", appelsMissions.length === 2 && t.Missions.length === 6 && t.Missions.every(x => /tirage 2/.test(x.Titre)) && t.Jour_Absolu === 3 * 365 + 42, JSON.stringify([appelsMissions.length, t.Jour_Absolu, t.Missions[0].Titre]));
});

titre("4. LES ENCARTS : LE RANG, LE SÉPARATEUR, LE TITRE, LE RÉSUMÉ ; À LA MAIN ; PENCHÉS COMME L'ENCART");
await section(async () => {
  await G(() => window.GRIMOIRE.allerAuVillage()); await attendreQue(surVillage, 8000); await pose();
  await cliquer("#lieu-village-hall"); await attendreQue(surHall, 8000); await pose();
  await cliquer("#guilde-missions"); await attendreQue(() => surPiece("missions"), 8000); await pose();
  await attendreQue(() => G(() => document.querySelectorAll(".page-tableau-missions.gauche .encart-tableau.avec-mission").length === 6), 6000);
  const r = await G(() => { const t = window.__docs["Systeme_Parties/P1/Guilde/Tableau"].Missions;
    return [...document.querySelectorAll(".page-tableau-missions.gauche .encart-tableau")].map((e, k) => { const m = e.querySelector(".mission-encart");
      return { rang: (e.querySelector(".rang-mission") || {}).textContent, sep: !!e.querySelector("svg.separateur-mission"), titre: (e.querySelector(".titre-mission") || {}).textContent,
               resume: (e.querySelector(".resume-mission") || {}).textContent, police: m ? getComputedStyle(m).fontFamily : "", attendu: t[k].Titre, angle: e.style.transform, doigt: getComputedStyle(e).pointerEvents,
               ordre: m ? [...m.children].map(c => c.className.baseVal !== undefined ? c.className.baseVal : c.className) : [] }; }); });
  verifier("six encarts écrits, chacun avec sa mission (dans l'ordre des encarts)", r.length === 6 && r.every(x => x.titre === x.attendu), JSON.stringify(r.map(x => x.titre)).slice(0, 200));
  verifier("…en haut le rang, dessous un petit séparateur dessiné, puis le titre, puis le résumé", r.every(x => /^Rang [ABC]$/.test(x.rang) && x.sep && x.resume && JSON.stringify(x.ordre) === JSON.stringify(["rang-mission rang-" + x.rang.slice(-1), "separateur-mission", "titre-mission", "resume-mission"])), JSON.stringify(r[0]));
  verifier("…six écritures différentes, à la main", new Set(r.map(x => x.police.split(",")[0])).size === 6, JSON.stringify(r.map(x => x.police.split(",")[0])));
  verifier("…le texte penche avec son encart (il est dedans, l'encart tourné)", r.every(x => /rotate\(/.test(x.angle)) && r[0].angle === "rotate(-6deg)", JSON.stringify(r.map(x => x.angle)));
  verifier("…et l'encart se touche", r.every(x => x.doigt === "auto"));
  await p.waitForTimeout(600); await cap("v442-tableau");
});

titre("5. LA FEUILLE : ELLE GLISSE DU BAS, SON BAS CACHÉ, LE SCEAU ROUGE ; UN TOUCHER DEHORS LA FERME");
await section(async () => {
  await G(() => { window.__sons = []; });
  const c = await G(() => { const e = document.querySelectorAll(".page-tableau-missions.gauche .encart-tableau.avec-mission")[0]; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(c.x, c.y);
  await p.waitForTimeout(900);
  const f = await G(() => { const v = document.getElementById("feuille-mission"), fe = v && v.querySelector(".feuille-mission"); if (!fe) return null; const r = fe.getBoundingClientRect(), s = fe.querySelector(".sceau-mission").getBoundingClientRect();
    return { ouverte: v.classList.contains("ouverte"), haut: r.top / innerHeight, bas: r.bottom - innerHeight, fond: getComputedStyle(fe).backgroundImage, texte: fe.textContent.replace(/\s+/g, " "),
             sceau: fe.querySelector(".sceau-mission").innerText.replace(/\s+/g, " ").trim(), sceauVu: s.bottom <= innerHeight && s.top >= 0, sceauRouge: getComputedStyle(fe.querySelector(".sceau-mission")).backgroundImage,
             sons: window.__sons.map(x => x[0]) }; });
  verifier("un toucher sur l'encart : la feuille glisse et s'ouvre", f && f.ouverte, JSON.stringify(f && f.ouverte));
  verifier("…une page de parchemin (la texture des pages du livre), en haut à 5 % ; son bas caché sous le bord de l'écran", f.fond.includes("images/grimoire/page.webp") && Math.abs(f.haut - 0.05) < 0.01 && f.bas > 10, JSON.stringify([f.haut, f.bas]));
  verifier("…la région, le lieu, le commanditaire, la mission, l'objectif, le mot du commanditaire", /Région\s*La région|Région/.test(f.texte) && /Kesh/.test(f.texte) && /Commanditaire 1, marchand d'huile/.test(f.texte) && /Les détails de la mission 1/.test(f.texte) && /Objectif 1\./.test(f.texte) && /Je vous écris, braves gens/.test(f.texte), f.texte.slice(0, 260));
  verifier("…en bas, le sceau rouge « Accepter la mission », visible", f.sceau === "Accepter la mission" && f.sceauVu && /radial-gradient/.test(f.sceauRouge), JSON.stringify([f.sceau, f.sceauVu]));
  verifier("…le bruit d'une page qu'on attrape", f.sons.includes("page-prise"), JSON.stringify(f.sons));
  await cap("v442-feuille");
  // Un toucher sur la feuille ne la ferme pas ; dehors, oui.
  const fr = await G(() => document.querySelector("#feuille-mission .feuille-mission").getBoundingClientRect());
  await p.mouse.click(fr.left + fr.width / 2, fr.top + 60); await p.waitForTimeout(300);
  verifier("un toucher sur la feuille : elle reste", await G(() => document.getElementById("feuille-mission").classList.contains("ouverte")));
  await G(() => { window.__sons = []; });
  await p.mouse.click(Math.max(5, fr.left - 40), 200); await p.waitForTimeout(700);
  const g = await G(() => ({ ouverte: document.getElementById("feuille-mission").classList.contains("ouverte"), haut: document.querySelector("#feuille-mission .feuille-mission").getBoundingClientRect().top / innerHeight, sons: window.__sons.map(x => x[0]) }));
  verifier("un toucher dehors : elle redescend, avec le même bruit", !g.ouverte && g.haut > 0.95 && g.sons.includes("page-prise"), JSON.stringify(g));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
