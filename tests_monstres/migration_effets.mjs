// LE BOUTON « INSTALLER TÉNÈBRES » — ET RIEN D'AUTRE.
//
// Nico : « Mettre la BDD à jour, j'ai modifié des trucs manuellement, ça va pas
// m'écraser tous mes changements ? Fais en sorte que ça marche que sur
// Ténèbres. » Il avait raison de s'inquiéter : le bouton réécrivait encore les
// textes de huit effets et en supprimait un. Sur la base réelle du 30 septembre,
// il aurait remplacé la note de la Brûlure retouchée à la main (« 8% de dégâts
// physiques des PV max ») et rempli celle de la Confusion.
//
// Le bouton ne sait plus que CRÉER un effet absent (Ténèbres). Ce banc fait
// tourner le vrai code (app.js) sur une FAUSSE base en mémoire, qui porte des
// retouches faites à la main, et vérifie :
//
//   UN.   Il ne vise que Ténèbres.
//   DEUX. Il le crée, et ne touche à AUCUN autre effet (ni écriture, ni
//         suppression) : la base d'après est celle d'avant, plus Ténèbres.
//   TROIS. Un Ténèbres déjà présent — même retouché — n'est jamais réécrit ;
//         relancer le bouton n'écrit rien.
//   QUATRE. Une panne se dit, sans rien casser.
import fs from 'fs';

const src = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8');

function bloc(debut, finExclue) {
    const i = src.indexOf(debut);
    const j = src.indexOf(finExclue, i);
    if (i < 0 || j < 0) throw new Error("bloc introuvable : " + debut);
    return src.slice(i, j);
}
// Le VRAI tableau et la VRAIE fonction, extraits ligne pour ligne.
const SRC_MIGRATION = bloc('window.MIGRATION_EFFETS = [', 'window.chargerCacheEffetsBDD = async function');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// La base réelle, sans Ténèbres, avec les retouches que Nico fait à la main.
const EFFETS_REELS = JSON.parse(fs.readFileSync('/home/user/Ivalis/tests_monstres/effets_reels.json', 'utf-8'));
delete EFFETS_REELS.EFF_TENEBRES;
const RETOUCHEE = JSON.parse(JSON.stringify(EFFETS_REELS));
RETOUCHEE.EFF_BRULE = { ...RETOUCHEE.EFF_BRULE, Notes: "-50% de soins reçus, et 8% de dégats physique des pv max de la cible" };
RETOUCHEE.EFF_CONFUSION = { ...RETOUCHEE.EFF_CONFUSION, Notes: "" };
RETOUCHEE.EFF_ETOURDIT = { ...RETOUCHEE.EFF_ETOURDIT, Pourcent_Base: 15, Notes: "réglé à la main" };
RETOUCHEE.EFF_PARALYSIE = { Nom: "Paralysie", Notes: "un effet que Nico a remis" };
RETOUCHEE.EFF_REPLI = { ...(RETOUCHEE.EFF_REPLI || {}), Nom: "Repli", Valeur: 4 };
RETOUCHEE.EFF_AVEUGLEMENT = { ...(RETOUCHEE.EFF_AVEUGLEMENT || {}), Nom: "Aveuglement", Notes: "à ma façon" };

// Un Firestore de papier : il compte ses écritures, et sait tomber en panne.
function fausseBase(donnees, { panneSur = null } = {}) {
    const base = JSON.parse(JSON.stringify(donnees));
    const journal = { lectures: 0, ecritures: [], suppressions: [] };
    const fenetre = { alert: () => {}, document: { getElementById: () => null }, console: { log: () => {} } };
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
        deleteDoc: async (ref) => { journal.suppressions.push(ref.id); delete base[ref.id]; }
    };
    const fn = new Function('window', 'document', 'alert', 'console', 'db', 'doc',
                            'getDoc', 'setDoc', 'deleteDoc', SRC_MIGRATION + '\nreturn window;');
    const w = fn(fenetre, fenetre.document, fenetre.alert, fenetre.console,
                 ctx.db, ctx.doc, ctx.getDoc, ctx.setDoc, ctx.deleteDoc);
    return { base, journal, lancer: () => w.appliquerMigrationEffets(), table: w.MIGRATION_EFFETS, w };
}

const sansTenebres = (b) => { const c = { ...b }; delete c.EFF_TENEBRES; return c; };

console.log("\n=========================================================");
console.log("  LE BOUTON « INSTALLER TÉNÈBRES »");
console.log("=========================================================\n");

// =========================================================================
console.log("1. IL NE VISE QUE TÉNÈBRES");
// =========================================================================
{
    const { table } = fausseBase(RETOUCHEE);
    verifier("un seul effet dans la table : EFF_TENEBRES", table.length === 1 && table[0].id === "EFF_TENEBRES",
             table.map(r => r.id).join(", "));
    verifier("aucune règle de modification ni de suppression",
             table.every(r => !r.supprimer && !r.majSiPresent), JSON.stringify(table.map(r => Object.keys(r))));
    verifier("le code ne sait plus supprimer (aucun deleteDoc)", !/deleteDoc\(/.test(SRC_MIGRATION));
    verifier("ni fusionner dans un effet existant (aucun merge)", !/merge:\s*true/.test(SRC_MIGRATION));
    const bouton = fs.readFileSync('/home/user/Ivalis/index.html', 'utf-8')
        .match(/<button id="btn-migration-effets"[^>]*>([^<]*)<\/button>/);
    verifier("le bouton dit ce qu'il fait : « Installer Ténèbres »", !!bouton && bouton[1] === "Installer Ténèbres",
             bouton ? bouton[1] : "(introuvable)");
}

// =========================================================================
console.log("\n2. IL CRÉE TÉNÈBRES, ET NE TOUCHE À RIEN D'AUTRE");
// =========================================================================
{
    const m = fausseBase(RETOUCHEE);
    const resultat = await m.lancer();
    const ten = m.base.EFF_TENEBRES || {};
    verifier("Ténèbres est créé : 2 pts, Intelligence, 3, racine, réservé au Nécromancien niv. 5",
             resultat.faits.some(f => /EFF_TENEBRES — créé/.test(f)) && ten.Nom === "Ténèbres"
             && ten.Cout_PT === "2" && ten.Modificateur === "INTELLIGENCE" && ten.Valeur === 3
             && ten.Type_Mecanique === "Action/Global" && ten.Classe === "Nécromancien" && ten.Niveau_Requis === 5,
             JSON.stringify(ten).slice(0, 140));
    verifier("une seule écriture, sur Ténèbres", m.journal.ecritures.length === 1
             && m.journal.ecritures[0].id === "EFF_TENEBRES", JSON.stringify(m.journal.ecritures.map(e => e.id)));
    verifier("aucune suppression (la Paralysie remise à la main reste)", m.journal.suppressions.length === 0
             && !!m.base.EFF_PARALYSIE);
    verifier("la base d'après = celle d'avant, plus Ténèbres, au caractère près",
             JSON.stringify(sansTenebres(m.base)) === JSON.stringify(RETOUCHEE));
    verifier("la note de la Brûlure retouchée à la main est intacte",
             m.base.EFF_BRULE.Notes === "-50% de soins reçus, et 8% de dégats physique des pv max de la cible");
    verifier("la note vide de la Confusion reste vide", m.base.EFF_CONFUSION.Notes === "");
    verifier("les réglages de l'Étourdi, du Repli, de l'Aveuglement aussi",
             m.base.EFF_ETOURDIT.Pourcent_Base === 15 && m.base.EFF_REPLI.Valeur === 4
             && m.base.EFF_AVEUGLEMENT.Notes === "à ma façon");
}

// =========================================================================
console.log("\n3. UN TÉNÈBRES DÉJÀ LÀ N'EST JAMAIS RÉÉCRIT");
// =========================================================================
{
    const regle = { Nom: "Ténèbres", Valeur: 4, Cout_PT: "3", Notes: "Nico l'a rééquilibré" };
    const m = fausseBase({ ...RETOUCHEE, EFF_TENEBRES: regle });
    const r = await m.lancer();
    verifier("retouché à la main : laissé tel quel", JSON.stringify(m.base.EFF_TENEBRES) === JSON.stringify(regle)
             && r.inchanges.some(x => /EFF_TENEBRES/.test(x)), JSON.stringify(m.base.EFF_TENEBRES));
    verifier("et rien n'est écrit", m.journal.ecritures.length === 0 && r.faits.length === 0);

    const deux = fausseBase(RETOUCHEE);
    await deux.lancer();
    const avant = deux.journal.ecritures.length;
    const second = await deux.lancer();
    verifier("relancé : pas une écriture de plus", deux.journal.ecritures.length === avant && second.faits.length === 0,
             `(${deux.journal.ecritures.length - avant} de plus)`);
}

// =========================================================================
console.log("\n4. UNE PANNE SE DIT, SANS RIEN CASSER");
// =========================================================================
{
    const m = fausseBase(RETOUCHEE, { panneSur: "EFF_TENEBRES" });
    const r = await m.lancer();
    verifier("la panne est nommée dans le rapport", r.rates.some(x => /EFF_TENEBRES/.test(x)), JSON.stringify(r.rates));
    verifier("et la base n'a pas bougé", JSON.stringify(m.base) === JSON.stringify(RETOUCHEE));
}

// =========================================================================
console.log("\n5. EN ATTENDANT LE BOUTON, LE JEU A SA COPIE");
// =========================================================================
{
    const { w } = fausseBase(RETOUCHEE);
    const cache = JSON.parse(JSON.stringify(RETOUCHEE));
    w.completerEffetsDeSecours(cache);
    verifier("le cache reçoit Ténèbres s'il manque", cache.EFF_TENEBRES && cache.EFF_TENEBRES.Nom === "Ténèbres");
    verifier("et rien d'autre ne change dans le cache", JSON.stringify(sansTenebres(cache)) === JSON.stringify(RETOUCHEE));
    const avecLeSien = { ...RETOUCHEE, EFF_TENEBRES: { Nom: "Ténèbres", Valeur: 4 } };
    w.completerEffetsDeSecours(avecLeSien);
    verifier("une fois dans la base, c'est la version de la base qui compte", avecLeSien.EFF_TENEBRES.Valeur === 4);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
