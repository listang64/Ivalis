import { chargerGenerateur, genererCorpus } from './banc_reel.mjs';
const fenetre = chargerGenerateur();
const corpus = await genererCorpus(fenetre, 40);
const pct = (n,d) => (100*n/d).toFixed(1)+"%";
const NATURE = (c) => {
  const noms = c.effets.map(e => e.nom.toLowerCase()); const a = s => noms.some(n => n.includes(s));
  if (c.tailleZone > 0 && a("persistance")) return "terrain persistant";
  if (c.tailleZone > 0) return "zone";
  if (a("étalement")) return "dégâts étalés";
  if (a("soin")||a("bouclier")||a("purification")||a("absorption")||a("contre")) return "soutien";
  if (a("brûl")||a("glac")||a("électri")||a("poison")||a("confusion")||a("paralysie")) return "altération";
  if (a("poussée")||a("traction")||a("immobilisation")||a("étourdit")||a("peur")||a("provocations")||a("bond")) return "contrôle";
  return "attaque simple";
};

// A. Une même nature monopolise-t-elle le jeu d'un monstre ?
const distrib = {};
corpus.forEach(m => {
  const cpt = {}; m.cartes.forEach(c => cpt[NATURE(c)] = (cpt[NATURE(c)]||0)+1);
  const max = Math.max(...Object.values(cpt));
  distrib[max] = (distrib[max]||0)+1;
});
console.log("A. RÉPÉTITION MAXIMALE D'UNE MÊME NATURE CHEZ UN MONSTRE");
Object.keys(distrib).sort().forEach(k => console.log(`   ${k} carte(s) de la même nature au plus : ${pct(distrib[k], corpus.length)}`));

// B. Les cartes bon marché sont-elles assez simples ?
console.log("\nB. COMPLEXITÉ DE LA CARTE LA MOINS CHÈRE (tranche 1)");
const t1 = corpus.map(m => m.cartes[0]);
const avecAlteration = t1.filter(c => NATURE(c) === "altération").length;
const moyEffets = (t1.reduce((s,c)=>s+c.nbEffetsDistincts,0)/t1.length).toFixed(1);
console.log(`   ${moyEffets} effets distincts en moyenne, dont ${pct(avecAlteration,t1.length)} portant une altération`);
const rep = {}; t1.forEach(c => rep[c.nbEffetsDistincts] = (rep[c.nbEffetsDistincts]||0)+1);
Object.keys(rep).sort().forEach(k => console.log(`   ${k} effet(s) : ${pct(rep[k], t1.length)}`));

// C. Deux monstres de même espèce : à quel point leurs jeux diffèrent-ils ?
console.log("\nC. RECOUVREMENT ENTRE DEUX CONGÉNÈRES (mêmes archetype et palier)");
const parCombo = {};
corpus.forEach(m => (parCombo[m.archetype+"/"+m.palier] ||= []).push(m));
let sommeRec = 0, n = 0;
Object.values(parCombo).forEach(grp => {
  for (let i=0;i<grp.length-1;i++) {
    const a = new Set(grp[i].cartes.map(c=>c.signature)), b = grp[i+1].cartes.map(c=>c.signature);
    sommeRec += b.filter(s=>a.has(s)).length; n++;
  }
});
console.log(`   cartes identiques entre deux congénères : ${(sommeRec/n).toFixed(2)} sur 6 en moyenne`);
