// v263 — LES REPÈRES À CHAQUE COMBAT, LE NIVEAU DU GROUPE, L'ENCART EN SYMBOLES
//
// Nico :
//  · « Quand on réinitialise un combat, on choisit encore les spawn joueur et
//    ennemi qui arrivent en premier sur la map. Ensuite les renforts viendront
//    par les hexagones spawn. »
//  · « Le niveau du groupe, à mettre quelque part, qui se met à jour dès un
//    changement de niveau, un départ ou une arrivée dans le groupe, car il va
//    être lu par plusieurs choses — c'est le niveau du personnage le plus fort. »
//  · « Les résistances des monstres : du niveau 1 à 4 : les petits 0, les
//    normaux 1, les leaders et boss 2. Du 5 à 8 : petits 1, normaux 1, leaders
//    et boss 3. Du 9 à 10 : petits 1, normaux 2, leaders et boss 4. »
//  · « Le pourcentage de bonus triche des monstres selon le niveau du groupe,
//    à changer dans le panneau Monstres : PV en plus, % de dégâts et de soins en
//    plus. Du niveau 1 à 4 : base de 7 + 1 × niveau ; du 5 à 10 : base de 5 +
//    2 × niveau — au niveau 1, 8 % et 8 PV. »
//  · « Les dégâts de distorsion qui s'envolent : en violet clair. »
//  · L'encart de la compétence jouée : la distance en haut à droite (une petite
//    cible, le nombre en blanc) ; les dégâts physiques en explosion rouge, les
//    magiques en baguette bleu ciel, la distorsion en tête violet clair qui
//    ondule, les soins en croix verte, chacun avec son montant de la même
//    couleur (les mêmes que les chiffres qui s'envolent) ; les états comme
//    avant ; « (Sur 2 Tours) » sur un montant étalé ; la surpuissance en or à
//    côté.
//
// PREMIÈRE PARTIE, DANS LE NOYAU (Node) :
//   1. les couleurs des chiffres qui s'envolent ;
//   2. la triche du niveau, la même pour toutes les statures, dans le moteur ;
//   3. la relève en leader emporte les résistances de son nouveau rang.
// SECONDE PARTIE, SUR LA VRAIE PAGE (faux Firestore) :
//   4. le niveau du groupe : le plus fort, à jour, affiché, annoncé ;
//   5. la triche selon le niveau : le calcul, le moteur, les PV des créatures ;
//   6. son encart dans Paramètres > Monstres ;
//   7. les résistances des créatures selon le niveau ;
//   8. les repères redemandés à chaque réinitialisation, le départ autour du
//      repère, les renforts par les cases peintes ;
//   9. l'encart de la compétence jouée, en symboles ;
//  10. la distance en haut à droite de l'encart ;
//  11. les versions.
// Le banc se charge sur l'ancien code (IVALIS_RACINE) : il y échoue, sans planter.
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const essai = (f, d = null) => { try { return f(); } catch (e) { return d; } };
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf-8');
const titre = (t) => { console.log("\n========================================================="); console.log("  " + t); console.log("========================================================="); };

const CE = await import(path.join(RACINE, 'combat_etat.js'));
const MP = await import(path.join(RACINE, 'moteur_pur.js'));
const PC = await import(path.join(RACINE, 'pont_combat.js'));

const BLEU_CIEL = "#7fd0ff", VIOLET_CLAIR = "#c9a2ff", ROUGE = "#ff4c4c", VERT = "#8cf08c";

titre("1. LES CHIFFRES QUI S'ENVOLENT : BLEU CIEL, VIOLET CLAIR");
{
  const C = PC.COULEURS_CHIFFRE || {};
  verifier("dégâts magiques : bleu ciel", C.magique === BLEU_CIEL, C.magique);
  verifier("Distorsion mentale : violet clair", C.mental === VIOLET_CLAIR, C.mental);
  verifier("physiques rouges, soins verts : inchangés", C.physique === ROUGE && C.soin === VERT, `${C.physique} / ${C.soin}`);
  const etat = { combattants: { M1: { id: "M1", etats: [] } }, zones: {} };
  const coul = (e) => essai(() => PC.couleurDuChiffre(e, etat), null);
  verifier("un coup de Distorsion mentale s'envole en violet clair", coul({ type: "degats", nature: "mental" }) === VIOLET_CLAIR, coul({ type: "degats", nature: "mental" }));
  verifier("la brûlure de fin de manche, en bleu ciel", coul({ type: "degats", tic: "Brûlure" }) === BLEU_CIEL, coul({ type: "degats", tic: "Brûlure" }));
  verifier("la palette est offerte à la page (window.pontCombat.COULEURS_CHIFFRE)",
           /window\.pontCombat = \{[^}]*COULEURS_CHIFFRE/.test(lire('pont_combat.js')));
}

titre("2. LA TRICHE DU NIVEAU, LA MÊME POUR TOUTES LES STATURES");
{
  // Ce que Paramètres > Monstres pose dans le noyau au niveau 1 du groupe.
  essai(() => MP.reglerBonusMonstres({ Petit: 8, Normal: 8, "Élite": 8, Boss: 8 }));
  const b = (c) => essai(() => MP.bonusMonstreDe(c), null);
  verifier("au niveau 1 : +8 % pour un Petit, un Normal, un Boss",
           b({ estMonstre: true, palier: "Petit" }) === 8 && b({ estMonstre: true, palier: "Normal" }) === 8 && b({ estMonstre: true, palier: "Boss" }) === 8,
           `${b({ estMonstre: true, palier: "Petit" })} / ${b({ estMonstre: true, palier: "Normal" })} / ${b({ estMonstre: true, palier: "Boss" })}`);
  verifier("un leader y ajoute ses 15 : +23 %", b({ estMonstre: true, palier: "Normal", leader: true }) === 23, `${b({ estMonstre: true, palier: "Normal", leader: true })}`);
  verifier("le soin d'une créature : 20 brut → 21,6 (×1,08, au centième)", essai(() => MP.appliquerBonusMonstre(20, 8), null) === 21.6);
  essai(() => MP.reglerBonusMonstres(null));
}

titre("3. LA RELÈVE EN LEADER EMPORTE LES RÉSISTANCES DE SON RANG");
{
  const fiche = { idPersonnage: "M1", estMonstre: true, camp: "Ennemi", Palier: "Normal", releveEnLeader: true,
                  resistancesEtats: ["Peur"], resistancesEnLeader: ["Peur", "Glacé"],
                  PV_Max: 50, PV_Actuels: 50, Fatigue_Max: 100 };
  const c = essai(() => CE.combattantDepuisFiche(fiche, { q: 1, r: 0 }), {}) || {};
  verifier("la fiche « se relèvera en leader » porte ses résistances de leader au combat",
           JSON.stringify(c.resistancesEnLeader) === '["Peur","Glacé"]', JSON.stringify(c.resistancesEnLeader));
  const etat = { format: 1, version: 3, manche: 1, phase: "Resolution", graine: 7, file: [], ordre: ["H1", "M1"], zones: {},
                 combattants: { H1: { ...essai(() => CE.combattantDepuisFiche({ idPersonnage: "H1", camp: "Allié", PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 100 }, { q: 0, r: 0 }), {}) }, M1: c } };
  if (etat.combattants.M1) etat.combattants.M1.pv = 0;
  const etapes = essai(() => CE.tomber(etat, "M1", "H1"), []) || [];
  const releve = etapes.find(e => e.type === "releveLeader");
  verifier("mise KO, elle se relève, et l'étape dit ses nouvelles résistances",
           !!releve && JSON.stringify(releve.resistances) === '["Peur","Glacé"]', releve ? JSON.stringify(releve.resistances) : etapes.map(e => e.type).join(","));
  const m = etat.combattants.M1 || {};
  verifier("debout, leader, avec deux résistances (Peur, Glacé)", m.leader === true && JSON.stringify((m.atouts || {}).resistances) === '["Peur","Glacé"]',
           JSON.stringify((m.atouts || {}).resistances));
  // Rejouée par un spectateur : le même combattant.
  const avant = { ...etat, combattants: { M1: { ...c, pv: 0, aTerre: false, atouts: { resistances: ["Peur"] } } } };
  const apres = releve ? essai(() => CE.appliquerEtape(avant, releve), null) : null;
  verifier("rejouée : les mêmes résistances, et plus de « résistances à venir »",
           !!apres && JSON.stringify(apres.combattants.M1.atouts.resistances) === '["Peur","Glacé"]' && !("resistancesEnLeader" in apres.combattants.M1),
           apres ? JSON.stringify(apres.combattants.M1.atouts) : "");
  // Une créature d'avant (sans résistances de leader) garde les siennes.
  const vieille = essai(() => CE.combattantDepuisFiche({ ...fiche, resistancesEnLeader: undefined }, { q: 1, r: 0 }), {}) || {};
  const e2 = { ...etat, combattants: { H1: etat.combattants.H1, M1: { ...vieille, pv: 0 } } };
  const r2 = (essai(() => CE.tomber(e2, "M1", "H1"), []) || []).find(e => e.type === "releveLeader");
  verifier("une créature d'avant (sans liste de leader) garde les siennes", !!r2 && !("resistances" in r2)
           && JSON.stringify((e2.combattants.M1.atouts || {}).resistances) === JSON.stringify((vieille.atouts || {}).resistances),
           JSON.stringify((e2.combattants.M1.atouts || {}).resistances));
}

// =========================================================================
//  SECONDE PARTIE : LA VRAIE PAGE
// =========================================================================
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
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  const docs = () => (window.__docs = window.__docs || {});
  export const getDoc = async (ref) => { const d = docs()[ref.chemin]; return { exists: () => !!d, data: () => JSON.parse(JSON.stringify(d || {})) }; };
  export const getDocs = async (ref) => { const l = ((window.__collections || {})[ref && ref.col] || []).map(x => ({ id: x.id, data: () => x.data }));
    return { forEach: (f) => l.forEach(f), docs: l, empty: l.length === 0 }; };
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data, options });
    docs()[ref.chemin] = options && options.merge ? { ...(docs()[ref.chemin] || {}), ...data } : data; };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data });
    if (docs()[ref.chemin]) Object.assign(docs()[ref.chemin], JSON.parse(JSON.stringify(data))); };
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a}); export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
  export const writeBatch = () => { const ops = []; return { set(ref, d){ ops.push({ chemin: ref.chemin, data: d }); }, update(ref, d){ ops.push({ chemin: ref.chemin, data: d }); },
    delete(){}, commit: async () => { (window.__lots = window.__lots || []).push(...ops); } }; };
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
// La plaque de l'encart (injoignable d'ici) : un bouchon carré.
const PLAQUE = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect x="120" y="160" width="890" height="840" rx="40" fill="#1d1712"/></svg>`;
const PION = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="96" fill="#c44"/></svg>`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: /IMG_2122/.test(r.request().url()) ? PLAQUE : PION }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(1500);
await p.evaluate(() => {
  window.__ou = (f, d) => { try { return f(); } catch (e) { return d; } };
  window.__ouAsync = async (f, d) => { try { return await f(); } catch (e) { return d; } };
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById('fenetre-combat').style.display = 'block';
  window.initialiserPlateau();
  window.ID_PARTIE_COURANTE = "P1";
  window.PARTIE_DATA = { Tour_Combat: 1 };
  window.TOKENS_VTT_DATA = {};
  window.jouerSonClic = () => {};
  window.__docs = { "Systeme_Parties/P1": { Ordre_Initiative: ["H1", "H2"] } };
  window.__hex = (t) => t ? t.q + "," + t.r : null;
  window.__dist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((-a.q - a.r) - (-b.q - b.r)));
  window.__ecran = (q, r) => { const px = window.PLATEAU_VTT.hexToPixel(q, r);
    return { x: window.VTT_POS_X + px.x * window.VTT_SCALE, y: window.VTT_POS_Y + px.y * window.VTT_SCALE }; };
  // Les héros du groupe : XP 0 → niveau 1, 1200 → 3, 2500 → 5, 6400 → 9.
  window.__heros = (liste) => liste.map(([id, prenom, xp, extra]) => ({ idPersonnage: id, prenom, camp: "Allié", xp, PV_Max: 40, PV_Actuels: 40,
    Fatigue_Max: 100, fatigueActuelle: 100, Etats_Alteres: [], statut: "Vivant", ...(extra || {}) }));
});

titre("4. LE NIVEAU DU GROUPE : LE PLUS FORT, À JOUR, AFFICHÉ");
{
  const r = await p.evaluate(async () => {
    const res = {};
    const annonces = [];
    window.addEventListener("niveau-groupe", (e) => annonces.push(e.detail && e.detail.niveau));
    const poser = (liste) => { window.PERSOS_JOUEURS_PARTIE = window.__heros(liste); window.__ou(() => window.recomposerCombattants(), null); return window.NIVEAU_GROUPE; };
    res.depart = poser([["H1", "Aldric", 1200], ["H2", "Cybile", 0]]);
    res.heros = window.NIVEAU_GROUPE_HEROS;
    res.monte = poser([["H1", "Aldric", 1200], ["H2", "Cybile", 2500]]);
    res.herosMonte = window.NIVEAU_GROUPE_HEROS;
    res.depart2 = poser([["H1", "Aldric", 1200]]);
    res.arrivee = poser([["H1", "Aldric", 1200], ["H3", "Bryn", 6400]]);
    // Ni une créature, ni une illusion, ni un héros mis de côté ne comptent.
    res.ecartes = poser([["H1", "Aldric", 1200], ["M1", "Ogre", 9999, { estMonstre: true }], ["I1", "Reflet", 9999, { estIllusion: true }],
                         ["H4", "Absent", 9999, { actif: false }]]);
    res.annonces = annonces.slice();
    // Affiché : la fenêtre 💀 et l'encart de la triche.
    window.__ou(() => window.ouvrirGenerationRencontre(), null);
    res.popup = ((document.querySelector("#etape-generation-rencontre .niveau-groupe-texte") || {}).textContent || "").trim();
    window.__ou(() => window.fermerGenerationRencontre(), null);
    window.__ou(() => window.dessinerReglagesMonstres(), null);
    res.reglages = ((document.querySelector("#reglages-monstres .niveau-groupe-texte") || {}).textContent || "").trim();
    // Une fonction pour qui veut le lire, sans passer par la variable.
    res.fonction = window.__ou(() => window.niveauDuGroupe(window.__heros([["X", "X", 7900], ["Y", "Y", 0]])).niveau, null);
    return res;
  });
  verifier("le groupe au niveau de son plus fort : Aldric, niveau 3", r.depart === 3 && r.heros === "Aldric", `${r.depart} (${r.heros})`);
  verifier("Cybile passe niveau 5 : le groupe aussi, tout de suite", r.monte === 5 && r.herosMonte === "Cybile", `${r.monte} (${r.herosMonte})`);
  verifier("Cybile s'en va : le groupe retombe au niveau 3", r.depart2 === 3, `${r.depart2}`);
  verifier("Bryn arrive, niveau 9 : le groupe passe niveau 9", r.arrivee === 9, `${r.arrivee}`);
  verifier("ni créature, ni illusion, ni héros mis de côté ne comptent", r.ecartes === 3, `${r.ecartes}`);
  verifier("chaque changement s'annonce (événement « niveau-groupe »)", JSON.stringify(r.annonces) === "[3,5,3,9,3]", JSON.stringify(r.annonces));
  verifier("la fenêtre 💀 l'affiche, avec la triche qui va avec", /Niveau du groupe : 3/.test(r.popup) && /Aldric/.test(r.popup) && /\+10 %/.test(r.popup) && /\+10 PV/.test(r.popup), r.popup);
  verifier("l'encart de la triche aussi", /Niveau du groupe : 3/.test(r.reglages), r.reglages);
  verifier("lisible par tous : window.niveauDuGroupe (un groupe niveau 10)", r.fonction === 10, `${r.fonction}`);
}

titre("5. LA TRICHE SELON LE NIVEAU : LE CALCUL, LE MOTEUR, LES PV");
{
  const r = await p.evaluate(async () => {
    const res = {};
    window.__ou(() => window.appliquerReglagesMonstres(null), null);
    res.table = Array.from({ length: 10 }, (_, i) => window.__ou(() => window.tricheDuNiveau(i + 1), null));
    const MP = window.moteurPur || {};
    const bonus = (palier, leader) => window.__ou(() => MP.bonusMonstreDe({ estMonstre: true, palier, ...(leader ? { leader: true } : {}) }), null);
    window.PERSOS_JOUEURS_PARTIE = window.__heros([["H1", "Aldric", 0]]);
    window.__ou(() => window.recomposerCombattants(), null);
    res.niv1 = { petit: bonus("Petit"), normal: bonus("Normal"), boss: bonus("Boss"), chef: bonus("Normal", true) };
    window.PERSOS_JOUEURS_PARTIE = window.__heros([["H1", "Aldric", 2500]]);
    window.__ou(() => window.recomposerCombattants(), null);
    res.niv5 = { petit: bonus("Petit"), normal: bonus("Normal"), boss: bonus("Boss") };
    // Les PV : autant que le %. Créée au niveau 5 du groupe.
    window.__ecrits = [];
    const gab = { Cle: "dps_cac__normal", Archetype: "DPS CAC", Palier: "Normal", PV: 60, Res_Physique: 20, Res_Magique: 10, Fatigue_Max: 100 };
    const d = await window.__ouAsync(() => window.creerMonstreDepuisGabarit("MONSTRE_T1", gab, {}), null);
    res.pv5 = d ? [d.PV_Max, d.PV_Actuels] : null;
    res.chef5 = window.__ou(() => window.champsLeader(gab), null);
    window.PERSOS_JOUEURS_PARTIE = window.__heros([["H1", "Aldric", 0]]);
    window.__ou(() => window.recomposerCombattants(), null);
    const d1 = await window.__ouAsync(() => window.creerMonstreDepuisGabarit("MONSTRE_T2", gab, {}), null);
    res.pv1 = d1 ? d1.PV_Max : null;
    return res;
  });
  verifier("le calcul : 8, 9, 10, 11 (7 + niveau) puis 15, 17, 19, 21, 23, 25 (5 + 2 × niveau)",
           JSON.stringify(r.table) === "[8,9,10,11,15,17,19,21,23,25]", JSON.stringify(r.table));
  verifier("groupe niveau 1 : +8 % de dégâts et de soins, pour toutes les statures",
           r.niv1.petit === 8 && r.niv1.normal === 8 && r.niv1.boss === 8, JSON.stringify(r.niv1));
  verifier("…et un leader +23 % (8 + 15)", r.niv1.chef === 23, `${r.niv1.chef}`);
  verifier("le groupe passe niveau 5 : le moteur frappe à +15 %, tout de suite", r.niv5.petit === 15 && r.niv5.normal === 15 && r.niv5.boss === 15, JSON.stringify(r.niv5));
  verifier("une créature créée au niveau 5 : 60 + 15 PV", JSON.stringify(r.pv5) === "[75,75]", JSON.stringify(r.pv5));
  verifier("un leader au niveau 5 : 60 + 15 + 15 PV", !!r.chef5 && r.chef5.PV_Max === 90, JSON.stringify(r.chef5));
  verifier("au niveau 1 : 60 + 8 PV (« au niveau 1, 8 PV en plus »)", r.pv1 === 68, `${r.pv1}`);
}

titre("6. SON ENCART DANS PARAMÈTRES > MONSTRES");
{
  const r = await p.evaluate(async () => {
    const res = {};
    window.NIVEAU_GROUPE = 1;
    window.__ou(() => window.appliquerReglagesMonstres(null), null);
    window.__ou(() => window.dessinerReglagesMonstres(), null);
    const champs = () => [...document.querySelectorAll("#corps-triche-niveau input")];
    res.champs = champs().map(i => i.dataset.cle + "=" + i.value).join(" ");
    res.dansLeBloc = !!document.querySelector("#reglages-monstres #reglages-triche-niveau #corps-triche-niveau");
    res.colonnes = [...document.querySelectorAll("#corps-triche-niveau .table-triche-niveau tbody td")].map(td => td.textContent.trim());
    res.actuel = [...document.querySelectorAll("#corps-triche-niveau .table-triche-niveau thead th.niveau-actuel")].map(th => th.textContent.trim());
    res.lignesStature = [...document.querySelectorAll("#tbody-reglages-monstres tr")].map(tr => tr.querySelector("td").textContent.trim());
    res.titreBloc = (document.querySelector("#reglages-monstres > .reglages-monstres-entete .reglages-monstres-nom") || {}).textContent;
    // Le MJ change la base des niveaux 1 à 4.
    window.__ecrits = [];
    const changer = (cle, v) => { const i = champs().find(x => x.dataset.cle === cle); if (!i) return; i.value = String(v); i.dispatchEvent(new Event("change")); };
    changer("base14", 12);
    changer("parNiveau510", 999);
    await new Promise(res2 => setTimeout(res2, 50));
    const MP = window.moteurPur || {};
    res.apres = { bonus: window.__ou(() => MP.bonusMonstreDe({ estMonstre: true, palier: "Boss" }), null),
                  pente: (champs().find(x => x.dataset.cle === "parNiveau510") || {}).value,
                  ecrit: (window.__ecrits || []).filter(e => e.chemin === "Monstres_Modeles/_REGLAGES").map(e => JSON.stringify(e.data) + (e.options && e.options.merge ? "+merge" : "")),
                  colonne1: ((document.querySelector("#corps-triche-niveau .table-triche-niveau tbody td:nth-child(2)") || {}).textContent || "").trim() };
    // Un autre poste : la base apporte ses chiffres ici.
    window.__ou(() => window.appliquerReglagesMonstres({ Triche_Niveau: { Base_1_4: 3, Par_Niveau_1_4: 2, Base_5_10: 0, Par_Niveau_5_10: 3 } }), null);
    res.ailleurs = { champs: champs().map(i => i.value).join("/"), n1: window.__ou(() => window.tricheDuNiveau(1), null), n10: window.__ou(() => window.tricheDuNiveau(10), null) };
    window.__ou(() => window.appliquerReglagesMonstres(null), null);
    res.retour = window.__ou(() => window.tricheDuNiveau(1), null);
    return res;
  });
  verifier("quatre réglages : 7 + 1 × niveau, 5 + 2 × niveau", r.champs === "base14=7 parNiveau14=1 base510=5 parNiveau510=2", r.champs);
  verifier("dans le bloc des réglages, en haut du tableau", r.dansLeBloc === true);
  verifier("la table des dix niveaux : 8 … 25", JSON.stringify(r.colonnes) === '["% et PV en plus","8","9","10","11","15","17","19","21","23","25"]', JSON.stringify(r.colonnes));
  verifier("le niveau du groupe y est surligné", JSON.stringify(r.actuel) === '["1"]', JSON.stringify(r.actuel));
  verifier("la ligne de triche par stature est partie : il reste la marche", JSON.stringify(r.lignesStature) === '["Déplacement (cases)"]', JSON.stringify(r.lignesStature));
  verifier("…et le bloc s'appelle « Déplacement des créatures »", r.titreBloc === "Déplacement des créatures", r.titreBloc);
  verifier("base à 12 : le moteur frappe à +13 % au niveau 1, tout de suite", r.apres.bonus === 13 && r.apres.colonne1 === "13", `${r.apres.bonus} (table : ${r.apres.colonne1})`);
  verifier("une saisie folle est bornée (999 → 50)", r.apres.pente === "50", r.apres.pente);
  verifier("chaque changement s'écrit (Monstres_Modeles/_REGLAGES, champ Triche_Niveau, fusionné)",
           r.apres.ecrit.length === 2 && r.apres.ecrit.every(x => /^\{"Triche_Niveau":\{/.test(x) && x.endsWith("+merge")) && /"Base_1_4":12/.test(r.apres.ecrit[0]),
           r.apres.ecrit.join(" | "));
  verifier("un autre poste les change : l'encart et le calcul suivent", r.ailleurs.champs === "3/2/0/3" && r.ailleurs.n1 === 5 && r.ailleurs.n10 === 30, JSON.stringify(r.ailleurs));
  verifier("sans réglage en base : les chiffres de Nico", r.retour === 8, `${r.retour}`);
}

titre("7. LES RÉSISTANCES DES CRÉATURES SELON LE NIVEAU DU GROUPE");
{
  const r = await p.evaluate(async () => {
    const res = {};
    const nb = (palier, niveau, leader) => window.__ou(() => window.nbResistancesCreature(palier, { niveau, leader }), null);
    res.grille = [1, 4, 5, 8, 9, 10, 12].map(n => `${n}:${nb("Petit", n)}/${nb("Normal", n)}/${nb("Normal", n, true)}/${nb("Boss", n)}`);
    res.elite = nb("Élite", 1);
    // À la création, au niveau du groupe du moment.
    const gab = (palier) => ({ Cle: "x", Archetype: "DPS CAC", Palier: palier, PV: 50, Fatigue_Max: 100 });
    const creer = async (palier, niveauXp, extra) => {
      window.PERSOS_JOUEURS_PARTIE = window.__heros([["H1", "Aldric", niveauXp]]);
      window.__ou(() => window.recomposerCombattants(), null);
      const d = await window.__ouAsync(() => window.creerMonstreDepuisGabarit("MONSTRE_R", gab(palier), extra || {}), null);
      return d ? d.Resistances_Etats.length : null;
    };
    res.n1 = [await creer("Petit", 0), await creer("Normal", 0), await creer("Boss", 0), await creer("Normal", 0, { Leader: true })];
    res.n6 = [await creer("Petit", 3300), await creer("Normal", 3300), await creer("Boss", 3300)];
    res.n10 = [await creer("Petit", 7900), await creer("Normal", 7900), await creer("Boss", 7900), await creer("Petit", 7900, { Leader: true })];
    // Celle qui se relèvera en leader : la sienne, et celles de son futur rang.
    window.PERSOS_JOUEURS_PARTIE = window.__heros([["H1", "Aldric", 0]]);
    window.__ou(() => window.recomposerCombattants(), null);
    const d = await window.__ouAsync(() => window.creerMonstreDepuisGabarit("MONSTRE_RL", gab("Normal"), { Releve_En_Leader: true }), null);
    res.releve = d ? { maintenant: d.Resistances_Etats, enLeader: d.Resistances_En_Leader } : null;
    return res;
  });
  verifier("niveaux 1 à 4 : petits 0, normaux 1, leaders et boss 2", r.grille[0] === "1:0/1/2/2" && r.grille[1] === "4:0/1/2/2", r.grille.slice(0, 2).join(" "));
  verifier("niveaux 5 à 8 : petits 1, normaux 1, leaders et boss 3", r.grille[2] === "5:1/1/3/3" && r.grille[3] === "8:1/1/3/3", r.grille.slice(2, 4).join(" "));
  verifier("niveaux 9 et 10 : petits 1, normaux 2, leaders et boss 4", r.grille[4] === "9:1/2/4/4" && r.grille[5] === "10:1/2/4/4", r.grille.slice(4, 6).join(" "));
  verifier("au-delà du niveau 10 : la dernière tranche", r.grille[6] === "12:1/2/4/4", r.grille[6]);
  verifier("une créature Élite d'avant compte comme un chef", r.elite === 2, `${r.elite}`);
  verifier("créées au niveau 1 : 0 / 1 / 2, et 2 pour un leader", JSON.stringify(r.n1) === "[0,1,2,2]", JSON.stringify(r.n1));
  verifier("créées au niveau 6 : 1 / 1 / 3", JSON.stringify(r.n6) === "[1,1,3]", JSON.stringify(r.n6));
  verifier("créées au niveau 10 : 1 / 2 / 4, et 4 pour un Petit leader", JSON.stringify(r.n10) === "[1,2,4,4]", JSON.stringify(r.n10));
  verifier("celle qui se relèvera : 1 aujourd'hui, 2 en leader (les mêmes, plus une)",
           !!r.releve && r.releve.maintenant.length === 1 && Array.isArray(r.releve.enLeader) && r.releve.enLeader.length === 2
           && r.releve.enLeader[0] === r.releve.maintenant[0], JSON.stringify(r.releve));
  const src = lire('monstres.js');
  verifier("la fiche relue les porte jusqu'au cerveau (resistancesEnLeader)", /objet\.resistancesEnLeader = \[\.\.\.brut\.Resistances_En_Leader\]/.test(src));
  verifier("et la relève les écrit sur la fiche (Resistances_Etats)", /Resistances_Etats: \[\.\.\.c\.atouts\.resistances\]/.test(src));
}

titre("8. LES REPÈRES À CHAQUE COMBAT ; LE DÉPART AUTOUR, LES RENFORTS PAR LES CASES");
{
  const r = await p.evaluate(async () => {
    const res = {};
    const CASES = ["10,0", "11,0", "12,0"];
    window.appliquerSpawnEnnemis && window.appliquerSpawnEnnemis(CASES);
    // Une réinitialisation efface les deux repères : sans eux, pas de repère
    // tiré des cases peintes — on le redemande.
    delete window.PARTIE_DATA.Spawn_Allies; delete window.PARTIE_DATA.Spawn_Ennemis;
    res.sansRepere = window.__ou(() => window.pointApparition("Ennemi"), "?");
    // La demande : les héros, puis les ennemis, cases peintes ou non.
    const calque = () => document.getElementById("placement-apparition").style.display === "flex";
    const titreDemande = () => document.getElementById("placement-apparition-titre").innerText;
    const clic = async (q, r) => {
      const conteneur = document.getElementById("conteneur-plateau-vtt");
      const e = window.__ecran(q, r);
      ["mousedown", "mouseup", "click"].forEach(type =>
        conteneur.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: e.x, clientY: e.y })));
      await new Promise(res2 => setTimeout(res2, 20));
    };
    window.APPARITION_REPORTEE = false; window.__ou(() => window.arreterPlacementApparition(), null); window.__majs = [];
    window.__ou(() => window.verifierPointsApparition(), null);
    res.t1 = calque() ? titreDemande() : "(fermée)";
    await clic(1, 1);
    res.t2 = calque() ? titreDemande() : "(fermée)";
    await clic(-6, 4);
    res.fermee = !calque();
    res.ecrits = (window.__majs || []).filter(m => m.chemin === "Systeme_Parties/P1").map(m => m.data);
    window.__ou(() => window.arreterPlacementApparition(), null);
    window.PARTIE_DATA.Spawn_Allies = { q: 1, r: 1 };
    window.PARTIE_DATA.Spawn_Ennemis = { q: -6, r: 4 };
    // LE DÉPART : autour du repère, jamais sur les cases peintes (loin de là).
    const depart = []; for (let i = 0; i < 60; i++) depart.push(window.__ou(() => window.casePremiereArriveeEnnemi({}), null));
    res.departPres = depart.every(h => h && window.__dist(h, { q: -6, r: 4 }) <= 2 && !CASES.includes(window.__hex(h)));
    // LES RENFORTS : sur les cases peintes.
    const renforts = []; for (let i = 0; i < 60; i++) renforts.push(window.__ou(() => window.caseApparitionEnnemi({}), null));
    res.renfortsCases = renforts.every(h => h && CASES.includes(window.__hex(h)));
    // La vraie pose (monstres.js) : la rencontre, puis un renfort.
    window.gabaritMonstre = () => ({ Palier: "Normal" });
    window.creerMonstreDepuisGabarit = async () => {};
    const tokens = {};
    const poses = [];
    for (let i = 0; i < 3; i++) {
      const id = await window.__ouAsync(() => window.poserMonstreSurTerrain({ archetype: "DPS CAC", palier: "Normal", nom: "Gob " + i }, tokens, { premiereArrivee: true }), null);
      poses.push(id && tokens[id] ? tokens[id] : null);
    }
    res.poseDepart = poses.every(t => t && window.__dist(t, { q: -6, r: 4 }) <= 2) && new Set(poses.map(window.__hex)).size === 3;
    const idR = await window.__ouAsync(() => window.poserMonstreSurTerrain({ archetype: "DPS CAC", palier: "Normal", nom: "Renfort" }, tokens), null);
    res.poseRenfort = idR && tokens[idR] ? window.__hex(tokens[idR]) : null;
    // Le bouton PIONS : un ennemi sans pion entre autour de son repère.
    window.TOKENS_VTT_DATA = {};
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", camp: "Allié", statut: "Vivant", urlToken: "u1" },
                            { idPersonnage: "M9", camp: "Ennemi", statut: "Vivant", estMonstre: true, urlToken: "u2" }];
    window.enregistrerPionsVTT = async () => {};
    const appliquer = window.appliquerTokensVTT; window.appliquerTokensVTT = () => {};
    await window.__ouAsync(() => window.genererTokensCombat(), null);
    window.appliquerTokensVTT = appliquer;
    const t = window.TOKENS_VTT_DATA;
    res.pions = { ennemi: !!t.M9 && window.__dist(t.M9, { q: -6, r: 4 }) <= 2 && !CASES.includes(window.__hex(t.M9)), heros: !!t.H1 && window.__dist(t.H1, { q: 1, r: 1 }) <= 2 };
    // Sans repère (une partie d'avant) : les cases peintes, faute de mieux.
    delete window.PARTIE_DATA.Spawn_Ennemis;
    const h = window.__ou(() => window.casePremiereArriveeEnnemi({}), null);
    res.secours = h ? window.__hex(h) : null;
    return res;
  });
  verifier("après une réinitialisation, plus de repère des ennemis tiré des cases peintes", r.sansRepere === null, JSON.stringify(r.sansRepere));
  verifier("la demande s'ouvre sur les héros…", /héros/i.test(r.t1), r.t1);
  verifier("…puis les ennemis, malgré les cases peintes", /ennemis/i.test(r.t2), r.t2);
  verifier("les deux repères s'écrivent ensemble", r.fermee && r.ecrits.length === 1 && r.ecrits[0].Spawn_Allies && r.ecrits[0].Spawn_Allies.q === 1
           && r.ecrits[0].Spawn_Ennemis && r.ecrits[0].Spawn_Ennemis.q === -6, JSON.stringify(r.ecrits));
  verifier("LE DÉPART arrive autour du repère des ennemis (pas sur les cases peintes)", r.departPres);
  verifier("LES RENFORTS arrivent par les cases peintes", r.renfortsCases);
  verifier("la vraie pose : trois créatures du départ autour du repère, une par case", r.poseDepart);
  verifier("…puis un renfort sur une case peinte", ["10,0", "11,0", "12,0"].includes(r.poseRenfort), r.poseRenfort);
  verifier("le bouton PIONS : l'ennemi autour de son repère, le héros autour du sien", r.pions.ennemi && r.pions.heros, JSON.stringify(r.pions));
  verifier("sans repère (une partie d'avant) : les cases peintes, faute de mieux", ["10,0", "11,0", "12,0"].includes(r.secours), r.secours);
  const src = lire('monstres.js');
  verifier("la rencontre pose son départ en « première arrivée »", /poserMonstreSurTerrain\([^)]*\{ premiereArrivee: true \}\)/.test(src));
}

titre("9. L'ENCART DE LA COMPÉTENCE JOUÉE, EN SYMBOLES");
{
  const r = await p.evaluate(() => {
    const versRgb = (h) => { const n = parseInt(h.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
    const heros = { idPersonnage: "H1", prenom: "Aldric", camp: "Allié" };
    const creature = { idPersonnage: "M1", prenom: "Goule", camp: "Ennemi", estMonstre: true };
    const carte = { Nom: "Lame des cendres", Arme: "Magie", Fatigue: 80, Initiative: 40, Composants: { actions: [] }, Effets_Compiles: [
      { nom: "Attaque légère", desc: "12 dégats physique", isMod: false },
      { nom: "Distance", desc: "4 hexagone", isMod: true },
      { nom: "Durée étalement dégâts", desc: "Dégâts ou soins divisés par 2 : rien au lancement, une part à chaque fin de manche pendant 2 tours.", isMod: true },
      { nom: "Attaque Magique", desc: "9 dégâts magique · 🔥 Feu", isMod: false },
      { nom: "Brûlé", desc: "20% chance de brûlure sur 2 tour (Max 60%)", isMod: true },
      { nom: "Mots de pouvoirs", desc: "5 dégat brut", isMod: false },
      { nom: "Soin", desc: "6 soins", isMod: false },
      { nom: "Bouclier magique", desc: "Créer un bouclier de 30% des pv restants.", isMod: false },
      { nom: "Contre", desc: "Annule 20% des dégats physique et 10% convertis en dégats", isMod: false },
      { nom: "Initiative +", desc: "+5", isMod: true } ] };
    const lireCarte = (c, lanceur) => {
      const boite = document.createElement("div");
      boite.innerHTML = window.__ou(() => window.ligneEffetsCarte(c, lanceur), "");
      document.body.appendChild(boite);
      const montants = [...boite.querySelectorAll(".encart-montant")].map(d => ({
        nature: d.dataset.nature, titre: d.title, couleur: d.style.color, svg: !!d.querySelector("svg"),
        chiffre: (d.querySelector(".encart-chiffre") || {}).textContent || "",
        etal: (d.querySelector(".encart-etalement") || {}).textContent || "",
        surp: (d.querySelector(".encart-surpuissance") || {}).textContent || "",
        or: (d.querySelector(".encart-surpuissance") || { style: {} }).style.color || "",
        couleurChiffre: getComputedStyle(d.querySelector(".encart-chiffre") || d).color }));
      const texte = boite.innerText.replace(/\s+/g, " ").trim();
      boite.remove();
      return { montants, texte };
    };
    window.PERSOS_JOUEURS_PARTIE = window.__heros([["H1", "Aldric", 0]]);
    window.__ou(() => window.recomposerCombattants(), null);
    const h = lireCarte(carte, heros);
    const m = lireCarte(carte, creature);
    // Un étalement posé sur une Distance vaut pour toute la carte.
    const zone = lireCarte({ ...carte, Effets_Compiles: [
      { nom: "Distance", desc: "4 hexagone", isMod: false },
      { nom: "Durée étalement dégâts", desc: "Dégâts ou soins divisés par 3 : rien au lancement, une part à chaque fin de manche pendant 3 tours.", isMod: true },
      { nom: "Attaque lourde", desc: "10 dégats physique", isMod: false },
      { nom: "Soin", desc: "4 soins", isMod: false }] }, creature);
    const palette = (window.pontCombat || {}).COULEURS_CHIFFRE || {};
    return { h, m, zone, rgb: { physique: versRgb("#ff4c4c"), magique: versRgb("#7fd0ff"), mental: versRgb("#c9a2ff"), soin: versRgb("#8cf08c"), or: versRgb("#f5c542") },
             memePalette: JSON.stringify(window.__ou(() => window.couleursChiffres(), null)) === JSON.stringify(palette) && !!palette.mental };
  });
  const m = r.h.montants;
  // (v264 : le montant affiché est celui qui tombera, surpuissance ×1,25 comprise.)
  verifier("quatre montants, dans l'ordre : physique, magique, Distorsion mentale, soin",
           m.map(x => `${x.nature}:${x.chiffre}`).join(" ") === "physique:15 magique:11 mental:6 soin:8", m.map(x => `${x.nature}:${x.chiffre}`).join(" "));
  verifier("chacun avec son symbole (explosion, baguette, tête, croix)", m.length === 4 && m.every(x => x.svg));
  verifier("plus de texte : ni « dégâts », ni « soins », ni le nom des attaques",
           !/d[ée]g[âa]t|soins?\b|Attaque|Distorsion|Mots de pouvoir/i.test(r.h.texte), r.h.texte.slice(0, 120));
  verifier("le nom reste dans la bulle (« Distorsion mentale », même d'une vieille carte)", m[2] && m[2].titre === "Distorsion mentale", m[2] && m[2].titre);
  verifier("les couleurs : rouge, bleu ciel, violet clair, vert",
           m.length === 4 && m[0].couleur === r.rgb.physique && m[1].couleur === r.rgb.magique && m[2].couleur === r.rgb.mental && m[3].couleur === r.rgb.soin,
           m.map(x => x.couleur).join(" | "));
  verifier("le chiffre a la couleur de son symbole", m.length === 4 && m.every(x => x.couleurChiffre === x.couleur), m.map(x => x.couleurChiffre).join(" | "));
  verifier("les mêmes que les chiffres qui s'envolent (une seule palette)", r.memePalette);
  verifier("l'étalement : « (Sur 2 Tours) » sur le montant étalé, et lui seul",
           m[0] && m[0].etal === "(Sur 2 Tours)" && m.slice(1).every(x => x.etal === ""), m.map(x => x.etal || "—").join(" | "));
  verifier("…et plus de ligne d'étalement", !/divis|étalement|fin de manche/i.test(r.h.texte), r.h.texte.slice(0, 120));
  verifier("la surpuissance (80 de fatigue) : le mot « Surpuissance » en or, à côté de chaque montant (v264)",
           m.length === 4 && m.every(x => x.surp === "Surpuissance" && x.or === r.rgb.or), m.map(x => x.surp || "—").join(" | "));
  verifier("une créature n'a pas de surpuissance", r.m.montants.length === 4 && r.m.montants.every(x => x.surp === ""), r.m.montants.map(x => x.surp || "—").join(" | "));
  verifier("les états restent comme avant : « ↳ Brûlé », sans pourcentage", /↳ Brûlé/.test(r.h.texte) && !/%/.test(r.h.texte), r.h.texte.slice(0, 160));
  verifier("le bouclier et le Contre gardent leur ligne (ce ne sont pas des montants)", /• Bouclier magique/.test(r.h.texte) && /• Contre/.test(r.h.texte), r.h.texte.slice(0, 200));
  verifier("plus de ligne de distance ni d'initiative dans le détail", !/hexagone|Distance|Initiative/.test(r.h.texte), r.h.texte.slice(0, 120));
  verifier("un étalement posé sur la Distance vaut pour toute la carte : « (Sur 3 Tours) » partout",
           r.zone.montants.length === 2 && r.zone.montants.every(x => x.etal === "(Sur 3 Tours)"), r.zone.montants.map(x => `${x.nature}:${x.etal}`).join(" | "));
}

titre("10. LA DISTANCE EN HAUT À DROITE DE L'ENCART");
{
  const r = await p.evaluate(async () => {
    const res = {};
    const carte = (effets) => ({ Nom: "Trait de feu", Arme: "Magie", Fatigue: 30, Initiative: 40, Composants: { actions: [] }, Effets_Compiles: effets });
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Aldric", camp: "Allié", PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 100, fatigueActuelle: 80, Etats_Alteres: [], statut: "Vivant" },
                            { idPersonnage: "M1", prenom: "Goule", camp: "Ennemi", estMonstre: true, PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 100, fatigueActuelle: 80, Etats_Alteres: [], statut: "Vivant" }];
    window.CACHE_COMPETENCES_GLOBAL = {
      M1: { LOIN: carte([{ nom: "Attaque Magique", desc: "9 dégâts magique", isMod: false }, { nom: "Distance", desc: "5 hexagone", isMod: true }]),
            PRES: carte([{ nom: "Attaque lourde", desc: "9 dégats physique", isMod: false }]) } };
    res.fonction = { loin: window.__ou(() => window.distanceEncartCarte(window.CACHE_COMPETENCES_GLOBAL.M1.LOIN, window.PERSOS_PARTIE[1]), null),
                     pres: window.__ou(() => window.distanceEncartCarte(window.CACHE_COMPETENCES_GLOBAL.M1.PRES, window.PERSOS_PARTIE[1]), "?") };
    const montrer = async (idCarte) => {
      window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"],
                             File_Attente_Combat: [{ idPersonnage: "M1", idCarte, initiative: 50 }] };
      window.EVENEMENT_ATTENDU = { acteur: "M1", idCarte, manche: 1, v: idCarte === "LOIN" ? 1 : 2 };
      window.__ou(() => window.rafraichirVoileTour(), null);
      await new Promise(res2 => setTimeout(res2, 700));
      window.__ou(() => window.appliquerReglagesEncart(), null);
      window.__ou(() => window.rafraichirVoileTour(), null);
      await new Promise(res2 => setTimeout(res2, 100));
      const el = document.getElementById("voile-tour-distance");
      const carteEl = document.getElementById("voile-tour-carte");
      const encart = document.getElementById("voile-tour-encart");
      if (!el) return { existe: false, effets: (document.getElementById("voile-tour-effets") || {}).innerText || "" };
      const b = el.getBoundingClientRect(), c = carteEl.getBoundingClientRect(), e = encart.getBoundingClientRect();
      return { existe: true, visible: getComputedStyle(el).display !== "none" && b.width > 0, texte: el.innerText.trim(), svg: !!el.querySelector("svg"),
               couleur: getComputedStyle(el).color, titre: el.title,
               aDroiteDuTitre: b.left >= c.right - 1, memeLigne: Math.abs((b.top + b.bottom) / 2 - (c.top + c.bottom) / 2) <= Math.max(b.height, c.height),
               dansLaMoitieDroite: b.left > e.left + e.width / 2, effets: document.getElementById("voile-tour-effets").innerText };
    };
    res.loin = await montrer("LOIN");
    res.pres = await montrer("PRES");
    window.EVENEMENT_ATTENDU = null;
    window.PARTIE_DATA = { Phase_Combat: "Preparation", Tour_Combat: 1, File_Attente_Combat: [] };
    window.__ou(() => window.rafraichirVoileTour(), null);
    res.reglage = window.REGLAGES_HUD && window.REGLAGES_HUD.encartDistance;
    return res;
  });
  verifier("la portée de la carte : 5 ; rien pour une attaque de contact", r.fonction.loin && r.fonction.loin.portee === 5 && r.fonction.pres === null, JSON.stringify(r.fonction));
  verifier("l'encart montre la distance : une petite cible et « 5 »", r.loin.existe && r.loin.visible && r.loin.svg && r.loin.texte === "5", JSON.stringify({ t: r.loin.texte, v: r.loin.visible, s: r.loin.svg }));
  verifier("…en blanc", r.loin.couleur === "rgb(255, 255, 255)", r.loin.couleur);
  verifier("…en haut à droite : sur la ligne du nom de la technique, à sa droite", r.loin.memeLigne && r.loin.aDroiteDuTitre && r.loin.dansLaMoitieDroite,
           JSON.stringify({ ligne: r.loin.memeLigne, droite: r.loin.aDroiteDuTitre, moitie: r.loin.dansLaMoitieDroite }));
  verifier("…et plus dans le détail", !/hexagone|Distance/.test(r.loin.effets || ""), String(r.loin.effets || "").replace(/\s+/g, " ").slice(0, 80));
  verifier("une attaque de contact : pas de distance", r.pres.existe && !r.pres.visible, JSON.stringify({ v: r.pres.visible, t: r.pres.texte }));
  verifier("sa place se règle avec le reste de l'encart (REGLAGES_HUD.encartDistance)", !!r.reglage && typeof r.reglage.droite === "number" && typeof r.reglage.y === "number",
           JSON.stringify(r.reglage));
}

titre("11. LES VERSIONS");
{
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS = (\d+)/) || [])[1]);
  const vJson = essai(() => JSON.parse(lire('version.json')).version, 0);
  verifier("version 263 ou plus (trace_combat.js, version.json)", vTrace >= 263 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const v = (f) => Number((html.match(new RegExp('["/ ]' + f.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  verifier("combat.js v148+, monstres.js v38+, app.js v121+, style.css v95+, hud_disposition.js v6+",
           v("combat.js") >= 148 && v("monstres.js") >= 38 && v("app.js") >= 121 && v("style.css") >= 95 && v("hud_disposition.js") >= 6,
           `${v("combat.js")} / ${v("monstres.js")} / ${v("app.js")} / ${v("style.css")} / ${v("hud_disposition.js")}`);
  const impMap = (f) => [...html.matchAll(new RegExp(f.replace(".", "\\.") + "\\?v=(\\d+)", "g"))].map(x => Number(x[1]));
  verifier("combat_etat v42+, pont_combat v44+, moteur_pur v67+ (table d'import et balise, d'accord)",
           impMap("combat_etat.js").every(x => x >= 42) && new Set(impMap("combat_etat.js")).size === 1
           && impMap("pont_combat.js").every(x => x >= 44) && new Set(impMap("pont_combat.js")).size === 1
           && impMap("moteur_pur.js").every(x => x >= 67) && new Set(impMap("moteur_pur.js")).size === 1,
           `${impMap("combat_etat.js")} / ${impMap("pont_combat.js")} / ${impMap("moteur_pur.js")}`);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
