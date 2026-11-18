// LES DEUX TABLEAUX DE NICO (octobre) : CE QUI ÉTAIT EN ROUGE.
//
// Tableau des effets de combat :
//   • Brûlé : « -50 % de soins reçus + 8 % des PV max en dégâts physiques »,
//     l'armure réduisant le coup ;
//   • Empoisonnement : « 10 % de la fatigue max, 8 % des PV max en dégâts
//     magiques (réductions appliquées) » ;
//   • Contre et Absorption : la part renvoyée (ou soignée) monte avec la
//     protection, jusqu'à 30 % (« max 60 % … max 30 % renvoi ») ;
//   • Illusion : on laisse comme ça.
// Tableau des armes et armures :
//   • Lance courte commune : +5 de parade (au lieu d'un dégât) ;
//   • Hache à deux mains très rare : +5 dégâts (au lieu de 6) ;
//   • effets bonus A et B : Poussée, Provocation (et Traction en B) à 15 %,
//     initiative +5 ; effets C : « ignorer les résistances » supprimé.
//
// Le VRAI objets.js, le VRAI noyau (moteur_pur, combat_etat, cerveau_combat).
import fs from 'fs';
import { construireEtatCombat, clonerEtat } from '../combat_etat.js';
import { resoudreCarte, chaineDeDegats, partContreAbsorption, REGLES_ETATS, POISON } from '../moteur_pur.js';
import { ticsDeFinDeManche } from '../cerveau_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const w = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/objets.js', 'utf-8'))(w);

const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, camp: id.startsWith("M") ? "Ennemi" : "Allié", estMonstre: id.startsWith("M"),
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 120, Fatigue_Actuelle: 120,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const etatDe = (fiches) => {
    const positions = {};
    fiches.forEach((f, i) => { positions[f.idPersonnage] = { q: i, r: 0 }; });
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: fiches, positions,
                                     partie: { Tour_Combat: 1 } });
    e.ordre = fiches.map(f => f.idPersonnage);
    e.file = [];
    return e;
};

console.log("\n=========================================================");
console.log("  LES TABLEAUX DE NICO");
console.log("=========================================================");

// =========================================================================
console.log("\n1. LA BRÛLURE : 8 % DES PV MAX EN MAGIQUE, À CHAQUE MANCHE");
// =========================================================================
{
    // Règle de Nico : la brûlure est un dégât MAGIQUE, réduit par la défense magique.
    verifier("la règle : 8 % des PV max, magique, -50 % de soins",
             REGLES_ETATS["Brûlé"].pvMaxParTour === 8 && REGLES_ETATS["Brûlé"].typeParTour === "Magique"
             && REGLES_ETATS["Brûlé"].soinsRecus === -50, JSON.stringify(REGLES_ETATS["Brûlé"]));
    const bruler = (extra) => {
        const e = etatDe([fiche("M1", { ...extra, Etats_Alteres: [{ nom: "Brûlé", duree: 2 }] })]);
        e.combattants.M1.etats = [{ nom: "Brûlé", duree: 2 }];
        ticsDeFinDeManche(e);
        const pv1 = e.combattants.M1.pv;
        ticsDeFinDeManche(e);
        return [pv1, e.combattants.M1.pv];
    };
    const nu = bruler({}), arme = bruler({ Def_Physique: 50 }), mag = bruler({ Def_Magique: 50 });
    verifier("100 PV max : 8 dégâts à la 1re manche, encore 8 à la 2e", nu[0] === 92 && nu[1] === 84, JSON.stringify(nu));
    verifier("la défense magique réduit (50 % → 4)", mag[0] === 96, JSON.stringify(mag));
    verifier("l'armure physique, elle, ne protège pas", arme[0] === 92, JSON.stringify(arme));
    const gros = etatDe([fiche("M1", { PV_Max: 250, PV_Actuels: 250 })]);
    gros.combattants.M1.etats = [{ nom: "Brûlé", duree: 2 }];
    ticsDeFinDeManche(gros);
    verifier("250 PV max : 20 (8 %)", gros.combattants.M1.pv === 230, String(gros.combattants.M1.pv));
    // Une brûlure posée par un sort ne retient plus de type magique.
    const r = resoudreCarte(etatDe([fiche("H1"), fiche("M1")]), {
        type: "carte", idLanceur: "H1", idCarte: "C", critique: true,
        attaques: [{ valeurBrute: 3, typeRes: "Magique", cibles: ["M1"] }],
        alterations: [{ nom: "Brûlé", chance: 100, duree: 2, cibles: ["M1"] }],
        jets: { attaqueRatee: false, parCible: { M1: { esquive: false, etats: { "Brûlé": true } } } } });
    const etat = r.etat.combattants.M1.etats.find(x => x.nom === "Brûlé");
    verifier("posée par un sort, elle n'est plus « magique »", !!etat && etat.typeDegats === undefined, JSON.stringify(etat));
}

// =========================================================================
console.log("\n2. LE POISON : 10 % DE L'ÉNERGIE MAX, 8 % DES PV MAX EN BRUT");
// =========================================================================
{
    verifier("la règle (dégâts bruts)", POISON.energiePct === 10 && POISON.pvMaxPct === 8 && POISON.brut === true,
             JSON.stringify(POISON));
    const empoisonner = (extra) => {
        const e = etatDe([fiche("M1", extra)]);
        e.combattants.M1.etats = [{ nom: "Empoisonnement", duree: 2 }];
        const etapes = ticsDeFinDeManche(e);
        const c = e.combattants.M1;
        ticsDeFinDeManche(e);
        return { fatigue: c.fatigue, pv: c.pv, pvApres2: e.combattants.M1.pv, etapes: etapes.map(x => x.type) };
    };
    const nu = empoisonner({});
    verifier("énergie 120/120 : -12 (10 % du max)", nu.fatigue === 108, String(nu.fatigue));
    verifier("PV : -8 (8 % de 100)", nu.pv === 92, String(nu.pv));
    verifier("un seul tic (rien à la manche suivante)", nu.pvApres2 === 92, String(nu.pvApres2));
    const defMag = empoisonner({ Def_Magique: 50 }), defPhys = empoisonner({ Def_Physique: 50 });
    // Règle de Nico : le poison frappe en dégâts BRUTS — aucune défense.
    verifier("dégâts bruts : la défense magique ne réduit rien", defMag.pv === 92, String(defMag.pv));
    verifier("l'armure physique non plus", defPhys.pv === 92, String(defPhys.pv));
    const bouclier = empoisonner({ Bouclier_Actuel: 20, Bouclier_Max: 20 });
    // v268 (Nico : « poison / brûlure / saignement infligent des dégâts aux PV même si bouclier actif »).
    verifier("le poison passe sous le bouclier : la vie le prend (v268)", bouclier.pv === 92, String(bouclier.pv));
    const peu = empoisonner({ Fatigue_Actuelle: 5 });
    verifier("l'énergie ne descend pas sous 0", peu.fatigue === 0, String(peu.fatigue));
}

// =========================================================================
console.log("\n3. (v431) CONTRE ET ABSORPTION : 25 %, PUIS 40 % AU 2e CRAN, SUR LES DÉGÂTS SUBIS");
// =========================================================================
// Nico : « Contre : inflige 25 % puis 40 % à la deuxième obtention (2 cumuls max) des dégâts physiques subis après
// réduction de l'armure ; Absorption : se guérit de 25 % puis de 40 % des dégâts magiques subis après la résistance
// magique » ; « plus de bonus d'armure dû au sort ».
{
    verifier("1 cran : 25 % ; 2 crans : 40 % ; au-delà, 40 %",
             partContreAbsorption(1) === 25 && partContreAbsorption(2) === 40 && partContreAbsorption(3) === 40,
             [1, 2, 3].map(partContreAbsorption).join(" / "));
    const cible = (etat) => ({ pv: 100, pvMax: 100, bouclier: 0, etats: [etat], def: {}, mod: {} });
    const contre = (pct) => chaineDeDegats(cible({ nom: "Contre", valeurContre: pct }), { valeurBrute: 50, typeRes: "Physique" }, {});
    const absorb = (pct) => chaineDeDegats(cible({ nom: "Absorption", valeurAbs: pct }), { valeurBrute: 50, typeRes: "Magique" }, {});
    verifier("Contre 25 % : les 50 passent, 13 renvoyés (12,5 arrondi)", contre(25).degats === 50 && contre(25).renvoi === 13,
             JSON.stringify(contre(25)));
    verifier("Contre 40 % : les 50 passent, 20 renvoyés", contre(40).renvoi === 20 && contre(40).degats === 50);
    verifier("Absorption 25 / 40 % : soigne 13 / 20, rien d'annulé",
             absorb(25).soinAbsorption === 13 && absorb(40).soinAbsorption === 20 && absorb(40).degats === 50,
             [25, 40].map(p => absorb(p).soinAbsorption).join(" / "));
    const src = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8');
    verifier("les cartes l'annoncent (« Renvoie … % des dégâts physiques subis », « Soigne de … % des dégâts magiques subis »)",
             src.includes("Renvoie ${contreValeur}% des dégâts physiques subis") && src.includes("Soigne de ${absorptionValeur}% des dégâts magiques subis"));
}

// =========================================================================
console.log("\n4. LES ARMES ET LEURS EFFETS BONUS");
// =========================================================================
{
    const modele = (nom) => w.MODELES_OBJETS.find(m => m.modele === nom);
    const lance = modele("Lance courte").paliers;
    verifier("Lance courte commune : +5 parade, plus de dégât", JSON.stringify(lance["Commun"]) === '{"parade":5}',
             JSON.stringify(lance["Commun"]));
    verifier("… les paliers suivants inchangés (rare : +1 dégât, +5 parade)",
             JSON.stringify(lance["Rare"]) === '{"degatsPhys":1,"parade":5}');
    const hache = modele("Hache à deux mains").paliers;
    verifier("Hache à deux mains : très rare +5, épique +6",
             hache["Très rare"].degatsPhys === 5 && hache["Épique"].degatsPhys === 6,
             `${hache["Très rare"].degatsPhys} / ${hache["Épique"].degatsPhys}`);
    const gourdin = modele("Gourdin").paliers;
    verifier("Gourdin : 10 / 15 / 20 / 20 % d'étourdissement (déjà juste)",
             ["Commun", "Rare", "Très rare", "Épique"].map(p => gourdin[p].etatsPropres[0].chance).join() === "10,15,20,20");
    verifier("Javelots épique : 15 % d'ignorer l'armure (déjà juste)", modele("Javelots").paliers["Épique"].ignoreArmure === 15);

    const chance = (res, etat) => (w[res].find(e => e.etat === etat) || {}).chance;
    const init = (res) => ((w[res].find(e => e.cle === "initiative") || {}).bonus || {}).initiative;
    verifier("A : Poussée 15 %, Provocation 15 %, initiative +5",
             chance("EFFETS_A", "Poussée") === 15 && chance("EFFETS_A", "Provocation") === 15 && init("EFFETS_A") === 5);
    verifier("B : Poussée, Traction, Provocation 15 %, initiative +5",
             chance("EFFETS_B", "Poussée") === 15 && chance("EFFETS_B", "Traction") === 15
             && chance("EFFETS_B", "Provocation") === 15 && init("EFFETS_B") === 5);
    verifier("les autres états restent à 10 % (empoisonnement, gelée…)",
             chance("EFFETS_A", "Empoisonnement") === 10 && chance("EFFETS_B", "Glacé") === 10);
    verifier("C : « ignorer les résistances » supprimé, les cinq autres restent",
             !w.EFFETS_C.some(e => e.cle === "ignoreResistances") && w.EFFETS_C.length === 5,
             w.EFFETS_C.map(e => e.cle).join(", "));
    verifier("A et B gardent « ignorer les résistances » (pas en rouge)",
             w.EFFETS_A.some(e => e.cle === "ignoreResistances") && w.EFFETS_B.some(e => e.cle === "ignoreResistances"));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
