// LA POUSSÉE RESTE À DEUX CASES, ET L'AVATAR DU BOUTON DE FIN DE TOUR GRANDIT.
//
// Nico : « dans la Forge, mettre des points à Pousser augmente le pourcentage
// ET le nombre d'hexagones, alors que la poussée doit rester au maximum à deux
// hexagones en ligne droite ». Le moteur a toujours poussé de 2 cases ; c'est
// le texte de la Forge qui mentait : formatterTexteEffet multipliait la Valeur
// du grimoire (2, la distance) par le nombre de points — 4 points, « 8
// hexagones ». Même travers pour la Traction (3 cases). Et le plafond de chance
// du moteur (50 %) ne suivait pas celui du grimoire (60 %) que la Forge affiche.
//
// Contrôles sur le vrai code : competences.js (texte de la Forge),
// moteur_effets.js (ce que la carte extrait), hud_disposition.js (l'avatar).
import fs from 'fs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// Les fiches telles que la base les porte aujourd'hui (lues en lecture seule).
const POUSSEE = { id: "EFF_POUSSEE", Nom: "Poussée", Valeur: 2, Pourcent_Base: 15, Pourcent_Max: 60,
  Cout_PT: "1", Modificateur: "FORCE", Type_Mecanique: "Action/Global", Type_Mecanique_2: "Physique",
  Effet_Base: "10% chance de poussée la cible de 2 hexagones en ligne droite. Peut se déplacer ensuite" };
const TRACTION = { id: "EFF_TRACTION_MAGIQUE", Nom: "Traction magique", Valeur: 3, Pourcent_Base: 15, Pourcent_Max: 60,
  Cout_PT: "1", Modificateur: "INTELLIGENCE", Type_Mecanique: "Magique", Type_Mecanique_2: "Action/Global",
  Effet_Base: "15% chance de faire sur 3 hexagone (max 60%)" };
const DEGATS = { id: "EFF_X", Nom: "Attaque magique", Valeur: 6, Pourcent_Base: 0, Pourcent_Max: 0,
  Effet_Base: "Inflige 6 dégâts magiques" };

// =========================================================================
console.log("\n1. LE TEXTE DE LA FORGE (vrai competences.js)");
// =========================================================================
{
  const src = fs.readFileSync('/home/user/Ivalis/competences.js', 'utf-8');
  const SRC_PARSE = src.slice(src.indexOf('function parseFrenchFloat'), src.indexOf('function nettoyerNomEffet'));
  const d = src.indexOf('function formatterTexteEffet');
  const SRC_TEXTE = src.slice(d, src.indexOf('\nfunction ', d + 10));
  const d2 = src.indexOf('function getMaxStacks');
  const SRC_STACKS = src.slice(d2, src.indexOf('\n}\n', d2) + 3);
  const outils = new Function(SRC_PARSE + '\nconst bonusPorteeDeRace = () => 0;\n' + SRC_TEXTE + '\n' + SRC_STACKS
    + '\nreturn { formatterTexteEffet, getMaxStacks };')();
  const t = (eff, n) => outils.formatterTexteEffet(eff, n, { modsDuree: {} });

  const max = outils.getMaxStacks(POUSSEE);
  verifier("la Poussée accepte 4 points (60 % max / 15 %)", max === 4, `(${max})`);
  for (const n of [1, 2, 4]) {
    const texte = t(POUSSEE, n);
    verifier(`${n} point(s) : ${15 * n} % de chance`, texte.startsWith(`${15 * n}%`), texte);
    verifier(`${n} point(s) : toujours 2 hexagones`, /\b2 hexagones/.test(texte) && !/\b(4|6|8) hexagones/.test(texte), texte);
  }
  const tr = t(TRACTION, 3);
  verifier("la Traction reste à 3 hexagones avec 3 points", /sur 3 hexagone/.test(tr) && tr.startsWith("45%"), tr);
  verifier("une attaque, elle, multiplie toujours sa Valeur", /Inflige 18 dégâts/.test(t(DEGATS, 3)), t(DEGATS, 3));
}

// =========================================================================
console.log("\n2. CE QUE LA CARTE EXTRAIT (vrai moteur_effets.js)");
// =========================================================================
const SRC = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8').replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch(); const p = await b.newPage();
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html'); await p.waitForTimeout(300);
await p.evaluate(({ src }) => {
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  window.PLATEAU_VTT = { hexSize: 30, hexToPixel: (q, r) => ({ x: q * 52, y: r * 45 }), pixelToHex: () => ({ q: 0, r: 0 }),
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    getHexesInRadius: (q, r, R) => { const o = []; for (let a = -R; a <= R; a++) for (let c = -R; c <= R; c++) if (dist({ q, r }, { q: q + a, r: r + c }) <= R) o.push({ q: q + a, r: r + c }); return o; } };
  window.bonusEquip = () => 0; window.bonusPorteeMagique = () => 0; window.jouerSonClic = () => {};
  new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField', src)(
    window, {}, () => ({}), async () => {}, async () => {}, async () => {}, () => ({}));
  const hote = document.createElement("div"); hote.id = "apercu-carte-hd-competence"; document.body.appendChild(hote);
  window.__extraire = async (grimoire, actions) => {
    window.EFFETS_BDD_CACHE = grimoire;
    const h = { idPersonnage: "J1", camp: "Allié", statut: "Vivant", Etats_Alteres: [] };
    window.PERSOS_PARTIE = [h, { idPersonnage: "M1", camp: "Ennemi", statut: "Vivant", Etats_Alteres: [] }];
    window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 }, M1: { q: 0, r: 1 } };
    window.COMBAT_PERSOS_JOUEUR = [h]; window.COMBAT_INDEX_PERSO = 0;
    window.COMPETENCES_CACHE = { C: { Nom: "Banc", Arme: "Arme lourde CAC", Fatigue: 5, Composants: { actions } } };
    const r = await window.demarrerCiblage("C", { extraire: true, idLanceur: "J1" });
    const alt = (r.alterations || []).find(a => a.estPoussee) || {};
    return { chance: alt.chance, cases: alt.cases, desc: alt.desc };
  };
}, { src: SRC });
{
  const G = { EFF_POUSSEE: POUSSEE };
  const quatre = await p.evaluate(g => window.__extraire(g, [{ baseEffetId: "EFF_POUSSEE", count: 4, mods: {} }]), G);
  verifier("4 points : 60 % de chance, comme la Forge l'annonce", quatre.chance === 60, `(${quatre.chance})`);
  verifier("et la carte pousse toujours de 2 cases", quatre.cases === undefined && /2 cases/.test(quatre.desc), quatre.desc);
  const six = await p.evaluate(g => window.__extraire(g, [{ baseEffetId: "EFF_POUSSEE", count: 6, mods: {} }]), G);
  verifier("au-delà, le plafond du grimoire tient (60 %)", six.chance === 60, `(${six.chance})`);
  const sansMax = { EFF_POUSSEE: { ...POUSSEE, Pourcent_Max: 0 } };
  const repli = await p.evaluate(g => window.__extraire(g, [{ baseEffetId: "EFF_POUSSEE", count: 6, mods: {} }]), sansMax);
  verifier("un grimoire sans plafond retombe sur 50 %", repli.chance === 50, `(${repli.chance})`);
}

// =========================================================================
console.log("\n3. L'AVATAR AU-DESSUS DU BOUTON DE FIN DE TOUR (vrai hud_disposition.js)");
// =========================================================================
{
  const r = await p.evaluate(() => {
    window.appliquerReglagesHud();
    const a = document.getElementById("hud-avatar-heros");
    return { reglage: window.REGLAGES_HUD.avatar, hauteur: parseFloat(a.style.height),
             echelle: window.echelleHud() };
  });
  verifier("l'avatar est réglé plus grand qu'avant (376 px de référence)", r.reglage.hauteur > 376 && r.reglage.hauteur <= 430,
           `(${r.reglage.hauteur})`);
  verifier("et la page le pose à cette taille, mise à l'échelle du bandeau",
           Math.abs(r.hauteur - r.reglage.hauteur * r.echelle) < 1, `(${r.hauteur} px, échelle ${r.echelle.toFixed(2)})`);
  verifier("son pied ne bouge pas (56 px du bas)", r.reglage.bas === 56);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.join(" | "));
await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
