// LA FABRIQUE : DIX SONS D'INTERFACE, DANS LES PARAMÈTRES.
//
// Nico : « dans les paramètres, crée-moi un bouton qu'on va appeler la
// Fabrique. Dedans, dix boutons qui jouent un son quand on appuie. » Puis :
// « remplace tous ces sons par des exemples de clic de menu sur un bouton —
// un léger ding, et des variations pour les dix boutons. »
//
// Les sons sont fabriqués sur place (Web Audio, fabrique_sons.js). Ce banc
// ouvre la Fabrique dans la vraie page, clique les dix boutons, et REND chaque
// son hors ligne (OfflineAudioContext) pour vérifier qu'il sonne, qu'il ne
// sature pas, qu'il est bref, et qu'aucun ne ressemble à un autre.
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


console.log("\n1. LE BOUTON DANS LES PARAMÈTRES, ET SON ÉCRAN");
{
  const r = await p.evaluate(async () => {
    const menu = document.getElementById("etape-menu-parametres");
    // Les Paramètres vivent dans l'écran de jeu : on y entre, comme à la table.
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => {
      e.style.display = e.id === "ecran-jeu" ? "block" : "none";
    });
    // Comme ouvrirParametres : le conteneur s'affiche, puis prend la classe
    // « ouvert » qui le fait apparaître.
    const conteneur = document.getElementById("conteneur-parametres");
    conteneur.style.display = "block";
    conteneur.classList.add("ouvert");
    document.getElementById("etape-mdp-parametres").style.display = "none";
    menu.style.display = "block"; menu.style.opacity = "1";
    const bouton = document.getElementById("btn-ouvrir-fabrique");
    const texte = bouton ? bouton.textContent.trim() : null;
    const dansLeMenu = !!bouton && menu.contains(bouton);
    bouton.click();
    await new Promise(r => setTimeout(r, 1100));
    const f = document.getElementById("etape-fabrique");
    const boutons = [...f.querySelectorAll(".btn-fabrique")];
    const rect = f.getBoundingClientRect();
    const auCentre = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { texte, dansLeMenu, opaciteConteneur: getComputedStyle(conteneur).opacity,
             vraimentVue: rect.width > 200 && rect.height > 300 && !!auCentre && f.contains(auCentre),
             taille: [Math.round(rect.width), Math.round(rect.height)], visible: getComputedStyle(f).display !== "none" && getComputedStyle(f).opacity === "1",
             menuCache: getComputedStyle(menu).display === "none",
             titre: f.querySelector("h2").textContent.trim(),
             noms: boutons.map(b => b.querySelector(".fabrique-nom").textContent.trim()),
             usages: boutons.map(b => b.querySelector(".fabrique-usage").textContent.trim()) };
  });
  await p.screenshot({ path: "/tmp/claude-0/fabrique.png" });
  verifier("un bouton « La Fabrique » dans le menu des Paramètres", r.dansLeMenu && r.texte === "La Fabrique", r.texte);
  verifier("il ouvre l'écran de la Fabrique", r.visible && r.menuCache && r.titre === "La Fabrique"
           && r.opaciteConteneur === "1", `opacité ${r.opaciteConteneur}`);
  verifier("et elle se voit vraiment, au-dessus de l'écran de jeu", r.vraimentVue, JSON.stringify(r.taille));
  verifier("dix boutons", r.noms.length === 10, String(r.noms.length));
  verifier("dix noms différents", new Set(r.noms).size === 10, r.noms.join(", "));
  verifier("chacun dit à quoi il sert", r.usages.every(u => u.length > 10));
}

console.log("\n2. CHAQUE BOUTON JOUE SON SON");
{
  const r = await p.evaluate(async () => {
    const appels = [];
    const vrai = window.jouerSonFabrique;
    window.jouerSonFabrique = (quel) => { appels.push(quel); return vrai(quel); };
    const retours = [];
    const boutons = [...document.querySelectorAll("#grille-fabrique .btn-fabrique")];
    for (const b of boutons) {
      b.click();
      retours.push(b.classList.contains("fabrique-joue"));
      await new Promise(r => setTimeout(r, 30));
    }
    window.jouerSonFabrique = vrai;
    // Le vrai joueur, dans un vrai contexte audio : il rend true s'il a joué.
    const joue = window.jouerSonFabrique(3);
    return { appels, retours, joue };
  });
  verifier("les dix boutons jouent chacun le leur, dans l'ordre", JSON.stringify(r.appels) === "[1,2,3,4,5,6,7,8,9,10]",
           JSON.stringify(r.appels));
  verifier("le bouton s'illumine quand il joue", r.retours.every(Boolean));
  verifier("le son part pour de vrai (contexte audio du navigateur)", r.joue === true);
}

console.log("\n3. LES DIX SONS, RENDUS HORS LIGNE : SOBRES, À LA MANIÈRE D'APPLE");
// Nico : « les sons de la Fabrique, ça ne va pas ; j'aimerais quelque chose de
// plus sobre, un peu comme les bruits Apple. » Très courts, très propres, une
// attaque nette, une seule idée par son, rien qui traîne.
{
  const sons = await p.evaluate(async () => {
    const taux = 44100;
    const mesures = [];
    for (const son of window.SONS_FABRIQUE) {
      const ctx = new OfflineAudioContext(1, Math.floor(taux * 1.6), taux);
      const sortie = ctx.createGain();
      sortie.gain.value = 1;
      sortie.connect(ctx.destination);
      son.fabriquer(ctx, sortie);
      const rendu = await ctx.startRendering();
      const d = rendu.getChannelData(0);
      let crete = 0, somme = 0, dernier = 0, iCrete = 0;
      for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i]);
        if (a > crete) { crete = a; iCrete = i; }
        somme += d[i] * d[i];
        if (a > 0.002) dernier = i;
      }
      const duree = dernier / taux;
      // L'attaque : la plus forte valeur des 3 premières millisecondes.
      let debutFort = 0;
      for (let i = 0; i < Math.floor(0.003 * taux); i++) debutFort = Math.max(debutFort, Math.abs(d[i]));
      // L'enveloppe, par tranches de 10 ms, et ses attaques (une tranche qui
      // remonte nettement au-dessus de la précédente).
      const tranche = Math.floor(taux / 100);
      const env = [];
      for (let t0 = 0; t0 + tranche <= d.length; t0 += tranche) {
        let e = 0; for (let i = t0; i < t0 + tranche; i++) e += d[i] * d[i];
        env.push(Math.sqrt(e / tranche));
      }
      const attaques = [];
      for (let k = 1; k < env.length; k++) {
        if (env[k] > 0.004 && env[k] > env[k - 1] * 1.25 && (k + 1 >= env.length || env[k + 1] <= env[k] * 1.6)) {
          let pic = env[k]; for (let j = k; j < Math.min(env.length, k + 4); j++) pic = Math.max(pic, env[j]);
          if (attaques.length === 0 || k - attaques[attaques.length - 1].k > 4) attaques.push({ k, pic });
        }
      }
      // La hauteur : passages par zéro, dans les tranches audibles.
      let n = 0, actif = 0;
      for (let t0 = 0; t0 + tranche <= dernier; t0 += tranche) {
        let e = 0; for (let i = t0; i < t0 + tranche; i++) e += d[i] * d[i];
        if (Math.sqrt(e / tranche) < 0.005) continue;
        actif += tranche;
        for (let i = t0 + 1; i < t0 + tranche; i++) if ((d[i - 1] < 0) !== (d[i] < 0)) n++;
      }
      const moitie = Math.floor(dernier / 2);
      let e1 = 0, e2 = 0;
      for (let i = 0; i < moitie; i++) e1 += d[i] * d[i];
      for (let i = moitie; i < dernier; i++) e2 += d[i] * d[i];
      // Le temps pour atteindre la moitié de la crête : la netteté de l'attaque.
      let iMoitie = 0;
      while (iMoitie < d.length && Math.abs(d[iMoitie]) < crete * 0.5) iMoitie++;
      mesures.push({ id: son.id, crete, tMoitie: iMoitie / taux, rms: Math.sqrt(somme / Math.max(1, dernier)), duree, tCrete: iCrete / taux,
                     attaque: debutFort / Math.max(crete, 1e-9), hauteur: actif ? n / (actif / taux) / 2 : 0,
                     paliers: attaques.map(a => +a.pic.toFixed(4)), finSurDebut: e2 / Math.max(e1, 1e-12) });
    }
    return mesures;
  });
  sons.forEach(m => console.log(`     ${m.id.padEnd(18)} crête ${m.crete.toFixed(2)}  durée ${m.duree.toFixed(2)} s  hauteur ~${Math.round(m.hauteur)} Hz  paliers ${m.paliers.length}`));
  const ANCIENS = ["goutte-rosee", "plume", "bulle", "souffle-verre", "echo-efface", "carillon-lointain",
                   "harpe-feutree", "petale", "brume", "pluie-notes"];
  verifier("dix nouveaux sons (plus aucun de la série « douce »)", sons.length === 10 && sons.every(m => !ANCIENS.includes(m.id)),
           sons.map(m => m.id).join(", "));
  verifier("aucun n'est muet", sons.every(m => m.crete > 0.02), sons.filter(m => m.crete <= 0.02).map(m => m.id).join());
  verifier("sobres : crête sous 0,3", sons.every(m => m.crete < 0.3), sons.map(m => m.crete.toFixed(2)).join(" "));
  verifier("brefs : aucun ne dépasse 0,8 s", sons.every(m => m.duree < 0.8), sons.map(m => m.duree.toFixed(2)).join(" "));
  const eclairs = sons.filter(m => m.duree < 0.2);
  verifier("la plupart sont des éclairs (au moins cinq sous 0,2 s)", eclairs.length >= 5, eclairs.map(m => m.id).join(", "));
  // Le souffle de l'Envoi enfle exprès ; tous les autres touchent d'emblée.
  const nets = sons.filter(m => m.id !== "envoi");
  verifier("nets : la moitié de la crête atteinte en moins de 15 ms", nets.every(m => m.tMoitie < 0.015),
           nets.map(m => `${m.id} ${(m.tMoitie * 1000).toFixed(1)}`).join(", "));
  // (Les remous d'un souffle ne sont pas des reprises : l'Envoi n'est pas compté.)
  verifier("rien qui traîne : ni écho ni cascade (deux attaques au plus)", nets.every(m => m.paliers.length <= 2),
           nets.map(m => `${m.id} ${m.paliers.length}`).join(", "));
  const proche = (a, b) => Math.abs(a - b) / Math.max(a, b, 1e-9) < 0.12;
  const jumeaux = [];
  for (let i = 0; i < sons.length; i++) for (let j = i + 1; j < sons.length; j++) {
    const a = sons[i], b = sons[j];
    if (proche(a.duree, b.duree) && proche(a.hauteur, b.hauteur) && proche(a.rms, b.rms) && a.paliers.length === b.paliers.length) jumeaux.push(a.id + "/" + b.id);
  }
  verifier("dix sons vraiment différents", jumeaux.length === 0, jumeaux.join(", "));
  const r = await p.evaluate(() => ({ perle: window.jouerSonFabrique("ding-perle"), liste: window.SONS_FABRIQUE.some(s => s.id === "ding-perle") }));
  verifier("le ding perle des boutons du jeu joue toujours, hors de la liste", r.perle === true && !r.liste);
}

console.log("\n4. LE VOLUME DU JEU FAIT LOI, ET LE RETOUR RAMÈNE AU MENU");
{
  const r = await p.evaluate(async () => {
    const avant = { ...window.PARAMETRES_AUDIO };
    window.PARAMETRES_AUDIO.interface = 0;
    window.rendreFabrique();
    const muet = getComputedStyle(document.getElementById("fabrique-muet")).display !== "none";
    const joue = window.jouerSonFabrique(1);
    Object.assign(window.PARAMETRES_AUDIO, avant);
    window.rendreFabrique();
    const muetApres = getComputedStyle(document.getElementById("fabrique-muet")).display !== "none";
    const retour = [...document.querySelectorAll("#etape-fabrique > button")].find(b => b.textContent.trim() === "Retour");
    retour.click();
    await new Promise(r => setTimeout(r, 1100));
    return { muet, joue, muetApres,
             menu: getComputedStyle(document.getElementById("etape-menu-parametres")).display !== "none",
             fabrique: getComputedStyle(document.getElementById("etape-fabrique")).display !== "none" };
  });
  verifier("volume de l'interface à zéro : on le dit, et rien ne joue", r.muet && r.joue === false);
  verifier("volume rendu : l'avertissement disparaît", !r.muetApres);
  verifier("« Retour » ramène au menu des Paramètres", r.menu && !r.fabrique);
}

console.log("\n5. LE DING PERLE REMPLACE LE BRUIT DE PARCHEMIN DANS TOUT LE JEU");
{
  // Nico : « je choisis le ding perle ; remplace tous les bruits de parchemin
  // actuels dans le jeu par ce ding perle ». Le parchemin était un seul
  // fichier (clik_bouton_aniy88.mp3), joué par jouerSonClic (tous les
  // boutons) et jouerSonSurvolParchemin (survol des menus, chat, combat).
  const html = fs.readFileSync(`${RACINE}/index.html`, "utf-8");
  const app = fs.readFileSync(`${RACINE}/app.js`, "utf-8");
  verifier("le fichier du parchemin n'est plus chargé nulle part",
           !/clik_bouton/.test(html) && !/clik_bouton/.test(app) && !/id="son-clic"|audio-survol-parchemin/.test(html));
  const r = await p.evaluate(async () => {
    const appels = [];
    const vrai = window.jouerSonFabrique;
    window.jouerSonFabrique = (quel, facteur) => { appels.push([quel, facteur === undefined ? 1 : facteur]); return true; };
    const suivre = async (geste) => { appels.length = 0; await geste(); return appels.slice(); };
    const clic = await suivre(() => window.jouerSonClic());
    const survol = await suivre(() => window.jouerSonSurvolParchemin());
    // Un vrai bouton de la page, avec son onclick « jouerSonClic(); … ».
    const bouton = await suivre(() => document.getElementById("btn-ouvrir-fabrique").click());
    // Un vrai bouton du menu latéral, survolé.
    const lateral = document.querySelector(".conteneur-bouton-lateral");
    const menu = await suivre(() => lateral.dispatchEvent(new MouseEvent("mouseenter")));
    window.jouerSonFabrique = vrai;
    return { clic, survol, bouton, menu, choisi: window.SON_CLIC_JEU,
             aMoitie: vrai("ding-perle", 0.5), aZero: vrai("ding-perle", 0) };
  });
  verifier("le son choisi pour le jeu est le ding perle", r.choisi === "ding-perle", r.choisi);
  verifier("un clic de bouton joue le ding perle", JSON.stringify(r.clic) === '[["ding-perle",1]]', JSON.stringify(r.clic));
  verifier("le survol des menus aussi, à mi-volume comme avant", JSON.stringify(r.survol) === '[["ding-perle",0.5]]',
           JSON.stringify(r.survol));
  verifier("un vrai bouton de la page le joue", r.bouton.some(a => a[0] === "ding-perle"), JSON.stringify(r.bouton));
  verifier("un vrai bouton du menu latéral, au survol, aussi", JSON.stringify(r.menu) === '[["ding-perle",0.5]]',
           JSON.stringify(r.menu));
  verifier("à mi-volume il joue, à volume nul il se tait", r.aMoitie === true && r.aZero === false);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
