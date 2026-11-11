// LA CLASSE PRÊTRE DE LA LUMIÈRE (v359, nouvelle).
//
// Nico : « NIVEAU 1 : PASSIF Maîtrise de la lumière — 33 % de chance d'aveugler une cible avec
// un sort de foudre, fixe, ne se cumule pas avec l'effet AVEUGLEMENT. PASSIF Purification par la
// lumière — lorsqu'il utilise Purification sur un allié, celui-ci bénéficie d'une annulation du
// prochain état néfaste qu'il devrait subir. +1 compétence. NIVEAU 3 : PASSIF Vision dans les
// ténèbres — insensible à l'AVEUGLEMENT. NIVEAU 5 : Appel de la lumière (aveugle tous les
// combattants sur la map). NIVEAU 9 : les alliés proches du prêtre récupèrent 3 PV à chaque fin
// de tour ; COMPÉTENCE Désintégration par la foudre — portée 2, fatigue 75, réserve au prochain
// tour 60, initiative 75 ; tue immédiatement un ennemi ayant 50 % de ses PV ou moins ; l'ennemi
// éliminé ne génère aucun butin, uniquement de l'expérience. »
// Ses réponses : la garde dure jusqu'à usage, sur un allié seulement (pas lui) ; l'aura : les
// alliés au contact, pas lui ; la Désintégration est refusée au-dessus de 50 %, une fois par
// combat ; l'Appel aveugle tout le monde sauf le prêtre (init 100, 0 fatigue, une fois).
//
// Lancer : node tests_monstres/pretre_lumiere.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat, creerDes } from '../combat_etat.js';
import { resoudreCarte, tirerDesCarte, chanceFaceA, immuniseA, reserveMaintenueDe, ETAT_GARDE_LUMIERE, gardeAnnule,
         DUREE_AVEUGLE_LUMIERE, estEtatNefaste } from '../moteur_pur.js';
import { validerIntention, appliquerIntention, cloturerTour, vieillirLesEtats } from '../cerveau_combat.js';
import { misEnScene, fichesDepuisEtat } from '../pont_combat.js';

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
const XP = { 1: 0, 2: 700, 3: 1200, 4: 1800, 5: 2500, 8: 5200, 9: 6400 };
const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const pretre = (niveau, extra = {}) => fiche("P", { classe: "Prêtre de la lumière", xp: XP[niveau], ...extra });
// P (0,0) ; A allié au contact (0,1) ; B allié loin (-4,0) ; M1 (2,0) ; M2 (1,-1) au contact ; M3 (6,0).
const POS = { P: { q: 0, r: 0 }, A: { q: 0, r: 1 }, B: { q: -4, r: 0 }, M1: { q: 2, r: 0 }, M2: { q: 1, r: -1 }, M3: { q: 6, r: 0 } };
const monde = (niveau = 9, extraP = {}, graine = 1) => {
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine, regles: REGLES, partie: { Tour_Combat: 1 }, positions: POS,
        combattants: [pretre(niveau, extraP), fiche("A"), fiche("B"), fiche("M1"), fiche("M2"), fiche("M3")] });
    e.ordre = ["P", "A", "B", "M1", "M2", "M3"]; e.phase = "Resolution";
    return e;
};
const enTete = (e, carte, id = "P") => { e.file = [{ id, carte, initiative: 75, pas: 0 }, { id: id === "M1" ? "A" : "M1", carte: "X", initiative: 10, pas: 0 }]; return e; };
const etat = (c, nom) => (c.etats || []).find(x => x.nom === nom);
const desA = (v) => ({ d100: () => v, parmi: (l) => l[0], fraction: () => 0, graine: () => 1 });
const DES_FIN = { d100: () => 100, parmi: (l) => l[0], fraction: () => 0, graine: () => 1 };

console.log("\n1. LES PALIERS");
{
    const a = (n) => w.atoutClasse(pretre(n));
    verifier("niveau 1 : Maîtrise de la lumière 33, garde de Purification, +1 compétence",
             a(1).maitriseLumiere === 33 && a(1).gardePurification === true && a(1).competences === 1 && !(a(1).techniques || []).length, JSON.stringify(a(1)));
    verifier("niveau 3 : insensible à l'Aveuglement (pas au 2)", JSON.stringify(a(3).insensibleA) === '["Aveuglé"]' && !a(2).insensibleA);
    verifier("niveau 5 : Appel de la lumière ; niveau 9 : aura de 3 et Désintégration (pas au 8)",
             JSON.stringify(a(5).techniques) === '["CLASSE_APPEL_LUMIERE"]' && a(9).auraSoin === 3
             && JSON.stringify(a(9).techniques) === '["CLASSE_APPEL_LUMIERE","CLASSE_DESINTEGRATION"]' && !a(8).auraSoin);
    const ap = w.TECHNIQUES_CLASSE.CLASSE_APPEL_LUMIERE, de = w.TECHNIQUES_CLASSE.CLASSE_DESINTEGRATION;
    verifier("Appel : init 100, 0 fatigue, sur soi, niveau 5, Prêtre", ap.Initiative === 100 && ap.Fatigue === 0 && ap.cible === "soi" && ap.niveau === 5 && ap.classe === "Prêtre de la lumière");
    verifier("Désintégration : init 75, 75 de fatigue, un ennemi à 2 cases, réserve 60 sans relâche",
             de.Initiative === 75 && de.Fatigue === 75 && de.cible === "ennemi" && de.portee === 2 && de.niveau === 9
             && de.reserve.parTour === 60 && de.reserve.sansRelache === true && de.reserve.coutLancement + de.reserve.parTour === 75
             && !!w.TECHNIQUES_VISEES.CLASSE_DESINTEGRATION);
    verifier("les textes", /33 %/.test(w.texteAtout("maitriseLumiere", 33)) && /prochain état néfaste/.test(w.texteAtout("gardePurification", true))
             && /Aveuglé/.test(w.texteAtout("insensibleA", ["Aveuglé"])) && /3 PV/.test(w.texteAtout("auraSoin", 3)));
}

console.log("\n2. LA MAÎTRISE DE LA LUMIÈRE : 33 % D'AVEUGLER AVEC LA FOUDRE");
{
    const foudre = (element = "Foudre") => ({ type: "carte", idLanceur: "P", idCarte: "S", critique: false,
        attaques: [{ nom: "Attaque Magique", valeurBrute: 10, typeRes: "Magique", rangeMax: 3, element, cibles: ["M1"] }], alterations: [] });
    const jouer = (e, action, des) => resoudreCarte(e, { ...action, jets: tirerDesCarte(e, action, "P", false, des) });
    const r = jouer(monde(1), foudre(), desA(1));
    verifier("dés à 1 : M1 aveuglé 2 manches, « ⚡ Ébloui par l'éclair ! »",
             etat(r.etat.combattants.M1, "Aveuglé") && etat(r.etat.combattants.M1, "Aveuglé").duree === DUREE_AVEUGLE_LUMIERE
             && r.etapes.some(x => x.type === "message" && /Ébloui par l'éclair/.test(x.texte)));
    let n = 0;
    const j34 = tirerDesCarte(monde(1), foudre(), "P", false, { ...desA(1), d100: () => { n++; return n === 2 ? 34 : 1; } });
    n = 0;
    const j33 = tirerDesCarte(monde(1), foudre(), "P", false, { ...desA(1), d100: () => { n++; return n === 2 ? 33 : 1; } });
    verifier("34 au dé : rien ; 33 : aveuglé", j34.parCible.M1.lumiereAveugle === false && j33.parCible.M1.lumiereAveugle === true);
    verifier("un sort de feu : rien", !etat(jouer(monde(1), foudre("Feu"), desA(1)).etat.combattants.M1, "Aveuglé"));
    let tires = 0;
    tirerDesCarte(monde(1), foudre("Feu"), "P", false, { ...desA(100), d100: () => { tires++; return 100; } });
    verifier("…et pas un dé de plus", tires === 1);
    // Avec un Aveuglement à 20 % sur la carte : la plus forte des deux (33), en un seul jet.
    const avecAlt = { ...foudre(), alterations: [{ nom: "Aveuglé", chance: 20, duree: 2, cibles: ["M1"] }] };
    let k = 0;
    const jA = tirerDesCarte(monde(1), avecAlt, "P", false, { ...desA(1), d100: () => { k++; return k === 2 ? 30 : 1; } });
    verifier("avec un Aveuglement à 20 % : 30 au dé prend (33, pas 20), sans second jet", jA.parCible.M1.etats["Aveuglé"] === true
             && jA.parCible.M1.lumiereAveugle === undefined);
}

console.log("\n3. LA PURIFICATION PAR LA LUMIÈRE : LA GARDE");
{
    const purif = (cible) => ({ type: "carte", idLanceur: "P", idCarte: "PU", critique: false,
        attaques: [{ nom: "Purification", valeurBrute: 0, typeRes: "Magique", isHeal: true, purifChance: 100, purifNombre: 1, rangeMax: 3, cibles: [cible] }],
        alterations: [], jets: { attaqueRatee: false, parCible: { [cible]: { esquive: false, etats: {}, purifie: true, purifJet: 1 } } } });
    const e = monde(1); e.combattants.A.etats = [{ nom: "Empoisonnement", duree: 2 }];
    const r = resoudreCarte(e, purif("A"));
    const A = r.etat.combattants.A;
    verifier("un allié purifié : son poison part, il garde une Lumière protectrice", !etat(A, "Empoisonnement") && etat(A, ETAT_GARDE_LUMIERE)
             && etat(A, ETAT_GARDE_LUMIERE).duree >= 999, JSON.stringify(A.etats));
    verifier("la garde n'est pas un état néfaste (une purification ne l'enlève pas)", !estEtatNefaste({ nom: ETAT_GARDE_LUMIERE }));
    verifier("rejoué depuis le journal : la garde est là", !!etat(appliquerEntree(e, { etapes: r.etapes }).combattants.A, ETAT_GARDE_LUMIERE));
    verifier("lui-même purifié : pas de garde", !etat(resoudreCarte(monde(1), purif("P")).etat.combattants.P, ETAT_GARDE_LUMIERE));
    verifier("un ennemi purifié : pas de garde", !etat(resoudreCarte(monde(1), purif("M1")).etat.combattants.M1, ETAT_GARDE_LUMIERE));
    const autre = monde(1); autre.combattants.P.atouts.gardePurification = false;
    verifier("un autre soigneur : pas de garde", !etat(resoudreCarte(autre, purif("A")).etat.combattants.A, ETAT_GARDE_LUMIERE));
    const vieux = clonerEtat(r.etat); for (let i = 0; i < 6; i++) vieillirLesEtats(vieux);
    verifier("inutilisée, elle tient (6 manches plus tard)", !!etat(vieux.combattants.A, ETAT_GARDE_LUMIERE));

    // Un ennemi le brûle : annulé, la garde part. Le suivant prend.
    const brule = () => ({ type: "carte", idLanceur: "M1", idCarte: "X", critique: false, attaques: [],
        alterations: [{ nom: "Brûlé", chance: 100, duree: 2, cibles: ["A"] }],
        jets: { attaqueRatee: false, parCible: { A: { esquive: false, etats: { "Brûlé": true } } } } });
    const r2 = resoudreCarte(r.etat, brule());
    verifier("le premier Brûlé est annulé, la garde s'en va, et ça se dit", !etat(r2.etat.combattants.A, "Brûlé") && !etat(r2.etat.combattants.A, ETAT_GARDE_LUMIERE)
             && r2.etapes.some(x => x.type === "etatRate" && x.cible === "A" && x.garde));
    verifier("rejoué depuis le journal : ni brûlure ni garde", (s => !etat(s, "Brûlé") && !etat(s, ETAT_GARDE_LUMIERE))(appliquerEntree(r.etat, { etapes: r2.etapes }).combattants.A));
    verifier("le second Brûlé prend", !!etat(resoudreCarte(r2.etat, brule()).etat.combattants.A, "Brûlé"));
    // Un état bienfaisant ne la consomme pas.
    const garde = clonerEtat(r.etat).combattants.A, et = [];
    verifier("un état bienfaisant (Contre, Élan) ne la consomme pas", !gardeAnnule(garde, "Contre", et) && !gardeAnnule(garde, "Élan", et)
             && !!etat(garde, ETAT_GARDE_LUMIERE) && et.length === 0);
}

console.log("\n4. VISION DANS LES TÉNÈBRES : INSENSIBLE À L'AVEUGLEMENT");
{
    const p3 = monde(3).combattants.P, p1 = monde(1).combattants.P;
    verifier("niveau 3 : 0 % d'être aveuglé ; niveau 1 : la chance entière", immuniseA(p3, "Aveuglé") && chanceFaceA(p3, "Aveuglé", 100) === 0
             && chanceFaceA(p1, "Aveuglé", 60) === 60);
    const e = monde(3);
    const carte = { type: "carte", idLanceur: "M1", idCarte: "X", critique: true, attaques: [],
        alterations: [{ nom: "Aveuglé", chance: 100, duree: 2, cibles: ["P"] }] };
    const jets = tirerDesCarte(e, carte, "M1", true, creerDes(3));
    verifier("un Aveuglement à 100 %, critique : il ne prend pas", jets.parCible.P.etats["Aveuglé"] === false
             && !etat(resoudreCarte(e, { ...carte, jets }).etat.combattants.P, "Aveuglé"));
}

console.log("\n5. L'APPEL DE LA LUMIÈRE : TOUT LE MONDE SAUF LUI");
{
    const appel = { id: "L1", type: "classe", acteur: "P", idCarte: "CLASSE_APPEL_LUMIERE" };
    const e = enTete(monde(5), "CLASSE_APPEL_LUMIERE");
    e.combattants.M3.aTerre = true;
    e.combattants.B.etats = [{ nom: ETAT_GARDE_LUMIERE, duree: 999 }];
    verifier("niveau 5 : accepté ; niveau 4 : non", validerIntention(e, appel).ok && !validerIntention(enTete(monde(4), "CLASSE_APPEL_LUMIERE"), appel).ok);
    const pas = appliquerIntention(e, appel);
    const c = pas.etat.combattants;
    verifier("ennemis et allié aveuglés, 2 manches, chacun son noir", ["A", "M1", "M2"].every(id => etat(c[id], "Aveuglé")
             && etat(c[id], "Aveuglé").duree === DUREE_AVEUGLE_LUMIERE && etat(c[id], "Aveuglé").cases.length === 4));
    verifier("lui, jamais (même au niveau 5) ; un KO non plus", !etat(c.P, "Aveuglé") && !etat(c.M3, "Aveuglé"));
    verifier("l'allié gardé : annulé par sa Lumière protectrice", !etat(c.B, "Aveuglé") && !etat(c.B, ETAT_GARDE_LUMIERE));
    verifier("aucune fatigue, une fois par combat", c.P.fatigue === 100 && !validerIntention(enTete(clonerEtat(pas.etat), "CLASSE_APPEL_LUMIERE"), appel).ok);
    verifier("rejoué depuis le journal : mêmes noirs", JSON.stringify(etat(appliquerEntree(e, pas.entree).combattants.M1, "Aveuglé"))
             === JSON.stringify(etat(c.M1, "Aveuglé")));
    const titre = misEnScene(pas.entree.etapes.find(x => x.type === "techniqueClasse"), pas.etat);
    verifier("à l'écran : « ☀️ Appel de la lumière »", titre && /Appel de la lumière/.test(titre.texte));
    let pris = 0;
    for (let g = 1; g <= 200; g++) {
        const x = enTete(monde(5, {}, g), "CLASSE_APPEL_LUMIERE"); x.combattants.M1.atouts.resistances = ["Aveuglé"];
        if (etat(appliquerIntention(x, appel).etat.combattants.M1, "Aveuglé")) pris++;
    }
    verifier(`qui résiste : environ 75 % (${pris / 2} %)`, Math.abs(pris / 2 - 75) < 8);
}

console.log("\n6. L'AURA : +3 PV AUX ALLIÉS À SON CONTACT, EN FIN DE MANCHE");
{
    const e = monde(9);
    ["P", "A", "B", "M2"].forEach(id => { e.combattants[id].pv = 80; });
    e.combattants.A.etats = [];
    e.file = [{ id: "M1", carte: "X", initiative: 10, pas: 0 }];
    Object.values(e.combattants).forEach(x => { x.atouts.regenPv = 0; });
    const fin = cloturerTour(e, DES_FIN);
    const c = (fin && fin.etat || e).combattants;
    verifier("A (au contact) : 80 → 83 ; B (loin) : 80 ; lui : 80 ; M2 (ennemi au contact) : 80",
             c.A.pv === 83 && c.B.pv === 80 && c.P.pv === 80 && c.M2.pv === 80, `${c.A.pv} ${c.B.pv} ${c.P.pv} ${c.M2.pv}`);
    verifier("rejoué depuis le journal", appliquerEntree(e, fin.entree || { etapes: fin.etapes }).combattants.A.pv === 83);
    const n8 = monde(8); n8.combattants.A.pv = 80; n8.file = [{ id: "M1", carte: "X", initiative: 10, pas: 0 }];
    verifier("niveau 8 : rien", ((cloturerTour(n8, DES_FIN) || {}).etat || n8).combattants.A.pv === 80);
    const pl = monde(9); pl.combattants.A.pv = 99; pl.file = [{ id: "M1", carte: "X", initiative: 10, pas: 0 }];
    verifier("jamais au-dessus des PV max (99 → 100)", ((cloturerTour(pl, DES_FIN) || {}).etat || pl).combattants.A.pv === 100);
}

console.log("\n7. LA DÉSINTÉGRATION PAR LA FOUDRE");
{
    const desint = (cible) => ({ id: "D1", type: "classe", acteur: "P", idCarte: "CLASSE_DESINTEGRATION", cible });
    const prep = (pvM1 = 50) => { const e = enTete(monde(9), "CLASSE_DESINTEGRATION"); e.combattants.M1.pv = pvM1; return e; };
    verifier("M1 à 50 % (50/100), à 2 cases : accepté", validerIntention(prep(50), desint("M1")).ok, validerIntention(prep(50), desint("M1")).raison || "");
    verifier("à 51 % : refusé", !validerIntention(prep(51), desint("M1")).ok, validerIntention(prep(51), desint("M1")).raison || "");
    const loin = prep(); loin.combattants.M3.pv = 10;
    verifier("M3 à 6 cases : refusé ; un allié : refusé ; niveau 8 : non", !validerIntention(loin, desint("M3")).ok
             && !validerIntention(prep(), desint("A")).ok && !validerIntention((x => { x.combattants.M1.pv = 10; return x; })(enTete(monde(8), "CLASSE_DESINTEGRATION")), desint("M1")).ok);
    const mur = { etatCase: (q, r) => ({ bloquee: q === 1 && r === 0, supprimee: false, difficile: false }) };
    verifier("derrière un mur : refusé", !validerIntention(prep(), desint("M1"), mur).ok);
    const pauvre = prep(); pauvre.combattants.P.fatigue = 74;
    verifier("74 d'énergie : refusé (75)", !validerIntention(pauvre, desint("M1")).ok);
    const e = prep(40);
    const pas = appliquerIntention(e, desint("M1"));
    const c = pas.etat.combattants;
    verifier("M1 tombe sur le coup, marqué « sans butin »", c.M1.aTerre && c.M1.pv === 0 && c.M1.sansButin === true);
    verifier("il paie 75 (100 → 25), réserve de 60 posée, sans relâche", c.P.fatigue === 25
             && (c.P.etats || []).some(x => x.maintien === "CLASSE_DESINTEGRATION" && x.reserve === 60 && x.sansRelache));
    verifier("rejoué depuis le journal : à terre, sans butin", (x => x.aTerre && x.sansButin)(appliquerEntree(e, pas.entree).combattants.M1));
    verifier("la fiche projetée porte « sansButin »", fichesDepuisEtat(pas.etat, [{ idPersonnage: "M1", estMonstre: true }])[0].sansButin === true);
    verifier("une fois par combat", !validerIntention((x => { x.combattants.M2.pv = 10; return enTete(x, "CLASSE_DESINTEGRATION"); })(clonerEtat(pas.etat)), desint("M2")).ok);
    verifier("l'état reste cohérent", verifierEtatCombat(pas.etat).length === 0, verifierEtatCombat(pas.etat).join(" | "));
    const titre = misEnScene(pas.entree.etapes.find(x => x.type === "techniqueClasse"), pas.etat);
    verifier("à l'écran : « ⚡ Désintégration par la foudre »", titre && /Désintégration/.test(titre.texte));
    // M1 était le dernier de la file : la manche s'est close dans le même pas.
    verifier("la manche suivante (déjà ouverte) : 60 bloqués", pas.etat.manche === 2 && reserveMaintenueDe(c.P) === 60, `${pas.etat.manche} ${reserveMaintenueDe(c.P)}`);
    // À la fin de celle-ci : 25 < 60, la réserve tombe, sans autre suite.
    const suite = clonerEtat(pas.etat); suite.combattants.P.atouts.regenFatigue = -1000;
    suite.file = [{ id: "M2", carte: "X", initiative: 10, pas: 0 }];
    cloturerTour(suite, DES_FIN);
    verifier("à court d'énergie à la fin de la manche : la réserve tombe, rien de plus",
             !(suite.combattants.P.etats || []).some(x => x.maintien === "CLASSE_DESINTEGRATION") && !suite.combattants.P.aTerre);
    const riche = clonerEtat(pas.etat); riche.combattants.P.fatigue = 90; riche.combattants.P.atouts.regenFatigue = -1000;
    riche.file = [{ id: "M2", carte: "X", initiative: 10, pas: 0 }];
    cloturerTour(riche, DES_FIN);
    verifier("avec 90 : 60 consommés (→ 30), puis la réserve est finie", riche.combattants.P.fatigue <= 30
             && !(riche.combattants.P.etats || []).some(x => x.maintien === "CLASSE_DESINTEGRATION"), String(riche.combattants.P.fatigue));
}

// La vraie page : la grille, la fiche, le butin.
const RACINE = '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id }); export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {}; export const updateDoc = async () => {}; export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "n" }); export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const increment = (n) => n;
  export const serverTimestamp = () => Date.now(); export const onSnapshot = () => () => {};
  export const query = (...a) => ({a}); export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
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

console.log("\n8. LA PAGE : LA GRILLE, LA FICHE, LE BUTIN");
{
  const r = await p.evaluate(async () => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    await window.ouvrirChoixClasse();
    const carte = document.querySelector('.carte-classe[data-classe="CLASSE_PRETRE_DE_LA_LUMIERE"]');
    const bientot = !!(carte && (carte.dataset.bientot === "true" || carte.querySelector(".carte-classe-bientot-texte")));
    window.ouvrirFicheClasse("CLASSE_PRETRE_DE_LA_LUMIERE");
    const d = document.getElementById("descriptif-fiche-classe");
    const ouverte = getComputedStyle(document.getElementById("vue-fiche-classe")).display !== "none";
    const atouts = window.atoutRace({ classe: "Prêtre de la lumière", race: "Humain", xp: 6400 });
    window.MONSTRES_PARTIE = [{ idPersonnage: "M1", statut: "Mort", Palier: "Normal" },
                              { idPersonnage: "M2", statut: "Mort", Palier: "Normal", sansButin: true },
                              { idPersonnage: "M3", statut: "Vivant", Palier: "Normal" }];
    window.estCombattantMort = (id) => id !== "M3";
    const butin = window.creaturesDuButin(false).map(c => c.id);
    return { existe: !!carte, bientot, ouverte, niveaux: [...d.querySelectorAll(".palier-classe-niveau")].map(x => x.textContent.trim()),
             texte: d.textContent, techniques: atouts.techniques, butin };
  });
  verifier("la classe est dans la grille, sans « Arrive bientôt »", r.existe && !r.bientot);
  verifier("sa fiche s'ouvre : Niv. 1 / 3 / 5 / 9", r.ouverte && JSON.stringify(r.niveaux) === '["Niv. 1","Niv. 3","Niv. 5","Niv. 9"]', JSON.stringify(r.niveaux));
  verifier("la fiche dit la Maîtrise, la garde, la vision, l'Appel, l'aura et la Désintégration",
           /33 %/.test(r.texte) && /prochain état néfaste/.test(r.texte) && /Insensible à l'Aveuglement/.test(r.texte)
           && /Appel de la lumière/.test(r.texte) && /3 PV/.test(r.texte) && /Désintégration/.test(r.texte) && /aucun butin/.test(r.texte));
  verifier("dans le jeu, le nom accentué donne bien ses techniques", JSON.stringify(r.techniques) === '["CLASSE_APPEL_LUMIERE","CLASSE_DESINTEGRATION"]', JSON.stringify(r.techniques));
  verifier("le butin : M1 tombé compte, M2 désintégré non, M3 debout non", JSON.stringify(r.butin) === '["M1"]', JSON.stringify(r.butin));
}
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
