// POSER UNE ZONE À DISTANCE.
// Le joueur devait deviner où sa zone pouvait atterrir : elle disparaissait dès
// qu'il sortait de la portée ou de la ligne de vue, sans explication. L'écran
// s'assombrit maintenant partout sauf sur les cases où elle peut se poser, comme
// pour le Bond et l'Illusion.
import fs from 'fs';

const moteur = fs.readFileSync('/home/user/Ivalis/moteur_effets.js','utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(200);

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c?"OK":"ÉCHEC"} ${d}`); };

const mesurer = (situation) => p.evaluate(({ src, situation }) => {
  const dist = (a, b) => Math.max(Math.abs(a.q-b.q), Math.abs(a.r-b.r), Math.abs((-a.q-a.r)-(-b.q-b.r)));
  window.PLATEAU_VTT = {
    hexSize: 30,
    hexToPixel: (q, r) => ({ x: q*52, y: r*45 }),
    getCaseState: (q, r) => ({ isBlocked: (situation.murs||[]).some(m => m.q===q && m.r===r),
                               isDeleted:false, isDifficult:false }),
    getHexesInRadius: (q, r, rayon) => {
      const out = [];
      for (let dq = -rayon; dq <= rayon; dq++)
        for (let dr = -rayon; dr <= rayon; dr++)
          if (dist({q,r}, {q:q+dq, r:r+dr}) <= rayon) out.push({ q:q+dq, r:r+dr });
      return out;
    }
  };
  window.TOKENS_VTT_DATA = situation.tokens;
  window.PERSOS_PARTIE = situation.persos;
  window.COMBAT_PERSOS_JOUEUR = [situation.persos[0]];
  window.COMBAT_INDEX_PERSO = 0;

  if (!window.__moteurCharge) {
    new Function('window','db','doc','updateDoc','setDoc','deleteDoc','deleteField', src)(
      window, {}, () => ({}), async () => {}, async () => {}, async () => {}, () => ({}));
    window.__moteurCharge = true;
  }

  const config = { isRanged:true, rangeMax: situation.portee, isHeal:false, isShield:false };
  const posables = window.casesPosablesZone("J1", config);
  window.assombrirCasesJouables("svg-zone-assombrissement", posables);
  const overlay = document.getElementById("svg-zone-assombrissement");
  return {
    nbPosables: posables.length,
    distMax: posables.reduce((m, h) => Math.max(m, dist({q:0,r:0}, h)), 0),
    droitDerriereLeMur: posables.some(h => h.r === 0 && h.q > 2),
    surLesCotes: posables.some(h => h.r === 3 && h.q === 0),
    overlay: !!overlay,
    trous: overlay ? overlay.querySelectorAll("polygon").length : 0,
    dansLePlateau: overlay ? overlay.parentElement.id : null
  };
}, { src: moteur, situation });

console.log("1. UNE ZONE À PORTÉE 4, CHAMP LIBRE");
{
  const r = await mesurer({ portee: 4, tokens:{ J1:{q:0,r:0} },
    persos:[{ idPersonnage:"J1", camp:"Allié", statut:"Vivant" }] });
  console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");
  verifier("le voile est posé sur le plateau", r.overlay && r.dansLePlateau === "transform-plateau",
           `(${r.dansLePlateau})`);
  verifier("il perce un trou par case posable", r.trous === r.nbPosables, `(${r.trous}/${r.nbPosables})`);
  verifier("aucune case au-delà de la portée", r.distMax === 4, `(portée max ${r.distMax})`);
}

console.log("\n2. UN MUR COUPE LA LIGNE DE VUE");
{
  const r = await mesurer({ portee: 5, tokens:{ J1:{q:0,r:0} },
    persos:[{ idPersonnage:"J1", camp:"Allié", statut:"Vivant" }],
    murs:[{q:1,r:0},{q:2,r:0},{q:2,r:-1},{q:2,r:1}] });
  verifier("les cases droit derrière le mur ne sont pas proposées", !r.droitDerriereLeMur);
  verifier("celles qu'on voit encore le sont", r.surLesCotes);
}

console.log("\n3. AU CORPS-À-CORPS, ON NE VISE PLUS QU'À UNE CASE");
{
  const r = await mesurer({ portee: 6, tokens:{ J1:{q:0,r:0}, M1:{q:1,r:0} },
    persos:[{ idPersonnage:"J1", camp:"Allié", statut:"Vivant" },
            { idPersonnage:"M1", camp:"Ennemi", statut:"Vivant" }] });
  verifier("la portée retombe à une case", r.distMax === 1, `(portée max ${r.distMax})`);
  verifier("le voile suit cette règle", r.trous === r.nbPosables && r.nbPosables <= 7,
           `(${r.nbPosables} cases)`);
}

console.log("\n4. LE MÊME VOILE SERT AU BOND ET À L'ILLUSION");
{
  const r = await p.evaluate(() => {
    const cases = [{q:1,r:0},{q:2,r:0},{q:0,r:1}];
    const bond = window.assombrirCasesJouables("svg-bond-assombrissement", cases);
    const illusion = window.assombrirCasesJouables("svg-illusion-assombrissement", cases);
    const res = { bond: bond ? bond.querySelectorAll("polygon").length : 0,
                  illusion: illusion ? illusion.querySelectorAll("polygon").length : 0 };
    window.retirerAssombrissement("svg-bond-assombrissement");
    window.retirerAssombrissement("svg-illusion-assombrissement");
    res.retires = !document.getElementById("svg-bond-assombrissement")
               && !document.getElementById("svg-illusion-assombrissement");
    return res;
  });
  verifier("le Bond obtient bien son voile", r.bond === 3, `(${r.bond} trous)`);
  verifier("l'Illusion aussi", r.illusion === 3, `(${r.illusion} trous)`);
  verifier("et ils se retirent proprement", r.retires);
}

console.log("\n5. LE VOILE DISPARAÎT AVEC LE CIBLAGE");
{
  const r = await p.evaluate(() => {
    window.nettoyerCiblage();
    return { reste: !!document.getElementById("svg-zone-assombrissement") };
  });
  verifier("plus de voile après nettoyage du ciblage", !r.reste);
}

await p.screenshot({ path: '/tmp/zone_assombrissement.png' });
await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
