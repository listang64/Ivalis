// Les descriptions écrites sur les cartes des monstres doivent être MOT POUR MOT
// celles que la Forge écrirait sur une carte de joueur, pour les mêmes effets et
// les mêmes empilements. C'est ce que Nico lit sur la bannière : un "2 % de
// chance de poussée" au lieu de "10 %" est un mensonge sur ce que fait la carte.
import fs from 'fs';
import { chargerGenerateur, genererCorpus, EFFETS } from './banc_reel.mjs';
const fenetre = chargerGenerateur();

// La VRAIE fonction de la Forge, extraite de competences.js.
const src = fs.readFileSync('/home/user/Ivalis/competences.js','utf-8');
const aux = src.slice(src.indexOf('function parseFrenchFloat'), src.indexOf('function getMaxStacks'));
const fn  = src.slice(src.indexOf('function formatterTexteEffet'), src.indexOf('function estIncompatibleAvecArme'));
const forge = eval(`(function(){ ${aux} ${fn} return formatterTexteEffet; })()`);

let echecs = 0, comparaisons = 0;
const exemples = [];

console.log("1. TOUS LES EFFETS DE LA BASE, DE 1 À 15 EXEMPLAIRES");
Object.values(EFFETS).forEach(effet => {
  for (let n = 1; n <= 15; n++) {
    const attendu = forge(effet, n);
    const obtenu = fenetre.texteEffetMonstre(effet, n);
    comparaisons++;
    if (attendu !== obtenu) {
      echecs++;
      if (exemples.length < 6) exemples.push(`${effet.Nom} ×${n}\n       Forge   : ${attendu}\n       monstre : ${obtenu}`);
    }
  }
});
console.log(`   ${comparaisons} comparaisons — ${echecs === 0 ? "identiques à la Forge" : echecs + " écart(s)"}`);
exemples.forEach(e => console.log("     " + e));

console.log("\n2. LES DEUX EFFETS À POURCENTAGE *ET* VALEUR (le piège)");
[["EFF_POUSSEE", "Poussée"], ["EFF_TRACTION_MAGIQUE", "Traction magique"]].forEach(([id, nom]) => {
  const e = EFFETS[id];
  console.log(`   ${nom} (base ${e.Pourcent_Base}%, max ${e.Pourcent_Max}%, ${e.Valeur} hex)`);
  for (let n = 1; n <= 4; n++) console.log(`     ×${n} : ${fenetre.texteEffetMonstre(e, n)}`);
});

console.log("\n3. SUR DES CARTES RÉELLEMENT GÉNÉRÉES");
const corpus = await genererCorpus(fenetre, 8);
let cartes = 0, lignes = 0, faux = 0;
const suspects = [];
corpus.forEach(m => m.cartes.forEach(c => {
  cartes++;
  (c.doc.Effets_Compiles || []).forEach(ligne => {
    lignes++;
    // Un pourcentage affiché doit toujours être un multiple du pourcentage de
    // base de l'effet, et ne jamais descendre en dessous.
    const effet = Object.values(EFFETS).find(e => ligne.nom === e.Nom);
    if (!effet) return;
    const pBase = parseFloat(String(effet.Pourcent_Base).replace(',', '.')) || 0;
    const m1 = /(\d+(?:[.,]\d+)?)\s*%/.exec(ligne.desc || "");
    if (pBase > 0 && m1) {
      const affiche = parseFloat(m1[1].replace(',', '.'));
      if (affiche < pBase || affiche % pBase !== 0) {
        faux++;
        if (suspects.length < 5) suspects.push(`${ligne.nom} : "${ligne.desc}" (base ${pBase}%)`);
      }
    }
  });
}));
console.log(`   ${cartes} cartes, ${lignes} lignes de description — ${faux === 0 ? "aucun pourcentage aberrant" : faux + " aberration(s)"}`);
suspects.forEach(s => console.log("     " + s));

echecs += faux;
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
