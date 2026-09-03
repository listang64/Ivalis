// LA RÉINITIALISATION VIDE LE PLATEAU DE TOUS SES PIONS.
// Les créatures, les illusions et les fantômes disparaissaient bien, mais les
// pions des héros restaient où ils étaient : les nouveaux repères d'apparition
// n'avaient alors plus aucun effet pour leur camp. Ce banc joue la VRAIE
// fonction de réinitialisation devant un faux Firestore et regarde ce qu'elle
// écrit — en particulier qu'elle ne touche pas aux murs ni au terrain de la carte.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';

const src = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
const lignes = src.split('\n');
function fonctionCombat(marqueur) {
  const i = lignes.findIndex(l => l.startsWith(marqueur));
  if (i < 0) throw new Error("introuvable dans combat.js : " + marqueur);
  let j = i; for (let k = i + 1; k < lignes.length; k++) { if (lignes[k] === '};') { j = k; break; } }
  return lignes.slice(i, j + 1).join('\n');
}
const fnReset = fonctionCombat('window.reinitialiserCombat = async function');
// L'enchaînement d'après la réinitialisation : les repères posés déclenchent le
// déploiement des héros puis la demande de difficulté.
const fnReperes = fonctionCombat('window.enregistrerPointsApparition = async function')
                + '\n' + fonctionCombat('window.deployerCombatApresReperes = async function');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
await p.route('https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js', route => route.fulfill({
  contentType: 'application/javascript',
  headers: { 'Access-Control-Allow-Origin': '*' },
  body: `
    export const doc = (...a) => window.__fs.doc(...a);
    export const getDoc = (...a) => window.__fs.getDoc(...a);
    export const updateDoc = (...a) => window.__fs.updateDoc(...a);
    export const setDoc = (...a) => window.__fs.setDoc(...a);
    export const deleteDoc = (...a) => window.__fs.deleteDoc(...a);
    export const deleteField = (...a) => window.__fs.deleteField(...a);
  `
}));
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(200);
// Les lectures de stats mutualisées vivent dans app.js, chargé avant tout le
// reste sur la vraie page : un banc qui isole une fonction doit les poser aussi.
await p.evaluate(src => eval(src), SRC_STATS_COMMUNES);

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const res = await p.evaluate(async (fnSrc) => {
  const journal = { ecritures: [], setDocs: [] };

  window.__fs = {
    doc: (...a) => ({ chemin: a.slice(1).join("/") }),
    getDoc: async () => ({ exists: () => true, data: () => ({ Ordre_Initiative: ["J1", "J2"] }) }),
    updateDoc: async (ref, maj) => { journal.ecritures.push({ chemin: ref.chemin, maj }); },
    setDoc: async (ref, maj, opts) => { journal.setDocs.push({ chemin: ref.chemin, maj, opts }); },
    deleteDoc: async () => {},
    deleteField: () => "«champ supprimé»"
  };

  window.confirm = () => true;
  window.jouerSonClic = () => {};
  window.ID_PARTIE_COURANTE = "PARTIE_TEST";
  window.PARTIE_DATA = { Spawn_Allies: { q: 5, r: 3 }, Spawn_Ennemis: { q: 12, r: 3 } };
  window.PERSOS_PARTIE = [
    { idPersonnage: "J1", camp: "Allié", PV_Max: 42, PV_Actuels: 5, Fatigue_Max: 100,
      fatigueActuelle: 10, Bouclier_Actuel: 8, Bouclier_Max: 8,
      Etats_Alteres: [{ nom: "Empoisonnement", duree: 3 }, { nom: "Brûlé", duree: 2 }] },
    { idPersonnage: "J2", camp: "Allié", PV_Max: 38, PV_Actuels: 20, Fatigue_Max: 100,
      fatigueActuelle: 40, Etats_Alteres: [{ nom: "Peur", duree: 1 }] }
  ];
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
  window.COMBAT_INDEX_PERSO = 0;
  window.TOKENS_VTT_DATA = { J1: { q: 5, r: 3 }, J2: { q: 6, r: 3 }, MONSTRE_x: { q: 12, r: 3 } };
  window.refCombattant = (id) => ({ chemin: "Personnages/" + id });
  window.sauvegarderZonesPersistantes = async () => {};
  window.appliquerZonesPersistantes = () => {};
  window.nettoyerMonstresCombat = async () => { delete window.TOKENS_VTT_DATA.MONSTRE_x; };
  window.TOKENS_APPLIQUES = null;
  window.appliquerTokensVTT = (t) => { window.TOKENS_APPLIQUES = JSON.parse(JSON.stringify(t)); };
  window.mettreAJourJaugePV = () => {}; window.mettreAJourJaugeFatigue = () => {};
  window.verifierChangementTour = () => {};
  window.TOKEN_SELECTIONNE = "J1";
  window.verifierPointsApparition = () => { window.APPARITION_REDEMANDEE = true; };

  const db = { faux: true };
  eval(fnSrc);
  window.__erreurs = [];
  const consoleErreur = console.error;
  console.error = (...a) => { window.__erreurs.push(a.map(String).join(' ')); consoleErreur(...a); };
  try { await window.reinitialiserCombat(); } catch (e) { window.__erreurs.push('LEVÉE: ' + e.message); }

  const surVTT = journal.ecritures.filter(e => e.chemin.startsWith("Combat_VTT"));
  const surCombattants = journal.ecritures.filter(e => e.chemin.startsWith("Personnages/"));
  return {
    etatsMemoire: window.PERSOS_PARTIE.map(x => (x.Etats_Alteres || []).length),
    etatsPanneau: (window.COMBAT_PERSOS_JOUEUR[0].Etats_Alteres || []).length,
    soins: surCombattants.map(e => e.chemin + " → PV " + e.maj.PV_Actuels
                                 + ", états " + JSON.stringify(e.maj.Etats_Alteres)),
    pionsRestants: Object.keys(window.TOKENS_VTT_DATA),
    tokensAppliques: window.TOKENS_APPLIQUES,
    selection: window.TOKEN_SELECTIONNE,
    ecrituresVTT: surVTT,
    setDocsVTT: journal.setDocs.filter(e => e.chemin.startsWith("Combat_VTT")),
    ecriturePartie: (journal.ecritures.find(e => e.chemin.startsWith("Systeme_Parties")) || {}).maj,
    apparitionRedemandee: !!window.APPARITION_REDEMANDEE,
    deploiementDemande: window.DEPLOIEMENT_APRES_REPERES === true,
    erreursInternes: window.__erreurs
  };
}, fnReset);

console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");
console.log("     écritures sur Combat_VTT :", JSON.stringify(res.ecrituresVTT));

const vidage = res.ecrituresVTT.find(e => e.maj && e.maj.Tokens !== undefined);

verifier("la réinitialisation va au bout sans erreur", res.erreursInternes.length === 0,
         res.erreursInternes.join(" | "));
verifier("plus aucun pion en mémoire après la réinitialisation",
         res.pionsRestants.length === 0, `(${res.pionsRestants.join(",") || "aucun"})`);
verifier("le plateau est redessiné vide", res.tokensAppliques && Object.keys(res.tokensAppliques).length === 0);
verifier("plus rien n'est sélectionné", res.selection === null, `(${res.selection})`);
verifier("le champ Tokens est vidé en base", !!vidage && JSON.stringify(vidage.maj.Tokens) === "{}",
         vidage ? JSON.stringify(vidage.maj) : "(aucune écriture)");
verifier("par une mise à jour de champ, pas un écrasement du document",
         res.setDocsVTT.length === 0, `(${res.setDocsVTT.length} setDoc)`);
verifier("les murs et le terrain de la carte ne sont pas touchés",
         res.ecrituresVTT.every(e => !("Tuiles_Murs" in (e.maj || {}))
                                  && !("Tuiles_Difficiles" in (e.maj || {}))
                                  && !("Tuiles_Supprimees" in (e.maj || {}))));
verifier("les repères d'apparition sont effacés en base",
         res.ecriturePartie && res.ecriturePartie.Spawn_Allies === "«champ supprimé»"
                            && res.ecriturePartie.Spawn_Ennemis === "«champ supprimé»");
verifier("et redemandés dans la foulée", res.apparitionRedemandee);
verifier("la réinitialisation annonce un déploiement complet derrière",
         res.deploiementDemande);
console.log("     soins :", res.soins.join(" | ") || "aucun");
verifier("les altérations sont effacées en mémoire",
         res.etatsMemoire.every(n => n === 0), `(${res.etatsMemoire.join(",")})`);
verifier("et sur la copie du panneau gauche", res.etatsPanneau === 0, `(${res.etatsPanneau})`);
verifier("chaque combattant est soigné ET débarrassé de ses états en base",
         res.soins.length === 2 && res.soins.every(t => t.endsWith("états []")),
         `(${res.soins.length} écriture(s))`);
verifier("le combat repasse au tour 1, file vide",
         res.ecriturePartie && res.ecriturePartie.Tour_Combat === 1
                            && res.ecriturePartie.File_Attente_Combat.length === 0);

// =========================================================================
// Poser les deux repères après une réinitialisation doit enchaîner tout seul :
// les héros se déploient, puis la rencontre demande sa difficulté. C'était
// jusqu'ici deux clics à faire à la main, et ils passaient facilement à la
// trappe — un combat sans pions ni ennemis en attendant.
console.log("\nAPRÈS LES REPÈRES : DÉPLOIEMENT ET RENCONTRE");
const suite = await p.evaluate(async (fnSrc) => {
  const journal = { ordre: [], ecritures: [] };
  window.__fs = {
    doc: (...a) => ({ chemin: a.slice(1).join("/") }),
    updateDoc: async (ref, maj) => { journal.ecritures.push({ chemin: ref.chemin, maj }); }
  };
  const db = { faux: true };
  const updateDoc = window.__fs.updateDoc;
  const doc = window.__fs.doc;

  window.ID_PARTIE_COURANTE = "PARTIE_TEST";
  window.PARTIE_DATA = {};
  window.genererTokensCombat = async () => { journal.ordre.push("heros"); };
  window.ouvrirGenerationRencontre = () => { journal.ordre.push("rencontre"); };
  eval(fnSrc);

  // 1. Sans réinitialisation derrière : poser des repères ne déclenche rien.
  window.DEPLOIEMENT_APRES_REPERES = false;
  await window.enregistrerPointsApparition({ q: 1, r: 1 }, { q: 9, r: 1 });
  const sansReset = [...journal.ordre];

  // 2. Après une réinitialisation : les deux étapes s'enchaînent, dans l'ordre.
  journal.ordre.length = 0;
  window.DEPLOIEMENT_APRES_REPERES = true;
  await window.enregistrerPointsApparition({ q: 2, r: 2 }, { q: 8, r: 2 });
  const avecReset = [...journal.ordre];

  // 3. Le drapeau est consommé : replacer les repères ensuite ne rejoue rien.
  journal.ordre.length = 0;
  await window.enregistrerPointsApparition({ q: 3, r: 3 }, { q: 7, r: 3 });
  const secondPlacement = [...journal.ordre];

  return { sansReset, avecReset, secondPlacement,
           reperesEnMemoire: window.PARTIE_DATA.Spawn_Allies,
           ecritures: journal.ecritures.length,
           drapeau: window.DEPLOIEMENT_APRES_REPERES };
}, fnReperes);

verifier("hors réinitialisation, poser des repères ne déclenche rien",
         suite.sansReset.length === 0, `(${suite.sansReset.join(",") || "rien"})`);
verifier("après une réinitialisation, héros PUIS rencontre s'enchaînent",
         suite.avecReset.join(",") === "heros,rencontre", `(${suite.avecReset.join(",") || "rien"})`);
verifier("le drapeau est consommé une seule fois",
         suite.secondPlacement.length === 0 && suite.drapeau === false,
         `(${suite.secondPlacement.join(",") || "rien"})`);
verifier("les repères restent écrits en mémoire avant l'aller-retour réseau",
         suite.reperesEnMemoire && suite.reperesEnMemoire.q === 3);
verifier("et enregistrés en base à chaque fois", suite.ecritures === 3, `(${suite.ecritures})`);

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
