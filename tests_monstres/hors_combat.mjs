// RIEN NE DOIT SE PASSER HORS DU COMBAT.
// La bulle de validation de déplacement était en position fixe au-dessus de
// tout l'écran. Comme l'IA des monstres continuait de jouer ses tours en
// arrière-plan même la fenêtre de combat fermée, la bulle venait se poser
// par-dessus l'écran de création de personnage.
//
// La bulle est partie (refonte du bouton fin de tour) : la croix d'annulation
// vit maintenant sous le pion lui-même, et « valider » est devenu une image du
// bouton fin de tour — tous deux posés par appliquerTokensVTT/
// actualiserBoutonFinTour (combat.js), jamais par ce fichier. Le risque reste
// le même sous une autre forme : si ces deux redessins tournaient hors combat,
// ils écriraient dans un DOM qui n'est pas censé bouger (pion d'un autre
// écran, bouton d'un HUD masqué). Ce banc vérifie donc qu'ajouterEtapeMouvement
// ne les appelle QUE si le combat est à l'écran.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';

const mouvement = fs.readFileSync('/home/user/Ivalis/mouvement.js','utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 700 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
p.on('pageerror', () => {});
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(200);
// Les lectures de stats mutualisées (atouts de race compris) vivent dans
// app.js, chargé avant tout le reste sur la vraie page.
await p.evaluate(src => eval(src), SRC_STATS_COMMUNES);

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c?"OK":"ÉCHEC"} ${d}`); };

const tracer = (combatOuvert) => p.evaluate(({ src, combatOuvert }) => {
  document.getElementById("fenetre-combat").style.display = combatOuvert ? "block" : "none";
  window.PLATEAU_VTT = {
    getCaseState: () => ({ isBlocked:false, isDeleted:false, isDifficult:false }),
    hexToPixel: (q, r) => ({ x: q*60, y: r*60 })
  };
  window.TOKENS_VTT_DATA = { J1:{q:0,r:0} };
  window.PERSOS_PARTIE = [{ idPersonnage:"J1", camp:"Allié", PV_Max:42, PV_Actuels:42,
                            Fatigue_Max:100, fatigueActuelle:100 }];
  window.TOKEN_SELECTIONNE = "J1";
  window.CHEMIN_MOUVEMENT = [];
  window.CHEMIN_START_NODE = { q:0, r:0 };
  window.MOUVEMENT_COUT_TOTAL = 0;
  window.COMBAT_FATIGUE_ACTUELLE = 100;
  window.COUT_COMPETENCE_SELECTIONNEE = 0;
  window.afficherMessageFlottantHex = () => {};
  window.caseOccupeeParVivant = () => false;
  window.estCombattantMort = () => false;
  window.APPELS = [];
  window.appliquerTokensVTT = () => window.APPELS.push("appliquerTokensVTT");
  window.actualiserBoutonFinTour = () => window.APPELS.push("actualiserBoutonFinTour");
  // Le module remet ses propres variables à zéro en se chargeant : on le charge
  // d'abord, on pose l'état de la partie ensuite.
  new Function('window', src)(window);
  window.CHEMIN_MOUVEMENT = [];
  window.CHEMIN_START_NODE = { q:0, r:0 };
  window.MOUVEMENT_COUT_TOTAL = 0;
  window.ajouterEtapeMouvement(1, 0);
  return { appels: window.APPELS, etapes: (window.CHEMIN_MOUVEMENT || []).length };
}, { src: mouvement, combatOuvert });

console.log("1. FENÊTRE DE COMBAT FERMÉE");
{
  const r = await tracer(false);
  verifier("ni la croix (appliquerTokensVTT) ni le bouton fin de tour ne se redessinent",
           r.appels.length === 0, `(${JSON.stringify(r.appels)})`);
}

console.log("\n2. FENÊTRE DE COMBAT OUVERTE");
{
  const r = await tracer(true);
  verifier("la croix et le bouton fin de tour se redessinent normalement en combat",
           r.appels.includes("appliquerTokensVTT") && r.appels.includes("actualiserBoutonFinTour"),
           `(${JSON.stringify(r.appels)})`);
  verifier("le chemin est bien tracé", r.etapes > 0, `(${r.etapes} étape(s))`);
}

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
