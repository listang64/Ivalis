// v359 — LA REFONTE DES CLASSES : LE PRÊTRE DE LA LUMIÈRE, NOUVELLE CLASSE JOUABLE.
// (Le détail : pretre_lumiere.mjs. Ici, ce qui le rend choisissable, ce qui revient du
// Chasseur de mages d'avant la v356, et la version.)
//
// Lancer : node tests_monstres/corrections_v359.mjs
import fs from 'fs';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lire = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8');
console.log("\n1. CHOISISSABLE, ET CE QUI REVIENT");
verifier("il sort des classes « bientôt » : il reste Chaman, Berzerker, Maudit",
         /CLASSES_BIENTOT = \["CLASSE_CHAMAN", "CLASSE_BERZERKER", "CLASSE_MAUDIT"\];/.test(lire("classes.js")));
verifier("ses paliers, ses deux techniques, sa fiche", /"Prêtre de la lumière": \[/.test(lire("app.js"))
         && /CLASSE_APPEL_LUMIERE: \{\s*Nom: "Appel de la lumière", classe: "Prêtre de la lumière"/.test(lire("app.js"))
         && /CLASSE_DESINTEGRATION: \{/.test(lire("app.js")) && /CLASSE_PRETRE_DE_LA_LUMIERE: \{/.test(lire("classes.js")));
verifier("la Maîtrise de la lumière et l'Appel reviennent dans le moteur (retirés en v356)",
         /lanceur\.atouts\.maitriseLumiere/.test(lire("moteur_pur.js")) && /action\.idCarte === "CLASSE_APPEL_LUMIERE"/.test(lire("moteur_pur.js"))
         && /maitriseLumiere: nombre\(race\.maitriseLumiere\)/.test(lire("combat_etat.js")));
verifier("le butin écarte les désintégrés (loot.js)", /!m\.sansButin/.test(lire("loot.js")));
verifier("version 359 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lire("trace_combat.js")) || [])[1]) >= 359
         && JSON.parse(lire("version.json")).version >= 359);
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
