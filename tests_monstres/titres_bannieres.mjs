// Un nom de technique trop long finissait coupé ("Souffle corrom…"). Il doit
// maintenant rétrécir jusqu'à tenir. Ce banc rend les VRAIES bannières de combat
// dans un navigateur, avec des noms courts et des noms à rallonge.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';

const combat = fs.readFileSync('/home/user/Ivalis/combat.js','utf-8');
const comp   = fs.readFileSync('/home/user/Ivalis/competences.js','utf-8');

function extraire(src, marqueur) {
  const lignes = src.split('\n');
  const debut = lignes.findIndex(l => l.startsWith(marqueur));
  if (debut < 0) throw new Error("introuvable : " + marqueur);
  let fin = debut;
  for (let i = debut + 1; i < lignes.length; i++) { if (lignes[i] === '};') { fin = i; break; } }
  return lignes.slice(debut, fin + 1).join('\n');
}
const fnPanneau  = extraire(combat, 'window.chargerCompetencesCombat = function');
const fnAjuster  = extraire(comp,   'window.ajusterTitresBannieres = function');

const carte = (nom, init) => ({ Nom: nom, Fatigue: 30, Initiative: init, Cout_PC: 6,
  Effets_Compiles: [{ nom:"Attaque lourde", desc:"12 dégats physique", isMod:false }],
  Composants:{ actions:[{ baseEffetId:"EFF_ATTAQUE_LOURDE", count:6, mods:{}, zoneHexes:[], baseDuree:0, modsDuree:{} }] } });

const NOMS = ["Estoc", "Souffle corrompu", "Malédiction du Marcheur des Cendres",
              "Hurlement funeste de la Gueule Béante des Neuf Abîmes", "Onde", "Fracas sanglant"];
const cartes = {}; NOMS.forEach((n, i) => cartes["C"+i] = carte(n, 90 - i*10));

const page = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{background:#241a12;margin:0;padding:16px}</style></head><body>
<div id="combat-jauges-container"></div>
<div id="combat-liste-competences" style="width:380px"></div>
<script>
window.PERSOS_PARTIE = [{ idPersonnage:"P1", statut:"Vivant", PV_Max:50, PV_Actuels:50,
  Fatigue_Max:120, fatigueMax:120, fatigueActuelle:120, couleur:"#4a1c1c",
  deckEquipe:${JSON.stringify(Object.keys(cartes))} }];
window.CACHE_COMPETENCES_GLOBAL = { P1: ${JSON.stringify(cartes)} };
window.mettreAJourJaugeFatigue = function(){}; window.mettreAJourJaugePV = function(){};
window.COMPETENCES_CACHE = {};
window.TAILLE_MIN_TITRE_BANNIERE = 9;
${SRC_STATS_COMMUNES}
${fnAjuster}
${fnPanneau}
window.chargerCompetencesCombat("P1", "#4a1c1c");
</script></body></html>`;
fs.writeFileSync('/tmp/titres.html', page);

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 420, height: 900 } });
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
await p.goto('file:///tmp/titres.html');
await p.waitForTimeout(600);

const res = await p.evaluate(() => [...document.querySelectorAll('.titre-auto-reduit')].map(el => ({
  texte: el.textContent.trim(),
  taille: Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10,
  largeurTexte: el.scrollWidth, largeurBoite: el.clientWidth,
  coupe: el.scrollWidth > el.clientWidth + 1
})));

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(52)} ${c?"OK":"ÉCHEC"} ${d}`); };

console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");
console.log(`\n${res.length} bannières (boîte de titre : ${res[0] ? res[0].largeurBoite : "?"}px)`);
res.forEach(r => console.log(`  ${String(r.taille).padStart(4)}px  ${r.coupe ? "COUPÉ " : "entier"}  ${r.texte}`));

const nom = (t) => res.find(r => r.texte.toLowerCase().startsWith(t));
// Le nom démesuré de la dernière bannière (52 caractères) sert de garde-fou : à
// ce point, on préfère encore l'ellipse à un texte illisible. Tous les autres,
// eux, doivent tenir en entier.
const raisonnables = res.filter(r => r.texte.length <= 40);

verifier("les six bannières sont rendues", res.length === 6, `(${res.length})`);
verifier("aucun nom de longueur raisonnable n'est coupé", raisonnables.every(r => !r.coupe),
         `(${raisonnables.filter(r => r.coupe).map(r => r.texte).join(", ") || "aucun"})`);
const court = nom("estoc");
verifier("un nom court garde sa taille pleine", court && court.taille === 17, court ? `(${court.taille}px)` : "");
const moyen = nom("souffle corrompu");
verifier("un nom moyen tient sans être réduit", moyen && !moyen.coupe, moyen ? `(${moyen.taille}px)` : "");
const long = nom("malédiction");
verifier("un nom long est réduit et tient en entier",
         long && long.taille < 17 && !long.coupe, long ? `(${long.taille}px)` : "");
verifier("jamais sous le plancher de lisibilité", res.every(r => r.taille >= 9));

await p.screenshot({ path: '/tmp/titres.png' });

// -------- Deuxième page : les bannières de la FICHE PERSO --------
const fnFiche = extraire(comp, 'window.chargerOngletCompetences = async function');
const cadres = comp.match(/const IMAGE_CADRE_NORMAL[\s\S]*?const IMAGE_CADRE_SELECTIONNE = "[^"]*";/)[0];
const page2 = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>body{background:#241a12;margin:0;padding:16px}</style></head><body>
<div id="liste-competences-perso" style="width:520px"></div>
<script>
window.PERSOS_PARTIE = [{ idPersonnage:"P1", couleur:"#4a1c1c",
  deckEquipe:${JSON.stringify(Object.keys(cartes))} }];
window.CACHE_COMPETENCES_GLOBAL = { P1: ${JSON.stringify(cartes)} };
window.COMPETENCES_CACHE = {};
window.TAILLE_MIN_TITRE_BANNIERE = 9;
${SRC_STATS_COMMUNES}
${cadres}
${fnAjuster}
${fnFiche}
window.chargerOngletCompetences("P1", 6);
</script></body></html>`;
fs.writeFileSync('/tmp/titres_fiche.html', page2);

const p2 = await b.newPage({ viewport: { width: 600, height: 1100 } });
const err2 = []; p2.on('pageerror', e => err2.push(e.message));
await p2.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
await p2.goto('file:///tmp/titres_fiche.html');
await p2.waitForTimeout(600);
const res2 = await p2.evaluate(() => [...document.querySelectorAll('.titre-auto-reduit')].map(el => ({
  texte: el.textContent.trim(),
  taille: Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10,
  coupe: el.scrollWidth > el.clientWidth + 1
})));

console.log("\nFICHE PERSO — erreurs JS :", err2.length ? err2 : "aucune");
res2.forEach(r => console.log(`  ${String(r.taille).padStart(4)}px  ${r.coupe ? "COUPÉ " : "entier"}  ${r.texte}`));
verifier("les bannières de la fiche sont rendues", res2.length === 6, `(${res2.length})`);
verifier("elles rétrécissent aussi", res2.some(r => r.taille < 17));
verifier("aucun nom raisonnable coupé dans la fiche",
         res2.filter(r => r.texte.length <= 40).every(r => !r.coupe));
await p2.screenshot({ path: '/tmp/titres_fiche.png' });

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
