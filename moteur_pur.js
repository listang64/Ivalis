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

// =========================================================================
//  CE QUE CHAQUE ÉTAT FAIT, EN UN SEUL ENDROIT
// =========================================================================
//  Jusqu'ici, ce que faisait un état était éparpillé : le malus d'esquive de
//  l'Étourdi vivait dans la conversion d'une fiche Firestore (app.js), sa
//  chance de rater une technique dans deux moteurs différents, le coût doublé
//  du Glacé dans le module de mouvement. Résultat : sous le régime du cerveau,
//  qui ne traverse aucun de ces chemins, l'Étourdi ne coûtait PLUS RIEN en
//  esquive ni en parade — il ne faisait qu'exister.
//
//  Ce tableau est la réponse : une ligne par état, lue par le noyau au moment
//  de trancher. Changer l'équilibre d'un état, c'est changer un nombre ici.
//
//    esquive / parade        points de défense retirés tant que l'état dure
//    echecTechnique          % de chance de rater complètement sa technique
//    degatsSubis             % de dégâts EN PLUS encaissés, tous types
//    degatsMagiquesSubis     % de dégâts EN PLUS, seulement en magique
//    degatsParTour           dégâts pris à chaque fin de manche tant qu'il dure
//    soinsRecus              % ajouté (ou retiré) à tout soin reçu
//
//  Le coût de déplacement doublé du Glacé, lui, reste dans mouvement_pur.js :
//  il ne se mesure pas en pourcentage mais en règle de chemin.
export const REGLES_ETATS = {
    "Étourdi":    { esquive: -30, parade: -30, echecTechnique: 20 },
    "Glacé":      { degatsSubis: 20 },
    "Électrifié": { degatsMagiquesSubis: 20 },
    "Brûlé":      { degatsParTour: 3, soinsRecus: -50 }
};

// LA BOUSCULADE. Une poussée qui aboutit peut, en plus, faire perdre pied :
// la cible se rattrape, et ça lui coûte de l'énergie. C'est ce qui remplace la
// « mise à terre » — le jeu n'a pas d'état « couché », mais il a une jauge de
// fatigue, et la dépenser sans avoir rien choisi est une vraie punition.
export const CHANCE_BOUSCULADE_POUSSEE = 15;   // % de chance
export const FATIGUE_BOUSCULADE_POUSSEE = 20;  // % de l'énergie maximale

// Ce que les états d'un combattant lui coûtent (ou lui rapportent) sur une
// ligne donnée du tableau. Un état inconnu du tableau ne change rien.
export function regleDesEtats(c, cle) {
    let total = 0;
    (c && c.etats ? c.etats : []).forEach(e => {
        const regle = e && REGLES_ETATS[e.nom];
        if (regle && typeof regle[cle] === "number") total += regle[cle];
    });
    return total;
}

export const esquiveDe     = (c) => nombre(c && c.def && c.def.esquive)  + bonusDesEtats(c, "esquive")
                                  + regleDesEtats(c, "esquive");
export const paradeDe      = (c) => nombre(c && c.def && c.def.parade)   + bonusDesEtats(c, "parade")
                                  + regleDesEtats(c, "parade");
export const defPhysiqueDe = (c) => nombre(c && c.def && c.def.physique) + bonusDesEtats(c, "resPhys");
export const defMagiqueDe  = (c) => nombre(c && c.def && c.def.magique)  + bonusDesEtats(c, "resMag");
export const critiqueDe    = (c) => nombre(c && c.def && c.def.critique) + bonusDesEtats(c, "critique");

export const aLEtat = (c, nom) => (c && c.etats ? c.etats : []).some(e => e && e.nom === nom);

// =========================================================================
//  LA POUSSÉE : OÙ LA CIBLE ATTERRIT
// =========================================================================

// Une plaine sans obstacle : ce que voit le noyau quand personne ne lui passe
// de plateau (un banc, un rejeu hors du jeu).
const PLAINE = { etatCase: () => ({ bloquee: false, supprimee: false, difficile: false }) };

// Une case où l'on peut atterrir : ni mur, ni trou, ni voisin debout dessus.
// Contrairement au Bond, une poussée ne survole personne — c'est la règle de
// l'ancien moteur, reprise telle quelle.
export function caseLibre(etat, plateau, q, r, idIgnore) {
    const carte = plateau || PLAINE;
    const dessus = (carte.etatCase ? carte.etatCase(q, r) : null) || {};
    if (dessus.bloquee || dessus.supprimee) return false;
    const table = (etat && etat.combattants) || {};
    return !Object.keys(table).some(id => {
        if (id === idIgnore) return false;
        const c = table[id];
        return c && !c.aTerre && c.q === q && c.r === r;
    });
}

//  On prolonge la ligne lanceur → cible, case par case, et on s'arrête au
//  premier obstacle. La géométrie est celle de l'ancien moteur, reprise au
//  caractère près (interpolation en coordonnées cubiques, puis arrondi) : une
//  poussée en diagonale doit partir dans la même direction qu'avant.
//
//  `estLibre` est fourni par l'appelant — le noyau ne connaît ni le plateau ni
//  qui se tient où, on les lui passe. Rendre `null`, c'est « bloquée » : la
//  cible ne bouge pas d'un pouce.
export function destinationPoussee(lanceur, cible, cases, estLibre) {
    const distance = distanceHex(lanceur, cible);
    if (!Number.isFinite(distance) || distance === 0) return null;

    const lerp = (a, b, t) => a + (b - a) * t;
    const arrondiCube = (q, r, s) => {
        let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
        const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
        if (dq > dr && dq > ds) rq = -rr - rs;
        else if (dr > ds) rr = -rq - rs;
        return { q: rq, r: rr };
    };
    // Le millionième de case évite une ligne parfaitement à cheval entre deux
    // colonnes, qui partirait d'un côté ou de l'autre selon l'arrondi.
    const a = { q: lanceur.q + 1e-6, r: lanceur.r + 1e-6, s: -lanceur.q - lanceur.r - 2e-6 };
    const b = { q: cible.q + 1e-6, r: cible.r + 1e-6, s: -cible.q - cible.r - 2e-6 };

    let arrivee = null;
    for (let i = 1; i <= nombre(cases, 2); i++) {
        const t = (distance + i) / distance;
        const pt = arrondiCube(lerp(a.q, b.q, t), lerp(a.r, b.r, t), lerp(a.s, b.s, t));
        if (!estLibre(pt.q, pt.r)) break;
        arrivee = pt;
    }
    return arrivee;
}

// Le sens inverse de la Poussée : on tire la cible vers le lanceur au lieu de
// la repousser. Même géométrie (interpolation cubique, arrondi au caractère
// près — un tirage en diagonale doit partir dans la même direction qu'avant),
// avec deux différences qui tiennent à ce que « tirer » veut dire :
//   - au contact (distance ≤ 1), il n'y a rien à tirer — aucune direction
//     n'existerait, et un jeu de un million de cases ne trancherait rien ;
//   - on ne va jamais jusqu'au bout : la cible ne doit jamais atterrir SUR
//     la case du lanceur, elle vient s'arrêter juste avant.
export function destinationTraction(lanceur, cible, cases, estLibre) {
    const distance = distanceHex(lanceur, cible);
    if (!Number.isFinite(distance) || distance <= 1) return null;

    const lerp = (a, b, t) => a + (b - a) * t;
    const arrondiCube = (q, r, s) => {
        let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
        const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
        if (dq > dr && dq > ds) rq = -rr - rs;
        else if (dr > ds) rr = -rq - rs;
        return { q: rq, r: rr };
    };
    // On part de la cible et on avance vers le lanceur — le sens inverse de
    // la Poussée, tout le reste est identique.
    const a = { q: cible.q + 1e-6, r: cible.r + 1e-6, s: -cible.q - cible.r - 2e-6 };
    const b = { q: lanceur.q + 1e-6, r: lanceur.r + 1e-6, s: -lanceur.q - lanceur.r - 2e-6 };

    // Jamais jusqu'au bout (i = distance atterrirait sur le lanceur lui-même).
    const maxPas = Math.min(nombre(cases, 3), distance - 1);
    let arrivee = null;
    for (let i = 1; i <= maxPas; i++) {
        const t = i / distance;
        const pt = arrondiCube(lerp(a.q, b.q, t), lerp(a.r, b.r, t), lerp(a.s, b.s, t));
        if (!estLibre(pt.q, pt.r)) break;
        arrivee = pt;
    }
    return arrivee;
}

// La distance hexagonale, en coordonnées axiales. La même formule que partout
// ailleurs dans le jeu — elle décide du malus de tir à bout portant.
export function distanceHex(a, b) {
    if (!a || !b || a.q === null || b.q === null) return Infinity;
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

// Voir de A à B, c'est n'avoir aucun mur entre les deux. On tire la ligne
// droite, case par case, et le premier obstacle la coupe. Portage à
// l'identique de verifierLigneDeVue (moteur_effets.js) : mêmes coordonnées
// cubiques, même millionième de case pour départager une ligne à cheval, et
// seules les cases BLOQUÉES arrêtent le regard — un trou dans le sol se
// survole des yeux.
export function ligneDeVue(plateau, a, b) {
    const carte = plateau || PLAINE;
    const distance = distanceHex(a, b);
    if (!Number.isFinite(distance) || distance <= 1) return true;

    const lerp = (x, y, t) => x + (y - x) * t;
    const arrondiCube = (q, r, s) => {
        let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
        const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
        if (dq > dr && dq > ds) rq = -rr - rs;
        else if (dr > ds) rr = -rq - rs;
        return { q: rq, r: rr };
    };
    const ca = { q: a.q + 1e-6, r: a.r + 1e-6, s: -a.q - a.r - 2e-6 };
    const cb = { q: b.q + 1e-6, r: b.r + 1e-6, s: -b.q - b.r - 2e-6 };

    for (let i = 1; i < distance; i++) {
        const t = i / distance;
        const pt = arrondiCube(lerp(ca.q, cb.q, t), lerp(ca.r, cb.r, t), lerp(ca.s, cb.s, t));
        const dessus = (carte.etatCase ? carte.etatCase(pt.q, pt.r) : null) || {};
        if (dessus.bloquee) return false;
    }
    return true;
}

// =========================================================================
//  LA CONFUSION — QUAND LA CARTE PART DE TRAVERS
// =========================================================================
//  Un combattant confus ne maîtrise plus ce qu'il lance. Un dé, tiré une fois
//  pour toute la carte, décide :
//
//    1-20   il se l'inflige à lui-même ;
//    21-40  il vise quelqu'un d'autre au hasard, ami ou ennemi, à portée ;
//    41-50  la confusion se dissipe, et la carte part normalement ;
//    51-100 rien ne change.
//
//  UNE CARTE SANS ATTAQUE NE PEUT PAS PARTIR AU HASARD. Un soin, un bouclier,
//  une pose d'état : la bande 21-40 rejoint la bande 1-20 et se retourne sur
//  le lanceur. C'est la règle de l'ancien moteur, et elle a sa logique — on ne
//  « rate » pas un soin sur un inconnu, on se le donne à soi.
//
//  POURQUOI CE TIRAGE VIT ICI, ET PLUS CHEZ LE JOUEUR. Il était fait dans le
//  navigateur du lanceur, avec Math.random(), avant l'envoi de la carte. Deux
//  conséquences : le résultat ne pouvait pas être vérifié (un poste envoyait
//  un dé que les autres devaient croire), et surtout la DISSIPATION était
//  purement et simplement désactivée sous le régime du cerveau — la bande
//  41-50 y était sautée, faute d'un chemin pour effacer un état sans écrire
//  par-dessus le cerveau. Tiré ici, le dé est le même pour tout le monde, et
//  la dissipation redevient une étape comme une autre.
//
//  LE DÉ N'EST TIRÉ QUE SI LE LANCEUR EST CONFUS. C'est la règle de toute la
//  maison : un dé consommé par condition décalerait la suite du tirage pour
//  tous les autres effets de la carte, et deux postes qui rejouent le même
//  tour n'auraient plus la même partie.
export const CHANCE_CONFUSION_AUTO      = 20;
export const CHANCE_CONFUSION_ALEATOIRE = 40;
export const CHANCE_CONFUSION_DISSIPEE  = 50;

export function appliquerConfusion(etat, action, plateau, des) {
    const lanceur = combattant(etat, action.idLanceur);
    if (!lanceur || !aLEtat(lanceur, "Confusion")) return action;

    const jet = des.d100();
    const attaques = action.attaques || [];
    const alterations = action.alterations || [];
    const carteAUneAttaque = attaques.length > 0;

    // Se viser soi-même. Les déplacements forcés n'ont aucun sens sur place
    // (la distance est nulle, la géométrie ne donne aucune direction) : on les
    // éteint plutôt que de les retourner sur le lanceur.
    const versSoi = () => ({
        ...action,
        attaques: attaques.map(a => ({ ...a, cibles: [action.idLanceur] })),
        alterations: alterations.map(alt => ({
            ...alt,
            cibles: (alt.estPoussee || alt.estTraction || alt.estPeur) ? [] : [action.idLanceur]
        })),
        isZone: false,
        confusion: { type: "auto" }
    });

    if (jet <= CHANCE_CONFUSION_AUTO || (jet <= CHANCE_CONFUSION_ALEATOIRE && !carteAUneAttaque)) {
        return versSoi();
    }

    if (jet <= CHANCE_CONFUSION_ALEATOIRE) {
        const config = attaques[0] || alterations[0] || {};
        const portee = Math.max(nombre(config.rangeMax, 1), nombre(action.porteeMinTraction, 0));
        // Une illusion ne se fait leurrer que par une attaque nue : un soin ou
        // un état lancé sur un mirage serait perdu pour rien.
        const attaqueSimple = !config.isHeal && !config.isShield && alterations.length === 0;

        const table = etat.combattants || {};
        const possibles = Object.keys(table).filter(id => {
            if (id === action.idLanceur) return false;
            const c = table[id];
            if (!c || c.aTerre) return false;
            if (c.estIllusion && !attaqueSimple) return false;
            if (distanceHex(lanceur, c) > portee) return false;
            return ligneDeVue(plateau, lanceur, c);
        }).sort();

        // Personne d'autre à portée : la carte se retourne sur son lanceur.
        if (possibles.length === 0) return versSoi();

        const idCible = des.parmi(possibles);
        return {
            ...action,
            attaques: attaques.map(a => ({ ...a, cibles: [idCible] })),
            alterations: alterations.map(alt => ({ ...alt, cibles: [idCible] })),
            isZone: false,
            confusion: { type: "aleatoire", idCible }
        };
    }

    if (jet <= CHANCE_CONFUSION_DISSIPEE) {
        return { ...action, confusion: { type: "annulee" } };
    }

    return action;  // 51-100 : la carte part comme le joueur l'a voulue.
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

    // Étourdi : une chance de rater complètement sa technique — le chiffre
    // vient du tableau des états, il ne traîne plus en dur ici.
    const echec = regleDesEtats(lanceur, "echecTechnique");
    if (echec > 0) jets.attaqueRatee = des.d100() <= echec;

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
            // LA BOUSCULADE DE LA POUSSÉE. Une cible poussée peut en plus perdre
            // pied : un second jet, sur la seule Poussée, qui lui coûte une part
            // de son énergie. Le dé n'est tiré QUE pour cet état-là — ajouter un
            // tirage pour tout le monde décalerait la suite des dés de toutes
            // les autres cartes du jeu.
            if (alt.nom === "Poussée" && c.bouscule === undefined) {
                c.bouscule = des.d100() <= CHANCE_BOUSCULADE_POUSSEE;
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

    // 2 bis. LES VULNÉRABILITÉS DE LA CIBLE. Un corps gelé casse plus
    //    facilement (+20 % de tout), un corps électrifié conduit la magie
    //    (+20 % de magique en plus). Elles s'ajoutent l'une à l'autre, et se
    //    posent AVANT l'absorption et les résistances : c'est le coup qui
    //    arrive plus fort, pas l'armure qui protège moins.
    let vulnerabilite = regleDesEtats(cible, "degatsSubis");
    if (attaque.typeRes === "Magique") vulnerabilite += regleDesEtats(cible, "degatsMagiquesSubis");
    if (vulnerabilite !== 0) degats = Math.max(0, Math.round(degats * (1 + vulnerabilite / 100)));

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

    // 5. L'ÉTALEMENT NE FRAPPE PLUS TOUT DE SUITE. Une technique étalée ne fait
    //    RIEN au moment où elle part : sa première moitié tombe à la fin de la
    //    manche en cours, la seconde à la fin de la suivante. C'est ce qui
    //    justifie sa ristourne de fatigue — on paie moins cher, mais il faut
    //    attendre. Le reste de la division va sur le premier tic, pour que les
    //    deux moitiés fassent exactement le total d'une attaque normale.
    if (attaque.estEtalement && degatsFinaux > 0) {
        const second = Math.floor(degatsFinaux / 2);
        compte.tics = [degatsFinaux - second, second];
        compte.secondTic = second;   // gardé pour qui lit encore l'ancien nom
        degatsFinaux = 0;
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

// =========================================================================
//  TRAVERSER UNE ZONE PERSISTANTE
// =========================================================================
//  La nappe de feu, la flaque de poison, le remous qui soigne : ce que laisse
//  une carte de Persistance de terrain, et qui frappe quiconque met le pied
//  dessus. Portage de resoudreZonesPersistantesSurCase (moteur_effets.js).
//
//  CE QUI ÉTAIT CASSÉ. Sous le régime du cerveau, marcher dans le feu ne
//  faisait plus rien du tout. La zone se posait bien, se dessinait bien, et
//  l'IA la contournait bien — mais la seule fonction qui infligeait vraiment
//  quelque chose vivait dans l'ancien moteur, appelée depuis des chemins que
//  le nouveau régime ne traverse jamais (l'ancienne branche de validerMouvement
//  et les vieux déplacements forcés). Une zone était devenue un décor.
//
//  La chaîne est plus courte que celle d'une carte, et c'est voulu : un piège
//  au sol n'a pas de coup critique, pas de malus à bout portant, pas
//  d'absorption. Juste la résistance, puis le bouclier, puis la chair.
//
//  Cette fonction MODIFIE le combattant dans l'état qu'on lui passe, et rend
//  les étapes à jouer. Elle est appelée au milieu d'une marche déjà en cours
//  (resoudreMouvement travaille sur sa copie) : lui faire cloner l'état à
//  chaque case ferait perdre les pas déjà écrits.
export function traverserZones(etat, id, hex, des) {
    const etapes = [];
    const cible = combattant(etat, id);
    if (!cible || cible.aTerre || !hex) return etapes;

    const zones = Object.values((etat && etat.zones) || {})
        .filter(z => z && (z.hexes || []).some(h => h && h.q === hex.q && h.r === hex.r))
        // L'ordre des clés d'un objet n'est pas une garantie : on le fixe, sans
        // quoi deux postes pourraient résoudre deux zones superposées dans un
        // ordre différent — et consommer les dés dans un ordre différent.
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));

    zones.forEach(zone => {
        // Le jet de défense d'abord, comme pour une attaque d'opportunité :
        // une seule chance de passer au travers, quel que soit le contenu.
        const esquive = esquiveDe(cible), parade = paradeDe(cible);
        const evitee = des.d100() <= Math.max(esquive, parade);
        if (evitee) {
            etapes.push({ type: "esquive", cible: id, acteur: zone.idLanceur || id,
                          parade: parade > esquive, zone: zone.id });
            return;
        }

        if (zone.degats) {
            const resistance = zone.degats.typeRes === "Magique"
                ? defMagiqueDe(cible) : defPhysiqueDe(cible);
            const part = Math.min(Math.max(resistance, 0), 100) / 100;
            const montant = Math.max(0, Math.round(nombre(zone.degats.valeurBrute) * (1 - part)));
            if (montant > 0) {
                let surBouclier = 0;
                if (cible.bouclier > 0) {
                    // Le surplus part dans le vide, comme partout ailleurs.
                    surBouclier = Math.min(cible.bouclier, montant);
                    cible.bouclier = Math.max(0, cible.bouclier - montant);
                } else {
                    cible.pv = Math.max(0, cible.pv - montant);
                }
                etapes.push({ type: "degats", cible: id, acteur: zone.idLanceur || id,
                              montant, surBouclier, zone: zone.id,
                              bouclierApres: cible.bouclier, pvApres: cible.pv });

                if (cible.pvMax > 0 && cible.pv <= 0 && !cible.aTerre) {
                    cible.aTerre = true;
                    etapes.push({ type: "chute", cible: id, acteur: zone.idLanceur || id });
                    return;   // Tombé dans le feu : le reste de la zone ne le concerne plus.
                }
            }
        }

        // Un remous bienfaisant ne distingue pas les camps — la Persistance de
        // terrain n'a jamais fait le tri, pas plus pour un soin que pour un
        // brasier.
        if (zone.soin) {
            const avant = cible.pv;
            cible.pv = Math.min(cible.pvMax, cible.pv + nombre(zone.soin.valeurBrute));
            if (cible.pv !== avant) {
                etapes.push({ type: "soin", cible: id, acteur: zone.idLanceur || id,
                              montant: cible.pv - avant, pvApres: cible.pv, zone: zone.id });
            }
        }

        // L'état garde le pourcentage calculé quand le sort a été lancé.
        if (zone.etat && zone.etat.nom) {
            const immunites = (cible.atouts && cible.atouts.immunites) || [];
            const pris = des.d100() <= nombre(zone.etat.chance);
            if (immunites.includes(zone.etat.nom)) {
                etapes.push({ type: "etatRate", cible: id, nom: zone.etat.nom, immunise: true });
            } else if (pris) {
                const existant = (cible.etats || []).find(e => e && e.nom === zone.etat.nom);
                if (existant) {
                    existant.duree = Math.max(nombre(existant.duree), nombre(zone.etat.duree));
                    if (zone.etat.estPoison) existant.tickFait = false;
                } else {
                    cible.etats = [...(cible.etats || []), { ...zone.etat }];
                }
                etapes.push({ type: "etats", cible: id, pose: zone.etat.nom,
                              liste: cible.etats, zone: zone.id });
            }
        }
    });

    return etapes;
}

// La zone laissée par une carte de Persistance de terrain. Portage de
// creerZonePersistante, moins ses écritures : ici la zone entre dans l'état, et
// c'est le cerveau qui la diffuse comme tout le reste.
//
// SON IDENTIFIANT NE PEUT PAS ÊTRE UN HORODATAGE. L'ancien la nommait
// « zp_<Date.now()>_<Math.random()> » : deux postes rejouant le même tour
// fabriquaient deux identifiants différents, donc deux zones là où il n'y en a
// qu'une. Le numéro de version de l'état, lui, est le même pour tout le monde.
export function creerZonePure(etat, action, hexes, idLanceur) {
    const cases = (hexes || []).filter(Boolean).map(h => ({ q: h.q, r: h.r }));
    const vues = new Set();
    const emprise = cases.filter(h => {
        const cle = h.q + "," + h.r;
        if (vues.has(cle)) return false;
        vues.add(cle);
        return true;
    });
    if (emprise.length === 0) return null;

    const attaques = action.attaques || [];
    const frappe = attaques.find(a => !a.isHeal && !a.isShield && nombre(a.valeurBrute) > 0);
    const soigne = attaques.find(a => a.isHeal && nombre(a.valeurBrute) > 0);
    const alt = (action.alterations || []).find(a => a && a.persistante);

    const degats = frappe ? { valeurBrute: nombre(frappe.valeurBrute), typeRes: frappe.typeRes } : null;
    const soin = soigne ? { valeurBrute: nombre(soigne.valeurBrute) } : null;
    const etatDeZone = alt ? {
        nom: alt.nom, icone: alt.icone, desc: alt.desc || "",
        chance: nombre(alt.chance), duree: nombre(alt.duree),
        estPoison: !!alt.estPoison, tickFait: false
    } : null;

    // Rien à faire persister : pas de zone fantôme.
    if (!degats && !soin && !etatDeZone) return null;

    const id = `zp_${nombre(etat.version)}_${idLanceur || "x"}`;
    const type = etatDeZone ? (alt.typeZone || "neutre") : (soin ? "soin" : "neutre");

    return {
        id, hexes: emprise, type, degats, soin, etat: etatDeZone,
        dureeRestante: 3,          // Fixe : la Forge masque le bouton ⏳ sur ce mod
        idLanceur: idLanceur || null
    };
}

// Pas de superposition : la nouvelle zone REMPLACE les anciennes sur les cases
// qu'elle recouvre. Une ancienne qui garde des cases ailleurs survit, amputée ;
// celle qui se fait entièrement recouvrir disparaît.
//
// CHAQUE ZONE TOUCHÉE PORTE SON ÉTAPE, y compris celles qu'on ampute et celles
// qu'on efface. N'annoncer que la nouvelle suffirait à l'affichage mais pas au
// rejeu : un poste qui rejoue le journal poserait la nouvelle zone SANS retirer
// ce qu'elle recouvre, et se retrouverait avec deux nappes superposées là où le
// cerveau n'en a qu'une. Une divergence silencieuse, celle qui coûte le plus
// cher à retrouver.
export function poserZone(etat, zone) {
    const etapes = [];
    const prises = new Set((zone.hexes || []).map(h => h.q + "," + h.r));
    const restantes = {};
    Object.values(etat.zones || {}).forEach(z => {
        const garde = (z.hexes || []).filter(h => !prises.has(h.q + "," + h.r));
        if (garde.length > 0) {
            restantes[z.id] = { ...z, hexes: garde };
            if (garde.length !== (z.hexes || []).length) {
                etapes.push({ type: "zone", id: z.id, zone: restantes[z.id] });
            }
        } else {
            etapes.push({ type: "zone", id: z.id, retiree: true });
        }
    });
    restantes[zone.id] = zone;
    etat.zones = restantes;
    etapes.push({ type: "zone", id: zone.id, zone });
    return etapes;
}

// Un tour de moins à vivre, à chaque fin de manche. Celles qui tombent à zéro
// s'effacent. Ce décompte vivait dans combat.js, sur le poste qui avait vidé la
// file — donc nulle part sous le nouveau régime, où plus personne ne « finit »
// le round de son côté.
export function vieillirZones(etat) {
    const etapes = [];
    Object.values(etat.zones || {}).forEach(z => {
        const reste = nombre(z.dureeRestante) - 1;
        if (reste > 0) {
            etat.zones[z.id] = { ...z, dureeRestante: reste };
            etapes.push({ type: "zone", id: z.id, zone: etat.zones[z.id] });
        } else {
            delete etat.zones[z.id];
            etapes.push({ type: "zone", id: z.id, retiree: true });
        }
    });
    return etapes;
}

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

export function resoudreCarte(etat, action, plateau) {
    const suivant = clonerEtat(etat);
    const etapes = [];
    const idLanceur = action.idLanceur;
    const lanceur = combattant(suivant, idLanceur);
    if (!lanceur) return { etat: suivant, etapes };

    // Le terrain, pour les effets qui déplacent (la Poussée). Sans lui, on
    // travaille sur une plaine infinie : c'est ce dont un banc a besoin, et
    // jamais ce que le jeu fournit.
    const carte = plateau || PLAINE;

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

    // LA CONFUSION SE DIT AVANT DE SE VOIR. Sans ce mot, le joueur regarde sa
    // carte partir sur son propre camp sans comprendre, et croit à un bug :
    // l'ancien moteur l'affichait (jouerAnimationMoteur), le cerveau ne le
    // faisait pas. Les cibles, elles, ont déjà été détournées en amont par
    // appliquerConfusion — ici on ne fait qu'annoncer, et dissiper s'il y a
    // lieu.
    if (action.confusion) {
        const dit = {
            auto:      "Confus : s'inflige sa propre compétence !",
            aleatoire: "Confus : cible au hasard !",
            annulee:   "Confusion dissipée !"
        }[action.confusion.type];
        if (dit) {
            etapes.push({ type: "message", cible: idLanceur, acteur: idLanceur,
                          texte: dit,
                          couleur: action.confusion.type === "annulee" ? "#33cc66" : "#cc66ff" });
        }
        if (action.confusion.type === "annulee") {
            lanceur.etats = (lanceur.etats || []).filter(e => e && e.nom !== "Confusion");
            etapes.push({ type: "etats", cible: idLanceur, liste: lanceur.etats });
        }
    }

    // Le lanceur étourdi rate parfois complètement sa technique. Le jet a été
    // tiré au lancement ; on ne fait que le lire.
    if (regleDesEtats(lanceur, "echecTechnique") > 0 && jets.attaqueRatee) {
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
                let soin = Math.max(0, nombre(attaque.valeurBrute) + bonusMonstre) * (critique ? 2 : 1);
                // CE QUE LA CIBLE FAIT DU SOIN QU'ELLE REÇOIT. L'Éthéré en tire
                // trente pour cent de plus ; une plaie qui brûle en perd la
                // moitié. Ces deux règles ne vivaient que dans l'ancien moteur :
                // sous le régime du cerveau, un Éthéré soignait comme tout le
                // monde et une brûlure ne gênait aucun soin.
                const partSoins = 100 + nombre(cible.atouts && cible.atouts.soinsRecus)
                                      + regleDesEtats(cible, "soinsRecus");
                soin = Math.max(0, Math.round(soin * (partSoins / 100)));
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

            // L'ÉTALEMENT : LES DEUX MOITIÉS ATTENDENT. Rien n'a été retiré
            // au-dessus (compte.degats vaut zéro) ; tout est rangé dans l'état,
            // une moitié pour la fin de cette manche, l'autre pour la fin de la
            // suivante. Un second étalement sur une cible déjà touchée rallonge
            // la file plutôt que d'écraser ce qui lui reste à encaisser.
            if ((compte.tics || []).length > 0) {
                const dejaLa = cible.etats.find(e => e && e.nom === "Étalement");
                if (dejaLa) {
                    dejaLa.tics = [...(dejaLa.tics || []), ...compte.tics];
                    dejaLa.duree = Math.max(nombre(dejaLa.duree), dejaLa.tics.length);
                } else {
                    cible.etats = [...cible.etats,
                                   { nom: "Étalement", duree: compte.tics.length,
                                     tics: [...compte.tics] }];
                }
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
    //
    //  Le type de dégâts de la carte sert aux états qui rongent (la brûlure) :
    //  ils frapperont du même type que le coup qui les a posés. Une carte qui
    //  ne fait que poser l'état, sans frapper, allume une flamme magique — un
    //  état altéré est un effet magique dans la Forge.
    const typeDeLaCarte = ((action.attaques || [])
        .find(a => !a.isHeal && !a.isShield && (a.valeurBrute || 0) > 0) || {}).typeRes || "Magique";

    (action.alterations || []).forEach(alt => {
        const regleAlt = REGLES_ETATS[alt.nom] || {};
        const typeDegatsDeLEtat = regleAlt.degatsParTour > 0 ? typeDeLaCarte : null;
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

            // --- LA POUSSÉE : UN EFFET, PAS UN ÉTAT ------------------------
            //  Elle ne dure pas : elle déplace, et c'est fini. Le cerveau ne la
            //  jouait pas du tout — il posait un état « Poussée » de durée zéro
            //  qui ne poussait personne et s'effaçait tout seul à la manche
            //  suivante. Ici, la cible part vraiment.
            if (alt.nom === "Poussée") {
                const depart = { q: nombre(cible.q), r: nombre(cible.r) };
                const arrivee = destinationPoussee(lanceur, cible, nombre(alt.cases, 2),
                                                   (q, r) => caseLibre(suivant, carte, q, r, idCible));
                if (arrivee) {
                    cible.q = arrivee.q;
                    cible.r = arrivee.r;
                    etapes.push({ type: "poussee", cible: idCible, acteur: idLanceur,
                                  de: depart, vers: arrivee });
                } else {
                    etapes.push({ type: "message", cible: idCible, acteur: idLanceur,
                                  texte: "Poussée bloquée" });
                }

                // La bousculade : elle se joue même quand un mur a arrêté la
                // poussée — être projeté contre une paroi fatigue autant.
                if (des.bouscule) {
                    const perte = Math.ceil(nombre(cible.fatigueMax) * (FATIGUE_BOUSCULADE_POUSSEE / 100));
                    const apres = Math.max(0, nombre(cible.fatigue) - perte);
                    if (apres !== nombre(cible.fatigue)) {
                        cible.fatigue = apres;
                        etapes.push({ type: "fatigue", cible: idCible, fatigueApres: apres,
                                      tic: "Bousculade" });
                    }
                }
                return;
            }

            // --- LA TRACTION : SYMÉTRIQUE DE LA POUSSÉE --------------------
            //  Même principe, sens inverse : elle tire la cible vers le
            //  lanceur au lieu de la repousser. Un effet, pas un état — elle
            //  ne pose plus, elle non plus, de fantôme de durée zéro.
            if (alt.nom === "Traction") {
                const depart = { q: nombre(cible.q), r: nombre(cible.r) };
                const arrivee = destinationTraction(lanceur, cible, nombre(alt.cases, 3),
                                                    (q, r) => caseLibre(suivant, carte, q, r, idCible));
                if (arrivee) {
                    cible.q = arrivee.q;
                    cible.r = arrivee.r;
                    etapes.push({ type: "traction", cible: idCible, acteur: idLanceur,
                                  de: depart, vers: arrivee });
                } else {
                    etapes.push({ type: "message", cible: idCible, acteur: idLanceur,
                                  texte: "Traction bloquée" });
                }
                return;
            }

            // --- LA PEUR : IL LUI FAUT DES DÉS, ELLE SE JOUE UN CRAN PLUS LOIN
            //  Fuir, c'est choisir une direction à chaque case parcourue — un
            //  jet par pas, avec autant de pas que la fuite en compte. Ce
            //  noyau n'a plus de dé en main ici : tirerDesCarte a déjà fini de
            //  tirer avant qu'on y arrive, et le sien est à sens unique. Le
            //  cerveau la résout juste après coup (resoudrePeur,
            //  mouvement_pur.js), avec ses propres dés — exactement comme il
            //  le fait déjà pour les attaques d'opportunité d'une marche
            //  normale. On ne pose rien ici : ni fantôme, ni double emploi.
            if (alt.nom === "Peur") return;

            // Les états ordinaires, eux, se posent comme prévu — mais leur
            // durée est nulle. Le noyau ne sait pas encore les jouer — ils
            // restaient jusqu'ici accrochés à la fiche comme un état de durée
            // zéro, avec une pastille de couleur sur le pion pour rien. On ne
            // pose plus ce fantôme.
            if (nombre(alt.duree !== undefined ? alt.duree : alt.tours, 1) <= 0) {
                etapes.push({ type: "message", cible: idCible, acteur: idLanceur,
                              texte: alt.nom });
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
                // Une brûlure ravivée par une autre carte reprend le type de
                // CELLE-CI : c'est la dernière flamme posée qui brûle.
                if (typeDegatsDeLEtat) existant.typeDegats = typeDegatsDeLEtat;
                // Même principe pour la Provocation : provoqué une seconde fois,
                // c'est le dernier qui a crié qu'on doit aller frapper.
                if (alt.idProvocateur) existant.idProvocateur = alt.idProvocateur;
            } else {
                cible.etats = [...cible.etats, {
                    nom: alt.nom,
                    duree,
                    ...(alt.icone ? { icone: alt.icone } : {}),
                    ...(alt.desc ? { desc: alt.desc } : {}),
                    ...(alt.valeurAbs !== undefined ? { valeurAbs: alt.valeurAbs } : {}),
                    ...(alt.bonusEquip ? { bonusEquip: alt.bonusEquip } : {}),
                    // QUI A PROVOQUÉ. Sans ce nom, la Provocation ne provoque
                    // rien : l'IA (ia_pure.js) cherche l'état, lit
                    // `idProvocateur` pour se retourner vers celui qui l'a
                    // défiée, ne trouve rien, et choisit sa cible comme si de
                    // rien n'était. L'extraction le posait, ce tri le jetait —
                    // l'effet phare du tank était décoratif sous ce régime.
                    ...(alt.idProvocateur ? { idProvocateur: alt.idProvocateur } : {}),
                    // LA BRÛLURE SE SOUVIENT DE CE QUI L'A ALLUMÉE. Elle ronge
                    // à chaque manche (REGLES_ETATS.Brûlé.degatsParTour), et
                    // ces dégâts-là sont du type de l'attaque qui l'a posée :
                    // une flamme magique se heurte à la résistance magique,
                    // une torche plantée dans la plaie à l'armure.
                    ...(typeDegatsDeLEtat ? { typeDegats: typeDegatsDeLEtat } : {})
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
