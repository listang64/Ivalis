// UN COMBAT COMPLET, À TROIS APPAREILS, DE LA PRÉPARATION À LA RÉSOLUTION.
//
// Trois vraies pages du jeu (Nico, Ben, Adrien), chacune dans son propre
// navigateur — donc son propre stockage local, sa propre identité — branchées
// sur UN SEUL Firestore partagé (firestore_partage.mjs). Rien du jeu n'est
// découpé ni remplacé : on rejoint la partie par le mot de passe, on ouvre la
// fenêtre de combat, le MJ génère la rencontre, chacun choisit sa technique en
// cliquant sa bannière puis le bouton de fin de tour, exactement comme à table.
//
// Ce banc répond à la question que tous les autres laissaient ouverte : une fois
// que les joueurs ont choisi leurs compétences, LE COMBAT SE LANCE-T-IL ?
import fs from 'fs';
import http from 'http';
import path from 'path';
import { SOURCE_FAUX_SDK, SOURCE_FAUX_APP, creerFirestorePartage } from './firestore_partage.mjs';

const RACINE = '/home/user/Ivalis';
const TRACE = process.env.TRACE_COMBAT_COMPLET || '';
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

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

// =========================================================================
//  LE MONDE DE DÉPART : une partie, trois héros, une arène, le bestiaire
// =========================================================================
const EFFETS = JSON.parse(fs.readFileSync(`${RACINE}/tests_monstres/effets_reels.json`, 'utf-8'));
const GABARITS = JSON.parse(fs.readFileSync(`${RACINE}/tests_monstres/gabarits_reels.json`, 'utf-8'));
const JOUEURS = JSON.parse(fs.readFileSync(`${RACINE}/tests_monstres/joueurs.json`, 'utf-8'));
const ID_PARTIE = "GAME_BANC";
const URL_ARENE = "https://res.cloudinary.com/dlkjq4kvg/image/upload/v1/arene_banc.png";

const HEROS = [
  { id: "H_NICO",   joueur: "P_01", prenom: "Mémé",   couleur: "#93e3fd", q: -3, r: 0 },
  { id: "H_BEN",    joueur: "P_02", prenom: "Pliors", couleur: "#f4c430", q: -3, r: 1 },
  { id: "H_ADRIEN", joueur: "P_03", prenom: "Jade",   couleur: "#9be37b", q: -4, r: 1 }
];

function ficheHeros(h) {
  return {
    ID_Personnage: h.id, ID_Partie: ID_PARTIE, ID_Joueur: h.joueur, Camp: "Allié",
    Prenom_Personnage: h.prenom, Nom_Personnage: "", Race: "Humain", Couleur: h.couleur,
    PV_Max: 42, PV_Actuels: 42, Fatigue_Max: 100, Fatigue_Actuelle: 100, Regeneration: 30,
    Esquive: 15, Parade: 0, Critique: 10, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Max: 0, Bouclier_Actuel: 0, Competences_Max: 6, Objets_Max: 2,
    Statut: "Vivant", Actif: true, Etats_Alteres: [],
    URL_Cloudinary: `https://res.cloudinary.com/dlkjq4kvg/image/upload/v1/${h.id}.png`,
    URL_Token: `https://res.cloudinary.com/dlkjq4kvg/image/upload/v1/token_${h.id}.png`,
    Deck_Equipe: [`${h.id}_FRAPPE`, `${h.id}_TIR`]
  };
}

// Deux techniques par héros, forgées comme la Forge les écrit : un coup au
// contact, et un tir à distance (pour pouvoir jouer sans avoir à marcher).
function cartes(h) {
  const action = (id, count, mods) => ({ idInst: "a_" + id, baseEffetId: id, count, mods: mods || {},
                                         zoneHexes: [], baseDuree: 0, modsDuree: {} });
  return {
    [`${h.id}_FRAPPE`]: { Nom: "Coup de taille", Arme: "Non spécifié", Element: "Aucun", Fatigue: 12,
                         Initiative: 40, Cout_PC: 3,
                         Effets_Compiles: [{ nom: "Attaque lourde", desc: "6 dégats physique", isMod: false }],
                         Composants: { actions: [action("EFF_ATTAQUE_LOURDE", 3)] } },
    [`${h.id}_TIR`]:    { Nom: "Trait", Arme: "Non spécifié", Element: "Aucun", Fatigue: 15,
                         Initiative: 35, Cout_PC: 5,
                         Effets_Compiles: [{ nom: "Attaque légère", desc: "4 dégats physique", isMod: false },
                                           { nom: "Distance", desc: "7 hexagone", isMod: true }],
                         Composants: { actions: [action("EFF_ATTAQUE_LEGERE", 2, { EFF_DISTANCE: 6 })] } }
  };
}

const initial = {
  [`Systeme_Parties/${ID_PARTIE}`]: {
    ID_Partie: ID_PARTIE, Mot_De_Passe: "banc", Nom_Du_Groupe: "Le banc", Statut: "En_cours",
    Liste_ID_Personnage: "", Ordre_Initiative: HEROS.map(h => h.id),
    Phase_Combat: "Preparation", File_Attente_Combat: [], Tour_Combat: 1,
    Combattants_Hors_Jeu: [], Ont_Joue_Ce_Round: [],
    Spawn_Allies: { q: -3, r: 0 }, Spawn_Ennemis: { q: 3, r: 0 }
  },
  [`Combat_VTT/${ID_PARTIE}`]: {
    URL_Map: URL_ARENE, Taille_Hex: 60, Opacite_Grille: 0.8,
    Tuiles_Supprimees: [], Tuiles_Murs: ["0,-2", "0,-1"], Tuiles_Difficiles: ["1,1"],
    Tokens: Object.fromEntries(HEROS.map(h => [h.id, { q: h.q, r: h.r,
      url: `https://res.cloudinary.com/dlkjq4kvg/image/upload/v1/token_${h.id}.png`, taille: 55 }]))
  },
  "Date_En_Jeu/actuelle": { Jour: 1, Mois: 1, Annee: 1000, Heure: 8 },
  "MDP_Nouvelle_Partie/config": { Mot_De_Passe: "banc" }
};
Object.entries(JOUEURS).forEach(([id, j]) => { initial[`Joueurs/${id}`] = j; });
Object.entries(EFFETS).forEach(([id, e]) => { initial[`Combat_Effets/${id}`] = { ID_Effet: id, ...e }; });
Object.entries(GABARITS).forEach(([cle, g]) => { initial[`Monstres_Modeles/${cle}`] = g; });
HEROS.forEach(h => {
  initial[`Personnages/${h.id}`] = ficheHeros(h);
  Object.entries(cartes(h)).forEach(([cid, c]) => { initial[`Personnages/${h.id}/Competences/${cid}`] = c; });
  initial[`Caracteristiques/${h.id}`] = { force: 14, dex: 13, con: 13, int: 10, sag: 10, cha: 8 };
});

const base_ = creerFirestorePartage(initial);

// =========================================================================
//  LES TROIS APPAREILS
// =========================================================================
const SVG_PETIT = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="#6a4a2a"/></svg>`;
const SVG_ARENE = `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1800"><rect width="1800" height="1800" fill="#3b3024"/></svg>`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const navigateur = await chromium.launch();

const postes = [];
async function ouvrirPoste(idJoueur, nom) {
  const contexte = await navigateur.newContext({ viewport: { width: 1194, height: 834 } });
  await contexte.addInitScript(([id]) => {
    try {
      localStorage.setItem("ID_JOUEUR_COURANT", id);
      localStorage.setItem("ivalis_DEV_MODE", "off");
    } catch (e) {}
  }, [idJoueur]);
  const page = await contexte.newPage();
  const poste = { idJoueur, nom, page, erreurs: [], alertes: [], consoleErreurs: [] };
  page.on('pageerror', e => poste.erreurs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') poste.consoleErreurs.push(m.text()); });
  page.on('dialog', d => { poste.alertes.push(d.message()); d.dismiss().catch(() => {}); });
  await page.route('**', r => {
    const url = r.request().url();
    if (url.startsWith(base)) return r.continue();
    if (url.includes('firebase-firestore.js')) return r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: SOURCE_FAUX_SDK });
    if (url.includes('firebase-app.js')) return r.fulfill({ contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: SOURCE_FAUX_APP });
    if (url.includes('res.cloudinary.com')) {
      return r.fulfill({ contentType: 'image/svg+xml', headers: { 'Access-Control-Allow-Origin': '*' },
                         body: url.includes('arene_banc') ? SVG_ARENE : SVG_PETIT });
    }
    return r.abort();
  });
  await base_.brancherPage(page, nom);
  await page.goto(base + '/index.html');
  await page.waitForFunction(() => typeof window.validerMdpPartie === "function"
                                   && typeof window.ouvrirCombat === "function"
                                   && typeof window.regimeSuivreLaPartie === "function"
                                   && typeof window.genererRencontreMonstres === "function", null, { timeout: 20000 });
  postes.push(poste);
  return poste;
}

const nico = await ouvrirPoste("P_01", "Nico");
const ben = await ouvrirPoste("P_02", "Ben");
const adrien = await ouvrirPoste("P_03", "Adrien");

async function sur(poste, fn, arg) { return poste.page.evaluate(fn, arg); }
async function attendre(poste, fn, arg, ms = 15000, quoi = "") {
  try { await poste.page.waitForFunction(fn, arg, { timeout: ms, polling: 100 }); return true; }
  catch (e) { console.log(`   (⌛ ${poste.nom} : ${quoi || "condition"} pas atteinte en ${ms} ms)`); return false; }
}
const lirePartie = () => base_.lire(`Systeme_Parties/${ID_PARTIE}`);

console.log("\n=========================================================");
console.log("  1. LES TROIS APPAREILS REJOIGNENT LA PARTIE ET OUVRENT LE COMBAT");
console.log("=========================================================");
for (const poste of postes) {
  await sur(poste, async (idPartie) => {
    window.demanderMdpPartie(idPartie);
    document.getElementById("saisie-mdp-partie").value = "banc";
    await window.validerMdpPartie();
  }, ID_PARTIE);
}
for (const poste of postes) {
  const ok = await attendre(poste, () => window.PARTIE_DATA && (window.PERSOS_PARTIE || []).length >= 3
                                        && window.PLATEAU_VTT, null, 15000, "partie chargée");
  verifier(`${poste.nom} voit la partie et les trois héros`, ok);
}
for (const poste of postes) {
  await sur(poste, () => { window.ouvrirPopupRencontre(); window.validerPopupRencontre(); });
}
await dormir(800);
for (const poste of postes) {
  const vu = await sur(poste, () => ({
    fenetre: document.getElementById("fenetre-combat").style.display,
    mesHeros: (window.COMBAT_PERSOS_JOUEUR || []).map(h => h.idPersonnage),
    murs: Object.keys(window.PLATEAU_VTT.gridState).filter(k => window.PLATEAU_VTT.gridState[k].isBlocked)
  }));
  verifier(`${poste.nom} a la fenêtre de combat ouverte, avec SON héros`,
           vu.fenetre === "block" && vu.mesHeros.length === 1, JSON.stringify(vu.mesHeros));
  verifier(`${poste.nom} a reçu les murs de l'arène`, vu.murs.length === 2, JSON.stringify(vu.murs));
}

console.log("\n=========================================================");
console.log("  2. LE MJ GÉNÈRE LA RENCONTRE");
console.log("=========================================================");
const rencontre = await sur(nico, async () => {
  const r = await window.genererRencontreMonstres("Normale");
  return r ? { terrain: r.surLeTerrain.length, reserve: r.enReserve.length } : null;
});
console.log("   rencontre :", JSON.stringify(rencontre));
const idsMonstres = () => base_.lister("Monstres").filter(m => m.data.ID_Partie === ID_PARTIE).map(m => m.chemin.split("/")[1]);
// Les techniques se forgent en arrière-plan : on attend qu'elles soient là.
for (let i = 0; i < 80; i++) {
  const ids = idsMonstres();
  if (ids.length > 0 && ids.every(id => base_.lister(`Monstres/${id}/Competences`).length > 0)) break;
  await dormir(250);
}
const monstres = idsMonstres();
verifier("des créatures sont nées en base", monstres.length > 0, `${monstres.length}`);
verifier("chacune a ses techniques forgées",
         monstres.length > 0 && monstres.every(id => base_.lister(`Monstres/${id}/Competences`).length > 0),
         monstres.map(id => base_.lister(`Monstres/${id}/Competences`).length).join(","));
const ordre = (lirePartie().Ordre_Initiative || []);
verifier("l'ordre d'initiative compte héros ET créatures",
         HEROS.every(h => ordre.includes(h.id)) && monstres.every(id => ordre.includes(id)), JSON.stringify(ordre));
await base_.calme(300);
for (const poste of postes) {
  const ok = await attendre(poste, (ids) => ids.every(id => (window.PERSOS_PARTIE || []).some(p => p.idPersonnage === id)
                                                       && Object.keys((window.CACHE_COMPETENCES_GLOBAL || {})[id] || {}).length > 0),
                            monstres, 15000, "créatures et leurs techniques");
  verifier(`${poste.nom} voit les créatures et leurs techniques`, ok);
}

// =========================================================================
//  LES GESTES DU JOUEUR
// =========================================================================
// Choisir : ouvrir le volet, toucher la bannière, puis le bouton de fin de
// tour (qui affiche alors « choisir compétence »).
async function choisir(poste, suffixe) {
  return sur(poste, async (suffixe) => {
    const heros = (window.COMBAT_PERSOS_JOUEUR || [])[window.COMBAT_INDEX_PERSO];
    if (!heros) return { erreur: "aucun héros sur ce poste" };
    const idCarte = heros.idPersonnage + suffixe;
    if (!document.getElementById("combat-carte-" + idCarte)) return { erreur: "bannière absente", idCarte };
    window.toggleVoletCompetences(true);
    window.gererClicCarteCombat(idCarte);
    const mode = window.MODE_BOUTON_FINTOUR;
    await window.actionBoutonFinTour();
    return { idCarte, mode };
  }, suffixe);
}

// Jouer son tour : attendre que SON écran lui donne la main (il rejoue peut-être
// encore le tour d'avant), viser la créature la plus proche, résoudre. Sans
// cible possible, finir son tour.
async function jouerSonTour(poste, idHeros) {
  const pret = await attendre(poste, () => {
    if (typeof window.actualiserBoutonFinTour === "function") window.actualiserBoutonFinTour();
    return window.MODE_BOUTON_FINTOUR === "lancer" || window.MODE_BOUTON_FINTOUR === "fin_de_tour";
  }, null, 20000, `bouton prêt pour ${idHeros}`);
  if (!pret) {
    const vu = await sur(poste, () => ({ mode: window.MODE_BOUTON_FINTOUR,
      tete: (((window.PARTIE_DATA || {}).File_Attente_Combat) || [])[0] || null,
      mesHeros: (window.COMBAT_PERSOS_JOUEUR || []).map(h => h.idPersonnage) }));
    return { etat: "jamais la main", vu };
  }
  return sur(poste, async () => {
    const queue = (window.PARTIE_DATA || {}).File_Attente_Combat || [];
    const moi = queue[0] && queue[0].idPersonnage;
    if (window.MODE_BOUTON_FINTOUR === "fin_de_tour") { await window.actionBoutonFinTour(); return { etat: "fin de tour (rien à lancer)" }; }
    await window.actionBoutonFinTour();
    for (let i = 0; i < 20 && !(window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif); i++) await new Promise(r => setTimeout(r, 100));
    if (!(window.ETAT_CIBLAGE && window.ETAT_CIBLAGE.actif)) return { etat: "le ciblage ne s'ouvre pas" };
    const tk = window.TOKENS_VTT_DATA || {};
    const d = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs((-a.q - a.r) - (-b.q - b.r)));
    const ennemis = (window.PERSOS_PARTIE || [])
      .filter(p => p.estMonstre && !p.estIllusion && !window.estCombattantMort(p.idPersonnage) && tk[p.idPersonnage])
      .sort((a, b) => d(tk[moi], tk[a.idPersonnage]) - d(tk[moi], tk[b.idPersonnage]));
    for (const cible of ennemis) {
      window.ajouterCibleCiblage(cible.idPersonnage);
      if (window.ETAT_CIBLAGE.cibleUnique === cible.idPersonnage) {
        await window.declencherResolutionAvecBondEventuel();
        return { etat: "lancé", cible: cible.idPersonnage, distance: d(tk[moi], tk[cible.idPersonnage]) };
      }
    }
    // Personne à portée : on finit le tour sans lancer.
    window.actualiserBoutonFinTour();
    await window.actionBoutonFinTour();
    return { etat: "aucune cible à portée, tour fini" };
  });
}

const regardDe = (poste) => sur(poste, () => {
  const r = window.regimeDuJeu && window.regimeDuJeu();
  const e = r && r.etatAffiche && r.etatAffiche();
  return e ? { phase: e.phase, manche: e.manche, tete: e.file && e.file[0] ? e.file[0].id : null,
               file: (e.file || []).map(f => f.id) } : null;
});
const posteDe = (idHeros) => postes.find(p => HEROS.find(h => h.id === idHeros && h.joueur === p.idJoueur));

// LE TAP SUR L'ÉCRAN. Chaque tour qui n'est pas le sien s'annonce dans l'encart
// de tour et attend un tap n'importe où (le voile transparent, #voile-tour-combat)
// pour se dérouler sur CET écran. Un joueur attentif tape dès que l'encart
// paraît ; on note au passage si le voile acceptait bien le tap à ce moment-là.
for (const poste of postes) {
  await sur(poste, () => {
    window.__TAPS_IMPOSSIBLES = [];
    setInterval(() => {
      if (!window.EVENEMENT_ATTENDU || typeof window.jouerSequenceTour !== "function") return;
      const voile = document.getElementById("voile-tour-combat");
      const style = voile ? getComputedStyle(voile) : null;
      if (!style || style.display === "none" || style.pointerEvents === "none") {
        window.__TAPS_IMPOSSIBLES.push(window.EVENEMENT_ATTENDU.acteur + "#" + window.EVENEMENT_ATTENDU.n);
        return;
      }
      voile.click();
    }, 350);
  });
}

// LA FACTURE FIRESTORE d'un moment du combat, lue comme Firebase la compte.
function afficherFacture(titre, f) {
  const total = base_.totalFactures(f);
  console.log(`   💰 ${titre} : ${total.lectures} lectures, ${total.ecritures} écritures, ${total.suppressions} suppressions`);
  const parCollection = {};
  for (const sorte of ["lectures", "ecritures"]) {
    for (const [cle, n] of Object.entries(f[sorte] || {})) {
      const coll = cle.split("|")[1];
      const k = (sorte === "lectures" ? "lu    " : "écrit ") + coll;
      parCollection[k] = (parCollection[k] || 0) + n;
    }
  }
  Object.entries(parCollection).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .forEach(([k, n]) => console.log(`        ${String(n).padStart(6)}  ${k}`));
  return total;
}
const FACTURES_MANCHES = [];

// =========================================================================
//  PLUSIEURS MANCHES, DE BOUT EN BOUT
// =========================================================================
const MANCHES = parseInt(process.env.MANCHES_COMBAT_COMPLET || "3");
for (let manche = 1; manche <= MANCHES; manche++) {
  const facturesDebut = base_.factures();
  console.log("\n=========================================================");
  console.log(`  MANCHE ${manche} — 3. CHACUN CHOISIT SA TECHNIQUE`);
  console.log("=========================================================");
  // Chacun attend que SON écran soit revenu à la préparation.
  for (const poste of postes) {
    await attendre(poste, (m) => {
      const p = window.PARTIE_DATA || {};
      return (p.Phase_Combat || "Preparation") === "Preparation" && (parseInt(p.Tour_Combat) || 1) === m;
    }, manche, 20000, `préparation de la manche ${manche}`);
    const r = await choisir(poste, manche % 2 === 1 ? "_TIR" : "_FRAPPE");
    verifier(`${poste.nom} retient sa technique (bouton « choisir compétence »)`,
             r && !r.erreur && r.mode === "choisir_competence", JSON.stringify(r));
  }

  let partie = null;
  for (let i = 0; i < 120; i++) {
    partie = lirePartie();
    if (partie.Phase_Combat === "Resolution") break;
    await dormir(250);
  }
  const ordreManche = (partie.Ordre_Initiative || []).filter(id => !(partie.Combattants_Hors_Jeu || []).includes(id));
  console.log("   file :", JSON.stringify((partie.File_Attente_Combat || []).map(f => `${f.idPersonnage}:${f.idCarte}:${f.initiative}`)));
  verifier("tout le monde a posé sa carte (héros ET créatures)",
           ordreManche.every(id => (partie.File_Attente_Combat || []).some(f => f.idPersonnage === id)
                                   || (partie.Ont_Joue_Ce_Round || []).includes(id)),
           JSON.stringify(partie.Ont_Joue_Ce_Round));
  verifier(`LA PHASE BASCULE EN RÉSOLUTION (manche ${manche})`, partie.Phase_Combat === "Resolution", partie.Phase_Combat);
  if (partie.Phase_Combat !== "Resolution") break;

  console.log(`\n  MANCHE ${manche} — 4. LE CERVEAU OUVRE LA MANCHE`);
  let etatsPostes = [];
  for (let i = 0; i < 60; i++) {
    etatsPostes = await Promise.all(postes.map(p => sur(p, () => {
      const r = window.regimeDuJeu && window.regimeDuJeu();
      const e = r && r.etatAffiche && r.etatAffiche();
      return { cerveau: !!(r && r.jeSuisLeCerveau && r.jeSuisLeCerveau()),
               phase: e ? e.phase : null, manche: e ? e.manche : null,
               tete: e && e.file && e.file[0] ? e.file[0].id : null };
    })));
    if (etatsPostes.every(e => e.phase === "Resolution" && e.manche === manche)) break;
    await dormir(250);
  }
  postes.forEach((p, i) => console.log(`   ${p.nom.padEnd(7)} ${JSON.stringify(etatsPostes[i])}`));
  verifier("exactement UN poste tient le cerveau", etatsPostes.filter(e => e.cerveau).length === 1,
           etatsPostes.map(e => e.cerveau).join(","));
  verifier(`les trois postes affichent la manche ${manche} en résolution`,
           etatsPostes.every(e => e.phase === "Resolution" && e.manche === manche),
           etatsPostes.map(e => `${e.phase}/${e.manche}`).join(","));

  console.log(`\n  MANCHE ${manche} — 5. LA MANCHE SE JOUE JUSQU'AU BOUT`);
  const tetes = [];
  let bloque = null;
  for (let pas = 0; pas < 40; pas++) {
    const regard = await regardDe(nico);
    if (!regard) { bloque = "aucun état affiché"; break; }
    if (regard.phase !== "Resolution" || regard.manche !== manche) break;
    if (tetes[tetes.length - 1] !== regard.tete) tetes.push(regard.tete);
    const heros = HEROS.find(h => h.id === regard.tete);
    if (heros) {
      const r = await jouerSonTour(posteDe(heros.id), heros.id);
      console.log(`   ${heros.prenom} joue :`, JSON.stringify(r));
    }
    // On laisse le cerveau publier, les écrans rejouer, les créatures agir.
    const avant = regard.tete;
    let change = false;
    for (let i = 0; i < 100; i++) {
      await dormir(200);
      const apres = await regardDe(nico);
      if (!apres || apres.phase !== "Resolution" || apres.manche !== manche || apres.tete !== avant) { change = true; break; }
    }
    if (!change) { bloque = `le tour de ${avant} ne se termine jamais`; break; }
  }
  console.log("   ordre de passage :", tetes.join(" → "));
  verifier(`la manche ${manche} va au bout sans rester bloquée`, !bloque, bloque || "");
  if (bloque) break;
  let finManche = null;
  for (let i = 0; i < 60; i++) {
    finManche = lirePartie();
    if (finManche.Phase_Combat === "Preparation" && (parseInt(finManche.Tour_Combat) || 1) === manche + 1) break;
    await dormir(250);
  }
  FACTURES_MANCHES.push(afficherFacture(`manche ${manche}`, base_.ecartFactures(facturesDebut, base_.factures())));
  verifier(`la main revient aux joueurs pour la manche ${manche + 1}`,
           finManche.Phase_Combat === "Preparation" && (parseInt(finManche.Tour_Combat) || 1) === manche + 1,
           `${finManche.Phase_Combat} / manche ${finManche.Tour_Combat}`);
  if (finManche.Phase_Combat !== "Preparation") break;
}

console.log("\n=========================================================");
console.log("  7. LA TABLE ATTEND : QUE COÛTE UNE MINUTE SANS RIEN JOUER ?");
console.log("=========================================================");
{
  const MS = parseInt(process.env.MESURE_ATTENTE_MS || "30000");
  const avant = base_.factures();
  await dormir(MS);
  const f = base_.ecartFactures(avant, base_.factures());
  const total = afficherFacture(`${MS / 1000} s d'attente en préparation`, f);
  const parHeure = (n) => Math.round(n * 3600000 / MS);
  console.log(`   ⏱️  soit ${parHeure(total.lectures)} lectures et ${parHeure(total.ecritures)} écritures PAR HEURE, sans que personne ne joue`);
  globalThis.__ATTENTE_PAR_HEURE = { lectures: parHeure(total.lectures), ecritures: parHeure(total.ecritures) };
  // Le plafond : trois appareils qui attendent ne doivent pas dépasser ce que
  // coûtent le battement (une écriture toutes les dix secondes) et ses échos.
  // Avant la correction, c'était 8 640 lectures par heure au bout de trois
  // manches — et ça grossissait à chaque intention.
  verifier("attendre ne coûte plus que le battement et ses échos",
           parHeure(total.lectures) <= 2500 && parHeure(total.ecritures) <= 500,
           `${parHeure(total.lectures)} lectures/h, ${parHeure(total.ecritures)} écritures/h`);
}

console.log("\n=========================================================");
console.log("  8. LE QUOTA FIREBASE S'ÉPUISE : LA TABLE LE SAIT");
console.log("=========================================================");
// Ce que la table a vécu : Firestore refuse toutes les écritures
// (« resource-exhausted »). Un joueur choisit sa carte. Avant, le volet se
// refermait, le deck se grisait, et la carte n'arrivait jamais dans la file —
// sans un mot à l'écran.
{
  const vivants = [];
  for (const p of postes) {
    const vivant = await sur(p, () => {
      const h = (window.COMBAT_PERSOS_JOUEUR || [])[window.COMBAT_INDEX_PERSO];
      return !!h && !(typeof window.estCombattantMort === "function" && window.estCombattantMort(h.idPersonnage))
             && (((window.PARTIE_DATA || {}).Phase_Combat) || "Preparation") === "Preparation";
    });
    if (vivant) vivants.push(p);
  }
  const joueur = vivants[0];
  verifier("un joueur encore debout peut choisir sa carte", !!joueur, vivants.map(p => p.nom).join(","));
  if (joueur) {
    const idHeros = HEROS.find(h => h.joueur === joueur.idJoueur).id;
    base_.refuserEcritures("resource-exhausted");
    const r = await choisir(joueur, "_TIR");
    const vu = await sur(joueur, () => {
      const bandeau = document.getElementById("bandeau-quota-firestore");
      const deck = document.getElementById("combat-liste-competences");
      return {
        bandeau: !!bandeau && getComputedStyle(bandeau).display !== "none",
        texte: bandeau ? bandeau.innerText : "",
        voletOuvert: window.VOLET_COMPETENCES_OUVERT === true,
        deckActif: !!deck && deck.style.opacity !== "0.4" && deck.style.pointerEvents !== "none"
      };
    });
    const apres = lirePartie();
    verifier(`${joueur.nom} voit le bandeau « quota épuisé » à l'écran`, vu.bandeau, vu.texte.slice(0, 60));
    verifier("le bandeau dit quand ça reviendra (9 h, heure de Paris)", /9\s*h/.test(vu.texte));
    verifier("sa carte ne fait pas semblant d'être partie : le deck se rouvre",
             vu.voletOuvert && vu.deckActif, JSON.stringify({ volet: vu.voletOuvert, deck: vu.deckActif }));
    verifier("et rien n'est inscrit dans la file",
             !(apres.File_Attente_Combat || []).some(f => f.idPersonnage === idHeros), JSON.stringify(r));

    // Le quota revient : le même geste passe, sans rien avoir à recharger.
    base_.refuserEcritures(null);
    const r2 = await choisir(joueur, "_TIR");
    let inscrit = false;
    for (let i = 0; i < 40 && !inscrit; i++) {
      inscrit = (lirePartie().File_Attente_Combat || []).some(f => f.idPersonnage === idHeros);
      if (!inscrit) await dormir(100);
    }
    verifier("le quota revenu, le même geste inscrit la carte", inscrit, JSON.stringify(r2));
  }
}

console.log("\n=========================================================");
console.log("  6. AUCUNE ERREUR, AUCUNE ALERTE");
console.log("=========================================================");
for (const poste of postes) {
  const tapsImpossibles = await sur(poste, () => [...new Set(window.__TAPS_IMPOSSIBLES || [])]);
  verifier(`${poste.nom} : chaque tour en attente pouvait être lancé d'un tap`,
           tapsImpossibles.length === 0, tapsImpossibles.slice(0, 4).join(", "));
  verifier(`${poste.nom} : aucune exception JavaScript`, poste.erreurs.length === 0, poste.erreurs.slice(0, 3).join(" | "));
  verifier(`${poste.nom} : aucune alerte à l'écran`, poste.alertes.length === 0, poste.alertes.slice(0, 2).join(" | "));
  // Les refus du chapitre 8 sont voulus : le quota y est épuisé exprès, et le
  // jeu doit justement le dire en console ET à l'écran. Tout le reste compte.
  const graves = poste.consoleErreurs.filter(t => !/net::|Failed to load resource|ERR_FAILED|favicon/i.test(t)
                                                   && !/Quota exceeded|resource-exhausted/i.test(t));
  verifier(`${poste.nom} : aucune erreur en console`, graves.length === 0, graves.slice(0, 3).join(" | "));
}

if (TRACE) {
  const lignes = [];
  for (const poste of postes) {
    const t = await sur(poste, () => (window.TRACE_COMBAT || []).join("\n")).catch(() => "");
    lignes.push(`===== ${poste.nom} =====\n${t}\n----- erreurs console -----\n${poste.consoleErreurs.join("\n")}`);
  }
  fs.writeFileSync(TRACE, lignes.join("\n\n"));
  console.log("   trace écrite dans", TRACE);
}

await navigateur.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
