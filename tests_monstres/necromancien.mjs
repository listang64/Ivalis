// LA CLASSE NÉCROMANCIEN.
//
// Nico : « Lvl1 : devient insensible au Gel / +1 compétence / +5 PV. Lvl5 :
// SKILL Ténèbres. Lvl10 : sa jauge de vie une fois atteint 0 est bloquée et il
// dispose de deux tours avant d'être mis KO. » Ténèbres : 2 pts, Intelligence,
// 3 dégâts magiques appliqués à la fatigue à la place des PV ; si la cible n'a
// plus de fatigue, elle subit à ses PV ×1,5 des dégâts restants. Ses réponses :
// le bouclier ne protège pas la fatigue (il n'absorbe que ce qui frappe les
// PV) ; pendant le sursis il joue normalement, les dégâts sont ignorés, aucun
// soin possible ; une seule fois par combat. Et le descriptif de la classe à
// gauche de sa fiche, à la création.
//
// Partie 1 : le VRAI code des règles (app.js, experience.js) et le VRAI noyau
// (moteur_pur, combat_etat, cerveau_combat), sans navigateur.
// Partie 2 : la vraie page (Forge, extraction de la carte, fiche de classe).
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat } from '../combat_etat.js';
import { resoudreCarte, partageTenebres, ETAT_TENEBRES_ETALEES } from '../moteur_pur.js';
import { cloturerTour, ticsDeFinDeManche } from '../cerveau_combat.js';
import { misEnScene } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// Les vraies règles : experience.js (le niveau) puis le bloc de stats d'app.js
// (atouts de race ET de classe).
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

const heros = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: "Allié", xp: 0,
    PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const monstre = (id, extra = {}) => ({ ...heros(id, { camp: "Ennemi", estMonstre: true, race: "" }), ...extra });

const etatDe = (fiches, file) => {
    const positions = {};
    fiches.forEach((f, i) => { positions[f.idPersonnage] = { q: i, r: 0 }; });
    const e = construireEtatCombat({ idPartie: "P1", cerveau: "P1", graine: 1, combattants: fiches,
                                     positions, partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = fiches.map(f => f.idPersonnage);
    if (file) e.file = file.map(id => ({ id, carte: null, initiative: 10, pas: 0 }));
    return e;
};
const jets = (ids, extra = {}) => ({ attaqueRatee: false,
    parCible: Object.fromEntries(ids.map(id => [id, { esquive: false, etats: {}, ...extra }])) });
const frapper = (etat, lanceur, cible, attaque, alterations = [], critique = false) => resoudreCarte(etat, {
    type: "carte", idLanceur: lanceur, idCarte: "C1", critique,
    attaques: attaque ? [{ ...attaque, cibles: [cible] }] : [],
    alterations: alterations.map(a => ({ ...a, cibles: [cible] })),
    jets: jets([cible], { etats: Object.fromEntries(alterations.map(a => [a.nom, true])) })
});

console.log("\n=========================================================");
console.log("  LE NÉCROMANCIEN");
console.log("=========================================================");

// =========================================================================
console.log("\n1. SES ATOUTS, PALIER PAR PALIER (niveau tiré de l'XP)");
// =========================================================================
{
    const necro = (niveau, extra = {}) => heros("N", { classe: "Nécromancien", xp: XP[niveau], ...extra });
    const a1 = w.atoutClasse(necro(1)), a4 = w.atoutClasse(necro(4));
    const a5 = w.atoutClasse(necro(5)), a10 = w.atoutClasse(necro(10));
    verifier("niveau 1 : insensible au Gel (Glacé), +1 compétence, +5 PV",
             JSON.stringify(a1.immunites) === '["Glacé"]' && a1.competences === 1 && a1.pvMax === 5,
             JSON.stringify(a1));
    verifier("niveau 4 : pas encore Ténèbres", !(a4.effets || []).length, JSON.stringify(a4.effets));
    verifier("niveau 5 : Ténèbres débloqué", (a5.effets || []).includes("EFF_TENEBRES") && !a5.sursis,
             JSON.stringify(a5));
    verifier("niveau 10 : le sursis (2 tours), et les paliers d'avant restent",
             a10.sursis === 2 && a10.competences === 1 && a10.pvMax === 5 && a10.effets.includes("EFF_TENEBRES"),
             JSON.stringify(a10));
    verifier("le nom se lit sans accents (« necromancien », « NÉCROMANCIEN »)",
             w.atoutClasse(heros("N", { classe: "necromancien" })).pvMax === 5
             && w.atoutClasse(heros("N", { Classe: "NÉCROMANCIEN" })).pvMax === 5);
    verifier("une autre classe n'a rien", Object.keys(w.atoutClasse(heros("O", { classe: "Oracle" }))).length === 0);
    verifier("une créature n'a rien, même nommée comme la classe",
             Object.keys(w.atoutClasse(monstre("M", { classe: "Nécromancien" }))).length === 0);

    verifier("PV max : 40 sur la fiche → 45", w.pvMaxCombattant(necro(1)) === 45
             && w.pvMaxCombattant(heros("H")) === 40, `${w.pvMaxCombattant(necro(1))}`);
    verifier("+1 compétence en main (7), comme le Gob", w.competencesMaxCombattant(necro(1)) === 7
             && w.competencesMaxCombattant(heros("H")) === 6);
    verifier("un Gob nécromancien en a 8 (les deux s'ajoutent)",
             w.competencesMaxCombattant(necro(1, { race: "Gob" })) === 8);
    const ondari = w.atoutRace(necro(1, { race: "Ondari" }));
    verifier("un Ondari nécromancien : immunisé au feu ET au gel, et garde sa portée",
             ondari.immunites.includes("Brûlé") && ondari.immunites.includes("Glacé") && ondari.porteeMagique === 1,
             JSON.stringify(ondari));
    verifier("la table des races n'est pas touchée par la fusion",
             JSON.stringify(w.ATOUTS_RACES.Ondari.immunites) === '["Brûlé"]');
    verifier("estImmunise : le Nécromancien au Glacé", w.estImmunise(necro(1), "Glacé")
             && !w.estImmunise(heros("H"), "Glacé"));

    const e = etatDe([necro(1), heros("H")]);
    verifier("en combat, ses PV max montent à 45", e.combattants.N.pvMax === 45 && e.combattants.N.pv === 40,
             `${e.combattants.N.pv}/${e.combattants.N.pvMax}`);
}

// =========================================================================
console.log("\n2. L'IMMUNITÉ AU GLACÉ, MÊME SUR UN CRITIQUE");
// =========================================================================
{
    const glacer = (cible) => frapper(etatDe([monstre("M"), cible]), "M", cible.idPersonnage,
        { valeurBrute: 2, typeRes: "Magique" }, [{ nom: "Glacé", chance: 100, duree: 2 }], true);
    const n = glacer(heros("N", { classe: "Nécromancien" }));
    const h = glacer(heros("H"));
    verifier("le Nécromancien n'est jamais Glacé", !n.etat.combattants.N.etats.some(x => x.nom === "Glacé")
             && n.etapes.some(x => x.type === "etatRate" && x.immunise), JSON.stringify(n.etat.combattants.N.etats));
    verifier("un autre héros l'est", h.etat.combattants.H.etats.some(x => x.nom === "Glacé"));
}

// =========================================================================
console.log("\n3. TÉNÈBRES : L'ÉNERGIE D'ABORD, PUIS LA VIE ×1,5");
// =========================================================================
{
    verifier("le partage : 3 sur 10 d'énergie → tout bu", JSON.stringify(partageTenebres(10, 3))
             === '{"surEnergie":3,"energieApres":7,"surplus":0}');
    verifier("6 sur 2 d'énergie → 2 bus, 4 × 1,5 = 6 aux PV", JSON.stringify(partageTenebres(2, 6))
             === '{"surEnergie":2,"energieApres":0,"surplus":6}');
    verifier("5 sans énergie → 7 (7,5 arrondi à l'inférieur)", partageTenebres(0, 5).surplus === 7);

    const tenebres = (valeur) => ({ valeurBrute: valeur, typeRes: "Magique", versEnergie: true });
    const cas = (fatigue, valeur, extra = {}) => {
        const e = etatDe([heros("N", { classe: "Nécromancien", xp: XP[5] }),
                          monstre("M", { Fatigue_Actuelle: fatigue, ...extra })]);
        const r = frapper(e, "N", "M", tenebres(valeur));
        return { r, avant: e, m: r.etat.combattants.M };
    };

    const a = cas(50, 3);
    verifier("3 dégâts sur 50 d'énergie : l'énergie tombe à 47, la vie ne bouge pas",
             a.m.fatigue === 47 && a.m.pv === 40, `${a.m.fatigue} / ${a.m.pv} PV`);
    verifier("l'étape d'énergie est marquée Ténèbres, et pas de « -0 » de dégâts",
             a.r.etapes.some(x => x.type === "fatigue" && x.tenebres && x.montant === 3 && x.fatigueApres === 47)
             && !a.r.etapes.some(x => x.type === "degats"), JSON.stringify(a.r.etapes.map(x => x.type)));

    const b = cas(2, 6);
    verifier("6 dégâts sur 2 d'énergie : 0 d'énergie, 40 − 6 = 34 PV", b.m.fatigue === 0 && b.m.pv === 34,
             `${b.m.fatigue} / ${b.m.pv} PV`);
    const c = cas(0, 5);
    verifier("5 dégâts sans énergie : 40 − 7 = 33 PV", c.m.pv === 33, `${c.m.pv}`);

    const d = cas(10, 6, { Bouclier_Actuel: 20, Bouclier_Max: 20 });
    verifier("le bouclier ne protège pas l'énergie (10 → 4, bouclier intact)",
             d.m.fatigue === 4 && d.m.bouclier === 20 && d.m.pv === 40, `${d.m.fatigue} / 🛡️${d.m.bouclier}`);
    const e = cas(0, 6, { Bouclier_Actuel: 5, Bouclier_Max: 5 });
    verifier("le surplus (9) sur un bouclier de 5 : le bouclier casse, la vie ne bouge pas",
             e.m.bouclier === 0 && e.m.pv === 40 && e.m.fatigue === 0, `🛡️${e.m.bouclier} / ${e.m.pv} PV`);
    const f = cas(50, 6, { Def_Magique: 50 });
    verifier("la défense magique réduit avant (6 → 3 sur l'énergie)", f.m.fatigue === 47, `${f.m.fatigue}`);

    const rejoue = appliquerEntree(b.avant, { etapes: b.r.etapes }).combattants.M;
    verifier("rejoué depuis le journal : même énergie, même vie", rejoue.fatigue === b.m.fatigue && rejoue.pv === b.m.pv,
             `${rejoue.fatigue} / ${rejoue.pv}`);

    const tombe = cas(0, 30);
    verifier("une Ténèbres peut achever (0 d'énergie, 45 aux PV → à terre)",
             tombe.m.aTerre && tombe.r.etapes.some(x => x.type === "chute"));

    // Étalée : les parts attendent dans leur propre état et suivent la même règle.
    const etal = etatDe([heros("N", { classe: "Nécromancien", xp: XP[5] }), monstre("M", { Fatigue_Actuelle: 4 })]);
    const r = frapper(etal, "N", "M", { ...tenebres(6), estEtalement: true, toursEtalement: 2 });
    const etatEtale = r.etat.combattants.M.etats.find(x => x.nom === ETAT_TENEBRES_ETALEES);
    verifier("étalée : rien au lancement, deux parts de 3 en attente",
             !!etatEtale && JSON.stringify(etatEtale.tics) === "[3,3]" && r.etat.combattants.M.fatigue === 4,
             JSON.stringify(etatEtale));
    const apres = clonerEtat(r.etat);
    ticsDeFinDeManche(apres);
    const f1 = apres.combattants.M.fatigue, p1 = apres.combattants.M.pv;
    ticsDeFinDeManche(apres);
    const t2 = apres.combattants.M;
    verifier("1re fin de manche : 3 bus par l'énergie (4 → 1), la vie intacte", f1 === 1 && p1 === 40, `${f1} / ${p1} PV`);
    verifier("2e : 1 bu, les 2 restants frappent la vie à ×1,5 (3 PV)", t2.fatigue === 0 && t2.pv === 37,
             `${t2.fatigue} / ${t2.pv} PV`);

    const scene = misEnScene({ type: "fatigue", cible: "M", tenebres: true, montant: 3, fatigueApres: 47 }, a.avant);
    verifier("à l'écran : « -3 ⚡🌑 » sur le pion", scene.geste === "message" && /-3/.test(scene.texte), JSON.stringify(scene));
    verifier("une énergie ordinaire reste muette", misEnScene({ type: "fatigue", cible: "M", fatigueApres: 20 }, a.avant).geste === "rien");
}

// =========================================================================
console.log("\n4. LE SURSIS DU NIVEAU 10");
// =========================================================================
{
    const necro10 = () => heros("N", { classe: "Nécromancien", xp: XP[10] });
    const coup = { valeurBrute: 200, typeRes: "Physique" };

    const e0 = etatDe([necro10(), monstre("M"), heros("H")], ["M", "N", "H"]);
    verifier("l'atout voyage dans le combattant (2 tours)", e0.combattants.N.atouts.sursis === 2);
    const r1 = frapper(e0, "M", "N", coup);
    const n1 = r1.etat.combattants.N;
    verifier("à 0 PV, il reste DEBOUT : sursis de 2 tours, pas de chute",
             n1.pv === 0 && !n1.aTerre && n1.sursis && n1.sursis.tours === 2
             && r1.etapes.some(x => x.type === "sursis" && x.tours === 2) && !r1.etapes.some(x => x.type === "chute"),
             JSON.stringify(n1.sursis));
    verifier("l'état reste cohérent (les invariants l'acceptent)", verifierEtatCombat(r1.etat).length === 0,
             verifierEtatCombat(r1.etat).join(" | "));
    const rejoue = appliquerEntree(e0, { etapes: r1.etapes }).combattants.N;
    verifier("rejoué depuis le journal : debout, en sursis", !rejoue.aTerre && rejoue.sursis && rejoue.sursis.tours === 2);

    const r2 = frapper(r1.etat, "M", "N", coup);
    verifier("un nouveau coup est ignoré (« Sursis 💀 »), toujours debout",
             !r2.etat.combattants.N.aTerre && r2.etat.combattants.N.pv === 0
             && r2.etapes.some(x => x.type === "message" && /Sursis/.test(x.texte)));
    const soin = frapper(r1.etat, "H", "N", { valeurBrute: 20, typeRes: "Magique", isHeal: true });
    verifier("impossible de le soigner", soin.etat.combattants.N.pv === 0
             && soin.etapes.some(x => x.type === "message" && /aucun soin/.test(x.texte)));

    // Deux de ses tours, puis KO.
    const t = clonerEtat(r1.etat);
    t.file = [{ id: "N", carte: null, initiative: 10, pas: 0 }, { id: "H", carte: null, initiative: 5, pas: 0 }];
    const c1 = cloturerTour(t);
    verifier("fin de son 1er tour : il reste 1 tour", t.combattants.N.sursis.tours === 1 && !t.combattants.N.aTerre,
             JSON.stringify(t.combattants.N.sursis));
    t.file = [{ id: "N", carte: null, initiative: 10, pas: 0 }, { id: "H", carte: null, initiative: 5, pas: 0 }];
    const c2 = cloturerTour(t);
    verifier("fin de son 2e tour : mis KO", t.combattants.N.aTerre && !t.combattants.N.sursis
             && c2.etapes.some(x => x.type === "chute" && x.cible === "N"), JSON.stringify(c2.etapes.map(x => x.type)));
    verifier("la file continue sans lui", t.file.every(f => f.id !== "N"));
    const rejoueKO = appliquerEntree(appliquerEntree(r1.etat, { etapes: c1.etapes }), { etapes: c2.etapes }).combattants.N;
    verifier("rejoué : KO aussi", rejoueKO.aTerre && !rejoueKO.sursis);

    // Tombé PENDANT son propre tour : ce tour-là ne compte pas.
    const e3 = etatDe([necro10(), monstre("M")], ["N", "M"]);
    const r3 = frapper(e3, "M", "N", coup);
    const s3 = clonerEtat(r3.etat);
    verifier("tombé pendant son tour : le sursis est « entamé »", s3.combattants.N.sursis.entame === true);
    cloturerTour(s3);
    verifier("la fin de CE tour ne décompte rien (2 tours pleins devant lui)", s3.combattants.N.sursis.tours === 2);

    // Une seule fois par combat.
    const e4 = clonerEtat(t);
    Object.assign(e4.combattants.N, { aTerre: false, pv: 10 });
    const r4 = frapper(e4, "M", "N", coup);
    verifier("une seule fois par combat : la seconde chute est un KO", r4.etat.combattants.N.aTerre
             && r4.etapes.some(x => x.type === "chute"));

    // Niveau 9 : pas de sursis.
    const r9 = frapper(etatDe([heros("N", { classe: "Nécromancien", xp: XP[9] }), monstre("M")]), "M", "N", coup);
    verifier("niveau 9 : pas encore de sursis, il tombe", r9.etat.combattants.N.aTerre);

    // Les tics de fin de manche n'y touchent pas non plus.
    const tic = clonerEtat(r1.etat);
    tic.file = [];
    tic.combattants.N.etats = [{ nom: "Brûlé", duree: 2 }, { nom: "Soin étalé", duree: 2, tics: [10, 10] }];
    const etapesTic = ticsDeFinDeManche(tic);
    verifier("brûlure et soin étalé : sa vie reste à 0, debout", tic.combattants.N.pv === 0 && !tic.combattants.N.aTerre,
             JSON.stringify(etapesTic.filter(x => x.cible === "N").map(x => x.type)));

    const scene = misEnScene({ type: "sursis", cible: "N", tours: 2 }, r1.etat);
    verifier("à l'écran : « 💀 Sursis : 2 tours »", scene.geste === "message" && /Sursis : 2 tours/.test(scene.texte),
             JSON.stringify(scene));
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
  export const getDoc = async (ref) => {
    const d = (window.__docs || {})[ref.chemin];
    return { exists: () => !!d, data: () => d || {} };
  };
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true });
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data, options }); };
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
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#2b3a55"/><stop offset="1" stop-color="#7a5a8c"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#g)"/></svg>' }));
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
// Les images (fond de la fiche de classe) : un dégradé connu, servi APRÈS le
// blocage général — la dernière route posée est la première consultée.
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#2b3a55"/><stop offset="1" stop-color="#7a5a8c"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#g)"/></svg>' }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

// =========================================================================
console.log("\n5. TÉNÈBRES DANS LE GRIMOIRE ET LA FORGE");
// =========================================================================
{
  const r = await p.evaluate(async (EFFETS) => {
    // La base réelle, sans Ténèbres : le secours local le complète.
    window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
    delete window.EFFETS_BDD_CACHE.EFFET_INEXISTANT;
    const avant = !!window.EFFETS_BDD_CACHE.EFF_TENEBRES;
    window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
    const t = window.EFFETS_BDD_CACHE.EFF_TENEBRES || {};
    const regle = window.MIGRATION_EFFETS.find(x => x.id === "EFF_TENEBRES") || {};

    // La Forge d'un héros donné : la liste qu'elle propose.
    const forgePour = async (perso) => {
      window.__docs = { "Personnages/P1": perso, "Caracteristiques/P1": {} };
      document.getElementById("champ-id-personnage").value = "P1";
      window.OUVERTURE_FORGE_EN_COURS = false;
      await window.ouvrirCreationCompetence();
      const ids = (window.forgeState.effetsBDD || []).map(e => e.id);
      window.fermerForgeCompetence();
      return ids;
    };
    const necro5 = await forgePour({ Classe: "Nécromancien", XP: 2500, Race: "Humain" });
    const necro4 = await forgePour({ Classe: "Nécromancien", XP: 1800, Race: "Humain" });
    const oracle = await forgePour({ Classe: "Oracle", XP: 9000, Race: "Humain" });
    const monstres = window.paletteEffetsMonstres().map(e => e.id);
    return { avant, t, installe: !!regle.champs && window.MIGRATION_EFFETS.some(x => x.id === "EFF_TENEBRES"), secours: !!regle.secoursLocal,
             necro5: necro5.includes("EFF_TENEBRES"), necro4: necro4.includes("EFF_TENEBRES"),
             oracle: oracle.includes("EFF_TENEBRES"), attaqueMagique: oracle.includes("EFF_ATTAQUE_MAGIQUE"),
             monstres: monstres.includes("EFF_TENEBRES"), monstresAutres: monstres.length,
             magique: window.actionEstMagique("Ténèbres"), reconnu: window.estEffetTenebres("TENEBRES") };
  }, EFFETS_PAR_ID);
  verifier("la base réelle ne l'a pas encore", r.avant === false);
  verifier("le secours local le fournit : 2 pts, Intelligence, 3, racine", r.t.Nom === "Ténèbres" && r.t.Cout_PT === "2"
           && r.t.Modificateur === "INTELLIGENCE" && r.t.Valeur === 3 && r.t.Type_Mecanique === "Action/Global",
           JSON.stringify(r.t).slice(0, 120));
  verifier("le bouton d'installation le crée", r.installe && r.secours);
  verifier("la Forge le propose au Nécromancien de niveau 5", r.necro5);
  verifier("pas au niveau 4", !r.necro4);
  verifier("jamais à une autre classe (même de haut niveau)", !r.oracle && r.attaqueMagique);
  verifier("le générateur de monstres ne le pioche pas", !r.monstres && r.monstresAutres > 10, String(r.monstresAutres));
  verifier("c'est un sort (magique), reconnu sans accents", r.magique && r.reconnu);
}

// =========================================================================
console.log("\n6. LA CARTE FORGÉE PART COMME UNE ATTAQUE MAGIQUE QUI VISE L'ÉNERGIE");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    document.getElementById("fenetre-combat").style.display = "block";
    window.jouerSonClic = () => {};
    window.estMonstre = (id) => String(id).startsWith("M");
    window.PLATEAU_VTT = { getCaseState: () => ({}), hexToPixel: (q, r) => ({ x: 300 + q * 60, y: 300 + r * 60 }),
                           pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {} };
    window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
    window.PERSOS_PARTIE = [
      { idPersonnage: "H1", camp: "Allié", prenom: "Morvak", classe: "Nécromancien", xp: 2500,
        PV_Max: 40, PV_Actuels: 45, Fatigue_Max: 100, fatigueActuelle: 100, Etats_Alteres: [], statut: "Vivant" },
      { idPersonnage: "M1", camp: "Ennemi", estMonstre: true, prenom: "Gnoll",
        PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }
    ];
    window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } };
    window.TOKEN_SELECTIONNE = "H1";
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
    window.COMBAT_INDEX_PERSO = 0;
    window.REGIME_CERVEAU = true;
    window.COMPETENCES_CACHE = { C_TEN: { Nom: "Voile noir", Arme: "Magie", Fatigue: 10, Initiative: 20,
      Effets_Compiles: [{ nom: "Ténèbres", desc: "3 dégâts magiques", isMod: false }],
      Composants: { actions: [{ baseEffetId: "EFF_TENEBRES", count: 1, mods: {}, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } } };
    window.CACHE_COMPETENCES_GLOBAL = { H1: window.COMPETENCES_CACHE };
    window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1,
      File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C_TEN", initiative: 20 }] };
    window.CHEMIN_MOUVEMENT = []; window.ZONES_PERSISTANTES = {};
    const etat = await window.demarrerCiblage("C_TEN", { extraire: true, idLanceur: "H1" });
    return (etat && etat.attaques) || [];
  });
  const a = r[0] || {};
  verifier("une attaque extraite, magique, de 3", r.length === 1 && a.typeRes === "Magique" && a.valeurBrute === 3,
           JSON.stringify(r).slice(0, 160));
  verifier("marquée « vers l'énergie »", a.versEnergie === true);
}

// =========================================================================
console.log("\n7. LA FICHE DE CLASSE : LE DESCRIPTIF À GAUCHE");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    await window.ouvrirChoixClasse();
    window.ouvrirFicheClasse("CLASSE_NECROMANCIEN");
    await new Promise(r => setTimeout(r, 400));
    const d = document.getElementById("descriptif-fiche-classe");
    const titre = document.getElementById("titre-fiche-classe").getBoundingClientRect();
    const rd = d.getBoundingClientRect();
    const btn = document.getElementById("btn-valider-classe").getBoundingClientRect();
    const necro = { visible: getComputedStyle(d).display !== "none",
      presentation: (d.querySelector(".descriptif-classe-presentation") || {}).textContent || "",
      niveaux: [...d.querySelectorAll(".palier-classe-niveau")].map(x => x.textContent.trim()),
      titres: [...d.querySelectorAll(".palier-classe-titre")].map(x => x.textContent.trim()),
      texte: d.textContent,
      aGauche: rd.right <= window.innerWidth / 2 + 4 && rd.left >= 0,
      sousLeTitre: rd.top >= titre.bottom - 2, auDessusDuBouton: rd.bottom <= btn.top + 2,
      sousLeRetour: titre.top >= document.getElementById("btn-retour-classe").getBoundingClientRect().bottom - 2,
      titreAGauche: titre.right <= window.innerWidth / 2 + 4,
      // Chaque boîte centrée, son « Niv. N » au-dessus, au milieu du descriptif.
      paliers: [...d.querySelectorAll(".palier-classe")].map(li => {
        const boite = li.getBoundingClientRect(), niv = li.querySelector(".palier-classe-niveau").getBoundingClientRect();
        const corps = li.querySelector(".palier-classe-corps").getBoundingClientRect();
        return { ecart: Math.abs((niv.left + niv.right) / 2 - (boite.left + boite.right) / 2),
                 auDessus: niv.bottom <= corps.top + 1, centre: getComputedStyle(li).textAlign === "center" };
      }) };
    window.retourChoixClasse();
    window.ouvrirFicheClasse("CLASSE_ORACLE");
    const oracle = { visible: getComputedStyle(d).display !== "none",
                     classe: document.getElementById("vue-fiche-classe").classList.contains("avec-descriptif") };
    window.retourChoixClasse();
    window.ouvrirFicheClasse("CLASSE_NECROMANCIEN");
    return { necro, oracle };
  });
  await p.waitForTimeout(300);
  await p.screenshot({ path: "/tmp/claude-0/necro_fiche_classe.png" });
  verifier("le Nécromancien a son descriptif", r.necro.visible && r.necro.presentation.length > 60,
           r.necro.presentation.slice(0, 50));
  verifier("les paliers Niv. 1, 5, 10", JSON.stringify(r.necro.niveaux) === '["Niv. 1","Niv. 5","Niv. 10"]',
           JSON.stringify(r.necro.niveaux));
  verifier("Ténèbres et le sursis y sont dits", /Ténèbres/.test(r.necro.texte) && /Sursis/.test(r.necro.texte)
           && /Gel/.test(r.necro.texte) && /\+5 PV/.test(r.necro.texte));
  verifier("à gauche, sous le titre, au-dessus du bouton",
           r.necro.aGauche && r.necro.sousLeTitre && r.necro.auDessusDuBouton && r.necro.titreAGauche && r.necro.sousLeRetour, JSON.stringify(r.necro).slice(-120));
  verifier("chaque palier : « Niv. N » centré au-dessus de son descriptif, boîte centrée",
           r.necro.paliers.length === 3 && r.necro.paliers.every(x => x.ecart <= 2 && x.auDessus && x.centre),
           JSON.stringify(r.necro.paliers));
  verifier("les autres classes : rien pour le moment", !r.oracle.visible && !r.oracle.classe);

  // Sur un téléphone : pleine largeur, lisible, sans débordement horizontal.
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForTimeout(300);
  const tel = await p.evaluate(() => {
    const d = document.getElementById("descriptif-fiche-classe").getBoundingClientRect();
    const btn = document.getElementById("btn-valider-classe").getBoundingClientRect();
    return { gauche: d.left, droite: d.right, largeur: window.innerWidth,
             deborde: document.documentElement.scrollWidth > window.innerWidth,
             boutonUneLigne: btn.height < 60 };
  });
  await p.screenshot({ path: "/tmp/claude-0/necro_fiche_classe_tel.png" });
  verifier("téléphone : marges de 16 px, rien ne déborde, bouton sur une ligne",
           tel.gauche >= 15 && tel.droite <= tel.largeur - 15 && !tel.deborde && tel.boutonUneLigne,
           JSON.stringify(tel));
  await p.setViewportSize({ width: 1194, height: 834 });
}

// =========================================================================
console.log("\n8. EN SURSIS, LE JEU NE LE CROIT PAS MORT");
// =========================================================================
{
  const r = await p.evaluate(() => {
    window.PERSOS_PARTIE = [{ idPersonnage: "N", classe: "Nécromancien", xp: 7900, PV_Max: 40, PV_Actuels: 0,
                               statut: "Vivant", sursis: { tours: 2 } },
                             { idPersonnage: "X", PV_Max: 40, PV_Actuels: 0, statut: "Vivant" }];
    const fiches = window.pontCombat.fichesDepuisEtat({ combattants: {
      N: { id: "N", pv: 0, pvMax: 45, fatigue: 50, bouclier: 0, etats: [], aTerre: false, sursis: { tours: 1 } } } },
      [{ idPersonnage: "N", PV_Max: 40, statut: "Vivant" }]);
    return { necro: window.estCombattantMort("N"), autre: window.estCombattantMort("X"),
             fiche: fiches[0] };
  });
  verifier("à 0 PV mais en sursis : pas mort pour le jeu", r.necro === false);
  verifier("à 0 PV sans sursis : à terre", r.autre === true);
  verifier("la fiche porte le sursis et garde sa base de PV (40, pas 45)",
           r.fiche.sursis && r.fiche.sursis.tours === 1 && r.fiche.PV_Max === 40 && r.fiche.statut === "Vivant",
           JSON.stringify({ s: r.fiche.sursis, pv: r.fiche.PV_Max }));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
