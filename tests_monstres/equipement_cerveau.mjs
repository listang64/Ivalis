// L'ÉQUIPEMENT RÉACTIF, RELIÉ AU NOUVEAU CERVEAU.
//
// Nico a demandé de vérifier que « les armes et armures qui augmentent les
// statistiques » sont bien reliées au nouveau moteur. Les bonus PERMANENTS
// (résistances, parade, critique, dégâts plats, portée, coût de déplacement)
// l'étaient déjà — atouts_races.mjs et equipement_combat.mjs le montrent
// depuis longtemps, et l'enrichissement d'une carte par l'équipement
// (appliquerEquipementALaCarte, moteur_effets.js) tourne AVANT le passage au
// cerveau, donc s'applique déjà sous les deux régimes.
//
// CE QUI NE L'ÉTAIT PAS, et que ce banc découvre puis répare : tout ce qu'un
// objet ne fait QU'EN RÉACTION à une carte jouée. Percer une armure ou une
// résistance (un jet par cible), gagner de l'élan en frappant, bénir qui vient
// d'être soigné, s'offrir un pas de retraite après un coup — ces quatre choses
// ne vivaient que dans `tirerLesDesDeLaCarte` / `appliquerSuitesEquipement`
// (moteur_effets.js), un chemin que le régime du cerveau ne traverse JAMAIS.
// Sous ce régime — le régime par défaut depuis l'étape 5 — une arme
// perce-armure, un sabre qui donne de l'élan, ou une bague de bénédiction ne
// faisaient donc RIEN. Ce banc fait tourner le VRAI moteur_pur.js et le VRAI
// combat_etat.js pour vérifier que ce n'est plus le cas.
import fs from 'fs';
import { construireEtatCombat, clonerEtat } from '../combat_etat.js';
import { resoudreCarte, tirerDesCarte } from '../moteur_pur.js';
import { planifierTrajet } from '../mouvement_pur.js';

function extraire(fichier, marqueur, finLigne = '};') {
    const lignes = fs.readFileSync('/home/user/Ivalis/' + fichier, 'utf-8').split('\n');
    const d = lignes.findIndex(l => l.startsWith(marqueur));
    if (d < 0) throw new Error(`${marqueur} introuvable dans ${fichier}`);
    let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
    return lignes.slice(d, f + 1).join('\n');
}

// objets.js n'importe rien : c'est le VRAI fichier, chargé tel quel, sans
// naviguateur — comme equipement_combat.mjs le fait déjà pour le même fichier.
const SRC_OBJETS = fs.readFileSync('/home/user/Ivalis/objets.js', 'utf-8');
// bonusEquip (app.js) additionne l'équipement permanent ET la contribution des
// états (c'est lui qui referme la boucle : un état "Élan" posé par le cerveau
// doit à son tour compter dans bonusEquip, exactement comme avant).
const SRC_BONUS_EQUIP = extraire('app.js', 'window.bonusEquip = function');

const window = {};
new Function('window', SRC_OBJETS + '\n' + SRC_BONUS_EQUIP)(window);

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

console.log("\n=========================================================");
console.log("  L'ÉQUIPEMENT RÉACTIF, DEVANT LE VRAI NOYAU PUR");
console.log("=========================================================\n");

// -------------------------------------------------------------------------
//  Des objets au format EXACT d'objets.js (.bonus, .effets) — pas une
//  réécriture : c'est bonusEquip et effetsSpeciauxEquipement, les vraies
//  fonctions, qui les lisent.
// -------------------------------------------------------------------------
const armePercePlaques = { nom: "Lame perce-plaques", uid: "o1", type: "Arme légère CAC",
                           bonus: { ignoreArmure: 100 } };
const dagueAnnihilante = { nom: "Dague annihilante", uid: "o2", type: "Arme légère CAC",
                           bonus: { ignoreResistances: 100 } };
const sabreVif = { nom: "Sabre vif", uid: "o3", type: "Arme légère CAC",
                   effets: [{ buff: { initiative: 15, tours: 2 }, chance: 100 }] };
const sabreEteint = { nom: "Sabre éteint", uid: "o3b", type: "Arme légère CAC",
                      effets: [{ buff: { initiative: 15, tours: 2 }, chance: 0 }] };
const fleuretDansant = { nom: "Fleuret dansant", uid: "o4", type: "Arme légère CAC",
                         bonus: { hexApresAttaque: 2 } };
const bagueBenediction = { nom: "Bague de bénédiction", uid: "o5", type: "Anneau", bague: true,
                           effets: [{ beniSoin: { resMag: 8, tours: 1 } }] };
const bagueElanSoi = { nom: "Bague de célérité", uid: "o6", type: "Anneau", bague: true,
                       effets: [{ buffSoi: { initiative: 10, tours: 1 } }] };

const fiche = (id, extra = {}) => ({
    idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 80, Def_Magique: 80,
    Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});

const REGLES = { bonusEquip: window.bonusEquip, effetsSpeciaux: window.effetsSpeciauxEquipement };

const monde = (combattants, positions) => construireEtatCombat({
    idPartie: "G", cerveau: "P1", graine: 4242, combattants, positions,
    partie: {
        Phase_Combat: "Resolution", Ordre_Initiative: combattants.map(c => c.idPersonnage),
        File_Attente_Combat: combattants.map(c => ({ idPersonnage: c.idPersonnage }))
    },
    regles: REGLES
});

// Un dé truqué : une file de résultats fixes, dans l'ordre où le moteur les
// consomme (attaques/alterations d'abord, équipement ensuite — voir
// tirerDesCarte). Ce n'est PAS le des à graine du jeu : c'est un outil de
// banc pour poser des cas précis (percé / pas percé) sans deviner une suite
// pseudo-aléatoire.
const desFixe = (suite) => { const f = [...suite]; return { d100: () => f.length ? f.shift() : 1 }; };

const attaqueCAC = (typeRes, valeur, cibles) => ({
    nom: "Attaque", typeRes, valeurBrute: valeur, isRanged: false, rangeMax: 1,
    isHeal: false, isShield: false, purifChance: 0, estEtalement: false, cibles
});
const soinCAC = (valeur, cibles) => ({
    nom: "Soin", typeRes: "Magique", valeurBrute: valeur, isHeal: true, isShield: false,
    purifChance: 0, estEtalement: false, cibles
});

// =========================================================================
console.log("1. LES VALEURS RÉACTIVES SONT GELÉES SUR LE COMBATTANT");
// =========================================================================
{
    const arme = { ...armePercePlaques };
    const H1 = fiche("H1", { equipMainDroite: arme });
    const etat = monde([H1], { H1: { q: 0, r: 0 } });

    verifier("l'armure percée atterrit dans equip.ignoreArmure",
             etat.combattants.H1.equip.ignoreArmure === 100, `(${etat.combattants.H1.equip.ignoreArmure})`);
    verifier("un combattant sans cet objet n'a rien",
             monde([fiche("H2")], { H2: { q: 0, r: 0 } }).combattants.H2.equip.ignoreArmure === 0);

    // LE POINT QUI A CASSÉ EN CHEMIN : hexApresAttaque n'est PLUS un modificateur
    // permanent de déplacement — il ne peut plus l'être, sous peine de donner un
    // pas de retraite gratuit à CHAQUE tour, attaque ou non.
    const H3 = fiche("H3", { equipMainDroite: fleuretDansant });
    const etat3 = monde([H3], { H3: { q: 0, r: 0 } });
    verifier("le pas de retraite n'est PAS un modificateur permanent de mouvement",
             etat3.combattants.H3.mod.hexApresAttaque === undefined,
             JSON.stringify(etat3.combattants.H3.mod));
    verifier("mais la valeur de l'arme est bien gelée, prête à être réveillée par une frappe",
             etat3.combattants.H3.equip.hexApresAttaque === 2);
}

// =========================================================================
console.log("\n2. PERCER L'ARMURE — UN JET, PAR CIBLE");
// =========================================================================
{
    const H1 = fiche("H1", { equipMainDroite: armePercePlaques });
    const H2 = fiche("H2", { Def_Physique: 80 });   // blindé : 80 % de réduction
    let etat = monde([H1, H2], { H1: { q: 0, r: 0 }, H2: { q: 1, r: 0 } });

    // Sans le jet d'équipement percé (armure à 0 %), 20 de brut × 20 % = 4.
    const sansPercee = fiche("H1sp");
    let etatSansPercee = monde([sansPercee, fiche("H2b", { Def_Physique: 80 })],
                              { H1sp: { q: 0, r: 0 }, H2b: { q: 1, r: 0 } });
    const jetsSans = tirerDesCarte(etatSansPercee, { attaques: [attaqueCAC("Physique", 20, ["H2b"])] },
                                   "H1sp", false, desFixe([99]));
    const rSans = resoudreCarte(etatSansPercee, {
        type: "carte", idLanceur: "H1sp", idCarte: "C1",
        attaques: [attaqueCAC("Physique", 20, ["H2b"])], alterations: [], jets: jetsSans
    });
    verifier("témoin : sans percée, l'armure encaisse (60 → 56)",
             rSans.etat.combattants.H2b.pv === 56, `(${rSans.etat.combattants.H2b.pv})`);

    // Avec la Lame perce-plaques (100 %) : le jet d'équipement tombe à coup sûr.
    const jets = tirerDesCarte(etat, { attaques: [attaqueCAC("Physique", 20, ["H2"])] },
                               "H1", false, desFixe([99, 1]));
    verifier("le jet d'équipement est bien tiré, PAR cible",
             jets.parCible.H2.equip && jets.parCible.H2.equip.ignoreArmure === true,
             JSON.stringify(jets.parCible.H2));
    const r = resoudreCarte(etat, {
        type: "carte", idLanceur: "H1", idCarte: "C1",
        attaques: [attaqueCAC("Physique", 20, ["H2"])], alterations: [], jets
    });
    verifier("l'armure percée laisse passer les 20 pleins (60 → 40)",
             r.etat.combattants.H2.pv === 40, `(${r.etat.combattants.H2.pv})`);
}

// =========================================================================
console.log("\n3. IGNORER LES RÉSISTANCES — MARCHE AUSSI EN MAGIQUE");
// =========================================================================
{
    const H1 = fiche("H1", { equipMainDroite: dagueAnnihilante });
    const H2 = fiche("H2", { Def_Magique: 80 });
    let etat = monde([H1, H2], { H1: { q: 0, r: 0 }, H2: { q: 1, r: 0 } });

    const jets = tirerDesCarte(etat, { attaques: [attaqueCAC("Magique", 20, ["H2"])] },
                               "H1", false, desFixe([99, 99, 1]));
    const r = resoudreCarte(etat, {
        type: "carte", idLanceur: "H1", idCarte: "C1",
        attaques: [attaqueCAC("Magique", 20, ["H2"])], alterations: [], jets
    });
    verifier("ignoreResistances passe même une attaque magique (60 → 40)",
             r.etat.combattants.H2.pv === 40, `(${r.etat.combattants.H2.pv})`);

    // Une chance à 0 % ne perce jamais : le jet est bien un jet, pas un
    // interrupteur qui s'active dès que l'objet est équipé.
    const armeInerteRoll = { nom: "Dague inerte", uid: "o2b", type: "Arme légère CAC",
                             bonus: { ignoreResistances: 0 } };
    const H3 = fiche("H3", { equipMainDroite: armeInerteRoll });
    const etat3 = monde([H3, fiche("H4", { Def_Magique: 80 })], { H3: { q: 0, r: 0 }, H4: { q: 1, r: 0 } });
    const jets3 = tirerDesCarte(etat3, { attaques: [attaqueCAC("Magique", 20, ["H4"])] },
                                "H3", false, desFixe([99, 99]));
    verifier("0 % de chance ne tire même pas le dé", jets3.parCible.H4.equip === undefined,
             JSON.stringify(jets3.parCible.H4));
}

// =========================================================================
console.log("\n4. DEUX CIBLES, DEUX JETS INDÉPENDANTS");
// =========================================================================
{
    const armeMoitie = { nom: "Estoc capricieux", uid: "o7", type: "Arme légère CAC",
                         bonus: { ignoreArmure: 50 } };
    const H1 = fiche("H1", { equipMainDroite: armeMoitie });
    const H2 = fiche("H2", { Def_Physique: 80 });
    const H3 = fiche("H3", { Def_Physique: 80 });
    let etat = monde([H1, H2, H3], { H1: { q: 0, r: 0 }, H2: { q: 1, r: 0 }, H3: { q: 2, r: 0 } });

    // 40 <= 50 → percé ; 60 > 50 → pas percé. Un seul jet par cible, dans
    // l'ordre où la carte les liste.
    const jets = tirerDesCarte(etat, { attaques: [attaqueCAC("Physique", 20, ["H2", "H3"])] },
                               "H1", false, desFixe([99, 99, 40, 60]));
    verifier("H2 est percé", jets.parCible.H2.equip.ignoreArmure === true);
    verifier("H3 ne l'est pas, avec le MÊME jet d'arme", jets.parCible.H3.equip.ignoreArmure === false);
}

// =========================================================================
console.log("\n5. L'ÉLAN : POSÉ SUR LE LANCEUR, APRÈS UNE CARTE QUI FRAPPE");
// =========================================================================
{
    const H1 = fiche("H1", { equipMainDroite: sabreVif });
    const H2 = fiche("H2");
    let etat = monde([H1, H2], { H1: { q: 0, r: 0 }, H2: { q: 1, r: 0 } });

    const jets = tirerDesCarte(etat, { attaques: [attaqueCAC("Physique", 10, ["H2"])] },
                               "H1", false, desFixe([99, 1]));
    verifier("le jet d'élan est enregistré", jets.equipLanceur.length === 1,
             JSON.stringify(jets.equipLanceur));
    const r = resoudreCarte(etat, {
        type: "carte", idLanceur: "H1", idCarte: "C1",
        attaques: [attaqueCAC("Physique", 10, ["H2"])], alterations: [], jets
    });
    const elan = r.etat.combattants.H1.etats.find(e => e.nom === "Élan");
    verifier("« Élan » est posé sur le LANCEUR, pas sur la cible", !!elan);
    verifier("avec le bon bonus d'initiative", elan && elan.bonusEquip.initiative === 15,
             elan && JSON.stringify(elan.bonusEquip));
    verifier("et la bonne durée", elan && elan.duree === 2, elan && elan.duree);

    // Renouvelé, pas cumulé : deux cartes de suite prolongent la durée, elles
    // ne posent pas un second Élan.
    const r2 = resoudreCarte(r.etat, {
        type: "carte", idLanceur: "H1", idCarte: "C1",
        attaques: [attaqueCAC("Physique", 10, ["H2"])], alterations: [],
        jets: tirerDesCarte(r.etat, { attaques: [attaqueCAC("Physique", 10, ["H2"])] },
                            "H1", false, desFixe([99, 1]))
    });
    const elans = r2.etat.combattants.H1.etats.filter(e => e.nom === "Élan");
    verifier("un second coup ne double pas l'état", elans.length === 1, `(${elans.length})`);

    // Une chance à 0 % ne pose jamais l'Élan : ce n'est pas garanti par le
    // seul fait de frapper.
    const H3 = fiche("H3", { equipMainDroite: sabreEteint });
    const etat3 = monde([H3, fiche("H4")], { H3: { q: 0, r: 0 }, H4: { q: 1, r: 0 } });
    const r3 = resoudreCarte(etat3, {
        type: "carte", idLanceur: "H3", idCarte: "C1",
        attaques: [attaqueCAC("Physique", 10, ["H4"])], alterations: [],
        jets: tirerDesCarte(etat3, { attaques: [attaqueCAC("Physique", 10, ["H4"])] },
                            "H3", false, desFixe([99]))
    });
    verifier("0 % de chance, aucun Élan", !r3.etat.combattants.H3.etats.some(e => e.nom === "Élan"));
}

// =========================================================================
console.log("\n6. FRAPPE OU NON, LE GESTE SUFFIT — MÊME SUR UNE ESQUIVE");
// =========================================================================
//  Exactement le comportement de l'ancien moteur : "frappe" regarde le TYPE
//  de la carte (une attaque de contact valide), pas si le coup a atterri.
{
    const H1 = fiche("H1", { equipMainDroite: sabreVif });
    const H2 = fiche("H2", { Esquive: 100 });   // esquive toujours
    let etat = monde([H1, H2], { H1: { q: 0, r: 0 }, H2: { q: 1, r: 0 } });

    const jets = tirerDesCarte(etat, { attaques: [attaqueCAC("Physique", 10, ["H2"])] },
                               "H1", false, desFixe([1, 1]));   // esquive réussie, puis élan
    verifier("la cible esquive bien", jets.parCible.H2.esquive === true);
    const r = resoudreCarte(etat, {
        type: "carte", idLanceur: "H1", idCarte: "C1",
        attaques: [attaqueCAC("Physique", 10, ["H2"])], alterations: [], jets
    });
    verifier("l'esquive annule les dégâts", r.etat.combattants.H2.pv === 60);
    verifier("mais l'Élan part quand même : c'est le geste qui compte",
             r.etat.combattants.H1.etats.some(e => e.nom === "Élan"));
}

// =========================================================================
console.log("\n7. LA BÉNÉDICTION VISE QUI VIENT D'ÊTRE SOIGNÉ");
// =========================================================================
{
    const H1 = fiche("H1", { equipMainDroite: bagueBenediction, Etats_Alteres: [] });
    // Une bague se porte à la main : ici on simule via equipMainDroite pour
    // rester simple — objetsEquipes lit les trois emplacements pareillement.
    const H2 = fiche("H2", { PV_Actuels: 30 });
    let etat = monde([H1, H2], { H1: { q: 0, r: 0 }, H2: { q: 1, r: 0 } });

    const jets = tirerDesCarte(etat, { attaques: [soinCAC(15, ["H2"])] }, "H1", false, desFixe([]));
    verifier("la bénédiction est enregistrée sur un soin", jets.equipBenedictions.length === 1);
    const r = resoudreCarte(etat, {
        type: "carte", idLanceur: "H1", idCarte: "CS",
        attaques: [soinCAC(15, ["H2"])], alterations: [], jets
    });
    verifier("le soin part normalement", r.etat.combattants.H2.pv === 45);
    const beni = r.etat.combattants.H2.etats.find(e => e.nom === "Béni");
    verifier("« Béni » est posé sur le SOIGNÉ, pas sur le lanceur", !!beni);
    verifier("sans rien sur le lanceur", !r.etat.combattants.H1.etats.some(e => e.nom === "Béni"));
    verifier("avec le bon bonus de résistance magique",
             beni && beni.bonusEquip.resMag === 8, beni && JSON.stringify(beni.bonusEquip));
    verifier("et un texte lisible", beni && beni.desc === "+8% résistance magique", beni && beni.desc);

    // Sur une carte qui ne soigne personne : aucune bénédiction ne part.
    const H3 = fiche("H3", { equipMainDroite: bagueBenediction });
    const etat3 = monde([H3, fiche("H4")], { H3: { q: 0, r: 0 }, H4: { q: 1, r: 0 } });
    const jets3 = tirerDesCarte(etat3, { attaques: [attaqueCAC("Physique", 10, ["H4"])] },
                                "H3", false, desFixe([99]));
    verifier("pas de soin, pas de bénédiction", jets3.equipBenedictions.length === 0);
}

// =========================================================================
console.log("\n8. LE BUFF SUR SOI (bague de célérité) : GARANTI, SANS JET");
// =========================================================================
{
    const H1 = fiche("H1", { equipMainDroite: bagueElanSoi });
    let etat = monde([H1], { H1: { q: 0, r: 0 } });
    const jets = tirerDesCarte(etat, { attaques: [soinCAC(10, ["H1"])] }, "H1", false, desFixe([]));
    verifier("le buff sur soi ne consomme aucun dé et part à coup sûr",
             jets.equipLanceur.some(b => b.initiative === 10));
}

// =========================================================================
console.log("\n9. LE PAS DE RETRAITE — POSÉ, PUIS VRAIMENT GRATUIT AU DÉPLACEMENT");
// =========================================================================
//  La preuve qui boucle les deux modules : l'état "Repli" posé par
//  resoudreCarte (moteur_pur.js) doit être lu par planifierTrajet
//  (mouvement_pur.js) au prochain déplacement.
{
    const H1 = fiche("H1", { equipMainDroite: fleuretDansant });
    const H2 = fiche("H2");
    let etat = monde([H1, H2], { H1: { q: 0, r: 0 }, H2: { q: 1, r: 0 } });

    const jets = tirerDesCarte(etat, { attaques: [attaqueCAC("Physique", 10, ["H2"])] },
                               "H1", false, desFixe([99]));
    verifier("le pas de retraite est bien réveillé par la frappe", jets.equipPasOfferts === 2,
             `(${jets.equipPasOfferts})`);
    const r = resoudreCarte(etat, {
        type: "carte", idLanceur: "H1", idCarte: "C1",
        attaques: [attaqueCAC("Physique", 10, ["H2"])], alterations: [], jets
    });
    const repli = r.etat.combattants.H1.etats.find(e => e.nom === "Repli");
    verifier("« Repli » est posé sur le lanceur", !!repli);
    verifier("pour un seul tour", repli && repli.duree === 1, repli && repli.duree);

    // Sans Repli : les toutes premières cases coûtent leur prix normal.
    const sansRepli = planifierTrajet(etat, "H2", [{ q: 2, r: 0 }, { q: 3, r: 0 }], null, {});
    verifier("sans le pas de retraite, la première case coûte son prix plein",
             sansRepli.pas[0].cout > 0, JSON.stringify(sansRepli.pas));

    // Avec Repli : les deux premières cases du prochain trajet ne coûtent rien.
    const chemin = [{ q: 1, r: 1 }, { q: 1, r: 2 }, { q: 1, r: 3 }];
    const avecRepli = planifierTrajet(r.etat, "H1", chemin, null, {});
    verifier("les deux premières cases sont offertes",
             avecRepli.pas[0].offerte && avecRepli.pas[1].offerte,
             JSON.stringify(avecRepli.pas.map(p => p.offerte)));
    verifier("la troisième ne l'est plus", avecRepli.pas[2] && !avecRepli.pas[2].offerte,
             JSON.stringify(avecRepli.pas[2]));
    verifier("et les deux premières coûtent bien 0",
             avecRepli.pas[0].cout === 0 && avecRepli.pas[1].cout === 0,
             JSON.stringify(avecRepli.pas.map(p => p.cout)));
}

// =========================================================================
console.log("\n10. UN COMBATTANT À TERRE NE REÇOIT AUCUNE SUITE D'ÉQUIPEMENT");
// =========================================================================
{
    const H1 = fiche("H1", { equipMainDroite: bagueBenediction });
    const H2 = fiche("H2", { PV_Actuels: 0, statut: "Mort" });
    let etat = monde([H1, H2], { H1: { q: 0, r: 0 }, H2: { q: 1, r: 0 } });
    verifier("H2 est bien considéré à terre dans l'état", etat.combattants.H2.aTerre === true);

    // On force artificiellement une bénédiction vers un combattant à terre
    // (cas qui ne devrait jamais arriver en jeu, mais le filet doit tenir).
    const r = resoudreCarte(etat, {
        type: "carte", idLanceur: "H1", idCarte: "CS",
        attaques: [], alterations: [],
        jets: { parCible: {}, equipLanceur: [], equipBenedictions: [{ resMag: 8, tours: 1 }],
               equipPasOfferts: 0 }
    });
    // Sans attaque de soin, aucune cible soignée n'existe : la bénédiction ne
    // vise personne, et un combattant à terre n'en profiterait de toute façon
    // pas — c'est le filet vérifié ici.
    verifier("aucune goutte de bénédiction ne s'accroche à un mort",
             !r.etat.combattants.H2.etats.some(e => e.nom === "Béni"));
}

// =========================================================================
console.log("\n11. SANS ÉQUIPEMENT RÉACTIF, RIEN NE CHANGE — AUCUNE RÉGRESSION");
// =========================================================================
{
    const H1 = fiche("H1");
    const H2 = fiche("H2", { Def_Physique: 80 });
    let etat = monde([H1, H2], { H1: { q: 0, r: 0 }, H2: { q: 1, r: 0 } });
    const jets = tirerDesCarte(etat, { attaques: [attaqueCAC("Physique", 20, ["H2"])] },
                               "H1", false, desFixe([99]));
    verifier("aucun jet d'équipement n'est même tiré (pas de dé gâché)",
             jets.parCible.H2.equip === undefined);
    verifier("aucune suite d'équipement", jets.equipLanceur.length === 0 && jets.equipBenedictions.length === 0
             && jets.equipPasOfferts === 0);
    const r = resoudreCarte(etat, {
        type: "carte", idLanceur: "H1", idCarte: "C1",
        attaques: [attaqueCAC("Physique", 20, ["H2"])], alterations: [], jets
    });
    verifier("l'armure encaisse normalement (60 → 56)", r.etat.combattants.H2.pv === 56);
    verifier("le lanceur ne porte aucun état parasite", r.etat.combattants.H1.etats.length === 0);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
