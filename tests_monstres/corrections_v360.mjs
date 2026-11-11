// v360 — LA REFONTE DES CLASSES : LE BERSERKER, NOUVELLE CLASSE JOUABLE (ex-« Berzerker »).
// (Le détail : berserker.mjs. Ici, le nom, ce qui le rend choisissable, les PV plafonnés, la version.)
//
// Lancer : node tests_monstres/corrections_v360.mjs
import fs from 'fs';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lire = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8');
console.log("\n1. LE NOM, LE CHOIX, LES PV");
verifier("« Berserker » dans la liste du jeu ; un document « Berzerker » se relit Berserker",
         /C\(16, "Berserker",/.test(lire("classes.js")) && /CLASSE_BERZERKER: \{ id: "CLASSE_BERSERKER", nom: "Berserker" \}/.test(lire("classes.js"))
         && /"berzerker": "Berserker"/.test(lire("app.js")));
verifier("il sort des classes « bientôt » : il reste Chaman et Maudit", /CLASSES_BIENTOT = \["CLASSE_CHAMAN"(, "CLASSE_MAUDIT")?\];/.test(lire("classes.js")));
verifier("ses paliers, sa technique, sa fiche", /"Berserker": \[/.test(lire("app.js")) && /CLASSE_REGENERATION_INSOLENTE: \{/.test(lire("app.js"))
         && /CLASSE_BERSERKER: \{/.test(lire("classes.js")));
verifier("en combat, les PV ne dépassent jamais le maximum", /pv: pvMax > 0 \? Math\.min\(nombre\(fiche\.PV_Actuels, pvMax\), pvMax\)/.test(lire("combat_etat.js")));
verifier("la Rage se surveille à chaque pas (fabriquerPas)", /etapes\.push\(\.\.\.surveillerRage\(suivant\)\)/.test(lire("cerveau_combat.js")));
verifier("version 360 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lire("trace_combat.js")) || [])[1]) >= 360
         && JSON.parse(lire("version.json")).version >= 360);
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
