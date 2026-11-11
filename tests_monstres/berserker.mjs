// LA CLASSE BERSERKER (v360, nouvelle ; « Berzerker » jusque-là, pas encore jouable).
//
// Nico : « NIVEAU 1 : −20 % de PV max ; reçoit 30 % de soins supplémentaires. NIVEAU 3 :
// PASSIF Rage — sous 25 % de ses PV, la Rage se déclenche pendant 2 tours : parade 0 %,
// esquive 0 %, résistances +15 %, dégâts +20 % ; elle peut se déclencher à nouveau une fois
// finie, s'il est repassé au-dessus de 25 % avant de redescendre. NIVEAU 5 : Régénération
// insolente — 80 % de chance de provoquer tous les ennemis, où qu'ils soient ; il récupère
// 20 PV ; initiative 100. NIVEAU 9 : peut s'équiper de 2 armes à deux mains, en perdant 10 %
// de résistances physique et magique ; sans elles, +2 dégâts. »
// Ses réponses : le nom « Berserker » ; Rage : +15 de résistances physique et magique, ×1,2
// sur tous ses dégâts (opportunité comprise) ; Régénération : 0 fatigue, une fois par combat,
// Provoqué 2 manches, soin selon les règles de tout soin ; le +2 sur toutes ses attaques.
//
// Lancer : node tests_monstres/berserker.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat } from '../combat_etat.js';
import { resoudreCarte, esquiveDe, paradeDe, defPhysiqueDe, defMagiqueDe, surveillerRage, ETAT_RAGE } from '../moteur_pur.js';
import { degatsOpportuniteBruts } from '../mouvement_pur.js';
import { validerIntention, appliquerIntention, vieillirLesEtats } from '../cerveau_combat.js';
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
    Esquive: 20, Parade: 20, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const berserker = (niveau, extra = {}) => fiche("B", { classe: "Berserker", xp: XP[niveau], ...(niveau >= 1 && !extra.PV_Actuels ? { PV_Actuels: 80 } : {}), ...extra });
const POS = { B: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 4, r: 0 }, M3: { q: 9, r: 0 }, A: { q: 0, r: 1 } };
const monde = (niveau = 9, extraB = {}, graine = 1) => {
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine, regles: REGLES, partie: { Tour_Combat: 1 }, positions: POS,
        combattants: [berserker(niveau, extraB), fiche("M1"), fiche("M2"), fiche("M3"), fiche("A")] });
    e.ordre = ["B", "M1", "M2", "M3", "A"]; e.phase = "Resolution";
    Object.values(e.combattants).forEach(c => { c.def.esquive = 0; c.def.parade = 0; });
    e.combattants.B.def.esquive = 20; e.combattants.B.def.parade = 20;
    return e;
};
const rage = (c) => (c.etats || []).find(x => x.nom === ETAT_RAGE);
// M1 frappe B (physique, sans esquive) : la file met M1 en tête.
const coupSurB = (e, valeur) => {
    const x = clonerEtat(e);
    x.file = [{ id: "M1", carte: "C", initiative: 50, pas: 0 }, { id: "M2", carte: "X", initiative: 10, pas: 0 }];
    x.combattants.B.def.esquive = 0; x.combattants.B.def.parade = 0;
    return appliquerIntention(x, { id: "I" + valeur, type: "carte", acteur: "M1", idCarte: "C", coutFatigue: 0,
        attaques: [{ nom: "Coup", valeurBrute: valeur, typeRes: "Physique", rangeMax: 1, cibles: ["B"] }], alterations: [] });
};

console.log("\n1. LES PALIERS, LE NOM");
{
    const a = (n) => w.atoutClasse(berserker(n));
    verifier("niveau 1 : −20 % de PV max, +30 % de soins reçus", a(1).pvMaxPct === -20 && a(1).soinsRecus === 30 && !a(1).rage, JSON.stringify(a(1)));
    verifier("niveau 3 : la Rage (pas au 2)", a(3).rage === true && !a(2).rage);
    verifier("niveau 5 : Régénération insolente ; niveau 9 : deux armes à deux mains (pas au 8)",
             JSON.stringify(a(5).techniques) === '["CLASSE_REGENERATION_INSOLENTE"]' && a(9).deuxArmesDeuxMains === true && !a(8).deuxArmesDeuxMains);
    verifier("PV max : 100 → 80", w.pvMaxCombattant(berserker(1)) === 80, String(w.pvMaxCombattant(berserker(1))));
    verifier("une fiche restée « Berzerker » est un Berserker", w.nomActuelClasse("Berzerker") === "Berserker"
             && w.atoutClasse(fiche("Z", { classe: "Berzerker", xp: XP[5] })).techniques.length === 1);
    const t = w.TECHNIQUES_CLASSE.CLASSE_REGENERATION_INSOLENTE;
    verifier("Régénération insolente : init 100, 0 fatigue, sur soi, niveau 5", t.Initiative === 100 && t.Fatigue === 0 && t.cible === "soi" && t.niveau === 5 && t.classe === "Berserker");
    verifier("les textes", /-20 % de PV max/.test(w.texteAtout("pvMaxPct", -20)) && /Rage/.test(w.texteAtout("rage", true)) && /\+2 dégâts/.test(w.texteAtout("deuxArmesDeuxMains", true)));
}

console.log("\n2. LA RAGE");
{
    const e = monde(3);
    verifier("en combat : 80 PV max", e.combattants.B.pvMax === 80);
    const plein = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, regles: REGLES, partie: { Tour_Combat: 1 }, positions: POS,
        combattants: [berserker(3, { PV_Actuels: 100 }), fiche("M1")] });
    verifier("une fiche à 100 PV entre en combat à 80 (le maximum)", plein.combattants.B.pv === 80, String(plein.combattants.B.pv));
    const touche = coupSurB(e, 50);          // 80 → 30 : 37,5 %, pas de Rage
    verifier("à 30/80 (37 %) : pas de Rage", !rage(touche.etat.combattants.B), String(touche.etat.combattants.B.pv));
    const pas = coupSurB(touche.etat, 11);   // 30 → 19 : 23,75 %
    const B = pas.etat.combattants.B;
    verifier("sous 25 % (19/80) : la Rage, 2 manches, dite", rage(B) && rage(B).duree === 2 && B.rageUsee === true
             && pas.entree.etapes.some(x => x.type === "message" && /Rage/.test(x.texte)), `${B.pv} ${JSON.stringify(B.etats)}`);
    verifier("parade et esquive à 0 ; +15 de résistances physique et magique",
             esquiveDe(B) === 0 && paradeDe(B) === 0 && defPhysiqueDe(B) === 15 && defMagiqueDe(B) === 15, `${esquiveDe(B)} ${paradeDe(B)} ${defPhysiqueDe(B)} ${defMagiqueDe(B)}`);
    verifier("rejoué depuis le journal : même Rage, même drapeau", (x => !!rage(x) && x.rageUsee === true)(appliquerEntree(touche.etat, pas.entree).combattants.B));
    verifier("l'état reste cohérent", verifierEtatCombat(pas.etat).length === 0, verifierEtatCombat(pas.etat).join(" | "));
    // Ses dégâts : ×1,2 (10 → 12) ; l'attaque d'opportunité aussi.
    const frappe = (etat) => resoudreCarte(etat, { type: "carte", idLanceur: "B", idCarte: "S", critique: false,
        attaques: [{ nom: "Coup", valeurBrute: 10, typeRes: "Physique", rangeMax: 1, cibles: ["M1"] }], alterations: [],
        jets: { attaqueRatee: false, parCible: { M1: { esquive: false, etats: {} } } } }).etat.combattants.M1.pv;
    verifier("en Rage, un coup de 10 en fait 12 ; sans, 10", frappe(pas.etat) === 88 && frappe(monde(3)) === 90, `${frappe(pas.etat)} ${frappe(monde(3))}`);
    const ao = degatsOpportuniteBruts(B, pas.etat.combattants.M1), aoSans = degatsOpportuniteBruts(monde(3).combattants.B, pas.etat.combattants.M1);
    verifier("l'attaque d'opportunité : ×1,2", ao === Math.round(aoSans * 1.2), `${aoSans} → ${ao}`);
    // Un deuxième coup sous le seuil, en Rage : rien de neuf.
    const encore = coupSurB(pas.etat, 2);
    verifier("déjà en Rage : pas de seconde Rage", (encore.etat.combattants.B.etats || []).filter(x => x.nom === ETAT_RAGE).length === 1);
    // Finie (2 vieillissements), toujours sous le seuil : elle ne revient pas.
    const fin = clonerEtat(encore.etat); vieillirLesEtats(fin); vieillirLesEtats(fin);
    verifier("finie au bout de 2 manches", !rage(fin.combattants.B));
    const toujours = coupSurB(fin, 1);
    verifier("finie mais toujours sous 25 % : elle ne revient pas", !rage(toujours.etat.combattants.B) && toujours.etat.combattants.B.rageUsee === true);
    // Remonté à 25 % ou plus : réarmée ; puis redescendu : elle revient.
    const soigne = clonerEtat(toujours.etat); soigne.combattants.B.pv = 20;      // 25 % pile
    const rearme = surveillerRage(soigne);
    verifier("remonté à 25 % : réarmée (dit par une étape)", soigne.combattants.B.rageUsee === false && rearme.some(x => x.type === "rage" && x.usee === false));
    const revient = coupSurB(soigne, 1);
    verifier("redescendu sous 25 % : la Rage revient", !!rage(revient.etat.combattants.B));
    verifier("niveau 2 : jamais de Rage", !rage(coupSurB(monde(2), 70).etat.combattants.B));
    const ko = coupSurB(monde(3), 200);
    verifier("tombé KO d'un coup : pas de Rage", ko.etat.combattants.B.aTerre && !rage(ko.etat.combattants.B));
}

console.log("\n3. LA RÉGÉNÉRATION INSOLENTE");
{
    const lancer = { id: "R1", type: "classe", acteur: "B", idCarte: "CLASSE_REGENERATION_INSOLENTE" };
    const prep = (n = 5, g = 1) => { const e = monde(n, {}, g); e.combattants.B.pv = 40;
        e.file = [{ id: "B", carte: "CLASSE_REGENERATION_INSOLENTE", initiative: 100, pas: 0 }, { id: "M1", carte: "X", initiative: 10, pas: 0 }]; return e; };
    verifier("niveau 5 : acceptée ; niveau 4 : non", validerIntention(prep(), lancer).ok && !validerIntention(prep(4), lancer).ok);
    const e = prep();
    const pas = appliquerIntention(e, lancer);
    const c = pas.etat.combattants;
    verifier("il reprend 20 PV × 1,3 = 26 (40 → 66), sans fatigue", c.B.pv === 66 && c.B.fatigue === 100, `${c.B.pv} ${c.B.fatigue}`);
    const provoques = ["M1", "M2", "M3"].filter(id => (c[id].etats || []).some(x => x.nom === "Provocation" && x.idProvocateur === "B" && x.duree === 2));
    verifier("des ennemis provoqués par lui, 2 manches (même M3, à 9 cases) ; l'allié jamais",
             provoques.length >= 1 && !(c.A.etats || []).some(x => x.nom === "Provocation"), provoques.join(","));
    verifier("une fois par combat", !validerIntention(Object.assign(clonerEtat(pas.etat), { file: e.file }), lancer).ok);
    verifier("rejoué depuis le journal", appliquerEntree(e, pas.entree).combattants.B.pv === 66
             && ["M1", "M2", "M3"].every(id => !!(appliquerEntree(e, pas.entree).combattants[id].etats || []).find(x => x.nom === "Provocation") === provoques.includes(id)));
    const titre = misEnScene(pas.entree.etapes.find(x => x.type === "techniqueClasse"), pas.etat);
    verifier("à l'écran : « 😤 Régénération insolente »", titre && /Régénération insolente/.test(titre.texte));
    let n = 0, nR = 0;
    for (let g = 1; g <= 200; g++) {
        n += ["M1", "M2", "M3"].filter(id => (appliquerIntention(prep(5, g), lancer).etat.combattants[id].etats || []).some(x => x.nom === "Provocation")).length;
        const r = prep(5, g); ["M1", "M2", "M3"].forEach(id => { r.combattants[id].atouts.resistances = ["Provocation"]; });
        nR += ["M1", "M2", "M3"].filter(id => (appliquerIntention(r, lancer).etat.combattants[id].etats || []).some(x => x.nom === "Provocation")).length;
    }
    verifier(`80 % de provoqués (${(n / 6).toFixed(1)} %), 55 % s'ils résistent (${(nR / 6).toFixed(1)} %)`, Math.abs(n / 6 - 80) < 5 && Math.abs(nR / 6 - 55) < 6);
}

console.log("\n4. NIVEAU 9 : PRENDRE ET RANGER DEUX ARMES À DEUX MAINS (le code du livre)");
{
    const src = fs.readFileSync('/home/user/Ivalis/grimoire_fiches.js', 'utf-8');
    const extraire = (nom) => src.slice(src.indexOf(`async function ${nom}(`), src.indexOf('\n}\n', src.indexOf(`async function ${nom}(`)) + 2);
    const monter = (h, atout) => {
        const ecrits = [], notes = [];
        const fenetre = { atoutRace: () => atout, peutEquiper: () => ({ possible: true }) };
        const f = new Function('window', 'herosParId', 'ecrire', 'noter', 'son', 'pagesFiche', 'heros',
            extraire("rangerArme") + extraire("prendreArme") + "; return { rangerArme, prendreArme };");
        return { ...f(fenetre, () => h, async (_h, maj) => { ecrits.push(maj); }, (_p, t) => notes.push(t), () => {}, {}, "H"), ecrits, notes };
    };
    const hache = { uid: "u1", nom: "Hache à deux mains", deuxMains: true }, masse = { uid: "u2", nom: "Masse à deux mains", deuxMains: true };
    const b = monter({ equipMainDroite: hache, equipMainGauche: hache, equipStock: masse }, { deuxArmesDeuxMains: true });
    await b.prendreArme();
    verifier("le Berserker prend une seconde arme à deux mains : droite la hache, gauche la masse",
             b.ecrits[0] && b.ecrits[0].Equip_Main_Droite === hache && b.ecrits[0].Equip_Main_Gauche === masse && b.ecrits[0].Equip_Stock === null, JSON.stringify(b.ecrits[0]));
    const autre = monter({ equipMainDroite: hache, equipMainGauche: hache, equipStock: masse }, {});
    await autre.prendreArme();
    verifier("un autre héros : refusé (« deux mains libres »)", autre.ecrits.length === 0 && /deux mains libres/.test(autre.notes[0] || ""));
    const r = monter({ equipMainDroite: hache, equipMainGauche: masse, equipStock: null }, { deuxArmesDeuxMains: true });
    await r.rangerArme("Equip_Main_Gauche");
    verifier("il range la masse : la hache reprend ses deux mains", r.ecrits[0].Equip_Stock === masse && r.ecrits[0].Equip_Main_Droite === hache && r.ecrits[0].Equip_Main_Gauche === hache);
    const seule = monter({ equipMainDroite: hache, equipMainGauche: hache, equipStock: null }, { deuxArmesDeuxMains: true });
    await seule.rangerArme("Equip_Main_Droite");
    verifier("une seule arme à deux mains rangée : les deux mains se libèrent", seule.ecrits[0].Equip_Main_Droite === null && seule.ecrits[0].Equip_Main_Gauche === null);
}

// La vraie page : la grille, la fiche, l'équipement.
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
const br = await chromium.launch();
const p = await br.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300"><rect width="900" height="300" fill="#5a3a20"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

console.log("\n5. LA PAGE : LA GRILLE, LA FICHE, L'ÉQUIPEMENT DU NIVEAU 9");
{
  const r = await p.evaluate(async () => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    await window.ouvrirChoixClasse();
    const carte = document.querySelector('.carte-classe[data-classe="CLASSE_BERSERKER"]');
    const vieille = document.querySelector('.carte-classe[data-classe="CLASSE_BERZERKER"]');
    const bientot = !!(carte && (carte.dataset.bientot === "true" || carte.querySelector(".carte-classe-bientot-texte")));
    const nom = carte ? (carte.querySelector(".carte-classe-nom") || {}).textContent : "";
    window.ouvrirFicheClasse("CLASSE_BERSERKER");
    const d = document.getElementById("descriptif-fiche-classe");
    const doc = window.classeDepuisDocument("CLASSE_BERZERKER", { Nom: "Berzerker", Ordre: 16 });
    const hache = { uid: "u1", nom: "Hache à deux mains", deuxMains: true, bonus: { degatsPhys: 2 } };
    const masse = { uid: "u2", nom: "Masse à deux mains", deuxMains: true, bonus: { degatsPhys: 3 } };
    const b = (eq) => window.bonusEquipement({ classe: "Berserker", race: "Humain", xp: 6400, ...eq });
    const une = b({ equipMainDroite: hache, equipMainGauche: hache });
    const deux = b({ equipMainDroite: hache, equipMainGauche: masse });
    const n8 = window.bonusEquipement({ classe: "Berserker", race: "Humain", xp: 5200, equipMainDroite: hache, equipMainGauche: hache });
    return { existe: !!carte, vieille: !!vieille, bientot, nom, doc, niveaux: [...d.querySelectorAll(".palier-classe-niveau")].map(x => x.textContent.trim()),
             texte: d.textContent, une, deux, n8 };
  });
  verifier("« Berserker » dans la grille (plus de Berzerker), sans « Arrive bientôt »", r.existe && !r.vieille && !r.bientot && r.nom === "Berserker", r.nom);
  verifier("un document « Berzerker » en base se lit Berserker", r.doc.id === "CLASSE_BERSERKER" && r.doc.nom === "Berserker");
  verifier("sa fiche : Niv. 1 / 3 / 5 / 9, tout y est dit", JSON.stringify(r.niveaux) === '["Niv. 1","Niv. 3","Niv. 5","Niv. 9"]'
           && /−20 % de PV max/.test(r.texte) && /\+30 % de soins/.test(r.texte) && /Rage/.test(r.texte) && /Régénération insolente/.test(r.texte) && /deux mains/.test(r.texte), JSON.stringify(r.niveaux));
  verifier("niveau 9, une seule arme à deux mains : +2 dégâts et +2 à l'opportunité", r.une.degats === 2 && r.une.degatsOpportunite === 2 && r.une.resPhys === 0 && r.une.degatsPhys === 2, JSON.stringify(r.une));
  verifier("deux armes à deux mains : leurs bonus s'additionnent, −10 % de résistances, plus de +2",
           r.deux.degatsPhys === 5 && r.deux.resPhys === -10 && r.deux.resMag === -10 && r.deux.degats === 0 && r.deux.degatsOpportunite === 0, JSON.stringify(r.deux));
  verifier("niveau 8 : rien de tout ça", r.n8.degats === 0 && r.n8.degatsOpportunite === 0);
}
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await br.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
