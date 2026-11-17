// v416 — LE PUGILISTE VARGEN FAIT SAIGNER.
//
// Nico : « Pour la race Vargen > le boost qui leur boost l'empoisonnement,
// mettre plutôt le même boost pour le saignement. »
//
// Le talent Pugiliste (talents.js) donnait au Vargen sans arme +15 % de chance
// d'empoisonner (chancePoisonPhysique). C'est désormais +15 % de chance de
// faire SAIGNER (chanceSaignementPhysique), lu par appliquerEquipementALaCarte
// (moteur_effets.js) ; le +6 % de critique ne bouge pas.
//
// Sur la VRAIE page : le texte du talent, ce que donne atoutRace (Vargen sans
// arme, Vargen armé, non-Vargen), ce que la carte emporte. Puis dans Node : le
// Saignement emporté par la carte prend bien sur la cible (resoudreCarte),
// avec sa durée habituelle.
// Lancer : node tests_monstres/corrections_v416_vargen.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { pathToFileURL } from 'url';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const titre = (t) => console.log("\n" + t);
const section = async (corps) => { try { await corps(); } catch (e) { verifier("la section a pu tourner", false, String(e && e.message || e).slice(0, 160)); } };
const lire = (f) => { try { return fs.readFileSync(path.join(RACINE, f), 'utf-8'); } catch (e) { return ""; } };

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' }); res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const FAUX_APP = `export const initializeApp = () => ({}); export const getApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({}); export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  export const getDoc = async () => ({ exists: () => false, data: () => ({}) });
  export const getDocs = async () => ({ forEach: () => {}, docs: [], empty: true, size: 0 });
  export const setDoc = async () => {}; export const updateDoc = async () => {}; export const deleteDoc = async () => {};
  export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a}); export const where = (...a) => ({a});
  export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
  export const writeBatch = () => ({ update(){}, set(){}, delete(){}, commit: async()=>{} });
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
p.on('dialog', d => d.accept());
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' }));
await p.goto(base + '/index.html');
await p.waitForFunction(() => typeof window.appliquerEquipementALaCarte === "function" && typeof window.atoutRace === "function"
                              && typeof window.talentParId === "function", null, { timeout: 15000 });

// Les héros du banc, côté page : un Vargen Pugiliste, mains nues.
await p.evaluate(() => {
  window.__heros = (extra) => ({ idPersonnage: "P1", prenom: "Grak", race: "Vargen", classe: "", xp: 6400, camp: "Allié", Etats_Alteres: [],
    caracs: { force: 14, dex: 14, con: 12, int: 10, sag: 10, cha: 10 }, talents: { TAL_PUGILISTE: 1 }, talentsChoix: {}, ...extra });
  window.__epee = { nom: "Épée", modele: "Épée", type: "Arme légère" };
  window.__bague = { nom: "Bague", modele: "Bagues DPS", bague: true };
  window.__carte = (lanceur, attaques, alterations, arme) => {
    const s = { attaques, alterations };
    window.appliquerEquipementALaCarte(s, lanceur, arme || "Sans arme / Arme rp");
    return s.alterations.map(a => ({ nom: a.nom, chance: a.chance, duree: a.duree, venuDuTalent: !!a.venuDuTalent, cibles: a.cibles,
                                     icone: !!a.icone, desc: a.desc || "" }));
  };
});

let alterationPage = null;

titre("1. LE TEXTE DU TALENT");
await section(async () => {
  const r = await p.evaluate(() => ({
    texte: window.talentParId("TAL_PUGILISTE").texte,
    resume: window.resumeTalent(window.__heros({}), "TAL_PUGILISTE"),
    resumeHumain: window.resumeTalent(window.__heros({ race: "Humain" }), "TAL_PUGILISTE"),
    atout: window.texteAtout("chanceSaignementPhysique", 15)
  }));
  // (v427) le texte dit en plus « sur tous ses sorts, sans plafond » — corrections_v427_pugiliste.mjs.
  verifier("le talent dit « Vargen : en plus +15 % de chance de faire saigner … et +6 % de critique »",
           /Vargen : en plus \+15 % de chance de faire saigner[^.]* et \+6 % de critique/.test(r.texte) && !/empoison/i.test(r.texte), r.texte);
  verifier("le résumé d'un Vargen mains nues : « +15 % de faire saigner …, +6 % de critique »",
           /\+15 % de faire saigner[^,]*, \+6 % de critique/.test(r.resume) && !/empoison/i.test(r.resume), r.resume);
  verifier("le résumé d'un Humain n'en parle pas", !/saigner|empoison|critique/.test(r.resumeHumain), r.resumeHumain);
  verifier("l'atout se lit « +15 % de chance de faire saigner »", r.atout === "+15 % de chance de faire saigner", r.atout);
  const sources = ["talents.js", "moteur_effets.js", "app.js", "combat_etat.js", "moteur_pur.js", "cerveau_combat.js"].map(lire).join("\n");
  verifier("plus aucune trace de chancePoisonPhysique dans le code du jeu", !/chancePoisonPhysique/.test(sources));
});

titre("2. CE QUE LE TALENT DONNE (atoutRace)");
await section(async () => {
  const r = await p.evaluate(() => {
    const a = (extra) => { const x = window.atoutRace(window.__heros(extra)) || {};
      return { saigne: x.chanceSaignementPhysique, poison: x.chancePoisonPhysique, critique: x.critique || 0, phys: x.degatsPhysiques || 0 }; };
    return { nu: a({}), bague: a({ equipMainDroite: window.__bague }), arme: a({ equipMainDroite: window.__epee }),
             humain: a({ race: "Humain" }), sansTalent: a({ talents: {} }) };
  });
  verifier("Vargen mains nues : +15 % de saignement, +6 % de critique, plus de poison",
           r.nu.saigne === 15 && r.nu.poison === undefined && r.nu.critique === 6, JSON.stringify(r.nu));
  verifier("Vargen avec une bague seulement : pareil", r.bague.saigne === 15 && r.bague.critique === 6, JSON.stringify(r.bague));
  verifier("Vargen armé (épée) : rien", !r.arme.saigne && !r.arme.poison && r.arme.critique === 0 && r.arme.phys === 0, JSON.stringify(r.arme));
  verifier("Humain Pugiliste mains nues : le +1 physique, ni saignement ni poison",
           r.humain.phys === 1 && !r.humain.saigne && !r.humain.poison && r.humain.critique === 0, JSON.stringify(r.humain));
  verifier("Vargen sans le talent : rien", !r.sansTalent.saigne && !r.sansTalent.poison, JSON.stringify(r.sansTalent));
});

titre("3. CE QUE LA CARTE EMPORTE (appliquerEquipementALaCarte)");
await section(async () => {
  const r = await p.evaluate(() => {
    const coup = () => [{ nom: "Coup de poing", typeRes: "Physique", valeurBrute: 10, cibles: ["M"] }];
    return {
      nu: window.__carte(window.__heros({}), coup(), []),
      dejaSaigne: window.__carte(window.__heros({}), coup(), [{ nom: "Saignement", chance: 30, duree: 2, cibles: ["M"] }]),
      dejaPoison: window.__carte(window.__heros({}), coup(), [{ nom: "Empoisonnement", chance: 20, duree: 2, cibles: ["M"] }]),
      magie: window.__carte(window.__heros({}), [{ nom: "Attaque Magique", typeRes: "Magique", valeurBrute: 10, cibles: ["M"] }], [], "Magie"),
      soin: window.__carte(window.__heros({}), [{ nom: "Soin", isHeal: true, valeurBrute: 10, cibles: ["P1"] }], []),
      arme: window.__carte(window.__heros({ equipMainDroite: window.__epee }), coup(), []),
      humain: window.__carte(window.__heros({ race: "Humain" }), coup(), []),
      gabarit: window.GABARITS_ETATS_EQUIPEMENT["Saignement"]
    };
  });
  const s = r.nu.find(a => a.nom === "Saignement");
  alterationPage = s || null;
  verifier("Vargen mains nues, coup physique : un Saignement à 15 %, sur la cible frappée",
           !!s && s.chance === 15 && s.venuDuTalent && JSON.stringify(s.cibles) === '["M"]', JSON.stringify(r.nu));
  verifier("…avec la durée, l'icône et le texte du Saignement habituel (2 manches)",
           !!s && s.duree === 2 && s.duree === r.gabarit.duree && s.icone && s.desc === r.gabarit.desc, JSON.stringify(s));
  verifier("…et plus aucun Empoisonnement venu du talent", !r.nu.some(a => a.nom === "Empoisonnement"), JSON.stringify(r.nu));
  verifier("une carte qui fait déjà saigner (30 %) : 30 + 15 = 45, pas de second Saignement",
           r.dejaSaigne.filter(a => a.nom === "Saignement").length === 1 && r.dejaSaigne[0].chance === 45, JSON.stringify(r.dejaSaigne));
  const poison = r.dejaPoison.find(a => a.nom === "Empoisonnement"), saigne = r.dejaPoison.find(a => a.nom === "Saignement");
  verifier("une carte qui empoisonne (20 %) : le poison reste à 20, le Saignement à 15 s'ajoute",
           poison && poison.chance === 20 && saigne && saigne.chance === 15, JSON.stringify(r.dejaPoison));
  // (v427) Nico : « +15 % de saignement (pas max) sur tous les sorts » : la magie aussi.
  verifier("un sort (magique) : un Saignement à 15 % aussi (v427)",
           r.magie.length === 1 && r.magie[0].nom === "Saignement" && r.magie[0].chance === 15, JSON.stringify(r.magie));
  verifier("un soin : rien", r.soin.length === 0, JSON.stringify(r.soin));
  verifier("Vargen armé (épée) : rien", r.arme.length === 0, JSON.stringify(r.arme));
  verifier("Humain Pugiliste mains nues : rien", r.humain.length === 0, JSON.stringify(r.humain));
});

await b.close();
serveur.close();

titre("4. LE SAIGNEMENT PREND SUR LA CIBLE (resoudreCarte, Node)");
await section(async () => {
  const importer = (f) => import(pathToFileURL(path.join(RACINE, f)).href);
  const { construireEtatCombat } = await importer('combat_etat.js');
  const { resoudreCarte, chanceEtatDe } = await importer('moteur_pur.js');
  const fiche = (id, camp, extra = {}) => ({ idPersonnage: id, prenom: id, race: "", classe: "", camp, estMonstre: camp === "Ennemi", joueur: "",
    xp: 0, PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Critique: 0,
    Def_Physique: 0, Def_Magique: 0, Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
  const e = construireEtatCombat({ idPartie: "P", cerveau: "P1", graine: 1,
    combattants: [fiche("P1", "Allié", { race: "Vargen" }), fiche("M", "Ennemi")],
    positions: { P1: { q: 0, r: 0 }, M: { q: 1, r: 0 } }, partie: { Tour_Combat: 1 } });
  e.ordre = ["P1", "M"]; e.phase = "Resolution";
  verifier("la carte emporte bien un Saignement (section 3)", !!alterationPage);
  const altComplete = { nom: alterationPage.nom, chance: alterationPage.chance, duree: alterationPage.duree, cibles: alterationPage.cibles };
  verifier("le jet se fait à 15 % (chanceEtatDe)", chanceEtatDe(e.combattants.P1, altComplete, e.combattants.M, {}) === 15);
  const r = resoudreCarte(e, { type: "carte", idLanceur: "P1", idCarte: "C", critique: false,
    attaques: [{ nom: "Coup de poing", typeRes: "Physique", valeurBrute: 10, cibles: ["M"] }], alterations: [altComplete],
    jets: { attaqueRatee: false, parCible: { M: { esquive: false, etats: { "Saignement": true } } } } });
  const etatM = r.etat.combattants.M.etats.find(x => x.nom === "Saignement");
  verifier("le jet réussi : la cible saigne 2 manches, et le Vargen en est l'auteur (idSource)",
           !!etatM && etatM.duree === 2 && etatM.idSource === "P1", JSON.stringify(etatM));
  verifier("…et rien d'Empoisonné", !r.etat.combattants.M.etats.some(x => x.nom === "Empoisonnement"));
});

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
