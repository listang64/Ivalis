// Toute modification partagée du document de partie passe par window.modifierPartie
// (combat.js), qui sérialise lecture et écriture dans une transaction Firestore.
// Les bancs qui isolent une fonction du moteur doivent la poser aussi — en
// reprenant le VRAI code, avec leur propre runTransaction : c'est justement la
// sérialisation qu'on veut voir à l'œuvre.
import fs from 'fs';

const combat = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
const lignes = combat.split('\n');
function fonctionDeCombat(marqueur) {
  const d = lignes.findIndex(l => l.startsWith(marqueur));
  if (d < 0) throw new Error(marqueur + " introuvable dans combat.js");
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === '};') { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}

// Même principe, mais jusqu'à une ligne de fin donnée : le coupe-circuit
// enchaîne une affectation, une fonction fléchée ET une fonction classique
// (qui, elle, se termine par une simple accolade sans point-virgule).
function blocDeCombat(marqueurDebut, ligneFin) {
  const d = lignes.findIndex(l => l.startsWith(marqueurDebut));
  if (d < 0) throw new Error(marqueurDebut + " introuvable dans combat.js");
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === ligneFin) { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}

// Le contrat partagé du document de partie, d'un seul tenant : la transaction
// ET le verdict « tout le monde a-t-il joué ? ». Les deux vont ensemble — les
// transactions du combat s'appuient dessus, et un banc qui poserait l'une sans
// l'autre verrait toutes ses écritures échouer en silence.
// Le verdict seul, pour les bancs qui posent la transaction ailleurs (il ne
// dépend de rien : ni base, ni réseau, ni liste locale — c'est tout l'intérêt).
export const SRC_VERDICT_TOUR = [
  'window.combattantsAttendus = function',
  'window.toutLeMondeAJoue = function',
  'window.avecCarteJouee = function'
].map(fonctionDeCombat).join('\n\n');

// Le coupe-circuit partagé (voir combat.js) : quand Systeme_Parties/<id> rend
// resource-exhausted, plus personne — modifierPartieOuEchec y compris — ne
// retente avant la fin de la pause. modifierPartieOuEchec l'appelle avant
// chaque essai : le poser sans lui laisserait ces essais tourner à vide.
export const SRC_COUPE_CIRCUIT_PARTIE = blocDeCombat(
  'window.PAUSE_ECRITURE_PARTIE = window.PAUSE_ECRITURE_PARTIE || 0;', '}'
);

// modifierPartie n'est plus qu'une façade : tout le travail — et surtout les
// reprises quand une écriture concurrente fait échouer la transaction — est
// dans modifierPartieOuEchec, qui rend { ok, resultat }. Les deux voyagent
// ensemble : poser la façade sans son moteur, c'est un banc qui plante.
export const SRC_MODIFIER_PARTIE = SRC_VERDICT_TOUR + '\n\n'
  + SRC_COUPE_CIRCUIT_PARTIE + '\n\n'
  + fonctionDeCombat('window.modifierPartieOuEchec = async function') + '\n\n'
  + fonctionDeCombat('window.modifierPartie = async function');

// Un faux Firestore transactionnel : les transactions d'un même document sont
// jouées l'une après l'autre, comme le vrai service le garantit.
export function creerPartiePartagee(docInitial) {
  const partagee = { doc: structuredClone(docInitial), file: Promise.resolve(), transactions: 0 };
  const runTransaction = async (_db, fn) => {
    const precedent = partagee.file;
    let debloquer;
    partagee.file = new Promise(r => debloquer = r);
    await precedent;
    partagee.transactions++;
    try {
      return await fn({
        get: async () => ({ exists: () => true, data: () => structuredClone(partagee.doc) }),
        update: (_r, data) => Object.assign(partagee.doc, structuredClone(data))
      });
    } finally { debloquer(); }
  };
  return { partagee, runTransaction };
}

// Installe window.modifierPartie sur un poste, avec le Firestore partagé fourni.
export function poserModifierPartie(w, runTransaction) {
  new Function('window', 'db', 'doc', 'runTransaction', SRC_MODIFIER_PARTIE)(
    w, {}, () => ({}), runTransaction);
}
