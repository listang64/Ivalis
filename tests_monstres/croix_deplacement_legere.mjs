// LA CROIX D'ANNULATION S'EFFACE SEULE, SANS RECONSTRUIRE LE PLATEAU.
//
// Signalé en partie : « quand on valide le déplacement d'un perso il met un
// peu de temps avant de lancer l'animation de déplacement — sur iPad, pas sur
// PC ». La cause : valider (ou annuler) un déplacement appelait
// appliquerTokensVTT(TOKENS_VTT_DATA) — un redessin ENTIER de tous les pions,
// halos de sélection et de bouclier compris (des filtres SVG, coûteux à
// reconstruire sur Safari/iPad) — dans le seul but de faire disparaître LA
// PETITE CROIX ROUGE d'un seul pion. Ce redessin s'exécutait juste avant
// d'envoyer le chemin au cerveau, donc avant tout le reste.
//
// Ce banc charge le VRAI mouvement.js et vérifie, sur le vrai DOM, que
// valider ou annuler un déplacement retire la croix SANS jamais appeler
// appliquerTokensVTT (compté), et sans toucher au reste du pion (même
// référence DOM avant/après — un redessin complet en aurait fabriqué une
// neuve).
import fs from 'fs';

const mouvement = fs.readFileSync('/home/user/Ivalis/mouvement.js', 'utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(200);

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const preparer = () => p.evaluate((src) => {
  // Le fichier réinitialise CHEMIN_MOUVEMENT et consorts à ses toutes
  // premières lignes (window.CHEMIN_MOUVEMENT = [] ...) : on l'évalue D'ABORD,
  // sinon l'état posé pour le banc serait écrasé aussitôt après.
  new Function('window', src)(window);

  document.body.innerHTML = '<div id="conteneur-tokens-vtt"></div>' +
    '<svg id="svg-chemin-mouvement"></svg>';
  const token = document.createElement("div");
  token.id = "token-J1";
  token.className = "token-vtt";
  // Le halo de sélection et l'ombre : ce que la croix côtoie dans un vrai
  // pion — s'ils survivent, c'est qu'on n'a rien reconstruit autour d'elle.
  const halo = document.createElement("div");
  halo.className = "token-halo-selection";
  halo.dataset.marque = "je-suis-le-meme-halo";
  token.appendChild(halo);
  const croix = document.createElement("div");
  croix.className = "croix-annuler-deplacement";
  croix.innerText = "✖";
  token.appendChild(croix);
  document.getElementById("conteneur-tokens-vtt").appendChild(token);

  window.PLATEAU_VTT = { getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }) };
  window.jouerSonClic = () => {};
  window.TOKEN_SELECTIONNE = "J1";
  window.CHEMIN_MOUVEMENT = [{ q: 1, r: 0, cost: 2 }];
  window.CHEMIN_START_NODE = { q: 0, r: 0 };
  window.MOUVEMENT_COUT_TOTAL = 2;
  window.COUT_COMPETENCE_SELECTIONNEE = 0;
  window.PARTIE_DATA = { Tour_Combat: 1 };
  window.PAS_PARCOURUS_TOUR = { id: null, tour: null, pas: 0 };
  window.pasDejaParcourus = () => 0;

  // L'instrument : si appliquerTokensVTT est appelé, ce banc doit le voir.
  window.__appelsRedessin = 0;
  window.appliquerTokensVTT = () => { window.__appelsRedessin++; };
  window.actualiserBoutonFinTour = () => {};

  return { halo: !!document.querySelector(".token-halo-selection"),
           croix: !!document.querySelector(".croix-annuler-deplacement") };
}, mouvement);

console.log("1. ANNULER LE DÉPLACEMENT : LA CROIX S'EN VA, RIEN D'AUTRE NE BOUGE");
{
  await preparer();
  const halo = await p.evaluate(() => {
    document.querySelector(".token-halo-selection").dataset.marque = "toujours-le-meme";
    return document.querySelector(".token-halo-selection");
  });
  const r = await p.evaluate(() => {
    window.annulerMouvement();
    return {
      croixPartie: !document.querySelector(".croix-annuler-deplacement"),
      haloEncoreLa: !!document.querySelector(".token-halo-selection"),
      memeHalo: document.querySelector(".token-halo-selection")?.dataset.marque === "toujours-le-meme",
      appelsRedessin: window.__appelsRedessin,
      cheminVide: window.CHEMIN_MOUVEMENT.length === 0
    };
  });
  verifier("la croix a disparu", r.croixPartie, JSON.stringify(r));
  verifier("le halo de sélection n'a pas bougé (même élément DOM)", r.haloEncoreLa && r.memeHalo,
           JSON.stringify(r));
  verifier("AUCUN redessin complet du plateau n'a eu lieu", r.appelsRedessin === 0,
           `(${r.appelsRedessin} appel(s))`);
  verifier("le chemin est bien vidé", r.cheminVide);
}

console.log("\n2. VALIDER LE DÉPLACEMENT : MÊME CHOSE, ET LE CHEMIN PART AU CERVEAU");
{
  await preparer();
  await p.evaluate(() => {
    document.querySelector(".token-halo-selection").dataset.marque = "toujours-le-meme";
    window.regimeDemande = {
      actif: () => true,
      mouvement: async (acteur, chemin) => { window.__envoye = { acteur, chemin }; }
    };
  });
  const r = await p.evaluate(async () => {
    await window.validerMouvement();
    return {
      croixPartie: !document.querySelector(".croix-annuler-deplacement"),
      memeHalo: document.querySelector(".token-halo-selection")?.dataset.marque === "toujours-le-meme",
      appelsRedessin: window.__appelsRedessin,
      envoye: window.__envoye
    };
  });
  verifier("la croix a disparu", r.croixPartie, JSON.stringify(r));
  verifier("le halo de sélection n'a pas bougé (même élément DOM)", r.memeHalo, JSON.stringify(r));
  verifier("AUCUN redessin complet du plateau n'a eu lieu avant l'envoi", r.appelsRedessin === 0,
           `(${r.appelsRedessin} appel(s))`);
  verifier("le chemin est bien parti au cerveau", r.envoye && r.envoye.acteur === "J1",
           JSON.stringify(r.envoye));
}

console.log("\n3. LA CROIX DU CIBLAGE S'EFFACE PAR LA MÊME PORTE");
{
  await preparer();
  await p.evaluate(() => {
    document.querySelector(".croix-annuler-deplacement").className = "croix-annuler-ciblage";
  });
  const r = await p.evaluate(() => {
    window.retirerCroixDeplacement("J1");
    return { croixPartie: !document.querySelector(".croix-annuler-ciblage") };
  });
  verifier("retirerCroixDeplacement efface aussi la croix de ciblage", r.croixPartie, JSON.stringify(r));
}

console.log("\n4. UN PION SANS CROIX, OU UN ID INCONNU : RIEN NE CASSE");
{
  await preparer();
  const r = await p.evaluate(() => {
    document.querySelector(".croix-annuler-deplacement").remove();
    let erreur = null;
    try {
      window.retirerCroixDeplacement("J1");
      window.retirerCroixDeplacement("PERSONNE");
    } catch (e) { erreur = e.message; }
    return { erreur };
  });
  verifier("aucune exception sur un pion déjà propre ou un id absent", r.erreur === null, String(r.erreur));
}

verifier("aucune erreur JavaScript pendant tout le banc", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
