// LE STUDIO D'ANIMATION.
//
// Nico : « dans les paramètres, un bouton Studio d'animation. Quand on clique,
// une fenêtre s'ouvre : à gauche la réplique de la map actuelle du mode combat,
// le token du joueur posé sur un hexagone central et, à côté, un token ennemi
// inerte ; à droite la liste des futures animations de combat que nous allons
// créer. Quand je clique sur une animation, ça la joue en direct sur mon
// token. Et pour chaque animation une petite case à cocher pour me rappeler si
// elle est intégrée ou non. »
//
// Ce banc pose une vraie carte de combat (image, taille d'hexagone, opacité,
// une case centrale gommée), ouvre le studio depuis les Paramètres, vérifie la
// réplique et les deux pions, joue CHAQUE animation du catalogue jusqu'au bout
// (et vérifie qu'elle ne laisse rien derrière elle), puis coche une case et la
// retrouve à la réouverture.
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
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(72)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async (ref) => { const d = (window.__docs || {})[ref.chemin]; return { exists: () => !!d, data: () => d || {} }; };
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data, options }); };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data }); };
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
// La carte du combat : un décor reconnaissable (dalles vertes et ocre).
const CARTE = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
  <rect width="1600" height="1200" fill="#3d5a2a"/><rect x="500" y="350" width="600" height="500" fill="#8a6a3a"/>
  <circle cx="800" cy="600" r="120" fill="#a8844a"/></svg>`;
const PION_HEROS = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="95" fill="#2a6ad8"/></svg>`;
const PION_ENNEMI = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="95" fill="#c41c1c"/></svg>`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
p.on('dialog', d => d.accept());
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => {
  const url = r.request().url();
  const corps = /carte-test/.test(url) ? CARTE : /heros-test/.test(url) ? PION_HEROS : PION_ENNEMI;
  return r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'}, body: corps });
});
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

console.log("\n=========================================================");
console.log("  LE STUDIO D'ANIMATION");
console.log("=========================================================");

// La partie : une carte de combat chargée, une case centrale gommée, un héros.
await p.evaluate(async () => {
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
  localStorage.setItem("ID_JOUEUR_COURANT", "J1");
  try { localStorage.removeItem("ivalis_studio_animations_integrees"); } catch (e) {}
  window.initialiserPlateau();
  const img = document.getElementById("image-map-vtt");
  await new Promise(r => { img.onload = r; img.src = "https://res.cloudinary.com/x/carte-test.svg"; });
  img.style.display = "block";
  window.PLATEAU_VTT.resize(1600, 1200);
  window.PLATEAU_VTT.hexSize = 50; window.PLATEAU_VTT.hexWidth = 100; window.PLATEAU_VTT.hexHeight = Math.sqrt(3) * 50;
  window.PLATEAU_VTT.gridOpacity = 0.6;
  window.PLATEAU_VTT.setCaseState(0, 0, { isDeleted: true });
  window.PERSOS_JOUEURS_PARTIE = [
    { idPersonnage: "H1", prenom: "Aldric", idJoueur: "J1", urlToken: "https://res.cloudinary.com/x/heros-test.svg" },
    { idPersonnage: "H2", prenom: "Bryn", idJoueur: "J2", urlToken: "https://res.cloudinary.com/x/heros-test.svg" }
  ];
  window.PERSOS_PARTIE = window.PERSOS_JOUEURS_PARTIE;
  window.TOKENS_VTT_DATA = { H1: { q: 3, r: 2, url: "https://res.cloudinary.com/x/heros-test.svg", taille: 48 } };
  window.IMAGE_TOKEN_ENNEMI = "https://res.cloudinary.com/x/ennemi-test.svg";
  window.__docs = { "Studio_Animations/etat": { Integrees: { "soin": true } } };
});

console.log("\n1. LE BOUTON DES PARAMÈTRES ET LA FENÊTRE");
{
  const r = await p.evaluate(async () => {
    const conteneur = document.getElementById("conteneur-parametres");
    conteneur.style.display = "block"; conteneur.classList.add("ouvert");
    document.getElementById("etape-mdp-parametres").style.display = "none";
    const menu = document.getElementById("etape-menu-parametres");
    menu.style.display = "block"; menu.style.opacity = "1";
    const bouton = document.getElementById("btn-ouvrir-studio");
    const dansLeMenu = !!bouton && menu.contains(bouton);
    bouton.click();
    await new Promise(r => setTimeout(r, 700));
    const f = document.getElementById("studio-animation");
    const rf = f.querySelector(".studio-cadre").getBoundingClientRect();
    const g = f.querySelector(".studio-gauche").getBoundingClientRect(), d = f.querySelector(".studio-droite").getBoundingClientRect();
    const auCentre = document.elementFromPoint(rf.left + rf.width / 2, rf.top + 40);
    return { dansLeMenu, texte: bouton.textContent.trim(), visible: getComputedStyle(f).display === "flex" && getComputedStyle(f).opacity === "1",
             titre: f.querySelector(".studio-titre").textContent, devant: !!auCentre && f.contains(auCentre),
             tient: rf.left >= 0 && rf.top >= 0 && rf.right <= innerWidth && rf.bottom <= innerHeight,
             gaucheDroite: g.right <= d.left && g.width > d.width };
  });
  await p.waitForTimeout(400);
  await p.screenshot({ path: "/tmp/claude-0/studio_ouvert.png" });
  verifier("un bouton « Studio d'animation » dans le menu des Paramètres", r.dansLeMenu && r.texte === "Studio d'animation", r.texte);
  verifier("il ouvre la fenêtre, devant tout, et elle tient à l'écran", r.visible && r.devant && r.tient && r.titre === "Studio d'animation");
  verifier("à gauche la carte (la plus large), à droite la liste", r.gaucheDroite);
}

console.log("\n2. LA RÉPLIQUE DE LA CARTE ET LES DEUX PIONS");
{
  const r = await p.evaluate(() => {
    const img = document.getElementById("studio-image-carte");
    const canvas = document.getElementById("studio-canvas");
    const scene = document.getElementById("studio-scene").getBoundingClientRect();
    const h = document.getElementById("studio-pion-heros"), e = document.getElementById("studio-pion-ennemi");
    const rh = h.getBoundingClientRect(), re = e.getBoundingClientRect();
    const dans = (x) => x.left >= scene.left && x.right <= scene.right && x.top >= scene.top && x.bottom <= scene.bottom;
    const q = (el) => ({ q: +el.dataset.q, r: +el.dataset.r });
    const hq = q(h), eq = q(e);
    const distance = (Math.abs(hq.q - eq.q) + Math.abs(hq.r - eq.r) + Math.abs(-hq.q - hq.r + eq.q + eq.r)) / 2;
    // Le canvas a-t-il dessiné la grille ? Des pixels opaques quelque part.
    const ctx = canvas.getContext("2d");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let traits = 0; for (let i = 3; i < data.length; i += 4 * 97) if (data[i] > 0) traits++;
    return { carte: img.src, carteJeu: document.getElementById("image-map-vtt").src, imgVisible: getComputedStyle(img).display !== "none",
             taille: [document.getElementById("studio-plateau").style.width, document.getElementById("studio-plateau").style.height],
             traits, hq, eq, distance, dansScene: dans(rh) && dans(re),
             imageHeros: h.querySelector("img").src, imageEnnemi: e.querySelector("img").src,
             largeurPion: Math.round(rh.width), heros: document.getElementById("studio-heros").value,
             options: [...document.querySelectorAll("#studio-heros option")].map(o => o.textContent),
             grilleJeuIntacte: window.PLATEAU_VTT.getCaseState(0, 0).isDeleted === true && !document.querySelector("#conteneur-tokens-vtt #studio-pion-heros") };
  });
  verifier("la carte du combat : la même image, à la même taille (1600 × 1200)", r.carte === r.carteJeu && r.imgVisible
           && JSON.stringify(r.taille) === '["1600px","1200px"]', JSON.stringify(r.taille));
  verifier("la grille est redessinée par-dessus", r.traits > 50, String(r.traits));
  verifier("la case centrale est gommée : le héros se pose sur la plus proche", !(r.hq.q === 0 && r.hq.r === 0)
           && Math.max(Math.abs(r.hq.q), Math.abs(r.hq.r), Math.abs(r.hq.q + r.hq.r)) === 1, JSON.stringify(r.hq));
  verifier("l'ennemi inerte juste à côté (une case)", r.distance === 1, JSON.stringify(r.eq));
  verifier("les deux pions se voient dans la scène", r.dansScene && r.largeurPion > 40, `${r.largeurPion} px`);
  verifier("le pion du héros de CE joueur (Aldric), l'ennemi au pion commun", r.heros === "H1" && /heros-test/.test(r.imageHeros)
           && /ennemi-test/.test(r.imageEnnemi) && JSON.stringify(r.options) === '["Aldric"]', JSON.stringify(r.options));
  verifier("le plateau du combat n'est pas touché", r.grilleJeuIntacte);
}

console.log("\n3. LA LISTE DES ANIMATIONS");
const ids = await p.evaluate(() => (window.ANIMATIONS_COMBAT || []).map(a => a.id));
{
  const r = await p.evaluate(() => ({
    lignes: [...document.querySelectorAll("#studio-liste .studio-anim")].map(l => ({
      nom: l.querySelector(".studio-anim-nom").textContent.trim(), description: l.querySelector(".studio-anim-description").textContent.trim(),
      case: !!l.querySelector("input[type=checkbox]"), coche: l.querySelector("input[type=checkbox]").checked })),
    compteur: document.getElementById("studio-compteur").textContent
  }));
  verifier("dix animations pour commencer, chacune son nom et sa description", r.lignes.length === 10 && ids.length === 10
           && new Set(r.lignes.map(l => l.nom)).size === 10 && r.lignes.every(l => l.description.length > 20));
  verifier("chacune sa case « Intégrée »", r.lignes.every(l => l.case));
  verifier("la case cochée en base (Soin) l'est à l'ouverture, et le compteur le dit", r.lignes.filter(l => l.coche).length === 1
           && r.lignes.find(l => l.coche).nom.startsWith("Soin") && r.compteur === "1 / 10 intégrées", r.compteur);
}

console.log("\n4. UN CLIC JOUE L'ANIMATION EN DIRECT SUR LE PION");
{
  await p.evaluate(() => { window.__fin = null; document.querySelector('#studio-liste .studio-anim[data-anim="boule-de-feu"] .studio-anim-jouer').click(); });
  await p.waitForTimeout(450);
  const pendant = await p.evaluate(() => ({
    effets: document.querySelectorAll("#studio-pions .anim-effet").length,
    joue: document.querySelector('#studio-liste .studio-anim[data-anim="boule-de-feu"]').classList.contains("joue"),
    animsHeros: document.getElementById("studio-pion-heros").getAnimations().length + document.querySelectorAll("#studio-pions .anim-effet").length
  }));
  await p.screenshot({ path: "/tmp/claude-0/studio_boule_de_feu.png" });
  verifier("pendant : la boule de feu vole (des effets sur la scène), la ligne s'allume", pendant.effets > 0 && pendant.joue, JSON.stringify(pendant));
  await p.waitForTimeout(1800);
  const apres = await p.evaluate(() => ({
    effets: document.querySelectorAll("#studio-pions .anim-effet").length,
    joue: document.querySelector('#studio-liste .studio-anim[data-anim="boule-de-feu"]').classList.contains("joue"),
    transform: getComputedStyle(document.getElementById("studio-pion-heros")).transform
  }));
  verifier("après : plus rien sur la scène, la ligne s'éteint", apres.effets === 0 && !apres.joue, JSON.stringify(apres));
  // Deux autres, saisies en plein vol, pour les yeux.
  for (const [id, ms] of [["coup-critique", 520], ["soin", 600], ["gel", 650], ["boule-de-feu", 680]]) {
    await p.evaluate((id) => { window.jouerAnimationStudio(id); }, id);
    await p.waitForTimeout(ms);
    await p.screenshot({ path: `/tmp/claude-0/studio_${id}.png` });
    await p.waitForTimeout(2600);
  }
}

console.log("\n5. CHAQUE ANIMATION DU CATALOGUE, JUSQU'AU BOUT");
{
  const r = await p.evaluate(async (ids) => {
    const res = [];
    const h = document.getElementById("studio-pion-heros"), e = document.getElementById("studio-pion-ennemi");
    const repos = [h.getBoundingClientRect(), e.getBoundingClientRect()].map(x => [Math.round(x.left), Math.round(x.top), Math.round(x.width)].join(","));
    for (const id of ids) {
      let vu = 0;
      const obs = new MutationObserver(() => { vu = Math.max(vu, document.querySelectorAll("#studio-pions .anim-effet").length); });
      obs.observe(document.getElementById("studio-pions"), { childList: true, subtree: true });
      let anime = false;
      const sonde = setInterval(() => { if (h.getAnimations().length || e.getAnimations().length) anime = true; }, 30);
      const t0 = performance.now();
      const ok = await window.jouerAnimationStudio(id);
      clearInterval(sonde); obs.disconnect();
      const fin = [h.getBoundingClientRect(), e.getBoundingClientRect()].map(x => [Math.round(x.left), Math.round(x.top), Math.round(x.width)].join(","));
      res.push({ id, ok, ms: Math.round(performance.now() - t0), bouge: anime || vu > 0, reste: document.querySelectorAll("#studio-pions .anim-effet").length,
                 retour: JSON.stringify(fin) === JSON.stringify(repos), filtre: getComputedStyle(h).filter + "|" + getComputedStyle(e).filter });
    }
    return res;
  }, ids);
  r.forEach(x => console.log(`     ${x.id.padEnd(16)} ${x.ok ? "jouée" : "ÉCHEC"} en ${x.ms} ms${x.reste ? `, ${x.reste} effet(s) restés` : ""}`));
  verifier("les dix se jouent sans erreur", r.every(x => x.ok), r.filter(x => !x.ok).map(x => x.id).join());
  verifier("chacune fait vraiment quelque chose (pion animé ou effets posés)", r.every(x => x.bouge), r.filter(x => !x.bouge).map(x => x.id).join());
  verifier("aucune ne dure plus de 4 secondes", r.every(x => x.ms < 4000), r.map(x => x.ms).join(" "));
  verifier("aucune ne laisse d'effet derrière elle, les pions reviennent à leur place", r.every(x => x.reste === 0 && x.retour && x.filtre === "none|none"),
           r.filter(x => !(x.reste === 0 && x.retour && x.filtre === "none|none")).map(x => x.id + " " + x.filtre).join(", "));
}

console.log("\n6. LA CASE « INTÉGRÉE » SE SOUVIENT");
{
  await p.evaluate(() => { window.__ecrits = []; });
  await p.click('#studio-liste .studio-anim[data-anim="coup-epee"] .studio-anim-case input');
  await p.waitForTimeout(200);
  const r = await p.evaluate(() => ({
    ecrit: (window.__ecrits || []).find(e => e.chemin === "Studio_Animations/etat"),
    local: JSON.parse(localStorage.getItem("ivalis_studio_animations_integrees") || "{}"),
    compteur: document.getElementById("studio-compteur").textContent,
    vert: document.querySelector('#studio-liste .studio-anim[data-anim="coup-epee"]').classList.contains("integree"),
    rienJoue: !document.querySelector("#studio-liste .studio-anim.joue")
  }));
  verifier("cocher écrit la case en base (fusion, pour l'iPad et le PC)", r.ecrit && r.ecrit.data.Integrees["coup-epee"] === true
           && r.ecrit.options && r.ecrit.options.merge === true, JSON.stringify(r.ecrit));
  verifier("…et dans ce navigateur ; le compteur passe à 2, la ligne verdit", r.local["coup-epee"] === true && r.compteur === "2 / 10 intégrées" && r.vert);
  verifier("cocher ne joue pas l'animation", r.rienJoue);
  await p.evaluate(async () => {
    window.__docs = {};
    window.fermerStudioAnimation();
    await new Promise(r => setTimeout(r, 200));
    await window.ouvrirStudioAnimation();
  });
  await p.waitForTimeout(300);
  const reouvert = await p.evaluate(() => [...document.querySelectorAll("#studio-liste .studio-anim input:checked")].map(i => i.closest(".studio-anim").dataset.anim).sort());
  verifier("fermé puis rouvert : les cases cochées le restent", JSON.stringify(reouvert) === '["coup-epee","soin"]', JSON.stringify(reouvert));
}

console.log("\n7. LA CAMÉRA, ET LA FERMETURE");
{
  const r = await p.evaluate(async () => {
    const largeur = () => document.getElementById("studio-pion-heros").getBoundingClientRect().width;
    const avant = largeur();
    window.zoomStudio(1.25);
    const zoome = largeur();
    window.recentrerStudio();
    const recentre = largeur();
    window.fermerStudioAnimation();
    await new Promise(r => setTimeout(r, 100));
    return { avant, zoome, recentre, ferme: getComputedStyle(document.getElementById("studio-animation")).display === "none",
             menu: getComputedStyle(document.getElementById("etape-menu-parametres")).display !== "none" };
  });
  verifier("zoomer grossit les pions, recentrer revient au cadrage", r.zoome > r.avant * 1.2 && Math.abs(r.recentre - r.avant) < 1,
           `${Math.round(r.avant)} → ${Math.round(r.zoome)} → ${Math.round(r.recentre)}`);
  verifier("fermer rend la main aux Paramètres", r.ferme && r.menu);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
