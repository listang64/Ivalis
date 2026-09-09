// LE DÉPÔT, CONFRONTÉ À UN FIRESTORE QUI DIT NON — ÉTAPE 5a.
//
// Le cerveau décide, le dépôt écrit. Ce banc ne teste pas les décisions (c'est
// le rôle de cerveau_combat.mjs) : il teste l'ÉCRITURE, et il la teste contre
// un Firestore de banc qui applique les règles du vrai — celle des index
// composites, et celle du lot appliqué en entier ou pas du tout.
//
// Ce banc existe à cause de deux bugs réels.
//
// Le premier : une requête refusée par Firestore faute d'index composite. Plus
// aucun événement n'était livré à personne, la fenêtre sombre annonçait un tour
// qui ne se jouait jamais. Le journal du nouveau régime ne filtre donc que sur
// `v`, et les intentions ne se filtrent pas du tout — on vérifie ici qu'aucune
// requête ne réclame d'index, quoi qu'il arrive.
//
// Le second : le compteur d'événements sur le document de la partie, et son
// `failed-precondition`. Le nouveau régime n'a plus de compteur du tout, et ce
// banc vérifie qu'aucune transaction n'est demandée nulle part.
import {
    CHEMINS, COL_ETAT, COL_JOURNAL, COL_INTENTIONS, numeroEntree,
    requeteJournal, requeteIntentions, enAttente, creerDepot,
    fabriquerIntention, envoyerIntention, faireTableRase, ouvrirCombat,
    fermerCombat, ecouterCombat, lireEntree, lireDepuis
} from '../depot_firestore.js';
import { creerCerveau } from '../cerveau_combat.js';
import { construireEtatCombat, verifierEtatCombat } from '../combat_etat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

// =========================================================================
//  UN FIRESTORE DE BANC QUI SE COMPORTE COMME LE VRAI
// =========================================================================
//  Trois comportements du vrai Firestore, et ce sont les trois qui comptent :
//
//   1. IL REFUSE une requête qui filtre par égalité sur un champ et borne ou
//      trie sur un autre, tant qu'un index composite n'existe pas.
//   2. IL APPLIQUE UN LOT EN ENTIER OU PAS DU TOUT. Un lot qui rate ne laisse
//      rien derrière lui, pas même sa première opération.
//   3. IL NOTIFIE les écoutes après chaque écriture.
//
//  Tout le reste (le réseau, la latence, l'authentification) n'a pas d'intérêt
//  ici : ce qu'on veut, c'est que le dépôt reste correct face à ces trois-là.
function firestoreDeBanc() {
    const base = new Map();          // chemin -> data
    const ecoutes = [];              // { chemin, requete, rappel, estCollection }
    const requetes = [];             // toutes celles qu'on a construites
    const lots = [];                 // la trace de chaque lot commité
    let raterLeProchainLot = false;
    let transactions = 0;

    const cle = (chemin) => chemin.join("/");

    // LA RÈGLE DES INDEX, telle que Firestore l'applique.
    const exigeUnIndexComposite = (r) => {
        if (!r) return false;
        const egalites = r.egal ? [r.egal.champ] : [];
        const portees = [];
        if (r.champ) portees.push(r.champ);       // une borne (>)
        if (r.tri) portees.push(r.tri);           // un tri
        return egalites.some(e => portees.some(p => p !== e));
    };

    function documentsDe(cheminColl, requete) {
        const prefixe = cle(cheminColl) + "/";
        let liste = [...base.entries()]
            .filter(([c]) => c.startsWith(prefixe) && c.slice(prefixe.length).indexOf("/") === -1)
            .map(([c, d]) => ({ ...d, __chemin: c.split("/") }));
        if (requete && requete.champ !== undefined && requete.sup !== undefined) {
            liste = liste.filter(d => Number(d[requete.champ]) > Number(requete.sup));
        }
        if (requete && requete.egal) {
            liste = liste.filter(d => d[requete.egal.champ] === requete.egal.valeur);
        }
        if (requete && requete.tri) {
            liste.sort((a, b) => (a[requete.tri] > b[requete.tri] ? 1 : a[requete.tri] < b[requete.tri] ? -1 : 0));
        }
        if (requete && requete.limite) liste = liste.slice(0, requete.limite);
        return liste;
    }

    function prevenir() {
        ecoutes.forEach(e => {
            if (e.estCollection) e.rappel(documentsDe(e.chemin, e.requete));
            else e.rappel(base.get(cle(e.chemin)) || null);
        });
    }

    const io = {
        async lire(chemin) {
            const d = base.get(cle(chemin));
            return d ? JSON.parse(JSON.stringify(d)) : null;
        },
        async lister(chemin, requete) {
            requetes.push(requete || {});
            if (exigeUnIndexComposite(requete)) {
                const e = new Error("The query requires an index.");
                e.code = "failed-precondition";
                throw e;
            }
            return documentsDe(chemin, requete).map(d => JSON.parse(JSON.stringify(d)));
        },
        // TOUT OU RIEN. On prépare les changements à côté, et on ne les verse
        // dans la base qu'une fois le lot entier accepté.
        async lot(operations) {
            lots.push(operations.map(o => `${o.op}:${cle(o.chemin)}`));
            if (raterLeProchainLot) {
                raterLeProchainLot = false;
                const e = new Error("écriture refusée");
                e.code = "unavailable";
                throw e;
            }
            const aVerser = [];
            for (const o of operations) {
                const c = cle(o.chemin);
                if (o.op === "delete") { aVerser.push([c, null]); continue; }
                if (o.op === "update") {
                    const avant = base.get(c);
                    // Le vrai Firestore refuse un `update` sur un document
                    // absent. On fait pareil : c'est exactement ce qui arriverait
                    // si on marquait une intention qui n'a jamais existé.
                    if (!avant) throw new Error("update sur un document absent : " + c);
                    aVerser.push([c, { ...avant, ...o.data }]);
                    continue;
                }
                aVerser.push([c, JSON.parse(JSON.stringify(o.data))]);
            }
            aVerser.forEach(([c, v]) => { if (v === null) base.delete(c); else base.set(c, v); });
            prevenir();
        },
        ecouterDoc(chemin, rappel) {
            const e = { chemin, rappel, estCollection: false };
            ecoutes.push(e);
            rappel(base.get(cle(chemin)) || null);
            return () => { const i = ecoutes.indexOf(e); if (i >= 0) ecoutes.splice(i, 1); };
        },
        ecouterCollection(chemin, requete, rappel) {
            requetes.push(requete || {});
            if (exigeUnIndexComposite(requete)) {
                const err = new Error("The query requires an index.");
                err.code = "failed-precondition";
                throw err;
            }
            const e = { chemin, requete, rappel, estCollection: true };
            ecoutes.push(e);
            rappel(documentsDe(chemin, requete));
            return () => { const i = ecoutes.indexOf(e); if (i >= 0) ecoutes.splice(i, 1); };
        },
        // On l'expose pour prouver qu'il n'est JAMAIS appelé.
        async transaction() { transactions++; throw new Error("aucune transaction ne devrait être nécessaire"); }
    };

    return {
        io, base, requetes, lots,
        raterLeProchainLot: () => { raterLeProchainLot = true; },
        transactions: () => transactions,
        contenu: () => [...base.keys()].sort()
    };
}

// =========================================================================
//  LE MONDE DU BANC
// =========================================================================
const fiche = (id, extra = {}) => ({
    idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100,
    Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Bouclier_Actuel: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});

const monde = () => construireEtatCombat({
    idPartie: "GAME_TEST", cerveau: "P_03", graine: 4242,
    combattants: [
        fiche("H1", { idJoueur: "P_03", camp: "Allié", prenom: "Naomi" }),
        fiche("H2", { idJoueur: "P_01", camp: "Allié", prenom: "Pliors" }),
        fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Goule", Personnalite: "brutal" })
    ],
    positions: { H1: { q: 0, r: 0 }, H2: { q: 0, r: 2 }, M1: { q: 3, r: 0 } },
    partie: {
        Phase_Combat: "Resolution", Tour_Combat: 1,
        Ordre_Initiative: ["H1", "M1", "H2"],
        File_Attente_Combat: [
            { idPersonnage: "H1", idCarte: "C_H1" },
            { idPersonnage: "M1", idCarte: "C_M1" },
            { idPersonnage: "H2", idCarte: "C_H2" }
        ]
    }
});

const CARTES = {
    C_M1: { idCarte: "C_M1", infos: { portee: 1, fatigue: 15 },
            attaques: [{ valeurBrute: 12 }], alterations: [] }
};
const carteDe = (id, idCarte) => CARTES[idCarte] || null;

const PARTIE = "GAME_TEST";

async function banc() {
    console.log("\n=========================================================");
    console.log("  LE DÉPÔT DU CERVEAU — CE QUI S'ÉCRIT, ET COMMENT");
    console.log("=========================================================\n");

    // =====================================================================
    console.log("1. AUCUNE REQUÊTE NE RÉCLAME D'INDEX COMPOSITE");
    // =====================================================================
    //  Le bug qui coupait tout le journal. On ne le reproduira pas : on vérifie
    //  la forme des requêtes AVANT de les envoyer, et on vérifie ensuite qu'un
    //  Firestore qui applique la règle les accepte toutes.
    {
        const rj = requeteJournal(12);
        verifier("le journal borne et trie sur le même champ",
                 rj.champ === "v" && rj.tri === "v", `(champ ${rj.champ}, tri ${rj.tri})`);
        verifier("et ne filtre par égalité sur rien", rj.egal === undefined);

        const ri = requeteIntentions();
        verifier("les intentions ne filtrent rien du tout",
                 ri.egal === undefined && ri.champ === undefined, `(tri ${ri.tri})`);
        verifier("on écarte les traitées en mémoire, pas dans la requête",
                 enAttente([{ id: "a" }, { id: "b", traitee: true }]).length === 1);
    }

    // =====================================================================
    console.log("\n2. LES TROIS TIROIRS SONT NEUFS, ET SÉPARÉS DE L'ANCIEN");
    // =====================================================================
    //  Les deux régimes doivent pouvoir coexister : c'est la condition pour
    //  revenir en arrière en une ligne sans rien perdre.
    {
        verifier("l'état vit sous la partie, dans son propre tiroir",
                 CHEMINS.etat(PARTIE).join("/") === `Systeme_Parties/${PARTIE}/${COL_ETAT}/etat`);
        verifier("le journal du cerveau n'est pas celui d'avant",
                 COL_JOURNAL !== "Evenements_Combat" && COL_JOURNAL !== "Journal_Combat",
                 `(${COL_JOURNAL})`);
        verifier("une entrée porte son numéro sur six chiffres",
                 CHEMINS.entree(PARTIE, 9).join("/").endsWith("/000009"));
        verifier("donc l'ordre des noms est celui des nombres",
                 numeroEntree(9) < numeroEntree(10));
        verifier("les intentions ont leur tiroir à part",
                 CHEMINS.intentions(PARTIE).join("/").endsWith(COL_INTENTIONS));
    }

    // =====================================================================
    console.log("\n3. UN PAS = UN SEUL LOT, ET IL PORTE TOUT");
    // =====================================================================
    //  L'état, l'entrée de journal et la fermeture de l'intention partent
    //  ensemble. C'est ce qui rend impossible « le journal en avance sur
    //  l'état » et « l'intention rejouée ».
    {
        const f = firestoreDeBanc();
        await ouvrirCombat(f.io, PARTIE, monde());
        const depot = creerDepot(f.io, PARTIE);

        await envoyerIntention(f.io, PARTIE, {
            type: "mouvement", acteur: "H1", poste: "P_03",
            chemin: [{ q: 1, r: 0 }], id: "INT_1"
        });

        const avant = f.lots.length;
        const cerveau = creerCerveau(depot, { poste: "P_03", carteDe });
        const r = await cerveau.unTour();

        verifier("le pas a été publié", !!r.publie, `(v ${r.publie})`);
        const lot = f.lots[f.lots.length - 1];
        verifier("un seul lot pour tout le pas", f.lots.length === avant + 1);
        verifier("il porte l'état", lot.some(o => o.startsWith("set:") && o.includes(COL_ETAT)));
        verifier("il porte l'entrée de journal", lot.some(o => o.includes(COL_JOURNAL)));
        verifier("et il ferme l'intention dans le même souffle",
                 lot.some(o => o.startsWith("update:") && o.includes("INT_1")), lot.join(" + "));

        const etat = await f.io.lire(CHEMINS.etat(PARTIE));
        const entree = await lireEntree(f.io, PARTIE, etat.version);
        verifier("le numéro de l'entrée EST la version de l'état",
                 entree && entree.v === etat.version, `(v ${etat.version})`);
        verifier("la version a avancé d'exactement un", etat.version === 1);
    }

    // =====================================================================
    console.log("\n4. UN LOT QUI RATE NE LAISSE RIEN DERRIÈRE LUI");
    // =====================================================================
    //  Le point le plus important du fichier. Après un échec, l'état est celui
    //  d'avant, le journal n'a pas d'entrée orpheline, et l'intention est
    //  toujours en attente — donc elle sera reprise, et refera le MÊME calcul
    //  puisque la graine n'a pas avancé non plus.
    {
        const f = firestoreDeBanc();
        await ouvrirCombat(f.io, PARTIE, monde());
        const depot = creerDepot(f.io, PARTIE);
        await envoyerIntention(f.io, PARTIE, {
            type: "mouvement", acteur: "H1", poste: "P_03",
            chemin: [{ q: 1, r: 0 }], id: "INT_1"
        });

        const cerveau = creerCerveau(depot, { poste: "P_03", carteDe });
        f.raterLeProchainLot();
        let erreur = null;
        try { await cerveau.unTour(); } catch (e) { erreur = e; }

        verifier("l'écriture a bien échoué", !!erreur, erreur ? `(${erreur.code})` : "");
        const etat = await f.io.lire(CHEMINS.etat(PARTIE));
        verifier("l'état n'a pas bougé", etat.version === 0, `(version ${etat.version})`);
        const journal = await lireDepuis(f.io, PARTIE, 0);
        verifier("le journal est resté vide", journal.length === 0, `(${journal.length} entrées)`);
        const restantes = enAttente(await f.io.lister(CHEMINS.intentions(PARTIE), requeteIntentions()));
        verifier("et l'intention est toujours en attente", restantes.length === 1);

        // La reprise : le même calcul, à l'identique.
        const r = await cerveau.unTour();
        verifier("la reprise publie le pas", r.publie === 1);
        const apres = await f.io.lire(CHEMINS.etat(PARTIE));
        verifier("l'état est enfin à jour", apres.version === 1);
        const reste = enAttente(await f.io.lister(CHEMINS.intentions(PARTIE), requeteIntentions()));
        verifier("et l'intention est refermée, une seule fois", reste.length === 0);
    }

    // =====================================================================
    console.log("\n5. UNE INTENTION RENVOYÉE DEUX FOIS NE COMPTE QU'UNE FOIS");
    // =====================================================================
    //  Le doigt qui glisse, le réseau qui hoquette, l'iPad qui renvoie. Une
    //  intention est un DOCUMENT, pas un message : la renvoyer l'écrase.
    {
        const f = firestoreDeBanc();
        await ouvrirCombat(f.io, PARTIE, monde());
        const depot = creerDepot(f.io, PARTIE);
        const meme = { type: "mouvement", acteur: "H1", poste: "P_03",
                       chemin: [{ q: 1, r: 0 }], id: "INT_MEME" };
        await envoyerIntention(f.io, PARTIE, meme);
        await envoyerIntention(f.io, PARTIE, meme);
        await envoyerIntention(f.io, PARTIE, meme);

        const toutes = await f.io.lister(CHEMINS.intentions(PARTIE), requeteIntentions());
        verifier("trois envois, un seul document", toutes.length === 1, `(${toutes.length})`);

        const cerveau = creerCerveau(depot, { poste: "P_03", carteDe });
        await cerveau.tournerJusquAuCalme();
        const etat = await f.io.lire(CHEMINS.etat(PARTIE));
        const h1 = etat.combattants.H1;
        verifier("le héros n'a avancé que d'une case", h1.q === 1 && h1.r === 0, `(${h1.q},${h1.r})`);

        // Et sans identité fournie, deux envois donnent bien deux documents
        // distincts — l'écrasement est une propriété de l'IDENTITÉ, pas du
        // contenu, et il ne faut pas qu'il avale deux vrais gestes différents.
        const a = fabriquerIntention({ type: "finTour", acteur: "H1", poste: "P_03", quand: 1 });
        const b = fabriquerIntention({ type: "finTour", acteur: "H1", poste: "P_03", quand: 2 });
        verifier("deux gestes distincts gardent deux identités", a.id !== b.id);
        verifier("une intention naît non traitée", a.traitee === false && a.ts === 1);
    }

    // =====================================================================
    console.log("\n6. UN REFUS SE FERME AUSSI, ET DIT POURQUOI");
    // =====================================================================
    //  Sinon l'intention illégitime revient à chaque tour de boucle et bloque
    //  la file derrière elle. Et le poste qui l'a envoyée doit pouvoir afficher
    //  la raison au lieu de rester devant un écran muet.
    {
        const f = firestoreDeBanc();
        await ouvrirCombat(f.io, PARTIE, monde());
        const depot = creerDepot(f.io, PARTIE);
        // H2 n'est pas en tête de file : c'est le tour de H1.
        await envoyerIntention(f.io, PARTIE, {
            type: "mouvement", acteur: "H2", poste: "P_01",
            chemin: [{ q: 1, r: 2 }], id: "INT_TROP_TOT"
        });

        const cerveau = creerCerveau(depot, { poste: "P_03", carteDe });
        const r = await cerveau.unTour();
        verifier("l'intention est refusée", !!r.refus, r.refus || "");
        verifier("et la raison est utilisable telle quelle",
                 /c'est au tour de H1/.test(r.refus || ""), r.refus);

        const doc = await f.io.lire(CHEMINS.intention(PARTIE, "INT_TROP_TOT"));
        verifier("le refus est inscrit sur l'intention", doc && doc.traitee === true);
        verifier("avec sa raison", doc && /H1/.test(doc.refus || ""), doc && doc.refus);

        // Et surtout : elle ne revient pas.
        const suite = await cerveau.unTour();
        verifier("elle ne bloque plus la file", !suite.refus, JSON.stringify(suite));
    }

    // =====================================================================
    console.log("\n7. OUVRIR UN COMBAT FAIT TABLE RASE — DANS LE BON ORDRE");
    // =====================================================================
    //  Le bug du curseur resté sur le journal purgé, par l'autre bout : un
    //  poste qui verrait un état en version 0 devant un journal encore plein
    //  rejouerait la rencontre précédente par-dessus celle-ci.
    {
        const f = firestoreDeBanc();
        await ouvrirCombat(f.io, PARTIE, monde());
        const depot = creerDepot(f.io, PARTIE);
        const cerveau = creerCerveau(depot, { poste: "P_03", carteDe });
        await envoyerIntention(f.io, PARTIE, {
            type: "finTour", acteur: "H1", poste: "P_03", id: "INT_F1"
        });
        await cerveau.tournerJusquAuCalme();

        const avant = await lireDepuis(f.io, PARTIE, 0);
        verifier("le premier combat a laissé un journal", avant.length > 0, `(${avant.length} entrées)`);

        // La rencontre suivante.
        await ouvrirCombat(f.io, PARTIE, monde());
        const journal = await lireDepuis(f.io, PARTIE, 0);
        const intentions = await f.io.lister(CHEMINS.intentions(PARTIE), requeteIntentions());
        const etat = await f.io.lire(CHEMINS.etat(PARTIE));
        verifier("le journal est vide", journal.length === 0, `(${journal.length})`);
        verifier("les intentions aussi", intentions.length === 0, `(${intentions.length})`);
        verifier("et l'état neuf est en version 0", etat.version === 0);
        verifier("l'état n'est pas incohérent", verifierEtatCombat(etat).length === 0);

        await fermerCombat(f.io, PARTIE);
        const apres = await f.io.lire(CHEMINS.etat(PARTIE));
        verifier("fermer garde l'état — on doit pouvoir lire la fin", !!apres);
    }

    // =====================================================================
    console.log("\n8. UN COMBAT ENTIER, ÉCRIT POUR DE VRAI");
    // =====================================================================
    //  Le vrai cerveau, le vrai dépôt, un Firestore qui applique ses règles.
    //  On regarde ce que ça laisse en base — et surtout ce que ça N'a PAS
    //  demandé : aucune transaction, aucun index.
    {
        const f = firestoreDeBanc();
        await ouvrirCombat(f.io, PARTIE, monde());
        const depot = creerDepot(f.io, PARTIE);
        const cerveau = creerCerveau(depot, { poste: "P_03", carteDe });

        // LA FRONTIÈRE DU CERVEAU, ET ELLE EST VOULUE. En fin de manche, la
        // file se vide et la phase repasse à « Preparation » : le cerveau
        // s'arrête là et rend la main. C'est normal — ouvrir une manche, c'est
        // choisir ses cartes et lancer l'initiative, et ça appartient aux
        // joueurs, pas au moteur. Le banc joue donc le rôle du jeu : il rouvre
        // la manche comme la phase de préparation le fera.
        const rouvrirLaManche = async () => {
            const etat = await f.io.lire(CHEMINS.etat(PARTIE));
            if (!etat || etat.phase !== "Preparation") return false;
            etat.phase = "Resolution";
            etat.file = etat.ordre
                .filter(id => etat.combattants[id] && !etat.combattants[id].aTerre)
                .map(id => ({ id, carte: `C_${id}`, initiative: 0 }));
            await f.io.lot([{ op: "set", chemin: CHEMINS.etat(PARTIE), data: etat }]);
            return true;
        };

        let arrets = 0;
        for (let i = 0; i < 30; i++) {
            const etat = await f.io.lire(CHEMINS.etat(PARTIE));
            if (!etat) break;
            if (etat.phase === "Preparation") {
                arrets++;
                if (etat.manche > 4) break;
                await rouvrirLaManche();
                continue;
            }
            const tete = (etat.file || [])[0];
            if (tete && !etat.combattants[tete.id].estMonstre) {
                await envoyerIntention(f.io, PARTIE, {
                    type: "finTour", acteur: tete.id,
                    poste: etat.combattants[tete.id].joueur, id: `F_${etat.version}_${tete.id}`
                });
            }
            const faits = await cerveau.tournerJusquAuCalme();
            if (faits.length === 0 && (!tete || etat.combattants[tete.id].estMonstre)) break;
        }

        verifier("le cerveau rend la main à chaque fin de manche", arrets >= 3, `(${arrets} fois)`);

        const etat = await f.io.lire(CHEMINS.etat(PARTIE));
        const journal = await lireDepuis(f.io, PARTIE, 0);
        verifier("le combat a avancé de plusieurs manches", etat.manche >= 3, `(manche ${etat.manche})`);
        verifier("le journal raconte tout le combat", journal.length === etat.version,
                 `(${journal.length} entrées, version ${etat.version})`);
        verifier("les numéros se suivent sans trou",
                 journal.every((e, i) => e.v === i + 1), journal.map(e => e.v).join(","));
        verifier("l'état publié reste cohérent d'un bout à l'autre",
                 verifierEtatCombat(etat).length === 0, verifierEtatCombat(etat).join(" | "));

        verifier("AUCUNE transaction n'a été nécessaire", f.transactions() === 0);
        verifier("aucune requête n'a réclamé d'index", f.requetes.every(r =>
            !(r.egal && ((r.champ && r.champ !== r.egal.champ) || (r.tri && r.tri !== r.egal.champ)))));
        verifier("aucun compteur d'événements en base",
                 f.contenu().every(c => !/compteur/i.test(c)));
        verifier("et rien n'a été écrit dans le document de la partie",
                 f.contenu().every(c => c.split("/").length > 2),
                 f.contenu().filter(c => c.split("/").length <= 2).join(","));
    }

    // =====================================================================
    console.log("\n9. CE QU'UN ÉCRAN ÉCOUTE, ET CE QU'IL REÇOIT");
    // =====================================================================
    //  Deux écoutes, et deux seulement : l'état, et les entrées qui suivent son
    //  curseur. Un poste branché à partir du 2 ne doit jamais recevoir le 1.
    {
        const f = firestoreDeBanc();
        await ouvrirCombat(f.io, PARTIE, monde());
        const depot = creerDepot(f.io, PARTIE);
        const cerveau = creerCerveau(depot, { poste: "P_03", carteDe });

        await envoyerIntention(f.io, PARTIE, {
            type: "finTour", acteur: "H1", poste: "P_03", id: "F_1" });
        await cerveau.tournerJusquAuCalme();     // H1 passe, M1 joue

        const vus = [];
        let dernierEtat = null;
        const arret = ecouterCombat(f.io, PARTIE, {
            depuis: 1,
            surEtat: (e) => { dernierEtat = e; },
            surEntrees: (docs) => docs.forEach(d => { if (!vus.includes(d.v)) vus.push(d.v); })
        });

        verifier("l'état courant arrive tout de suite", !!dernierEtat, `(v ${dernierEtat && dernierEtat.version})`);
        verifier("le n°1 n'est pas livré — il est derrière le curseur", !vus.includes(1), vus.join(","));
        verifier("mais la suite l'est", vus.length > 0, vus.join(","));

        const avant = vus.length;
        await envoyerIntention(f.io, PARTIE, {
            type: "finTour", acteur: "H2", poste: "P_01", id: "F_2" });
        await cerveau.tournerJusquAuCalme();
        verifier("les nouvelles entrées arrivent à l'écoute", vus.length > avant,
                 `(${avant} → ${vus.length})`);
        verifier("et l'état suit", dernierEtat.version === Math.max(...vus));

        arret();
        const gele = dernierEtat.version;
        await envoyerIntention(f.io, PARTIE, {
            type: "finTour", acteur: "H1", poste: "P_03", id: "F_3" });
        await cerveau.tournerJusquAuCalme();
        verifier("se débrancher débranche vraiment", dernierEtat.version === gele);
    }

    // =====================================================================
    console.log("\n10. LE BATTEMENT N'ÉCRIT QUE LUI-MÊME");
    // =====================================================================
    //  Il dit aux autres postes que ce cerveau est vivant. S'il écrivait l'état
    //  entier, il entrerait en concurrence avec un pas en cours de publication
    //  — et on aurait réinventé le problème qu'on vient de supprimer.
    {
        const f = firestoreDeBanc();
        await ouvrirCombat(f.io, PARTIE, monde());
        const depot = creerDepot(f.io, PARTIE);
        const cerveau = creerCerveau(depot, { poste: "P_03", carteDe, maintenant: () => 777 });

        await cerveau.battre();
        const lot = f.lots[f.lots.length - 1];
        verifier("le battement passe par un update, pas un set",
                 lot.length === 1 && lot[0].startsWith("update:"), lot.join(","));
        const etat = await f.io.lire(CHEMINS.etat(PARTIE));
        verifier("il a bien posé l'heure", etat.battement === 777);
        verifier("et n'a touché à rien d'autre", etat.version === 0 && !!etat.combattants.H1);

        // Un poste qui n'est pas le cerveau ne bat pas.
        const autre = creerCerveau(depot, { poste: "P_01", carteDe, maintenant: () => 999 });
        await autre.battre();
        const encore = await f.io.lire(CHEMINS.etat(PARTIE));
        verifier("un poste qui n'a pas la main ne bat pas", encore.battement === 777);
    }

    console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
    process.exit(echecs === 0 ? 0 : 1);
}

banc();
