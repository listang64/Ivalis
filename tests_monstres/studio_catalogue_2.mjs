// LE CATALOGUE COMPLET DU STUDIO D'ANIMATION (2/2) : les figurants, la vue de
// dessus, et les sections 5 à 9 jouées de bout en bout.
//
// Nico : « Pour rappel, la vue du token est une vue de haut sur la map. »
//   • un bond : le pion s'élève (il GROSSIT) pendant que son ombre reste au sol ;
//   • les alliés, renforts, zombies, compagnons sont des figurants posés sur
//     de vraies cases voisines, chacun sa case, et ils s'en vont à la fin ;
//   • le Transfert échange vraiment les places ; le Mur de terre surgit sur
//     plusieurs cases ;
//   • EN VRAIES CONDITIONS (Nico : « que ça fasse bouger le pion ») : un
//     déplacement laisse le pion sur sa nouvelle case ; la Traction attire un
//     ennemi lointain jusqu'au contact, l'Inertie martiale y fait charger le
//     héros ; « Replacer les pions » ramène la scène de départ ;
//   • contrôle, états, zones, classes, talents : chacune se joue jusqu'au
//     bout, fait quelque chose, joue son son, ne laisse rien.
import { ouvrirStudio, jouerTout, verifierDeplacements } from './_studio_commun.mjs';

const { p, verifier, fin } = await ouvrirStudio();

console.log("\n1. VU DE DESSUS : LE BOND S'ÉLÈVE, L'OMBRE RESTE AU SOL");
{
  const r = await p.evaluate(async () => {
    const h = document.getElementById("studio-pion-heros");
    let echelleMax = 1, ombre = false, fin = false;
    const sonde = () => {
      h.getAnimations().forEach(an => (an.effect.getKeyframes() || []).forEach(k => {
        const m = String(k.transform || "").match(/scale\(([\d.]+)\)/);
        if (m) echelleMax = Math.max(echelleMax, +m[1]);
      }));
      const o = document.querySelector("#studio-pions .anim-ombre");
      if (o && !h.contains(o)) ombre = true;
      if (!fin) requestAnimationFrame(sonde);
    };
    requestAnimationFrame(sonde);
    window.VITESSE_ANIMATIONS = 2;
    await window.jouerAnimationStudio("bond");
    fin = true;
    window.VITESSE_ANIMATIONS = 1;
    return { echelleMax, ombre };
  });
  verifier("au sommet du bond, le pion grossit (il monte vers nous)", r.echelleMax >= 1.35, String(r.echelleMax));
  verifier("son ombre reste posée au sol", r.ombre);
}

console.log("\n2. LES FIGURANTS : DE VRAIES CASES, ET ILS S'EN VONT");
{
  const r = await p.evaluate(async () => {
    window.VITESSE_ANIMATIONS = 2;
    const h = document.getElementById("studio-pion-heros"), e = document.getElementById("studio-pion-ennemi");
    const cases = new Set();
    const obs = new MutationObserver(() => document.querySelectorAll("#studio-pions .anim-figurant").forEach(f => cases.add(f.dataset.q + "," + f.dataset.r)));
    obs.observe(document.getElementById("studio-pions"), { childList: true, subtree: true, attributes: true });
    await window.jouerAnimationStudio("soin-zone");
    obs.disconnect();
    const occupees = [h, e].map(x => x.dataset.q + "," + x.dataset.r);
    const restants = document.querySelectorAll("#studio-pions .anim-figurant").length;
    // Le Transfert : le héros part bien sur la case de l'ennemi.
    const H = h.getBoundingClientRect(), E = e.getBoundingClientRect();
    const voulu = [E.left - H.left, E.top - H.top];
    let atteint = false, fin = false;
    const sonde = () => {
      h.getAnimations().forEach(an => (an.effect.getKeyframes() || []).forEach(k => {
        const m = String(k.transform || "").match(/translate\(-50%, -50%\) translate\(([-\d.e]+)px, ([-\d.e]+)px\)/);
        if (m && Math.abs(+m[1] - voulu[0]) < 2 && Math.abs(+m[2] - voulu[1]) < 2) atteint = true;
      }));
      if (!fin) requestAnimationFrame(sonde);
    };
    requestAnimationFrame(sonde);
    await window.jouerAnimationStudio("transfert");
    fin = true;
    // Le Mur de terre : plusieurs blocs de la roche du jeu, qui restent sur la carte.
    let murs = 0;
    const obs2 = new MutationObserver(() => { murs = Math.max(murs, document.querySelectorAll("#studio-pions .anim-mur canvas").length); });
    obs2.observe(document.getElementById("studio-pions"), { childList: true, subtree: true });
    await window.jouerAnimationStudio("mur-terre");
    obs2.disconnect();
    const restes = window.terrainStudio().murs.length;
    window.replacerPionsStudio();
    window.VITESSE_ANIMATIONS = 1;
    return { cases: [...cases], occupees, restants, atteint, murs, restes };
  });
  verifier("Soin de zone : deux alliés, chacun sur sa propre case libre", r.cases.length === 2 && r.cases.every(c => !r.occupees.includes(c)), JSON.stringify(r.cases));
  verifier("…et plus aucun figurant une fois l'animation finie", r.restants === 0);
  verifier("Transfert : le héros va bien prendre la place de l'ennemi", r.atteint);
  verifier("Mur de terre : un bloc de la roche du jeu sur chacune des trois cases, qui y reste", r.murs === 3 && r.restes === 3, `${r.murs} / ${r.restes}`);
}

console.log("\n3. EN VRAIES CONDITIONS : LA TRACTION ATTIRE, L'INERTIE CHARGE");
{
  const r = await p.evaluate(async () => {
    window.VITESSE_ANIMATIONS = 2;
    const h = document.getElementById("studio-pion-heros"), e = document.getElementById("studio-pion-ennemi");
    const c = (x) => ({ q: +x.dataset.q, r: +x.dataset.r });
    const dist = () => { const a = c(h), b = c(e); return Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q - b.q + a.r - b.r)); };
    // L'ennemi posé à trois cases du héros, sur une case libre.
    const aTroisCases = () => {
      window.replacerPionsStudio();
      const a = c(h);
      for (let dq = -3; dq <= 3; dq++) for (let dr = -3; dr <= 3; dr++) {
        if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) !== 3) continue;
        if (window.deplacerPionStudio("ennemi", a.q + dq, a.r + dr)) return true;
      }
      return false;
    };
    const res = {};
    res.pose1 = aTroisCases(); res.avant1 = dist();
    const ennemiAvant = JSON.stringify(c(e));
    await window.jouerAnimationStudio("traction");
    res.apresTraction = dist(); res.ennemiBouge = JSON.stringify(c(e)) !== ennemiAvant;
    res.pose2 = aTroisCases();
    const herosAvant = JSON.stringify(c(h));
    await window.jouerAnimationStudio("inertie-martiale");
    res.apresInertie = dist(); res.herosBouge = JSON.stringify(c(h)) !== herosAvant;
    window.replacerPionsStudio();
    window.VITESSE_ANIMATIONS = 1;
    return res;
  });
  verifier("Traction : l'ennemi à 3 cases est attiré jusqu'au contact, et y reste", r.pose1 && r.avant1 === 3 && r.apresTraction === 1 && r.ennemiBouge, JSON.stringify(r));
  verifier("Inertie martiale : le héros charge l'ennemi à 3 cases jusqu'au contact, et y reste", r.pose2 && r.apresInertie === 1 && r.herosBouge, JSON.stringify(r));
}

console.log("\n4. SECTIONS 5 À 9, JOUÉES JUSQU'AU BOUT");
{
  const ids = await p.evaluate(() => window.ANIMATIONS_COMBAT.filter(a => a.section >= 5).map(a => a.id));
  const r = await jouerTout(p, ids, 4);
  const mauvais = (f) => r.filter(f).map(x => x.id).join(", ");
  console.log(`     ${r.length} animations jouées, ${Math.round(r.reduce((s, x) => s + x.ms, 0) / 1000)} s en tout (vitesse ×4)`);
  verifier("toutes se jouent sans erreur", r.every(x => x.ok), mauvais(x => !x.ok));
  verifier("chacune fait vraiment quelque chose (pions animés ou effets posés)", r.every(x => x.fait), mauvais(x => !x.fait));
  verifier("chacune joue son son (au moins un, et du catalogue)", r.every(x => x.sons.length && !x.inconnus.length), mauvais(x => !x.sons.length || x.inconnus.length));
  verifier("aucune ne laisse d'effet derrière elle", r.every(x => x.reste === 0), mauvais(x => x.reste));
  verifier("les pions restent nets et opaques", r.every(x => x.filtre === "none|none" && x.opacite === "1|1"),
           mauvais(x => !(x.filtre === "none|none" && x.opacite === "1|1")));
  verifierDeplacements(verifier, r);
  const t = (id) => (r.find(x => x.id === id) || {}).textes || [];
  verifier("les textes du combat : « Charmé : frappe son allié ! », « 🔮 Renvoyé ! », « Sursis 💀 », « ⚡ Inertie martiale -4 »",
           t("charme-frappe").includes("Charmé : frappe son allié !") && t("renvoi").includes("🔮 Renvoyé !") && t("sursis").includes("Sursis 💀")
           && t("inertie-martiale").includes("⚡ Inertie martiale -4"));
}

// Pour les yeux : quelques animations saisies en plein vol.
if (process.env.CAPTURE_DIR) {
  for (const [id, ms] of [["bond", 480], ["attaque-foudre", 520], ["zone-feu", 1100], ["mur-terre", 900], ["transfert", 1100], ["nuee", 1000],
                          ["appel-lumiere", 1150], ["rempart", 800], ["traction", 1300], ["resonance-bouclier", 650], ["aveugle", 900], ["tir-precis", 450]]) {
    await p.evaluate((id) => { window.replacerPionsStudio(); window.recentrerStudio(); window.jouerAnimationStudio(id); }, id);
    await p.waitForTimeout(ms);
    await p.locator(".studio-scene").screenshot({ path: `${process.env.CAPTURE_DIR}/studio_${id}.png` });
    await p.evaluate(() => window.annulerAnimationsCombat());
    await p.waitForTimeout(300);
  }
}

await fin();
