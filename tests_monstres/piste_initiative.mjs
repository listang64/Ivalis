// LA PISTE D'INITIATIVE — EN HAUT, ET ELLE NE PART PLUS
//
// Refonte UI combat, étape 2. La piste vivait accrochée au HUD du bas à droite
// et s'effaçait entre deux manches, c'est-à-dire précisément au moment où on
// choisit sa carte en fonction de l'ordre de passage. Elle est maintenant en
// haut, au centre, plus grande, et permanente.
//
// Ce banc sert la vraie page en HTTP (les modules ES refusent file://, comme
// pour demarrage_reel.mjs) et regarde le VRAI rendu, mesuré dans le navigateur :
//   • la piste est centrée en haut, hors du HUD du bas à droite ;
//   • elle reste affichée en préparation, dans l'ordre de la manche précédente,
//     tout le monde à opacité pleine ;
//   • celui qui a joué passe en retrait, celui dont c'est le tour scintille ;
//   • un ennemi porte son médaillon rond, à la taille des portraits voisins,
//     avec le même encart d'initiative et les mêmes jauges ;
//   • cliquer sur un portrait sélectionne toujours son pion sur la carte ;
//   • d'une manche à l'autre les portraits GLISSENT (le même élément change de
//     place) au lieu d'être reconstruits ;
//   • les pastilles d'état restent sous les portraits ;
//   • et sur le plateau, une créature porte l'image commune des ennemis ;
//   • sous le bandeau, une ombre au dégradé doux — MESURÉE AU PIXEL.
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

// Mêmes doublures Firebase que demarrage_reel.mjs : rien n'écrit nulle part,
// tout le reste (combat.js, mouvement.js, moteur_effets.js, competences.js)
// est le vrai code.
const FAUX_APP = `export const initializeApp = () => ({ nom: "faux" });`;
const FAUX_FIRESTORE = `
  // firebase-config.js fabrique la base avec des options (le transport sondé
  // plutôt que subi, pour l'iPad) : le bouchon doit donc offrir cette porte-là,
  // sinon le module ne se charge pas et rien du jeu ne s'initialise.
  export const initializeFirestore = () => ({ faux: true });
  export const getFirestore = () => ({ faux: true });
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {};
  export const updateDoc = async () => {};
  export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "neuf" });
  export const deleteField = () => "«champ supprimé»";
  export class FieldPath { constructor(...segments) { this.segments = segments; } }
  export const arrayUnion = (...v) => v;
  export const arrayRemove = (...v) => v;
  export const increment = (n) => n;
  export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({ a });
  export const where = (...a) => ({ a });
  export const orderBy = (...a) => ({ a });
  export const limit = (...a) => ({ a });
  export const writeBatch = () => ({ update: () => {}, set: () => {}, delete: () => {}, commit: async () => {} });
  export const runTransaction = async (_db, fn) => fn({
    get: async () => ({ exists: () => true, data: () => ({}) }), update: () => {}, set: () => {} });
  export const Timestamp = { now: () => Date.now() };
`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });

await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({
  contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({
  contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE }));

const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });


await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

// =========================================================================
//  LE MONDE : deux héros, deux créatures.
// =========================================================================
const monde = () => p.evaluate(() => {
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById("fenetre-combat").style.display = "block";

  window.jouerSonClic = () => {};
  window.estCombattantMort = (id) => (window.MORTS || []).includes(id);
  window.estMonstre = (id) => String(id).startsWith("M");
  window.sequenceTourEnAttente = () => false;
  window.MORTS = [];

  window.PLATEAU_VTT = {
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    hexToPixel: (q, r) => ({ x: 300 + q * 60, y: 300 + r * 60 }),
    pixelToHex: () => ({ q: 0, r: 0 }),
    renderMap: () => {}
  };
  window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;

  const fiche = (id, extra) => Object.assign({
    idPersonnage: id, prenom: id, camp: "Allié", PV_Max: 60, PV_Actuels: 60,
    Fatigue_Max: 100, fatigueActuelle: 100, Bouclier_Actuel: 0, Etats_Alteres: [],
    statut: "Vivant", Force: 10, Dexterite: 10, Intelligence: 10, Constitution: 10
  }, extra || {});

  window.PERSOS_PARTIE = [
    fiche("H1", { idJoueur: "P_01", prenom: "Cybile", urlCloudinary: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1786114507/Les_humains_h0ubwh.png" }),
    fiche("H2", { idJoueur: "P_02", prenom: "Pliors", PV_Actuels: 30 }),
    fiche("M1", { camp: "Ennemi", estMonstre: true, prenom: "Invocateur de saignées", PV_Max: 45, PV_Actuels: 45 }),
    fiche("M2", { camp: "Ennemi", estMonstre: true, prenom: "Chien des tombes", PV_Max: 40, PV_Actuels: 20 })
  ];
  // H1 a un portrait de fiche ET un token de plateau DIFFÉRENTS : c'est ce qui
  // permet de vérifier que la piste montre bien le second, pas le premier.
  window.TOKENS_VTT_DATA = {
    H1: { q: 0, r: 0, url: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1786114507/token_h1_rond.png" },
    H2: { q: 0, r: 1 }, M1: { q: 2, r: 0 }, M2: { q: 3, r: 0 }
  };
  window.TOKEN_SELECTIONNE = null;
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
  window.COMBAT_INDEX_PERSO = 0;
  window.ZONES_PERSISTANTES = {};
  window.CHEMIN_MOUVEMENT = [];
  window.REGIME_CERVEAU = true;
  window.PISTE_MANCHE = { manche: 0, ordre: [] };
  window.PARTIE_DATA = { Phase_Combat: "Preparation", Tour_Combat: 1,
                         Ordre_Initiative: ["H1", "H2", "M1", "M2"], File_Attente_Combat: [] };
  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
});

// La file d'une manche, telle que la préparation l'écrit (triée par initiative).
const manche = (n, ...entrees) => p.evaluate(({ n, entrees }) => {
  window.PARTIE_DATA.Tour_Combat = n;
  window.PARTIE_DATA.Phase_Combat = "Resolution";
  window.PARTIE_DATA.File_Attente_Combat = entrees;
  window.afficherPisteInitiative(entrees, "Resolution");
}, { n, entrees });

// La file avance : la tête a fini son tour.
const tourSuivant = () => p.evaluate(() => {
  const reste = window.PARTIE_DATA.File_Attente_Combat.slice(1);
  window.PARTIE_DATA.File_Attente_Combat = reste;
  window.afficherPisteInitiative(reste, "Resolution");
});

const finDeManche = (n) => p.evaluate((n) => {
  window.PARTIE_DATA.Tour_Combat = n;
  window.PARTIE_DATA.Phase_Combat = "Preparation";
  window.PARTIE_DATA.File_Attente_Combat = [];
  window.afficherPisteInitiative([], "Preparation");
}, n);

// Ce que la piste montre vraiment, mesuré dans la page.
const lirePiste = () => p.evaluate(() => {
  const piste = document.getElementById("piste-initiative");
  if (!piste) return null;
  const tuiles = [...piste.querySelectorAll(".piste-tuile")];
  return {
    rect: piste.getBoundingClientRect(),
    dansHudBasDroite: !!piste.closest("#combat-hud-bas-droite"),
    ombres: piste.querySelectorAll(".piste-ombre-sol").length,
    bandeaux: piste.querySelectorAll(".piste-fond").length,
    ordre: tuiles
      .slice()
      .sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left))
      .map(t => ({
        id: t.dataset.id,
        gauche: parseFloat(t.style.left),
        aJoue: t.classList.contains("a-joue"),
        opacite: parseFloat(getComputedStyle(t).opacity).toFixed(2),
        scintille: !!t.querySelector(".piste-scintillement"),
        initiative: (t.querySelector("span") || {}).innerText,
        couleurTexte: t.querySelector("span") ? getComputedStyle(t.querySelector("span")).color : null,
        couleurBordure: t.querySelector('div[style*="border-radius: 50%"][style*="z-index: 3"]')
          ? getComputedStyle(t.querySelector('div[style*="border-radius: 50%"][style*="z-index: 3"]')).borderTopColor
          : null,
        jauges: t.querySelectorAll('div[style*="rotate(30deg)"], div[style*="rotate(-30deg)"]').length,
        etats: t.querySelectorAll('img[src*="upload"]').length - (t.querySelector("img[src*='IMG_2137']") ? 1 : 0),
        rond: !!t.querySelector('div[style*="border-radius: 50%"][style*="overflow: hidden"]'),
        largeur: t.getBoundingClientRect().width
      }))
  };
});

await monde();

// =========================================================================
console.log("\n1. ELLE EST EN HAUT, AU CENTRE, ET PLUS DANS LE HUD DU BAS");
// =========================================================================
await manche(1, { idPersonnage: "M1", idCarte: "C_M1", initiative: 75 },
                { idPersonnage: "H1", idCarte: "C_H1", initiative: 50 },
                { idPersonnage: "H2", idCarte: "C_H2", initiative: 30 },
                { idPersonnage: "M2", idCarte: "C_M2", initiative: 20 });
await p.waitForTimeout(200);
{
  const v = await lirePiste();
  const largeurEcran = await p.evaluate(() => window.innerWidth);
  verifier("la piste n'est plus accrochée au HUD du bas à droite", v.dansHudBasDroite === false);
  verifier("elle est posée dans le haut de l'écran", v.rect.top < 120, `(top ${Math.round(v.rect.top)}px)`);

  // ELLE NE COLLE PLUS AU BORD. Les portraits touchaient le bord haut de
  // l'écran — sur tablette, la barre d'état passe juste au-dessus. La piste est
  // descendue, MAIS son bandeau doit continuer de sortir par le haut : c'est ce
  // qui lui donne l'air de pendre plutôt que de flotter. Les deux vont ensemble,
  // et c'est pour ça qu'ils sont vérifiés ensemble.
  {
    const marges = await p.evaluate(() => {
      const zone = document.getElementById("piste-initiative-zone");
      const fond = document.querySelector(".piste-fond");
      return { zone: Math.round(zone.getBoundingClientRect().top),
               hautDuBandeau: Math.round(fond.getBoundingClientRect().top) };
    });
    verifier("LA PISTE EST DESCENDUE DU BORD HAUT",
             marges.zone >= 12, `${marges.zone}px`);
    verifier("mais son bandeau sort toujours par le haut",
             marges.hautDuBandeau < 0, `haut du bandeau à ${marges.hautDuBandeau}px`);
  }
  const centre = v.rect.left + v.rect.width / 2;
  verifier("et centrée horizontalement", Math.abs(centre - largeurEcran / 2) < 6,
           `(centre ${Math.round(centre)} pour ${largeurEcran / 2})`);
  verifier("elle a son bandeau, un seul", v.bandeaux === 1, `(${v.bandeaux})`);
  verifier("et son ombre, une seule", v.ombres === 1, `(${v.ombres})`);
  verifier("les quatre combattants y sont", v.ordre.length === 4, JSON.stringify(v.ordre.map(x => x.id)));
  verifier("dans l'ordre d'initiative de la manche",
           v.ordre.map(x => x.id).join(",") === "M1,H1,H2,M2", v.ordre.map(x => x.id).join(","));
  verifier("chaque portrait est plus grand qu'avant (55 px)",
           v.ordre.every(x => x.largeur > 55), `(${Math.round(v.ordre[0].largeur)}px)`);
}

// =========================================================================
console.log("\n2. QUI JOUE, QUI A JOUÉ");
// =========================================================================
{
  let v = await lirePiste();
  verifier("celui dont c'est le tour scintille", v.ordre[0].scintille && v.ordre[0].id === "M1");
  verifier("et lui seul", v.ordre.filter(x => x.scintille).length === 1);
  verifier("personne n'a encore joué", v.ordre.every(x => !x.aJoue));

  await tourSuivant();
  // La mise en retrait est une TRANSITION de 0,35 s : mesurée trop tôt, on lit
  // une valeur intermédiaire. On laisse l'animation finir.
  await p.waitForTimeout(600);
  v = await lirePiste();
  verifier("celui qui vient de jouer passe en retrait", v.ordre[0].aJoue === true && v.ordre[0].id === "M1");
  verifier("son opacité descend à 0,7", v.ordre[0].opacite === "0.70", v.ordre[0].opacite);
  verifier("IL RESTE SUR LA PISTE au lieu d'en disparaître", v.ordre.length === 4);
  verifier("le scintillement passe au suivant", v.ordre[1].scintille && v.ordre[1].id === "H1");
  verifier("les autres gardent leur opacité pleine",
           v.ordre.slice(1).every(x => x.opacite === "1.00"), JSON.stringify(v.ordre.map(x => x.opacite)));
}

// =========================================================================
console.log("\n3. TOUT LE MONDE PORTE LE MÊME MÉDAILLON ROND, MÊME TAILLE, MÊME ENCART");
// =========================================================================
// Le héros portait un hexagone doré tiré du portrait de sa fiche ; il porte
// maintenant le même médaillon rond que les créatures, avec l'image de son
// TOKEN de plateau — celle qu'on reconnaît déjà sur la carte — et non plus
// le portrait de sa fiche.
{
  const v = await lirePiste();
  const m1 = v.ordre.find(x => x.id === "M1");
  const h1 = v.ordre.find(x => x.id === "H1");
  verifier("la créature porte un médaillon rond", m1.rond === true);
  verifier("LE HÉROS AUSSI, DÉSORMAIS — plus d'hexagone", h1.rond === true);
  verifier("et les deux font la même taille", Math.abs(m1.largeur - h1.largeur) < 1,
           `(${Math.round(m1.largeur)} vs ${Math.round(h1.largeur)})`);
  verifier("la créature a son chiffre d'initiative comme les autres", m1.initiative === "75", m1.initiative);
  verifier("et ses deux jauges penchées", m1.jauges === 2, String(m1.jauges));
  verifier("le héros aussi", h1.jauges === 2, String(h1.jauges));

  const img = await p.evaluate(() => {
    const t = document.querySelector('.piste-tuile[data-id="M1"] img');
    return t ? t.src : null;
  });
  verifier("son portrait est l'image commune des ennemis",
           !!img && img.includes("IMG_2137"), String(img));

  const imgH1 = await p.evaluate(() => {
    const t = document.querySelector('.piste-tuile[data-id="H1"] img');
    return t ? t.src : null;
  });
  verifier("LE HÉROS MONTRE L'IMAGE DE SON TOKEN, PAS LE PORTRAIT DE SA FICHE",
           !!imgH1 && imgH1.includes("token_h1_rond") && !imgH1.includes("Les_humains_h0ubwh"),
           String(imgH1));
}

// =========================================================================
console.log("\n4. CLIQUER SUR UN PORTRAIT SÉLECTIONNE TOUJOURS SON PION");
// =========================================================================
{
  await p.evaluate(() => { window.centrerCameraSurPerso = () => {}; });
  await p.evaluate(() => document.querySelector('.piste-tuile[data-id="H2"]').click());
  await p.waitForTimeout(150);
  const sel = await p.evaluate(() => window.TOKEN_SELECTIONNE);
  verifier("le pion visé devient le pion sélectionné", sel === "H2", String(sel));
}

// =========================================================================
console.log("\n5. LA MANCHE FINIT : LA PISTE RESTE, TOUT LE MONDE REVIENT");
// =========================================================================
{
  await finDeManche(2);
  await p.waitForTimeout(600);   // le retour à l'opacité pleine est lui aussi une transition
  const v = await lirePiste();
  verifier("LA PISTE NE DISPARAÎT PAS", v.ordre.length === 4, JSON.stringify(v.ordre.map(x => x.id)));
  verifier("tout le monde retrouve son opacité pleine",
           v.ordre.every(x => x.opacite === "1.00" && !x.aJoue), JSON.stringify(v.ordre.map(x => x.opacite)));
  verifier("plus personne ne scintille", v.ordre.every(x => !x.scintille));
  verifier("et l'ordre reste celui de la manche qui vient de finir",
           v.ordre.map(x => x.id).join(",") === "M1,H1,H2,M2", v.ordre.map(x => x.id).join(","));
}

// =========================================================================
console.log("\n6. NOUVELLE MANCHE : LES PORTRAITS GLISSENT, ILS NE RENAISSENT PAS");
// =========================================================================
{
  // On marque les éléments : s'ils sont reconstruits, la marque disparaît et
  // aucune transition ne peut jouer.
  await p.evaluate(() => {
    document.querySelectorAll(".piste-tuile").forEach(t => { t.dataset.marque = "avant"; });
  });
  const placesAvant = (await lirePiste()).ordre.reduce((a, x) => (a[x.id] = x.gauche, a), {});

  await manche(2, { idPersonnage: "H2", idCarte: "C_H2", initiative: 80 },
                  { idPersonnage: "M2", idCarte: "C_M2", initiative: 60 },
                  { idPersonnage: "M1", idCarte: "C_M1", initiative: 40 },
                  { idPersonnage: "H1", idCarte: "C_H1", initiative: 10 });
  await p.waitForTimeout(200);

  const v = await lirePiste();
  const marques = await p.evaluate(() =>
    [...document.querySelectorAll(".piste-tuile")].filter(t => t.dataset.marque === "avant").length);
  verifier("LES MÊMES ÉLÉMENTS SONT RÉUTILISÉS : ils peuvent donc glisser",
           marques === 4, `(${marques}/4 retrouvés)`);
  verifier("l'ordre suit la nouvelle initiative",
           v.ordre.map(x => x.id).join(",") === "H2,M2,M1,H1", v.ordre.map(x => x.id).join(","));
  verifier("et chacun a bien changé de place",
           v.ordre.some(x => placesAvant[x.id] !== x.gauche));
  verifier("la transition est déclarée sur la position",
           (await p.evaluate(() => getComputedStyle(document.querySelector(".piste-tuile")).transitionProperty))
             .includes("left"));
  verifier("les chiffres d'initiative sont ceux de la nouvelle manche",
           v.ordre.map(x => x.initiative).join(",") === "80,60,40,10",
           v.ordre.map(x => x.initiative).join(","));
}

// =========================================================================
console.log("\n7. LES ÉTATS RESTENT SOUS LES PORTRAITS");
// =========================================================================
{
  await p.evaluate(() => {
    window.PERSOS_PARTIE.find(x => x.idPersonnage === "H1").Etats_Alteres =
      [{ nom: "Brûlure", tours: 2, icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1786114507/Les_humains_h0ubwh.png" },
       { nom: "Glacé", tours: 1, icone: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1786114507/Les_humains_h0ubwh.png" }];
    window.afficherPisteInitiative(window.PARTIE_DATA.File_Attente_Combat, "Resolution");
  });
  await p.waitForTimeout(150);
  const sous = await p.evaluate(() => {
    const t = document.querySelector('.piste-tuile[data-id="H1"]');
    const portrait = t.getBoundingClientRect();
    const pastilles = [...t.querySelectorAll("img")].filter(i => i.getBoundingClientRect().top >= portrait.bottom - 6);
    return { nb: pastilles.length, basPiste: t.closest("#piste-initiative").getBoundingClientRect().bottom };
  });
  verifier("les deux pastilles sont bien SOUS le portrait", sous.nb === 2, `(${sous.nb})`);
}

// =========================================================================
console.log("\n8. SUR LE PLATEAU, UNE CRÉATURE PORTE L'IMAGE COMMUNE");
// =========================================================================
{
  const pion = await p.evaluate(() => {
    const t = document.getElementById("token-M1");
    if (!t) return null;
    const img = t.querySelector("img.token-img-main");
    return {
      src: img ? img.src : null,
      disqueRouge: !!t.querySelector(".token-disque-monstre"),
      nomEcrit: t.innerText.trim(),
      largeur: t.getBoundingClientRect().width,
      largeurHeros: document.getElementById("token-H1").getBoundingClientRect().width
    };
  });
  verifier("le pion existe", !!pion);
  verifier("le disque rouge nominatif a disparu", pion.disqueRouge === false);
  verifier("il porte IMG_2137", !!pion.src && pion.src.includes("IMG_2137"), String(pion.src));
  verifier("son nom n'est plus écrit dessus", pion.nomEcrit === "", `« ${pion.nomEcrit} »`);
  verifier("et il fait la taille d'un pion de joueur",
           Math.abs(pion.largeur - pion.largeurHeros) < 1,
           `(${Math.round(pion.largeur)} vs ${Math.round(pion.largeurHeros)})`);
}

// =========================================================================
console.log("\n9. UN COMBATTANT À TERRE QUITTE LA PISTE");
// =========================================================================
{
  await p.evaluate(() => {
    window.MORTS = ["M1"];
    window.afficherPisteInitiative(window.PARTIE_DATA.File_Attente_Combat, "Resolution");
  });
  await p.waitForTimeout(150);
  const v = await lirePiste();
  verifier("le tombé n'est plus sur la piste", v.ordre.every(x => x.id !== "M1"),
           v.ordre.map(x => x.id).join(","));
  // Les places restent régulières : le pas exact est un réglage, l'égalité des
  // intervalles est la règle.
  const ecarts = v.ordre.slice(1).map((x, i) => x.gauche - v.ordre[i].gauche);
  verifier("les autres se resserrent, à intervalles réguliers",
           v.ordre[0].gauche === 0 && ecarts.every(e => e === ecarts[0]),
           v.ordre.map(x => x.gauche).join(","));
}

// =========================================================================
console.log("\n10. UN ÉTAT SANS ICÔNE NE DESSINE PAS D'IMAGE CASSÉE");
// =========================================================================
// Repris de l'ancien banc de la piste, et toujours vrai : sous le portrait, un
// rectangle d'image cassée — et dans la console, GET .../undefined 404 en
// boucle, plusieurs fois par seconde. Les états posés par le cerveau
// n'emportent pas tous leur icône (l'Étalement, par exemple). Un état sans
// visage ne se dessine pas : il ne casse rien.
{
  const r = await p.evaluate(() => {
    window.MORTS = [];
    window.PERSOS_PARTIE.find(x => x.idPersonnage === "H1").Etats_Alteres =
      [{ nom: "Étourdi", duree: 2, icone: "https://images/etourdi.png" },
       { nom: "Étalement", duree: 1 }];
    window.afficherPisteInitiative(window.PARTIE_DATA.File_Attente_Combat, "Resolution");
    const tuile = document.querySelector('.piste-tuile[data-id="H1"]');
    return { images: [...tuile.querySelectorAll("img")].map(i => i.getAttribute("src")),
             html: tuile.innerHTML };
  });
  verifier("aucune image ne pointe vers « undefined »",
           !r.images.some(src => !src || /undefined/.test(src)), `(${r.images.join(", ")})`);
  verifier("et rien ne l'écrit dans le balisage non plus", !/src="undefined"/.test(r.html));
  verifier("l'état QUI A une icône est bien dessiné",
           r.images.some(src => /etourdi\.png$/.test(src)), `(${r.images.length} image(s))`);
}

// =========================================================================
console.log("\n11. LA PISTE SE MET À JOUR MÊME SI LA BASCULE TOMBE PENDANT L'ANIMATION");
// =========================================================================
// Repris de l'ancien banc. La fin du tour précédent s'anime encore quand la
// bascule en résolution arrive — et c'est fréquent, les créatures choisissant
// en dernier. Sans le rappel différé, la piste ne se remettait plus jamais à
// jour et le combat avait l'air figé.
{
  const r = await p.evaluate(async () => {
    window.PERSOS_PARTIE.find(x => x.idPersonnage === "H1").Etats_Alteres = [];
    const file = [{ idPersonnage: "H1", idCarte: "X", initiative: 99 },
                  { idPersonnage: "M1", idCarte: "X", initiative: 11 }];
    window.PARTIE_DATA.Tour_Combat = 9;
    window.PARTIE_DATA.File_Attente_Combat = file;

    window.ANIMATION_TOUR_EN_COURS = true;
    window.afficherPisteInitiative(file, "Resolution");
    const pendant = [...document.querySelectorAll(".piste-tuile")].map(t => t.dataset.id).join(",");

    // L'animation se termine. Aucune nouvelle notification ne viendra.
    window.ANIMATION_TOUR_EN_COURS = false;
    await new Promise(r => setTimeout(r, 800));
    return { pendant, apres: [...document.querySelectorAll(".piste-tuile")]
      .sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left))
      .map(t => t.dataset.id).join(",") };
  });
  verifier("rien ne bouge pendant l'animation", r.pendant !== "H1,M1", `(${r.pendant})`);
  verifier("la piste se remet à jour d'elle-même une fois l'animation finie",
           r.apres === "H1,M1", `(${r.apres})`);
}

// =========================================================================
console.log("\n12. BEAUCOUP DE COMBATTANTS : ELLE SE RESSERRE PLUTÔT QUE DE DÉBORDER");
// =========================================================================
// Centrée en haut, une piste trop large sortirait de l'écran DES DEUX CÔTÉS.
// Trois joueurs contre quatre créatures font déjà sept portraits, et une
// illusion ou un renfort en ajoutent.
{
  const r = await p.evaluate(async () => {
    const fiche = (id) => ({ idPersonnage: id, prenom: id, camp: id[0] === "M" ? "Ennemi" : "Allié",
      estMonstre: id[0] === "M", PV_Max: 50, PV_Actuels: 40, Fatigue_Max: 100, fatigueActuelle: 70,
      Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant" });
    const ids = ["H1","H2","H3","M1","M2","M3","M4","M5","M6","M7","M8","M9","M10","M11"];
    window.PERSOS_PARTIE = ids.map(fiche);
    window.PISTE_MANCHE = { manche: 0, ordre: [] };
    const file = ids.map((id, i) => ({ idPersonnage: id, idCarte: "X", initiative: 99 - i }));
    window.PARTIE_DATA.Tour_Combat = 20;
    window.PARTIE_DATA.File_Attente_Combat = file;
    window.afficherPisteInitiative(file, "Resolution");
    // La largeur de la piste est elle aussi une TRANSITION : mesurée tout de
    // suite, on lirait celle d'avant et le contrôle ne prouverait rien.
    await new Promise(r => setTimeout(r, 700));
    const piste = document.getElementById("piste-initiative");
    const r = piste.getBoundingClientRect();
    const tuiles = [...document.querySelectorAll(".piste-tuile")]
      .sort((a, b) => parseFloat(a.style.left) - parseFloat(b.style.left));
    return { tuiles: tuiles.length,
             pas: tuiles.length > 1 ? parseFloat(tuiles[1].style.left) - parseFloat(tuiles[0].style.left) : 0,
             gauche: r.left, droite: r.right, largeur: r.width, largeurEcran: window.innerWidth };
  });
  verifier("les quatorze combattants sont tous là", r.tuiles === 14, `(${r.tuiles})`);
  verifier("la piste occupe vraiment la largeur", r.largeur > 900, `(${Math.round(r.largeur)}px)`);
  verifier("le pas s'est resserré sous les 90 px d'usage", r.pas < 90 && r.pas >= 28, `(${r.pas.toFixed(1)}px)`);
  verifier("la piste ne déborde pas à gauche", r.gauche >= 0, `(${Math.round(r.gauche)}px)`);
  verifier("ni à droite", r.droite <= r.largeurEcran, `(${Math.round(r.droite)} ≤ ${r.largeurEcran})`);
}

// =========================================================================
console.log("\n13. L'OMBRE SOUS LE BANDEAU A VRAIMENT UN DÉGRADÉ DOUX");
// =========================================================================
// Sur iPad, le bandeau avait un bord net : aucune ombre. Et il n'y avait pas
// d'erreur de rendu — l'ombre était là, simplement invisible. C'était une
// bande de 14 px posée à 4 px du bas de la piste (haute de 104 px) alors que le
// bandeau descend jusqu'à 12 px du bas : elle n'en dépassait que HUIT pixels,
// déjà dilués par un flou de 9 px, sur un fond sombre.
//
// UN CONTRÔLE QUI LIT LE CSS NE PROUVERAIT RIEN : l'ancienne règle déclarait
// elle aussi un flou, en bonne et due forme. On regarde donc les VRAIS PIXELS.
// On pose un fond blanc sous la piste, on photographie une colonne d'un pixel
// de large juste sous le bandeau, et on renvoie l'image dans la page pour la
// relire à travers un canvas. Une ombre gaussienne, ça se reconnaît : sombre au
// ras du bandeau, puis de plus en plus clair, jusqu'au blanc.
{
  const cadre = await p.evaluate(async () => {
    // Le décor s'efface : seul le bandeau et son ombre doivent peindre ici.
    document.getElementById("conteneur-plateau-vtt").style.display = "none";
    document.getElementById("volet-competences").style.display = "none";
    document.getElementById("fenetre-combat").style.background = "#ffffff";

    // Quatre combattants : un bandeau large, mais pas jusqu'aux bords.
    const fiche = (id) => ({ idPersonnage: id, prenom: id, camp: id[0] === "M" ? "Ennemi" : "Allié",
      estMonstre: id[0] === "M", PV_Max: 50, PV_Actuels: 40, Fatigue_Max: 100, fatigueActuelle: 70,
      Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant" });
    const ids = ["H1", "H2", "M1", "M2"];
    window.PERSOS_PARTIE = ids.map(fiche);
    window.PISTE_MANCHE = { manche: 0, ordre: [] };
    const file = ids.map((id, i) => ({ idPersonnage: id, idCarte: "X", initiative: 99 - i }));
    window.PARTIE_DATA.Tour_Combat = 30;
    window.PARTIE_DATA.File_Attente_Combat = file;
    window.afficherPisteInitiative(file, "Resolution");
    await new Promise(r => setTimeout(r, 700));

    const fond = document.querySelector(".piste-fond");
    const ombre = document.querySelector(".piste-ombre-sol");
    const tuile = document.querySelector(".piste-tuile");
    const rf = fond.getBoundingClientRect();
    const ro = ombre.getBoundingClientRect();
    const rt = tuile.getBoundingClientRect();
    const piste = document.getElementById("piste-initiative");
    const sf = getComputedStyle(fond);
    const so = getComputedStyle(ombre);
    return {
      basDuBandeau: Math.round(rf.bottom), centre: Math.round(rf.left + rf.width / 2),
      basDesPortraits: Math.round(rt.bottom), hautDesPortraits: Math.round(rt.top),
      pisteDroite: Math.round(piste.getBoundingClientRect().right),
      largeurPiste: Math.round(piste.getBoundingClientRect().width),
      hauteurOmbre: Math.round(ro.height), hauteurTuile: Math.round(rt.height),
      centreOmbre: Math.round(ro.left + ro.width / 2),
      largeurOmbre: Math.round(ro.width), largeurBandeau: Math.round(rf.width),
      fondFlou: sf.backdropFilter || sf.webkitBackdropFilter,
      ombreAvantBandeau: [...piste.children].indexOf(ombre) < [...piste.children].indexOf(fond),
      // Ce qui doit être absent : tout ce qui dessinerait un contour.
      filtreOmbre: so.filter,
      ombrePorteeOmbre: so.boxShadow,
      bordureOmbre: so.borderTopWidth,
      fondOmbre: so.backgroundImage,
      boxShadowBandeau: sf.boxShadow
    };
  });

  verifier("LE BANDEAU N'A PLUS DE BACKDROP-FILTER",
           !cadre.fondFlou || cadre.fondFlou === "none", String(cadre.fondFlou));
  verifier("ni d'ombre portée à lui (elle dessinerait son rectangle)",
           !/\)\s*$/.test(cadre.boxShadowBandeau) || /inset/.test(cadre.boxShadowBandeau),
           cadre.boxShadowBandeau);

  // LA HAUTEUR EST UNE CONSIGNE, PAS UN GOÛT : la moitié d'un portrait.
  verifier("L'OMBRE FAIT LA MOITIÉ DE LA HAUTEUR D'UN PORTRAIT",
           Math.abs(cadre.hauteurOmbre - cadre.hauteurTuile / 2) <= 1,
           `${cadre.hauteurOmbre}px pour un portrait de ${cadre.hauteurTuile}px`);
  verifier("elle est centrée sous la piste",
           Math.abs(cadre.centreOmbre - cadre.centre) <= 1,
           `${cadre.centreOmbre} contre ${cadre.centre}`);
  // Le bandeau déborde lui aussi très largement de la piste depuis qu'il s'éteint
  // sur ses propres bords : c'est cette marge qui lui donne de la place pour
  // s'effacer au lieu de se couper net.
  verifier("le bandeau déborde largement de la piste, pour s'éteindre dans le vide",
           cadre.largeurBandeau > cadre.largeurPiste + 150,
           `bandeau ${cadre.largeurBandeau}px pour une piste de ${cadre.largeurPiste}px`);
  verifier("elle est posée AVANT le bandeau (sinon elle le noircirait)",
           cadre.ombreAvantBandeau === true);

  // CE CONTRÔLE PASSAIT TOUT SEUL, ET NE PROUVAIT RIEN. Sur une piste
  // construite de zéro, l'ombre est créée la première : l'ajouter à la fin ou
  // l'insérer au début revient au même, et le contrôle était vert quoi qu'on
  // écrive. Le cas qu'il doit garder est l'AUTRE : une piste déjà à l'écran, où
  // le bandeau existe et l'ombre non — un joueur qui recharge sur une nouvelle
  // version, exactement. Ajoutée à la fin, elle se retrouverait alors par-dessus
  // le bandeau, à le noircir. On reproduit donc ce cas-là.
  const apresRepose = await p.evaluate(async () => {
    const piste = document.getElementById("piste-initiative");
    piste.querySelector(".piste-ombre-sol").remove();
    window.afficherPisteInitiative(window.PARTIE_DATA.File_Attente_Combat, "Resolution");
    await new Promise(r => setTimeout(r, 300));
    const enfants = [...piste.children];
    const ombre = piste.querySelector(".piste-ombre-sol");
    const fond = piste.querySelector(".piste-fond");
    return { existe: !!ombre, avant: enfants.indexOf(ombre) < enfants.indexOf(fond),
             rang: enfants.indexOf(ombre), rangFond: enfants.indexOf(fond) };
  });
  verifier("l'ombre manquante est recréée", apresRepose.existe === true);
  verifier("ET ELLE SE GLISSE SOUS UN BANDEAU DÉJÀ EN PLACE",
           apresRepose.avant === true, `ombre ${apresRepose.rang}, bandeau ${apresRepose.rangFond}`);

  // AUCUNE FORME À SUIVRE, DONC AUCUNE BORDURE À VOIR. C'est la consigne, et
  // c'est la seule façon de la tenir par construction : un dégradé radial dont
  // l'alpha tombe à zéro avant le bord de la boîte. Ni filtre (WebKit les
  // compose mal en z-index négatif), ni box-shadow, ni bordure — tous les trois
  // épouseraient le rectangle et le rendraient visible dans le flou.
  verifier("L'OMBRE EST UN DÉGRADÉ RADIAL",
           /radial-gradient/.test(cadre.fondOmbre), cadre.fondOmbre.slice(0, 60));
  verifier("QUI S'ÉTEINT COMPLÈTEMENT AVANT LE BORD",
           /rgba\(0,\s*0,\s*0,\s*0\)/.test(cadre.fondOmbre), "alpha 0 en fin de dégradé");
  verifier("elle n'a ni filtre, ni ombre portée, ni bordure",
           cadre.filtreOmbre === "none" && cadre.ombrePorteeOmbre === "none"
           && parseFloat(cadre.bordureOmbre) === 0,
           `${cadre.filtreOmbre} / ${cadre.ombrePorteeOmbre} / ${cadre.bordureOmbre}`);

  // LES PHOTOS. Nico, sur son iPad : « l'ombre est trop opaque, les bords trop
  // nets, l'épaisseur trop grande — je veux quelque chose de beaucoup plus
  // discret et diffus. » C'était exact, et c'était mesurable : sous les
  // portraits, le voile tombait à 5/255 sur blanc (presque du noir), il se
  // coupait d'un coup — 40 niveaux de gris entre deux pixels voisins en bas,
  // 186 sur le côté — et cette coupure dessinait le rectangle arrondi du
  // bandeau. C'est ce que la retouche efface, et ce sont ces trois nombres-là
  // que le banc surveille.
  //
  // ON EFFACE TOUT LE RESTE avant de photographier : les portraits eux-mêmes et
  // les autres pièces de l'écran de combat. La piste garde sa largeur (elle est
  // posée sur le conteneur, pas sur les tuiles), donc le voile ne bouge pas d'un
  // pixel — mais plus rien ne vient peindre dans la colonne mesurée.
  await p.evaluate(async () => {
    [...document.getElementById("fenetre-combat").children].forEach(e => {
      if (e.id !== "piste-initiative-zone") e.style.display = "none";
    });
    document.querySelectorAll(".piste-tuile").forEach(t => { t.style.visibility = "hidden"; });
    await new Promise(r => setTimeout(r, 200));
  });

  const enGris = async (clip) => {
    const photo = await p.screenshot({ clip });
    return await p.evaluate(async (b64) => {
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      const toile = document.createElement("canvas");
      toile.width = img.width; toile.height = img.height;
      const ctx = toile.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, img.width, img.height).data;
      const sorties = [];
      const n = img.width === 1 ? img.height : img.width;
      for (let k = 0; k < n; k++) {
        const i = k * 4;
        sorties.push(Math.round((d[i] + d[i + 1] + d[i + 2]) / 3));
      }
      return sorties;
    }, photo.toString("base64"));
  };
  const pireMarche = (v) => v.slice(1).reduce((m, x, i) => Math.max(m, Math.abs(x - v[i])), 0);

  // ① EN DESCENDANT : une colonne d'un pixel, du bas des portraits à 120 px
  //    dessous. Le voile doit y être léger, s'éclaircir sans à-coup, et avoir
  //    complètement disparu avant d'être devenu une épaisseur.
  const colonne = await enGris({ x: cadre.centre, y: cadre.basDesPortraits, width: 1, height: 120 });
  const plusSombre = Math.min(...colonne);
  const reculs = colonne.slice(1).filter((v, i) => v < colonne[i] - 2).length;
  const finDuVoile = colonne.findIndex(v => v >= 250);

  verifier("SOUS LES PORTRAITS, LE VOILE EST LÉGER, PLUS UNE MASSE NOIRE",
           plusSombre >= 100, `${plusSombre}/255 au plus sombre`);
  verifier("IL S'ÉCLAIRCIT SANS LA MOINDRE MARCHE",
           pireMarche(colonne) <= 12, `${pireMarche(colonne)} niveaux entre deux pixels voisins`);
  verifier("et sans jamais s'assombrir en descendant", reculs === 0, `${reculs} recul(s)`);
  verifier("SON ÉPAISSEUR RESTE CONTENUE : éteint en moins de 60 px",
           finDuVoile > 0 && finDuVoile <= 60, `${finDuVoile} px`);
  verifier("mais il s'étale vraiment, ce n'est pas un trait",
           finDuVoile >= 20, `${finDuVoile} px`);
  console.log(`     profil en descendant : ${colonne.slice(0, 60).filter((_, i) => i % 4 === 0).join(" ")}`);

  // ② SUR LE CÔTÉ : une ligne d'un pixel, du bord droit de la piste vers le
  //    vide. C'est là que le bandeau se coupait le plus violemment — 186
  //    niveaux d'un pixel à l'autre, soit le bord franc qu'on voyait à l'œil.
  const ligne = await enGris({ x: cadre.pisteDroite - 4, y: cadre.hautDesPortraits + 40, width: 120, height: 1 });
  verifier("SUR LE CÔTÉ AUSSI, LE VOILE S'ÉTEINT SANS BORD",
           pireMarche(ligne) <= 20, `${pireMarche(ligne)} niveaux entre deux pixels voisins`);
  verifier("et il y est déjà discret", Math.min(...ligne) >= 120, `${Math.min(...ligne)}/255`);
  console.log(`     profil sur le côté  : ${ligne.filter((_, i) => i % 6 === 0).join(" ")}`);
}

// =========================================================================
console.log("\n14. LE CERCLE D'INITIATIVE PREND LA COULEUR DU PALIER");
// =========================================================================
// Nico voulait repérer d'un coup d'œil un Boss qui s'apprête à jouer, sans
// lire son nom : Petit en gris, Normal en blanc, Élite en jaune, Boss en
// rouge. Un héros n'a pas de palier (voir combat_etat.js) et garde l'or
// d'origine.
{
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };

  await p.evaluate(() => {
    const fiche = (id, palier) => ({ idPersonnage: id, prenom: id, camp: "Ennemi", estMonstre: true,
      Palier: palier, PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 100, fatigueActuelle: 100,
      Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant" });
    window.PERSOS_PARTIE = [
      { idPersonnage: "H1", prenom: "Cybile", camp: "Allié", PV_Max: 60, PV_Actuels: 60,
        Fatigue_Max: 100, fatigueActuelle: 100, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant" },
      fiche("M_PETIT", "Petit"), fiche("M_NORMAL", "Normal"),
      fiche("M_ELITE", "Élite"), fiche("M_BOSS", "Boss")
    ];
    window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, M_PETIT: { q: 1, r: 0 }, M_NORMAL: { q: 2, r: 0 },
                               M_ELITE: { q: 3, r: 0 }, M_BOSS: { q: 4, r: 0 } };
    window.PISTE_MANCHE = { manche: 0, ordre: [] };
    const file = ["H1", "M_PETIT", "M_NORMAL", "M_ELITE", "M_BOSS"]
      .map((id, i) => ({ idPersonnage: id, idCarte: "X", initiative: 90 - i * 10 }));
    window.PARTIE_DATA.Tour_Combat = 40;
    window.PARTIE_DATA.File_Attente_Combat = file;
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    window.afficherPisteInitiative(file, "Resolution");
  });
  await p.waitForTimeout(200);
  const v = await lirePiste();
  const parId = Object.fromEntries(v.ordre.map(x => [x.id, x]));

  verifier("Petit : cercle gris", parId.M_PETIT.couleurBordure === rgb("#a8a8a8"), parId.M_PETIT.couleurBordure);
  verifier("Normal : cercle blanc", parId.M_NORMAL.couleurBordure === rgb("#ffffff"), parId.M_NORMAL.couleurBordure);
  verifier("Élite : cercle jaune", parId.M_ELITE.couleurBordure === rgb("#f4c430"), parId.M_ELITE.couleurBordure);
  verifier("Boss : cercle rouge", parId.M_BOSS.couleurBordure === rgb("#e63946"), parId.M_BOSS.couleurBordure);
  verifier("le texte du chiffre suit la même couleur que la bordure (Boss)",
           parId.M_BOSS.couleurTexte === parId.M_BOSS.couleurBordure, parId.M_BOSS.couleurTexte);
  verifier("UN HÉROS N'A PAS DE PALIER : IL GARDE L'OR D'ORIGINE",
           parId.H1.couleurBordure === rgb("#e8d5a5"), parId.H1.couleurBordure);
}

verifier("aucune erreur JavaScript pendant tout le banc", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
