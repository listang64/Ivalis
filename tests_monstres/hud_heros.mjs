// LE BLOC DU HÉROS SUR LE BOUTON DE FIN DE TOUR
//
// Refonte UI combat, étape 4. Le joueur lisait sa vitalité et son énergie dans
// le panneau latéral, qui est appelé à disparaître. Elles vivent maintenant
// autour du gros bouton de fin de tour : deux demi-anneaux qui se remplissent
// par le bas, la vitalité à gauche en rouge, l'énergie à droite en doré, chacun
// avec son ancre chiffrée au bout. L'avatar du héros passe derrière le bouton
// et n'en dépasse que par le haut, son nom se lit au-dessus.
//
// CE BANC SERT LA VRAIE PAGE ET MESURE LE VRAI RENDU :
//   • le bloc montre le héros DU POSTE, même quand le panneau latéral a été
//     détourné pour montrer une créature — c'est la condition posée ;
//   • les deux demi-anneaux se remplissent par le bas, proportionnellement ;
//   • ce qui n'est pas rempli est noir ;
//   • un bouclier prend la place de la vitalité, en bleu, et la lui rend en
//     mourant — avec le chiffre qu'elle avait gardé pendant ce temps ;
//   • les chiffres des ancres portent la couleur de leur jauge ;
//   • l'avatar est DERRIÈRE l'image du bouton et dépasse par le haut ;
//   • le nom rétrécit tout seul quand il est trop long ;
//   • la boîte de réglage provisoire bouge bien ce qu'elle dit qu'elle bouge ;
//   • TOUT SUIT LE BANDEAU quand il rétrécit (la règle tablette le passe de
//     450 à 380 px), à l'échelle près et sans qu'un seul élément se décale ;
//   • LA PISTE DES ÉTATS se comporte en tapis roulant : les nouveaux entrent
//     par la gauche, ceux qui expirent filent à droite SOUS le bouton, et un
//     clic annonce les tours restants deux secondes ;
//   • L'ENCART DE TOUR est entièrement LIÉ À SON IMAGE : quand la plaque se
//     réduit, tout ce qui est posé dessus se réduit dans les mêmes proportions,
//     polices comprises.
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) {
    res.writeHead(404); res.end('non trouvé'); return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {}; export const updateDoc = async () => {};
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {}; export const query = (...a) => ({a});
  export const where = (...a) => ({a}); export const orderBy = (...a) => ({a});
  export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));

// Les images du décor sont injoignables depuis le bac à sable. On sert un
// rectangle connu à la place : l'avatar doit avoir une taille pour qu'on puisse
// dire s'il dépasse du bouton, et le bandeau une hauteur pour que la boîte de
// l'anneau se pose quelque part.
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml',
  headers: {'Access-Control-Allow-Origin':'*'},
  body: `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="132" viewBox="0 0 450 132"><rect width="450" height="132" fill="#2a1d12"/></svg>` }));

const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));

await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

// =========================================================================
//  LE MONDE : mon héros, un compagnon, et une créature.
// =========================================================================
await p.evaluate(() => {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById("fenetre-combat").style.display = "block";

  window.jouerSonClic = () => {};
  window.estCombattantMort = () => false;
  window.estMonstre = (id) => String(id).startsWith("M");
  window.PERSOS_PARTIE = [
    { idPersonnage: "H1", camp: "Allié", prenom: "Cybile", nom: "",
      urlCloudinary: "https://res.cloudinary.com/dlkjq4kvg/image/upload/heroine.png",
      PV_Max: 70, PV_Actuels: 45, Fatigue_Max: 110, fatigueActuelle: 110,
      Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant" },
    { idPersonnage: "M1", camp: "Ennemi", estMonstre: true, prenom: "Gnoll",
      PV_Max: 40, PV_Actuels: 12, Fatigue_Max: 60, fatigueActuelle: 10,
      Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant" }
  ];
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
  window.COMBAT_INDEX_PERSO = 0;
  window.PARTIE_DATA = { Phase_Combat: "Preparation", Tour_Combat: 1,
                         Ordre_Initiative: ["H1", "M1"], File_Attente_Combat: [] };
  window.actualiserHudHeros();
});
await p.waitForTimeout(500);

// Lit tout le bloc d'un coup.
const lire = () => p.evaluate(() => {
  const part = (id) => {
    const d = getComputedStyle(document.getElementById(id)).strokeDasharray || "";
    return Math.round(parseFloat(d.split(/[ ,]+/)[0]) || 0);
  };
  const couleur = (id) => getComputedStyle(document.getElementById(id)).color;
  const trait = (id) => getComputedStyle(document.getElementById(id)).stroke;
  const nom = document.getElementById("hud-nom-heros-texte");
  return {
    partGauche: part("hud-arc-gauche"), partDroite: part("hud-arc-droit"),
    traitGauche: trait("hud-arc-gauche"), traitDroit: trait("hud-arc-droit"),
    valGauche: document.getElementById("hud-valeur-gauche").innerText,
    valDroite: document.getElementById("hud-valeur-droite").innerText,
    couleurGauche: couleur("hud-valeur-gauche"), couleurDroite: couleur("hud-valeur-droite"),
    ecussonGauche: getComputedStyle(document.getElementById("hud-ancre-gauche")).backgroundColor,
    opaciteGauche: getComputedStyle(document.getElementById("hud-arc-gauche")).strokeOpacity,
    nom: nom.innerText, tailleNom: parseFloat(getComputedStyle(nom).fontSize)
  };
});

console.log("\n=========================================================");
console.log("  1. LES DEUX JAUGES DISENT LES CHIFFRES DU HÉROS");
console.log("=========================================================");
{
  const v = await lire();
  verifier("la vitalité remplit 45/70 de son demi-anneau",
           Math.abs(v.partGauche - 64) <= 1, `${v.partGauche}%`);
  verifier("l'énergie pleine remplit le sien en entier",
           v.partDroite === 100, `${v.partDroite}%`);
  verifier("le chiffre de gauche est la vitalité", v.valGauche === "45", v.valGauche);
  verifier("celui de droite est l'énergie", v.valDroite === "110", v.valDroite);
  // DU ROUGE ET DU JAUNE FRANCS, SANS DÉGRADÉ. Les trois jauges étaient peintes
  // d'un dégradé vertical qui, sur un arc de quinze pixels vu par une fenêtre
  // creusée dans le bouton, ne se lisait pas comme du relief mais comme de la
  // saleté — et tirait la couleur vers le brun dès qu'on s'éloignait du milieu.
  // On pointe donc les deux choses : la teinte exacte, et l'absence de renvoi
  // vers un dégradé (`url(#...)`), qui est la forme que prend la faute.
  verifier("LA VITALITÉ EST D'UN ROUGE FRANC", v.traitGauche === "rgb(255, 43, 43)", v.traitGauche);
  verifier("L'ÉNERGIE D'UN JAUNE FRANC", v.traitDroit === "rgb(255, 212, 0)", v.traitDroit);
  verifier("aucune des deux ne passe par un dégradé",
           !/url\(/.test(v.traitGauche) && !/url\(/.test(v.traitDroit),
           `${v.traitGauche} / ${v.traitDroit}`);
  verifier("le chiffre de vitalité est rouge", v.couleurGauche === "rgb(255, 90, 90)", v.couleurGauche);
  verifier("celui d'énergie est jaune", v.couleurDroite === "rgb(255, 223, 61)", v.couleurDroite);
}

console.log("\n=========================================================");
console.log("  2. LE FOND EST NOIR, ET LES ARCS MONTENT PAR LE BAS");
console.log("=========================================================");
{
  // « Quand la jauge se vide c'est un fond noir » : les deux demi-cercles au
  // complet sont peints en noir sous les jauges, qui les recouvrent en partie.
  const g = await p.evaluate(() => {
    const fonds = [...document.querySelectorAll(".hud-arc-fond")];
    const jauge = document.getElementById("hud-arc-gauche");
    const svg = jauge.ownerSVGElement;
    // Le point où commence le tracé, et celui où il finit : le premier doit être
    // EN BAS du cercle, sinon la jauge se viderait dans le mauvais sens.
    const debut = jauge.getPointAtLength(0);
    const fin = jauge.getPointAtLength(jauge.getTotalLength());
    const droit = document.getElementById("hud-arc-droit");
    const milieuGauche = jauge.getPointAtLength(jauge.getTotalLength() / 2);
    const milieuDroit = droit.getPointAtLength(droit.getTotalLength() / 2);
    return {
      nbFonds: fonds.length,
      fondNoir: fonds.every(f => getComputedStyle(f).stroke === "rgb(0, 0, 0)"),
      debutY: Math.round(debut.y), finY: Math.round(fin.y),
      milieuGaucheX: Math.round(milieuGauche.x), milieuDroitX: Math.round(milieuDroit.x),
      boite: svg.getBoundingClientRect().width
    };
  });
  // Le repère du SVG va de 0 à 100 : le centre du cercle est à 50, 50.
  verifier("les deux demi-cercles noirs sont là", g.nbFonds === 2 && g.fondNoir === true);

  // LE FOND NE DÉBORDE PAS DE LA JAUGE, ET IL EST OPAQUE.
  //
  // Il était plus large de trois pixels de part et d'autre, et translucide à
  // 82 %. Résultat : un liseré noirâtre tout autour des arcs, que l'œil lit
  // comme une ombre coincée entre l'image du bouton et les jauges — alors qu'il
  // n'y a aucune ombre là. Et là où la jauge est vide, l'ombre portée de
  // l'avatar, qui passe derrière, transparaissait à travers ce fond : le creux
  // paraissait sale au lieu d'être noir.
  {
    const f = await p.evaluate(() => {
      const fond = getComputedStyle(document.querySelector(".hud-arc-fond"));
      const jauge = getComputedStyle(document.getElementById("hud-arc-gauche"));
      return { largeurFond: parseFloat(fond.strokeWidth),
               largeurJauge: parseFloat(jauge.strokeWidth),
               opacite: fond.opacity };
    });
    verifier("LE FOND NOIR FAIT EXACTEMENT LA LARGEUR DE LA JAUGE",
             Math.abs(f.largeurFond - f.largeurJauge) < 0.01,
             `${f.largeurFond} contre ${f.largeurJauge}`);
    verifier("ET IL EST OPAQUE (rien ne transparaît par le creux)",
             parseFloat(f.opacite) === 1, f.opacite);
  }
  verifier("LA JAUGE PART DU BAS DU CERCLE", g.debutY >= 95, `y = ${g.debutY}`);
  verifier("et monte jusqu'en haut", g.finY <= 5, `y = ${g.finY}`);
  verifier("celle de vitalité passe bien par la GAUCHE", g.milieuGaucheX <= 5, `x = ${g.milieuGaucheX}`);
  verifier("celle d'énergie par la DROITE", g.milieuDroitX >= 95, `x = ${g.milieuDroitX}`);
}

console.log("\n=========================================================");
console.log("  3. LE BLOC RESTE SUR MON HÉROS QUAND JE REGARDE AILLEURS");
console.log("=========================================================");
{
  // LA CONDITION POSÉE : « c'est les jauges du personnage du joueur ».
  //
  // Le panneau latéral est une visionneuse : cliquer sur un portrait de la piste
  // ou sur un pion du plateau y installe ce combattant-là, créature comprise —
  // afficherDansPanneauGauche remplace alors COMBAT_PERSOS_JOUEUR par [la
  // créature] et met la vraie liste de côté dans COMBAT_PERSOS_JOUEUR_BACKUP.
  // C'est cette même confusion qui a déjà désarmé le bouton de fin de tour et le
  // lancement des cartes ; ici, elle afficherait la vie du gnoll au joueur.
  await p.evaluate(() => {
    window.COMBAT_PERSOS_JOUEUR_BACKUP = [window.PERSOS_PARTIE[0]];
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[1]];   // le panneau montre la créature
    window.COMBAT_INDEX_PERSO = 0;
    window.actualiserHudHeros();
  });
  await p.waitForTimeout(400);
  const v = await lire();
  verifier("LE CHIFFRE RESTE CELUI DU HÉROS, PAS DE LA CRÉATURE",
           v.valGauche === "45", `${v.valGauche} (la créature est à 12)`);
  verifier("son énergie aussi", v.valDroite === "110", `${v.valDroite} (la créature est à 10)`);
  // `innerText` rend le texte TEL QU'IL S'AFFICHE : text-transform le met en
  // capitales. On compare donc sans se soucier de la casse.
  verifier("et le nom ne change pas", v.nom.toLowerCase() === "cybile", v.nom);
  await p.evaluate(() => {
    window.COMBAT_PERSOS_JOUEUR = window.COMBAT_PERSOS_JOUEUR_BACKUP;
    window.COMBAT_PERSOS_JOUEUR_BACKUP = null;
  });
}

console.log("\n=========================================================");
console.log("  4. LE BOUCLIER PREND LA PLACE DE LA VITALITÉ, PUIS LA REND");
console.log("=========================================================");
{
  await p.evaluate(() => {
    window.PERSOS_PARTIE[0].Bouclier_Actuel = 20;
    window.PERSOS_PARTIE[0].Bouclier_Max = 40;
    window.actualiserHudHeros();
  });
  await p.waitForTimeout(400);
  let v = await lire();
  verifier("LE BOUCLIER S'INSTALLE À GAUCHE", v.valGauche === "20", v.valGauche);
  verifier("il est bleu clair", v.couleurGauche === "rgb(99, 226, 255)", v.couleurGauche);
  verifier("son écusson aussi", v.ecussonGauche === "rgb(34, 211, 255)", v.ecussonGauche);
  verifier("et il se lit sur SON maximum, pas sur celui des points de vie",
           Math.abs(v.partGauche - 50) <= 1, `${v.partGauche}% pour 20/40`);
  verifier("l'énergie n'a pas bougé", v.valDroite === "110", v.valDroite);

  await p.evaluate(() => {
    window.PERSOS_PARTIE[0].Bouclier_Actuel = 0;
    window.PERSOS_PARTIE[0].Bouclier_Max = 0;
    window.actualiserHudHeros();
  });
  await p.waitForTimeout(400);
  v = await lire();
  verifier("LE BOUCLIER MORT, LA VITALITÉ REPREND SA PLACE", v.valGauche === "45", v.valGauche);
  verifier("avec sa couleur", v.couleurGauche === "rgb(255, 90, 90)", v.couleurGauche);
  verifier("et sa part d'anneau", Math.abs(v.partGauche - 64) <= 1, `${v.partGauche}%`);
}

console.log("\n=========================================================");
console.log("  5. À ZÉRO, IL NE RESTE QUE LE NOIR");
console.log("=========================================================");
{
  await p.evaluate(() => {
    window.PERSOS_PARTIE[0].PV_Actuels = 0;
    window.PERSOS_PARTIE[0].fatigueActuelle = 33;
    window.actualiserHudHeros();
  });
  await p.waitForTimeout(400);
  const v = await lire();
  verifier("la vitalité vide ne dessine plus rien", v.partGauche === 0, `${v.partGauche}%`);
  verifier("même pas le point d'un bout arrondi", v.opaciteGauche === "0", v.opaciteGauche);
  verifier("le chiffre le dit quand même", v.valGauche === "0", v.valGauche);
  verifier("l'énergie suit sa propre valeur", Math.abs(v.partDroite - 30) <= 1, `${v.partDroite}% pour 33/110`);
  await p.evaluate(() => {
    window.PERSOS_PARTIE[0].PV_Actuels = 45;
    window.PERSOS_PARTIE[0].fatigueActuelle = 110;
    window.actualiserHudHeros();
  });
}

console.log("\n=========================================================");
console.log("  6. L'AVATAR PASSE DERRIÈRE LE BOUTON ET DÉPASSE PAR LE HAUT");
console.log("=========================================================");
{
  const a = await p.evaluate(() => {
    const avatar = document.getElementById("hud-avatar-heros");
    const image = document.getElementById("img-hud-fintour");
    const hud = document.getElementById("combat-hud-bas-droite");
    const enfants = [...hud.children].map(e => e.id);
    const ra = avatar.getBoundingClientRect(), ri = image.getBoundingClientRect();
    return {
      rangAvatar: enfants.indexOf("hud-avatar-heros"),
      rangImage: enfants.indexOf("img-hud-fintour"),
      rangAnneau: enfants.indexOf("hud-anneau-boite"),
      rangAncres: enfants.indexOf("hud-ancres-boite"),
      rangNom: enfants.indexOf("hud-nom-heros"),
      opacite: getComputedStyle(avatar).opacity,
      hautAvatar: Math.round(ra.top), hautImage: Math.round(ri.top),
      basAvatar: Math.round(ra.bottom), basImage: Math.round(ri.bottom),
      src: avatar.getAttribute("src") || ""
    };
  });
  verifier("l'avatar a reçu l'image du héros", a.src.includes("heroine"), a.src.slice(-40));
  verifier("et il est visible", a.opacite === "1", a.opacite);
  // L'ORDRE D'ÉCRITURE EST L'ORDRE D'EMPILEMENT, et il compte pour chacun.
  //
  // L'anneau a fait l'aller-retour. Posé derrière au premier jet, il disparaissait
  // entièrement sous le disque plein du bouton — un disque plus grand que ce
  // qu'on avait estimé, et dont ni la taille ni la place ne se lisent nulle part.
  // Passé devant, il se voyait, mais recouvrait le décor. L'image a depuis été
  // creusée d'une fenêtre à l'endroit exact des arcs : ils reprennent leur place
  // dessous, à travers elle.
  //
  // L'avatar est au plus profond, DERRIÈRE les jauges : sinon c'est son épaule
  // qu'on verrait par la fenêtre. Les ancres chiffrées et le nom restent devant
  // l'image : ce sont des choses à lire, pas des transparences.
  verifier("L'AVATAR EST LE PLUS AU FOND",
           a.rangAvatar >= 0 && a.rangAvatar < a.rangAnneau,
           `${a.rangAvatar} < ${a.rangAnneau}`);
  verifier("LES JAUGES SONT SOUS L'IMAGE (elles se voient par la fenêtre)",
           a.rangAnneau < a.rangImage, `${a.rangAnneau} < ${a.rangImage}`);
  verifier("LES ANCRES CHIFFRÉES SONT DEVANT", a.rangAncres > a.rangImage,
           `${a.rangAncres} > ${a.rangImage}`);
  verifier("le nom aussi", a.rangNom > a.rangImage, `${a.rangNom} > ${a.rangImage}`);
  verifier("IL DÉPASSE FRANCHEMENT PAR LE HAUT",
           a.hautImage - a.hautAvatar > 150, `${a.hautImage - a.hautAvatar}px au-dessus`);
  verifier("et son bas est caché dans le bandeau",
           a.basAvatar < a.basImage && a.basAvatar > a.hautImage,
           `bas avatar ${a.basAvatar}, bandeau ${a.hautImage}→${a.basImage}`);
}

console.log("\n=========================================================");
console.log("  7. LES DEUX BOÎTES SE SUPERPOSENT, LES ANCRES SONT AUX BOUTS");
console.log("=========================================================");
{
  // DEUX BOÎTES, ET UNE SEULE GÉOMÉTRIE. Les arcs vivent sous l'image du bouton
  // et les ancres par-dessus : il leur faut deux éléments, de part et d'autre de
  // l'image dans la page. S'ils se décalaient d'un pixel, les chiffres ne
  // seraient plus au bout de leur jauge. Le réglage étant unique, on vérifie que
  // les deux boîtes tombent exactement l'une sur l'autre.
  const m = await p.evaluate(() => {
    const arcs = document.getElementById("hud-anneau-boite").getBoundingClientRect();
    const ancres = document.getElementById("hud-ancres-boite").getBoundingClientRect();
    const g = document.getElementById("hud-ancre-gauche").getBoundingClientRect();
    const d = document.getElementById("hud-ancre-droite").getBoundingClientRect();
    const hud = document.getElementById("combat-hud-bas-droite").getBoundingClientRect();
    const cx = arcs.left + arcs.width / 2, cy = arcs.top + arcs.height / 2;
    const r = window.REGLAGES_HUD;
    return {
      ecartBoites: Math.round(Math.abs(arcs.left - ancres.left))
                 + Math.round(Math.abs(arcs.top - ancres.top))
                 + Math.round(Math.abs(arcs.width - ancres.width)),
      // Le bord EXTÉRIEUR de chaque ancre, décalage réglé compris. Les deux
      // décalages se comptent vers la DROITE : celui de gauche rapproche donc
      // l'ancre du centre quand il est positif, celui de droite l'en éloigne —
      // d'où les deux signes opposés, qui ne sont pas une coquille.
      bordGauche: Math.round(cx - g.left) + r.ancreGauche.dx,
      bordDroit: Math.round(d.right - cx) - r.ancreDroite.dx,
      hauteurGauche: Math.round((g.top + g.height / 2) - cy),
      hauteurDroite: Math.round((d.top + d.height / 2) - cy),
      rayon: Math.round(arcs.width * 0.5),
      depasseADroite: Math.round(d.right - hud.right),
      // La pointe de l'écusson n'est pas son corps : le clip-path la taille
      // entre 76 % et 100 % de la largeur. C'est le CORPS qui doit rester
      // lisible, la pointe peut mordre le bord sans que personne ne le voie.
      largeurAncre: Math.round(d.width)
    };
  });
  verifier("LES DEUX BOÎTES TOMBENT EXACTEMENT L'UNE SUR L'AUTRE",
           m.ecartBoites === 0, `${m.ecartBoites}px d'écart cumulé`);
  verifier("l'ancre de gauche s'aligne sur le bord gauche de l'anneau",
           Math.abs(m.bordGauche - m.rayon) <= 2, `${m.bordGauche} pour un rayon de ${m.rayon}`);
  verifier("celle de droite sur le bord droit",
           Math.abs(m.bordDroit - m.rayon) <= 2, `${m.bordDroit} pour un rayon de ${m.rayon}`);
  verifier("les deux sont à mi-hauteur du cercle",
           Math.abs(m.hauteurGauche) <= 1 && Math.abs(m.hauteurDroite) <= 1,
           `${m.hauteurGauche} / ${m.hauteurDroite}`);
  // LE SEUIL N'EST PAS UN CHIFFRE ROND, IL VIENT DE LA FORME. L'écusson est un
  // hexagone dont le clip-path taille la pointe droite entre 76 % et 100 % de
  // sa largeur : les 24 derniers pour cent ne sont qu'un biseau de plus en plus
  // fin. Le contrôle existe pour attraper « la moitié de l'ancre hors champ »,
  // pas « la pointe affleure le bord ». Il tolère donc la pointe, et rien de
  // plus — le corps du chiffre, lui, doit rester entier.
  const tolerance = Math.round(m.largeurAncre * 0.24);
  verifier("LE CORPS DE L'ANCRE DE DROITE RESTE DANS L'ÉCRAN",
           m.depasseADroite <= tolerance,
           `${m.depasseADroite}px au-delà du bandeau, pointe longue de ${tolerance}px`);
}

console.log("\n=========================================================");
console.log("  8. UN NOM TROP LONG RÉTRÉCIT AU LIEU DE DÉBORDER");
console.log("=========================================================");
{
  const mesurer = (prenom, nom) => p.evaluate(async ([pr, n]) => {
    window.PERSOS_PARTIE[0].prenom = pr;
    window.PERSOS_PARTIE[0].nom = n;
    window.actualiserHudHeros();
    await new Promise(r => setTimeout(r, 200));
    const boite = document.getElementById("hud-nom-heros");
    const el = document.getElementById("hud-nom-heros-texte");
    return { texte: el.innerText, taille: parseFloat(getComputedStyle(el).fontSize),
             deborde: boite.scrollWidth > boite.clientWidth + 1,
             largeur: boite.clientWidth, dessin: boite.scrollWidth };
  }, [prenom, nom]);

  const court = await mesurer("Cybile", "");
  verifier("un nom court garde la grande taille", court.taille === 38, `${court.taille}px`);
  verifier("et il tient dans sa boîte", court.deborde === false, `${court.dessin} / ${court.largeur}`);

  const long = await mesurer("Bartholomée", "de Montrachet-le-Vieux");
  verifier("UN NOM TRÈS LONG A RÉTRÉCI", long.taille < 38, `${long.taille}px`);
  verifier("ET IL TIENT QUAND MÊME DANS SA BOÎTE",
           long.deborde === false, `${long.dessin} / ${long.largeur}`);
  verifier("sans jamais devenir illisible", long.taille >= 14, `${long.taille}px`);
  verifier("le nom complet est bien celui affiché",
           long.texte.toLowerCase() === "bartholomée de montrachet-le-vieux", long.texte);

  const retour = await mesurer("Cybile", "");
  verifier("revenu à un nom court, la taille remonte", retour.taille === 38, `${retour.taille}px`);
}

console.log("  9. LA BOÎTE DE RÉGLAGE BOUGE CE QU'ELLE DIT QU'ELLE BOUGE");
console.log("=========================================================");
{
  // Cette boîte est un outil provisoire, mais c'est celui sur lequel repose tout
  // le calage : le fond de l'encart est une image, sa taille et la place de ce
  // qu'on pose dessus ne se lisent nulle part. Si ses flèches mentent, on règle
  // dans le vide.
  //
  // LE PIÈGE EST DANS LES SIGNES. Plusieurs valeurs se comptent depuis le bord
  // DROIT ou le bord BAS : les augmenter déplace l'élément vers la gauche ou
  // vers le haut. Une flèche « ◀ » doit montrer ce qu'on VOIT, pas ce que la
  // valeur fait. On mesure donc des pixels à l'écran, jamais les nombres.
  const outils = await p.evaluate(async () => {
    window.ENCART_FIGE = true;                    // l'encart reste à l'écran
    document.getElementById("fenetre-combat").style.display = "block";
    await new Promise(r => setTimeout(r, 900));
    return {
      boite: !!document.getElementById("reglage-hud"),
      poignee: !!document.getElementById("reglage-hud-poignee"),
      reglages: !!window.REGLAGES_HUD,
      encartVu: document.getElementById("voile-tour-encart").getBoundingClientRect().width > 100
    };
  });
  verifier("la boîte de réglage est là", outils.boite === true);
  verifier("sa poignée aussi", outils.poignee === true);
  verifier("les réglages sont exposés", outils.reglages === true);
  verifier("et l'encart se laisse figer pour être réglé", outils.encartVu === true);

  const cliquer = (titre, signe, fois = 1, rang = 0) => p.evaluate(async ([t, sg, n, k]) => {
    const blocs = [...document.querySelectorAll("#reglage-hud > div")];
    const bloc = blocs.find(b => (b.firstChild && b.firstChild.textContent || "").startsWith(t));
    if (!bloc) return "ligne introuvable : " + t;
    const b = [...bloc.querySelectorAll("button")].filter(x => x.textContent === sg)[k];
    if (!b) return "bouton introuvable : " + sg;
    for (let i = 0; i < n; i++) b.click();
    await new Promise(r => setTimeout(r, 150));
    return "ok";
  }, [titre, signe, fois, rang]);

  const ou = (id) => p.evaluate((i) => {
    const r = document.getElementById(i).getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
             l: Math.round(r.width), h: Math.round(r.height) };
  }, id);

  // LA PLAQUE : sa position se compte depuis la gauche ET depuis le BAS, donc
  // seul l'axe vertical est inversé. C'est exactement là qu'une flèche se trompe.
  {
    const avant = await ou("voile-tour-encart");
    verifier("clic sur ◀ de la plaque", (await cliquer("Plaque", "◀", 5)) === "ok");
    const apres = await ou("voile-tour-encart");
    verifier("◀ DÉPLACE BIEN LA PLAQUE VERS LA GAUCHE", apres.x < avant.x, `${avant.x} → ${apres.x}`);
    await cliquer("Plaque", "▶", 5);

    const avantH = await ou("voile-tour-encart");
    await cliquer("Plaque", "▲", 5);
    const apresH = await ou("voile-tour-encart");
    verifier("▲ la fait bien monter", apresH.y < avantH.y, `${avantH.y} → ${apresH.y}`);
    await cliquer("Plaque", "▼", 5);
  }

  // LE PION : la demande explicite était de pouvoir aussi l'agrandir et le
  // réduire, en plus de le déplacer.
  {
    const avant = await ou("voile-tour-pion-boite");
    verifier("clic sur ◀ de l'avatar en pied", (await cliquer("Avatar en pied", "◀", 4)) === "ok");
    const apres = await ou("voile-tour-pion-boite");
    verifier("◀ DÉPLACE BIEN L'AVATAR VERS LA GAUCHE", apres.x < avant.x, `${avant.x} → ${apres.x}`);
    await cliquer("Avatar en pied", "▶", 4);

    const avantH = await ou("voile-tour-pion-boite");
    await cliquer("Avatar en pied", "▲", 4);
    const apresH = await ou("voile-tour-pion-boite");
    verifier("▲ le fait bien monter", apresH.y < avantH.y, `${avantH.y} → ${apresH.y}`);
    await cliquer("Avatar en pied", "▼", 4);

    const avantT = await ou("voile-tour-pion-boite");
    await cliquer("Avatar en pied", "+", 4);
    const apresT = await ou("voile-tour-pion-boite");
    verifier("« + » AGRANDIT VRAIMENT L'AVATAR", apresT.l > avantT.l, `${avantT.l} → ${apresT.l}px`);
    await cliquer("Avatar en pied", "−", 4);
    const retour = await ou("voile-tour-pion-boite");
    verifier("et « − » le réduit d'autant", Math.abs(retour.l - avantT.l) <= 1,
             `${apresT.l} → ${retour.l} (départ ${avantT.l})`);
  }

  // LA POLICE DU NOM se règle aussi, et c'est le second bouton de sa ligne.
  {
    const police = () => p.evaluate(() =>
      Math.round(parseFloat(getComputedStyle(document.getElementById("voile-tour-nom")).fontSize) * 10) / 10);
    const avant = await police();
    await cliquer("Nom du combattant", "+", 4);
    const apres = await police();
    verifier("la police du nom s'agrandit", apres > avant, `${avant} → ${apres}px`);
    await cliquer("Nom du combattant", "−", 4);
  }

  // LE CODE À RENVOYER : c'est le seul chemin entre l'écran et le dépôt.
  {
    const code = await p.evaluate(() => {
      window.REGLAGES_HUD.encartAvatar.hauteur = 71;
      return window.codeReglagesHud();
    });
    verifier("le code extrait porte les valeurs réglées",
             code.includes("hauteur: 71"), (code.split("\n").find(l => l.includes("encartAvatar")) || "").trim());
    verifier("et une forme recopiable d'un bloc", code.includes('"encartAvatar"'));
  }

  // LE RETOUR AUX VALEURS D'ORIGINE, pour ne jamais rester coincé sur un
  // réglage raté — les valeurs sont gardées d'une session à l'autre.
  {
    await p.evaluate(async () => {
      const b = [...document.querySelectorAll("#reglage-hud button")]
        .find(x => x.textContent.includes("Défaut"));
      b.click();
      await new Promise(r => setTimeout(r, 200));
    });
    const t = await p.evaluate(() => window.REGLAGES_HUD.encartAvatar.hauteur);
    verifier("« Défaut » remet tout en place", t === 62, String(t));
  }
  await p.evaluate(() => { window.ENCART_FIGE = false; });
}

console.log("\n=========================================================");
console.log("  10. LE BANDEAU RÉTRÉCIT, TOUT LE BLOC SUIT");
console.log("=========================================================");
{
  // LE DÉFAUT QUE CE CONTRÔLE GARDE.
  //
  // Les réglages du bloc sont des PIXELS, et un pixel ne veut rien dire tout
  // seul. style.css réduit le bandeau de 450 à 380 px sur tablette
  // (@media pointer: coarse) — le bouton de fin de tour avec lui. Des
  // coordonnées absolues réglées sur un bandeau de 450 y tombaient quinze pour
  // cent trop loin : l'anneau à côté du bouton, le nom ailleurs, l'avatar
  // décollé du bord. Réglé sur un écran, faux sur l'autre.
  //
  // ON NE MESURE DONC PAS DES PIXELS, MAIS DES RAPPORTS. Chaque élément est
  // repéré par sa distance au coin bas-droit du bandeau, divisée par la largeur
  // de ce bandeau. Ces rapports-là doivent être les MÊMES aux deux largeurs :
  // c'est la définition de « tout suit ».
  const largeurTablette = await p.evaluate(() => {
    for (const feuille of document.styleSheets) {
      let regles; try { regles = feuille.cssRules; } catch (e) { continue; }
      for (const r of regles || []) {
        if (r.type !== CSSRule.MEDIA_RULE || !/coarse/.test(r.conditionText || "")) continue;
        for (const interne of r.cssRules || []) {
          if ((interne.selectorText || "").includes("#combat-hud-bas-droite")) {
            return parseFloat(interne.style.width);
          }
        }
      }
    }
    return 0;
  });
  verifier("la règle tablette réduit bien le bandeau", largeurTablette > 0 && largeurTablette < 450,
           `${largeurTablette}px`);

  // Les rapports de chaque élément, à la largeur courante.
  const rapports = () => p.evaluate(() => {
    const hud = document.getElementById("combat-hud-bas-droite").getBoundingClientRect();
    const L = hud.width;
    const lire = (id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return {
        droite: +((hud.right - (r.left + r.width / 2)) / L).toFixed(4),
        bas: +((hud.bottom - (r.top + r.height / 2)) / L).toFixed(4),
        large: +(r.width / L).toFixed(4),
        haut: +(r.height / L).toFixed(4)
      };
    };
    const nom = document.getElementById("hud-nom-heros-texte");
    return {
      largeur: Math.round(L),
      anneau: lire("hud-anneau-boite"),
      ancreG: lire("hud-ancre-gauche"),
      ancreD: lire("hud-ancre-droite"),
      avatar: lire("hud-avatar-heros"),
      nom: lire("hud-nom-heros"),
      policeNom: +(parseFloat(getComputedStyle(nom).fontSize) / L).toFixed(4),
      traitJauge: +(parseFloat(getComputedStyle(document.getElementById("hud-arc-gauche")).strokeWidth)).toFixed(3)
    };
  });

  const avant = await rapports();
  verifier("on part bien de la largeur de référence", avant.largeur === 450, `${avant.largeur}px`);

  // On rétrécit le bandeau comme le fait la règle tablette, ET ON NE PRÉVIENT
  // PERSONNE : c'est la surveillance de la largeur qui doit s'en apercevoir
  // toute seule. Une rotation de tablette n'envoie pas toujours d'événement.
  await p.evaluate((l) => {
    document.getElementById("combat-hud-bas-droite").style.width = l + "px";
  }, largeurTablette);
  await p.waitForTimeout(1100);

  const apres = await rapports();
  verifier("le bandeau a bien rétréci", apres.largeur === Math.round(largeurTablette),
           `${avant.largeur} → ${apres.largeur}px`);

  const memeRapport = (a, b, quoi) => {
    const ecarts = ["droite", "bas", "large", "haut"]
      .map(k => ({ k, d: Math.abs(a[k] - b[k]) }))
      .filter(e => e.d > 0.006);
    verifier(`${quoi} garde exactement sa place et sa taille relatives`,
             ecarts.length === 0,
             ecarts.length ? ecarts.map(e => `${e.k} ${a[e.k]} → ${b[e.k]}`).join(", ")
                           : `droite ${b.droite}, bas ${b.bas}`);
  };
  memeRapport(avant.anneau, apres.anneau, "L'ANNEAU");
  memeRapport(avant.ancreG, apres.ancreG, "l'ancre de gauche");
  memeRapport(avant.ancreD, apres.ancreD, "l'ancre de droite");
  memeRapport(avant.avatar, apres.avatar, "L'AVATAR");
  memeRapport(avant.nom, apres.nom, "la boîte du nom");

  verifier("LA POLICE DU NOM SUIT AUSSI",
           Math.abs(avant.policeNom - apres.policeNom) <= 0.004,
           `${avant.policeNom} → ${apres.policeNom}`);
  // L'épaisseur du trait, elle, est en centièmes de la boîte : elle suit sans
  // qu'on la touche, et c'est bien ce qu'on vérifie — le chiffre ne bouge pas.
  verifier("l'épaisseur du trait des jauges n'a pas eu à être recalculée",
           Math.abs(avant.traitJauge - apres.traitJauge) < 0.01,
           `${avant.traitJauge} → ${apres.traitJauge}`);

  await p.evaluate(() => { document.getElementById("combat-hud-bas-droite").style.width = "450px"; });
  await p.waitForTimeout(900);
}

console.log("\n=========================================================");
console.log("  11. LA PISTE DES ÉTATS : UN TAPIS ROULANT");
console.log("=========================================================");
{
  // Poser des états sur le héros, et laisser la piste se refaire.
  const poser = (...noms) => p.evaluate(async (ns) => {
    window.PERSOS_PARTIE[0].Etats_Alteres = ns.map(([nom, duree]) => ({
      nom, duree, desc: "peu importe",
      icone: "data:image/svg+xml;utf8," + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" fill="#c33"/></svg>')
    }));
    window.actualiserHudHeros();
    await new Promise(r => setTimeout(r, 700));
  }, noms);

  const lirePiste = () => p.evaluate(() => {
    const piste = document.getElementById("piste-etats");
    const voile = document.getElementById("piste-etats-voile");
    const rp = piste.getBoundingClientRect();
    const tuiles = [...piste.querySelectorAll(".etat-piste")].map(t => {
      const r = t.getBoundingClientRect();
      return { nom: t.dataset.nom || null, sort: t.classList.contains("etat-sort"),
               x: Math.round(r.left + r.width / 2), l: Math.round(r.width),
               opacite: +getComputedStyle(t).opacity };
    }).sort((a, b) => a.x - b.x);
    return { tuiles, droiteDeLaPiste: Math.round(rp.right),
             voileLarge: Math.round(voile.getBoundingClientRect().width),
             voileOpacite: +getComputedStyle(voile).opacity };
  });

  // --- aucun état : rien ne traîne ---
  await poser();
  {
    const v = await lirePiste();
    verifier("sans état, la piste est vide", v.tuiles.length === 0, `(${v.tuiles.length})`);
    verifier("ET SON VOILE EST ÉTEINT", v.voileOpacite === 0, String(v.voileOpacite));
  }

  // --- deux états ---
  await poser(["Brûlure", 3], ["Glacé", 2]);
  let apresDeux;
  {
    const v = await lirePiste();
    apresDeux = v;
    verifier("deux états, deux icônes", v.tuiles.length === 2, `(${v.tuiles.length})`);
    verifier("le voile s'allume", v.voileOpacite === 1, String(v.voileOpacite));
    verifier("et il couvre les deux", v.voileLarge > v.tuiles[0].l * 2, `${v.voileLarge}px`);
    // Le rang 0 est collé au bouton : le PREMIER arrivé est donc le plus à droite.
    verifier("LE PREMIER ARRIVÉ EST COLLÉ AU BOUTON",
             v.tuiles[1].nom === "Brûlure", v.tuiles.map(t => t.nom).join(" | "));
    verifier("et le second est à sa gauche", v.tuiles[0].nom === "Glacé");
    verifier("la piste reste à gauche du bouton",
             v.tuiles[1].x < v.droiteDeLaPiste + 1, `${v.tuiles[1].x} / ${v.droiteDeLaPiste}`);
  }

  // --- un troisième arrive : IL ENTRE PAR LA GAUCHE, personne ne bouge ---
  await poser(["Brûlure", 3], ["Glacé", 2], ["Peur", 4]);
  {
    const v = await lirePiste();
    verifier("le nouvel état s'ajoute", v.tuiles.length === 3, `(${v.tuiles.length})`);
    verifier("IL ENTRE PAR LA GAUCHE", v.tuiles[0].nom === "Peur",
             v.tuiles.map(t => t.nom).join(" | "));
    // Les deux déjà là ne doivent pas avoir bougé d'un pixel : c'est le propre
    // d'un tapis qui s'allonge par le bout, et pas d'une liste qui se recentre.
    const brulureAvant = apresDeux.tuiles.find(t => t.nom === "Brûlure").x;
    const brulureApres = v.tuiles.find(t => t.nom === "Brûlure").x;
    verifier("ET LES AUTRES N'ONT PAS BOUGÉ",
             Math.abs(brulureAvant - brulureApres) <= 1, `${brulureAvant} → ${brulureApres}`);
  }

  // --- un état expire : il file à DROITE, les autres se resserrent ---
  const avantSortie = await lirePiste();
  await p.evaluate(async () => {
    window.PERSOS_PARTIE[0].Etats_Alteres =
      window.PERSOS_PARTIE[0].Etats_Alteres.filter(e => e.nom !== "Brûlure");
    window.actualiserHudHeros();
    await new Promise(r => setTimeout(r, 200));   // en plein trajet
  });
  {
    const v = await lirePiste();
    const sortante = v.tuiles.find(t => t.sort);
    verifier("l'état expiré est marqué sortant", !!sortante);
    const xAvant = avantSortie.tuiles.find(t => t.nom === "Brûlure").x;
    verifier("IL FILE VERS LA DROITE, SOUS LE BOUTON",
             !!sortante && sortante.x > xAvant + 20, `${xAvant} → ${sortante ? sortante.x : "?"}`);
    verifier("en s'éteignant", !!sortante && sortante.opacite < 1,
             String(sortante && sortante.opacite));
    // Et ceux qui restent glissent vers la droite : leurs rangs ont baissé.
    const glaceAvant = avantSortie.tuiles.find(t => t.nom === "Glacé").x;
    const glaceApres = v.tuiles.find(t => t.nom === "Glacé").x;
    verifier("ET LES AUTRES GLISSENT VERS LA DROITE",
             glaceApres > glaceAvant + 10, `${glaceAvant} → ${glaceApres}`);
  }
  await p.waitForTimeout(800);
  {
    const v = await lirePiste();
    verifier("une fois sorti, il est retiré de la page",
             v.tuiles.length === 2, `(${v.tuiles.length})`);
  }

  // --- LE CLIC ANNONCE LES TOURS RESTANTS, DEUX SECONDES ---
  {
    const reponse = await p.evaluate(async () => {
      const t = document.querySelector('.etat-piste[data-nom="Peur"]');
      t.click();
      await new Promise(r => setTimeout(r, 400));
      const b = t.querySelector(".etat-piste-duree");
      const rb = b.getBoundingClientRect(), rt = t.getBoundingClientRect();
      return { texte: b.innerText, visible: +getComputedStyle(b).opacity > 0.5,
               dessous: rb.top >= rt.bottom - 1,
               centre: Math.abs((rb.left + rb.width / 2) - (rt.left + rt.width / 2)) <= 2 };
    });
    verifier("LE CLIC ANNONCE LES TOURS RESTANTS", reponse.texte === "4 Tours", reponse.texte);
    verifier("il s'affiche", reponse.visible === true);
    verifier("SOUS L'ICÔNE TOUCHÉE, centré dessus",
             reponse.dessous === true && reponse.centre === true,
             `dessous ${reponse.dessous}, centré ${reponse.centre}`);

    // Le singulier n'est pas un détail : « 1 Tours » se voit tout de suite.
    const singulier = await p.evaluate(async () => {
      window.PERSOS_PARTIE[0].Etats_Alteres.find(e => e.nom === "Peur").duree = 1;
      document.querySelector('.etat-piste[data-nom="Peur"]').click();
      await new Promise(r => setTimeout(r, 300));
      return document.querySelector('.etat-piste[data-nom="Peur"] .etat-piste-duree').innerText;
    });
    verifier("et il accorde le singulier", singulier === "1 Tour", singulier);

    await p.waitForTimeout(2200);
    const efface = await p.evaluate(() =>
      +getComputedStyle(document.querySelector('.etat-piste[data-nom="Peur"] .etat-piste-duree')).opacity);
    verifier("DEUX SECONDES PLUS TARD, IL S'EFFACE", efface < 0.5, String(efface));
  }

  // --- ELLE EST SOUS L'IMAGE DU BOUTON, sinon la sortie passerait par-dessus ---
  {
    const rangs = await p.evaluate(() => {
      const hud = document.getElementById("combat-hud-bas-droite");
      const e = [...hud.children].map(x => x.id);
      return { piste: e.indexOf("piste-etats"), image: e.indexOf("img-hud-fintour") };
    });
    verifier("LA PISTE EST ÉCRITE AVANT L'IMAGE (l'icône passe dessous en sortant)",
             rangs.piste >= 0 && rangs.piste < rangs.image, `${rangs.piste} < ${rangs.image}`);
  }

  // --- et elle ne montre QUE le héros du poste ---
  {
    const v = await p.evaluate(async () => {
      window.COMBAT_PERSOS_JOUEUR_BACKUP = [window.PERSOS_PARTIE[0]];
      window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[1]];   // le panneau montre la créature
      window.PERSOS_PARTIE[1].Etats_Alteres = [{ nom: "Paralysie", duree: 9, icone: "", desc: "" }];
      window.actualiserHudHeros();
      await new Promise(r => setTimeout(r, 500));
      return [...document.querySelectorAll(".etat-piste")].map(t => t.dataset.nom).filter(Boolean);
    });
    verifier("ELLE IGNORE LA CRÉATURE QUE LE PANNEAU MONTRE",
             !v.includes("Paralysie"), v.join(" | "));
    await p.evaluate(() => {
      window.COMBAT_PERSOS_JOUEUR = window.COMBAT_PERSOS_JOUEUR_BACKUP;
      window.COMBAT_PERSOS_JOUEUR_BACKUP = null;
    });
  }
}

console.log("\n=========================================================");
console.log("  12. L'ENCART DE TOUR EST LIÉ À SON IMAGE");
console.log("=========================================================");
{
  // LA SURPRISE QU'ON VEUT ÉVITER, ET ELLE EST CONCRÈTE.
  //
  // La plaque de l'encart a sa largeur bornée par la fenêtre : sur un écran
  // étroit, elle se réduit. Si une seule mesure posée dessus était en pixels —
  // une taille de police, la largeur du pion — elle tiendrait bon pendant que
  // la plaque rétrécit autour d'elle, et le texte sortirait du cadre. C'est
  // exactement ce qui s'est produit sur le bandeau du bouton de fin de tour,
  // qui passe de 450 à 380 px sur tablette.
  //
  // ON NE MESURE DONC PAS DES PIXELS, MAIS DES RAPPORTS : chaque mesure divisée
  // par la largeur de l'image. Ces rapports doivent être les MÊMES à deux
  // largeurs de plaque différentes. C'est la définition de « lié à l'image ».
  const montrer = () => p.evaluate(async () => {
    window.ENCART_FIGE = true;
    document.getElementById("fenetre-combat").style.display = "block";
    await new Promise(r => setTimeout(r, 900));       // la surveillance le repose
  });
  await montrer();

  const rapports = () => p.evaluate(() => {
    const encart = document.getElementById("voile-tour-encart");
    const boite = encart.getBoundingClientRect();
    const L = boite.width;
    if (L <= 0) return null;
    const lire = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: +((r.left - boite.left) / L).toFixed(4),
        y: +((r.top - boite.top) / L).toFixed(4),
        large: +(r.width / L).toFixed(4),
        police: +(parseFloat(getComputedStyle(el).fontSize) / L).toFixed(4)
      };
    };
    return {
      largeur: Math.round(L),
      pion: lire("voile-tour-pion-boite"),
      nom: lire("voile-tour-nom"),
      carte: lire("voile-tour-carte"),
      detail: lire("voile-tour-bas"),
      effets: lire("voile-tour-effets"),
      attente: lire("voile-tour-attente"),
      etats: parseInt(document.getElementById("voile-tour-etats").dataset.taille || "0")
    };
  });

  const large = await rapports();
  verifier("l'encart est à l'écran et mesurable", !!large && large.largeur > 200,
           large ? `${large.largeur}px` : "absent");

  // On rétrécit la plaque comme le ferait un écran étroit.
  await p.evaluate(async () => {
    window.REGLAGES_HUD.encart.largeur = 420;
    window.appliquerReglagesHud();
    await new Promise(r => setTimeout(r, 400));
  });
  const etroit = await rapports();
  verifier("la plaque a bien rétréci", etroit.largeur < large.largeur - 100,
           `${large.largeur} → ${etroit.largeur}px`);

  // CHAQUE ÉLÉMENT EST JUGÉ SUR CE QUI LE CONCERNE. Un bloc de texte qui revient
  // à la ligne n'a pas une largeur RENDUE proportionnelle — c'est son cadre qui
  // doit l'être, et sa police. Exiger la largeur rendue d'un paragraphe serait
  // exiger que les mots se coupent au même endroit à deux échelles : faux, et
  // le contrôle échouerait en annonçant un défaut qui n'existe pas.
  const memeRapport = (quoi, a, b, cles) => {
    if (!a || !b) { verifier(`${quoi} est mesurable`, false); return; }
    const ecarts = cles
      .map(k => ({ k, d: Math.abs(a[k] - b[k]) }))
      .filter(e => e.d > 0.006);
    verifier(`${quoi} garde ses proportions`, ecarts.length === 0,
             ecarts.length ? ecarts.map(e => `${e.k} ${a[e.k]} → ${b[e.k]}`).join(", ")
                           : cles.map(k => `${k} ${b[k]}`).join(", "));
  };
  const PLACE = ["x", "y", "large"];
  const TOUT = ["x", "y", "large", "police"];
  memeRapport("LE PION", large.pion, etroit.pion, PLACE);
  memeRapport("LE NOM", large.nom, etroit.nom, TOUT);
  memeRapport("LE NOM DE LA TECHNIQUE", large.carte, etroit.carte, ["x", "y", "police"]);
  memeRapport("le cadre du détail", large.detail, etroit.detail, PLACE);
  memeRapport("LA POLICE DU DÉTAIL", large.effets, etroit.effets, ["police"]);
  memeRapport("la ligne d'attente", large.attente, etroit.attente, ["x", "y", "police"]);

  // LE FILET : tout ce qu'on ajouterait un jour sur la plaque sans lui écrire de
  // taille hériterait de la sienne. Elle doit suivre comme le reste, sinon le
  // défaut ne se verrait que le jour où quelqu'un ajoute une ligne.
  const heritee = await p.evaluate(() => {
    const e = document.getElementById("voile-tour-encart");
    return +(parseFloat(getComputedStyle(e).fontSize) / e.getBoundingClientRect().width).toFixed(4);
  });
  verifier("LA PLAQUE PORTE UNE POLICE QUI SUIT (filet pour ce qu'on ajoutera)",
           Math.abs(heritee - large.effets.police) < 0.006,
           `${heritee} contre ${large.effets.police} pour le détail`);

  // Les icônes d'état ne sont pas du CSS : une image se dimensionne à la
  // construction. Leur taille est donc calculée, et doit suivre elle aussi.
  verifier("ET LES ICÔNES D'ÉTAT SUIVENT (elles sont dimensionnées, pas mises en forme)",
           large.etats > 0 && etroit.etats > 0
           && Math.abs(large.etats / large.largeur - etroit.etats / etroit.largeur) < 0.006,
           `${large.etats}px sur ${large.largeur} → ${etroit.etats}px sur ${etroit.largeur}`);

  await p.evaluate(() => {
    window.REGLAGES_HUD.encart.largeur = 760;
    window.appliquerReglagesHud();
    window.ENCART_FIGE = false;
  });
}

console.log("\n=========================================================");
console.log("  13. LA BOÎTE DE RÉGLAGE NE SERT PLUS QU'À L'ENCART");
console.log("=========================================================");
{
  const boite = await p.evaluate(() => {
    // Les VRAIES lignes de réglage : celles qui portent des flèches ou des
    // boutons de taille. Le titre de la boîte, son sous-titre et le choix du pas
    // sont aussi des div, et les compter donnerait trois lignes de trop.
    const titres = [...document.querySelectorAll("#reglage-hud > div")]
      .filter(b => [...b.querySelectorAll("button")]
                     .some(x => ["◀", "▶", "▲", "▼", "−", "+"].includes(x.textContent)))
      .map(b => (b.firstChild && b.firstChild.textContent || "").trim());
    const ligne = (debut) => {
      const blocs = [...document.querySelectorAll("#reglage-hud > div")];
      const b = blocs.find(x => (x.firstChild && x.firstChild.textContent || "").startsWith(debut));
      if (!b) return null;
      return [...b.querySelectorAll("button")].map(x => x.textContent);
    };
    return {
      titres,
      medaillon: ligne("Médaillon"),
      avatar: ligne("Avatar en pied"),
      figer: [...document.querySelectorAll("#reglage-hud button")].some(b => /Figer/.test(b.textContent)),
      code: window.codeReglagesHud()
    };
  });

  // Les lignes du bloc du héros sont parties : leurs valeurs sont arrêtées et
  // inscrites dans le code. Le code qui les POSE, lui, reste — c'est lui qui
  // tient la mise à l'échelle sur tablette, et il n'a rien de provisoire.
  // Les intitulés du bloc du héros, à la lettre : « Avatar en pied (héros) »
  // appartient à l'encart et n'a rien à voir avec l'ancien « Avatar » du HUD.
  verifier("plus aucune ligne du bloc du héros",
           !boite.titres.some(t => /^(Anneau des jauges|Ancre chiffrée|Avatar$|Nom du héros|Piste des états)/.test(t)),
           boite.titres.join(" / "));
  verifier("HUIT LIGNES POUR L'ENCART", boite.titres.length === 8, `${boite.titres.length} : ${boite.titres.join(" / ")}`);

  // La demande explicite : le pion doit pouvoir être agrandi et réduit.
  // LES DEUX FORMES DU PORTRAIT ONT CHACUNE LEURS RÉGLAGES. Le médaillon se
  // place par son haut, l'avatar en pied par son bas : ce ne sont pas les mêmes
  // nombres, et chacun doit pouvoir être déplacé ET redimensionné à part.
  const complet = (l) => !!l && ["◀", "▶", "▲", "▼", "−", "+"].every(f => l.includes(f));
  verifier("LE MÉDAILLON A SES FLÈCHES ET SES DEUX TAILLES",
           complet(boite.medaillon), (boite.medaillon || []).join(" "));
  verifier("L'AVATAR EN PIED AUSSI", complet(boite.avatar), (boite.avatar || []).join(" "));

  verifier("un bouton fige l'encart pour pouvoir le régler", boite.figer === true);
  verifier("le code extrait donne les sept groupes de l'encart",
           ["encart ", "encartPion", "encartEtats", "encartNom", "encartCarte",
            "encartDetail", "encartAttente"].every(g => boite.code.includes(g)),
           boite.code.split("\n").length + " lignes");
  verifier("et il garde les valeurs du bloc du héros, qui restent posées",
           boite.code.includes("anneau") && boite.code.includes("avatar"));
}

verifier("aucune erreur JavaScript pendant tout le banc", erreurs.length === 0, erreurs.slice(0, 2).join(" | "));

await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
