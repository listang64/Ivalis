// LA CLASSE CHASSEUR DE MAGES.
//
// Nico : « lvl1 : +10 % Résistance magique (passé à 13 % ensuite). lvl5 : SKILL Lumière. lvl10 : tous
// les sorts de lumière ont 30 % de chance d'aveugler la cible et tous les
// personnages adjacents. Nouvel effet de combat : Lumières (CHASSEUR DE MAGE),
// 1 pt, INTELLIGENCE, 15 % de chance d'ignorer la résistance magique de la
// cible sur ce sort (max 60 %). »
// Ses réponses : un sous-effet, dans les menus Magique et Physique, posable
// seulement sur une action à dégâts magiques ; un jet par cible, imposé par un
// critique ; réservé à la classe dès le niveau 5, jamais aux monstres ; au
// niveau 10, un jet par cible touchée, qui aveugle la cible et les ENNEMIS
// qui la touchent, pas d'esquive pour les voisins, l'Aveuglement normal.
//
// Puis, Nico : « chasseur de mage : lvl1 : +10% Résistance magique / SKILL :
// Lumière : 15% chance d'ignorer la résistance magique de la cible sur ce sort
// (Max 60%) et 8% chance d'aveugler /// lvl5 : Compétence : Bouclier
// anti-magie : 0 fatigue, sur deux tours renvoie tous les dégâts magiques à la
// cible, INIT 200 /// lvl10 : Appel de la lumière, 0 fatigue, aveugle tous les
// combattants sur la map. » (Et : « Appel de la lumière aveugle tout le monde
// sur le champ de bataille », lui compris.) L'aveuglement de la Lumière ne prend plus que sa
// cible.
//
// Puis (v237), Nico : « Lumière ne doit plus être un effet de combat. À la
// place, le Chasseur de mages niv.1 gagne le passif Maîtrise de la lumière :
// 33 % de chances d'aveugler avec un sort de foudre (fixe, ne s'additionne pas
// avec l'effet aveugler). » Les cartes déjà forgées avec Lumière gardent leur
// effet (passer outre la défense magique) : la section 2 le vérifie encore.
//
// Puis (v356, la refonte des classes), Nico : « NIVEAU 1 : +10 % Résistance
// magique, +2 dégâts physiques contre les monstres de type Mage et Soutien.
// NIVEAU 3 : +10 % Résistance magique, +1 compétence. NIVEAU 5 : Bouclier
// anti-magie (renvoie à l'expéditeur tous les dégâts magiques, INIT 200,
// réserve 20 pour 2 tours). NIVEAU 9 : Briseur d'arcane (une fois par combat,
// inflige à la cible 1,5× sa résistance magique en dégâts bruts, INIT 100). »
// Ses réponses : la Maîtrise de la lumière est retirée ; le +2 sur toutes ses
// attaques ; le Bouclier tient 2 manches tant qu'il est maintenu, et lui ne
// prend rien ; le Briseur vise un ennemi à 5 cases, en vue (il remplace
// l'Appel de la lumière).
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree } from '../combat_etat.js';
import { resoudreCarte, tirerDesCarte, defMagiqueDe, ETAT_ANTIMAGIE, reserveMaintenueDe, bonusContreRace } from '../moteur_pur.js';
import { degatsOpportuniteBruts } from '../mouvement_pur.js';
import { validerIntention, appliquerIntention, vieillirLesEtats, cloturerTour } from '../cerveau_combat.js';
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
const XP = { 1: 0, 3: 1200, 4: 1800, 5: 2500, 8: 5200, 9: 6400, 10: 7900 };
const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const chasseur = (niveau, extra = {}) => fiche("C", { classe: "Chasseur de mages", xp: XP[niveau], ...extra });

// C en (0,0) ; M1 (la cible) en (2,0) ; M2 (2,-1) et M3 (3,0) touchent M1 ;
// A (allié de C) en (1,1) touche M1 aussi ; M4 (6,0) loin.
const monde = (niveau = 10) => {
    const fiches = [chasseur(niveau), fiche("M1"), fiche("M2"), fiche("M3"), fiche("M4"), fiche("A")];
    const pos = { C: { q: 0, r: 0 }, M1: { q: 2, r: 0 }, M2: { q: 2, r: -1 }, M3: { q: 3, r: 0 }, M4: { q: 6, r: 0 }, A: { q: 1, r: 1 } };
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: fiches, positions: pos,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["C", "M1", "M2", "M3", "M4", "A"];
    e.phase = "Resolution";
    Object.values(e.combattants).forEach(c => { if (c.id.startsWith("M")) c.def.magique = 50; });
    return e;
};
// Des dés qui tombent toujours sur 1 (tout réussit), ou toujours sur 100.
const desA = (v) => ({ d100: () => v, parmi: (l) => l[0], fraction: () => 0, graine: () => 1 });
const sort = (chance, extra = {}) => ({ type: "carte", idLanceur: "C", idCarte: "S", critique: !!extra.critique,
    attaques: [{ nom: "Attaque Magique", valeurBrute: 10, typeRes: extra.typeRes || "Magique", rangeMax: 3,
                 ...(chance ? { chanceLumiere: chance, iconeAveugle: "oeil.svg" } : {}), cibles: ["M1"] }],
    alterations: [] });
const jouer = (e, action, des) => resoudreCarte(e, { ...action, jets: tirerDesCarte(e, action, "C", action.critique, des) });
const aveugle = (c) => (c.etats || []).find(x => x.nom === "Aveuglé");

console.log("\n=========================================================");
console.log("  LE CHASSEUR DE MAGES");
// =========================================================================
console.log("\n1. LES PALIERS (v356) : +10 % RÉS. MAGIQUE ET +2 CONTRE MAGES/SOUTIENS, +10 % ET +1 COMPÉTENCE, BOUCLIER, BRISEUR");
// =========================================================================
{
    const a = (n) => w.atoutClasse(chasseur(n));
    verifier("niveau 1 : +10 de défense magique, +2 contre Mages/Soutiens, plus de Maîtrise de la lumière",
             a(1).defMagique === 10 && a(1).degatsContreMages === 2 && !a(1).maitriseLumiere && !(a(1).techniques || []).length, JSON.stringify(a(1)));
    verifier("niveau 3 : +20 de défense magique en tout, +1 compétence", a(3).defMagique === 20 && a(3).competences === 1, JSON.stringify(a(3)));
    verifier("niveau 5 : le Bouclier anti-magie", JSON.stringify(a(5).techniques) === '["CLASSE_BOUCLIER_ANTIMAGIE"]');
    verifier("niveau 9 : + le Briseur d'arcane (pas au 8) ; plus d'Appel de la lumière",
             JSON.stringify(a(9).techniques) === '["CLASSE_BOUCLIER_ANTIMAGIE","CLASSE_BRISEUR_ARCANE"]'
             && !(a(8).techniques || []).includes("CLASSE_BRISEUR_ARCANE") && !w.TECHNIQUES_CLASSE.CLASSE_APPEL_LUMIERE);
    const ba = w.TECHNIQUES_CLASSE.CLASSE_BOUCLIER_ANTIMAGIE, br = w.TECHNIQUES_CLASSE.CLASSE_BRISEUR_ARCANE;
    verifier("Bouclier anti-magie : init 200, aucune fatigue, sur soi, réserve 20 × 2",
             ba.Initiative === 200 && ba.Fatigue === 0 && ba.cible === "soi" && ba.niveau === 5
             && ba.reserve && ba.reserve.parTour === 20 && ba.reserve.tours === 2);
    verifier("Briseur d'arcane : init 100, aucune fatigue, un ennemi à 5 cases, visé sur le plateau",
             br.Initiative === 100 && br.Fatigue === 0 && br.cible === "ennemi" && br.portee === 5 && br.niveau === 9
             && !!w.TECHNIQUES_VISEES.CLASSE_BRISEUR_ARCANE);
    verifier("la fiche annonce +10 puis +20 de résistance magique",
             w.defMagiqueCombattant(chasseur(1)) === w.defMagiqueCombattant(fiche("X")) + 10
             && w.defMagiqueCombattant(chasseur(3)) === w.defMagiqueCombattant(fiche("X")) + 20);
    verifier("le texte du +2", /\+2 dégâts contre les monstres Mage et Soutien/.test(w.texteAtout("degatsContreMages", 2)));
    const e = monde(1);
    verifier("en combat : défense magique 10, +2 contre Mages", defMagiqueDe(e.combattants.C) === 10 && e.combattants.C.atouts.degatsContreMages === 2);
}

// =========================================================================
console.log("\n2. UNE CARTE DÉJÀ FORGÉE AVEC LUMIÈRE : LE SORT PASSE OUTRE LA DÉFENSE MAGIQUE");
// =========================================================================
{
    const sansLumiere = jouer(monde(5), sort(0), desA(100)).etat.combattants.M1.pv;
    verifier("sans Lumière : 10 magiques sur 50 % de défense → 5", sansLumiere === 95, String(sansLumiere));
    const prend = jouer(monde(5), sort(60), desA(1)).etat.combattants.M1.pv;
    verifier("Lumière qui prend : les 10, sans défense magique", prend === 90, String(prend));
    const rate = jouer(monde(5), sort(15), desA(50)).etat.combattants.M1.pv;
    verifier("Lumière qui rate (50 > 15) : la défense compte", rate === 95, String(rate));
    const crit = monde(5);
    const r = jouer(crit, sort(15, { critique: true }), desA(50)).etat.combattants.M1.pv;
    verifier("un critique l'impose (20 sans défense)", r === 80, String(r));
    const phys = monde(5);
    phys.combattants.M1.def.physique = 50;
    verifier("sur un coup physique, elle ne fait rien", jouer(phys, sort(60, { typeRes: "Physique" }), desA(1)).etat.combattants.M1.pv === 95);
    // Une carte sans Lumière ne tire pas un dé de plus.
    let tires = 0;
    tirerDesCarte(monde(10), sort(0), "C", false, { ...desA(100), d100: () => { tires++; return 100; } });
    verifier("une carte sans Lumière ne consomme aucun dé de plus", tires === 1, `${tires} dé(s)`);
    const e = monde(5);
    const action = sort(60);
    const pas = jouer(e, action, desA(1));
    verifier("rejoué depuis le journal : mêmes PV", appliquerEntree(e, { etapes: pas.etapes }).combattants.M1.pv === 90);
}

// =========================================================================
console.log("\n3. +2 CONTRE LES MONSTRES MAGE ET SOUTIEN (v356)");
// =========================================================================
{
    const archetypes = (e, m1, m2) => { e.combattants.M1.archetype = m1; e.combattants.M2.archetype = m2; return e; };
    const fiches = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, regles: REGLES, partie: { Tour_Combat: 1 },
        combattants: [chasseur(1), fiche("M1", { Archetype: "SOUTIEN" })], positions: { C: { q: 0, r: 0 }, M1: { q: 1, r: 0 } } });
    verifier("l'archétype d'une créature entre dans le combat", fiches.combattants.M1.archetype === "SOUTIEN");
    const e = monde(1);
    verifier("contre DPS MAGE CAC, DPS MAGE DISTANCE, SOUTIEN : +2 ; contre TANK CAC, DPS DISTANCE ou sans type : rien",
             ["DPS MAGE CAC", "DPS MAGE DISTANCE", "SOUTIEN"].every(t => bonusContreRace(e.combattants.C, { archetype: t }) === 2)
             && ["TANK CAC", "DPS DISTANCE", "DPS CAC", ""].every(t => bonusContreRace(e.combattants.C, { archetype: t }) === 0));
    verifier("un autre héros : rien", bonusContreRace(monde(1).combattants.A, { archetype: "SOUTIEN" }) === 0);
    // Un coup physique de 10 (défenses à 0) sur un Soutien : 12 ; sur un Tank : 10.
    const coup = (typeRes) => ({ type: "carte", idLanceur: "C", idCarte: "S", critique: false,
        attaques: [{ nom: "Coup", valeurBrute: 10, typeRes, rangeMax: 3, cibles: ["M1", "M2"] }], alterations: [],
        jets: { attaqueRatee: false, parCible: { M1: { esquive: false, etats: {} }, M2: { esquive: false, etats: {} } } } });
    const r = resoudreCarte(archetypes(monde(1), "SOUTIEN", "TANK CAC"), coup("Physique"));
    verifier("un coup de 10 : le Soutien prend 12, le Tank 10", r.etat.combattants.M1.pv === 88 && r.etat.combattants.M2.pv === 90,
             `${r.etat.combattants.M1.pv} / ${r.etat.combattants.M2.pv}`);
    const m = archetypes(monde(1), "DPS MAGE DISTANCE", "DPS CAC");
    m.combattants.M1.def.magique = 0; m.combattants.M2.def.magique = 0;
    const rm = resoudreCarte(m, coup("Magique"));
    verifier("un sort aussi (toutes ses attaques) : le Mage prend 12", rm.etat.combattants.M1.pv === 88 && rm.etat.combattants.M2.pv === 90);
    const base = degatsOpportuniteBruts(monde(1).combattants.A, { archetype: "SOUTIEN" });
    verifier("l'attaque d'opportunité : +2 contre un Soutien",
             degatsOpportuniteBruts(e.combattants.C, { archetype: "SOUTIEN" }) === base + 2
             && degatsOpportuniteBruts(e.combattants.C, { archetype: "TANK CAC" }) === base);
}

// =========================================================================
console.log("\n3 bis. LE BOUCLIER ANTI-MAGIE : LES SORTS REPARTENT SUR LEUR LANCEUR");
// =========================================================================
{
    const enTete = (e, id, carte) => { e.file = [{ id, carte, initiative: 200, pas: 0 }, { id: "M1", carte: "X", initiative: 10, pas: 0 }]; return e; };
    const bouclier = { id: "B1", type: "classe", acteur: "C", idCarte: "CLASSE_BOUCLIER_ANTIMAGIE" };
    const e = enTete(monde(5), "C", "CLASSE_BOUCLIER_ANTIMAGIE");
    verifier("niveau 5 : accepté", validerIntention(e, bouclier).ok, validerIntention(e, bouclier).raison || "");
    verifier("niveau 4 : il ne l'a pas", !validerIntention(enTete(monde(4), "C", "CLASSE_BOUCLIER_ANTIMAGIE"), bouclier).ok);
    const pas = appliquerIntention(e, bouclier);
    const etat = (pas.etat.combattants.C.etats || []).find(x => x.nom === ETAT_ANTIMAGIE);
    const tenu = (pas.etat.combattants.C.etats || []).find(x => x.maintien === "CLASSE_BOUCLIER_ANTIMAGIE");
    verifier("l'état sur lui, 2 manches ; 20 d'énergie payés au lancement (100 → 80)", etat && etat.duree === 2
             && pas.etat.combattants.C.fatigue === 80 && tenu && tenu.reserve === 20 && tenu.duree === 2 && !tenu.sansRelache,
             `${pas.etat.combattants.C.fatigue} ${JSON.stringify(tenu)}`);
    const pauvre = enTete(monde(5), "C", "CLASSE_BOUCLIER_ANTIMAGIE"); pauvre.combattants.C.fatigue = 19;
    verifier("19 d'énergie : refusé (il en faut 20)", !validerIntention(pauvre, bouclier).ok);
    verifier("une fois par combat", !validerIntention(enTete(clonerEtat(pas.etat), "C", "CLASSE_BOUCLIER_ANTIMAGIE"), bouclier).ok);
    const titre = misEnScene(pas.entree.etapes.find(x => x.type === "techniqueClasse"), pas.etat);
    verifier("à l'écran : « 🔮 Bouclier anti-magie »", titre && /Bouclier anti-magie/.test(titre.texte));

    // M1 lui lance 20 magiques : M1 les prend (50 % de défense → 10), lui rien.
    const frappe = (typeRes, valeur = 20) => resoudreCarte(clonerEtat(pas.etat), { type: "carte", idLanceur: "M1", idCarte: "X", critique: false,
        attaques: [{ nom: "Boule", valeurBrute: valeur, typeRes, isRanged: true, rangeMax: 3, cibles: ["C"] }], alterations: [],
        jets: { attaqueRatee: false, parCible: { C: { esquive: false, etats: {} } } } });
    const r = frappe("Magique");
    verifier("un sort sur lui : il ne prend rien", r.etat.combattants.C.pv === 100, String(r.etat.combattants.C.pv));
    verifier("le lanceur prend son propre sort, avec ses défenses (20 → 10)", r.etat.combattants.M1.pv === 90, String(r.etat.combattants.M1.pv));
    verifier("ça se dit : « 🔮 Renvoyé ! »", r.etapes.some(x => x.type === "message" && /Renvoyé/.test(x.texte)));
    verifier("rejoué depuis le journal : mêmes PV", appliquerEntree(pas.etat, { etapes: r.etapes }).combattants.M1.pv === 90);
    const phys = frappe("Physique");
    verifier("un coup physique, lui, le touche", phys.etat.combattants.C.pv === 80 && phys.etat.combattants.M1.pv === 100,
             `${phys.etat.combattants.C.pv} / ${phys.etat.combattants.M1.pv}`);
    // Deux boucliers face à face : le coup renvoyé ne repart pas.
    const deux = clonerEtat(pas.etat);
    deux.combattants.M1.etats = [{ nom: ETAT_ANTIMAGIE, duree: 2 }];
    const ping = resoudreCarte(deux, { type: "carte", idLanceur: "M1", idCarte: "X", critique: false,
        attaques: [{ nom: "Boule", valeurBrute: 20, typeRes: "Magique", cibles: ["C"] }], alterations: [],
        jets: { attaqueRatee: false, parCible: { C: { esquive: false, etats: {} } } } });
    verifier("deux boucliers face à face : renvoyé une fois, pas de ping-pong", ping.etat.combattants.M1.pv === 90 && ping.etat.combattants.C.pv === 100);
    const vieux = clonerEtat(pas.etat);
    vieillirLesEtats(vieux);
    const encore = (vieux.combattants.C.etats || []).some(x => x.nom === ETAT_ANTIMAGIE);
    vieillirLesEtats(vieux);
    verifier("il tient la manche en cours et la suivante", encore && !(vieux.combattants.C.etats || []).some(x => x.nom === ETAT_ANTIMAGIE));

    // La manche suivante : 20 bloqués puis consommés en fin de manche.
    const suite = clonerEtat(pas.etat);
    suite.combattants.C.atouts.regenFatigue = -1000;     // pas de régénération : on lit la réserve seule
    suite.file = [{ id: "M1", carte: "X", initiative: 10, pas: 0 }];
    const fin1 = cloturerTour(suite, { d100: () => 100, parmi: (l) => l[0], fraction: () => 0, graine: () => 1 });
    const apres1 = (fin1 && fin1.etat) || suite;
    const tenu2 = (apres1.combattants.C.etats || []).find(x => x.maintien === "CLASSE_BOUCLIER_ANTIMAGIE");
    verifier("la manche suivante : la réserve de 20 est bloquée", tenu2 && reserveMaintenueDe(apres1.combattants.C) === 20,
             JSON.stringify(apres1.combattants.C.etats));
    // À court d'énergie : il tombe, et le bouclier avec.
    const court = clonerEtat(apres1);
    court.combattants.C.fatigue = 5; court.combattants.C.atouts.regenFatigue = -1000;
    court.file = [{ id: "M1", carte: "X", initiative: 10, pas: 0 }];
    const fin2 = cloturerTour(court, { d100: () => 100, parmi: (l) => l[0], fraction: () => 0, graine: () => 1 });
    const apres2 = (fin2 && fin2.etat) || court;
    verifier("à court d'énergie (5 < 20) : le bouclier tombe",
             !(apres2.combattants.C.etats || []).some(x => x.nom === ETAT_ANTIMAGIE || x.maintien === "CLASSE_BOUCLIER_ANTIMAGIE"),
             JSON.stringify(apres2.combattants.C.etats));
}

// =========================================================================
console.log("\n3 ter. LE BRISEUR D'ARCANE (v356) : 1,5 × LA RÉSISTANCE MAGIQUE EN DÉGÂTS BRUTS");
// =========================================================================
{
    const enTete = (e) => { e.file = [{ id: "C", carte: "CLASSE_BRISEUR_ARCANE", initiative: 100, pas: 0 }, { id: "M1", carte: "X", initiative: 10, pas: 0 }]; return e; };
    const briseur = (cible) => ({ id: "BR", type: "classe", acteur: "C", idCarte: "CLASSE_BRISEUR_ARCANE", cible });
    const e = enTete(monde(9));                 // M1 : 50 % de résistance magique, à 2 cases
    verifier("niveau 9 : accepté sur M1", validerIntention(e, briseur("M1")).ok, validerIntention(e, briseur("M1")).raison || "");
    verifier("niveau 8 : il ne l'a pas", !validerIntention(enTete(monde(8)), briseur("M1")).ok);
    verifier("M4 à 6 cases : refusé ; un allié : refusé ; sans cible : refusé",
             !validerIntention(e, briseur("M4")).ok && !validerIntention(e, briseur("A")).ok && !validerIntention(e, briseur()).ok);
    const ko = enTete(monde(9)); ko.combattants.M1.aTerre = true;
    verifier("un KO : refusé", !validerIntention(ko, briseur("M1")).ok);
    const mur = { etatCase: (q, r) => ({ bloquee: q === 1 && r === 0, supprimee: false, difficile: false }) };
    verifier("derrière un mur (pas de ligne de vue) : refusé", !validerIntention(e, briseur("M1"), mur).ok);
    const pas = appliquerIntention(e, briseur("M1"));
    verifier("M1 (50 % de résistance magique) prend 75 bruts", pas.etat.combattants.M1.pv === 25, String(pas.etat.combattants.M1.pv));
    verifier("aucune fatigue, une fois par combat", pas.etat.combattants.C.fatigue === 100
             && !validerIntention(enTete(clonerEtat(pas.etat)), briseur("M2")).ok);
    verifier("rejoué depuis le journal : mêmes PV", appliquerEntree(e, pas.entree).combattants.M1.pv === 25);
    const titre = misEnScene(pas.entree.etapes.find(x => x.type === "techniqueClasse"), pas.etat);
    verifier("à l'écran : « 💥 Briseur d'arcane »", titre && /Briseur d'arcane/.test(titre.texte));
    const impair = enTete(monde(9)); impair.combattants.M1.def.magique = 15;
    verifier("15 % de résistance : 22 (arrondi en dessous)", appliquerIntention(impair, briseur("M1")).etat.combattants.M1.pv === 78);
    const rien = enTete(monde(9)); rien.combattants.M1.def.magique = 0;
    verifier("aucune résistance : aucun dégât", appliquerIntention(rien, briseur("M1")).etat.combattants.M1.pv === 100);
    const esq = enTete(monde(9)); esq.combattants.M1.def.esquive = 100;
    verifier("ni esquive ni parade : il touche quand même", appliquerIntention(esq, briseur("M1")).etat.combattants.M1.pv === 25);
    const mage = enTete(monde(9)); mage.combattants.M1.archetype = "SOUTIEN";
    verifier("contre un Soutien : +2 (77)", appliquerIntention(mage, briseur("M1")).etat.combattants.M1.pv === 23);
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
  export const getDoc = async (ref) => { const d = (window.__docs || {})[ref.chemin]; return { exists: () => !!d, data: () => d || {} }; };
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
const EFFETS = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/effets_reels.json', 'utf-8'));
const EFFETS_PAR_ID = Object.fromEntries((Array.isArray(EFFETS) ? EFFETS : Object.values(EFFETS)).map(e => [e.id, e]));
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
console.log("\n4. LA FORGE : PLUS DE LUMIÈRE, POUR PERSONNE (v237) ; LES CARTES DÉJÀ FORGÉES LA GARDENT");
// =========================================================================
{
  const r = await p.evaluate(async (EFFETS) => {
    window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
    delete window.EFFETS_BDD_CACHE.EFF_LUMIERE;
    window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
    const forgePour = async (perso) => {
      window.__docs = { "Personnages/P1": perso, "Caracteristiques/P1": {} };
      document.getElementById("champ-id-personnage").value = "P1";
      window.OUVERTURE_FORGE_EN_COURS = false;
      await window.ouvrirCreationCompetence();
      return (window.forgeState.effetsBDD || []).map(e => e.id);
    };
    const c4 = await forgePour({ Classe: "Chasseur de mages", XP: 0, Race: "Humain" });
    window.fermerForgeCompetence();
    const autre = await forgePour({ Classe: "Protecteur", XP: 9000, Race: "Humain" });
    window.fermerForgeCompetence();
    const c5 = await forgePour({ Classe: "Chasseur de mages", XP: 2500, Race: "Humain" });
    window.forgeState.armePrincipale = "Magie";
    const menus = (idEffet) => {
      window.forgeState.actions = [];
      window.ajouterComposantPrincipal(idEffet);
      // Une Attaque Magique demande son élément (elements_magiques.mjs).
      if (getComputedStyle(document.getElementById("modale-choix-element")).display === "block") window.choisirElementForge("Feu");
      // Les menus de sous-effets sont des menus maison (plus des <select>).
      return [...document.querySelectorAll("#forge-contenu-carte .forge-menu")].map(m => [...m.querySelectorAll(".forge-menu-option")]
        .filter(o => /Lumi/.test(o.textContent)).map(o => (m.querySelector(".forge-menu-bouton").textContent.trim() + " : "
          + o.textContent.replace(/\s+/g, " ").trim() + (o.classList.contains("incompatible") ? " [X]" : ""))))
        .flat();
    };
    const surMagique = menus("EFF_ATTAQUE_MAGIQUE");
    window.forgeState.armePrincipale = "Arme légère CAC";
    const surPhysique = menus("EFF_ATTAQUE_LEGERE");
    window.forgeState.armePrincipale = "Magie";
    const surSoin = menus("EFF_SOIN");
    window.fermerForgeCompetence();
    return { c4: c4.includes("EFF_LUMIERE"), autre: autre.includes("EFF_LUMIERE"), c5: c5.includes("EFF_LUMIERE"),
             surMagique, surPhysique, surSoin, monstres: window.paletteEffetsMonstres().some(e => e.id === "EFF_LUMIERE") };
  }, EFFETS_PAR_ID);
  verifier("le Chasseur de mages ne l'a plus dans la Forge (niveau 1 ni 5)", !r.c5 && !r.c4);
  verifier("ni une autre classe", !r.autre);
  verifier("ni les monstres", !r.monstres);
  verifier("aucun menu ne la propose plus (Attaque Magique, attaque physique, soin)",
           r.surMagique.length === 0 && r.surPhysique.length === 0 && r.surSoin.length === 0,
           JSON.stringify([r.surMagique, r.surPhysique, r.surSoin]));

  const ex = await p.evaluate(async () => {
    window.PERSOS_PARTIE = [{ idPersonnage: "C1", camp: "Allié", prenom: "Varn", classe: "Chasseur de mages", xp: 2500,
                              PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }];
    window.TOKENS_VTT_DATA = { C1: { q: 0, r: 0 } };
    window.COMPETENCES_CACHE = { S1: { Nom: "Rayon", Arme: "Magie", Fatigue: 10, Initiative: 50,
      Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 2, mods: { EFF_LUMIERE: 2 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } },
      S2: { Nom: "Lame", Arme: "Arme légère CAC", Fatigue: 10, Initiative: 50,
      Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_LEGERE", count: 1, mods: { EFF_LUMIERE: 4 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } },
      S3: { Nom: "Rayon max", Arme: "Magie", Fatigue: 10, Initiative: 50,
      Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 1, mods: { EFF_LUMIERE: 6 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } } };
    window.CACHE_COMPETENCES_GLOBAL = { C1: window.COMPETENCES_CACHE };
    const lire = async (id) => ((await window.demarrerCiblage(id, { extraire: true, idLanceur: "C1" })) || {}).attaques || [];
    return { s1: (await lire("S1"))[0], s2: (await lire("S2"))[0], s3: (await lire("S3"))[0] };
  });
  verifier("une Attaque Magique avec Lumière ×2 part avec 30 % de chance", ex.s1 && ex.s1.chanceLumiere === 30, JSON.stringify(ex.s1).slice(0, 150));
  verifier("plafonnée à 60 % (×6 → 60)", ex.s3 && ex.s3.chanceLumiere === 60);
  verifier("une attaque physique n'emporte aucune Lumière", ex.s2 && !ex.s2.chanceLumiere);
}

// =========================================================================
console.log("\n5. LA FICHE DE CLASSE");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    await window.ouvrirChoixClasse();
    window.ouvrirFicheClasse("CLASSE_CHASSEUR_DE_MAGES");
    const d = document.getElementById("descriptif-fiche-classe");
    return { visible: getComputedStyle(d).display !== "none",
             niveaux: [...d.querySelectorAll(".palier-classe-niveau")].map(x => x.textContent.trim()), texte: d.textContent };
  });
  await p.screenshot({ path: "/tmp/claude-0/chasseur_classe.png" });
  verifier("présentation et paliers Niv. 1 / 3 / 5 / 9", r.visible && JSON.stringify(r.niveaux) === '["Niv. 1","Niv. 3","Niv. 5","Niv. 9"]', JSON.stringify(r.niveaux));
  verifier("résistance magique, +2 contre Mages/Soutiens, Bouclier anti-magie (réserve), Briseur d'arcane y sont dits",
           /\+10 % de résistance magique/.test(r.texte) && /Mage et Soutien/.test(r.texte) && /Bouclier anti-magie/.test(r.texte)
           && /Réserve : 20/.test(r.texte) && /Briseur d'arcane/.test(r.texte) && !/Appel de la lumière/.test(r.texte) && !/Maîtrise de la lumière/.test(r.texte));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
