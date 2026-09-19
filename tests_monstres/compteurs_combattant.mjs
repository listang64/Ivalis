// LES COMPTEURS DE VITALITÉ ET D'ÉNERGIE DU COMBATTANT.
//
// Ce banc s'appelait jauges_panneau.mjs et mesurait la largeur de deux barres
// dans le panneau latéral gauche. LE PANNEAU A ÉTÉ SUPPRIMÉ ; ce qu'il montrait
// ne l'est pas. COMBAT_PV_MAX / COMBAT_PV_ACTUELS et leurs jumelles d'énergie
// sont recopiées à la main depuis plus d'une douzaine d'endroits du moteur, et
// il suffit qu'un seul oublie pour que tout ce qui les lit mente — le bloc du
// héros en bas à droite, la bulle de la piste, les contrôles de coût.
//
// mettreAJourJaugePV et mettreAJourJaugeFatigue ne dessinent plus rien : elles
// REMETTENT CES GLOBALES D'ACCORD avec la fiche du combattant. C'est ce travail
// que ce banc rejoue, séquence réelle par séquence réelle.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';

const combat = fs.readFileSync('/home/user/Ivalis/combat.js','utf-8');

function fonction(marqueur) {
  const lignes = combat.split('\n');
  const d = lignes.findIndex(l => l.startsWith(marqueur));
  if (d < 0) throw new Error("introuvable : " + marqueur);
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === '};') { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}

const page = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div id="combat-liste-competences"></div>
<script>
window.COMPETENCES_CACHE = {}; window.CACHE_COMPETENCES_GLOBAL = {};
window.COMBAT_PERSOS_JOUEUR = []; window.COMBAT_INDEX_PERSO = 0;
window.actualiserBoutonFinTour = function(){}; window.actualiserEtatCarteCombat = function(){};
window.ajusterTitresBannieres = function(){};
// Le bloc du héros se greffe sur les deux jauges : on compte ses réveils.
window.APPELS_HUD = 0;
window.actualiserHudHeros = function(){ window.APPELS_HUD++; };
${combat.slice(combat.indexOf('function combattantCourant'), combat.indexOf('window.mettreAJourJaugePV = function'))}
${fonction('window.mettreAJourJaugePV = function')}
${fonction('window.mettreAJourJaugeFatigue = function')}
${fonction('window.chargerCompetencesCombat = function')}
${fonction('window.afficherPersoCombatActuel = function')}
</script></body></html>`;
fs.writeFileSync('/tmp/compteurs.html', page);

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 500, height: 700 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///tmp/compteurs.html');
// Les lectures de stats mutualisées vivent dans app.js, chargé avant tout le
// reste sur la vraie page : un banc qui isole une fonction doit les poser aussi.
await p.evaluate(src => eval(src), SRC_STATS_COMMUNES);

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(56)} ${c?"OK":"ÉCHEC"} ${d}`); };

// Ce que le combat RETIENT, et ce qu'il DEVRAIT retenir d'après la fiche vivante.
const lire = () => p.evaluate(() => {
  const suivi = window.COMBAT_PERSOS_JOUEUR[window.COMBAT_INDEX_PERSO];
  const vrai = suivi ? (window.PERSOS_PARTIE || []).find(x => x.idPersonnage === suivi.idPersonnage) : null;
  const pvMax = vrai ? (parseInt(vrai.PV_Max)||0) + (parseInt(vrai.Dev_Mod_PV)||0) : 0;
  const pv = vrai && vrai.PV_Actuels !== undefined ? parseInt(vrai.PV_Actuels) : pvMax;
  return {
    qui: suivi ? suivi.idPersonnage : null,
    max: window.COMBAT_PV_MAX, actuels: window.COMBAT_PV_ACTUELS,
    attenduMax: pvMax, attenduActuels: pv,
    fatigueMax: window.COMBAT_FATIGUE_MAX, fatigue: window.COMBAT_FATIGUE_ACTUELLE,
    attenduFatigueMax: vrai ? (parseInt(vrai.Fatigue_Max)||0) + (parseInt(vrai.Dev_Mod_Fatigue)||0) : 0,
    attenduFatigue: vrai ? (vrai.fatigueActuelle ?? 0) : 0
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
  window.mettreAJourJaugePV();
  window.mettreAJourJaugeFatigue(0);
});

console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");

console.log("\n1. LE COMBATTANT SUIVI ENCAISSE (chemin du moteur)");
{
  let e = await lire();
  verifier("au départ, les compteurs sont pleins",
           e.max === 42 && e.actuels === 42, `(${e.actuels}/${e.max})`);
  await p.evaluate(() => {
    const cible = window.PERSOS_PARTIE.find(x => x.idPersonnage === "J1");
    cible.PV_Actuels = 18;                                   // le moteur mute l'objet de PERSOS_PARTIE
    window.COMBAT_PV_ACTUELS = cible.PV_Actuels;             // puis recopie dans la globale
    window.mettreAJourJaugePV();
  });
  e = await lire();
  verifier("la vitalité retenue suit les dégâts", e.actuels === e.attenduActuels,
           `(${e.actuels} au lieu de ${e.attenduActuels})`);
  verifier("le maximum reste celui du combattant", e.max === e.attenduMax,
           `(${e.max} au lieu de ${e.attenduMax})`);
}

console.log("\n2. TIC DE POISON SUR LE COMBATTANT SUIVI");
{
  // Le défaut historique : le tic baissait PV ET fatigue, mais ne redessinait
  // que la fatigue. La vitalité restait sur la valeur d'avant.
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
  verifier("la vitalité suit le poison", e.actuels === e.attenduActuels,
           `(${e.actuels} au lieu de ${e.attenduActuels})`);
  verifier("l'énergie aussi", e.fatigue === e.attenduFatigue,
           `(${e.fatigue} au lieu de ${e.attenduFatigue})`);
}

console.log("\n3. PLUS PERSONNE NE PEUT DÉTOURNER CES COMPTEURS");
{
  // LA VISIONNEUSE A ÉTÉ SUPPRIMÉE. Elle remplaçait COMBAT_PERSOS_JOUEUR par
  // [le combattant regardé], créature comprise : les compteurs du poste
  // basculaient alors sur un gnoll, et tout ce qui les lit avec. Il ne doit
  // plus exister nulle part de quoi refaire ce tour de passe-passe.
  const restes = await p.evaluate(() => [
    "afficherDansPanneauGauche", "restaurerPanneauGauche", "panneauVerrouilleParIA",
    "COMBAT_PERSOS_JOUEUR_BACKUP", "togglePanneauGauche", "changerPersoCombat"
  ].filter(n => window[n] !== undefined));
  verifier("aucune trace de la visionneuse sur window", restes.length === 0, `(${restes.join(", ") || "aucune"})`);

  const dansLaSource = ["afficherDansPanneauGauche", "restaurerPanneauGauche", "panneauVerrouilleParIA",
                        "COMBAT_PERSOS_JOUEUR_BACKUP", "togglePanneauGauche"]
    .filter(n => new RegExp("window\\." + n + "\\s*[=(]").test(combat));
  verifier("ni dans combat.js", dansLaSource.length === 0, `(${dansLaSource.join(", ") || "aucune"})`);

  const e = await lire();
  verifier("le poste suit toujours son propre héros", e.qui === "J1", `(${e.qui})`);
}

console.log("\n4. LA DONNÉE CHANGE PENDANT LE COMBAT (arrivée Firestore)");
{
  // recomposerCombattants reconstruit les objets : COMBAT_PERSOS_JOUEUR garde
  // l'ancienne copie, PERSOS_PARTIE porte la nouvelle.
  await p.evaluate(() => {
    window.PERSOS_PARTIE = window.PERSOS_PARTIE.map(x => ({ ...x }));
    window.PERSOS_PARTIE.find(x => x.idPersonnage === "J1").PV_Actuels = 5;
    window.mettreAJourJaugePV();
  });
  const e = await lire();
  verifier("les compteurs suivent la donnée fraîche", e.actuels === e.attenduActuels,
           `(${e.actuels} au lieu de ${e.attenduActuels})`);
}

console.log("\n5. UN MAXIMUM RESTÉ SUR UN AUTRE COMBATTANT");
{
  // Le cas qui donne « le chiffre est bon mais la jauge est fausse » : la
  // globale du maximum est encore celle d'une créature (90) alors que le poste
  // suit son héros (42). Tout ce qui calcule un pourcentage affichait 42/90.
  await p.evaluate(() => {
    window.PERSOS_PARTIE.find(x => x.idPersonnage === "J1").PV_Actuels = 42;
    window.COMBAT_PV_MAX = 90;              // maximum périmé
    window.COMBAT_PV_ACTUELS = 42;
    window.mettreAJourJaugePV();
  });
  const e = await lire();
  verifier("le maximum se recale sur le combattant suivi", e.max === 42, `(${e.max} au lieu de 42)`);
  verifier("et la valeur courante reste juste", e.actuels === 42, `(${e.actuels})`);
}

console.log("\n6. LA COPIE SUIVIE A VIEILLI (objet reconstruit par un snapshot)");
{
  await p.evaluate(() => {
    // recomposerCombattants remplace les objets : la copie gardée par
    // COMBAT_PERSOS_JOUEUR porte encore les anciens points de vie.
    window.PERSOS_PARTIE = window.PERSOS_PARTIE.map(x => ({ ...x }));
    window.PERSOS_PARTIE.find(x => x.idPersonnage === "J1").PV_Actuels = 9;
    window.mettreAJourJaugePV();
  });
  const e = await lire();
  verifier("le compteur lit la donnée fraîche, pas la copie", e.actuels === 9,
           `(${e.actuels} — attendu 9)`);
}

console.log("\n7. LE BLOC DU HÉROS EST RÉVEILLÉ PAR LES DEUX JAUGES");
{
  // C'est le seul affichage qui reste. Il ne s'abonne à rien : ce sont les deux
  // fonctions de jauge qui le préviennent, parce qu'elles sont appelées de
  // partout — du tic de poison au clic sur une carte.
  const appels = await p.evaluate(() => {
    window.APPELS_HUD = 0;
    window.mettreAJourJaugePV();
    const apresPV = window.APPELS_HUD;
    window.mettreAJourJaugeFatigue(12);
    return { apresPV, total: window.APPELS_HUD };
  });
  verifier("la vitalité le réveille", appels.apresPV === 1, `(${appels.apresPV})`);
  verifier("l'énergie aussi", appels.total === 2, `(${appels.total})`);
}

console.log("\n8. L'APERÇU DU COÛT NE TOUCHE PLUS AUX COMPTEURS");
{
  // La barre d'énergie montrait le coût d'une carte en rouge avant qu'on la
  // joue. Cet aperçu vivait dans le panneau ; le compteur, lui, est un ÉTAT :
  // passer un coût ne doit pas faire baisser l'énergie retenue.
  const avant = await lire();
  await p.evaluate(() => window.mettreAJourJaugeFatigue(40));
  const apres = await lire();
  verifier("l'énergie retenue ne bouge pas d'un aperçu",
           apres.fatigue === avant.fatigue && apres.fatigue === apres.attenduFatigue,
           `(${avant.fatigue} → ${apres.fatigue})`);
}

console.log("\nerreurs JS :", erreurs.length ? erreurs : "aucune");
await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
