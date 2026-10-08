// LE PION DU HÉROS DANS LE BLASON DE L'APERÇU
//
// Nico : « Dans la fiche perso, dans Aperçu, il y a un rond jaune avec
// l'initiale de notre perso. À la place, pour exactement la même taille,
// j'aimerais que tu mettes l'image du token du joueur. »
//   - le blason porte le pion (URL_Token de la fiche, urlToken une fois lue) ;
//   - exactement la même taille que le rond à l'initiale, le même cadre doré ;
//   - l'image remplit le rond, rognée en cercle ;
//   - pas de pion, ou un pion qui ne se charge pas : l'initiale revient.
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(70)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
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
const erreurs = [];
// Un pion rond, dessiné ici (le banc ne sort pas sur le réseau).
const PION = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><circle cx="128" cy="128" r="120" fill="#3a6ea5" stroke="#e2b84f" stroke-width="12"/>' +
  '<text x="128" y="160" font-size="96" text-anchor="middle" fill="#fff3c9" font-family="serif">⚔</text></svg>');
const p = await b.newPage({ viewport: { width: 1194, height: 900 } });
p.on('pageerror', e => erreurs.push(e.message));
await p.route('**', r => {
  const url = r.request().url();
  if (url.startsWith(base)) return r.continue();
  if (url.includes('firebase-app.js')) return r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP });
  if (url.includes('firebase-firestore.js')) return r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE });
  if (url.includes('pion_morvak')) return r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'}, body: PION });
  if (url.includes('pion_perdu')) return r.fulfill({ status: 404, body: 'non' });
  return r.abort();
});
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);
await p.evaluate(() => {
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
  const fiche = document.getElementById("fenetre-fiche-perso");
  fiche.style.display = "flex"; fiche.style.left = "2vw"; fiche.style.top = "10px";
  const bouton = [...document.querySelectorAll(".onglet-btn")].find(x => x.textContent.trim() === "Aperçu");
  if (bouton) bouton.click();
});

const FICHE = { prenom: "Morvak", nom: "Cendrelame", race: "Gob", classe: "Sorcier", XP: 2500, PV_Max: 50,
                Fatigue_Max: 100, Regeneration: 35, Esquive: 12, Parade: 0, Critique: 8, Def_Physique: 6, Def_Magique: 14 };
const afficher = (extra) => p.evaluate(async (fiche) => {
  window.afficherStatsCombat(fiche);
  await new Promise(r => setTimeout(r, 400));
  const bl = document.getElementById("stats-blason");
  const img = bl.querySelector("img");
  const rb = bl.getBoundingClientRect(), cs = getComputedStyle(bl);
  return {
    texte: bl.textContent.trim(), avecToken: bl.classList.contains("avec-token"),
    largeur: Math.round(rb.width), hauteur: Math.round(rb.height), rond: cs.borderRadius, cadre: cs.borderTopColor + " " + cs.borderTopWidth,
    img: img ? { src: img.getAttribute("src"), charge: img.complete && img.naturalWidth > 0,
                 l: Math.round(img.getBoundingClientRect().width), h: Math.round(img.getBoundingClientRect().height),
                 rond: getComputedStyle(img).borderRadius, ajuste: getComputedStyle(img).objectFit } : null
  };
}, { ...FICHE, ...extra });

console.log("\n1. SANS PION : LE ROND À L'INITIALE, COMME AVANT");
const sans = await afficher({});
verifier("l'initiale « M », pas d'image", sans.texte === "M" && !sans.img && !sans.avecToken, JSON.stringify(sans));

console.log("\n2. AVEC SON PION");
const avec = await afficher({ urlToken: "https://res.cloudinary.com/x/pion_morvak.png" });
if (process.env.CAPTURE_DIR) {
  await p.locator(".apercu-entete").screenshot({ path: process.env.CAPTURE_DIR + "/apercu_pion.png" });
}
verifier("le blason porte l'image du pion, chargée", !!avec.img && /pion_morvak/.test(avec.img.src) && avec.img.charge, JSON.stringify(avec.img));
verifier("plus d'initiale par-dessus", avec.texte === "" && avec.avecToken);
verifier("EXACTEMENT la même taille que le rond à l'initiale",
         avec.largeur === sans.largeur && avec.hauteur === sans.hauteur && avec.largeur === 68, `${sans.largeur}×${sans.hauteur} → ${avec.largeur}×${avec.hauteur}`);
verifier("le même rond, le même cadre doré", avec.rond === sans.rond && avec.cadre === sans.cadre, `${avec.rond} ${avec.cadre}`);
// 62 px de rond + 3 px de cadre doré de chaque côté = 68 px, avant comme après.
verifier("l'image remplit le rond de 62 px (dans le cadre), rognée en cercle",
         avec.img && avec.img.l === 62 && avec.img.h === 62 && avec.img.rond === "50%" && avec.img.ajuste === "cover", JSON.stringify(avec.img));

console.log("\n3. LA FICHE BRUTE (URL_Token) MARCHE AUSSI");
const brut = await afficher({ URL_Token: "https://res.cloudinary.com/x/pion_morvak.png?v=2" });
verifier("lue depuis le document de la fiche", !!brut.img && /pion_morvak/.test(brut.img.src) && brut.img.charge, JSON.stringify(brut.img));

console.log("\n4. UN PION QUI NE SE CHARGE PAS");
const perdu = await afficher({ urlToken: "https://res.cloudinary.com/x/pion_perdu.png" });
verifier("l'initiale revient, pas d'image cassée", perdu.texte === "M" && !perdu.img && !perdu.avecToken, JSON.stringify(perdu));

console.log("\n5. ET SI LE PION DISPARAÎT, L'INITIALE REVIENT");
await afficher({ urlToken: "https://res.cloudinary.com/x/pion_morvak.png" });
const repris = await afficher({ prenom: "Ilda" });
verifier("une autre fiche sans pion : son initiale « I »", repris.texte === "I" && !repris.img, JSON.stringify(repris));

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
