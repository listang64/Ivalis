// LE BUG DU COMBAT FIGÉ.
// L'IA n'est réveillée que par les notifications Firestore. finDeTourCombat lève
// son drapeau d'animation AVANT d'écrire en base : la notification qui annonce
// "c'est au tour du monstre" tombe donc toujours pendant l'animation, l'IA
// renonce, et plus rien ne la rappelle. Résultat en table : la carte du monstre
// est bien choisie, mais il ne joue pas et il faut cliquer "fin de tour" à sa
// place. Ce banc rejoue cette séquence exacte.
import fs from 'fs';

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c?"OK":"ÉCHEC"} ${d}`); };
const attendre = (ms) => new Promise(r => setTimeout(r, ms));

function creerPoste(partagee) {
  const w = {};
  const db = {}, doc = () => ({});
  const getDoc = async () => ({ exists: () => true, data: () => structuredClone(partagee.doc) });
  const updateDoc = async (_r, data) => { Object.assign(partagee.doc, structuredClone(data)); };
  const runTransaction = async (_db, fn) => fn({
    get: async () => ({ exists: () => true, data: () => structuredClone(partagee.doc) }),
    update: (_r, data) => Object.assign(partagee.doc, structuredClone(data))
  });

  w.ID_PARTIE_COURANTE = "P1";
  w.PLATEAU_VTT = { getCaseState: () => ({ isBlocked:false, isDeleted:false, isDifficult:false }) };
  w.TOKENS_VTT_DATA = {}; w.ZONES_PERSISTANTES = {}; w.EFFETS_BDD_CACHE = {};
  w.PERSOS_PARTIE = []; w.MONSTRES_PARTIE = []; w.CACHE_COMPETENCES_GLOBAL = {};
  w.PARTIE_DATA = partagee.doc;
  w.estCombattantMort = () => false;
  w.estMonstre = (id) => String(id).startsWith("M");
  w.hexDistanceVTT = () => 1; w.calculerCheminVTT = () => [];
  w.refCombattant = () => ({});
  w.finDeTourCombat = async () => {};

  const src = fs.readFileSync('/home/user/Ivalis/monstres_ia.js','utf-8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";/gm,'')
    .replace(/await pause\(\d+\);/g, '');
  new Function('window','db','doc','getDoc','updateDoc','runTransaction', src)(
    w, db, doc, getDoc, updateDoc, runTransaction);
  return w;
}

console.log("1. RÉVEIL APRÈS L'ANIMATION DE FIN DE TOUR");
{
  const partagee = { doc: { Phase_Combat:"Resolution", Tour_Combat:1, Verrou_IA:null,
    Ordre_Initiative:["M1","J1"],
    File_Attente_Combat:[ { idPersonnage:"M1", idCarte:"C1", initiative:80, timestamp:111 } ] } };
  const w = creerPoste(partagee);
  const joues = [];
  w.jouerTourMonstre = async (id, carte) => { joues.push(id + "/" + carte); };

  // La notification arrive PENDANT l'animation de fin de tour, comme en vrai.
  w.ANIMATION_TOUR_EN_COURS = true;
  await w.verifierTourIAMonstres();
  verifier("pendant l'animation, il ne joue pas", joues.length === 0);
  verifier("mais il s'est programmé un rappel", !!w.RAPPEL_IA_MONSTRES);

  // L'animation se termine. Aucune écriture en base ne suit : sans rappel
  // interne, plus rien ne réveillerait l'IA.
  w.ANIMATION_TOUR_EN_COURS = false;
  await attendre(1400);
  verifier("l'animation finie, il joue son tour tout seul", joues.length === 1, `(${joues.join(", ")})`);
}

console.log("\n2. PAS DE DOUBLE TOUR SI DEUX NOTIFICATIONS SE SUIVENT");
{
  const partagee = { doc: { Phase_Combat:"Resolution", Tour_Combat:1, Verrou_IA:null,
    Ordre_Initiative:["M1"],
    File_Attente_Combat:[ { idPersonnage:"M1", idCarte:"C1", initiative:80, timestamp:222 } ] } };
  const w = creerPoste(partagee);
  const joues = [];
  w.jouerTourMonstre = async (id) => { await attendre(120); joues.push(id); };

  // Le verrou s'écrit en base, ce qui déclenche une seconde notification : les
  // deux appels se chevauchent.
  await Promise.all([ w.verifierTourIAMonstres(), w.verifierTourIAMonstres(), w.verifierTourIAMonstres() ]);
  await attendre(300);
  verifier("le monstre ne joue qu'une seule fois", joues.length === 1, `(${joues.length} fois)`);
}

console.log("\n3. PRÉPARATION : IL ATTEND SES TECHNIQUES AU LIEU DE SOUFFLER");
{
  // Le joueur a déjà posé sa carte : les créatures s'engagent après lui.
  const partagee = { doc: { Phase_Combat:"Preparation", Tour_Combat:1, Verrou_IA:null,
    Ordre_Initiative:["M1","J1"],
    File_Attente_Combat:[ { idPersonnage:"J1", idCarte:"CJ", initiative:50, timestamp:1 } ] } };
  const w = creerPoste(partagee);
  const monstre = { idPersonnage:"M1", prenom:"Gnoll", estMonstre:true, camp:"Ennemi",
                    Personnalite:"brutal", Fatigue_Max:120, fatigueActuelle:120,
                    PV_Max:70, PV_Actuels:70, deckEquipe:[] };   // forge pas finie
  const joueur = { idPersonnage:"J1", prenom:"Jade", camp:"Allié", PV_Max:42, PV_Actuels:42 };
  w.PERSOS_PARTIE = [monstre, joueur]; w.MONSTRES_PARTIE = [monstre];
  w.TOKENS_VTT_DATA = { M1:{q:0,r:0}, J1:{q:2,r:0} };

  await w.verifierTourIAMonstres();
  verifier("rien n'est posé tant que la forge tourne",
    !(partagee.doc.File_Attente_Combat||[]).some(f => f.idPersonnage === "M1"));
  verifier("aucun repos long n'a été inscrit",
    !(partagee.doc.File_Attente_Combat||[]).some(f => f.idCarte === "REPOS_LONG"));
  verifier("un rappel est programmé", !!w.RAPPEL_IA_MONSTRES);

  // La forge livre : Deck_Equipe écrit, cache rempli. Le rappel doit suffire.
  monstre.deckEquipe = ["C1"];
  w.CACHE_COMPETENCES_GLOBAL.M1 = { C1: { Nom:"Coup brutal", Fatigue:30, Initiative:70,
    Composants:{ actions:[{ baseEffetId:"EFF_ATTAQUE_LOURDE", count:6, mods:{}, zoneHexes:[], baseDuree:0, modsDuree:{} }] } } };
  await attendre(1800);
  const file = partagee.doc.File_Attente_Combat || [];
  verifier("sa technique est posée dès qu'elle arrive", file.some(f => f.idCarte === "C1"),
           `(${file.map(f=>f.idCarte).join(", ") || "rien"})`);
}

console.log("\n5. LES CRÉATURES CHOISISSENT APRÈS LES JOUEURS");
{
  const partagee = { doc: { Phase_Combat:"Preparation", Tour_Combat:1, Verrou_IA:null,
    Ordre_Initiative:["M1","J1","J2"], File_Attente_Combat:[] } };
  const w = creerPoste(partagee);
  const carte = { Nom:"Coup brutal", Fatigue:30, Initiative:70,
    Composants:{ actions:[{ baseEffetId:"EFF_ATTAQUE_LOURDE", count:6, mods:{}, zoneHexes:[], baseDuree:0, modsDuree:{} }] } };
  const monstre = { idPersonnage:"M1", prenom:"Gnoll", estMonstre:true, camp:"Ennemi",
                    Personnalite:"brutal", Fatigue_Max:120, fatigueActuelle:120,
                    PV_Max:70, PV_Actuels:70, deckEquipe:["C1"] };
  const j1 = { idPersonnage:"J1", prenom:"Jade", camp:"Allié", PV_Max:42, PV_Actuels:42 };
  const j2 = { idPersonnage:"J2", prenom:"Ben",  camp:"Allié", PV_Max:42, PV_Actuels:42 };
  w.PERSOS_PARTIE = [monstre, j1, j2]; w.MONSTRES_PARTIE = [monstre];
  w.TOKENS_VTT_DATA = { M1:{q:0,r:0}, J1:{q:2,r:0}, J2:{q:3,r:0} };
  w.CACHE_COMPETENCES_GLOBAL.M1 = { C1: carte };

  await w.verifierTourIAMonstres();
  verifier("aucune carte posée tant qu'un joueur n'a pas choisi",
    (partagee.doc.File_Attente_Combat||[]).length === 0);

  // Un seul des deux joueurs a choisi : ce n'est pas encore aux monstres.
  partagee.doc.File_Attente_Combat = [{ idPersonnage:"J1", idCarte:"CJ1", initiative:40, timestamp:1 }];
  w.PARTIE_DATA = partagee.doc;
  await w.verifierTourIAMonstres();
  verifier("ni quand un seul des deux a choisi",
    (partagee.doc.File_Attente_Combat||[]).length === 1);

  // Toute la table a choisi : la créature s'engage à son tour.
  partagee.doc.File_Attente_Combat.push({ idPersonnage:"J2", idCarte:"CJ2", initiative:30, timestamp:2 });
  w.PARTIE_DATA = partagee.doc;
  await w.verifierTourIAMonstres();
  await attendre(200);
  const posees = (partagee.doc.File_Attente_Combat||[]).map(f => f.idPersonnage);
  verifier("une fois la table engagée, la créature choisit", posees.includes("M1"), `(${posees.join(", ")})`);

  // Un joueur mort ne doit bloquer personne.
  const partagee2 = { doc: { Phase_Combat:"Preparation", Tour_Combat:1, Verrou_IA:null,
    Ordre_Initiative:["M1","J1"], File_Attente_Combat:[] } };
  const w2 = creerPoste(partagee2);
  const mort = { idPersonnage:"J1", prenom:"Jade", camp:"Allié", PV_Max:42, PV_Actuels:0, statut:"Mort" };
  w2.PERSOS_PARTIE = [monstre, mort]; w2.MONSTRES_PARTIE = [monstre];
  w2.TOKENS_VTT_DATA = { M1:{q:0,r:0}, J1:{q:2,r:0} };
  w2.CACHE_COMPETENCES_GLOBAL.M1 = { C1: carte };
  w2.estCombattantMort = (id) => id === "J1";
  await w2.verifierTourIAMonstres();
  await attendre(200);
  verifier("un joueur à terre ne retient pas les monstres",
    (partagee2.doc.File_Attente_Combat||[]).some(f => f.idPersonnage === "M1"));
}

console.log("\n4. RIEN À FAIRE : AUCUN RAPPEL INUTILE");
{
  const partagee = { doc: { Phase_Combat:"Resolution", Tour_Combat:1, Verrou_IA:null,
    Ordre_Initiative:["J1"],
    File_Attente_Combat:[ { idPersonnage:"J1", idCarte:"C9", initiative:50, timestamp:9 } ] } };
  const w = creerPoste(partagee);
  await w.verifierTourIAMonstres();
  verifier("au tour d'un joueur, l'IA se tait et ne s'arme pas", !w.RAPPEL_IA_MONSTRES);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
