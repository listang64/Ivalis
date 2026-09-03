// METTRE UN HÉROS DE CÔTÉ (OUTIL DE DÉVELOPPEMENT).
// La case à cocher de la liste des héros retire un personnage du jeu sans
// l'effacer : il quitte le plateau, la piste d'initiative, le décompte des
// joueurs prêts et le tour de parole de la chatbox. Recoché, il revient.
import fs from 'fs';
import { SRC_MODIFIER_PARTIE } from './transaction_partie.mjs';

const app = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8');
const monstres = fs.readFileSync('/home/user/Ivalis/monstres.js', 'utf-8');

function extraire(src, marqueur, finLigne = '};') {
  const lignes = src.split('\n');
  const d = lignes.findIndex(l => l.startsWith(marqueur));
  if (d < 0) throw new Error("introuvable : " + marqueur);
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}

const SRC_CONVERSION = extraire(app, 'function persoDocVersFront(id, d) {', '}');
const SRC_LISTE      = extraire(app, 'function afficherListePersonnages(persos) {', '}');
const SRC_BASCULE    = extraire(app, 'window.basculerActivationPersonnage = async function');
const SRC_RECOMPOSE  = extraire(monstres, 'window.recomposerCombattants = function');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 700, height: 900 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(250);

// ------------------------------------------------------------------
console.log("1. LA CASE À COCHER N'EXISTE QU'EN MODE DÉVELOPPEUR");

const monter = (modeDev) => p.evaluate(({ srcConversion, srcListe, srcBascule, srcRecompose, srcModifierPartie, modeDev }) => {
  localStorage.setItem("ivalis_DEV_MODE", modeDev ? "on" : "off");
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== "ecran-jeu") e.style.display = "none"; });
  document.getElementById("ecran-jeu").style.display = "block";
  document.getElementById("conteneur-liste-personnages").style.display = "block";

  window.JOURNAL = { ecrits: [] };
  window.COL = { PERSONNAGES: "Personnages" };
  window.db = {};
  window.jouerSonClic = () => {};
  window.ouvrirFichePerso = (id) => { window.FICHE_OUVERTE = id; };
  window.appliquerTokensVTT = () => {}; window.afficherPisteInitiative = () => {};
  window.TOKENS_VTT_DATA = {}; window.MONSTRES_PARTIE = [];
  window.COMBAT_PERSOS_JOUEUR = []; window.COMBAT_INDEX_PERSO = 0;
  window.ID_PARTIE_COURANTE = "P1";

  // Trois fiches telles qu'elles sortent de la base : la troisième mise de côté.
  const fiches = {
    H1: { ID_Partie: "P1", Prenom_Personnage: "Pliors", Nom_Personnage: "le Vif", PV_Max: 42, Etats_Alteres: [] },
    H2: { ID_Partie: "P1", Prenom_Personnage: "Jade", Nom_Personnage: "", PV_Max: 42, Etats_Alteres: [] },
    H3: { ID_Partie: "P1", Prenom_Personnage: "Mémé", Nom_Personnage: "", PV_Max: 42, Etats_Alteres: [], Actif: false }
  };

  new Function('window', SRC_CONVERSION_HOLDER = srcConversion + '\nwindow.persoDocVersFront = persoDocVersFront;')(window);
  window.PERSOS_JOUEURS_PARTIE = Object.keys(fiches).map(id => window.persoDocVersFront(id, fiches[id]));

  new Function('window', srcRecompose)(window);
  window.recomposerCombattants();

  const updateDoc = async (ref, maj) => { window.JOURNAL.ecrits.push({ ref, maj }); };
  window.PARTAGEE = { doc: { Ordre_Initiative: ["H1", "H2", "H3"], Index_Initiative: 2 } };
  const runTransaction = async (_db, fn) => fn({
    get: async () => ({ exists: () => true, data: () => JSON.parse(JSON.stringify(window.PARTAGEE.doc)) }),
    update: (_r, maj) => Object.assign(window.PARTAGEE.doc, JSON.parse(JSON.stringify(maj)))
  });
  new Function('window', 'db', 'doc', 'runTransaction', srcModifierPartie)(window, {}, () => ({}), runTransaction);
  new Function('window', 'db', 'doc', 'updateDoc', 'COL', 'afficherListePersonnages',
    srcListe + '\nwindow.afficherListePersonnages = afficherListePersonnages;\n' + srcBascule)(
    window, window.db, (d, c, id) => ({ chemin: c + "/" + id }), updateDoc, window.COL, null);

  window.afficherListePersonnages(window.PERSOS_JOUEURS_PARTIE);
  const lignes = document.querySelectorAll("#liste-html-persos .item-perso");
  return { lignes: lignes.length,
           cases: document.querySelectorAll("#liste-html-persos input[type=checkbox]").length,
           combattants: window.PERSOS_PARTIE.map(x => x.idPersonnage) };
}, { srcConversion: SRC_CONVERSION, srcListe: SRC_LISTE, srcBascule: SRC_BASCULE,
     srcRecompose: SRC_RECOMPOSE, srcModifierPartie: SRC_MODIFIER_PARTIE, modeDev });

{
  const sansDev = await monter(false);
  const avecDev = await monter(true);
  console.log(`     mode normal : ${sansDev.lignes} héros listés, ${sansDev.cases} cases`);
  console.log(`     mode dev    : ${avecDev.lignes} héros listés, ${avecDev.cases} cases`);
  verifier("les trois héros restent listés, actifs ou non",
           sansDev.lignes === 3 && avecDev.lignes === 3);
  verifier("aucune case sans le mode développeur", sansDev.cases === 0, `(${sansDev.cases})`);
  verifier("une case par héros avec", avecDev.cases === 3, `(${avecDev.cases})`);
  verifier("un héros mis de côté n'est pas un combattant",
           avecDev.combattants.join(",") === "H1,H2", `(${avecDev.combattants.join(",")})`);
}

// ------------------------------------------------------------------
console.log("\n2. L'ÉTAT DES CASES REFLÈTE LA SITUATION");
{
  const etat = await p.evaluate(() => {
    const cases = [...document.querySelectorAll("#liste-html-persos input[type=checkbox]")];
    const lignes = [...document.querySelectorAll("#liste-html-persos .item-perso")];
    return { cochees: cases.map(c => c.checked),
             opacites: lignes.map(l => l.style.opacity || "1") };
  });
  console.log(`     cases : ${etat.cochees.join(", ")}`);
  verifier("les deux premiers sont cochés, le troisième non",
           JSON.stringify(etat.cochees) === "[true,true,false]", `(${etat.cochees.join(",")})`);
  verifier("la ligne du héros mis de côté est estompée",
           etat.opacites[2] !== "1" && etat.opacites[0] === "1", `(${etat.opacites.join(", ")})`);
}

// ------------------------------------------------------------------
console.log("\n3. DÉCOCHER UN HÉROS, POUR DE VRAI");
{
  const avant = await p.evaluate(() => window.PERSOS_PARTIE.map(x => x.idPersonnage));
  // Un vrai clic sur la case de Jade, la deuxième.
  await p.click("#liste-html-persos .item-perso:nth-child(2) input[type=checkbox]");
  await p.waitForTimeout(120);
  const apres = await p.evaluate(() => ({
    combattants: window.PERSOS_PARTIE.map(x => x.idPersonnage),
    ecrit: window.JOURNAL.ecrits.map(e => e.ref.chemin + " " + JSON.stringify(e.maj)),
    ordre: window.PARTAGEE.doc.Ordre_Initiative,
    index: window.PARTAGEE.doc.Index_Initiative,
    ficheOuverte: window.FICHE_OUVERTE || null
  }));
  console.log(`     combattants : ${avant.join(",")} → ${apres.combattants.join(",")}`);
  console.log(`     tour de parole : ${apres.ordre.join(",")} (index ${apres.index})`);
  verifier("le héros décoché quitte les combattants",
           apres.combattants.join(",") === "H1", `(${apres.combattants.join(",")})`);
  verifier("la fiche est écrite en base avec Actif à faux",
           apres.ecrit.some(e => e.startsWith("Personnages/H2") && e.includes('"Actif":false')),
           `(${apres.ecrit.join(" | ")})`);
  verifier("il quitte aussi le tour de parole de la chatbox",
           apres.ordre.join(",") === "H1,H3", `(${apres.ordre.join(",")})`);
  verifier("l'index du tour de parole est ramené dans les clous",
           apres.index === 0, `(${apres.index})`);
  verifier("cocher la case n'a pas ouvert la fiche derrière", apres.ficheOuverte === null,
           `(${apres.ficheOuverte})`);
}

// ------------------------------------------------------------------
console.log("\n4. LE REMETTRE EN JEU");
{
  await p.click("#liste-html-persos .item-perso:nth-child(2) input[type=checkbox]");
  await p.waitForTimeout(120);
  const apres = await p.evaluate(() => ({
    combattants: window.PERSOS_PARTIE.map(x => x.idPersonnage),
    ordre: window.PARTAGEE.doc.Ordre_Initiative,
    ecrit: window.JOURNAL.ecrits.slice(-1)[0]
  }));
  console.log(`     combattants : ${apres.combattants.join(",")} — tour de parole ${apres.ordre.join(",")}`);
  verifier("il redevient un combattant", apres.combattants.join(",") === "H1,H2",
           `(${apres.combattants.join(",")})`);
  verifier("et retrouve sa place dans le tour de parole",
           apres.ordre.includes("H2"), `(${apres.ordre.join(",")})`);
  verifier("sans doublon", new Set(apres.ordre).size === apres.ordre.length, `(${apres.ordre.join(",")})`);
}

console.log("\nerreurs JS :", erreurs.length ? erreurs : "aucune");
await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
