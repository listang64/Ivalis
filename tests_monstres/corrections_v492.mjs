// v492 — LE TABLEAU DES ARMES REVÉRIFIÉ (Vierge_1.xlsx de Nico) : les modèles et les effets A/B étaient déjà ceux du
// tableau ; les effets C (soins) et la bague de soin épique suivaient encore l'ancien classeur.
//   · effets C : « pour le personnage soigné pendant 2 tours » (résistances +8 %, dégâts +5 %, +10 d'initiative) ;
//   · bague de soin épique : « +1 soin + 1 (Effet C ou Effet B) + 2X Effet C ».
// Le classeur entier est figé dans tableau_objets.json (objets_tableau.mjs le compare au catalogue, cellule par cellule).
// Lancer : node tests_monstres/corrections_v492.mjs
import fs from 'fs';
import { construireEtatCombat, clonerEtat } from '../combat_etat.js';
import { resoudreCarte, tirerDesCarte } from '../moteur_pur.js';
import { planifierTrajet } from '../mouvement_pur.js';

function extraire(fichier, marqueur, finLigne = '};') {
    const lignes = fs.readFileSync('/home/user/Ivalis/' + fichier, 'utf-8').split('\n');
    const d = lignes.findIndex(l => l.startsWith(marqueur));
    if (d < 0) throw new Error(`${marqueur} introuvable dans ${fichier}`);
    let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
    return lignes.slice(d, f + 1).join('\n');
}

// objets.js n'importe rien : c'est le VRAI fichier, chargé tel quel, sans
// naviguateur — comme equipement_combat.mjs le fait déjà pour le même fichier.
const SRC_OBJETS = fs.readFileSync('/home/user/Ivalis/objets.js', 'utf-8');
// bonusEquip (app.js) additionne l'équipement permanent ET la contribution des
// états (c'est lui qui referme la boucle : un état "Élan" posé par le cerveau
// doit à son tour compter dans bonusEquip, exactement comme avant).
const SRC_BONUS_EQUIP = extraire('app.js', 'window.bonusEquip = function');

const window = {};
new Function('window', SRC_OBJETS + '\n' + SRC_BONUS_EQUIP)(window);

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, extra = {}) => ({
    idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 80, Def_Magique: 80,
    Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});

const REGLES = { bonusEquip: window.bonusEquip, effetsSpeciaux: window.effetsSpeciauxEquipement };

const monde = (combattants, positions) => construireEtatCombat({
    idPartie: "G", cerveau: "P1", graine: 4242, combattants, positions,
    partie: {
        Phase_Combat: "Resolution", Ordre_Initiative: combattants.map(c => c.idPersonnage),
        File_Attente_Combat: combattants.map(c => ({ idPersonnage: c.idPersonnage }))
    },
    regles: REGLES
});

// Un dé truqué : une file de résultats fixes, dans l'ordre où le moteur les
// consomme (attaques/alterations d'abord, équipement ensuite — voir
// tirerDesCarte). Ce n'est PAS le des à graine du jeu : c'est un outil de
// banc pour poser des cas précis (percé / pas percé) sans deviner une suite
// pseudo-aléatoire.
const desFixe = (suite) => { const f = [...suite]; return { d100: () => f.length ? f.shift() : 1 }; };

const attaqueCAC = (typeRes, valeur, cibles) => ({
    nom: "Attaque", typeRes, valeurBrute: valeur, isRanged: false, rangeMax: 1,
    isHeal: false, isShield: false, purifChance: 0, estEtalement: false, cibles
});
const soinCAC = (valeur, cibles) => ({
    nom: "Soin", typeRes: "Magique", valeurBrute: valeur, isHeal: true, isShield: false,
    purifChance: 0, estEtalement: false, cibles
});


console.log("1. LES EFFETS C ET LA BAGUE DE SOIN ÉPIQUE (objets.js)");
const REF = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/tableau_objets.json', 'utf-8'));
verifier("les effets C du tableau : pour le personnage soigné pendant 2 tours", REF.effetsC.slice(1).every(e => /pendant 2 tours/.test(e.texte) && /soigné/.test(e.texte)));
verifier("…le catalogue : résistances +8 %, dégâts +5 %, initiative +10, 2 tours, sur la cible du soin (aucun « sur soi »)",
    JSON.stringify(window.EFFETS_C.map(e => e.beniSoin || e.bonus)) === JSON.stringify([{ soin: 1 }, { resMag: 8, tours: 2 }, { resPhys: 8, tours: 2 }, { degatsPct: 5, tours: 2 }, { initiative: 10, tours: 2 }])
    && !window.EFFETS_C.some(e => e.buffSoi));
const bague = window.MODELES_OBJETS.find(m => m.modele === "Bagues Soins");
const lots = []; for (let i = 0; i < 400; i++) lots.push(window.tirerEffetsObjet(bague, "Épique"));
const C = new Set(window.EFFETS_C.map(e => e.cle)), B = new Set(window.EFFETS_B.map(e => e.cle));
verifier("bague de soin épique : un effet C compté deux fois + un autre effet, C ou B, différent",
    lots.every(l => l.length === 2 && C.has(l[0].cle) && l[1].cle !== l[0].cle && (C.has(l[1].cle) || B.has(l[1].cle)))
    && lots.some(l => B.has(l[1].cle) && !C.has(l[1].cle)) && lots.some(l => C.has(l[1].cle)));
const objet = window.fabriquerObjet(bague, "Épique");
verifier("…l'objet fabriqué : +1 soin de base, et pas de clé parasite", objet.bonus.soin >= 1 && !("effetsEnPlus" in objet.bonus), JSON.stringify(objet.bonus));
const texte = window.decrireObjet({ bonus: {}, etats: [], effets: [{ beniSoin: { initiative: 10, tours: 2 } }] });
verifier("le texte de l'objet dit la hâte sur la cible d'un soin", /\+10 d'initiative sur la cible d'un soin pendant 2 tour/.test(texte), texte);

console.log("\n2. LA HÂTE DU SOIN, POSÉE SUR LE SOIGNÉ (moteur_pur.js)");
{
    const bague = { nom: "Bague de hâte", uid: "o9", type: "Anneau", bague: true, effets: [{ beniSoin: { initiative: 10, tours: 2 } }] };
    const H1 = fiche("H1", { equipMainDroite: bague }), H2 = fiche("H2", { PV_Actuels: 30 });
    const etat = monde([H1, H2], { H1: { q: 0, r: 0 }, H2: { q: 1, r: 0 } });
    const jets = tirerDesCarte(etat, { attaques: [soinCAC(15, ["H2"])] }, "H1", false, desFixe([]));
    const r = resoudreCarte(etat, { type: "carte", idLanceur: "H1", idCarte: "CS", attaques: [soinCAC(15, ["H2"])], alterations: [], jets });
    const h = r.etat.combattants.H2.etats.find(e => e.nom === "Hâte");
    verifier("+10 d'initiative pendant 2 tours sur le personnage soigné", h && h.bonusEquip.initiative === 10 && h.duree === 2, JSON.stringify(h));
    verifier("…rien sur le lanceur", !r.etat.combattants.H1.etats.some(e => e.nom === "Hâte" || e.nom === "Élan"));
    const bague2 = { nom: "Bague offensive", uid: "o10", type: "Anneau", bague: true, effets: [{ beniSoin: { degatsPct: 5, tours: 2 } }] };
    const e2 = monde([fiche("H1", { equipMainDroite: bague2 }), fiche("H2", { PV_Actuels: 30 })], { H1: { q: 0, r: 0 }, H2: { q: 1, r: 0 } });
    const j2 = tirerDesCarte(e2, { attaques: [soinCAC(15, ["H2"])] }, "H1", false, desFixe([]));
    const r2 = resoudreCarte(e2, { type: "carte", idLanceur: "H1", idCarte: "CS", attaques: [soinCAC(15, ["H2"])], alterations: [], jets: j2 });
    const b = r2.etat.combattants.H2.etats.find(e => e.nom === "Béni");
    verifier("+5 % de dégâts pendant 2 tours sur le soigné", b && b.bonusEquip.degatsPct === 5 && b.duree === 2, JSON.stringify(b));
}

console.log("\n3. LES VERSIONS");
const v = Number((fs.readFileSync('/home/user/Ivalis/trace_combat.js', 'utf-8').match(/VERSION_IVALIS = (\d+)/) || [])[1]);
verifier("version 492 ou plus", v >= 492 && JSON.parse(fs.readFileSync('/home/user/Ivalis/version.json', 'utf-8')).version >= 492, String(v));

console.log(`\n${echecs ? echecs + " ÉCHEC(S)" : "TOUT EST BON"}`);
process.exit(echecs ? 1 : 0);
