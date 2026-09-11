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
    // Esquive OU parade : c'est la meilleure des deux qui protège. On retient
    // LAQUELLE, sans tirer un dé de plus : c'est ce qui permet à l'écran
    // d'annoncer « Paré 🛡️ » plutôt que « Esquivé 💨 » quand c'est la parade qui
    // a sauvé la mise. L'ancien moteur le disait déjà ; le nouveau ne le
    // transmettait pas.
    const jetDeDefense = (id) => {
        const c = combattant(etat, id);
        const esq = esquiveDe(c);
        const par = paradeDe(c);
        const reussi = des.d100() <= Math.max(esq, par);
        if (reussi) pourCible(id).parade = par > esq;
        return reussi;
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

    // --- LES JETS DE L'ÉQUIPEMENT -----------------------------------------
    //  Percer une armure ou ignorer les résistances se joue une fois ici, PAR
    //  CIBLE : sans ça, un poste verrait le coup passer et l'autre non — même
    //  raison que l'esquive juste au-dessus. C'est une chance du LANCEUR
    //  (l'arme qu'il tient), appliquée à chaque cible frappée par une attaque
    //  qui porte vraiment (ni soin, ni bouclier).
    const frappantes = (plan.attaques || [])
        .filter(a => !a.isHeal && !a.isShield && (a.valeurBrute || 0) > 0);
    const equipLanceur = (lanceur && lanceur.equip) || {};
    const ignoreArmure = nombre(equipLanceur.ignoreArmure);
    const ignoreResistances = nombre(equipLanceur.ignoreResistances);
    if (ignoreArmure > 0 || ignoreResistances > 0) {
        frappantes.forEach(attaque => {
            (attaque.cibles || []).forEach(id => {
                const c = pourCible(id);
                c.equip = c.equip || {};
                if (ignoreArmure > 0 && c.equip.ignoreArmure === undefined) {
                    c.equip.ignoreArmure = des.d100() <= ignoreArmure;
                }
                if (ignoreResistances > 0 && c.equip.ignoreResistances === undefined) {
                    c.equip.ignoreResistances = des.d100() <= ignoreResistances;
                }
            });
        });
    }

    // Ce que l'équipement déclenche APRÈS la carte : élan d'initiative,
    // bénédiction de soin, pas de retraite. "frappe"/"soigne" regardent le
    // TYPE de la carte, pas si le coup a atterri — une arme de contact offre
    // son pas de retraite même sur une cible qui esquive : c'est le geste qui
    // compte, pas le résultat, exactement comme dans l'ancien moteur.
    const frappe = frappantes.length > 0;
    const soigne = (plan.attaques || []).some(a => a.isHeal && (a.valeurBrute || 0) > 0);
    jets.equipLanceur = [];
    jets.equipBenedictions = [];
    (equipLanceur.effetsSpeciaux || []).forEach(e => {
        if (e.buff && frappe && des.d100() <= (e.chance || 0)) jets.equipLanceur.push(e.buff);
        if (e.buffSoi && soigne) jets.equipLanceur.push(e.buffSoi);
        if (e.beniSoin && soigne) jets.equipBenedictions.push(e.beniSoin);
    });
    jets.equipPasOfferts = frappe ? nombre(equipLanceur.hexApresAttaque) : 0;

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

// LA TRICHE DES CRÉATURES : un bonus fixe sur ce qu'elles infligent ET ce
// qu'elles soignent, selon leur stature. Un héros calcule sa carte au point
// près ; une créature, elle, tape un peu plus fort et soigne un peu plus,
// sans qu'aucune règle de fiche ne l'explique — c'est délibéré, pour que le
// combat reste dur sans multiplier les points de vie des monstres. Nico l'a
// posé comme un réglage provisoire ; s'il change, ce tableau est le seul
// endroit à toucher.
const TABLE_BONUS_MONSTRE = { "Petit": 3, "Normal": 4, "Élite": 5, "Boss": 6 };

export function bonusMonstreDe(c) {
    if (!c || !c.estMonstre) return 0;
    return TABLE_BONUS_MONSTRE[c.palier] || 0;
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
//  3 bis. CE QUI TRAVERSE LE PLATEAU
// =========================================================================
//  Une attaque à distance ne se voyait pas partir : le lanceur s'élançait à
//  peine sur place, puis les dégâts tombaient à l'autre bout du plateau, et
//  rien ne reliait les deux. On ne savait pas qui avait tiré sur qui.
//
//  LE CHOIX EST UNE RÈGLE, PAS UN DÉTAIL D'AFFICHAGE. C'est la carte qui dit
//  ce qu'elle envoie, et elle le dit de la même façon sur les trois écrans —
//  donc ça se décide ici, dans le noyau pur, et ça voyage sur l'étape comme
//  tout le reste. Un écran ne redécide jamais : il dessine ce qu'on lui dit.
//
//      • une FLÈCHE  — un tir qui n'est pas magique (arc, dague lancée, arme
//                      devenue tir par l'équipement : typeRes « Physique ») ;
//      • une BOULE BLEUE — un sort offensif lancé de loin (typeRes
//                      « Magique » : les effets « pouvoir », « magique ») ;
//      • une BOULE VERTE — un soin lancé de loin.
//
//  L'ordre compte : une carte qui frappe ET soigne montre son attaque, parce
//  que c'est elle qu'on regarde. Un bouclier posé de loin n'est pas un soin,
//  c'est un sort — il part en bleu. Et ce qui ne porte pas (portée 1, corps à
//  corps) ne lance rien : la ruée du lanceur suffit à le raconter.
export function projectileDe(action) {
    const aCibles = (e) => !!e && !!e.isRanged && ((e.cibles || []).length > 0);

    const attaques = (action && action.attaques) || [];
    const offensive = attaques.find(a => aCibles(a) && !a.isHeal);
    if (offensive) return offensive.typeRes === "Magique" ? "magie" : "fleche";

    const soin = attaques.find(a => aCibles(a) && a.isHeal && !a.isShield);
    if (soin) return "soin";

    // Ce qui reste et qui porte : un bouclier jeté sur un allié, une
    // immobilisation lancée à trois cases. Ça n'a pas de forme propre, mais ça
    // traverse quand même le plateau.
    if (attaques.some(aCibles)) return "magie";
    if (((action && action.alterations) || []).some(aCibles)) return "magie";

    return null;
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

    const projectile = projectileDe(action);
    etapes.push({
        type: "carte", acteur: idLanceur, carte: action.idCarte,
        critique,
        // Ce que la carte envoie, s'il y a quelque chose à voir traverser. Le
        // champ n'est posé que lorsqu'il vaut quelque chose : une étape de
        // corps à corps reste exactement ce qu'elle était, et les journaux déjà
        // écrits se rejouent sans rien de neuf.
        ...(projectile ? { projectile } : {}),
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
    const bonusMonstre = bonusMonstreDe(lanceur);

    (action.attaques || []).forEach(attaque => {
        (attaque.cibles || []).forEach(idCible => {
            const cible = combattant(suivant, idCible);
            if (!cible || cible.aTerre) return;
            const des = desDe(idCible);

            // Une esquive vaut pour toute la carte : la cible n'esquive pas
            // chaque effet séparément, elle esquive le coup.
            if (des.esquive) {
                etapes.push({ type: "esquive", cible: idCible, acteur: idLanceur,
                              parade: !!des.parade });
                return;
            }
            touchees.add(idCible);

            // --- BOUCLIER -----------------------------------------------
            // AVANT le soin, et c'est capital : l'extraction (moteur_effets.js)
            // marque un « Bouclier » isHeal ET isShield à la fois, pour que la
            // Forge le range dans les mêmes menus qu'un vrai soin. Ici, c'est
            // une vraie fourche entre deux portes, et il fallait ouvrir la
            // bonne en premier — sans quoi une créature (ou un joueur) qui
            // lance un bouclier soignait des points de vie qu'on ne voit
            // jamais grandir sur la fiche, et ne posait jamais le bouclier.
            if (attaque.isShield) {
                const avant = cible.bouclier;
                const gain = Math.max(0, nombre(attaque.valeurBrute));
                const plafond = nombre(cible.bouclierMax) || (avant + gain);
                cible.bouclier = Math.max(0, Math.min(plafond, avant + gain));
                etapes.push({ type: "degats", cible: idCible, acteur: idLanceur,
                              bouclierApres: cible.bouclier, gainBouclier: cible.bouclier - avant });
                return;
            }

            // --- SOIN ---------------------------------------------------
            //  La triche des créatures (bonusMonstreDe) s'ajoute ici, sur le
            //  soin lui-même — jamais sur un gain de bouclier, qui n'est ni un
            //  dégât ni un soin.
            if (attaque.isHeal) {
                const avant = cible.pv;
                const soin = Math.max(0, nombre(attaque.valeurBrute) + bonusMonstre) * (critique ? 2 : 1);
                cible.pv = Math.min(cible.pvMax, avant + soin);
                etapes.push({ type: "soin", cible: idCible, acteur: idLanceur,
                              montant: cible.pv - avant, pvApres: cible.pv });
                return;
            }

            // --- DÉGÂTS -------------------------------------------------
            const distance = distanceHex(lanceur, cible);
            const equip = des.equip || {};
            const percee = equip.ignoreResistances === true
                        || (equip.ignoreArmure === true && attaque.typeRes !== "Magique");

            // La triche des créatures s'ajoute AU BRUT, avant la chaîne : elle
            // traverse donc le malus à bout portant et les résistances comme
            // un dégât normal, plutôt que de passer en douce derrière l'armure.
            const attaqueAvecBonus = bonusMonstre
                ? { ...attaque, valeurBrute: nombre(attaque.valeurBrute) + bonusMonstre }
                : attaque;
            const compte = chaineDeDegats(cible, attaqueAvecBonus, { critique, distance, percee });

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
                               { nom: "Étalement", duree: 1, degatsDifferes: compte.secondTic }];
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

            // L'IMMUNITÉ DE PEUPLE PASSE AVANT TOUT LE RESTE : ni jet, ni
            // esquive — la cible n'attrape tout simplement jamais cet état-là.
            // Elle ne consomme aucun dé : le jet de la carte (tirerDesCarte)
            // a été tiré pareil pour tout le monde, seule l'application change.
            const immunites = (cible.atouts && cible.atouts.immunites) || [];
            if (immunites.includes(alt.nom)) {
                etapes.push({ type: "etatRate", cible: idCible, nom: alt.nom, immunise: true });
                return;
            }

            const des = desDe(idCible);
            if (des.esquive) return;
            if (!des.etats || des.etats[alt.nom] !== true) {
                etapes.push({ type: "etatRate", cible: idCible, nom: alt.nom });
                return;
            }

            // Un même état ne s'empile pas : il se renouvelle, en gardant la
            // plus longue des deux durées. Sans cette règle, deux brûlures
            // successives donnaient deux compteurs distincts sur la même fiche.
            // DEUX VOCABULAIRES DANS LE MÊME TABLEAU, ET ÇA SE VOYAIT À L'ÉCRAN.
            //
            // Tout le jeu — les fiches, la Forge, le panneau, la piste — dit
            // `duree`. Ce noyau disait `tours`, et lisait `alt.tours` sur une
            // altération qui porte `duree` : chaque état posé par le cerveau
            // durait donc UN tour au lieu de sa vraie durée. Et comme il ne
            // gardait que le nom, l'icône et la description disparaissaient :
            // la piste d'initiative affichait une image cassée
            // (GET .../undefined 404) sous le portrait du héros.
            //
            // Un seul vocabulaire, celui du jeu, et l'état emporte de quoi être
            // montré.
            const existant = cible.etats.find(e => e && e.nom === alt.nom);
            const duree = nombre(alt.duree !== undefined ? alt.duree : alt.tours, 1);
            if (existant) {
                existant.duree = Math.max(nombre(existant.duree), duree);
            } else {
                cible.etats = [...cible.etats, {
                    nom: alt.nom,
                    duree,
                    ...(alt.icone ? { icone: alt.icone } : {}),
                    ...(alt.desc ? { desc: alt.desc } : {}),
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

    // --- LES SUITES DE L'ÉQUIPEMENT ---------------------------------------
    //  Ce que l'arme ou la bague laisse DERRIÈRE la carte : l'élan
    //  d'initiative gagné en frappant, la bénédiction posée sur qui vient
    //  d'être soigné, le pas de retraite offert après un coup porté. Les jets
    //  (tirerDesCarte) ont déjà tranché qui en profite ; on ne fait que poser
    //  les états qui en résultent, exactement comme n'importe quelle
    //  altération de carte — même règle de renouvellement (la plus longue des
    //  deux durées, jamais de cumul).
    const ICONE_SUITE_EQUIPEMENT =
        "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1782669075/bandeau_carte_normal_qlziou.png";
    const poserSuiteEquipement = (idCible, nom, duree, bonusEquip, desc) => {
        const cible = combattant(suivant, idCible);
        if (!cible || cible.aTerre) return;
        const existant = cible.etats.find(e => e && e.nom === nom);
        if (existant) {
            existant.duree = Math.max(nombre(existant.duree), duree);
            existant.bonusEquip = bonusEquip;
        } else {
            cible.etats = [...cible.etats,
                           { nom, duree, bonusEquip, icone: ICONE_SUITE_EQUIPEMENT, desc }];
        }
        etapes.push({ type: "etats", cible: idCible, pose: nom, liste: cible.etats });
    };

    (jets.equipLanceur || []).forEach(buff => {
        poserSuiteEquipement(idLanceur, "Élan", buff.tours || 2,
            { initiative: buff.initiative || 0 },
            `+${buff.initiative || 0} d'initiative sur les prochaines cartes.`);
    });

    if ((jets.equipBenedictions || []).length > 0) {
        // La bénédiction vise qui vient d'être soigné par CETTE carte — jamais
        // le lanceur d'office, sauf s'il se soigne lui-même.
        const soignes = [...new Set((action.attaques || [])
            .filter(a => a.isHeal).flatMap(a => a.cibles || []))];
        jets.equipBenedictions.forEach(beni => {
            const bonus = {};
            if (beni.resPhys) bonus.resPhys = beni.resPhys;
            if (beni.resMag) bonus.resMag = beni.resMag;
            if (beni.degatsPct) bonus.degatsPct = beni.degatsPct;
            const detail = [beni.resPhys ? `+${beni.resPhys}% résistance physique` : null,
                            beni.resMag ? `+${beni.resMag}% résistance magique` : null,
                            beni.degatsPct ? `+${beni.degatsPct}% de dégâts` : null]
                .filter(Boolean).join(", ");
            soignes.forEach(id => poserSuiteEquipement(id, "Béni", beni.tours || 1, bonus, detail));
        });
    }

    if (nombre(jets.equipPasOfferts) > 0) {
        poserSuiteEquipement(idLanceur, "Repli", 1, { hexApresAttaque: nombre(jets.equipPasOfferts) },
            `${nombre(jets.equipPasOfferts)} case(s) de déplacement gratuite(s) après avoir frappé.`);
    }

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
