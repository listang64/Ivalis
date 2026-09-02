// La piste d'initiative est revenue à sa place d'origine — dans le HUD bas
// droite, derrière le bouton de fin de tour — et ses bulles ont été réduites de
// moitié pour qu'elle tienne entièrement à droite du panneau gauche, sans plus
// disparaître dessous. Ce banc ouvre la vraie page, joue le VRAI rendu de la
// piste avec sept combattants, et mesure.
import fs from 'fs';

const src = fs.readFileSync('/home/user/Ivalis/combat.js','utf-8');
const lignes = src.split('\n');
const debut = lignes.findIndex(l => l.startsWith('window.afficherPisteInitiative = function'));
let fin = debut; for (let i = debut + 1; i < lignes.length; i++) { if (lignes[i] === '};') { fin = i; break; } }
const fnPiste = lignes.slice(debut, fin + 1).join('\n');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
// Taille de l'iPad de Nico, déduite de sa capture : le panneau gauche (380px)
// y occupe 27 % de la largeur.
const p = await b.newPage({ viewport: { width: 1366, height: 1024 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
p.on('pageerror', () => {});
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(300);

const res = await p.evaluate((fnPisteSrc) => {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  const fenetre = document.getElementById('fenetre-combat');
  const chaine = new Set();
  for (let e = fenetre; e && e !== document.body; e = e.parentElement) chaine.add(e);
  [...document.body.children].forEach(e => { if (!chaine.has(e)) e.style.display = 'none'; });
  chaine.forEach(e => { if (getComputedStyle(e).display === 'none') e.style.display = 'block'; });
  fenetre.style.display = 'block';
  // Le bouton de fin de tour donne sa hauteur au HUD ; son image ne se charge
  // pas ici, on lui rend sa taille réelle.
  document.getElementById('img-hud-fintour').style.height = '150px';

  // Sept combattants dans la file : le pire cas d'un combat à trois joueurs.
  const noms = ["Pliors","Jade","Mémé","Invocateur d'os","Frêle flèche","Oracle maudit","Chaman putride"];
  window.PERSOS_PARTIE = noms.map((n, i) => ({ idPersonnage:"C"+i, prenom:n, PV_Max:50, PV_Actuels:40,
    Fatigue_Max:100, fatigueActuelle:70, Etats_Alteres: i === 1 ? [{ nom:"Brûlé", icone:"" }] : [] }));
  window.PARTIE_DATA = { Phase_Combat:"Resolution",
    File_Attente_Combat: noms.map((n,i) => ({ idPersonnage:"C"+i, idCarte:"X", initiative: 80 - i*10 })) };
  window.actualiserBoutonFinTour = function(){};
  eval(fnPisteSrc);
  window.afficherPisteInitiative(window.PARTIE_DATA.File_Attente_Combat, "Resolution");

  const piste = document.getElementById('piste-initiative');
  const panneau = document.getElementById('panneau-combat-gauche');
  const hud = document.getElementById('combat-hud-bas-droite');
  const rp = piste.getBoundingClientRect(), rg = panneau.getBoundingClientRect();
  const bulle = piste.firstElementChild.getBoundingClientRect();
  return {
    bulles: piste.children.length,
    largeurBulle: Math.round(bulle.width), hauteurBulle: Math.round(bulle.height),
    gauchePiste: Math.round(rp.left), largeurPiste: Math.round(rp.width),
    droitePanneau: Math.round(rg.right),
    dansLeHud: hud.contains(piste),
    zPiste: getComputedStyle(piste).zIndex, zHud: getComputedStyle(hud).zIndex,
    zPanneau: getComputedStyle(panneau).zIndex
  };
}, fnPiste);

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(56)} ${c?"OK":"ÉCHEC"} ${d}`); };

console.log(`écran 1366px — ${res.bulles} bulles de ${res.largeurBulle}×${res.hauteurBulle}px`);
console.log(`piste : ${res.largeurPiste}px de large, bord gauche à ${res.gauchePiste}px ; le panneau s'arrête à ${res.droitePanneau}px`);
verifier("les sept combattants sont affichés", res.bulles === 7, `(${res.bulles})`);
verifier("les bulles font bien la moitié de leur taille", res.largeurBulle === 55 && res.hauteurBulle === 63,
         `(${res.largeurBulle}×${res.hauteurBulle})`);
verifier("la piste ne passe plus derrière le panneau gauche",
         res.gauchePiste >= res.droitePanneau, `(${res.gauchePiste} ≥ ${res.droitePanneau})`);
verifier("elle est revenue dans le HUD, sous le bouton", res.dansLeHud && parseInt(res.zPiste) < 0,
         `(z ${res.zPiste})`);
verifier("le HUD reste sous le panneau gauche", parseInt(res.zHud) < parseInt(res.zPanneau),
         `(${res.zHud} < ${res.zPanneau})`);

console.log("\nLES COMBATTANTS À TERRE QUITTENT LA PISTE");
{
  const r = await p.evaluate((fnPisteSrc) => {
    eval(fnPisteSrc);
    const noms = ["Pliors","Jade","Mémé","Invocateur d'os","Frêle flèche"];
    window.PERSOS_PARTIE = noms.map((n, i) => ({ idPersonnage:"D"+i, prenom:n, PV_Max:50,
      PV_Actuels: i === 2 ? 0 : 40, statut: i === 2 ? "Mort" : "Vivant",
      Fatigue_Max:100, fatigueActuelle:70, Etats_Alteres:[] }));
    window.estCombattantMort = (id) => {
      const p = window.PERSOS_PARTIE.find(x => x.idPersonnage === id);
      return !p || p.statut === "Mort" || p.PV_Actuels <= 0;
    };
    const file = noms.map((n,i) => ({ idPersonnage:"D"+i, idCarte:"X", initiative: 80 - i*10 }));
    window.PARTIE_DATA = { Phase_Combat:"Resolution", File_Attente_Combat: file };
    window.afficherPisteInitiative(file, "Resolution");
    const piste = document.getElementById('piste-initiative');
    return { bulles: piste.children.length, texte: piste.innerText.replace(/\s+/g, " ").trim() };
  }, fnPiste);
  console.log(`     ${r.bulles} bulles pour 5 combattants dont un à terre`);
  verifier("le combattant à terre n'a plus sa bulle", r.bulles === 4, `(${r.bulles})`);
}

console.log("\nLA PISTE APPARAÎT MÊME SI LA BASCULE TOMBE PENDANT L'ANIMATION");
{
  const r = await p.evaluate(async (fnPisteSrc) => {
    eval(fnPisteSrc);
    const noms = ["Pliors","Jade","Gnoll"];
    window.PERSOS_PARTIE = noms.map((n, i) => ({ idPersonnage:"E"+i, prenom:n, PV_Max:50, PV_Actuels:40,
      Fatigue_Max:100, fatigueActuelle:70, Etats_Alteres:[] }));
    window.estCombattantMort = () => false;
    const piste = document.getElementById('piste-initiative');
    piste.innerHTML = ""; piste.style.opacity = "0";      // on repart d'une piste repliée
    const file = noms.map((n,i) => ({ idPersonnage:"E"+i, idCarte:"X", initiative: 80 - i*10 }));

    // La fin du tour précédent est encore en train de s'animer quand la bascule
    // en résolution arrive : c'est exactement la fenêtre où la piste se perdait.
    window.ANIMATION_TOUR_EN_COURS = true;
    window.afficherPisteInitiative(file, "Resolution");
    const pendant = { opacite: piste.style.opacity, bulles: piste.children.length };

    // L'animation se termine. Aucune nouvelle notification ne viendra.
    window.ANIMATION_TOUR_EN_COURS = false;
    await new Promise(r => setTimeout(r, 700));
    return { pendant, apres: { opacite: piste.style.opacity, bulles: piste.children.length } };
  }, fnPiste);
  console.log(`     pendant l'animation : ${r.pendant.bulles} bulle(s) — après : ${r.apres.bulles}`);
  verifier("rien n'est dessiné pendant l'animation", r.pendant.bulles === 0);
  verifier("la piste apparaît d'elle-même une fois l'animation finie",
           r.apres.bulles === 3 && r.apres.opacite === "1", `(${r.apres.bulles} bulles, opacité ${r.apres.opacite})`);
}

console.log("\nLE VIDAGE RETARDÉ N'EFFACE PLUS LA PISTE FRAÎCHEMENT DESSINÉE");
{
  const r = await p.evaluate(async (fnPisteSrc) => {
    eval(fnPisteSrc);
    const noms = ["Pliors","Jade","Gnoll"];
    window.PERSOS_PARTIE = noms.map((n, i) => ({ idPersonnage:"V"+i, prenom:n, PV_Max:50, PV_Actuels:40,
      Fatigue_Max:100, fatigueActuelle:70, Etats_Alteres:[] }));
    window.estCombattantMort = () => false;
    window.ANIMATION_TOUR_EN_COURS = false;
    const piste = document.getElementById('piste-initiative');
    const file = noms.map((n,i) => ({ idPersonnage:"V"+i, idCarte:"X", initiative: 80 - i*10 }));

    // Fin de tour : la piste se replie et programme son vidage 400 ms plus tard.
    window.afficherPisteInitiative([], "Preparation");
    // La bascule en résolution arrive tout de suite après, comme en vrai.
    await new Promise(r => setTimeout(r, 100));
    window.afficherPisteInitiative(file, "Resolution");
    const juste = piste.children.length;
    // On laisse passer l'heure du vidage.
    await new Promise(r => setTimeout(r, 600));
    return { juste, apres: piste.children.length, opacite: piste.style.opacity };
  }, fnPiste);
  console.log(`     dessinée : ${r.juste} bulles — 600 ms plus tard : ${r.apres}`);
  verifier("la piste est dessinée aussitôt", r.juste === 3, `(${r.juste})`);
  verifier("elle est toujours là après l'heure du vidage", r.apres === 3 && r.opacite === "1",
           `(${r.apres} bulles, opacité ${r.opacite})`);
}

await p.screenshot({ path: '/tmp/piste.png' });

// Combien de combattants tiennent avant que la piste ne recommence à passer
// sous le panneau ? La réponse dépend de la largeur de l'écran : on la mesure
// plutôt que de la deviner.
console.log("\nCOMBIEN DE COMBATTANTS TIENNENT");
for (const largeur of [1366, 1180, 1024]) {
  const pw = await b.newPage({ viewport: { width: largeur, height: 900 } });
  await pw.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
  pw.on('pageerror', () => {});
  await pw.goto('file:///home/user/Ivalis/index.html');
  const max = await pw.evaluate(({ fnPisteSrc }) => {
    document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
    const fenetre = document.getElementById('fenetre-combat');
    const chaine = new Set();
    for (let e = fenetre; e && e !== document.body; e = e.parentElement) chaine.add(e);
    [...document.body.children].forEach(e => { if (!chaine.has(e)) e.style.display = 'none'; });
    chaine.forEach(e => { if (getComputedStyle(e).display === 'none') e.style.display = 'block'; });
    fenetre.style.display = 'block';
    document.getElementById('img-hud-fintour').style.height = '150px';
    window.actualiserBoutonFinTour = function(){};
    eval(fnPisteSrc);
    const piste = document.getElementById('piste-initiative');
    const droitePanneau = document.getElementById('panneau-combat-gauche').getBoundingClientRect().right;
    let dernierBon = 0;
    for (let n = 1; n <= 12; n++) {
      window.PERSOS_PARTIE = Array.from({length:n}, (_,i) => ({ idPersonnage:"C"+i, prenom:"C"+i,
        PV_Max:50, PV_Actuels:40, Fatigue_Max:100, fatigueActuelle:70, Etats_Alteres:[] }));
      const file = window.PERSOS_PARTIE.map((p,i) => ({ idPersonnage:p.idPersonnage, idCarte:"X", initiative:80-i }));
      window.PARTIE_DATA = { Phase_Combat:"Resolution", File_Attente_Combat: file };
      window.afficherPisteInitiative(file, "Resolution");
      if (piste.getBoundingClientRect().left >= droitePanneau) dernierBon = n;
    }
    return dernierBon;
  }, { fnPisteSrc: fnPiste });
  console.log(`  écran ${largeur}px : ${max} combattants visibles en entier`);
  await pw.close();
}

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
