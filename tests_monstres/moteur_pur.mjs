// LE MOTEUR PUR, MIS À L'ÉPREUVE — ÉTAPE 2 DE LA NOUVELLE ARCHITECTURE.
//
// La chaîne de dégâts du jeu, extraite des 828 lignes de jouerAnimationMoteur et
// réduite à ce qu'elle est vraiment : une suite d'opérations sur des nombres.
// Ce banc l'attaque sans Firestore, sans navigateur, sans minuteur.
//
// L'ORDRE DE LA CHAÎNE EST LA RÈGLE DU JEU, et chaque chapitre en garde un
// maillon : le critique double à la source, le tir à bout portant ampute de
// trente pour cent, l'absorption draine avant que le reste ne frappe, la
// résistance réduit, l'étalement coupe APRÈS les résistances, le bouclier
// encaisse avant les points de vie. Changer cet ordre change l'équilibre du
// jeu — et sans ce banc, personne ne s'en apercevrait.
import {
    jouer, resoudreCarte, chaineDeDegats, tirerDesCarte, tirerCritique,
    esquiveDe, paradeDe, defPhysiqueDe, distanceHex
} from '../moteur_pur.js';
import { construireEtatCombat, creerDes, verifierEtatCombat, clonerEtat } from '../combat_etat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const FICHES = [
    { idPersonnage: "H1", idJoueur: "P_01", camp: "Allié", prenom: "Naomi",
      PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, Fatigue_Actuelle: 100,
      Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
      Bouclier_Actuel: 0, Bouclier_Max: 20, Etats_Alteres: [], statut: "Vivant" },
    { idPersonnage: "H2", idJoueur: "P_03", camp: "Allié", prenom: "Pliors",
      PV_Max: 50, PV_Actuels: 50, Fatigue_Max: 100, Esquive: 0, Parade: 0,
      Def_Physique: 25, Def_Magique: 50, Bouclier_Actuel: 0, Bouclier_Max: 20,
      Etats_Alteres: [], statut: "Vivant" },
    { idPersonnage: "M1", estMonstre: true, camp: "Ennemi", nom: "Goule",
      PV_Max: 70, PV_Actuels: 70, Fatigue_Max: 90, Esquive: 0, Parade: 0,
      Critique: 100, Def_Physique: 0, Etats_Alteres: [], statut: "Vivant" }
];
const POSITIONS = { H1: { q: 0, r: 0 }, H2: { q: 3, r: 0 }, M1: { q: 1, r: 0 } };
const PARTIE = { Phase_Combat: "Resolution", Tour_Combat: 1,
                 Ordre_Initiative: ["M1", "H1", "H2"],
                 File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "C1" }] };

const neuf = () => construireEtatCombat({
    idPartie: "P1", cerveau: "P_03", graine: 4242,
    combattants: FICHES, positions: POSITIONS, partie: PARTIE
});

// Une carte toute simple : une attaque, une cible, aucun jet perdu.
const frappe = (idCible, valeur, extra = {}) => ({
    type: "carte", idLanceur: "M1", idCarte: "C1",
    attaques: [{ valeurBrute: valeur, cibles: [idCible], ...extra }],
    alterations: [],
    jets: { attaqueRatee: false, parCible: { [idCible]: { esquive: false, etats: {} } } }
});

// =========================================================================
console.log("\n1. LA CHAÎNE DE DÉGÂTS, MAILLON PAR MAILLON");
// =========================================================================
{
    const sansDefense = { pv: 60, pvMax: 60, bouclier: 0, etats: [], def: {} };

    let c = chaineDeDegats(sansDefense, { valeurBrute: 20 }, {});
    verifier("sans défense ni bouclier, tout passe", c.degats === 20 && c.versPv === 20);

    c = chaineDeDegats(sansDefense, { valeurBrute: 20 }, { critique: true });
    verifier("un critique double à la source", c.degats === 40, `(${c.degats})`);

    c = chaineDeDegats(sansDefense, { valeurBrute: 20, isRanged: true }, { distance: 1 });
    verifier("une arme de jet perd 30 % au contact", c.degats === 14, `(${c.degats})`);
    c = chaineDeDegats(sansDefense, { valeurBrute: 20, isRanged: true }, { distance: 2 });
    verifier("mais pas à deux cases", c.degats === 20, `(${c.degats})`);

    // 25 % de résistance physique sur 20 de brut : 15.
    const blinde = { pv: 50, pvMax: 50, bouclier: 0, etats: [], def: { physique: 25, magique: 50 } };
    c = chaineDeDegats(blinde, { valeurBrute: 20 }, {});
    verifier("la résistance physique réduit d'autant", c.degats === 15, `(${c.degats})`);
    c = chaineDeDegats(blinde, { valeurBrute: 20, typeRes: "Magique" }, {});
    verifier("une attaque magique se heurte à la résistance magique", c.degats === 10, `(${c.degats})`);
    c = chaineDeDegats(blinde, { valeurBrute: 20 }, { percee: true });
    verifier("une armure percée ne réduit plus rien", c.degats === 20, `(${c.degats})`);

    // Étalement : 15 après résistances → 8 maintenant, 7 plus tard.
    c = chaineDeDegats(blinde, { valeurBrute: 20, estEtalement: true }, {});
    verifier("l'étalement coupe APRÈS les résistances",
             c.degats === 8 && c.secondTic === 7, `(${c.degats} + ${c.secondTic})`);
    verifier("et les deux moitiés font exactement le total",
             c.degats + c.secondTic === 15);

    // Absorption : 20 % annulés, drain de 10 % du brut.
    const absorbant = { pv: 40, pvMax: 60, bouclier: 0,
                        etats: [{ nom: "Absorption", valeurAbs: 20 }], def: {} };
    c = chaineDeDegats(absorbant, { valeurBrute: 30 }, {});
    verifier("l'absorption annule sa part", c.degats === 24, `(${c.degats})`);
    verifier("et draine dix pour cent du brut", c.soinAbsorption === 3, `(${c.soinAbsorption})`);

    // Bouclier : il encaisse en premier, et ce qui le dépasse est perdu.
    const protege = { pv: 60, pvMax: 60, bouclier: 12, etats: [], def: {} };
    c = chaineDeDegats(protege, { valeurBrute: 5 }, {});
    verifier("un petit coup n'entame que le bouclier",
             c.versBouclier === 5 && c.bouclierApres === 7 && c.versPv === 0);
    c = chaineDeDegats(protege, { valeurBrute: 30 }, {});
    verifier("un gros coup le brise", c.bouclierBrise === true && c.bouclierApres === 0);
    verifier("et le surplus ne passe pas au travers", c.versPv === 0);
}

// =========================================================================
console.log("\n2. UNE CARTE QUI FRAPPE, DE BOUT EN BOUT");
// =========================================================================
{
    const etat = neuf();
    const { etat: apres, etapes } = resoudreCarte(etat, frappe("H1", 18));

    verifier("les points de vie tombent du bon montant",
             apres.combattants.H1.pv === 42, `(${apres.combattants.H1.pv})`);
    verifier("l'état de départ n'a pas bougé", etat.combattants.H1.pv === 60);
    verifier("la première étape annonce la carte", etapes[0].type === "carte");
    verifier("elle nomme ses cibles", etapes[0].cibles.join(",") === "H1");
    verifier("l'étape de dégâts porte le RÉSULTAT, pas l'opération",
             etapes.some(e => e.type === "degats" && e.pvApres === 42));
    verifier("et l'état reste cohérent", verifierEtatCombat(apres).length === 0,
             verifierEtatCombat(apres).join(" | "));
}

// =========================================================================
console.log("\n3. UNE ESQUIVE ARRÊTE TOUTE LA CARTE");
// =========================================================================
//  La cible n'esquive pas chaque effet séparément : elle esquive le coup. Ni
//  dégâts, ni état posé.
{
    const etat = neuf();
    const action = {
        type: "carte", idLanceur: "M1", idCarte: "C1",
        attaques: [{ valeurBrute: 18, cibles: ["H1"] }],
        alterations: [{ nom: "Saignement", tours: 3, chance: 100, cibles: ["H1"] }],
        jets: { parCible: { H1: { esquive: true, etats: { Saignement: true } } } }
    };
    const { etat: apres, etapes } = resoudreCarte(etat, action);

    verifier("aucun point de vie perdu", apres.combattants.H1.pv === 60);
    verifier("aucun état posé", apres.combattants.H1.etats.length === 0);
    verifier("et l'esquive est racontée", etapes.some(e => e.type === "esquive"));
}

// =========================================================================
console.log("\n4. LES ÉTATS SE RENOUVELLENT, ILS NE S'EMPILENT PAS");
// =========================================================================
//  Deux brûlures successives sur la même fiche donnaient deux compteurs
//  distincts, et la cible brûlait deux fois par tour.
{
    let etat = neuf();
    const poser = (tours) => ({
        type: "carte", idLanceur: "M1", idCarte: "C1", attaques: [],
        alterations: [{ nom: "Brûlure", tours, chance: 100, cibles: ["H1"] }],
        jets: { parCible: { H1: { esquive: false, etats: { "Brûlure": true } } } }
    });

    etat = resoudreCarte(etat, poser(3)).etat;
    verifier("le premier état se pose", etat.combattants.H1.etats.length === 1);

    etat = resoudreCarte(etat, poser(2)).etat;
    verifier("le second ne s'empile pas", etat.combattants.H1.etats.length === 1,
             `(${etat.combattants.H1.etats.length})`);
    verifier("et c'est la plus longue durée qui reste",
             etat.combattants.H1.etats[0].tours === 3, `(${etat.combattants.H1.etats[0].tours})`);

    // Un jet raté ne pose rien.
    const rate = resoudreCarte(etat, {
        type: "carte", idLanceur: "M1", idCarte: "C1", attaques: [],
        alterations: [{ nom: "Glacé", tours: 2, chance: 30, cibles: ["H1"] }],
        jets: { parCible: { H1: { esquive: false, etats: { "Glacé": false } } } }
    });
    verifier("un jet d'état raté ne pose rien",
             rate.etat.combattants.H1.etats.length === 1);
    verifier("et le dit quand même", rate.etapes.some(e => e.type === "etatRate"));
}

// =========================================================================
console.log("\n5. UNE CRÉATURE NE CRITIQUE JAMAIS");
// =========================================================================
//  Une règle du jeu, vérifiée DEUX fois : au lancement, et au point d'effet.
//  Le second verrou compte, parce qu'une action reçue peut mentir.
{
    const etat = neuf();
    const des = creerDes(1);
    verifier("le tirage refuse le critique à une créature",
             tirerCritique(etat, "M1", des) === false);

    // Même en le lui prêtant de force, l'application le refuse.
    const menteuse = { ...frappe("H1", 20), critique: true };
    const { etat: apres } = resoudreCarte(etat, menteuse);
    verifier("et l'application ne double pas les dégâts",
             apres.combattants.H1.pv === 40, `(${apres.combattants.H1.pv})`);

    // Un héros avec 100 % de critique, lui, critique toujours.
    const heros = { ...frappe("H1", 20), idLanceur: "H2" };
    const etatHeros = clonerEtat(etat);
    etatHeros.combattants.H2.def.critique = 100;
    const critique = tirerCritique(etatHeros, "H2", creerDes(5));
    verifier("un héros à 100 % critique bien", critique === true);
    const { etat: fort } = resoudreCarte(etatHeros, { ...heros, critique: true });
    verifier("et son coup double", fort.combattants.H1.pv === 20, `(${fort.combattants.H1.pv})`);
}

// =========================================================================
console.log("\n6. LA CHUTE EST EXPLICITE, ET L'ÉTAT RESTE COHÉRENT");
// =========================================================================
//  « À terre » commande la file d'initiative. On ne le déduit plus au petit
//  bonheur : le moteur le dit, et l'invariant le vérifie.
{
    const etat = neuf();
    const { etat: apres, etapes } = resoudreCarte(etat, frappe("H1", 200));

    verifier("les points de vie s'arrêtent à zéro", apres.combattants.H1.pv === 0);
    verifier("le combattant est marqué à terre", apres.combattants.H1.aTerre === true);
    verifier("et la chute est une étape à part entière",
             etapes.some(e => e.type === "chute" && e.cible === "H1"));

    // L'invariant signale qu'il faut le sortir de la file — c'est le travail du
    // cerveau, et le banc vérifie que rien ne l'oublie en silence.
    const soucis = verifierEtatCombat(apres);
    verifier("l'invariant réclame son retrait de la file",
             soucis.every(s => s.includes("dans la file")), soucis.join(" | "));

    // Un mort ne se fait plus frapper.
    const encore = resoudreCarte(apres, frappe("H1", 30));
    verifier("un combattant à terre n'est plus une cible",
             encore.etat.combattants.H1.pv === 0
             && !encore.etapes.some(e => e.type === "degats"));
}

// =========================================================================
console.log("\n7. SOIN, BOUCLIER, PURIFICATION");
// =========================================================================
{
    let etat = neuf();
    etat.combattants.H1.pv = 20;

    const soin = resoudreCarte(etat, {
        type: "carte", idLanceur: "H2", idCarte: "CS",
        attaques: [{ valeurBrute: 15, isHeal: true, cibles: ["H1"] }], alterations: [],
        jets: { parCible: { H1: { esquive: false, etats: {} } } }
    });
    verifier("un soin remonte les points de vie", soin.etat.combattants.H1.pv === 35);

    const trop = resoudreCarte(soin.etat, {
        type: "carte", idLanceur: "H2", idCarte: "CS",
        attaques: [{ valeurBrute: 999, isHeal: true, cibles: ["H1"] }], alterations: [],
        jets: { parCible: { H1: { esquive: false, etats: {} } } }
    });
    verifier("et ne dépasse jamais le maximum", trop.etat.combattants.H1.pv === 60);

    const bouclier = resoudreCarte(etat, {
        type: "carte", idLanceur: "H2", idCarte: "CB",
        attaques: [{ valeurBrute: 12, isShield: true, cibles: ["H1"] }], alterations: [],
        jets: { parCible: { H1: { esquive: false, etats: {} } } }
    });
    verifier("un bouclier se pose", bouclier.etat.combattants.H1.bouclier === 12);

    // Purification : la cible perd tous ses états.
    let malade = clonerEtat(etat);
    malade.combattants.H1.etats = [{ nom: "Poison", tours: 3 }, { nom: "Glacé", tours: 2 }];
    const pur = resoudreCarte(malade, {
        type: "carte", idLanceur: "H2", idCarte: "CP",
        attaques: [{ valeurBrute: 0, isHeal: true, purifChance: 100, cibles: ["H1"] }],
        alterations: [],
        jets: { parCible: { H1: { esquive: false, purifie: true, etats: {} } } }
    });
    verifier("la purification lève tous les états", pur.etat.combattants.H1.etats.length === 0);
}

// =========================================================================
console.log("\n8. LE PAS COMPLET : jouer()");
// =========================================================================
//  Ce que le cerveau appellera. Une action entre, un état et une entrée de
//  journal sortent — l'unité qui partira dans un seul writeBatch.
{
    const etat = neuf();
    const { etat: apres, entree } = jouer(etat, { ...frappe("H1", 12), id: "INT_a4f2" });

    verifier("la version avance d'exactement un", apres.version === etat.version + 1);
    verifier("l'entrée porte le même numéro", entree.v === apres.version);
    verifier("elle nomme l'intention qui l'a causée", entree.cause === "INT_a4f2");
    verifier("et la graine du pas suivant", entree.graine === apres.graine && apres.graine !== etat.graine);
    verifier("les étapes sont dans l'entrée", entree.etapes.length > 0);
    verifier("l'état a bien encaissé", apres.combattants.H1.pv === 48);
}

// =========================================================================
console.log("\n9. LE MÊME COMBAT, DEUX FOIS, AU CARACTÈRE PRÈS");
// =========================================================================
//  La propriété qui change tout : le hasard vient de la graine, donc rejouer
//  une partie depuis le même départ redonne exactement la même partie. Chaque
//  combat que Nico jouera pourra devenir un test de non-régression.
{
    const derouler = () => {
        let etat = neuf();
        const entrees = [];
        for (let i = 0; i < 40; i++) {
            const action = {
                type: "carte", idLanceur: "M1", idCarte: "C" + i,
                attaques: [{ valeurBrute: 3, cibles: ["H1"] }],
                alterations: [{ nom: "Poison", tours: 2, chance: 40, cibles: ["H1"] }]
            };
            const pas = jouer(etat, action);
            etat = pas.etat;
            entrees.push(pas.entree);
            if (etat.combattants.H1.aTerre) break;
        }
        return { etat, entrees };
    };

    const a = derouler(), b = derouler();
    verifier("deux exécutions donnent le même état final",
             JSON.stringify(a.etat) === JSON.stringify(b.etat));
    verifier("et exactement le même journal",
             JSON.stringify(a.entrees) === JSON.stringify(b.entrees));
    verifier("les dés ont bien varié en chemin",
             new Set(a.entrees.map(e => e.graine)).size === a.entrees.length);
}

// =========================================================================
console.log("\n10. DIX MILLE CARTES AU HASARD, AUCUN ÉTAT INCOHÉRENT");
// =========================================================================
//  Le test de propriété. On ne vérifie pas un résultat attendu : on vérifie
//  qu'aucune règle n'est violée, quoi qu'on lance. Un échec sort avec de quoi
//  le reproduire.
{
    let violations = 0, premiere = "";
    const des = creerDes(20260909);

    for (let essai = 0; essai < 10000; essai++) {
        let etat = neuf();
        etat.combattants.H1.bouclier = des.entier(0, 20);
        etat.combattants.H1.etats = des.chance(30) ? [{ nom: "Absorption", valeurAbs: des.entier(5, 60) }] : [];
        etat.combattants.H2.def.physique = des.entier(0, 120);   // au-delà de 100 aussi

        const cible = des.parmi(["H1", "H2"]);
        const action = {
            type: "carte", idLanceur: "M1", idCarte: "C",
            attaques: [{
                valeurBrute: des.entier(-5, 300),
                isRanged: des.chance(30),
                isHeal: des.chance(15),
                isShield: des.chance(10),
                estEtalement: des.chance(20),
                typeRes: des.chance(50) ? "Magique" : "Physique",
                cibles: [cible]
            }],
            alterations: des.chance(40)
                ? [{ nom: "Poison", tours: des.entier(1, 5), chance: 100, cibles: [cible] }] : [],
            critique: des.chance(20)
        };

        const { etat: apres } = jouer(etat, action);
        const soucis = verifierEtatCombat(apres).filter(s => !s.includes("dans la file"));
        if (soucis.length) {
            violations++;
            if (!premiere) premiere = `essai ${essai} : ${soucis[0]}`;
        }
    }

    verifier("dix mille cartes au hasard, aucun état incohérent", violations === 0,
             premiere || `(${violations} violation(s))`);
}

// =========================================================================
console.log("\n11. LES DÉS DE LA CARTE SE TIRENT DANS UN ORDRE STABLE");
// =========================================================================
//  Deux exécutions ne donnent la même partie que si elles consomment les dés
//  dans le même ordre. Ce contrôle-là garde l'ordre : attaques d'abord,
//  altérations ensuite, chacune dans l'ordre de la carte.
{
    const etat = neuf();
    const plan = {
        attaques: [{ valeurBrute: 10, cibles: ["H1", "H2"] }],
        alterations: [{ nom: "Poison", tours: 2, chance: 50, cibles: ["H1"] },
                      { nom: "Glacé", tours: 1, chance: 50, cibles: ["H2"] }]
    };
    const a = tirerDesCarte(etat, plan, "M1", false, creerDes(777));
    const b = tirerDesCarte(etat, plan, "M1", false, creerDes(777));
    verifier("le même plan et la même graine donnent les mêmes jets",
             JSON.stringify(a) === JSON.stringify(b));
    verifier("chaque cible a son entrée",
             !!a.parCible.H1 && !!a.parCible.H2);
    verifier("l'esquive d'une cible ne se tire qu'une fois",
             typeof a.parCible.H1.esquive === "boolean");

    // Un lanceur étourdi consomme un dé de plus, en premier : c'est ce décalage
    // qui rendrait deux postes divergents s'il n'était pas tiré au même endroit.
    const etourdi = clonerEtat(etat);
    etourdi.combattants.M1.etats = [{ nom: "Étourdi", tours: 2 }];
    const c = tirerDesCarte(etourdi, plan, "M1", false, creerDes(777));
    verifier("un lanceur étourdi tire son jet d'échec en premier",
             typeof c.attaqueRatee === "boolean" && JSON.stringify(c) !== JSON.stringify(a));

    // Et l'échec arrête la carte.
    const rate = resoudreCarte(etourdi, {
        type: "carte", idLanceur: "M1", idCarte: "C1",
        attaques: [{ valeurBrute: 30, cibles: ["H1"] }], alterations: [],
        jets: { attaqueRatee: true, parCible: { H1: { esquive: false, etats: {} } } }
    });
    verifier("un étourdi qui rate ne fait aucun dégât",
             rate.etat.combattants.H1.pv === 60 && rate.etapes.some(e => e.type === "echec"));
}

// =========================================================================
console.log("\n12. LES DÉFENSES SUIVENT LES ÉTATS, PAS SEULEMENT LA FICHE");
// =========================================================================
//  Les défenses sont figées au début du combat pour que le rejeu soit exact,
//  mais un enchantement posé en cours de route doit compter. C'est le seul
//  morceau que le moteur recalcule, et il le fait depuis l'état.
{
    const etat = neuf();
    verifier("sans état, la défense est celle de la fiche",
             defPhysiqueDe(etat.combattants.H2) === 25, `(${defPhysiqueDe(etat.combattants.H2)})`);

    const beni = clonerEtat(etat);
    beni.combattants.H2.etats = [{ nom: "Bénédiction", tours: 3, bonusEquip: { resPhys: 20, parade: 10 } }];
    verifier("un enchantement s'ajoute à la résistance",
             defPhysiqueDe(beni.combattants.H2) === 45, `(${defPhysiqueDe(beni.combattants.H2)})`);
    verifier("et à la parade", paradeDe(beni.combattants.H2) === 10);
    verifier("l'esquive, elle, n'a pas bougé", esquiveDe(beni.combattants.H2) === 0);

    // Et le coup le sent passer : 20 de brut, 45 % de résistance → 11.
    const { etat: apres } = resoudreCarte(beni, frappe("H2", 20));
    verifier("le coup encaisse la résistance enrichie",
             apres.combattants.H2.pv === 39, `(${apres.combattants.H2.pv})`);
}

// =========================================================================
console.log("\n13. LA DISTANCE, ET LE MALUS DE BOUT PORTANT EN SITUATION");
// =========================================================================
{
    const etat = neuf();
    verifier("la goule est au contact du héros",
             distanceHex(etat.combattants.M1, etat.combattants.H1) === 1);
    verifier("et à deux cases de l'autre",
             distanceHex(etat.combattants.M1, etat.combattants.H2) === 2);

    const arc = (idCible) => ({ ...frappe(idCible, 20, { isRanged: true }) });
    const proche = resoudreCarte(etat, arc("H1"));
    verifier("l'arc tiré au contact ne fait que 14", proche.etat.combattants.H1.pv === 46,
             `(${proche.etat.combattants.H1.pv})`);

    // H2 a 25 % de résistance : 20 → 15.
    const loin = resoudreCarte(etat, arc("H2"));
    verifier("à deux cases, il fait ses dégâts pleins (moins l'armure)",
             loin.etat.combattants.H2.pv === 35, `(${loin.etat.combattants.H2.pv})`);

    // Un combattant sans case n'est à portée de rien.
    const absent = clonerEtat(etat);
    absent.combattants.H2.q = null;
    absent.combattants.H2.r = null;
    verifier("un combattant hors du plateau est à distance infinie",
             distanceHex(absent.combattants.M1, absent.combattants.H2) === Infinity);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
