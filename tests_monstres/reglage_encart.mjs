// L'OUTIL PROVISOIRE DE RÉGLAGE DE L'ENCART DE TOUR, ET LE BOUTON OK.
//
// Nico : « le bouton OK pour voir l'animation du personnage en cours, fais-le
// plus petit et mets-le en dessous de la barre d'initiative », et « crée-moi un
// bouton provisoire HUD avec des flèches pour changer la position et la taille
// des éléments de l'encart qui montre la technique qui va être lancée — de
// l'image de fond au texte — et un bouton pour extraire le code ».
//
// Sur la VRAIE page (les mêmes bouchons que hud_heros.mjs) : chaque flèche est
// cliquée et on mesure ce qui a VRAIMENT bougé à l'écran — l'élément visé, et
// lui seul ; le code extrait est relu comme du JavaScript.
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
      Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant" },
    // UN LEURRE POSÉ PAR MON HÉROS. Il porte SON ID_Joueur — à dessein : c'est
    // ce qui permet d'effacer ses illusions avec lui. Et il n'est pas une
    // créature. Tout ce qui demandait « mes héros » par le seul filtre du
    // joueur le ramassait donc avec eux.
    { idPersonnage: "ILLUSION_abc", camp: "Allié", idJoueur: "P_01", estIllusion: true,
      prenom: "Illusion de", nom: "Cybile",
      urlCloudinary: "https://res.cloudinary.com/dlkjq4kvg/image/upload/leurre.png",
      PV_Max: 1, PV_Actuels: 1, Fatigue_Max: 0, fatigueActuelle: 0,
      Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant" }
  ];
  window.PERSOS_PARTIE[0].idJoueur = "P_01";
  try { localStorage.setItem("ID_JOUEUR_COURANT", "P_01"); } catch (e) {}
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
  window.COMBAT_INDEX_PERSO = 0;
  window.PARTIE_DATA = { Phase_Combat: "Preparation", Tour_Combat: 1,
                         Ordre_Initiative: ["H1", "M1"], File_Attente_Combat: [] };
  window.actualiserHudHeros();
});
await p.waitForTimeout(500);


// =========================================================================
console.log("\n1. LE BOUTON OK : PETIT, CENTRÉ, JUSTE SOUS LA PISTE D'INITIATIVE");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    window.CACHE_COMPETENCES_GLOBAL = { M1: { C_M1: { Nom: "Hurlement putride",
      Composants: { actions: [{ zoneHexes: [{ q: 0, r: 0 }] }] },
      Effets_Compiles: [{ nom: "Mot de pouvoir", desc: "9 dégâts", isMod: false }] } } };
    window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"],
      File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "C_M1", initiative: 50 }] };
    window.EVENEMENT_ATTENDU = { acteur: "M1", idCarte: "C_M1", manche: 1, v: 1 };
    // L'étape « un OK à donner » : c'est elle, et elle seule, qui montre le bouton.
    window.etatSequenceTour = () => ({ okVisible: true, message: "", masquee: false });
    // Une piste d'une hauteur inhabituelle : le bouton doit suivre SON bas réel,
    // pas une valeur apprise par cœur.
    document.getElementById("piste-initiative").style.height = "150px";
    window.rafraichirVoileTour();
    await new Promise(res => setTimeout(res, 700));
    const ok = document.getElementById("voile-tour-ok");
    const piste = document.getElementById("piste-initiative").getBoundingClientRect();
    const b = ok.getBoundingClientRect();
    return { affiche: getComputedStyle(ok).display !== "none", haut: b.top, bas: b.bottom, hauteur: b.height,
             centre: b.left + b.width / 2, largeurFenetre: window.innerWidth, basPiste: piste.bottom,
             police: parseFloat(getComputedStyle(ok).fontSize) };
  });
  verifier("le OK est affiché quand l'étape le demande", r.affiche);
  verifier("il est juste sous la piste d'initiative (10 px)", Math.abs(r.haut - (r.basPiste + 10)) <= 1,
           `(haut ${r.haut.toFixed(0)}, bas de la piste ${r.basPiste.toFixed(0)})`);
  verifier("il est centré horizontalement", Math.abs(r.centre - r.largeurFenetre / 2) <= 2, `(${r.centre.toFixed(0)} / ${r.largeurFenetre / 2})`);
  verifier("il est petit (police 15 px, moins de 40 px de haut)", r.police <= 16 && r.hauteur < 40,
           `(police ${r.police}, hauteur ${r.hauteur.toFixed(0)})`);
  await p.evaluate(() => { delete window.etatSequenceTour; window.EVENEMENT_ATTENDU = null;
    window.PARTIE_DATA = { Phase_Combat: "Preparation", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"], File_Attente_Combat: [] };
    window.rafraichirVoileTour(); });
  await p.waitForTimeout(600);
}

// =========================================================================
console.log("\n2. LA POIGNÉE « ⚙ HUD » ET SA BOÎTE");
// =========================================================================
const clic = (sel) => p.evaluate((s) => {
  const el = typeof s === "string" ? document.querySelector(s) : null;
  el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
}, sel);
// Clique le bouton `texte` de la ligne `titre` de la boîte.
const clicLigne = (titre, texte, n = 1) => p.evaluate(({ titre, texte, n }) => {
  const blocs = [...document.querySelectorAll("#reglage-encart > div")];
  const bloc = blocs.find(b => b.firstChild && b.firstChild.firstChild && b.firstChild.firstChild.textContent === titre);
  if (!bloc) throw new Error("ligne introuvable : " + titre);
  const btn = [...bloc.querySelectorAll("button")].find(x => x.textContent === texte);
  for (let i = 0; i < n; i++) {
    btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    btn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  }
}, { titre, texte, n });
const clicBouton = (debut) => p.evaluate((debut) => {
  const btn = [...document.querySelectorAll("#reglage-encart button")].find(x => x.textContent.startsWith(debut));
  btn.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  btn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
}, debut);
const rect = (id) => p.evaluate((id) => { const r = document.getElementById(id).getBoundingClientRect();
  return { x: r.left, y: r.top, l: r.width, h: r.height, fs: parseFloat(getComputedStyle(document.getElementById(id)).fontSize) }; }, id);
{
  await p.waitForTimeout(800);
  const poignee = await p.evaluate(() => { const el = document.getElementById("reglage-encart-poignee");
    return el ? { vue: el.style.display === "block", texte: el.textContent } : null; });
  verifier("en combat, la poignée « ⚙ HUD » est là", !!poignee && poignee.vue && poignee.texte.includes("HUD"));
  await p.evaluate(() => document.getElementById("reglage-encart-poignee").click());
  const ouverte = await p.evaluate(() => document.getElementById("reglage-encart").style.display === "block");
  verifier("un clic ouvre la boîte de réglage", ouverte);
  const titres = await p.evaluate(() => [...document.querySelectorAll("#reglage-encart > div")]
    .map(b => b.firstChild && b.firstChild.firstChild ? b.firstChild.firstChild.textContent : "").filter(Boolean));
  for (const t of ["Plaque entière (fond + contenu)", "Image de fond seule", "Médaillon (créature)",
                   "Avatar en pied (héros)", "États", "Nom du combattant", "Nom de la technique",
                   "Détail de l'attaque", "Ligne d'attente"])
    verifier(`la boîte a une ligne « ${t} »`, titres.includes(t));
}

// =========================================================================
console.log("\n3. FIGER, PUIS TOUT BOUGER");
// =========================================================================
{
  await clicBouton("👁");
  await p.waitForTimeout(1500);   // plusieurs passages du veilleur : pas de clignotement
  const vu = await p.evaluate(() => { const v = document.getElementById("voile-tour-combat");
    return { vue: v.style.display === "block" && v.style.opacity === "1",
             nom: document.getElementById("voile-tour-nom").textContent,
             carte: document.getElementById("voile-tour-carte").textContent }; });
  verifier("« Figer » garde l'encart à l'écran, même sans tour en cours", vu.vue);
  // Ce qui est déjà affiché (le dernier tour) est gardé ; sinon, un exemple.
  verifier("avec quelque chose à régler dedans", vu.nom.length > 0 && vu.carte.length > 0, `${vu.nom} / ${vu.carte}`);

  // Le dernier tour était celui d'une créature : son médaillon est à l'écran.
  // Le bouton Portrait passe en avatar en pied pour pouvoir le régler.
  const formeAvant = await p.evaluate(() => document.getElementById("voile-tour-pion-boite").classList.contains("pion-avatar-entier"));
  await clicBouton("🧍");
  await p.waitForTimeout(700);
  const formeApres = await p.evaluate(() => document.getElementById("voile-tour-pion-boite").classList.contains("pion-avatar-entier"));
  verifier("le bouton Portrait bascule le portrait affiché en avatar en pied", formeAvant === false && formeApres === true);

  // Chaque élément bouge SEUL, dans le sens de la flèche.
  const cas = [
    ["Nom du combattant", "voile-tour-nom"], ["Nom de la technique", "voile-tour-carte"],
    ["Détail de l'attaque", "voile-tour-bas"], ["Ligne d'attente", "voile-tour-attente"],
    ["États", "voile-tour-etats"], ["Avatar en pied (héros)", "voile-tour-pion-boite"]
  ];
  for (const [titre, id] of cas) {
    const a = await rect(id), temoin = await rect(id === "voile-tour-nom" ? "voile-tour-carte" : "voile-tour-nom");
    await clicLigne(titre, "▶", 4); await clicLigne(titre, "▲", 4);
    const b = await rect(id), temoin2 = await rect(id === "voile-tour-nom" ? "voile-tour-carte" : "voile-tour-nom");
    verifier(`${titre} : ▶ va à droite, ▲ monte`, b.x > a.x + 1 && b.y < a.y - 1, `(${a.x.toFixed(0)},${a.y.toFixed(0)} → ${b.x.toFixed(0)},${b.y.toFixed(0)})`);
    verifier(`${titre} : le reste ne bouge pas`, Math.abs(temoin.x - temoin2.x) < 0.5 && Math.abs(temoin.y - temoin2.y) < 0.5);
  }
  const n0 = await rect("voile-tour-nom");
  await clicLigne("Nom du combattant", "+", 3);
  const n1 = await rect("voile-tour-nom");
  verifier("Nom du combattant : + agrandit la police", n1.fs > n0.fs, `(${n0.fs.toFixed(1)} → ${n1.fs.toFixed(1)})`);
  const d0 = await rect("voile-tour-effets");
  await clicLigne("Détail de l'attaque", "+", 3);
  const d1 = await rect("voile-tour-effets");
  verifier("Détail de l'attaque : + agrandit la police", d1.fs > d0.fs, `(${d0.fs.toFixed(1)} → ${d1.fs.toFixed(1)})`);

  // L'IMAGE DE FOND bouge seule : la plaque et le texte restent en place.
  const f0 = await rect("voile-tour-fond"), e0 = await rect("voile-tour-encart"), t0 = await rect("voile-tour-carte");
  await clicLigne("Image de fond seule", "◀", 4); await clicLigne("Image de fond seule", "+", 5);
  const f1 = await rect("voile-tour-fond"), e1 = await rect("voile-tour-encart"), t1 = await rect("voile-tour-carte");
  verifier("Image de fond : elle part à gauche et grandit", f1.x + f1.l / 2 < f0.x + f0.l / 2 - 1 && f1.l > f0.l + 1,
           `(largeur ${f0.l.toFixed(0)} → ${f1.l.toFixed(0)})`);
  verifier("Image de fond : la plaque et le texte ne bougent pas",
           Math.abs(e0.x - e1.x) < 0.5 && Math.abs(e0.l - e1.l) < 0.5 && Math.abs(t0.x - t1.x) < 0.5 && Math.abs(t0.y - t1.y) < 0.5);

  // LA PLAQUE ENTIÈRE emporte tout avec elle.
  const p0 = await rect("voile-tour-encart"), c0 = await rect("voile-tour-carte");
  await clicLigne("Plaque entière (fond + contenu)", "▶", 5);
  const p1 = await rect("voile-tour-encart"), c1 = await rect("voile-tour-carte");
  verifier("Plaque entière : ▶ emporte le texte avec elle", p1.x > p0.x + 1 && Math.abs((c1.x - c0.x) - (p1.x - p0.x)) < 1);

  // LE MÉDAILLON se règle aussi : on bascule l'exemple dans cette forme.
  await clicBouton("🧍");
  await p.waitForTimeout(700);
  const forme = await p.evaluate(() => document.getElementById("voile-tour-pion-boite").classList.contains("pion-avatar-entier"));
  verifier("et le rebascule en médaillon", forme === false);
  const m0 = await rect("voile-tour-pion-boite");
  await clicLigne("Médaillon (créature)", "+", 3); await clicLigne("Médaillon (créature)", "▼", 3);
  const m1 = await rect("voile-tour-pion-boite");
  verifier("Médaillon : + l'agrandit, ▼ le descend", m1.l > m0.l && m1.y > m0.y, `(${m0.l.toFixed(0)} → ${m1.l.toFixed(0)})`);
}

// La boîte ouverte sur l'encart figé, pour qu'on la voie comme le joueur.
await p.screenshot({ path: '/tmp/reglage_encart.png' });

// =========================================================================
console.log("\n4. EXTRAIRE LE CODE, LE GARDER, REVENIR AU DÉFAUT");
// =========================================================================
{
  await clicBouton("📋");
  const code = await p.evaluate(() => document.getElementById("reglage-encart-code").value);
  const r = await p.evaluate(() => JSON.parse(JSON.stringify(window.REGLAGES_HUD)));
  verifier("le code sort dans la boîte", code.includes("encartFond:") && code.includes("encartNom:"), code.split("\n")[0]);
  // Le code est du JavaScript valide, prêt à recopier dans REGLAGES_HUD.
  let relu = null;
  try { relu = new Function("return {" + code.split("\n").slice(1).join("\n") + "};")(); } catch (e) { relu = null; }
  verifier("et c'est un bloc qui se recopie tel quel dans hud_disposition.js", !!relu);
  verifier("avec les valeurs réglées", relu && JSON.stringify(relu.encartFond) === JSON.stringify(r.encartFond)
           && JSON.stringify(relu.encartNom) === JSON.stringify(r.encartNom), relu ? JSON.stringify(relu.encartFond) : "");

  const avant = r.encartNom;
  await p.reload(); await p.waitForTimeout(2000);
  const apres = await p.evaluate(() => window.REGLAGES_HUD.encartNom);
  verifier("un rechargement garde les réglages (sur cet appareil)", JSON.stringify(apres) === JSON.stringify(avant),
           JSON.stringify(apres));
  await p.evaluate(() => { document.getElementById("fenetre-combat").style.display = "block"; });
  await p.waitForTimeout(800);
  await p.evaluate(() => document.getElementById("reglage-encart-poignee").click());
  await clicBouton("↺");
  const defaut = await p.evaluate(() => ({ nom: window.REGLAGES_HUD.encartNom, fond: window.REGLAGES_HUD.encartFond }));
  verifier("« Défaut » remet les valeurs du code", defaut.nom.x === 21 && defaut.nom.y === 14 && defaut.fond.echelle === 100,
           JSON.stringify(defaut));
}

// =========================================================================
console.log("\n5. HORS COMBAT, RIEN");
// =========================================================================
{
  await p.evaluate(() => { document.getElementById("fenetre-combat").style.display = "none"; });
  await p.waitForTimeout(800);
  const cache = await p.evaluate(() => document.getElementById("reglage-encart-poignee").style.display === "none"
                                    && document.getElementById("reglage-encart").style.display === "none");
  verifier("la poignée et la boîte disparaissent hors combat", cache);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
