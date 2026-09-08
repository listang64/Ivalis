// LE DÉPLACEMENT, HEXAGONE PAR HEXAGONE, DANS LE JOURNAL.
//
// Un trajet entier tenait autrefois dans UN seul événement, et c'était fragile
// de bout en bout : un poste qui le rejouait en retard partait d'une case qui
// n'était plus la bonne, une animation coupée en son milieu laissait le pion
// nulle part, et rien ne disait où il en était. En jeu, ça donnait des pions
// qui se téléportaient n'importe où et des ennemis qui marchaient pendant le
// tour d'un joueur.
//
// Chaque PAS est maintenant son propre numéro, avec sa case de départ ET sa
// case d'arrivée. Ce que ce banc garantit, sur le vrai code :
//   • valider un trajet publie un événement par hexagone, dans l'ordre, et les
//     cases s'enchaînent sans trou ;
//   • les pas partent AVANT que la case d'arrivée ne soit écrite sur le
//     plateau — personne ne peut voir le pion arrivé sans avoir de quoi l'y
//     amener à pied ;
//   • l'animation d'un pas est ABSOLUE : d'où qu'on la lance, elle finit sur
//     « vers », et la rejouer ne change rien ;
//   • le journal les rejoue un par un, sans jamais en chevaucher deux ;
//   • le pion reste sur sa case tant que ses pas ne sont pas rejoués ici.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';

const SRC_MOUVEMENT = fs.readFileSync('/home/user/Ivalis/mouvement.js', 'utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');
const SRC_SEQUENCE = fs.readFileSync('/home/user/Ivalis/sequence_tour.js', 'utf-8');
const lignesCombat = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8').split('\n');

function blocCombat(marqueur) {
  const d = lignesCombat.findIndex(l => l.startsWith(marqueur));
  let f = d; for (let i = d + 1; i < lignesCombat.length; i++) { if (lignesCombat[i] === '};') { f = i; break; } }
  return lignesCombat.slice(d, f + 1).join('\n');
}
const SRC_PROTECTION = blocCombat('window.redessinerPions = function')
                     + '\n' + blocCombat('window.positionsProtegees = function');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(200);
await p.evaluate(src => eval(src), SRC_STATS_COMMUNES);

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const res = await p.evaluate(async ({ srcMouvement, srcSequence, srcProtection }) => {
  document.getElementById("fenetre-combat").style.display = "block";
  localStorage.setItem("ID_JOUEUR_COURANT", "NICO");

  // Un plateau minimal : une case = 60 pixels, aucun obstacle.
  window.PLATEAU_VTT = {
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    hexToPixel: (q, r) => ({ x: q * 60, y: r * 60 }),
    renderMap: () => {}
  };
  window.afficherMessageFlottantHex = () => {};
  window.caseOccupeeParVivant = () => false;
  window.estCombattantMort = () => false;
  window.jouerSonClic = () => {};
  // La file d'animations du jeu : sérielle, comme la vraie.
  window.FILE = Promise.resolve();
  window.filerAnimation = (nom, fn) => {
    window.FILE = window.FILE.then(() => fn && fn()).catch(() => {});
    return window.FILE;
  };
  window.listerEnnemisAuContact = () => [];
  window.zonesPersistantesSurCase = () => [];
  window.ID_PARTIE_COURANTE = "P1";

  // Le pion, dans le vrai DOM : c'est lui qu'on regardera bouger.
  const conteneur = document.getElementById("conteneur-tokens-vtt")
                 || document.body.appendChild(Object.assign(document.createElement("div"),
                                                            { id: "conteneur-tokens-vtt" }));
  conteneur.innerHTML = `<div class="token-vtt" id="token-J1" data-q="0" data-r="0"
                              style="position:absolute"><img class="token-img-main"></div>`;
  window.positionnerTokenVTT = (div) => {
    const px = window.PLATEAU_VTT.hexToPixel(parseFloat(div.dataset.q), parseFloat(div.dataset.r));
    div.style.left = px.x + "px";
    div.style.top = px.y + "px";
  };
  window.appliquerTokensVTT = (map) => {
    Object.keys(map || {}).forEach(id => {
      const div = document.getElementById("token-" + id);
      if (!div) return;
      div.dataset.q = map[id].q; div.dataset.r = map[id].r;
      window.positionnerTokenVTT(div);
    });
  };

  // Le journal, en miniature — publication et écoute, comme app.js les expose.
  window.JOURNAL = {};
  window.COMPTEUR = 0;
  window.publierEvenementCombat = async (idPartie, ev) => {
    const n = ++window.COMPTEUR;
    window.JOURNAL[n] = { ...JSON.parse(JSON.stringify(ev)), n };
    window.ORDRE_ECRITURES = window.ORDRE_ECRITURES || [];
    window.ORDRE_ECRITURES.push("evenement:" + n + ":" + ev.type);
    return n;
  };
  window.lireEvenementCombat = async (idPartie, n) => window.JOURNAL[n] || null;
  window.dernierNumeroEvenement = () => 0;
  window.ecouterEvenementsCombat = (idPartie, apres, rappel) => { window.RAPPEL = rappel; return () => {}; };

  // La base, en miniature.
  window.modifierPartie = async (fn) => {
    const r = fn(window.PARTIE_DATA);
    if (r && r.maj) Object.assign(window.PARTIE_DATA, r.maj);
  };
  window.refCombattant = (id) => ({ id });
  window.enregistrerPionsVTT = async (...args) => {
    window.ORDRE_ECRITURES = window.ORDRE_ECRITURES || [];
    window.ORDRE_ECRITURES.push("case-arrivee");
    window.TOKENS_BASE = JSON.parse(JSON.stringify(window.TOKENS_VTT_DATA));
  };

  const etat = () => {
    window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 } };
    window.PERSOS_PARTIE = [{ idPersonnage: "J1", idJoueur: "NICO", camp: "Allié",
      PV_Max: 42, PV_Actuels: 42, Fatigue_Max: 100, fatigueActuelle: 100, Etats_Alteres: [] }];
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
    window.COMBAT_INDEX_PERSO = 0;
    window.TOKEN_SELECTIONNE = "J1";
    window.COMBAT_FATIGUE_ACTUELLE = 100;
    window.COUT_COMPETENCE_SELECTIONNEE = 0;
    window.PAS_PARCOURUS_TOUR = { id: null, tour: null, pas: 0 };
    window.PARTIE_DATA = { Tour_Combat: 1, Phase_Combat: "Resolution",
      File_Attente_Combat: [{ idPersonnage: "J1", idCarte: "C1" }] };
  };

  new Function('window', 'updateDoc', 'doc', 'db', 'getDoc', 'setDoc', srcMouvement)(
      window, async () => {}, () => ({}), {}, async () => ({}), async () => {});
  eval(srcProtection);
  new Function('window', 'localStorage', srcSequence)(window, localStorage);
  window.DELAI_ENTRE_ETAPES_MS = 1;

  // =====================================================================
  //  1. VALIDER UN TRAJET DE QUATRE CASES
  // =====================================================================
  etat();
  window.ORDRE_ECRITURES = [];
  window.CHEMIN_MOUVEMENT = [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }, { q: 3, r: 1 }];
  window.CHEMIN_START_NODE = { q: 0, r: 0 };
  window.MOUVEMENT_COUT_TOTAL = 8;
  await window.validerMouvement();

  const pas = Object.keys(window.JOURNAL).map(Number).sort((a, b) => a - b)
                    .map(n => window.JOURNAL[n]).filter(e => e.type === "pas");
  const publication = {
    nombre: pas.length,
    types: Object.values(window.JOURNAL).map(e => e.type),
    chaine: pas.map(e => `${e.data.de.q},${e.data.de.r}>${e.data.vers.q},${e.data.vers.r}`),
    ordreEcritures: [...window.ORDRE_ECRITURES]
  };

  // =====================================================================
  //  2. L'ANIMATION D'UN PAS EST ABSOLUE
  // =====================================================================
  const div = document.getElementById("token-J1");
  const posDiv = () => `${div.dataset.q},${div.dataset.r}`;

  // La base dit que le pion est sur 2,0 (le pas qu'on va rejouer l'y amène).
  window.TOKENS_VTT_DATA = { J1: { q: 2, r: 0 } };

  // On part exprès d'une case aberrante : le pas doit quand même finir au bon
  // endroit, sans quoi une relecture tardive laisserait le pion à la dérive.
  div.dataset.q = 9; div.dataset.r = 9;
  await window.jouerAnimationPas({ idToken: "J1", de: { q: 1, r: 0 }, vers: { q: 2, r: 0 } });
  const apresPasIsole = posDiv();

  // Et le rejouer ne change rien.
  await window.jouerAnimationPas({ idToken: "J1", de: { q: 1, r: 0 }, vers: { q: 2, r: 0 } });
  const apresRejeu = posDiv();
  const verrouLibere = window.ANIMATION_VTT_EN_COURS === false
                    && Object.keys(window.PIONS_EN_MOUVEMENT || {}).length === 0;

  // =====================================================================
  //  3. LE JOURNAL LES REJOUE UN PAR UN, SANS CHEVAUCHEMENT
  // =====================================================================
  etat();
  window.JOURNAL = {}; window.COMPTEUR = 0;
  window.DERNIER_EVENEMENT_JOUE = 0;
  window.EVENEMENTS_RECUS = {}; window.EVENEMENTS_DEJA_VUS = {};
  window.EVENEMENT_ATTENDU = null;

  // Ce poste REGARDE : c'est le héros d'un autre qui marche.
  window.PERSOS_PARTIE[0].idJoueur = "BEN";
  window.PARTIE_DATA.File_Attente_Combat = [{ idPersonnage: "J1", idCarte: "C1" }];

  const trace = [];
  let enCours = 0, chevauchements = 0;
  const vraiPas = window.jouerAnimationPas;
  window.jouerAnimationPas = async (d) => {
    if (enCours > 0) chevauchements++;
    enCours++;
    trace.push("debut " + d.vers.q + "," + d.vers.r);
    await vraiPas(d);
    trace.push("fin   " + d.vers.q + "," + d.vers.r);
    enCours--;
  };

  const chemin = [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }, { q: 3, r: 1 }];
  chemin.forEach((vers, i) => {
    const n = i + 1;
    window.EVENEMENTS_RECUS[n] = { n, type: "pas", acteur: "J1", tour: 1, avant: {},
      data: { idToken: "J1", de: (i === 0 ? { q: 0, r: 0 } : chemin[i - 1]), vers } };
  });

  // La base, elle, dit déjà que le pion est arrivé — c'est exactement la
  // situation qui le téléportait —, alors qu'à l'écran il est encore au départ.
  window.TOKENS_VTT_DATA = { J1: { q: 3, r: 1 } };
  div.dataset.q = 0; div.dataset.r = 0;
  window.positionnerTokenVTT(div);

  const retenuAvant = { ...window.PIONS_EN_ATTENTE_SEQUENCE };
  window.redessinerPions();
  const posApresRedessin = posDiv();

  await window.lireJournalCombat();
  const enPose = !!window.EVENEMENT_ATTENDU;
  if (window.EVENEMENT_ATTENDU) await window.jouerSequenceTour();
  for (let i = 0; i < 80 && window.evenementsEnAttente() > 0; i++) await new Promise(r => setTimeout(r, 25));
  await new Promise(r => setTimeout(r, 100));

  const retenuApres = { ...window.PIONS_EN_ATTENTE_SEQUENCE };
  window.jouerAnimationPas = vraiPas;

  return {
    publication, apresPasIsole, apresRejeu, verrouLibere,
    trace, chevauchements, enPose, posApresRedessin,
    posFinale: posDiv(),
    retenuAvant: Object.keys(retenuAvant),
    retenuApres: Object.keys(retenuApres)
  };
}, { srcMouvement: SRC_MOUVEMENT, srcSequence: SRC_SEQUENCE, srcProtection: SRC_PROTECTION });

await b.close();

console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");

console.log("\n1. VALIDER UN TRAJET : UN HEXAGONE, UN NUMÉRO");
verifier("quatre cases parcourues, quatre événements", res.publication.nombre === 4,
         `(${res.publication.nombre} — types : ${res.publication.types.join(",")})`);
verifier("les cases s'enchaînent sans trou, du départ à l'arrivée",
         res.publication.chaine.join(" | ") === "0,0>1,0 | 1,0>2,0 | 2,0>3,0 | 3,0>3,1",
         `(${res.publication.chaine.join(" | ")})`);
verifier("les pas partent AVANT que la case d'arrivée soit écrite",
         res.publication.ordreEcritures.indexOf("case-arrivee")
         === res.publication.ordreEcritures.length - 1,
         `(${res.publication.ordreEcritures.join(" > ")})`);

console.log("\n2. L'ANIMATION D'UN PAS EST ABSOLUE");
verifier("lancé depuis une case aberrante, il finit quand même sur « vers »",
         res.apresPasIsole === "2,0", `(${res.apresPasIsole})`);
verifier("le rejouer ne change rien", res.apresRejeu === "2,0", `(${res.apresRejeu})`);
verifier("et les verrous du plateau se rouvrent à la fin", res.verrouLibere);

console.log("\n3. LE JOURNAL REJOUE LES PAS UN PAR UN");
verifier("le tour s'ouvre par un OK, comme les autres", res.enPose === true);
verifier("le pion est retenu tant que ses pas ne sont pas rejoués",
         res.retenuAvant.includes("J1"), `(${res.retenuAvant.join(",")})`);
verifier("un redessin ne le téléporte donc pas à l'arrivée",
         res.posApresRedessin === "0,0", `(${res.posApresRedessin})`);
verifier("les quatre pas se jouent dans l'ordre",
         res.trace.filter(l => l.startsWith("debut")).join(" ")
         === "debut 1,0 debut 2,0 debut 3,0 debut 3,1", `(${res.trace.join(" | ")})`);
verifier("et jamais deux à la fois : chacun attend la fin du précédent",
         res.chevauchements === 0 && res.trace.join("|").indexOf("debut 2,0") > res.trace.join("|").indexOf("fin   1,0"),
         `(${res.chevauchements} chevauchement(s))`);
verifier("le pion finit exactement là où la base le dit", res.posFinale === "3,1",
         `(${res.posFinale})`);
verifier("et plus rien ne le retient une fois le journal à jour",
         res.retenuApres.length === 0, `(${res.retenuApres.join(",")})`);

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
