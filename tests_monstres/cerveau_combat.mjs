// LE CERVEAU, MIS À L'ÉPREUVE — ÉTAPE 3.
//
// Un seul appareil écrit, tous les autres lisent. Ce banc vérifie que cette
// phrase tient : que les intentions illégitimes sont refusées AVEC leur raison,
// qu'un tour de créature tient dans une seule entrée, que la file avance toute
// seule, et surtout qu'un état incohérent n'est JAMAIS publié.
//
// Le dépôt est en mémoire — et il sait rater ses écritures, parce qu'un
// Firestore rate les siennes. Ce qu'on veut voir : après un échec, rien n'a
// bougé, et l'intention est reprise.
import {
    estLeCerveau, cerveauPerdu, validerIntention, appliquerIntention,
    avancerFile, jouerCreature, prochainPas, creerCerveau, cloturerTour, CERVEAU_PERDU_MS,
    suivreBattement, cerveauSilencieux, regenererPvFinDeManche
} from '../cerveau_combat.js';
import { construireEtatCombat, creerDes, verifierEtatCombat, clonerEtat } from '../combat_etat.js';
import { distance } from '../mouvement_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, extra = {}) => ({
    idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100,
    Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Bouclier_Actuel: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});

// Deux héros, deux créatures. La file : le héros de Nico, une goule, le héros
// de Ben, une seconde goule.
const monde = () => construireEtatCombat({
    idPartie: "GAME_TEST", cerveau: "P_03", graine: 4242,
    combattants: [
        fiche("H1", { idJoueur: "P_03", camp: "Allié", prenom: "Naomi" }),
        fiche("H2", { idJoueur: "P_01", camp: "Allié", prenom: "Pliors" }),
        fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Goule", Personnalite: "brutal" }),
        fiche("M2", { estMonstre: true, camp: "Ennemi", nom: "Spectre", Personnalite: "prudent" })
    ],
    positions: { H1: { q: 0, r: 0 }, H2: { q: 0, r: 2 }, M1: { q: 3, r: 0 }, M2: { q: 5, r: 0 } },
    partie: {
        Phase_Combat: "Resolution", Tour_Combat: 1,
        Ordre_Initiative: ["H1", "M1", "H2", "M2"],
        File_Attente_Combat: [
            { idPersonnage: "H1", idCarte: "C_H1" }, { idPersonnage: "M1", idCarte: "C_M1" },
            { idPersonnage: "H2", idCarte: "C_H2" }, { idPersonnage: "M2", idCarte: "C_M2" }
        ]
    }
});

// La technique d'une créature, telle que le cerveau la lui donnera.
const CARTES = {
    C_M1: { idCarte: "C_M1", infos: { portee: 1, fatigue: 15 },
            attaques: [{ valeurBrute: 12 }], alterations: [] },
    C_M2: { idCarte: "C_M2", infos: { portee: 4, fatigue: 20 },
            attaques: [{ valeurBrute: 8, isRanged: true }], alterations: [] }
};
const carteDe = (id, idCarte) => CARTES[idCarte] || null;

// =========================================================================
//  UN DÉPÔT EN MÉMOIRE, QUI SAIT RATER
// =========================================================================
//  Il publie l'état, l'entrée de journal et le marquage des intentions EN UN
//  SEUL GESTE — ou pas du tout, comme un writeBatch Firestore.
function creerDepot(etatInitial, echecsDAffilee = 0) {
    const d = {
        etat: clonerEtat(etatInitial),
        journal: [],
        intentions: [],
        refus: [],
        restants: echecsDAffilee,
        ecritures: 0
    };
    return {
        interne: d,
        lireEtat: async () => clonerEtat(d.etat),
        lireIntentions: async () => d.intentions.filter(i => !i.traitee).map(i => ({ ...i })),
        publier: async (etat, entree, traitees) => {
            if (d.restants > 0) { d.restants--; throw new Error("commit refusé"); }
            // Tout ou rien : les trois écritures atterrissent ensemble.
            d.etat = clonerEtat(etat);
            d.journal.push(JSON.parse(JSON.stringify(entree)));
            (traitees || []).forEach(id => {
                const i = d.intentions.find(x => x.id === id);
                if (i) i.traitee = true;
            });
            d.ecritures++;
        },
        refuser: async (id, raison, poste) => {
            const i = d.intentions.find(x => x.id === id);
            if (i) i.traitee = true;
            d.refus.push({ id, raison, poste });
        },
        battre: async (quand) => { d.etat.battement = quand; }
    };
}

// =========================================================================
console.log("\n1. UN SEUL POSTE A LA MAIN");
// =========================================================================
{
    const etat = monde();
    verifier("le poste désigné est le cerveau", estLeCerveau(etat, "P_03") === true);
    verifier("les autres ne le sont pas", estLeCerveau(etat, "P_01") === false);
    verifier("et un poste inconnu non plus", estLeCerveau(etat, "P_99") === false);

    etat.battement = 1000;
    verifier("un cerveau qui vient de battre est vivant", cerveauPerdu(etat, 1000 + 5000) === false);
    verifier("passé trente secondes, il est perdu",
             cerveauPerdu(etat, 1000 + CERVEAU_PERDU_MS + 1) === true);

    const orphelin = clonerEtat(etat);
    orphelin.cerveau = "";
    verifier("un combat sans cerveau est déclaré perdu", cerveauPerdu(orphelin, 0) === true);
}

// =========================================================================
console.log("\n2. CE QU'UNE INTENTION DOIT PROUVER");
// =========================================================================
//  Un poste ne demande jamais un résultat, il demande une action — et le cerveau
//  refuse EN DISANT POURQUOI, pour que l'écran puisse l'afficher au lieu de
//  rester muet.
{
    const etat = monde();
    const bon = { id: "I1", poste: "P_03", acteur: "H1", type: "mouvement",
                  chemin: [{ q: 1, r: 0 }] };
    verifier("une intention légitime passe", validerIntention(etat, bon).ok === true);

    const dire = (i) => validerIntention(etat, i).raison;

    verifier("sans identité, elle est refusée",
             dire({ poste: "P_03", acteur: "H1", type: "finTour" }) === "intention sans identité");
    verifier("un type inconnu est refusé",
             dire({ id: "X", acteur: "H1", type: "danser" }).includes("type inconnu"));
    verifier("un combattant absent est refusé",
             dire({ id: "X", acteur: "FANTOME", type: "finTour" }).includes("n'est pas dans ce combat"));
    verifier("ce n'est pas ton tour",
             dire({ id: "X", poste: "P_01", acteur: "H2", type: "finTour" }) === "c'est au tour de H1");
    verifier("et tu ne commandes pas ce héros",
             dire({ id: "X", poste: "P_01", acteur: "H1", type: "finTour" })
                .includes("ne commande pas"));

    // Une créature ne reçoit pas d'ordre : elle est jouée par le cerveau.
    const tourCreature = clonerEtat(etat);
    tourCreature.file = [{ id: "M1", carte: "C_M1" }];
    verifier("une créature ne reçoit pas d'ordre",
             validerIntention(tourCreature, { id: "X", poste: "P_03", acteur: "M1", type: "finTour" })
                .raison === "une créature ne reçoit pas d'ordre");

    // Un chemin fantaisiste — page modifiée, bug d'interface — ne doit pas
    // pouvoir téléporter un pion.
    verifier("un chemin discontinu est refusé",
             dire({ id: "X", poste: "P_03", acteur: "H1", type: "mouvement",
                    chemin: [{ q: 5, r: 5 }] }) === "chemin discontinu");
    verifier("un chemin qui traverse un vivant est refusé",
             dire({ id: "X", poste: "P_03", acteur: "H1", type: "mouvement",
                    chemin: [{ q: 0, r: 1 }, { q: 0, r: 2 }] }).includes("occupe"));

    const epuise = clonerEtat(etat);
    epuise.combattants.H1.fatigue = 1;
    verifier("marcher sans énergie est refusé",
             validerIntention(epuise, bon).raison.includes("pas assez d'énergie"));
    verifier("lancer une carte trop chère aussi",
             validerIntention(epuise, { id: "X", poste: "P_03", acteur: "H1", type: "carte",
                                        idCarte: "C", coutFatigue: 40 })
                .raison.includes("il en reste 1"));
}

// =========================================================================
console.log("\n3. LA FILE AVANCE, ET LA MANCHE TOURNE");
// =========================================================================
{
    const etat = monde();
    const un = avancerFile(etat, creerDes(1));
    verifier("le combattant en tête sort de la file",
             un.etat.file.map(f => f.id).join(",") === "M1,H2,M2");
    verifier("et il est noté comme ayant joué", un.etat.ontJoue.join(",") === "H1");
    verifier("la version avance d'exactement un", un.etat.version === 1);

    // Un combattant tombé entre-temps ne repasse pas.
    const avecMort = clonerEtat(etat);
    avecMort.combattants.M1.aTerre = true;
    avecMort.combattants.M1.pv = 0;
    const sansLui = avancerFile(avecMort, creerDes(1));
    verifier("un combattant à terre sort de la file tout seul",
             sansLui.etat.file.map(f => f.id).join(",") === "H2,M2");

    // La file se vide : nouvelle manche.
    let courant = etat;
    for (let i = 0; i < 4; i++) courant = avancerFile(courant, creerDes(i + 1)).etat;
    verifier("la file vidée ouvre une nouvelle manche", courant.manche === 2);
    verifier("et repasse en préparation", courant.phase === "Preparation");
    verifier("l'ardoise des combattants ayant joué est effacée", courant.ontJoue.length === 0);
}

// =========================================================================
console.log("\n4. LE TOUR D'UNE CRÉATURE TIENT DANS UNE SEULE ENTRÉE");
// =========================================================================
//  Là où l'ancienne architecture faisait huit à douze écritures indépendantes,
//  chacune pouvant échouer ou s'entrelacer avec autre chose.
{
    const etat = monde();
    etat.file = [{ id: "M1", carte: "C_M1" }];

    const pas = jouerCreature(etat, "M1", CARTES.C_M1, null);
    verifier("le tour entier tient dans une entrée", pas.entree.v === 1);

    const types = pas.entree.etapes.map(e => e.type);
    verifier("elle marche…", types.includes("pas"));
    verifier("…puis elle frappe", types.includes("carte") && types.includes("degats"));
    verifier("dans cet ordre", types.indexOf("pas") < types.indexOf("carte"));

    verifier("la créature a bougé", pas.etat.combattants.M1.q !== 3);
    verifier("et le héros a encaissé", pas.etat.combattants.H1.pv < 60,
             `(${pas.etat.combattants.H1.pv})`);
    verifier("l'état reste cohérent", verifierEtatCombat(pas.etat).length === 0,
             verifierEtatCombat(pas.etat).join(" | "));

    // Trop loin pour frapper : elle avance, et DIT pourquoi elle ne lance rien.
    // Cette ligne-là vaut de l'or dans la trace : « tour de 20 millisecondes
    // sans rien faire » restait inexplicable.
    const loin = clonerEtat(etat);
    loin.combattants.M1.q = 14;
    const marche = jouerCreature(loin, "M1", CARTES.C_M1, null);
    verifier("hors d'atteinte, elle avance sans frapper",
             !marche.entree.etapes.some(e => e.type === "degats"));
    verifier("et le journal dit pourquoi",
             marche.entree.etapes.some(e => e.type === "renonce" && e.raison));
}

// =========================================================================
console.log("\n5. LE CERVEAU DÉCIDE TOUT SEUL QUOI FAIRE");
// =========================================================================
{
    const etat = monde();

    // Tête de file = un héros, aucune intention : on attend, et c'est très bien.
    verifier("quand un joueur réfléchit, le cerveau attend",
             prochainPas(etat, [], { carteDe }) === null);

    // Tête de file = une créature : elle joue toute seule.
    const tourM1 = clonerEtat(etat);
    tourM1.file = [{ id: "M1", carte: "C_M1" }, { id: "H2", carte: "C_H2" }];
    const auto = prochainPas(tourM1, [], { carteDe });
    verifier("une créature en tête joue sans qu'on lui demande",
             !!auto && auto.creature === "M1");

    // Une intention légitime passe avant.
    const avecIntention = prochainPas(etat, [
        { id: "I1", poste: "P_03", acteur: "H1", type: "mouvement", chemin: [{ q: 1, r: 0 }] }
    ], { carteDe });
    verifier("une intention de joueur est servie", avecIntention.intention === "I1");
    verifier("et elle bouge vraiment le pion",
             avecIntention.etat.combattants.H1.q === 1);

    // Une intention illégitime est refusée AVEC sa raison — et refermée, sinon
    // elle reviendrait à chaque tour de boucle et bloquerait la file.
    const refusee = prochainPas(etat, [
        { id: "I2", poste: "P_01", acteur: "H1", type: "finTour" }
    ], { carteDe });
    verifier("une intention illégitime est refusée", refusee.refus === true);
    verifier("avec la raison, et le poste à prévenir",
             refusee.raison.includes("ne commande pas") && refusee.poste === "P_01");

    // Le combattant en tête est tombé avant de jouer : son tour n'a plus lieu
    // d'être. Sans ça, la file restait bloquée sur un cadavre.
    const cadavre = clonerEtat(etat);
    cadavre.combattants.H1.aTerre = true;
    cadavre.combattants.H1.pv = 0;
    const saute = prochainPas(cadavre, [], { carteDe });
    verifier("un combattant tombé avant son tour est passé", saute && saute.passe === "H1");

    // Hors résolution, le cerveau ne fait rien.
    const prepa = clonerEtat(etat);
    prepa.phase = "Preparation";
    verifier("en préparation, il n'y a rien à jouer",
             prochainPas(prepa, [], { carteDe }) === null);
}

// =========================================================================
console.log("\n6. LA BOUCLE COMPLÈTE, AVEC SON DÉPÔT");
// =========================================================================
{
    const depot = creerDepot(monde());
    const cerveau = creerCerveau(depot, { poste: "P_03", carteDe, maintenant: () => 1000 });

    // Nico joue : il bouge, il frappe, il passe la main.
    depot.interne.intentions.push(
        { id: "I1", poste: "P_03", acteur: "H1", type: "mouvement", chemin: [{ q: 1, r: 0 }] },
        { id: "I2", poste: "P_03", acteur: "H1", type: "carte", idCarte: "C_H1",
          coutFatigue: 25, attaques: [{ valeurBrute: 20, cibles: ["M1"] }], alterations: [] },
        { id: "I3", poste: "P_03", acteur: "H1", type: "finTour" }
    );

    const faits = await cerveau.tournerJusquAuCalme();
    // TROIS PAS, ET NON QUATRE : le déplacement, la carte (qui CLÔT le tour),
    // puis la créature. Le « fin de tour » que Nico envoie après son attaque
    // arrive trop tard — la carte l'a déjà terminé — et il est refusé.
    //
    // C'est la règle du jeu, pas un accident : validerCarteCombat a toujours
    // enchaîné sur finDeTourCombat. Ce qui compte, c'est que le refus ne
    // BLOQUE pas la suite : la créature joue quand même.
    verifier("le cerveau enchaîne les pas tout seul", faits.length === 3,
             `(${faits.length} pas : ${faits.join(", ")})`);
    verifier("les numéros se suivent sans trou",
             faits.every((v, i) => v === i + 1), `(${faits.join(",")})`);
    verifier("le journal en a autant d'entrées", depot.interne.journal.length === faits.length);

    verifier("le héros a bougé", depot.interne.etat.combattants.H1.q === 1);
    verifier("la goule a encaissé", depot.interne.etat.combattants.M1.pv < 60,
             `(${depot.interne.etat.combattants.M1.pv})`);
    verifier("les trois intentions sont refermées",
             depot.interne.intentions.every(i => i.traitee));

    // Le « fin de tour » tardif a été refusé, et refermé quand même : sans ça
    // il reviendrait à chaque tour de boucle et bloquerait la file derrière lui.
    const finTardif = depot.interne.intentions.find(i => i.id === "I3");
    verifier("le fin de tour tardif est refusé, pas rejoué",
             finTardif.traitee === true, JSON.stringify(finTardif.refus || ""));

    // Il s'est arrêté au bon endroit : le tour de Pliors, joué par l'autre poste.
    verifier("il s'arrête devant le tour d'un autre joueur",
             depot.interne.etat.file[0].id === "H2", `(${depot.interne.etat.file[0].id})`);
    verifier("et le battement de cœur est posé", depot.interne.etat.battement === 1000);
}

// =========================================================================
console.log("\n7. UN POSTE QUI N'EST PAS LE CERVEAU N'ÉCRIT RIEN");
// =========================================================================
//  La règle d'or, vérifiée. C'est elle qui rend impossibles tous les bugs de la
//  semaine dernière.
{
    const depot = creerDepot(monde());
    const intrus = creerCerveau(depot, { poste: "P_01", carteDe });
    depot.interne.intentions.push(
        { id: "I1", poste: "P_01", acteur: "H1", type: "finTour" });

    const r = await intrus.unTour();
    verifier("un poste qui n'a pas la main s'abstient",
             r.attente === "un autre poste tient la main");
    verifier("et rien n'a été écrit", depot.interne.ecritures === 0);
    verifier("ni l'intention refermée", depot.interne.intentions[0].traitee !== true);
}

// =========================================================================
console.log("\n8. UNE ÉCRITURE RATÉE NE PERD RIEN");
// =========================================================================
//  Le batch passe en entier ou pas du tout. Après un échec, l'état n'a pas
//  bougé et l'intention est toujours en attente : elle sera reprise.
{
    const depot = creerDepot(monde(), 1);       // la première écriture échoue
    const cerveau = creerCerveau(depot, { poste: "P_03", carteDe });
    depot.interne.intentions.push(
        { id: "I1", poste: "P_03", acteur: "H1", type: "mouvement", chemin: [{ q: 1, r: 0 }] });

    let leve = false;
    try { await cerveau.unTour(); } catch (e) { leve = true; }
    verifier("l'échec du batch remonte", leve === true);
    verifier("l'état n'a pas bougé d'un pouce",
             depot.interne.etat.version === 0 && depot.interne.etat.combattants.H1.q === 0);
    verifier("le journal est resté vide", depot.interne.journal.length === 0);
    verifier("et l'intention attend toujours", depot.interne.intentions[0].traitee !== true);

    // Deuxième essai : ça passe, et rien n'a été joué deux fois.
    await cerveau.unTour();
    verifier("la reprise applique l'intention une seule fois",
             depot.interne.etat.version === 1 && depot.interne.etat.combattants.H1.q === 1);
    verifier("le journal n'a qu'une entrée", depot.interne.journal.length === 1);
}

// =========================================================================
console.log("\n9. UN COMBAT ENTIER, DU DÉBUT À LA FIN");
// =========================================================================
//  Les créatures jouent seules, les joueurs passent leur tour, et on va jusqu'à
//  ce que tout le monde soit à terre d'un côté. C'est le test qui remplace nos
//  simulations à trois navigateurs — et il tient en une seconde.
{
    const depot = creerDepot(monde());
    const cerveau = creerCerveau(depot, { poste: "P_03", carteDe, maintenant: () => 1 });

    let manches = 0;
    for (let m = 0; m < 30; m++) {
        const etat = depot.interne.etat;
        if (etat.phase === "Preparation") {
            // Nouvelle manche : on repose la file, comme le fera la préparation.
            const debout = ["H1", "M1", "H2", "M2"].filter(id => !etat.combattants[id].aTerre);
            if (debout.filter(id => etat.combattants[id].camp === "Allié").length === 0) break;
            if (debout.filter(id => etat.combattants[id].camp === "Ennemi").length === 0) break;
            depot.interne.etat.file = debout.map(id => ({ id, carte: "C_" + id }));
            depot.interne.etat.phase = "Resolution";
            manches++;
        }
        // Les joueurs passent leur tour : on veut voir les créatures jouer.
        const tete = depot.interne.etat.file[0];
        if (tete && !depot.interne.etat.combattants[tete.id].estMonstre) {
            depot.interne.intentions.push({ id: `F${m}`, poste: depot.interne.etat.combattants[tete.id].joueur,
                                            acteur: tete.id, type: "finTour" });
        }
        await cerveau.tournerJusquAuCalme();
    }

    verifier("le combat a duré plusieurs manches", manches >= 2, `(${manches} manches)`);
    verifier("le journal raconte tout, sans trou",
             depot.interne.journal.every((e, i) => e.v === i + 1),
             `(${depot.interne.journal.length} entrées)`);
    verifier("les héros ont pris des coups",
             depot.interne.etat.combattants.H1.pv < 60 || depot.interne.etat.combattants.H2.pv < 60);
    verifier("et l'état final est cohérent",
             verifierEtatCombat(depot.interne.etat).length === 0,
             verifierEtatCombat(depot.interne.etat).join(" | "));
}

// =========================================================================
console.log("\n10. LE MÊME COMBAT, DEUX FOIS, AU CARACTÈRE PRÈS");
// =========================================================================
//  Ce qui transformera chaque partie de Nico en test de non-régression : on
//  garde l'état de départ et la liste des intentions, on rejoue, on compare.
{
    const derouler = async () => {
        const depot = creerDepot(monde());
        const cerveau = creerCerveau(depot, { poste: "P_03", carteDe, maintenant: () => 1 });
        depot.interne.intentions.push(
            { id: "I1", poste: "P_03", acteur: "H1", type: "mouvement", chemin: [{ q: 1, r: 0 }] },
            { id: "I2", poste: "P_03", acteur: "H1", type: "carte", idCarte: "C_H1",
              coutFatigue: 25, attaques: [{ valeurBrute: 14, cibles: ["M1"] }], alterations: [] },
            { id: "I3", poste: "P_03", acteur: "H1", type: "finTour" });
        await cerveau.tournerJusquAuCalme();
        return depot.interne;
    };

    const a = await derouler(), b = await derouler();
    verifier("deux exécutions donnent le même état final",
             JSON.stringify(a.etat) === JSON.stringify(b.etat));
    verifier("et exactement le même journal",
             JSON.stringify(a.journal) === JSON.stringify(b.journal));
}

// =========================================================================
console.log("\n11. UN ÉTAT INCOHÉRENT N'EST JAMAIS PUBLIÉ");
// =========================================================================
//  Le dernier garde-fou : plutôt refuser d'écrire que diffuser une incohérence
//  à trois appareils. Aucun de nos bugs n'aurait survécu à ce contrôle.
{
    const depot = creerDepot(monde());
    const cerveau = creerCerveau(depot, { poste: "P_03", carteDe });

    // On sabote l'état : un héros à terre, mais toujours en tête de file.
    depot.interne.etat.combattants.M1.aTerre = true;
    depot.interne.etat.combattants.M1.pv = 0;
    // ...et on le laisse dans la file, ce que l'invariant interdit.
    depot.interne.intentions.push(
        { id: "I1", poste: "P_03", acteur: "H1", type: "mouvement", chemin: [{ q: 1, r: 0 }] });

    const r = await cerveau.unTour();
    verifier("le cerveau refuse de publier un état incohérent", !!r.erreur,
             r.erreur ? r.erreur.join(" | ") : "(publié !)");
    verifier("et rien n'a été écrit", depot.interne.ecritures === 0);
    verifier("le journal est resté vide", depot.interne.journal.length === 0);
}

// =========================================================================
console.log("\n12. LES REFUS REMONTENT AU BON POSTE");
// =========================================================================
{
    const depot = creerDepot(monde());
    const cerveau = creerCerveau(depot, { poste: "P_03", carteDe });
    depot.interne.intentions.push(
        { id: "I1", poste: "P_01", acteur: "H1", type: "finTour" });

    await cerveau.unTour();
    verifier("le refus est enregistré", depot.interne.refus.length === 1);
    verifier("avec sa raison", depot.interne.refus[0].raison.includes("ne commande pas"));
    verifier("et le poste à prévenir", depot.interne.refus[0].poste === "P_01");
    verifier("l'intention est refermée, elle ne reviendra pas boucler",
             depot.interne.intentions[0].traitee === true);

    // Et la file n'a pas bougé : un refus ne fait pas avancer le combat.
    verifier("la file n'a pas avancé", depot.interne.etat.file[0].id === "H1");
}

// =========================================================================
console.log("\nUNE CARTE TERMINE LE TOUR");
// =========================================================================
//  La règle du jeu depuis toujours : validerCarteCombat enchaîne sur
//  finDeTourCombat. Le cerveau ne le faisait pas, et ça se voyait de deux
//  façons à la table — le tour ne se finissait pas après l'attaque, et on
//  pouvait lancer la même carte plusieurs fois de suite.
//
//  La clôture règle les deux d'un coup : le lanceur quitte la tête de file,
//  donc une seconde carte est refusée d'elle-même. Il n'y a pas de compteur à
//  tenir, juste une règle à dire.
{
    const etat = monde();
    const intention = {
        id: "INT_C", type: "carte", acteur: "H1", poste: "P_03", idCarte: "C_H1",
        attaques: [{ valeurBrute: 10, cibles: ["M1"] }], alterations: [], coutFatigue: 12
    };

    const pas = appliquerIntention(etat, intention, null);
    verifier("la carte se résout", !!pas);
    const types = pas.entree.etapes.map(e => e.type);
    verifier("et le tour se clôt dans la même entrée", types.includes("tour"),
             types.join(","));
    verifier("le lanceur n'est plus en tête de file",
             (pas.etat.file[0] || {}).id !== "H1", (pas.etat.file[0] || {}).id);
    verifier("il est noté comme ayant joué", (pas.etat.ontJoue || []).includes("H1"));

    // ET LA SECONDE CARTE EST REFUSÉE D'ELLE-MÊME : c'est ce qui rend le
    // doublon impossible sans rien compter.
    const encore = validerIntention(pas.etat, { ...intention, id: "INT_C2" });
    verifier("une seconde carte est refusée", encore.ok === false);
    verifier("et la raison nomme celui dont c'est le tour",
             /c'est au tour de/.test(encore.raison || ""), encore.raison);

    // Le cerveau, lui, ne publie donc qu'un seul pas pour les deux demandes.
    const deux = prochainPas(etat, [intention, { ...intention, id: "INT_C2" }],
                             { carteDe });
    verifier("le cerveau ne publie qu'un pas pour deux demandes",
             deux && deux.intention === "INT_C", deux && deux.intention);

    // Une carte lancée par une créature clôt aussi son tour — c'était déjà le
    // cas, et ça ne doit pas changer.
    const enJeu = clonerEtat(etat);
    cloturerTour(enJeu);
    const creature = jouerCreature(enJeu, "M1", CARTES.C_M1, null);
    verifier("le tour d'une créature se clôt toujours",
             creature.entree.etapes.some(e => e.type === "tour"));
}

console.log("\nUN TOUR QUI NE FRAPPE RIEN COMPTE QUAND MÊME");
// =========================================================================
//  DEUX TROUS TROUVÉS EN VRAI COMBAT, tous les deux dans la même couture : ce
//  qui se passe quand un tour se termine SANS attaque.
//
//  1. LE REPOS LONG N'EXISTAIT NULLE PART DANS LE CERVEAU. Un joueur qui
//     choisissait « souffler » envoyait une fin de tour toute nue : son tour se
//     fermait en une étape et il ne récupérait pas un point d'énergie. Le calcul
//     vivait dans l'ancien finDeTourCombat, un chemin que le nouveau régime ne
//     traverse plus. Trois manches plus tard, plus personne n'a de quoi lancer
//     quoi que ce soit, et le combat s'éteint tout seul.
//
//  2. UNE CARTE SANS CIBLE NE COÛTAIT RIEN. Un lanceur paralysé, une Illusion
//     seule, un Bond seul : ces cartes sortent par validerCarteCombat, qui
//     déduisait l'énergie EN LOCAL puis envoyait une fin de tour nue. Le cerveau
//     fermait donc le tour sans savoir qu'une carte avait été jouée, son état
//     gardait l'énergie intacte, et la projection suivante effaçait la déduction
//     locale. La carte ne coûtait rien et ne faisait rien.
{
    // --- LE REPOS LONG -----------------------------------------------------
    const etat = monde();
    etat.file[0] = { id: "H1", carte: "REPOS_LONG", initiative: 0 };
    etat.combattants.H1.fatigue = 30;

    const pas = avancerFile(etat, creerDes(etat.graine));
    verifier("le tour se ferme", !!pas && pas.entree.etapes.some(e => e.type === "tour"));
    const repos = pas.entree.etapes.find(e => e.type === "fatigue" && e.repos);
    verifier("et le repos long rend de l'énergie", !!repos, repos ? `→ ${repos.fatigueApres}` : "aucune");
    // 35% d'une jauge de 100, ajoutés à 30 : la règle du jeu, mot pour mot.
    verifier("exactement le rendement du jeu (35% pour un héros)",
             repos && repos.fatigueApres === 65, repos && String(repos.fatigueApres));
    verifier("l'étape porte le RÉSULTAT, pas le gain",
             repos && repos.fatigueApres !== undefined && repos.montant === undefined);
    verifier("et l'état d'après le porte aussi", pas.etat.combattants.H1.fatigue === 65,
             String(pas.etat.combattants.H1.fatigue));

    // Rejoué, il donne le même chiffre : c'est ce qui rend le rejeu sûr.
    const bis = avancerFile(etat, creerDes(etat.graine));
    verifier("rejoué, il donne le même chiffre",
             bis.entree.etapes.find(e => e.repos).fatigueApres === 65);

    // Une créature garde SON rendement, celui du bestiaire.
    const creature = monde();
    creature.file[0] = { id: "H1", carte: "REPOS_LONG", initiative: 0 };
    creature.combattants.H1.stats.Repos_Long = 10;
    creature.combattants.H1.fatigue = 30;
    const pasC = avancerFile(creature, creerDes(creature.graine));
    verifier("un rendement propre l'emporte sur les 35% par défaut",
             pasC.entree.etapes.find(e => e.repos).fatigueApres === 40,
             String(pasC.entree.etapes.find(e => e.repos).fatigueApres));

    // L'atout de l'Humain s'ajoute par-dessus.
    const humain = monde();
    humain.file[0] = { id: "H1", carte: "REPOS_LONG", initiative: 0 };
    humain.combattants.H1.atouts.bonusReposLong = 10;
    humain.combattants.H1.fatigue = 30;
    const pasH = avancerFile(humain, creerDes(humain.graine));
    verifier("et l'atout de l'Humain s'ajoute par-dessus",
             pasH.entree.etapes.find(e => e.repos).fatigueApres === 75,
             String(pasH.entree.etapes.find(e => e.repos).fatigueApres));

    // Une jauge presque pleine ne dépasse jamais son maximum.
    const plein = monde();
    plein.file[0] = { id: "H1", carte: "REPOS_LONG", initiative: 0 };
    plein.combattants.H1.fatigue = 95;
    const pasP = avancerFile(plein, creerDes(plein.graine));
    verifier("une jauge presque pleine ne déborde pas",
             pasP.etat.combattants.H1.fatigue === 100,
             String(pasP.etat.combattants.H1.fatigue));

    // Un tour ordinaire ne rend rien, évidemment.
    const ordinaire = avancerFile(monde(), creerDes(4242));
    verifier("un tour ordinaire ne rend aucune énergie",
             !ordinaire.entree.etapes.some(e => e.repos));

    // --- LES ÉTATS ALTÉRÉS VIEILLISSENT -----------------------------------
    //  Le décompte vivait dans l'ancien finDeTourCombat, que le nouveau régime
    //  ne traverse plus : un Étourdi posé au premier tour durait TOUT le combat.
    const etats = monde();
    etats.file = [{ id: "H1", carte: "C_H1", initiative: 0 }];   // dernier de la manche
    etats.combattants.H1.etats = [{ nom: "Étourdi", duree: 2, icone: "ico_etourdi" },
                                  { nom: "Brûlure", duree: 1 }];
    etats.combattants.M1.etats = [{ nom: "Gel", duree: 3 }];

    const finManche = avancerFile(etats, creerDes(etats.graine));
    const vieillis = finManche.entree.etapes.filter(e => e.type === "etats" && e.vieillissement);
    verifier("les états vieillissent à la fin de la manche", vieillis.length === 2,
             `(${vieillis.length} combattant(s))`);

    const apresH1 = finManche.etat.combattants.H1.etats;
    verifier("un état de 2 tours en garde 1", apresH1.some(e => e.nom === "Étourdi" && e.duree === 1),
             JSON.stringify(apresH1.map(e => `${e.nom}:${e.duree}`)));
    verifier("un état d'un seul tour tombe", !apresH1.some(e => e.nom === "Brûlure"));
    verifier("et il garde son icône en chemin",
             apresH1.some(e => e.nom === "Étourdi" && e.icone === "ico_etourdi"));
    verifier("les créatures vieillissent aussi",
             finManche.etat.combattants.M1.etats[0].duree === 2,
             String(finManche.etat.combattants.M1.etats[0].duree));

    // Un tour ORDINAIRE, lui, ne touche à rien : le décompte est par MANCHE.
    const milieu = monde();
    milieu.combattants.H1.etats = [{ nom: "Étourdi", duree: 2 }];
    const pasMilieu = avancerFile(milieu, creerDes(milieu.graine));
    verifier("un tour ordinaire ne vieillit aucun état",
             !pasMilieu.entree.etapes.some(e => e.vieillissement)
             && pasMilieu.etat.combattants.H1.etats[0].duree === 2);

    // --- LES TICS DE FIN DE MANCHE -----------------------------------------
    //  Ils vivaient dans l'ancien finDeTourCombat : un empoisonnement ne mordait
    //  jamais, une immobilisation ne coûtait rien, un étalement ne portait
    //  jamais son second coup.
    const tics = monde();
    tics.file = [{ id: "H1", carte: "C_H1", initiative: 0 }];   // dernier de la manche
    tics.combattants.H1.fatigue = 80;
    tics.combattants.H1.stats.Regeneration = 0;                 // on isole les tics
    tics.combattants.H1.etats = [{ nom: "Immobilisation", duree: 2 }];
    tics.combattants.H2.fatigue = 50;
    tics.combattants.H2.stats.Regeneration = 0;
    tics.combattants.H2.pv = 40;
    tics.combattants.H2.etats = [{ nom: "Empoisonnement", duree: 2 }];
    tics.combattants.M1.bouclier = 10;
    tics.combattants.M1.etats = [{ nom: "Étalement", duree: 1, degatsDifferes: 7 }];
    tics.combattants.M2.pv = 30;
    tics.combattants.M2.bouclier = 0;
    tics.combattants.M2.etats = [{ nom: "Étalement", duree: 1, degatsDifferes: 9 }];

    const finTics = avancerFile(tics, creerDes(tics.graine));
    const apres = finTics.etat.combattants;

    verifier("l'immobilisation coûte 20 d'énergie", apres.H1.fatigue === 100,
             `(80 → ${apres.H1.fatigue})`);
    verifier("le poison prend 15 d'énergie", apres.H2.fatigue === 35, `(50 → ${apres.H2.fatigue})`);
    // 8% de 60 PV max = 4,8, arrondi au supérieur : 5.
    verifier("et 8% des points de vie maximum", apres.H2.pv === 35, `(40 → ${apres.H2.pv})`);
    verifier("l'étalement tape le bouclier en priorité",
             apres.M1.bouclier === 3 && apres.M1.pv === 60,
             `(bouclier ${apres.M1.bouclier}, pv ${apres.M1.pv})`);
    verifier("sans bouclier, il tape la vie", apres.M2.pv === 21, `(30 → ${apres.M2.pv})`);

    // ET CHAQUE TIC NE TOMBE QU'UNE FOIS. L'empoisonnement et l'étalement
    // portent `tickFait` ; l'immobilisation, elle, mord à chaque manche.
    const suite = clonerEtat(finTics.etat);
    suite.file = [{ id: "H1", carte: "C_H1", initiative: 0 }];
    suite.phase = "Resolution";
    const finTics2 = avancerFile(suite, creerDes(suite.graine));
    const apres2 = finTics2.etat.combattants;
    verifier("le poison ne mord pas deux fois", apres2.H2.pv === 35, `(${apres2.H2.pv})`);
    verifier("mais l'immobilisation, elle, coûte à chaque manche",
             finTics2.entree.etapes.some(e => e.tic === "Immobilisation")
             || apres2.H1.etats.length === 0,
             `(états restants : ${apres2.H1.etats.map(e => e.nom).join(",") || "aucun"})`);

    // Un tic qui achève sa cible la couche : l'état d'après doit le dire.
    const mortel = monde();
    mortel.file = [{ id: "H1", carte: "C_H1", initiative: 0 }];
    mortel.combattants.M2.pv = 3;
    mortel.combattants.M2.bouclier = 0;
    mortel.combattants.M2.etats = [{ nom: "Étalement", duree: 1, degatsDifferes: 9 }];
    const fin3 = avancerFile(mortel, creerDes(mortel.graine));
    verifier("un tic qui achève sa cible la couche",
             fin3.etat.combattants.M2.pv === 0 && fin3.etat.combattants.M2.aTerre === true);

    // --- UNE CARTE SANS CIBLE ---------------------------------------------
    const nue = monde();
    nue.combattants.H1.fatigue = 60;
    const pasNu = appliquerIntention(nue, {
        id: "INT_NU", type: "carte", acteur: "H1", poste: "P_03", idCarte: "C_BOND",
        attaques: [], alterations: [], coutFatigue: 25
    }, null);
    verifier("une carte sans attaque est bien jouée", !!pasNu);
    verifier("son énergie est payée PAR LE CERVEAU",
             pasNu && pasNu.etat.combattants.H1.fatigue === 35,
             pasNu && String(pasNu.etat.combattants.H1.fatigue));
    verifier("et elle ferme le tour comme les autres",
             pasNu && pasNu.entree.etapes.some(e => e.type === "tour"));
    verifier("le lanceur n'est plus en tête",
             pasNu && (pasNu.etat.file[0] || {}).id !== "H1");

    // Et une carte trop chère est refusée, même sans cible.
    const trop = validerIntention(nue, {
        id: "INT_TROP", type: "carte", acteur: "H1", poste: "P_03", idCarte: "C_BOND",
        attaques: [], alterations: [], coutFatigue: 120
    });
    verifier("une carte sans cible mais trop chère est refusée", trop.ok === false, trop.raison);
}

console.log("\nLE SILENCE DU CERVEAU SE MESURE SUR SA PROPRE MONTRE");
// =========================================================================
//  Un seul navigateur écrit le combat. S'il ferme son onglet, part en veille ou
//  perd le réseau, la table entière s'arrête — et rien ne le disait.
//
//  LE PIÈGE ÉTAIT DE REGARDER L'HEURE. Le battement est écrit par l'horloge du
//  poste qui tient le cerveau, et relu par celle d'un AUTRE appareil : deux
//  montres décalées de trente secondes, et un cerveau en pleine forme paraît
//  mort. Personne ne règle sa tablette à la seconde près.
//
//  On ne regarde donc pas l'heure du battement : on regarde s'il CHANGE.
{
    const t = (ms) => ms;   // notre montre, et elle seule

    // Premier battement vu : on note l'heure — la nôtre.
    let suivi = suivreBattement(null, { battement: 1000 }, t(50000));
    verifier("le premier battement est daté sur notre montre", suivi.vuA === 50000,
             String(suivi.vuA));
    verifier("et on n'accuse personne tout de suite", cerveauSilencieux(suivi, t(50000)) === false);

    // Le même battement, vu et revu : la date du PREMIER ne bouge pas — c'est
    // elle qui mesure le silence.
    suivi = suivreBattement(suivi, { battement: 1000 }, t(60000));
    verifier("un battement inchangé garde sa date", suivi.vuA === 50000, String(suivi.vuA));
    verifier("vingt secondes de silence ne suffisent pas",
             cerveauSilencieux(suivi, t(70000)) === false);
    verifier("trente et une, oui", cerveauSilencieux(suivi, t(81000)) === true);

    // Le cerveau reparle : le compteur repart de zéro.
    suivi = suivreBattement(suivi, { battement: 2000 }, t(82000));
    verifier("un battement qui change remet le compteur à zéro", suivi.vuA === 82000);
    verifier("et le cerveau n'est plus silencieux", cerveauSilencieux(suivi, t(90000)) === false);

    // ET L'HORLOGE DE L'AUTRE APPAREIL N'ENTRE JAMAIS EN JEU. Un battement
    // délirant — une montre en avance d'une heure — ne change rien : seul
    // compte le fait qu'il BOUGE.
    let decale = suivreBattement(null, { battement: 9999999999 }, t(100000));
    verifier("une horloge délirante ne déclenche rien",
             cerveauSilencieux(decale, t(110000)) === false);
    decale = suivreBattement(decale, { battement: 9999999999 }, t(140000));
    verifier("seul le silence compte, pas l'heure écrite",
             cerveauSilencieux(decale, t(140000)) === true);

    // Sans rien avoir vu, on n'accuse pas.
    verifier("sans aucun battement vu, aucun verdict", cerveauSilencieux(null, t(999999)) === false);
}

// =========================================================================
console.log("\nL'ATOUT DE L'OPHIOR : DES PV REPRIS À CHAQUE FIN DE MANCHE");
// =========================================================================
//  Même geste que la fatigue de tout le monde (regenererFinDeManche), mais sur
//  l'autre jauge, et seulement pour qui porte cet atout.
{
    // En isolation d'abord : la fonction pure, seule.
    let etat = monde();
    etat.combattants.H1.pv = 40;
    etat.combattants.H1.atouts = { ...(etat.combattants.H1.atouts || {}), regenPv: 3 };
    etat.combattants.H2.pv = 45;   // pas d'atout : ne doit pas bouger

    const etapes = regenererPvFinDeManche(etat);
    verifier("l'Ophior reprend ses 3 PV", etat.combattants.H1.pv === 43,
             `(${etat.combattants.H1.pv})`);
    verifier("un héros sans cet atout ne gagne rien", etat.combattants.H2.pv === 45);
    const etapeH1 = etapes.find(e => e.cible === "H1");
    verifier("l'étape publiée est un SOIN, celui que chaque écran sait déjà jouer",
             !!etapeH1 && etapeH1.type === "soin" && etapeH1.montant === 3 && etapeH1.pvApres === 43,
             JSON.stringify(etapeH1));
    verifier("un héros sans gain ne publie aucune étape", !etapes.some(e => e.cible === "H2"));

    // Le plafond tient : personne ne dépasse son maximum.
    let plein = monde();
    plein.combattants.H1.pv = plein.combattants.H1.pvMax - 1;
    plein.combattants.H1.atouts = { ...(plein.combattants.H1.atouts || {}), regenPv: 3 };
    regenererPvFinDeManche(plein);
    verifier("le soin de race ne dépasse jamais le maximum",
             plein.combattants.H1.pv === plein.combattants.H1.pvMax,
             `(${plein.combattants.H1.pv}/${plein.combattants.H1.pvMax})`);

    // Un combattant à terre ne se relève pas tout seul.
    let terre = monde();
    terre.combattants.H1.pv = 0;
    terre.combattants.H1.aTerre = true;
    terre.combattants.H1.atouts = { ...(terre.combattants.H1.atouts || {}), regenPv: 3 };
    regenererPvFinDeManche(terre);
    verifier("un combattant à terre ne profite pas du soin de race",
             terre.combattants.H1.pv === 0);

    // ET LE VRAI CHEMIN : à travers cloturerTour, à la fermeture de la manche.
    let vrai = monde();
    vrai.combattants.H1.pv = 50;
    vrai.combattants.H1.atouts = { ...(vrai.combattants.H1.atouts || {}), regenPv: 3 };
    vrai.file = [{ id: "H1", carte: null, initiative: 50 }];   // dernier de la manche
    const r = cloturerTour(vrai);
    verifier("cloturerTour ferme bien la manche", vrai.manche === 2, `(manche ${vrai.manche})`);
    verifier("et l'Ophior a repris ses PV au passage", vrai.combattants.H1.pv === 53,
             `(${vrai.combattants.H1.pv})`);
    verifier("l'étape de soin est bien dans le lot publié",
             r.etapes.some(e => e.type === "soin" && e.cible === "H1" && e.regeneration === true),
             JSON.stringify(r.etapes.map(e => e.type)));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
