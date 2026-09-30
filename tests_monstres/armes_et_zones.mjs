// PERSISTANCE EN ZONE, DISTANCE RÉSERVÉE, ARMES QUI BLOQUENT DES TECHNIQUES.
//
// Nico :
//  • « Persistance de terrain, mettre comme si c'était une zone : une
//    compétence avec par exemple dégâts 8 et persistance terrain doit pouvoir
//    se lancer où on veut au cac sans faire de ciblage. »
//  • « Le sous-effet Distance ne peut se mettre que sur les armes
//    polyvalentes, les armes à distance, la magie et le soin. »
//  • « Quand on équipe un nouveau type d'arme, une alerte pour dire les
//    compétences qui vont être inutilisables avec cette arme ; les griser dans
//    la fiche perso et les désélectionner automatiquement (la bannière grisée
//    est déjà utilisée en combat). »
import fs from 'fs';
import http from 'http';
import path from 'path';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

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

await p.evaluate((EFFETS) => {
  window.EFFETS_BDD_CACHE = JSON.parse(JSON.stringify(EFFETS));
  window.jouerSonClic = () => {};
  window.estMonstre = (id) => String(id).startsWith("M");
  window.PLATEAU_VTT = { getCaseState: () => ({}), hexToPixel: (q, r) => ({ x: 300 + q * 60, y: 300 + r * 60 }),
                         pixelToHex: () => ({ q: 0, r: 0 }), renderMap: () => {} };
  window.VTT_SCALE = 1; window.VTT_POS_X = 0; window.VTT_POS_Y = 0;
}, EFFETS_PAR_ID);

// =========================================================================
console.log("\n1. LA PERSISTANCE DE TERRAIN SE POSE COMME UNE ZONE");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    document.getElementById("fenetre-combat").style.display = "block";
    window.PERSOS_PARTIE = [
      { idPersonnage: "H1", camp: "Allié", prenom: "Cybile", PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 100,
        fatigueActuelle: 100, Etats_Alteres: [], statut: "Vivant" },
      { idPersonnage: "M1", camp: "Ennemi", estMonstre: true, prenom: "Gnoll", PV_Max: 40, PV_Actuels: 40,
        Fatigue_Max: 100, fatigueActuelle: 100, Etats_Alteres: [], statut: "Vivant" }
    ];
    window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, M1: { q: 3, r: 0 } };
    window.TOKEN_SELECTIONNE = "H1";
    window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]]; window.COMBAT_INDEX_PERSO = 0;
    window.REGIME_CERVEAU = true; window.CHEMIN_MOUVEMENT = []; window.ZONES_PERSISTANTES = {};
    const carte = (mods) => ({ Nom: "Brasier", Arme: "Magie", Fatigue: 30, Initiative: 40, Effets_Compiles: [],
      Composants: { actions: [{ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 3, mods, zoneHexes: [], baseDuree: 0, modsDuree: {} }] } });
    window.COMPETENCES_CACHE = { CAC: carte({ EFF_PERSISTANCE_TERRAIN: 1 }), LOIN: carte({ EFF_PERSISTANCE_TERRAIN: 1, EFF_DISTANCE: 2 }),
                                 NUE: carte({}) };
    window.CACHE_COMPETENCES_GLOBAL = { H1: window.COMPETENCES_CACHE, M1: window.COMPETENCES_CACHE };
    window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1, File_Attente_Combat: [] };
    const lire = async (id, lanceur = "H1") => {
      const c = await window.demarrerCiblage(id, { extraire: true, idLanceur: lanceur });
      return { isZone: c.isZone, base: c.zoneHexesBase, enZone: c.attaques.map(a => a.enZone),
               ranged: !!(c.attaques[0] || {}).isRanged, persistance: c.persistanceTerrain };
    };
    const cac = await lire("CAC"), loin = await lire("LOIN"), nue = await lire("NUE"), monstre = await lire("CAC", "M1");

    // Le vrai geste : poser la nappe sur la case voisine, vide, et valider.
    let envoye = null;
    window.regimeDemande = { actif: () => true, carte: async (id, c) => { envoye = c; } };
    await window.demarrerCiblage("CAC", { idLanceur: "H1" });
    window.ETAT_CIBLAGE.zoneCenterHex = { q: 0, r: 0 };
    window.ETAT_CIBLAGE.zoneRotationStep = 2;
    window.validerZoneAoE();
    await new Promise(r => setTimeout(r, 400));
    if (typeof window.nettoyerCiblage === "function") window.nettoyerCiblage();
    return { cac, loin, nue, monstre, envoye: envoye && { zoneHexes: envoye.zoneHexes, persistance: envoye.persistanceTerrain,
             cibles: (envoye.attaques || []).map(a => a.cibles) } };
  });
  verifier("dégâts + persistance au contact : une zone d'une case, à côté du lanceur",
           r.cac.isZone && JSON.stringify(r.cac.base) === '[{"q":1,"r":0}]' && r.cac.enZone.every(Boolean) && !r.cac.ranged,
           JSON.stringify(r.cac));
  verifier("avec Distance : une case posée où l'on veut, à portée",
           r.loin.isZone && JSON.stringify(r.loin.base) === '[{"q":0,"r":0}]' && r.loin.ranged, JSON.stringify(r.loin));
  verifier("sans persistance, rien ne change (cible unique)", !r.nue.isZone, JSON.stringify(r.nue));
  verifier("les créatures gardent leur façon de viser", !r.monstre.isZone, JSON.stringify(r.monstre));
  verifier("posée sur une case VIDE : la nappe part quand même, sans cible",
           !!r.envoye && r.envoye.persistance && JSON.stringify(r.envoye.cibles) === "[[]]"
           && r.envoye.zoneHexes.length === 1 && Math.abs(r.envoye.zoneHexes[0].q) + Math.abs(r.envoye.zoneHexes[0].r) > 0,
           JSON.stringify(r.envoye));
}

// =========================================================================
console.log("\n2. LE SOUS-EFFET DISTANCE : POLYVALENTE, DISTANCE, MAGIE — OU UN SOIN");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    window.__docs = { "Personnages/H1": { Race: "Humain" }, "Caracteristiques/H1": { int: 16, sag: 16, force: 16, dex: 16 } };
    document.getElementById("champ-id-personnage").value = "H1";
    window.OUVERTURE_FORGE_EN_COURS = false;
    await window.ouvrirCreationCompetence();
    const eff = (id) => window.forgeState.effetsBDD.find(e => e.id === id);
    const action = (id, mods = {}) => ({ idInst: "A_" + id, baseEffet: eff(id), count: 1, mods, zoneHexes: [], baseDuree: 0, modsDuree: {} });
    const distanceProposee = (arme, idEffet) => {
      window.forgeState.armePrincipale = arme;
      window.forgeState.actions = [action(idEffet)];
      window.rafraichirForge();
      const opt = [...document.querySelectorAll("#forge-contenu-carte option")].find(o => o.value === "EFF_DISTANCE");
      return !!opt && !opt.disabled;
    };
    const res = {};
    for (const arme of ["Arme légère CAC", "Arme lourde CAC", "Sans arme / Arme rp", "Arme polyvalente", "Arme légère Distance", "Magie"]) {
      res[arme] = distanceProposee(arme, arme === "Magie" ? "EFF_ATTAQUE_MAGIQUE" : "EFF_ATTAQUE_LOURDE");
    }
    res.soinAuContact = distanceProposee("Arme lourde CAC", "EFF_SOIN");

    // Changer d'arme retire une Distance devenue interdite — pas celle d'un soin.
    window.forgeState.armePrincipale = "Arme polyvalente";
    window.forgeState.actions = [action("EFF_ATTAQUE_LOURDE", { EFF_DISTANCE: 1 }), action("EFF_SOIN", { EFF_DISTANCE: 1 })];
    window.selectionnerArme("Arme lourde CAC");
    res.apresChangement = window.forgeState.actions.map(a => Object.keys(a.mods));
    window.fermerForgeCompetence();
    return res;
  });
  verifier("arme légère / lourde au contact : pas de Distance",
           !r["Arme légère CAC"] && !r["Arme lourde CAC"], JSON.stringify(r));
  verifier("sans arme : pas de Distance", !r["Sans arme / Arme rp"]);
  verifier("polyvalente, à distance, magie : Distance proposée",
           r["Arme polyvalente"] && r["Arme légère Distance"] && r["Magie"]);
  verifier("un soin, même avec une arme de contact : Distance proposée", r.soinAuContact);
  verifier("changer pour une arme de contact retire la Distance de l'attaque, pas du soin",
           JSON.stringify(r.apresChangement) === '[[],["EFF_DISTANCE"]]', JSON.stringify(r.apresChangement));
}

// =========================================================================
console.log("\n3. UNE NOUVELLE ARME : ALERTE, BANNIÈRES GRISÉES, DÉSÉLECTION");
// =========================================================================
{
  const r = await p.evaluate(async () => {
    document.getElementById("fenetre-combat").style.display = "none";
    localStorage.setItem("ID_JOUEUR_COURANT", "J1");
    const arc = { uid: "arc", nom: "Arc court", type: "Arme légère Distance", emplacement: "Main", deuxMains: true };
    const hache = { uid: "hache", nom: "Hache", type: "Arme lourde CAC", emplacement: "Main", deuxMains: false };
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", idJoueur: "J1", prenom: "Cybile", camp: "Allié", couleur: "#335",
      PV_Max: 40, PV_Actuels: 40, equipMainDroite: arc, equipMainGauche: arc, deckEquipe: ["C_TIR", "C_SORT", "C_COUDE"] }];
    window.PERSOS_JOUEURS_PARTIE = window.PERSOS_PARTIE;
    window.CACHE_COMPETENCES_GLOBAL = { H1: {
      C_ROC:   { Nom: "Coup de roc", Arme: "Arme lourde CAC", Initiative: 50 },
      C_TIR:   { Nom: "Trait perçant", Arme: "Arme légère Distance", Initiative: 40 },
      C_SORT:  { Nom: "Étincelle", Arme: "Magie", Initiative: 30 },
      C_COUDE: { Nom: "Coup de coude", Arme: "Sans arme / Arme rp", Initiative: 20 } } };
    const avant = window.competencesBloqueesParArme(window.PERSOS_PARTIE[0]).map(c => c.id);

    // La fiche est ouverte sur l'onglet Compétences.
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
    const fiche = document.getElementById("fenetre-fiche-perso");
    fiche.style.display = "flex"; fiche.style.left = "2vw"; fiche.style.top = "20px";
    document.getElementById("champ-id-personnage").value = "H1";
    document.getElementById("titre-nom-personnage").textContent = "Cybile";
    const bouton = [...document.querySelectorAll(".onglet-btn")].find(b => b.textContent.trim() === "Compétences");
    if (bouton) bouton.click();
    await window.chargerOngletCompetences("H1", 6);

    const alertes = [];
    window.alert = (m) => alertes.push(m);
    window.__majs = [];
    await window.equiperObjet("H1", hache, "Droite");
    await new Promise(r => setTimeout(r, 300));

    const bannieres = {};
    ["C_ROC", "C_TIR", "C_SORT", "C_COUDE"].forEach(id => {
      const b = document.getElementById("ui-carte-" + id);
      bannieres[id] = b ? { grise: b.classList.contains("banniere-epuisee"), selectionnee: b.dataset.selectionnee === "true",
                            cadre: (document.getElementById("cadre-carte-" + id) || {}).style?.backgroundImage || "" } : null;
    });
    const deckEcrit = window.__majs.filter(m => m.chemin === "Personnages/H1" && m.data.Deck_Equipe).map(m => m.data.Deck_Equipe);
    return { avant, alertes, bannieres, deck: window.PERSOS_PARTIE[0].deckEquipe, deckEcrit };
  });
  await p.screenshot({ path: "/tmp/claude-0/competences_grisees.png" });
  const r2 = await p.evaluate(async () => {
    // Deux clics sur la technique grisée : elle ne revient pas en main.
    window.CARTE_EN_APERCU = null;
    window.gererClicCarte("C_TIR");
    window.gererClicCarte("C_TIR");
    await new Promise(r => setTimeout(r, 100));
    const reprise = window.CARTES_SELECTIONNEES.includes("C_TIR");
    const refus = (document.getElementById("erreur-deck-arme") || {}).textContent || "";
    const apercu = document.getElementById("apercu-carte-hd-competence");
    if (apercu) apercu.style.display = "none";

    // Lâcher l'arme : plus rien ne bloque, la fiche se dégrise.
    await window.lacherObjet("H1", "Equip_Main_Droite");
    await new Promise(r => setTimeout(r, 300));
    const apresLacher = document.getElementById("ui-carte-C_TIR").classList.contains("banniere-epuisee");
    return { reprise, refus, apresLacher };
  });
  Object.assign(r, r2);
  verifier("avec l'arc, seul « Coup de roc » était bloqué", JSON.stringify(r.avant) === '["C_ROC"]', JSON.stringify(r.avant));
  verifier("équiper la hache : une alerte nomme la technique qui devient inutilisable",
           r.alertes.length === 1 && /Hache/.test(r.alertes[0]) && /Trait perçant/.test(r.alertes[0])
           && !/Coup de roc/.test(r.alertes[0]) && !/Étincelle/.test(r.alertes[0]), JSON.stringify(r.alertes));
  verifier("et dit qu'elle sort des compétences mémorisées", /Retirée des compétences mémorisées : Trait perçant/.test(r.alertes[0] || ""));
  verifier("« Trait perçant » grisée (bannière du combat), plus en main",
           r.bannieres.C_TIR.grise && !r.bannieres.C_TIR.selectionnee && /ban_epuis/.test(r.bannieres.C_TIR.cadre),
           JSON.stringify(r.bannieres.C_TIR));
  verifier("magie et sans arme restent jouables et en main",
           !r.bannieres.C_SORT.grise && r.bannieres.C_SORT.selectionnee && !r.bannieres.C_COUDE.grise && r.bannieres.C_COUDE.selectionnee);
  verifier("« Coup de roc » (arme lourde) redevient jouable", !r.bannieres.C_ROC.grise);
  verifier("le deck est réécrit en base sans elle", JSON.stringify(r.deck) === '["C_SORT","C_COUDE"]'
           && r.deckEcrit.some(d => JSON.stringify(d) === '["C_SORT","C_COUDE"]'), JSON.stringify(r.deckEcrit));
  verifier("deux clics sur la bannière grisée : refusée, avec la raison", !r.reprise && /Arme inadaptée/.test(r.refus)
           && /Hache/.test(r.refus), r.refus);
  verifier("lâcher la hache dégrise la technique", r.apresLacher === false);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close(); serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
