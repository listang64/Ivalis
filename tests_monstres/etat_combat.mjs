// LE NOYAU PUR, MIS À L'ÉPREUVE — ÉTAPE 1 DE LA NOUVELLE ARCHITECTURE.
//
// Ce banc ne simule RIEN. Pas de faux Firestore, pas de faux navigateur, pas de
// minuteurs, pas de trois postes à orchestrer. Il importe le vrai fichier et
// l'appelle. C'est la première fois du projet, et c'est tout le but de la
// migration : ce qui ne peut pas être testé simplement finit toujours par
// casser.
//
// Ce qu'il garantit :
//   • les dés sont reproductibles à l'identique, et le hasard voyage dans l'état ;
//   • un état se construit depuis l'ancien monde sans rien perdre ;
//   • appliquer des étapes donne le même résultat partout, et deux fois de
//     suite donne le même résultat qu'une (c'est ce qui tuait les dégâts doublés) ;
//   • un poste en retard qui rattrape arrive exactement au même état ;
//   • les invariants attrapent les incohérences qu'on a vraiment vécues.
import {
    FORMAT_ETAT, creerDes, construireEtatCombat, combattantDepuisFiche,
    clonerEtat, appliquerEntree, appliquerEntrees, verifierEtatCombat
} from '../combat_etat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// Deux héros et une créature, au format que produit persoDocVersFront.
const FICHES = [
    { idPersonnage: "PERSO_naomi", idJoueur: "P_01", camp: "Allié", prenom: "Naomi",
      PV_Max: 58, PV_Actuels: 58, Fatigue_Max: 100, Fatigue_Actuelle: 100,
      Esquive: 15, Parade: 10, Critique: 10, Def_Physique: 4, Def_Magique: 2,
      Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant" },
    { idPersonnage: "PERSO_pliors", idJoueur: "P_03", camp: "Allié", prenom: "Pliors",
      PV_Max: 42, PV_Actuels: 42, Fatigue_Max: 100, fatigueActuelle: 80,
      Esquive: 20, Parade: 0, Critique: 15, Bouclier_Actuel: 6,
      Etats_Alteres: [{ nom: "Empoisonnement", tours: 2 }], statut: "Vivant" },
    { idPersonnage: "MONSTRE_goule", estMonstre: true, camp: "Ennemi", nom: "Goule",
      PV_Max: 70, PV_Actuels: 70, Fatigue_Max: 90, Esquive: 10,
      Etats_Alteres: [], statut: "Vivant" }
];

const POSITIONS = {
    PERSO_naomi:   { q: 0, r: 0 },
    PERSO_pliors:  { q: 1, r: 0 },
    MONSTRE_goule: { q: -2, r: 1 }
};

const PARTIE = {
    Phase_Combat: "Resolution",
    Tour_Combat: 3,
    Ordre_Initiative: ["MONSTRE_goule", "PERSO_naomi", "PERSO_pliors"],
    File_Attente_Combat: [
        { idPersonnage: "MONSTRE_goule", idCarte: "COMP_griffes", initiative: 70 },
        { idPersonnage: "PERSO_naomi",   idCarte: "COMP_soin",    initiative: 40 }
    ],
    Ont_Joue_Ce_Round: ["PERSO_pliors"]
};

const neuf = () => construireEtatCombat({
    idPartie: "GAME_63650", cerveau: "P_03", graine: 8371245,
    combattants: FICHES, positions: POSITIONS, partie: PARTIE,
    zones: { ZP_1: { id: "ZP_1", hexes: [{ q: 0, r: 1 }], dureeRestante: 2, type: "soin" } }
});

// =========================================================================
console.log("\n1. LES DÉS SONT REPRODUCTIBLES");
// =========================================================================
//  C'est ce qui transforme une partie qui a bugué en banc d'essai : on garde
//  l'état de départ et la liste des intentions, et on rejoue à l'identique.
{
    const a = creerDes(8371245), b = creerDes(8371245);
    const tirageA = [a.d100(), a.d100(), a.entier(1, 6), a.chance(20), a.parmi(["x", "y", "z"])];
    const tirageB = [b.d100(), b.d100(), b.entier(1, 6), b.chance(20), b.parmi(["x", "y", "z"])];
    verifier("deux dés de même graine donnent la même suite",
             JSON.stringify(tirageA) === JSON.stringify(tirageB), `(${tirageA.join(", ")})`);

    const c = creerDes(999);
    verifier("une autre graine donne autre chose", c.d100() !== creerDes(8371245).d100());

    // La graine d'après permet de REPRENDRE la suite exactement où on l'a
    // laissée : c'est ce qui la fait voyager dans l'état d'un tour à l'autre.
    const d = creerDes(42);
    d.d100(); d.d100();
    const reprise = creerDes(d.graine());
    const dSuite = d.d100(), repriseSuite = reprise.d100();
    verifier("la graine d'après reprend la suite au bon endroit",
             dSuite === repriseSuite, `(${dSuite} = ${repriseSuite})`);

    // Un d100 reste un d100, et une chance de 0 % ne se produit jamais.
    const e = creerDes(7);
    let mini = 999, maxi = 0, jamais = 0, toujours = 0;
    for (let i = 0; i < 5000; i++) {
        const v = e.d100();
        if (v < mini) mini = v;
        if (v > maxi) maxi = v;
        if (creerDes(i).chance(0)) jamais++;
        if (!creerDes(i).chance(100)) toujours++;
    }
    verifier("le d100 reste entre 1 et 100", mini >= 1 && maxi <= 100, `(${mini} à ${maxi})`);
    verifier("une chance de 0 % ne se produit jamais", jamais === 0);
    verifier("une chance de 100 % se produit toujours", toujours === 0);
}

// =========================================================================
console.log("\n2. L'ÉTAT SE CONSTRUIT SANS RIEN PERDRE");
// =========================================================================
{
    const etat = neuf();

    verifier("le format est celui du fichier", etat.format === FORMAT_ETAT);
    verifier("la version démarre à zéro", etat.version === 0);
    verifier("le cerveau est nommé", etat.cerveau === "P_03");
    verifier("les trois combattants sont là", Object.keys(etat.combattants).length === 3);

    const naomi = etat.combattants.PERSO_naomi;
    verifier("les points de vie sont repris", naomi.pv === 58 && naomi.pvMax === 58);
    verifier("la case aussi", naomi.q === 0 && naomi.r === 0);
    verifier("le poste qui la commande est noté", naomi.joueur === "P_01");
    verifier("ses statistiques de combat sont figées",
             naomi.stats.Esquive === 15 && naomi.stats.Def_Physique === 4);

    const pliors = etat.combattants.PERSO_pliors;
    verifier("l'énergie entamée est reprise", pliors.fatigue === 80, `(${pliors.fatigue})`);
    verifier("le bouclier aussi", pliors.bouclier === 6);
    verifier("et ses états", pliors.etats.length === 1 && pliors.etats[0].nom === "Empoisonnement");

    const goule = etat.combattants.MONSTRE_goule;
    verifier("une créature est reconnue comme telle", goule.estMonstre === true && goule.camp === "Ennemi");
    verifier("et n'appartient à aucun poste", goule.joueur === "");

    verifier("la file est reprise dans l'ordre",
             etat.file.map(f => f.id).join(">") === "MONSTRE_goule>PERSO_naomi");
    verifier("la carte choisie voyage avec", etat.file[0].carte === "COMP_griffes");
    verifier("la manche et la phase sont reprises", etat.manche === 3 && etat.phase === "Resolution");
    verifier("les zones persistantes aussi", !!etat.zones.ZP_1 && etat.zones.ZP_1.dureeRestante === 2);

    verifier("et l'état est cohérent", verifierEtatCombat(etat).length === 0,
             verifierEtatCombat(etat).join(" | "));

    // Les états ne doivent PAS partager leur mémoire avec la fiche d'origine :
    // une modification de l'un ne doit jamais toucher l'autre.
    etat.combattants.PERSO_pliors.etats.push({ nom: "Brûlure" });
    verifier("la fiche d'origine n'est pas touchée", FICHES[1].Etats_Alteres.length === 1);
}

// =========================================================================
console.log("\n3. UN COMBATTANT SANS CASE N'EST PAS EN (0,0)");
// =========================================================================
//  Un renfort pas encore entré, un pion effacé : « nulle part » et « au centre
//  du plateau » sont deux choses différentes, et les confondre a déjà coûté des
//  pions fantômes qui bloquaient des cases.
{
    const c = combattantDepuisFiche({ idPersonnage: "X", PV_Max: 10, PV_Actuels: 10 }, undefined);
    verifier("sans position, la case est nulle", c.q === null && c.r === null);
    const d = combattantDepuisFiche({ idPersonnage: "Y", PV_Max: 10, PV_Actuels: 10 }, { q: 0, r: 0 });
    verifier("en (0,0), elle vaut bien zéro", d.q === 0 && d.r === 0);
}

// =========================================================================
console.log("\n4. APPLIQUER DEUX FOIS DONNE LE MÊME RÉSULTAT QU'UNE FOIS");
// =========================================================================
//  LA propriété qui tue les dégâts doublés. Les étapes portent le RÉSULTAT
//  (« pvApres: 33 »), jamais l'opération (« retire 9 ») : les rejouer ne
//  retranche pas une seconde fois.
{
    const depart = neuf();
    const coup = {
        v: 1, acteur: "MONSTRE_goule",
        etapes: [
            { type: "carte", acteur: "MONSTRE_goule", carte: "COMP_griffes", cibles: ["PERSO_naomi"] },
            { type: "degats", cible: "PERSO_naomi", montant: 9, pvApres: 49, bouclierApres: 0 }
        ]
    };

    const uneFois = appliquerEntree(depart, coup);
    const deuxFois = appliquerEntree(uneFois, coup);

    verifier("le coup retire bien neuf points de vie",
             uneFois.combattants.PERSO_naomi.pv === 49, `(${uneFois.combattants.PERSO_naomi.pv})`);
    verifier("le rejouer ne retire RIEN de plus",
             deuxFois.combattants.PERSO_naomi.pv === 49, `(${deuxFois.combattants.PERSO_naomi.pv})`);

    verifier("l'état de départ n'a pas bougé",
             depart.combattants.PERSO_naomi.pv === 58, `(${depart.combattants.PERSO_naomi.pv})`);
    verifier("la version suit l'entrée", uneFois.version === 1);
}

// =========================================================================
console.log("\n5. UN TOUR ENTIER, PAS À PAS");
// =========================================================================
//  Le trajet et la carte d'une créature, dans une seule entrée : c'est ce qui
//  remplace les huit à douze écritures indépendantes d'avant.
{
    const depart = neuf();
    const tour = {
        v: 1, acteur: "MONSTRE_goule", manche: 3, graine: 991122,
        etapes: [
            { type: "pas", acteur: "MONSTRE_goule", de: { q: -2, r: 1 }, vers: { q: -1, r: 1 } },
            { type: "pas", acteur: "MONSTRE_goule", de: { q: -1, r: 1 }, vers: { q: -1, r: 0 } },
            { type: "pas", acteur: "MONSTRE_goule", de: { q: -1, r: 0 }, vers: { q: 0, r: -1 },
              fatigueApres: 84 },
            { type: "carte", acteur: "MONSTRE_goule", carte: "COMP_griffes", cibles: ["PERSO_pliors"],
              fatigueApres: 60 },
            { type: "degats", cible: "PERSO_pliors", montant: 12, bouclierApres: 0, pvApres: 36 },
            { type: "etats", cible: "PERSO_pliors",
              liste: [{ nom: "Empoisonnement", tours: 2 }, { nom: "Saignement", tours: 3 }] },
            { type: "tour", file: [{ id: "PERSO_naomi", carte: "COMP_soin", initiative: 40 }] }
        ]
    };

    const apres = appliquerEntree(depart, tour);
    const goule = apres.combattants.MONSTRE_goule;
    const pliors = apres.combattants.PERSO_pliors;

    verifier("la créature a bien traversé jusqu'à la dernière case",
             goule.q === 0 && goule.r === -1, `(${goule.q},${goule.r})`);
    verifier("son énergie a fondu du trajet puis de la carte", goule.fatigue === 60, `(${goule.fatigue})`);
    verifier("le bouclier a absorbé, puis les points de vie ont pris le reste",
             pliors.bouclier === 0 && pliors.pv === 36, `(${pliors.bouclier} / ${pliors.pv})`);
    verifier("le nouvel état altéré est posé, l'ancien conservé",
             pliors.etats.map(e => e.nom).join(",") === "Empoisonnement,Saignement");
    verifier("la file a avancé", apres.file.length === 1 && apres.file[0].id === "PERSO_naomi");
    verifier("la graine du tour suivant est rangée", apres.graine === 991122);
    verifier("et tout reste cohérent", verifierEtatCombat(apres).length === 0,
             verifierEtatCombat(apres).join(" | "));
}

// =========================================================================
console.log("\n6. UN POSTE EN RETARD RATTRAPE ET REJOINT LES AUTRES");
// =========================================================================
//  L'iPad qui dort huit tours. Il rejoue les entrées manquantes dans l'ordre et
//  arrive au MÊME état, forcément — c'est une propriété de la fonction, pas un
//  réglage.
{
    const depart = neuf();
    const entrees = [];
    let courant = depart;

    // Cinq tours de suite, appliqués « en direct » comme le ferait le cerveau.
    for (let v = 1; v <= 5; v++) {
        const entree = {
            v, acteur: "MONSTRE_goule",
            etapes: [
                { type: "pas", acteur: "MONSTRE_goule", vers: { q: -2 + v, r: 1 } },
                { type: "degats", cible: "PERSO_naomi", montant: 4, pvApres: 58 - 4 * v }
            ]
        };
        entrees.push(entree);
        courant = appliquerEntree(courant, entree);
    }

    // Le poste endormi n'a rien vu et reçoit les cinq d'un coup — et dans le
    // désordre, comme le réseau les livre parfois.
    const desordre = [entrees[3], entrees[0], entrees[4], entrees[2], entrees[1]];
    const rattrape = appliquerEntrees(depart, desordre);

    verifier("le poste en retard arrive au même état, au caractère près",
             JSON.stringify(rattrape) === JSON.stringify(courant));
    verifier("il est bien à la version 5", rattrape.version === 5);
    verifier("les points de vie concordent",
             rattrape.combattants.PERSO_naomi.pv === 38, `(${rattrape.combattants.PERSO_naomi.pv})`);
}

// =========================================================================
console.log("\n7. LES INVARIANTS ATTRAPENT CE QU'ON A VRAIMENT VÉCU");
// =========================================================================
{
    const sain = neuf();
    verifier("un état sain ne remonte rien", verifierEtatCombat(sain).length === 0);

    // Le bug des héros rayés de la file : marqués à terre alors qu'ils sont
    // debout. Une seconde de fiche à zéro point de vie, et la rencontre entière
    // se jouait sans eux.
    const faux1 = clonerEtat(sain);
    faux1.combattants.PERSO_naomi.aTerre = true;
    verifier("un vivant marqué à terre est signalé",
             verifierEtatCombat(faux1).some(s => s.includes("marqué à terre")),
             `(${verifierEtatCombat(faux1).join(" | ")})`);

    // Deux pions sur la même case : le symptôme des déplacements téléportés.
    const faux2 = clonerEtat(sain);
    faux2.combattants.PERSO_pliors.q = 0;
    faux2.combattants.PERSO_pliors.r = 0;
    verifier("deux pions sur une case sont signalés",
             verifierEtatCombat(faux2).some(s => s.includes("occupent tous deux")));

    // Un mort resté dans la file : son tour arrivait, et plus rien n'avançait.
    const faux3 = clonerEtat(sain);
    faux3.combattants.MONSTRE_goule.pv = 0;
    faux3.combattants.MONSTRE_goule.aTerre = true;
    verifier("un combattant à terre encore dans la file est signalé",
             verifierEtatCombat(faux3).some(s => s.includes("à terre et pourtant dans la file")));

    // Des points de vie au-delà du maximum : la jauge déborde et personne ne
    // comprend pourquoi.
    const faux4 = clonerEtat(sain);
    faux4.combattants.PERSO_naomi.pv = 999;
    verifier("des points de vie hors bornes sont signalés",
             verifierEtatCombat(faux4).some(s => s.includes("pour un maximum de")));

    // Un poste qui n'a pas rechargé sa page : son format ne correspond pas.
    const faux5 = clonerEtat(sain);
    faux5.format = 99;
    verifier("un format inconnu est signalé",
             verifierEtatCombat(faux5).some(s => s.includes("format")));

    // Un combattant nommé dans la file mais absent de la table.
    const faux6 = clonerEtat(sain);
    faux6.file.push({ id: "PERSO_fantome", carte: null });
    verifier("un inconnu dans la file est signalé",
             verifierEtatCombat(faux6).some(s => s.includes("qui n'existe pas")));
}

// =========================================================================
console.log("\n8. LES DÉGÂTS NE PEUVENT PAS FAIRE DÉBORDER L'ÉTAT");
// =========================================================================
//  Même si le cerveau se trompe et propose une valeur absurde, l'application
//  la ramène dans les bornes plutôt que de publier un état cassé.
{
    const depart = neuf();
    const trop = appliquerEntree(depart, {
        v: 1, etapes: [{ type: "degats", cible: "PERSO_naomi", pvApres: -50 }]
    });
    verifier("des points de vie négatifs sont ramenés à zéro",
             trop.combattants.PERSO_naomi.pv === 0);
    verifier("et le combattant est marqué à terre tout seul",
             trop.combattants.PERSO_naomi.aTerre === true);
    verifier("l'état reste cohérent malgré l'étape absurde",
             verifierEtatCombat(trop).filter(s => !s.includes("dans la file")).length === 0,
             verifierEtatCombat(trop).join(" | "));

    const soigne = appliquerEntree(depart, {
        v: 1, etapes: [{ type: "soin", cible: "PERSO_pliors", pvApres: 9999 }]
    });
    verifier("un soin ne dépasse pas le maximum",
             soigne.combattants.PERSO_pliors.pv === 42, `(${soigne.combattants.PERSO_pliors.pv})`);

    const creve = appliquerEntree(depart, {
        v: 1, etapes: [{ type: "fatigue", cible: "PERSO_pliors", fatigueApres: 9999 }]
    });
    verifier("l'énergie non plus", creve.combattants.PERSO_pliors.fatigue === 100);
}

// =========================================================================
console.log("\n9. MILLE PAS AU HASARD, SANS UN SEUL ÉTAT INCOHÉRENT");
// =========================================================================
//  Le test de propriété : on ne vérifie pas un résultat attendu, on vérifie
//  qu'aucune règle n'est violée, quoi qu'il arrive. Un échec sort avec la
//  graine exacte pour le reproduire.
{
    let etat = neuf();
    const des = creerDes(20260909);
    const ids = Object.keys(etat.combattants);
    let violations = 0, premiere = "";

    for (let v = 1; v <= 1000; v++) {
        const cible = des.parmi(ids);
        const c = etat.combattants[cible];
        const etapes = [];

        switch (des.entier(1, 4)) {
            case 1:
                etapes.push({ type: "pas", acteur: cible,
                              vers: { q: des.entier(-6, 6), r: des.entier(-6, 6) } });
                break;
            case 2:
                etapes.push({ type: "degats", cible, pvApres: c.pv - des.entier(0, 15) });
                break;
            case 3:
                etapes.push({ type: "soin", cible, pvApres: c.pv + des.entier(0, 15) });
                break;
            case 4:
                etapes.push({ type: "fatigue", cible, fatigueApres: c.fatigue - des.entier(0, 30) });
                break;
        }

        etat = appliquerEntree(etat, { v, etapes });

        // Un combattant tombé sort de la file : c'est le cerveau qui le fera,
        // et le banc l'imite pour ne pas signaler cent fois la même chose.
        etat.file = etat.file.filter(f => !etat.combattants[f.id].aTerre);

        // Deux pions sur la même case n'est pas une incohérence d'ÉTAT ici :
        // c'est le déplacement au hasard du banc, que le vrai cerveau
        // refusera. On l'écarte pour ne garder que ce qui compte.
        const soucis = verifierEtatCombat(etat).filter(s => !s.includes("occupent tous deux"));
        if (soucis.length) {
            violations++;
            if (!premiere) premiere = `pas ${v} : ${soucis[0]}`;
        }
    }

    verifier("mille pas au hasard, aucun état incohérent", violations === 0,
             premiere || `(${violations} violation(s))`);
    verifier("la version a bien avancé de un en un", etat.version === 1000);
}

// =========================================================================
console.log("\nLES MAXIMA SONT DES FORMULES, PAS DES CHAMPS");
// =========================================================================
//  Le premier vrai combat en nouveau régime a été refusé par les invariants :
//  « PERSO_250418 : 110 d'énergie pour un maximum de 100 ». Le héros n'avait
//  rien d'anormal — il était Humain, et l'atout de son peuple donne +10
//  d'énergie maximale. La fiche porte 100, le jeu calcule 110, et lire le champ
//  brut fabriquait un combattant hors de ses propres bornes avant même le
//  premier tour.
//
//  Les bornes viennent donc des formules du jeu, injectées comme les défenses.
{
    const ATOUTS = { Humain: { fatigueMax: 10 }, Gob: { esquive: 3 } };
    const reglesDuJeu = {
        atouts: (p) => ATOUTS[p.race] || {},
        fatigueMax: (p) => (parseInt(p.Fatigue_Max) || 100)
                         + (parseInt(p.Dev_Mod_Fatigue) || 0)
                         + ((ATOUTS[p.race] || {}).fatigueMax || 0),
        pvMax: (p) => (parseInt(p.PV_Max) || 0) + (parseInt(p.Dev_Mod_PV) || 0)
    };
    const humain = {
        idPersonnage: "H1", race: "Humain", idJoueur: "P_03", camp: "Allié",
        PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, Fatigue_Actuelle: 110,
        Esquive: 0, Parade: 0, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant"
    };

    const avec = construireEtatCombat({
        idPartie: "G", cerveau: "P_03", graine: 1, combattants: [humain],
        positions: { H1: { q: 0, r: 0 } },
        partie: { Phase_Combat: "Resolution", Ordre_Initiative: ["H1"],
                  File_Attente_Combat: [{ idPersonnage: "H1" }] },
        regles: reglesDuJeu
    });
    verifier("l'atout de race entre dans le maximum d'énergie",
             avec.combattants.H1.fatigueMax === 110, `(${avec.combattants.H1.fatigueMax})`);
    verifier("un Humain à 110/110 est un état PARFAITEMENT cohérent",
             verifierEtatCombat(avec).length === 0, verifierEtatCombat(avec).join(" | "));

    // Et sans les formules du jeu, on retombe sur le calcul brut : c'est ce
    // dont un banc a besoin, et ça ne doit pas changer.
    const sans = construireEtatCombat({
        idPartie: "G", cerveau: "P_03", graine: 1,
        combattants: [{ ...humain, Fatigue_Actuelle: 100 }],
        positions: { H1: { q: 0, r: 0 } },
        partie: { Phase_Combat: "Resolution", Ordre_Initiative: ["H1"],
                  File_Attente_Combat: [{ idPersonnage: "H1" }] }
    });
    verifier("sans formule injectée, le calcul brut tient toujours",
             sans.combattants.H1.fatigueMax === 100, `(${sans.combattants.H1.fatigueMax})`);

    // Le Dev_Mod continue de s'ajouter, avec ou sans formule.
    const modifie = construireEtatCombat({
        idPartie: "G", cerveau: "P_03", graine: 1,
        combattants: [{ ...humain, Dev_Mod_Fatigue: 25, Fatigue_Actuelle: 135 }],
        positions: { H1: { q: 0, r: 0 } },
        partie: { Phase_Combat: "Resolution", Ordre_Initiative: ["H1"],
                  File_Attente_Combat: [{ idPersonnage: "H1" }] },
        regles: reglesDuJeu
    });
    verifier("les retouches de fiche s'ajoutent à l'atout",
             modifie.combattants.H1.fatigueMax === 135, `(${modifie.combattants.H1.fatigueMax})`);
    verifier("et l'état reste cohérent", verifierEtatCombat(modifie).length === 0);

    // ET L'INVARIANT DOIT TOUJOURS MORDRE quand c'est vraiment faux : ce n'est
    // pas parce qu'il s'est trompé de coupable qu'il faut le désarmer.
    const faux = construireEtatCombat({
        idPartie: "G", cerveau: "P_03", graine: 1,
        combattants: [{ ...humain, Fatigue_Actuelle: 400 }],
        positions: { H1: { q: 0, r: 0 } },
        partie: { Phase_Combat: "Resolution", Ordre_Initiative: ["H1"],
                  File_Attente_Combat: [{ idPersonnage: "H1" }] },
        regles: reglesDuJeu
    });
    verifier("une énergie vraiment hors bornes est toujours refusée",
             verifierEtatCombat(faux).some(s2 => /énergie/.test(s2)),
             verifierEtatCombat(faux).join(" | "));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
