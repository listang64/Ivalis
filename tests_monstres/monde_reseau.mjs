// UN FIRESTORE PARTAGÉ PAR PLUSIEURS POSTES.
// Ce que le vrai service garantit, et qu'il faut reproduire pour que le banc
// dise quelque chose : les transactions d'un même document sont sérialisées ;
// les écritures ordinaires ne le sont pas ; les notifications arrivent après
// un délai, différent d'un poste à l'autre, et plusieurs écritures rapprochées
// peuvent n'en produire qu'une seule (le poste ne voit alors que l'état final).
import fs from 'fs';

export function creerMonde(documents) {
  const monde = {
    docs: structuredClone(documents),
    ecouteurs: [],            // { chemin, poste, fn }
    fileTransactions: Promise.resolve(),
    enVol: 0,                 // notifications programmées, pas encore délivrées
    latenceMin: 3,
    latenceMax: 12
  };

  const lire = (chemin) => monde.docs[chemin] ? structuredClone(monde.docs[chemin]) : null;

  // Applique une mise à jour de champs, en gérant les chemins pointés
  // ("Tokens.J1") et le marqueur de suppression, comme Firestore.
  const appliquer = (chemin, maj, remplacer) => {
    if (remplacer) { monde.docs[chemin] = structuredClone(maj); return; }
    const cible = monde.docs[chemin] || (monde.docs[chemin] = {});
    Object.keys(maj).forEach(cle => {
      const valeur = maj[cle];
      if (valeur === "«champ supprimé»") {
        if (cle.includes(".")) {
          const [racine, sous] = cle.split(".");
          if (cible[racine]) delete cible[racine][sous];
        } else delete cible[cle];
        return;
      }
      if (cle.includes(".")) {
        const [racine, sous] = cle.split(".");
        cible[racine] = cible[racine] || {};
        cible[racine][sous] = structuredClone(valeur);
      } else cible[cle] = structuredClone(valeur);
    });
  };

  const notifier = (chemin) => {
    monde.ecouteurs.filter(e => e.chemin === chemin).forEach(e => {
      monde.enVol++;
      const delai = monde.latenceMin + Math.random() * (monde.latenceMax - monde.latenceMin);
      setTimeout(() => {
        monde.enVol--;
        // Le poste reçoit l'état ACTUEL du document, pas celui d'il y a 10 ms :
        // c'est ainsi que deux écritures rapprochées n'en donnent qu'une seule.
        try { e.fn(lire(chemin)); } catch (err) { console.error("Écouteur :", err); }
      }, delai);
    });
  };

  // Laisse le réseau se vider. "minimum" force une attente plancher : le jeu
  // temporise certaines suites (la fin de tour attend 350 ms que la bulle se
  // replie), et un banc qui repartirait avant les aurait ratées.
  monde.attendreLeReseau = async (tours = 60, minimum = 0) => {
    const debut = Date.now();
    for (let i = 0; i < tours; i++) {
      await new Promise(r => setTimeout(r, 12));
      if (monde.enVol === 0 && i > 3 && Date.now() - debut >= minimum) return;
    }
  };

  // Attend qu'une condition sur le monde partagé devienne vraie.
  monde.attendreQue = async (predicat, msMax = 4000) => {
    const debut = Date.now();
    while (Date.now() - debut < msMax) {
      if (predicat(monde.docs)) return true;
      await new Promise(r => setTimeout(r, 12));
    }
    return false;
  };

  // L'API Firestore telle que le jeu l'utilise, pour un poste donné.
  monde.apiPour = (nomPoste) => {
    const doc = (_db, col, id) => ({ chemin: col + "/" + id, col, id });

    const getDoc = async (ref) => {
      const d = lire(ref.chemin);
      return { exists: () => d !== null, data: () => d };
    };

    const updateDoc = async (ref, maj) => {
      if (!monde.docs[ref.chemin]) throw new Error("document absent : " + ref.chemin);
      appliquer(ref.chemin, maj, false);
      notifier(ref.chemin);
    };

    const setDoc = async (ref, data, opts) => {
      appliquer(ref.chemin, data, !(opts && opts.merge));
      notifier(ref.chemin);
    };

    const deleteDoc = async (ref) => { delete monde.docs[ref.chemin]; notifier(ref.chemin); };
    const deleteField = () => "«champ supprimé»";

    const runTransaction = async (_db, fn) => {
      const precedent = monde.fileTransactions;
      let debloquer;
      monde.fileTransactions = new Promise(r => debloquer = r);
      await precedent;
      const aNotifier = new Set();
      try {
        const resultat = await fn({
          get: async (ref) => { const d = lire(ref.chemin);
                                return { exists: () => d !== null, data: () => d }; },
          update: (ref, maj) => { appliquer(ref.chemin, maj, false); aNotifier.add(ref.chemin); }
        });
        aNotifier.forEach(notifier);
        return resultat;
      } finally { debloquer(); }
    };

    const writeBatch = () => {
      const operations = [];
      return {
        update: (ref, maj) => operations.push([ref, maj]),
        commit: async () => {
          operations.forEach(([ref, maj]) => {
            if (!monde.docs[ref.chemin]) throw new Error("document absent : " + ref.chemin);
          });
          operations.forEach(([ref, maj]) => appliquer(ref.chemin, maj, false));
          new Set(operations.map(([ref]) => ref.chemin)).forEach(notifier);
        }
      };
    };

    const onSnapshot = (ref, fn) => {
      monde.ecouteurs.push({ chemin: ref.chemin, poste: nomPoste, fn });
      setTimeout(() => fn(lire(ref.chemin)), 1);
      return () => {};
    };

    return { doc, getDoc, updateDoc, setDoc, deleteDoc, deleteField, runTransaction, writeBatch, onSnapshot };
  };

  return monde;
}

// Découpe une fonction ou un bloc du code du jeu, pour l'exécuter tel quel.
export function extraire(fichier, marqueur, finLigne = '};') {
  const lignes = fs.readFileSync('/home/user/Ivalis/' + fichier, 'utf-8').split('\n');
  const d = lignes.findIndex(l => l.startsWith(marqueur));
  if (d < 0) throw new Error(`${marqueur} introuvable dans ${fichier}`);
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}

// Le répartiteur d'actions d'app.js : le bloc qui, à chaque notification de la
// partie, rejoue les animations reçues. Repris tel quel, c'est lui qu'on teste.
export function extraireRepartiteur() {
  const lignes = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8').split('\n');
  const debut = lignes.findIndex(l => l.includes('if (estPremierScanPartie) {'));
  let fin = -1, profondeur = 0;
  for (let i = debut; i < lignes.length; i++) {
    profondeur += (lignes[i].match(/\{/g) || []).length;
    profondeur -= (lignes[i].match(/\}/g) || []).length;
    if (profondeur === 0 && i > debut) { fin = i; break; }
  }
  if (debut < 0 || fin < 0) throw new Error("Répartiteur d'actions introuvable dans app.js");
  return lignes.slice(debut, fin + 1).join('\n');
}
