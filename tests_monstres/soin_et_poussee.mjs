// UNE CARTE QUI SOIGNE ET QUI POUSSE : LES DEUX PARTENT, CHACUN SUR SA CIBLE.
//
// Nico : « j'ai fait une compétence avec une poussée et un soin ; le soin
// s'est fait, pas la poussée ». Vérifié de bout en bout, sur le vrai ciblage
// (moteur_effets.js) puis dans le vrai cerveau (cerveau_combat.js) : la carte
// se vise en deux temps — la Poussée d'abord (un ennemi, ou un allié à
// écarter), puis le soin (soi-même ou un allié) —, l'intention envoyée porte
// les DEUX, et le cerveau pousse bel et bien quand le jet passe.
//
// Ce qui décide, c'est ce jet : la Poussée a 15 % de chance par cran (le
// grimoire : Pourcent_Base 15, plafond 60), et une cible ennemie peut encore
// l'esquiver. À un seul cran, elle échoue donc presque six fois sur sept
// (« Poussée résisté » s'affiche alors sur la cible). Ce banc fige ce
// comportement : le ciblage ne perd pas la Poussée, et le cerveau la joue.
import fs from 'fs';
import { construireEtatCombat } from '../combat_etat.js';
import { appliquerIntention } from '../cerveau_combat.js';

const SRC = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(300);

// Le décor : un lanceur J1, un allié J2, deux ennemis. Le plateau est un
// simple hexagone sans murs ; la carte est forgée à la volée.
await p.evaluate((src) => {
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  window.PLATEAU_VTT = {
    hexSize: 30,
    hexToPixel: (q, r) => ({ x: q * 52, y: r * 45 }),
    pixelToHex: () => window.__caseCliquee,
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    getHexesInRadius: (q, r, rayon) => {
      const out = [];
      for (let dq = -rayon; dq <= rayon; dq++)
        for (let dr = -rayon; dr <= rayon; dr++)
          if (dist({ q, r }, { q: q + dq, r: r + dr }) <= rayon) out.push({ q: q + dq, r: r + dr });
      return out;
    }
  };
  window.VTT_POS_X = 0; window.VTT_POS_Y = 0; window.VTT_SCALE = 1;
  window.bonusEquip = () => 0;
  window.bonusPorteeMagique = () => 0;
  window.estUneCreature = (p) => !!(p && p.estMonstre);
  window.critiqueCombattant = () => 0;
  window.jouerSonClic = () => {};
  window.afficherMessageFlottantHex = (q, r, texte) => { window.__messages.push(texte); };
  window.estCombattantMort = () => false;
  window.EFFETS_BDD_CACHE = {
    ATT:  { id: "ATT", Nom: "Attaque légère", Valeur: 6 },
    SOIN: { id: "SOIN", Nom: "Soin", Valeur: 5 },
    BOND: { id: "BOND", Nom: "Bond", Valeur: 2 },
    DIST: { id: "DIST", Nom: "Distance", Valeur: 1 },
    POUS: { id: "POUS", Nom: "Poussée", Valeur: 2, Pourcent_Base: 15, Pourcent_Max: 60, Cible_Etat: "poussee", Type_Mecanique_2: "Physique" }
  };
  window.__hote = document.createElement("div");
  window.__hote.id = "apercu-carte-hd-competence";
  document.body.appendChild(window.__hote);
  new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField', src)(
    window, {}, () => ({}), async () => {}, async () => {}, async () => {}, () => ({}));

  // Le cerveau, réduit à ce qu'il reçoit.
  window.regimeDemande = {
    actif: () => true,
    carte: async (acteur, carte) => { window.__envoyees.push(JSON.parse(JSON.stringify(carte))); },
    bond: async (acteur, vers) => { window.__bonds.push(vers); }
  };

  window.__poser = (positions) => {
    window.__messages = []; window.__envoyees = []; window.__bonds = [];
    const lanceur = { idPersonnage: "J1", prenom: "Cybile", camp: "Allié", statut: "Vivant", Etats_Alteres: [] };
    window.PERSOS_PARTIE = [
      lanceur,
      { idPersonnage: "J2", prenom: "Pliors", camp: "Allié", statut: "Vivant", Etats_Alteres: [] },
      { idPersonnage: "M1", prenom: "Goule", camp: "Ennemi", statut: "Vivant", Etats_Alteres: [] },
      { idPersonnage: "M2", prenom: "Spectre", camp: "Ennemi", statut: "Vivant", Etats_Alteres: [] }
    ];
    window.TOKENS_VTT_DATA = JSON.parse(JSON.stringify(positions));
    window.COMBAT_PERSOS_JOUEUR = [lanceur];
    window.COMBAT_INDEX_PERSO = 0;
    window.ETAT_CIBLAGE = null;
  };
  window.__carte = (actions) => {
    const id = "C_" + Math.random().toString(36).slice(2, 8);
    window.COMPETENCES_CACHE = { [id]: { Nom: "Banc", Fatigue: 10, Arme: "Magie", Composants: { actions } } };
    return id;
  };
  window.__cibles = (carte, nom) => ((carte.attaques || []).find(a => a.nom === nom) || {}).cibles;
}, SRC);


console.log("1. LE CIBLAGE ENVOIE LE SOIN ET LA POUSSÉE, CHACUN SUR SA CIBLE");
const envoyees = {};
for (const [nom, actions, cible] of [
  ["sur la même action, poussée sur l'ennemi", [{ baseEffetId: "SOIN", mods: { POUS: 1 } }], "M1"],
  ["sur la même action, poussée sur un allié", [{ baseEffetId: "SOIN", mods: { POUS: 1 } }], "J2"],
  ["en deux actions, poussée ×3", [{ baseEffetId: "SOIN", mods: {} }, { baseEffetId: "POUS", count: 3, mods: {} }], "M1"],
]) {
  const r = await p.evaluate(async ({ actions, cible }) => {
    window.__poser({ J1: { q: 0, r: 0 }, J2: { q: 0, r: 1 }, M1: { q: 1, r: 0 }, M2: { q: 6, r: 0 } });
    const id = window.__carte(actions);
    await window.demarrerCiblage(id, { idLanceur: "J1" });
    window.ajouterCibleCiblage(cible);                    // phase 1 : qui pousser
    await window.declencherResolutionAvecBondEventuel();  // → phase du soin
    await window.declencherResolutionAvecBondEventuel();  // le lanceur se soigne
    return window.__envoyees[0] || null;
  }, { actions, cible });
  const pous = r && (r.alterations || []).find(a => a.nom === "Poussée");
  const soin = r && (r.attaques || []).find(a => a.nom === "Soin");
  verifier(`${nom} : la Poussée part vers ${cible}`, !!pous && JSON.stringify(pous.cibles) === JSON.stringify([cible]),
           JSON.stringify(pous && { cibles: pous.cibles, chance: pous.chance }));
  verifier(`${nom} : le soin part vers le lanceur`, !!soin && JSON.stringify(soin.cibles) === '["J1"]');
  envoyees[nom] = r;
}
const trois = (envoyees["en deux actions, poussée ×3"].alterations || []).find(a => a.nom === "Poussée");
verifier("la chance suit les crans : 15 % par cran (×3 = 45 %)", trois && trois.chance === 45, String(trois && trois.chance));

console.log("\n2. LE CERVEAU SOIGNE ET POUSSE");
{
  const fiche = (id, camp) => ({ idPersonnage: id, camp, prenom: id, PV_Max: 60, PV_Actuels: 30,
    Fatigue_Max: 100, Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant" });
  let pousses = 0, soins = 0;
  for (let g = 1; g <= 30; g++) {
    const etat = construireEtatCombat({ idPartie: "P1", cerveau: "P1", graine: g,
      combattants: [fiche("J1", "Allié"), fiche("J2", "Allié"), fiche("M1", "Ennemi")],
      positions: { J1: { q: 0, r: 0 }, J2: { q: 0, r: 1 }, M1: { q: 1, r: 0 } },
      partie: { Tour_Combat: 1, File_Attente_Combat: [{ idPersonnage: "J1", initiative: 10 }] } });
    const carte = envoyees["sur la même action, poussée sur l'ennemi"];
    const pas = appliquerIntention(etat, { id: "i" + g, type: "carte", acteur: "J1", idCarte: "C",
      attaques: carte.attaques, alterations: carte.alterations.map(a => ({ ...a, chance: 100 })), coutFatigue: 10 }, null);
    const types = (pas.entree && pas.entree.etapes || []).map(e => e.type);
    if (types.includes("poussee")) pousses++;
    if (types.includes("soin")) soins++;
  }
  verifier("à 100 %, l'ennemi est poussé à chaque fois", pousses === 30, `${pousses}/30`);
  verifier("et le lanceur soigné à chaque fois", soins === 30, `${soins}/30`);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
