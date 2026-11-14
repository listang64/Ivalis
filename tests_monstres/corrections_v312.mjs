// v312 — LE GRAND LOT DE NICO : LE MENU ET LE SOMMAIRE DU LIVRE, SES MARQUE-PAGES,
// LE LIVRE QUI NE SE REFERME PLUS, LE PION DU GROUPE SUR LA CARTE DU MONDE, LE
// PAPIER D'AVATAR, LA DICTÉE, L'ARBITRE DES DÉS RÉPARÉ, UN NARRATEUR QUI LAISSE
// RESPIRER, LA PISTE D'INITIATIVE, LE TERRAIN DES COMBATS.
//
// Lancer : node tests_monstres/corrections_v312.mjs
// (IVALIS_RACINE=… pour un autre dossier ; V312_CAPTURES=dossier pour les captures.)
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
  const docs = () => (window.__docs = window.__docs || {});
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...c) => ({ chemin: c.join("/") }); export const collection = (_db, ...c) => ({ col: c.join("/") });
  export const getDoc = async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => d || {}, id: r.chemin.split("/").pop() }; };
  export const query = (c) => c; export const where = () => ({}); export const orderBy = () => ({}); export const limit = () => ({});
  export const getDocs = async () => ({ forEach() {}, docs: [], empty: true, size: 0 });
  export const setDoc = async (r, d) => { docs()[r.chemin] = d; (window.__sets = window.__sets || []).push({ chemin: r.chemin, data: d }); };
  export const updateDoc = async (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d }); docs()[r.chemin] = Object.assign({}, docs()[r.chemin] || {}, d); };
  export const deleteDoc = async () => {};
  export const addDoc = async (c, d) => { (window.__ajouts = window.__ajouts || []).push({ col: c.col, data: d }); const id = "A" + window.__ajouts.length; docs()[c.col + "/" + id] = d; return { id }; };
  export const onSnapshot = () => () => {}; export const writeBatch = () => ({ set() {}, update() {}, delete() {}, commit: async () => {} });
  export const runTransaction = async (_db, f) => f({ get: async (r) => { const d = docs()[r.chemin]; return { exists: () => !!d, data: () => d || {} }; },
      update: (r, d) => { (window.__majs = window.__majs || []).push({ chemin: r.chemin, data: d, tx: true }); docs()[r.chemin] = Object.assign({}, docs()[r.chemin] || {}, d); } });
  export const increment = (k) => k; export const deleteField = () => null;
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const serverTimestamp = () => Date.now();
  export class FieldPath {} export const Timestamp = { now: () => Date.now() };
`;
const CAPTURES = process.env.V312_CAPTURES || "";
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



const pose = () => attendreQue(() => p.evaluate(() => window.GRIMOIRE_PAGEFLIP.getState() === "read" && !window.GRIMOIRE.defileEnCours()), 8000);

// =========================================================================
titre("1. LE MENU PRINCIPAL : NOUVELLE PARTIE, CHARGER, PARAMÈTRES, COMPTE, QUITTER ; PLUS DE PETITS BOUTONS");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => ({
    boutons: [...document.querySelectorAll(".page-journal .bouton-grimoire")].map(b => b.innerText.trim()),
    icones: [...document.querySelectorAll("#menu-navigation-bas .icone-nav")].map(i => i.getBoundingClientRect().width),
    dev: !!document.getElementById("conteneur-regions-dev"),
    son: (() => { const v = document.getElementById("vol-general"); return !!(v && v.closest("#grimoire-page-1 .place-son")); })()
  }));
  verifier("le menu principal : Nouvelle partie, Charger partie, Paramètres, Compte, Quitter le jeu", r.boutons.join(" | ") === "Nouvelle partie | Charger partie | Paramètres | Compte | Quitter le jeu", r.boutons.join(" | "));
  verifier("plus de boutons en haut à droite (volume, maison, porte) ; le DEV reste", r.icones.every(w => w === 0) && r.dev, JSON.stringify(r.icones));
  verifier("(v395) le son est sous le titre de la première page (pour tous)", r.son);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v312_menu_principal.png" });
  await p.evaluate(() => { window.__appels = []; });
  await cliquer("#grimoire-btn-parametres");
  await p.waitForTimeout(500);
  const par = await p.evaluate(() => ({ chapitre: window.grimoireEtat().chapitre, cadenas: !!document.getElementById("grimoire-mdp-param") }));
  verifier("(v395) « Paramètres » ouvre leur chapitre du livre, sous cadenas (même hors partie)", par.chapitre === "parametres" && par.cadenas, JSON.stringify(par));
  await p.evaluate(() => document.getElementById("grimoire-marque-menu").click());
  await p.waitForTimeout(1200);
  await cliquer("#grimoire-btn-quitter");
  await p.waitForTimeout(700);
  verifier("(v395) « Quitter le jeu » sort le papier qui demande s'il faut quitter", await p.evaluate(() => document.getElementById("grimoire-papier-quitter").classList.contains("sorti") && document.getElementById("grimoire-question-quitter").textContent === "Quitter le jeu ?"));
  await cliquer("#grimoire-quitter-non");
  await p.waitForTimeout(600);
});

// =========================================================================
titre("2. LE LIVRE OUVERT NE SE REFERME PLUS ; LE MARQUE-PAGE ≡ RAMÈNE À LA PAGE PRINCIPALE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.flipPrev("top"));
  await p.waitForTimeout(1400);
  const e = await p.evaluate(() => window.grimoireEtat());
  verifier("tourné vers la couverture, le livre se rouvre (il ne se referme plus)", e.ouvert && e.page === 1, JSON.stringify(e));
  // La prise à la main, sur le bord gauche de la première double page : rien.
  const l = await p.evaluate(() => { const r = document.getElementById("grimoire-livre").getBoundingClientRect(); return { x: r.left + 12, y: r.top + r.height / 2 }; });
  await p.mouse.move(l.x, l.y); await p.mouse.down(); await p.mouse.move(l.x + 300, l.y, { steps: 8 }); await p.mouse.up();
  await p.waitForTimeout(1200);
  verifier("le bord gauche de la première double page ne se prend plus", (await page()) === 1 && (await p.evaluate(() => window.grimoireEtat().ouvert)));
  const m = await p.evaluate(() => { const m = document.getElementById("grimoire-marque-menu"), i = document.getElementById("grimoire-marque-page"), r = m.getBoundingClientRect();
    return { existe: !!m, gauche: r.left < i.getBoundingClientRect().left, traits: m.querySelectorAll("svg .trait-menu").length, actif: !m.classList.contains("inactif"), carte: !!document.getElementById("grimoire-marque-carte") }; });
  verifier("un marque-page ≡ (trois traits), le plus à gauche ; plus de marque-page de la carte", m.existe && m.gauche && m.traits === 3 && m.actif && !m.carte, JSON.stringify(m));
  await cliquer("#grimoire-btn-compte");
  await attendreQue(async () => (await page()) === 3, 3000);
  await p.waitForTimeout(400);
  const c = await centre("#grimoire-marque-menu");
  await p.mouse.click(c.x, c.y - c.h * 0.3);
  await attendreQue(async () => (await page()) === 1, 3000);
  verifier("le marque-page ≡ ramène à la page principale (le journal)", (await page()) === 1);
});

// La partie (le groupe dans le désert d'Etheria, zone 3).
const boite = (n, x, y) => ({ numero: n, points: [{ x, y }, { x: x + 140, y }, { x: x + 140, y: y + 110 }, { x, y: y + 110 }] });
await p.evaluate((zones) => { window.ZONES_LIVRE = zones; }, { 8: boite(8, 1000, 520), 1: boite(1, 180, 200), 3: boite(3, 380, 560), 7: boite(7, 1150, 220) });
await cliquer("#grimoire-btn-charger"); await p.waitForTimeout(700);
await cliquer('#grimoire-liste-parties [data-id="P1"]'); await p.waitForTimeout(150);
await p.fill("#grimoire-mdp-partie", "sel");
await p.evaluate(() => window.appliquerVoyageDeLaPartie && window.appliquerVoyageDeLaPartie({ Position_Groupe: { Region: 5, x: 0.42, y: 0.55 } }));
await cliquer("#grimoire-valider-partie");
await p.evaluate(() => window.appliquerVoyageDeLaPartie && window.appliquerVoyageDeLaPartie({ Position_Groupe: { Region: 5, x: 0.42, y: 0.55 } }));
await p.waitForTimeout(2500); await pose();

// =========================================================================
titre("3. LE SOMMAIRE : SON NOM, LE TITRE DE LA PARTIE, LES CHIFFRES ROMAINS, LE FOND, LA POLICE ; LES MARQUE-PAGES");
// =========================================================================
await section(async () => {
  await p.evaluate(() => document.getElementById("grimoire-marque-page").click());
  await attendreQue(async () => (await page()) === 3, 6000); await pose(); await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const t = (sel) => [...document.querySelectorAll(sel)].map(e => e.innerText.trim());
    const fonds = [...document.querySelectorAll(".fond-sommaire")].map(f => { const st = getComputedStyle(f); return { img: st.backgroundImage, op: st.opacity, taille: st.backgroundSize, pos: st.backgroundPosition }; });
    return { titre: t(".entete-index")[0], partie: t("#grimoire-nom-partie")[0], gauche: t("#grimoire-page-3 .entree-index"), droite: t("#grimoire-page-4 .entree-index"), fonds,
             police: getComputedStyle(document.querySelector(".entete-index")).fontFamily, policeEntree: getComputedStyle(document.querySelector(".entree-index")).fontFamily,
             charge: [...document.fonts].some(f => /Berkshire/.test(f.family) && f.status === "loaded"),
             etoile: !!document.querySelector("#grimoire-marque-page svg.dessin-etoile"), plume: !!document.querySelector("#grimoire-marque-recit svg.dessin-plume") };
  });
  verifier("« Sommaire » (plus « Index »), et sous lui le titre de la partie", r.titre === "Sommaire" && r.partie === "Les Lames d'Héra", `${r.titre} / ${r.partie}`);
  verifier("I- Aventuriers, II- Carte du monde, III- Le village | IV- Les combats, V- Le récit (plus de Paramètres)",
           r.gauche.join(" | ") === "I- Aventuriers | II- Carte du monde | III- Le village" && r.droite.join(" | ") === "IV- Les combats | V- Le récit", r.gauche.concat(r.droite).join(" | "));
  verifier("le fond du sommaire : l'image de Nico, à 20 %, étirée sur la double page (une moitié par page)",
           r.fonds.length === 2 && r.fonds.every(f => /IMG_2057_ez0wu9\.png/.test(f.img) && f.op === "0.2" && f.taille === "200% 100%") && r.fonds[0].pos !== r.fonds[1].pos, JSON.stringify(r.fonds.map(f => [f.op, f.taille, f.pos])));
  verifier("une écriture manuscrite (v313 : celle choisie dans Paramètres, Shadows Into Light par défaut depuis v340)", /Shadows Into Light/.test(r.police) && /Shadows Into Light/.test(r.policeEntree), `${r.police}`);
  verifier("le marque-page du sommaire : une étoile ; celui du récit : une plume redessinée", r.etoile && r.plume);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v312_sommaire.png" });
  await p.evaluate(() => document.getElementById("grimoire-marque-menu").click());
  await attendreQue(async () => (await page()) === 1, 6000); await pose(); await p.waitForTimeout(300);
  verifier("en partie, le dernier bouton : « Quitter la partie »", await p.evaluate(() => document.querySelector("#grimoire-btn-quitter span").textContent === "Quitter la partie"));
});

// =========================================================================
titre("4. LA CARTE DU MONDE DU LIVRE : LE PION DU GROUPE, LA ROUTE D'UNE RÉGION À L'AUTRE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => window.GRIMOIRE.allerALaCarte());
  await attendreQue(async () => (await page()) === 5, 6000); await pose(); await p.waitForTimeout(700);
  const r = await p.evaluate(() => { const svg = document.getElementById("calque-groupe-livre"), im = svg && svg.querySelector("image");
    return { vu: !!svg && svg.classList.contains("visible"), x: im ? Number(im.getAttribute("x")) + Number(im.getAttribute("width")) / 2 : null, y: im ? Number(im.getAttribute("y")) : null }; });
  verifier("le pion du groupe sur la carte du monde, au centre de la boîte de sa région (le désert, zone 3)", r.vu && Math.abs(r.x - 450) < 1, JSON.stringify(r));
  await p.evaluate(() => window.appliquerVoyageDeLaPartie({ Position_Groupe: { Region: 5, x: 0.42, y: 0.55 },
    Voyage_Groupe: { Id: "V1", Type: "monde", Etat: "vote", Depart: { Region: 5 }, Arrivee: { Region: 1, Nom: "La forêt des murmures" }, Trace: [{ x: 1, y: 1 }, { x: 2, y: 2 }], Votes: {}, Jours: 0, Etapes: [1], Jour: 1 } }));
  await p.waitForTimeout(600);
  const route = await p.evaluate(() => { const ph = document.querySelector("#calque-groupe-livre .route-groupe-livre"); return ph ? ph.getAttribute("d") : null; });
  verifier("un voyage du désert vers la forêt : la route en pointillé, d'une boîte à l'autre", !!route && /^M 450\.0 615\.0 Q .* 250\.0 255\.0$/.test(route), route);
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v312_carte_monde.png" });
  await p.evaluate(() => window.appliquerVoyageDeLaPartie({ Position_Groupe: { Region: 5, x: 0.42, y: 0.55 } }));
  await p.waitForTimeout(400);
  await p.evaluate(() => window.GRIMOIRE.allerALaPage(1)); await pose();
  await p.waitForTimeout(400);
  verifier("ailleurs dans le livre, le pion n'est plus là", !(await p.evaluate(() => document.getElementById("calque-groupe-livre").classList.contains("visible"))));
});

// =========================================================================
titre("5. LE RÉCIT : LE PAPIER D'AVATAR (IMAGE JUSQU'EN BAS, NOM DORÉ, FICHE), LES ÉLÉMENTS FIXES PENDANT UNE TOURNE, LA DICTÉE");
// =========================================================================
await section(async () => {
  await p.evaluate(() => { window.PERSOS_JOUEURS_PARTIE[0].nom = "Ironfoot le Grand des Montagnes"; window.__fiches = []; window.ouvrirFichePerso = (...a) => window.__fiches.push(a); });
  await relayer([{ idDoc: "m1", ID_Partie: "P1", Auteur_ID: "MJ", Auteur_Nom: "MJ", Est_Narration_IA: true, Texte: "La salle sent la bière tiède. <strong style='color: #e8d5a5;'>Varos</strong> essuie une chope.", Timestamp: 1000 }], true);
  await p.evaluate(() => window.GRIMOIRE_RECIT.allerAuRecit());
  await attendreQue(() => p.evaluate(() => document.getElementById("recit-avatar").classList.contains("sortie")), 8000);
  await pose(); await p.waitForTimeout(900);
  const a = await p.evaluate(() => { const pa = document.getElementById("recit-avatar"), u = pa.querySelector(".papier-usure"), c = pa.querySelector(".cadre-portrait"), n = pa.querySelector(".nom-portrait"), st = getComputedStyle(n);
    return { basImage: c.offsetTop + c.offsetHeight, hPapier: u.offsetHeight, uneLigne: n.scrollWidth <= n.clientWidth + 1 && n.offsetHeight < parseFloat(st.fontSize) * 1.6, police: st.fontFamily, dore: /gradient/.test(st.backgroundImage) && /text/.test(st.webkitBackgroundClip || st.backgroundClip), texte: n.textContent }; });
  verifier("l'image descend jusqu'au bas du papier (et un peu au-delà, sous la déchirure)", a.basImage >= a.hPapier, `${a.basImage} / ${a.hPapier}`);
  verifier("le nom en titre doré, sur une seule ligne qui s'ajuste à la largeur", a.uneLigne && a.dore && /Shadows Into Light/.test(a.police) && a.texte === "Thorin Ironfoot le Grand des Montagnes", JSON.stringify(a));
  const pa = await centre("#recit-avatar .papier-usure");
  await p.mouse.click(pa.x - pa.w * 0.25, pa.y);
  await p.waitForTimeout(400);
  const f = await p.evaluate(() => window.__fiches.slice());
  verifier("un toucher sur l'avatar ouvre la fiche du personnage", f.length === 1 && f[0][0] === "H1", JSON.stringify(f));
  // Pendant une tourne, rien ne bouge autour du livre.
  const avant = await p.evaluate(() => ["recit-avatar", "recit-postit", "recit-ecriture"].map(id => document.getElementById(id).classList.contains("sortie")));
  await p.evaluate(() => { window.__sauts = []; const ids = ["recit-avatar", "recit-postit", "recit-ecriture"]; const obs = new MutationObserver(() => window.__sauts.push(ids.map(id => document.getElementById(id).classList.contains("sortie")).join())); ids.forEach(id => obs.observe(document.getElementById(id), { attributes: true, attributeFilter: ["class"] })); window.__obsSauts = obs; });
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.flipNext("top"));
  await p.waitForTimeout(150);
  const pendant = await p.evaluate(() => ["recit-avatar", "recit-postit", "recit-ecriture"].map(id => document.getElementById(id).classList.contains("sortie")));
  // (v313 : après la dernière page du récit viennent les Aventuriers : arrivé là, le
  // papier rentre, à raison. On ne regarde que la tourne elle-même.)
  const sauts = await p.evaluate(() => { window.__obsSauts.disconnect(); return window.__sauts.slice(); });
  await pose(); await p.waitForTimeout(500);
  await p.evaluate(() => window.GRIMOIRE_PAGEFLIP.flipPrev("top"));
  await pose(); await p.waitForTimeout(500);
  verifier("une page du récit qui tourne : l'avatar, le post-it et l'encart d'écriture restent en place", JSON.stringify(pendant) === JSON.stringify(avant) && sauts.length === 0, JSON.stringify({ avant, pendant, sauts }));
  // La dictée : la tête qui parle au-dessus de la plume ; une pause n'efface plus rien.
  const micro = await p.evaluate(() => { const m = document.getElementById("recit-micro"), pl = document.getElementById("recit-envoyer"); if (!m) return null;
    const a = m.getBoundingClientRect(), b = pl.getBoundingClientRect(); return { dessus: a.bottom <= b.top + 1, meme: Math.abs((a.left + a.right) / 2 - (b.left + b.right) / 2) < 8, dessin: !!m.querySelector("svg path.plein") }; });
  verifier("le bouton de la dictée (une tête qui parle, à l'encre) au-dessus de la plume", !!micro && micro.dessus && micro.meme && micro.dessin, JSON.stringify(micro));
  const d = await p.evaluate(async () => {
    const instances = [];
    class FausseReco { constructor() { instances.push(this); this.debut = false; } start() { this.debut = true; } stop() { if (this.onend) this.onend(); } abort() { if (this.onend) this.onend(); } }
    window.SpeechRecognition = FausseReco;
    const saisie = document.getElementById("recit-saisie"); saisie.value = "Je dis :";
    const res = (liste) => { const r = liste.map(([t, fin]) => { const x = [{ transcript: t }]; x.isFinal = fin; return x; }); return { resultIndex: r.length - 1, results: r }; };
    document.getElementById("recit-micro").click();
    await new Promise(r => setTimeout(r, 50));
    const r1 = instances[0];
    r1.onresult(res([["bonjour à tous", true], ["je suis", false]]));
    const t1 = saisie.value;
    r1.onresult(res([["bonjour à tous", true], ["je suis Thorin", true]]));
    r1.onend();                                     // une pause : le navigateur coupe l'écoute
    await new Promise(r => setTimeout(r, 50));
    const r2 = instances[1];
    const relance = !!r2 && r2.debut;
    r2 && r2.onresult(res([["et j'ai soif", false]]));
    const t2 = saisie.value;
    const ecoute = document.getElementById("recit-micro").classList.contains("ecoute");
    document.getElementById("recit-micro").click();  // on arrête
    await new Promise(r => setTimeout(r, 50));
    return { t1, t2, relance, ecoute, fin: document.getElementById("recit-micro").classList.contains("ecoute"), n: instances.length };
  });
  verifier("la dictée ajoute à ce qui est écrit", d.t1 === "Je dis : bonjour à tous je suis", d.t1);
  verifier("après une pause, elle reprend toute seule et AJOUTE à la suite (rien n'est effacé)", d.relance && d.t2 === "Je dis : bonjour à tous je suis Thorin et j'ai soif", d.t2);
  verifier("on la coupe d'un toucher", d.ecoute && !d.fin, JSON.stringify(d));
  if (CAPTURES) await p.screenshot({ path: CAPTURES + "/v312_recit.png" });
});

// =========================================================================
titre("6. L'ARBITRE DES DÉS : DEUX CLÉS, ET FLASH-LITE SUR N'IMPORTE QUEL ÉCHEC");
// =========================================================================
await section(async () => {
  const appels = [];
  await p.route('**/generativelanguage.googleapis.com/**', r => {
    const u = r.request().url(), cle = new URL(u).searchParams.get("key"), modele = (u.match(/models\/([^:]+):/) || [])[1];
    const corps = JSON.parse(r.request().postData() || "{}"), sys = ((corps.systemInstruction || {}).parts || [{}])[0].text || "";
    if (!/MIA_DES/.test(sys)) return r.fallback();
    appels.push([modele, cle]);
    if (cle === "cle-banc") return r.fulfill({ status: 402, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: '{"error":{"message":"credits"}}' });
    if (modele === "gemini-3.8-flash") return r.fulfill({ status: 500, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'}, body: '{"error":{"message":"interne"}}' });
    r.fulfill({ status: 200, contentType: 'application/json', headers: {'Access-Control-Allow-Origin':'*'},
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"jets":[{"heros":"Thorin","caracteristique":"CHARISME","difficulte":"difficile","action":"bluffer le garde"}]}' }] } }] }) });
  });
  const jets = await p.evaluate(async () => window.__arbitreDesBanc(
    { actions: [{ Auteur_ID: "H1", Auteur_Nom: "Thorin", Texte: "Je dis au garde que le seigneur Malkor m'envoie." }], demandes: [], narration: null },
    [{ idPersonnage: "H1", prenom: "Thorin" }]));
  verifier("la première clé à court de crédit (402) : la seconde prend le relais", appels.some(([, c]) => c === "cle-banc") && appels.some(([, c]) => c === "cle-seconde"), JSON.stringify(appels));
  verifier("le modèle du Narrateur en échec (500) : Flash-Lite arbitre ; la réponse en texte JSON est lue : un jet de Charisme", jets.length === 1 && jets[0].caracteristique === "CHARISME" && jets[0].difficulte === "difficile"
           && appels.some(([m]) => m === "gemini-flash-lite-latest"), JSON.stringify(jets));
  await p.unroute('**/generativelanguage.googleapis.com/**');
});

// =========================================================================
titre("7. LE NARRATEUR : LA RÉGION EN DÉCOR, UN LIEU À LA FOIS, LE BLUFF, L'ANTIQUITÉ, LES HÉROS ; LES PNJ QUI COMPTENT");
// =========================================================================
await section(async () => {
  const env = await p.evaluate(async () => window.contexteEnvironnementMJ({ Position_Groupe: { Region: 5, x: 0.42, y: 0.55 }, Situation: "Dans la nature" }, { silencieux: true, sansAnalyse: true }));
  verifier("la région est un décor de fond, pas une usine à rencontres ; laisser respirer les joueurs", /DÉCOR DE FOND/.test(env) && /usine à rencontres/.test(env) && /respirer/.test(env), env.slice(-400));
  verifier("le bluff d'un héros n'est pas un fait : le nom inventé n'apparaît pas", /TU RESTES LE MAÎTRE DU JEU/.test(env) && /bluffe, invente un nom/.test(env));
  verifier("l'Antiquité : jamais d'arbalète", /jamais d'arbalète/.test(env));
  const ia = lire("ia_master.js");
  verifier("les héros du groupe (genre, peuple, classe) envoyés au Narrateur", /LES HÉROS DU GROUPE \(accorde-les selon leur genre/.test(ia) && /femme \(elle\)/.test(ia));
  verifier("MIA_CASTING et le détecteur : seulement les personnages qui comptent, pas de fiche pour un bluff",
           /IMPORTANCE \(v312\) : seulement un personnage qui a un minimum d'importance/.test(ia) && /IMPORTANCE \(v312\) : ne liste un nom que si ce personnage COMPTE/.test(ia) && /UN BLUFF N'EST PAS UN FAIT/.test(ia));
  verifier("le Narrateur : les deux clés, et une relance rapide après une coupure réseau (QUIC)", /clesGeminiPour\(\)/.test(ia) && /erreur\.statut \? 4000 : 400/.test(ia));
  verifier("plus d'arbalétrier dans le bestiaire ; le dessin des pions refuse l'arbalète", !/archer, arbalétrier/.test(lire("monstres.js")) && /never a crossbow/.test(lire("app.js")));
  verifier("les POI : un lieu, pas une foire (pas de rencontres annexes)", /UN LIEU, PAS UNE FOIRE/.test(lire("poi_creation.js")) && /sans ajouter d'autre lieu ni d'autre rencontre/.test(lire("voyage_groupe.js")));
  const c = lire("combat_rp.js");
  verifier("MIA_TERRAIN_COMBAT : le modèle du Narrateur, sobre en murs", /narrateur: true/.test(c) && /SOBRIÉTÉ \(v312\)/.test(c) && /bloquees: 0\.3/.test(c));
  const cb = lire("combat.js");
  verifier("la piste d'initiative : un tiers plus petite (×1,14), sans jauges de PV ni de fatigue", /ECHELLE_PISTE_INITIATIVE = 1\.14/.test(cb) && !/pctPv|pctFatigue/.test(cb));
});

// =========================================================================
titre("8. IPAD : LE LIVRE UN PEU PLUS HAUT ; LES VERSIONS");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => { const f = document.querySelector(".grimoire-fond-livre").getBoundingClientRect(); return { bas: innerHeight - f.bottom, vh: innerHeight }; });
  verifier("1194 × 834 : 4 % de marge sous le livre (au lieu de 1,2 %)", Math.abs(r.bas - r.vh * 0.04) < 2, `${r.bas.toFixed(1)} px`);
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  const vJson = JSON.parse(lire('version.json') || "{}").version;
  verifier("version 312 ou plus (trace_combat.js, version.json)", vTrace >= 312 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const vv = (f) => Number((html.match(new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  verifier("les fichiers touchés ont changé de version", vv("grimoire.js") >= 14 && vv("grimoire.css") >= 11 && vv("grimoire_recit.js") >= 11 && vv("ia_master.js") >= 20 && vv("combat.js") >= 158 && vv("trace_combat.js") >= 217);
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
