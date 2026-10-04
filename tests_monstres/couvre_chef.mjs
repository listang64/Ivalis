// LE COUVRE-CHEF D'UNE ARMURE.
//
// Nico : « pour les armures, rajoute à l'algo un tirage aussi pour le casque
// lié à l'armure. Crée des variations : casque / chapeau / couvre-chef. Ils
// seront générés sur l'image de l'armure. Au moment d'équiper l'armure, ou de
// la choisir dans le loot, un popup demande si on veut équiper le casque.
// Comme l'image de référence c'est le perso de départ sans casque, c'est bon.
// La première armure reçue à la création n'a jamais de casque. »
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

const SRC_VARIATIONS = fs.readFileSync(`${RACINE}/variations_tenues.js`, 'utf-8');
const stockage = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
const charger = () => { const w = {}; new Function('window', 'localStorage', SRC_VARIATIONS)(w, stockage()); return w; };
const graine = (n) => { let x = n; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; };
const armure = (type, i, extra = {}) => ({ uid: "a" + i, nom: "Tenue " + i, emplacement: "Armure", type, rarete: "Rare", ...extra });
const TYPES_ARMURE = ["Armure légère", "Armure intermédiaire", "Armure lourde"];

console.log("\n=========================================================");
console.log("  LE COUVRE-CHEF D'UNE ARMURE");
console.log("=========================================================");

console.log("\n1. LES LISTES ET LE TIRAGE");
{
    const w = charger();
    TYPES_ARMURE.forEach(t => {
        const l = (w.COUVRE_CHEFS || {})[t] || [];
        verifier(`${t} : ${l.length} couvre-chefs, tous différents`,
                 l.length >= 30 && new Set(l.map(c => c.nom)).size === l.length && l.every(c => c.nom && c.description));
    });
    const tout = TYPES_ARMURE.flatMap(t => w.COUVRE_CHEFS[t]).map(c => (c.nom + " " + c.description).toLowerCase());
    verifier("des casques, des chapeaux et des coiffes",
             tout.some(x => x.includes("casque")) && tout.some(x => x.includes("chapeau")) && tout.some(x => /bonnet|voile|couronne|capuche|turban/.test(x)));
    verifier("rien de médiéval", !tout.some(x => /visière|heaume|chevalier|gothique|mailles/.test(x)));
    const corinthien = w.COUVRE_CHEFS["Armure lourde"].find(c => /corinthien/i.test(c.nom));
    verifier("un casque qui couvre le visage se porte relevé", !corinthien || /relevé/.test(corinthien.description));

    const lot = Array.from({ length: 10 }, (_, i) => armure(TYPES_ARMURE[i % 3], i));
    w.tirerVariationsTenues(lot, graine(4));
    verifier("chaque armure du butin reçoit son couvre-chef, de son type",
             lot.every((o, i) => o.casque && w.COUVRE_CHEFS[TYPES_ARMURE[i % 3]].some(c => c.nom === o.casque.nom)));
    const lourdes = lot.filter(o => o.type === "Armure lourde").map(o => o.casque.nom);
    verifier("jamais deux fois le même dans un lot", new Set(lourdes).size === lourdes.length);
    const depart = [armure("Armure lourde", 50)];
    charger().tirerVariationsTenues(depart, graine(4), { sansCasque: true });
    verifier("l'armure de départ n'en reçoit jamais", !!depart[0].variationTenue && !depart[0].casque);
    const arme = [{ uid: "e", nom: "Épée", emplacement: "Main", type: "Arme lourde CAC" }];
    charger().tirerVariationsTenues(arme, graine(1));
    verifier("une arme non plus", !arme[0].casque);
}

console.log("\n2. CE QUI PART AUX IA, ET CE QUI RESTE SUR L'OBJET (objets_ia.js)");
{
    const src = fs.readFileSync(`${RACINE}/objets_ia.js`, 'utf-8').replace(/^import[\s\S]*?;$/gm, '');
    const w = charger();
    const corps = [];
    const fauxFetch = async (url, options) => { corps.push(JSON.parse(options.body)); return { json: async () => ({ candidates: [] }) }; };
    const st = { getItem: (k) => (k === "ivalis_GEMINI_API_KEY" ? "cle" : null), setItem: () => {} };
    new Function('window', 'localStorage', 'fetch', 'db', 'doc', 'getDoc', 'updateDoc', 'console', src)
        (w, st, fauxFetch, {}, () => ({}), async () => ({ exists: () => false }), async () => {}, { log() {}, warn() {}, error() {} });

    const a = armure("Armure lourde", 1);
    w.tirerVariationsTenues([a], graine(9));
    const p = w.promptImageObjet(a, "", "STYLE");
    verifier("le dessinateur dessine le couvre-chef avec l'armure, vide", p.includes("COUVRE-CHEF DE LA TENUE") && p.includes(a.casque.nom) && /aucune tête/.test(p));
    const pDepart = w.promptImageObjet(a, "", "STYLE", { sansCasque: true });
    verifier("pas pour l'équipement de départ", !pDepart.includes("COUVRE-CHEF DE LA TENUE") && /AUCUN CASQUE/.test(pDepart));
    await w.decrireObjetsAvecMIA([a]);
    const fiche = JSON.parse(corps[0].contents[0].parts[0].text)[0];
    verifier("MIA le décrit aussi", fiche.couvre_chef_impose && fiche.couvre_chef_impose.includes(a.casque.nom)
             && /couvre_chef_impose/.test(corps[0].systemInstruction.parts[0].text));
    corps.length = 0;
    await w.decrireObjetsAvecMIA([a], { sansCasque: true });
    verifier("… sauf pour l'équipement de départ", !JSON.parse(corps[0].contents[0].parts[0].text)[0].couvre_chef_impose);

    const avec = w.promptAvatarArmure({ ...a, casquePorte: true });
    const sans = w.promptAvatarArmure({ ...a, casquePorte: false });
    const rien = w.promptAvatarArmure({ nom: "Tunique" });
    const ancienne = w.promptAvatarArmure({ nom: "Vieille cuirasse", casquePorte: true });
    verifier("portrait, couvre-chef choisi : il le porte, visage visible", avec.startsWith(w.PROMPT_AVATAR_ARMURE)
             && /PORTE sur la tête/.test(avec) && avec.includes(a.casque.nom) && /reconnaissable/.test(avec));
    verifier("portrait, tête nue choisie : il ne le dessine pas", /TÊTE NUE/.test(sans) && /ne le dessine PAS/.test(sans));
    verifier("armure de départ (aucun choix) : tête nue", /TÊTE NUE/.test(rien));
    verifier("couvre-chef choisi sur une armure sans couvre-chef enregistré : il le porte", /PORTE sur la tête/.test(ancienne));

    // L'image et le couvre-chef rejoignent le butin en base.
    const partie = { Butin: { parPersonnage: { H1: { items: [{ uid: "a1", nom: "Tenue 1" }] } }, pool: [] } };
    w.modifierPartie = async (f) => { const r = f(JSON.parse(JSON.stringify(partie))); if (r) Object.assign(partie, { _maj: r.maj }); return r; };
    w.PERSOS_PARTIE = [];
    w.champDocVersFront = {};
    await w.poserImageObjetEnBase("a1", "https://img/a1.png", a);
    const ecrit = (partie._maj || {})["Butin.parPersonnage.H1.items"] || [];
    verifier("l'image et le couvre-chef sont écrits sur l'objet du butin",
             ecrit[0] && ecrit[0].image === "https://img/a1.png" && ecrit[0].casque && ecrit[0].casque.nom === a.casque.nom, JSON.stringify(ecrit[0]));
}

console.log("\n3. À L'ÉQUIPEMENT : PORTER LE COUVRE-CHEF, OU RESTER TÊTE NUE");
{
    const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
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
    const r = await p.evaluate(async () => {
        window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Léa" }];
        window.signalerCompetencesBloquees = async () => {};
        window.oublierImages = async () => {};
        const suivis = [];
        window.suivreArmureEquipee = async (id, objet) => { suivis.push([id, objet.casquePorte]); return ""; };
        const armure = { uid: "a1", nom: "Cuirasse d'Arès", emplacement: "Armure", type: "Armure lourde",
                         casque: { nom: "Casque d'Arès", description: "casque rouge sang à crête haute" } };
        const equiper = window.equiperObjet("H1", armure);
        await new Promise(r => setTimeout(r, 100));
        const fen = document.getElementById("fenetre-choix-casque");
        const vu = { visible: !!fen && getComputedStyle(fen).display !== "none", texte: fen ? fen.textContent : "",
                     boutons: fen ? [...fen.querySelectorAll("button")].map(x => x.textContent) : [] };
        fen.querySelector('button[data-choix="oui"]').click();
        await equiper;
        const avec = (window.__majs || []).slice(-1)[0];

        window.__majs = [];
        const equiper2 = window.equiperObjet("H1", { ...armure, uid: "a2" });
        await new Promise(r => setTimeout(r, 100));
        document.querySelector('#fenetre-choix-casque button[data-choix="non"]').click();
        await equiper2;
        const sans = (window.__majs || []).slice(-1)[0];

        // Une armure sans couvre-chef enregistré (une ancienne, par exemple) :
        // la question est posée quand même, son image en montre un.
        window.__majs = [];
        const equiper3 = window.equiperObjet("H1", { uid: "a3", nom: "Tunique", emplacement: "Armure", type: "Armure légère" });
        await new Promise(r => setTimeout(r, 100));
        const fen3 = document.getElementById("fenetre-choix-casque");
        const vu3 = { visible: getComputedStyle(fen3).display !== "none", texte: fen3.textContent };
        fen3.querySelector('button[data-choix="non"]').click();
        await equiper3;
        await window.equiperObjet("H1", { uid: "e1", nom: "Épée", emplacement: "Main", type: "Arme lourde CAC" }, "Droite");
        return { vu, avec, sans, suivis, vu3, troisieme: (window.__majs || [])[0], armeFenetre: getComputedStyle(fen3).display };
    });
    // La fenêtre, ouverte, pour la voir.
    await p.evaluate(() => { window.__choix = window.demanderCasque({ nom: "Cuirasse d'Arès",
        casque: { nom: "Casque d'Arès", description: "casque rouge sang à crête haute" } }); });
    await p.waitForTimeout(150);
    await p.screenshot({ path: "/tmp/claude-0/choix_casque.png" });
    await p.evaluate(async () => { document.querySelector('#fenetre-choix-casque button[data-choix="non"]').click(); await window.__choix; });
    // L'onglet Caractéristiques de la fiche, avec son récapitulatif.
    await p.evaluate(() => {
        document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
        const fiche = document.getElementById("fenetre-fiche-perso");
        fiche.style.display = "flex"; fiche.style.left = "2vw"; fiche.style.top = "20px";
        document.getElementById("titre-nom-personnage").textContent = "Léa";
        document.getElementById("caracs-affiche").style.display = "block";
        window.afficherStatsFinales({ force: 13, dex: 8, con: 11, int: 15, sag: 10, cha: 9 }, "H1");
    });
    await p.waitForTimeout(150);
    await p.screenshot({ path: "/tmp/claude-0/recap_caracs.png" });
    verifier("équiper une armure à couvre-chef ouvre la fenêtre de choix",
             r.vu.visible && /Casque d'Arès/.test(r.vu.texte) && JSON.stringify(r.vu.boutons) === '["Avec le couvre-chef","Tête nue"]', JSON.stringify(r.vu));
    verifier("« Avec le couvre-chef » : l'armure équipée le retient",
             r.avec && r.avec.data.Equip_Armure && r.avec.data.Equip_Armure.casquePorte === true, JSON.stringify(r.avec && r.avec.data));
    verifier("« Tête nue » aussi", r.sans && r.sans.data.Equip_Armure.casquePorte === false);
    verifier("le portrait est redessiné selon le choix", JSON.stringify(r.suivis) === '[["H1",true],["H1",false],["H1",false]]', JSON.stringify(r.suivis));
    verifier("une armure sans couvre-chef enregistré : la question est posée quand même",
             r.vu3.visible && /Tunique/.test(r.vu3.texte) && r.troisieme && r.troisieme.data.Equip_Armure.casquePorte === false, r.vu3.texte.trim().slice(0, 100));
    verifier("une arme ne demande rien", r.armeFenetre === "none");
    verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
    await b.close();
}
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
