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
// Les dix premières animations du Studio : ce banc les suit de près (sons,
// textes, directions) ; le catalogue complet (142) a ses propres bancs,
// studio_catalogue_1.mjs et studio_catalogue_2.mjs.
const PREMIERES = ["coup-epee", "coup-recu", "soin", "bouclier", "boule-de-feu", "esquive", "gel", "poison", "coup-critique", "mise-a-terre"];
const tous = await p.evaluate(() => (window.ANIMATIONS_COMBAT || []).map(a => a.id));
const ids = PREMIERES.filter(id => tous.includes(id));
{
  const r = await p.evaluate(() => ({
    lignes: [...document.querySelectorAll("#studio-liste .studio-anim")].map(l => ({
      nom: l.querySelector(".studio-anim-nom").textContent.trim(), description: l.querySelector(".studio-anim-description").textContent.trim(),
      case: !!l.querySelector("input[type=checkbox]"), coche: l.querySelector("input[type=checkbox]").checked })),
    compteur: document.getElementById("studio-compteur").textContent
  }));
  verifier("tout le catalogue (142), chacune son nom et sa description", r.lignes.length === 142 && tous.length === 142
           && new Set(r.lignes.map(l => l.nom)).size === 142 && r.lignes.every(l => l.description.length > 20), String(r.lignes.length));
  verifier("les dix premières y sont toutes", ids.length === 10, ids.join());
  verifier("chacune sa case « Intégrée »", r.lignes.every(l => l.case));
  verifier("la case cochée en base (Soin) l'est à l'ouverture, et le compteur le dit", r.lignes.filter(l => l.coche).length === 1
           && r.lignes.find(l => l.coche).nom.startsWith("Soin") && r.compteur === "1 / 142 intégrées", r.compteur);
}

console.log("\n4. UN CLIC JOUE L'ANIMATION EN DIRECT SUR LE PION");
{
  await p.evaluate(() => { window.__fin = null; document.querySelector('#studio-liste .studio-anim[data-anim="boule-de-feu"] .studio-anim-jouer').click(); });
  // On attend que la boule soit en vol (des effets sur la scène), quelle que
  // soit la cadence de la machine.
  await p.waitForFunction(() => document.querySelectorAll("#studio-pions .anim-effet").length > 0, null, { timeout: 5000 }).catch(() => {});
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
  verifier("aucune ne dure plus de 5 secondes", r.every(x => x.ms < 5000), r.map(x => x.ms).join(" "));
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
  verifier("…et dans ce navigateur ; le compteur passe à 2, la ligne verdit", r.local["coup-epee"] === true && r.compteur === "2 / 142 intégrées" && r.vert, r.compteur);
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

console.log("\n8. LE BOUTON POUR DÉPLACER LES PIONS");
// Nico : « un bouton pour bouger le pion joueur et l'ennemi. »
await p.evaluate(async () => { await window.ouvrirStudioAnimation(); });
await p.waitForTimeout(300);
const centrePion = (id) => p.evaluate((id) => { const r = document.getElementById(id).getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, q: +document.getElementById(id).dataset.q, r: +document.getElementById(id).dataset.r }; }, id);
// Le centre écran d'une case de la carte du studio.
const centreCase = (q, r) => p.evaluate(([q, r]) => {
  const scene = document.getElementById("studio-scene").getBoundingClientRect();
  const t = document.getElementById("studio-plateau").style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/);
  const x = +t[1], y = +t[2], e = +t[3];
  const pl = { hexSize: window.PLATEAU_VTT.hexSize, w: 1600, h: 1200 };
  const px = pl.hexSize * 1.5 * q + pl.w / 2, py = pl.hexSize * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r) + pl.h / 2;
  return { x: scene.left + x + px * e, y: scene.top + y + py * e };
}, [q, r]);
const glisser = async (id, vers) => {
  const de = await centrePion(id);
  await p.mouse.move(de.x, de.y); await p.mouse.down();
  await p.mouse.move((de.x + vers.x) / 2, (de.y + vers.y) / 2, { steps: 4 });
  await p.mouse.move(vers.x, vers.y, { steps: 4 }); await p.mouse.up();
  await p.waitForTimeout(120);
};
{
  const heros0 = await centrePion("studio-pion-heros");
  // Sans le bouton : glisser un pion fait glisser la carte, pas le pion.
  await glisser("studio-pion-ennemi", await centreCase(heros0.q - 2, heros0.r + 1));
  const sansBouton = await centrePion("studio-pion-ennemi");
  await p.evaluate(() => window.recentrerStudio());
  await p.click("#studio-btn-deplacer");
  const arme = await p.evaluate(() => ({ scene: document.getElementById("studio-scene").classList.contains("studio-deplacement"),
    bouton: document.getElementById("studio-btn-deplacer").classList.contains("actif"),
    aide: getComputedStyle(document.getElementById("studio-aide-deplacer")).display !== "none" }));
  verifier("un bouton « Déplacer les pions » : il s'allume et dit quoi faire", arme.scene && arme.bouton && arme.aide);
  verifier("sans lui, glisser sur un pion ne le déplace pas", sansBouton.q === 0 && sansBouton.r === -1, JSON.stringify(sansBouton));
  // L'ennemi à l'ouest du héros, à deux cases.
  const heros = await centrePion("studio-pion-heros");
  await glisser("studio-pion-ennemi", await centreCase(heros.q - 2, heros.r + 1));
  const ennemi = await centrePion("studio-pion-ennemi");
  const attendu = await centreCase(heros.q - 2, heros.r + 1);
  verifier("l'ennemi se pose sur la case visée, à son centre", ennemi.q === heros.q - 2 && ennemi.r === heros.r + 1
           && Math.hypot(ennemi.x - attendu.x, ennemi.y - attendu.y) < 3, JSON.stringify(ennemi) + " / " + JSON.stringify(attendu));
  // Le héros aussi se déplace (d'une case vers le nord-ouest : la case
  // centrale, gommée, est à l'est).
  await glisser("studio-pion-heros", await centreCase(heros.q, heros.r - 1));
  const herosApres = await centrePion("studio-pion-heros");
  verifier("le héros aussi", herosApres.q === heros.q && herosApres.r === heros.r - 1, JSON.stringify(herosApres));
  // Une case gommée (0,0) ou celle de l'autre pion : il revient.
  await glisser("studio-pion-heros", await centreCase(0, 0));
  const refuse1 = await centrePion("studio-pion-heros");
  await glisser("studio-pion-heros", await centreCase(ennemi.q, ennemi.r));
  const refuse2 = await centrePion("studio-pion-heros");
  verifier("sur une case gommée, ou sur l'autre pion : il revient à sa place", refuse1.q === herosApres.q && refuse1.r === herosApres.r
           && refuse2.q === herosApres.q && refuse2.r === herosApres.r);
  await p.screenshot({ path: "/tmp/claude-0/studio_deplacement.png" });
}

console.log("\n9. TOUJOURS SUR LE PION DU JOUEUR, EN DIRECTION DE L'ENNEMI");
// Nico : « l'animation sera toujours sur le token joueur et en direction de l'ennemi. »
{
  // Ce que fait chaque animation, suivi image par image : où va le héros, et
  // où se posent les effets, par rapport à l'axe héros → ennemi.
  const suivre = (id) => p.evaluate(async (id) => {
    const h = document.getElementById("studio-pion-heros"), e = document.getElementById("studio-pion-ennemi");
    const c = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
    const A = c(h), B = c(e);
    const ux = (B.x - A.x) / Math.hypot(B.x - A.x, B.y - A.y), uy = (B.y - A.y) / Math.hypot(B.x - A.x, B.y - A.y);
    let avanceMax = 0, avanceMin = 0, effetsVersEnnemi = 0, effets = 0, ennemiTouche = false;
    let fin = false;
    // Le mouvement du héros se lit dans les images clés de ses animations
    // (« translate(-50%, -50%) translate(x px, y px) … ») : exact, quelle que
    // soit la cadence de la machine.
    const vues = new Set();
    const lireMouvements = () => h.getAnimations().forEach(an => {
      if (vues.has(an)) return; vues.add(an);
      (an.effect.getKeyframes() || []).forEach(k => {
        const m = String(k.transform || "").match(/translate\(-50%, -50%\) translate\(([-\d.e]+)px, ([-\d.e]+)px\)/);
        if (!m) return;
        const av = (+m[1]) * ux + (+m[2]) * uy;
        avanceMax = Math.max(avanceMax, av); avanceMin = Math.min(avanceMin, av);
      });
    });
    const sonde = () => {
      lireMouvements();
      document.querySelectorAll("#studio-pions .anim-effet").forEach(f => {
        const F = c(f); effets++;
        if ((F.x - A.x) * ux + (F.y - A.y) * uy > 0.5 * Math.hypot(B.x - A.x, B.y - A.y)) effetsVersEnnemi++;
      });
      if (e.getAnimations().length) ennemiTouche = true;
      if (!fin) requestAnimationFrame(sonde);
    };
    requestAnimationFrame(sonde);
    await window.jouerAnimationStudio(id);
    fin = true;
    return { avanceMax: Math.round(avanceMax), avanceMin: Math.round(avanceMin), effets, effetsVersEnnemi, ennemiTouche };
  }, id);
  await p.click("#studio-btn-deplacer");   // désarmé (une animation le désarme aussi)
  const ouest = { epee: await suivre("coup-epee"), feu: await suivre("boule-de-feu"), gel: await suivre("gel"), recu: await suivre("coup-recu"), chute: await suivre("mise-a-terre") };
  verifier("ennemi à l'ouest : l'épée part vers lui (le héros avance vers l'ouest)", ouest.epee.avanceMax > 10 && ouest.epee.ennemiTouche, JSON.stringify(ouest.epee));
  verifier("la boule de feu file jusqu'à lui et l'embrase", ouest.feu.effetsVersEnnemi > 5 && ouest.feu.ennemiTouche, JSON.stringify(ouest.feu));
  verifier("le gel aussi part du héros vers l'ennemi", ouest.gel.effetsVersEnnemi > 5 && ouest.gel.ennemiTouche, JSON.stringify(ouest.gel));
  verifier("un coup reçu le fait reculer, À L'OPPOSÉ de l'ennemi", ouest.recu.avanceMin < -5 && ouest.recu.avanceMin < -ouest.recu.avanceMax
           && !ouest.recu.ennemiTouche, JSON.stringify(ouest.recu));
  verifier("mis à terre, il tombe à l'opposé de l'ennemi", ouest.chute.avanceMin < -10 && ouest.chute.avanceMax < -ouest.chute.avanceMin / 3, JSON.stringify(ouest.chute));
  // L'ennemi passe à l'est : tout se retourne.
  await p.click("#studio-btn-deplacer");
  const heros = await centrePion("studio-pion-heros");
  await glisser("studio-pion-ennemi", await centreCase(heros.q + 2, heros.r - 1));
  await p.click("#studio-btn-deplacer");
  const est = await p.evaluate(async () => {
    const h = document.getElementById("studio-pion-heros"), e = document.getElementById("studio-pion-ennemi");
    const x0 = h.getBoundingClientRect().left, ex = e.getBoundingClientRect().left;
    let dxMax = 0, fin = false;
    const sonde = () => {
      h.getAnimations().forEach(an => (an.effect.getKeyframes() || []).forEach(k => {
        const m = String(k.transform || "").match(/translate\(-50%, -50%\) translate\(([-\d.e]+)px, ([-\d.e]+)px\)/);
        if (m) dxMax = Math.max(dxMax, +m[1]);
      }));
      if (!fin) requestAnimationFrame(sonde);
    };
    requestAnimationFrame(sonde);
    await window.jouerAnimationStudio("coup-epee");
    fin = true;
    return { ennemiAEst: ex > x0, dxMax: Math.round(dxMax) };
  });
  verifier("ennemi déplacé à l'est : l'épée part vers l'est", est.ennemiAEst && est.dxMax > 8, JSON.stringify(est));
}

console.log("\n10. LE SON DES ANIMATIONS");
// Nico : « quand on jouera une animation il y aura du son aussi. »
{
  const r = await p.evaluate(async (PREMIERES) => {
    const vrai = window.jouerSonCombat;
    const res = [];
    for (const a of window.ANIMATIONS_COMBAT.filter(x => PREMIERES.includes(x.id))) {
      const joues = [];
      window.jouerSonCombat = (id, f) => { joues.push(id); return vrai(id, f); };
      await window.jouerAnimationStudio(a.id);
      res.push({ id: a.id, joues });
    }
    window.jouerSonCombat = vrai;
    return { res, catalogue: Object.keys(window.SONS_COMBAT) };
  }, PREMIERES);
  r.res.forEach(x => console.log(`     ${x.id.padEnd(16)} ${x.joues.join(", ")}`));
  verifier("chaque animation joue son son (au moins un, et du catalogue)", r.res.every(x => x.joues.length > 0 && x.joues.every(j => r.catalogue.includes(j))),
           r.res.filter(x => !x.joues.length).map(x => x.id).join());
  verifier("les attaques ont deux temps : l'élan, puis l'impact", ["coup-epee", "boule-de-feu", "gel", "poison", "coup-critique"]
           .every(id => r.res.find(x => x.id === id).joues.length >= 2));
  const rendus = await p.evaluate(async () => {
    const out = [];
    for (const [id, fabriquer] of Object.entries(window.SONS_COMBAT)) {
      const ctx = new OfflineAudioContext(1, 44100 * 2, 44100);
      const g = ctx.createGain(); g.connect(ctx.destination);
      fabriquer(ctx, g);
      const d = (await ctx.startRendering()).getChannelData(0);
      let crete = 0, dernier = 0;
      for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > crete) crete = v; if (v > 0.003) dernier = i; }
      out.push({ id, crete: +crete.toFixed(3), duree: +(dernier / 44100).toFixed(2) });
    }
    const avant = window.PARAMETRES_AUDIO.interface;
    window.PARAMETRES_AUDIO.interface = 0;
    const muet = window.jouerSonCombat("lame-impact");
    window.PARAMETRES_AUDIO.interface = avant;
    return { out, muet, joue: window.jouerSonCombat("lame-impact") };
  });
  verifier("les sons de combat fabriqués (99 avec le catalogue complet), aucun muet, aucun ne sature", rendus.out.length === 99 && rendus.out.every(x => x.crete > 0.02 && x.crete < 0.95),
           rendus.out.map(x => `${x.id} ${x.crete}`).join(" · "));
  verifier("tous brefs (moins de 1,6 s)", rendus.out.every(x => x.duree < 1.6), rendus.out.map(x => x.duree).join(" "));
  verifier("ils suivent le volume du jeu (à zéro : rien)", rendus.muet === false && rendus.joue === true);
  // Une animation interrompue se tait : la boule de feu coupée par un soin
  // n'explose jamais.
  const coupe = await p.evaluate(async () => {
    const vrai = window.jouerSonCombat, joues = [];
    window.jouerSonCombat = (id, f) => { joues.push(id); return vrai(id, f); };
    const premiere = window.jouerAnimationStudio("boule-de-feu");
    await new Promise(r => setTimeout(r, 150));
    await window.jouerAnimationStudio("soin");
    await premiere;
    await new Promise(r => setTimeout(r, 900));
    window.jouerSonCombat = vrai;
    return { joues, restes: document.querySelectorAll("#studio-pions .anim-effet").length };
  });
  verifier("une animation coupée par une autre se tait (pas d'explosion après le soin)", !coupe.joues.includes("feu-explosion")
           && coupe.joues.includes("soin") && coupe.restes === 0, JSON.stringify(coupe));
}

console.log("\n11. LES TEXTES FLOTTANTS, COMME EN COMBAT");
// Nico : « et faut aussi pour l'animation les textes flottants comme en combat
// au-dessus des tokens. »
{
  const r = await p.evaluate(async (PREMIERES) => {
    const calque = document.getElementById("studio-pions");
    const h = document.getElementById("studio-pion-heros"), e = document.getElementById("studio-pion-ennemi");
    const centre = (el) => { const a = el.getBoundingClientRect(), c = calque.getBoundingClientRect(); return { x: a.left - c.left + a.width / 2, y: a.top - c.top + a.height / 2 }; };
    const res = {};
    for (const a of window.ANIMATIONS_COMBAT.filter(x => PREMIERES.includes(x.id))) {
      const vus = [];
      let barres = 0;
      const obs = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
        if (!n.classList) return;
        if (n.classList.contains("jauge-flash-token")) barres++;
        if (n.style && n.style.transition && /top 1.8s/.test(n.style.transition)) {
          const H = centre(h), E = centre(e), x = parseFloat(n.style.left), y = parseFloat(n.style.top);
          vus.push({ texte: n.innerText, couleur: n.style.color, taille: n.style.fontSize, police: n.style.fontFamily,
                     ombre: n.style.textShadow, marque: n.classList.contains("anim-message"),
                     sur: Math.abs(x - H.x) < Math.abs(x - E.x) ? "heros" : "ennemi",
                     auDessus: y < (Math.abs(x - H.x) < Math.abs(x - E.x) ? H.y : E.y) });
        }
      })));
      obs.observe(calque, { childList: true, subtree: true });
      await window.jouerAnimationStudio(a.id);
      await new Promise(r => setTimeout(r, 50));
      obs.disconnect();
      res[a.id] = { vus, barres };
    }
    await new Promise(r => setTimeout(r, 2400));
    return { res, restes: document.querySelectorAll("#studio-pions .anim-message").length };
  }, PREMIERES);
  Object.entries(r.res).forEach(([id, x]) => console.log(`     ${id.padEnd(16)} ${x.vus.map(v => `« ${v.texte} » (${v.sur})`).join("  ")}${x.barres ? "  + barre" : ""}`));
  const textes = (id) => r.res[id].vus.map(v => v.texte + "@" + v.sur);
  verifier("chaque animation a ses textes flottants", Object.values(r.res).every(x => x.vus.length > 0));
  verifier("le dessin du combat : Cinzel gras, ombre noire, au-dessus du pion", Object.values(r.res).every(x => x.vus.every(v =>
           /Cinzel/.test(v.police) && /black/.test(v.ombre) && v.auDessus && v.marque)));
  verifier("épée : « -12 » sur l'ennemi, avec sa barre qui se vide", textes("coup-epee").join() === "-12@ennemi" && r.res["coup-epee"].barres === 1);
  verifier("coup reçu : « -12 » sur le héros", textes("coup-recu").join() === "-12@heros" && r.res["coup-recu"].barres === 1);
  const soin = r.res["soin"].vus[0] || {};
  verifier("soin : « +15 » en vert sur le héros (la couleur du combat)", soin.texte === "+15" && soin.sur === "heros" && soin.couleur === "rgb(27, 110, 58)", soin.couleur);
  const bouclier = r.res["bouclier"].vus[0] || {};
  verifier("bouclier : « +12 🛡️ » en cyan sur le héros", bouclier.texte === "+12 🛡️" && bouclier.couleur === "rgb(0, 255, 255)");
  verifier("boule de feu : « -14 » puis « Brûlé ! » sur l'ennemi", textes("boule-de-feu").join() === "-14@ennemi,Brûlé !@ennemi");
  verifier("Glacé : « -9 », « Glacé ! », puis sa présence ; Empoisonnement : « -5 », « Empoisonnement ! », puis le tic « -3 ⚡ », « -2 »",
           textes("gel").join() === "-9@ennemi,Glacé !@ennemi,Marche ×2 · +20 % dégâts phys.@ennemi"
           && textes("poison").join() === "-5@ennemi,Empoisonnement !@ennemi,-3 ⚡@ennemi,-2@ennemi", JSON.stringify([textes("gel"), textes("poison")]));
  verifier("esquive : « Esquivé 💨 » sur le héros", textes("esquive").join() === "Esquivé 💨@heros");
  const crit = r.res["coup-critique"].vus;
  verifier("critique : « Critique ! » en grand sur le héros AVANT le coup, puis « -24 ! » sur l'ennemi",
           crit.map(v => v.texte + "@" + v.sur).join() === "Critique !@heros,-24 !@ennemi" && crit[0].taille === "30px", JSON.stringify(crit.map(v => v.taille)));
  const terre = r.res["mise-a-terre"].vus;
  verifier("mise à terre : « -30 » puis « À terre ! » sur le héros", terre.map(v => v.texte + "@" + v.sur).join() === "-30@heros,À terre !@heros" && terre[1].taille === "26px");
  verifier("les textes s'en vont d'eux-mêmes", r.restes === 0, String(r.restes));
  // Pour les yeux : la boule de feu, au moment où « Brûlé ! » monte.
  await p.evaluate(() => { window.recentrerStudio(); window.jouerAnimationStudio("boule-de-feu"); });
  await p.waitForFunction(() => [...document.querySelectorAll("#studio-pions .anim-message")].some(m => /Brûlé/.test(m.innerText)), null, { timeout: 8000 });
  await p.waitForTimeout(250);
  await p.screenshot({ path: "/tmp/claude-0/studio_textes_feu.png" });
  await p.evaluate(() => { window.jouerAnimationStudio("coup-critique"); });
  await p.waitForFunction(() => [...document.querySelectorAll("#studio-pions .anim-message")].some(m => /-24/.test(m.innerText)), null, { timeout: 8000 });
  await p.waitForTimeout(200);
  await p.screenshot({ path: "/tmp/claude-0/studio_textes_critique.png" });
  await p.waitForTimeout(2600);
  // Interrompue, une animation ne laisse aucun texte en plan.
  const coupe = await p.evaluate(async () => {
    const premiere = window.jouerAnimationStudio("boule-de-feu");
    // On attend que le premier texte (« -14 ») soit à l'écran.
    for (let i = 0; i < 100 && !document.querySelector("#studio-pions .anim-message"); i++) await new Promise(r => setTimeout(r, 30));
    const pendant = document.querySelectorAll("#studio-pions .anim-message").length;
    window.fermerStudioAnimation();
    await premiere;
    await new Promise(r => setTimeout(r, 700));
    return { pendant, apres: document.querySelectorAll("#studio-pions .anim-message, #studio-pions .anim-effet").length };
  });
  verifier("fermer le studio en pleine animation efface ses textes", coupe.pendant > 0 && coupe.apres === 0, JSON.stringify(coupe));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
