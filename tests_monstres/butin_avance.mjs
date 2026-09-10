// LE BUTIN TIRÉ D'AVANCE.
//
// Tirer les objets ne coûte rien ; les DESSINER prend une quinzaine de secondes
// par lot. Ce travail démarre maintenant au DÉBUT du combat, en arrière-plan :
// à la victoire, la fouille des cadavres ne dure plus qu'un clignement d'œil.
// Et un combat perdu ne jette pas son tirage — il le garde en réserve, rangé
// par difficulté, pour la prochaine rencontre de cette difficulté-là.
//
// Ce banc rejoue les scènes avec le VRAI code de loot.js, du vrai catalogue
// d'objets et de la vraie transaction de partie, à trois postes à la fois.
import fs from 'fs';
import { SRC_MODIFIER_PARTIE } from './transaction_partie.mjs';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(62)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// --------------------------------------------------------------------------
// Le vrai code, tel quel.
// --------------------------------------------------------------------------
const SRC_LOOT = fs.readFileSync('/home/user/Ivalis/loot.js', 'utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm, '');
const SRC_OBJETS = fs.readFileSync('/home/user/Ivalis/objets.js', 'utf-8');

const lignesIA = fs.readFileSync('/home/user/Ivalis/objets_ia.js', 'utf-8').split('\n');
function fonctionIA(marqueur) {
  const d = lignesIA.findIndex(l => l.startsWith(marqueur));
  if (d < 0) throw new Error("introuvable dans objets_ia.js : " + marqueur);
  let f = d; for (let i = d + 1; i < lignesIA.length; i++) { if (lignesIA[i] === '};') { f = i; break; } }
  return lignesIA.slice(d, f + 1).join('\n');
}
// Le poseur d'images est le maillon qui doit désormais connaître la réserve.
const SRC_POSER_IMAGE = fonctionIA('window.poserImageObjetEnBase = async function');
const SRC_AVANCEMENT = fonctionIA('window.avancementImagesButin = function');

// --------------------------------------------------------------------------
// Un Firestore transactionnel pour "Systeme_Parties/P1", partagé par les postes.
// --------------------------------------------------------------------------
function creerPartie(docInitial) {
  const partagee = {
    doc: Object.assign({ ID_Rencontre: "renc_1", Difficulte_Rencontre: "Normale" },
                       structuredClone(docInitial || {})),
    file: Promise.resolve(),
    ecritures: 0
  };
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
        update: (_r, maj) => {
          partagee.ecritures++;
          Object.keys(maj).forEach(cle => fusionnerChemin(partagee.doc, cle, maj[cle]));
        }
      });
    } finally { debloquer(); }
  };
  return { partagee, runTransaction };
}

// Un poste : son propre DOM, sa propre vue des combattants, le même Firestore.
function creerPoste(idJoueur, { partie, persos, monstres, avecCles = true }) {
  const w = {};
  w.ID_PARTIE_COURANTE = "P1";
  w.PARTIE_DATA = partie.partagee.doc;   // muté en place, comme la vraie notification
  w.PERSOS_PARTIE = [...persos, ...monstres];
  w.MONSTRES_PARTIE = monstres;
  w.estCombattantMort = (id) => {
    const p = w.PERSOS_PARTIE.find(x => x.idPersonnage === id);
    return !p || p.statut === "Mort" || p.Statut === "Mort";
  };

  const elements = { "fenetre-combat": { style: { display: "block" } } };
  const documentStub = {
    getElementById(id) {
      if (!elements[id]) elements[id] = { style: {}, innerHTML: "", innerText: "", value: "" };
      return elements[id];
    },
    addEventListener: () => {}
  };
  const localStorageStub = { getItem: (cle) => cle === "ID_JOUEUR_COURANT" ? idJoueur : null };
  const doc = (_db, col, id) => ({ col, id });

  new Function('window', SRC_OBJETS)(w);
  new Function('window', 'db', 'doc', 'updateDoc', 'document', 'localStorage', SRC_LOOT)(
    w, {}, doc, async () => {}, documentStub, localStorageStub);
  new Function('window', 'db', 'doc', 'runTransaction', SRC_MODIFIER_PARTIE)(w, {}, doc, partie.runTransaction);
  new Function('window', 'illustrerEquipementPorte', SRC_POSER_IMAGE)(w, async () => {});
  new Function('window', SRC_AVANCEMENT)(w);

  // Le dessinateur : on n'appelle évidemment aucune API, on compte les
  // commandes et on rend une URL. C'est le seul endroit qui coûte de l'argent
  // dans la vraie vie : ce banc surveille surtout qu'il ne tourne qu'UNE fois.
  const commandes = [];
  w.peutIllustrerLesObjets = () => avecCles;
  w.oublierStyleGraphique = () => {};
  w.illustrerLesObjets = async (objets, surImage) => {
    commandes.push(objets.map(o => o.uid));
    for (const o of objets) await surImage(o, "https://images/" + o.uid + ".png");
  };

  return { idJoueur, w, elements, commandes };
}

const heros = (n) => Array.from({ length: n }, (_, i) => ({
  idPersonnage: "J" + (i + 1), prenom: "Héros " + (i + 1), idJoueur: "P" + (i + 1),
  camp: "Allié", statut: "Vivant", actif: true
}));
const monstreVivant = () => ([{ idPersonnage: "M1", camp: "Ennemi", statut: "Vivant", estIllusion: false }]);
const reserve = (partie, d = "Normale") => (partie.partagee.doc.Butin_Reserve || {})[d] || null;
const items = (partie, d = "Normale") => (reserve(partie, d) || {}).items || [];

// ==========================================================================
console.log("1. LA RÉSERVE SE REMPLIT DÈS LE DÉBUT DU COMBAT");
{
  const partie = creerPartie({});
  const p = creerPoste("P1", { partie, persos: heros(3), monstres: monstreVivant() });

  verifier("avant tout, aucune réserve", reserve(partie) === null);
  await p.w.preparerButinEnAvance();

  verifier("deux objets par héros sont tirés d'avance", items(partie).length === 6,
           `(${items(partie).length})`);
  verifier("aucun butin n'est ouvert pour autant", !partie.partagee.doc.Butin);
  verifier("le dessinateur a reçu le lot entier", p.commandes.length === 1 && p.commandes[0].length === 6,
           `(${p.commandes.length} commande(s))`);
  verifier("tous les objets ont leur image", items(partie).every(it => it.image),
           `(${items(partie).filter(it => it.image).length}/6)`);
}

// ==========================================================================
console.log("\n2. REJOUÉE À CHAQUE NOTIFICATION, ELLE NE COÛTE PLUS RIEN");
{
  const partie = creerPartie({});
  const p = creerPoste("P1", { partie, persos: heros(3), monstres: monstreVivant() });
  await p.w.preparerButinEnAvance();
  const ecrituresApresLePremier = partie.partagee.ecritures;

  for (let i = 0; i < 30; i++) await p.w.preparerButinEnAvance();

  verifier("plus une seule écriture en base", partie.partagee.ecritures === ecrituresApresLePremier,
           `(${partie.partagee.ecritures - ecrituresApresLePremier} de trop)`);
  verifier("plus une seule commande au dessinateur", p.commandes.length === 1, `(${p.commandes.length})`);
  verifier("et toujours six objets", items(partie).length === 6, `(${items(partie).length})`);
}

// ==========================================================================
console.log("\n3. TROIS POSTES PRÉPARENT ENSEMBLE : UN SEUL LOT, UN SEUL DESSINATEUR");
{
  const partie = creerPartie({});
  const trois = ["P1", "P2", "P3"].map(id =>
    creerPoste(id, { partie, persos: heros(3), monstres: monstreVivant() }));

  await Promise.all(trois.map(p => p.w.preparerButinEnAvance()));

  verifier("six objets, pas dix-huit", items(partie).length === 6, `(${items(partie).length})`);
  const dessinateurs = trois.filter(p => p.commandes.length > 0).length;
  verifier("un seul poste a payé les images", dessinateurs === 1, `(${dessinateurs} poste(s))`);
  verifier("la réserve porte la revendication du dessin", !!reserve(partie).dessinLe);
}

// ==========================================================================
console.log("\n4. UN COMBAT PERDU NE JETTE PAS SON TIRAGE");
{
  const partie = creerPartie({});
  const p = creerPoste("P1", { partie, persos: heros(3), monstres: monstreVivant() });
  await p.w.preparerButinEnAvance();
  const empreinte = items(partie).map(it => it.uid).join("|");

  // Le combat tourne mal : réinitialisation, nouvelle rencontre, même difficulté.
  delete partie.partagee.doc.Butin;
  partie.partagee.doc.ID_Rencontre = "renc_2";
  const p2 = creerPoste("P1", { partie, persos: heros(3), monstres: monstreVivant() });
  await p2.w.preparerButinEnAvance();

  verifier("ce sont les mêmes objets qui repartent au combat",
           items(partie).map(it => it.uid).join("|") === empreinte);
  verifier("le dessinateur n'est pas rappelé", p2.commandes.length === 0, `(${p2.commandes.length})`);
}

// ==========================================================================
console.log("\n5. CHAQUE DIFFICULTÉ A SA RÉSERVE");
{
  const partie = creerPartie({});
  const p = creerPoste("P1", { partie, persos: heros(2), monstres: monstreVivant() });
  await p.w.preparerButinEnAvance();
  const normale = items(partie, "Normale").map(it => it.uid).join("|");

  partie.partagee.doc.Difficulte_Rencontre = "Difficile";
  partie.partagee.doc.ID_Rencontre = "renc_2";
  const q = creerPoste("P1", { partie, persos: heros(2), monstres: monstreVivant() });
  await q.w.preparerButinEnAvance();

  verifier("la réserve difficile est tirée à part", items(partie, "Difficile").length === 4,
           `(${items(partie, "Difficile").length})`);
  verifier("celle de la rencontre normale est intacte",
           items(partie, "Normale").map(it => it.uid).join("|") === normale);
  verifier("aucun objet ne passe d'une difficulté à l'autre",
           items(partie, "Difficile").every(d => !items(partie, "Normale").some(n => n.uid === d.uid)));
}

// ==========================================================================
console.log("\n6. À LA VICTOIRE, LE BUTIN SORT DE LA RÉSERVE, DÉJÀ DESSINÉ");
{
  const partie = creerPartie({});
  const p = creerPoste("P1", { partie, persos: heros(3), monstres: monstreVivant() });
  await p.w.preparerButinEnAvance();
  const prepares = items(partie).map(it => it.uid);

  p.w.MONSTRES_PARTIE[0].statut = "Mort";
  await p.w.demarrerButin();

  const butin = partie.partagee.doc.Butin;
  verifier("un butin s'ouvre", !!butin && butin.ouvert === true);
  const distribues = ["J1", "J2", "J3"].flatMap(id => butin.parPersonnage[id].items.map(it => it.uid));
  verifier("chaque héros reçoit deux objets", distribues.length === 6, `(${distribues.length})`);
  verifier("ce sont EXACTEMENT ceux de la réserve",
           distribues.slice().sort().join("|") === prepares.slice().sort().join("|"));

  const avancement = p.w.avancementImagesButin(butin, ["J1", "J2", "J3"]);
  verifier("la fouille des cadavres n'a plus rien à attendre",
           avancement.total === 6 && avancement.prets === 6,
           `(${avancement.prets}/${avancement.total})`);
  verifier("la réserve de cette difficulté est vidée", reserve(partie) === null);
}

// ==========================================================================
console.log("\n7. UN HÉROS DE PLUS QU'AU TIRAGE : ON COMPLÈTE, ON NE PLANTE PAS");
{
  const partie = creerPartie({});
  const p = creerPoste("P1", { partie, persos: heros(2), monstres: monstreVivant() });
  await p.w.preparerButinEnAvance();
  verifier("quatre objets pour deux héros", items(partie).length === 4, `(${items(partie).length})`);

  // Un troisième héros rejoint la partie avant la victoire.
  const q = creerPoste("P1", { partie, persos: heros(3), monstres: monstreVivant() });
  await q.w.preparerButinEnAvance();
  verifier("la réserve est complétée à six", items(partie).length === 6, `(${items(partie).length})`);
  verifier("le dessinateur ne redessine que les deux nouveaux",
           q.commandes.length === 1 && q.commandes[0].length === 2,
           `(${q.commandes.map(c => c.length).join("+")})`);

  q.w.MONSTRES_PARTIE[0].statut = "Mort";
  await q.w.demarrerButin();
  const butin = partie.partagee.doc.Butin;
  verifier("les trois héros sont servis",
           ["J1", "J2", "J3"].every(id => (butin.parPersonnage[id] || {}).items?.length === 2));
}

// ==========================================================================
console.log("\n8. UN HÉROS DE MOINS : LE RESTE RETOURNE EN RÉSERVE");
{
  const partie = creerPartie({});
  const p = creerPoste("P1", { partie, persos: heros(3), monstres: monstreVivant() });
  await p.w.preparerButinEnAvance();

  // Un héros est mis de côté juste avant la victoire : il ne touche plus de part.
  const deux = heros(3); deux[2].actif = false;
  const q = creerPoste("P1", { partie, persos: deux, monstres: monstreVivant() });
  q.w.MONSTRES_PARTIE[0].statut = "Mort";
  await q.w.demarrerButin();

  const butin = partie.partagee.doc.Butin;
  verifier("deux héros seulement se partagent le butin", butin.participants.length === 2,
           `(${butin.participants.join(", ")})`);
  verifier("les deux objets non distribués restent en réserve", items(partie).length === 2,
           `(${items(partie).length})`);
  verifier("ils gardent leurs images, déjà payées", items(partie).every(it => it.image));
}

// ==========================================================================
console.log("\n9. UN DESSINATEUR QUI DISPARAÎT NE BLOQUE PAS LA RÉSERVE POUR TOUJOURS");
{
  const partie = creerPartie({});
  const p = creerPoste("P1", { partie, persos: heros(2), monstres: monstreVivant(), avecCles: false });
  await p.w.preparerButinEnAvance();
  verifier("sans clés d'API, les objets sont quand même tirés", items(partie).length === 4,
           `(${items(partie).length})`);
  verifier("mais aucun n'a d'image", items(partie).every(it => !it.image));

  verifier("et il ne revendique pas un dessin qu'il ne peut pas faire",
           !reserve(partie).dessinLe);

  // L'appareil du MJ, clés en main, prend le relais sans attendre : rien ne le
  // bloque, puisque personne n'a revendiqué le travail.
  const q = creerPoste("P2", { partie, persos: heros(2), monstres: monstreVivant() });
  await q.w.preparerButinEnAvance();
  verifier("l'appareil qui a les clés reprend le travail", q.commandes.length === 1,
           `(${q.commandes.length})`);
  verifier("les images arrivent enfin", items(partie).every(it => it.image));

  // Et si un poste revendique puis disparaît (onglet fermé, réseau coupé), la
  // réserve ne reste pas grise pour toujours.
  const bloquee = creerPartie({});
  const mj = creerPoste("P1", { partie: bloquee, persos: heros(2), monstres: monstreVivant() });
  mj.w.illustrerLesObjets = async (objets) => { mj.commandes.push(objets.map(o => o.uid)); };
  await mj.w.preparerButinEnAvance();
  verifier("la réserve reste sans images", items(bloquee).every(it => !it.image));

  const suivant = creerPoste("P2", { partie: bloquee, persos: heros(2), monstres: monstreVivant() });
  await suivant.w.preparerButinEnAvance();
  verifier("tant que la revendication est fraîche, personne ne double",
           suivant.commandes.length === 0, `(${suivant.commandes.length})`);

  reserve(bloquee).dessinLe = Date.now() - (mj.w.DELAI_DESSIN_RESERVE_MS + 1000);
  const tard = creerPoste("P3", { partie: bloquee, persos: heros(2), monstres: monstreVivant() });
  await tard.w.preparerButinEnAvance();
  verifier("passé le délai, un autre poste reprend le travail", tard.commandes.length === 1,
           `(${tard.commandes.length})`);
  verifier("et les images finissent par arriver", items(bloquee).every(it => it.image));
}

// ==========================================================================
console.log("\n10. RIEN NE SE PRÉPARE HORS D'UN VRAI COMBAT");
{
  const partie = creerPartie({});
  const p = creerPoste("P1", { partie, persos: heros(2), monstres: monstreVivant() });

  p.elements["fenetre-combat"].style.display = "none";
  await p.w.preparerButinEnAvance();
  verifier("fenêtre de combat fermée : aucune réserve", reserve(partie) === null);

  p.elements["fenetre-combat"].style.display = "block";
  partie.partagee.doc.ID_Rencontre = "";
  await p.w.preparerButinEnAvance();
  verifier("aucune rencontre en cours : aucune réserve", reserve(partie) === null);

  partie.partagee.doc.ID_Rencontre = "renc_1";
  p.w.MONSTRES_PARTIE[0].statut = "Mort";
  await p.w.preparerButinEnAvance();
  verifier("combat déjà gagné : c'est trop tard, on ne prépare plus", reserve(partie) === null);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
