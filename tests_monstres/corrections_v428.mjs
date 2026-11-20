// v428 — LES RETOUCHES DE NICO (lot du 17 novembre). Sur la VRAIE page (le décor du banc v422).
//   1. les fils invisibles des Paramètres : le livre tourne tout de suite, même si la base est lente ;
//   2. le papier d'un PNJ sorti à gauche : celui du héros, dessous, n'ouvre pas sa fiche ;
//   3-5. la page du Groupe : les avatars des héros côte à côte, ceux des suiveurs collés en bas de leur encart ;
//   8-9. la mémoire à long terme des PNJ (30 souvenirs : les 10 plus anciens synthétisés) ;
//   11. le sommaire du récit en mode DEV : la roue, les « − », un chapitre supprimé avec ses images ;
//   12. l'illustrateur : deux figures au plus, le PNJ de la scène en référence ; l'image du lieu à l'arrivée ;
//   13. le portrait d'un PNJ nommé : le nom en grand au-dessus, l'image en bas, la première page libre ;
//   14. les dés du récit : un d20 bien tiré au hasard.
// (6-7 : corrections_v422.mjs ; 8 « rejoint le groupe » : corrections_v418_moteur.mjs ; 10 : corrections_v373.mjs.)
// Captures : V428_CAPTURES=dossier. Lancer : node tests_monstres/corrections_v428.mjs
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
const CAPTURES = process.env.V428_CAPTURES || "";
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
  if (/Tu es MIA_MEMOIRE/.test(sys)) return ok({ candidates: [{ content: { parts: [{ text: JSON.stringify({ memoire: "Je suis la grande prêtresse des quais de Mégara. J'ai béni la compagnie de Thorin." }) }] } }], usageMetadata: { totalTokenCount: 50 } });
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

const PNG1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const imagesIA = [];
await p.route('**/api.openai.com/**', async r => {
  const req = r.request(); const corps = req.postDataBuffer() ? req.postDataBuffer().toString("latin1") : "";
  imagesIA.push({ url: req.url(), corps });
  r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ data: [{ b64_json: PNG1 }] }) });
});
await p.route(/res\.cloudinary\.com\/x\/image\/upload\/v1\/(Recit|Lieux)\//, r => r.fulfill({ status: 200, contentType: 'image/png', body: PORTRAIT_DOROS }));
const appelsMemoire = () => appelsIA.filter(a => /Tu es MIA_MEMOIRE/.test(a.sys));

// =========================================================================
titre("1. LES FILS INVISIBLES DES PARAMÈTRES : LE LIVRE TOURNE TOUT DE SUITE, MÊME SI LA BASE EST LENTE");
// =========================================================================
// Nico : « les fils invisibles dans paramètres, le bouton ne fonctionne pas ». Le livre attendait
// d'avoir tout lu avant de tourner ; au-delà de 8 secondes, la double page ressortait du livre.
await section(async () => {
  await G(() => { const S = window.SOCIAL; window.__lireReseau = S.lireReseau; S.lireReseau = (p) => new Promise(ok => setTimeout(() => ok(window.__lireReseau(p)), 9500)); });
  await deverrouiller(); await pose(); await p.waitForTimeout(500);
  const c = await centre("#grimoire-param-liens");
  const t0 = Date.now();
  await p.mouse.click(c.x, c.y);
  verifier("un toucher : le livre tourne aussitôt vers leur double page (la base répondra dans 9,5 s)", await attendreQue(surLaDoublePage, 4000), `${Date.now() - t0} ms`);
  verifier("…« Le livre cherche les âmes… » pendant la lecture", /cherche les âmes/.test(await texte("#grimoire-liens-g")));
  await p.waitForTimeout(8000);
  verifier("au-delà de 8 secondes, la double page reste dans le livre", await dansLeLivre() && await surLaDoublePage());
  verifier("la base a répondu : les âmes sont là", await attendreQue(() => G(() => !!document.querySelector("#grimoire-liens-g .nom-liens")), 5000));
  await G(() => { window.SOCIAL.lireReseau = window.__lireReseau; });
  await cap("v428_fils");
  await cliquer('#grimoire-liens-g [data-cb="parametres"]'); await pose(); await p.waitForTimeout(500);
});

// =========================================================================
titre("2. LE PAPIER D'UN PNJ SORTI À GAUCHE : CELUI DU HÉROS, DESSOUS, N'OUVRE PAS SA FICHE");
// =========================================================================
// Nico : « on clique sur sa fiche mais les pages tournent déjà sur la fiche du personnage ;
// la superposition des deux images : quand une feuille est sortie, désactive temporairement
// l'accès à la fiche perso ».
const toucherPapier = (id) => G((id) => { const el = document.getElementById(id), r = el.getBoundingClientRect();
  const o = { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1 };
  el.dispatchEvent(new PointerEvent("pointerdown", o)); el.dispatchEvent(new PointerEvent("pointerup", o)); }, id);
const sortirPapierPnj = (nom) => G((nom) => { const pp = document.getElementById("recit-portrait"); pp.dataset.heros = ""; pp.dataset.pnj = nom; pp.classList.add("sortie"); }, nom);
await section(async () => {
  await G(() => window.GRIMOIRE_RECIT.allerAuRecit()); await p.waitForTimeout(1500); await pose();
  await G(() => { window.__fiches = []; window.ouvrirFichePerso = (id) => window.__fiches.push(id); const a = document.getElementById("recit-avatar"); if (!a.dataset.heros) a.dataset.heros = "H1"; });
  await sortirPapierPnj("Dame Koré");
  await toucherPapier("recit-portrait");
  // Safari envoie son « click » après coup, sur ce qui est dessous : le papier du héros.
  await G(() => document.getElementById("recit-avatar").dispatchEvent(new MouseEvent("click", { bubbles: true })));
  verifier("le papier de Koré touché : ses fils invisibles s'ouvrent", await attendreQue(surLaDoublePage, 8000) && await attendreQue(() => G(() => window.GRIMOIRE_LIENS.vue().centre === "PNJ_KORE"), 5000));
  verifier("…et le « click » tardif sur le papier du héros n'ouvre pas sa fiche", (await G(() => window.__fiches.length)) === 0, JSON.stringify(await G(() => window.__fiches)));
  await cliquer('#grimoire-liens-g [data-cb="recit"]'); await pose(); await p.waitForTimeout(1500);
  await sortirPapierPnj("Dame Koré");
  await toucherPapier("recit-avatar");
  verifier("le papier d'un PNJ sorti, un toucher sur celui du héros : le papier rentre, pas de fiche", (await G(() => window.__fiches.length)) === 0 && !(await G(() => document.getElementById("recit-portrait").classList.contains("sortie"))));
  await p.waitForTimeout(1400);
  await toucherPapier("recit-avatar");
  verifier("…un instant après, le papier du héros ouvre de nouveau sa fiche", JSON.stringify(await G(() => window.__fiches)) === '["H1"]', JSON.stringify(await G(() => window.__fiches)));
  verifier("le toucher d'un papier ne change pas le héros pour qui l'on écrit", /Thorin/.test(await texte("#recit-choix-heros")) || (await texte("#recit-choix-heros")) === "");
});

// =========================================================================
titre("3. LA PAGE DU GROUPE : LES AVATARS");
// =========================================================================
const mesureGroupe = () => G(() => { const pg = document.getElementById("grimoire-groupe-g").getBoundingClientRect(); const u = pg.width / 100;
  const av = [...document.querySelectorAll("#grimoire-groupe-g .avatar-heros-groupe")].map(e => { const r = e.getBoundingClientRect(), n = e.closest(".heros-groupe").querySelector(".nom-groupe").getBoundingClientRect();
    return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height, nom: n.top }; });
  const premier = document.querySelector("#grimoire-groupe-g .avatar-heros-groupe");
  return { u, page: { l: pg.left, r: pg.right }, av, apres: premier ? getComputedStyle(premier, "::after").backgroundImage : "" }; });
await section(async () => {
  await G(() => window.GRIMOIRE_GROUPE.ouvrir()); await attendreQue(surGroupe, 8000); await pose();
  await attendreQue(() => G(() => !!document.querySelector("#grimoire-groupe-d .avatar-suiveur")), 6000); await p.waitForTimeout(500);
  const m = await mesureGroupe();
  const [a, b2] = m.av;
  // Nico : « à gauche, l'avatar des personnages les uns à côté des autres, avec en dessous leurs noms… »
  verifier("deux héros : leurs avatars côte à côte, de même taille, en pied", m.av.length === 2 && Math.abs(a.t - b2.t) < 1 && a.r <= b2.l + 0.5 && Math.abs(a.w - b2.w) < 1 && a.h >= a.w * 1.45, JSON.stringify(m.av));   // (v430) 1 / 1,5
  verifier("…leurs noms en dessous", m.av.every(x => x.nom >= x.b - 1));
  // (v430) Nico : « enlève l'ombre noire sous chaque avatar, mets une séparation dorée » (corrections_v430.mjs, v418_livre).
  verifier("(v430) plus de dégradé noir : une séparation dorée sous chaque avatar", !/linear-gradient/.test(m.apres) && await G(() => document.querySelectorAll("#grimoire-groupe-g .heros-groupe .separation-doree").length === 2), m.apres);
  // « …adapte la taille des avatars au nombre de personnages »
  await G(() => { const h = (i, n) => ({ idPersonnage: "HX" + i, idJoueur: "J" + (i + 3), prenom: n, nom: "", actif: true, urlCloudinary: "" });
    window.__sauveHeros = window.PERSOS_JOUEURS_PARTIE.slice(); window.PERSOS_JOUEURS_PARTIE.push(h(1, "Ione"), h(2, "Castor")); window.GRIMOIRE_GROUPE.maj(); });
  const m4 = await mesureGroupe();
  verifier("quatre héros : plus petits, toujours côte à côte, dans la page", m4.av.length === 4 && m4.av.every(x => Math.abs(x.w - m4.av[0].w) < 1 && Math.abs(x.t - m4.av[0].t) < 1) && m4.av[0].w < a.w - 5
    && m4.av[0].l >= m4.page.l && m4.av[3].r <= m4.page.r, JSON.stringify(m4.av.map(x => [Math.round(x.l), Math.round(x.w)])));
  await cap("v428_groupe_4");
  await G(() => { window.PERSOS_JOUEURS_PARTIE.length = 0; window.PERSOS_JOUEURS_PARTIE.push(window.__sauveHeros[0]); window.GRIMOIRE_GROUPE.maj(); });
  const m1 = await mesureGroupe();
  verifier("un seul héros : grand, mais pas plus de 36 % de la page", m1.av.length === 1 && m1.av[0].w >= a.w - 1 && m1.av[0].w <= m1.u * 36 + 1, JSON.stringify(m1.av));
  await G(() => { window.PERSOS_JOUEURS_PARTIE.length = 0; window.__sauveHeros.forEach(h => window.PERSOS_JOUEURS_PARTIE.push(h)); window.GRIMOIRE_GROUPE.maj(); });
  // Nico : « page de droite, l'avatar des PNJ : garde la taille des encarts, l'avatar collé en bas de
  // son encart, qui dépasse un peu en haut, toujours sur le côté gauche » ; « le symbole pour parler,
  // plus petit et sous l'image ».
  const s = await G(() => { const li = document.querySelector('#grimoire-groupe-d .suiveur-groupe'), u = document.getElementById("grimoire-groupe-d").getBoundingClientRect().width / 100;
    const c = li.querySelector(".carte-suiveur").getBoundingClientRect(), av = li.querySelector(".avatar-suiveur").getBoundingClientRect(), t = li.querySelector(".texte-suiveur").getBoundingClientRect(), b = li.querySelector(".parler-groupe").getBoundingClientRect();
    return { u, c: [c.left, c.top, c.bottom, c.height], av: [av.left, av.top, av.bottom, av.right], img: !!li.querySelector(".avatar-suiveur img"), t: t.left, b: [b.left, b.top, b.width] }; });
  verifier("Doros : son avatar collé en bas de son encart, à gauche", s.img && Math.abs(s.av[2] - s.c[2]) <= 1.5 && s.av[0] - s.c[0] < s.u * 3 && s.t >= s.av[3] - 1, JSON.stringify(s));
  verifier("…il dépasse un peu au-dessus de l'encart", s.av[1] < s.c[1] - s.u * 3 && s.av[1] > s.c[1] - s.u * 8, JSON.stringify(s));
  verifier("…l'encart garde sa taille (la place de l'ancien médaillon)", s.c[3] >= s.u * 14.4 - 1 && s.c[3] < s.u * 24, JSON.stringify(s.c));
  // (v430) Nico : « le bouton pour parler au PNJ, en discret, dans son encart tout en bas à droite ».
  verifier("(v430) la tête qui parle : petite, dans l'encart, en bas à droite", await G(() => { const li = document.querySelector('#grimoire-groupe-d .suiveur-groupe'), u = document.getElementById("grimoire-groupe-d").getBoundingClientRect().width / 100;
    const c = li.querySelector(".carte-suiveur").getBoundingClientRect(), b = li.querySelector(".parler-groupe").getBoundingClientRect();
    return b.width <= u * 4.6 && b.right <= c.right + 0.5 && b.right > c.right - u * 3 && b.bottom <= c.bottom + 0.5 && b.bottom > c.bottom - u * 3; }), JSON.stringify(s.b));
  await cap("v428_groupe");
});

// =========================================================================
titre("4. LA DISCUSSION PRIVÉE : IL SAIT QU'IL EST DE LA COMPAGNIE, ET SA MÉMOIRE");
// =========================================================================
await section(async () => {
  await G(() => { window.__docs["Systeme_Parties/P1/Ames/PNJ_DOROS"].memoire = "J'ai grandi sur les quais de Mégara."; });
  await cliquer('#grimoire-groupe-d .parler-groupe[data-id="PNJ_DOROS"]');
  await attendreQue(ouverte, 3000);
  await p.mouse.click(600, 120);
  paroles.push({ replique: "Oui, je suis des vôtres.", partir: false });
  const n = appelsParole().length;
  await dire("Tu fais partie de la compagnie, Doros ?");
  await attendreQue(() => appelsParole().length > n, 4000);
  const a = appelsParole().slice(-1)[0] || { sys: "" };
  verifier("(Nico : « il n'a pas conscience qu'il est dans mon groupe ») il le sait, et depuis quand", /TU FAIS PARTIE DE LA COMPAGNIE de Thorin Ironfoot : tu voyages avec eux depuis le Jour 10 de l'an 3\./.test(a.sys), (a.sys.match(/TU FAIS PARTIE[^\n]*/) || [""])[0]);
  verifier("…et sa mémoire à long terme part avec le reste", /TA MÉMOIRE \(ce que tu as retenu du passé plus lointain\) : J'ai grandi sur les quais de Mégara\./.test(a.sys));
  await attendreQue(async () => (await tour()) === "pnj", 4000);
  await cliquer(".quitter-dp");
});

// =========================================================================
titre("5. LA MÉMOIRE À LONG TERME : À 30 SOUVENIRS, LES 10 PLUS ANCIENS SONT SYNTHÉTISÉS");
// =========================================================================
const souvenirsDe = (ame) => G((ame) => Object.entries(window.__docs).filter(([k, v]) => k.startsWith("Systeme_Parties/P1/Souvenirs/") && v.ame === ame).map(([k, v]) => ({ k: k.split("/").pop(), ...v })), ame);
await section(async () => {
  await G(() => { const d = window.__docs;
    for (let k = 1; k <= 31; k++) d["Systeme_Parties/P1/Souvenirs/k" + k] = { ame: "PNJ_KORE", texte: `Souvenir n° ${k}`, sujets: [], importance: 1, tour: k, dateJeu: `Jour ${k} de l'an 3`, Le: k };
    d["Systeme_Parties/P1/Ames/PNJ_KORE"].memoire = "Je garde les quais depuis toujours."; });
  const n = appelsMemoire().length;
  const m = await G(() => window.SOCIAL.consoliderMemoire("P1", "PNJ_KORE"));
  const sv = await souvenirsDe("PNJ_KORE");
  const a = appelsMemoire()[n] || { sys: "", txt: "" };
  verifier("31 souvenirs : une IA (MIA_MEMOIRE) écrit la mémoire, une fois", appelsMemoire().length === n + 1 && /Je suis la grande prêtresse des quais/.test(m || ""));
  verifier("…elle reçoit la mémoire existante et les 10 plus anciens souvenirs, pas les autres", /Je garde les quais depuis toujours\./.test(a.txt) && [1, 2, 9, 10].every(k => a.txt.includes(`Souvenir n° ${k}\n`) || a.txt.endsWith(`Souvenir n° ${k}`))
    && !a.txt.includes("Souvenir n° 11") && /\[Jour 1 de l'an 3\] Souvenir n° 1/.test(a.txt), a.txt.slice(0, 300));
  verifier("…on lui dit de trier (l'anecdotique s'oublie) et de tout récrire, propre", /Oublie l'anecdotique/.test(a.sys) && /Récris TOUTE la mémoire/.test(a.sys) && /première personne/.test(a.sys));
  verifier("les 10 plus anciens quittent le journal (21 restent)", sv.length === 21 && !sv.some(x => /^k([1-9]|10)$/.test(x.k)), JSON.stringify(sv.map(x => x.k)));
  verifier("…la mémoire est récrite sur l'âme de Koré", await G(() => { const a = window.__docs["Systeme_Parties/P1/Ames/PNJ_KORE"]; return /grande prêtresse/.test(a.memoire) && a.memoireMaj > 0; }));
  verifier("sous le seuil (21) : rien ne se passe", (await G(() => window.SOCIAL.consoliderMemoire("P1", "PNJ_KORE"))) === null && appelsMemoire().length === n + 1);
  // Un souvenir de plus, écrit par le jeu, fait passer le seuil : la consolidation part d'elle-même.
  await G(() => { const d = window.__docs; for (let k = 32; k <= 39; k++) d["Systeme_Parties/P1/Souvenirs/k" + k] = { ame: "PNJ_KORE", texte: `Souvenir n° ${k}`, sujets: [], importance: 1, tour: k, Le: k }; });
  await G(() => window.SOCIAL.noterSouvenir("P1", "PNJ_KORE", "Les héros m'ont saluée.", { importance: 1 }));
  verifier("le 30e souvenir arrive : la mémoire se reforme toute seule (20 restent)", await attendreQue(async () => (await souvenirsDe("PNJ_KORE")).length === 20, 5000) && appelsMemoire().length === n + 2, String((await souvenirsDe("PNJ_KORE")).length));
  const ctx = await G(() => window.SOCIAL.contexteDuMJ({ idPartie: "P1", pnjs: [{ id: "PNJ_KORE", fiche: { Nom_PNJ: "Dame Koré", Occupation: "Grande prêtresse" } }], heros: window.PERSOS_PARTIE }));
  verifier("le MJ la reçoit avec le reste (« Sa mémoire »)", /Sa mémoire \(le passé lointain\) : Je suis la grande prêtresse/.test(ctx), ctx.slice(0, 300));
  await G(() => window.GRIMOIRE_LIENS.ouvrir({ id: "PNJ_KORE" })); await attendreQue(surLaDoublePage, 8000);
  verifier("les fils invisibles la montrent, au-dessus de ses souvenirs", await attendreQue(() => G(() => { const m = document.querySelector("#grimoire-liens-g .memoire-liens"), s = document.querySelector("#grimoire-liens-g .souvenirs-liens");
    return !!m && /grande prêtresse/.test(m.textContent) && !!s && (m.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING); }), 5000));
  await cap("v428_memoire");
});

// =========================================================================
titre("6. LE SOMMAIRE DU RÉCIT EN MODE DEV : SUPPRIMER UN CHAPITRE, AVEC SES IMAGES");
// =========================================================================
const URL_ILL = (k) => `https://res.cloudinary.com/x/image/upload/v1/Recit/Illustrations/ill${k}.png`;
const URL_LIEU = "https://res.cloudinary.com/x/image/upload/v1/Lieux/megara.png", URL_PNJ = "https://res.cloudinary.com/x/image/upload/v1/PNJ/doros.png";
await section(async () => {
  await G(() => window.GRIMOIRE_RECIT.allerAuRecit()); await p.waitForTimeout(1000); await pose();
  const ids = [];
  for (let k = 1; k <= 3; k++) {
    const r = await G((k) => window.GRIMOIRE_RECIT.archiverChapitre([
      { idDoc: `a${k}`, ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: `<p>Le chapitre ${k} commence sur les quais.</p>`, Timestamp: 10 * k,
        Illustration: { Url: `https://res.cloudinary.com/x/image/upload/v1/Recit/Illustrations/ill${k}.png`, Ratio: 1.75, Format: "double-page" },
        Portraits_PNJ: [{ Nom: "Doros", Url: "https://res.cloudinary.com/x/image/upload/v1/PNJ/doros.png", Ratio: 0.5714, Format: "avatar" }] },
      { idDoc: `d${k}`, ID_Partie: "P1", Auteur_ID: "DESTIN", Auteur_Nom: "Destin", Texte: "*Le groupe arrive.*", Texte_Livre: "Nous arrivons au port.", Timestamp: 10 * k + 1,
        Illustration: { Url: "https://res.cloudinary.com/x/image/upload/v1/Lieux/megara.png", Ratio: 1.75, Format: "double-page", Sujet: "lieu", Lieu: "L_1" } }]), k);
    ids.push(r && r.id);
  }
  const txt = await G((id) => window.__docs["Recits_Textes/" + id], ids[1]);
  verifier("trois chapitres rangés ; leurs croquis, portraits et l'image du lieu gardent leur image", ids.every(Boolean) && !!txt && txt.Entrees.filter(e => e.image && e.image.Url).map(e => e.type).join() === "illustration,portrait,illustration", JSON.stringify(txt && txt.Entrees.map(e => [e.type, !!e.image])));
  await G(() => window.GRIMOIRE_RECIT.allerAuSommaireDuRecit()); await pose(); await p.waitForTimeout(800);
  verifier("hors mode DEV : pas de roue crantée à côté du « Récit »", !(await G(() => document.querySelector(".titre-sommaire .roue-sommaire"))));
  await G(() => { localStorage.setItem("ivalis_DEV_MODE", "on"); window.GRIMOIRE_RECIT.rendre(); }); await p.waitForTimeout(300);
  const roue = await G(() => { const r = document.querySelector(".titre-sommaire .roue-sommaire"); if (!r) return null; const svg = r.querySelector("svg"); return { fill: getComputedStyle(svg).fill, w: r.getBoundingClientRect().width, t: document.querySelector(".titre-sommaire").getBoundingClientRect().height }; });
  verifier("en mode DEV : une petite roue crantée rouge à côté du « Récit », pas encore de « − »", !!roue && /rgb\(179, 38, 30\)/.test(roue.fill) && roue.w < roue.t && !(await G(() => document.querySelector(".moins-sommaire"))), JSON.stringify(roue));
  await cliquer(".roue-sommaire"); await p.waitForTimeout(300);
  const moins = await G(() => [...document.querySelectorAll(".moins-sommaire")].map(b => b.closest(".ligne-sommaire-dev").querySelector(".ligne-sommaire").dataset.recit));
  verifier("un toucher : un petit « − » rouge à côté de chaque chapitre fini (pas le chapitre en cours)", moins.length === 3 && moins.every(x => x.startsWith("chap:")), JSON.stringify(moins));
  await cap("v428_sommaire_dev");
  await G(() => { window.__effacees = []; window.supprimerImageCloudinary = async (u) => { window.__effacees.push(u); }; window.confirm = () => true; });
  await cliquer(`.moins-sommaire[data-supprimer="${ids[1]}"]`);
  verifier("un toucher sur le « − » du chapitre II : il quitte la base (sa fiche et ses pages)", await attendreQue(() => G((id) => !window.__docs["Recits_Chapitres/" + id] && !window.__docs["Recits_Textes/" + id], ids[1]), 4000));
  verifier("…son croquis est effacé ; ni le portrait de Doros, ni l'image du lieu", JSON.stringify(await G(() => window.__effacees)) === JSON.stringify([URL_ILL(2)]), JSON.stringify(await G(() => window.__effacees)));
  verifier("…le chapitre III devient le II (le prochain sera bien le III)", await G((id) => window.__docs["Recits_Chapitres/" + id].Numero === 2, ids[2]));
  const lignes = await G(() => [...document.querySelectorAll(".ligne-sommaire")].map(l => l.querySelector(".num").textContent + ":" + l.dataset.recit.slice(0, 5)));
  verifier("…et le sommaire n'a plus que deux chapitres finis", JSON.stringify(lignes) === '["I:chap:","II:chap:","III:coura"]', JSON.stringify(lignes));
  // (v463) Nico : « quand on appuie sur la roue crantée rouge, fais aussi apparaître un petit bouton pour copier dans le
  // presse-papier tout le texte du chapitre, lancers de dés et fils invisibles compris, au bon endroit dans le récit ».
  const copies = await G(() => [...document.querySelectorAll(".copie-sommaire")].map(b => b.dataset.copier));
  verifier("(v463) la roue ouverte : un petit bouton « copier » à côté de chaque chapitre, celui en cours compris", copies.length === 3 && copies.filter(x => x.startsWith("chap:")).length === 2 && copies.includes("courant"), JSON.stringify(copies));
  await G(() => { window.__copie = null; Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t) => { window.__copie = t; } } }); });
  await cliquer(`.copie-sommaire[data-copier="chap:${ids[0]}"]`);
  await attendreQue(() => G(() => !!window.__copie), 3000);
  const copie = await G(() => window.__copie || "");
  verifier("(v463) un toucher : le texte du chapitre I part dans le presse-papier (son titre, ses paragraphes, sans balises)", /^Chapitre I — /.test(copie) && /Le chapitre 1 commence sur les quais\./.test(copie) && /Nous arrivons au port\./.test(copie) && !/<p>/.test(copie), copie.slice(0, 200));
  verifier("(v463) …le bouton le dit (vert un instant)", await G(() => !!document.querySelector(".copie-sommaire.copie-ok")));
  const t = await G(() => window.texteDuChapitreRecit([
    { type: "narration", textes: ["Varos vous toise.", "Il crache par terre."], jets: [], cerveaux: [{ para: 1, lignes: ["Varos → Kaya : confiance −7"] }] },
    { type: "joueur", textes: ["Kaya tente de l'apaiser.", "Elle sourit."], jets: [{ de: 17, mod: "+2", total: 19, carac: "CHARISME" }] },
    { type: "illustration", image: { Url: "x" }, textes: [], jets: [] }], "Chapitre IV — Le port"));
  const attendu = "Chapitre IV — Le port\n\nVaros vous toise.\n\nIl crache par terre.\n\n[🧠 Fils invisibles : Varos → Kaya : confiance −7]\n\n[🎲 Jet de Charisme : 17 +2 = 19] Kaya tente de l'apaiser.\n\nElle sourit.";
  verifier("(v463) les jets de dés au début de l'action du joueur, les fils invisibles après le paragraphe qu'ils ont fait bouger", t === attendu, JSON.stringify(t));
  await G(() => { localStorage.setItem("ivalis_DEV_MODE", "off"); window.GRIMOIRE_RECIT.rendre(); }); await p.waitForTimeout(300);
  verifier("le mode DEV éteint : plus de roue, plus de « − »", !(await G(() => document.querySelector(".roue-sommaire, .moins-sommaire, .copie-sommaire"))));
});

// =========================================================================
titre("7. LE PORTRAIT D'UN PNJ NOMMÉ : SON NOM EN GRAND AU-DESSUS, L'IMAGE EN BAS, LA PREMIÈRE PAGE LIBRE");
// =========================================================================
await section(async () => {
  await G(() => window.GRIMOIRE_RECIT.allerAuRecit()); await p.waitForTimeout(800);
  let aGauche = 0, sautes = [];
  for (const n of [2, 5, 8, 11, 14, 17, 20, 23]) {
    const msgs = [{ idDoc: "t0", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Timestamp: 100,
      Texte: Array.from({ length: n }, (_, i) => `<p>La pluie tombe sur les quais, et le vieux Phokas raconte encore une histoire de marins perdus, la ${i + 1}e de la soirée, en tirant sur sa pipe.</p>`).join(""),
      Portraits_PNJ: [{ Nom: "Doros", Url: URL_PNJ, Ratio: 0.5714, Format: "avatar" }] }];
    await relayer(msgs, true); await p.waitForTimeout(250);
    const r = await G(() => { const pages = [...document.querySelectorAll(".page-suite")]; const i = pages.findIndex(x => x.querySelector(".portrait-avatar"));
      if (i < 1) return null; const av = pages[i - 1]; return { gauche: pages[i].classList.contains("gauche"), avantVide: !av.textContent.trim() && !av.querySelector("figure, .fond-recit") }; });
    if (r && r.gauche) aGauche++;
    if (!r || r.avantVide) sautes.push(n);
  }
  verifier("jamais de page blanche laissée avant le portrait (8 longueurs de texte)", sautes.length === 0, JSON.stringify(sautes));
  verifier("…il se pose aussi sur une page de gauche quand c'est la première libre", aGauche >= 1, `${aGauche} fois à gauche`);
  // (v451) « Un peu d'écriture en haut de page, beaucoup d'espace libre ; de l'autre côté l'avatar d'un PNJ ; au lieu de
  // continuer le récit dans l'espace vide, il a écrit sur la page après la photo. » La suite du récit remplit d'abord
  // la page où il s'écrit ; le portrait prend la page libre suivante.
  const trous = [];
  for (const n of [2, 5, 8, 11, 14, 17, 20, 23]) {
    const para = (i, quoi) => `<p>${quoi}, la ${i + 1}e fois, le vent pousse les barques contre le quai et les cordages grincent dans la nuit sans lune.</p>`;
    const msgs = [{ idDoc: "t0", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Timestamp: 100,
      Texte: Array.from({ length: n }, (_, i) => para(i, "Sur les quais")).join(""), Portraits_PNJ: [{ Nom: "Doros", Url: URL_PNJ, Ratio: 0.5714, Format: "avatar" }] },
      { idDoc: "t1", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Timestamp: 200, Texte: Array.from({ length: 14 }, (_, i) => para(i, "Plus tard")).join("") }];
    await relayer(msgs, true); await p.waitForTimeout(250);
    const r = await G(() => { const pages = [...document.querySelectorAll(".page-suite")]; const i = pages.findIndex(x => x.querySelector(".portrait-avatar"));
      const premiere = pages.findIndex(x => x.querySelector('.mot[data-e="t1"]'));
      if (i < 1) return { i, premiere };
      const av = pages[i - 1], mots = [...av.querySelectorAll(".mot")], rp = av.getBoundingClientRect();
      const bas = mots.length ? mots[mots.length - 1].getBoundingClientRect().bottom : rp.top;
      return { i, premiere, libre: +((rp.bottom - bas) / rp.height).toFixed(2), avantPortrait: !!av.querySelector('.mot[data-e="t1"]') || premiere < i }; });
    // un trou : la suite commence après le portrait alors que la page d'avant gardait plus d'un quart de page libre
    if (r.i >= 1 && !r.avantPortrait && r.libre > 0.25) trous.push({ n, ...r });
  }
  verifier("(v451) la suite du récit remplit l'espace vide de la page avant le portrait du PNJ (8 longueurs)", trous.length === 0, JSON.stringify(trous));
  // Le portrait : on va à sa page.
  await G(() => { const el = [...document.querySelectorAll(".page-suite")].find(x => x.querySelector(".portrait-avatar")); window.GRIMOIRE.allerALaPage(window.GRIMOIRE.indexDe(el)); });
  await pose(); await p.waitForTimeout(1500);
  const f = await G(() => { const fig = document.querySelector(".portrait-avatar"), page = fig.closest(".page-grimoire"), u = page.getBoundingClientRect().width / 100;
    const rf = fig.getBoundingClientRect(), rp = page.getBoundingClientRect(), cap = fig.querySelector("figcaption"), img = fig.querySelector("img");
    return { u, ordre: fig.firstElementChild.tagName, taille: parseFloat(getComputedStyle(cap).fontSize), bas: rp.bottom - rf.bottom, haut: rp.height, objet: getComputedStyle(img).objectPosition, capBas: cap.getBoundingClientRect().bottom, imgHaut: img.getBoundingClientRect().top }; });
  verifier("le nom au-dessus de l'image, plus gros (9 % de page au lieu de 6)", f.ordre === "FIGCAPTION" && f.taille >= f.u * 8.5 && f.capBas <= f.imgHaut + 1, JSON.stringify(f));
  verifier("…l'image posée tout en bas de la page", f.bas <= f.haut * 0.03 && /100%$/.test(f.objet), JSON.stringify(f));
  await cap("v428_portrait");
  await relayer([], true); await p.waitForTimeout(300);
});

// =========================================================================
titre("8. L'ILLUSTRATEUR : DEUX FIGURES AU PLUS, LE PNJ DE LA SCÈNE EN RÉFÉRENCE");
// =========================================================================
const illustrer = (avis, pnjConnus) => G(async ([avis, pnjConnus]) => {
  ["ivalis_OPENAI_API_KEY", "ivalis_CLOUDINARY_CLOUD_NAME", "ivalis_CLOUDINARY_API_KEY", "ivalis_CLOUDINARY_API_SECRET"].forEach(k => localStorage.setItem(k, "banc"));
  window.televerserImageDetoureeIvalis = async (source, dossier) => `https://res.cloudinary.com/x/image/upload/q_auto,f_auto/v1/${dossier}/croquis.png`;
  window.__blobs = []; window.imageVersBlobPng = async (url) => { window.__blobs.push(url); return new Blob(["png"], { type: "image/png" }); };
  const vrai = window.fetchGemini; window.__agent = "";
  window.fetchGemini = async (nom, corps) => { window.__agent = corps; return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(avis) }] } }] }), { status: 200 }); };
  localStorage.removeItem("ivalis_illus_ecart_P1");
  const id = "mi" + Math.random().toString(36).slice(2, 7);
  try { await window.illustrerLeRecit({ idMessage: id, texteMJ: "Thorin s'incline devant Dame Koré, sous le regard de Lyra.", texteJoueurs: "", pnjConnus }); }
  finally { window.fetchGemini = vrai; }
  return { blobs: window.__blobs.slice(), agent: window.__agent, doc: (window.__docs || {})["Messages_Chat/" + id] || null };
}, [avis, pnjConnus]);
const AVIS = { illustrer: true, moment: "attachant", sujet: "scene", description: "Thorin bows before Dame Koré while Lyra and a stray dog watch.",
  acteurs: [{ id: "H1", nom: "Thorin", type: "heros", place: "right", action: "bowing", expression: "solemn" }, { nom: "Dame Koré", type: "pnj", place: "far right", action: "blessing him", expression: "serene" },
            { id: "H2", nom: "Lyra", type: "heros", place: "background right" }, { nom: "a stray dog", type: "autre", place: "foreground" }], mise_en_scene: "low-angle close shot", pnj_nommes: [] };
await section(async () => {
  await G(() => { window.__docs["Monde_PNJ/PNJ_KORE"].URL_Cloudinary = "https://res.cloudinary.com/x/image/upload/v1/PNJ/kore.png"; });
  let n = imagesIA.length;
  const r = await illustrer(AVIS, { "Dame Koré": { Nom_PNJ: "Dame Koré", URL_Cloudinary: "https://res.cloudinary.com/x/image/upload/v1/PNJ/kore.png", Statut: "Vivant" } });
  const cr = imagesIA.slice(n).find(x => /concept art/.test(x.corps));
  const agent = JSON.parse(r.agent || "{}"), sys = agent.systemInstruction ? agent.systemInstruction.parts[0].text : "", txt = agent.contents ? agent.contents[0].parts[0].text : "";
  verifier("l'agent sait qui est là : « LES PNJ DE LA SCÈNE (avec portrait) : Dame Koré »", /--- LES PNJ DE LA SCÈNE \(avec portrait\) ---\nDame Koré/.test(txt), txt.slice(0, 200));
  verifier("…et qu'il faut deux personnages au plus, des plans rapprochés et dynamiques, tout l'équipement", /DEUX PERSONNAGES AU PLUS/.test(sys) && /RAPPROCHÉS et DYNAMIQUES/.test(sys) && /TOUT son équipement/.test(sys));
  verifier("Koré dans la scène (pas dans les « nommés ») : son portrait part en référence", r.blobs.includes("https://res.cloudinary.com/x/image/upload/v1/PNJ/kore.png") && !!cr && /image 2 is Dame Kor/.test(cr.corps), JSON.stringify(r.blobs));
  verifier("deux figures au plus : Thorin et Koré (Lyra et le chien restent hors du plan)", !!cr && /EXACTLY 2 figures in the whole drawing: Thorin, Dame Kor/.test(cr.corps) && !/stray dog \(/.test(cr.corps), cr ? (cr.corps.match(/EXACTLY[^.]*/) || [""])[0] : "aucun");
  // Sans que le tour ne l'ait dans les PNJ connus : sa fiche dans la base suffit.
  n = imagesIA.length;
  const r2 = await illustrer(AVIS, {});
  verifier("…même absent des PNJ connus du tour : sa fiche de la base donne son portrait", r2.blobs.includes("https://res.cloudinary.com/x/image/upload/v1/PNJ/kore.png"), JSON.stringify(r2.blobs));
  // (v451) « Un homme parti seul faire des signaux avec une lampe à huile : l'IA a mis mon personnage à côté de lui. »
  verifier("(v451) l'agent sait que deux est un maximum : un personnage seul se dessine seul, sans héros ajouté", /Deux est un MAXIMUM, pas un objectif/.test(sys) && /N'ajoute JAMAIS un héros qui n'est pas physiquement à ses côtés/.test(sys));
  const seul = await G(() => {
    const f = window.acteursDuCroquisIllustrateur;
    const a = f({ sujet: "personnage", extrait: "Plus loin, seul sur la crête, un homme agite une lampe à huile.", acteurs: [{ id: "H1", nom: "Thorin", type: "heros", place: "right" }, { nom: "a man with an oil lamp", type: "autre", place: "far right" }] }, "");
    const b = f({ sujet: "personnage", extrait: "Thorin lève sa lampe vers la crête.", acteurs: [{ nom: "a man with an oil lamp", type: "autre" }, { id: "H1", nom: "Thorin", type: "heros" }] }, "");
    const c = f({ sujet: "personnage", extrait: "Un homme agite une lampe.", description: "the group watches a man", heros: ["Thorin"], autres: ["a man with an oil lamp"] }, "Thorin regarde.");
    const d = f({ sujet: "scene", acteurs: [{ id: "H1", nom: "Thorin", type: "heros" }, { nom: "Dame Koré", type: "pnj" }] }, "");
    const n = (x) => ({ heros: x.heros.map(h => h.prenom), pnj: x.pnj, autres: x.autres.map(s => s.split(" (")[0]) });
    return { a: n(a), b: n(b), c: n(c), d: n(d) }; });
  verifier("(v451) un personnage seul : sa seule figure (pas le héros à côté) ; le héros, seulement si la phrase du moment le nomme",
           JSON.stringify(seul.a) === '{"heros":[],"pnj":[],"autres":["a man with an oil lamp"]}' && JSON.stringify(seul.b) === '{"heros":["Thorin"],"pnj":[],"autres":[]}'
           && JSON.stringify(seul.c) === '{"heros":[],"pnj":[],"autres":["a man with an oil lamp"]}' && JSON.stringify(seul.d) === '{"heros":["Thorin"],"pnj":["Dame Koré"],"autres":[]}', JSON.stringify(seul));
});

// =========================================================================
titre("9. L'ARRIVÉE DANS UN LIEU : SON IMAGE EN FOND DE DOUBLE PAGE");
// =========================================================================
await section(async () => {
  await G(async () => { window.__docs["Monde_Lieux/L_1"].URL_Cloudinary = "https://res.cloudinary.com/x/image/upload/v1/Lieux/megara.png"; window.__ajouts = [];
    await window.__annoncerArriveeBanc({ arrivee: true, lieu: "L_1" }, null); });
  const m = await G(() => ((window.__ajouts || []).find(a => a.col === "Messages_Chat" && a.data.Auteur_ID === "DESTIN") || {}).data || null);
  verifier("l'annonce de l'arrivée porte l'image du lieu, en double page", !!m && /Le port de Mégara/.test(m.Texte) && m.Illustration && m.Illustration.Url === URL_LIEU && m.Illustration.Format === "double-page" && m.Illustration.Lieu === "L_1", JSON.stringify(m && m.Illustration));
  const e = await G((m) => window.GRIMOIRE_RECIT.construireEntrees([{ ...m, idDoc: "arr", Texte_Livre: "Nous arrivons au port de Mégara." }]).map(x => [x.type, x.image ? x.image.Url : ""]), m);
  verifier("…le livre l'écrit, puis pose l'image du lieu en fond de double page", JSON.stringify(e) === JSON.stringify([["temps", ""], ["illustration", URL_LIEU]]), JSON.stringify(e));
  const sans = await G(async () => { window.__docs["Monde_Lieux/L_1"].URL_Cloudinary = ""; window.__ajouts = []; await window.__annoncerArriveeBanc({ arrivee: true, lieu: "L_1" }, null);
    return ((window.__ajouts || []).find(a => a.col === "Messages_Chat") || {}).data || null; });
  verifier("un lieu sans image : l'annonce seule", !!sans && !sans.Illustration);
});

// =========================================================================
titre("10. LES DÉS DU RÉCIT : UN D20 BIEN TIRÉ AU HASARD");
// =========================================================================
// Nico : « six lancers, pas un seul au-dessus de 5 : vérifie que ce n'est pas faussé ». Le
// vrai lancer du livre (lancerJetPourHeros, app.js), 2 000 fois.
await section(async () => {
  const v = await G(async () => { window.CARACS_PARTIE = { ...(window.CARACS_PARTIE || {}), H1: { force: 14 } }; const l = [];
    for (let i = 0; i < 2000; i++) { await window.__vraiJet("H1", "FORCE"); const a = window.__docs["Systeme_Parties/P1"].Action_Des; l.push([a.resultatBrut, a.modificateur, a.totalFinal]); } return l; });
  const faces = Array(21).fill(0); v.forEach(([d]) => { faces[d] = (faces[d] || 0) + 1; });
  const attendu = v.length / 20, khi2 = faces.slice(1).reduce((s, n) => s + (n - attendu) ** 2 / attendu, 0);
  verifier("2 000 lancers : toujours un entier de 1 à 20, le total = dé + modificateur (+2 pour 14)", v.length === 2000 && v.every(([d, m, t]) => Number.isInteger(d) && d >= 1 && d <= 20 && m === 2 && t === d + m));
  verifier("chaque face sort à peu près une fois sur vingt (khi² < 43,8, seuil 0,1 %)", khi2 < 43.8 && faces.slice(1).every(n => n > 50 && n < 150), `khi² ${khi2.toFixed(1)} — ${faces.slice(1).join(" ")}`);
  const audessus = v.filter(([d]) => d > 5).length / v.length;
  verifier("…plus de 5 trois fois sur quatre (six fois de suite 5 ou moins : 1 chance sur 4 096)", audessus > 0.7 && audessus < 0.8, (audessus * 100).toFixed(1) + " %");
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
