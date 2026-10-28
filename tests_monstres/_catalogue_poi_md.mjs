// Tire CATALOGUE_POI.md (le document de Nico) de poi_catalogue.js :
//   node tests_monstres/_catalogue_poi_md.mjs
// Le document et le catalogue ne divergent jamais : on régénère, on ne
// retouche pas le .md à la main.
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const RACINE = process.env.IVALIS_RACINE || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const contexte = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(RACINE, 'poi_catalogue.js'), 'utf-8'), contexte);
const C = contexte.window.CATALOGUE_POI;
const NOMS_REGIONS = { 1: "La forêt des murmures", 2: "La vallée de souffre", 3: "Le mont Pletia", 4: "Volcanisse", 5: "Le désert d'Etheria",
  6: "L'enclave d'argentée", 7: "L'île aux marchés", 8: "Les doigts d'Atrium", 9: "Arcaï", 10: "La pointe des sentinelles",
  11: "La province d'Aurelya", 12: "La crique du Pendu", 13: "Les îlots maudits" };
const TERRAINS = { foret: "forêt", plaine: "plaine", colline: "colline", montagne: "montagne", marais: "marais", desert: "désert",
  cote: "côte", riviere: "rivière", lac: "lac", route: "route", partout: "partout" };

let types = 0, variantes = 0;
C.familles.forEach(f => { types += f.types.length; f.types.forEach(t => { variantes += t.variantes.length; }); });
const combinaisons = contexte.window.nombreCombinaisonsPoi();
const L = [];
L.push("# Catalogue des points d'intérêt (POI) — Ivalis", "");
L.push("> Tiré automatiquement de `poi_catalogue.js` (v277). Pour changer la liste, on change le fichier JS, puis on régénère ce document :");
L.push("> `node tests_monstres/_catalogue_poi_md.mjs`.", "");
L.push("## Comment un POI naît", "");
L.push("1. **La chance** : à chaque journée de marche sur une carte régionale, un POI a une chance d'apparaître (50 % par défaut, réglable en DEV). Au plus un par jour.");
L.push("2. **La place** : dans un rayon autour du groupe, sur le terrain praticable, hors des nuages, et assez loin des lieux déjà posés (une taille de marge) pour que les dessins ne se touchent pas.");
L.push("3. **La graine** : quand les joueurs décident d'aller voir, on tire dans ce catalogue — une **famille** (au poids), un **type** (au poids, ×3 si le terrain lu sur la carte lui va, ×0,25 sinon, multiplié par le lore de la région), une **variante**, un **état**, une **ambiance** et une **accroche**.");
L.push("4. **La broderie** : MIA_POI (Gemini, température tirée entre 0,80 et 1,20) écrit le lieu sur cette graine, avec le descriptif et le lore de la région, le terrain, et des règles strictes (Antique Fantastique, peuples d'Ivalis, jamais de grande ville, rien d'anachronique).", "");
L.push(`**En chiffres** : ${C.familles.length} familles, ${types} types, ${variantes} variantes, ${C.etats.length} états, ${C.ambiances.length} ambiances, ${C.accroches.length} accroches — soit **${combinaisons.toLocaleString("fr-FR")}** graines différentes avant même que l'IA ne brode.`, "");
L.push("## Les familles et leurs types", "");
C.familles.forEach(f => {
  const totalPoids = f.types.reduce((s, t) => s + t.poids, 0);
  L.push(`### ${f.nom} — poids ${f.poids}`, "");
  L.push("| Type | Poids | Terrains | Régions favorisées | Bâtiments | Variantes |", "|---|---|---|---|---|---|");
  f.types.forEach(t => {
    const regions = Object.entries(t.regions || {}).map(([n, m]) => `${NOMS_REGIONS[n] || n} ×${m}`).join(", ") || "—";
    const terrains = (t.terrains || ["partout"]).map(x => TERRAINS[x] || x).join(", ");
    const [bmin, bmax] = t.batiments || [0, 1];
    L.push(`| **${t.nom}** | ${t.poids}/${totalPoids} | ${terrains} | ${regions} | ${bmin === bmax ? bmin : `${bmin} à ${bmax}`} | ${t.variantes.join(" · ")} |`);
  });
  L.push("");
});
L.push("## Les états", "", C.etats.map(e => `- ${e}`).join("\n"), "");
L.push("## Les ambiances", "", C.ambiances.map(e => `- ${e}`).join("\n"), "");
L.push("## Les accroches (pour le MJ)", "", C.accroches.map(e => `- ${e}`).join("\n"), "");
L.push("## Les règles données à MIA_POI", "");
const src = fs.readFileSync(path.join(RACINE, 'poi_creation.js'), 'utf-8');
const regles = (src.match(/const REGLES = `([\s\S]*?)`;/) || [])[1] || "";
L.push(regles.split("\n").map(l => l.trim()).filter(Boolean).map(l => /^\d\./.test(l) ? l : `**${l}**\n`).join("\n"), "");
fs.writeFileSync(path.join(RACINE, 'CATALOGUE_POI.md'), L.join("\n"));
console.log(`CATALOGUE_POI.md : ${types} types, ${variantes} variantes, ${combinaisons} graines.`);
