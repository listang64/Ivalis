// v390 — LA SURPUISSANCE DE LA FORGE, SANS ENCADRÉ.
// Nico : « enlève l'encadré autour du texte de surpuissance, comme ça ça ne dépassera pas »
// (dans la bulle de la fatigue, le cadre arrondi et son fond débordaient du médaillon).
//
// Lancer : node tests_monstres/corrections_v390.mjs
import fs from 'fs';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf-8');
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent(`<style>${lire("style.css")}\n${lire("grimoire_fiches.css")}</style>
  <div class="forge-dans-livre"><div class="forge-medaillon forge-medaillon-fatigue"><div id="forge-surpuissance" class="forge-surpuissance active">💥 Surpuissance ×1,25 : dégâts et soins (×1,35 dès 100)</div></div></div>`);
const r = await p.evaluate(() => { const cs = getComputedStyle(document.getElementById("forge-surpuissance"));
  return { bord: cs.borderTopStyle, fond: cs.backgroundColor, rembourrage: cs.paddingLeft, couleur: cs.color, gras: cs.fontWeight }; });
console.log("\n1. LA SURPUISSANCE ACTIVE");
verifier("plus d'encadré : ni bord, ni fond, ni marge intérieure", r.bord === "none" && /rgba\(0, 0, 0, 0\)|transparent/.test(r.fond) && r.rembourrage === "0px", JSON.stringify(r));
verifier("le texte reste en gras", Number(r.gras) >= 700, JSON.stringify(r));
console.log("\n2. LES VERSIONS");
const html = lire("index.html");
verifier("index.html charge style.css en v145 (ou plus)", Number((/style\.css\?v=(\d+)"/.exec(html) || [])[1]) >= 145);
verifier("la version du jeu : 390 ou plus", Number((/VERSION_IVALIS = (\d+);/.exec(lire("trace_combat.js")) || [])[1]) >= 390 && JSON.parse(lire("version.json")).version >= 390);
await b.close();
console.log(echecs === 0 ? "\nTOUT EST BON" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs ? 1 : 0);
