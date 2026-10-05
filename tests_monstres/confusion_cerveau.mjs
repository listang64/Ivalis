// LA CONFUSION : UN JET SUR 100, ET IL SE PASSE FORCÉMENT QUELQUE CHOSE.
//
// Règle de Nico (la nouvelle) : quand un confus lance une technique,
//    • 40 % : il s'attaque lui-même, ou attaque un ALLIÉ au hasard autour de lui ;
//    • 20 % : il s'enfuit (comme la Peur) ;
//    • 20 % : il n'est plus confus (en fin de boucle) ;
//    • 20 % : il ne se passe rien.
// Un seul de ces effets, jamais deux. (Avant : quatre jets indépendants de 30 %.)
//
// Et les règles de la maison, toujours tenues : les dés sont ceux du cerveau
// (le même résultat pour tous les postes) et ne sont tirés QUE si le lanceur
// est confus.
import {
    appliquerConfusion, resoudreCarte, tirerDesCarte, dissiperConfusion,
    CONFUSION_TRAVERS, CONFUSION_FUITE, CONFUSION_DISSIPEE
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
// Des truqués : les premiers jets sont imposés, le reste est normal.
const desTruques = (jets) => {
    const vrai = creerDes(123);
    const file = [...jets];
    return { ...vrai, d100: () => file.length ? file.shift() : vrai.d100(), parmi: vrai.parmi, fraction: vrai.fraction };
};
// Le premier dé choisit l'issue ; le second (de travers seulement) : ≤ 50 lui, > 50 un allié.
const TRAVERS = 30, FUITE = 50, DISSIPEE = 70, RIEN = 90, LUI = 20, ALLIE = 80;

console.log("\n1. UN JET, QUATRE ISSUES");
{
    verifier("40 / 20 / 20 (et 20 de rien)", CONFUSION_TRAVERS === 40 && CONFUSION_FUITE === 20 && CONFUSION_DISSIPEE === 20);
    const soi = appliquerConfusion(monde(), carte(), null, desTruques([TRAVERS, LUI]));
    verifier("de travers (1–40), puis ≤ 50 : il se vise lui-même",
             JSON.stringify(soi.attaques[0].cibles) === '["MOI"]' && soi.confusion.soi && soi.confusion.issue === "travers");
    const allie = appliquerConfusion(monde(), carte(), null, desTruques([TRAVERS, ALLIE]));
    verifier("de travers, puis > 50 : il attaque un ALLIÉ autour de lui (AMI)",
             JSON.stringify(allie.attaques[0].cibles) === '["AMI"]' && allie.confusion.hasard && !allie.confusion.soi,
             JSON.stringify(allie.attaques[0].cibles));
    const fuite = appliquerConfusion(monde(), carte(), null, desTruques([FUITE]));
    verifier("41–60 : la carte part comme voulue, puis il s'enfuit",
             JSON.stringify(fuite.attaques[0].cibles) === '["ORC"]' && fuite.confusion.fuite && !fuite.confusion.dissipee);
    const fin = appliquerConfusion(monde(), carte(), null, desTruques([DISSIPEE]));
    verifier("61–80 : la carte part comme voulue, et il n'est plus confus en fin de boucle",
             JSON.stringify(fin.attaques[0].cibles) === '["ORC"]' && fin.confusion.dissipee && !fin.confusion.fuite);
    const rien = appliquerConfusion(monde(), carte(), null, desTruques([RIEN]));
    verifier("81–100 : il ne se passe rien, il reste confus",
             JSON.stringify(rien.attaques[0].cibles) === '["ORC"]' && rien.confusion.issue === "rien"
             && !rien.confusion.soi && !rien.confusion.hasard && !rien.confusion.fuite && !rien.confusion.dissipee);
}

console.log("\n2. SUR 6000 CARTES : LES BONNES PROPORTIONS, JAMAIS DEUX EFFETS");
{
    let n = 0, s = 0, h = 0, f = 0, d = 0, r = 0, deux = 0, ennemi = 0;
    for (let g = 1; g <= 6000; g++) {
        const a = appliquerConfusion(monde(), carte(), null, creerDes(g));
        n++;
        const c = a.confusion;
        if (c.soi) s++;
        if (c.hasard) { h++; if (["GOB", "ORC"].includes(c.idCible)) ennemi++; }
        if (c.fuite) f++;
        if (c.dissipee) d++;
        if (c.issue === "rien") r++;
        if ([c.soi || c.hasard, c.fuite, c.dissipee].filter(Boolean).length > 1) deux++;
    }
    const pc = (x) => x / n * 100;
    const pres = (x, cible, marge = 2.5) => Math.abs(pc(x) - cible) < marge;
    verifier("≈ 40 % de travers (lui ou un allié)", pres(s + h, 40), pc(s + h).toFixed(1) + " %");
    verifier("… moitié sur lui (≈ 20 %), moitié sur un allié (≈ 20 %)", pres(s, 20) && pres(h, 20), `${pc(s).toFixed(1)} / ${pc(h).toFixed(1)} %`);
    verifier("≈ 20 % s'enfuient", pres(f, 20), pc(f).toFixed(1) + " %");
    verifier("≈ 20 % s'en remettent", pres(d, 20), pc(d).toFixed(1) + " %");
    verifier("≈ 20 % : rien", pres(r, 20), pc(r).toFixed(1) + " %");
    verifier("jamais deux effets à la fois", deux === 0, String(deux));
    verifier("jamais un ennemi visé « au hasard » : un allié seulement", ennemi === 0, String(ennemi));
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
    const s = appliquerConfusion(monde(), soin, null, desTruques([TRAVERS, ALLIE]));
    verifier("une carte sans attaque ne part pas sur un allié : elle revient sur lui",
             JSON.stringify(s.alterations[0].cibles) === '["MOI"]');
    const seul = monde(9, CONFUS, { MOI: { q: 0, r: 0 }, AMI: { q: 9, r: 0 }, GOB: { q: 1, r: 0 }, ORC: { q: -9, r: 0 } });
    const perdu = appliquerConfusion(seul, carte({ attaques: [{ valeurBrute: 10, cibles: ["GOB"], rangeMax: 1 }] }),
                                     null, desTruques([TRAVERS, ALLIE]));
    verifier("aucun allié à portée (seulement un ennemi) : la carte revient sur lui", JSON.stringify(perdu.attaques[0].cibles) === '["MOI"]',
             JSON.stringify(perdu.attaques[0].cibles));
    const pousse = carte({ alterations: [{ nom: "Poussée", estPoussee: true, chance: 100, cibles: ["ORC"] }] });
    const p = appliquerConfusion(monde(), pousse, null, desTruques([TRAVERS, LUI]));
    verifier("une poussée ne se retourne jamais sur soi", p.alterations[0].cibles.length === 0);
    const jets = { parCible: { MOI: { esquive: false, etats: {} }, AMI: { esquive: false, etats: {} },
                               GOB: { esquive: false, etats: {} }, ORC: { esquive: false, etats: {} } } };
    const rAllie = resoudreCarte(monde(), { ...appliquerConfusion(monde(), carte(), null, desTruques([TRAVERS, ALLIE])), jets });
    const tA = rAllie.etapes.filter(e => e.type === "message").map(e => e.texte);
    verifier("de travers sur un allié : le joueur est prévenu, l'allié est frappé, pas l'ennemi",
             tA.includes("Confus : attaque un allié !") && rAllie.etat.combattants.AMI.pv === 50 && rAllie.etat.combattants.ORC.pv === 60,
             tA.join(" | "));
    const rSoi = resoudreCarte(monde(), { ...appliquerConfusion(monde(), carte(), null, desTruques([TRAVERS, LUI])), jets });
    verifier("de travers sur lui : prévenu, et lui seul frappé",
             rSoi.etapes.some(e => e.texte === "Confus : s'inflige sa propre compétence !") && rSoi.etat.combattants.MOI.pv === 50
             && rSoi.etat.combattants.ORC.pv === 60);
}

console.log("\n5. DANS LE CERVEAU : LA FUITE APRÈS LA CARTE ; LA FIN DE LA BOUCLE (joueur)");
{
    // Les dés sont ceux du cerveau : on cherche, graine par graine, les issues.
    const jouer = (g) => appliquerIntention(monde(g), { id: "I1", type: "carte", acteur: "MOI", poste: "P_01", idCarte: "C1",
        attaques: [{ valeurBrute: 10, cibles: ["ORC"], rangeMax: 3, typeRes: "Physique" }], alterations: [], coutFatigue: 5 }, null);
    let fuite = null, fin = null, reste = null, lesDeux = 0;
    for (let g = 1; g <= 400; g++) {
        const pas = jouer(g);
        const t = pas.entree.etapes.map(e => e.texte || e.type);
        const fuit = t.includes("Confus : s'enfuit !"), guerit = t.includes("Confusion dissipée !");
        if (fuit && guerit) lesDeux++;
        if (fuit && !fuite) fuite = { g, pas, t };
        if (guerit && !fin) fin = { g, pas, t };
        if (!fuit && !guerit && !reste) reste = pas;
    }
    verifier("jamais la fuite ET la guérison dans le même tour", lesDeux === 0, String(lesDeux));
    verifier("le cerveau fait fuir (une graine suffit à le montrer)", !!fuite, fuite ? `graine ${fuite.g}` : "");
    if (fuite) {
        const e = fuite.pas.entree.etapes;
        const iFuite = fuite.t.indexOf("Confus : s'enfuit !"), iCarte = e.findIndex(x => x.type === "carte");
        const pasFuite = e.slice(iFuite).filter(x => x.type === "pas" && x.acteur === "MOI");
        verifier("dans l'ordre : la carte, puis la fuite", iCarte < iFuite, fuite.t.join(","));
        verifier("il fuit vraiment (des pas après l'annonce), et reste confus", pasFuite.length > 0
                 && fuite.pas.etat.combattants.MOI.etats.some(x => x.nom === "Confusion"), String(pasFuite.length));
        const moi = fuite.pas.etat.combattants.MOI, avant = monde(fuite.g).combattants;
        verifier("il s'éloigne de l'ennemi le plus proche", distance(moi, avant.GOB) >= distance(avant.MOI, avant.GOB),
                 `${distance(avant.MOI, avant.GOB)} → ${distance(moi, avant.GOB)}`);
    }
    verifier("une autre graine le guérit : plus confus à la fin du tour", !!fin
             && !fin.pas.etat.combattants.MOI.etats.some(x => x.nom === "Confusion"), fin ? `graine ${fin.g}` : "");
    verifier("sans ces issues, la confusion demeure", !!reste && reste.etat.combattants.MOI.etats.some(x => x.nom === "Confusion"));
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
