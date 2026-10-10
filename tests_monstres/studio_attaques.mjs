// LES ATTAQUES DU STUDIO, RETOUCHÉES PAR NICO
//
//   • « Attaque légère : le trait qui simule le coup, ses deux extrémités en
//     pointes ; les dégâts une seule fois, au deuxième coup ; on garde le
//     bruit de lame, mais pour le coup reçu un son d'entaille de chair (plus
//     de ding), et la gerbe de sang de l'animation coup reçu » — de même pour
//     l'attaque lourde, et le coup reçu pour toutes les réceptions physiques ;
//   • « Attaque à distance : l'empennage, un bois plus fin ; plantée, la
//     flèche garde son angle jusqu'à la fin ; la corde qui se tend, la chair » ;
//   • « Feu : le bruit d'une flamme tout le long du chemin, une explosion de
//     flamme sans métal ; une boule plus réaliste, en ligne droite ; une gerbe
//     de feu sur la cible » ; « Foudre : des éclairs, un son électrique à la
//     réception » ; « Glace : des pointes de cristal qui apparaissent devant
//     le lanceur, en suspension, avant de pointer et d'aller une à une se
//     planter ; des sons de glace » ; « Mot de pouvoir : un murmure sifflé » ;
//   • « Lumière : le rayon part d'un arc de cercle devant le token, en trait
//     qui se rétrécit vers la cible ; plus de cercle jaune, la cible clignote
//     une fois d'un léger jaune ; un autre son » ;
//   • « Coup critique : juste le message (en rouge, sous le token, avec un
//     joli effet), puis l'attaque normale ».
import { ouvrirStudio, jouerTout } from './_studio_commun.mjs';

const { p, verifier, fin } = await ouvrirStudio();

// Ce qu'une animation fait : les sons (et quand), les mots, ce qui paraît dans
// le calque, et ce qu'on sonde image par image (`sondes` : sélecteur → mesure).
const observer = (id, sondes = {}) => p.evaluate(async ({ id, sondes }) => {
  window.annulerAnimationsCombat();
  window.replacerPionsStudio();
  window.VITESSE_ANIMATIONS = 1;
  const calque = document.getElementById("studio-pions");
  const h = document.getElementById("studio-pion-heros"), e = document.getElementById("studio-pion-ennemi");
  const centre = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, t: r.width }; };
  const H = centre(h), E = centre(e);
  const sons = [], t0 = performance.now();
  const vrai = window.jouerSonCombat;
  window.jouerSonCombat = (s, f) => { sons.push([s, Math.round(performance.now() - t0)]); return vrai(s, f); };
  const textes = [], vraiTexte = window.afficherMessageFlottantHex;
  window.afficherMessageFlottantHex = (q, r, t, c, o) => { const m = vraiTexte(q, r, t, c, o); textes.push({ t, envol: !!(m && m.classList && m.classList.contains("chiffre-envol")) }); return m; };
  const poses = [];
  const obs = new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) poses.push({ classe: n.className, style: n.getAttribute("style") || "", html: n.innerHTML.slice(0, 4000) }); })));
  obs.observe(calque, { childList: true, subtree: true });
  const mesures = {};
  Object.keys(sondes).forEach(k => mesures[k] = []);
  const filtres = [], vus = new Set();
  let fini = false;
  const tour = () => {
    Object.entries(sondes).forEach(([k, sel]) => {
      const els = [...document.querySelectorAll(sel)];
      mesures[k].push(els.map(el => {
        const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
        const pe = getComputedStyle(el.parentElement);
        return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, transform: cs.transform, parent: pe.transform,
                 opacite: +cs.opacity, opaciteParent: +pe.opacity, couleur: cs.color, texte: el.textContent };
      }));
    });
    e.getAnimations().forEach(an => { if (!vus.has(an)) { vus.add(an); filtres.push(an.effect.getKeyframes().map(k => k.filter || "")); } });
    if (!fini) requestAnimationFrame(tour);
  };
  requestAnimationFrame(tour);
  await window.jouerAnimationStudio(id);
  await new Promise(r => setTimeout(r, 60));
  fini = true; obs.disconnect();
  window.jouerSonCombat = vrai; window.afficherMessageFlottantHex = vraiTexte;
  window.replacerPionsStudio();
  return { sons, textes, poses, mesures, filtres, H, E };
}, { id, sondes });
const ids = (r) => r.sons.map(s => s[0]);
const sang = (r) => r.poses.some(x => /rgb\(196, 20, 28\)|#c4141c/i.test(x.style));
const angle = (m) => { const v = (m || "").match(/matrix\(([^,]+), ([^,]+)/); return v ? Math.atan2(+v[2], +v[1]) * 180 / Math.PI : 0; };

console.log("\n1. LE CORPS À CORPS : DES TRAITS EN POINTES, LA CHAIR, LE SANG, LES DÉGÂTS UNE FOIS");
{
  const r = await observer("attaque-legere", { lame: "#studio-pions .entaille-lame" });
  const lames = r.poses.filter(x => /entaille-lame/.test(x.html));
  verifier("le trait du coup est effilé aux deux bouts (un croissant plein, sans bout rond)",
           lames.length === 2 && lames.every(x => /<path class="entaille-lame" d="M30 10 Q [\d.]+ 50 30 90 Q [\d.]+ 50 30 10 Z"/.test(x.html) && !/stroke-linecap="round" stroke-dasharray="120" stroke-dashoffset="120" style/.test(x.html)),
           String(lames.length));
  const degats = r.textes.filter(x => /^-\d/.test(x.t));
  verifier("les dégâts une seule fois, au second coup, et ils s'envolent", degats.length === 1 && degats[0].t === "-8" && degats[0].envol, JSON.stringify(degats));
  verifier("le bruit de lame à chaque coup, la chair entaillée au coup reçu — plus de « ding »",
           ids(r).filter(s => s === "dague").length === 2 && ids(r).includes("entaille-chair") && !ids(r).includes("lame-impact"), JSON.stringify(ids(r)));
  verifier("…et la gerbe de sang du coup reçu", sang(r));
}
{
  const r = await observer("attaque-lourde");
  verifier("l'attaque lourde : son trait effilé, le choc sourd, la chair, le sang, « -18 »",
           r.poses.some(x => /class="entaille-lame"/.test(x.html)) && ids(r).includes("lourd-impact") && ids(r).includes("entaille-chair")
           && !ids(r).includes("lame-impact") && sang(r) && r.textes.some(x => x.t === "-18" && x.envol), JSON.stringify(ids(r)));
}
{
  const r = await observer("coup-recu-physique");
  verifier("le coup reçu physique : le recul, le sang, la chair (plus de « coup-physique »)",
           sang(r) && ids(r).includes("entaille-chair") && !ids(r).includes("coup-physique"), JSON.stringify(ids(r)));
  const e = await observer("coup-epee");
  verifier("le coup d'épée (et donc l'attaque d'opportunité) : le même traitement",
           sang(e) && ids(e).includes("entaille-chair") && !ids(e).includes("lame-impact") && e.poses.some(x => /class="entaille-lame"/.test(x.html)), JSON.stringify(ids(e)));
  const autres = await jouerTout(p, ["fureur-sentinelle", "assaut-mortel", "rempart-actif", "compagnon-attaque", "tir-precis", "saignement", "confusion-soi", "attaque-opportunite"], 3);
  verifier("toutes les autres réceptions physiques : plus de « ding » de lame (lame-impact)",
           autres.every(x => x.ok && !x.sons.includes("lame-impact") && x.inconnus.length === 0), JSON.stringify(autres.filter(x => x.sons.includes("lame-impact")).map(x => x.id)));
}

console.log("\n2. LA FLÈCHE");
{
  const r = await observer("attaque-distance", { plantee: "#studio-pions .anim-fleche-plantee", fut: "#studio-pions .fleche-fut" });
  verifier("l'arc se tend, la flèche part en sifflant, se plante dans la chair",
           JSON.stringify(ids(r).filter(s => ["arc-tendu", "tir", "fleche-impact"].includes(s))) === '["arc-tendu","tir","fleche-impact"]' && sang(r), JSON.stringify(ids(r)));
  const vol = r.poses.find(x => /fleche-fut/.test(x.html) && !/anim-fleche-plantee/.test(x.html));
  verifier("le nouveau dessin : l'empennage (deux plumes barbées) et un fût plus fin (5 sur 20)",
           !!vol && /<rect class="fleche-fut" x="4" y="7.5" width="114" height="5"/.test(vol.html) && (vol.html.match(/fill="#efe6d2"/g) || []).length === 2);
  const vise = Math.atan2(r.E.y - r.H.y, r.E.x - r.H.x) * 180 / Math.PI;
  const vues = r.mesures.plantee.filter(l => l.length).map(l => l[0]);
  const fin = vues.slice(-6);
  verifier("plantée, elle garde son angle jusqu'au bout (plus de bascule à 90°)",
           vues.length > 10 && fin.every(m => Math.abs(angle(m.transform) - vise) < 2) && vues.every(m => Math.abs(angle(m.parent)) < 0.5),
           `${Math.round(vise)}° visé — fin : ${fin.map(m => Math.round(angle(m.transform))).join(" ")}`);
  verifier("…et s'efface en fondu (sans tourner)", fin.some(m => m.opaciteParent < 0.9), fin.map(m => m.opaciteParent.toFixed(2)).join(" "));
}

console.log("\n3. LE FEU, LA FOUDRE");
{
  const r = await observer("boule-de-feu", { boule: "#studio-pions .anim-boule-feu" });
  verifier("la flamme gronde tout le chemin, l'explosion de flammes — sans métal",
           ids(r).includes("feu-vol") && ids(r).includes("feu-explosion") && !ids(r).includes("feu-lancer"), JSON.stringify(ids(r)));
  const pts = r.mesures.boule.filter(l => l.length).map(l => l[0]);
  const a = pts[0], z = pts[pts.length - 1];
  const ecart = Math.max(...pts.map(q => Math.abs((z.y - a.y) * q.x - (z.x - a.x) * q.y + z.x * a.y - z.y * a.x) / Math.hypot(z.x - a.x, z.y - a.y)));
  verifier("une boule plus réaliste (cœur, halo, langues, queue), en ligne droite", pts.length > 5 && ecart < 3
           && r.poses.some(x => /bf-coeur/.test(x.html) && /bf-queue/.test(x.html) && /bf-halo/.test(x.html)), `${pts.length} images, écart ${ecart.toFixed(1)} px`);
  verifier("à l'impact, une gerbe de feu sur la cible (des langues de flamme tout autour)",
           r.poses.filter(x => /anim-langue-feu/.test(x.classe)).length >= 6 && r.textes.some(x => x.t === "-14" && x.envol));
}
{
  const r = await observer("attaque-foudre");
  // v234 (Nico : « garde juste le son de l'électricité, pas de son quand la
  // cible reçoit les dégâts ») : plus de décharge à la réception.
  verifier("la foudre : le seul son des éclairs, rien à la réception", ids(r).includes("foudre") && !ids(r).includes("decharge"), JSON.stringify(ids(r)));
}

console.log("\n4. LA GLACE : DES POINTES DE CRISTAL, UNE À UNE");
{
  const r = await observer("attaque-glace", { pics: "#studio-pions .anim-pic-glace" });
  const formes = r.mesures.pics.find(l => l.length === 5 && l.every(q => q.opacite > 0.9));
  verifier("cinq pointes naissent EN SUSPENSION DEVANT le héros", !!formes && formes.every(q => Math.hypot(q.x - r.H.x, q.y - r.H.y) < Math.hypot(q.x - r.E.x, q.y - r.E.y)),
           formes ? formes.map(q => Math.round(Math.hypot(q.x - r.H.x, q.y - r.H.y))).join(" ") : "jamais cinq");
  const tirs = r.sons.filter(s => s[0] === "glace-tir").map(s => s[1]);
  verifier("puis filent une à une, rapides (un tir tous les ~110 ms)", tirs.length === 5 && tirs.every((t, i) => i === 0 || t - tirs[i - 1] >= 70), JSON.stringify(tirs));
  verifier("des sons de glace : la formation, les tirs, cinq qui se plantent (plus de rayon de givre)",
           ids(r).includes("glace-formation") && ids(r).filter(s => s === "glace-plante").length === 5 && !ids(r).includes("givre-rayon"), JSON.stringify(ids(r)));
  const plantes = r.mesures.pics.filter(l => l.length === 5).pop();
  verifier("…et elles finissent plantées dans l'ennemi", !!plantes && plantes.every(q => Math.hypot(q.x - r.E.x, q.y - r.E.y) < r.E.t * 0.6),
           plantes ? plantes.map(q => Math.round(Math.hypot(q.x - r.E.x, q.y - r.E.y))).join(" ") : "");
}

console.log("\n5. LA LUMIÈRE, LE COUP CRITIQUE");
{
  const r = await observer("lumiere-forge");
  verifier("un arc de cercle devant le héros, d'où part un trait qui s'amincit jusqu'à la cible",
           r.poses.some(x => /anim-arc-lumiere/.test(x.classe) && /A 50 50 0 0 1/.test(x.html))
           && r.poses.some(x => /anim-rayon-lumiere/.test(x.classe) && /polygon\(0 0, 100% 48%, 100% 52%, 0 100%\)/.test(x.html)));
  verifier("plus de cercle jaune autour de la cible", !r.poses.some(x => /rgb\(255, 230, 128\)|#ffe680/i.test(x.style)));
  const teintes = r.filtres.filter(k => k.some(f => f && f !== "none"));
  verifier("la cible clignote UNE fois d'un léger jaune (et rien d'autre : ni flash rouge)",
           teintes.length === 1 && teintes[0].filter(f => /sepia\(0\.5\)/.test(f)).length === 1, JSON.stringify(r.filtres));
  verifier("…le son de la lumière, « -10 » qui s'envole", ids(r).includes("lumiere") && r.textes.some(x => x.t === "-10" && x.envol));
}
{
  const r = await observer("coup-critique", { message: "#studio-pions .anim-message-critique" });
  const vus = r.mesures.message.filter(l => l.length).map(l => l[0]);
  const pose = vus.find(m => m.opacite > 0.95);
  verifier("« COUP CRITIQUE ! » en rouge, SOUS le pion du héros", !!pose && pose.texte === "COUP CRITIQUE !" && pose.y > r.H.y + r.H.t * 0.5
           && /rgb\(255, 42, 42\)/.test(pose.couleur), pose ? `${Math.round(pose.y - r.H.y)} px sous le centre, ${pose.couleur}` : "jamais vu");
  verifier("…il arrive de haut (énorme, flou) et se pose : le joli effet", vus.length > 5 && vus[0].opacite < 0.6);
  verifier("puis l'attaque normale : la lame, la chair, « -24 ! » (plus d'étoile dorée ni de cloche)",
           // v234 : le son sourd et épique (critique-epique) remplace la charge dorée.
           ids(r).includes("critique-epique") && !ids(r).includes("critique-charge") && ids(r).includes("lame-souffle") && ids(r).includes("entaille-chair") && !ids(r).includes("critique-impact")
           && r.textes.some(x => x.t === "-24 !" && x.envol) && !r.poses.some(x => /polygon points="0,-48 4,-6 -4,-6"/.test(x.html)), JSON.stringify(ids(r)));
  const ordre = r.sons.map(s => s[0]);
  verifier("…le message d'abord, l'attaque ensuite", ordre.indexOf("critique-epique") >= 0 && ordre.indexOf("critique-epique") < ordre.indexOf("lame-souffle"));
}

console.log("\n6. LES SONS NEUFS");
{
  const r = await p.evaluate(async () => {
    const out = {};
    for (const id of ["entaille-chair", "arc-tendu", "feu-vol", "glace-formation", "glace-tir", "glace-plante", "mots", "lumiere", "foudre", "feu-explosion"]) {
      const ctx = new OfflineAudioContext(1, 44100 * 2, 44100);
      const g = ctx.createGain(); g.connect(ctx.destination);
      window.SONS_COMBAT[id](ctx, g);
      const d = (await ctx.startRendering()).getChannelData(0);
      let crete = 0, dernier = 0, passages = 0, fort = 0;
      for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > crete) crete = v; if (v > 0.003) { dernier = i; fort++; } }
      for (let i = 1; i < d.length; i++) if (Math.abs(d[i]) > 0.003 && (d[i] > 0) !== (d[i - 1] > 0)) passages++;
      out[id] = { crete: +crete.toFixed(3), duree: +(dernier / 44100).toFixed(2), sifflant: +(passages / Math.max(1, fort)).toFixed(3) };
    }
    return out;
  });
  verifier("les six sons neufs existent, ni muets ni saturés",
           ["entaille-chair", "arc-tendu", "feu-vol", "glace-formation", "glace-tir", "glace-plante"].every(k => r[k].crete > 0.02 && r[k].crete < 0.95), JSON.stringify(r));
  verifier("la flamme du vol tient tout le chemin (près d'une seconde)", r["feu-vol"].duree > 0.8, String(r["feu-vol"].duree));
  verifier("le mot de pouvoir : un murmure sifflé (des sifflantes, très aigu)", r.mots.sifflant > 0.15, String(r.mots.sifflant));
}

// Pour les yeux : la flèche plantée, la boule de feu, les pics de glace, la lumière, le critique.
if (process.env.CAPTURE_DIR) {
  for (const [id, ms] of [["attaque-distance", 4600], ["boule-de-feu", 2700], ["attaque-glace", 3700], ["lumiere-forge", 1700], ["coup-critique", 1100]]) {
    await p.evaluate((id) => { window.annulerAnimationsCombat(); window.replacerPionsStudio(); window.recentrerStudio(); window.VITESSE_ANIMATIONS = 0.25; window.jouerAnimationStudio(id); }, id);
    await p.waitForTimeout(ms);
    await p.locator(".studio-scene").screenshot({ path: `${process.env.CAPTURE_DIR}/studio_${id}.png` });
    await p.evaluate(() => { window.annulerAnimationsCombat(); window.VITESSE_ANIMATIONS = 1; });
    await p.waitForTimeout(300);
  }
}

await fin();
