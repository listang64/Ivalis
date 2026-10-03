// LA CLASSE CHASSEUR DE MAGES.
//
// Nico : « lvl1 : +10 % Résistance magique. lvl5 : SKILL Lumière. lvl10 : tous
// les sorts de lumière ont 30 % de chance d'aveugler la cible et tous les
// personnages adjacents. Nouvel effet de combat : Lumières (CHASSEUR DE MAGE),
// 1 pt, INTELLIGENCE, 15 % de chance d'ignorer la résistance magique de la
// cible sur ce sort (max 60 %). »
// Ses réponses : un sous-effet, dans les menus Magique et Physique, posable
// seulement sur une action à dégâts magiques ; un jet par cible, imposé par un
// critique ; réservé à la classe dès le niveau 5, jamais aux monstres ; au
// niveau 10, un jet par cible touchée, qui aveugle la cible et les ENNEMIS
// qui la touchent, pas d'esquive pour les voisins, l'Aveuglement normal.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree } from '../combat_etat.js';
import { resoudreCarte, tirerDesCarte, defMagiqueDe, DUREE_AVEUGLE_LUMIERE } from '../moteur_pur.js';

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
const XP = { 1: 0, 4: 1800, 5: 2500, 9: 6400, 10: 7900 };
const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const chasseur = (niveau, extra = {}) => fiche("C", { classe: "Chasseur de mages", xp: XP[niveau], ...extra });

// C en (0,0) ; M1 (la cible) en (2,0) ; M2 (2,-1) et M3 (3,0) touchent M1 ;
// A (allié de C) en (1,1) touche M1 aussi ; M4 (6,0) loin.
const monde = (niveau = 10) => {
    const fiches = [chasseur(niveau), fiche("M1"), fiche("M2"), fiche("M3"), fiche("M4"), fiche("A")];
    const pos = { C: { q: 0, r: 0 }, M1: { q: 2, r: 0 }, M2: { q: 2, r: -1 }, M3: { q: 3, r: 0 }, M4: { q: 6, r: 0 }, A: { q: 1, r: 1 } };
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: fiches, positions: pos,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["C", "M1", "M2", "M3", "M4", "A"];
    e.phase = "Resolution";
    Object.values(e.combattants).forEach(c => { if (c.id.startsWith("M")) c.def.magique = 50; });
    return e;
};
// Des dés qui tombent toujours sur 1 (tout réussit), ou toujours sur 100.
const desA = (v) => ({ d100: () => v, parmi: (l) => l[0], fraction: () => 0, graine: () => 1 });
const sort = (chance, extra = {}) => ({ type: "carte", idLanceur: "C", idCarte: "S", critique: !!extra.critique,
    attaques: [{ nom: "Attaque Magique", valeurBrute: 10, typeRes: extra.typeRes || "Magique", rangeMax: 3,
                 ...(chance ? { chanceLumiere: chance, iconeAveugle: "oeil.svg" } : {}), cibles: ["M1"] }],
    alterations: [] });
const jouer = (e, action, des) => resoudreCarte(e, { ...action, jets: tirerDesCarte(e, action, "C", action.critique, des) });
const aveugle = (c) => (c.etats || []).find(x => x.nom === "Aveuglé");

console.log("\n=========================================================");
console.log("  LE CHASSEUR DE MAGES");
console.log("=========================================================");

// =========================================================================
console.log("\n1. LES PALIERS : +10 RÉSISTANCE MAGIQUE, LUMIÈRE, ÉCLAT AVEUGLANT");
// =========================================================================
{
    const a1 = w.atoutClasse(chasseur(1)), a5 = w.atoutClasse(chasseur(5)), a10 = w.atoutClasse(chasseur(10));
    verifier("niveau 1 : +10 de défense magique", a1.defMagique === 10 && !(a1.effets || []).length && !a1.lumiereAveugle, JSON.stringify(a1));
    verifier("niveau 5 : l'effet Lumière", JSON.stringify(a5.effets) === '["EFF_LUMIERE"]' && !a5.lumiereAveugle);
    verifier("niveau 10 : 30 % d'aveugler", a10.lumiereAveugle === 30 && a10.defMagique === 10);
    verifier("la fiche annonce +10 de résistance magique",
             w.defMagiqueCombattant(chasseur(1)) === w.defMagiqueCombattant(fiche("X")) + 10);
    const e = monde(10);
    verifier("en combat : défense magique 10, atout d'aveuglement 30",
             defMagiqueDe(e.combattants.C) === 10 && e.combattants.C.atouts.lumiereAveugle === 30);
}

// =========================================================================
console.log("\n2. LUMIÈRE : LE SORT PASSE OUTRE LA DÉFENSE MAGIQUE");
// =========================================================================
{
    const sansLumiere = jouer(monde(5), sort(0), desA(100)).etat.combattants.M1.pv;
    verifier("sans Lumière : 10 magiques sur 50 % de défense → 5", sansLumiere === 95, String(sansLumiere));
    const prend = jouer(monde(5), sort(60), desA(1)).etat.combattants.M1.pv;
    verifier("Lumière qui prend : les 10, sans défense magique", prend === 90, String(prend));
    const rate = jouer(monde(5), sort(15), desA(50)).etat.combattants.M1.pv;
    verifier("Lumière qui rate (50 > 15) : la défense compte", rate === 95, String(rate));
    const crit = monde(5);
    const r = jouer(crit, sort(15, { critique: true }), desA(50)).etat.combattants.M1.pv;
    verifier("un critique l'impose (20 sans défense)", r === 80, String(r));
    const phys = monde(5);
    phys.combattants.M1.def.physique = 50;
    verifier("sur un coup physique, elle ne fait rien", jouer(phys, sort(60, { typeRes: "Physique" }), desA(1)).etat.combattants.M1.pv === 95);
    // Une carte sans Lumière ne tire pas un dé de plus.
    let tires = 0;
    tirerDesCarte(monde(10), sort(0), "C", false, { ...desA(100), d100: () => { tires++; return 100; } });
    verifier("une carte sans Lumière ne consomme aucun dé de plus", tires === 1, `${tires} dé(s)`);
    const e = monde(5);
    const action = sort(60);
    const pas = jouer(e, action, desA(1));
    verifier("rejoué depuis le journal : mêmes PV", appliquerEntree(e, { etapes: pas.etapes }).combattants.M1.pv === 90);
}

// =========================================================================
console.log("\n3. NIVEAU 10 : LE SORT DE LUMIÈRE AVEUGLE LA CIBLE ET LES ENNEMIS QUI LA TOUCHENT");
// =========================================================================
{
    const e = monde(10);
    const r = jouer(e, sort(15), desA(1));
    const c = r.etat.combattants;
    verifier("la cible M1 est aveuglée, 2 manches, 3 cases autour d'elle",
             !!aveugle(c.M1) && aveugle(c.M1).duree === DUREE_AVEUGLE_LUMIERE && aveugle(c.M1).cases.length === 3
             && aveugle(c.M1).cases.every(h => Math.abs(h.q - 2) <= 1 && Math.abs(h.r) <= 1), JSON.stringify(aveugle(c.M1)));
    verifier("les ennemis qui la touchent (M2, M3) aussi", !!aveugle(c.M2) && !!aveugle(c.M3));
    verifier("pas l'allié A qui la touche, ni M4 loin, ni le Chasseur", !aveugle(c.A) && !aveugle(c.M4) && !aveugle(c.C));
    verifier("le noir de M3 est autour de M3", aveugle(c.M3).cases.every(h => Math.abs(h.q - 3) <= 1 && Math.abs(h.r) <= 1));
    verifier("l'écran le dit : « Éblouis »", r.etapes.some(x => x.type === "message" && /blouis/.test(x.texte)));
    const rejoue = appliquerEntree(e, { etapes: r.etapes }).combattants;
    verifier("rejoué depuis le journal : les trois aveuglés", !!aveugle(rejoue.M1) && !!aveugle(rejoue.M2) && !!aveugle(rejoue.M3));

    // Le jet de 30 % raté : personne. (Dés dans l'ordre : esquive, Lumière,
    // puis l'aveuglement — le 3e tombe sur 31.)
    let n = 0;
    const jets = tirerDesCarte(monde(10), sort(15), "C", false, { ...desA(1), d100: () => { n++; return n === 3 ? 31 : 1; } });
    verifier("le jet d'aveuglement raté (31 > 30) : rien", jets.parCible.M1.lumiereAveugle === false && !jets.parCible.M1.noirLumiere,
             JSON.stringify(jets.parCible.M1));

    const esq = monde(10);
    esq.combattants.M1.def.esquive = 100;
    const re = jouer(esq, sort(15), desA(1)).etat.combattants;
    verifier("la cible esquive : personne n'est aveuglé", !aveugle(re.M1) && !aveugle(re.M2));

    const imm = monde(10);
    imm.combattants.M2.atouts.immunites = ["Aveuglé"];
    const ri = jouer(imm, sort(15), desA(1));
    verifier("un voisin immunisé ne l'est pas", !aveugle(ri.etat.combattants.M2) && !!aveugle(ri.etat.combattants.M3)
             && ri.etapes.some(x => x.type === "etatRate" && x.cible === "M2" && x.immunise));

    const n9 = jouer(monde(9), sort(15), desA(1)).etat.combattants;
    verifier("niveau 9 : Lumière, mais pas d'aveuglement", !aveugle(n9.M1) && n9.M1.pv === 90);
    const sansLum = jouer(monde(10), sort(0), desA(1)).etat.combattants;
    verifier("niveau 10, sort sans Lumière : pas d'aveuglement", !aveugle(sansLum.M1));
}

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
  export const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async (ref) => { const d = (window.__docs || {})[ref.chemin]; return { exists: () => !!d, data: () => d || {} }; };
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

// =========================================================================
console.log("\n4. LA FORGE : LUMIÈRE POUR LE SEUL CHASSEUR DE MAGES, SUR UN SORT À DÉGÂTS MAGIQUES");
// =========================================================================
{
  const r = await p.evaluate(async (EFFETS) => {
    window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
    delete window.EFFETS_BDD_CACHE.EFF_LUMIERE;
    window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
    const forgePour = async (perso) => {
      window.__docs = { "Personnages/P1": perso, "Caracteristiques/P1": {} };
      document.getElementById("champ-id-personnage").value = "P1";
      window.OUVERTURE_FORGE_EN_COURS = false;
      await window.ouvrirCreationCompetence();
      return (window.forgeState.effetsBDD || []).map(e => e.id);
    };
    const c4 = await forgePour({ Classe: "Chasseur de mages", XP: 1800, Race: "Humain" });
    window.fermerForgeCompetence();
    const autre = await forgePour({ Classe: "Hoplite", XP: 9000, Race: "Humain" });
    window.fermerForgeCompetence();
    const c5 = await forgePour({ Classe: "Chasseur de mages", XP: 2500, Race: "Humain" });
    window.forgeState.armePrincipale = "Magie";
    const menus = (idEffet) => {
      window.forgeState.actions = [];
      window.ajouterComposantPrincipal(idEffet);
      return [...document.querySelectorAll("#forge-contenu-carte select")].map(s => [...s.options]
        .filter(o => /Lumi/.test(o.textContent)).map(o => (s.options[0].textContent + " : " + o.textContent + (o.disabled ? " [X]" : ""))))
        .flat();
    };
    const surMagique = menus("EFF_ATTAQUE_MAGIQUE");
    window.forgeState.armePrincipale = "Arme légère CAC";
    const surPhysique = menus("EFF_ATTAQUE_LEGERE");
    window.forgeState.armePrincipale = "Magie";
    const surSoin = menus("EFF_SOIN");
    window.fermerForgeCompetence();
    return { c4: c4.includes("EFF_LUMIERE"), autre: autre.includes("EFF_LUMIERE"), c5: c5.includes("EFF_LUMIERE"),
             surMagique, surPhysique, surSoin, monstres: window.paletteEffetsMonstres().some(e => e.id === "EFF_LUMIERE") };
  }, EFFETS_PAR_ID);
  verifier("le Chasseur de mages niveau 5 l'a dans la Forge", r.c5);
  verifier("pas au niveau 4, ni une autre classe", !r.c4 && !r.autre);
  verifier("jamais les monstres", !r.monstres);
  // (Avec l'arme Magie, la Forge n'ouvre pas de menu Physique.)
  verifier("sur une Attaque Magique : proposée (⚡ 5)",
           r.surMagique.length === 1 && /Magique : Lumière \(⚡ 5\)/.test(r.surMagique[0]), JSON.stringify(r.surMagique));
  verifier("sur une attaque physique : dans les menus Magique et Physique, « non compatible »",
           r.surPhysique.length === 2 && r.surPhysique.every(x => /non compatible/.test(x))
           && r.surPhysique.some(x => /Physique/.test(x)),
           JSON.stringify(r.surPhysique));
  verifier("sur un soin : « non compatible »", r.surSoin.length > 0 && r.surSoin.every(x => /non compatible/.test(x)), JSON.stringify(r.surSoin));

  const ex = await p.evaluate(async () => {
    window.PERSOS_PARTIE = [{ idPersonnage: "C1", camp: "Allié", prenom: "Varn", classe: "Chasseur de mages", xp: 2500,
                              PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }];
    window.TOKENS_VTT_DATA = { C1: { q: 0, r: 0 } };
    window.COMPETENCES_CACHE = { S1: { Nom: "Rayon", Arme: "Magie", Fatigue: 10, Initiative: 50,
      Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 2, mods: { EFF_LUMIERE: 2 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } },
      S2: { Nom: "Lame", Arme: "Arme légère CAC", Fatigue: 10, Initiative: 50,
      Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_LEGERE", count: 1, mods: { EFF_LUMIERE: 4 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } },
      S3: { Nom: "Rayon max", Arme: "Magie", Fatigue: 10, Initiative: 50,
      Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 1, mods: { EFF_LUMIERE: 6 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } } };
    window.CACHE_COMPETENCES_GLOBAL = { C1: window.COMPETENCES_CACHE };
    const lire = async (id) => ((await window.demarrerCiblage(id, { extraire: true, idLanceur: "C1" })) || {}).attaques || [];
    return { s1: (await lire("S1"))[0], s2: (await lire("S2"))[0], s3: (await lire("S3"))[0] };
  });
  verifier("une Attaque Magique avec Lumière ×2 part avec 30 % de chance", ex.s1 && ex.s1.chanceLumiere === 30, JSON.stringify(ex.s1).slice(0, 150));
  verifier("plafonnée à 60 % (×6 → 60)", ex.s3 && ex.s3.chanceLumiere === 60);
  verifier("une attaque physique n'emporte aucune Lumière", ex.s2 && !ex.s2.chanceLumiere);
}

// =========================================================================
console.log("\n5. LA FICHE DE CLASSE");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    await window.ouvrirChoixClasse();
    window.ouvrirFicheClasse("CLASSE_CHASSEUR_DE_MAGES");
    const d = document.getElementById("descriptif-fiche-classe");
    return { visible: getComputedStyle(d).display !== "none",
             niveaux: [...d.querySelectorAll(".palier-classe-niveau")].map(x => x.textContent.trim()), texte: d.textContent };
  });
  await p.screenshot({ path: "/tmp/claude-0/chasseur_classe.png" });
  verifier("présentation et paliers Niv. 1 / 5 / 10", r.visible && JSON.stringify(r.niveaux) === '["Niv. 1","Niv. 5","Niv. 10"]');
  verifier("résistance magique, Lumière et aveuglement y sont dits",
           /\+10 % de résistance magique/.test(r.texte) && /Lumière/.test(r.texte) && /aveugler/.test(r.texte));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
