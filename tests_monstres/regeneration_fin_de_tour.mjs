// LA RÉGÉNÉRATION NE DOIT SE DÉCLENCHER QU'AU PASSAGE AU TOUR SUIVANT.
//
// Nico a demandé de vérifier précisément ce point : la régénération est-elle
// bien appliquée à la FIN DU ROUND (quand le dernier combattant de la file a
// joué et qu'on repasse au tour suivant), et jamais entre deux cartes d'un
// même round ? Le code la place dans un bloc `if (finDuRound)`, à l'intérieur
// de finDeTourCombat — ce banc rejoue la VRAIE fonction dans les deux cas de
// figure et lit les montants réellement écrits, pas seulement "une écriture a
// eu lieu".
//
// Il vérifie aussi le nouveau socle de régénération (35, au lieu de 30) aux
// deux endroits où un héros l'obtient : la conversion Firestore -> front d'une
// fiche qui n'a pas encore ce champ, et l'écriture faite à la validation des
// caractéristiques d'un héros tout neuf.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { SRC_MODIFIER_PARTIE } from './transaction_partie.mjs';

function extraire(fichier, marqueur, finLigne = '};') {
  const lignes = fs.readFileSync('/home/user/Ivalis/' + fichier, 'utf-8').split('\n');
  const d = lignes.findIndex(l => l.startsWith(marqueur));
  if (d < 0) throw new Error(`${marqueur} introuvable dans ${fichier}`);
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}

const SRC_FIN_DE_TOUR = extraire('combat.js', 'window.finDeTourCombat = async function');
const SRC_CONVERSION = extraire('app.js', 'function persoDocVersFront(id, d) {', '}');
const SRC_VALIDATION_CARACS = extraire('app.js', 'window.validerCreationCaracs = async function');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
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
    export class FieldPath { constructor(...segments) { this.segments = segments; } }
    export const writeBatch = (...a) => window.__fs.writeBatch(...a);
  `
}));
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes("Failed to load resource") && !m.text().includes("blocked by CORS")) erreurs.push("console: " + m.text()); });
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(200);
await p.evaluate(src => eval(src), SRC_STATS_COMMUNES);

let echecsLocaux = 0;
const verif = (l, c, d = "") => { if (!c) { echecs++; echecsLocaux++; } console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// Rejoue finDeTourCombat avec une file d'attente à un ou deux combattants : le
// premier scénario termine le round (finDuRound), le second non.
const jouerFinDeTour = ({ fileDepart, idQuiTermine }) => p.evaluate(async ({ fnSrc, srcModifierPartie, fileDepart, idQuiTermine }) => {
  const journal = { ecrituresBatch: [], ecrituresUnitaires: [], partie: null, lotTente: false };

  window.__fs = {
    doc: (...a) => ({ chemin: a.slice(1).join("/") }),
    getDoc: async () => ({ exists: () => true, data: () => ({}) }),
    updateDoc: async (ref, maj) => { journal.ecrituresUnitaires.push([ref.chemin, maj]); },
    setDoc: async () => {}, deleteDoc: async () => {}, deleteField: () => ({}),
    writeBatch: () => ({
      // On capture VRAIMENT le contenu, contrairement au banc général qui ne
      // regarde que "le lot a été tenté" : c'est le montant de régénération
      // qu'on veut lire ici.
      update: (ref, maj) => { journal.ecrituresBatch.push([ref.chemin, maj]); },
      commit: async () => { journal.lotTente = true; }
    })
  };

  window.db = {};
  window.ID_PARTIE_COURANTE = "GAME_1";

  const partagee = { doc: { File_Attente_Combat: fileDepart, Phase_Combat: "Resolution", Tour_Combat: 3 } };
  const runTransaction = async (_db, fn) => fn({
    get: async () => ({ exists: () => true, data: () => JSON.parse(JSON.stringify(partagee.doc)) }),
    update: (_r, maj) => { Object.assign(partagee.doc, JSON.parse(JSON.stringify(maj))); journal.partie = maj; }
  });
  new Function('window', 'db', 'doc', 'runTransaction', srcModifierPartie)(window, {}, () => ({}), runTransaction);
  window.PARTIE_DATA = partagee.doc;
  window.PEUT_PASSER_TOUR = true;
  window.ZONES_PERSISTANTES = {};

  // Fatigue_Max 100, Regeneration 40% : 40 points attendus par régénération.
  // PV à moitié pour que la mort ne s'en mêle pas (statut "Vivant" explicite).
  window.PERSOS_PARTIE = [
    { idPersonnage: "J1", prenom: "Pliors", statut: "Vivant", PV_Max: 42, PV_Actuels: 30,
      Fatigue_Max: 100, fatigueActuelle: 20, Regeneration: 40, Etats_Alteres: [] },
    { idPersonnage: "J2", prenom: "Jade", statut: "Vivant", PV_Max: 42, PV_Actuels: 42,
      Fatigue_Max: 100, fatigueActuelle: 90, Regeneration: 40, Etats_Alteres: [] },   // proche du plafond
    { idPersonnage: "J3", prenom: "Mémé", statut: "Mort", PV_Max: 42, PV_Actuels: 0,
      Fatigue_Max: 100, fatigueActuelle: 10, Regeneration: 40, Etats_Alteres: [] },   // ne doit rien recevoir
    { idPersonnage: "M1", prenom: "Gnoll", statut: "Vivant", estMonstre: true, PV_Max: 70, PV_Actuels: 70,
      Fatigue_Max: 120, fatigueActuelle: 60, Regeneration: 40, Etats_Alteres: [] }
  ];
  window.COMBAT_PERSOS_JOUEUR = [window.PERSOS_PARTIE[0]];
  window.COMBAT_INDEX_PERSO = 0;
  window.refCombattant = (id) => ({ chemin: (id.startsWith("M") ? "Monstres/" : "Personnages/") + id });
  window.afficherPisteInitiative = () => {};
  window.mettreAJourJaugeFatigue = () => {}; window.mettreAJourJaugePV = () => {};
  window.afficherMessageFlottantHex = () => {}; window.afficherFlashDegatToken = () => {};
  window.appliquerZonesPersistantes = () => {}; window.sauvegarderZonesPersistantes = async () => {};
  window.jouerSonClic = () => {};

  eval(fnSrc);
  try { await window.finDeTourCombat(true, idQuiTermine); } catch (e) { journal.erreur = String(e); }
  await new Promise(r => setTimeout(r, 900));   // le corps s'exécute après 350 ms

  return {
    journal,
    fatigues: Object.fromEntries(window.PERSOS_PARTIE.map(x => [x.idPersonnage, x.fatigueActuelle]))
  };
}, { fnSrc: SRC_FIN_DE_TOUR, srcModifierPartie: SRC_MODIFIER_PARTIE, fileDepart, idQuiTermine });

// =========================================================================
console.log("1. UNE CARTE QUI NE TERMINE PAS LE ROUND NE RÉGÉNÈRE RIEN");
{
  // Deux combattants dans la file : J1 joue, mais M1 doit encore jouer avant
  // que le round soit terminé.
  const r = await jouerFinDeTour({
    fileDepart: [{ idPersonnage: "J1", idCarte: "C1" }, { idPersonnage: "M1", idCarte: "C2" }],
    idQuiTermine: "J1"
  });
  verif("le tour avance sans repasser à un nouveau round",
        r.journal.partie && r.journal.partie.Phase_Combat === "Resolution",
        `(${r.journal.partie ? r.journal.partie.Phase_Combat : "rien"})`);
  verif("le lot de fin de round n'est même pas tenté", r.journal.lotTente === false);
  verif("aucune écriture de fatigue n'a lieu pour personne",
        r.journal.ecrituresBatch.length === 0, `(${r.journal.ecrituresBatch.length} écriture(s))`);
  verif("la fatigue de J1 est donc inchangée en mémoire",
        r.fatigues.J1 === 20, `(${r.fatigues.J1})`);
}

// =========================================================================
console.log("\n2. LA CARTE QUI TERMINE LE ROUND RÉGÉNÈRE TOUT LE MONDE, UNE FOIS");
{
  const r = await jouerFinDeTour({
    fileDepart: [{ idPersonnage: "J1", idCarte: "C1" }],
    idQuiTermine: "J1"
  });
  verif("le round est bien terminé, le tour a avancé",
        r.journal.partie && r.journal.partie.Tour_Combat === 4,
        `(tour ${r.journal.partie && r.journal.partie.Tour_Combat})`);
  verif("le lot de fin de round est écrit", r.journal.lotTente === true);

  const parId = Object.fromEntries(r.journal.ecrituresBatch.map(([chemin, maj]) => [chemin.split("/")[1], maj]));
  verif("J1 (20 + 40% de 100 = 60) reçoit exactement sa régénération",
        parId.J1 && parId.J1.Fatigue_Actuelle === 60, `(${parId.J1 && parId.J1.Fatigue_Actuelle})`);
  verif("J2, déjà presque plein, plafonne à Fatigue_Max sans déborder",
        parId.J2 && parId.J2.Fatigue_Actuelle === 100, `(${parId.J2 && parId.J2.Fatigue_Actuelle})`);
  verif("un combattant tombé ne reçoit rien du tout",
        parId.J3 === undefined, parId.J3 ? `(a reçu ${JSON.stringify(parId.J3)})` : "(rien reçu, correct)");
  verif("les monstres régénèrent avec la même règle que les héros (60 + 40% de 120 = 108)",
        parId.M1 && parId.M1.Fatigue_Actuelle === 108, `(${parId.M1 && parId.M1.Fatigue_Actuelle})`);
  verif("exactement trois combattants régénérés (les vivants, pas le mort)",
        r.journal.ecrituresBatch.length === 3, `(${r.journal.ecrituresBatch.length})`);
}

// =========================================================================
console.log("\n3. LE SOCLE DE RÉGÉNÉRATION EST DÉSORMAIS 35, PAS 30");
{
  const conv = await p.evaluate((src) => {
    eval(src);
    return {
      sansChamp: persoDocVersFront("J1", {}).Regeneration,
      champExplicite: persoDocVersFront("J1", { Regeneration: 60 }).Regeneration
    };
  }, SRC_CONVERSION);
  verif("une fiche sans le champ Regeneration retombe sur 35",
        conv.sansChamp === 35, `(${conv.sansChamp})`);
  verif("une valeur déjà écrite n'est pas remplacée par le socle",
        conv.champExplicite === 60, `(${conv.champExplicite})`);

  // La validation des caractéristiques d'un héros tout neuf écrit elle aussi
  // ce socle : vérifié sur le texte réel de la fonction, pas seulement sur la
  // conversion de lecture ci-dessus.
  verif("l'écriture faite à la création d'un héros pose bien Regeneration: 35",
        /Regeneration:\s*35\b/.test(SRC_VALIDATION_CARACS));
  verif("et plus l'ancienne valeur de 30",
        !/Regeneration:\s*30\b/.test(SRC_VALIDATION_CARACS));
}

console.log("\nerreurs JS pendant toute la séance :", erreurs.length ? erreurs : "aucune");
if (erreurs.length) echecs++;

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
