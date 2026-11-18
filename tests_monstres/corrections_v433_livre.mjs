// v433 — LE HALL DE GUILDE, LE LIVRE DES CLANS, LE GROUPE SANS « ⇄ ».
// Nico : « un bouton pour le Hall de guilde au centre de la map village, son nom en dessous sur un petit parchemin
// déroulé ; une nouvelle double page : Hall de guilde à droite, à gauche les boutons du menu (Panneau des missions,
// Salle du conseil, Bureau du patriarche, Livre des clans) ; les trois premiers en développement ; le Livre des clans
// remplace les pages Aventuriers : une double page par clan (à gauche les aventuriers et leurs cases, à droite la
// bannière, vide pour l'instant, et le nom du clan en gros titre). » « Retire le bouton ⇄ sous l'avatar ; le bouton
// Les aventuriers devient Les clans et ouvre la page des clans. » Sur la vraie page (le décor du banc v424).
// Lancer : node tests_monstres/corrections_v433_livre.mjs
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
const CAPTURES = process.env.V433_CAPTURES || "";
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
const surHall = () => G(() => window.GRIMOIRE_GUILDE.ouverte());
const surClan = (n) => G((n) => { const c = window.GRIMOIRE_FICHES.pages().clans; const i = window.GRIMOIRE.indexDe(c[2 * n]), ici = window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(); return i > 0 && (ici === i || ici === i + 1); }, n);

titre("1. LE VILLAGE : LE BÂTIMENT DU HALL SE TOUCHE, SON NOM SUR UN PETIT PARCHEMIN");
await section(async () => {
  await G(() => window.GRIMOIRE.allerAuVillage()); await attendreQue(surVillage, 8000); await pose();
  const h = await G(() => { const b = document.querySelectorAll("#lieu-village-hall"), parch = [...document.querySelectorAll(".parchemin-lieu-village")];
    const img = document.querySelector(".page-village .image-village");
    return { n: b.length, data: b[0] && b[0].dataset.action + "/" + b[0].dataset.gu, texte: parch.map(x => x.textContent.trim()), img: !!img }; });
  verifier("une zone « Hall de guilde » sur le bâtiment central (data-action guilde)", h.n >= 1 && h.data === "guilde/hall" && h.img, JSON.stringify(h));
  verifier("…et son nom dessous, sur un parchemin déroulé", h.texte.length >= 1 && h.texte.every(t => t === "Hall de guilde"), JSON.stringify(h.texte));
  // La zone est bien au centre de l'image du village (le bâtiment du Hall), et le parchemin sous elle.
  const g = await G(() => { const imgs = [...document.querySelectorAll(".page-village .image-village")].map(i => i.getBoundingClientRect());
    const zone = [...document.querySelectorAll(".lieu-village")].map(z => z.getBoundingClientRect()).find(r => r.width > 0);
    const parch = [...document.querySelectorAll(".parchemin-lieu-village")].map(z => z.getBoundingClientRect()).find(r => r.width > 0);
    const im = imgs.find(r => r.width > 0); if (!im || !zone || !parch) return null;
    return { cx: ((zone.left + zone.width / 2) - im.left) / im.width, cy: ((zone.top + zone.height / 2) - im.top) / im.height, sous: parch.top >= zone.bottom - 4, aligne: Math.abs((parch.left + parch.width / 2) - (zone.left + zone.width / 2)) < 6 }; });
  verifier("la zone tombe au centre du dessin ; le parchemin juste dessous, centré", g && g.cx > 0.45 && g.cx < 0.55 && g.cy > 0.38 && g.cy < 0.55 && g.sous && g.aligne, JSON.stringify(g));
  const c = await G(() => { const z = [...document.querySelectorAll(".lieu-village")].map(z => z.getBoundingClientRect()).find(r => r.width > 0); return { x: z.left + z.width / 2, y: z.top + z.height / 2 }; });
  verifier("au toucher, c'est bien la zone du Hall qui répond (pas la page)", await dans(c.x, c.y, ".lieu-village"), await dessus(c.x, c.y));
  await cap("v433-village");
});

titre("2. LE HALL DE GUILDE : LE TITRE À DROITE, LE MENU À GAUCHE (COMME LE SOMMAIRE)");
await section(async () => {
  await cliquer("#lieu-village-hall");
  verifier("le toucher ouvre la double page du Hall", await attendreQue(surHall, 8000));
  await pose();
  const r = await G(() => { const [g, d] = window.GRIMOIRE_GUILDE.pages();
    return { gauche: g.classList.contains("gauche"), droite: d.classList.contains("droite"),
      titre: (d.querySelector(".titre-guilde") || {}).textContent, entrees: [...g.querySelectorAll(".entree-guilde")].map(e => e.textContent.replace(/\s+/g, " ").trim()),
      lavis: g.querySelectorAll(".entree-guilde .lavis").length, souligne: [...g.querySelectorAll(".entree-guilde-texte")].every(s => /url|svg/.test(s.style.backgroundImage || "")),
      retour: (g.querySelector(".retour-guilde") || {}).textContent }; });
  verifier("à droite : le gros titre « Hall de guilde »", r.droite && /^\s*Hall de guilde\s*$/.test(r.titre || ""), JSON.stringify(r.titre));
  verifier("à gauche : les quatre entrées, dans l'ordre", r.gauche && JSON.stringify(r.entrees) === JSON.stringify(["I- Panneau des missions", "II- Salle du conseil", "III- Bureau du patriarche", "IV- Livre des clans"]), JSON.stringify(r.entrees));
  verifier("…écrites comme le sommaire : un lavis et un trait de plume sous chacune", r.lavis === 4 && r.souligne, JSON.stringify([r.lavis, r.souligne]));
  verifier("…et un retour au village", /Revenir au village/.test(r.retour || ""));
  const police = await G(() => getComputedStyle(document.querySelector(".titre-guilde span")).fontFamily);
  verifier("le titre dans la police des titres du livre", /Berkshire|Swash|var|Almendra/.test(police), police);
  await cap("v433-hall");
});

titre("3. LES TROIS PIÈCES : « EN DÉVELOPPEMENT », AVEC LEUR RETOUR AU HALL");
await section(async () => {
  for (const [id, nom] of [["missions", "Panneau des missions"], ["conseil", "Salle du conseil"], ["patriarche", "Bureau du patriarche"]]) {
    await cliquer("#guilde-" + id);
    await p.waitForTimeout(150);
    const r = await G(() => { const [g, d] = window.GRIMOIRE_GUILDE.pages(); return { vue: window.GRIMOIRE_GUILDE.vue(), titre: d.querySelector(".titre-guilde").textContent.trim(), dev: g.textContent + d.textContent, ouverte: window.GRIMOIRE_GUILDE.ouverte() }; });
    verifier(`« ${nom} » : sa page, « En développement »`, r.vue === id && r.titre === nom && /En développement/.test(r.dev) && r.ouverte, JSON.stringify(r).slice(0, 160));
    await cliquer('.page-guilde [data-gu="hall"]');
    await p.waitForTimeout(150);
    verifier("…« Retour au Hall de guilde » : le menu revient", await G(() => window.GRIMOIRE_GUILDE.vue() === "hall" && document.querySelectorAll(".entree-guilde").length === 4));
  }
  if (CAPTURES) { await cliquer("#guilde-conseil"); await p.waitForTimeout(200); await cap("v433-piece"); await cliquer('.page-guilde [data-gu="hall"]'); }
});

titre("4. LE LIVRE DES CLANS : UNE DOUBLE PAGE PAR CLAN, SUR LE SIEN D'ABORD");
await section(async () => {
  await G(() => window.GRIMOIRE_GUILDE.ouvrir()); await attendreQue(surHall, 6000); await pose();
  await cliquer("#guilde-clans");
  verifier("« Livre des clans » mène au clan du joueur (le premier)", await attendreQue(() => surClan(0), 8000));
  await pose();
  const r = await G(() => { const c = window.GRIMOIRE_FICHES.pages().clans;
    return c.map(el => ({ cote: el.classList.contains("gauche") ? "g" : "d", classe: el.className, cases: el.querySelectorAll(".case-actif").length, lignes: [...el.querySelectorAll(".ligne-aventurier .nom-aventurier")].map(x => x.textContent.trim()),
      nouvel: !!el.querySelector(".nouvel-aventurier"), banniere: !!el.querySelector(".cadre-banniere-clan"), vide: !!el.querySelector(".cadre-banniere-clan.vide"), nom: (el.querySelector(".nom-clan") || {}).textContent || "",
      titre: (el.querySelector(".titre-clan") || {}).textContent || "" })); });
  verifier("deux clans (Ben, l'autre joueur) : quatre pages, gauche / droite", r.length === 4 && r.map(x => x.cote).join("") === "gdgd", JSON.stringify(r.map(x => x.cote)));
  verifier("le sien, à gauche : ses aventuriers, leur case, « + Un nouvel aventurier »", r[0].lignes.join() === "Thorin Ironfoot" && r[0].cases === 1 && r[0].nouvel && /Les aventuriers/.test(r[0].titre), JSON.stringify(r[0]).slice(0, 200));
  verifier("…à droite : la place de la bannière (vide pour l'instant), « Clan de Ben » en gros titre dessous", r[1].banniere && r[1].vide && /^Clan de Ben$/.test(r[1].nom.trim()) && r[1].cases === 0, JSON.stringify(r[1]).slice(0, 200));
  verifier("l'autre clan : ses aventuriers sans case (ce n'est pas le sien), sa bannière et son nom", r[2].lignes.join() === "Lyra Sombreval" && r[2].cases === 0 && !r[2].nouvel && r[3].banniere && /^Clan (de |sans nom)/.test(r[3].nom.trim()), JSON.stringify([r[2].lignes, r[3].nom]));
  const ordre = await G(() => { const c = window.GRIMOIRE_FICHES.pages().clans; return c.map(el => window.GRIMOIRE.indexDe(el)); });
  verifier("les pages se suivent : on tourne la page pour voir l'autre clan", ordre.every((x, i) => i === 0 || x === ordre[0] + i) && ordre[0] % 2 === 1, JSON.stringify(ordre));
  const taille = await G(() => { const n = document.querySelector("#grimoire-fiches-clan-banniere-0 .nom-clan"), b = document.querySelector("#grimoire-fiches-clan-banniere-0 .cadre-banniere-clan");
    const rn = n.getBoundingClientRect(), rb = b.getBoundingClientRect(); return { fs: parseFloat(getComputedStyle(n).fontSize), sous: rn.top >= rb.bottom - 2, h: rb.height }; });
  verifier("le nom du clan, en gros, sous la bannière", taille.sous && taille.fs > 20 && taille.h > 60, JSON.stringify(taille));
  await cap("v433-clan");
  // Un aventurier : sa fiche, comme avant.
  await cliquer('#grimoire-fiches-clan-0 .ligne-aventurier[data-id="H1"]');
  verifier("toucher un aventurier ouvre toujours sa fiche", await attendreQue(() => G(() => window.GRIMOIRE_FICHES.herosAffiche() === "H1"), 4000));
});

titre("5. LA PAGE DU GROUPE : PLUS DE « ⇄ », « LES CLANS › »");
await section(async () => {
  await G(() => window.GRIMOIRE_GROUPE.ouvrir()); await attendreQue(surGroupe, 6000); await pose();
  const r = await G(() => { const [g, d] = window.GRIMOIRE.pagesGroupe(); const t = g.textContent + d.textContent;
    return { changer: !!document.querySelector('[data-gp="changer"], .changer-heros-groupe'), fleche: /⇄/.test(t), bouton: [...document.querySelectorAll('[data-gp="aventuriers"]')].map(b => b.textContent.trim()) }; });
  verifier("le bouton ⇄ sous l'avatar a disparu", !r.changer && !r.fleche, JSON.stringify(r));
  verifier("le bouton s'appelle « Les clans › »", r.bouton.length === 1 && r.bouton[0] === "Les clans ›", JSON.stringify(r.bouton));
  await cliquer('[data-gp="aventuriers"]');
  verifier("…et il ouvre le Livre des clans, sur le sien", await attendreQue(() => surClan(0), 8000));
});

titre("6. QUITTÉ, LE HALL SORT DU LIVRE");
await section(async () => {
  verifier("les pages du Hall ne restent pas dans le livre une fois quittées", await attendreQue(() => G(() => window.GRIMOIRE.pagesGuilde().length === 0), 12000));
});
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
