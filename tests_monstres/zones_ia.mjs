// LES ZONES DES MONSTRES.
// Une carte de zone ne se lance pas : elle se POSE. Il lui faut une ancre et une
// orientation, puis validerZoneAoE() calcule qui est pris dedans. L'IA appelait
// directement la résolution : la zone partait sans ancre, donc sans toucher
// personne. Ce banc vérifie qu'elle est maintenant posée au mieux.
import fs from 'fs';
import { chargerIA, creerPlateau, combattant, activer } from './banc_ia.mjs';

// La VRAIE rotation hexagonale du moteur, et sa ligne de vue.
const src = fs.readFileSync('/home/user/Ivalis/moteur_effets.js','utf-8');
const debutRot = src.indexOf('function rotateHex');
const rotateHex = eval(`(${src.slice(debutRot, src.indexOf('\n}', debutRot) + 2)})`);

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c?"OK":"ÉCHEC"} ${d}`); };
const dist = (a,b) => Math.max(Math.abs(a.q-b.q), Math.abs(a.r-b.r), Math.abs((-a.q-a.r)-(-b.q-b.r)));

// Une zone en ligne de trois cases devant soi (0,0 est exclu par la Forge).
const LIGNE3 = [{q:1,r:0},{q:2,r:0},{q:3,r:0}];
// Un pâté de trois cases collées.
const PATE = [{q:1,r:0},{q:0,r:1},{q:1,r:-1}];

function monde({ zone, portee, soigne = false, persos, tokens, murs = [] }) {
  const w = activer(chargerIA({ plateau: creerPlateau({ murs }), tokens, persos }));
  w.rotateHexVTT = rotateHex;
  w.verifierLigneDeVueVTT = (a, b) => {
    // Version simplifiée mais fidèle : un mur sur la ligne coupe la vue.
    const d = dist(a, b);
    if (d <= 1) return true;
    for (let i = 1; i < d; i++) {
      const t = i / d;
      const q = Math.round(a.q + (b.q - a.q) * t), r = Math.round(a.r + (b.r - a.r) * t);
      if (w.PLATEAU_VTT.getCaseState(q, r).isBlocked) return false;
    }
    return true;
  };
  w.ETAT_CIBLAGE = {
    actif: true, isZone: true, zoneHexesBase: zone, zoneRotationStep: 0, zoneCenterHex: null,
    attaques: [{ isRanged: portee > 1, rangeMax: portee, isHeal: soigne, isShield: false, cibles: [] }],
    alterations: []
  };
  return w;
}

// Les cases réellement couvertes par un plan de pose.
const emprise = (zone, plan) => zone.map(h => {
  const rot = rotateHex(h, plan.rotation);
  return { q: plan.centre.q + rot.q, r: plan.centre.r + rot.r };
});
const touche = (zone, plan, tk) => emprise(zone, plan).some(h => h.q === tk.q && h.r === tk.r);

console.log("1. ZONE DE MÊLÉE : ELLE S'ORIENTE VERS L'ADVERSAIRE");
{
  // Un joueur à l'est, un congénère à l'ouest. La ligne de trois doit partir
  // vers le joueur, jamais vers le congénère.
  let versJoueur = 0, versAllie = 0;
  for (let i = 0; i < 200; i++) {
    const w = monde({ zone: LIGNE3, portee: 1,
      tokens: { M1:{q:0,r:0}, J1:{q:2,r:0}, A1:{q:-2,r:0} },
      persos: [ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi'}),
                combattant({idPersonnage:'J1', camp:'Allié'}),
                combattant({idPersonnage:'A1', estMonstre:true, camp:'Ennemi'}) ] });
    const plan = w.placerZoneMonstre('M1');
    if (!plan) continue;
    if (touche(LIGNE3, plan, {q:2,r:0})) versJoueur++;
    if (touche(LIGNE3, plan, {q:-2,r:0})) versAllie++;
  }
  console.log(`     sur 200 poses : le joueur est pris ${versJoueur} fois, le congénère ${versAllie} fois`);
  verifier("la zone est orientée vers le joueur", versJoueur === 200, `(${versJoueur}/200)`);
  verifier("elle n'arrose jamais son congénère", versAllie === 0, `(${versAllie}/200)`);
  const w = monde({ zone: LIGNE3, portee: 1,
    tokens: { M1:{q:0,r:0}, J1:{q:2,r:0} },
    persos: [ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi'}), combattant({idPersonnage:'J1', camp:'Allié'}) ] });
  verifier("une zone de mêlée reste centrée sur la créature",
    JSON.stringify(w.placerZoneMonstre('M1').centre) === JSON.stringify({q:0,r:0}));
}

console.log("\n2. ZONE À DISTANCE : ELLE SE POSE SUR LE GROUPE");
{
  let deux = 0;
  for (let i = 0; i < 200; i++) {
    // Trois joueurs serrés à l'est, un isolé au sud : la zone doit couvrir le paquet.
    const w = monde({ zone: PATE, portee: 6,
      tokens: { M1:{q:0,r:0}, J1:{q:4,r:0}, J2:{q:5,r:-1}, J3:{q:0,r:5} },
      persos: [ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi'}),
                combattant({idPersonnage:'J1', camp:'Allié'}),
                combattant({idPersonnage:'J2', camp:'Allié'}),
                combattant({idPersonnage:'J3', camp:'Allié'}) ] });
    const plan = w.placerZoneMonstre('M1');
    if (!plan) continue;
    const pris = [{q:4,r:0},{q:5,r:-1},{q:0,r:5}].filter(t => touche(PATE, plan, t)).length;
    if (pris >= 2) deux++;
  }
  console.log(`     sur 200 poses : ${deux} fois deux joueurs ou plus dans l'emprise`);
  verifier("elle attrape le groupe plutôt qu'un isolé", deux === 200, `(${deux}/200)`);
}

console.log("\n3. LES RÈGLES DU CIBLAGE SONT RESPECTÉES");
{
  // Portée : l'ancre ne dépasse jamais rangeMax.
  let horsPortee = 0;
  for (let i = 0; i < 100; i++) {
    const w = monde({ zone: PATE, portee: 3,
      tokens: { M1:{q:0,r:0}, J1:{q:9,r:0} },
      persos: [ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi'}), combattant({idPersonnage:'J1', camp:'Allié'}) ] });
    const plan = w.placerZoneMonstre('M1');
    if (plan && dist({q:0,r:0}, plan.centre) > 3) horsPortee++;
  }
  verifier("l'ancre reste dans la portée de la carte", horsPortee === 0, `(${horsPortee}/100)`);

  // Engagement : au contact, on ne pose plus qu'à une case.
  let tropLoin = 0;
  for (let i = 0; i < 100; i++) {
    const w = monde({ zone: PATE, portee: 6,
      tokens: { M1:{q:0,r:0}, J1:{q:1,r:0}, J2:{q:5,r:0} },
      persos: [ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi'}),
                combattant({idPersonnage:'J1', camp:'Allié'}), combattant({idPersonnage:'J2', camp:'Allié'}) ] });
    const plan = w.placerZoneMonstre('M1');
    if (plan && dist({q:0,r:0}, plan.centre) > 1) tropLoin++;
  }
  verifier("au corps-à-corps, elle ne vise plus au loin", tropLoin === 0, `(${tropLoin}/100)`);

  // Ligne de vue : un mur interdit de poser derrière.
  let derriereLeMur = 0;
  for (let i = 0; i < 100; i++) {
    const w = monde({ zone: PATE, portee: 6, murs: [{q:2,r:0},{q:2,r:-1},{q:2,r:1}],
      tokens: { M1:{q:0,r:0}, J1:{q:5,r:0} },
      persos: [ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi'}), combattant({idPersonnage:'J1', camp:'Allié'}) ] });
    const plan = w.placerZoneMonstre('M1');
    if (plan && plan.centre.q > 2) derriereLeMur++;
  }
  verifier("elle ne pose pas une zone derrière un mur", derriereLeMur === 0, `(${derriereLeMur}/100)`);
}

console.log("\n4. ZONE DE SOIN : ELLE VA SUR LES BLESSÉS DU CAMP");
{
  let surLeBlesse = 0, surLeJoueur = 0;
  for (let i = 0; i < 200; i++) {
    const w = monde({ zone: PATE, portee: 5, soigne: true,
      tokens: { M1:{q:0,r:0}, A1:{q:3,r:0}, A2:{q:-3,r:0}, J1:{q:0,r:3} },
      persos: [ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi'}),
                combattant({idPersonnage:'A1', estMonstre:true, camp:'Ennemi', PV_Max:100, PV_Actuels:12}),
                combattant({idPersonnage:'A2', estMonstre:true, camp:'Ennemi', PV_Max:100, PV_Actuels:100}),
                combattant({idPersonnage:'J1', camp:'Allié'}) ] });
    const plan = w.placerZoneMonstre('M1');
    if (!plan) continue;
    if (touche(PATE, plan, {q:3,r:0})) surLeBlesse++;
    if (touche(PATE, plan, {q:0,r:3})) surLeJoueur++;
  }
  console.log(`     sur 200 poses : le blessé est couvert ${surLeBlesse} fois, le joueur ${surLeJoueur} fois`);
  verifier("le soin de zone couvre le congénère blessé", surLeBlesse === 200, `(${surLeBlesse}/200)`);
  verifier("il ne se pose pas sur l'adversaire", surLeJoueur === 0, `(${surLeJoueur}/200)`);
}

console.log("\n5. TOUR COMPLET : LA ZONE EST BIEN VALIDÉE, PAS JUSTE 'RÉSOLUE'");
{
  const CARTE_ZONE = { Nom:"Déferlante", Fatigue:30, Initiative:60, Composants:{ actions:[
    { baseEffetId:"EFF_ATTAQUE_LOURDE", count:5, mods:{ EFF_ZONE:3 }, zoneHexes: LIGNE3, baseDuree:0, modsDuree:{} }] } };

  const w = activer(chargerIA({ plateau: creerPlateau(),
    tokens:{ M1:{q:0,r:0}, J1:{q:1,r:0} },
    persos:[ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi', Personnalite:'brutal',
                         prenom:'Gnoll', fatigueActuelle:120, deckEquipe:['C1'] }),
             combattant({idPersonnage:'J1', camp:'Allié', prenom:'Jade'}) ],
    competences:{ M1:{ C1: CARTE_ZONE } } }));
  w.rotateHexVTT = rotateHex;
  w.verifierLigneDeVueVTT = () => true;

  const journal = [];
  w.afficherDansPanneauGauche = () => {}; w.centrerMapSurToken = () => {};
  w.afficherMessageFlottantHex = (q,r,t) => journal.push("message:"+t);
  w.annulerMouvement = () => { w.CHEMIN_MOUVEMENT = []; };
  w.ajouterEtapeMouvement = () => {};
  w.validerMouvement = async () => {};
  w.actualiserVisuelCiblage = () => journal.push("apercu");
  w.demarrerCiblage = async () => {
    // Ce que fait le moteur pour une zone de mêlée : l'emprise brute est prête,
    // l'ancre est posée sur le lanceur, le reste appartient au joueur.
    w.ETAT_CIBLAGE = { actif:true, isZone:true, zoneHexesBase: LIGNE3, zoneRotationStep:0,
      zoneCenterHex:{q:0,r:0},
      attaques:[{ isRanged:false, rangeMax:1, isHeal:false, isShield:false, cibles:[] }], alterations:[] };
    journal.push("ciblage");
  };
  w.validerZoneAoE = () => {
    const st = w.ETAT_CIBLAGE;
    const hexes = emprise(LIGNE3, { centre: st.zoneCenterHex, rotation: st.zoneRotationStep });
    const pris = Object.keys(w.TOKENS_VTT_DATA).filter(id => id !== 'M1' &&
      hexes.some(h => h.q === w.TOKENS_VTT_DATA[id].q && h.r === w.TOKENS_VTT_DATA[id].r));
    journal.push("zoneValidee:" + (pris.join(",") || "personne"));
  };
  w.declencherResolution = async () => journal.push("resolutionNue");
  w.ajouterCibleCiblage = (id) => journal.push("cible:"+id);
  w.finDeTourCombat = async () => journal.push("finDeTour");

  await w.jouerTourMonstre('M1','C1');
  console.log("   séquence :", journal.join(" → "));
  verifier("la zone passe par sa validation", journal.some(e => e.startsWith("zoneValidee:")));
  verifier("elle attrape bien le joueur", journal.includes("zoneValidee:J1"),
           `(${journal.find(e => e.startsWith("zoneValidee:")) || "rien"})`);
  verifier("on ne résout plus une zone sans cible", !journal.includes("resolutionNue"));
  verifier("le tour se termine", journal[journal.length-1] === "finDeTour");
}

console.log("\n6. SE PLACER POUR QUE LA ZONE RAMASSE DU MONDE");
{
  // Zone de mêlée en pâté : centrée sur la créature, c'est SA case qui décide.
  // Deux joueurs collés à l'est, un joueur isolé plus PRÈS au sud : la créature
  // doit préférer la case qui prend les deux, et non foncer sur le plus proche.
  const CARTE = { Nom:"Balayage", Fatigue:20, Initiative:60, Composants:{ actions:[
    { baseEffetId:"EFF_ATTAQUE_LOURDE", count:4, mods:{ EFF_ZONE:3 }, zoneHexes: PATE, baseDuree:0, modsDuree:{} }] } };

  let deuxJoueurs = 0, essais = 0;
  for (let i = 0; i < 200; i++) {
    const w = activer(chargerIA({ plateau: creerPlateau(),
      tokens:{ M1:{q:0,r:0}, J1:{q:3,r:0}, J2:{q:3,r:-1}, J3:{q:0,r:2} },
      persos:[ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi', Personnalite:'brutal', fatigueActuelle:120}),
               combattant({idPersonnage:'J1', camp:'Allié'}),
               combattant({idPersonnage:'J2', camp:'Allié'}),
               combattant({idPersonnage:'J3', camp:'Allié'}) ] }));
    w.rotateHexVTT = rotateHex;
    const infos = w.analyserCarteMonstre(CARTE);
    const cible = w.choisirCibleMonstre(w.PERSOS_PARTIE[0], infos);
    const pos = w.choisirPositionMonstre(w.PERSOS_PARTIE[0], cible, infos);
    if (!pos) continue;
    essais++;
    // Depuis cette case, combien de joueurs la meilleure orientation prendrait-elle ?
    let maxPris = 0;
    for (let rot = 0; rot < 6; rot++) {
      const pris = [{q:3,r:0},{q:3,r:-1},{q:0,r:2}].filter(t => touche(PATE, { centre: pos, rotation: rot }, t)).length;
      if (pris > maxPris) maxPris = pris;
    }
    if (maxPris >= 2) deuxJoueurs++;
  }
  console.log(`     sur ${essais} déplacements : ${deuxJoueurs} fois une case qui prend deux joueurs`);
  verifier("elle se place pour ramasser deux joueurs", deuxJoueurs > essais * 0.9,
           `(${deuxJoueurs}/${essais})`);
  verifier("l'emprise brute de la carte est bien lue",
    JSON.stringify(chargerIA({ plateau: creerPlateau(), tokens:{}, persos:[] }).analyserCarteMonstre(CARTE).zoneHexes) === JSON.stringify(PATE));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
