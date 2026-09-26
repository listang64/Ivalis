// UN ENNEMI À TERRE NE « TIENT » PLUS PERSONNE AU CORPS-À-CORPS — ET UNE ZONE
// N'Y EST PLUS SOUMISE DU TOUT.
//
// Nico : « j'ai une compétence avec dégâts zone à distance de 2, et dans le
// choix du placement je ne peux cliquer que sur un hexagone au contact, alors
// que je devrais cibler à 2 de distance ». La portée extraite de la carte est
// juste (2) ; c'est la règle de l'ENGAGEMENT qui la ramenait à une case : un
// lanceur collé à un ennemi ne pose ses zones — et ne vise ses cibles — qu'à
// son contact. Cette règle ne regardait que le statut « Mort ». Or un
// combattant tombé sous le cerveau est « Inconscient », à 0 PV, et son pion
// reste sur le plateau : le monstre qu'on venait d'abattre au contact tenait
// encore le lanceur. La règle lit désormais la même chose que la case
// occupée (estCombattantMort) : statut Mort OU plus un seul PV.
//
// Joué sur le VRAI moteur_effets.js et la VRAIE estCombattantMort (combat.js).
import fs from 'fs';

const COMBAT = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
function fonction(src, marqueur) {
  const lignes = src.split('\n');
  const d = lignes.findIndex(l => l.startsWith(marqueur));
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === '};') { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}
// La VRAIE règle « ce combattant est-il tombé ? » du jeu (combat.js).
const SRC_MORT = fonction(COMBAT, 'window.estCombattantMort = ');
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
await p.evaluate(({ src, srcMort }) => {
  window.__srcMort = srcMort;
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
  new Function('window', window.__srcMort)(window);
  window.pvMaxCombattant = (p) => parseInt(p.PV_Max) || 0;
  window.EFFETS_BDD_CACHE = {
    ATT:  { id: "ATT", Nom: "Attaque légère", Valeur: 6 },
    SOIN: { id: "SOIN", Nom: "Soin", Valeur: 5 },
    BOND: { id: "BOND", Nom: "Bond", Valeur: 2 },
    DIST: { id: "DIST", Nom: "Distance", Valeur: 1 }
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
}, { src: SRC, srcMort: SRC_MORT });


// M1 est collé au lanceur ; sa fiche dit s'il est debout ou tombé.
const monde = (m1) => p.evaluate((m1) => {
  window.__poser({ J1: { q: 0, r: 0 }, J2: { q: 0, r: 3 }, M1: { q: 1, r: 0 }, M2: { q: -2, r: 0 } });
  const m = window.PERSOS_PARTIE.find(x => x.idPersonnage === "M1");
  Object.assign(m, { PV_Max: 30, PV_Actuels: 30 }, m1);
  window.PERSOS_PARTIE.find(x => x.idPersonnage === "M2").PV_Max = 30;
  window.PERSOS_PARTIE.find(x => x.idPersonnage === "M2").PV_Actuels = 30;
}, m1);

const zone = () => p.evaluate(() => {
  const cases = window.casesPosablesZone("J1", { isRanged: true, rangeMax: 2, isHeal: false });
  const d = (h) => (Math.abs(h.q) + Math.abs(h.q + h.r) + Math.abs(h.r)) / 2;
  return { nb: cases.length, loin: cases.some(h => d(h) === 2),
           engage: typeof window.estEngageAuContact === "function"
             ? window.estEngageAuContact("J1", window.TOKENS_VTT_DATA.J1,
                                         window.PERSOS_PARTIE.find(x => x.idPersonnage === "J1"))
             : "règle absente" };
});

// =========================================================================
console.log("1. UN ENNEMI DEBOUT AU CONTACT : ENGAGÉ, MAIS LA ZONE PART QUAND MÊME");
{
  // Nico, collée à un orc : « j'ai 3 de distance et je ne peux lancer qu'au
  // cac ». Une ZONE n'est plus soumise à l'engagement ; la cible unique, si
  // (section 3).
  await monde({ statut: "Vivant" });
  const z = await zone();
  verifier("le lanceur est engagé", z.engage === true);
  verifier("la zone offensive se pose quand même à sa pleine portée", z.loin === true, `${z.nb} cases`);
}

// =========================================================================
console.log("\n2. CET ENNEMI EST TOMBÉ (INCONSCIENT, 0 PV) : PLUS D'ENGAGEMENT");
{
  await monde({ statut: "Inconscient", PV_Actuels: 0 });
  const z = await zone();
  verifier("le lanceur n'est plus engagé", z.engage === false);
  verifier("la zone se pose à sa pleine portée de 2", z.loin === true, `${z.nb} cases`);

  await monde({ statut: "Vivant", PV_Actuels: 0 });
  const z2 = await zone();
  verifier("0 PV suffit, même si la fiche n'a pas encore changé de statut", z2.engage === false && z2.loin === true);

  await monde({ statut: "Mort" });
  const z3 = await zone();
  verifier("« Mort » reste reconnu, comme avant", z3.engage === false && z3.loin === true);
}

// =========================================================================
console.log("\n3. MÊME RÈGLE POUR UNE CIBLE UNIQUE À DISTANCE");
{
  const vise = (m1) => p.evaluate(async (m1) => {
    window.__poser({ J1: { q: 0, r: 0 }, J2: { q: 0, r: 3 }, M1: { q: 1, r: 0 }, M2: { q: -2, r: 0 } });
    const m = window.PERSOS_PARTIE.find(x => x.idPersonnage === "M1");
    Object.assign(m, { PV_Max: 30, PV_Actuels: 30 }, m1);
    const id = window.__carte([{ baseEffetId: "ATT", mods: { DIST: 1 } }]);
    await window.demarrerCiblage(id, { idLanceur: "J1" });
    window.ajouterCibleCiblage("M2");
    return { cible: window.ETAT_CIBLAGE.cibleUnique, messages: [...window.__messages] };
  }, m1);
  const debout = await vise({ statut: "Vivant" });
  verifier("ennemi debout au contact : la cible à 2 est refusée", debout.cible === null,
           JSON.stringify(debout.messages));
  const tombe = await vise({ statut: "Inconscient", PV_Actuels: 0 });
  verifier("ennemi tombé au contact : la cible à 2 est acceptée", tombe.cible === "M2",
           JSON.stringify(tombe));
}

// =========================================================================
console.log("\n4. LE CAS DE LA PARTIE : ZONE DE FOUDRE À DISTANCE 3, COLLÉE À UN ORC");
{
  // La carte de la capture : Attaque Magique + Distance (3 hexagones) +
  // Électrifié, sur une zone de 7 cases ; la lanceuse a un orc debout au
  // contact. Un clic à 3 cases doit poser la zone là.
  const r = await p.evaluate(async () => {
    window.__poser({ J1: { q: 0, r: 0 }, J2: { q: 0, r: 3 }, M1: { q: 1, r: 0 }, M2: { q: -3, r: 0 } });
    const m1 = window.PERSOS_PARTIE.find(x => x.idPersonnage === "M1");
    Object.assign(m1, { PV_Max: 30, PV_Actuels: 30 });
    const ZONE7 = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
                   { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }];
    const id = window.__carte([{ baseEffetId: "ATT", mods: { DIST: 2 }, zoneHexes: ZONE7 }]);
    await window.demarrerCiblage(id, { idLanceur: "J1" });
    const st = window.ETAT_CIBLAGE;
    const config = window.configCiblage(st);
    window.__caseCliquee = { q: -3, r: 0 };
    const hote = document.getElementById("conteneur-plateau-vtt");
    hote.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 10, clientY: 10 }));
    return { zone: st.isZone, portee: config && config.rangeMax, aDistance: config && config.isRanged,
             centre: st.zoneCenterHex, posables: window.casesPosablesZone("J1", config).length };
  });
  verifier("la carte est une zone à distance 3", r.zone && r.aDistance && r.portee === 3, JSON.stringify(r));
  verifier("un clic à 3 cases pose la zone là, malgré l'orc au contact",
           r.centre && r.centre.q === -3 && r.centre.r === 0, JSON.stringify(r.centre));
  verifier("les 37 cases à 3 de portée sont proposées", r.posables === 37, String(r.posables));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
