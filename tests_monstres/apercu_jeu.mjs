import { chargerGenerateur, analyserCarte, EFFETS, GAB } from './banc_reel.mjs';
const f = chargerGenerateur();
const val = e => parseFloat(String(e.Valeur).replace(',','.'))||0;
const estAtt = n => /attaque|mot de pouvoir|mots de pouvoir/i.test(n);
for (const cle of ["DPS CAC/Normal", "SOUTIEN/Normal", "DPS MAGE DISTANCE/Boss"]) {
  const g = GAB[cle];
  const docs = await f.genererCompetencesMonstre({ nom:"Créature", archetype:g.Archetype, palier:g.Palier });
  console.log(`\n### ${cle}  (fatigue max ${g.Fatigue_Max}, plafond de frappe ${Math.round(45*f.PART_PV_PAR_COUP[g.Palier])} dégâts)`);
  docs.map(analyserCarte).forEach(c => {
    let deg = 0;
    c.doc.Composants.actions.forEach(a => { const e=EFFETS[a.baseEffetId]; if (estAtt(e.Nom)) deg += val(e)*a.count; });
    const effets = c.effets.map(e => `${e.nom}×${e.count}`).join(" + ");
    console.log(`  ⚡${String(c.fatigue).padStart(3)}  ${String(deg+' dgts').padStart(8)}  ${c.nom.padEnd(16)} ${effets}`);
  });
}
