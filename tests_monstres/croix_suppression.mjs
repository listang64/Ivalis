// EFFACER UNE TECHNIQUE DEPUIS LA FICHE (OUTIL DE DÉVELOPPEMENT).
// Une petite croix rouge apparaît à côté de chaque bannière du grimoire, mais
// seulement quand le mode développeur est activé dans les paramètres. Elle
// efface la carte de la base — et une carte ne vit pas qu'à un seul endroit :
// son document, le deck équipé, deux caches en mémoire, et l'entrée de la file
// d'attente qui la désigne si un combat tourne.
import fs from 'fs';
import { SRC_MODIFIER_PARTIE } from './transaction_partie.mjs';

const comp = fs.readFileSync('/home/user/Ivalis/competences.js', 'utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 800, height: 900 }, deviceScaleFactor: 2 });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(250);

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// Le décor : un héros, trois techniques, dont deux équipées. Un faux Firestore
// qui note tout ce qu'on lui demande d'effacer et d'écrire.
const preparer = (modeDev) => p.evaluate(({ src, srcModifierPartie, modeDev }) => {
  localStorage.setItem("ivalis_DEV_MODE", modeDev ? "on" : "off");

  window.JOURNAL = { supprimes: [], ecrits: [], partie: null };
  window.BASE = {
    competences: { C1: { Nom: "Estoc", Initiative: 90 },
                   C2: { Nom: "Souffle corrompu", Initiative: 70 },
                   C3: { Nom: "Onde", Initiative: 40 } }
  };

  window.db = {};
  window.__fs = {
    doc: (...a) => ({ chemin: a.slice(1).join("/") }),
    collection: (...a) => ({ chemin: a.slice(1).join("/") }),
    getDoc: async (ref) => ({ exists: () => false, data: () => ({}) }),
    getDocs: async () => ({ forEach: () => {} }),
    setDoc: async () => {},
    updateDoc: async (ref, maj) => { window.JOURNAL.ecrits.push({ chemin: ref.chemin, maj }); },
    deleteDoc: async (ref) => { window.JOURNAL.supprimes.push(ref.chemin); }
  };

  // La fiche perso est masquée au chargement : sans elle, les bannières
  // mesurent zéro pixel et les contrôles de géométrie ne mesurent rien.
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== "ecran-jeu") e.style.display = "none"; });
  document.getElementById("ecran-jeu").style.display = "block";
  const fiche = document.getElementById("fenetre-fiche-perso");
  fiche.style.display = "block";
  fiche.style.width = "700px";
  document.querySelectorAll(".contenu-onglet").forEach(o => o.classList.remove("actif"));
  const onglet = document.getElementById("onglet-competences");
  onglet.classList.add("actif");
  onglet.style.display = "block";

  window.PERSOS_PARTIE = [{ idPersonnage: "H1", couleur: "#4a1c1c", deckEquipe: ["C1", "C2"] }];
  window.CACHE_COMPETENCES_GLOBAL = { H1: JSON.parse(JSON.stringify(window.BASE.competences)) };
  window.jouerSonClic = () => {};
  window.ajusterTitresBannieres = () => {};
  window.confirm = () => true;
  window.ID_PARTIE_COURANTE = "P1";

  // La vraie transaction de partie, avec un document de combat de test.
  window.PARTAGEE = { doc: { File_Attente_Combat: [
      { idPersonnage: "H1", idCarte: "C2", initiative: 70 },
      { idPersonnage: "H2", idCarte: "C9", initiative: 50 }
  ] } };
  const runTransaction = async (_db, fn) => fn({
    get: async () => ({ exists: () => true, data: () => JSON.parse(JSON.stringify(window.PARTAGEE.doc)) }),
    update: (_r, maj) => { Object.assign(window.PARTAGEE.doc, JSON.parse(JSON.stringify(maj))); }
  });
  new Function('window', 'db', 'doc', 'runTransaction', srcModifierPartie)(
    window, {}, () => ({}), runTransaction);

  new Function('window', 'db', 'collection', 'getDocs', 'doc', 'setDoc', 'getDoc', 'updateDoc', 'deleteDoc', src)(
    window, window.db, window.__fs.collection, window.__fs.getDocs, window.__fs.doc,
    window.__fs.setDoc, window.__fs.getDoc, window.__fs.updateDoc, window.__fs.deleteDoc);

  return true;
}, { src: comp, srcModifierPartie: SRC_MODIFIER_PARTIE, modeDev });

const rendre = () => p.evaluate(async () => {
  await window.chargerOngletCompetences("H1", 6);
  const croix = document.querySelectorAll("#liste-competences-perso div[onclick*='supprimerCompetencePerso']");
  return { bannieres: document.querySelectorAll("#liste-competences-perso .banniere-carte").length,
           croix: croix.length };
});

console.log("1. LA CROIX N'EXISTE QU'EN MODE DÉVELOPPEUR");
{
  await preparer(false);
  const sansDev = await rendre();
  await preparer(true);
  const avecDev = await rendre();
  console.log(`     mode normal : ${sansDev.bannieres} bannières, ${sansDev.croix} croix`);
  console.log(`     mode dev    : ${avecDev.bannieres} bannières, ${avecDev.croix} croix`);
  verifier("les trois bannières sont rendues", sansDev.bannieres === 3 && avecDev.bannieres === 3);
  verifier("aucune croix sans le mode développeur", sansDev.croix === 0, `(${sansDev.croix})`);
  verifier("une croix par bannière avec", avecDev.croix === 3, `(${avecDev.croix})`);
}

console.log("\n2. LA CROIX NE VOLE PAS LE CLIC D'ÉQUIPEMENT");
{
  const geometrie = await p.evaluate(() => {
    const carte = document.getElementById("ui-carte-C1");
    const croix = carte.querySelector("div[onclick*='supprimerCompetencePerso']");
    const clicEquiper = carte.querySelector("div[onclick*='gererClicCarte']");
    const rc = croix.getBoundingClientRect(), re = clicEquiper.getBoundingClientRect();
    const separes = rc.left >= re.right - 1 || rc.right <= re.left + 1
                 || rc.top >= re.bottom - 1 || rc.bottom <= re.top + 1;
    // Qui reçoit vraiment un doigt posé au centre de la croix ?
    const dessus = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
    return { separes, taille: Math.round(rc.width), estLaCroix: dessus === croix,
             zCroix: parseInt(getComputedStyle(croix).zIndex),
             zEquiper: parseInt(getComputedStyle(clicEquiper).zIndex) };
  });
  console.log(`     croix de ${geometrie.taille}px, z-index ${geometrie.zCroix} contre ${geometrie.zEquiper}`);
  verifier("la croix est hors de la zone qui équipe la carte", geometrie.separes);
  verifier("un doigt posé dessus touche bien la croix", geometrie.estLaCroix);
  verifier("elle passe au-dessus dans l'empilement", geometrie.zCroix > geometrie.zEquiper);
}

console.log("\n3. CE QUE LA SUPPRESSION EFFACE VRAIMENT");
{
  // On efface C2 : équipée, et déjà posée dans la file d'attente du combat.
  const resultat = await p.evaluate(async () => {
    await window.supprimerCompetencePerso("C2");
    await new Promise(r => setTimeout(r, 50));
    return {
      supprimes: window.JOURNAL.supprimes,
      deck: (window.JOURNAL.ecrits.find(e => e.maj && e.maj.Deck_Equipe) || {}).maj,
      cacheGlobal: Object.keys(window.CACHE_COMPETENCES_GLOBAL.H1),
      cacheAffichage: Object.keys(window.COMPETENCES_CACHE),
      deckRam: window.PERSOS_PARTIE[0].deckEquipe,
      file: window.PARTAGEE.doc.File_Attente_Combat.map(f => f.idPersonnage + ":" + f.idCarte),
      bannieres: document.querySelectorAll("#liste-competences-perso .banniere-carte").length
    };
  });
  console.log(`     document effacé : ${resultat.supprimes.join(", ")}`);
  console.log(`     file d'attente  : ${resultat.file.join(", ")}`);
  verifier("le document de la technique est effacé",
           resultat.supprimes.includes("Personnages/H1/Competences/C2"), `(${resultat.supprimes.join(",")})`);
  verifier("elle sort du deck équipé en base",
           resultat.deck && JSON.stringify(resultat.deck.Deck_Equipe) === '["C1"]',
           resultat.deck ? JSON.stringify(resultat.deck.Deck_Equipe) : "(pas d'écriture)");
  verifier("et du deck en mémoire", JSON.stringify(resultat.deckRam) === '["C1"]',
           JSON.stringify(resultat.deckRam));
  verifier("elle disparaît du cache des compétences",
           !resultat.cacheGlobal.includes("C2") && !resultat.cacheAffichage.includes("C2"),
           `(${resultat.cacheGlobal.join(",")})`);
  verifier("l'entrée qui la désignait quitte la file d'attente",
           !resultat.file.some(f => f.endsWith(":C2")), `(${resultat.file.join(", ")})`);
  verifier("le tour des autres combattants n'est pas touché",
           resultat.file.includes("H2:C9"), `(${resultat.file.join(", ")})`);
  verifier("la liste ne montre plus que deux bannières", resultat.bannieres === 2,
           `(${resultat.bannieres})`);
}

console.log("\n4. UNE TECHNIQUE NON ÉQUIPÉE, ET UN REFUS");
{
  const nonEquipee = await p.evaluate(async () => {
    window.JOURNAL.ecrits = [];
    await window.supprimerCompetencePerso("C3");   // jamais équipée
    await new Promise(r => setTimeout(r, 50));
    return { deckTouche: window.JOURNAL.ecrits.some(e => e.maj && e.maj.Deck_Equipe),
             supprimes: window.JOURNAL.supprimes.length,
             bannieres: document.querySelectorAll("#liste-competences-perso .banniere-carte").length };
  });
  verifier("une technique non équipée s'efface sans toucher au deck",
           !nonEquipee.deckTouche && nonEquipee.supprimes === 2, `(${nonEquipee.supprimes} effacements)`);
  verifier("il ne reste qu'une bannière", nonEquipee.bannieres === 1, `(${nonEquipee.bannieres})`);

  const refus = await p.evaluate(async () => {
    window.confirm = () => false;
    const avant = window.JOURNAL.supprimes.length;
    await window.supprimerCompetencePerso("C1");
    await new Promise(r => setTimeout(r, 50));
    window.confirm = () => true;
    return { avant, apres: window.JOURNAL.supprimes.length,
             bannieres: document.querySelectorAll("#liste-competences-perso .banniere-carte").length };
  });
  verifier("refuser la confirmation n'efface rien", refus.avant === refus.apres && refus.bannieres === 1,
           `(${refus.apres - refus.avant} effacement)`);
}

console.log("\nerreurs JS :", erreurs.length ? erreurs : "aucune");

// Contrôle visuel de la croix sur une bannière.
await p.evaluate(async () => {
  window.CACHE_COMPETENCES_GLOBAL.H1 = JSON.parse(JSON.stringify(window.BASE.competences));
  window.PERSOS_PARTIE[0].deckEquipe = ["C1"];
  await window.chargerOngletCompetences("H1", 6);
});
await p.waitForTimeout(300);
const cadre = await p.evaluate(() => {
  const r = document.getElementById("ui-carte-C1").getBoundingClientRect();
  return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(640, r.width), height: Math.round(r.height) };
});
await p.screenshot({ path: '/tmp/croix_suppression.png', clip: cadre });

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
