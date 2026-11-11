// LA CLASSE MAUDIT (v362, nouvelle ; niveaux 1, 3 et 5 — la Possession, niveau 9 : v363).
//
// Nico : « NIVEAU 1 : PASSIF Malédiction avancée — des DOT offensifs sans surpuissance, qui se
// cumulent plusieurs fois sur une même cible ; chaque cumul est représenté par un symbole rond
// contenant un chiffre (le nombre de DOT actifs). +5 PV, +1 compétence. Les sorts offensifs du
// Maudit ne bénéficient pas de surpuissance classique. NIVEAU 3 : PASSIF Magie du sang — une
// surpuissance de 1,2x sur les sorts offensifs, en intégrant la Magie du sang au sort ; il perd
// des PV égaux à 10 % du coût en fatigue du sort. NIVEAU 5 : Vaudou — 1 fois par combat, init
// 100, fatigue 0, portée 5 ; lie le joueur à un ennemi 2 tours : l'ennemi subit aussi les dégâts
// et les soins reçus par le joueur (exactement les dégâts bruts subis par le joueur). »
// Ses réponses : un sous-effet à 0 point dans la Forge ; arrondi au-dessus, jamais sous 1 PV ;
// ses soins gardent la surpuissance ; Vaudou : ce que le Maudit perd vraiment, sans les défenses
// de l'ennemi ; les soins aussi.
//
// Lancer : node tests_monstres/maudit.mjs
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat, clonerEtat, appliquerEntree, verifierEtatCombat } from '../combat_etat.js';
import { resoudreCarte, ETAT_VAUDOU, ETAT_LIE_VAUDOU, refleterVaudou } from '../moteur_pur.js';
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
const maudit = (niveau, extra = {}) => fiche("D", { classe: "Maudit", xp: XP[niveau], PV_Max: 95, PV_Actuels: 100, ...extra });
const POS = { D: { q: 0, r: 0 }, M1: { q: 2, r: 0 }, M2: { q: 3, r: 0 }, M3: { q: 9, r: 0 }, A: { q: 0, r: 1 } };
const monde = (niveau = 5, extraD = {}) => {
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, regles: REGLES, partie: { Tour_Combat: 1 }, positions: POS,
        combattants: [maudit(niveau, extraD), fiche("M1"), fiche("M2"), fiche("M3"), fiche("A")] });
    e.ordre = ["D", "M1", "M2", "M3", "A"]; e.phase = "Resolution";
    return e;
};
const etat = (c, nom) => (c.etats || []).find(x => x.nom === nom);

console.log("\n1. LES PALIERS");
{
    const a = (n) => w.atoutClasse(maudit(n));
    verifier("niveau 1 : DOT cumulables, sans surpuissance offensive, +5 PV, +1 compétence",
             a(1).dotCumulables === true && a(1).sansSurpuissanceOffensive === true && a(1).pvMax === 5 && a(1).competences === 1, JSON.stringify(a(1)));
    verifier("niveau 3 : la Magie du sang (dans la Forge) ; pas au 2", a(3).magieDuSang === true && JSON.stringify(a(3).effets) === '["EFF_MAGIE_DU_SANG"]' && !a(2).magieDuSang);
    verifier("niveau 5 : Vaudou ; rien au niveau 9 pour l'instant (v363)", JSON.stringify(a(5).techniques) === '["CLASSE_VAUDOU"]'
             && JSON.stringify(a(9).techniques) === '["CLASSE_VAUDOU"]');
    verifier("PV max : 95 + 5 = 100", w.pvMaxCombattant(maudit(1)) === 100);
    const t = w.TECHNIQUES_CLASSE.CLASSE_VAUDOU;
    verifier("Vaudou : init 100, 0 fatigue, un ennemi à 5 cases, visé sur le plateau", t.Initiative === 100 && t.Fatigue === 0 && t.cible === "ennemi"
             && t.portee === 5 && t.niveau === 5 && t.classe === "Maudit" && !!w.TECHNIQUES_VISEES.CLASSE_VAUDOU);
    verifier("les textes", /cumulent/.test(w.texteAtout("dotCumulables", true)) && /surpuissance classique/.test(w.texteAtout("sansSurpuissanceOffensive", true))
             && /10 %/.test(w.texteAtout("magieDuSang", true)));
}

console.log("\n2. LA MALÉDICTION AVANCÉE : SES DOT SE CUMULENT");
{
    const dot = (e, lanceur = "D") => resoudreCarte(e, { type: "carte", idLanceur: lanceur, idCarte: "POISON", critique: false,
        attaques: [{ nom: "Attaque Magique", valeurBrute: 9, typeRes: "Magique", rangeMax: 5, estEtalement: true, toursEtalement: 3, cibles: ["M1"] }],
        alterations: [], jets: { attaqueRatee: false, parCible: { M1: { esquive: false, etats: {} } } } }).etat;
    const e1 = monde(1); e1.version = 10;
    const a = dot(e1); a.version = 11;
    const b = dot(a);
    const et = etat(b.combattants.M1, "Étalement");
    verifier("la même compétence lancée deux fois : deux DOT actifs (deux sources)", et && et.sources.length === 2, JSON.stringify(et && et.sources));
    verifier("…leurs parts s'additionnent (3 + 3 par manche)", et && et.tics.join(",") === "6,6,6", et && et.tics.join(","));
    const autre = monde(1); autre.combattants.D.atouts.dotCumulables = false; autre.version = 10;
    const a2 = dot(autre); a2.version = 11;
    const et2 = etat(dot(a2).combattants.M1, "Étalement");
    verifier("un autre lanceur : la même compétence se réinitialise (une source, 3,3,3)", et2 && et2.sources.length === 1 && et2.tics.join(",") === "3,3,3",
             et2 && `${et2.sources.length} ${et2.tics.join(",")}`);
}

console.log("\n3. LA MAGIE DU SANG : LE PRIX EN PV");
{
    const carte = (e, sang, cout = 75) => resoudreCarte(e, { type: "carte", idLanceur: "D", idCarte: "S", critique: false, coutFatigue: cout,
        attaques: [{ nom: "Attaque Magique", valeurBrute: 10, typeRes: "Magique", rangeMax: 5, ...(sang ? { magieDuSang: true } : {}), cibles: ["M1"] }],
        alterations: [], jets: { attaqueRatee: false, parCible: { M1: { esquive: false, etats: {} } } } });
    const r = carte(monde(3), true);
    verifier("une carte de 75 avec la Magie du sang : 8 PV (10 %, arrondi au-dessus), dits", r.etat.combattants.D.pv === 92
             && r.etapes.some(x => x.type === "degats" && x.cible === "D" && x.sang && x.montant === 8), String(r.etat.combattants.D.pv));
    verifier("sans la Magie du sang : rien", carte(monde(3), false).etat.combattants.D.pv === 100);
    const bas = monde(3); bas.combattants.D.pv = 5;
    verifier("à 5 PV : il reste à 1 (jamais sous 1)", carte(bas, true).etat.combattants.D.pv === 1);
    const n2 = monde(2); n2.combattants.D.atouts.magieDuSang = false;
    verifier("sans l'atout (niveau 2) : rien, même marquée", carte(n2, true).etat.combattants.D.pv === 100);
}

console.log("\n4. LE VAUDOU");
{
    const vaudou = (cible) => ({ id: "V1", type: "classe", acteur: "D", idCarte: "CLASSE_VAUDOU", cible });
    const prep = (n = 5) => { const e = monde(n); e.file = [{ id: "D", carte: "CLASSE_VAUDOU", initiative: 100, pas: 0 }, { id: "M1", carte: "X", initiative: 10, pas: 0 },
                                                         { id: "M2", carte: "X", initiative: 5, pas: 0 }]; return e; };
    verifier("niveau 5 : accepté sur M1 ; niveau 4 : non", validerIntention(prep(), vaudou("M1")).ok && !validerIntention(prep(4), vaudou("M1")).ok);
    verifier("M3 à 9 cases : refusé ; un allié : refusé", !validerIntention(prep(), vaudou("M3")).ok && !validerIntention(prep(), vaudou("A")).ok);
    const mur = { etatCase: (q, r) => ({ bloquee: q === 1 && r === 0, supprimee: false, difficile: false }) };
    verifier("derrière un mur : refusé", !validerIntention(prep(), vaudou("M1"), mur).ok);
    const pas = appliquerIntention(prep(), vaudou("M1"));
    const c = pas.etat.combattants;
    verifier("les deux liés, 2 manches", etat(c.D, ETAT_VAUDOU) && etat(c.D, ETAT_VAUDOU).idLie === "M1" && etat(c.D, ETAT_VAUDOU).duree === 2
             && etat(c.M1, ETAT_LIE_VAUDOU) && etat(c.M1, ETAT_LIE_VAUDOU).idMaudit === "D");
    verifier("une fois par combat ; aucune fatigue", c.D.fatigue === 100 && !validerIntention(Object.assign(clonerEtat(pas.etat), { file: prep().file }), vaudou("M2")).ok);
    const titre = misEnScene(pas.entree.etapes.find(x => x.type === "techniqueClasse"), pas.etat);
    verifier("à l'écran : « 🪆 Vaudou »", titre && /Vaudou/.test(titre.texte));
    // M1 (le lié) frappe le Maudit : 20 physiques ; M2 aussi (M2 a 50 % d'armure contre lui).
    const frappe = (etatAvant, auteur, valeur) => {
        const x = clonerEtat(etatAvant);
        x.file = [{ id: auteur, carte: "C", initiative: 50, pas: 0 }, { id: "A", carte: "X", initiative: 1, pas: 0 }];
        return appliquerIntention(x, { id: "F" + auteur + valeur, type: "carte", acteur: auteur, idCarte: "C", coutFatigue: 0,
            attaques: [{ nom: "Coup", valeurBrute: valeur, typeRes: "Physique", rangeMax: 9, cibles: ["D"] }], alterations: [] });
    };
    const lie = clonerEtat(pas.etat); lie.combattants.D.def.physique = 50; lie.combattants.M1.def.physique = 80;
    const f = frappe(lie, "M2", 20);
    verifier("le Maudit perd 10 (20, son armure à 50 %) : M1 lié perd 10 aussi, sans sa propre armure", f.etat.combattants.D.pv === 90 && f.etat.combattants.M1.pv === 90,
             `${f.etat.combattants.D.pv} / ${f.etat.combattants.M1.pv}`);
    verifier("…dit par une étape « Vaudou »", f.entree.etapes.some(x => x.type === "degats" && x.cible === "M1" && x.vaudou && x.montant === 10));
    verifier("rejoué depuis le journal : mêmes PV", (r => r.D.pv === 90 && r.M1.pv === 90)(appliquerEntree(lie, f.entree).combattants));
    // Un soin du Maudit : M1 le reçoit aussi.
    const blesse = clonerEtat(f.etat); blesse.combattants.M1.pv = 50;
    const soin = (() => { const x = clonerEtat(blesse);
        x.file = [{ id: "A", carte: "S", initiative: 50, pas: 0 }, { id: "M2", carte: "X", initiative: 1, pas: 0 }];
        return appliquerIntention(x, { id: "SOIN", type: "carte", acteur: "A", idCarte: "S", coutFatigue: 0,
            attaques: [{ nom: "Soin", valeurBrute: 6, typeRes: "Magique", isHeal: true, rangeMax: 9, cibles: ["D"] }], alterations: [] }); })();
    verifier("un allié soigne le Maudit de 6 : M1 reprend 6 aussi", soin.etat.combattants.D.pv === 96 && soin.etat.combattants.M1.pv === 56,
             `${soin.etat.combattants.D.pv} / ${soin.etat.combattants.M1.pv}`);
    // Le prix de la Magie du sang compte aussi (ce qu'il perd).
    const ap = refleterVaudou({ combattants: { D: { pv: 100 } } }, (() => { const s = clonerEtat(pas.etat); s.combattants.D.pv = 92; return s; })(),
                              [{ type: "degats", cible: "D", pvApres: 92, sang: true }]);
    verifier("ce qu'il perd par sa Magie du sang, l'ennemi lié le perd aussi", ap.some(x => x.type === "degats" && x.cible === "M1" && x.montant === 8));
    // Un coup qui tue le lié par le lien.
    const fragile = clonerEtat(pas.etat); fragile.combattants.M1.pv = 5;
    const k = frappe(fragile, "M2", 20);
    verifier("le lien peut le tuer (5 PV, 20 de perte) : M1 tombe", k.etat.combattants.M1.aTerre && k.etat.combattants.M1.pv === 0);
    verifier("l'état reste cohérent", verifierEtatCombat(k.etat).length === 0, verifierEtatCombat(k.etat).join(" | "));
}

// La vraie page : la grille, la fiche, la Forge, la carte extraite.
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

console.log("\n5. LA PAGE : LA GRILLE, LA FICHE, LA FORGE, LA SURPUISSANCE DES CARTES");
{
  const r = await p.evaluate(async () => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = "none"; });
    window.CLASSES_CACHE = window.CLASSES_PAR_DEFAUT.map(c => ({ ...c }));
    await window.ouvrirChoixClasse();
    const carte = document.querySelector('.carte-classe[data-classe="CLASSE_MAUDIT"]');
    const bientot = !!(carte && (carte.dataset.bientot === "true" || carte.querySelector(".carte-classe-bientot-texte")));
    window.ouvrirFicheClasse("CLASSE_MAUDIT");
    const d = document.getElementById("descriptif-fiche-classe");
    // La Forge : la Magie du sang, au Maudit de niveau 3 seulement.
    window.EFFETS_BDD_CACHE = { EFF_ATTAQUE_MAGIQUE: { Nom: "Attaque Magique", Valeur: 10, Cout_PT: "2", Modificateur: "INTELLIGENCE", Type_Mecanique: "Action/Global" } };
    window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
    const sang = window.EFFETS_BDD_CACHE.EFF_MAGIE_DU_SANG;
    const acces = (classe, xp) => window.effetAccessible("EFF_MAGIE_DU_SANG", sang, { classe, race: "Humain", xp });
    // La carte extraite : surpuissance classique (80 de fatigue) ou pas.
    window.jouerSonClic = () => {};
    window.PLATEAU_VTT = { getCaseState: () => ({}), hexToPixel: (q, r) => ({ x: 300 + q * 60, y: 300 + r * 60 }), pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {} };
    window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
    const carteDe = (mods) => ({ Nom: "Malédiction", Arme: "Magie", Fatigue: 80, Initiative: 20,
      Effets_Compiles: [{ nom: "Attaque Magique", desc: "10", isMod: false }, ...(mods.EFF_MAGIE_DU_SANG ? [{ nom: "Magie du sang", isMod: true }] : [])],
      Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 1, mods, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } });
    const extraire = async (perso, c) => {
      window.PERSOS_PARTIE = [{ idPersonnage: "D", camp: "Allié", prenom: "Morg", race: "Humain", ...perso, PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 100, fatigueActuelle: 100, Etats_Alteres: [], statut: "Vivant" },
        { idPersonnage: "M1", camp: "Ennemi", estMonstre: true, prenom: "Gnoll", PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }];
      window.TOKENS_VTT_DATA = { D: { q: 0, r: 0 }, M1: { q: 2, r: 0 } };
      window.TOKEN_SELECTIONNE = "D";
      window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]]; window.COMBAT_INDEX_PERSO = 0;
      window.REGIME_CERVEAU = true;
      window.COMPETENCES_CACHE = { C1: c }; window.CACHE_COMPETENCES_GLOBAL = { D: window.COMPETENCES_CACHE };
      window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1, File_Attente_Combat: [{ idPersonnage: "D", idCarte: "C1", initiative: 20 }] };
      window.CHEMIN_MOUVEMENT = []; window.ZONES_PERSISTANTES = {};
      const etat = await window.demarrerCiblage("C1", { extraire: true, idLanceur: "D" });
      if (typeof window.nettoyerCiblage === "function") window.nettoyerCiblage();
      const a = ((etat && etat.attaques) || [])[0] || {};
      return { valeur: a.valeurBrute, sang: !!a.magieDuSang };
    };
    const ex = {
      autre: await extraire({ classe: "Sorcier", xp: 2500 }, carteDe({})),
      maudit: await extraire({ classe: "Maudit", xp: 2500 }, carteDe({})),
      sang: await extraire({ classe: "Maudit", xp: 2500 }, carteDe({ EFF_MAGIE_DU_SANG: 1 })),
      sangN1: await extraire({ classe: "Maudit", xp: 0 }, carteDe({ EFF_MAGIE_DU_SANG: 1 }))
    };
    const rond = window.medaillonEtat({ nom: "Étalement", sources: [{}, {}, {}] }, 24);
    const sansRond = window.medaillonEtat({ nom: "Étalement", sources: [{}] }, 24);
    return { existe: !!carte, bientot, niveaux: [...d.querySelectorAll(".palier-classe-niveau")].map(x => x.textContent.trim()), texte: d.textContent,
             sangCout: sang && sang.Cout_PT, acces: [acces("Maudit", 1200), acces("Maudit", 700), acces("Sorcier", 6400)],
             ex, rond: /rond-cumul-dot[^>]*>3</.test(rond), sansRond: !/rond-cumul-dot/.test(sansRond) };
  });
  verifier("la classe est dans la grille, sans « Arrive bientôt »", r.existe && !r.bientot);
  verifier("sa fiche : Niv. 1 / 3 / 5 / 9 (la Possession annoncée)", JSON.stringify(r.niveaux) === '["Niv. 1","Niv. 3","Niv. 5","Niv. 9"]'
           && /cumulent/.test(r.texte) && /Magie du sang/.test(r.texte) && /Vaudou/.test(r.texte) && /Possession/.test(r.texte), JSON.stringify(r.niveaux));
  verifier("la Magie du sang : 0 point, au Maudit de niveau 3 seulement", r.sangCout === "0" && JSON.stringify(r.acces) === "[true,false,false]", JSON.stringify(r.acces));
  verifier("une carte de 80 : un Sorcier a la surpuissance classique (> 10)", r.ex.autre.valeur > 10, JSON.stringify(r.ex.autre));
  verifier("le Maudit : pas de surpuissance (10)", r.ex.maudit.valeur === 10 && !r.ex.maudit.sang, JSON.stringify(r.ex.maudit));
  verifier("le Maudit avec la Magie du sang : ×1,2 (12), marquée", r.ex.sang.valeur === 12 && r.ex.sang.sang, JSON.stringify(r.ex.sang));
  verifier("au niveau 1 (pas encore la Magie du sang) : 10, pas marquée", r.ex.sangN1.valeur === 10 && !r.ex.sangN1.sang, JSON.stringify(r.ex.sangN1));
  verifier("le rond des DOT cumulés : « 3 » sur l'état ; rien pour un seul", r.rond && r.sansRond);
}
verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await br.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
