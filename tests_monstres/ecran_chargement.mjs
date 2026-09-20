// LE SCEAU D'IVALIS : L'ÉCRAN DE CHARGEMENT, ET CE QU'IL CACHE.
//
// « Sur iPad et que sur iPad, au moment où je rentre le mot de passe pour
// charger une partie, ça met toujours au moins une minute avant de charger la
// page du jeu ; sur PC c'est instantané. »
//
// Deux réponses, et elles ne se recouvrent pas :
//
//   · LA CAUSE. Firestore parle par défaut en WebChannel, un flux permanent, et
//     quand ce flux ne s'établit pas — Safari sur iOS, un réseau mobile, un
//     routeur qui coupe les connexions longues — le client attend l'expiration
//     du délai avant de retomber sur le long polling. Cette attente-là, c'est la
//     minute. `experimentalAutoDetectLongPolling` fait SONDER la connexion au
//     lieu de la laisser échouer.
//
//   · LE RESTE DU TEMPS. Il reste, sur une tablette, une trentaine d'images à
//     décoder dont une carte de 2400 pixels de large. On ne peut pas les rendre
//     gratuites ; on peut les décoder AILLEURS QUE devant un joueur qui attend.
//     C'est le rôle du sceau : cinq secondes pendant lesquelles personne
//     n'attend rien, et où tout se prépare derrière.
//
// CE BANC SERT LA VRAIE PAGE. Les images sont bouchonnées (Cloudinary est
// injoignable d'ici) mais les requêtes, elles, sont comptées : c'est ce qui dit
// si le préchargement a vraiment eu lieu.
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

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

const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = (_a, options) => { globalThis.__OPTIONS_FIRESTORE = options; return {}; };
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

// Chaque image demandée à Cloudinary est COMPTÉE avant d'être bouchonnée :
// c'est la seule preuve que le préchargement a réellement tiré quelque chose.
const demandees = [];
await p.route('**', r => {
  const u = r.request().url();
  if (u.startsWith(base)) return r.continue();
  if (/firebase-app\.js/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: FAUX_APP });
  if (/firebase-firestore\.js/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: FAUX_FIRESTORE });
  if (/res\.cloudinary\.com/.test(u)) {
    demandees.push(u);
    if (/\/video\//.test(u)) return r.fulfill({ contentType: 'audio/mpeg', body: '' });
    return r.fulfill({ contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>` });
  }
  return r.abort();
});
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(1500);

// =========================================================================
console.log("\n1. LE TRANSPORT DE FIRESTORE EST SONDÉ, PAS SUBI");
// =========================================================================
//  C'est la cause de la minute, et elle tient dans une option posée à la
//  fabrication de la base — donc AVANT toute autre utilisation de Firestore.
{
  const options = await p.evaluate(() => globalThis.__OPTIONS_FIRESTORE || null);
  verifier("la base est fabriquée avec des options, pas par défaut", !!options,
           JSON.stringify(options));
  verifier("LE LONG POLLING EST DÉTECTÉ AU LIEU D'ÊTRE ATTENDU",
           !!options && options.experimentalAutoDetectLongPolling === true,
           JSON.stringify(options));

  // Et la source doit le dire : un `getFirestore(app)` qui reviendrait par
  // mégarde reprendrait le transport par défaut sans que rien ne le signale.
  const config = fs.readFileSync(RACINE + '/firebase-config.js', 'utf-8');
  verifier("et firebase-config.js ne refabrique pas la base par défaut",
           !/getFirestore\s*\(/.test(config));
}

// =========================================================================
console.log("\n2. LE SCEAU S'AFFICHE ENTRE L'ACCUEIL ET L'IDENTIFICATION");
// =========================================================================
{
  // Le sceau absent de la page n'est pas une exception à laisser remonter : le
  // banc doit le DIRE, pas mourir sur un getComputedStyle.
  const lire = () => p.evaluate(() => {
    const sceau = document.getElementById("ecran-sceau");
    const img = document.getElementById("sceau-ivalis");
    if (!sceau || !img) return { absent: true, affiche: false, opacite: 0,
                                 titreVisible: false, ecartCentreX: 9999, ecartCentreY: 9999,
                                 fond: "", clics: "", largeurLogo: 0, accueil: "" };
    const r = img.getBoundingClientRect();
    const s = getComputedStyle(sceau);
    return {
      affiche: s.display !== "none",
      opacite: +sceau.style.opacity || 0,
      accueil: document.getElementById("ecran-accueil").style.display,
      titreVisible: document.querySelector(".titre-etranger").classList.contains("visible"),
      // Le logo est-il vraiment AU CENTRE ? On le mesure, on ne lit pas une règle.
      ecartCentreX: Math.round((r.left + r.width / 2) - window.innerWidth / 2),
      ecartCentreY: Math.round((r.top + r.height / 2) - window.innerHeight / 2),
      largeurLogo: Math.round(r.width),
      fond: s.backgroundColor,
      clics: s.pointerEvents
    };
  });

  const avant = await lire();
  verifier("LE SCEAU EXISTE DANS LA PAGE", !avant.absent);
  verifier("avant le clic, il ne s'affiche pas", !avant.affiche);

  const t0 = Date.now();
  await p.evaluate(() => window.entrerDansLeJeu());

  // L'accueil met 1,5 s à s'effacer : le sceau ne doit pas lui passer devant.
  await p.waitForTimeout(700);
  const pendantAccueil = await lire();
  verifier("il attend que l'accueil ait fini de s'effacer", !pendantAccueil.affiche);

  await p.waitForTimeout(1300);          // ~2,0 s : le fondu d'entrée est en cours
  const entre = await lire();
  verifier("IL S'AFFICHE ENSUITE", entre.affiche, `à ${Date.now() - t0} ms`);
  verifier("sur un fond noir", entre.fond === "rgb(0, 0, 0)", entre.fond);
  verifier("le logo est au centre de l'écran",
           Math.abs(entre.ecartCentreX) <= 2 && Math.abs(entre.ecartCentreY) <= 2,
           `décalé de ${entre.ecartCentreX}, ${entre.ecartCentreY}`);
  verifier("et il ne mange aucun clic", entre.clics === "none", entre.clics);
  verifier("l'écran de sélection du joueur n'est pas encore là", !entre.titreVisible);

  // IL RESTE CINQ SECONDES EN FACE. On échantillonne au milieu de ces cinq
  // secondes : un sceau qui clignerait ou partirait trop tôt se verrait ici.
  await p.waitForTimeout(2500);          // ~4,5 s
  const milieu = await lire();
  verifier("IL TIENT CINQ SECONDES, pleinement opaque",
           milieu.affiche && milieu.opacite === 1, `opacité ${milieu.opacite}`);

  await p.waitForTimeout(3000);          // ~7,5 s : le fondu de sortie commence
  const sortie = await lire();
  verifier("puis il s'en va EN FONDU (il ne disparaît pas d'un coup)",
           sortie.affiche && sortie.opacite === 0, `affiché ${sortie.affiche}, opacité ${sortie.opacite}`);

  await p.waitForTimeout(1400);          // ~8,9 s : il est parti
  const apres = await lire();
  verifier("il est retiré de la page une fois le fondu fini", !apres.affiche);
  verifier("ET L'ÉCRAN DE SÉLECTION DU JOUEUR PREND SA PLACE", apres.titreVisible);
  console.log(`     le sceau a occupé l'écran de ~1,5 s à ~${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// =========================================================================
console.log("\n3. LE JEU SE CHARGE DERRIÈRE LE SCEAU");
// =========================================================================
//  C'est tout l'intérêt de ces cinq secondes. Sans ce préchargement, elles
//  seraient cinq secondes perdues ajoutées à l'attente qu'on cherche à réduire.
{
  const fait = await p.evaluate(() => window.PRECHARGEMENT_FAIT === true);
  verifier("le préchargement a bien été lancé", fait);

  const info = await p.evaluate(() => window.PRECHARGEMENT_INFO);
  console.log(`     ${info.images} image(s) ramassée(s), tirées en ${info.ms} ms`);

  // Les images de la table de jeu sont-elles demandées ? On cherche la plus
  // lourde de toutes, celle qui ne vit que dans la feuille de style.
  const carte = demandees.some(u => /map_/.test(u));
  verifier("LA CARTE, LA PLUS LOURDE, EST TIRÉE D'AVANCE", carte,
           `${info.images} image(s) ramassée(s)`);

  const fonds = demandees.filter(u => /ivalis_background|IMG_2057|brume|sable/.test(u)).length;
  verifier("les fonds déclarés en CSS le sont aussi", fonds >= 2, `${fonds} fond(s)`);

  const balises = await p.evaluate(() =>
    [...document.querySelectorAll('img[src^="https://res.cloudinary.com"]')].length);
  verifier("et les images des balises de la page", balises > 0, `${balises} balise(s)`);

  // ON NE PRÉCHARGE PAS LE BESTIAIRE, et c'est délibéré : sa lecture AMORCE les
  // gabarits manquants, donc elle ÉCRIT. Trois postes qui démarrent ensemble
  // déclencheraient trois salves d'écritures à chaque lancement, pour un besoin
  // qui ne se présente qu'au combat.
  const src = fs.readFileSync(RACINE + '/app.js', 'utf-8');
  const bloc = src.slice(src.indexOf("window.prechargerLeJeu = async function"),
                         src.indexOf("function entrerDansLeJeu"));
  verifier("le bestiaire N'EST PAS préchargé (sa lecture écrit en base)",
           !/chargerGabaritsMonstres/.test(bloc));

  // Rappelé deux fois, il ne doit pas tout retirer une seconde fois. On ne
  // compte pas les requêtes du navigateur pour le savoir — la page en fait
  // d'autres de son côté : on demande au préchargement ce qu'il a fait.
  const rejeu = await p.evaluate(async () => {
    const avant = window.PRECHARGEMENT_INFO.ms;
    window.PRECHARGEMENT_INFO.ms = -1;          // une marque qu'un rejeu écraserait
    await window.prechargerLeJeu();
    const inchange = window.PRECHARGEMENT_INFO.ms === -1;
    window.PRECHARGEMENT_INFO.ms = avant;
    return inchange;
  });
  verifier("et il ne se rejoue pas si on le rappelle", rejeu);
}

// =========================================================================
console.log("\n4. UNE MUSIQUE QUI NE PEUT PAS JOUER NE NOIE PAS LE RÉSEAU");
// =========================================================================
//  LE REPLI TENAIT EN UNE LIGNE, et il n'avait aucun compteur : si `play()`
//  était refusé, on passait au titre suivant — et la file se remplit toute
//  seule quand elle se vide. Un refus enchaînait donc la playlist entière, en
//  boucle, indéfiniment ; chaque essai appelle `load()`, qui va CHERCHER le
//  fichier.
//
//  Sur iOS, `play()` est refusé dès que le navigateur ne reconnaît pas de geste
//  de l'utilisateur, et ce refus tombe PILE au clic qui fait entrer dans le
//  jeu : la salve partait en même temps que la connexion à la base et les
//  images de la table. Mesuré ici, avec une lecture qui ne peut pas aboutir :
//  2443 requêtes audio en neuf secondes avant, 3 après.
{
  // Ici, la lecture échoue pour « format non reconnu » (les fichiers sont
  // bouchonnés), pas pour un refus d'autoplay : c'est donc le PIRE cas prévu —
  // chaque titre essayé une fois, puis on renonce. Le plafond se lit sur la
  // playlist elle-même ; un nombre écrit en dur mentirait au premier titre
  // ajouté. Les quelques requêtes en plus sont les sons de l'interface.
  const audio = demandees.filter(u => /\/video\/|\.mp3|\.m4a/.test(u));
  // La playlist est un module, pas une globale : on la compte à la source.
  const titres = (fs.readFileSync(RACINE + '/playlist.js', 'utf-8')
                    .match(/https:\/\//g) || []).length;
  const plafond = Math.max(titres, 1) + 5;   // un peu de marge pour les sons de clic
  verifier("LA PLAYLIST N'A PAS ÉTÉ PARCOURUE EN BOUCLE",
           audio.length <= plafond,
           `${audio.length} requête(s) audio pour ${titres} titre(s) — plafond ${plafond}`);

  // Et les deux garde-fous sont bien dans la source : un refus d'autoplay
  // arrête tout, un titre illisible ne fait essayer que les suivants, une fois
  // chacun. Sans le compteur, le premier garde-fou seul laisserait la boucle
  // intacte pour toute autre erreur de lecture.
  const src = fs.readFileSync(RACINE + '/app.js', 'utf-8');
  const bloc = src.slice(src.indexOf("function jouerProchaineMusique"),
                         src.indexOf("window.PRECHARGEMENT_FAIT"));
  verifier("un refus d'autoplay n'enchaîne pas sur le titre suivant",
           /NotAllowedError/.test(bloc));
  verifier("et les échecs de lecture sont comptés, puis abandonnés",
           /echecsMusiqueDAffilee\s*\+\+/.test(bloc)
           && /playlist\.length/.test(bloc));
}

// =========================================================================
console.log("\n5. LE CHEMIN DE CHARGEMENT SE CHRONOMÈTRE");
// =========================================================================
//  Si la minute revient, il faut pouvoir dire OÙ elle passe sans avoir à
//  brancher un iPad sur un ordinateur. Trois mesures suffisent : la base
//  répond-elle, l'écran se dessine-t-il, les fiches arrivent-elles.
{
  const src = fs.readFileSync(RACINE + '/app.js', 'utf-8');
  const jalons = [
    ["le mot de passe vérifié", /mot de passe vérifié en/],
    ["la table de jeu dessinée", /table de jeu dessinée en/],
    ["les premières fiches reçues", /premières fiches reçues en/]
  ];
  jalons.forEach(([nom, motif]) =>
    verifier("la console annonce " + nom, motif.test(src)));
}

// =========================================================================
console.log("\n6. LES BANCS QUI SERVENT LA VRAIE PAGE SUIVENT LA CONFIGURATION");
// =========================================================================
//  CHANGER CE QUE firebase-config.js IMPORTE A CASSÉ SEPT BANCS D'UN COUP, et
//  pas en disant pourquoi : le module ne se charge pas, donc rien du jeu ne
//  s'initialise, et le banc meurt sur un « n'est pas une fonction » à dix
//  écrans de là. Chaque banc qui sert la vraie page bouchonne Firestore ; le
//  bouchon doit offrir TOUTES les portes que la configuration emprunte.
{
  const config = fs.readFileSync(RACINE + '/firebase-config.js', 'utf-8');
  const importes = [...config.matchAll(/import\s*\{([^}]+)\}\s*from\s*"[^"]*firebase-firestore/g)]
      .flatMap(m => m[1].split(",").map(x => x.trim()).filter(Boolean));
  console.log(`     firebase-config.js importe : ${importes.join(", ")}`);

  const manques = [];
  for (const nom of fs.readdirSync(RACINE + '/tests_monstres').filter(f => f.endsWith('.mjs'))) {
    const banc = fs.readFileSync(RACINE + '/tests_monstres/' + nom, 'utf-8');
    // Un banc qui bouchonne déclare des `export` ; un banc qui ne fait que
    // PARLER du module (drapeau_regime lit les sources et cite son nom) n'en a
    // aucun, et n'a rien à offrir.
    if (!/firebase-firestore\.js/.test(banc)) continue;
    if (!/export const (doc|getDoc|getFirestore) /.test(banc)) continue;
    importes.forEach(sym => {
      if (!new RegExp("export (const|function|class) " + sym + "\\b").test(banc)) {
        manques.push(`${nom} : ${sym}`);
      }
    });
  }
  manques.forEach(m => console.log("     " + m));
  verifier("tous les bouchons Firestore offrent ce que la configuration importe",
           manques.length === 0, `${manques.length} manque(s)`);
}

// =========================================================================
console.log("\n7. LA CONFIGURATION FIREBASE EST VERSIONNÉE, ET D'UN SEUL NUMÉRO");
// =========================================================================
//  Les scripts de la page portent un numéro de version depuis toujours, mais
//  pas ce qu'ILS importent : un module chargé par `import` est rangé sous son
//  URL, et sans numéro, une tablette qui a déjà ouvert le jeu continue de
//  servir l'ancien fichier. Le réglage du transport n'arriverait jamais sur
//  l'appareil pour lequel il a été écrit.
//
//  ET UN SEUL NUMÉRO POUR TOUS. Deux numéros différents, ce sont DEUX modules
//  distincts aux yeux du navigateur, donc deux instances de Firestore dans la
//  même page, chacune avec ses écouteurs.
{
  const importeurs = fs.readdirSync(RACINE)
      .filter(f => f.endsWith('.js') && f !== 'firebase-config.js')
      .map(f => [f, fs.readFileSync(RACINE + '/' + f, 'utf-8')])
      .filter(([, src]) => /from\s+"\.\/firebase-config\.js/.test(src));

  const versions = new Map();
  importeurs.forEach(([nom, src]) => {
    const trouve = src.match(/from\s+"\.\/firebase-config\.js(\?v=(\d+))?"/);
    versions.set(nom, trouve && trouve[2] ? trouve[2] : "(aucune)");
  });
  const distinctes = [...new Set(versions.values())];
  [...versions].filter(([, v]) => v !== distinctes[0])
               .forEach(([n, v]) => console.log(`     ${n} : ${v}`));

  verifier("tous les fichiers du jeu l'importent", importeurs.length >= 10,
           `${importeurs.length} fichier(s)`);
  verifier("AVEC UN NUMÉRO DE VERSION", !distinctes.includes("(aucune)"),
           distinctes.join(", "));
  verifier("et tous le même", distinctes.length === 1, distinctes.join(" / "));
}

verifier("aucune erreur JavaScript pendant tout le banc", erreurs.length === 0,
         erreurs.slice(0, 2).join(" | "));

await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
