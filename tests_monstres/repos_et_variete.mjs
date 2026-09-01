import { chargerIA, creerPlateau, combattant, activer } from './banc_ia.mjs';

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(54)} ${c?"OK":"ÉCHEC"} ${d}`); };

const carte = (nom, fatigue, portee, degats, soin) => ({
  Nom: nom, Fatigue: fatigue, Initiative: Math.max(0, 100 - fatigue),
  Composants: { actions: [{
    baseEffetId: soin ? "EFF_SOIN" : (portee > 1 ? "EFF_ATTAQUE_LEGERE" : "EFF_ATTAQUE_LOURDE"),
    count: degats, mods: portee > 1 ? { EFF_DISTANCE: portee - 1 } : {},
    zoneHexes: [], baseDuree: 0, modsDuree: {} }] }
});

// Un jeu de 6 cartes représentatif : léger → lourd, mêlée, distance, soin.
const DECK = {
  c1: carte("Griffure",   15, 1, 2, false),
  c2: carte("Morsure",    30, 1, 4, false),
  c3: carte("Crachat",    40, 3, 3, false),
  c4: carte("Rugissement",55, 1, 6, false),
  c5: carte("Souffle",    75, 4, 5, false),
  c6: carte("Régénère",   50, 1, 0, true)
};

function monde({ fatigue = 120, distance = 2, pvAllie = 100, personnalite = "brutal" } = {}) {
  const m = {
    plateau: creerPlateau(),
    tokens: { M1:{q:0,r:0}, M2:{q:1,r:0}, J1:{q:distance,r:0} },
    persos: [
      combattant({ idPersonnage:'M1', estMonstre:true, camp:'Ennemi', Personnalite:personnalite,
                   prenom:'Bête', fatigueActuelle:fatigue, Fatigue_Max:120, deckEquipe:Object.keys(DECK) }),
      combattant({ idPersonnage:'M2', estMonstre:true, camp:'Ennemi', Personnalite:'brutal',
                   PV_Actuels:pvAllie, Fatigue_Max:120 }),
      combattant({ idPersonnage:'J1', camp:'Allié' })
    ],
    competences: { M1: DECK }
  };
  const w = chargerIA(m);
  return { w, monstre: m.persos[0] };
}

console.log("1. REPOS LONG QUAND LA FATIGUE MANQUE");
{
  const { w, monstre } = monde({ fatigue: 10 });   // moins cher que la carte la moins chère (15)
  let repos = 0;
  for (let i = 0; i < 200; i++) { const c = w.choisirCarteMonstre(monstre); if (c && c.repos) repos++; }
  verifier("épuisé : il souffle systématiquement", repos === 200, `(${repos}/200)`);
}
{
  const { w, monstre } = monde({ fatigue: 120 });
  let repos = 0;
  for (let i = 0; i < 300; i++) { const c = w.choisirCarteMonstre(monstre); if (c && c.repos) repos++; }
  verifier("en pleine forme : il ne souffle jamais", repos === 0, `(${repos}/300)`);
}
{
  // Réserve basse (18 sur 120) mais une carte à 15 reste jouable : il hésite.
  const brut = monde({ fatigue: 18, personnalite: "brutal" });
  const prud = monde({ fatigue: 18, personnalite: "prudent" });
  const compter = (o) => { activer(o.w); let n=0; for (let i=0;i<400;i++){ const c=o.w.choisirCarteMonstre(o.monstre); if (c&&c.repos) n++; } return n; };
  const nBrut = compter(brut), nPrud = compter(prud);
  console.log(`     réserve basse : brutal souffle ${nBrut}/400, prudent ${nPrud}/400`);
  verifier("le prudent souffle plus volontiers que le brutal", nPrud > nBrut, `(${nPrud} vs ${nBrut})`);
  verifier("le brutal s'entête parfois quand même", nBrut < 300, `(${nBrut}/400)`);
}
{
  // Aucune compétence du tout : il ne doit JAMAIS rester muet (sinon le combat se fige).
  const { w, monstre } = monde({});
  monstre.deckEquipe = [];
  const c = w.choisirCarteMonstre(monstre);
  verifier("sans aucune carte, il souffle (jamais rien)", !!(c && c.repos));
}

console.log("\n2. VARIÉTÉ DES CARTES : PAS LA MÊME EN BOUCLE");
{
  const { w, monstre } = monde({ fatigue: 120, distance: 2 });
  const compte = {};
  for (let i = 0; i < 600; i++) {
    const c = w.choisirCarteMonstre(monstre);
    if (c) compte[c.data.Nom] = (compte[c.data.Nom]||0)+1;
  }
  const noms = Object.keys(compte);
  const plusFreq = Math.max(...Object.values(compte));
  console.log("     répartition :", Object.entries(compte).sort((a,b)=>b[1]-a[1]).map(([n,v])=>`${n} ${(100*v/600).toFixed(0)}%`).join("  "));
  verifier("au moins 3 cartes différentes sortent", noms.length >= 3, `(${noms.length})`);
  verifier("aucune carte ne monopolise plus de 70 %", plusFreq < 420, `(${(100*plusFreq/600).toFixed(0)}%)`);
}

console.log("\n3. LA CARTE EST ADAPTÉE À LA SITUATION");
{
  // Cible à 4 cases : une carte de mêlée est hors d'atteinte (3 pas + portée 1 = 4)... limite.
  // À 7 cases, seule la portée 4 peut aboutir.
  const { w, monstre } = monde({ fatigue: 120, distance: 7 });
  let portees = 0, melee = 0;
  for (let i = 0; i < 400; i++) {
    const c = w.choisirCarteMonstre(monstre);
    if (!c || c.repos) continue;
    const infos = w.analyserCarteMonstre(c.data);
    (infos.portee > 1) ? portees++ : melee++;
  }
  console.log(`     cible lointaine : cartes à distance ${portees}, cartes de mêlée ${melee}`);
  verifier("il privilégie nettement la portée sur cible lointaine", portees > melee, `(${portees} vs ${melee})`);
}
{
  // Allié en danger de mort : la carte de soin doit devenir attractive.
  const sain   = monde({ fatigue: 120, pvAllie: 100, personnalite: "prudent" });
  const blesse = monde({ fatigue: 120, pvAllie: 8,   personnalite: "prudent" });
  const compterSoin = (o) => { activer(o.w); let n=0; for(let i=0;i<400;i++){ const c=o.w.choisirCarteMonstre(o.monstre); if(c&&!c.repos&&o.w.analyserCarteMonstre(c.data).estSoin) n++; } return n; };
  const nSain = compterSoin(sain), nBlesse = compterSoin(blesse);
  console.log(`     soin choisi : allié intact ${nSain}/400, allié à 8 PV ${nBlesse}/400`);
  verifier("il ne soigne pas un allié en pleine forme", nSain < 40, `(${nSain}/400)`);
  verifier("il soigne quand un allié est au plus mal", nBlesse > nSain * 2, `(${nBlesse} vs ${nSain})`);
}
{
  // Fatigue moyenne : les cartes trop chères doivent disparaître du choix.
  const { w, monstre } = monde({ fatigue: 45 });
  let tropCher = 0;
  for (let i = 0; i < 400; i++) {
    const c = w.choisirCarteMonstre(monstre);
    if (c && !c.repos && (parseInt(c.data.Fatigue)||0) > 45) tropCher++;
  }
  verifier("jamais une carte au-dessus de sa fatigue", tropCher === 0, `(${tropCher})`);
}

console.log(`\n${echecs === 0 ? "TOUS LES CONTRÔLES PASSENT" : echecs + " CONTRÔLE(S) EN ÉCHEC"}`);
