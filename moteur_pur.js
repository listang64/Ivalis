// =========================================================================
//  LE MOTEUR PUR — RÉSOUDRE UNE CARTE SANS TOUCHER À RIEN
// =========================================================================
//
//  CE QU'IL FAIT, ET CE QU'IL NE FAIT PAS
//  --------------------------------------
//  Il prend un état de combat et une carte lancée, et il rend DEUX choses :
//  l'état d'après, et la liste de ce qui s'est passé. Rien d'autre. Il n'écrit
//  aucun document, n'anime aucun pion, n'attend aucune milliseconde et ne lit
//  aucune variable globale.
//
//      const { etat, etapes } = resoudreCarte(etatAvant, action);
//
//  POURQUOI CE FICHIER EXISTE
//  --------------------------
//  Dans l'ancien moteur, la même fonction de 828 lignes calculait les dégâts,
//  les écrivait en base, jouait les animations et faisait attendre l'écran.
//  Trois postes exécutaient ce mélange en parallèle, chacun avec sa vision du
//  plateau. Impossible d'en tester quoi que ce soit sans simuler Firestore, un
//  navigateur et trois appareils — et nos seize bancs passaient au vert pendant
//  que le jeu était injouable.
//
//  Ici, la même carte donne le même résultat, toujours, partout. Le cerveau
//  appelle cette fonction puis écrit son résultat ; les écrans ne font que
//  rejouer les étapes. Un combat entier se déroule en quelques millisecondes,
//  ce qui rend possible ce qui ne l'était pas : dix mille combats au hasard, et
//  la comparaison de deux exécutions au caractère près.
//
//  LES DÉS SONT TIRÉS UNE FOIS, ET ILS VOYAGENT
//  --------------------------------------------
//  C'est un principe que l'ancienne architecture avait déjà et qu'on garde :
//  celui qui joue tire, le résultat part avec l'action, personne ne relance.
//  Ce qui change, c'est que le hasard vient maintenant de la graine de l'état
//  (voir combat_etat.js) : le même combat rejoué depuis le même départ redonne
//  exactement les mêmes jets.
//
//  LES ÉTAPES PORTENT LE RÉSULTAT, JAMAIS L'OPÉRATION
//  --------------------------------------------------
//  On écrit « pvApres: 33 », pas « retire 9 ». C'est ce qui rend le rejeu
//  insensible aux répétitions et à l'ordre — et c'est très exactement d'où
//  venaient les dégâts comptés deux fois.
// =========================================================================

import { clonerEtat, combattant, creerDes } from './combat_etat.js';

const nombre = (v, defaut = 0) => {
    const n = parseInt(v);
    return Number.isFinite(n) ? n : defaut;
};

// =========================================================================
//  1. LES DÉFENSES, ÉTAT PAR ÉTAT
// =========================================================================
//  L'état porte les défenses figées au début du combat (c.def), calculées par
//  les vraies formules du jeu. Ce qui s'y ajoute pendant la rencontre, ce sont
//  les états altérés : un enchantement qui donne +5 en parade, une malédiction
//  qui ronge l'armure. Ils vivent dans l'état, donc on les additionne ici.

export function bonusDesEtats(c, cle) {
    let total = 0;
    (c && c.etats ? c.etats : []).forEach(e => {
        if (e && e.bonusEquip && typeof e.bonusEquip[cle] === "number") total += e.bonusEquip[cle];
    });
    return total;
}

export const esquiveDe     = (c) => nombre(c && c.def && c.def.esquive)  + bonusDesEtats(c, "esquive");
export const paradeDe      = (c) => nombre(c && c.def && c.def.parade)   + bonusDesEtats(c, "parade");
export const defPhysiqueDe = (c) => nombre(c && c.def && c.def.physique) + bonusDesEtats(c, "resPhys");
export const defMagiqueDe  = (c) => nombre(c && c.def && c.def.magique)  + bonusDesEtats(c, "resMag");
export const critiqueDe    = (c) => nombre(c && c.def && c.def.critique) + bonusDesEtats(c, "critique");

export const aLEtat = (c, nom) => (c && c.etats ? c.etats : []).some(e => e && e.nom === nom);

// La distance hexagonale, en coordonnées axiales. La même formule que partout
// ailleurs dans le jeu — elle décide du malus de tir à bout portant.
export function distanceHex(a, b) {
    if (!a || !b || a.q === null || b.q === null) return Infinity;
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

// =========================================================================
//  2. LES DÉS DE LA CARTE
// =========================================================================
//  Portage fidèle de tirerLesDesDeLaCarte : un seul tirage pour toute la carte,
//  rangé par cible, embarqué dans l'action. Ce qui change ici, c'est la source
//  du hasard — la graine de l'état, et non Math.random() — et le fait qu'on
//  lise les défenses dans l'état plutôt que dans une variable globale.
//
//  L'ORDRE DES TIRAGES COMPTE. Deux exécutions ne donnent la même partie que si
//  elles consomment les dés dans le même ordre : attaques d'abord, altérations
//  ensuite, chacune dans l'ordre où la carte les porte. Ne pas réordonner.

export function tirerDesCarte(etat, plan, idLanceur, critique, des) {
    const jets = { attaqueRatee: false, parCible: {} };
    const lanceur = combattant(etat, idLanceur);

    // Étourdi : une chance sur dix de rater complètement sa technique.
    if (aLEtat(lanceur, "Étourdi")) jets.attaqueRatee = des.d100() <= 10;

    const pourCible = (id) => {
        if (!jets.parCible[id]) jets.parCible[id] = { etats: {} };
        return jets.parCible[id];
    };
    // Esquive OU parade : c'est la meilleure des deux qui protège.
    const jetDeDefense = (id) => {
        const c = combattant(etat, id);
        return des.d100() <= Math.max(esquiveDe(c), paradeDe(c));
    };

    (plan.attaques || []).forEach(attaque => {
        (attaque.cibles || []).forEach(id => {
            const c = pourCible(id);
            // Un soin ne s'esquive pas.
            if (c.esquive === undefined) c.esquive = attaque.isHeal ? false : jetDeDefense(id);
            if ((attaque.purifChance || 0) > 0 && c.purifie === undefined) {
                c.purifie = critique || des.d100() <= attaque.purifChance;
            }
        });
    });

    (plan.alterations || []).forEach(alt => {
        (alt.cibles || []).forEach(id => {
            const c = pourCible(id);
            // Carte sans dégâts : c'est ici que se joue l'esquive de la cible.
            if (c.esquive === undefined) c.esquive = jetDeDefense(id);
            // Un coup critique impose les effets de la carte, sans jet.
            if (c.etats[alt.nom] === undefined) {
                c.etats[alt.nom] = critique || des.d100() <= (alt.chance || 0);
            }
        });
    });

    return jets;
}

// Le coup critique : un jet par carte, réservé aux héros. Les créatures
// frappent toujours normalement — c'est une règle du jeu, et elle est vérifiée
// ici ET au moment d'appliquer, parce qu'une action reçue peut mentir.
export function tirerCritique(etat, idLanceur, des) {
    const c = combattant(etat, idLanceur);
    if (!c || c.estMonstre) return false;
    return des.d100() <= critiqueDe(c);
}

// =========================================================================
//  3. LA CHAÎNE DE DÉGÂTS
// =========================================================================
//  L'ordre des opérations EST la règle du jeu. Il est repris tel quel de
//  l'ancien moteur, et chaque ligne compte :
//
//    1. le brut, doublé si la frappe est critique ;
//    2. le malus de tir à bout portant : une arme de jet perd 30 % au contact ;
//    3. l'absorption : la cible annule une part et se soigne de 10 % du brut,
//       et ce soin compte AVANT que le reste ne frappe ;
//    4. la résistance, physique ou magique selon l'attaque, réduite à zéro si
//       l'armure est percée ;
//    5. l'étalement, qui coupe en deux APRÈS les résistances pour que les deux
//       moitiés fassent exactement le total d'une attaque normale ;
//    6. le bouclier, qui encaisse avant les points de vie.
//
//  Elle rend un compte-rendu, pas un état modifié : c'est resoudreCarte qui
//  décide quoi en faire.

export function chaineDeDegats(cible, attaque, options) {
    const { critique = false, distance = 1, percee = false } = options || {};
    const compte = { soinAbsorption: 0, degats: 0, secondTic: 0, versBouclier: 0, versPv: 0 };

    // 1. Le brut, doublé par un critique à la source : tout ce qui suit
    //    travaille sur ce montant doublé.
    //    Le plancher à zéro n'est pas de la coquetterie : une carte mal formée
    //    ou une valeur négative venue d'ailleurs ferait autrement des dégâts
    //    NÉGATIFS — donc un soin déguisé, ou un bouclier qui grandit sous les
    //    coups. C'est le test de propriété qui l'a trouvé, au 633e essai.
    let degats = Math.max(0, nombre(attaque.valeurBrute)) * (critique ? 2 : 1);

    // 2. Une arme de jet employée au contact perd trente pour cent.
    if (attaque.isRanged && distance === 1) degats = Math.floor(degats * 0.7);

    // 3. Absorption réactive : la cible annule une part du coup et draine.
    const abs = (cible.etats || []).find(e => e && e.nom === "Absorption");
    if (abs) {
        const pctAnnule = nombre(abs.valeurAbs, 20);
        const aAnnuler = Math.floor(degats * (pctAnnule / 100));
        compte.soinAbsorption = Math.floor(degats * 0.10);   // toujours 10 % du brut
        degats = Math.max(0, degats - aAnnuler);
    }

    // 4. La résistance. « Ignorer l'armure » ne vaut que contre la résistance
    //    physique ; « ignorer les résistances » balaie les deux — le jet a été
    //    tranché au lancement, on ne fait que le lire.
    let resistance = attaque.typeRes === "Magique" ? defMagiqueDe(cible) : defPhysiqueDe(cible);
    if (percee) resistance = 0;
    const reduction = Math.min(1, resistance / 100);
    let degatsFinaux = Math.max(0, Math.round(degats * (1 - reduction)));

    // 5. L'étalement : le reste de la division part sur le premier tic, pour que
    //    les deux moitiés fassent exactement le total d'une attaque normale.
    if (attaque.estEtalement && degatsFinaux > 0) {
        compte.secondTic = Math.floor(degatsFinaux / 2);
        degatsFinaux = degatsFinaux - compte.secondTic;
    }
    compte.degats = degatsFinaux;

    // 6. Le bouclier encaisse en premier, et ce qui le dépasse est perdu :
    //    c'est la règle du jeu, un bouclier qui casse ne laisse pas passer le
    //    surplus.
    const bouclier = Math.max(0, nombre(cible.bouclier));
    if (bouclier > 0) {
        compte.versBouclier = Math.min(bouclier, degatsFinaux);
        compte.bouclierApres = Math.max(0, bouclier - degatsFinaux);
        compte.bouclierBrise = compte.bouclierApres === 0;
    } else {
        compte.bouclierApres = 0;
        compte.versPv = degatsFinaux;
    }

    return compte;
}

// =========================================================================
//  4. RÉSOUDRE UNE CARTE
// =========================================================================
//  Le point d'entrée. On lui donne l'état et l'action (la carte, ses cibles,
//  ses dés déjà tirés) ; il rend l'état d'après et la liste des étapes.
//
//  Ce qu'il ne fait PAS, et c'est volontaire : aucune animation, aucune attente,
//  aucun message flottant. Ces choses-là se déduisent des étapes, sur chaque
//  écran, au rythme de chaque écran.

export function resoudreCarte(etat, action) {
    const suivant = clonerEtat(etat);
    const etapes = [];
    const idLanceur = action.idLanceur;
    const lanceur = combattant(suivant, idLanceur);
    if (!lanceur) return { etat: suivant, etapes };

    // Une créature ne critique jamais, même si l'action reçue le prétend. Le
    // premier verrou est au lancement ; celui-ci tient sur tous les écrans.
    const critique = !!action.critique && !lanceur.estMonstre;
    const jets = action.jets || { parCible: {} };
    const desDe = (id) => (jets.parCible && jets.parCible[id]) || {};

    etapes.push({
        type: "carte", acteur: idLanceur, carte: action.idCarte,
        critique,
        cibles: [...new Set([].concat(
            ...(action.attaques || []).map(a => a.cibles || []),
            ...(action.alterations || []).map(a => a.cibles || [])
        ))]
    });

    // Le lanceur étourdi rate parfois complètement sa technique. Le jet a été
    // tiré au lancement ; on ne fait que le lire.
    if (aLEtat(lanceur, "Étourdi") && jets.attaqueRatee) {
        etapes.push({ type: "echec", acteur: idLanceur, raison: "Étourdi" });
        return { etat: suivant, etapes };
    }

    // --- LES ATTAQUES, DANS L'ORDRE DE LA CARTE --------------------------
    const touchees = new Set();

    (action.attaques || []).forEach(attaque => {
        (attaque.cibles || []).forEach(idCible => {
            const cible = combattant(suivant, idCible);
            if (!cible || cible.aTerre) return;
            const des = desDe(idCible);

            // Une esquive vaut pour toute la carte : la cible n'esquive pas
            // chaque effet séparément, elle esquive le coup.
            if (des.esquive) {
                etapes.push({ type: "esquive", cible: idCible, acteur: idLanceur });
                return;
            }
            touchees.add(idCible);

            // --- SOIN ---------------------------------------------------
            if (attaque.isHeal) {
                const avant = cible.pv;
                const soin = Math.max(0, nombre(attaque.valeurBrute)) * (critique ? 2 : 1);
                cible.pv = Math.min(cible.pvMax, avant + soin);
                etapes.push({ type: "soin", cible: idCible, acteur: idLanceur,
                              montant: cible.pv - avant, pvApres: cible.pv });
                return;
            }

            // --- BOUCLIER -----------------------------------------------
            if (attaque.isShield) {
                const avant = cible.bouclier;
                const gain = Math.max(0, nombre(attaque.valeurBrute));
                const plafond = nombre(cible.bouclierMax) || (avant + gain);
                cible.bouclier = Math.max(0, Math.min(plafond, avant + gain));
                etapes.push({ type: "degats", cible: idCible, acteur: idLanceur,
                              bouclierApres: cible.bouclier, gainBouclier: cible.bouclier - avant });
                return;
            }

            // --- DÉGÂTS -------------------------------------------------
            const distance = distanceHex(lanceur, cible);
            const equip = des.equip || {};
            const percee = equip.ignoreResistances === true
                        || (equip.ignoreArmure === true && attaque.typeRes !== "Magique");

            const compte = chaineDeDegats(cible, attaque, { critique, distance, percee });

            // Le drain de l'absorption soigne AVANT que le reste ne frappe.
            if (compte.soinAbsorption > 0) {
                cible.pv = Math.min(cible.pvMax, cible.pv + compte.soinAbsorption);
                etapes.push({ type: "soin", cible: idCible, acteur: idLanceur, drain: true,
                              montant: compte.soinAbsorption, pvApres: cible.pv });
            }

            if (compte.versBouclier > 0 || compte.bouclierApres !== cible.bouclier) {
                cible.bouclier = compte.bouclierApres;
            }
            if (compte.versPv > 0) {
                cible.pv = Math.max(0, cible.pv - compte.versPv);
            }

            etapes.push({
                type: "degats", cible: idCible, acteur: idLanceur,
                montant: compte.degats,
                surBouclier: compte.versBouclier,
                bouclierBrise: !!compte.bouclierBrise,
                bouclierApres: cible.bouclier,
                pvApres: cible.pv,
                critique
            });

            // L'étalement : la seconde moitié tombera à la fin du tour de la
            // cible. On la range dans ses états, comme une brûlure.
            if (compte.secondTic > 0) {
                cible.etats = [...cible.etats,
                               { nom: "Étalement", tours: 1, degatsDifferes: compte.secondTic }];
                etapes.push({ type: "etats", cible: idCible, liste: cible.etats });
            }

            if (cible.pvMax > 0 && cible.pv <= 0 && !cible.aTerre) {
                cible.aTerre = true;
                etapes.push({ type: "chute", cible: idCible, acteur: idLanceur });
            }
        });
    });

    // --- LES ÉTATS ALTÉRÉS -----------------------------------------------
    //  Ils se posent sur les cibles qui n'ont pas esquivé, et seulement si leur
    //  jet est passé — jet tiré au lancement, comme tout le reste.
    (action.alterations || []).forEach(alt => {
        (alt.cibles || []).forEach(idCible => {
            const cible = combattant(suivant, idCible);
            if (!cible || cible.aTerre) return;
            const des = desDe(idCible);
            if (des.esquive) return;
            if (!des.etats || des.etats[alt.nom] !== true) {
                etapes.push({ type: "etatRate", cible: idCible, nom: alt.nom });
                return;
            }

            // Un même état ne s'empile pas : il se renouvelle, en gardant la
            // plus longue des deux durées. Sans cette règle, deux brûlures
            // successives donnaient deux compteurs distincts sur la même fiche.
            const existant = cible.etats.find(e => e && e.nom === alt.nom);
            if (existant) {
                existant.tours = Math.max(nombre(existant.tours), nombre(alt.tours, 1));
            } else {
                cible.etats = [...cible.etats, {
                    nom: alt.nom,
                    tours: nombre(alt.tours, 1),
                    ...(alt.valeurAbs !== undefined ? { valeurAbs: alt.valeurAbs } : {}),
                    ...(alt.bonusEquip ? { bonusEquip: alt.bonusEquip } : {})
                }];
            }
            etapes.push({ type: "etats", cible: idCible, pose: alt.nom, liste: cible.etats });
        });
    });

    // --- LA PURIFICATION --------------------------------------------------
    //  Certaines cartes lèvent les états altérés de leur cible. Le jet est déjà
    //  tranché ; on ne fait que l'appliquer.
    (action.attaques || []).forEach(attaque => {
        if (!(attaque.purifChance > 0)) return;
        (attaque.cibles || []).forEach(idCible => {
            const cible = combattant(suivant, idCible);
            if (!cible || !desDe(idCible).purifie) return;
            if (!cible.etats.length) return;
            cible.etats = [];
            etapes.push({ type: "etats", cible: idCible, purifie: true, liste: [] });
        });
    });

    // --- LA FATIGUE DU LANCEUR -------------------------------------------
    if (action.coutFatigue !== undefined) {
        lanceur.fatigue = Math.max(0, Math.min(lanceur.fatigueMax,
                                               lanceur.fatigue - nombre(action.coutFatigue)));
        etapes.push({ type: "fatigue", cible: idLanceur, fatigueApres: lanceur.fatigue });
    }

    return { etat: suivant, etapes, touchees: [...touchees] };
}

// =========================================================================
//  5. LE PAS COMPLET
// =========================================================================
//  Ce que le cerveau appellera : une action entre, un état et une entrée de
//  journal sortent, avec le numéro de version et la graine suivante. C'est
//  l'unité qui partira dans UN SEUL writeBatch — l'état et son journal, tout ou
//  rien, donc jamais l'un sans l'autre.

export function jouer(etat, action) {
    const des = creerDes(etat.graine);

    // Les dés se tirent ICI quand l'action n'en porte pas encore — c'est le cas
    // d'une intention qui arrive d'un joueur, qui dit ce qu'il veut faire et non
    // ce qui en résulte. Une action déjà tirée (rejeu, banc) garde les siens.
    let enrichie = action;
    if (action.type === "carte" && !action.jets) {
        const critique = action.critique !== undefined
            ? action.critique : tirerCritique(etat, action.idLanceur, des);
        enrichie = { ...action, critique,
                     jets: tirerDesCarte(etat, action, action.idLanceur, critique, des) };
    }

    let resultat;
    switch (enrichie.type) {
        case "carte": resultat = resoudreCarte(etat, enrichie); break;
        default:      resultat = { etat: clonerEtat(etat), etapes: [] };
    }

    const suivant = resultat.etat;
    suivant.version = nombre(etat.version) + 1;

    // LA GRAINE AVANCE À CHAQUE PAS, MÊME QUAND AUCUN DÉ N'A ÉTÉ TIRÉ. Une
    // action qui apporte déjà ses jets (un rejeu, un banc) n'en consomme aucun :
    // sans ce cran forcé, deux pas de suite repartiraient du même hasard, et le
    // pas d'après tirerait exactement les mêmes dés que celui d'avant. C'est le
    // genre de coïncidence qui ne se voit qu'au bout de trois heures de jeu.
    des.fraction();
    suivant.graine = des.graine();

    return {
        etat: suivant,
        entree: {
            v: suivant.version,
            cause: action.id || null,
            acteur: action.idLanceur || null,
            manche: suivant.manche,
            graine: suivant.graine,
            etapes: resultat.etapes
        }
    };
}

// Le pont vers le reste du jeu, comme pour le noyau d'état : le moteur ne
// dépend de rien, c'est le jeu qui vient le chercher.
if (typeof window !== "undefined") {
    window.moteurPur = {
        jouer, resoudreCarte, chaineDeDegats, tirerDesCarte, tirerCritique,
        esquiveDe, paradeDe, defPhysiqueDe, defMagiqueDe, critiqueDe, distanceHex
    };
}
