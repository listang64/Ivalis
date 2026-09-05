// UN COMBAT ENTIER, JOUÉ SUR TROIS APPAREILS.
// Trois postes (deux iPad et un PC) partagent une seule partie. Chacun fait
// tourner le VRAI code du jeu — file d'attente, moteur d'effets, IA des
// créatures — devant un Firestore partagé qui reproduit ce que le vrai service
// garantit : transactions sérialisées, écritures ordinaires qui ne le sont pas,
// notifications retardées et différentes d'un poste à l'autre.
//
// Ce que le banc cherche : une divergence entre écrans. Après chaque tour, les
// trois postes doivent raconter exactement le même combat — mêmes points de
// vie, mêmes états, même file d'attente, mêmes positions.
import fs from 'fs';
import { creerMonde, extraire, extraireRepartiteur } from './monde_reseau.mjs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { creerPlateau, EFFETS } from './banc_ia.mjs';

const SRC_MOTEUR = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');
const SRC_SEQUENCE = fs.readFileSync('/home/user/Ivalis/sequence_tour.js', 'utf-8');
const SRC_IA = fs.readFileSync('/home/user/Ivalis/monstres_ia.js', 'utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '')
  .replace(/await pause\(\d+\);/g, 'await pause(1);');
const SRC_COMBAT = ['window.enregistrerPionsVTT = async function',
                    'window.modifierPartie = async function',
                    // Le verdict « tout le monde a-t-il joué ? », partagé par
                    // tous les postes : sans lui, aucune carte n'entre en file.
                    'window.combattantsAttendus = function',
                    'window.toutLeMondeAJoue = function',
                    'window.avecCarteJouee = function',
                    'window.synchroniserCombattantsHorsJeu = async function',
                    'window.jouerCarteCombat = async function',
                    'window.jouerReposLong = async function',
                    'window.finDeTourCombat = async function',
                    'window.validerCarteCombat = async function',
                    'window.deduireFatigueCarte = async function',
                    'window.estCombattantMort = function']
  .map(m => extraire('combat.js', m)).join('\n\n');
const SRC_CONVERSION = extraire('app.js', 'function persoDocVersFront(id, d) {', '}');
const SRC_RECOMPOSE  = extraire('monstres.js', 'window.recomposerCombattants = function');
// La file d'animations et son plafond vivent juste avant la fonction : il faut
// tout le bloc, sinon FILE_ANIMATIONS n'existe pas.
const SRC_FILE_ANIM  = ['window.FILE_ANIMATIONS = Promise.resolve();',
                        'window.DELAI_MAX_ANIMATION_MS = 20000;',
                        extraire('app.js', 'window.filerAnimation = function')].join('\n');
const SRC_REPARTITEUR = extraireRepartiteur();

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const pause = (ms) => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------------
//  LA PARTIE : trois héros, deux créatures
// ------------------------------------------------------------------
const carteHeros = (nom, init, degats) => ({
  Nom: nom, Fatigue: 20, Initiative: init, Effets_Compiles: [],
  Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_LEGERE", count: degats,
                            mods: { EFF_DISTANCE: 3 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }] }
});
const carteMonstre = (nom, init) => ({
  Nom: nom, Fatigue: 25, Initiative: init, Effets_Compiles: [],
  Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_LEGERE", count: 4,
                            mods: { EFF_DISTANCE: 3 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }] }
});
// Une carte qui pose un état : c'est la traversée du réseau par les altérations
// qu'on veut voir ici, en plus des points de vie.
const carteEtat = (nom, init) => ({
  Nom: nom, Fatigue: 30, Initiative: init, Effets_Compiles: [],
  Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_LEGERE", count: 2,
                            mods: { EFF_DISTANCE: 3, EFF_BRULE: 8 },
                            zoneHexes: [], baseDuree: 0, modsDuree: {} }] }
});

// Les deux camps sont déjà au contact : on veut un combat qui frappe dès le
// premier round, pas trois rounds passés à se rapprocher.
const HEROS = [
  { id: "J1", prenom: "Pliors", joueur: "P1", q: -2, r: -1 },
  { id: "J2", prenom: "Jade",   joueur: "P2", q: -2, r: 0 },
  { id: "J3", prenom: "Mémé",   joueur: "P3", q: -2, r: 1 }
];
const CREATURES = [
  { id: "M1", prenom: "Gnoll", q: 1, r: -1 },
  { id: "M2", prenom: "Goule", q: 1, r: 1 }
];

function documentsDeDepart() {
  const docs = {};
  const tokens = {};
  HEROS.forEach(h => {
    docs["Personnages/" + h.id] = {
      ID_Partie: "P1", ID_Joueur: h.joueur, Camp: "Allié", Prenom_Personnage: h.prenom,
      Statut: "Vivant", PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, Fatigue_Actuelle: 100,
      // Esquive à zéro : on veut que les coups des créatures PORTENT, pour
      // vérifier que les trois postes s'accordent sur les dégâts subis. Un
      // combat où tout le monde esquive ne prouverait rien de ce côté.
      Regeneration: 20, Esquive: 0, Parade: 0, Critique: 10, Def_Physique: 0, Def_Magique: 0,
      Etats_Alteres: [], Deck_Equipe: ["CH1", "CH2"], Race: "Humain"
    };
    tokens[h.id] = { q: h.q, r: h.r, taille: 55 };
  });
  CREATURES.forEach(m => {
    docs["Monstres/" + m.id] = {
      ID_Partie: "P1", Camp: "Ennemi", Prenom_Personnage: m.prenom, Statut: "Vivant",
      PV_Max: 70, PV_Actuels: 70, Fatigue_Max: 120, Fatigue_Actuelle: 120, Repos_Long: 40,
      Regeneration: 20, Esquive: 10, Parade: 0, Critique: 5, Def_Physique: 0, Def_Magique: 0,
      Etats_Alteres: [], Deck_Equipe: ["CM1"], Personnalite: "brutal"
    };
    tokens[m.id] = { q: m.q, r: m.r, taille: 55 };
  });
  docs["Systeme_Parties/P1"] = {
    Phase_Combat: "Preparation", Tour_Combat: 1, File_Attente_Combat: [],
    Ordre_Initiative: [...HEROS.map(h => h.id), ...CREATURES.map(m => m.id)],
    Index_Initiative: 0
  };
  docs["Combat_VTT/P1"] = { Tokens: tokens };
  return docs;
}

const COMPETENCES = {
  J1: { CH1: carteHeros("Trait vif", 90, 3), CH2: carteEtat("Trait vicieux", 60) },
  J2: { CH1: carteHeros("Trait vif", 85, 3), CH2: carteHeros("Salve", 55, 4) },
  J3: { CH1: carteHeros("Trait vif", 80, 3), CH2: carteHeros("Salve", 50, 4) },
  M1: { CM1: carteEtat("Morsure infectée", 70) },
  M2: { CM1: carteMonstre("Griffes", 65) }
};

// ------------------------------------------------------------------
//  UN POSTE
// ------------------------------------------------------------------
function creerPoste(nom, monde, mesPersos) {
  const w = {};
  const api = monde.apiPour(nom);
  const db = {};
  const journal = [];

  const activer = () => {
    global.window = w;
    global.localStorage = { getItem: (c) => c === "ID_JOUEUR_COURANT" ? mesPersos.joueur : null,
                            setItem: () => {} };
    global.document = {
      getElementById: (id) => id === "fenetre-combat" ? { style: { display: "block" } } : coquille(),
      querySelectorAll: () => [], querySelector: () => null,
      addEventListener: () => {}, removeEventListener: () => {},
      createElement: () => coquille(), body: coquille()
    };
    return w;
  };
  const coquille = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
                            appendChild() {}, remove() {}, addEventListener() {},
                            querySelector: () => null, querySelectorAll: () => [],
                            getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
                            innerHTML: "", innerText: "", value: "" });
  activer();

  w.NOM_POSTE = nom;
  w.ID_PARTIE_COURANTE = "P1";
  w.SOURCE_COMBATTANTS = {};
  w.PLATEAU_VTT = Object.assign(creerPlateau(), {
    hexToPixel: (q, r) => ({ x: q * 50, y: r * 50 }),
    pixelToHex: (x, y) => ({ q: Math.round(x / 50), r: Math.round(y / 50) }),
    getHexesInRadius: (q, r, rayon) => {
      const out = [];
      for (let dq = -rayon; dq <= rayon; dq++)
        for (let dr = -rayon; dr <= rayon; dr++)
          if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(-dq - dr)) <= rayon) out.push({ q: q + dq, r: r + dr });
      return out;
    },
    renderMap: () => {}
  });
  w.TOKENS_VTT_DATA = {};
  w.PERSOS_JOUEURS_PARTIE = []; w.MONSTRES_PARTIE = []; w.PERSOS_PARTIE = [];
  w.CACHE_COMPETENCES_GLOBAL = structuredClone(COMPETENCES);
  w.COMPETENCES_CACHE = {};
  w.EFFETS_BDD_CACHE = EFFETS;
  w.ZONES_PERSISTANTES = {};
  w.COMBAT_PERSOS_JOUEUR = []; w.COMBAT_INDEX_PERSO = 0; w.COMBAT_PERSOS_JOUEUR_BACKUP = null;
  w.PARTIE_DATA = {};
  w.RESOLUTIONS_LOCALES = [];
  w.VTT_POS_X = 0; w.VTT_POS_Y = 0; w.VTT_SCALE = 1;
  w.PEUT_PASSER_TOUR = true;
  w.CHEMIN_MOUVEMENT = []; w.CHEMIN_START_NODE = null;

  w.refCombattant = (id) => api.doc(db, w.SOURCE_COMBATTANTS[id] === "Monstres" ? "Monstres" : "Personnages", id);
  w.estMonstre = (id) => w.SOURCE_COMBATTANTS[id] === "Monstres";

  // Affichage : rien à dessiner ici, mais on note ce qui serait montré.
  w.jouerSonClic = () => {};
  w.afficherMessageFlottantHex = (q, r, t) => journal.push({ tour: w.PARTIE_DATA.Tour_Combat, msg: t });
  w.afficherFlashDegatToken = () => {};
  w.appliquerTokensVTT = () => {};
  w.afficherPisteInitiative = () => {};
  w.actualiserBoutonFinTour = () => {};
  w.actualiserEtatCarteCombat = () => {};
  w.afficherPersoCombatActuel = () => {};
  w.mettreAJourJaugePV = () => {}; w.mettreAJourJaugeFatigue = () => {};
  w.afficherApercuCarteHD = () => {}; w.masquerApercuCarteHD = () => {};
  w.actualiserBannieresEpuisees = () => {}; w.ajusterTitresBannieres = () => {};
  w.rafraichirVoileTour = () => {}; w.surlignerEffetCarteActif = () => {};
  w.retirerAssombrissement = () => {}; w.assombrirCasesJouables = () => {};
  w.dessinerAnneauxCiblage = () => {}; w.dessinerZoneAoE = () => {};
  w.actualiserVisuelCiblage = () => {}; w.centrerMapSurToken = () => {};
  w.afficherDansPanneauGauche = (id) => {
    const p = w.PERSOS_PARTIE.find(x => x.idPersonnage === id);
    if (!p) return;
    if (!w.COMBAT_PERSOS_JOUEUR_BACKUP) w.COMBAT_PERSOS_JOUEUR_BACKUP = [...w.COMBAT_PERSOS_JOUEUR];
    w.COMBAT_PERSOS_JOUEUR = [p]; w.COMBAT_INDEX_PERSO = 0;
  };
  w.restaurerPanneauGauche = () => {
    if (w.IA_MONSTRE_EN_COURS && w.IA_MONSTRE_ACTEUR) return;
    if (w.COMBAT_PERSOS_JOUEUR_BACKUP) {
      w.COMBAT_PERSOS_JOUEUR = [...w.COMBAT_PERSOS_JOUEUR_BACKUP];
      w.COMBAT_PERSOS_JOUEUR_BACKUP = null;
    }
  };
  w.addEventListener = () => {}; w.removeEventListener = () => {};
  w.caseOccupeeParVivant = (q, r) => Object.keys(w.TOKENS_VTT_DATA).some(id =>
    w.TOKENS_VTT_DATA[id].q === q && w.TOKENS_VTT_DATA[id].r === r && !w.estCombattantMort(id));

  // L'A* et la distance du jeu.
  const mv = fs.readFileSync('/home/user/Ivalis/mouvement.js', 'utf-8');
  const bloc = mv.slice(mv.indexOf('function hexDistance'), mv.indexOf('window.hexDistanceVTT'));
  const outils = eval(bloc + '; ({ hexDistance, calculerCheminAStar })');
  w.hexDistanceVTT = outils.hexDistance;
  w.calculerCheminVTT = outils.calculerCheminAStar;

  // Le déplacement d'une créature : le jeu écrit le pion et diffuse le trajet.
  w.annulerMouvement = () => { w.CHEMIN_MOUVEMENT = []; };
  w.ajouterEtapeMouvement = (q, r) => {
    const chemin = w.calculerCheminVTT(w.CHEMIN_START_NODE, { q, r });
    w.CHEMIN_MOUVEMENT = chemin.map(s => ({ q: s.q, r: s.r, cost: 2 }));
  };
  w.validerMouvement = async () => {
    const id = w.TOKEN_SELECTIONNE;
    const fin = w.CHEMIN_MOUVEMENT[w.CHEMIN_MOUVEMENT.length - 1];
    w.CHEMIN_MOUVEMENT = [];
    if (!id || !fin) return;
    const depart = { ...w.TOKENS_VTT_DATA[id] };
    w.TOKENS_VTT_DATA[id] = { ...depart, q: fin.q, r: fin.r };
    await w.enregistrerPionsVTT(id);
    await api.updateDoc(api.doc(db, "Systeme_Parties", "P1"), {
      Action_Mouvement: { idToken: id, path: [{ q: fin.q, r: fin.r }], opportunites: [], zones: [],
                          timestamp: Date.now() + Math.random() }
    });
  };
  w.jouerAnimationMouvement = async (action) => {
    // Le pion suit le trajet reçu : c'est ce que voient les autres postes.
    const tk = w.TOKENS_VTT_DATA[action.idToken];
    const arrivee = action.path[action.path.length - 1];
    if (tk && arrivee) {
      const bond = Math.max(Math.abs(tk.q - arrivee.q), Math.abs(tk.r - arrivee.r),
                            Math.abs((-tk.q - tk.r) - (-arrivee.q - arrivee.r)));
      journal.push({ tour: w.PARTIE_DATA.Tour_Combat, deplacement: action.idToken, bond });
      w.TOKENS_VTT_DATA[action.idToken] = { ...tk, q: arrivee.q, r: arrivee.r };
    }
    await pause(2);
  };
  w.jouerAnimationBond = async () => {}; w.jouerAnimationPoussee = async () => {};
  w.jouerAnimationPeur = async () => {};

  // Le code du jeu, chargé tel quel.
  new Function('window', SRC_STATS_COMMUNES)(w);
  new Function('window', SRC_FILE_ANIM)(w);
  new Function('window', SRC_CONVERSION + '\nwindow.persoDocVersFront = persoDocVersFront;')(w);
  new Function('window', SRC_RECOMPOSE)(w);
  new Function('window', 'db', 'doc', 'setDoc', 'onSnapshot', 'updateDoc', 'runTransaction', 'importerFirestore',
    SRC_COMBAT.replace(/await import\("[^"]*"\)/g, 'await importerFirestore()'))(
    w, db, api.doc, api.setDoc, api.onSnapshot, api.updateDoc, api.runTransaction, async () => api);
  new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField', SRC_MOTEUR)(
    w, db, api.doc, api.updateDoc, api.setDoc, api.deleteDoc, api.deleteField);
  new Function('window', 'db', 'doc', 'getDoc', 'updateDoc', 'runTransaction', SRC_IA)(
    w, db, api.doc, api.getDoc, api.updateDoc, api.runTransaction);
  // La séquence de tour : les deux barrières de synchronisation. Chaque poste a
  // son propre identifiant, celui-là même qui signe les Check.
  new Function('window', 'localStorage', SRC_SEQUENCE)(
    w, { getItem: (c) => (c === "ID_JOUEUR_COURANT" ? mesPersos.joueur : null) });

  // Les fonctions purement visuelles sont neutralisées APRÈS le chargement des
  // modules : chargés ensuite, ils écrasaient les bouchons posés avant eux, et
  // le banc se mettait à dessiner des anneaux dans un DOM qui n'existe pas.
  // Tout ce qui décide de quelque chose reste le vrai code.
  ["dessinerAnneauxCiblage", "dessinerZoneAoE", "actualiserVisuelCiblage",
   "assombrirCasesJouables", "retirerAssombrissement", "afficherFlashDegatToken",
   "construireHaloVTT", "positionnerTokenVTT"].forEach(nomFn => { w[nomFn] = () => {}; });

  // Trace du tour d'une créature : où s'arrête-t-il ?
  const tourReel = w.jouerTourMonstre;
  if (typeof tourReel === "function") {
    w.jouerTourMonstre = async function(idMonstre, idCarte) {
      journal.push({ tour: w.PARTIE_DATA.Tour_Combat, iaDebut: idMonstre + "/" + idCarte });
      const sortie = await tourReel.apply(this, arguments);
      journal.push({ tour: w.PARTIE_DATA.Tour_Combat, iaFin: idMonstre });
      return sortie;
    };
  }

  // Qui lance quoi : trace du combat, pour vérifier que les deux camps jouent.
  const resolutionReelle = w.declencherResolution;
  w.declencherResolution = async function() {
    const lanceur = (w.COMBAT_PERSOS_JOUEUR[w.COMBAT_INDEX_PERSO] || {}).idPersonnage;
    journal.push({ tour: w.PARTIE_DATA.Tour_Combat, lance: lanceur,
                   cibles: (w.ETAT_CIBLAGE && w.ETAT_CIBLAGE.attaques[0] || {}).cibles });
    return resolutionReelle.apply(this, arguments);
  };

  // Le répartiteur d'actions d'app.js, rejoué à chaque notification.
  let estPremierScanPartie = true;
  const repartir = new Function('window', 'dataPartie', 'estPremierScanPartie', 'jouerAnimationDesGlobal',
    SRC_REPARTITEUR + '\nreturn estPremierScanPartie;');

  // Les écouteurs : la partie, les combattants, le plateau.
  api.onSnapshot(api.doc(db, "Systeme_Parties", "P1"), (data) => {
    if (!data) return;
    activer();
    w.PARTIE_DATA = data;
    estPremierScanPartie = repartir(w, data, estPremierScanPartie, () => {});
    if (typeof w.suivreSequenceTour === "function") w.suivreSequenceTour(data);
    if (typeof w.verifierTourIAMonstres === "function") w.verifierTourIAMonstres();
  });
  api.onSnapshot(api.doc(db, "Combat_VTT", "P1"), (data) => {
    if (!data || !data.Tokens) return;
    activer();
    w.TOKENS_VTT_DATA = structuredClone(data.Tokens);
  });
  [...HEROS.map(h => ["Personnages", h.id]), ...CREATURES.map(m => ["Monstres", m.id])]
    .forEach(([col, id]) => {
      w.SOURCE_COMBATTANTS[id] = col;
      api.onSnapshot(api.doc(db, col, id), (data) => {
        if (!data) return;
        activer();
        const objet = w.persoDocVersFront(id, data);
        if (col === "Monstres") {
          objet.estMonstre = true;
          objet.Personnalite = data.Personnalite || "brutal";
          objet.Repos_Long = data.Repos_Long;
          objet.Nombre_Actions = 1;
          const i = w.MONSTRES_PARTIE.findIndex(x => x.idPersonnage === id);
          if (i >= 0) w.MONSTRES_PARTIE[i] = objet; else w.MONSTRES_PARTIE.push(objet);
        } else {
          const i = w.PERSOS_JOUEURS_PARTIE.findIndex(x => x.idPersonnage === id);
          if (i >= 0) w.PERSOS_JOUEURS_PARTIE[i] = objet; else w.PERSOS_JOUEURS_PARTIE.push(objet);
        }
        w.recomposerCombattants();
        // Le panneau gauche suit MES héros, comme sur la vraie page.
        if (!w.IA_MONSTRE_ACTEUR) {
          w.COMBAT_PERSOS_JOUEUR = w.PERSOS_PARTIE.filter(p => p.idJoueur === mesPersos.joueur);
          if (w.COMBAT_INDEX_PERSO >= w.COMBAT_PERSOS_JOUEUR.length) w.COMBAT_INDEX_PERSO = 0;
        }
      });
    });

  return { nom, w, api, db, journal, activer, mesPersos };
}

// ------------------------------------------------------------------
//  LE DÉROULEMENT
// ------------------------------------------------------------------
const monde = creerMonde(documentsDeDepart());
const postes = [
  creerPoste("iPad-Nico", monde, { joueur: "P1", heros: "J1" }),
  creerPoste("iPad-Ben",  monde, { joueur: "P2", heros: "J2" }),
  creerPoste("PC-Adrien", monde, { joueur: "P3", heros: "J3" })
];
// LE GESTE DU JOUEUR : dès que le gros OK doré s'allume, chacun touche son
// écran. C'est lui qui déclenche le rejeu des animations mises de côté — et
// sans lui, plus rien n'avance : c'est précisément la garantie recherchée.
async function toucherLesEcrans() {
  let unSeulATouche = false;
  for (const poste of postes) {
    const etape = typeof poste.w.etatSequenceTour === "function" ? poste.w.etatSequenceTour() : null;
    if (etape && etape.okVisible) {
      poste.activer();
      await poste.w.jouerSequenceTour();
      unSeulATouche = true;
    }
  }
  return unSeulATouche;
}

const attendreBrut = monde.attendreLeReseau;
monde.attendreLeReseau = async (tours = 60, minimum = 0) => {
  for (let i = 0; i < 6; i++) {
    await attendreBrut(tours, minimum);
    if (!await toucherLesEcrans()) return;
  }
};
monde.attendreQue = async (predicat, msMax = 4000) => {
  const debut = Date.now();
  while (Date.now() - debut < msMax) {
    if (predicat(monde.docs)) return true;
    await toucherLesEcrans();
    await new Promise(r => setTimeout(r, 12));
  }
  return predicat(monde.docs);
};

await monde.attendreLeReseau();

// Un poste joue la carte de SON héros quand c'est son tour.
async function lancerLaCarteDe(poste, idHeros) {
  poste.activer();
  const w = poste.w;
  const perso = w.PERSOS_PARTIE.find(p => p.idPersonnage === idHeros);
  if (!perso) return false;
  w.COMBAT_PERSOS_JOUEUR = [perso]; w.COMBAT_INDEX_PERSO = 0;
  w.COMPETENCES_CACHE = { ...COMPETENCES[idHeros] };
  const idCarte = (w.PARTIE_DATA.File_Attente_Combat[0] || {}).idCarte;
  if (!idCarte || idCarte === "REPOS_LONG") return false;

  await w.demarrerCiblage(idCarte);
  if (!w.ETAT_CIBLAGE || !w.ETAT_CIBLAGE.actif) return false;
  // Il vise la créature la plus proche.
  const tk = w.TOKENS_VTT_DATA[idHeros];
  const cible = w.PERSOS_PARTIE
    .filter(p => p.camp === "Ennemi" && !w.estCombattantMort(p.idPersonnage))
    .sort((a, b) => w.hexDistanceVTT(tk, w.TOKENS_VTT_DATA[a.idPersonnage])
                  - w.hexDistanceVTT(tk, w.TOKENS_VTT_DATA[b.idPersonnage]))[0];
  if (!cible) return false;
  w.ajouterCibleCiblage(cible.idPersonnage);
  await w.declencherResolution();
  return true;
}

// Photographie de ce que chaque poste croit être la situation.
const photo = (poste) => {
  poste.activer();
  const w = poste.w;
  const combattants = {};
  [...HEROS, ...CREATURES].forEach(({ id }) => {
    const p = w.PERSOS_PARTIE.find(x => x.idPersonnage === id);
    combattants[id] = p
      ? `${p.PV_Actuels}/${w.pvMaxCombattant(p)} ${p.fatigueActuelle} [${(p.Etats_Alteres || []).map(e => e.nom + ":" + e.duree).sort().join(",")}]`
      : "absent";
    const tk = w.TOKENS_VTT_DATA[id];
    if (tk) combattants[id] += ` (${tk.q},${tk.r})`;
  });
  return {
    tour: w.PARTIE_DATA.Tour_Combat,
    phase: w.PARTIE_DATA.Phase_Combat,
    file: (w.PARTIE_DATA.File_Attente_Combat || []).map(f => f.idPersonnage + ":" + f.idCarte).join(" > "),
    combattants
  };
};

const comparerLesPostes = (etiquette) => {
  const photos = postes.map(photo);
  const differences = [];
  const cle = (ph) => JSON.stringify(ph);
  if (new Set(photos.map(cle)).size > 1) {
    Object.keys(photos[0].combattants).forEach(id => {
      const vues = photos.map(ph => ph.combattants[id]);
      if (new Set(vues).size > 1) differences.push(`${id} : ${vues.join("  ≠  ")}`);
    });
    ["tour", "phase", "file"].forEach(champ => {
      const vues = photos.map(ph => String(ph[champ]));
      if (new Set(vues).size > 1) differences.push(`${champ} : ${vues.join("  ≠  ")}`);
    });
  }
  verifier(`les trois postes voient la même chose — ${etiquette}`, differences.length === 0,
           differences.length ? "\n       " + differences.join("\n       ") : "");
  return photos[0];
};

console.log("1. LE COMBAT S'ENGAGE : TROIS JOUEURS CHOISISSENT EN MÊME TEMPS\n");

// Chaque joueur choisit sa carte sur SON appareil, au même instant.
await Promise.all(postes.map((poste, i) => {
  poste.activer();
  const w = poste.w;
  const idHeros = HEROS[i].id;
  const perso = w.PERSOS_PARTIE.find(p => p.idPersonnage === idHeros);
  w.COMBAT_PERSOS_JOUEUR = [perso]; w.COMBAT_INDEX_PERSO = 0;
  w.COMPETENCES_CACHE = { ...COMPETENCES[idHeros] };
  return w.jouerCarteCombat("CH1");
}));
await monde.attendreLeReseau();

let vue = comparerLesPostes("après le choix des cartes");
console.log(`     file : ${vue.file}`);
verifier("les trois héros sont dans la file", ["J1", "J2", "J3"].every(id => vue.file.includes(id)),
         `(${vue.file})`);

// L'IA pose les cartes des créatures, puis la résolution commence.
await monde.attendreLeReseau(120);
vue = comparerLesPostes("après les cartes des créatures");
console.log(`     file : ${vue.file}`);
verifier("les créatures ont aussi choisi", ["M1", "M2"].every(id => vue.file.includes(id)), `(${vue.file})`);
verifier("le combat est passé en résolution", vue.phase === "Resolution", `(${vue.phase})`);

console.log("\n2. TROIS ROUNDS COMPLETS, TOUR PAR TOUR\n");

let toursAvecEtat = 0;
let garde = 0;
for (let round = 1; round <= 3 && garde < 200; round++) {
  while ((monde.docs["Systeme_Parties/P1"].File_Attente_Combat || []).length > 0 && garde < 200) {
    garde++;
    const partie = monde.docs["Systeme_Parties/P1"];
    const tete = partie.File_Attente_Combat[0];
    if (!tete) break;

    // Le tour est fini quand la tête de file change : c'est le seul repère
    // fiable, la fin de tour du jeu étant temporisée.
    const teteAChange = () => {
      const f = monde.docs["Systeme_Parties/P1"].File_Attente_Combat || [];
      return f.length === 0 || f[0].idPersonnage !== tete.idPersonnage
          || f[0].timestamp !== tete.timestamp;
    };

    if (tete.idPersonnage.startsWith("M")) {
      // La créature joue seule : l'IA d'un des postes s'en charge.
      await monde.attendreQue(teteAChange, 8000);
      await monde.attendreLeReseau(80);
    } else {
      const poste = postes[HEROS.findIndex(h => h.id === tete.idPersonnage)];
      const lance = await lancerLaCarteDe(poste, tete.idPersonnage);
      if (lance) await monde.attendreQue(teteAChange, 8000);
      await monde.attendreLeReseau(80);
      if (!teteAChange()) {
        poste.activer();
        await poste.w.finDeTourCombat(true, tete.idPersonnage);
        await monde.attendreQue(teteAChange, 4000);
        await monde.attendreLeReseau(80);
      }
    }
    // On compare une fois le réseau VRAIMENT au calme. La file avance
    // maintenant dans la transaction de la barrière, tandis que le décompte des
    // états et la régénération suivent quelques instants plus tard : comparer
    // au changement de tête, c'était prendre les trois postes en plein milieu
    // d'une écriture, et se plaindre d'un désaccord qui n'existe déjà plus.
    await monde.attendreLeReseau(140, 400);
    comparerLesPostes(`après le tour de ${tete.idPersonnage} (round ${partie.Tour_Combat})`);
    if (postes[0].w.PERSOS_PARTIE.some(x => (x.Etats_Alteres || []).length > 0)) toursAvecEtat++;
  }

  // Fin de round : les joueurs rechoisissent, chacun sur son appareil.
  if (monde.docs["Systeme_Parties/P1"].Phase_Combat !== "Preparation") break;
  await Promise.all(postes.map((poste, i) => {
    poste.activer();
    const w = poste.w;
    const idHeros = HEROS[i].id;
    if (w.estCombattantMort(idHeros)) return Promise.resolve();
    const perso = w.PERSOS_PARTIE.find(p => p.idPersonnage === idHeros);
    w.COMBAT_PERSOS_JOUEUR = [perso]; w.COMBAT_INDEX_PERSO = 0;
    w.COMPETENCES_CACHE = { ...COMPETENCES[idHeros] };
    // Au deuxième round, un héros reprend son souffle : le repos long doit lui
    // aussi arriver identique sur les trois écrans.
    if (round === 2 && i === 2) return w.jouerReposLong();
    return w.jouerCarteCombat(round % 2 === 0 ? "CH2" : "CH1");
  }));
  await monde.attendreLeReseau(150);
}

console.log("\n3. DEUX POSTES DÉPLACENT UN PION EN MÊME TEMPS\n");
{
  // Le plateau garde tous les pions dans une seule carte. Le poste qui envoyait
  // la sienne en entier y remettait au passage la position périmée d'un pion
  // qu'un autre venait de bouger : le pion revenait en arrière.
  const avant = structuredClone(monde.docs["Combat_VTT/P1"].Tokens);

  // Le poste A bouge son héros. Le poste C, qui n'a pas encore reçu la nouvelle,
  // bouge le sien au même instant.
  postes[0].activer();
  postes[0].w.TOKENS_VTT_DATA.J1 = { ...avant.J1, q: avant.J1.q + 1 };
  const ecrireA = postes[0].w.enregistrerPionsVTT("J1");

  postes[2].activer();
  postes[2].w.TOKENS_VTT_DATA.J3 = { ...avant.J3, q: avant.J3.q + 1 };
  const ecrireC = postes[2].w.enregistrerPionsVTT("J3");

  await Promise.all([ecrireA, ecrireC]);
  await monde.attendreLeReseau(60);

  const apres = monde.docs["Combat_VTT/P1"].Tokens;
  console.log(`     J1 : (${avant.J1.q},${avant.J1.r}) → (${apres.J1.q},${apres.J1.r})`
            + `   J3 : (${avant.J3.q},${avant.J3.r}) → (${apres.J3.q},${apres.J3.r})`);
  verifier("deux déplacements simultanés tiennent tous les deux",
           apres.J1.q === avant.J1.q + 1 && apres.J3.q === avant.J3.q + 1,
           `(J1 en ${apres.J1.q}, J3 en ${apres.J3.q})`);
  verifier("et les autres pions n'ont pas bougé",
           apres.M1.q === avant.M1.q && apres.M2.q === avant.M2.q);

  // On remet tout en place pour la suite.
  postes[0].activer();
  await postes[0].w.enregistrerPionsVTT("J1");
  monde.docs["Combat_VTT/P1"].Tokens.J1 = avant.J1;
  monde.docs["Combat_VTT/P1"].Tokens.J3 = avant.J3;
}

console.log("\n4. CE QUE RACONTE LE COMBAT\n");
const finale = photo(postes[0]);
console.log(`     tour ${finale.tour}, phase ${finale.phase}`);
Object.keys(finale.combattants).forEach(id => console.log(`     ${id.padEnd(3)} ${finale.combattants[id]}`));

verifier("le combat a bien avancé de plusieurs rounds", finale.tour >= 3, `(tour ${finale.tour})`);
verifier("le combat ne s'est pas bloqué", garde < 200, `(${garde} tours joués)`);

// Ce que le combat a réellement produit, poste par poste : c'est la preuve que
// le banc joue un vrai combat et pas une suite de tours à vide.
const resume = {};
postes[0].journal.filter(e => e.msg).forEach(e => {
  const cle = /^-?\d/.test(e.msg) ? "coups portés"
            : /Esquiv|Paré/.test(e.msg) ? "esquives"
            : /portée/.test(e.msg) ? "hors de portée" : e.msg;
  resume[cle] = (resume[cle] || 0) + 1;
});
console.log("     ce qui s'est passé :", Object.keys(resume).map(k => `${k} ×${resume[k]}`).join(", ") || "rien");
const lances = postes.flatMap(p => p.journal.filter(e => e.lance));
const ia = postes.flatMap(p => p.journal.filter(e => e.iaDebut || e.iaFin));
console.log("     tours d'IA :", ia.map(e => e.iaDebut ? "▶" + e.iaDebut : "■" + e.iaFin).join(" ") || "aucun");
console.log("     cartes lancées :", lances.map(e => `${e.lance}→${(e.cibles || []).join("/") || "?"}`).join(", ") || "aucune");

verifier("les créatures ont vraiment attaqué",
         (resume["coups portés"] || 0) + (resume["esquives"] || 0) >= 4,
         `(${resume["coups portés"] || 0} coups, ${resume["esquives"] || 0} esquives)`);

// Personne ne doit se téléporter : une créature avance de trois cases au plus.
const bonds = postes.flatMap(p => p.journal.filter(e => e.deplacement).map(e => e.bond));
if (bonds.length) console.log(`     déplacements observés : ${bonds.join(", ")} cases`);
verifier("aucun combattant ne se téléporte", bonds.every(b => b <= 3),
         bonds.length ? `(le plus grand bond : ${Math.max(...bonds)} cases)` : "(aucun déplacement)");

// Les points de vie doivent avoir bougé : sinon le combat n'a rien fait.
const degatsSubis = [...HEROS, ...CREATURES].filter(({ id }) => {
  const p = postes[0].w.PERSOS_PARTIE.find(x => x.idPersonnage === id);
  const max = id.startsWith("M") ? 70 : 60;
  return p && p.PV_Actuels < max;
});
verifier("des coups ont porté", degatsSubis.length > 0, `(${degatsSubis.length} combattant(s) blessé(s))`);
// Les états doivent avoir circulé : la comparaison tour par tour ci-dessus les
// inclut, encore faut-il qu'il y en ait eu à comparer. Un état ne dure que deux
// tours, donc il n'en reste souvent aucun à la fin — c'est le compte des tours
// où un combattant en portait un qui fait foi.
console.log(`     tours comparés avec un état actif : ${toursAvecEtat}`);
verifier("des états ont circulé et été comparés entre postes", toursAvecEtat >= 2,
         `(${toursAvecEtat} tour(s))`);

// Le repos long : l'énergie rendue doit être la même partout, et supérieure.
const energiesJ3 = postes.map(p => { p.activer();
  return (p.w.PERSOS_PARTIE.find(x => x.idPersonnage === "J3") || {}).fatigueActuelle; });
console.log(`     énergie de Mémé après son souffle : ${energiesJ3.join(", ")}`);
verifier("le repos long donne la même énergie aux trois postes",
         new Set(energiesJ3).size === 1, `(${energiesJ3.join(" ≠ ")})`);

verifier("les héros aussi ont encaissé",
         HEROS.some(h => degatsSubis.some(d => d.id === h.id)),
         `(${degatsSubis.map(d => d.id).join(",")})`);

// La base et les trois mémoires doivent dire la même chose.
const ecarts = [];
[...HEROS.map(h => ["Personnages", h.id]), ...CREATURES.map(m => ["Monstres", m.id])].forEach(([col, id]) => {
  const enBase = monde.docs[col + "/" + id];
  postes.forEach(poste => {
    poste.activer();
    const enMemoire = poste.w.PERSOS_PARTIE.find(x => x.idPersonnage === id);
    if (!enMemoire) return;
    if (enMemoire.PV_Actuels !== enBase.PV_Actuels) {
      ecarts.push(`${id} chez ${poste.nom} : ${enMemoire.PV_Actuels} PV contre ${enBase.PV_Actuels} en base`);
    }
  });
});
verifier("la mémoire de chaque poste colle à la base", ecarts.length === 0,
         ecarts.length ? "\n       " + ecarts.join("\n       ") : "");

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
