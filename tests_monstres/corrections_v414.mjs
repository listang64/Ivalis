// v414 — LA REFONTE DES PNJ, LOT 5 : LES FILS INVISIBLES DANS LE LIVRE.
//
// Nico : « tout est visible pour le moment » ; « un petit encart que quand on
// clique sur le portrait » ; « le clic sur le nom fait afficher son image côté
// gauche du livre, et un clic sur cette image fait apparaître sa fiche ».
// Sur la VRAIE page, dans le livre, en partie : le sommaire, la fiche, le radar
// (distance, couleurs, douze portraits, les deux regards, le filtre, la
// recherche, deux touchers), l'encart, les gestes de Nico et Ben, et le chemin
// du récit à la fiche. Captures : V414_CAPTURES=dossier.
// Lancer : node tests_monstres/corrections_v414.mjs
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
const CAPTURES = process.env.V414_CAPTURES || "";
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
await p.route(/res\.cloudinary\.com\/.*IMG_2272_t1qzz5/, r => { villageDemande.push(r.request().url()); r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: VILLAGE }); });
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
  L("PNJ_DOROS", "H1", { confiance: -60, respect: -40, attachement: -70, crainte: 10, familiarite: 30 }, { derniers: [{ n: 1, tour: 1, resume: "Thorin a humilié Doros au marché.", acteur: "H1", cible: "PNJ_DOROS", ecarts: { respect: -8, attachement: -10 } },
                 // (v417) un témoignage : Doros a vu Thorin bousculer Koré — pas « entre eux », l'encart ne le montre pas
                 { n: 7, tour: 2, resume: "Thorin a bousculé Dame Koré.", acteur: "H1", cible: "PNJ_KORE", ecarts: { confiance: -3 } }] });
  L("PNJ_DOROS", "H2", { confiance: 60, attachement: 70, respect: 50, dette: 45, familiarite: 80 });
  L("PNJ_DOROS", "PNJ_KORE", { respect: 40, crainte: 20, confiance: 10, familiarite: 90 }, { origine: "preexistant", etiquette: "patron", histoire: "Koré possède les quais." });
  L("PNJ_DOROS", "PNJ_MYRTO", { attachement: 50, confiance: 40, familiarite: 70 });
  L("H1", "PNJ_DOROS", { attachement: -20, familiarite: 40 }); L("H2", "PNJ_DOROS", { attachement: 30, confiance: 20, familiarite: 50 });
  L("PNJ_KORE", "PNJ_DOROS", { respect: 10, confiance: 15, familiarite: 90 }, { etiquette: "employé" });
  for (let i = 1; i <= 14; i++) { ame("PNJ_N" + i, "pnj", "Voisin " + i); fiche("PNJ_N" + i, "Voisin " + i, "Pêcheur"); L("PNJ_DOROS", "PNJ_N" + i, { confiance: ((i * 37) % 100) - 50, attachement: ((i * 53) % 100) - 50, familiarite: 10 + i * 3 }); }
  d[P + "Souvenirs/s1"] = { ame: "PNJ_DOROS", texte: "Thorin m'a humilié au marché, devant mes frères.", sujets: ["H1"], importance: 3, tour: 1, dateJeu: "Jour 2 de l'an 1000" };
  d[P + "Souvenirs/s2"] = { ame: "PNJ_DOROS", texte: "Lyra m'a soigné la main.", sujets: ["H2"], importance: 1, tour: 3, dateJeu: "Jour 4 de l'an 1000" };
  d[P + "Social/etat"] = { tour: 3, compteur: 1, historique: [], messages: [] };
  d[P + "Evenements_Sociaux/000001"] = { numero: 1, tour: 1, type: "humilier", acteur: "H1", cible: "PNJ_DOROS", gravite: 2, resume: "Thorin a humilié Doros au marché.", temoins: [], annule: false,
    changements: [{ de: "PNJ_DOROS", vers: "H1", axe: "respect", avant: -32, apres: -40 }, { de: "PNJ_DOROS", vers: "H1", axe: "attachement", avant: -60, apres: -70 }] };
});
const G = (f, a) => p.evaluate(f, a);
const lien = (de, vers) => G(([de, vers]) => window.__docs[`Systeme_Parties/P1/Liens/${de}~${vers}`] || null, [de, vers]);
const surLaDoublePage = () => G(() => { const [g] = window.GRIMOIRE.pagesLiens(); const i = window.GRIMOIRE.indexDe(g), ici = window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(); return i > 0 && (ici === i || ici === i + 1); });
const noeuds = () => G(() => [...document.querySelectorAll("#grimoire-liens-d .noeud-liens:not(.centre)")].map(n => ({ id: n.dataset.id, aff: Number(n.dataset.aff), x: parseFloat(n.style.left), y: parseFloat(n.style.top) })));
const toucher = (sel) => G((sel) => { const el = document.querySelector(sel); if (!el) return false; el.click(); return true; }, sel);

// =========================================================================
titre("1. LES PARAMÈTRES : « LES FILS INVISIBLES » OUVRENT LEUR DOUBLE PAGE (v416 : PLUS AU SOMMAIRE)");
// =========================================================================
await section(async () => {
  // (v416) Nico : « vire les fils invisibles du sommaire et mets-les dans les paramètres ».
  verifier("(v416) le sommaire n'a plus d'entrée « Les fils invisibles »", !(await G(() => document.getElementById("grimoire-index-liens"))) && !!(await G(() => document.getElementById("grimoire-index-recit"))));
  await G(() => window.GRIMOIRE_PARAMETRES.ouvrir());
  await pose();
  await p.fill("#grimoire-mdp-param", "rune");
  await cliquer("#grimoire-param-deverrouiller");
  await attendreQue(() => G(() => !!document.getElementById("grimoire-param-liens")), 4000);
  const e = await G(() => { const el = document.getElementById("grimoire-param-liens"); return el ? el.textContent.trim() + " / " + el.closest(".encart-parametres").dataset.cat : ""; });
  verifier("les Paramètres ont leur entrée, chez le Maître du Jeu", e === "Les fils invisibles / mj", e);
  await cliquer("#grimoire-param-liens");
  verifier("le livre tourne jusqu'à leur double page (après les Aventuriers)", await attendreQue(surLaDoublePage, 8000)
           && await G(() => window.GRIMOIRE.indexDe(window.GRIMOIRE.pagesLiens()[0]) > window.GRIMOIRE.indexDe(window.GRIMOIRE.pagesFiches().slice(-1)[0] || null)));
  await attendreQue(() => G(() => !!document.querySelector("#grimoire-liens-g .nom-liens")), 5000);
  await G(() => window.GRIMOIRE_LIENS.centrer("PNJ_DOROS"));
  await p.waitForTimeout(300);
  await cap("v414_fils");
});

// =========================================================================
titre("2. À GAUCHE, LA FICHE DE DOROS (TOUT EST VISIBLE)");
// =========================================================================
await section(async () => {
  const g = await G(() => document.getElementById("grimoire-liens-g").innerText);
  verifier("son nom, son métier, son humeur (en colère, et pourquoi)", /Doros/.test(g) && /Docker/.test(g) && /Humeur : en colère — Thorin l'a humilié/.test(g), g.slice(0, 160).replace(/\n/g, " | "));
  verifier("…ses six traits chiffrés, ses valeurs, son objectif, sa faille, son masque, sa parole, son secret",
           ["Prudence", "Impulsivité", "Loyauté", "Empathie", "Orgueil", "Sociabilité"].every(t => g.includes(t)) && /Valeurs : l'honneur/.test(g) && /Venger son honneur/.test(g) && /Faille : Il ne pardonne pas/.test(g) && /Masque : Bourru/.test(g) && /Parole : Rauque/.test(g) && /Secret : Il vole la recette/.test(g));
  verifier("…ses souvenirs, datés", /Jour 2 de l'an 1000/.test(g) && /humilié au marché/.test(g));
  // (v417) Nico : « mettre toujours le plus récent en haut de la liste ».
  verifier("(v417) le souvenir le plus récent en haut (Lyra, jour 4, avant Thorin, jour 2)", g.indexOf("Lyra m'a soigné") >= 0 && g.indexOf("Lyra m'a soigné") < g.indexOf("humilié au marché"));
  // (v415) Nico : « une liste déroulante, par ordre alphabétique ».
  const index = await G(() => [...document.querySelectorAll("#grimoire-liens-d select.index-liens option")].map(o => ({ t: o.textContent.trim(), v: o.value, choisi: o.selected })));
  const noms = index.map(x => x.t);
  verifier("en haut de la page de droite (v417), toutes les âmes de la partie dans une liste déroulante, par ordre alphabétique ; Myrto, morte, marquée †", index.length === 19 && JSON.stringify(noms) === JSON.stringify(noms.slice().sort((x, y) => x.localeCompare(y, "fr", { sensitivity: "base" })))
           && noms[0] === "Dame Koré" && noms.includes("Myrto †") && noms.includes("Thorin (héros)") && index.find(x => x.v === "PNJ_DOROS").choisi, noms.slice(0, 5).join(", "));
  await G(() => { const s = document.querySelector("#grimoire-liens-d select.index-liens"); s.value = "PNJ_KORE"; s.dispatchEvent(new Event("change")); });
  await attendreQue(() => G(() => window.GRIMOIRE_LIENS.vue().centre === "PNJ_KORE"), 3000);
  verifier("choisir une âme dans la liste la met au centre", (await G(() => window.GRIMOIRE_LIENS.vue().centre)) === "PNJ_KORE");
  await G(() => window.GRIMOIRE_LIENS.centrer("PNJ_DOROS"));
  await p.waitForTimeout(200);
  const portrait = await G(() => (document.querySelector("#grimoire-liens-g .medaillon-liens.grand img") || {}).src || "");
  verifier("son portrait (celui de sa fiche)", /PNJ\/doros\.png/.test(portrait));
});

// =========================================================================
titre("3. À DROITE, LE RADAR");
// =========================================================================
await section(async () => {
  const n = await noeuds();
  verifier("douze portraits au plus (Doros en connaît dix-huit) ; les autres en liste", n.length === 12 && /6 autres liens/.test(await G(() => (document.querySelector("#grimoire-liens-d .reste-liens") || {}).textContent || "")), `${n.length} portraits`);
  const dist = (q) => Math.hypot(q.x - 50, (q.y - 50) / 0.86);
  const tries = n.slice().sort((a, b) => b.aff - a.aff);
  const moy = (l) => l.reduce((s, q) => s + dist(q), 0) / l.length;
  verifier("plus l'affinité est haute, plus le portrait est près du centre", moy(tries.slice(0, 3)) < moy(tries.slice(-3)) && dist(tries[0]) < dist(tries[tries.length - 1]),
           `${moy(tries.slice(0, 3)).toFixed(1)} contre ${moy(tries.slice(-3)).toFixed(1)}`);
  const fils = await G(() => Object.fromEntries([...document.querySelectorAll("#grimoire-liens-d line[data-fil]")].map(l => [l.dataset.fil, { c: l.getAttribute("stroke"), d: l.getAttribute("stroke-dasharray") || "", o: Number(l.getAttribute("stroke-opacity")) }])));
  verifier("le fil vers Thorin est rouge, en pointillés (ils se connaissent peu) ; vers Lyra, vert et plein", fils.H1 && fils.H1.c === "#ab514d" && fils.H1.d && fils.H2 && fils.H2.c === "#5e7f59" && !fils.H2.d, JSON.stringify({ H1: fils.H1, H2: fils.H2 }));
  verifier("aucun chiffre sous les portraits (seulement dans l'encart)", !(await G(() => /[+−-]\d/.test([...document.querySelectorAll("#grimoire-liens-d .noeud-liens")].map(x => x.innerText).join(" ")))));
  const a1 = (await noeuds()).find(q => q.id === "H1");
  await toucher('#grimoire-liens-d .noeud-liens[data-id="H1"]');
  await p.waitForTimeout(200);
  const enc = await G(() => (document.querySelector("#grimoire-liens-d .encart-liens") || {}).innerText || "");
  verifier("un toucher sur Thorin : l'encart « Doros → Thorin », le chiffre (−58), le mot, les six axes", /Doros → Thorin/.test(enc) && /−58/.test(enc) && /hostile/.test(enc) && ["Confiance", "Respect", "Attachement", "Dette", "Crainte", "Familiarité"].every(x => enc.includes(x)), enc.slice(0, 160).replace(/\n/g, " | "));
  verifier("…ce qu'il en dit, et le dernier changement (sa cause)", /ne lui fait pas confiance/.test(enc) && /Thorin a humilié Doros au marché/.test(enc));
  // (v417) Nico : « les derniers changements, mais en rapport avec le personnage en question ».
  verifier("(v417) seulement ce qui s'est passé entre Doros et Thorin (pas ce que Doros a vu Thorin faire à Koré)", !/bousculé Dame Koré/.test(enc));
  verifier("…sans les gestes de Nico et Ben pour un joueur", !/Ajuster/.test(enc) && !/annuler/.test(enc));
  await cap("v414_encart");
  // L'autre regard : ce qu'on ressent pour Doros.
  await toucher('#grimoire-liens-d .regard-liens[data-regard="in"]');
  await p.waitForTimeout(200);
  const n2 = await noeuds();
  verifier("« Ce qu'on ressent pour lui » : Thorin, Lyra et Koré, à d'autres places", n2.length === 3 && ["H1", "H2", "PNJ_KORE"].every(id => n2.some(q => q.id === id)) && Math.abs(n2.find(q => q.id === "H1").x - a1.x) + Math.abs(n2.find(q => q.id === "H1").y - a1.y) > 1,
           n2.map(q => q.id).join(", "));
  await toucher('#grimoire-liens-d .regard-liens[data-regard="out"]');
  await G(() => { const s = document.querySelector("#grimoire-liens-d .filtre-liens"); s.value = "heros"; s.dispatchEvent(new Event("change")); });
  await p.waitForTimeout(150);
  verifier("le filtre « Héros » ne garde que Thorin et Lyra", JSON.stringify((await noeuds()).map(q => q.id).sort()) === '["H1","H2"]');
  await G(() => { const s = document.querySelector("#grimoire-liens-d .filtre-liens"); s.value = "tous"; s.dispatchEvent(new Event("change")); });
  await G(() => { const c = document.querySelector("#grimoire-liens-d .recherche-liens"); c.value = "kore"; c.dispatchEvent(new Event("change")); });
  await p.waitForTimeout(300);
  verifier("la recherche « kore » met Dame Koré au centre (sa fiche à gauche)", (await G(() => window.GRIMOIRE_LIENS.vue().centre)) === "PNJ_KORE" && /Dame Koré/.test(await G(() => document.querySelector("#grimoire-liens-g .nom-liens").textContent)));
  await G(() => window.GRIMOIRE_LIENS.centrer("PNJ_DOROS"));
  await toucher('#grimoire-liens-d .noeud-liens[data-id="PNJ_KORE"]'); await toucher('#grimoire-liens-d .noeud-liens[data-id="PNJ_KORE"]');
  await p.waitForTimeout(300);
  verifier("deux touchers sur Koré : elle passe au centre", (await G(() => window.GRIMOIRE_LIENS.vue().centre)) === "PNJ_KORE");
  await G(() => window.GRIMOIRE_LIENS.centrer("PNJ_DOROS"));
});

// =========================================================================
titre("4. NICO ET BEN : ANNULER UN CHANGEMENT ; RÉGLER UN LIEN (v426 : SEULEMENT EN MODE DEV)");
// =========================================================================
await section(async () => {
  await G(() => { window.COMPTE_JOUEUR = { nom: "Nico", idJoueur: "P_01", admin: true }; window.confirm = () => true; });
  await toucher('#grimoire-liens-d .noeud-liens[data-id="H1"]');
  await p.waitForTimeout(150);
  verifier("l'encart montre « annuler » à un admin, et plus de bouton « Ajuster » (v426)", !/Ajuster/.test(await G(() => document.querySelector("#grimoire-liens-d .encart-liens").innerText)) && !(await G(() => document.querySelector('#grimoire-liens-d [data-cb="ajuster"]'))) && !!(await G(() => document.querySelector('#grimoire-liens-d .annuler-liens[data-n="1"]'))));
  const refuseAdmin = await G(async () => { try { await window.SOCIAL.ajusterLien("P1", "PNJ_DOROS", "H1", { confiance: 99 }); return "passé"; } catch (e) { return e.message; } });
  verifier("un admin hors mode DEV ne règle plus un lien à la main", /Réservé au mode développeur/.test(refuseAdmin), refuseAdmin);
  await G(async () => { localStorage.setItem("ivalis_DEV_MODE", "on"); await window.SOCIAL.ajusterLien("P1", "PNJ_DOROS", "H1", { confiance: 40 }); localStorage.setItem("ivalis_DEV_MODE", "off"); });
  await attendreQue(async () => ((await lien("PNJ_DOROS", "H1")) || { axes: {} }).axes.confiance === 40, 4000);
  const l = await lien("PNJ_DOROS", "H1");
  const aj = await G(() => window.__docs["Systeme_Parties/P1/Evenements_Sociaux/000002"] || null);
  verifier("en mode DEV : Doros → Thorin, confiance 40 ; le journal le dit (« ajustement », par Nico, avant/après)", l.axes.confiance === 40 && !!aj && aj.type === "ajustement" && aj.par === "Nico" && /Réglé en mode DEV/.test(aj.resume) && aj.changements[0].avant === -60 && aj.changements[0].apres === 40, JSON.stringify(aj && aj.changements));
  await G(() => window.GRIMOIRE_LIENS.centrer("PNJ_DOROS")); await p.waitForTimeout(600);
  await toucher('#grimoire-liens-d .noeud-liens[data-id="H1"]');
  await p.waitForTimeout(150);
  await toucher('#grimoire-liens-d .annuler-liens[data-n="1"]');
  await attendreQue(async () => !!((await G(() => window.__docs["Systeme_Parties/P1/Evenements_Sociaux/000001"])) || {}).annule, 4000);
  const l2 = await lien("PNJ_DOROS", "H1"), e1 = await G(() => window.__docs["Systeme_Parties/P1/Evenements_Sociaux/000001"]);
  verifier("annulé : l'humiliation est retirée (respect −40 → −32, attachement −70 → −60), le réglage d'après reste", e1.annule === true && e1.annulePar === "Nico" && l2.axes.respect === -32 && l2.axes.attachement === -60 && l2.axes.confiance === 40, JSON.stringify(l2.axes));
  verifier("…et le changement est barré dans l'encart", (l2.derniers.find(x => x.n === 1) || {}).annule === true);
  const refuse = await G(async () => { window.COMPTE_JOUEUR = { nom: "Adrien", admin: false }; try { await window.SOCIAL.ajusterLien("P1", "PNJ_DOROS", "H1", { confiance: 99 }); return "passé"; } catch (e) { return e.message; } });
  verifier("un joueur ne peut pas régler un lien", /Réservé au mode développeur/.test(refuse));
});

// =========================================================================
titre("5. DU RÉCIT À LA FICHE : LE NOM, LE PORTRAIT, PUIS LA FICHE");
// =========================================================================
await section(async () => {
  await G(() => window.GRIMOIRE_RECIT && window.GRIMOIRE_RECIT.allerAuRecit && window.GRIMOIRE_RECIT.allerAuRecit());
  await p.waitForTimeout(1200);
  const ok = await G(() => { const pp = document.getElementById("recit-portrait"); if (!pp) return false; pp.dataset.heros = ""; pp.dataset.pnj = "Dame Koré"; pp.click(); return true; });
  verifier("le papier du portrait existe dans le récit", ok);
  verifier("un toucher sur le portrait d'un PNJ : le livre tourne jusqu'à sa fiche", await attendreQue(surLaDoublePage, 8000) && await attendreQue(() => G(() => window.GRIMOIRE_LIENS.vue().centre === "PNJ_KORE"), 4000));
  verifier("…avec « ← Revenir au récit »", !!(await G(() => document.querySelector('#grimoire-liens-g [data-cb="recit"]'))));
  const rc = lire("grimoire_recit.js");
  verifier("le nom touché pose le PNJ sur son papier (dataset.pnj)", /papier\.dataset\.pnj = h \? "" : nom;/.test(rc));
});

// =========================================================================
titre("6. LA DISPOSITION, PURE ET STABLE");
// =========================================================================
await section(async () => {
  const r = await G(() => {
    const L = [{ id: "a", axes: { confiance: 90, respect: 90, attachement: 90, familiarite: 90 } }, { id: "b", axes: { confiance: -90, respect: -90, attachement: -90, familiarite: 10 } }];
    const x = window.GRIMOIRE_LIENS.disposerRadar(L), y = window.GRIMOIRE_LIENS.disposerRadar(L);
    return { x, meme: JSON.stringify(x) === JSON.stringify(y) };
  });
  verifier("un ami tout près, un ennemi au bord ; la même entrée donne la même place", r.x[0].r < 20 && r.x[1].r > 42 && r.meme && r.x[1].pointilles && !r.x[0].pointilles);
  const index = lire("index.html");
  verifier("version 414 ; grimoire_liens.js et .css chargés", Number((lire("version.json").match(/"version": (\d+)/) || [])[1]) >= 414 && /grimoire_liens\.js\?v=\d+/.test(index) && /grimoire_liens\.css\?v=\d+/.test(index));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
