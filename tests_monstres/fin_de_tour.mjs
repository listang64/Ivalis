// LA FIN D'UN TOUR NE DOIT PAS TOMBER SUR UN SEUL DOCUMENT.
// À la fin d'un round, le jeu écrit d'un bloc la régénération et le décompte des
// états de TOUS les combattants, puis la file d'attente. Un seul document
// introuvable — monstre effacé, fiche supprimée — faisait échouer le lot entier :
// plus de décompte des états (ils s'éternisent sur les personnages) et la file
// n'était jamais écrite (la piste d'initiative n'apparaissait pas).
import fs from 'fs';

const src = fs.readFileSync('/home/user/Ivalis/combat.js','utf-8');
const lignes = src.split('\n');
const d = lignes.findIndex(l => l.startsWith('window.finDeTourCombat = async function'));
let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === '};') { f = i; break; } }
const fonction = lignes.slice(d, f + 1).join('\n');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 800, height: 600 } });

// Ordre important : le filet général d'abord, la règle précise ensuite — c'est la
// dernière enregistrée qui l'emporte.
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());

// Le vrai code importe le SDK Firestore à la volée : on lui sert un faux module
// qui délègue à ce que la page a préparé.
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
    export const writeBatch = (...a) => window.__fs.writeBatch(...a);
  `
}));
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !m.text().includes("Failed to load resource") && !m.text().includes("blocked by CORS")) erreurs.push("console: " + m.text()); });
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(200);

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c?"OK":"ÉCHEC"} ${d}`); };

const jouerFinDeTour = ({ lotCasse }) => p.evaluate(async ({ fnSrc, lotCasse }) => {
  const journal = { ecrituresUnitaires: [], partie: null, lotTente: false };

  window.__fs = {
    doc: (...a) => ({ chemin: a.slice(1).join("/") }),
    getDoc: async (ref) => ({ exists: () => true, data: () => ({
      File_Attente_Combat: [{ idPersonnage: "J1", idCarte: "C1" }],
      Phase_Combat: "Resolution",
      Tour_Combat: 3
    })}),
    updateDoc: async (ref, maj) => {
      if (ref.chemin.startsWith("Systeme_Parties")) journal.partie = maj;
      else journal.ecrituresUnitaires.push([ref.chemin, maj]);
    },
    setDoc: async () => {}, deleteDoc: async () => {}, deleteField: () => ({}),
    writeBatch: () => ({
      update: () => {},
      commit: async () => { journal.lotTente = true; if (lotCasse) throw new Error("document introuvable"); }
    })
  };

  window.db = {};                       // le module réel l'importe ; ici il suffit qu'il existe
  window.ID_PARTIE_COURANTE = "GAME_1";
  window.PEUT_PASSER_TOUR = true;
  window.ZONES_PERSISTANTES = {};
  window.PERSOS_PARTIE = [
    { idPersonnage:"J1", prenom:"Pliors", statut:"Vivant", PV_Max:42, PV_Actuels:30,
      Fatigue_Max:100, fatigueActuelle:40, Regeneration:30,
      Etats_Alteres:[{ nom:"Brûlé", duree:2, chance:30 }] },
    { idPersonnage:"M1", prenom:"Gnoll", statut:"Vivant", estMonstre:true, PV_Max:70, PV_Actuels:70,
      Fatigue_Max:120, fatigueActuelle:60, Regeneration:30,
      Etats_Alteres:[{ nom:"Glacé", duree:1, chance:20 }] }
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
  try { await window.finDeTourCombat(true); } catch (e) { journal.erreur = String(e); }
  await new Promise(r => setTimeout(r, 900));   // le corps s'exécute après 350 ms

  journal.aDemarre = !!window.ANIMATION_TOUR_EN_COURS || journal.lotTente || !!journal.partie;
  return {
    journal,
    etats: window.PERSOS_PARTIE.map(x => ({ id:x.idPersonnage, etats:x.Etats_Alteres.map(e => e.nom + ":" + e.duree) }))
  };
}, { fnSrc: fonction, lotCasse });

console.log("1. TOUT SE PASSE BIEN");
{
  const r = await jouerFinDeTour({ lotCasse: false });
  console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");
  verifier("l'écriture groupée est tentée", r.journal.lotTente);
  verifier("la file et la phase sont écrites", !!r.journal.partie && r.journal.partie.Phase_Combat === "Preparation",
           `(${r.journal.partie ? r.journal.partie.Phase_Combat : "rien"})`);
  verifier("le tour a bien avancé", r.journal.partie && r.journal.partie.Tour_Combat === 4,
           `(tour ${r.journal.partie && r.journal.partie.Tour_Combat})`);
  verifier("les états ont perdu un tour", JSON.stringify(r.etats[0].etats) === '["Brûlé:1"]',
           `(${r.etats[0].etats.join(", ")})`);
  verifier("un état arrivé à zéro disparaît", r.etats[1].etats.length === 0, `(${r.etats[1].etats.join(", ")})`);
}

console.log("\n2. UN DOCUMENT INTROUVABLE FAIT ÉCHOUER LE LOT");
{
  const r = await jouerFinDeTour({ lotCasse: true });
  verifier("le lot a bien échoué", r.journal.lotTente);
  verifier("chaque combattant est réécrit un par un", r.journal.ecrituresUnitaires.length === 2,
           `(${r.journal.ecrituresUnitaires.length})`);
  verifier("les états sont quand même décomptés",
           r.journal.ecrituresUnitaires.some(([, maj]) => Array.isArray(maj.Etats_Alteres)));
  verifier("et la file d'attente est écrite malgré tout",
           !!r.journal.partie && r.journal.partie.Phase_Combat === "Preparation",
           `(${r.journal.partie ? "écrite" : "JAMAIS ÉCRITE"})`);
}

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
