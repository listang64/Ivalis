// LA TABLE DES BLESSURES.
//
// Nico : « un personnage joueur tombé KO pendant un combat (exception pour le
// Profanateur s'il est debout grâce à son pouvoir qui le maintient en vie)
// reçoit une blessure avant les loot. Une popup s'ouvre avec marqué défaite ou
// victoire douloureuse, ensuite apparaît en fondu avec un bruit résonnant et en
// rouge foncé le nom de la blessure et, toujours en fondu 2 secondes après, le
// descriptif. Le tableau avec à gauche les chances de tomber dessus : un jet de
// dé ; le talent qui baisse la gravité retranche au jet. Dans l'Aperçu, tout en
// bas, un encart pour les blessures, avec les jours / combats restants. »
// Ses réponses : 1d50 (les deux bouts de la table couvrent cinq faces) ; on
// retranche le modificateur de CON et Chanceux (5) ; le 16 se tire à pile ou
// face ; Veinard : −7 au prochain jet ; les relances AJOUTENT une blessure ;
// un héros relevé n'a rien, une seule blessure par combat ; un gros popup
// Victoire / Défaite, pas de butin à la défaite ; chacun ne voit que la sienne ;
// « jours » au MJ qui avance le temps, « combats » à chaque fin (une
// réinitialisation compte) ; un bouton Soigner en DEV ; Tympan crevé définitif
// −5 SAG ; Mort : le héros ne combat plus ; inconscient : indisponible, avec le
// décompte ; Amnésie : 2 compétences grisées 2 combats ; 3 déplacements = 3
// cases par tour ; Choc cardiaque : régénération fixée à 30 ; Agonie : −3 aux
// six caracs.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
// Par espace de noms : un export qui manquerait se voit comme un contrôle en
// échec, pas comme un banc qui refuse de démarrer.
import * as ETAT from '../combat_etat.js';
import { ticsDeFinDeManche, regenererFinDeManche, reposLongDuTour } from '../cerveau_combat.js';
import { planifierTrajet, coutDuPas, resoudreMouvement } from '../mouvement_pur.js';
const { construireEtatCombat, verifierEtatCombat, creerDes } = ETAT;
const ETAT_PLAIE_ROUVERTE = ETAT.ETAT_PLAIE_ROUVERTE || "Plaie rouverte";

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(72)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const w = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/experience.js', 'utf-8'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);
new Function('window', fs.readFileSync('/home/user/Ivalis/talents.js', 'utf-8'))(w);
new Function('window', fs.readFileSync('/home/user/Ivalis/blessures.js', 'utf-8'))(w);
const REGLES = {
    pvMax: w.pvMaxCombattant, fatigueMax: w.fatigueMaxCombattant,
    esquive: w.esquiveCombattant, parade: w.paradeCombattant,
    defPhysique: w.defPhysiqueCombattant, defMagique: w.defMagiqueCombattant,
    critique: w.critiqueCombattant, atouts: w.atoutRace, bonusEquip: w.bonusEquip
};
const ble = (id, extra = {}) => ({ uid: "u_" + id, id, ...extra });
const heros = (extra = {}) => ({
    idPersonnage: "H", prenom: "Hal", race: "", classe: "", camp: "Allié", estMonstre: false, joueur: "J",
    xp: 0, caracs: { force: 12, dex: 12, con: 10, int: 12, sag: 12, cha: 12 }, talents: {}, talentsChoix: {}, blessures: [],
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100, Regeneration: 0,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
// Un dé fixé : chaque tirage rend la face voulue (1 à 50), puis 0 pour le reste.
const des = (...faces) => { const f = [...faces]; return () => (f.length ? (f.shift() - 1) / 50 + 0.001 : 0); };
const monde = (fiches, tour = 1) => {
    const e = construireEtatCombat({ idPartie: "P", cerveau: "H", graine: 1, combattants: fiches,
        positions: Object.fromEntries(fiches.map((f, i) => [f.idPersonnage, { q: i * 2, r: 0 }])),
        partie: { Tour_Combat: tour }, regles: REGLES });
    e.ordre = fiches.map(f => f.idPersonnage); e.phase = "Resolution";
    return e;
};

console.log("\n=========================================================");
console.log("  LA TABLE DES BLESSURES");
console.log("=========================================================");

console.log("\n1. LA TABLE : UN D50, LES DEUX BOUTS PLUS PROBABLES");
{
    const T = w.TABLE_BLESSURES;
    const couverture = Array.from({ length: 50 }, (_, i) => w.blessuresDuScore(i + 1).length);
    verifier("1d50 : chaque face de 1 à 50 tombe sur une blessure", w.FACES_JET_BLESSURE === 50 && couverture.every(n => n >= 1));
    verifier("43 lignes ; seul le 16 en porte deux (Plaie infectée, Épaule démise)", T.length === 43
             && couverture.filter(n => n === 2).length === 1 && couverture[15] === 2
             && w.blessuresDuScore(16).map(b => b.id).join() === "BLE_PLAIE_INFECTEE,BLE_EPAULE_DEMISE");
    const egr = w.blessureParId("BLE_EGRATIGNURE"), mort = w.blessureParId("BLE_MORT");
    verifier("Égratignure : faces 1 à 5 (5 chances sur 50) ; Mort : 46 à 50", egr.min === 1 && egr.max === 5 && mort.min === 46 && mort.max === 50);
    verifier("les autres : une seule face chacune", T.filter(b => b !== egr && b !== mort).every(b => b.min === b.max));
    const tympan = w.blessureParId("BLE_TYMPAN_CREVE");
    verifier("Tympan crevé : définitif, −5 aux jets de Sagesse, texte corrigé", tympan.duree.definitif
             && tympan.effet().testsCarac.sag === -5 && /−5 aux jets de Sagesse/.test(tympan.texte) && /définitivement/.test(tympan.texte));
    verifier("Choc cardiaque : jauge −50 %, régénération FIXE à 30", JSON.stringify(w.blessureParId("BLE_CHOC_CARDIAQUE").effet()) === '{"fatigueMaxPct":-50,"regenFixe":30}');
    verifier("Agonie surmontée : −3 aux six caracs de base", JSON.stringify(w.blessureParId("BLE_AGONIE_SURMONTEE").effet().caracs)
             === '{"force":-3,"dex":-3,"con":-3,"int":-3,"sag":-3,"cha":-3}');
    verifier("Amputation d'une main = celle du bras : plus de deux mains", w.blessureParId("BLE_AMPUTATION_MAIN").effet().interditDeuxMains
             && w.blessureParId("BLE_AMPUTATION_BRAS").effet().interditDeuxMains);
}

console.log("\n2. LE JET : CE QU'ON RETRANCHE");
{
    const h = heros({ caracs: { con: 16 }, talents: { TAL_CHANCEUX: 1 }, blessures: [ble("BLE_VEINARD", { prochainJet: true })] });
    const r = w.retraitsJetBlessure(h);
    verifier("CON 16 (+3), Chanceux (5), Veinard (7) : 15 de moins", r.modCon === 3 && r.chanceux === 5 && r.veinard === 7 && r.total === 15, JSON.stringify(r));
    const t = w.tirerBlessures(h, des(40));
    verifier("dé 40 − 15 = 25 : Brûlure superficielle étendue ; le Veinard est consommé", t.tirages.length === 1
             && t.tirages[0].score === 25 && t.tirages[0].id === "BLE_BRULURE_ETENDUE" && t.veinardConsomme);
    verifier("le jet ne descend pas sous 1 (dé 3 − 15 → 1 : Égratignure)", w.tirerBlessures(h, des(3)).tirages[0].score === 1
             && w.tirerBlessures(h, des(3)).tirages[0].id === "BLE_EGRATIGNURE");
    verifier("CON 8 : un modificateur négatif ne s'ajoute pas (0)", w.retraitsJetBlessure(heros({ caracs: { con: 8 } })).total === 0);
    verifier("sans rien : dé 50 → Mort du personnage", w.tirerBlessures(heros(), des(50)).tirages[0].id === "BLE_MORT");
    const pile = w.tirerBlessures(heros(), des(16, 1)).tirages[0].id, face = w.tirerBlessures(heros(), des(16, 50)).tirages[0].id;
    verifier("le 16 : une pièce décide (Plaie infectée / Épaule démise)", pile === "BLE_PLAIE_INFECTEE" && face === "BLE_EPAULE_DEMISE", pile + " / " + face);
    const commotion = w.tirerBlessures(heros(), des(28, 10));
    verifier("Commotion sévère (28) : relance à +4 → 10 + 4 = 14, Main endolorie AJOUTÉE", commotion.tirages.length === 2
             && commotion.tirages[1].bonus === 4 && commotion.tirages[1].score === 14 && commotion.tirages[1].id === "BLE_MAIN_ENDOLORIE");
    const estropie = w.tirerBlessures(heros(), des(43, 21));
    verifier("Estropié total (43) : relance → la seconde blessure s'ajoute (Tympan)", estropie.tirages.map(x => x.id).join()
             === "BLE_ESTROPIE_TOTAL,BLE_TYMPAN_CREVE");
    const vein = w.tirerBlessures(heros({ blessures: [ble("BLE_VEINARD", { prochainJet: true })] }), des(35, 10));
    verifier("le Veinard ne vaut que pour le premier jet (35 − 7 = 28), pas la relance (10 + 4)", vein.tirages.length === 2
             && vein.tirages[0].score === 28 && vein.tirages[0].retraits === 7 && vein.tirages[1].retraits === 0 && vein.tirages[1].score === 14);
}

console.log("\n3. LA FICHE : LES DURÉES");
{
    verifier("Égratignure, Commotion sévère, Mort : rien à inscrire", w.entreeBlessure("BLE_EGRATIGNURE") === null
             && w.entreeBlessure("BLE_COMMOTION_SEVERE") === null && w.entreeBlessure("BLE_MORT") === null);
    const e = (id) => { const x = w.entreeBlessure(id, ["C1", "C2", "C3"], () => 0); delete x.uid; return JSON.stringify(x); };
    verifier("Courbatures : 1 combat ; Lèvre fendue : 3 jours", e("BLE_COURBATURES") === '{"id":"BLE_COURBATURES","combats":1}'
             && e("BLE_LEVRE_FENDUE") === '{"id":"BLE_LEVRE_FENDUE","jours":3}');
    verifier("Déchirure : soins ; Tympan : définitif ; Épaule : soins ET 1 combat", e("BLE_DECHIRURE_MUSCULAIRE") === '{"id":"BLE_DECHIRURE_MUSCULAIRE","soins":true}'
             && e("BLE_TYMPAN_CREVE") === '{"id":"BLE_TYMPAN_CREVE","definitif":true}'
             && e("BLE_EPAULE_DEMISE") === '{"id":"BLE_EPAULE_DEMISE","combats":1,"soins":true}');
    const choc = w.entreeBlessure("BLE_CHOC_CRANIEN", ["C1", "C2", "C3"], des(1, 1));
    verifier("Choc crânien : deux compétences du deck oubliées, deux combats", choc.combats === 2 && choc.cartes.length === 2
             && new Set(choc.cartes).size === 2 && choc.cartes.every(c => ["C1", "C2", "C3"].includes(c)), JSON.stringify(choc.cartes));

    const avant = heros({ blessures: [ble("BLE_COURBATURES", { combats: 1 }), ble("BLE_VEINARD", { prochainJet: true }), ble("BLE_TYMPAN_CREVE", { definitif: true })] });
    const maj = w.majBlessuresFinCombat(avant, { tirages: [{ id: "BLE_GENOU_AFFAIBLI" }], veinardConsomme: true }, [], () => 0.5);
    verifier("fin de combat : Courbatures guéries, Veinard consommé, Tympan reste, Genou ajouté (2 combats)",
             maj.Blessures.map(b => b.id).join() === "BLE_TYMPAN_CREVE,BLE_GENOU_AFFAIBLI" && maj.Blessures[1].combats === 2 && !maj.Mort_Definitive);
    verifier("la Mort marque la fiche (Mort_Definitive)", w.majBlessuresFinCombat(heros(), { tirages: [{ id: "BLE_MORT" }] }).Mort_Definitive === true);

    const jours = [ble("BLE_LEVRE_FENDUE", { jours: 3 }), ble("BLE_TRAUMATISME_CRANIEN", { jours: 90 })];
    verifier("le temps : 2 jours → Lèvre à 1 jour ; 5 jours → guérie", w.blessuresApresJours(jours, 2)[0].jours === 1
             && !w.blessuresApresJours(jours, 5).some(b => b.id === "BLE_LEVRE_FENDUE"));
    verifier("Traumatisme crânien : indisponible tant que les 90 jours courent",
             w.estIndisponible({ blessures: jours }) && !w.estIndisponible({ blessures: w.blessuresApresJours(jours, 90) }));
    const epaule = [ble("BLE_EPAULE_DEMISE", { combats: 1, soins: true })];
    const apresCombat = w.blessuresApresCombat(epaule);
    verifier("Épaule après un combat : plus la main gauche, encore les deux mains", apresCombat.length === 1
             && !w.atoutBlessures({ blessures: apresCombat }).interditMainGauche && w.atoutBlessures({ blessures: apresCombat }).interditDeuxMains
             && w.atoutBlessures({ blessures: epaule }).interditMainGauche);
    verifier("…et les soins en ville la referment", w.blessuresApresSoins(apresCombat, "u_BLE_EPAULE_DEMISE").length === 0);
    verifier("les restes, en toutes lettres", w.resteBlessure(ble("BLE_GENOU_AFFAIBLI", { combats: 2 })) === "2 combats"
             && w.resteBlessure(ble("BLE_TRAUMATISME_CRANIEN", { jours: 90 })) === "90 jours d'inconscience"
             && w.resteBlessure(ble("BLE_DECHIRURE_MUSCULAIRE", { soins: true })) === "jusqu'aux soins en ville"
             && w.resteBlessure(ble("BLE_TYMPAN_CREVE", { definitif: true })) === "définitif");
}

console.log("\n4. CE QU'ELLES FONT : LES ATOUTS");
{
    const h = heros({ race: "Gob", blessures: [ble("BLE_COURBATURES", { combats: 1 }), ble("BLE_JAMBE_FRACTUREE", { combats: 2 }),
        ble("BLE_LEVRE_FENDUE", { jours: 3 }), ble("BLE_MACHOIRE_FRACASSEE", { definitif: true }), ble("BLE_OEIL_BORGNE", { definitif: true })] });
    const a = w.atoutBlessures(h);
    verifier("3 cases et 2 cases : la plus stricte (2) ; Charisme −2 −5 = −7", a.maxCasesParTour === 2 && a.testsCarac.cha === -7);
    const r = w.atoutRace(h);
    verifier("atoutRace les rejoint : esquive Gob 3 − 20 = −17", r.esquive === -17 && r.maxCasesParTour === 2, JSON.stringify(r));
    const perf = w.atoutRace(heros({ caracs: { cha: 12 }, xp: 1200, talents: { TAL_PERFECTIONNEMENT: 1 }, talentsChoix: { TAL_PERFECTIONNEMENT: "cha" },
        blessures: [ble("BLE_LEVRE_FENDUE", { jours: 3 })] }));
    verifier("les tests de carac s'additionnent clé par clé (Perfectionnement +2, Lèvre −2)", (perf.testsCarac || {}).cha === 0, JSON.stringify(perf.testsCarac));
    verifier("PV max : Déchirure −20 % (100 → 80), avec Mutilation −60 % (→ 40)",
             w.pvMaxCombattant(heros({ blessures: [ble("BLE_DECHIRURE_MUSCULAIRE", { soins: true })] })) === 80
             && w.pvMaxCombattant(heros({ blessures: [ble("BLE_DECHIRURE_MUSCULAIRE", { soins: true }), ble("BLE_MUTILATION_MULTIPLE", { definitif: true })] })) === 40);
    verifier("fatigue max : Choc cardiaque 100 → 50 ; Poumon perforé 100 → 90",
             w.fatigueMaxCombattant(heros({ blessures: [ble("BLE_CHOC_CARDIAQUE", { definitif: true })] })) === 50
             && w.fatigueMaxCombattant(heros({ blessures: [ble("BLE_POUMON_PERFORE", { definitif: true })] })) === 90);
    const agonie = heros({ caracs: { con: 16 }, blessures: [ble("BLE_AGONIE_SURMONTEE", { definitif: true })] });
    verifier("Agonie : CON 16 → 13 pour les talents, modificateur +1 (le jet de blessure aussi)",
             w.caracPourTalents(agonie, "con") === 13 && w.retraitsJetBlessure(agonie).modCon === 1);
    verifier("une créature n'a pas de blessures", JSON.stringify(w.atoutBlessures({ estMonstre: true, blessures: [ble("BLE_OEIL_BORGNE", { definitif: true })] })) === "{}");
    verifier("Chanceux : prenable, et lu par le jet", w.etatTalent(heros({ caracs: { con: 12 }, xp: 1200 }), "TAL_CHANCEUX").ok
             && w.retraitsJetBlessure(heros({ talents: { TAL_CHANCEUX: 1 } })).chanceux === 5);
}

console.log("\n5. LE MOTEUR : L'ENTRÉE EN COMBAT, LES MANCHES, LA MARCHE");
{
    const fiches = [heros({ idPersonnage: "A", blessures: [ble("BLE_ESSOUFFLEMENT", { combats: 1 }), ble("BLE_SAIGNEMENT_PERSISTANT", { combats: 2 })] })];
    const e = monde(fiches);
    const a = e.combattants.A;
    const plaie = a.etats.find(x => x.nom === ETAT_PLAIE_ROUVERTE);
    verifier("premier tour : 10 de fatigue en moins (100 → 90)", a.fatigue === 90, String(a.fatigue));
    verifier("la plaie se rouvre : 2 PV par manche, 3 manches", plaie && plaie.perteFixe === 2 && plaie.duree === 3 && !!plaie.icone);
    const repris = monde(fiches, 3).combattants.A;
    verifier("un combat repris en cours (tour 3) ne les repaie pas", repris.fatigue === 100 && !repris.etats.some(x => x.nom === ETAT_PLAIE_ROUVERTE));
    const etapes = ticsDeFinDeManche(e);
    verifier("fin de manche : la plaie mord (100 → 98)", e.combattants.A.pv === 98 && etapes.some(x => x.tic === ETAT_PLAIE_ROUVERTE));

    const dechire = monde([heros({ idPersonnage: "D", PV_Actuels: 80, blessures: [ble("BLE_DECHIRURE_MUSCULAIRE", { soins: true })] })]);
    verifier("Déchirure : le combat s'ouvre avec 80 PV au plus, état valide", dechire.combattants.D.pvMax === 80
             && verifierEtatCombat(dechire).length === 0, verifierEtatCombat(dechire).join(" | "));

    const choc = monde([heros({ idPersonnage: "C", Fatigue_Actuelle: 10, Regeneration: 35, blessures: [ble("BLE_CHOC_CARDIAQUE", { definitif: true })] })]);
    regenererFinDeManche(choc);
    verifier("Choc cardiaque : la régénération est fixée à 30 (10 → 40 sur 50)", choc.combattants.C.fatigue === 40 && choc.combattants.C.fatigueMax === 50,
             `${choc.combattants.C.fatigue}/${choc.combattants.C.fatigueMax}`);

    const repos = (b) => {
        const m = monde([heros({ idPersonnage: "R", Fatigue_Actuelle: 0, blessures: b })]);
        m.file = [{ id: "R", carte: "REPOS_LONG" }];
        reposLongDuTour(m);
        return m.combattants.R.fatigue;
    };
    verifier("repos long : 35 ; Lésion d'un organe 15 ; Côtes fêlées 35 − 10 = 25", repos([]) === 35
             && repos([ble("BLE_LESION_ORGANE", { definitif: true })]) === 15 && repos([ble("BLE_COTES_FELEES", { combats: 1 })]) === 25);

    const marcheur = (b) => monde([heros({ idPersonnage: "M", blessures: b })]);
    const chemin = [1, 2, 3, 4, 5].map(q => ({ q, r: 0 }));
    const plan = planifierTrajet(marcheur([ble("BLE_COURBATURES", { combats: 1 })]), "M", chemin, null, {});
    verifier("Courbatures : 3 cases par tour au plus (5 demandées → 3)", plan.pas.length === 3 && plan.tronque && plan.plafond);
    verifier("…cases déjà marchées comprises (2 faites → 1 de plus)",
             planifierTrajet(marcheur([ble("BLE_COURBATURES", { combats: 1 })]), "M", chemin, null, { pasDejaFaits: 2 }).pas.length === 1);
    verifier("Lésion de la colonne : 1 case par tour", planifierTrajet(marcheur([ble("BLE_LESION_COLONNE", { definitif: true })]), "M", chemin, null, {}).pas.length === 1);
    const cheville = marcheur([ble("BLE_CHEVILLE_TORDUE", { combats: 1 })]).combattants.M;
    verifier("Cheville tordue : le pas coûte double (2 → 4, 4 → 8)", coutDuPas(cheville, 1, false, false) === 4 && coutDuPas(cheville, 4, false, false) === 8);
    const hemo = marcheur([ble("BLE_HEMORRAGIE_INTERNE", { combats: 2 })]);
    const r = resoudreMouvement(hemo, { idLanceur: "M", chemin: chemin.slice(0, 3) }, creerDes(1), null);
    verifier("Hémorragie interne : 2 PV par case (3 cases → 100 − 6)", r.etat.combattants.M.pv === 94
             && r.etapes.filter(x => x.tic === "Hémorragie interne").length === 3);
    const fragile = marcheur([ble("BLE_HEMORRAGIE_INTERNE", { combats: 2 })]);
    fragile.combattants.M.pv = 3;
    const r2 = resoudreMouvement(fragile, { idLanceur: "M", chemin: chemin.slice(0, 3) }, creerDes(1), null);
    verifier("…et un héros à 3 PV tombe en chemin, la marche s'arrête", r2.etat.combattants.M.aTerre && r2.etat.combattants.M.pv === 0
             && r2.etapes.some(x => x.type === "trajetEcourte" && x.raison === "à terre"));
}

console.log("\n6. LA CLÔTURE ET LES COMPTES (sources)");
{
    const app = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8');
    const combat = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
    const loot = fs.readFileSync('/home/user/Ivalis/loot.js', 'utf-8');
    const index = fs.readFileSync('/home/user/Ivalis/index.html', 'utf-8');
    verifier("un héros mort ou inconscient n'est plus « actif » (ni combat, ni parole)",
             /actif: d\.Actif !== false && d\.Mort_Definitive !== true\s*&& !\(typeof window\.estIndisponible === "function" && window\.estIndisponible\(\{ blessures: d\.Blessures \}\)\)/.test(app));
    verifier("la victoire clôt le combat (blessures) AVANT le butin", /cloturerCombat\("victoire"\)[\s\S]{0,200}window\.demarrerButin\(\)/.test(loot));
    verifier("le MJ qui avance le temps décompte les jours", /decompterJoursBlessures\(joursEcoules\)/.test(app));
    verifier("la réinitialisation d'un combat non clos décompte les combats",
             /const combatNonClos = !!rencontreReinit\s*&& !\(partieAvant\.Fin_Combat && partieAvant\.Fin_Combat\.idRencontre === rencontreReinit\)/.test(combat)
             && /majBlessuresReinitialisation\(perso, combatNonClos\)/.test(combat));
    verifier("index.html charge blessures.js (script simple) puis blessures_ui.js (module)",
             /<script src="blessures\.js\?v=\d+"><\/script>/.test(index) && /<script type="module" src="blessures_ui\.js\?v=\d+"><\/script>/.test(index)
             && index.indexOf("talents.js?v=") < index.indexOf("blessures.js?v="));
}

// =========================================================================
//  LA PAGE
// =========================================================================
const RACINE = '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) {
    res.writeHead(404); res.end('non trouvé'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async (ref) => { const d = (window.__docs || {})[ref.chemin]; return { exists: () => !!d, data: () => d || {} }; };
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data }); };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data }); };
  export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a});
  export const where = (...a) => ({a}); export const orderBy = (...a) => ({a});
  export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
p.on('dialog', d => d.accept());
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"><rect width="900" height="300" fill="#5a3a20"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

console.log("\n7. LES CARTES ET L'ÉQUIPEMENT");
{
  const r = await p.evaluate(() => {
    const h = (blessures, extra = {}) => ({ idPersonnage: "Q", prenom: "Quill", race: "Humain", camp: "Allié", PV_Max: 50, Fatigue_Max: 100,
      blessures: blessures.map(id => ({ uid: "u" + id, id, combats: 1, soins: true, definitif: true })), ...extra });
    const main = h(["BLE_MAIN_ENDOLORIE"]);
    const deuxMains = { nom: "Grande hache", uid: "X2", type: "Arme lourde CAC", deuxMains: true, bonus: { degatsPhys: 4 } };
    const bouclier = { nom: "Pavois", uid: "B1", type: "Bouclier", bonus: { parade: 10 } };
    const dague = { nom: "Dague", uid: "D1", type: "Arme légère CAC", bonus: {} };
    const epaule = h(["BLE_EPAULE_DEMISE"], { equipMainDroite: deuxMains, equipMainGauche: deuxMains });
    const epauleDague = h(["BLE_EPAULE_DEMISE"], { equipMainDroite: dague, equipMainGauche: { ...dague, uid: "D2" } });
    const poignet = h(["BLE_POIGNET_FRACTURE"], { equipMainGauche: bouclier });
    const etatCarte = (lanceur, attaques) => { const s = { attaques }; window.appliquerEquipementALaCarte(s, lanceur, "Arme légère CAC"); return s.attaques.map(a => a.valeurBrute); };
    return {
      coutMagie: window.coutFatigueCarte({ Fatigue: 20, Arme: "Magie" }, main),
      coutCac: window.coutFatigueCarte({ Fatigue: 20, Arme: "Arme légère CAC" }, main),
      coutSain: window.coutFatigueCarte({ Fatigue: 20, Arme: "Magie" }, h([])),
      portee: window.porteeAvecArme(h(["BLE_AMPUTATION_DOIGTS"]), true, 6, "Arme légère Distance").rangeMax,
      porteeCourte: window.porteeAvecArme(h(["BLE_AMPUTATION_DOIGTS"]), true, 2, "Arme légère Distance").rangeMax,
      degats: etatCarte(h(["BLE_BRAS_FRACTURE"]), [{ valeurBrute: 10, cibles: ["E"] }, { valeurBrute: 10, isRanged: true, cibles: ["E"] }, { valeurBrute: 1, cibles: ["E"] }]),
      hache: window.objetsEquipes(epaule).length, hacheRaison: window.raisonObjetInterditParBlessure(epaule, deuxMains, "droite"),
      dagues: window.objetsEquipes(epauleDague).map(o => o.uid).join(),
      bouclier: window.objetsEquipes(poignet).length, parade: (window.atoutRace(poignet) || {}).parade || 0,
      oubli: window.raisonBlocageCarte(h(["BLE_CHOC_CRANIEN"], { blessures: [{ uid: "c", id: "BLE_CHOC_CRANIEN", combats: 2, cartes: ["K1"] }] }), "Magie", "K1"),
      pasOubli: window.raisonBlocageCarte(h([], { blessures: [{ uid: "c", id: "BLE_CHOC_CRANIEN", combats: 2, cartes: ["K1"] }] }), "Magie", "K2")
    };
  });
  verifier("Main endolorie : +5 de fatigue sur un sort (20 → 25), rien au corps à corps", r.coutMagie === 25 && r.coutCac === 20 && r.coutSain === 20);
  verifier("Amputation de doigts : −1 de portée à distance (6 → 5), jamais sous 2", r.portee === 5 && r.porteeCourte === 2);
  verifier("Bras fracturé : −2 au corps à corps (10 → 8), rien à distance, jamais sous 0", JSON.stringify(r.degats) === "[8,10,0]", JSON.stringify(r.degats));
  verifier("Épaule démise : la hache à deux mains ne sert plus, et l'inventaire dit pourquoi", r.hache === 0 && /Épaule démise : pas d'arme à deux mains/.test(r.hacheRaison || ""));
  verifier("…ni la seconde main pendant le combat qui suit (seule la dague de droite)", r.dagues === "D1", r.dagues);
  verifier("Poignet fracturé : le bouclier ne compte plus (et l'Art de la parade se tait)", r.bouclier === 0 && r.parade === 0);
  verifier("Choc crânien : la compétence oubliée est bloquée, les autres non", /oublié/.test(r.oubli || "") && r.pasOubli === null);
}

console.log("\n8. LA FIN DU COMBAT : UNE SEULE ÉCRITURE");
await p.evaluate(() => {
  localStorage.setItem("ID_JOUEUR_COURANT", "J1");
  try { localStorage.removeItem("ivalis_fin_combat_vue"); } catch (e) {}
  document.getElementById("fenetre-combat").style.display = "block";
  window.ID_PARTIE_COURANTE = "PARTIE";
  window.__partie = { ID_Rencontre: "R1" };
  window.PARTIE_DATA = { ...window.__partie };
  window.__transactions = 0;
  window.modifierPartie = async (fn) => {
    window.__transactions++;
    const r = fn(JSON.parse(JSON.stringify(window.__partie)));
    if (!r) return null;
    Object.assign(window.__partie, r.maj);
    return r.resultat;
  };
  const base = { camp: "Allié", race: "Humain", PV_Max: 60, Fatigue_Max: 100, caracs: { con: 10 }, talents: {}, deckEquipe: ["K1", "K2"] };
  window.PERSOS_PARTIE = [
    { ...base, idPersonnage: "P1", prenom: "Aldric", idJoueur: "J1", PV_Actuels: 0, blessures: [] },
    { ...base, idPersonnage: "P2", prenom: "Bryn", idJoueur: "J2", PV_Actuels: 30, blessures: [{ uid: "c1", id: "BLE_COURBATURES", combats: 1 }] },
    { ...base, idPersonnage: "P3", prenom: "Sombre", idJoueur: "J3", classe: "Profanateur", PV_Actuels: 0, sursis: { tours: 2 }, blessures: [] },
    { ...base, idPersonnage: "P4", prenom: "Dorn", idJoueur: "J4", race: "Ankylar", PV_Actuels: 0, fatigueActuelle: 100, blessures: [] }
  ];
  window.PERSOS_PARTIE[0].caracs = { con: 50 };
  window.PERSOS_JOUEURS_PARTIE = window.PERSOS_PARTIE;
  window.MONSTRES_PARTIE = [{ idPersonnage: "M1", camp: "Ennemi", estMonstre: true, statut: "Mort", PV_Max: 20, PV_Actuels: 0 }];
  window.__majs = [];
  // Le dé : 40. Aldric (CON 50 : −20) → 20, Déchirure musculaire ; Dorn
  // (CON 10 : rien à retrancher) → 40, Choc cardiaque.
  window.__random = Math.random;
  Math.random = () => 0.79;
});
{
  const r = await p.evaluate(async () => {
    const fin = await window.cloturerCombat("victoire");
    const encore = await window.cloturerCombat("victoire");
    Math.random = window.__random;
    return { fin, encore, partie: window.__partie, majs: window.__majs };
  });
  const fin = r.partie.Fin_Combat || {};
  verifier("Fin_Combat posée : victoire, rencontre R1, les quatre héros du combat", fin.issue === "victoire" && fin.idRencontre === "R1"
           && (fin.participants || []).join() === "P1,P2,P3,P4");
  verifier("seuls les héros à terre sont blessés (le Profanateur en sursis ne l'est pas)", JSON.stringify(Object.keys(fin.blessures || {})) === '["P1","P4"]'
           && fin.blessures.P1.idJoueur === "J1" && fin.blessures.P1.tirages[0].id === "BLE_DECHIRURE_MUSCULAIRE"
           && fin.blessures.P1.tirages[0].de === 40 && fin.blessures.P1.tirages[0].retraits === 20 && fin.blessures.P4.tirages[0].id === "BLE_CHOC_CARDIAQUE");
  verifier("une seconde clôture du même combat n'écrit rien", r.encore === null);
  const m1 = r.majs.find(m => m.chemin === "Personnages/P1"), m2 = r.majs.find(m => m.chemin === "Personnages/P2");
  verifier("la fiche de P1 reçoit sa Déchirure (soins en ville)", m1 && m1.data.Blessures.length === 1 && m1.data.Blessures[0].id === "BLE_DECHIRURE_MUSCULAIRE" && m1.data.Blessures[0].soins);
  verifier("P2 décompte ses Courbatures (guéries) ; P3, sans blessure, n'est pas réécrit", m2 && m2.data.Blessures.length === 0
           && !r.majs.some(m => m.chemin === "Personnages/P3"));
  const m4 = r.majs.find(m => m.chemin === "Personnages/P4");
  verifier("Choc cardiaque : l'énergie de la fiche est ramenée au nouveau maximum (100 → 50)", m4 && m4.data.Fatigue_Actuelle === 50, JSON.stringify(m4 && m4.data));
}

console.log("\n9. LES POPUPS : VICTOIRE, PUIS LA BLESSURE DE SON SEUL JOUEUR");
{
  // Les instants où le nom, puis le descriptif, deviennent visibles : mesurés
  // dans la page, pour ne pas dépendre de la charge de la machine.
  await p.evaluate(() => {
    window.__instants = {};
    new MutationObserver(ms => ms.forEach(m => {
      const el = m.target;
      if (!el.classList || !el.classList.contains("visible")) return;
      if (el.classList.contains("blessure-revelation-nom") && !window.__instants.nom) window.__instants.nom = performance.now();
      if (el.classList.contains("blessure-revelation-texte") && !window.__instants.texte) window.__instants.texte = performance.now();
    })).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class"] });
    window.afficherFinCombat(window.__partie.Fin_Combat);
  });
  await p.waitForTimeout(600);
  const bandeau = await p.evaluate(() => ({
    mot: (document.querySelector("#fin-combat-voile .fin-combat-mot") || {}).textContent,
    z: getComputedStyle(document.getElementById("fin-combat-voile")).zIndex,
    visible: getComputedStyle(document.getElementById("fin-combat-voile")).display === "flex"
  }));
  await p.screenshot({ path: "/tmp/claude-0/blessures_victoire.png" });
  verifier("le grand « Victoire » s'affiche, par-dessus le butin (z 21000 > 20000)", bandeau.visible && bandeau.mot === "Victoire" && Number(bandeau.z) > 20000);
  await p.waitForFunction(() => window.__instants && window.__instants.nom, null, { timeout: 15000 });
  await p.waitForTimeout(400);
  const t1 = await p.evaluate(() => ({
    titre: (document.querySelector(".blessure-revelation-titre") || {}).textContent,
    nom: (document.querySelector(".blessure-revelation-nom") || {}).textContent,
    nomOpacite: getComputedStyle(document.querySelector(".blessure-revelation-nom")).opacity,
    couleur: getComputedStyle(document.querySelector(".blessure-revelation-nom")).color,
    texteVisible: document.querySelector(".blessure-revelation-texte").classList.contains("visible")
  }));
  verifier("« Victoire douloureuse », puis le nom en rouge foncé, en fondu", t1.titre === "Victoire douloureuse" && t1.nom === "Déchirure musculaire"
           && t1.couleur === "rgb(139, 0, 0)" && Number(t1.nomOpacite) > 0, JSON.stringify(t1));
  await p.waitForFunction(() => window.__instants && window.__instants.texte, null, { timeout: 15000 });
  await p.waitForTimeout(700);
  const ecart = await p.evaluate(() => window.__instants.texte - window.__instants.nom);
  verifier("le descriptif attend 2 secondes après le nom", ecart >= 1800 && ecart <= 3200, `${Math.round(ecart)} ms`);
  const t2 = await p.evaluate(() => ({
    texte: document.querySelector(".blessure-revelation-texte").classList.contains("visible"),
    contenu: document.querySelector(".blessure-revelation-texte").textContent,
    bouton: document.querySelector(".blessure-revelation-continuer").classList.contains("visible")
  }));
  await p.screenshot({ path: "/tmp/claude-0/blessures_revelation.png" });
  verifier("…puis le descriptif apparaît, et « Continuer »", t2.texte && /maximum de PV est réduit de 20 %/.test(t2.contenu) && t2.bouton);
  await p.click(".blessure-revelation-continuer");
  await p.waitForTimeout(700);
  const ferme = await p.evaluate(() => getComputedStyle(document.getElementById("fin-combat-voile")).display);
  verifier("Continuer referme le voile", ferme === "none");
  const rejoue = await p.evaluate(() => window.afficherFinCombat(window.__partie.Fin_Combat));
  verifier("une seule fois par poste (la notification suivante ne rejoue rien)", rejoue === false);

  // L'autre joueur : le bandeau, et rien d'autre.
  await p.evaluate(() => { localStorage.setItem("ID_JOUEUR_COURANT", "J2"); window.afficherFinCombat(window.__partie.Fin_Combat, { force: true }); });
  await p.waitForTimeout(3000);
  const autre = await p.evaluate(() => ({ revelation: !!document.querySelector(".blessure-revelation"),
    miennes: window.blessuresDuPoste(window.__partie.Fin_Combat).length }));
  verifier("le joueur de Bryn ne voit pas la blessure d'Aldric", !autre.revelation && autre.miennes === 0);
  await p.waitForTimeout(800);
}

console.log("\n10. LA DÉFAITE : TOUS LES HÉROS À TERRE");
{
  const r = await p.evaluate(async () => {
    window.__partie = { ID_Rencontre: "R2" };
    window.PARTIE_DATA = { ...window.__partie };
    window.MONSTRES_PARTIE = [{ idPersonnage: "M2", camp: "Ennemi", estMonstre: true, PV_Max: 20, PV_Actuels: 20 }];
    window.PERSOS_PARTIE.forEach(p => { p.PV_Actuels = 0; delete p.sursis; });
    const debout = { ...window.PERSOS_PARTIE[0], idPersonnage: "P9", PV_Actuels: 5 };
    window.PERSOS_PARTIE.push(debout);
    const avecUnDebout = window.verifierDefaiteCombat();
    window.PERSOS_PARTIE.pop();
    const sans = window.verifierDefaiteCombat();
    await new Promise(r => setTimeout(r, 300));
    return { avecUnDebout, sans, fin: window.__partie.Fin_Combat };
  });
  verifier("un héros encore debout : pas de défaite", r.avecUnDebout === false);
  verifier("tous à terre : Fin_Combat « defaite », chacun son jet", r.sans === true && r.fin && r.fin.issue === "defaite"
           && Object.keys(r.fin.blessures).length === 4);
  await p.evaluate(() => { localStorage.setItem("ID_JOUEUR_COURANT", "J1"); window.afficherFinCombat(window.__partie.Fin_Combat, { force: true }); });
  await p.waitForTimeout(700);
  const mot = await p.evaluate(() => (document.querySelector("#fin-combat-voile .fin-combat-mot") || {}).textContent);
  await p.screenshot({ path: "/tmp/claude-0/blessures_defaite.png" });
  verifier("le grand « Défaite »", mot === "Défaite");
  await p.waitForTimeout(3300);
  const titre = await p.evaluate(() => (document.querySelector(".blessure-revelation-titre") || {}).textContent);
  verifier("…puis « Défaite » en tête de la blessure", titre === "Défaite");
  await p.evaluate(() => { const v = document.getElementById("fin-combat-voile"); v.style.display = "none"; v.innerHTML = ""; });
}

console.log("\n11. LE TEMPS, LES SOINS, L'ENCART DE L'APERÇU");
{
  const jours = await p.evaluate(async () => {
    window.__majs = [];
    window.PERSOS_JOUEURS_PARTIE = [{ idPersonnage: "P1", prenom: "Aldric", blessures: [{ uid: "l", id: "BLE_LEVRE_FENDUE", jours: 3 }, { uid: "g", id: "BLE_GENOU_AFFAIBLI", combats: 2 }] },
                                    { idPersonnage: "P2", prenom: "Bryn", blessures: [{ uid: "g2", id: "BLE_GENOU_AFFAIBLI", combats: 2 }] }];
    const n = await window.decompterJoursBlessures(2);
    return { n, majs: window.__majs };
  });
  verifier("le MJ avance de 2 jours : Lèvre fendue 3 → 1 ; la fiche sans « jours » n'est pas réécrite", jours.n === 1
           && jours.majs.length === 1 && jours.majs[0].data.Blessures.find(x => x.id === "BLE_LEVRE_FENDUE").jours === 1
           && jours.majs[0].data.Blessures.find(x => x.id === "BLE_GENOU_AFFAIBLI").combats === 2);
  await p.evaluate(() => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
    const fiche = document.getElementById("fenetre-fiche-perso");
    fiche.style.display = "flex"; fiche.style.left = "2vw"; fiche.style.top = "10px";
    document.getElementById("champ-id-personnage").value = "P5";
    window.CARACS_PARTIE = { P5: { force: 13, dex: 14, con: 16, int: 15, sag: 13, cha: 14 } };
    window.__perso = { idPersonnage: "P5", prenom: "Morvak", nom: "Cendrelame", race: "Gob", classe: "Sorcier", xp: 0,
      PV_Max: 50, Fatigue_Max: 100, Regeneration: 35, Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
      talents: {}, talentsChoix: {}, Etats_Alteres: [],
      blessures: [{ uid: "t", id: "BLE_TYMPAN_CREVE", definitif: true }, { uid: "g", id: "BLE_GENOU_AFFAIBLI", combats: 2 },
                  { uid: "d", id: "BLE_DECHIRURE_MUSCULAIRE", soins: true }, { uid: "tc", id: "BLE_TRAUMATISME_CRANIEN", jours: 90 }] };
    window.PERSOS_PARTIE = [window.__perso];
    window.PERSOS_JOUEURS_PARTIE = [window.__perso];
    const bouton = [...document.querySelectorAll(".onglet-btn")].find(x => x.textContent.trim() === "Aperçu");
    if (bouton) bouton.click();
    window.afficherStatsCombat(window.__perso);
  });
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => {
    const encart = document.getElementById("encart-blessures");
    return {
      lignes: [...encart.querySelectorAll(".blessure-ligne")].map(l => l.querySelector(".blessure-nom").textContent + " | " + l.querySelector(".blessure-reste").textContent.trim()),
      apresTalents: !!(document.getElementById("encart-talents-pris").compareDocumentPosition(encart) & Node.DOCUMENT_POSITION_FOLLOWING),
      dernier: encart.parentElement.lastElementChild === encart,
      pv: document.getElementById("stat-pv").innerText,
      dev: [...document.querySelectorAll("#dev-blessures-liste .dev-blessure-ligne span")].map(s => s.textContent)
    };
  });
  await p.evaluate(() => document.getElementById("encart-blessures").scrollIntoView());
  await p.waitForTimeout(200);
  await p.screenshot({ path: "/tmp/claude-0/blessures_apercu.png" });
  verifier("l'encart, tout en bas de l'Aperçu (sous les talents)", r.apresTalents && r.dernier);
  verifier("chaque blessure et ce qu'il lui reste", r.lignes.length === 4 && r.lignes.includes("Tympan crevé | ⛓ définitif")
           && r.lignes.includes("Genou affaibli | ⏳ 2 combats") && r.lignes.includes("Traumatisme crânien profond | ⏳ 90 jours d'inconscience")
           && r.lignes.includes("Déchirure musculaire | ⏳ jusqu'aux soins en ville"), JSON.stringify(r.lignes));
  verifier("les PV de l'Aperçu comptent la Déchirure (50 → 40)", /40/.test(r.pv), r.pv);
  verifier("l'onglet DEV propose de soigner la seule blessure qui attend les soins", JSON.stringify(r.dev) === '["Déchirure musculaire"]');
  const soin = await p.evaluate(async () => {
    window.__majs = [];
    await window.soignerBlessureDev("d");
    return { maj: window.__majs[0], lignes: document.querySelectorAll("#encart-blessures .blessure-ligne").length };
  });
  verifier("Soigner : la Déchirure part de la fiche, l'encart suit", soin.maj && soin.maj.chemin === "Personnages/P5"
           && !soin.maj.data.Blessures.some(x => x.id === "BLE_DECHIRURE_MUSCULAIRE") && soin.lignes === 3);
  const reinit = await p.evaluate(() => {
    const perso = { blessures: [{ uid: "g", id: "BLE_GENOU_AFFAIBLI", combats: 2 }, { uid: "t", id: "BLE_TYMPAN_CREVE", definitif: true }] };
    return { nonClos: window.majBlessuresReinitialisation(perso, true), clos: window.majBlessuresReinitialisation(perso, false) };
  });
  verifier("réinitialiser un combat non clos : Genou 2 → 1 ; déjà clos : rien", reinit.nonClos && reinit.nonClos.Blessures[0].combats === 1 && reinit.clos === null);
}

console.log("\n12. LE GONG");
{
  const r = await p.evaluate(async () => {
    const ctx = new OfflineAudioContext(1, 44100 * 5, 44100);
    const g = ctx.createGain(); g.connect(ctx.destination);
    window.SONS_EVENEMENTS["gong-blessure"](ctx, g);
    const buf = await ctx.startRendering();
    const d = buf.getChannelData(0);
    const rms = (a, z) => { let s = 0; for (let i = a * 44100; i < z * 44100; i++) s += d[i] * d[i]; return Math.sqrt(s / ((z - a) * 44100)); };
    return { debut: rms(0, 0.5), tard: rms(2.5, 3), tout: Object.keys(window.SONS_EVENEMENTS).join(), dix: window.SONS_FABRIQUE.length };
  });
  verifier("un gong qui résonne : fort au départ, encore audible à 2,5 s", r.debut > 0.02 && r.tard > 0.002 && r.tard < r.debut, `${r.debut.toFixed(3)} → ${r.tard.toFixed(4)}`);
  verifier("à part des dix clics de la Fabrique (victoire, défaite, gong)", r.tout === "gong-blessure,victoire,defaite" && r.dix === 10);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
