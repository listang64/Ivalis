// LES CORRECTIONS DE LA v233, SUR LA VRAIE PAGE.
//
// 1. Nico : « au moment de cibler un ennemi qui est partiellement derrière un
//    mur, les boutons d'annulation et de validation de cible et les points de
//    vie/fatigue doivent apparaître au-dessus des murs sur le terrain. » Les
//    murs de terre ont leur calque AU-DESSUS des pions : la bulle ✔, la croix
//    ✖, la jauge de la cible et les jauges du pion sélectionné vivaient DANS le
//    pion, donc sous la roche. Ils vivent maintenant dans un porteur, à la place
//    du pion, sur un calque posé au-dessus des murs (#calque-ciblage-haut).
// 2. « Réinitialiser un combat n'enlève pas de suite les murs mis par le
//    Géomancien » : ils partent avant la moindre écriture en base.
// 3. « Le Sorcier a eu le malus de -30 % de dégâts au contact alors que
//    normalement lui n'est pas censé l'avoir » : plus d'étiquette « -30% ».
// 4. « Loot partagé : je me suis placé sur un habit de mon ami, que j'ai
//    gagné ; c'est lui qui a eu le message demandant si je voulais afficher le
//    casque, ça devrait être moi. » L'écran qui résout le partage n'équipe plus
//    l'armure d'un autre joueur en posant la question : elle part marquée
//    `casqueAChoisir`, et l'écran de son joueur pose la question.
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(70)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const RACINE = '/home/user/Ivalis';
const CAPTURES = '/tmp/claude-0';
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
const EFFETS = JSON.parse(fs.readFileSync(`${RACINE}/tests_monstres/effets_reels.json`, 'utf-8'));
const EFFETS_PAR_ID = Object.fromEntries((Array.isArray(EFFETS) ? EFFETS : Object.values(EFFETS)).map(e => [e.id, e]));

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 2 });
await p.route('**', r => {
  const url = r.request().url();
  if (url.startsWith(base)) return r.continue();
  if (url.includes('firebase-app.js')) return r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP });
  if (url.includes('firebase-firestore.js')) return r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE });
  // Les portraits des pions : bleu pour le lanceur, rouge pour la cible.
  const teinte = url.includes('pion-S') ? '#3a6ea5' : url.includes('pion-M1') ? '#a53a3a' : '#5a3d7a';
  if (url.includes('res.cloudinary.com')) return r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="96" fill="${teinte}" stroke="#e8d5a5" stroke-width="6"/></svg>` });
  return r.abort();
});
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(2000);

// Le plateau : S, le lanceur, en (0,0) ; M1, la cible, en (3,0). Un mur de
// terre au pied de chacun (au sud, en (0,1) et (3,1)) : la roche monte devant
// le bas du pion — là où se posent la bulle, la croix et les jauges.
const preparer = (extra) => p.evaluate(async ({ EFFETS, extra }) => {
  document.documentElement.style.setProperty("--app-h", "600px");
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
  document.getElementById("fenetre-combat").style.display = "block";
  window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
  window.completerEffetsDeSecours(window.EFFETS_BDD_CACHE);
  window.jouerSonClic = () => {};
  window.afficherMessageFlottantHex = () => {};
  window.PLATEAU_VTT = { hexSize: 50, getCaseState: () => ({}), hexToPixel: (q, r) => ({ x: 120 + q * 60, y: 260 + r * 60 }),
                         pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {}, getHexesInRadius: () => [] };
  window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
  window.ZONES_PERSISTANTES = {};
  const f = (id, x) => ({ idPersonnage: id, camp: "Allié", PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 100, fatigueActuelle: 100,
                          Etats_Alteres: [], statut: "Vivant", race: "Humain", ...x });
  window.PERSOS_PARTIE = [f("S", { prenom: "Ysolde", classe: (extra && extra.classe) || "Hoplite", xp: 0 }),
                          f("M1", { camp: "Ennemi", estMonstre: true, prenom: "Gnoll", PV_Actuels: 23 })];
  const img = (id) => "https://res.cloudinary.com/ivalis/image/upload/pion-" + id + ".png";
  window.TOKENS_VTT_DATA = { S: { q: 0, r: 0, taille: 55, url: img("S") }, M1: { q: (extra && extra.q) || 3, r: 0, taille: 55, url: img("M1") } };
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]]; window.COMBAT_INDEX_PERSO = 0;
  window.REGIME_CERVEAU = true;
  const carte = { Nom: "Trait perçant", Fatigue: 10, Initiative: 20,
    Effets_Compiles: [{ nom: "Attaque légère", desc: "6 dégâts physiques", isMod: false }, { nom: "Distance", desc: "3 hexagones", isMod: true }],
    Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_LEGERE", count: 1, mods: { EFF_DISTANCE: 2 }, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } };
  window.COMPETENCES_CACHE = { C1: carte }; window.CACHE_COMPETENCES_GLOBAL = { S: window.COMPETENCES_CACHE };
  window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1, File_Attente_Combat: [{ idPersonnage: "S", idCarte: "C1", initiative: 20 }] };
  window.CHEMIN_MOUVEMENT = [];
  window.TOKEN_SELECTIONNE = "S";
  window.MURS_TERRE = (extra && extra.sansMurs) ? {} : {
    MUR_T_0_1: { id: "MUR_T_0_1", q: 0, r: 1, pv: 10, pvMax: 10, idLanceur: "G" },
    MUR_T_3_1: { id: "MUR_T_3_1", q: 3, r: 1, pv: 10, pvMax: 10, idLanceur: "G" } };
  window.GRAVATS_TERRE = {};
  window.appliquerMursTerre();
  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
}, { EFFETS: EFFETS_PAR_ID, extra: extra || null });

// Le ciblage ouvert sur M1, la cible choisie (la bulle ✔ apparaît).
const viserM1 = () => p.evaluate(async () => {
  await window.demarrerCiblage("C1", { idLanceur: "S" });
  window.ajouterCibleCiblage("M1");
  window.TOKEN_SELECTIONNE = "M1";
  window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
  return { actif: !!(window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif), cible: window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.cibleUnique };
});

// CE QUI SE VOIT VRAIMENT À UN ENDROIT. Les murs n'avalent pas les clics
// (pointer-events: none) : un elementFromPoint passe au travers et ne dit rien
// de ce qui est peint par-dessus. On rend un instant la roche (et l'élément) « touchables » —
// le test de toucher suit alors l'ordre de peinture — et on demande qui est
// au-dessus. On vérifie aussi que la roche est bien PEINTE à cet endroit
// (pixel opaque du canvas des murs) : sinon le contrôle ne prouverait rien.
// `fx`, `fy` : le point mesuré, en fraction de l'élément (la bulle ✔ se pose
// au milieu des jauges : on mesure celles-ci sur leur gauche).
const auDessus = (selecteur, fx = 0.5, fy = 0.5) => p.evaluate(({ sel, fx, fy }) => {
  const el = document.querySelector(sel);
  if (!el) return { existe: false };
  const r = el.getBoundingClientRect();
  const x = r.left + r.width * fx, y = r.top + r.height * fy;
  const roche = document.querySelector("#calque-murs-terre-haut .murs-terre-ensemble");
  let peinte = false;
  if (roche) {
    const rr = roche.getBoundingClientRect();
    if (x >= rr.left && x <= rr.right && y >= rr.top && y <= rr.bottom) {
      const cx = Math.floor((x - rr.left) / rr.width * roche.width), cy = Math.floor((y - rr.top) / rr.height * roche.height);
      peinte = roche.getContext("2d").getImageData(cx, cy, 1, 1).data[3] > 200;
    }
    roche.style.pointerEvents = "auto";
  }
  // L'élément lui-même n'avale pas toujours les clics (une jauge) : le temps
  // de la mesure, il est touchable lui aussi.
  const avant = el.style.pointerEvents;
  el.style.pointerEvents = "auto";
  const dessus = document.elementFromPoint(x, y);
  el.style.pointerEvents = avant;
  if (roche) roche.style.pointerEvents = "none";
  return { existe: true, peinte, visible: !!dessus && (el === dessus || el.contains(dessus)),
           dessus: dessus ? (dessus.className || dessus.tagName) + "" : null,
           calque: !!el.closest("#calque-ciblage-haut"), x, y };
}, { sel: selecteur, fx, fy });

console.log("\n=========================================================");
console.log("  LES CORRECTIONS DE LA v233");
console.log("=========================================================");

console.log("\n1. LA BULLE ✔, LA CROIX ✖ ET LES JAUGES PASSENT AU-DESSUS DES MURS");
{
  await preparer();
  const v = await viserM1();
  verifier("(le ciblage est ouvert, M1 choisi)", v.actif && v.cible === "M1", JSON.stringify(v));
  const bulle = await auDessus("#calque-ciblage-haut .bulle-validation-cible, #token-M1 .bulle-validation-cible");
  const jauge = await auDessus("#calque-ciblage-haut .jauge-cible-ciblage .fond-jauge-cible, #token-M1 .jauge-cible-ciblage .fond-jauge-cible", 0.08);
  const sel = await auDessus("#calque-ciblage-haut .jauges-selection-token, #token-M1 .jauges-selection-token", 0.08, 0.8);
  const croix = await auDessus("#calque-ciblage-haut .croix-annuler-ciblage, #token-S .croix-annuler-ciblage");
  verifier("(la roche est bien peinte sous chacun d'eux)", bulle.peinte && jauge.peinte && sel.peinte && croix.peinte,
           JSON.stringify([bulle.peinte, jauge.peinte, sel.peinte, croix.peinte]));
  verifier("la bulle ✔ de validation se voit par-dessus la roche", bulle.existe && bulle.calque && bulle.visible, JSON.stringify(bulle));
  verifier("la jauge de vie de la cible aussi", jauge.existe && jauge.calque && jauge.visible, JSON.stringify(jauge));
  verifier("les jauges vie/fatigue du pion sélectionné aussi", sel.existe && sel.calque && sel.visible, JSON.stringify(sel));
  verifier("la croix ✖ d'annulation, sous le lanceur, aussi", croix.existe && croix.calque && croix.visible, JSON.stringify(croix));
  // Le pion lui-même reste derrière la roche : seul ce qu'on clique ou lit passe devant.
  const pion = await p.evaluate(() => {
    const t = document.getElementById("token-M1").getBoundingClientRect();
    const roche = document.querySelector("#calque-murs-terre-haut .murs-terre-ensemble");
    const rr = roche.getBoundingClientRect();
    const x = t.left + t.width * 0.8, y = t.bottom - 4;
    const cx = Math.floor((x - rr.left) / rr.width * roche.width), cy = Math.floor((y - rr.top) / rr.height * roche.height);
    const peinte = roche.getContext("2d").getImageData(cx, cy, 1, 1).data[3] > 200;
    roche.style.pointerEvents = "auto";
    const dessus = document.elementFromPoint(x, y);
    roche.style.pointerEvents = "none";
    return { roche: dessus === roche, peinte, dessus: dessus && (dessus.className + "") };
  });
  verifier("le pion, lui, reste caché derrière la roche", pion.roche && pion.peinte, JSON.stringify(pion));
  // Chaque porteur colle à son pion : même centre, même taille.
  const cale = await p.evaluate(() => ["S", "M1"].map(id => {
    const t = document.getElementById("token-" + id).getBoundingClientRect();
    const po = document.getElementById("porteur-" + id);
    const r = po ? po.getBoundingClientRect() : null;
    return !!r && Math.abs(r.left - t.left) < 1 && Math.abs(r.top - t.top) < 1 && Math.abs(r.width - t.width) < 1;
  }));
  verifier("chaque porteur est posé exactement sur son pion", cale.every(Boolean), JSON.stringify(cale));
  await p.screenshot({ path: `${CAPTURES}/ciblage_au_dessus_des_murs.png`, clip: { x: 50, y: 190, width: 330, height: 170 } });

  // Un vrai clic de souris, à l'endroit de la bulle, valide le ciblage.
  const clic = await p.evaluate(() => {
    window.__valide = 0;
    window.declencherResolutionAvecBondEventuel = () => { window.__valide++; };
    return true;
  });
  if (bulle.existe) await p.mouse.click(bulle.x, bulle.y);
  verifier("un clic sur la bulle, par-dessus la roche, valide la cible", clic && (await p.evaluate(() => window.__valide)) === 1);

  // On déplace la carte : les porteurs suivent leurs pions.
  const suivi = await p.evaluate(() => {
    window.VTT_POS_X = 40; window.VTT_POS_Y = -20;
    window.repositionnerTokensVTT();
    const t = document.getElementById("token-M1").getBoundingClientRect();
    const r = document.getElementById("porteur-M1").getBoundingClientRect();
    return Math.abs(r.left - t.left) < 1 && Math.abs(r.top - t.top) < 1;
  });
  verifier("la carte bouge : le porteur suit son pion", suivi);
  await p.evaluate(() => { window.VTT_POS_X = 0; window.VTT_POS_Y = 0; window.repositionnerTokensVTT(); });

  // La croix ✖ (un vrai clic) ferme le ciblage : bulle, jauge et croix s'en vont.
  if (croix.existe) await p.mouse.click(croix.x, croix.y);
  await p.waitForTimeout(50);
  const apres = await p.evaluate(() => ({
    actif: !!(window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif),
    restes: document.querySelectorAll("#calque-ciblage-haut .bulle-validation-cible, #calque-ciblage-haut .jauge-cible-ciblage, #calque-ciblage-haut .croix-annuler-ciblage").length
  }));
  verifier("un clic sur la croix, par-dessus la roche, annule le ciblage", !apres.actif, JSON.stringify(apres));
  verifier("…et ne laisse rien traîner au-dessus des murs", apres.restes === 0, JSON.stringify(apres));

  // Le pion disparaît (à terre) : son porteur s'en va avec lui.
  const orphelin = await p.evaluate(() => {
    window.TOKEN_SELECTIONNE = "M1";
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    const avant = !!document.getElementById("porteur-M1");
    window.PERSOS_PARTIE.find(x => x.idPersonnage === "M1").PV_Actuels = 0;
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    return { avant, apres: !!document.getElementById("porteur-M1") };
  });
  verifier("un pion qui disparaît emporte son porteur", orphelin.avant && !orphelin.apres, JSON.stringify(orphelin));
}

console.log("\n2. RÉINITIALISER LE COMBAT : LES MURS PARTENT TOUT DE SUITE");
{
  await preparer();
  const r = await p.evaluate(async () => {
    const avant = { murs: Object.keys(window.MURS_TERRE).length,
                    roche: !!document.querySelector("#calque-murs-terre-haut .murs-terre-ensemble") };
    window.confirm = () => true;
    // La base est lente aujourd'hui : la fermeture du combat ne revient jamais.
    window.regimeFermerLeCombat = () => new Promise(() => {});
    window.reinitialiserCombat();
    await new Promise(r => setTimeout(r, 50));
    return { avant, murs: Object.keys(window.MURS_TERRE || {}).length,
             roche: !!document.querySelector("#calque-murs-terre-haut .murs-terre-ensemble"),
             caseLibre: !window.etatCaseCombat(3, 1).isBlocked };
  });
  verifier("(deux murs sur le plateau avant)", r.avant.murs === 2 && r.avant.roche, JSON.stringify(r.avant));
  verifier("réinitialisé : plus aucun mur, sans attendre la base", r.murs === 0 && !r.roche, JSON.stringify(r));
  verifier("…et leurs cases sont libres", r.caseLibre);
  await p.evaluate(() => { window.REINITIALISATION_COMBAT_EN_COURS = false; });
}

console.log("\n3. LE SORCIER N'A PAS L'ÉTIQUETTE « -30% » AU CONTACT");
{
  const etiquette = async (classe) => {
    await preparer({ classe, q: 1, sansMurs: true });
    return p.evaluate(async () => {
      await window.demarrerCiblage("C1", { idLanceur: "S" });
      const l = document.querySelector("#token-M1 .malus-cac");
      const texte = l ? l.innerText : null;
      window.nettoyerCiblage();
      return texte;
    });
  };
  const autre = await etiquette("Hoplite");
  const sorcier = await etiquette("Sorcier");
  verifier("(un tir au contact, pour une autre classe : « -30% Dégâts »)", autre === "-30% Dégâts", String(autre));
  verifier("le Sorcier au contact : aucune étiquette de malus", sorcier === null, String(sorcier));
}

console.log("\n4. LE PARTAGE : LA QUESTION DU COUVRE-CHEF VA AU JOUEUR DU GAGNANT");
{
  // L'écran de l'AMI (J_AMI) valide en dernier : c'est lui qui résout. Le
  // héros de Nico (H1, joueur J_NICO) gagne la cuirasse sur laquelle il
  // s'était placé ; celui de l'ami (H2) gagne la sienne.
  const armure = (uid, nom) => ({ uid, nom, emplacement: "Armure", type: "Armure lourde",
                                   casque: { nom: "Heaume de " + nom, description: "un heaume" } });
  const resolveur = await p.evaluate(async ({ a1, a2 }) => {
    localStorage.setItem("ID_JOUEUR_COURANT", "J_AMI");
    window.__majs = [];
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Nico", idJoueur: "J_NICO" },
                            { idPersonnage: "H2", prenom: "Ami", idJoueur: "J_AMI" }];
    window.signalerCompetencesBloquees = async () => {};
    window.oublierImages = async () => {};
    window.peutEquiper = () => ({ possible: true });
    const suivis = [];
    window.suivreArmureEquipee = async (id, objet) => { suivis.push([id, objet.casquePorte]); return ""; };
    const questions = [];
    const demander = window.demanderCasque;
    window.demanderCasque = async (objet) => { questions.push(objet.nom); return true; };
    window.PARTIE_DATA = { Butin: { etape: "partage", participants: ["H1", "H2"], poolValides: ["H1"],
      pool: [{ ...a1, candidats: ["H1"] }, { ...a2, candidats: ["H2"] }] } };
    window.modifierPartie = async (fn) => {
      const r = fn(JSON.parse(JSON.stringify(window.PARTIE_DATA)));
      return r ? (r.resultat !== undefined ? r.resultat : true) : null;
    };
    await window.validerButinPool();
    window.demanderCasque = demander;
    const ecrit = (id) => ((window.__majs || []).filter(m => m.chemin === "Personnages/" + id && m.data.Equip_Armure).slice(-1)[0] || {}).data;
    return { questions, suivis, h1: ecrit("H1"), h2: ecrit("H2") };
  }, { a1: armure("a1", "Cuirasse d'Arès"), a2: armure("a2", "Broigne") });
  verifier("l'écran qui résout pose la question pour SON héros seulement",
           JSON.stringify(resolveur.questions) === '["Broigne"]', JSON.stringify(resolveur.questions));
  verifier("la cuirasse de Nico est équipée, le couvre-chef « à choisir »",
           resolveur.h1 && resolveur.h1.Equip_Armure.casqueAChoisir === true && resolveur.h1.Equip_Armure.casquePorte === undefined,
           JSON.stringify(resolveur.h1));
  verifier("…et son portrait n'est pas redessiné d'ici", !resolveur.suivis.some(s => s[0] === "H1"), JSON.stringify(resolveur.suivis));
  verifier("la broigne de l'ami : choisie ici, portrait redessiné",
           resolveur.h2 && resolveur.h2.Equip_Armure.casquePorte === true && resolveur.suivis.some(s => s[0] === "H2"));

  // L'écran de l'ami reçoit la fiche de Nico : il ne demande rien.
  const chezLAmi = await p.evaluate(async (h1) => {
    const persos = [{ idPersonnage: "H1", idJoueur: "J_NICO", equipArmure: h1.Equip_Armure }];
    const fen = document.getElementById("fenetre-choix-casque");
    await window.demanderCasquesEnAttente(persos);
    await new Promise(r => setTimeout(r, 80));
    return { ouverte: !!fen && getComputedStyle(fen).display !== "none" };
  }, resolveur.h1);
  verifier("chez l'ami, la fiche de Nico n'ouvre aucune question", !chezLAmi.ouverte, JSON.stringify(chezLAmi));

  // L'écran de Nico reçoit sa fiche : LUI a la question, et son choix s'écrit.
  const chezNico = await p.evaluate(async (h1) => {
    localStorage.setItem("ID_JOUEUR_COURANT", "J_NICO");
    window.__majs = [];
    const suivis = [];
    window.suivreArmureEquipee = async (id, objet) => { suivis.push([id, objet.casquePorte]); return ""; };
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Nico", idJoueur: "J_NICO", equipArmure: h1.Equip_Armure }];
    const persos = [{ idPersonnage: "H1", idJoueur: "J_NICO", equipArmure: h1.Equip_Armure }];
    const enCours = window.demanderCasquesEnAttente(persos);
    await new Promise(r => setTimeout(r, 100));
    const fen = document.getElementById("fenetre-choix-casque");
    const vu = { ouverte: !!fen && getComputedStyle(fen).display !== "none", texte: fen ? fen.textContent : "" };
    // La même fiche redescend pendant qu'il réfléchit : pas de seconde question.
    window.demanderCasquesEnAttente(persos);
    fen.querySelector('button[data-choix="non"]').click();
    await enCours;
    const maj = (window.__majs || []).filter(m => m.chemin === "Personnages/H1").slice(-1)[0];
    return { vu, maj: maj && maj.data, suivis, ram: window.PERSOS_PARTIE[0].equipArmure };
  }, resolveur.h1);
  verifier("chez Nico, la question s'ouvre, pour sa cuirasse",
           chezNico.vu.ouverte && /Heaume de Cuirasse d'Arès|Cuirasse d'Arès/.test(chezNico.vu.texte), chezNico.vu.texte.trim().slice(0, 90));
  verifier("« Tête nue » : son choix s'écrit, la marque « à choisir » disparaît",
           chezNico.maj && chezNico.maj.Equip_Armure.casquePorte === false && chezNico.maj.Equip_Armure.casqueAChoisir === undefined,
           JSON.stringify(chezNico.maj));
  verifier("…sa fiche en mémoire aussi, et son portrait est redessiné",
           chezNico.ram && chezNico.ram.casquePorte === false && JSON.stringify(chezNico.suivis) === '[["H1",false]]', JSON.stringify(chezNico.suivis));
  const unSeul = await p.evaluate(() => (window.__majs || []).filter(m => m.chemin === "Personnages/H1").length);
  verifier("une seule question, une seule écriture", unSeul === 1, String(unSeul));
  // Le suivi des fiches (app.js) appelle bien la question à chaque arrivée.
  const app = fs.readFileSync(`${RACINE}/app.js`, 'utf-8');
  const suivi = app.slice(app.indexOf("unsubscribePersonnages = onSnapshot"), app.indexOf("unsubscribePersonnages = onSnapshot") + 3000);
  verifier("le suivi des fiches de la partie pose la question à leur arrivée", /demanderCasquesEnAttente\(persos\)/.test(suivi));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
