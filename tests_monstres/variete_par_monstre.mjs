import { chargerGenerateur, genererCorpus, EFFETS } from './banc_reel.mjs';
const fenetre = chargerGenerateur();
const corpus = await genererCorpus(fenetre, 40);
const pct = (n,d) => (100*n/d).toFixed(1)+"%";

// Nature réelle d'une carte, lue dans ses effets (pas dans son patron déclaré).
const NATURE = (c) => {
  const noms = c.effets.map(e => e.nom.toLowerCase());
  const a = s => noms.some(n => n.includes(s));
  if (c.tailleZone > 0 && a("persistance")) return "terrain persistant";
  if (c.tailleZone > 0)                     return "zone";
  if (a("étalement"))                       return "dégâts étalés";
  if (a("soin")||a("bouclier")||a("purification")||a("absorption")||a("contre")) return "soutien";
  if (a("brûl")||a("glac")||a("électri")||a("poison")||a("confusion")||a("paralysie")) return "altération";
  if (a("poussée")||a("traction")||a("immobilisation")||a("étourdit")||a("peur")||a("provocations")||a("bond")) return "contrôle";
  return "attaque simple";
};
// Une carte "basique" = une attaque et rien d'autre de significatif.
const EST_BASIQUE = (c) => {
  const sansPortee = c.effets.filter(e => e.nom !== "Distance");
  return sansPortee.length === 1 && /attaque|mots de pouvoir/i.test(sansPortee[0].nom);
};

console.log(`${corpus.length} monstres, ${corpus.length*6} cartes\n`);

// 1. Combien de NATURES différentes dans le jeu d'un même monstre ?
const distrib = {};
let sommeNatures = 0, monstresPauvres = 0;
corpus.forEach(m => {
  const n = new Set(m.cartes.map(NATURE)).size;
  distrib[n] = (distrib[n]||0)+1; sommeNatures += n;
  if (n <= 2) monstresPauvres++;
});
console.log("1. NATURES DIFFÉRENTES PARMI LES 6 CARTES D'UN MONSTRE");
console.log(`   moyenne : ${(sommeNatures/corpus.length).toFixed(2)} natures différentes sur 6 cartes`);
Object.keys(distrib).sort().forEach(k => console.log(`   ${k} nature(s) différente(s) : ${pct(distrib[k], corpus.length)}`));
console.log(`   monstres à 2 natures ou moins (jeu monotone) : ${pct(monstresPauvres, corpus.length)}`);

// 2. Les cartes "6 attaques basiques" existent-elles ?
let basiquesTotal = 0, monstresTropBasiques = 0;
const distribBasiques = {};
corpus.forEach(m => {
  const nb = m.cartes.filter(EST_BASIQUE).length;
  basiquesTotal += nb; distribBasiques[nb] = (distribBasiques[nb]||0)+1;
  if (nb >= 3) monstresTropBasiques++;
});
console.log("\n2. CARTES « ATTAQUE BASIQUE » (une attaque et rien d'autre)");
console.log(`   part de ces cartes sur l'ensemble : ${pct(basiquesTotal, corpus.length*6)}`);
Object.keys(distribBasiques).sort().forEach(k => console.log(`   monstres en ayant ${k} : ${pct(distribBasiques[k], corpus.length)}`));
console.log(`   monstres avec 3 cartes basiques ou plus : ${pct(monstresTropBasiques, corpus.length)}`);

// 3. Les soutiens ont-ils aussi des attaques ?
console.log("\n3. ÉQUILIBRE ATTAQUE / SOUTIEN PAR ARCHÉTYPE");
const parArch = {};
corpus.forEach(m => (parArch[m.archetype] ||= []).push(m));
Object.entries(parArch).forEach(([arch, monstres]) => {
  let avecAttaque = 0, cartesSoutien = 0, total = 0, sansAucuneAttaque = 0;
  monstres.forEach(m => {
    let att = 0;
    m.cartes.forEach(c => {
      total++;
      const aAtt = c.effets.some(e => /attaque|mots de pouvoir/i.test(e.nom));
      if (aAtt) { avecAttaque++; att++; }
      if (NATURE(c) === "soutien") cartesSoutien++;
    });
    if (att === 0) sansAucuneAttaque++;
  });
  console.log(`   ${arch.padEnd(19)} cartes avec attaque ${pct(avecAttaque,total).padStart(6)}  cartes de soutien ${pct(cartesSoutien,total).padStart(6)}` +
              `  monstres sans AUCUNE attaque ${pct(sansAucuneAttaque, monstres.length)}`);
});

// 4. Répartition des natures, tous monstres confondus
console.log("\n4. RÉPARTITION DES NATURES DE CARTES");
const nat = {}; corpus.forEach(m => m.cartes.forEach(c => nat[NATURE(c)] = (nat[NATURE(c)]||0)+1));
Object.entries(nat).sort((a,b)=>b[1]-a[1]).forEach(([n,v]) => console.log(`   ${n.padEnd(20)} ${pct(v, corpus.length*6).padStart(6)}`));
