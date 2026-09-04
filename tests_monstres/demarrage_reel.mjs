// LE JEU DÉMARRE-T-IL VRAIMENT ?
// Tous les autres bancs découpent une fonction et la font tourner à part. Aucun
// ne vérifiait la chose la plus élémentaire : que index.html charge ses DOUZE
// modules et que les fonctions du jeu existent. Or il suffit qu'UN module lève
// une exception à son chargement pour que toutes ses fonctions disparaissent —
// et le jeu paraît alors « complètement cassé », plusieurs boutons sans rapport
// morts d'un coup, sans le moindre message visible sur un iPad.
//
// Ce banc sert la vraie page en HTTP (les modules ES refusent le protocole
// file://), remplace les deux modules Firebase du CDN par des doublures, et
// laisse TOUT le reste se charger pour de vrai.
import fs from 'fs';
import http from 'http';
import path from 'path';

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

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// Des doublures pour les deux modules Firebase : elles n'écrivent nulle part,
// mais exposent exactement ce que le jeu importe. Tout le reste est le vrai code.
const FAUX_APP = `export const initializeApp = () => ({ nom: "faux" });`;
const FAUX_FIRESTORE = `
  const noter = (quoi) => (...a) => { (window.__firestore = window.__firestore || []).push({ quoi, a: a.length }); };
  export const getFirestore = () => ({ faux: true });
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data, opts) => {
    (window.__ecritures = window.__ecritures || []).push({ chemin: ref && ref.chemin, data, opts });
    noter("setDoc")(ref, data, opts);
  };
  export const updateDoc = async (...a) => noter("updateDoc")(...a);
  export const deleteDoc = async (...a) => noter("deleteDoc")(...a);
  export const addDoc = async (...a) => { noter("addDoc")(...a); return { id: "neuf" }; };
  export const deleteField = () => "«champ supprimé»";
  export class FieldPath { constructor(...segments) { this.segments = segments; } }
  export const arrayUnion = (...v) => v;
  export const arrayRemove = (...v) => v;
  export const increment = (n) => n;
  export const serverTimestamp = () => Date.now();
  export const onSnapshot = (ref, fn) => { (window.__ecoutes = window.__ecoutes || []).push(ref); return () => {}; };
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
const p = await b.newPage({ viewport: { width: 1194, height: 834 } }); // format iPad

// L'ORDRE COMPTE : Playwright applique la DERNIÈRE route posée en premier. Le
// filtre général vient donc d'abord, les doublures ensuite — sans quoi le
// filtre couperait les modules Firebase et rien ne se chargerait.
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({
  contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({
  contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE }));

const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });

await p.goto(base + '/index.html');
await p.waitForTimeout(2500);

// =========================================================================
console.log("1. LES MODULES DU JEU SE CHARGENT TOUS");
{
  // Une fonction représentative par module : si elle manque, le module a
  // échoué et TOUT ce qu'il définit a disparu avec lui.
  const parModule = {
    "app.js": ["persoDocVersFront", "bonusEquip", "chargerOngletInventaire"],
    "combat.js": ["ouvrirCombat", "genererTokensCombat", "reinitialiserCombat",
                  "enregistrerPointsApparition", "deployerCombatApresReperes",
                  "declencherVictoireTest", "modifierPartie", "pointApparition"],
    "mouvement.js": ["dessinerCheminMouvement"],
    "moteur_effets.js": ["demarrerCiblage", "porteeAvecArme", "appliquerEquipementALaCarte"],
    "monstres.js": ["recomposerCombattants", "ouvrirGenerationRencontre", "genererRencontreMonstres"],
    "monstres_ia.js": ["choisirCibleMonstre"],
    "objets.js": ["fabriquerObjet", "bonusEquipement", "raisonBlocageCarte"],
    "objets_ia.js": ["promptImageObjet", "illustrerLesObjets", "lancerIllustrationButin",
                     "avancementImagesButin", "peutIllustrerLesObjets"],
    "loot.js": ["afficherFenetreButin", "fermerButinLocalement", "demarrerButin",
                "combatGagne", "equiperObjet"]
  };
  const etat = await p.evaluate((table) => {
    const sortie = {};
    Object.keys(table).forEach(module => {
      sortie[module] = table[module].filter(nom => typeof window[nom] !== "function");
    });
    return sortie;
  }, parModule);

  Object.keys(parModule).forEach(module => {
    verifier(`${module} est chargé et expose ses fonctions`, etat[module].length === 0,
             etat[module].length ? `(manque : ${etat[module].join(", ")})` : "");
  });
}

console.log("\n2. AUCUNE ERREUR AU DÉMARRAGE");
verifier("le chargement du jeu ne lève aucune exception", erreurs.length === 0,
         erreurs.slice(0, 3).join(" | "));

// =========================================================================
console.log("\n3. LE PARCOURS DE NICO : RÉINITIALISER, PLACER, GÉNÉRER");
{
  const parcours = await p.evaluate(async () => {
    const journal = [];
    const noter = (etape, ok, detail) => journal.push({ etape, ok, detail });

    // Un décor de combat minimal, comme après le chargement d'une partie.
    window.ID_PARTIE_COURANTE = "PARTIE_TEST";
    window.PARTIE_DATA = { Tour_Combat: 1, Phase_Combat: "Preparation" };
    window.PERSOS_PARTIE = [
      { idPersonnage: "J1", prenom: "Pliors", idJoueur: "P1", camp: "Allié", statut: "Vivant",
        urlToken: "t.png", PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [] }
    ];
    window.PERSOS_JOUEURS_PARTIE = [...window.PERSOS_PARTIE];
    window.MONSTRES_PARTIE = [];
    window.TOKENS_VTT_DATA = {};
    window.PLATEAU_VTT = {
      getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
      hexToPixel: (q, r) => ({ x: q * 40, y: r * 40 }),
      pixelToHex: (x, y) => ({ q: Math.round(x / 40), r: Math.round(y / 40) }),
      renderMap: () => {}, gridState: {}
    };
    // La VRAIE écriture des pions est laissée en place : c'est elle qu'on veut
    // voir arriver en base, et sous la bonne forme.
    window.appliquerTokensVTT = () => {};
    window.confirm = () => true;

    // Étape 1 : le butin oublié en base, celui qui empoisonne tout.
    window.PARTIE_DATA.Butin = { ouvert: true, etape: "personnel",
                                 participants: ["J1"],
                                 parPersonnage: { J1: { items: [], decisions: {}, valide: false } } };
    document.getElementById("fenetre-combat").style.display = "block";

    try {
      window.afficherFenetreButin(window.PARTIE_DATA.Butin);
      const visible = document.getElementById("fenetre-butin").style.display;
      noter("plateau vide : le butin reste caché", visible === "none", "display=" + visible);
    } catch (e) { noter("plateau vide : le butin reste caché", false, "exception : " + e.message); }

    // Étape 2 : les deux repères posés déclenchent le déploiement.
    window.DEPLOIEMENT_APRES_REPERES = true;
    let rencontreDemandee = false;
    const vraiOuvrir = window.ouvrirGenerationRencontre;
    window.ouvrirGenerationRencontre = () => { rencontreDemandee = true; vraiOuvrir(); };
    try {
      await window.enregistrerPointsApparition({ q: 2, r: 2 }, { q: 9, r: 2 });
      noter("les repères déclenchent le déploiement", true);
    } catch (e) { noter("les repères déclenchent le déploiement", false, "exception : " + e.message); }

    noter("les repères sont lisibles par le jeu",
          !!window.pointApparition("Allié") && !!window.pointApparition("Ennemi"),
          JSON.stringify(window.pointApparition("Allié")));
    noter("le pion du héros a été posé", Object.keys(window.TOKENS_VTT_DATA).length === 1,
          Object.keys(window.TOKENS_VTT_DATA).join(",") || "aucun");

    // Le pion doit partir en base DANS la carte "Tokens". Écrit à plat
    // ("Tokens.J1" en champ de premier niveau), il n'y arrive jamais et le
    // plateau reste désespérément vide, sans la moindre erreur en console.
    const ecritsVTT = (window.__ecritures || []).filter(e => (e.chemin || "").startsWith("Combat_VTT"));
    const dernier = ecritsVTT[ecritsVTT.length - 1];
    noter("le pion part en base dans la carte des pions",
          !!dernier && !!dernier.data && !!dernier.data.Tokens && !!dernier.data.Tokens.J1,
          dernier ? JSON.stringify(dernier.data) : "aucune écriture");
    noter("sans champ bancal à côté de la carte",
          !!dernier && Object.keys(dernier.data || {}).every(c => !c.startsWith("Tokens.")),
          dernier ? Object.keys(dernier.data || {}).join(",") : "");
    noter("la fenêtre de difficulté s'est ouverte", rencontreDemandee
          && document.getElementById("etape-generation-rencontre").style.display === "flex",
          "display=" + document.getElementById("etape-generation-rencontre").style.display);

    // Étape 3 : rien ne doit recouvrir cette fenêtre de difficulté.
    const boite = document.querySelector("#etape-generation-rencontre .choix-difficulte-rencontre")
               || document.querySelector("#etape-generation-rencontre button");
    if (boite) {
      const r = boite.getBoundingClientRect();
      const dessus = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const libre = dessus && (boite === dessus || boite.contains(dessus) || dessus.contains(boite));
      noter("le choix de difficulté est cliquable", !!libre,
            libre ? "" : "recouvert par " + (dessus && (dessus.id || dessus.className)));
    } else {
      noter("le choix de difficulté est cliquable", false, "aucun élément de choix trouvé");
    }

    // Étape 4 : le bouton PION du menu de combat.
    try {
      window.TOKENS_VTT_DATA = {};
      await window.genererTokensCombat();
      noter("le bouton PION pose bien les pions", Object.keys(window.TOKENS_VTT_DATA).length === 1,
            Object.keys(window.TOKENS_VTT_DATA).join(",") || "aucun pion");
    } catch (e) { noter("le bouton PION pose bien les pions", false, "exception : " + e.message); }

    // Étape 5 : le bouton RENCONTRE.
    try {
      document.getElementById("etape-generation-rencontre").style.display = "none";
      window.ouvrirGenerationRencontre();
      noter("le bouton RENCONTRE rouvre la fenêtre",
            document.getElementById("etape-generation-rencontre").style.display === "flex");
    } catch (e) { noter("le bouton RENCONTRE rouvre la fenêtre", false, "exception : " + e.message); }

    return journal;
  });

  parcours.forEach(e => verifier(e.etape, e.ok, e.detail || ""));
}

// =========================================================================
// Nico joue sur iPad : aucune console, donc aucune erreur visible. Un module
// qui ne se charge pas y est totalement muet — ses fonctions disparaissent, des
// boutons sans rapport cessent de répondre, et il n'y a rien à rapporter. Ce
// bandeau rend la panne lisible à l'écran, et c'est LUI qu'on vérifie ici.
// =========================================================================
console.log("\n4. L'ÉQUIPEMENT DE DÉPART, DANS LA VRAIE PAGE");
{
  const formulaire = await p.evaluate(() => {
    const lire = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      return { valeurs: [...el.options].map(o => o.value), defaut: el.value };
    };
    // Le formulaire s'adapte à la race : les deux encarts doivent survivre à
    // chacune d'elles, sans exception.
    const survivants = {};
    ["Humain", "Ondari", "Vargen", "Ankylar", "Ophior", "Gob", "Ethéré"].forEach(race => {
      if (typeof window.adapterFormulaireRace === "function") window.adapterFormulaireRace(race);
      const arme = document.getElementById("groupe-type-arme");
      const tenue = document.getElementById("groupe-tenue");
      survivants[race] = (arme && arme.style.display !== "none")
                      && (tenue && tenue.style.display !== "none");
    });
    return { arme: lire("champ-type-arme"), tenue: lire("champ-tenue"),
             ancien: !!document.getElementById("champ-style"), survivants };
  });

  verifier("le menu des types d'arme est dans la page",
           !!formulaire.arme, formulaire.arme ? `(${formulaire.arme.valeurs.length} choix)` : "(absent)");
  verifier("le menu des tenues aussi",
           !!formulaire.tenue, formulaire.tenue ? `(${formulaire.tenue.valeurs.join(", ")})` : "(absent)");
  verifier("l'ancien menu de tenues décoratives a disparu", formulaire.ancien === false);
  verifier("chaque menu a une valeur par défaut, jamais vide",
           !!formulaire.arme.defaut && !!formulaire.tenue.defaut,
           `(${formulaire.arme.defaut} / ${formulaire.tenue.defaut})`);
  const racesQuiPerdent = Object.entries(formulaire.survivants).filter(([, ok]) => !ok).map(([r]) => r);
  verifier("les deux encarts restent visibles pour TOUTES les races",
           racesQuiPerdent.length === 0, `(${racesQuiPerdent.join(", ") || "aucune ne les perd"})`);
}

console.log("\n5. LE RAPPORTEUR D'ERREURS DONNE À VOIR LA PANNE");
{
  const visible = await p.evaluate(() => {
    document.getElementById("bandeau-erreurs-js")?.remove();
    window.dispatchEvent(new ErrorEvent("error", {
      message: "TypeError: window.machin is not a function",
      filename: "http://exemple/loot.js", lineno: 42
    }));
    const boite = document.getElementById("bandeau-erreurs-js");
    return boite ? boite.innerText.replace(/\s+/g, " ") : null;
  });
  verifier("une erreur JS apparaît à l'écran, sans console",
           !!visible && visible.includes("window.machin is not a function"),
           `(« ${(visible || "rien affiché").slice(0, 80)} »)`);
  verifier("avec le fichier et la ligne, de quoi la rapporter",
           !!visible && visible.includes("loot.js:42"), `(« ${(visible || "").slice(0, 90)} »)`);

  const repetee = await p.evaluate(() => {
    const compter = () => document.getElementById("bandeau-erreurs-js").querySelectorAll("div").length;
    const avant = compter();
    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new ErrorEvent("error", {
        message: "TypeError: window.machin is not a function",
        filename: "http://exemple/loot.js", lineno: 42
      }));
    }
    return { avant, apres: compter() };
  });
  verifier("la même erreur ne se répète pas en boucle à l'écran",
           repetee.apres === repetee.avant, `(${repetee.avant} → ${repetee.apres} lignes)`);

  const module = await p.evaluate(() => {
    document.getElementById("bandeau-erreurs-js")?.remove();
    const faux = document.createElement("script");
    faux.setAttribute("src", "module_inexistant.js?v=9");
    // On simule l'échec de chargement d'une balise script, tel que le
    // navigateur le signale : un event sans message, sur la balise elle-même.
    const ev = new Event("error", { bubbles: false });
    Object.defineProperty(ev, "target", { value: faux });
    window.dispatchEvent(ev);
    const boite = document.getElementById("bandeau-erreurs-js");
    return boite ? boite.innerText.replace(/\s+/g, " ") : null;
  });
  verifier("un module qui ne se charge pas est nommé explicitement",
           !!module && module.includes("module non chargé") && module.includes("module_inexistant.js"),
           `(« ${(module || "rien affiché").slice(0, 90)} »)`);

  // LE PIÈGE À NE PAS REFAIRE : ce bandeau a le z-index maximal. Posé en haut
  // de l'écran, il recouvrait le menu de combat et le bandeau des points
  // d'apparition — l'outil de diagnostic devenait la panne. Il vit donc en
  // bas, et ne reçoit les doigts que sur sa croix.
  const gene = await p.evaluate(() => {
    const boite = document.getElementById("bandeau-erreurs-js");
    const r = boite.getBoundingClientRect();
    const style = getComputedStyle(boite);
    // Un point au milieu du bandeau : qui le reçoit ?
    const dessous = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      enBas: style.bottom === "0px" && style.top !== "0px",
      transparent: style.pointerEvents === "none",
      traverse: !boite.contains(dessous),
      croixCliquable: getComputedStyle(boite.querySelector("button")).pointerEvents === "auto"
    };
  });
  verifier("le bandeau se pose en BAS, loin du menu de combat", gene.enBas);
  verifier("il laisse passer les doigts au lieu de les intercepter",
           gene.transparent && gene.traverse);
  verifier("mais sa croix, elle, reste cliquable", gene.croixCliquable);

  const ferme = await p.evaluate(() => {
    document.getElementById("bandeau-erreurs-js").querySelector("button").click();
    return document.getElementById("bandeau-erreurs-js") === null;
  });
  verifier("le bandeau se referme d'un doigt", ferme);
}

console.log("\nerreurs JS pendant toute la séance :", erreurs.length ? erreurs.slice(0, 5).join("\n     ") : "aucune");
await p.screenshot({ path: '/tmp/demarrage_reel.png' });
await b.close();
serveur.close();

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
