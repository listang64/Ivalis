// L'ASSAUT MORTEL SUR UNE CASE OÙ GÎT UN MORT — ET LE REFUS QUI FIGEAIT LA TABLE.
//
// Le bug de la table : l'Assassin lance l'Assaut mortel, sa zone de deux cases
// couvre un ennemi vivant ET la case d'une créature tombée plus tôt (son pion
// n'est plus dessiné, mais sa case reste dans les Tokens). L'écran envoie les
// deux, le cerveau refuse tout (« MONSTRE_… n'est pas un ennemi valable »), et
// la partie reste figée : le poste gardait son repère « demande en cours », la
// tête de file ne bougeait pas, plus rien ne partait.
//
// Trois corrections, vérifiées ici :
//   1. le cerveau retire les combattants à terre des cibles de l'Assaut, et
//      joue le reste ;
//   2. la zone de l'écran ne ramasse plus les combattants à terre ;
//   3. un refus revient au poste qui a demandé (surRefus) : son repère tombe,
//      le joueur lit la raison, il peut rejouer.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';
import { construireEtatCombat } from '../combat_etat.js';
import { validerIntention, appliquerIntention } from '../cerveau_combat.js';
import { creerRegime } from '../regime_cerveau.js';
import { CHEMINS } from '../depot_firestore.js';


let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

const w = {};
new Function('window', fs.readFileSync('/home/user/Ivalis/experience.js', 'utf-8'))(w);
new Function('window', SRC_STATS_COMMUNES)(w);
const REGLES = {
    pvMax: w.pvMaxCombattant, fatigueMax: w.fatigueMaxCombattant,
    esquive: w.esquiveCombattant, parade: w.paradeCombattant,
    defPhysique: w.defPhysiqueCombattant, defMagique: w.defMagiqueCombattant,
    critique: w.critiqueCombattant, atouts: w.atoutRace, bonusEquip: w.bonusEquip
};
const XP = { 1: 0, 4: 1800, 5: 2500, 9: 6400, 10: 7900 };

const fiche = (id, extra = {}) => ({
    idPersonnage: id, prenom: id, race: "Humain", classe: "", camp: id.startsWith("M") ? "Ennemi" : "Allié",
    estMonstre: id.startsWith("M"), joueur: "", xp: 0,
    PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Critique: 0, Def_Physique: 0, Def_Magique: 0,
    Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [], statut: "Vivant", ...extra
});
const assassin = (niveau, extra = {}) => fiche("S", { classe: "Assassin", xp: XP[niveau], ...extra });

// S (l'Assassin) en (0,0) ; M1 (1,0) et M2 (1,-1) au contact et côte à côte ;
// M4 (-1,0) au contact, de l'autre côté ; M3 (3,0) loin ; A (allié) en (0,1).
const monde = (niveau = 10, positions = {}) => {
    const fiches = [assassin(niveau), fiche("M1"), fiche("M2"), fiche("M3"), fiche("M4"), fiche("A")];
    const pos = { S: { q: 0, r: 0 }, M1: { q: 1, r: 0 }, M2: { q: 1, r: -1 }, M3: { q: 3, r: 0 },
                  M4: { q: -1, r: 0 }, A: { q: 0, r: 1 }, ...positions };
    const e = construireEtatCombat({ idPartie: "P", cerveau: "P", graine: 1, combattants: fiches, positions: pos,
                                     partie: { Tour_Combat: 1 }, regles: REGLES });
    e.ordre = ["S", "M1", "M2", "M3", "M4", "A"];
    e.phase = "Resolution";
    return e;
};
const enTete = (e, id, carte) => { e.file = [{ id, carte, initiative: 100, pas: 0 }, { id: "M3", carte: "X", initiative: 10, pas: 0 }]; return e; };
const assaut = (cibles, extra = {}) => ({ id: "I" + Math.random(), type: "classe", acteur: "S", idCarte: "CLASSE_ASSAUT_MORTEL", cibles, ...extra });

console.log("\n1. LE CERVEAU : UNE CIBLE À TERRE EST RETIRÉE, PAS TOUTE LA TECHNIQUE");
{
    const e = enTete(monde(5), "S", "CLASSE_ASSAUT_MORTEL");
    e.combattants.M2.aTerre = true; e.combattants.M2.pv = 0;
    const v = validerIntention(e, assaut(["M1", "M2"]));
    verifier("M1 vivant + M2 à terre : accepté", v.ok, v.raison || "");
    const pas = appliquerIntention(e, assaut(["M1", "M2"]));
    const c = pas.etat.combattants;
    verifier("M1 prend ses 10 dégâts et son poison", c.M1.pv === 90 && c.M1.etats.some(x => x.nom === "Empoisonnement"), `${c.M1.pv}`);
    verifier("M2, à terre, n'est pas touché", c.M2.pv === 0 && !c.M2.etats.some(x => x.nom === "Empoisonnement"));
    verifier("la technique est consommée, le tour passe",
             c.S.techniquesUtilisees.includes("CLASSE_ASSAUT_MORTEL") && pas.etat.file[0].id === "M3");
    const inconnu = validerIntention(enTete(monde(5), "S", "CLASSE_ASSAUT_MORTEL"), assaut(["M1", "MONSTRE_disparu"]));
    verifier("un combattant disparu de l'état est retiré lui aussi", inconnu.ok, inconnu.raison || "");
    const seul = validerIntention(e, assaut(["M2"]));
    verifier("seulement des morts : refusé (rien à frapper)", !seul.ok, seul.raison);
    verifier("un allié reste refusé", !validerIntention(enTete(monde(5), "S", "CLASSE_ASSAUT_MORTEL"), assaut(["M1", "A"])).ok);
}

console.log("\n2. L'ÉCRAN : LA ZONE NE RAMASSE PAS LES COMBATTANTS À TERRE");
{
    const src = fs.readFileSync(new URL('../moteur_effets.js', import.meta.url), 'utf8');
    const boucle = src.slice(src.indexOf("const touchesFrappe = [], touchesSoutien = [];"));
    const corps = boucle.slice(0, boucle.indexOf("touchesFrappe.push(idToken)"));
    verifier("la boucle de zone écarte estCombattantMort", /estCombattantMort\(idToken\)\) continue/.test(corps));
}

console.log("\n3. UN REFUS REVIENT AU POSTE QUI A DEMANDÉ");
{
    const base = new Map(), ecoutes = [];
    const cle = (c) => c.join("/");
    const copie = (v) => v == null ? v : JSON.parse(JSON.stringify(v));
    const prevenir = (k) => ecoutes.filter(x => x.k === k).forEach(x => x.rappel(copie(base.get(k)) || null));
    const io = {
        async lire(c) { return copie(base.get(cle(c))) || null; },
        async lister() { return []; },
        async lot(ops) {
            for (const o of ops) {
                const k = cle(o.chemin);
                if (o.op === "update") base.set(k, { ...(base.get(k) || {}), ...copie(o.data) });
                else if (o.op === "set") base.set(k, copie(o.data));
                else base.delete(k);
                prevenir(k);
            }
        },
        async transaction() { return false; },
        ecouterDoc(c, rappel) {
            const x = { k: cle(c), rappel }; ecoutes.push(x);
            return () => { const i = ecoutes.indexOf(x); if (i >= 0) ecoutes.splice(i, 1); };
        },
        ecouterCollection() { return () => {}; }
    };
    const refus = [];
    const regime = creerRegime({
        io, idPartie: "G", poste: "P_01", battementMs: 0,
        programmer: (fn, ms) => setTimeout(fn, ms || 0), arreterMinuteur: (id) => clearTimeout(id),
        surRefus: (intention, raison) => refus.push([intention.type, intention.acteur, raison])
    });
    const id = await regime.demanderTechniqueClasse("S", "CLASSE_ASSAUT_MORTEL", null, ["M1", "M2"]);
    const chemin = cle(CHEMINS.intention("G", id));
    verifier("le poste écoute sa demande", ecoutes.some(x => x.k === chemin));
    // Le cerveau (ailleurs) la refuse, comme depot.refuser le fait.
    await io.lot([{ op: "update", chemin: CHEMINS.intention("G", id),
                    data: { traitee: true, refus: "Assaut mortel : MONSTRE_x n'est pas un ennemi valable" } }]);
    verifier("surRefus est appelé, avec la raison", refus.length === 1 && refus[0][0] === "classe" && refus[0][1] === "S"
             && /pas un ennemi valable/.test(refus[0][2]), JSON.stringify(refus));
    verifier("et l'écoute est refermée", !ecoutes.some(x => x.k === chemin));

    const id2 = await regime.demanderFinDeTour("S");
    await io.lot([{ op: "update", chemin: CHEMINS.intention("G", id2), data: { traitee: true } }]);
    verifier("une demande acceptée ne déclenche rien", refus.length === 1);
    verifier("…et son écoute est refermée aussi", ecoutes.length === 0, `(${ecoutes.length} écoute(s))`);
    regime.arreter && regime.arreter();
}

console.log("\n4. LE JEU BRANCHE LE REFUS : LE REPÈRE TOMBE, LE JOUEUR LIT POURQUOI");
{
    const reg = fs.readFileSync(new URL('../regime_cerveau.js', import.meta.url), 'utf8');
    const bloc = reg.slice(reg.indexOf("surRefus: (intention, raison) => {"));
    const corps = bloc.slice(0, bloc.indexOf("},"));
    verifier("surRefus fait tomber le repère « demande en cours »", /regimeAnnulerDemande\(\)/.test(corps));
    verifier("…et prévient l'écran", /surRefusIntention\(intention, raison\)/.test(corps));
    verifier("regimeAnnulerDemande vide le repère", /window\.regimeAnnulerDemande = function\(\) \{ demandeEnVol = ""; \}/.test(reg));
    const combat = fs.readFileSync(new URL('../combat.js', import.meta.url), 'utf8');
    const f = combat.slice(combat.indexOf("window.surRefusIntention = function"));
    const fn = f.slice(0, f.indexOf("\n};"));
    verifier("l'écran affiche la raison au-dessus du pion", /afficherMessageFlottantHex/.test(fn) && /Refusé/.test(fn));
    verifier("…et redessine le bouton de fin de tour", /actualiserBoutonFinTour/.test(fn));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
