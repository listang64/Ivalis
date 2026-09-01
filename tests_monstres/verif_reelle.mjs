import fs from 'fs';
import { chargerGenerateur, genererCorpus, EFFETS, COMBOS } from './banc_reel.mjs';
const TR = [[15,30],[30,40],[40,50],[50,70],[70,90],[90,100]];
const fenetre = chargerGenerateur();
const corpus = await genererCorpus(fenetre, 40);
const toutes = corpus.flatMap(m => m.cartes);
const pct = (n,d) => (100*n/d).toFixed(2) + "%";

// --- Les vraies règles de la Forge, extraites de competences.js ---
const src = fs.readFileSync('/home/user/Ivalis/competences.js','utf-8');
const isConnectedToCenter = eval(src.slice(src.indexOf('function isConnectedToCenter'), src.indexOf('function purgeDisconnectedZoneHexes')) + '; isConnectedToCenter');
const estUneAttaqueDeBase  = eval(src.slice(src.indexOf('function estUneAttaqueDeBase'), src.indexOf('function getMaxStacks')) + '; estUneAttaqueDeBase');
const parseFrenchFloat     = eval(src.slice(src.indexOf('function parseFrenchFloat'), src.indexOf('// Simple garde-fou')) + '; parseFrenchFloat');
const getMaxStacks         = eval(src.slice(src.indexOf('function parseFrenchFloat'), src.indexOf('function formatterTexteEffet')) + '; getMaxStacks');
const estIncompatibleAvecArme = eval(src.slice(src.indexOf('function estIncompatibleAvecArme'), src.indexOf('// Traction a sa propre portée fixe')) + '; estIncompatibleAvecArme');

const compteurs = {};
const inc = (k, detail) => { (compteurs[k] = compteurs[k] || { n:0, ex:[] }).n++;
  if (compteurs[k].ex.length < 3 && detail) compteurs[k].ex.push(detail); };

corpus.forEach(m => m.cartes.forEach((c, rang) => {
  const d = c.doc;
  const desc = `${m.archetype}/${m.palier} t${rang+1} «${d.Nom}» : ` +
    d.Composants.actions.map(a => EFFETS[a.baseEffetId].Nom + (a.count>1?"×"+a.count:"") +
      Object.entries(a.mods).map(([id,v])=>" + "+EFFETS[id].Nom+(v>1?"×"+v:"")).join("")).join(" || ");

  // 1. Tranche de fatigue
  const [pmin,pmax] = TR[rang];
  const min = Math.max(1, Math.round(pmin/100*m.fatigueMax)), max = Math.round(pmax/100*m.fatigueMax);
  if (d.Fatigue < min || d.Fatigue > max) inc("fatigue hors tranche", `${desc} -> ⚡${d.Fatigue} attendu ${min}-${max}`);

  // 2. Règles de la Forge
  const tags = new Set(); let nbAttaques = 0, aAttaque = false, aPoison = false, aTraction = false, aDistance = false;
  d.Composants.actions.forEach(a => {
    const eff = [{ e: EFFETS[a.baseEffetId], n: a.count, racine: true },
                 ...Object.entries(a.mods).map(([id,v]) => ({ e: EFFETS[id], n: v, racine: false }))];
    eff.forEach(({e, n, racine}) => {
      if (!e) { inc("effet inexistant en base", desc); return; }
      if (e.Modificateur && e.Modificateur !== "AUCUN") tags.add(e.Modificateur.toUpperCase());
      if (estUneAttaqueDeBase(e.Nom)) { nbAttaques++; aAttaque = true; }
      if (/poison/i.test(e.Nom)) aPoison = true;
      if (/traction/i.test(e.Nom)) aTraction = true;
      if (e.Nom === "Distance") aDistance = true;
      if (estIncompatibleAvecArme(e.Nom, d.Arme)) inc("effet interdit par l'arme", `${desc} [arme ${d.Arme}]`);
      // plafond d'empilement RÉEL de la Forge
      if (n > getMaxStacks(e)) inc("empilement au-delà du max de la Forge", `${desc} — ${e.Nom}×${n} (max ${getMaxStacks(e)})`);
      if ((e.Nom||"").toLowerCase().trim() === "durée +") inc("« Durée + » posé comme mod", desc);
    });
    // durées ⏳
    const maxD = getMaxStacks(EFFETS["EFF_DUREE__"]);
    if ((a.baseDuree||0) > maxD) inc("baseDuree au-delà du max", desc);
    Object.entries(a.modsDuree||{}).forEach(([id,v]) => {
      if (v > maxD) inc("modsDuree au-delà du max", desc);
      if (!a.mods[id]) inc("modsDuree sur un mod absent", desc);
    });
    // zone
    if (a.zoneHexes.length > 0) {
      if (a.zoneHexes.length > 15) inc("zone de plus de 15 hexagones", desc);
      const posees = [];
      for (const h of a.zoneHexes) {
        if (!isConnectedToCenter(posees, h, false)) { inc("zone non connectée au lanceur", desc); break; }
        posees.push(h);
      }
      if (a.zoneHexes.some(h => h.q===0 && h.r===0)) inc("zone incluant la case du lanceur", desc);
      if (!Object.keys(a.mods).some(id => EFFETS[id].Nom === "Zone")) inc("zoneHexes sans le mod Zone", desc);
    }
    if (Object.keys(a.mods).some(id => EFFETS[id].Nom === "Zone") && a.zoneHexes.length === 0) inc("mod Zone sans hexagones", desc);
  });
  if (tags.size > 2) inc("plus de 2 caractéristiques", `${desc} [${[...tags].join("+")}]`);
  if (nbAttaques > 1) inc("plus d'une attaque de base", desc);
  if (aPoison && !aAttaque) inc("poison sans source de dégâts", desc);
  if (aTraction && aDistance) inc("Traction et Distance ensemble", desc);

  // 3. Champs du document
  ["Nom","Arme","Element","Fatigue","Initiative","Cout_PC","Effets_Compiles","Composants"].forEach(k => {
    if (d[k] === undefined || d[k] === null || d[k] === "") inc("champ manquant : " + k, desc);
  });
  if (!Array.isArray(d.Effets_Compiles) || d.Effets_Compiles.length === 0) inc("Effets_Compiles vide", desc);
  if (d.Fatigue <= 0) inc("fatigue nulle ou négative", desc);
  if (d.Initiative < 0) inc("initiative négative", desc);
}));

console.log(`VÉRIFICATION SUR LA VRAIE BASE`);
console.log(`  ${COMBOS.length} gabarits réels × 40 tirages = ${corpus.length} monstres, ${toutes.length} cartes\n`);
const cles = Object.keys(compteurs);
if (cles.length === 0) console.log("  Aucune anomalie détectée sur l'ensemble des contrôles.");
else cles.forEach(k => {
  console.log(`  ❌ ${k} : ${compteurs[k].n} (${pct(compteurs[k].n, toutes.length)})`);
  compteurs[k].ex.forEach(e => console.log(`       ${e}`));
});
