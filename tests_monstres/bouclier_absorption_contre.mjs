// BOUCLIER, ABSORPTION, CONTRE — DES POURCENTAGES, PAS DES POINTS.
//
// Nico : « l'effet bouclier crée un bouclier de 30 points de vie, alors qu'il
// devrait créer un bouclier de 25 % des PV restants de la cible », et
// « Absorption et Contre calculent bien en % des dégâts, et non en fixe ?
// Contrôle. » Et, dans le même message : « j'ai un soin avec une distance de
// deux hexagones, mais la sélection ne se fait qu'autour de moi ».
//
// Ce que le contrôle a trouvé, et que ce banc tient :
//   • le Bouclier lisait sa Valeur comme des POINTS — c'est un pourcentage des
//     PV restants de la cible, par cran, plafonné par le Pourcentage max ;
//   • l'Absorption était bien un pourcentage, mais s'appliquait à TOUS les
//     dégâts — le grimoire dit « dégâts magiques » ;
//   • le Contre n'existait NULLE PART dans le moteur : une carte Contre ne
//     faisait rien. Il annule sa part des dégâts physiques et renvoie 10 % ;
//   • un soutien posé sur soi (Absorption, Contre) pouvait être « esquivé »
//     par celui qui le recevait ;
//   • une ZONE de soin à distance était bridée à une case dès qu'un ennemi
//     était au contact — la règle du corps-à-corps, faite pour les attaques.
import fs from 'fs';
import { chaineDeDegats, resoudreCarte, tirerDesCarte } from '../moteur_pur.js';
import { construireEtatCombat, creerDes } from '../combat_etat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// Les lignes du grimoire, telles qu'elles sont en base (lues le 24/09).
const GRIMOIRE = {
  EFF_SOIN:  { Nom: "Soin", Valeur: 2, Pourcent_Base: 0, Pourcent_Max: 0 },
  EFF_DISTANCE: { Nom: "Distance", Valeur: 1, Pourcent_Base: 0, Pourcent_Max: 0 },
  EFF_ZONE:  { Nom: "Zone", Valeur: 1, Pourcent_Base: 0, Pourcent_Max: 0 },
  EFF_ATT:   { Nom: "Attaque légère", Valeur: 2, Pourcent_Base: 0, Pourcent_Max: 0 },
  EFF_BOUCLIER_MAGIQUE: { Nom: "Bouclier magique", Valeur: 25, Pourcent_Base: 0, Pourcent_Max: 30,
                          Effet_Base: "Créer un bouclier de 25% des pv restants de la cible." },
  EFF_ABSORPTION: { Nom: "Absorption", Valeur: 20, Pourcent_Base: 0, Pourcent_Max: 60 },
  EFF_CONTRE: { Nom: "Contre", Valeur: 20, Pourcent_Base: 0, Pourcent_Max: 60 }
};

// =========================================================================
console.log("1. LA CHAÎNE DE DÉGÂTS : ABSORPTION = MAGIE, CONTRE = PHYSIQUE, EN %");
{
  const avec = (etat) => ({ pv: 60, pvMax: 60, bouclier: 0, etats: [etat], def: {} });
  const abs = avec({ nom: "Absorption", valeurAbs: 20 });
  let c = chaineDeDegats(abs, { valeurBrute: 50, typeRes: "Magique" }, {});
  verifier("Absorption 20 % sur 50 magiques : 40 passent", c.degats === 40, `(${c.degats})`);
  verifier("… et soigne 10 % de la frappe (5)", c.soinAbsorption === 5, `(${c.soinAbsorption})`);
  c = chaineDeDegats(abs, { valeurBrute: 100, typeRes: "Magique" }, {});
  verifier("c'est bien un pourcentage : 100 magiques → 80, soin 10", c.degats === 80 && c.soinAbsorption === 10,
           `(${c.degats}, ${c.soinAbsorption})`);
  c = chaineDeDegats(abs, { valeurBrute: 50, typeRes: "Physique" }, {});
  verifier("Absorption ne touche PAS au physique", c.degats === 50 && c.soinAbsorption === 0, `(${c.degats})`);

  const ctr = avec({ nom: "Contre", valeurContre: 20 });
  c = chaineDeDegats(ctr, { valeurBrute: 50, typeRes: "Physique" }, {});
  verifier("Contre 20 % sur 50 physiques : 40 passent", c.degats === 40, `(${c.degats})`);
  verifier("… et renvoie 10 % de la frappe (5)", c.renvoi === 5, `(${c.renvoi})`);
  c = chaineDeDegats(ctr, { valeurBrute: 50, typeRes: "Magique" }, {});
  verifier("Contre ne touche PAS à la magie", c.degats === 50 && !c.renvoi, `(${c.degats}, ${c.renvoi})`);
}

// =========================================================================
const fiche = (id, extra) => ({ idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100,
  Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
  Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
const monde = (extraH1 = {}) => construireEtatCombat({
  idPartie: "P1", cerveau: "P_03", graine: 5,
  combattants: [fiche("H1", { camp: "Allié", idJoueur: "P_03", ...extraH1 }),
                fiche("M1", { camp: "Ennemi", estMonstre: true, nom: "Goule" })],
  positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } },
  partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"],
            File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C1" }] }
});
const jouer = (etat, action) => {
  action.jets = tirerDesCarte(etat, action, action.idLanceur, false, creerDes(etat.graine));
  return resoudreCarte(etat, action);
};

console.log("\n2. LE BOUCLIER : 25 % DES PV RESTANTS DE LA CIBLE");
{
  const etat = monde({ PV_Actuels: 40 });
  const r = jouer(etat, { type: "carte", idLanceur: "H1", idCarte: "C1",
    attaques: [{ nom: "Bouclier magique", valeurBrute: 25, pourcentPV: 25, isHeal: true, isShield: true, cibles: ["H1"] }],
    alterations: [] });
  verifier("40 PV restants → bouclier de 10", r.etat.combattants.H1.bouclier === 10, `(${r.etat.combattants.H1.bouclier})`);

  const plein = jouer(monde(), { type: "carte", idLanceur: "H1", idCarte: "C1",
    attaques: [{ nom: "Bouclier magique", valeurBrute: 25, pourcentPV: 25, isHeal: true, isShield: true, cibles: ["H1"] }],
    alterations: [] });
  verifier("60 PV restants → bouclier de 15", plein.etat.combattants.H1.bouclier === 15,
           `(${plein.etat.combattants.H1.bouclier})`);

  const ancien = jouer(monde(), { type: "carte", idLanceur: "H1", idCarte: "C1",
    attaques: [{ nom: "Bouclier", valeurBrute: 30, isHeal: true, isShield: true, cibles: ["H1"] }], alterations: [] });
  verifier("une carte sans pourcentage garde ses points (compatibilité)", ancien.etat.combattants.H1.bouclier === 30);
}

console.log("\n3. LE CONTRE RENVOIE SA PART À L'ATTAQUANT");
{
  const etat = monde();
  etat.combattants.H1.etats = [{ nom: "Contre", duree: 1, valeurContre: 20 }];
  etat.file = [{ id: "M1", carte: "C2", initiative: 0 }];
  const r = jouer(etat, { type: "carte", idLanceur: "M1", idCarte: "C2",
    attaques: [{ nom: "Griffes", valeurBrute: 30, typeRes: "Physique", cibles: ["H1"] }], alterations: [] });
  verifier("le héros ne prend que 24 (20 % annulés)", r.etat.combattants.H1.pv === 36, `(${r.etat.combattants.H1.pv})`);
  verifier("la goule reçoit 3 en retour (10 % de 30)", r.etat.combattants.M1.pv === 57, `(${r.etat.combattants.M1.pv})`);
  verifier("et l'écran voit passer ce renvoi", r.etapes.some(e => e.type === "degats" && e.renvoi && e.cible === "M1"));
}

console.log("\n4. UN SOUTIEN POSÉ SUR SOI NE S'ESQUIVE PAS");
{
  const etat = monde({ Esquive: 100 });
  const r = jouer(etat, { type: "carte", idLanceur: "H1", idCarte: "C1", attaques: [],
    alterations: [{ nom: "Contre", chance: 100, duree: 1, valeurContre: 20, isHeal: true, cibles: ["H1"] },
                  { nom: "Absorption", chance: 100, duree: 1, valeurAbs: 20, isHeal: true, cibles: ["H1"] }] });
  const noms = r.etat.combattants.H1.etats.map(e => e.nom);
  verifier("un héros qui esquive tout reçoit quand même son Contre et son Absorption",
           noms.includes("Contre") && noms.includes("Absorption"), JSON.stringify(noms));
  verifier("le Contre posé garde son pourcentage",
           (r.etat.combattants.H1.etats.find(e => e.nom === "Contre") || {}).valeurContre === 20);
}

// =========================================================================
const SRC = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8').replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch(); const p = await b.newPage();
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html'); await p.waitForTimeout(300);
await p.evaluate(({ src, grimoire }) => {
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  window.PLATEAU_VTT = { hexSize: 30, hexToPixel: (q, r) => ({ x: q * 52, y: r * 45 }), pixelToHex: () => ({ q: 0, r: 0 }),
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    getHexesInRadius: (q, r, R) => { const o = []; for (let a = -R; a <= R; a++) for (let c = -R; c <= R; c++) if (dist({ q, r }, { q: q + a, r: r + c }) <= R) o.push({ q: q + a, r: r + c }); return o; } };
  window.bonusEquip = () => 0; window.bonusPorteeMagique = () => 0; window.jouerSonClic = () => {};
  window.EFFETS_BDD_CACHE = grimoire;
  new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField', src)(
    window, {}, () => ({}), async () => {}, async () => {}, async () => {}, () => ({}));
  const hote = document.createElement("div"); hote.id = "apercu-carte-hd-competence"; document.body.appendChild(hote);
  window.__extraire = async (actions, engage) => {
    const h = { idPersonnage: "J1", camp: "Allié", statut: "Vivant", Etats_Alteres: [] };
    window.PERSOS_PARTIE = [h, { idPersonnage: "M1", camp: "Ennemi", statut: "Vivant", Etats_Alteres: [] }];
    window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 }, M1: engage ? { q: 0, r: 1 } : { q: 0, r: 8 } };
    window.COMBAT_PERSOS_JOUEUR = [h]; window.COMBAT_INDEX_PERSO = 0;
    window.COMPETENCES_CACHE = { C: { Nom: "Banc", Arme: "Magie", Fatigue: 5, Composants: { actions } } };
    return window.demarrerCiblage("C", { extraire: true, idLanceur: "J1" });
  };
}, { src: SRC, grimoire: GRIMOIRE });

console.log("\n5. CE QUE LA CARTE EXTRAIT (vrai moteur_effets.js)");
{
  const r = await p.evaluate(async () => {
    const b1 = await window.__extraire([{ baseEffetId: "EFF_BOUCLIER_MAGIQUE", count: 1, mods: {} }]);
    const b2 = await window.__extraire([{ baseEffetId: "EFF_BOUCLIER_MAGIQUE", count: 2, mods: {} }]);
    const c3 = await window.__extraire([{ baseEffetId: "EFF_CONTRE", count: 3, mods: {} }]);
    const c4 = await window.__extraire([{ baseEffetId: "EFF_CONTRE", count: 4, mods: {} }]);
    const a4 = await window.__extraire([{ baseEffetId: "EFF_ABSORPTION", count: 4, mods: {} }]);
    return { b1: b1.attaques[0].pourcentPV, b2: b2.attaques[0].pourcentPV,
             c3: (c3.alterations[0] || {}).valeurContre, c4: (c4.alterations[0] || {}).valeurContre,
             contreSoutien: !!(c3.alterations[0] || {}).isHeal, a4: (a4.alterations[0] || {}).valeurAbs };
  });
  verifier("Bouclier à 1 cran : 25 % des PV restants", r.b1 === 25, `(${r.b1})`);
  verifier("à 2 crans : plafonné au Pourcentage max (30 %)", r.b2 === 30, `(${r.b2})`);
  verifier("Contre existe désormais : 3 crans → 60 %", r.c3 === 60, `(${r.c3})`);
  verifier("plafonné lui aussi au Pourcentage max (60 %)", r.c4 === 60, `(${r.c4})`);
  verifier("et se pose sur soi ou un allié", r.contreSoutien);
  verifier("Absorption plafonnée au grimoire (60 %), plus à 100", r.a4 === 60, `(${r.a4})`);
}

console.log("\n6. UNE ZONE DE SOIN À DISTANCE, MÊME ENNEMI AU CONTACT");
{
  const r = await p.evaluate(async () => {
    const res = {};
    for (const engage of [false, true]) {
      const ext = await window.__extraire([{ baseEffetId: "EFF_SOIN", count: 3,
        mods: { EFF_DISTANCE: 1, EFF_ZONE: 1 }, zoneHexes: [{ q: 0, r: 0 }] }], engage);
      window.ETAT_CIBLAGE = { ...ext, actif: true };
      const cfg = window.configCiblage(window.ETAT_CIBLAGE);
      const cases = window.casesPosablesZone("J1", cfg);
      const d = (h) => (Math.abs(h.q) + Math.abs(h.q + h.r) + Math.abs(h.r)) / 2;
      res[engage ? "engage" : "libre"] = { portee: cfg.rangeMax, plusLoin: Math.max(...cases.map(d)) };
      window.ETAT_CIBLAGE = null;
    }
    const att = await window.__extraire([{ baseEffetId: "EFF_ATT", count: 1,
      mods: { EFF_DISTANCE: 1, EFF_ZONE: 1 }, zoneHexes: [{ q: 0, r: 0 }] }], true);
    window.ETAT_CIBLAGE = { ...att, actif: true };
    const cfgA = window.configCiblage(window.ETAT_CIBLAGE);
    res.attaqueEngagee = Math.max(...window.casesPosablesZone("J1", cfgA).map(h => (Math.abs(h.q) + Math.abs(h.q + h.r) + Math.abs(h.r)) / 2));
    return res;
  });
  verifier("sans ennemi au contact : la zone se pose à 2 cases", r.libre.plusLoin === 2, JSON.stringify(r.libre));
  verifier("AVEC un ennemi au contact : toujours à 2 cases (c'est un soin)", r.engage.plusLoin === 2,
           JSON.stringify(r.engage));
  verifier("une zone d'ATTAQUE engagée, elle, reste bridée à 1", r.attaqueEngagee === 1, `(${r.attaqueEngagee})`);
}

verifier("aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 2).join(" | "));
await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
