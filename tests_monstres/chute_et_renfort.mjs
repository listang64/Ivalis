// LA CHUTE D'UNE CRÉATURE, ET LE RENFORT QUI PREND SA PLACE
//
// SIGNALÉ EN PARTIE : « tout se passait bien pendant le combat, jusqu'à ce que
// je tue un monstre. Ensuite non seulement les ennemis en attente ne sont pas
// apparus, mais en plus j'ai choisi une carte et le tour ne s'est pas lancé. »
// La trace montrait le combat répétant « la file est vide (phase Preparation) »
// toutes les cinq secondes, pour toujours.
//
// CE QUI MANQUAIT, ET POURQUOI ÇA NE SE VOYAIT PAS AVANT
// -----------------------------------------------------
// Trois choses arrivaient jadis quand une créature tombait à zéro, TOUTES dans
// `jouerAnimationMoteur` — l'ancien moteur, supprimé depuis :
//   1. son document passait à Statut « Mort » ;
//   2. un renfort de la réserve entrait à sa place ;
//   3. l'écriture de (1) réveillait le flux des documents Monstres, donc
//      `recomposerCombattants`, donc `synchroniserCombattantsHorsJeu` — le seul
//      endroit qui inscrit un tombé dans `Combattants_Hors_Jeu`.
//
// Le régime cerveau n'écrit plus un seul point de vie dans Personnages ni
// Monstres : le combat vit dans son état. Plus d'écriture, plus de
// notification, plus personne pour constater la chute. Et comme le passage
// Preparation → Résolution est tranché par `toutLeMondeAJoue`, qui attend une
// carte de CHAQUE combattant de l'ordre d'initiative sauf ceux de
// `Combattants_Hors_Jeu`, le combat attendait la carte d'un cadavre. Pour
// toujours.
//
// Le quatrième défaut ne s'est jamais vu, parce qu'aucun renfort n'entrait :
// le cerveau arrête sa liste de combattants À L'OUVERTURE du combat. Un renfort
// né plus tard aurait reçu un document, un pion et une ligne dans l'ordre
// d'initiative — et `ouvrirManche` l'aurait écarté de la file sans un mot,
// faute de le connaître. Exactement ce qui était arrivé au leurre de l'Illusion.
//
// Ce banc fait tourner le VRAI regime_cerveau.js sur un Firestore en mémoire,
// avec le VRAI `synchroniserCombattantsHorsJeu` et le VRAI `toutLeMondeAJoue`
// extraits de combat.js, tue une créature pour de bon, et regarde la suite.

import fs from 'fs';
import { accueillirCombattant, ouvrirManche } from '../cerveau_combat.js';
import { construireEtatCombat, creerDes, verifierEtatCombat } from '../combat_etat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// --------------------------------------------------------------------------
//  UN FIRESTORE EN MÉMOIRE (le même que manche_suivante.mjs)
// --------------------------------------------------------------------------
function firestore() {
    const base = new Map();
    const ecoutes = [];
    const cle = (c) => c.join("/");
    const copie = (v) => (v === null || v === undefined ? v : JSON.parse(JSON.stringify(v)));

    function documentsDe(chemin, r) {
        const p = cle(chemin) + "/";
        let l = [...base.entries()]
            .filter(([k]) => k.startsWith(p) && k.slice(p.length).indexOf("/") === -1)
            .map(([k, d]) => ({ ...d, __chemin: k.split("/") }));
        if (r && r.champ !== undefined && r.sup !== undefined) l = l.filter(d => Number(d[r.champ]) > Number(r.sup));
        if (r && r.tri) l.sort((a, b) => (a[r.tri] > b[r.tri] ? 1 : a[r.tri] < b[r.tri] ? -1 : 0));
        return copie(l);
    }

    const attente = [];
    const empiler = () => ecoutes.forEach(e => attente.push({
        e, charge: copie(e.estCollection ? documentsDe(e.chemin, e.requete) : (base.get(cle(e.chemin)) || null))
    }));

    const io = {
        async lire(chemin) { return copie(base.get(cle(chemin)) || null); },
        async lister(chemin, requete) { return documentsDe(chemin, requete); },
        async lot(operations) {
            (operations || []).forEach(o => {
                const k = cle(o.chemin);
                if (o.op === "delete") base.delete(k);
                else if (o.op === "update") base.set(k, { ...(base.get(k) || {}), ...copie(o.data) });
                else base.set(k, copie(o.data));
            });
            empiler();
        },
        async transaction(chemin, decider) {
            const k = cle(chemin);
            const aEcrire = decider(copie(base.get(k) || null));
            if (!aEcrire) return false;
            base.set(k, copie(aEcrire));
            empiler();
            return true;
        },
        ecouterDoc(chemin, rappel) {
            const e = { chemin, rappel, estCollection: false };
            ecoutes.push(e);
            attente.push({ e, charge: copie(base.get(cle(chemin)) || null) });
            return () => { const i = ecoutes.indexOf(e); if (i >= 0) ecoutes.splice(i, 1); };
        },
        ecouterCollection(chemin, requete, rappel) {
            const e = { chemin, requete, rappel, estCollection: true };
            ecoutes.push(e);
            attente.push({ e, charge: documentsDe(chemin, requete) });
            return () => { const i = ecoutes.indexOf(e); if (i >= 0) ecoutes.splice(i, 1); };
        }
    };

    async function livrer(tours = 8) {
        for (let t = 0; t < tours; t++) {
            const lot = attente.splice(0, attente.length);
            for (const { e, charge } of lot) await e.rappel(charge);
            await new Promise(r => setTimeout(r, 0));
            if (attente.length === 0) break;
        }
    }
    return { io, livrer, base };
}

// ==========================================================================
console.log("\n=========================================================");
console.log("  1. LE NOYAU PUR : FAIRE ENTRER QUELQU'UN EN COURS DE ROUTE");
console.log("=========================================================");

const fiche = (id, extra = {}) => ({
    idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100,
    Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Bouclier_Actuel: 0,
    Etats_Alteres: [], statut: "Vivant", camp: "Allié", ...extra
});

const etatDepart = () => construireEtatCombat({
    idPartie: "GAME_CHUTE", cerveau: "P_01", graine: 7,
    combattants: [
        fiche("H1", { idJoueur: "P_01", prenom: "Cybile" }),
        fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Invocateur", Personnalite: "brutal" })
    ],
    positions: { H1: { q: 0, r: 0 }, M1: { q: 2, r: 0 } },
    partie: { Phase_Combat: "Preparation", Tour_Combat: 1,
              Ordre_Initiative: ["H1", "M1"], File_Attente_Combat: [] }
});

const RENFORT = {
    id: "M2", nom: "Chien des tombes", camp: "Ennemi", estMonstre: true, estIllusion: false,
    joueur: "", race: "", couleur: "", personnalite: "brutal", palier: "Normal",
    pv: 45, pvMax: 45, bouclier: 0, bouclierMax: 0, fatigue: 100, fatigueMax: 100,
    q: 4, r: 0, etats: [], aTerre: false,
    def: { esquive: 0, parade: 0, physique: 0, magique: 0, critique: 0 },
    atouts: {}, equip: {}, mod: {}, stats: {}
};

{
    const avant = etatDepart();
    const pas = accueillirCombattant(avant, RENFORT, creerDes(avant.graine));
    verifier("un nouveau venu entre dans l'état", !!pas && !!pas.etat.combattants.M2);
    verifier("il entre AUSSI dans l'ordre d'initiative",
             !!pas && (pas.etat.ordre || []).includes("M2"),
             pas ? `(${(pas.etat.ordre || []).join(",")})` : "");
    verifier("l'état reste cohérent", !!pas && verifierEtatCombat(pas.etat).length === 0,
             pas ? verifierEtatCombat(pas.etat).join(" | ") : "");
    verifier("son arrivée est une étape de journal, rejouable par les autres postes",
             !!pas && (pas.entree.etapes || []).some(e => e.type === "arrivee"));
    verifier("l'état d'avant n'a pas bougé", !avant.combattants.M2);

    verifier("on ne fait pas entrer deux fois le même",
             accueillirCombattant(pas.etat, RENFORT, creerDes(1)) === null);
    verifier("ni quelqu'un sans case — ce serait un pion fantôme",
             accueillirCombattant(avant, { ...RENFORT, q: null, r: null }, creerDes(1)) === null);
    verifier("ni quelqu'un sur une case déjà tenue par un vivant",
             accueillirCombattant(avant, { ...RENFORT, q: 2, r: 0 }, creerDes(1)) === null);
}

// ==========================================================================
console.log("\n2. SANS CET ACCUEIL, LE RENFORT EST ÉCARTÉ DE LA MANCHE — EN SILENCE");
// C'est le défaut tel qu'il se produirait : l'IA inscrit le renfort dans la
// file, `ouvrirManche` ne le trouve pas dans ses combattants, et le retire.
{
    const file = [{ id: "H1", carte: "C_H1", initiative: 10 },
                  { id: "M2", carte: "C_M2", initiative: 40 }];

    const sansAccueil = ouvrirManche(etatDepart(), file, creerDes(7));
    verifier("l'inconnu est bel et bien écarté de la file",
             !!sansAccueil && (sansAccueil.etat.file || []).every(x => x.id !== "M2"),
             sansAccueil ? `(${(sansAccueil.etat.file || []).map(x => x.id).join(",")})` : "");

    const accueilli = accueillirCombattant(etatDepart(), RENFORT, creerDes(7));
    const avecAccueil = ouvrirManche(accueilli.etat, file, creerDes(accueilli.etat.graine));
    verifier("ACCUEILLI D'ABORD, IL JOUE SA MANCHE",
             !!avecAccueil && (avecAccueil.etat.file || []).some(x => x.id === "M2"),
             avecAccueil ? `(${(avecAccueil.etat.file || []).map(x => x.id).join(",")})` : "");
    // L'ordre de la file vient de la PRÉPARATION (c'est elle qui trie par
    // initiative) : ouvrirManche ne fait que la reprendre en écartant les
    // absents. Le renfort garde donc exactement la place qu'on lui a donnée.
    verifier("et l'ordre voulu par la préparation est respecté",
             !!avecAccueil && (avecAccueil.etat.file || []).map(x => x.id).join(",") === "H1,M2");
}

// ==========================================================================
console.log("\n3. LA LISTE DES TOMBÉS ACCEPTE CE QUE LE CERVEAU LUI DIT");
// Le vrai `synchroniserCombattantsHorsJeu`, extrait de combat.js. Le cas qui
// compte : une créature dont la fiche LOCALE paraît intacte (les documents ne
// reçoivent plus de points de vie) mais que l'état du combat déclare à terre.
const PARTIE = "GAME_CHUTE";
const partieDoc = {
    ID_Rencontre: "renc_chute", Difficulte_Rencontre: "Normale",
    Phase_Combat: "Preparation", Tour_Combat: 1,
    Ordre_Initiative: ["H1", "M1"], File_Attente_Combat: [],
    Ont_Joue_Ce_Round: [], Combattants_Hors_Jeu: []
};

// Les deux fonctions de combat.js, posées telles quelles dans ce banc.
function poser(nomsAttendus, cible) {
    const lignes = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8').split('\n');
    nomsAttendus.forEach(nom => {
        const d = lignes.findIndex(l => l.startsWith(`window.${nom} = `));
        if (d < 0) throw new Error("introuvable dans combat.js : " + nom);
        let f = d;
        for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === '};') { f = i; break; } }
        new Function('window', 'db', 'doc', lignes.slice(d, f + 1).join('\n'))(
            cible, {}, (_db, col, id) => ({ col, id }));
    });
}

console.log("\n=========================================================");

{
    const faux = {
        PERSOS_PARTIE: [],
        PARTIE_DATA: { Ordre_Initiative: ["H1", "M1"], Combattants_Hors_Jeu: [] },
        ID_PARTIE_COURANTE: PARTIE,
        pvMaxCombattant: (p) => parseInt(p.PV_Max) || 0,
        ecrites: null,
        modifierPartie: async (m) => { const s = m({}); faux.ecrites = s.maj.Combattants_Hors_Jeu; return true; }
    };
    poser(["estCombattantMort", "combattantsAttendus", "toutLeMondeAJoue", "synchroniserCombattantsHorsJeu"], faux);
    // La fiche locale montre une créature en pleine forme : c'est exactement ce
    // que voit le jeu depuis que les documents ne reçoivent plus de PV.
    faux.PERSOS_PARTIE = [{ idPersonnage: "H1", PV_Max: 60, PV_Actuels: 60, statut: "Vivant" },
                          { idPersonnage: "M1", PV_Max: 45, PV_Actuels: 45, statut: "Vivant" }];

    await faux.synchroniserCombattantsHorsJeu();
    verifier("sans rien dire au cerveau, personne n'est déclaré à terre",
             faux.ecrites === null, String(faux.ecrites));

    await faux.synchroniserCombattantsHorsJeu(["M1"]);
    verifier("LE CERVEAU LE DIT, LA LISTE L'INSCRIT",
             Array.isArray(faux.ecrites) && faux.ecrites.includes("M1"),
             `(${(faux.ecrites || []).join(",")})`);

    // Et c'est bien ce qui débloque la manche suivante.
    const avecCadavre = { Ordre_Initiative: ["H1", "M1"], Combattants_Hors_Jeu: [],
                          Ont_Joue_Ce_Round: [] };
    verifier("tant que le cadavre est attendu, la manche ne s'ouvre pas",
             faux.toutLeMondeAJoue(avecCadavre, [{ idPersonnage: "H1" }]) === false);
    verifier("UNE FOIS RAYÉ, LE CHOIX DU SEUL VIVANT SUFFIT",
             faux.toutLeMondeAJoue({ ...avecCadavre, Combattants_Hors_Jeu: ["M1"] },
                                   [{ idPersonnage: "H1" }]) === true);

    // Un identifiant qui n'est pas dans l'ordre d'initiative n'entre pas : la
    // liste ne parle que de ce combat-ci.
    faux.ecrites = null;
    await faux.synchroniserCombattantsHorsJeu(["INCONNU"]);
    verifier("un inconnu de l'ordre d'initiative n'y entre pas", faux.ecrites === null,
             String(faux.ecrites));
}

// ==========================================================================
console.log("\n=========================================================");
console.log("  4. EN VRAI : ON TUE UNE CRÉATURE, ET LE COMBAT CONTINUE");
console.log("=========================================================");
// Le VRAI regime_cerveau.js, sur le Firestore en mémoire ci-dessus. On tue une
// créature avec une vraie carte, et on regarde les trois conséquences que le
// jeu avait perdues : elle est rayée des combattants attendus, son document est
// marqué mort, et le renfort qui prend sa place joue vraiment.

const f = firestore();
const traces = [];
const morts = [];               // ce que marquerMonstreMort a reçu

const elements = { "fenetre-combat": { style: { display: "block" } } };
global.document = {
    getElementById: (id) => elements[id] || (elements[id] = { style: {}, innerHTML: "", innerText: "" }),
    addEventListener: () => {}
};
global.localStorage = { getItem: (c) => (c === "ID_JOUEUR_COURANT" ? "P_01" : null), setItem: () => {} };

const HEROS = fiche("H1", { idJoueur: "P_01", prenom: "Cybile", Regeneration: 20 });
// Une créature à dix points de vie : un seul coup suffira, et le banc reste lisible.
const CREATURE = fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Invocateur",
                               Personnalite: "brutal", PV_Max: 10, PV_Actuels: 10 });
const RENFORT_FICHE = fiche("M2", { estMonstre: true, camp: "Ennemi", nom: "Chien des tombes",
                                    Personnalite: "brutal", PV_Max: 45, PV_Actuels: 45 });

global.window = {
    REGIME_CERVEAU: true,
    ID_PARTIE_COURANTE: PARTIE,
    ioCombatFirestore: f.io,
    PARTIE_DATA: JSON.parse(JSON.stringify(partieDoc)),
    PERSOS_PARTIE: [JSON.parse(JSON.stringify(CREATURE)), JSON.parse(JSON.stringify(HEROS))],
    MONSTRES_PARTIE: [JSON.parse(JSON.stringify(CREATURE))],
    TOKENS_VTT_DATA: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } },
    ZONES_PERSISTANTES: {},
    pvMaxCombattant: (p) => parseInt(p.PV_Max) || 0,
    fatigueMaxCombattant: (p) => parseInt(p.Fatigue_Max) || 100,
    esquiveCombattant: () => 0,
    paradeCombattant: () => 0,
    defPhysiqueCombattant: () => 0,
    defMagiqueCombattant: () => 0,
    critiqueCombattant: () => 0,
    atoutRace: () => ({}),
    bonusEquip: () => 0,
    estMonHerosCombat: (id) => id === "H1",
    tracerCombat: (i, q, d) => traces.push(`${i} ${q} ${d || ""}`),
    modifierPartie: async (modifier) => {
        const sortie = modifier(JSON.parse(JSON.stringify(partieDoc)));
        if (!sortie) return null;
        if (sortie.maj) Object.assign(partieDoc, JSON.parse(JSON.stringify(sortie.maj)));
        return sortie.resultat !== undefined ? sortie.resultat : true;
    },
    // La technique de la créature, telle que l'extracteur la rendrait.
    demarrerCiblage: async () => ({ attaques: [{ valeurBrute: 4 }], alterations: [],
                                    isZone: false, zoneHexesBase: [] }),
    analyserCarteMonstre: () => ({ portee: 1, fatigue: 10 }),
    afficherPisteInitiative: () => {},
    actualiserBoutonFinTour: () => {},
    actualiserEtatCarteCombat: () => {},
    rafraichirAffichageCombat: () => {},
    redessinerPions: () => {},
    rafraichirVoileTour: () => {},

    // LA MORT D'UNE CRÉATURE, telle que monstres.js la traite : le document
    // passe à « Mort », et la réserve envoie le suivant. On reproduit ici ce
    // que fait `poserMonstreSurTerrain` — un pion, une fiche, et une ligne dans
    // l'ordre d'initiative.
    marquerMonstreMort: async (id) => {
        morts.push(id);
        const fichePartie = window.PERSOS_PARTIE.find(x => x.idPersonnage === id);
        if (fichePartie) fichePartie.statut = "Mort";
        const ficheMonstre = window.MONSTRES_PARTIE.find(x => x.idPersonnage === id);
        if (ficheMonstre) ficheMonstre.statut = "Mort";
        // Le renfort entre.
        window.PERSOS_PARTIE.push(JSON.parse(JSON.stringify(RENFORT_FICHE)));
        window.MONSTRES_PARTIE.push(JSON.parse(JSON.stringify(RENFORT_FICHE)));
        window.TOKENS_VTT_DATA.M2 = { q: 3, r: 0 };
        if (!partieDoc.Ordre_Initiative.includes("M2")) partieDoc.Ordre_Initiative.push("M2");
    }
};

// Les deux fonctions de combat.js que la chute traverse pour de vrai.
poser(["estCombattantMort", "combattantsAttendus", "toutLeMondeAJoue",
       "synchroniserCombattantsHorsJeu"], window);

await import('/home/user/Ivalis/regime_cerveau.js');

const attendre = async (limiteMs = 12000) => {
    const debut = Date.now();
    while (Date.now() - debut < limiteMs) {
        await f.livrer(4);
        const r = window.regimeDuJeu && window.regimeDuJeu();
        if (r) {
            r.ok();
            const publie = r.etatPublie();
            if (publie && r.vue() >= publie.version) {
                await f.livrer(4);
                await new Promise(x => setTimeout(x, 30));
                if (r.vue() >= r.etatPublie().version) return;
            }
        }
        await new Promise(x => setTimeout(x, 40));
    }
};

const notifier = async () => {
    window.PARTIE_DATA = JSON.parse(JSON.stringify(partieDoc));
    window.regimeSuivreLaPartie(window.PARTIE_DATA);
    await attendre();
};

// --- La manche 1 s'ouvre ----------------------------------------------------
await notifier();
partieDoc.File_Attente_Combat = [{ idPersonnage: "H1", idCarte: "C_H1", initiative: 50 },
                                 { idPersonnage: "M1", idCarte: "C_M1", initiative: 10 }];
partieDoc.Phase_Combat = "Resolution";
await notifier();

{
    const etat = window.regimeDuJeu().etatPublie();
    verifier("le combat est ouvert et c'est ce poste qui tient le cerveau",
             !!etat && window.regimeDuJeu().jeSuisLeCerveau());
    verifier("la créature est encore debout", !!etat && etat.combattants.M1.pv > 0,
             etat ? `(${etat.combattants.M1.pv} pv)` : "");
}

// --- Le héros la tue --------------------------------------------------------
await window.regimeDemande.carte("H1", {
    idCarte: "C_H1", coutFatigue: 10, alterations: [], persistanceTerrain: false, zoneHexes: [],
    attaques: [{ valeurBrute: 30, cibles: ["M1"] }]
});
await attendre();
await f.livrer(8);

{
    const etat = window.regimeDuJeu().etatPublie();
    verifier("LA CRÉATURE EST À TERRE DANS L'ÉTAT",
             !!etat && etat.combattants.M1.aTerre === true,
             etat ? `(${etat.combattants.M1.pv} pv)` : "");
    verifier("elle est marquée morte dans son document, et la réserve prévenue",
             morts.includes("M1"), `(${morts.join(",") || "personne"})`);
    verifier("la trace le dit", traces.some(t => t.includes("est terrassé")),
             traces.filter(t => t.includes("terrassé")).join(" | "));
    verifier("ELLE N'EST PLUS ATTENDUE : elle entre dans les combattants hors jeu",
             (partieDoc.Combattants_Hors_Jeu || []).includes("M1"),
             `(${(partieDoc.Combattants_Hors_Jeu || []).join(",") || "liste vide"})`);
}

// --- Fin de manche, et la suivante doit pouvoir s'ouvrir --------------------
{
    // La manche 1 se ferme : le cerveau rend la main à la préparation.
    await attendre();
    await f.livrer(8);

    verifier("la partie repasse en préparation", partieDoc.Phase_Combat === "Preparation",
             `(${partieDoc.Phase_Combat})`);

    // Le document de la partie vient de changer : dans le jeu, ce changement
    // arrive à tous les postes par un flux Firestore. Ici on le livre à la main.
    await notifier();

    // C'EST LE CŒUR DU BUG : avec le cadavre encore attendu, ce verdict restait
    // faux pour toujours et la manche 2 ne s'ouvrait jamais. Le renfort, lui,
    // est bien attendu — il vient d'entrer dans l'ordre d'initiative.
    const attendus = window.combattantsAttendus(partieDoc);
    verifier("le cadavre ne fait plus partie des combattants attendus",
             !attendus.includes("M1"), `(${attendus.join(",")})`);
    verifier("le renfort, lui, est attendu", attendus.includes("M2"), `(${attendus.join(",")})`);
    verifier("LA MANCHE PEUT S'OUVRIR dès que les vivants ont choisi",
             window.toutLeMondeAJoue({ ...partieDoc, Ont_Joue_Ce_Round: [] },
                                     [{ idPersonnage: "H1" }, { idPersonnage: "M2" }]) === true);
}

// --- Le renfort joue vraiment ----------------------------------------------
{
    partieDoc.Tour_Combat = 2;
    partieDoc.File_Attente_Combat = [{ idPersonnage: "M2", idCarte: "C_M2", initiative: 60 },
                                     { idPersonnage: "H1", idCarte: "C_H1", initiative: 50 }];
    partieDoc.Phase_Combat = "Resolution";
    await notifier();
    await f.livrer(8);

    const etat = window.regimeDuJeu().etatPublie();
    verifier("LE RENFORT EXISTE POUR LE CERVEAU", !!etat && !!etat.combattants.M2,
             etat ? `(${Object.keys(etat.combattants).join(",")})` : "");
    verifier("son arrivée est annoncée dans la trace",
             traces.some(t => t.includes("entre dans le combat")),
             traces.filter(t => t.includes("entre dans le combat")).join(" | "));
    verifier("il est entré dans l'ordre d'initiative de l'état",
             !!etat && (etat.ordre || []).includes("M2"),
             etat ? `(${(etat.ordre || []).join(",")})` : "");
    verifier("il n'a pas été écarté de la manche : il a joué son tour",
             !!etat && (etat.file || []).every(x => x.id !== "M2"),
             etat ? `(reste : ${(etat.file || []).map(x => x.id).join(",") || "rien"})` : "");
    verifier("et le cadavre n'est jamais revenu dans la file",
             !!etat && (etat.file || []).every(x => x.id !== "M1"));
    verifier("l'état reste cohérent de bout en bout",
             !!etat && verifierEtatCombat(etat).length === 0,
             etat ? verifierEtatCombat(etat).join(" | ") : "");
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
