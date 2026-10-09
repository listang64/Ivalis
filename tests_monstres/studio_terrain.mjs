// LE TERRAIN DU STUDIO D'ANIMATION : le ciblage à la main, et les dessins du jeu.
//
// Nico : « Assure-toi que pour des sorts style persistance de terrain et
// autres, genre murs de pierre, on puisse cliquer sur les hexagones à cibler.
// Et pour ceux-là, mets dans le Studio les mêmes que ceux qu'on a implantés
// dans le jeu. On pourra les retravailler en partant de ça. »
//   • le dessin des nappes du jeu (combat.js) n'a pas bougé d'un octet, et le
//     Studio dessine exactement le même (seuls les identifiants de ses <defs>
//     portent un suffixe) ;
//   • une animation qui se cible ouvre un bandeau ; on touche les cases sur la
//     carte (la zone se teinte de rouge comme au combat), on en rend une, une
//     case gommée est refusée ; « Lancer » la joue sur ces cases-là ;
//   • la zone de feu posée est la nappe du jeu, sur les cases touchées, et elle
//     reste sur la carte ;
//   • les murs de terre : la roche de murs_terre.js, reliée entre voisins, qui
//     reste, bloque les pions, et part avec « Replacer » ; un mur sous l'ennemi
//     le repousse ; un mur qui s'effondre laisse les gravats du jeu, et ses
//     voisins un moignon cassé ;
//   • « Annuler » ne pose rien ; sans cases touchées, chaque animation garde
//     ses cases à elle.
import { ouvrirStudio, jouerTout } from './_studio_commun.mjs';

const { p, verifier, fin } = await ouvrirStudio();

// Les outils du banc : où est une case à l'écran, et des espions sur les
// fonctions de dessin du jeu.
await p.evaluate(() => {
  window.__ecran = (q, r) => {
    const sc = document.getElementById("studio-scene").getBoundingClientRect();
    const m = document.getElementById("studio-plateau").style.transform.match(/translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([\d.e]+)\)/);
    const px = window.PLATEAU_VTT.hexToPixel(q, r);
    return { x: sc.left + (+m[1]) + px.x * (+m[3]), y: sc.top + (+m[2]) + px.y * (+m[3]) };
  };
  window.__case = (id) => { const el = document.getElementById(id); return { q: +el.dataset.q, r: +el.dataset.r }; };
  window.__espions = { murs: [], gravats: 0 };
  const vraiMur = window.dessinerMurTerre;
  window.dessinerMurTerre = function (graine, voisins) {
    window.__espions.murs.push({ graine, etats: (voisins || []).map(v => (v.etat || "-")[0]).join("") });
    return vraiMur.apply(this, arguments);
  };
  const vraisGravats = window.dessinerGravatsTerre;
  window.dessinerGravatsTerre = function () { window.__espions.gravats++; return vraisGravats.apply(this, arguments); };
  window.__fini = async () => {
    for (let k = 0; k < 400 && (document.querySelector("#studio-liste .studio-anim.joue") || document.querySelector("#studio-pions .anim-effet")); k++) {
      await new Promise(r => setTimeout(r, 25));
    }
  };
});
const toucher = async (q, r) => {
  const pt = await p.evaluate(([q, r]) => window.__ecran(q, r), [q, r]);
  await p.mouse.click(pt.x, pt.y);
  await p.waitForTimeout(60);
};
const bandeau = () => p.evaluate(() => {
  const b = document.getElementById("studio-ciblage");
  return { visible: b.style.display !== "none", nom: b.querySelector(".studio-ciblage-nom").textContent,
           compte: b.querySelector(".studio-ciblage-compte").textContent, lancer: !b.querySelector(".studio-ciblage-lancer").disabled,
           enCiblage: document.getElementById("studio-scene").classList.contains("studio-en-ciblage") };
});

console.log("\n1. LE DESSIN DES NAPPES DU JEU, À L'IDENTIQUE");
{
  const r = await p.evaluate(() => {
    const rendu = window.RENDU_ZONES_PERSISTANTES;
    const R = window.PLATEAU_VTT.hexSize;
    const types = ["feu", "glace", "electrique", "poison", "soin", "neutre"];
    const memes = types.every(t => [false, true].every(leger => {
      const jeu = rendu.hexagone(t, { q: 2, r: -1 }, R, leger);
      const studio = rendu.hexagone(t, { q: 2, r: -1 }, R, leger, window.PLATEAU_VTT.hexToPixel(2, -1), "-studio");
      return jeu === studio.replace(/-studio/g, "") && studio !== jeu;
    }));
    const defs = rendu.defs(R) === rendu.defs(R, "-studio").replace(/-studio/g, "") && /id="zp-clip-hex"/.test(rendu.defs(R));
    // Le plateau du combat dessine toujours ses nappes.
    window.ZONES_PERSISTANTES = { z1: { type: "feu", hexes: [{ q: 3, r: 1 }, { q: 4, r: 1 }] } };
    window.appliquerZonesPersistantes();
    const svg = document.getElementById("svg-zones-persistantes");
    const jeu = { clip: !!(svg && svg.querySelector("clipPath#zp-clip-hex")),
                  cases: svg ? [...svg.querySelectorAll("g[clip-path]")].filter(g => g.getAttribute("clip-path") === "url(#zp-clip-hex)").length : 0 };
    window.ZONES_PERSISTANTES = {};
    window.appliquerZonesPersistantes();
    return { memes, defs, jeu };
  });
  verifier("le Studio dessine EXACTEMENT la nappe du jeu (6 types, allégée ou non) ; seuls ses identifiants portent « -studio »", r.memes);
  verifier("…et les mêmes <defs> (découpe, flous, dégradés)", r.defs);
  verifier("le plateau du combat dessine toujours ses nappes (zp-clip-hex, une case par hexagone)", r.jeu.clip && r.jeu.cases === 2, JSON.stringify(r.jeu));
}

console.log("\n2. LE CIBLAGE À LA MAIN : UNE ZONE DE FEU SUR LES CASES TOUCHÉES");
const cases = await p.evaluate(() => {
  window.replacerPionsStudio();
  const e = window.__case("studio-pion-ennemi"), h = window.__case("studio-pion-heros");
  const voisines = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => ({ q: e.q + dq, r: e.r + dr }))
    .filter(c => !(window.PLATEAU_VTT.getCaseState(c.q, c.r) || {}).isDeleted && !(c.q === h.q && c.r === h.r));
  return { e, h, zone: [e, voisines[0], voisines[1]] };
});
{
  await p.evaluate(() => document.querySelector('#studio-liste .studio-anim[data-anim="zone-feu"] .studio-anim-jouer').click());
  await p.waitForTimeout(150);
  const ouvert = await bandeau();
  const calme = await p.evaluate(() => document.querySelectorAll("#studio-pions .anim-effet").length === 0 && !document.querySelector("#studio-liste .studio-anim.joue"));
  verifier("toucher « Zone persistante de feu » ouvre le bandeau de ciblage, sans rien jouer encore",
           ouvert.visible && ouvert.nom === "Zone persistante de feu" && ouvert.enCiblage && !ouvert.lancer && calme, JSON.stringify(ouvert));
  for (const c of cases.zone) await toucher(c.q, c.r);
  const trois = await bandeau();
  const rouge = await p.evaluate(() => [...document.querySelectorAll("#studio-cibles polygon")].map(x => x.getAttribute("fill")));
  verifier("trois touches sur la carte : trois cases prises, « Lancer » s'allume", /^3 cases touchées/.test(trois.compte) && trois.lancer, trois.compte);
  verifier("…teintées de rouge comme la zone visée au combat (dessinerHexesZoneCiblage)",
           rouge.length === 3 && rouge.every(f => f === "rgba(255, 76, 76, 0.35)"), JSON.stringify(rouge));
  await toucher(cases.zone[2].q, cases.zone[2].r);
  const deux = await bandeau();
  await toucher(cases.zone[2].q, cases.zone[2].r);
  verifier("toucher une case prise la rend, la retoucher la reprend", /^2 cases touchées/.test(deux.compte), deux.compte);
  await toucher(0, 0);
  const refus = await bandeau();
  verifier("une case gommée de la carte est refusée (et dit pourquoi)", refus.compte === "Case gommée de la carte", refus.compte);
  await p.waitForTimeout(1400);
  await p.evaluate(() => { window.VITESSE_ANIMATIONS = 2; document.querySelector("#studio-ciblage .studio-ciblage-lancer").click(); });
  await p.waitForTimeout(100);
  const pendant = await bandeau();
  await p.evaluate(() => window.__fini());
  const r = await p.evaluate((zone) => {
    window.VITESSE_ANIMATIONS = 1;
    const t = window.terrainStudio();
    const nappes = [...document.querySelectorAll("#studio-zones .studio-nappe")];
    // Les mêmes formes que la nappe du jeu, case par case.
    const formes = (racine) => ["ellipse", "path", "circle", "polygon"].map(tag => racine.querySelectorAll(tag).length).join(",");
    const R = window.PLATEAU_VTT.hexSize;
    const memes = nappes.every(g => {
      const [q, r] = g.dataset.case.split("_").map(Number);
      const d = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${window.RENDU_ZONES_PERSISTANTES.hexagone("feu", { q, r }, R, false)}</svg>`, "image/svg+xml");
      return formes(g) === formes(d.documentElement);
    });
    return { zones: t.zones, nappes: nappes.length, clip: nappes.every(g => g.querySelector('g[clip-path="url(#zp-clip-hex-studio)"]')),
             defs: !!document.querySelector("#studio-zones clipPath#zp-clip-hex-studio"), memes,
             surLesCases: zone.every(c => t.zones.some(z => z.q === c.q && z.r === c.r && z.type === "feu")),
             cibles: document.querySelectorAll("#studio-cibles polygon").length };
  }, cases.zone);
  verifier("« Lancer » joue l'animation et referme le bandeau", !pendant.visible && !pendant.enCiblage);
  verifier("la zone de feu est posée sur les trois cases touchées, et RESTE sur la carte", r.zones.length === 3 && r.surLesCases && r.nappes === 3, JSON.stringify(r.zones));
  verifier("…dessinée par la nappe du jeu (mêmes braises, langues, escarbilles ; défs du Studio)", r.clip && r.defs && r.memes);
  verifier("…et la teinte de visée est partie", r.cibles === 0);
}

console.log("\n3. LES MURS DE TERRE : LA ROCHE DU JEU, RELIÉE, QUI RESTE ET QUI BLOQUE");
// Trois cases en ligne au nord du héros (loin de l'ennemi et de la case gommée).
const ligne = await p.evaluate(() => {
  window.replacerPionsStudio();
  const h = window.__case("studio-pion-heros");
  return [{ q: h.q - 1, r: h.r - 1 }, { q: h.q, r: h.r - 2 }, { q: h.q + 1, r: h.r - 3 }].map(c => c);
});
{
  await p.evaluate(() => { window.__espions.murs = []; document.querySelector('#studio-liste .studio-anim[data-anim="mur-terre"] .studio-anim-jouer').click(); });
  await p.waitForTimeout(150);
  await toucher(cases.h.q, cases.h.r);
  const pasSurSoi = await bandeau();
  for (const c of ligne) await toucher(c.q, c.r);
  const projets = await p.evaluate(() => { const e = document.querySelector("#studio-murs canvas"); return e ? +e.dataset.projets : 0; });
  verifier("pas de mur sur son propre pion (comme au combat)", pasSurSoi.compte === "Pas sur ton pion", pasSurSoi.compte);
  verifier("les cases visées montrent le pilier à demi transparent du combat", projets === 3, String(projets));
  const r = await p.evaluate(async () => {
    window.VITESSE_ANIMATIONS = 2;
    let tuiles = 0;
    const obs = new MutationObserver(() => { tuiles = Math.max(tuiles, document.querySelectorAll("#studio-pions .anim-mur canvas").length); });
    obs.observe(document.getElementById("studio-pions"), { childList: true, subtree: true });
    document.querySelector("#studio-ciblage .studio-ciblage-lancer").click();
    await new Promise(r => setTimeout(r, 50));
    await window.__fini();
    obs.disconnect();
    window.VITESSE_ANIMATIONS = 1;
    const ens = document.querySelector("#studio-murs canvas");
    return { tuiles, murs: window.terrainStudio().murs, ensemble: ens ? +ens.dataset.murs : 0, nb: document.querySelectorAll("#studio-murs canvas").length,
             reste: document.querySelectorAll("#studio-pions .anim-mur").length, dessins: window.__espions.murs };
  });
  const relies = r.dessins.filter(d => /^mur_studio_/.test(d.graine)).map(d => (d.etats.match(/m/g) || []).length);
  verifier("trois blocs de la roche du jeu sortent de terre (dessinerMurTerre, murs_terre.js)", r.tuiles === 3, String(r.tuiles));
  verifier("les trois murs RESTENT sur la carte, sur les cases touchées",
           r.murs.length === 3 && ligne.every(c => r.murs.some(m => m.q === c.q && m.r === c.r)), JSON.stringify(r.murs));
  verifier("…composés en un seul canvas, comme au combat (plus aucun bloc d'animation)", r.nb === 1 && r.ensemble === 3 && r.reste === 0);
  verifier("…et reliés en muraille : le mur du milieu se lie à ses deux voisins", relies.includes(2), JSON.stringify(r.dessins.slice(0, 6)));
  const bloque = await p.evaluate(([c]) => ({ ennemi: window.deplacerPionStudio("ennemi", c.q, c.r), heros: window.deplacerPionStudio("heros", c.q, c.r) }), ligne);
  verifier("un mur bloque sa case : on ne peut y poser aucun pion", !bloque.ennemi && !bloque.heros);
  // Encerclé de murs, le héros ne peut plus marcher.
  const encercle = await p.evaluate(async () => {
    const h = window.__case("studio-pion-heros"), e = window.__case("studio-pion-ennemi");
    const autour = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => ({ q: h.q + dq, r: h.r + dr }))
      .filter(c => !(c.q === e.q && c.r === e.r));
    window.VITESSE_ANIMATIONS = 3;
    await window.jouerAnimationStudio("mur-terre", { cases: autour });
    await window.jouerAnimationStudio("marche");
    window.VITESSE_ANIMATIONS = 1;
    const apres = window.__case("studio-pion-heros");
    return { reste: apres.q === h.q && apres.r === h.r, murs: window.terrainStudio().murs.length };
  });
  verifier("encerclé de murs (et de l'ennemi), le héros ne peut pas sortir : il reste sur sa case", encercle.reste, JSON.stringify(encercle));
  const vide = await p.evaluate(() => {
    window.replacerPionsStudio();
    const t = window.terrainStudio();
    return t.murs.length + t.zones.length + t.gravats.length + document.querySelectorAll("#studio-murs *, #studio-zones .studio-nappe, #studio-gravats *").length;
  });
  verifier("« ⟲ Replacer » efface tout le terrain posé (murs, nappes, gravats)", vide === 0, String(vide));
}

console.log("\n4. UN MUR SOUS L'ENNEMI LE REPOUSSE");
{
  await p.evaluate(() => document.querySelector('#studio-liste .studio-anim[data-anim="mur-terre-repousse"] .studio-anim-jouer').click());
  await p.waitForTimeout(150);
  await toucher(cases.e.q, cases.e.r);
  const r = await p.evaluate(async () => {
    const avant = window.__case("studio-pion-ennemi");
    window.VITESSE_ANIMATIONS = 2;
    document.querySelector("#studio-ciblage .studio-ciblage-lancer").click();
    await new Promise(r => setTimeout(r, 50));
    await window.__fini();
    window.VITESSE_ANIMATIONS = 1;
    const apres = window.__case("studio-pion-ennemi");
    const d = Math.max(Math.abs(apres.q - avant.q), Math.abs(apres.r - avant.r), Math.abs(apres.q - avant.q + apres.r - avant.r));
    return { avant, apres, d, murs: window.terrainStudio().murs };
  });
  verifier("l'ennemi est éjecté sur une case voisine, le mur se dresse à sa place et reste",
           r.d === 1 && r.murs.length === 1 && r.murs[0].q === r.avant.q && r.murs[0].r === r.avant.r, JSON.stringify(r));
  await p.evaluate(() => window.replacerPionsStudio());
}

console.log("\n5. LE MUR QUI S'EFFONDRE LAISSE LES GRAVATS DU JEU");
{
  await p.evaluate(async (ligne) => {
    window.VITESSE_ANIMATIONS = 3;
    await window.jouerAnimationStudio("mur-terre", { cases: ligne });
    window.VITESSE_ANIMATIONS = 1;
    window.__espions.murs = []; window.__espions.gravats = 0;
    document.querySelector('#studio-liste .studio-anim[data-anim="mur-effondre"] .studio-anim-jouer').click();
  }, ligne);
  await p.waitForTimeout(150);
  await toucher(ligne[1].q, ligne[1].r);
  const r = await p.evaluate(async () => {
    window.VITESSE_ANIMATIONS = 2;
    document.querySelector("#studio-ciblage .studio-ciblage-lancer").click();
    await new Promise(r => setTimeout(r, 50));
    await window.__fini();
    window.VITESSE_ANIMATIONS = 1;
    return { t: window.terrainStudio(), tas: [...document.querySelectorAll("#studio-gravats img")].map(i => i.dataset.case),
             casse: window.__espions.murs.some(d => /c/.test(d.etats)), gravats: window.__espions.gravats };
  });
  const milieu = `${ligne[1].q}_${ligne[1].r}`;
  verifier("le mur du milieu tombe ; ses deux voisins restent", r.t.murs.length === 2 && !r.t.murs.some(m => `${m.q}_${m.r}` === milieu), JSON.stringify(r.t.murs));
  verifier("à sa place, le tas de gravats du jeu (dessinerGravatsTerre), qui reste", r.t.gravats.includes(milieu) && r.tas.includes(milieu) && r.gravats > 0,
           JSON.stringify(r.tas));
  verifier("…et les murs voisins se redessinent avec leur moignon cassé (voisin « casse »)", r.casse);
  // Sur une case libre : un mur s'y dresse d'abord, puis tombe.
  const libre = await p.evaluate(async () => {
    window.replacerPionsStudio();
    const h = window.__case("studio-pion-heros");
    const c = { q: h.q - 1, r: h.r - 1 };
    window.VITESSE_ANIMATIONS = 2;
    await window.jouerAnimationStudio("mur-effondre", { cases: [c] });
    window.VITESSE_ANIMATIONS = 1;
    const t = window.terrainStudio();
    return { murs: t.murs.length, gravats: t.gravats, c: `${c.q}_${c.r}` };
  });
  verifier("sur une case libre : un mur s'y dresse, s'écroule, et seuls les gravats restent", libre.murs === 0 && libre.gravats.includes(libre.c), JSON.stringify(libre));
}

console.log("\n6. ANNULER, ET LES ANIMATIONS SANS CIBLAGE");
{
  await p.evaluate(() => { window.replacerPionsStudio(); document.querySelector('#studio-liste .studio-anim[data-anim="gravats"] .studio-anim-jouer').click(); });
  await p.waitForTimeout(150);
  await toucher(cases.zone[1].q, cases.zone[1].r);
  const r = await p.evaluate(async () => {
    const pris = document.querySelectorAll("#studio-cibles polygon").length;
    document.querySelector("#studio-ciblage .studio-ciblage-annuler").click();
    await new Promise(r => setTimeout(r, 300));
    const t = window.terrainStudio();
    return { pris, visible: document.getElementById("studio-ciblage").style.display !== "none", cibles: document.querySelectorAll("#studio-cibles polygon").length,
             rien: t.gravats.length + t.murs.length + t.zones.length, joue: !!document.querySelector("#studio-liste .studio-anim.joue"),
             marques: [...document.querySelectorAll("#studio-liste .studio-anim")].filter(l => l.querySelector(".studio-anim-cible")).map(l => l.dataset.anim) };
  });
  verifier("« Annuler » referme le bandeau sans rien jouer ni rien poser", r.pris === 1 && !r.visible && r.cibles === 0 && r.rien === 0 && !r.joue, JSON.stringify(r));
  const CIBLEES = ["attaque-zone", "zone-apercu", "zone-feu", "zone-glace", "zone-foudre", "zone-poison", "gravats", "mur-terre", "mur-terre-repousse", "mur-effondre"];
  verifier("les dix animations qui se ciblent portent 🎯 dans la liste", r.marques.length === 10 && CIBLEES.every(id => r.marques.includes(id)), JSON.stringify(r.marques));
  const tout = await jouerTout(p, CIBLEES, 3);
  verifier("sans cases touchées (« jouer » direct), chacune garde ses cases à elle et se joue jusqu'au bout",
           tout.every(x => x.ok && x.fait && x.reste === 0 && x.inconnus.length === 0), JSON.stringify(tout.filter(x => !(x.ok && x.fait && x.reste === 0)).map(x => x.id)));
  // Une autre animation (sans ciblage) se joue toujours d'un seul clic.
  const direct = await p.evaluate(async () => {
    window.VITESSE_ANIMATIONS = 3;
    document.querySelector('#studio-liste .studio-anim[data-anim="coup-epee"] .studio-anim-jouer').click();
    await new Promise(r => setTimeout(r, 40));
    const joue = !!document.querySelector('#studio-liste .studio-anim.joue[data-anim="coup-epee"]');
    await window.__fini();
    window.VITESSE_ANIMATIONS = 1;
    return { joue, bandeau: document.getElementById("studio-ciblage").style.display !== "none" };
  });
  verifier("une animation qui ne se cible pas se joue toujours d'un seul clic", direct.joue && !direct.bandeau, JSON.stringify(direct));
}

// Pour les yeux : le ciblage, la zone de feu du jeu, la muraille qui sort de terre, l'effondrement.
if (process.env.CAPTURE_DIR) {
  const D = process.env.CAPTURE_DIR;
  await p.evaluate(() => { window.replacerPionsStudio(); window.recentrerStudio(); document.querySelector('#studio-liste .studio-anim[data-anim="zone-feu"] .studio-anim-jouer').click(); });
  for (const c of cases.zone) await toucher(c.q, c.r);
  await p.locator(".studio-gauche").screenshot({ path: `${D}/terrain_ciblage_zone.png` });
  await p.evaluate(() => document.querySelector("#studio-ciblage .studio-ciblage-lancer").click());
  await p.waitForTimeout(3600);
  await p.locator(".studio-scene").screenshot({ path: `${D}/terrain_zone_feu_jeu.png` });
  await p.evaluate(() => document.querySelector('#studio-liste .studio-anim[data-anim="mur-terre"] .studio-anim-jouer').click());
  for (const c of ligne) await toucher(c.q, c.r);
  await p.locator(".studio-gauche").screenshot({ path: `${D}/terrain_ciblage_murs.png` });
  await p.evaluate(() => document.querySelector("#studio-ciblage .studio-ciblage-lancer").click());
  await p.waitForTimeout(520);
  await p.locator(".studio-scene").screenshot({ path: `${D}/terrain_murs_sortent.png` });
  await p.waitForTimeout(2600);
  await p.locator(".studio-scene").screenshot({ path: `${D}/terrain_murs_restent.png` });
  await p.evaluate((c) => window.jouerAnimationStudio("mur-effondre", { cases: [c] }), ligne[1]);
  await p.waitForTimeout(3200);
  await p.locator(".studio-scene").screenshot({ path: `${D}/terrain_mur_effondre.png` });
}

await fin();
