// Vérifie que le générateur de compétences lit VRAIMENT le gabarit du bestiaire :
// on modifie Fatigue_Max comme Nico le ferait dans le tableau, et on regarde si
// les six tranches de coût suivent.
import { chargerGenerateur, genererCorpus, analyserCarte, GAB, COMBOS } from './banc_reel.mjs';

const fenetre = chargerGenerateur();
const TRANCHES = [[15,30],[30,40],[40,50],[50,70],[70,90],[90,100]];
const CIBLE = "DPS CAC/Normal";
const original = GAB[CIBLE].Fatigue_Max;

async function mesurer(fatigueMax, tirages = 40) {
    GAB[CIBLE].Fatigue_Max = fatigueMax;
    const parTranche = TRANCHES.map(() => []);
    let horsBornes = 0, total = 0;
    for (let i = 0; i < tirages; i++) {
        const docs = await fenetre.genererCompetencesMonstre({ nom: "Créature", archetype: "DPS CAC", palier: "Normal" });
        docs.map(analyserCarte).forEach((c, t) => {
            parTranche[t].push(c.fatigue);
            total++;
            const plancher = Math.max(1, Math.round(TRANCHES[t][0] / 100 * fatigueMax));
            const plafond  = Math.round(TRANCHES[t][1] / 100 * fatigueMax);
            if (c.fatigue < plancher || c.fatigue > plafond) horsBornes++;
        });
    }
    return { fatigueMax, moyennes: parTranche.map(v => v.reduce((a, b) => a + b, 0) / v.length), horsBornes, total };
}

console.log("GÉNÉRATEUR DE COMPÉTENCES vs GABARIT — archetype DPS CAC / palier Normal");
console.log(`(valeur réelle en base : Fatigue_Max = ${original})\n`);

const resultats = [];
for (const f of [60, 100, 150, 240]) resultats.push(await mesurer(f));
GAB[CIBLE].Fatigue_Max = original;

console.log("Coût moyen des 6 cartes selon la fatigue max du bestiaire :");
console.log("  Fat.Max │ " + TRANCHES.map((t, i) => `t${i + 1}(${t[0]}-${t[1]}%)`.padStart(13)).join(" "));
resultats.forEach(r => {
    console.log(`  ${String(r.fatigueMax).padStart(7)} │ ` + r.moyennes.map(m => m.toFixed(1).padStart(13)).join(" "));
});

console.log("\nRapport au cas de référence (Fat.Max 100) — attendu = Fat.Max/100 :");
const ref = resultats.find(r => r.fatigueMax === 100);
resultats.forEach(r => {
    const rapports = r.moyennes.map((m, i) => m / ref.moyennes[i]);
    const moy = rapports.reduce((a, b) => a + b, 0) / rapports.length;
    console.log(`  Fat.Max ${String(r.fatigueMax).padStart(3)} : rapport moyen ${moy.toFixed(3)}  (attendu ${(r.fatigueMax / 100).toFixed(3)})  écart ${((moy / (r.fatigueMax / 100) - 1) * 100).toFixed(1)}%`);
});

const fautes = resultats.reduce((s, r) => s + r.horsBornes, 0);
const cartes = resultats.reduce((s, r) => s + r.total, 0);
console.log(`\nCartes hors des bornes de leur tranche : ${fautes} / ${cartes}`);

// Deuxième vérification : est-ce que TOUS les archetypes/paliers réels suivent
// leur propre Fatigue_Max, sans qu'aucune carte ne sorte de sa tranche ?
console.log("\nCONTRÔLE SUR TOUT LE BESTIAIRE RÉEL");
const corpus = await genererCorpus(fenetre, 6);
let deborde = 0, n = 0;
const parCombo = {};
corpus.forEach(m => {
    const fm = GAB[m.archetype + "/" + m.palier].Fatigue_Max;
    m.cartes.forEach((c, t) => {
        n++;
        const plancher = Math.max(1, Math.round(TRANCHES[t][0] / 100 * fm));
        const plafond  = Math.round(TRANCHES[t][1] / 100 * fm);
        if (c.fatigue < plancher || c.fatigue > plafond) deborde++;
    });
    const cle = m.archetype + "/" + m.palier;
    (parCombo[cle] ||= { fm, max: [] }).max.push(Math.max(...m.cartes.map(c => c.fatigue)));
});
Object.entries(parCombo).sort((a, b) => a[1].fm - b[1].fm).forEach(([cle, v]) => {
    const moyMax = v.max.reduce((a, b) => a + b, 0) / v.max.length;
    console.log(`  ${cle.padEnd(22)} Fat.Max ${String(v.fm).padStart(4)} → carte la plus chère ${moyMax.toFixed(1)} (${(100 * moyMax / v.fm).toFixed(0)}% de la jauge)`);
});
console.log(`\n  ${n} cartes vérifiées, ${deborde} hors tranche.`);
