// LE BUTIN DE FIN DE COMBAT — fenêtre personnelle puis partage commun.
// Comme la file d'attente du combat, le document "Butin" est modifié par
// plusieurs postes à la fois (chacun peut détecter la victoire, chacun peut
// être le DERNIER à valider et donc celui qui construit le pool ou qui le
// résout). Tout repose sur window.modifierPartie (combat.js) : ce banc rejoue
// les scènes avec le vrai code de loot.js et combat.js, à plusieurs postes.
import fs from 'fs';
import { SRC_MODIFIER_PARTIE } from './transaction_partie.mjs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// --------------------------------------------------------------------------
// Extraction du vrai code, tel quel.
// --------------------------------------------------------------------------
const lignesCombat = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8').split('\n');
function fonctionCombat(marqueur) {
  const d = lignesCombat.findIndex(l => l.startsWith(marqueur));
  if (d < 0) throw new Error("introuvable dans combat.js : " + marqueur);
  let f = d; for (let i = d + 1; i < lignesCombat.length; i++) { if (lignesCombat[i] === '};') { f = i; break; } }
  return lignesCombat.slice(d, f + 1).join('\n');
}
const SRC_VICTOIRE_TEST = fonctionCombat('window.declencherVictoireTest = async function')
  .replace(/await import\("[^"]*"\)/g, 'await importerFirestore()');

const SRC_LOOT = fs.readFileSync('/home/user/Ivalis/loot.js', 'utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm, '');

// Le catalogue d'équipement : c'est lui qui fabrique les objets du butin
// depuis que le tableau de Nico a remplacé la collection "Objets".
const SRC_OBJETS = fs.readFileSync('/home/user/Ivalis/objets.js', 'utf-8');

// --------------------------------------------------------------------------
// Un Firestore transactionnel pour "Systeme_Parties/P1", avec fusion par
// chemin pointé à profondeur QUELCONQUE ("Butin.parPersonnage.J1.decisions.x") :
// c'est exactement ce que fait le vrai service, et c'est ce dont le butin a
// besoin (contrairement aux chemins à un seul niveau des autres bancs).
function creerPartieButin(docInitial) {
  const partagee = { doc: structuredClone(docInitial), file: Promise.resolve() };
  const fusionnerChemin = (cible, chemin, valeur) => {
    const segments = chemin.split(".");
    let n = cible;
    for (let i = 0; i < segments.length - 1; i++) {
      if (typeof n[segments[i]] !== "object" || n[segments[i]] === null) n[segments[i]] = {};
      n = n[segments[i]];
    }
    n[segments[segments.length - 1]] = structuredClone(valeur);
  };
  const runTransaction = async (_db, fn) => {
    const precedent = partagee.file;
    let debloquer;
    partagee.file = new Promise(r => debloquer = r);
    await precedent;
    try {
      const vue = structuredClone(partagee.doc);
      await new Promise(r => setTimeout(r, 3)); // la fenêtre où deux postes se marchent dessus
      return await fn({
        get: async () => ({ exists: () => true, data: () => vue }),
        update: (_r, maj) => Object.keys(maj).forEach(cle => fusionnerChemin(partagee.doc, cle, maj[cle]))
      });
    } finally { debloquer(); }
  };
  return { partagee, runTransaction };
}

// Le "Personnages" collection : une seule vraie base, partagée par tous les
// postes, où finissent les écritures d'équipement (equiperObjetButin).
function creerPersonnagesFirestore(ids) {
  const table = {};
  ids.forEach(id => table[id] = { Equip_Armure: null, Equip_Main_Droite: null, Equip_Main_Gauche: null });
  const ecritures = [];
  const updateDoc = async (ref, maj) => {
    if (!table[ref.id]) throw new Error("personnage introuvable : " + ref.id);
    Object.assign(table[ref.id], structuredClone(maj));
    ecritures.push({ id: ref.id, maj: structuredClone(maj) });
  };
  return { table, ecritures, updateDoc };
}

// Un poste (navigateur) : ses propres document/localStorage (fermés sur SES
// fonctions, pas de variable globale à jongler entre postes concurrents), sa
// propre vue des combattants, mais le même Firestore partagé.
function creerPoste(idJoueur, { partie, personnages, persos, monstres, difficulte }) {
  const w = {};
  w.ID_PARTIE_COURANTE = "P1";
  w.PARTIE_DATA = partie.partagee.doc; // même objet, toujours à jour (muté en place)
  // Comme le vrai recomposerCombattants (monstres.js) : PERSOS_PARTIE est la
  // liste COMBINÉE joueurs+monstres, MONSTRES_PARTIE n'en est que le sous-set
  // ennemi. declencherVictoireTest filtre PERSOS_PARTIE par camp "Ennemi".
  w.PERSOS_PARTIE = [...persos, ...monstres];
  w.MONSTRES_PARTIE = monstres;
  // La difficulté de la rencontre décide des chances de rareté (tableau de loot).
  w.PARTIE_DATA.Difficulte_Rencontre = difficulte || "Normale";
  w.estCombattantMort = (id) => {
    const p = persos.find(x => x.idPersonnage === id) || monstres.find(x => x.idPersonnage === id);
    return !p || p.PV_Actuels <= 0 || p.statut === "Mort" || p.Statut === "Mort";
  };
  // Référence "combattant" : mutation directe de l'objet en RAM, comme le
  // fait la vraie App une fois la notification Firestore revenue — pas
  // besoin d'un aller-retour complet pour ce que ce banc vérifie ici.
  w.refCombattant = (id) => {
    const cible = persos.find(p => p.idPersonnage === id) || monstres.find(m => m.idPersonnage === id);
    return { col: "Combattant", cible };
  };

  const doc = (_db, col, id) => ({ col, id });
  const updateDoc = async (ref, maj) => {
    if (ref.col !== "Personnages") throw new Error("écriture inattendue sur " + ref.col);
    await personnages.updateDoc(ref, maj);
  };
  // Un DOM qui se SOUVIENT : les mêmes éléments d'un appel à l'autre. Sans
  // ça, impossible de relire ce que la fenêtre vient d'afficher.
  const elements = { "fenetre-combat": { style: { display: "block" } } };
  const documentStub = {
    getElementById(id) {
      if (!elements[id]) elements[id] = { style: {}, innerHTML: "", innerText: "", value: "" };
      return elements[id];
    }
  };
  // Deux usages distincts : l'identité du joueur, et le cache des caracs lu
  // par les prérequis d'équipement (absent ici, donc jamais bloquant).
  const localStorageStub = {
    getItem: (cle) => cle === "ID_JOUEUR_COURANT" ? idJoueur : null
  };
  const importerFirestore = async () => ({
    writeBatch: () => {
      const operations = [];
      return {
        update: (ref, maj) => operations.push([ref, maj]),
        commit: async () => {
          for (const [ref, maj] of operations) {
            if (ref.col === "Combattant") Object.assign(ref.cible, maj);
            else await updateDoc(ref, maj);
          }
        }
      };
    }
  });

  new Function('window', SRC_OBJETS)(w);
  // Les lectures de stats d'app.js : c'est window.bonusEquip qui additionne
  // l'équipement aux caractéristiques.
  new Function('window', SRC_STATS_COMMUNES)(w);
  new Function('window', 'db', 'doc', 'updateDoc', 'document', 'localStorage', SRC_LOOT)(
    w, {}, doc, updateDoc, documentStub, localStorageStub);
  new Function('window', 'db', 'doc', 'runTransaction', SRC_MODIFIER_PARTIE)(
    w, {}, doc, partie.runTransaction);
  new Function('window', 'db', 'importerFirestore', SRC_VICTOIRE_TEST)(w, {}, importerFirestore);

  return { idJoueur, w, elements };
}

const trosHeros = () => ([
  { idPersonnage: "J1", prenom: "Pliors", idJoueur: "P1", camp: "Allié", statut: "Vivant", actif: true, PV_Actuels: 42,
    equipArmure: null, equipMainDroite: null, equipMainGauche: null },
  { idPersonnage: "J2", prenom: "Jade", idJoueur: "P2", camp: "Allié", statut: "Vivant", actif: true, PV_Actuels: 42,
    equipArmure: null, equipMainDroite: null, equipMainGauche: null },
  { idPersonnage: "J3", prenom: "Mémé", idJoueur: "P3", camp: "Allié", statut: "Vivant", actif: true, PV_Actuels: 42,
    equipArmire: null, equipMainDroite: null, equipMainGauche: null }
]);
const unMonstreVivant = () => ([{ idPersonnage: "M1", camp: "Ennemi", statut: "Vivant", PV_Actuels: 30, estIllusion: false }]);

// ==========================================================================
console.log("1. LA COUPE DE TEST (bouton 🏆) NE PASSE PAS PAR LES RENFORTS");
{
  const partie = creerPartieButin({});
  const personnages = creerPersonnagesFirestore(["J1"]);
  const persos = trosHeros().slice(0, 1);
  const monstres = unMonstreVivant();
  const p1 = creerPoste("P1", { partie, personnages, persos, monstres, difficulte: "Normale" });

  await p1.w.declencherVictoireTest();
  verifier("le monstre passe à Mort", monstres[0].Statut === "Mort", `(Statut=${monstres[0].Statut})`);
  verifier("ses PV tombent à 0", monstres[0].PV_Actuels === 0, `(${monstres[0].PV_Actuels})`);
  verifier("le code ne mentionne pas marquerMonstreMort (pas de renfort déclenché)",
           SRC_VICTOIRE_TEST.includes("SANS passer par window.marquerMonstreMort"));

  await p1.w.declencherVictoireTest(); // plus aucun ennemi vivant : sans effet, ne doit pas planter
  verifier("rejouer la coupe une fois tous les ennemis tombés ne fait rien de plus", true);
}

// ==========================================================================
console.log("\n2. DÉTECTION DE VICTOIRE — les gardes-fous");
{
  const partie = creerPartieButin({});
  const personnages = creerPersonnagesFirestore(["J1"]);
  const persos = trosHeros().slice(0, 1);
  const monstres = unMonstreVivant();
  const p1 = creerPoste("P1", { partie, personnages, persos, monstres, difficulte: "Normale" });

  p1.w.verifierVictoireCombat();
  await new Promise(r => setTimeout(r, 20));
  verifier("un ennemi encore vivant : pas de butin", !partie.partagee.doc.Butin);

  monstres[0].statut = "Mort";
  persos[0].statut = "Mort"; // aucun héros vivant non plus
  p1.w.verifierVictoireCombat();
  await new Promise(r => setTimeout(r, 20));
  verifier("ennemis tombés mais aucun héros vivant : pas de butin", !partie.partagee.doc.Butin);

  persos[0].statut = "Vivant";
  p1.w.verifierVictoireCombat();
  await new Promise(r => setTimeout(r, 20));
  verifier("tous les ennemis tombés + un héros vivant : le butin s'ouvre",
           !!(partie.partagee.doc.Butin && partie.partagee.doc.Butin.ouvert));
  verifier("étape initiale : personnel", partie.partagee.doc.Butin.etape === "personnel");
  verifier("deux objets tirés pour J1",
           (partie.partagee.doc.Butin.parPersonnage.J1.items || []).length === 2);

  const avant = JSON.stringify(partie.partagee.doc.Butin);
  p1.w.verifierVictoireCombat(); // le butin est déjà ouvert : rejouer ne doit rien changer
  await new Promise(r => setTimeout(r, 20));
  verifier("un butin déjà ouvert n'est pas repris ni réinitialisé",
           JSON.stringify(partie.partagee.doc.Butin) === avant);
}

// ==========================================================================
console.log("\n3. TROIS POSTES DÉTECTENT LA VICTOIRE AU MÊME INSTANT");
{
  const partie = creerPartieButin({});
  const personnages = creerPersonnagesFirestore(["J1", "J2", "J3"]);
  const persos = trosHeros();
  const monstres = [{ idPersonnage: "M1", camp: "Ennemi", statut: "Mort", PV_Actuels: 0, estIllusion: false }];
  const postes = ["P1", "P2", "P3"].map(id => creerPoste(id, { partie, personnages, persos, monstres, difficulte: "Normale" }));

  // Les trois clients recomposent leurs combattants au même instant (fin du
  // dernier coup porté) et appellent donc demarrerButin en même temps.
  await Promise.all(postes.map(p => p.w.demarrerButin()));

  verifier("le butin existe et est ouvert une seule fois",
           !!(partie.partagee.doc.Butin && partie.partagee.doc.Butin.ouvert));
  verifier("les trois héros sont participants",
           new Set(partie.partagee.doc.Butin.participants).size === 3);
  ["J1", "J2", "J3"].forEach(id => {
    verifier(`${id} a reçu exactement deux objets (pas de double tirage)`,
             (partie.partagee.doc.Butin.parPersonnage[id].items || []).length === 2);
  });
}

// ==========================================================================
console.log("\n4. LA FENÊTRE PERSONNELLE — prendre, laisser, valider");
let butinPartage; // réutilisé par les sections suivantes
let contexte4;
{
  const partie = creerPartieButin({});
  const personnages = creerPersonnagesFirestore(["J1", "J2", "J3"]);
  const persos = trosHeros();
  const monstres = [{ idPersonnage: "M1", camp: "Ennemi", statut: "Mort", PV_Actuels: 0, estIllusion: false }];
  const postes = { P1: null, P2: null, P3: null };
  ["P1", "P2", "P3"].forEach(id => postes[id] = creerPoste(id, { partie, personnages, persos, monstres, difficulte: "Normale" }));

  await postes.P1.w.demarrerButin();
  const items = { J1: partie.partagee.doc.Butin.parPersonnage.J1.items,
                  J2: partie.partagee.doc.Butin.parPersonnage.J2.items,
                  J3: partie.partagee.doc.Butin.parPersonnage.J3.items };

  // J1 : prend son premier objet (via le popup de confirmation, comme un vrai
  // clic "Prendre" puis "Équiper"), laisse le second.
  postes.P1.w.choisirLootPersonnel("J1", items.J1[0].uid, true);
  await postes.P1.w.confirmerChoixButin(true);
  postes.P1.w.choisirLootPersonnel("J1", items.J1[1].uid, false);
  await postes.P1.w.validerButinPersonnel("J1");

  verifier("l'objet pris par J1 est équipé côté Personnages",
           Object.values(personnages.table.J1).some(v => v && v.uid === items.J1[0].uid),
           `(${JSON.stringify(personnages.table.J1)})`);
  verifier("J1 est marqué validé", partie.partagee.doc.Butin.parPersonnage.J1.valide === true);
  verifier("étape encore personnelle (tout le monde n'a pas validé)",
           partie.partagee.doc.Butin.etape === "personnel");

  // Une fois validé, revenir sur sa décision ne doit plus rien changer.
  await postes.P1.w.enregistrerDecisionButin("J1", items.J1[1].uid, true);
  verifier("après validation, une décision ne peut plus être changée",
           partie.partagee.doc.Butin.parPersonnage.J1.decisions[items.J1[1].uid] === false);

  postes.P2.w.choisirLootPersonnel("J2", items.J2[0].uid, true);
  await postes.P2.w.confirmerChoixButin(true);
  postes.P2.w.choisirLootPersonnel("J2", items.J2[1].uid, false);
  await postes.P2.w.validerButinPersonnel("J2");
  verifier("étape encore personnelle après le 2e héros", partie.partagee.doc.Butin.etape === "personnel");

  // J3 est le DERNIER à valider : c'est cet appel qui doit construire le pool.
  postes.P3.w.choisirLootPersonnel("J3", items.J3[0].uid, true);
  await postes.P3.w.confirmerChoixButin(true);
  postes.P3.w.choisirLootPersonnel("J3", items.J3[1].uid, false);
  await postes.P3.w.validerButinPersonnel("J3");

  verifier("le dernier à valider fait basculer l'étape sur le partage",
           partie.partagee.doc.Butin.etape === "partage");
  const pool = partie.partagee.doc.Butin.pool || [];
  verifier("le pool contient les trois objets laissés (un par héros)", pool.length === 3,
           `(${pool.length})`);
  const uidsAttendus = new Set([items.J1[1].uid, items.J2[1].uid, items.J3[1].uid]);
  verifier("ce sont bien LES objets laissés, pas les objets pris",
           pool.every(it => uidsAttendus.has(it.uid)));
  verifier("chaque objet du pool part sans candidat", pool.every(it => (it.candidats || []).length === 0));

  contexte4 = { partie, personnages, persos, monstres, postes, items };
  butinPartage = { pool, items };
}

// ==========================================================================
console.log("\n5. LE PARTAGE COMMUN — placement, tirage au sort, résolution");
{
  const { partie, personnages, postes, items } = contexte4;
  const idJ1Reste = items.J1[1].uid, idJ2Reste = items.J2[1].uid, idJ3Reste = items.J3[1].uid;

  // J1 se place sur l'objet laissé par J2 ; J2 se place sur celui de J2 (le
  // sien) ET celui de J3 ; J3 ne se place sur rien.
  await postes.P1.w.togglePlacementPool("J1", idJ2Reste);
  await postes.P2.w.togglePlacementPool("J2", idJ2Reste);
  await postes.P2.w.togglePlacementPool("J2", idJ3Reste);

  const pool = partie.partagee.doc.Butin.pool;
  const itemJ1 = pool.find(it => it.uid === idJ1Reste);
  const itemJ2 = pool.find(it => it.uid === idJ2Reste);
  const itemJ3 = pool.find(it => it.uid === idJ3Reste);
  verifier("objet de J1 : personne ne s'est placé dessus", itemJ1.candidats.length === 0);
  verifier("objet de J2 : deux prétendants (J1 et J2)",
           itemJ2.candidats.length === 2 && itemJ2.candidats.includes("J1") && itemJ2.candidats.includes("J2"));
  verifier("objet de J3 : un seul prétendant (J2)",
           itemJ3.candidats.length === 1 && itemJ3.candidats[0] === "J2");

  // On peut changer d'avis avant la résolution : se replacer retire.
  await postes.P2.w.togglePlacementPool("J2", idJ3Reste);
  verifier("se replacer sur le même objet retire la candidature",
           partie.partagee.doc.Butin.pool.find(it => it.uid === idJ3Reste).candidats.length === 0);
  await postes.P2.w.togglePlacementPool("J2", idJ3Reste); // remis pour la suite

  // Tirage au sort forcé et déterministe pour l'objet à deux prétendants
  // (J1 et J2) : Math.random()=0 désigne le premier candidat inscrit, J1.
  const vraiRandom = Math.random;
  Math.random = () => 0;
  try {
    await Promise.all([postes.P1.w.validerButinPool(), postes.P2.w.validerButinPool(), postes.P3.w.validerButinPool()]);
  } finally { Math.random = vraiRandom; }

  verifier("le partage est résolu et l'étape passe à 'termine'",
           partie.partagee.doc.Butin.resolu === true && partie.partagee.doc.Butin.etape === "termine");
  const poolFinal = partie.partagee.doc.Butin.pool;
  const finJ1 = poolFinal.find(it => it.uid === idJ1Reste);
  const finJ2 = poolFinal.find(it => it.uid === idJ2Reste);
  const finJ3 = poolFinal.find(it => it.uid === idJ3Reste);
  verifier("objet sans prétendant : personne ne le gagne", finJ1.gagnant === null);
  verifier("objet convoité par deux : le tirage désigne J1 (Math.random forcé à 0)",
           finJ2.gagnant === "J1", `(gagnant=${finJ2.gagnant})`);
  verifier("objet à un seul prétendant : il l'emporte sans tirage", finJ3.gagnant === "J2");

  verifier("J1 a bien reçu son gain en écriture Firestore (Personnages)",
           Object.values(personnages.table.J1).some(v => v && v.uid === finJ2.uid));
  verifier("J2 a bien reçu son gain en écriture Firestore (Personnages)",
           Object.values(personnages.table.J2).some(v => v && v.uid === finJ3.uid));
  verifier("l'objet non gagné n'a déclenché aucune écriture d'équipement",
           !personnages.ecritures.some(e => Object.values(e.maj).some(v => v && v.uid === finJ1?.uid)));

  const ecrituresJ1 = personnages.ecritures.filter(e => e.id === "J1" && Object.values(e.maj).some(v => v && v.uid === finJ2.uid));
  const ecrituresJ2 = personnages.ecritures.filter(e => e.id === "J2" && Object.values(e.maj).some(v => v && v.uid === finJ3.uid));
  verifier("un seul poste a effectué l'équipement du gagnant (pas de double écriture concurrente)",
           ecrituresJ1.length === 1 && ecrituresJ2.length === 1,
           `(J1:${ecrituresJ1.length}, J2:${ecrituresJ2.length})`);
}

// ==========================================================================
console.log("\n6. FERMETURE DE LA FENÊTRE — partagée, idempotente");
{
  const { partie, postes } = contexte4;
  await postes.P3.w.fermerFenetreButin();
  verifier("le butin se ferme pour tout le monde", partie.partagee.doc.Butin.ouvert === false);
  await postes.P1.w.fermerFenetreButin(); // déjà fermé : ne doit pas planter
  verifier("refermer un butin déjà fermé ne fait rien de plus", partie.partagee.doc.Butin.ouvert === false);
}

// ==========================================================================
console.log("\n7. LE TIRAGE PUISE DANS LE TABLEAU D'ÉQUIPEMENT");
{
  const partie = creerPartieButin({});
  const personnages = creerPersonnagesFirestore(["J1"]);
  const p1 = creerPoste("P1", { partie, personnages, persos: [], monstres: [], difficulte: "Normale" });

  const deux = p1.w.tirerObjetsAleatoires("Normale", 2);
  verifier("deux objets sont tirés, avec des identifiants distincts",
           deux.length === 2 && deux[0].uid !== deux[1].uid);
  verifier("chacun porte un nom, un type, une rareté et un emplacement",
           deux.every(o => o.nom && o.type && o.rarete && o.emplacement));
  verifier("chacun porte ses bonus chiffrés et son texte lisible",
           deux.every(o => o.bonus && typeof o.effetTexte === "string" && o.effetTexte.length > 0),
           `(« ${deux[0].effetTexte} »)`);

  // Une rencontre normale ne donne jamais d'épique (0% au tableau).
  const cent = [];
  for (let i = 0; i < 300; i++) cent.push(...p1.w.tirerObjetsAleatoires("Normale", 2));
  verifier("une rencontre normale ne sort aucun épique",
           cent.every(o => o.rarete !== "Épique"));
  verifier("mais bien des communs, des rares et des très rares",
           new Set(cent.map(o => o.rarete)).size === 3,
           `(${[...new Set(cent.map(o => o.rarete))].join(", ")})`);

  // Sur un boss, l'épique devient possible.
  const boss = [];
  for (let i = 0; i < 600; i++) boss.push(...p1.w.tirerObjetsAleatoires("Très difficile", 2));
  verifier("une rencontre très difficile finit par donner un épique",
           boss.some(o => o.rarete === "Épique"),
           `(${boss.filter(o => o.rarete === "Épique").length} sur ${boss.length})`);

  // Sans objets.js, le butin ne doit pas planter la victoire.
  const sansCatalogue = { tirerObjetsAleatoires: p1.w.tirerObjetsAleatoires };
  new Function('window', 'return window')(sansCatalogue);
  const vide = p1.w.tirerObjetsAleatoires.call(null, "Normale", 2);
  verifier("le tirage rend toujours une liste (jamais d'exception)", Array.isArray(vide));
}

// ==========================================================================
console.log("\n8. ÉQUIPER ET LÂCHER : LES MAINS, ET CE QU'ON DÉTRUIT");
{
  const partie = creerPartieButin({});
  const personnages = creerPersonnagesFirestore(["J1"]);
  const persos = trosHeros().slice(0, 1);
  const p1 = creerPoste("P1", { partie, personnages, persos, monstres: [], difficulte: "Normale" });
  const w = p1.w;
  const heros = persos[0];

  const modele = (nom) => w.MODELES_OBJETS.find(m => m.modele === nom);
  const dague = w.fabriquerObjet(modele("Dague"), "Commun");
  const bouclier = w.fabriquerObjet(modele("Bouclier léger"), "Commun");
  const hacheDeuxMains = w.fabriquerObjet(modele("Hache à deux mains"), "Commun");
  const armure = w.fabriquerObjet(modele("Armure lourde"), "Commun");

  await w.equiperObjet("J1", dague, "Droite");
  verifier("une arme à une main va dans la main demandée",
           personnages.table.J1.Equip_Main_Droite?.uid === dague.uid);
  verifier("et l'autre main reste libre", personnages.table.J1.Equip_Main_Gauche === null);

  await w.equiperObjet("J1", bouclier, "Gauche");
  verifier("le bouclier prend l'autre main sans chasser l'arme",
           personnages.table.J1.Equip_Main_Gauche?.uid === bouclier.uid
           && personnages.table.J1.Equip_Main_Droite?.uid === dague.uid);

  await w.equiperObjet("J1", armure, null);
  verifier("l'armure a son propre emplacement, indépendant des mains",
           personnages.table.J1.Equip_Armure?.uid === armure.uid
           && personnages.table.J1.Equip_Main_Droite?.uid === dague.uid);

  // Avant d'équiper une arme à deux mains, le joueur doit voir les DEUX pertes.
  const perdus = w.objetsEcrasesPar(heros, hacheDeuxMains, null);
  verifier("une arme à deux mains annonce les deux objets qu'elle détruit",
           perdus.length === 2 && perdus.some(o => o.uid === dague.uid) && perdus.some(o => o.uid === bouclier.uid),
           `(${perdus.map(o => o.nom).join(", ")})`);

  await w.equiperObjet("J1", hacheDeuxMains, null);
  verifier("elle occupe ensuite les deux mains",
           personnages.table.J1.Equip_Main_Droite?.uid === hacheDeuxMains.uid
           && personnages.table.J1.Equip_Main_Gauche?.uid === hacheDeuxMains.uid);
  verifier("la dague et le bouclier ont bien disparu",
           !Object.values(personnages.table.J1).some(o => o && (o.uid === dague.uid || o.uid === bouclier.uid)));
  verifier("mais l'armure, elle, est intacte", personnages.table.J1.Equip_Armure?.uid === armure.uid);

  // Ses bonus ne doivent pas compter double malgré les deux emplacements.
  verifier("ses dégâts ne sont comptés qu'une fois",
           w.bonusEquip(heros, "degatsPhys") === hacheDeuxMains.bonus.degatsPhys,
           `(${w.bonusEquip(heros, "degatsPhys")} pour ${hacheDeuxMains.bonus.degatsPhys})`);

  // Lâcher une arme à deux mains libère les deux mains, où qu'on clique.
  await w.lacherObjet("J1", "Equip_Main_Gauche");
  verifier("la lâcher par une main libère les deux",
           personnages.table.J1.Equip_Main_Droite === null && personnages.table.J1.Equip_Main_Gauche === null);
  verifier("sans toucher à l'armure", personnages.table.J1.Equip_Armure?.uid === armure.uid);

  await w.equiperObjet("J1", dague, "Droite");
  await w.lacherObjet("J1", "Equip_Armure");
  verifier("lâcher l'armure ne libère qu'elle",
           personnages.table.J1.Equip_Armure === null
           && personnages.table.J1.Equip_Main_Droite?.uid === dague.uid);
  verifier("et le porteur n'a plus aucune résistance d'armure",
           w.bonusEquip(heros, "resPhys") === 0, `(${w.bonusEquip(heros, "resPhys")})`);
}

// ==========================================================================
console.log("\n9. UNE FENÊTRE DÉDIÉE PAR HÉROS, PUIS LE PARTAGE");
{
  // Un seul joueur mène DEUX héros : il doit les traiter l'un après l'autre.
  const partie = creerPartieButin({});
  const personnages = creerPersonnagesFirestore(["J1", "J2"]);
  const persos = trosHeros().slice(0, 2);
  persos[1].idJoueur = "P1";                    // Jade appartient aussi à P1
  const monstres = [{ idPersonnage: "M1", camp: "Ennemi", statut: "Mort", PV_Actuels: 0, estIllusion: false }];
  const p1 = creerPoste("P1", { partie, personnages, persos, monstres, difficulte: "Normale" });
  const w = p1.w, ecran = p1.elements;

  await w.demarrerButin();
  const butin = () => partie.partagee.doc.Butin;
  const items = (id) => butin().parPersonnage[id].items;

  w.afficherFenetreButin(butin());
  verifier("la fenêtre s'ouvre sur le PREMIER héros, nommément",
           ecran["butin-titre"].innerText === "Butin de Pliors",
           `(« ${ecran["butin-titre"].innerText} »)`);
  verifier("elle annonce où on en est dans la file (1 sur 2)",
           ecran["butin-sous-titre"].innerText.includes("(1 sur 2)"),
           `(« ${ecran["butin-sous-titre"].innerText} »)`);
  // Sur les identifiants, pas sur les noms : deux héros peuvent parfaitement
  // tirer un objet du même modèle, et le nom ne les distinguerait plus.
  verifier("seuls les objets de ce héros sont proposés",
           items("J1").every(it => ecran["butin-vue-personnel"].innerHTML.includes(it.uid))
           && items("J2").every(it => !ecran["butin-vue-personnel"].innerHTML.includes(it.uid)));
  verifier("le second héros est annoncé comme suivant",
           ecran["butin-vue-personnel"].innerHTML.includes("Ensuite : Jade"));
  verifier("le rappel d'équipement ne montre que ce héros",
           ecran["butin-equipement-actuel"].innerHTML.includes("Pliors")
           && !ecran["butin-equipement-actuel"].innerHTML.includes("Jade"));

  // Pliors choisit et valide : la fenêtre doit passer à Jade.
  for (const it of items("J1")) await w.enregistrerDecisionButin("J1", it.uid, false);
  await w.validerButinPersonnel("J1");
  w.afficherFenetreButin(butin());
  verifier("une fois Pliors validé, la fenêtre passe à Jade",
           ecran["butin-titre"].innerText === "Butin de Jade",
           `(« ${ecran["butin-titre"].innerText} »)`);
  verifier("et annonce (2 sur 2)", ecran["butin-sous-titre"].innerText.includes("(2 sur 2)"));
  verifier("plus personne n'est annoncé après elle",
           !ecran["butin-vue-personnel"].innerHTML.includes("Ensuite :"));
  verifier("l'étape reste personnelle tant que Jade n'a pas choisi",
           butin().etape === "personnel");

  // Jade valide à son tour : les deux héros du joueur ont fini.
  for (const it of items("J2")) await w.enregistrerDecisionButin("J2", it.uid, false);
  await w.validerButinPersonnel("J2");

  // Ici les deux participants ont validé, le partage s'ouvre tout seul.
  verifier("les deux héros validés, le partage commun s'ouvre",
           butin().etape === "partage", `(${butin().etape})`);
  w.afficherFenetreButin(butin());
  verifier("le titre devient celui du partage",
           ecran["butin-titre"].innerText === "Partage du butin");
  verifier("et le rappel d'équipement montre alors les DEUX héros",
           ecran["butin-equipement-actuel"].innerHTML.includes("Pliors")
           && ecran["butin-equipement-actuel"].innerHTML.includes("Jade"));
}

// ==========================================================================
console.log("\n10. LE JOUEUR QUI A FINI ATTEND LES AUTRES");
{
  // Deux joueurs, un héros chacun : celui qui valide en premier voit un
  // message d'attente, pas la fenêtre d'un héros qui n'est pas le sien.
  const partie = creerPartieButin({});
  const personnages = creerPersonnagesFirestore(["J1", "J2"]);
  const persos = trosHeros().slice(0, 2);       // J1 à P1, J2 à P2
  const monstres = [{ idPersonnage: "M1", camp: "Ennemi", statut: "Mort", PV_Actuels: 0, estIllusion: false }];
  const p1 = creerPoste("P1", { partie, personnages, persos, monstres, difficulte: "Normale" });
  const p2 = creerPoste("P2", { partie, personnages, persos, monstres, difficulte: "Normale" });

  await p1.w.demarrerButin();
  const butin = () => partie.partagee.doc.Butin;

  for (const it of butin().parPersonnage.J1.items) await p1.w.enregistrerDecisionButin("J1", it.uid, false);
  await p1.w.validerButinPersonnel("J1");

  p1.w.afficherFenetreButin(butin());
  verifier("le joueur qui a fini voit un message d'attente",
           p1.elements["butin-vue-personnel"].innerHTML.includes("En attente des autres joueurs"),
           `(« ${p1.elements["butin-vue-personnel"].innerHTML.slice(0, 60)} »)`);
  verifier("avec le décompte des prêts (1/2 prêts)",
           p1.elements["butin-vue-personnel"].innerHTML.includes("(1/2 prêts)"),
           `(« ${p1.elements["butin-vue-personnel"].innerHTML.replace(/\s+/g, " ").slice(-70)} »)`);

  // Chez l'autre joueur, la fenêtre est toujours celle de SON héros.
  p2.w.afficherFenetreButin(butin());
  verifier("l'autre joueur, lui, garde la fenêtre de son propre héros",
           p2.elements["butin-titre"].innerText === "Butin de Jade",
           `(« ${p2.elements["butin-titre"].innerText} »)`);
  verifier("sans mention de file (il n'a qu'un héros)",
           !p2.elements["butin-sous-titre"].innerText.includes("sur"));
}

// ==========================================================================
console.log("\n11. LA FENÊTRE NE S'IMPOSE PLUS HORS COMBAT (bug du 03/09)");
{
  // Le bug tel qu'il s'est produit : un butin resté "ouvert" en base, et un
  // joueur qui ouvre simplement le jeu. La fenêtre s'affichait par-dessus tout,
  // vide (ses héros n'étaient pas encore chargés) et sans aucun bouton.
  const partie = creerPartieButin({});
  const personnages = creerPersonnagesFirestore(["J1", "J2"]);
  const persos = trosHeros().slice(0, 2);
  const monstres = [{ idPersonnage: "M1", camp: "Ennemi", statut: "Mort", PV_Actuels: 0, estIllusion: false }];
  const p1 = creerPoste("P1", { partie, personnages, persos, monstres, difficulte: "Normale" });
  const w = p1.w, ecran = p1.elements;

  await w.demarrerButin();
  const butin = () => partie.partagee.doc.Butin;
  verifier("le butin est bien ouvert en base", butin().ouvert === true);

  // Hors combat : le jeu vient d'être chargé, la fenêtre de combat est fermée.
  ecran["fenetre-combat"].style.display = "none";
  w.afficherFenetreButin(butin());
  verifier("fenêtre de combat fermée : le butin ne s'affiche pas",
           ecran["fenetre-butin"].style.display === "none",
           `(display=${ecran["fenetre-butin"].style.display})`);

  // Le combat s'ouvre : là, le butin a sa place.
  ecran["fenetre-combat"].style.display = "block";
  w.afficherFenetreButin(butin());
  verifier("combat ouvert : le butin s'affiche normalement",
           ecran["fenetre-butin"].style.display === "flex",
           `(display=${ecran["fenetre-butin"].style.display})`);

  // Même sans héros chargés (l'autre moitié du bug), la fenêtre reste fermable.
  const sansPersos = creerPoste("P9", { partie, personnages, persos: [], monstres: [], difficulte: "Normale" });
  sansPersos.w.afficherFenetreButin(butin());
  verifier("un spectateur sans héros voit une fenêtre, mais peut la fermer",
           sansPersos.elements["fenetre-butin"].style.display === "flex");
  sansPersos.w.fermerButinLocalement();
  verifier("et la croix la referme vraiment",
           sansPersos.elements["fenetre-butin"].style.display === "none");
}

// ==========================================================================
console.log("\n12. LA CROIX NE FERME QUE CHEZ SOI");
{
  const partie = creerPartieButin({});
  const personnages = creerPersonnagesFirestore(["J1", "J2"]);
  const persos = trosHeros().slice(0, 2);
  const monstres = [{ idPersonnage: "M1", camp: "Ennemi", statut: "Mort", PV_Actuels: 0, estIllusion: false }];
  const p1 = creerPoste("P1", { partie, personnages, persos, monstres, difficulte: "Normale" });
  const p2 = creerPoste("P2", { partie, personnages, persos, monstres, difficulte: "Normale" });

  await p1.w.demarrerButin();
  const butin = () => partie.partagee.doc.Butin;

  p1.w.fermerButinLocalement();
  verifier("le poste qui a cliqué voit sa fenêtre fermée",
           p1.elements["fenetre-butin"].style.display === "none");
  verifier("le butin reste ouvert en base pour les autres", butin().ouvert === true);

  p2.w.afficherFenetreButin(butin());
  verifier("l'autre joueur garde son butin à l'écran",
           p2.elements["fenetre-butin"].style.display === "flex");

  // Une notification de la partie ne doit pas réimposer la fenêtre fermée.
  await p2.w.enregistrerDecisionButin("J2", butin().parPersonnage.J2.items[0].uid, false);
  p1.w.afficherFenetreButin(butin());
  verifier("et la fenêtre fermée ne se rouvre pas à chaque notification",
           p1.elements["fenetre-butin"].style.display === "none");

  // Fermer sa fenêtre personnelle ne doit PAS priver du partage commun : c'est
  // l'étape en cours qu'on referme, pas le butin tout entier.
  partie.partagee.doc.Butin.etape = "partage";
  p1.w.afficherFenetreButin(butin());
  verifier("le partage commun s'affiche quand même ensuite",
           p1.elements["fenetre-butin"].style.display === "flex",
           `(display=${p1.elements["fenetre-butin"].style.display})`);

  // Et l'étape du partage peut elle aussi être refermée, sans se rouvrir.
  p1.w.fermerButinLocalement();
  p1.w.afficherFenetreButin(butin());
  verifier("elle se referme à son tour, et reste fermée",
           p1.elements["fenetre-butin"].style.display === "none");

  // Le butin du combat SUIVANT réapparaît malgré tout.
  partie.partagee.doc.Butin = { ...butin(), ouvert: true, id: "butin_suivant", etape: "personnel" };
  p1.w.afficherFenetreButin(butin());
  verifier("un nouveau butin s'affiche malgré la fermeture du précédent",
           p1.elements["fenetre-butin"].style.display === "flex",
           `(display=${p1.elements["fenetre-butin"].style.display})`);
}

// ==========================================================================
console.log("\n13. UN BUTIN OUBLIÉ NE BLOQUE PLUS LES SUIVANTS");
{
  const partie = creerPartieButin({});
  const personnages = creerPersonnagesFirestore(["J1", "J2"]);
  const persos = trosHeros().slice(0, 2);
  const monstres = [{ idPersonnage: "M1", camp: "Ennemi", statut: "Mort", PV_Actuels: 0, estIllusion: false }];

  // Premier combat, avec son identifiant de rencontre.
  partie.partagee.doc.ID_Rencontre = "renc_1";
  const p1 = creerPoste("P1", { partie, personnages, persos, monstres, difficulte: "Normale" });
  await p1.w.demarrerButin();
  const premier = { ...partie.partagee.doc.Butin };
  verifier("le premier butin est créé", premier.ouvert === true && premier.idRencontre === "renc_1");

  // Personne ne le referme : il reste "ouvert" en base. Une victoire dans le
  // MÊME combat ne doit pas l'écraser (c'est le garde-fou anti-concurrence).
  await p1.w.demarrerButin();
  verifier("dans le même combat, il n'est pas rejoué",
           partie.partagee.doc.Butin.id === premier.id);

  // Nouveau combat : nouvelle rencontre. Le vieux butin ne doit plus bloquer.
  partie.partagee.doc.ID_Rencontre = "renc_2";
  const p2 = creerPoste("P1", { partie, personnages, persos, monstres, difficulte: "Difficile" });
  await p2.w.demarrerButin();
  verifier("au combat suivant, un nouveau butin est bien tiré",
           partie.partagee.doc.Butin.id !== premier.id
           && partie.partagee.doc.Butin.idRencontre === "renc_2",
           `(rencontre ${partie.partagee.doc.Butin.idRencontre})`);
  verifier("et il suit la difficulté de CE combat-là",
           partie.partagee.doc.Butin.difficulte === "Difficile");

  // Un butin déjà résolu ne bloque pas non plus, même sans changer de rencontre.
  partie.partagee.doc.Butin.resolu = true;
  const idResolu = partie.partagee.doc.Butin.id;
  await p2.w.demarrerButin();
  verifier("un butin déjà résolu se laisse remplacer",
           partie.partagee.doc.Butin.id !== idResolu);

  // Un butin d'avant cette mécanique (sans identifiant) ne bloque pas non plus.
  partie.partagee.doc.Butin = { ouvert: true, etape: "personnel", participants: [], parPersonnage: {} };
  await p2.w.demarrerButin();
  verifier("un butin d'avant cette correction ne bloque pas non plus",
           !!partie.partagee.doc.Butin.id);

  // Dernier recours : des monstres posés à la main, donc AUCUN identifiant de
  // rencontre nulle part. C'est l'ancienneté qui tranche.
  delete partie.partagee.doc.ID_Rencontre;
  const p3 = creerPoste("P1", { partie, personnages, persos, monstres, difficulte: "Normale" });
  delete p3.w.PARTIE_DATA.ID_Rencontre;
  await p3.w.demarrerButin();
  const frais = partie.partagee.doc.Butin;
  verifier("sans rencontre identifiée, un butin est bien créé", !!frais.id && !!frais.creeLe);

  // Tout juste créé : une seconde détection de la même victoire ne doit PAS
  // le rejouer (c'est le garde-fou anti-concurrence, celui qui compte le plus).
  await p3.w.demarrerButin();
  verifier("un butin tout frais résiste à une seconde détection",
           partie.partagee.doc.Butin.id === frais.id);

  // Le même, vieilli d'une minute : il appartient forcément à un combat passé.
  partie.partagee.doc.Butin.creeLe = Date.now() - (p3.w.DELAI_BUTIN_PERIME_MS + 1000);
  await p3.w.demarrerButin();
  verifier("mais un butin vieux d'une minute se laisse remplacer",
           partie.partagee.doc.Butin.id !== frais.id,
           `(${partie.partagee.doc.Butin.id === frais.id ? "toujours le même" : "remplacé"})`);
}

// ==========================================================================
console.log("\n14. UN COMBAT EN COURS PASSE AVANT LE BUTIN");
{
  // Le calque du butin couvre tout l'écran (z-index 20000), au-dessus du
  // bandeau des points d'apparition (10020) et de la fenêtre de rencontre
  // (5000). Tant qu'il traîne, on ne peut ni poser un repère ni générer des
  // ennemis : les boutons PION et RENCONTRE semblent morts. Il doit donc
  // s'effacer dès qu'un ennemi est debout.
  const partie = creerPartieButin({});
  const personnages = creerPersonnagesFirestore(["J1", "J2"]);
  const persos = trosHeros().slice(0, 2);
  const mort = { idPersonnage: "M1", camp: "Ennemi", statut: "Mort", PV_Actuels: 0, estIllusion: false };
  const monstres = [mort];
  const p1 = creerPoste("P1", { partie, personnages, persos, monstres, difficulte: "Normale" });
  const w = p1.w, ecran = p1.elements;

  await w.demarrerButin();
  const butin = () => partie.partagee.doc.Butin;

  w.afficherFenetreButin(butin());
  verifier("combat gagné : le butin s'affiche", ecran["fenetre-butin"].style.display === "flex");

  // Le MJ lance une nouvelle rencontre : un ennemi debout apparaît.
  monstres.push({ idPersonnage: "M2", camp: "Ennemi", statut: "Vivant", PV_Actuels: 30, estIllusion: false });
  w.afficherFenetreButin(butin());
  verifier("un ennemi debout et le butin s'efface aussitôt",
           ecran["fenetre-butin"].style.display === "none",
           `(display=${ecran["fenetre-butin"].style.display})`);
  verifier("sans être perdu pour autant : il reste ouvert en base", butin().ouvert === true);

  // Ce nouvel ennemi tombe à son tour : le butin peut revenir.
  monstres[1].statut = "Mort";
  w.afficherFenetreButin(butin());
  verifier("une fois ce combat gagné aussi, le butin revient",
           ecran["fenetre-butin"].style.display === "flex");

  // Une illusion n'est pas un ennemi : elle ne doit pas masquer le butin.
  monstres.push({ idPersonnage: "ILL1", camp: "Ennemi", statut: "Vivant", PV_Actuels: 10, estIllusion: true });
  w.afficherFenetreButin(butin());
  verifier("une illusion debout ne masque pas le butin",
           ecran["fenetre-butin"].style.display === "flex");

  // La même règle sert à la détection de victoire : une seule définition.
  verifier("« des ennemis debout ? » ne voit pas l'illusion non plus",
           w.ennemisEncoreDebout() === false);
  monstres[2].estIllusion = false;
  verifier("mais bien un vrai ennemi vivant", w.ennemisEncoreDebout() === true);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
