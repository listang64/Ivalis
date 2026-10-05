// LA CLASSE HOPLITE.
//
// Nico : « Lvl1 : +5 % Parade / +5 % résistance physique. Lvl5 : COMP Mur de
// bouclier. Lvl10 : COMP Rempart. Mur de bouclier : fatigue 0, une fois par
// combat, +60 % de parade sur soi sur le tour, Init 100. Rempart : fatigue 0,
// une fois par combat, sur un allié adjacent : divise l'attaque reçue en deux
// attaques, dégâts divisés par deux, chacun la reçoit comme une attaque
// indépendante. 3 tours, doit rester adjacent. Init 105. Pas pour les
// altérations d'état. Ses techniques s'ajoutent aux compétences équipées sans
// compter dans le total ; dans la fiche perso, une séparation entre les
// techniques créées par le joueur et celles de classe. »
// Ses réponses : le Mur dure la manche où il est lancé ; le Rempart dort quand
// ils s'éloignent et se réveille quand ils se rapprochent ; pas de jet de
// défense pour l'Hoplite ; partagés : les cartes (zones comprises) et les
// attaques d'opportunité, pas les tics ni les nappes ; il s'arrête si
// l'Hoplite tombe.
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat } from '../combat_etat.js';
import { resoudreCarte, paradeDe, protecteurRempart } from '../moteur_pur.js';
import { validerIntention, appliquerIntention, vieillirLesEtats, ticsDeFinDeManche } from '../cerveau_combat.js';
import { infligerOpportunite } from '../mouvement_pur.js';
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
const XP = { 1: 0, 4: 1800, 5: 2500, 9: 6400, 10: 7900 };

const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const hoplite = (niveau, extra = {}) => fiche("H", { classe: "Hoplite", xp: XP[niveau], ...extra });

// H en (0,0), A (son allié) en (1,0), M (l'ennemi) en (2,0), B (un allié loin) en (5,0).
const monde = (niveauHoplite = 10, positions = {}) => {
    const fiches = [hoplite(niveauHoplite), fiche("A"), fiche("M"), fiche("B")];
    const pos = { H: { q: 0, r: 0 }, A: { q: 1, r: 0 }, M: { q: 2, r: 0 }, B: { q: 5, r: 0 }, ...positions };
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: fiches, positions: pos,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["H", "A", "M", "B"];
    e.phase = "Resolution";
    return e;
};
const enTete = (e, id, carte) => { e.file = [{ id, carte, initiative: 100, pas: 0 }, { id: "M", carte: "X", initiative: 10, pas: 0 }]; return e; };
const intention = (idCarte, cible) => ({ id: "I" + Math.random(), type: "classe", acteur: "H", idCarte, ...(cible ? { cible } : {}) });
const frapper = (e, cible, valeur, extra = {}) => resoudreCarte(e, {
    type: "carte", idLanceur: "M", idCarte: "C", critique: !!extra.critique,
    attaques: [{ valeurBrute: valeur, typeRes: extra.typeRes || "Physique", cibles: [cible] }],
    alterations: (extra.alterations || []).map(a => ({ ...a, cibles: [cible] })),
    jets: { attaqueRatee: false, parCible: { [cible]: { esquive: false,
            etats: Object.fromEntries((extra.alterations || []).map(a => [a.nom, true])) } } } });

console.log("\n=========================================================");
console.log("  L'HOPLITE");
console.log("=========================================================");

// =========================================================================
console.log("\n1. NIVEAU 1 : +5 PARADE, +5 RÉSISTANCE PHYSIQUE ; TECHNIQUES AUX NIVEAUX 5 ET 10");
// =========================================================================
{
    const a1 = w.atoutClasse(hoplite(1)), a5 = w.atoutClasse(hoplite(5)), a10 = w.atoutClasse(hoplite(10));
    verifier("niveau 1 : +5 parade, +5 défense physique, pas de technique",
             a1.parade === 5 && a1.defPhysique === 5 && !(a1.techniques || []).length, JSON.stringify(a1));
    verifier("niveau 5 : Mur de bouclier", JSON.stringify(a5.techniques) === '["CLASSE_MUR_BOUCLIER"]', JSON.stringify(a5.techniques));
    verifier("niveau 10 : Mur de bouclier et Rempart",
             JSON.stringify(a10.techniques) === '["CLASSE_MUR_BOUCLIER","CLASSE_REMPART"]', JSON.stringify(a10.techniques));
    verifier("la parade et la défense physique de la fiche montent de 5",
             w.paradeCombattant(hoplite(1)) === w.paradeCombattant(fiche("X")) + 5
             && w.defPhysiqueCombattant(hoplite(1)) === w.defPhysiqueCombattant(fiche("X")) + 5);
    const e = monde(10);
    verifier("en combat : +5 de parade et de défense physique, techniques dans l'atout",
             e.combattants.H.def.parade === 5 && e.combattants.H.def.physique === 5
             && e.combattants.H.atouts.techniques.length === 2, JSON.stringify(e.combattants.H.def));
    verifier("une carte de technique : initiative 100 / 105, fatigue 0",
             w.carteTechniqueClasse("CLASSE_MUR_BOUCLIER").Initiative === 100 && w.carteTechniqueClasse("CLASSE_REMPART").Initiative === 105
             && w.carteTechniqueClasse("CLASSE_MUR_BOUCLIER").Fatigue === 0);
    verifier("la limite en main ne bouge pas (6)", w.competencesMaxCombattant(hoplite(10)) === 6);
}

// =========================================================================
console.log("\n2. MUR DE BOUCLIER : +60 DE PARADE JUSQU'À LA FIN DE LA MANCHE, UNE FOIS");
// =========================================================================
{
    const e = enTete(monde(5), "H", "CLASSE_MUR_BOUCLIER");
    const i = intention("CLASSE_MUR_BOUCLIER");
    verifier("l'intention est acceptée", validerIntention(e, i).ok, validerIntention(e, i).raison);
    const pas = appliquerIntention(e, i);
    const h = pas.etat.combattants.H;
    verifier("+60 de parade sur soi (5 + 60)", paradeDe(h) === 65, String(paradeDe(h)));
    verifier("la technique est marquée « utilisée »", JSON.stringify(h.techniquesUtilisees) === '["CLASSE_MUR_BOUCLIER"]');
    verifier("elle occupe le tour : la file avance", pas.etat.file[0] && pas.etat.file[0].id === "M",
             JSON.stringify(pas.etat.file.map(f => f.id)));
    verifier("et ne coûte aucune énergie", h.fatigue === 100);
    verifier("l'état reste cohérent", verifierEtatCombat(pas.etat).length === 0, verifierEtatCombat(pas.etat).join(" | "));
    const rejoue = appliquerEntree(e, pas.entree).combattants.H;
    verifier("rejoué depuis le journal : même parade, même usage",
             paradeDe(rejoue) === 65 && JSON.stringify(rejoue.techniquesUtilisees) === '["CLASSE_MUR_BOUCLIER"]');
    const fin = clonerEtat(pas.etat);
    vieillirLesEtats(fin);
    verifier("à la fin de la manche, il tombe", paradeDe(fin.combattants.H) === 5, String(paradeDe(fin.combattants.H)));
    const encore = enTete(clonerEtat(pas.etat), "H", "CLASSE_MUR_BOUCLIER");
    verifier("une seconde fois dans le combat : refusée", !validerIntention(encore, intention("CLASSE_MUR_BOUCLIER")).ok,
             validerIntention(encore, intention("CLASSE_MUR_BOUCLIER")).raison);
    const niv4 = enTete(monde(4), "H", "CLASSE_MUR_BOUCLIER");
    verifier("niveau 4 : il ne l'a pas", !validerIntention(niv4, intention("CLASSE_MUR_BOUCLIER")).ok);
    const autreCarte = enTete(monde(5), "H", "COMP_x");
    verifier("pas si une autre carte a été choisie pour la manche", !validerIntention(autreCarte, intention("CLASSE_MUR_BOUCLIER")).ok);
}

// =========================================================================
console.log("\n3. REMPART : SUR UN ALLIÉ ADJACENT, POUR 3 MANCHES");
// =========================================================================
let protege;
{
    const e = enTete(monde(10), "H", "CLASSE_REMPART");
    const ok = (cible) => validerIntention(e, intention("CLASSE_REMPART", cible));
    verifier("sur l'allié adjacent : accepté", ok("A").ok, ok("A").raison);
    verifier("sur un allié trop loin : refusé", !ok("B").ok, ok("B").raison);
    verifier("sur un ennemi : refusé", !ok("M").ok);
    verifier("sur soi : refusé", !ok("H").ok);
    verifier("sans cible : refusé", !ok(undefined).ok);
    const pas = appliquerIntention(e, intention("CLASSE_REMPART", "A"));
    const etat = pas.etat.combattants.A.etats.find(x => x.nom === "Rempart");
    verifier("l'allié porte le Rempart, 3 manches, protégé par H",
             !!etat && etat.duree === 3 && etat.idProtecteur === "H", JSON.stringify(etat));
    verifier("la technique est marquée « utilisée »", pas.etat.combattants.H.techniquesUtilisees.includes("CLASSE_REMPART"));
    protege = pas.etat;
    const t = clonerEtat(protege);
    vieillirLesEtats(t); vieillirLesEtats(t);
    const reste2 = t.combattants.A.etats.some(x => x.nom === "Rempart");
    vieillirLesEtats(t);
    verifier("il tient 3 manches, puis s'éteint", reste2 && !t.combattants.A.etats.some(x => x.nom === "Rempart"));
}

// =========================================================================
console.log("\n4. LE PARTAGE DES COUPS");
// =========================================================================
{
    const r = frapper(protege, "A", 20);
    verifier("20 dégâts sur l'allié : 10 pour lui, 10 pour l'Hoplite",
             r.etat.combattants.A.pv === 90 && r.etat.combattants.H.pv === 90,
             `${r.etat.combattants.A.pv} / ${r.etat.combattants.H.pv}`);
    verifier("le pion de l'Hoplite dit « Rempart »", r.etapes.some(x => x.type === "message" && x.cible === "H" && /Rempart/.test(x.texte)));

    const impair = frapper(protege, "A", 7);
    verifier("7 dégâts : 3 pour l'allié, 4 pour l'Hoplite (il prend la moitié du haut)",
             impair.etat.combattants.A.pv === 97 && impair.etat.combattants.H.pv === 96);

    const arme = clonerEtat(protege);
    arme.combattants.H.def.physique = 50;
    const r2 = frapper(arme, "A", 20);
    verifier("chacun avec SES défenses (armure 50 % de l'Hoplite : 5)", r2.etat.combattants.A.pv === 90 && r2.etat.combattants.H.pv === 95,
             `${r2.etat.combattants.A.pv} / ${r2.etat.combattants.H.pv}`);

    // (Une créature ne critique jamais : on fait frapper M comme un héros.)
    const critique = clonerEtat(protege);
    critique.combattants.M.estMonstre = false;
    const crit = frapper(critique, "A", 20, { critique: true });
    // L'Hoplite garde ses +5 % d'armure de classe : 20 × 0,95 = 19.
    verifier("un critique double chaque moitié (20 et 19 avec son armure)", crit.etat.combattants.A.pv === 80 && crit.etat.combattants.H.pv === 81,
             `${crit.etat.combattants.A.pv} / ${crit.etat.combattants.H.pv}`);

    const glace = frapper(protege, "A", 10, { alterations: [{ nom: "Glacé", chance: 100, duree: 2 }] });
    verifier("les états altérés ne restent que sur l'allié",
             glace.etat.combattants.A.etats.some(x => x.nom === "Glacé") && !glace.etat.combattants.H.etats.some(x => x.nom === "Glacé"));

    const loin = clonerEtat(protege);
    Object.assign(loin.combattants.A, { q: 4, r: 0 });
    const r3 = frapper(loin, "A", 20);
    verifier("éloignés : le Rempart dort (l'allié prend tout)", r3.etat.combattants.A.pv === 80 && r3.etat.combattants.H.pv === 100);
    const revenu = clonerEtat(loin);
    Object.assign(revenu.combattants.A, { q: 0, r: 1 });
    const r4 = frapper(revenu, "A", 20);
    verifier("rapprochés : il se réveille", r4.etat.combattants.A.pv === 90 && r4.etat.combattants.H.pv === 90);

    const tombe = clonerEtat(protege);
    Object.assign(tombe.combattants.H, { pv: 0, aTerre: true });
    verifier("Hoplite à terre : plus de partage", protecteurRempart(tombe, tombe.combattants.A) === null
             && frapper(tombe, "A", 20).etat.combattants.A.pv === 80);

    const tueur = frapper(protege, "A", 400);
    verifier("un coup énorme peut faire tomber les deux", tueur.etat.combattants.A.aTerre && tueur.etat.combattants.H.aTerre);

    // L'attaque d'opportunité : 8 bruts, 4 et 4.
    const opp = clonerEtat(protege);
    infligerOpportunite(opp, "A", "M", { attaquant: "M", cible: "A", evitee: false, montant: 8 }, { q: 1, r: 0 });
    verifier("attaque d'opportunité : 4 pour l'allié, 4 pour l'Hoplite",
             opp.combattants.A.pv === 96 && opp.combattants.H.pv === 96, `${opp.combattants.A.pv} / ${opp.combattants.H.pv}`);

    // Les tics de fin de manche, non.
    const tic = clonerEtat(protege);
    tic.combattants.A.etats.push({ nom: "Brûlé", duree: 2 });
    tic.file = [];
    ticsDeFinDeManche(tic);
    verifier("une brûlure (fin de manche) n'est pas partagée", tic.combattants.H.pv === 100 && tic.combattants.A.pv === 92,
             `${tic.combattants.A.pv} / ${tic.combattants.H.pv}`);

    const rejoue = appliquerEntree(protege, { etapes: r.etapes });
    verifier("rejoué depuis le journal : les deux PV", rejoue.combattants.A.pv === 90 && rejoue.combattants.H.pv === 90);

    const scene = misEnScene({ type: "techniqueClasse", acteur: "H", idCarte: "CLASSE_REMPART" }, protege);
    verifier("à l'écran : « 🛡️ Rempart » sur le pion de l'Hoplite", scene.geste === "message" && /Rempart/.test(scene.texte));
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
console.log("\n5. LA FICHE PERSO : LES TECHNIQUES DE CLASSE À PART");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
    const fiche = document.getElementById("fenetre-fiche-perso");
    fiche.style.display = "flex"; fiche.style.left = "2vw"; fiche.style.top = "20px";
    document.getElementById("champ-id-personnage").value = "H1";
    document.getElementById("titre-nom-personnage").textContent = "Léonidas";
    const bouton = [...document.querySelectorAll(".onglet-btn")].find(x => x.textContent.trim() === "Compétences");
    if (bouton) bouton.click();
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Léonidas", classe: "Hoplite", xp: 2500, couleur: "#335",
                              deckEquipe: ["C1"], PV_Max: 50 }];
    window.PERSOS_JOUEURS_PARTIE = window.PERSOS_PARTIE;
    window.CACHE_COMPETENCES_GLOBAL = { H1: { C1: { Nom: "Coup de lance", Arme: "Arme lourde CAC", Initiative: 40 } } };
    await window.chargerOngletCompetences("H1", 6);
    await new Promise(r => setTimeout(r, 200));
    const lire = () => ({
      section: !!document.getElementById("section-techniques-classe"),
      techniques: [...document.querySelectorAll(".technique-classe")].map(x => ({ id: x.dataset.technique,
          verrouillee: x.classList.contains("technique-classe-verrouillee"), badge: x.dataset.statut,
          cadre: document.getElementById("cadre-carte-" + x.dataset.technique)?.style.backgroundImage || "",
          banniere: x.classList.contains("banniere-carte") })),
      cadreJoueur: document.getElementById("cadre-carte-C1")?.style.backgroundImage || "",
      memorisees: document.getElementById("compteur-cartes-actuel")?.textContent,
      apresLeGrimoire: (() => { const s = document.getElementById("section-techniques-classe"); const ban = document.getElementById("ui-carte-C1");
                                 return !!s && !!ban && (ban.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) > 0; })()
    });
    const niv5 = lire();
    // Le premier clic d'une technique forgée met en avant et ouvre la carte ;
    // sur une technique de classe, deux clics ne la mémorisent jamais.
    const calque = document.querySelector('#ui-carte-CLASSE_MUR_BOUCLIER [onclick]');
    calque.click(); calque.click();
    niv5.apercu = document.getElementById("apercu-carte-hd-competence")?.dataset.cardId || null;
    niv5.deckApres = [...window.CARTES_SELECTIONNEES];
    const sec = document.getElementById("section-techniques-classe");
    if (sec) sec.scrollIntoView();
    return niv5;
  });
  await p.screenshot({ path: "/tmp/claude-0/hoplite_fiche.png" });
  verifier("une section « Techniques de classe », après le grimoire", r.section && r.apresLeGrimoire, JSON.stringify(r));
  verifier("niveau 5 : Mur de bouclier acquis, Rempart verrouillé (niveau 10)",
           JSON.stringify(r.techniques.map(t => [t.id, t.verrouillee])) === '[["CLASSE_MUR_BOUCLIER",false],["CLASSE_REMPART",true]]'
           && /Niveau 10 requis/.test(r.techniques[1].badge), JSON.stringify(r.techniques));
  verifier("elles ne comptent pas dans les mémorisées (1 / 6)", r.memorisees === "1", r.memorisees);
  verifier("mêmes bannières que les techniques forgées (même cadre)",
           r.techniques.every(t => t.banniere) && /ban_cible/.test(r.cadreJoueur) && /bandeau_carte_normal/.test(r.techniques[0].cadre), r.techniques[0].cadre);
  verifier("la verrouillée prend le cadre épuisé", /ban_epuis/.test(r.techniques[1].cadre), r.techniques[1].cadre);
  verifier("un clic ouvre la carte en grand, sans la mémoriser",
           r.apercu === "CLASSE_MUR_BOUCLIER" && JSON.stringify(r.deckApres) === '["C1"]', JSON.stringify([r.apercu, r.deckApres]));
  const necro = await p.evaluate(async () => {
    window.PERSOS_PARTIE[0].classe = "Oracle";
    await window.chargerOngletCompetences("H1", 7);
    return !!document.getElementById("section-techniques-classe");
  });
  verifier("une classe sans technique : pas de section", necro === false);
}

// =========================================================================
console.log("\n6. EN COMBAT : LES BANNIÈRES, LE CHOIX, LE LANCEMENT");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    document.getElementById("fenetre-fiche-perso").style.display = "none";
    document.getElementById("fenetre-combat").style.display = "block";
    window.PERSOS_PARTIE = [
      { idPersonnage: "H1", prenom: "Léonidas", classe: "Hoplite", xp: 7900, couleur: "#335", camp: "Allié",
        deckEquipe: ["C1"], PV_Max: 50, PV_Actuels: 50, Fatigue_Max: 100, fatigueActuelle: 100, techniquesUtilisees: ["CLASSE_MUR_BOUCLIER"] },
      { idPersonnage: "A1", prenom: "Cybile", camp: "Allié", PV_Max: 40, PV_Actuels: 40 },
      { idPersonnage: "A2", prenom: "Jade", camp: "Allié", PV_Max: 40, PV_Actuels: 40 },
      { idPersonnage: "M1", prenom: "Gnoll", camp: "Ennemi", estMonstre: true, PV_Max: 40, PV_Actuels: 40 }
    ];
    window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, A1: { q: 1, r: 0 }, A2: { q: 4, r: 0 }, M1: { q: 0, r: 1 } };
    window.CACHE_COMPETENCES_GLOBAL = { H1: { C1: { Nom: "Coup de lance", Arme: "", Initiative: 40, Fatigue: 10, Effets_Compiles: [] } } };
    window.COMPETENCES_CACHE = {};
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]]; window.COMBAT_INDEX_PERSO = 0;
    window.COMBAT_FATIGUE_ACTUELLE = 100;
    window.PARTIE_DATA = { Phase_Combat: "Preparation", File_Attente_Combat: [] };
    window.ID_PARTIE_COURANTE = "P";
    try { window.chargerCompetencesCombat("H1", "#335"); } catch (e) { return { erreur: e.message }; }
    await new Promise(r => setTimeout(r, 100));
    const ban = (id) => document.getElementById("combat-carte-" + id);
    const bannieres = ["C1", "CLASSE_MUR_BOUCLIER", "CLASSE_REMPART", "REPOS_LONG"].map(id => !!ban(id));
    const murGrise = ban("CLASSE_MUR_BOUCLIER").classList.contains("banniere-epuisee");
    const rempartLibre = !ban("CLASSE_REMPART").classList.contains("banniere-epuisee");
    const ordre = [...document.querySelectorAll("#combat-liste-competences .banniere-carte-combat")].map(x => x.dataset.cardId);
    // Le Rempart est joué PENDANT que le volet est ouvert : la fiche le dit,
    // le rafraîchissement doit le griser sans redessiner le volet.
    window.PERSOS_PARTIE[0].techniquesUtilisees = ["CLASSE_MUR_BOUCLIER", "CLASSE_REMPART"];
    window.actualiserBannieresEpuisees();
    const rempartGriseApres = ban("CLASSE_REMPART").classList.contains("banniere-epuisee");
    window.PERSOS_PARTIE[0].techniquesUtilisees = ["CLASSE_MUR_BOUCLIER"];
    window.actualiserBannieresEpuisees();
    const rempartRendu = !ban("CLASSE_REMPART").classList.contains("banniere-epuisee");
    const look = (id) => { const b = ban(id); const nom = b.querySelector(".texte-nom-banniere");
        return { cadre: document.getElementById("cadre-combat-" + id).style.backgroundImage, couleur: nom.style.color, nom: nom.textContent }; };
    const lookJoueur = look("C1"), lookRempart = look("CLASSE_REMPART");

    const alertes = []; window.alert = (m) => alertes.push(m);
    let ecrit = null;
    window.modifierPartieOuEchec = async (f) => { const r = f({ Phase_Combat: "Preparation", File_Attente_Combat: [] }); ecrit = r && r.maj; return { ok: true }; };
    window.avecCarteJouee = (d, id) => [id]; window.toutLeMondeAJoue = () => false;
    await window.jouerCarteCombat("CLASSE_MUR_BOUCLIER");
    const refusMur = alertes.slice();
    await window.jouerCarteCombat("CLASSE_REMPART");
    const file = ecrit && ecrit.File_Attente_Combat;

    // Son tour venu : le Rempart demande l'allié adjacent.
    const demandes = [];
    window.regimeDemande = { actif: () => true, enVol: () => false,
                             techniqueClasse: (a, id, cible) => { demandes.push([a, id, cible || null]); } };
    window.lancerTechniqueClasse("CLASSE_REMPART", "H1");
    const fen = document.getElementById("fenetre-choix-rempart");
    const proposes = [...fen.querySelectorAll(".choix-rempart-allie span")].map(x => x.textContent);
    const visible = getComputedStyle(fen).display !== "none";
    fen.querySelector(".choix-rempart-allie").click();
    window.lancerTechniqueClasse("CLASSE_MUR_BOUCLIER", "H1");
    return { rempartGriseApres, rempartRendu, lookJoueur, lookRempart, bannieres, murGrise, rempartLibre, ordre, refusMur, file, proposes, visible, demandes,
             donnees: window.donneesCarteCombattant("H1", "CLASSE_REMPART").Nom };
  });
  verifier("le volet montre le deck, puis les deux techniques, puis le repos long",
           !r.erreur && JSON.stringify(r.ordre) === '["C1","CLASSE_MUR_BOUCLIER","CLASSE_REMPART","REPOS_LONG"]', JSON.stringify(r.ordre || r.erreur));
  verifier("Mur de bouclier déjà joué : grisé ; Rempart : libre", r.murGrise && r.rempartLibre);
  verifier("joué pendant que le volet est ouvert : grisé au rafraîchissement", r.rempartGriseApres && r.rempartRendu);
  verifier("en combat, même bannière que les techniques du joueur (cadre, couleur, nom nu)",
           r.lookRempart && r.lookRempart.cadre === r.lookJoueur.cadre && r.lookRempart.couleur === r.lookJoueur.couleur
           && r.lookRempart.nom === "Rempart", JSON.stringify([r.lookJoueur, r.lookRempart]));
  verifier("choisir le Mur déjà joué : refusé, avec un message", r.refusMur.length === 1 && /déjà servi/.test(r.refusMur[0]), JSON.stringify(r.refusMur));
  verifier("choisir le Rempart : inscrit dans la file à l'initiative 105",
           Array.isArray(r.file) && r.file.length === 1 && r.file[0].idCarte === "CLASSE_REMPART" && r.file[0].initiative === 105,
           JSON.stringify(r.file));
  verifier("son tour venu : seuls les alliés adjacents sont proposés", r.visible && JSON.stringify(r.proposes) === '["Cybile"]',
           JSON.stringify(r.proposes));
  verifier("le clic envoie le Rempart sur cet allié ; le Mur part sur soi",
           JSON.stringify(r.demandes) === '[["H1","CLASSE_REMPART","A1"],["H1","CLASSE_MUR_BOUCLIER",null]]', JSON.stringify(r.demandes));
  verifier("les autres postes savent nommer la technique", r.donnees === "Rempart");
}

// =========================================================================
console.log("\n7. LA FICHE DE CLASSE : LE DESCRIPTIF DE L'HOPLITE");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    document.getElementById("fenetre-combat").style.display = "none";
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    await window.ouvrirChoixClasse();
    window.ouvrirFicheClasse("CLASSE_HOPLITE");
    const d = document.getElementById("descriptif-fiche-classe");
    return { visible: getComputedStyle(d).display !== "none",
             niveaux: [...d.querySelectorAll(".palier-classe-niveau")].map(x => x.textContent.trim()), texte: d.textContent };
  });
  await p.screenshot({ path: "/tmp/claude-0/hoplite_classe.png" });
  verifier("présentation et paliers Niv. 1 / 5 / 10", r.visible && JSON.stringify(r.niveaux) === '["Niv. 1","Niv. 5","Niv. 10"]');
  verifier("Mur de bouclier et Rempart y sont dits", /Mur de bouclier/.test(r.texte) && /Rempart/.test(r.texte) && /\+5 % de parade/.test(r.texte));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
