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
            // LA RÉCLAMATION D'OUVERTURE. Elle est atomique dans le vrai
            // Firestore ; ici on la rend atomique en la faisant tourner d'un
            // seul tenant, sans await entre la lecture et l'écriture.
            async transaction(chemin, decider) {
                const k = cle(chemin);
                ecritures.push({ poste, op: "transaction", chemin: k });
                const actuel = base.get(k) || null;
                const aEcrire = decider(actuel ? JSON.parse(JSON.stringify(actuel)) : null);
                if (!aEcrire) return false;
                base.set(k, JSON.parse(JSON.stringify(aEcrire)));
                empiler();
                return true;
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
    combat: "renc_banc_1",
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

// La même rencontre, mais c'est une créature qui ouvre la manche. C'est le cas
// courant en jeu — l'initiative ne trie pas les camps — et c'est le seul où le
// cerveau publie AVANT qu'un joueur ait cliqué quoi que ce soit. Sans ça, les
// deux chapitres qui suivent ne verraient jamais une seule entrée arriver.
const SOURCE_CREATURE_DABORD = {
    ...SOURCE,
    partie: {
        ...SOURCE.partie,
        File_Attente_Combat: [
            { idPersonnage: "M1", idCarte: "C_M1" }, { idPersonnage: "H1", idCarte: "C_H1" },
            { idPersonnage: "M2", idCarte: "C_M2" }, { idPersonnage: "H2", idCarte: "C_H2" }
        ]
    }
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
        // Une montre par poste, et le banc peut l'avancer : c'est ce qui permet
        // de faire vieillir un silence sans attendre trente secondes pour de vrai.
        maintenant: options.maintenant || (() => 1000),
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

const lireDepuisBanc = async (f, partie) =>
    await f.ioPour("banc").lister(CHEMINS.journal(partie), { champ: "v", sup: 0, tri: "v" });

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

        // LA RÉOUVERTURE D'UNE MANCHE PASSE PAR LE CERVEAU, comme tout le
        // reste. La phase de préparation (l'ancien monde, inchangé) prépare la
        // file dans le document de la partie ; le cerveau la fait entrer dans
        // l'état par un PAS, avec son entrée de journal. Sans ça, l'état
        // changerait sans que personne ne puisse le raconter, et les écrans en
        // retard rateraient exactement le début d'une manche.
        const rouvrirLaManche = async () => {
            const etat = await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE));
            if (!etat || etat.phase !== "Preparation") return false;
            const file = etat.ordre
                .filter(id => etat.combattants[id] && !etat.combattants[id].aTerre)
                .map(id => ({ id, carte: `C_${id}`, initiative: 0 }));
            await nico.regime.ouvrirLaManche(file);
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

    // =====================================================================
    console.log("\n7. UNE MANCHE S'OUVRE — ET ÇA SE RACONTE COMME LE RESTE");
    // =====================================================================
    //  La frontière du cerveau : il s'arrête en fin de manche et rend la main
    //  aux joueurs, qui choisissent leurs cartes dans l'ancien monde. Quand la
    //  file est prête, c'est le cerveau qui la fait entrer dans l'état — par un
    //  PAS, avec son entrée de journal. Sans ça, l'état changerait sans que
    //  personne ne puisse le raconter, et un écran en retard raterait
    //  précisément le début d'une manche.
    {
        const f = firestoreDeBanc();
        const nico = creerPoste(f, "P_03");
        const ben = creerPoste(f, "P_01");
        await nico.regime.ouvrir(SOURCE);
        ben.regime.rejoindre();
        await f.livrer();

        // On vide la file jusqu'à la fin de la manche.
        for (let i = 0; i < 12; i++) {
            const etat = await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE));
            if (!etat || etat.phase !== "Resolution") break;
            const tete = (etat.file || [])[0];
            if (!tete) break;
            const c = etat.combattants[tete.id];
            if (!c.estMonstre) {
                await (c.joueur === "P_01" ? ben : nico).regime.demanderFinDeTour(tete.id);
            }
            await f.livrer();
            await nico.regime.tourner();
            await f.livrer();
        }

        const finDeManche = await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE));
        verifier("en fin de manche, le cerveau rend la main",
                 finDeManche.phase === "Preparation" && finDeManche.file.length === 0,
                 `(phase ${finDeManche.phase}, file ${finDeManche.file.length})`);
        verifier("et la manche a bien avancé", finDeManche.manche === 2, `(manche ${finDeManche.manche})`);

        const avant = finDeManche.version;

        // Un poste qui n'a pas la main n'ouvre rien, même s'il essaie.
        await ben.regime.ouvrirLaManche([{ id: "H2", carte: "C_H2" }]);
        await f.livrer();
        verifier("un poste qui regarde n'ouvre pas la manche",
                 (await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE))).version === avant);

        // Le cerveau, lui, l'ouvre — et ça produit une entrée de journal.
        const v = await nico.regime.ouvrirLaManche([
            { id: "H1", carte: "C_H1" }, { id: "M1", carte: "C_M1" },
            { id: "H2", carte: "C_H2" }, { id: "M2", carte: "C_M2" }
        ]);
        await f.livrer();
        const ouverte = await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE));
        verifier("le cerveau ouvre la manche", ouverte.phase === "Resolution");
        verifier("et ça a produit une entrée de journal", v === avant + 1, `(n°${v})`);
        verifier("la file est celle qu'on lui a donnée",
                 ouverte.file.map(x => x.id).join(",") === "H1,M1,H2,M2",
                 ouverte.file.map(x => x.id).join(","));

        // Et l'écran de Ben le voit, sans rien faire de plus.
        for (let i = 0; i < 6 && ben.regime.spectateur.enAttente(); i++) {
            await ben.regime.ok(); await f.livrer();
        }
        await f.livrer();
        verifier("l'écran qui regarde voit la manche s'ouvrir",
                 (ben.regime.etatAffiche().file || []).length === 4,
                 `(${(ben.regime.etatAffiche().file || []).length} en file)`);

        // UN COMBATTANT À TERRE NE REVIENT PAS DANS LA FILE. C'est « nos héros
        // rayés de la file » par le bon bout : on les écarte pour une raison
        // lisible, au lieu de les perdre au petit bonheur.
        const aTerre = await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE));
        aTerre.combattants.H2.aTerre = true;
        aTerre.combattants.H2.pv = 0;
        aTerre.phase = "Preparation";
        aTerre.file = [];
        await f.ioPour("P_03").lot([{ op: "set", chemin: CHEMINS.etat(PARTIE), data: aTerre }]);
        await f.livrer();
        await nico.regime.ouvrirLaManche([
            { id: "H1", carte: "C_H1" }, { id: "H2", carte: "C_H2" }, { id: "M1", carte: "C_M1" }
        ]);
        await f.livrer();
        const apres = await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE));
        verifier("un combattant à terre n'entre pas dans la nouvelle manche",
                 !apres.file.some(x => x.id === "H2"), apres.file.map(x => x.id).join(","));
        verifier("mais les autres, si",
                 apres.file.map(x => x.id).join(",") === "H1,M1", apres.file.map(x => x.id).join(","));
    }

        // =====================================================================
    console.log("\n8. TROIS POSTES OUVRENT EN MÊME TEMPS — UN SEUL GAGNE");
    // =====================================================================
    //  Le bug qui a figé le deuxième écran, et il était de conception. Chaque
    //  poste voyait la phase passer en résolution et ouvrait de son côté : le
    //  dernier faisait table rase du journal des autres, et un poste dont le
    //  curseur était déjà à 2 attendait pour toujours une entrée n°3 qui
    //  n'existait plus.
    //
    //  L'ouverture est maintenant une RÉCLAMATION atomique. Pas de vote, pas
    //  d'horodatage, pas de comparaison d'horloges : un compare-et-pose, et la
    //  base tranche.
    {
        const f = firestoreDeBanc();
        const nico = creerPoste(f, "P_03");
        const ben = creerPoste(f, "P_01");
        const tablette = creerPoste(f, "P_07");

        // Les trois ouvrent la MÊME rencontre, au même instant.
        const resultats = await Promise.all([
            nico.regime.ouvrir(SOURCE),
            ben.regime.ouvrir(SOURCE),
            tablette.regime.ouvrir(SOURCE)
        ]);
        await f.livrer();

        const gagnants = resultats.filter(Boolean).length;
        verifier("exactement un poste ouvre le combat", gagnants === 1, `(${gagnants})`);

        const cerveaux = [nico, ben, tablette].filter(p => p.regime.jeSuisLeCerveau());
        verifier("et un seul tient le cerveau", cerveaux.length === 1,
                 cerveaux.map(p => p.poste).join(","));

        const perdants = [nico, ben, tablette].filter(p => !p.regime.jeSuisLeCerveau());
        verifier("les perdants savent que quelqu'un d'autre a ouvert",
                 perdants.every(p => p.regime.ouvertureAilleurs()),
                 perdants.map(p => `${p.poste}:${p.regime.ouvertureAilleurs()}`).join(" "));
        verifier("mais ils sont branchés et voient l'état",
                 perdants.every(p => !!p.regime.etatAffiche()));
        verifier("et les trois regardent le même combat",
                 new Set([nico, ben, tablette].map(p => p.regime.etatAffiche().combat)).size === 1);

        // Et un second appel sur la MÊME rencontre ne rouvre rien.
        const encore = await nico.regime.ouvrir(SOURCE);
        await f.livrer();
        verifier("réouvrir la même rencontre ne fait rien", encore === null);

        // Une rencontre DIFFÉRENTE, elle, s'ouvre : c'est un nouveau combat.
        const suite = await nico.regime.ouvrir({ ...SOURCE, combat: "renc_banc_2" });
        await f.livrer();
        verifier("une nouvelle rencontre s'ouvre normalement", !!suite,
                 suite ? suite.combat : "—");
    }

    // =====================================================================
    console.log("\n9. LE JOURNAL D'UNE AUTRE RENCONTRE EST INOFFENSIF");
    // =====================================================================
    //  L'autre moitié du même bug. Un écran dont le curseur est resté sur le
    //  combat précédent ne doit pas guetter un numéro qui ne viendra jamais :
    //  chaque entrée porte l'identité de SA rencontre, et ce qui vient
    //  d'ailleurs est écarté à la porte, sans être attendu.
    {
        const f = firestoreDeBanc();
        const nico = creerPoste(f, "P_03");
        const ben = creerPoste(f, "P_01");
        await nico.regime.ouvrir(SOURCE);
        ben.regime.rejoindre();
        await f.livrer();

        await nico.regime.demanderFinDeTour("H1");
        await f.livrer();
        await nico.regime.tourner();
        await f.livrer();
        for (let i = 0; i < 6 && ben.regime.spectateur.enAttente(); i++) {
            await ben.regime.ok(); await f.livrer();
        }
        const vueAvant = ben.regime.vue();
        verifier("Ben suit la première rencontre", vueAvant > 0, `(vue ${vueAvant})`);

        // On lui glisse une entrée d'une AUTRE rencontre, avec un numéro
        // parfaitement plausible.
        const intrus = { v: vueAvant + 1, combat: "renc_dautrefois", acteur: "M1",
                         manche: 1, etapes: [{ type: "degats", cible: "H1", pvApres: 1 }] };
        ben.regime.spectateur.recevoir([intrus]);
        await ben.regime.spectateur.lire();
        verifier("l'entrée d'une autre rencontre n'est pas rejouée",
                 ben.regime.vue() === vueAvant, `(vue ${ben.regime.vue()})`);
        verifier("et le héros n'a pas encaissé",
                 ben.regime.etatAffiche().combattants.H1.pv > 1,
                 `(${ben.regime.etatAffiche().combattants.H1.pv} PV)`);
        verifier("elle n'est pas non plus mise en attente",
                 ben.regime.spectateur.enFile() === 0, `(${ben.regime.spectateur.enFile()})`);

        // Et la vraie suite, elle, se joue.
        await ben.regime.demanderFinDeTour("H2");
        await f.livrer();
        await nico.regime.tourner();
        await f.livrer();
        for (let i = 0; i < 8 && ben.regime.spectateur.enAttente(); i++) {
            await ben.regime.ok(); await f.livrer();
        }
        verifier("la vraie suite, elle, avance", ben.regime.vue() > vueAvant,
                 `(${vueAvant} → ${ben.regime.vue()})`);
    }

    // =====================================================================
    console.log("\n10. L'ÉTAT D'UNE RENCONTRE PÉRIMÉE N'EMPÊCHE PAS LA SUIVANTE");
    // =====================================================================
    //  Le bug qui a coûté l'essai suivant, et il tenait à une seule question
    //  mal posée. On demandait « y a-t-il un état publié ? » pour décider s'il
    //  fallait ouvrir. Or l'état de la rencontre PRÉCÉDENTE survivait à la
    //  réinitialisation : la réponse était oui, personne n'ouvrait, et le
    //  plateau ne démarrait pas — sans une ligne dans la trace pour le dire.
    //
    //  La bonne question est « cet état parle-t-il de CETTE rencontre ? ».
    {
        const f = firestoreDeBanc();
        const nico = creerPoste(f, "P_03");
        await nico.regime.ouvrir(SOURCE);
        await f.livrer();
        await nico.regime.demanderFinDeTour("H1");
        await f.livrer();
        await nico.regime.tourner();
        await f.livrer();

        const ancien = await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE));
        verifier("la première rencontre a laissé un état", !!ancien && ancien.version > 0,
                 `(version ${ancien.version}, combat ${ancien.combat})`);

        // La rencontre suivante, avec sa propre identité. L'ancien état est
        // encore là : il ne doit rien empêcher.
        const suivante = { ...SOURCE, combat: "renc_banc_SUIVANTE" };
        const ouvert = await nico.regime.ouvrir(suivante);
        await f.livrer();
        verifier("la rencontre suivante s'ouvre malgré l'état périmé", !!ouvert);
        const neuf = await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE));
        verifier("et l'état publié est celui de la NOUVELLE rencontre",
                 neuf.combat === "renc_banc_SUIVANTE", neuf.combat);
        verifier("reparti de la version 0", neuf.version === 0, `(${neuf.version})`);

        // Et l'écran ne rejoue pas le journal de la rencontre d'avant.
        verifier("le journal de la rencontre d'avant a été balayé",
                 (await lireDepuisBanc(f, PARTIE)).every(e => e.combat === "renc_banc_SUIVANTE"),
                 "");
    }

    // =====================================================================
    console.log("\n11. FERMER UN COMBAT NE LAISSE RIEN DERRIÈRE");
    // =====================================================================
    //  Une réinitialisation doit rendre la place nette : ni journal, ni
    //  intentions, ni état. Tant que l'état traînait, la rencontre suivante ne
    //  démarrait pas.
    {
        const f = firestoreDeBanc();
        const nico = creerPoste(f, "P_03");
        await nico.regime.ouvrir(SOURCE);
        await f.livrer();
        await nico.regime.demanderFinDeTour("H1");
        await f.livrer();
        await nico.regime.tourner();
        await f.livrer();

        verifier("le combat a bien laissé des traces en base",
                 !!(await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE))));

        await nico.regime.fermer();
        verifier("l'état a disparu",
                 (await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE))) === null);
        verifier("le journal aussi", (await lireDepuisBanc(f, PARTIE)).length === 0);
        verifier("et les intentions",
                 (await f.ioPour("P_03").lister(CHEMINS.intentions(PARTIE), { tri: "ts" })).length === 0);

        // Et la rencontre suivante repart de zéro, proprement.
        const apres = creerPoste(f, "P_01");
        const ouvert = await apres.regime.ouvrir({ ...SOURCE, combat: "renc_apres_menage" });
        await f.livrer();
        verifier("la rencontre suivante s'ouvre sur une place nette", !!ouvert);
        verifier("et c'est le poste qui a ouvert qui tient le cerveau",
                 apres.regime.jeSuisLeCerveau() === true);
    }

    // =====================================================================
    console.log("\n12. ON DÉPLACE LES PIONS, ON N'EN INVENTE PAS");
    // =====================================================================
    //  La projection créait l'entrée manquante avec seulement q et r. Le
    //  plateau la redessinait aussitôt, sans image ni nom : une volée de
    //  « GET .../undefined 404 » et des pions fantômes sur la carte. Un
    //  combattant que le plateau ne connaît pas encore n'est pas à nous de le
    //  créer.
    {
        const { pionsDepuisEtat } = await import('../pont_combat.js');
        const f = firestoreDeBanc();
        const nico = creerPoste(f, "P_03");
        await nico.regime.ouvrir(SOURCE);
        await f.livrer();

        const etat = nico.regime.etatAffiche();
        const pions = pionsDepuisEtat(etat);
        verifier("chaque combattant sur le plateau a sa case",
                 Object.keys(pions).length === Object.keys(etat.combattants).length);

        // La table du jeu, telle qu'elle est vraiment : des pions complets.
        const table = { H1: { q: 9, r: 9, image: "h1.png" } };
        const poser = (p2) => {
            if (!table) return;
            Object.keys(p2).forEach(id => {
                const t = table[id];
                if (!t) return;
                if (p2[id].q === null || p2[id].r === null) return;
                t.q = p2[id].q; t.r = p2[id].r;
            });
        };
        poser(pions);
        verifier("le pion connu est déplacé", table.H1.q === 0 && table.H1.r === 0,
                 `(${table.H1.q},${table.H1.r})`);
        verifier("et il garde tout ce qu'il avait", table.H1.image === "h1.png");
        verifier("aucun pion n'est inventé", Object.keys(table).length === 1,
                 Object.keys(table).join(","));
    }

    // =====================================================================
    console.log("\n13. CELUI QUI PERD LA RÉCLAMATION NE PERD PAS SA PLACE");
    // =====================================================================
    //  Le bug qui a figé un écran, et mon banc ne le reproduisait pas parce
    //  qu'il pilotait l'ouverture au lieu de la laisser courir.
    //
    //  Le poste qui PERD la réclamation se rebranchait. Or se rebrancher, c'est
    //  débrancher d'abord — donc remettre le curseur et la file des entrées
    //  reçues à zéro. Les trois entrées déjà arrivées et la fenêtre qui
    //  attendait le OK disparaissaient d'un coup, et le joueur cliquait dans le
    //  vide pendant que le combat avançait sans lui.
    {
        const f = firestoreDeBanc();
        const nico = creerPoste(f, "P_03");
        const ben = creerPoste(f, "P_01");

        // Ben est branché depuis le chargement de sa page, comme en vrai.
        ben.regime.rejoindre();
        await f.livrer();

        // Nico ouvre, le cerveau publie deux tours de créature.
        await nico.regime.ouvrir(SOURCE_CREATURE_DABORD);
        await f.livrer();
        await nico.regime.tourner();
        await f.livrer();

        const enFileAvant = ben.regime.spectateur.enFile();
        const attenduAvant = ben.regime.spectateur.enAttente();
        verifier("Ben a reçu des entrées et attend le OK",
                 enFileAvant > 0 || !!attenduAvant,
                 `(${enFileAvant} en file, fenêtre ${attenduAvant ? "ouverte" : "fermée"})`);

        // MAINTENANT Ben tente d'ouvrir le même combat, et perd.
        const perdu = await ben.regime.ouvrir(SOURCE_CREATURE_DABORD);
        await f.livrer();
        verifier("il perd la réclamation", perdu === null);
        verifier("et il le sait", ben.regime.ouvertureAilleurs() === true);

        // ET IL N'A RIEN PERDU.
        verifier("son curseur n'a pas sauté par-dessus les entrées",
                 ben.regime.vue() === 0, `(vue ${ben.regime.vue()})`);
        verifier("sa fenêtre attend toujours le même tour",
                 !!ben.regime.spectateur.enAttente(), "");

        // Et le OK marche.
        for (let i = 0; i < 10 && ben.regime.spectateur.enAttente(); i++) {
            await ben.regime.ok(); await f.livrer();
        }
        const publie = await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE));
        verifier("le OK rejoue vraiment le combat", ben.regime.vue() === publie.version,
                 `(${ben.regime.vue()} / ${publie.version})`);
        verifier("et son écran montre l'état publié",
                 empreinte(ben.regime.etatAffiche()) === empreinte(publie),
                 empreinte(ben.regime.etatAffiche()));

        // Le cerveau regarde son propre écran comme les autres : le tour d'une
        // créature n'est à personne, donc sa fenêtre s'ouvre aussi. Une fois
        // qu'il a cliqué, les deux écrans se rejoignent.
        for (let i = 0; i < 10 && nico.regime.spectateur.enAttente(); i++) {
            await nico.regime.ok(); await f.livrer();
        }
        verifier("le cerveau aussi doit cliquer pour voir le tour",
                 nico.vu.animations.length > 0, `(${nico.vu.animations.length})`);
        verifier("et alors les deux écrans se rejoignent",
                 empreinte(ben.regime.etatAffiche()) === empreinte(nico.regime.etatAffiche()),
                 empreinte(nico.regime.etatAffiche()));
        verifier("il a vu les animations passer", ben.vu.animations.length > 0,
                 `(${ben.vu.animations.length})`);
    }

    // =====================================================================
    console.log("\n14. LES DEUX ÉCOUTES N'ARRIVENT PAS DANS L'ORDRE");
    // =====================================================================
    //  L'état et le journal sont deux documents, donc deux écoutes : rien ne
    //  garantit leur ordre. Une entrée d'un combat qu'on ne connaît pas encore
    //  est écartée à la porte — c'est voulu — mais une écoute ne renotifie que
    //  lorsqu'un document bouge. Sans relecture, ces entrées ne reviendraient
    //  jamais, et l'écran resterait au départ pendant que le combat avance.
    {
        const f = firestoreDeBanc();
        const nico = creerPoste(f, "P_03");
        await nico.regime.ouvrir(SOURCE_CREATURE_DABORD);
        await f.livrer();
        await nico.regime.tourner();
        await f.livrer();

        const publie = await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE));
        verifier("le cerveau a publié des entrées", publie.version > 0,
                 `(version ${publie.version})`);

        // Un poste qui arrive maintenant : il reçoit tout d'un coup, et il doit
        // repartir de l'état publié — pas rester à zéro.
        const tard = creerPoste(f, "P_07");
        tard.regime.rejoindre();
        await f.livrer({ melanger: true, tours: 20 });

        verifier("le retardataire est reparti de l'état publié",
                 tard.regime.vue() === publie.version,
                 `(vue ${tard.regime.vue()} / ${publie.version})`);
        verifier("et il voit le même plateau",
                 empreinte(tard.regime.etatAffiche()) === empreinte(publie));

        // La suite lui arrive normalement.
        await nico.regime.demanderFinDeTour("H1");
        await f.livrer();
        await nico.regime.tourner();
        await f.livrer();
        for (let i = 0; i < 10 && tard.regime.spectateur.enAttente(); i++) {
            await tard.regime.ok(); await f.livrer();
        }
        const apres = await f.ioPour("P_03").lire(CHEMINS.etat(PARTIE));
        verifier("et la suite se joue chez lui aussi",
                 tard.regime.vue() === apres.version,
                 `(${tard.regime.vue()} / ${apres.version})`);
    }

    // =====================================================================
    console.log("\n15. LE CERVEAU MEURT : LA TABLE REPREND LA MAIN");
    // =====================================================================
    //  Un seul navigateur écrit le combat. S'il ferme son onglet, part en veille
    //  ou perd le réseau, tout s'arrête — et jusqu'ici rien ne le disait, ni ne
    //  permettait d'en sortir. C'était le dernier endroit où une soirée pouvait
    //  mourir sans un mot.
    {
        const f = firestoreDeBanc();
        // Trois montres, qu'on avance à la main.
        const montre = { P_01: 1000, P_03: 1000, P_07: 1000 };
        const nico = creerPoste(f, "P_01", { maintenant: () => montre.P_01 });
        const ben  = creerPoste(f, "P_03", { maintenant: () => montre.P_03 });
        const ipad = creerPoste(f, "P_07", { maintenant: () => montre.P_07 });
        [nico, ben, ipad].forEach(p => p.regime.rejoindre());
        await f.livrer();

        await nico.regime.ouvrir(SOURCE_CREATURE_DABORD);
        await f.livrer();
        verifier("le combat s'ouvre chez Nico", nico.regime.jeSuisLeCerveau());
        verifier("et les autres le regardent",
                 !ben.regime.jeSuisLeCerveau() && !ipad.regime.jeSuisLeCerveau());
        verifier("personne ne crie au loup tout de suite",
                 !ben.regime.cerveauSilencieux());

        // LE POSTE DE NICO DISPARAÎT. Il ne bat plus, il n'écrit plus.
        nico.regime.debrancher();

        // Les montres des autres avancent : le battement, lui, ne bouge plus.
        montre.P_03 += 40000;
        montre.P_07 += 40000;
        verifier("au bout de trente secondes, le silence se voit",
                 ben.regime.cerveauSilencieux() && ipad.regime.cerveauSilencieux());

        // DEUX POSTES CLIQUENT À LA MÊME SECONDE : UN SEUL PREND.
        const [prisBen, prisIpad] = await Promise.all([
            ben.regime.reprendreLaMain(),
            ipad.regime.reprendreLaMain()
        ]);
        await f.livrer();
        verifier("un seul poste reprend la main", (prisBen ? 1 : 0) + (prisIpad ? 1 : 0) === 1,
                 `(Ben ${prisBen}, iPad ${prisIpad})`);

        const etat = await f.ioPour("banc").lire(CHEMINS.etat(PARTIE));
        verifier("l'état désigne bien le nouveau cerveau",
                 etat.cerveau === (prisBen ? "P_03" : "P_07"), etat.cerveau);
        const repreneur = prisBen ? ben : ipad;
        const autre = prisBen ? ipad : ben;
        verifier("et le repreneur le sait", repreneur.regime.jeSuisLeCerveau());
        verifier("l'autre s'efface sans discuter", !autre.regime.jeSuisLeCerveau());

        // ET LE COMBAT REPART. C'est tout l'intérêt : pas seulement un bouton,
        // mais un combat qui continue là où il s'était tu.
        //  La file attend le héros de Ben : il termine son tour, et c'est LE
        //  NOUVEAU CERVEAU qui publie — la preuve que le combat continue.
        const avant = etat.version;
        [ben, ipad].forEach(p => p.regime.ok());
        await f.livrer();
        await ben.regime.demanderFinDeTour("H1");
        await f.livrer();
        await repreneur.regime.tourner();
        await f.livrer();
        const apres = await f.ioPour("banc").lire(CHEMINS.etat(PARTIE));
        verifier("le combat repart sous la nouvelle main", apres.version > avant,
                 `(${avant} → ${apres.version})`);
        verifier("et c'est bien le repreneur qui a écrit",
                 apres.cerveau === (prisBen ? "P_03" : "P_07"), apres.cerveau);

        // LE CERVEAU REVENU GARDE SA PLACE. Un wifi qui hoquette ne doit pas
        // faire changer de cerveau : tant que le battement bouge, personne ne
        // reprend rien.
        const vivant = firestoreDeBanc();
        const a = creerPoste(vivant, "P_01", { maintenant: () => 1000 });
        const b = creerPoste(vivant, "P_03", { maintenant: () => 1000 });
        [a, b].forEach(p => p.regime.rejoindre());
        await vivant.livrer();
        await a.regime.ouvrir(SOURCE_CREATURE_DABORD);
        await vivant.livrer();
        const refus = await b.regime.reprendreLaMain();
        await vivant.livrer();
        verifier("on ne prend pas la main d'un cerveau vivant", refus === false);
        verifier("qui reste donc le cerveau", a.regime.jeSuisLeCerveau());
        verifier("et l'autre reste spectateur", !b.regime.jeSuisLeCerveau());
    }

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
    process.exit(echecs === 0 ? 0 : 1);
}

banc();
