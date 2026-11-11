// LA CLASSE INQUISITEUR (v358, nouvelle).
//
// Nico : « NIVEAU 1 : les attaques magiques de base de feu ont 10 % de chance d'appliquer
// BRÛLURE (au lieu de 5 %) ; +1 dégât magique avec les techniques de feu. NIVEAU 3 : +1
// compétence ; résistance au feu ; si le personnage est un Ondaris, il devient totalement
// immunisé à BRÛLURE. NIVEAU 5 : Combustion instantanée — tous les ennemis sur la carte ont
// 75 % de chance d'appliquer BRÛLURE ; initiative 0, fatigue 0. NIVEAU 9 : tous les ennemis
// présents sur la carte et affectés par BRÛLURE subissent PEUR ; fatigue 70, initiative 50. »
// Ses réponses : le +1 sur ses attaques magiques de feu ; le niveau 9 s'appelle « Terreur
// ardente », la Peur y est sûre (75 % sur qui y résiste) ; la Combustion, une fois par combat,
// Brûlé 2 manches, résistance comprise, alliés épargnés ; la résistance au feu est la
// résistance habituelle, et l'Ondari est immunisé de toute source.
// (La Peur du jeu est une fuite immédiate, resoudrePeur : la Terreur ardente fait fuir.)
//
// Lancer : node tests_monstres/inquisiteur.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat, creerDes } from '../combat_etat.js';
import { resoudreCarte, tirerDesCarte, chanceFaceA, prisMalgreResistance, immuniseA, combustionInstantanee,
         CHANCE_COMBUSTION, coutDeTechnique, bonusFeu } from '../moteur_pur.js';
import { validerIntention, appliquerIntention } from '../cerveau_combat.js';
import { misEnScene } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const w = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/experience.js', 'utf-8'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);
const REGLES = {
    pvMax: w.pvMaxCombattant, fatigueMax: w.fatigueMaxCombattant,
    esquive: w.esquiveCombattant, parade: w.paradeCombattant,
    defPhysique: w.defPhysiqueCombattant, defMagique: w.defMagiqueCombattant,
    critique: w.critiqueCombattant, atouts: w.atoutRace, bonusEquip: w.bonusEquip
};
const XP = { 1: 0, 2: 700, 3: 1200, 4: 1800, 5: 2500, 8: 5200, 9: 6400 };
const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const inquisiteur = (niveau, extra = {}) => fiche("I", { classe: "Inquisiteur", xp: XP[niveau], ...extra });
// I en (0,0) ; M1 (2,0), M2 (3,0), M3 (0,-3) ; A, allié, (0,1).
const POS = { I: { q: 0, r: 0 }, M1: { q: 2, r: 0 }, M2: { q: 3, r: 0 }, M3: { q: 0, r: -3 }, A: { q: 0, r: 1 } };
const monde = (niveau = 9, extraI = {}, graine = 1) => {
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine, regles: REGLES, partie: { Tour_Combat: 1 }, positions: POS,
        combattants: [inquisiteur(niveau, extraI), fiche("M1"), fiche("M2"), fiche("M3"), fiche("A")] });
    e.ordre = ["I", "M1", "M2", "M3", "A"]; e.phase = "Resolution";
    return e;
};
const enTete = (e, carte) => { e.file = [{ id: "I", carte, initiative: 50, pas: 0 }, { id: "M1", carte: "X", initiative: 10, pas: 0 }]; return e; };
const brule = (c) => (c.etats || []).find(x => x.nom === "Brûlé");
const pos = (c) => `${c.q},${c.r}`;

console.log("\n1. LES PALIERS");
{
    const a = (n) => w.atoutClasse(inquisiteur(n));
    verifier("niveau 1 : 10 % de brûlure offerte, +1 au feu", a(1).brulureOfferte === 10 && a(1).degatsFeu === 1 && !(a(1).techniques || []).length, JSON.stringify(a(1)));
    verifier("niveau 3 : +1 compétence, résiste au Brûlé, l'Ondari immunisé",
             a(3).competences === 1 && JSON.stringify(a(3).resistances) === '["Brûlé"]' && a(3).immuniteBrulureOndari === true && !a(2).competences);
    verifier("niveau 5 : Combustion instantanée ; niveau 9 : + Terreur ardente (pas au 8)",
             JSON.stringify(a(5).techniques) === '["CLASSE_COMBUSTION"]' && JSON.stringify(a(9).techniques) === '["CLASSE_COMBUSTION","CLASSE_TERREUR_ARDENTE"]'
             && JSON.stringify(a(8).techniques) === '["CLASSE_COMBUSTION"]' && !(a(4).techniques || []).length);
    const co = w.TECHNIQUES_CLASSE.CLASSE_COMBUSTION, te = w.TECHNIQUES_CLASSE.CLASSE_TERREUR_ARDENTE;
    verifier("Combustion : init 0, fatigue 0, sur soi", co.Initiative === 0 && co.Fatigue === 0 && co.cible === "soi" && co.niveau === 5 && co.classe === "Inquisiteur");
    verifier("Terreur ardente : init 50, fatigue 70, sur soi ; le moteur fait payer 70",
             te.Initiative === 50 && te.Fatigue === 70 && te.cible === "soi" && te.niveau === 9 && coutDeTechnique("CLASSE_TERREUR_ARDENTE") === 70);
    verifier("la brûlure offerte : 10 % pour lui, 5 % sur la foudre, 5 % pour un autre",
             w.chanceElementOfferte(inquisiteur(1), "Brûlé") === 10 && w.chanceElementOfferte(inquisiteur(1), "Électrifié") === 5
             && w.chanceElementOfferte(fiche("X"), "Brûlé") === 5 && w.chanceElementOfferte(null, "Brûlé") === 5);
    verifier("les textes", /10 % de chance de brûler/.test(w.texteAtout("brulureOfferte", 10)) && /\+1 dégât magique à ses attaques de feu/.test(w.texteAtout("degatsFeu", 1))
             && /immunisé/.test(w.texteAtout("immuniteBrulureOndari", true)));
}

console.log("\n2. +1 DÉGÂT À SES ATTAQUES MAGIQUES DE FEU");
{
    const sort = (element, typeRes = "Magique") => ({ type: "carte", idLanceur: "I", idCarte: "S", critique: false,
        attaques: [{ nom: "Attaque Magique", valeurBrute: 10, typeRes, rangeMax: 3, ...(element ? { element } : {}), cibles: ["M1"] }], alterations: [],
        jets: { attaqueRatee: false, parCible: { M1: { esquive: false, etats: {} } } } });
    const pv = (action, e = monde(1)) => resoudreCarte(e, action).etat.combattants.M1.pv;
    verifier("un sort de feu : 11", pv(sort("Feu")) === 89, String(pv(sort("Feu"))));
    verifier("un sort de glace : 10 ; sans élément : 10 ; un coup physique : 10",
             pv(sort("Glace")) === 90 && pv(sort(null)) === 90 && pv(sort(null, "Physique")) === 90);
    const autre = monde(1); autre.combattants.I.atouts.degatsFeu = 0;
    verifier("un autre lanceur : 10", pv(sort("Feu"), autre) === 90);
    verifier("un soin de feu ne gagne rien", bonusFeu(monde(1).combattants.I, { element: "Feu", typeRes: "Magique", isHeal: true }) === 0);
}

console.log("\n3. RÉSISTANCE AU FEU ; L'ONDARI IMMUNISÉ");
{
    const humain3 = monde(3).combattants.I, ondari3 = monde(3, { race: "Ondari" }).combattants.I, ondari1 = monde(1, { race: "Ondari" }).combattants.I;
    verifier("Humain niveau 3 : résiste (75 → 50), pas immunisé", chanceFaceA(humain3, "Brûlé", 75) === 50 && !immuniseA(humain3, "Brûlé"));
    verifier("Ondari niveau 3 : immunisé — 0 % même à 100", immuniseA(ondari3, "Brûlé") && chanceFaceA(ondari3, "Brûlé", 100) === 0
             && JSON.stringify(ondari3.atouts.immunisesA) === '["Brûlé"]');
    verifier("…mais pas aux autres états", chanceFaceA(ondari3, "Glacé", 40) === 40);
    verifier("Ondari niveau 1 : résiste par sa race, pas immunisé", chanceFaceA(ondari1, "Brûlé", 75) === 50 && !immuniseA(ondari1, "Brûlé"));
    verifier("un état « à coup sûr » ne le prend jamais", [1, 2, 3].every(g => prisMalgreResistance(ondari3, "Brûlé", creerDes(g)) === false));
    // Un critique impose les états, sauf à qui y résiste — l'immunisé, jamais.
    const e = monde(3, { race: "Ondari" });
    const feu = { type: "carte", idLanceur: "M1", idCarte: "X", critique: true,
        attaques: [], alterations: [{ nom: "Brûlé", chance: 100, duree: 2, cibles: ["I"] }] };
    const jets = tirerDesCarte(e, feu, "M1", true, creerDes(7));
    verifier("un Brûlé à 100 %, critique : il n'est pas brûlé", jets.parCible.I.etats["Brûlé"] === false
             && !brule(resoudreCarte(e, { ...feu, jets }).etat.combattants.I));
}

console.log("\n4. LA COMBUSTION INSTANTANÉE");
{
    const lancer = { id: "C1", type: "classe", acteur: "I", idCarte: "CLASSE_COMBUSTION" };
    const e = enTete(monde(5), "CLASSE_COMBUSTION");
    verifier("niveau 5 : acceptée", validerIntention(e, lancer).ok, validerIntention(e, lancer).raison || "");
    verifier("niveau 4 : il ne l'a pas", !validerIntention(enTete(monde(4), "CLASSE_COMBUSTION"), lancer).ok);
    // Le moteur pose ce que le cerveau a tiré.
    const s = monde(5); s.combattants.M2.etats = [{ nom: "Brûlé", duree: 1 }];
    const et = combustionInstantanee(s, "I", { M1: true, M2: true, M3: false });
    verifier("pris : Brûlé 2 manches ; déjà brûlé : renouvelé à 2 ; raté : dit", brule(s.combattants.M1).duree === 2 && brule(s.combattants.M2).duree === 2
             && !brule(s.combattants.M3) && et.some(x => x.type === "etatRate" && x.cible === "M3"));
    verifier("ni l'allié ni lui-même", !brule(s.combattants.A) && !brule(s.combattants.I));
    const pas = appliquerIntention(e, lancer);
    verifier("aucune fatigue, une fois par combat", pas.etat.combattants.I.fatigue === 100
             && !validerIntention(enTete(clonerEtat(pas.etat), "CLASSE_COMBUSTION"), lancer).ok);
    verifier("rejoué depuis le journal : mêmes brûlures", ["M1", "M2", "M3"].every(id =>
             !!brule(appliquerEntree(e, pas.entree).combattants[id]) === !!brule(pas.etat.combattants[id])));
    verifier("l'état reste cohérent", verifierEtatCombat(pas.etat).length === 0, verifierEtatCombat(pas.etat).join(" | "));
    const titre = misEnScene(pas.entree.etapes.find(x => x.type === "techniqueClasse"), pas.etat);
    verifier("à l'écran : « 🔥 Combustion instantanée »", titre && /Combustion instantanée/.test(titre.texte));
    // 75 % sur 200 graines × 3 ennemis ; 50 % sur des ennemis qui résistent.
    let n = 0, nR = 0, total = 0;
    for (let g = 1; g <= 200; g++) {
        const x = enTete(monde(5, {}, g), "CLASSE_COMBUSTION");
        const c = appliquerIntention(x, lancer).etat.combattants;
        n += ["M1", "M2", "M3"].filter(id => brule(c[id])).length;
        const y = enTete(monde(5, {}, g), "CLASSE_COMBUSTION");
        ["M1", "M2", "M3"].forEach(id => { y.combattants[id].atouts.resistances = ["Brûlé"]; });
        const cy = appliquerIntention(y, lancer).etat.combattants;
        nR += ["M1", "M2", "M3"].filter(id => brule(cy[id])).length;
        total += 3;
    }
    verifier(`75 % de brûlés (${CHANCE_COMBUSTION}) : ${(100 * n / total).toFixed(1)} %`, Math.abs(100 * n / total - 75) < 5);
    verifier(`qui résiste : 50 % — ${(100 * nR / total).toFixed(1)} %`, Math.abs(100 * nR / total - 50) < 6);
}

console.log("\n5. LA TERREUR ARDENTE");
{
    const lancer = { id: "T1", type: "classe", acteur: "I", idCarte: "CLASSE_TERREUR_ARDENTE" };
    const prep = () => { const e = enTete(monde(9), "CLASSE_TERREUR_ARDENTE");
        e.combattants.M1.etats = [{ nom: "Brûlé", duree: 2 }]; e.combattants.M3.etats = [{ nom: "Brûlé", duree: 2 }]; return e; };
    const e = prep();
    verifier("niveau 9 : acceptée", validerIntention(e, lancer).ok, validerIntention(e, lancer).raison || "");
    verifier("niveau 8 : il ne l'a pas", !validerIntention(enTete(monde(8), "CLASSE_TERREUR_ARDENTE"), lancer).ok);
    const pauvre = prep(); pauvre.combattants.I.fatigue = 69;
    verifier("69 d'énergie : refusée (il en faut 70)", !validerIntention(pauvre, lancer).ok);
    const pas = appliquerIntention(e, lancer);
    const c = pas.etat.combattants;
    const d = (id) => Math.max(Math.abs(c[id].q), Math.abs(c[id].r), Math.abs(-c[id].q - c[id].r));
    verifier("il paie 70 (100 → 30)", c.I.fatigue === 30, String(c.I.fatigue));
    verifier("les brûlés (M1, M3) fuient loin de lui", pos(c.M1) !== "2,0" && pos(c.M3) !== "0,-3" && d("M1") > 2 && d("M3") > 3,
             `${pos(c.M1)} ${pos(c.M3)}`);
    verifier("M2, pas brûlé, ne bouge pas ; l'allié non plus", pos(c.M2) === "3,0" && pos(c.A) === "0,1");
    verifier("rejoué depuis le journal : mêmes places", ["M1", "M2", "M3"].every(id => pos(appliquerEntree(e, pas.entree).combattants[id]) === pos(c[id])));
    verifier("une fois par combat", !validerIntention(enTete(clonerEtat(pas.etat), "CLASSE_TERREUR_ARDENTE"), lancer).ok);
    const titre = misEnScene(pas.entree.etapes.find(x => x.type === "techniqueClasse"), pas.etat);
    verifier("à l'écran : « 😱 Terreur ardente »", titre && /Terreur ardente/.test(titre.texte));
    // Qui résiste à la Peur : 75 % (un dé), le refus dit.
    let fuis = 0, dits = 0;
    for (let g = 1; g <= 200; g++) {
        const x = prep(); x.graine = g; x.combattants.M1.atouts.resistances = ["Peur"];
        const r = appliquerIntention(x, lancer);
        if (pos(r.etat.combattants.M1) !== "2,0") fuis++;
        if (r.entree.etapes.some(s => s.type === "etatRate" && s.cible === "M1" && s.nom === "Peur")) dits++;
    }
    verifier(`qui résiste à la Peur : environ 75 % de fuites (${fuis / 2} %), le refus dit`, Math.abs(fuis / 2 - 75) < 8 && fuis + dits === 200, `${fuis}/${dits}`);
    const aucun = enTete(monde(9), "CLASSE_TERREUR_ARDENTE");
    const vide = appliquerIntention(aucun, lancer).etat.combattants;
    verifier("personne de brûlé : personne ne fuit (et il paie quand même)", ["M1", "M2", "M3"].every(id => pos(vide[id]) === pos(aucun.combattants[id]))
             && vide.I.fatigue === 30);
}

// La vraie page : la fiche, le choix de la classe, la Forge.
const RACINE = '/home/user/Ivalis';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id }); export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {}; export const updateDoc = async () => {}; export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "n" }); export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v; export const increment = (n) => n;
  export const serverTimestamp = () => Date.now(); export const onSnapshot = () => () => {};
  export const query = (...a) => ({a}); export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
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

console.log("\n6. LA PAGE : LA FICHE, LE CHOIX, LA FORGE");
{
  const r = await p.evaluate(async () => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    await window.ouvrirChoixClasse();
    const carte = document.querySelector('.carte-classe[data-classe="CLASSE_INQUISITEUR"]');
    const bientot = !!(carte && (carte.dataset.bientot === "true" || carte.querySelector(".carte-classe-bientot-texte")));
    window.ouvrirFicheClasse("CLASSE_INQUISITEUR");
    const d = document.getElementById("descriptif-fiche-classe");
    const ouverte = getComputedStyle(document.getElementById("vue-fiche-classe")).display !== "none";
    // La Forge : l'état offert par l'élément Feu d'une Attaque Magique.
    window.forgeState = window.forgeState || {};
    const action = { element: "Feu", baseEffet: { Nom: "Attaque Magique" } };
    window.forgeState.statsPerso = { classe: "Inquisiteur", race: "Humain", xp: 0 };
    const offertI = window.chanceOfferteForge({ Nom: "Brûlé" }, action);
    window.forgeState.statsPerso = { classe: "Sorcier", race: "Humain", xp: 0 };
    const offertS = window.chanceOfferteForge({ Nom: "Brûlé" }, action);
    return { existe: !!carte, bientot, ouverte, niveaux: d ? [...d.querySelectorAll(".palier-classe-niveau")].map(x => x.textContent.trim()) : [],
             texte: d ? d.textContent : "", offertI, offertS };
  });
  verifier("la classe est dans la grille, sans « Arrive bientôt »", r.existe && !r.bientot);
  verifier("sa fiche s'ouvre : Niv. 1 / 3 / 5 / 9", r.ouverte && JSON.stringify(r.niveaux) === '["Niv. 1","Niv. 3","Niv. 5","Niv. 9"]', JSON.stringify(r.niveaux));
  verifier("la fiche dit les 10 %, le +1, l'Ondari, la Combustion et la Terreur ardente",
           /10 %/.test(r.texte) && /\+1 dégât magique/.test(r.texte) && /Ondari/.test(r.texte) && /Combustion instantanée/.test(r.texte) && /Terreur ardente/.test(r.texte));
  verifier("la Forge : Feu → 10 % de Brûlé offerts pour lui, 5 % pour un Sorcier", r.offertI === 10 && r.offertS === 5, `${r.offertI} / ${r.offertS}`);
}
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
