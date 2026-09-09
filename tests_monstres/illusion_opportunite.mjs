// UNE ILLUSION NE FRAPPE PAS.
//
// L'illusion occupe une case et détourne les coups : c'est tout son intérêt.
// Mais elle n'a pas d'arme, et une image qui porte une attaque d'opportunité à
// un ennemi qui passe devant elle, ça n'existe pas. C'est pourtant ce qui
// arrivait : listerEnnemisAuContact ne regardait que le camp et l'état vivant,
// et rendait donc les illusions comme n'importe quel combattant.
//
// On charge le vrai code de moteur_effets.js et on le met devant le cas.
import fs from 'fs';

const src = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8').split('\n');
function bloc(marqueur) {
    const d = src.findIndex(l => l.startsWith(marqueur));
    if (d < 0) throw new Error(marqueur + " introuvable");
    let f = d; for (let i = d + 1; i < src.length; i++) { if (src[i] === '};') { f = i; break; } }
    return src.slice(d, f + 1).join('\n');
}
// getHexDistance est utilisée par listerEnnemisAuContact : on prend la vraie.
function fonctionSimple(marqueur) {
    const d = src.findIndex(l => l.startsWith(marqueur));
    let f = d; for (let i = d + 1; i < src.length; i++) { if (src[i] === '}') { f = i; break; } }
    return src.slice(d, f + 1).join('\n');
}
const SRC = fonctionSimple('function getHexDistance')
          + '\n' + bloc('window.listerEnnemisAuContact = function')
          + '\n' + bloc('window.resoudreAttaqueOpportunite = async function');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const w = {};
// Le vrai code écrit le résultat en base : ici, une écriture qui ne fait rien.
new Function('window', 'updateDoc', 'doc', 'db', SRC)(w, async () => {}, () => ({}), {});

// Le plateau : la goule au centre, entourée du héros, de son illusion, et d'un
// allié à terre. Tous à une case.
w.TOKENS_VTT_DATA = {
    M1: { q: 0, r: 0 },
    H1: { q: 1, r: 0 },
    ILL: { q: 0, r: 1 },
    H2: { q: -1, r: 0 }
};
w.PERSOS_PARTIE = [
    { idPersonnage: "M1", camp: "Ennemi", statut: "Vivant" },
    { idPersonnage: "H1", camp: "Allié", statut: "Vivant" },
    { idPersonnage: "ILL", camp: "Allié", statut: "Vivant", estIllusion: true },
    { idPersonnage: "H2", camp: "Allié", statut: "Mort" }
];
w.atoutRace = () => ({});
w.esquiveCombattant = () => 0;
w.paradeCombattant = () => 0;
w.refCombattant = (id) => ({ id });
w.degatsArmeCombattant = () => 5;
w.defenseCombattant = () => 0;

console.log("\n1. QUI EST AU CONTACT DE LA GOULE ?");
const contacts = w.listerEnnemisAuContact("M1", w.TOKENS_VTT_DATA.M1);
console.log("     ", contacts.join(", ") || "personne");
verifier("le héros compte", contacts.includes("H1"));
verifier("l'illusion, non", !contacts.includes("ILL"), `(${contacts.join(",")})`);
verifier("un allié à terre non plus", !contacts.includes("H2"));

console.log("\n2. ET SI ON LUI DEMANDE QUAND MÊME DE FRAPPER");
const coup = await w.resoudreAttaqueOpportunite("ILL", "M1");
verifier("l'illusion ne porte aucun coup", coup === null, `(${JSON.stringify(coup)})`);
const vraiCoup = await w.resoudreAttaqueOpportunite("H1", "M1");
verifier("le héros, lui, frappe bien", vraiCoup !== null);

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
