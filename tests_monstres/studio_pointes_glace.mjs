// LE STUDIO : LES POINTES DE GLACE DU PROFANATEUR (v239).
//
// Nico : « Profanateur lvl5 : Pointes de glace : créer en cône devant le
// lanceur une zone de terrain de pics de glace. » La technique est en jeu ;
// son animation, d'abord au Studio (section des classes) :
//   • le Profanateur rassemble le froid, puis le cône jaillit RANG APRÈS RANG
//     (2, 3, 4 cases) devant lui — vers l'ennemi —, chaque case gelée et
//     hérissée de pics, des cristaux autour ;
//   • l'ennemi pris dedans se fige : givré, « Glacé ! », 5 % de ses PV ;
//   • tout s'efface en fondu, rien ne reste, les pions restent à leur place.
// Et la Relève des morts, passée au niveau 1 (v237), s'y range au niveau 1.
import { ouvrirStudio, jouerTout } from './_studio_commun.mjs';

const { p, verifier, fin } = await ouvrirStudio();

console.log("\n1. LES POINTES DE GLACE, JOUÉES");
{
  const r = await p.evaluate(async () => {
    window.replacerPionsStudio();
    const calque = document.getElementById("studio-pions");
    const h = document.getElementById("studio-pion-heros"), e = document.getElementById("studio-pion-ennemi");
    const vus = { cases: [], pics: 0, cristaux: 0, textes: [], sons: [], filtresEnnemi: [] };
    const t0 = performance.now();
    const obs = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
      if (!n.classList) return;
      if (n.classList.contains("anim-pic-pointe")) vus.pics++;
      if (n.classList.contains("anim-cristaux")) vus.cristaux++;
      if (/clip-path: polygon\(25% 0/.test(n.style.cssText)) {
        const r = n.getBoundingClientRect();
        vus.cases.push({ x: parseFloat(n.style.left), y: parseFloat(n.style.top), quand: performance.now() - t0 });
      }
    })));
    obs.observe(calque, { childList: true, subtree: true });
    const vraiSon = window.jouerSonCombat;
    window.jouerSonCombat = (s, f) => { vus.sons.push(s); return vraiSon(s, f); };
    const vraiTexte = window.afficherMessageFlottantHex;
    window.afficherMessageFlottantHex = (q, r, t, c, o) => { vus.textes.push(t); return vraiTexte(q, r, t, c, o); };
    const sonde = setInterval(() => e.getAnimations().forEach(an => an.effect.getKeyframes().forEach(k => { if (k.filter) vus.filtresEnnemi.push(k.filter); })), 30);
    const ok = await window.jouerAnimationStudio("pointes-glace");
    clearInterval(sonde); obs.disconnect();
    window.jouerSonCombat = vraiSon; window.afficherMessageFlottantHex = vraiTexte;
    const centre = (el) => { const b = el.getBoundingClientRect(), c = calque.getBoundingClientRect(); return { x: b.left + b.width / 2 - c.left, y: b.top + b.height / 2 - c.top }; };
    const A = centre(h), B = centre(e);
    return { ok, ...vus, A, B, reste: calque.querySelectorAll(".anim-effet").length,
             liste: window.ANIMATIONS_COMBAT.filter(a => /Profanateur/.test(a.groupe || "") || ["releve-zombies", "zombie-marche-attaque", "pointes-glace"].includes(a.id))
                                           .map(a => a.id + "|" + a.nom) };
  });
  const dist = (c) => Math.hypot(c.x - r.A.x, c.y - r.A.y);
  const pas = r.cases.length ? Math.min(...r.cases.map(dist)) : 0;
  const rangs = [1, 2, 3].map(k => r.cases.filter(c => Math.round(dist(c) / pas) === k || (k === 3 && dist(c) / pas > 2.5)).length);
  verifier("elle se joue", r.ok === true);
  verifier("9 cases gelées, en cône : 2, 3 puis 4 cases de plus en plus loin du héros",
           r.cases.length === 9 && r.cases.every(c => dist(c) <= pas * 3.2), `${r.cases.length} cases — ${r.cases.map(c => (dist(c) / pas).toFixed(2)).join(" ")}`);
  const ordre = [...r.cases].sort((x, y) => x.quand - y.quand).map(dist);
  verifier("…rang après rang (les plus proches d'abord)", ordre.every((d, i) => i === 0 || d >= ordre[i - 1] - pas * 0.6), ordre.map(d => (d / pas).toFixed(1)).join(" "));
  const versEnnemi = r.cases.reduce((m, c) => m + ((c.x - r.A.x) * (r.B.x - r.A.x) + (c.y - r.A.y) * (r.B.y - r.A.y)), 0);
  verifier("…devant lui, vers l'ennemi", versEnnemi > 0);
  verifier("des pics de glace sur chaque case, des cristaux autour", r.pics >= 9 * 4 && r.cristaux >= 9, `${r.pics} pics, ${r.cristaux} cristaux`);
  verifier("les sons : le froid qui se forme, puis un éclat par rang", r.sons[0] === "gel-lancer" && r.sons.filter(s => s === "glace-impact").length === 3,
           JSON.stringify(r.sons));
  verifier("l'ennemi pris dedans se fige : givré, « Glacé ! », -2 (5 % de 40)",
           r.textes.includes("Glacé !") && r.textes.includes("-2") && r.filtresEnnemi.some(f => /hue-rotate\(170deg\)/.test(f)), JSON.stringify(r.textes));
  verifier("tout s'efface : rien ne reste", r.reste === 0, String(r.reste));
  verifier("le Studio la range avec le Profanateur, au niveau 5 ; la Relève des morts et le zombie au niveau 1",
           r.liste.includes("pointes-glace|Niv.5 Pointes de glace") && r.liste.includes("releve-zombies|Niv.1 Relève des zombies")
           && r.liste.includes("zombie-marche-attaque|Niv.1 Zombie qui marche / qui attaque"), JSON.stringify(r.liste));
}

console.log("\n2. JOUÉE JUSQU'AU BOUT, COMME LES AUTRES");
{
  const r = await jouerTout(p, ["pointes-glace"], 3);
  const x = r[0];
  verifier("un son du catalogue, rien qui reste, les pions nets et à leur place",
           x.ok && x.fait && x.sons.length && !x.inconnus.length && x.reste === 0 && x.filtre === "none|none" && x.opacite === "1|1"
           && !x.deplaces.heros && !x.deplaces.ennemi && x.retour, JSON.stringify(x));
}

if (process.env.CAPTURE_DIR) {
  await p.evaluate(() => { window.VITESSE_ANIMATIONS = 1; window.replacerPionsStudio(); window.recentrerStudio(); window.jouerAnimationStudio("pointes-glace"); });
  await p.waitForTimeout(1500);
  await p.locator(".studio-scene").screenshot({ path: `${process.env.CAPTURE_DIR}/v239_studio_pointes_glace.png` });
  await p.evaluate(() => window.annulerAnimationsCombat());
}

await fin();
