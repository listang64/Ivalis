// v423 — LE PILOTE DES COMBATS DE TEST, CÔTÉ CERVEAU.
// Nico : « en mode dev, deux flèches au niveau de l'avatar de notre perso, pour
// contrôler tous les tours des personnages joueurs : une seule personne peut
// lancer des tests de combat ». Ici le vrai cerveau (regime_cerveau.js +
// cerveau_combat.js) : UN SEUL POSTE, celui de Ben (P_01, qui a H2), ouvre le
// combat ; H1 est le héros de Nico (P_03), absent. Sans le pilote, Ben ne peut
// pas jouer H1 (refusé) ; avec, ses demandes partent au nom de Nico, et le
// combat se joue en entier sur un seul poste. (Le monde : celui de regime_cerveau.mjs.)
// Lancer : node tests_monstres/corrections_v423_cerveau.mjs
import { creerRegime } from '../regime_cerveau.js';
import { CHEMINS, COL_INTENTIONS } from '../depot_firestore.js';
import { FORMAT_ETAT } from '../combat_etat.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// =========================================================================
//  UN FIRESTORE QUI PREND SON TEMPS
// =========================================================================
// Le premier chemin qui mène à une valeur `undefined`, ou null s'il n'y en a pas.
function premierIndefini(valeur, chemin) {
    if (valeur === undefined) return chemin || "(racine)";
    if (Array.isArray(valeur)) {
        for (let i = 0; i < valeur.length; i++) {
            const trou = premierIndefini(valeur[i], `${chemin}[${i}]`);
            if (trou !== null) return trou;
        }
        return null;
    }
    if (valeur && typeof valeur === "object") {
        for (const k of Object.keys(valeur)) {
            const trou = premierIndefini(valeur[k], chemin ? `${chemin}.${k}` : k);
            if (trou !== null) return trou;
        }
    }
    return null;
}

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
                // AUSSI STRICT QUE LE VRAI : une seule valeur `undefined`, où
                // qu'elle soit, et tout le lot est refusé — avant d'écrire
                // quoi que ce soit.
                for (const o of operations) {
                    if (o.op === "delete") continue;
                    const trou = premierIndefini(o.data, "");
                    if (trou !== null) {
                        throw new Error("Function WriteBatch.set() called with invalid data. Unsupported field value: "
                            + `undefined (found in document ${cle(o.chemin)}) [champ ${trou}]`);
                    }
                }
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


const etatDe = (f) => f.ioPour("banc").lire(CHEMINS.etat(PARTIE));
const intentions = async (f) => (await f.ioPour("banc").lister([...CHEMINS.intentions(PARTIE)])) || [];
// Le pilote de la page (combat.js) : joueur du héros = son propriétaire.
const PROPRIETAIRE = Object.fromEntries(SOURCE.combattants.filter(c => c.idJoueur).map(c => [c.idPersonnage, c.idJoueur]));
const piloter = (oui) => {
    globalThis.window = oui ? { posteDeLIntention: (id, poste) => PROPRIETAIRE[id] || poste } : undefined;
    if (!oui) delete globalThis.window;
};

async function banc() {
    console.log("\n1. SANS LE PILOTE : BEN NE PEUT PAS JOUER LE HÉROS DE NICO");
    {
        piloter(false);
        const f = firestoreDeBanc();
        const ben = creerPoste(f, "P_01");
        await ben.regime.ouvrir(SOURCE);
        await f.livrer();
        verifier("Ben, seul, tient le cerveau", ben.regime.jeSuisLeCerveau() === true);
        await ben.regime.demanderFinDeTour("H1");
        await f.livrer(); await ben.regime.tourner(); await f.livrer();
        const e = await etatDe(f);
        const l = await intentions(f);
        verifier("la demande pour H1 est refusée (Ben ne commande pas H1)", l.some(i => i.acteur === "H1" && /P_01 ne commande pas H1/.test(i.refus || "")), JSON.stringify(l.map(i => [i.acteur, i.poste, i.refus])));
        verifier("…et H1 est toujours en tête de file", ((e && e.file) || [])[0] && e.file[0].id === "H1");
    }

    console.log("\n2. AVEC LE PILOTE : LES DEMANDES PARTENT AU NOM DU JOUEUR DU HÉROS");
    {
        piloter(true);
        const f = firestoreDeBanc();
        const ben = creerPoste(f, "P_01");
        await ben.regime.ouvrir(SOURCE);
        await f.livrer();
        await ben.regime.demanderFinDeTour("H1");
        await f.livrer(); await ben.regime.tourner(); await f.livrer();
        const l = await intentions(f);
        const h1 = l.find(i => i.acteur === "H1");
        verifier("la demande pour H1 porte le poste de Nico (P_03)", !!h1 && h1.poste === "P_03", JSON.stringify(l.map(i => [i.acteur, i.poste, i.refus])));
        verifier("…le cerveau l'accepte (aucun refus)", !!h1 && !h1.refus);
        const e = await etatDe(f);
        verifier("…et la file avance : H1 a joué", !((e.file || []).some(x => x.id === "H1")), JSON.stringify((e.file || []).map(x => x.id)));
    }

    console.log("\n3. AVEC LE PILOTE : TOUTE LA MANCHE SE JOUE SUR UN SEUL POSTE");
    {
        piloter(true);
        const f = firestoreDeBanc();
        const ben = creerPoste(f, "P_01");
        await ben.regime.ouvrir(SOURCE);
        await f.livrer();
        const joues = [];
        for (let i = 0; i < 16; i++) {
            const e = await etatDe(f);
            if (!e || e.phase !== "Resolution") break;
            const tete = (e.file || [])[0];
            if (!tete) break;
            const c = e.combattants[tete.id];
            if (!c.estMonstre) { joues.push(tete.id); await ben.regime.demanderFinDeTour(tete.id); }
            await f.livrer(); await ben.regime.tourner(); await f.livrer();
        }
        const e = await etatDe(f);
        const l = await intentions(f);
        verifier("H1 (de Nico) et H2 (de Ben) ont joué leur tour, depuis le même poste", joues.includes("H1") && joues.includes("H2"), joues.join(","));
        verifier("…les créatures ont joué d'elles-mêmes, la manche est finie", (e.file || []).length === 0 || e.phase !== "Resolution", `${e.phase} ${JSON.stringify((e.file || []).map(x => x.id))}`);
        verifier("…aucune demande refusée", !l.some(i => i.refus), JSON.stringify(l.filter(i => i.refus).map(i => [i.acteur, i.refus])));
        verifier("…une créature ne reçoit toujours pas d'ordre du pilote", await (async () => {
            const f2 = firestoreDeBanc(); const b2 = creerPoste(f2, "P_01");
            await b2.regime.ouvrir(SOURCE_CREATURE_DABORD); await f2.livrer();
            await b2.regime.demander({ type: "finTour", acteur: "M1" }); await f2.livrer(); await b2.regime.tourner(); await f2.livrer();
            return (await intentions(f2)).some(i => i.acteur === "M1" && i.refus);
        })());
    }
    piloter(false);
    console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
    process.exit(echecs ? 1 : 0);
}
banc().catch(e => { console.error(e); process.exit(1); });
