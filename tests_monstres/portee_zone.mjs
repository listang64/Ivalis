// LA DISTANCE D'UNE ZONE, LUE SUR LA VRAIE CARTE.
//
// Nico a forgé une zone de soins avec une distance ; en combat, la zone restait
// collée à lui. La cause est une incohérence entre la Forge et le moteur : la
// Forge reconnaît DEUX sources de distance (voir actionHasDistance,
// competences.js) — « Distance » posée comme MOD sur une action, ou « Distance »
// choisie comme EFFET DE BASE d'une action à part entière — et le moteur n'en
// lisait qu'une.
//
// Une carte dont la portée vient d'une action « Distance » repartait donc avec
// une portée de 1. Et une zone à portée 1 se pose sur le lanceur.
//
// Ce banc fait tourner le VRAI extracteur (demarrerCiblage en mode extraction)
// sur les deux formes de carte, et vérifie qu'elles donnent la même portée.
import fs from 'fs';

// Le moteur est un module qui importe Firebase par le réseau ; la page du banc
// n'a pas de réseau. On l'injecte donc comme le font les autres bancs : sans ses
// imports, et avec un Firestore inerte. C'est le VRAI fichier, ligne pour ligne.
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
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(60)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// Le décor minimal dont l'extracteur a besoin. Tout le reste vient du vrai
// moteur_effets.js, chargé par la page.
const extraire = (carte) => p.evaluate(async ({ carte, src }) => {
    const dist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r),
                                    Math.abs((-a.q - a.r) - (-b.q - b.r)));
    window.PLATEAU_VTT = {
        hexSize: 30,
        hexToPixel: (q, r) => ({ x: q * 52, y: r * 45 }),
        getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
        getHexesInRadius: (q, r, rayon) => {
            const out = [];
            for (let dq = -rayon; dq <= rayon; dq++)
                for (let dr = -rayon; dr <= rayon; dr++)
                    if (dist({ q, r }, { q: q + dq, r: r + dr }) <= rayon) out.push({ q: q + dq, r: r + dr });
            return out;
        }
    };

    const soigneur = { idPersonnage: "J1", prenom: "Cybile", camp: "Allié",
                       statut: "Vivant", Etats_Alteres: [], race: "Gob" };
    window.PERSOS_PARTIE = [soigneur];
    window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 } };
    window.COMBAT_PERSOS_JOUEUR = [soigneur];
    window.COMBAT_INDEX_PERSO = 0;

    // Les règles que l'extracteur appelle et qui vivent ailleurs.
    window.bonusEquip = () => 0;
    window.bonusPorteeMagique = () => 0;

    // Le grimoire : un soin, et l'effet « Distance » qui vaut une case par cran.
    window.EFFETS_BDD_CACHE = {
        SOIN: { id: "SOIN", Nom: "Soin", Valeur: 12 },
        DIST: { id: "DIST", Nom: "Distance", Valeur: 1 }
    };
    window.COMPETENCES_CACHE = { [carte.id]: carte.data };

    if (!window.__moteurCharge) {
        new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField', src)(
            window, {}, () => ({}), async () => {}, async () => {}, async () => {}, () => ({}));
        window.__moteurCharge = true;
    }

    const etat = await window.demarrerCiblage(carte.id, { extraire: true, idLanceur: "J1" });
    if (!etat) return null;
    const config = (etat.attaques || [])[0] || (etat.alterations || [])[0] || null;
    return {
        isZone: etat.isZone,
        cases: (etat.zoneHexesBase || []).length,
        centreImpose: !!etat.zoneCenterHex,
        isRanged: config ? !!config.isRanged : false,
        rangeMax: config ? config.rangeMax : null,
        estSoin: config ? !!config.isHeal : false
    };
}, { carte, src: SRC_MOTEUR });

const ZONE = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }];

console.log("\n=========================================================");
console.log("  LA DISTANCE D'UNE ZONE DE SOINS");
console.log("=========================================================\n");

// =========================================================================
console.log("1. LA DISTANCE POSÉE COMME MOD — ce qui marchait déjà");
// =========================================================================
{
    const r = await extraire({ id: "C_MOD", data: {
        Nom: "Pluie bienfaisante", Fatigue: 20, Arme: "Magie",
        Composants: { actions: [
            { baseEffetId: "SOIN", mods: { DIST: 2 }, zoneHexes: ZONE }
        ] }
    }});
    verifier("la carte est bien une zone", r && r.isZone === true);
    verifier("de trois cases", r && r.cases === 3, r && String(r.cases));
    verifier("c'est bien un soin", r && r.estSoin === true);
    verifier("elle est à distance", r && r.isRanged === true);
    verifier("et sa portée vaut 1 + 2 crans", r && r.rangeMax === 3, r && String(r.rangeMax));
    verifier("le centre n'est donc PAS imposé au lanceur", r && r.centreImpose === false);
}

// =========================================================================
console.log("\n2. LA DISTANCE COMME ACTION À PART — ce qui était ignoré");
// =========================================================================
//  C'est la seconde façon de construire la carte, et la Forge la connaît
//  parfaitement : actionHasDistance regarde d'abord `act.baseEffet.Nom`. Le
//  moteur, lui, ne lisait que les mods — la zone repartait à portée 1, donc
//  collée au lanceur.
{
    const r = await extraire({ id: "C_ACTION", data: {
        Nom: "Pluie bienfaisante", Fatigue: 20, Arme: "Magie",
        Composants: { actions: [
            { baseEffetId: "DIST", count: 2, mods: {}, zoneHexes: ZONE },
            { baseEffetId: "SOIN", mods: {} }
        ] }
    }});
    verifier("la carte est bien une zone", r && r.isZone === true);
    verifier("c'est bien un soin", r && r.estSoin === true);
    verifier("elle est à distance", r && r.isRanged === true);
    verifier("et sa portée vaut autant que par un mod", r && r.rangeMax === 3,
             r && String(r.rangeMax));
    verifier("le centre n'est pas imposé au lanceur", r && r.centreImpose === false);
}

// =========================================================================
console.log("\n3. SANS AUCUNE DISTANCE, LA ZONE RESTE SUR LE LANCEUR");
// =========================================================================
//  Le comportement d'avant doit tenir : une zone de mêlée se pose sur soi, et
//  c'est la règle. On corrige une distance ignorée, on n'en invente pas une.
{
    const r = await extraire({ id: "C_MELEE", data: {
        Nom: "Souffle vital", Fatigue: 15, Arme: "Magie",
        Composants: { actions: [{ baseEffetId: "SOIN", mods: {}, zoneHexes: ZONE }] }
    }});
    verifier("la zone existe", r && r.isZone === true);
    verifier("elle n'est pas à distance", r && r.isRanged === false);
    verifier("sa portée vaut une case", r && r.rangeMax === 1, r && String(r.rangeMax));
    verifier("et son centre est imposé au lanceur", r && r.centreImpose === true);
}

// =========================================================================
console.log("\n4. DEUX SOURCES SUR LA MÊME ACTION : LA PLUS LONGUE GAGNE");
// =========================================================================
//  Écraser l'une par l'autre ferait dépendre la portée de l'ordre de lecture.
{
    const r = await extraire({ id: "C_DEUX", data: {
        Nom: "Longue pluie", Fatigue: 25, Arme: "Magie",
        Composants: { actions: [
            { baseEffetId: "DIST", count: 1, mods: { DIST: 4 }, zoneHexes: ZONE },
            { baseEffetId: "SOIN", mods: {} }
        ] }
    }});
    verifier("la plus longue portée l'emporte", r && r.rangeMax === 5, r && String(r.rangeMax));
}

// =========================================================================
console.log("\n5. LA DISTANCE EST SUR UNE AUTRE ACTION QUE LA ZONE");
// =========================================================================
//  Le cas de Nico : « un soin à distance 3 avec persistance terrain, mais en
//  combat je ne peux poser la zone qu'au corps-à-corps ». La Distance vit sur
//  l'action de soin ; la zone, elle, est dessinée par une AUTRE action — celle
//  qui pose la persistance. L'extraction ne regardait que l'action porteuse de
//  la zone, et n'y trouvait aucune portée.
//
//  La CARTE, elle, se lit en entier : afficherApercuCarteHD détache la zone du
//  lanceur dès qu'un effet « Distance » apparaît n'importe où dedans. C'est ce
//  que le joueur voit sur sa carte, donc c'est ce que le combat doit faire.
{
    const r = await extraire({ id: "C_AUTRE_ACTION", data: {
        Nom: "Bénédiction du sol", Fatigue: 30, Arme: "Magie",
        Composants: { actions: [
            { baseEffetId: "SOIN", mods: { DIST: 2 } },          // la distance est ici…
            { baseEffetId: "SOIN", mods: {}, zoneHexes: ZONE }   // …et la zone là.
        ] }
    }});
    verifier("la carte est bien une zone", r && r.isZone === true);
    verifier("LA ZONE PREND LA DISTANCE DE LA CARTE", r && r.isRanged === true);
    verifier("et sa portée est celle qu'on lit sur la carte", r && r.rangeMax === 3,
             r && String(r.rangeMax));
    verifier("le centre n'est donc pas imposé au lanceur", r && r.centreImpose === false);
}

// =========================================================================
console.log("\n6. UNE CARTE SANS ZONE N'EST PAS TOUCHÉE");
// =========================================================================
//  La portée d'une zone ne doit pas déteindre sur un soin à cible unique.
{
    const r = await extraire({ id: "C_CIBLE", data: {
        Nom: "Main guérisseuse", Fatigue: 10, Arme: "Magie",
        Composants: { actions: [{ baseEffetId: "SOIN", mods: { DIST: 1 } }] }
    }});
    verifier("ce n'est pas une zone", r && r.isZone === false);
    verifier("et sa portée reste celle de son mod", r && r.rangeMax === 2, r && String(r.rangeMax));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 2).join(" | "));

await b.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
