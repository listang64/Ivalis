// v350 — LA REFONTE DES CLASSES : LE GÉOMANCIEN.
// Nico : « niveau 1 : à partir de 4 zones payantes placées, la 5e ne coûte rien ; +10
// d'initiative pour les sorts à zone. Niveau 3 : Mur de terre (il ne change pas). Niveau 5 :
// ses zones ne lui infligent aucun dégât ; il marche sur le terrain difficile comme sur un
// terrain normal ; il traverse ses propres murs. Niveau 9 : Coulée de lave (0 fatigue,
// initiative 10, une zone persistante de lave sur 3 hexagones consécutifs, active toute la
// partie, 5 dégâts magiques, 50 % de chance de BRÛLURE). Passif : les zones persistantes
// durent 1 tour de plus. » Ses réponses : le passif au niveau 9 ; la ligne part de lui ; une
// fois par combat ; la lave frappe tout le monde, comme toute zone.
// (Le reste de la classe : geomancien.mjs.)
//
// Lancer : node tests_monstres/corrections_v350.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat, creerDes, MUR_TERRE,
         plateauDeCombat, murEn, cleGravats } from '../combat_etat.js';
import { ligneDeVue, traverserZones, creerZonePure, vieillirZones, zonesDeFinDeManche, ligneCouleeLave, orientationLigne, COULEE_LAVE } from '../moteur_pur.js';
import { coutDuPas, planifierTrajet, trouverChemin } from '../mouvement_pur.js';
import { casesAccessibles, detourDesMurs, DETOUR_MAX_MURS } from '../ia_pure.js';
import { prochainPas, validerIntention, jouerCreature, appliquerIntention } from '../cerveau_combat.js';
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
const XP = { 1: 0, 2: 700, 3: 1200, 4: 1800, 5: 2500, 8: 5200, 9: 6400, 10: 7900 };
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


const lireFichier = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8');
const lave = (cases) => ({ id: "L" + Math.random(), type: "classe", acteur: "G", idCarte: "CLASSE_COULEE_LAVE", cases });
const aLaLave = (e) => aSonTour(e, "G", "CLASSE_COULEE_LAVE");
const zoneLave = (e) => Object.values(e.zones || {}).find(z => z.lave);

console.log("\n1. LES PALIERS (v350) : 1, 3, 5, 9");
{
    const a = (n) => w.atoutRace(geomancien(n));
    verifier("niveau 3 : le Mur de terre (pas au 2)", JSON.stringify(a(3).techniques) === '["CLASSE_MUR_DE_TERRE"]' && !(a(2).techniques || []).length);
    verifier("niveau 5 : zones inoffensives, terrain facile, traverse ses murs (pas au 4)", a(5).zonesInoffensives && a(5).terrainFacile && a(5).traverseSesMurs
             && !a(4).zonesInoffensives);
    verifier("niveau 9 : la Coulée de lave et +1 tour aux zones (pas au 8)", JSON.stringify(a(9).techniques) === '["CLASSE_MUR_DE_TERRE","CLASSE_COULEE_LAVE"]'
             && a(9).zonesProlongees === 1 && !a(8).zonesProlongees && JSON.stringify(a(8).techniques) === '["CLASSE_MUR_DE_TERRE"]');
    const t = w.TECHNIQUES_CLASSE.CLASSE_COULEE_LAVE, mur = w.TECHNIQUES_CLASSE.CLASSE_MUR_DE_TERRE;
    verifier("la carte : Coulée de lave, niveau 9, init 10, fatigue 0, une ligne", t.Nom === "Coulée de lave" && t.niveau === 9 && t.Initiative === 10
             && t.Fatigue === 0 && t.cible === "ligne" && /toute la rencontre/.test(t.desc));
    verifier("le Mur de terre ne change pas (init 80, 20 par mur), sauf son niveau (3)", mur.niveau === 3 && mur.Initiative === 80 && mur.coutParMur === 20);
}

console.log("\n2. LA LIGNE : 3 CASES QUI PARTENT DE LUI, DANS L'UNE DE SES 6 DIRECTIONS");
{
    const g = { q: 0, r: 0 };
    const dirs = [0, 1, 2, 3, 4, 5].map(p => ligneCouleeLave(g, p));
    verifier("six lignes de 3 cases, chacune collée à lui puis droite", dirs.every(l => l.length === 3)
             && JSON.stringify(dirs[0]) === '[{"q":1,"r":0},{"q":2,"r":0},{"q":3,"r":0}]', JSON.stringify(dirs[0]));
    verifier("chaque ligne est reconnue (orientation 0 à 5)", dirs.every((l, i) => orientationLigne(g, l) === i));
    verifier("pas une ligne qui ne part pas de lui", orientationLigne(g, [{ q: 2, r: 0 }, { q: 3, r: 0 }, { q: 4, r: 0 }]) === -1);
    verifier("pas une ligne brisée, ni 2 ou 4 cases", orientationLigne(g, [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 2, r: 1 }]) === -1
             && orientationLigne(g, dirs[0].slice(0, 2)) === -1 && orientationLigne(g, [...dirs[0], { q: 4, r: 0 }]) === -1);
    const e = aLaLave(monde(9));
    verifier("niveau 9 : acceptée", validerIntention(e, lave(dirs[0])).ok, validerIntention(e, lave(dirs[0])).raison || "");
    verifier("une ligne qui ne part pas de lui : refusée", !validerIntention(e, lave([{ q: 2, r: 0 }, { q: 3, r: 0 }, { q: 4, r: 0 }])).ok);
    verifier("niveau 8 : il ne l'a pas", !validerIntention(aLaLave(monde(8)), lave(dirs[0])).ok);
}

console.log("\n3. LA LAVE : UNE ZONE DE FEU, PERMANENTE, 5 MAGIQUES ET 50 % DE BRÛLURE");
{
    // M1 sur la 2e case de la ligne, H (un allié) sur la 3e ; esquive 0.
    const e = aLaLave(monde(9, { M1: { q: 2, r: 0 }, H: { q: 3, r: 0 } }));
    const pas = appliquerIntention(e, lave(ligneCouleeLave({ q: 0, r: 0 }, 0)));
    const z = zoneLave(pas.etat);
    verifier("la zone posée : 3 cases, feu, permanente, 5 magiques, Brûlé à 50 %", !!z && z.hexes.length === 3 && z.type === "feu" && z.permanente === true
             && z.degats.valeurBrute === 5 && z.degats.typeRes === "Magique" && z.etat.nom === "Brûlé" && z.etat.chance === 50, JSON.stringify(z));
    verifier("ceux qui s'y tiennent la subissent tout de suite : M1 et l'allié H, 5 chacun", pas.etat.combattants.M1.pv === 95 && pas.etat.combattants.H.pv === 95,
             `${pas.etat.combattants.M1.pv} / ${pas.etat.combattants.H.pv}`);
    verifier("technique utilisée, tour clos, aucune fatigue", pas.etat.combattants.G.techniquesUtilisees.includes("CLASSE_COULEE_LAVE")
             && pas.etat.file[0].id === "M1" && pas.etat.combattants.G.fatigue === 100);
    verifier("une seconde fois dans le combat : refusée", !validerIntention(aLaLave(clonerEtat(pas.etat)), lave(ligneCouleeLave({ q: 0, r: 0 }, 1))).ok);
    verifier("rejouée depuis le journal : même zone, mêmes PV", (() => { const r = appliquerEntree(e, pas.entree);
             return !!zoneLave(r) && r.combattants.M1.pv === 95; })());
    // Toute la rencontre : elle ne s'efface jamais.
    const t = clonerEtat(pas.etat);
    for (let i = 0; i < 20; i++) vieillirZones(t);
    verifier("20 fins de manche plus tard : toujours là", !!zoneLave(t));
    // Chaque fin de manche, qui s'y tient la subit de nouveau.
    const f = clonerEtat(pas.etat); vieillirZones(f);
    zonesDeFinDeManche(f, creerDes(3));
    verifier("une manche plus tard : M1 la subit de nouveau (95 → 90)", f.combattants.M1.pv === 90, String(f.combattants.M1.pv));
    // Le Brûlé : environ une fois sur deux.
    let brules = 0;
    for (let g = 1; g <= 200; g++) {
        const s = clonerEtat(e); s.graine = g;
        if ((appliquerIntention(s, lave(ligneCouleeLave({ q: 0, r: 0 }, 0))).etat.combattants.M1.etats || []).some(x => x.nom === "Brûlé")) brules++;
    }
    verifier("Brûlé environ une fois sur deux (sur 200 graines)", Math.abs(brules / 200 - 0.5) < 0.09, `${brules}/200`);
    // Qui y entre : traverserZones.
    const entre = clonerEtat(pas.etat);
    const et = traverserZones(entre, "M2", { q: 1, r: 0 }, creerDes(5));
    verifier("qui y entre la subit (M2, 5 dégâts)", entre.combattants.M2.pv === 95 && et.some(x => x.type === "degats" && x.cible === "M2"));
    // Le Géomancien (niveau 9, zones inoffensives) n'en souffre pas.
    const lui = clonerEtat(pas.etat);
    traverserZones(lui, "G", { q: 1, r: 0 }, creerDes(5));
    verifier("le Géomancien la traverse sans dégâts", lui.combattants.G.pv === 100);
    verifier("une lave magique : la défense magique la réduit", (() => { const s = clonerEtat(pas.etat); s.combattants.M2.def.magique = 60;
             traverserZones(s, "M2", { q: 1, r: 0 }, creerDes(5)); return s.combattants.M2.pv === 98; })());
}

console.log("\n4. À L'ÉCRAN ET LES TEXTES");
{
    verifier("le ciblage : la ligne se tourne autour de lui (moteur_effets.js) et part au cerveau en cases",
             /techniqueClasse === "CLASSE_COULEE_LAVE"[\s\S]{0,200}zoneHexesBase = \[\{ q: 1, r: 0 \}, \{ q: 2, r: 0 \}, \{ q: 3, r: 0 \}\]/.test(lireFichier("moteur_effets.js"))
             && /state\.techniqueClasse === "CLASSE_COULEE_LAVE"/.test(lireFichier("moteur_effets.js")) && /t\.cible === "ligne"/.test(lireFichier("combat.js")));
    const scene = misEnScene({ type: "techniqueClasse", acteur: "G", idCarte: "CLASSE_COULEE_LAVE" }, monde(9));
    verifier("à l'écran : « 🌋 Coulée de lave »", /Coulée de lave/.test(scene.texte || ""), JSON.stringify(scene));
    const c = lireFichier("classes.js");
    verifier("la fiche de classe : Mur au 3, Coulée de lave et +1 tour au 9", /niveau: 3, titre: "Technique : Mur de terre"/.test(c)
             && /niveau: 9, titre: "Technique : Coulée de lave"/.test(c) && /niveau: 9, titre: "Terre tenace"/.test(c));
    verifier("version 350 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lireFichier("trace_combat.js")) || [])[1]) >= 350
             && JSON.parse(lireFichier("version.json")).version >= 350);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
