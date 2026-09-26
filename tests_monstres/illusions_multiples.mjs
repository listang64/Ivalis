// DEUX ILLUSIONS SUR UNE CARTE : DEUX LEURRES, SUR DEUX CASES CHOISIES.
//
// Nico : « j'ai une compétence avec deux fois Illusion ; il ne s'en est fait
// qu'une, ou alors deux au même endroit. Il faudrait choisir deux endroits. »
// L'extraction ne retenait qu'un drapeau « il y a une illusion » : une seule
// pose, quel que soit le nombre d'Illusions sur la carte. Et entre deux poses,
// la case du leurre tout juste posé restait proposée — son pion n'est pas
// encore dans la liste des combattants (elle arrive par l'écouteur, plus
// tard) — si bien que le second pouvait s'y poser par-dessus, et le cerveau
// le refusait.
//
// Ce banc joue le VRAI moteur_effets.js, dans un vrai navigateur : la carte est
// extraite, puis chaque leurre est posé d'un clic sur le plateau.
import fs from 'fs';

const SRC = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1000, height: 800 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(300);

// Le décor : un lanceur J1, un allié J2, deux ennemis. Le plateau est un
// simple hexagone sans murs ; la carte est forgée à la volée.
await p.evaluate((src) => {
  const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  window.PLATEAU_VTT = {
    hexSize: 30,
    hexToPixel: (q, r) => ({ x: q * 52, y: r * 45 }),
    pixelToHex: () => window.__caseCliquee,
    getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
    getHexesInRadius: (q, r, rayon) => {
      const out = [];
      for (let dq = -rayon; dq <= rayon; dq++)
        for (let dr = -rayon; dr <= rayon; dr++)
          if (dist({ q, r }, { q: q + dq, r: r + dr }) <= rayon) out.push({ q: q + dq, r: r + dr });
      return out;
    }
  };
  window.VTT_POS_X = 0; window.VTT_POS_Y = 0; window.VTT_SCALE = 1;
  window.bonusEquip = () => 0;
  window.bonusPorteeMagique = () => 0;
  window.estUneCreature = (p) => !!(p && p.estMonstre);
  window.critiqueCombattant = () => 0;
  window.jouerSonClic = () => {};
  window.afficherMessageFlottantHex = (q, r, texte) => { window.__messages.push(texte); };
  window.estCombattantMort = () => false;
  window.EFFETS_BDD_CACHE = {
    ATT:  { id: "ATT", Nom: "Attaque légère", Valeur: 6 },
    SOIN: { id: "SOIN", Nom: "Soin", Valeur: 5 },
    BOND: { id: "BOND", Nom: "Bond", Valeur: 2 },
    DIST: { id: "DIST", Nom: "Distance", Valeur: 1 },
    ILL:  { id: "ILL", Nom: "Illusion", Valeur: 1 }
  };
  window.__hote = document.createElement("div");
  window.__hote.id = "apercu-carte-hd-competence";
  document.body.appendChild(window.__hote);
  new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField', src)(
    window, {}, () => ({}), async () => {}, async () => {}, async () => {}, () => ({}));

  // Le cerveau, réduit à ce qu'il reçoit.
  window.regimeDemande = {
    actif: () => true,
    carte: async (acteur, carte) => { window.__envoyees.push(JSON.parse(JSON.stringify(carte))); },
    bond: async (acteur, vers) => { window.__bonds.push(vers); }
  };

  window.__poser = (positions) => {
    window.__messages = []; window.__envoyees = []; window.__bonds = [];
    const lanceur = { idPersonnage: "J1", prenom: "Cybile", camp: "Allié", statut: "Vivant", Etats_Alteres: [] };
    window.PERSOS_PARTIE = [
      lanceur,
      { idPersonnage: "J2", prenom: "Pliors", camp: "Allié", statut: "Vivant", Etats_Alteres: [] },
      { idPersonnage: "M1", prenom: "Goule", camp: "Ennemi", statut: "Vivant", Etats_Alteres: [] },
      { idPersonnage: "M2", prenom: "Spectre", camp: "Ennemi", statut: "Vivant", Etats_Alteres: [] }
    ];
    window.TOKENS_VTT_DATA = JSON.parse(JSON.stringify(positions));
    window.COMBAT_PERSOS_JOUEUR = [lanceur];
    window.COMBAT_INDEX_PERSO = 0;
    window.ETAT_CIBLAGE = null;
  };
  window.__carte = (actions) => {
    const id = "C_" + Math.random().toString(36).slice(2, 8);
    window.COMPETENCES_CACHE = { [id]: { Nom: "Banc", Fatigue: 10, Arme: "Magie", Composants: { actions } } };
    return id;
  };
  window.__cibles = (carte, nom) => ((carte.attaques || []).find(a => a.nom === nom) || {}).cibles;
}, SRC);


// Le plateau réduit à ce que la pose d'un leurre touche : le voile des cases
// jouables, le surlignage de l'effet, et la création du leurre — qui, comme la
// vraie, pose le pion SANS l'ajouter à la liste des combattants.
await p.evaluate(() => {
  window.assombrirCasesJouables = (id, cases) => { window.__proposees.push(cases.map(h => h.q + "," + h.r)); return { remove() {} }; };
  window.surlignerEffetCarteActif = () => {};
  window.validerCarteCombat = () => { window.__validee = true; };
  window.creerIllusion = async (idLanceur, q, r) => {
    const id = "ILLUSION_" + (window.__illusions.length + 1);
    window.__illusions.push({ q, r });
    window.TOKENS_VTT_DATA[id] = { q, r };
  };
  window.__cliquer = (q, r) => {
    window.__caseCliquee = { q, r };
    const hote = document.getElementById("conteneur-plateau-vtt");
    hote.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 10 }));
  };
  window.__raz = () => { window.__illusions = []; window.__proposees = []; window.__validee = false; };
});

// =========================================================================
console.log("1. L'EXTRACTION COMPTE LES LEURRES");
{
  const r = await p.evaluate(async () => {
    window.__poser({ J1: { q: 0, r: 0 }, J2: { q: 5, r: 5 }, M1: { q: 1, r: -1 }, M2: { q: 6, r: 0 } });
    const deux = await window.demarrerCiblage(window.__carte([
      { baseEffetId: "ATT", mods: {} }, { baseEffetId: "ILL", mods: {} }, { baseEffetId: "ILL", mods: {} }]),
      { extraire: true, idLanceur: "J1" });
    const une = await window.demarrerCiblage(window.__carte([
      { baseEffetId: "ATT", mods: {} }, { baseEffetId: "ILL", mods: {} }]), { extraire: true, idLanceur: "J1" });
    const enMod = await window.demarrerCiblage(window.__carte([
      { baseEffetId: "ATT", mods: { ILL: 1 } }, { baseEffetId: "ILL", mods: {} }]), { extraire: true, idLanceur: "J1" });
    return { deux: deux && deux.illusionEnAttente, une: une && une.illusionEnAttente,
             enMod: enMod && enMod.illusionEnAttente };
  });
  verifier("deux actions Illusion : deux leurres à poser", r.deux && r.deux.nombre === 2, JSON.stringify(r.deux));
  verifier("une seule : un seul, comme avant", r.une && r.une.nombre === 1, JSON.stringify(r.une));
  verifier("une Illusion posée en mod compte aussi", r.enMod && r.enMod.nombre === 2, JSON.stringify(r.enMod));
}

// =========================================================================
console.log("\n2. DEUX POSES, DEUX CASES");
{
  const r = await p.evaluate(async () => {
    window.__poser({ J1: { q: 0, r: 0 }, J2: { q: 5, r: 5 }, M1: { q: 6, r: -1 }, M2: { q: 6, r: 0 } });
    window.__raz();
    const fini = window.poserIllusions("J1", 1, 2);
    await new Promise(r => setTimeout(r, 20));
    window.__cliquer(1, 0);                         // premier leurre
    await new Promise(r => setTimeout(r, 20));
    const secondeOffre = window.__proposees[1] || [];
    window.__cliquer(1, 0);                         // la même case : refusée
    await new Promise(r => setTimeout(r, 20));
    const apresDoublon = window.__illusions.length;
    window.__cliquer(0, 1);                         // une autre case
    const poses = await fini;
    return { poses, illusions: window.__illusions, offres: window.__proposees.length,
             secondeOffre, apresDoublon };
  });
  verifier("on choisit bien deux fois", r.offres === 2, String(r.offres));
  verifier("la case du premier leurre n'est plus proposée au second",
           !r.secondeOffre.includes("1,0") && r.secondeOffre.length > 0, JSON.stringify(r.secondeOffre));
  verifier("cliquer dessus ne pose rien", r.apresDoublon === 1, String(r.apresDoublon));
  verifier("deux leurres, sur deux cases différentes",
           r.poses === 2 && JSON.stringify(r.illusions) === '[{"q":1,"r":0},{"q":0,"r":1}]', JSON.stringify(r.illusions));
}

// =========================================================================
console.log("\n3. UNE CARTE D'ILLUSIONS SEULES, JOUÉE POUR DE VRAI");
{
  const r = await p.evaluate(async () => {
    window.__poser({ J1: { q: 0, r: 0 }, J2: { q: 5, r: 5 }, M1: { q: 6, r: -1 }, M2: { q: 6, r: 0 } });
    window.__raz();
    const id = window.__carte([{ baseEffetId: "ILL", mods: {} }, { baseEffetId: "ILL", mods: {} }]);
    const fini = window.demarrerCiblage(id, { idLanceur: "J1" });
    await new Promise(r => setTimeout(r, 30));
    window.__cliquer(0, 1);
    await new Promise(r => setTimeout(r, 30));
    window.__cliquer(-1, 1);
    await fini;
    return { illusions: window.__illusions, validee: window.__validee };
  });
  verifier("les deux leurres sont posés, chacun à sa case",
           JSON.stringify(r.illusions) === '[{"q":0,"r":1},{"q":-1,"r":1}]', JSON.stringify(r.illusions));
  verifier("puis la carte est validée", r.validee === true);
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
