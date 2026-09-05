// PERSISTANCE DE TERRAIN SUR UN SOIN (zone verte).
// Jusqu'ici, une zone persistante ne pouvait naître que d'une carte de dégâts :
// creerZonePersistante excluait explicitement les attaques isHeal, et
// resoudreZonesPersistantesSurCase ne savait qu'infliger des dégâts ou poser un
// état, jamais soigner. Ce banc charge le VRAI moteur_effets.js et vérifie la
// chaîne complète sur une carte de soin : la zone se crée bien (verte), soigne
// qui marche dessus (sans dépasser les PV max), et l'anime correctement.
import fs from 'fs';

const src = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

function poste() {
    const w = {};
    const ecritures = [];
    const db = {}, doc = (_db, col, id) => ({ id, col });
    const updateDoc = async (ref, data) => { ecritures.push({ ref, data }); };
    const setDoc = async () => {};

    w.ID_PARTIE_COURANTE = "P1";
    w.PERSOS_PARTIE = [];
    w.TOKENS_VTT_DATA = {};
    w.ZONES_PERSISTANTES = {};
    w.refCombattant = (id) => ({ id });
    w.esquiveCombattant = () => 0;   // dés pipés à 0 : jamais esquivé/paré
    w.paradeCombattant = () => 0;
    w.defPhysiqueCombattant = () => 0;
    w.defMagiqueCombattant = () => 0;
    w.estImmunise = () => false;
    const messages = [];
    w.afficherMessageFlottantHex = (q, r, texte, couleur) => messages.push({ q, r, texte, couleur });
    const flashs = [];
    w.afficherFlashDegatToken = (idCible, oldV, newV, maxV, texte, couleur, couleurBarre) =>
        flashs.push({ idCible, oldV, newV, maxV, texte, couleur, couleurBarre });

    const vraiHasard = Math.random;
    Math.random = () => 0.5; // 50 -> jamais esquivé face à statDef 0, jamais un dé d'état extrême

    new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', src)(w, db, doc, updateDoc, setDoc);
    // moteur_effets.js définit lui-même afficherFlashDegatToken (DOM réel) : on
    // réimpose notre espion maintenant que le vrai code a fini de se charger.
    w.afficherFlashDegatToken = (idCible, oldV, newV, maxV, texte, couleur, couleurBarre) =>
        flashs.push({ idCible, oldV, newV, maxV, texte, couleur, couleurBarre });
    return { w, ecritures, messages, flashs, rendreLeHasard: () => { Math.random = vraiHasard; } };
}

const carteDeSoin = (valeur, cible = "J1") => ({
    attaques: [{ isHeal: true, isShield: false, valeurBrute: valeur, cibles: [cible] }],
    alterations: [],
    isZone: false,
    zoneHexesFinaux: null
});

console.log("1. LA ZONE SE CRÉE À PARTIR D'UN SOIN");
{
    const p = poste();
    p.w.TOKENS_VTT_DATA = { J1: { q: 2, r: 3 } };
    await p.w.creerZonePersistante(carteDeSoin(20), "J2");
    const zones = Object.values(p.w.ZONES_PERSISTANTES);
    p.rendreLeHasard();

    verifier("une zone est bien créée (avant : les soins étaient exclus)", zones.length === 1);
    const z = zones[0];
    verifier("elle est de type « soin » (verte)", !!z && z.type === "soin");
    verifier("elle porte le montant de soin de la carte", !!z && z.soin && z.soin.valeurBrute === 20);
    verifier("elle ne porte aucun dégât", !!z && z.degats === null);
    verifier("elle couvre la case visée", !!z && z.hexes.length === 1 && z.hexes[0].q === 2 && z.hexes[0].r === 3);
    verifier("durée fixe de 3 tours, comme toute zone persistante", !!z && z.dureeRestante === 3);
}

console.log("\n2. UNE CARTE SANS DÉGÂTS NI SOIN NI ÉTAT NE LAISSE RIEN");
{
    const p = poste();
    p.w.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 } };
    const carteVide = { attaques: [{ isHeal: false, isShield: true, valeurBrute: 15, cibles: ["J1"] }],
                         alterations: [], isZone: false, zoneHexesFinaux: null };
    await p.w.creerZonePersistante(carteVide, "J2");
    p.rendreLeHasard();
    verifier("un bouclier seul ne crée pas de zone fantôme", Object.keys(p.w.ZONES_PERSISTANTES).length === 0);
}

console.log("\n3. LA ZONE SOIGNE QUICONQUE Y MARCHE, SANS DÉPASSER LES PV MAX");
{
    const p = poste();
    p.w.TOKENS_VTT_DATA = { J1: { q: 5, r: 5 } };
    await p.w.creerZonePersistante(carteDeSoin(20), "J2");
    p.w.PERSOS_PARTIE = [{ idPersonnage: "J1", PV_Max: 50, Dev_Mod_PV: 0, PV_Actuels: 35, statut: "Vivant" }];

    const res = await p.w.resoudreZonesPersistantesSurCase("J1", { q: 5, r: 5 });
    p.rendreLeHasard();

    verifier("un résultat de soin est renvoyé", !!res && res.length === 1);
    verifier("le soin est plafonné aux PV manquants (15), pas les 20 de la carte",
             res[0].soin === 15, `(${res[0] && res[0].soin})`);
    verifier("aucun dégât n'est infligé par une zone de soin", res[0].degats === 0);
    verifier("les PV du personnage montent bien à leur maximum",
             p.w.PERSOS_PARTIE[0].PV_Actuels === 50, `(${p.w.PERSOS_PARTIE[0].PV_Actuels})`);
    verifier("la base est mise à jour avec les nouveaux PV",
             p.ecritures.some(e => e.data && e.data.PV_Actuels === 50));
}

console.log("\n4. UNE CIBLE DÉJÀ AU MAXIMUM NE SOIGNE PAS EN TROP");
{
    const p = poste();
    p.w.TOKENS_VTT_DATA = { J1: { q: 1, r: 1 } };
    await p.w.creerZonePersistante(carteDeSoin(20), "J2");
    p.w.PERSOS_PARTIE = [{ idPersonnage: "J1", PV_Max: 50, Dev_Mod_PV: 0, PV_Actuels: 50, statut: "Vivant" }];

    const nbEcrituresAvant = p.ecritures.length;
    const res = await p.w.resoudreZonesPersistantesSurCase("J1", { q: 1, r: 1 });
    p.rendreLeHasard();

    verifier("aucun soin appliqué à PV déjà pleins", res[0].soin === 0);
    verifier("aucune écriture PV inutile en base", p.ecritures.length === nbEcrituresAvant);
}

console.log("\n5. L'ANIMATION : MESSAGE VERT PUIS FLASH DE SOIN");
{
    const p = poste();
    p.w.TOKENS_VTT_DATA = { J1: { q: 4, r: 4 } };
    p.w.PERSOS_PARTIE = [{ idPersonnage: "J1", PV_Max: 50, Dev_Mod_PV: 0, PV_Actuels: 50, statut: "Vivant" }];
    const res = { idCible: "J1", type: "soin", dodged: false, motDef: "", degats: 0, soin: 12, viaBouclier: false, etatApplique: null };

    await p.w.jouerAnimationZonePersistante(res, { q: 4, r: 4 });
    p.rendreLeHasard();

    verifier("le message d'ambiance est la zone bienfaisante, en vert",
             p.messages.some(m => m.texte === "✨ Zone bienfaisante !" && m.couleur === "#4caf50"));
    verifier("un flash de soin « +12 ✚ » s'affiche",
             p.flashs.some(f => f.texte === "+12 ✚" && f.idCible === "J1"));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} ÉCHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
