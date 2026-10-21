// LE STUDIO D'ANIMATION, EN JEU : LA LISTE DE LA v242.
//
// Nico : « poussée, traction magique, peur, provocation, confus s'enfuit,
// immobilisation : tu peux implanter c'est bon. Empoisonnement est lié à une
// attaque, donc il faut garder l'effet d'empoisonnement sur la cible après
// l'animation de lancer des dégâts ; brûlé, même principe : on garde juste
// l'animation sur la cible, pas le sort lancé ; glacé, même truc ; électrifié,
// pareil. Aveuglé, étourdi présence, immobilisation présence, confusion
// présence : tu peux implanter. Peur présence : vire le smiley. Étalement
// (tic des dégâts différés), plaie rouverte : tu peux implanter. Repli (état
// d'un tour) : vire l'émoticône. »
//
//   1. LE CERVEAU DIT QUI : le premier pas d'une fuite sous la Peur porte
//      celui qui effraie (`effroi`) ; la fuite du confus se dit
//      (confusion « fuite ») ; un état posé par une carte porte son auteur ;
//   2. LE PONT : chaque étape a son geste — la poussée et la traction (qui,
//      laquelle), les états posés (sur la cible seule ; la Provocation et
//      l'Immobilisation savent d'où elles viennent ; une zone garde le sien),
//      l'Aveuglé, les tics (Étalement, Plaie rouverte, Brûlure, poison sur les
//      PV et l'énergie, Immobilisation), les états qui durent au début du
//      tour (Étourdi, Confusion) ; le pont les joue, dans l'ordre ;
//   3. LE STUDIO : Glacé, Empoisonnement, Brûlé, Électrifié sans le sort
//      lancé ; plus de smiley sur la Peur, plus d'émoticône sur le Repli ;
//   4. LE VRAI PLATEAU : la poussée et la traction du Studio (le pion file
//      d'un trait, sa case à la fin, sans la glissade d'avant) ; l'effroi
//      avant la fuite ; chaque geste, ses sons, ses mots.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { construireEtatCombat, creerDes } from '../combat_etat.js';
import * as MV from '../mouvement_pur.js';
import * as CV from '../cerveau_combat.js';
import * as PC from '../pont_combat.js';
// (Lu sans exiger ce qui est neuf : sur l'ancien code, le banc dit ce qui manque au lieu de planter.)
const { resoudrePeur } = MV;
const { appliquerIntention } = CV;
const { misEnScene, creerPont } = PC;
const versAnimationDeSaut = PC.versAnimationDeSaut || ((d) => ({ idToken: d.idToken, depart: d.de, arrivee: d.vers }));

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(82)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fiche = (id, camp, extra = {}) => ({
    idPersonnage: id, camp, prenom: id, PV_Max: 60, PV_Actuels: 60,
    Fatigue_Max: 100, Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Critique: 0,
    Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});

console.log("\n1. LE CERVEAU DIT QUI : L'EFFROI, LA FUITE DU CONFUS, L'AUTEUR DE L'ÉTAT");
{
    const monde = (graine = 3) => construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine,
        combattants: [fiche("BOURREAU", "Ennemi"), fiche("PROIE", "Allié")],
        positions: { BOURREAU: { q: 0, r: 0 }, PROIE: { q: 1, r: 0 } },
        partie: { Tour_Combat: 1 }
    });
    const pas = resoudrePeur(monde(), "BOURREAU", "PROIE", creerDes(3), null).filter(e => e.type === "pas");
    verifier("la Peur : le premier pas de la fuite dit qui effraie (« effroi »)",
             pas.length >= 2 && pas[0].effroi === "BOURREAU" && pas[0].fuite === "peur", JSON.stringify(pas[0]));
    verifier("…les pas suivants, non", pas.slice(1).every(e => !("effroi" in e)), String(pas.length));
    const conf = resoudrePeur(monde(), "BOURREAU", "PROIE", creerDes(3), null, { exempte: null, fuite: "confusion" }).filter(e => e.type === "pas");
    verifier("la fuite du confus n'a pas d'effroi (personne ne l'effraie)", conf.length > 0 && conf.every(e => !("effroi" in e) && e.fuite === "confusion"));

    // Le confus qui s'enfuit, par la vraie porte du cerveau.
    const confus = (g) => construireEtatCombat({
        idPartie: "P1", cerveau: "P_01", graine: g,
        combattants: [fiche("MOI", "Allié", { idJoueur: "P_01", Etats_Alteres: [{ nom: "Confusion", duree: 3 }] }),
                      fiche("ORC", "Ennemi", { estMonstre: true })],
        positions: { MOI: { q: 0, r: 0 }, ORC: { q: 2, r: 0 } },
        partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["MOI", "ORC"],
                  File_Attente_Combat: [{ idPersonnage: "MOI", idCarte: "C1" }, { idPersonnage: "ORC", idCarte: "CG" }] }
    });
    let mot = null;
    for (let g = 1; g <= 400 && !mot; g++) {
        const r = appliquerIntention(confus(g), { id: "I1", type: "carte", acteur: "MOI", poste: "P_01", idCarte: "C1",
            attaques: [{ valeurBrute: 10, cibles: ["ORC"], rangeMax: 3, typeRes: "Physique" }], alterations: [], coutFatigue: 5 }, null);
        mot = (r.entree ? r.entree.etapes : []).find(e => e.type === "message" && e.texte === "Confus : s'enfuit !") || null;
    }
    verifier("le confus qui s'enfuit : son mot dit ce qu'il est (confusion « fuite »)", !!mot && mot.confusion === "fuite", JSON.stringify(mot));

    // Un état posé par une carte : son auteur voyage avec lui.
    const duel = () => construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 7,
        combattants: [fiche("LANCEUR", "Ennemi", { idJoueur: "P_01" }), fiche("CIBLE", "Allié")],
        positions: { LANCEUR: { q: 0, r: 0 }, CIBLE: { q: 1, r: 0 } },
        partie: { Tour_Combat: 1, File_Attente_Combat: [{ idPersonnage: "LANCEUR", initiative: 10 }] }
    });
    const r = appliquerIntention(duel(), { id: "i1", type: "carte", acteur: "LANCEUR", idCarte: "C_FEU", attaques: [],
        alterations: [{ nom: "Brûlé", chance: 100, duree: 2, cibles: ["CIBLE"] }], coutFatigue: 0 }, null);
    const pose = (r.entree ? r.entree.etapes : []).find(e => e.type === "etats" && e.pose === "Brûlé");
    verifier("un état posé par une carte porte son auteur (« acteur »)", !!pose && pose.acteur === "LANCEUR", JSON.stringify(pose && { ...pose, liste: undefined }));
}

console.log("\n2. LE PONT : CHAQUE ÉTAPE A SON GESTE");
{
    const etat = construireEtatCombat({
        idPartie: "P1", cerveau: "P1", graine: 1,
        combattants: [fiche("H", "Allié", { Etats_Alteres: [{ nom: "Étourdi", duree: 1 }, { nom: "Confusion", duree: 2 }] }),
                      fiche("M", "Ennemi", { estMonstre: true }),
                      fiche("N", "Ennemi", { estMonstre: true, Etats_Alteres: [{ nom: "Étourdi", duree: 0 }] }),
                      fiche("T", "Ennemi", { estMonstre: true, Etats_Alteres: [{ nom: "Étourdi", duree: 2 }] })],
        positions: { H: { q: 0, r: 0 }, M: { q: 1, r: 0 }, N: { q: 3, r: 0 }, T: { q: 4, r: 0 } },
        partie: { Tour_Combat: 1 }
    });
    etat.combattants.M.fatigue = 60;
    etat.combattants.T.aTerre = true;
    const s = (e) => misEnScene(e, etat);
    const R = (e) => s(e).reaction || {};

    const pou = s({ type: "poussee", cible: "M", acteur: "H", de: { q: 1, r: 0 }, vers: { q: 3, r: 0 } });
    const tra = s({ type: "traction", cible: "M", acteur: "H", de: { q: 3, r: 0 }, vers: { q: 1, r: 0 } });
    verifier("la poussée et la traction disent laquelle, et qui pousse ou tire",
             pou.geste === "poussee" && pou.sorte === "poussee" && pou.acteur === "H" && tra.sorte === "traction" && tra.acteur === "H",
             JSON.stringify([pou, tra]));
    const seul = s({ type: "poussee", cible: "M", de: { q: 1, r: 0 }, vers: { q: 2, r: 0 } });
    verifier("…sans pousseur connu : pas d'acteur inventé", !("acteur" in seul) && seul.sorte === "poussee");
    const saut = versAnimationDeSaut({ idToken: "M", de: { q: 1, r: 0 }, vers: { q: 3, r: 0 }, acteur: "H", sorte: "traction" });
    verifier("…et la traduction vers l'animation les garde", saut.acteur === "H" && saut.sorte === "traction" && saut.arrivee.q === 3, JSON.stringify(saut));
    const pas = s({ type: "pas", acteur: "M", de: { q: 1, r: 0 }, vers: { q: 2, r: 0 }, cout: 2, fuite: "peur", effroi: "H" });
    verifier("le premier pas de la fuite garde l'effroi", pas.effroi === "H" && pas.fuite === "peur");

    const etats = (pose, extra = {}) => R({ type: "etats", cible: "M", pose, liste: [{ nom: pose, duree: 2, ...(extra.dans || {}) }], acteur: "H", ...(extra.etape || {}) });
    const attendus = { "Provocation": "provocation", "Immobilisation": "immobilisation", "Empoisonnement": "empoisonnement",
                       "Brûlé": "brule", "Glacé": "glace", "Électrifié": "electrifie", "Repli": "repli-etat", "Étourdi": "etourdi" };
    const vus = Object.fromEntries(Object.keys(attendus).map(n => [n, etats(n).sorte]));
    verifier("chaque état posé a son geste du Studio, sur la cible",
             Object.entries(attendus).every(([n, sorte]) => vus[n] === sorte) && Object.keys(attendus).every(n => !etats(n).remplace && etats(n).pion === "M"),
             JSON.stringify(vus));
    verifier("la Provocation part de qui a crié (idProvocateur), l'Immobilisation de qui l'a posée",
             etats("Provocation", { dans: { idProvocateur: "N" } }).depuis === "N" && etats("Immobilisation").depuis === "H");
    verifier("…le poison, le feu, le gel, la foudre : sur la cible seule (pas de source)",
             ["Empoisonnement", "Brûlé", "Glacé", "Électrifié"].every(n => !("depuis" in etats(n))));
    verifier("un état venu d'une zone garde le geste de la zone", !("reaction" in s({ type: "etats", cible: "M", pose: "Brûlé", liste: [], zone: "Z1" })));
    verifier("…sauf l'Étourdi, qui avait déjà le sien (comme avant)", R({ type: "etats", cible: "M", pose: "Étourdi", liste: [], zone: "Z1" }).sorte === "etourdi");
    const av = s({ type: "etats", cible: "M", pose: "Aveuglé", liste: [{ nom: "Aveuglé", duree: 2 }] });
    verifier("l'Aveuglé : son geste, qui dit « Aveuglé : 4 cases » (à la place du mot)",
             av.geste === "message" && (av.reaction || {}).sorte === "aveugle" && av.reaction.remplace && av.reaction.texte === "Aveuglé : 4 cases");
    const fuit = R({ type: "message", cible: "M", acteur: "M", texte: "Confus : s'enfuit !", couleur: "#cc66ff", confusion: "fuite" });
    verifier("le confus qui s'enfuit : le « ❗ » du Studio, qui dit le mot", fuit.sorte === "confusion-fuite" && fuit.remplace && fuit.texte === "Confus : s'enfuit !");

    const tic = (nom) => R({ type: "degats", cible: "M", montant: 4, pvApres: 56, tic: nom }).sorte;
    verifier("les tics : Étalement, Plaie rouverte, Brûlure, Empoisonnement ont leur geste",
             tic("Étalement") === "etalement-tic" && tic("Plaie rouverte") === "plaie-rouverte" && tic("Brûlure") === "brule-tic" && tic("Empoisonnement") === "poison-tic",
             [tic("Étalement"), tic("Plaie rouverte"), tic("Brûlure"), tic("Empoisonnement")].join());
    verifier("…le geste accompagne le chiffre (il ne le remplace pas)", s({ type: "degats", cible: "M", montant: 4, pvApres: 56, tic: "Étalement" }).geste === "jauge");
    const saigne = R({ type: "degats", cible: "M", montant: 4, pvApres: 56, tic: "Saignement", nature: "physique" }).sorte;
    verifier("…un tic sans geste garde ce qu'il avait (le Saignement, son coup reçu)", saigne === "coup-physique" && !tic("Saignement"), String(saigne));
    const immo = R({ type: "fatigue", cible: "M", fatigueApres: 80, tic: "Immobilisation" });
    const ven = R({ type: "fatigue", cible: "M", fatigueApres: 50, tic: "Empoisonnement" });
    verifier("l'Immobilisation de fin de manche : sa présence, et la vraie énergie (« +20 ⚡ »)",
             immo.sorte === "immobilisation-presence" && immo.de === 60 && immo.vers === 80 && immo.texte === "+20 ⚡", JSON.stringify(immo));
    verifier("le venin sur l'énergie : son geste (« -10 ⚡ »)", ven.sorte === "poison-energie" && ven.texte === "-10 ⚡", JSON.stringify(ven));

    const tour = (tete, phase = "Resolution") => s({ type: "tour", file: tete ? [{ id: tete }] : [], phase });
    const h = tour("H");
    verifier("son tour commence : l'Étourdi et la Confusion qui durent se rappellent",
             h.geste === "presence" && h.pion === "H" && (h.presences || []).map(p => p.sorte).join() === "etourdi-presence,confusion-presence", JSON.stringify(h));
    verifier("…rien sans état qui dure, un état fini, un pion à terre, hors résolution",
             tour("M").geste === "rien" && tour("N").geste === "rien" && tour("T").geste === "rien" && tour("H", "Planification").geste === "rien" && tour(null).geste === "rien");

    // LE PONT LES JOUE, dans l'ordre.
    const appels = [];
    const pont = creerPont({
        poussee: async (d) => { appels.push({ poussee: versAnimationDeSaut(d) }); },
        reaction: async (d) => { appels.push({ reaction: d.sorte, pion: d.pion }); return true; },
        jauge: () => {}, message: () => {}, pause: async () => {}
    });
    await pont.animer({ type: "poussee", cible: "M", acteur: "H", de: { q: 1, r: 0 }, vers: { q: 3, r: 0 } }, etat);
    await pont.animer({ type: "tour", file: [{ id: "H" }], phase: "Resolution" }, etat);
    await pont.animer({ type: "etats", cible: "M", pose: "Provocation", liste: [{ nom: "Provocation", duree: 2, idProvocateur: "H" }], acteur: "H" }, etat);
    await pont.animer({ type: "fatigue", cible: "M", fatigueApres: 80, tic: "Immobilisation" }, etat);
    const p0 = appels[0] && appels[0].poussee;
    verifier("le pont : la poussée part avec qui pousse et laquelle", !!p0 && p0.acteur === "H" && p0.sorte === "poussee" && p0.depart.q === 1 && p0.arrivee.q === 3,
             JSON.stringify(appels[0]));
    verifier("…puis les présences du tour, la provocation, l'immobilisation de fin de manche",
             appels.slice(1).map(a => a.reaction).join() === "etourdi-presence,confusion-presence,provocation,immobilisation-presence",
             appels.slice(1).map(a => a.reaction).join());
}

console.log("\n3. LE STUDIO : L'ÉTAT SUR LA CIBLE, SANS LE SORT LANCÉ ; NI SMILEY, NI ÉMOTICÔNE");
{
    const combat = fs.readFileSync('/home/user/Ivalis/animations_combat.js', 'utf-8');
    const cat = fs.readFileSync('/home/user/Ivalis/animations_catalogue.js', 'utf-8');
    const bloc = (src, debut, fin) => { const i = src.indexOf(debut); if (i < 0) return ""; const j = src.indexOf(fin, i + debut.length); return src.slice(i, j < 0 ? i + 4000 : j); };
    const gel = bloc(combat, 'id: "gel"', 'id: "poison"'), poison = bloc(combat, 'id: "poison"', '        {\n');
    verifier("Glacé : plus de givre sur le héros ni de trait de glace lancé", !!gel && !/gel-lancer|projectile|lanceur/.test(gel.replace(/Nico[^\n]*\n[^\n]*\n[^\n]*\n/, "")) && /effetGlace/.test(gel));
    verifier("Empoisonnement : plus de fiole lancée — le venin sur la cible, puis son tic", !!poison && !/poison-lancer|projectile/.test(poison) && /effetPoison/.test(poison) && /ticPoison/.test(poison));
    const brule = bloc(cat, "const effetBrule", "const ticBrule"), elec = bloc(cat, "const effetElectrifie", "// LES ÉTATS QUI DURENT");
    verifier("Brûlé : plus de braises qui convergent (le sort lancé) — sur la cible seule", !!brule && !/rassembler|projectile|filer/.test(brule) && /Brûlé !/.test(brule));
    verifier("Électrifié : sur la cible seule", !!elec && !/rassembler|projectile|filer|lanceur/.test(elec) && /Électrifié !/.test(elec));
    const peur = bloc(cat, 'id: "peur-presence"', 'id: "provocation-presence"') + bloc(cat, "const presencePeur", "const pulsationEtalement");
    const repli = bloc(cat, 'id: "repli-etat"', "]);") + bloc(cat, "const contourRepli", "ajouter(6");
    verifier("Peur — présence : plus de smiley", peur.length > 100 && !/😨/.test(peur));
    verifier("Repli (état d'un tour) : plus d'émoticône", repli.length > 100 && !/↩️/.test(repli));
    // L'ancien journal (sequence_tour.js) fait passer la traction par la même animation : elle dit ce qu'elle est.
    const seq = fs.readFileSync('/home/user/Ivalis/sequence_tour.js', 'utf-8');
    verifier("l'ancien journal : la traction dit qu'elle en est une", /traction:\s*\(d\)\s*=>[^\n]*sorte:\s*"traction"/.test(seq));
}

// =========================================================================
//  4. LE VRAI PLATEAU
// =========================================================================
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
  export const setDoc = async () => {}; export const updateDoc = async () => {};
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {}; export const query = (...a) => ({a});
  export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com/**', r => r.fulfill({ contentType: 'image/svg+xml', headers: { 'Access-Control-Allow-Origin': '*' },
  body: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="95" fill="#2a6ad8"/></svg>` }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(1800);

await p.evaluate(() => {
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById("fenetre-combat").style.display = "block";
  window.jouerSonClic = () => {};
  window.estCombattantMort = () => false;
  window.sequenceTourEnAttente = () => false;
  const s = 36;
  window.PLATEAU_VTT = {
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    hexToPixel: (q, r) => ({ x: 300 + 1.5 * s * q, y: 330 + s * (Math.sqrt(3) / 2 * q + Math.sqrt(3) * r) }),
    pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {}, hexSize: s
  };
  window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
  const f = (id, extra) => Object.assign({ idPersonnage: id, prenom: id, camp: "Allié", PV_Max: 60, PV_Actuels: 60,
    Fatigue_Max: 100, fatigueActuelle: 100, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant" }, extra || {});
  window.PERSOS_PARTIE = [f("H1", { prenom: "Aldric", race: "Ondari" }),
                          f("M1", { camp: "Ennemi", estMonstre: true, prenom: "Gobelin" }),
                          f("M2", { camp: "Ennemi", estMonstre: true, prenom: "Orc" })];
  const url = "https://res.cloudinary.com/x/image/upload/portrait.png";
  window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0, url, taille: 55 }, M1: { q: 1, r: 0, taille: 55 }, M2: { q: 2, r: -2, taille: 55 } };
  window.ZONES_PERSISTANTES = {};
  window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 2, File_Attente_Combat: [] };
  window.DELAI_DEPLOIEMENT_MS = 0;
  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
  window.__sons = []; window.__textes = [];
  const vraiSon = window.jouerSonCombat;
  window.jouerSonCombat = (id, f) => { window.__sons.push(id); return vraiSon(id, f); };
  const vraiTexte = window.afficherMessageFlottantHex;
  window.afficherMessageFlottantHex = (q, r, t, c, o) => { window.__textes.push(t); return vraiTexte(q, r, t, c, o); };
  // La glissade d'avant pose le pion « avec transition » (positionnerTokenVTT(…, false)).
  const vraiPos = window.positionnerTokenVTT;
  window.__glissades = 0;
  window.positionnerTokenVTT = (el, sansTransition) => { if (!sansTransition) window.__glissades++; return vraiPos(el, sansTransition); };
  window.__noter = () => { window.__sons = []; window.__textes = []; window.__glissades = 0; };
  window.__guetter = () => {
    const vus = { textes: new Set(), filets: 0, frayeur: 0, lames: 0, sceaux: 0, eclats: 0 }; let fini = false;
    const tour = () => {
      document.querySelectorAll("#conteneur-tokens-vtt .anim-effet").forEach(e => {
        vus.textes.add((e.textContent || "").trim());
        if (e.classList.contains("anim-filet-air")) vus.filets++;
        if (e.classList.contains("anim-frayeur")) vus.frayeur++;
        if (e.querySelector && e.querySelector("polygon")) vus.sceaux++;
      });
      vus.lames = Math.max(vus.lames, document.querySelectorAll("#conteneur-tokens-vtt .entaille-lame").length);
      vus.eclats = Math.max(vus.eclats, document.querySelectorAll("#conteneur-tokens-vtt .anim-effet").length);
      if (!fini) requestAnimationFrame(tour);
    };
    requestAnimationFrame(tour);
    return () => { fini = true; return { icones: [...vus.textes].filter(Boolean).join(" "), filets: vus.filets, frayeur: vus.frayeur, lames: vus.lames, sceaux: vus.sceaux, eclats: vus.eclats }; };
  };
  // `neuves` : sans les animations qui tournaient déjà.
  window.__animsDe = (id, neuves) => {
    const el = document.getElementById("token-" + id), vues = new Set(neuves && el ? el.getAnimations() : []), images = []; let fini = false;
    const tour = () => { if (el) el.getAnimations().forEach(an => { if (!vues.has(an)) { vues.add(an); images.push(an.effect.getKeyframes().map(k => (k.transform || "") + "|" + (k.filter || ""))); } });
                         if (!fini) requestAnimationFrame(tour); };
    requestAnimationFrame(tour);
    return () => { fini = true; return images; };
  };
  window.__case = (id) => { const el = document.getElementById("token-" + id); return el ? el.dataset.q + "," + el.dataset.r : null; };
  window.__attendre = (ms) => new Promise(r => setTimeout(r, ms));
});

console.log("\n4. LE VRAI PLATEAU : LA POUSSÉE, LA TRACTION, L'EFFROI AVANT LA FUITE");
{
  const r = await p.evaluate(async () => {
    const res = {};
    // LA POUSSÉE : M1 (1,0) → (3,0), poussé par H1. En relecture le pion est déjà arrivé.
    // (Le plateau a déjà l'arrivée : c'est l'état projeté, que le redessin de la fin reprend.)
    window.TOKENS_VTT_DATA.M1 = { q: 3, r: 0, taille: 55 };
    const m1 = document.getElementById("token-M1");
    m1.dataset.q = 3; window.positionnerTokenVTT(m1, true);
    window.__noter();
    let g = window.__guetter(), a = window.__animsDe("M1"), h = window.__animsDe("H1");
    await window.jouerAnimationPoussee({ idToken: "M1", depart: { q: 1, r: 0 }, arrivee: { q: 3, r: 0 }, acteur: "H1", sorte: "poussee" });
    const im = a(), ih = h();
    const trajet = im.find(k => k.length > 20) || [];
    res.poussee = { ...g(), sons: window.__sons, textes: window.__textes, glissades: window.__glissades, fin: window.__case("M1"),
                    images: trajet.length, dernier: (trajet[trajet.length - 1] || "").split("|")[0], elan: ih.length > 0,
                    enMouvement: !!(window.PIONS_EN_MOUVEMENT || {}).M1 };
    await window.__attendre(2200);
    // LA TRACTION : M1 (3,0) → (1,0), tiré par H1.
    window.__noter();
    window.TOKENS_VTT_DATA.M1 = { q: 1, r: 0, taille: 55 };
    g = window.__guetter(); a = window.__animsDe("M1");
    await window.jouerAnimationPoussee({ idToken: "M1", depart: { q: 3, r: 0 }, arrivee: { q: 1, r: 0 }, acteur: "H1", sorte: "traction" });
    res.traction = { ...g(), sons: window.__sons, textes: window.__textes, glissades: window.__glissades, fin: window.__case("M1"), trajet: a().some(k => k.length > 20) };
    await window.__attendre(2200);
    // LA PEUR : H1 effraie M1, qui fuit de deux cases.
    window.__noter();
    g = window.__guetter(); a = window.__animsDe("M1"); h = window.__animsDe("H1");
    await window.jouerAnimationPas({ idToken: "M1", de: { q: 1, r: 0 }, vers: { q: 2, r: 0 }, cout: 2, fuite: "peur", effroi: "H1" });
    res.peur1 = { sons: [...window.__sons], textes: [...window.__textes], h: h(), m: a(), fin: window.__case("M1"),
                  teinte: (document.querySelector("#token-M1 .token-img-main") || { style: {} }).style.filter };
    window.__noter(); h = window.__animsDe("H1", true);
    await window.jouerAnimationPas({ idToken: "M1", de: { q: 2, r: 0 }, vers: { q: 3, r: 0 }, cout: 2, fuite: "peur" });
    res.peur2 = { ...g(), sons: window.__sons, textes: window.__textes, h: h().length, fin: window.__case("M1") };
    await window.__attendre(2600);
    res.reste = document.querySelectorAll("#conteneur-tokens-vtt .anim-effet").length;
    return res;
  });
  const P = r.poussee, T = r.traction;
  verifier("la poussée du Studio : l'élan de qui pousse, son son, « Poussé ! »",
           P.elan && P.sons.includes("poussee") && P.textes.includes("Poussé !"), JSON.stringify({ sons: P.sons, textes: P.textes }));
  verifier("…le poussé file d'un trait (une seule glissade, du départ à l'arrivée), sur sa case à la fin",
           P.images > 20 && /translate\(10[78](\.\d+)?px, 62\.\d+px\)/.test(P.dernier) && P.fin === "3,0", `${P.images} images, « ${P.dernier} », ${P.fin}`);
  verifier("…sa traînée de poussière ; plus la glissade d'avant ; plus « en mouvement » à la fin",
           P.eclats >= 4 && P.glissades === 0 && !P.enMouvement, JSON.stringify({ eclats: P.eclats, glissades: P.glissades }));
  verifier("la traction du Studio : son son, « Traction ! », les filets d'air, aspiré jusqu'à sa case",
           T.sons.includes("traction") && T.textes.includes("Traction !") && T.filets >= 5 && T.trajet && T.fin === "1,0" && T.glissades === 0,
           JSON.stringify({ sons: T.sons, textes: T.textes, filets: T.filets, fin: T.fin }));
  const grandit = r.peur1.h.some(k => k.some(x => /scale\(1\.22\)/.test(x))), mauve = r.peur1.h.some(k => k.some(x => /hue-rotate\(228deg\)/.test(x)));
  const rapetisse = r.peur1.m.some(k => k.some(x => /scale\(0\.82\)/.test(x)));
  verifier("l'effroi avant la fuite : qui effraie grandit et se teinte de mauve, l'effrayé rapetisse",
           grandit && mauve && rapetisse, JSON.stringify({ grandit, mauve, rapetisse }));
  verifier("…« Peur ! », les traits de frayeur, son vert ; pas de smiley, pas de « il s'enfuit » redit",
           r.peur1.textes.includes("Peur !") && r.peur2.frayeur >= 1 && /hue-rotate\(58deg\)/.test(r.peur1.teinte || "")
           && !r.peur1.textes.concat(r.peur2.textes).includes("Peur : il s'enfuit !") && !/😨|😱/.test(r.peur2.icones),
           JSON.stringify({ t: r.peur1.textes, teinte: r.peur1.teinte }));
  verifier("…puis il détale case par case (le pas suivant ne rejoue pas l'effroi)",
           r.peur1.sons.includes("course") && r.peur1.fin === "2,0" && r.peur2.fin === "3,0" && r.peur2.h === 0, `${r.peur1.fin} → ${r.peur2.fin}, ${r.peur2.h}`);
  verifier("rien ne reste", r.reste === 0, String(r.reste));
}

console.log("\n5. LE VRAI PLATEAU : LES ÉTATS POSÉS, CEUX QUI DURENT, LES TICS");
{
  const r = await p.evaluate(async () => {
    window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0, taille: 55 }, M1: { q: 1, r: 0, taille: 55 }, M2: { q: 2, r: -2, taille: 55 } };
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    const jouer = async (d, attente = 300) => {
      window.__noter();
      const g = window.__guetter(), a = window.__animsDe(d.pion);
      const joue = await window.animerReactionCombat(d);
      const img = document.querySelector("#token-" + d.pion + " .token-img-main");
      const out = { joue, ...g(), sons: window.__sons, textes: window.__textes, anims: a(), teinte: img ? img.style.filter : "" };
      await window.__attendre(attente);
      return out;
    };
    const res = {};
    res.provocation = await jouer({ sorte: "provocation", pion: "M1", depuis: "H1" });
    res.fuite = await jouer({ sorte: "confusion-fuite", pion: "M1", texte: "Confus : s'enfuit !", couleur: "#cc66ff" });
    res.immo = await jouer({ sorte: "immobilisation", pion: "M1", depuis: "H1" });
    res.poison = await jouer({ sorte: "empoisonnement", pion: "M1" });
    res.venin = await jouer({ sorte: "poison-energie", pion: "M1", de: 80, vers: 70, max: 100, texte: "-10 ⚡" });
    res.morsure = await jouer({ sorte: "poison-tic", pion: "M1" });
    res.brule = await jouer({ sorte: "brule", pion: "M1" });
    res.brulure = await jouer({ sorte: "brule-tic", pion: "M1" });
    res.glace = await jouer({ sorte: "glace", pion: "M1" });
    res.elec = await jouer({ sorte: "electrifie", pion: "M1" });
    res.aveugle = await jouer({ sorte: "aveugle", pion: "M1", texte: "Aveuglé : 4 cases", remplace: true });
    res.etourdi = await jouer({ sorte: "etourdi-presence", pion: "H1" });
    res.confusion = await jouer({ sorte: "confusion-presence", pion: "H1" });
    res.chaines = await jouer({ sorte: "immobilisation-presence", pion: "M1", de: 60, vers: 80, max: 100, texte: "+20 ⚡" });
    res.etalement = await jouer({ sorte: "etalement-tic", pion: "M1" });
    res.plaie = await jouer({ sorte: "plaie-rouverte", pion: "H1" });
    res.repli = await jouer({ sorte: "repli-etat", pion: "H1" });
    await window.__attendre(2600);
    res.reste = document.querySelectorAll("#conteneur-tokens-vtt .anim-effet").length;
    return res;
  });
  const dit = (x, ...mots) => mots.every(m => x.textes.includes(m) || x.icones.includes(m));
  const son = (x, ...ids) => ids.every(id => x.sons.includes(id));
  const court = (x) => JSON.stringify({ joue: x.joue, sons: x.sons, textes: x.textes, icones: x.icones });
  verifier("la provocation : son son, le « ❗ », « Provoqué ! », il vacille",
           r.provocation.joue && son(r.provocation, "provocation") && dit(r.provocation, "❗", "Provoqué !")
           && r.provocation.anims.some(k => k.some(x => /rotate\(-14deg\)/.test(x))), court(r.provocation));
  verifier("le confus qui s'enfuit : le « ❗ », son mot, sa teinte violette",
           r.fuite.joue && son(r.fuite, "confusion") && dit(r.fuite, "❗", "Confus : s'enfuit !") && /hue-rotate\(225deg\)/.test(r.fuite.teinte), court(r.fuite));
  verifier("l'immobilisation : les chaînes, « Immobilisé ! », il tire dessus",
           r.immo.joue && r.immo.sons.filter(s => s === "chaines").length >= 3 && dit(r.immo, "Immobilisé !", "⛓️"), court(r.immo));
  verifier("l'empoisonnement : le venin sur la cible, sans fiole lancée",
           r.poison.joue && son(r.poison, "poison-bulles") && !son(r.poison, "poison-lancer") && dit(r.poison, "Empoisonnement !"), court(r.poison));
  verifier("…son tic : l'énergie (« -10 ⚡ »), puis les PV (« Poison »)",
           r.venin.joue && dit(r.venin, "-10 ⚡") && son(r.venin, "poison-bulles") && r.morsure.joue && dit(r.morsure, "Poison"), court(r.venin) + court(r.morsure));
  verifier("brûlé : « Brûlé ! », la flamme, sur la cible ; son tic « Brûlure »",
           r.brule.joue && son(r.brule, "brule") && dit(r.brule, "Brûlé !", "🔥") && r.brulure.joue && dit(r.brulure, "Brûlure") && son(r.brulure, "brule"), court(r.brule));
  verifier("glacé : « Glacé ! », ce qu'il change, sans trait de glace lancé",
           r.glace.joue && son(r.glace, "glace-impact") && !son(r.glace, "gel-lancer") && dit(r.glace, "Glacé !", "Marche ×2 · +20 % dégâts phys."), court(r.glace));
  verifier("électrifié : « Électrifié ! », « -35 initiative »", r.elec.joue && son(r.elec, "electrique") && dit(r.elec, "Électrifié !", "-35 initiative"), court(r.elec));
  verifier("aveuglé : l'obscurité, « Aveuglé : 4 cases »", r.aveugle.joue && son(r.aveugle, "aveugle") && dit(r.aveugle, "Aveuglé : 4 cases", "🌑"), court(r.aveugle));
  verifier("étourdi (présence) : « Étourdi : 20 % d'échec », ses étoiles",
           r.etourdi.joue && son(r.etourdi, "etourdi") && dit(r.etourdi, "Étourdi : 20 % d'échec"), court(r.etourdi));
  verifier("confusion (présence) : « Confusion », ses « ? »", r.confusion.joue && son(r.confusion, "confusion") && dit(r.confusion, "Confusion", "?"), court(r.confusion));
  verifier("immobilisation (présence) : l'anneau de chaînes, la vraie énergie « +20 ⚡ »",
           r.chaines.joue && son(r.chaines, "chaines") && dit(r.chaines, "Immobilisé", "+20 ⚡", "⛓️"), court(r.chaines));
  verifier("étalement : le sceau pulse, le coup sourd", r.etalement.joue && son(r.etalement, "marque", "coup-sourd") && r.etalement.sceaux >= 1, court(r.etalement));
  verifier("plaie rouverte : le trait rouge, « Plaie rouverte »", r.plaie.joue && son(r.plaie, "saignement") && r.plaie.lames >= 1 && dit(r.plaie, "Plaie rouverte"), court(r.plaie));
  verifier("repli (état d'un tour) : son contour, « Repli (1 tour) », sans émoticône",
           r.repli.joue && son(r.repli, "repli") && dit(r.repli, "Repli (1 tour)") && !/↩/.test(r.repli.icones), court(r.repli));
  verifier("rien ne reste", r.reste === 0, String(r.reste));
}

verifier("aucune erreur de page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
serveur.close();
console.log(echecs ? `\n${echecs} CONTRÔLE(S) EN ÉCHEC` : "\nTOUS LES CONTRÔLES PASSENT");
process.exit(echecs ? 1 : 0);
