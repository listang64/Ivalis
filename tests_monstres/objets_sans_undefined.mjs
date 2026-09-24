// UN OBJET DOIT POUVOIR S'ÉCRIRE DANS FIRESTORE.
// Firestore refuse tout document qui contient une valeur « undefined », où
// qu'elle soit : un seul champ vide fait échouer l'écriture ENTIÈRE. La réserve
// de butin préparée à l'avance (Combat_Butin/reserve_normale) tombait ainsi
// de temps en temps avec « Unsupported field value: undefined (found in …
// items[1].effets[0].buffSoi) » : un objet Très rare ou Épique qui tirait une
// bénédiction de soin recopiait aussi « buff », « buffSoi » et « chance »…
// vides. Ce banc fabrique des milliers d'objets de toutes raretés, sur tous
// les modèles du catalogue, et fouille chacun jusqu'au fond.
import fs from 'fs';
import vm from 'vm';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const window = {};
vm.runInNewContext(fs.readFileSync('/home/user/Ivalis/objets.js', 'utf-8'), { window, console, Math, JSON });

// Le premier chemin menant à une valeur undefined, ou null s'il n'y en a pas.
function cheminUndefined(v, chemin = "") {
  if (v === undefined) return chemin || "(racine)";
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      const r = cheminUndefined(x, chemin ? `${chemin}.${k}` : k);
      if (r) return r;
    }
  }
  return null;
}

console.log("\n1. Chaque modèle, à chaque rareté, plusieurs fois");
{
  let fabriques = 0, fautif = null, avecEffets = 0, avecBeni = 0;
  for (const modele of window.MODELES_OBJETS) {
    for (const rarete of window.RARETES) {
      for (let i = 0; i < 60; i++) {
        const o = window.fabriquerObjet(modele, rarete);
        fabriques++;
        if (o.effets.length) avecEffets++;
        if (o.effets.some(e => e.beniSoin)) avecBeni++;
        const r = cheminUndefined(o);
        if (r && !fautif) fautif = `${modele.modele} ${rarete} → ${r}`;
      }
    }
  }
  verifier("le banc fabrique bien des objets à effets spéciaux", avecEffets > 0, `(${avecEffets}/${fabriques})`);
  verifier("dont des bénédictions de soin (le cas qui cassait)", avecBeni > 0, `(${avecBeni})`);
  verifier("aucun objet ne contient de valeur undefined", !fautif, fautif || `(${fabriques} objets)`);
}

console.log("\n2. Les tirages du butin, à chaque difficulté");
{
  let fautif = null, n = 0;
  for (const diff of Object.keys(window.CHANCES_RARETE)) {
    for (let i = 0; i < 2000; i++) {
      const o = window.tirerObjetPourDifficulte(diff);
      n++;
      const r = cheminUndefined(o);
      if (r && !fautif) fautif = `${diff} → ${r}`;
    }
  }
  verifier("aucun objet tiré ne contient de valeur undefined", !fautif, fautif || `(${n} objets)`);
}

console.log("\n3. Ce qui existe est toujours recopié");
{
  let vu = { buff: false, beniSoin: false, chance: false };
  for (let i = 0; i < 3000; i++) {
    for (const m of window.MODELES_OBJETS) {
      const o = window.fabriquerObjet(m, "Épique");
      o.effets.forEach(e => {
        if (e.buff) vu.buff = vu.buff || (e.chance !== undefined);
        if (e.beniSoin) vu.beniSoin = vu.beniSoin || Object.keys(e.beniSoin).length > 0;
        if (e.chance !== undefined) vu.chance = true;
      });
    }
    if (vu.buff && vu.beniSoin && vu.chance) break;
  }
  verifier("un élan garde son buff ET sa chance", vu.buff);
  verifier("une bénédiction garde son contenu", vu.beniSoin);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
