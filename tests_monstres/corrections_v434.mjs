// v434 — LES CLANS (LA POPUP, LE FANION DÉTOURÉ, LA RÉINITIALISATION), LE HALL EN VRAIES
// DOUBLES PAGES, LE TABLEAU DES MISSIONS ET SES ENCARTS (DEV), LE DÉFILEMENT PLUS RAPIDE.
// Nico : « chaque joueur qui n'a pas de clan : à sa prochaine connexion, une popup de création de son clan
// (le nom, la description de sa bannière) ; l'IA crée un fanion réaliste sur fond blanc sans ombrage, hébergé
// sur Cloudinary ; un algo supprime le fond blanc ; l'image sur la page de droite du clan, en grand, collée en
// haut de page. » « Un bouton dans les paramètres pour reboot un clan. » « Clan + le nom donné, sinon le nom du
// joueur. » « Dans le tableau des missions, cette image en double page, sans l'ombre du milieu ; dans le
// bouton DEV, des encarts sur ce tableau et leur inclinaison. » « Enlève dans le Hall tous les boutons retour ;
// on tourne la page en arrière ; les pièces sont une nouvelle double page. » « Pas de numéros, pas de
// soulignage. » « Membres du clan. » « Fais tourner les pages plus rapidement. »
// Sur la vraie page (le décor du banc v424), avec de faux OpenAI et Cloudinary.
// (v435) Nico : « mettre Clan devant le champ du nom » ; « la bannière, fais-la descendre encore un peu » ; « le panneau des missions déborde de la page ».
// (v436) Nico : « cette image en fond dans la page Hall de guilde, de la même manière que les images en fond de race ».
// (v437) « Le tableau, mets-le partout dans les deux pages, quitte à étirer ; un léger fondu sur sa bordure. »
// Lancer : node tests_monstres/corrections_v434.mjs
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
const CAPTURES = process.env.V434_CAPTURES || "";
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
titre("1. LE HALL : NI NUMÉRO, NI TRAIT, NI BOUTON RETOUR");
// =========================================================================
await section(async () => {
  await G(() => window.GRIMOIRE.allerAuVillage()); await attendreQue(surVillage, 8000); await pose();
  await cliquer("#lieu-village-hall");
  verifier("le bâtiment ouvre le Hall", await attendreQue(surHall, 8000)); await pose();
  const r = await G(() => { const [g, d] = window.GRIMOIRE_GUILDE.pages();
    return { entrees: [...g.querySelectorAll(".entree-guilde")].map(e => e.textContent.replace(/\s+/g, " ").trim()),
      traits: [...g.querySelectorAll(".entree-guilde-texte")].map(s => getComputedStyle(s).backgroundImage), numeros: g.querySelectorAll(".numero-guilde").length,
      retours: document.querySelectorAll(".page-guilde .retour-guilde, .page-guilde [data-gu='village'], .page-guilde .lien-fiche").length }; });
  verifier("les quatre titres, sans numéro", JSON.stringify(r.entrees) === JSON.stringify(["Panneau des missions", "Salle du conseil", "Bureau du patriarche", "Livre des clans"]) && r.numeros === 0, JSON.stringify(r.entrees));
  verifier("…sans trait de plume dessous", r.traits.every(t => t === "none"), JSON.stringify(r.traits));
  verifier("…et plus aucun bouton retour", r.retours === 0, String(r.retours));
  // (v436) « Cette image en fond dans la page Hall de guilde, de la même manière que les images en fond de race. »
  await attendreQue(() => G(() => [...document.querySelectorAll(".page-hall-guilde .fond-guilde img")].every(i => i.complete && i.naturalWidth > 0)), 4000);
  const f = await G(() => window.GRIMOIRE_GUILDE.pages().map(pg => { const fo = pg.querySelector(".fond-guilde"), img = fo && fo.querySelector("img"); if (!img) return null;
    const pr = pg.getBoundingClientRect(), ir = img.getBoundingClientRect(), c = pg.querySelector(".contenu-page"), m = getComputedStyle(fo).maskImage || getComputedStyle(fo).webkitMaskImage || "";
    return { src: img.getAttribute("src"), dx: Math.round(ir.left - pr.left), w: Math.round(ir.width / pr.width * 100) / 100, h: Math.round(ir.height / pr.height * 100) / 100,
             voile: m.replace(/\s+/g, " "), dessus: Number(getComputedStyle(c).zIndex) > Number(getComputedStyle(fo).zIndex), cache: getComputedStyle(pg).overflow }; }));
  const [fg, fd] = f;
  verifier("(v436) le fond du Hall : l'image de Nico, sur les deux pages", fg && fd && /ncq5cc\.png$/.test(fg.src) && fg.src === fd.src && hallDemande.length > 0, JSON.stringify(f).slice(0, 200));
  verifier("…sur toute la double page, comme les peuples (deux pages de large, chaque page sa moitié)", fg.w === 2 && fd.w === 2 && fg.h === 1 && fg.dx === 0 && fd.dx < 0 && fg.cache === "hidden", JSON.stringify(f.map(x => [x.dx, x.w, x.h])));
  verifier("…voilée à gauche sous le menu (presque effacée au bord, entière vers la pliure), entière à droite ; le texte par-dessus",
           /rgba\(0, 0, 0, 0\.07\) 0%/.test(fg.voile) && /rgba\(0, 0, 0, 0\.92\) 100%/.test(fg.voile) && /rgb\(0, 0, 0\) 88%/.test(fd.voile) && fg.dessus && fd.dessus, fg.voile.slice(0, 120));
  await cap("v434-hall");
});

// =========================================================================
titre("2. UNE PIÈCE : UNE NOUVELLE DOUBLE PAGE, LA PAGE TOURNE ; ON REVIENT EN LA TOURNANT EN ARRIÈRE");
// =========================================================================
await section(async () => {
  const avant = await G(() => ({ ici: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), hall: window.GRIMOIRE.indexDe(window.GRIMOIRE_GUILDE.pages()[0]) }));
  await cliquer("#guilde-conseil");
  verifier("« Salle du conseil » : la page tourne vers une nouvelle double page", await attendreQue(() => surPiece("conseil"), 6000)); await pose();
  const r = await G(() => { const [pg, pd] = window.GRIMOIRE_GUILDE.pagesPiece(), [hg] = window.GRIMOIRE_GUILDE.pages();
    return { ici: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), piece: window.GRIMOIRE.indexDe(pg), hall: window.GRIMOIRE.indexDe(hg),
      titre: pd.querySelector(".titre-guilde").textContent.trim(), dev: /En développement/.test(pg.textContent + pd.textContent), menu: hg.querySelectorAll(".entree-guilde").length,
      retours: pg.querySelectorAll("button").length + pd.querySelectorAll("button").length }; });
  verifier("…juste après le Hall, qui garde son menu (rien n'est remplacé)", r.piece === r.hall + 2 && r.menu === 4 && r.ici === r.piece, JSON.stringify(r));
  verifier("…son titre, « En développement », aucun bouton", r.titre === "Salle du conseil" && r.dev && r.retours === 0, JSON.stringify(r));
  await tournerEnArriere();
  verifier("tourner la page en arrière : le Hall", await attendreQue(surHall, 4000));
  verifier("…et la pièce reste derrière (on y retourne en tournant la page)", await G(() => window.GRIMOIRE_GUILDE.pagesPiece().length === 2 && window.GRIMOIRE.indexDe(window.GRIMOIRE_GUILDE.pagesPiece()[0]) > 0));
  await tournerEnArriere();
  verifier("encore en arrière : le village", await attendreQue(surVillage, 4000));
  await G(() => window.GRIMOIRE_PAGEFLIP.flipNext("top")); await p.waitForTimeout(200); await pose();
  verifier("…et en avant : le Hall de nouveau", await attendreQue(surHall, 4000));
});

// =========================================================================
titre("3. LE PANNEAU DES MISSIONS : L'IMAGE SUR TOUTE LA DOUBLE PAGE, SANS L'OMBRE DU MILIEU");
// =========================================================================
await section(async () => {
  await cliquer("#guilde-missions");
  verifier("« Panneau des missions » : sa double page", await attendreQue(() => surPiece("missions"), 6000)); await pose();
  await attendreQue(() => G(() => [...document.querySelectorAll(".page-tableau-missions .image-tableau")].every(i => i.complete && i.naturalWidth > 0)), 4000);
  const r = await G(() => { const pages = window.GRIMOIRE_GUILDE.pagesPiece();
    return pages.map(pg => { const pr = pg.getBoundingClientRect(), img = pg.querySelector(".image-tableau"), ir = img.getBoundingClientRect();
      return { pli: getComputedStyle(pg, "::after").display, page: [Math.round(pr.left), Math.round(pr.top), Math.round(pr.width), Math.round(pr.height)],
               img: [Math.round(ir.left), Math.round(ir.top), Math.round(ir.width), Math.round(ir.height)], src: img.getAttribute("src") }; }); });
  const [g, d] = r;
  verifier("l'image de Nico (Cloudinary), sur les deux pages", tableauDemande.length > 0 && /okyu3f/.test(g.src) && g.src === d.src, g.src);
  // (v437) « Mets-le partout dans les deux pages, qu'il prenne toute la place, quitte à l'étirer » (la marge de la v435 est partie).
  verifier("(v437) étirée sur les deux pages entières, sans rien couper (deux pages de large, toute la hauteur)",
           Math.abs(g.img[0] - g.page[0]) <= 1 && Math.abs(g.img[1] - g.page[1]) <= 1 && Math.abs(g.img[2] - 2 * g.page[2]) <= 2 && Math.abs(g.img[3] - g.page[3]) <= 1
           && Math.abs(d.img[0] - (d.page[0] - d.page[2])) <= 1 && Math.abs(d.img[2] - 2 * d.page[2]) <= 2, JSON.stringify(r.map(x => [x.page, x.img])));
  const fondu = await G(() => { const c = window.GRIMOIRE_GUILDE.pagesPiece()[0].querySelector(".calque-tableau"), cs = getComputedStyle(c); return (cs.maskImage || cs.webkitMaskImage || "").replace(/\s+/g, " "); });
  verifier("(v437) sur le seul bord de l'image, un fondu très léger (55 % → plein, sur une bande étroite)",
           /rgba\(0, 0, 0, 0\.55\) 0%, rgb\(0, 0, 0\) 1\.2%, rgb\(0, 0, 0\) 98\.8%, rgba\(0, 0, 0, 0\.55\) 100%/.test(fondu) && /linear-gradient\((to bottom, )?rgba\(0, 0, 0, 0\.55\) 0%, rgb\(0, 0, 0\) 2%/.test(fondu), fondu.slice(0, 160));
  verifier("…sans l'ombre de la pliure", g.pli === "none" && d.pli === "none", g.pli + "," + d.pli);
  await p.waitForTimeout(600); await cap("v434-tableau");
});

// =========================================================================
titre("4. LE BOUTON DEV : LES ENCARTS DU TABLEAU (POSER, GLISSER, ÉTIRER, PENCHER, SUPPRIMER)");
// =========================================================================
await section(async () => {
  await G(() => { localStorage.setItem("ivalis_DEV_MODE", "on"); });
  await attendreQue(() => G(() => !!document.getElementById("outil-encarts-tableau")), 4000);
  const outil = await G(() => { const o = document.getElementById("outil-encarts-tableau"); return o ? { dans: !!o.closest("#dev-onglet-nouveau"), texte: o.textContent.replace(/\s+/g, " ") } : null; });
  verifier("l'outil est dans l'onglet « Nouveau » du bouton DEV rouge", outil && outil.dans && /Nouvel encart/.test(outil.texte) && /Inclinaison/.test(outil.texte), JSON.stringify(outil).slice(0, 160));
  await G(() => document.getElementById("btn-encart-nouveau").click());
  await p.waitForTimeout(300);
  const base = () => G(() => (window.__docs["Carte_Livre/Tableau_Missions"] || {}));
  let d = await base();
  verifier("« + Nouvel encart » : un encart n° 1 dans la base (Carte_Livre/Tableau_Missions), pour toutes les parties", d.Encarts && d.Encarts[1] && d.Encarts[1].Numero === 1 && d.Encarts[1].angle === 0, JSON.stringify(d));
  const vis = await G(() => [...document.querySelectorAll(".page-tableau-missions .encart-tableau.edition")].length);
  verifier("…visible (en pointillés) sur la double page, avec ses poignées", vis >= 1 && await G(() => !!document.querySelector(".encart-tableau.edition .encart-taille") && !!document.querySelector(".encart-tableau.edition .encart-rotation")));
  const pageAvant = await ici();
  // Glisser : il se déplace (et la page ne tourne pas).
  const boite = async () => G(() => { const e = [...document.querySelectorAll(".encart-tableau.edition")].find(x => x.getBoundingClientRect().width > 0 && document.elementFromPoint(x.getBoundingClientRect().left + x.getBoundingClientRect().width / 2, x.getBoundingClientRect().top + x.getBoundingClientRect().height / 2) && document.elementFromPoint(x.getBoundingClientRect().left + x.getBoundingClientRect().width / 2, x.getBoundingClientRect().top + x.getBoundingClientRect().height / 2).closest(".encart-tableau")); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.right, b: r.bottom }; });
  let c = await boite();
  await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x + 80, c.y + 40, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(300);
  d = await base();
  // (v435) Les encarts : en parts de l'image du tableau (elle ne couvre plus toute la double page).
  const livre = await G(() => { const r = window.GRIMOIRE_GUILDE.pagesPiece()[0].querySelector(".calque-tableau").getBoundingClientRect(); return { w: r.width, h: r.height }; });
  verifier("glisser l'encart le déplace (enregistré), la page ne tourne pas", Math.abs(d.Encarts[1].x - (0.2 + 80 / livre.w)) < 0.01 && Math.abs(d.Encarts[1].y - (0.25 + 40 / livre.h)) < 0.01 && (await ici()) === pageAvant, JSON.stringify(d.Encarts[1]));
  // Étirer par le coin.
  const coin = await G(() => { const h = [...document.querySelectorAll(".encart-tableau.edition .encart-taille")].map(x => x.getBoundingClientRect()).find(r => r.width > 0 && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2).classList.contains("encart-taille")); return h ? { x: h.left + h.width / 2, y: h.top + h.height / 2 } : null; });
  await p.mouse.move(coin.x, coin.y); await p.mouse.down(); await p.mouse.move(coin.x + 60, coin.y + 30, { steps: 5 }); await p.mouse.up(); await p.waitForTimeout(300);
  d = await base();
  verifier("le carré du coin l'étire", Math.abs(d.Encarts[1].l - (0.16 + 60 / livre.w)) < 0.01 && Math.abs(d.Encarts[1].h - (0.18 + 30 / livre.h)) < 0.01, JSON.stringify(d.Encarts[1]));
  // Pencher : le rond du haut, puis le champ « Inclinaison ».
  const rond = await G(() => { const h = [...document.querySelectorAll(".encart-tableau.edition .encart-rotation")].map(x => x.getBoundingClientRect()).find(r => r.width > 0 && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2).classList.contains("encart-rotation")); return h ? { x: h.left + h.width / 2, y: h.top + h.height / 2 } : null; });
  c = await boite();
  await p.mouse.move(rond.x, rond.y); await p.mouse.down(); await p.mouse.move(c.x + 200, c.y - 200, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(300);
  d = await base();
  verifier("le rond du haut le fait pencher (≈ 45°)", Math.abs(d.Encarts[1].angle - 45) <= 3, String(d.Encarts[1].angle));
  await G(() => { const i = document.getElementById("encart-angle"); i.value = "-7.5"; i.dispatchEvent(new Event("change")); });
  await p.waitForTimeout(300);
  d = await base();
  const tr = await G(() => document.querySelector(".encart-tableau.edition").style.transform);
  verifier("…ou au degré près, dans le bouton DEV (−7,5°)", d.Encarts[1].angle === -7.5 && /rotate\(-7\.5deg\)/.test(tr), `${d.Encarts[1].angle} ${tr}`);
  await G(() => document.getElementById("btn-encart-nouveau").click()); await p.waitForTimeout(200);
  d = await base();
  verifier("un deuxième encart : n° 2", d.Encarts[2] && d.Encarts[2].Numero === 2 && d.Prochain_Numero === 3, JSON.stringify(Object.keys(d.Encarts)));
  await cap("v434-encarts");
  await G(() => document.getElementById("btn-encart-supprimer").click()); await p.waitForTimeout(200);
  d = await base();
  verifier("« Supprimer cet encart » l'enlève de la base", !d.Encarts[2] && !!d.Encarts[1], JSON.stringify(Object.keys(d.Encarts)));
  // Encarts cachés : invisibles, ils ne prennent pas le doigt.
  await G(() => { const cs = document.getElementById("case-encarts-visibles"); cs.checked = false; cs.dispatchEvent(new Event("change")); });
  const cache = await G(() => { const e = document.querySelector(".page-tableau-missions .encart-tableau"); return e ? { edition: e.classList.contains("edition"), bord: getComputedStyle(e).borderStyle, doigt: getComputedStyle(e).pointerEvents } : null; });
  verifier("« Afficher les encarts » décoché : ils sont là (pour leurs textes à venir), invisibles, sans prendre le doigt", cache && !cache.edition && cache.bord === "none" && cache.doigt === "none", JSON.stringify(cache));
  await G(() => localStorage.setItem("ivalis_DEV_MODE", "off"));
});

// =========================================================================
titre("5. LA POPUP DU CLAN : À LA CONNEXION D'UN JOUEUR SANS CLAN ; ON PEUT LA FERMER");
// =========================================================================
await section(async () => {
  // Un vrai compte (Firebase Auth lui donne un uid) : Ben, joueur J1, sans clan.
  await G(() => { window.COMPTE_JOUEUR = { ...window.COMPTE_JOUEUR, uid: "u-ben" }; });
  verifier("Ben n'a pas de clan : la popup s'ouvre", await attendreQue(() => G(() => !!document.getElementById("popup-clan")), 5000));
  const r = await G(() => ({ nom: !!document.getElementById("clan-nom"), desc: document.getElementById("clan-description") && document.getElementById("clan-description").tagName, titre: document.querySelector(".titre-popup-clan").textContent,
    ordre: (() => { const a = document.getElementById("clan-nom").getBoundingClientRect(), b = document.getElementById("clan-description").getBoundingClientRect(); return b.top > a.bottom; })() }));
  verifier("…le nom du clan, et dessous la description de sa bannière", r.nom && r.desc === "TEXTAREA" && r.ordre, JSON.stringify(r));
  const pre = await G(() => { const p = document.querySelector("#popup-clan .prefixe-clan"), i = document.getElementById("clan-nom"); if (!p) return null; const a = p.getBoundingClientRect(), b = i.getBoundingClientRect();
    return { texte: p.textContent.trim(), avant: a.right <= b.left + 1 && Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 8 }; });
  verifier("(v435) « Clan » écrit juste devant le champ du nom (il s'affichera ainsi)", pre && pre.texte === "Clan" && pre.avant, JSON.stringify(pre));
  await cap("v434-popup");
  await cliquer('#popup-clan [data-clan="fermer"]');
  await p.waitForTimeout(3500);
  verifier("fermée, elle ne revient pas pendant cette connexion", await G(() => !document.getElementById("popup-clan")));
  // Le MJ n'est pas un joueur.
  const mj = await G(async () => { const avant = localStorage.getItem("ID_JOUEUR_COURANT"); localStorage.setItem("ID_JOUEUR_COURANT", "MJ"); const ok = await window.CLANS_IVALIS.fonderClan("MJ", "X", "Y description"); localStorage.setItem("ID_JOUEUR_COURANT", avant); return ok; });
  verifier("le MJ n'a pas de clan", mj === false && await G(() => !window.__docs["Clans/MJ"]));
  verifier("à la connexion suivante (la page rechargée), elle revient : rien n'a été écrit", await G(() => !window.__docs["Clans/J1"]));
});

// =========================================================================
titre("6. FONDER LE CLAN : LE FANION PEINT PAR L'IA, LE BLANC RETIRÉ, CLOUDINARY, LA PAGE DU CLAN");
// =========================================================================
await section(async () => {
  await G(() => window.CLANS_IVALIS.ouvrirPopup());
  await p.fill("#clan-nom", "clan  Les Lames d'Héra");   // (v435) « Clan » tapé quand même : il ne compte pas deux fois
  await p.fill("#clan-description", "Une épée d'or croisée d'une plume rouge, sur fond pourpre.");
  await cliquer(".valider-clan");
  verifier("validé : la popup se ferme", await attendreQue(() => G(() => !document.getElementById("popup-clan")), 4000));
  const clan = () => G(() => window.__docs["Clans/J1"] || null);
  verifier("le clan est écrit (Clans/J1 : son nom, la description de sa bannière)", await attendreQue(async () => { const c = await clan(); return c && c.Nom_Clan === "Les Lames d'Héra" && /épée d'or/.test(c.Description_Banniere); }, 4000), JSON.stringify(await clan()));
  verifier("le fanion est dessiné, déposé, et son adresse enregistrée", await attendreQue(async () => { const c = await clan(); return c && /Clans\/fanion_/.test(c.URL_Banniere || "") && !c.Banniere_En_Cours; }, 8000), JSON.stringify(await clan()));
  const o = appels.openai[0] || {};
  verifier("l'IA : un fanion réaliste, l'emblème décrit, fond blanc uni, sans ombre, sans texte", /realistic heraldic pennant/.test(o.prompt) && /épée d'or/.test(o.prompt) && /pure flat white/.test(o.prompt) && /no shadow/.test(o.prompt) && /No text/.test(o.prompt) && o.size === "1024x1536", (o.prompt || "").slice(0, 120));
  verifier("Cloudinary reçoit l'image déjà détourée, dans « Clans »", appels.cloud.length === 1 && /Clans/.test(appels.cloud[0]) && !!fichierDepose);
  // L'image déposée : le blanc du fond est parti, le blanc brodé (au cœur du fanion) est resté ; recadrée sur le fanion.
  const px = await G(async (b64) => { const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const a = (X, Y) => x.getImageData(X, Y, 1, 1).data;
    return { w: img.width, h: img.height, coin: a(2, img.height - 3)[3], rouge: Array.from(a(Math.round(img.width / 2) - 50, Math.round(img.height / 2))), coeur: Array.from(a(130 - 40 + 20, 150 - 30 + 20)) }; }, fichierDepose);
  verifier("le fond blanc retiré (transparent), le fanion recadré (220 × 350)", px.w === 220 && px.h === 350 && px.coin === 0, JSON.stringify(px));
  verifier("…les couleurs du fanion gardées, et le blanc brodé de l'emblème aussi", px.rouge[0] > 150 && px.rouge[3] === 255 && px.coeur[0] > 240 && px.coeur[3] === 255, JSON.stringify([px.rouge, px.coeur]));
  // La page du clan.
  await G(() => window.GRIMOIRE_FICHES.allerAuxAventuriers());
  await attendreQue(() => surClan(0), 8000); await pose();
  await attendreQue(() => G(() => { const i = document.querySelector("#grimoire-fiches-clan-banniere-0 .cadre-banniere-clan img"); return i && i.complete && i.naturalWidth > 0; }), 6000);
  const pg = await G(() => { const d = document.getElementById("grimoire-fiches-clan-banniere-0"), g = document.getElementById("grimoire-fiches-clan-0");
    const pr = d.getBoundingClientRect(), img = d.querySelector(".cadre-banniere-clan img"), ir = img ? img.getBoundingClientRect() : null, nom = d.querySelector(".nom-clan"), nr = nom.getBoundingClientRect();
    const rendu = img ? (() => { const r = img.naturalWidth / img.naturalHeight, boite = ir.width / ir.height; const h = r < boite ? ir.height : ir.width / r; return { top: ir.top, h }; })() : null;
    return { src: img && img.getAttribute("src"), haut: rendu ? Math.round(rendu.top - pr.top) : -1, part: rendu ? rendu.h / pr.height : 0, nom: nom.textContent.trim(), sous: rendu ? nr.top >= rendu.top + rendu.h - 2 : false,
             gauche: g.querySelector(".titre-clan").textContent.trim() }; });
  verifier("à droite : le fanion en grand, collé en haut de la page ; (v435) il descend plus bas (74 % de la page)", /Clans\/fanion_/.test(pg.src || "") && pg.haut <= 1 && pg.part > 0.72, JSON.stringify(pg));
  verifier("…dessous « Clan Les Lames d'Héra »", pg.nom === "Clan Les Lames d'Héra" && pg.sous, pg.nom);
  verifier("à gauche, le titre « Membres du clan »", pg.gauche === "Membres du clan", pg.gauche);
  const autre = await G(() => (document.querySelector("#grimoire-fiches-clan-banniere-1 .nom-clan") || {}).textContent);
  verifier("un clan sans nom donné : « Clan » + le nom du joueur (sinon « Clan sans nom »)", /^Clan (sans nom|\S+)/.test((autre || "").trim()) && !/^Clan de /.test(autre || ""), autre);
  await cap("v434-clan");
});

// =========================================================================
titre("7. LES PARAMÈTRES : RÉINITIALISER UN CLAN (BASE ET CLOUDINARY)");
// =========================================================================
await section(async () => {
  await G(() => { window.confirm = () => true; });
  await G(() => window.GRIMOIRE_PARAMETRES.ouvrir()); await pose();
  await p.fill("#grimoire-mdp-param", "rune"); await cliquer("#grimoire-param-deverrouiller");
  await attendreQue(() => G(() => window.GRIMOIRE_PARAMETRES.vue() === "menu"), 4000);
  verifier("« Les clans » est dans les Paramètres", await G(() => !!document.querySelector('[data-action="param-ouvrir"][data-cle="clans"]')));
  await cliquer('[data-action="param-ouvrir"][data-cle="clans"]');
  await attendreQue(() => G(() => window.GRIMOIRE_PARAMETRES.vue() === "clans" && !!document.querySelector(".reinitialiser-clan")), 4000); await pose();
  const l = await G(() => [...document.querySelectorAll(".clan-parametres")].map(li => li.textContent.replace(/\s+/g, " ").trim()));
  verifier("la liste des clans : Clan Les Lames d'Héra, son fanion, « Réinitialiser »", l.length === 1 && /Clan Les Lames d'Héra/.test(l[0]) && /Réinitialiser/.test(l[0]) && await G(() => !!document.querySelector(".clan-parametres img.fanion-parametres")), JSON.stringify(l));
  await cap("v434-parametres");
  await cliquer('.reinitialiser-clan[data-id="J1"]');
  await attendreQue(() => G(() => !(window.__docs["Clans/J1"] || {}).Nom_Clan), 4000);
  const c = await G(() => window.__docs["Clans/J1"] || {});
  verifier("le nom, la description et l'adresse du fanion effacés de la base", !c.Nom_Clan && !c.Description_Banniere && !c.URL_Banniere, JSON.stringify(c));
  verifier("…et le fanion détruit sur Cloudinary", appels.detruits.length === 1 && /Clans\/fanion_1/.test(appels.detruits[0]), appels.detruits.join(" ").slice(0, 200));
  verifier("…la liste le dit", await attendreQue(() => G(() => /Aucun clan/.test(document.querySelector(".page-parametres-d").textContent) && /refondera/.test(document.querySelector(".page-parametres-g").textContent)), 3000));
  await attendreQue(() => G(() => /^Clan Ben$/.test(((document.querySelector("#grimoire-fiches-clan-banniere-0 .nom-clan") || {}).textContent || "").trim())), 5000);
  const nom = await G(() => ({ nom: document.querySelector("#grimoire-fiches-clan-banniere-0 .nom-clan").textContent.trim(), img: !!document.querySelector("#grimoire-fiches-clan-banniere-0 img") }));
  verifier("la page du clan : plus de fanion, « Clan Ben » (le nom du joueur)", nom.nom === "Clan Ben" && !nom.img, JSON.stringify(nom));
  verifier("à sa prochaine connexion, la popup reviendra (le clan n'a plus de nom)", await G(async () => { const c = await window.CLANS_IVALIS.lireClan("J1"); return !c || !c.Nom_Clan; }));
});

// =========================================================================
titre("8. UN CLAN FONDÉ SUR UN POSTE SANS CLÉS : UN POSTE QUI LES A DESSINE SON FANION");
// =========================================================================
await section(async () => {
  await G(() => { window.__docs["Clans/J2"] = { ID_Joueur: "J2", Nom_Clan: "Les Veilleurs", Description_Banniere: "Un œil d'argent sur fond noir.", URL_Banniere: "" };
    window.__docs["Clans/J3"] = { ID_Joueur: "J3", Nom_Clan: "Les Occupés", Description_Banniere: "Un marteau.", URL_Banniere: "", Banniere_En_Cours: Date.now() }; });
  const n = await G(() => window.CLANS_IVALIS.dessinerEnAttente());
  const r = await G(() => ({ j2: window.__docs["Clans/J2"].URL_Banniere, j3: window.__docs["Clans/J3"].URL_Banniere }));
  verifier("le fanion en attente est dessiné ; celui qu'un autre poste dessine déjà n'est pas repris", n === 1 && /Clans\/fanion_/.test(r.j2) && !r.j3, JSON.stringify([n, r]));
});

titre("9. LE DÉFILEMENT RAPIDE TOURNE LES PAGES PLUS VITE");
await section(async () => {
  const gj = lire("grimoire.js");
  verifier("0,07 s la page (0,12 s avant), presque sans pause", /const DEFILE = \{ tourne: 70, pause: 8,/.test(gj) && /setTimeout\(pas, DEFILE\.pause\)/.test(gj));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
