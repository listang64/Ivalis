// LA SURPUISSANCE : UNE TECHNIQUE COÛTEUSE FRAPPE ET SOIGNE PLUS FORT.
//
// Nico : « pour la création de compétence, un boost pour les dégâts et soins
// en fonction du montant en fatigue : fatigue 70+ → ×1,25 ; 100+ → ×1,35. »
// Ce banc charge la vraie page et vérifie la règle (app.js), l'extraction de
// la carte en combat (moteur_effets.js), la Forge et la carte en grand.
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const RACINE = '/home/user/Ivalis';
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

const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async (ref) => {
    const d = (window.__docs || {})[ref.chemin];
    return { exists: () => !!d, data: () => d || {} };
  };
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data, options }); };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data }); };
  export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a});
  export const where = (...a) => ({a}); export const orderBy = (...a) => ({a});
  export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
const EFFETS = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/effets_reels.json', 'utf-8'));
const EFFETS_PAR_ID = Object.fromEntries((Array.isArray(EFFETS) ? EFFETS : Object.values(EFFETS)).map(e => [e.id, e]));

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#2b3a55"/><stop offset="1" stop-color="#7a5a8c"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#g)"/></svg>' }));
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
// Les images (fond de la fiche de classe) : un dégradé connu, servi APRÈS le
// blocage général — la dernière route posée est la première consultée.
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#2b3a55"/><stop offset="1" stop-color="#7a5a8c"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#g)"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

// =========================================================================
console.log("\n1. LES PALIERS");
// =========================================================================
{
  const r = await p.evaluate(() => [0, 69, 70, 99, 100, 160].map(f => [f, window.multiplicateurSurpuissance(f), window.texteSurpuissance(f)]));
  verifier("sous 70 : ×1", r[0][1] === 1 && r[1][1] === 1 && r[1][2] === "", JSON.stringify(r));
  verifier("70 à 99 : ×1,25", r[2][1] === 1.25 && r[3][1] === 1.25 && r[2][2] === "×1,25");
  verifier("100 et plus : ×1,35 (à la place, pas en plus)", r[4][1] === 1.35 && r[5][1] === 1.35 && r[4][2] === "×1,35");
}

// =========================================================================
console.log("\n2. EN COMBAT : LA CARTE EXTRAITE");
// =========================================================================
const EFF = await p.evaluate((EFFETS) => {
  window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
  document.getElementById("fenetre-combat").style.display = "block";
  window.jouerSonClic = () => {};
  window.estMonstre = (id) => String(id).startsWith("M");
  window.PLATEAU_VTT = { getCaseState: () => ({}), hexToPixel: (q, r) => ({ x: 300 + q * 60, y: 300 + r * 60 }),
                         pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {} };
  window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
  window.PERSOS_PARTIE = [
    { idPersonnage: "H1", camp: "Allié", prenom: "Cybile", PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 200,
      fatigueActuelle: 200, Etats_Alteres: [], statut: "Vivant" },
    { idPersonnage: "M1", camp: "Ennemi", estMonstre: true, prenom: "Gnoll", PV_Max: 40, PV_Actuels: 40,
      Fatigue_Max: 200, fatigueActuelle: 200, Etats_Alteres: [], statut: "Vivant" }
  ];
  window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } };
  window.TOKEN_SELECTIONNE = "H1";
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]]; window.COMBAT_INDEX_PERSO = 0;
  window.REGIME_CERVEAU = true;
  window.CHEMIN_MOUVEMENT = []; window.ZONES_PERSISTANTES = {};
  const parNom = {};
  Object.entries(window.EFFETS_BDD_CACHE).forEach(([id, e]) => { parNom[(e.Nom || "").toLowerCase()] = id; });
  return parNom;
}, EFFETS_PAR_ID);

const idAttaque = EFF["attaque magique"], idSoin = EFF["soin"], idBouclier = EFF["bouclier magique"];
const extraire = (effetId, count, fatigue, lanceur = "H1") => p.evaluate(async ({ effetId, count, fatigue, lanceur }) => {
  const carte = { Nom: "Essai", Arme: "Magie", Fatigue: fatigue, Initiative: 20, Effets_Compiles: [],
    Composants: { actions: [{ baseEffetId: effetId, count, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } };
  window.COMPETENCES_CACHE = { C1: carte };
  window.CACHE_COMPETENCES_GLOBAL = { H1: { C1: carte }, M1: { C1: carte } };
  window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1,
    File_Attente_Combat: [{ idPersonnage: lanceur, idCarte: "C1", initiative: 20 }] };
  const etat = await window.demarrerCiblage("C1", { extraire: true, idLanceur: lanceur });
  return ((etat && etat.attaques) || []).map(a => ({ v: a.valeurBrute, pct: a.pourcentPV, s: a.surpuissance || 1 }));
}, { effetId, count, fatigue, lanceur });
{
  const base = (await extraire(idAttaque, 4, 40))[0];
  const a70 = (await extraire(idAttaque, 4, 70))[0], a100 = (await extraire(idAttaque, 4, 100))[0];
  verifier("attaque à 40 de fatigue : valeur de la carte (4 × 3 = 12)", base.v === 12 && base.s === 1, JSON.stringify(base));
  verifier("à 70 : 12 × 1,25 = 15", a70.v === 15 && a70.s === 1.25, JSON.stringify(a70));
  verifier("à 100 : 12 × 1,35 = 16,2 → 16 (arrondi au plus proche)", a100.v === 16 && a100.s === 1.35, JSON.stringify(a100));
  const a69 = (await extraire(idAttaque, 5, 69))[0], a75 = (await extraire(idAttaque, 5, 75))[0];
  verifier("69 : rien ; 15 × 1,25 = 18,75 → 19 à 75", a69.v === 15 && a75.v === 19, `${a69.v} / ${a75.v}`);

  const soin = (await extraire(idSoin, 2, 40))[0], soin100 = (await extraire(idSoin, 2, 100))[0];
  verifier("un soin aussi (×1,35 à 100)", soin100.v === Math.round(soin.v * 1.35) && soin100.v > soin.v,
           `${soin.v} → ${soin100.v}`);
  const bouclier = (await extraire(idBouclier, 1, 40))[0], bouclier100 = (await extraire(idBouclier, 1, 100))[0];
  verifier("pas un bouclier (même valeur, même pourcentage)", bouclier.v === bouclier100.v && bouclier.pct === bouclier100.pct
           && bouclier100.s === 1, `${JSON.stringify(bouclier)} / ${JSON.stringify(bouclier100)}`);
  const monstre = (await extraire(idAttaque, 4, 100, "M1"))[0];
  verifier("une créature n'en profite pas (ses techniques ne sont pas forgées)", monstre && monstre.v === 12 && monstre.s === 1,
           JSON.stringify(monstre));
}

// =========================================================================
console.log("\n3. LA FORGE L'ANNONCE");
// =========================================================================
{
  const r = await p.evaluate(async (idAttaque) => {
    window.__docs = { "Personnages/H1": { Race: "Humain" }, "Caracteristiques/H1": { int: 16 } };
    document.getElementById("champ-id-personnage").value = "H1";
    window.OUVERTURE_FORGE_EN_COURS = false;
    await window.ouvrirCreationCompetence();
    window.forgeState.armePrincipale = "Magie";
    const eff = window.forgeState.effetsBDD.find(e => e.id === idAttaque);
    const lire = (n) => {
      window.forgeState.actions = [{ idInst: "A1", baseEffet: eff, count: n, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }];
      window.rafraichirForge();
      const el = document.getElementById("forge-surpuissance");
      const ligne = document.querySelector("#forge-contenu-carte .forge-valeur-surpuissante");
      return { fatigue: document.getElementById("forge-fatigue-val").textContent, texte: el.textContent,
               active: el.classList.contains("active"), valeur: ligne ? ligne.textContent : "" };
    };
    const res = [lire(3), lire(7), lire(10)];
    window.fermerForgeCompetence();
    return res;
  }, idAttaque);
  verifier("30 de fatigue : le seuil est annoncé, sans bonus", r[0].fatigue === "30" && !r[0].active
           && /×1,25 dès 70/.test(r[0].texte), JSON.stringify(r[0]));
  verifier("70 : « Surpuissance ×1,25 », et le palier suivant", r[1].fatigue === "70" && r[1].active
           && /Surpuissance ×1,25/.test(r[1].texte) && /×1,35 dès 100/.test(r[1].texte), JSON.stringify(r[1]));
  verifier("sous l'effet, la valeur réelle : 7 × 3 = 21 → 26 à 70, 30 → 41 à 100",
           r[0].valeur === "" && /→ 26 de dégâts avec la surpuissance/.test(r[1].valeur)
           && /→ 41 de dégâts/.test(r[2].valeur), JSON.stringify([r[0].valeur, r[1].valeur, r[2].valeur]));
  verifier("100 : « Surpuissance ×1,35 »", r[2].fatigue === "100" && r[2].active && /×1,35/.test(r[2].texte)
           && !/dès/.test(r[2].texte), JSON.stringify(r[2]));
}

// La Forge ouverte, une technique à 70 de fatigue : la capture.
await p.evaluate(async (idAttaque) => {
  window.OUVERTURE_FORGE_EN_COURS = false;
  await window.ouvrirCreationCompetence();
  window.forgeState.armePrincipale = "Magie";
  const eff = window.forgeState.effetsBDD.find(e => e.id === idAttaque);
  window.forgeState.actions = [{ idInst: "A1", baseEffet: eff, count: 7, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }];
  window.rafraichirForge();
}, idAttaque);
await p.waitForTimeout(300);
await p.screenshot({ path: "/tmp/claude-0/forge_surpuissance.png" });
await p.evaluate(() => window.fermerForgeCompetence());

// =========================================================================
console.log("\n4. LA CARTE EN GRAND LE DIT AUSSI");
// =========================================================================
{
  const r = await p.evaluate(() => {
    const carte = (fatigue) => ({ Nom: "Essai", Arme: "Magie", Fatigue: fatigue, Initiative: 20,
      Effets_Compiles: [{ nom: "Attaque Magique", desc: "12 dégâts magiques", isMod: false }], Composants: { actions: [] } });
    window.COMPETENCES_CACHE = { C40: carte(40), C85: carte(85) };
    window.afficherApercuCarteHD("C85");
    const avec = [...document.querySelectorAll(".ligne-surpuissance")].map(x => x.textContent.replace(/\s+/g, " ").trim());
    // Une carte fraîche (le panneau d'aperçu anime le passage d'une carte à l'autre).
    document.getElementById("apercu-carte-hd-competence").remove();
    window.afficherApercuCarteHD("C40");
    const sans = document.querySelectorAll(".ligne-surpuissance").length;
    return { avec, sans };
  });
  verifier("85 de fatigue : « Surpuissance ×1,25 — dégâts et soins »", r.avec.length === 1 && /Surpuissance ×1,25/.test(r.avec[0])
           && /Dégâts et soins ×1,25/.test(r.avec[0]), JSON.stringify(r.avec));
  verifier("40 : pas de ligne", r.sans === 0);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
