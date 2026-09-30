// L'EXPÉRIENCE ET LES NIVEAUX (experience.js).
//
// Nico : « nous allons implanter le système de points d'expérience » — la
// grille de niveaux (tableau 1 : 0, 700, 1 200, 1 800, 2 500, 3 300, 4 200,
// 5 200, 6 400, 7 900, puis +1 500 par niveau), « quand une compétence est
// gagnée on peut créer une nouvelle compétence mais la limite en main reste la
// même », « dans la fiche perso une belle jauge d'XP avec au-dessus le niveau »,
// « dans le panneau DEV deux flèches pour monter ou baisser de niveau en
// triche », et l'XP que chaque monstre mort donne à chaque membre de l'équipe
// (bestiaire : 40 / 100 / 240 / 800 selon la stature).
//
// Ce banc charge la VRAIE page (Firebase remplacé par un faux qui enregistre
// les écritures) et joue chaque morceau.
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
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data, options }); };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data }); };
  export const deleteDoc = async () => {};
  export const addDoc = async (col, data) => { (window.__messages = window.__messages || []).push(data); return { id: "n" }; };
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = (ref, cb) => { (window.__ecoutes = window.__ecoutes || []).push({ ref, cb }); return () => {}; };
  export const query = (...a) => ({a});
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



console.log("\n1. LA GRILLE DE NICO");
{
  const r = await p.evaluate(() => {
    const n = (xp) => window.niveauDepuisXP(xp);
    return {
      seuils: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(k => window.xpPourNiveau(k)),
      bords: [[0, n(0)], [699, n(699)], [700, n(700)], [1199, n(1199)], [1200, n(1200)], [7899, n(7899)],
              [7900, n(7900)], [9399, n(9399)], [9400, n(9400)], [10900, n(10900)]],
      comp: [1, 2, 3, 4, 5, 8, 9, 10, 11, 12].map(k => [k, window.competencesDeNiveau(k)]),
      gains: [1, 2, 3, 9, 10, 11, 15].map(k => [k, window.gainDuNiveau(k)]),
      palier: ["Petit", "Normal", "Élite", "Boss"].map(pa => window.xpDeLaCreature({ Palier: pa }))
    };
  });
  verifier("les seuils du tableau, puis +1 500 par niveau",
           JSON.stringify(r.seuils) === "[0,700,1200,1800,2500,3300,4200,5200,6400,7900,9400,10900,12400]", JSON.stringify(r.seuils));
  verifier("le niveau change pile au seuil",
           r.bords.every(([xp, niv]) => niv === ({ 0: 1, 699: 1, 700: 2, 1199: 2, 1200: 3, 7899: 9, 7900: 10, 9399: 10, 9400: 11, 10900: 12 })[xp]),
           JSON.stringify(r.bords));
  verifier("une compétence à créer aux niveaux 2, 4, 6, 8, 10, puis à chaque niveau",
           JSON.stringify(r.comp) === "[[1,0],[2,1],[3,1],[4,2],[5,2],[8,4],[9,4],[10,5],[11,6],[12,7]]", JSON.stringify(r.comp));
  verifier("les talents sont annoncés (pour plus tard)",
           r.gains[2][1] === "Talent mineur" && r.gains[3][1] === "Talent majeur" && /compétence/.test(r.gains[6][1]), JSON.stringify(r.gains));
  verifier("sans chiffre en base, une créature rapporte la grille : 40 / 100 / 240 / 800",
           JSON.stringify(r.palier) === "[40,100,240,800]", JSON.stringify(r.palier));
}

console.log("\n2. LA JAUGE DE LA FICHE, LE NIVEAU AU-DESSUS");
{
  const r = await p.evaluate(async () => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
    const fiche = document.getElementById("fenetre-fiche-perso");
    fiche.style.display = "flex"; fiche.style.left = "2vw"; fiche.style.top = "40px";
    window.PERSOS_PARTIE = [{ idPersonnage: "P1", prenom: "Cybile", nom: "Ardente", camp: "Allié", race: "Humain",
                              classe: "Oracle", PV_Max: 50, xp: 1450, Competences_Max: 6 }];
    window.PERSOS_JOUEURS_PARTIE = window.PERSOS_PARTIE;
    document.getElementById("champ-id-personnage").value = "P1";
    window.afficherStatsCombat(window.PERSOS_PARTIE[0]);
    await new Promise(r => setTimeout(r, 900));
    const b = document.getElementById("bandeau-xp-perso");
    const ordre = [...fiche.children].map(e => e.id || e.className);
    const rJ = b.querySelector(".xp-jauge").getBoundingClientRect();
    const rN = b.querySelector(".xp-niveau").getBoundingClientRect();
    return {
      niveau: b.querySelector(".xp-niveau-chiffre").textContent,
      largeur: parseFloat(b.querySelector(".xp-jauge-remplissage").style.width),
      texte: b.querySelector(".xp-jauge-texte").textContent,
      prochain: b.querySelector(".xp-prochain").textContent,
      dev: document.getElementById("dev-niveau-actuel").textContent,
      avantOnglets: ordre.indexOf("bandeau-xp-perso") > ordre.indexOf("fiche-perso-header")
                    && ordre.indexOf("bandeau-xp-perso") < ordre.indexOf("conteneur-onglets"),
      niveauAuDessus: rN.bottom <= rJ.top + 1,
      jaugeVisible: rJ.width > 200 && rJ.height >= 12,
      // Le nom du héros, centré en haut de la fiche et plus gros ; le niveau aussi plus gros.
      nomCentre: (() => { const t = document.getElementById("titre-nom-personnage").getBoundingClientRect();
                          const f = fiche.getBoundingClientRect();
                          return Math.abs((t.left + t.right) / 2 - (f.left + f.right) / 2); })(),
      tailleNom: parseFloat(getComputedStyle(document.getElementById("titre-nom-personnage")).fontSize),
      tailleNiveau: parseFloat(getComputedStyle(b.querySelector(".xp-niveau-chiffre")).fontSize),
      tailleMot: parseFloat(getComputedStyle(b.querySelector(".xp-niveau-mot")).fontSize)
    };
  });
  await p.screenshot({ path: "/tmp/claude-0/xp_fiche.png" });
  verifier("1 450 XP : niveau 3", r.niveau === "3", r.niveau);
  verifier("la jauge est remplie à 250 / 600 du niveau (41,7 %)", Math.abs(r.largeur - 41.67) < 0.1, String(r.largeur));
  verifier("elle dit « 1 450 / 1 800 XP »", r.texte.replace(/\s/g, " ") === "1 450 / 1 800 XP", r.texte);
  verifier("et ce qui vient ensuite", /Niveau 4 dans 350 XP : \+1 compétence/.test(r.prochain.replace(/\s/g, " ")), r.prochain);
  verifier("le niveau est au-dessus de la jauge", r.niveauAuDessus);
  verifier("sous l'en-tête, au-dessus des onglets (visible sur tous)", r.avantOnglets);
  verifier("une vraie jauge, bien visible", r.jaugeVisible);
  verifier("l'onglet DEV affiche le même niveau", r.dev === "Niveau 3", r.dev);
  verifier("le nom du héros est centré en haut de la fiche", r.nomCentre <= 2, `${r.nomCentre.toFixed(1)} px du centre`);
  verifier("et plus gros (24 px au lieu de 18)", r.tailleNom >= 24, `${r.tailleNom} px`);
  verifier("« Niveau 3 » plus gros (32 px / 16 px)", r.tailleNiveau >= 32 && r.tailleMot >= 16,
           `${r.tailleNiveau} / ${r.tailleMot}`);
}

console.log("\n3. LES FLÈCHES DE TRICHE DE L'ONGLET DEV");
{
  const r = await p.evaluate(async () => {
    window.__majs = [];
    const lire = () => ({ niveau: document.querySelector("#bandeau-xp-perso .xp-niveau-chiffre").textContent,
                          dev: document.getElementById("dev-niveau-actuel").textContent,
                          ecrit: (window.__majs[window.__majs.length - 1] || {}).data });
    const pas = [];
    document.getElementById("btn-dev-niveau-plus").click(); await new Promise(r => setTimeout(r, 100)); pas.push(lire());
    document.getElementById("btn-dev-niveau-moins").click(); await new Promise(r => setTimeout(r, 100)); pas.push(lire());
    document.getElementById("btn-dev-niveau-moins").click(); await new Promise(r => setTimeout(r, 100)); pas.push(lire());
    document.getElementById("btn-dev-niveau-moins").click(); await new Promise(r => setTimeout(r, 100)); pas.push(lire());
    const avantPlancher = window.__majs.length;
    document.getElementById("btn-dev-niveau-moins").click(); await new Promise(r => setTimeout(r, 100));
    return { pas, chemins: window.__majs.map(m => m.chemin), sousLeNiveau1: window.__majs.length !== avantPlancher };
  });
  const [haut, bas1, bas2, bas3] = r.pas;
  verifier("▲ : niveau 4, l'XP posée à 1 800", haut.niveau === "4" && haut.dev === "Niveau 4" && haut.ecrit && haut.ecrit.XP === 1800,
           JSON.stringify(haut));
  verifier("▼ : niveau 3 (1 200)", bas1.niveau === "3" && bas1.ecrit.XP === 1200, JSON.stringify(bas1));
  verifier("▼ : niveau 2 (700)", bas2.niveau === "2" && bas2.ecrit.XP === 700, JSON.stringify(bas2));
  verifier("▼ : niveau 1 (0)", bas3.niveau === "1" && bas3.ecrit.XP === 0, JSON.stringify(bas3));
  verifier("jamais sous le niveau 1", r.sousLeNiveau1 === false);
  verifier("chaque écriture va sur la fiche du héros", r.chemins.every(c => c === "Personnages/P1"), JSON.stringify(r.chemins));
}

console.log("\n4. UN NIVEAU DONNE DES COMPÉTENCES À CRÉER — PAS DE LA PLACE EN MAIN");
{
  const essai = (xp) => p.evaluate(async (xp) => {
    window.PERSOS_PARTIE[0].xp = xp;
    window.CACHE_COMPETENCES_GLOBAL = window.CACHE_COMPETENCES_GLOBAL || {};
    window.CACHE_COMPETENCES_GLOBAL.P1 = Object.fromEntries([1, 2, 3, 4, 5, 6].map(i => ["C" + i, { Nom: "Technique " + i, Initiative: i }]));
    await window.chargerOngletCompetences("P1", window.competencesMaxCombattant(window.PERSOS_PARTIE[0]));
    const btn = document.getElementById("btn-creer-competence");
    return { restantes: document.getElementById("affichage-competences-restantes").textContent,
             detail: document.getElementById("affichage-competences-niveau").textContent,
             enCombat: document.getElementById("affichage-competences-max").textContent,
             main: window.CARTES_MAX_PERSO, creations: window.CREATIONS_MAX_PERSO, actif: !btn.disabled };
  }, xp);
  const n1 = await essai(0), n4 = await essai(1800), n11 = await essai(9400);
  verifier("niveau 1, six techniques forgées : plus rien à créer", n1.restantes === "0" && !n1.actif && n1.detail === "", JSON.stringify(n1));
  verifier("niveau 4 : deux de plus à créer", n4.restantes === "2" && n4.actif && /dont 2 gagnées au niveau 4/.test(n4.detail),
           JSON.stringify(n4));
  verifier("niveau 11 : six de plus", n11.restantes === "6" && n11.creations === 12, JSON.stringify(n11));
  verifier("la limite en main ne bouge pas (6 en combat)", [n1, n4, n11].every(x => x.enCombat === "6" && x.main === 6),
           JSON.stringify([n1.main, n4.main, n11.main]));
}

console.log("\n5. LA VICTOIRE RAPPORTE L'XP DE CHAQUE CRÉATURE À CHAQUE HÉROS");
{
  const r = await p.evaluate(async () => {
    window.PERSOS_PARTIE = [
      { idPersonnage: "P1", prenom: "Cybile", camp: "Allié", PV_Max: 50, PV_Actuels: 50, xp: 0 },
      { idPersonnage: "P2", prenom: "Jade", camp: "Allié", PV_Max: 50, PV_Actuels: 0, statut: "Inconscient", xp: 0 },
      { idPersonnage: "ILL", prenom: "Illusion", camp: "Allié", estIllusion: true }
    ];
    window.MONSTRES_PARTIE = [
      { idPersonnage: "M1", Palier: "Petit", XP_Groupe: 40, statut: "Mort", PV_Max: 30, PV_Actuels: 0 },
      { idPersonnage: "M2", Palier: "Élite", XP_Groupe: 240, statut: "Vivant", PV_Max: 90, PV_Actuels: 0 },
      { idPersonnage: "M3", Palier: "Normal", statut: "Mort", PV_Max: 50, PV_Actuels: 0 },      // sans chiffre : la grille (100)
      { idPersonnage: "M4", Palier: "Boss", XP_Groupe: 800, statut: "Mort", estIllusion: true }  // un leurre ne compte pas
    ];
    window.estCombattantMort = (id) => {
      const x = [...window.PERSOS_PARTIE, ...window.MONSTRES_PARTIE].find(c => c.idPersonnage === id);
      return !!x && (x.statut === "Mort" || (x.PV_Max > 0 && x.PV_Actuels <= 0));
    };
    const total = window.xpDeLaVictoire();

    // Le poste qui GAGNE la transaction du butin.
    window.ID_PARTIE_COURANTE = "PARTIE_X";
    window.ioCombatFirestore = { lire: async () => null };
    window.servirDepuisLaReserve = () => ({ parPersonnage: {}, restants: [], utilise: false });
    window.__majs = [];
    let butin = null;
    window.modifierPartie = async (f) => { const s = f({ ID_Rencontre: "R1", Difficulte_Rencontre: "Normale" });
                                           butin = s && s.maj && s.maj.Butin; return s ? s.resultat : null; };
    await window.demarrerButin();
    const gagnant = window.__majs.map(m => [m.chemin, m.data.XP]);

    // Le poste qui PERD la course : rien d'écrit, rien de distribué.
    window.__majs = [];
    window.modifierPartie = async () => null;
    await window.demarrerButin();
    const perdant = window.__majs.length;

    // La fenêtre du butin l'annonce.
    let ligne = null;
    try {
      // Fin de combat : la fenêtre de combat est ouverte, les ennemis à terre.
      const fc = document.getElementById("fenetre-combat");
      if (fc) fc.style.display = "block";
      window.BUTIN_MASQUE_LOCALEMENT = null;
      window.afficherFenetreButin(butin);
      const el = document.getElementById("butin-xp");
      ligne = { texte: el.textContent, visible: getComputedStyle(el).display !== "none" };
    } catch (e) { ligne = { erreur: e.message }; }
    return { total, butinXp: butin && butin.xp, participants: butin && butin.participants, gagnant, perdant, ligne };
  });
  verifier("40 (Petit) + 240 (Élite) + 100 (Normal, par la grille) = 380 ; le leurre ne compte pas", r.total === 380, String(r.total));
  verifier("l'XP voyage avec le butin", r.butinXp === 380, String(r.butinXp));
  verifier("chaque héros la reçoit — y compris celui qui est tombé, pas le leurre",
           JSON.stringify(r.gagnant) === '[["Personnages/P1",380],["Personnages/P2",380]]', JSON.stringify(r.gagnant));
  verifier("le poste qui perd la course ne distribue rien (pas de double XP)", r.perdant === 0, String(r.perdant));
  verifier("la fenêtre du butin annonce « +380 XP pour chaque héros »",
           r.ligne && r.ligne.visible && /\+380 XP pour chaque héros/.test(r.ligne.texte), JSON.stringify(r.ligne));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
