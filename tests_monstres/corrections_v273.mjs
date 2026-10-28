// v273 — LES VILLAGES DES CARTES RÉGIONALES (MIA_VILLAGE).
//
// Nico : en DEV, sur une carte régionale, un nombre et « Générer les
// villages » : des pastilles rouges carrées, semi-transparentes, au hasard
// (hors des nuages), qu'on déplace et dont on règle la taille. « Valider » :
// le carré est découpé dans la carte, une IA y dessine au centre un petit
// village antique dans le style de la carte sans toucher aux bords, le calque
// est reposé au même endroit ; le village devient un lieu en base, nommé et
// décrit par une IA selon le lore. Un grand « Patientez » pendant ce temps.
//
// Sur la VRAIE page ; Firestore en mémoire ; Gemini, OpenAI et Cloudinary
// remplacés par de faux serveurs qui ENREGISTRENT ce qu'on leur envoie : on
// vérifie la découpe, la consigne (le lore, le centre, le masque, « low »), le
// calque composé (bords transparents, couleurs accordées), la fiche en base.
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
  const corps = /map_wx8s89/.test(u) ? MONDE : /IMG_1[89]|IMG_2189/.test(u) ? REGION : `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>`;
  r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'}, body: corps });
});
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1500);
// --- LES FAUX SERVEURS D'IA ---------------------------------------------------
const appels = { gemini: [], openai: [], cloudinary: [] };
let geminiEnPanne = 0, delaiDessin = 0, numeroVillage = 0, dessinB64 = null;
const NOMS = ["Tharsys", "Ophyra", "Kalmène", "Drysos", "Phénarée", "Ilvane"];
await p.route('**generativelanguage.googleapis.com/**', async r => {
  appels.gemini.push(JSON.parse(r.request().postData() || "{}"));
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

// =========================================================================
titre("1. LE LORE, PAR RÉGION (lore_ivalis.js)");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => ({ foret: window.loreDeLaRegion(1), desert: window.loreDeLaRegion(5), pointe: window.loreDeLaRegion(10), mont: window.loreDeLaRegion(3) }));
  verifier("la forêt des murmures : les Gobs, les contrebandiers, les Gobs géants", /berceau des Gobs/.test(r.foret) && /contrebandiers/.test(r.foret) && /Gobs géants/.test(r.foret));
  verifier("le désert d'Etheria : les Éthérés nomades, la guerre avec les humains", /Éthérés/.test(r.desert) && /nomades/.test(r.desert) && /guerre/.test(r.desert));
  verifier("la pointe des sentinelles : sa cité, Arcaï (le Concordia magique)", /Arcaï/.test(r.pointe) && /Concordia magique/.test(r.pointe));
  verifier("partout : l'Ordre d'Ivalis et l'univers antique", [r.foret, r.desert, r.mont].every(t => /Ordre d'Ivalis/.test(t) && /Antique Fantastique/.test(t)));
  verifier("une région sans lore écrit le dit (l'IA reste cohérente avec le monde)", /Pas encore de lore/.test(r.mont));
});

// =========================================================================
titre("2. LES PASTILLES : AU HASARD, HORS DES NUAGES, DÉPLAÇABLES, RÉGLABLES");
// =========================================================================
await section(async () => {
  // Des nuages sur tout le tiers gauche de la carte.
  await p.evaluate(() => {
    window.choisirOutilRegion("pinceau"); window.reglerTaillePinceauRegion(120);
    const c = window.cadrageCarteRegion();
    for (let y = 0; y < innerHeight; y += 60) window.peindreCarteRegion(c.panX + 5, y, c.panX + c.largeur * c.zoom / 3, y);
    window.validerNuagesRegion();
  });
  await p.waitForTimeout(500);
  const r0 = await p.evaluate(() => ({ bloc: getComputedStyle(document.getElementById("regions-dev-villages")).display }));
  verifier("la partie « Villages » de la popup DEV paraît sur une carte régionale", r0.bloc === "block");
  const r = await p.evaluate(() => {
    const posees = window.genererPastillesVillages(5);
    const c = window.cadrageCarteRegion(), g = window.grilleNuagesRegion(), lignes = Math.round(240 * c.hauteur / c.largeur);
    const dansNuages = posees.some(p => { const cote = p.taille * c.hauteur, x0 = p.x * c.largeur - cote / 2, y0 = p.y * c.hauteur - cote / 2, cell = c.largeur / 240;
      for (let l = Math.floor(y0 / cell); l <= Math.floor((y0 + cote) / cell); l++) for (let k = Math.floor(x0 / cell); k <= Math.floor((x0 + cote) / cell); k++) if (g[l * 240 + k]) return true; return false; });
    const chevauche = posees.some((a, i) => posees.some((b, j) => i < j && Math.abs(a.x - b.x) * c.largeur < a.taille * c.hauteur && Math.abs(a.y - b.y) * c.hauteur < a.taille * c.hauteur));
    const dedans = posees.every(p => p.x * c.largeur - p.taille * c.hauteur / 2 >= 0 && p.x * c.largeur + p.taille * c.hauteur / 2 <= c.largeur && p.y - p.taille / 2 >= 0 && p.y + p.taille / 2 <= 1);
    return { n: posees.length, tailles: posees.map(p => p.taille), dansNuages, chevauche, dedans, elements: document.querySelectorAll(".pastille-village").length,
             fond: getComputedStyle(document.querySelector(".pastille-village")).backgroundColor,
             texte: document.getElementById("btn-valider-villages").textContent, actif: !document.getElementById("btn-valider-villages").disabled };
  });
  verifier("« Générer » pose 5 pastilles carrées (8 % de la hauteur)", r.n === 5 && r.elements === 5 && r.tailles.every(t => t === 0.08));
  verifier("rouges, semi-transparentes", /rgba\(214, 20, 20, 0\.35\)/.test(r.fond), r.fond);
  verifier("aucune dans les nuages, aucune sur une autre, toutes entières sur la carte", !r.dansNuages && !r.chevauche && r.dedans);
  verifier("« Créer ces 5 villages » s'allume", r.actif && /5 villages/.test(r.texte), r.texte);
  // Glisser une pastille : elle bouge, la carte non.
  const avant = await p.evaluate(() => ({ p: window.pastillesVillages()[0], c: window.cadrageCarteRegion(), r: (() => { const b = document.querySelector('.pastille-village[data-id]').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })() }));
  await p.mouse.move(avant.r.x, avant.r.y); await p.mouse.down(); await p.mouse.move(avant.r.x - 40, avant.r.y + 30, { steps: 5 }); await p.mouse.up();
  const apres = await p.evaluate(() => ({ p: window.pastillesVillages()[0], c: window.cadrageCarteRegion() }));
  verifier("glissée, la pastille bouge (et la carte reste en place)",
           Math.abs((apres.p.x - avant.p.x) * avant.c.largeur * avant.c.zoom + 40) < 2 && Math.abs((apres.p.y - avant.p.y) * avant.c.hauteur * avant.c.zoom - 30) < 2 && apres.c.panX === avant.c.panX,
           JSON.stringify([avant.p, apres.p]));
  const coin = await p.evaluate(() => { const b = document.querySelector('.pastille-village .pastille-village-poignee').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await p.mouse.move(coin.x, coin.y); await p.mouse.down(); await p.mouse.move(coin.x + 20, coin.y - 20, { steps: 4 }); await p.mouse.up();
  const grandie = await p.evaluate(() => window.pastillesVillages()[0].taille);
  verifier("le carré du coin l'agrandit", grandie > 0.08 + 0.02, `${grandie.toFixed(3)}`);
  // Retirer, puis n'en garder que deux pour la suite.
  await p.evaluate(() => { window.retirerPastillesVillages(); });
  const vide = await p.evaluate(() => window.pastillesVillages().length);
  verifier("« Retirer les pastilles » les enlève toutes", vide === 0);
  await p.evaluate(() => { let n = 7; window.genererPastillesVillages(2, () => { n = (n * 16807) % 2147483647; return n / 2147483647; }); });
});

// =========================================================================
titre("3. LA CRÉATION : PATIENTEZ, MIA_VILLAGE, LE CALQUE, LA FICHE");
// =========================================================================
let lot = [];
await section(async () => {
  lot = await p.evaluate(() => window.pastillesVillages());
  await p.evaluate(() => { window.__ecrits = []; });
  delaiDessin = 500;
  const fin = p.evaluate(() => window.creerVillagesRegion());
  await p.waitForTimeout(250);
  const pendant = await p.evaluate(() => { const v = document.getElementById("attente-villages"); return v && { d: getComputedStyle(v).display, t: v.textContent, z: Number(getComputedStyle(v).zIndex) }; });
  verifier("un grand « Patientez » au milieu de l'écran pendant la création", !!pendant && pendant.d === "flex" && /Patientez/.test(pendant.t) && /Village 1 sur 2/.test(pendant.t) && pendant.z >= 20000,
           pendant && pendant.t);
  const res = await fin;
  delaiDessin = 0;
  await p.waitForTimeout(500);
  const r = await p.evaluate(() => ({ attente: getComputedStyle(document.getElementById("attente-villages")).display,
    pastilles: window.pastillesVillages().length, ecrits: window.__ecrits.filter(e => /^Monde_Lieux\//.test(e.chemin)),
    villages: [...document.querySelectorAll(".village-region")].map(e => e.dataset.id), etat: document.getElementById("villages-dev-etat").textContent }));
  verifier("deux villages créés, sans échec ; le « Patientez » s'en va", res.crees.length === 2 && res.echecs.length === 0 && r.attente === "none", r.etat);
  verifier("les pastilles validées disparaissent, les villages paraissent", r.pastilles === 0 && r.villages.length === 2);
  const f = r.ecrits[0] && r.ecrits[0].data;
  verifier("chaque village entre en base comme un lieu (Monde_Lieux/L_…)", r.ecrits.length === 2 && r.ecrits.every(e => /^Monde_Lieux\/L_\d{5}_/.test(e.chemin)), r.ecrits.map(e => e.chemin).join(" "));
  verifier("…nommé, décrit, avec sa sécurité et son peuple (MIA_VILLAGE, Gemini)", !!f && f.Nom_Du_Lieu === "Tharsys" && /Gobs/.test(f.Description_Global) && f.Niveau_De_Securite === "Moyenne" && f.Peuple_Dominant === "Gobs" && f.Type_Lieu === "Village");
  verifier("…rattaché à sa carte et à sa place (celle de la pastille)", !!f && f.Carte_Regionale === 1 && Math.abs(f.Position_Region.x - lot[0].x) < 1e-4 && Math.abs(f.Position_Region.y - lot[0].y) < 1e-4 && f.Position_Region.taille === lot[0].taille);
  verifier("…avec son calque (Cloudinary), sans image de lieu pour le RP, hors de la carte du monde",
           !!f && /res\.cloudinary\.com\/demo\/image\/upload\/q_auto,f_auto\/v1\/Villages_Regions\/village_1\.png/.test(f.URL_Calque_Region) && f.URL_Cloudinary === "" && !("Tuile_ID" in f));
});

// =========================================================================
titre("4. CE QU'ON ENVOIE AUX IA");
// =========================================================================
await section(async () => {
  const g = appels.gemini[0] || {}, consigne = ((g.systemInstruction || {}).parts || [{}])[0].text || "";
  verifier("Gemini reçoit le lore de la région (les Gobs, les contrebandiers) et l'Ordre d'Ivalis", /berceau des Gobs/.test(consigne) && /contrebandiers/.test(consigne) && /Ordre d'Ivalis/.test(consigne));
  const g2 = appels.gemini[1] || {}, consigne2 = ((g2.systemInstruction || {}).parts || [{}])[0].text || "";
  verifier("…et les noms déjà posés sur la carte (pas deux fois le même village)", /Tharsys/.test(consigne2));
  const o = appels.openai[0] || { corps: "" };
  const champ = (nom) => (o.corps.match(new RegExp(`name="${nom.replace(/[[\]]/g, "\\$&")}"(?:; filename="[^"]*")?\\r\\n(?:Content-Type: [^\\r]*\\r\\n)?\\r\\n([^\\r]*)`)) || [])[1];
  verifier("OpenAI : une retouche (images/edits), gpt-image-2, qualité « low », 1024 × 1024", /\/v1\/images\/edits$/.test(o.url) && champ("model") === "gpt-image-2" && champ("quality") === "low" && champ("size") === "1024x1024");
  verifier("…avec le carré découpé (image[]) et le masque du centre", /name="image\[\]"; filename="carte\.png"/.test(o.corps) && /name="mask"; filename="masque\.png"/.test(o.corps));
  const prompt = champ("prompt") || "";
  verifier("…une consigne : au centre, le style de la carte, les bords intacts, le visuel inventé", /CENTER/.test(prompt) && /art style of the map/.test(prompt) && /edges must stay identical/.test(prompt) && /mossy wooden huts/.test(prompt));
  // Le masque : transparent au cœur, opaque aux bords.
  const m = await p.evaluate(() => { const t = window.masqueCentreVillage(); const d = t.getContext("2d").getImageData(0, 0, 1024, 1024).data; const a = (x, y) => d[(y * 1024 + x) * 4 + 3]; return { centre: a(512, 512), bord: a(10, 512), coin: a(5, 5), mi: a(512, 250) }; });
  verifier("le masque : le cœur est à dessiner, les bords protégés", m.centre === 0 && m.mi === 0 && m.bord === 255 && m.coin === 255, JSON.stringify(m));
});

// =========================================================================
titre("5. LE CALQUE : LES BORDS NE BOUGENT PAS, LES COULEURS S'ACCORDENT");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async (b64) => {
    const img = new Image(); img.src = b64; await img.decode();
    const t = document.createElement("canvas"); t.width = img.width; t.height = img.height; const x = t.getContext("2d"); x.drawImage(img, 0, 0);
    const n = img.width, a = (i, j) => x.getImageData(i, j, 1, 1).data;
    const bande = []; for (let k = 0; k < n; k += Math.max(1, n >> 5)) { bande.push(a(k, 1)[3], a(1, k)[3], a(k, n - 2)[3], a(n - 2, k)[3]); }
    return { n, centre: Array.from(a(n >> 1, n >> 1)), bandeMax: Math.max(...bande), sol: Array.from(a(Math.round(n * 0.3), Math.round(n * 0.5))) };
  }, appels.cloudinary[0].fichier);
  verifier("le calque est un carré", r.n >= 256 && r.n <= 1024, `${r.n} px`);
  verifier("ses bords sont entièrement transparents : la carte d'origine s'y voit telle quelle", r.bandeMax === 0, `alpha max au bord ${r.bandeMax}`);
  verifier("son centre est plein (le village dessiné)", r.centre[3] === 255, JSON.stringify(r.centre));
  // L'accord des couleurs, mesuré à part : une carte grise (100) et un dessin
  // trop clair (120) — le dessin est ramené à la carte.
  const g = await p.evaluate(() => {
    const plein = (v) => { const t = document.createElement("canvas"); t.width = t.height = 1024; const x = t.getContext("2d"); x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(0, 0, 1024, 1024); return t; };
    const { toile, gain } = window.composerCalqueVillage(plein(120), plein(100), 512);
    const d = toile.getContext("2d").getImageData(256, 256, 1, 1).data;
    return { gain, centre: Array.from(d) };
  });
  verifier("les couleurs du dessin sont accordées à celles de la carte autour", g.gain.every(v => Math.abs(v - 100 / 120) < 0.01) && Math.abs(g.centre[0] - 100) <= 1, JSON.stringify(g));
  // La découpe : le carré envoyé est bien le morceau de carte sous la pastille.
  const d = await p.evaluate(() => {
    const v = Object.values(window.VILLAGES_REGIONAUX)[0], c = window.cadrageCarteRegion();
    const el = document.querySelector(`.village-region[data-id="${v.id}"]`).getBoundingClientRect();
    return { attendu: { x: c.panX + v.x * c.largeur * c.zoom, y: c.panY + v.y * c.hauteur * c.zoom, cote: v.taille * c.hauteur * c.zoom },
             obtenu: { x: el.left + el.width / 2, y: el.top + el.height / 2, cote: el.width } };
  });
  verifier("le calque est reposé exactement à la place de la pastille", Math.abs(d.attendu.x - d.obtenu.x) < 1 && Math.abs(d.attendu.y - d.obtenu.y) < 1 && Math.abs(d.attendu.cote - d.obtenu.cote) < 1, JSON.stringify(d));
});

// =========================================================================
titre("6. EN JEU : LE NOM AU SURVOL ; SOUS LES NUAGES, RIEN");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    localStorage.removeItem("ivalis_DEV_MODE"); window.actualiserRegionsDev();
    const v = Object.values(window.VILLAGES_REGIONAUX)[0];
    const el = document.querySelector(`.village-region[data-id="${v.id}"]`);
    el.dispatchEvent(new PointerEvent("pointerenter", { clientX: 300, clientY: 300 }));
    const tip = document.getElementById("tooltip-lieu-map");
    const sortie = { nom: v.nom, tip: tip && tip.style.display, texte: tip && document.getElementById("tooltip-lieu-nom").textContent, sansImage: !!tip && tip.classList.contains("sans-image") && tip.offsetHeight < 80, pastilles: document.querySelectorAll(".pastille-village").length,
                     popup: getComputedStyle(document.getElementById("regions-dev-villages")).display };
    el.dispatchEvent(new PointerEvent("pointerleave"));
    sortie.apres = tip && tip.style.display;
    // Un village posé sous les nuages (la base le dit) : caché, muet.
    const cache = { ...Object.values(window.VILLAGES_REGIONAUX)[0] };
    window.appliquerVillagesDeLaBase([...Object.values(window.VILLAGES_REGIONAUX).map(x => ({ id: x.id, data: { Nom_Du_Lieu: x.nom, Carte_Regionale: 1, Position_Region: { x: x.x, y: x.y, taille: x.taille }, URL_Calque_Region: x.calque } })),
      { id: "L_99999_Sous_les_nuages", data: { Nom_Du_Lieu: "Sous les nuages", Carte_Regionale: 1, Position_Region: { x: 0.08, y: 0.5, taille: 0.08 }, URL_Calque_Region: cache.calque } }]);
    const elCache = document.querySelector('.village-region[data-id="L_99999_Sous_les_nuages"]');
    sortie.cache = elCache && elCache.classList.contains("cache") && getComputedStyle(elCache).pointerEvents === "none";
    // Un village d'une autre carte ne s'affiche pas ici.
    window.appliquerVillagesDeLaBase([{ id: "L_88888_Ailleurs", data: { Nom_Du_Lieu: "Ailleurs", Carte_Regionale: 5, Position_Region: { x: 0.5, y: 0.5, taille: 0.08 }, URL_Calque_Region: "x" } }]);
    sortie.ailleurs = document.querySelectorAll(".village-region").length;
    localStorage.setItem("ivalis_DEV_MODE", "on"); window.actualiserRegionsDev();
    return sortie;
  });
  verifier("le survol d'un village dit son nom (l'infobulle des lieux, en étiquette sans image)", r.tip === "block" && r.texte === r.nom && r.sansImage, r.texte);
  verifier("…et s'efface en partant", r.apres === "none");
  verifier("hors DEV : ni pastilles, ni outils de villages", r.pastilles === 0 && r.popup === "none");
  verifier("un village sous les nuages est caché, sans nom au survol", r.cache === true);
  verifier("le village d'une autre carte ne s'affiche pas ici", r.ailleurs === 0);
});

// =========================================================================
titre("7. EN DEV : CHOISIR, REDESSINER, SUPPRIMER ; LES PANNES");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.appliquerVillagesDeLaBase([{ id: "L_11111_Tharsys", data: { Nom_Du_Lieu: "Tharsys", Carte_Regionale: 1, Peuple_Dominant: "Gobs", Niveau_De_Securite: "Moyenne",
    Visuel_Village: "huts", Position_Region: { x: 0.6, y: 0.5, taille: 0.1 }, URL_Calque_Region: "https://res.cloudinary.com/demo/image/upload/v1/Villages_Regions/village_1.png" } }]));
  const b = await p.evaluate(() => { const r = document.querySelector('.village-region[data-id="L_11111_Tharsys"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.click(b.x, b.y);
  const r = await p.evaluate(() => ({ info: document.getElementById("villages-dev-selection").textContent, sel: document.querySelector(".village-region.selectionne") && document.querySelector(".village-region.selectionne").dataset.id,
    redessiner: !document.getElementById("btn-village-redessiner").disabled, supprimer: !document.getElementById("btn-village-supprimer").disabled }));
  verifier("un clic choisit le village (son nom, son peuple, sa sécurité)", r.sel === "L_11111_Tharsys" && /Tharsys/.test(r.info) && /Gobs/.test(r.info) && r.redessiner && r.supprimer, r.info);
  const nAvant = appels.openai.length, gAvant = appels.gemini.length;
  await p.evaluate(() => { window.__ecrits = []; return window.redessinerVillageRegion(); });
  const r2 = await p.evaluate(() => ({ e: window.__ecrits.filter(e => e.chemin === "Monde_Lieux/L_11111_Tharsys").pop(), v: window.VILLAGES_REGIONAUX["L_11111_Tharsys"] }));
  verifier("« Redessiner » : un nouveau dessin, le même village (pas de nouveau nom)", appels.openai.length === nAvant + 1 && appels.gemini.length === gAvant
           && !!r2.e && r2.e.options && r2.e.options.merge && Object.keys(r2.e.data).join() === "URL_Calque_Region" && r2.v.calque === r2.e.data.URL_Calque_Region && r2.v.nom === "Tharsys");
  await p.evaluate(() => window.supprimerVillageRegion());
  const r3 = await p.evaluate(() => ({ s: window.__suppressions || [], reste: document.querySelectorAll('.village-region[data-id="L_11111_Tharsys"]').length }));
  verifier("« Supprimer » : il quitte la carte et la base", r3.s.includes("Monde_Lieux/L_11111_Tharsys") && r3.reste === 0);
  // Une panne de Gemini sur le premier : le second se fait, la pastille ratée reste.
  geminiEnPanne = 1;
  const res = await p.evaluate(async () => { let n = 3; window.genererPastillesVillages(2, () => { n = (n * 16807) % 2147483647; return n / 2147483647; }); return window.creerVillagesRegion(); });
  const reste = await p.evaluate(() => window.pastillesVillages().length);
  verifier("une panne n'arrête pas le lot : 1 créé, 1 échec, sa pastille reste à revalider", res.crees.length === 1 && res.echecs.length === 1 && reste === 1 && /Gemini a répondu 500/.test(res.echecs[0].erreur), JSON.stringify(res.echecs));
  // Sans les clés : rien ne part.
  const r4 = await p.evaluate(async () => { localStorage.removeItem("ivalis_OPENAI_API_KEY"); const n = window.pastillesVillages().length; const res = await window.creerVillagesRegion();
    localStorage.setItem("ivalis_OPENAI_API_KEY", "cle"); return { res, n, etat: document.getElementById("villages-dev-etat").textContent }; });
  verifier("sans clé OpenAI : rien n'est envoyé, la popup dit ce qui manque", r4.res.crees.length === 0 && /OpenAI/.test(r4.etat), r4.etat);
  // En quittant la carte, les pastilles d'une carte ne la suivent pas ailleurs.
  await p.evaluate(() => window.fermerCarteRegionale({ sansTransition: true }));
  const r5 = await p.evaluate(() => window.pastillesVillages().length);
  verifier("fermer la carte retire ses pastilles non validées", r5 === 0);
});

// =========================================================================
titre("8. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json')).version;
  verifier("version 273 ou plus (trace_combat.js, version.json)", vTrace >= 273 && vJson === vTrace, `${vTrace} / ${vJson}`);
  verifier("lore_ivalis.js et villages_regionaux.js chargés après les cartes régionales",
           /cartes_regionales\.js\?v=\d+[\s\S]*lore_ivalis\.js\?v=\d+[\s\S]*villages_regionaux\.js\?v=\d+/.test(html) && Number((html.match(/style\.css\?v=(\d+)/) || [])[1]) >= 104);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
