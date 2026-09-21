// LA RAFALE DE QUOTA QUI A PLANTÉ UN COMBAT.
//
// Une vraie trace de combat a montré Systeme_Parties/<id> recevoir, à la même
// poignée de secondes et depuis le MÊME poste, des écritures venues de deux
// endroits différents — une carte choisie / un repos long (combat.js) et un
// verrou d'IA repris (monstres_ia.js) — pendant que Firestore rendait
// « resource-exhausted » (quota d'écritures dépassé, HTTP 429). Chacune des
// deux boucles retentait de son côté sans savoir que l'autre tapait sur le
// même document au même instant, et la rafale ne s'est jamais calmée : le
// combat est resté planté plus d'une minute.
//
// Ce banc rejoue les DEUX vraies fonctions sur le MÊME faux Firestore et
// vérifie qu'un coupe-circuit partagé (window.PAUSE_ECRITURE_PARTIE) les fait
// attendre ENSEMBLE dès qu'une seule des deux essuie un resource-exhausted,
// plutôt que de foncer chacune dans son coin.
import fs from 'fs';
import { SRC_MODIFIER_PARTIE } from './transaction_partie.mjs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(66)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// Un faux Firestore SÉRIALISÉ (comme le vrai) où l'on scripte, essai par
// essai, si la transaction réussit ou rend un code d'erreur donné. Le
// document de partie ET celui du verrou d'IA vivent dans le même faux
// service, distingués par le nombre de segments du chemin — exactement comme
// le vrai Firestore les distinguerait.
function creerFirestoreScripte(script) {
  let compteur = 0;
  const attempts = [];
  let file = Promise.resolve();
  const partieDoc = {};
  const verrouDoc = { valeur: null };
  const lire = (ref) => (ref && ref.estVerrou) ? verrouDoc.valeur : partieDoc;
  const doc = (_db, ...seg) => ({ estVerrou: seg.length > 3 });
  const getDoc = async (ref) => ({ exists: () => !!lire(ref), data: () => structuredClone(lire(ref)) });
  const updateDoc = async (ref, data) => {
    if (ref && ref.estVerrou) verrouDoc.valeur = { ...(verrouDoc.valeur || {}), ...structuredClone(data) };
    else Object.assign(partieDoc, structuredClone(data));
  };
  const runTransaction = async (_db, fn) => {
    const precedent = file;
    let debloquer;
    file = new Promise(r => debloquer = r);
    await precedent;
    const num = ++compteur;
    attempts.push({ num, t: Date.now() });
    try {
      const echec = script[num - 1];
      if (echec) { const e = new Error(echec); e.code = echec; throw e; }
      return await fn({
        get: async (ref) => ({ exists: () => !!lire(ref), data: () => structuredClone(lire(ref)) }),
        update: (ref, data) => updateDoc(ref, data),
        set: (ref, data) => { if (ref && ref.estVerrou) verrouDoc.valeur = structuredClone(data); }
      });
    } finally { debloquer(); }
  };
  return { doc, getDoc, updateDoc, runTransaction, attempts, partieDoc };
}

// UN SEUL POSTE, avec les deux vrais modules posés dessus et PARTAGEANT le
// même faux Firestore — c'est justement le scénario de la trace : un seul
// navigateur qui joue la carte ET fait tourner l'IA.
function construirePoste(script) {
  const fst = creerFirestoreScripte(script);
  const w = {};
  w.ID_PARTIE_COURANTE = "GAME_TEST";
  w.PLATEAU_VTT = { getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }) };
  w.TOKENS_VTT_DATA = {}; w.PERSOS_PARTIE = []; w.MONSTRES_PARTIE = [];
  w.CACHE_COMPETENCES_GLOBAL = {}; w.ZONES_PERSISTANTES = {}; w.EFFETS_BDD_CACHE = {};
  w.PARTIE_DATA = fst.partieDoc;
  w.estCombattantMort = () => false;
  w.estMonstre = () => true;
  w.finDeTourCombat = async () => {};
  w.hexDistanceVTT = () => 0; w.calculerCheminVTT = () => [];

  // combat.js : window.modifierPartieOuEchec, et le coupe-circuit avec lui.
  new Function('window', 'db', 'doc', 'runTransaction', SRC_MODIFIER_PARTIE)(w, {}, fst.doc, fst.runTransaction);

  // monstres_ia.js : reclamerVerrouIA, privée au module — on l'expose comme verrou.mjs le fait déjà.
  const srcIA = fs.readFileSync('/home/user/Ivalis/monstres_ia.js', 'utf-8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '')
    .replace(/await pause\(\d+\);/g, '');
  const fabriqueIA = new Function('window', 'db', 'doc', 'getDoc', 'updateDoc', 'runTransaction',
    srcIA + '\n; return { reclamer: (cle) => reclamerVerrouIA(cle) };');
  const apiIA = fabriqueIA(w, {}, fst.doc, fst.getDoc, fst.updateDoc, fst.runTransaction);

  return { w, fst, reclamer: apiIA.reclamer };
}

console.log("1. LE COUPE-CIRCUIT SE LÈVE QUAND LE QUOTA EST DÉPASSÉ, PAS SUR UNE SIMPLE BOUSCULADE");
{
  // Premier essai : resource-exhausted. Deuxième (par défaut, non scripté) : réussite.
  const p = construirePoste(["resource-exhausted"]);
  const debut = Date.now();
  const res = await p.w.modifierPartieOuEchec(() => ({ maj: { X: 1 } }));
  const duree = Date.now() - debut;

  verifier("l'écriture finit par réussir", res.ok === true);
  verifier("elle a attendu au moins une seconde avant de retenter (le coupe-circuit, pas un simple rebond)",
           duree >= 950, `${duree} ms`);
  verifier("deux essais exactement — pas une rafale de retentes", p.fst.attempts.length === 2,
           String(p.fst.attempts.length));
  verifier("le coupe-circuit est ensuite retombé (plus de pause en cours)",
           p.w.PAUSE_ECRITURE_PARTIE <= Date.now());
}

console.log("\n2. LE COUPE-CIRCUIT EST PARTAGÉ ENTRE LA CARTE JOUÉE ET LE VERROU D'IA");
{
  // Seul le tout premier essai (celui de la carte jouée, côté combat.js) rend
  // resource-exhausted. Le verrou d'IA, lui, ne voit JAMAIS d'erreur scriptée :
  // s'il attend quand même, c'est bien qu'il a vu le coupe-circuit levé par
  // l'autre fonction, pas qu'il a rencontré sa propre panne.
  const p = construirePoste(["resource-exhausted"]);

  const promesseCarte = p.w.modifierPartieOuEchec(() => ({ maj: { X: 1 } }));
  // On laisse le premier essai essuyer son échec et lever le coupe-circuit
  // avant de lancer le verrou d'IA — exactement comme dans la trace, où les
  // deux écritures se chevauchent à quelques millisecondes près.
  await new Promise(r => setTimeout(r, 60));
  verifier("le coupe-circuit est levé après l'échec de la carte jouée",
           p.w.PAUSE_ECRITURE_PARTIE > Date.now());
  const paletteAuMoment = p.w.PAUSE_ECRITURE_PARTIE;

  const promesseVerrou = p.reclamer("preparation|1");
  const [resCarte, resVerrou] = await Promise.all([promesseCarte, promesseVerrou]);

  verifier("la carte finit quand même par s'écrire", resCarte.ok === true);
  verifier("le verrou d'IA finit quand même par être pris", resVerrou === true);

  // Tout essai après le tout premier (l'échec scripté) doit tomber APRÈS la
  // levée du coupe-circuit — qu'il vienne de la carte qui retente ou du verrou
  // qui s'y prenait pour la première fois.
  const apresLePremierEchec = p.fst.attempts.filter(a => a.num >= 2);
  const aucunPendantLaPause = apresLePremierEchec.every(a => a.t >= paletteAuMoment - 5);
  verifier("aucun des deux n'a tapé le document pendant la pause du coupe-circuit",
           aucunPendantLaPause,
           JSON.stringify(apresLePremierEchec.map(a => a.t - paletteAuMoment)));
}

console.log(`\n${echecs === 0 ? "TOUS LES CONTRÔLES PASSENT" : echecs + " CONTRÔLE(S) EN ÉCHEC"}`);
process.exit(echecs === 0 ? 0 : 1);
