// v443 — LES MISSIONS DE GUILDE (2/3) : LE VOTE, LA MISSION ACCEPTÉE, SON PLAN, SON LIEU, LE NARRATEUR, LES CRÉATURES.
// Nico : « quand un joueur valide le choix d'une mission, c'est en attente des autres : un post-it apparaît sur le livre
// des autres joueurs, avec le lien qui fait apparaître la page de mission par le bas pour qu'ils puissent valider ; s'ils
// refusent, le vote disparaît. Une à la fois. » « Validée : dans la base du groupe, avec les tenants et aboutissants ;
// une IA intelligente crée tout le plan de mission ; sur la map régionale, un point d'interrogation doré, le lieu créé
// comme un POI. » « Les monstres : Rang C −2, B le niveau du groupe, A +2, juste au lieu de la mission. » « C'est le
// narrateur qui valide ou fait échouer la mission. » Sur la vraie page (le décor du banc v424).
// Lancer : node tests_monstres/corrections_v443.mjs
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
const CAPTURES = process.env.V443_CAPTURES || "";
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

// LES FAUSSES IA : MIA_MISSIONS (six missions : la 1re à Kesh, la 2e dans un lieu à créer), MIA_PLAN_MISSION, MIA_SUIVI_MISSION.
const appelsMissions = [], appelsPlan = [], appelsSuivi = [];
let reponsesSuivi = [];
await p.route('**/generativelanguage.googleapis.com/**', r => {
  const corps = JSON.parse(r.request().postData() || "{}");
  const sys = ((corps.systemInstruction || {}).parts || [{}])[0].text || "";
  const repondre = (obj) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });
  if (/MIA_PLAN_MISSION/.test(sys)) { appelsPlan.push({ url: r.request().url(), sys });
    return repondre({ connu_des_joueurs: "On sait peu de choses.", verite_cachee: "Le commanditaire ment : c'est lui le voleur.",
      etapes: [{ numero: 1, titre: "Trouver la lettre", description: "…", validation: "la lettre lue" }, { numero: 2, titre: "Confondre le voleur", description: "…", validation: "le voleur démasqué" }],
      personnages: [{ nom: "Dame Sira", role: "témoin", sait: "l'heure du vol", secret: "elle aime le voleur", attitude: "méfiante" }], lieux: [{ nom: "Le puits", description: "sec", ce_qu_on_y_trouve: "la lettre" }],
      indices: [{ nom: "La lettre", ou: "au fond du puits", revele: "le nom du voleur", necessaire: true }], rencontres: [{ quoi: "trois chacals", ou: "les dunes", danger: "faible" }],
      rebondissements: ["Sira s'enfuit"], a_ne_pas_reveler: ["Le commanditaire est le voleur"], issues: { reussite: "La guilde est payée.", reussite_partielle: "…", echec: "…" } }); }
  if (/MIA_SUIVI_MISSION/.test(sys)) { appelsSuivi.push(sys); return repondre(reponsesSuivi.shift() || { etapes_accomplies: [], indices_trouves: [], statut: "en_cours", resume: "" }); }
  if (!/MIA_MISSIONS/.test(sys)) return r.fallback();
  appelsMissions.push(sys);
  const rangs = (/dans cet ordre de difficultés : ([a-z, ]+)\./.exec(sys) || [, ""])[1].split(", ");   // (v452) normale / difficile
  return repondre(rangs.map((rg, k) => ({ rang: rg, titre: `Mission ${k + 1} (${rg})`, resume: `Résumé ${k + 1}.`, region: 5,
    commanditaire: `Commanditaire ${k + 1}`, details: `Détails ${k + 1}.`, objectif: `Objectif ${k + 1}.`, lettre: `Je vous écris ${k + 1}.`,
    lieu: k === 0 ? { id_existant: "L_KESH", nom: "Kesh", type: "village", description: "Un village de toile." }
        : { id_existant: null, nom: `La grotte ${k + 1}`, type: "grotte", description: "Une grotte humide." } })));
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


const MIS = (f, a) => G(f, a);
const partieDoc = () => G(() => window.__docs["Systeme_Parties/P1"] || {});
const missionDoc = () => G(() => window.__docs["Systeme_Parties/P1/Guilde/Mission"] || null);
const enJoueur = (j) => G((j) => { localStorage.setItem("ID_JOUEUR_COURANT", j); window.__surPartie(window.__docs["Systeme_Parties/P1"]); }, j);
await G(() => {
  window.__surPartie = (d) => { window.PARTIE_DATA = d; try { window.appliquerVoyageDeLaPartie(d); } catch (e) {} try { window.appliquerMissionDeLaPartie(d); } catch (e) { console.log("mission", e.message); } };
  window.__surPartie(window.__docs["Systeme_Parties/P1"]);
});
// (v477) LE CLAN NOMADE (CLAN_NOMADE.md, étape 1) : plus de tableau ni de vote. Le créateur d'une mission
// (genererMission) la donne ; lancerMission en fait la mission en cours.
titre("1. (v477) LE CRÉATEUR D'UNE MISSION : MIA_MISSIONS EN ÉCRIT UNE, SANS TABLEAU");
let m0 = null;
await section(async () => {
  m0 = await G(() => window.MISSIONS_GUILDE.genererMission("normale"));
  verifier("une mission : son titre, sa région, son lieu (Kesh), sa difficulté, plus de décalage caché",
    m0 && /^Mission 1\b/.test(m0.Titre) && m0.Region === 5 && m0.Lieu && m0.Lieu.Id === "L_KESH" && m0.Difficulte === "normale" && !("Decalage" in m0), JSON.stringify(m0 || {}).slice(0, 200));
  const tb = await tableau();
  verifier("…et plus aucun tableau dans la base (Guilde/Tableau)", !tb, JSON.stringify(tb || null).slice(0, 80));
  verifier("…ni vote, ni feuille, ni post-it (le Hall de guilde n'est plus)", await G(() => !window.MISSIONS_GUILDE.voterMission && !window.MISSIONS_GUILDE.ouvrirFeuille && !document.getElementById("postit-mission")));
});

titre("2. (v477) LA MISSION LANCÉE : ELLE EST EN COURS, SANS VOTE");
await section(async () => {
  const ok = await G((m) => window.MISSIONS_GUILDE.lancerMission(m), m0);
  await G(() => window.__surPartie(window.__docs["Systeme_Parties/P1"])); await p.waitForTimeout(500);
  const pd = await partieDoc(), md = await missionDoc();
  verifier("lancée : la mission en cours de la partie (Mission_En_Cours), son lieu", ok === true && pd.Mission_En_Cours && pd.Mission_En_Cours.Id === m0.Id && pd.Mission_En_Cours.Lieu_Id === "L_KESH" && !("Decalage" in pd.Mission_En_Cours), JSON.stringify(pd.Mission_En_Cours));
  verifier("…sa fiche dans la base du groupe (Guilde/Mission) : la mission, en cours, ses joueurs, ses héros, la place de son lieu",
           md && md.Mission.Id === m0.Id && md.Statut === "en_cours" && md.Votants.length === 2 && md.Heros.includes("H1") && md.Lieu_Id === "L_KESH" && md.Lieu_Position.Region === 5 && md.Lieu_Position.x === 0.3, JSON.stringify(md && { ...md, Mission: undefined, Plan: !!md.Plan }).slice(0, 260));
});

titre("3. (v477) UNE SEULE MISSION À LA FOIS");
await section(async () => {
  const autre = { ...m0, Id: "M_AUTRE", Titre: "Une autre" };
  const ok = await G((m) => window.MISSIONS_GUILDE.lancerMission(m), autre);
  const pd = await partieDoc();
  verifier("une seconde mission ne se lance pas tant que la première est en cours", ok === false && pd.Mission_En_Cours.Id === m0.Id, JSON.stringify([ok, pd.Mission_En_Cours && pd.Mission_En_Cours.Id]));
});

titre("4. LE PLAN (MIA_PLAN_MISSION, LE MODÈLE DU NARRATEUR) ; LE « ? » DORÉ SUR LA CARTE");
await section(async () => {
  verifier("le plan est préparé et rangé dans la fiche", await attendreQue(async () => { const md = await missionDoc(); return md && md.Plan && md.Plan.etapes && md.Plan.etapes.length === 2; }, 10000));
  const ap = appelsPlan[0] || {}, modele = await G(() => window.reglagesNarrateur().modele);
  verifier("…par le modèle du Narrateur, avec la mission, son lieu, son commanditaire", new RegExp(modele.replace(/\./g, "\\.")).test(ap.url || "") && /Mission 1/.test(ap.sys) && /Kesh/.test(ap.sys) && /Commanditaire 1/.test(ap.sys), (ap.url || "").slice(60, 140));
  verifier("…ses parties : ce que savent les joueurs, la vérité cachée, étapes, personnages, indices, rencontres, ce qu'il ne faut pas révéler, les issues",
           /connu_des_joueurs/.test(ap.sys) && /verite_cachee/.test(ap.sys) && /a_ne_pas_reveler/.test(ap.sys) && /issues/.test(ap.sys) && /rencontres/.test(ap.sys));
  await G(() => window.GRIMOIRE_REGIONS.ouvrir(5));
  await attendreQue(() => G(() => window.GRIMOIRE_REGIONS.montee() === 5 && window.carteRegionaleOuverte() === 5), 15000); await pose(); await p.waitForTimeout(800);
  const mq = await G(() => { const el = [...document.querySelectorAll(".marque-mission-carte")].find(e => e.getBoundingClientRect().width > 0); const k = [...document.querySelectorAll('.village-region[data-id="L_KESH"]')].find(e => e.getBoundingClientRect().width > 0);
    if (!el || !k) return null; const a = el.getBoundingClientRect(), b = k.getBoundingClientRect(); return { dx: Math.abs((a.left + a.width / 2) - (b.left + b.width / 2)), dy: Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)), w: a.width, svg: !!el.querySelector("svg text") }; });
  verifier("sur la carte de la région 5 : un « ? » doré posé sur Kesh, le lieu de la mission", mq && mq.dx < 2 && mq.dy < 2 && mq.w > 5 && mq.svg, JSON.stringify(mq));
  // (v450) « Dans le même style que le point d'exclamation des POI, et ne le fais pas bouger. »
  const st = await G(() => { const el = [...document.querySelectorAll(".marque-mission-carte")].find(e => e.getBoundingClientRect().width > 0), t = el && el.querySelector("text");
    return el && { anim: getComputedStyle(el).animationName, rond: !!el.querySelector("circle"), degrade: !!el.querySelector("linearGradient stop[stop-color='#f7d35a']"), police: t && getComputedStyle(t).fontFamily, signe: t && t.textContent }; });
  verifier("(v450) …le style du « ! » des POI (le signe seul, Cinzel, l'or en dégradé), et il ne bouge pas", st && st.anim === "none" && !st.rond && st.degrade && /Cinzel/.test(st.police) && st.signe === "?", JSON.stringify(st));
  await cap("v443-carte");
});

titre("5. LE NARRATEUR : UN RAPPEL PARTOUT ; AU LIEU DE LA MISSION, LE PLAN ET SES SECRETS");
await section(async () => {
  const ailleurs = await G(() => window.contexteMissionMJ({}, "L_AILLEURS")), ici = await G(() => window.contexteMissionMJ({}, "L_KESH"));
  verifier("ailleurs : la mission, son objectif, son lieu, l'étape en cours — sans le plan", /MISSION DE GUILDE EN COURS/.test(ailleurs) && /Objectif 1\./.test(ailleurs) && /Kesh/.test(ailleurs) && /Étape en cours : 1\. Trouver la lettre/.test(ailleurs) && !/vérité cachée/i.test(ailleurs), ailleurs.slice(0, 200));
  verifier("au lieu de la mission : le plan pour lui seul, ce qu'il ne doit jamais révéler", /LE PLAN DE LA MISSION \(POUR TOI SEUL, MJ\)/.test(ici) && /À NE JAMAIS RÉVÉLER DIRECTEMENT :\n\s+- Le commanditaire est le voleur/.test(ici) && /Dame Sira/.test(ici), ici.slice(0, 160));
  // (v451) « Le narrateur fait avancer trop vite la mission : le traître, on le sait en deux tours. » Le plan se donne
  // petit à petit : l'étape en cours seule, ni la vérité cachée ni les secrets des personnages avant la dernière étape.
  const min = await G(() => window.MISSIONS_GUILDE.TOURS_MIN_ETAPE[window.__docs["Systeme_Parties/P1"].Mission_En_Cours.Difficulte]);
  verifier("(v451) à la 1re étape : elle seule (la suivante cachée), ni la vérité cachée, ni le secret de Dame Sira", /L'étape à jouer maintenant : 1\. Trouver la lettre/.test(ici) && !/Confondre le voleur/.test(ici) && /Encore 1 étape après celle-ci/.test(ici)
           && !/Le commanditaire ment/.test(ici) && !/elle aime le voleur/.test(ici) && /ne désigne aucun coupable, aucun traître/.test(ici), ici.slice(0, 400));
  verifier(`(v451) …le rythme : au moins ${min} passages par étape (selon la difficulté), un indice au plus par passage, une révélation à la fois`, new RegExp(`au moins ${min} de tes passages \\(celle-ci en est à 0\\)`).test(ici) && /un au plus par passage/.test(ici) && /Une révélation à la fois/.test(ici), ici.split("LE RYTHME")[1]);
  const ia = lire("ia_master.js");
  verifier("le Narrateur le lit avant chaque tour, et MIA_SUIVI_MISSION suit après", /window\.contexteMissionMJ\(dataPartieMJ, lieuActuel\)/.test(ia) && /window\.MISSIONS_GUILDE\.suivreApresMJ\(reponseTexte, idMessage\)/.test(ia));
});

titre("6. (v477) LES CRÉATURES : LE NIVEAU DU GROUPE, PARTOUT (PLUS DE DÉCALAGE AU LIEU DE LA MISSION)");
await section(async () => {
  const r = await G(async () => {
    window.NIVEAU_GROUPE = 5;
    const ailleurs = window.niveauDesCreatures();
    window.__docs["Systeme_Parties/P1"].Lieu_Actuel = "L_KESH"; window.__surPartie(window.__docs["Systeme_Parties/P1"]);
    const ici = { n: window.niveauDesCreatures(), t: window.tricheActuelle().pv, attendu: window.tricheDeNiveau(5).pv };
    window.__docs["Systeme_Parties/P1"].Lieu_Actuel = ""; window.__surPartie(window.__docs["Systeme_Parties/P1"]);
    return { ailleurs, ici, decalage: typeof window.decalageNiveauMission }; });
  verifier("ailleurs comme au lieu de la mission : le niveau du groupe (5), la triche des créatures le suit", r.ailleurs === 5 && r.ici.n === 5 && r.ici.t === r.ici.attendu && r.decalage === "undefined", JSON.stringify(r));
});

titre("7. LE SUIVI : LES ÉTAPES, LES INDICES ; LE NARRATEUR DIT QUE C'EST RÉUSSI : LA MISSION S'ACHÈVE");
await section(async () => {
  // (v451) Le rythme : une étape au plus par tour, jamais avant son nombre de tours minimum ((v452) normale 3, difficile 4).
  const min = await G(() => window.MISSIONS_GUILDE.TOURS_MIN_ETAPE[window.__docs["Systeme_Parties/P1"].Mission_En_Cours.Difficulte]);
  const tot = Array.from({ length: min - 1 }, () => ({ etapes_accomplies: [1, 2], indices_trouves: [], statut: "reussie", resume: "Tout va trop vite." }));
  reponsesSuivi = [...tot, { etapes_accomplies: [1, 9], indices_trouves: ["La lettre du voleur"], statut: "en_cours", resume: "La lettre est trouvée." }];
  for (let k = 0; k < min - 1; k++) await G(() => window.MISSIONS_GUILDE.suivreApresMJ("Tout se dénoue d'un coup."));
  let md = await missionDoc();
  verifier(`(v451) avant ${min} tours, rien n'avance (ni étape, ni « réussie » sans toutes les étapes)`, md && !md.Avancement.Etapes["1"] && !md.Avancement.Etapes["2"] && md.Avancement.Tours_Etape === min - 1, JSON.stringify(md && md.Avancement).slice(0, 200));
  await G(() => window.MISSIONS_GUILDE.suivreApresMJ("Les héros trouvent la lettre au fond du puits."));
  md = await missionDoc();
  verifier("une étape accomplie (l'étape inconnue ignorée), le journal ; (v452) plus d'indices relevés", md.Avancement.Etapes["1"] === true && !md.Avancement.Etapes["9"] && !md.Avancement.Indices && !/indices_trouves/.test(appelsSuivi[appelsSuivi.length - 1]) && md.Avancement.Journal.some(j => /La lettre est trouvée/.test(j.Texte)) && md.Avancement.Tours_Etape === 0, JSON.stringify(md.Avancement));
  verifier("MIA_SUIVI_MISSION lit l'objectif et les étapes", /Objectif 1\./.test(appelsSuivi[0]) && /1\. Trouver la lettre/.test(appelsSuivi[0]));
  // (v451) La dernière étape : la vérité cachée et les secrets des personnages viennent au Narrateur.
  const fin2 = await G(() => window.contexteMissionMJ({}, "L_KESH"));
  verifier("(v451) à la dernière étape : la vérité cachée et les secrets lui sont donnés", /L'étape à jouer maintenant : 2\. Confondre le voleur/.test(fin2) && /C'est la dernière étape/.test(fin2) && /Le commanditaire ment/.test(fin2) && /elle aime le voleur/.test(fin2), fin2.slice(0, 300));
  reponsesSuivi = [...Array.from({ length: min - 1 }, () => ({ etapes_accomplies: [], indices_trouves: [], statut: "en_cours", resume: "" })), { etapes_accomplies: [2], indices_trouves: [], statut: "reussie", resume: "Le voleur est démasqué." }];
  for (let k = 0; k < min - 1; k++) await G(() => window.MISSIONS_GUILDE.suivreApresMJ("On cherche encore."));
  await G(() => window.MISSIONS_GUILDE.suivreApresMJ("Le voleur est démasqué devant tout le village."));
  await G(() => window.__surPartie(window.__docs["Systeme_Parties/P1"]));
  const fin = await G((id) => window.__docs["Systeme_Parties/P1/Missions_Terminees/" + id] || null, m0.Id), pd = await partieDoc();
  verifier("réussie : rangée avec les missions terminées (statut, héros, fin), plus de mission en cours", fin && fin.Statut === "reussie" && fin.Heros.includes("H1") && fin.Fin_Le && !(await missionDoc()) && !pd.Mission_En_Cours, JSON.stringify(fin && { Statut: fin.Statut, Heros: fin.Heros }));
  verifier("…plus de « ? » sur la carte (ni sur ses pages du livre)", await attendreQue(() => G(() => ![...document.querySelectorAll(".marque-mission-carte")].some(e => e.getBoundingClientRect().width > 0)), 3000),
           await G(() => [...document.querySelectorAll(".marque-mission-carte")].map(e => e.parentNode.parentNode && (e.parentNode.parentNode.id || e.parentNode.parentNode.className)).join(" | ")));
});

titre("8. UNE MISSION DANS UN LIEU À CRÉER : LE LIEU NAÎT COMME UN POI, À SON NOM");
await section(async () => {
  const m1 = (await G(() => window.MISSIONS_GUILDE.genererMissions(["normale", "normale"])))[1];
  await G(() => { window.__creations = []; window.peutCreerPoi = () => true;
    window.creerLieuPoi = async (o) => { window.__creations.push(o); return { id: "L_NEUF_GROTTE", nom: o.impose.nom }; }; });
  await G((m) => window.MISSIONS_GUILDE.lancerMission(m), m1);
  await G(() => window.__surPartie(window.__docs["Systeme_Parties/P1"]));
  verifier("le lieu est créé (creerLieuPoi), à son nom, dans sa région, pour cette mission", await attendreQue(async () => { const md = await missionDoc(); return md && md.Lieu_Id === "L_NEUF_GROTTE"; }, 10000));
  const c = (await G(() => window.__creations))[0] || {}, md = await missionDoc(), pd = await partieDoc();
  verifier("…le nom et la description de la mission imposés, la place choisie dans la région", c.impose && c.impose.nom === "La grotte 2" && /humide/.test(c.impose.description) && c.region === 5 && c.x > 0 && c.x < 1 && c.impose.missionId === m1.Id, JSON.stringify(c).slice(0, 200));
  verifier("…la partie le sait (Mission_En_Cours.Lieu_Id)", pd.Mission_En_Cours && pd.Mission_En_Cours.Lieu_Id === "L_NEUF_GROTTE", JSON.stringify(pd.Mission_En_Cours));
  const poi = lire("poi_creation.js");
  verifier("MIA_POI reçoit le lieu de la mission (son nom gardé tel quel)", /CE LIEU EST CELUI D'UNE MISSION \(v443\)/.test(poi) && /if \(o\.impose && o\.impose\.nom\) lieu\.nom = String\(o\.impose\.nom\)\.trim\(\);/.test(poi));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
