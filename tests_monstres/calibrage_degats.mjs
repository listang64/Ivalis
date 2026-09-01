// A/B du plafond de puissance : combien de dégâts une frappe a-t-elle le droit
// d'infliger, et qu'est-ce que ça donne sur 40 combats complets ?
import { execFileSync } from 'child_process';
const reglages = {
  "actuel  (.30/.45/.60/.80)": { "Petit":0.30, "Normal":0.45, "Élite":0.60, "Boss":0.80 },
  "moyen   (.20/.30/.40/.55)": { "Petit":0.20, "Normal":0.30, "Élite":0.40, "Boss":0.55 },
  "sobre   (.15/.22/.30/.40)": { "Petit":0.15, "Normal":0.22, "Élite":0.30, "Boss":0.40 },
  "ancien  (aucune frappe)  ": null
};
for (const [nom, table] of Object.entries(reglages)) {
  const env = { ...process.env, PLAFOND_COUP: table ? JSON.stringify(table) : "OFF", N: "40" };
  const sortie = execFileSync('node', ['cent_combats.mjs'], { env, encoding: 'utf-8' });
  const l = s => (sortie.match(new RegExp(s + ".*")) || [""])[0].trim();
  console.log(`\n### ${nom}`);
  console.log("   " + l("victoire des joueurs"));
  console.log("   " + l("victoire des monstres"));
  console.log("   " + l("indécis"));
  console.log("   " + l("durée moyenne"));
  console.log("   " + l("dégâts par sort lancé"));
  console.log("   " + l("cartes différentes jouées"));
}
