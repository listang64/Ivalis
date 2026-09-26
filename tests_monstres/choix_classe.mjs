// LE CHOIX DE CLASSE, APRÈS LA RACE (classes.js).
//
// Nico : après le choix de la race, un panneau « Choix de Classe » — une grille
// de cartes de tarot 7:12 à bordure dorée, en rangées de 4, le nom en bas de
// chaque carte ; un clic ouvre la fiche de la classe sur son image de fond,
// avec un grand titre et un bouton de validation qui poursuit la création ;
// un bouton rond à flèche coudée, en haut à gauche, pour revenir. Une seule
// condition de code : object-fit: cover, jamais fill (fill étire l'image —
// c'est ce que faisait l'écran des races, corrigé au passage).
// Côté base : collection « Classes », champ « Classe » sur la fiche du héros,
// bouton « Installer les classes » dans les Paramètres.
// Retouches : la grille prend toute la largeur, cartes presque bord à bord,
// or plus sombre, barre de défilement invisible ; le titre de la fiche au
// milieu de la moitié gauche ; liens Cloudinary en « q_auto,f_auto ».
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
  // firebase-config.js fabrique la base avec des options (le transport sondé
  // plutôt que subi, pour l'iPad) : le bouchon doit donc offrir cette porte-là,
  // sinon le module ne se charge pas et rien du jeu ne s'initialise.
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data, options }); }; export const updateDoc = async () => {};
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
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'}, body: '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="1200"><rect width="700" height="1200" fill="#553311"/></svg>' }));
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

const etat = () => p.evaluate(() => {
  const vis = (id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== "none"; };
  return { races: vis("ecran-selection-race"), classes: vis("ecran-choix-classe"), grille: vis("vue-grille-classes"),
           fiche: vis("vue-fiche-classe"), identite: vis("modale-creation-hero") };
});

console.log("\n1. APRÈS LE GENRE, LE CHOIX DE CLASSE");
{
  await p.evaluate(() => { window.ouvrirCreationHero(); });
  const avant = await etat();
  verifier("on part de l'écran des races", avant.races && !avant.classes);
  const fondRace = await p.evaluate(() => getComputedStyle(document.getElementById("bg-selection-race")).objectFit);
  verifier("le fond de l'écran des races n'est plus étiré (cover)", fondRace === "cover", fondRace);
  await p.evaluate(() => window.validerRaceEtGenre("Femelle"));
  await p.waitForTimeout(400);
  const apres = await etat();
  verifier("le genre choisi ouvre la grille des classes (pas encore l'identité)",
           !apres.races && apres.classes && apres.grille && !apres.identite, JSON.stringify(apres));
}

console.log("\n2. LA GRILLE : 14 CARTES DE TAROT 7:12, BORDURE DORÉE, RANGÉES DE 4");
{
  const g = await p.evaluate(() => {
    const cartes = [...document.querySelectorAll("#grille-classes .carte-classe")];
    const r = cartes.map(c => c.getBoundingClientRect());
    const img = cartes[0] && cartes[0].querySelector("img");
    const nom = cartes[0] && cartes[0].querySelector(".carte-classe-nom");
    const st = cartes[0] ? getComputedStyle(cartes[0]) : {};
    return {
      noms: cartes.map(c => c.querySelector(".carte-classe-nom").textContent.trim()),
      ratio: r[0] ? r[0].height / r[0].width : 0,
      parRangee: r.filter(x => Math.abs(x.top - r[0].top) < 2).length,
      fit: img ? getComputedStyle(img).objectFit : null,
      bordure: st.borderTopColor, epaisseur: parseFloat(st.borderTopWidth),
      nomEnBas: nom ? Math.abs(nom.getBoundingClientRect().bottom - r[0].bottom) < 4 : false,
      gauche: r[0] ? r[0].left : 0, droite: r[3] ? innerWidth - r[3].right : 0,
      ecart: r[1] ? r[1].left - r[0].right : 99,
      barre: (() => { const v = document.getElementById("vue-grille-classes");
                      return { scw: getComputedStyle(v).scrollbarWidth, largeur: v.offsetWidth - v.clientWidth,
                               deborde: v.scrollHeight > v.clientHeight }; })(),
      srcs: cartes.map(c => c.querySelector("img").getAttribute("src")),
      titre: document.querySelector(".titre-choix-classe").textContent.trim()
    };
  });
  verifier("le titre « Choix de Classe » en haut", g.titre === "Choix de Classe", g.titre);
  verifier("14 classes, dans l'ordre donné", g.noms.length === 14 && g.noms[0] === "Pisteur" && g.noms[13] === "Élémentariste",
           g.noms.join(", "));
  verifier("orthographe : Géomancien, Nécromancien, Médicus, Élémentariste",
           ["Géomancien", "Nécromancien", "Médicus", "Élémentariste", "Chasseur de mages", "Mage du chaos"].every(n => g.noms.includes(n)));
  verifier("cartes au format tarot 7:12", Math.abs(g.ratio - 12 / 7) < 0.02, g.ratio.toFixed(3));
  verifier("rangées de 4", g.parRangee === 4, String(g.parRangee));
  verifier("image en object-fit: cover (jamais fill)", g.fit === "cover", g.fit);
  const [br, bg, bb] = (g.bordure.match(/\d+/g) || []).map(Number);
  verifier("bordure dorée, plus sombre que l'or vif d'avant (212,175,55)",
           br > bg && bg > bb && br >= 130 && br < 200 && g.epaisseur >= 2, `${g.bordure} ${g.epaisseur}px`);
  verifier("la grille prend toute la largeur (marges ≤ 8 px)", g.gauche <= 8 && g.droite <= 8,
           `gauche ${g.gauche.toFixed(1)} / droite ${g.droite.toFixed(1)}`);
  verifier("les cartes sont presque collées (écart ≤ 4 px)", g.ecart >= 0 && g.ecart <= 4, `${g.ecart.toFixed(1)} px`);
  verifier("la grille défile (plus haute que l'écran)", g.barre.deborde);
  verifier("sans barre de défilement visible", g.barre.scw === "none" && g.barre.largeur === 0, JSON.stringify(g.barre));
  verifier("les images passent par q_auto,f_auto (juste après /upload/)",
           g.srcs.every(u => /\/image\/upload\/q_auto,f_auto\/v\d+\//.test(u)), g.srcs.find(u => !/q_auto,f_auto/.test(u)) || "");
  verifier("le nom est posé en bas de chaque carte", g.nomEnBas);
}

console.log("\n3. LA FICHE DE CLASSE ET LA FLÈCHE COUDÉE");
{
  await p.click('.carte-classe[data-classe="CLASSE_GEOMANCIEN"]');
  await p.waitForTimeout(200);
  const f = await p.evaluate(() => {
    const fond = document.getElementById("fond-fiche-classe");
    const b = document.getElementById("btn-retour-classe").getBoundingClientRect();
    const t = document.getElementById("titre-fiche-classe").getBoundingClientRect();
    return { src: fond.src, fit: getComputedStyle(fond).objectFit, titre: document.getElementById("titre-fiche-classe").textContent,
             centreTitre: { x: (t.left + t.right) / 2 / innerWidth, y: (t.top + t.bottom) / 2 / innerHeight, droite: t.right / innerWidth },
             bouton: { gauche: b.left, haut: b.top, rond: getComputedStyle(document.getElementById("btn-retour-classe")).borderRadius },
             valider: getComputedStyle(document.getElementById("btn-valider-classe")).display !== "none" };
  });
  const e = await etat();
  verifier("un clic ouvre la fiche de la classe", e.fiche && !e.grille);
  verifier("sur son image de fond", /G%C3%A9omancien_fond/.test(f.src), f.src);
  verifier("en object-fit: cover", f.fit === "cover", f.fit);
  verifier("avec son grand titre", f.titre === "Géomancien", f.titre);
  verifier("titre au milieu de la moitié gauche de l'image",
           Math.abs(f.centreTitre.x - 0.25) < 0.03 && Math.abs(f.centreTitre.y - 0.5) < 0.05 && f.centreTitre.droite <= 0.5,
           JSON.stringify(f.centreTitre));
  verifier("le fond de la fiche aussi en q_auto,f_auto", /\/image\/upload\/q_auto,f_auto\/v\d+\//.test(f.src));
  verifier("et le bouton de validation", f.valider);
  verifier("bouton retour rond, dans le coin haut gauche", f.bouton.gauche < 40 && f.bouton.haut < 40 && f.bouton.rond === "50%",
           JSON.stringify(f.bouton));
  await p.click('#btn-retour-classe');
  const g = await etat();
  verifier("la flèche ramène de la fiche à la grille", g.grille && !g.fiche && g.classes);
  await p.click('#btn-retour-classe');
  const r = await etat();
  verifier("puis de la grille à l'écran des races", r.races && !r.classes);
}

console.log("\n4. VALIDER : LA CRÉATION CONTINUE, LA CLASSE EST RETENUE");
{
  await p.evaluate(() => window.validerRaceEtGenre("Male"));
  await p.waitForTimeout(300);
  await p.click('.carte-classe[data-classe="CLASSE_HOPLITE"]');
  await p.click('#btn-valider-classe');
  await p.waitForTimeout(200);
  const e = await etat();
  const champs = await p.evaluate(() => ({ classe: document.getElementById("champ-classe").value,
                                           genre: document.getElementById("champ-genre").value }));
  verifier("la validation ouvre l'étape d'identité", e.identite && !e.classes, JSON.stringify(e));
  verifier("avec la classe et le genre retenus", champs.classe === "Hoplite" && champs.genre === "Male", JSON.stringify(champs));
  const fiche = await p.evaluate(() => window.persoDocVersFront("PERSO_T", { Race: "Humain", Classe: "Hoplite" }).classe);
  verifier("la fiche du héros relit sa classe (champ « Classe »)", fiche === "Hoplite", String(fiche));
  const src = fs.readFileSync(`${RACINE}/app.js`, "utf-8");
  verifier("et l'écrit à la création", /Classe: donnees\.classe \|\| ""/.test(src));
  const cp = fs.readFileSync(`${RACINE}/creation_personnage.js`, "utf-8");
  verifier("la création transmet la classe (complète et rapide)", (cp.match(/classe: document\.getElementById\("champ-classe"\)/g) || []).length === 2);
}

console.log("\n5. LA BASE : INSTALLER LES CLASSES");
{
  const r = await p.evaluate(async () => {
    window.__ecrits = [];
    await window.installerClasses();
    return window.__ecrits;
  });
  verifier("14 documents écrits dans « Classes »", r.length === 14 && r.every(e => e.chemin.startsWith("Classes/")), String(r.length));
  verifier("en fusion (rien d'ajouté à la main n'est écrasé)", r.every(e => e.options && e.options.merge === true));
  const h = r.find(e => e.chemin === "Classes/CLASSE_HOPLITE");
  verifier("chaque document porte nom, images et ordre", !!h && h.data.Nom === "Hoplite" && /Hoplite_fond/.test(h.data.Image_Fond)
           && /IMG_2159/.test(h.data.Image_Tarot) && h.data.Ordre === 8, JSON.stringify(h && h.data));
  const lu = await p.evaluate(() => window.classeDepuisDocument("CLASSE_HOPLITE", { Nom: "Hoplite d'élite" }));
  verifier("un document incomplet est complété par la liste du jeu", lu.nom === "Hoplite d'élite" && /Hoplite_fond/.test(lu.imageFond));
  verifier("les documents installés portent déjà les liens optimisés", r.every(e => /q_auto,f_auto/.test(e.data.Image_Tarot) && /q_auto,f_auto/.test(e.data.Image_Fond)));
  const ancien = await p.evaluate(() => window.classeDepuisDocument("CLASSE_HOPLITE", {
    Image_Tarot: "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1790440202/IMG_2159_iligqv.jpg" }));
  verifier("un lien de la base SANS q_auto,f_auto le reçoit à la lecture",
           ancien.imageTarot === "https://res.cloudinary.com/dlkjq4kvg/image/upload/q_auto,f_auto/v1790440202/IMG_2159_iligqv.jpg", ancien.imageTarot);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
