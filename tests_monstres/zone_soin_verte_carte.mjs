// LA ZONE DE SOIN SE DESSINE EN VERT SUR LA CARTE, PAS EN ROUGE.
// window.HABILLAGE_ZONES_PERSISTANTES (le message flottant à l'entrée) était
// déjà vert pour le type "soin", mais le VRAI rendu SVG de la case au sol
// (dessinerHexZonePersistante, combat.js) ne connaissait pas ce type et
// retombait sur la case par défaut ("neutre") : un rouge sourd, comme un
// piège. Ce banc dessine réellement une case "soin" avec le vrai code et
// vérifie qu'aucune trace de rouge n'y traîne.
import fs from 'fs';

const combat = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');

function fonction(src, marqueur, finLigne = '}') {
    const lignes = src.split('\n');
    const d = lignes.findIndex(l => l.startsWith(marqueur));
    if (d < 0) throw new Error("introuvable : " + marqueur);
    let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
    return lignes.slice(d, f + 1).join('\n');
}

const SRC = [
    fonction(combat, 'function graineZone(q, r, k) {'),
    fonction(combat, 'function pointsHexZone(cx, cy, rayon) {'),
    fonction(combat, 'function dessinerHexZonePersistante(type, hex, R, leger) {')
].join('\n\n');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const w = { PLATEAU_VTT: { hexToPixel: (q, r) => ({ x: q * 60, y: r * 60 }) } };
new Function('window', SRC + '\nwindow.dessinerHexZonePersistante = dessinerHexZonePersistante;')(w);

console.log("1. LA CASE « SOIN » N'A PLUS RIEN DE ROUGE");
{
    const svgSoin = w.dessinerHexZonePersistante("soin", { q: 0, r: 0 }, 30, false);
    verifier("aucune référence à la couleur rouge des zones de dégâts (#ff4c4c)",
             !svgSoin.includes("#ff4c4c"));
    verifier("aucun remplissage rouge générique non plus (rgba(255,76,76,...))",
             !svgSoin.includes("rgba(255,76,76"));
    verifier("le contour est bien vert (#4caf50, la même couleur que le message flottant)",
             svgSoin.includes("#4caf50"), svgSoin.match(/stroke="([^"]+)"/)?.[1]);
    verifier("le remplissage utilise bien le dégradé de soin dédié",
             svgSoin.includes("url(#zp-grad-soin)"));
}

console.log("\n2. LES AUTRES TYPES NE SONT PAS TOUCHÉS PAR L'AJOUT");
{
    const svgFeu = w.dessinerHexZonePersistante("feu", { q: 0, r: 0 }, 30, false);
    const svgNeutre = w.dessinerHexZonePersistante("neutre", { q: 0, r: 0 }, 30, false);
    verifier("le feu reste orange (#ff8a2e)", svgFeu.includes("#ff8a2e"));
    verifier("une zone neutre (dégâts sans état) reste rouge, comme avant",
             svgNeutre.includes("rgba(255,76,76"));
}

console.log("\n3. UNE GRANDE EMPRISE ('leger') RESTE VERTE AUSSI, JUSTE ALLÉGÉE");
{
    const svgLeger = w.dessinerHexZonePersistante("soin", { q: 1, r: -1 }, 30, true);
    verifier("toujours vert en mode allégé", svgLeger.includes("#4caf50") && !svgLeger.includes("#ff4c4c"));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
