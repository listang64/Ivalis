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
    const attendus = ["EFF_BOUCLIER_MAGIQUE", "EFF_BRULE", "EFF_DUREE_ETALEMENT_DEGATS", "EFF_ELECTRIFIE",
                      "EFF_ETOURDIT", "EFF_GLACE", "EFF_PARALYSIE", "EFF_POUSSEE", "EFF_REPLI", "EFF_AVEUGLEMENT"].sort();
    verifier("les dix effets concernés, ni plus ni moins",
             JSON.stringify(vises) === JSON.stringify(attendus), vises.join(", "));
    // Ceux qu'on modifie existent ; ceux qu'on crée (le Repli), pas encore.
    // (La Paralysie, elle, est à supprimer : déjà partie de la vraie base, c'est normal.)
    verifier("chaque effet modifié existe vraiment dans la base",
             table.filter(r => !r.creer && !r.supprimer).every(r => EFFETS_REELS[r.id] !== undefined),
             table.filter(r => !r.creer && !r.supprimer && !EFFETS_REELS[r.id]).map(r => r.id).join(", "));
    verifier("et les effets créés (Repli, Aveuglement) n'y sont pas encore",
             table.filter(r => r.creer).map(r => r.id).join() === "EFF_REPLI,EFF_AVEUGLEMENT"
             && EFFETS_REELS.EFF_REPLI === undefined && EFFETS_REELS.EFF_AVEUGLEMENT === undefined);
}

// =========================================================================
console.log("\n2. UN PASSAGE : LA BASE DIT CE QUE LE MOTEUR FAIT");
// =========================================================================
{
    // Une base où traîne encore la Paralysie, pour voir la suppression se faire.
    const m = fausseBase({ ...EFFETS_REELS, EFF_PARALYSIE: EFFETS_REELS.EFF_PARALYSIE || { Nom: "Paralysie" } });
    const resultat = await m.lancer();

    verifier("la Paralysie disparaît de la base",
             m.base.EFF_PARALYSIE === undefined && m.journal.suppressions.includes("EFF_PARALYSIE"));

    verifier("l'Étourdi annonce -30% et 20% d'échec",
             /-30%/.test(m.base.EFF_ETOURDIT.Notes) && /20%/.test(m.base.EFF_ETOURDIT.Notes),
             m.base.EFF_ETOURDIT.Notes);
    verifier("le Glacé annonce ses 20% de dégâts PHYSIQUES en plus (pas la magie)",
             /20% de dégâts PHYSIQUES en plus/.test(m.base.EFF_GLACE.Notes), m.base.EFF_GLACE.Notes);
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
    // L'ÉQUILIBRAGE DE NICO N'EST PAS TOUCHÉ : le coût de l'Étalement (« Cout /
    // 1.2 » aujourd'hui) et le pourcentage du Bouclier restent ceux du grimoire.
    verifier("le coût de l'Étalement reste celui du grimoire",
             m.base.EFF_DUREE_ETALEMENT_DEGATS.Cout_PT === EFFETS_REELS.EFF_DUREE_ETALEMENT_DEGATS.Cout_PT,
             m.base.EFF_DUREE_ETALEMENT_DEGATS.Cout_PT);
    verifier("la Valeur et le texte du Bouclier restent ceux du grimoire",
             m.base.EFF_BOUCLIER_MAGIQUE.Valeur === EFFETS_REELS.EFF_BOUCLIER_MAGIQUE.Valeur
             && m.base.EFF_BOUCLIER_MAGIQUE.Effet_Base === EFFETS_REELS.EFF_BOUCLIER_MAGIQUE.Effet_Base,
             `${m.base.EFF_BOUCLIER_MAGIQUE.Valeur} / ${m.base.EFF_BOUCLIER_MAGIQUE.Effet_Base}`);
    verifier("et dit que rien ne tombe au lancement",
             /rien au lancement/.test(m.base.EFF_DUREE_ETALEMENT_DEGATS.Effet_Base),
             m.base.EFF_DUREE_ETALEMENT_DEGATS.Effet_Base);

    // LE REPLI NAÎT, ENTIER : tout ce que la Forge et le moteur lisent.
    const repli = m.base.EFF_REPLI || {};
    verifier("le Repli est créé dans la base", !!m.base.EFF_REPLI && resultat.faits.some(f => /EFF_REPLI — créé/.test(f)),
             resultat.faits.join(" | "));
    verifier("avec 3 cases, 60 %, un seul cran, coût 6, Dextérité",
             repli.Nom === "Repli" && repli.Valeur === 3 && repli.Pourcent_Base === 60 && repli.Pourcent_Max === 60
             && repli.Cout_PT === "6" && repli.Modificateur === "DEXTÉRITÉ" && repli.Type_Mecanique === "Action/Global",
             JSON.stringify(repli));
    verifier("et le texte que la Forge affiche",
             /3 cases après avoir attaqué/.test(repli.Effet_Base || "") && /60%/.test(repli.Effet_Base || ""));

    const aveu = m.base.EFF_AVEUGLEMENT || {};
    verifier("l'Aveuglement est créé : 10 %, max 70 %, 2 tours, coût 1, Dextérité",
             resultat.faits.some(f => /EFF_AVEUGLEMENT — créé/.test(f)) && aveu.Nom === "Aveuglement"
             && aveu.Pourcent_Base === 10 && aveu.Pourcent_Max === 70 && aveu.Tours === 2 && aveu.Cout_PT === "1"
             && aveu.Modificateur === "DEXTÉRITÉ" && aveu.Type_Mecanique === "Physique", JSON.stringify(aveu));
    verifier("et ses notes disent la règle du noir (3 cases fixes)", /3 hexagones/.test(aveu.Notes || "")
             && /fixés/.test(aveu.Notes || "") && /zone/.test(aveu.Notes || ""));

    // Fiche déjà créée (bouton déjà pressé, avec l'ancienne règle à 4 cases,
    // et un pourcentage retouché à la main) : seules les Notes sont remises.
    const deja = fausseBase({ ...EFFETS_REELS, EFF_AVEUGLEMENT: { Nom: "Aveuglement", Pourcent_Base: 15,
      Notes: "Aveuglement : 4 hexagones autour de la cible sont dans le noir." } });
    await deja.lancer();
    verifier("fiche déjà là : les Notes passent à 3 cases, le réglage à la main reste",
             /3 hexagones/.test(deja.base.EFF_AVEUGLEMENT.Notes) && deja.base.EFF_AVEUGLEMENT.Pourcent_Base === 15,
             JSON.stringify(deja.base.EFF_AVEUGLEMENT));

    // Un Repli déjà réglé à la main (4 cases, 50 %) n'est jamais réécrit.
    const regle = fausseBase({ ...EFFETS_REELS, EFF_REPLI: { Nom: "Repli", Valeur: 4, Pourcent_Base: 50 } });
    const rRegle = await regle.lancer();
    verifier("un Repli déjà réglé dans le grimoire n'est pas écrasé",
             regle.base.EFF_REPLI.Valeur === 4 && regle.base.EFF_REPLI.Pourcent_Base === 50
             && rRegle.inchanges.includes("EFF_REPLI (déjà présent)"), JSON.stringify(regle.base.EFF_REPLI));

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
    verifier("en listant ce qui était déjà à jour", second.inchanges.length === 10,
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
