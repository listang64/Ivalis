// LA FENÊTRE SOMBRE DE TOUR, TELLE QU'ELLE S'AFFICHE VRAIMENT.
//
// Le protocole des deux barrières est vérifié à part (sequence_tour.mjs). Ici
// c'est l'écran qu'on regarde, dans la VRAIE page : la fenêtre s'obscurcit à
// droite du panneau latéral, annonce le nom du combattant dans l'or brossé du
// panneau, ses états sous son nom, sa technique en grand, ses effets en
// dessous, sa zone à côté — et fait clignoter le gros OK doré tant que le
// joueur n'a pas touché l'écran pour ouvrir le tour.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';

const src = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
const srcSequence = fs.readFileSync('/home/user/Ivalis/sequence_tour.js', 'utf-8');
const lignes = src.split('\n');

function bloc(debutMarqueur, finMarqueur) {
  const d = lignes.findIndex(l => l.startsWith(debutMarqueur));
  let dFin = lignes.findIndex((l, i) => i > d && l.startsWith(finMarqueur));
  if (dFin === -1) dFin = d;
  let f = dFin; for (let i = dFin + 1; i < lignes.length; i++) { if (lignes[i] === '};') { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}
function fonction(marqueur) { return bloc(marqueur, marqueur); }

// Tout le chapitre de la fenêtre d'un seul tenant : la lecture des cartes,
// la ligne d'effets, la mise à la bonne taille et le peintre lui-même. En un
// seul eval, sinon la fonction interne ajusterSurUneLigne resterait hors de
// portée du peintre (chaque eval a sa propre portée en module strict).
const srcVoile  = bloc('window.donneesCarteCombattant = function', 'window.rafraichirVoileTour = function');
const srcToggle = fonction('window.togglePanneauGauche = function');
const srcEtatInitial = lignes.find(l => l.startsWith('window.PANNEAU_GAUCHE_OUVERT ='));

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2 });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(300);
await p.evaluate(s => eval(s), SRC_STATS_COMMUNES);

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(60)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const res = await p.evaluate(async ({ sVoile, sToggle, sEtatInitial, sSequence }) => {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById('fenetre-combat').style.display = 'block';

  localStorage.setItem("ID_JOUEUR_COURANT", "poste-pc");
  window.jouerSonClic = () => {};
  window.estCombattantMort = (id) => !!(window.MORTS || []).includes(id);
  window.filerAnimation = async (n, f) => { window.ANIMS = (window.ANIMS || []).concat(n); if (f) await f(); };
  window.finDeTourCombat = async () => { window.AVANCES = (window.AVANCES || 0) + 1; };
  window.ID_PARTIE_COURANTE = "P1";
  // Le journal d'événements, en miniature.
  window.JOURNAL = {};
  window.publierEvenementCombat = async (idPartie, ev) => {
    const n = Object.keys(window.JOURNAL).length + 1;
    window.JOURNAL[n] = { ...JSON.parse(JSON.stringify(ev)), n };
    if (window.RAPPEL_JOURNAL) await window.RAPPEL_JOURNAL([window.JOURNAL[n]]);
    return n;
  };
  window.lireEvenementCombat = async (p, n) => window.JOURNAL[n] || null;
  window.dernierNumeroEvenement = () => 0;
  window.ecouterEvenementsCombat = (p, apres, rappel) => { window.RAPPEL_JOURNAL = rappel; return () => {}; };

  const icone = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Ccircle cx='32' cy='32' r='30' fill='%23c2a878'/%3E%3C/svg%3E";
  window.PERSOS_PARTIE = [
    { idPersonnage: "H1", prenom: "Pliors", nom: "de Vaubourg", idJoueur: "poste-pc", couleur: "#4aa3df", Etats_Alteres: [] },
    { idPersonnage: "H2", prenom: "Jade", nom: "", idJoueur: "poste-ipad", couleur: "#7bd66a", Etats_Alteres: [] },
    { idPersonnage: "M1", prenom: "Goule", nom: "putride", estMonstre: true, Etats_Alteres: [
        { nom: "Saignement", duree: 2, icone, desc: "3 dégâts par tour" },
        { nom: "Brûlure", duree: 1, icone, desc: "5 dégâts par tour" } ] }
  ];
  window.estMonstre = (id) => String(id).startsWith("M");
  // Les descriptions sont celles que la Forge écrit : chiffres et pourcentages
  // compris. C'est tout l'intérêt — la fenêtre doit les montrer.
  window.COMPETENCES_CACHE = { CARTE_H: { Nom: "Lame du crépuscule", Effets_Compiles: [
      { nom: "Attaque légère", desc: "12 dégâts", isMod: false },
      { nom: "Distance +", desc: "+3 case(s) de portée", isMod: true },
      { nom: "Initiative +", desc: "+5", isMod: true },
      { nom: "Saignement", desc: "60% — 3 dégâts par tour", isMod: true } ] } };
  window.CACHE_COMPETENCES_GLOBAL = { M1: { CARTE_M: { Nom: "Hurlement putride",
      Composants: { actions: [{ zoneHexes: [{ q: 0, r: -1 }, { q: 1, r: -1 }, { q: 0, r: 0 }] }] },
      Effets_Compiles: [
      { nom: "Mot de pouvoir", desc: "9 dégâts", isMod: false },
      { nom: "Peur", desc: "45% — fuite de 2 cases", isMod: true },
      { nom: "Zone", desc: "3 hexagone(s)", isMod: true, isZone: true } ] } } };

  eval(sEtatInitial); eval(sToggle); eval(sVoile);
  eval(sSequence);

  const voile  = document.getElementById('voile-tour-combat');
  const nom    = document.getElementById('voile-tour-nom');
  const etats  = document.getElementById('voile-tour-etats');
  const carte  = document.getElementById('voile-tour-carte');
  const effets = document.getElementById('voile-tour-effets');
  const ok     = document.getElementById('voile-tour-ok');
  const attente = document.getElementById('voile-tour-attente');
  const zone   = document.getElementById('voile-tour-zone');

  const etat = () => ({
    visible: voile.style.display === "block" && voile.style.opacity === "1",
    gauche: voile.getBoundingClientRect().left,
    largeur: voile.getBoundingClientRect().width,
    nom: nom.textContent,
    tailleNom: parseFloat(getComputedStyle(nom).fontSize),
    nbEtats: etats.querySelectorAll('img').length,
    carte: carte.textContent,
    tailleCarte: parseFloat(getComputedStyle(carte).fontSize),
    effets: effets.textContent,
    okVisible: ok.style.display !== "none",
    attente: attente.textContent,
    clicPasse: voile.style.pointerEvents === "auto",
    fondCarte: carte.style.background || "",
    effetsHtml: effets.innerHTML,
    hexZone: zone.querySelectorAll('polygon').length,
    opaque: getComputedStyle(voile).backgroundImage
  });

  const poser = (queue, phase) => {
    window.PARTIE_DATA = { Tour_Combat: 1, File_Attente_Combat: queue, Phase_Combat: phase };
    window.rafraichirVoileTour();
  };
  const ecrireTour = async () => { window.rafraichirVoileTour(); };

  const fileMonstre = [{ idPersonnage: "M1", idCarte: "CARTE_M", initiative: 55, timestamp: 10 }];
  const fileHeros   = [{ idPersonnage: "H1", idCarte: "CARTE_H", initiative: 70, timestamp: 20 }];
  const fileAutre   = [{ idPersonnage: "H2", idCarte: "CARTE_H", initiative: 70, timestamp: 30 }];

  // 1. En préparation, rien.
  poser([], "Preparation");
  await new Promise(r => setTimeout(r, 500));
  const preparation = etat();

  // 2. Au tour d'une créature, DÈS LE DÉBUT : la fenêtre se pose, sans attendre
  //    quoi que ce soit. Le tour d'un autre ne nous appartient pas — on ne doit
  //    ni le voir se préparer, ni voir des points de vie bouger avant
  //    l'animation.
  poser(fileMonstre, "Resolution");
  await new Promise(r => setTimeout(r, 600));
  const rienAAnnoncer = etat();

  // 3. Un événement arrive : le tour est retenu, la fenêtre s'ouvre.
  window.jouerAnimationMoteur = () => {};
  window.DELAI_ENTRE_ETAPES_MS = 1;
  window.EVENEMENTS_RECUS[1] = { n: 1, type: "carte", acteur: "M1", idCarte: "CARTE_M",
                                 tour: 1, data: { idLanceur: "M1" }, avant: {} };
  await window.lireJournalCombat();
  await new Promise(r => setTimeout(r, 200));
  const avecOk = etat();

  // 4. Le panneau replié : la fenêtre couvre tout l'écran.
  window.togglePanneauGauche();
  window.rafraichirVoileTour();
  await new Promise(r => setTimeout(r, 600));   // la fenêtre glisse jusqu'au bord
  const panneauReplie = etat();
  window.togglePanneauGauche();
  window.rafraichirVoileTour();
  await new Promise(r => setTimeout(r, 600));

  // 5. Le tour est RETENU, le temps que le joueur lise la technique. Le gros OK
  //    doré clignote, et le clic passe.
  const enPose = { ...etat(), retenu: !!window.EVENEMENT_ATTENDU, anims: [...(window.ANIMS || [])] };

  // 6. Le joueur touche l'écran : la fenêtre se lève et l'animation se joue.
  const lecture = window.jouerSequenceTour();
  const pendantLecture = etat();
  await lecture;
  await new Promise(r => setTimeout(r, 600));   // le temps du fondu de sortie
  window.rafraichirVoileTour();
  const apresClic = { ...etat(), anims: [...(window.ANIMS || [])], pendantLecture };

  // 7. Au tour d'un HÉROS DU POSTE : aucune fenêtre, le plateau reste dégagé.
  poser(fileHeros, "Resolution");
  await new Promise(r => setTimeout(r, 500));
  const monTour = etat();
  // La couleur d'un héros : on la lit en forçant la peinture depuis un poste
  // spectateur, la fenêtre ne s'affichant pas chez le joueur qui agit.
  localStorage.setItem("ID_JOUEUR_COURANT", "poste-ipad");
  poser([{ idPersonnage: "H1", idCarte: "CARTE_H", initiative: 70, timestamp: 21 }], "Resolution");
  await ecrireTour();
  const monTourCouleur = document.getElementById('voile-tour-carte').style.background || "";
  localStorage.setItem("ID_JOUEUR_COURANT", "poste-pc");

  // 8. Au tour du héros d'un AUTRE poste : la fenêtre revient.
  poser(fileAutre, "Resolution");
  await new Promise(r => setTimeout(r, 200));
  const tourDeLautre = etat();

  // 8 bis. LE TOUR D'UN AUTRE JOUEUR OUVRE LA FENÊTRE, comme celui d'une
  //        créature : on doit voir qui joue et avec quoi, avant que ça se
  //        déroule. Rien ne distingue un héros d'un monstre de ce point de vue,
  //        sauf que ce n'est pas le nôtre.
  window.DERNIER_EVENEMENT_JOUE = 10;
  window.EVENEMENTS_RECUS = {};
  window.EVENEMENT_ATTENDU = null;
  window.ANIMS = [];
  poser(fileAutre, "Resolution");
  window.EVENEMENTS_RECUS[11] = { n: 11, type: "pas", acteur: "H2", idCarte: "CARTE_H",
                                  tour: 3, avant: {}, data: { idToken: "H2" } };
  window.jouerAnimationPas = async () => {};
  await window.lireJournalCombat();
  await new Promise(r => setTimeout(r, 200));
  const tourDunAutreJoueur = { ...etat(), retenu: !!window.EVENEMENT_ATTENDU };
  if (window.EVENEMENT_ATTENDU) await window.jouerSequenceTour();
  await new Promise(r => setTimeout(r, 300));

  // 9. Un combattant à terre n'a droit à aucune fenêtre.
  window.MORTS = ["H2"];
  poser(fileAutre, "Resolution");
  await new Promise(r => setTimeout(r, 500));
  const mort = etat();
  window.MORTS = [];

  // 10. Hors combat, jamais rien.
  poser(fileMonstre, "Resolution");
  document.getElementById('fenetre-combat').style.display = 'none';
  window.rafraichirVoileTour();
  await new Promise(r => setTimeout(r, 500));
  const horsCombat = etat();
  document.getElementById('fenetre-combat').style.display = 'block';

  // Le nom reprend-il l'or brossé du panneau ? Et le OK clignote-t-il ?
  const sNom = getComputedStyle(nom);
  const sPanneau = getComputedStyle(document.getElementById('combat-nom-perso'));
  const memeOr = sNom.backgroundImage === sPanneau.backgroundImage
              && sNom.fontFamily === sPanneau.fontFamily
              && sNom.webkitTextFillColor === sPanneau.webkitTextFillColor;
  const anim = getComputedStyle(ok, '::before').animationName;
  const zVoile = parseInt(getComputedStyle(voile).zIndex);
  const zPanneau = parseInt(getComputedStyle(document.getElementById('panneau-combat-gauche')).zIndex);
  const largeurPanneau = document.getElementById('panneau-combat-gauche').getBoundingClientRect().width;

  return { preparation, rienAAnnoncer, avecOk, panneauReplie, enPose, apresClic, monTourCouleur,
           tourDunAutreJoueur,
           monTour, tourDeLautre, mort, horsCombat, memeOr, anim, zVoile, zPanneau, largeurPanneau,
           largeurEcran: window.innerWidth };
}, { sVoile: srcVoile, sToggle: srcToggle, sEtatInitial: srcEtatInitial, sSequence: srcSequence });

console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");
console.log(`     tour de la goule : « ${res.avecOk.nom} » — « ${res.avecOk.carte} » — ${res.avecOk.effets}`);

verifier("en préparation, aucune fenêtre", !res.preparation.visible);
verifier("au tour d'une créature, la fenêtre se pose DÈS LE DÉBUT du tour",
         res.rienAAnnoncer.visible, `(${res.rienAAnnoncer.attente})`);
verifier("elle annonce que le tour se prépare, sans OK",
         !res.rienAAnnoncer.okVisible && /se prépare/.test(res.rienAAnnoncer.attente),
         `(${res.rienAAnnoncer.attente})`);
verifier("le tour à annoncer allume ensuite le OK", res.avecOk.visible && res.avecOk.okVisible);
verifier("la fenêtre est OPAQUE : rien ne transparaît du tour à venir",
         !/rgba\([^)]*0\.\d/.test(res.avecOk.opaque), `(${res.avecOk.opaque.slice(0, 70)}…)`);
verifier("elle s'arrête au bord du panneau latéral",
         Math.abs(res.avecOk.gauche - res.largeurPanneau) < 2,
         `(${res.avecOk.gauche}px vs ${res.largeurPanneau}px)`);
verifier("elle couvre tout le reste de l'écran",
         Math.abs(res.avecOk.gauche + res.avecOk.largeur - res.largeurEcran) < 2);
verifier("le nom du combattant est affiché", res.avecOk.nom === "Goule putride", `(${res.avecOk.nom})`);
verifier("dans l'or brossé du panneau latéral", res.memeOr);
verifier("ses états sont sous son nom", res.avecOk.nbEtats === 2, `(${res.avecOk.nbEtats})`);
verifier("la technique est annoncée en grand", res.avecOk.carte === "Hurlement putride" && res.avecOk.tailleCarte >= 24,
         `(${res.avecOk.carte}, ${res.avecOk.tailleCarte}px)`);
verifier("elle est plus grosse que le détail des effets", res.avecOk.tailleCarte > 20);
verifier("ses effets sont listés dessous", /Mot de pouvoir/.test(res.avecOk.effets) && /Peur/.test(res.avecOk.effets),
         `(${res.avecOk.effets.replace(/\s+/g, ' ').trim()})`);
verifier("l'initiative n'y figure pas", !/Initiative/.test(res.avecOk.effets));
verifier("tant qu'aucun événement n'est arrivé, la fenêtre est là mais sans OK",
         res.rienAAnnoncer.visible && !res.rienAAnnoncer.okVisible);
verifier("panneau replié, la fenêtre prend tout l'écran", res.panneauReplie.gauche < 2,
         `(${res.panneauReplie.gauche}px)`);
verifier("le nom de la technique porte la couleur du combattant",
         /230, 57, 70|#e63946/.test(res.avecOk.fondCarte), `(${res.avecOk.fondCarte.slice(0, 80)}…)`);
verifier("et garde l'effet brossé (un dégradé, pas un aplat)",
         /linear-gradient/.test(res.avecOk.fondCarte));
verifier("les effets sont détaillés : dégâts et pourcentages",
         /9 dégâts/.test(res.avecOk.effetsHtml) && /45%/.test(res.avecOk.effetsHtml),
         `(${res.avecOk.effetsHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)}…)`);
verifier("la zone de la technique est dessinée à côté", res.avecOk.hexZone === 3,
         `(${res.avecOk.hexZone} hexagone(s))`);
verifier("la technique d'un héros prend SA couleur, pas le rouge",
         /74, 163, 223|#4aa3df/.test(res.monTourCouleur || ""), `(${(res.monTourCouleur || "").slice(0, 60)}…)`);
verifier("l'arrivée d'un événement RETIENT le tour au lieu de le jouer",
         res.enPose.retenu && res.enPose.anims.length === 0, `(${res.enPose.anims.join(">")})`);
verifier("le gros OK doré s'allume et le clic passe partout sur la fenêtre",
         res.enPose.visible && res.enPose.okVisible && res.enPose.clicPasse);
verifier("et le joueur a sous les yeux la technique qui va se dérouler",
         res.enPose.carte === "Hurlement putride" && /9 dégâts/.test(res.enPose.effets),
         `(${res.enPose.carte})`);
verifier("le OK clignote", /clignotement/i.test(res.anim || ""), `(${res.anim})`);
verifier("une fois touché, l'animation du tour se joue", res.apresClic.anims.join(">") === "carte",
         `(${res.apresClic.anims.join(">")})`);
verifier("pendant la relecture, la fenêtre se lève pour laisser voir le plateau",
         res.apresClic.pendantLecture && res.apresClic.pendantLecture.masquee !== false
         || !res.apresClic.visible);
verifier("au tour de MON héros, aucune fenêtre : le plateau reste dégagé", !res.monTour.visible);
verifier("au tour du héros d'un AUTRE JOUEUR aussi, la fenêtre se pose dès le début",
         res.tourDeLautre.visible, `(${res.tourDeLautre.attente})`);
verifier("mais dès qu'il agit, la fenêtre sombre s'ouvre chez les autres",
         res.tourDunAutreJoueur.retenu && res.tourDunAutreJoueur.visible
         && res.tourDunAutreJoueur.okVisible,
         `(retenu ${res.tourDunAutreJoueur.retenu}, visible ${res.tourDunAutreJoueur.visible},`
         + ` OK ${res.tourDunAutreJoueur.okVisible})`);
verifier("et elle annonce bien SON nom", /Jade/.test(res.tourDunAutreJoueur.nom),
         `(${res.tourDunAutreJoueur.nom})`);
verifier("aucune fenêtre pour un combattant à terre", !res.mort.visible);
verifier("hors combat, jamais rien", !res.horsCombat.visible);
verifier("la fenêtre passe au-dessus du plateau mais laisse le panneau",
         res.zVoile > 5 && res.zVoile >= res.zPanneau, `(${res.zVoile} / ${res.zPanneau})`);

// =========================================================================
// LA SORTIE DE SECOURS DOIT ÊTRE ATTEIGNABLE
// =========================================================================
//  Un iPad est resté bloqué derrière la fenêtre sombre, sur la technique du tour
//  d'AVANT. La seule sortie était la croix rouge — placée en haut à DROITE du
//  voile, c'est-à-dire exactement sous le bouton du menu (position fixe en haut à
//  droite, z-index 9000 contre 12 pour le voile), qui la recouvrait entièrement.
//  Sur l'appareil sans console, c'était un blocage sans issue.
//
//  On ne vérifie pas des coordonnées : on demande au navigateur QUI reçoit
//  vraiment le clic au centre de la croix. C'est la seule question qui compte.
{
  const r = await p.evaluate(() => {
    const fen = document.getElementById("fenetre-combat");
    fen.style.display = "block";
    const menu = document.getElementById("btn-fermer-combat");
    if (menu) menu.style.display = "block";

    const voile = document.getElementById("voile-tour-combat");
    voile.style.display = "block";
    voile.style.opacity = "1";
    voile.style.pointerEvents = "auto";

    const croix = document.getElementById("voile-tour-fermer");
    const bc = croix.getBoundingClientRect();
    const recoit = document.elementFromPoint(bc.left + bc.width / 2, bc.top + bc.height / 2);

    const bm = menu ? menu.getBoundingClientRect() : null;
    const seChevauchent = bm && !(bc.right < bm.left || bc.left > bm.right
                              || bc.bottom < bm.top || bc.top > bm.bottom);

    return {
      croixVisible: bc.width > 0 && bc.height > 0,
      taille: Math.round(Math.min(bc.width, bc.height)),
      recoitLeClic: !!recoit && (recoit.id === "voile-tour-fermer"
                                 || recoit.closest("#voile-tour-fermer") !== null),
      quiRecoit: recoit ? (recoit.id || recoit.tagName) : "personne",
      seChevauchent: !!seChevauchent
    };
  });
  verifier("la croix rouge est bien dessinée", r.croixVisible, `(${r.taille}px)`);
  verifier("elle n'est pas sous le bouton du menu", !r.seChevauchent);
  verifier("ET C'EST ELLE QUI REÇOIT LE CLIC", r.recoitLeClic, `(${r.quiRecoit})`);
  verifier("assez grande pour un doigt sur iPad", r.taille >= 34, `(${r.taille}px)`);
}

// =========================================================================
// UN CLIC QUI N'OUVRE RIEN LÈVE LE VOILE
// =========================================================================
//  L'autre moitié du blocage : taper l'écran ne faisait RIEN quand la fenêtre
//  n'avait aucun tour à ouvrir. Le joueur tapait, retapait, et restait enfermé.
{
  const r = await p.evaluate(() => {
    // Un régime allumé dont le spectateur n'attend rien : `ok()` rend false.
    window.REGIME_CERVEAU = true;
    window.regimeDemande = { actif: () => true, ok: () => false };
    const voile = document.getElementById("voile-tour-combat");
    voile.style.display = "block";
    voile.style.opacity = "1";
    window.jouerSequenceTour();
    return { opacite: voile.style.opacity, ecarte: window.VOILE_TOUR_MASQUE_DEBUG === true };
  });
  verifier("taper l'écran lève la fenêtre quand il n'y a rien à ouvrir",
           r.opacite === "0", `(opacité ${r.opacite})`);
  verifier("et le jeu sait qu'elle a été écartée à la main", r.ecarte);
}
await p.evaluate(() => { window.REGIME_CERVEAU = false; delete window.regimeDemande;
                         window.VOILE_TOUR_MASQUE_DEBUG = false; });

// Contrôle visuel : la fenêtre telle que Nico la verra, OK doré compris.
await p.evaluate(async () => {
  // Le bandeau rouge « modules non chargés » appartient au banc (le réseau y est
  // coupé), pas au jeu : il n'a rien à faire sur la capture.
  document.getElementById('bandeau-erreurs-js')?.remove();
  document.getElementById('fenetre-combat').style.backgroundColor = "#211d18";
  window.PARTIE_DATA = { Tour_Combat: 2, Phase_Combat: "Resolution",
    File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "CARTE_M", initiative: 55, timestamp: 99 }] };
  // Un tour retenu : c'est l'écran que Nico verra au début de chaque tour.
  window.EVENEMENT_ATTENDU = { n: 9, type: "carte", acteur: "M1", idCarte: "CARTE_M", tour: 2, data: {} };
  window.rafraichirVoileTour();
});
await p.waitForTimeout(700);
await p.screenshot({ path: '/tmp/fenetre_tour.png' });

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
