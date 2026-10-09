// LA MISE EN PLACE COMMUNE des bancs du Studio d'animation (studio_catalogue_*.mjs).
import fs from 'fs';
import http from 'http';
import path from 'path';

export const RACINE = '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

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

// UN STUDIO OUVERT, prêt à jouer : la même partie que studio_animation.mjs
// (une carte de combat, une case centrale gommée, un héros), le studio ouvert
// depuis les Paramètres.
export async function ouvrirStudio() {
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
  p.on('console', m => { if (m.type() === 'error' && !/net::|Failed to load resource/.test(m.text())) erreurs.push(m.text().slice(0, 200)); });
  await p.goto(base + '/index.html');
  await p.waitForTimeout(2000);
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
    window.PERSOS_JOUEURS_PARTIE = [{ idPersonnage: "H1", prenom: "Aldric", idJoueur: "J1", urlToken: "https://res.cloudinary.com/x/heros-test.svg" }];
    window.PERSOS_PARTIE = window.PERSOS_JOUEURS_PARTIE;
    window.TOKENS_VTT_DATA = { H1: { q: 3, r: 2, url: "https://res.cloudinary.com/x/heros-test.svg", taille: 48 } };
    window.IMAGE_TOKEN_ENNEMI = "https://res.cloudinary.com/x/ennemi-test.svg";
    window.__docs = {};
    const conteneur = document.getElementById("conteneur-parametres");
    conteneur.style.display = "block"; conteneur.classList.add("ouvert");
    document.getElementById("etape-mdp-parametres").style.display = "none";
    const menu = document.getElementById("etape-menu-parametres");
    menu.style.display = "block"; menu.style.opacity = "1";
    document.getElementById("btn-ouvrir-studio").click();
    await new Promise(r => setTimeout(r, 900));
  });
  let echecs = 0;
  const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(72)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
  const fin = async () => {
    verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
    await b.close(); serveur.close();
    console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
    process.exit(echecs === 0 ? 0 : 1);
  };
  return { p, b, erreurs, verifier, fin };
}

// JOUER des animations jusqu'au bout, en accéléré, et relever ce que chacune
// a fait : réussie, durée, pions animés ou effets posés, sons demandés (et
// s'ils existent), ce qui reste après, et si les pions sont revenus.
export async function jouerTout(p, ids, vitesse) {
  return p.evaluate(async ({ ids, vitesse }) => {
    window.VITESSE_ANIMATIONS = vitesse;
    const res = [];
    const h = document.getElementById("studio-pion-heros"), e = document.getElementById("studio-pion-ennemi");
    const pose = () => [h, e].map(x => { const r = x.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width)].join(","); }).join("|");
    const repos = pose();
    const catalogue = Object.keys(window.SONS_COMBAT || {});
    for (const id of ids) {
      let vu = 0, anime = false;
      const obs = new MutationObserver(() => { vu = Math.max(vu, document.querySelectorAll("#studio-pions .anim-effet").length); });
      obs.observe(document.getElementById("studio-pions"), { childList: true, subtree: true });
      const sonde = setInterval(() => { if (h.getAnimations().length || e.getAnimations().length) anime = true; }, 20);
      const vrai = window.jouerSonCombat, sons = [];
      window.jouerSonCombat = (s, f) => { sons.push(s); return vrai(s, f); };
      const textes = [];
      const vraiTexte = window.afficherMessageFlottantHex;
      window.afficherMessageFlottantHex = (q, r, t, c, o) => { textes.push(t); return vraiTexte(q, r, t, c, o); };
      const t0 = performance.now();
      const ok = await window.jouerAnimationStudio(id);
      const ms = Math.round(performance.now() - t0);
      // Les sons différés d'une animation déjà finie (il n'y en a pas : tout est
      // attendu) — on laisse passer un battement.
      await new Promise(r => setTimeout(r, 30));
      clearInterval(sonde); obs.disconnect();
      // L'éclat des dégâts du combat (afficherFlashDegatToken) s'efface à son
      // propre rythme, qui ne suit pas l'accéléré : on le laisse finir.
      for (let k = 0; k < 40 && (getComputedStyle(h).filter !== "none" || getComputedStyle(e).filter !== "none"); k++) await new Promise(r => setTimeout(r, 25));
      window.jouerSonCombat = vrai;
      window.afficherMessageFlottantHex = vraiTexte;
      res.push({ id, ok, ms, fait: anime || vu > 0, sons, inconnus: sons.filter(s => !catalogue.includes(s)), textes,
                 reste: document.querySelectorAll("#studio-pions .anim-effet").length,
                 retour: pose() === repos, filtre: getComputedStyle(h).filter + "|" + getComputedStyle(e).filter,
                 opacite: getComputedStyle(h).opacity + "|" + getComputedStyle(e).opacity });
    }
    window.VITESSE_ANIMATIONS = 1;
    return res;
  }, { ids, vitesse });
}
