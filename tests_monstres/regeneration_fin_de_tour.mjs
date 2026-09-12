// LE SOCLE DE RÉGÉNÉRATION EST 35, PAS 30.
//
// Ce banc vérifiait à l'origine deux choses : que finDeTourCombat n'appliquait
// la régénération qu'à la fin d'un round (jamais entre deux cartes), et que le
// socle par défaut valait 35. La première moitié (sections 1-2, finDeTourCombat
// lui-même) est partie à la grande suppression de l'ancien moteur : la file
// avance maintenant dans le cerveau (avancerFile, cerveau_combat.js), qui
// applique lui-même la régénération de fin de manche (regenererFinDeManche) —
// voir tests_monstres/cerveau_combat.mjs, qui reprend l'épreuve exacte. Ce
// qui reste ici (le socle de 35) ne touchait pas l'ancien moteur.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';

function extraire(fichier, marqueur, finLigne = '};') {
  const lignes = fs.readFileSync('/home/user/Ivalis/' + fichier, 'utf-8').split('\n');
  const d = lignes.findIndex(l => l.startsWith(marqueur));
  if (d < 0) throw new Error(`${marqueur} introuvable dans ${fichier}`);
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}

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

// =========================================================================
console.log("LE SOCLE DE RÉGÉNÉRATION EST DÉSORMAIS 35, PAS 30");
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
