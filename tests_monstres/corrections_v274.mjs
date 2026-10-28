// v274 — LES DESCRIPTIFS RP DES RÉGIONS.
//
// Nico : une base pour le descriptif RP de chaque région (que l'IA maître du
// jeu lira plus tard) ; dans l'outil DEV rouge de la carte du monde, un bouton
// pour éditer ces descriptifs ; un contour rouge autour de l'écran dans ce
// mode, les autres modes DEV coupés ; un clic sur une région ouvre une fenêtre
// pleine page (le titre, une grande zone de texte reliée à la base) au lieu de
// sa carte ; un bouton pour la fermer.
//
// Sur la VRAIE page, Firestore en mémoire.
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
await p.evaluate(() => {
  window.jouerSonClic = () => {}; window.confirm = () => true;
  localStorage.setItem("ivalis_DEV_MODE", "on");
  localStorage.setItem("ivalis_REGIONS_VISIBLES", "on");
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => e.style.display = e.id === "ecran-jeu" ? "block" : "none");
  window.recadrerCarte();
  if (typeof window.actualiserRegionsDev === "function") window.actualiserRegionsDev();
  window.appliquerRegionsDeLaBase({ Prochain_Numero: 16, Regions: {
    1: { Numero: 1, Points: [{ x: 850, y: 620 }, { x: 1450, y: 620 }, { x: 1450, y: 1080 }, { x: 850, y: 1080 }] },
    4: { Numero: 4, Points: [{ x: 1700, y: 900 }, { x: 2100, y: 900 }, { x: 2100, y: 1300 }, { x: 1700, y: 1300 }] },
    15: { Numero: 15, Points: [{ x: 1500, y: 1500 }, { x: 1900, y: 1500 }, { x: 1900, y: 1800 }, { x: 1500, y: 1800 }] } } });
  if (typeof window.appliquerCartesRegionalesDeLaBase === "function")
    window.appliquerCartesRegionalesDeLaBase([{ id: "1", data: { Numero: 1, Nom: "La forêt des murmures", Description: "Les Gobs y vivent sous les frondaisons." } }]);
  window.basculerPopupRegions(true);
});
await p.waitForTimeout(300);
const ecranDe = (numero) => p.evaluate((n) => { const c = window.centreRegion(window.REGIONS_CARTE[n].points); const r = document.getElementById("carte-fond-jeu").getBoundingClientRect();
  const z = window.cadrageCarteMonde().zoom; return { x: r.left + c.x * z, y: r.top + c.y * z }; }, numero);
const vue = () => p.evaluate(() => {
  const f = document.getElementById("fenetre-descriptif-region"), c = document.getElementById("cadre-mode-descriptifs");
  return { fenetre: f ? getComputedStyle(f).display : "absente", titre: (document.getElementById("descriptif-region-titre") || {}).textContent,
           texte: (document.getElementById("descriptif-region-texte") || {}).value, etat: (document.getElementById("descriptif-region-etat") || {}).textContent,
           cadre: c ? getComputedStyle(c).display : "absent", carte: window.carteRegionaleOuverte ? window.carteRegionaleOuverte() : null,
           nuages: !!document.getElementById("traversee-nuages") };
});

// =========================================================================
titre("1. LE BOUTON DU DEV ROUGE ET SON MODE : LE CONTOUR ROUGE, UN SEUL MODE À LA FOIS");
// =========================================================================
await section(async () => {
  const r0 = await p.evaluate(() => ({ bouton: !!document.querySelector("#regions-dev-monde #btn-mode-descriptifs"), edition: window.modeEditionRegions() }));
  verifier("un bouton « Éditer les descriptifs de région » dans la popup de la carte du monde", r0.bouton);
  verifier("(au départ, les boîtes sont en édition)", r0.edition === true);
  await p.click("#btn-mode-descriptifs");
  const r = await p.evaluate(() => { const c = document.getElementById("cadre-mode-descriptifs"), st = getComputedStyle(c), r = c.getBoundingClientRect();
    return { mode: window.modeDescriptifRegions(), cadre: st.display, bord: st.borderTopColor, largeur: parseFloat(st.borderTopWidth), couvre: r.left === 0 && r.top === 0 && Math.round(r.width) === innerWidth && Math.round(r.height) === innerHeight,
             doigts: st.pointerEvents, edition: window.modeEditionRegions(), caseCochee: document.getElementById("case-regions-visibles").checked,
             caseInactive: document.getElementById("case-regions-visibles").disabled, nouvelle: document.getElementById("btn-regions-nouvelle").disabled,
             bouton: document.getElementById("btn-mode-descriptifs").classList.contains("actif"), calque: document.getElementById("calque-regions").classList.contains("descriptif") }; });
  verifier("le mode s'active : un contour rouge tout autour de l'écran", r.mode && r.cadre === "block" && /rgb\(224, 27, 27\)/.test(r.bord) && r.largeur >= 4 && r.couvre, r.bord);
  verifier("…qui ne prend aucun doigt", r.doigts === "none");
  verifier("les autres modes DEV sont coupés (édition des boîtes, nouvelle boîte)", !r.edition && !r.caseCochee && r.caseInactive && r.nouvelle);
  verifier("le bouton et les régions le montrent", r.bouton && r.calque);
  await p.evaluate(() => window.afficherRegionsDev(true));
  const r2 = await p.evaluate(() => ({ mode: window.modeDescriptifRegions(), cadre: getComputedStyle(document.getElementById("cadre-mode-descriptifs")).display, edition: window.modeEditionRegions() }));
  verifier("réafficher les boîtes revient à leur édition, et quitte le mode", !r2.mode && r2.cadre === "none" && r2.edition);
  await p.evaluate(() => window.basculerModeDescriptifRegions(true));
});

// =========================================================================
titre("2. UN CLIC SUR UNE RÉGION : SON DESCRIPTIF, PAS SA CARTE");
// =========================================================================
await section(async () => {
  const c = await ecranDe(1);
  await p.mouse.click(c.x, c.y);
  await p.waitForTimeout(300);
  const r = await vue();
  verifier("une fenêtre pleine page s'ouvre, le titre de la région en haut", r.fenetre === "flex" && r.titre === "La forêt des murmures", r.titre);
  verifier("la grande zone de texte porte le descriptif de la base", r.texte === "Les Gobs y vivent sous les frondaisons.", r.texte);
  verifier("la carte régionale ne s'ouvre pas (ni carte, ni nuages)", r.carte === null && !r.nuages);
  const g = await p.evaluate(() => { const f = document.getElementById("fenetre-descriptif-region").getBoundingClientRect(), t = document.getElementById("descriptif-region-texte").getBoundingClientRect();
    return { plein: Math.round(f.width) === innerWidth && Math.round(f.height) === innerHeight, zone: t.height / innerHeight, focus: document.activeElement && document.activeElement.id }; });
  verifier("pleine page ; la zone de texte en prend l'essentiel, prête à écrire", g.plein && g.zone > 0.6 && g.focus === "descriptif-region-texte", JSON.stringify(g));
});

// =========================================================================
titre("3. ÉCRIRE : RELIÉ À LA BASE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.__ecrits = []; });
  await p.keyboard.press("End");
  await p.keyboard.type(" Les contrebandiers d'Arcaï les traquent.");
  const pendant = await p.evaluate(() => ({ n: window.__ecrits.length, etat: document.getElementById("descriptif-region-etat").textContent }));
  await p.waitForTimeout(1300);
  const r = await p.evaluate(() => ({ e: window.__ecrits.filter(x => x.chemin === "Cartes_Regionales/1"), etat: document.getElementById("descriptif-region-etat").textContent,
    mots: document.getElementById("descriptif-region-compte").textContent, base: window.descriptifRegion(1).texte }));
  const attendu = "Les Gobs y vivent sous les frondaisons. Les contrebandiers d'Arcaï les traquent.";
  verifier("pendant la frappe, rien ne part encore", pendant.n === 0 && /cours/.test(pendant.etat), pendant.etat);
  verifier("un instant après, le descriptif s'enregistre (Cartes_Regionales/1, Description, en fusion)",
           r.e.length === 1 && r.e[0].data.Description === attendu && r.e[0].data.Numero === 1 && r.e[0].options && r.e[0].options.merge, JSON.stringify(r.e.map(x => x.data)));
  verifier("la fenêtre le dit, et compte les mots", /Enregistré/.test(r.etat) && r.mots === "12 mots", `${r.etat} · ${r.mots}`);
  verifier("le maître du jeu le lira (descriptifRPRegionPourMJ : le texte et le lore)",
           await p.evaluate((a) => { const d = window.descriptifRPRegionPourMJ(1); return d.texte === a && d.nom === "La forêt des murmures" && /berceau des Gobs/.test(d.lore); }, attendu));
  // Un autre poste change le descriptif : il arrive, sauf si l'on écrit.
  await p.evaluate(() => window.appliquerCartesRegionalesDeLaBase([{ id: "1", data: { Numero: 1, Nom: "La forêt des murmures", Description: "Écrit ailleurs." } }]));
  const r2 = await vue();
  verifier("écrit sur un autre poste, il arrive dans la fenêtre", r2.texte === "Écrit ailleurs." && /autre poste/.test(r2.etat), r2.texte);
  await p.keyboard.type(" Et ici.");
  await p.evaluate(() => window.appliquerCartesRegionalesDeLaBase([{ id: "1", data: { Numero: 1, Nom: "La forêt des murmures", Description: "Encore ailleurs." } }]));
  const r3 = await vue();
  verifier("…mais jamais par-dessus ce qu'on est en train d'écrire", r3.texte.endsWith("Et ici."), r3.texte);
  // Fermer tout de suite : la frappe en attente part quand même.
  await p.evaluate(() => { window.__ecrits = []; });
  await p.click("#btn-fermer-descriptif");
  await p.waitForTimeout(200);
  const r4 = await p.evaluate(() => ({ e: window.__ecrits.filter(x => x.chemin === "Cartes_Regionales/1").map(x => x.data.Description), fenetre: getComputedStyle(document.getElementById("fenetre-descriptif-region")).display }));
  verifier("le bouton ✕ ferme la fenêtre, et ce qui n'était pas encore parti s'enregistre", r4.fenetre === "none" && r4.e.length === 1 && r4.e[0].endsWith("Et ici."), JSON.stringify(r4.e));
  const c = await ecranDe(1);
  await p.mouse.click(c.x, c.y);
  await p.waitForTimeout(200);
  const r5 = await vue();
  verifier("rouverte, la fenêtre reprend le texte enregistré", r5.texte.endsWith("Et ici."));
  await p.keyboard.press("Escape");
  await p.waitForTimeout(200);
  verifier("Échap la ferme aussi", (await vue()).fenetre === "none");
});

// =========================================================================
titre("4. TOUTES LES RÉGIONS : SANS CARTE, OU SANS FICHE ENCORE");
// =========================================================================
await section(async () => {
  const c4 = await ecranDe(4);
  await p.mouse.click(c4.x, c4.y);
  await p.waitForTimeout(200);
  const r = await p.evaluate(() => ({ v: { fenetre: getComputedStyle(document.getElementById("fenetre-descriptif-region")).display, titre: document.getElementById("descriptif-region-titre").textContent },
    annonce: !!document.querySelector(".annonce-carte-region.visible") }));
  verifier("Volcanisse (pas encore de carte) : son descriptif s'ouvre, pas « carte à venir »", r.v.fenetre === "flex" && r.v.titre === "Volcanisse" && !r.annonce, r.v.titre);
  await p.click("#btn-fermer-descriptif-bas");
  const c15 = await ecranDe(15);
  await p.mouse.click(c15.x, c15.y);
  await p.waitForTimeout(200);
  await p.evaluate(() => { window.__ecrits = []; });
  await p.keyboard.type("Une boîte neuve.");
  await p.click("#btn-fermer-descriptif-bas");
  await p.waitForTimeout(200);
  const r2 = await p.evaluate(() => ({ e: window.__ecrits.filter(x => x.chemin === "Cartes_Regionales/15").map(x => x.data), titre: document.getElementById("descriptif-region-titre").textContent }));
  verifier("une boîte sans fiche (la 15) : « Région 15 », et sa fiche naît à son premier descriptif",
           r2.titre === "Région 15" && r2.e.length === 1 && r2.e[0].Numero === 15 && r2.e[0].Description === "Une boîte neuve.", JSON.stringify(r2.e));
});

// =========================================================================
titre("5. EN SORTIR : LE DEV ÉTEINT, OU LE BOUTON");
// =========================================================================
await section(async () => {
  const c = await ecranDe(1);
  await p.mouse.click(c.x, c.y);
  await p.waitForTimeout(200);
  await p.evaluate(() => { localStorage.removeItem("ivalis_DEV_MODE"); window.actualiserRegionsDev(); });
  await p.waitForTimeout(200);
  const r = await vue();
  verifier("le DEV éteint : le mode s'arrête, le contour et la fenêtre s'en vont", r.cadre === "none" && r.fenetre === "none" && !(await p.evaluate(() => window.modeDescriptifRegions())));
  await p.evaluate(() => { localStorage.setItem("ivalis_DEV_MODE", "on"); window.actualiserRegionsDev(); window.basculerPopupRegions(true); window.basculerModeDescriptifRegions(true); });
  await p.click("#btn-mode-descriptifs");
  const r2 = await p.evaluate(() => ({ mode: window.modeDescriptifRegions(), cadre: getComputedStyle(document.getElementById("cadre-mode-descriptifs")).display,
                                      texte: document.getElementById("btn-mode-descriptifs").textContent, case: document.getElementById("case-regions-visibles").disabled }));
  verifier("le même bouton fait sortir du mode (la case des boîtes revient)", !r2.mode && r2.cadre === "none" && !r2.case && /Éditer les descriptifs/.test(r2.texte));
  // Hors du mode, la région ouvre de nouveau sa carte.
  await p.evaluate(() => { window.basculerPopupRegions(false); window.afficherRegionsDev(false); });
  const c1 = await ecranDe(1);
  await p.mouse.click(c1.x, c1.y);
  await p.waitForTimeout(700);
  const r3 = await vue();
  verifier("hors du mode, un clic sur la région ouvre sa carte (la traversée part)", r3.fenetre === "none" && (r3.nuages || r3.carte === 1));
});

// =========================================================================
titre("6. LES VERSIONS");
// =========================================================================
await section(async () => {
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json')).version;
  verifier("version 274 ou plus (trace_combat.js, version.json)", vTrace >= 274 && vJson === vTrace, `${vTrace} / ${vJson}`);
  verifier("descriptifs_regions.js chargé ; regions_carte.js, cartes_regionales.js et style.css ont changé de version",
           /descriptifs_regions\.js\?v=\d+/.test(html) && Number((html.match(/regions_carte\.js\?v=(\d+)/) || [])[1]) >= 3
           && Number((html.match(/cartes_regionales\.js\?v=(\d+)/) || [])[1]) >= 3 && Number((html.match(/style\.css\?v=(\d+)/) || [])[1]) >= 106);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
