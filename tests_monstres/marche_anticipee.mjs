// LE PION PART TOUT DE SUITE, SUR L'ÉCRAN DE CELUI QUI JOUE.
//
// Nico, sur iPad : « quand je valide un déplacement il met beaucoup de temps
// avant de jouer l'animation de déplacement ». Le pion attendait le journal du
// cerveau — trois ou quatre allers-retours réseau, bien plus lents sur Safari.
// Désormais, l'écran de celui qui joue fait partir le pion dès la validation
// pour les pas SÛRS (aucun ennemi au contact de la case quittée, aucune zone
// au sol sur la case d'arrivée, pas d'Immobilisation) ; le journal, quand il
// arrive, reconnaît ces pas et ne les rejoue pas ; s'il diverge ou ne vient
// pas, le pion retourne sur la case que la base lui donne.
//
// Ce banc charge le VRAI mouvement.js dans un vrai navigateur.
import fs from 'fs';

const mouvement = fs.readFileSync('/home/user/Ivalis/mouvement.js', 'utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(200);

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// Le décor : J1 en (0,0), un ennemi M1 posé où le cas l'exige.
const preparer = (options) => p.evaluate(({ src, options }) => {
  new Function('window', src)(window);
  document.body.innerHTML = '<div id="conteneur-tokens-vtt"></div><svg id="svg-chemin-mouvement"></svg>';
  const token = document.createElement("div");
  token.id = "token-J1"; token.className = "token-vtt";
  token.dataset.q = "0"; token.dataset.r = "0";
  token.innerHTML = '<img class="token-img-main">';
  document.getElementById("conteneur-tokens-vtt").appendChild(token);

  window.PLATEAU_VTT = { getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
                         hexToPixel: (q, r) => ({ x: q * 50, y: r * 44 }) };
  window.positionnerTokenVTT = (div) => {
    div.style.left = (parseFloat(div.dataset.q) * 50) + "px";
    div.style.top = (parseFloat(div.dataset.r) * 44) + "px";
  };
  window.jouerSonClic = () => {};
  window.actualiserBoutonFinTour = () => {};
  window.pasDejaParcourus = () => 0;
  window.PARTIE_DATA = { Tour_Combat: 1 };
  window.COUT_COMPETENCE_SELECTIONNEE = 0;
  window.DELAI_ANTICIPATION_MS = options.delai || 10000;
  window.PERSOS_PARTIE = [
    { idPersonnage: "J1", camp: "Allié", statut: "Vivant", Etats_Alteres: options.etats || [] },
    { idPersonnage: "M1", camp: "Ennemi", statut: "Vivant", Etats_Alteres: [] }
  ];
  window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 }, M1: options.ennemi || { q: 9, r: 0 } };
  window.ZONES_PERSISTANTES = options.zones || {};
  window.estCombattantMort = () => false;
  window.PIONS_EN_MOUVEMENT = {};

  // Le redessin de la vérité : le pion reprend la case que la base lui donne.
  window.__redessins = 0;
  window.redessinerPions = () => {
    window.__redessins++;
    const t = window.TOKENS_VTT_DATA.J1;
    const div = document.getElementById("token-J1");
    div.dataset.q = t.q; div.dataset.r = t.r;
  };
  // Le cerveau, réduit à la demande reçue. Il ne répond pas ici : c'est le
  // banc qui jouera le journal, quand il le veut.
  window.__demandes = [];
  window.regimeDemande = { actif: () => true,
                           mouvement: async (id, chemin) => { window.__demandes.push({ id, chemin, t: performance.now() }); } };

  // Toutes les cases par lesquelles le pion passe à l'écran.
  window.__cases = [];
  new MutationObserver(() => {
    const d = document.getElementById("token-J1");
    const c = d.dataset.q + "," + d.dataset.r;
    if (window.__cases[window.__cases.length - 1] !== c) window.__cases.push(c);
  }).observe(token, { attributes: true, attributeFilter: ["data-q", "data-r"] });
}, { src: mouvement, options: options || {} });

const valider = (chemin) => p.evaluate((chemin) => {
  window.TOKEN_SELECTIONNE = "J1";
  window.CHEMIN_MOUVEMENT = chemin.map(h => ({ ...h, cost: 2 }));
  window.CHEMIN_START_NODE = { q: 0, r: 0 };
  window.MOUVEMENT_COUT_TOTAL = 2 * chemin.length;
  const t0 = performance.now();
  window.validerMouvement();
  // Aucune attente : on regarde où est le pion À L'INSTANT même.
  const d = document.getElementById("token-J1");
  // Le pion part : la marche d'avant posait sa case d'arrivée tout de suite ;
  // celle du Studio (animations_jeu.js) le fait glisser, et ne pose la case
  // qu'en y arrivant — son mouvement, lui, a déjà commencé.
  return { case: d.dataset.q + "," + d.dataset.r, anime: d.getAnimations().length > 0, demandes: window.__demandes.length,
           anticipes: window.ANTICIPATION_MARCHE ? window.ANTICIPATION_MARCHE.pas.length : 0,
           dt: performance.now() - t0 };
}, chemin);

// Le journal du cerveau, tel que le spectateur le joue : une entrée, ses pas.
const journal = (pasJournal, options) => p.evaluate(async ({ pasJournal, options }) => {
  window.noterEntreeAnticipation({ acteur: "J1" });
  const durees = [];
  for (const x of pasJournal) {
    const t0 = performance.now();
    await window.jouerAnimationPas({ idToken: "J1", de: x.de, vers: x.vers });
    durees.push(Math.round(performance.now() - t0));
    // La projection de l'état (regime_cerveau.js) : la base avance d'un pas.
    window.TOKENS_VTT_DATA.J1 = { q: x.vers.q, r: x.vers.r };
  }
  if (options && options.verite) window.TOKENS_VTT_DATA.J1 = options.verite;
  window.fermerAnticipationMarche();   // surRejeu(null) : l'entrée est finie
  const d = document.getElementById("token-J1");
  return { case: d.dataset.q + "," + d.dataset.r, durees, cases: [...window.__cases],
           protege: !!(window.PIONS_EN_MOUVEMENT || {}).J1, redessins: window.__redessins,
           ouverte: !!window.ANTICIPATION_MARCHE };
}, { pasJournal, options });

const C3 = [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }];
const PAS3 = [{ de: { q: 0, r: 0 }, vers: { q: 1, r: 0 } }, { de: { q: 1, r: 0 }, vers: { q: 2, r: 0 } },
              { de: { q: 2, r: 0 }, vers: { q: 3, r: 0 } }];

// =========================================================================
console.log("1. EN TERRAIN LIBRE, LE PION PART À LA VALIDATION");
{
  await preparer();
  const v = await valider(C3);
  verifier("la demande part bien au cerveau", v.demandes === 1);
  verifier("les trois pas sont sûrs, donc anticipés", v.anticipes === 3, String(v.anticipes));
  verifier("le pion a DÉJÀ quitté sa case, sans attendre la réponse", v.case === "1,0" || v.anime, `${v.case}${v.anime ? ", en marche" : ""}`);
  await p.waitForTimeout(1500);
  const r = await journal(PAS3);
  verifier("le journal arrive : ses pas ne sont PAS rejoués (retour immédiat)",
           r.durees.every(d => d < 60), JSON.stringify(r.durees));
  verifier("le pion n'est jamais revenu en arrière", JSON.stringify(r.cases) === '["1,0","2,0","3,0"]',
           JSON.stringify(r.cases));
  verifier("il finit sur la case du cerveau", r.case === "3,0", r.case);
  verifier("l'anticipation est refermée, la protection levée", !r.ouverte && !r.protege);
  verifier("aucun redessin n'a été nécessaire", r.redessins === 0, String(r.redessins));
}

// =========================================================================
console.log("\n2. LE JOURNAL ARRIVE PENDANT LA MARCHE ANTICIPÉE");
{
  await preparer();
  await valider(C3);
  const r = await journal(PAS3);   // tout de suite : le 1er pas est encore en cours
  verifier("chaque pas du journal attend le pas anticipé, sans le doubler",
           JSON.stringify(r.cases) === '["1,0","2,0","3,0"]', JSON.stringify(r.cases));
  verifier("il finit sur la case du cerveau", r.case === "3,0", r.case);
}

// =========================================================================
console.log("\n3. UN ENNEMI AU CONTACT : ON S'ARRÊTE AVANT L'OPPORTUNITÉ");
{
  // M1 en (3,-1) touche (2,0) : quitter (2,0) peut provoquer une attaque
  // d'opportunité — ce pas-là, et les suivants, attendent le cerveau.
  await preparer({ ennemi: { q: 3, r: -1 } });
  const v = await valider(C3);
  verifier("seuls les deux premiers pas sont anticipés", v.anticipes === 2, String(v.anticipes));
  await preparer({ ennemi: { q: 1, r: -1 } });   // au contact dès le départ
  const v2 = await valider(C3);
  verifier("au contact dès le départ, rien n'est anticipé", v2.anticipes === 0 && v2.case === "0,0",
           `${v2.anticipes} / ${v2.case}`);
  verifier("mais la demande part quand même", v2.demandes === 1);
}

// =========================================================================
console.log("\n4. UNE ZONE AU SOL, UNE IMMOBILISATION");
{
  await preparer({ zones: { zp_1: { hexes: [{ q: 2, r: 0 }] } } });
  const v = await valider(C3);
  verifier("on s'arrête avant la case en feu", v.anticipes === 1, String(v.anticipes));
  await preparer({ etats: [{ nom: "Immobilisation", duree: 1 }] });
  const v2 = await valider(C3);
  verifier("immobilisé, le pion ne part pas d'avance", v2.anticipes === 0 && v2.case === "0,0");
}

// =========================================================================
console.log("\n5. LE CERVEAU TRANCHE AUTREMENT : LA BASE A LE DERNIER MOT");
{
  // Plus d'énergie après un pas : le journal n'en publie qu'un.
  await preparer();
  await valider(C3);
  await p.waitForTimeout(1500);
  const r = await journal(PAS3.slice(0, 1), { verite: { q: 1, r: 0 } });
  verifier("le pion retourne sur la case publiée", r.case === "1,0", r.case);
  verifier("par un redessin de la vérité", r.redessins >= 1, String(r.redessins));
  verifier("et l'anticipation est refermée", !r.ouverte && !r.protege);

  // Un chemin publié différent dès le premier pas.
  await preparer();
  await valider(C3);
  await p.waitForTimeout(1500);
  const r2 = await journal([{ de: { q: 0, r: 0 }, vers: { q: 0, r: 1 } }], { verite: { q: 0, r: 1 } });
  verifier("un pas qui diffère est joué pour de vrai", r2.case === "0,1", r2.case);
}

// =========================================================================
console.log("\n5 bis. UN REDESSIN PENDANT L'ATTENTE (UN TAP SUR UN PION)");
{
  await preparer();
  await valider(C3);
  await p.waitForTimeout(1500);
  // Un redessin direct du plateau ramène le pion sur la case de la base.
  await p.evaluate(() => { const d = document.getElementById("token-J1"); d.dataset.q = "0"; d.dataset.r = "0"; });
  const r = await journal(PAS3);
  verifier("à la fin de l'entrée, le pion est remis sur la case publiée", r.case === "3,0", r.case);
}

// =========================================================================
console.log("\n6. RIEN N'ARRIVE (DEMANDE REFUSÉE) : LE PION REVIENT");
{
  await preparer({ delai: 1800 });
  await valider(C3);
  await p.waitForTimeout(2600);
  const r = await p.evaluate(() => { const d = document.getElementById("token-J1");
    return { case: d.dataset.q + "," + d.dataset.r, ouverte: !!window.ANTICIPATION_MARCHE,
             protege: !!window.PIONS_EN_MOUVEMENT.J1 }; });
  verifier("passé le délai, le pion retourne où la base le voit", r.case === "0,0", r.case);
  verifier("sans anticipation ni protection qui traîne", !r.ouverte && !r.protege);
}

// =========================================================================
console.log("\n7. LES AUTRES ÉCRANS NE CHANGENT PAS");
{
  await preparer();
  const r = await p.evaluate(async () => {
    await window.jouerAnimationPas({ idToken: "J1", de: { q: 0, r: 0 }, vers: { q: 1, r: 0 } });
    const d = document.getElementById("token-J1");
    return { case: d.dataset.q + "," + d.dataset.r, protege: !!window.PIONS_EN_MOUVEMENT.J1 };
  });
  verifier("sans anticipation, un pas du journal se joue normalement", r.case === "1,0" && !r.protege,
           JSON.stringify(r));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
