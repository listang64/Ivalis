// LES DÉPLACEMENTS DU STUDIO, RETOUCHÉS PAR NICO
//
//   • « Marche case par case : un bruit de pas sur un sol herbeux, terre
//     plutôt ; reprendre l'animation avec un effet de petit saut case par
//     case ; on garde la fatigue qui pop au-dessus » ;
//   • « Terrain difficile : ne pas faire pop de cailloux, et même animation
//     que la marche mais en plus lent » ;
//   • « Marche gelée : pas d'effet sur le token, la même animation que la
//     marche, en dessous quelques cristaux gelés ; un craquement de glace » ;
//   • « Repli : vire le logo bleu » ; « Fuite sous la peur : enlève le
//     smiley » ; « Entrée dans une zone électrique : un bruitage électrique » ;
//   • « les pions ne sont pas de la même taille par rapport aux cases que
//     dans mon menu combat » : chaque pion du Studio prend la taille de son
//     pion de combat (55 par défaut, comme au combat).
import { ouvrirStudio, jouerTout } from './_studio_commun.mjs';

const { p, verifier, fin } = await ouvrirStudio();

// Ce qu'une animation fait au pion du héros et au calque, pendant qu'elle joue.
const observer = (id) => p.evaluate(async (id) => {
  window.replacerPionsStudio();
  window.VITESSE_ANIMATIONS = 2;
  const h = document.getElementById("studio-pion-heros");
  const images = [], vues = new Set();
  let cristaux = 0, gravats = 0, icones = [], fini = false;
  const sonde = () => {
    h.getAnimations().forEach(an => { if (!vues.has(an)) { vues.add(an); images.push(an.effect.getKeyframes().map(k => `${k.transform || ""}|${k.filter || ""}`)); } });
    cristaux = Math.max(cristaux, document.querySelectorAll("#studio-pions .anim-cristaux").length);
    gravats = Math.max(gravats, document.querySelectorAll("#studio-pions .anim-effet img.gravats-terre, #studio-gravats img").length);
    document.querySelectorAll("#studio-pions .anim-effet").forEach(e => { const t = e.textContent || ""; if (/↩️|😱/.test(t)) icones.push(t); });
    if (!fini) requestAnimationFrame(sonde);
  };
  const vrai = window.jouerSonCombat, sons = [];
  window.jouerSonCombat = (s, f) => { sons.push(s); return vrai(s, f); };
  const textes = [], vraiTexte = window.afficherMessageFlottantHex;
  window.afficherMessageFlottantHex = (q, r, t, c, o) => { textes.push(t); return vraiTexte(q, r, t, c, o); };
  requestAnimationFrame(sonde);
  const t0 = performance.now();
  await window.jouerAnimationStudio(id);
  const ms = performance.now() - t0;
  await new Promise(r => setTimeout(r, 60));
  fini = true;
  window.jouerSonCombat = vrai;
  window.afficherMessageFlottantHex = vraiTexte;
  window.VITESSE_ANIMATIONS = 1;
  window.replacerPionsStudio();
  return { images, sons, textes, cristaux, gravats, icones, ms };
}, id);

console.log("\n1. LA MARCHE : DE PETITS SAUTS, UN PAS SUR L'HERBE ET LA TERRE");
const marche = await observer("marche");
{
  const sauts = marche.images.filter(k => k.length === 4 && /scale\(1\.14\)/.test(k[1]) && /scale\(0\.95\)/.test(k[2]));
  verifier("trois pas, chacun un petit saut (il grossit en quittant le sol, retombe tassé, se redresse)", sauts.length === 3, `${sauts.length} sauts`);
  verifier("un pas sur l'herbe et la terre à chaque case", marche.sons.filter(s => s === "pas-herbe").length === 3 && !marche.sons.includes("pas"), JSON.stringify(marche.sons));
  verifier("la fatigue pop toujours au-dessus, à chaque case", marche.textes.filter(t => t === "-1 ⚡").length === 3, JSON.stringify(marche.textes));
}

console.log("\n2. LE TERRAIN DIFFICILE : LA MÊME MARCHE, PLUS LENTE, SANS CAILLOUX");
{
  const r = await observer("marche-difficile");
  const sauts = r.images.filter(k => k.length === 4 && /scale\(0\.95\)/.test(k[2]));
  verifier("plus aucun caillou ne pop sur le chemin", r.gravats === 0, String(r.gravats));
  verifier("la même marche par petits sauts", sauts.length === 2, `${sauts.length} sauts`);
  verifier("plus lente que la marche (par case)", r.ms / 2 > marche.ms / 3 * 1.3, `${Math.round(r.ms / 2)} ms/case contre ${Math.round(marche.ms / 3)}`);
  verifier("chaque case coûte double : « -2 ⚡ », les pas lourds", r.textes.filter(t => t === "-2 ⚡").length === 2 && r.sons.includes("pas-lourd"));
}

console.log("\n3. LA MARCHE GELÉE : RIEN SUR LE PION, DES CRISTAUX DESSOUS, LA GLACE QUI CRAQUE");
{
  const r = await observer("marche-gelee");
  const teinte = r.images.some(k => k.some(x => /hue-rotate\(170deg\)/.test(x)));
  const sauts = r.images.filter(k => k.length === 4 && /scale\(1\.14\)/.test(k[1]));
  verifier("plus aucune teinte de givre sur le pion", !teinte);
  verifier("la même marche par petits sauts", sauts.length === 2, `${sauts.length} sauts`);
  verifier("quelques cristaux de givre sous le pion, à chaque pas", r.cristaux >= 1, String(r.cristaux));
  verifier("un craquement de glace à chaque case", r.sons.filter(s => s === "pas-glace").length === 2 && !r.sons.includes("pas-givre"), JSON.stringify(r.sons));
}

console.log("\n4. SANS LOGO BLEU, SANS SMILEY ; LA DÉCHARGE ÉLECTRIQUE");
{
  const repli = await observer("repli");
  const peur = await observer("fuite-peur");
  const zone = await observer("entree-zone");
  verifier("le repli : plus d'icône ↩️ qui pop avec le texte", repli.icones.length === 0 && repli.textes.includes("Repli : sans opportunité"));
  verifier("la fuite sous la Peur : plus de smiley 😱", peur.icones.length === 0 && peur.textes.includes("Peur : il s'enfuit !"));
  verifier("l'entrée dans la zone électrique : le bruitage électrique (décharge)", zone.sons.includes("decharge") && !zone.sons.includes("electrique"), JSON.stringify(zone.sons));
  const r = await jouerTout(p, ["marche", "marche-difficile", "marche-gelee", "repli", "fuite-peur", "entree-zone"], 3);
  verifier("toutes se jouent jusqu'au bout, ne laissent rien, leurs sons existent", r.every(x => x.ok && x.reste === 0 && x.inconnus.length === 0),
           JSON.stringify(r.filter(x => !(x.ok && x.reste === 0 && x.inconnus.length === 0)).map(x => x.id)));
}

console.log("\n5. LES NOUVEAUX SONS");
{
  const r = await p.evaluate(async () => {
    const out = {};
    for (const id of ["pas-herbe", "pas-glace", "decharge"]) {
      const ctx = new OfflineAudioContext(1, 44100, 44100);
      const g = ctx.createGain(); g.connect(ctx.destination);
      window.SONS_COMBAT[id](ctx, g);
      const d = (await ctx.startRendering()).getChannelData(0);
      let crete = 0, dernier = 0, aigu = 0;
      for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > crete) crete = v; if (v > 0.003) dernier = i; }
      for (let i = 1; i < d.length; i++) aigu += Math.abs(d[i] - d[i - 1]);
      out[id] = { crete: +crete.toFixed(3), duree: +(dernier / 44100).toFixed(2), aigu: +aigu.toFixed(1) };
    }
    return out;
  });
  verifier("trois sons neufs : le pas d'herbe, le pas sur la glace, la décharge", Object.values(r).every(x => x.crete > 0.02 && x.crete < 0.95), JSON.stringify(r));
  verifier("des pas brefs (moins d'un tiers de seconde), une décharge plus longue", r["pas-herbe"].duree < 0.3 && r["pas-glace"].duree < 0.3 && r.decharge.duree > 0.3,
           JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.duree]))));
}

console.log("\n6. LA TAILLE DES PIONS, CELLE DU COMBAT");
{
  const r = await p.evaluate(async () => {
    const largeur = (id) => document.getElementById(id).getBoundingClientRect().width;
    const hex = () => {
      const m = document.getElementById("studio-plateau").style.transform.match(/scale\(([\d.e]+)\)/);
      return 2 * window.PLATEAU_VTT.hexSize * (+m[1]);
    };
    window.recentrerStudio();
    const avant = { heros: largeur("studio-pion-heros") / hex(), ennemi: largeur("studio-pion-ennemi") / hex() };
    // Une créature posée sur la carte, à son pion de 70 : l'ennemi du Studio la prend.
    window.PERSOS_PARTIE = [...window.PERSOS_PARTIE, { idPersonnage: "M1", estMonstre: true, prenom: "Goule" }];
    window.TOKENS_VTT_DATA = { ...window.TOKENS_VTT_DATA, M1: { q: 6, r: 0, taille: 70 } };
    window.changerHerosStudio(document.getElementById("studio-heros").value);
    window.recentrerStudio();
    const apres = { ennemi: largeur("studio-pion-ennemi") / hex() };
    return { avant, apres, hexSize: window.PLATEAU_VTT.hexSize };
  });
  // Au combat, un pion de taille T occupe T / (2 × rayon de case) de la largeur d'une case.
  const attendu = (t) => t / (2 * r.hexSize);
  verifier("le héros : la taille de son pion de combat (48), dans la même proportion qu'au combat",
           Math.abs(r.avant.heros - attendu(48)) < 0.01, `${r.avant.heros.toFixed(3)} pour ${attendu(48).toFixed(3)}`);
  verifier("l'ennemi, sans créature sur la carte : 55, la taille par défaut du combat", Math.abs(r.avant.ennemi - attendu(55)) < 0.01,
           `${r.avant.ennemi.toFixed(3)} pour ${attendu(55).toFixed(3)}`);
  verifier("une créature sur la carte : l'ennemi prend la taille de son pion (70)", Math.abs(r.apres.ennemi - attendu(70)) < 0.01,
           `${r.apres.ennemi.toFixed(3)} pour ${attendu(70).toFixed(3)}`);
}

// Pour les yeux : la marche gelée et ses cristaux, la marche et son petit saut.
if (process.env.CAPTURE_DIR) {
  for (const [id, ms] of [["marche", 560], ["marche-gelee", 900], ["entree-zone", 1500]]) {
    await p.evaluate((id) => { window.replacerPionsStudio(); window.recentrerStudio(); window.jouerAnimationStudio(id); }, id);
    await p.waitForTimeout(ms);
    await p.locator(".studio-scene").screenshot({ path: `${process.env.CAPTURE_DIR}/studio_${id}.png` });
    await p.evaluate(() => window.annulerAnimationsCombat());
    await p.waitForTimeout(300);
  }
}

await fin();
