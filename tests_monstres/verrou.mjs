// Trois navigateurs exécutent le même code sur la MÊME partie. Un seul doit
// jouer le tour du monstre, sinon il agirait trois fois.
import fs from 'fs';

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(56)} ${c?"OK":"ÉCHEC"} ${d}`); };

// Document de partie partagé par les trois postes.
function creerPoste(partagee, journal, nom) {
  const w = {};
  const contexte = { window: w };
  // Firestore partagé. runTransaction est SÉRIALISÉ, comme le vrai : lecture et
  // écriture forment un tout indivisible.
  let enCours = Promise.resolve();
  const db = {};
  // Deux documents désormais : la partie, et le verrou de l'IA qui a le sien
  // (Systeme_Parties/{id}/Journal_Combat/verrou). On les distingue au nombre de
  // segments du chemin, comme le vrai Firestore.
  if (partagee.verrou === undefined) partagee.verrou = null;
  const doc = (_db, ...seg) => ({ estVerrou: seg.length > 3 });
  const lire = (ref) => (ref && ref.estVerrou) ? partagee.verrou : partagee.doc;
  const getDoc = async (ref) => ({ exists: () => !!lire(ref), data: () => structuredClone(lire(ref)) });
  const updateDoc = async (ref, data) => {
    if (ref && ref.estVerrou) partagee.verrou = { ...(partagee.verrou || {}), ...structuredClone(data) };
    else Object.assign(partagee.doc, structuredClone(data));
  };
  const runTransaction = async (_db, fn) => {
    const precedent = partagee.file;
    let debloquer;
    partagee.file = new Promise(r => debloquer = r);
    await precedent;
    try {
      return await fn({
        get: async (ref) => ({ exists: () => !!lire(ref), data: () => structuredClone(lire(ref)) }),
        update: (ref, data) => updateDoc(ref, data),
        // set remplace le document : c'est ainsi que le verrou s'écrit, et c'est
        // ce qui lui permet d'exister sans avoir été créé au préalable.
        set: (ref, data) => {
          if (ref && ref.estVerrou) partagee.verrou = structuredClone(data);
          else Object.assign(partagee.doc, structuredClone(data));
        }
      });
    } finally { debloquer(); }
  };

  w.ID_PARTIE_COURANTE = "P1";
  w.PLATEAU_VTT = { getCaseState: () => ({ isBlocked:false, isDeleted:false, isDifficult:false }) };
  w.TOKENS_VTT_DATA = {}; w.PERSOS_PARTIE = []; w.MONSTRES_PARTIE = [];
  w.CACHE_COMPETENCES_GLOBAL = {}; w.ZONES_PERSISTANTES = {}; w.EFFETS_BDD_CACHE = {};
  w.PARTIE_DATA = partagee.doc;
  w.estCombattantMort = () => false;
  w.estMonstre = () => true;
  w.finDeTourCombat = async () => { journal.push(nom); };
  w.hexDistanceVTT = () => 0; w.calculerCheminVTT = () => [];

  const src = fs.readFileSync('/home/user/Ivalis/monstres_ia.js','utf-8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";/gm,'')
    .replace(/await pause\(\d+\);/g, '');
  // Chaque poste a sa propre instance du module, donc son propre ID_CLIENT.
  const fabrique = new Function('window','db','doc','getDoc','updateDoc','runTransaction',
    src + '\n; return { reclamer: (cle) => reclamerVerrouIA(cle), id: ID_CLIENT };');
  const api = fabrique(w, db, doc, getDoc, updateDoc, runTransaction);
  return { w, api, nom };
}

console.log("1. TROIS POSTES RÉCLAMENT LE MÊME TOUR EN MÊME TEMPS");
{
  const partagee = { doc: { Phase_Combat:"Resolution", Tour_Combat:1 }, file: Promise.resolve() };
  const journal = [];
  const postes = ["iPad-Nico","iPad-Ben","iPad-Adrien"].map(n => creerPoste(partagee, journal, n));
  verifier("chaque poste a un identifiant distinct",
    new Set(postes.map(p => p.api.id)).size === 3, `(${postes.map(p=>p.api.id).join(", ")})`);

  const resultats = await Promise.all(postes.map(p => p.api.reclamer("tour|M1|123")));
  const gagnants = resultats.filter(Boolean).length;
  console.log(`     réponses : ${postes.map((p,i)=>p.nom+"="+resultats[i]).join("  ")}`);
  verifier("un seul poste obtient le tour", gagnants === 1, `(${gagnants} gagnant(s))`);
  verifier("le verrou est bien inscrit en base", !!partagee.verrou && partagee.verrou.cle === "tour|M1|123");
}

console.log("\n2. LE MÊME POSTE PEUT REPRENDRE SON PROPRE VERROU");
{
  const partagee = { doc: {}, file: Promise.resolve() };
  const p = creerPoste(partagee, [], "seul");
  const a = await p.api.reclamer("tour|M2|1");
  const b = await p.api.reclamer("tour|M2|1");
  verifier("il garde la main sur son propre verrou", a === true && b === true);
}

console.log("\n3. UN AUTRE POSTE NE VOLE PAS UN VERROU RÉCENT");
{
  const partagee = { doc: {}, file: Promise.resolve() };
  const j = [];
  const p1 = creerPoste(partagee, j, "A"), p2 = creerPoste(partagee, j, "B");
  await p1.api.reclamer("tour|M3|1");
  const vole = await p2.api.reclamer("tour|M3|1");
  verifier("le second poste est éconduit", vole === false);
}

console.log("\n4. UN VERROU ABANDONNÉ EST REPRIS AUTOMATIQUEMENT");
{
  const partagee = { doc: {}, file: Promise.resolve() };
  const j = [];
  const p1 = creerPoste(partagee, j, "A"), p2 = creerPoste(partagee, j, "B");
  await p1.api.reclamer("tour|M4|1");
  // Le poste A a disparu. B doit le constater — et il le constate à SA montre,
  // pas à l'heure inscrite dans le verrou : vieillir `ts` ne suffit donc plus,
  // et c'est voulu (un iPad en avance ne doit pas croire un verrou périmé).
  // On lui fait d'abord VOIR le verrou, puis on recule ce souvenir de trente
  // secondes — ce qu'aurait fait le temps qui passe.
  await p2.api.reclamer("tour|M4|1");
  p2.w.__VUES_VERROU_IA.forEach((quand, k) => p2.w.__VUES_VERROU_IA.set(k, quand - 30000));
  const repris = await p2.api.reclamer("tour|M4|1");
  verifier("le poste survivant reprend la main après le délai", repris === true);
  verifier("le verrou porte désormais son nom", partagee.verrou.client === p2.api.id);
}

console.log("\n5. DEUX TOURS SUCCESSIFS NE SE CONFONDENT PAS");
{
  const partagee = { doc: {}, file: Promise.resolve() };
  const p1 = creerPoste(partagee, [], "A"), p2 = creerPoste(partagee, [], "B");
  await p1.api.reclamer("tour|M5|100");
  // Nouveau tour du même monstre : clé différente, un autre poste peut le prendre.
  const suivant = await p2.api.reclamer("tour|M5|200");
  verifier("le tour suivant est réclamable par un autre poste", suivant === true);
}

console.log("\n6. CENT RÉCLAMATIONS SIMULTANÉES : TOUJOURS UN SEUL GAGNANT");
{
  let anomalies = 0;
  for (let essai = 0; essai < 20; essai++) {
    const partagee = { doc: {}, file: Promise.resolve() };
    const postes = Array.from({length:5}, (_,i) => creerPoste(partagee, [], "P"+i));
    const res = await Promise.all(postes.map(p => p.api.reclamer("tour|X|"+essai)));
    if (res.filter(Boolean).length !== 1) anomalies++;
  }
  verifier("20 courses à 5 postes : jamais deux gagnants", anomalies === 0, `(${anomalies} anomalies)`);
}

console.log(`\n${echecs === 0 ? "TOUS LES CONTRÔLES PASSENT" : echecs + " CONTRÔLE(S) EN ÉCHEC"}`);
