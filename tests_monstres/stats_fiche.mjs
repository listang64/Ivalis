// LES STATS DE LA FICHE PERSO, RELIÉES AU COMBAT.
// Les outils de développement de la fiche n'écrasent pas les valeurs de base :
// ils écrivent leur écart à côté (Dev_Mod_*). La fiche affichait bien la somme,
// mais le combat lisait la base seule pour l'énergie, la régénération et la
// vitalité maximale : une Énergie Max portée à 110 retombait à 100 en jeu.
// Ce banc suit une retouche depuis le document Firestore jusqu'au pixel de la
// jauge, puis passe le moteur au peigne fin pour qu'aucune lecture n'oublie
// à nouveau sa retouche.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';

const app    = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8');
const combat = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
const html   = fs.readFileSync('/home/user/Ivalis/index.html', 'utf-8');

function extraire(src, marqueur, finLigne = '};') {
  const lignes = src.split('\n');
  const d = lignes.findIndex(l => l.startsWith(marqueur));
  if (d < 0) throw new Error("introuvable : " + marqueur);
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}
const fnCombat = (m) => extraire(combat, m);
const srcConversion = extraire(app, 'function persoDocVersFront(id, d) {', '}');

// Une page réduite au panneau gauche et à la piste d'initiative.
const debutJauges = html.indexOf('<div id="combat-jauges-container"');
const blocJauges = html.slice(debutJauges, html.indexOf('<!-- FLÈCHES NAVIGATION', debutJauges));

const page = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div id="fenetre-combat" style="display:block">
<div id="combat-nom-perso"></div><img id="combat-portrait-perso"><div id="combat-type-monstre"></div>
<div id="combat-liste-competences"></div>
${blocJauges}
<div id="piste-initiative"></div>
</div>
<script>
window.COMPETENCES_CACHE = {}; window.CACHE_COMPETENCES_GLOBAL = {};
window.COMBAT_PERSOS_JOUEUR = []; window.COMBAT_INDEX_PERSO = 0; window.COMBAT_PERSOS_JOUEUR_BACKUP = null;
window.actualiserBoutonFinTour = function(){}; window.actualiserEtatCarteCombat = function(){};
window.ajusterTitresBannieres = function(){}; window.selectionnerEtCentrerPerso = function(){};
window.estCombattantMort = function(){ return false; };
${SRC_STATS_COMMUNES}
${srcConversion}
${combat.slice(combat.indexOf('function combattantDuPanneau'), combat.indexOf('window.mettreAJourJaugePV = function'))}
${fnCombat('window.mettreAJourJaugePV = function')}
${fnCombat('window.mettreAJourJaugeFatigue = function')}
${fnCombat('window.chargerCompetencesCombat = function')}
${fnCombat('window.afficherPersoCombatActuel = function')}
${fnCombat('window.afficherDansPanneauGauche = function')}
${fnCombat('window.restaurerPanneauGauche = function')}
${fnCombat('window.afficherPisteInitiative = function')}
${combat.slice(combat.indexOf('function panneauVerrouilleParIA'), combat.indexOf('window.afficherDansPanneauGauche'))}
</script></body></html>`;
fs.writeFileSync('/tmp/stats_fiche.html', page);

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 600, height: 800 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///tmp/stats_fiche.html');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

console.log("1. DE LA FICHE AU COMBATTANT");

// Le document Firestore exactement tel que les outils de la fiche l'écrivent :
// valeurs de base intactes, retouches à côté.
const docFiche = {
  ID_Partie: "P1", ID_Joueur: "NICO", Camp: "Allié", Prenom_Personnage: "Pliors",
  PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 100, Fatigue_Actuelle: 100,
  Regeneration: 30, Esquive: 15, Parade: 0, Critique: 10, Def_Physique: 0, Def_Magique: 0,
  Dev_Mod_PV: 5, Dev_Mod_Fatigue: 10, Dev_Mod_Regen: 20,
  Dev_Mod_Esquive: 25, Dev_Mod_Parade: 5, Dev_Mod_Critique: 15,
  Dev_Mod_DefPhys: 40, Dev_Mod_DefMag: 30
};

const perso = await p.evaluate((d) => window.persoDocVersFront("J1", d), docFiche);

verifier("les retouches survivent à la conversion de la fiche",
         perso.Dev_Mod_Fatigue === 10 && perso.Dev_Mod_DefPhys === 40 && perso.Dev_Mod_Regen === 20);

const lectures = await p.evaluate((perso) => ({
  pvMax: window.pvMaxCombattant(perso),
  fatigueMax: window.fatigueMaxCombattant(perso),
  regen: window.regenerationCombattant(perso)
}), perso);

console.log(`     vitalité ${docFiche.PV_Max}+${docFiche.Dev_Mod_PV} → ${lectures.pvMax}`
          + ` | énergie ${docFiche.Fatigue_Max}+${docFiche.Dev_Mod_Fatigue} → ${lectures.fatigueMax}`
          + ` | régén. ${docFiche.Regeneration}+${docFiche.Dev_Mod_Regen} → ${lectures.regen}%`);

verifier("la vitalité maximale vaut base + retouche", lectures.pvMax === 45, `(${lectures.pvMax})`);
verifier("l'énergie maximale aussi", lectures.fatigueMax === 110, `(${lectures.fatigueMax})`);
verifier("la régénération aussi", lectures.regen === 50, `(${lectures.regen}%)`);

console.log("\n2. CE QUE LE PANNEAU AFFICHE");

const panneau = await p.evaluate((perso) => {
  window.PERSOS_PARTIE = [perso];
  window.COMBAT_PERSOS_JOUEUR = [JSON.parse(JSON.stringify(perso))];
  window.COMBAT_INDEX_PERSO = 0;
  window.afficherPersoCombatActuel();
  return {
    fatigueMax: window.COMBAT_FATIGUE_MAX,
    pvMax: window.COMBAT_PV_MAX,
    etiquetteEnergie: document.getElementById("label-fatigue-actuelle").innerText,
    etiquetteVie: document.getElementById("label-pv-actuel").innerText,
    largeurEnergie: document.getElementById("barre-fatigue-grise").style.width
  };
}, perso);

console.log(`     jauge d'énergie : « ${panneau.etiquetteEnergie} » à ${panneau.largeurEnergie}`);
console.log(`     jauge de vie    : « ${panneau.etiquetteVie} »`);

verifier("le panneau retient 110 d'énergie maximale, pas 100",
         panneau.fatigueMax === 110, `(${panneau.fatigueMax})`);
verifier("et 45 de vitalité maximale", panneau.pvMax === 45, `(${panneau.pvMax})`);
verifier("l'énergie affichée est celle du combattant", panneau.etiquetteEnergie === "100",
         `(${panneau.etiquetteEnergie})`);
verifier("la barre n'est pas pleine : 100 sur 110",
         panneau.largeurEnergie === (100 / 110 * 100) + "%" || parseFloat(panneau.largeurEnergie) < 100,
         `(${panneau.largeurEnergie})`);

console.log("\n3. CE QUE LA PISTE D'INITIATIVE AFFICHE");

const piste = await p.evaluate(() => {
  window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1,
    File_Attente_Combat: [{ idPersonnage: "J1", idCarte: "C1", initiative: 70 }] };
  window.afficherPisteInitiative(window.PARTIE_DATA.File_Attente_Combat, "Resolution");
  const bulle = document.getElementById("piste-initiative").firstElementChild;
  const barres = bulle.querySelectorAll("div[style*='width:']");
  // La jauge d'énergie de la bulle est la seconde des deux petites barres.
  const remplissages = [...bulle.querySelectorAll("div")]
    .map(d => d.style.width).filter(w => w && w.endsWith("%"));
  return { remplissages };
});

console.log(`     remplissages des bulles : ${piste.remplissages.join(" ")}`);
verifier("la bulle montre 100 sur 110, pas une jauge pleine",
         piste.remplissages.some(w => Math.abs(parseFloat(w) - (100 / 110 * 100)) < 0.5),
         `(${piste.remplissages.join(" ")})`);

console.log("\n4. AUCUNE LECTURE N'OUBLIE SA RETOUCHE");

// Balayage du moteur : toute lecture d'une stat de fiche doit soit ajouter son
// modificateur sur place, soit passer par une lecture mutualisée.
const paires = {
  PV_Max: "Dev_Mod_PV", Fatigue_Max: "Dev_Mod_Fatigue", fatigueMax: "Dev_Mod_Fatigue",
  Regeneration: "Dev_Mod_Regen", Esquive: "Dev_Mod_Esquive", Parade: "Dev_Mod_Parade",
  Def_Physique: "Dev_Mod_DefPhys", Def_Magique: "Dev_Mod_DefMag"
};
// Les fabriques de monstres recopient un gabarit, qui n'a pas de retouches.
const exceptions = [/gabarit\./, /monstre\.fatigueMax/, /^\s*Fatigue_Max:/, /^\s*Regeneration:/];
const moteur = ["combat.js", "moteur_effets.js", "mouvement.js", "monstres_ia.js",
                "competences.js", "monstres.js"];

const oublis = [];
for (const [stat, mod] of Object.entries(paires)) {
  for (const f of moteur) {
    const lignes = fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8').split('\n');
    lignes.forEach((l, i) => {
      if (!new RegExp('\\.' + stat + '\\b').test(l)) return;
      if (exceptions.some(e => e.test(l))) return;
      const voisinage = lignes.slice(Math.max(0, i - 1), i + 3).join('\n');
      if (voisinage.includes(mod) || voisinage.includes("Combattant(")) return;
      oublis.push(`${f}:${i + 1} ${stat} — ${l.trim().slice(0, 70)}`);
    });
  }
}
oublis.forEach(o => console.log("     " + o));
verifier("aucune stat lue sans sa retouche dans tout le moteur", oublis.length === 0,
         `(${oublis.length} oubli(s))`);

// Et les lectures mutualisées sont bien à leur place, avant tout le reste.
const ordre = html.match(/src="([a-z_]+\.js)/g).map(m => m.slice(5));
verifier("app.js, qui les porte, est chargé avant le moteur",
         ordre.indexOf("app.js") < Math.min(...moteur.map(f => ordre.indexOf(f)).filter(i => i >= 0)),
         `(${ordre.slice(0, 4).join(", ")}…)`);

console.log("\nerreurs JS :", erreurs.length ? erreurs : "aucune");
await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
