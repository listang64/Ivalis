// LES FLÈCHES DE LA LISTE DES HÉROS, ET LA PORTÉE D'ARME DU BON PERSONNAGE.
//
// Nico : « dans la fenêtre avec la liste des personnages, quand il y a une liste
// qui descend plus bas, mettre un petit symbole de flèche en dessous pour
// indiquer qu'il y a des persos en dessous ; idem au-dessus. »
// Et : « si mon personnage a un arc et que je regarde les compétences d'un autre
// personnage qui ne m'appartient pas, je vois une Distance sur des compétences
// qui n'en ont pas à la base. » La carte en grand calculait la portée de l'arme
// avec le héros de CE poste, quelle que soit la carte.
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

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
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {};
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data }); };
  export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
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
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"><rect width="900" height="300" fill="#5a3a20"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

console.log("1. LA LISTE DES HÉROS : UNE FLÈCHE QUAND IL Y EN A PLUS BAS, OU PLUS HAUT");
{
  const lire = () => p.evaluate(() => {
    const vu = (sel) => { const f = document.querySelector(sel); return !!f && getComputedStyle(f).display !== "none"; };
    return { haut: vu("#conteneur-liste-personnages .fleche-liste-haut"), bas: vu("#conteneur-liste-personnages .fleche-liste-bas") };
  });
  const remplir = (n) => p.evaluate(async (n) => {
    const c = document.getElementById("conteneur-liste-personnages");
    // Ses ancêtres doivent être affichés, sinon rien n'a de taille.
    for (let e = c.parentElement; e && e !== document.body; e = e.parentElement) {
      if (getComputedStyle(e).display === "none") e.style.display = "block";
    }
    c.style.display = "block"; c.classList.add("ouvert");
    const l = document.getElementById("liste-html-persos");
    l.style.display = "block"; l.scrollTop = 0;
    l.innerHTML = Array.from({ length: n }, (_, i) => `<div class="item-perso"><span>Héros ${i + 1}</span></div>`).join("");
    await new Promise(r => setTimeout(r, 120));
  }, n);
  const cadre = await p.evaluate(() => !!document.querySelector("#conteneur-liste-personnages .cadre-liste-defilante #liste-html-persos"));
  verifier("la liste est posée dans son cadre à flèches", cadre);
  await remplir(3);
  const peu = await lire();
  verifier("3 héros (tout tient) : aucune flèche", !peu.haut && !peu.bas, JSON.stringify(peu));
  await remplir(25);
  const debut = await lire();
  verifier("25 héros, en haut de la liste : flèche du bas seulement", !debut.haut && debut.bas, JSON.stringify(debut));
  await p.evaluate(async () => { const l = document.getElementById("liste-html-persos"); l.scrollTop = 120; await new Promise(r => setTimeout(r, 120)); });
  const milieu = await lire();
  verifier("au milieu : les deux flèches", milieu.haut && milieu.bas, JSON.stringify(milieu));
  await p.evaluate(async () => { const l = document.getElementById("liste-html-persos"); l.scrollTop = l.scrollHeight; await new Promise(r => setTimeout(r, 120)); });
  const fin = await lire();
  verifier("tout en bas : flèche du haut seulement", fin.haut && !fin.bas, JSON.stringify(fin));
  const clic = await p.evaluate(async () => {
    const l = document.getElementById("liste-html-persos");
    const avant = l.scrollTop;
    document.querySelector("#conteneur-liste-personnages .fleche-liste-haut").click();
    await new Promise(r => setTimeout(r, 700));
    return { avant, apres: l.scrollTop };
  });
  verifier("un clic sur la flèche fait défiler", clic.apres < clic.avant, JSON.stringify(clic));
  const zone = await p.evaluate(async () => {
    const c = document.getElementById("conteneur-liste-personnages");
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (!e.contains(c)) e.style.display = "none"; });
    const l = document.getElementById("liste-html-persos"); l.scrollTop = 120;
    await new Promise(r => setTimeout(r, 200));
    const r = document.getElementById("conteneur-liste-personnages").getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  await p.screenshot({ path: '/tmp/claude-0/-home-user-Ivalis/3718c626-55b5-577c-9b4f-a49012fd3784/scratchpad/liste_fleches.png',
                       clip: { x: Math.max(0, zone.x), y: Math.max(0, zone.y), width: Math.max(50, zone.width), height: Math.max(50, zone.height) } });
}

console.log("\n2. LA PORTÉE D'ARME : CELLE DU PROPRIÉTAIRE DE LA CARTE");
{
  const r = await p.evaluate(() => {
    const moi = { idPersonnage: "H1", prenom: "Archer", camp: "Allié" };
    const autre = { idPersonnage: "H2", prenom: "Bretteur", camp: "Allié" };
    window.PERSOS_PARTIE = [moi, autre];
    window.COMBAT_PERSOS_JOUEUR = [moi]; window.COMBAT_INDEX_PERSO = 0;
    window.CACHE_COMPETENCES_GLOBAL = { H1: { C1: {} }, H2: { C2: {} } };
    const fiche = document.getElementById("fenetre-fiche-perso");
    const id = (x) => x ? x.idPersonnage : null;
    const sienne = id(window.porteurPourApercu("C2"));
    const mienne = id(window.porteurPourApercu("C1"));
    // Une carte hors du cache (technique de classe), sur la fiche ouverte d'un autre.
    fiche.style.display = "flex"; document.getElementById("champ-id-personnage").value = "H2";
    const surLaFiche = id(window.porteurPourApercu("CLASSE_X"));
    // Sur une fiche d'un personnage inconnu : personne, plutôt que mon arc.
    document.getElementById("champ-id-personnage").value = "H9";
    const inconnu = window.porteurPourApercu("CLASSE_X");
    fiche.style.display = "none";
    const enCombat = id(window.porteurPourApercu("CLASSE_X"));
    return { sienne, mienne, surLaFiche, inconnu, enCombat };
  });
  verifier("la carte d'un autre personnage se lit avec LUI, pas avec mon arc", r.sienne === "H2", JSON.stringify(r));
  verifier("ma carte se lit avec moi", r.mienne === "H1");
  verifier("hors du cache, sur la fiche ouverte : le personnage de la fiche", r.surLaFiche === "H2");
  verifier("un personnage introuvable : aucune portée d'arme (null)", r.inconnu === null);
  verifier("en combat, sans fiche : le héros affiché", r.enCombat === "H1");
  const src = fs.readFileSync('/home/user/Ivalis/competences.js', 'utf-8');
  verifier("la carte en grand passe par porteurPourApercu", /const lanceurDeLaCarte = typeof window\.porteurPourApercu === "function"/.test(src));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
