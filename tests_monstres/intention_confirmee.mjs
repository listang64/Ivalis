// LE CERVEAU VOIT CE QU'IL VIENT LUI-MÊME DE DEMANDER.
//
// Le bug de la table : le joueur qui tenait le cerveau déplace son héros. Le
// pion avance, puis revient à sa case de départ (« il se téléporte »). Il
// redemande le déplacement : le premier part enfin, le second est refusé
// (« chemin discontinu »). Il choisit alors une technique et une cible… et plus
// rien ne se passe, le combat reste figé.
//
// La cause : une intention écrite par ce poste arrive dans SON cache marquée
// « pas encore en base » (hasPendingWrites), et le cerveau l'écarte — à raison
// tant que l'écriture est en route. Mais Firestore garde ce marqueur APRÈS
// avoir accusé réception, jusqu'au prochain passage du serveur sur le
// document ; et l'écoute des intentions n'était pas prévenue quand seul ce
// marqueur changeait. Rien ne relançait donc le cerveau : seule une NOUVELLE
// intention (le second déplacement) débloquait la précédente.
//
// Ce Firestore de banc fait exactement ça : un document écrit par un poste lui
// reste marqué « en route » après `lot`, jusqu'à ce que le banc fasse
// « repasser le serveur » — et alors, seules les écoutes qui ont demandé les
// changements de métadonnées sont prévenues.
import { creerRegime } from '../regime_cerveau.js';
import { CHEMINS, creerDepot, envoyerIntention } from '../depot_firestore.js';
import { readFileSync } from 'node:fs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const attendre = () => new Promise(r => setTimeout(r, 5));

function firestoreDeBanc() {
    const base = new Map();          // clé → { data, auteur, confirme }
    const ecoutes = [];
    const enAttente = [];
    const cle = (c) => c.join("/");
    const copie = (v) => JSON.parse(JSON.stringify(v));

    function documentsDe(chemin, r, lecteur) {
        const p = cle(chemin) + "/";
        let l = [...base.entries()]
            .filter(([k]) => k.startsWith(p) && k.slice(p.length).indexOf("/") === -1)
            .map(([k, d]) => ({ ...copie(d.data), __chemin: k.split("/"),
                                ...(d.auteur === lecteur && !d.confirme ? { __pasEncoreEnBase: true } : {}) }));
        if (r && r.egal) l = l.filter(d => d[r.egal.champ] === r.egal.valeur);
        if (r && r.champ !== undefined && r.sup !== undefined) l = l.filter(d => Number(d[r.champ]) > Number(r.sup));
        if (r && r.tri) l.sort((a, b) => (a[r.tri] > b[r.tri] ? 1 : a[r.tri] < b[r.tri] ? -1 : 0));
        return l;
    }
    const charge = (e) => e.estCollection ? documentsDe(e.chemin, e.requete, e.poste)
                                         : (base.get(cle(e.chemin)) ? copie(base.get(cle(e.chemin)).data) : null);
    function empiler() { ecoutes.forEach(e => enAttente.push({ ecoute: e, charge: charge(e) })); }

    function ioPour(poste) {
        return {
            async lire(chemin) { const d = base.get(cle(chemin)); return d ? copie(d.data) : null; },
            async lister(chemin, requete) { return documentsDe(chemin, requete, poste); },
            async lot(operations) {
                for (const o of operations) {
                    const k = cle(o.chemin);
                    if (o.op === "delete") { base.delete(k); continue; }
                    if (o.op === "update") {
                        const avant = base.get(k);
                        if (!avant) throw new Error("No document to update: " + k);
                        base.set(k, { ...avant, data: { ...avant.data, ...copie(o.data) } });
                        continue;
                    }
                    // Écrit, accusé reçu… mais encore marqué « en route » pour
                    // ce poste, comme dans le vrai Firestore.
                    base.set(k, { data: copie(o.data), auteur: poste, confirme: false });
                }
                empiler();
            },
            async transaction(chemin, decider) {
                const k = cle(chemin);
                const actuel = base.get(k) ? copie(base.get(k).data) : null;
                const aEcrire = decider(actuel);
                if (!aEcrire) return false;
                base.set(k, { data: copie(aEcrire), auteur: "serveur", confirme: true });
                empiler();
                return true;
            },
            ecouterDoc(chemin, rappel) {
                const e = { chemin, rappel, estCollection: false, poste };
                ecoutes.push(e); enAttente.push({ ecoute: e, charge: charge(e) });
                return () => { const i = ecoutes.indexOf(e); if (i >= 0) ecoutes.splice(i, 1); };
            },
            ecouterCollection(chemin, requete, rappel, options) {
                const e = { chemin, requete, rappel, estCollection: true, poste,
                            metadonnees: !!(options && options.metadonnees) };
                ecoutes.push(e); enAttente.push({ ecoute: e, charge: charge(e) });
                return () => { const i = ecoutes.indexOf(e); if (i >= 0) ecoutes.splice(i, 1); };
            }
        };
    }

    async function livrer() {
        for (let t = 0; t < 8; t++) {
            const paquet = enAttente.splice(0, enAttente.length);
            if (paquet.length === 0) return;
            for (const n of paquet) {
                if (!ecoutes.includes(n.ecoute)) continue;
                await n.ecoute.rappel(n.charge);
                await new Promise(r => setImmediate(r));
            }
        }
    }

    // Le serveur repasse : le marqueur tombe. Les données n'ont pas changé,
    // donc seule une écoute « métadonnées comprises » l'apprend.
    function serveurRepasse() {
        let change = false;
        base.forEach(d => { if (!d.confirme) { d.confirme = true; change = true; } });
        if (change) ecoutes.filter(e => e.estCollection && e.metadonnees)
            .forEach(e => enAttente.push({ ecoute: e, charge: charge(e) }));
    }

    return { ioPour, livrer, serveurRepasse, ecoutes };
}

const fiche = (id, extra = {}) => ({
    idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100,
    Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Bouclier_Actuel: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});
const SOURCE = {
    combat: "renc_confirmee", graine: 77,
    combattants: [
        fiche("H2", { idJoueur: "P_01", camp: "Allié", prenom: "Pliors" }),
        fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Goule", Personnalite: "brutal" })
    ],
    positions: { H2: { q: 0, r: 2 }, M1: { q: 5, r: 0 } },
    partie: {
        Phase_Combat: "Resolution", Tour_Combat: 1,
        Ordre_Initiative: ["H2", "M1"],
        File_Attente_Combat: [{ idPersonnage: "H2", idCarte: "C_H2" }, { idPersonnage: "M1", idCarte: "C_M1" }]
    }
};
const CARTES = { C_M1: { idCarte: "C_M1", infos: { portee: 1, fatigue: 15 }, attaques: [{ valeurBrute: 11 }], alterations: [] } };

function creerPoste(f, poste, traces) {
    let fiches = SOURCE.combattants.map(c => ({ ...c }));
    const regime = creerRegime({
        io: f.ioPour(poste), idPartie: "GAME_CONF", poste,
        estAMoi: (id) => id === "H2",
        carteDe: (id, idCarte) => CARTES[idCarte] || null,
        maintenant: () => 1000,
        programmer: (fn, ms) => setTimeout(fn, ms || 0),
        arreterMinuteur: (id) => clearTimeout(id),
        battementMs: 0,
        animations: { pas: async () => {}, poussee: async () => {}, bond: async () => {}, ruee: async () => {},
                      jauge: () => {}, message: () => {}, opportunite: async () => {}, zone: async () => {}, pause: async () => {} },
        ecran: { poserPions: () => {}, poserFiches: (f2) => { fiches = f2; }, poserFile: () => {},
                 rafraichir: () => {}, lireFiches: () => fiches },
        surFenetre: () => {},
        tracer: (ic, t, d) => traces.push(`${ic} ${t} ${d || ""}`)
    });
    return regime;
}

async function banc() {
    console.log("\n=========================================================");
    console.log("  LE CERVEAU VOIT SES PROPRES INTENTIONS");
    console.log("=========================================================\n");

    console.log("1. LE DÉPÔT : UNE INTENTION CONFIRMÉE N'EST PLUS « EN ROUTE »");
    {
        const f = firestoreDeBanc();
        const io = f.ioPour("P_01");
        const depot = creerDepot(io, "G");
        await io.lot([{ op: "set", chemin: CHEMINS.intention("G", "I_1"),
                        data: { id: "I_1", type: "finTour", acteur: "H2", traitee: false, ts: 1 } }]);
        verifier("avant confirmation : écartée (écriture peut-être en route)",
                 (await depot.lireIntentions()).length === 0);
        verifier("le dépôt sait confirmer", typeof depot.confirmer === "function");
        depot.confirmer && depot.confirmer("I_1");
        const lues = await depot.lireIntentions();
        verifier("après confirmation : le cerveau la voit", lues.length === 1 && lues[0].id === "I_1");
        verifier("une intention non confirmée reste écartée",
                 (await io.lot([{ op: "set", chemin: CHEMINS.intention("G", "I_2"),
                                  data: { id: "I_2", type: "finTour", acteur: "H2", traitee: false, ts: 2 } }]),
                  (await depot.lireIntentions()).map(i => i.id).join(",") === "I_1"));
    }

    console.log("\n2. LE CERVEAU JOUE TOUT DE SUITE LE DÉPLACEMENT DE SON PROPRE HÉROS");
    {
        const f = firestoreDeBanc();
        const traces = [];
        const p01 = creerPoste(f, "P_01", traces);
        await p01.ouvrir(SOURCE);
        await f.livrer(); await attendre(); await f.livrer();
        const v0 = p01.etatPublie().version;
        const avant = p01.etatPublie().combattants.H2;
        await p01.demanderMouvement("H2", [{ q: 1, r: 2 }]);
        for (let i = 0; i < 4; i++) { await attendre(); await f.livrer(); }
        const apres = p01.etatPublie().combattants.H2;
        verifier("le déplacement est joué SANS attendre le serveur",
                 apres.q === 1 && apres.r === 2, `(${avant.q},${avant.r} → ${apres.q},${apres.r})`);
        verifier("une entrée de plus au journal", p01.etatPublie().version > v0,
                 `(v${v0} → v${p01.etatPublie().version})`);

        // Puis la technique : la fin de tour, elle aussi, part du premier coup.
        const v1 = p01.etatPublie().version;
        await p01.demanderFinDeTour("H2");
        for (let i = 0; i < 4; i++) { await attendre(); await f.livrer(); }
        verifier("l'action suivante part aussi, le combat n'est pas figé",
                 p01.etatPublie().version > v1, `(v${v1} → v${p01.etatPublie().version})`);
        p01.arreter && p01.arreter();
    }

    console.log("\n3. L'ÉCOUTE EST PRÉVENUE QUAND LE MARQUEUR TOMBE");
    {
        const f = firestoreDeBanc();
        const traces = [];
        const p01 = creerPoste(f, "P_01", traces);
        await p01.ouvrir(SOURCE);
        await f.livrer(); await attendre(); await f.livrer();
        const ecoute = f.ecoutes.find(e => e.estCollection && e.chemin.join("/") === CHEMINS.intentions("GAME_CONF").join("/"));
        verifier("l'écoute des intentions demande les métadonnées", !!(ecoute && ecoute.metadonnees));
        // Une intention écrite sans passer par `demander` (donc jamais
        // confirmée au dépôt) : seule la chute du marqueur peut la débloquer.
        const v0 = p01.etatPublie().version;
        await envoyerIntention(f.ioPour("P_01"), "GAME_CONF", { type: "finTour", acteur: "H2", poste: "P_01" });
        for (let i = 0; i < 3; i++) { await attendre(); await f.livrer(); }
        verifier("tant qu'elle est « en route », elle attend", p01.etatPublie().version === v0);
        f.serveurRepasse();
        for (let i = 0; i < 4; i++) { await attendre(); await f.livrer(); }
        verifier("le marqueur tombe : le cerveau la joue aussitôt", p01.etatPublie().version > v0,
                 `(v${v0} → v${p01.etatPublie().version})`);
        p01.arreter && p01.arreter();
    }

    console.log("\n4. LE BRANCHEMENT FIRESTORE");
    {
        const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
        const corps = app.slice(app.indexOf("ecouterCollection(chemin, requete, rappel"));
        const fin = corps.indexOf("\n    }");
        const fn = corps.slice(0, fin);
        verifier("ecouterCollection accepte des options", /ecouterCollection\(chemin, requete, rappel, options\)/.test(fn));
        verifier("…et passe includeMetadataChanges", /includeMetadataChanges:\s*true/.test(fn));
        const reg = readFileSync(new URL('../regime_cerveau.js', import.meta.url), 'utf8');
        verifier("le battement compte aussi les intentions « en route »",
                 /intentionsEnAttente = \(docs \|\| \[\]\)\.filter\(i => i && !i\.traitee\)\.length/.test(reg));
        verifier("demander confirme l'intention écrite", /depot\.confirmer\(id\)/.test(reg));
    }

    console.log(`\n${echecs === 0 ? "TOUT EST VERT" : echecs + " ÉCHEC(S)"}\n`);
    process.exit(echecs === 0 ? 0 : 1);
}
banc().catch(e => { console.error(e); process.exit(1); });
