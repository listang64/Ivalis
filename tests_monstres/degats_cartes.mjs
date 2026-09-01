// Combien de dégâts bruts inflige réellement une carte de monstre ?
import { chargerGenerateur, genererCorpus, EFFETS } from './banc_reel.mjs';
const fenetre = chargerGenerateur();
const corpus = await genererCorpus(fenetre, 8);

const estAttaque = n => /attaque|mot de pouvoir|mots de pouvoir/i.test(n);
const estSoin = n => /^soin/i.test(n);

function degats(c) {
    let d = 0;
    c.doc.Composants.actions.forEach(a => {
        const e = EFFETS[a.baseEffetId];
        if (estAttaque(e.Nom)) d += (parseFloat(String(e.Valeur).replace(',','.')) || 0) * a.count;
        Object.keys(a.mods).forEach(id => {
            const m = EFFETS[id];
            if (estAttaque(m.Nom)) d += (parseFloat(String(m.Valeur).replace(',','.')) || 0) * a.mods[id];
        });
    });
    return d;
}
function soin(c) {
    let s = 0;
    c.doc.Composants.actions.forEach(a => {
        const e = EFFETS[a.baseEffetId];
        if (estSoin(e.Nom)) s += (parseFloat(String(e.Valeur).replace(',','.')) || 0) * a.count;
    });
    return s;
}

const toutes = corpus.flatMap(m => m.cartes.map(c => ({ ...c, deg: degats(c), soin: soin(c), arch: m.archetype, pal: m.palier })));
const moy = v => (v.reduce((a,b)=>a+b,0)/v.length).toFixed(1);

console.log(`${toutes.length} cartes\n`);
console.log("DÉGÂTS BRUTS PAR TRANCHE (toutes créatures)");
for (let i=0;i<6;i++){
  const r = corpus.map(m=>m.cartes[i]).filter(Boolean).map(c=>({f:c.fatigue,d:degats(c)}));
  const rentab = r.map(x=>x.d/Math.max(1,x.f));
  console.log(`  t${i+1} : fatigue ${moy(r.map(x=>x.f)).padStart(6)}  dégâts ${moy(r.map(x=>x.d)).padStart(5)}  dégâts/fatigue ${moy(rentab)}`);
}
console.log(`\ncartes à 0 dégât : ${(100*toutes.filter(c=>c.deg===0).length/toutes.length).toFixed(0)}%`);
console.log(`cartes à ≤4 dégâts (1 ou 2 empilements) : ${(100*toutes.filter(c=>c.deg<=4).length/toutes.length).toFixed(0)}%`);
console.log(`dégât max observé : ${Math.max(...toutes.map(c=>c.deg))}`);
console.log(`soin moyen des cartes de soutien : ${moy(toutes.filter(c=>c.soin>0).map(c=>c.soin))} (sur ${toutes.filter(c=>c.soin>0).length} cartes)`);

console.log("\nMEILLEURE CARTE DE CHAQUE PALIER (dégâts bruts max)");
["Petit","Normal","Élite","Boss"].forEach(p => {
  const r = toutes.filter(c=>c.pal===p);
  if (!r.length) return;
  console.log(`  ${p.padEnd(7)} max ${Math.max(...r.map(c=>c.deg))} dégâts, moyenne ${moy(r.map(c=>c.deg))}`);
});
console.log("\nPV des joueurs pour comparaison : ~42");

console.log("\nPAR CRÉATURE : sa meilleure carte fait-elle mal ?");
const parPalier = {};
corpus.forEach(m => {
    const degs = m.cartes.map(degats);
    const ref = 45 * fenetre.PART_PV_PAR_COUP[m.palier];   // le vrai plafond du générateur
    (parPalier[m.palier] ||= []).push({ max: Math.max(...degs), ref, nbFortes: degs.filter(d => d >= ref*0.7).length });
});
["Petit","Normal","Élite","Boss"].forEach(p => {
    const r = parPalier[p]; if (!r) return;
    const sansForte = r.filter(x => x.nbFortes === 0).length;
    console.log(`  ${p.padEnd(7)} plafond ${r[0].ref.toFixed(0)} dégâts — meilleure carte ${moy(r.map(x=>x.max))} en moyenne,`
      + ` ${moy(r.map(x=>x.nbFortes))} carte(s) proche(s) du plafond, ${(100*sansForte/r.length).toFixed(0)}% de créatures sans aucune grosse frappe`);
});
