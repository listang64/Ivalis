// LES CORRECTIONS DE LA v257 : LES RÉGIONS DE LA CARTE DU MONDE.
//
//   « Sur la page principale de jeu, une fois la partie chargée, un bouton
//   rouge qui n'apparaît que quand DEV est activé, avec les boutons en bas à
//   droite. Il ouvre une petite popup au-dessus, qui reste tant qu'on ne la
//   ferme pas : une case pour afficher ou masquer les boîtes, un bouton pour
//   créer une nouvelle boîte. Des zones cliquables attachées à la carte, avec
//   chacune un numéro unique, affiché dedans. En mode DEV, boîtes affichées, le
//   clic ne fait rien (édition). Clic maintenu qu'on bouge : la boîte se
//   déplace. Un petit carré à chaque coin, qu'on étire ou rétracte. Un clic
//   sur un bord crée un nouveau point, qu'on étire pour une forme sur mesure. »
//
// Tout se joue au vrai pointeur (souris de Playwright) sur le vrai écran de jeu.
import fs from 'fs';
import { ouvrirStudio } from './_studio_commun.mjs';

const { p, verifier, fin } = await ouvrirStudio();
console.log("\n=========================================================");
console.log("  LES CORRECTIONS DE LA v257 : LES RÉGIONS DE LA CARTE");
console.log("=========================================================");

const cliquer = async (sel) => { if (await p.$(sel)) await p.click(sel, { timeout: 3000 }).catch(() => {}); };
const ou = (f) => p.evaluate(`(() => { try { return (${f})(); } catch (e) { return { erreur: e.message }; } })()`);
await p.evaluate(() => {
  window.fermerStudioAnimation();
  const param = document.getElementById("conteneur-parametres");
  if (param) { param.style.display = "none"; param.classList.remove("ouvert"); }
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { e.style.display = e.id === "ecran-jeu" ? "block" : "none"; });
  const combat = document.getElementById("fenetre-combat"); if (combat) combat.style.display = "none";
  // Le menu latéral recouvre la droite de la carte : on le range, comme un joueur peut le faire.
  const menu = document.getElementById("menu-lateral"); if (menu) menu.style.display = "none";
  ["ivalis_REGIONS_VISIBLES", "ivalis_DEV_MODE"].forEach(k => localStorage.removeItem(k));
  if (window.recadrerCarte) window.recadrerCarte();
  if (window.basculerDevMode) window.basculerDevMode(false);
  window.__ecrits = []; window.__majs = [];
});
await p.waitForTimeout(300);

// Le centre (à l'écran) d'une région, et l'écran de ses points.
const regionEcran = (n) => p.evaluate((n) => {
  const g = document.querySelector(`#calque-regions .region[data-numero="${n}"]`);
  const r = (window.REGIONS_CARTE || {})[n];
  if (!g || !r) return null;
  const carte = document.getElementById("carte-fond-jeu").getBoundingClientRect();
  const k = carte.width / 3840;
  const ecran = (pt) => ({ x: carte.left + pt.x * k, y: carte.top + pt.y * k });
  const c = window.centreRegion(r.points);
  return { centre: ecran(c), points: r.points.map(ecran), carte: r.points.map(q => ({ ...q })), k,
           numero: (g.querySelector(".region-numero") || {}).textContent || null, poignees: g.querySelectorAll(".region-poignee").length };
}, n).then(r => r || { centre: { x: 20, y: 20 }, points: Array.from({ length: 6 }, () => ({ x: 20, y: 20 })),
                        carte: Array.from({ length: 4 }, () => ({ x: 0, y: 0 })), k: 1, numero: null, poignees: 0, absente: true });

console.log("\n1. LE BOUTON ROUGE ET SA POPUP");
{
  const hors = await ou(() => getComputedStyle(document.getElementById("conteneur-regions-dev")).display);
  await p.evaluate(() => window.basculerDevMode(true));
  await p.waitForTimeout(100);
  const r = await ou(() => {
    const b = document.getElementById("btn-regions-dev");
    const rb = b.getBoundingClientRect();
    return { visible: getComputedStyle(document.getElementById("conteneur-regions-dev")).display !== "none",
             dansLaBarre: !!b.closest("#menu-navigation-bas"),
             fond: getComputedStyle(b).backgroundImage, droite: innerWidth - rb.right, bas: innerHeight - rb.bottom };
  });
  verifier("hors mode DEV, pas de bouton", hors === "none", hors);
  verifier("en mode DEV : le bouton, avec ceux du bas à droite", r.visible && r.dansLaBarre && r.droite < 260 && r.bas < 60, JSON.stringify(r));
  verifier("…rouge", /rgb\(2[0-9]{2}, [0-9]{1,2}, [0-9]{1,2}\)|rgb\(1[6-9][0-9], [0-9]{1,2}, [0-9]{1,2}\)/.test(r.fond), r.fond);
  await cliquer("#btn-regions-dev");
  const pop = await ou(() => {
    const pp = document.getElementById("popup-regions-dev"), b = document.getElementById("btn-regions-dev");
    const rp = pp.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return { ouverte: getComputedStyle(pp).display === "block", dessus: rp.bottom <= rb.top + 1, dansEcran: rp.left >= 0 && rp.right <= innerWidth,
             caseExiste: !!document.getElementById("case-regions-visibles"), nouvelle: !!document.getElementById("btn-regions-nouvelle") };
  });
  verifier("le bouton ouvre la popup, au-dessus de lui, dans l'écran", pop.ouverte && pop.dessus && pop.dansEcran, JSON.stringify(pop));
  verifier("dedans : la case « Afficher les boîtes » et « Nouvelle boîte »", pop.caseExiste && pop.nouvelle);
  await p.mouse.click(400, 300);
  await p.waitForTimeout(100);
  verifier("un clic ailleurs ne la ferme pas", await ou(() => getComputedStyle(document.getElementById("popup-regions-dev")).display === "block"));
}

console.log("\n2. CRÉER DES BOÎTES : NUMÉROTÉES, JAMAIS LE MÊME NUMÉRO");
let b1;
{
  await cliquer("#btn-regions-nouvelle");
  await p.waitForTimeout(150);
  b1 = await regionEcran(1);
  const caseCochee = await ou(() => document.getElementById("case-regions-visibles").checked);
  verifier("« Nouvelle boîte » : la boîte n° 1, rectangle, ses quatre coins", !!b1 && b1.carte.length === 4 && b1.poignees === 4, JSON.stringify(b1 && b1.carte));
  verifier("…son numéro écrit dedans", b1 && b1.numero === "1");
  verifier("…au milieu de ce qu'on voit de la carte", !!b1 && b1.centre.x > 200 && b1.centre.x < 1000 && b1.centre.y > 250 && b1.centre.y < 600, JSON.stringify(b1 && b1.centre));
  verifier("créer une boîte affiche les boîtes (la case se coche)", caseCochee);
  await cliquer("#btn-regions-nouvelle");
  await p.waitForTimeout(100);
  const n2 = await ou(() => Object.keys(window.REGIONS_CARTE).join(","));
  await ou(() => window.supprimerRegion(2, { sansConfirmer: true }));
  await cliquer("#btn-regions-nouvelle");
  await p.waitForTimeout(100);
  const apres = await ou(() => Object.keys(window.REGIONS_CARTE).join(","));
  verifier("la n° 2, supprimée : la suivante est la n° 3 (un numéro ne resservira pas)", n2 === "1,2" && apres === "1,3", `${n2} → ${apres}`);
  const suppr = await ou(() => (window.__majs || []).some(m => m.chemin === "Carte_Monde/Regions" && "Regions.2" in m.data));
  verifier("la suppression s'écrit dans la base (Carte_Monde/Regions)", suppr);
  // Un autre poste écrit une boîte n° 7 et Prochain_Numero 9 : elle s'affiche, la suivante sera la n° 9.
  await ou(() => window.appliquerRegionsDeLaBase({ Prochain_Numero: 9, Regions: {
      1: { Numero: 1, Points: window.REGIONS_CARTE[1].points }, 3: { Numero: 3, Points: window.REGIONS_CARTE[3].points },
      7: { Numero: 7, Points: [{ x: 300, y: 300 }, { x: 600, y: 300 }, { x: 600, y: 500 }, { x: 300, y: 500 }] } } }));
  await cliquer("#btn-regions-nouvelle");
  await p.waitForTimeout(100);
  const autre = await ou(() => Object.keys(window.REGIONS_CARTE).join(","));
  verifier("une boîte écrite par un autre poste s'affiche ; la numérotation continue après la sienne", autre === "1,3,7,9", autre);
  await ou(() => { [3, 7, 9].forEach(n => window.supprimerRegion(n, { sansConfirmer: true })); });
}

console.log("\n3. LA DÉPLACER, L'ÉTIRER, LUI AJOUTER DES POINTS");
{
  b1 = await regionEcran(1);
  const panAvant = await ou(() => window.cadrageCarteMonde().panX);
  await p.evaluate(() => { window.__ecrits = []; });
  // Clic maintenu au milieu, on bouge de 80 px à droite et 40 vers le bas.
  await p.mouse.move(b1.centre.x, b1.centre.y);
  await p.mouse.down();
  await p.mouse.move(b1.centre.x + 40, b1.centre.y + 20, { steps: 4 });
  await p.mouse.move(b1.centre.x + 80, b1.centre.y + 40, { steps: 4 });
  await p.mouse.up();
  await p.waitForTimeout(100);
  const d = await regionEcran(1);
  const dx = d.carte[0].x - b1.carte[0].x, dy = d.carte[0].y - b1.carte[0].y;
  const attenduX = 80 / b1.k, attenduY = 40 / b1.k;
  verifier("clic maintenu et on bouge : la boîte suit, toute entière", Math.abs(dx - attenduX) < 3 && Math.abs(dy - attenduY) < 3
           && d.carte.every((q, i) => Math.abs((q.x - b1.carte[i].x) - dx) < 1.5), `${Math.round(dx)},${Math.round(dy)} (attendu ${Math.round(attenduX)},${Math.round(attenduY)})`);
  const panApres = await ou(() => window.cadrageCarteMonde().panX);
  verifier("…et la carte, elle, n'a pas glissé", panAvant === panApres, `${panAvant} → ${panApres}`);
  const ecrit = await ou(() => (window.__ecrits || []).filter(e => e.chemin === "Carte_Monde/Regions").map(e => JSON.stringify(e.data) + JSON.stringify(e.options)));
  verifier("…sa nouvelle place s'écrit dans la base, une fois le doigt levé", ecrit.length === 1 && /"Regions":\{"1":\{"Numero":1,"Points"/.test(ecrit[0]) && /merge/.test(ecrit[0]),
           JSON.stringify(ecrit).slice(0, 200));

  // Le coin en bas à droite, étiré de 60 px.
  const c = d.points[2];
  await p.mouse.move(c.x, c.y);
  await p.mouse.down();
  await p.mouse.move(c.x + 30, c.y + 30, { steps: 3 });
  await p.mouse.move(c.x + 60, c.y + 50, { steps: 3 });
  await p.mouse.up();
  await p.waitForTimeout(100);
  const e = await regionEcran(1);
  verifier("le carré d'un coin, tiré : ce coin seul s'étire", Math.abs(e.points[2].x - (c.x + 60)) < 3 && Math.abs(e.points[2].y - (c.y + 50)) < 3
           && [0, 1, 3].every(i => Math.abs(e.carte[i].x - d.carte[i].x) < 1 && Math.abs(e.carte[i].y - d.carte[i].y) < 1),
           JSON.stringify(e.points.map(q => [Math.round(q.x), Math.round(q.y)])));

  // Un clic au milieu du bord du haut : un nouveau point, qu'on tire vers le haut.
  const m = { x: (e.points[0].x + e.points[1].x) / 2, y: (e.points[0].y + e.points[1].y) / 2 };
  await p.mouse.move(m.x, m.y);
  await p.mouse.down();
  await p.mouse.move(m.x, m.y - 30, { steps: 3 });
  await p.mouse.move(m.x, m.y - 70, { steps: 3 });
  await p.mouse.up();
  await p.waitForTimeout(100);
  const f = await regionEcran(1);
  verifier("un clic sur un bord : un nouveau point, entre les deux coins, qu'on étire (forme sur mesure)",
           f.carte.length === 5 && f.poignees === 5 && Math.abs(f.points[1].y - (m.y - 70)) < 3 && Math.abs(f.points[1].x - m.x) < 3,
           JSON.stringify(f.points.map(q => [Math.round(q.x), Math.round(q.y)])));
  verifier("…le numéro reste dans la boîte", f.numero === "1"
           && await ou(() => { const t = document.querySelector('#calque-regions .region[data-numero="1"] .region-numero').getBoundingClientRect();
                               const g = document.querySelector('#calque-regions .region[data-numero="1"] .region-forme').getBoundingClientRect();
                               return t.left >= g.left && t.right <= g.right && t.top >= g.top && t.bottom <= g.bottom; }));
  // Un simple clic sur un bord, sans tirer : le point naît quand même.
  const g = f.points[3], h = f.points[4];
  await p.mouse.click((g.x + h.x) / 2, (g.y + h.y) / 2);
  await p.waitForTimeout(100);
  const g6 = await regionEcran(1);
  verifier("un clic sur un bord, sans tirer : le point est posé (6 points)", g6.carte.length === 6, `${g6.carte.length}`);
  // Double-clic sur ce point : il s'en va.
  const q = g6.points[4];
  await p.mouse.dblclick(q.x, q.y);
  await p.waitForTimeout(100);
  const g5 = await regionEcran(1);
  verifier("double-clic sur un point : il s'en va", g5.carte.length === 5, `${g5.carte.length}`);
}

console.log("\n4. ÉDITION OU JEU : LE CLIC");
{
  await ou(() => { window.__clics = []; window.ACTIONS_REGIONS = window.ACTIONS_REGIONS || {}; window.ACTIONS_REGIONS[1] = (n) => window.__clics.push(n); window.dessinerRegions(); });
  let b = await regionEcran(1);
  await p.mouse.click(b.centre.x, b.centre.y);
  await p.waitForTimeout(80);
  const enEdition = await ou(() => window.__clics.length);
  verifier("boîtes affichées (édition) : le clic ne déclenche rien", enEdition === 0, `${enEdition}`);
  // On décoche : les boîtes disparaissent, le clic joue l'action.
  await cliquer("#case-regions-visibles");
  await p.waitForTimeout(100);
  const jeu = await ou(() => ({ edition: window.modeEditionRegions(), numeros: document.querySelectorAll("#calque-regions .region-numero").length,
                                 poignees: document.querySelectorAll("#calque-regions .region-poignee").length,
                                 remplissage: getComputedStyle(document.querySelector("#calque-regions .region-forme")).fill }));
  verifier("décochée : plus de numéros, plus de poignées, la boîte est invisible", !jeu.edition && jeu.numeros === 0 && jeu.poignees === 0
           && /transparent|rgba\(0, 0, 0, 0\)/.test(jeu.remplissage), JSON.stringify(jeu));
  b = await regionEcran(1);
  await p.mouse.click(b.centre.x, b.centre.y);
  await p.waitForTimeout(80);
  verifier("…et le clic sur la région joue son action (son numéro)", JSON.stringify(await ou(() => window.__clics)) === "[1]");
  // Une région sans action laisse passer le clic à la carte.
  await ou(() => { delete window.ACTIONS_REGIONS[1]; window.dessinerRegions(); });
  const traverse = await ou(() => { const r = window.REGIONS_CARTE[1]; const c = window.centreRegion(r.points);
    const carte = document.getElementById("carte-fond-jeu").getBoundingClientRect(); const k = carte.width / 3840;
    const e = document.elementFromPoint(carte.left + c.x * k, carte.top + c.y * k); return e ? (e.id || e.getAttribute("class") || e.tagName) : null; });
  verifier("une région sans action laisse passer le clic à la carte", traverse === "carte-fond-jeu", traverse);
  await cliquer("#case-regions-visibles");
  await p.waitForTimeout(80);
}

console.log("\n5. ATTACHÉES À LA CARTE");
{
  const avant = await regionEcran(1);
  const pans = await ou(() => { const a = window.cadrageCarteMonde().panX; window.glisserCarteMonde(a - 150); return [a, window.cadrageCarteMonde().panX]; });
  await p.waitForTimeout(80);
  const apres = await regionEcran(1);
  verifier("la carte glisse de 150 px : la boîte glisse avec elle", Math.abs((apres.centre.x - avant.centre.x) - (pans[1] - pans[0])) < 1.5
           && Math.abs(apres.carte[0].x - avant.carte[0].x) < 0.01, `${Math.round(apres.centre.x - avant.centre.x)} px pour ${pans[1] - pans[0]}`);
  // Glisser la carte depuis un endroit vide, en édition : la carte glisse toujours.
  await p.mouse.move(150, 700);
  await p.mouse.down();
  await p.mouse.move(250, 700, { steps: 5 });
  await p.mouse.up();
  const pan2 = await ou(() => window.cadrageCarteMonde().panX);
  verifier("en édition, la carte glisse encore depuis un endroit sans boîte", pan2 > pans[1], `${pans[1]} → ${pan2}`);
  await p.evaluate(() => window.recadrerCarte());
}

console.log("\n6. LA POPUP SE FERME ; HORS DEV, TOUT S'EFFACE");
{
  await cliquer(".popup-regions-fermer");
  await p.waitForTimeout(80);
  const fermee = await ou(() => getComputedStyle(document.getElementById("popup-regions-dev")).display === "none");
  verifier("✕ ferme la popup", fermee);
  await cliquer("#btn-regions-dev");
  await p.waitForTimeout(80);
  await p.evaluate(() => window.basculerDevMode(false));
  await p.waitForTimeout(80);
  const hors = await ou(() => ({ bouton: getComputedStyle(document.getElementById("conteneur-regions-dev")).display,
                                 popup: getComputedStyle(document.getElementById("popup-regions-dev")).display,
                                 edition: window.modeEditionRegions(), numeros: document.querySelectorAll("#calque-regions .region-numero").length,
                                 gardee: !!window.REGIONS_CARTE[1] }));
  verifier("DEV coupé : plus de bouton, plus de popup, les boîtes invisibles (mais gardées)", hors.bouton === "none" && hors.popup === "none"
           && !hors.edition && hors.numeros === 0 && hors.gardee, JSON.stringify(hors));
  const src = fs.readFileSync('/home/user/Ivalis/index.html', 'utf-8');
  verifier("le module est chargé par la page, versionné", /regions_carte\.js\?v=\d+/.test(src));
}

await fin();
