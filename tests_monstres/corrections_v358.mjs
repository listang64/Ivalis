// v358 — LA REFONTE DES CLASSES : L'INQUISITEUR, NOUVELLE CLASSE JOUABLE.
// (Le détail : inquisiteur.mjs. Ici, ce qui le rend choisissable, et la version.)
//
// Lancer : node tests_monstres/corrections_v358.mjs
import fs from 'fs';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lire = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8');
console.log("\n1. CHOISISSABLE");
verifier("il n'est plus dans les classes « bientôt » ; Chaman, Berzerker et Maudit y restent (v359 : le Prêtre en sort aussi)",
         !/CLASSES_BIENTOT = \[[^\]]*CLASSE_INQUISITEUR/.test(lire("classes.js"))
         && /CLASSES_BIENTOT = \["CLASSE_CHAMAN", "CLASSE_BERZERKER", "CLASSE_MAUDIT"/.test(lire("classes.js")));
verifier("ses paliers (app.js), ses techniques, sa fiche (classes.js)", /"Inquisiteur": \[/.test(lire("app.js"))
         && /CLASSE_COMBUSTION: \{/.test(lire("app.js")) && /CLASSE_TERREUR_ARDENTE: \{/.test(lire("app.js")) && /CLASSE_INQUISITEUR: \{/.test(lire("classes.js")));
verifier("son immunité passe par le combat (combat_etat.js) et par toutes les chances d'état (chanceFaceA)",
         /immunisesA:/.test(lire("combat_etat.js")) && /export const chanceFaceA = \(c, nom, chance\) => immuniseA\(c, nom\) \? 0/.test(lire("moteur_pur.js")));
verifier("version 358 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lire("trace_combat.js")) || [])[1]) >= 358
         && JSON.parse(lire("version.json")).version >= 358);
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
