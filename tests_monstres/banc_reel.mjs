import fs from 'fs';
export const EFFETS = JSON.parse(fs.readFileSync('effets_reels.json','utf-8'));
const GABARITS = JSON.parse(fs.readFileSync('gabarits_reels.json','utf-8'));

// Gabarits réels indexés par archetype+palier
export const GAB = {};
export const COMBOS = [];
Object.values(GABARITS).forEach(g => {
  GAB[g.Archetype + "/" + g.Palier] = g;
  COMBOS.push({ archetype: g.Archetype, palier: g.Palier, fatigueMax: g.Fatigue_Max });
});

export function chargerGenerateur() {
  const fenetre = {}; global.window = fenetre;
  if (process.env.PLAFOND_COUP && process.env.PLAFOND_COUP !== "OFF") {
    fenetre.PART_PV_PAR_COUP = JSON.parse(process.env.PLAFOND_COUP);
  }
  if (process.env.PLAFOND_COUP === "OFF") {
    fenetre.PART_SOCLE = { brute:0, frappe:0, soutien:0, etat:0, controle:0, etalement:0, zone:0, persistance:0 };
  }
  global.localStorage = { getItem: () => null };   // algorithme pur, sans IA
  global.fetch = async () => { throw new Error("IA débranchée"); };
  global.document = { getElementById: () => null };
  fenetre.EFFETS_BDD_CACHE = EFFETS;
  fenetre.gabaritMonstre = (a,p) => GAB[a + "/" + p] || null;
  eval(fs.readFileSync('/home/user/Ivalis/monstres_competences.js','utf-8')
         .replace(/^import[\s\S]*?from\s+"[^"]+";/gm,''));
  return fenetre;
}

export function analyserCarte(d) {
  const effets = []; let nbActions = 0, tailleZone = 0, nbDurees = 0;
  d.Composants.actions.forEach(a => {
    nbActions++;
    effets.push({ nom: EFFETS[a.baseEffetId].Nom, count: a.count, id: a.baseEffetId, base: true });
    Object.keys(a.mods).forEach(id => effets.push({ nom: EFFETS[id].Nom, count: a.mods[id], id, base: false }));
    if (a.zoneHexes.length > tailleZone) tailleZone = a.zoneHexes.length;
    nbDurees += (a.baseDuree||0) + Object.values(a.modsDuree||{}).reduce((s,v)=>s+v,0);
  });
  return { nom:d.Nom, patron:d.Patron, fatigue:d.Fatigue, initiative:d.Initiative, coutPC:d.Cout_PC,
           nbActions, tailleZone, nbDurees, effets, doc: d,
           signature: effets.map(e=>e.nom).sort().join("|"),
           maxEmpilement: Math.max(...effets.map(e=>e.count)),
           nbEffetsDistincts: new Set(effets.map(e=>e.nom)).size };
}

export async function genererCorpus(fenetre, parCombo) {
  const corpus = [];
  for (const c of COMBOS) {
    for (let i = 0; i < parCombo; i++) {
      const docs = await fenetre.genererCompetencesMonstre({ nom:"Créature", archetype:c.archetype, palier:c.palier });
      corpus.push({ ...c, cartes: docs.map(analyserCarte) });
    }
  }
  return corpus;
}
