// v362 — LA REFONTE DES CLASSES : LE MAUDIT (niveaux 1, 3, 5 ; la Possession : v363).
// (Le détail : maudit.mjs. Ici, ce qui le rend choisissable, la Magie du sang dans la Forge,
// le Vaudou dans fabriquerPas, la version.)
//
// Lancer : node tests_monstres/corrections_v362.mjs
import fs from 'fs';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lire = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8');
console.log("\n1. LE MAUDIT");
verifier("il sort des classes « bientôt » : il ne reste que le Chaman", /CLASSES_BIENTOT = \["CLASSE_CHAMAN"\];/.test(lire("classes.js")));
verifier("ses paliers, le Vaudou, sa fiche", /"Maudit": \[/.test(lire("app.js")) && /CLASSE_VAUDOU: \{/.test(lire("app.js")) && /CLASSE_MAUDIT: \{/.test(lire("classes.js")));
verifier("la Magie du sang : un effet de secours (0 point, Maudit niveau 3), une seule fois par action",
         /id: "EFF_MAGIE_DU_SANG", secoursLocal: true/.test(lire("app.js")) && /"Magie du sang"\]\.includes\(effet\.Nom\)\) return 1/.test(lire("competences.js")));
verifier("l'extraction : pas de surpuissance classique pour ses attaques offensives", /offensiveMaudit \? \(sangMaudit/.test(lire("moteur_effets.js")));
verifier("le Vaudou se reflète à chaque pas (fabriquerPas)", /refleterVaudou\(etatAvant, suivant, etapes\)/.test(lire("cerveau_combat.js")));
verifier("version 362 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lire("trace_combat.js")) || [])[1]) >= 362
         && JSON.parse(lire("version.json")).version >= 362);
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
