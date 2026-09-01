import { chargerIA, creerPlateau, combattant, activer } from './banc_ia.mjs';
let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(56)} ${c?"OK":"ÉCHEC"} ${d}`); };
const CARTE = { Nom:"Coup", Fatigue:20, Initiative:80, Composants:{ actions:[{ baseEffetId:"EFF_ATTAQUE_LOURDE", count:3, mods:{}, zoneHexes:[], baseDuree:0, modsDuree:{} }] } };

function situation({ tokens, persos, plateau, zones }) {
  const w = activer(chargerIA({ plateau: plateau || creerPlateau(), tokens, persos, zones,
                                competences: { M1: { C1: CARTE } } }));
  return w;
}
const monstre = (o={}) => combattant({ idPersonnage:'M1', estMonstre:true, camp:'Ennemi',
  Personnalite:'brutal', fatigueActuelle:120, Fatigue_Max:120, deckEquipe:['C1'], ...o });

console.log("1. MONSTRE COMPLÈTEMENT EMMURÉ");
{
  // Six murs autour de la case de départ : aucune sortie possible.
  const murs = [{q:1,r:0},{q:1,r:-1},{q:0,r:-1},{q:-1,r:0},{q:-1,r:1},{q:0,r:1}];
  const w = situation({ plateau: creerPlateau({ murs }),
    tokens:{ M1:{q:0,r:0}, J1:{q:5,r:0} },
    persos:[ monstre(), combattant({idPersonnage:'J1',camp:'Allié'}) ] });
  const cases = w.casesAccessiblesMonstre('M1');
  const infos = w.analyserCarteMonstre(CARTE);
  const cible = w.choisirCibleMonstre(w.PERSOS_PARTIE[0], infos);
  const pos = w.choisirPositionMonstre(w.PERSOS_PARTIE[0], cible, infos);
  verifier("seule sa propre case est accessible", cases.length === 1 && cases[0].pas === 0, `(${cases.length})`);
  verifier("il choisit de rester sur place", !!pos && pos.pas === 0);
  verifier("aucune erreur levée", true);
}

console.log("\n2. PLUS AUCUNE CIBLE VIVANTE");
{
  const w = situation({ tokens:{ M1:{q:0,r:0}, J1:{q:2,r:0} },
    persos:[ monstre(), combattant({idPersonnage:'J1',camp:'Allié',PV_Actuels:0,statut:'Mort'}) ] });
  const infos = w.analyserCarteMonstre(CARTE);
  const cible = w.choisirCibleMonstre(w.PERSOS_PARTIE[0], infos);
  verifier("aucune cible retenue", cible === null);
  const pos = w.choisirPositionMonstre(w.PERSOS_PARTIE[0], cible, infos);
  verifier("il trouve quand même une position", pos !== null);
}

console.log("\n3. MONSTRE SANS PION SUR LA CARTE");
{
  const w = situation({ tokens:{ J1:{q:2,r:0} },
    persos:[ monstre(), combattant({idPersonnage:'J1',camp:'Allié'}) ] });
  const infos = w.analyserCarteMonstre(CARTE);
  verifier("aucune case accessible", w.casesAccessiblesMonstre('M1').length === 0);
  verifier("aucune cible (pas de repère spatial)", w.choisirCibleMonstre(w.PERSOS_PARTIE[0], infos) === null);
  verifier("aucune position, sans planter", w.choisirPositionMonstre(w.PERSOS_PARTIE[0], null, infos) === null);
}

console.log("\n4. CARTE VIDE OU ABÎMÉE");
{
  const w = situation({ tokens:{ M1:{q:0,r:0}, J1:{q:2,r:0} },
    persos:[ monstre(), combattant({idPersonnage:'J1',camp:'Allié'}) ] });
  [undefined, null, {}, { Composants:null }, { Composants:{actions:null} }, { Composants:{actions:[{baseEffetId:"INCONNU",count:1,mods:{}}]} }]
    .forEach((c, i) => {
      const infos = w.analyserCarteMonstre(c);
      const bon = infos && infos.portee >= 1 && !isNaN(infos.degats) && !isNaN(infos.fatigue);
      verifier(`carte abîmée n°${i+1} : lecture sans planter`, bon, bon ? "" : JSON.stringify(infos));
    });
}

console.log("\n5. ZONE PERSISTANTE MAL FORMÉE");
{
  const zones = { z1:{ id:"z1" }, z2:{ id:"z2", hexes:null }, z3:{ id:"z3", hexes:[{q:1,r:0}], degats:null },
                  z4:{ id:"z4", hexes:[{q:2,r:0}], degats:{ valeurBrute:"abc" } } };
  const w = situation({ zones, tokens:{ M1:{q:0,r:0}, J1:{q:3,r:0} },
    persos:[ monstre({Personnalite:'prudent'}), combattant({idPersonnage:'J1',camp:'Allié'}) ] });
  const infos = w.analyserCarteMonstre(CARTE);
  let planté = false;
  try { for (let i=0;i<50;i++) w.choisirPositionMonstre(w.PERSOS_PARTIE[0], w.choisirCibleMonstre(w.PERSOS_PARTIE[0], infos), infos); }
  catch(e) { planté = true; console.log("     erreur :", e.message); }
  verifier("zones incomplètes tolérées sans erreur", !planté);
}

console.log("\n6. VALEURS ABERRANTES SUR LE MONSTRE");
{
  const cas = [ { fatigueActuelle: undefined }, { fatigueActuelle: NaN }, { fatigueActuelle: -50 },
                { PV_Max: 0 }, { Etats_Alteres: null }, { Personnalite: "inconnue" }, { deckEquipe: null } ];
  cas.forEach((mod, i) => {
    const w = situation({ tokens:{ M1:{q:0,r:0}, J1:{q:2,r:0} },
      persos:[ monstre(mod), combattant({idPersonnage:'J1',camp:'Allié'}) ] });
    let ok = true;
    try {
      const infos = w.analyserCarteMonstre(CARTE);
      const cible = w.choisirCibleMonstre(w.PERSOS_PARTIE[0], infos);
      const pos = w.choisirPositionMonstre(w.PERSOS_PARTIE[0], cible, infos);
      const carte = w.choisirCarteMonstre(w.PERSOS_PARTIE[0]);
      if (pos && (isNaN(pos.q) || isNaN(pos.r))) ok = false;
      if (carte === undefined) ok = false;
    } catch(e) { ok = false; console.log("     erreur :", e.message); }
    verifier(`donnée aberrante n°${i+1} (${Object.keys(mod)[0]})`, ok);
  });
}

console.log("\n7. TERRAIN SATURÉ (aucune case libre autour)");
{
  // Le monstre est cerné par des alliés vivants : il ne peut aller nulle part.
  const voisins = [{q:1,r:0},{q:1,r:-1},{q:0,r:-1},{q:-1,r:0},{q:-1,r:1},{q:0,r:1}];
  const tokens = { M1:{q:0,r:0}, J1:{q:5,r:0} };
  const persos = [ monstre(), combattant({idPersonnage:'J1',camp:'Allié'}) ];
  voisins.forEach((v,i) => { tokens['A'+i] = v; persos.push(combattant({idPersonnage:'A'+i, estMonstre:true, camp:'Ennemi'})); });
  const w = situation({ tokens, persos });
  const infos = w.analyserCarteMonstre(CARTE);
  const pos = w.choisirPositionMonstre(w.PERSOS_PARTIE[0], w.choisirCibleMonstre(w.PERSOS_PARTIE[0], infos), infos);
  verifier("il reste sur place sans planter", !!pos && pos.pas === 0);
}

console.log(`\n${echecs === 0 ? "TOUS LES CONTRÔLES PASSENT" : echecs + " CONTRÔLE(S) EN ÉCHEC"}`);
