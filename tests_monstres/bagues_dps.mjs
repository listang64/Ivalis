// LES BAGUES DE DÉGÂTS : INTELLIGENCE OU CHARISME, DÉGÂTS MAGIQUES OU BRUTS.
//
// Nico : « objets : change pour les bagues, qu'elles soient à la fois pour
// l'intelligence et le charisme — tu sais, les bagues qui font des dégâts en
// plus. Pour l'équiper, ça prend en compte la plus grande valeur de l'une des
// deux. Et les dégâts rajoutés sont rajoutés soit aux dégâts bruts, soit aux
// dégâts magiques. »
//   1. Le prérequis (objets.js, caracsRequisesObjet / peutEquiper) : la
//      meilleure des deux caractéristiques, comme pour une armure légère —
//      les bagues déjà trouvées comprises (lu par modèle).
//   2. Les dégâts (moteur_effets.js, appliquerEquipementALaCarte) : le bonus
//      de la bague s'ajoute à une attaque magique, ou à une attaque brute.
import fs from 'fs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(70)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const w = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/objets.js', 'utf-8'))(w);

console.log("\n=========================================================");
console.log("  LES BAGUES DE DÉGÂTS");
console.log("=========================================================");

console.log("\n1. LE PRÉREQUIS : LA MEILLEURE D'INTELLIGENCE OU DE CHARISME");
{
    const bague = w.fabriquerObjet(w.MODELES_OBJETS.find(m => m.modele === "Bagues DPS"), "Rare");
    const soin = w.fabriquerObjet(w.MODELES_OBJETS.find(m => m.modele === "Bagues Soins"), "Rare");
    verifier("la bague de dégâts : Intelligence ou Charisme", JSON.stringify(w.caracsRequisesObjet(bague)) === '["INTELLIGENCE","CHARISME"]',
             JSON.stringify(w.caracsRequisesObjet(bague)));
    verifier("écrit « Intelligence ou Charisme »", /Intelligence ou Charisme/.test(w.texteCaracsObjet(bague)), w.texteCaracsObjet(bague));
    verifier("la bague de soin reste à la Sagesse", JSON.stringify(w.caracsRequisesObjet(soin)) === '["SAGESSE"]');
    // Une bague trouvée AVANT la règle (carac : INTELLIGENCE seule) la suit aussi.
    const ancienne = { ...bague, carac: "INTELLIGENCE" };
    verifier("une bague déjà trouvée suit la règle", w.caracsRequisesObjet(ancienne).includes("CHARISME"));
    w.CARACS_PARTIE = {
        MAGE:   { int: 13, cha: 8, sag: 8 },
        ORATEUR:{ int: 8,  cha: 13, sag: 8 },
        GUERRIER:{ int: 9, cha: 10, sag: 8 }
    };
    const mage = w.peutEquiper("MAGE", bague), orateur = w.peutEquiper("ORATEUR", bague), guerrier = w.peutEquiper("GUERRIER", bague);
    verifier("Rare : 11 requis", bague.prerequis === 11, String(bague.prerequis));
    verifier("Intelligence 13, Charisme 8 : équipable", mage.possible && mage.valeur === 13, JSON.stringify(mage));
    verifier("Intelligence 8, Charisme 13 : équipable (la plus grande compte)", orateur.possible && orateur.valeur === 13, JSON.stringify(orateur));
    verifier("Intelligence 9, Charisme 10 : refusée, il manque 1", !guerrier.possible && guerrier.valeur === 10 && guerrier.manque === 1,
             JSON.stringify(guerrier));
    verifier("la bague de soin : Charisme 13 ne suffit pas", !w.peutEquiper("ORATEUR", soin).possible);
    verifier("sa description : « dégâts magiques ou bruts »", /magiques? ou bruts?/.test(bague.effetTexte || w.decrireObjet(bague)),
             bague.effetTexte);
}

console.log("\n2. LES DÉGÂTS EN PLUS : SUR LE MAGIQUE OU LE BRUT");
{
    const src = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8');
    const debut = src.indexOf("window.appliquerEquipementALaCarte = function");
    const fin = src.indexOf("\n};\n", debut) + 3;
    const m = { PERSOS_PARTIE: [] };
    // Une bague de +2 (dégâts magiques ou bruts), une épée de +1 (physiques).
    const bonus = { degatsMag: 2, degatsPhys: 1 };
    m.bonusEquip = (p, cle) => bonus[cle] || 0;
    m.bonusEquipPourCarte = (p, cle) => bonus[cle] || 0;
    m.atoutRace = () => ({});
    new Function('window', src.slice(debut, fin))(m);
    const attaques = [
        { nom: "Attaque Magique", typeRes: "Magique", valeurBrute: 5 },
        { nom: "Mots de pouvoirs", typeRes: "Magique", valeurBrute: 5 },
        { nom: "Baiser", typeRes: "Magique", brut: true, valeurBrute: 5 },
        { nom: "Coup brut", typeRes: "Physique", brut: true, valeurBrute: 5 },
        { nom: "Attaque légère", typeRes: "Physique", valeurBrute: 5 }
    ];
    const state = { attaques: attaques.map(a => ({ ...a })) };
    m.appliquerEquipementALaCarte(state, { idPersonnage: "P" }, "Magie");
    const v = Object.fromEntries(state.attaques.map(a => [a.nom, a.valeurBrute]));
    verifier("attaque magique : 5 + 2", v["Attaque Magique"] === 7, String(v["Attaque Magique"]));
    verifier("mots de pouvoirs (Charisme) : 5 + 2", v["Mots de pouvoirs"] === 7, String(v["Mots de pouvoirs"]));
    verifier("magique et brute : la bague une seule fois (5 + 2)", v["Baiser"] === 7, String(v["Baiser"]));
    verifier("brute physique : la bague ET l'arme (5 + 2 + 1)", v["Coup brut"] === 8, String(v["Coup brut"]));
    verifier("physique ordinaire : l'arme seule (5 + 1)", v["Attaque légère"] === 6, String(v["Attaque légère"]));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
