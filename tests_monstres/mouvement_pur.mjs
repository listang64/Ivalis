// LE MOUVEMENT PUR, MIS À L'ÉPREUVE — ÉTAPE 2b.
//
// C'est sur le déplacement que le combat se jouait le plus mal : pions
// téléportés, trajets refaits à pied une fois arrivés, traversées de plateau
// sans raison. Toujours le même motif — la position écrite en base par le poste
// qui calculait, pendant que les autres écrans en étaient au tour d'avant.
//
// Ici un pas est une étape, et rien d'autre n'existe. Ce banc vérifie les
// règles qui décident de ces pas : le chemin, son prix, et les coups qu'on
// prend en s'enfuyant.
import {
    distance, voisinsDe, trouverChemin, coutDuPas, planifierTrajet,
    ennemisAuContact, resoudreOpportunite, resoudreMouvement, DEGATS_OPPORTUNITE
} from '../mouvement_pur.js';
import { construireEtatCombat, creerDes, verifierEtatCombat, clonerEtat } from '../combat_etat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, extra = {}) => ({
    idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100,
    Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Bouclier_Actuel: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});

// Le héros au centre, un ennemi juste à sa droite, un autre plus loin.
const neuf = (regles) => construireEtatCombat({
    idPartie: "P1", cerveau: "P_03", graine: 999,
    combattants: [
        fiche("H1", { idJoueur: "P_01", camp: "Allié" }),
        fiche("M1", { estMonstre: true, camp: "Ennemi" }),
        fiche("M2", { estMonstre: true, camp: "Ennemi" })
    ],
    positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 5, r: 0 } },
    partie: { Phase_Combat: "Resolution", Tour_Combat: 1,
              Ordre_Initiative: ["H1", "M1", "M2"], File_Attente_Combat: [] },
    regles
});

// Un plateau de test : un mur vertical en q = 2 (sauf en r = -2), et une
// fondrière en (0,1).
const PLATEAU = {
    etatCase: (q, r) => ({
        bloquee: q === 2 && r !== -2,
        supprimee: false,
        difficile: q === 0 && r === 1
    })
};

// =========================================================================
console.log("\n1. LA GÉOMÉTRIE DU PLATEAU");
// =========================================================================
{
    verifier("une case voisine est à distance un", distance({ q: 0, r: 0 }, { q: 1, r: 0 }) === 1);
    verifier("la diagonale hexagonale aussi", distance({ q: 0, r: 0 }, { q: 1, r: -1 }) === 1);
    verifier("deux cases en ligne droite", distance({ q: 0, r: 0 }, { q: 3, r: 0 }) === 3);
    verifier("et le trajet le plus court n'est pas la somme des axes",
             distance({ q: 0, r: 0 }, { q: 2, r: -2 }) === 2);
    verifier("chaque case a exactement six voisines", voisinsDe({ q: 0, r: 0 }).length === 6);
    verifier("toutes à distance un",
             voisinsDe({ q: 3, r: -1 }).every(v => distance({ q: 3, r: -1 }, v) === 1));
    verifier("un combattant hors du plateau est à distance infinie",
             distance({ q: 0, r: 0 }, { q: null, r: null }) === Infinity);
}

// =========================================================================
console.log("\n2. LE CHEMIN CONTOURNE LES MURS ET LES VIVANTS");
// =========================================================================
{
    const etat = neuf();

    // Ligne droite, sans obstacle : trois pas.
    const droit = trouverChemin(etat, { q: 0, r: 0 }, { q: 0, r: -3 }, null, { idQuiBouge: "H1" });
    verifier("sans obstacle, le chemin est direct", droit.length === 3, `(${droit.length} pas)`);
    verifier("il ne contient pas la case de départ",
             !droit.some(h => h.q === 0 && h.r === 0));
    verifier("et il finit bien à l'arrivée",
             droit[droit.length - 1].q === 0 && droit[droit.length - 1].r === -3);

    // M1 occupe (1,0) : le chemin doit le contourner.
    const contourne = trouverChemin(etat, { q: 0, r: 0 }, { q: 2, r: 0 }, null, { idQuiBouge: "H1" });
    verifier("un vivant se contourne", contourne.length > 0
             && !contourne.some(h => h.q === 1 && h.r === 0), `(${contourne.length} pas)`);

    // Un mort, lui, se traverse.
    const avecMort = clonerEtat(etat);
    avecMort.combattants.M1.aTerre = true;
    avecMort.combattants.M1.pv = 0;
    const parDessus = trouverChemin(avecMort, { q: 0, r: 0 }, { q: 2, r: 0 }, null, { idQuiBouge: "H1" });
    verifier("un cadavre ne barre plus la route",
             parDessus.length === 2 && parDessus[0].q === 1 && parDessus[0].r === 0);

    // Le mur du plateau de test : q = 2 est infranchissable sauf en r = -2.
    const seul = clonerEtat(etat);
    delete seul.combattants.M1;
    delete seul.combattants.M2;
    const passage = trouverChemin(seul, { q: 0, r: 0 }, { q: 3, r: 0 }, PLATEAU, { idQuiBouge: "H1" });
    verifier("le chemin trouve la brèche du mur",
             passage.length > 0 && passage.some(h => h.q === 2 && h.r === -2),
             `(${passage.map(h => h.q + "," + h.r).join(" ")})`);

    // Une arrivée totalement murée ne fait pas exploser la recherche.
    const mure = { etatCase: (q) => ({ bloquee: q !== 0, supprimee: false, difficile: false }) };
    const debut = Date.now();
    const impossible = trouverChemin(seul, { q: 0, r: 0 }, { q: 9, r: 0 }, mure, { idQuiBouge: "H1" });
    verifier("une arrivée inatteignable rend un chemin vide", impossible.length === 0);
    verifier("et sans faire exploser la recherche", Date.now() - debut < 500,
             `(${Date.now() - debut} ms)`);
}

// =========================================================================
console.log("\n3. CE QUE COÛTE CHAQUE CASE");
// =========================================================================
//  Le barème est la règle du jeu : trois cases à 2, trois à 4, le reste à 6.
//  C'est ce qui rend une longue course épuisante, et l'ordre des multiplicateurs
//  compte autant que le barème.
{
    const simple = { etats: [], atouts: { diviseurDeplacement: 1 }, mod: {} };

    verifier("les trois premières cases coûtent deux",
             [1, 2, 3].every(n => coutDuPas(simple, n, false, false) === 2));
    verifier("les trois suivantes, quatre",
             [4, 5, 6].every(n => coutDuPas(simple, n, false, false) === 4));
    verifier("et au-delà, six",
             [7, 12].every(n => coutDuPas(simple, n, false, false) === 6));

    verifier("un terrain difficile double", coutDuPas(simple, 1, true, false) === 4);

    const glace = { ...simple, etats: [{ nom: "Glacé", tours: 2 }] };
    verifier("l'état Glacé double aussi", coutDuPas(glace, 1, false, false) === 4);
    verifier("et les deux se cumulent", coutDuPas(glace, 1, true, false) === 8);

    // Le Vargen divise APRÈS les doublements : il garde son avantage sur un sol
    // qui coûte double.
    const vargen = { ...simple, atouts: { diviseurDeplacement: 2 } };
    verifier("le Vargen se déplace pour moitié prix", coutDuPas(vargen, 1, false, false) === 1);
    verifier("et son avantage survit au terrain difficile",
             coutDuPas(vargen, 1, true, false) === 2, `(${coutDuPas(vargen, 1, true, false)})`);
    const vargenGlace = { ...vargen, etats: [{ nom: "Glacé" }] };
    verifier("comme au gel", coutDuPas(vargenGlace, 1, true, false) === 4);

    // L'équipement alourdit ou allège, sans jamais descendre sous un.
    const lourd = { ...simple, mod: { coutDeplacement: 1 } };
    verifier("un bouclier lourd ajoute une énergie", coutDuPas(lourd, 1, false, false) === 3);
    const leger = { ...simple, mod: { coutDeplacement: -5 } };
    verifier("un équipement léger n'amène jamais à zéro", coutDuPas(leger, 1, false, false) === 1);

    verifier("une case offerte est vraiment gratuite", coutDuPas(lourd, 9, true, true) === 0);
}

// =========================================================================
console.log("\n4. LE TRAJET S'ARRÊTE QUAND L'ÉNERGIE MANQUE");
// =========================================================================
//  Et il rend ce qui est payable : un joueur qui vise trop loin marche aussi
//  loin qu'il peut, il ne reste pas planté sur place.
{
    const etat = neuf();
    etat.combattants.H1.fatigue = 7;
    const chemin = [{ q: 0, r: -1 }, { q: 0, r: -2 }, { q: 0, r: -3 }, { q: 0, r: -4 }];

    const plan = planifierTrajet(etat, "H1", chemin, null, {});
    verifier("trois cases à deux, la quatrième ne passe plus",
             plan.pas.length === 3 && plan.cout === 6, `(${plan.pas.length} pas, ${plan.cout})`);
    verifier("et le trajet se déclare écourté", plan.tronque === true);

    // Avec assez d'énergie, la quatrième coûte quatre : le barème monte.
    etat.combattants.H1.fatigue = 100;
    const complet = planifierTrajet(etat, "H1", chemin, null, {});
    verifier("le barème monte à la quatrième case",
             complet.cout === 10 && complet.pas[3].cout === 4, `(${complet.cout})`);
    verifier("et rien n'est écourté", complet.tronque === false);

    // La carte réservée n'est pas dépensable en marchant : c'est ce qui empêche
    // d'arriver à portée sans pouvoir frapper.
    const reserve = planifierTrajet(etat, "H1", chemin, null, { reserveCarte: 95 });
    verifier("l'énergie réservée à la carte reste intouchable",
             reserve.cout <= 5, `(${reserve.cout})`);

    // Un trajet déjà entamé continue sur le barème où il en était.
    const suite = planifierTrajet(etat, "H1", [{ q: 0, r: -1 }], null, { pasDejaFaits: 6 });
    verifier("un trajet repris garde son barème", suite.pas[0].cout === 6, `(${suite.pas[0].cout})`);
}

// =========================================================================
console.log("\n5. QUI FRAPPE QUAND ON S'ENFUIT, ET À QUEL HEXAGONE");
// =========================================================================
{
    const etat = neuf();
    verifier("l'ennemi voisin est au contact",
             ennemisAuContact(etat, "H1", { q: 0, r: 0 }).join(",") === "M1");
    verifier("celui d'en face ne l'est pas",
             !ennemisAuContact(etat, "H1", { q: 0, r: 0 }).includes("M2"));
    verifier("un allié n'est jamais au contact ennemi",
             ennemisAuContact(etat, "M1", { q: 1, r: 0 }).join(",") === "H1");

    // Une illusion ne frappe pas : elle n'a pas d'arme.
    const illusion = clonerEtat(etat);
    illusion.combattants.M1.estIllusion = true;
    verifier("une illusion n'est pas comptée au contact",
             ennemisAuContact(illusion, "H1", { q: 0, r: 0 }).length === 0);
    verifier("et ne porte aucun coup d'opportunité",
             resoudreOpportunite(illusion, "M1", "H1", creerDes(1)) === null);

    // Un mort non plus.
    const mort = clonerEtat(etat);
    mort.combattants.M1.aTerre = true;
    verifier("un combattant à terre non plus",
             ennemisAuContact(mort, "H1", { q: 0, r: 0 }).length === 0);
}

// =========================================================================
console.log("\n6. LE COUP D'OPPORTUNITÉ : DIX POINTS, FIXES");
// =========================================================================
//  Il ignore l'armure et les compétences — c'est un réflexe, pas une technique.
{
    const etat = neuf();
    // Une cible sans défense : le coup passe forcément.
    const coup = resoudreOpportunite(etat, "M1", "H1", creerDes(7));
    verifier("il porte dix points", coup.montant === DEGATS_OPPORTUNITE && !coup.evitee);

    // Une cible qui esquive toujours ne le prend jamais.
    const agile = clonerEtat(etat);
    agile.combattants.H1.def.esquive = 100;
    const rate = resoudreOpportunite(agile, "M1", "H1", creerDes(7));
    verifier("une esquive parfaite l'évite", rate.evitee === true && rate.montant === 0);
    verifier("et le mot dit comment", rate.mot === "Esquivé 💨", `(${rate.mot})`);

    const bouclierHumain = clonerEtat(etat);
    bouclierHumain.combattants.H1.def.parade = 100;
    verifier("une parade parfaite le pare aussi",
             resoudreOpportunite(bouclierHumain, "M1", "H1", creerDes(7)).mot === "Paré 🛡️");

    // Le Vargen se dérobe AVANT le jet de défense.
    const vargen = clonerEtat(etat);
    vargen.combattants.H1.atouts.esquiveOpportunite = 100;
    const derobe = resoudreOpportunite(vargen, "M1", "H1", creerDes(7));
    verifier("le Vargen se dérobe avant même le jet",
             derobe.evitee === true && derobe.mot === "Dérobade 🐾");
}

// =========================================================================
console.log("\n7. UN DÉPLACEMENT COMPLET, PAS À PAS");
// =========================================================================
//  Un pas, une étape. L'opportunité s'intercale exactement là où elle se
//  produit — c'est ce qui permet à l'animation de marquer sa pause au bon
//  hexagone au lieu de tout jouer une fois arrivé.
{
    const etat = neuf();
    // H1 part de (0,0), au contact de M1 en (1,0), et s'éloigne vers le nord.
    const action = { idLanceur: "H1", chemin: [{ q: 0, r: -1 }, { q: 0, r: -2 }, { q: 0, r: -3 }] };
    const { etat: apres, etapes } = resoudreMouvement(etat, action, creerDes(7), null);

    const pas = etapes.filter(e => e.type === "pas");
    verifier("trois hexagones, trois étapes", pas.length === 3);
    verifier("chaque étape dit d'où et vers où",
             pas.every(e => e.de && e.vers) && pas[0].de.r === 0 && pas[0].vers.r === -1);
    verifier("et l'énergie qui reste après ce pas-là",
             pas[0].fatigueApres === 98 && pas[2].fatigueApres === 94,
             `(${pas.map(e => e.fatigueApres).join(", ")})`);
    verifier("le pion arrive bien au bout",
             apres.combattants.H1.q === 0 && apres.combattants.H1.r === -3);

    // M1 était au contact au départ : il frappe à la PREMIÈRE étape, pas à la
    // fin du trajet.
    const opp = etapes.find(e => e.type === "opportunite");
    verifier("l'ennemi quitté frappe", !!opp && opp.attaquant === "M1");
    const rang = etapes.indexOf(opp);
    verifier("et il frappe dès le premier hexagone quitté",
             rang > 0 && rang <= 2, `(étape n°${rang})`);
    verifier("à l'hexagone exact où on lui échappe",
             opp.hex.q === 0 && opp.hex.r === -1);

    verifier("l'état reste cohérent", verifierEtatCombat(apres).length === 0,
             verifierEtatCombat(apres).join(" | "));
}

// =========================================================================
console.log("\n8. LE COUP D'OPPORTUNITÉ FRAPPE VRAIMENT");
// =========================================================================
{
    const etat = neuf();
    const action = { idLanceur: "H1", chemin: [{ q: 0, r: -1 }] };

    const { etat: apres, etapes } = resoudreMouvement(etat, action, creerDes(7), null);
    verifier("les points de vie ont bien baissé de dix",
             apres.combattants.H1.pv === 50, `(${apres.combattants.H1.pv})`);
    verifier("et l'étape de dégâts le dit",
             etapes.some(e => e.type === "degats" && e.opportunite && e.pvApres === 50));

    // Avec un bouclier, c'est lui qui prend — et le surplus part dans le vide.
    const protege = clonerEtat(etat);
    protege.combattants.H1.bouclier = 4;
    const b = resoudreMouvement(protege, action, creerDes(7), null);
    verifier("le bouclier encaisse en premier", b.etat.combattants.H1.bouclier === 0);
    verifier("et le surplus ne passe pas au travers", b.etat.combattants.H1.pv === 60);

    // Un coup qui tue : la chute est une étape à part entière.
    const faible = clonerEtat(etat);
    faible.combattants.H1.pv = 6;
    const mortel = resoudreMouvement(faible, action, creerDes(7), null);
    verifier("un coup mortel couche le fuyard",
             mortel.etat.combattants.H1.aTerre === true && mortel.etat.combattants.H1.pv === 0);
    verifier("et la chute est racontée", mortel.etapes.some(e => e.type === "chute"));
}

// =========================================================================
console.log("\n9. ON NE BOUGE PAS QUAND ON EST IMMOBILISÉ");
// =========================================================================
{
    const etat = neuf();
    ["Immobilisation", "Paralysie"].forEach(nom => {
        const bloque = clonerEtat(etat);
        bloque.combattants.H1.etats = [{ nom, tours: 2 }];
        const { etat: apres, etapes } = resoudreMouvement(
            bloque, { idLanceur: "H1", chemin: [{ q: 0, r: -1 }] }, creerDes(1), null);
        verifier(`« ${nom} » cloue sur place`,
                 apres.combattants.H1.q === 0 && apres.combattants.H1.r === 0);
        verifier(`et le dit`, etapes.length === 1 && etapes[0].type === "echec");
    });
}

// =========================================================================
console.log("\n10. MILLE TRAJETS AU HASARD, AUCUN ÉTAT INCOHÉRENT");
// =========================================================================
{
    const des = creerDes(20260910);
    let violations = 0, premiere = "", pasJoues = 0;

    for (let essai = 0; essai < 1000; essai++) {
        let etat = neuf();
        etat.combattants.H1.fatigue = des.entier(0, 100);
        etat.combattants.H1.bouclier = des.entier(0, 15);
        etat.combattants.H1.pv = des.entier(1, 60);
        if (des.chance(20)) etat.combattants.H1.etats = [{ nom: "Glacé", tours: 2 }];

        const arrivee = { q: des.entier(-5, 5), r: des.entier(-5, 5) };
        const chemin = trouverChemin(etat, { q: 0, r: 0 }, arrivee, PLATEAU, { idQuiBouge: "H1" });
        const { etat: apres, etapes } = resoudreMouvement(
            etat, { idLanceur: "H1", chemin }, des, PLATEAU);

        pasJoues += etapes.filter(e => e.type === "pas").length;
        const soucis = verifierEtatCombat(apres);
        if (soucis.length) { violations++; if (!premiere) premiere = `essai ${essai} : ${soucis[0]}`; }
    }

    verifier("mille trajets au hasard, aucun état incohérent", violations === 0,
             premiere || `(${pasJoues} pas joués)`);
    verifier("et ils ont vraiment marché", pasJoues > 1000, `(${pasJoues} pas)`);
}

// =========================================================================
console.log("\n11. LE MÊME TRAJET, DEUX FOIS, AU CARACTÈRE PRÈS");
// =========================================================================
{
    const jouer = () => {
        const etat = neuf();
        return resoudreMouvement(etat,
            { idLanceur: "H1", chemin: [{ q: 0, r: -1 }, { q: 1, r: -2 }, { q: 2, r: -2 }] },
            creerDes(31337), PLATEAU);
    };
    const a = jouer(), b = jouer();
    verifier("deux exécutions donnent le même état",
             JSON.stringify(a.etat) === JSON.stringify(b.etat));
    verifier("et exactement les mêmes étapes",
             JSON.stringify(a.etapes) === JSON.stringify(b.etapes));

    // Une graine différente peut donner une autre issue à l'opportunité : c'est
    // le hasard, et c'est bien qu'il existe.
    const etat = neuf();
    etat.combattants.H1.def.esquive = 50;
    const issues = new Set();
    for (let g = 1; g <= 60; g++) {
        const r = resoudreMouvement(etat, { idLanceur: "H1", chemin: [{ q: 0, r: -1 }] },
                                    creerDes(g), null);
        issues.add(r.etat.combattants.H1.pv);
    }
    verifier("à cinquante pour cent d'esquive, les deux issues arrivent",
             issues.size === 2, `(${[...issues].join(", ")})`);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
