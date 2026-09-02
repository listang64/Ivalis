// QUI OCCUPE UNE CASE ?
// "Case occupée" s'affichait sur une case visiblement vide : le décompte
// comptait aussi les pions dont le combattant n'existe plus (fiche supprimée,
// monstre effacé). Ces pions ne sont plus dessinés depuis, mais ils barraient
// encore la route — et l'outil de déplacement libre du MJ, lui, comptait même
// les morts.
import fs from 'fs';

const src = fs.readFileSync('/home/user/Ivalis/combat.js','utf-8');
function fonction(marqueur) {
  const lignes = src.split('\n');
  const d = lignes.findIndex(l => l.startsWith(marqueur));
  if (d < 0) throw new Error("introuvable : " + marqueur);
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === '};') { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}

const w = {};
global.window = w;
new Function('window', fonction('window.estCombattantMort = function') + '\n'
                     + fonction('window.caseOccupeeParVivant = function'))(w);

w.PERSOS_PARTIE = [
  { idPersonnage:"J1", prenom:"Pliors", PV_Max:42, PV_Actuels:30, statut:"Vivant" },
  { idPersonnage:"J2", prenom:"Jade",   PV_Max:42, PV_Actuels:0,  statut:"Mort" }
];
w.TOKENS_VTT_DATA = {
  J1: { q:0, r:0 },          // bien vivant
  J2: { q:1, r:0 },          // à terre : son pion a disparu du plateau
  PERSO_EFFACE: { q:2, r:0 } // fiche supprimée : pion fantôme
};

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c?"OK":"ÉCHEC"} ${d}`); };

console.log("OCCUPATION DES CASES");
verifier("une case vide est libre", w.caseOccupeeParVivant(5, 5) === false);
verifier("un combattant debout occupe sa case", w.caseOccupeeParVivant(0, 0) === true);
verifier("un combattant à terre laisse la place", w.caseOccupeeParVivant(1, 0) === false);
verifier("un pion fantôme ne barre plus la route", w.caseOccupeeParVivant(2, 0) === false);

console.log("\nAVEC UNE CARTE DE PIONS FOURNIE À PART");
verifier("la règle vaut aussi sur une carte passée en argument",
  w.caseOccupeeParVivant(2, 0, { PERSO_EFFACE:{q:2,r:0} }) === false);
verifier("et le vivant y occupe toujours sa case",
  w.caseOccupeeParVivant(0, 0, { J1:{q:0,r:0} }) === true);

console.log("\nL'OUTIL DE DÉPLACEMENT LIBRE UTILISE BIEN CETTE RÈGLE");
{
  const libre = src.includes("const isOccupied = window.caseOccupeeParVivant(hex.q, hex.r);");
  verifier("plus de décompte maison dans le mode déplacement", libre);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
