// LA DURÉE D'UN ÉTAT, DE LA FORGE JUSQU'À SA DERNIÈRE MANCHE.
//
// Nico a demandé de vérifier que les durées sont bien implantées dans le
// nouveau cerveau, « y compris durée+ ». La question est légitime : cette
// durée traverse quatre mondes avant de compter pour quelque chose.
//
//   1. LA FORGE la compose — la durée de base de l'effet (Tours, en base),
//      plus les crans du bouton ⏳ (act.baseDuree / act.modsDuree) ;
//   2. L'EXTRACTEUR l'additionne et la pose sur l'altération (moteur_effets.js) ;
//   3. LE NOYAU la lit et la range dans l'état de la cible (moteur_pur.js) ;
//   4. LA FIN DE MANCHE la décrémente, et l'état tombe à zéro (cerveau_combat.js).
//
// Un maillon cassé, et l'état dure un tour au lieu de quatre — ou pour
// toujours. C'est exactement ce qui s'était produit une fois : le noyau lisait
// `tours` quand la Forge écrit `duree`, et chaque état posé par le cerveau ne
// vivait qu'une manche. Ce banc tient la chaîne ENTIÈRE, avec le vrai
// extracteur d'un côté et le vrai cerveau de l'autre.
import fs from 'fs';
import { construireEtatCombat, clonerEtat } from '../combat_etat.js';
import { resoudreCarte } from '../moteur_pur.js';
import { vieillirLesEtats } from '../cerveau_combat.js';

const SRC_MOTEUR = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(300);

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// Le grimoire, aux valeurs RÉELLES de la base (effets_reels.json, un vrai
// instantané de Firestore) : c'est de là que viennent les « Tours » de chaque
// état, et on ne veut surtout pas les réinventer ici.
const EFFETS_REELS = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/effets_reels.json', 'utf-8'));

// Une carte forgée, telle que la Forge l'enregistre : une action, son effet de
// base, et les crans de ⏳ posés dessus.
const extraire = (carte) => p.evaluate(async ({ carte, src, effets }) => {
    window.PLATEAU_VTT = {
        hexSize: 30,
        hexToPixel: (q, r) => ({ x: q * 52, y: r * 45 }),
        getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
        getHexesInRadius: () => []
    };
    const heros = { idPersonnage: "J1", prenom: "Naomi", camp: "Allié",
                    statut: "Vivant", Etats_Alteres: [], race: "Gob" };
    window.PERSOS_PARTIE = [heros];
    window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 } };
    window.COMBAT_PERSOS_JOUEUR = [heros];
    window.COMBAT_INDEX_PERSO = 0;
    window.bonusEquip = () => 0;
    window.bonusPorteeMagique = () => 0;
    window.EFFETS_BDD_CACHE = effets;
    window.COMPETENCES_CACHE = { [carte.id]: carte.data };

    if (!window.__moteurCharge) {
        new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField', src)(
            window, {}, () => ({}), async () => {}, async () => {}, async () => {}, () => ({}));
        window.__moteurCharge = true;
    }

    const etat = await window.demarrerCiblage(carte.id, { extraire: true, idLanceur: "J1" });
    if (!etat) return null;
    return (etat.alterations || []).map(a => ({ nom: a.nom, duree: a.duree, chance: a.chance }));
}, { carte, src: SRC_MOTEUR, effets: EFFETS_REELS });

// Une carte d'une seule action : l'effet, et le nombre de crans de ⏳ dessus.
const carteAvecDuree = (idEffet, crans) => ({
    id: "C_" + idEffet + "_" + crans,
    data: { Nom: "Essai", Fatigue: 10, Arme: "Magie",
            Composants: { actions: [{ baseEffetId: idEffet, count: 1, mods: {},
                                      baseDuree: crans, modsDuree: {} }] } }
});

console.log("\n=========================================================");
console.log("  LA DURÉE D'UN ÉTAT, DE LA FORGE À SA DERNIÈRE MANCHE");
console.log("=========================================================\n");

// =========================================================================
console.log("1. LA FORGE COMPOSE LA DURÉE, ET ⏳ S'Y AJOUTE VRAIMENT");
// =========================================================================
//  Le bouton ⏳ (« Durée + ») ne se range PAS dans les mods de l'action : la
//  Forge l'écrit à part (act.baseDuree). Un extracteur qui ne lirait que les
//  mods l'ignorerait complètement — et le joueur paierait 5 PC par cran pour
//  rien.
{
    const sansCran = await extraire(carteAvecDuree("EFF_ETOURDIT", 0));
    const etourdi0 = (sansCran || []).find(a => a.nom === "Étourdi");
    verifier("sans cran, l'Étourdi dure ce que dit la base (2 tours)",
             !!etourdi0 && etourdi0.duree === EFFETS_REELS.EFF_ETOURDIT.Tours,
             etourdi0 && String(etourdi0.duree));

    const deuxCrans = await extraire(carteAvecDuree("EFF_ETOURDIT", 2));
    const etourdi2 = (deuxCrans || []).find(a => a.nom === "Étourdi");
    verifier("deux crans de ⏳ ajoutent bien deux tours",
             !!etourdi2 && etourdi2.duree === EFFETS_REELS.EFF_ETOURDIT.Tours + 2,
             etourdi2 && String(etourdi2.duree));

    // Les trois autres états prolongeables suivent la même route.
    for (const [idEffet, nom] of [["EFF_BRULE", "Brûlé"], ["EFF_GLACE", "Glacé"],
                                  ["EFF_ELECTRIFIE", "Électrifié"]]) {
        const avec = await extraire(carteAvecDuree(idEffet, 3));
        const etat = (avec || []).find(a => a.nom === nom);
        verifier(`${nom} : base ${EFFETS_REELS[idEffet].Tours} + 3 crans`,
                 !!etat && etat.duree === EFFETS_REELS[idEffet].Tours + 3,
                 etat && String(etat.duree));
    }
}

// =========================================================================
console.log("\n2. LES DURÉES FIXES RESTENT FIXES, QUOI QU'ON POSE DESSUS");
// =========================================================================
//  L'Immobilisation et l'Empoisonnement ont une durée figée par leur propre
//  mécanique : la Forge masque leur bouton ⏳, et l'extracteur les ignore
//  jusqu'au bout. Si une vieille carte en portait un, il ne doit RIEN faire.
{
    const immo = await extraire(carteAvecDuree("EFF_IMMOBILISATION", 4));
    const etat = (immo || []).find(a => a.nom === "Immobilisation");
    verifier("l'Immobilisation reste à 2 tours malgré 4 crans",
             !!etat && etat.duree === 2, etat && String(etat.duree));

    const poison = await extraire(carteAvecDuree("EFF_EMPOISONNEMENT", 4));
    const etatP = (poison || []).find(a => a.nom === "Empoisonnement");
    verifier("l'Empoisonnement aussi", !!etatP && etatP.duree === 2, etatP && String(etatP.duree));
}

// =========================================================================
console.log("\n3. LA PARALYSIE N'EXISTE PLUS NULLE PART");
// =========================================================================
{
    const parEffet = await extraire({
        id: "C_PARA", data: { Nom: "Essai", Fatigue: 10, Arme: "Magie",
            Composants: { actions: [{ baseEffetId: "EFF_PARALYSIE", count: 1, mods: {} }] } } });
    const trouvee = (parEffet || []).some(a => a.nom === "Paralysie");
    verifier("même en lui donnant l'ancien effet, rien n'est extrait", !trouvee,
             JSON.stringify(parEffet));
}

// =========================================================================
console.log("\n4. LE NOYAU POSE LA DURÉE EXTRAITE, SANS LA RABOTER");
// =========================================================================
//  Le maillon qui avait cassé : le noyau lisait `tours` là où la Forge écrit
//  `duree`, et tout durait UN tour. On repart de la durée réellement extraite
//  au chapitre 1, et on la suit jusque dans l'état de la cible.
const monde = () => construireEtatCombat({
    idPartie: "G", cerveau: "P1", graine: 7,
    combattants: [
        { idPersonnage: "H1", idJoueur: "P1", camp: "Allié", PV_Max: 60, PV_Actuels: 60,
          Fatigue_Max: 100, Esquive: 0, Parade: 0, Etats_Alteres: [], statut: "Vivant" },
        { idPersonnage: "M1", estMonstre: true, camp: "Ennemi", PV_Max: 60, PV_Actuels: 60,
          Fatigue_Max: 100, Esquive: 0, Parade: 0, Etats_Alteres: [], statut: "Vivant" }
    ],
    positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } },
    partie: { Phase_Combat: "Resolution", Ordre_Initiative: ["H1", "M1"],
              File_Attente_Combat: [{ idPersonnage: "H1" }, { idPersonnage: "M1" }] }
});

const poser = (etat, nom, duree) => resoudreCarte(etat, {
    type: "carte", idLanceur: "H1", idCarte: "C1", attaques: [],
    alterations: [{ nom, duree, chance: 100, cibles: ["M1"] }],
    jets: { parCible: { M1: { esquive: false, etats: { [nom]: true } } } }
});

{
    const quatre = await extraire(carteAvecDuree("EFF_ETOURDIT", 2));
    const dureeForgee = quatre.find(a => a.nom === "Étourdi").duree;

    const r = poser(monde(), "Étourdi", dureeForgee);
    const pose = r.etat.combattants.M1.etats.find(e => e.nom === "Étourdi");
    verifier("l'état est posé avec la durée que la Forge a calculée",
             !!pose && pose.duree === dureeForgee, pose && String(pose.duree));

    // Et la même carte relancée dessus ne cumule pas : elle garde la plus
    // longue des deux durées.
    const encore = poser(r.etat, "Étourdi", 1);
    const apres = encore.etat.combattants.M1.etats.filter(e => e.nom === "Étourdi");
    verifier("relancée plus courte, elle ne raccourcit rien",
             apres.length === 1 && apres[0].duree === dureeForgee,
             JSON.stringify(apres.map(e => e.duree)));
}

// =========================================================================
console.log("\n5. ET LA FIN DE MANCHE LA DÉCOMPTE, JUSQU'AU DERNIER TOUR");
// =========================================================================
//  Le décompte vivait dans l'ancien finDeTourCombat, que le régime du cerveau
//  ne traverse plus : un Étourdi posé au premier tour durait TOUT le combat.
//  Ici, on fait vieillir manche après manche et on compte.
{
    let etat = poser(monde(), "Étourdi", 4).etat;
    const vivantApres = [];
    for (let manche = 1; manche <= 5; manche++) {
        etat = clonerEtat(etat);
        vieillirLesEtats(etat);
        vivantApres.push(etat.combattants.M1.etats.some(e => e.nom === "Étourdi"));
    }
    verifier("un état de 4 tours survit à trois fins de manche",
             vivantApres[0] && vivantApres[1] && vivantApres[2],
             JSON.stringify(vivantApres));
    verifier("et disparaît à la quatrième", vivantApres[3] === false, JSON.stringify(vivantApres));
    verifier("il ne revient pas tout seul ensuite", vivantApres[4] === false);

    // Un état d'un seul tour s'éteint à la toute première fin de manche.
    let court = poser(monde(), "Glacé", 1).etat;
    court = clonerEtat(court);
    vieillirLesEtats(court);
    verifier("un état d'un tour ne passe pas la première manche",
             !court.combattants.M1.etats.some(e => e.nom === "Glacé"));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 2).join(" | "));

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
