// LE CATALOGUE D'ÉQUIPEMENT, CONFRONTÉ AU TABLEAU DE NICO.
// objets.js est une transcription à la main de deux classeurs : une virgule de
// travers et une arme épique donne moins qu'une très rare sans que personne ne
// s'en aperçoive avant des semaines de parties. Ce banc relit donc le tableau
// (figé dans tableau_objets.json, extrait des .xlsx d'origine) et vérifie,
// ligne par ligne et palier par palier, que les CHIFFRES du catalogue sont
// exactement ceux du classeur — pas approchants : identiques.
import fs from 'fs';

const REF = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/tableau_objets.json', 'utf-8'));

const w = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/objets.js', 'utf-8'))(w);

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// -------------------------------------------------------------------------
//  Lecture du texte libre du tableau.
// -------------------------------------------------------------------------
//  Les cellules mêlent les chiffres de stats ("+2 dégâts physique") et le
//  nombre d'effets de rareté ("+ 2X (2 Effet A)"). On isole les seconds avant
//  de compter les premiers, sinon le "2" de "2 Effet A" passerait pour une stat.
const CLAUSE_EFFET = /\+?\s*(\d+\s*X\s*)?\(?\s*(\d+\s*)?Effet\s*[ABC](\s*,\s*[BC]\s*,?\s*(ou)?\s*[BC])?\s*\)?/gi;

function clauseEffet(texte) {
    const m = texte.match(new RegExp(CLAUSE_EFFET.source, 'i'));
    if (!m) return null;
    const brut = m[0];
    const double = /\d+\s*X/i.test(brut);
    // Le nombre d'effets est celui collé à "Effet" ; le "2" de "2X" est le
    // multiplicateur, pas un compte.
    const apresX = brut.replace(/\d+\s*X/i, "");
    const nb = (apresX.match(/(\d+)\s*Effet/i) || [])[1];
    const lettre = (brut.match(/Effet\s*([ABC])/i) || [])[1];
    return { double, nombre: parseInt(nb) || 1, lettre: (lettre || "").toUpperCase(), multi: /,\s*[BC]/.test(brut) };
}

function nombresDeStats(texte) {
    // Le signe compte : "-1 au coût du déplacement" n'est pas "+1". Seul piège,
    // le tiret de ponctuation du bouclier lourd ("28 Parade - +1 au coût...") :
    // il précède un "+", on le neutralise avant de lire les signes.
    // Deux tirets ne sont pas des signes : celui de ponctuation du bouclier
    // lourd ("28 Parade - +1 au coût...") et celui des fourchettes d'armure
    // ("Entre 20%-30%"). On les neutralise avant de lire les signes.
    const propre = texte.replace(CLAUSE_EFFET, " ")
                        .replace(/-\s*\+/g, "+")
                        .replace(/(\d\s*%?)\s*-\s*(?=\d)/g, "$1 ");
    return (propre.match(/-?\s?\d+/g) || [])
        .map(s => Number(s.replace(/\s/g, "")))
        .sort((a, b) => a - b);
}

// Les chiffres que le catalogue affiche pour un palier donné : une fourchette
// [min, max] compte pour ses deux bornes, comme elle est écrite dans le tableau.
function nombresDuCatalogue(palier) {
    const sortie = [];
    Object.keys(palier || {}).forEach(cle => {
        const v = palier[cle];
        if (cle === "etatsPropres") (v || []).forEach(e => sortie.push(e.chance));
        else if (cle === "aRepartir") sortie.push(v);
        else if (Array.isArray(v)) sortie.push(v[0], v[1]);
        else sortie.push(v);
    });
    return sortie.map(Number).sort((a, b) => a - b);
}

const memeListe = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// =========================================================================
console.log("1. LES 23 LIGNES DU TABLEAU, DANS LE MÊME ORDRE");
verifier("le catalogue compte autant de modèles que le tableau",
         w.MODELES_OBJETS.length === REF.modeles.length,
         `(${w.MODELES_OBJETS.length} contre ${REF.modeles.length})`);

REF.modeles.forEach((ref, i) => {
    const cat = w.MODELES_OBJETS[i];
    if (!cat) { verifier(`ligne ${ref.ligne} (${ref.modele}) présente`, false); return; }
    if (cat.type !== ref.type) verifier(`ligne ${ref.ligne} · type`, false, `("${cat.type}" contre "${ref.type}")`);
    if (cat.carac !== ref.carac) verifier(`ligne ${ref.ligne} · carac`, false, `("${cat.carac}" contre "${ref.carac}")`);
});
verifier("tous les types de la colonne A sont repris à l'identique",
         REF.modeles.every((r, i) => w.MODELES_OBJETS[i] && w.MODELES_OBJETS[i].type === r.type));
verifier("toutes les caracs de la colonne C sont reprises à l'identique",
         REF.modeles.every((r, i) => w.MODELES_OBJETS[i] && w.MODELES_OBJETS[i].carac === r.carac));

// =========================================================================
console.log("\n2. LES CHIFFRES DE CHAQUE PALIER, CELLULE PAR CELLULE");
let cellules = 0, cellulesOk = 0;
const ecarts = [];
REF.modeles.forEach((ref, i) => {
    const cat = w.MODELES_OBJETS[i];
    if (!cat) return;
    ["Commun", "Rare", "Très rare", "Épique"].forEach(rarete => {
        const texte = ref[rarete] || "";
        if (!texte) return;
        cellules++;
        const attendus = nombresDeStats(texte);
        const obtenus = nombresDuCatalogue(cat.paliers[rarete]);
        if (memeListe(attendus, obtenus)) cellulesOk++;
        else ecarts.push(`ligne ${ref.ligne} ${rarete} · tableau [${attendus}] · catalogue [${obtenus}] · « ${texte} »`);
    });
});
ecarts.forEach(e => console.log("     ÉCART : " + e));
verifier("chaque cellule de stat a exactement les mêmes chiffres", ecarts.length === 0,
         `(${cellulesOk}/${cellules} cellules)`);

// =========================================================================
console.log("\n3. LE NOMBRE D'EFFETS DE RARETÉ, ET LEUR RÉSERVOIR");
const ecartsEffets = [];
REF.modeles.forEach((ref, i) => {
    const cat = w.MODELES_OBJETS[i];
    if (!cat) return;
    ["Très rare", "Épique"].forEach(rarete => {
        const attendu = clauseEffet(ref[rarete] || "");
        const tires = w.tirerEffetsObjet(cat, rarete);
        if (!attendu) {
            if (tires.length > 0) ecartsEffets.push(`ligne ${ref.ligne} ${rarete} : le tableau n'annonce aucun effet, le catalogue en tire ${tires.length}`);
            return;
        }
        if (tires.length !== attendu.nombre) {
            ecartsEffets.push(`ligne ${ref.ligne} ${rarete} : ${attendu.nombre} effet(s) annoncé(s), ${tires.length} tiré(s)`);
        }
        // Réservoir : une lettre précise, ou "au choix parmi A, B ou C".
        const reservoirCat = cat.effets.reservoir;
        if (attendu.multi) {
            if (reservoirCat !== "ABC") ecartsEffets.push(`ligne ${ref.ligne} ${rarete} : réservoir A/B/C attendu, "${reservoirCat}" trouvé`);
        } else if (reservoirCat !== attendu.lettre) {
            ecartsEffets.push(`ligne ${ref.ligne} ${rarete} : réservoir ${attendu.lettre} attendu, "${reservoirCat}" trouvé`);
        }
        // Doublement : "2X" dans la cellule <=> l'objet épique double ses effets.
        if (rarete === "Épique") {
            const doubleCat = !cat.effets.sansDoublement;
            if (attendu.double !== doubleCat) {
                ecartsEffets.push(`ligne ${ref.ligne} : doublement 2X ${attendu.double ? "attendu" : "non prévu"} par le tableau, catalogue ${doubleCat ? "double" : "ne double pas"}`);
            }
        }
    });
});
ecartsEffets.forEach(e => console.log("     ÉCART : " + e));
verifier("nombre d'effets, réservoir et doublement conformes au tableau", ecartsEffets.length === 0);

// Un très rare ne tire jamais d'effet doublé, un épique toujours (sauf armures).
{
    const dague = w.MODELES_OBJETS.find(m => m.modele === "Dague");
    const chances = [];
    for (let i = 0; i < 400; i++) {
        w.tirerEffetsObjet(dague, "Épique").forEach(e => { if (e.chance) chances.push(e.chance); });
    }
    verifier("les effets à chance d'un épique valent bien le double (20% au lieu de 10%)",
             chances.length > 0 && chances.every(c => c === 20), `(${[...new Set(chances)].join(",")})`);

    const simples = [];
    for (let i = 0; i < 400; i++) {
        w.tirerEffetsObjet(dague, "Très rare").forEach(e => { if (e.chance) simples.push(e.chance); });
    }
    verifier("et ceux d'un très rare restent à leur valeur de base (10%)",
             simples.length > 0 && simples.every(c => c === 10), `(${[...new Set(simples)].join(",")})`);
}

// =========================================================================
console.log("\n4. LES TROIS RÉSERVOIRS D'EFFETS (colonnes J, K, L)");
verifier(`le réservoir A compte ${REF.effetsA.length} effets`, w.EFFETS_A.length === REF.effetsA.length,
         `(${w.EFFETS_A.length})`);
verifier(`le réservoir B compte ${REF.effetsB.length} effets`, w.EFFETS_B.length === REF.effetsB.length,
         `(${w.EFFETS_B.length})`);
verifier(`le réservoir C compte ${REF.effetsC.length} effets`, w.EFFETS_C.length === REF.effetsC.length,
         `(${w.EFFETS_C.length})`);

// Chaque effet du tableau doit avoir son jumeau chiffré dans le catalogue.
function chiffresEffet(effet) {
    const out = [];
    if (effet.chance) out.push(effet.chance);
    ["bonus", "buff", "buffSoi", "beniSoin"].forEach(cle => {
        if (effet[cle]) Object.keys(effet[cle]).forEach(k => out.push(effet[cle][k]));
    });
    return out.sort((a, b) => a - b);
}
[["A", REF.effetsA, w.EFFETS_A], ["B", REF.effetsB, w.EFFETS_B], ["C", REF.effetsC, w.EFFETS_C]].forEach(([lettre, ref, cat]) => {
    const manquants = [];
    ref.forEach((r, i) => {
        const attendus = (r.texte.match(/\d+/g) || []).map(Number).sort((a, b) => a - b);
        const obtenus = chiffresEffet(cat[i] || {});
        if (!memeListe(attendus, obtenus)) manquants.push(`  ${lettre}${i + 1} · tableau [${attendus}] · catalogue [${obtenus}] · « ${r.texte} »`);
    });
    manquants.forEach(m => console.log("     ÉCART :" + m));
    verifier(`les chiffres du réservoir ${lettre} sont ceux du tableau`, manquants.length === 0);
});

// =========================================================================
console.log("\n5. PRÉREQUIS ET CHANCES DE RARETÉ");
["Commun", "Rare", "Très rare", "Épique"].forEach(r => {
    verifier(`prérequis ${r} = ${REF.prerequis[r]}`, w.PREREQUIS_RARETE[r] === REF.prerequis[r],
             `(${w.PREREQUIS_RARETE[r]})`);
});
Object.keys(REF.chancesRarete).forEach(diff => {
    const attendu = REF.chancesRarete[diff];
    const obtenu = w.CHANCES_RARETE[diff];
    const memes = ["Commun", "Rare", "Très rare", "Épique"]
        .every(r => Math.round((attendu[r] || 0) * 100) === (obtenu ? obtenu[r] : -1));
    verifier(`difficulté « ${diff} » : ${["Commun","Rare","Très rare","Épique"].map(r => Math.round((attendu[r]||0)*100) + "%").join(" / ")}`,
             memes);
});

// Le tirage suit-il vraiment ces chances ? 20 000 jets, tolérance 2 points.
console.log("\n6. LE TIRAGE SUIT LES CHANCES ANNONCÉES (20 000 jets)");
Object.keys(w.CHANCES_RARETE).forEach(diff => {
    const comptes = { "Commun": 0, "Rare": 0, "Très rare": 0, "Épique": 0 };
    for (let i = 0; i < 20000; i++) comptes[w.tirerRarete(diff)]++;
    const mesures = w.RARETES.map(r => (comptes[r] / 200).toFixed(1) + "%");
    const ecartMax = Math.max(...w.RARETES.map(r => Math.abs(comptes[r] / 200 - w.CHANCES_RARETE[diff][r])));
    verifier(`« ${diff} » : ${mesures.join(" / ")}`, ecartMax < 2, `(écart max ${ecartMax.toFixed(2)} pt)`);
});

// Une difficulté inconnue (monstres posés à la main) retombe sur Normale.
{
    const comptes = { "Commun": 0, "Rare": 0, "Très rare": 0, "Épique": 0 };
    for (let i = 0; i < 20000; i++) comptes[w.tirerRarete(undefined)]++;
    verifier("une difficulté inconnue retombe sur la ligne NORMAL",
             Math.abs(comptes["Commun"] / 200 - 75) < 2, `(${(comptes["Commun"] / 200).toFixed(1)}% de communs)`);
    verifier("et ne sort donc jamais d'épique", comptes["Épique"] === 0);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
