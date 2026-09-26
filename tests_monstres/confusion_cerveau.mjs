// LA CONFUSION : QUATRE EFFETS INDÉPENDANTS, CHACUN À 30 %.
//
// Règle de Nico : quand un confus lance une technique, quatre jets
// indépendants, dans cet ordre :
//    1. 30 % de s'attaquer lui-même ;
//    2. 30 % d'attaquer au hasard autour de lui ;
//    3. 30 % de s'enfuir (comme la Peur) ;
//    4. 30 % de n'être plus confus (en fin de boucle).
// Indépendants : 1 et 2 peuvent sortir ensemble (la carte touche les deux),
// la fuite peut suivre un coup parti de travers. Avant, UN seul dé choisissait
// une seule bande (20 % soi, 20 % hasard, 10 % dissipation).
//
// Et les règles de la maison, toujours tenues : les dés sont ceux du cerveau
// (le même résultat pour tous les postes) et ne sont tirés QUE si le lanceur
// est confus.
import {
    appliquerConfusion, resoudreCarte, tirerDesCarte, dissiperConfusion,
    CHANCE_CONFUSION_SOI, CHANCE_CONFUSION_HASARD, CHANCE_CONFUSION_FUITE, CHANCE_CONFUSION_DISSIPEE
} from '../moteur_pur.js';
import { construireEtatCombat, creerDes } from '../combat_etat.js';
import { appliquerIntention, jouerCreature } from '../cerveau_combat.js';
import { distance } from '../mouvement_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(70)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, camp, extra = {}) => ({
    idPersonnage: id, camp, prenom: id, PV_Max: 60, PV_Actuels: 60,
    Fatigue_Max: 100, Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Critique: 0,
    Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});
const CONFUS = [{ nom: "Confusion", duree: 3 }];

// Le confus en (0,0), un allié tout près, deux ennemis à portée.
const monde = (graine = 9, etatsDuLanceur = CONFUS, positions) => construireEtatCombat({
    idPartie: "P1", cerveau: "P_01", graine,
    combattants: [
        fiche("MOI", "Allié", { idJoueur: "P_01", Etats_Alteres: etatsDuLanceur }),
        fiche("AMI", "Allié", { idJoueur: "P_02" }),
        fiche("GOB", "Ennemi", { estMonstre: true }),
        fiche("ORC", "Ennemi", { estMonstre: true })
    ],
    positions: positions || { MOI: { q: 0, r: 0 }, AMI: { q: 1, r: 0 }, GOB: { q: 2, r: 0 }, ORC: { q: 0, r: 2 } },
    partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["MOI", "GOB", "ORC", "AMI"],
              File_Attente_Combat: [{ idPersonnage: "MOI", idCarte: "C1" }, { idPersonnage: "GOB", idCarte: "CG" }] }
});
const carte = (extra = {}) => ({
    type: "carte", idLanceur: "MOI", idCarte: "C1",
    attaques: [{ valeurBrute: 10, cibles: ["ORC"], rangeMax: 3, typeRes: "Physique" }],
    alterations: [], ...extra
});
// Des truqués : les quatre premiers jets sont imposés, le reste est normal.
const desTruques = (jets) => {
    const vrai = creerDes(123);
    const file = [...jets];
    return { ...vrai, d100: () => file.length ? file.shift() : vrai.d100(), parmi: vrai.parmi, fraction: vrai.fraction };
};
const OUI = 5, NON = 95;

console.log("\n1. LES QUATRE JETS, UN PAR EFFET");
{
    verifier("chacun vaut 30 %", [CHANCE_CONFUSION_SOI, CHANCE_CONFUSION_HASARD, CHANCE_CONFUSION_FUITE,
                                  CHANCE_CONFUSION_DISSIPEE].every(c => c === 30));
    const rien = appliquerConfusion(monde(), carte(), null, desTruques([NON, NON, NON, NON]));
    verifier("aucun jet : la carte part comme voulue", JSON.stringify(rien.attaques[0].cibles) === '["ORC"]'
             && !rien.confusion.soi && !rien.confusion.hasard && !rien.confusion.fuite && !rien.confusion.dissipee);
    const soi = appliquerConfusion(monde(), carte(), null, desTruques([OUI, NON, NON, NON]));
    verifier("1er jet : il se vise lui-même", JSON.stringify(soi.attaques[0].cibles) === '["MOI"]' && soi.confusion.soi);
    const hasard = appliquerConfusion(monde(), carte(), null, desTruques([NON, OUI, NON, NON]));
    const c = hasard.attaques[0].cibles;
    verifier("2e jet : quelqu'un d'autre, au hasard, à portée", c.length === 1 && c[0] !== "MOI"
             && ["AMI", "GOB", "ORC"].includes(c[0]) && hasard.confusion.hasard, JSON.stringify(c));
    const lesDeux = appliquerConfusion(monde(), carte(), null, desTruques([OUI, OUI, NON, NON]));
    const c2 = lesDeux.attaques[0].cibles;
    verifier("1er ET 2e : la carte touche le confus ET sa cible de hasard",
             c2.length === 2 && c2.includes("MOI") && c2.some(x => x !== "MOI"), JSON.stringify(c2));
    const fuite = appliquerConfusion(monde(), carte(), null, desTruques([NON, NON, OUI, OUI]));
    verifier("3e et 4e jets : la carte part normalement, fuite et dissipation notées",
             JSON.stringify(fuite.attaques[0].cibles) === '["ORC"]' && fuite.confusion.fuite && fuite.confusion.dissipee);
}

console.log("\n2. INDÉPENDANTS, SUR 6000 CARTES");
{
    let n = 0, s = 0, h = 0, f = 0, d = 0, sh = 0, fd = 0;
    for (let g = 1; g <= 6000; g++) {
        const a = appliquerConfusion(monde(), carte(), null, creerDes(g));
        n++;
        if (a.confusion.soi) s++;
        if (a.confusion.hasard) h++;
        if (a.confusion.fuite) f++;
        if (a.confusion.dissipee) d++;
        if (a.confusion.soi && a.confusion.hasard) sh++;
        if (a.confusion.fuite && a.confusion.dissipee) fd++;
    }
    const pc = (x) => x / n * 100;
    const pres = (x, cible, marge = 2.5) => Math.abs(pc(x) - cible) < marge;
    verifier("≈ 30 % se visent eux-mêmes", pres(s, 30), pc(s).toFixed(1) + " %");
    verifier("≈ 30 % visent au hasard", pres(h, 30), pc(h).toFixed(1) + " %");
    verifier("≈ 30 % s'enfuient", pres(f, 30), pc(f).toFixed(1) + " %");
    verifier("≈ 30 % s'en remettent", pres(d, 30), pc(d).toFixed(1) + " %");
    verifier("les deux premiers ensemble ≈ 9 % (indépendants : 30 % × 30 %)", pres(sh, 9, 2), pc(sh).toFixed(1) + " %");
    verifier("fuite ET guérison ≈ 9 %", pres(fd, 9, 2), pc(fd).toFixed(1) + " %");
}

console.log("\n3. UN COMBATTANT SAIN NE TIRE AUCUN DÉ");
{
    const des = creerDes(77), temoin = creerDes(77);
    const a = appliquerConfusion(monde(9, []), carte(), null, des);
    verifier("sa carte ne change pas", !a.confusion && JSON.stringify(a.attaques[0].cibles) === '["ORC"]');
    verifier("et la suite des dés est intacte", des.d100() === temoin.d100());
}

console.log("\n4. LES CAS PARTICULIERS");
{
    const soin = carte({ attaques: [], alterations: [{ nom: "Étourdi", chance: 100, duree: 2, cibles: ["ORC"] }] });
    const s = appliquerConfusion(monde(), soin, null, desTruques([NON, OUI, NON, NON]));
    verifier("une carte sans attaque ne part pas au hasard : elle revient sur lui",
             JSON.stringify(s.alterations[0].cibles) === '["MOI"]');
    const seul = monde(9, CONFUS, { MOI: { q: 0, r: 0 }, AMI: { q: 9, r: 0 }, GOB: { q: 9, r: -3 }, ORC: { q: -9, r: 0 } });
    const perdu = appliquerConfusion(seul, carte({ attaques: [{ valeurBrute: 10, cibles: ["ORC"], rangeMax: 1 }] }),
                                     null, desTruques([NON, OUI, NON, NON]));
    verifier("personne à portée : la carte revient sur lui", JSON.stringify(perdu.attaques[0].cibles) === '["MOI"]');
    const pousse = carte({ alterations: [{ nom: "Poussée", estPoussee: true, chance: 100, cibles: ["ORC"] }] });
    const p = appliquerConfusion(monde(), pousse, null, desTruques([OUI, NON, NON, NON]));
    verifier("une poussée ne se retourne jamais sur soi", p.alterations[0].cibles.length === 0);
    const r = resoudreCarte(monde(), { ...appliquerConfusion(monde(), carte(), null, desTruques([OUI, OUI, NON, NON])),
                                       jets: { parCible: { MOI: { esquive: false, etats: {} }, AMI: { esquive: false, etats: {} },
                                                           GOB: { esquive: false, etats: {} }, ORC: { esquive: false, etats: {} } } } });
    const textes = r.etapes.filter(e => e.type === "message").map(e => e.texte);
    verifier("le joueur est prévenu des deux", textes.includes("Confus : s'inflige sa propre compétence !")
             && textes.includes("Confus : cible au hasard !"), textes.join(" | "));
    verifier("et les deux sont frappés", r.etat.combattants.MOI.pv === 50
             && Object.values(r.etat.combattants).filter(c => c.pv === 50).length === 2);
}

console.log("\n5. DANS LE CERVEAU : LA FUITE, PUIS LA FIN DE LA BOUCLE (joueur)");
{
    // On cherche, graine par graine, un tour où les jets 3 et 4 sortent tous
    // les deux : c'est le cerveau qui tire, on ne triche pas ici.
    let trouve = null;
    for (let g = 1; g <= 400 && !trouve; g++) {
        const pas = appliquerIntention(monde(g), { id: "I1", type: "carte", acteur: "MOI", poste: "P_01", idCarte: "C1",
            attaques: [{ valeurBrute: 10, cibles: ["ORC"], rangeMax: 3, typeRes: "Physique" }], alterations: [], coutFatigue: 5 }, null);
        const t = pas.entree.etapes.map(e => e.texte || e.type);
        if (t.includes("Confus : s'enfuit !") && t.includes("Confusion dissipée !")) trouve = { g, pas, t };
    }
    verifier("le cerveau fait fuir ET guérir (une graine suffit à le montrer)", !!trouve, trouve ? `graine ${trouve.g}` : "");
    if (trouve) {
        const e = trouve.pas.entree.etapes;
        const iFuite = trouve.t.indexOf("Confus : s'enfuit !"), iFin = trouve.t.indexOf("Confusion dissipée !");
        const iCarte = e.findIndex(x => x.type === "carte");
        const pasFuite = e.slice(iFuite).filter(x => x.type === "pas" && x.acteur === "MOI");
        verifier("dans l'ordre : la carte, la fuite, la dissipation", iCarte < iFuite && iFuite < iFin, trouve.t.join(","));
        verifier("il fuit vraiment (des pas après l'annonce)", pasFuite.length > 0, String(pasFuite.length));
        const moi = trouve.pas.etat.combattants.MOI;
        verifier("et il n'est plus confus à la fin", !moi.etats.some(x => x.nom === "Confusion"));
        const avant = monde(trouve.g).combattants;
        verifier("il s'éloigne de l'ennemi le plus proche", distance(moi, avant.GOB) >= distance(avant.MOI, avant.GOB),
                 `${distance(avant.MOI, avant.GOB)} → ${distance(moi, avant.GOB)}`);
    }
    // Et une graine où la dissipation ne sort pas : il reste confus.
    let reste = null;
    for (let g = 1; g <= 200 && !reste; g++) {
        const pas = appliquerIntention(monde(g), { id: "I1", type: "carte", acteur: "MOI", poste: "P_01", idCarte: "C1",
            attaques: [{ valeurBrute: 10, cibles: ["ORC"], rangeMax: 3, typeRes: "Physique" }], alterations: [], coutFatigue: 5 }, null);
        if (!pas.entree.etapes.some(x => x.texte === "Confusion dissipée !")) reste = pas;
    }
    verifier("sans le 4e jet, la confusion demeure", !!reste && reste.etat.combattants.MOI.etats.some(x => x.nom === "Confusion"));
}

console.log("\n6. UNE CRÉATURE CONFUSE AUSSI");
{
    let vu = null;
    for (let g = 1; g <= 400 && !vu; g++) {
        const etat = construireEtatCombat({
            idPartie: "P1", cerveau: "P_01", graine: g,
            combattants: [fiche("H1", "Allié", { idJoueur: "P_01" }),
                          fiche("M1", "Ennemi", { estMonstre: true, Etats_Alteres: CONFUS })],
            positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } },
            partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["M1", "H1"],
                      File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "CM" }] } });
        const carteM = { idCarte: "CM", infos: { portee: 1, fatigue: 5 },
                         attaques: [{ valeurBrute: 8, rangeMax: 1, typeRes: "Physique" }], alterations: [] };
        const pas = jouerCreature(etat, "M1", carteM, null);
        const t = (pas && pas.entree ? pas.entree.etapes : []).map(e => e.texte || e.type);
        if (t.includes("Confus : s'enfuit !")) vu = t;
    }
    verifier("une créature confuse s'enfuit elle aussi", !!vu, vu ? vu.join(",") : "");
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
