// v349 — LA REFONTE DES CLASSES : LE VAMPIRE.
// Nico : « niveau 1 : +15 % de résistance physique ; BRÛLURE : −60 % de soins reçus et des
// dégâts physiques équivalents à 10 % de ses PV max ; résistance au gel. Niveau 3 : Baiser du
// vampire. Niveau 5 : annule le malus de BRÛLURE, +3 dégâts contre les Vargens. Niveau 9 :
// Nuée de chauves-souris (40, une fois par combat : esquive à 40 % sur soi, 2 tours, RENVOI 33 %
// DES DÉGÂTS SUBIS, 33 DE RÉSERVE, INIT 100). Les Vargens ne peuvent pas être Vampire. »
// Ses réponses : la Nuée coûte 40 et une réserve de 33 par manche sur ses 2 manches ; au
// niveau 5, il brûle comme tout le monde ; le Baiser reste une fois par combat ; le +3 vaut
// pour toutes ses attaques. (Paliers et brûlure : vampire.mjs.)
//
// Lancer : node tests_monstres/corrections_v349.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree , creerDes } from '../combat_etat.js';
import { resoudreCarte, regleDesEtats, esquiveDe, ETAT_NUEE, chanceEtatDe , reserveMaintenueDe, RENVOI_NUEE } from '../moteur_pur.js';
import { validerIntention, appliquerIntention, vieillirLesEtats, ticsDeFinDeManche , cloturerTour } from '../cerveau_combat.js';
import { coutDuPas, planifierTrajet , degatsOpportuniteBruts, resoudreOpportunite } from '../mouvement_pur.js';
import { misEnScene } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const w = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/experience.js', 'utf-8'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);
// Les effets de classe que le jeu apporte lui-même (hors du bloc des stats).
{
    const app = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8');
    const d = app.indexOf("window.MIGRATION_EFFETS = [");
    new Function('window', app.slice(d, app.indexOf("\n];", d) + 3))(w);
}
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
const vampire = (niveau, extra = {}) => fiche("V", { classe: "Vampire", xp: XP[niveau], ...extra });

// V en (0,0) ; M1 (1,0) et M2 (1,-1) au contact ; A, un allié, en (0,1) ; H, un
// héros sans classe, en (-3,0).
const monde = (niveau = 10, extraV = {}) => {
    const fiches = [vampire(niveau, extraV), fiche("M1"), fiche("M2"), fiche("A"), fiche("H")];
    const pos = { V: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 1, r: -1 }, A: { q: 0, r: 1 }, H: { q: -3, r: 0 } };
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: fiches, positions: pos,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["V", "M1", "M2", "A", "H"];
    e.phase = "Resolution";
    return e;
};
const enTete = (e, id, carte) => { e.file = [{ id, carte, initiative: 100, pas: 0 }, { id: "M1", carte: "X", initiative: 10, pas: 0 }]; return e; };
const BRULE = { nom: "Brûlé", duree: 3 };
// Une carte du Vampire, dés posés à la main : personne n'esquive sauf `esquivent`.
const carte = (attaques, esquivent = []) => {
    const ids = [...new Set(attaques.flatMap(a => a.cibles))];
    return { type: "carte", idLanceur: "V", idCarte: "C", critique: false, attaques, alterations: [],
             jets: { attaqueRatee: false, parCible: Object.fromEntries(ids.map(id => [id, { esquive: esquivent.includes(id), etats: {} }])) } };
};
const sort = (valeur, cibles, extra = {}) => ({ nom: "Vampirisme", valeurBrute: valeur, typeRes: "Magique", vampirisme: 70, cibles, ...extra });
const soinDuVampire = (r) => r.etapes.filter(x => x.type === "soin" && x.cible === "V" && x.vampirisme).reduce((s, x) => s + x.montant, 0);


const lireFichier = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8');
const nuee = () => ({ id: "N" + Math.random(), type: "classe", acteur: "V", idCarte: "CLASSE_NUEE_CHAUVES_SOURIS" });
const maintien = (c) => (c.etats || []).find(x => x && x.maintien === "CLASSE_NUEE_CHAUVES_SOURIS");
const aNuee = (c) => (c.etats || []).some(x => x && x.nom === ETAT_NUEE);
const finDeManche = (e) => { const s = clonerEtat(e); s.file = [{ id: "M1", carte: "X", initiative: 1, pas: 0 }];
    const clot = cloturerTour(s, creerDes(s.graine)); return { etat: s, etapes: clot.etapes }; };
const coup = (lanceur, cible, valeur, extra = {}) => ({ type: "carte", idLanceur: lanceur, idCarte: "C", critique: false, alterations: [],
    attaques: [{ valeurBrute: valeur, typeRes: extra.typeRes || "Physique", cibles: [cible], ...(extra.attaque || {}) }],
    jets: { attaqueRatee: false, parCible: { [cible]: { esquive: !!extra.esquive, etats: {} } } } });

console.log("\n1. LA NUÉE : 40 AU LANCEMENT, PLUS 33 PAR MANCHE SUR SES 2 MANCHES");
{
    const e = enTete(monde(9), "V", "CLASSE_NUEE_CHAUVES_SOURIS");
    e.combattants.V.stats = { ...(e.combattants.V.stats || {}), Regeneration: 0 };
    e.combattants.V.fatigue = 72;
    verifier("à 72 d'énergie : refusée (40 + 33 = 73)", !validerIntention(e, nuee()).ok, validerIntention(e, nuee()).raison);
    e.combattants.V.fatigue = 100;
    const pas = appliquerIntention(e, nuee());
    const V = pas.etat.combattants.V, m = maintien(V);
    verifier("lancée : 100 → 27 (40 de coût, 33 pour sa première manche)", V.fatigue === 27, String(V.fatigue));
    verifier("« Nuée maintenue » : 33 par manche, 2 manches, la première payée", !!m && m.reserve === 33 && m.duree === 2 && m.dejaPaye === true
             && m.liens[0].cible === "V" && m.liens[0].nom === ETAT_NUEE, JSON.stringify(m));
    const f1 = finDeManche(pas.etat);
    verifier("fin de la 1re manche : rien de pris, 33 bloqués pour la suivante", f1.etat.combattants.V.fatigue === 27
             && reserveMaintenueDe(f1.etat.combattants.V) === 33 && aNuee(f1.etat.combattants.V));
    const riche = clonerEtat(f1.etat); riche.combattants.V.fatigue = 60;
    const f2 = finDeManche(riche);
    verifier("fin de la 2e manche : 33 consommés (60 → 27), puis la Nuée s'en va", f2.etat.combattants.V.fatigue === 27
             && !aNuee(f2.etat.combattants.V) && !maintien(f2.etat.combattants.V), String(f2.etat.combattants.V.fatigue));
    const pauvre = finDeManche(f1.etat);
    verifier("27 d'énergie, 33 à payer : à court — la Nuée se dissipe, rien n'est pris",
             !aNuee(pauvre.etat.combattants.V) && pauvre.etat.combattants.V.fatigue === 27 && pauvre.etapes.some(x => x.type === "message" && /à court/.test(x.texte)));
    verifier("la carte de l'écran annonce 73", w.carteTechniqueClasse("CLASSE_NUEE_CHAUVES_SOURIS").Fatigue === 73);
}

console.log("\n2. LA NUÉE RENVOIE 33 % DES DÉGÂTS SUBIS");
{
    const base = appliquerIntention(enTete(monde(9), "V", "CLASSE_NUEE_CHAUVES_SOURIS"), nuee()).etat;
    base.combattants.V.def.physique = 0; base.combattants.V.pv = 100;
    const r = resoudreCarte(clonerEtat(base), coup("M1", "V", 30));
    verifier("30 subis : M1 en reprend 10 (33 %)", r.etat.combattants.V.pv === 70 && r.etat.combattants.M1.pv === 90,
             `${r.etat.combattants.V.pv} / ${r.etat.combattants.M1.pv}`);
    verifier("une étape de renvoi sur M1", r.etapes.some(x => x.type === "degats" && x.cible === "M1" && x.renvoi && x.montant === 10));
    const arm = clonerEtat(base); arm.combattants.V.def.physique = 50;
    const ra = resoudreCarte(arm, coup("M1", "V", 30));
    verifier("sur les dégâts SUBIS : 50 % d'armure, 15 subis → 5 renvoyés", ra.etat.combattants.V.pv === 85 && ra.etat.combattants.M1.pv === 95,
             `${ra.etat.combattants.V.pv} / ${ra.etat.combattants.M1.pv}`);
    const bou = clonerEtat(base); bou.combattants.V.bouclier = 10;
    const rb = resoudreCarte(bou, coup("M1", "V", 30));
    verifier("le bouclier entamé compte : 10 encaissés → 3", rb.etat.combattants.M1.pv === 97, String(rb.etat.combattants.M1.pv));
    const esq = resoudreCarte(clonerEtat(base), coup("M1", "V", 30, { esquive: true }));
    verifier("esquivé : rien de subi, rien de renvoyé", esq.etat.combattants.V.pv === 100 && esq.etat.combattants.M1.pv === 100);
    const petit = resoudreCarte(clonerEtat(base), coup("M1", "V", 2));
    verifier("un coup de 2 : au moins 1 renvoyé", petit.etat.combattants.M1.pv === 99);
    verifier("sans Nuée : rien", resoudreCarte(monde(9), coup("M1", "V", 30)).etat.combattants.M1.pv === 100);
    verifier("rejoué depuis le journal : mêmes PV", appliquerEntree(base, { etapes: r.etapes }).combattants.M1.pv === 90);
    const fini = clonerEtat(base); vieillirLesEtats(fini); vieillirLesEtats(fini);
    verifier("la Nuée finie : plus de renvoi", resoudreCarte(fini, coup("M1", "V", 30)).etat.combattants.M1.pv === 100);
    verifier("la règle : 33 %", RENVOI_NUEE === 33);
}

console.log("\n3. NIVEAU 5 : +3 DÉGÂTS CONTRE LES VARGENS, SUR TOUTES SES ATTAQUES");
{
    const vargen = (e) => { e.combattants.M1.race = "Vargen"; return e; };
    const r5 = resoudreCarte(vargen(monde(5)), coup("V", "M1", 10));
    verifier("une compétence sur un Vargen : 10 + 3 = 13", r5.etat.combattants.M1.pv === 87, String(r5.etat.combattants.M1.pv));
    verifier("sur un autre : 10", resoudreCarte(monde(5), coup("V", "M1", 10)).etat.combattants.M1.pv === 90);
    verifier("niveau 4 : 10, même sur un Vargen", resoudreCarte(vargen(monde(4)), coup("V", "M1", 10)).etat.combattants.M1.pv === 90);
    const arm = vargen(monde(5)); arm.combattants.M1.def.physique = 50;
    verifier("avant les défenses : (10 + 3) × 50 % → 7", resoudreCarte(arm, coup("V", "M1", 10)).etat.combattants.M1.pv === 93,
             String(resoudreCarte(arm, coup("V", "M1", 10)).etat.combattants.M1.pv));
    verifier("un soin du Vampire sur un allié Vargen : pas de +3", (() => { const e = monde(5); e.combattants.A.race = "Vargen"; e.combattants.A.pv = 50;
        return resoudreCarte(e, coup("V", "A", 10, { attaque: { isHeal: true } })).etat.combattants.A.pv === 60; })());
    const b = vargen(enTete(monde(5), "V", "CLASSE_BAISER_VAMPIRE"));
    const rb = appliquerIntention(b, { id: "B", type: "classe", acteur: "V", idCarte: "CLASSE_BAISER_VAMPIRE", cible: "M1" });
    verifier("le Baiser du vampire sur un Vargen : 25 + 3 = 28 bruts", rb.etat.combattants.M1.pv === 72, String(rb.etat.combattants.M1.pv));
    const e = vargen(monde(5));
    verifier("l'attaque d'opportunité sur un Vargen : 8 + 3 = 11", degatsOpportuniteBruts(e.combattants.V, e.combattants.M1) === 11
             && degatsOpportuniteBruts(e.combattants.V, e.combattants.M2) === 8);
    verifier("un autre héros contre un Vargen : rien de plus", resoudreCarte(vargen(monde(5)), coup("H", "M1", 10)).etat.combattants.M1.pv === 90);
}

console.log("\n4. LES TEXTES ET LA VERSION");
{
    const c = lireFichier("classes.js");
    verifier("la fiche de classe : 1 (+15, brûlure −60 % et 10 %), 3 Baiser, 5 (brûlure annulée, Vargens), 9 Nuée (40, réserve 33, renvoi 33 %)",
             /\+15 % de résistance physique/.test(c) && /−60 % de soins reçus et 10 %/.test(c) && /niveau: 3, titre: "Technique : Baiser du vampire"/.test(c)
             && /\+3 dégâts contre les Vargens/.test(c) && /niveau: 9, titre: "Technique : Nuée de chauves-souris"/.test(c) && /réserve 33/.test(c) && /Renvoie 33 %/.test(c));
    verifier("version 349 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lireFichier("trace_combat.js")) || [])[1]) >= 349 && JSON.parse(lireFichier("version.json")).version >= 349);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
