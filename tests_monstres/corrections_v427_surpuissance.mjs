// v427 — LA SURPUISSANCE DONNE AUSSI AUX EFFETS DU SORT. Nico :
//   « Surpuissance > première surpuissance +5 % max pour les effets associés au
//     sort. Deuxième surpuissance > +8 % max pour les effets (+8 qui se rajoute
//     sans prendre en compte max autorisé). »
// La règle (app.js, PALIERS_SURPUISSANCE / surpuissanceDesEffets) :
//   - sans surpuissance (sous 70 de fatigue) : rien ne change, le max du
//     grimoire plafonne (Brûlé 10 %/cran, max 60 %) ;
//   - 1re surpuissance (70+) : le max autorisé des effets à chance monte de 5
//     points — la Forge laisse acheter un cran de plus, le combat plafonne à 65 ;
//     un effet sous son max ne gagne rien d'office ;
//   - 2e surpuissance (100+) : le max relevé reste, et +8 points s'ajoutent
//     par-dessus le plafond (60 → 68, 65 → 73, 30 → 38), 100 au plus.
//   Le ×1,25 / ×1,35 des dégâts reste. Ni les créatures, ni le Maudit.
// Le banc charge la vraie page (faux Firestore en mémoire) avec un grimoire
// écrit ici : il ne dépend pas de effets_reels.json.
//
// Lancer : node tests_monstres/corrections_v427_surpuissance.mjs
//   (IVALIS_RACINE=<dossier> pour un autre exemplaire du dépôt)
// (v429) Nico a précisé : « Surpuissance > +5 % et augmente le max de 5 %, ou 8 % si
// surpuissance 100 » : +5 (70+) ou +8 (100+) d'office, par-dessus le max ; plus de cran
// supplémentaire à la Forge. Les contrôles ci-dessous suivent la règle précisée.
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

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

// Le grimoire du banc : des chiffres ronds pour lire les plafonds d'un coup d'œil.
// Fatigue d'une carte = 5 × PC : un cran d'attaque = 10, un cran d'état = 5.
const commun = { Modificateur: "INTELLIGENCE", Type_Mecanique: "Magique", Type_Mecanique_2: "Aucun", Tours: 0 };
const EFFETS = {
  EFF_ATTAQUE_MAGIQUE: { ...commun, Nom: "Attaque magique", Cout_PT: 2, Valeur: 3, Pourcent_Base: 0, Pourcent_Max: 0,
                         Effet_Base: "Inflige 3 dégâts magiques" },
  EFF_BRULE:   { ...commun, Nom: "Brûlé", Cout_PT: 1, Valeur: 0, Pourcent_Base: 10, Pourcent_Max: 60, Tours: 2,
                 Effet_Base: "10% de chance de brûler la cible (max 60%)" },
  EFF_PEUR:    { ...commun, Nom: "Peur", Cout_PT: 1, Valeur: 0, Pourcent_Base: 15, Pourcent_Max: 60,
                 Effet_Base: "15% de chance de faire fuir la cible (max 60%)" },
  EFF_ETOURDI: { ...commun, Nom: "Étourdissement", Cible_Etat: "Étourdi", Cout_PT: 1, Valeur: 0, Pourcent_Base: 10, Pourcent_Max: 40, Tours: 1,
                 Effet_Base: "10% de chance d'étourdir la cible (max 40%)" },
  EFF_POUSSEE: { ...commun, Nom: "Poussée", Cout_PT: 1, Valeur: 2, Pourcent_Base: 15, Pourcent_Max: 60,
                 Effet_Base: "15% de chance de repousser la cible de 2 hexagones (max 60%)" },
  EFF_LUMIERE: { ...commun, Nom: "Lumière", Cout_PT: 1, Valeur: 0, Pourcent_Base: 20, Pourcent_Max: 80,
                 Effet_Base: "20% de chance de passer outre la défense magique (max 80%)" }
};

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

const section = async (f) => { try { await f(); } catch (e) { echecs++; console.log("  ÉCHEC (exception) " + e.message.split("\n")[0]); } };

// =========================================================================
console.log("\n1. LA RÈGLE (app.js)");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => ({
    paliers: [0, 69, 70, 99, 100, 140].map(f => window.surpuissanceDesEffets(f)),
    mult: [69, 70, 100].map(f => window.multiplicateurSurpuissance(f)),
    textes: [69, 70, 100].map(f => window.texteSurpuissanceEffets(f)),
    monstre: window.surpuissanceDesEffets(100, { estMonstre: true }),
    maudit: window.surpuissanceDesEffets(100, { Race: "Humain", Classe: "Maudit", Niveau: 3, niveau: 3 }),
    atoutMaudit: !!(window.atoutRace({ Race: "Humain", Classe: "Maudit", Niveau: 3, niveau: 3 }) || {}).sansSurpuissanceOffensive
  }));
  const eq = (o, bo) => o.bonus === bo;
  verifier("sans surpuissance (0, 69) : rien", eq(r.paliers[0], 0) && eq(r.paliers[1], 0), JSON.stringify(r.paliers.slice(0, 2)));
  verifier("1re surpuissance (70 à 99) : +5 par-dessus le max", eq(r.paliers[2], 5) && eq(r.paliers[3], 5), JSON.stringify(r.paliers.slice(2, 4)));
  verifier("2e surpuissance (100+) : +8 par-dessus le max", eq(r.paliers[4], 8) && eq(r.paliers[5], 8), JSON.stringify(r.paliers.slice(4)));
  verifier("le multiplicateur des dégâts ne bouge pas (×1 / ×1,25 / ×1,35)", r.mult.join() === "1,1.25,1.35", r.mult.join());
  verifier("les textes : « » / « effets +5 % (max +5 %) » / « effets +8 % (max +8 %) »",
    r.textes[0] === "" && r.textes[1] === "effets +5 % (max +5 %)" && r.textes[2] === "effets +8 % (max +8 %)", JSON.stringify(r.textes));
  verifier("une créature : rien", eq(r.monstre, 0), JSON.stringify(r.monstre));
  verifier("le Maudit (pas de surpuissance classique) : rien", !r.atoutMaudit || eq(r.maudit, 0), `atout ${r.atoutMaudit} ${JSON.stringify(r.maudit)}`);
});

// =========================================================================
console.log("\n2. EN COMBAT : LA CARTE EXTRAITE (moteur_effets.js)");
// =========================================================================
await p.evaluate((EFFETS) => {
  window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
  document.getElementById("fenetre-combat").style.display = "block";
  window.jouerSonClic = () => {};
  window.estMonstre = (id) => String(id).startsWith("M");
  window.PLATEAU_VTT = { getCaseState: () => ({}), hexToPixel: (q, r) => ({ x: 300 + q * 60, y: 300 + r * 60 }),
                         pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {} };
  window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
  window.PERSOS_PARTIE = [
    { idPersonnage: "H1", camp: "Allié", prenom: "Cybile", Race: "Humain", PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 200,
      fatigueActuelle: 200, Etats_Alteres: [], statut: "Vivant" },
    { idPersonnage: "M1", camp: "Ennemi", estMonstre: true, prenom: "Gnoll", PV_Max: 40, PV_Actuels: 40,
      Fatigue_Max: 200, fatigueActuelle: 200, Etats_Alteres: [], statut: "Vivant" }
  ];
  window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } };
  window.TOKEN_SELECTIONNE = "H1";
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]]; window.COMBAT_INDEX_PERSO = 0;
  window.REGIME_CERVEAU = true;
  window.CHEMIN_MOUVEMENT = []; window.ZONES_PERSISTANTES = {};
}, EFFETS);

// Une carte : une Attaque magique de `att` crans, avec des sous-effets `mods`.
const extraire = (fatigue, att, mods, options = {}) => p.evaluate(async ({ fatigue, att, mods, options }) => {
  const actions = att > 0 ? [{ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: att, mods, zoneHexes: [], baseDuree: 0, modsDuree: {},
                               ...(options.element ? { element: options.element } : {}) }]
                          : Object.entries(mods).map(([id, n]) => ({ baseEffetId: id, count: n, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }));
  const carte = { Nom: "Essai", Arme: "Magie", Fatigue: fatigue, Initiative: 20, Effets_Compiles: [], Composants: { actions } };
  const lanceur = options.lanceur || "H1";
  window.COMPETENCES_CACHE = { C1: carte };
  window.CACHE_COMPETENCES_GLOBAL = { H1: { C1: carte }, M1: { C1: carte } };
  window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1,
    File_Attente_Combat: [{ idPersonnage: lanceur, idCarte: "C1", initiative: 20 }] };
  const etat = await window.demarrerCiblage("C1", { extraire: true, idLanceur: lanceur });
  const chances = {};
  ((etat && etat.alterations) || []).forEach(a => { chances[a.nom] = a.chance; });
  const a0 = ((etat && etat.attaques) || [])[0] || {};
  return { chances, degats: a0.valeurBrute, lumiere: a0.chanceLumiere };
}, { fatigue, att, mods, options });

await section(async () => {
  // SANS SURPUISSANCE
  const s6 = await extraire(40, 2, { EFF_BRULE: 6 });
  const s7 = await extraire(40, 2, { EFF_BRULE: 7 });
  const s3 = await extraire(40, 2, { EFF_BRULE: 3 });
  verifier("sans surpuissance : Brûlé ×6 = 60 %, ×3 = 30 %", s6.chances["Brûlé"] === 60 && s3.chances["Brûlé"] === 30, JSON.stringify([s6.chances, s3.chances]));
  verifier("sans surpuissance : un 7e cran reste plafonné au max du grimoire (60)", s7.chances["Brûlé"] === 60, JSON.stringify(s7.chances));

  // 1re SURPUISSANCE : +5 d'office, par-dessus le max
  const p6 = await extraire(75, 4, { EFF_BRULE: 6 });
  const p7 = await extraire(75, 4, { EFF_BRULE: 7 });
  const p3 = await extraire(75, 4, { EFF_BRULE: 3 });
  verifier("1re surpuissance : Brûlé au max (60) +5 → 65", p6.chances["Brûlé"] === 65, JSON.stringify(p6.chances));
  verifier("1re surpuissance : sous le max aussi, 30 + 5 → 35", p3.chances["Brûlé"] === 35, JSON.stringify(p3.chances));
  verifier("1re surpuissance : un cran de trop reste plafonné au max, puis +5 (7 crans → 65)", p7.chances["Brûlé"] === 65, JSON.stringify(p7.chances));
  const feu40 = await extraire(40, 4, { EFF_BRULE: 6 }, { element: "Feu" });
  const feu75 = await extraire(75, 4, { EFF_BRULE: 6 }, { element: "Feu" });
  verifier("Attaque de Feu, 60 % + 5 % offerts : 60 sans, 65 à la 1re surpuissance", feu40.chances["Brûlé"] === 60 && feu75.chances["Brûlé"] === 65,
           `${feu40.chances["Brûlé"]} / ${feu75.chances["Brûlé"]}`);
  const et = await extraire(75, 4, { EFF_ETOURDI: 4 });
  const po = await extraire(75, 4, { EFF_POUSSEE: 5 });
  const lu = await extraire(75, 4, { EFF_LUMIERE: 5 });
  verifier("1re surpuissance : Étourdi 4 × 10 (max 40) → 45", et.chances["Étourdi"] === 45, JSON.stringify(et.chances));
  verifier("1re surpuissance : Poussée 5 × 15 (max 60) → 65", po.chances["Poussée"] === 65, JSON.stringify(po.chances));
  verifier("1re surpuissance : Lumière 5 × 20 (max 80) → 85", lu.lumiere === 85, String(lu.lumiere));

  // 2e SURPUISSANCE : +8 d'office, par-dessus le max
  const d6 = await extraire(100, 7, { EFF_BRULE: 6 });
  const d7 = await extraire(100, 7, { EFF_BRULE: 7 });
  const d3 = await extraire(100, 7, { EFF_BRULE: 3 });
  const pe = await extraire(100, 7, { EFF_PEUR: 4 });
  verifier("2e surpuissance : Brûlé au max (60) +8 → 68", d6.chances["Brûlé"] === 68, JSON.stringify(d6.chances));
  verifier("2e surpuissance : un cran de trop ne fait pas plus (7 crans → 68)", d7.chances["Brûlé"] === 68, JSON.stringify(d7.chances));
  verifier("2e surpuissance : sous le max aussi, 30 + 8 → 38", d3.chances["Brûlé"] === 38, JSON.stringify(d3.chances));
  verifier("2e surpuissance : Peur 4 × 15 = 60 → 68", pe.chances["Peur"] === 68, JSON.stringify(pe.chances));
  const lu100 = await extraire(100, 7, { EFF_LUMIERE: 4 });
  verifier("2e surpuissance : Lumière 80 → 88", lu100.lumiere === 88, String(lu100.lumiere));
  const tr = await p.evaluate(() => [window.chanceTractionRepartie({ chanceParCran: 15, plafond: 60, bonusSurpuissance: 8 }, 4),
                                     window.chanceTractionRepartie({ chanceParCran: 15, plafond: 60, bonusSurpuissance: 5 }, 4),
                                     window.chanceTractionRepartie({ chanceParCran: 15, plafond: 60 }, 4)]);
  verifier("Traction répartie : 4 crans × 15 (max 60) → 68 (100+), 65 (70+), 60 sans", tr[0] === 68 && tr[1] === 65 && tr[2] === 60, JSON.stringify(tr));

  // LES DÉGÂTS GARDENT LEUR MULTIPLICATEUR
  verifier("les dégâts : 2 × 3 = 6 ; 4 × 3 = 12 → 15 (×1,25) ; 7 × 3 = 21 → 28 (×1,35)",
           s6.degats === 6 && p6.degats === 15 && d6.degats === 28, `${s6.degats} / ${p6.degats} / ${d6.degats}`);

  // NI LES CRÉATURES
  const m = await extraire(100, 7, { EFF_BRULE: 6 }, { lanceur: "M1" });
  verifier("une créature à 100 : sa seule triche (60 × 1,2 = 72), pas de +8",
           m.chances["Brûlé"] === 72, JSON.stringify(m.chances));
});

// =========================================================================
console.log("\n3. LA FORGE (competences.js) : LES BORNES ET L'AFFICHAGE");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => {
    window.__docs = { "Personnages/H1": { Race: "Humain" },
                      "Caracteristiques/H1": { force: 20, dex: 20, con: 20, int: 20, sag: 20, cha: 20 } };
    document.getElementById("champ-id-personnage").value = "H1";
    window.OUVERTURE_FORGE_EN_COURS = false;
    await window.ouvrirCreationCompetence();
    window.forgeState.armePrincipale = "Magie";
    const eff = (id) => window.forgeState.effetsBDD.find(e => e.id === id);
    const poser = (att, brule) => {
      window.forgeState.actions = [{ idInst: "A1", baseEffet: eff("EFF_ATTAQUE_MAGIQUE"), count: att, mods: { EFF_BRULE: brule },
                                     zoneHexes: [], baseDuree: 0, modsDuree: {} }];
      window.rafraichirForge();
    };
    const lire = () => {
      const lignes = [...document.querySelectorAll("#forge-contenu-carte .forge-sous-effet")];
      const brule = lignes.find(l => /Brûlé/.test(l.textContent));
      const plus = brule ? brule.querySelector('button[onclick*="modifierModCount"][onclick$=", 1)"]') : null;
      const chance = brule ? brule.querySelector(".forge-chance-surpuissante") : null;
      return { fatigue: document.getElementById("forge-fatigue-val").textContent,
               crans: window.forgeState.actions[0].mods.EFF_BRULE,
               desc: brule ? (brule.querySelector(".forge-desc") || {}).textContent : "",
               plusActif: !!plus && !plus.disabled, chance: chance ? chance.textContent : "",
               bandeau: document.getElementById("forge-surpuissance").textContent };
    };
    const res = {};
    poser(3, 6); res.sans = lire();                        // 30 + 30 = 60
    poser(4, 6); res.p1 = lire();                          // 40 + 30 = 70
    window.modifierModCount("A1", "EFF_BRULE", 1); res.p1plus = lire();   // pas de 7e cran
    poser(7, 6); res.p2 = lire();                          // 70 + 30 = 100
    window.modifierModCount("A1", "EFF_BRULE", 1); res.p2plus = lire();   // 105
    window.fermerForgeCompetence();
    return res;
  });
  verifier("sans surpuissance (60) : Brûlé ×6 = 60 %, « + » fermé, rien en plus",
    r.sans.fatigue === "60" && /60%/.test(r.sans.desc) && /max 60%/.test(r.sans.desc) && !r.sans.plusActif && r.sans.chance === ""
    && !/effets/.test(r.sans.bandeau), JSON.stringify(r.sans));
  verifier("1re surpuissance (70) : « → 65 % avec la surpuissance », bandeau « effets +5 % (max +5 %) »",
    r.p1.fatigue === "70" && /max 60%/.test(r.p1.desc) && /→ 65 % avec la surpuissance/.test(r.p1.chance) && /effets \+5 % \(max \+5 %\)/.test(r.p1.bandeau), JSON.stringify(r.p1));
  verifier("…le « + » reste fermé au max du grimoire : pas de 7e cran", !r.p1.plusActif && r.p1plus.crans === 6 && r.p1plus.fatigue === "70", JSON.stringify(r.p1plus));
  verifier("2e surpuissance (100) : « → 68 % avec la surpuissance », bandeau « effets +8 % (max +8 %) »",
    r.p2.fatigue === "100" && /→ 68 % avec la surpuissance/.test(r.p2.chance) && /effets \+8 % \(max \+8 %\)/.test(r.p2.bandeau), JSON.stringify(r.p2));
  verifier("2e surpuissance : toujours pas de 7e cran", r.p2plus.crans === 6 && /→ 68 %/.test(r.p2plus.chance), JSON.stringify(r.p2plus));
});

// =========================================================================
console.log("\n4. LA PAGE");
// =========================================================================
verifier("pas d'erreur dans la page", !erreurs.length, erreurs.slice(0, 3).join(" | "));

await b.close(); serveur.close();
console.log(echecs ? `\n${echecs} CONTRÔLE(S) EN ÉCHEC` : "\nTOUS LES CONTRÔLES PASSENT");
process.exit(echecs ? 1 : 0);
