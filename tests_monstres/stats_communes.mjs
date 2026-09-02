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

export const SRC_STATS_COMMUNES = [
  fonction('window.pvMaxCombattant = function'),
  fonction('window.fatigueMaxCombattant = function'),
  fonction('window.regenerationCombattant = function')
].join('\n\n');
