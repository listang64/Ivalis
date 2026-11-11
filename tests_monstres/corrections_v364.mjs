// v364 — LA POSSESSION DU MAUDIT (niveau 9).
// (Le détail : possession.mjs. Ici, les points d'accroche dans le code et la version.)
//
// Lancer : node tests_monstres/corrections_v364.mjs
import fs from 'fs';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lire = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8');
console.log("\n1. LA POSSESSION");
verifier("la technique (niveau 9) et sa réserve de 80 bloqués", /niveau: 9,  techniques: \["CLASSE_POSSESSION"\]/.test(lire("app.js"))
         && /CLASSE_POSSESSION: \{ parTour: 80, tours: 3, nom: "Possession \(réserve\)", sansRelache: true \}/.test(lire("moteur_pur.js")));
verifier("le cerveau : le possédé attendu comme un héros, ses ordres reçus ; le Maudit inerte, sans tour",
         /acteur\.possedePar\) return null/.test(lire("cerveau_combat.js")) && /!acteur\.possedePar\)/.test(lire("cerveau_combat.js"))
         && /il est inerte/.test(lire("cerveau_combat.js")) && /!c\.possede;/.test(lire("cerveau_combat.js")));
verifier("la fin, à chaque pas (fabriquerPas)", /finirPossessions\(suivant\)/.test(lire("cerveau_combat.js")));
verifier("l'écran : sa liste, la préparation, le chemin, l'IA qui le laisse au joueur",
         /possedes = persos\.filter/.test(lire("combat.js")) && /p\.possede\) horsJeu\.add/.test(lire("combat.js"))
         && /window\.commandeParMoi\(persoSelectionne, monId\)/.test(lire("combat.js")) && /!m\.possedePar &&/.test(lire("monstres_ia.js")));
verifier("version 364 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lire("trace_combat.js")) || [])[1]) >= 364
         && JSON.parse(lire("version.json")).version >= 364);
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
