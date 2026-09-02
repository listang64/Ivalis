// LES POINTS D'APPARITION DES DEUX CAMPS.
// Au début d'un combat (ou après une réinitialisation), le jeu demande de poser
// deux repères invisibles : les héros apparaissent autour du premier, les
// créatures autour du second, au hasard des cases libres. Le clic doit être
// franc — faire glisser la carte ne doit rien planter au passage.
import fs from 'fs';

const combat = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
const lignes = combat.split('\n');

// Le chapitre entier des points d'apparition, tel quel.
const d = lignes.findIndex(l => l.startsWith("//  POINTS D'APPARITION"));
const f = lignes.findIndex((l, i) => i > d && l.startsWith('// Le bouton 💀'));
const srcApparition = lignes.slice(d, f).join('\n');
// Et la recherche de case libre historique, dont il se sert en dernier recours.
const dLibre = lignes.findIndex(l => l.startsWith('window.trouverHexLibreVTT = function'));
let fLibre = dLibre; for (let i = dLibre + 1; i < lignes.length; i++) { if (lignes[i] === '};') { fLibre = i; break; } }
const srcHexLibre = lignes.slice(dLibre, fLibre + 1).join('\n');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(250);

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// Mise en place : un plateau de 40 cases de côté, aucune bloquée sauf un mur.
await p.evaluate(({ srcApparition, srcHexLibre }) => {
  document.documentElement.style.setProperty('--app-h', '800px');
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById('fenetre-combat').style.display = 'block';

  window.MURS = new Set(["5,5"]);
  window.VTT_POS_X = 0; window.VTT_POS_Y = 0; window.VTT_SCALE = 1;
  window.PLATEAU_VTT = {
    getCaseState: (q, r) => ({ isBlocked: window.MURS.has(q + "," + r),
                              isDeleted: Math.abs(q) > 20 || Math.abs(r) > 20, isDifficult: false }),
    pixelToHex: (x, y) => ({ q: Math.round(x / 60), r: Math.round(y / 60) }),
    hexToPixel: (q, r) => ({ x: q * 60, y: r * 60 })
  };
  window.ID_PARTIE_COURANTE = "PARTIE_TEST";
  window.PARTIE_DATA = { Tour_Combat: 1 };
  window.TOKENS_VTT_DATA = {};
  window.jouerSonClic = () => {};
  window.afficherMessageFlottantHex = (q, r, t) => { window.MESSAGES = (window.MESSAGES || []); window.MESSAGES.push(t); };
  window.ECRITURES = [];
  eval(srcHexLibre);
  eval(srcApparition);
  // On court-circuite l'écriture réseau, en gardant tout le reste du parcours.
  window.enregistrerPointsApparition = async (allies, ennemis) => {
    window.PARTIE_DATA.Spawn_Allies = allies;
    window.PARTIE_DATA.Spawn_Ennemis = ennemis;
    window.ECRITURES.push({ allies, ennemis });
  };
  window.verifierPointsApparition();
}, { srcApparition, srcHexLibre });

const etape = () => p.evaluate(() => ({
  visible: document.getElementById('placement-apparition').style.display === 'flex',
  titre: document.getElementById('placement-apparition-titre').innerText,
  etape: window.PLACEMENT_APPARITION ? window.PLACEMENT_APPARITION.etape : null,
  ecritures: window.ECRITURES.length,
  points: window.ECRITURES[0] || null
}));

const depart = await etape();
verifier("la demande s'ouvre en entrant en combat", depart.visible);
verifier("elle réclame d'abord le camp des héros", depart.etape === "Allié" && /héros/i.test(depart.titre),
         `(${depart.titre})`);

// Un GLISSEMENT de carte : le doigt part de (300,300) et arrive à (500,340).
await p.mouse.move(300, 300);
await p.mouse.down();
await p.mouse.move(400, 320);
await p.mouse.move(500, 340);
await p.mouse.up();
const apresGlissement = await etape();
verifier("faire glisser la carte ne pose aucun repère", apresGlissement.etape === "Allié");

// Un APPUI PROLONGÉ (plus de 800 ms) : hésitation, pas un clic franc.
await p.mouse.move(300, 300);
await p.mouse.down();
await p.waitForTimeout(1000);
await p.mouse.up();
const apresAppuiLong = await etape();
verifier("un appui prolongé n'en pose pas non plus", apresAppuiLong.etape === "Allié");

// Un CLIC FRANC sur la case (5,3) : x = 5*60 = 300, y = 3*60 = 180.
await p.mouse.click(300, 180);
const apresPremier = await etape();
verifier("un clic franc pose le repère des héros", apresPremier.etape === "Ennemi",
         `(${apresPremier.etape})`);
verifier("la demande passe au camp des ennemis", /ennemis/i.test(apresPremier.titre), `(${apresPremier.titre})`);

// Une case impraticable (le mur en 5,5 → x=300, y=300) : refusée.
await p.mouse.click(300, 300);
const apresMur = await etape();
verifier("une case impraticable est refusée", apresMur.etape === "Ennemi");

// Le second clic franc, en (12,3) : x = 720, y = 180.
await p.mouse.click(720, 180);
const apresSecond = await etape();
verifier("le second clic ferme la demande", !apresSecond.visible && apresSecond.etape === null);
verifier("les deux repères sont enregistrés une seule fois", apresSecond.ecritures === 1,
         `(${apresSecond.ecritures})`);
verifier("aux cases cliquées", JSON.stringify(apresSecond.points) === JSON.stringify({ allies: { q: 5, r: 3 }, ennemis: { q: 12, r: 3 } }),
         `(${JSON.stringify(apresSecond.points)})`);

// La dispersion autour des repères.
const dispersion = await p.evaluate(() => {
  const tokens = {};
  const tirer = (camp, n) => {
    const places = [];
    for (let i = 0; i < n; i++) {
      const hex = window.trouverHexLibreAutour(tokens, window.pointApparition(camp), 2);
      tokens["T" + camp + i] = { q: hex.q, r: hex.r };
      places.push(hex);
    }
    return places;
  };
  const allies = tirer("Allié", 5);
  const ennemis = tirer("Ennemi", 5);
  const dist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r),
                                  Math.abs((-a.q - a.r) - (-b.q - b.r)));
  const pAllies = window.pointApparition("Allié"), pEnnemis = window.pointApparition("Ennemi");

  // Deux tirages successifs doivent différer : c'est un placement au hasard.
  const empreinte = () => {
    const t = {};
    return Array.from({ length: 5 }, () => {
      const h = window.trouverHexLibreAutour(t, pAllies, 2);
      t["x" + Math.random()] = h; return h.q + ":" + h.r;
    }).join(" ");
  };
  const tirages = new Set(Array.from({ length: 12 }, empreinte));

  // Sans repère enregistré, on retombe sur l'ancien comportement (près du centre).
  const sansRepere = window.trouverHexLibreAutour({}, null, 2);

  return {
    allies, ennemis,
    distAllies: allies.map(h => dist(h, pAllies)),
    distEnnemis: ennemis.map(h => dist(h, pEnnemis)),
    chevauchements: new Set([...allies, ...ennemis].map(h => h.q + ":" + h.r)).size,
    murUtilise: [...allies, ...ennemis].some(h => h.q === 5 && h.r === 5),
    varietes: tirages.size,
    sansRepere
  };
});

console.log(`     héros  : ${dispersion.allies.map(h => `(${h.q},${h.r})`).join(" ")}`);
console.log(`     ennemis: ${dispersion.ennemis.map(h => `(${h.q},${h.r})`).join(" ")}`);

verifier("les héros apparaissent à 2 cases ou moins de leur repère",
         dispersion.distAllies.every(d => d <= 2), `(${dispersion.distAllies.join(",")})`);
verifier("les ennemis aussi, autour du leur", dispersion.distEnnemis.every(d => d <= 2),
         `(${dispersion.distEnnemis.join(",")})`);
verifier("aucun pion n'est posé sur un autre", dispersion.chevauchements === 10,
         `(${dispersion.chevauchements} cases distinctes sur 10)`);
verifier("aucun pion n'est posé dans un mur", !dispersion.murUtilise);
verifier("le placement varie d'un tirage à l'autre", dispersion.varietes > 1,
         `(${dispersion.varietes} dispositions sur 12)`);
verifier("sans repère, on retombe au plus près du centre",
         dispersion.sansRepere.q === 0 && dispersion.sansRepere.r === 0,
         `(${dispersion.sansRepere.q},${dispersion.sansRepere.r})`);

// Le lien « Plus tard » cliqué pour de vrai : le barrage de clics posé pendant
// la demande ne doit pas le rendre inerte.
await p.evaluate(() => {
  delete window.PARTIE_DATA.Spawn_Allies; delete window.PARTIE_DATA.Spawn_Ennemis;
  window.APPARITION_REPORTEE = false;
  window.verifierPointsApparition();
});
await p.click('#placement-apparition div[onclick]');
const apresVraiClic = await p.evaluate(() => ({
  fermee: document.getElementById('placement-apparition').style.display !== 'flex',
  reportee: window.APPARITION_REPORTEE
}));
verifier("le lien « Plus tard » reste cliquable malgré le barrage",
         apresVraiClic.fermee && apresVraiClic.reportee);

// Le report manuel, et le retour d'un autre poste.
const report = await p.evaluate(() => {
  delete window.PARTIE_DATA.Spawn_Allies; delete window.PARTIE_DATA.Spawn_Ennemis;
  window.APPARITION_REPORTEE = false;
  window.verifierPointsApparition();
  const rouverte = document.getElementById('placement-apparition').style.display === 'flex';
  window.reporterPointsApparition();
  const apresReport = document.getElementById('placement-apparition').style.display === 'flex';
  window.verifierPointsApparition();
  const insistance = document.getElementById('placement-apparition').style.display === 'flex';

  // Un autre poste pose les repères : la demande locale se referme toute seule.
  window.APPARITION_REPORTEE = false;
  window.verifierPointsApparition();
  const rouverteBis = document.getElementById('placement-apparition').style.display === 'flex';
  window.PARTIE_DATA.Spawn_Allies = { q: 1, r: 1 };
  window.PARTIE_DATA.Spawn_Ennemis = { q: 9, r: 9 };
  window.verifierPointsApparition();
  const refermee = document.getElementById('placement-apparition').style.display !== 'flex';

  // Hors combat, jamais de demande.
  delete window.PARTIE_DATA.Spawn_Allies; delete window.PARTIE_DATA.Spawn_Ennemis;
  document.getElementById('fenetre-combat').style.display = 'none';
  window.verifierPointsApparition();
  const horsCombat = document.getElementById('placement-apparition').style.display === 'flex';
  document.getElementById('fenetre-combat').style.display = 'block';

  return { rouverte, apresReport, insistance, rouverteBis, refermee, horsCombat };
});

verifier("des repères effacés relancent la demande", report.rouverte);
verifier("« Plus tard » la referme", !report.apresReport);
verifier("et elle n'insiste plus ensuite", !report.insistance);
verifier("les repères posés depuis un autre poste la referment",
         report.rouverteBis && report.refermee);
verifier("hors combat, aucune demande", !report.horsCombat);

console.log("erreurs JS :", erreurs.length ? erreurs : "aucune");
await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
