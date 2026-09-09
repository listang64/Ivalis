// L'IA DES CRÉATURES, MISE À L'ÉPREUVE — ÉTAPE 2c.
//
// Faire jouer un monstre, c'est répondre à deux questions : QUI viser, et OÙ se
// mettre. Dans l'ancien code, ces réponses se prenaient en lisant quatre
// variables globales — les fiches, les pions, les zones, le plateau — chacune
// pouvant être en retard d'une notification. Deux postes qui faisaient jouer la
// même créature au même instant n'avaient donc pas le même plateau sous les
// yeux : c'est exactement ce qu'on a vu dans la trace de Nico, une créature
// partie de deux cases distinctes vers deux cibles distinctes.
//
// Ici la décision ne dépend que de l'état passé et de la graine. Ce banc
// vérifie que chaque personnalité joue bien son caractère — et surtout que la
// même situation donne toujours la même décision.
import {
    PERSONNALITES, traitsDe, dangerDeLaCase, ennemisAuContactDepuis, alliesAdjacents,
    ennemiLePlusProche, casesAccessibles, choisirCible, choisirPosition, deciderTourCreature
} from '../ia_pure.js';
import { construireEtatCombat, creerDes, clonerEtat } from '../combat_etat.js';
import { distance } from '../mouvement_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, extra = {}) => ({
    idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100,
    Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Bouclier_Actuel: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});

// Un plateau : trois héros à gauche, une créature à droite.
//   H1 en pleine forme (0,0) · H2 blessé (0,2) · H3 loin (−4,0) · M1 en (4,0)
const monde = (persoM1 = "brutal", extra = {}) => construireEtatCombat({
    idPartie: "P1", cerveau: "P_03", graine: 4242,
    combattants: [
        fiche("H1", { idJoueur: "P_01", camp: "Allié" }),
        fiche("H2", { idJoueur: "P_01", camp: "Allié", PV_Actuels: 12 }),
        fiche("H3", { idJoueur: "P_03", camp: "Allié" }),
        fiche("M1", { estMonstre: true, camp: "Ennemi", Personnalite: persoM1, ...extra }),
        fiche("M2", { estMonstre: true, camp: "Ennemi", PV_Actuels: 20, Personnalite: "brutal" })
    ],
    positions: { H1: { q: 0, r: 0 }, H2: { q: 0, r: 2 }, H3: { q: -4, r: 0 },
                 M1: { q: 4, r: 0 }, M2: { q: 6, r: 0 } },
    partie: { Phase_Combat: "Resolution", Tour_Combat: 1,
              Ordre_Initiative: ["M1", "H1", "H2", "H3", "M2"], File_Attente_Combat: [] }
});

const CAC = { portee: 1, fatigue: 20 };
const ARC = { portee: 4, fatigue: 20 };

// Un tirage stable : le même pour toutes les comparaisons d'un chapitre.
const des = () => creerDes(12345);

// =========================================================================
console.log("\n1. CHAQUE CARACTÈRE EST UN JEU DE POIDS");
// =========================================================================
{
    verifier("les cinq personnalités existent", Object.keys(PERSONNALITES).length === 5);
    verifier("la brute ignore les zones", PERSONNALITES.brutal.peurZones === 0);
    verifier("le prudent les craint au maximum", PERSONNALITES.prudent.peurZones === 1);
    verifier("le sanguinaire achève sans retenue", PERSONNALITES.sanguinaire.cibleFaible === 1);
    verifier("le tacticien contourne plus que tous", PERSONNALITES.tacticien.contourne === 1);
    verifier("une personnalité inconnue retombe sur la brute",
             traitsDe({ personnalite: "farfelu" }) === PERSONNALITES.brutal);
    verifier("et une créature sans caractère aussi", traitsDe({}) === PERSONNALITES.brutal);
}

// =========================================================================
console.log("\n2. LE SANGUINAIRE ACHÈVE, LE PRUDENT PREND CE QUI EST À PORTÉE");
// =========================================================================
//  Deux créatures dans la MÊME situation, avec la MÊME graine : seule leur
//  personnalité les sépare. Si elles choisissent la même cible, les traits ne
//  servent à rien.
{
    // On rapproche la créature pour que les deux héros soient à portée d'arc.
    const proche = (perso) => {
        const e = monde(perso);
        e.combattants.M1.q = 2; e.combattants.M1.r = 1;
        return e;
    };

    const sanguinaire = choisirCible(proche("sanguinaire"), "M1", ARC, des());
    verifier("le sanguinaire va au blessé", sanguinaire.id === "H2", `(${sanguinaire.id})`);

    // Comptons sur cent graines : la tendance doit être franche, pas anecdotique.
    const compter = (perso) => {
        let versBlesse = 0;
        for (let g = 1; g <= 100; g++) {
            const c = choisirCible(proche(perso), "M1", ARC, creerDes(g));
            if (c && c.id === "H2") versBlesse++;
        }
        return versBlesse;
    };
    const sang = compter("sanguinaire"), brute = compter("brutal");
    verifier("le sanguinaire vise le blessé bien plus souvent que la brute",
             sang > brute, `(${sang} % contre ${brute} %)`);
    verifier("et il le fait très majoritairement", sang >= 80, `(${sang} %)`);
}

// =========================================================================
console.log("\n3. UN SOIN VA AUX SIENS, ET AU PLUS MAL EN POINT");
// =========================================================================
{
    const etat = monde("prudent");
    const cible = choisirCible(etat, "M1", { portee: 3, fatigue: 10, estSoin: true }, des());
    verifier("le soin va bien à un allié", cible && cible.camp === "Ennemi", `(${cible && cible.id})`);
    verifier("et au plus blessé des deux", cible.id === "M2", `(${cible.id})`);

    // Tout le monde va bien : le soin ne trouve personne d'intéressant, mais il
    // reste dans son camp.
    const sains = clonerEtat(etat);
    sains.combattants.M2.pv = 60;
    const quand = choisirCible(sains, "M1", { portee: 3, fatigue: 10, estSoin: true }, des());
    verifier("même quand tous vont bien, il reste dans son camp",
             quand && quand.camp === "Ennemi");
}

// =========================================================================
console.log("\n4. LA PROVOCATION PRIME SUR TOUT LE RESTE");
// =========================================================================
//  L'arme d'un héros peut forcer une créature à ne plus voir que lui. C'est une
//  contrainte, pas une préférence : elle doit l'emporter sur le caractère.
{
    const etat = monde("sanguinaire");
    etat.combattants.M1.etats = [{ nom: "Provocation", tours: 3, idProvocateur: "H1" }];

    // Cent graines : la provocation ne doit JAMAIS fléchir.
    let versH1 = 0;
    for (let g = 1; g <= 100; g++) {
        const c = choisirCible(etat, "M1", ARC, creerDes(g));
        if (c && c.id === "H1") versH1++;
    }
    verifier("la créature provoquée ne vise que son provocateur", versH1 === 100, `(${versH1} %)`);

    // Sauf pour ses soins, qui vont toujours aux siens.
    const soin = choisirCible(etat, "M1", { portee: 3, fatigue: 10, estSoin: true }, des());
    verifier("mais ses soins vont toujours aux siens", soin.camp === "Ennemi");

    // Le provocateur tombé, la contrainte s'efface d'elle-même.
    const libre = clonerEtat(etat);
    libre.combattants.H1.aTerre = true;
    libre.combattants.H1.pv = 0;
    const apres = choisirCible(libre, "M1", ARC, des());
    verifier("le provocateur tombé, elle retrouve son libre arbitre",
             apres && apres.id !== "H1", `(${apres && apres.id})`);
}

// =========================================================================
console.log("\n5. UN LEURRE N'ATTIRE QUE LES ATTAQUES NUES");
// =========================================================================
{
    const etat = monde("brutal");
    etat.combattants.ILL = { ...etat.combattants.H1, id: "ILL", estIllusion: true, q: 3, r: 0 };

    let versIllusion = 0;
    for (let g = 1; g <= 60; g++) {
        const c = choisirCible(etat, "M1", { portee: 4, fatigue: 10, estAttaqueSimple: true }, creerDes(g));
        if (c && c.id === "ILL") versIllusion++;
    }
    verifier("une attaque nue peut se faire prendre au leurre", versIllusion > 0,
             `(${versIllusion} fois sur 60)`);

    let versIllusionQuandMeme = 0;
    for (let g = 1; g <= 60; g++) {
        const c = choisirCible(etat, "M1", { portee: 4, fatigue: 10, estAttaqueSimple: false }, creerDes(g));
        if (c && c.id === "ILL") versIllusionQuandMeme++;
    }
    verifier("mais une carte à effets ne s'y trompe jamais", versIllusionQuandMeme === 0);

    // Un leurre n'est jamais l'adversaire « le plus proche » pour un repli.
    verifier("et il ne sert pas de repère de repli",
             ennemiLePlusProche(etat, "M1").id !== "ILL");
}

// =========================================================================
console.log("\n6. OÙ PEUT-ELLE ALLER ?");
// =========================================================================
{
    // Sur une plaine VIDE, trois pas dessinent exactement 1 + 6 + 12 + 18 = 37
    // cases. C'est la géométrie de l'hexagone, et elle ne se discute pas.
    const desert = monde("brutal");
    ["H1", "H2", "H3", "M2"].forEach(id => { delete desert.combattants[id]; });
    verifier("trois pas sur une plaine vide : trente-sept cases",
             casesAccessibles(desert, "M1", null).length === 37,
             `(${casesAccessibles(desert, "M1", null).length})`);

    // Avec du monde, moins : un vivant occupe sa case ET barre le passage. Ici
    // le congénère en (6,0) coûte sa propre case, et celle qu'il masque
    // derrière lui.
    const etat = monde("brutal");
    const cases = casesAccessibles(etat, "M1", null);
    verifier("un congénère coûte sa case et celle qu'il masque",
             cases.length === 35, `(${cases.length})`);
    verifier("sa propre case en fait partie, avec un chemin vide",
             cases.some(c => c.q === 4 && c.r === 0 && c.chemin.length === 0));
    verifier("aucune n'est à plus de trois pas",
             cases.every(c => c.chemin.length <= 3));
    verifier("et chaque chemin mène bien où il dit",
             cases.every(c => c.chemin.length === 0
                 || (c.chemin[c.chemin.length - 1].q === c.q && c.chemin[c.chemin.length - 1].r === c.r)));

    // Un mur réduit le champ des possibles.
    const mur = { etatCase: (q) => ({ bloquee: q === 3, supprimee: false, difficile: false }) };
    const bloquee = casesAccessibles(etat, "M1", mur);
    verifier("un mur réduit les cases atteignables", bloquee.length < cases.length,
             `(${bloquee.length} contre ${cases.length})`);
    verifier("et aucune n'est dans le mur", !bloquee.some(c => c.q === 3));

    // Un vivant occupe sa case : on ne s'y arrête pas.
    verifier("on ne se pose pas sur un vivant",
             !cases.some(c => c.q === 6 && c.r === 0));
}

// =========================================================================
console.log("\n7. LE TIREUR GARDE SES DISTANCES, LA BRUTE VA AU CONTACT");
// =========================================================================
{
    const placer = (perso, infos) => {
        const etat = monde(perso);
        // On isole : une seule cible, pour que la décision soit lisible.
        delete etat.combattants.H2;
        delete etat.combattants.H3;
        delete etat.combattants.M2;
        const place = choisirPosition(etat, "M1", etat.combattants.H1, infos, null, creerDes(9));
        return place ? distance(place, etat.combattants.H1) : null;
    };

    verifier("la brute au corps-à-corps se colle à sa cible",
             placer("brutal", CAC) === 1, `(distance ${placer("brutal", CAC)})`);
    const tireur = placer("prudent", ARC);
    verifier("le tireur prudent reste à distance", tireur >= 2, `(distance ${tireur})`);
    verifier("mais bien à portée", tireur <= 4, `(distance ${tireur})`);
}

// =========================================================================
console.log("\n8. LE PRUDENT REFUSE D'ENTRER DANS LES FLAMMES");
// =========================================================================
//  La pénalité des zones doit pouvoir l'emporter sur le bonus de mise à portée,
//  sinon « prudent » ne veut rien dire.
{
    // Un brasier posé tout autour du héros : pour l'atteindre au corps-à-corps,
    // il faut y entrer.
    const brasier = (perso) => {
        const etat = monde(perso);
        delete etat.combattants.H2;
        delete etat.combattants.H3;
        delete etat.combattants.M2;
        etat.combattants.M1.q = 3; etat.combattants.M1.r = 0;
        etat.zones = { ZP: { id: "ZP", degats: { valeurBrute: 12 },
                             hexes: [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: 1 },
                                     { q: 1, r: 1 }, { q: 0, r: -1 }, { q: -1, r: 1 }] } };
        const place = choisirPosition(etat, "M1", etat.combattants.H1, CAC, null, creerDes(3));
        return { etat, place };
    };

    const p = brasier("prudent");
    const dansLeFeu = (place) => dangerDeLaCase(p.etat, place.q, place.r) > 0;
    verifier("le prudent ne finit pas son tour dans le brasier", !dansLeFeu(p.place),
             `(${p.place.q},${p.place.r})`);

    const b = brasier("brutal");
    verifier("la brute, elle, y va quand même",
             dangerDeLaCase(b.etat, b.place.q, b.place.r) > 0
             || distance(b.place, b.etat.combattants.H1) === 1,
             `(${b.place.q},${b.place.r})`);

    verifier("une case hors zone n'est pas dangereuse", dangerDeLaCase(p.etat, 5, 5) === 0);
    verifier("une case de zone l'est", dangerDeLaCase(p.etat, 1, 0) > 0);
}

// =========================================================================
console.log("\n9. LIRE LE CONTACT ET L'ENTASSEMENT");
// =========================================================================
{
    const etat = monde("brutal");
    verifier("depuis sa case, la créature n'a personne au contact",
             ennemisAuContactDepuis(etat, 4, 0, "Ennemi") === 0);
    verifier("collée au héros, elle en a un",
             ennemisAuContactDepuis(etat, 1, 0, "Ennemi") === 1);
    verifier("un mort ne compte plus",
             (() => { const e = clonerEtat(etat); e.combattants.H1.aTerre = true;
                      return ennemisAuContactDepuis(e, 1, 0, "Ennemi") === 0; })());

    verifier("son congénère est bien compté comme voisin",
             alliesAdjacents(etat, 5, 0, "Ennemi", "M1") === 1);
    verifier("mais elle ne se compte pas elle-même",
             alliesAdjacents(etat, 5, 0, "Ennemi", "M2") === 1);
}

// =========================================================================
console.log("\n10. LE TOUR COMPLET, DÉCIDÉ");
// =========================================================================
{
    const etat = monde("brutal");
    delete etat.combattants.H2;
    delete etat.combattants.H3;
    delete etat.combattants.M2;

    const plan = deciderTourCreature(etat, "M1", CAC, null, creerDes(11));
    verifier("elle choisit une cible", plan.cible === "H1");
    verifier("elle trace un chemin", plan.chemin.length > 0);
    verifier("elle arrive à portée", plan.lancera === true, `(${plan.raison})`);
    verifier("et le chemin coûte quelque chose", plan.coutTrajet > 0);

    // Trop loin : elle marche quand même, et le dit.
    const loin = clonerEtat(etat);
    loin.combattants.M1.q = 12; loin.combattants.M1.r = 0;
    const marche = deciderTourCreature(loin, "M1", CAC, null, creerDes(11));
    verifier("hors d'atteinte, elle avance quand même", marche.chemin.length > 0);
    verifier("mais annonce qu'elle ne lancera rien", marche.lancera === false);
    verifier("et dit pourquoi", marche.raison === "hors de portée", `(${marche.raison})`);

    // Immobilisée : elle reste sur place, mais peut frapper si c'est à portée.
    const clouee = clonerEtat(etat);
    clouee.combattants.M1.q = 1; clouee.combattants.M1.r = 0;
    clouee.combattants.M1.etats = [{ nom: "Immobilisation", tours: 2 }];
    const bloquee = deciderTourCreature(clouee, "M1", CAC, null, creerDes(11));
    verifier("immobilisée, elle ne bouge pas d'un pouce", bloquee.chemin.length === 0);
    verifier("mais frappe si la cible est déjà au contact", bloquee.lancera === true);

    // À terre, elle ne décide plus rien.
    const morte = clonerEtat(etat);
    morte.combattants.M1.aTerre = true;
    verifier("à terre, elle ne décide plus rien",
             deciderTourCreature(morte, "M1", CAC, null, creerDes(11)) === null);

    // Plus personne en face : aucune cible, et elle le dit.
    const seule = clonerEtat(etat);
    seule.combattants.H1.aTerre = true;
    const vide = deciderTourCreature(seule, "M1", CAC, null, creerDes(11));
    verifier("sans adversaire debout, elle n'a plus de cible",
             vide.cible === null && vide.raison === "aucune cible");
}

// =========================================================================
console.log("\n11. LA MÊME SITUATION DONNE TOUJOURS LA MÊME DÉCISION");
// =========================================================================
//  LE contrôle qui compte. C'est très exactement ce qui manquait : deux postes
//  faisant jouer la même créature au même instant prenaient deux décisions
//  différentes, parce qu'ils lisaient deux plateaux différents et tiraient deux
//  dés différents.
{
    const decider = () => deciderTourCreature(monde("tacticien"), "M1", CAC, null, creerDes(777));
    const a = decider(), b = decider();
    verifier("deux décisions, mot pour mot identiques",
             JSON.stringify(a) === JSON.stringify(b));

    // Et le hasard existe quand même : des graines différentes divergent.
    const issues = new Set();
    for (let g = 1; g <= 40; g++) {
        const p = deciderTourCreature(monde("tacticien"), "M1", ARC, null, creerDes(g));
        issues.add(`${p.cible}|${p.chemin.length}`);
    }
    verifier("mais des graines différentes donnent des tours différents",
             issues.size > 1, `(${issues.size} tours distincts sur 40)`);
}

// =========================================================================
console.log("\n12. ELLE NE DÉPENSE JAMAIS L'ÉNERGIE DE SA CARTE");
// =========================================================================
//  Sans cette réserve, la créature arrive à portée sans pouvoir frapper : elle
//  a marché pour rien, et son tour est perdu.
{
    // Une créature à trois cases de sa cible, avec une carte de portée 2 : un
    // seul pas suffit à la mettre à portée. Elle ne doit pas en faire trois.
    const etat = monde("brutal");
    delete etat.combattants.H2;
    delete etat.combattants.H3;
    delete etat.combattants.M2;
    etat.combattants.M1.q = 3; etat.combattants.M1.r = 0;
    const ARME = { portee: 2, fatigue: 20 };
    etat.combattants.M1.fatigue = 24;       // la carte (20), et deux d'énergie

    const plan = deciderTourCreature(etat, "M1", ARME, null, creerDes(11));
    verifier("elle arrive à portée", plan.lancera === true, `(${plan.raison})`);
    verifier("sans dépenser l'énergie de sa carte",
             plan.coutTrajet <= 4, `(${plan.coutTrajet} d'énergie pour marcher)`);

    // Tout juste de quoi lancer, pas un pas de plus : elle reste sur place.
    const juste = clonerEtat(etat);
    juste.combattants.M1.fatigue = 20;
    juste.combattants.M1.q = 2; juste.combattants.M1.r = 0;   // déjà à portée
    const immobile = deciderTourCreature(juste, "M1", ARME, null, creerDes(11));
    verifier("sans énergie de reste, elle ne bouge plus",
             immobile.coutTrajet === 0, `(${immobile.coutTrajet})`);
    verifier("mais elle frappe quand même", immobile.lancera === true);

    // ET LA RÈGLE INVERSE, qui n'est pas un oubli : quand sa carte ne partira
    // de toute façon pas, la créature n'a plus rien à réserver — elle marche
    // aussi loin que ses jambes le permettent, pour arriver au contact au tour
    // suivant plutôt que de rester plantée.
    const trop = clonerEtat(etat);
    trop.combattants.M1.q = 12; trop.combattants.M1.r = 0;
    trop.combattants.M1.fatigue = 24;
    const repli = deciderTourCreature(trop, "M1", ARME, null, creerDes(11));
    verifier("hors d'atteinte, elle dépense tout pour se rapprocher",
             repli.lancera === false && repli.coutTrajet > 4,
             `(${repli.coutTrajet} d'énergie)`);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
