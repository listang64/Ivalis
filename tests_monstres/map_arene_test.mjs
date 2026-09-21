// LE BOUTON « RECHARGER MAP » DU MENU DEV DE COMBAT.
//
// Nico voulait pouvoir remettre en un clic la carte de test de l'arène — celle
// qu'il utilise pour ses combats d'essai — plutôt que l'ancienne carte du port.
// `chargerMapTest` écrit une URL Cloudinary EN DUR dans `Combat_VTT/<partie>` ;
// ce banc joue la VRAIE fonction devant un faux Firestore et vérifie que
// l'URL écrite est bien celle de l'arène, avec la bonne échelle et la bonne
// opacité de grille, et RIEN d'autre.
import fs from 'fs';

const src = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
const lignes = src.split('\n');
function fonctionCombat(marqueur) {
  const i = lignes.findIndex(l => l.startsWith(marqueur));
  if (i < 0) throw new Error("introuvable dans combat.js : " + marqueur);
  let j = i; for (let k = i + 1; k < lignes.length; k++) { if (lignes[k] === '};') { j = k; break; } }
  return lignes.slice(i, j + 1).join('\n');
}
const fnCharger = fonctionCombat('window.chargerMapTest = async function');

const URL_ARENE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1789076932/arene_s5qs3e.png";

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(200);

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const res = await p.evaluate(async ({ fnSrc }) => {
  const journal = { setDocs: [] };
  window.jouerSonClic = () => {};
  window.ID_PARTIE_COURANTE = "PARTIE_TEST";
  window.PLATEAU_VTT = { hexSize: 72, gridOpacity: 0.6 };

  // Le vrai chargerMapTest appelle setDoc(doc(db, ...), ...) : on lui fournit
  // exactement ces deux fonctions, sans rien reconstruire d'autre.
  window.doc = (...a) => ({ chemin: a.slice(1).join("/") });
  window.setDoc = async (ref, maj, opts) => { journal.setDocs.push({ chemin: ref.chemin, maj, opts }); };
  window.db = {};

  eval(fnSrc);
  await window.chargerMapTest();

  return { setDocs: journal.setDocs };
}, { fnSrc: fnCharger });

console.log("\n1. LE BOUTON ÉCRIT LA CARTE DE L'ARÈNE, ET RIEN D'AUTRE");
verifier("une seule écriture", res.setDocs.length === 1, JSON.stringify(res.setDocs));
const ecriture = res.setDocs[0] || {};
verifier("elle vise le document de combat de la partie en cours",
         ecriture.chemin === "Combat_VTT/PARTIE_TEST", ecriture.chemin);
verifier("L'URL EST CELLE DE L'ARÈNE", ecriture.maj && ecriture.maj.URL_Map === URL_ARENE,
         ecriture.maj && ecriture.maj.URL_Map);
verifier("plus l'ancienne carte du port", !(ecriture.maj && /IMG_2048_fhzyrz/.test(ecriture.maj.URL_Map)));
verifier("elle garde l'échelle de grille en cours", ecriture.maj && ecriture.maj.Taille_Hex === 72,
         String(ecriture.maj && ecriture.maj.Taille_Hex));
verifier("et l'opacité en cours", ecriture.maj && ecriture.maj.Opacite_Grille === 0.6,
         String(ecriture.maj && ecriture.maj.Opacite_Grille));
verifier("c'est une fusion, pas un remplacement du document", ecriture.opts && ecriture.opts.merge === true,
         JSON.stringify(ecriture.opts));

console.log(echecs === 0 ? "\n✅ Le bouton charge bien la carte de l'arène." : `\n❌ ${echecs} vérification(s) en échec.`);
await b.close();
process.exit(echecs === 0 ? 0 : 1);
