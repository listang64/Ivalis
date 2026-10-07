// LA CLASSE PROFANATEUR.
//
// Nico : « Profanateur : Lvl1 : plus fort pour les DOT (DOT ×1,3) / +1
// compétence / +5 PV. Lvl5 : quand il tue un ennemi, ou qu'un ennemi adjacent
// meurt, l'ennemi revient avec 15 PV en zombie, et possède une attaque
// physique qui fait 7 dégâts physiques, et cherchera à attaquer l'ennemi le
// plus proche. Le zombie se déplace que de deux cases par tour, et garde les
// résistances qu'il avait de son vivant (aucune parade/esquive). Lvl10 : sa
// jauge de vie une fois à 0 est bloquée et il dispose de deux tours avant
// d'être mis KO (l'ancienne mécanique du Nécromancien). Pour les tokens
// ennemis qui reviennent en zombie, un algo qui grignote un peu l'image du
// token, et dessine un peu de sang dessus, sans IA. »
// Corrigé ensuite (Nico) : « ce n'est pas du tout ×1,3 dégâts. C'est étalé :
// la fatigue est de base divisée par 1,2, sauf pour le Profanateur, le coût en
// fatigue est divisé par 1,3. » Ses dégâts sur la durée sont donc ceux de tout
// le monde ; son atout joue à la Forge (initiative_hors_effets.mjs, 1 ter).
// Ses réponses : le zombie passe dans son camp, joué par l'IA ; il n'a lui-même
// ni parade ni esquive ; il joue en dernier (initiative 0), sans fatigue ;
// jusqu'à ce qu'on le retue, ne revient pas, ne rapporte rien une 2e fois ;
// les boss aussi.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat, ZOMBIE } from '../combat_etat.js';
import { resoudreCarte, esquiveDe, paradeDe } from '../moteur_pur.js';
import { ticsDeFinDeManche, jouerZombie, prochainPas } from '../cerveau_combat.js';
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
const XP = { 1: 0, 4: 1800, 5: 2500, 9: 6400, 10: 7900 };
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

console.log("\n=========================================================");
console.log("  LE PROFANATEUR");
console.log("=========================================================");

console.log("\n1. LES PALIERS");
{
    const a1 = w.atoutRace(profanateur(1)), a5 = w.atoutRace(profanateur(5)), a10 = w.atoutRace(profanateur(10));
    verifier("niveau 1 : étalement ÷1,3 à la Forge, +1 compétence, +5 PV", a1.diviseurEtalement === 1.3 && !a1.dotBonus
             && a1.competences === 1 && a1.pvMax === 5 && !a1.zombies,
             JSON.stringify(a1));
    verifier("niveau 5 : les zombies", a5.zombies === true && !a5.sursis);
    verifier("niveau 10 : le sursis (2 tours)", a10.sursis === 2 && a10.zombies === true);
    verifier("PV max +5, 7 compétences en main", w.pvMaxCombattant(profanateur(1)) === 105 && w.competencesMaxCombattant(profanateur(1)) === 7);
    verifier("écrit en clair : « divisée par 1,3 »", /divisée par 1,3/.test(w.texteAtout("diviseurEtalement", 1.3))
             && /zombies/.test(w.texteAtout("zombies", true)), w.texteAtout("diviseurEtalement", 1.3));
    const e = monde(10);
    verifier("en combat : les atouts voyagent", e.combattants.P.atouts.zombies === true
             && e.combattants.P.atouts.sursis === 2);
}

console.log("\n2. NIVEAU 1 : SES DÉGÂTS SUR LA DURÉE SONT CEUX DE TOUT LE MONDE");
{
    const tic = (etatNom, source, extra = {}) => {
        const e = monde(1, { M1: { q: 9, r: 9 } });
        e.combattants.M2.etats = [{ nom: etatNom, duree: 2, idSource: source, ...extra }];
        ticsDeFinDeManche(e);
        return { pv: 100 - e.combattants.M2.pv, fatigue: 100 - e.combattants.M2.fatigue };
    };
    const poisonP = tic("Empoisonnement", "P"), poisonH = tic("Empoisonnement", "H");
    verifier("poison : 8 PV, 10 d'énergie, comme un autre (plus de ×1,3)",
             poisonP.pv === 8 && poisonP.fatigue === 10 && poisonH.pv === 8 && poisonH.fatigue === 10, JSON.stringify([poisonP, poisonH]));
    verifier("brûlure : 8, comme un autre", tic("Brûlé", "P").pv === 8 && tic("Brûlé", "H").pv === 8);
    verifier("saignement : 8, comme un autre", tic("Saignement", "P").pv === 8 && tic("Saignement", "H").pv === 8);
    // Étalée : 10 sur 2 tours → 5 + 5, pour lui comme pour un autre.
    const e = monde(1, { M1: { q: 9, r: 9 } });
    const r = coup(e, "P", "M2", 10, { estEtalement: true, toursEtalement: 2 });
    const etal = r.etat.combattants.M2.etats.find(x => x.nom === "Étalement");
    const rh = coup(monde(1, { M1: { q: 9, r: 9 } }), "H", "M2", 10, { estEtalement: true, toursEtalement: 2 });
    verifier("dégâts étalés : 5 + 5 (un autre : 5 + 5)", etal && JSON.stringify(etal.tics) === "[5,5]"
             && JSON.stringify(rh.etat.combattants.M2.etats.find(x => x.nom === "Étalement").tics) === "[5,5]", JSON.stringify(etal));
    // Le saignement retient son auteur.
    const s = resoudreCarte(monde(1), { type: "carte", idLanceur: "P", idCarte: "C", critique: false, attaques: [],
        alterations: [{ nom: "Saignement", chance: 100, duree: 2, cibles: ["M1"] }],
        jets: { attaqueRatee: false, parCible: { M1: { esquive: false, etats: { Saignement: true } } } } });
    verifier("un saignement posé retient son auteur", (s.etat.combattants.M1.etats.find(x => x.nom === "Saignement") || {}).idSource === "P");
}

console.log("\n3. NIVEAU 5 : LES ENNEMIS SE RELÈVENT EN ZOMBIES");
{
    const e = monde(5); e.combattants.M1.pv = 5; e.combattants.M1.def.physique = 30; e.combattants.M1.def.esquive = 40;
    e.combattants.M1.etats = [{ nom: "Brûlé", duree: 2 }];
    e.file = [{ id: "P", carte: "C", initiative: 50, pas: 0 }, { id: "M1", carte: "X", initiative: 30, pas: 0 },
              { id: "M2", carte: "X", initiative: 20, pas: 0 }];
    const r = coup(e, "P", "M1", 10);
    const z = r.etat.combattants.M1;
    verifier("tué par lui : debout, 15 / 15 PV, dans son camp", !z.aTerre && z.pv === 15 && z.pvMax === 15 && z.camp === "Allié"
             && z.zombie && z.zombie.idMaitre === "P", JSON.stringify({ pv: z.pv, camp: z.camp, zombie: z.zombie }));
    verifier("plus d'esquive ni de parade, ses résistances gardées, ses états effacés",
             esquiveDe(z) === 0 && paradeDe(z) === 0 && z.def.physique === 30 && z.etats.length === 0);
    verifier("la chute, puis le zombie, dans le journal", r.etapes.some(x => x.type === "chute" && x.cible === "M1")
             && r.etapes.some(x => x.type === "zombie" && x.cible === "M1"));
    verifier("son tour de cette manche s'en va de la file", !r.etat.file.some(f => f.id === "M1") && r.etat.file.some(f => f.id === "M2"));
    const rejoue = appliquerEntree(e, { etapes: r.etapes });
    // (Champ par champ : l'ordre des clés peut différer, pas leur valeur.)
    const memes = (x, y) => [...new Set([...Object.keys(x), ...Object.keys(y)])].every(k => JSON.stringify(x[k]) === JSON.stringify(y[k]));
    verifier("rejoué depuis le journal : le même zombie", memes(rejoue.combattants.M1, z)
             && !rejoue.file.some(f => f.id === "M1"));
    verifier("l'état reste cohérent", verifierEtatCombat(r.etat).length === 0, verifierEtatCombat(r.etat).join(" | "));
    const scene = misEnScene(r.etapes.find(x => x.type === "zombie"), r.etat);
    verifier("à l'écran : « 🧟 Se relève en zombie ! »", scene && /zombie/.test(scene.texte));

    const parH = monde(5); parH.combattants.M1.pv = 5;
    verifier("tué par un autre héros, à côté de lui : zombie aussi", !coup(parH, "H", "M1", 10).etat.combattants.M1.aTerre);
    const loin = monde(5); loin.combattants.M2.pv = 5;
    verifier("tué par un autre, loin de lui : rien", coup(loin, "H", "M2", 10).etat.combattants.M2.aTerre);
    const parP = monde(5); parP.combattants.M2.pv = 5;
    verifier("tué par lui, même loin : zombie", !coup(parP, "P", "M2", 10).etat.combattants.M2.aTerre);
    const n4 = monde(4); n4.combattants.M1.pv = 5;
    verifier("niveau 4 : rien", coup(n4, "P", "M1", 10).etat.combattants.M1.aTerre);
    const allie = monde(5, { H: { q: 1, r: -1 } }); allie.combattants.H.pv = 5;
    verifier("un héros qui tombe à côté de lui : rien", coup(allie, "M2", "H", 10).etat.combattants.H.aTerre);
    const illu = monde(5); illu.combattants.M1.pv = 5; illu.combattants.M1.estIllusion = true;
    verifier("une illusion : rien", coup(illu, "P", "M1", 10).etat.combattants.M1.aTerre);
    const retue = clonerEtat(r.etat); retue.combattants.M1.pv = 3;
    const r2 = coup(retue, "M2", "M1", 10);
    verifier("un zombie qu'on retue ne revient pas", r2.etat.combattants.M1.aTerre && !r2.etapes.some(x => x.type === "zombie"));
    // Le poison du Profanateur achève, de loin : zombie.
    const p = monde(5); p.combattants.M2.pv = 2; p.combattants.M2.etats = [{ nom: "Empoisonnement", duree: 1, idSource: "P" }];
    const etapesTic = ticsDeFinDeManche(p);
    verifier("son poison achève au loin : zombie", !p.combattants.M2.aTerre && p.combattants.M2.zombie
             && etapesTic.some(x => x.type === "zombie"));
    // Les boss aussi.
    const boss = monde(5); boss.combattants.M1.pv = 5; boss.combattants.M1.pvMax = 300; boss.combattants.M1.palier = "Boss";
    verifier("un boss aussi, à 15 PV", coup(boss, "P", "M1", 10).etat.combattants.M1.pv === 15);
    // La fiche projetée.
    const fiches = fichesDepuisEtat(r.etat, [fiche("M1", { PV_Max: 100 })]);
    verifier("la fiche du zombie : son camp, sa jauge de 15", fiches[0].zombie === true && fiches[0].camp === "Allié"
             && fiches[0].PV_Max === 15 && fiches[0].PV_Actuels === 15 && fiches[0].statut === "Vivant", JSON.stringify(fiches[0]).slice(0, 120));
}

console.log("\n4. LE TOUR D'UN ZOMBIE : 2 CASES, PUIS SA MORSURE DE 7");
{
    const zombieEn = (posM2) => {
        const e = monde(5, { M1: { q: 0, r: 0 }, P: { q: -6, r: 6 }, M2: posM2, H: { q: -6, r: 5 } });
        e.combattants.M1.pv = 5;
        const r = coup(e, "P", "M1", 10);
        const s = clonerEtat(r.etat);
        s.file = [{ id: "M1", carte: "ZOMBIE_MORSURE", initiative: 0, pas: 0 }, { id: "M2", carte: "X", initiative: 0, pas: 0 }];
        return s;
    };
    const e = zombieEn({ q: 5, r: 0 });
    const fatigue = e.combattants.M1.fatigue;
    const pas = jouerZombie(e, "M1");
    const z = pas.etat.combattants.M1;
    verifier("ennemi à 5 cases : il avance de 2 cases, sans fatigue", z.q === 2 && z.r === 0 && z.fatigue === fatigue,
             `(${z.q},${z.r}) ${z.fatigue}`);
    verifier("trop loin pour mordre : il le dit", pas.entree.etapes.some(x => x.type === "renonce"));
    verifier("son tour se clôt", pas.etat.file[0].id === "M2");
    const proche = zombieEn({ q: 3, r: 0 });
    const p2 = jouerZombie(proche, "M1");
    verifier("ennemi à 3 cases : 2 pas, puis la morsure (7)", p2.etat.combattants.M1.q === 2 && p2.etat.combattants.M2.pv === 93,
             `${p2.etat.combattants.M1.q} ${p2.etat.combattants.M2.pv}`);
    const arme = zombieEn({ q: 1, r: 0 }); arme.combattants.M2.def.physique = 50;
    verifier("l'armure de la cible réduit la morsure (7 → 4)", jouerZombie(arme, "M1").etat.combattants.M2.pv === 96);
    const rejoue = appliquerEntree(proche, p2.entree).combattants;
    verifier("rejoué depuis le journal", rejoue.M2.pv === 93 && rejoue.M1.q === 2);
    // Le cerveau le fait jouer de lui-même, sans carte.
    const auto = prochainPas(zombieEn({ q: 1, r: 0 }), [], {});
    verifier("le cerveau joue son tour tout seul", auto && auto.creature === "M1" && auto.etat.combattants.M2.pv === 93);
    // Une créature le frappe : il n'esquive pas.
    const frappe = zombieEn({ q: 1, r: 0 });
    frappe.combattants.M1.def.esquive = 0;
    verifier("il n'a ni esquive ni parade", esquiveDe(frappe.combattants.M1) === 0 && paradeDe(frappe.combattants.M1) === 0);
}

console.log("\n4 bis. IL VA OÙ IL PEUT MORDRE, PAS VERS LE PLUS PROCHE À VOL D'OISEAU");
// Nico : « lors de son tour, le zombie ne s'est pas déplacé pour attaquer ».
// Le journal de la partie (manche 4) : « zombie : hors de portée », sans un
// seul pas. Trois ennemis à deux cases ; il visait le premier, cerné par les
// héros — aucune case « plus près » de lui, donc il restait planté — alors
// qu'un pas en (2,-2) le collait à un autre. Même scène, en petit.
{
    const autres = ["M1", "M2", "M3", "H", "H2", "H3"];
    const e = monde(5, { P: { q: 0, r: 0 }, M1: { q: 3, r: -2 }, M2: { q: 2, r: 0 }, M3: { q: 1, r: -1 },
                         H: { q: 3, r: -1 }, H2: { q: 2, r: -1 }, H3: { q: 3, r: 0 } }, autres);
    e.combattants.M1.pv = 5;
    const s = clonerEtat(coup(e, "P", "M1", 10).etat);
    s.file = [{ id: "M1", carte: "ZOMBIE_MORSURE", initiative: 0, pas: 0 }, { id: "M2", carte: "X", initiative: 0, pas: 0 }];
    verifier("la scène : le zombie debout, M2 et M3 tous deux à deux cases", s.combattants.M1.zombie && !s.combattants.M1.aTerre);
    const pas = jouerZombie(s, "M1");
    const z = pas.etat.combattants.M1;
    const types = pas.entree.etapes.map(x => x.type);
    verifier("il ne renonce plus : il avance d'un pas en (2,-2)", z.q === 2 && z.r === -2 && !types.includes("renonce"),
             `(${z.q},${z.r}) ${types.join(" ")}`);
    verifier("et mord celui qui est à côté (M3 : 100 → 93)", pas.etat.combattants.M3.pv === 93, String(pas.etat.combattants.M3.pv));
    // Plus aucun ennemi joignable dans la manche : il s'approche quand même,
    // à pied, du contact le plus proche (pas à travers les héros).
    const loin = monde(5, { P: { q: -6, r: 6 }, M1: { q: 0, r: 0 }, M2: { q: 6, r: 0 }, H: { q: -6, r: 5 } });
    loin.combattants.M1.pv = 5;
    const l = clonerEtat(coup(loin, "P", "M1", 10).etat);
    const pl = jouerZombie(l, "M1");
    verifier("ennemi à 6 cases : il fait ses deux pas vers lui", pl.etat.combattants.M1.q === 2 && pl.etat.combattants.M1.r === 0,
             `(${pl.etat.combattants.M1.q},${pl.etat.combattants.M1.r})`);
}

console.log("\n4 ter. NIVEAU 10 : LES ZOMBIES SE RELÈVENT À 2 CASES");
// Nico : « pour le Profanateur, au niveau 10, augmente d'une case le rayon où
// il crée les zombies (donc 2 cases tout autour de lui si un ennemi meurt). »
{
    const tombeA = (niveau, pos) => {
        const e = monde(niveau, { M1: pos });
        e.combattants.M1.pv = 5;
        return coup(e, "H", "M1", 10).etat.combattants.M1;     // tué par un autre héros
    };
    verifier("niveau 10 : un rayon de 2", w.atoutRace(profanateur(10)).rayonZombies === 2 && w.atoutRace(profanateur(5)).rayonZombies === undefined);
    verifier("niveau 5 : à 2 cases, il reste à terre", tombeA(5, { q: 2, r: 0 }).aTerre === true);
    verifier("niveau 10 : à 2 cases, il se relève en zombie", !tombeA(10, { q: 2, r: 0 }).aTerre && !!tombeA(10, { q: 2, r: 0 }).zombie);
    verifier("niveau 10 : à 3 cases, il reste à terre", tombeA(10, { q: 3, r: 0 }).aTerre === true);
    verifier("niveau 10 : à côté, toujours", !!tombeA(10, { q: 1, r: 0 }).zombie);
}

console.log("\n5. NIVEAU 10 : LE SURSIS");
{
    const e = monde(10); e.file = [{ id: "M2", carte: "X", initiative: 50, pas: 0 }, { id: "P", carte: "C", initiative: 10, pas: 0 }];
    const r = coup(e, "M2", "P", 500);
    const p = r.etat.combattants.P;
    verifier("à 0 PV : debout, 2 tours de sursis", p.pv === 0 && !p.aTerre && p.sursis && p.sursis.tours === 2, JSON.stringify(p.sursis));
    const n9 = monde(9);
    verifier("niveau 9 : il tombe", coup(n9, "M2", "P", 500).etat.combattants.P.aTerre);
}

console.log("\n5 bis. LES RENFORTS : UNE PLACE PAR CRÉATURE PERDUE, À LA FIN DU TOUR");
{
    // Nico : « un adversaire mort et qui se transforme en zombie : s'il y a des
    // ennemis en attente ils spawn. Les renforts n'apparaissent pas direct à
    // la mort d'un ennemi mais à la fin du tour. »
    const memoire = { annonces: new Set(), attente: [], clePrecedente: null };
    const etatDe = (tete, combattants) => ({ manche: 1, phase: "Resolution", file: [{ id: tete }],
        combattants: Object.fromEntries(combattants.map(c => [c.id, { estMonstre: c.id.startsWith("M"), ...c }])) });
    const vivants = () => [{ id: "P" }, { id: "M1" }, { id: "M2" }, { id: "M3" }];
    const r1 = renfortsDuTour(etatDe("P", vivants()), memoire);
    verifier("personne ne tombe : aucun renfort", r1.renforts === 0 && !r1.morts.length);
    // En plein tour de P (une attaque d'opportunité pendant sa marche), M1 tombe.
    const r2 = renfortsDuTour(etatDe("P", [{ id: "P" }, { id: "M1", aTerre: true }, { id: "M2" }, { id: "M3" }]), memoire);
    verifier("M1 tombe en plein tour : marqué mort, le renfort attend", JSON.stringify(r2.morts) === '["M1"]' && r2.renforts === 0);
    const r3 = renfortsDuTour(etatDe("M2", [{ id: "P" }, { id: "M1", aTerre: true }, { id: "M2" }, { id: "M3" }]), memoire);
    verifier("le tour de P s'achève : le renfort entre", r3.renforts === 1 && !r3.morts.length);
    // M2 se relève en zombie, dans l'entrée qui clôt le tour de M3.
    renfortsDuTour(etatDe("M3", [{ id: "P" }, { id: "M1", aTerre: true }, { id: "M2" }, { id: "M3" }]), memoire);
    const r4 = renfortsDuTour(etatDe("P", [{ id: "P" }, { id: "M1", aTerre: true }, { id: "M2", zombie: true, camp: "Allié" }, { id: "M3" }]), memoire);
    verifier("une créature passée zombie libère aussi sa place (fin de tour : tout de suite)",
             JSON.stringify(r4.zombies) === '["M2"]' && r4.renforts === 1 && !r4.morts.length);
    const r5 = renfortsDuTour(etatDe("M3", [{ id: "P" }, { id: "M1", aTerre: true }, { id: "M2", zombie: true, aTerre: true }, { id: "M3" }]), memoire);
    verifier("le zombie retué ne rappelle personne", r5.renforts === 0 && !r5.morts.length && !r5.zombies.length);
    const r6 = renfortsDuTour(etatDe("M3", [{ id: "P", aTerre: true }, { id: "M1", aTerre: true }, { id: "M2", aTerre: true }, { id: "M3" }]), memoire);
    verifier("un héros qui tombe n'appelle pas de renfort", r6.renforts === 0 && !r6.morts.length);
}

// =========================================================================
//  PARTIE 2 : LA VRAIE PAGE
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
console.log("\n6. LE PION DU ZOMBIE, DESSINÉ SANS IA");
{
  const r = await p.evaluate(async () => {
    // Un pion d'essai : un médaillon rond, beige, avec un visage sombre.
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#5a3a1c"; g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();      // le cerclage
    const teint = g.createRadialGradient(118, 110, 10, 128, 128, 112);
    teint.addColorStop(0, "#f0cfa0"); teint.addColorStop(1, "#c79a64");
    g.fillStyle = teint; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#3b2a1a"; g.beginPath(); g.arc(128, 70, 62, Math.PI, 0); g.fill();               // les cheveux
    g.fillStyle = "#2a1a10"; [[100, 120], [156, 120]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fill(); });
    g.strokeStyle = "#7a3b2a"; g.lineWidth = 6; g.beginPath(); g.arc(128, 160, 26, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    const image = new Image(); image.src = c.toDataURL(); await image.decode();
    const lire = (cv) => cv.getContext("2d").getImageData(0, 0, 256, 256).data;
    const orig = lire(c);
    const z1 = window.dessinerPionZombie(image, "M1", 256), z1b = window.dessinerPionZombie(image, "M1", 256);
    const z2 = window.dessinerPionZombie(image, "M7", 256);
    const d = lire(z1);
    let opaquesAvant = 0, opaquesApres = 0, rouges = 0, croqueAuBord = 0, auCentre = 0, vertDomine = 0, peau = 0;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4, rr = Math.hypot(x - 128, y - 128);
      if (orig[i + 3] > 0) opaquesAvant++;
      if (d[i + 3] > 0) opaquesApres++;
      if (orig[i + 3] > 0 && d[i + 3] === 0) { if (rr > 70) croqueAuBord++; else auCentre++; }
      if (d[i + 3] > 0 && d[i] > d[i + 1] * 1.8 && d[i] > 60) rouges++;
      if (d[i + 3] > 0 && rr < 30 && rr > 0) continue;
      if (d[i + 3] > 0 && orig[i] > 200) { peau++; if (d[i + 1] >= d[i]) vertDomine++; }
    }
    // Le rendu, pour l'œil : l'original et deux zombies, agrandis.
    const vitrine = document.createElement("div");
    vitrine.id = "vitrine-zombie";
    vitrine.style.cssText = "position:fixed;inset:0;z-index:99999;background:#2b2b2b;display:flex;gap:30px;align-items:center;justify-content:center;";
    [c, z1, z2].forEach(cv => { const im = new Image(); im.src = cv.toDataURL(); im.style.cssText = "width:340px;height:340px"; vitrine.appendChild(im); });
    document.body.appendChild(vitrine);
    return { opaquesAvant, opaquesApres, rouges, croqueAuBord, auCentre, vertDomine, peau,
             memeGraine: z1.toDataURL() === z1b.toDataURL(), autreGraine: z1.toDataURL() !== z2.toDataURL() };
  });
  await p.waitForTimeout(200);
  await p.screenshot({ path: "/tmp/claude-0/zombie_pion.png" });
  await p.evaluate(() => document.getElementById("vitrine-zombie").remove());
  verifier("des morsures arrachées au bord (rien au cœur du médaillon)", r.croqueAuBord > 600 && r.auCentre === 0, `${r.croqueAuBord} / ${r.auCentre}`);
  verifier("du sang (pixels rouges)", r.rouges > 300, String(r.rouges));
  verifier("la peau tourne au vert cadavérique", r.vertDomine / r.peau > 0.8, `${r.vertDomine} / ${r.peau}`);
  verifier("même créature, même zombie ; une autre, un autre", r.memeGraine && r.autreGraine);

  // Le vrai pion d'une créature passée zombie.
  const pion = await p.evaluate(async () => {
    document.getElementById("fenetre-combat").style.display = "block";
    window.PLATEAU_VTT = { getCaseState: () => ({}), hexToPixel: (q, r) => ({ x: 300 + q * 60, y: 300 + r * 60 }),
                           pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {} };
    window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
    if (!document.getElementById("conteneur-tokens-vtt")) {
      const c = document.createElement("div"); c.id = "conteneur-tokens-vtt"; document.body.appendChild(c);
    }
    window.PERSOS_PARTIE = [{ idPersonnage: "M1", prenom: "Gnoll", camp: "Allié", estMonstre: true, zombie: true,
                              PV_Max: 15, PV_Actuels: 15, Etats_Alteres: [] },
                            { idPersonnage: "M2", prenom: "Ogre", camp: "Ennemi", estMonstre: true, PV_Max: 30, PV_Actuels: 30, Etats_Alteres: [] }];
    window.TOKENS_VTT_DATA = { M1: { q: 0, r: 0, taille: 55 }, M2: { q: 2, r: 0, taille: 55 } };
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    const attendre = (ms) => new Promise(r => setTimeout(r, ms));
    for (let i = 0; i < 40; i++) {
      const im = document.querySelector("#token-M1 .token-img-main");
      if (im && im.src.startsWith("data:image/png")) break;
      await attendre(100);
    }
    const z = document.querySelector("#token-M1 .token-img-main"), o = document.querySelector("#token-M2 .token-img-main");
    return { zombie: z && z.src.slice(0, 15), ogre: o && o.src.slice(0, 30), classe: document.getElementById("token-M1").classList.contains("token-zombie") };
  });
  verifier("sur le plateau, son pion devient l'image grignotée ; les autres ne changent pas",
           pion.zombie === "data:image/png;" && pion.classe && /^https?:/.test(pion.ogre || ""), JSON.stringify(pion));
}

console.log("\n7. LA VICTOIRE ET L'XP");
{
  const r = await p.evaluate(() => {
    window.estCombattantMort = (id) => id === "M2";
    window.xpDeLaCreature = () => 10;
    window.MONSTRES_PARTIE = [{ idPersonnage: "M1", zombie: true, camp: "Allié" }, { idPersonnage: "M2", statut: "Mort" }];
    const gagne = window.combatGagne();
    const xp = window.xpDeLaVictoire();
    window.MONSTRES_PARTIE.push({ idPersonnage: "M3" });
    return { gagne, xp, pasEncore: window.combatGagne() };
  });
  verifier("un zombie debout n'empêche pas la victoire", r.gagne === true && r.pasEncore === false);
  verifier("son XP compte (tombé une fois) : 2 créatures → 20", r.xp === 20, String(r.xp));
}

console.log("\n8. LA FICHE DE CLASSE");
{
  const r = await p.evaluate(async () => {
    document.getElementById("fenetre-combat").style.display = "none";
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    window.GENRE_SELECTIONNE_TEMP = "Femelle";
    await window.ouvrirChoixClasse();
    window.ouvrirFicheClasse("CLASSE_PROFANATEUR");
    const d = document.getElementById("descriptif-fiche-classe");
    return { titre: document.getElementById("titre-fiche-classe").textContent, texte: d.textContent,
             niveaux: [...d.querySelectorAll(".palier-classe-niveau")].map(x => x.textContent.trim()) };
  });
  await p.screenshot({ path: "/tmp/claude-0/profanateur_classe.png" });
  verifier("Niv. 1 / 5 / 10 : étalement ÷1,3, zombie 15 PV / 7 dégâts / 2 cases, sursis 2 tours",
           JSON.stringify(r.niveaux) === '["Niv. 1","Niv. 5","Niv. 10"]' && /divisée par 1,3/.test(r.texte) && !/×1,3/.test(r.texte) && /15 PV/.test(r.texte)
           && /7 dégâts/.test(r.texte) && /2 cases/.test(r.texte) && /2 tours/.test(r.texte));
  verifier("pour une héroïne : « Profanatrice »", r.titre === "Profanatrice", r.titre);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
