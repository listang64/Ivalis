// v431 — LES AUGMENTATIONS MAX, CONTRE ET ABSORPTION DANS LA FORGE, LA PORTÉE D'UNE ARME.
// Nico : « pour les augmentations d'effet, 2 cas de figure : l'augmentation (dans la limite établie) et l'augmentation
// max (qui s'additionne à la toute fin, sans prendre en compte la limite) ; toutes s'additionnent ; les max ne
// s'appliquent que sur les effets du même nom associés à un sort » ; « tu ajoutes chaque max à la limite (sauf arme)
// et tu mets sur l'effet l'augmentation : Peur avec 5 % d'augmentation max, au premier niveau 15 % (10 + 5), avec à
// côté (max 65 %) ; s'il y en a plusieurs, cumul » ; « pour les armes, tu appliques lors du calcul en combat mais pas
// dans la fiche sort ». « Contre et Absorption : 25 %, puis 40 % au 2e cumul (2 cumuls max). » « Le bonus de portée
// d'arc s'applique bien à tous les sorts créés avec pour base l'arme en question ? »
// (Le combat : corrections_v429, v416_vargen, v427_pugiliste, hoplite, inquisiteur, bouclier_absorption_contre.)
// Lancer : node tests_monstres/corrections_v431.mjs
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
                 Effet_Base: "20% de chance de passer outre la défense magique (max 80%)" },
  EFF_SAIGNEMENT: { ...commun, Nom: "Saignement", Cout_PT: 1, Valeur: 0, Pourcent_Base: 10, Pourcent_Max: 75, Tours: 2,
                 Effet_Base: "10% de chance de faire saigner la cible (max 75%)" },
  EFF_PROVOCATION: { ...commun, Nom: "Provocation", Cout_PT: 1, Valeur: 0, Pourcent_Base: 10, Pourcent_Max: 60, Tours: 2,
                 Effet_Base: "10% de chance de provoquer la cible" },
  EFF_CONTRE:  { ...commun, Nom: "Contre", Cout_PT: 1, Valeur: 20, Pourcent_Base: 0, Pourcent_Max: 60,
                 Effet_Base: "Annule 20% des dégâts physiques subis" },
  EFF_ABSORPTION: { ...commun, Nom: "Absorption", Cout_PT: 1, Valeur: 20, Pourcent_Base: 0, Pourcent_Max: 60,
                 Effet_Base: "Annule 20% des dégâts magiques subis" }
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
await p.evaluate((EFFETS) => { window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS)); window.jouerSonClic = () => {}; }, EFFETS);

// =========================================================================
console.log("\n1. LA RÈGLE : LES AUGMENTATIONS MAX DU PERSONNAGE (app.js, augmentationsMax)");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const vrai = window.atoutRace;
    window.atoutRace = () => ({ chanceEtatsCharisme: 6, chanceElementaire: 4, provocationAttaques: 10, chanceSaignementPhysique: 10, chanceSaignementSort: 10 });
    try {
      const a = (nom, o) => window.augmentationsMax({}, nom, o || {});
      return { peur: a("Peur", { fatigue: 70 }), peurSeule: a("Peur"), brule: a("Brûlé", { fatigue: 100 }), provoc: a("Provocation"),
               saignPhys: a("Saignement", { physique: true }), poussee: a("Poussée", { fatigue: 70 }), etourdi: a("Étourdissement") };
    } finally { window.atoutRace = vrai; }
  });
  verifier("Peur, 1re surpuissance + Maître illusionniste (6) : 5 + 6 = 11, chaque source dite", r.peur.total === 11 && r.peur.details.map(d => d.source).join() === "surpuissance,Maître illusionniste", JSON.stringify(r.peur));
  verifier("Peur sans surpuissance : 6 (le talent seul)", r.peurSeule.total === 6, JSON.stringify(r.peurSeule));
  verifier("Brûlé, 2e surpuissance + Maître des éléments (4) : 12", r.brule.total === 12, JSON.stringify(r.brule));
  verifier("Provocation : le Protecteur (10)", r.provoc.total === 10 && r.provoc.details[0].source === "Protecteur", JSON.stringify(r.provoc));
  verifier("Saignement : le Pugiliste (10)", r.saignPhys.total === 10, JSON.stringify(r.saignPhys));
  verifier("Poussée : la surpuissance seule (5)", r.poussee.total === 5, JSON.stringify(r.poussee));
  verifier("Étourdissement : rien (aucun talent ne le pousse)", r.etourdi.total === 0, JSON.stringify(r.etourdi));
});

// =========================================================================
console.log("\n2. LA FORGE : LA CHANCE AFFICHÉE COMPREND LES MAX, ET « (max …) » À CÔTÉ");
// =========================================================================
const forge = (actions, atouts, arme) => p.evaluate(async ([actions, atouts, arme]) => {
  window.__docs = { "Personnages/H1": { Race: "Humain" }, "Caracteristiques/H1": { force: 20, dex: 20, con: 20, int: 20, sag: 20, cha: 20 } };
  document.getElementById("champ-id-personnage").value = "H1";
  window.OUVERTURE_FORGE_EN_COURS = false;
  await window.ouvrirCreationCompetence();
  const vrai = window.atoutRace;
  window.atoutRace = (p) => ({ ...(vrai(p) || {}), ...(atouts || {}) });
  try {
    window.forgeState.armePrincipale = arme || "Magie";
    const eff = (id) => window.forgeState.effetsBDD.find(e => e.id === id);
    window.forgeState.actions = actions.map((a, i) => ({ idInst: "A" + i, baseEffet: eff(a.base), count: a.count, mods: a.mods || {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }));
    window.rafraichirForge();
    const descs = [...document.querySelectorAll("#forge-contenu-carte .forge-desc")].map(x => x.textContent);
    return { fatigue: document.getElementById("forge-fatigue-val").textContent, descs };
  } finally { window.atoutRace = vrai; window.fermerForgeCompetence(); }
}, [actions, atouts, arme]);
const trouve = (r, re) => r.descs.find(d => re.test(d)) || "";
await section(async () => {
  // Peur 1 cran (15 %) + Maître illusionniste 5 : 20 %, (max 65 %).
  let r = await forge([{ base: "EFF_ATTAQUE_MAGIQUE", count: 1, mods: { EFF_PEUR: 1 } }], { chanceEtatsCharisme: 5 });
  let d = trouve(r, /fuir/);
  verifier("Peur, 1 cran (15 %) avec 5 % d'augmentation max : « 20% … (max 65%) »", /^20% /.test(d) && /\(max 65%\)/.test(d), d);
  r = await forge([{ base: "EFF_ATTAQUE_MAGIQUE", count: 1, mods: { EFF_PEUR: 4 } }], { chanceEtatsCharisme: 5 });
  d = trouve(r, /fuir/);
  verifier("Peur à la limite (4 crans = 60 %) : 65 %, (max 65 %)", /^65% /.test(d) && /\(max 65%\)/.test(d), d);
  // Le cumul : surpuissance (70) + talent.
  r = await forge([{ base: "EFF_ATTAQUE_MAGIQUE", count: 6, mods: { EFF_PEUR: 2 } }], { chanceEtatsCharisme: 5 });
  d = trouve(r, /fuir/);
  verifier("cumul : 1re surpuissance (70 : +5) et talent (+5) sur Peur 30 % : 40 %, (max 70 %)", r.fatigue === "70" && /^40% /.test(d) && /\(max 70%\)/.test(d), `${r.fatigue} : ${d}`);
  // Un effet que rien ne pousse : inchangé.
  r = await forge([{ base: "EFF_ATTAQUE_MAGIQUE", count: 1, mods: { EFF_ETOURDI: 1 } }], { chanceEtatsCharisme: 5 });
  d = trouve(r, /étourdir/);
  verifier("Étourdissement (rien ne le pousse) : 10 %, « max 40% » inchangé", /^10% /.test(d) && /max 40%/.test(d), d);
  // Le Protecteur : sur la Provocation du sort (pas de « max » dans le texte du grimoire : il s'ajoute).
  r = await forge([{ base: "EFF_ATTAQUE_MAGIQUE", count: 1, mods: { EFF_PROVOCATION: 2 } }], { provocationAttaques: 10 });
  d = trouve(r, /provoquer/);
  verifier("Provocation 20 % du Protecteur niveau 5 (+10 max) : « 30% … (max 70%) »", /^30% /.test(d) && /\(max 70%\)/.test(d), d);
  // Le Pugiliste : un sort magique, Saignement.
  r = await forge([{ base: "EFF_ATTAQUE_MAGIQUE", count: 1, mods: { EFF_SAIGNEMENT: 3 } }], { chanceSaignementSort: 10, chanceSaignementPhysique: 0 });
  d = trouve(r, /saigner/);
  verifier("Saignement 30 % d'un sort magique, Pugiliste Vargen (+10 max) : « 40% … (max 85%) »", /^40% /.test(d) && /\(max 85%\)/.test(d), d);
  // Les armes : rien dans la fiche du sort.
  r = await forge([{ base: "EFF_ATTAQUE_MAGIQUE", count: 1, mods: { EFF_PEUR: 1 } }], {});
  d = trouve(r, /fuir/);
  verifier("sans augmentation max : 15 %, (max 60 %) comme avant (une arme ne s'y affiche jamais)", /^15% /.test(d) && /max 60%/.test(d) && !/max 6[1-9]/.test(d), d);
});

// =========================================================================
console.log("\n3. CONTRE ET ABSORPTION DANS LA FORGE : 2 CRANS, 25 % PUIS 40 %");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(async () => {
    window.__docs = { "Personnages/H1": { Race: "Humain" }, "Caracteristiques/H1": { force: 20, dex: 20, con: 20, int: 20, sag: 20, cha: 20 } };
    document.getElementById("champ-id-personnage").value = "H1";
    window.OUVERTURE_FORGE_EN_COURS = false;
    await window.ouvrirCreationCompetence();
    window.forgeState.armePrincipale = "Magie";
    const eff = (id) => window.forgeState.effetsBDD.find(e => e.id === id);
    const res = {};
    for (const [nom, id] of [["contre", "EFF_CONTRE"], ["absorption", "EFF_ABSORPTION"]]) {
      window.forgeState.actions = [{ idInst: "A1", baseEffet: eff(id), count: 1, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }];
      window.rafraichirForge();
      const un = [...document.querySelectorAll("#forge-contenu-carte .forge-desc")].map(x => x.textContent).join(" | ");
      window.modifierActionCount("A1", 1);
      const deux = [...document.querySelectorAll("#forge-contenu-carte .forge-desc")].map(x => x.textContent).join(" | ");
      window.modifierActionCount("A1", 1);
      res[nom] = { un, deux, crans: window.forgeState.actions[0].count };
    }
    window.fermerForgeCompetence();
    return res;
  });
  verifier("Contre, 1 cran : « Renvoie 25% des dégâts physiques subis (après l'armure) »", /Renvoie 25% des dégâts physiques subis \(après l'armure\)/.test(r.contre.un), r.contre.un);
  verifier("…2 crans : 40 % ; un 3e cran refusé", /Renvoie 40%/.test(r.contre.deux) && r.contre.crans === 2, JSON.stringify(r.contre));
  verifier("Absorption, 1 cran : « Soigne de 25% des dégâts magiques subis (après la résistance magique) »", /Soigne de 25% des dégâts magiques subis \(après la résistance magique\)/.test(r.absorption.un), r.absorption.un);
  verifier("…2 crans : 40 % ; pas de 3e", /Soigne de 40%/.test(r.absorption.deux) && r.absorption.crans === 2, JSON.stringify(r.absorption));
});

// =========================================================================
console.log("\n3 bis. (v468) CONTRE ET ABSORPTION NE SE METTENT PLUS EN ZONE");
// Nico : « sur Contre et Absorption, retirer le fait de pouvoir les mettre sur une zone ».
{
  const r = await p.evaluate(async () => {
    window.EFFETS_BDD_CACHE.EFF_ZONE = { Nom: "Zone", Cout_PT: 1, Modificateur: "AUCUN", Type_Mecanique: "Spatial", Type_Mecanique_2: "Aucun", Valeur: 0, Pourcent_Base: 0, Pourcent_Max: 0, Tours: 0 };
    window.EFFETS_BDD_CACHE.EFF_SOIN = { Nom: "Soin", Cout_PT: 1, Modificateur: "SAGESSE", Type_Mecanique: "Action/Global", Type_Mecanique_2: "Aucun", Valeur: 5, Pourcent_Base: 0, Pourcent_Max: 0, Tours: 0 };
    window.OUVERTURE_FORGE_EN_COURS = false;
    await window.ouvrirCreationCompetence();
    window.forgeState.armePrincipale = "Magie";
    const eff = (id) => window.forgeState.effetsBDD.find(e => e.id === id);
    const etat = (mod, act) => window.etatSousEffetForge(mod, act);
    const action = (base, mods) => ({ idInst: "A1", baseEffet: eff(base), count: 1, mods: mods || {}, zoneHexes: [], baseDuree: 0, modsDuree: {} });
    const res = {
      zoneSurContre: etat(eff("EFF_ZONE"), action("EFF_CONTRE")), zoneSurAbsorption: etat(eff("EFF_ZONE"), action("EFF_ABSORPTION")),
      zoneSurSoinAbsorbant: etat(eff("EFF_ZONE"), action("EFF_SOIN", { EFF_ABSORPTION: 1 })),
      absorptionSurSoinEnZone: etat(eff("EFF_ABSORPTION"), action("EFF_SOIN", { EFF_ZONE: 3 })), contreSurSoinEnZone: etat(eff("EFF_CONTRE"), action("EFF_SOIN", { EFF_ZONE: 3 })),
      zoneSurSoin: etat(eff("EFF_ZONE"), action("EFF_SOIN")), absorptionSurSoin: etat(eff("EFF_ABSORPTION"), action("EFF_SOIN"))
    };
    window.fermerForgeCompetence();
    delete window.EFFETS_BDD_CACHE.EFF_ZONE; delete window.EFFETS_BDD_CACHE.EFF_SOIN;
    return res;
  });
  verifier("(v468) une action Contre ou Absorption : la Zone est grisée (incompatible)", r.zoneSurContre === "incompatible" && r.zoneSurAbsorption === "incompatible" && r.zoneSurSoinAbsorbant === "incompatible", JSON.stringify(r));
  verifier("(v468) …et une action déjà en Zone ne prend ni Contre ni Absorption", r.absorptionSurSoinEnZone === "incompatible" && r.contreSurSoinEnZone === "incompatible", JSON.stringify(r));
  verifier("(v468) …le reste ne change pas (un soin en Zone, un soin avec Absorption)", r.zoneSurSoin === "ok" && r.absorptionSurSoin === "ok", JSON.stringify(r));
  const lia = fs.readFileSync(path.join(RACINE, "lia_forge.js"), "utf-8"), mc = fs.readFileSync(path.join(RACINE, "monstres_competences.js"), "utf-8");
  verifier("(v468) LIA le sait (sa consigne, et elle passe par la même règle) ; la forge des ennemis aussi",
           /Sur une action qui porte Contre ou Absorption : pas de Zone/.test(lia) && /O\.etatSousEffet\(mod, act/.test(lia) && /nom\.trim\(\) === "zone" && \(estCA/.test(mc));
}

console.log("\n3 ter. (v474) LES 5 % DE L'ÉLÉMENT D'UNE ATTAQUE MAGIQUE : UNE AUGMENTATION MAX");
// Nico : « les 5 % d'effet d'un élément, quand on sélectionne un élément avec une attaque magique, c'est une augmentation max ».
{
  const r = await p.evaluate(async () => {
    window.__docs = { "Personnages/H1": { Race: "Humain" }, "Caracteristiques/H1": { force: 20, dex: 20, con: 20, int: 20, sag: 20, cha: 20 } };
    document.getElementById("champ-id-personnage").value = "H1";
    window.OUVERTURE_FORGE_EN_COURS = false;
    await window.ouvrirCreationCompetence();
    window.forgeState.armePrincipale = "Magie";
    const eff = (id) => window.forgeState.effetsBDD.find(e => e.id === id);
    const lire = (crans) => {
      window.forgeState.actions = [{ idInst: "A1", baseEffet: eff("EFF_ATTAQUE_MAGIQUE"), count: 1, element: "Feu", mods: crans ? { EFF_BRULE: crans } : {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }];
      window.rafraichirForge();
      return [...document.querySelectorAll("#forge-contenu-carte .forge-desc")].map(x => x.textContent).find(t => /brûl/i.test(t)) || "";
    };
    const res = { six: lire(6), trois: lire(3), zero: lire(0) };
    window.fermerForgeCompetence();
    return res;
  });
  verifier("(v474) Brûlé au max (6 crans, 60 %) sur une Attaque de Feu : 65 %, et le max monte à 65 %", /\b65\s*%/.test(r.six) && /max\s*65/i.test(r.six) && !/\b60\s*%/.test(r.six), r.six);
  verifier("(v474) …3 crans : 30 + 5 = 35 % (max 65 %)", /\b35\s*%/.test(r.trois) && /max\s*65/i.test(r.trois), r.trois);
}

console.log("\n4. LA PORTÉE D'UNE ARME NE SERT QUE LES CARTES DE SON TYPE (objets.js)");
// =========================================================================
await section(async () => {
  const r = await p.evaluate(() => {
    const vrais = { objetsEquipes: window.objetsEquipes, bonusEquip: window.bonusEquip };
    const fronde = { nom: "Fronde", type: "Arme légère Distance", bonus: { portee: 1 } };
    const dague = { nom: "Dague", type: "Arme légère CAC", bonus: {} };
    const lance = { nom: "Lance", type: "Arme polyvalente", bonus: { allonge: 1 } };
    const avec = (objets) => { window.objetsEquipes = () => objets;
      window.bonusEquip = (p, cle) => objets.reduce((s, o) => s + (parseInt((o.bonus || {})[cle]) || 0), 0); };
    try {
      avec([fronde, dague]);
      const p = { idPersonnage: "H1" };
      const res = { frondeDistance: window.bonusEquipPourCarte(p, "portee", "Arme légère Distance"),
                    frondeDague: window.bonusEquipPourCarte(p, "portee", "Arme légère CAC"),
                    frondeMagie: window.bonusEquipPourCarte(p, "portee", "Magie"),
                    frondeSansArme: window.bonusEquipPourCarte(p, "portee", "Sans arme / Arme rp"),
                    frondeAncienne: window.bonusEquipPourCarte(p, "portee", "Non spécifié") };
      avec([lance]);
      res.lancePoly = window.bonusEquipPourCarte(p, "allonge", "Arme polyvalente");
      res.lanceCac = window.bonusEquipPourCarte(p, "allonge", "Arme légère CAC");
      return res;
    } finally { Object.assign(window, vrais); }
  });
  verifier("une carte forgée pour la fronde (Arme légère Distance) : +1 de portée", r.frondeDistance === 1, JSON.stringify(r));
  verifier("une carte de dague tenue avec la fronde : rien de la fronde", r.frondeDague === 0, JSON.stringify(r));
  verifier("un sort (Magie), une carte sans arme : rien", r.frondeMagie === 0 && r.frondeSansArme === 0, JSON.stringify(r));
  verifier("une carte d'avant la Forge (« Non spécifié ») : garde la portée, comme avant", r.frondeAncienne === 1, JSON.stringify(r));
  verifier("l'allonge d'une lance : seulement sur ses cartes « Arme polyvalente »", r.lancePoly === 1 && r.lanceCac === 0, JSON.stringify(r));
});

verifier("pas d'erreur dans la page", !erreurs.length, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs ? `\n${echecs} CONTRÔLE(S) EN ÉCHEC` : "\nTOUS LES CONTRÔLES PASSENT");
process.exit(echecs ? 1 : 0);
