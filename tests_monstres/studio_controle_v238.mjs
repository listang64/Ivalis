// LE STUDIO : POUSSÉE, TRACTION MAGIQUE, PEUR, PROVOCATION, FUITE CONFUSE (v238).
//
// Nico : « Pour le studio d'animation on va continuer de travailler sur les
// animations :
//   • Poussée : enlève l'animation de coup d'épée, et pour l'animation de
//     glisse, fais qu'elle soit fluide, sans saccade, et que ça laisse sur le
//     passage comme un nuage de poussière qui disparaît en fondu ;
//   • Traction magique : on revoit l'animation, fais comme un coup d'air qui
//     attire la cible vers soi ; revois le son en fonction aussi ;
//   • Peur : faut revoir tout aussi. Pas de smiley déjà ; fais que le token qui
//     lance la technique grossisse et devienne légèrement mauve foncé ; le
//     token qui reçoit devient momentanément un peu plus petit, légèrement
//     vert, avec trois traits verticaux rapprochés rouges sur le coin droit
//     de son image, avant de partir en courant ;
//   • Provocation : garde tout sauf la ligne rouge qui pop, c'est pas beau ;
//   • Confusion s'enfuit : enlève l'animation de dé et mets un point
//     d'exclamation comme les autres. »
import fs from 'fs';
import { ouvrirStudio, jouerTout, verifierDeplacements, RACINE } from './_studio_commun.mjs';

const { p, verifier, fin } = await ouvrirStudio();

// LES ESPIONS : ce qui est posé dans la scène (effets, avec leur style et leur
// texte), les animations jouées sur chaque pion (leurs images clés), les sons.
await p.evaluate(() => {
  window.__case = (id) => { const el = document.getElementById(id); return { q: +el.dataset.q, r: +el.dataset.r }; };
  window.__dist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q - b.q + a.r - b.r));
  window.__espionner = () => {
    const vus = { poses: [], anims: { heros: [], ennemi: [] }, sons: [] };
    const h = document.getElementById("studio-pion-heros"), e = document.getElementById("studio-pion-ennemi");
    const noter = (el) => {
      if (!el.classList || !el.classList.contains("anim-effet")) return;
      queueMicrotask(() => {
        const r = el.getBoundingClientRect();
        vus.poses.push({ classes: el.className, texte: el.textContent || "", style: el.style.cssText,
                         x: r.left + r.width / 2, y: r.top + r.height / 2, z: el.style.zIndex,
                         traits: el.querySelectorAll(".trait-frayeur").length,
                         fondTrait: (el.querySelector(".trait-frayeur") || {}).style ? el.querySelector(".trait-frayeur").style.background : "" });
      });
    };
    const obs = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { noter(n); if (n.querySelectorAll) n.querySelectorAll(".anim-effet").forEach(noter); })));
    obs.observe(document.getElementById("studio-pions"), { childList: true, subtree: true });
    const deja = new Set();
    const sonde = setInterval(() => {
      for (const [nom, el] of [["heros", h], ["ennemi", e]]) el.getAnimations().forEach(an => {
        if (deja.has(an)) return; deja.add(an);
        const kf = an.effect.getKeyframes();
        vus.anims[nom].push({ n: kf.length, fill: an.effect.getTiming().fill, transforms: kf.map(k => k.transform || ""), filtres: kf.map(k => k.filter || "") });
      });
    }, 15);
    const vrai = window.jouerSonCombat;
    window.jouerSonCombat = (s, f) => { vus.sons.push(s); return vrai(s, f); };
    vus.arreter = () => { obs.disconnect(); clearInterval(sonde); window.jouerSonCombat = vrai; };
    return vus;
  };
  window.__jouer = async (id) => {
    const vus = window.__espionner();
    const h0 = window.__case("studio-pion-heros"), e0 = window.__case("studio-pion-ennemi");
    const eRect0 = document.getElementById("studio-pion-ennemi").getBoundingClientRect();
    const ok = await window.jouerAnimationStudio(id);
    await new Promise(r => setTimeout(r, 40));
    vus.arreter();
    const e1 = window.__case("studio-pion-ennemi");
    return { ok, poses: vus.poses, anims: vus.anims, sons: vus.sons, h0, e0, e1, ecart0: window.__dist(h0, e0), ecart1: window.__dist(window.__case("studio-pion-heros"), e1),
             ennemi: { x: eRect0.left + eRect0.width / 2, y: eRect0.top + eRect0.height / 2, t: eRect0.width },
             reste: document.querySelectorAll("#studio-pions .anim-effet").length };
  };
  // L'ennemi posé à trois cases du héros, sur une case libre.
  window.__aTroisCases = () => {
    window.replacerPionsStudio();
    const a = window.__case("studio-pion-heros");
    for (let dq = -3; dq <= 3; dq++) for (let dr = -3; dr <= 3; dr++) {
      if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) !== 3) continue;
      if (window.deplacerPionStudio("ennemi", a.q + dq, a.r + dr)) return true;
    }
    return false;
  };
});
const fil = (x) => /9050e0|144, 80, 224|c01010|192, 16, 16|e0c8ff|224, 200, 255/i.test(x.style) && /linear-gradient\(90deg/.test(x.style);
const glisse = (anims) => anims.find(a => a.n >= 30 && a.fill === "forwards" && a.transforms.every(t => !/scale/.test(t)));

console.log("\n1. LA POUSSÉE : PLUS DE COUP D'ÉPÉE, UNE GLISSADE FLUIDE, UNE TRAÎNÉE DE POUSSIÈRE");
{
  const r = await p.evaluate(async () => { window.replacerPionsStudio(); return window.__jouer("poussee"); });
  const entailles = r.poses.filter(x => /entaille-lame/.test(x.style) || /anim-entaille/.test(x.style));
  verifier("plus de coup d'épée : ni entaille, ni bruit de lame, ni chair entaillée, ni « -5 »",
           !r.poses.some(x => /entaille-lame/.test(x.classes)) && !r.sons.includes("lame-souffle") && !r.sons.includes("entaille-chair")
           && !r.poses.some(x => x.texte.includes("-5")) && entailles.length === 0, JSON.stringify(r.sons));
  verifier("la poussée a toujours son son et son mot (« Poussé ! »)", r.sons.includes("poussee"));
  const g = glisse(r.anims.ennemi);
  verifier("une glissade d'un seul trait : UNE animation d'au moins 30 images, sans rebond par case", !!g,
           JSON.stringify(r.anims.ennemi.map(a => [a.n, a.fill])));
  verifier("…plus de petits sauts case par case (les foulées « scale(1.05) » d'avant)",
           !r.anims.ennemi.some(a => a.transforms.some(t => /scale\(1\.0[1-9]\)/.test(t))));
  // La traînée : des bouffées de poussière semées tout le long du trajet, sous le pion.
  const bouffees = r.poses.filter(x => /anim-poussiere/.test(x.classes));
  const etendue = bouffees.length ? Math.max(...bouffees.map(b => Math.hypot(b.x - bouffees[0].x, b.y - bouffees[0].y))) : 0;
  verifier("une traînée de poussière semée le long du trajet (au moins 12 bouffées, sur plus d'une case)",
           bouffees.length >= 12 && etendue > r.ennemi.t * 0.9, `${bouffees.length} bouffées sur ${Math.round(etendue)} px (pion ${Math.round(r.ennemi.t)} px)`);
  verifier("…posée sous les pions (z bas), et qui s'efface en fondu : rien ne reste", bouffees.every(b => b.z === "5") && r.reste === 0, String(r.reste));
  verifier("l'ennemi finit deux cases plus loin, et y reste", r.ecart1 === r.ecart0 + 2, `${r.ecart0} → ${r.ecart1}`);
}

console.log("\n2. LA TRACTION MAGIQUE : UN COUP D'AIR QUI ATTIRE");
{
  const r = await p.evaluate(async () => { const pose = window.__aTroisCases(); const x = await window.__jouer("traction"); x.pose = pose; return x; });
  const filets = r.poses.filter(x => /anim-filet-air/.test(x.classes));
  verifier("plus de fil violet entre le héros et l'ennemi", !r.poses.some(fil), r.poses.filter(fil).map(x => x.style.slice(0, 80)).join(" | "));
  verifier("des filets d'air pâles qui filent de l'ennemi vers le héros (au moins 8)", filets.length >= 8, String(filets.length));
  verifier("le héros avale l'air : des anneaux qui se resserrent sur lui", r.poses.filter(x => /border-radius: 50%/.test(x.style) && /230, 245, 255/.test(x.style)).length >= 3);
  verifier("le son du coup d'air", r.sons.includes("traction"), JSON.stringify(r.sons));
  verifier("l'ennemi à 3 cases est aspiré jusqu'au contact d'un seul trait, et y reste",
           r.pose && r.ecart0 === 3 && r.ecart1 === 1 && !!glisse(r.anims.ennemi), `${r.ecart0} → ${r.ecart1} ${JSON.stringify(r.anims.ennemi.map(a => a.n))}`);
  verifier("…en laissant sa traînée de poussière", r.poses.filter(x => /anim-poussiere/.test(x.classes)).length >= 6);
  // La démonstration (déjà au contact) : posé loin avec un second ennemi, les deux aspirés.
  const d = await p.evaluate(async () => { window.replacerPionsStudio(); return window.__jouer("traction"); });
  verifier("au contact, la démonstration : deux ennemis aspirés par le coup d'air, sans fil, et rien ne reste",
           d.poses.filter(x => /anim-filet-air/.test(x.classes)).length >= 12 && !d.poses.some(fil) && d.reste === 0 && d.ecart1 === d.ecart0,
           `${d.poses.filter(x => /anim-filet-air/.test(x.classes)).length} filets, ${d.ecart0} → ${d.ecart1}`);
  const son = await p.evaluate(async () => {
    const f = window.SONS_COMBAT && window.SONS_COMBAT["traction"];
    const ctx = new OfflineAudioContext(1, 44100 * 1.2, 44100);
    f(ctx, ctx.destination);
    const d = (await ctx.startRendering()).getChannelData(0);
    const crete = (a, b) => { let m = 0; for (let i = Math.floor(a * 44100); i < Math.floor(b * 44100); i++) m = Math.max(m, Math.abs(d[i])); return m; };
    return { debut: crete(0, 0.1), milieu: crete(0.25, 0.45), arrivee: crete(0.6, 0.72), fin: crete(0.9, 1.2) };
  });
  verifier("le son : une bourrasque qui s'enfle (plus forte au milieu qu'au début), le « pouf » de l'arrivée, puis le silence",
           son.milieu > son.debut * 1.5 && son.arrivee > 0.02 && son.fin < 0.01, JSON.stringify(son));
  const src = fs.readFileSync(`${RACINE}/fabrique_sons.js`, 'utf-8');
  const bloc = src.slice(src.indexOf('"traction"(ctx, s)'), src.indexOf('"peur"(ctx, s)'));
  verifier("…un son neuf (plus la note qui monte ni le pas d'avant)", !/glisse: 500, duree: 0\.5/.test(bloc) && !/pas\(ctx, s, \{ debut: 0\.5/.test(bloc));
}

console.log("\n3. LA PEUR : LE HÉROS GRANDIT, MAUVE ; L'ENNEMI RAPETISSE, VERDIT, TROIS TRAITS ROUGES, PUIS DÉTALE");
{
  const r = await p.evaluate(async () => { window.replacerPionsStudio(); return window.__jouer("peur"); });
  verifier("pas de smiley (ni 😱, ni aucun autre)", !r.poses.some(x => /😱|😨|😰/.test(x.texte)), r.poses.map(x => x.texte).filter(Boolean).join(" "));
  verifier("le héros grossit (×1,22)…", r.anims.heros.some(a => a.transforms.some(t => /scale\(1\.22\)/.test(t))));
  verifier("…et se teinte de mauve foncé", r.anims.heros.some(a => a.filtres.some(f => /sepia\(0\.9\)/.test(f) && /hue-rotate\(228deg\)/.test(f) && /brightness\(0\.7\)/.test(f))),
           JSON.stringify(r.anims.heros.map(a => a.filtres)));
  verifier("l'ennemi rapetisse un instant (×0,82) puis reprend sa taille", r.anims.ennemi.some(a => a.transforms.some(t => /scale\(0\.82\)/.test(t)) && /scale\(1\)/.test(a.transforms[a.transforms.length - 1])));
  verifier("…et verdit légèrement", r.anims.ennemi.some(a => a.filtres.some(f => /sepia\(0\.85\)/.test(f) && /hue-rotate\(58deg\)/.test(f))));
  const fr = r.poses.find(x => /anim-frayeur/.test(x.classes));
  verifier("trois traits rouges verticaux, rapprochés, au coin haut droit de son image",
           fr && fr.traits === 3 && /255, 90, 74|ff5a4a/i.test(fr.fondTrait) && fr.x > r.ennemi.x + r.ennemi.t * 0.2 && fr.y < r.ennemi.y - r.ennemi.t * 0.2,
           fr ? JSON.stringify({ traits: fr.traits, dx: Math.round(fr.x - r.ennemi.x), dy: Math.round(fr.y - r.ennemi.y), fond: fr.fondTrait }) : "aucun");
  verifier("puis il détale loin du héros (le son de la course), et y reste", r.sons.includes("peur") && r.sons.includes("course") && r.ecart1 > r.ecart0,
           `${r.ecart0} → ${r.ecart1} ${JSON.stringify(r.sons)}`);
}

console.log("\n4. LA PROVOCATION : TOUT, SAUF LA LIGNE ROUGE");
{
  const r = await p.evaluate(async () => { window.replacerPionsStudio(); return window.__jouer("provocation"); });
  verifier("plus de fil rouge qui rive l'ennemi au héros", !r.poses.some(fil), r.poses.filter(fil).map(x => x.style.slice(0, 80)).join(" | "));
  verifier("…le reste est là : l'anneau rouge, le « ❗ », le son, l'ennemi qui vacille",
           r.poses.some(x => x.texte.includes("❗")) && r.poses.some(x => /border-radius: 50%/.test(x.style) && /255, 64, 64|ff4040/i.test(x.style))
           && r.sons.includes("provocation") && r.anims.ennemi.some(a => a.transforms.some(t => /rotate\(-14deg\)/.test(t))));
}

console.log("\n5. CONFUSION : S'ENFUIT — UN « ! » AU LIEU DU DÉ");
{
  const r = await p.evaluate(async () => { window.replacerPionsStudio(); return window.__jouer("confusion-fuite"); });
  verifier("plus de dé qui roule", !r.poses.some(x => x.texte.includes("🎲")));
  verifier("un « ❗ » éclate au-dessus du confus, puis il s'enfuit en zigzag",
           r.poses.some(x => x.texte.includes("❗")) && r.sons.includes("confusion") && r.sons.includes("course"), JSON.stringify(r.sons));
}

console.log("\n6. LES CINQ, JOUÉES JUSQU'AU BOUT (rien ne reste, les pions nets, les cases)");
{
  const ids = ["poussee", "traction", "peur", "provocation", "confusion-fuite"];
  const r = await jouerTout(p, ids, 3);
  const mauvais = (f) => r.filter(f).map(x => x.id).join(", ");
  verifier("toutes se jouent sans erreur, et font quelque chose", r.every(x => x.ok && x.fait), mauvais(x => !x.ok || !x.fait));
  verifier("leurs sons sont tous au catalogue", r.every(x => x.sons.length && !x.inconnus.length), mauvais(x => !x.sons.length || x.inconnus.length));
  verifier("aucune ne laisse d'effet derrière elle", r.every(x => x.reste === 0), mauvais(x => x.reste));
  verifier("les pions restent nets et opaques (teintes et tailles rendues)", r.every(x => x.filtre === "none|none" && x.opacite === "1|1"),
           mauvais(x => !(x.filtre === "none|none" && x.opacite === "1|1")));
  verifierDeplacements(verifier, r);
}

// Pour les yeux.
if (process.env.CAPTURE_DIR) {
  for (const [id, ms, prep] of [["poussee", 560, "rien"], ["traction", 620, "loin"], ["peur", 700, "rien"], ["peur", 1150, "rien"], ["provocation", 700, "rien"]]) {
    await p.evaluate(({ id, prep }) => { window.VITESSE_ANIMATIONS = 1; if (prep === "loin") window.__aTroisCases(); else window.replacerPionsStudio();
                                         window.recentrerStudio(); window.jouerAnimationStudio(id); }, { id, prep });
    await p.waitForTimeout(ms);
    await p.locator(".studio-scene").screenshot({ path: `${process.env.CAPTURE_DIR}/v238_studio_${id}_${ms}.png` });
    await p.evaluate(() => window.annulerAnimationsCombat());
    await p.waitForTimeout(300);
  }
}

await fin();
