// LA CLASSE HOPLITE.
//
// Nico : « Lvl1 : +5 % Parade / +5 % résistance physique. Lvl5 : COMP Mur de
// bouclier. Lvl10 : COMP Rempart. Mur de bouclier : fatigue 0, une fois par
// combat, +60 % de parade sur soi sur le tour, Init 100. Rempart : fatigue 0,
// une fois par combat, sur un allié adjacent : divise l'attaque reçue en deux
// attaques, dégâts divisés par deux, chacun la reçoit comme une attaque
// indépendante. 3 tours, doit rester adjacent. Init 105. Pas pour les
// altérations d'état. Ses techniques s'ajoutent aux compétences équipées sans
// compter dans le total ; dans la fiche perso, une séparation entre les
// techniques créées par le joueur et celles de classe. »
// Ses réponses : le Mur dure la manche où il est lancé ; le Rempart dort quand
// ils s'éloignent et se réveille quand ils se rapprochent ; pas de jet de
// défense pour l'Hoplite ; partagés : les cartes (zones comprises) et les
// attaques d'opportunité, pas les tics ni les nappes ; il s'arrête si
// l'Hoplite tombe.
//
// Puis, Nico : « Hoplite : au lvl5 mettre la compétence Rempart et enlever mur
// de bouclier. lvl1 : +7 % Parade / 15 % chance de provoquer sur toutes ses
// attaques. lvl10 : COMP Résonance du bouclier, 0 fatigue (une fois par
// combat) : étourdit tous les ennemis adjacents et inflige 5 % de dégâts
// physiques des PV max de la cible. Hoplite : changer son nom par
// Protecteur. » Le Mur de bouclier n'est plus donné ; le moteur le sait
// toujours jouer (section 2, palier rendu le temps de la section).
//
// v347, la refonte des classes (Nico) : niveau 1 +8 % de parade et 10 % de
// provocation ; niveau 3 le Rempart (4 tours, réserve 15 par tour, des jets
// pour chacun) ; niveau 5 +10 % de provocation et plus de malus des boucliers
// lourds ; niveau 9 la Résonance (initiative 50, 80 % d'Étourdi, 15 % des PV
// max du Protecteur). La réserve et les jets du Rempart : corrections_v347.mjs.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat } from '../combat_etat.js';
import { resoudreCarte, paradeDe, protecteurRempart, PART_PV_RESONANCE } from '../moteur_pur.js';
import { validerIntention, appliquerIntention, vieillirLesEtats, ticsDeFinDeManche } from '../cerveau_combat.js';
import { infligerOpportunite } from '../mouvement_pur.js';
import { misEnScene } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const w = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/experience.js', 'utf-8'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);
const REGLES = {
    pvMax: w.pvMaxCombattant, fatigueMax: w.fatigueMaxCombattant,
    esquive: w.esquiveCombattant, parade: w.paradeCombattant,
    defPhysique: w.defPhysiqueCombattant, defMagique: w.defMagiqueCombattant,
    critique: w.critiqueCombattant, atouts: w.atoutRace, bonusEquip: w.bonusEquip
};
const XP = { 1: 0, 2: 700, 3: 1200, 4: 1800, 5: 2500, 8: 5200, 9: 6400, 10: 7900 };

const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const hoplite = (niveau, extra = {}) => fiche("H", { classe: "Hoplite", xp: XP[niveau], ...extra });

// H en (0,0), A (son allié) en (1,0), M (l'ennemi) en (2,0), B (un allié loin) en (5,0).
const monde = (niveauHoplite = 10, positions = {}) => {
    const fiches = [hoplite(niveauHoplite), fiche("A"), fiche("M"), fiche("B")];
    const pos = { H: { q: 0, r: 0 }, A: { q: 1, r: 0 }, M: { q: 2, r: 0 }, B: { q: 5, r: 0 }, ...positions };
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: fiches, positions: pos,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["H", "A", "M", "B"];
    e.phase = "Resolution";
    return e;
};
const enTete = (e, id, carte) => { e.file = [{ id, carte, initiative: 100, pas: 0 }, { id: "M", carte: "X", initiative: 10, pas: 0 }]; return e; };
const intention = (idCarte, cible) => ({ id: "I" + Math.random(), type: "classe", acteur: "H", idCarte, ...(cible ? { cible } : {}) });
const frapper = (e, cible, valeur, extra = {}) => resoudreCarte(e, {
    type: "carte", idLanceur: "M", idCarte: "C", critique: !!extra.critique,
    attaques: [{ valeurBrute: valeur, typeRes: extra.typeRes || "Physique", cibles: [cible] }],
    alterations: (extra.alterations || []).map(a => ({ ...a, cibles: [cible] })),
    jets: { attaqueRatee: false, parCible: { [cible]: { esquive: false,
            etats: Object.fromEntries((extra.alterations || []).map(a => [a.nom, true])) } } } });

console.log("\n=========================================================");
console.log("  L'HOPLITE");
// =========================================================================
console.log("\n1. LE PROTECTEUR (v347) : +8 PARADE, 10 % DE PROVOCATION ; NIV. 3 REMPART ; NIV. 5 +10 % ; NIV. 9 RÉSONANCE");
// =========================================================================
{
    const a1 = w.atoutClasse(hoplite(1)), a2 = w.atoutClasse(hoplite(2)), a3 = w.atoutClasse(hoplite(3)), a4 = w.atoutClasse(hoplite(4));
    const a5 = w.atoutClasse(hoplite(5)), a8 = w.atoutClasse(hoplite(8)), a9 = w.atoutClasse(hoplite(9)), a10 = w.atoutClasse(hoplite(10));
    verifier("niveau 1 : +8 parade, 10 % de provocation, pas de technique",
             a1.parade === 8 && a1.provocationAttaques === 10 && !a1.defPhysique && !(a1.techniques || []).length && !a1.bouclierLourdSansMalus, JSON.stringify(a1));
    verifier("niveau 2 : rien de plus ; niveau 3 : le Rempart (plus de Mur de bouclier)",
             !(a2.techniques || []).length && JSON.stringify(a3.techniques) === '["CLASSE_REMPART"]', JSON.stringify(a3.techniques));
    verifier("niveau 4 : encore 10 % ; niveau 5 : 20 % de provocation, boucliers lourds sans malus",
             a4.provocationAttaques === 10 && a5.provocationAttaques === 20 && a5.bouclierLourdSansMalus === true && a5.parade === 8, JSON.stringify(a5));
    verifier("niveau 8 : pas encore la Résonance ; niveau 9 : + la Résonance du bouclier",
             JSON.stringify(a8.techniques) === '["CLASSE_REMPART"]'
             && JSON.stringify(a9.techniques) === '["CLASSE_REMPART","CLASSE_RESONANCE_BOUCLIER"]', JSON.stringify(a9.techniques));
    verifier("niveau 10 : les mêmes (la classe s'arrête au 9)", JSON.stringify(a10) === JSON.stringify(a9));
    verifier("une fiche « Hoplite » est un Protecteur", w.nomActuelClasse("Hoplite") === "Protecteur"
             && w.estDeLaClasse({ classe: "Hoplite" }, "Protecteur"));
    verifier("la parade de la fiche monte de 8, la défense physique ne bouge plus",
             w.paradeCombattant(hoplite(1)) === w.paradeCombattant(fiche("X")) + 8
             && w.defPhysiqueCombattant(hoplite(1)) === w.defPhysiqueCombattant(fiche("X")));
    const e = monde(10);
    verifier("en combat : +8 de parade, techniques dans l'atout",
             e.combattants.H.def.parade === 8 && e.combattants.H.def.physique === 0
             && e.combattants.H.atouts.techniques.length === 2, JSON.stringify(e.combattants.H.def));
    const res = w.TECHNIQUES_CLASSE.CLASSE_RESONANCE_BOUCLIER;
    verifier("les cartes : Rempart init 105 niveau 3 (réserve 15), Résonance init 50 niveau 9, fatigue 0",
             w.carteTechniqueClasse("CLASSE_REMPART").Initiative === 105 && w.TECHNIQUES_CLASSE.CLASSE_REMPART.niveau === 3
             && w.carteTechniqueClasse("CLASSE_REMPART").Fatigue === 15
             && res.niveau === 9 && res.Initiative === 50 && res.Fatigue === 0 && res.classe === "Protecteur");
    // (Un Ondari : l'Humain a une compétence de plus depuis la v237.)
    verifier("la limite en main ne bouge pas (6)", w.competencesMaxCombattant(hoplite(10, { race: "Ondari" })) === 6);
}

// =========================================================================
console.log("\n2. MUR DE BOUCLIER : +60 DE PARADE JUSQU'À LA FIN DE LA MANCHE, UNE FOIS");
// =========================================================================
{
    w.ATOUTS_CLASSES.Protecteur.push({ niveau: 5, techniques: ["CLASSE_MUR_BOUCLIER"] });
    const e = enTete(monde(5), "H", "CLASSE_MUR_BOUCLIER");
    const i = intention("CLASSE_MUR_BOUCLIER");
    verifier("l'intention est acceptée", validerIntention(e, i).ok, validerIntention(e, i).raison);
    const pas = appliquerIntention(e, i);
    const h = pas.etat.combattants.H;
    verifier("+60 de parade sur soi (8 + 60)", paradeDe(h) === 68, String(paradeDe(h)));
    verifier("la technique est marquée « utilisée »", JSON.stringify(h.techniquesUtilisees) === '["CLASSE_MUR_BOUCLIER"]');
    verifier("elle occupe le tour : la file avance", pas.etat.file[0] && pas.etat.file[0].id === "M",
             JSON.stringify(pas.etat.file.map(f => f.id)));
    verifier("et ne coûte aucune énergie", h.fatigue === 100);
    verifier("l'état reste cohérent", verifierEtatCombat(pas.etat).length === 0, verifierEtatCombat(pas.etat).join(" | "));
    const rejoue = appliquerEntree(e, pas.entree).combattants.H;
    verifier("rejoué depuis le journal : même parade, même usage",
             paradeDe(rejoue) === 68 && JSON.stringify(rejoue.techniquesUtilisees) === '["CLASSE_MUR_BOUCLIER"]');
    const fin = clonerEtat(pas.etat);
    vieillirLesEtats(fin);
    verifier("à la fin de la manche, il tombe", paradeDe(fin.combattants.H) === 8, String(paradeDe(fin.combattants.H)));
    const encore = enTete(clonerEtat(pas.etat), "H", "CLASSE_MUR_BOUCLIER");
    verifier("une seconde fois dans le combat : refusée", !validerIntention(encore, intention("CLASSE_MUR_BOUCLIER")).ok,
             validerIntention(encore, intention("CLASSE_MUR_BOUCLIER")).raison);
    const niv4 = enTete(monde(4), "H", "CLASSE_MUR_BOUCLIER");
    verifier("niveau 4 : il ne l'a pas", !validerIntention(niv4, intention("CLASSE_MUR_BOUCLIER")).ok);
    const autreCarte = enTete(monde(5), "H", "COMP_x");
    verifier("pas si une autre carte a été choisie pour la manche", !validerIntention(autreCarte, intention("CLASSE_MUR_BOUCLIER")).ok);
    w.ATOUTS_CLASSES.Protecteur.pop();
    verifier("sans le palier rendu, plus personne ne l'a", !validerIntention(enTete(monde(10), "H", "CLASSE_MUR_BOUCLIER"), intention("CLASSE_MUR_BOUCLIER")).ok);
}

// =========================================================================
console.log("\n2 bis. RÉSONANCE DU BOUCLIER (v347) : 80 % D'ÉTOURDI, 15 % DES PV MAX DU PROTECTEUR");
// =========================================================================
{
    // H en (0,0) ; M au contact en (1,-1) ; N au contact en (-1,0) avec 50 % d'armure ;
    // A l'allié au contact (1,0) ; B loin.
    const fiches = [hoplite(10), fiche("A"), fiche("M", { PV_Max: 200, PV_Actuels: 200 }), fiche("MN", { PV_Max: 100, PV_Actuels: 100 }), fiche("B")];
    const pos = { H: { q: 0, r: 0 }, A: { q: 1, r: 0 }, M: { q: 1, r: -1 }, MN: { q: -1, r: 0 }, B: { q: 5, r: 0 } };
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: fiches, positions: pos,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["H", "A", "M", "MN", "B"]; e.phase = "Resolution";
    e.combattants.MN.def.physique = 50;
    enTete(e, "H", "CLASSE_RESONANCE_BOUCLIER");
    const i = intention("CLASSE_RESONANCE_BOUCLIER");
    verifier("niveau 10, des ennemis au contact : acceptée", validerIntention(e, i).ok, validerIntention(e, i).raison || "");
    verifier("niveau 9 : acceptée ; niveau 8 : il ne l'a pas", validerIntention(enTete(monde(9, { M: { q: 1, r: -1 } }), "H", "CLASSE_RESONANCE_BOUCLIER"), i).ok
             && !validerIntention(enTete(monde(8, { M: { q: 1, r: -1 } }), "H", "CLASSE_RESONANCE_BOUCLIER"), i).ok);
    const seul = enTete(monde(10, { M: { q: 4, r: 0 } }), "H", "CLASSE_RESONANCE_BOUCLIER");
    verifier("personne au contact : refusée (pas gâchée)", !validerIntention(seul, i).ok, validerIntention(seul, i).raison);
    const pas = appliquerIntention(e, i);
    const c = pas.etat.combattants;
    const etourdi = (x) => (x.etats || []).find(t => t.nom === "Étourdi");
    const etat2 = (x) => !!etourdi(x) || pas.entree.etapes.some(t => t.type === "etatRate" && t.cible === x.id);
    verifier(`M (200 PV) : ${PART_PV_RESONANCE} % des 100 PV max du Protecteur → 15 physiques ; Étourdi (2 manches) ou raté`,
             c.M.pv === 185 && etat2(c.M) && (!etourdi(c.M) || etourdi(c.M).duree === 2), `${c.M.pv} ${JSON.stringify(c.M.etats)}`);
    verifier("MN (100 PV, 50 % d'armure) : 15 → 8 (l'armure compte)", c.MN.pv === 92 && etat2(c.MN), String(c.MN.pv));
    verifier("ni l'allié au contact, ni un ennemi loin, ni lui", c.A.pv === 100 && !etourdi(c.A) && !etourdi(c.B) && c.H.pv === 100);
    verifier("les dégâts à coup sûr, sans fatigue, une fois par combat", c.H.fatigue === 100
             && !validerIntention(enTete(clonerEtat(pas.etat), "H", "CLASSE_RESONANCE_BOUCLIER"), i).ok);
    const rejoue = appliquerEntree(e, pas.entree).combattants;
    verifier("rejoué depuis le journal : mêmes PV, mêmes états", rejoue.M.pv === 185 && rejoue.MN.pv === 92
             && JSON.stringify(rejoue.M.etats) === JSON.stringify(c.M.etats));
    // Un Protecteur à 140 PV max : 21 de dégâts.
    const gros = clonerEtat(e); gros.combattants.H.pvMax = 140;
    verifier("un Protecteur à 140 PV max : 21 dégâts (15 % de SES PV max)",
             appliquerIntention(enTete(gros, "H", "CLASSE_RESONANCE_BOUCLIER"), i).etat.combattants.M.pv === 179);
    const titre = misEnScene(pas.entree.etapes.find(x => x.type === "techniqueClasse"), pas.etat);
    verifier("à l'écran : « 🛡️ Résonance du bouclier »", titre && /Résonance du bouclier/.test(titre.texte));
    // v260 : plus d'immunité — qui RÉSISTE à l'Étourdi a un dé du cerveau, à 75 %.
    const imm = clonerEtat(e); imm.combattants.M.atouts.resistances = ["Étourdi"];
    const pasR = appliquerIntention(enTete(imm, "H", "CLASSE_RESONANCE_BOUCLIER"), i);
    const ri = pasR.etat.combattants.M;
    verifier("qui résiste prend les dégâts ; l'Étourdi (pris, ou « résisté » dit)", ri.pv === 185
             && (etourdi(ri) ? true : pasR.entree.etapes.some(x => x.type === "etatRate" && x.cible === "M")));
    // Sur 400 graines : environ 80 % sans résistance, 55 % (80 − 25) avec.
    let pris = 0, prisR = 0;
    for (let g = 1; g <= 400; g++) {
        const s = clonerEtat(e); s.graine = g;
        if (etourdi(appliquerIntention(enTete(s, "H", "CLASSE_RESONANCE_BOUCLIER"), i).etat.combattants.M)) pris++;
        const r = clonerEtat(imm); r.graine = g;
        if (etourdi(appliquerIntention(enTete(r, "H", "CLASSE_RESONANCE_BOUCLIER"), i).etat.combattants.M)) prisR++;
    }
    verifier("…l'Étourdi prend environ 4 fois sur 5 (sur 400 graines)", Math.abs(pris / 400 - 0.8) < 0.06, `${pris}/400`);
    verifier("…et environ 55 % du temps sur qui y résiste (80 − 25)", Math.abs(prisR / 400 - 0.55) < 0.07, `${prisR}/400`);
}

// =========================================================================
console.log("\n3. REMPART : SUR UN ALLIÉ ADJACENT, POUR 4 MANCHES (v347)");
// =========================================================================
let protege;
{
    const e = enTete(monde(10), "H", "CLASSE_REMPART");
    const ok = (cible) => validerIntention(e, intention("CLASSE_REMPART", cible));
    verifier("sur l'allié adjacent : accepté", ok("A").ok, ok("A").raison);
    verifier("sur un allié trop loin : refusé", !ok("B").ok, ok("B").raison);
    verifier("sur un ennemi : refusé", !ok("M").ok);
    verifier("sur soi : refusé", !ok("H").ok);
    verifier("sans cible : refusé", !ok(undefined).ok);
    const pas = appliquerIntention(e, intention("CLASSE_REMPART", "A"));
    const etat = pas.etat.combattants.A.etats.find(x => x.nom === "Rempart");
    verifier("l'allié porte le Rempart, 4 manches, protégé par H",
             !!etat && etat.duree === 4 && etat.idProtecteur === "H", JSON.stringify(etat));
    verifier("la technique est marquée « utilisée »", pas.etat.combattants.H.techniquesUtilisees.includes("CLASSE_REMPART"));
    protege = pas.etat;
    const t = clonerEtat(protege);
    vieillirLesEtats(t); vieillirLesEtats(t); vieillirLesEtats(t);
    const reste3 = t.combattants.A.etats.some(x => x.nom === "Rempart");
    vieillirLesEtats(t);
    verifier("il tient 4 manches, puis s'éteint", reste3 && !t.combattants.A.etats.some(x => x.nom === "Rempart"));
}

// =========================================================================
console.log("\n4. LE PARTAGE DES COUPS");
// =========================================================================
{
    const r = frapper(protege, "A", 20);
    verifier("20 dégâts sur l'allié : 10 pour lui, 10 pour l'Hoplite",
             r.etat.combattants.A.pv === 90 && r.etat.combattants.H.pv === 90,
             `${r.etat.combattants.A.pv} / ${r.etat.combattants.H.pv}`);
    verifier("le pion de l'Hoplite dit « Rempart »", r.etapes.some(x => x.type === "message" && x.cible === "H" && /Rempart/.test(x.texte)));

    const impair = frapper(protege, "A", 7);
    verifier("7 dégâts : 3 pour l'allié, 4 pour l'Hoplite (il prend la moitié du haut)",
             impair.etat.combattants.A.pv === 97 && impair.etat.combattants.H.pv === 96);

    const arme = clonerEtat(protege);
    arme.combattants.H.def.physique = 50;
    const r2 = frapper(arme, "A", 20);
    verifier("chacun avec SES défenses (armure 50 % de l'Hoplite : 5)", r2.etat.combattants.A.pv === 90 && r2.etat.combattants.H.pv === 95,
             `${r2.etat.combattants.A.pv} / ${r2.etat.combattants.H.pv}`);

    // (Une créature ne critique jamais : on fait frapper M comme un héros.)
    const critique = clonerEtat(protege);
    critique.combattants.M.estMonstre = false;
    const crit = frapper(critique, "A", 20, { critique: true });
    // (Le Protecteur n'a plus d'armure de classe : 20 et 20.)
    verifier("un critique double chaque moitié (20 et 20)", crit.etat.combattants.A.pv === 80 && crit.etat.combattants.H.pv === 80,
             `${crit.etat.combattants.A.pv} / ${crit.etat.combattants.H.pv}`);

    const glace = frapper(protege, "A", 10, { alterations: [{ nom: "Glacé", chance: 100, duree: 2 }] });
    verifier("les états altérés ne restent que sur l'allié",
             glace.etat.combattants.A.etats.some(x => x.nom === "Glacé") && !glace.etat.combattants.H.etats.some(x => x.nom === "Glacé"));

    const loin = clonerEtat(protege);
    Object.assign(loin.combattants.A, { q: 4, r: 0 });
    const r3 = frapper(loin, "A", 20);
    verifier("éloignés : le Rempart dort (l'allié prend tout)", r3.etat.combattants.A.pv === 80 && r3.etat.combattants.H.pv === 100);
    const revenu = clonerEtat(loin);
    Object.assign(revenu.combattants.A, { q: 0, r: 1 });
    const r4 = frapper(revenu, "A", 20);
    verifier("rapprochés : il se réveille", r4.etat.combattants.A.pv === 90 && r4.etat.combattants.H.pv === 90);

    const tombe = clonerEtat(protege);
    Object.assign(tombe.combattants.H, { pv: 0, aTerre: true });
    verifier("Hoplite à terre : plus de partage", protecteurRempart(tombe, tombe.combattants.A) === null
             && frapper(tombe, "A", 20).etat.combattants.A.pv === 80);

    const tueur = frapper(protege, "A", 400);
    verifier("un coup énorme peut faire tomber les deux", tueur.etat.combattants.A.aTerre && tueur.etat.combattants.H.aTerre);

    // L'attaque d'opportunité : 8 bruts, 4 et 4.
    const opp = clonerEtat(protege);
    infligerOpportunite(opp, "A", "M", { attaquant: "M", cible: "A", evitee: false, montant: 8 }, { q: 1, r: 0 });
    verifier("attaque d'opportunité : 4 pour l'allié, 4 pour l'Hoplite",
             opp.combattants.A.pv === 96 && opp.combattants.H.pv === 96, `${opp.combattants.A.pv} / ${opp.combattants.H.pv}`);

    // Les tics de fin de manche, non.
    const tic = clonerEtat(protege);
    tic.combattants.A.etats.push({ nom: "Brûlé", duree: 2 });
    tic.file = [];
    ticsDeFinDeManche(tic);
    verifier("une brûlure (fin de manche) n'est pas partagée", tic.combattants.H.pv === 100 && tic.combattants.A.pv === 92,
             `${tic.combattants.A.pv} / ${tic.combattants.H.pv}`);

    const rejoue = appliquerEntree(protege, { etapes: r.etapes });
    verifier("rejoué depuis le journal : les deux PV", rejoue.combattants.A.pv === 90 && rejoue.combattants.H.pv === 90);

    const scene = misEnScene({ type: "techniqueClasse", acteur: "H", idCarte: "CLASSE_REMPART" }, protege);
    verifier("à l'écran : « 🛡️ Rempart » sur le pion de l'Hoplite", scene.geste === "message" && /Rempart/.test(scene.texte));
}

// =========================================================================
//  LA VRAIE PAGE
// =========================================================================
const RACINE = '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) {
    res.writeHead(404); res.end('non trouvé'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {};
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data }); };
  export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a});
  export const where = (...a) => ({a}); export const orderBy = (...a) => ({a});
  export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"><rect width="900" height="300" fill="#5a3a20"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

// =========================================================================
console.log("\n5. LA FICHE PERSO : LES TECHNIQUES DE CLASSE À PART");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
    const fiche = document.getElementById("fenetre-fiche-perso");
    fiche.style.display = "flex"; fiche.style.left = "2vw"; fiche.style.top = "20px";
    document.getElementById("champ-id-personnage").value = "H1";
    document.getElementById("titre-nom-personnage").textContent = "Léonidas";
    const bouton = [...document.querySelectorAll(".onglet-btn")].find(x => x.textContent.trim() === "Compétences");
    if (bouton) bouton.click();
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Léonidas", classe: "Hoplite", xp: 2500, couleur: "#335",
                              deckEquipe: ["C1"], PV_Max: 50 }];
    window.PERSOS_JOUEURS_PARTIE = window.PERSOS_PARTIE;
    window.CACHE_COMPETENCES_GLOBAL = { H1: { C1: { Nom: "Coup de lance", Arme: "Arme lourde CAC", Initiative: 40 } } };
    await window.chargerOngletCompetences("H1", 6);
    await new Promise(r => setTimeout(r, 200));
    const lire = () => ({
      section: !!document.getElementById("section-techniques-classe"),
      techniques: [...document.querySelectorAll(".technique-classe")].map(x => ({ id: x.dataset.technique,
          verrouillee: x.classList.contains("technique-classe-verrouillee"), badge: x.dataset.statut,
          cadre: document.getElementById("cadre-carte-" + x.dataset.technique)?.style.backgroundImage || "",
          banniere: x.classList.contains("banniere-carte") })),
      cadreJoueur: document.getElementById("cadre-carte-C1")?.style.backgroundImage || "",
      memorisees: document.getElementById("compteur-cartes-actuel")?.textContent,
      apresLeGrimoire: (() => { const s = document.getElementById("section-techniques-classe"); const ban = document.getElementById("ui-carte-C1");
                                 return !!s && !!ban && (ban.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) > 0; })()
    });
    const niv5 = lire();
    // Le premier clic d'une technique forgée met en avant et ouvre la carte ;
    // sur une technique de classe, deux clics ne la mémorisent jamais.
    const calque = document.querySelector('#ui-carte-CLASSE_REMPART [onclick]');
    calque.click(); calque.click();
    niv5.apercu = document.getElementById("apercu-carte-hd-competence")?.dataset.cardId || null;
    niv5.deckApres = [...window.CARTES_SELECTIONNEES];
    const sec = document.getElementById("section-techniques-classe");
    if (sec) sec.scrollIntoView();
    return niv5;
  });
  await p.screenshot({ path: "/tmp/claude-0/hoplite_fiche.png" });
  verifier("une section « Techniques de classe », après le grimoire", r.section && r.apresLeGrimoire, JSON.stringify(r));
  verifier("niveau 5 : Rempart acquis, Résonance du bouclier verrouillée (niveau 9)",
           JSON.stringify(r.techniques.map(t => [t.id, t.verrouillee])) === '[["CLASSE_REMPART",false],["CLASSE_RESONANCE_BOUCLIER",true]]'
           && /Niveau 9 requis/.test(r.techniques[1].badge), JSON.stringify(r.techniques));
  verifier("elles ne comptent pas dans les mémorisées (1 / 6)", r.memorisees === "1", r.memorisees);
  verifier("mêmes bannières que les techniques forgées (même cadre)",
           r.techniques.every(t => t.banniere) && /ban_cible/.test(r.cadreJoueur) && /bandeau_carte_normal/.test(r.techniques[0].cadre), r.techniques[0].cadre);
  verifier("la verrouillée prend le cadre épuisé", /ban_epuis/.test(r.techniques[1].cadre), r.techniques[1].cadre);
  verifier("un clic ouvre la carte en grand, sans la mémoriser",
           r.apercu === "CLASSE_REMPART" && JSON.stringify(r.deckApres) === '["C1"]', JSON.stringify([r.apercu, r.deckApres]));
  const necro = await p.evaluate(async () => {
    window.PERSOS_PARTIE[0].classe = "Élémentariste";
    await window.chargerOngletCompetences("H1", 7);
    return !!document.getElementById("section-techniques-classe");
  });
  verifier("une classe sans technique : pas de section", necro === false);
  // Nico : « les compétences de classe, fais-les apparaître dans la fiche
  // perso que quand une première compétence a été créée par le joueur ».
  const avantLaPremiere = await p.evaluate(async () => {
    window.PERSOS_PARTIE[0].classe = "Hoplite";
    window.CACHE_COMPETENCES_GLOBAL = { H1: {} };
    await window.chargerOngletCompetences("H1", 6);
    const sans = { section: !!document.getElementById("section-techniques-classe"),
                   invitation: /pas encore forgé/.test(document.getElementById("liste-competences-perso").textContent) };
    window.CACHE_COMPETENCES_GLOBAL = { H1: { C1: { Nom: "Coup de lance", Arme: "Arme lourde CAC", Initiative: 40 } } };
    await window.chargerOngletCompetences("H1", 6);
    return { sans, avec: !!document.getElementById("section-techniques-classe") };
  });
  verifier("aucune compétence forgée : pas encore de techniques de classe, seulement l'invitation",
           avantLaPremiere.sans.section === false && avantLaPremiere.sans.invitation, JSON.stringify(avantLaPremiere.sans));
  verifier("la première forgée : la section apparaît", avantLaPremiere.avec === true);
}

// =========================================================================
console.log("\n6. EN COMBAT : LES BANNIÈRES, LE CHOIX, LE LANCEMENT");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    document.getElementById("fenetre-fiche-perso").style.display = "none";
    document.getElementById("fenetre-combat").style.display = "block";
    window.PERSOS_PARTIE = [
      { idPersonnage: "H1", prenom: "Léonidas", classe: "Hoplite", xp: 7900, couleur: "#335", camp: "Allié",
        deckEquipe: ["C1"], PV_Max: 50, PV_Actuels: 50, Fatigue_Max: 100, fatigueActuelle: 100, techniquesUtilisees: ["CLASSE_RESONANCE_BOUCLIER"] },
      { idPersonnage: "A1", prenom: "Cybile", camp: "Allié", PV_Max: 40, PV_Actuels: 40 },
      { idPersonnage: "A2", prenom: "Jade", camp: "Allié", PV_Max: 40, PV_Actuels: 40 },
      { idPersonnage: "M1", prenom: "Gnoll", camp: "Ennemi", estMonstre: true, PV_Max: 40, PV_Actuels: 40 }
    ];
    window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, A1: { q: 1, r: 0 }, A2: { q: 4, r: 0 }, M1: { q: 0, r: 1 } };
    window.CACHE_COMPETENCES_GLOBAL = { H1: { C1: { Nom: "Coup de lance", Arme: "", Initiative: 40, Fatigue: 10, Effets_Compiles: [] } } };
    window.COMPETENCES_CACHE = {};
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]]; window.COMBAT_INDEX_PERSO = 0;
    window.COMBAT_FATIGUE_ACTUELLE = 100;
    window.PARTIE_DATA = { Phase_Combat: "Preparation", File_Attente_Combat: [] };
    window.ID_PARTIE_COURANTE = "P";
    try { window.chargerCompetencesCombat("H1", "#335"); } catch (e) { return { erreur: e.message }; }
    await new Promise(r => setTimeout(r, 100));
    const ban = (id) => document.getElementById("combat-carte-" + id);
    const bannieres = ["C1", "CLASSE_REMPART", "CLASSE_RESONANCE_BOUCLIER", "REPOS_LONG"].map(id => !!ban(id));
    const murGrise = ban("CLASSE_RESONANCE_BOUCLIER").classList.contains("banniere-epuisee");
    const rempartLibre = !ban("CLASSE_REMPART").classList.contains("banniere-epuisee");
    const ordre = [...document.querySelectorAll("#combat-liste-competences .banniere-carte-combat")].map(x => x.dataset.cardId);
    // Le Rempart est joué PENDANT que le volet est ouvert : la fiche le dit,
    // le rafraîchissement doit le griser sans redessiner le volet.
    window.PERSOS_PARTIE[0].techniquesUtilisees = ["CLASSE_RESONANCE_BOUCLIER", "CLASSE_REMPART"];
    window.actualiserBannieresEpuisees();
    const rempartGriseApres = ban("CLASSE_REMPART").classList.contains("banniere-epuisee");
    window.PERSOS_PARTIE[0].techniquesUtilisees = ["CLASSE_RESONANCE_BOUCLIER"];
    window.actualiserBannieresEpuisees();
    const rempartRendu = !ban("CLASSE_REMPART").classList.contains("banniere-epuisee");
    const look = (id) => { const b = ban(id); const nom = b.querySelector(".texte-nom-banniere");
        return { cadre: document.getElementById("cadre-combat-" + id).style.backgroundImage, couleur: nom.style.color, nom: nom.textContent }; };
    const lookJoueur = look("C1"), lookRempart = look("CLASSE_REMPART");

    const alertes = []; window.alert = (m) => alertes.push(m);
    let ecrit = null;
    window.modifierPartieOuEchec = async (f) => { const r = f({ Phase_Combat: "Preparation", File_Attente_Combat: [] }); ecrit = r && r.maj; return { ok: true }; };
    window.avecCarteJouee = (d, id) => [id]; window.toutLeMondeAJoue = () => false;
    await window.jouerCarteCombat("CLASSE_RESONANCE_BOUCLIER");
    const refusMur = alertes.slice();
    await window.jouerCarteCombat("CLASSE_REMPART");
    const file = ecrit && ecrit.File_Attente_Combat;

    // Son tour venu : le Rempart demande l'allié adjacent.
    const demandes = [];
    window.regimeDemande = { actif: () => true, enVol: () => false,
                             techniqueClasse: (a, id, cible) => { demandes.push([a, id, cible || null]); } };
    window.lancerTechniqueClasse("CLASSE_REMPART", "H1");
    const fen = document.getElementById("fenetre-choix-rempart");
    const proposes = [...fen.querySelectorAll(".choix-rempart-allie span")].map(x => x.textContent);
    const visible = getComputedStyle(fen).display !== "none";
    fen.querySelector(".choix-rempart-allie").click();
    window.lancerTechniqueClasse("CLASSE_RESONANCE_BOUCLIER", "H1");
    return { rempartGriseApres, rempartRendu, lookJoueur, lookRempart, bannieres, murGrise, rempartLibre, ordre, refusMur, file, proposes, visible, demandes,
             donnees: window.donneesCarteCombattant("H1", "CLASSE_REMPART").Nom };
  });
  verifier("le volet montre le deck, puis les deux techniques, puis le repos long",
           !r.erreur && JSON.stringify(r.ordre) === '["C1","CLASSE_REMPART","CLASSE_RESONANCE_BOUCLIER","REPOS_LONG"]', JSON.stringify(r.ordre || r.erreur));
  verifier("Résonance déjà jouée : grisée ; Rempart : libre", r.murGrise && r.rempartLibre);
  verifier("joué pendant que le volet est ouvert : grisé au rafraîchissement", r.rempartGriseApres && r.rempartRendu);
  verifier("en combat, même bannière que les techniques du joueur (cadre, couleur, nom nu)",
           r.lookRempart && r.lookRempart.cadre === r.lookJoueur.cadre && r.lookRempart.couleur === r.lookJoueur.couleur
           && r.lookRempart.nom === "Rempart", JSON.stringify([r.lookJoueur, r.lookRempart]));
  verifier("choisir la Résonance déjà jouée : refusée, avec un message", r.refusMur.length === 1 && /déjà servi/.test(r.refusMur[0]), JSON.stringify(r.refusMur));
  verifier("choisir le Rempart : inscrit dans la file à l'initiative 105",
           Array.isArray(r.file) && r.file.length === 1 && r.file[0].idCarte === "CLASSE_REMPART" && r.file[0].initiative === 105,
           JSON.stringify(r.file));
  verifier("son tour venu : seuls les alliés adjacents sont proposés", r.visible && JSON.stringify(r.proposes) === '["Cybile"]',
           JSON.stringify(r.proposes));
  verifier("le clic envoie le Rempart sur cet allié ; la Résonance part sans cible",
           JSON.stringify(r.demandes) === '[["H1","CLASSE_REMPART","A1"],["H1","CLASSE_RESONANCE_BOUCLIER",null]]', JSON.stringify(r.demandes));
  verifier("les autres postes savent nommer la technique", r.donnees === "Rempart");
}

// =========================================================================
console.log("\n7. LA FICHE DE CLASSE : LE DESCRIPTIF DU PROTECTEUR");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    document.getElementById("fenetre-combat").style.display = "none";
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    await window.ouvrirChoixClasse();
    window.ouvrirFicheClasse("CLASSE_PROTECTEUR");
    const d = document.getElementById("descriptif-fiche-classe");
    return { visible: getComputedStyle(d).display !== "none",
             niveaux: [...d.querySelectorAll(".palier-classe-niveau")].map(x => x.textContent.trim()), texte: d.textContent };
  });
  await p.screenshot({ path: "/tmp/claude-0/hoplite_classe.png" });
  verifier("présentation et paliers Niv. 1 / 3 / 5 / 9 (v347)", r.visible && JSON.stringify(r.niveaux) === '["Niv. 1","Niv. 3","Niv. 5","Niv. 9"]',
           JSON.stringify(r.niveaux));
  verifier("Rempart, Résonance, +8 % de parade, provocation, boucliers lourds y sont dits — plus de Mur",
           /Rempart/.test(r.texte) && /Résonance du bouclier/.test(r.texte) && /\+8 % de parade/.test(r.texte)
           && /provoquer/.test(r.texte) && /boucliers lourds/.test(r.texte) && /réserve 15/.test(r.texte) && !/Mur de bouclier/.test(r.texte));
}

// =========================================================================
console.log("\n8. 10 % DE PROVOCATION SUR CHACUNE DE SES ATTAQUES (20 % AU NIVEAU 5)");
// =========================================================================
{
  const r = await p.evaluate(() => {
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", camp: "Allié", classe: "Protecteur", xp: 0 },
                            { idPersonnage: "A1", camp: "Allié" }, { idPersonnage: "M1", camp: "Ennemi", estMonstre: true }];
    const lanceur = window.PERSOS_PARTIE[0];
    const enrichir = (state, qui = lanceur) => { window.appliquerEquipementALaCarte(state, qui, ""); return state.alterations || []; };
    const coup = () => ({ attaques: [{ nom: "Coup", valeurBrute: 5, typeRes: "Physique", cibles: ["M1", "A1"] }], alterations: [] });
    const simple = enrichir(coup());
    const dejaFaible = enrichir({ ...coup(), alterations: [{ nom: "Provocation", chance: 5, cibles: ["M1"] }] });
    const dejaForte = enrichir({ ...coup(), alterations: [{ nom: "Provocation", chance: 40, cibles: ["M1"] }] });
    const soin = enrichir({ attaques: [{ nom: "Soin", valeurBrute: 5, isHeal: true, cibles: ["A1"] }], alterations: [] });
    const autre = enrichir(coup(), { idPersonnage: "X", camp: "Allié", classe: "Oracle", xp: 0 });
    const ancien = enrichir(coup(), { idPersonnage: "H2", camp: "Allié", classe: "Hoplite", xp: 0 });
    const niv5 = enrichir(coup(), { idPersonnage: "H3", camp: "Allié", classe: "Protecteur", xp: 2500 });
    return { simple, dejaFaible, dejaForte, soin, autre, ancien, niv5 };
  });
  const prov = (l) => l.find(a => a.nom === "Provocation");
  verifier("une attaque : Provocation 10 %, sur l'ennemi frappé seulement, au nom du Protecteur",
           prov(r.simple) && prov(r.simple).chance === 10 && JSON.stringify(prov(r.simple).cibles) === '["M1"]'
           && prov(r.simple).idProvocateur === "H1" && prov(r.simple).duree === 2, JSON.stringify(r.simple));
  verifier("une carte qui provoquait à 5 % : montée à 10", prov(r.dejaFaible).chance === 10 && r.dejaFaible.length === 1);
  verifier("niveau 5 : 20 % de provocation", prov(r.niv5) && prov(r.niv5).chance === 20, JSON.stringify(r.niv5));
  verifier("une carte qui provoquait à 40 % : garde 40", prov(r.dejaForte).chance === 40);
  verifier("un soin : aucune provocation", !prov(r.soin));
  verifier("une autre classe : rien", !prov(r.autre));
  verifier("un héros resté « Hoplite » sur sa fiche provoque aussi", prov(r.ancien) && prov(r.ancien).chance === 10);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
