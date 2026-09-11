// METTRE LA BASE AU NIVEAU DES RÈGLES DU CODE — ET SEULEMENT CE QU'IL FAUT.
//
// Un effet vit à DEUX endroits : sa mécanique dans le moteur, et sa fiche dans
// la base (Combat_Effets) — les chiffres, le texte que le joueur lit, le coût.
// Quand une règle change, les deux doivent bouger ensemble, sans quoi la Forge
// annonce une chose et le combat en fait une autre.
//
// Le bouton « Mettre la BDD à jour » (app.js) fait la moitié « base ». Ce banc
// le fait tourner sur une FAUSSE base en mémoire — le vrai code, un Firestore
// de papier — et vérifie les trois choses qui comptent :
//
//   UN. Il vise les bons effets, avec les bonnes valeurs (celles des règles
//       qu'on vient d'écrire dans le moteur, pas d'autres).
//   DEUX. Il est SANS DANGER À RELANCER : la seconde fois, il n'écrit rien.
//         Un bouton qu'on n'ose pas cliquer deux fois n'est pas un outil.
//   TROIS. Un effet manquant ou un réseau qui lâche ne fait pas tomber le
//         reste : la migration continue et DIT ce qui a raté.
import fs from 'fs';

const src = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8');

function bloc(debut, finExclue) {
    const i = src.indexOf(debut);
    const j = src.indexOf(finExclue, i);
    if (i < 0 || j < 0) throw new Error("bloc introuvable : " + debut);
    return src.slice(i, j);
}
// Le VRAI tableau de migration et la VRAIE fonction, extraits ligne pour ligne.
const SRC_MIGRATION = bloc('window.MIGRATION_EFFETS = [', 'window.chargerCacheEffetsBDD = async function');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// L'état réel de la base avant la migration : le vrai instantané Firestore.
const EFFETS_REELS = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/effets_reels.json', 'utf-8'));

// Un Firestore de papier : il compte ses écritures, et sait tomber en panne.
function fausseBase(donnees, { panneSur = null } = {}) {
    const base = JSON.parse(JSON.stringify(donnees));
    const journal = { lectures: 0, ecritures: [], suppressions: [] };
    const fenetre = {
        alert: () => {},
        document: { getElementById: () => null },
        console: { log: () => {} }
    };
    const ctx = {
        db: {},
        doc: (_db, coll, id) => ({ coll, id }),
        getDoc: async (ref) => {
            journal.lectures++;
            const d = base[ref.id];
            return { exists: () => d !== undefined, data: () => d };
        },
        setDoc: async (ref, champs) => {
            if (panneSur === ref.id) throw new Error("réseau coupé");
            journal.ecritures.push({ id: ref.id, champs });
            base[ref.id] = { ...(base[ref.id] || {}), ...champs };
        },
        deleteDoc: async (ref) => {
            if (panneSur === ref.id) throw new Error("réseau coupé");
            journal.suppressions.push(ref.id);
            delete base[ref.id];
        }
    };

    const fn = new Function('window', 'document', 'alert', 'console', 'db', 'doc',
                            'getDoc', 'setDoc', 'deleteDoc',
                            SRC_MIGRATION + '\nreturn window;');
    const w = fn(fenetre, fenetre.document, fenetre.alert, fenetre.console,
                 ctx.db, ctx.doc, ctx.getDoc, ctx.setDoc, ctx.deleteDoc);
    return { base, journal, lancer: () => w.appliquerMigrationEffets(), table: w.MIGRATION_EFFETS };
}

console.log("\n=========================================================");
console.log("  LA MISE À JOUR DE LA BASE DES EFFETS");
console.log("=========================================================\n");

// =========================================================================
console.log("1. ELLE VISE LES EFFETS QUE NICO A DEMANDÉ DE CHANGER");
// =========================================================================
{
    const { table } = fausseBase(EFFETS_REELS);
    const vises = table.map(r => r.id).sort();
    const attendus = ["EFF_BRULE", "EFF_DUREE_ETALEMENT_DEGATS", "EFF_ELECTRIFIE",
                      "EFF_ETOURDIT", "EFF_GLACE", "EFF_PARALYSIE", "EFF_POUSSEE"].sort();
    verifier("les sept effets concernés, ni plus ni moins",
             JSON.stringify(vises) === JSON.stringify(attendus), vises.join(", "));
    verifier("et chacun existe vraiment dans la base",
             table.every(r => EFFETS_REELS[r.id] !== undefined),
             table.filter(r => !EFFETS_REELS[r.id]).map(r => r.id).join(", "));
}

// =========================================================================
console.log("\n2. UN PASSAGE : LA BASE DIT CE QUE LE MOTEUR FAIT");
// =========================================================================
{
    const m = fausseBase(EFFETS_REELS);
    const resultat = await m.lancer();

    verifier("la Paralysie disparaît de la base",
             m.base.EFF_PARALYSIE === undefined && m.journal.suppressions.includes("EFF_PARALYSIE"));

    verifier("l'Étourdi annonce -30% et 20% d'échec",
             /-30%/.test(m.base.EFF_ETOURDIT.Notes) && /20%/.test(m.base.EFF_ETOURDIT.Notes),
             m.base.EFF_ETOURDIT.Notes);
    verifier("le Glacé annonce ses 20% de dégâts subis en plus",
             /20% de dégâts en plus/.test(m.base.EFF_GLACE.Notes), m.base.EFF_GLACE.Notes);
    verifier("l'Électrifié annonce ses 20% de dégâts magiques",
             /20% de dégâts MAGIQUES/.test(m.base.EFF_ELECTRIFIE.Notes), m.base.EFF_ELECTRIFIE.Notes);
    verifier("la Brûlure annonce ses 3 dégâts par manche",
             /3 dégâts/.test(m.base.EFF_BRULE.Notes), m.base.EFF_BRULE.Notes);
    verifier("et garde ses -50% de soins reçus",
             /-50% de soins/.test(m.base.EFF_BRULE.Notes));
    verifier("la Poussée annonce sa bousculade (15% / -20% d'énergie)",
             /15% de chance de la bousculer/.test(m.base.EFF_POUSSEE.Effet_Base)
             && /20% d'énergie/.test(m.base.EFF_POUSSEE.Effet_Base),
             m.base.EFF_POUSSEE.Effet_Base);
    verifier("l'Étalement coûte désormais Cout / 1.3",
             m.base.EFF_DUREE_ETALEMENT_DEGATS.Cout_PT === "Cout / 1.3",
             m.base.EFF_DUREE_ETALEMENT_DEGATS.Cout_PT);
    verifier("et dit que rien ne tombe au lancement",
             /rien au lancement/.test(m.base.EFF_DUREE_ETALEMENT_DEGATS.Effet_Base),
             m.base.EFF_DUREE_ETALEMENT_DEGATS.Effet_Base);

    verifier("tout est rapporté, rien n'a raté", resultat.rates.length === 0,
             resultat.rates.join(" | "));

    // ET CE QU'ELLE NE TOUCHE PAS : un effet hors de la liste garde tout.
    verifier("un effet hors liste n'est pas effleuré",
             JSON.stringify(m.base.EFF_SOIN) === JSON.stringify(EFFETS_REELS.EFF_SOIN));
    verifier("et les champs non visés d'un effet migré non plus",
             m.base.EFF_GLACE.Pourcent_Base === EFFETS_REELS.EFF_GLACE.Pourcent_Base
             && m.base.EFF_GLACE.Tours === EFFETS_REELS.EFF_GLACE.Tours,
             JSON.stringify({ p: m.base.EFF_GLACE.Pourcent_Base, t: m.base.EFF_GLACE.Tours }));
}

// =========================================================================
console.log("\n3. RELANCÉE, ELLE N'ÉCRIT PLUS RIEN");
// =========================================================================
//  C'est ce qui rend le bouton cliquable sans angoisse. Une migration qui
//  réécrit à chaque clic use le quota et masque, dans le rapport, ce qui a
//  vraiment changé.
{
    const m = fausseBase(EFFETS_REELS);
    await m.lancer();
    const ecrituresPremierPassage = m.journal.ecritures.length;
    const suppressionsPremier = m.journal.suppressions.length;

    const second = await m.lancer();
    verifier("le premier passage a bien écrit", ecrituresPremierPassage > 0,
             String(ecrituresPremierPassage));
    verifier("le second n'écrit plus une seule fois",
             m.journal.ecritures.length === ecrituresPremierPassage,
             `(${m.journal.ecritures.length - ecrituresPremierPassage} de plus)`);
    verifier("et ne resupprime rien", m.journal.suppressions.length === suppressionsPremier);
    verifier("le rapport le dit clairement", second.faits.length === 0,
             JSON.stringify(second.faits));
    verifier("en listant ce qui était déjà à jour", second.inchanges.length === 7,
             JSON.stringify(second.inchanges));
}

// =========================================================================
console.log("\n4. UNE PANNE N'EMPORTE PAS LE RESTE, ET NE SE TAIT PAS");
// =========================================================================
{
    const m = fausseBase(EFFETS_REELS, { panneSur: "EFF_GLACE" });
    const resultat = await m.lancer();

    verifier("l'effet en panne est nommé dans le rapport",
             resultat.rates.some(r => /EFF_GLACE/.test(r)), JSON.stringify(resultat.rates));
    verifier("et les autres sont quand même passés",
             m.base.EFF_ETOURDIT.Notes !== EFFETS_REELS.EFF_ETOURDIT.Notes
             && m.base.EFF_PARALYSIE === undefined);

    // Un effet absent de la base : on le dit, on ne le crée pas de nulle part.
    const sansEtourdi = JSON.parse(JSON.stringify(EFFETS_REELS));
    delete sansEtourdi.EFF_ETOURDIT;
    const m2 = fausseBase(sansEtourdi);
    const r2 = await m2.lancer();
    verifier("un effet introuvable est signalé",
             r2.rates.some(r => /EFF_ETOURDIT.*introuvable/.test(r)), JSON.stringify(r2.rates));
    verifier("et n'est surtout pas inventé", m2.base.EFF_ETOURDIT === undefined);

    // Une Paralysie déjà supprimée : rien à faire, et c'est dit.
    const sansParalysie = JSON.parse(JSON.stringify(EFFETS_REELS));
    delete sansParalysie.EFF_PARALYSIE;
    const m3 = fausseBase(sansParalysie);
    const r3 = await m3.lancer();
    verifier("une Paralysie déjà partie ne fait pas d'erreur",
             r3.rates.length === 0 && r3.inchanges.some(s => /EFF_PARALYSIE/.test(s)),
             JSON.stringify(r3.inchanges));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
