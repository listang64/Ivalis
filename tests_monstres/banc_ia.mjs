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
  global.document = { getElementById: () => null, querySelectorAll: () => [] };
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
