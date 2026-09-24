// L'AVEUGLEMENT : TROIS CASES DE NOIR AUTOUR DE L'AVEUGLÉ, FIXES.
//
// Nouvel effet demandé par Nico : « Aveuglement — 1 — DEXTÉRITÉ — 10 % de chance
// (max 70 %) d'aveugler la cible, sur 2 tours. » Précisions : 3 hexagones
// autour de la cible (tirés au hasard) sont dans le noir, FIXÉS là où elle a été
// aveuglée ; un monstre aveuglé ne choisit pas ce qui s'y
// tient ; un joueur aveuglé voit un brouillard noir sur ces cases — lui seul —
// et ne peut y viser ni ennemi ni allié ; une ZONE les touche quand même.
//
// Sur le vrai code : moteur_pur.js (tirage, pose, noir), moteur_effets.js
// (extraction, ciblage, anneaux, brouillard), ia_pure.js + cerveau_combat.js
// (créatures), pont_combat.js (message), monstres_competences.js (générateur).
import fs from 'fs';
import http from 'http';
import path from 'path';
import { tirerDesCarte, resoudreCarte, tirerDirectionsAveugle, casesDansLeNoir, estDansLeNoir,
         ETAT_AVEUGLE, DIRECTIONS_HEX, estEtatNefaste } from '../moteur_pur.js';
import { jouerCreature } from '../cerveau_combat.js';
import { construireEtatCombat, clonerEtat } from '../combat_etat.js';
import { misEnScene } from '../pont_combat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(70)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const desFixe = (suite, defaut = 99) => { const f = [...suite]; return { d100: () => f.length ? f.shift() : defaut,
  fraction: () => 0.5, graine: () => 1 }; };

const FICHE = { id: "EFF_AVEUGLEMENT", Nom: "Aveuglement", Cout_PT: "1", Modificateur: "DEXTÉRITÉ",
  Type_Mecanique: "Physique", Type_Mecanique_2: "Aucun", Valeur: 0, Pourcent_Base: 10, Pourcent_Max: 70, Tours: 2,
  Cible_Etat: "aveuglement", Effet_Base: "10% chance (max 70%) d'aveugler la cible, sur 2 tours" };

const fiche = (id, extra = {}) => ({ idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100,
  Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
const monde = (positions = {}) => construireEtatCombat({
  idPartie: "G", cerveau: "P", graine: 9,
  combattants: [fiche("H1", { idJoueur: "P", camp: "Allié" }), fiche("H2", { idJoueur: "Q", camp: "Allié" }),
                fiche("M1", { estMonstre: true, camp: "Ennemi" })],
  positions: { H1: { q: 0, r: 0 }, H2: { q: -3, r: 3 }, M1: { q: 1, r: 0 }, ...positions },
  partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["M1", "H1", "H2"],
            File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "CM" }, { idPersonnage: "H1", idCarte: "C" },
                                  { idPersonnage: "H2", idCarte: "C2" }] }
});

// =========================================================================
console.log("\n1. LE NOYAU : TROIS CASES TIRÉES, UN NOIR QUI RESTE");
// =========================================================================
{
  const dirs = tirerDirectionsAveugle(desFixe([1, 1, 1]));
  const cles = new Set(dirs.map(d => `${d.q},${d.r}`));
  verifier("3 directions, toutes différentes, parmi les 6 voisines",
           dirs.length === 3 && cles.size === 3 && dirs.every(d => DIRECTIONS_HEX.some(h => h.q === d.q && h.r === d.r)),
           JSON.stringify(dirs));
  const autres = tirerDirectionsAveugle(desFixe([6, 5, 4]));
  verifier("d'autres dés, un autre noir", JSON.stringify(autres) !== JSON.stringify(dirs), JSON.stringify(autres));

  const etat = monde();
  const alt = { nom: ETAT_AVEUGLE, chance: 30, duree: 2, cibles: ["H1"] };
  // dés : défense H1 (99 = touché), chance (20 ≤ 30 = pris), puis les 3 directions.
  const jets = tirerDesCarte(etat, { attaques: [], alterations: [alt] }, "M1", false, desFixe([99, 20, 1, 1, 1]));
  verifier("l'état prend, et le jet emporte 3 directions", jets.parCible.H1.etats[ETAT_AVEUGLE] === true
           && (jets.parCible.H1.aveugle || []).length === 3, JSON.stringify(jets.parCible.H1));
  const rate = tirerDesCarte(etat, { attaques: [], alterations: [alt] }, "M1", false, desFixe([99, 90]));
  verifier("raté (dé 90) : aucun dé de noir n'est tiré", rate.parCible.H1.aveugle === undefined);

  const r = resoudreCarte(etat, { type: "carte", idLanceur: "M1", idCarte: "CM", attaques: [], alterations: [alt], jets });
  const pose = r.etat.combattants.H1.etats.find(e => e.nom === ETAT_AVEUGLE);
  verifier("l'état « Aveuglé » est posé 2 tours, avec ses 3 cases",
           pose && pose.duree === 2 && (pose.cases || []).length === 3, JSON.stringify(pose));
  const h1 = r.etat.combattants.H1;
  const noir = casesDansLeNoir(h1);
  verifier("3 cases de noir, toutes collées à l'endroit où il a été aveuglé",
           noir.length === 3 && noir.every(c => (Math.abs(c.q) + Math.abs(c.q + c.r) + Math.abs(c.r)) / 2 === 1), JSON.stringify(noir));
  const bouge = { ...h1, q: 5, r: 5 };
  verifier("le noir RESTE sur ses cases de départ quand l'aveuglé bouge",
           JSON.stringify(casesDansLeNoir(bouge)) === JSON.stringify(noir) && estDansLeNoir(bouge, noir[0]));
  const visible = DIRECTIONS_HEX.find(d => !noir.some(c => c.q === d.q && c.r === d.r));
  verifier("une case voisine hors du noir reste visible", !estDansLeNoir(h1, visible) && estDansLeNoir(h1, noir[0]));
  verifier("sans l'état, rien n'est dans le noir", casesDansLeNoir(r.etat.combattants.M1).length === 0);
  verifier("la Purification peut l'ôter (état néfaste)", estEtatNefaste(pose));

  // Aveuglé de nouveau ailleurs : le nouveau noir se tire autour de sa nouvelle case.
  const ailleurs = clonerEtat(r.etat);
  ailleurs.combattants.H1.q = 4; ailleurs.combattants.H1.r = 0;
  const encore = resoudreCarte(ailleurs, { type: "carte", idLanceur: "M1", idCarte: "CM", attaques: [], alterations: [alt],
    jets: { parCible: { H1: { esquive: false, etats: { [ETAT_AVEUGLE]: true }, aveugle: [DIRECTIONS_HEX[0]] } } } });
  const renouvele = encore.etat.combattants.H1.etats.filter(e => e.nom === ETAT_AVEUGLE);
  verifier("aveuglé de nouveau : un seul état, le nouveau noir autour de sa nouvelle case",
           renouvele.length === 1 && JSON.stringify(renouvele[0].cases) === '[{"q":5,"r":0}]', JSON.stringify(renouvele));
  const scene = misEnScene(r.etapes.find(e => e.pose === ETAT_AVEUGLE), r.etat);
  verifier("l'écran annonce « Aveuglé 🌫️ »", scene.geste === "message" && /Aveuglé/.test(scene.texte), JSON.stringify(scene));
}

// =========================================================================
console.log("\n2. LES CRÉATURES NE VISENT PAS DANS LE NOIR");
// =========================================================================
{
  // La goule M1 (1,0), au contact de Naomi (0,0), a été aveuglée : Naomi est
  // sur l'une de ses 3 cases de noir. Ben (-3,3) est loin, mais visible.
  const aveugler = (etat, cases) => { etat.combattants.M1.etats = [{ nom: ETAT_AVEUGLE, duree: 2, cases }]; return etat; };
  const NOIR = [{ q: 0, r: 0 }, { q: 1, r: -1 }, { q: 1, r: 1 }];
  const carte = { idCarte: "CM", infos: { portee: 1, fatigue: 10 }, attaques: [{ valeurBrute: 9 }], alterations: [] };

  // Sur vingt tirages du hasard : jamais Naomi. Elle va vers Ben, le seul qu'elle voit.
  let naomiTouchee = 0, versBen = 0;
  for (let g = 1; g <= 20; g++) {
    const e = aveugler(monde(), NOIR);
    e.graine = g * 7919;
    const p = jouerCreature(e, "M1", carte, null);
    if (p.etat.combattants.H1.pv < 60) naomiTouchee++;
    const m = p.etat.combattants.M1, ben = p.etat.combattants.H2;
    const d = (Math.abs(m.q - ben.q) + Math.abs(m.q + m.r - ben.q - ben.r) + Math.abs(m.r - ben.r)) / 2;
    if (d < 4) versBen++;          // elle partait à 4 cases de Ben : elle doit s'en rapprocher
  }
  verifier("Naomi, dans son noir, n'est jamais visée (20 tirages sur 20)", naomiTouchee === 0, `${naomiTouchee} fois touchée`);
  verifier("elle marche vers Ben, le seul qu'elle voit (20 tirages sur 20)", versBen === 20, `${versBen}/20`);
  const couleurs = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
  verifier("le point de l'état sur le pion est noir", /"Aveuglé":\s*"#000000"/.test(couleurs));

  // Seule cible au monde, et dans le noir : elle ne lance rien.
  const seule = aveugler(monde({ H2: { q: 9, r: -9 } }), NOIR);
  seule.combattants.H2.aTerre = true;
  const p1 = jouerCreature(seule, "M1", carte, null);
  verifier("sa seule cible est dans le noir : aucune technique lancée", !p1.entree.etapes.some(e => e.type === "carte")
           && p1.etat.combattants.H1.pv === 60, p1.entree.etapes.map(e => e.type).join(","));

  // Même garde au moment de frapper (cerveau_combat.js) : une cible choisie
  // quand même se retrouve dans le noir — la carte n'est pas lancée.
  const src = fs.readFileSync('/home/user/Ivalis/cerveau_combat.js', 'utf-8');
  verifier("le cerveau refuse de frapper dans le noir (garde de jouerCreature)",
           /dansLeNoir = !!\(moi && cible && !infos\.estZone && estDansLeNoir\(moi, cible\)\)/.test(src));

  const zoneFigee = aveugler(monde(), NOIR);
  zoneFigee.combattants.M1.etats.push({ nom: "Immobilisation", duree: 2 });
  const carteZone = { idCarte: "CZ", infos: { portee: 1, fatigue: 10, estZone: true, zoneHexes: [{ q: 0, r: 0 }, { q: -1, r: 0 }] },
                      attaques: [{ valeurBrute: 9 }], alterations: [] };
  const p3 = jouerCreature(zoneFigee, "M1", carteZone, null);
  verifier("une ZONE, elle, frappe même dans le noir", p3.entree.etapes.some(e => e.type === "carte"),
           p3.entree.etapes.map(e => e.type).join(","));
}

// =========================================================================
console.log("\n3. LE JOUEUR AVEUGLÉ (vrai moteur_effets.js)");
// =========================================================================
const RACINE = '/home/user/Ivalis';
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end(); return; }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css' };
  res.writeHead(200, { 'Content-Type': types[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;
const SRC = fs.readFileSync(`${RACINE}/moteur_effets.js`, 'utf-8').replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch(); const pg = await b.newPage();
await pg.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
const erreurs = []; pg.on('pageerror', e => erreurs.push(e.message));
await pg.goto(base + '/index.html'); await pg.waitForTimeout(300);
await pg.evaluate(async ({ src, fiche }) => {
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  window.PLATEAU_VTT = { hexSize: 30, hexToPixel: (q, r) => ({ x: q * 52, y: r * 45 }), pixelToHex: () => window.__caseCliquee,
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    getHexesInRadius: (q, r, R) => { const o = []; for (let a = -R; a <= R; a++) for (let c = -R; c <= R; c++) if (dist({ q, r }, { q: q + a, r: r + c }) <= R) o.push({ q: q + a, r: r + c }); return o; } };
  window.VTT_POS_X = 0; window.VTT_POS_Y = 0; window.VTT_SCALE = 1;
  window.bonusEquip = () => 0; window.bonusPorteeMagique = () => 0; window.jouerSonClic = () => {};
  window.estUneCreature = (p) => !!(p && p.estMonstre); window.critiqueCombattant = () => 0;
  window.estCombattantMort = () => false;
  window.__messages = []; window.afficherMessageFlottantHex = (q, r, t) => window.__messages.push(t);
  window.EFFETS_BDD_CACHE = { ATT: { id: "ATT", Nom: "Attaque légère", Valeur: 6 },
    SOIN: { id: "SOIN", Nom: "Soin", Valeur: 5 }, DIST: { id: "DIST", Nom: "Distance", Valeur: 2 },
    EFF_AVEUGLEMENT: fiche };
  new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField', src)(
    window, {}, () => ({}), async () => {}, async () => {}, async () => {}, () => ({}));
  window.regimeDemande = { actif: () => true, carte: async (a, c) => { window.__envoyees.push(JSON.parse(JSON.stringify(c))); } };
  // Naomi (J1) en (0,0) est aveuglée : noir à l'est (1,0), au sud (0,1), à l'ouest (-1,0).
  window.__poser = (aveuglee = true) => {
    window.__envoyees = []; window.__messages = []; window.ETAT_CIBLAGE = null;
    const noir = [{ q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 0 }];
    const j1 = { idPersonnage: "J1", camp: "Allié", statut: "Vivant",
                 Etats_Alteres: aveuglee ? [{ nom: "Aveuglé", duree: 2, cases: noir }] : [] };
    window.PERSOS_PARTIE = [j1,
      { idPersonnage: "J2", camp: "Allié", statut: "Vivant", Etats_Alteres: [] },
      { idPersonnage: "M1", camp: "Ennemi", statut: "Vivant", Etats_Alteres: [] },
      { idPersonnage: "M2", camp: "Ennemi", statut: "Vivant", Etats_Alteres: [] }];
    window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 }, J2: { q: 0, r: 1 }, M1: { q: 1, r: 0 }, M2: { q: 0, r: -1 } };
    // Les pions à l'écran : c'est sur eux que s'accrochent les anneaux de ciblage.
    Object.keys(window.TOKENS_VTT_DATA).forEach(id => {
      if (document.getElementById("token-" + id)) return;
      const d = document.createElement("div"); d.id = "token-" + id; d.className = "token-vtt"; document.body.appendChild(d);
    });
    window.COMBAT_PERSOS_JOUEUR = [j1]; window.COMBAT_INDEX_PERSO = 0;
  };
  window.__carte = (actions) => { window.COMPETENCES_CACHE = { C: { Nom: "Banc", Arme: "Arme légère CAC", Fatigue: 5,
    Composants: { actions } } }; return "C"; };
}, { src: SRC, fiche: FICHE });
{
  const ext = await pg.evaluate(async () => {
    window.__poser(false);
    const lire = async (actions) => { window.__carte(actions);
      const c = await window.demarrerCiblage("C", { extraire: true, idLanceur: "J1" });
      return (c.alterations || []).find(a => a.nom === "Aveuglé") || null; };
    return {
      un: await lire([{ baseEffetId: "ATT", count: 1, mods: { EFF_AVEUGLEMENT: 3 } }]),
      max: await lire([{ baseEffetId: "ATT", count: 1, mods: { EFF_AVEUGLEMENT: 9 } }]),
      duree: await lire([{ baseEffetId: "ATT", count: 1, mods: { EFF_AVEUGLEMENT: 1 }, modsDuree: { EFF_AVEUGLEMENT: 1 } }])
    };
  });
  verifier("3 crans : 30 % de chance, 2 tours", ext.un && ext.un.chance === 30 && ext.un.duree === 2, JSON.stringify(ext.un));
  verifier("9 crans : plafonné à 70 %", ext.max && ext.max.chance === 70, ext.max && String(ext.max.chance));
  verifier("un cran ⏳ : 3 tours", ext.duree && ext.duree.duree === 3, ext.duree && String(ext.duree.duree));
  verifier("l'état porte son icône (œil barré)", ext.un && /^data:image\/svg/.test(ext.un.icone || ""));

  const cib = await pg.evaluate(async () => {
    window.__poser(true);
    window.__carte([{ baseEffetId: "ATT", count: 1, mods: {} }]);
    await window.demarrerCiblage("C", { idLanceur: "J1" });
    const anneaux = [...document.querySelectorAll(".anneau-ciblage")].map(a => a.parentNode.id).join(",");
    window.ajouterCibleCiblage("M1");            // dans le noir (1,0)
    const apresNoir = [...(window.ETAT_CIBLAGE.attaques[0].cibles || [])];
    const msgNoir = [...window.__messages];
    window.ajouterCibleCiblage("M2");            // visible (0,-1)
    const apresVisible = [...(window.ETAT_CIBLAGE.attaques[0].cibles || [])];
    return { apresNoir, msgNoir, apresVisible, anneaux };
  });
  verifier("viser l'ennemi dans le noir : refusé, « Dans le noir »", cib.apresNoir.length === 0
           && cib.msgNoir.some(m => /noir/.test(m)), JSON.stringify(cib.msgNoir));
  verifier("viser l'ennemi visible : accepté", JSON.stringify(cib.apresVisible) === '["M2"]', JSON.stringify(cib.apresVisible));
  verifier("aucun anneau de ciblage sur la cible cachée", !/M1/.test(cib.anneaux) && /M2/.test(cib.anneaux), cib.anneaux);

  const soin = await pg.evaluate(async () => {
    window.__poser(true);
    window.__carte([{ baseEffetId: "SOIN", count: 1, mods: {} }]);
    await window.demarrerCiblage("C", { idLanceur: "J1" });
    window.ajouterCibleCiblage("J2");            // allié dans le noir (0,1)
    return { cibles: [...(window.ETAT_CIBLAGE.attaques[0].cibles || [])], msg: [...window.__messages] };
  });
  verifier("soigner un allié dans le noir : refusé aussi", !soin.cibles.includes("J2") && soin.msg.some(m => /noir/.test(m)),
           JSON.stringify(soin));

  const zone = await pg.evaluate(async () => {
    window.__poser(true);
    window.__carte([{ baseEffetId: "ATT", count: 1, mods: {}, zoneHexes: [{ q: 1, r: 0 }, { q: 0, r: -1 }] }]);
    await window.demarrerCiblage("C", { idLanceur: "J1" });
    window.validerZoneAoE();
    await new Promise(r => setTimeout(r, 60));
    const e = window.__envoyees[0] || {};
    return ((e.attaques || [])[0] || {}).cibles || [];
  });
  verifier("une ZONE touche quand même l'ennemi caché dans le noir", zone.includes("M1") && zone.includes("M2"),
           JSON.stringify(zone));

  // LE BROUILLARD : seulement chez l'aveuglé.
  const brouillard = await pg.evaluate(async () => {
    window.__poser(true);
    document.getElementById("fenetre-combat").style.display = "block";
    const svg = window.dessinerBrouillardAveuglement();
    const chezLui = svg ? { cases: svg.querySelectorAll("polygon").length, z: svg.style.zIndex,
                           anime: !!svg.querySelector("animate"), sig: svg.dataset.signature } : null;
    // Naomi s'éloigne : le brouillard reste sur les cases de départ.
    window.TOKENS_VTT_DATA.J1 = { q: -3, r: 2 };
    const apresDepart = window.dessinerBrouillardAveuglement();
    const reste = apresDepart && apresDepart.dataset.signature === (chezLui || {}).sig;
    // Le même état, mais sur l'appareil d'un AUTRE joueur (son héros n'est pas aveuglé).
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[1]];
    const ailleurs = window.dessinerBrouillardAveuglement();
    const resteAilleurs = !!document.getElementById("svg-brouillard-aveugle");
    // L'état passe : le brouillard s'en va.
    window.__poser(false);
    document.getElementById("fenetre-combat").style.display = "block";
    window.dessinerBrouillardAveuglement();
    return { chezLui, reste, ailleurs: !!ailleurs, resteAilleurs, parti: !document.getElementById("svg-brouillard-aveugle") };
  });
  verifier("chez l'aveuglé : un brouillard sur ses 3 cases, animé, au-dessus des pions",
           brouillard.chezLui && brouillard.chezLui.cases === 3 && brouillard.chezLui.anime && Number(brouillard.chezLui.z) > 10,
           JSON.stringify(brouillard.chezLui));
  verifier("il s'éloigne : le brouillard reste sur les cases de départ", brouillard.reste);
  verifier("chez un autre joueur : aucun brouillard", !brouillard.ailleurs && !brouillard.resteAilleurs);
  verifier("l'état fini, le brouillard disparaît", brouillard.parti);
}
await b.close(); serveur.close();

// =========================================================================
console.log("\n4. LE GÉNÉRATEUR DE TECHNIQUES DES MONSTRES");
// =========================================================================
{
  const EFFETS = JSON.parse(fs.readFileSync(`${RACINE}/tests_monstres/effets_reels.json`, 'utf-8'));
  const fenetre = {}; global.window = fenetre;
  global.localStorage = { getItem: () => null };
  global.fetch = async () => { throw new Error("IA débranchée"); };
  global.document = { getElementById: () => null };
  fenetre.EFFETS_BDD_CACHE = { ...EFFETS, EFF_AVEUGLEMENT: FICHE };
  fenetre.gabaritMonstre = () => null;
  eval(fs.readFileSync(`${RACINE}/monstres_competences.js`, 'utf-8').replace(/^import[\s\S]*?from\s+"[^"]+";/gm, ''));
  // Les altérations d'une carte (états + contrôles) : la règle en permet deux.
  const ALT = ["brûl", "brul", "glac", "électri", "electri", "poison", "empoison", "confusion", "aveugl",
               "poussée", "poussee", "traction", "immobilisation", "étourdi", "etourdi", "peur", "provocation"];
  const nomDe = (id) => ((fenetre.EFFETS_BDD_CACHE[id] || {}).Nom || "").toLowerCase();
  let cartes = 0, avec = 0, tropChargees = 0, exemple = "";
  for (const archetype of ["DPS DISTANCE", "DPS CAC", "DPS MAGE DISTANCE"]) {
    for (let i = 0; i < 15; i++) {
      const docs = await fenetre.genererCompetencesMonstre({ nom: "Créature", archetype, palier: "Élite" });
      docs.forEach(d => {
        cartes++;
        const ids = d.Composants.actions.flatMap(a => [a.baseEffetId, ...Object.keys(a.mods || {})]);
        if (ids.includes("EFF_AVEUGLEMENT")) avec++;
        // La règle du générateur compte les MODIFICATEURS (une Poussée posée
        // comme action à part n'y entre pas) : on compte comme elle.
        const mods = d.Composants.actions.flatMap(a => Object.keys(a.mods || {}));
        const alts = new Set(mods.filter(id => ALT.some(m => nomDe(id).includes(m))));
        if (ids.includes("EFF_AVEUGLEMENT") && alts.size > 2) { tropChargees++; exemple = [...alts].join("+"); }
      });
    }
  }
  verifier("les monstres se servent de l'Aveuglement", avec > 0, `${avec}/${cartes} cartes`);
  verifier("et il compte dans la limite de deux altérations (modificateurs) par carte", tropChargees === 0,
           tropChargees ? `${tropChargees} cartes, ex. ${exemple}` : "");
  const src = fs.readFileSync(`${RACINE}/monstres_ia.js`, 'utf-8');
  verifier("et l'IA le compte parmi les altérations (une illusion le refuse)", /"aveugl"/.test(src));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.join(" | "));
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
