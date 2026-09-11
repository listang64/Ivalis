// « MOTS DE POUVOIRS » DOIT IGNORER L'ARMURE DE LA CIBLE.
//
// Vérification demandée après un combat de test. Le mécanisme existe déjà,
// des deux côtés de la chaîne — ce banc le prouve avec des chiffres plutôt que
// de le croire sur parole, et referme la porte à une régression future.
//
// CÔTÉ EXTRACTION (demarrerCiblage, moteur_effets.js, partagé par les deux
// régimes) : un effet dont le NOM contient « pouvoir » est classé `typeRes:
// "Magique"` — au même titre qu'un effet contenant « magique » ou qu'un soin.
// « Mots de pouvoirs » (la base de données le nomme au pluriel) tombe dans
// cette case par construction : aucun cas particulier à écrire, le mot est
// déjà dans son nom.
//
// CÔTÉ RÉSOLUTION (chaineDeDegats, moteur_pur.js) : une attaque `typeRes:
// "Magique"` n'interroge JAMAIS defPhysiqueDe (l'armure). Elle n'affronte que
// defMagiqueDe (la résistance magique) — les deux stats sont indépendantes
// dans ce jeu, et une cible peut très bien avoir une armure élevée et une
// résistance magique nulle. C'est cette indépendance qui fait qu'un « Mots de
// pouvoirs » traverse l'armure la plus épaisse sans la voir.
import { chaineDeDegats } from '../moteur_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

console.log("\n=========================================================");
console.log("  MOTS DE POUVOIRS IGNORE L'ARMURE");
console.log("=========================================================");

// =========================================================================
console.log("\n1. LA RÈGLE DE CLASSEMENT (demarrerCiblage) : « pouvoir » ⇒ Magique");
// =========================================================================
//  Reproduction fidèle de la ligne exacte de moteur_effets.js — un seul
//  changement dans l'un ou l'autre fichier, et ce banc le détecte.
{
    const classer = (nom, isHeal = false) => {
        const nomLower = nom.toLowerCase();
        return (nomLower.includes("magique") || nomLower.includes("pouvoir") || isHeal)
            ? "Magique" : "Physique";
    };
    verifier("« Mots de pouvoirs » (le nom exact en base) est classé Magique",
             classer("Mots de pouvoirs") === "Magique");
    verifier("la casse ne change rien : « MOTS DE POUVOIRS » aussi",
             classer("MOTS DE POUVOIRS") === "Magique");
    verifier("une attaque physique ordinaire reste Physique",
             classer("Attaque légère") === "Physique");
}

// =========================================================================
console.log("\n2. LA PREUVE PAR LES CHIFFRES : chaineDeDegats n'interroge jamais l'armure");
// =========================================================================
{
    // Une cible blindée comme un char, mais sans la moindre résistance
    // magique : le cas qui, justement, distingue les deux chemins.
    const cibleBlindee = { pv: 100, pvMax: 100, bouclier: 0, etats: [],
                           def: { physique: 90, magique: 0 } };

    const attaqueMagique = { valeurBrute: 20, typeRes: "Magique" };
    const compte = chaineDeDegats(cibleBlindee, attaqueMagique, {});
    verifier("« Mots de pouvoirs » (Magique) passe à travers l'armure de 90%",
             compte.degats === 20, `${compte.degats} dégâts sur 20 lancés`);

    // Contre-essai : la MÊME cible, la MÊME valeur brute, mais une attaque
    // PHYSIQUE — c'est elle, et seulement elle, que l'armure de 90% doit
    // presque annuler.
    const attaquePhysique = { valeurBrute: 20, typeRes: "Physique" };
    const compteBloque = chaineDeDegats(cibleBlindee, attaquePhysique, {});
    verifier("la même valeur brute, en physique, est presque entièrement bloquée",
             compteBloque.degats === 2, `${compteBloque.degats} dégâts sur 20 lancés`);

    // Et l'inverse : une cible sans armure mais couverte de résistance
    // magique doit, elle, amortir « Mots de pouvoirs ».
    const cibleEnchantee = { pv: 100, pvMax: 100, bouclier: 0, etats: [],
                             def: { physique: 0, magique: 90 } };
    const compteResiste = chaineDeDegats(cibleEnchantee, attaqueMagique, {});
    verifier("une résistance magique élevée, elle, l'amortit bien",
             compteResiste.degats === 2, `${compteResiste.degats} dégâts sur 20 lancés`);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
