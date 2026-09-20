// LE RAPPORTEUR D'ERREURS NE SE MONTRE QU'EN MODE DÉVELOPPEUR.
//
// Le jeu se joue sur iPad, où il n'existe aucune console : une erreur au
// chargement d'un module y est invisible, toutes ses fonctions disparaissent
// d'un coup, et il ne reste rien à raconter. D'où ce bandeau rouge en bas de
// l'écran.
//
// Sauf qu'à une table de jeu, un bandeau rouge en travers de l'écran, c'est le
// jeu qui a l'air cassé — et la plupart de ce qu'il rapporte est sans
// conséquence pour la partie en cours. Il ne se montre donc qu'en mode
// développeur.
//
// MAIS IL ÉCOUTE TOUJOURS, et c'est tout le sujet de ce banc : les pannes qu'on
// cherche arrivent AU CHARGEMENT, bien avant qu'on pense à cocher quoi que ce
// soit. Un rapporteur qui ne commencerait à écouter qu'une fois coché ne
// servirait à rien. Elles sont donc gardées de côté, et cocher le mode
// développeur les fait apparaître d'un coup, celles d'avant comprises.
import fs from 'fs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// LE RAPPORTEUR EST EN CLAIR DANS LA PAGE, hors module, et il doit le rester :
// il doit être en place AVANT le premier <script type="module">, sans quoi il
// manquerait précisément les pannes qu'on cherche. On le sert donc seul, dans
// une page minimale — le reste du jeu n'a rien à voir avec ce qu'on mesure.
const html = fs.readFileSync('/home/user/Ivalis/index.html', 'utf-8');
const debut = html.indexOf("  <script>\n    (function () {\n      var vues = [];");
const fin = html.indexOf("</script>", debut) + "</script>".length;
const rapporteur = html.slice(debut, fin);
if (debut < 0) throw new Error("le rapporteur d'erreurs est introuvable dans index.html");

const page = (mode) => `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<script>try { localStorage.setItem("ivalis_DEV_MODE", ${JSON.stringify(mode)}); } catch (e) {}<\/script>
${rapporteur}
</body></html>`;

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();

const ouvrir = async (mode) => {
  const p = await b.newPage();
  await p.route('**', r => r.request().url().startsWith('http://banc.ivalis/')
      ? r.fulfill({ contentType: 'text/html', body: page(mode) }) : r.abort());
  await p.goto('http://banc.ivalis/');
  return p;
};

const etat = (p) => p.evaluate(() => {
  const boite = document.getElementById("bandeau-erreurs-js");
  return {
    visible: !!boite,
    lignes: boite ? [...boite.querySelectorAll("div")].map(d => d.textContent).filter(t => t.startsWith("•")) : [],
    retenues: (window.erreursJSRetenues ? window.erreursJSRetenues() : []).map(e => e.titre)
  };
});

// =========================================================================
console.log("\n1. MODE DÉVELOPPEUR DÉCOCHÉ : RIEN NE S'AFFICHE");
// =========================================================================
{
  const p = await ouvrir("off");
  await p.evaluate(() => window.signalerErreur("un module a lâché", "combat.js:12"));
  const e = await etat(p);
  verifier("AUCUN BANDEAU ROUGE À L'ÉCRAN", !e.visible);
  verifier("mais l'erreur est retenue, pas perdue",
           e.retenues.join() === "un module a lâché", e.retenues.join());
  await p.close();
}

// =========================================================================
console.log("\n2. ON COCHE LE MODE DÉVELOPPEUR : TOUT REMONTE");
// =========================================================================
//  C'est le contrôle qui compte. Les pannes de chargement sont arrivées AVANT
//  qu'on coche : si elles n'étaient pas gardées, cocher n'apprendrait rien.
{
  const p = await ouvrir("off");
  await p.evaluate(() => {
    window.signalerErreur("module non chargé : combat.js", "");
    window.signalerErreur("promesse rejetée : réseau", "");
  });
  verifier("deux erreurs sont tombées avant qu'on coche", (await etat(p)).retenues.length === 2);
  verifier("et rien ne s'affiche encore", !(await etat(p)).visible);

  const apres = await p.evaluate(() => {
    try { localStorage.setItem("ivalis_DEV_MODE", "on"); } catch (e) {}
    const n = window.montrerErreursJS(true);
    const boite = document.getElementById("bandeau-erreurs-js");
    return { rendues: n, visible: !!boite,
             lignes: boite ? [...boite.querySelectorAll("div")].map(d => d.textContent).filter(t => t.startsWith("•")) : [] };
  });
  verifier("LE BANDEAU APPARAÎT", apres.visible);
  verifier("AVEC LES ERREURS D'AVANT, TOUTES", apres.lignes.length === 2,
           apres.lignes.join(" | "));
  verifier("dont la panne de module, celle qu'on cherchait",
           apres.lignes.some(l => /module non chargé/.test(l)), apres.lignes.join(" | "));
  await p.close();
}

// =========================================================================
console.log("\n3. MODE DÉVELOPPEUR COCHÉ : LE BANDEAU SORT TOUT SEUL");
// =========================================================================
{
  const p = await ouvrir("on");
  await p.evaluate(() => window.signalerErreur("ça a cassé", "app.js:3"));
  const e = await etat(p);
  verifier("le bandeau sort sans qu'on demande rien", e.visible);
  verifier("et il dit ce qui a cassé", e.lignes.join().includes("ça a cassé"), e.lignes.join());

  // Il ne doit toujours pas voler les doigts : seule sa croix les reçoit.
  const clics = await p.evaluate(() => {
    const boite = document.getElementById("bandeau-erreurs-js");
    return { boite: getComputedStyle(boite).pointerEvents,
             croix: getComputedStyle(boite.querySelector("button")).pointerEvents };
  });
  verifier("il ne prend aucun clic", clics.boite === "none", clics.boite);
  verifier("sauf sa croix", clics.croix === "auto", clics.croix);

  // Et on peut le faire redescendre sans perdre ce qu'il contient.
  const range = await p.evaluate(() => {
    try { localStorage.setItem("ivalis_DEV_MODE", "off"); } catch (e) {}
    window.montrerErreursJS(false);
    return { visible: !!document.getElementById("bandeau-erreurs-js"),
             retenues: window.erreursJSRetenues().length };
  });
  verifier("DÉCOCHER LE RETIRE", !range.visible);
  verifier("sans rien oublier", range.retenues === 1, String(range.retenues));
  await p.close();
}

// =========================================================================
console.log("\n4. IL ÉCOUTE DÈS LE PREMIER INSTANT");
// =========================================================================
//  Le rapporteur doit être posé AVANT le premier module de la page, sinon il
//  manque exactement les pannes qu'il existe pour attraper. Et il doit brancher
//  ses guetteurs sans attendre d'être coché.
{
  // On cherche la vraie BALISE, avec son `src` : le commentaire du rapporteur
  // cite ces mots-là, et le contrôle se serait comparé à lui-même.
  const premierModule = html.indexOf('<script type="module" src=');
  verifier("il est déclaré avant le premier module",
           debut > 0 && debut < premierModule, `${debut} < ${premierModule}`);
  verifier("il écoute les erreurs quoi qu'il arrive",
           /addEventListener\("error"/.test(rapporteur));
  verifier("et les promesses rejetées",
           /addEventListener\("unhandledrejection"/.test(rapporteur));
  // La garde du mode développeur porte sur l'AFFICHAGE, pas sur l'écoute : elle
  // doit donc se trouver APRÈS la mise de côté, jamais avant.
  const misDeCote = rapporteur.indexOf("retenues.push");
  const garde = rapporteur.indexOf("if (!enModeDev()) return;");
  verifier("L'ERREUR EST RETENUE AVANT D'ÊTRE JUGÉE AFFICHABLE",
           misDeCote > 0 && garde > misDeCote, `${misDeCote} puis ${garde}`);

  // Et le mode développeur le rappelle quand on le coche.
  const app = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8');
  const bloc = app.slice(app.indexOf("window.actualiserDevMode = function"),
                         app.indexOf("window.actualiserDevMode = function") + 3000);
  verifier("actualiserDevMode le montre et le cache", /montrerErreursJS\(isDev\)/.test(bloc));
}

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
