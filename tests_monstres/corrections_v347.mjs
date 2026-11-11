// v347 — LA REFONTE DES CLASSES : LE PROTECTEUR.
// Nico : « niveau 1 : +8 % Parade, 10 % de chance de provoquer sur toutes ses attaques ;
// niveau 3 : Rempart ; niveau 5 : 10 % de chance de provoquer, et les boucliers lourds ne
// génèrent plus de malus ; niveau 9 : Résonance du bouclier (80 % de chance d'étourdir tous
// les ennemis adjacents, 15 % de dégâts physiques égaux aux PV max du joueur, init 50) ;
// Rempart : divise l'attaque en deux attaques à dégâts divisés par deux, chacun la reçoit
// comme une attaque indépendante, 4 tours, init 105, RÉSERVE 15 SUR 4 TOURS » — « une
// nouvelle mécanique commune : tant qu'elle est maintenue, la technique bloque et consomme
// tant de fatigue par tour ». Ses réponses : bloqués puis consommés ; à court, elle
// s'arrête ; un bouton pour la relâcher ; séparés, elle se paie quand même ; des jets pour
// chacun ; 20 % au niveau 5 ; l'Étourdi 2 manches, les résistances comptent.
// Les valeurs de la classe (paliers, Résonance) : hoplite.mjs.
//
// Lancer : node tests_monstres/corrections_v347.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat, creerDes } from '../combat_etat.js';
import { resoudreCarte, tirerDesCarte, paradeDe, esquiveDe, protecteurRempart, reserveMaintenueDe, RESERVES_TECHNIQUES } from '../moteur_pur.js';
import { validerIntention, appliquerIntention, vieillirLesEtats, ticsDeFinDeManche, cloturerTour, ouvrirManche, reservesDeFinDeManche } from '../cerveau_combat.js';
import { infligerOpportunite, resoudreOpportunite, planifierTrajet } from '../mouvement_pur.js';
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
const XP = { 1: 0, 2: 700, 3: 1200, 4: 1800, 5: 2500, 8: 5200, 9: 6400, 10: 7900 };

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

const lancerRempart = (e) => appliquerIntention(enTete(e, "H", "CLASSE_REMPART"), intention("CLASSE_REMPART", "A"));
const maintien = (c) => (c.etats || []).find(x => x && x.maintien === "CLASSE_REMPART");
const rempartSur = (c) => (c.etats || []).find(x => x && x.nom === "Rempart");
// Une fin de manche complète (la file vide) : réserve, régénération, tics, vieillissement.
const finDeManche = (e) => { const s = clonerEtat(e); s.file = [{ id: "M", carte: "X", initiative: 1, pas: 0 }];
    const clot = cloturerTour(s, creerDes(s.graine)); return { etat: s, etapes: clot.etapes }; };

console.log("\n1. LA RÉSERVE MAINTENUE (v361 : BLOQUÉE TANT QUE LA TECHNIQUE DURE, JAMAIS DÉPENSÉE)");
// (v361, Nico : « les points en réserve ne sont pas vraiment dépensés, ils sont juste
// inutilisables tant que la technique est active ».)
{
    verifier("le Rempart a sa réserve dans le moteur : 15, 4 manches, aucun prix",
             RESERVES_TECHNIQUES.CLASSE_REMPART.parTour === 15 && RESERVES_TECHNIQUES.CLASSE_REMPART.tours === 4 && !RESERVES_TECHNIQUES.CLASSE_REMPART.coutLancement);
    const e = monde(3);
    e.combattants.H.stats = { ...(e.combattants.H.stats || {}), Regeneration: 0 };   // (sans regain, pour lire la réserve seule)
    const pas = lancerRempart(e);
    const h = pas.etat.combattants.H, m = maintien(h);
    verifier("niveau 3 : lancé, rien n'est dépensé (100)", h.fatigue === 100, String(h.fatigue));
    verifier("le Protecteur tient « Rempart maintenu » : 15, 4 manches, lié au Rempart de l'allié",
             !!m && m.reserve === 15 && m.duree === 4 && !m.differee && m.liens[0].cible === "A", JSON.stringify(m));
    verifier("l'allié porte le Rempart, 4 manches", rempartSur(pas.etat.combattants.A).duree === 4);
    verifier("dès le lancement : 15 bloqués", reserveMaintenueDe(h) === 15);
    verifier("rejoué depuis le journal : même énergie, mêmes états", (() => { const r = appliquerEntree(enTete(e, "H", "CLASSE_REMPART"), pas.entree).combattants.H;
             return r.fatigue === 100 && JSON.stringify(r.etats) === JSON.stringify(h.etats); })());
    const f1 = finDeManche(pas.etat);
    verifier("fin de manche : rien de pris (100), toujours 15 bloqués, 3 manches",
             f1.etat.combattants.H.fatigue === 100 && reserveMaintenueDe(f1.etat.combattants.H) === 15 && maintien(f1.etat.combattants.H).duree === 3
             && !f1.etapes.some(x => x.type === "fatigue" && x.cible === "H"), `${f1.etat.combattants.H.fatigue} ${JSON.stringify(maintien(f1.etat.combattants.H))}`);
    const avecCarte = (cout) => { const s = clonerEtat(f1.etat); s.phase = "Resolution"; s.file = [{ id: "H", carte: "C", initiative: 50, pas: 0 }];
        return validerIntention(s, { id: "c", type: "carte", acteur: "H", idCarte: "C", coutFatigue: cout, attaques: [] }); };
    verifier("une carte à 85 passe, une à 86 est refusée (100 − 15 bloqués)", avecCarte(85).ok && !avecCarte(86).ok, avecCarte(86).raison);
    const marche = (() => { const s = clonerEtat(f1.etat); s.combattants.H.fatigue = 20;
        return planifierTrajet(s, "H", [{ q: -1, r: 0 }, { q: -2, r: 0 }, { q: -3, r: 0 }, { q: -4, r: 0 }, { q: -5, r: 0 }, { q: -6, r: 0 }], null, {}); })();
    verifier("à 20 d'énergie, 15 bloqués : il ne marche qu'avec 5", marche.cout <= 5 && marche.tronque, JSON.stringify({ cout: marche.cout, pas: marche.pas.length }));
    const f2 = finDeManche(f1.etat), f3 = finDeManche(f2.etat), f4 = finDeManche(f3.etat);
    verifier("les 4 manches passent : 100 tout du long", [f2, f3, f4].every(f => f.etat.combattants.H.fatigue === 100));
    verifier("au bout des 4 manches : plus de maintien, plus de Rempart, la réserve revient", !maintien(f4.etat.combattants.H) && !rempartSur(f4.etat.combattants.A)
             && reserveMaintenueDe(f4.etat.combattants.H) === 0);
    verifier("l'état reste cohérent tout du long", [pas.etat, f1.etat, f2.etat, f4.etat].every(x => verifierEtatCombat(x).length === 0));
    // Son énergie bue sous la réserve (par un ennemi) : la technique tombe en fin de manche.
    const bu = clonerEtat(f1.etat); bu.combattants.H.fatigue = 10;
    const fr = finDeManche(bu);
    verifier("énergie tombée à 10 (sous les 15 bloqués) : le Rempart tombe, rien n'est pris",
             !maintien(fr.etat.combattants.H) && !rempartSur(fr.etat.combattants.A) && fr.etat.combattants.H.fatigue === 10
             && fr.etapes.some(x => x.type === "message" && /à court/.test(x.texte)), `${fr.etat.combattants.H.fatigue}`);
    const pile = clonerEtat(f1.etat); pile.combattants.H.fatigue = 15;
    verifier("à 15 pile : il tient (rien n'est pris)", (() => { const r = finDeManche(pile).etat; return r.combattants.H.fatigue === 15 && !!maintien(r.combattants.H); })());
    const ko = clonerEtat(f1.etat); ko.combattants.H.aTerre = true; ko.combattants.H.pv = 0;
    verifier("le Protecteur à terre : la technique tombe", (() => { const r = finDeManche(ko).etat; return !maintien(r.combattants.H) && !rempartSur(r.combattants.A); })());
    const pauvre = monde(3); pauvre.combattants.H.fatigue = 14;
    const ref = validerIntention(enTete(pauvre, "H", "CLASSE_REMPART"), intention("CLASSE_REMPART", "A"));
    verifier("14 d'énergie au lancement : refusé (pas gâché)", !ref.ok && /réserve/.test(ref.raison), ref.raison);
}

console.log("\n2. « RELÂCHER », CHOISI EN PRÉPARATION");
{
    const e = monde(3);
    const lance = lancerRempart(e).etat;
    const f1 = finDeManche(lance).etat;
    const file = [{ idPersonnage: "H", idCarte: "C", initiative: 50, relacher: ["CLASSE_REMPART"] }, { idPersonnage: "M", idCarte: "X", initiative: 10 }];
    const pas = ouvrirManche(f1, file, creerDes(f1.graine));
    verifier("à l'ouverture : le maintien et le Rempart de l'allié tombent", !maintien(pas.etat.combattants.H) && !rempartSur(pas.etat.combattants.A));
    verifier("plus rien de bloqué, et rien n'est pris en fin de manche", reserveMaintenueDe(pas.etat.combattants.H) === 0
             && finDeManche(pas.etat).etat.combattants.H.fatigue === pas.etat.combattants.H.fatigue + 0
                || finDeManche(pas.etat).etapes.every(x => !(x.type === "fatigue" && x.tic === "Rempart maintenu")));
    verifier("« Relâché » dit sur son pion ; rejoué depuis le journal : pareil",
             pas.entree.etapes.some(x => x.type === "message" && x.texte === "Relâché")
             && !maintien(appliquerEntree(f1, pas.entree).combattants.H));
    const sans = ouvrirManche(f1, file.map(f => ({ ...f, relacher: undefined })), creerDes(f1.graine));
    verifier("sans « Relâcher », il tient", !!maintien(sans.etat.combattants.H) && !!rempartSur(sans.etat.combattants.A));
}

console.log("\n3. LE REMPART : DEUX ATTAQUES INDÉPENDANTES, CHACUN SES JETS");
{
    const base = lancerRempart(monde(3)).etat;
    base.combattants.H.def.esquive = 30; base.combattants.H.def.parade = 50;   // (parade > esquive : « paré »)
    const carte = { type: "carte", idLanceur: "M", idCarte: "C", coutFatigue: 0,
                    attaques: [{ nom: "Coup", valeurBrute: 20, typeRes: "Physique", cibles: ["A"] }], alterations: [] };
    let protecteurEvite = 0, cibleEvite = 0, lesDeux = 0, n = 0;
    const pourcent = [];
    for (let g = 1; g <= 300; g++) {
        const s = clonerEtat(base); s.graine = g; s.combattants.A.def.esquive = 40;
        const jets = tirerDesCarte(s, carte, "M", false, creerDes(g));
        const j = jets.parCible.A;
        if (!j.rempart) continue;
        n++;
        if (j.rempart.esquive) protecteurEvite++;
        if (j.esquive) cibleEvite++;
        if (j.esquive && j.rempart.esquive) lesDeux++;
    }
    verifier("le Protecteur a son propre jet (sa meilleure défense : parade 50)", n === 300 && Math.abs(protecteurEvite / n - 0.5) < 0.08, `${protecteurEvite}/${n}`);
    verifier("…indépendant de celui de la cible (esquive 40)", Math.abs(cibleEvite / n - 0.4) < 0.08 && Math.abs(lesDeux / n - 0.2) < 0.07,
             `${cibleEvite} ${lesDeux}`);
    const jouer = (esqA, esqH) => resoudreCarte(clonerEtat(base), { ...carte, critique: false,
        jets: { attaqueRatee: false, parCible: { A: { esquive: esqA, etats: {}, rempart: { id: "H", esquive: esqH, parade: esqH } } } } });
    const tous = jouer(false, false);
    verifier("tous deux touchés : 10 et 10", tous.etat.combattants.A.pv === 90 && tous.etat.combattants.H.pv === 90);
    const pare = jouer(false, true);
    verifier("le Protecteur pare sa moitié : 10 pour l'allié, rien pour lui (« paré » dit)", pare.etat.combattants.A.pv === 90 && pare.etat.combattants.H.pv === 100
             && pare.etapes.some(x => x.type === "esquive" && x.cible === "H" && x.parade && x.rempart));
    const esquive = jouer(true, false);
    verifier("l'allié esquive la sienne : le Protecteur prend quand même sa moitié (10)", esquive.etat.combattants.A.pv === 100 && esquive.etat.combattants.H.pv === 90
             && esquive.etapes.some(x => x.type === "esquive" && x.cible === "A"));
    const rien = jouer(true, true);
    verifier("tous deux évitent : personne ne prend rien", rien.etat.combattants.A.pv === 100 && rien.etat.combattants.H.pv === 100);
    verifier("rejoué depuis le journal : mêmes PV", appliquerEntree(base, { etapes: esquive.etapes }).combattants.H.pv === 90);
    // Par le cerveau, de bout en bout (une carte de l'ennemi sur l'allié).
    const s = clonerEtat(base); s.file = [{ id: "M", carte: "C", initiative: 50, pas: 0 }];
    const pasC = appliquerIntention(s, { id: "x", type: "carte", acteur: "M", idCarte: "C", coutFatigue: 0,
                                         attaques: carte.attaques, alterations: [] });
    verifier("par le cerveau : la carte part, le partage a lieu", !!pasC && pasC.etat.combattants.A.pv + pasC.etat.combattants.H.pv >= 180
             && pasC.entree.etapes.some(x => x.type === "message" && /Rempart/.test(x.texte)));
}

console.log("\n4. L'ATTAQUE D'OPPORTUNITÉ, ELLE AUSSI EN DEUX");
{
    const base = lancerRempart(monde(3)).etat;
    base.combattants.H.def.parade = 50; base.combattants.A.def.esquive = 40;
    let n = 0, pEvite = 0, cEvite = 0, partHseule = 0;
    for (let g = 1; g <= 300; g++) {
        const s = clonerEtat(base);
        const coup = resoudreOpportunite(s, "M", "A", creerDes(g));
        if (!coup || !coup.rempart) continue;
        n++;
        const cibleEvitee = coup.evitee || coup.cibleEvitee;
        if (cibleEvitee) cEvite++;
        if (coup.rempart.evitee) pEvite++;
        if (!coup.evitee) {
            const et = infligerOpportunite(s, "A", "M", coup, { q: 1, r: 0 });
            if (coup.cibleEvitee && !coup.rempart.evitee && s.combattants.A.pv === 100 && s.combattants.H.pv < 100) partHseule++;
        }
    }
    verifier("chacun son jet (cible 40 %, Protecteur 50 %)", n === 300 && Math.abs(cEvite / n - 0.4) < 0.08 && Math.abs(pEvite / n - 0.5) < 0.08,
             `${cEvite} ${pEvite} / ${n}`);
    verifier("l'allié évite, pas le Protecteur : lui seul prend sa moitié", partHseule > 20, String(partHseule));
}


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
// (V347_CAPTURES=dossier : une capture du volet en préparation.)
if (process.env.V347_CAPTURES) await p.exposeFunction("__capture", async (nom) => { await p.screenshot({ path: `${process.env.V347_CAPTURES}/${nom}.png` }); });

console.log("\n5. EN PRÉPARATION : LA RÉSERVE BLOQUÉE, « RELÂCHER » DANS LE VOLET ET DANS LA FILE");
{
  const r = await p.evaluate(async () => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
    document.getElementById("fenetre-combat").style.display = "block";
    const maintenu = { nom: "Rempart maintenu", maintien: "CLASSE_REMPART", reserve: 15, duree: 3, dejaPaye: false, liens: [{ cible: "A1", nom: "Rempart" }], desc: "…" };
    window.PERSOS_PARTIE = [
      { idPersonnage: "H1", prenom: "Léonidas", classe: "Protecteur", xp: 1200, couleur: "#335", camp: "Allié",
        deckEquipe: ["C1"], PV_Max: 50, PV_Actuels: 50, Fatigue_Max: 100, fatigueActuelle: 40, Etats_Alteres: [maintenu], techniquesUtilisees: ["CLASSE_REMPART"] },
      { idPersonnage: "A1", prenom: "Cybile", camp: "Allié", PV_Max: 40, PV_Actuels: 40 }
    ];
    window.CACHE_COMPETENCES_GLOBAL = { H1: { C1: { Nom: "Coup de lance", Arme: "", Initiative: 40, Fatigue: 30, Effets_Compiles: [] } } };
    window.COMPETENCES_CACHE = {};
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]]; window.COMBAT_INDEX_PERSO = 0;
    window.COMBAT_FATIGUE_ACTUELLE = 40;
    window.PARTIE_DATA = { Phase_Combat: "Preparation", File_Attente_Combat: [] };
    window.ID_PARTIE_COURANTE = "P";
    window.RELACHES_EN_ATTENTE = {};
    const h = window.PERSOS_PARTIE[0];
    window.chargerCompetencesCombat("H1", "#335");
    await new Promise(r => setTimeout(r, 80));
    const encart = () => document.querySelector("#combat-liste-competences .encart-maintien");
    if (typeof window.toggleVoletCompetences === "function") window.toggleVoletCompetences(true);
    const avant = { bloque: window.reserveMaintenueBloquee(h), dispo: window.fatiguePourChoisir(h),
                    encart: !!encart(), texte: encart() && encart().textContent.replace(/\s+/g, " ").trim(),
                    epuisee: document.getElementById("combat-carte-C1").classList.contains("banniere-epuisee") };
    await new Promise(r => setTimeout(r, 400));
    if (window.__capture) await window.__capture("v347_volet");
    let ecrit = null;
    window.modifierPartieOuEchec = async (f) => { const res = f({ Phase_Combat: "Preparation", File_Attente_Combat: window.PARTIE_DATA.File_Attente_Combat }); ecrit = res && res.maj; return { ok: true }; };
    window.avecCarteJouee = (d, id) => [id]; window.toutLeMondeAJoue = () => false;
    encart().querySelector(".maintien-relacher").click();
    await new Promise(r => setTimeout(r, 80));
    const apres = { bloque: window.reserveMaintenueBloquee(h), dispo: window.fatiguePourChoisir(h),
                    texte: encart() && encart().textContent.replace(/\s+/g, " ").trim(), relache: encart().classList.contains("relache"),
                    epuisee: document.getElementById("combat-carte-C1").classList.contains("banniere-epuisee") };
    await window.jouerCarteCombat("C1");
    const entree = ecrit && (ecrit.File_Attente_Combat || []).find(i => i.idPersonnage === "H1");
    // La carte déjà dans la file : « Le garder » met l'entrée à jour.
    window.PARTIE_DATA.File_Attente_Combat = ecrit.File_Attente_Combat;
    ecrit = null;
    encart().querySelector(".maintien-relacher").click();
    await new Promise(r => setTimeout(r, 80));
    const garde = ecrit && (ecrit.File_Attente_Combat || []).find(i => i.idPersonnage === "H1");
    // Hors préparation : plus de bouton, la réserve compte de nouveau.
    window.PARTIE_DATA.Phase_Combat = "Resolution";
    window.RELACHES_EN_ATTENTE = { H1: ["CLASSE_REMPART"] };
    window.chargerCompetencesCombat("H1", "#335");
    const resolution = { bouton: !!document.querySelector(".maintien-relacher"), bloque: window.reserveMaintenueBloquee(h) };
    return { avant, apres, entree, garde, resolution };
  });
  verifier("15 bloqués : 40 d'énergie, 25 pour choisir", r.avant.bloque === 15 && r.avant.dispo === 25, JSON.stringify(r.avant));
  verifier("le volet dit « Rempart maintenu · ⚡ 15 bloqués (pas dépensés) » et propose « Relâcher »",
           r.avant.encart && /Rempart maintenu/.test(r.avant.texte) && /15 bloqués \(pas dépensés\)/.test(r.avant.texte) && /Relâcher/.test(r.avant.texte), r.avant.texte);
  verifier("la carte à 30 est grisée (30 > 25)", r.avant.epuisee === true);
  verifier("« Relâcher » : plus rien de bloqué, la carte redevient abordable", r.apres.bloque === 0 && r.apres.dispo === 40 && r.apres.relache && r.apres.epuisee === false
           && /relâché à la prochaine manche/.test(r.apres.texte) && /Le garder/.test(r.apres.texte), JSON.stringify(r.apres));
  verifier("la carte part dans la file avec « relacher »", r.entree && JSON.stringify(r.entree.relacher) === '["CLASSE_REMPART"]', JSON.stringify(r.entree));
  verifier("« Le garder » après coup : l'entrée de la file le suit", r.garde && !("relacher" in r.garde), JSON.stringify(r.garde));
  verifier("hors préparation : pas de bouton, la réserve compte", !r.resolution.bouton && r.resolution.bloque === 15, JSON.stringify(r.resolution));
}

console.log("\n6. NIVEAU 5 : LES BOUCLIERS LOURDS SANS MALUS");
{
  const r = await p.evaluate(() => {
    const scutum = { nom: "Scutum", modele: "Bouclier lourd", type: "Bouclier", uid: "S", bonus: { parade: 28, coutDeplacement: 1 } };
    const autre = { nom: "Autre", modele: "Bouclier léger", type: "Bouclier", uid: "P", bonus: { parade: 20, coutDeplacement: 1 } };
    const XP = { 4: 1800, 5: 2500 };
    const avec = (niveau, objet, classe = "Hoplite") => window.bonusEquipement({ idPersonnage: "Z", classe, xp: XP[niveau], equipMainGauche: objet });
    return { n4: avec(4, scutum), n5: avec(5, scutum), oracle: avec(5, scutum, "Oracle"), autre: avec(5, autre),
             bonusEquip: window.bonusEquip({ idPersonnage: "Z", classe: "Protecteur", xp: 2500, equipMainGauche: scutum }, "coutDeplacement") };
  });
  verifier("niveau 4 : le Scutum coûte +1 par case", r.n4.coutDeplacement === 1 && r.n4.parade === 28);
  verifier("niveau 5 : plus rien (la parade reste), le combat le lit aussi (bonusEquip)", r.n5.coutDeplacement === 0 && r.n5.parade === 28 && r.bonusEquip === 0);
  verifier("une autre classe au niveau 5 : le malus reste", r.oracle.coutDeplacement === 1);
  verifier("seulement les boucliers lourds (un autre objet garde le sien)", r.autre.coutDeplacement === 1);
}

console.log("\n7. LA FICHE DE CLASSE ET LES CARTES");
{
  const r = await p.evaluate(() => ({ rempart: window.carteTechniqueClasse("CLASSE_REMPART"), resonance: window.TECHNIQUES_CLASSE.CLASSE_RESONANCE_BOUCLIER,
                                      paliers: window.DESCRIPTIFS_CLASSES ? null : null }));
  verifier("le Rempart dit sa réserve et ses deux attaques indépendantes", /Réserve : 15 d'énergie bloqués \(pas dépensés\)/.test(r.rempart.Effets_Compiles[0].desc)
           && /attaques indépendantes/.test(r.rempart.Effets_Compiles[0].desc) && r.rempart.Fatigue === 15);
  verifier("la Résonance dit 80 % et 15 % des PV max du Protecteur", /80 %/.test(r.resonance.desc) && /15 % des PV max du Protecteur/.test(r.resonance.desc));
}

verifier("version 347 ou plus ; les fichiers touchés ont monté (carte des imports comprise)",
  (() => { const v = (re, txt) => Number((re.exec(txt) || [])[1]);
           const h = fs.readFileSync(RACINE + "/index.html", "utf-8");
           return v(/VERSION_IVALIS = (\d+);/, fs.readFileSync(RACINE + "/trace_combat.js", "utf-8")) >= 347
             && JSON.parse(fs.readFileSync(RACINE + "/version.json", "utf-8")).version >= 347
             && v(/"\.\/moteur_pur\.js\?v=(\d+)"/, h) >= 70 && v(/src="moteur_pur\.js\?v=(\d+)"/, h) === v(/"\.\/moteur_pur\.js\?v=(\d+)"/, h)
             && v(/src="cerveau_combat\.js\?v=(\d+)"/, h) >= 63 && v(/src="mouvement_pur\.js\?v=(\d+)"/, h) >= 24
             && v(/src="combat\.js\?v=(\d+)"/, h) >= 161 && v(/src="app\.js\?v=(\d+)"/, h) >= 147
             && v(/src="objets\.js\?v=(\d+)"/, h) >= 21 && v(/src="classes\.js\?v=(\d+)"/, h) >= 30; })());
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
