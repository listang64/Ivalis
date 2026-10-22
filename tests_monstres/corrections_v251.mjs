// LES CORRECTIONS DE LA v251 — la liste de Nico, après une partie.
//
//   1. « Animation de contre : enlève les émoticônes. »
//   2. « L'animation de fin de tour où tout le monde regagne sa fatigue :
//      fais-les tous jouer en même temps. »
//   3. « Un ennemi brûlé, empoisonné et qui saignait : j'ai vu la jauge
//      réaugmenter pour appliquer les dégâts. » (l'énergie et la vie
//      partageaient la même place sous le pion)
//   4. « Quand on fait un critique, l'étalement de dégâts prend le critique en
//      compte. » (c'était déjà le calcul ; l'écran disait « -0 ! »)
//   5. « Sur iPad Air, quand je déplace la caméra, j'ai des sortes de traits. »
//   6. « Je n'ai plus qu'un seul perso debout, j'ai choisi ma compétence, et
//      pourtant il me met en attente des joueurs ; le perso mort a disparu de
//      la piste d'init mais je peux encore lui sélectionner les compétences » ;
//      « le combat est terminé, pourtant ça ne met pas combat perdu ».
//   7. « En cas de défaite, gain d'XP des monstres vaincus. »
//   8. « Assure-toi que Paramètres > Outils > Monstres soit bien relié aux
//      stats réelles des monstres en jeu. »
//   9. « L'animation d'éclair à distance bug et ne se dirige pas tout le temps
//      vers sa cible. »
//  10. « La distance en plus accordée par l'arc ne devrait pas se mettre sur
//      les compétences magie du personnage. »
import fs from 'fs'; import http from 'http'; import path from 'path';
import * as PC from '../pont_combat.js';
import * as SC from '../spectateur_combat.js';
import { construireEtatCombat, gainReposLong } from '../combat_etat.js';
import * as CV from '../cerveau_combat.js';
import * as MP from '../moteur_pur.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(74)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const EMOJI = /\p{Extended_Pictographic}/u;
const fiche = (id, camp, extra = {}) => ({
    idPersonnage: id, camp, prenom: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});

console.log("\n=========================================================");
console.log("  LES CORRECTIONS DE LA v251");
console.log("=========================================================");

console.log("\n1. LE CONTRE : SON CHIFFRE, SANS ÉMOTICÔNE");
{
    const etat = { combattants: { H1: { id: "H1", pv: 40, pvMax: 40, bouclier: 0 }, M1: { id: "M1", pv: 30, pvMax: 30, bouclier: 0 } } };
    const sc = PC.misEnScene({ type: "degats", cible: "M1", acteur: "H1", montant: 4, renvoi: true, pvApres: 26 }, etat);
    verifier("le coup rendu s'écrit « -4 »", sc.texte === "-4", JSON.stringify(sc.texte));
    verifier("aucune émoticône dans le texte du Contre", !EMOJI.test(String(sc.texte || "")), JSON.stringify(sc.texte));
    verifier("son geste du Studio reste (« contre »)", !!(sc.reaction && sc.reaction.sorte === "contre"), JSON.stringify(sc.reaction));
}

console.log("\n2. LA RÉGÉNÉRATION DE FIN DE MANCHE : TOUS EN MÊME TEMPS");
{
    const regen = (cible, apres) => ({ type: "fatigue", cible, fatigueApres: apres, regeneration: 10 });
    const etapes = [regen("A", 60), regen("B", 70), regen("C", 80), { type: "manche", numero: 2 }];
    const groupe = typeof SC.groupeDeRegeneration === "function" ? SC.groupeDeRegeneration(etapes, 0) : [];
    verifier("les trois regains qui se suivent forment un seul groupe", groupe.length === 3, `${groupe.length}`);
    const deuxFois = typeof SC.groupeDeRegeneration === "function"
        ? SC.groupeDeRegeneration([regen("A", 60), regen("A", 70)], 0) : [];
    verifier("deux regains du même combattant ne se mélangent pas", deuxFois.length === 1, `${deuxFois.length}`);
    const repos = typeof SC.groupeDeRegeneration === "function"
        ? SC.groupeDeRegeneration([{ ...regen("A", 60), repos: true }, regen("B", 70)], 0) : [];
    verifier("un repos long garde son propre geste", repos.length === 0, `${repos.length}`);

    // Le vrai spectateur : il rejoue une fin de manche, et on note quand chaque geste part.
    const departs = [];
    const t0 = Date.now();
    const spectateur = SC.creerSpectateur({
        animer: async (e) => { departs.push({ cible: e.cible, type: e.type, t: Date.now() - t0 }); await new Promise(r => setTimeout(r, 120)); },
        respiration: 0
    });
    spectateur.repartirDe({ version: 0, combat: "", combattants: {
        A: { id: "A", fatigue: 50, fatigueMax: 100 }, B: { id: "B", fatigue: 60, fatigueMax: 100 }, C: { id: "C", fatigue: 70, fatigueMax: 100 } } }, 0);
    spectateur.recevoir([{ v: 1, etapes }]);
    await spectateur.lire();
    const regains = departs.filter(d => d.type === "fatigue");
    const ecart = regains.length ? Math.max(...regains.map(d => d.t)) - Math.min(...regains.map(d => d.t)) : 999;
    verifier("en jeu, les trois regains partent ensemble", regains.length === 3 && ecart < 60, `écart ${ecart} ms`);
    const etatFinal = spectateur.etat();
    verifier("…et chacun est appliqué", etatFinal.combattants.A.fatigue === 60 && etatFinal.combattants.B.fatigue === 70
             && etatFinal.combattants.C.fatigue === 80, JSON.stringify(etatFinal.combattants));
}

console.log("\n4. LE CRITIQUE ET L'ÉTALEMENT");
{
    const monde = () => construireEtatCombat({ idPartie: "P1", cerveau: "P_03", graine: 7,
        combattants: [fiche("H1", "Allié", { idJoueur: "P_03" }), fiche("M1", "Ennemi", { estMonstre: true })],
        positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } },
        partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"], File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C1" }] } });
    const carte = (crit, att, cible = "M1") => ({ type: "carte", idLanceur: "H1", idCarte: "C1", critique: crit,
        attaques: [{ ...att, cibles: [cible] }], alterations: [], jets: { attaqueRatee: false, parCible: { [cible]: { esquive: false, etats: {} } } } });
    const etale = (crit) => {
        const e0 = monde();
        const r = MP.resoudreCarte(e0, carte(crit, { valeurBrute: 10, estEtalement: true, toursEtalement: 2 }));
        const lancement = r.etapes.find(e => e.type === "degats");
        const parts = JSON.stringify(((r.etat.combattants.M1.etats || []).find(e => e.nom === "Étalement") || {}).tics);
        const tics = CV.ticsDeFinDeManche(r.etat);
        return { e0, r, parts, lancement, scene: lancement ? PC.misEnScene(lancement, e0) : {}, tics,
                 texteTic: tics.length ? PC.misEnScene(tics[0], r.etat).texte : "" };
    };
    const normal = etale(false), crit = etale(true);
    const parts = (x) => x.parts;
    verifier("le calcul : 10 étalés sur 2 tours → 5 et 5", parts(normal) === "[5,5]", parts(normal));
    verifier("le calcul : sur un critique → 10 et 10", parts(crit) === "[10,10]", parts(crit));
    verifier("au lancement : plus de « -0 ! », ce qui est rangé (« ⏳ -20 ! »)",
             crit.scene.texte === "⏳ -20 !" && crit.scene.geste === "message", `${crit.scene.geste} « ${crit.scene.texte} »`);
    verifier("…et sans critique, « ⏳ -10 »", normal.scene.texte === "⏳ -10", `« ${normal.scene.texte} »`);
    verifier("le coup porté se voit encore (son geste)", !!(crit.scene.reaction && /^coup-/.test(crit.scene.reaction.sorte)),
             JSON.stringify(crit.scene.reaction));
    verifier("à chaque fin de manche, la part critique le redit (« -10 ! »)", crit.texteTic === "-10 !", `« ${crit.texteTic} »`);
    verifier("une part ordinaire reste « -5 »", normal.texteTic === "-5", `« ${normal.texteTic} »`);
    const soin = (() => {
        const e0 = monde(); e0.combattants.M1.pv = 20;
        const r = MP.resoudreCarte(e0, carte(true, { valeurBrute: 10, isHeal: true, estEtalement: true, toursEtalement: 2 }));
        const tics = CV.ticsDeFinDeManche(r.etat);
        const s = tics.find(e => e.type === "soin");
        return s ? PC.misEnScene(s, r.etat).texte : "";
    })();
    verifier("un soin étalé critique : « +10 ! » à chaque part", soin === "+10 !", `« ${soin} »`);
}

console.log("\n8a. LE TABLEAU DES MONSTRES JUSQU'AU COMBAT (le cerveau)");
{
    const carteM = (idCarte, valeur, fatigue) => ({ idCarte, infos: { portee: 1, fatigue },
        attaques: [{ valeurBrute: valeur, rangeMax: 1, typeRes: "Physique" }], alterations: [] });
    const monde = (extra) => construireEtatCombat({ idPartie: "P1", cerveau: "P_01", graine: 11,
        combattants: [fiche("H1", "Allié", { idJoueur: "P_01", PV_Max: 200, PV_Actuels: 200 }),
                      fiche("M1", "Ennemi", { estMonstre: true, ...extra })],
        positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } },
        partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["M1", "H1"],
                  File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "CM", idCarte2: "CM2" }] } });
    const cartes = (r) => (r ? r.entree.etapes : []).filter(e => e.type === "carte").map(e => e.carte).join(",");
    const deux = CV.jouerCreature(monde({ Palier: "Normal", Nombre_Actions: 2 }), "M1", carteM("CM", 8, 5), null, carteM("CM2", 6, 7));
    verifier("« Nombre d'action » 2 sur une créature Normale : deux compétences", cartes(deux) === "CM,CM2", cartes(deux));
    const une = CV.jouerCreature(monde({ Palier: "Boss", Nombre_Actions: 1 }), "M1", carteM("CM", 8, 5), null, carteM("CM2", 6, 7));
    verifier("« Nombre d'action » 1 sur un Boss : une seule", cartes(une) === "CM", cartes(une));
    const ancien = CV.jouerCreature(monde({ Palier: "Boss" }), "M1", carteM("CM", 8, 5), null, carteM("CM2", 6, 7));
    verifier("un Boss sans ce chiffre (créature d'avant) : toujours deux", cartes(ancien) === "CM,CM2", cartes(ancien));
    const etat = monde({ Palier: "Normal", Repos_Long: 90, Fatigue_Max: 100, Fatigue_Actuelle: 0 });
    verifier("(une fiche qui porte Repos_Long 90 : le combat rend 90 % de la jauge)", gainReposLong(etat.combattants.M1) === 90,
             `${gainReposLong(etat.combattants.M1)}`);
}

console.log("\n6a. LE CERVEAU REND LA MANCHE AVEC SES TOMBÉS — ET CONSTATE LA DÉFAITE");
{
    // Le vrai regime_cerveau.js, sur un Firestore en mémoire (comme manche_suivante.mjs).
    function firestore() {
        const base = new Map(); const ecoutes = []; const cle = (c) => c.join("/");
        const copie = (v) => (v === null || v === undefined ? v : JSON.parse(JSON.stringify(v)));
        function documentsDe(chemin, r) {
            const p = cle(chemin) + "/";
            let l = [...base.entries()].filter(([k]) => k.startsWith(p) && k.slice(p.length).indexOf("/") === -1)
                .map(([k, d]) => ({ ...d, __chemin: k.split("/") }));
            if (r && r.champ !== undefined && r.sup !== undefined) l = l.filter(d => Number(d[r.champ]) > Number(r.sup));
            if (r && r.tri) l.sort((a, b) => (a[r.tri] > b[r.tri] ? 1 : a[r.tri] < b[r.tri] ? -1 : 0));
            return copie(l);
        }
        const attente = [];
        const empiler = () => ecoutes.forEach(e => attente.push({ e, charge: copie(e.estCollection ? documentsDe(e.chemin, e.requete) : (base.get(cle(e.chemin)) || null)) }));
        const io = {
            async lire(chemin) { return copie(base.get(cle(chemin)) || null); },
            async lister(chemin, requete) { return documentsDe(chemin, requete); },
            async lot(operations) {
                (operations || []).forEach(o => { const k = cle(o.chemin);
                    if (o.op === "delete") base.delete(k);
                    else if (o.op === "update") base.set(k, { ...(base.get(k) || {}), ...copie(o.data) });
                    else base.set(k, copie(o.data)); });
                empiler();
            },
            async transaction(chemin, decider) { const k = cle(chemin); const a = decider(copie(base.get(k) || null)); if (!a) return false; base.set(k, copie(a)); empiler(); return true; },
            ecouterDoc(chemin, rappel) { const e = { chemin, rappel, estCollection: false }; ecoutes.push(e); attente.push({ e, charge: copie(base.get(cle(chemin)) || null) }); return () => {}; },
            ecouterCollection(chemin, requete, rappel) { const e = { chemin, requete, rappel, estCollection: true }; ecoutes.push(e); attente.push({ e, charge: documentsDe(chemin, requete) }); return () => {}; }
        };
        async function livrer(tours = 8) {
            for (let t = 0; t < tours; t++) {
                const lot = attente.splice(0, attente.length);
                for (const { e, charge } of lot) await e.rappel(charge);
                await new Promise(r => setTimeout(r, 0));
                if (attente.length === 0) break;
            }
        }
        return { io, livrer };
    }
    const f = firestore();
    const partieDoc = { ID_Rencontre: "renc_v251", Difficulte_Rencontre: "Normale", Phase_Combat: "Preparation", Tour_Combat: 1,
                        Ordre_Initiative: ["M1", "H1", "H2"], File_Attente_Combat: [], Ont_Joue_Ce_Round: [], Combattants_Hors_Jeu: [] };
    const HEROS = fiche("H1", "Allié", { idJoueur: "P_01", Fatigue_Actuelle: 40, Regeneration: 20 });
    // Le second héros n'a plus que 3 PV, et le poison le prend en fin de manche (8 % de 60 = 5).
    const MOURANT = fiche("H2", "Allié", { idJoueur: "P_02", PV_Actuels: 3, Fatigue_Actuelle: 40,
                                           Etats_Alteres: [{ nom: "Empoisonnement", duree: 2 }] });
    const CREATURE = fiche("M1", "Ennemi", { estMonstre: true, nom: "Goule", Personnalite: "brutal", Regeneration: 0, Fatigue_Actuelle: 40 });
    const elements = { "fenetre-combat": { style: { display: "block" } } };
    global.document = { getElementById: (id) => elements[id] || (elements[id] = { style: {}, innerHTML: "", innerText: "" }), addEventListener: () => {} };
    global.localStorage = { getItem: (c) => (c === "ID_JOUEUR_COURANT" ? "P_01" : null), setItem: () => {} };
    let defaites = 0;
    global.window = {
        REGIME_CERVEAU: true, ID_PARTIE_COURANTE: "GAME_V251", ioCombatFirestore: f.io,
        PARTIE_DATA: JSON.parse(JSON.stringify(partieDoc)),
        PERSOS_PARTIE: [CREATURE, HEROS, MOURANT].map(x => JSON.parse(JSON.stringify(x))),
        MONSTRES_PARTIE: [JSON.parse(JSON.stringify(CREATURE))],
        TOKENS_VTT_DATA: { H1: { q: 0, r: 0 }, H2: { q: 0, r: 2 }, M1: { q: 1, r: 0 } },
        ZONES_PERSISTANTES: {},
        pvMaxCombattant: (p) => parseInt(p.PV_Max) || 0, fatigueMaxCombattant: (p) => parseInt(p.Fatigue_Max) || 100,
        esquiveCombattant: () => 0, paradeCombattant: () => 0, defPhysiqueCombattant: () => 0, defMagiqueCombattant: () => 0,
        critiqueCombattant: () => 0, atoutRace: () => ({}), bonusEquip: () => 0,
        estMonHerosCombat: (id) => id === "H1", tracerCombat: () => {},
        modifierPartie: async (modifier) => {
            const sortie = modifier(JSON.parse(JSON.stringify(partieDoc)));
            if (!sortie) return null;
            if (sortie.maj) Object.assign(partieDoc, JSON.parse(JSON.stringify(sortie.maj)));
            return sortie.resultat !== undefined ? sortie.resultat : true;
        },
        demarrerCiblage: async () => ({ attaques: [{ valeurBrute: 9 }], alterations: [], isZone: false, zoneHexesBase: [] }),
        analyserCarteMonstre: () => ({ portee: 1, fatigue: 10 }),
        afficherPisteInitiative: () => {}, actualiserBoutonFinTour: () => {}, actualiserEtatCarteCombat: () => {},
        rafraichirAffichageCombat: () => {}, redessinerPions: () => {}, rafraichirVoileTour: () => {},
        // La défaite : cherchée depuis la projection (v251).
        verifierDefaiteCombat: () => { defaites++; return false; }
    };
    await import('../regime_cerveau.js');
    const attendreEtCliquer = async (limiteMs = 12000) => {
        const debut = Date.now();
        while (Date.now() - debut < limiteMs) {
            await f.livrer(4);
            const r = window.regimeDuJeu && window.regimeDuJeu();
            if (r) {
                r.ok();
                const publie = r.etatPublie();
                if (publie && r.vue() >= publie.version) {
                    await f.livrer(4); await new Promise(x => setTimeout(x, 30));
                    if (r.vue() >= r.etatPublie().version) return;
                }
            }
            await new Promise(x => setTimeout(x, 40));
        }
    };
    const notifier = async () => {
        window.PARTIE_DATA = JSON.parse(JSON.stringify(partieDoc));
        window.regimeSuivreLaPartie(window.PARTIE_DATA);
        await attendreEtCliquer();
    };
    await notifier();
    partieDoc.File_Attente_Combat = [{ idPersonnage: "M1", idCarte: "C_M1" }, { idPersonnage: "H1", idCarte: "C_H1" }];
    partieDoc.Phase_Combat = "Resolution";
    await notifier();
    window.regimeDemande.finDeTour("H1");
    await attendreEtCliquer();
    await f.livrer(6);
    const etat = window.regimeDuJeu().etatPublie();
    verifier("(la manche s'est jouée : le poison a pris le second héros)", !!etat && etat.combattants.H2.aTerre === true,
             etat ? `H2 ${etat.combattants.H2.pv} PV, aTerre ${etat.combattants.H2.aTerre}` : "pas d'état");
    verifier("la partie repasse en préparation, manche 2", partieDoc.Phase_Combat === "Preparation" && partieDoc.Tour_Combat === 2,
             `${partieDoc.Phase_Combat} ${partieDoc.Tour_Combat}`);
    verifier("LE TOMBÉ ENTRE DANS Combattants_Hors_Jeu AVEC LA MANCHE QUI S'OUVRE",
             (partieDoc.Combattants_Hors_Jeu || []).includes("H2"), JSON.stringify(partieDoc.Combattants_Hors_Jeu));
    verifier("…et pas le héros debout", !(partieDoc.Combattants_Hors_Jeu || []).includes("H1"));
    verifier("la défaite est cherchée à chaque projection", defaites > 0, `${defaites} fois`);
}

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
  export const onSnapshot = (q, cb) => { const s = window.__snap; window.__snap = null; if (s && typeof cb === 'function') setTimeout(() => cb(s), 0); return () => {}; };
  export const query = (...a) => ({a});
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


// =========================================================================
//  DANS LA PAGE DU JEU
// =========================================================================
await p.evaluate(() => {
  window.__attendre = (ms) => new Promise(r => setTimeout(r, ms));
  // Ce que la page doit offrir pour qu'un ancien code compte ses échecs au lieu de planter.
  window.__ou = (f, defaut) => { try { return f(); } catch (e) { return defaut; } };
});

console.log("\n3. LES TROIS TICS DE FIN DE MANCHE : LA JAUGE DE VIE NE REMONTE JAMAIS");
{
  const r = await p.evaluate(async () => {
    const PC = await import('./pont_combat.js'), CE = await import('./combat_etat.js'), CV = await import('./cerveau_combat.js');
    const f = (id, camp, extra = {}) => ({ idPersonnage: id, camp, prenom: id, PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
      Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
    let etat = CE.construireEtatCombat({ idPartie: "P1", cerveau: "P1", graine: 3,
      combattants: [f("H1", "Allié"), f("M1", "Ennemi", { estMonstre: true, Etats_Alteres: [{ nom: "Brûlé", duree: 2 }, { nom: "Empoisonnement", duree: 2 }, { nom: "Saignement", duree: 2 }] })],
      positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } }, partie: { Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"] } });
    const etapes = CV.ticsDeFinDeManche(JSON.parse(JSON.stringify(etat)));
    const pont = PC.creerPont({ jauge: (...a) => window.afficherFlashDegatToken(...a),
                                reaction: (d) => window.animerReactionCombat ? window.animerReactionCombat(d) : false });
    // La barre visible À LA PLACE DE LA VIE (sous le pion), à chaque instant.
    const serie = [], places = new Set();
    let fini = false;
    const sonde = () => {
      const el = document.getElementById("token-M1");
      const vues = el ? [...el.querySelectorAll(".jauge-flash-token")].filter(j => parseFloat(getComputedStyle(j).opacity) > 0.05) : [];
      vues.forEach(j => places.add((j.firstChild.style.backgroundColor || "") + "@" + getComputedStyle(j).bottom));
      const vie = vues.filter(j => getComputedStyle(j).bottom === "-12px");
      if (vie.length) { const j = vie[vie.length - 1]; serie.push(Math.round(parseFloat(getComputedStyle(j.firstChild).width) / parseFloat(getComputedStyle(j).width) * 100)); }
      if (!fini) setTimeout(sonde, 30);
    };
    sonde();
    for (const e of etapes) { await pont.animer(e, etat); etat = CE.appliquerEtape(etat, e); }
    await new Promise(r => setTimeout(r, 1900));
    fini = true;
    let remontee = 0;
    for (let i = 1; i < serie.length; i++) remontee = Math.max(remontee, serie[i] - serie[i - 1]);
    return { types: etapes.map(e => e.tic + ":" + e.type).join(","), pv: etat.combattants.M1.pv, remontee, debut: serie[0], finSerie: serie[serie.length - 1],
             places: [...places] };
  });
  verifier("(le poison, la brûlure et le saignement mordent : 100 → 76)", r.pv === 76, `${r.pv} PV — ${r.types}`);
  verifier("LA BARRE DE VIE NE REMONTE JAMAIS entre deux tics", r.remontee <= 1, `remontée max ${r.remontee} % (${r.debut} → ${r.finSerie})`);
  const energie = r.places.filter(x => /226, 196, 106/.test(x));
  const vie = r.places.filter(x => /255, 76, 76/.test(x));
  verifier("l'énergie a sa propre ligne, sous celle de la vie",
           energie.length > 0 && vie.length > 0 && energie.every(x => !x.endsWith("-12px")), JSON.stringify(r.places));
}

console.log("\n5. LA CAMÉRA BOUGE : LES VOILES DES ZONES S'EFFACENT, PUIS REVIENNENT");
{
  const r = await p.evaluate(async () => {
    const plateau = document.getElementById("transform-plateau");
    const voiles = document.createElement("div");
    voiles.className = "zone-proc-voiles";
    voiles.style.cssText = "position:absolute; left:0; top:0; width:50px; height:50px;";
    plateau.appendChild(voiles);
    const conteneur = document.getElementById("conteneur-plateau-vtt");
    const avant = getComputedStyle(voiles).visibility;
    window.appliquerTransformPlateau();
    const pendant = { classe: conteneur.classList.contains("camera-en-mouvement"), visibilite: getComputedStyle(voiles).visibility };
    await new Promise(r => setTimeout(r, 200));
    window.appliquerTransformPlateau();            // le doigt glisse encore
    await new Promise(r => setTimeout(r, 300));
    const toujours = conteneur.classList.contains("camera-en-mouvement");
    await new Promise(r => setTimeout(r, 400));
    const apres = { classe: conteneur.classList.contains("camera-en-mouvement"), visibilite: getComputedStyle(voiles).visibility };
    voiles.remove();
    return { avant, pendant, toujours, apres };
  });
  verifier("au repos, les voiles se voient", r.avant === "visible", r.avant);
  verifier("la caméra bouge : les voiles disparaissent", r.pendant.classe && r.pendant.visibilite === "hidden", JSON.stringify(r.pendant));
  verifier("tant qu'elle bouge, ils restent cachés", r.toujours === true);
  verifier("elle s'arrête : ils reviennent", !r.apres.classe && r.apres.visibilite === "visible", JSON.stringify(r.apres));
}

console.log("\n6b. UN HÉROS TOMBÉ N'EST PLUS ATTENDU, ET NE CHOISIT PLUS DE CARTE");
{
  const r = await p.evaluate(async () => {
    const etatDe = (manche) => ({ phase: "Preparation", manche, combat: "R1",
      combattants: { A1: { id: "A1", aTerre: false }, D1: { id: "D1", aTerre: true }, M1: { id: "M1", aTerre: false } } });
    let publie = etatDe(3);
    const vraiRegime = window.regimeDuJeu;
    window.regimeDuJeu = () => ({ etatPublie: () => publie, etatAffiche: () => null, vue: () => 0, jeSuisLeCerveau: () => false });
    const data = { ID_Rencontre: "R1", Tour_Combat: 3, Ordre_Initiative: ["A1", "D1", "M1"], Combattants_Hors_Jeu: [], Ont_Joue_Ce_Round: ["A1", "M1"] };
    const attendus = window.combattantsAttendus(data).join(",");
    const toutLeMonde = window.toutLeMondeAJoue(data, []);
    publie = etatDe(2);
    const autreManche = window.combattantsAttendus(data).join(",");
    publie = etatDe(3);

    // Le panneau : le héros montré est tombé, un autre des miens tient debout.
    localStorage.setItem("ID_JOUEUR_COURANT", "J1");
    const heros = (id, pv) => ({ idPersonnage: id, prenom: id, idJoueur: "J1", camp: "Allié", PV_Max: 50, PV_Actuels: pv, Fatigue_Max: 100,
                                 fatigueActuelle: 100, Etats_Alteres: [], statut: "Vivant", deckEquipe: [] });
    window.PERSOS_PARTIE = [heros("D1", 0), heros("A1", 30)];
    window.PARTIE_DATA = { ...data, Phase_Combat: "Preparation", File_Attente_Combat: [] };
    window.ID_PARTIE_COURANTE = "PARTIE_V251";
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0], window.PERSOS_PARTIE[1]];
    window.COMBAT_INDEX_PERSO = 0;
    const refus = [];
    const vraiTracer = window.tracerCombat;
    window.tracerCombat = (i, q, d) => { refus.push(q); };
    window.__ou(() => window.actualiserEtatCarteCombat(), null);
    const deck = document.getElementById("combat-liste-competences");
    const deckMort = deck ? { opacite: deck.style.opacity, clic: deck.style.pointerEvents } : null;
    await window.__ou(() => window.jouerCarteCombat("CARTE_INCONNUE"), null);
    window.__ou(() => window.rafraichirAffichageCombat(), null);
    const indexApres = window.COMBAT_INDEX_PERSO;
    window.tracerCombat = vraiTracer;
    window.regimeDuJeu = vraiRegime;
    return { attendus, toutLeMonde, autreManche, deckMort, refus: refus.join(" | "), indexApres };
  });
  verifier("l'état qui ouvre la manche dit D1 tombé : on ne l'attend plus", r.attendus === "A1,M1", r.attendus);
  verifier("…donc tout le monde a joué, la manche peut s'ouvrir", r.toutLeMonde === true);
  verifier("un état d'une autre manche ne décide rien (un Médicus a pu relever)", r.autreManche === "A1,D1,M1", r.autreManche);
  verifier("le deck du héros tombé s'éteint", !!r.deckMort && r.deckMort.opacite === "0.4" && r.deckMort.clic === "none", JSON.stringify(r.deckMort));
  verifier("sa carte est refusée : « ce héros est à terre »", /à terre/.test(r.refus), r.refus);
  verifier("le panneau passe au héros encore debout", r.indexApres === 1, `index ${r.indexApres}`);
}

console.log("\n7. LA DÉFAITE RAPPORTE L'XP DES CRÉATURES ABATTUES");
{
  const r = await p.evaluate(async () => {
    try { localStorage.removeItem("ivalis_fin_combat_vue"); } catch (e) {}
    window.ID_PARTIE_COURANTE = "PARTIE_V251";
    window.__partie = { ID_Rencontre: "R_DEF" };
    window.PARTIE_DATA = { ...window.__partie };
    window.modifierPartie = async (fn) => { const s = fn(JSON.parse(JSON.stringify(window.__partie))); if (!s) return null; Object.assign(window.__partie, s.maj); return s.resultat; };
    const base = { camp: "Allié", race: "Humain", PV_Max: 60, Fatigue_Max: 100, caracs: { con: 10 }, talents: {}, deckEquipe: [], blessures: [] };
    window.PERSOS_PARTIE = [{ ...base, idPersonnage: "Q1", prenom: "Aldric", idJoueur: "J1", PV_Actuels: 0 },
                            { ...base, idPersonnage: "Q2", prenom: "Bryn", idJoueur: "J2", PV_Actuels: 0 }];
    window.PERSOS_JOUEURS_PARTIE = window.PERSOS_PARTIE;
    window.MONSTRES_PARTIE = [{ idPersonnage: "X1", camp: "Ennemi", estMonstre: true, statut: "Mort", PV_Max: 20, PV_Actuels: 0, Palier: "Normal", XP_Groupe: 100 },
                              { idPersonnage: "X2", camp: "Ennemi", estMonstre: true, statut: "Mort", PV_Max: 20, PV_Actuels: 0, Palier: "Petit", XP_Groupe: 40 },
                              { idPersonnage: "X3", camp: "Ennemi", estMonstre: true, PV_Max: 20, PV_Actuels: 20, Palier: "Élite", XP_Groupe: 240 }];
    const donnes = [];
    const vrai = window.distribuerXP;
    window.distribuerXP = async (ids, xp) => { donnes.push({ ids: [...ids], xp }); };
    const fin = await window.cloturerCombat("defaite");
    window.distribuerXP = vrai;
    await new Promise(r => setTimeout(r, 200));
    window.afficherFinCombat(window.__partie.Fin_Combat, { force: true });
    await new Promise(r => setTimeout(r, 300));
    const ligne = (document.querySelector("#fin-combat-voile .fin-combat-xp") || {}).textContent || "";
    const v = document.getElementById("fin-combat-voile"); if (v) { v.style.display = "none"; v.innerHTML = ""; }
    return { issue: fin && fin.issue, xp: fin && fin.xp, donnes, ligne };
  });
  verifier("(la défaite est écrite)", r.issue === "defaite", String(r.issue));
  verifier("les créatures tombées rapportent leur XP (100 + 40 ; pas celle encore debout)", r.xp === 140, String(r.xp));
  verifier("chaque héros du combat la reçoit, une fois", r.donnes.length === 1 && r.donnes[0].xp === 140
           && r.donnes[0].ids.join(",") === "Q1,Q2", JSON.stringify(r.donnes));
  verifier("le bandeau « Défaite » l'annonce", /\+140 XP/.test(r.ligne), JSON.stringify(r.ligne));
}

console.log("\n8b. LE TABLEAU DES MONSTRES JUSQU'AU COMBAT (la page)");
{
  const r = await p.evaluate(async () => {
    const doc = (id, data) => ({ id, data: () => data });
    window.__snap = { forEach: (fn) => [
      doc("MON_A", { ID_Partie: "PARTIE_V251", Camp: "Ennemi", Statut: "Vivant", Palier: "Normal", Archetype: "TANK CAC", PV_Max: 90, PV_Actuels: 90,
                     Fatigue_Max: 90, Fatigue_Actuelle: 90, Def_Physique: 30, Def_Magique: 20, Esquive: 20, Parade: 20, Regeneration: 30,
                     Repos_Long: 90, Nombre_Actions: 2, XP_Groupe: 100 }),
      doc("MON_B", { ID_Partie: "PARTIE_V251", Camp: "Ennemi", Statut: "Vivant", Palier: "Boss", Archetype: "DPS CAC", PV_Max: 240, PV_Actuels: 240 })
    ].forEach(fn) };
    window.__ou(() => window.ecouterMonstresPartie("PARTIE_V251"), null);
    await new Promise(r => setTimeout(r, 100));
    const a = (window.MONSTRES_PARTIE || []).find(m => m.idPersonnage === "MON_A") || {};
    const bb = (window.MONSTRES_PARTIE || []).find(m => m.idPersonnage === "MON_B") || {};
    // La seconde compétence, choisie en préparation (monstres_ia.js).
    const deck = { CA: { Nom: "Griffe", Fatigue: 10, Initiative: 30, Effets_Compiles: [{ nom: "Attaque lourde", desc: "12 dégâts physiques" }] },
                   CB: { Nom: "Rugissement", Fatigue: 8, Initiative: 20, Effets_Compiles: [{ nom: "Attaque légère", desc: "6 dégâts physiques" }] } };
    window.CACHE_COMPETENCES_GLOBAL = { ...(window.CACHE_COMPETENCES_GLOBAL || {}), B1: deck };
    const m = (palier, actions) => ({ idPersonnage: "B1", camp: "Ennemi", estMonstre: true, Palier: palier, prenom: "B", Nombre_Actions: actions,
                                     fatigueActuelle: 100, Fatigue_Max: 100, deckEquipe: ["CA", "CB"], Etats_Alteres: [] });
    const premiere = { id: "CA", data: deck.CA };
    const sc = (palier, n) => { const s = window.__ou(() => window.secondeCarteBoss(m(palier, n), premiere), null); return s ? s.id : null; };
    return { reposA: a.Repos_Long, actionsA: a.Nombre_Actions, actionsB: bb.Nombre_Actions,
             normal2: sc("Normal", 2), boss1: sc("Boss", 1), boss2: sc("Boss", 2) };
  });
  verifier("le « Repos long » du tableau arrive sur la créature (90 %)", r.reposA === 90, String(r.reposA));
  verifier("son « Nombre d'action » aussi (2)", r.actionsA === 2, String(r.actionsA));
  verifier("un Boss d'avant ce champ : 2 actions", r.actionsB === 2, String(r.actionsB));
  verifier("une créature Normale à 2 actions choisit une seconde compétence", r.normal2 === "CB", String(r.normal2));
  verifier("un Boss réglé à 1 action n'en choisit qu'une", r.boss1 === null, String(r.boss1));
  verifier("un Boss à 2 actions, toujours deux", r.boss2 === "CB", String(r.boss2));
}

console.log("\n9. L'ÉCLAIR VA À SA CIBLE, MÊME SI LES PIONS SONT REDESSINÉS PENDANT LE GESTE");
{
  const essai = (redessiner) => p.evaluate(async (redessiner) => {
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Aldric", camp: "Allié", PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, fatigueActuelle: 100, Etats_Alteres: [], statut: "Vivant" },
                            { idPersonnage: "M1", prenom: "Gobelin", camp: "Ennemi", estMonstre: true, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, fatigueActuelle: 100, Etats_Alteres: [], statut: "Vivant" }];
    window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0, taille: 55 }, M1: { q: 4, r: -2, taille: 55 } };
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    await new Promise(r => setTimeout(r, 300));
    const calque = document.getElementById("conteneur-tokens-vtt"), c = calque.getBoundingClientRect();
    const centre = (id) => { const t = document.getElementById("token-" + id).getBoundingClientRect(); return { x: t.left - c.left + t.width / 2, y: t.top - c.top + t.height / 2 }; };
    const cible = centre("M1");
    const bouts = [];
    let fini = false;
    const sonde = () => {
      calque.querySelectorAll(".anim-effet").forEach(e => {
        if (!e.querySelector("polyline") || e.__vu) return; e.__vu = true;
        const m = /rotate\(([-0-9.e]+)deg\)/.exec(e.style.transform || ""); const a = m ? parseFloat(m[1]) * Math.PI / 180 : 0;
        const L = parseFloat(e.style.width), x0 = parseFloat(e.style.left), y0 = parseFloat(e.style.top);
        bouts.push({ x: x0 + L * Math.cos(a), y: y0 + L * Math.sin(a) });
      });
      if (!fini) requestAnimationFrame(sonde);
    };
    sonde();
    const jeu = window.animerAttaqueCombat({ pion: "H1", cibles: ["M1"], touches: ["M1"], element: "Foudre", carte: "C1" });
    if (redessiner) { await new Promise(r => setTimeout(r, 120)); window.appliquerTokensVTT(window.TOKENS_VTT_DATA); }
    await jeu; fini = true;
    const vers = bouts.slice(-2);
    return { n: vers.length, ecart: vers.length ? Math.round(Math.max(...vers.map(b => Math.hypot(b.x - cible.x, b.y - cible.y)))) : 999 };
  }, redessiner);
  const calme = await essai(false), redessine = await essai(true);
  verifier("(sans redessin, l'éclair frappe la cible)", calme.n === 2 && calme.ecart <= 2, JSON.stringify(calme));
  verifier("LES PIONS REDESSINÉS EN PLEIN GESTE : L'ÉCLAIR VA QUAND MÊME À SA CIBLE", redessine.n === 2 && redessine.ecart <= 2, JSON.stringify(redessine));
}

console.log("\n10. LA PORTÉE DE L'ARC NE S'AJOUTE PAS AUX SORTS");
{
  const r = await p.evaluate(() => {
    const vraisObjets = window.objetsEquipes, vraiBonus = window.bonusEquip;
    const arc = { nom: "Arc court", type: "Arme légère Distance", bonus: { portee: 2 } };
    window.objetsEquipes = () => [arc];
    window.bonusEquip = (p, cle) => (cle === "portee" ? 2 : 0);
    const heros = { idPersonnage: "Z1", camp: "Allié", Etats_Alteres: [] };
    const sort = window.porteeAvecArme(heros, false, 1, "Magie");
    const sortLoin = window.porteeAvecArme(heros, true, 3, "Magie");
    const tir = window.porteeAvecArme(heros, false, 1, "Arme légère Distance");
    window.objetsEquipes = vraisObjets; window.bonusEquip = vraiBonus;
    return { sort, sortLoin, tir };
  });
  verifier("un sort au contact reste au contact, arc en main", r.sort.isRanged === false && r.sort.rangeMax === 1, JSON.stringify(r.sort));
  verifier("un sort à 3 cases garde ses 3 cases (pas 5)", r.sortLoin.rangeMax === 3, JSON.stringify(r.sortLoin));
  verifier("une technique de tir, elle, prend la portée de l'arc (1 + 2)", r.tir.isRanged === true && r.tir.rangeMax === 3, JSON.stringify(r.tir));
}

verifier("aucune erreur JS dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
