// LE BANDEAU D'ACTION ET LE RELAIS PISTE / PANNEAU.
// La piste d'initiative NE referme PLUS le panneau latéral gauche à son
// apparition (Nico l'a fait retirer : ça le coupait dans la lecture de sa
// fiche) — seule sa disparition continue de le rouvrir tout seul, au moment
// de choisir une carte. Le panneau garde cependant sa vieille règle, elle
// jamais remise en cause : tant qu'il est ouvert, il occupe le coin et le
// bandeau du bas (nom en or brossé, effets sur une ligne, bouton doré
// clignotant) reste masqué.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';

const src = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
const lignes = src.split('\n');

// Un bloc de fonctions consécutives : de "afficherPisteInitiative" jusqu'à la
// fin de "lancerCarteBandeau" (la dernière du chapitre du bandeau).
function bloc(debutMarqueur, finMarqueur) {
  const d = lignes.findIndex(l => l.startsWith(debutMarqueur));
  let dFin = lignes.findIndex((l, i) => i > d && l.startsWith(finMarqueur));
  if (dFin === -1) dFin = d;
  let f = dFin; for (let i = dFin + 1; i < lignes.length; i++) { if (lignes[i] === '};') { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}
function fonction(marqueur) { return bloc(marqueur, marqueur); }

const srcBandeau = bloc('window.afficherPisteInitiative = function', 'window.lancerCarteBandeau = function');
const srcToggle  = fonction('window.togglePanneauGauche = function');
const srcBouton  = fonction('window.actualiserBoutonFinTour = function');
// L'état de départ du panneau vit hors de toute fonction : on le reprend tel quel.
const srcEtatInitial = lignes.find(l => l.startsWith('window.PANNEAU_GAUCHE_OUVERT ='));
// Le vrai gestionnaire de "clic dans le vide" : c'est lui qui annulait le
// ciblage juste après le clic qui venait de l'ouvrir.
const dClic = lignes.findIndex(l => l.startsWith('document.addEventListener("click", function(event) {'));
let fClic = dClic; for (let i = dClic + 1; i < lignes.length; i++) { if (lignes[i] === '});') { fClic = i; break; } }
const srcClicVide = lignes.slice(dClic, fClic + 1).join('\n');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2 });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(300);
// Les lectures de stats mutualisées vivent dans app.js, chargé avant tout le
// reste sur la vraie page : un banc qui isole une fonction doit les poser aussi.
await p.evaluate(src => eval(src), SRC_STATS_COMMUNES);

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const res = await p.evaluate(async ({ sBandeau, sToggle, sBouton, sEtatInitial, sClicVide }) => {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById('fenetre-combat').style.display = 'block';
  document.getElementById('img-hud-fintour').style.height = '150px';

  window.jouerSonClic = () => { window.CLICS = (window.CLICS || 0) + 1; };
  window.estCombattantMort = (id) => !!(window.MORTS || []).includes(id);
  window.selectionnerEtCentrerPerso = () => {};
  window.CIBLAGES = [];
  window.demarrerCiblage = (idCarte) => { window.CIBLAGES.push(idCarte); };

  // Une carte de héros et une carte de créature, au format exact de la Forge.
  const carteHeros = { Nom: "Lame du crépuscule", Fatigue: 30, Initiative: 70, Effets_Compiles: [
      { nom: "Attaque légère", desc: "12 dégâts", isMod: false },
      { nom: "Distance +", desc: "+1 case", isMod: true },
      { nom: "Initiative +", desc: "+5", isMod: true },
      { nom: "Saignement", desc: "3 dégâts par tour", isMod: true }
  ]};
  const carteMonstre = { Nom: "Hurlement putride", Fatigue: 40, Initiative: 55, Effets_Compiles: [
      { nom: "Mot de pouvoir", desc: "9 dégâts", isMod: false },
      { nom: "Peur", desc: "fuite 2 cases", isMod: true },
      { nom: "Zone", desc: "3 hexagone(s)", isMod: true, isZone: true }
  ]};

  window.PERSOS_PARTIE = [
    { idPersonnage: "H1", prenom: "Pliors", PV_Max: 42, PV_Actuels: 42, Fatigue_Max: 100, fatigueActuelle: 80, Etats_Alteres: [] },
    { idPersonnage: "H2", prenom: "Jade",   PV_Max: 42, PV_Actuels: 30, Fatigue_Max: 100, fatigueActuelle: 60, Etats_Alteres: [] },
    { idPersonnage: "M1", prenom: "Goule",  estMonstre: true, PV_Max: 70, PV_Actuels: 70, Fatigue_Max: 120, fatigueActuelle: 90, Etats_Alteres: [] }
  ];
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0], window.PERSOS_PARTIE[1]];
  window.COMBAT_INDEX_PERSO = 0;
  window.COMPETENCES_CACHE = { CARTE_H: carteHeros };
  window.CACHE_COMPETENCES_GLOBAL = { M1: { CARTE_M: carteMonstre } };

  eval(sEtatInitial); eval(sToggle); eval(sBouton); eval(sBandeau);

  const panneau = document.getElementById('panneau-combat-gauche');
  const bandeau = document.getElementById('bandeau-action-combat');
  const bouton  = document.getElementById('bandeau-action-lancer');
  const titre   = document.getElementById('bandeau-action-titre');
  const effets  = document.getElementById('bandeau-action-effets');
  const etat = () => ({
    panneauOuvert: window.PANNEAU_GAUCHE_OUVERT,
    bandeauVisible: bandeau.style.opacity === "1",
    boutonVisible: bouton.style.display !== "none",
    titre: titre.textContent,
    titreAffiche: titre.innerText,
    effets: effets.textContent,
    tailleTitre: parseFloat(getComputedStyle(titre).fontSize),
    tailleEffets: parseFloat(getComputedStyle(effets).fontSize),
    lignesEffets: Math.round(effets.scrollHeight / (parseFloat(getComputedStyle(effets).fontSize) * 1.25)),
    debordeEffets: effets.scrollWidth > effets.clientWidth + 1
  });

  const jouer = (queue, phase) => {
    window.PARTIE_DATA = { File_Attente_Combat: queue, Phase_Combat: phase };
    window.afficherPisteInitiative(queue, phase);
  };

  const fileHeros   = [{ idPersonnage: "H1", idCarte: "CARTE_H", initiative: 70 },
                       { idPersonnage: "M1", idCarte: "CARTE_M", initiative: 55 }];
  const fileMonstre = [{ idPersonnage: "M1", idCarte: "CARTE_M", initiative: 55 }];

  // 1. Préparation : la piste est vide, le panneau reste ouvert pour choisir.
  jouer([], "Preparation");
  const preparation = etat();

  // 2. La piste se met en place : le panneau ne se referme plus tout seul (Nico).
  //    Comme il reste ouvert, le bandeau, lui, reste masqué — règle inchangée.
  jouer(fileHeros, "Resolution");
  const tourHerosPanneauOuvert = etat();

  // 3. Le joueur referme lui-même le panneau : le bandeau annonce alors la carte.
  window.togglePanneauGauche();
  const tourHeros = etat();
  // Un redessin de la piste ne le rouvre pas dans le dos du joueur qui vient
  // de le fermer à la main.
  jouer(fileHeros, "Resolution");
  const apresRedessinFerme = etat();

  // 4. Le panneau rouvert à la main masque de nouveau le bandeau...
  window.togglePanneauGauche();
  const panneauRouvert = etat();
  // ... et un redessin de la piste ne le referme pas dans le dos du joueur.
  jouer(fileHeros, "Resolution");
  const apresRedessin = etat();
  window.togglePanneauGauche();

  // 4. Le clic sur le bouton doré ouvre le ciblage de la bonne carte, une fois.
  //    Le vrai gestionnaire "clic dans le vide" est en place : il ne doit pas
  //    annuler le ciblage dans la foulée du clic qui vient de l'ouvrir.
  window.NETTOYAGES = 0;
  window.nettoyerCiblage = () => { window.NETTOYAGES++; };
  window.masquerApercuCarteHD = () => { window.MASQUAGES = (window.MASQUAGES || 0) + 1; };
  window.mettreAJourJaugeFatigue = () => {};
  window.actualiserBannieresEpuisees = () => {};
  window.CARTE_EN_APERCU = "CARTE_H";
  document.getElementById('btn-fermer-combat').style.display = 'block';
  eval(sClicVide);
  bouton.click(); bouton.click();
  const apresClic = { ciblages: [...window.CIBLAGES], boutonVisible: bouton.style.display !== "none",
                      nettoyages: window.NETTOYAGES, apercuMasque: !!window.MASQUAGES };

  // Un clic ailleurs, lui, doit bien tout refermer : le garde-fou ne doit pas
  // avoir désactivé le nettoyage pour le reste de l'écran.
  document.getElementById('plateau-canvas').click();
  const clicAilleurs = { nettoyages: window.NETTOYAGES };
  window.ETAT_CIBLAGE = { actif: true };
  window.actualiserBandeauAction();
  const pendantCiblage = etat();
  // Le joueur renonce à sa visée. Le verrou anti-double-appui ne tient qu'une
  // seconde : passé ce délai, la carte redevient lançable.
  window.ETAT_CIBLAGE = { actif: false };
  await new Promise(r => setTimeout(r, 1100));
  window.actualiserBandeauAction();
  const ciblageAnnule = etat();

  // 5. Au tour de la créature : le bandeau l'annonce, sans bouton (l'IA joue).
  jouer(fileMonstre, "Resolution");
  const tourMonstre = etat();

  // 6. Le héros affiché n'est pas celui qui joue : pas de bouton non plus.
  jouer([{ idPersonnage: "H2", idCarte: "CARTE_H", initiative: 70 }], "Resolution");
  const autreHeros = etat();

  // 7. Un repos long : annoncé, mais rien à lancer.
  jouer([{ idPersonnage: "H1", idCarte: "REPOS_LONG", initiative: 0 }], "Resolution");
  const reposLong = etat();

  // 8. La file se vide : le panneau revient pour la sélection de cartes.
  jouer([], "Preparation");
  const fileVidee = etat();

  // 9. Une ligne d'effets à rallonge doit rétrécir, pas passer à la ligne. Le
  //    panneau vient de se rouvrir tout seul à l'étape 8 : on le referme à la
  //    main, sinon le bandeau reste masqué et son contenu jamais recalculé.
  window.togglePanneauGauche();
  window.COMPETENCES_CACHE.CARTE_LONGUE = { Nom: "Litanie interminable des sept douleurs anciennes",
    Effets_Compiles: [ { nom: "Attaque lourde", isMod: false }, { nom: "Saignement", isMod: true },
      { nom: "Poussée", isMod: true }, { nom: "Brûlure", isMod: true }, { nom: "Étourdissement", isMod: true },
      { nom: "Vulnérabilité", isMod: true }, { nom: "Zone", isMod: true }, { nom: "Persistance", isMod: true } ] };
  jouer([{ idPersonnage: "H1", idCarte: "CARTE_LONGUE", initiative: 70 }], "Resolution");
  const carteLongue = etat();

  // 10. Hors combat, le bandeau ne s'affiche jamais.
  jouer(fileHeros, "Resolution");
  document.getElementById('fenetre-combat').style.display = 'none';
  window.actualiserBandeauAction();
  const horsCombat = etat();
  document.getElementById('fenetre-combat').style.display = 'block';

  // Le bandeau passe-t-il bien SOUS le panneau ? (z-index, sans JS)
  const zBandeau = parseInt(getComputedStyle(bandeau).zIndex);
  const zPanneau = parseInt(getComputedStyle(panneau).zIndex);
  const r = bandeau.getBoundingClientRect();
  const enBasAGauche = r.left < window.innerWidth / 3 && r.bottom > window.innerHeight * 0.75;

  // Le titre reprend bien l'or brossé du nom de personnage du panneau.
  const sTitre = getComputedStyle(titre);
  const sNom = getComputedStyle(document.getElementById('combat-nom-perso'));
  const memeOr = sTitre.backgroundImage === sNom.backgroundImage
              && sTitre.fontFamily === sNom.fontFamily
              && sTitre.webkitTextFillColor === sNom.webkitTextFillColor;

  // Le bouton clignote-t-il vraiment ? (animation CSS sur sa couche de halo)
  const anim = getComputedStyle(bouton, '::before').animationName;

  return { preparation, tourHerosPanneauOuvert, tourHeros, apresRedessinFerme, panneauRouvert, apresRedessin,
           apresClic, clicAilleurs, pendantCiblage,
           ciblageAnnule, tourMonstre, autreHeros, reposLong, fileVidee, carteLongue, horsCombat,
           zBandeau, zPanneau, enBasAGauche, memeOr, anim };
}, { sBandeau: srcBandeau, sToggle: srcToggle, sBouton: srcBouton, sEtatInitial: srcEtatInitial, sClicVide: srcClicVide });

console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");
console.log(`     tour du héros   : « ${res.tourHeros.titre} » — ${res.tourHeros.effets}`);
console.log(`     tour de la goule: « ${res.tourMonstre.titre} » — ${res.tourMonstre.effets}`);
console.log(`     carte à rallonge: ${res.carteLongue.tailleEffets}px, ${res.carteLongue.lignesEffets} ligne(s)`);

verifier("en préparation, le panneau reste ouvert pour choisir", res.preparation.panneauOuvert);
verifier("la piste apparaît : le panneau ne se referme plus tout seul", res.tourHerosPanneauOuvert.panneauOuvert);
verifier("tant qu'il reste ouvert, le bandeau reste masqué", !res.tourHerosPanneauOuvert.bandeauVisible);
verifier("le joueur ferme le panneau : le bandeau annonce alors la carte jouée",
         res.tourHeros.bandeauVisible && res.tourHeros.titre === "Lame du crépuscule",
         `(${res.tourHeros.titre})`);
verifier("ses effets tiennent sur une seule ligne", res.tourHeros.lignesEffets === 1 && !res.tourHeros.debordeEffets,
         `(${res.tourHeros.lignesEffets} ligne)`);
verifier("l'initiative n'est pas listée comme un effet", !/Initiative/.test(res.tourHeros.effets));
verifier("les modificateurs sont bien là", /Distance/.test(res.tourHeros.effets) && /Saignement/.test(res.tourHeros.effets));
verifier("le bouton doré s'affiche pour le héros du poste", res.tourHeros.boutonVisible);
verifier("il clignote (animation sur sa couche de halo)", res.anim === "clignotementLancer", `(${res.anim})`);
verifier("un redessin ne rouvre pas le panneau fermé à la main", !res.apresRedessinFerme.panneauOuvert);
verifier("le panneau rouvert masque le bandeau", res.panneauRouvert.bandeauVisible === false);
verifier("un redessin ne referme pas le panneau ouvert à la main", res.apresRedessin.panneauOuvert);
verifier("le clic lance la bonne carte, une seule fois",
         res.apresClic.ciblages.length === 1 && res.apresClic.ciblages[0] === "CARTE_H",
         `(${JSON.stringify(res.apresClic.ciblages)})`);
verifier("le clic sur le bouton n'annule pas son propre ciblage",
         res.apresClic.nettoyages === 0 && !res.apresClic.apercuMasque,
         `(${res.apresClic.nettoyages} nettoyage(s))`);
verifier("un clic ailleurs referme toujours la carte en aperçu", res.clicAilleurs.nettoyages === 1,
         `(${res.clicAilleurs.nettoyages})`);
verifier("pendant le ciblage, plus de bouton", !res.pendantCiblage.boutonVisible);
verifier("ciblage annulé, le bouton revient", res.ciblageAnnule.boutonVisible);
verifier("le tour d'une créature s'affiche aussi", res.tourMonstre.bandeauVisible && res.tourMonstre.titre === "Hurlement putride",
         `(${res.tourMonstre.titre})`);
verifier("mais sans bouton : l'IA joue seule", !res.tourMonstre.boutonVisible);
verifier("pas de bouton pour un héros non affiché", res.autreHeros.bandeauVisible && !res.autreHeros.boutonVisible);
verifier("un repos long est annoncé, sans rien à lancer",
         res.reposLong.titre === "Repos Long" && !res.reposLong.boutonVisible, `(${res.reposLong.titre})`);
verifier("file vidée : le panneau se rouvre tout seul", res.fileVidee.panneauOuvert);
verifier("et le bandeau s'efface", !res.fileVidee.bandeauVisible);
verifier("une carte à rallonge rétrécit au lieu de déborder",
         res.carteLongue.lignesEffets === 1 && !res.carteLongue.debordeEffets && res.carteLongue.tailleEffets < 16,
         `(${res.carteLongue.tailleEffets}px)`);
verifier("hors combat, rien ne s'affiche", !res.horsCombat.bandeauVisible);
verifier("le bandeau passe sous le panneau (z-index)", res.zBandeau < res.zPanneau, `(${res.zBandeau} < ${res.zPanneau})`);
verifier("il est bien en bas à gauche de l'écran", res.enBasAGauche);
verifier("le titre reprend l'or brossé des noms de personnage", res.memeOr);

// Contrôle visuel : le bandeau tel qu'il apparaît, panneau replié.
await p.evaluate(() => {
  document.getElementById('fenetre-combat').style.backgroundColor = "#211d18";
  window.PARTIE_DATA = { File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "CARTE_H", initiative: 70 }],
                         Phase_Combat: "Resolution" };
  window.afficherPisteInitiative(window.PARTIE_DATA.File_Attente_Combat, "Resolution");
});
await p.waitForTimeout(600);
await p.screenshot({ path: '/tmp/bandeau_action.png',
  clip: { x: 0, y: 1024 - 190, width: 620, height: 190 } });

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
