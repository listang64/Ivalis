// v269 — LE BUTIN PAR MONSTRE VAINCU (tableau « Vierge 1 » de Nico).
//
// « Déterminé par les monstres combattus, voir tableaux en fonction du level.
//   1 monstre vaincu = 1 loot de sa catégorie. 3 joueurs chacun 2 loots, donc
//   6 loots minimum par combat ; les loots supplémentaires sont placés dans la
//   mise en commun directement ; la présence d'un ou des leaders apporte un
//   loot bonus après calcul, correspondant à la taille du plus grand (dans la
//   limite de 1). Si moins de 6 monstres : autant de loots que de monstres,
//   + X loots au hasard pour arriver à 6, 2 par joueur. Puis le bonus de 1 si
//   un leader est là. »
//
// Ce banc lit le VRAI objets.js et le VRAI loot.js, avec la vraie transaction
// de partie et une réserve en mémoire (le harnais de butin_avance.mjs) :
//   1. le tableau, case par case ;            2. le tirage, sur 20 000 jets ;
//   3. la composition (minimum, surplus, bonus, cohue) ;
//   4. la prévision tirée d'avance ;          5. la scène complète, 9 créatures ;
//   6. la petite rencontre (4 Petits) ;       7. la cohue ;
//   8. ce que la fenêtre annonce ;            9. les versions.
import fs from 'fs';
import { SRC_MODIFIER_PARTIE } from './transaction_partie.mjs';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(70)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const essayer = (f, repli) => { try { return f(); } catch (e) { return repli; } };

const SRC_LOOT = fs.readFileSync(RACINE + '/loot.js', 'utf-8').replace(/^import[\s\S]*?from\s+"[^"]+";\s*$/gm, '');
const SRC_OBJETS = fs.readFileSync(RACINE + '/objets.js', 'utf-8');
const lignesIA = fs.readFileSync(RACINE + '/objets_ia.js', 'utf-8').split('\n');
function fonctionIA(marqueur) {
  const d = lignesIA.findIndex(l => l.startsWith(marqueur));
  let f = d; for (let i = d + 1; i < lignesIA.length; i++) { if (lignesIA[i] === '};') { f = i; break; } }
  return lignesIA.slice(d, f + 1).join('\n');
}
const SRC_POSER_IMAGE = fonctionIA('window.poserImageObjetEnBase = async function');
const SRC_A_ILLUSTRER = fonctionIA('window.objetsAIllustrer = function');

// Le hasard du banc : une suite fixe, pour que chaque échec se rejoue.
const graine = (n) => () => { n = (n * 1103515245 + 12345) % 2147483648; return n / 2147483648; };

// --------------------------------------------------------------------------
// Les documents et la partie (le harnais de butin_avance.mjs).
// --------------------------------------------------------------------------
function creerDocuments() {
  const base = new Map();
  const cle = (c) => c.join("/");
  const copie = (v) => (v === null || v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const io = {
    async lire(chemin) { return copie(base.get(cle(chemin)) || null); },
    async lot(operations) {
      (operations || []).forEach(o => {
        const k = cle(o.chemin);
        if (o.op === "delete") base.delete(k); else base.set(k, copie(o.data));
      });
    },
    async transaction(chemin, decider) {
      const k = cle(chemin);
      const aEcrire = decider(copie(base.get(k) || null));
      if (!aEcrire) return false;
      base.set(k, copie(aEcrire));
      return true;
    }
  };
  return { base, io, lire: (chemin) => copie(base.get(cle(chemin)) || null) };
}
function creerPartie(docInitial) {
  const partagee = { doc: Object.assign({ ID_Rencontre: "renc_1", Difficulte_Rencontre: "Normale" }, structuredClone(docInitial || {})),
                     file: Promise.resolve() };
  const fusionner = (cible, chemin, valeur) => {
    const s = chemin.split("."); let n = cible;
    for (let i = 0; i < s.length - 1; i++) { if (typeof n[s[i]] !== "object" || n[s[i]] === null) n[s[i]] = {}; n = n[s[i]]; }
    n[s[s.length - 1]] = structuredClone(valeur);
  };
  const runTransaction = async (_db, fn) => {
    const precedent = partagee.file; let debloquer;
    partagee.file = new Promise(r => debloquer = r);
    await precedent;
    try {
      const vue = structuredClone(partagee.doc);
      return await fn({ get: async () => ({ exists: () => true, data: () => vue }),
                        update: (_r, maj) => Object.keys(maj).forEach(c => fusionner(partagee.doc, c, maj[c])) });
    } finally { debloquer(); }
  };
  return { partagee, runTransaction };
}
function creerPoste({ partie, documents, persos, monstres, niveau = 1 }) {
  const w = {};
  w.ID_PARTIE_COURANTE = "P1";
  w.ioCombatFirestore = documents.io;
  w.PARTIE_DATA = partie.partagee.doc;
  w.PERSOS_PARTIE = [...persos, ...monstres];
  w.MONSTRES_PARTIE = monstres;
  w.NIVEAU_GROUPE = niveau;
  w.estCombattantMort = (id) => { const p = w.PERSOS_PARTIE.find(x => x.idPersonnage === id); return !p || p.statut === "Mort"; };
  const elements = { "fenetre-combat": { style: { display: "block" } } };
  const documentStub = {
    getElementById(id) { if (!elements[id]) elements[id] = { style: {}, innerHTML: "", innerText: "", value: "" }; return elements[id]; },
    addEventListener: () => {}
  };
  const localStorageStub = { getItem: (c) => c === "ID_JOUEUR_COURANT" ? "P1" : null };
  const doc = (_db, col, id) => ({ col, id });
  new Function('window', SRC_OBJETS)(w);
  new Function('window', 'db', 'doc', 'updateDoc', 'document', 'localStorage', SRC_LOOT)(
    w, {}, doc, async () => {}, documentStub, localStorageStub);
  new Function('window', 'db', 'doc', 'runTransaction', SRC_MODIFIER_PARTIE)(w, {}, doc, partie.runTransaction);
  new Function('window', 'illustrerEquipementPorte', SRC_POSER_IMAGE)(w, async () => {});
  new Function('window', SRC_A_ILLUSTRER)(w);
  const commandes = [];
  w.peutIllustrerLesObjets = () => true;
  w.oublierStyleGraphique = () => {};
  w.illustrerLesObjets = async (objets, surImage) => {
    commandes.push(objets.map(o => o.uid));
    for (const o of objets) await surImage(o, "https://images/" + o.uid + ".png");
  };
  return { w, elements, commandes };
}
const heros = (n) => Array.from({ length: n }, (_, i) => ({
  idPersonnage: "J" + (i + 1), prenom: "Héros " + (i + 1), idJoueur: "P1", camp: "Allié", statut: "Vivant", actif: true }));
const creature = (id, Palier, leader) => ({ idPersonnage: id, camp: "Ennemi", statut: "Vivant", Palier, ...(leader ? { leader: true } : {}) });
const CHEMIN = ["Systeme_Parties", "P1", "Combat_Butin", "reserve_normale"];
const compter = (liste) => { const c = {}; liste.forEach(r => { c[r] = (c[r] || 0) + 1; }); return JSON.stringify(Object.keys(c).sort().map(k => [k, c[k]])); };

// Le tableau tel que Nico l'a rempli (Vierge_1.numbers), en pour cent :
// Commun, Rare, Très rare, Épique.
const NICO = {
  1:  { Petit: [85, 15, 0, 0],  Normal: [50, 35, 12, 3] },
  2:  { Petit: [80, 17, 3, 0],  Normal: [50, 30, 15, 5] },
  3:  { Petit: [75, 20, 5, 0],  Normal: [45, 35, 15, 5] },
  4:  { Petit: [70, 23, 6, 1],  Normal: [45, 30, 18, 7] },
  5:  { Petit: [65, 25, 8, 2],  Normal: [40, 35, 18, 7] },
  6:  { Petit: [60, 27, 10, 3], Normal: [40, 30, 20, 10] },
  7:  { Petit: [55, 30, 11, 4], Normal: [35, 35, 20, 10] },
  8:  { Petit: [50, 33, 12, 5], Normal: [35, 30, 23, 12] },
  9:  { Petit: [45, 36, 13, 6], Normal: [30, 35, 23, 12] },
  10: { Petit: [40, 39, 14, 7], Normal: [30, 30, 25, 15] }
};
const R = ["Commun", "Rare", "Très rare", "Épique"];

const outil = creerPoste({ partie: creerPartie(), documents: creerDocuments(), persos: heros(3), monstres: [] }).w;
const aLaNouvelleRegle = typeof outil.composerButin === "function" && typeof outil.tirerRareteButin === "function";

// ==========================================================================
console.log("\n1. LE TABLEAU DE NICO, CASE PAR CASE (objets.js)");
{
  const t = outil.CHANCES_BUTIN_NIVEAU || {};
  const ecarts = [];
  for (const n of Object.keys(NICO)) for (const st of ["Petit", "Normal"]) R.forEach((r, i) => {
    const v = ((t[n] || {})[st] || {})[r];
    if (v !== NICO[n][st][i]) ecarts.push(`niv ${n} ${st} ${r} : ${v} au lieu de ${NICO[n][st][i]}`);
  });
  verifier("les 80 cases (10 niveaux × Petit/Normal × 4 raretés) sont celles du tableau", ecarts.length === 0, ecarts.slice(0, 3).join(" ; "));
  const lignes = essayer(() => [outil.lignesButinNiveau(1, "Boss"), outil.lignesButinNiveau(0, "Petit"), outil.lignesButinNiveau(14, "Normal")], []);
  verifier("un Boss lit la ligne Normal", JSON.stringify(lignes[0]) === JSON.stringify((t[1] || {}).Normal));
  verifier("sous le niveau 1, la ligne du 1 ; au-delà du 10, celle du 10",
           JSON.stringify(lignes[1]) === JSON.stringify((t[1] || {}).Petit) && JSON.stringify(lignes[2]) === JSON.stringify((t[10] || {}).Normal));
}

// ==========================================================================
console.log("\n2. LE TIRAGE, SUR 20 000 JETS");
{
  const jets = (niveau, stature) => {
    const c = Object.fromEntries(R.map(r => [r, 0]));
    if (!aLaNouvelleRegle) return c;
    for (let i = 0; i < 20000; i++) c[outil.tirerRareteButin(niveau, stature)]++;
    return c;
  };
  const p1 = jets(1, "Petit");
  verifier("niveau 1, Petit : ni Très rare ni Épique", aLaNouvelleRegle && p1["Très rare"] === 0 && p1["Épique"] === 0, JSON.stringify(p1));
  verifier("niveau 1, Petit : ~15 % de Rare", Math.abs(p1.Rare / 200 - 15) < 1.5, `(${(p1.Rare / 200).toFixed(1)} %)`);
  const n10 = jets(10, "Normal");
  verifier("niveau 10, Normal : ~15 % d'Épique, ~25 % de Très rare",
           Math.abs(n10["Épique"] / 200 - 15) < 1.5 && Math.abs(n10["Très rare"] / 200 - 25) < 1.5, JSON.stringify(n10));
  const p4 = jets(4, "Petit");
  verifier("niveau 4, Petit : l'Épique apparaît (~1 %)", p4["Épique"] > 80 && p4["Épique"] < 330, `(${p4["Épique"]})`);
}

// ==========================================================================
console.log("\n3. LA COMPOSITION DU BUTIN (composerButin)");
{
  const compo = (o) => aLaNouvelleRegle ? outil.composerButin({ niveau: 1, alea: graine(o.g || 7), participants: ["J1", "J2", "J3"], ...o }) : { parPersonnage: {}, commun: [] };
  const parts = (p) => ["J1", "J2", "J3"].map(id => (p.parPersonnage[id] || []).length);
  const cr = (n, palier = "Petit", leaders = []) => Array.from({ length: n }, (_, i) => ({ id: "M" + i, stature: palier, leader: leaders.includes(i) }));

  const quatre = compo({ creatures: cr(4) });
  const tous4 = Object.values(quatre.parPersonnage).flat();
  verifier("4 créatures, 3 joueurs : 2 objets chacun", JSON.stringify(parts(quatre)) === "[2,2,2]", JSON.stringify(parts(quatre)));
  verifier("…4 viennent des créatures, 2 du hasard", tous4.filter(l => l.origine === "monstre").length === 4 && tous4.filter(l => l.origine === "hasard").length === 2);
  verifier("…rien de plus à la mise en commun", quatre.commun.length === 0);

  const neuf = compo({ creatures: cr(9, "Normal") });
  verifier("9 créatures : 2 chacun, les 3 autres à la mise en commun",
           JSON.stringify(parts(neuf)) === "[2,2,2]" && neuf.commun.length === 3 && neuf.commun.every(l => l.origine === "monstre"));
  verifier("…aucun objet « au hasard » : il y a assez de créatures",
           !Object.values(neuf.parPersonnage).flat().some(l => l.origine === "hasard"));

  const deuxLeaders = compo({ creatures: [...cr(3, "Petit", [0]), { id: "N", stature: "Normal", leader: true }] });
  const bonus = deuxLeaders.commun.filter(l => l.origine === "leader");
  verifier("deux leaders : UN seul bonus (dans la limite de 1)", bonus.length === 1, `(${bonus.length})`);
  verifier("…de la stature du plus grand (Normal)", bonus.length === 1 && bonus[0].stature === "Normal");
  verifier("…en plus des 6 du minimum, à la mise en commun",
           JSON.stringify(parts(deuxLeaders)) === "[2,2,2]" && deuxLeaders.commun.length === 1);
  const petitLeader = compo({ creatures: cr(2, "Petit", [1]) });
  verifier("un leader Petit seul : le bonus est tiré sur la ligne Petit",
           petitLeader.commun.length === 1 && petitLeader.commun[0].stature === "Petit");
  verifier("sans leader, pas de bonus", !quatre.commun.some(l => l.origine === "leader") && !neuf.commun.some(l => l.origine === "leader"));

  // Les raretés des créatures suivent leur stature : au niveau 1, un Petit
  // n'apporte jamais de Très rare ni d'Épique.
  let interdits = 0;
  for (let g = 1; g <= 300; g++) {
    const c = compo({ g, creatures: cr(6, "Petit") });
    interdits += Object.values(c.parPersonnage).flat().filter(l => l.rarete === "Très rare" || l.rarete === "Épique").length;
  }
  verifier("niveau 1, 6 Petits sur 300 combats : jamais de Très rare ni d'Épique", aLaNouvelleRegle && interdits === 0, `(${interdits})`);

  const prevu = compo({ creatures: cr(2, "Petit"), prevision: { monstres: { M0: "Épique", M1: "Très rare" }, hasard: ["Rare", "Rare", "Rare", "Rare"], bonus: null } });
  verifier("la prévision tirée d'avance est servie telle quelle",
           compter(Object.values(prevu.parPersonnage).flat().map(l => l.rarete)) === compter(["Épique", "Très rare", "Rare", "Rare", "Rare", "Rare"]));

  const cohue = compo({ creatures: cr(9, "Normal", [0]), parHeros: 2 });
  verifier("la cohue (2 par joueur) : surplus et bonus à la mise en commun (v270)", JSON.stringify(parts(cohue)) === "[2,2,2]" && cohue.commun.length === 4);
  const deuxJoueurs = compo({ creatures: cr(1), participants: ["J1", "J2"] });
  verifier("2 joueurs, 1 créature : 4 objets (1 + 3 au hasard)",
           Object.values(deuxJoueurs.parPersonnage).flat().length === 4 && Object.values(deuxJoueurs.parPersonnage).flat().filter(l => l.origine === "hasard").length === 3);
}

// ==========================================================================
console.log("\n4. LA PRÉVISION TIRÉE D'AVANCE (completerPrevision)");
{
  const cp = (...a) => aLaNouvelleRegle ? outil.completerPrevision(...a) : null;
  const cr = [{ id: "A", stature: "Petit" }, { id: "B", stature: "Normal", leader: true }];
  const p1 = cp(null, cr, 3, 2);
  verifier("une rareté par créature, 4 au hasard (6 − 2), le bonus du leader",
           !!p1 && Object.keys(p1.monstres).join() === "A,B" && p1.hasard.length === 4 && p1.bonus && p1.bonus.stature === "Normal");
  verifier("rejouée sans rien de neuf, elle ne change rien (null)", aLaNouvelleRegle && cp(p1, cr, 3, 2) === null);
  const p2 = cp(p1, [...cr, { id: "C", stature: "Petit" }], 3, 2);
  verifier("un renfort arrive : il reçoit sa rareté, les autres gardent la leur",
           !!p2 && p2.monstres.A === p1.monstres.A && p2.monstres.B === p1.monstres.B && !!p2.monstres.C);
  const p3 = cp(p1, [{ id: "Z", stature: "Petit" }], 3, 2);
  verifier("les créatures d'un autre combat quittent la prévision", !!p3 && Object.keys(p3.monstres).join() === "Z" && p3.bonus === null);
  const besoin = aLaNouvelleRegle ? outil.raretesDeLaPrevision(p1, 2, 3) : [];
  verifier("la réserve doit tenir 2 + 4 + 1 = 7 objets", besoin.length === 7, `(${besoin.length})`);
  const manque = aLaNouvelleRegle ? outil.raretesManquantes([{ rarete: "Commun" }, { rarete: "Rare" }], ["Commun", "Commun", "Rare", "Épique"]) : [];
  verifier("ce qui manque se compte rareté par rareté", compter(manque) === compter(["Commun", "Épique"]), JSON.stringify(manque));
}

// ==========================================================================
console.log("\n5. LA SCÈNE COMPLÈTE : 3 HÉROS, 9 CRÉATURES DONT 2 LEADERS");
{
  const partie = creerPartie({});
  const docs = creerDocuments();
  const monstres = [creature("L1", "Petit", true), creature("L2", "Normal", true),
                    ...Array.from({ length: 7 }, (_, i) => creature("M" + i, i < 4 ? "Petit" : "Normal"))];
  const p = creerPoste({ partie, documents: docs, persos: heros(3), monstres, niveau: 3 });
  await p.w.preparerButinEnAvance();
  const res = docs.lire(CHEMIN) || {};
  const prevision = res.prevision || {};
  verifier("au début du combat, la réserve tient 10 objets (9 créatures + le bonus)", (res.items || []).length === 10, `(${(res.items || []).length})`);
  verifier("…une rareté prévue pour chacune des 9 créatures", Object.keys(prevision.monstres || {}).length === 9);
  verifier("…le bonus prévu sur la stature du plus grand leader", (prevision.bonus || {}).stature === "Normal");
  const attendu = [...Object.values(prevision.monstres || {}), ...(prevision.bonus ? [prevision.bonus.rarete] : [])];
  verifier("…et les objets de la réserve ont exactement ces raretés", compter((res.items || []).map(it => it.rarete)) === compter(attendu));
  verifier("…tous dessinés pendant le combat", (res.items || []).every(it => it.image) && p.commandes.length === 1);

  monstres.forEach(m => { m.statut = "Mort"; });
  await p.w.demarrerButin();
  const butin = partie.partagee.doc.Butin || {};
  const perso = ["J1", "J2", "J3"].map(id => ((butin.parPersonnage || {})[id] || {}).items || []);
  verifier("à la victoire : 2 objets par héros", JSON.stringify(perso.map(l => l.length)) === "[2,2,2]");
  verifier("4 objets d'office à la mise en commun (3 de surplus + le bonus)", (butin.commun || []).length === 4, `(${(butin.commun || []).length})`);
  verifier("…dont UN bonus du leader", (butin.commun || []).filter(it => it.origine === "leader").length === 1);
  const servis = [...perso.flat(), ...(butin.commun || [])];
  verifier("ce sont les 10 objets de la réserve, déjà dessinés",
           servis.map(it => it.uid).sort().join() === (res.items || []).map(it => it.uid).sort().join() && servis.every(it => it.image));
  verifier("la réserve est vidée", docs.lire(CHEMIN) === null);

  // J1 garde tout, J2 et J3 laissent chacun un objet : la mise en commun
  // s'ouvre avec les 4 d'office + les 2 laissés.
  for (const [i, id] of ["J1", "J2", "J3"].entries()) {
    for (const [k, it] of perso[i].entries()) await p.w.enregistrerDecisionButin(id, it.uid, !(i > 0 && k === 0));
    await p.w.validerButinPersonnel(id);
  }
  const apres = partie.partagee.doc.Butin || {};
  verifier("le partage s'ouvre avec 6 objets (4 d'office + 2 laissés)", apres.etape === "partage" && (apres.pool || []).length === 6,
           `(${apres.etape}, ${(apres.pool || []).length})`);
  verifier("le bonus du leader y est, prêt à être convoité",
           (apres.pool || []).some(it => it.origine === "leader" && Array.isArray(it.candidats)));
}

// ==========================================================================
console.log("\n6. LA PETITE RENCONTRE : 4 PETITS POUR 3 HÉROS");
{
  const partie = creerPartie({});
  const docs = creerDocuments();
  const monstres = Array.from({ length: 4 }, (_, i) => creature("P" + i, "Petit"));
  const p = creerPoste({ partie, documents: docs, persos: heros(3), monstres });
  await p.w.preparerButinEnAvance();
  const res = docs.lire(CHEMIN) || {};
  verifier("la réserve tient 6 objets (4 créatures + 2 au hasard)", (res.items || []).length === 6, `(${(res.items || []).length})`);
  monstres.forEach(m => { m.statut = "Mort"; });
  await p.w.demarrerButin();
  const butin = partie.partagee.doc.Butin || {};
  verifier("2 objets par héros, rien d'office à la mise en commun",
           ["J1", "J2", "J3"].every(id => (((butin.parPersonnage || {})[id] || {}).items || []).length === 2) && Array.isArray(butin.commun) && butin.commun.length === 0);
  const origines = ["J1", "J2", "J3"].flatMap(id => (((butin.parPersonnage || {})[id] || {}).items || []).map(it => it.origine));
  verifier("…4 objets de créatures, 2 au hasard", origines.filter(o => o === "monstre").length === 4 && origines.filter(o => o === "hasard").length === 2,
           JSON.stringify(origines));
  // Un renfort arrivé APRÈS la préparation, sans prévision : il rapporte quand même.
  const partie2 = creerPartie({});
  const docs2 = creerDocuments();
  const m2 = [creature("A", "Petit")];
  const q = creerPoste({ partie: partie2, documents: docs2, persos: heros(1), monstres: m2 });
  await q.w.preparerButinEnAvance();
  m2.push(creature("B", "Normal"), creature("C", "Normal"));
  m2.forEach(m => { m.statut = "Mort"; });
  q.w.PERSOS_PARTIE = [...heros(1), ...m2];
  await q.w.demarrerButin();
  const b2 = partie2.partagee.doc.Butin || {};
  verifier("un héros seul, 3 créatures dont 2 sans prévision : 2 pour lui, 1 en commun",
           (((b2.parPersonnage || {}).J1 || {}).items || []).length === 2 && (b2.commun || []).length === 1);
}

// ==========================================================================
console.log("\n7. LA COHUE (Apparition 4) : 2 PAR JOUEUR, ET LA MISE EN COMMUN (v270)");
{
  const partie = creerPartie({ Apparition_Butin: { parJoueur: 2, xpPct: -10 } });
  const docs = creerDocuments();
  const monstres = [creature("L", "Normal", true), ...Array.from({ length: 6 }, (_, i) => creature("C" + i, "Petit"))];
  monstres.forEach(m => { m.statut = "Mort"; });
  const p = creerPoste({ partie, documents: docs, persos: heros(3), monstres });
  await p.w.demarrerButin();
  const butin = partie.partagee.doc.Butin || {};
  verifier("2 objets par héros, le surplus (1) et le bonus du leader à la mise en commun",
           ["J1", "J2", "J3"].every(id => (((butin.parPersonnage || {})[id] || {}).items || []).length === 2)
           && Array.isArray(butin.commun) && butin.commun.length === 2 && !("sansPartage" in butin));
}

// ==========================================================================
console.log("\n8. CE QUE LA FENÊTRE ANNONCE");
{
  const partie = creerPartie({});
  const docs = creerDocuments();
  const p = creerPoste({ partie, documents: docs, persos: heros(1), monstres: [] });
  const item = (uid, origine) => ({ uid, nom: "Épée " + uid, rarete: "Rare", type: "Épée", emplacement: "Main", origine });
  const butin = { participants: ["J1"], parPersonnage: { J1: { items: [item("a"), item("b")], decisions: {}, valide: false } },
                  commun: [item("c", "monstre"), item("d", "leader")] };
  p.w.peutEquiper = () => ({ possible: true });
  p.w.rendreVuePersonnelleButin(butin, [heros(1)[0]], heros(1)[0]);
  const html = p.elements["butin-vue-personnel"].innerHTML || "";
  verifier("la vue personnelle annonce la mise en commun et le bonus",
           /À la mise en commun : 2 objets de plus \(dont le bonus du leader\)/.test(html), html.slice(0, 80).replace(/\s+/g, " "));
  const carte = essayer(() => p.w.rendreCarteLootPool({ ...item("d", "leader"), candidats: [] }, ["J1"], false), "");
  verifier("la carte du partage marque le bonus du leader", /Bonus du leader/.test(carte));
  const aDessiner = (p.w.objetsAIllustrer({ participants: ["J1"], parPersonnage: butin.parPersonnage, commun: butin.commun }, ["J1"]) || []).map(o => o.uid);
  verifier("la mise en commun d'office est dessinée par le poste du premier héros", aDessiner.join() === "a,b,c,d", aDessiner.join());
}

// ==========================================================================
console.log("\n9. LES VERSIONS");
{
  const html = fs.readFileSync(RACINE + '/index.html', 'utf-8');
  const trace = fs.readFileSync(RACINE + '/trace_combat.js', 'utf-8');
  const version = JSON.parse(fs.readFileSync(RACINE + '/version.json', 'utf-8'));
  const vTrace = Number((trace.match(/VERSION_IVALIS\s*=\s*(\d+)/) || [])[1]);
  verifier("version 269 ou plus (trace_combat.js, version.json)", vTrace >= 269 && version.version === vTrace, `${vTrace} / ${version.version}`);
  const v = (nom) => Number((html.match(new RegExp(nom.replace(".", "\\.") + "\\?v=(\\d+)")) || [])[1]);
  verifier("loot.js, objets.js, objets_ia.js et style.css ont changé de version",
           v("loot.js") >= 30 && v("objets.js") >= 19 && v("objets_ia.js") >= 17 && v("style.css") >= 100);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
