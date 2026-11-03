// v299 — LE GRIMOIRE, PARTIE 2 : LA PAGE SE PREND PAR LE BORD, PLUS VITE, LE
// VIEUX PARCHEMIN ; LES BOUTONS DU BAS ; L'INDEX ; LE MARQUE-PAGE ; LE LIVRE
// SUR LA CARTE.
//
// Nico : « je peux saisir la page que par les coins, y a pas moyen de la
// saisir aussi par le centre extérieur ? » ; « accélère encore le tournage de
// page » ; « pour le bruit de posage, récupère mon vieux son de parchemin
// (clik_bouton_aniy88.mp3) » ; « mettre les trois petits boutons (quatre avec
// le petit dev rouge) du bas de l'écran dès que l'on voit le livre » ; « le
// bouton pour revenir au menu principal fera revenir à la page principale du
// livre » ; « l'index : Carte du monde, Le récit, Les fiches personnages, Les
// combats, Le village, Les paramètres, écrits gros, pas bien droits, à la main,
// en gras et surlignés, sur les deux pages » ; « garde la map en dessous du
// livre, une fois la partie chargée le livre se met par-dessus ; on laisse
// les boutons menu en doublon sur la droite » ; « au-dessus du livre côté
// gauche, et sous les pages, un petit marque-page texture parchemin, un dessin
// à la plume noire d'une feuille avec des lignes manuscrites, penché
// légèrement ; il tourne les pages jusqu'à l'index (désactivé tant que pas
// rentré dans une partie) ».
//
// Lancer : node tests_monstres/corrections_v299.mjs
// (IVALIS_RACINE=… pour un autre dossier ; V299_CAPTURES=dossier pour les captures.)
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
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...c) => ({ chemin: c.join("/") }); export const collection = (_db, ...c) => ({ col: c.join("/") });
  export const getDoc = async (r) => ({ exists: () => false, data: () => ({}) });
  export const query = (c) => c; export const where = () => ({}); export const orderBy = () => ({}); export const limit = () => ({});
  export const getDocs = async () => ({ forEach() {}, docs: [], empty: true, size: 0 });
  export const setDoc = async () => {}; export const updateDoc = async () => {};
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "m" });
  export const onSnapshot = () => () => {}; export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
  export const runTransaction = async () => null; export const increment = (k) => k; export const deleteField = () => null;
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const serverTimestamp = () => Date.now();
  export class FieldPath {} export const Timestamp = { now: () => Date.now() };
`;
// Le vieux parchemin de Nico, remplacé ici par un son reconnaissable : 0,6 s de la à 440 Hz (WAV).
const SON_PARCHEMIN = "https://res.cloudinary.com/dlkjq4kvg/video/upload/v1781420565/clik_bouton_aniy88.mp3";
const wav = (() => {
  const taux = 44100, n = Math.floor(taux * 0.6), buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(taux, 24);
  buf.writeUInt32LE(taux * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / taux) * 0.5 * 32767), 44 + i * 2);
  return buf;
})();
const CAPTURES = process.env.V299_CAPTURES || "";
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: CAPTURES ? 2 : 1 });
const demandes = [];
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**/clik_bouton_aniy88.mp3', r => { demandes.push(r.request().url()); r.fulfill({ status: 200, contentType: 'audio/wav', headers: {'Access-Control-Allow-Origin':'*'}, body: wav }); });
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html'); await p.waitForTimeout(1200);
const titre = (t) => console.log("\n" + t);
const section = async (f) => { try { await f(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 160)); } };
const etat = () => p.evaluate(() => window.grimoireEtat());
const page = () => p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex());
const attendreQue = async (f, ms = 6000) => { for (let i = 0; i < ms / 100; i++) { if (await f()) return true; await p.waitForTimeout(100); } return false; };
const cliquer = (sel) => p.evaluate((sel) => document.querySelector(sel).click(), sel);
const centre = (sel) => p.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
// Le vrai clic au milieu d'un élément (ce qui est dessus le reçoit).
const clicVrai = async (sel) => { const c = await centre(sel); await p.mouse.click(c.x, c.y); };
// Ce que le doigt toucherait à cet endroit de l'écran.
const dessus = (x, y) => p.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? (el.id || "") + "|" + (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) + "|" + (el.closest("[id]") || {}).id : "rien"; }, [x, y]);
const dans = (x, y, sel) => p.evaluate(([x, y, sel]) => { const el = document.elementFromPoint(x, y); return !!(el && el.closest(sel)); }, [x, y, sel]);
// Glisser à la souris, d'un point à un autre.
const glisser = async (de, a, pas = 16) => {
  await p.mouse.move(de.x, de.y); await p.mouse.down();
  for (let i = 1; i <= pas; i++) { await p.mouse.move(de.x + (a.x - de.x) * i / pas, de.y + (a.y - de.y) * i / pas); await p.waitForTimeout(18); }
  await p.mouse.up();
};
const rectPage = (n) => p.evaluate((n) => { const r = document.getElementById("grimoire-page-" + n).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; }, n);

// =========================================================================
titre("1. LE VIEUX PARCHEMIN : LA PAGE QUI SE POSE");
// =========================================================================
await section(async () => {
  verifier("le son de parchemin de Nico est demandé, à son adresse exacte", demandes.includes(SON_PARCHEMIN), demandes.join(", ") || "aucune demande");
  await p.evaluate(() => { window.PARAMETRES_AUDIO = Object.assign(window.PARAMETRES_AUDIO || {}, { interface: 1, general: 1 }); window.jouerSonEvenement("page-prise"); });
  const pret = await attendreQue(() => p.evaluate(() => window.echantillonPret && window.echantillonPret("page-tourne")), 4000);
  verifier("une fois le son ouvert (au premier geste), il se décode", pret);
  const rendu = await p.evaluate(async () => {
    const ctx = new OfflineAudioContext(1, 44100 * 1.2, 44100);
    window.SONS_EVENEMENTS["page-tourne"](ctx, ctx.destination);
    const b = await ctx.startRendering(), d = b.getChannelData(0);
    let e = 0, dernier = 0, passages = 0;
    for (let i = 0; i < d.length; i++) { e += d[i] * d[i]; if (Math.abs(d[i]) > 0.004) dernier = i; if (i > 0 && i < 44100 * 0.5 && d[i - 1] < 0 && d[i] >= 0) passages++; }
    return { rms: Math.sqrt(e / d.length), fin: dernier / 44100, hz: passages / 0.5 };
  });
  verifier("« page-tourne » joue alors le parchemin lui-même (et plus la fabrication)", rendu.fin > 0.55 && rendu.fin < 0.65 && Math.abs(rendu.hz - 440) < 8, JSON.stringify(rendu));
  const src = lire("fabrique_sons.js");
  verifier("tant qu'il n'est pas là : une fabrication de secours, brève (la page qui se pose)", /if \(jouerEchantillon\(ctx, s, "page-tourne", 1\)\) return;/.test(src));
});

// Le grimoire, sur le journal de Ben ; les bruits de pages et les clics, notés.
await p.evaluate(() => {
  window.__sons = []; window.__clics = 0; window.__appels = []; window.__entrees = [];
  window.jouerSonEvenement = (id) => { window.__sons.push([id, Date.now()]); return true; };
  window.jouerSonClic = () => { window.__clics++; };
  window.fermerToutesLesFenetres = () => {};
  window.COMPTE_JOUEUR = { nom: "Ben", email: "ben@ivalis.fr", admin: false };
  window.LISTE_PARTIES_CACHE = [{ id: "P1", nom: "Les Lames d'Héra" }];
  window.PORTES_GRIMOIRE = {
    verifierCle: async () => true, creerPartie: async () => "P_NEUVE",
    verifierMdpPartie: async (id, m) => ({ ok: m === "sel" }),
    entrerDansPartie: (id) => { window.__entrees.push(id); window.ID_PARTIE_COURANTE = id; document.getElementById("ecran-jeu").style.display = "block"; }
  };
  ["ouvrirChatbox", "ouvrirMenuPersonnages", "ouvrirPopupRencontre", "ouvrirParametres"].forEach(n => { window[n] = () => window.__appels.push(n); });
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== "ecran-grimoire") e.style.display = "none"; });
  window.afficherGrimoire();
});
await p.waitForTimeout(1300);

// =========================================================================
titre("2. ENCORE PLUS VITE : LA PAGE TOURNE EN 0,5 S");
// =========================================================================
await section(async () => {
  const t0 = Date.now();
  await p.evaluate(() => { window.__sons = []; window.__t0 = Date.now(); window.ouvrirGrimoire(); });
  await attendreQue(async () => (await page()) === 1, 3000);
  const duree = Date.now() - t0;
  await p.waitForTimeout(800);
  const r = await p.evaluate(() => ({ temps: window.GRIMOIRE_PAGEFLIP.getSettings().flippingTime, zoom: getComputedStyle(document.getElementById("grimoire-scene")).transitionDuration,
    sons: window.__sons.map(([id, t]) => [id, t - window.__t0]) }));
  verifier("une page tourne en 0,5 s (0,7 s en v298)", r.temps === 500 && duree < 900, `${r.temps} ms réglés, ouverture faite en ${duree} ms`);
  verifier("le zoom d'ouverture suit (0,75 s)", /^0\.75s/.test(r.zoom), r.zoom);
  const pose = r.sons.find(x => x[0] === "page-tourne");
  verifier("le bruit de parchemin joue quand la page se pose (à la fin de la tourne)", pose && pose[1] >= 380 && r.sons.length === 1, JSON.stringify(r.sons));
});

// =========================================================================
titre("3. SAISIR LA PAGE PAR LE MILIEU DE SON BORD EXTÉRIEUR");
// =========================================================================
await section(async () => {
  const d = await rectPage(2);
  await p.evaluate(() => { window.__sons = []; });
  // Le milieu du bord extérieur de la page de droite, tiré vers la gauche.
  await glisser({ x: d.r - 25, y: d.t + d.h * 0.5 }, { x: d.l - d.w * 0.7, y: d.t + d.h * 0.5 }, 20);
  await p.waitForTimeout(900);
  let r = await p.evaluate(() => ({ page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), sons: window.__sons.map(x => x[0]) }));
  verifier("le milieu du bord droit, tiré vers la gauche : la page tourne", r.page === 3, JSON.stringify(r));
  verifier("… la prise, puis le parchemin quand elle se pose", r.sons.join(",") === "page-prise,page-tourne", r.sons.join(","));
  // Le haut du bord aussi, et pas seulement les coins : au tiers de la hauteur, depuis la page de gauche.
  const g = await rectPage(3);
  await glisser({ x: g.l + 25, y: g.t + g.h * 0.33 }, { x: g.r + g.w * 0.7, y: g.t + g.h * 0.33 }, 20);
  await p.waitForTimeout(900);
  verifier("le bord gauche, au tiers de sa hauteur, tiré vers la droite : retour en arrière", (await page()) === 1, String(await page()));
  // Près du dos, la page ne se prend pas (le geste est pour le contenu).
  const d2 = await rectPage(2);
  await glisser({ x: d2.l + d2.w * 0.2, y: d2.t + d2.h * 0.5 }, { x: d2.l - d2.w * 0.6, y: d2.t + d2.h * 0.5 }, 16);
  await p.waitForTimeout(800);
  verifier("près du dos (moitié intérieure), on ne saisit rien", (await page()) === 1, String(await page()));
  // Un simple toucher sur le bord ne tourne rien.
  await p.mouse.click(d2.r - 25, d2.t + d2.h * 0.5);
  await p.waitForTimeout(700);
  verifier("un simple toucher sur le bord ne tourne pas la page", (await page()) === 1);
  // Au doigt (iPad) : le même geste, avec des événements de doigt.
  await p.evaluate(() => {
    const livre = document.getElementById("grimoire-livre"), r = document.getElementById("grimoire-page-2").getBoundingClientRect();
    const o = (x, y) => ({ bubbles: true, cancelable: true, pointerType: "touch", pointerId: 7, isPrimary: true, clientX: x, clientY: y });
    const y = r.top + r.height * 0.55, x0 = r.right - 30;
    livre.dispatchEvent(new PointerEvent("pointerdown", o(x0, y)));
    for (let i = 1; i <= 20; i++) livre.dispatchEvent(new PointerEvent("pointermove", o(x0 - r.width * 1.6 * i / 20, y)));
    livre.dispatchEvent(new PointerEvent("pointerup", o(x0 - r.width * 1.6, y)));
  });
  await p.waitForTimeout(900);
  verifier("au doigt (iPad), le même geste tourne la page", (await page()) === 3, String(await page()));
  const ta = await p.evaluate(() => getComputedStyle(document.getElementById("grimoire-livre")).touchAction);
  verifier("sur le livre, le navigateur ne fait ni défiler ni zoomer (touch-action: none)", ta === "none", ta);
  await cliquer("#grimoire-page-3 .revenir");
  await p.waitForTimeout(800);
});

// =========================================================================
titre("4. LES BOUTONS DU BAS DÈS QUE L'ON VOIT LE LIVRE ; LA MAISON → LE JOURNAL");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const nav = document.getElementById("menu-navigation-bas"), rc = nav.getBoundingClientRect();
    return { parent: nav.parentNode.id, vue: getComputedStyle(nav).display !== "none" && rc.width > 0 && rc.bottom <= innerHeight && rc.right <= innerWidth,
             dev: !!nav.querySelector("#conteneur-regions-dev"), icones: [...nav.querySelectorAll(".icone-nav")].map(i => i.alt) };
  });
  verifier("hors partie, les boutons du bas sont dans le grimoire, visibles", r.parent === "ecran-grimoire" && r.vue, JSON.stringify(r));
  verifier("… le volume, la maison, la porte — et le DEV rouge avec eux", r.dev && r.icones.join(",").includes("Retour Menu") && r.icones.join(",").includes("Quitter") && r.icones.length >= 3, r.icones.join(","));
  await p.evaluate(() => { document.getElementById("conteneur-regions-dev").style.display = "flex"; });
  const dev = await centre("#btn-regions-dev");
  verifier("le DEV rouge s'y montre aussi (en mode DEV), au-dessus du livre", await dans(dev.x, dev.y, "#btn-regions-dev"));
  const maison = await centre('#menu-navigation-bas img[alt="Retour Menu"]');
  verifier("la maison est au-dessus de tout (le doigt l'atteint)", await dans(maison.x, maison.y, "#menu-navigation-bas"), await dessus(maison.x, maison.y));
  // Sur un chapitre : la maison ramène au journal, sans fenêtre de confirmation.
  await cliquer("#grimoire-btn-compte");
  await p.waitForTimeout(800);
  const avant = await page();
  await p.mouse.click(maison.x, maison.y);
  await p.waitForTimeout(900);
  const apres = await p.evaluate(() => ({ page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), modale: getComputedStyle(document.getElementById("modale-retour-menu")).display, voile: getComputedStyle(document.getElementById("overlay-jeu-modale")).display }));
  verifier("hors partie, la maison fait revenir le livre à sa page principale (le journal)", avant === 3 && apres.page === 1 && apres.modale === "none" && apres.voile === "none", JSON.stringify({ avant, ...apres }));
  // Livre fermé : la maison l'ouvre sur le journal.
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.flipPrev("top"));
  await p.waitForTimeout(900);
  const ferme = (await etat()).ouvert;
  await p.mouse.click(maison.x, maison.y);
  await p.waitForTimeout(1300);
  const e = await etat();
  verifier("livre fermé, la maison l'ouvre sur le journal", ferme === false && e.ouvert && e.page === 1, JSON.stringify(e));
  // Le volume et la porte marchent aussi par-dessus le livre.
  await clicVrai('#menu-navigation-bas .conteneur-volume-nav img');
  await p.waitForTimeout(150);
  const bulle = await p.evaluate(() => getComputedStyle(document.getElementById("bulle-volume")).display);
  verifier("le volume ouvre sa bulle", bulle === "block", bulle);
  await p.evaluate(() => { document.getElementById("bulle-volume").style.display = "none"; });
  await clicVrai('#menu-navigation-bas img[alt="Quitter"]');
  await p.waitForTimeout(200);
  const q = await p.evaluate(() => { const m = document.getElementById("modale-quitter-jeu"), r = m.getBoundingClientRect(), el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { vue: getComputedStyle(m).display !== "none", dessus: !!(el && el.closest("#modale-quitter-jeu")) }; });
  verifier("la porte demande s'il faut quitter, au-dessus du livre", q.vue && q.dessus, JSON.stringify(q));
  await p.evaluate(() => window.fermerModalesJeu());
  await p.evaluate(() => { document.getElementById("conteneur-regions-dev").style.display = "none"; });
});

// =========================================================================
titre("5. LE MARQUE-PAGE : SOUS LES PAGES, AU-DESSUS DU LIVRE, À GAUCHE ; ÉTEINT HORS PARTIE");
// =========================================================================
let geo = null;
await section(async () => {
  geo = await p.evaluate(() => {
    const m = document.getElementById("grimoire-marque-page"), fond = document.querySelector(".grimoire-fond-livre").getBoundingClientRect();
    const r = m.getBoundingClientRect(), k = fond.width / 2000, st = getComputedStyle(m), papier = getComputedStyle(m.querySelector(".marque-papier"));
    const svg = m.querySelector("svg.dessin-marque");
    return { k, top: r.top, bas: r.bottom, gauche: r.left, droite: r.right, fondTop: fond.top, fondGauche: fond.left, dos: fond.left + 1008 * k, pagesTop: fond.top + 62 * k,
             transform: st.transform, inactif: m.classList.contains("inactif"), aria: m.getAttribute("aria-disabled"),
             texture: papier.backgroundImage, clip: papier.clipPath, feuille: !!(svg && svg.querySelector("path.feuille")), lignes: svg ? svg.querySelectorAll("path.ligne").length : 0,
             encre: svg ? getComputedStyle(svg.querySelector("path.feuille")).stroke : "", avantLivre: m.compareDocumentPosition(document.getElementById("grimoire-livre")) & Node.DOCUMENT_POSITION_FOLLOWING };
  });
  verifier("il dépasse au-dessus du livre", geo.top < geo.fondTop + 44 * geo.k - 30 && geo.top >= 0, `haut ${geo.top.toFixed(0)} px, bord du livre ${(geo.fondTop + 44 * geo.k).toFixed(0)} px`);
  verifier("côté gauche du livre", geo.droite < geo.dos && geo.gauche > geo.fondGauche, `${geo.gauche.toFixed(0)} → ${geo.droite.toFixed(0)} px, dos à ${geo.dos.toFixed(0)}`);
  const m = /matrix\(([-\d.e]+), ([-\d.e]+)/.exec(geo.transform);
  const angle = m ? Math.atan2(Number(m[2]), Number(m[1])) * 180 / Math.PI : 0;
  verifier("penché légèrement", angle < -2 && angle > -12, `${angle.toFixed(1)}°`);
  verifier("texture parchemin, le bout taillé", /page\.webp/.test(geo.texture) && /polygon/.test(geo.clip), geo.clip.slice(0, 40));
  verifier("un dessin à la plume noire : une feuille couverte de lignes manuscrites", geo.feuille && geo.lignes >= 5 && /rgb\((1[0-9]|[0-9]), /.test(geo.encre), `${geo.lignes} lignes, ${geo.encre}`);
  // Sous les pages : plus bas que leur bord, ce sont les pages que l'on touche.
  const x = (geo.gauche + geo.droite) / 2;
  verifier("glissé sous les pages : sous leur bord, la page le recouvre", geo.avantLivre && !(await dans(x, geo.pagesTop + 40 * geo.k, "#grimoire-marque-page")) && geo.bas > geo.pagesTop + 20, await dessus(x, geo.pagesTop + 40 * geo.k));
  verifier("… et au-dessus, on le touche", await dans(x, geo.top + 25 * geo.k, "#grimoire-marque-page"));
  verifier("hors partie, il est éteint (désactivé)", geo.inactif && geo.aria === "true");
  await p.evaluate(() => { window.__clics = 0; });
  const avant = await page();
  await p.mouse.click(x, geo.top + 25 * geo.k);
  await p.waitForTimeout(700);
  verifier("… le toucher ne fait rien (pas même le clic)", (await page()) === avant && (await p.evaluate(() => window.__clics)) === 0);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v299_journal.png" });
  // Livre fermé, on ne voit que la couverture : pas de marque-page.
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.flipPrev("top"));
  await p.waitForTimeout(1300);
  const op = await p.evaluate(() => getComputedStyle(document.getElementById("grimoire-marque-page")).opacity);
  verifier("livre fermé : le marque-page disparaît avec lui", op === "0", op);
  await p.evaluate(() => window.ouvrirGrimoire());
  await p.waitForTimeout(1300);
});

// =========================================================================
titre("6. LA PARTIE CHARGÉE : LE LIVRE PAR-DESSUS LA CARTE, OUVERT À L'INDEX");
// =========================================================================
await section(async () => {
  // Un bouton du voyage posé sur la carte, pour voir s'il se cache sous le livre levé.
  await p.evaluate(() => { const b = document.createElement("img"); b.id = "btn-voyage-essai"; b.className = "btn-voyage"; b.style.cssText = "left:40%;top:40%;width:40px;height:40px;display:block"; document.getElementById("ecran-jeu").appendChild(b); });
  await cliquer("#grimoire-btn-charger");
  await p.waitForTimeout(800);
  await cliquer('#grimoire-liste-parties [data-id="P1"]');
  await p.waitForTimeout(150);
  await p.fill("#grimoire-mdp-partie", "sel");
  await cliquer("#grimoire-valider-partie");
  await p.waitForTimeout(1300);
  const r = await p.evaluate(() => {
    const ecran = document.getElementById("ecran-grimoire");
    return { entrees: window.__entrees.slice(), e: window.grimoireEtat(), parent: ecran.parentNode.id, jeu: getComputedStyle(document.getElementById("ecran-jeu")).display,
             fond: getComputedStyle(ecran, "::before").opacity, z: getComputedStyle(ecran).zIndex, nav: document.getElementById("menu-navigation-bas").parentNode.id,
             marque: document.getElementById("grimoire-marque-page").classList.contains("inactif"), voyage: getComputedStyle(document.getElementById("btn-voyage-essai")).display,
             menu: getComputedStyle(document.getElementById("menu-lateral")).display };
  });
  verifier("on entre dans la partie (la carte du jeu s'installe)", r.entrees.join(",") === "P1" && r.jeu === "block", JSON.stringify(r.entrees));
  verifier("le livre reste, posé dans l'écran de jeu, au-dessus de la carte", r.e.visible && r.e.enPartie && r.parent === "ecran-jeu" && Number(r.z) > 5 && Number(r.z) < 40, `${r.parent}, z ${r.z}`);
  // v300 : Nico, « laisse le livre à la même place que dans le menu principal ; il masque l'ancienne
  // interface ; masque la map globale et laisse le fond beige ».
  verifier("v300 : le fond beige reste, la carte est masquée sous le livre", r.fond === "1" && await dans(6, 6, "#ecran-grimoire"), `opacité ${r.fond}, ${await dessus(6, 6)}`);
  verifier("le livre, ouvert sur l'index (la double page des chapitres)", r.e.ouvert && r.e.page === 3 && r.e.chapitre === "index", JSON.stringify(r.e));
  verifier("v300 : l'ancien menu de droite se cache sous le livre", r.menu === "none", r.menu);
  verifier("v300 : les petits boutons restent dans le livre (en haut à droite)", r.nav === "ecran-grimoire");
  verifier("en partie, le marque-page s'allume", r.marque === false);
  verifier("les boutons posés sur la carte (le voyage) se cachent sous le livre levé", r.voyage === "none", r.voyage);
});

// =========================================================================
titre("7. L'INDEX : GROS, À LA MAIN, PENCHÉ, EN GRAS, SURLIGNÉ, SUR LES DEUX PAGES");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const lis = (n) => [...document.querySelectorAll(`#grimoire-page-${n} .entree-index`)].map(b => {
      const st = getComputedStyle(b), t = b.querySelector(".entree-index-texte"), ts = getComputedStyle(t);
      return { texte: b.innerText.trim(), poids: st.fontWeight, style: st.fontStyle, police: st.fontFamily, taille: parseFloat(st.fontSize), transform: st.transform,
               surligne: /data:image\/svg\+xml/.test(ts.backgroundImage) && /rgba\(20,12,6/.test(decodeURIComponent(ts.backgroundImage)) && !/236,190,60/.test(decodeURIComponent(ts.backgroundImage)), clone: ts.boxDecorationBreak || ts.webkitBoxDecorationBreak };
    });
    const u = parseFloat(document.getElementById("grimoire-scene").style.getPropertyValue("--u"));
    return { g: lis(3), d: lis(4), u, entete: (document.querySelector("#grimoire-page-3 .entete-index") || {}).textContent };
  });
  const tout = [...r.g, ...r.d];
  verifier("page de gauche : Carte du monde, Le récit, Les fiches personnages", r.g.map(x => x.texte).join(" | ") === "Carte du monde | Le récit | Les fiches personnages", r.g.map(x => x.texte).join(" | "));
  verifier("page de droite : Les combats, Le village, Les paramètres", r.d.map(x => x.texte).join(" | ") === "Les combats | Le village | Les paramètres", r.d.map(x => x.texte).join(" | "));
  verifier("en gros (plus de deux fois le texte des pages)", tout.every(x => x.taille > r.u * 7), `${tout[0] && tout[0].taille.toFixed(1)} px, u = ${r.u.toFixed(2)} px`);
  verifier("à la main, en gras (Almendra, gras, penché d'écriture)", tout.every(x => /Almendra/.test(x.police) && Number(x.poids) >= 700 && x.style === "italic"));
  const angles = tout.map(x => { const m = /matrix\(([-\d.e]+), ([-\d.e]+)/.exec(x.transform); return m ? Math.atan2(Number(m[2]), Number(m[1])) * 180 / Math.PI : 0; });
  verifier("pas bien droit : chaque ligne penche un peu, chacune à sa façon", angles.every(a => Math.abs(a) > 0.2 && Math.abs(a) < 4) && new Set(angles.map(a => a.toFixed(1))).size >= 5, angles.map(a => a.toFixed(1)).join(" "));
  verifier("v300 : souligné d'un trait de plume (plus de jaune), ligne par ligne", tout.every(x => x.surligne && x.clone === "clone"));
  verifier("un petit titre « Index »", r.entete === "Index", r.entete);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v299_index.png" });
});

// =========================================================================
titre("8. LES CHAPITRES DE L'INDEX ; LE MARQUE-PAGE RAMÈNE À L'INDEX");
// =========================================================================
await section(async () => {
  const lisRange = () => p.evaluate(() => {
    const fond = document.querySelector(".grimoire-fond-livre").getBoundingClientRect(), k = fond.width / 2000, m = document.getElementById("grimoire-marque-page").getBoundingClientRect();
    return { page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex(), chapitre: window.grimoireEtat().chapitre };
  });
  // v300 : le livre ne se range plus ; la carte attend son tour, le récit est dans le livre,
  // les autres chapitres ouvrent l'ancienne fenêtre par-dessus le livre.
  await cliquer("#grimoire-index-carte");
  await p.waitForTimeout(400);
  let r = await lisRange();
  const noteCarte = await p.evaluate(() => document.getElementById("grimoire-note-index").textContent);
  verifier("v300 : « Carte du monde » : bientôt dans le livre (le livre reste ouvert à l'index)", /bientôt/.test(noteCarte) && r.page === 3, noteCarte);
  const mp = await p.evaluate(() => { const r = document.getElementById("grimoire-marque-page").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 20 }; });
  verifier("le marque-page se touche", await dans(mp.x, mp.y, "#grimoire-marque-page"), await dessus(mp.x, mp.y));
  await cliquer("#grimoire-index-recit");
  await p.waitForTimeout(1000);
  verifier("v300 : « Le récit » tourne les pages jusqu'au récit, dans le livre", (await page()) >= 7, String(await page()));
  await p.mouse.click(mp.x, mp.y);
  await p.waitForTimeout(1000);
  r = await lisRange();
  verifier("un toucher sur le marque-page : retour à l'index", r.page === 3 && r.chapitre === "index", JSON.stringify(r));
  for (const [id, appel] of [["fiches", "ouvrirMenuPersonnages"], ["combats", "ouvrirPopupRencontre"], ["parametres", "ouvrirParametres"]]) {
    await p.evaluate(() => { window.__appels = []; });
    await cliquer("#grimoire-index-" + id);
    await p.waitForTimeout(300);
    const a = await p.evaluate(() => ({ appels: window.__appels.slice(), page: window.GRIMOIRE_PAGEFLIP.getCurrentPageIndex() }));
    verifier(`« ${id} » : l'ancienne fenêtre s'ouvre (${appel}), par-dessus le livre`, a.appels.join(",") === appel && a.page === 3, JSON.stringify(a));
  }
  await cliquer("#grimoire-index-village");
  await p.waitForTimeout(300);
  const v = await p.evaluate(() => ({ note: document.getElementById("grimoire-note-index").textContent, vue: document.getElementById("grimoire-note-index").classList.contains("visible"), range: window.grimoireEtat().range }));
  verifier("« Le village » : pas encore écrit — une note à la plume, le livre reste", v.vue && /bientôt/.test(v.note) && !v.range, JSON.stringify(v));
  // Depuis le journal (on a tourné en arrière), puis depuis « Compte » : le marque-page ramène à l'index.
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.flipPrev("top"));
  await p.waitForTimeout(900);
  const surJournal = await page();
  await p.mouse.click(geo ? (geo.gauche + geo.droite) / 2 : mp.x, (await p.evaluate(() => document.getElementById("grimoire-marque-page").getBoundingClientRect().top)) + 20);
  await p.waitForTimeout(1000);
  r = await lisRange();
  verifier("depuis le journal, le marque-page tourne les pages jusqu'à l'index", surJournal === 1 && r.page === 3 && r.chapitre === "index", JSON.stringify({ surJournal, page: r.page, chapitre: r.chapitre }));
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.flipPrev("top"));
  await p.waitForTimeout(900);
  await cliquer("#grimoire-btn-compte");
  await p.waitForTimeout(900);
  const surCompte = (await etat()).chapitre;
  await p.evaluate(() => { document.getElementById("grimoire-marque-page").click(); });
  await p.waitForTimeout(900);
  r = await lisRange();
  verifier("depuis « Compte », aussi", surCompte === "compte" && r.page === 3 && r.chapitre === "index", JSON.stringify({ surCompte, page: r.page, chapitre: r.chapitre }));
  // En partie, le journal ne lance pas une autre partie : il demande d'abord s'il faut quitter celle-ci.
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.flipPrev("top"));
  await p.waitForTimeout(900);
  await cliquer("#grimoire-btn-nouvelle");
  await p.waitForTimeout(300);
  const n = await p.evaluate(() => ({ modale: getComputedStyle(document.getElementById("modale-retour-menu")).display, chapitre: window.grimoireEtat().chapitre, entrees: window.__entrees.length }));
  verifier("en partie, « Nouvelle partie » demande d'abord s'il faut quitter celle-ci", n.modale === "block" && n.chapitre !== "nouvelle" && n.entrees === 1, JSON.stringify(n));
  await p.evaluate(() => window.fermerModalesJeu());
});

// =========================================================================
titre("9. LA MAISON EN PARTIE : QUITTER LA PARTIE, RETOUR AU JOURNAL DU LIVRE");
// =========================================================================
await section(async () => {
  const maison = await centre('#menu-navigation-bas img[alt="Retour Menu"]');
  await p.mouse.click(maison.x, maison.y);
  await p.waitForTimeout(300);
  const m = await p.evaluate(() => getComputedStyle(document.getElementById("modale-retour-menu")).display);
  verifier("en partie, la maison demande d'abord s'il faut quitter la partie", m === "block", m);
  await p.evaluate(() => window.confirmerRetourMenu());
  await p.waitForTimeout(1300);
  const r = await p.evaluate(() => {
    const ecran = document.getElementById("ecran-grimoire");
    return { e: window.grimoireEtat(), parent: ecran.parentNode.tagName, fond: getComputedStyle(ecran, "::before").opacity, jeu: getComputedStyle(document.getElementById("ecran-jeu")).display,
             nav: document.getElementById("menu-navigation-bas").parentNode.id, marque: document.getElementById("grimoire-marque-page").classList.contains("inactif"),
             leve: document.getElementById("ecran-jeu").classList.contains("livre-leve"), z: getComputedStyle(ecran).zIndex };
  });
  verifier("… puis le livre ressort de l'écran de jeu, sur son fond beige", r.parent === "BODY" && r.fond === "1" && r.jeu === "none" && !r.e.enPartie && r.z === "80", JSON.stringify(r));
  verifier("… ouvert sur sa page principale (le journal)", r.e.ouvert && r.e.page === 1 && r.e.chapitre === "", JSON.stringify(r.e));
  verifier("… les boutons du bas le suivent, le marque-page s'éteint", r.nav === "ecran-grimoire" && r.marque && !r.leve);
});

// =========================================================================
titre("10. TOUS LES ÉCRANS : LE MARQUE-PAGE RESTE DANS L'ÉCRAN, LES PAGES SUR LE LIVRE");
// =========================================================================
await section(async () => {
  for (const [w, h] of [[1194, 834], [1440, 900], [1920, 1080], [2560, 1080], [844, 390], [390, 844]]) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => {
      const fond = document.querySelector(".grimoire-fond-livre").getBoundingClientRect(), k = fond.width / 2000;
      const g = document.getElementById("grimoire-page-1").getBoundingClientRect(), m = document.getElementById("grimoire-marque-page").getBoundingClientRect();
      return { marque: m.top, bas: innerHeight - fond.bottom, ecart: Math.max(Math.abs(g.left - (fond.left + 251 * k)), Math.abs(g.top - (fond.top + 62 * k)), Math.abs(g.right - (fond.left + 1008 * k))),
               largeur: fond.width, vw: innerWidth, vh: innerHeight };
    });
    verifier(`${w} × ${h} : marque-page dans l'écran, livre en bas, pages posées`, r.marque >= 0 && r.bas >= 0 && r.bas <= r.vh * 0.013 + 1 && r.ecart < 3 && r.largeur <= r.vw, `haut du marque-page ${r.marque.toFixed(0)} px, ${r.ecart.toFixed(1)} px`);
  }
  await p.setViewportSize({ width: 1194, height: 834 });
});

await section(async () => {
  const index = lire("index.html");
  const v = (re) => Number((index.match(re) || [])[1] || 0);
  verifier("versions : grimoire, sons, app, trace du combat", v(/grimoire\.js\?v=(\d+)"/) >= 3 && v(/grimoire\.css\?v=(\d+)"/) >= 3 && v(/fabrique_sons\.js\?v=(\d+)"/) >= 19
           && v(/app\.js\?v=(\d+)"/) >= 135 && v(/trace_combat\.js\?v=(\d+)"/) >= 204 && Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]) >= 299
           && JSON.parse(lire("version.json") || "{}").version >= 299);
  verifier("la police d'écriture en gras penché est chargée (Almendra 700 italique)", /Almendra:ital,wght@[^"&]*1,700/.test(index));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
