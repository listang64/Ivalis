// v423 — LE PILOTE DES COMBATS DE TEST (mode DEV), SUR LA VRAIE PAGE.
// Nico : « en mode dev, dans les combats, deux flèches au niveau de l'avatar de
// notre perso, pour contrôler tous les tours des personnages joueurs : une seule
// personne peut lancer des combats de test » ; « l'avatar suit, pour indiquer au
// développeur sur quel perso il est » ; « dès qu'il sélectionne une compétence,
// ça passe au personnage joueur suivant, ou il le fait à la main avec les
// flèches » ; « regarde que l'animation ne merde pas, genre en attente de
// l'animation des autres joueurs ». (La mise en place : celle de v405.)
// Le côté cerveau : corrections_v423_cerveau.mjs.
// Lancer : node tests_monstres/corrections_v423.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) {
    res.writeHead(404); res.end('non trouvé'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// Mêmes doublures Firebase que demarrage_reel.mjs : rien n'écrit nulle part,
// tout le reste (combat.js, mouvement.js, moteur_effets.js, competences.js)
// est le vrai code.
const FAUX_APP = `export const initializeApp = () => ({ nom: "faux" });`;
const FAUX_FIRESTORE = `
  // firebase-config.js fabrique la base avec des options (le transport sondé
  // plutôt que subi, pour l'iPad) : le bouchon doit donc offrir cette porte-là,
  // sinon le module ne se charge pas et rien du jeu ne s'initialise.
  export const initializeFirestore = () => ({ faux: true });
  export const getFirestore = () => ({ faux: true });
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {};
  export const updateDoc = async () => {};
  export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "neuf" });
  export const deleteField = () => "«champ supprimé»";
  export class FieldPath { constructor(...segments) { this.segments = segments; } }
  export const arrayUnion = (...v) => v;
  export const arrayRemove = (...v) => v;
  export const increment = (n) => n;
  export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({ a });
  export const where = (...a) => ({ a });
  export const orderBy = (...a) => ({ a });
  export const limit = (...a) => ({ a });
  export const writeBatch = () => ({ update: () => {}, set: () => {}, delete: () => {}, commit: async () => {} });
  export const runTransaction = async (_db, fn) => fn({
    get: async () => ({ exists: () => true, data: () => ({}) }), update: () => {}, set: () => {} });
  export const Timestamp = { now: () => Date.now() };
`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });

await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({
  contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({
  contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE }));

const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });



const CAPTURES = process.env.V423_CAPTURES || "";
const lire = (f) => { try { return fs.readFileSync(path.join(RACINE, f), 'utf-8'); } catch (e) { return ""; } };
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);
const G = (f, a) => p.evaluate(f, a);
const titre = (t) => console.log("\n" + t);
const section = async (f) => { try { await f(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 180)); } };
const cap = async (nom) => { if (CAPTURES) await p.screenshot({ path: CAPTURES + "/" + nom + ".png" }); };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

// LE MONDE : Cybile (H1, à moi, P_01), Pliors (H2, à Ben, P_02), Jade (H3, au repos),
// un leurre (illusion de Cybile), deux créatures.
await G(() => {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById("fenetre-combat").style.display = "block";
  localStorage.setItem("ID_JOUEUR_COURANT", "P_01");
  window.ID_PARTIE_COURANTE = "P1";
  window.jouerSonClic = () => {};
  window.estCombattantMort = (id) => (window.MORTS || []).includes(id);
  window.estMonstre = (id) => String(id).startsWith("M");
  window.sequenceTourEnAttente = () => false;
  window.MORTS = [];
  window.PLATEAU_VTT = { getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    hexToPixel: (q, r) => ({ x: 300 + q * 60, y: 300 + r * 60 }), pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {} };
  window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
  const fiche = (id, extra) => Object.assign({ idPersonnage: id, prenom: id, camp: "Allié", PV_Max: 60, PV_Actuels: 60,
    Fatigue_Max: 100, fatigueActuelle: 100, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", Force: 10, Dexterite: 10, Intelligence: 10, Constitution: 10 }, extra || {});
  window.PERSOS_PARTIE = [
    fiche("H1", { idJoueur: "P_01", prenom: "Cybile", urlCloudinary: "https://res.cloudinary.com/x/image/upload/v1/cybile.png" }),
    fiche("H2", { idJoueur: "P_02", prenom: "Pliors", urlCloudinary: "https://res.cloudinary.com/x/image/upload/v1/pliors.png" }),
    fiche("H3", { idJoueur: "P_03", prenom: "Jade", actif: false }),
    fiche("I1", { idJoueur: "P_01", prenom: "Leurre", estIllusion: true }),
    fiche("M1", { camp: "Ennemi", estMonstre: true, prenom: "Goule" }),
    fiche("M2", { camp: "Ennemi", estMonstre: true, prenom: "Spectre" })
  ];
  window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, H2: { q: 0, r: 1 }, I1: { q: 1, r: 1 }, M1: { q: 3, r: 0 }, M2: { q: 4, r: 0 } };
  window.TOKEN_SELECTIONNE = null;
  window.ZONES_PERSISTANTES = {}; window.CHEMIN_MOUVEMENT = [];
  window.REGIME_CERVEAU = true;
  window.PISTE_MANCHE = { manche: 0, ordre: [] };
  window.PARTIE_DATA = { Phase_Combat: "Preparation", Tour_Combat: 1, Ordre_Initiative: ["H1", "H2", "M1", "M2"], File_Attente_Combat: [], Ont_Joue_Ce_Round: [] };
  // Les cartes : une par héros.
  const carte = (nom, init) => ({ Nom: nom, Arme: "Non spécifié", Element: "Aucun", Fatigue: 10, Initiative: init, Cout_PC: 3, Effets_Compiles: [{ nom: "Attaque légère", desc: "4 dégats physique" }] });
  window.COMPETENCES_CACHE = Object.assign(window.COMPETENCES_CACHE || {}, { C_H1: carte("Coup de Cybile", 40), C_H2: carte("Trait de Pliors", 30) });
  window.CACHE_COMPETENCES_GLOBAL = Object.assign(window.CACHE_COMPETENCES_GLOBAL || {}, { H1: { C_H1: window.COMPETENCES_CACHE.C_H1 }, H2: { C_H2: window.COMPETENCES_CACHE.C_H2 } });
  window.raisonBlocageCarte = () => "";
  // L'écriture de la partie, en mémoire : la transaction s'applique à PARTIE_DATA.
  window.__ecritures = [];
  window.modifierPartieOuEchec = async (fn) => { const r = fn(JSON.parse(JSON.stringify(window.PARTIE_DATA))); if (r && r.maj) { Object.assign(window.PARTIE_DATA, JSON.parse(JSON.stringify(r.maj))); window.__ecritures.push(r.maj); } return { ok: true }; };
  window.__decks = [];
  const vrai = window.chargerCompetencesCombat;
  window.chargerCompetencesCombat = function (id, c) { window.__decks.push(id); try { return vrai.apply(this, arguments); } catch (e) { return null; } };
  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
});
await p.route(/cybile\.png|pliors\.png/, r => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: PNG }));
const dev = (oui) => G((oui) => localStorage.setItem("ivalis_DEV_MODE", oui ? "on" : "off"), oui);
const pilote = (oui) => G((oui) => window.basculerPiloteCombat(oui), oui);
const ids = () => G(() => (window.COMBAT_PERSOS_JOUEUR || []).map(h => h.idPersonnage).join(","));
const nomHud = () => G(() => (document.getElementById("hud-nom-heros-texte") || {}).textContent || "");
const fleches = () => G(() => { const b = document.getElementById("pilote-fleches"); return !!b && b.style.display !== "none"; });
const montre = () => G(() => ((window.COMBAT_PERSOS_JOUEUR || [])[window.COMBAT_INDEX_PERSO] || {}).idPersonnage);

titre("1. SANS LE PILOTE : RIEN NE CHANGE");
await section(async () => {
  await dev(false); await pilote(false);
  await G(() => { window.initialiserPersosCombat(); window.actualiserHudHeros(); });
  verifier("mes héros : Cybile seule (pas Pliors, ni le leurre, ni les créatures)", await ids() === "H1", await ids());
  verifier("je ne commande pas Pliors ; ce n'est pas « mon héros »", await G(() => !window.commandeParMoi(window.PERSOS_PARTIE[1], "P_01") && !window.estMonHerosCombat("H2")));
  verifier("mes demandes partent à mon nom", await G(() => window.posteDeLIntention("H2", "P_01") === "P_01"));
  verifier("pas de flèches", !(await fleches()));
  await dev(true); await pilote(false);
  await G(() => { window.initialiserPersosCombat(); window.actualiserHudHeros(); });
  verifier("mode DEV seul (sans la case) : toujours Cybile seule, pas de flèches", await ids() === "H1" && !(await fleches()));
  await dev(false); await pilote(true);
  await G(() => { window.initialiserPersosCombat(); window.actualiserHudHeros(); });
  verifier("la case seule (sans le mode DEV) : toujours Cybile seule", await ids() === "H1" && !(await fleches()));
});

titre("2. LE PILOTE : TOUS LES HÉROS JOUEURS, DEUX FLÈCHES AUTOUR DE L'AVATAR");
await section(async () => {
  await dev(true); await pilote(true);
  verifier("ses héros : Cybile puis Pliors (ni Jade au repos, ni le leurre, ni les créatures)", await ids() === "H1,H2", await ids());
  verifier("il commande Pliors, pas une créature", await G(() => window.commandeParMoi(window.PERSOS_PARTIE[1], "P_01") && !window.commandeParMoi(window.PERSOS_PARTIE[4], "P_01")));
  verifier("Pliors est « son héros » pour la fenêtre de tour (une créature, non)", await G(() => window.estMonHerosCombat("H2") && !window.estMonHerosCombat("M1")));
  verifier("une demande pour Pliors part au nom de Ben (P_02)", await G(() => window.posteDeLIntention("H2", "P_01") === "P_02" && window.posteDeLIntention("H1", "P_01") === "P_01"));
  await G(() => window.actualiserHudHeros());
  verifier("deux flèches, « Pilote 1/2 », l'avatar et le nom de Cybile", await fleches() && /Pilote 1\/2/.test(await G(() => document.querySelector(".rang-pilote").textContent)) && /Cybile/.test(await nomHud()), await nomHud());
  const pos = await G(() => { const ref = document.getElementById("hud-nom-heros-texte").getBoundingClientRect(), av = document.getElementById("hud-avatar-heros").getBoundingClientRect();
    const g = document.querySelector(".fleche-pilote.gauche").getBoundingClientRect(), d = document.querySelector(".fleche-pilote.droite").getBoundingClientRect();
    return { ok: g.right <= ref.left + 2 && d.left >= ref.right - 2 && g.width > 20 && Math.abs((g.top + g.bottom) / 2 - (ref.top + ref.bottom) / 2) < 3 && g.top >= av.top && g.left >= 0 && d.right <= innerWidth, g, d, ref }; });
  verifier("…de part et d'autre du nom, sur l'avatar, dans l'écran", pos.ok, JSON.stringify({ g: [pos.g.left, pos.g.top], d: [pos.d.left, pos.d.right], ref: [pos.ref.left, pos.ref.right, pos.ref.top] }));
  verifier("…cliquables par-dessus le bandeau", await G(() => { const d = document.querySelector(".fleche-pilote.droite").getBoundingClientRect(); const el = document.elementFromPoint(d.left + d.width / 2, d.top + d.height / 2); return !!el && el.classList.contains("fleche-pilote"); }));
  await cap("v423-pilote-cybile");
  await G(() => { window.__decks = []; document.querySelector(".fleche-pilote.droite").click(); });
  verifier("► : Pliors (le nom, son deck, « Pilote 2/2 »)", await montre() === "H2" && /Pliors/.test(await nomHud()) && await G(() => window.__decks.includes("H2") && /2\/2/.test(document.querySelector(".rang-pilote").textContent)), await nomHud());
  await cap("v423-pilote-pliors");
  await G(() => document.querySelector(".fleche-pilote.gauche").click());
  verifier("◄ : retour à Cybile", await montre() === "H1" && /Cybile/.test(await nomHud()));
  await G(() => document.querySelector(".fleche-pilote.gauche").click());
  verifier("◄ encore : on fait le tour (Pliors)", await montre() === "H2");
  await G(() => document.querySelector(".fleche-pilote.droite").click());
});

titre("3. LA PRÉPARATION : UNE COMPÉTENCE RETENUE, ON PASSE AU HÉROS SUIVANT");
await section(async () => {
  await G(() => window.jouerCarteCombat("C_H1"));
  verifier("Cybile retient sa carte : elle est dans la file", await G(() => window.PARTIE_DATA.File_Attente_Combat.some(x => x.idPersonnage === "H1" && x.idCarte === "C_H1")));
  verifier("…et l'avatar passe tout seul à Pliors (son deck rouvert)", await montre() === "H2" && /Pliors/.test(await nomHud()) && await G(() => window.VOLET_COMPETENCES_OUVERT !== false && window.__decks.slice(-1)[0] === "H2"), await nomHud());
  await G(() => window.jouerCarteCombat("C_H2"));
  verifier("Pliors retient la sienne : les deux héros sont dans la file", await G(() => ["H1", "H2"].every(id => window.PARTIE_DATA.File_Attente_Combat.some(x => x.idPersonnage === id))));
  verifier("…personne d'autre à faire choisir : l'avatar reste sur Pliors", await montre() === "H2");
  await G(() => { window.PARTIE_DATA.File_Attente_Combat = []; window.COMBAT_INDEX_PERSO = 0; window.afficherPersoCombatActuel(); });
  await G(() => window.jouerReposLong());
  verifier("un repos long retenu fait de même (au suivant : Pliors)", await montre() === "H2" && await G(() => window.PARTIE_DATA.File_Attente_Combat.some(x => x.idPersonnage === "H1" && x.idCarte === "REPOS_LONG")));
  await G(() => { window.MORTS = ["H2"]; window.PARTIE_DATA.File_Attente_Combat = []; window.COMBAT_INDEX_PERSO = 0; window.afficherPersoCombatActuel(); });
  await G(() => window.jouerCarteCombat("C_H1"));
  verifier("un héros à terre est sauté (Cybile reste montrée)", await montre() === "H1");
  await G(() => { window.MORTS = []; });
});

titre("4. LA RÉSOLUTION : L'AVATAR SUIT LE HÉROS DONT C'EST LE TOUR");
await section(async () => {
  await G(() => { window.COMBAT_INDEX_PERSO = 0; window.afficherPersoCombatActuel();
    Object.assign(window.PARTIE_DATA, { Phase_Combat: "Resolution", Tour_Combat: 2, File_Attente_Combat: [{ idPersonnage: "H2", idCarte: "C_H2", initiative: 30 }, { idPersonnage: "M1", idCarte: "X", initiative: 20 }, { idPersonnage: "H1", idCarte: "C_H1", initiative: 10 }] });
    window.rafraichirAffichageCombat(); });
  verifier("au tour de Pliors : l'avatar passe sur lui, son pion est sélectionné", await montre() === "H2" && /Pliors/.test(await nomHud()) && await G(() => window.TOKEN_SELECTIONNE === "H2"));
  await G(() => window.actualiserBoutonFinTour());
  verifier("…et le bouton est à lui (son tour se joue d'ici)", await G(() => window.MODE_BOUTON_FINTOUR !== "eteint"), await G(() => window.MODE_BOUTON_FINTOUR));
  // L'animation : le spectateur (spectateur_combat.js) ne retient derrière le OK que les tours qui ne sont pas « à moi ».
  verifier("…l'animation de son tour se joue sans attendre de OK ; celle d'une créature attend, comme avant", await G(async () => {
    const S = await import("/spectateur_combat.js");
    const a = (acteur) => S.prochaineEtape(0, { 1: { v: 1, acteur, manche: 2 } }, null, (id) => window.estMonHerosCombat(id)).quoi;
    return a("H2") === "jouer" && a("H1") === "jouer" && a("M1") === "attendre"; }));
  await G(() => { document.querySelector(".fleche-pilote.gauche").click(); window.rafraichirAffichageCombat(); });
  verifier("les flèches restent libres pendant son tour (on regarde Cybile, l'avatar ne revient pas de force)", await montre() === "H1");
  await G(() => { window.PARTIE_DATA.File_Attente_Combat = window.PARTIE_DATA.File_Attente_Combat.slice(1); window.rafraichirAffichageCombat(); });
  verifier("au tour de la Goule : l'avatar ne bouge pas (une créature n'est pas pilotée)", await montre() === "H1");
  await G(() => { window.COMBAT_INDEX_PERSO = 1; window.afficherPersoCombatActuel(); window.PARTIE_DATA.File_Attente_Combat = window.PARTIE_DATA.File_Attente_Combat.slice(1); window.rafraichirAffichageCombat(); });
  verifier("au tour de Cybile : l'avatar la suit", await montre() === "H1" && /Cybile/.test(await nomHud()) && await G(() => window.TOKEN_SELECTIONNE === "H1"));
  await cap("v423-resolution");
});

titre("5. APRÈS LE COMBAT : LES BLESSURES, LE BUTIN, LE RETOUR AU RÉCIT");
await section(async () => {
  const fin = { blessures: { H1: { idJoueur: "P_01", tirages: [{ a: 1 }] }, H2: { idJoueur: "P_02", tirages: [{ a: 2 }] } } };
  verifier("le pilote voit les blessures des deux héros", await G((fin) => window.blessuresDuPoste(fin).map(b => b.idPersonnage).join(",") === "H1,H2", fin));
  verifier("…sans le pilote, seulement celles de Cybile", await G(async (fin) => { window.basculerPiloteCombat(false); const r = window.blessuresDuPoste(fin).map(b => b.idPersonnage).join(","); window.basculerPiloteCombat(true); return r === "H1"; }, fin));
  verifier("le butin : Pliors compte parmi les héros du poste (pas le leurre, pas une créature)", await G(() => window.estHerosDuPoste(window.PERSOS_PARTIE[1], "P_01") && !window.estHerosDuPoste(window.PERSOS_PARTIE[3], "P_01") && !window.estHerosDuPoste(window.PERSOS_PARTIE[4], "P_01")));
  const lo = lire("loot.js"), rp = lire("combat_rp.js");
  verifier("loot.js : la fenêtre personnelle et le partage passent par estHerosDuPoste", (lo.match(/estHerosDuPoste\(p, joueurId\)/g) || []).length === 2);
  verifier("combat_rp.js : le pilote revient au récit pour tous les joueurs du combat", /piloteCombat\(\)\s*\n?\s*\? \[\.\.\.new Set\(\[idJoueur\(\), \.\.\.joueursAttendus\(/.test(rp));
});

titre("6. LES PARAMÈTRES, ET LA CASE QUI S'ÉTEINT");
await section(async () => {
  const gp = lire("grimoire_parametres.js");
  verifier("la case « Piloter tous les héros en combat » n'existe qu'en mode DEV", /\(modeDev\(\) \? `<button type="button" class="case-parametre\$\{pilote\(\) \? " coche" : ""\}" id="grimoire-param-pilote"/.test(gp) && /Piloter tous les héros en combat/.test(gp));
  await pilote(false);
  verifier("décochée en plein combat : la liste revient à Cybile, les flèches partent", await ids() === "H1" && !(await fleches()));
  verifier("…et Pliors n'est plus « à moi »", await G(() => !window.estMonHerosCombat("H2") && window.posteDeLIntention("H2", "P_01") === "P_01"));
});

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
await b.close(); serveur.close();
process.exit(echecs ? 1 : 0);
