// LES JAUGES DU PANNEAU GAUCHE.
// Elles sont pilotées par deux globales (COMBAT_PV_MAX / COMBAT_PV_ACTUELS) que
// plus d'une douzaine d'endroits mettent à jour à la main. Ce banc rejoue les
// séquences réelles d'un combat et vérifie, à chaque étape, que la barre et le
// chiffre disent la même chose que la donnée du combattant affiché.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';

const combat = fs.readFileSync('/home/user/Ivalis/combat.js','utf-8');
const html   = fs.readFileSync('/home/user/Ivalis/index.html','utf-8');

function fonction(marqueur) {
  const lignes = combat.split('\n');
  const d = lignes.findIndex(l => l.startsWith(marqueur));
  if (d < 0) throw new Error("introuvable : " + marqueur);
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === '};') { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}
// Le bloc de jauges tel qu'il est dans la page.
const debutJauges = html.indexOf('<div id="combat-jauges-container"');
const finJauges = html.indexOf('<!-- FLÈCHES NAVIGATION', debutJauges);
const blocJauges = html.slice(debutJauges, finJauges);

const page = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div id="combat-nom-perso"></div><img id="combat-portrait-perso"><div id="combat-type-monstre"></div>
<div id="combat-liste-competences"></div>
${blocJauges}
<script>
window.COMPETENCES_CACHE = {}; window.CACHE_COMPETENCES_GLOBAL = {};
window.COMBAT_PERSOS_JOUEUR = []; window.COMBAT_INDEX_PERSO = 0; window.COMBAT_PERSOS_JOUEUR_BACKUP = null;
window.actualiserBoutonFinTour = function(){}; window.actualiserEtatCarteCombat = function(){};
window.ajusterTitresBannieres = function(){};
${combat.slice(combat.indexOf('function combattantDuPanneau'), combat.indexOf('window.mettreAJourJaugePV = function'))}
${fonction('window.mettreAJourJaugePV = function')}
${fonction('window.mettreAJourJaugeFatigue = function')}
${fonction('window.chargerCompetencesCombat = function')}
${fonction('window.afficherPersoCombatActuel = function')}
${fonction('window.afficherDansPanneauGauche = function')}
${fonction('window.restaurerPanneauGauche = function')}
${combat.slice(combat.indexOf('function panneauVerrouilleParIA'), combat.indexOf('window.afficherDansPanneauGauche'))}
</script></body></html>`;
fs.writeFileSync('/tmp/jauges.html', page);

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 500, height: 700 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///tmp/jauges.html');
// Les lectures de stats mutualisées vivent dans app.js, chargé avant tout le
// reste sur la vraie page : un banc qui isole une fonction doit les poser aussi.
await p.evaluate(src => eval(src), SRC_STATS_COMMUNES);

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(56)} ${c?"OK":"ÉCHEC"} ${d}`); };

// Lit ce que le panneau AFFICHE réellement, et ce qu'il DEVRAIT afficher.
const lire = () => p.evaluate(() => {
  const aff = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
  const vrai = aff ? (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === aff.idPersonnage) : null;
  const pvMax = vrai ? (parseInt(vrai.PV_Max)||0) + (parseInt(vrai.Dev_Mod_PV)||0) : 0;
  const pv = vrai && vrai.PV_Actuels !== undefined ? parseInt(vrai.PV_Actuels) : pvMax;
  return {
    qui: aff ? aff.idPersonnage : null,
    barre: Math.round(parseFloat(document.getElementById('barre-pv-rouge').style.width) || 0),
    chiffre: document.getElementById('label-pv-actuel').innerText,
    attenduBarre: pvMax > 0 ? Math.round(100 * pv / pvMax) : 0,
    attenduChiffre: String(pv),
    barreFatigue: Math.round(parseFloat(document.getElementById('barre-fatigue-grise').style.width) || 0),
    attenduFatigue: vrai ? Math.round(100 * (vrai.fatigueActuelle ?? 100) / (parseInt(vrai.Fatigue_Max)||100)) : 0
  };
});

await p.evaluate(() => {
  window.PERSOS_PARTIE = [
    { idPersonnage:"J1", prenom:"Pliors", camp:"Allié", PV_Max:42, PV_Actuels:42, Dev_Mod_PV:0,
      Fatigue_Max:100, fatigueActuelle:100, couleur:"#4a1c1c", deckEquipe:[] },
    { idPersonnage:"M1", prenom:"Gnoll", estMonstre:true, camp:"Ennemi", PV_Max:90, PV_Actuels:90, Dev_Mod_PV:0,
      Fatigue_Max:120, fatigueActuelle:120, couleur:"#ff4c4c", deckEquipe:[] }
  ];
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
  window.COMBAT_INDEX_PERSO = 0;
  window.afficherPersoCombatActuel();
});

console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");

console.log("\n1. LE PERSONNAGE AFFICHÉ ENCAISSE (chemin du moteur)");
{
  let e = await lire();
  verifier("au départ, la barre est pleine", e.barre === 100 && e.chiffre === "42", `(${e.barre}% / ${e.chiffre})`);
  await p.evaluate(() => {
    const cible = window.PERSOS_PARTIE.find(x => x.idPersonnage === "J1");
    cible.PV_Actuels = 18;                                   // le moteur mute l'objet de PERSOS_PARTIE
    window.COMBAT_PV_ACTUELS = cible.PV_Actuels;             // puis recopie dans la globale
    window.mettreAJourJaugePV();
  });
  e = await lire();
  verifier("la barre suit les dégâts", e.barre === e.attenduBarre, `(${e.barre}% au lieu de ${e.attenduBarre}%)`);
  verifier("le chiffre suit aussi", e.chiffre === e.attenduChiffre, `(${e.chiffre} au lieu de ${e.attenduChiffre})`);
}

console.log("\n2. TIC DE POISON SUR LE PERSONNAGE AFFICHÉ");
{
  // Ce que fait combat.js au début du tour : PV et fatigue baissent, mais seule
  // la jauge de FATIGUE est redessinée.
  await p.evaluate(() => {
    const cible = window.PERSOS_PARTIE.find(x => x.idPersonnage === "J1");
    cible.PV_Actuels = 10; cible.fatigueActuelle = 60;
    window.COMBAT_PV_ACTUELS = cible.PV_Actuels;
    window.COMBAT_FATIGUE_ACTUELLE = cible.fatigueActuelle;
    // Ce que font maintenant les deux points du moteur qui appliquent un poison.
    window.mettreAJourJaugeFatigue(0);
    window.mettreAJourJaugePV();
  });
  const e = await lire();
  verifier("la barre de vie suit le poison", e.barre === e.attenduBarre, `(${e.barre}% au lieu de ${e.attenduBarre}%)`);
  verifier("le chiffre de vie suit le poison", e.chiffre === e.attenduChiffre, `(${e.chiffre} au lieu de ${e.attenduChiffre})`);
}

console.log("\n3. ON REGARDE UNE CRÉATURE, PUIS ELLE ENCAISSE");
{
  await p.evaluate(() => window.afficherDansPanneauGauche("M1"));
  let e = await lire();
  verifier("le panneau passe bien sur la créature", e.qui === "M1");
  verifier("sa barre part de son propre maximum", e.barre === 100 && e.chiffre === "90", `(${e.barre}% / ${e.chiffre})`);

  await p.evaluate(() => {
    const cible = window.PERSOS_PARTIE.find(x => x.idPersonnage === "M1");
    cible.PV_Actuels = 45;
    window.COMBAT_PV_ACTUELS = cible.PV_Actuels;
    window.mettreAJourJaugePV();
  });
  e = await lire();
  verifier("la barre de la créature est juste", e.barre === e.attenduBarre, `(${e.barre}% au lieu de ${e.attenduBarre}%)`);
}

console.log("\n4. RETOUR SUR SON PERSONNAGE");
{
  await p.evaluate(() => window.restaurerPanneauGauche());
  const e = await lire();
  verifier("le panneau revient sur le personnage", e.qui === "J1");
  verifier("la barre reprend l'échelle du personnage", e.barre === e.attenduBarre, `(${e.barre}% au lieu de ${e.attenduBarre}%)`);
  verifier("le chiffre est celui du personnage", e.chiffre === e.attenduChiffre, `(${e.chiffre} au lieu de ${e.attenduChiffre})`);
}

console.log("\n5. LA DONNÉE CHANGE PENDANT QU'ON REGARDE (arrivée Firestore)");
{
  // recomposerCombattants reconstruit les objets : COMBAT_PERSOS_JOUEUR garde
  // l'ancienne copie, PERSOS_PARTIE porte la nouvelle.
  await p.evaluate(() => {
    window.PERSOS_PARTIE = window.PERSOS_PARTIE.map(x => ({ ...x }));
    window.PERSOS_PARTIE.find(x => x.idPersonnage === "J1").PV_Actuels = 5;
    window.COMBAT_PV_ACTUELS = 5;
    window.mettreAJourJaugePV();
  });
  const e = await lire();
  verifier("la barre suit la donnée fraîche", e.barre === e.attenduBarre, `(${e.barre}% au lieu de ${e.attenduBarre}%)`);
}

console.log("\n6. UN MAXIMUM RESTÉ SUR LE COMBATTANT PRÉCÉDENT");
{
  // Le cas qui donne "le chiffre est bon mais la barre est fausse" : la globale
  // du maximum est encore celle de la créature (90) alors que le panneau montre
  // le personnage (42). La barre affichait 42/90 = 47 % pour un personnage
  // intact, pendant que le chiffre, lui, disait bien 42.
  await p.evaluate(() => {
    window.PERSOS_PARTIE.find(x => x.idPersonnage === "J1").PV_Actuels = 42;
    window.COMBAT_PV_MAX = 90;              // maximum périmé
    window.COMBAT_PV_ACTUELS = 42;
    window.mettreAJourJaugePV();
  });
  const e = await lire();
  verifier("la barre se recale sur le bon maximum", e.barre === 100, `(${e.barre}% au lieu de 100%)`);
  verifier("et le chiffre reste juste", e.chiffre === "42", `(${e.chiffre})`);
}

console.log("\n7. LA COPIE DU PANNEAU A VIEILLI (objet reconstruit par un snapshot)");
{
  await p.evaluate(() => {
    window.afficherDansPanneauGauche("M1");
    // recomposerCombattants remplace les objets : la copie gardée par le panneau
    // porte encore les anciens points de vie.
    window.PERSOS_PARTIE = window.PERSOS_PARTIE.map(x => ({ ...x }));
    window.PERSOS_PARTIE.find(x => x.idPersonnage === "M1").PV_Actuels = 9;
    window.mettreAJourJaugePV();
  });
  const e = await lire();
  verifier("la jauge lit la donnée fraîche, pas la copie", e.barre === e.attenduBarre && e.chiffre === "9",
           `(${e.barre}% / ${e.chiffre} — attendu ${e.attenduBarre}% / 9)`);
}

await p.screenshot({ path: '/tmp/jauges.png' });
await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
