// Les trois lectures de stats mutualisées (base + retouche de la fiche) vivent
// dans app.js, chargé avant tout le reste sur la vraie page. Les bancs qui
// isolent une fonction du moteur doivent les fournir aussi — en reprenant le
// VRAI code, jamais une imitation : c'est justement leur arithmétique qu'on
// veut voir à l'œuvre.
import fs from 'fs';

const app = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8');
const lignes = app.split('\n');

function fonction(marqueur) {
  const d = lignes.findIndex(l => l.startsWith(marqueur));
  if (d === -1) throw new Error("Introuvable dans app.js : " + marqueur);
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === '};') { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}

// Un bloc continu : des lectures de stats jusqu'aux atouts de race, qui en font
// partie intégrante (une résistance, c'est la base, la retouche de la fiche ET
// l'avantage du peuple, additionnés d'un seul coup).
const debut = lignes.findIndex(l => l.startsWith('window.pvMaxCombattant = function'));
let fin = lignes.findIndex((l, i) => i > debut && l.startsWith('window.bonusPorteeMagique = function'));
for (let i = fin + 1; i < lignes.length; i++) { if (lignes[i] === '};') { fin = i; break; } }
if (debut < 0 || fin < 0) throw new Error("Bloc des stats communes introuvable dans app.js");

// La table des atouts vit juste avant les lectures : on la reprend aussi.
const debutTable = lignes.findIndex(l => l.startsWith('window.ATOUTS_RACES = {'));
export const SRC_STATS_COMMUNES = lignes.slice(Math.min(debut, debutTable), fin + 1).join('\n');
