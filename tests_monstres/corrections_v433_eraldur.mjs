// v433 — ERALDUR, LE VILLAGE DES AVENTURIERS (villages_regionaux.js).
// Nico : « dans le bouton DEV des maps, un bouton pour créer spécialement le village d'Eraldur sur la map ; une box
// pour choisir son emplacement ; ça dessine un petit village antique sans murs sur la carte avec son nom, et ça le crée
// dans la base. Ce village servira de hub pour les joueurs. » « Un village tranquille, sans rien de trop particulier,
// où il fait bon vivre ; les joueurs y seront toujours bien vus ; dirigé par la guilde d'Ivalis ; toutes les races. »
// Le décor et les faux serveurs d'IA : ceux de corrections_v273.mjs.
// Lancer : node tests_monstres/corrections_v433_eraldur.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(76)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const titre = (t) => console.log("\n" + t);
const section = async (corps) => { try { await corps(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 140)); } };
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf-8');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' }); res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({}); export const getApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, ...c) => ({ col: c.join("/") });
  const docs = () => (window.__docs = window.__docs || {});
  export const getDoc = async (ref) => { const d = docs()[ref.chemin]; return { exists: () => !!d, data: () => JSON.parse(JSON.stringify(d || {})) }; };
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data: JSON.parse(JSON.stringify(data)), options }); };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data }); };
  export const deleteDoc = async (ref) => { (window.__suppressions = window.__suppressions || []).push(ref.chemin); }; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a}); export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
  export const writeBatch = () => ({ set(){}, update(){}, delete(){}, commit: async () => {} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
// Une carte du monde et des cartes régionales de démonstration.
const MONDE = `<svg xmlns="http://www.w3.org/2000/svg" width="3840" height="2160"><defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f7a9a"/><stop offset="1" stop-color="#2d4a63"/></linearGradient></defs><rect width="3840" height="2160" fill="url(#m)"/><path d="M600 500 C1200 300 2200 400 3000 800 C3400 1300 2800 1900 1900 1800 C1000 1750 300 1300 600 500Z" fill="#b9a46a"/><path d="M900 700 C1300 600 1500 800 1400 1000 C1200 1150 900 1050 900 700Z" fill="#3f6b34"/><text x="1150" y="880" font-size="60" fill="#fff" font-family="serif">Forêt</text></svg>`;
const REGION = `<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1500"><defs><radialGradient id="r" cx="0.5" cy="0.5" r="0.7"><stop offset="0" stop-color="#6f9a4f"/><stop offset="1" stop-color="#2f4d26"/></radialGradient></defs><rect width="2400" height="1500" fill="url(#r)"/>${Array.from({length:60},(_,i)=>`<circle cx="${(i*397)%2400}" cy="${(i*263)%1500}" r="${30+(i*17)%60}" fill="#244a1c" opacity="0.8"/>`).join("")}<path d="M0 1100 C600 1000 1200 1250 2400 1050" stroke="#3b6fa0" stroke-width="40" fill="none"/><rect x="1500" y="420" width="120" height="90" fill="#8a5a33"/></svg>`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => {
  const u = r.request().url();
  const corps = /map_wx8s89/.test(u) ? MONDE : /IMG_1[89]|IMG_2189|IMG_22(29|30|31)/.test(u) ? REGION : `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>`;
  r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'}, body: corps });
});
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);
// --- LES FAUX SERVEURS D'IA ---------------------------------------------------
const appels = { gemini: [], openai: [], cloudinary: [], terrain: [] };
let geminiEnPanne = 0, delaiDessin = 0, numeroVillage = 0, dessinB64 = null;
const NOMS = ["Tharsys", "Ophyra", "Kalmène", "Drysos", "Phénarée", "Ilvane"];
await p.route('**generativelanguage.googleapis.com/**', async r => {
  const corpsGemini = JSON.parse(r.request().postData() || "{}");
  // (v339) Avant d'inventer un village, MIA_TERRAIN lit la carte sous la pastille (une image
  // jointe, pas d'instruction système) : on lui répond un terrain, sans compter un village.
  if (!corpsGemini.systemInstruction) {
    appels.terrain.push(corpsGemini);
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ terrain: "forêt dense", sous_le_groupe: "Des fougères sous de grands chênes.", resume_mj: "Une forêt dense." }) }] } }] }) });
  }
  appels.gemini.push(corpsGemini);
  if (/Eraldur/.test(JSON.stringify(corpsGemini.systemInstruction))) {
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ description: "Eraldur, un village paisible où toutes les races vivent ensemble autour du Hall de la guilde d'Ivalis.",
        visuel: "an open village without walls, houses and gardens around a square with a large guild hall" }) }] } }] }) });
  }
  if (geminiEnPanne > 0) { geminiEnPanne--; return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"panne"}' }); }
  const nom = NOMS[numeroVillage++ % NOMS.length];
  const v = { nom, description: `Un village de Gobs, ${nom}, caché sous les frondaisons.`, securite: "Moyenne", peuple: "Gobs",
              visuel: `a cluster of mossy wooden huts on stilts around a fire pit (${nom})` };
  r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(v) }] } }] }) });
});
await p.route('**api.openai.com/**', async r => {
  const corps = r.request().postDataBuffer() || Buffer.alloc(0);
  appels.openai.push({ url: r.request().url(), corps: corps.toString('latin1') });
  if (delaiDessin) await new Promise(res => setTimeout(res, delaiDessin));
  r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ data: [{ b64_json: dessinB64 }] }) });
});
const heberges = {};
await p.route('**api.cloudinary.com/**', async r => {
  const corps = (r.request().postDataBuffer() || Buffer.alloc(0)).toString('latin1');
  const fichier = (corps.match(/name="file"\r\n\r\n(data:image\/png;base64,[A-Za-z0-9+/=]+)/) || [])[1] || "";
  const nom = "village_" + (appels.cloudinary.length + 1);
  appels.cloudinary.push({ corps, fichier });
  heberges[nom] = fichier;
  r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({ secure_url: `https://res.cloudinary.com/demo/image/upload/v1/Villages_Regions/${nom}.png` }) });
});
// Les calques hébergés reviennent tels qu'envoyés (avant la route générique).
await p.route('**res.cloudinary.com/demo/**', r => {
  const nom = (r.request().url().match(/(village_\d+)\.png/) || [])[1];
  const b64 = ((heberges[nom] || "").split(",")[1]) || "";
  r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: Buffer.from(b64, 'base64') });
});

await p.evaluate(() => {
  window.jouerSonClic = () => {}; window.confirm = () => true;
  ["GEMINI_API_KEY", "OPENAI_API_KEY", "CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"].forEach(k => localStorage.setItem("ivalis_" + k, "cle-" + k));
  localStorage.setItem("ivalis_DEV_MODE", "on");
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => e.style.display = e.id === "ecran-jeu" ? "block" : "none");
  window.recadrerCarte();
  if (typeof window.actualiserRegionsDev === "function") window.actualiserRegionsDev();
  window.appliquerRegionsDeLaBase({ Prochain_Numero: 14, Regions: { 1: { Numero: 1, Points: [{ x: 850, y: 620 }, { x: 1450, y: 620 }, { x: 1450, y: 1080 }, { x: 850, y: 1080 }] } } });
  if (typeof window.appliquerCartesRegionalesDeLaBase === "function") window.appliquerCartesRegionalesDeLaBase([]);
  if (typeof window.appliquerVillagesDeLaBase === "function") window.appliquerVillagesDeLaBase([]);
});
// Le « dessin » de l'IA : un terrain vert un peu trop clair (l'accord des
// couleurs doit le ramener), et des huttes brunes au centre.
dessinB64 = await p.evaluate(() => {
  const t = document.createElement("canvas"); t.width = t.height = 1024; const x = t.getContext("2d");
  x.fillStyle = "rgb(130, 170, 100)"; x.fillRect(0, 0, 1024, 1024);
  x.fillStyle = "rgb(110, 70, 40)"; for (let i = 0; i < 9; i++) x.fillRect(400 + (i % 3) * 80, 400 + Math.floor(i / 3) * 80, 52, 40);
  return t.toDataURL("image/png").split(",")[1];
});
await p.evaluate(() => window.ouvrirCarteRegionale(1, { sansTransition: true }));
await p.waitForTimeout(600);


const etat = () => p.evaluate(() => ({ pastilles: window.pastillesVillages(), poser: document.getElementById("btn-eraldur-poser"), creer: document.getElementById("btn-eraldur-creer") }))
  .catch(() => null);
const boutons = () => p.evaluate(() => { const t = (id) => { const b = document.getElementById(id); return b ? { texte: b.textContent.trim(), actif: !b.disabled } : null; };
  return { poser: t("btn-eraldur-poser"), creer: t("btn-eraldur-creer"), villages: t("btn-valider-villages"), info: (document.getElementById("eraldur-dev-etat") || {}).textContent || "" }; });

// =========================================================================
titre("1. LE BOUTON DEV : « PLACER ERALDUR », UNE PASTILLE DORÉE AU CENTRE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.actualiserDevVillages());
  let bt = await boutons();
  verifier("la popup DEV des cartes régionales a « Placer Eraldur » (« Créer » éteint)", !!bt.poser && bt.poser.texte === "Placer Eraldur" && bt.poser.actif && !!bt.creer && !bt.creer.actif, JSON.stringify(bt));
  await p.evaluate(() => document.getElementById("btn-eraldur-poser").click());
  const r = await p.evaluate(() => { const el = document.querySelector(".pastille-village.eraldur"); const ps = window.pastillesVillages();
    return { n: ps.length, e: ps.find(x => x.eraldur), el: !!el, fond: el ? getComputedStyle(el).backgroundColor : "", nom: el ? el.textContent : "" }; });
  verifier("une pastille dorée, au centre de la carte, un peu plus grande qu'un hameau (6 %)", r.n === 1 && r.e && r.e.x === 0.5 && r.e.y === 0.5 && r.e.taille === 0.06 && /rgba\(214, 170, 40/.test(r.fond), JSON.stringify(r));
  verifier("…son nom écrit dessus", /Eraldur/.test(r.nom), r.nom);
  bt = await boutons();
  verifier("« Créer Eraldur » s'allume ; « Créer ce village » reste éteint (elle n'en est pas un)", bt.creer.actif && bt.creer.texte === "Créer Eraldur" && !bt.villages.actif, JSON.stringify(bt));
  // On la glisse : comme les autres pastilles.
  const c = await p.evaluate(() => { const b = document.querySelector(".pastille-village.eraldur").getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x + 60, c.y - 30, { steps: 5 }); await p.mouse.up();
  const apres = await p.evaluate(() => window.pastillesVillages().find(x => x.eraldur));
  verifier("…et elle se glisse où l'on veut", apres.x > 0.5 && apres.y < 0.5, JSON.stringify(apres));
});

// =========================================================================
titre("2. « CRÉER ERALDUR » : LA DESCRIPTION, LE DESSIN SANS MURS, LA FICHE EN BASE, SON NOM SUR LA CARTE");
// =========================================================================
let idEraldur = "";
await section(async () => {
  const n = { g: appels.gemini.length, o: appels.openai.length };
  const v = await p.evaluate(() => window.creerEraldur());
  idEraldur = v && v.id;
  const g = appels.gemini.slice(n.g).map(x => JSON.stringify(x.systemInstruction)).join(" ");
  verifier("MIA_VILLAGE décrit Eraldur : tranquille, la guilde d'Ivalis, toutes les races, sans murs, bien accueillis",
           /Eraldur/.test(g) && /tranquille/.test(g) && /guilde d'Ivalis/.test(g) && /TOUTES les races/.test(g) && /SANS MURS/.test(g) && /bien accueillis/.test(g), g.slice(0, 200));
  const o = appels.openai.slice(n.o)[0] || { corps: "" };
  verifier("le dessin : un petit village antique ouvert, SANS MURS, au centre du carré", /WITHOUT ANY WALLS/.test(o.corps) && /guild hall/.test(o.corps), o.corps.slice(0, 0));
  const ecrit = await p.evaluate((id) => (window.__ecrits || []).filter(e => e.chemin === "Monde_Lieux/" + id).pop(), idEraldur);
  const d = (ecrit || {}).data || {};
  verifier("la fiche en base (Monde_Lieux) : Eraldur, le hub, dirigé par la guilde, toutes les races, sécurité élevée",
           d.Nom_Du_Lieu === "Eraldur" && d.Hub_Aventuriers === true && d.Dirige_Par === "La guilde d'Ivalis" && d.Peuple_Dominant === "Toutes les races"
           && d.Niveau_De_Securite === "Élevée" && d.Type_Lieu === "Village" && d.Carte_Regionale === 1 && /toutes les races/.test(d.Description_Global), JSON.stringify(d).slice(0, 300));
  verifier("…les aventuriers y sont toujours bien vus (Reputation_Min 5) ; la place de la pastille, le calque", d.Reputation_Min === 5 && d.Position_Region && d.Position_Region.taille === 0.06 && /Villages_Regions/.test(d.URL_Calque_Region || ""), JSON.stringify(d.Position_Region));
  const carte = await p.evaluate((id) => { const el = document.querySelector(`.village-region[data-id="${id}"]`);
    return { el: !!el, nom: el ? (el.querySelector(".village-nom textPath") || {}).textContent : "", pastille: !!document.querySelector(".pastille-village.eraldur") }; }, idEraldur);
  verifier("sur la carte : le dessin, et « Eraldur » écrit dessous ; la pastille est partie", carte.el && carte.nom === "Eraldur" && !carte.pastille, JSON.stringify(carte));
  const bt = await boutons();
  verifier("le bouton devient « Déplacer Eraldur »", bt.poser.texte === "Déplacer Eraldur" && /Eraldur existe/.test(bt.info), JSON.stringify(bt));
});

// =========================================================================
titre("3. UN SEUL ERALDUR : LE DÉPLACER, LE REDESSINER");
// =========================================================================
await section(async () => {
  const pose = await p.evaluate(() => window.poserPastilleEraldur());
  const v = await p.evaluate((id) => window.VILLAGES_REGIONAUX[id], idEraldur);
  verifier("« Déplacer Eraldur » : sa pastille reprend sa place actuelle", pose && Math.abs(pose.x - v.x) < 1e-4 && Math.abs(pose.y - v.y) < 1e-4, JSON.stringify([pose, v && [v.x, v.y]]));
  await p.evaluate(() => { const ps = window.pastillesVillages(); });
  await p.evaluate(() => { const e = window.pastillesVillages().find(x => x.eraldur); });
  const n = { g: appels.gemini.filter(x => /Eraldur/.test(JSON.stringify(x.systemInstruction))).length, o: appels.openai.length };
  const bt = await boutons();
  verifier("…et « Redessiner Eraldur ici »", bt.creer.texte === "Redessiner Eraldur ici" && bt.creer.actif, JSON.stringify(bt));
  const v2 = await p.evaluate(() => window.creerEraldur());
  const ecrits = await p.evaluate(() => (window.__ecrits || []).filter(e => /^Monde_Lieux\//.test(e.chemin)).map(e => ({ chemin: e.chemin, merge: !!(e.options && e.options.merge) })));
  verifier("le même lieu (le même identifiant), écrit en fusion : ni second Eraldur, ni réputation perdue", v2 && v2.id === idEraldur && ecrits.filter(e => e.chemin === "Monde_Lieux/" + idEraldur).length === 2
           && ecrits[ecrits.length - 1].merge && new Set(ecrits.map(e => e.chemin)).size === 1, JSON.stringify(ecrits));
  verifier("…sa description gardée (pas de nouvelle IA du texte), un nouveau dessin", appels.gemini.filter(x => /Eraldur/.test(JSON.stringify(x.systemInstruction))).length === n.g && appels.openai.length === n.o + 1);
});

// =========================================================================
titre("4. EN JEU : UN TOUCHER SUR ERALDUR OUVRE « LE VILLAGE » DU LIVRE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { localStorage.setItem("ivalis_DEV_MODE", "off"); window.__village = 0; window.__apercu = 0;
    window.GRIMOIRE = window.GRIMOIRE || {}; window.GRIMOIRE.allerAuVillage = () => { window.__village++; }; window.afficherApercuLieu = () => { window.__apercu++; };
    window.dessinerVillagesRegion(); });
  const c = await p.evaluate((id) => { const b = document.querySelector(`.village-region[data-id="${id}"]`).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, idEraldur);
  await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.up();
  const r = await p.evaluate(() => ({ village: window.__village, apercu: window.__apercu }));
  verifier("le toucher mène à la double page du village (pas à l'aperçu d'un lieu)", r.village === 1 && r.apercu === 0, JSON.stringify(r));
  await p.evaluate(() => localStorage.setItem("ivalis_DEV_MODE", "on"));
});

// =========================================================================
titre("5. LES AVENTURIERS Y SONT TOUJOURS BIEN VUS (Reputation_Min)");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => {
    window.__docs = window.__docs || {};
    window.__docs["Monde_Lieux/L_E"] = { Nom_Du_Lieu: "Eraldur", Reputation_Min: 5, Reputations: { P1: { Score: -6, Tags: ["Voleurs"] } } };
    window.__docs["Monde_Lieux/L_A"] = { Nom_Du_Lieu: "Ailleurs", Reputations: { P1: { Score: -6, Tags: [] } } };
    window.ID_PARTIE_COURANTE = "P1";
    window.PARTIE_DATA = { Lieu_Actuel: "L_E" };
    const e = await window.GROUPE.etatPourLeLivre();
    window.PARTIE_DATA = { Lieu_Actuel: "L_A" };
    const a = await window.GROUPE.etatPourLeLivre();
    return { eraldur: e.lieu && e.lieu.reputation, ailleurs: a.lieu && a.lieu.reputation };
  });
  verifier("à Eraldur, même après des bêtises (−6) : bien vus (5) ; ailleurs, −6", r.eraldur === 5 && r.ailleurs === -6, JSON.stringify(r));
  const ia = lire("ia_master.js");
  verifier("le MJ et MIA_REPUTATION lisent le même plancher (jamais sous Reputation_Min)",
           (ia.match(/Reputation_Min/g) || []).length >= 3 && /Math\.max\(Number\(appelsOutils\[0\]\.args\.nouveau_score\) \|\| 0, plancher\)/.test(ia));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
