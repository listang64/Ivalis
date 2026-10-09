// LE CATALOGUE COMPLET DU STUDIO D'ANIMATION (1/2) : la liste, la grille, le
// ralenti, et les sections 1 à 4 jouées de bout en bout.
//
// Nico : « Tu vas m'intégrer et me créer une animation dans le Studio
// d'animation de tous ces effets (certains sont déjà dans le Studio). Pour
// rappel, la vue du token est une vue de haut sur la map. Tu vas me créer
// l'animation et le son qui vont bien. » Suivait sa liste, en neuf sections.
//   • les 142 animations, dans l'ordre de sa liste, rangées en sections (et
//     les classes en sous-sections), chacune avec son nom et sa description ;
//   • des puces pour sauter d'une section à l'autre, un bouton Ralenti ;
//   • vu de dessus, sur la grille : la marche va de centre d'hexagone en
//     centre d'hexagone, une zone couvre sept hexagones entiers ;
//   • chacune se joue jusqu'au bout, fait quelque chose, joue au moins un son
//     (du catalogue), et ne laisse rien derrière elle.
import { ouvrirStudio, jouerTout, verifierDeplacements } from './_studio_commun.mjs';

const { p, verifier, fin } = await ouvrirStudio();

console.log("\n1. TOUTE LA LISTE DE NICO, DANS SON ORDRE");
const cat = await p.evaluate(() => ({
  ids: window.ANIMATIONS_COMBAT.map(a => a.id),
  ordre: window.ORDRE_ANIMATIONS_COMBAT || [],
  sections: window.ANIMATIONS_COMBAT.map(a => a.section),
  sous: window.ANIMATIONS_COMBAT.filter(a => a.sousSection).map(a => a.sousSection),
  noms: window.ANIMATIONS_COMBAT.map(a => a.nom),
  descriptions: window.ANIMATIONS_COMBAT.map(a => (a.description || "").length),
  fonctions: window.ANIMATIONS_COMBAT.every(a => typeof a.jouer === "function")
}));
const parSection = {};
cat.sections.forEach(n => { parSection[n] = (parSection[n] || 0) + 1; });
verifier("142 animations (les dix premières et les 132 nouvelles)", cat.ids.length === 142 && new Set(cat.ids).size === 142, String(cat.ids.length));
verifier("dans l'ordre exact de la liste", JSON.stringify(cat.ids) === JSON.stringify(cat.ordre));
verifier("par section : 14, 19, 15, 12, 10, 14, 6, 43, 9 (comme la liste)",
         JSON.stringify(parSection) === '{"1":14,"2":19,"3":15,"4":12,"5":10,"6":14,"7":6,"8":43,"9":9}', JSON.stringify(parSection));
verifier("les sections se suivent, sans retour en arrière", cat.sections.every((n, i) => i === 0 || n >= cat.sections[i - 1]));
const classes = [...new Set(cat.sous)];
verifier("les classes en sous-sections, dans l'ordre de la liste",
         JSON.stringify(classes) === '["Sorcier","Protecteur","Assassin","Médicus","Chasseur de mages","Profanateur","Pisteur","Géomancien","Sentinelle","Oracle","Vampire"]',
         JSON.stringify(classes));
verifier("chacune son nom (tous différents), sa description, sa lecture", new Set(cat.noms).size === 142 && cat.descriptions.every(n => n > 30) && cat.fonctions);

console.log("\n2. LA LISTE DU STUDIO : SECTIONS, SOUS-SECTIONS, PUCES");
{
  const r = await p.evaluate(async () => {
    const liste = document.getElementById("studio-liste");
    const titres = [...liste.querySelectorAll(".studio-section-titre")].map(t => t.textContent.trim());
    const sous = [...liste.querySelectorAll(".studio-sous-section")].map(t => t.textContent.trim());
    const puces = [...document.querySelectorAll("#studio-sections .studio-puce-section")].map(b => b.textContent.trim());
    const lignes = liste.querySelectorAll(".studio-anim").length;
    const avant = liste.scrollTop;
    window.allerSectionStudio(8);
    await new Promise(r => setTimeout(r, 900));
    const titre8 = liste.querySelector('.studio-section-titre[data-section="8"]');
    const ecart = Math.abs((titre8.getBoundingClientRect().top - liste.getBoundingClientRect().top));
    return { titres, sous, puces, lignes, avant, apres: liste.scrollTop, ecart };
  });
  await p.screenshot({ path: process.env.CAPTURE_DIR ? process.env.CAPTURE_DIR + "/studio_catalogue_liste.png" : "/dev/null", type: "png" }).catch(() => {});
  verifier("neuf titres de section, dans l'ordre", JSON.stringify(r.titres) === JSON.stringify(["1. Déplacements", "2. Attaques", "3. Impacts et défenses",
           "4. Soins, protections, énergie", "5. Contrôle et déplacements forcés", "6. États altérés", "7. Zones et terrain", "8. Classes", "9. Talents"]), JSON.stringify(r.titres));
  verifier("onze sous-titres de classe", r.sous.length === 11, JSON.stringify(r.sous));
  verifier("142 lignes jouables", r.lignes === 142, String(r.lignes));
  verifier("neuf puces ; la puce 8 amène la liste aux Classes", JSON.stringify(r.puces) === '["1","2","3","4","5","6","7","8","9"]'
           && r.apres > r.avant + 200 && r.ecart < 20, JSON.stringify({ avant: r.avant, apres: r.apres, ecart: r.ecart }));
}

console.log("\n3. LE RALENTI");
{
  const r = await p.evaluate(async () => {
    const t = async () => { const t0 = performance.now(); await window.jouerAnimationStudio("soin-etale"); return performance.now() - t0; };
    const normal = await t();
    document.getElementById("studio-btn-ralenti").click();
    const actif = document.getElementById("studio-btn-ralenti").classList.contains("actif"), vitesse = window.VITESSE_ANIMATIONS;
    const lent = await t();
    document.getElementById("studio-btn-ralenti").click();
    return { normal: Math.round(normal), lent: Math.round(lent), actif, vitesse, rendu: window.VITESSE_ANIMATIONS };
  });
  verifier("le bouton Ralenti s'allume et ralentit (×0,4)", r.actif && r.vitesse === 0.4 && r.rendu === 1, JSON.stringify(r));
  verifier("la même animation dure bien plus longtemps au ralenti", r.lent > r.normal * 1.8, `${r.normal} ms → ${r.lent} ms`);
}

console.log("\n4. VU DE DESSUS, SUR LA GRILLE");
{
  // La marche : chaque pas finit sur le centre d'une case voisine.
  const r = await p.evaluate(async () => {
    window.VITESSE_ANIMATIONS = 2;
    const h = document.getElementById("studio-pion-heros");
    const pas = [];
    const vues = new Set();
    let fin = false;
    const sonde = () => {
      h.getAnimations().forEach(an => {
        if (vues.has(an)) return; vues.add(an);
        const k = an.effect.getKeyframes();
        const m = String((k[k.length - 1] || {}).transform || "").match(/translate\(-50%, -50%\) translate\(([-\d.e]+)px, ([-\d.e]+)px\)/);
        if (m) pas.push([+m[1], +m[2]]);
      });
      if (!fin) requestAnimationFrame(sonde);
    };
    // La distance d'une case à sa voisine (le héros et l'ennemi, côte à côte au départ).
    window.replacerPionsStudio();
    const e0 = document.getElementById("studio-pion-ennemi").getBoundingClientRect(), h0 = h.getBoundingClientRect();
    const voisin = Math.hypot(e0.left - h0.left, e0.top - h0.top);
    const depart = h.dataset.q + "," + h.dataset.r;
    requestAnimationFrame(sonde);
    await window.jouerAnimationStudio("marche");
    fin = true;
    // EN VRAIES CONDITIONS : il est resté là où il est arrivé, trois cases plus loin.
    const arrivee = { q: +h.dataset.q, r: +h.dataset.r }, [dq0, dr0] = depart.split(",").map(Number);
    const ecartCases = Math.max(Math.abs(arrivee.q - dq0), Math.abs(arrivee.r - dr0), Math.abs(arrivee.q - dq0 + arrivee.r - dr0));
    const h1 = h.getBoundingClientRect();
    const decale = Math.hypot(h1.left - h0.left, h1.top - h0.top);
    window.replacerPionsStudio();
    // Une zone de feu : combien de cases entières (les nappes du jeu, qui restent sur la carte) ?
    await window.jouerAnimationStudio("zone-feu");
    const hexagones = document.querySelectorAll("#studio-zones .studio-nappe").length;
    window.VITESSE_ANIMATIONS = 1;
    // Les cases qui existent autour de l'ennemi (la carte a une case gommée).
    const en = document.getElementById("studio-pion-ennemi");
    const q0 = +en.dataset.q, r0 = +en.dataset.r;
    let attendues = 0;
    for (const [dq, dr] of [[0, 0], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
      if (!(window.PLATEAU_VTT.getCaseState(q0 + dq, r0 + dr) || {}).isDeleted) attendues++;
    }
    return { pas, voisin, hexagones, attendues, ecartCases, decale };
  });
  const sauts = r.pas.map((q, i) => Math.hypot(q[0] - (i ? r.pas[i - 1][0] : 0), q[1] - (i ? r.pas[i - 1][1] : 0)));
  verifier("la marche : trois pas, chacun d'une case exactement (centre à centre)",
           r.pas.length === 3 && sauts.every(d => Math.abs(d - r.voisin) < 2), `pas de ${sauts.map(Math.round).join(", ")} px pour ${Math.round(r.voisin)} px`);
  verifier("la marche finie, le héros RESTE sur sa nouvelle case (trois cases plus loin)", r.ecartCases === 3 && r.decale > r.voisin * 1.5,
           `${r.ecartCases} cases, ${Math.round(r.decale)} px`);
  verifier("une zone persistante couvre des hexagones entiers (les nappes du jeu) : l'ennemi et ses voisins (sauf une case gommée)",
           r.hexagones === r.attendues && r.attendues >= 6, `${r.hexagones} pour ${r.attendues}`);
}

console.log("\n5. SECTIONS 1 À 4, JOUÉES JUSQU'AU BOUT");
{
  const ids = await p.evaluate(() => window.ANIMATIONS_COMBAT.filter(a => a.section <= 4).map(a => a.id));
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
}

await fin();
