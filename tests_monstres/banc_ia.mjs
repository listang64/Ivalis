import fs from 'fs';
export const EFFETS = JSON.parse(fs.readFileSync('effets_reels.json','utf-8'));

// Plateau hexagonal simulé : murs, cases supprimées et terrain difficile.
export function creerPlateau({ murs = [], supprimees = [], difficiles = [] } = {}) {
  const set = a => new Set(a.map(h => `${h.q},${h.r}`));
  const M = set(murs), S = set(supprimees), D = set(difficiles);
  return {
    getCaseState(q, r) {
      const c = `${q},${r}`;
      return { isBlocked: M.has(c), isDeleted: S.has(c) || Math.abs(q) > 12 || Math.abs(r) > 12, isDifficult: D.has(c) };
    }
  };
}

export function chargerIA(monde) {
  const w = {}; global.window = w;
  // Réglages d'équilibrage surchargeables depuis l'environnement, pour comparer
  // deux calibrages sans toucher au code du jeu (cf. calibrage_degats.mjs).
  if (process.env.PLAFOND_COUP && process.env.PLAFOND_COUP !== "OFF") {
    w.PART_PV_PAR_COUP = JSON.parse(process.env.PLAFOND_COUP);
  }
  if (process.env.PLAFOND_COUP === "OFF") {
    w.PART_SOCLE = { brute:0, frappe:0, soutien:0, etat:0, controle:0, etalement:0, zone:0, persistance:0 };
  }
  // La fenêtre de combat est considérée ouverte : l'IA ne joue que dans ce cas.
  global.document = {
    getElementById: (id) => id === "fenetre-combat" ? { style: { display: "block" } } : null,
    querySelectorAll: () => []
  };
  global.localStorage = { getItem: () => null };

  w.PLATEAU_VTT = monde.plateau;
  w.TOKENS_VTT_DATA = monde.tokens;
  w.PERSOS_PARTIE = monde.persos;
  w.MONSTRES_PARTIE = monde.persos.filter(p => p.estMonstre);
  w.ZONES_PERSISTANTES = monde.zones || {};
  w.EFFETS_BDD_CACHE = EFFETS;
  w.CACHE_COMPETENCES_GLOBAL = monde.competences || {};
  w.PARTIE_DATA = monde.partie || {};
  w.ID_PARTIE_COURANTE = "P1";
  w.CHEMIN_MOUVEMENT = []; w.CHEMIN_START_NODE = null;
  w.estCombattantMort = (id) => {
    const p = monde.persos.find(x => x.idPersonnage === id); if (!p) return false;
    const pvMax = parseInt(p.PV_Max) || 0, pv = parseInt(p.PV_Actuels) || 0;
    return p.statut === "Mort" || (pvMax > 0 && pv <= 0);
  };
  w.estMonstre = (id) => !!monde.persos.find(x => x.idPersonnage === id && x.estMonstre);
  // Utilisée par l'A* du jeu : seul un combattant debout barre le passage.
  w.caseOccupeeParVivant = (q, r) => Object.keys(monde.tokens).some(id =>
    monde.tokens[id].q === q && monde.tokens[id].r === r && !w.estCombattantMort(id));

  // Le VRAI A* et la vraie distance du jeu, extraits de mouvement.js.
  const mv = fs.readFileSync('/home/user/Ivalis/mouvement.js','utf-8');
  const bloc = mv.slice(mv.indexOf('function hexDistance'), mv.indexOf('window.hexDistanceVTT'));
  const outils = eval(bloc + '; ({ hexDistance, calculerCheminAStar })');
  w.hexDistanceVTT = outils.hexDistance;
  w.calculerCheminVTT = outils.calculerCheminAStar;

  eval(fs.readFileSync('/home/user/Ivalis/monstres_ia.js','utf-8').replace(/^import[\s\S]*?from\s+"[^"]+";/gm,''));
  return w;
}

export const combattant = (o) => ({
  statut: "Vivant", PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 120, fatigueActuelle: 120,
  Etats_Alteres: [], camp: "Allié", ...o
});

// ⚠️ global.window est unique : créer un second monde écrase le premier. Toute
// comparaison entre deux situations DOIT réactiver le bon monde avant chaque
// mesure, faute de quoi les deux mesures portent sur le même monde et donnent
// évidemment le même résultat.
export function activer(w) { global.window = w; return w; }
