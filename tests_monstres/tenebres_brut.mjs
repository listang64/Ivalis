// TÉNÈBRES FRAPPE BRUT, ET LE MALUS DE TIR NE VAUT QU'AU CONTACT DE LA CIBLE.
//
// Nico : « pour l'effet combat Ténèbres, le mettre en dégâts bruts, aucune
// armure applicable, et s'assurer que s'il n'y a plus de fatigue alors dégâts
// aux PV avec le modificateur en plus (×1,5). » Et : « pour les attaques à
// distance on garde le malus au CAC, mais on peut tirer sans malus sur un
// ennemi à portée qui n'est pas au CAC » — le ciblage, lui, est vérifié par
// engagement_tombe.mjs ; ici, les dégâts.
import { chaineDeDegats, partageTenebres, MULTIPLICATEUR_TENEBRES } from '../moteur_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const cible = (extra = {}) => ({ id: "M", pv: 50, pvMax: 50, fatigue: 40, bouclier: 0, etats: [],
                                 def: { esquive: 0, parade: 0, physique: 30, magique: 50, critique: 0 }, ...extra });
const TENEBRES = (v) => ({ valeurBrute: v, typeRes: "Magique", versEnergie: true });

console.log("\n1. TÉNÈBRES : AUCUNE ARMURE");
{
    const c = chaineDeDegats(cible(), TENEBRES(10), {});
    verifier("10 de Ténèbres sur 50 % de défense magique : 10 bus à l'énergie", c.tenebres && c.tenebres.surEnergie === 10, JSON.stringify(c.tenebres));
    const sort = chaineDeDegats(cible(), { valeurBrute: 10, typeRes: "Magique" }, {});
    verifier("un sort ordinaire, lui, est réduit de moitié (5)", sort.degats === 5, `${sort.degats}`);
}

console.log("\n2. PLUS D'ÉNERGIE : LA VIE, ×1,5");
{
    const vide = chaineDeDegats(cible({ fatigue: 0 }), TENEBRES(10), {});
    verifier("énergie à 0 : 10 → 15 sur les PV, sans armure", vide.degats === 15 && vide.versPv === 15 && vide.tenebres.surEnergie === 0,
             JSON.stringify({ degats: vide.degats, pv: vide.versPv }));
    verifier("le multiplicateur est bien 1,5", MULTIPLICATEUR_TENEBRES === 1.5);
    const partiel = chaineDeDegats(cible({ fatigue: 4 }), TENEBRES(10), {});
    verifier("énergie à 4 : 4 bus, puis 6 × 1,5 = 9 sur les PV", partiel.tenebres.surEnergie === 4 && partiel.degats === 9,
             JSON.stringify({ energie: partiel.tenebres.surEnergie, pv: partiel.degats }));
    const impair = partageTenebres(0, 7);
    verifier("arrondi à l'inférieur : 7 → 10", impair.surplus === 10, `${impair.surplus}`);
    const crit = chaineDeDegats(cible({ fatigue: 0 }), TENEBRES(10), { critique: true });
    verifier("un critique double avant : 20 → 30", crit.degats === 30, `${crit.degats}`);
}

console.log("\n3. LE MALUS DE TIR : SEULEMENT SUR LA CIBLE AU CONTACT");
{
    const tir = { valeurBrute: 10, typeRes: "Physique", isRanged: true };
    const sansArmure = cible({ def: { esquive: 0, parade: 0, physique: 0, magique: 0, critique: 0 } });
    verifier("tir sur la cible au contact : -30 % (7)", chaineDeDegats(sansArmure, tir, { distance: 1 }).degats === 7);
    verifier("tir sur une cible à 2 cases : plein (10)", chaineDeDegats(sansArmure, tir, { distance: 2 }).degats === 10);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
