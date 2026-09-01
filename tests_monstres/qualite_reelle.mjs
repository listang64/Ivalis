import { chargerGenerateur, genererCorpus, EFFETS, COMBOS } from './banc_reel.mjs';
const fenetre = chargerGenerateur();
const corpus = await genererCorpus(fenetre, 30);
const toutes = corpus.flatMap(m => m.cartes);
const pct = (n,d) => (100*n/d).toFixed(1)+"%";

let avecDoublon = 0;
corpus.forEach(m => { if (new Set(m.cartes.map(c=>c.signature)).size < m.cartes.length) avecDoublon++; });
console.log(`CORPUS RÉEL : ${corpus.length} monstres, ${toutes.length} cartes\n`);
console.log("VARIÉTÉ");
console.log(`  monstres avec 2 cartes identiques : ${pct(avecDoublon, corpus.length)}`);
const parCombo = {};
corpus.forEach(m => (parCombo[m.archetype+"/"+m.palier] ||= []).push(m.cartes.map(c=>c.signature).sort().join("§")));
let id=0,tot=0; Object.values(parCombo).forEach(j=>{for(let a=0;a<j.length;a++)for(let b=a+1;b<j.length;b++){tot++;if(j[a]===j[b])id++;}});
console.log(`  jeux identiques entre congénères  : ${pct(id,tot)}`);

const emp = toutes.flatMap(c=>c.effets.map(e=>e.count));
console.log(`\nEMPILEMENTS : moyen ${(emp.reduce((a,b)=>a+b,0)/emp.length).toFixed(2)}, max ${Math.max(...emp)}, ≥10 : ${pct(emp.filter(n=>n>=10).length, emp.length)}`);
const dist = toutes.map(c=>c.nbEffetsDistincts);
console.log(`RICHESSE    : ${(dist.reduce((a,b)=>a+b,0)/dist.length).toFixed(1)} effets distincts en moyenne (min ${Math.min(...dist)}, max ${Math.max(...dist)})`);
console.log(`              multi-actions ${pct(toutes.filter(c=>c.nbActions>1).length,toutes.length)}, avec durée ⏳ ${pct(toutes.filter(c=>c.nbDurees>0).length,toutes.length)}`);

console.log("\nUSAGE DE LA PALETTE RÉELLE");
const usage = {}; toutes.forEach(c=>new Set(c.effets.map(e=>e.nom)).forEach(n=>usage[n]=(usage[n]||0)+1));
Object.entries(usage).sort((a,b)=>b[1]-a[1]).forEach(([n,v])=>console.log(`  ${n.padEnd(26)} ${pct(v,toutes.length).padStart(6)}`));
const inutilises = Object.values(EFFETS).map(e=>e.Nom).filter(n=>!usage[n]);
console.log(inutilises.length ? `  JAMAIS UTILISÉS : ${inutilises.join(", ")}` : "  Toute la palette est utilisée.");

const z = toutes.filter(c=>c.tailleZone>0).map(c=>c.tailleZone);
const cz={}; z.forEach(t=>cz[t]=(cz[t]||0)+1);
console.log(`\nZONES : ${pct(z.length,toutes.length)} des cartes — ${Object.entries(cz).sort((a,b)=>a[0]-b[0]).map(([t,n])=>t+"hex×"+n).join(", ")}`);

console.log("\nPROGRESSION PAR TRANCHE");
for (let i=0;i<6;i++){
  const r = corpus.map(m=>m.cartes[i]).filter(Boolean);
  const moy = f => (r.reduce((s,c)=>s+f(c),0)/r.length).toFixed(1);
  console.log(`  t${i+1} : fatigue ${String(moy(c=>c.fatigue)).padStart(6)}  init ${String(moy(c=>c.initiative)).padStart(5)}  distincts ${moy(c=>c.nbEffetsDistincts)}  empil.max ${moy(c=>c.maxEmpilement)}`);
}
