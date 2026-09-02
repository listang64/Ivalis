// 100 COMBATS COMPLETS : 3 joueurs contre une rencontre générée.
// Tout est réel sauf la résolution des dégâts, rejouée d'après la formule du
// moteur (résistance en %, jet d'esquive/parade, malus de tir au contact).
// Les compétences des DEUX camps sortent du vrai générateur.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { chargerIA, creerPlateau, combattant, activer, EFFETS } from './banc_ia.mjs';

// Même règle que combat.js : les monstres utilisent le Repos_Long de leur
// gabarit (en % de la jauge), les joueurs gardent les 35% historiques.
function tauxRepos(p) {
  const pct = parseInt(p && p.Repos_Long);
  return (!isNaN(pct) && pct > 0) ? pct / 100 : 0.35;
}


const GABARITS = JSON.parse(fs.readFileSync('gabarits_reels.json','utf-8'));
const gabaritDe = (a,p) => Object.values(GABARITS).find(g => g.Archetype === a && g.Palier === p);

// Stats réelles des personnages de la partie (lues dans la base).
const STATS_JOUEUR = { PV_Max:42, Fatigue_Max:100, Esquive:15, Parade:0, Def_Physique:0, Def_Magique:0, Critique:10 };
const ARCHETYPES_JOUEURS = ["DPS CAC", "DPS MAGE DISTANCE", "SOUTIEN"];

// --- Chargement du générateur de compétences (le vrai) ---
function chargerGenerateurCompetences(w) {
  w.EFFETS_BDD_CACHE = EFFETS;
  w.gabaritMonstre = (a,p) => gabaritDe(a,p) || null;
  const src = fs.readFileSync('/home/user/Ivalis/monstres_competences.js','utf-8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";/gm,'');
  eval(src);
}

const distance = (a,b) => Math.max(Math.abs(a.q-b.q), Math.abs(a.r-b.r), Math.abs((-a.q-a.r)-(-b.q-b.r)));

// Résolution des dégâts, calquée sur moteur_effets.js.
function resoudreAttaque(lanceur, cible, infos, dist, journal) {
  const esquive = Math.max(parseInt(cible.Esquive)||0, parseInt(cible.Parade)||0);
  if (Math.floor(Math.random()*100)+1 <= esquive) { journal.esquives++; return 0; }
  let degats = infos.degats;
  if (infos.portee > 1 && dist === 1) degats = Math.floor(degats * 0.7);  // tir au contact
  const resistance = Math.min(100, parseInt(cible.Def_Physique)||0);
  const finaux = Math.max(0, Math.round(degats * (1 - resistance/100)));
  cible.PV_Actuels = Math.max(0, cible.PV_Actuels - finaux);
  return finaux;
}

// IA sommaire des joueurs : ils jouent correctement sans être optimaux.
function tourJoueur(w, joueur, action, persos, tokens, journal) {
  const carte = (w.CACHE_COMPETENCES_GLOBAL[joueur.idPersonnage]||{})[action.idCarte];
  if (action.idCarte === "REPOS_LONG" || !carte) {
    if (action.idCarte === "REPOS_LONG") {
      const max = joueur.Fatigue_Max;
      joueur.fatigueActuelle = Math.min(max, joueur.fatigueActuelle + Math.floor(max*tauxRepos(joueur)));
      journal.reposJoueurs++;
    }
    return;
  }
  const infos = w.analyserCarteMonstre(carte);
  const tk = tokens[joueur.idPersonnage];
  const ennemis = persos.filter(p => p.camp === "Ennemi" && p.PV_Actuels > 0 && tokens[p.idPersonnage]);
  if (ennemis.length === 0) return;

  // Cible : le plus faible à portée, sinon le plus proche.
  ennemis.sort((a,b) => distance(tk,tokens[a.idPersonnage]) - distance(tk,tokens[b.idPersonnage]));
  let cible = ennemis.find(e => distance(tk,tokens[e.idPersonnage]) <= infos.portee) || ennemis[0];

  // Rapprochement : jusqu'à 3 cases vers la cible.
  let d = distance(tk, tokens[cible.idPersonnage]);
  let pas = 0;
  while (d > infos.portee && pas < 3 && joueur.fatigueActuelle >= infos.fatigue + 2) {
    const tc = tokens[cible.idPersonnage];
    const dq = Math.sign(tc.q - tk.q), dr = Math.sign(tc.r - tk.r);
    const cand = { q: tk.q + (dq||0), r: tk.r + (dr && !dq ? dr : 0) };
    if (Object.values(tokens).some(t => t.q===cand.q && t.r===cand.r)) break;
    tokens[joueur.idPersonnage] = cand; tk.q = cand.q; tk.r = cand.r;
    joueur.fatigueActuelle -= 2; pas++;
    d = distance(tk, tokens[cible.idPersonnage]);
  }
  if (d > infos.portee) { journal.horsPorteeJoueurs++; return; }

  joueur.fatigueActuelle = Math.max(0, joueur.fatigueActuelle - infos.fatigue);
  if (infos.estSoin) {
    const blesse = persos.filter(p => p.camp === "Allié" && p.PV_Actuels > 0)
                         .sort((a,b) => a.PV_Actuels/a.PV_Max - b.PV_Actuels/b.PV_Max)[0];
    if (blesse) { blesse.PV_Actuels = Math.min(blesse.PV_Max, blesse.PV_Actuels + Math.round(infos.degats || 4)); journal.soinsJoueurs++; }
  } else {
    journal.degatsJoueurs += resoudreAttaque(joueur, cible, infos, d, journal);
    journal.sortsJoueurs++;
  }
}

async function unCombat(numero) {
  const journal = { sortsJoueurs:0, sortsMonstres:0, degatsJoueurs:0, degatsMonstres:0, esquives:0,
                    reposJoueurs:0, reposMonstres:0, deplacementsMonstres:0, deplacementsJoueurs:0, horsPorteeJoueurs:0,
                    horsPorteeMonstres:0, soinsJoueurs:0, soinsMonstres:0, tours:0, cartesJouees:{} };

  // --- Monde ---
  const tokens = {}, persos = [], competences = {};
  const w0 = activer(chargerIA({ plateau: creerPlateau(), tokens, persos, competences,
                                 partie:{}, zones:{} }));
  chargerGenerateurCompetences(w0);

  // --- Les 3 joueurs, avec leurs vraies stats et des cartes générées ---
  for (let i = 0; i < 3; i++) {
    const id = `J${i}`;
    tokens[id] = { q: -5, r: i - 1 };
    const j = combattant({ idPersonnage:id, camp:'Allié', prenom:`Héros${i}`, Regeneration:30,
                           Personnalite: ["sanguinaire","tacticien","opportuniste"][i], ...STATS_JOUEUR,
                           PV_Actuels: STATS_JOUEUR.PV_Max, fatigueActuelle: STATS_JOUEUR.Fatigue_Max });
    const docs = await w0.genererCompetencesMonstre({ nom:`Héros${i}`, archetype: ARCHETYPES_JOUEURS[i],
                                                      palier:"Normal", fatigueMax: STATS_JOUEUR.Fatigue_Max });
    competences[id] = {}; docs.forEach((d,k) => competences[id][`${id}_c${k}`] = d);
    j.deckEquipe = Object.keys(competences[id]);
    persos.push(j);
  }

  // --- La rencontre : composition tirée par le vrai code ---
  // Tirage identique au tableau des rencontres (5 répartitions, +1 Élite en
  // difficile, +1 Boss en très difficile). Reproduit ici pour ne pas avoir à
  // charger monstres.js et toute sa couche Firestore.
  const REPARTITIONS = [{Petit:1,Normal:3},{Petit:2,Normal:2},{Petit:3,Normal:1},{Petit:5,Normal:0},{Petit:0,Normal:4}];
  const ARCHS = ["DPS CAC","TANK CAC","SOUTIEN","DPS MAGE CAC","DPS DISTANCE","DPS MAGE DISTANCE"];
  const auHasard = (a) => a[Math.floor(Math.random()*a.length)];
  const difficulte = ["Normale","Difficile","Très difficile"][numero % 3];
  const rep = auHasard(REPARTITIONS);
  const composition = [];
  const palierRenfort = difficulte === "Difficile" ? "Élite" : (difficulte === "Très difficile" ? "Boss" : null);
  if (palierRenfort) {
    const dispo = ARCHS.filter(a => gabaritDe(a, palierRenfort));
    composition.push({ archetype: auHasard(dispo), palier: palierRenfort });
  }
  ["Petit","Normal"].forEach(pal => {
    for (let k = 0; k < (rep[pal]||0); k++) composition.push({ archetype: auHasard(ARCHS), palier: pal });
  });
  const limite = 3 + 1;  // 3 joueurs + 1
  const surTerrain = composition.slice(0, limite);
  const roles = ["brutal","prudent","sanguinaire","tacticien","opportuniste"];
  for (let i = 0; i < surTerrain.length; i++) {
    const m = surTerrain[i], id = `M${i}`;
    const gab = gabaritDe(m.archetype, m.palier);
    tokens[id] = { q: 5, r: i - 1 };
    const mo = combattant({ idPersonnage:id, estMonstre:true, camp:'Ennemi', prenom:`${m.archetype} ${m.palier}`,
      Personnalite: roles[Math.floor(Math.random()*roles.length)],
      PV_Max: gab.PV, PV_Actuels: gab.PV, Fatigue_Max: gab.Fatigue_Max, fatigueActuelle: gab.Fatigue_Max,
      Esquive: gab.Parade_Esquive, Parade: gab.Parade_Esquive,
      Def_Physique: gab.Res_Physique, Def_Magique: gab.Res_Magique,
      Regeneration: gab.Regeneration, Repos_Long: gab.Repos_Long });
    const docs = await w0.genererCompetencesMonstre({ nom: m.nom || m.archetype, archetype: m.archetype,
                                                      palier: m.palier, fatigueMax: gab.Fatigue_Max });
    competences[id] = {}; docs.forEach((d,k) => competences[id][`${id}_c${k}`] = d);
    mo.deckEquipe = Object.keys(competences[id]);
    persos.push(mo);
  }

  // --- Moteur de partie ---
  const partie = { Phase_Combat:"Preparation", Tour_Combat:1, File_Attente_Combat:[],
                   Ordre_Initiative: persos.map(p => p.idPersonnage), Verrou_IA:null };
  const w = activer(chargerIA({ plateau: creerPlateau(), tokens, persos, competences, partie, zones:{} }));
  chargerGenerateurCompetences(w);
  w.CACHE_COMPETENCES_GLOBAL = competences;
  w.PERSOS_JOUEURS_PARTIE = persos.filter(p => !p.estMonstre);
  w.MONSTRES_PARTIE = persos.filter(p => p.estMonstre);

  w.afficherDansPanneauGauche = () => {}; w.centrerMapSurToken = () => {};
  w.afficherMessageFlottantHex = (q,r,txt) => {
    if (txt !== "Hors de portée") return;
    const a = persos.find(p => p.idPersonnage === w.TOKEN_SELECTIONNE);
    journal[a && !a.estMonstre ? "horsPorteeJoueurs" : "horsPorteeMonstres"]++;
  };
  w.annulerMouvement = () => { w.CHEMIN_MOUVEMENT = []; };
  w.ajouterEtapeMouvement = (q,r) => {
    const ch = w.calculerCheminVTT(w.CHEMIN_START_NODE, {q,r});
    w.CHEMIN_MOUVEMENT = ch.map(s => ({q:s.q, r:s.r, cost:2}));
  };
  w.validerMouvement = async () => {
    const id = w.TOKEN_SELECTIONNE, n = w.CHEMIN_MOUVEMENT.length, dernier = w.CHEMIN_MOUVEMENT[n-1];
    if (dernier) tokens[id] = { q:dernier.q, r:dernier.r };
    const p = persos.find(x => x.idPersonnage === id);
    if (p) p.fatigueActuelle = Math.max(0, p.fatigueActuelle - n*2);
    journal[p && !p.estMonstre ? "deplacementsJoueurs" : "deplacementsMonstres"]++; w.CHEMIN_MOUVEMENT = [];
  };
  w.demarrerCiblage = async (idCarte) => {
    const a = persos.find(p => p.idPersonnage === w.TOKEN_SELECTIONNE);
    if (a && a.estMonstre) {
      journal.cartesJouees[a.idPersonnage] = journal.cartesJouees[a.idPersonnage] || [];
      journal.cartesJouees[a.idPersonnage].push(idCarte);
    }
    w.ETAT_CIBLAGE = { actif:true, isZone:false, idCarte };
  };
  w.ajouterCibleCiblage = (id) => { w.ETAT_CIBLAGE.cible = id; };
  w.declencherResolution = async () => {
    const st = w.ETAT_CIBLAGE, lanceur = persos.find(p => p.idPersonnage === w.TOKEN_SELECTIONNE);
    const carte = (competences[w.TOKEN_SELECTIONNE]||{})[st.idCarte];
    const cible = persos.find(p => p.idPersonnage === st.cible);
    if (lanceur && carte) {
      const infos = w.analyserCarteMonstre(carte);
      lanceur.fatigueActuelle = Math.max(0, lanceur.fatigueActuelle - infos.fatigue);
      if (cible) {
        const d = distance(tokens[lanceur.idPersonnage], tokens[cible.idPersonnage]);
        const cote = lanceur.estMonstre ? "Monstres" : "Joueurs";
        if (infos.estSoin) { cible.PV_Actuels = Math.min(cible.PV_Max, cible.PV_Actuels + Math.round(infos.degats||4)); journal["soins"+cote]++; }
        else { journal["degats"+cote] += resoudreAttaque(lanceur, cible, infos, d, journal); journal["sorts"+cote]++; }
      }
    }
    w.ETAT_CIBLAGE = { actif:false };
  };
  w.finDeTourCombat = async () => {
    const a = partie.File_Attente_Combat[0];
    if (a && a.idCarte === "REPOS_LONG") {
      const p = persos.find(x => x.idPersonnage === a.idPersonnage);
      if (p) { p.fatigueActuelle = Math.min(p.Fatigue_Max, p.fatigueActuelle + Math.floor(p.Fatigue_Max*tauxRepos(p)));
               journal[p.estMonstre ? "reposMonstres" : "reposJoueurs"]++; }
    }
    partie.File_Attente_Combat.shift();
    if (partie.File_Attente_Combat.length === 0) {
      // Fin de tour complet : le moteur rend Regeneration % de la fatigue max à
      // TOUS les combattants (combat.js, bloc regenPct). L'oublier affame
      // artificiellement les monstres et fausse toute mesure sur les repos.
      persos.forEach(p => {
        if (p.PV_Actuels <= 0) return;
        const pct = parseInt(p.Regeneration) || 0;
        if (pct > 0) p.fatigueActuelle = Math.min(p.Fatigue_Max, p.fatigueActuelle + Math.floor(pct/100 * p.Fatigue_Max));
      });
      partie.Phase_Combat = "Preparation"; partie.Tour_Combat++;
    }
  };

  const db={}, doc=()=>({}), getDoc=async()=>({exists:()=>true,data:()=>structuredClone(partie)});
  const updateDoc=async(_r,d)=>{Object.assign(partie,structuredClone(d));};
  const runTransaction=async(_d,fn)=>fn({ get:async()=>({exists:()=>true,data:()=>structuredClone(partie)}),
                                          update:(_r,d)=>Object.assign(partie,structuredClone(d)) });
  const srcIA = fs.readFileSync('/home/user/Ivalis/monstres_ia.js','utf-8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";/gm,'').replace(/await pause\(\d+\);/g, 'await pause(0);');
  // Les lectures de stats mutualisées vivent dans app.js, chargé avant tout le
  // reste sur la vraie page : un banc qui isole une fonction doit les poser aussi.
  new Function('window', SRC_STATS_COMMUNES)(w);
  eval(srcIA);

  // --- Déroulement ---
  let garde = 0;
  while (partie.Tour_Combat <= (parseInt(process.env.TOURS)||25) && garde < 2000) {
    garde++;
    const vivantsJ = persos.filter(p => p.camp==="Allié" && p.PV_Actuels>0).length;
    const vivantsM = persos.filter(p => p.camp==="Ennemi" && p.PV_Actuels>0).length;
    if (vivantsJ === 0 || vivantsM === 0) break;

    if (partie.Phase_Combat === "Preparation") {
      // Les joueurs choisissent : la moins chère qu'ils peuvent payer, au hasard parmi les 3 premières.
      // Les joueurs choisissent avec la MÊME fonction que les monstres : le
      // ratio mesure alors les statistiques et les cartes, pas la qualité
      // respective de deux intelligences différentes.
      persos.filter(p => p.camp==="Allié" && p.PV_Actuels>0).forEach(p => {
        if (partie.File_Attente_Combat.some(f => f.idPersonnage === p.idPersonnage)) return;
        const choix = w.choisirCarteMonstre(p);
        if (!choix) return;
        partie.File_Attente_Combat.push({ idPersonnage:p.idPersonnage,
          idCarte: choix.repos ? "REPOS_LONG" : choix.id,
          initiative: choix.repos ? 0 : (choix.data.Initiative||0), timestamp:Date.now()+Math.random() });
      });
      await w.preparerCartesMonstres();
      const nbActifs = partie.Ordre_Initiative.filter(id => {
        const p = persos.find(x=>x.idPersonnage===id); return p && p.PV_Actuels>0; }).length;
      if (partie.File_Attente_Combat.length >= nbActifs && nbActifs>0) {
        partie.File_Attente_Combat.sort((a,b)=> b.initiative-a.initiative || a.timestamp-b.timestamp);
        partie.Phase_Combat = "Resolution";
      } else if (partie.File_Attente_Combat.length === 0) return { bloque:true, journal };
      continue;
    }

    const action = partie.File_Attente_Combat[0];
    if (!action) { partie.Phase_Combat="Preparation"; partie.Tour_Combat++; continue; }
    const acteur = persos.find(p => p.idPersonnage === action.idPersonnage);
    if (!acteur || acteur.PV_Actuels <= 0) { await w.finDeTourCombat(); continue; }

    await w.jouerTourMonstre(action.idPersonnage, action.idCarte);
  }

  journal.tours = partie.Tour_Combat;
  const vivantsJ = persos.filter(p => p.camp==="Allié" && p.PV_Actuels>0).length;
  const vivantsM = persos.filter(p => p.camp==="Ennemi" && p.PV_Actuels>0).length;
  const issue = vivantsM === 0 ? "joueurs" : (vivantsJ === 0 ? "monstres" : "indecis");
  return { bloque: garde>=2000, issue, journal, vivantsJ, vivantsM,
           difficulte,
           nbMonstres: persos.filter(p=>p.estMonstre).length };
}

// ================= LANCEMENT =================
const N = parseInt(process.env.N || 100);
const resultats = [];
for (let i = 0; i < N; i++) resultats.push(await unCombat(i));

const cumul = (cle) => resultats.reduce((s,r) => s + (r.journal ? r.journal[cle] : 0), 0);
const parIssue = (v) => resultats.filter(r => r.issue === v).length;
const pct = (n) => (100*n/N).toFixed(0) + "%";

console.log(`\n${"═".repeat(62)}\n  ${N} COMBATS — 3 joueurs (42 PV) contre une rencontre générée\n${"═".repeat(62)}`);
console.log(`\nISSUES`);
console.log(`  victoire des joueurs  : ${String(parIssue("joueurs")).padStart(3)}  ${pct(parIssue("joueurs"))}`);
console.log(`  victoire des monstres : ${String(parIssue("monstres")).padStart(3)}  ${pct(parIssue("monstres"))}`);
console.log(`  indécis (plafond atteint): ${String(parIssue("indecis")).padStart(3)}  ${pct(parIssue("indecis"))}`);
console.log(`  combats bloqués       : ${String(resultats.filter(r=>r.bloque).length).padStart(3)}`);

console.log(`\nPAR DIFFICULTÉ`);
["Normale","Difficile","Très difficile"].forEach(d => {
  const s = resultats.filter(r => r.difficulte === d);
  const vj = s.filter(r=>r.issue==="joueurs").length;
  console.log(`  ${d.padEnd(15)} ${String(s.length).padStart(3)} combats — joueurs ${String(Math.round(100*vj/s.length)).padStart(3)}%  monstres ${String(Math.round(100*s.filter(r=>r.issue==="monstres").length/s.length)).padStart(3)}%  indécis ${Math.round(100*s.filter(r=>r.issue==="indecis").length/s.length)}%`);
});

console.log(`\nACTIVITÉ DES MONSTRES (total sur ${N} combats)`);
console.log(`  sorts lancés          : ${cumul("sortsMonstres")}`);
console.log(`  déplacements          : ${cumul("deplacementsMonstres")}`);
console.log(`  repos longs           : ${cumul("reposMonstres")}`);
console.log(`  soins entre monstres  : ${cumul("soinsMonstres")}`);
console.log(`  tours finis hors portée: ${cumul("horsPorteeMonstres")}`);
console.log(`  dégâts infligés       : ${cumul("degatsMonstres")}`);
console.log(`\nACTIVITÉ DES JOUEURS`);
console.log(`  sorts lancés          : ${cumul("sortsJoueurs")}   dégâts : ${cumul("degatsJoueurs")}`);
console.log(`  repos longs           : ${cumul("reposJoueurs")}   soins : ${cumul("soinsJoueurs")}`);
console.log(`  esquives/parades      : ${cumul("esquives")}`);
console.log(`  tours finis hors portée: ${cumul("horsPorteeJoueurs")}`);

// Part des tours de monstre passés à souffler plutôt qu'à agir.
const toursMonstres = cumul("sortsMonstres") + cumul("reposMonstres") + cumul("horsPorteeMonstres") + cumul("soinsMonstres");
console.log(`\nÉCONOMIE DE FATIGUE DES MONSTRES`);
console.log(`  part des tours passés à souffler : ${(100*cumul("reposMonstres")/toursMonstres).toFixed(0)}%`);
console.log(`  part des tours réellement offensifs : ${(100*cumul("sortsMonstres")/toursMonstres).toFixed(0)}%`);
console.log(`  dégâts par sort lancé : ${(cumul("degatsMonstres")/Math.max(1,cumul("sortsMonstres"))).toFixed(1)}`);
console.log(`  dégâts par sort côté joueurs : ${(cumul("degatsJoueurs")/Math.max(1,cumul("sortsJoueurs"))).toFixed(1)}`);
// Variété RÉELLE : combien de cartes différentes un monstre joue-t-il vraiment ?
let sommeDistinctes = 0, sommeJouees = 0, nbMonstresActifs = 0, repetitionsImmediates = 0, totalEnchainements = 0;
resultats.forEach(r => Object.values(r.journal.cartesJouees || {}).forEach(liste => {
  if (liste.length < 2) return;
  nbMonstresActifs++; sommeDistinctes += new Set(liste).size; sommeJouees += liste.length;
  for (let i = 1; i < liste.length; i++) { totalEnchainements++; if (liste[i] === liste[i-1]) repetitionsImmediates++; }
}));
console.log(`\nVARIÉTÉ RÉELLE EN COMBAT (monstres ayant joué au moins 2 cartes)`);
console.log(`  cartes différentes jouées : ${(sommeDistinctes/nbMonstresActifs).toFixed(2)} sur ${(sommeJouees/nbMonstresActifs).toFixed(1)} cartes lancées en moyenne`);
console.log(`  même carte deux tours de suite : ${(100*repetitionsImmediates/Math.max(1,totalEnchainements)).toFixed(0)}%`);

console.log(`\nRYTHME`);
const tours = resultats.map(r=>r.journal.tours);
console.log(`  durée moyenne : ${(tours.reduce((a,b)=>a+b,0)/N).toFixed(1)} tours  (min ${Math.min(...tours)}, max ${Math.max(...tours)})`);
