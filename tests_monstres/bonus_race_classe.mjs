// LES BONUS DE RACE ET DE CLASSE, EN TOUTES LETTRES.
//
// Nico : « dans l'onglet Statistiques des fiches persos, en dessous, dans un
// encart à part, j'aimerais le détail des bonus accordés par la classe et la
// race. »
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';

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

const w = {};
new Function('window', fs.readFileSync(`${RACINE}/experience.js`, 'utf-8'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);
const XP = { 1: 0, 5: 2500, 10: 7900 };

console.log("\n=========================================================");
console.log("  LES BONUS DE RACE ET DE CLASSE");
console.log("=========================================================");

console.log("\n1. CHAQUE ATOUT A SA PHRASE");
{
    const cles = new Map();
    Object.values(w.ATOUTS_RACES).forEach(a => Object.entries(a).forEach(([k, v]) => cles.set(k, v)));
    Object.values(w.ATOUTS_CLASSES).forEach(p => p.forEach(a => Object.entries(a).forEach(([k, v]) => { if (k !== "niveau") cles.set(k, v); })));
    const sansPhrase = [...cles.entries()].filter(([k, v]) => w.texteAtout(k, v).startsWith(k + " :"));
    verifier(`les ${cles.size} sortes d'atouts existantes sont toutes écrites en clair`, sansPhrase.length === 0,
             sansPhrase.map(([k]) => k).join(", "));
    verifier("exemples : esquive, immunités, technique",
             w.texteAtout("esquive", 3) === "+3 % d'esquive" && w.texteAtout("immunites", ["Glacé"]) === "Insensible : Glacé (−20 % des sorts de Glace)"
             && w.texteAtout("immunites", ["Étourdi"]) === "Insensible : Étourdi"
             && /Technique : Mur de bouclier/.test(w.texteAtout("techniques", ["CLASSE_MUR_BOUCLIER"])));
    verifier("un atout inconnu se montre tel quel, plutôt que caché", w.texteAtout("nouveau", 4) === "nouveau : 4");
}

console.log("\n2. LE DÉTAIL D'UN HÉROS");
{
    const d = w.detailBonusRaceClasse({ race: "Humain", classe: "Hoplite", xp: XP[5] });   // (ex-Hoplite : le Protecteur)
    verifier("Humain : +10 de fatigue maximum", d.race.nom === "Humain" && JSON.stringify(d.race.lignes) === '["+10 de fatigue maximum"]',
             JSON.stringify(d.race.lignes));
    verifier("Hoplite niveau 5 : paliers 1 et 5 atteints, 10 à venir",
             JSON.stringify(d.classe.paliers.map(p => [p.niveau, p.atteint])) === '[[1,true],[5,true],[10,false]]');
    verifier("le palier 1 dit +7 % de parade et 15 % de provocation (classe lue « Protecteur »)",
             d.classe.nom === "Protecteur"
             && JSON.stringify(d.classe.paliers[0].lignes) === '["+7 % de parade","15 % de chance de provoquer la cible de chacune de ses attaques"]', JSON.stringify(d.classe.paliers[0].lignes));
    const sans = w.detailBonusRaceClasse({ race: "", classe: "Élémentariste" });
    verifier("une classe sans bonus définis : aucun palier", sans.classe.paliers.length === 0 && sans.race.lignes.length === 0);
}

console.log("\n3. L'ENCART DANS LA FICHE");
{
    const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 1194, height: 900 } });
    const erreurs = [];
    p.on('pageerror', e => erreurs.push(e.message));
    await p.route('**', r => {
        const url = r.request().url();
        if (url.startsWith(base)) return r.continue();
        if (url.includes('firebase-app.js')) return r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP });
        if (url.includes('firebase-firestore.js')) return r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE });
        return r.abort();
    });
    await p.goto(base + '/index.html');
    await p.waitForTimeout(2000);
    const r = await p.evaluate(() => {
        document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
        const fiche = document.getElementById("fenetre-fiche-perso");
        fiche.style.display = "flex"; fiche.style.left = "2vw"; fiche.style.top = "10px";
        document.getElementById("titre-nom-personnage").textContent = "Morvak";
        const bouton = [...document.querySelectorAll(".onglet-btn")].find(x => x.textContent.trim() === "Statistiques");
        if (bouton) bouton.click();
        window.afficherStatsCombat({ prenom: "Morvak", race: "Gob", classe: "Nécromancien", XP: 2500, PV_Max: 50, Fatigue_Max: 100, Regeneration: 35 });
        const encart = document.getElementById("encart-bonus-race-classe");
        const race = encart.querySelector('[data-bloc="race"]');
        const classe = encart.querySelector('[data-bloc="classe"]');
        const contenu = document.querySelector("#fenetre-fiche-perso .contenu-onglet.actif") || encart.parentElement;
        contenu.scrollTop = contenu.scrollHeight;
        return {
            dansStats: !!encart.closest("#onglet-stats"),
            race: race.textContent, classe: classe.textContent,
            paliers: [...classe.querySelectorAll(".bonus-palier")].map(x => [x.dataset.niveau, x.classList.contains("bonus-palier-verrouille")])
        };
    });
    await p.screenshot({ path: "/tmp/claude-0/bonus_race_classe.png" });
    verifier("l'encart est dans l'onglet Statistiques", r.dansStats);
    verifier("la race (Gob) : esquive et compétence", /Gob/.test(r.race) && /\+3 % d'esquive/.test(r.race) && /\+1 compétence/.test(r.race), r.race.replace(/\s+/g, " ").trim());
    // (Le Nécromancien est devenu le Sorcier : la fiche qui porte l'ancien nom
    // se lit sous le nouveau. Ténèbres, +1 portée, pas de malus au contact.)
    verifier("la classe (Nécromancien → Sorcier) : Ténèbres, +1 portée, sans malus — plus de +8 PV",
             /Sorcier/.test(r.classe) && !/Nécromancien/.test(r.classe) && /Ténèbres/.test(r.classe)
             && /\+1 case de portée/.test(r.classe) && /Aucune réduction au contact/.test(r.classe) && !/\+8 PV/.test(r.classe),
             r.classe.replace(/\s+/g, " ").trim().slice(0, 160));
    verifier("niveau 5 : le Transfert du niveau 10 est grisé, « à venir »",
             JSON.stringify(r.paliers) === '[["1",false],["5",false],["10",true]]' && /à venir/.test(r.classe), JSON.stringify(r.paliers));
    verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
    await b.close();
}
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
