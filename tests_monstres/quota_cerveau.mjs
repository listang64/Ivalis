// LE CERVEAU NE DOIT PLUS VIDER LE QUOTA FIREBASE.
//
// Signalé en partie : « les joueurs ont choisi leurs compétences et le combat
// ne se lance pas ». La base répondait « Quota exceeded » : le quota gratuit du
// jour (50 000 lectures, 20 000 écritures) était parti, et plus aucune carte ne
// s'inscrivait dans la file.
//
// La cause, mesurée au banc combat_complet.mjs : le cerveau écrit un battement
// toutes les cinq secondes, l'écho de ce battement le faisait TOURNER, et
// chaque tour relisait la collection ENTIÈRE des intentions — qui garde, pour
// toute la durée de la rencontre, chaque pas, chaque carte, chaque fin de tour.
// Firestore facture un document lu par document rendu : plus le combat durait,
// plus chaque battement coûtait cher, même quand personne ne jouait. À l'arrêt,
// une table consommait déjà plus de 8 000 lectures par heure au bout de trois
// manches, et bien plus ensuite.
//
// Ce banc fait tourner le VRAI régime (creerRegime) sur un Firestore qui compte
// la facture comme Firebase, avec un combat qui a déjà trois cents intentions
// traitées derrière lui, et vérifie trois choses :
//   • un battement ne coûte plus qu'une poignée de lectures, quel que soit le
//     nombre d'intentions accumulées ;
//   • une intention qui arrive ne fait lire que celles en attente — jamais les
//     trois cents d'avant ;
//   • le cerveau n'a plus besoin de son battement pour voir une intention : il
//     l'écoute, et la traite aussitôt.
import { creerRegime } from '../regime_cerveau.js';
import { CHEMINS } from '../depot_firestore.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const dormir = (ms) => new Promise(r => setTimeout(r, ms));
const copie = (v) => (v === undefined || v === null) ? v : JSON.parse(JSON.stringify(v));

// =========================================================================
//  UN FIRESTORE QUI NOTIFIE TOUT SEUL, ET QUI FACTURE COMME FIREBASE
// =========================================================================
//  Une lecture par document rendu (une requête vide en coûte une), une lecture
//  par document ajouté ou modifié dans une écoute, une écriture par document.
function firestoreQuiFacture() {
    const base = new Map();
    const ecoutes = [];
    const facture = { lectures: 0, ecritures: 0, battements: 0, intentionsTraiteesLues: 0 };
    const cle = (c) => c.join("/");
    const cheminIntentions = (partie) => cle(CHEMINS.intentions(partie));

    function documentsDe(chemin, r) {
        const p = cle(chemin) + "/";
        let l = [...base.entries()]
            .filter(([k]) => k.startsWith(p) && k.slice(p.length).indexOf("/") === -1)
            .map(([k, d]) => ({ ...copie(d), __chemin: k.split("/") }));
        if (r && r.egal) l = l.filter(d => d[r.egal.champ] === r.egal.valeur);
        if (r && r.champ !== undefined && r.sup !== undefined) l = l.filter(d => Number(d[r.champ]) > Number(r.sup));
        if (r && r.tri) l.sort((a, b) => (a[r.tri] > b[r.tri] ? 1 : a[r.tri] < b[r.tri] ? -1 : 0));
        if (r && r.limite) l = l.slice(0, r.limite);
        return l;
    }
    const compterIntentions = (chemin, docs) => {
        if (!cle(chemin).endsWith("Combat_Intentions")) return;
        facture.intentionsTraiteesLues += docs.filter(d => d.traitee).length;
    };

    function notifier() {
        for (const e of ecoutes) {
            if (e.estCollection) {
                const docs = documentsDe(e.chemin, e.requete);
                const avant = new Map((e.dernier || []).map(d => [d.__chemin.join("/"), JSON.stringify(d)]));
                const payes = docs.filter(d => avant.get(d.__chemin.join("/")) !== JSON.stringify(d));
                if (payes.length === 0 && docs.length === (e.dernier || []).length) continue;
                facture.lectures += payes.length;
                compterIntentions(e.chemin, payes);
                e.dernier = docs;
                setTimeout(() => { if (ecoutes.includes(e)) e.rappel(copie(docs)); }, 2);
            } else {
                const d = base.get(cle(e.chemin)) || null;
                const s = JSON.stringify(d);
                if (s === e.dernier) continue;
                e.dernier = s;
                facture.lectures += 1;
                setTimeout(() => { if (ecoutes.includes(e)) e.rappel(copie(d)); }, 2);
            }
        }
    }

    function ioPour() {
        return {
            async lire(chemin) { facture.lectures += 1; return copie(base.get(cle(chemin)) || null); },
            async lister(chemin, requete) {
                const l = documentsDe(chemin, requete);
                facture.lectures += Math.max(1, l.length);
                compterIntentions(chemin, l);
                return l;
            },
            async lot(operations) {
                for (const o of operations) {
                    const k = cle(o.chemin);
                    facture.ecritures += 1;
                    if (o.op === "delete") { base.delete(k); continue; }
                    if (o.op === "update") {
                        const avant = base.get(k);
                        if (!avant) throw new Error("update sur un document absent : " + k);
                        if (Object.keys(o.data).length === 1 && "battement" in o.data) facture.battements += 1;
                        base.set(k, { ...avant, ...copie(o.data) });
                        continue;
                    }
                    base.set(k, copie(o.data));
                }
                notifier();
            },
            async transaction(chemin, decider) {
                facture.lectures += 1;
                const k = cle(chemin);
                const aEcrire = decider(copie(base.get(k) || null));
                if (!aEcrire) return false;
                facture.ecritures += 1;
                base.set(k, copie(aEcrire));
                notifier();
                return true;
            },
            ecouterDoc(chemin, rappel) {
                const d = base.get(cle(chemin)) || null;
                const e = { chemin, rappel, estCollection: false, dernier: JSON.stringify(d) };
                ecoutes.push(e);
                facture.lectures += 1;
                setTimeout(() => { if (ecoutes.includes(e)) rappel(copie(d)); }, 2);
                return () => { const i = ecoutes.indexOf(e); if (i >= 0) ecoutes.splice(i, 1); };
            },
            ecouterCollection(chemin, requete, rappel) {
                const docs = documentsDe(chemin, requete);
                const e = { chemin, requete, rappel, estCollection: true, dernier: docs };
                ecoutes.push(e);
                facture.lectures += Math.max(1, docs.length);
                compterIntentions(chemin, docs);
                setTimeout(() => { if (ecoutes.includes(e)) rappel(copie(docs)); }, 2);
                return () => { const i = ecoutes.indexOf(e); if (i >= 0) ecoutes.splice(i, 1); };
            }
        };
    }

    return { ioPour, base, facture, cheminIntentions,
             zero() { facture.lectures = 0; facture.ecritures = 0; facture.battements = 0; facture.intentionsTraiteesLues = 0; } };
}

// =========================================================================
//  LA RENCONTRE : un héros de Ben en tête de file, qui réfléchit
// =========================================================================
const fiche = (id, extra = {}) => ({
    idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100,
    Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Bouclier_Actuel: 0,
    Etats_Alteres: [], statut: "Vivant", ...extra
});
const SOURCE = {
    combat: "renc_quota", graine: 77,
    combattants: [
        fiche("H1", { idJoueur: "P_02", camp: "Allié", prenom: "Pliors" }),
        fiche("H2", { idJoueur: "P_01", camp: "Allié", prenom: "Mémé" }),
        fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Goule", Personnalite: "brutal" })
    ],
    positions: { H1: { q: 0, r: 0 }, H2: { q: 0, r: 2 }, M1: { q: 6, r: 0 } },
    partie: {
        Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "H2", "M1"],
        File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C_H1" }, { idPersonnage: "H2", idCarte: "C_H2" },
                              { idPersonnage: "M1", idCarte: "C_M1" }]
    }
};
const CARTES = { C_M1: { idCarte: "C_M1", infos: { portee: 1, fatigue: 15 }, attaques: [{ valeurBrute: 9 }], alterations: [] } };
const HEROS_DE = { P_01: ["H2"], P_02: ["H1"] };

function creerPoste(f, poste, partie, battementMs) {
    return creerRegime({
        io: f.ioPour(poste), idPartie: partie, poste,
        estAMoi: (id) => (HEROS_DE[poste] || []).includes(id),
        carteDe: (id, idCarte) => CARTES[idCarte] || null,
        battementMs,
        animations: {}, ecran: { poserPions: () => {}, poserFiches: () => {}, poserFile: () => {},
                                 rafraichir: () => {}, lireFiches: () => SOURCE.combattants },
        surFenetre: () => {}, tracer: () => {}
    });
}

// Trois cents intentions déjà traitées : la trace d'une longue rencontre.
function empilerHistorique(f, partie, n) {
    for (let i = 0; i < n; i++) {
        f.base.set(`${f.cheminIntentions(partie)}/vieille_${i}`,
                   { id: `vieille_${i}`, type: "finTour", acteur: "H1", poste: "P_02", ts: i, traitee: true, v: 1 });
    }
}

console.log("\n=========================================================");
console.log("  1. UN BATTEMENT NE COÛTE PLUS QU'UNE POIGNÉE DE LECTURES");
console.log("=========================================================");
{
    const f = firestoreQuiFacture();
    const PARTIE = "GAME_Q1";
    const nico = creerPoste(f, "P_01", PARTIE, 40);
    const ben = creerPoste(f, "P_02", PARTIE, 40);
    await nico.ouvrir(SOURCE);
    ben.rejoindre();
    await dormir(200);
    empilerHistorique(f, PARTIE, 300);

    f.zero();
    await dormir(1000);
    const { lectures, battements, intentionsTraiteesLues } = f.facture;
    const parBattement = battements ? lectures / battements : Infinity;
    verifier("le cerveau bat bien pendant l'attente", battements >= 10, `${battements} battements`);
    // Un battement : le cerveau relit l'état avant d'écrire (1), puis chaque
    // poste qui écoute l'état reçoit la nouvelle (2 ici). Rien d'autre.
    verifier("chaque battement coûte au plus 3 lectures", parBattement <= 3.01,
             `${lectures} lectures pour ${battements} battements (${parBattement.toFixed(2)} chacun)`);
    verifier("et aucune des 300 intentions traitées n'est relue", intentionsTraiteesLues === 0,
             `${intentionsTraiteesLues} relues`);
    nico.debrancher(); ben.debrancher();
}

console.log("\n=========================================================");
console.log("  2. UNE INTENTION QUI ARRIVE NE FAIT LIRE QUE CELLES EN ATTENTE");
console.log("=========================================================");
{
    const f = firestoreQuiFacture();
    const PARTIE = "GAME_Q2";
    // Un battement très lent : si l'intention est traitée, c'est qu'on l'a
    // ÉCOUTÉE, pas qu'un battement est venu la ramasser.
    const nico = creerPoste(f, "P_01", PARTIE, 60000);
    const ben = creerPoste(f, "P_02", PARTIE, 60000);
    await nico.ouvrir(SOURCE);
    ben.rejoindre();
    await dormir(150);
    empilerHistorique(f, PARTIE, 300);
    const versionAvant = (nico.etatPublie() || {}).version;
    const teteAvant = ((nico.etatPublie() || {}).file || [])[0];

    f.zero();
    const debut = Date.now();
    await ben.demanderFinDeTour("H1");
    let delai = null;
    for (let i = 0; i < 100; i++) {
        await dormir(10);
        const e = nico.etatPublie();
        if (e && e.version > versionAvant) { delai = Date.now() - debut; break; }
    }
    verifier("Ben avait bien la main (H1 en tête)", teteAvant && teteAvant.id === "H1", JSON.stringify(teteAvant));
    verifier("le cerveau traite la fin de tour aussitôt, sans attendre un battement",
             delai !== null && delai < 500, delai === null ? "jamais traitée" : `${delai} ms`);
    verifier("sans relire une seule des 300 intentions déjà traitées",
             f.facture.intentionsTraiteesLues === 0, `${f.facture.intentionsTraiteesLues} relues`);
    verifier("et la facture de ce tour reste petite", f.facture.lectures <= 30,
             `${f.facture.lectures} lectures`);
    nico.debrancher(); ben.debrancher();
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
