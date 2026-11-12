// LA CLASSE CHAMAN (v368, la dernière) : les totems.
//
// Nico : « NIVEAU 1 : création de 1 totem supplémentaire, +1 aux soins, +5 PV. NIVEAU 3 : 1 totem
// supplémentaire, +1 compétence. NIVEAU 5 : 1 totem supplémentaire ; les totems ne coûtent plus que
// fatigue 60, réserve 10. NIVEAU 9 : PV des totems 20 ; Renforcement chamanique (soigne tous les
// totems, réinitialise leur durée, init 100). TOTEMS : fatigue 65, réserve 15, initiative 20, PV 15,
// portée 2, durée 5 tours ; un effet au choix dans une zone autour ; deux totems sans obstacle entre
// eux (4 cases au plus) sont reliés par un faisceau vert : qui le traverse subit les deux effets ;
// avec 3 totems, chaque liaison. Les totems ne se soignent pas ; un bouclier, oui. »
// Ses réponses : 1 case autour (2 pour l'Immobilisation et l'Attraction), à l'entrée et en fin de
// manche ; les effets néfastes touchent tout le monde ; une technique réutilisable (fatigue au
// lancement, réserve par totem) ; Renforcement : 0 fatigue, une fois par combat.
//
// Lancer : node tests_monstres/chaman.mjs
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree } from '../combat_etat.js';
import { resoudreCarte, familleDeZone } from '../moteur_pur.js';
import { validerIntention, appliquerIntention, cloturerTour } from '../cerveau_combat.js';
import { EFFETS_TOTEM, TOTEM, zonesVoulues, totemsRelies, casesEntre } from '../totems_pur.js';
import { resoudreMouvement } from '../mouvement_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(70)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const w = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/experience.js', 'utf-8'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);
const REGLES = {
    pvMax: w.pvMaxCombattant, fatigueMax: w.fatigueMaxCombattant,
    esquive: w.esquiveCombattant, parade: w.paradeCombattant,
    defPhysique: w.defPhysiqueCombattant, defMagique: w.defMagiqueCombattant,
    critique: w.critiqueCombattant, atouts: w.atoutRace, bonusEquip: w.bonusEquip
};
const XP = { 1: 0, 3: 1200, 5: 2500, 9: 6400 };
const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 200, Fatigue_Actuelle: 200,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const chaman = (niveau, extra = {}) => fiche("C", { classe: "Chaman", xp: XP[niveau], PV_Max: 95, PV_Actuels: 100, ...extra });
const POS = { C: { q: 0, r: 0 }, M1: { q: 5, r: 0 }, M2: { q: 0, r: 4 }, A: { q: -1, r: 0 } };
const monde = (niveau = 5, extraC = {}) => {
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 7, regles: REGLES, partie: { Tour_Combat: 1 }, positions: POS,
        combattants: [chaman(niveau, extraC), fiche("M1"), fiche("M2"), fiche("A")] });
    e.ordre = ["C", "M1", "M2", "A"]; e.phase = "Resolution";
    return e;
};
const auTour = (e, id = "C", carte = "CLASSE_TOTEM") => { e.file = [{ id, carte, initiative: 20, pas: 0 }, { id: "M1", carte: "X", initiative: 1, pas: 0 }]; return e; };
const totem = (id, q, r, effet) => ({ id: `T${id}`, type: "classe", acteur: "C", idCarte: "CLASSE_TOTEM", totem: { id: `TOTEM_${id}`, q, r, effet } });
const poser = (e, id, q, r, effet) => {
    const intention = totem(id, q, r, effet);
    const v = validerIntention(auTour(e), intention);
    if (!v.ok) return { refus: v.raison || v.motif || JSON.stringify(v) };
    return appliquerIntention(auTour(e), intention);
};
const rejouer = (avant, pas) => appliquerEntree(avant, pas.entree);

console.log("\n1. LES PALIERS, LES TECHNIQUES");
{
    const a = (n) => w.atoutClasse(chaman(n));
    verifier("niveau 1 : 1 totem, +1 soin, +5 PV, la technique Totem", a(1).totemsMax === 1 && a(1).bonusSoin === 1 && a(1).pvMax === 5
             && JSON.stringify(a(1).techniques) === '["CLASSE_TOTEM"]', JSON.stringify(a(1)));
    verifier("niveau 3 : 2 totems, +1 compétence", a(3).totemsMax === 2 && a(3).competences === 1);
    verifier("niveau 5 : 3 totems, coût allégé", a(5).totemsMax === 3 && a(5).totemsAlleges === true);
    verifier("niveau 9 : totems à 20 PV, le Renforcement chamanique", a(9).totemPvBonus === 5 && a(9).techniques.includes("CLASSE_RENFORCEMENT_CHAMANIQUE"));
    const t = w.TECHNIQUES_CLASSE.CLASSE_TOTEM, r = w.TECHNIQUES_CLASSE.CLASSE_RENFORCEMENT_CHAMANIQUE;
    verifier("Totem : init 20, fatigue 65, portée 2, réutilisable", t.Initiative === 20 && t.Fatigue === 65 && t.portee === 2 && t.reutilisable && t.cible === "totem");
    verifier("Renforcement : init 100, 0 fatigue, niveau 9", r.Initiative === 100 && r.Fatigue === 0 && r.niveau === 9);
    verifier("douze effets, quatre par caractéristique", Object.keys(EFFETS_TOTEM).length === 12
             && ["cha", "sag", "int"].every(k => Object.values(EFFETS_TOTEM).filter(e => e.carac === k).length === 4));
    verifier("les textes", /totem/.test(w.texteAtout("totemsMax", 1)) && /60/.test(w.texteAtout("totemsAlleges", true)) && /20 PV/.test(w.texteAtout("totemPvBonus", 5)));
}

console.log("\n2. LA POSE : LE TOTEM, SA FATIGUE, SA RÉSERVE, SA ZONE");
{
    const e = monde(1);
    const pas = poser(e, "A1", 2, 0, "cha_poison");
    verifier("posé à 2 cases", !pas.refus, pas.refus);
    const c = pas.etat.combattants;
    const t = c.TOTEM_A1;
    verifier("un combattant du camp du Chaman, 15 PV, 5 manches, sans tour (comme un leurre)",
             t && t.camp === "Allié" && t.pv === 15 && t.pvMax === 15 && t.totem.tours === 5 && t.estIllusion && t.totem.effet === "cha_poison", JSON.stringify(t && t.totem));
    verifier("65 de fatigue payés (200 → 135), 15 bloqués en réserve", c.C.fatigue === 135
             && c.C.etats.some(x => x.maintien === "CLASSE_TOTEM" && x.idTotem === "TOTEM_A1" && x.reserve === 15));
    const z = pas.etat.zones.zt_TOTEM_A1;
    verifier("sa zone : les 6 cases autour de lui, à part des autres zones", z && z.hexes.length === 6 && familleDeZone(z) === "totem", z && z.hexes.length);
    const rejoue = rejouer(auTour(monde(1)), pas);
    verifier("le rejeu d'un autre poste arrive au même totem et à la même zone", !!rejoue.combattants.TOTEM_A1 && !!rejoue.zones.zt_TOTEM_A1
             && rejoue.combattants.C.fatigue === 135);
    // Les refus.
    const e2 = pas.etat;
    verifier("niveau 1 : un seul totem à la fois", /1 totem au plus/.test(poser(clonerEtat(e2), "A2", -2, 0, "cha_peur").refus || ""));
    verifier("pas à 3 cases", /2 cases au plus/.test(poser(monde(1), "B", 3, 0, "cha_peur").refus || ""));
    verifier("pas sur une case occupée", /occupée/.test(poser(monde(1), "B", -1, 0, "cha_peur").refus || ""));
    verifier("un effet inconnu est refusé", /effet inconnu/.test(poser(monde(1), "B", 1, 0, "rien").refus || ""));
    verifier("à court d'énergie (79 < 80) : refusé", /il faut 80/.test(poser(monde(1, { Fatigue_Actuelle: 79 }), "B", 1, 0, "cha_peur").refus || ""));
    verifier("niveau 5 : le prix allégé (60 + 10)", poser(monde(5, { Fatigue_Actuelle: 70 }), "B", 1, 0, "cha_peur").etat.combattants.C.fatigue === 10);
    verifier("niveau 9 : 20 PV par totem", poser(monde(9), "B", 1, 0, "cha_peur").etat.combattants.TOTEM_B.pv === 20);
}

console.log("\n3. LES EFFETS DANS LA ZONE (TOUT LE MONDE, ALLIÉS SEULS POUR LE SOIN)");
{
    // Une marche dans la zone d'un totem de poison à 100 % (chance forcée).
    const avecChance = (effet, chance) => { const sauve = EFFETS_TOTEM[effet].chance; EFFETS_TOTEM[effet].chance = chance; return () => { EFFETS_TOTEM[effet].chance = sauve; }; };
    const remettre = avecChance("cha_poison", 100);
    const e = poser(monde(5), "P", 2, 0, "cha_poison").etat;
    const r = resoudreMouvement(e, { idLanceur: "M1", chemin: [{ q: 4, r: 0 }, { q: 3, r: 0 }] }, { d100: () => 50, fraction: () => 0.1, parmi: (l) => l[0] });
    verifier("un ennemi qui entre dans la zone : empoisonné", (r.etat.combattants.M1.etats || []).some(x => x.nom === "Empoisonnement"), JSON.stringify(r.etat.combattants.M1.etats));
    const r2 = resoudreMouvement(e, { idLanceur: "A", chemin: [{ q: 0, r: 1 }, { q: 1, r: 1 }] }, { d100: () => 50, fraction: () => 0.1, parmi: (l) => l[0] });
    verifier("…un allié aussi (les effets néfastes touchent tout le monde)", (r2.etat.combattants.A.etats || []).some(x => x.nom === "Empoisonnement"));
    verifier("le totem lui-même n'en subit rien", !(e.combattants.TOTEM_P.etats || []).length);
    remettre();
    // Le soin : alliés seuls, en fin de manche.
    const s = poser(monde(5), "S", -1, 1, "sag_soin").etat;
    s.combattants.A.pv = 50; s.combattants.C.pv = 60;
    s.combattants.M2.q = -1; s.combattants.M2.r = 2; s.combattants.M2.pv = 40;
    const fin = cloturerTour(Object.assign(s, { file: [{ id: "C", carte: "X", initiative: 1, pas: 0 }] }));
    const apres = fin.etapes.reduce((acc, et) => acc, null);
    void apres;
    verifier("fin de manche : +3 PV à l'allié et au Chaman dans la zone", s.combattants.A.pv === 53 && s.combattants.C.pv === 63, `${s.combattants.A.pv} / ${s.combattants.C.pv}`);
    verifier("…rien pour l'ennemi qui s'y tient", s.combattants.M2.pv === 40);
    verifier("…et le totem a une manche de moins", s.combattants.TOTEM_S.totem.tours === 4);
}

console.log("\n4. LES FAISCEAUX");
{
    const e = poser(monde(3), "L1", 2, 0, "cha_poison").etat;
    const e2 = poser(e, "L2", -2, 2, "int_brulure").etat;
    const lien = Object.values(e2.zones).find(z => z.type === "totem-lien");
    verifier("deux totems à 4 cases : un faisceau entre eux, leurs deux effets", !!lien && lien.totemEffets.length === 2 && lien.entreeSeule, JSON.stringify(lien && lien.hexes));
    verifier("ses cases : la ligne entre les deux (sans eux)", lien && JSON.stringify(lien.hexes) === JSON.stringify(casesEntre({ q: 2, r: 0 }, { q: -2, r: 2 })));
    verifier("plus de 4 cases : pas de faisceau", !totemsRelies(e2, { q: 0, r: 0 }, { q: 5, r: 0 }, null));
    const mur = { etatCase: (q, r) => ({ bloquee: q === 0 && r === 1 }) };
    verifier("un mur entre eux : pas de faisceau", !totemsRelies(e2, { q: 2, r: 0 }, { q: -2, r: 2 }, mur) && totemsRelies(e2, { q: 2, r: 0 }, { q: -2, r: 2 }, null));
    // Traverser le faisceau : les deux effets (à 100 %).
    const s1 = EFFETS_TOTEM.cha_poison.chance, s2 = EFFETS_TOTEM.int_brulure.chance;
    EFFETS_TOTEM.cha_poison.chance = 100; EFFETS_TOTEM.int_brulure.chance = 100;
    const caseLien = lien.hexes[0];
    e2.combattants.M2.q = caseLien.q + 1; e2.combattants.M2.r = caseLien.r - 3;
    const chemin = [];
    // M2 marche jusqu'à une case du faisceau (hors des zones des totems).
    const hors = lien.hexes.find(h => !e2.zones.zt_TOTEM_L1.hexes.concat(e2.zones.zt_TOTEM_L2.hexes).some(x => x.q === h.q && x.r === h.r));
    if (hors) {
        e2.combattants.M2.q = hors.q; e2.combattants.M2.r = hors.r + 1;
        if (e2.combattants.M2.q === 0 && e2.combattants.M2.r === 0) e2.combattants.M2.r = 3;
        chemin.push({ q: hors.q, r: hors.r });
        const r = resoudreMouvement(e2, { idLanceur: "M2", chemin }, { d100: () => 50, fraction: () => 0.1, parmi: (l) => l[0] });
        const noms = (r.etat.combattants.M2.etats || []).map(x => x.nom);
        verifier("qui traverse le faisceau subit les deux effets (poison et brûlure)", noms.includes("Empoisonnement") && noms.includes("Brûlé"), JSON.stringify(noms));
    } else verifier("une case du faisceau hors des zones", false, JSON.stringify(lien.hexes));
    EFFETS_TOTEM.cha_poison.chance = s1; EFFETS_TOTEM.int_brulure.chance = s2;
    // Trois totems : chaque paire reliée.
    const e3 = poser(poser(poser(monde(5, { Fatigue_Max: 300, Fatigue_Actuelle: 300 }), "X", 2, 0, "cha_peur").etat, "Y", -2, 2, "sag_soin").etat, "Z", 0, -2, "int_gel").etat;
    verifier("trois totems : un faisceau par paire reliée", Object.values(e3.zones).filter(z => z.type === "totem-lien").length === 3,
             Object.keys(e3.zones).join(","));
    verifier("niveau 5 : pas de quatrième totem", /3 totems au plus/.test(poser(clonerEtat(e3), "W", 1, 0, "cha_peur").refus || ""));
}

console.log("\n5. NI SOIN, MAIS UN BOUCLIER ; LA CHUTE ; LA FIN ; LE RENFORCEMENT");
{
    const e = poser(monde(9), "K", 2, 0, "cha_peur").etat;
    e.combattants.TOTEM_K.pv = 5;
    const soin = resoudreCarte(e, { type: "carte", idLanceur: "A", idCarte: "S", critique: false,
        attaques: [{ nom: "Soin", valeurBrute: 10, isHeal: true, rangeMax: 5, cibles: ["TOTEM_K"] }], alterations: [],
        jets: { attaqueRatee: false, parCible: { TOTEM_K: { esquive: false, etats: {} } } } }).etat;
    verifier("un soin sur un totem : refusé", soin.combattants.TOTEM_K.pv === 5);
    const bouclier = resoudreCarte(e, { type: "carte", idLanceur: "A", idCarte: "B", critique: false,
        attaques: [{ nom: "Bouclier", valeurBrute: 8, isHeal: true, isShield: true, rangeMax: 5, cibles: ["TOTEM_K"] }], alterations: [],
        jets: { attaqueRatee: false, parCible: { TOTEM_K: { esquive: false, etats: {} } } } }).etat;
    verifier("un bouclier, oui", bouclier.combattants.TOTEM_K.bouclier === 8);
    // Renforcement.
    const r = appliquerIntention(auTour(clonerEtat(e), "C", "CLASSE_RENFORCEMENT_CHAMANIQUE"), { id: "R", type: "classe", acteur: "C", idCarte: "CLASSE_RENFORCEMENT_CHAMANIQUE" });
    verifier("le Renforcement : PV pleins (20), 5 manches", r.etat.combattants.TOTEM_K.pv === 20 && r.etat.combattants.TOTEM_K.totem.tours === 5);
    const v2 = validerIntention(auTour(clonerEtat(r.etat), "C", "CLASSE_RENFORCEMENT_CHAMANIQUE"), { id: "R2", type: "classe", acteur: "C", idCarte: "CLASSE_RENFORCEMENT_CHAMANIQUE" });
    verifier("…une fois par combat", !v2.ok);
    // La chute : frappé à zéro, il rend sa réserve et éteint sa zone.
    const coup = appliquerIntention(Object.assign(clonerEtat(e), { file: [{ id: "M1", carte: "X", initiative: 5, pas: 0 }, { id: "C", carte: "Y", initiative: 1, pas: 0 }] }),
        { id: "COUP", type: "carte", acteur: "M1", idCarte: "X", coutFatigue: 0,
          attaques: [{ nom: "Coup", valeurBrute: 30, typeRes: "Physique", rangeMax: 9, isRanged: true, cibles: ["TOTEM_K"] }], alterations: [] });
    const c = coup.etat.combattants;
    verifier("frappé à zéro : il tombe, la réserve revient, sa zone s'éteint", c.TOTEM_K && c.TOTEM_K.aTerre && !c.C.etats.some(x => x.idTotem === "TOTEM_K")
             && !coup.etat.zones.zt_TOTEM_K, JSON.stringify({ aTerre: c.TOTEM_K && c.TOTEM_K.aTerre, pv: c.TOTEM_K && c.TOTEM_K.pv }));
    // La fin : 5 manches.
    let f = poser(monde(5), "F", 1, 0, "cha_peur").etat;
    for (let k = 0; k < 5; k++) cloturerTour(Object.assign(f, { file: [{ id: "C", carte: "X", initiative: 1, pas: 0 }] }));
    verifier("après 5 fins de manche : le totem s'en va, sa réserve aussi", f.combattants.TOTEM_F.aTerre && !f.combattants.C.etats.some(x => x.idTotem === "TOTEM_F") && !f.zones.zt_TOTEM_F,
             JSON.stringify(f.combattants.TOTEM_F.totem));
}

console.log(`\n${echecs ? echecs + " CONTRÔLE(S) EN ÉCHEC" : "TOUS LES CONTRÔLES PASSENT"}`);
process.exit(echecs ? 1 : 0);
