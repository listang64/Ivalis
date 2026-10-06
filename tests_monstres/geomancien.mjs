// LA CLASSE GÉOMANCIEN.
//
// Nico : « Géomancien. Lvl1 : à partir de quatre zones payantes placées, la
// 5e ne coûte rien (dans la Forge). +10 init pour les sorts avec une zone.
// Lvl5 : Mur de terre (20 fatigue par mur, créé directement en combat, INIT 80,
// portée 5) : mur à 10 PV, infranchissable s'il n'est pas cassé, casse la
// ligne de vue ; si un ennemi ou un joueur est dessus, il est repoussé
// aléatoirement d'un côté du mur et prend 3 dégâts bruts. Les zones que le
// Géomancien place ne lui infligent pas de dégâts, il se déplace dans le
// terrain difficile comme sur un terrain normal, et peut traverser ses murs.
// Murs dessinés vus de dessus, un peu iso : des masses de roche comme de gros
// piliers, parfois des gravats à côté ; cassés, des gravats de terre sur la
// case, qui devient un terrain difficile. »
// Ses réponses : toute compétence avec Zone ; la seule limite est la
// fatigue ; le joueur choisit les cases ; en vue ; la technique prend le
// tour ; le mur reste jusqu'à ce qu'on le casse (la réinitialisation les
// enlève) ; on le vise comme un combattant, sans défense, les zones le
// touchent ; les créatures le contournent, et le frappent s'il les enferme ;
// il coupe la vue de tout le monde, Géomancien compris ; sans case libre,
// la victime reste sur place, sur des gravats (pas de mur), et prend le
// double ; il ne s'arrête pas sur ses murs ; ses nappes ne le touchent pas.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat, creerDes, MUR_TERRE,
         plateauDeCombat, murEn, cleGravats } from '../combat_etat.js';
import { ligneDeVue, traverserZones } from '../moteur_pur.js';
import { coutDuPas, planifierTrajet, trouverChemin } from '../mouvement_pur.js';
import { casesAccessibles } from '../ia_pure.js';
import { prochainPas, validerIntention, jouerCreature } from '../cerveau_combat.js';
import { misEnScene, TYPES_MIS_EN_SCENE } from '../pont_combat.js';
import { TYPES_ETAPES } from '../combat_etat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(72)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const w = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/experience.js', 'utf-8'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);
const REGLES = {
    pvMax: w.pvMaxCombattant, fatigueMax: w.fatigueMaxCombattant,
    esquive: w.esquiveCombattant, parade: w.paradeCombattant,
    defPhysique: w.defPhysiqueCombattant, defMagique: w.defMagiqueCombattant,
    critique: w.critiqueCombattant, atouts: w.atoutRace, bonusEquip: w.bonusEquip
};
const XP = { 1: 0, 4: 1800, 5: 2500, 10: 7900 };
const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Ankylar", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const geomancien = (niveau, extra = {}) => fiche("G", { classe: "Géomancien", xp: XP[niveau], ...extra });
// G (0,0) ; H, un héros, (-1,0) ; M1 (4,0) ; M2 (0,4).
const monde = (niveau = 5, positions = {}, autres = ["H", "M1", "M2"]) => {
    const fiches = [geomancien(niveau), ...autres.map(id => fiche(id))];
    const pos = { G: { q: 0, r: 0 }, H: { q: -1, r: 0 }, M1: { q: 4, r: 0 }, M2: { q: 0, r: 4 }, ...positions };
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 7, combattants: fiches, positions: pos,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["G", ...autres];
    e.phase = "Resolution";
    return e;
};
const aSonTour = (e, id = "G", carte = "CLASSE_MUR_DE_TERRE") => { e.file = [{ id, carte, initiative: 80, pas: 0 }, { id: "M1", carte: "X", initiative: 1, pas: 0 }]; return e; };
const murs = (e, cases, extra = {}) => prochainPas(aSonTour(e), [{ id: "i1", type: "classe", acteur: "G", idCarte: "CLASSE_MUR_DE_TERRE", murs: cases, ...extra }], extra.contexte || {});
const unMurEn = (e, q, r) => { e.murs = { ...(e.murs || {}), [`MUR_T_${q}_${r}`]: { id: `MUR_T_${q}_${r}`, q, r, pv: 10, pvMax: 10, idLanceur: "G" } }; return e; };

console.log("\n=========================================================");
console.log("  LE GÉOMANCIEN");
console.log("=========================================================");

console.log("\n1. LES PALIERS");
{
    const a1 = w.atoutRace(geomancien(1)), a5 = w.atoutRace(geomancien(5));
    verifier("niveau 1 : la 5e case de zone offerte, +10 init sur les zones", a1.zoneGratuite === true && a1.initiativeZone === 10
             && !(a1.techniques || []).length, JSON.stringify(a1));
    verifier("niveau 5 : Mur de terre, zones inoffensives, terrain facile, traverse ses murs",
             JSON.stringify(a5.techniques) === '["CLASSE_MUR_DE_TERRE"]' && a5.zonesInoffensives && a5.terrainFacile && a5.traverseSesMurs);
    const t = w.TECHNIQUES_CLASSE.CLASSE_MUR_DE_TERRE;
    verifier("Mur de terre : init 80, portée 5, 20 de fatigue par mur, pas une fois par combat",
             t.Initiative === 80 && t.portee === 5 && t.coutParMur === 20 && t.cible === "murs" && t.sansLimite);
    verifier("le moteur : 10 PV, 20 de fatigue, portée 5, 3 dégâts", MUR_TERRE.pv === 10 && MUR_TERRE.coutFatigue === 20
             && MUR_TERRE.portee === 5 && MUR_TERRE.degatsPoussee === 3);
    verifier("écrit en clair", /5e case/.test(w.texteAtout("zoneGratuite", true)) && /\+10 d'initiative/.test(w.texteAtout("initiativeZone", 10))
             && /traverse/i.test(w.texteAtout("traverseSesMurs", true)));
    const e = monde(5);
    verifier("en combat : les passifs voyagent", e.combattants.G.atouts.traverseSesMurs && e.combattants.G.atouts.terrainFacile
             && e.combattants.G.atouts.zonesInoffensives && !e.combattants.H.atouts.traverseSesMurs);
    verifier("un nouveau combat : ni mur ni gravats", JSON.stringify(e.murs) === "{}" && JSON.stringify(e.gravats) === "{}");
}

console.log("\n2. NIVEAU 1 : LA FORGE ET L'INITIATIVE");
{
    const g = geomancien(1), autre = fiche("H", { classe: "Sentinelle" });
    const payees = (n, p) => w.casesZonePayantes(n, p);
    verifier("1 case : gratuite pour tous", payees(1, g) === 0 && payees(1, autre) === 0);
    verifier("5 cases (4 payantes) : 4 pour tous", payees(5, g) === 4 && payees(5, autre) === 4);
    verifier("6 cases (5 payantes) : la 5e offerte → 4 (un autre : 5)", payees(6, g) === 4 && payees(6, autre) === 5);
    verifier("15 cases : 13 (un autre : 14)", payees(15, g) === 13 && payees(15, autre) === 14);
    verifier("la fiche brute de la Forge (Classe, XP) aussi", payees(6, { Classe: "Géomancien", XP: 0, Race: "Ankylar" }) === 4);
    const zone = { Initiative: 60, Effets_Compiles: [{ nom: "Coup", isMod: false }, { nom: "Zone", desc: "3 hexagone(s)", isMod: true, isZone: true }] };
    const simple = { Initiative: 60, Effets_Compiles: [{ nom: "Coup", isMod: false }] };
    verifier("une compétence à zone : +10 ; sans zone : rien", w.bonusInitiativeClasse(g, zone) === 10 && w.bonusInitiativeClasse(g, simple) === 0);
    verifier("une technique de classe : rien", w.bonusInitiativeClasse(g, { ...zone, techniqueClasse: "X" }) === 0);
    verifier("l'Oracle garde son +10 partout", w.bonusInitiativeClasse(fiche("O", { classe: "Oracle" }), simple) === 10);
}

console.log("\n3. NIVEAU 5 : LEVER DES MURS");
{
    const e = monde(5);
    const p = murs(e, [{ q: 2, r: 0 }, { q: 0, r: 2 }, { q: -2, r: 3 }]);
    const lev = Object.values(p.etat.murs || {});
    verifier("3 murs levés, 10 PV chacun, à lui", lev.length === 3 && lev.every(m => m.pv === 10 && m.pvMax === 10 && m.idLanceur === "G"),
             JSON.stringify(lev.map(m => [m.q, m.r, m.pv])));
    verifier("60 de fatigue (20 par mur)", p.etat.combattants.G.fatigue === 40, String(p.etat.combattants.G.fatigue));
    verifier("son tour se clôt ; la technique n'est pas « usée »", p.etat.file[0].id === "M1"
             && !(p.etat.combattants.G.techniquesUtilisees || []).includes("CLASSE_MUR_DE_TERRE"));
    const rejoue = appliquerEntree(e, p.entree);
    verifier("rejoué depuis le journal : les mêmes murs", JSON.stringify(rejoue.murs) === JSON.stringify(p.etat.murs));
    verifier("l'état reste cohérent", verifierEtatCombat(p.etat).length === 0, verifierEtatCombat(p.etat).join(" | "));
    const encore = clonerEtat(p.etat);
    const p2 = murs(encore, [{ q: 3, r: -1 }]);
    verifier("plusieurs fois par combat", !p2.refus && Object.keys(p2.etat.murs).length === 4 && p2.etat.combattants.G.fatigue === 20);
    const scene = misEnScene(p.entree.etapes.find(x => x.type === "techniqueClasse"), p.etat);
    verifier("à l'écran : « 🪨 Mur de terre »", /Mur de terre/.test(scene.texte));
    verifier("toute étape du moteur a sa mise en scène (dont « mur »)", TYPES_ETAPES.every(t => TYPES_MIS_EN_SCENE.includes(t)),
             TYPES_ETAPES.filter(t => !TYPES_MIS_EN_SCENE.includes(t)).join(","));
    const refus = (cases, prep = () => {}, ctx) => { const x = monde(5); prep(x); return murs(x, cases, ctx ? { contexte: ctx } : {}); };
    verifier("à 6 cases : refusé", refus([{ q: 6, r: 0 }]).refus === true);
    verifier("sur lui-même : refusé", refus([{ q: 0, r: 0 }]).refus === true);
    verifier("deux fois la même case : refusé", refus([{ q: 2, r: 0 }, { q: 2, r: 0 }]).refus === true);
    verifier("sur un mur déjà levé : refusé", refus([{ q: 2, r: 0 }], x => unMurEn(x, 2, 0)).refus === true);
    verifier("6 murs avec 100 d'énergie (120) : refusé", refus([1, 2, 3, 4, 5, 6].map(i => ({ q: i <= 5 ? i : 1, r: i <= 5 ? 0 : 1 }))).refus === true);
    const carte = { etatCase: (q, r) => ({ bloquee: q === 1 && r === 0 }) };
    verifier("derrière un mur de la carte : refusé (pas de ligne de vue)", refus([{ q: 3, r: 0 }], undefined, { plateau: carte }).refus === true);
    verifier("niveau 4 : il ne l'a pas", (() => { const x = monde(4); return murs(x, [{ q: 2, r: 0 }]).refus === true; })());
}

console.log("\n4. QUELQU'UN SUR LA CASE");
{
    const e = monde(5, { M1: { q: 3, r: 0 } }); e.combattants.M1.def.physique = 50;
    const p = murs(e, [{ q: 3, r: 0 }]);
    const m1 = p.etat.combattants.M1;
    verifier("repoussé sur une case voisine libre", (m1.q !== 3 || m1.r !== 0) && Math.max(Math.abs(m1.q - 3), Math.abs(m1.r), Math.abs(m1.q + m1.r - 3)) === 1,
             `(${m1.q},${m1.r})`);
    verifier("3 dégâts bruts (l'armure n'y fait rien)", m1.pv === 97, String(m1.pv));
    verifier("et le mur est levé", !!murEn(p.etat, 3, 0));
    verifier("rejoué depuis le journal", (() => { const r = appliquerEntree(e, p.entree); return r.combattants.M1.q === m1.q && r.combattants.M1.pv === 97 && !!murEn(r, 3, 0); })());
    // Un allié aussi.
    const allie = murs(monde(5), [{ q: -1, r: 0 }]);
    verifier("un allié aussi (3 dégâts)", allie.etat.combattants.H.pv === 97 && !!murEn(allie.etat, -1, 0));
    // Encerclé : pas de place autour.
    // (Un héros sur la case de devant : un mur là couperait la vue.)
    const coince = monde(5, { M1: { q: 3, r: 0 }, H: { q: 2, r: 0 } });
    [[4, 0], [4, -1], [3, -1], [2, 1], [3, 1]].forEach(([q, r]) => unMurEn(coince, q, r));
    const pc = murs(coince, [{ q: 3, r: 0 }]);
    verifier("sans case libre : il reste là, sur des gravats, pas de mur", pc.etat.combattants.M1.q === 3 && !murEn(pc.etat, 3, 0)
             && pc.etat.gravats[cleGravats(3, 0)] === true);
    verifier("et prend le double : 6", pc.etat.combattants.M1.pv === 94, String(pc.etat.combattants.M1.pv));
    verifier("à l'écran : « 🪨 Écrasé sous la roche »", /Écrasé/.test((misEnScene(pc.entree.etapes.find(x => x.type === "mur" && x.bloque), pc.etat) || {}).texte || ""));
}

console.log("\n5. INFRANCHISSABLE, OPAQUE");
{
    const e = unMurEn(monde(5), 2, 0);
    const plateau = plateauDeCombat(null, e);
    verifier("la ligne de vue est coupée (pour tous)", !ligneDeVue(plateau, { q: 0, r: 0 }, { q: 4, r: 0 }) && ligneDeVue(null, { q: 0, r: 0 }, { q: 4, r: 0 }));
    const chemin = trouverChemin(e, { q: 1, r: 0 }, { q: 3, r: 0 }, plateau, { idQuiBouge: "H" });
    verifier("un autre le contourne", chemin.length > 2 && !chemin.some(h => h.q === 2 && h.r === 0), JSON.stringify(chemin));
    const traverse = [{ q: -1, r: 1 }];
    e.combattants.H.q = 1; e.combattants.H.r = 0;
    aSonTour(e, "H", null);
    verifier("un autre héros ne passe pas au travers", validerIntention(e, { id: "m", type: "mouvement", acteur: "H", chemin: [{ q: 2, r: 0 }, { q: 3, r: 0 }] }, plateau).ok === false);
    void traverse;
    verifier("une créature : la case du mur n'est pas accessible", !casesAccessibles(e, "M1", plateau, 3).some(h => h.q === 2 && h.r === 0));
    // Le Géomancien passe au travers, sans s'y arrêter.
    const g = unMurEn(monde(5, { G: { q: 1, r: 0 }, H: { q: -5, r: 0 } }), 2, 0); aSonTour(g, "G", null);
    const pg = plateauDeCombat(null, g);
    verifier("le Géomancien traverse son mur", validerIntention(g, { id: "m", type: "mouvement", acteur: "G", chemin: [{ q: 2, r: 0 }, { q: 3, r: 0 }] }, pg).ok === true);
    verifier("… sans pouvoir s'y arrêter", validerIntention(g, { id: "m", type: "mouvement", acteur: "G", chemin: [{ q: 2, r: 0 }] }, pg).ok === false);
    const pasG = prochainPas(g, [{ id: "m", type: "mouvement", acteur: "G", chemin: [{ q: 2, r: 0 }, { q: 3, r: 0 }] }], {});
    verifier("il y passe pour de vrai (3,0)", pasG && pasG.etat.combattants.G.q === 3, pasG && `${pasG.etat.combattants.G.q}`);
    g.combattants.G.fatigue = 3;
    const plan = planifierTrajet(g, "G", [{ q: 2, r: 0 }, { q: 3, r: 0 }], pg, {});
    verifier("à court d'énergie au milieu du mur : il s'arrête avant", plan.pas.length === 0 && plan.tronque, JSON.stringify(plan.pas.map(x => x.vers)));
    const cheminG = trouverChemin(g, { q: 1, r: 0 }, { q: 3, r: 0 }, pg, { idQuiBouge: "G" });
    verifier("son chemin le plus court passe par le mur", cheminG.length === 2 && cheminG[0].q === 2, JSON.stringify(cheminG));
}

console.log("\n6. TERRAIN DIFFICILE ET GRAVATS");
{
    const e = monde(5);
    verifier("terrain difficile : 2 pour lui, 4 pour un autre", coutDuPas(e.combattants.G, 1, true) === 2 && coutDuPas(e.combattants.H, 1, true) === 4);
    e.gravats = { [cleGravats(1, 0)]: true };
    const plateau = plateauDeCombat(null, e);
    verifier("des gravats : un terrain difficile", plateau.etatCase(1, 0).difficile === true && !plateau.etatCase(1, 0).bloquee);
    e.combattants.H.q = 0; e.combattants.H.r = 1; e.combattants.G.q = 5; e.combattants.G.r = 5;
    const pl = planifierTrajet(e, "H", [{ q: 1, r: 0 }], plateau, {});
    verifier("un héros y marche pour 4", pl.cout === 4, String(pl.cout));
}

console.log("\n7. SES NAPPES NE LE TOUCHENT PAS");
{
    const e = monde(5);
    e.zones = { zp_1: { id: "zp_1", idLanceur: "G", hexes: [{ q: 1, r: 0 }], degats: { valeurBrute: 10, typeRes: "Magique" }, dureeRestante: 2 },
                zp_2: { id: "zp_2", idLanceur: "M1", hexes: [{ q: 1, r: 0 }], degats: { valeurBrute: 10, typeRes: "Magique" }, dureeRestante: 2 } };
    const etapes = traverserZones(e, "G", { q: 1, r: 0 }, creerDes(1));
    verifier("la sienne : rien ; celle d'un ennemi : 10", e.combattants.G.pv === 90 && !etapes.some(x => x.zone === "zp_1"), String(e.combattants.G.pv));
    const h = monde(5);
    h.zones = { zp_1: { id: "zp_1", idLanceur: "G", hexes: [{ q: 1, r: 0 }], degats: { valeurBrute: 10, typeRes: "Magique" }, dureeRestante: 2 } };
    traverserZones(h, "H", { q: 1, r: 0 }, creerDes(1));
    verifier("un allié, lui, s'y brûle", h.combattants.H.pv === 90);
    const n4 = monde(4);
    n4.zones = { zp_1: { id: "zp_1", idLanceur: "G", hexes: [{ q: 1, r: 0 }], degats: { valeurBrute: 10, typeRes: "Magique" }, dureeRestante: 2 } };
    traverserZones(n4, "G", { q: 1, r: 0 }, creerDes(1));
    verifier("niveau 4 : la sienne le touche encore", n4.combattants.G.pv === 90);
}

console.log("\n8. ON LE CASSE");
{
    const coup = (e, cible, valeur, critique) => {
        e.file = [{ id: "H", carte: "C", initiative: 50, pas: 0 }, { id: "M1", carte: "X", initiative: 1, pas: 0 }];
        e.combattants.H.def.critique = critique ? 100 : 0;
        return prochainPas(e, [{ id: "c1", type: "carte", acteur: "H", idCarte: "C", coutFatigue: 0, alterations: [],
            attaques: [{ nom: "Coup", valeurBrute: valeur, typeRes: "Physique", isRanged: true, rangeMax: 5, cibles: cible }] }], {});
    };
    const e = unMurEn(monde(5), 1, -1);
    const p = coup(e, ["MUR_T_1_-1"], 4);
    verifier("4 dégâts : 10 → 6 PV (aucune défense)", p.etat.murs["MUR_T_1_-1"].pv === 6, JSON.stringify(p.etat.murs));
    verifier("rejoué depuis le journal", appliquerEntree(e, p.entree).murs["MUR_T_1_-1"].pv === 6);
    const casse = coup(unMurEn(monde(5), 1, -1), ["MUR_T_1_-1"], 12);
    verifier("12 dégâts : cassé, des gravats sur sa case", !casse.etat.murs["MUR_T_1_-1"] && casse.etat.gravats[cleGravats(1, -1)] === true);
    verifier("à l'écran : « 💥 Mur brisé »", /brisé/.test(misEnScene(casse.entree.etapes.find(x => x.type === "mur" && x.casse), casse.etat).texte));
    const double = coup(unMurEn(monde(5), 1, -1), ["MUR_T_1_-1", "M1"], 4);
    verifier("une carte qui frappe un mur ET un ennemi : les deux", double.etat.murs["MUR_T_1_-1"].pv === 6 && double.etat.combattants.M1.pv === 96);
    // Une créature enfermée frappe le mur.
    const prison = monde(5, { M1: { q: 6, r: 0 } });
    [[7, 0], [7, -1], [6, -1], [5, 0], [5, 1], [6, 1]].forEach(([q, r]) => unMurEn(prison, q, r));
    prison.file = [{ id: "M1", carte: "GRIFFE", initiative: 10, pas: 0 }];
    const carte = { idCarte: "GRIFFE", infos: { portee: 1, fatigue: 0 },
                    attaques: [{ nom: "Griffe", valeurBrute: 4, typeRes: "Physique", isRanged: false, rangeMax: 1 }], alterations: [] };
    const pi = jouerCreature(prison, "M1", carte, plateauDeCombat(null, prison));
    const entames = Object.values(pi.etat.murs).filter(m => m.pv < 10);
    verifier("une créature enfermée frappe un mur (4 dégâts)", entames.length === 1 && entames[0].pv === 6, JSON.stringify(entames));
    const libre = monde(5, { M1: { q: 6, r: 0 } }); unMurEn(libre, 5, 0);
    libre.file = [{ id: "M1", carte: "GRIFFE", initiative: 10, pas: 0 }];
    const pl = jouerCreature(libre, "M1", carte, plateauDeCombat(null, libre));
    verifier("une créature qui peut contourner ne le frappe pas", pl.etat.murs["MUR_T_5_0"].pv === 10);
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
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {};
  export const updateDoc = async () => {};
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

console.log("\n9. LE DESSIN DES MURS ET DES GRAVATS (SANS IA)");
{
  const r = await p.evaluate(async () => {
    const lire = (cv) => cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
    const remplis = (d) => { let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++; return n; };
    const m1 = window.dessinerPilierTerre("MUR_1"), m1b = window.dessinerPilierTerre("MUR_1"), m2 = window.dessinerPilierTerre("MUR_2");
    const g1 = window.dessinerGravatsTerre("3_0");
    const d = lire(m1);
    // La roche monte au-dessus de la case : des pixels pleins dans le haut du dessin.
    let hautPlein = 0;
    for (let y = 20; y < 60; y++) for (let x = 0; x < 128; x++) if (d[(y * 128 + x) * 4 + 3] > 200) hautPlein++;
    // Une teinte de roche : ni verte ni bleue dominante.
    let roche = 0, pleins = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { pleins++; if (d[i] >= d[i + 2] && d[i + 1] >= d[i + 2] - 5) roche++; }
    const vitrine = document.createElement("div");
    vitrine.id = "vitrine-murs";
    vitrine.style.cssText = "position:fixed;inset:0;z-index:99999;background:#6f8a4f;display:flex;flex-wrap:wrap;gap:24px;align-items:center;justify-content:center;padding:30px";
    ["A", "B", "C", "D", "E"].forEach(gr => { const im = new Image(); im.src = window.dessinerPilierTerre("MUR_" + gr).toDataURL(); im.style.cssText = "width:190px;height:237px"; vitrine.appendChild(im); });
    ["1_0", "2_5"].forEach(gr => { const im = new Image(); im.src = window.dessinerGravatsTerre(gr).toDataURL(); im.style.cssText = "width:190px;height:190px"; vitrine.appendChild(im); });
    document.body.appendChild(vitrine);
    return { remplisMur: remplis(d), hautPlein, roche: roche / pleins, remplisGravats: remplis(lire(g1)),
             meme: m1.toDataURL() === m1b.toDataURL(), autre: m1.toDataURL() !== m2.toDataURL(), taille: [m1.width, m1.height] };
  });
  await p.waitForTimeout(200);
  await p.screenshot({ path: "/tmp/claude-0/geomancien_murs.png" });
  await p.evaluate(() => document.getElementById("vitrine-murs").remove());
  verifier("un pilier : de la roche pleine, qui s'élève au-dessus de sa case", r.remplisMur > 3000 && r.hautPlein > 300, `${r.remplisMur} / ${r.hautPlein}`);
  verifier("teinte de roche et de terre", r.roche > 0.9, r.roche.toFixed(2));
  verifier("des gravats : des éclats sur la case", r.remplisGravats > 1500, String(r.remplisGravats));
  verifier("même mur, même dessin ; un autre, un autre", r.meme && r.autre);
}

console.log("\n9 bis. LES MURS QUI SE SUIVENT, ET LEURS BOUTS CASSÉS");
{
  const r = await p.evaluate(() => {
    // Un plateau à bords plats, comme le vrai (Plateau.js).
    const R = 60, ech = 128 / (R * 1.9);
    const plat = (q, r) => ({ x: R * 1.5 * q, y: R * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r) });
    const DIR = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    const voisins = (etats) => DIR.map(([dq, dr], i) => { const a = plat(dq, dr); return { dx: a.x * ech, dy: a.y * ech, etat: etats[i] || null }; });
    const opaques = (cv, test) => { const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; let n = 0;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (d[(y * cv.width + x) * 4 + 3] > 200 && test(x, y)) n++; return n; };
    const inR = Math.hypot(plat(0, 1).x, plat(0, 1).y) / 2 * ech;          // demi-distance entre centres, en pixels du dessin
    // Un bout de muraille qui part vers le haut (voisine (0,-1)), rien en bas.
    const haut = window.dessinerMurTerre("A", voisins([null, null, "mur", null, null, null]), "G");
    const sousLaCase = opaques(haut, (x, y) => y > 130 + inR + 3);
    // La même case, avec en plus une voisine cassée en bas à droite (1,0).
    const casse = window.dessinerMurTerre("A", voisins([null, null, "mur", null, null, null].map((e, i) => i === 0 ? "casse" : e)), "G");
    const versLaCasse = (cv) => opaques(cv, (x, y) => { const dx = x - 64, dy = y - 130, u = plat(1, 0); const n = Math.hypot(u.x, u.y);
      const t = (dx * u.x + dy * u.y) / n / (n * ech / 2); return t > 0.8 && t < 1 && Math.abs(dx * u.y - dy * u.x) / n < 14; });
    // Deux cases l'une au-dessus de l'autre, composées comme sur le plateau :
    // la roche ne s'interrompt pas sur la frontière.
    window.PLATEAU_VTT = { hexSize: R, hexToPixel: (q, r) => ({ x: 300 + plat(q, r).x, y: 300 + plat(q, r).y }), getCaseState: () => ({}) };
    if (!document.getElementById("transform-plateau")) { const t = document.createElement("div"); t.id = "transform-plateau"; document.body.appendChild(t); }
    window.MURS_TERRE = { X1: { id: "X1", q: 0, r: 0, pv: 10, pvMax: 10, idLanceur: "G" }, X2: { id: "X2", q: 0, r: 1, pv: 10, pvMax: 10, idLanceur: "G" } };
    window.GRAVATS_TERRE = {};
    window.appliquerMursTerre();
    const ens = document.querySelector("#calque-murs-terre canvas.murs-terre-ensemble");
    const ox = parseFloat(ens.style.left), oy = parseFloat(ens.style.top), k = ens.width / parseFloat(ens.style.width);
    const ctx = ens.getContext("2d");
    // Le long de la colonne du milieu, du dessus de la case haute au dessus de la case basse.
    const H = 62 / ech;                                                  // la hauteur de la roche, en pixels du plateau
    let trous = 0, ecart = 0;
    const ref = ctx.getImageData(Math.round((300 - ox) * k), Math.round((300 - H - oy) * k), 1, 1).data;
    for (let y = 300 - H + 5; y < 300 + plat(0, 1).y - H - 5; y++) {
      const d = ctx.getImageData(Math.round((300 - ox) * k), Math.round((y - oy) * k), 1, 1).data;
      if (d[3] < 250) trous++;
      ecart = Math.max(ecart, Math.abs(d[0] - ref[0]));
    }
    const v = window.voisinsDuMur(0, 0, ech).map(x => x.etat);
    // Le mur du bas casse : la case haute se redessine avec un bout cassé.
    delete window.MURS_TERRE.X2; window.GRAVATS_TERRE = { "0_1": true };
    const vApres = window.voisinsDuMur(0, 0, ech).map(x => x.etat);
    window.appliquerMursTerre();
    window.MURS_TERRE = {}; window.GRAVATS_TERRE = {};
    window.appliquerMursTerre();
    return { sousLaCase, versHaut: opaques(haut, (x, y) => y < 130 - inR - 62 + 10), avecCasse: versLaCasse(casse), sansCasse: versLaCasse(haut),
             trous, ecart, v: v.join(","), vApres: vApres.join(","), meme: haut.toDataURL() === window.dessinerMurTerre("A", voisins([null, null, "mur", null, null, null]), "G").toDataURL() };
  });
  verifier("rien ne déborde sous sa case (au sol)", r.sousLaCase === 0, String(r.sousLaCase));
  verifier("un bras de roche monte vers la case du dessus", r.versHaut > 200, String(r.versHaut));
  verifier("deux murs voisins : une seule roche, sans trou ni couture sur la frontière", r.trous === 0 && r.ecart <= 6, `${r.trous} / ${r.ecart}`);
  verifier("une voisine cassée : un moignon et des éclats de son côté", r.avecCasse > 20 && r.sansCasse === 0, `${r.avecCasse} / ${r.sansCasse}`);
  verifier("les voisines vues : « mur » puis, cassée, « casse »", /mur/.test(r.v) && !/casse/.test(r.v) && /casse/.test(r.vApres) && !/mur/.test(r.vApres),
           `${r.v} → ${r.vApres}`);
  verifier("même voisinage, même dessin", r.meme);
}
await p.evaluate(() => {
  // La vitrine : une muraille en ligne, une en T, une coupée par un mur cassé.
  const R = 46;
  window.PLATEAU_VTT = { hexSize: R, hexToPixel: (q, r) => ({ x: 560 + R * 1.5 * q, y: 400 + R * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r) }), getCaseState: () => ({}) };
  const fond = document.createElement("canvas"); fond.id = "vitrine-murailles"; fond.width = 1194; fond.height = 834;
  fond.style.cssText = "position:fixed;left:0;top:0;z-index:99990;background:#6f8a4f";
  const g = fond.getContext("2d"); g.strokeStyle = "rgba(255,255,255,0.22)";
  for (let q = -14; q <= 14; q++) for (let r = -14; r <= 14; r++) { const c = PLATEAU_VTT.hexToPixel(q, r); g.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; i ? g.lineTo(c.x + R * Math.cos(a), c.y + R * Math.sin(a)) : g.moveTo(c.x + R * Math.cos(a), c.y + R * Math.sin(a)); }
    g.closePath(); g.stroke(); }
  document.body.appendChild(fond);
  const cadre = document.createElement("div"); cadre.id = "cadre-murailles";
  cadre.style.cssText = "position:fixed;left:0;top:0;z-index:99991";
  document.body.appendChild(cadre);
  const murs = {}; let n = 0; const mettre = (q, r, l = "G") => { const id = "V" + (n++); murs[id] = { id, q, r, pv: 10, pvMax: 10, idLanceur: l }; };
  [[-8, 3], [-7, 3], [-6, 2], [-5, 2], [-4, 1], [-3, 1]].forEach(([q, r]) => mettre(q, r));
  [[0, -4], [0, -3], [0, -2], [0, -1], [0, 0], [-1, -1], [-2, -1]].forEach(([q, r]) => mettre(q, r));
  [[3, 1], [4, 0], [6, -1], [7, -2], [8, -2]].forEach(([q, r]) => mettre(q, r, "H"));
  mettre(-5, -3);
  window.MURS_TERRE = murs; window.GRAVATS_TERRE = { "5_0": true };
  window.appliquerMursTerre();
  cadre.appendChild(document.getElementById("calque-murs-terre"));
});
await p.waitForTimeout(200);
await p.screenshot({ path: "/tmp/claude-0/geomancien_murailles.png" });
await p.evaluate(() => { document.getElementById("vitrine-murailles").remove(); document.getElementById("cadre-murailles").remove();
  window.MURS_TERRE = {}; window.GRAVATS_TERRE = {}; window.appliquerMursTerre(); });

console.log("\n10. À L'ÉCRAN : TERRAIN, CALQUE, POSE, CIBLAGE");
{
  const r = await p.evaluate(async () => {
    document.getElementById("fenetre-combat").style.display = "block";
    const etats = {};
    window.PLATEAU_VTT = { hexSize: 40, getCaseState: (q, r) => etats[q + "," + r] || {},
                           hexToPixel: (q, r) => ({ x: 400 + 40 * Math.sqrt(3) * (q + r / 2), y: 300 + 60 * r }),
                           pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {}, getHexesInRadius: () => [] };
    window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
    if (!document.getElementById("transform-plateau")) {
      const t = document.createElement("div"); t.id = "transform-plateau"; document.body.appendChild(t);
    }
    window.PERSOS_PARTIE = [
      { idPersonnage: "G", prenom: "Terra", classe: "Géomancien", xp: 2500, race: "Ankylar", camp: "Allié", idJoueur: "J", Etats_Alteres: [], fatigueActuelle: 70 },
      { idPersonnage: "H", prenom: "Bran", classe: "Sentinelle", xp: 0, race: "Humain", camp: "Allié", idJoueur: "J", Etats_Alteres: [] },
      { idPersonnage: "M1", prenom: "Ogre", camp: "Ennemi", estMonstre: true, Etats_Alteres: [] }];
    window.TOKENS_VTT_DATA = { G: { q: 0, r: 0 }, H: { q: -1, r: 0 }, M1: { q: 4, r: 0 } };
    window.MURS_TERRE = { MUR_A: { id: "MUR_A", q: 2, r: 0, pv: 6, pvMax: 10, idLanceur: "G" },
                          MUR_B: { id: "MUR_B", q: 1, r: 1, pv: 10, pvMax: 10, idLanceur: "G" } };
    window.GRAVATS_TERRE = { "0_2": true };
    const pourG = window.etatCaseCombat(2, 0, "G"), pourH = window.etatCaseCombat(2, 0, "H"), vue = window.etatCaseCombat(2, 0);
    const gravH = window.etatCaseCombat(0, 2, "H"), gravG = window.etatCaseCombat(0, 2, "G");
    const los = window.verifierLigneDeVueVTT({ q: 0, r: 0 }, { q: 4, r: 0 });
    window.appliquerMursTerre();
    const calque = document.getElementById("calque-murs-terre");
    const imgs = calque.querySelectorAll(".mur-terre[data-mur]").length, grav = calque.querySelectorAll("img.gravats-terre").length;
    const ensemble = calque.querySelectorAll("canvas.murs-terre-ensemble").length;
    const jauges = calque.querySelectorAll(".mur-terre-jauge").length;
    // La pose.
    let envoye = null;
    window.regimeDemande = { actif: () => true, etat: () => null,
                             techniqueClasse: (...a) => { envoye = a; } };
    window.ouvrirPoseMursTerre("G");
    const bandeau = !!document.getElementById("bandeau-pose-murs");
    window.toucherCaseMurTerre({ q: 6, r: 0 });          // trop loin
    window.toucherCaseMurTerre({ q: 2, r: 0 });          // déjà un mur
    window.toucherCaseMurTerre({ q: 0, r: -2 });
    window.toucherCaseMurTerre({ q: -2, r: 1 });
    window.toucherCaseMurTerre({ q: 3, r: -3 });
    window.toucherCaseMurTerre({ q: 1, r: -2 });        // 4e : 80 > 70 d'énergie
    const compte = document.querySelector(".pose-murs-compte").textContent;
    const projets = calque.querySelectorAll(".mur-terre-projet").length;
    window.toucherCaseMurTerre({ q: 3, r: -3 });         // retiré
    window.validerPoseMursTerre();
    return { pourG: !!pourG.isBlocked, pourH: !!pourH.isBlocked, vue: !!vue.isBlocked, mur: !!vue.murTerre,
             gravH: !!gravH.isDifficult, gravG: !!gravG.isDifficult, los, imgs, grav, jauges, bandeau, compte, projets, envoye, ensemble,
             ferme: !document.getElementById("bandeau-pose-murs") };
  });
  verifier("terrain : le mur bloque les autres, pas le Géomancien (qui ne s'y arrête pas)",
           r.pourH && !r.pourG && r.vue && r.mur);
  verifier("des gravats : difficiles pour un autre, pas pour lui", r.gravH && !r.gravG);
  verifier("la ligne de vue de l'écran est coupée", r.los === false);
  verifier("le calque : 2 murs (peints dans un seul canvas), 1 tas de gravats, une jauge sur le mur entamé",
           r.imgs === 2 && r.ensemble === 1 && r.grav === 1 && r.jauges === 1, JSON.stringify(r));
  verifier("la pose : un bandeau ; trop loin et déjà muré refusés ; plus d'énergie au 4e",
           r.bandeau && /3 murs · 60 ⚡ \/ 70 ⚡/.test(r.compte) && r.projets === 3, r.compte);
  verifier("validée : la technique part avec ses cases, le bandeau se ferme",
           r.envoye && r.envoye[1] === "CLASSE_MUR_DE_TERRE" && JSON.stringify(r.envoye[4].murs) === '[{"q":0,"r":-2},{"q":-2,"r":1}]' && r.ferme,
           JSON.stringify(r.envoye));

  // Le ciblage d'un mur, et la zone.
  const c = await p.evaluate(() => {
    const phase = { attaques: [{ nom: "Tir", valeurBrute: 5, isRanged: true, cibles: [] }], alterations: [] };
    window.ETAT_CIBLAGE = { actif: true, isZone: false, cibleUnique: null };
    window.configCiblage = () => ({ rangeMax: 5, isRanged: true, isHeal: false, isShield: false });
    window.effetsDeLaPhase = () => phase;
    window.lanceurDuCiblage = () => "G";
    window.dessinerAnneauxCiblage = () => {};
    window.ajouterCibleCiblage("MUR_B");
    const vise = phase.attaques[0].cibles.slice();
    const classe = document.querySelector('#calque-murs-terre [data-mur="MUR_B"]').classList.contains("mur-terre-vise");
    window.ETAT_CIBLAGE.actif = false;
    return { vise, classe };
  });
  await p.evaluate(() => { window.ETAT_CIBLAGE.actif = false; });
  verifier("un mur se vise : la carte part sur lui (et il s'entoure de rouge)", JSON.stringify(c.vise) === '["MUR_B"]' && c.classe, JSON.stringify(c));
  // La fiche de classe.
  const f = await p.evaluate(async () => {
    document.getElementById("fenetre-combat").style.display = "none";
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    window.GENRE_SELECTIONNE_TEMP = "Femelle";
    await window.ouvrirChoixClasse();
    window.ouvrirFicheClasse("CLASSE_GEOMANCIEN");
    const d = document.getElementById("descriptif-fiche-classe");
    return { titre: document.getElementById("titre-fiche-classe").textContent, texte: d.textContent };
  });
  await p.screenshot({ path: "/tmp/claude-0/geomancien_classe.png" });
  verifier("fiche de classe : la 5e case offerte, +10 init, Mur de terre, passifs",
           /5e case/.test(f.texte) && /\+10 d'initiative/.test(f.texte) && /Mur de terre/.test(f.texte) && /10 PV/.test(f.texte) && /traverse/.test(f.texte));
  verifier("pour une héroïne : « Géomancienne »", f.titre === "Géomancienne", f.titre);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
