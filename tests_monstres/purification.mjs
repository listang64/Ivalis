// LA PURIFICATION : UN ÉTAT EN MOINS, À COUP SÛR, POUR UN COÛT FIXE.
//
// Nico a changé la fiche dans le grimoire : « Enlève un état aléatoire sur la
// cible », Valeur 1, Pourcentage de base 0, Pourcentage max 1, coût 6. Avant,
// c'était « 50 % de chance d'enlever tous les effets négatifs ». Lu avec
// l'ancien code, la nouvelle fiche aurait donné une purification qui ne se
// déclenche JAMAIS (chance = Pourcent_Base = 0) et qui soigne 1 PV (la Valeur
// lue comme un montant de soin). Ce banc passe la vraie fiche au vrai
// moteur_effets.js, puis vérifie le jet (moteur_pur.js) et ce que l'écran en
// dit (pont_combat.js).
import fs from 'fs';
import { tirerDesCarte, resoudreCarte } from '../moteur_pur.js';
import { construireEtatCombat } from '../combat_etat.js';
import { misEnScene } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// La fiche telle que la base la porte (lue en lecture seule le 24/09).
const GRIMOIRE = {
  EFF_PURIFICATION: { id: "EFF_PURIFICATION", Nom: "Purification", Valeur: 1, Pourcent_Base: 0, Pourcent_Max: 1,
    Cout_PT: "6", Modificateur: "SAGESSE", Type_Mecanique: "Action/Global", Type_Mecanique_2: "Aucun",
    Cible_Etat: "purification", Tours: 0, Effet_Base: "Enlève un état aléatoire sur la cible." },
  EFF_SOIN: { id: "EFF_SOIN", Nom: "Soin", Valeur: 8, Pourcent_Base: 0, Pourcent_Max: 0, Cout_PT: "2",
    Type_Mecanique: "Action/Global", Effet_Base: "Soigne 8 PV." }
};

console.log("\n1. CE QUE LA CARTE EXTRAIT (vrai moteur_effets.js)");
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
{
  const r = await p.evaluate(async () => {
    const seule = await window.__extraire([{ baseEffetId: "EFF_PURIFICATION", count: 1, mods: {} }]);
    const soinPurifiant = await window.__extraire([{ baseEffetId: "EFF_SOIN", count: 1, mods: { EFF_PURIFICATION: 1 } }]);
    const a = seule.attaques[0] || {}, b = soinPurifiant.attaques[0] || {};
    return { a: { chance: a.purifChance, nombre: a.purifNombre, brut: a.valeurBrute, isHeal: a.isHeal },
             b: { chance: b.purifChance, nombre: b.purifNombre, brut: b.valeurBrute } };
  });
  verifier("la purification se déclenche à coup sûr (100 %)", r.a.chance === 100, JSON.stringify(r.a));
  verifier("elle retire 1 état (la Valeur du grimoire)", r.a.nombre === 1);
  verifier("elle ne soigne rien (Valeur = nombre d'états, pas des PV)", r.a.brut === 0);
  verifier("elle reste un soutien (se vise sur soi ou un allié)", r.a.isHeal === true);
  verifier("posée en modificateur d'un Soin : 8 PV ET un état retiré",
           r.b.brut === 8 && r.b.chance === 100 && r.b.nombre === 1, JSON.stringify(r.b));
}
await b.close();

console.log("\n2. LE JET ET LA RÉSOLUTION (vrai moteur_pur.js)");
{
  const etat = construireEtatCombat({
    idPartie: "G", cerveau: "P", graine: 3,
    combattants: [
      { idPersonnage: "H1", idJoueur: "P", camp: "Allié", prenom: "Naomi", PV_Max: 60, PV_Actuels: 30, Fatigue_Max: 100,
        Esquive: 100, Parade: 0, statut: "Vivant",
        Etats_Alteres: [{ nom: "Brûlé", duree: 2 }, { nom: "Glacé", duree: 2 }, { nom: "Absorption", duree: 1, valeurAbs: 20 }] },
      { idPersonnage: "H2", idJoueur: "Q", camp: "Allié", prenom: "Ben", PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100,
        Esquive: 0, Parade: 0, Etats_Alteres: [], statut: "Vivant" }
    ],
    positions: { H1: { q: 0, r: 0 }, H2: { q: 1, r: 0 } },
    partie: { Phase_Combat: "Resolution", Ordre_Initiative: ["H2", "H1"], File_Attente_Combat: [{ idPersonnage: "H2" }] }
  });
  verifier("le décor porte bien trois états", etat.combattants.H1.etats.length === 3,
           JSON.stringify(etat.combattants.H1.etats.map(e => e.nom)));
  const plan = { attaques: [{ nom: "Purification", valeurBrute: 0, isHeal: true, purifChance: 100, purifNombre: 1, cibles: ["H1"] }],
                 alterations: [] };
  const desFixe = (suite) => { const f = [...suite]; return { d100: () => f.length ? f.shift() : 50 }; };
  // Un soin ne s'esquive pas : pas de dé de défense. 1er dé : la chance (100 %) ; 2e : le choix.
  const jets = tirerDesCarte(etat, plan, "H2", false, desFixe([100, 2]));
  verifier("un dé de 100 contre 100 % : ça passe toujours", jets.parCible.H1.purifie === true, JSON.stringify(jets.parCible.H1));
  verifier("le choix de l'état est tiré avec les autres dés", jets.parCible.H1.purifJet === 2);
  const r = resoudreCarte(etat, { type: "carte", idLanceur: "H2", idCarte: "CP", ...plan, jets });
  const reste = r.etat.combattants.H1.etats.map(e => e.nom);
  verifier("un seul état néfaste part (dé 2 → le Glacé)", reste.join() === "Brûlé,Absorption", reste.join());
  verifier("l'Absorption reste", reste.includes("Absorption"));
  verifier("aucun PV rendu", r.etat.combattants.H1.pv === 30, String(r.etat.combattants.H1.pv));

  console.log("\n3. CE QUE L'ÉCRAN EN DIT (vrai pont_combat.js)");
  const etape = r.etapes.find(e => e.purifie);
  const scene = misEnScene(etape, r.etat);
  verifier("un message dit quel état est parti", scene.geste === "message" && /Purifié : Glacé/.test(scene.texte),
           JSON.stringify(scene));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.join(" | "));
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
