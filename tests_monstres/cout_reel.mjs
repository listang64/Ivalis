import fs from 'fs';
import { chargerGenerateur, genererCorpus, EFFETS } from './banc_reel.mjs';
const fenetre = chargerGenerateur();

const src = fs.readFileSync('/home/user/Ivalis/competences.js','utf-8');
const aux = src.slice(src.indexOf('function parseFrenchFloat'), src.indexOf('function formatterTexteEffet'))
          + src.slice(src.indexOf('function getActiveTags'), src.indexOf('function compilerEffetsTexte'));
const corps = src.slice(src.indexOf('{', src.indexOf('window.rafraichirForge = function() {')) + 1,
                        src.indexOf('    const caracs = window.forgeState.caracs || {};'));
const coutForge = eval(`(function(fs2){ ${aux} window.forgeState = fs2; ${corps} return { totalPC, initBonusNet }; })`);

const effetsBDD = Object.keys(EFFETS).map(id => ({ id, ...EFFETS[id] }));
const versForgeState = (d) => ({ effetsBDD, actions: d.Composants.actions.map(a => ({
  idInst:a.idInst, baseEffet: effetsBDD.find(e=>e.id===a.baseEffetId), count:a.count,
  mods:{...a.mods}, zoneHexes:a.zoneHexes||[], baseDuree:a.baseDuree||0, modsDuree:{...(a.modsDuree||{})} })) });

const corpus = await genererCorpus(fenetre, 30);
let n=0, ecartF=0, ecartI=0, ecartPC=0; const ex=[];
corpus.forEach(m => m.cartes.forEach(c => {
  n++;
  const { totalPC, initBonusNet } = coutForge(versForgeState(c.doc));
  const fF = Math.floor(totalPC*5), iF = Math.max(0, 100-fF) + initBonusNet;
  if (fF !== c.doc.Fatigue) { ecartF++; if(ex.length<4) ex.push(`fatigue ${c.doc.Fatigue} vs Forge ${fF} — ${c.doc.Nom}`); }
  if (iF !== c.doc.Initiative) { ecartI++; if(ex.length<4) ex.push(`init ${c.doc.Initiative} vs Forge ${iF}`); }
  if (Math.abs(totalPC - c.doc.Cout_PC) > 0.011) { ecartPC++; if(ex.length<4) ex.push(`PC ${c.doc.Cout_PC} vs Forge ${totalPC}`); }
}));
console.log(`${n} cartes recalculées avec le VRAI code de coût de la Forge et les VRAIS effets`);
console.log("  fatigue identique    :", ecartF===0?"OK":"ÉCHEC ("+ecartF+")");
console.log("  initiative identique :", ecartI===0?"OK":"ÉCHEC ("+ecartI+")");
console.log("  coût PC identique    :", ecartPC===0?"OK":"ÉCHEC ("+ecartPC+")");
ex.forEach(e=>console.log("   ",e));
