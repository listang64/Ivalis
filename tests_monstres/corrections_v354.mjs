// v354 — LA REFONTE DES CLASSES : LE PROFANATEUR.
// Nico : « niveau 1 : Nécromancie (un ennemi qu'il tue, ou qui meurt à 2 cases, revient en
// zombie : 15 PV, 7 dégâts physiques, l'ennemi le plus proche, 2 cases, ses résistances, ni
// parade ni esquive, 3 tours). Niveau 3 : la glace magique en dégâts physiques, +1
// compétence. Niveau 5 : Pointes de glace. Niveau 9 : Dernier sursis (la vie bloquée à 0, 2
// tours avant le KO ; réserve : 30 de fatigue pendant toute la durée de l'effet). » Ses
// réponses : 30 par manche, bloqués puis consommés ; sans eux, pas de sursis — KO.
// (Le reste de la classe : profanateur.mjs.)
//
// Lancer : node tests_monstres/corrections_v354.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat, ZOMBIE, creerDes, RESERVE_SURSIS } from '../combat_etat.js';
import { resoudreCarte, esquiveDe, paradeDe, reserveMaintenueDe } from '../moteur_pur.js';
import { ticsDeFinDeManche, jouerZombie, prochainPas, cloturerTour, validerIntention } from '../cerveau_combat.js';
import { misEnScene, fichesDepuisEtat, renfortsDuTour } from '../pont_combat.js';

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
const profanateur = (niveau, extra = {}) => fiche("P", { classe: "Profanateur", xp: XP[niveau], ...extra });
// P (0,0) ; M1 au contact (1,0) ; M2 loin (5,0) ; H, un héros, (0,1).
const monde = (niveau = 5, positions = {}, autres = ["M1", "M2", "H"]) => {
    const fiches = [profanateur(niveau), ...autres.map(id => fiche(id))];
    const pos = { P: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 5, r: 0 }, H: { q: 0, r: 1 }, M3: { q: -4, r: 0 }, ...positions };
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: fiches, positions: pos,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["P", ...autres];
    e.phase = "Resolution";
    return e;
};
const coup = (e, lanceur, cible, valeur, extra = {}) => resoudreCarte(e, { type: "carte", idLanceur: lanceur, idCarte: "C", critique: false,
    attaques: [{ nom: "Coup", valeurBrute: valeur, typeRes: "Physique", cibles: [cible], ...extra }], alterations: [],
    jets: { attaqueRatee: false, parCible: { [cible]: { esquive: false, etats: {} } } } });


const lireFichier = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8');
const reserve = (c) => (c.etats || []).find(x => x && x.maintien === "SURSIS");
const sansRegain = (e) => { Object.values(e.combattants).forEach(c => { c.stats = { ...(c.stats || {}), Regeneration: 0 }; }); return e; };
const finDeManche = (e) => { const s = clonerEtat(e); s.file = [{ id: "M2", carte: "X", initiative: 1, pas: 0 }];
    const clot = cloturerTour(s, creerDes(s.graine)); return { etat: s, etapes: clot.etapes }; };
const abattre = (niveau, fatigue) => { const e = sansRegain(monde(niveau)); e.combattants.P.fatigue = fatigue;
    e.file = [{ id: "M2", carte: "X", initiative: 50, pas: 0 }, { id: "P", carte: "C", initiative: 10, pas: 0 }];
    return coup(e, "M2", "P", 500); };

console.log("\n1. LE DERNIER SURSIS : 30 D'ÉNERGIE QUAND IL COMMENCE");
{
    const r = abattre(9, 100), p = r.etat.combattants.P;
    verifier("à 0 PV, 100 d'énergie : le sursis (2 tours), 30 payés (70)", !p.aTerre && p.sursis && p.sursis.tours === 2 && p.fatigue === 70, `${p.fatigue}`);
    verifier("la réserve : 30, manche payée, sans « Relâcher »", !!reserve(p) && reserve(p).reserve === 30 && reserve(p).dejaPaye === true
             && reserve(p).sansRelache === true && RESERVE_SURSIS === 30, JSON.stringify(reserve(p)));
    verifier("rejoué depuis le journal : même énergie, même réserve", (() => { const e = sansRegain(monde(9)); e.combattants.P.fatigue = 100;
             const x = appliquerEntree(e, { etapes: r.etapes }).combattants.P; return x.fatigue === 70 && !!reserve(x) && !!x.sursis; })());
    const pile = abattre(9, 30).etat.combattants.P;
    verifier("30 pile : le sursis, énergie à 0", !pile.aTerre && pile.sursis && pile.fatigue === 0);
    const pauvre = abattre(9, 29);
    verifier("29 d'énergie : pas de sursis — KO tout de suite", pauvre.etat.combattants.P.aTerre && !pauvre.etat.combattants.P.sursis
             && pauvre.etapes.some(x => x.type === "chute" && x.cible === "P"));
}

console.log("\n2. PUIS 30 BLOQUÉS ET CONSOMMÉS À CHAQUE MANCHE DU SURSIS");
{
    const r = abattre(9, 100);
    const f1 = finDeManche(r.etat);
    verifier("fin de la manche où il tombe : rien de pris, 30 bloqués pour la suivante", f1.etat.combattants.P.fatigue === 70
             && reserveMaintenueDe(f1.etat.combattants.P) === 30 && !f1.etat.combattants.P.aTerre);
    const carte = (e, cout) => { const s = clonerEtat(e); s.file = [{ id: "P", carte: "C", initiative: 50, pas: 0 }];
        return validerIntention(s, { id: "c", type: "carte", acteur: "P", idCarte: "C", coutFatigue: cout, attaques: [] }); };
    verifier("pendant le sursis : une carte à 40 passe, une à 41 non (70 − 30)", carte(f1.etat, 40).ok && !carte(f1.etat, 41).ok);
    const f2 = finDeManche(f1.etat);
    verifier("fin de la manche suivante, toujours en sursis : 30 consommés (40)", f2.etat.combattants.P.fatigue === 40 && !f2.etat.combattants.P.aTerre,
             String(f2.etat.combattants.P.fatigue));
    const court = clonerEtat(f1.etat); court.combattants.P.fatigue = 20;
    const fc = finDeManche(court);
    verifier("à court (20 sur 30) : le sursis s'arrête, il tombe KO", fc.etat.combattants.P.aTerre && !fc.etat.combattants.P.sursis && !reserve(fc.etat.combattants.P)
             && fc.etapes.some(x => x.type === "chute" && x.cible === "P" && x.finSursis) && fc.etapes.some(x => x.type === "message" && /à court/.test(x.texte)));
    verifier("rejoué depuis le journal : KO aussi", appliquerEntree(court, { etapes: fc.etapes }).combattants.P.aTerre);
    // Le sursis fini (ses 2 tours), la réserve s'en va avec lui.
    const fini = clonerEtat(f1.etat); fini.combattants.P.sursis = null; fini.combattants.P.aTerre = true;
    verifier("le sursis fini (KO) : la réserve s'en va, rien n'est pris", (() => { const x = finDeManche(fini).etat.combattants.P;
             return !reserve(x) && x.fatigue === 70; })());
    verifier("l'état reste cohérent", [r.etat, f1.etat, f2.etat, fc.etat].every(x => verifierEtatCombat(x).length === 0));
}

console.log("\n3. LES PALIERS ET LES TEXTES");
{
    const a = (n) => w.atoutClasse(profanateur(n));
    verifier("niveau 1 : la Nécromancie seule ; niveau 3 : la glace physique et +1 compétence ; niveau 9 : le sursis",
             a(1).zombies && !a(1).glacePhysique && a(3).glacePhysique && a(3).competences === 1 && a(9).sursis === 2 && !a(8).sursis);
    verifier("le zombie ne change pas : 15 PV, 7 dégâts, 2 cases, 3 tours", ZOMBIE.pv === 15 && ZOMBIE.degats === 7 && ZOMBIE.pas === 2 && ZOMBIE.tours === 3);
    const c = lireFichier("classes.js");
    verifier("la fiche : Nécromancie, Glace funèbre au 3, Dernier sursis au 9 avec sa réserve", /titre: "Passif : Nécromancie"/.test(c)
             && /niveau: 3, titre: "Glace funèbre"/.test(c) && /niveau: 9, titre: "Passif : Dernier sursis"/.test(c) && /Réserve : 30 d'énergie/.test(c));
    verifier("version 354 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lireFichier("trace_combat.js")) || [])[1]) >= 354
             && JSON.parse(lireFichier("version.json")).version >= 354);
}
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
