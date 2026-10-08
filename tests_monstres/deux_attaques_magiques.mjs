// DEUX ATTAQUES MAGIQUES SUR UNE MÊME COMPÉTENCE
//
// Nico : « Actuellement je ne peux pas mettre deux attaques magiques
// différentes sur une même compétence. Fais en sorte qu'on puisse mettre deux
// attaques magiques différentes sur une même compétence. »
//
// Ce que le banc vérifie, sur la vraie page :
//   • une Attaque Magique posée, le « + » d'une deuxième reste allumé ;
//   • la popup des éléments grise celui que la carte a déjà : deux attaques,
//     deux éléments ;
//   • deux au plus ; et seulement entre Attaques Magiques (un Mot de pouvoir
//     reste seul) ;
//   • la pastille d'une attaque ne peut pas prendre l'élément de l'autre ;
//   • enregistrée, chaque action emporte son élément ;
//   • au combat, chaque attaque frappe de SON élément : l'état offert de
//     l'éclat de glace n'a pas fait de la boule de feu un sort de glace.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat } from '../combat_etat.js';
import { resoudreCarte } from '../moteur_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(70)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// =========================================================================
//  LA VRAIE PAGE
// =========================================================================
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
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async (ref) => { const d = (window.__docs || {})[ref.chemin]; return { exists: () => !!d, data: () => d || {} }; };
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data }); };
  export const updateDoc = async () => {};
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
const EFFETS = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/effets_reels.json', 'utf-8'));
const EFFETS_PAR_ID = Object.fromEntries((Array.isArray(EFFETS) ? EFFETS : Object.values(EFFETS)).map(e => [e.id, e]));
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

await p.evaluate(async (EFFETS) => {
  window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
  window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
  // Les valeurs du grimoire en ligne (l'instantané des bancs est plus ancien).
  ["EFF_BRULE", "EFF_GLACE", "EFF_ELECTRIFIE"].forEach(id => {
    Object.assign(window.EFFETS_BDD_CACHE[id], { Pourcent_Base: 15, Pourcent_Max: 75 });
  });
  window.EFFETS_BDD_CACHE.EFF_GLACE.Effet_Base = "15% chance de gelée sur 2 tour (Max 75%)";
  window.__docs = { "Personnages/P1": { Classe: "", XP: 0, Race: "Humain" }, "Caracteristiques/P1": { Intelligence: 16, Sagesse: 12 } };
  document.getElementById("champ-id-personnage").value = "P1";
  window.OUVERTURE_FORGE_EN_COURS = false;
  await window.ouvrirCreationCompetence();
  window.forgeState.armePrincipale = "Magie";
  window.rafraichirForge();
}, EFFETS_PAR_ID);

const etatMenu = (id) => p.evaluate((id) => {
  window.ouvrirMenuAjoutForge();
  const bouton = document.querySelector(`#forge-menu-caracs button[onclick*="'${id}'"]`);
  const r = bouton ? !bouton.disabled : null;
  window.fermerMenuAjoutForge();
  return r;
}, id);
const lirePopup = () => p.evaluate(() => {
  const m = document.getElementById("modale-choix-element");
  return { visible: getComputedStyle(m).display === "block",
           ronds: [...m.querySelectorAll(".forge-element-rond")].map(b => ({ el: b.dataset.element, pris: b.classList.contains("pris"),
             disabled: b.disabled, etat: b.querySelector(".forge-element-etat").textContent.trim(),
             opacite: getComputedStyle(b).opacity })) };
});

console.log("\n1. UNE ATTAQUE MAGIQUE POSÉE : UNE DEUXIÈME RESTE POSSIBLE");
{
  await p.evaluate(() => window.ajouterComposantPrincipal("EFF_ATTAQUE_MAGIQUE"));
  await p.click('#modale-choix-element .forge-element-rond[data-element="Feu"]');
  const n = await p.evaluate(() => window.forgeState.actions.map(a => a.element));
  verifier("la première se pose, liée au Feu", JSON.stringify(n) === '["Feu"]', JSON.stringify(n));
  verifier("le « + » de l'Attaque Magique reste allumé", await etatMenu("EFF_ATTAQUE_MAGIQUE") === true);
  verifier("le Mot de pouvoir, lui, reste verrouillé (une attaque déjà là)", await etatMenu("EFF_MOTS_DE_POUVOIRS") === false);
}

console.log("\n2. LA POPUP GRISE L'ÉLÉMENT DÉJÀ SUR LA CARTE");
{
  await p.evaluate(() => window.ajouterComposantPrincipal("EFF_ATTAQUE_MAGIQUE"));
  const v = await lirePopup();
  const feu = v.ronds.find(r => r.el === "Feu"), glace = v.ronds.find(r => r.el === "Glace");
  verifier("la popup s'ouvre", v.visible);
  verifier("le Feu est grisé, intouchable, « déjà sur la carte »",
           feu.pris && feu.disabled && /déjà sur la carte/.test(feu.etat) && parseFloat(feu.opacite) < 0.6, JSON.stringify(feu));
  verifier("Glace et Foudre restent libres", !glace.pris && !glace.disabled && !v.ronds.find(r => r.el === "Foudre").pris);
  if (process.env.CAPTURE_DIR) await p.screenshot({ path: process.env.CAPTURE_DIR + "/deux_sorts_popup.png" });
  // Même forcé (un clic programmé), le Feu ne passe pas.
  await p.evaluate(() => window.choisirElementForge("Feu"));
  const encore = await p.evaluate(() => ({ n: window.forgeState.actions.length,
    ouverte: getComputedStyle(document.getElementById("modale-choix-element")).display === "block" }));
  verifier("même forcé, le Feu ne pose rien et la popup reste ouverte", encore.n === 1 && encore.ouverte, JSON.stringify(encore));
  await p.click('#modale-choix-element .forge-element-rond[data-element="Glace"]');
  const deux = await p.evaluate(() => window.forgeState.actions.map(a => a.element));
  verifier("Glace : la deuxième Attaque Magique se pose", JSON.stringify(deux) === '["Feu","Glace"]', JSON.stringify(deux));
  const carte = await p.evaluate(() => ({
    pastilles: [...document.querySelectorAll("#forge-contenu-carte .forge-element-pastille")].map(x => x.textContent.trim()),
    offerts: [...document.querySelectorAll("#forge-contenu-carte .forge-sous-effet-offert")].map(x => x.textContent.replace(/\s+/g, " ").trim()),
    entete: document.getElementById("forge-element-affichage").textContent }));
  verifier("deux pastilles sur la carte : 🔥 Feu et ❄️ Glace",
           carte.pastilles.length === 2 && /Feu/.test(carte.pastilles[0]) && /Glace/.test(carte.pastilles[1]), JSON.stringify(carte.pastilles));
  verifier("chacune son état offert : Brûlé et Glacé",
           carte.offerts.some(x => /Brûlé/.test(x)) && carte.offerts.some(x => /Glacé/.test(x)), JSON.stringify(carte.offerts));
  verifier("l'en-tête dit les deux éléments", /FEU/.test(carte.entete) && /GLACE/.test(carte.entete), carte.entete);
}

console.log("\n3. DEUX AU PLUS");
{
  verifier("deux Attaques Magiques posées : le « + » s'éteint", await etatMenu("EFF_ATTAQUE_MAGIQUE") === false);
  await p.evaluate(() => { window.forgeState.actions.pop(); window.rafraichirForge(); });
  verifier("on en retire une : il se rallume", await etatMenu("EFF_ATTAQUE_MAGIQUE") === true);
  await p.evaluate(() => window.ajouterComposantPrincipal("EFF_ATTAQUE_MAGIQUE"));
  await p.click('#modale-choix-element .forge-element-rond[data-element="Glace"]');
}

console.log("\n4. LA PASTILLE NE PREND PAS L'ÉLÉMENT DE L'AUTRE");
{
  await p.click("#forge-contenu-carte .forge-element-pastille >> nth=0");
  const v = await lirePopup();
  const r = (el) => v.ronds.find(x => x.el === el);
  verifier("changer le Feu : la Glace (l'autre sort) est grisée", r("Glace").pris && r("Glace").disabled, JSON.stringify(r("Glace")));
  verifier("le Feu, son élément actuel, reste choisissable", !r("Feu").pris && !r("Feu").disabled);
  await p.click('#modale-choix-element .forge-element-rond[data-element="Foudre"]');
  const els = await p.evaluate(() => window.forgeState.actions.map(a => a.element));
  verifier("passé à la Foudre : Foudre + Glace", JSON.stringify(els) === '["Foudre","Glace"]', JSON.stringify(els));
  await p.click("#forge-contenu-carte .forge-element-pastille >> nth=0");
  await p.click('#modale-choix-element .forge-element-rond[data-element="Feu"]');
}

console.log("\n5. UN MOT DE POUVOIR NE S'ACCOMPAGNE PAS D'UNE ATTAQUE MAGIQUE");
{
  const r = await p.evaluate(() => {
    const sauve = window.forgeState.actions;
    window.forgeState.actions = [{ idInst: "M", baseEffet: window.forgeState.effetsBDD.find(e => e.id === "EFF_MOTS_DE_POUVOIRS"),
                                   count: 1, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }];
    window.rafraichirForge();
    const permis = window.attaqueEncorePermiseForge("Attaque Magique");
    window.forgeState.actions = sauve; window.rafraichirForge();
    return permis;
  });
  verifier("Mot de pouvoir sur la carte : pas d'Attaque Magique en plus", r === false);
}

console.log("\n6. ENREGISTRÉE : CHAQUE ACTION EMPORTE SON ÉLÉMENT");
let enregistree = null;
{
  enregistree = await p.evaluate(async () => {
    document.getElementById("forge-nom").value = "Feu et glace";
    window.rafraichirForge();
    const bouton = !document.getElementById("btn-valider-forge").disabled;
    window.__ecrits = [];
    await window.sauvegarderCompetence();
    const e = window.__ecrits.find(x => /Competences/.test(x.chemin));
    return e ? { bouton, Element: e.data.Element, actions: e.data.Composants.actions.map(a => ({ id: a.baseEffetId, element: a.element })),
                 effets: e.data.Effets_Compiles.map(x => x.nom + ": " + x.desc) } : { bouton };
  });
  verifier("le bouton Forger est allumé", enregistree.bouton);
  verifier("deux actions : Attaque Magique Feu et Attaque Magique Glace",
           enregistree.actions && JSON.stringify(enregistree.actions) === JSON.stringify([
             { id: "EFF_ATTAQUE_MAGIQUE", element: "Feu" }, { id: "EFF_ATTAQUE_MAGIQUE", element: "Glace" }]),
           JSON.stringify(enregistree.actions));
  verifier("la carte compilée dit les deux éléments",
           enregistree.effets && enregistree.effets.some(x => /🔥 Feu/.test(x)) && enregistree.effets.some(x => /❄️ Glace/.test(x)),
           JSON.stringify(enregistree.effets));
}

console.log("\n7. AU COMBAT : CHAQUE ATTAQUE FRAPPE DE SON ÉLÉMENT");
let extraits = null;
{
  extraits = await p.evaluate(async (actions) => {
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", camp: "Allié", prenom: "Ilda", classe: "", race: "Humain", xp: 0,
                              PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }];
    window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 } };
    const carte = (acts) => ({ Nom: "Sort", Arme: "Magie", Fatigue: 10, Initiative: 50, Composants: { actions: acts } });
    const a = (extra) => ({ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 2, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {}, ...extra });
    window.COMPETENCES_CACHE = {
      DEUX: carte([a({ element: "Feu" }), a({ element: "Glace" })]),
      // La boule de feu glace aussi d'elle-même : ce Glacé est à elle, pas à
      // l'éclair qui la suit.
      FEU_QUI_GLACE: carte([a({ element: "Feu", mods: { EFF_GLACE: 1 } }), a({ element: "Foudre" })]),
      FORGEE: carte(actions.map(x => a({ element: x.element })))
    };
    window.CACHE_COMPETENCES_GLOBAL = { H1: window.COMPETENCES_CACHE };
    const out = {};
    for (const id of Object.keys(window.COMPETENCES_CACHE)) {
      const r = (await window.demarrerCiblage(id, { extraire: true, idLanceur: "H1" })) || {};
      out[id] = { attaques: (r.attaques || []).map(x => ({ element: x.element, etats: x.etatsElements, valeur: x.valeurBrute, typeRes: x.typeRes })),
                  alt: (r.alterations || []).map(x => `${x.nom}:${x.chance}`) };
    }
    return out;
  }, enregistree.actions || []);
  const d = extraits.DEUX;
  verifier("deux attaques extraites", d.attaques.length === 2, JSON.stringify(d.attaques));
  verifier("la première : Feu, [Brûlé] — pas Glacé", d.attaques[0] && d.attaques[0].element === "Feu"
           && JSON.stringify(d.attaques[0].etats) === '["Brûlé"]', JSON.stringify(d.attaques[0]));
  verifier("la seconde : Glace, [Glacé] — pas Brûlé", d.attaques[1] && d.attaques[1].element === "Glace"
           && JSON.stringify(d.attaques[1].etats) === '["Glacé"]', JSON.stringify(d.attaques[1]));
  verifier("chacune son état offert : Brûlé 5 %, Glacé 5 %",
           d.alt.includes("Brûlé:5") && d.alt.includes("Glacé:5"), JSON.stringify(d.alt));
  const f = extraits.FEU_QUI_GLACE;
  verifier("boule de feu qui glace : Feu + Glace ; l'éclair, Foudre seule",
           JSON.stringify(f.attaques.map(x => x.etats)) === '[["Brûlé","Glacé"],["Électrifié"]]', JSON.stringify(f.attaques.map(x => x.etats)));
  verifier("la technique forgée à l'écran donne la même chose",
           JSON.stringify(extraits.FORGEE.attaques.map(x => x.etats)) === '[["Brûlé"],["Glacé"]]', JSON.stringify(extraits.FORGEE.attaques));
}

console.log("\n8. LE NOYAU : UNE CRÉATURE INSENSIBLE AU GEL N'ENCAISSE MOINS QUE L'ÉCLAT DE GLACE");
{
  const w = {};
  new Function('window', fs.readFileSync('/home/user/Ivalis/experience.js', 'utf-8'))(w);
  new Function('window', SRC_STATS_COMMUNES)(w);
  const REGLES = { pvMax: w.pvMaxCombattant, fatigueMax: w.fatigueMaxCombattant, esquive: w.esquiveCombattant,
    parade: w.paradeCombattant, defPhysique: w.defPhysiqueCombattant, defMagique: w.defMagiqueCombattant,
    critique: w.critiqueCombattant, atouts: w.atoutRace, bonusEquip: w.bonusEquip };
  const fiche = (id, extra = {}) => ({ idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0, PV_Max: 400, PV_Actuels: 400, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra });
  const e = construireEtatCombat({ idPartie: "P", cerveau: "H", graine: 1,
    combattants: [fiche("H"), fiche("M1", { Palier: "Normal", resistancesElementaires: ["Glacé"] })],
    positions: { H: { q: 0, r: 0 }, M1: { q: 1, r: 0 } }, partie: { Tour_Combat: 1 }, regles: REGLES });
  e.ordre = ["H", "M1"]; e.phase = "Resolution";
  const frappe = (attaques) => {
    const r = resoudreCarte(e, { type: "carte", idLanceur: "H", idCarte: "C", critique: false,
      attaques: attaques.map(x => ({ nom: "Attaque Magique", valeurBrute: 100, typeRes: "Magique", cibles: ["M1"], ...x })),
      alterations: [], jets: { attaqueRatee: false, parCible: { M1: { esquive: false, etats: {} } } } });
    return 400 - r.etat.combattants.M1.pv;
  };
  const immunites = (e.combattants.M1.atouts || {}).immunites || [];
  const [feu, glace] = (extraits.DEUX.attaques || []).map(x => ({ element: x.element, etatElement: x.etats && x.etats[0], etatsElements: x.etats }));
  const total = frappe([feu, glace]);
  verifier("la créature résiste bien au gel", immunites.includes("Glacé"), JSON.stringify(immunites));
  verifier("Feu 100 + Glace 100 − 20 % = 180 (la boule de feu passe en entier)", total === 180, String(total));
}

verifier("aucune erreur JavaScript pendant tout le banc", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
