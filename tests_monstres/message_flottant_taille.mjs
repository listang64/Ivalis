// LA TAILLE D'UN MESSAGE FLOTTANT ARRIVE VRAIMENT AU PIXEL.
//
// Repris de coup_critique.mjs (grande suppression de l'ancien moteur) : cette
// section ne testait pas jouerAnimationMoteur, mais afficherMessageFlottantHex
// (mouvement.js) directement — une fonction d'affichage toujours vivante sous
// le régime cerveau, sans rapport avec le moteur de résolution supprimé.
import fs from 'fs';

const mvt = fs.readFileSync('/home/user/Ivalis/mouvement.js', 'utf-8');
const lignesMvt = mvt.split('\n');
const dMsg = lignesMvt.findIndex(l => l.startsWith('window.afficherMessageFlottantHex = function'));
let fMsg = dMsg; for (let i = dMsg + 1; i < lignesMvt.length; i++) { if (lignesMvt[i] === '};') { fMsg = i; break; } }
const srcMessage = lignesMvt.slice(dMsg, fMsg + 1).join('\n');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

console.log("\n=========================================================");
console.log("  LA TAILLE D'UN MESSAGE FLOTTANT ARRIVE VRAIMENT AU PIXEL");
console.log("=========================================================");
{
  const styles = [];
  const w = { PLATEAU_VTT: { hexToPixel: () => ({ x: 0, y: 0 }) }, VTT_POS_X: 0, VTT_POS_Y: 0, VTT_SCALE: 1 };
  global.window = w;
  const conteneur = { appendChild: (e) => styles.push(e.style) };
  global.document = { getElementById: () => conteneur,
                      createElement: () => ({ style: {}, remove() {} }) };
  global.setTimeout = (fn) => fn && 0;
  new Function('window', srcMessage)(w);
  w.afficherMessageFlottantHex(0, 0, "Esquivé 💨", "#cccccc");
  w.afficherMessageFlottantHex(0, 0, "Critique !", "#ff2d2d", { taille: 30, eclat: true });
  // Un chiffre de dégâts, lui, s'envole à la taille du pion (Nico : « le
  // nombre de dégâts qui s'envole, sur tous les popups de dégâts ») : 60 % du
  // pion de 55 à l'échelle 1, jamais sous 18 px.
  w.afficherMessageFlottantHex(0, 0, "-12", "#ff4c4c");
  w.afficherMessageFlottantHex(0, 0, "-3", "#ff4c4c", { taillePion: 20 });
  verifier("un message ordinaire reste à 18px", styles[0].fontSize === "18px", `(${styles[0].fontSize})`);
  verifier("le critique sort à 30px", styles[1].fontSize === "30px", `(${styles[1].fontSize})`);
  verifier("avec un halo à sa couleur", (styles[1].textShadow || "").includes("#ff2d2d"));
  verifier("un chiffre de dégâts s'envole à la taille du pion (33px pour 55)", styles[2].fontSize === "33px", `(${styles[2].fontSize})`);
  verifier("…jamais sous 18px", styles[3].fontSize === "18px", `(${styles[3].fontSize})`);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
