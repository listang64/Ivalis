// v422 — LA DISCUSSION PRIVÉE (discussion_privee.js), depuis la page du Groupe.
// (Le décor : celui du banc v418_livre.)
//
// Nico : « sur la page du groupe, une petite tête qui parle dans l'encart des PNJ
// qui nous suivent (pas le familier du Pisteur) : une interface privée entre le
// joueur et le PNJ. Fond noir à 70 %, à droite en grand l'avatar du PNJ, à
// gauche celui du joueur ; l'encart de celui qui parle (coins arrondis, noir à
// 80 %) part de son avatar et s'arrête avant l'autre. On commence par « Oui ? ».
// Le joueur parle sans retouche ; le PNJ parle, avec seulement des gestes entre
// astérisques. Un ping-pong qui fait évoluer la relation (des deux côtés), les
// choses importantes dans ses souvenirs. Un bouton pour quitter ; le PNJ peut
// partir de lui-même. » — « la phrase du PNJ se met en plus petit en bas de
// l'écran » ; privé ; pas pendant un combat ; chaque discussion repart de « Oui ? ».
// Sur la VRAIE page. Captures : V422_CAPTURES=dossier.
// Lancer : node tests_monstres/corrections_v422.mjs
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
const CAPTURES = process.env.V422_CAPTURES || "";
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
const paroles = [];          // les répliques que l'IA du PNJ rendra, dans l'ordre
let panneParole = false;
await p.route('**/generativelanguage.googleapis.com/**', r => {
  const corps = JSON.parse(r.request().postData() || "{}");
  const sys = ((corps.systemInstruction || {}).parts || [{}])[0].text || "", txt = (((corps.contents || [])[0] || {}).parts || [{}])[0].text || "";
  const cle = new URL(r.request().url()).searchParams.get("key");
  appelsIA.push({ url: r.request().url(), sys, txt, cle, config: corps.generationConfig || {} });
  const ok = (body) => r.fulfill({ status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: JSON.stringify(body) });
  if (/te parle EN PRIVÉ/.test(sys)) {
    if (panneParole) return r.fulfill({ status: 500, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: '{"error":{"message":"panne"}}' });
    const rep = paroles.shift() || { replique: "Hm.", partir: false };
    return ok({ candidates: [{ content: { parts: [{ text: "réflexion", thought: true }, { text: JSON.stringify(rep) }] } }], usageMetadata: { totalTokenCount: 90 } });
  }
  if (/Tu es MIA_SOCIAL/.test(sys)) {
    const args = /ami précieux/.test(txt)
      ? { evenements: [{ type: "complimenter", acteur: "Thorin", cible: "Doros", gravite: 1, discret: true, resume: "Thorin a dit à Doros qu'il était un ami précieux.", extrait: "Tu es un ami précieux" },
                       { type: "confier_secret", acteur: "Doros", cible: "Thorin", gravite: 2, discret: true, resume: "Doros a avoué à Thorin qu'il vole la recette.", extrait: "je vole la recette" }],
          souvenirs: [{ nom: "Doros", texte: "J'ai avoué à Thorin que je vole la recette ; il n'a rien dit.", a_propos_de: ["Thorin"], importance: 2 }] }
      : { evenements: [] };
    return ok({ candidates: [{ content: { parts: [{ functionCall: { name: "noterScene", args } }] } }], usageMetadata: { totalTokenCount: 60 } });
  }
  let rep = "Je vois Thorin lever sa chope bien haut.";
  if (/donnes leur titre aux chapitres/.test(sys)) rep = "La tournée du nain";
  ok({ candidates: [{ content: { parts: [{ text: rep }] } }], usageMetadata: { totalTokenCount: 120 } });
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


// Doros est d'humeur égale, cette fois ; un bout de récit ; le portrait de Thorin servi sur place.
// Des portraits en pied (fond transparent) pour juger la fenêtre : Thorin en brun, Doros en bleu.
const portrait = async (teinte) => { const pg = await b.newPage(); const u = await pg.evaluate((teinte) => { const c = document.createElement("canvas"); c.width = 600; c.height = 900; const x = c.getContext("2d");
  x.fillStyle = teinte; x.beginPath(); x.arc(300, 230, 120, 0, 7); x.fill(); x.beginPath(); x.moveTo(90, 900); x.quadraticCurveTo(110, 400, 300, 380); x.quadraticCurveTo(490, 400, 510, 900); x.fill();
  return c.toDataURL("image/png"); }, teinte); await pg.close(); return Buffer.from(u.split(",")[1], "base64"); };
const PORTRAIT_THORIN = await portrait("#8a5a32"), PORTRAIT_DOROS = await portrait("#3c5a7a");
await p.unroute(/PNJ\/doros\.png/);
await p.route(/PNJ\/doros\.png/, r => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: PORTRAIT_DOROS }));
await p.route(/portrait-thorin\.png/, r => r.fulfill({ status: 200, contentType: 'image/png', body: PORTRAIT_THORIN }));
await G(() => {
  const d = window.__docs;
  d["Systeme_Parties/P1/Ames/PNJ_DOROS"].humeur = null;
  d["Messages_Chat/r1"] = { ID_Partie: "P1", Timestamp: 1, Auteur_Nom: "Le Narrateur", Texte: "<p>La pluie bat les quais de Mégara ; la compagnie s'abrite sous l'auvent du vieux Phokas.</p>" };
  d["Messages_Chat/r2"] = { ID_Partie: "P1", Timestamp: 2, Auteur_Nom: "Thorin", Texte: "Je secoue ma barbe trempée." };
});
const docsDe = (pre) => G((pre) => Object.entries(window.__docs).filter(([k]) => k.startsWith(pre)).map(([k, v]) => ({ k, ...v })), pre);
const ouverte = () => G(() => !!document.getElementById("discussion-privee"));
const rect = (sel) => G((sel) => { const el = document.querySelector(sel); if (!el || el.hidden) return null; const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; }, sel);
const style = (sel, prop) => G(([sel, prop]) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : ""; }, [sel, prop]);
const tour = () => G(() => (document.getElementById("discussion-privee") || { dataset: {} }).dataset.tour || "");
const appelsParole = () => appelsIA.filter(a => /te parle EN PRIVÉ/.test(a.sys));
const appelsSocial = () => appelsIA.filter(a => /Tu es MIA_SOCIAL/.test(a.sys));
const dire = async (t) => { await p.fill(".saisie-dp", t); await p.press(".saisie-dp", "Enter"); };

// =========================================================================
titre("1. LA TÊTE QUI PARLE, SUR LA CARTE DES SUIVEURS");
// =========================================================================
await section(async () => {
  await G(() => window.GRIMOIRE_GROUPE.ouvrir());
  await attendreQue(surGroupe, 8000); await pose();
  await attendreQue(() => G(() => !!document.querySelector('#grimoire-groupe-d .parler-groupe')), 6000);
  const t = await G(() => [...document.querySelectorAll("#grimoire-groupe-d .suiveur-groupe")].map(li => [li.querySelector(".nom-groupe").textContent.trim(), !!li.querySelector(".parler-groupe")]));
  verifier("Doros (il nous suit) a sa tête qui parle ; Croc-Gris (le loup de Lyra) n'en a pas", JSON.stringify(t) === '[["Doros",true],["Croc-Gris",false]]', JSON.stringify(t));
  verifier("…ni Dame Koré (laissée en arrière)", await G(() => document.querySelectorAll(".parler-groupe").length === 1));
  verifier("…une tête dessinée (une silhouette et ses ondes), dans le coin de la carte", await G(() => { const b = document.querySelector(".parler-groupe"), c = b.closest(".suiveur-groupe").querySelector(".carte-suiveur").getBoundingClientRect(), r = b.getBoundingClientRect();
    return !!b.querySelector("svg .tete") && !!b.querySelector("svg .onde") && r.right <= c.right + 1 && r.top >= c.top - 1 && r.top < c.top + c.height / 2 && r.width > 10; }));
  await cap("v422-icone");
});

// =========================================================================
titre("2. LA FENÊTRE : « OUI ? »");
// =========================================================================
await section(async () => {
  await cliquer('#grimoire-groupe-d .parler-groupe[data-id="PNJ_DOROS"]');
  verifier("un toucher : la discussion s'ouvre", await attendreQue(ouverte, 3000));
  verifier("…un fond noir à 70 %, sur tout l'écran", await style("#discussion-privee", "backgroundColor") === "rgba(0, 0, 0, 0.7)" && await G(() => { const r = document.getElementById("discussion-privee").getBoundingClientRect(); return r.width === innerWidth && r.height === innerHeight; }));
  const pj = await rect(".avatar-dp.pj"), pnj = await rect(".avatar-dp.pnj");
  verifier("…à gauche en grand Thorin (son portrait), à droite Doros (le sien)", await G(() => /portrait-thorin/.test(document.querySelector(".avatar-dp.pj").src) && /doros\.png/.test(document.querySelector(".avatar-dp.pnj").src))
    && pj.l < 100 && pnj.r > 1094 && pj.h > 500 && pnj.h > 500, JSON.stringify([pj, pnj]));
  verifier("…« Oui ? » dans l'encart de Doros (son nom en tête)", (await texte(".encart-dp.pnj .texte-dp")) === "Oui ?" && (await texte(".encart-dp.pnj .nom-dp")) === "Doros" && await tour() === "pnj");
  const e = await rect(".encart-dp.pnj");
  verifier("…l'encart de Doros : sur son avatar, il s'arrête avant celui de Thorin", e.r > pnj.l + 50 && e.l > pj.r && e.l - pj.r < 60, JSON.stringify(e));
  verifier("…noir à 80 %, aux coins arrondis", await style(".encart-dp.pnj", "backgroundColor") === "rgba(0, 0, 0, 0.8)" && parseFloat(await style(".encart-dp.pnj", "borderTopLeftRadius")) >= 12);
  verifier("…pas encore d'encart pour Thorin, un bouton pour quitter", !(await rect(".encart-dp.pj")) && await visible(".quitter-dp"));
  verifier("aucune IA n'a encore parlé (« Oui ? » est écrit d'avance)", appelsParole().length === 0);
  await cap("v422-oui");
});

// =========================================================================
titre("3. AU JOUEUR : LA PHRASE DU PNJ EN PETIT, EN BAS ; SON ENCART À LUI");
// =========================================================================
await section(async () => {
  verifier("la phrase lue, c'est au joueur", await attendreQue(async () => (await tour()) === "pj", 4000));
  const r = await rect(".rappel-dp"), pj = await rect(".avatar-dp.pj"), pnj = await rect(".avatar-dp.pnj"), e = await rect(".encart-dp.pj");
  verifier("…« Oui ? » de Doros, en petit, en bas de l'écran", /Doros Oui \?/.test(await texte(".rappel-dp")) && r.b > 834 - 60 && parseFloat(await style(".rappel-dp", "fontSize")) < parseFloat(await style(".encart-dp.pj", "fontSize")), JSON.stringify(r));
  verifier("…l'encart de Doros a disparu", !(await rect(".encart-dp.pnj")));
  verifier("…l'encart de Thorin : sur son avatar, il s'arrête avant celui de Doros", e && e.l < pj.r - 50 && e.r < pnj.l && pnj.l - e.r < 60, JSON.stringify(e));
  verifier("…noir à 80 %, coins arrondis, une zone pour écrire", await style(".encart-dp.pj", "backgroundColor") === "rgba(0, 0, 0, 0.8)" && parseFloat(await style(".encart-dp.pj", "borderTopLeftRadius")) >= 12 && await visible(".saisie-dp"));
  verifier("…son nom en tête de son encart ; rien ne chevauche la phrase de Doros en bas", (await texte(".encart-dp.pj .nom-dp")) === "Thorin" && await G(() => { const r = document.querySelector(".rappel-dp").getBoundingClientRect();
    return [...document.querySelectorAll("#discussion-privee .nom-dp, #discussion-privee .encart-dp")].every(e => { const q = e.getBoundingClientRect(); return !q.width || q.bottom <= r.top || q.top >= r.bottom; }); }));
  await cap("v422-a-toi");
});

// =========================================================================
titre("4. LE PING-PONG : LA PHRASE DU JOUEUR TELLE QUELLE ; DOROS RÉPOND, AVEC SES GESTES");
// =========================================================================
await section(async () => {
  paroles.push({ replique: "« Doros : *rigole* Un ami ? Tu vas vite en besogne, nain. »", partir: false });
  const avant = appelsIA.length;
  await dire("Merci de nous suivre, Doros. Tu es un ami précieux.");
  verifier("Entrée : Doros réfléchit (…)", await attendreQue(async () => (await tour()) === "attente" || appelsParole().length > 0, 2000));
  verifier("Doros répond, ses gestes en italique (sans son nom ni guillemets)", await attendreQue(async () => (await tour()) === "pnj", 4000)
    && (await texte(".encart-dp.pnj .texte-dp")) === "rigole Un ami ? Tu vas vite en besogne, nain." && await G(() => document.querySelector(".encart-dp.pnj em.geste-dp").textContent === "rigole"), await texte(".encart-dp.pnj"));
  const a = appelsParole()[0] || { sys: "", txt: "", url: "", config: {} };
  verifier("une seule IA a parlé : celle de Doros (pas de retouche de la phrase du joueur)", appelsIA.length - avant === 1);
  verifier("…le modèle du Narrateur, réflexion basse, en JSON", /gemini-3\.8-flash/.test(a.url) && a.config.thinkingConfig && a.config.thinkingConfig.thinkingLevel === "low" && a.config.responseMimeType === "application/json");
  verifier("…elle a la phrase du joueur, mot pour mot, après « Oui ? »", /Doros : Oui \?\nThorin : Merci de nous suivre, Doros\. Tu es un ami précieux\./.test(a.txt), a.txt.slice(0, 200));
  verifier("…l'âme de Doros : son caractère, sa faille, son masque, sa façon de parler", /TON CARACTÈRE : .*orgueil/i.test(a.sys) && /Ta faille : Il ne pardonne pas/.test(a.sys) && /Ton masque devant les autres : Bourru/.test(a.sys) && /TA FAÇON DE PARLER : Rauque/.test(a.sys), a.sys.slice(0, 600));
  verifier("…ce qu'il pense de Thorin (son lien), son secret, ses souvenirs", /CE QUE TU PENSES DE THORIN : /.test(a.sys) && /TON SECRET .*Il vole la recette/.test(a.sys) && /Thorin m'a humilié au marché/.test(a.sys));
  verifier("…la fin du récit (la pluie sur les quais de Mégara)", /La pluie bat les quais de Mégara/.test(a.sys) && /Thorin : Je secoue ma barbe trempée/.test(a.sys));
  verifier("…les consignes : parler seulement, des gestes entre astérisques, partir s'il veut", /Aucune narration/.test(a.sys) && /\*rigole\*/.test(a.sys) && /METTRE FIN à la discussion/.test(a.sys));
  const dd = await docsDe("Systeme_Parties/P1/Discussions/");
  verifier("la discussion est en base, au fil de l'eau (3 répliques, pas encore lue)", dd.length === 1 && dd[0].lignes.length === 3 && dd[0].analysee === false && dd[0].joueur === "J1" && dd[0].idHeros === "H1", JSON.stringify(dd.map(x => [x.lignes && x.lignes.length, x.analysee])));
  // Le joueur n'attend pas la fin de la lecture : un toucher sur l'encart.
  await cliquer(".encart-dp.pnj");
  verifier("un toucher sur l'encart de Doros : au joueur tout de suite (la phrase en bas)", (await tour()) === "pj" && /Tu vas vite en besogne/.test(await texte(".rappel-dp")));
  await cap("v422-reponse");
});

// =========================================================================
titre("5. DOROS S'EN VA DE LUI-MÊME ; MIA_SOCIAL LIT LA DISCUSSION");
// =========================================================================
await section(async () => {
  const liensAvant = { pnj: await lien("PNJ_DOROS", "H1"), pj: await lien("H1", "PNJ_DOROS") };
  paroles.push({ replique: "*détourne les yeux* Bon. Je vole la recette du vieux Phokas, voilà. *se lève* Assez parlé pour ce soir.", partir: true });
  await dire("Tu peux tout me dire, tu sais.");
  verifier("sa dernière phrase s'affiche…", await attendreQue(async () => /Assez parlé pour ce soir/.test(await texte(".encart-dp.pnj")), 4000) && await tour() === "parti");
  verifier("…le joueur ne peut plus répondre", !(await rect(".encart-dp.pj")));
  verifier("…puis la fenêtre se ferme toute seule", await attendreQue(async () => !(await ouverte()), 12000));
  verifier("MIA_SOCIAL lit toute la discussion, une fois", await attendreQue(() => appelsSocial().length === 1, 4000), String(appelsSocial().length));
  const s = appelsSocial()[0] || { txt: "" };
  verifier("…en privé, sans témoin, le dialogue entier", /EN PRIVÉ entre Thorin et Doros, sans aucun témoin/.test(s.txt) && /Thorin : Tu peux tout me dire, tu sais\.\nDoros : \*détourne les yeux\*/.test(s.txt), s.txt.slice(0, 300));
  verifier("…les présents : Thorin et Doros, personne d'autre", await G(() => true) && /Les présents \(noms exacts\) : Doros \(PNJ\), Thorin \(héros\)\./.test(s.sys) || /Les présents \(noms exacts\) : Thorin \(héros\), Doros \(PNJ\)\./.test(s.sys), (s.sys.match(/Les présents[^\n]*/) || [""])[0]);
  await attendreQue(async () => (await docsDe("Systeme_Parties/P1/Discussions/"))[0].analysee === true, 4000);
  const apres = { pnj: await lien("PNJ_DOROS", "H1"), pj: await lien("H1", "PNJ_DOROS") };
  verifier("le lien de Doros envers Thorin change (le compliment)", apres.pnj.axes.attachement > liensAvant.pnj.axes.attachement, `${liensAvant.pnj.axes.attachement} → ${apres.pnj.axes.attachement}`);
  verifier("…et celui de Thorin envers Doros aussi (le secret confié)", apres.pj.axes.confiance > liensAvant.pj.axes.confiance, `${liensAvant.pj.axes.confiance} → ${apres.pj.axes.confiance}`);
  const sv = await docsDe("Systeme_Parties/P1/Souvenirs/");
  verifier("le secret avoué entre dans les souvenirs de Doros", sv.some(x => x.ame === "PNJ_DOROS" && /je vole la recette/.test(x.texte)), JSON.stringify(sv.map(x => x.texte)));
  const dd = (await docsDe("Systeme_Parties/P1/Discussions/"))[0];
  verifier("la discussion est marquée lue (5 répliques, finie par Doros)", dd.analysee === true && dd.lignes.length === 5 && dd.fin === "pnj", JSON.stringify([dd.analysee, dd.lignes.length, dd.fin]));
  verifier("rien dans le récit (aucun message écrit)", await G(() => !(window.__ajouts || []).some(a => a.col === "Messages_Chat") && !(window.__journal || []).some(j => /^Messages_Chat\//.test(j.chemin))));
});

// =========================================================================
titre("6. UNE NOUVELLE DISCUSSION REPART DE « OUI ? » ; LE BOUTON QUITTER");
// =========================================================================
await section(async () => {
  await G(() => window.GRIMOIRE_GROUPE.ouvrir()); await attendreQue(surGroupe, 6000); await pose();
  await cliquer('#grimoire-groupe-d .parler-groupe[data-id="PNJ_DOROS"]');
  verifier("rouverte : « Oui ? », rien de la précédente", await attendreQue(ouverte, 3000) && (await texte(".encart-dp.pnj .texte-dp")) === "Oui ?" && await G(() => window.DISCUSSION.etat().lignes.length === 1));
  const social = appelsSocial().length;
  await cliquer(".quitter-dp");
  verifier("« Quitter » sans avoir rien dit : la fenêtre se ferme, MIA_SOCIAL n'est pas dérangée", !(await ouverte()) && (await p.waitForTimeout(500), appelsSocial().length === social));
  await cliquer('#grimoire-groupe-d .parler-groupe[data-id="PNJ_DOROS"]');
  await attendreQue(ouverte, 3000);
  await cliquer(".encart-dp.pnj");
  paroles.push({ replique: "*hausse les épaules* Comme tu veux.", partir: false });
  await dire("Bonne nuit, Doros.");
  await attendreQue(async () => /Comme tu veux/.test(await texte(".encart-dp.pnj")), 4000);
  await cliquer(".quitter-dp");
  verifier("« Quitter » après un échange : fermée, et MIA_SOCIAL lit la discussion", !(await ouverte()) && await attendreQue(() => appelsSocial().length === social + 1, 4000));
});

// =========================================================================
titre("7. PAS EN PLEIN COMBAT ; UNE RÉPONSE QUI NE VIENT PAS ; UNE DISCUSSION INTERROMPUE");
// =========================================================================
await section(async () => {
  const alertes = [];
  await G(() => { window.__alertes = []; window.alert = (t) => window.__alertes.push(t); window.combatRPActif = () => true; });
  await cliquer('#grimoire-groupe-d .parler-groupe[data-id="PNJ_DOROS"]');
  await p.waitForTimeout(300);
  verifier("en plein combat : pas de discussion, un mot pour le dire", !(await ouverte()) && await G(() => /combat/.test(window.__alertes.join(" "))));
  await G(() => { window.combatRPActif = () => false; });
  // Une discussion d'hier, interrompue (la page fermée) : lue à la prochaine ouverture.
  await G(() => { window.__docs["Systeme_Parties/P1/Discussions/ancienne"] = { idPnj: "PNJ_DOROS", nomPnj: "Doros", idHeros: "H1", nomHeros: "Thorin", joueur: "J1", analysee: false,
    lignes: [{ qui: "pnj", texte: "Oui ?" }, { qui: "pj", texte: "Tu es un ami précieux." }, { qui: "pnj", texte: "Merci." }] }; });
  const social = appelsSocial().length;
  await cliquer('#grimoire-groupe-d .parler-groupe[data-id="PNJ_DOROS"]');
  verifier("une discussion restée sans lecture est lue à la prochaine ouverture", await attendreQue(() => appelsSocial().length === social + 1, 4000)
    && await attendreQue(() => G(() => window.__docs["Systeme_Parties/P1/Discussions/ancienne"].analysee === true), 3000));
  await cliquer(".encart-dp.pnj");
  panneParole = true;
  await dire("Tu m'entends ?");
  verifier("une réponse qui ne vient pas : la phrase revient dans l'encart du joueur, un mot l'explique", await attendreQue(async () => (await tour()) === "pj" && (await p.inputValue(".saisie-dp")) === "Tu m'entends ?", 4000)
    && /ne semble pas t'avoir entendu/.test(await texte(".rappel-dp")) && await G(() => window.DISCUSSION.etat().lignes.length === 1));
  panneParole = false;
  await cliquer(".quitter-dp");
});

// =========================================================================
titre("8. SUR UN TÉLÉPHONE EN HAUTEUR");
// =========================================================================
await section(async () => {
  await p.setViewportSize({ width: 390, height: 844 });
  await cliquer('#grimoire-groupe-d .parler-groupe[data-id="PNJ_DOROS"]');
  await attendreQue(ouverte, 3000);
  const e = await rect(".encart-dp.pnj"), q = await rect(".quitter-dp");
  verifier("l'encart tient dans l'écran, le bouton Quitter aussi", e.l >= 0 && e.r <= 390 && q.r <= 390 && q.l >= 0, JSON.stringify([e, q]));
  verifier("une seule fenêtre, un seul encart (celui de Doros)", await G(() => document.querySelectorAll(".discussion-privee").length === 1 && [...document.querySelectorAll(".encart-dp")].filter(e => !e.hidden).map(e => e.classList.contains("pnj") ? "pnj" : "pj").join() === "pnj"),
    await G(() => document.querySelectorAll(".discussion-privee").length + " " + [...document.querySelectorAll(".encart-dp")].map(e => e.className + ":" + e.hidden).join()));
  await cap("v422-telephone-oui");
  await cliquer(".encart-dp.pnj");
  const j = await rect(".encart-dp.pj"), r = await rect(".rappel-dp");
  verifier("à lui : son encart et la phrase de Doros tiennent dans l'écran, sans se chevaucher", j.l >= 0 && j.r <= 390 && r.l >= 0 && r.r <= 390 && j.b < r.t, JSON.stringify([j, r]));
  await cap("v422-telephone-a-toi");
  await cliquer(".quitter-dp");
  await p.setViewportSize({ width: 1194, height: 834 });
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
