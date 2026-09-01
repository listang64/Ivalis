// Simule un COMBAT ENTIER, tour après tour : joueurs et monstres alternent
// dans la file d'initiative jusqu'à la fin. Cherche avant tout les blocages :
// une phase qui ne bascule jamais, une file qui ne se vide pas, un monstre qui
// ne joue jamais.
import fs from 'fs';
import { chargerIA, creerPlateau, combattant, activer } from './banc_ia.mjs';

const carte = (nom, fat, portee, deg) => ({ Nom:nom, Fatigue:fat, Initiative:Math.max(0,100-fat),
  Composants:{ actions:[{ baseEffetId: portee>1?"EFF_ATTAQUE_LEGERE":"EFF_ATTAQUE_LOURDE", count:deg,
  mods: portee>1?{EFF_DISTANCE:portee-1}:{}, zoneHexes:[], baseDuree:0, modsDuree:{} }] } });

function deckPour(i) {
  return { [`c${i}1`]: carte("Coup léger", 18, 1, 2), [`c${i}2`]: carte("Trait", 30, 3, 3),
           [`c${i}3`]: carte("Charge", 45, 1, 5),     [`c${i}4`]: carte("Salve", 70, 4, 4),
           [`c${i}5`]: carte("Fracas", 90, 1, 7),     [`c${i}6`]: carte("Déluge", 110, 3, 8) };
}

function creerCombat({ nbJoueurs = 3, nbMonstres = 4 } = {}) {
  const tokens = {}, persos = [], competences = {};
  for (let i = 0; i < nbJoueurs; i++) {
    const id = `J${i}`; tokens[id] = { q: -4, r: i - 1 };
    persos.push(combattant({ idPersonnage:id, camp:'Allié', prenom:`Héros${i}`, PV_Max:60, PV_Actuels:60 }));
  }
  const roles = ["brutal","prudent","sanguinaire","tacticien","opportuniste"];
  for (let i = 0; i < nbMonstres; i++) {
    const id = `M${i}`; tokens[id] = { q: 4, r: i - 1 };
    competences[id] = deckPour(i);
    persos.push(combattant({ idPersonnage:id, estMonstre:true, camp:'Ennemi', prenom:`Bête${i}`,
      Personnalite: roles[i % roles.length], PV_Max:70, PV_Actuels:70,
      Fatigue_Max:120, fatigueActuelle:120, deckEquipe:Object.keys(competences[id]) }));
  }
  const partie = { Phase_Combat:"Preparation", Tour_Combat:1, File_Attente_Combat:[],
                   Ordre_Initiative: persos.map(p => p.idPersonnage) };
  const w = activer(chargerIA({ plateau: creerPlateau(), tokens, persos, competences, partie, zones:{} }));
  w.PERSOS_JOUEURS_PARTIE = persos.filter(p => !p.estMonstre);
  return { w, partie, tokens, persos, competences };
}

// Rejoue fidèlement la mécanique de file de finDeTourCombat() : on dépile,
// on rend la fatigue sur un repos long, et quand la file est vide on repart
// en préparation au tour suivant.
function installerMoteur(monde, journal) {
  const { w, partie, persos } = monde;
  w.afficherDansPanneauGauche = () => {};
  w.centrerMapSurToken = () => {};
  w.afficherMessageFlottantHex = (q,r,txt) => journal.push({ type:"message", txt });
  w.annulerMouvement = () => { w.CHEMIN_MOUVEMENT = []; };
  w.ajouterEtapeMouvement = (q, r) => {
    const chemin = w.calculerCheminVTT(w.CHEMIN_START_NODE, { q, r });
    w.CHEMIN_MOUVEMENT = chemin.map(s => ({ q:s.q, r:s.r, cost:2 }));
  };
  w.validerMouvement = async () => {
    const id = w.TOKEN_SELECTIONNE, pas = w.CHEMIN_MOUVEMENT.length;
    const dernier = w.CHEMIN_MOUVEMENT[pas - 1];
    if (dernier) w.TOKENS_VTT_DATA[id] = { q: dernier.q, r: dernier.r };
    const p = persos.find(x => x.idPersonnage === id);
    if (p) p.fatigueActuelle = Math.max(0, p.fatigueActuelle - pas * 2);
    journal.push({ type:"deplacement", id, pas });
    w.CHEMIN_MOUVEMENT = [];
  };
  w.demarrerCiblage = async (idCarte) => { w.ETAT_CIBLAGE = { actif:true, isZone:false, idCarte }; };
  w.ajouterCibleCiblage = (idCible) => { w.ETAT_CIBLAGE.cible = idCible; };
  w.declencherResolution = async () => {
    const st = w.ETAT_CIBLAGE, lanceur = w.TOKEN_SELECTIONNE;
    const p = persos.find(x => x.idPersonnage === lanceur);
    const dataCarte = (w.CACHE_COMPETENCES_GLOBAL[lanceur] || {})[st.idCarte];
    if (p && dataCarte) p.fatigueActuelle = Math.max(0, p.fatigueActuelle - (parseInt(dataCarte.Fatigue)||0));
    const cible = persos.find(x => x.idPersonnage === st.cible);
    const infos = w.analyserCarteMonstre(dataCarte || {});
    if (cible) cible.PV_Actuels = Math.max(0, cible.PV_Actuels - Math.round(infos.degats));
    journal.push({ type:"sort", lanceur, cible: st.cible, degats: Math.round(infos.degats) });
    w.ETAT_CIBLAGE = { actif:false };
  };
  w.finDeTourCombat = async () => {
    const action = partie.File_Attente_Combat[0];
    if (action && action.idCarte === "REPOS_LONG") {
      const p = persos.find(x => x.idPersonnage === action.idPersonnage);
      if (p) {
        const max = parseInt(p.Fatigue_Max) || 100;
        p.fatigueActuelle = Math.min(max, p.fatigueActuelle + Math.floor(max * 0.35));
        journal.push({ type:"repos", id: action.idPersonnage, fatigue: p.fatigueActuelle });
      }
    }
    partie.File_Attente_Combat.shift();
    if (partie.File_Attente_Combat.length === 0) {
      partie.Phase_Combat = "Preparation";
      partie.Tour_Combat++;
    }
  };
  // Verrou : un seul poste dans ce simulateur, il l'obtient toujours.
  w.__verrou = {};
}

// Les joueurs choisissent une carte au hasard parmi celles qu'ils peuvent payer.
function joueursPreparent(monde) {
  const { partie, persos } = monde;
  const dejaLa = new Set(partie.File_Attente_Combat.map(f => f.idPersonnage));
  persos.filter(p => !p.estMonstre && p.PV_Actuels > 0).forEach(p => {
    if (dejaLa.has(p.idPersonnage)) return;
    partie.File_Attente_Combat.push({ idPersonnage:p.idPersonnage, idCarte:"CARTE_JOUEUR",
      initiative: 40 + Math.floor(Math.random()*40), timestamp: Date.now() + Math.random() });
  });
}

async function jouerCombat({ nbJoueurs, nbMonstres, toursMax = 12 }) {
  const monde = creerCombat({ nbJoueurs, nbMonstres });
  const journal = [];
  installerMoteur(monde, journal);
  const { w, partie, persos } = monde;

  // On fournit de vrais simulacres Firestore adossés au document de partie :
  // le code du verrou est ainsi exercé tel quel, pas contourné.
  const db = {};
  const doc = () => ({});
  const getDoc = async () => ({ exists: () => true, data: () => structuredClone(partie) });
  const updateDoc = async (_ref, data) => { Object.assign(partie, structuredClone(data)); };
  const runTransaction = async (_db, fn) => fn({
    get: async () => ({ exists: () => true, data: () => structuredClone(partie) }),
    update: (_ref, data) => Object.assign(partie, structuredClone(data))
  });
  // L'IA marque de vraies pauses (900 à 1600 ms par étape) pour que la table
  // suive ce qui se passe : un seul combat prendrait donc plusieurs minutes.
  // On ramène leur DURÉE à zéro sans toucher à setTimeout lui-même — remplacer
  // la fonction globale par un appel synchrone finit par bloquer la chaîne de
  // promesses au bout de quelques dizaines d'enchaînements.
  const srcIA = fs.readFileSync('/home/user/Ivalis/monstres_ia.js','utf-8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";/gm,'')
    .replace(/await pause\(\d+\);/g, 'await pause(0);');
  eval(srcIA);

  let garde = 0;
  const trace = [];
  const vivants = () => persos.filter(p => p.PV_Actuels > 0);
  while (partie.Tour_Combat <= toursMax && garde < 3000) {
    garde++;
    const monstresVivants = persos.filter(p => p.estMonstre && p.PV_Actuels > 0).length;
    const joueursVivants  = persos.filter(p => !p.estMonstre && p.PV_Actuels > 0).length;
    if (monstresVivants === 0 || joueursVivants === 0) break;

    if (trace.length < 30) trace.push(`${partie.Phase_Combat}|T${partie.Tour_Combat}|file=${partie.File_Attente_Combat.length}`);
    if (partie.Phase_Combat === "Preparation") {
      joueursPreparent(monde);
      await w.preparerCartesMonstres();
      const nbActifs = partie.Ordre_Initiative.filter(id => {
        const p = persos.find(x => x.idPersonnage === id); return p && p.PV_Actuels > 0;
      }).length;
      if (partie.File_Attente_Combat.length >= nbActifs && nbActifs > 0) {
        partie.File_Attente_Combat.sort((a,b) => b.initiative - a.initiative || a.timestamp - b.timestamp);
        partie.Phase_Combat = "Resolution";
      } else if (partie.File_Attente_Combat.length === 0) {
        return { bloque: true, raison: "personne ne choisit de carte", partie, journal, persos, garde };
      }
      continue;
    }

    const action = partie.File_Attente_Combat[0];
    if (!action) { partie.Phase_Combat = "Preparation"; partie.Tour_Combat++; continue; }

    if (w.estMonstre(action.idPersonnage)) {
      await w.jouerTourMonstre(action.idPersonnage, action.idCarte);
    } else {
      // Le joueur frappe le monstre le plus proche, pour que le combat avance.
      const cible = persos.filter(p => p.estMonstre && p.PV_Actuels > 0)[0];
      if (cible) cible.PV_Actuels = Math.max(0, cible.PV_Actuels - 12);
      await w.finDeTourCombat();
    }
  }
  return { bloque: garde >= 3000, raison: garde >= 3000 ? "boucle sans fin" : null, partie, journal, persos, garde, trace };
}

// ------------------------------------------------------------------
let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(54)} ${c?"OK":"ÉCHEC"} ${d}`); };

console.log("COMBATS COMPLETS SIMULÉS\n");
const config = [ {nbJoueurs:3, nbMonstres:4}, {nbJoueurs:1, nbMonstres:2}, {nbJoueurs:4, nbMonstres:6}, {nbJoueurs:2, nbMonstres:3} ];
let bloques = 0, toursJoues = 0, sorts = 0, deplacements = 0, repos = 0, parties = 0;

for (const cfg of config) {
  for (let essai = 0; essai < 6; essai++) {
    const r = await jouerCombat({ ...cfg, toursMax: 12 });
    parties++;
    if (r.bloque) { bloques++; console.log(`  ⚠️ BLOCAGE (${cfg.nbJoueurs}j/${cfg.nbMonstres}m) : ${r.raison}`); continue; }
    toursJoues += r.partie.Tour_Combat;
    sorts += r.journal.filter(e => e.type === "sort").length;
    deplacements += r.journal.filter(e => e.type === "deplacement").length;
    repos += r.journal.filter(e => e.type === "repos").length;
  }
}
console.log(`  ${parties} combats simulés (1 à 4 joueurs, 2 à 6 monstres, 12 tours)\n`);
verifier("aucun combat bloqué", bloques === 0, `(${bloques}/${parties})`);
verifier("les monstres lancent des sorts", sorts > 0, `(${sorts} au total)`);
verifier("les monstres se déplacent", deplacements > 0, `(${deplacements})`);
console.log(`     repos longs pris : ${repos}   tours joués au total : ${toursJoues}`);

console.log(`\n${echecs === 0 ? "TOUS LES CONTRÔLES PASSENT" : echecs + " CONTRÔLE(S) EN ÉCHEC"}`);
