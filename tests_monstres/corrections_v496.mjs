// v496 — LA TABLE DES BLESSURES DE NICO (accordée au soin du camp) ET LES PLAIES OUVERTES.
//   · « X jours de repos au camp pour disparaître » : elles ne guérissent qu'au camp (Nico : les jours en expédition
//     ne comptent pas) ; la lèvre fendue, le coup au visage, la coupure fine guérissent n'importe où.
//   · Petite blessure ouverte (jets 2 à 5) : 25 % de saigner à chaque manche, 9 jours ; Blessure ouverte (faces 17 à 19
//     partagées) : 50 %, 18 jours ; Grande blessure ouverte (faces 26 et 27 partagées) : 75 %, 27 jours (Nico).
// Lancer : node tests_monstres/corrections_v496.mjs
import fs from 'fs';
import path from 'path';
const RACINE = '/home/user/Ivalis';
const window = {}; globalThis.window = window;
new Function('window', fs.readFileSync(path.join(RACINE, 'blessures.js'), 'utf-8'))(window);
const CP = await import(path.join(RACINE, 'camp_pur.js'));
const CERVEAU = await import(path.join(RACINE, 'cerveau_combat.js'));
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(80)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf-8');
const B = (id) => window.blessureParId(id);

console.log("1. LA TABLE (le tableau de Nico)");
const trous = []; for (let s = 1; s <= 50; s++) if (!window.blessuresDuScore(s).length) trous.push(s);
verifier("le d50 est couvert de 1 à 50", trous.length === 0, trous.join(","));
verifier("1 : l'égratignure seule ; 2 à 5 : la Petite blessure ouverte", window.blessuresDuScore(1)[0].id === "BLE_EGRATIGNURE" && [2, 3, 4, 5].every(s => window.blessuresDuScore(s).map(b => b.id).join() === "BLE_PETITE_PLAIE_OUVERTE"));
verifier("17, 18, 19 : partagées avec la Blessure ouverte (une pièce décide)", [17, 18, 19].every(s => { const l = window.blessuresDuScore(s).map(b => b.id); return l.length === 2 && l.includes("BLE_PLAIE_OUVERTE"); }));
verifier("26, 27 : partagées avec la Grande blessure ouverte", [26, 27].every(s => { const l = window.blessuresDuScore(s).map(b => b.id); return l.length === 2 && l.includes("BLE_GRANDE_PLAIE_OUVERTE"); }));
verifier("la mort reste à 46-50 (les chances de mourir ne changent pas)", B("BLE_MORT").min === 46 && B("BLE_MORT").max === 50);
const atout = (id) => (B(id).effet ? B(id).effet({}) : {});
verifier("les plaies ouvertes : 25 % / 9 jours, 50 % / 18 jours, 75 % / 27 jours, au camp",
  atout("BLE_PETITE_PLAIE_OUVERTE").plaieOuverte === 25 && B("BLE_PETITE_PLAIE_OUVERTE").duree.jours === 9 && atout("BLE_PLAIE_OUVERTE").plaieOuverte === 50 && B("BLE_PLAIE_OUVERTE").duree.jours === 18
  && atout("BLE_GRANDE_PLAIE_OUVERTE").plaieOuverte === 75 && B("BLE_GRANDE_PLAIE_OUVERTE").duree.jours === 27 && ["BLE_PETITE_PLAIE_OUVERTE", "BLE_PLAIE_OUVERTE", "BLE_GRANDE_PLAIE_OUVERTE"].every(id => B(id).campSeulement));
const jours = { BLE_COUPURE_FINE: 2, BLE_LEVRE_FENDUE: 3, BLE_COURBATURES: 3, BLE_COUP_VISAGE: 3, BLE_ENTAILLE_MUSCULAIRE: 9, BLE_COMMOTION_LEGERE: 10, BLE_CHEVILLE_TORDUE: 15,
  BLE_MAIN_ENDOLORIE: 3, BLE_COTES_FELEES: 20, BLE_PLAIE_INFECTEE: 10, BLE_EPAULE_DEMISE: 6, BLE_GENOU_AFFAIBLI: 15, BLE_SAIGNEMENT_PERSISTANT: 20, BLE_TENDON_TOUCHE: 10,
  BLE_DECHIRURE_MUSCULAIRE: 20, BLE_POIGNET_FRACTURE: 26, BLE_CHOC_CRANIEN: 25, BLE_TRAUMATISME_OCULAIRE: 24, BLE_BRULURE_ETENDUE: 40, BLE_BRAS_FRACTURE: 30, BLE_JAMBE_FRACTUREE: 36,
  BLE_HEMORRAGIE_INTERNE: 50, BLE_TRAUMATISME_CRANIEN: 90, BLE_ESTROPIE_TOTAL: 150 };
const faux = Object.entries(jours).filter(([id, j]) => B(id).duree.jours !== j || B(id).duree.combats || B(id).duree.soins).map(([id]) => id);
verifier("les durées du tableau, en jours (plus de « prochains combats » ni de « soins en ville »)", faux.length === 0, faux.join(","));
const partout = ["BLE_COUPURE_FINE", "BLE_LEVRE_FENDUE", "BLE_COUP_VISAGE"];
verifier("« de repos au camp » : toutes sauf la coupure fine, la lèvre fendue, le coup au visage", Object.keys(jours).every(id => !!B(id).campSeulement === !partout.includes(id)));
verifier("l'essoufflement reste « au prochain combat » ; les définitives le restent", B("BLE_ESSOUFFLEMENT").duree.combats === 1 && B("BLE_TYMPAN_CREVE").duree.definitif && B("BLE_OEIL_BORGNE").duree.definitif);
verifier("l'épaule démise : ni arme à deux mains, ni deuxième main, pendant ses 6 jours", atout("BLE_EPAULE_DEMISE").interditDeuxMains && atout("BLE_EPAULE_DEMISE").interditMainGauche);
verifier("l'amputation d'une main ou du bras : plus rien en main gauche non plus", atout("BLE_AMPUTATION_MAIN").interditMainGauche && atout("BLE_AMPUTATION_BRAS").interditMainGauche && atout("BLE_AMPUTATION_MAIN").interditDeuxMains);
const deux = window.atoutBlessures({ blessures: [{ id: "BLE_PETITE_PLAIE_OUVERTE", jours: 9 }, { id: "BLE_GRANDE_PLAIE_OUVERTE", jours: 27 }] });
verifier("deux plaies ouvertes : la plus forte compte (75 %, pas 100)", deux.plaieOuverte === 75, JSON.stringify(deux));

console.log("\n2. LA GUÉRISON : SEULEMENT AU CAMP");
const liste = [{ uid: "a", id: "BLE_PLAIE_OUVERTE", jours: 18 }, { uid: "b", id: "BLE_LEVRE_FENDUE", jours: 3 }];
const loin = window.blessuresApresJours(liste, 1, { horsCamp: true }), camp = window.blessuresApresJours(liste, 2);
verifier("loin du camp : la plaie ouverte attend, la lèvre fendue guérit d'un jour", loin[0].jours === 18 && loin[1].jours === 2, JSON.stringify(loin));
verifier("au camp : les deux guérissent", camp[0].jours === 16 && camp[1].jours === 1, JSON.stringify(camp));
const r = CP.journeeDuCamp({ camp: { Provisions: 20, Membres: { H1: { Type: "heros", Joueur: "J1", Tache: null, Moral: 60 }, H2: { Type: "heros", Joueur: "J2", Tache: null, Moral: 60 } } },
  infos: { H1: { heros: true, caracs: {} }, H2: { heros: true, caracs: {} } }, partis: ["H2"] }, () => 0.99);
verifier("la journée du camp : le héros au camp guérit (repos : 2 jours) ; celui parti en expédition, seulement hors camp", r.soinsHeros.H1 === 2 && !("H2" in r.soinsHeros) && r.soinsHorsCamp.H2 === 1, JSON.stringify({ s: r.soinsHeros, h: r.soinsHorsCamp }));
const ui = lire("blessures_ui.js"), cj = lire("camp.js");
verifier("le MJ avance le temps : un héros en expédition ne guérit que hors camp (blessures_ui.js) ; la journée l'applique (camp.js)",
  /blessuresApresJours\(avant, n, \{ horsCamp: auLoin\.has\(p\.idPersonnage\) \}\)/.test(ui) && /res\.soinsHorsCamp/.test(cj) && /blessuresApresJours\(avant, n, \{ horsCamp \}\)/.test(cj));

console.log("\n3. EN COMBAT : LA PLAIE OUVERTE SAIGNE");
const etat = (chance, etats = [], aTerre = false) => ({ ordre: ["A"], combattants: { A: { id: "A", atouts: { plaieOuverte: chance }, etats, aTerre } } });
const des = (v) => ({ d100: () => v });
let e1 = etat(25); const p1 = CERVEAU.plaiesOuvertesDeFinDeManche(e1, des(25));
verifier("25 % : un 25 au d100 la fait saigner (Saignement, 2 manches)", p1.length === 1 && e1.combattants.A.etats.some(x => x.nom === "Saignement" && x.duree === 2), JSON.stringify(e1.combattants.A.etats.map(x => [x.nom, x.duree])));
let e2 = etat(25); verifier("…un 26 non", CERVEAU.plaiesOuvertesDeFinDeManche(e2, des(26)).length === 0 && e2.combattants.A.etats.length === 0);
let e3 = etat(75, [{ nom: "Saignement", duree: 1 }]); CERVEAU.plaiesOuvertesDeFinDeManche(e3, des(10));
verifier("un saignement déjà là est prolongé (pas doublé)", e3.combattants.A.etats.length === 1 && e3.combattants.A.etats[0].duree === 2);
let e4 = etat(75, [], true); verifier("à terre : rien", CERVEAU.plaiesOuvertesDeFinDeManche(e4, des(1)).length === 0);
let n = 0; for (let k = 0; k < 4000; k++) { const e = etat(50); n += CERVEAU.plaiesOuvertesDeFinDeManche(e, { d100: () => 1 + Math.floor(Math.random() * 100) }).length; }
verifier("50 % : environ une manche sur deux", Math.abs(n / 4000 - 0.5) < 0.03, (100 * n / 4000).toFixed(1) + " %");
const cv = lire("cerveau_combat.js"), ce = lire("combat_etat.js");
verifier("le jet tombe à chaque fin de manche, après le vieillissement des états (cerveau_combat.js)", /etapes\.push\(\.\.\.vieillirLesEtats\(etat\)\);[\s\S]{0,700}etapes\.push\(\.\.\.plaiesOuvertesDeFinDeManche\(etat, desManche\)\);/.test(cv));
verifier("la blessure passe au combattant (combat_etat.js, atouts.plaieOuverte)", /plaieOuverte: nombre\(race\.plaieOuverte\)/.test(ce));

console.log("\n4. LES VERSIONS");
const v = Number((lire("trace_combat.js").match(/VERSION_IVALIS = (\d+)/) || [])[1]);
verifier("version 496 ou plus", v >= 496 && JSON.parse(lire("version.json")).version >= 496, String(v));
console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
process.exit(echecs ? 1 : 0);
