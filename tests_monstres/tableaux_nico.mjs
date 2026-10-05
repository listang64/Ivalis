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
import { resoudreCarte, chaineDeDegats, partRendue, REGLES_ETATS, POISON } from '../moteur_pur.js';
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
    verifier("le bouclier encaisse d'abord", bouclier.pv === 100, String(bouclier.pv));
    const peu = empoisonner({ Fatigue_Actuelle: 5 });
    verifier("l'énergie ne descend pas sous 0", peu.fatigue === 0, String(peu.fatigue));
}

// =========================================================================
console.log("\n3. CONTRE ET ABSORPTION : LA PART RENDUE MONTE JUSQU'À 30 %");
// =========================================================================
{
    verifier("la moitié de ce qui est annulé, plafonnée à 30",
             partRendue(20) === 10 && partRendue(40) === 20 && partRendue(60) === 30 && partRendue(80) === 30,
             [20, 40, 60, 80].map(partRendue).join(" / "));
    const cible = (etat) => ({ pv: 100, pvMax: 100, bouclier: 0, etats: [etat], def: {}, mod: {} });
    const contre = (pct) => chaineDeDegats(cible({ nom: "Contre", valeurContre: pct }), { valeurBrute: 50, typeRes: "Physique" }, {});
    const absorb = (pct) => chaineDeDegats(cible({ nom: "Absorption", valeurAbs: pct }), { valeurBrute: 50, typeRes: "Magique" }, {});
    verifier("Contre 20 % : 40 encaissés, 5 renvoyés (10 %)", contre(20).degats === 40 && contre(20).renvoi === 5,
             JSON.stringify(contre(20)));
    verifier("Contre 40 % : 10 renvoyés (20 %)", contre(40).renvoi === 10 && contre(40).degats === 30);
    verifier("Contre 60 % : 15 renvoyés (30 %, le maximum)", contre(60).renvoi === 15 && contre(60).degats === 20);
    verifier("Absorption 20 / 40 / 60 % : soigne 5 / 10 / 15",
             absorb(20).soinAbsorption === 5 && absorb(40).soinAbsorption === 10 && absorb(60).soinAbsorption === 15,
             [20, 40, 60].map(p => absorb(p).soinAbsorption).join(" / "));
    const src = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8');
    verifier("les cartes l'annoncent (« renvoie … % », « soigne de … % »)",
             src.includes("renvoie ${Math.min(30, contreValeur / 2)}%") && src.includes("soigne de ${Math.min(30, absorptionValeur / 2)}%"));
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
