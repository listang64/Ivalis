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
//     450 à 380 px), à l'échelle près et sans qu'un seul élément se décale.
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
  verifier("le chiffre de vitalité est rouge", v.couleurGauche === "rgb(255, 139, 139)", v.couleurGauche);
  verifier("celui d'énergie est doré", v.couleurDroite === "rgb(251, 245, 189)", v.couleurDroite);
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
  verifier("il est bleu clair", v.couleurGauche === "rgb(189, 246, 255)", v.couleurGauche);
  verifier("son écusson aussi", v.ecussonGauche === "rgb(91, 232, 255)", v.ecussonGauche);
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
  verifier("avec sa couleur", v.couleurGauche === "rgb(255, 139, 139)", v.couleurGauche);
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

console.log("\n=========================================================");
console.log("  9. LA BOÎTE DE RÉGLAGE BOUGE CE QU'ELLE DIT QU'ELLE BOUGE");
console.log("=========================================================");
{
  // Cette boîte est un outil provisoire, mais c'est celui sur lequel repose tout
  // le calage du bloc : le disque du bouton est peint dans une image, sa taille
  // et sa place ne se lisent nulle part, et le premier essai à l'aveugle a visé
  // quinze pixels trop court — l'anneau avait entièrement disparu derrière le
  // bouton. Si ses flèches mentent, on règle dans le vide.
  //
  // LE PIÈGE EST DANS LES SIGNES. Plusieurs valeurs se comptent depuis le bord
  // DROIT ou le bord BAS : les augmenter déplace l'élément vers la gauche ou
  // vers le haut. Une flèche « ◀ » doit montrer ce qu'on VOIT, pas ce que la
  // valeur fait. On mesure donc des pixels à l'écran, jamais les nombres.
  const outils = await p.evaluate(() => ({
    boite: !!document.getElementById("reglage-hud"),
    poignee: !!document.getElementById("reglage-hud-poignee"),
    reglages: !!window.REGLAGES_HUD,
    appliquer: typeof window.appliquerReglagesHud === "function"
  }));
  verifier("la boîte de réglage est là", outils.boite === true);
  verifier("sa poignée aussi", outils.poignee === true);
  verifier("les réglages sont exposés", outils.reglages === true);

  // Un clic sur une flèche, par le titre de sa ligne et le signe du bouton.
  const cliquer = (titre, signe, fois = 1) => p.evaluate(async ([t, sg, n]) => {
    const blocs = [...document.querySelectorAll("#reglage-hud > div")];
    const bloc = blocs.find(b => (b.firstChild && b.firstChild.textContent || "").startsWith(t));
    if (!bloc) return "ligne introuvable : " + t;
    const b = [...bloc.querySelectorAll("button")].find(x => x.textContent === sg);
    if (!b) return "bouton introuvable : " + sg;
    for (let i = 0; i < n; i++) b.click();
    await new Promise(r => setTimeout(r, 120));
    return "ok";
  }, [titre, signe, fois]);

  const ou = (id) => p.evaluate((i) => {
    const r = document.getElementById(i).getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
             l: Math.round(r.width), h: Math.round(r.height) };
  }, id);

  // L'AVATAR : sa position se compte depuis le bord droit ET le bord bas, donc
  // les deux axes sont inversés. C'est exactement là qu'une flèche se trompe.
  {
    const avant = await ou("hud-avatar-heros");
    verifier("clic sur ◀ de l'avatar", (await cliquer("Avatar", "◀", 5)) === "ok");
    const apres = await ou("hud-avatar-heros");
    verifier("◀ DÉPLACE BIEN L'AVATAR VERS LA GAUCHE",
             apres.x < avant.x, `${avant.x} → ${apres.x}`);
    await cliquer("Avatar", "▶", 5);

    const avantH = await ou("hud-avatar-heros");
    await cliquer("Avatar", "▲", 5);
    const apresH = await ou("hud-avatar-heros");
    verifier("▲ le fait bien monter", apresH.y < avantH.y, `${avantH.y} → ${apresH.y}`);
    await cliquer("Avatar", "▼", 5);

    const avantT = await ou("hud-avatar-heros");
    await cliquer("Avatar", "+", 4);
    const apresT = await ou("hud-avatar-heros");
    verifier("« + » l'agrandit vraiment", apresT.h > avantT.h, `${avantT.h} → ${apresT.h}px`);
    await cliquer("Avatar", "−", 4);
  }

  // L'ANNEAU : diamètre et épaisseur, les deux réglages qui manquaient le plus.
  {
    const avant = await ou("hud-anneau-boite");
    await cliquer("Anneau des jauges", "+", 5);      // premier « + » = diamètre
    const apres = await ou("hud-anneau-boite");
    verifier("« + » AGRANDIT L'ANNEAU", apres.l > avant.l, `${avant.l} → ${apres.l}px`);
    verifier("et il reste centré au même endroit",
             Math.abs(apres.x - avant.x) <= 1 && Math.abs(apres.y - avant.y) <= 1,
             `${avant.x},${avant.y} → ${apres.x},${apres.y}`);
    await cliquer("Anneau des jauges", "−", 5);

    const trait = await p.evaluate(async () => {
      const lire = () => parseFloat(getComputedStyle(document.getElementById("hud-arc-gauche")).strokeWidth);
      const avant = lire();
      const blocs = [...document.querySelectorAll("#reglage-hud > div")];
      const bloc = blocs.find(b => (b.firstChild && b.firstChild.textContent || "").startsWith("Anneau"));
      const plus = [...bloc.querySelectorAll("button")].filter(x => x.textContent === "+");
      for (let i = 0; i < 4; i++) plus[1].click();   // second « + » = épaisseur
      await new Promise(r => setTimeout(r, 120));
      return { avant, apres: lire() };
    });
    verifier("l'épaisseur du trait se règle aussi",
             trait.apres > trait.avant, `${trait.avant} → ${trait.apres}`);
    await p.evaluate(async () => {
      const blocs = [...document.querySelectorAll("#reglage-hud > div")];
      const bloc = blocs.find(b => (b.firstChild && b.firstChild.textContent || "").startsWith("Anneau"));
      const moins = [...bloc.querySelectorAll("button")].filter(x => x.textContent === "−");
      for (let i = 0; i < 4; i++) moins[1].click();
      await new Promise(r => setTimeout(r, 120));
    });
  }

  // LE CODE À RENVOYER : c'est le seul chemin entre l'écran et le dépôt.
  {
    const code = await p.evaluate(() => {
      window.REGLAGES_HUD.anneau.diametre = 199;
      return window.codeReglagesHud();
    });
    verifier("le code extrait porte les valeurs réglées",
             code.includes("diametre: 199"), code.split("\n")[1]);
    verifier("il donne aussi les cinq groupes",
             ["anneau", "ancreGauche", "ancreDroite", "avatar", "nom"].every(g => code.includes(g)));
    verifier("et une forme recopiable d'un bloc", code.includes('"diametre":199'));
  }

  // LE RETOUR AUX VALEURS D'ORIGINE, pour ne jamais rester coincé sur un
  // réglage raté — les valeurs sont gardées d'une session à l'autre.
  {
    await p.evaluate(async () => {
      const b = [...document.querySelectorAll("#reglage-hud button")]
        .find(x => x.textContent.includes("Défaut"));
      b.click();
      await new Promise(r => setTimeout(r, 150));
    });
    const d = await p.evaluate(() => window.REGLAGES_HUD.anneau.diametre);
    verifier("« Défaut » remet tout en place", d === 180, String(d));
  }
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

verifier("aucune erreur JavaScript pendant tout le banc", erreurs.length === 0, erreurs.slice(0, 2).join(" | "));

await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
