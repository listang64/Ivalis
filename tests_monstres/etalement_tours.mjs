// L'ÉTALEMENT DIVISE PAR LE NOMBRE DE TOURS — DÉGÂTS ET SOINS, JAMAIS UN ÉTAT.
//
// Nico : « Étalement des dégâts ne doit pas s'appliquer sur les effets mais
// uniquement sur les dégâts / soins / distance / zones. Et divise les dégâts
// par le nombre de tours : l'attaque fait 10 dégâts, étalée sur 2 tours, elle
// fait 5 dégâts sur chacun de ces tours. »
//
// Trois étages, chacun sur le VRAI code :
//   1. l'extraction de la carte (moteur_effets.js, dans un navigateur) dit ce
//      qui s'étale et sur combien de tours — ⏳ de la Forge compris ;
//   2. le noyau pur (moteur_pur.js) ne fait rien au lancement et range des
//      parts égales, dégâts comme soins ;
//   3. le cerveau (cerveau_combat.js) rend une part par fin de manche, et
//      l'état s'en va avec la dernière.
import fs from 'fs';
import { resoudreCarte, partsEtalees } from '../moteur_pur.js';
import { ticsDeFinDeManche, vieillirLesEtats } from '../cerveau_combat.js';
import { construireEtatCombat } from '../combat_etat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// =========================================================================
//  1. CE QUE LA CARTE DIT D'ELLE-MÊME
// =========================================================================
const SRC_MOTEUR = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');

const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
await p.route('**', r => r.request().url().startsWith('file:') ? r.continue() : r.abort());
const erreurs = []; p.on('pageerror', e => erreurs.push(e.message));
await p.goto('file:///home/user/Ivalis/index.html');
await p.waitForTimeout(300);

const extraire = (actions) => p.evaluate(async ({ actions, src }) => {
    window.PLATEAU_VTT = {
        hexSize: 30, hexToPixel: (q, r) => ({ x: q * 52, y: r * 45 }),
        getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
        getHexesInRadius: (q, r) => [{ q, r }]
    };
    const lanceur = { idPersonnage: "J1", prenom: "Cybile", camp: "Allié", statut: "Vivant", Etats_Alteres: [] };
    window.PERSOS_PARTIE = [lanceur];
    window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 } };
    window.COMBAT_PERSOS_JOUEUR = [lanceur];
    window.COMBAT_INDEX_PERSO = 0;
    window.bonusEquip = () => 0;
    window.bonusPorteeMagique = () => 0;
    // Les vraies lignes de la table Combat_Effets qui comptent ici.
    window.EFFETS_BDD_CACHE = {
        ATT:   { id: "ATT", Nom: "Attaque légère", Valeur: 2 },
        SOIN:  { id: "SOIN", Nom: "Soin", Valeur: 2 },
        BOUC:  { id: "BOUC", Nom: "Bouclier magique", Valeur: 30 },
        DIST:  { id: "DIST", Nom: "Distance", Valeur: 1 },
        ZONE:  { id: "ZONE", Nom: "Zone", Valeur: 1 },
        ETOU:  { id: "ETOU", Nom: "Étourdit", Tours: 2, Pourcent_Base: 10, Cible_Etat: "etourdi" },
        ETAL:  { id: "ETAL", Nom: "Durée étalement dégâts", Tours: 2, Valeur: 2 }
    };
    const id = "C_" + Math.random().toString(36).slice(2, 8);
    window.COMPETENCES_CACHE = { [id]: { Nom: "Banc", Fatigue: 10, Arme: "Magie", Composants: { actions } } };
    if (!window.__moteurCharge) {
        new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField', src)(
            window, {}, () => ({}), async () => {}, async () => {}, async () => {}, () => ({}));
        window.__moteurCharge = true;
    }
    const etat = await window.demarrerCiblage(id, { extraire: true, idLanceur: "J1" });
    return (etat && etat.attaques || []).map(a => ({
        nom: a.nom, etale: !!a.estEtalement, tours: a.toursEtalement || 0 }));
}, { actions, src: SRC_MOTEUR });
const lire = (attaques, nom) => attaques.find(a => a.nom === nom) || { etale: null, tours: null };

console.log("1. CE QUE LA CARTE DIT D'ELLE-MÊME (extraction réelle)");
{
    let a = await extraire([{ baseEffetId: "ATT", mods: { ETAL: 1 } }]);
    verifier("une attaque étalée : étalée sur 2 tours",
             lire(a, "Attaque légère").etale === true && lire(a, "Attaque légère").tours === 2, JSON.stringify(a));

    a = await extraire([{ baseEffetId: "ATT", mods: { ETAL: 1 }, modsDuree: { ETAL: 1 } }]);
    verifier("un cran ⏳ sur l'étalement : 3 tours", lire(a, "Attaque légère").tours === 3, JSON.stringify(a));

    a = await extraire([{ baseEffetId: "SOIN", mods: { ETAL: 1 } }]);
    verifier("un SOIN s'étale lui aussi", lire(a, "Soin").etale === true && lire(a, "Soin").tours === 2,
             JSON.stringify(a));

    a = await extraire([{ baseEffetId: "DIST", mods: { ETAL: 1 } }, { baseEffetId: "ATT", mods: {} }]);
    verifier("posé sur la Distance, il étale l'attaque de la carte", lire(a, "Attaque légère").etale === true,
             JSON.stringify(a));

    a = await extraire([{ baseEffetId: "SOIN", mods: { ETAL: 1 }, zoneHexes: [{ q: 0, r: 0 }, { q: 1, r: 0 }] }]);
    verifier("une zone de soin étalée : le soin est étalé", lire(a, "Soin").etale === true, JSON.stringify(a));

    a = await extraire([{ baseEffetId: "ETOU", mods: { ETAL: 1 } }, { baseEffetId: "ATT", mods: {} }]);
    verifier("posé sur un ÉTAT, il n'étale rien du tout", lire(a, "Attaque légère").etale === false,
             JSON.stringify(a));

    a = await extraire([{ baseEffetId: "BOUC", mods: { ETAL: 1 } }]);
    verifier("un bouclier ne s'étale jamais", lire(a, "Bouclier magique").etale === false, JSON.stringify(a));

    a = await extraire([{ baseEffetId: "ATT", mods: {} }]);
    verifier("sans étalement, rien n'est étalé", lire(a, "Attaque légère").etale === false, JSON.stringify(a));
    verifier("aucune erreur JS dans l'extraction", erreurs.length === 0, erreurs.slice(0, 2).join(" | "));
}
await b.close();

// =========================================================================
//  2 & 3. LE NOYAU ET LES FINS DE MANCHE
// =========================================================================
const fiche = (id, extra = {}) => ({
    idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const monde = () => construireEtatCombat({
    idPartie: "P1", cerveau: "P_03", graine: 7,
    combattants: [fiche("H1", { camp: "Allié", idJoueur: "P_03" }),
                  fiche("M1", { camp: "Ennemi", estMonstre: true, nom: "Goule" })],
    positions: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } },
    partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["M1", "H1"],
              File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "C1" }] }
});
const carte = (idLanceur, idCible, attaque) => ({
    type: "carte", idLanceur, idCarte: "C1",
    attaques: [{ ...attaque, cibles: [idCible] }], alterations: [],
    jets: { attaqueRatee: false, parCible: { [idCible]: { esquive: false, etats: {} } } }
});
// Une fin de manche : les tics, puis le vieillissement — dans cet ordre.
const finDeManche = (etat) => { ticsDeFinDeManche(etat); vieillirLesEtats(etat); };
const etatNomme = (c, nom) => (c.etats || []).find(e => e && e.nom === nom);

console.log("\n2. LA DIVISION");
{
    verifier("10 dégâts sur 2 tours : 5 et 5", JSON.stringify(partsEtalees(10, 2)) === "[5,5]");
    verifier("10 sur 3 tours : 4, 3 et 3 (le reste va devant)", JSON.stringify(partsEtalees(10, 3)) === "[4,3,3]",
             JSON.stringify(partsEtalees(10, 3)));
    verifier("15 sur 2 tours : 8 et 7", JSON.stringify(partsEtalees(15, 2)) === "[8,7]");
    verifier("sans nombre de tours : 2 (l'étalement d'avant)", JSON.stringify(partsEtalees(10)) === "[5,5]");
    let justes = true;
    for (let m = 0; m <= 60; m++) for (let t = 2; t <= 6; t++) {
        const parts = partsEtalees(m, t);
        if (parts.length !== t || parts.reduce((x, y) => x + y, 0) !== m
            || Math.max(...parts) - Math.min(...parts) > 1) justes = false;
    }
    verifier("toujours N parts, qui font le total, à un point près l'une de l'autre", justes);
}

console.log("\n3. DES DÉGÂTS ÉTALÉS : RIEN AU LANCEMENT, UNE PART PAR MANCHE");
{
    let etat = resoudreCarte(monde(), carte("M1", "H1", { valeurBrute: 10, estEtalement: true, toursEtalement: 2 })).etat;
    verifier("au lancement, la cible ne perd rien", etat.combattants.H1.pv === 60, String(etat.combattants.H1.pv));
    verifier("l'état Étalement porte 5 et 5",
             JSON.stringify((etatNomme(etat.combattants.H1, "Étalement") || {}).tics) === "[5,5]",
             JSON.stringify(etatNomme(etat.combattants.H1, "Étalement")));
    finDeManche(etat);
    verifier("fin de la 1re manche : -5", etat.combattants.H1.pv === 55, String(etat.combattants.H1.pv));
    finDeManche(etat);
    verifier("fin de la 2e manche : -5 encore", etat.combattants.H1.pv === 50, String(etat.combattants.H1.pv));
    verifier("et l'état s'en va avec la dernière part", !etatNomme(etat.combattants.H1, "Étalement"));
    finDeManche(etat);
    verifier("plus rien ensuite", etat.combattants.H1.pv === 50);

    etat = resoudreCarte(monde(), carte("M1", "H1", { valeurBrute: 10, estEtalement: true, toursEtalement: 3 })).etat;
    const releves = [];
    for (let i = 0; i < 3; i++) { finDeManche(etat); releves.push(etat.combattants.H1.pv); }
    verifier("sur 3 tours : 4, 3, 3", JSON.stringify(releves) === "[56,53,50]", JSON.stringify(releves));
    verifier("l'état dure bien les 3 manches, puis s'en va", !etatNomme(etat.combattants.H1, "Étalement"));

    // Un second étalement s'ajoute part à part à ce qui reste.
    etat = resoudreCarte(monde(), carte("M1", "H1", { valeurBrute: 10, estEtalement: true, toursEtalement: 2 })).etat;
    etat = resoudreCarte(etat, carte("M1", "H1", { valeurBrute: 10, estEtalement: true, toursEtalement: 3 })).etat;
    const cumul = etatNomme(etat.combattants.H1, "Étalement") || {};
    verifier("deux étalements se cumulent part à part : 9, 8, 3",
             JSON.stringify(cumul.tics) === "[9,8,3]" && cumul.duree === 3, JSON.stringify(cumul));
}

console.log("\n4. UN SOIN ÉTALÉ : LA VIE REVIENT UNE PART PAR MANCHE");
{
    const blesse = () => { const e = monde(); e.combattants.H1.pv = 30; return e; };
    let etat = resoudreCarte(blesse(), carte("H1", "H1", { valeurBrute: 10, isHeal: true, estEtalement: true,
                                                            toursEtalement: 2 })).etat;
    verifier("au lancement, rien n'est rendu", etat.combattants.H1.pv === 30, String(etat.combattants.H1.pv));
    verifier("l'état « Soin étalé » porte 5 et 5",
             JSON.stringify((etatNomme(etat.combattants.H1, "Soin étalé") || {}).tics) === "[5,5]",
             JSON.stringify(etat.combattants.H1.etats));
    const etapes = ticsDeFinDeManche(etat); vieillirLesEtats(etat);
    verifier("fin de la 1re manche : +5", etat.combattants.H1.pv === 35, String(etat.combattants.H1.pv));
    verifier("et l'écran le voit passer comme un soin",
             etapes.some(e => e.type === "soin" && e.montant === 5 && e.tic === "Soin étalé"), JSON.stringify(etapes));
    finDeManche(etat);
    verifier("fin de la 2e : +5 encore, puis l'état s'en va",
             etat.combattants.H1.pv === 40 && !etatNomme(etat.combattants.H1, "Soin étalé"),
             String(etat.combattants.H1.pv));

    const presque = monde(); presque.combattants.H1.pv = 58;
    etat = resoudreCarte(presque, carte("H1", "H1", { valeurBrute: 10, isHeal: true, estEtalement: true,
                                                      toursEtalement: 2 })).etat;
    finDeManche(etat);
    verifier("un soin étalé ne dépasse jamais la vie maximum", etat.combattants.H1.pv === 60,
             String(etat.combattants.H1.pv));

    etat = resoudreCarte(blesse(), carte("H1", "H1", { valeurBrute: 10, isHeal: true })).etat;
    verifier("un soin ordinaire, lui, rend tout d'un coup", etat.combattants.H1.pv === 40,
             String(etat.combattants.H1.pv));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
