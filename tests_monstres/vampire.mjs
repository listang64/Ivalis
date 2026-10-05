// LA CLASSE VAMPIRE.
//
// Demande : « lvl1 : Résistant phy +10 % / brûlé : -60 % de soins reçus +10 %
// PV max en dégâts physiques / premier déplacement à chaque tour gratuit.
// lvl5 : SKILL Vampirisme (effet de combat VAMPIRE) : 1 pt, pas de cap, 1 dégât
// magique à l'ennemi et soigne sur 70 % des dégâts infligés (sur soi-même).
// lvl10 : COMP Nuée de chauve-souris : 0 de fatigue (une fois par combat),
// esquive définie sur 50 % sur soi sur 2 tours, INIT 100. Les Vargens ne
// peuvent pas être Vampire. »
// Ses réponses : +10 de résistance physique ; brûlé, -60 % de soins et 18 % des
// PV max par manche (8 + 10) ; la PREMIÈRE CASE de chaque tour gratuite, même
// sur un sol difficile ou Glacé, et comptée dans le barème ; Vampirisme comme
// Ténèbres (Intelligence, 1 pt = 1 dégât magique, sans plafond), le soin sur
// tout ce que la carte inflige (PV + bouclier), arrondi à l'inférieur, cumulé
// sur plusieurs cibles, rien sur une esquive, réduit par la brûlure ; la Nuée
// met l'esquive À AU MOINS 50 % (plus haute, elle le reste), pour la manche en
// cours et la suivante ; pour un Vargen, la carte Vampire est grisée.
//
// PUIS (rééquilibrage) : plus de première case gratuite, mais insensible au
// gel ; le Vampirisme de la Forge est remplacé par le BAISER DU VAMPIRE,
// technique de classe du niveau 5 (aucune fatigue, une fois par combat) :
// 25 % des PV max de la cible en dégâts bruts, et 60 % des dégâts infligés en
// soin ; la Nuée descend à 40 % d'esquive.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree } from '../combat_etat.js';
import { resoudreCarte, regleDesEtats, esquiveDe, ETAT_NUEE } from '../moteur_pur.js';
import { validerIntention, appliquerIntention, vieillirLesEtats, ticsDeFinDeManche } from '../cerveau_combat.js';
import { coutDuPas, planifierTrajet } from '../mouvement_pur.js';
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
const XP = { 1: 0, 4: 1800, 5: 2500, 9: 6400, 10: 7900 };
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

console.log("\n=========================================================");
console.log("  LE VAMPIRE");
console.log("=========================================================");

console.log("\n1. LES PALIERS, ET LES VARGENS");
{
    const a1 = w.atoutRace(vampire(1)), a5 = w.atoutRace(vampire(5)), a10 = w.atoutRace(vampire(10));
    verifier("niveau 1 : +10 résistance physique, feu aggravé, insensible au gel — plus de case gratuite",
             a1.defPhysique === 10 && a1.brulureAggravee === true && JSON.stringify(a1.immunites) === '["Glacé"]' && !a1.premierPasGratuit,
             JSON.stringify(a1));
    verifier("niveau 5 : le Baiser du vampire (technique), plus de Vampirisme dans la Forge",
             JSON.stringify(a5.techniques) === '["CLASSE_BAISER_VAMPIRE"]' && !(a5.effets || []).length, JSON.stringify(a5));
    verifier("niveau 10 : + la Nuée de chauve-souris",
             JSON.stringify(a10.techniques) === '["CLASSE_BAISER_VAMPIRE","CLASSE_NUEE_CHAUVES_SOURIS"]', JSON.stringify(a10.techniques));
    verifier("niveau 4 : pas encore de Baiser", !(w.atoutRace(vampire(4)).techniques || []).length);
    const t = w.TECHNIQUES_CLASSE.CLASSE_NUEE_CHAUVES_SOURIS;
    verifier("la Nuée : init 100, aucune fatigue, sur soi", t.Initiative === 100 && t.Fatigue === 0 && t.cible === "soi");
    const baiser = w.TECHNIQUES_CLASSE.CLASSE_BAISER_VAMPIRE;
    verifier("le Baiser : niveau 5, init 100, aucune fatigue, sur un ennemi au contact",
             baiser && baiser.niveau === 5 && baiser.Initiative === 100 && baiser.Fatigue === 0 && baiser.cible === "ennemiAdjacent",
             JSON.stringify(baiser));
    verifier("un Vargen ne peut pas être Vampire", w.classeInterditeA("Vargen", "Vampire") && w.classeInterditeA("Vargen", "vampire"));
    verifier("…mais peut être autre chose, et les autres peuples peuvent être Vampire",
             !w.classeInterditeA("Vargen", "Assassin") && !w.classeInterditeA("Humain", "Vampire") && !w.classeInterditeA("Ondari", "Vampire"));
    verifier("chaque atout du Vampire s'écrit en clair",
             !w.texteAtout("brulureAggravee", true).startsWith("brulureAggravee") && /Glacé/.test(w.texteAtout("immunites", ["Glacé"])),
             w.texteAtout("brulureAggravee", true) + " | " + w.texteAtout("immunites", ["Glacé"]));
    const e = monde(1);
    verifier("en combat : 10 de résistance physique de plus qu'un héros sans classe",
             e.combattants.V.def.physique - e.combattants.H.def.physique === 10,
             `${e.combattants.V.def.physique} / ${e.combattants.H.def.physique}`);
    verifier("…et ses atouts dans le combattant (feu aggravé, insensible au gel)",
             e.combattants.V.atouts.brulureAggravee === true && e.combattants.V.atouts.immunites.includes("Glacé")
             && !e.combattants.V.atouts.premierPasGratuit && !e.combattants.H.atouts.brulureAggravee);
}

console.log("\n2. LE FEU LE RONGE PLUS FORT");
{
    const e = monde(1);
    e.combattants.V.etats = [{ ...BRULE }]; e.combattants.H.etats = [{ ...BRULE }];
    e.combattants.V.def.physique = 0; e.combattants.H.def.physique = 0;   // le seul feu, sans armure
    verifier("soins reçus : -60 % pour lui, -50 % pour les autres",
             regleDesEtats(e.combattants.V, "soinsRecus") === -60 && regleDesEtats(e.combattants.H, "soinsRecus") === -50);
    verifier("brûlure : 18 % des PV max par manche pour lui, 8 % pour les autres",
             regleDesEtats(e.combattants.V, "pvMaxParTour") === 18 && regleDesEtats(e.combattants.H, "pvMaxParTour") === 8);
    ticsDeFinDeManche(e);
    verifier("fin de manche : il perd 18 PV (sur 100), l'autre 8",
             e.combattants.V.pv === 82 && e.combattants.H.pv === 92, `${e.combattants.V.pv} / ${e.combattants.H.pv}`);
    const s = monde(1);
    s.combattants.V.etats = [{ ...BRULE }]; s.combattants.V.pv = 50;
    s.combattants.A.etats = [{ ...BRULE }]; s.combattants.A.pv = 50;
    const soin = resoudreCarte(s, { type: "carte", idLanceur: "H", idCarte: "S", critique: false, alterations: [],
        attaques: [{ valeurBrute: 10, typeRes: "Magique", isHeal: true, cibles: ["V", "A"] }],
        jets: { attaqueRatee: false, parCible: { V: { esquive: false, etats: {} }, A: { esquive: false, etats: {} } } } });
    verifier("un soin de 10 lui rend 4 PV (−60 %), 5 à un allié brûlé (−50 %)",
             soin.etat.combattants.V.pv === 54 && soin.etat.combattants.A.pv === 55,
             `${soin.etat.combattants.V.pv} / ${soin.etat.combattants.A.pv}`);
    const sain = monde(1);
    verifier("sans brûlure : rien de tout ça", regleDesEtats(sain.combattants.V, "soinsRecus") === 0);
}

console.log("\n3. INSENSIBLE AU GEL (LA PREMIÈRE CASE GRATUITE EST RETIRÉE)");
{
    const e = monde(1);
    const V = e.combattants.V, H = e.combattants.H;
    verifier("la première case lui coûte comme à tout le monde (2)", coutDuPas(V, 1, false, false) === 2 && coutDuPas(H, 1, false, false) === 2);
    const glacer = resoudreCarte(monde(1), { type: "carte", idLanceur: "M1", idCarte: "G", critique: false,
        attaques: [{ valeurBrute: 1, typeRes: "Magique", cibles: ["V", "A"] }],
        alterations: [{ nom: "Glacé", chance: 100, duree: 2, cibles: ["V", "A"] }],
        jets: { attaqueRatee: false, parCible: { V: { esquive: false, etats: { "Glacé": true } }, A: { esquive: false, etats: { "Glacé": true } } } } });
    verifier("le Vampire n'est jamais Glacé", !glacer.etat.combattants.V.etats.some(x => x.nom === "Glacé")
             && glacer.etapes.some(x => x.type === "etatRate" && x.cible === "V" && x.immunise), JSON.stringify(glacer.etat.combattants.V.etats));
    verifier("un allié, lui, l'est", glacer.etat.combattants.A.etats.some(x => x.nom === "Glacé"));
}

// Le Vampirisme n'est plus donné par la classe ; le moteur garde son soin
// pour les cartes déjà forgées — et le Baiser du vampire s'en sert.
console.log("\n4. LE SOIN DU VAMPIRISME (moteur) : 70 % DE CE QUE LA CARTE INFLIGE, SUR LUI");
{
    const e = monde(5); e.combattants.V.pv = 40;
    const r = resoudreCarte(e, carte([sort(10, ["M1"])]));
    verifier("10 dégâts magiques à M1 : il reprend 7 PV", r.etat.combattants.M1.pv === 90 && r.etat.combattants.V.pv === 47,
             `${r.etat.combattants.M1.pv} / ${r.etat.combattants.V.pv}`);
    verifier("une étape de soin à part, marquée 🩸", soinDuVampire(r) === 7 && r.etapes.some(x => x.type === "soin" && x.drain && x.cible === "V"));
    const deux = resoudreCarte(monde(5, { PV_Actuels: 40 }), carte([sort(10, ["M1", "M2"])]));
    verifier("deux ennemis touchés : 70 % des 20, cumulés (14)", soinDuVampire(deux) === 14, `${soinDuVampire(deux)}`);
    const toute = resoudreCarte(monde(5, { PV_Actuels: 40 }),
        carte([sort(1, ["M1"]), { nom: "Attaque Légère", valeurBrute: 9, typeRes: "Physique", cibles: ["M1"] }]));
    verifier("toute la carte compte : 1 de Vampirisme + 9 physiques → 7", soinDuVampire(toute) === 7, `${soinDuVampire(toute)}`);
    const arrondi = resoudreCarte(monde(5, { PV_Actuels: 40 }), carte([sort(3, ["M1"])]));
    verifier("arrondi à l'inférieur : 3 dégâts → 2", soinDuVampire(arrondi) === 2, `${soinDuVampire(arrondi)}`);
    const esq = resoudreCarte(monde(5, { PV_Actuels: 40 }), carte([sort(10, ["M1", "M2"])], ["M2"]));
    verifier("une cible qui esquive ne nourrit rien (7 sur M1 seul)", soinDuVampire(esq) === 7, `${soinDuVampire(esq)}`);
    const bou = monde(5, { PV_Actuels: 40 }); bou.combattants.M1.bouclier = 4;
    const rb = resoudreCarte(bou, carte([sort(10, ["M1"])]));
    verifier("le bouclier entamé compte (4 encaissés → 2)", soinDuVampire(rb) === 2, `${soinDuVampire(rb)}`);
    const presque = monde(5, { PV_Actuels: 40 }); presque.combattants.M1.pv = 3;
    verifier("seuls les PV réellement perdus comptent (3 → 2)", soinDuVampire(resoudreCarte(presque, carte([sort(10, ["M1"])]))) === 2);
    const allie = resoudreCarte(monde(5, { PV_Actuels: 40 }), carte([sort(10, ["A"])]));
    verifier("frapper un allié ne le soigne pas", soinDuVampire(allie) === 0);
    const plein = resoudreCarte(monde(5, { PV_Actuels: 98 }), carte([sort(10, ["M1"])]));
    verifier("jamais au-dessus de ses PV max", plein.etat.combattants.V.pv === 100);
    const br = monde(5, { PV_Actuels: 40 }); br.combattants.V.etats = [{ ...BRULE }];
    verifier("brûlé : 7 × 40 % → 3", soinDuVampire(resoudreCarte(br, carte([sort(10, ["M1"])]))) === 3);
    const sans = resoudreCarte(monde(5, { PV_Actuels: 40 }), carte([{ nom: "Attaque Magique", valeurBrute: 10, typeRes: "Magique", cibles: ["M1"] }]));
    verifier("une carte sans Vampirisme ne soigne rien", soinDuVampire(sans) === 0 && sans.etat.combattants.V.pv === 40);
    // Par le cerveau, dés compris : le champ voyage avec la carte.
    const c = enTete(monde(5, { PV_Actuels: 40 }), "V", "C");
    const pas = appliquerIntention(c, { id: "I2", type: "carte", acteur: "V", idCarte: "C", coutFatigue: 5,
        attaques: [sort(10, ["M1"])], alterations: [] });
    const coup = pas.entree.etapes.find(x => x.type === "degats" && x.cible === "M1");
    const soin = pas.entree.etapes.find(x => x.type === "soin" && x.cible === "V");
    verifier("chez le cerveau : le coup puis le soin, 70 % arrondi",
             coup && soin && soin.montant === Math.floor(coup.montant * 0.7), `${coup && coup.montant} → ${soin && soin.montant}`);
    verifier("rejoué depuis le journal : mêmes PV", appliquerEntree(c, pas.entree).combattants.V.pv === pas.etat.combattants.V.pv);
    const scene = misEnScene(soin, pas.etat);
    verifier("à l'écran : « +N 🩸 » sur le Vampire", scene && /🩸/.test(scene.texte || ""), JSON.stringify(scene));
}

console.log("\n4 bis. LE BAISER DU VAMPIRE : 25 % DES PV MAX EN BRUT, 60 % EN SOIN");
{
    const baiser = (cible = "M1") => ({ id: "B1", type: "classe", acteur: "V", idCarte: "CLASSE_BAISER_VAMPIRE", cible });
    const e = enTete(monde(5, { PV_Actuels: 40 }), "V", "CLASSE_BAISER_VAMPIRE");
    e.combattants.M1.def = { ...e.combattants.M1.def, magique: 50, physique: 50, esquive: 100, parade: 100 };
    verifier("niveau 5 : acceptée sur un ennemi au contact", validerIntention(e, baiser()).ok, validerIntention(e, baiser()).raison || "");
    verifier("niveau 4 : il ne l'a pas", !validerIntention(enTete(monde(4), "V", "CLASSE_BAISER_VAMPIRE"), baiser()).ok);
    verifier("pas sur un allié", !validerIntention(e, baiser("A")).ok);
    const loin = enTete(monde(5), "V", "CLASSE_BAISER_VAMPIRE"); loin.combattants.M2.q = 4; loin.combattants.M2.r = 0;
    verifier("pas sur un ennemi hors de portée", !validerIntention(loin, baiser("M2")).ok, validerIntention(loin, baiser("M2")).raison || "");
    const pas = appliquerIntention(e, baiser());
    const M1 = pas.etat.combattants.M1, V = pas.etat.combattants.V;
    verifier("25 % de 100 PV max = 25 dégâts bruts, malgré 50 % de défenses et 100 % d'esquive", M1.pv === 75, `${M1.pv}`);
    verifier("le Vampire se soigne de 60 % : 15 PV (40 → 55)", V.pv === 55, `${V.pv}`);
    verifier("aucune fatigue, technique utilisée, tour clos",
             V.fatigue === 100 && V.techniquesUtilisees.includes("CLASSE_BAISER_VAMPIRE") && pas.etat.file[0].id === "M1");
    verifier("une seconde fois dans le combat : refusée",
             !validerIntention(enTete(clonerEtat(pas.etat), "V", "CLASSE_BAISER_VAMPIRE"), baiser()).ok);
    verifier("rejoué depuis le journal : mêmes PV des deux côtés",
             appliquerEntree(e, pas.entree).combattants.M1.pv === 75 && appliquerEntree(e, pas.entree).combattants.V.pv === 55);
    const gros = enTete(monde(5, { PV_Actuels: 40 }), "V", "CLASSE_BAISER_VAMPIRE");
    gros.combattants.M1.pvMax = 250; gros.combattants.M1.pv = 250;
    verifier("sur 250 PV max : 63 (arrondi au-dessus), soin 37", (() => { const r = appliquerIntention(gros, baiser());
             return r.etat.combattants.M1.pv === 187 && r.etat.combattants.V.pv === 77; })());
    const bou = enTete(monde(5, { PV_Actuels: 40 }), "V", "CLASSE_BAISER_VAMPIRE"); bou.combattants.M1.bouclier = 10;
    const rb = appliquerIntention(bou, baiser());
    // Règle du jeu : un bouclier qui casse arrête aussi le surplus.
    verifier("le bouclier encaisse (10, le surplus est perdu) : soin sur les 10 → 6",
             rb.etat.combattants.M1.bouclier === 0 && rb.etat.combattants.M1.pv === 100 && rb.etat.combattants.V.pv === 46,
             `🛡️${rb.etat.combattants.M1.bouclier} / ${rb.etat.combattants.V.pv}`);
    const br = enTete(monde(5, { PV_Actuels: 40 }), "V", "CLASSE_BAISER_VAMPIRE"); br.combattants.V.etats = [{ ...BRULE }];
    verifier("brûlé : 15 × 40 % → 6", appliquerIntention(br, baiser()).etat.combattants.V.pv === 46);
    const scene = misEnScene({ type: "techniqueClasse", acteur: "V", idCarte: "CLASSE_BAISER_VAMPIRE" }, pas.etat);
    verifier("à l'écran : « 🩸 Baiser du vampire »", /Baiser du vampire/.test(scene.texte || ""), scene.texte);
}

console.log("\n5. NUÉE DE CHAUVE-SOURIS : L'ESQUIVE À 40 %, DEUX MANCHES");
{
    const e = enTete(monde(10), "V", "CLASSE_NUEE_CHAUVES_SOURIS");
    e.combattants.V.def.esquive = 10;
    const nuee = { id: "N1", type: "classe", acteur: "V", idCarte: "CLASSE_NUEE_CHAUVES_SOURIS" };
    verifier("niveau 10 : acceptée", validerIntention(e, nuee).ok, validerIntention(e, nuee).raison || "");
    verifier("niveau 9 : il ne l'a pas", !validerIntention(enTete(monde(9), "V", "CLASSE_NUEE_CHAUVES_SOURIS"), nuee).ok);
    const pas = appliquerIntention(e, nuee);
    const V = pas.etat.combattants.V;
    verifier("son esquive passe de 10 à 40", esquiveDe(V) === 40, `${esquiveDe(V)}`);
    verifier("technique utilisée, tour clos, aucune fatigue",
             V.techniquesUtilisees.includes("CLASSE_NUEE_CHAUVES_SOURIS") && pas.etat.file[0].id === "M1" && V.fatigue === 100);
    const haut = clonerEtat(pas.etat); haut.combattants.V.def.esquive = 70;
    verifier("plus haute, elle le reste (70)", esquiveDe(haut.combattants.V) === 70);
    const etourdi = clonerEtat(pas.etat); etourdi.combattants.V.etats.push({ nom: "Étourdi", duree: 1 });
    verifier("étourdi (-30) : toujours 40", esquiveDe(etourdi.combattants.V) === 40, `${esquiveDe(etourdi.combattants.V)}`);
    const sansNuee = monde(10); sansNuee.combattants.H.etats = [{ nom: "Étourdi", duree: 1 }];
    verifier("sans Nuée, rien ne retient l'esquive : un Étourdi la met à -30", esquiveDe(sansNuee.combattants.H) === -30,
             `${esquiveDe(sansNuee.combattants.H)}`);
    const s1 = clonerEtat(pas.etat); vieillirLesEtats(s1);
    verifier("après la fin de cette manche : toujours là", esquiveDe(s1.combattants.V) === 40 && s1.combattants.V.etats.some(x => x.nom === ETAT_NUEE));
    vieillirLesEtats(s1);
    verifier("après la manche suivante : partie (10)", esquiveDe(s1.combattants.V) === 10 && !s1.combattants.V.etats.some(x => x.nom === ETAT_NUEE));
    verifier("rejouée depuis le journal : même état", appliquerEntree(e, pas.entree).combattants.V.etats.some(x => x.nom === ETAT_NUEE));
    verifier("une seconde fois dans le combat : refusée",
             !validerIntention(enTete(clonerEtat(pas.etat), "V", "CLASSE_NUEE_CHAUVES_SOURIS"), nuee).ok);
    const scene = misEnScene({ type: "techniqueClasse", acteur: "V", idCarte: "CLASSE_NUEE_CHAUVES_SOURIS" }, pas.etat);
    verifier("à l'écran : « 🦇 Nuée de chauve-souris »", /Nuée de chauve-souris/.test(scene.texte || ""));
}
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

console.log("\n6. LA FORGE : PLUS DE VAMPIRISME (remplacé par le Baiser) ; UNE CARTE D'AVANT GARDE SON SOIN");
{
  const r = await p.evaluate(async (EFFETS) => {
    window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
    delete window.EFFETS_BDD_CACHE.EFF_VAMPIRISME;
    window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
    const forgePour = async (perso) => {
      window.__docs = { "Personnages/P1": perso, "Caracteristiques/P1": {} };
      document.getElementById("champ-id-personnage").value = "P1";
      window.OUVERTURE_FORGE_EN_COURS = false;
      await window.ouvrirCreationCompetence();
      const ids = (window.forgeState.effetsBDD || []).map(e => e.id);
      window.fermerForgeCompetence();
      return ids;
    };
    return { v4: (await forgePour({ Classe: "Vampire", XP: 1800, Race: "Humain" })).includes("EFF_VAMPIRISME"),
             v5: (await forgePour({ Classe: "Vampire", XP: 2500, Race: "Humain" })).includes("EFF_VAMPIRISME"),
             autre: (await forgePour({ Classe: "Nécromancien", XP: 9000, Race: "Humain" })).includes("EFF_VAMPIRISME"),
             monstres: window.paletteEffetsMonstres().some(e => e.id === "EFF_VAMPIRISME"),
             magique: window.actionEstMagique("Vampirisme") };
  }, EFFETS_PAR_ID);
  verifier("plus personne ne l'a dans la Forge, même le Vampire niveau 5", !r.v5 && !r.v4 && !r.autre && !r.monstres, JSON.stringify(r));
  verifier("c'est un sort (action magique)", r.magique);

  const ex = await p.evaluate(async () => {
    window.PERSOS_PARTIE = [{ idPersonnage: "V1", camp: "Allié", prenom: "Vlad", classe: "Vampire", xp: 2500,
                              PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }];
    window.TOKENS_VTT_DATA = { V1: { q: 0, r: 0 } };
    window.COMPETENCES_CACHE = { S1: { Nom: "Morsure", Arme: "Magie", Fatigue: 10, Initiative: 50,
      Composants: { actions: [{ baseEffetId: "EFF_VAMPIRISME", count: 3, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } } };
    window.CACHE_COMPETENCES_GLOBAL = { V1: window.COMPETENCES_CACHE };
    return ((await window.demarrerCiblage("S1", { extraire: true, idLanceur: "V1" })) || {}).attaques || [];
  });
  const a = ex[0] || {};
  verifier("Vampirisme ×3 : 3 dégâts magiques, et la part de 70 % pour le soin",
           a.valeurBrute === 3 && a.typeRes === "Magique" && a.vampirisme === 70 && !a.isHeal, JSON.stringify(a).slice(0, 160));
}

console.log("\n7. LA GRILLE DES CLASSES : LE VAMPIRE GRISÉ POUR UN VARGEN");
{
  const r = await p.evaluate(async () => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    const lire = async (race) => {
      window.RACE_SELECTIONNEE_TEMP = race;
      await window.ouvrirChoixClasse();
      const carte = document.querySelector('.carte-classe[data-classe="CLASSE_VAMPIRE"]');
      const autre = document.querySelector('.carte-classe[data-classe="CLASSE_ASSASSIN"]');
      return { grisee: carte.classList.contains("carte-classe-interdite"), filtre: getComputedStyle(carte).filter,
               autreGrisee: autre.classList.contains("carte-classe-interdite") };
    };
    const vargen = await lire("Vargen");
    document.querySelector('.carte-classe[data-classe="CLASSE_VAMPIRE"]').click();
    const msg = document.getElementById("message-classe-interdite");
    const apresClic = { ficheOuverte: getComputedStyle(document.getElementById("vue-fiche-classe")).display !== "none",
                        message: msg && getComputedStyle(msg).display !== "none" ? msg.textContent : null };
    const humain = await lire("Humain");
    window.ouvrirFicheClasse("CLASSE_VAMPIRE");
    const d = document.getElementById("descriptif-fiche-classe");
    const fiche = { niveaux: [...d.querySelectorAll(".palier-classe-niveau")].map(x => x.textContent.trim()), texte: d.textContent,
                    messageCache: getComputedStyle(document.getElementById("message-classe-interdite")).display === "none" };
    window.validerClasse();
    const champHumain = document.getElementById("champ-classe").value;
    // Le joueur revient aux peuples et choisit Vargen : la classe tombe.
    window.changerRaceSelection("Vargen");
    return { vargen, apresClic, humain, fiche, champHumain, champApresVargen: document.getElementById("champ-classe").value };
  });
  verifier("Vargen : la carte Vampire est grisée", r.vargen.grisee && /grayscale/.test(r.vargen.filtre), JSON.stringify(r.vargen));
  verifier("…les autres classes non", !r.vargen.autreGrisee);
  verifier("un clic dessus n'ouvre pas sa fiche, et le dit",
           !r.apresClic.ficheOuverte && /Vargens ne peuvent pas être Vampire/.test(r.apresClic.message || ""), JSON.stringify(r.apresClic));
  verifier("Humain : rien de grisé, la fiche s'ouvre", !r.humain.grisee && JSON.stringify(r.fiche.niveaux) === '["Niv. 1","Niv. 5","Niv. 10"]');
  verifier("la fiche dit le feu, le gel, le Baiser (25 %, 60 %) et la Nuée à 40 % — plus la case gratuite ni le Vampirisme",
           /18 %/.test(r.fiche.texte) && /Gel/.test(r.fiche.texte) && /Baiser du vampire/.test(r.fiche.texte) && /25 %/.test(r.fiche.texte)
           && /60 %/.test(r.fiche.texte) && /Nuée/.test(r.fiche.texte) && /40 %/.test(r.fiche.texte)
           && !/première case/.test(r.fiche.texte) && !/Vampirisme/.test(r.fiche.texte));
  verifier("le message ne traîne pas sur la fiche suivante", r.fiche.messageCache);
  verifier("un Humain peut la valider", r.champHumain === "Vampire");
  verifier("redevenu Vargen, la classe Vampire est oubliée", r.champApresVargen === "", r.champApresVargen);
}

console.log("\n8. LE BAISER À L'ÉCRAN : ON CHOISIT L'ENNEMI AU CONTACT");
{
  const r = await p.evaluate(() => {
    window.PERSOS_PARTIE = [
      { idPersonnage: "V1", camp: "Allié", prenom: "Vlad", classe: "Vampire", xp: 2500, PV_Max: 40, PV_Actuels: 40, statut: "Vivant" },
      { idPersonnage: "A1", camp: "Allié", prenom: "Ama", PV_Max: 40, PV_Actuels: 40, statut: "Vivant" },
      { idPersonnage: "M1", camp: "Ennemi", estMonstre: true, nom: "Gnoll", PV_Max: 40, PV_Actuels: 40, statut: "Vivant" },
      { idPersonnage: "M2", camp: "Ennemi", estMonstre: true, nom: "Loup", PV_Max: 40, PV_Actuels: 40, statut: "Vivant" }];
    window.TOKENS_VTT_DATA = { V1: { q: 0, r: 0 }, A1: { q: 0, r: 1 }, M1: { q: 1, r: 0 }, M2: { q: 4, r: 0 } };
    const appels = [];
    window.regimeDemande = { techniqueClasse: (...a) => { appels.push(a); return null; }, etat: () => null, enVol: () => false };
    window.lancerTechniqueClasse("CLASSE_BAISER_VAMPIRE", "V1");
    const f = document.getElementById("fenetre-choix-rempart");
    const choix = [...f.querySelectorAll(".choix-rempart-allie")].map(x => x.textContent.trim());
    const titre = f.querySelector(".choix-rempart-titre").textContent;
    f.querySelector(".choix-rempart-allie").click();
    return { titre, choix, appels, ferme: f.style.display === "none" };
  });
  verifier("la fenêtre « Baiser du vampire » propose le seul ennemi au contact (pas l'allié, pas l'ennemi lointain)",
           /Baiser du vampire/.test(r.titre) && JSON.stringify(r.choix) === '["Gnoll"]', JSON.stringify(r));
  verifier("le choix part au cerveau : (V1, Baiser, M1)",
           JSON.stringify(r.appels) === '[["V1","CLASSE_BAISER_VAMPIRE","M1"]]' && r.ferme, JSON.stringify(r.appels));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
