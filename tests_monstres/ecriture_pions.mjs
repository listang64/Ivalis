// LES PIONS ÉCRITS EN BASE DOIVENT ATTERRIR DANS LA CARTE « Tokens ».
//
// Le défaut trouvé : enregistrerPionsVTT envoyait { "Tokens.J1": pion } à setDoc.
// Or setDoc ne découpe PAS les clés sur les points — seul updateDoc le fait. Le
// pion partait donc dans un champ de premier niveau nommé littéralement
// « Tokens.J1 », à côté de la carte des pions. L'écouteur relisait data.Tokens,
// n'y trouvait rien de neuf, et plus aucun jeton n'apparaissait sur le plateau :
// aucune erreur en console, juste un terrain vide.
//
// Ce banc rejoue les VRAIES fonctions devant un faux Firestore qui respecte
// scrupuleusement cette différence de traitement entre setDoc et updateDoc.
import fs from 'fs';

const src = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
const lignes = src.split('\n');
function fonctionCombat(marqueur) {
  const i = lignes.findIndex(l => l.startsWith(marqueur));
  if (i < 0) throw new Error("introuvable dans combat.js : " + marqueur);
  let j = i; for (let k = i + 1; k < lignes.length; k++) { if (lignes[k] === '};') { j = k; break; } }
  return lignes.slice(i, j + 1).join('\n');
}
const SRC = fonctionCombat('window.enregistrerPionsVTT = async function')
    + '\n' + fonctionCombat('window.reparerPionsAPlat = async function')
    + '\n' + fonctionCombat('window.genererTokensCombat = async function');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage();
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('about:blank');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(60)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const res = await p.evaluate(async (fnSrc) => {
  // ---------------------------------------------------------------------
  // UN FAUX FIRESTORE FIDÈLE
  //   setDoc  : les clés sont des NOMS de champs, points compris.
  //   updateDoc : les clés sont des CHEMINS, découpés sur les points ; un
  //               FieldPath d'un seul segment désigne au contraire un nom
  //               de champ entier, point compris.
  // ---------------------------------------------------------------------
  const base = {};
  class FieldPath { constructor(...segments) { this.segments = segments; } }
  const SUPPRIMER = { __supprimer: true };
  const deleteField = () => SUPPRIMER;
  const doc = (...a) => ({ chemin: a.slice(1).join("/") });
  const db = { faux: true };

  const fusionner = (cible, source) => {
    for (const cle in source) {
      const v = source[cle];
      if (v && typeof v === "object" && !Array.isArray(v)) {
        if (!cible[cle] || typeof cible[cle] !== "object") cible[cle] = {};
        fusionner(cible[cle], v);
      } else cible[cle] = v;
    }
  };
  const setDoc = async (ref, data, opts) => {
    const d = base[ref.chemin] = base[ref.chemin] || {};
    if (!opts || !opts.merge) { for (const k in d) delete d[k]; }
    fusionner(d, JSON.parse(JSON.stringify(data)));
  };
  const poser = (d, segments, valeur) => {
    let cur = d;
    for (let i = 0; i < segments.length - 1; i++) {
      if (!cur[segments[i]] || typeof cur[segments[i]] !== "object") cur[segments[i]] = {};
      cur = cur[segments[i]];
    }
    const dernier = segments[segments.length - 1];
    if (valeur === SUPPRIMER) delete cur[dernier];
    else cur[dernier] = JSON.parse(JSON.stringify(valeur));
  };
  const updateDoc = async (ref, ...args) => {
    const d = base[ref.chemin];
    if (!d) throw new Error("updateDoc sur un document inexistant : " + ref.chemin);
    if (args.length === 1 && !(args[0] instanceof FieldPath) && typeof args[0] === "object") {
      for (const cle in args[0]) poser(d, cle.split("."), args[0][cle]);
      return;
    }
    for (let i = 0; i < args.length; i += 2) {
      const champ = args[i];
      const segments = champ instanceof FieldPath ? champ.segments : String(champ).split(".");
      poser(d, segments, args[i + 1]);
    }
  };

  window.ID_PARTIE_COURANTE = "PARTIE_TEST";
  eval(fnSrc);

  const lire = () => JSON.parse(JSON.stringify(base["Combat_VTT/PARTIE_TEST"] || {}));

  // 1. Un pion écrit seul se range bien SOUS la carte des pions.
  window.TOKENS_VTT_DATA = { J1: { q: 5, r: 3, url: "u1", taille: 55 } };
  await window.enregistrerPionsVTT("J1");
  const apresUn = lire();

  // 2. Deux pions de plus n'écrasent pas le premier, et ne créent aucun champ
  //    bancal à côté de la carte.
  window.TOKENS_VTT_DATA.J2 = { q: 6, r: 3, url: "u2", taille: 55 };
  window.TOKENS_VTT_DATA.MONSTRE_a = { q: 12, r: 3, url: "u3", taille: 55 };
  await window.enregistrerPionsVTT("J2", "MONSTRE_a");
  const apresTrois = lire();

  // 3. Déplacer un pion met à jour sa case sans toucher aux autres.
  window.TOKENS_VTT_DATA.J1.q = 7;
  await window.enregistrerPionsVTT("J1");
  const apresDeplacement = lire();

  // 4. Un id inconnu n'écrit rien du tout.
  const avant = JSON.stringify(lire());
  await window.enregistrerPionsVTT("FANTOME_INCONNU");
  const apresInconnu = JSON.stringify(lire()) === avant;

  // 5. Réparation d'une partie déjà abîmée : des pions à plat traînent en base.
  base["Combat_VTT/PARTIE_TEST"]["Tokens.MONSTRE_b"] = { q: 13, r: 4, url: "u4", taille: 55 };
  base["Combat_VTT/PARTIE_TEST"]["Tokens.MONSTRE_c"] = { q: 14, r: 4, url: "u5", taille: 55 };
  const aRepare = await window.reparerPionsAPlat(lire());
  const apresReparation = lire();

  // 6. Une base saine ne déclenche aucune réparation.
  const reparationInutile = await window.reparerPionsAPlat(lire());

  // 7. Le déploiement des héros passe par la même écriture : le plateau relu
  //    depuis la base doit contenir leurs pions.
  base["Combat_VTT/PARTIE_TEST"] = {};
  window.TOKENS_VTT_DATA = {};
  window.PLATEAU_VTT = { faux: true };
  window.jouerSonClic = () => {};
  window.PARTIE_DATA = { Spawn_Allies: { q: 2, r: 0 }, Spawn_Ennemis: { q: -2, r: -2 } };
  window.pointApparition = (camp) => camp === "Ennemi"
      ? window.PARTIE_DATA.Spawn_Ennemis : window.PARTIE_DATA.Spawn_Allies;
  let decalage = 0;
  window.trouverHexLibreAutour = (t, centre) => ({ q: centre.q + (decalage++), r: centre.r });
  window.PERSOS_PARTIE = [
    { idPersonnage: "J1", camp: "Allié", urlToken: "u1" },
    { idPersonnage: "J2", camp: "Allié", urlCloudinary: "u2" },
    { idPersonnage: "MONSTRE_a", camp: "Ennemi", urlToken: "u3" },
    { idPersonnage: "MORT", camp: "Ennemi", urlToken: "u4", statut: "Mort" }
  ];
  await window.genererTokensCombat();
  const apresDeploiement = lire();

  return { apresUn, apresTrois, apresDeplacement, apresInconnu,
           aRepare, apresReparation, reparationInutile, apresDeploiement };
}, SRC);

console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");

const champsBancals = (d) => Object.keys(d).filter(c => c.startsWith("Tokens."));

console.log("\nUN PION ÉCRIT EN BASE");
console.log("     document :", JSON.stringify(res.apresUn));
verifier("le pion est rangé dans la carte Tokens",
         !!(res.apresUn.Tokens && res.apresUn.Tokens.J1 && res.apresUn.Tokens.J1.q === 5));
verifier("aucun champ « Tokens.xxx » de premier niveau",
         champsBancals(res.apresUn).length === 0, `(${champsBancals(res.apresUn).join(",")})`);

console.log("\nPLUSIEURS PIONS");
verifier("les trois pions cohabitent dans la carte",
         Object.keys(res.apresTrois.Tokens || {}).sort().join(",") === "J1,J2,MONSTRE_a",
         `(${Object.keys(res.apresTrois.Tokens || {}).join(",")})`);
verifier("écrire un pion n'efface pas les autres",
         res.apresTrois.Tokens && res.apresTrois.Tokens.J1 && res.apresTrois.Tokens.J1.q === 5);
verifier("aucun champ bancal après trois écritures",
         champsBancals(res.apresTrois).length === 0, `(${champsBancals(res.apresTrois).join(",")})`);

console.log("\nDÉPLACEMENT");
verifier("la nouvelle case du pion déplacé est bien en base",
         res.apresDeplacement.Tokens.J1.q === 7, `(q=${res.apresDeplacement.Tokens.J1.q})`);
verifier("les voisins ne bougent pas",
         res.apresDeplacement.Tokens.J2.q === 6 && res.apresDeplacement.Tokens.MONSTRE_a.q === 12);
verifier("un identifiant inconnu n'écrit rien", res.apresInconnu);

console.log("\nRÉPARATION D'UNE PARTIE DÉJÀ ABÎMÉE");
verifier("les pions à plat sont détectés", res.aRepare === true);
verifier("et remis dans la carte des pions",
         !!(res.apresReparation.Tokens && res.apresReparation.Tokens.MONSTRE_b
            && res.apresReparation.Tokens.MONSTRE_c),
         `(${Object.keys(res.apresReparation.Tokens || {}).join(",")})`);
verifier("les champs bancals sont effacés",
         champsBancals(res.apresReparation).length === 0,
         `(${champsBancals(res.apresReparation).join(",")})`);
verifier("les pions déjà sains sont conservés intacts",
         res.apresReparation.Tokens.J1 && res.apresReparation.Tokens.J1.q === 7);
verifier("une base saine ne déclenche aucune réparation", res.reparationInutile === false);

console.log("\nDÉPLOIEMENT COMPLET DES COMBATTANTS");
console.log("     document :", JSON.stringify(res.apresDeploiement));
verifier("les combattants debout ont tous un pion en base",
         Object.keys(res.apresDeploiement.Tokens || {}).sort().join(",") === "J1,J2,MONSTRE_a",
         `(${Object.keys(res.apresDeploiement.Tokens || {}).join(",")})`);
verifier("un combattant mort n'est pas déployé",
         !(res.apresDeploiement.Tokens || {}).MORT);
verifier("le plateau relu depuis la base n'est pas vide",
         Object.keys(res.apresDeploiement.Tokens || {}).length === 3,
         `(${Object.keys(res.apresDeploiement.Tokens || {}).length} pion(s))`);

await b.close();
console.log(echecs === 0 ? "\n✅ Les pions arrivent bien en base." : `\n❌ ${echecs} vérification(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
