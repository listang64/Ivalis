// LE VOLET DES COMPÉTENCES
//
// Refonte UI combat, étape 3. Les bannières pendaient en permanence dans le
// panneau latéral gauche. Elles pendent maintenant d'une lanière de cuir qui
// descend du haut de l'écran quand on la demande, et remonte hors champ le
// reste du temps : le plateau reste dégagé pour viser et se déplacer.
//
// LA CONDITION POSÉE, ET CE QUI LA GARANTIT : « strictement la même place,
// même affichage de carte, mêmes boîtes de clic ». On ne fabrique donc PAS une
// seconde liste : on DÉMÉNAGE l'élément `combat-liste-competences`, et le volet
// est calé pour le reprendre là où le panneau le laissait (x = 20 px, mesuré).
// Tout ce qui le peuple, le lit ou l'écoute continue sans savoir qu'il a bougé ;
// deux listes concurrentes auraient divergé au premier tour.
//
// Ce banc ouvre la vraie page et vérifie sur le vrai code :
//   • le volet est replié au départ, et n'intercepte rien ;
//   • le bouton l'ouvre, le referme, et un clic sur la carte le referme ;
//   • un clic DANS le volet ou sur la carte en grand ne le referme pas ;
//   • il s'efface tout seul devant un ciblage ou un déplacement ;
//   • les bannières sont au pixel près là où elles étaient ;
//   • le repos long y a sa bannière, se choisit comme une carte, et part par le
//     bouton fin de tour ;
//   • l'ouverture et la fermeture ont bien leur effet de ressort ;
//   • la carte en grand se pose À DROITE du volet, et PAR-DESSUS ;
//   • retenir une carte range le volet EN ENTIER, lanière comprise, ET fait
//     disparaître la carte en grand ;
//   • la lanière est à sa taille doublée, sans une once de déformation.
import fs from 'fs';
import http from 'http';
import path from 'path';

const EFFETS = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/effets_reels.json', 'utf-8'));

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

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
  // firebase-config.js fabrique la base avec des options (le transport sondé
  // plutôt que subi, pour l'iPad) : le bouchon doit donc offrir cette porte-là,
  // sinon le module ne se charge pas et rien du jeu ne s'initialise.
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {}; export const updateDoc = async () => {};
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {}; export const query = (...a) => ({a});
  export const where = (...a) => ({a}); export const orderBy = (...a) => ({a});
  export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));

// UNE FAUSSE LANIÈRE, DE PROPORTIONS CONNUES. Cloudinary est injoignable depuis
// le bac à sable, et une image qui ne charge pas a une hauteur `auto` de zéro :
// impossible de vérifier qu'elle descend plus bas sans se déformer. On lui sert
// donc un rectangle de 100 × 400 — un rapport de 4 pour 1, facile à contrôler.
const RAPPORT_LANIERE = 4;
await p.route('**/IMG_2135*', r => r.fulfill({ contentType: 'image/svg+xml',
  headers: {'Access-Control-Allow-Origin':'*'},
  body: `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="400" viewBox="0 0 100 400"><rect width="100" height="400" fill="#6b4423"/></svg>` }));

await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

// Deux cartes réelles : l'une frappe au contact, l'autre porte un mod Distance.
// Le porteur tient un ARC : son arme donne de la portée à tout ce qu'il lance.
const preparer = () => p.evaluate((EFFETS) => {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.getElementById("fenetre-combat").style.display = "block";
  window.EFFETS_BDD_CACHE = EFFETS;
  window.jouerSonClic = () => {};
  window.estCombattantMort = () => false;
  window.estMonstre = (id) => String(id).startsWith("M");
  window.PLATEAU_VTT = { getCaseState: () => ({}), hexToPixel: (q, r) => ({ x: 300 + q * 60, y: 300 + r * 60 }),
                         pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {} };
  window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
  window.PERSOS_PARTIE = [
    { idPersonnage: "H1", camp: "Allié", prenom: "Cybile", PV_Max: 60, PV_Actuels: 60,
      Fatigue_Max: 110, fatigueActuelle: 110, Etats_Alteres: [], statut: "Vivant" },
    { idPersonnage: "M1", camp: "Ennemi", estMonstre: true, prenom: "Gnoll",
      PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }
  ];
  window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } };
  window.TOKEN_SELECTIONNE = "H1";
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
  window.COMBAT_INDEX_PERSO = 0;
  window.REGIME_CERVEAU = true;

  // L'ARC EN MAIN : c'est lui qui rendait tout « à distance ».
  window.bonusEquip = (perso, cle) => (cle === "portee" ? 1 : 0);

  const carte = (nom, fatigue, actions) => ({
    Nom: nom, Arme: "Arme légère Distance", Fatigue: fatigue, Initiative: 20,
    Effets_Compiles: [], Composants: { actions }
  });
  window.COMPETENCES_CACHE = {
    C_CAC: carte("Coup de roc", 25, [
      { baseEffetId: "EFF_ATTAQUE_LOURDE", count: 1, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }
    ]),
    C_TIR: carte("Trait perçant", 30, [
      { baseEffetId: "EFF_ATTAQUE_LEGERE", count: 1,
        mods: { EFF_DISTANCE: 2 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }
    ])
  };
  window.CACHE_COMPETENCES_GLOBAL = { H1: window.COMPETENCES_CACHE };
  window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1,
    File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C_CAC", initiative: 20 }] };
  window.CHEMIN_MOUVEMENT = [];
  window.ZONES_PERSISTANTES = {};

  // Les identifiants réels des effets, retrouvés par leur nom.
  const parNom = {};
  Object.entries(EFFETS).forEach(([id, e]) => { parNom[(e.Nom || "").toLowerCase()] = id; });
  return parNom;
}, EFFETS);



await preparer();
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));

// Un deck complet, et l'écran du jeu réellement visible : le volet se mesure.
const monde = () => p.evaluate(() => {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById("fenetre-combat").style.display = "block";

  const noms = ["Dague cachée", "Tir précis", "Pluie de flèches"];
  const deck = {};
  noms.forEach((n, i) => {
    deck["K" + i] = JSON.parse(JSON.stringify(window.COMPETENCES_CACHE.C_CAC));
    deck["K" + i].Nom = n; deck["K" + i].Initiative = 70 - i * 10; deck["K" + i].Fatigue = 10;
  });
  window.PERSOS_PARTIE[0].deckEquipe = noms.map((_, i) => "K" + i);
  window.CACHE_COMPETENCES_GLOBAL = { H1: deck };
  Object.assign(window.COMPETENCES_CACHE, deck);
  window.COMBAT_FATIGUE_ACTUELLE = 110;
  window.MOUVEMENT_COUT_TOTAL = 0;
  window.PARTIE_DATA = { Phase_Combat: "Preparation", Tour_Combat: 1,
                         Ordre_Initiative: ["H1", "M1"], File_Attente_Combat: [] };
  window.APPELS = [];
  window.regimeDemande = { actif: () => true, enVol: () => false,
    carte: async () => {}, finDeTour: async () => {}, mouvement: async () => {} };
  window.chargerCompetencesCombat("H1", "#2d4a1c");
});

const lire = () => p.evaluate(() => {
  const volet = document.getElementById("volet-contenu");
  const bannieres = document.getElementById("volet-bannieres");
  const liste = document.getElementById("combat-liste-competences");
  const prem = liste ? liste.querySelector(".banniere-carte-combat") : null;
  const r = prem ? prem.getBoundingClientRect() : null;
  return {
    ouvert: window.VOLET_COMPETENCES_OUVERT,
    dansLeVolet: !!(liste && liste.closest("#volet-bannieres")),
    panneauExiste: !!document.getElementById("panneau-combat-gauche"),
    classes: volet ? volet.className : null,
    clics: bannieres ? getComputedStyle(bannieres).pointerEvents : null,
    premiere: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) } : null,
    nbBannieres: liste ? liste.querySelectorAll(".banniere-carte-combat").length : 0,
    repos: !!document.getElementById("combat-carte-REPOS_LONG"),
    apercu: window.CARTE_APERCU,
    mode: window.MODE_BOUTON_FINTOUR
  };
});

const cliquerBouton = async () => {
  await p.evaluate(() => document.getElementById("btn-hud-competences").click());
  await p.waitForTimeout(800);
};

await monde();

console.log("\n=========================================================");
console.log("  1. AU DÉPART : REPLIÉ, ET IL N'INTERCEPTE RIEN");
console.log("=========================================================");
{
  const v = await lire();
  verifier("le volet est fermé", v.ouvert === false, String(v.ouvert));
  verifier("LA LISTE A DÉMÉNAGÉ dans le volet", v.dansLeVolet === true);
  // LE PANNEAU LATÉRAL GAUCHE A ÉTÉ SUPPRIMÉ DE LA PAGE. Demander si la liste
  // en est sortie ne veut plus rien dire : on demande s'il existe encore.
  verifier("et le panneau latéral gauche n'existe plus dans la page",
           v.panneauExiste === false);
  verifier("replié, il ne prend aucun clic", v.clics === "none", String(v.clics));
  verifier("les trois techniques sont là", v.nbBannieres === 4, `(${v.nbBannieres} avec le repos long)`);
  verifier("le repos long a sa bannière", v.repos === true);
}

console.log("\n=========================================================");
console.log("  2. LE BOUTON L'OUVRE, ET LES BANNIÈRES NE BOUGENT PAS");
console.log("=========================================================");
{
  await cliquerBouton();
  const v = await lire();
  verifier("le volet est ouvert", v.ouvert === true);
  verifier("il joue l'animation de descente", (v.classes || "").includes("volet-ouvre"), String(v.classes));
  verifier("il reprend les clics", v.clics === "auto", String(v.clics));
  verifier("LA PREMIÈRE BANNIÈRE EST À SA PLACE D'ORIGINE (x = 20)",
           !!v.premiere && v.premiere.x === 20, JSON.stringify(v.premiere));
  verifier("et elle a gardé sa taille", !!v.premiere && Math.abs(v.premiere.w - 338) <= 2,
           JSON.stringify(v.premiere));
  verifier("elle est bien dans l'écran", !!v.premiere && v.premiere.y > 0 && v.premiere.y < 400,
           JSON.stringify(v.premiere));
}

console.log("\n=========================================================");
console.log("  3. CE QUI LE REFERME, ET CE QUI NE LE REFERME PAS");
console.log("=========================================================");
{
  // Un clic DANS le volet ne le referme pas : on y choisit ses cartes.
  await p.evaluate(() => document.getElementById("volet-bannieres").click());
  await p.waitForTimeout(400);
  verifier("un clic sur le volet lui-même ne le referme pas", (await lire()).ouvert === true);

  // Un clic sur la carte du monde, si.
  await p.evaluate(() => document.getElementById("conteneur-tokens-vtt").click());
  await p.waitForTimeout(700);
  let v = await lire();
  verifier("UN CLIC SUR LA CARTE LE REFERME", v.ouvert === false);
  verifier("et il joue l'animation de remontée", (v.classes || "").includes("volet-ferme"), String(v.classes));

  // Le bouton le rouvre, puis le referme.
  await cliquerBouton();
  verifier("le bouton le rouvre", (await lire()).ouvert === true);
  await cliquerBouton();
  verifier("et le referme", (await lire()).ouvert === false);
}

console.log("\n=========================================================");
console.log("  4. IL S'EFFACE DEVANT LE JEU");
console.log("=========================================================");
{
  await cliquerBouton();
  verifier("le volet est ouvert avant le ciblage", (await lire()).ouvert === true);
  await p.evaluate(async () => {
    window.PARTIE_DATA.Phase_Combat = "Resolution";
    window.PARTIE_DATA.File_Attente_Combat = [{ idPersonnage: "H1", idCarte: "K0", initiative: 70 }];
    await window.demarrerCiblage("K0", { idLanceur: "H1" });
  });
  await p.waitForTimeout(700);
  verifier("OUVRIR UN CIBLAGE LE RANGE TOUT SEUL", (await lire()).ouvert === false);

  await p.evaluate(() => { window.nettoyerCiblage(); });
  await cliquerBouton();
  verifier("rouvert", (await lire()).ouvert === true);
  await p.evaluate(() => {
    window.TOKEN_SELECTIONNE = "H1";
    window.CHEMIN_MOUVEMENT = [];
    if (typeof window.ajouterEtapeMouvement === "function") window.ajouterEtapeMouvement(1, 0);
  });
  await p.waitForTimeout(700);
  verifier("TRACER UN DÉPLACEMENT AUSSI", (await lire()).ouvert === false);
}

console.log("\n=========================================================");
console.log("  5. LE REPOS LONG SE CHOISIT COMME UNE CARTE");
console.log("=========================================================");
{
  await p.evaluate(() => {
    window.PARTIE_DATA.Phase_Combat = "Preparation";
    window.PARTIE_DATA.File_Attente_Combat = [];
    window.CHEMIN_MOUVEMENT = [];
    window.APPELS = [];
    window.jouerReposLong = async () => { window.APPELS.push("reposLong"); };
    window.choisirReposLongDansVolet();
  });
  await p.waitForTimeout(300);
  let v = await lire();
  verifier("il devient la carte retenue", !!v.apercu && v.apercu.idCarte === "REPOS_LONG",
           JSON.stringify(v.apercu));
  verifier("et il est choisissable", !!v.apercu && v.apercu.choisissable === true);
  verifier("le bouton fin de tour propose de le choisir", v.mode === "choisir_competence", v.mode);

  await p.evaluate(() => document.getElementById("btn-hud-fintour").click());
  await p.waitForTimeout(400);
  const appels = await p.evaluate(() => window.APPELS);
  verifier("LE BOUTON FIN DE TOUR LE LANCE", appels.includes("reposLong"), JSON.stringify(appels));
}

console.log("\n=========================================================");
console.log("  6. L'EFFET DE RESSORT EST BIEN DÉCLARÉ");
console.log("=========================================================");
{
  // On ne mesure pas une animation image par image : on vérifie que les deux
  // gestes existent, qu'ils portent un dépassement (le rebond) et que rien
  // n'anime `top` — seul `transform` se compose sans redessiner, et le volet
  // porte une pile de bannières avec leurs ombres.
  const regles = await p.evaluate(() => {
    const trouve = {};
    for (const feuille of document.styleSheets) {
      let regles; try { regles = feuille.cssRules; } catch (e) { continue; }
      for (const r of regles || []) {
        if (r.type === CSSRule.KEYFRAMES_RULE && /volet/i.test(r.name)) {
          trouve[r.name] = [...r.cssRules].map(k => `${k.keyText} ${k.style.transform}`);
        }
      }
    }
    return trouve;
  });
  const descend = regles.voletDescend || [];
  const remonte = regles.voletRemonte || [];
  verifier("la descente est déclarée", descend.length >= 4, JSON.stringify(descend));
  verifier("elle dépasse puis revient (le ressort)",
           descend.some(k => /translateY\(2\.2%\)/.test(k)) && descend.some(k => /translateY\(-1\.4%\)/.test(k)),
           JSON.stringify(descend));
  verifier("la remontée plonge d'abord vers le bas",
           remonte.some(k => /translateY\(3\.2%\)/.test(k)), JSON.stringify(remonte));
  verifier("et finit hors écran", remonte.some(k => /translateY\(-115%\)/.test(k)), JSON.stringify(remonte));
}

console.log("\n=========================================================");
console.log("  7. LA CARTE EN GRAND NE PASSE PLUS SOUS LES BANNIÈRES");
console.log("=========================================================");
{
  // DEUX FAUTES SE CACHAIENT L'UNE DERRIÈRE L'AUTRE.
  //
  // La carte était accrochée au panneau latéral gauche : ce panneau est à
  // z-index 10, il ouvre son propre contexte d'empilement, et le z-index 100
  // écrit sur la carte ne pouvait donc RIEN dépasser au-dehors — le volet est à
  // 14, la carte passait dessous quoi qu'on fasse.
  //
  // Et une fois retenue, elle glissait à x = 20 px, c'est-à-dire pile sur les
  // bannières. Du temps du panneau c'était voulu (elle les recouvrait) ; avec le
  // volet, elle se retrouvait dessous, à moitié cachée.
  //
  // On contrôle donc les deux séparément : l'abscisse, et l'empilement. Pour
  // l'empilement, on pose volontairement la carte SUR les bannières le temps
  // d'une mesure et on demande au navigateur qui il voit en premier.
  await p.evaluate(() => { window.PARTIE_DATA.Phase_Combat = "Preparation"; window.PARTIE_DATA.File_Attente_Combat = []; });
  await p.evaluate(() => { const c = document.getElementById("apercu-carte-hd-competence"); if (c) c.dataset.locked = "false"; });
  await p.evaluate(() => window.toggleVoletCompetences(true));
  await p.waitForTimeout(800);
  verifier("le volet est ouvert pour la mesure", (await lire()).ouvert === true);

  const m = await p.evaluate(async () => {
    window.afficherApercuCarteHD("K0", false);
    await new Promise(r => setTimeout(r, 700));
    const carte = document.getElementById("apercu-carte-hd-competence");
    const ban = document.querySelector("#combat-liste-competences .banniere-carte-combat");
    const rc = carte.getBoundingClientRect();
    const rb = ban.getBoundingClientRect();

    // L'ÉPREUVE D'EMPILEMENT : la carte vient volontairement se poser sur les
    // bannières, sans transition, le temps d'une question au navigateur.
    const garde = carte.style.left, gardeT = carte.style.transition;
    carte.style.transition = "none";
    carte.style.left = Math.round(rb.x + 10) + "px";
    void carte.offsetWidth;
    const r2 = carte.getBoundingClientRect();
    const vu = document.elementFromPoint(Math.round(r2.x + 30), Math.round(r2.y + 40));
    carte.style.left = garde; carte.style.transition = gardeT;

    return {
      parent: carte.parentNode ? carte.parentNode.id : null,
      carteX: Math.round(rc.x),
      banDroite: Math.round(rb.right),
      dessus: !vu ? "rien"
            : vu.closest("#apercu-carte-hd-competence") ? "carte"
            : vu.closest("#volet-competences") ? "volet"
            : (vu.id || vu.tagName)
    };
  });

  verifier("elle est accrochée à la fenêtre de combat", m.parent === "fenetre-combat", String(m.parent));
  verifier("ELLE SE POSE À DROITE DES BANNIÈRES",
           m.carteX >= m.banDroite, `carte x=${m.carteX}, bannières jusqu'à ${m.banDroite}`);
  verifier("ET QUAND ELLES SE CROISENT, C'EST ELLE QU'ON VOIT",
           m.dessus === "carte", m.dessus);

  const verrouillee = await p.evaluate(async () => {
    window.afficherApercuCarteHD("K0", true);
    await new Promise(r => setTimeout(r, 700));
    return Math.round(document.getElementById("apercu-carte-hd-competence").getBoundingClientRect().x);
  });
  verifier("retenue, elle ne repart pas sur les bannières",
           verrouillee >= m.banDroite, `x=${verrouillee}`);
}

console.log("\n=========================================================");
console.log("  8. RETENIR UNE CARTE RANGE LE VOLET EN ENTIER");
console.log("=========================================================");
{
  // LE SYMPTÔME : on choisissait sa carte, les bannières s'évaporaient, et la
  // lanière de cuir restait pendue au plafond avec rien au bout. On ne faisait
  // que passer le deck à l'opacité zéro — un geste hérité du panneau latéral,
  // où il n'y avait pas de lanière à ranger.
  //
  // On éprouve le chemin du RAFRAÎCHISSEMENT (actualiserEtatCarteCombat), celui
  // qui repasse à chaque tick et qui rattrape aussi les autres postes : c'est
  // lui qui laissait la lanière en place, tick après tick.
  await p.evaluate(() => { const c = document.getElementById("apercu-carte-hd-competence"); if (c) c.dataset.locked = "false"; });
  await p.evaluate(() => window.masquerApercuCarteHD(true));
  await p.evaluate(() => window.toggleVoletCompetences(true));
  await p.waitForTimeout(800);
  verifier("le volet est ouvert avant le choix", (await lire()).ouvert === true);

  await p.evaluate(() => {
    window.PARTIE_DATA.Phase_Combat = "Resolution";
    window.PARTIE_DATA.File_Attente_Combat = [{ idPersonnage: "H1", idCarte: "K0", initiative: 70 }];
    window.actualiserEtatCarteCombat("K0");
  });
  await p.waitForTimeout(900);

  const v = await lire();
  verifier("LE VOLET SE REFERME QUAND LA CARTE EST RETENUE", v.ouvert === false);
  verifier("et il part avec son animation de remontée",
           (v.classes || "").includes("volet-ferme"), String(v.classes));

  const apres = await p.evaluate(() => {
    const contenu = document.getElementById("volet-contenu");
    const deck = document.getElementById("combat-liste-competences");
    const carte = document.getElementById("apercu-carte-hd-competence");
    return {
      basDuVolet: Math.round(contenu.getBoundingClientRect().bottom),
      opacite: deck.style.opacity,
      clics: getComputedStyle(deck).pointerEvents,
      gris: deck.style.filter,
      carteVisible: !!carte && carte.style.display !== "none" && carte.style.opacity !== "0",
      carteVerrouillee: !!carte && carte.dataset.locked === "true"
    };
  });
  verifier("LA LANIÈRE DE CUIR EST REMONTÉE HORS CHAMP",
           apres.basDuVolet <= 0, `bas = ${apres.basDuVolet}px`);
  verifier("le deck est verrouillé, pas effacé", apres.opacite === "0.4", apres.opacite);
  verifier("il est grisé", (apres.gris || "").includes("grayscale"), apres.gris);
  verifier("et il ne répond plus au doigt", apres.clics === "none", apres.clics);

  // LA CARTE RETENUE S'EN VA ELLE AUSSI. Elle restait posée en grand au milieu
  // de l'écran jusqu'à la résolution, verrouillée pour qu'on ne puisse pas la
  // refermer : c'était la mémoire du choix, du temps où rien d'autre ne le
  // montrait. Le bouton de fin de tour et la piste le disent maintenant.
  verifier("LA CARTE EN GRAND DISPARAÎT UNE FOIS RETENUE", apres.carteVisible === false);
  verifier("et elle n'est plus verrouillée à l'écran", apres.carteVerrouillee === false);

  // Mais elle revient au moment de viser : RÉSOUDRE et ANNULER se posent sur
  // son aperçu, un ciblage lancé carte refermée n'aurait rien pour se résoudre.
  const auCiblage = await p.evaluate(async () => {
    window.afficherApercuCarteHD("K0", true);
    await new Promise(r => setTimeout(r, 700));
    const c = document.getElementById("apercu-carte-hd-competence");
    return { visible: c.style.display !== "none" && c.style.opacity === "1",
             x: Math.round(c.getBoundingClientRect().x) };
  });
  verifier("elle sait revenir pour le ciblage", auCiblage.visible === true, JSON.stringify(auCiblage));
  await p.evaluate(() => window.masquerApercuCarteHD(true));

  // Le chemin de l'échec rend tout au joueur : deck rallumé, volet redescendu.
  await p.evaluate(() => window.rouvrirDeckApresEchec());
  await p.waitForTimeout(800);
  const repli = await p.evaluate(() => {
    const deck = document.getElementById("combat-liste-competences");
    return { ouvert: window.VOLET_COMPETENCES_OUVERT, opacite: deck.style.opacity, gris: deck.style.filter };
  });
  verifier("en cas d'échec, le volet redescend", repli.ouvert === true);
  verifier("et le deck se rallume", repli.opacite === "1" && repli.gris === "none",
           `${repli.opacite} / ${repli.gris}`);
}

console.log("\n=========================================================");
console.log("  9. LA LANIÈRE EST DEUX FOIS PLUS GRANDE, ET INTACTE");
console.log("=========================================================");
{
  // Elle était trop courte : elle descendait à peine sous le bord de l'écran.
  // On double sa largeur — et SEULEMENT sa largeur, la hauteur restant `auto`,
  // pour que le navigateur garde les proportions de l'image. C'est la condition
  // posée : plus longue, mais pas étirée.
  //
  // Le `left` recule de la moitié du gain pour qu'elle grandisse autour de son
  // axe au lieu de dériver vers la droite.
  await p.evaluate(() => window.toggleVoletCompetences(true));
  await p.waitForTimeout(800);

  const l = await p.evaluate(async () => {
    const img = document.getElementById("volet-laniere");
    if (img && !img.complete) await img.decode().catch(() => {});
    const r = img.getBoundingClientRect();
    const bannieres = document.getElementById("volet-bannieres").getBoundingClientRect();
    return {
      largeur: Math.round(r.width), hauteur: Math.round(r.height),
      hautDeclare: img.style.top, hauteurDeclaree: img.style.height,
      centre: Math.round(r.x + r.width / 2),
      bas: Math.round(r.bottom),
      basDesBannieres: Math.round(bannieres.bottom),
      naturelle: img.naturalWidth + "x" + img.naturalHeight
    };
  });

  verifier("la hauteur reste libre (aucune déformation possible)",
           l.hauteurDeclaree === "auto" || l.hauteurDeclaree === "", `"${l.hauteurDeclaree}"`);
  verifier("elle fait bien le double des 86 px d'origine", l.largeur === 172, `${l.largeur}px`);
  verifier("ET SES PROPORTIONS SONT INTACTES",
           l.hauteur === l.largeur * RAPPORT_LANIERE,
           `${l.largeur}×${l.hauteur} pour une image ${l.naturelle}`);
  verifier("elle a grandi autour de son axe (centre inchangé à 165)",
           l.centre === 165, `centre = ${l.centre}`);
  verifier("son sommet est toujours mangé par le bord de l'écran",
           l.hautDeclare === "-40px", l.hautDeclare);
  verifier("ELLE DESCEND PLUS BAS QUE LES BANNIÈRES QU'ELLE PORTE",
           l.bas > l.basDesBannieres, `lanière jusqu'à ${l.bas}, bannières jusqu'à ${l.basDesBannieres}`);
}

verifier("aucune erreur JavaScript pendant tout le banc", erreurs.length === 0, erreurs.slice(0, 2).join(" | "));

await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
