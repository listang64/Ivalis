// PAS DE TRACTION SUR UNE TECHNIQUE DE MONSTRE QUI FRAPPE AU CONTACT —
// ET PAS D'ÉTALEMENT DES DÉGÂTS DU TOUT (section 3).
//
// Nico : « pour les monstres, ne pas leur mettre Traction sur des compétences
// qui attaquent au CàC. » Une carte « au contact » n'a pas de Distance (l'arc
// d'un archer ne donne aucune portée à une créature : tir_monstre_contact.mjs).
// La règle vit dans effetAutorise (monstres_competences.js), dans les deux
// sens : pas de Traction sur une carte qui frappe déjà au contact, pas
// d'attaque sur une carte au contact qui porte déjà une Traction.
//
// Vérifié sur le vrai générateur et le grimoire réel (effets_reels.json).
import { chargerGenerateur, genererCorpus, EFFETS } from './banc_reel.mjs';
import fs from 'fs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(70)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const fenetre = chargerGenerateur();
const effetAutorise = eval(fs.readFileSync('/home/user/Ivalis/monstres_competences.js', 'utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '') + '\n;effetAutorise');
const eff = (nom) => { const id = Object.keys(EFFETS).find(k => EFFETS[k].Nom === nom); return { ...EFFETS[id], id }; };
const chantier = (arme, actions) => ({ arme, tags: new Set(), actions: actions.map(([base, mods = []]) => ({
  baseEffet: eff(base), count: 1, modsEffets: mods.map(m => ({ effet: eff(m), count: 1 })) })) });

console.log("\n1. LA RÈGLE, À LA MAIN");
{
  verifier("attaque au contact : la Traction est refusée",
           effetAutorise(chantier("Arme polyvalente", [["Attaque légère"]]), eff("Traction magique"), true) === false);
  verifier("attaque avec Distance : la Traction reste permise",
           effetAutorise(chantier("Arme polyvalente", [["Attaque légère", ["Distance"]]]), eff("Traction magique"), true) !== false);
  // L'arc ne donne aucune portée à une créature (tir_monstre_contact.mjs) :
  // sans Distance, son attaque reste au contact.
  verifier("archer SANS Distance : au contact, la Traction est refusée",
           effetAutorise(chantier("Arme légère Distance", [["Attaque légère"]]), eff("Traction magique"), true) === false);
  verifier("Traction déjà posée, carte au contact : l'attaque est refusée",
           effetAutorise(chantier("Magie", [["Traction magique"]]), eff("Attaque Magique"), false) === false);
  verifier("sans attaque, une carte de pure Traction reste permise",
           effetAutorise(chantier("Magie", [["Poussée"]]), eff("Traction magique"), true) !== false);
}

console.log("\n2. LE VRAI GÉNÉRATEUR, SUR TOUS LES GABARITS");
{
  const corpus = await genererCorpus(fenetre, 12);
  let cartes = 0, avecTraction = 0, fautives = 0; const ex = [];
  corpus.forEach(m => m.cartes.forEach(c => {
    cartes++;
    const noms = c.effets.map(e => e.nom.toLowerCase());
    const traction = noms.some(n => n.includes("traction"));
    if (traction) avecTraction++;
    const attaque = noms.some(n => /attaque|mots? de pouvoir/.test(n));
    const distance = noms.some(n => n.includes("distance"));
    if (traction && attaque && !distance) { fautives++; if (ex.length < 3) ex.push(`${m.archetype}: ${c.nom}`); }
  }));
  verifier("le générateur pose encore des Tractions (la règle ne les efface pas toutes)", avecTraction > 0,
           `${avecTraction}/${cartes}`);
  verifier("aucune technique ne tire ET frappe au contact", fautives === 0, `${fautives} ${ex.join(" | ")}`);
}

console.log("\n3. PAS D'ÉTALEMENT DES DÉGÂTS CHEZ LES CRÉATURES");
{
  verifier("l'Étalement est refusé, même sur une attaque",
           effetAutorise(chantier("Magie", [["Attaque Magique"]]), eff("Durée étalement dégâts"), true) === false);
  const corpus = await genererCorpus(fenetre, 12);
  let cartes = 0, etalees = 0;
  corpus.forEach(m => m.cartes.forEach(c => {
    cartes++;
    if (c.effets.some(e => /étalement|etalement|^dot$/i.test(e.nom))) etalees++;
  }));
  verifier("aucune technique de monstre générée n'étale ses dégâts", etalees === 0, `${etalees}/${cartes}`);
  const src = fs.readFileSync('/home/user/Ivalis/monstres_competences.js', 'utf-8');
  const plans = src.slice(src.indexOf('const PATRONS_PAR_ARCHETYPE'), src.indexOf('};', src.indexOf('const PATRONS_PAR_ARCHETYPE')));
  verifier("plus aucun patron « etalement » dans les plans des archetypes", !/"etalement"/.test(plans));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
