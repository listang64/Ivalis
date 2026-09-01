// Vérifie que le panneau gauche affiche bien les techniques d'un monstre,
// en exécutant le VRAI chargerCompetencesCombat() de combat.js dans un navigateur.
import fs from 'fs';
import { chargerGenerateur, GAB } from './banc_reel.mjs';

const fenetre = chargerGenerateur();
const docs = await fenetre.genererCompetencesMonstre({ nom:"Ours brun", archetype:"TANK CAC", palier:"Normal" });
const cartes = {}; docs.forEach((d,i) => cartes["COMP_test" + i] = d);
const deck = Object.keys(cartes);

const src = fs.readFileSync('/home/user/Ivalis/combat.js','utf-8');
// On isole la fonction complète, accolade fermante comprise.
const lignes = src.split('\n');
const debut = lignes.findIndex(l => l.startsWith('window.chargerCompetencesCombat = function'));
let fin = debut; for (let i = debut + 1; i < lignes.length; i++) { if (lignes[i] === '};') { fin = i; break; } }
const fonction = lignes.slice(debut, fin + 1).join('\n');

const page = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{background:#241a12;margin:0;padding:16px}</style></head><body>
<div id="combat-jauges-container"></div>
<div id="combat-liste-competences" style="width:460px"></div>
<script>
window.PERSOS_PARTIE = [{ idPersonnage:"MONSTRE_1", estMonstre:true, statut:"Vivant",
  PV_Max:90, PV_Actuels:90, Fatigue_Max:90, fatigueMax:90, fatigueActuelle:90,
  couleur:"#ff4c4c", deckEquipe:${JSON.stringify(deck)} }];
window.CACHE_COMPETENCES_GLOBAL = { MONSTRE_1: ${JSON.stringify(cartes)} };
window.mettreAJourJaugeFatigue = function(){}; window.mettreAJourJaugePV = function(){};
window.ESPACEMENT_BANNIERES_COMBAT = -45;
${fonction}
window.chargerCompetencesCombat("MONSTRE_1", "#ff4c4c");
</script></body></html>`;
fs.writeFileSync('/tmp/panneau.html', page);

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 500, height: 620 } });
const err = []; p.on('pageerror', e => err.push(e.message));
await p.goto('file:///tmp/panneau.html');
await p.waitForTimeout(900);

const res = await p.evaluate(() => {
  const bans = [...document.querySelectorAll('.banniere-carte-combat')];
  return {
    nb: bans.length,
    texte: document.getElementById('combat-liste-competences').innerText.trim().slice(0, 400),
    fonds: [...new Set(bans.map(b => { const d = b.querySelector('div[style*="background-color"]');
      return d ? getComputedStyle(d).backgroundColor : "?"; }))]
  };
});
console.log("erreurs JS  :", err.length ? err : "aucune");
console.log("bannières   :", res.nb, res.nb === 6 ? "OK (6 techniques affichées)" : "ÉCHEC");
console.log("fond carte  :", res.fonds.join(", "));
console.log("texte lu    :", res.texte.replace(/\n+/g, " | "));
await p.screenshot({ path: '/tmp/panneau.png' });
await b.close();
