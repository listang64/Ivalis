// LES CHANGEMENTS DE LA v237.
//
// Nico :
//  • « Pour les gravats au sol quand un mur de pierre est pété, j'aimerais
//    qu'il y en ait plus, comme un petit monticule. Pareil sur les murs,
//    j'aimerais quelques gros cailloux aléatoires. »
//  • « Lumière ne doit plus être un effet de combat. À la place, le Chasseur de
//    mages niv.1 gagne le passif Maîtrise de la lumière : 33 % de chances
//    d'aveugler avec un sort de foudre (fixe, ne s'additionne pas avec l'effet
//    aveugler). »
//  • « Impact cinétique : l'ennemi qui percute un gars reçoit 10 % du coût de
//    la compétence en dégâts physiques et le gars percuté 6 %. Envoyé dans un
//    obstacle : 16 %. Si rien n'est percuté, il recule sans dégâts. »
//  • « L'étalement, uniquement sur les dégâts et les soins ; 1,3 pour tout le
//    monde. » (et, plus tard : « Profanateur : Relève des morts passe au niv.1,
//    on vire tout le reste du niv.1 ; au niv.1, ses attaques magiques de glace
//    font des dégâts physiques »)
//  • Gobs : 5 % d'esquive ; Ankylars : 12 % de résistance physique ; Ophiors :
//    12 % de résistance magique ; Éthérés : +25 % aux soins reçus ; Vargens :
//    50 % d'éviter les attaques d'opportunité ; Humains : +1 compétence.
//  • « Vampire : son malus au feu niv.1 remplacé par +20 % de chance de brûler
//    sur les sorts qu'il reçoit et qui brûlent. »
//  • « Sur les cartes compétences, en petit sous le titre, le type d'arme que
//    ça utilise (arme légère, magie, etc.). »
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, creerDes } from '../combat_etat.js';
import { resoudreCarte, tirerDesCarte, chanceEtatDe } from '../moteur_pur.js';
import { resoudreOpportunite } from '../mouvement_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(72)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const w = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/experience.js', 'utf-8'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);
new Function('window', fs.readFileSync('/home/user/Ivalis/talents.js', 'utf-8'))(w);
const REGLES = {
    pvMax: w.pvMaxCombattant, fatigueMax: w.fatigueMaxCombattant,
    esquive: w.esquiveCombattant, parade: w.paradeCombattant,
    defPhysique: w.defPhysiqueCombattant, defMagique: w.defMagiqueCombattant,
    critique: w.critiqueCombattant, atouts: w.atoutRace, bonusEquip: w.bonusEquip
};
const CARACS = { force: 15, dex: 14, con: 16, int: 15, sag: 13, cha: 14 };
const heros = (extra = {}) => ({
    idPersonnage: "H", prenom: "Hal", race: "Humain", classe: "", camp: "Allié", estMonstre: false, joueur: "J",
    xp: 0, caracs: { ...CARACS }, talents: {}, talentsChoix: {},
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100, Regeneration: 0,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const monstre = (id, extra = {}) => ({ idPersonnage: id, prenom: id, race: "", classe: "", camp: "Ennemi", estMonstre: true, joueur: "",
    xp: 0, PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Critique: 0,
    Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
const monde = (fiches, positions, graine = 1) => {
    const e = construireEtatCombat({ idPartie: "P", cerveau: "H", graine, combattants: fiches, positions,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = fiches.map(f => f.idPersonnage); e.phase = "Resolution";
    return e;
};
const jetsOk = (ids, etats = {}) => ({ attaqueRatee: false, parCible: Object.fromEntries(ids.map(id => [id, { esquive: false, etats: { ...etats } }])) });
const proche = (x, cible, marge = 3) => Math.abs(x - cible) <= marge;

console.log("\n=========================================================");
console.log("  LES CHANGEMENTS DE LA v237");
console.log("=========================================================");

console.log("\n1. LES PEUPLES");
{
    const R = w.ATOUTS_RACES;
    verifier("Gob : 5 % d'esquive (+1 compétence)", R.Gob.esquive === 5 && R.Gob.competences === 1
             && w.esquiveCombattant(heros({ race: "Gob" })) === 5, String(w.esquiveCombattant(heros({ race: "Gob" }))));
    verifier("Ankylar : 12 % de résistance physique", R.Ankylar.defPhysique === 12 && w.defPhysiqueCombattant(heros({ race: "Ankylar" })) === 12);
    verifier("Ophior : 12 % de résistance magique", R.Ophior.defMagique === 12 && w.defMagiqueCombattant(heros({ race: "Ophior" })) === 12);
    verifier("Éthéré : +25 % aux soins reçus", R["Ethéré"].soinsRecus === 25
             && Math.abs(w.multiplicateurSoinsRecus(heros({ race: "Ethéré" })) - 1.25) < 1e-9);
    verifier("Vargen : 50 % d'éviter une attaque d'opportunité (et toujours sa marche à moitié prix)",
             R.Vargen.esquiveOpportunite === 50 && R.Vargen.diviseurDeplacement === 2);
    verifier("Humain : +1 compétence (7 au lieu de 6), sa réserve de 110 gardée",
             w.competencesMaxCombattant(heros({ race: "Humain" })) === 7 && R.Humain.fatigueMax === 10
             && w.competencesMaxCombattant(heros({ race: "Ondari" })) === 6);
    // La dérobade du Vargen, en combat : la moitié des attaques d'opportunité.
    let derobe = 0, n = 0;
    for (let g = 1; g <= 2000; g++) {
        const e = monde([heros({ race: "Vargen" }), monstre("M1")], { H: { q: 0, r: 0 }, M1: { q: 1, r: 0 } }, g);
        const r = resoudreOpportunite(e, "M1", "H", creerDes(g));
        n++; if (r && r.mot === "Dérobade 🐾") derobe++;
    }
    verifier("…en combat, la dérobade joue une fois sur deux", proche(derobe / n * 100, 50), `${(derobe / n * 100).toFixed(1)} %`);
}

console.log("\n2. LA LUMIÈRE QUITTE LA FORGE ; LA MAÎTRISE DE LA LUMIÈRE (Chasseur de mages)");
{
    const a = w.atoutRace(heros({ classe: "Chasseur de mages" }));
    verifier("niveau 1 : Maîtrise de la lumière 33 %, +10 % de résistance magique", a.maitriseLumiere === 33 && a.defMagique === 10, JSON.stringify(a));
    verifier("plus d'effet Lumière à la Forge, plus de « sorts de lumière à 8 % »",
             !(a.effets || []).includes("EFF_LUMIERE") && !a.lumiereAveugle);
    // Les jets : un sort de foudre, un de feu, avec ou sans Aveuglement sur la carte.
    const jets = (classe, element, aveuglement) => {
        let aveugle = 0, n = 0;
        for (let g = 1; g <= 3000; g++) {
            const e = monde([heros({ classe }), monstre("M1")], { H: { q: 0, r: 0 }, M1: { q: 2, r: 0 } }, g);
            const plan = { attaques: [{ nom: "Attaque Magique", valeurBrute: 8, typeRes: "Magique", element, cibles: ["M1"], isRanged: true }],
                           alterations: aveuglement ? [{ nom: "Aveuglé", chance: aveuglement, duree: 2, cibles: ["M1"] }] : [] };
            const j = tirerDesCarte(e, plan, "H", false, creerDes(g)).parCible.M1;
            n++; if (j.lumiereAveugle === true || (j.etats && j.etats["Aveuglé"] === true)) aveugle++;
        }
        return aveugle / n * 100;
    };
    const foudre = jets("Chasseur de mages", "Foudre", 0), feu = jets("Chasseur de mages", "Feu", 0), autre = jets("Assassin", "Foudre", 0);
    verifier("un sort de FOUDRE aveugle 33 % du temps", proche(foudre, 33), `${foudre.toFixed(1)} %`);
    verifier("un sort de feu, jamais ; un autre héros, jamais", feu === 0 && autre === 0, `${feu} / ${autre}`);
    const avec20 = jets("Chasseur de mages", "Foudre", 20), avec60 = jets("Chasseur de mages", "Foudre", 60);
    verifier("avec un Aveuglement à 20 % sur la carte : 33 %, pas 20 + 33 (ni 46)", proche(avec20, 33), `${avec20.toFixed(1)} %`);
    verifier("avec un Aveuglement à 60 % : 60 % (la plus forte des deux)", proche(avec60, 60), `${avec60.toFixed(1)} %`);
    // Et le noir se pose vraiment, avec son mot.
    let pose = null;
    for (let g = 1; g <= 200 && !pose; g++) {
        const e = monde([heros({ classe: "Chasseur de mages" }), monstre("M1")], { H: { q: 0, r: 0 }, M1: { q: 2, r: 0 } }, g);
        const action = { type: "carte", idLanceur: "H", idCarte: "C", critique: false,
                         attaques: [{ nom: "Attaque Magique", valeurBrute: 8, typeRes: "Magique", element: "Foudre", cibles: ["M1"], isRanged: true }], alterations: [] };
        action.jets = tirerDesCarte(e, action, "H", false, creerDes(g));
        action.jets.parCible.M1.esquive = false;
        if (!action.jets.parCible.M1.lumiereAveugle) continue;
        const r = resoudreCarte(e, action, null);
        pose = { aveugle: r.etat.combattants.M1.etats.some(x => x.nom === "Aveuglé" && (x.cases || []).length > 0),
                 mot: r.etapes.some(x => x.texte === "⚡ Ébloui par l'éclair !") };
    }
    verifier("la cible touchée est aveuglée (son noir posé), « ⚡ Ébloui par l'éclair ! »", !!pose && pose.aveugle && pose.mot, JSON.stringify(pose));
}

console.log("\n3. LE VAMPIRE : +20 % D'ÊTRE BRÛLÉ PAR LES SORTS (plus de brûlure aggravée)");
{
    const a = w.atoutRace(heros({ classe: "Vampire" }));
    verifier("niveau 1 : brulureFacile 20, plus de brulureAggravee", a.brulureFacile === 20 && !a.brulureAggravee, JSON.stringify(a));
    const e = monde([monstre("M1"), heros({ classe: "Vampire" }), heros({ idPersonnage: "A" })],
                    { M1: { q: 0, r: 0 }, H: { q: 1, r: 0 }, A: { q: 0, r: 1 } });
    const brule = { nom: "Brûlé", chance: 30 };
    verifier("un sort qui brûle à 30 % : 50 % sur le Vampire, 30 % sur un autre",
             chanceEtatDe(e.combattants.M1, brule, e.combattants.H) === 50 && chanceEtatDe(e.combattants.M1, brule, e.combattants.A) === 30);
    verifier("un sort qui ne brûle pas : rien ; un autre état : rien de plus",
             chanceEtatDe(e.combattants.M1, { nom: "Brûlé", chance: 0 }, e.combattants.H) === 0
             && chanceEtatDe(e.combattants.M1, { nom: "Étourdi", chance: 30 }, e.combattants.H)
                === chanceEtatDe(e.combattants.M1, { nom: "Étourdi", chance: 30 }, e.combattants.A));
    let n = 0, b = 0;
    for (let g = 1; g <= 3000; g++) {
        const plan = { attaques: [], alterations: [{ nom: "Brûlé", chance: 30, duree: 2, cibles: ["H"] }] };
        const ee = monde([monstre("M1"), heros({ classe: "Vampire" })], { M1: { q: 0, r: 0 }, H: { q: 1, r: 0 } }, g);
        const j = tirerDesCarte(ee, plan, "M1", false, creerDes(g)).parCible.H;
        if (j.esquive) continue;
        n++; if (j.etats["Brûlé"]) b++;
    }
    verifier("…aux dés : la moitié des sorts à 30 % le brûlent", proche(b / n * 100, 50), `${(b / n * 100).toFixed(1)} %`);
}

console.log("\n4. LE PROFANATEUR : RELÈVE DES MORTS ET GLACE PHYSIQUE DÈS LE NIVEAU 1");
{
    // (Un Ondari : l'Humain a désormais sa propre compétence en plus.)
    const a = w.atoutRace(heros({ classe: "Profanateur", race: "Ondari" }));
    verifier("niveau 1 : zombies et glace physique", a.zombies === true && a.glacePhysique === true, JSON.stringify(a));
    verifier("…et plus rien d'autre : ni ristourne d'étalement, ni compétence, ni PV",
             !a.diviseurEtalement && !a.competences && !a.pvMax);
    const a10 = w.atoutRace(heros({ classe: "Profanateur", xp: 99999 }));
    verifier("niveau 10 : le sursis et les zombies à 2 cases, toujours", a10.sursis === 2 && a10.rayonZombies === 2 && a10.zombies === true);
    // Un sort de glace sur une cible en armure lourde (50 % physique, 0 magique).
    const frappe = (classe, element) => {
        const e = monde([heros({ classe }), monstre("M1", { Def_Physique: 50 })], { H: { q: 0, r: 0 }, M1: { q: 1, r: 0 } });
        const r = resoudreCarte(e, { type: "carte", idLanceur: "H", idCarte: "C", critique: false,
            attaques: [{ nom: "Attaque Magique", valeurBrute: 20, typeRes: "Magique", element, etatElement: element === "Glace" ? "Glacé" : "Brûlé", cibles: ["M1"] }],
            alterations: [], jets: jetsOk(["M1"]) }, null);
        return { pv: r.etat.combattants.M1.pv, nature: (r.etapes.find(x => x.type === "degats") || {}).nature,
                 element: (r.etapes.find(x => x.type === "carte") || {}).element };
    };
    const prof = frappe("Profanateur", "Glace"), feu = frappe("Profanateur", "Feu"), autre = frappe("Sorcier", "Glace");
    verifier("sa glace frappe en physique : l'armure (50 %) la réduit, 20 → 10", prof.pv === 90 && prof.nature === "physique", JSON.stringify(prof));
    verifier("…et reste un sort de glace à l'écran", prof.element === "Glace", String(prof.element));
    verifier("son feu reste magique (20) ; la glace d'un autre aussi (20)", feu.pv === 80 && autre.pv === 80, `${feu.pv} / ${autre.pv}`);
}

console.log("\n5. L'IMPACT CINÉTIQUE : UNE PART DU COÛT, EN PHYSIQUE");
{
    const pousser = (positions, extra = {}, plateau = null, fichesEnPlus = []) => {
        const e = monde([heros({ talents: { TAL_IMPACT_CINETIQUE: 1 } }), monstre("M1", extra.m1 || {}), ...fichesEnPlus], positions);
        const r = resoudreCarte(e, { type: "carte", idLanceur: "H", idCarte: "C", critique: false, coutFatigue: 50,
            attaques: [], alterations: [{ nom: "Poussée", chance: 100, cases: 2, duree: 0, estPoussee: true, cibles: ["M1"] }],
            jets: jetsOk(["M1"], { "Poussée": true }) }, plateau);
        return r;
    };
    const unite = pousser({ H: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 2, r: 0 } }, {}, null, [monstre("M2")]);
    verifier("percute une unité : la cible 10 % de 50 = 5, l'unité percutée 6 % = 3",
             unite.etat.combattants.M1.pv === 95 && unite.etat.combattants.M2.pv === 97 && unite.etapes.some(x => x.texte === "💥 Impact !"),
             `M1 ${unite.etat.combattants.M1.pv}, M2 ${unite.etat.combattants.M2.pv}`);
    verifier("…des dégâts physiques", unite.etapes.filter(x => x.type === "degats").every(x => x.nature === "physique" && !x.brut));
    const mur = { etatCase: (q, r) => ({ bloquee: q === 2 && r === 0 }) };
    const obstacle = pousser({ H: { q: 0, r: 0 }, M1: { q: 1, r: 0 } }, {}, mur);
    verifier("envoyée dans un obstacle : 16 % de 50 = 8", obstacle.etat.combattants.M1.pv === 92, String(obstacle.etat.combattants.M1.pv));
    const arme = pousser({ H: { q: 0, r: 0 }, M1: { q: 1, r: 0 } }, { m1: { Def_Physique: 50 } }, mur);
    verifier("…l'armure les réduit (50 % : 8 → 4)", arme.etat.combattants.M1.pv === 96, String(arme.etat.combattants.M1.pv));
    const libre = pousser({ H: { q: 0, r: 0 }, M1: { q: 1, r: 0 } });
    verifier("rien de percuté : elle recule, sans dégâts", libre.etat.combattants.M1.pv === 100 && libre.etat.combattants.M1.q === 3
             && !libre.etapes.some(x => x.type === "degats"), `q ${libre.etat.combattants.M1.q}`);
    verifier("le talent le dit", /10 %/.test(w.talentParId("TAL_IMPACT_CINETIQUE").texte) && /16 %/.test(w.talentParId("TAL_IMPACT_CINETIQUE").texte)
             && /6 %/.test(w.talentParId("TAL_IMPACT_CINETIQUE").texte));
}

// =========================================================================
//  PARTIE 2 : LA VRAIE PAGE
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
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async () => {}; export const updateDoc = async () => {};
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
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: 1 });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: `<svg xmlns="http://www.w3.org/2000/svg" width="450" height="640" viewBox="0 0 450 640"><rect width="450" height="640" rx="20" fill="#3a2a1a" stroke="#c2a878" stroke-width="10"/><rect x="0" y="0" width="450" height="70" fill="#2a1d12"/></svg>` }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

const EFFETS = JSON.parse(fs.readFileSync(`${RACINE}/tests_monstres/effets_reels.json`, 'utf-8'));
const effets = Object.entries(EFFETS).map(([id, e]) => ({ ...e, id }));
const id = (nom) => (effets.find(e => e.Nom === nom) || {}).id;

console.log("\n6. L'ÉTALEMENT À LA FORGE : DÉGÂTS ET SOINS SEULEMENT, ÷1,3 POUR TOUT LE MONDE");
{
  const pc = await p.evaluate(({ effets, attaque, dot, brule, dist, soinId }) => {
    const base = effets.find(e => e.id === attaque), soin = effets.find(e => e.id === soinId);
    const cout = (statsPerso, baseEffet, mods) => {
      window.forgeState.effetsBDD = effets;
      window.forgeState.caracs = { force: 16, dex: 16, con: 16, int: 16, sag: 16, cha: 16 };
      window.forgeState.statsPerso = statsPerso;
      window.forgeState.armePrincipale = "Arme polyvalente";
      window.forgeState.actions = [{ idInst: "A1", baseEffet, count: 2, baseDuree: 0, mods, modsDuree: {}, zoneHexes: [] }];
      window.rafraichirForge();
      return parseFloat(document.getElementById("forge-cout-pc").innerText);
    };
    const autre = { classe: "Assassin", race: "Humain", xp: 0 }, prof = { classe: "Profanateur", race: "Humain", xp: 0 };
    const r = {
      etat: cout(autre, base, { [dot]: 1, [brule]: 2 }),
      distance: cout(autre, base, { [dot]: 1, [dist]: 2 }),
      distanceSeule: cout(autre, base, { [dist]: 2 }),
      soin: cout(autre, soin, { [dot]: 1 }),
      prof: cout(prof, base, { [dot]: 1, [brule]: 2 }),
      diviseur: window.diviseurEtalement(effets.find(e => e.id === dot), autre)
    };
    window.forgeState.statsPerso = {};
    return r;
  }, { effets, attaque: id("Attaque légère"), dot: id("Durée étalement dégâts"), brule: id("Brûlé"), dist: id("Distance"), soinId: id("Soin") });
  const coutDist = parseFloat(String(effets.find(e => e.Nom === "Distance").Cout_PT).replace(",", "."));
  verifier("le diviseur : 1,3 (le grimoire disait 1,2)", Math.abs(pc.diviseur - 1.3) < 1e-9, String(pc.diviseur));
  verifier("attaque étalée + Brûlé : 4/1,3 + 2 (l'état plein pot)", Math.abs(pc.etat - (4 / 1.3 + 2)) < 0.06, `${pc.etat} PC`);
  verifier("attaque étalée + Distance : la Distance n'est plus remisée", Math.abs(pc.distance - (4 / 1.3 + 2 * coutDist)) < 0.06
           && pc.distance > (4 + 2 * coutDist) / 1.3 + 0.1, `${pc.distance} PC (sans étalement : ${pc.distanceSeule})`);
  verifier("un soin étalé : remisé (4 → 4/1,3)", Math.abs(pc.soin - 4 / 1.3) < 0.06, `${pc.soin} PC`);
  verifier("le Profanateur paie comme tout le monde", pc.prof === pc.etat, `${pc.prof} / ${pc.etat}`);
}

console.log("\n7. LA LUMIÈRE N'EST PLUS À LA FORGE, POUR PERSONNE");
{
  const r = await p.evaluate(() => {
    const chasseur = { classe: "Chasseur de mages", race: "Humain", xp: 0 };
    const lumiere = { Nom: "Lumière", Classe: "Chasseur de mages" }, sansClasse = { Nom: "Lumière" };
    return { chasseur: window.effetAccessible("EFF_LUMIERE", lumiere, chasseur), public: window.effetAccessible("EFF_LUMIERE", sansClasse, {}),
             reserve: window.effetReserveAUneClasse("EFF_LUMIERE", sansClasse),
             ligne: window.texteAtout ? window.texteAtout("maitriseLumiere", 33) : "" };
  });
  verifier("ni le Chasseur de mages, ni personne (même si le grimoire la croit publique)", !r.chasseur && !r.public && r.reserve, JSON.stringify(r));
  verifier("la fiche dit la Maîtrise de la lumière", /Maîtrise de la lumière : 33 %/.test(r.ligne) && /foudre/.test(r.ligne), r.ligne);
}

console.log("\n8. SUR LA CARTE, LE TYPE D'ARME EN PETIT SOUS LE TITRE");
{
  const r = await p.evaluate(async () => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
    window.COULEUR_PERSO_COURANT = "#6a3a8a";
    const lire = (idCarte, arme) => {
      window.COMPETENCES_CACHE[idCarte] = { Nom: "Lame du crépuscule", Arme: arme, Initiative: 40, Fatigue: 20,
        Effets_Compiles: [{ nom: "Attaque légère", desc: "6 dégâts physiques", isMod: false }], Composants: { actions: [] } };
      window.afficherApercuCarteHD(idCarte);
      const c = document.getElementById("apercu-carte-hd-competence");
      const s = c.querySelector(".sous-titre-arme-carte"), t = c.querySelector(".titre-auto-reduit");
      return { texte: s ? s.textContent.trim() : null, sous: s && t ? s.getBoundingClientRect().top >= t.getBoundingClientRect().top + 8 : false,
               petit: s ? parseFloat(getComputedStyle(s).fontSize) < parseFloat(getComputedStyle(t).fontSize) : false };
    };
    window.COMPETENCES_CACHE = window.COMPETENCES_CACHE || {};
    const res = { legere: lire("C_LEG", "Arme légère CAC"), magie: lire("C_MAG", "Magie"), distance: lire("C_DIST", "Arme légère Distance"),
                  sans: lire("C_SANS", "Sans arme / Arme rp"), rien: lire("C_RIEN", "") };
    lire("C_LEG", "Arme légère CAC");
    return res;
  });
  verifier("« Arme légère » sous le titre, plus petit que lui", r.legere.texte === "🗡️ Arme légère" && r.legere.sous && r.legere.petit, JSON.stringify(r.legere));
  verifier("« Magie », « Arme à distance », « Sans arme »", r.magie.texte === "✨ Magie" && r.distance.texte === "🏹 Arme à distance"
           && r.sans.texte === "✊ Sans arme", [r.magie.texte, r.distance.texte, r.sans.texte].join(" | "));
  verifier("une carte sans type n'affiche rien", r.rien.texte === null);
  const boite = await p.evaluate(() => { const r = document.getElementById("apercu-carte-hd-competence").getBoundingClientRect();
                                         return { x: r.left, y: r.top, width: r.width, height: Math.min(r.height, 240) }; });
  if (boite.width > 0) await p.screenshot({ path: '/tmp/claude-0/v237_carte_arme.png', clip: boite });
}

console.log("\n9. LES GRAVATS EN PETIT MONTICULE, DE GROS CAILLOUX SUR LES MURS");
{
  const r = await p.evaluate(() => {
    const g = ["a", "b", "c", "d"].map(x => window.dessinerGravatsTerre("gr-" + x));
    const piliers = ["a", "b", "c"].map(x => window.dessinerPilierTerre("pi-" + x));
    const R = 56;
    const v = [[1, 0], [0.5, -0.866], [-0.5, -0.866], [-1, 0], [-0.5, 0.866], [0.5, 0.866]]
      .map(([x, y], i) => ({ dx: x * 2 * R * 0.866, dy: y * 2 * R * 0.866, etat: i === 0 || i === 3 ? "mur" : "" }));
    const murs = ["a", "b", "c", "d"].map(x => window.dessinerMurTerre("mu-" + x, v));
    // La butte : le haut du tas est plus haut que la base (des pixels de
    // pierre au-dessus du centre de la case).
    const hautDuTas = (c) => {
      const d = c.getContext("2d").getImageData(0, 0, 128, 128).data;
      for (let y = 0; y < 128; y++) for (let x = 40; x < 88; x++) if (d[(y * 128 + x) * 4 + 3] > 200) return y;
      return 128;
    };
    return { eclats: g.map(c => c.nbEclats), couches: g.map(c => c.couchesMonticule), haut: g.map(hautDuTas),
             grosPiliers: piliers.map(c => c.nbGrosCailloux), grosMurs: murs.map(c => c.nbGrosCailloux) };
  });
  verifier("plus de gravats : 37 éclats au moins (12 à 19 avant)", r.eclats.every(n => n >= 37), JSON.stringify(r.eclats));
  verifier("en monticule : quatre couches, le sommet bien au-dessus de la case", r.couches.every(n => n === 4) && r.haut.every(y => y < 50),
           `couches ${JSON.stringify(r.couches)}, sommet à y = ${JSON.stringify(r.haut)}`);
  verifier("de gros cailloux sur les piliers (1 ou 2) et sur les murs (1 à 3)", r.grosPiliers.every(n => n >= 1 && n <= 2)
           && r.grosMurs.every(n => n >= 1 && n <= 3), `${JSON.stringify(r.grosPiliers)} / ${JSON.stringify(r.grosMurs)}`);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
