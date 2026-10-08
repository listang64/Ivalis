// LES TALENTS.
//
// Nico : « Dans l'onglet Aperçu, en haut, un bouton pour accéder aux talents
// du joueur, avec le nombre de talents à attribuer ; en bas, sous les effets
// de race, le rappel des talents pris. Le bouton ouvre une fenêtre inspirée
// de l'image : séparée par carac, avec la carac requise ; case grisée quand
// on n'a pas la carac ; sous le nom des caracs, le compteur des talents pris ;
// chaque ligne défile à gauche et à droite (molette, doigt), avec une flèche
// tant qu'on n'est pas au bout. Le talent qui réduit les blessures (Chanceux)
// s'implantera plus tard : en rouge. »
// Ses réponses : un talent aux niveaux 3, 5, 7, 9 (plus rien après le 10) ;
// seule la carac requise (bonus compris) ; une ligne « Général » ; un talent
// ne se retire pas (confirmation, et remise à zéro en DEV) ; le modificateur
// est celui du jeu (arrondi inférieur de (carac − 10) ÷ 2), jamais négatif ;
// Pugiliste sans arme ou avec des bagues seulement, ses lignes Vampire/Vargen
// s'ajoutent ; Impact sur les dégâts de la compétence ; Bouclier des Sages sur
// les deux résistances ; Immunisé : un état d'un tour ne prend plus ; Maître
// des éléments au-delà du plafond ; Dégâts illusoires sur le modificateur ;
// Élan partagé : les alliés au contact du soigneur ; Diversion s'ajoute à
// l'esquive d'opportunité du Vargen.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, combattantIllusion, compterPasMarche, reductionInertie } from '../combat_etat.js';
import { resoudreCarte, defPhysiqueDe, defMagiqueDe } from '../moteur_pur.js';
import { reposLongDuTour, ETAT_BOUCLIER_SAGES } from '../cerveau_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(70)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const w = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/experience.js', 'utf-8'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);
new Function('window', fs.readFileSync('/home/user/Ivalis/talents.js', 'utf-8'))(w);
const REGLES = {
    pvMax: w.pvMaxCombattant, fatigueMax: w.fatigueMaxCombattant,
    esquive: w.esquiveCombattant, parade: w.paradeCombattant,
    defPhysique: w.defPhysiqueCombattant, defMagique: w.defMagiqueCombattant,
    critique: w.critiqueCombattant, atouts: w.atoutRace, bonusEquip: w.bonusEquip
};
const XP = { 1: 0, 3: 1200, 5: 2500, 7: 4200, 9: 6400, 12: 12400 };
const CARACS = { force: 15, dex: 14, con: 16, int: 15, sag: 13, cha: 14 };
const heros = (extra = {}) => ({
    idPersonnage: "H", prenom: "Hal", race: "Humain", classe: "", camp: "Allié", estMonstre: false, joueur: "J",
    xp: XP[9], caracs: { ...CARACS }, talents: {}, talentsChoix: {},
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 50, Regeneration: 0,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const monstre = (id, extra = {}) => ({ idPersonnage: id, prenom: id, race: "", classe: "", camp: "Ennemi", estMonstre: true, joueur: "",
    xp: 0, PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Critique: 0,
    Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
const monde = (fiches, positions) => {
    const e = construireEtatCombat({ idPartie: "P", cerveau: "H", graine: 1, combattants: fiches, positions,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = fiches.map(f => f.idPersonnage); e.phase = "Resolution";
    return e;
};
const jetsOk = (ids, etats = {}) => ({ attaqueRatee: false, parCible: Object.fromEntries(ids.map(id => [id, { esquive: false, etats }])) });

console.log("\n=========================================================");
console.log("  LES TALENTS");
console.log("=========================================================");

console.log("\n1. LA LISTE, LES POINTS, LES PRÉREQUIS");
{
    const par = Object.fromEntries(w.LIGNES_TALENTS.map(l => [l.nom, w.TALENTS.filter(t => t.carac === l.cle).length]));
    verifier("27 talents : Général 5, Force 4, Dex 2, Con 4, Int 3, Sag 5, Cha 4", w.TALENTS.length === 27
             && JSON.stringify(par) === '{"Général":5,"Force":4,"Dextérité":2,"Constitution":4,"Intelligence":3,"Sagesse":5,"Charisme":4}',
             JSON.stringify(par));
    // Chanceux est branché depuis les blessures (blessures.js) : prenable.
    verifier("Chanceux : prenable désormais (CON 10), « −5 au jet de blessure »", !w.talentParId("TAL_CHANCEUX").aVenir
             && w.etatTalent(heros(), "TAL_CHANCEUX").ok && /−5/.test(w.talentParId("TAL_CHANCEUX").texte));
    const pts = [1, 3, 5, 7, 9, 12].map(n => w.pointsTalentsGagnes(w.niveauDepuisXP(XP[n])));
    verifier("un point aux niveaux 3, 5, 7, 9 ; plus rien ensuite", JSON.stringify(pts) === "[0,1,2,3,4,4]", JSON.stringify(pts));
    const h = heros({ talents: { TAL_PREPARER: 2, TAL_PRECIS: 1 } });
    verifier("dépensés et disponibles (4 points, 3 pris → 1)", w.pointsTalentsDepenses(h) === 3 && w.pointsTalentsDisponibles(h) === 1);
    verifier("Préparer se prend 2 fois, pas 3", w.etatTalent(heros({ talents: { TAL_PREPARER: 1 } }), "TAL_PREPARER").ok
             && w.etatTalent(h, "TAL_PREPARER").complet);
    const faible = heros({ caracs: { ...CARACS, force: 13 } });
    const inertie = w.etatTalent(faible, "TAL_INERTIE_MARTIALE"), impact = w.etatTalent(faible, "TAL_IMPACT_CINETIQUE");
    verifier("FOR 13 : Inertie (FOR 12) prenable ; Impact (FOR 14) grisé, la raison le dit", inertie.ok && impact.verrou
             && impact.raison === "Force 14 requise (13)", impact.raison);
    verifier("plus de point : rien de prenable (sauf ce qui est déjà pris)", w.etatTalent(heros({ xp: XP[1] }), "TAL_PRECIS").sansPoint);
    verifier("étiquettes : « FOR 14 », « Libre »", w.libelleExigenceTalent(w.talentParId("TAL_IMPACT_CINETIQUE")) === "FOR 14"
             && w.libelleExigenceTalent(w.talentParId("TAL_PRECIS")) === "Libre");
}

console.log("\n2. CE QU'ILS DONNENT (atoutRace, les stats du jeu)");
{
    // Mods : FOR 15 → 2, DEX 14 → 2, CON 16 → 3, INT 15 → 2, SAG 13 → 1, CHA 14 → 2.
    const tous = heros({ talents: { TAL_PREPARER: 2, TAL_FORME: 2, TAL_GUERRIER_IMPLACABLE: 1, TAL_PRECIS: 1, TAL_ART_ESQUIVE: 1,
        TAL_MASTODONTE: 1, TAL_RESERVE_ARCANIQUE: 1, TAL_DEFENSEUR_ARCANIQUE: 1, TAL_BENEDICTION_DIVINE: 1, TAL_DIVERSION: 1,
        TAL_MAITRE_ELEMENTS: 1, TAL_MAITRE_ILLUSIONNISTE: 1, TAL_FORMATION_MEDICUS: 1, TAL_ARCHIMAGE: 1, TAL_TAILLE_GUERRE: 1,
        TAL_LANGAGE_ARCANIQUE: 1, TAL_DEGATS_ILLUSOIRES: 1, TAL_IMMUNISE: 1 } });
    const a = w.atoutRace(tous);
    verifier("Préparer ×2 : +10 d'initiative ; Formé ×2 : +2 compétences", a.initiative === 10 && a.competences === 2
             && w.competencesMaxCombattant(tous) === 8 && w.bonusInitiativeClasse(tous, { Effets_Compiles: [] }) === 10);
    verifier("Guerrier implacable : ⌈2,5 × 2⌉ = +5 % de résistance physique", w.defPhysiqueCombattant(tous) === 5, String(w.defPhysiqueCombattant(tous)));
    verifier("Précis +4 % de critique, Art de l'esquive +4 % d'esquive", w.critiqueCombattant(tous) === 4 && w.esquiveCombattant(tous) === 4);
    verifier("Mastodonte +10 PV, Réserve arcanique +8 de fatigue max (Humain : 110 → 118)",
             w.pvMaxCombattant(tous) === 110 && w.fatigueMaxCombattant(tous) === 118, `${w.pvMaxCombattant(tous)} / ${w.fatigueMaxCombattant(tous)}`);
    verifier("Défenseur arcanique ⌈2,5 × 1⌉ = +3 % ; Bénédiction divine +9 % de soins reçus",
             w.defMagiqueCombattant(tous) === 3 && Math.abs(w.multiplicateurSoinsRecus(tous) - 1.09) < 1e-9);
    verifier("Diversion +30 % d'éviter une attaque d'opportunité", a.esquiveOpportunite === 30);
    verifier("Maître des éléments +8, Illusionniste +6, Medicus +1 soin", a.chanceElementaire === 8 && a.chanceEtatsCharisme === 6 && a.bonusSoin === 1);
    verifier("Archimage, Taillé, Langage : +1 chacun ; Dégâts illusoires ⌈2,5 × 2⌉ = 5 ; Immunisé 1",
             a.degatsMagiques === 1 && a.degatsPhysiques === 1 && a.degatsMotsPouvoir === 1 && a.degatsIllusoires === 5 && a.etatsRaccourcis === 1);
    const vargen = heros({ race: "Vargen", talents: { TAL_DIVERSION: 1 } });
    verifier("Diversion s'ajoute à l'esquive d'opportunité du Vargen (30 + 30)", w.atoutRace(vargen).esquiveOpportunite === 60);
    const nul = heros({ caracs: { ...CARACS, dex: 8 }, talents: { TAL_PRECIS: 1 } });
    verifier("un modificateur négatif ne retire rien (DEX 8 → 0)", w.critiqueCombattant(nul) === 0);
    verifier("Perfectionnement : +2 aux tests de la carac choisie",
             JSON.stringify(w.atoutRace(heros({ talents: { TAL_PERFECTIONNEMENT: 1 }, talentsChoix: { TAL_PERFECTIONNEMENT: "dex" } })).testsCarac) === '{"dex":2}');
    // Pugiliste : sans arme ou des bagues ; Vampire et Vargen en plus.
    const bague = { nom: "Bague", modele: "Bagues DPS", bague: true };
    const epee = { nom: "Épée", modele: "Épée", type: "Arme légère" };
    const pug = (extra) => w.atoutRace(heros({ talents: { TAL_PUGILISTE: 1 }, ...extra }));
    verifier("Pugiliste mains nues : +1 dégât physique, +5 % d'esquive", pug({}).degatsPhysiques === 1 && pug({}).esquive === 5);
    verifier("…avec une bague : pareil ; avec une épée : rien", pug({ equipMainDroite: bague }).degatsPhysiques === 1
             && !pug({ equipMainDroite: epee }).degatsPhysiques);
    const vamp = pug({ classe: "Vampire" }), varg = pug({ race: "Vargen" });
    verifier("Vampire : +5 d'initiative, +3 dégâts physiques en tout", vamp.initiative === 5 && vamp.degatsPhysiques === 3, JSON.stringify(vamp));
    verifier("Vargen : +15 % d'empoisonner, +6 % de critique (en plus)", varg.chancePoisonPhysique === 15 && varg.critique === 6);
    const bouclier = { nom: "Bouclier", modele: "Bouclier léger", type: "Bouclier" };
    verifier("Art de la parade : seulement bouclier en main (2 × 3 = +6)",
             !w.atoutRace(heros({ talents: { TAL_ART_PARADE: 1 } })).parade
             && w.atoutRace(heros({ talents: { TAL_ART_PARADE: 1 }, equipMainGauche: bouclier })).parade === 6);
    verifier("ce qu'un talent donne à CE héros, en toutes lettres", w.resumeTalent(tous, "TAL_ART_ESQUIVE") === "+4 % d'esquive"
             && w.resumeTalent(tous, "TAL_PREPARER") === "+10 d'initiative sur ses compétences", w.resumeTalent(tous, "TAL_ART_ESQUIVE"));
    verifier("une créature n'a pas de talents", Object.keys(w.atoutTalents({ estMonstre: true, talents: { TAL_PRECIS: 1 } })).length === 0);
}

console.log("\n3. DANS LE COMBAT");
{
    const coup = (e, lanceur, cible, valeur, extra = {}, cout) => resoudreCarte(e, { type: "carte", idLanceur: lanceur, idCarte: "C", critique: false,
        ...(cout !== undefined ? { coutFatigue: cout } : {}),
        attaques: [{ nom: "Coup", valeurBrute: valeur, typeRes: "Physique", cibles: [cible], ...extra }], alterations: [], jets: jetsOk([cible]) });

    // Adrénaline du Bourreau.
    const e1 = monde([heros({ talents: { TAL_ADRENALINE: 1 } }), monstre("M1", { PV_Actuels: 5 })], { H: { q: 0, r: 0 }, M1: { q: 1, r: 0 } });
    const r1 = coup(e1, "H", "M1", 10);
    verifier("Adrénaline : il abat un ennemi, +20 de fatigue (50 → 70)", r1.etat.combattants.H.fatigue === 70
             && r1.etapes.some(x => x.type === "fatigue" && x.tic === "Adrénaline"), String(r1.etat.combattants.H.fatigue));
    const e1b = monde([heros(), monstre("M1", { PV_Actuels: 5 })], { H: { q: 0, r: 0 }, M1: { q: 1, r: 0 } });
    verifier("…sans le talent, rien", coup(e1b, "H", "M1", 10).etat.combattants.H.fatigue === 50);

    // Dégâts illusoires.
    const e2 = monde([heros({ talents: { TAL_DEGATS_ILLUSOIRES: 1 } }), monstre("M1")], { H: { q: 0, r: 0 }, M1: { q: 3, r: 0 } });
    e2.combattants.ILL = combattantIllusion(e2.combattants.H, "ILL", 2, 0);
    const r2 = coup(e2, "M1", "ILL", 4);
    verifier("Dégâts illusoires : qui brise l'illusion encaisse 5 dégâts bruts", r2.etat.combattants.ILL.aTerre
             && r2.etat.combattants.M1.pv === 95 && r2.etapes.some(x => x.texte === "✨ Dégâts illusoires"), String(r2.etat.combattants.M1.pv));

    // Inertie martiale.
    const e3 = monde([heros({ talents: { TAL_INERTIE_MARTIALE: 1 } }), monstre("M1")], { H: { q: 0, r: 0 }, M1: { q: 5, r: 0 } });
    e3.file = [{ id: "H", carte: "C", initiative: 50, pas: 0 }];
    for (let i = 0; i < 4; i++) compterPasMarche(e3, { type: "pas", acteur: "H", de: { q: i, r: 0 }, vers: { q: i + 1, r: 0 } });
    e3.combattants.H.q = 4;
    const melee = coup(e3, "H", "M1", 5, {}, 30), tir = coup(e3, "H", "M1", 5, { isRanged: true }, 30);
    verifier("Inertie : 4 cases en ligne puis la mêlée → 30 − 20 = 10 de fatigue", e3.file[0].ligneMax === 4
             && melee.etat.combattants.H.fatigue === 40 && melee.etapes.some(x => /Inertie martiale −20/.test(x.texte || "")),
             String(melee.etat.combattants.H.fatigue));
    verifier("…un tir paie plein tarif (30)", tir.etat.combattants.H.fatigue === 20);
    const e3b = monde([heros({ talents: { TAL_INERTIE_MARTIALE: 1 } }), monstre("M1")], { H: { q: 0, r: 0 }, M1: { q: 5, r: 0 } });
    e3b.file = [{ id: "H", carte: "C", initiative: 50, pas: 0 }];
    [[0, 0, 1, 0], [1, 0, 2, 0], [2, 0, 2, 1], [2, 1, 3, 1]].forEach(([a, b, c, d]) =>
        compterPasMarche(e3b, { type: "pas", acteur: "H", de: { q: a, r: b }, vers: { q: c, r: d } }));
    verifier("…4 cases mais avec un virage : rien", reductionInertie(e3b, "H", { attaques: [{ valeurBrute: 5 }] }) === 0, String(e3b.file[0].ligneMax));

    // Impact cinétique : M1 poussé vers M2 qui le bloque.
    const e4 = monde([heros({ talents: { TAL_IMPACT_CINETIQUE: 1 } }), monstre("M1"), monstre("M2")],
                     { H: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 2, r: 0 } });
    const r4 = resoudreCarte(e4, { type: "carte", idLanceur: "H", idCarte: "C", critique: false,
        attaques: [{ nom: "Coup", valeurBrute: 20, typeRes: "Physique", cibles: ["M1"] }],
        alterations: [{ nom: "Poussée", chance: 100, cases: 2, duree: 0, estPoussee: true, cibles: ["M1"] }],
        jets: jetsOk(["M1"], { "Poussée": true }) });
    const c4 = r4.etat.combattants;
    verifier("Impact : la cible poussée sur une unité prend 30 % de 20 = 6 bruts, l'unité 15 % = 3",
             c4.M1.pv === 100 - 20 - 6 && c4.M2.pv === 97 && r4.etapes.some(x => x.texte === "💥 Impact !"), `M1 ${c4.M1.pv}, M2 ${c4.M2.pv}`);
    const e4b = monde([heros(), monstre("M1"), monstre("M2")], { H: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 2, r: 0 } });
    const r4b = resoudreCarte(e4b, { type: "carte", idLanceur: "H", idCarte: "C", critique: false,
        attaques: [{ nom: "Coup", valeurBrute: 20, typeRes: "Physique", cibles: ["M1"] }],
        alterations: [{ nom: "Poussée", chance: 100, cases: 2, duree: 0, estPoussee: true, cibles: ["M1"] }],
        jets: jetsOk(["M1"], { "Poussée": true }) });
    verifier("…sans le talent : la poussée est seulement bloquée", r4b.etat.combattants.M1.pv === 80 && r4b.etat.combattants.M2.pv === 100);

    // Élan partagé : H soigne A ; B, au contact de H, reprend 8.
    const e5 = monde([heros({ talents: { TAL_ELAN_PARTAGE: 1 } }), heros({ idPersonnage: "A", PV_Actuels: 50 }),
                      heros({ idPersonnage: "B", Fatigue_Actuelle: 40 }), heros({ idPersonnage: "C", Fatigue_Actuelle: 40 })],
                     { H: { q: 0, r: 0 }, A: { q: 3, r: 0 }, B: { q: 0, r: 1 }, C: { q: 0, r: 4 } });
    const r5 = resoudreCarte(e5, { type: "carte", idLanceur: "H", idCarte: "C", critique: false,
        attaques: [{ nom: "Soin", valeurBrute: 10, typeRes: "Magique", isHeal: true, cibles: ["A"] }], alterations: [],
        jets: { attaqueRatee: false, parCible: { A: { esquive: false, etats: {} } } } });
    verifier("Élan partagé : l'allié au contact du soigneur +8 (40 → 48), pas celui au loin",
             r5.etat.combattants.B.fatigue === 48 && r5.etat.combattants.C.fatigue === 40, `B ${r5.etat.combattants.B.fatigue}, C ${r5.etat.combattants.C.fatigue}`);

    // Bouclier des Sages.
    const e6 = monde([heros({ talents: { TAL_BOUCLIER_SAGES: 1 } })], { H: { q: 0, r: 0 } });
    e6.file = [{ id: "H", carte: "REPOS_LONG", initiative: 100, pas: 0 }];
    const et6 = reposLongDuTour(e6);
    const h6 = e6.combattants.H;
    verifier("Bouclier des Sages : au repos long, +10 % de résistances (physique et magique) pour la manche",
             et6.some(x => x.pose === ETAT_BOUCLIER_SAGES) && defPhysiqueDe(h6) === 10 && defMagiqueDe(h6) === 10
             && h6.etats.find(x => x.nom === ETAT_BOUCLIER_SAGES).duree === 1, `${defPhysiqueDe(h6)} / ${defMagiqueDe(h6)}`);

    // Immunisé.
    const e7 = monde([monstre("M1"), heros({ talents: { TAL_IMMUNISE: 1 } })], { M1: { q: 0, r: 0 }, H: { q: 1, r: 0 } });
    const r7 = resoudreCarte(e7, { type: "carte", idLanceur: "M1", idCarte: "C", critique: false, attaques: [],
        alterations: [{ nom: "Glacé", chance: 100, duree: 2, cibles: ["H"] }, { nom: "Étourdi", chance: 100, duree: 1, cibles: ["H"] }],
        jets: jetsOk(["H"], { "Glacé": true, "Étourdi": true }) });
    const etats7 = r7.etat.combattants.H.etats.map(x => `${x.nom}:${x.duree}`);
    verifier("Immunisé : Glacé 2 tours → 1 ; Étourdi d'un tour ne prend pas", JSON.stringify(etats7) === '["Glacé:1"]'
             && r7.etapes.some(x => x.type === "etatRate" && x.nom === "Étourdi" && x.raison === "Immunisé"), JSON.stringify(etats7));
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
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async (ref) => { const d = (window.__docs || {})[ref.chemin]; return { exists: () => !!d, data: () => d || {} }; };
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data }); };
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
p.on('dialog', d => d.accept());
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"><rect width="900" height="300" fill="#5a3a20"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

console.log("\n4. L'APERÇU : LE BOUTON ET LE RAPPEL");
await p.evaluate(() => {
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
  const fiche = document.getElementById("fenetre-fiche-perso");
  fiche.style.display = "flex"; fiche.style.left = "2vw"; fiche.style.top = "10px";
  document.getElementById("champ-id-personnage").value = "P1";
  window.CARACS_PARTIE = { P1: { force: 13, dex: 14, con: 16, int: 15, sag: 13, cha: 14 } };
  window.__perso = { idPersonnage: "P1", prenom: "Morvak", nom: "Cendrelame", race: "Gob", classe: "Sorcier", xp: 6400,
    PV_Max: 50, Fatigue_Max: 100, Regeneration: 35, Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    talents: { TAL_PREPARER: 1, TAL_ART_ESQUIVE: 1 }, talentsChoix: {}, Etats_Alteres: [] };
  window.PERSOS_PARTIE = [window.__perso];
  const bouton = [...document.querySelectorAll(".onglet-btn")].find(x => x.textContent.trim() === "Aperçu");
  if (bouton) bouton.click();
  window.afficherStatsCombat(window.__perso);
});
await p.waitForTimeout(300);
{
  const r = await p.evaluate(() => ({
    bouton: (document.getElementById("btn-talents-apercu") || {}).textContent,
    dansEntete: !!document.querySelector(".apercu-entete #btn-talents-apercu"),
    rappel: [...document.querySelectorAll("#encart-talents-pris .talents-rappel-ligne")].map(x => x.textContent.replace(/\s+/g, " ").trim()),
    apresRace: (() => { const a = document.getElementById("encart-bonus-race-classe"), b = document.getElementById("encart-talents-pris");
                        return !!(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)); })(),
    esquive: document.getElementById("stat-esquive").innerText
  }));
  verifier("en haut de l'Aperçu : « Talents · 2 à attribuer » (4 points, 2 pris)", r.dansEntete && /Talents/.test(r.bouton) && /2 à attribuer/.test(r.bouton), r.bouton);
  verifier("en bas, sous les effets de race : le rappel des talents pris, chiffres compris", r.apresRace && r.rappel.length === 2
           && r.rappel.some(t => /Préparer 1\/2 \+5 d'initiative/.test(t)) && r.rappel.some(t => /Art de l'esquive \+4 % d'esquive/.test(t)),
           JSON.stringify(r.rappel));
  verifier("les chiffres de l'Aperçu comptent les talents (esquive : Gob 3 + 4)", r.esquive === "7%", r.esquive);
}

console.log("\n5. LA FENÊTRE DES TALENTS");
await p.click("#btn-talents-apercu");
await p.waitForTimeout(300);
{
  const r = await p.evaluate(() => {
    const f = document.getElementById("fenetre-talents");
    const lignes = [...f.querySelectorAll(".talents-ligne")];
    const caseDe = (id) => f.querySelector(`.talent-case[data-talent="${id}"]`);
    const rf = f.querySelector(".talents-parchemin").getBoundingClientRect();
    return {
      visible: getComputedStyle(f).display === "flex",
      dispo: document.getElementById("talents-dispo-nombre").textContent,
      lignes: lignes.map(l => l.querySelector(".talents-ligne-nom b").textContent + " " + l.querySelector(".talents-ligne-compte").textContent),
      medaillons: f.querySelectorAll(".talents-ligne-tete svg.talents-medaillon").length,
      etiquette: (caseDe("TAL_IMPACT_CINETIQUE").querySelector(".talent-exigence") || {}).textContent,
      verrou: caseDe("TAL_IMPACT_CINETIQUE").className, raison: (caseDe("TAL_IMPACT_CINETIQUE").querySelector(".talent-raison") || {}).textContent,
      gris: getComputedStyle(caseDe("TAL_IMPACT_CINETIQUE")).filter,
      chanceux: caseDe("TAL_CHANCEUX").className, chanceuxCouleur: getComputedStyle(caseDe("TAL_CHANCEUX")).borderTopColor,
      pris: caseDe("TAL_ART_ESQUIVE").className, rangsPreparer: caseDe("TAL_PREPARER").querySelector(".talent-rangs").textContent,
      dansEcran: rf.left >= 0 && rf.right <= innerWidth && rf.top >= 0 && rf.bottom <= innerHeight
    };
  });
  await p.screenshot({ path: "/tmp/claude-0/talents_fenetre.png" });
  verifier("la fenêtre s'ouvre, tient à l'écran, « Talents disponibles 2 »", r.visible && r.dansEcran && r.dispo === "2");
  verifier("7 lignes (Général + les 6 caracs), chacune son médaillon et son compteur", r.lignes.length === 7 && r.medaillons === 7
           && r.lignes[0] === "Général 1/7" && r.lignes[2] === "Dextérité 1/2", JSON.stringify(r.lignes));
  verifier("la carac requise sur la case : « FOR 14 »", r.etiquette === "FOR 14", r.etiquette);
  verifier("FOR 13 < 14 : case grisée, et elle dit pourquoi", /verrou/.test(r.verrou) && /grayscale/.test(r.gris)
           && /Force 14 requise \(13\)/.test(r.raison), r.raison);
  verifier("Chanceux n'est plus « à venir » ni en rouge : il se prend", !/a-venir/.test(r.chanceux) && /prenable/.test(r.chanceux)
           && r.chanceuxCouleur !== "rgb(179, 38, 30)", r.chanceux + " " + r.chanceuxCouleur);
  verifier("les talents pris sont cochés ; Préparer dit 1/2", /pris/.test(r.pris) && r.rangsPreparer === "1/2");
}

console.log("\n6. LE DÉFILEMENT DES LIGNES");
{
  const avant = await p.evaluate(() => {
    const piste = document.querySelector('.talents-piste[data-ligne="general"]');
    const cadre = piste.parentElement;
    return { max: piste.scrollWidth - piste.clientWidth, gauche: cadre.querySelector(".talents-fleche.gauche").classList.contains("visible"),
             droite: cadre.querySelector(".talents-fleche.droite").classList.contains("visible") };
  });
  verifier("la ligne Général dépasse : flèche à droite, pas à gauche", avant.max > 0 && avant.droite && !avant.gauche, JSON.stringify(avant));
  const boite = await p.evaluate(() => { const r = document.querySelector('.talents-piste[data-ligne="general"]').getBoundingClientRect();
                                         return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await p.mouse.move(boite.x, boite.y);
  await p.mouse.wheel(0, 400);
  await p.waitForTimeout(600);
  const apres = await p.evaluate(() => {
    const piste = document.querySelector('.talents-piste[data-ligne="general"]');
    const cadre = piste.parentElement;
    return { gauchePos: piste.scrollLeft, gauche: cadre.querySelector(".talents-fleche.gauche").classList.contains("visible"),
             droite: cadre.querySelector(".talents-fleche.droite").classList.contains("visible"),
             corps: document.getElementById("talents-corps").scrollTop };
  });
  verifier("la molette fait glisser la ligne (pas la fenêtre) ; au bout, la flèche gauche paraît, la droite s'efface",
           apres.gauchePos > 0 && apres.gauche && !apres.droite && apres.corps === 0, JSON.stringify(apres));
  await p.click('.talents-piste[data-ligne="general"] + .talents-fleche.droite, .talents-ligne[data-ligne="general"] .talents-fleche.gauche');
  await p.waitForTimeout(700);
  const retour = await p.evaluate(() => document.querySelector('.talents-piste[data-ligne="general"]').scrollLeft);
  verifier("la flèche gauche ramène la ligne au début", retour === 0, String(retour));
  const dex = await p.evaluate(() => { const piste = document.querySelector('.talents-piste[data-ligne="dex"]');
    return { max: piste.scrollWidth - piste.clientWidth, d: piste.parentElement.querySelector(".talents-fleche.droite").classList.contains("visible") }; });
  verifier("une ligne qui tient (Dextérité) n'a pas de flèche", dex.max <= 0 && !dex.d, JSON.stringify(dex));
}

console.log("\n7. PRENDRE UN TALENT : CONFIRMATION, ÉCRITURE, DÉFINITIF");
{
  await p.click('.talent-case[data-talent="TAL_PRECIS"]');
  await p.waitForTimeout(150);
  const pop = await p.evaluate(() => { const x = document.getElementById("popup-talent");
    return x ? { texte: x.textContent.replace(/\s+/g, " "), prendre: !x.querySelector(".talents-popup-prendre").disabled } : null; });
  verifier("un toucher sur un talent prenable : la confirmation (« définitif »)", !!pop && /Précis/.test(pop.texte) && /définitif/.test(pop.texte) && pop.prendre,
           pop && pop.texte.slice(0, 90));
  await p.evaluate(() => { window.__majs = []; });
  await p.click("#popup-talent .talents-popup-prendre");
  await p.waitForTimeout(300);
  const r = await p.evaluate(() => ({
    maj: (window.__majs || []).find(m => /Personnages\/P1/.test(m.chemin)),
    popup: !!document.getElementById("popup-talent"),
    dispo: document.getElementById("talents-dispo-nombre").textContent,
    coche: document.querySelector('.talent-case[data-talent="TAL_PRECIS"]').className,
    critique: document.getElementById("stat-critique").innerText,
    bouton: document.getElementById("btn-talents-apercu").textContent
  }));
  verifier("écrit sur la fiche : Talents { …, TAL_PRECIS: 1 }", r.maj && r.maj.data.Talents.TAL_PRECIS === 1 && r.maj.data.Talents.TAL_PREPARER === 1,
           JSON.stringify(r.maj && r.maj.data));
  verifier("la case se coche, il reste 1 point ; l'Aperçu suit (critique 4 %, « 1 à attribuer »)",
           !r.popup && /pris/.test(r.coche) && r.dispo === "1" && r.critique === "4%" && /1 à attribuer/.test(r.bouton), `${r.critique} | ${r.bouton}`);
  const deja = await p.evaluate(() => document.querySelector('.talent-case[data-talent="TAL_PRECIS"]').classList.contains("prenable"));
  verifier("un talent pris ne se reprend pas (ni ne se retire)", !deja);

  // Perfectionnement : il faut choisir sa carac.
  await p.click('.talent-case[data-talent="TAL_PERFECTIONNEMENT"]');
  await p.waitForTimeout(150);
  const choix = await p.evaluate(() => ({ boutons: document.querySelectorAll("#popup-talent .talents-popup-carac").length,
    bloque: document.querySelector("#popup-talent .talents-popup-prendre").disabled }));
  verifier("Perfectionnement : six caracs à choisir, « Prendre » bloqué tant qu'aucune", choix.boutons === 6 && choix.bloque);
  await p.click('#popup-talent .talents-popup-carac[data-carac="dex"]');
  await p.evaluate(() => { window.__majs = []; });
  await p.click("#popup-talent .talents-popup-prendre");
  await p.waitForTimeout(300);
  const perf = await p.evaluate(() => ({ maj: (window.__majs || [])[0], dispo: document.getElementById("talents-dispo-nombre").textContent,
    prenables: document.querySelectorAll(".talent-case.prenable").length,
    rappel: document.getElementById("encart-talents-pris").textContent }));
  verifier("enregistré avec la carac choisie (Talents_Choix : dex)", perf.maj && perf.maj.data.Talents_Choix.TAL_PERFECTIONNEMENT === "dex"
           && perf.maj.data.Talents.TAL_PERFECTIONNEMENT === 1, JSON.stringify(perf.maj && perf.maj.data));
  verifier("plus de point : plus rien de prenable ; le rappel dit « +2 aux tests de Dextérité »", perf.dispo === "0" && perf.prenables === 0
           && /\+2 aux tests de Dextérité/.test(perf.rappel), perf.dispo);
  await p.screenshot({ path: "/tmp/claude-0/talents_fenetre_apres.png" });
  await p.click(".talents-retour");
  const ferme = await p.evaluate(() => getComputedStyle(document.getElementById("fenetre-talents")).display);
  verifier("« Retour » ferme la fenêtre", ferme === "none");
}

console.log("\n8. L'OUTIL DEV : REMETTRE À ZÉRO");
{
  await p.evaluate(() => { window.__majs = []; });
  await p.evaluate(() => window.reinitialiserTalentsDev());
  await p.waitForTimeout(200);
  const r = await p.evaluate(() => ({ maj: (window.__majs || [])[0], bouton: document.getElementById("btn-talents-apercu").textContent,
    rappel: document.getElementById("encart-talents-pris").innerHTML, dev: !!document.getElementById("btn-dev-talents") }));
  verifier("le bouton DEV vide Talents et Talents_Choix ; les 4 points reviennent", r.dev && r.maj && JSON.stringify(r.maj.data) === '{"Talents":{},"Talents_Choix":{}}'
           && /4 à attribuer/.test(r.bouton) && r.rappel === "", r.bouton);
}

console.log("\n9. CE QUE LA CARTE EMPORTE (appliquerEquipementALaCarte)");
{
  const r = await p.evaluate(() => {
    const lanceur = { idPersonnage: "P1", race: "Vargen", classe: "", xp: 6400, camp: "Allié", Etats_Alteres: [],
      caracs: { force: 14, dex: 14, con: 12, int: 15, sag: 13, cha: 14 },
      talents: { TAL_TAILLE_GUERRE: 1, TAL_ARCHIMAGE: 1, TAL_LANGAGE_ARCANIQUE: 1, TAL_MAITRE_ELEMENTS: 1, TAL_MAITRE_ILLUSIONNISTE: 1, TAL_PUGILISTE: 1 } };
    const etat = (attaques, alterations) => ({ attaques, alterations });
    const s1 = etat([{ nom: "Attaque lourde", typeRes: "Physique", valeurBrute: 10, cibles: ["M"] }], []);
    window.appliquerEquipementALaCarte(s1, lanceur, "Sans arme / Arme rp");
    const s2 = etat([{ nom: "Attaque Magique", typeRes: "Magique", valeurBrute: 10, cibles: ["M"] }],
                    [{ nom: "Brûlé", chance: 75, cibles: ["M"] }, { nom: "Confusion", chance: 20, cibles: ["M"] }]);
    window.appliquerEquipementALaCarte(s2, lanceur, "Magie");
    const s3 = etat([{ nom: "Mots de pouvoirs", typeRes: "Magique", valeurBrute: 2, cibles: ["M"] }], []);
    window.appliquerEquipementALaCarte(s3, lanceur, "Magie");
    return { phys: s1.attaques[0].valeurBrute, poison: (s1.alterations.find(a => a.nom === "Empoisonnement") || {}).chance,
             mag: s2.attaques[0].valeurBrute, brule: s2.alterations[0].chance, confusion: s2.alterations[1].chance, mot: s3.attaques[0].valeurBrute };
  });
  // FOR 14 / INT 15 / CHA 14 → mods 2 / 2 / 2.
  verifier("physique : +1 Taillé +1 Pugiliste (mains nues) = 12 ; Vargen : poison 15 %", r.phys === 12 && r.poison === 15, JSON.stringify(r));
  verifier("magique : +1 Archimage = 11 ; Brûlé 75 + 8 = 83 (au-delà du plafond) ; Confusion 20 + 6", r.mag === 11 && r.brule === 83 && r.confusion === 26);
  verifier("Mot de pouvoir : +1 Langage, pas l'Archimage (2 → 3)", r.mot === 3);
}

console.log("\n10. LES DÉS ET LE REPOS LONG");
{
  const app = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8');
  const combat = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
  verifier("Perfectionnement : le jet au d20 ajoute les +2 de la carac choisie (testsCarac)",
           /const bonusTalent = persoJet \? \(parseInt\(\(\(window\.atoutRace\(persoJet\) \|\| \{\}\)\.testsCarac \|\| \{\}\)\[idCarac\]\) \|\| 0\) : 0;\s*modCarac = \(Number\(modCarac\) \|\| 0\) \+ bonusTalent;/.test(app));
  verifier("Bouclier des Sages : le repos long s'inscrit à l'initiative 100",
           /idCarte: "REPOS_LONG",[\s\S]{0,400}bouclierDesSages\) > 0\) \? 100 : 0/.test(combat));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
