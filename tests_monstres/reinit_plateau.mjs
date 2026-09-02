// LA RÉINITIALISATION VIDE LE PLATEAU DE TOUS SES PIONS.
// Les créatures, les illusions et les fantômes disparaissaient bien, mais les
// pions des héros restaient où ils étaient : les nouveaux repères d'apparition
// n'avaient alors plus aucun effet pour leur camp. Ce banc joue la VRAIE
// fonction de réinitialisation devant un faux Firestore et regarde ce qu'elle
// écrit — en particulier qu'elle ne touche pas aux murs ni au terrain de la carte.
import fs from 'fs';

const src = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
const lignes = src.split('\n');
const d = lignes.findIndex(l => l.startsWith('window.reinitialiserCombat = async function'));
let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === '};') { f = i; break; } }
const fnReset = lignes.slice(d, f + 1).join('\n');

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
    { idPersonnage: "J1", camp: "Allié", PV_Max: 42, Fatigue_Max: 100 },
    { idPersonnage: "J2", camp: "Allié", PV_Max: 38, Fatigue_Max: 100 }
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
  return {
    pionsRestants: Object.keys(window.TOKENS_VTT_DATA),
    tokensAppliques: window.TOKENS_APPLIQUES,
    selection: window.TOKEN_SELECTIONNE,
    ecrituresVTT: surVTT,
    setDocsVTT: journal.setDocs.filter(e => e.chemin.startsWith("Combat_VTT")),
    ecriturePartie: (journal.ecritures.find(e => e.chemin.startsWith("Systeme_Parties")) || {}).maj,
    apparitionRedemandee: !!window.APPARITION_REDEMANDEE,
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
verifier("le combat repasse au tour 1, file vide",
         res.ecriturePartie && res.ecriturePartie.Tour_Combat === 1
                            && res.ecriturePartie.File_Attente_Combat.length === 0);

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
