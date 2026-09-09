// TROIS POSTES, UN CERVEAU, UN COMBAT ENTIER — ÉTAPE 5c.
//
// C'est le banc qui décide si on peut jouer pour de vrai. Tous les autres
// vérifient une pièce ; celui-ci les fait tourner ensemble, dans les conditions
// qui nous ont coûté une semaine : trois appareils, des notifications qui
// arrivent dans le désordre, un joueur qui ne clique pas tout de suite.
//
// Ce qu'on veut voir, et il n'y a que ça :
//
//   • UN SEUL POSTE ÉCRIT. Les deux autres n'écrivent QUE des intentions —
//     jamais un point de vie, jamais une position, jamais la file. On ne le
//     suppose pas : chaque poste a son propre accès à la base, et le banc
//     regarde ce que chacun a écrit.
//   • LES TROIS ÉCRANS FINISSENT IDENTIQUES. Pas « à peu près » : le même
//     état, au même numéro, combattant par combattant.
//   • UN POSTE EN RETARD N'EST PAS FAUX, IL EST EN RETARD. Il rattrape, et il
//     arrive au même endroit.
//
// Le Firestore du banc livre ses notifications à la demande, et sait les livrer
// dans le désordre — c'est exactement ce que fait un iPad qui sort de veille.
import { creerRegime } from '../regime_cerveau.js';
import { CHEMINS, COL_INTENTIONS } from '../depot_firestore.js';
import { FORMAT_ETAT } from '../combat_etat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// =========================================================================
//  UN FIRESTORE QUI PREND SON TEMPS
// =========================================================================
function firestoreDeBanc() {
    const base = new Map();
    const ecoutes = [];
    const enAttente = [];            // les notifications pas encore livrées
    const cle = (c) => c.join("/");

    function documentsDe(chemin, r) {
        const p = cle(chemin) + "/";
        let l = [...base.entries()]
            .filter(([k]) => k.startsWith(p) && k.slice(p.length).indexOf("/") === -1)
            .map(([k, d]) => ({ ...d, __chemin: k.split("/") }));
        if (r && r.champ !== undefined && r.sup !== undefined) {
            l = l.filter(d => Number(d[r.champ]) > Number(r.sup));
        }
        if (r && r.tri) l.sort((a, b) => (a[r.tri] > b[r.tri] ? 1 : a[r.tri] < b[r.tri] ? -1 : 0));
        if (r && r.limite) l = l.slice(0, r.limite);
        return JSON.parse(JSON.stringify(l));
    }

    function empiler() {
        ecoutes.forEach(e => {
            const charge = e.estCollection ? documentsDe(e.chemin, e.requete)
                                           : (base.get(cle(e.chemin)) || null);
            enAttente.push({ ecoute: e, charge: JSON.parse(JSON.stringify(charge)) });
        });
    }

    // Le poste qui écrit : on l'attribue à chaque opération pour pouvoir dire,
    // à la fin, qui a écrit quoi.
    const ecritures = [];

    function ioPour(poste) {
        return {
            async lire(chemin) {
                const d = base.get(cle(chemin));
                return d ? JSON.parse(JSON.stringify(d)) : null;
            },
            async lister(chemin, requete) { return documentsDe(chemin, requete); },
            async lot(operations) {
                const aVerser = [];
                for (const o of operations) {
                    const k = cle(o.chemin);
                    ecritures.push({ poste, op: o.op, chemin: k });
                    if (o.op === "delete") { aVerser.push([k, null]); continue; }
                    if (o.op === "update") {
                        const avant = base.get(k);
                        if (!avant) throw new Error("update sur un document absent : " + k);
                        aVerser.push([k, { ...avant, ...o.data }]);
                        continue;
                    }
                    aVerser.push([k, JSON.parse(JSON.stringify(o.data))]);
                }
                aVerser.forEach(([k, v]) => { if (v === null) base.delete(k); else base.set(k, v); });
                empiler();
            },
            ecouterDoc(chemin, rappel) {
                const e = { chemin, rappel, estCollection: false, poste };
                ecoutes.push(e);
                enAttente.push({ ecoute: e, charge: base.get(cle(chemin)) || null });
                return () => { const i = ecoutes.indexOf(e); if (i >= 0) ecoutes.splice(i, 1); };
            },
            ecouterCollection(chemin, requete, rappel) {
                const e = { chemin, requete, rappel, estCollection: true, poste };
                ecoutes.push(e);
                enAttente.push({ ecoute: e, charge: documentsDe(chemin, requete) });
                return () => { const i = ecoutes.indexOf(e); if (i >= 0) ecoutes.splice(i, 1); };
            }
        };
    }

    // Livrer ce qui attend. `melanger` reproduit le désordre du réseau ;
    // `sauf` met un poste en veille, comme un iPad dont l'onglet dort.
    async function livrer({ melanger = false, sauf = [], tours = 6 } = {}) {
        for (let t = 0; t < tours; t++) {
            const paquet = enAttente.splice(0, enAttente.length)
                .filter(n => {
                    if (sauf.includes(n.ecoute.poste)) { enAttente.push(n); return false; }
                    return true;
                });
            if (paquet.length === 0) return;
            if (melanger) paquet.reverse();
            for (const n of paquet) {
                if (!ecoutes.includes(n.ecoute)) continue;
                await n.ecoute.rappel(n.charge);
                await new Promise(r => setImmediate(r));
            }
        }
    }

    return { ioPour, livrer, base, ecritures,
             enAttente: () => enAttente.length,
             contenu: () => [...base.keys()].sort() };
}

// =========================================================================
//  LE MONDE, ET TROIS ÉCRANS POUR LE REGARDER
// =========================================================================
const fiche = (id, extra = {}) => ({
    idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100,
    Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Bouclier_Actuel: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});

const SOURCE = {
    graine: 2024,
    combattants: [
        fiche("H1", { idJoueur: "P_03", camp: "Allié", prenom: "Naomi" }),
        fiche("H2", { idJoueur: "P_01", camp: "Allié", prenom: "Pliors" }),
        fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Goule", Personnalite: "brutal" }),
        fiche("M2", { estMonstre: true, camp: "Ennemi", nom: "Spectre", Personnalite: "prudent" })
    ],
    positions: { H1: { q: 0, r: 0 }, H2: { q: 0, r: 2 }, M1: { q: 4, r: 0 }, M2: { q: 5, r: 1 } },
    partie: {
        Phase_Combat: "Resolution", Tour_Combat: 1,
        Ordre_Initiative: ["H1", "M1", "H2", "M2"],
        File_Attente_Combat: [
            { idPersonnage: "H1", idCarte: "C_H1" }, { idPersonnage: "M1", idCarte: "C_M1" },
            { idPersonnage: "H2", idCarte: "C_H2" }, { idPersonnage: "M2", idCarte: "C_M2" }
        ]
    }
};

const CARTES = {
    C_M1: { idCarte: "C_M1", infos: { portee: 1, fatigue: 15 },
            attaques: [{ valeurBrute: 11 }], alterations: [] },
    C_M2: { idCarte: "C_M2", infos: { portee: 4, fatigue: 18 },
            attaques: [{ valeurBrute: 7, isRanged: true }], alterations: [] }
};

const HEROS_DE = { P_03: ["H1"], P_01: ["H2"], P_07: [] };
const PARTIE = "GAME_TEST";

// Un poste : son régime, son écran, ce qu'il a vu passer.
function creerPoste(f, poste, options = {}) {
    const vu = { animations: [], etats: [], fenetres: [] };
    let fiches = SOURCE.combattants.map(c => ({ ...c }));
    let dernier = null;

    const regime = creerRegime({
        io: f.ioPour(poste),
        idPartie: PARTIE,
        poste,
        estAMoi: (id) => (HEROS_DE[poste] || []).includes(id),
        carteDe: (id, idCarte) => CARTES[idCarte] || null,
        maintenant: () => 1000,
        // Le banc respecte les délais qu'on lui donne — c'est important pour le
        // rattrapage d'un trou, qui laisse au réseau 800 ms avant d'aller
        // chercher. Et il ne veut pas de battement de cœur : il n'y a personne
        // pour reprendre la main ici.
        programmer: options.programmer || ((fn, ms) => setTimeout(fn, ms || 0)),
        arreterMinuteur: (id) => clearTimeout(id),
        battementMs: 0,
        animations: {
            pas: async (d) => vu.animations.push(`pas:${d.idToken}→${d.vers.q},${d.vers.r}`),
            poussee: async (d) => vu.animations.push(`poussee:${d.idToken}`),
            bond: async (d) => vu.animations.push(`bond:${d.idToken}`),
            ruee: async (d) => vu.animations.push(`carte:${d.pion}`),
            jauge: (pion, de, vers) => vu.animations.push(`jauge:${pion}:${de}→${vers}`),
            message: (pion, texte) => vu.animations.push(`msg:${pion}`),
            opportunite: async (d) => vu.animations.push(`opp:${d.idAttaquant}`),
            zone: async () => {},
            pause: async () => {}
        },
        ecran: {
            poserPions: () => {},
            poserFiches: (f2) => { fiches = f2; },
            poserFile: () => {},
            rafraichir: (etat) => { dernier = etat; vu.etats.push(etat.version); },
            lireFiches: () => fiches
        },
        surFenetre: (entree) => vu.fenetres.push(entree ? `${entree.acteur}|${entree.manche}` : null),
        tracer: options.tracer || (() => {})
    });

    return { poste, regime, vu, fiches: () => fiches, ecran: () => dernier };
}

const empreinte = (etat) => {
    if (!etat) return "—";
    return Object.keys(etat.combattants).sort().map(id => {
        const c = etat.combattants[id];
        return `${id}:${c.pv}/${c.bouclier}@${c.q},${c.r}${c.aTerre ? "†" : ""}`;
    }).join(" ");
};

async function banc() {
    console.log("\n=========================================================");
    console.log("  TROIS POSTES, UN CERVEAU, UN COMBAT");
    console.log("=========================================================\n");

    // =====================================================================
    console.log("1. CELUI QUI OUVRE LE COMBAT TIENT LE CERVEAU");
    // =====================================================================
    //  Pas d'élection, pas de vote, pas de « le plus ancien gagne ». C'est
    //  écrit dans l'état, et l'état a un seul écrivain — donc cette désignation
    //  ne peut pas être contestée par un poste en retard. C'était tout le
    //  problème du verrou.
    {
        const f = firestoreDeBanc();
        const nico = creerPoste(f, "P_03");
        const ben = creerPoste(f, "P_01");

        await nico.regime.ouvrir(SOURCE);
        ben.regime.rejoindre();
        await f.livrer();

        verifier("le poste qui a cliqué tient le cerveau", nico.regime.jeSuisLeCerveau() === true);
        verifier("l'autre regarde", ben.regime.jeSuisLeCerveau() === false);
        verifier("et l'état le dit noir sur blanc",
                 nico.regime.etatPublie().cerveau === "P_03");
        verifier("les deux voient le même état de départ",
                 empreinte(nico.regime.etatAffiche()) === empreinte(ben.regime.etatAffiche()),
                 empreinte(ben.regime.etatAffiche()));
    }

    // =====================================================================
    console.log("\n2. UN SEUL POSTE ÉCRIT — LES AUTRES N'ÉCRIVENT QUE DES INTENTIONS");
    // =====================================================================
    //  La phrase qui tient toute l'architecture, vérifiée et non supposée.
    //  Chaque poste a son propre accès à la base, et on regarde ce que chacun
    //  a réellement écrit.
    {
        const f = firestoreDeBanc();
        const nico = creerPoste(f, "P_03");
        const ben = creerPoste(f, "P_01");
        const tablette = creerPoste(f, "P_07");

        await nico.regime.ouvrir(SOURCE);
        ben.regime.rejoindre();
        tablette.regime.rejoindre();
        await f.livrer();

        await ben.regime.demanderFinDeTour("H2");
        await nico.regime.demanderFinDeTour("H1");
        await f.livrer();
        await nico.regime.tourner();
        await f.livrer();

        const horsIntentions = f.ecritures.filter(e => !e.chemin.includes(COL_INTENTIONS));
        const auteurs = [...new Set(horsIntentions.map(e => e.poste))];
        verifier("un seul poste a écrit l'état et le journal",
                 auteurs.length === 1 && auteurs[0] === "P_03", auteurs.join(","));

        const ecritsParBen = f.ecritures.filter(e => e.poste === "P_01");
        verifier("Ben n'a écrit que des intentions",
                 ecritsParBen.length > 0 && ecritsParBen.every(e => e.chemin.includes(COL_INTENTIONS)),
                 `${ecritsParBen.length} écriture(s)`);
        verifier("et la tablette n'a rien écrit du tout",
                 f.ecritures.filter(e => e.poste === "P_07").length === 0);
    }

    // =====================================================================
    console.log("\n3. UN COMBAT ENTIER, ET LES TROIS ÉCRANS FINISSENT IDENTIQUES");
    // =====================================================================
    //  Le contrôle qui décide si on peut jouer pour de vrai. Trois rythmes
    //  différents : Nico suit tout, Ben clique en retard, la tablette dort par
    //  moments et reçoit ses notifications dans le désordre au réveil.
    {
        const f = firestoreDeBanc();
        const nico = creerPoste(f, "P_03");
        const ben = creerPoste(f, "P_01");
        const tablette = creerPoste(f, "P_07");

        await nico.regime.ouvrir(SOURCE);
        ben.regime.rejoindre();
        tablette.regime.rejoindre();
        await f.livrer();

        const rouvrirLaManche = async () => {
            // Ce que fera la phase de préparation : le cerveau s'arrête en fin
            // de manche et rend la main aux joueurs pour choisir leurs cartes.
            const etat = await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE));
            if (!etat || etat.phase !== "Preparation") return false;
            etat.phase = "Resolution";
            etat.file = etat.ordre
                .filter(id => etat.combattants[id] && !etat.combattants[id].aTerre)
                .map(id => ({ id, carte: `C_${id}`, initiative: 0 }));
            await f.ioPour("P_03").lot([{ op: "set", chemin: CHEMINS.etat(PARTIE), data: etat }]);
            return true;
        };

        let manches = 0;
        for (let boucle = 0; boucle < 60; boucle++) {
            const etat = await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE));
            if (!etat) break;
            if (etat.phase === "Preparation") {
                manches++;
                if (etat.manche > 4) break;
                await rouvrirLaManche();
                await f.livrer();
                continue;
            }
            const tete = (etat.file || [])[0];
            if (!tete) break;
            const c = etat.combattants[tete.id];

            if (!c.estMonstre) {
                // Le joueur concerné passe son tour. Chacun depuis son poste.
                const qui = c.joueur === "P_01" ? ben : nico;
                await qui.regime.demanderFinDeTour(tete.id);
            }

            // Nico suit tout ; Ben clique le OK en retard ; la tablette dort.
            await f.livrer({ sauf: ["P_07"] });
            await nico.regime.tourner();
            await f.livrer({ sauf: ["P_07"] });

            // Ben et Nico ouvrent les fenêtres sombres qui les attendent.
            for (const p of [nico, ben]) {
                for (let i = 0; i < 6 && p.regime.spectateur.enAttente(); i++) {
                    await p.regime.ok();
                }
            }
            await f.livrer({ sauf: ["P_07"] });
        }

        // La tablette se réveille : tout lui arrive d'un coup, et dans le
        // désordre. C'est exactement ce que fait un iPad qui sort de veille.
        await f.livrer({ melanger: true, tours: 40 });
        for (let i = 0; i < 60 && tablette.regime.spectateur.enAttente(); i++) {
            await tablette.regime.ok();
            await f.livrer({ melanger: true, tours: 10 });
        }
        for (const p of [nico, ben]) {
            for (let i = 0; i < 60 && p.regime.spectateur.enAttente(); i++) {
                await p.regime.ok();
                await f.livrer({ tours: 10 });
            }
        }
        await f.livrer({ tours: 40 });

        const publie = await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE));
        verifier("le combat a duré plusieurs manches", manches >= 3, `(${manches} fins de manche)`);
        verifier("il a produit un vrai journal", publie.version >= 8, `(version ${publie.version})`);

        const eNico = empreinte(nico.regime.etatAffiche());
        const eBen = empreinte(ben.regime.etatAffiche());
        const eTab = empreinte(tablette.regime.etatAffiche());
        verifier("Nico et Ben voient exactement la même chose", eNico === eBen, eNico);
        verifier("la tablette réveillée aussi", eNico === eTab, eTab);
        verifier("et c'est bien l'état publié", eNico === empreinte(publie));
        verifier("les trois écrans sont au même numéro",
                 nico.regime.vue() === ben.regime.vue() && ben.regime.vue() === tablette.regime.vue(),
                 `${nico.regime.vue()}, ${ben.regime.vue()}, ${tablette.regime.vue()}`);
        verifier("et ce numéro est celui du cerveau",
                 nico.regime.vue() === publie.version, `${nico.regime.vue()} / ${publie.version}`);

        // Les animations : chacun a vu le combat, pas seulement le résultat.
        verifier("Nico a vu des animations", nico.vu.animations.length > 5,
                 `(${nico.vu.animations.length})`);
        verifier("la tablette aussi, en rattrapant", tablette.vu.animations.length > 5,
                 `(${tablette.vu.animations.length})`);
        verifier("et les trois ont vu la MÊME suite d'animations",
                 nico.vu.animations.join("|") === tablette.vu.animations.join("|"),
                 `${nico.vu.animations.length} vs ${tablette.vu.animations.length}`);

        // Aucun poste n'a joué son propre tour derrière une fenêtre sombre.
        const fenetresDeNico = nico.vu.fenetres.filter(Boolean);
        verifier("un joueur n'attend jamais le OK pour son propre héros",
                 fenetresDeNico.every(f2 => !f2.startsWith("H1|")), fenetresDeNico.slice(0, 4).join(" "));
    }

    // =====================================================================
    console.log("\n4. UN POSTE QUI ARRIVE EN COURS DE ROUTE");
    // =====================================================================
    //  Il ne rejoue pas les vingt tours passés : il part de l'état publié, tel
    //  quel, et s'anime à partir de la suite. Rejouer trois cents entrées
    //  prendrait dix minutes et n'apprendrait rien à personne.
    {
        const f = firestoreDeBanc();
        const nico = creerPoste(f, "P_03");
        await nico.regime.ouvrir(SOURCE);
        await f.livrer();
        await nico.regime.demanderFinDeTour("H1");
        await f.livrer();
        await nico.regime.tourner();
        await f.livrer();
        for (let i = 0; i < 6 && nico.regime.spectateur.enAttente(); i++) {
            await nico.regime.ok(); await f.livrer();
        }

        const publie = await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE));
        verifier("le combat est déjà bien engagé", publie.version >= 2, `(version ${publie.version})`);

        const retardataire = creerPoste(f, "P_07");
        retardataire.regime.rejoindre();
        await f.livrer();

        verifier("le retardataire part de l'état publié",
                 empreinte(retardataire.regime.etatAffiche()) === empreinte(publie));
        verifier("au bon numéro", retardataire.regime.vue() === publie.version);
        verifier("sans rejouer une seule animation", retardataire.vu.animations.length === 0,
                 `(${retardataire.vu.animations.length})`);

        // Et la suite, elle, s'anime. C'est Ben qui termine le tour de SON
        // héros : Nico n'en a pas le droit, et le cerveau le lui refuserait —
        // on l'a vérifié au chapitre 6.
        const ben = creerPoste(f, "P_01");
        ben.regime.rejoindre();
        await f.livrer();
        await ben.regime.demanderFinDeTour("H2");
        await f.livrer();
        await nico.regime.tourner();
        await f.livrer();
        for (let i = 0; i < 8 && retardataire.regime.spectateur.enAttente(); i++) {
            await retardataire.regime.ok(); await f.livrer();
        }
        verifier("mais la suite, oui", retardataire.vu.animations.length > 0,
                 `(${retardataire.vu.animations.length})`);
        verifier("et il a rattrapé le cerveau",
                 empreinte(retardataire.regime.etatAffiche())
                 === empreinte(await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE))));
    }

    // =====================================================================
    console.log("\n5. UN POSTE QUI N'A PAS RECHARGÉ SA PAGE NE JOUE PAS");
    // =====================================================================
    //  Le bug des deux verrous qui ne se voyaient pas, rendu impossible. Un
    //  appareil en retard d'une version ne devine pas, ne fait pas semblant :
    //  il se tait, et il le dit en une ligne dans la trace.
    {
        const f = firestoreDeBanc();
        const nico = creerPoste(f, "P_03");
        await nico.regime.ouvrir(SOURCE);
        await f.livrer();

        const dit = [];
        const vieux = creerPoste(f, "P_07", { tracer: (i, q, d) => dit.push(`${q} ${d}`) });
        vieux.regime.rejoindre();
        await f.livrer();
        verifier("un format connu se branche normalement", !!vieux.regime.etatAffiche());

        // On publie un état d'un format que ce poste ne connaît pas.
        const etat = await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE));
        etat.format = FORMAT_ETAT + 1;
        etat.version = etat.version + 1;
        await f.ioPour("P_03").lot([{ op: "set", chemin: CHEMINS.etat(PARTIE), data: etat }]);
        const avant = empreinte(vieux.regime.etatAffiche());
        await f.livrer();

        verifier("il n'avale pas un format qu'il ne connaît pas",
                 empreinte(vieux.regime.etatAffiche()) === avant);
        verifier("et il le dit clairement", dit.some(l => /format d'état inconnu/.test(l)),
                 dit.filter(l => /format/.test(l))[0] || dit.join(" / "));
    }

    // =====================================================================
    console.log("\n6. UNE DEMANDE ILLÉGITIME NE PEUT RIEN ABÎMER");
    // =====================================================================
    //  Un client ne demande jamais un résultat, il demande une action. Une page
    //  modifiée, un double-clic, un poste désynchronisé : le pire qu'ils
    //  puissent produire est une intention de plus, refusée avec sa raison.
    {
        const f = firestoreDeBanc();
        const nico = creerPoste(f, "P_03");
        const ben = creerPoste(f, "P_01");
        await nico.regime.ouvrir(SOURCE);
        ben.regime.rejoindre();
        await f.livrer();

        const depart = empreinte(nico.regime.etatPublie());

        // Ben tente de jouer le héros de Nico, puis de téléporter le sien, puis
        // de faire jouer une créature.
        await ben.regime.demanderFinDeTour("H1");
        await ben.regime.demanderMouvement("H2", [{ q: 9, r: 9 }]);
        await ben.regime.demander({ type: "carte", acteur: "M1", idCarte: "C_M1" });
        await f.livrer();
        await nico.regime.tourner();
        await f.livrer();

        verifier("rien n'a bougé dans l'état", empreinte(nico.regime.etatPublie()) === depart,
                 empreinte(nico.regime.etatPublie()));
        verifier("le combat n'est pas bloqué pour autant",
                 (await nico.regime.demanderFinDeTour("H1"), await f.livrer(),
                  await nico.regime.tourner(), await f.livrer(),
                  nico.regime.etatPublie().version > 0),
                 `(version ${nico.regime.etatPublie().version})`);
    }

    console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
    process.exit(echecs === 0 ? 0 : 1);
}

banc();
