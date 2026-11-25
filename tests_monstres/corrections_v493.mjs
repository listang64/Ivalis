// v493 — LES CHANCES DE BUTIN PAR FAMILLE (Nico) : 15 % une armure, 10 % un bouclier, 40 % une arme lourde ou légère,
// 20 % une arme à distance ou polyvalente, 15 % une bague (objets.js, FAMILLES_BUTIN, tirerFamilleButin, tirerObjetDeRarete).
// Lancer : node tests_monstres/corrections_v493.mjs
import fs from 'fs';
const window = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/objets.js', 'utf-8'))(window);
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(76)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

console.log("1. LA TABLE DE NICO");
const parts = Object.fromEntries(window.FAMILLES_BUTIN.map(f => [f.nom, f.part]));
verifier("armure 15, bouclier 10, arme de contact 40, arme à distance 20, bague 15 (total 100)",
  JSON.stringify(parts) === JSON.stringify({ armure: 15, bouclier: 10, "arme de contact": 40, "arme à distance": 20, bague: 15 }), JSON.stringify(parts));
const familleDe = (m) => window.FAMILLES_BUTIN.filter(f => f.est(m)).map(f => f.nom);
const sansFamille = window.MODELES_OBJETS.filter(m => familleDe(m).length !== 1).map(m => m.modele);
verifier("chaque modèle du catalogue est dans une seule famille", sansFamille.length === 0, sansFamille.join(", "));
verifier("…les javelots avec les armes à distance, les bagues à part, la lance courte avec les armes de contact",
  familleDe(window.MODELES_OBJETS.find(m => m.modele === "Javelots"))[0] === "arme à distance" && familleDe(window.MODELES_OBJETS.find(m => m.modele === "Bagues Soins"))[0] === "bague"
  && familleDe(window.MODELES_OBJETS.find(m => m.modele === "Lance courte"))[0] === "arme de contact");

console.log("\n2. UN GRAND TIRAGE (20 000 objets)");
const N = 20000, compte = {};
for (let i = 0; i < N; i++) { const o = window.tirerObjetDeRarete("Commun"); const m = window.MODELES_OBJETS.find(x => x.modele === o.modele); const f = familleDe(m)[0]; compte[f] = (compte[f] || 0) + 1; }
const pct = (f) => 100 * (compte[f] || 0) / N;
[["armure", 15], ["bouclier", 10], ["arme de contact", 40], ["arme à distance", 20], ["bague", 15]].forEach(([f, p]) =>
  verifier(`${f} : ${p} % (± 1,5)`, Math.abs(pct(f) - p) < 1.5, `${pct(f).toFixed(1)} %`));
const jet = (x) => window.tirerFamilleButin(window.MODELES_OBJETS, () => x).nom;
verifier("les bornes du dé : 0 → armure, 0,149 → armure, 0,15 → bouclier, 0,25 → contact, 0,65 → distance, 0,85 → bague, 0,999 → bague",
  jet(0) === "armure" && jet(0.149) === "armure" && jet(0.15) === "bouclier" && jet(0.25) === "arme de contact" && jet(0.65) === "arme à distance" && jet(0.85) === "bague" && jet(0.999) === "bague");
const sansBague = window.MODELES_OBJETS.filter(m => m.type !== "Magie");
verifier("une famille absente du catalogue est écartée (les autres gardent leurs proportions)", window.tirerFamilleButin(sansBague, () => 0.999).nom === "arme à distance");

console.log("\n3. LES VERSIONS");
const v = Number((fs.readFileSync('/home/user/Ivalis/trace_combat.js', 'utf-8').match(/VERSION_IVALIS = (\d+)/) || [])[1]);
verifier("version 493 ou plus", v >= 493 && JSON.parse(fs.readFileSync('/home/user/Ivalis/version.json', 'utf-8')).version >= 493, String(v));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
process.exit(echecs ? 1 : 0);
