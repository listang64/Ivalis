// LE BOUTON "+" DE LA FORGE.
// L'ouverture lit la fiche et les caractéristiques en base : sur une connexion
// capricieuse, il s'écoulait une à deux secondes sans le moindre retour visuel.
// Le "+" doit devenir un sablier pendant ce temps, puis redevenir un "+".
import fs from 'fs';

const src = fs.readFileSync('/home/user/Ivalis/competences.js','utf-8');
const lignes = src.split('\n');
const d = lignes.findIndex(l => l.startsWith('window.ouvrirCreationCompetence = async function'));
let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === '};') { f = i; break; } }
const fonction = lignes.slice(d, f + 1).join('\n');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(200);

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c?"OK":"ÉCHEC"} ${d}`); };

const resultat = await p.evaluate(async ({ fnSrc }) => {
  const bouton = document.getElementById("btn-creer-competence");
  const avant = { texte: bouton.innerHTML.trim(), taille: getComputedStyle(bouton).fontSize };

  window.forgeState = { actions: [], effetsBDD: [] };
  window.EFFETS_BDD_CACHE = { EFF_X: { Nom:"Attaque légère", Type_Mecanique:"Action/Global" } };
  window.rafraichirForge = () => {};
  window.masquerApercuCarteHD = () => {};
  window.normalizeForgeType = (t) => t;
  document.getElementById("champ-id-personnage").value = "PERSO_1";

  // Firestore volontairement lent : c'est la situation qu'on veut couvrir.
  const getDoc = async () => { await new Promise(r => setTimeout(r, 500)); return { exists: () => true, data: () => ({}) }; };
  const ouvrir = new Function('window','db','doc','getDoc','normalizeForgeType',
                              fnSrc + '; return window.ouvrirCreationCompetence;')(
                              window, {}, () => ({}), getDoc, (t) => t);

  const promesse = ouvrir();
  await new Promise(r => setTimeout(r, 150));
  const pendant = { texte: document.getElementById("btn-creer-competence").innerHTML.trim(),
                    taille: getComputedStyle(bouton).fontSize,
                    curseur: getComputedStyle(bouton).cursor };
  await promesse;
  const apres = { texte: bouton.innerHTML.trim(), taille: getComputedStyle(bouton).fontSize,
                  modale: document.getElementById("modale-creation-competence").style.display };
  return { avant, pendant, apres };
}, { fnSrc: fonction });

console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");
console.log(`     avant "${resultat.avant.texte}" (${resultat.avant.taille}) → pendant "${resultat.pendant.texte}" (${resultat.pendant.taille}) → après "${resultat.apres.texte}" (${resultat.apres.taille})`);

verifier("au repos, le bouton affiche bien un +", resultat.avant.texte === "+");
verifier("pendant le chargement, il affiche le sablier", resultat.pendant.texte === "⏳");
verifier("le sablier est rétréci pour tenir dans le rond",
         parseFloat(resultat.pendant.taille) < parseFloat(resultat.avant.taille),
         `(${resultat.pendant.taille} contre ${resultat.avant.taille})`);
verifier("le curseur passe en attente", resultat.pendant.curseur === "wait", `(${resultat.pendant.curseur})`);
verifier("le + revient une fois la Forge ouverte", resultat.apres.texte === "+");
verifier("et sa taille d'origine aussi", resultat.apres.taille === resultat.avant.taille);
verifier("la Forge s'ouvre bien", resultat.apres.modale === "block", `(${resultat.apres.modale})`);

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
