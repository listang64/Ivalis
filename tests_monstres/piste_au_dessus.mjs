// La piste d'initiative passait SOUS le panneau gauche : dès qu'un combat
// comptait assez de combattants, la piste s'étendait jusque derrière le panneau
// et se faisait couper. Ce banc ouvre la vraie page du jeu, affiche la fenêtre
// de combat, remplit la piste, et vérifie qui répond au point de recouvrement.
import fs from 'fs';
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1180, height: 820 } });   // iPad paysage
// Aucune requête réseau : on ne veut que le DOM et les styles de la page.
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
p.on('pageerror', () => {});   // les modules Firebase échouent, c'est voulu
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(300);

const res = await p.evaluate(() => {
  // --app-h est posée par app.js au démarrage ; sans elle la fenêtre de combat
  // a une hauteur nulle et rien ne se mesure.
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  const fenetre = document.getElementById('fenetre-combat');
  // On reconstitue l'état "en combat" : les écrans parents s'affichent, tous
  // les autres écrans de premier niveau se cachent, comme le fait le jeu.
  const chaine = new Set();
  for (let e = fenetre; e && e !== document.body; e = e.parentElement) chaine.add(e);
  [...document.body.children].forEach(e => { if (!chaine.has(e)) e.style.display = 'none'; });
  chaine.forEach(e => { if (getComputedStyle(e).display === 'none') e.style.display = 'block'; });
  fenetre.style.display = 'block';
  // Les images du HUD ne se chargent pas ici (réseau coupé) : on donne au
  // bouton la hauteur qu'il a en vrai, puis on laisse le jeu caler le calque.
  document.getElementById('img-hud-fintour').style.height = '150px';
  window.ajusterCalquePiste = window.ajusterCalquePiste || function() {
    const c = document.getElementById('calque-piste-initiative');
    const h = document.getElementById('combat-hud-bas-droite');
    if (c && h && h.offsetHeight > 0) c.style.height = h.offsetHeight + 'px';
  };
  window.ajusterCalquePiste();
  const piste = document.getElementById('piste-initiative');
  const panneau = document.getElementById('panneau-combat-gauche');

  // Une piste bien remplie, comme un combat à six combattants.
  piste.innerHTML = Array.from({length: 6}, (_, i) =>
    `<div style="width:110px;height:100%;background:#333;border-radius:50%">${i}</div>`).join("");
  piste.style.opacity = '1';

  // Le panneau est volontairement traversant aux clics (pointer-events: none),
  // si bien qu'un test de clic seul ne dirait rien de ce qu'on VOIT. On le rend
  // cliquable le temps de la mesure : le test de survol suit alors exactement
  // l'ordre d'empilement, donc l'ordre de peinture.
  panneau.style.pointerEvents = 'auto';

  const rp = piste.getBoundingClientRect();
  const rg = panneau.getBoundingClientRect();
  const recouvre = rp.left < rg.right;
  // Un point situé À LA FOIS sur la piste et sur le panneau.
  const x = Math.min(rg.right, rp.right) - 12;
  const y = rp.top + rp.height / 2;
  const dessus = document.elementFromPoint(x, y);
  return {
    recouvre,
    largeurPiste: Math.round(rp.width),
    bordPiste: Math.round(rp.left), bordPanneau: Math.round(rg.right),
    zPiste: getComputedStyle(document.getElementById('calque-piste-initiative') || piste).zIndex,
    zPanneau: getComputedStyle(panneau).zIndex,
    auPoint: dessus ? (dessus.id || dessus.closest('[id]')?.id || "?") : null,
    dansLaPiste: !!(dessus && piste.contains(dessus)),
    // Le bouton de fin de tour doit, lui, rester SOUS le panneau.
    zHud: getComputedStyle(document.getElementById('combat-hud-bas-droite')).zIndex
  };
});

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(56)} ${c?"OK":"ÉCHEC"} ${d}`); };

console.log(`piste large de ${res.largeurPiste}px, son bord gauche est à ${res.bordPiste}px ; le panneau s'arrête à ${res.bordPanneau}px`);
verifier("la piste déborde bien sous le panneau", res.recouvre);
verifier("au point de recouvrement, c'est la piste qui répond", res.dansLaPiste, `(${res.auPoint})`);
verifier("le calque de la piste passe au-dessus du panneau",
         parseInt(res.zPiste) > parseInt(res.zPanneau), `(${res.zPiste} > ${res.zPanneau})`);
verifier("le bouton de fin de tour reste sous le panneau",
         parseInt(res.zHud) < parseInt(res.zPanneau), `(${res.zHud} < ${res.zPanneau})`);

await p.screenshot({ path: '/tmp/piste.png' });
await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
