// DEUX RÈGLES QUI S'ÉTAIENT DÉCROCHÉES DE LEUR SOURCE
//
// 1. LE COÛT EN ÉNERGIE D'UNE CARTE.
//    Il était lu dans window.COUT_COMPETENCE_SELECTIONNEE, une globale posée
//    par le clic sur la bannière d'une carte. Ça tenait tant que le ciblage
//    démarrait par « Appliquer », posé SUR la carte qu'on venait de cliquer :
//    les deux gestes se suivaient. Depuis que la carte part du bouton fin de
//    tour, en pleine résolution, il s'écoule toute une phase de préparation
//    entre les deux — et finDeTourCombat remet cette globale à zéro à chaque
//    tour clos. Le cerveau recevait donc « coutFatigue: 0 » : signalé en
//    partie, « mes attaques ne réduisent plus la jauge de fatigue ».
//
// 2. UNE CARTE QUI NE DISAIT PAS SA PORTÉE.
//    Une arme à distance — fronde, arc — donne une portée de base à CHAQUE
//    technique de son porteur : une carte écrite au corps à corps devient un
//    tir, atteint plus loin, et perd trente pour cent au contact. La règle est
//    juste (j'ai cru un instant l'inverse et je me suis trompé). Ce qui manquait
//    est ailleurs : la carte n'en disait pas un mot tant que le joueur n'avait
//    pas posé d'effet « Distance » dessus. On lisait « attaque lourde, 10 dégâts
//    physiques » sur une technique qui tirait à deux cases et encaissait le
//    malus. Signalé en partie : « la distance doit apparaître dans les
//    compétences même si le joueur n'en met aucune ».
//
// Les deux se vérifient sur le VRAI code : l'extraction de carte de
// moteur_effets.js dans un navigateur, et chaineDeDegats importée telle quelle.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { chaineDeDegats } from '../moteur_pur.js';

const EFFETS = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/effets_reels.json', 'utf-8'));

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

console.log("\n=========================================================");
console.log("  1. LE NOYAU : LE MALUS DE TIR À BOUT PORTANT");
console.log("=========================================================");
{
  const cible = { pv: 100, pvMax: 100, bouclier: 0, etats: [], def: {}, mod: {} };
  const nu = (a) => chaineDeDegats(cible, a, { distance: 1 }).degats;

  verifier("une attaque à distance perd 30 % au contact",
           nu({ valeurBrute: 10, isRanged: true }) === 7,
           `(${nu({ valeurBrute: 10, isRanged: true })})`);
  verifier("une attaque de contact n'en perd rien",
           nu({ valeurBrute: 10, isRanged: false }) === 10);
  verifier("et à distance, le tir ne perd rien",
           chaineDeDegats(cible, { valeurBrute: 10, isRanged: true },
                          { distance: 3 }).degats === 10);
}

// =========================================================================
//  LA VRAIE EXTRACTION DE CARTE, DANS UN NAVIGATEUR
// =========================================================================
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
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));

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

  // Les Effets_Compiles sont ce que la Forge a GRAVÉ sur la carte le jour où
  // elle a été créée : c'est ce texte-là que l'affichage réécrit.
  const carte = (nom, fatigue, actions, effetsCompiles, arme) => ({
    Nom: nom, Arme: arme || "Arme légère Distance", Fatigue: fatigue, Initiative: 20,
    Effets_Compiles: effetsCompiles || [], Composants: { actions }
  });
  window.COMPETENCES_CACHE = {
    C_CAC: carte("Coup de roc", 25, [
      { baseEffetId: "EFF_ATTAQUE_LOURDE", count: 1, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }
    ], [{ nom: "Attaque lourde", desc: "10 dégats physique", isMod: false }]),
    C_TIR: carte("Trait perçant", 30, [
      { baseEffetId: "EFF_ATTAQUE_LEGERE", count: 1,
        mods: { EFF_DISTANCE: 2 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }
    ], [{ nom: "Attaque légère", desc: "6 dégats physique", isMod: false },
        { nom: "Distance", desc: "3 hexagone", isMod: true }]),
    // LA TECHNIQUE QUI NE SE SERT PAS DE L'ARME PORTÉE : un coup de coude, une
    // dague de ceinture. Elle reste jouable quoi qu'on tienne — et elle n'a
    // donc rien à emprunter à l'arc.
    C_RP: carte("Coup de coude", 15, [
      { baseEffetId: "EFF_ATTAQUE_LOURDE", count: 1, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }
    ], [{ nom: "Attaque lourde", desc: "4 dégats physique", isMod: false }],
       "Sans arme / Arme rp")
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

const noms = await preparer();
const idAttaque = noms["attaque lourde"] || noms["attaque légère"] || noms["attaque legere"];
const idDistance = noms["distance"];

console.log("\n=========================================================");
console.log("  2. L'EXTRACTION RÉELLE, ARC EN MAIN");
console.log("=========================================================");

const extraire = (idCarte) => p.evaluate(async (idCarte) =>
  await window.demarrerCiblage(idCarte, { extraire: true, idLanceur: "H1" }), idCarte);

if (!idAttaque || !idDistance) {
  console.log("  (effets réels introuvables dans effets_reels.json — section passée)");
} else {
  await p.evaluate(({ idAttaque, idDistance }) => {
    window.COMPETENCES_CACHE.C_CAC.Composants.actions[0].baseEffetId = idAttaque;
    window.COMPETENCES_CACHE.C_RP.Composants.actions[0].baseEffetId = idAttaque;
    window.COMPETENCES_CACHE.C_TIR.Composants.actions[0].baseEffetId = idAttaque;
    window.COMPETENCES_CACHE.C_TIR.Composants.actions[0].mods = { [idDistance]: 2 };
  }, { idAttaque, idDistance });

  const cac = await extraire("C_CAC");
  const tir = await extraire("C_TIR");

  verifier("la carte de corps à corps porte bien une attaque",
           !!cac && (cac.attaques || []).length > 0, JSON.stringify((cac || {}).attaques || []).slice(0, 120));
  verifier("L'ARC LA REND TIRABLE : c'est la règle, et elle est juste",
           !!cac && cac.attaques[0].isRanged === true);
  verifier("sa portée dépasse donc la case voisine",
           !!cac && cac.attaques[0].rangeMax > 1, String(((cac||{}).attaques||[{}])[0].rangeMax));
  verifier("la carte à distance porte la sienne, plus longue",
           !!tir && tir.attaques[0].rangeMax > cac.attaques[0].rangeMax,
           `(${((tir||{}).attaques||[{}])[0].rangeMax} contre ${((cac||{}).attaques||[{}])[0].rangeMax})`);

  console.log("\n=========================================================");
  console.log("  2 bis. ET LA CARTE LE DIT, MÊME SANS EFFET « DISTANCE »");
  console.log("=========================================================");
  const lu = await p.evaluate(() => {
    const cac = window.porteeReelleCarte(window.COMPETENCES_CACHE.C_CAC, window.PERSOS_PARTIE[0]);
    const tir = window.porteeReelleCarte(window.COMPETENCES_CACHE.C_TIR, window.PERSOS_PARTIE[0]);
    // Sans arme en main, la même carte de contact ne porte plus rien.
    const vraiBonus = window.bonusEquip;
    window.bonusEquip = () => 0;
    const cacSansArme = window.porteeReelleCarte(window.COMPETENCES_CACHE.C_CAC, window.PERSOS_PARTIE[0]);
    window.bonusEquip = vraiBonus;

    // Et ce que la carte affiche vraiment à l'écran.
    window.afficherApercuCarteHD("C_CAC");
    const texte = (document.getElementById("apercu-carte-hd-competence") || {}).innerText || "";
    return { cac, tir, cacSansArme, texte };
  });

  verifier("le calcul partagé retrouve la portée donnée par l'arme",
           lu.cac.portee === cac.attaques[0].rangeMax,
           `(${lu.cac.portee} contre ${cac.attaques[0].rangeMax} au moteur)`);
  verifier("et il nomme ce que l'arme y apporte", lu.cac.apportArme === 1, String(lu.cac.apportArme));
  verifier("sans arme à distance, la carte de contact ne porte plus",
           lu.cacSansArme.portee === 1, String(lu.cacSansArme.portee));
  verifier("le même calcul vaut pour la carte à distance",
           lu.tir.portee === tir.attaques[0].rangeMax,
           `(${lu.tir.portee} contre ${tir.attaques[0].rangeMax})`);
  verifier("LA CARTE AFFICHE SA PORTÉE À L'ÉCRAN",
           /2\s*hexagone/i.test(lu.texte),
           lu.texte.replace(/\s+/g, " ").slice(0, 160));
  verifier("et elle dit d'où elle vient", /de l'arme/i.test(lu.texte));

  console.log("\n=========================================================");
  console.log("  2 ter. UNE SEULE LIGNE DE DISTANCE, ET C'EST LA VRAIE");
  console.log("=========================================================");
  // Nico : « j'ai pas envie que tu rajoutes une ligne en bleu pour dire la
  // distance totale, mais que tu modifies dynamiquement la ligne existante — et
  // s'il n'y en a pas, la rajouter dans le même format que s'il y en avait. »
  //
  // Avant, la carte affichait DEUX nombres pour une seule et même chose : sa
  // ligne « Distance : 3 hexagone », gravée par la Forge, et une ligne bleue
  // ajoutée au-dessus, « ◆ Portée : 4 cases ». Le joueur choisissait laquelle
  // croire.
  // CHANGER DE CARTE PREND 300 ms : la carte affichée s'efface d'abord, puis la
  // suivante se dessine. Lire tout de suite, c'est relire la précédente — et
  // croire que la carte à distance affiche le texte de celle du contact.
  const ecran = (idCarte) => p.evaluate(async (idCarte) => {
    window.afficherApercuCarteHD(idCarte);
    await new Promise(r => setTimeout(r, 450));
    const boite = document.getElementById("apercu-carte-hd-competence");
    const texte = (boite || {}).innerText || "";
    const titres = [...(boite || document).querySelectorAll(".titre-effet-hd")].map(t => ({
      texte: (t.innerText || "").trim(),
      couleur: getComputedStyle(t).color,
      taille: getComputedStyle(t).fontSize,
      graisse: getComputedStyle(t).fontWeight
    }));
    return {
      texte,
      titres,
      // Combien de fois la carte parle-t-elle de sa portée ?
      mentionsDistance: (texte.match(/hexagone/gi) || []).length
                      + (texte.match(/◆\s*Port[ée]e/gi) || []).length,
      ligneBleue: /◆/.test(texte) || /Port[ée]e\s*:/i.test(texte)
    };
  }, idCarte);

  const vueCac = await ecran("C_CAC");
  const vueTir = await ecran("C_TIR");
  const vueRp  = await ecran("C_RP");

  verifier("LA LIGNE BLEUE A DISPARU DE LA CARTE", vueCac.ligneBleue === false && vueTir.ligneBleue === false,
           vueTir.texte.replace(/\s+/g, " ").slice(0, 140));
  verifier("une carte sans effet Distance en gagne UNE, et une seule",
           vueCac.mentionsDistance === 1, `(${vueCac.mentionsDistance})`);
  verifier("elle annonce la portée que l'arme donne",
           /2\s*hexagone/.test(vueCac.texte) && /dont 1 de l'arme/.test(vueCac.texte),
           vueCac.texte.replace(/\s+/g, " ").slice(0, 140));

  // LE MÊME FORMAT QUE SI ELLE Y ÉTAIT : c'est la demande, mot pour mot. On ne
  // compare pas des styles écrits à la main de part et d'autre — les deux
  // lignes passent par la même fabrique, et on le vérifie au pixel près sur le
  // titre rendu.
  const titreAjoute = vueCac.titres.find(t => /Distance/.test(t.texte));
  const titreVrai   = vueCac.titres.find(t => !/Distance/.test(t.texte));
  verifier("elle porte la même puce que les vraies lignes",
           !!titreAjoute && titreAjoute.texte.startsWith("•"), titreAjoute ? titreAjoute.texte : "(absente)");
  verifier("ET EXACTEMENT LEUR FORMAT : couleur, taille, graisse",
           !!titreAjoute && !!titreVrai
           && titreAjoute.couleur === titreVrai.couleur
           && titreAjoute.taille === titreVrai.taille
           && titreAjoute.graisse === titreVrai.graisse,
           titreAjoute && titreVrai ? `${titreAjoute.couleur}/${titreAjoute.taille} contre ${titreVrai.couleur}/${titreVrai.taille}` : "");

  verifier("UNE CARTE QUI A DÉJÀ SA LIGNE N'EN GAGNE PAS UNE SECONDE",
           vueTir.mentionsDistance === 1, `(${vueTir.mentionsDistance})`);
  verifier("ET CETTE LIGNE-LÀ EST RÉÉCRITE AVEC LE TOTAL",
           /4\s*hexagone/.test(vueTir.texte) && !/3\s*hexagone/.test(vueTir.texte),
           vueTir.texte.replace(/\s+/g, " ").slice(0, 140));
  verifier("en disant ce que l'arme y ajoute", /dont 1 de l'arme/.test(vueTir.texte));

  console.log("\n=========================================================");
  console.log("  2 quater. L'ARC NE PRÊTE RIEN AUX TECHNIQUES SANS ARME");
  console.log("=========================================================");
  // Une technique « Sans arme / Arme rp » se joue à mains nues ou à la dague de
  // ceinture, quelle que soit l'arme équipée — c'est pour ça qu'elle reste
  // jouable quand les autres sont bloquées. Un coup de coude ne tire donc pas à
  // deux cases parce qu'un arc pend dans le dos.
  const rp = await extraire("C_RP");
  verifier("le coup de coude porte bien une attaque",
           !!rp && (rp.attaques || []).length > 0);
  verifier("IL RESTE AU CONTACT, ARC OU PAS",
           !!rp && rp.attaques[0].isRanged === false, String(((rp||{}).attaques||[{}])[0].isRanged));
  verifier("et sa portée reste d'une case",
           !!rp && rp.attaques[0].rangeMax === 1, String(((rp||{}).attaques||[{}])[0].rangeMax));

  const rpLu = await p.evaluate(() => window.porteeReelleCarte(window.COMPETENCES_CACHE.C_RP, window.PERSOS_PARTIE[0]));
  verifier("le calcul partagé dit la même chose",
           rpLu.portee === 1 && rpLu.apportArme === 0, `(portée ${rpLu.portee}, apport ${rpLu.apportArme})`);
  verifier("ET SA CARTE N'AFFICHE AUCUNE LIGNE DE DISTANCE",
           vueRp.mentionsDistance === 0, vueRp.texte.replace(/\s+/g, " ").slice(0, 140));

  console.log("\n=========================================================");
  console.log("  2 quinquies. L'ENCART DE TOUR DIT LE MÊME NOMBRE");
  console.log("=========================================================");
  // Deux écrans à un mètre l'un de l'autre qui annoncent deux portées
  // différentes, c'est pire que pas de portée du tout.
  const encart = await p.evaluate(() => {
    const perso = window.PERSOS_PARTIE[0];
    const lire = (id) => {
      const html = window.ligneEffetsCarte(window.COMPETENCES_CACHE[id], perso);
      const boite = document.createElement("div");
      boite.innerHTML = html;
      return (boite.innerText || boite.textContent || "").replace(/\s+/g, " ");
    };
    return { cac: lire("C_CAC"), tir: lire("C_TIR"), rp: lire("C_RP") };
  });
  verifier("la carte de contact y annonce ses 2 hexagones",
           /2 hexagone/.test(encart.cac), encart.cac.slice(0, 110));
  verifier("la carte à distance y annonce ses 4, pas ses 3",
           /4 hexagone/.test(encart.tir) && !/3 hexagone/.test(encart.tir), encart.tir.slice(0, 110));
  verifier("et la technique sans arme n'y parle pas de distance",
           !/hexagone/.test(encart.rp), encart.rp.slice(0, 110));

  console.log("\n=========================================================");
  console.log("  3. LA CARTE PORTE SON PROPRE COÛT EN ÉNERGIE");
  console.log("=========================================================");
  verifier("la carte de corps à corps annonce ses 25 d'énergie",
           !!cac && cac.coutFatigue === 25, String((cac || {}).coutFatigue));
  verifier("la carte à distance annonce ses 30",
           !!tir && tir.coutFatigue === 30, String((tir || {}).coutFatigue));

  // LE CAS QUI CASSAIT : la globale est à zéro (finDeTourCombat l'a remise à
  // zéro au tour précédent), et pourtant le cerveau doit recevoir le vrai coût.
  const envoye = await p.evaluate(async () => {
    window.COUT_COMPETENCE_SELECTIONNEE = 0;
    window.APPELS = [];
    window.regimeDemande = {
      actif: () => true, enVol: () => false,
      carte: async (acteur, charge) => { window.APPELS.push({ acteur, charge }); },
      finDeTour: async () => {}, mouvement: async () => {}
    };
    await window.demarrerCiblage("C_CAC");
    window.ETAT_CIBLAGE.attaques.forEach(a => { a.cibles = ["M1"]; });
    await window.declencherResolutionAvecBondEventuel("H1", "C_CAC");
    return window.APPELS;
  });
  verifier("une carte a bien été envoyée au cerveau", envoye.length === 1, JSON.stringify(envoye).slice(0, 150));
  verifier("AVEC SON COÛT, alors que la globale était à zéro",
           envoye.length === 1 && envoye[0].charge.coutFatigue === 25,
           String(envoye.length === 1 ? envoye[0].charge.coutFatigue : "—"));
}

verifier("aucune erreur JavaScript pendant tout le banc", erreurs.length === 0, erreurs.slice(0, 2).join(" | "));

await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
