import { chargerIA, creerPlateau, combattant, EFFETS, activer } from './banc_ia.mjs';

const CARTE_CAC  = { Nom:"Charge", Fatigue:20, Initiative:80, Composants:{ actions:[{ baseEffetId:"EFF_ATTAQUE_LOURDE", count:3, mods:{}, zoneHexes:[], baseDuree:0, modsDuree:{} }] } };
const CARTE_TIR  = { Nom:"Trait",  Fatigue:20, Initiative:80, Composants:{ actions:[{ baseEffetId:"EFF_ATTAQUE_LEGERE", count:2, mods:{ EFF_DISTANCE:4 }, zoneHexes:[], baseDuree:0, modsDuree:{} }] } };
const CARTE_SOIN = { Nom:"Baume",  Fatigue:20, Initiative:80, Composants:{ actions:[{ baseEffetId:"EFF_SOIN", count:4, mods:{}, zoneHexes:[], baseDuree:0, modsDuree:{} }] } };

const ok = (b) => b ? "OK" : "ÉCHEC";
let echecs = 0;
const verifier = (label, condition, detail="") => { if (!condition) echecs++; console.log(`  ${label.padEnd(52)} ${ok(condition)} ${detail}`); };

// Construit une situation et renvoie la décision de l'IA.
function decider({ personnalite, carte, tokens, persos, zones, plateau }) {
  const monde = { plateau: plateau || creerPlateau(), tokens, persos, zones };
  const w = activer(chargerIA(monde));
  const monstre = persos.find(p => p.estMonstre);
  monstre.Personnalite = personnalite;
  const infos = w.analyserCarteMonstre(carte);
  const cible = w.choisirCibleMonstre(monstre, infos);
  const position = w.choisirPositionMonstre(monstre, cible, infos);
  return { w, infos, cible, position, monstre };
}

console.log("1. LECTURE DES CARTES");
{
  const w = chargerIA({ plateau: creerPlateau(), tokens:{}, persos:[] });
  const cac = w.analyserCarteMonstre(CARTE_CAC), tir = w.analyserCarteMonstre(CARTE_TIR), soin = w.analyserCarteMonstre(CARTE_SOIN);
  verifier("portée d'une carte de mêlée = 1", cac.portee === 1, `(${cac.portee})`);
  verifier("portée d'une carte à distance > 1", tir.portee > 1, `(${tir.portee})`);
  verifier("une carte de soin est reconnue", soin.estSoin === true);
  verifier("les dégâts sont comptés", cac.degats > 0, `(${cac.degats})`);
}

console.log("\n2. DÉPLACEMENT : JAMAIS PLUS DE 3 CASES");
{
  let maxPas = 0;
  for (let i = 0; i < 300; i++) {
    const d = decider({ personnalite:["brutal","prudent","sanguinaire","tacticien","opportuniste"][i%5], carte: CARTE_CAC,
      tokens:{ M1:{q:0,r:0}, J1:{q:8,r:0} },
      persos:[ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi'}), combattant({idPersonnage:'J1', camp:'Allié'}) ] });
    if (d.position) maxPas = Math.max(maxPas, d.position.pas);
  }
  verifier("aucun trajet de plus de 3 cases sur 300 tirages", maxPas <= 3, `(max ${maxPas})`);
}

console.log("\n3. MURS ET CASES SUPPRIMÉES");
{
  // Un mur complet sur la colonne q=1 : le monstre doit contourner, pas traverser.
  const murs = [-3,-2,-1,0,1,2,3].map(r => ({q:1, r}));
  let traverse = 0;
  for (let i = 0; i < 200; i++) {
    const d = decider({ personnalite:"brutal", carte: CARTE_CAC, plateau: creerPlateau({ murs }),
      tokens:{ M1:{q:0,r:0}, J1:{q:3,r:0} },
      persos:[ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi'}), combattant({idPersonnage:'J1', camp:'Allié'}) ] });
    if (d.position && d.position.chemin.some(s => s.q === 1 && Math.abs(s.r) <= 3)) traverse++;
    if (d.position && murs.some(m => m.q === d.position.q && m.r === d.position.r)) traverse++;
  }
  verifier("aucun passage à travers un mur sur 200 tirages", traverse === 0, `(${traverse} violations)`);
}

console.log("\n4. PERSONNALITÉS : LES ZONES PERSISTANTES");
{
  // Zone dangereuse entre le monstre et sa cible.
  const zones = { zp_test: { id:"zp_test", hexes:[{q:1,r:0},{q:2,r:0},{q:3,r:0}],
                            type:"feu", degats:{ valeurBrute: 8, typeRes:"Magique" }, dureeRestante: 3 } };
  const estDansZone = (q, r) => zones.zp_test.hexes.some(h => h.q === q && h.r === r);
  const compter = (perso) => {
    let dansZone = 0;
    for (let i = 0; i < 200; i++) {
      const d = decider({ personnalite: perso, carte: CARTE_CAC, zones,
        tokens:{ M1:{q:0,r:0}, J1:{q:4,r:0} },
        persos:[ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi'}), combattant({idPersonnage:'J1', camp:'Allié'}) ] });
      if (d.position && estDansZone(d.position.q, d.position.r)) dansZone++;
    }
    return dansZone;
  };
  const prudent = compter("prudent"), brutal = compter("brutal");
  console.log(`     prudent s'arrête dans la zone : ${prudent}/200   brutal : ${brutal}/200`);
  verifier("le prudent reste hors des zones la plupart du temps", prudent < 40, `(${prudent}/200)`);
  verifier("le brutal, lui, y va sans hésiter", brutal > 150, `(${brutal}/200)`);
}

console.log("\n5. CHOIX DE CIBLE : ACHEVER LE BLESSÉ");
{
  const compter = (perso) => {
    let faible = 0;
    for (let i = 0; i < 300; i++) {
      const d = decider({ personnalite: perso, carte: CARTE_CAC,
        tokens:{ M1:{q:0,r:0}, J1:{q:2,r:0}, J2:{q:0,r:2} },
        persos:[ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi'}),
                 combattant({idPersonnage:'J1', camp:'Allié', PV_Actuels:100}),
                 combattant({idPersonnage:'J2', camp:'Allié', PV_Actuels:12}) ] });
      if (d.cible && d.cible.idPersonnage === 'J2') faible++;
    }
    return faible;
  };
  const sang = compter("sanguinaire"), brut = compter("brutal");
  console.log(`     sanguinaire vise le blessé : ${sang}/300   brutal : ${brut}/300`);
  verifier("le sanguinaire achève les blessés plus souvent", sang > brut, `(${sang} vs ${brut})`);
  verifier("le sanguinaire vise le blessé en majorité", sang > 150, `(${sang}/300)`);
}

console.log("\n6. LE TIREUR SE DÉGAGE DU CORPS-À-CORPS");
{
  let sorti = 0, reste = 0;
  for (let i = 0; i < 200; i++) {
    // Monstre à distance, collé à un joueur.
    const d = decider({ personnalite:"prudent", carte: CARTE_TIR,
      tokens:{ M1:{q:0,r:0}, J1:{q:1,r:0} },
      persos:[ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi'}), combattant({idPersonnage:'J1', camp:'Allié'}) ] });
    if (!d.position) continue;
    const dist = Math.max(Math.abs(d.position.q-1), Math.abs(d.position.r), Math.abs((-d.position.q-d.position.r)-(-1)));
    (dist > 1) ? sorti++ : reste++;
  }
  console.log(`     s'éloigne : ${sorti}/200   reste au contact : ${reste}/200`);
  verifier("le tireur prudent quitte le corps-à-corps", sorti > reste, `(${sorti} vs ${reste})`);
}
{
  let reste = 0;
  for (let i = 0; i < 200; i++) {
    const d = decider({ personnalite:"brutal", carte: CARTE_CAC,
      tokens:{ M1:{q:0,r:0}, J1:{q:1,r:0} },
      persos:[ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi'}), combattant({idPersonnage:'J1', camp:'Allié'}) ] });
    if (!d.position) continue;
    const dist = Math.max(Math.abs(d.position.q-1), Math.abs(d.position.r), Math.abs((-d.position.q-d.position.r)-(-1)));
    if (dist <= 1) reste++;
  }
  console.log(`     le bagarreur reste au contact : ${reste}/200`);
  verifier("le combattant de mêlée reste au contact", reste > 150, `(${reste}/200)`);
}

console.log("\n7. FATIGUE : LE DÉPLACEMENT NE MANGE PAS LA CARTE");
{
  let violations = 0;
  for (let i = 0; i < 300; i++) {
    // 26 de fatigue, carte à 20 : il ne reste que 6, soit 3 cases au plus.
    const d = decider({ personnalite:"brutal", carte: CARTE_CAC,
      tokens:{ M1:{q:0,r:0}, J1:{q:9,r:0} },
      persos:[ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi', fatigueActuelle:26}),
               combattant({idPersonnage:'J1', camp:'Allié'}) ] });
    if (d.position && d.position.pas * 2 > 6) violations++;
  }
  verifier("jamais plus de fatigue que le reliquat après la carte", violations === 0, `(${violations})`);
}

console.log("\n8. LE SOIN VA AU BLESSÉ, PAS À L'ENNEMI");
{
  let bonnesCibles = 0;
  for (let i = 0; i < 200; i++) {
    const d = decider({ personnalite:"prudent", carte: CARTE_SOIN,
      tokens:{ M1:{q:0,r:0}, M2:{q:1,r:0}, J1:{q:2,r:0} },
      persos:[ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi'}),
               combattant({idPersonnage:'M2', estMonstre:true, camp:'Ennemi', PV_Actuels:20}),
               combattant({idPersonnage:'J1', camp:'Allié', PV_Actuels:15}) ] });
    if (d.cible && d.cible.camp === 'Ennemi') bonnesCibles++;
  }
  verifier("le soin ne cible jamais le camp adverse", bonnesCibles === 200, `(${bonnesCibles}/200)`);
}

console.log("\n9. LES CADAVRES NE SONT PAS CIBLÉS");
{
  let cibleMort = 0;
  for (let i = 0; i < 200; i++) {
    const d = decider({ personnalite:"sanguinaire", carte: CARTE_CAC,
      tokens:{ M1:{q:0,r:0}, J1:{q:1,r:0}, J2:{q:2,r:0} },
      persos:[ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi'}),
               combattant({idPersonnage:'J1', camp:'Allié', PV_Actuels:0, statut:'Mort'}),
               combattant({idPersonnage:'J2', camp:'Allié', PV_Actuels:60}) ] });
    if (d.cible && d.cible.idPersonnage === 'J1') cibleMort++;
  }
  verifier("un combattant à terre n'est jamais ciblé", cibleMort === 0, `(${cibleMort})`);
}

console.log("\n10. ANTI-AGGLUTINEMENT");
{
  const compter = (perso) => {
    let colles = 0;
    for (let i = 0; i < 200; i++) {
      // Trois monstres déjà massés autour du joueur.
      const d = decider({ personnalite: perso, carte: CARTE_CAC,
        tokens:{ M1:{q:0,r:0}, A1:{q:3,r:0}, A2:{q:4,r:-1}, A3:{q:4,r:0}, J1:{q:4,r:1} },
        persos:[ combattant({idPersonnage:'M1', estMonstre:true, camp:'Ennemi'}),
                 combattant({idPersonnage:'A1', estMonstre:true, camp:'Ennemi'}),
                 combattant({idPersonnage:'A2', estMonstre:true, camp:'Ennemi'}),
                 combattant({idPersonnage:'A3', estMonstre:true, camp:'Ennemi'}),
                 combattant({idPersonnage:'J1', camp:'Allié'}) ] });
      if (!d.position) continue;
      const voisins = [{q:3,r:0},{q:4,r:-1},{q:4,r:0}].filter(a =>
        Math.max(Math.abs(d.position.q-a.q), Math.abs(d.position.r-a.r), Math.abs((-d.position.q-d.position.r)-(-a.q-a.r))) <= 1).length;
      if (voisins >= 2) colles++;
    }
    return colles;
  };
  const tact = compter("tacticien"), brut = compter("brutal");
  console.log(`     tacticien se colle aux siens : ${tact}/200   brutal : ${brut}/200`);
  verifier("le tacticien s'agglutine moins que le brutal", tact <= brut, `(${tact} vs ${brut})`);
}

console.log(`\n${echecs === 0 ? "TOUS LES CONTRÔLES PASSENT" : echecs + " CONTRÔLE(S) EN ÉCHEC"}`);
