// LA PETITE JAUGE SOUS LE PION.
// Elle apparaît le temps d'une animation de dégâts, DANS le pion. Or le moindre
// changement en base redessine tous les pions : la jauge était balayée en pleine
// descente — on ne voyait donc jamais la barre d'un ennemi bouger.
import fs from 'fs';

const combat = fs.readFileSync('/home/user/Ivalis/combat.js','utf-8');
const moteur = fs.readFileSync('/home/user/Ivalis/moteur_effets.js','utf-8');
function fonction(src, marqueur) {
  const lignes = src.split('\n');
  const d = lignes.findIndex(l => l.startsWith(marqueur));
  if (d < 0) throw new Error("introuvable : " + marqueur);
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === '};') { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}

const page = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<div id="conteneur-tokens-vtt" style="position:relative;width:600px;height:400px;overflow:hidden"></div>
<script>
window.PLATEAU_VTT = { hexToPixel: (q,r) => ({ x: 100 + q*60, y: 100 + r*60 }),
                       getCaseState: () => ({ isBlocked:false, isDeleted:false, isDifficult:false }) };
window.VTT_SCALE = 1; window.ZONES_PERSISTANTES = {}; window.TOKEN_SELECTIONNE = null;
window.estCombattantMort = function(id) {
  const p = (window.PERSOS_PARTIE||[]).find(x => x.idPersonnage === id);
  return !p || p.statut === "Mort" || (p.PV_Max > 0 && p.PV_Actuels <= 0);
};
window.PERSOS_PARTIE = [
  { idPersonnage:"M1", prenom:"Gnoll", estMonstre:true, camp:"Ennemi", PV_Max:90, PV_Actuels:90,
    Fatigue_Max:120, fatigueActuelle:120, couleur:"#ff4c4c", Etats_Alteres:[] },
  { idPersonnage:"J1", prenom:"Pliors", camp:"Allié", PV_Max:42, PV_Actuels:42,
    Fatigue_Max:100, fatigueActuelle:100, couleur:"#4a1c1c", Etats_Alteres:[],
    urlToken:"", urlCloudinary:"" }
];
window.TOKENS_VTT_DATA = { M1:{q:0,r:0,taille:55}, J1:{q:2,r:0,taille:55} };
window.afficherMessageFlottantHex = function(){};
window.positionnerTokenVTT = function(div) {
  const q = parseFloat(div.dataset.q), r = parseFloat(div.dataset.r), t = parseFloat(div.dataset.taille);
  const px = window.PLATEAU_VTT.hexToPixel(q, r);
  div.style.left = px.x + "px"; div.style.top = px.y + "px";
  div.style.width = t + "px"; div.style.height = t + "px";
};
${fonction(combat, 'window.appliquerTokensVTT = function')}
${fonction(moteur, 'window.afficherFlashDegatToken = function')}
window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
</script></body></html>`;
fs.writeFileSync('/tmp/jauge_token.html', page);

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 640, height: 480 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///tmp/jauge_token.html');
await p.waitForTimeout(200);

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c?"OK":"ÉCHEC"} ${d}`); };
console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");

console.log("\n1. LA JAUGE APPARAÎT SOUS LE PION D'UN ENNEMI");
{
  const r = await p.evaluate(() => {
    window.afficherFlashDegatToken("M1", 90, 45, 90, "-45 🩸", "#ff4c4c");
    const j = document.querySelector("#token-M1 .jauge-flash-token");
    return { existe: !!j, largeurDepart: j ? j.firstElementChild.style.width : null };
  });
  verifier("la jauge est bien créée sur le pion du monstre", r.existe);
  verifier("elle part de la vie d'avant", r.largeurDepart === "100%", `(${r.largeurDepart})`);
}

console.log("\n2. UN REDESSIN DES PIONS NE DOIT PAS L'EFFACER");
{
  const r = await p.evaluate(async () => {
    // Ce que provoque l'arrivée du snapshot Firestore, 200 ms après le coup.
    window.PERSOS_PARTIE.find(x => x.idPersonnage === "M1").PV_Actuels = 45;
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    await new Promise(r => setTimeout(r, 700));   // la descente dure 500 ms
    const j = document.querySelector("#token-M1 .jauge-flash-token");
    return { survit: !!j, largeurFinale: j ? j.firstElementChild.style.width : null };
  });
  verifier("la jauge survit au redessin", r.survit);
  verifier("et sa descente est allée au bout", r.largeurFinale === "50%", `(${r.largeurFinale})`);
}

console.log("\n3. ELLE DISPARAÎT BIEN TOUTE SEULE À LA FIN");
{
  const r = await p.evaluate(async () => {
    await new Promise(r => setTimeout(r, 1400));
    return { restantes: document.querySelectorAll(".jauge-flash-token").length };
  });
  verifier("aucune jauge ne reste collée au pion", r.restantes === 0, `(${r.restantes})`);
}

await p.screenshot({ path: '/tmp/jauge_token.png' });
await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
