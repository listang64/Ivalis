// LES CORRECTIONS DE LA v252.
//
//   1. « Dis-moi combien de dégâts on a rajouté en triche aux monstres ? Mets
//      dans Paramètres > Monstres, en haut du tableau, la valeur de dégâts
//      qu'on pourra modifier à la volée, et aussi leur nombre de
//      déplacements. »
//   2. « Le bouton Paramètres sur la page principale : mets-le en bas, en
//      dessous de Combat et Mission. »
//   3. « Les images des compétences des personnages doivent s'effacer de
//      Cloudinary si on détruit le personnage. Vérifie que les images de leurs
//      objets sont aussi bien effacées. »
//   4. « Pour les Vargens : vérifie que leur déplacement divisé par deux
//      retire bien la fatigue divisée par deux. »
//   5. « L'animation d'une attaque magique de glace au CàC : elle va un
//      hexagone plus loin que sa cible. »
import fs from 'fs'; import http from 'http'; import path from 'path';
import * as MP from '../moteur_pur.js';
import * as IA from '../ia_pure.js';
import { construireEtatCombat } from '../combat_etat.js';
import { jouerCreature } from '../cerveau_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(74)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const fiche = (id, camp, extra = {}) => ({
    idPersonnage: id, camp, prenom: id, PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});

console.log("\n=========================================================");
console.log("  LES CORRECTIONS DE LA v252");
console.log("=========================================================");

console.log("\n1a. LA TRICHE ET LA MARCHE DES CRÉATURES, RÉGLÉES DANS LE MOTEUR");
{
    const regleBonus = typeof MP.reglerBonusMonstres === "function" ? MP.reglerBonusMonstres : null;
    const reglePas = typeof IA.reglerPasMonstres === "function" ? IA.reglerPasMonstres : null;
    const coup = () => {
        const etat = construireEtatCombat({ idPartie: "P1", cerveau: "P1", graine: 5,
            combattants: [fiche("H1", "Allié", { idJoueur: "P1" }), fiche("M1", "Ennemi", { estMonstre: true, Palier: "Normal" })],
            positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } },
            partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["M1", "H1"], File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "CM" }] } });
        const r = MP.resoudreCarte(etat, { type: "carte", idLanceur: "M1", idCarte: "CM", critique: false,
            attaques: [{ valeurBrute: 10, typeRes: "Physique", cibles: ["H1"] }], alterations: [],
            jets: { attaqueRatee: false, parCible: { H1: { esquive: false, etats: {} } } } });
        return 100 - r.etat.combattants.H1.pv;
    };
    // (v255 : la triche est un % du brut, 10 % à l'origine.)
    verifier("à l'origine : une créature Normale tape 10 + 10 %", coup() === 11, `${coup()}`);
    if (regleBonus) regleBonus({ Petit: 10, Normal: 50, "Élite": 10, Boss: 10 });
    verifier("réglée à +50 % : la même frappe fait 15", coup() === 15, `${coup()}`);
    if (regleBonus) regleBonus({ Petit: 10, Normal: -10, "Élite": 10, Boss: 10 });
    verifier("réglée à −10 % : 9 (la triche peut aussi adoucir)", coup() === 9, `${coup()}`);
    if (regleBonus) regleBonus(null);
    verifier("un réglage vide revient aux chiffres d'origine", coup() === 11, `${coup()}`);

    const marche = () => {
        const etat = construireEtatCombat({ idPartie: "P1", cerveau: "P1", graine: 5,
            combattants: [fiche("H1", "Allié", { idJoueur: "P1" }), fiche("M1", "Ennemi", { estMonstre: true, Palier: "Normal" })],
            positions: { H1: { q: 0, r: 0 }, M1: { q: 9, r: 0 } },
            partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["M1", "H1"], File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "CM" }] } });
        const r = jouerCreature(etat, "M1", { idCarte: "CM", infos: { portee: 1, fatigue: 5 },
            attaques: [{ valeurBrute: 8, rangeMax: 1, typeRes: "Physique" }], alterations: [] }, null);
        return (r ? r.entree.etapes : []).filter(e => e.type === "pas" && e.acteur === "M1").length;
    };
    verifier("à l'origine : une créature Normale marche 5 cases", marche() === 5, `${marche()}`);
    if (reglePas) reglePas({ Petit: 6, Normal: 2, "Élite": 4, Boss: 4 });
    verifier("réglée à 2 : elle n'en marche plus que 2", marche() === 2, `${marche()}`);
    verifier("l'Élite sans accent suit l'Élite", IA.pasMaxDe({ palier: "Elite" }) === 4 && IA.pasMaxDe({ palier: "Élite" }) === 4);
    if (reglePas) reglePas({ Petit: 6, Normal: 0, "Élite": 4, Boss: 4 });
    verifier("réglée à 0 : elle ne bouge plus", marche() === 0, `${marche()}`);
    if (reglePas) reglePas(null);
    verifier("un réglage vide revient aux chiffres d'origine (5)", marche() === 5, `${marche()}`);
}

console.log("\n3. UN PERSONNAGE DÉTRUIT EMPORTE TOUTES SES IMAGES (compétences comprises)");
{
    const src = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8');
    const debut = src.indexOf('async function supprimerPersonnageBDD(idPersonnage) {');
    const fin = src.indexOf('\n}\n', src.indexOf('🧹 [Nettoyage] Terminé', debut)) + 3;
    const fonction = src.slice(debut, fin);
    const extraire = (fichier, marqueur, finLigne = '};') => {
        const lignes = fs.readFileSync('/home/user/Ivalis/' + fichier, 'utf-8').split('\n');
        const d = lignes.findIndex(l => l.startsWith(marqueur));
        let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
        return lignes.slice(d, f + 1).join('\n');
    };
    const SRC_MENAGE = [
        extraire('ia_master.js', 'const estTransformationCloudinary = (seg) =>',
                 "    !seg.includes('.') && seg.split(',').every(part => /^[a-z]{1,3}_[^,/]+$/.test(part));"),
        extraire('ia_master.js', 'function idPublicCloudinary(urlImage) {', '}'),
        'window.idPublicCloudinary = idPublicCloudinary;',
        extraire('loot.js', 'window.imagesEncoreUtilisees = function(options) {'),
        extraire('loot.js', 'window.oublierImages = async function(urls, raison, options) {')
    ].join('\n\n');
    const U = (n) => `https://res.cloudinary.com/x/upload/v1/${n}.png`;
    const base = {
        Personnages: { PERSO_1: { Prenom_Personnage: "Ysolde", ID_Partie: "", URL_Cloudinary: U("portrait"), URL_Avatar_Equipe: U("avatar"),
            URL_Token: U("pion"), Compagnon_Image: U("compagnon"), Compagnon_Token: U("compagnon_pion"),
            Equip_Armure: { uid: "o1", image: U("cotte") }, Equip_Main_Droite: { uid: "o2", image: U("arc") }, Equip_Main_Gauche: { uid: "o3", image: U("carquois") } } },
        "Personnages/PERSO_1/Competences": { C1: { Nom: "Tir précis", URL_Image: U("illus_tir") }, C2: { Nom: "Volée", URL_Image: U("illus_volee") }, C3: { Nom: "Sans image" } },
        Caracteristiques: { PERSO_1: {} }
    };
    const doc = (...a) => { const p = a.slice(1); return { collection: p.slice(0, -1).join("/"), id: p[p.length - 1] }; };
    const collection = (...a) => ({ collection: a.slice(1).join("/") });
    const query = (col, ...filtres) => ({ ...col, filtres });
    const where = (champ, op, val) => ({ champ, val });
    const getDoc = async (ref) => { const d = (base[ref.collection] || {})[ref.id]; return { exists: () => !!d, data: () => JSON.parse(JSON.stringify(d)) }; };
    const getDocs = async (q) => { const col = base[q.collection] || {}; let ids = Object.keys(col);
        (q.filtres || []).forEach(f => { ids = ids.filter(id => col[id][f.champ] === f.val); });
        const docs = ids.map(id => ({ id, data: () => col[id] }));
        return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn) => docs.forEach(fn) }; };
    const deleteDoc = async (ref) => { delete (base[ref.collection] || {})[ref.id]; };
    const updateDoc = async () => {};
    const writeBatch = () => { const ops = []; return { delete: (ref) => ops.push(ref), commit: async () => ops.forEach(r => delete (base[r.collection] || {})[r.id]) }; };
    const detruites = [], annulees = [];
    const w = { ID_PARTIE_COURANTE: null, PERSOS_PARTIE: [], PERSOS_JOUEURS_PARTIE: [], TOKENS_VTT_DATA: {}, SOURCE_COMBATTANTS: {},
                CACHE_COMPETENCES_GLOBAL: {}, RESERVE_CONNUE: {}, PARTIE_DATA: {},
                supprimerImageCloudinary: async (url) => { detruites.push(url); },
                annulerIllustration: (p, c) => annulees.push(p + "/" + c) };
    const ls = { getItem: (k) => (k === "ivalis_CLOUDINARY_API_SECRET" ? "secret" : null), removeItem: () => {} };
    new Function('window', 'localStorage', 'console', SRC_MENAGE)(w, ls, console);
    const sauve = { window: global.window, localStorage: global.localStorage };
    global.window = w; global.localStorage = ls;
    const executer = new Function('window', 'db', 'COL', 'doc', 'getDoc', 'getDocs', 'deleteDoc', 'updateDoc', 'query', 'collection', 'where', 'writeBatch', 'deleteField',
        fonction + '; return supprimerPersonnageBDD;')(w, {}, { PERSONNAGES: "Personnages", CARACTERISTIQUES: "Caracteristiques", PARTIES: "Systeme_Parties" },
        doc, getDoc, getDocs, deleteDoc, updateDoc, query, collection, where, writeBatch, () => null);
    await executer("PERSO_1");
    global.window = sauve.window; global.localStorage = sauve.localStorage;
    const noms = detruites.map(u => u.split("/").pop().replace(".png", ""));
    verifier("les illustrations de ses compétences quittent Cloudinary", noms.includes("illus_tir") && noms.includes("illus_volee"), noms.join(", "));
    verifier("les dessins de ses trois objets aussi", ["cotte", "arc", "carquois"].every(n => noms.includes(n)), noms.join(", "));
    verifier("le portrait et le pion de son compagnon aussi", noms.includes("compagnon") && noms.includes("compagnon_pion"), noms.join(", "));
    verifier("et son portrait, son avatar, son pion", ["portrait", "avatar", "pion"].every(n => noms.includes(n)));
    verifier("dix images en tout, chacune une fois", detruites.length === 10 && new Set(detruites).size === 10, `${detruites.length}`);
    verifier("une illustration encore en file est annulée", annulees.length === 3, annulees.join(", "));
    verifier("(ses compétences sont effacées de la base)", Object.keys(base["Personnages/PERSO_1/Competences"]).length === 0);
}
// =========================================================================
const RACINE = '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id }); export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data, opt) => { (window.__setDocs = window.__setDocs || []).push({ chemin: ref && ref.chemin, data: JSON.parse(JSON.stringify(data)), opt }); }; export const updateDoc = async () => {};
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = (q, cb) => { const s = window.__snap; window.__snap = null; if (s && typeof cb === 'function') setTimeout(() => cb(s), 0); return () => {}; };
  export const query = (...a) => ({a});
  export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com/**', r => r.fulfill({ contentType: 'image/svg+xml', headers: { 'Access-Control-Allow-Origin': '*' },
  body: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="95" fill="#2a6ad8"/></svg>` }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(1800);

await p.evaluate(() => {
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById("fenetre-combat").style.display = "block";
  window.jouerSonClic = () => {};
  window.sequenceTourEnAttente = () => false;
  const s = 36;
  window.PLATEAU_VTT = {
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    hexToPixel: (q, r) => ({ x: 300 + 1.5 * s * q, y: 330 + s * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r) }),
    pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {}, hexSize: s
  };
  window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
  const f = (id, extra) => Object.assign({ idPersonnage: id, prenom: id, camp: "Allié", PV_Max: 60, PV_Actuels: 60,
    Fatigue_Max: 100, fatigueActuelle: 100, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant" }, extra || {});
  window.PERSOS_PARTIE = [f("H1", { prenom: "Aldric", race: "Ondari" }),
                          f("M1", { camp: "Ennemi", estMonstre: true, prenom: "Gobelin" }),
                          f("M2", { camp: "Ennemi", estMonstre: true, prenom: "Orc" })];
  const url = "https://res.cloudinary.com/x/image/upload/portrait.png";
  window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0, url, taille: 55 }, M1: { q: 1, r: 0, taille: 55 }, M2: { q: 2, r: -2, taille: 55 } };
  window.ZONES_PERSISTANTES = {};
  window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 2, File_Attente_Combat: [] };
  window.DELAI_DEPLOIEMENT_MS = 0;
  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
  window.__sons = []; window.__textes = [];
  const vraiSon = window.jouerSonCombat;
  window.jouerSonCombat = (id, f) => { window.__sons.push(id); return vraiSon(id, f); };
  const vraiTexte = window.afficherMessageFlottantHex;
  window.afficherMessageFlottantHex = (q, r, t, c, o) => { window.__textes.push(t); return vraiTexte(q, r, t, c, o); };
  // La glissade d'avant pose le pion « avec transition » (positionnerTokenVTT(…, false)).
  const vraiPos = window.positionnerTokenVTT;
  window.__glissades = 0;
  window.positionnerTokenVTT = (el, sansTransition) => { if (!sansTransition) window.__glissades++; return vraiPos(el, sansTransition); };
  window.__noter = () => { window.__sons = []; window.__textes = []; window.__glissades = 0; };
  window.__guetter = () => {
    const vus = { textes: new Set(), filets: 0, frayeur: 0, lames: 0, sceaux: 0, eclats: 0 }; let fini = false;
    const tour = () => {
      document.querySelectorAll("#conteneur-tokens-vtt .anim-effet").forEach(e => {
        vus.textes.add((e.textContent || "").trim());
        if (e.classList.contains("anim-filet-air")) vus.filets++;
        if (e.classList.contains("anim-frayeur")) vus.frayeur++;
        if (e.querySelector && e.querySelector("polygon")) vus.sceaux++;
      });
      vus.lames = Math.max(vus.lames, document.querySelectorAll("#conteneur-tokens-vtt .entaille-lame").length);
      vus.eclats = Math.max(vus.eclats, document.querySelectorAll("#conteneur-tokens-vtt .anim-effet").length);
      if (!fini) requestAnimationFrame(tour);
    };
    requestAnimationFrame(tour);
    return () => { fini = true; return { icones: [...vus.textes].filter(Boolean).join(" "), filets: vus.filets, frayeur: vus.frayeur, lames: vus.lames, sceaux: vus.sceaux, eclats: vus.eclats }; };
  };
  // `neuves` : sans les animations qui tournaient déjà.
  window.__animsDe = (id, neuves) => {
    const el = document.getElementById("token-" + id), vues = new Set(neuves && el ? el.getAnimations() : []), images = []; let fini = false;
    const tour = () => { if (el) el.getAnimations().forEach(an => { if (!vues.has(an)) { vues.add(an); images.push(an.effect.getKeyframes().map(k => (k.transform || "") + "|" + (k.filter || ""))); } });
                         if (!fini) requestAnimationFrame(tour); };
    requestAnimationFrame(tour);
    return () => { fini = true; return images; };
  };
  window.__case = (id) => { const el = document.getElementById("token-" + id); return el ? el.dataset.q + "," + el.dataset.r : null; };
  window.__attendre = (ms) => new Promise(r => setTimeout(r, ms));
});


// =========================================================================
//  DANS LA PAGE DU JEU
// =========================================================================
await p.evaluate(() => { window.__ou = (f, d) => { try { return f(); } catch (e) { return d; } }; });

console.log("\n1b. EN HAUT DU TABLEAU DES MONSTRES : LA TRICHE ET LA MARCHE, À LA VOLÉE");
{
  const r = await p.evaluate(async () => {
    const MP = await import('./moteur_pur.js'), IA = await import('./ia_pure.js');
    window.__ou(() => window.dessinerReglagesMonstres(), null);
    const champs = [...document.querySelectorAll("#tbody-reglages-monstres input")];
    const lire = (famille) => [...document.querySelectorAll("#tbody-reglages-monstres input")]
      .filter(i => i.dataset.famille === famille).map(i => i.value).join("/");
    const sorts = document.getElementById("reglage-bonus-sorts");
    const bloc = document.getElementById("reglages-monstres"), table = document.getElementById("conteneur-table-monstres");
    const auDessus = !!(bloc && table && (bloc.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING));
    const avant = { degats: lire("bonusDegats"), marche: lire("deplacement"), sorts: sorts ? sorts.value : null };
    const changer = (famille, palier, v) => { const i = champs.find(x => x.dataset.famille === famille && x.dataset.palier === palier);
      if (!i) return false; i.value = String(v); i.dispatchEvent(new Event("change")); return true; };
    window.__setDocs = [];
    changer("bonusDegats", "Normal", 4);
    changer("deplacement", "Boss", 7);
    changer("deplacement", "Petit", 999);
    if (sorts) { sorts.value = "35"; sorts.dispatchEvent(new Event("change")); }
    await new Promise(r => setTimeout(r, 50));
    const apres = {
      bonusNormal: MP.bonusMonstreDe({ estMonstre: true, palier: "Normal" }),
      pasBossCerveau: IA.pasMaxDe({ palier: "Boss" }), pasBossPreparation: window.__ou(() => window.pasMaxMonstre({ Palier: "Boss" }), null),
      pasPetit: IA.pasMaxDe({ palier: "Petit" }), champPetit: (champs.find(x => x.dataset.famille === "deplacement" && x.dataset.palier === "Petit") || {}).value,
      sorts: window.__ou(() => window.multiplicateurSortsMonstre({ estMonstre: true }), null),
      ecrit: (window.__setDocs || []).filter(d => d.chemin === "Monstres_Modeles/_REGLAGES").map(d => JSON.stringify(d.data) + (d.opt && d.opt.merge ? "+merge" : "")) };
    // Un autre poste change un chiffre : la base le porte ici.
    window.__ou(() => window.appliquerReglagesMonstres({ Bonus_Degats_Pct: { Petit: 1, Normal: 2, "Élite": 3, Boss: 4 }, Bonus_Sorts_Pct: 10,
                                                           Deplacement: { Petit: 3, Normal: 3, "Élite": 3, Boss: 3 } }), null);
    const ailleurs = { degats: lire("bonusDegats"), marche: lire("deplacement"), boss: MP.bonusMonstreDe({ estMonstre: true, palier: "Boss" }),
                       pas: IA.pasMaxDe({ palier: "Normal" }), sorts: window.__ou(() => window.multiplicateurSortsMonstre({ estMonstre: true }), null) };
    window.__ou(() => window.appliquerReglagesMonstres(null), null);
    const retour = { bonus: MP.bonusMonstreDe({ estMonstre: true, palier: "Normal" }), pas: IA.pasMaxDe({ palier: "Boss" }),
                     sorts: window.__ou(() => window.multiplicateurSortsMonstre({ estMonstre: true }), null) };
    return { n: champs.length, auDessus, avant, apres, ailleurs, retour };
  });
  verifier("le bloc est en haut, au-dessus du tableau des gabarits", r.auDessus === true);
  // (v262 : plus de colonne Élite — Petit, Normal, Boss.)
  verifier("six cases : les dégâts en plus et la marche, par stature", r.n === 6, `${r.n}`);
  // (v255 : la triche est en % du brut, 10 % pour chaque stature.)
  verifier("on y lit la triche d'aujourd'hui : +10 % partout", r.avant.degats === "10/10/10", r.avant.degats);
  verifier("la marche d'aujourd'hui : 6 / 5 / 4", r.avant.marche === "6/5/4", r.avant.marche);
  verifier("et le bonus des sorts : 20 %", r.avant.sorts === "20", String(r.avant.sorts));
  verifier("Normale à +4 % : le moteur frappe à +4 % tout de suite", r.apres.bonusNormal === 4, `${r.apres.bonusNormal}`);
  verifier("Boss à 7 cases : le cerveau ET la préparation le savent", r.apres.pasBossCerveau === 7 && r.apres.pasBossPreparation === 7,
           `${r.apres.pasBossCerveau} / ${r.apres.pasBossPreparation}`);
  verifier("une saisie folle est bornée (999 → 15 cases)", r.apres.pasPetit === 15 && r.apres.champPetit === "15", `${r.apres.pasPetit} « ${r.apres.champPetit} »`);
  verifier("sorts à 35 % : leurs effets valent ×1,35", Math.abs(r.apres.sorts - 1.35) < 1e-9, `${r.apres.sorts}`);
  verifier("chaque changement s'écrit (Monstres_Modeles/_REGLAGES, fusionné)", r.apres.ecrit.length === 4 && r.apres.ecrit.every(x => x.endsWith("+merge")),
           r.apres.ecrit.join(" | "));
  verifier("un autre poste change les chiffres : ce poste les suit", r.ailleurs.degats === "1/2/4" && r.ailleurs.marche === "3/3/3"
           && r.ailleurs.boss === 4 && r.ailleurs.pas === 3 && Math.abs(r.ailleurs.sorts - 1.1) < 1e-9, JSON.stringify(r.ailleurs));
  verifier("sans réglage en base : les chiffres d'origine", r.retour.bonus === 10 && r.retour.pas === 4 && Math.abs(r.retour.sorts - 1.2) < 1e-9,
           JSON.stringify(r.retour));
  const src = fs.readFileSync('/home/user/Ivalis/monstres.js', 'utf-8');
  verifier("le document des réglages n'est pas lu comme un gabarit", /startsWith\("_"\)/.test(src));
}

console.log("\n2. LE BOUTON PARAMÈTRES, EN BAS, SOUS COMBAT ET MISSION");
{
  const ordre = await p.evaluate(() => [...document.querySelectorAll("#menu-lateral .texte-banniere")].map(e => e.textContent.trim()));
  verifier("le menu : Narration, Héros, Rencontre, Journal, puis Paramètres",
           ordre.join(",") === "Narration,Héros,Rencontre,Journal,Paramètres", ordre.join(", "));
}

console.log("\n4. LE VARGEN PAIE SA MARCHE MOITIÉ PRIX (vérification)");
{
  const r = await p.evaluate(async () => {
    const CE = await import('./combat_etat.js'), MV = await import('./mouvement_pur.js');
    const regles = { pvMax: window.pvMaxCombattant, fatigueMax: window.fatigueMaxCombattant, esquive: window.esquiveCombattant,
      parade: window.paradeCombattant, defPhysique: window.defPhysiqueCombattant, defMagique: window.defMagiqueCombattant,
      critique: window.critiqueCombattant, atouts: window.atoutRace, bonusEquip: window.bonusEquip };
    const marcher = (race) => {
      const fiche = { idPersonnage: "V1", camp: "Allié", race, prenom: "V", PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, fatigueActuelle: 100,
                      Etats_Alteres: [], statut: "Vivant", caracs: {}, talents: {} };
      const e = CE.construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: [fiche], positions: { V1: { q: 0, r: 0 } },
        partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["V1"] }, regles });
      const t = MV.planifierTrajet(e, "V1", Array.from({ length: 8 }, (_, i) => ({ q: i + 1, r: 0 })), null);
      return t.pas.map(x => x.cout).join(" ") + " = " + t.cout;
    };
    return { atout: (window.atoutRace({ race: "Vargen" }) || {}).diviseurDeplacement, humain: marcher("Humain"), vargen: marcher("Vargen") };
  });
  verifier("l'atout du peuple : déplacement ÷ 2", r.atout === 2, String(r.atout));
  verifier("le cerveau : 8 cases coûtent 30 ⚡ à un Humain", /= 30$/.test(r.humain), r.humain);
  verifier("…et 15 ⚡ à un Vargen (1 1 1 2 2 2 3 3)", r.vargen === "1 1 1 2 2 2 3 3 = 15", r.vargen);
}

console.log("\n5. LA GLACE RATÉE AU CONTACT : LES PICS SE BRISENT À CÔTÉ, PAS UNE CASE PLUS LOIN");
{
  const essai = (q, r, touche) => p.evaluate(async ({ q, r, touche }) => {
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "A", camp: "Allié", PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, fatigueActuelle: 100, Etats_Alteres: [], statut: "Vivant" },
                            { idPersonnage: "M1", prenom: "G", camp: "Ennemi", estMonstre: true, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, fatigueActuelle: 100, Etats_Alteres: [], statut: "Vivant" }];
    window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0, taille: 55 }, M1: { q, r, taille: 55 } };
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    await new Promise(r => setTimeout(r, 300));
    const calque = document.getElementById("conteneur-tokens-vtt"), c = calque.getBoundingClientRect();
    const centre = (id) => { const t = document.getElementById("token-" + id).getBoundingClientRect(); return { x: t.left - c.left + t.width / 2, y: t.top - c.top + t.height / 2, t: t.width }; };
    const cible = centre("M1"), lanceur = centre("H1");
    const fins = new Map(); let fini = false;
    const sonde = () => { calque.querySelectorAll(".anim-pic-glace").forEach(e => { const b = e.getBoundingClientRect(); fins.set(e, { x: b.left - c.left + b.width / 2, y: b.top - c.top + b.height / 2 }); }); if (!fini) requestAnimationFrame(sonde); };
    sonde();
    await window.animerAttaqueCombat({ pion: "H1", cibles: ["M1"], touches: touche ? ["M1"] : [], element: "Glace", carte: "C1" });
    fini = true;
    const vers = [...fins.values()];
    return { t: cible.t, dCible: vers.map(f => Math.round(Math.hypot(f.x - cible.x, f.y - cible.y))),
             depasse: vers.map(f => Math.round(Math.hypot(f.x - lanceur.x, f.y - lanceur.y) - Math.hypot(cible.x - lanceur.x, cible.y - lanceur.y))) };
  }, { q, r, touche });
  const rate = await essai(1, 0, false), touche = await essai(1, 0, true), loin = await essai(3, -1, false);
  verifier("ratés au contact : ils restent à moins d'un pion de la cible", rate.dCible.length === 5 && rate.dCible.every(d => d <= rate.t),
           `${rate.dCible.join(",")} (pion ${Math.round(rate.t)})`);
  verifier("…et ne la dépassent que d'un demi-pion au plus", rate.depasse.every(d => d <= rate.t * 0.6), rate.depasse.join(","));
  verifier("…sans la traverser (aucun pic sur elle)", rate.dCible.every(d => d >= rate.t * 0.4), rate.dCible.join(","));
  verifier("à distance aussi", loin.dCible.every(d => d <= loin.t && d >= loin.t * 0.4), loin.dCible.join(","));
  verifier("touchée : les pics se plantent toujours dans la cible", touche.dCible.every(d => d <= touche.t * 0.35), touche.dCible.join(","));
}

verifier("aucune erreur JS dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
