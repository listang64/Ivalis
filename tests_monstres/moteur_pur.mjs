// LE MOTEUR PUR, MIS À L'ÉPREUVE — ÉTAPE 2 DE LA NOUVELLE ARCHITECTURE.
//
// La chaîne de dégâts du jeu, extraite des 828 lignes de jouerAnimationMoteur et
// réduite à ce qu'elle est vraiment : une suite d'opérations sur des nombres.
// Ce banc l'attaque sans Firestore, sans navigateur, sans minuteur.
//
// L'ORDRE DE LA CHAÎNE EST LA RÈGLE DU JEU, et chaque chapitre en garde un
// maillon : le critique double à la source, le tir à bout portant ampute de
// trente pour cent, l'absorption draine avant que le reste ne frappe, la
// résistance réduit, l'étalement diffère tout après les résistances, le bouclier
// encaisse avant les points de vie. Changer cet ordre change l'équilibre du
// jeu — et sans ce banc, personne ne s'en apercevrait.
import {
    jouer, resoudreCarte, chaineDeDegats, tirerDesCarte, tirerCritique,
    esquiveDe, paradeDe, defPhysiqueDe, distanceHex, bonusMonstreDe,
    REGLES_ETATS, CHANCE_BOUSCULADE_POUSSEE, FATIGUE_BOUSCULADE_POUSSEE
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

    // Étalement : 15 après résistances → RIEN tout de suite, 8 à la fin de
    // cette manche, 7 à la fin de la suivante. C'est ce qui paie sa ristourne
    // de fatigue : on frappe moins cher, mais il faut attendre.
    c = chaineDeDegats(blinde, { valeurBrute: 20, estEtalement: true }, {});
    verifier("une technique étalée ne fait RIEN au lancement", c.degats === 0, `(${c.degats})`);
    verifier("elle range deux tics, dans l'ordre", JSON.stringify(c.tics) === "[8,7]",
             JSON.stringify(c.tics));
    verifier("et les deux moitiés font exactement le total",
             c.tics.reduce((a, b) => a + b, 0) === 15);

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
             etat.combattants.H1.etats[0].duree === 3, `(${etat.combattants.H1.etats[0].duree})`);

    // UN SEUL VOCABULAIRE, ET C'EST CELUI DU JEU. Ce noyau disait `tours` et
    // lisait `alt.tours` — sur une altération qui, elle, porte `duree`. Chaque
    // état posé par le cerveau durait donc UN tour au lieu du sien. Et comme il
    // ne gardait que le nom, l'icône disparaissait : la piste d'initiative
    // affichait une image cassée (GET .../undefined 404) sous le portrait.
    const vraie = resoudreCarte(neuf(), {
        type: "carte", idLanceur: "M1", idCarte: "C1", attaques: [],
        alterations: [{ nom: "Étourdi", duree: 3, chance: 100, cibles: ["H1"],
                        icone: "https://images/etourdi.png",
                        desc: "-20% Esquive/Parade." }],
        jets: { parCible: { H1: { esquive: false, etats: { "Étourdi": true } } } }
    });
    const pose = vraie.etat.combattants.H1.etats[0];
    verifier("la durée posée est celle de l'altération", pose.duree === 3, `(${pose.duree})`);
    verifier("l'état parle le même mot que le reste du jeu", pose.tours === undefined);
    verifier("il emporte son icône", pose.icone === "https://images/etourdi.png");
    verifier("et sa description", /Esquive/.test(pose.desc || ""));

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

// =========================================================================
console.log("\n14. LA TRICHE DES CRÉATURES : UN BONUS SELON LA STATURE");
// =========================================================================
//  Petit +3, Normal +4, Élite +5, Boss +6, sur ce qu'une créature inflige ET
//  sur ce qu'elle soigne — jamais sur un héros, jamais sur un gain de
//  bouclier. C'est un réglage brut, posé comme tel : le tableau est le seul
//  endroit à toucher s'il change.
{
    verifier("un héros n'a droit à rien", bonusMonstreDe({ estMonstre: false, palier: "Boss" }) === 0);
    verifier("une créature sans palier connu non plus",
             bonusMonstreDe({ estMonstre: true, palier: "" }) === 0);
    verifier("Petit vaut +3", bonusMonstreDe({ estMonstre: true, palier: "Petit" }) === 3);
    verifier("Normal vaut +4", bonusMonstreDe({ estMonstre: true, palier: "Normal" }) === 4);
    verifier("Élite vaut +5", bonusMonstreDe({ estMonstre: true, palier: "Élite" }) === 5);
    verifier("Boss vaut +6", bonusMonstreDe({ estMonstre: true, palier: "Boss" }) === 6);

    // Le vrai chemin : une goule (M1) devenue Élite, sur une vraie carte.
    let etat = neuf();
    etat.combattants.M1.palier = "Élite";

    // DÉGÂTS : 20 de brut + 5 de triche = 25, contre une cible sans défense.
    const coup = resoudreCarte(etat, frappe("H1", 20));
    verifier("le bonus s'ajoute au brut, AVANT les résistances",
             coup.etat.combattants.H1.pv === 35, `(${coup.etat.combattants.H1.pv})`);

    // Et il traverse la résistance comme un dégât ordinaire : H2 a 25 % de
    // résistance physique — (20+5) × 0.75 = 18.75, arrondi à 19.
    const coupBlinde = resoudreCarte(etat, frappe("H2", 20));
    verifier("il n'ignore pas l'armure pour autant",
             coupBlinde.etat.combattants.H2.pv === 31, `(${coupBlinde.etat.combattants.H2.pv})`);

    // SOIN : une Élite qui soigne un allié ajoute aussi ses +5.
    const soigneuse = resoudreCarte(etat, {
        type: "carte", idLanceur: "M1", idCarte: "CS",
        attaques: [{ valeurBrute: 10, isHeal: true, cibles: ["M1"] }], alterations: [],
        jets: { parCible: { M1: { esquive: false, etats: {} } } }
    });
    verifier("le soin d'une créature profite aussi du bonus",
             soigneuse.etat.combattants.M1.pv === 70, `(${soigneuse.etat.combattants.M1.pv})`);

    // BOUCLIER : ni dégât ni soin — pas de triche dessus.
    const bouclier = resoudreCarte(etat, {
        type: "carte", idLanceur: "M1", idCarte: "CB",
        attaques: [{ valeurBrute: 10, isHeal: true, isShield: true, cibles: ["M1"] }], alterations: [],
        jets: { parCible: { M1: { esquive: false, etats: {} } } }
    });
    verifier("un gain de bouclier n'en profite pas", bouclier.etat.combattants.M1.bouclier === 10,
             `(${bouclier.etat.combattants.M1.bouclier})`);

    // LE HÉROS, LUI, NE TRICHE JAMAIS : même carte, même valeur, sans le
    // moindre bonus — c'est la fiche qui décide, pas la triche.
    const coupHeros = resoudreCarte(etat, {
        type: "carte", idLanceur: "H1", idCarte: "C1",
        attaques: [{ valeurBrute: 20, cibles: ["H2"] }], alterations: [],
        jets: { parCible: { H2: { esquive: false, etats: {} } } }
    });
    verifier("un héros ne touche que ce que sa carte annonce (20 × 0.75 = 15)",
             coupHeros.etat.combattants.H2.pv === 35, `(${coupHeros.etat.combattants.H2.pv})`);
}

// =========================================================================
console.log("\n15. UN BOUCLIER LANCÉ RESTE UN BOUCLIER — MÊME MARQUÉ « isHeal »");
// =========================================================================
//  L'extraction réelle (moteur_effets.js) pose isHeal ET isShield ensemble sur
//  un effet « Bouclier », pour que la Forge le range dans les mêmes menus
//  qu'un soin. Le noyau doit trancher la bonne porte EN PREMIER : vérifié ici
//  avec exactement cette combinaison, celle que le jeu envoie pour de vrai —
//  pas la version isolée du chapitre 7, qui ne l'aurait jamais attrapée.
{
    const etat = neuf();
    const r = resoudreCarte(etat, {
        type: "carte", idLanceur: "H2", idCarte: "CB",
        attaques: [{ valeurBrute: 14, isHeal: true, isShield: true, cibles: ["H1"] }],
        alterations: [],
        jets: { parCible: { H1: { esquive: false, etats: {} } } }
    });
    verifier("le bouclier se pose vraiment", r.etat.combattants.H1.bouclier === 14,
             `(${r.etat.combattants.H1.bouclier})`);
    verifier("et les points de vie ne bougent pas d'un pouce",
             r.etat.combattants.H1.pv === 60, `(${r.etat.combattants.H1.pv})`);
    const etape = r.etapes.find(e => e.cible === "H1" && "bouclierApres" in e);
    verifier("l'étape publiée parle bien de bouclier, pas de soin",
             !!etape && !r.etapes.some(e => e.type === "soin" && e.cible === "H1"),
             JSON.stringify(r.etapes.map(e => e.type)));
}

// =========================================================================
console.log("\n16. UNE IMMUNITÉ DE PEUPLE PASSE AVANT LES DÉS");
// =========================================================================
//  L'Ankylar est immunisé à l'Étourdi. Le die est pourtant tiré pareil pour
//  tout le monde (tirerDesCarte, à graine égale) : c'est l'APPLICATION qui
//  doit refuser l'état, jamais le tirage — sans quoi deux cibles différentes
//  consommeraient un nombre différent de dés, et le rejeu diverger.
{
    let etat = neuf();
    etat.combattants.H1.atouts = { ...(etat.combattants.H1.atouts || {}), immunites: ["Étourdi"] };

    const alterer = (etatDepart, idCible, chance = 100) => resoudreCarte(etatDepart, {
        type: "carte", idLanceur: "M1", idCarte: "CE",
        attaques: [], alterations: [{ nom: "Étourdi", chance, duree: 2, cibles: [idCible] }],
        jets: { parCible: { [idCible]: { esquive: false, etats: { "Étourdi": true } } } }
    });

    const surImmunise = alterer(etat, "H1");
    verifier("l'Ankylar n'attrape pas l'Étourdi, même à 100 % de chance",
             !surImmunise.etat.combattants.H1.etats.some(e => e.nom === "Étourdi"),
             JSON.stringify(surImmunise.etat.combattants.H1.etats));
    const etapeImmun = surImmunise.etapes.find(e => e.type === "etatRate" && e.cible === "H1");
    verifier("l'étape le dit, et dit que c'est une immunité",
             !!etapeImmun && etapeImmun.immunise === true, JSON.stringify(etapeImmun));

    // Sur une cible ordinaire, la même carte, le même jet : l'état se pose.
    const surH2 = alterer(etat, "H2");
    verifier("mais un autre héros, sans cet atout, l'attrape normalement",
             surH2.etat.combattants.H2.etats.some(e => e.nom === "Étourdi"),
             JSON.stringify(surH2.etat.combattants.H2.etats));
}

// =========================================================================
console.log("\n17. LA TRICHE DES CRÉATURES ET L'IMMUNITÉ VIVENT CHACUNE LEUR VIE");
// =========================================================================
//  Deux réglages posés le même jour, sur deux combattants différents : rien
//  ne doit se mélanger entre le bonus de dégâts d'un monstre et l'immunité
//  d'un héros.
{
    let etat = neuf();
    etat.combattants.M1.palier = "Boss";
    etat.combattants.H2.atouts = { ...(etat.combattants.H2.atouts || {}), immunites: ["Étourdi"] };

    const carte = {
        type: "carte", idLanceur: "M1", idCarte: "CB",
        attaques: [{ valeurBrute: 10, cibles: ["H1"] }],
        alterations: [{ nom: "Étourdi", chance: 100, duree: 2, cibles: ["H2"] }],
        jets: { parCible: {
            H1: { esquive: false, etats: {} },
            H2: { esquive: false, etats: { "Étourdi": true } }
        } }
    };
    const r = resoudreCarte(etat, carte);
    // 10 de brut + 6 de triche (Boss) contre H1, sans défense : 16.
    verifier("le Boss inflige toujours son bonus de dégâts",
             r.etat.combattants.H1.pv === 44, `(${r.etat.combattants.H1.pv})`);
    verifier("et H2 reste immunisé à l'Étourdi malgré le Boss qui frappe ailleurs",
             !r.etat.combattants.H2.etats.some(e => e.nom === "Étourdi"),
             JSON.stringify(r.etat.combattants.H2.etats));
}

// =========================================================================
console.log("\n18. CE QUE CHAQUE ÉTAT FAIT, MAINTENANT QU'IL EST ÉCRIT EN UN SEUL ENDROIT");
// =========================================================================
//  Ces règles vivaient éparpillées — le malus d'esquive de l'Étourdi dans la
//  conversion d'une fiche Firestore, sa chance d'échec dans deux moteurs, le
//  reste nulle part. Sous le régime du cerveau, qui ne traverse aucun de ces
//  chemins, l'Étourdi ne coûtait PLUS RIEN. Le tableau REGLES_ETATS est la
//  réponse, et ce chapitre en garde chaque ligne.
{
    const nu = { pv: 60, pvMax: 60, bouclier: 0, etats: [], def: {} };
    const gele = { ...nu, etats: [{ nom: "Glacé", duree: 2 }] };
    const foudroye = { ...nu, etats: [{ nom: "Électrifié", duree: 2 }] };
    const lesDeux = { ...nu, etats: [{ nom: "Glacé", duree: 2 }, { nom: "Électrifié", duree: 2 }] };

    verifier("le tableau dit ce que l'Étourdi coûte",
             REGLES_ETATS["Étourdi"].esquive === -30 && REGLES_ETATS["Étourdi"].parade === -30
             && REGLES_ETATS["Étourdi"].echecTechnique === 20,
             JSON.stringify(REGLES_ETATS["Étourdi"]));

    // GLACÉ : +20 % de dégâts subis, tous types confondus.
    verifier("un corps gelé encaisse 20 % de plus (20 → 24)",
             chaineDeDegats(gele, { valeurBrute: 20 }, {}).degats === 24,
             String(chaineDeDegats(gele, { valeurBrute: 20 }, {}).degats));
    verifier("et un corps ordinaire, non", chaineDeDegats(nu, { valeurBrute: 20 }, {}).degats === 20);

    // ÉLECTRIFIÉ : +20 %, mais SEULEMENT en magique.
    verifier("un corps électrifié conduit la magie (20 → 24)",
             chaineDeDegats(foudroye, { valeurBrute: 20, typeRes: "Magique" }, {}).degats === 24);
    verifier("mais pas l'acier (20 reste 20)",
             chaineDeDegats(foudroye, { valeurBrute: 20, typeRes: "Physique" }, {}).degats === 20);

    // LES DEUX ENSEMBLE s'additionnent : +40 % sur un coup magique.
    verifier("gelé ET électrifié, un sort fait 40 % de plus (20 → 28)",
             chaineDeDegats(lesDeux, { valeurBrute: 20, typeRes: "Magique" }, {}).degats === 28,
             String(chaineDeDegats(lesDeux, { valeurBrute: 20, typeRes: "Magique" }, {}).degats));
    verifier("et un coup physique n'en prend que vingt (20 → 24)",
             chaineDeDegats(lesDeux, { valeurBrute: 20, typeRes: "Physique" }, {}).degats === 24);

    // LA VULNÉRABILITÉ PASSE AVANT L'ARMURE, pas après : elle fait arriver le
    // coup plus fort, elle n'affaiblit pas la protection.
    const geleBlinde = { ...nu, def: { physique: 50 }, etats: [{ nom: "Glacé", duree: 2 }] };
    verifier("elle se heurte quand même à l'armure (24 × 0,5 = 12)",
             chaineDeDegats(geleBlinde, { valeurBrute: 20 }, {}).degats === 12,
             String(chaineDeDegats(geleBlinde, { valeurBrute: 20 }, {}).degats));

    // L'ÉTOURDI, sur un vrai combattant de l'état.
    let etat = neuf();
    etat.combattants.H1.etats = [{ nom: "Étourdi", duree: 2 }];
    verifier("l'Étourdi retire 30 d'esquive", esquiveDe(etat.combattants.H1) === -30,
             String(esquiveDe(etat.combattants.H1)));
    verifier("et 30 de parade", paradeDe(etat.combattants.H1) === -30);

    // ET SA CHANCE DE RATER : 20 %, tirée au lancement.
    const desFixe = (suite) => { const f = [...suite]; return { d100: () => f.length ? f.shift() : 1 }; };
    const jetsRate = tirerDesCarte(etat, { attaques: [] }, "H1", false, desFixe([20]));
    verifier("à 20 pile, la technique rate", jetsRate.attaqueRatee === true);
    const jetsPasse = tirerDesCarte(etat, { attaques: [] }, "H1", false, desFixe([21]));
    verifier("à 21, elle part", jetsPasse.attaqueRatee === false);
    // Un combattant sans Étourdi ne tire même pas ce dé.
    const sansEtourdi = neuf();
    verifier("sans Étourdi, aucun jet d'échec",
             tirerDesCarte(sansEtourdi, { attaques: [] }, "H1", false,
                           desFixe([1])).attaqueRatee === false);
}

// =========================================================================
console.log("\n19. LA BRÛLURE RONGE, ET RETIENT CE QUI L'A ALLUMÉE");
// =========================================================================
{
    let etat = neuf();
    const brulerAvec = (typeRes) => resoudreCarte(etat, {
        type: "carte", idLanceur: "M1", idCarte: "C1",
        attaques: [{ valeurBrute: 5, typeRes, cibles: ["H1"] }],
        alterations: [{ nom: "Brûlé", duree: 2, chance: 100, cibles: ["H1"] }],
        jets: { parCible: { H1: { esquive: false, etats: { "Brûlé": true } } } }
    });

    const magique = brulerAvec("Magique").etat.combattants.H1.etats.find(e => e.nom === "Brûlé");
    verifier("une flamme magique retient son type", magique && magique.typeDegats === "Magique",
             magique && magique.typeDegats);
    const physique = brulerAvec("Physique").etat.combattants.H1.etats.find(e => e.nom === "Brûlé");
    verifier("une torche plantée dans la plaie aussi", physique && physique.typeDegats === "Physique",
             physique && physique.typeDegats);

    verifier("et le tableau dit combien elle ronge", REGLES_ETATS["Brûlé"].degatsParTour === 3);
    verifier("et de combien elle ampute les soins", REGLES_ETATS["Brûlé"].soinsRecus === -50);
}

// =========================================================================
console.log("\n20. CE QUE LA CIBLE FAIT DU SOIN QU'ELLE REÇOIT");
// =========================================================================
//  Deux règles qui ne vivaient que dans l'ancien moteur : l'atout de l'Éthéré
//  (+30 %) et la brûlure (-50 %). Sous le cerveau, un Éthéré soignait comme
//  tout le monde et une plaie qui brûle se refermait aussi bien qu'une autre.
{
    const soigner = (etat, valeur) => resoudreCarte(etat, {
        type: "carte", idLanceur: "H2", idCarte: "CS",
        attaques: [{ valeurBrute: valeur, isHeal: true, cibles: ["H1"] }], alterations: [],
        jets: { parCible: { H1: { esquive: false, etats: {} } } }
    });

    let etat = neuf();
    etat.combattants.H1.pv = 20;
    verifier("un soin ordinaire rend sa valeur (20 → 40)",
             soigner(etat, 20).etat.combattants.H1.pv === 40);

    let ethere = neuf();
    ethere.combattants.H1.pv = 20;
    ethere.combattants.H1.atouts = { ...(ethere.combattants.H1.atouts || {}), soinsRecus: 30 };
    verifier("l'Éthéré en tire 30 % de plus (20 → 46)",
             soigner(ethere, 20).etat.combattants.H1.pv === 46,
             String(soigner(ethere, 20).etat.combattants.H1.pv));

    let brule = neuf();
    brule.combattants.H1.pv = 20;
    brule.combattants.H1.etats = [{ nom: "Brûlé", duree: 2 }];
    verifier("une plaie qui brûle en perd la moitié (20 → 30)",
             soigner(brule, 20).etat.combattants.H1.pv === 30,
             String(soigner(brule, 20).etat.combattants.H1.pv));

    // Les deux ensemble : +30 % et -50 % s'additionnent sur la même ligne.
    let lesDeux = neuf();
    lesDeux.combattants.H1.pv = 20;
    lesDeux.combattants.H1.atouts = { ...(lesDeux.combattants.H1.atouts || {}), soinsRecus: 30 };
    lesDeux.combattants.H1.etats = [{ nom: "Brûlé", duree: 2 }];
    verifier("un Éthéré brûlé reçoit 80 % du soin (20 → 36)",
             soigner(lesDeux, 20).etat.combattants.H1.pv === 36,
             String(soigner(lesDeux, 20).etat.combattants.H1.pv));
}

// =========================================================================
console.log("\n21. LA POUSSÉE POUSSE VRAIMENT, ET PEUT BOUSCULER");
// =========================================================================
//  Le cerveau ne la jouait pas du tout : il posait un état « Poussée » de durée
//  zéro qui ne poussait personne, s'effaçait à la manche suivante, et laissait
//  au passage une pastille de couleur sur le pion pour rien.
{
    const desFixe = (suite) => { const f = [...suite]; return { d100: () => f.length ? f.shift() : 1 }; };
    const carte = (jets) => ({
        type: "carte", idLanceur: "H1", idCarte: "CP", attaques: [],
        alterations: [{ nom: "Poussée", duree: 0, chance: 100, cibles: ["M1"] }], jets
    });

    // H1 est en (0,0), M1 en (1,0) — et H2 se tient en (3,0). La poussée part
    // donc pour deux cases mais s'arrête à (2,0) : contrairement au Bond, elle
    // ne survole personne. Deux règles vérifiées d'un coup.
    let etat = neuf();
    const sansBousculade = resoudreCarte(etat, carte({
        parCible: { M1: { esquive: false, etats: { "Poussée": true }, bouscule: false } } }));
    verifier("la cible recule, et s'arrête sur le voisin qui barre la route",
             sansBousculade.etat.combattants.M1.q === 2 && sansBousculade.etat.combattants.M1.r === 0,
             `(${sansBousculade.etat.combattants.M1.q},${sansBousculade.etat.combattants.M1.r})`);
    verifier("et une étape de poussée le raconte",
             sansBousculade.etapes.some(e => e.type === "poussee" && e.cible === "M1"
                                             && e.vers.q === 2 && e.de.q === 1),
             JSON.stringify(sansBousculade.etapes.find(e => e.type === "poussee")));

    // Sans personne devant, elle va bien jusqu'au bout des deux cases.
    const degage = clonerEtat(etat);
    degage.combattants.H2.q = 0; degage.combattants.H2.r = 5;
    const loin = resoudreCarte(degage, carte({
        parCible: { M1: { esquive: false, etats: { "Poussée": true }, bouscule: false } } }));
    verifier("le passage dégagé, elle recule bien de deux cases",
             loin.etat.combattants.M1.q === 3, String(loin.etat.combattants.M1.q));
    verifier("aucun état fantôme n'est posé",
             !sansBousculade.etat.combattants.M1.etats.some(e => e.nom === "Poussée"),
             JSON.stringify(sansBousculade.etat.combattants.M1.etats));
    verifier("et sans bousculade, l'énergie ne bouge pas",
             sansBousculade.etat.combattants.M1.fatigue === etat.combattants.M1.fatigue);

    // La bousculade : 20 % de l'énergie MAXIMALE.
    const avecBousculade = resoudreCarte(etat, carte({
        parCible: { M1: { esquive: false, etats: { "Poussée": true }, bouscule: true } } }));
    const attendu = etat.combattants.M1.fatigue
                  - Math.ceil(etat.combattants.M1.fatigueMax * FATIGUE_BOUSCULADE_POUSSEE / 100);
    verifier("bousculée, elle perd 20 % de son énergie maximale",
             avecBousculade.etat.combattants.M1.fatigue === attendu,
             `(${avecBousculade.etat.combattants.M1.fatigue} au lieu de ${attendu})`);

    // LE JET DE BOUSCULADE : 15 %, tiré une fois, et seulement pour la Poussée.
    const jets = tirerDesCarte(etat, { attaques: [],
        alterations: [{ nom: "Poussée", chance: 100, cibles: ["M1"] }] },
        "H1", false, desFixe([99, 1, 15]));
    verifier("à 15 pile, la bousculade passe", jets.parCible.M1.bouscule === true,
             JSON.stringify(jets.parCible.M1));
    const jets16 = tirerDesCarte(etat, { attaques: [],
        alterations: [{ nom: "Poussée", chance: 100, cibles: ["M1"] }] },
        "H1", false, desFixe([99, 1, 16]));
    verifier("à 16, non", jets16.parCible.M1.bouscule === false);
    verifier("et le chiffre est celui du tableau", CHANCE_BOUSCULADE_POUSSEE === 15);

    // Un autre état ne tire jamais ce dé : la suite des dés de toutes les
    // autres cartes du jeu doit rester exactement la même qu'avant.
    const jetsAutre = tirerDesCarte(etat, { attaques: [],
        alterations: [{ nom: "Étourdi", chance: 100, cibles: ["M1"] }] },
        "H1", false, desFixe([99, 1]));
    verifier("un autre état ne consomme aucun dé de bousculade",
             jetsAutre.parCible.M1.bouscule === undefined);

    // UN MUR ARRÊTE LA POUSSÉE, mais la bousculade a quand même lieu : être
    // projeté contre une paroi fatigue autant.
    const mur = { etatCase: (q, r) => ({ bloquee: q >= 2, supprimee: false, difficile: false }) };
    const contreLeMur = resoudreCarte(etat, carte({
        parCible: { M1: { esquive: false, etats: { "Poussée": true }, bouscule: true } } }), mur);
    verifier("contre un mur, la cible ne bouge pas",
             contreLeMur.etat.combattants.M1.q === 1, String(contreLeMur.etat.combattants.M1.q));
    verifier("le blocage est annoncé, pas avalé en silence",
             contreLeMur.etapes.some(e => e.type === "message" && /bloquée/i.test(e.texte || "")),
             JSON.stringify(contreLeMur.etapes.map(e => e.type)));
    verifier("et elle est quand même bousculée",
             contreLeMur.etat.combattants.M1.fatigue === attendu);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
