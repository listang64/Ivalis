// UNE CARTE ENRICHIE PAR L'ÉQUIPEMENT NE PORTE AUCUN TROU.
//
// Nico a posé sa zone, et plus rien : « WriteBatch.set() called with invalid
// data. Unsupported field value: undefined ». Firestore refuse la moindre
// valeur undefined, et c'est l'intention ENTIÈRE de la carte qui tombait.
//
// Le trou venait de l'arme. Une arme qui brûle, gèle, étourdit… ajoute son
// état aux cibles de la carte (appliquerEquipementALaCarte, moteur_effets.js),
// et cet état portait `idProvocateur: undefined` dès qu'il n'était pas une
// Provocation. Ce banc fait tourner le VRAI code sur chaque état qu'une arme
// peut porter, et fouille le résultat jusqu'au fond des tableaux.
import fs from 'fs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const src = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8');
// (L'icône du Saignement est définie juste avant les gabarits, qui s'en servent.)
const debut = src.indexOf('const ICONE_SAIGNEMENT = ') >= 0 ? src.indexOf('const ICONE_SAIGNEMENT = ')
                                                             : src.indexOf('const GABARITS_ETATS_EQUIPEMENT = {');
const marque = 'window.appliquerEquipementALaCarte = function';
const debutFn = src.indexOf(marque);
const fin = src.indexOf('\n};\n', debutFn) + 4;
if (debut < 0 || debutFn < 0 || fin < 4) throw new Error("appliquerEquipementALaCarte introuvable dans moteur_effets.js");
const SRC = src.slice(debut, fin);

const window = {};
new Function('window', SRC)(window);

// Le premier chemin qui mène à une valeur undefined — ce que Firestore refuse.
function premierIndefini(valeur, chemin) {
    if (valeur === undefined) return chemin || "(racine)";
    if (Array.isArray(valeur)) {
        for (let i = 0; i < valeur.length; i++) {
            const t = premierIndefini(valeur[i], `${chemin}[${i}]`);
            if (t !== null) return t;
        }
        return null;
    }
    if (valeur && typeof valeur === "object") {
        for (const k of Object.keys(valeur)) {
            const t = premierIndefini(valeur[k], chemin ? `${chemin}.${k}` : k);
            if (t !== null) return t;
        }
    }
    return null;
}

console.log("1. CHAQUE ÉTAT QU'UNE ARME PEUT PORTER, SUR UNE CARTE DE ZONE");
const etats = Object.keys(window.GABARITS_ETATS_EQUIPEMENT);
const trous = [];
etats.forEach(nomEtat => {
    window.bonusEquip = () => 0;
    window.bonusEquipPourCarte = () => 0;
    window.etatsEquipementPourCarte = () => [{ etat: nomEtat, chance: 20 }];
    // (v476) Les états d'arme sont des augmentations max : ils s'ajoutent à
    // l'état que la carte porte déjà (10 % + 20 % = 30 %), et n'en créent aucun.
    const state = {
        isZone: true, zoneHexesFinaux: [{ q: 1, r: 0 }, { q: 2, r: 0 }],
        attaques: [{ nom: "Attaque légère", valeurBrute: 6, typeRes: "Physique", cibles: ["M1", "M2"] }],
        alterations: [{ nom: nomEtat, chance: 10, duree: 2, cibles: ["M1", "M2"] }]
    };
    window.appliquerEquipementALaCarte(state, { idPersonnage: "BRAKAR" }, "Arme légère CAC");
    const ajoute = state.alterations.find(a => a.nom === nomEtat);
    const trou = premierIndefini(state, "");
    if (!ajoute || ajoute.chance !== 30 || state.alterations.length !== 1 || trou !== null) trous.push(`${nomEtat} → ${ajoute ? (trou || ajoute.chance) : "état absent"}`);
    const sans = { attaques: [{ valeurBrute: 6, cibles: ["M1"] }], alterations: [] };
    window.appliquerEquipementALaCarte(sans, { idPersonnage: "BRAKAR" }, "Arme légère CAC");
    if (sans.alterations.length !== 0) trous.push(`${nomEtat} → ajouté à une carte qui ne le porte pas`);
});
verifier(`les ${etats.length} états d'arme montent la chance de la carte (augmentation max), sans undefined ni état créé`, trous.length === 0,
         trous.join(" | "));

console.log("\n2. LA PROVOCATION GARDE SON PROVOCATEUR");
{
    window.etatsEquipementPourCarte = () => [{ etat: "Provocation", chance: 30 }];
    const state = { attaques: [{ valeurBrute: 5, cibles: ["M1"] }], alterations: [{ nom: "Provocation", chance: 10, idProvocateur: "BRAKAR", cibles: ["M1"] }] };
    window.appliquerEquipementALaCarte(state, { idPersonnage: "BRAKAR" }, "Arme légère CAC");
    const provo = state.alterations.find(a => a.nom === "Provocation") || {};
    verifier("idProvocateur désigne toujours le lanceur (40 %)", provo.idProvocateur === "BRAKAR" && provo.chance === 40,
             String(provo.idProvocateur) + " " + provo.chance);
    window.etatsEquipementPourCarte = () => [{ etat: "Brûlé", chance: 30 }];
    const autre = { attaques: [{ valeurBrute: 5, cibles: ["M1"] }], alterations: [{ nom: "Brûlé", chance: 10, cibles: ["M1"] }] };
    window.appliquerEquipementALaCarte(autre, { idPersonnage: "BRAKAR" }, "Arme légère CAC");
    verifier("une brûlure, elle, n'a même pas le champ",
             !("idProvocateur" in (autre.alterations[0] || {})), JSON.stringify(autre.alterations[0]));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
