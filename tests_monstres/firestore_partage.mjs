// UN FIRESTORE PARTAGÉ PAR PLUSIEURS VRAIES PAGES DU JEU.
//
// Les autres bancs découpent une fonction et la font tourner seule, ou chargent
// la vraie page avec un Firestore qui n'écrit nulle part. Aucun ne pouvait donc
// répondre à la seule question qui compte un soir de partie : « trois appareils
// ouvrent la même rencontre, chacun choisit sa carte — le combat se lance-t-il ? »
//
// Ce module tient la base côté Node, UNE SEULE pour toutes les pages, et sert à
// chaque page un faux SDK qui parle exactement la langue du vrai (doc, collection,
// query, getDoc, setDoc avec ou sans merge, updateDoc et ses chemins pointés,
// writeBatch, runTransaction, onSnapshot, les sentinelles). Ce qu'il reproduit
// du vrai service, et qui compte pour le jeu :
//
//   • les écoutes sont notifiées après chaque écriture, avec une latence propre
//     à chaque page — deux appareils ne voient jamais le monde au même instant ;
//   • une transaction relit ce qu'elle a lu au moment de s'engager, et recommence
//     si quelqu'un l'a doublée (concurrence optimiste, cinq essais, comme le SDK) ;
//   • un lot s'applique en entier ou pas du tout ;
//   • updateDoc sur un document absent échoue (« not-found »), setDoc ne découpe
//     pas ses clés sur les points, updateDoc si ;
//   • une requête triée écarte les documents qui n'ont pas le champ du tri.
//
// Rien ici ne connaît le jeu : c'est une base, et c'est tout.

const clone = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));

// =========================================================================
//  LE FAUX SDK SERVI AUX PAGES (à la place de firebase-firestore.js)
// =========================================================================
export const SOURCE_FAUX_SDK = `
const appeler = (op, charge) => window.__fsRPC(op, charge);
let compteurId = 0;
const idAuto = () => "auto_" + Date.now().toString(36) + "_" + (compteurId++).toString(36)
                   + Math.random().toString(36).slice(2, 7);

export class FieldPath { constructor(...segments) { this.segments = segments; } }

class DocumentReference {
  constructor(chemin) {
    this.type = "document"; this.path = chemin;
    const s = chemin.split("/"); this.id = s[s.length - 1];
  }
  get parent() { return new CollectionReference(this.path.split("/").slice(0, -1).join("/")); }
  withConverter() { return this; }
}
class CollectionReference {
  constructor(chemin) {
    this.type = "collection"; this.path = chemin;
    const s = chemin.split("/"); this.id = s[s.length - 1];
  }
  withConverter() { return this; }
}
class Query {
  constructor(chemin, contraintes) { this.type = "query"; this.path = chemin; this.contraintes = contraintes; }
  withConverter() { return this; }
}

const segmentsDe = (args) => args.flatMap(a => String(a).split("/")).filter(s => s !== "");

export function initializeFirestore() { return { __base: true }; }
export function getFirestore() { return { __base: true }; }
export function enableIndexedDbPersistence() { return Promise.resolve(); }

export function doc(parent, ...segments) {
  if (parent instanceof CollectionReference) {
    const reste = segmentsDe(segments);
    return new DocumentReference([parent.path, ...(reste.length ? reste : [idAuto()])].join("/"));
  }
  if (parent instanceof DocumentReference) return new DocumentReference([parent.path, ...segmentsDe(segments)].join("/"));
  return new DocumentReference(segmentsDe(segments).join("/"));
}
export function collection(parent, ...segments) {
  if (parent instanceof DocumentReference || parent instanceof CollectionReference) {
    return new CollectionReference([parent.path, ...segmentsDe(segments)].join("/"));
  }
  return new CollectionReference(segmentsDe(segments).join("/"));
}
const champDe = (c) => c instanceof FieldPath ? c.segments.join(".") : String(c);
export function query(base, ...contraintes) {
  const avant = base instanceof Query ? base.contraintes : [];
  return new Query(base.path, [...avant, ...contraintes.filter(Boolean)]);
}
export const where = (champ, op, valeur) => ({ type: "where", champ: champDe(champ), op, valeur });
export const orderBy = (champ, sens = "asc") => ({ type: "orderBy", champ: champDe(champ), sens });
export const limit = (n) => ({ type: "limit", n });
export const documentId = () => "__name__";

export const deleteField = () => ({ __fs: "delete" });
export const serverTimestamp = () => ({ __fs: "serverTimestamp" });
export const increment = (n) => ({ __fs: "increment", n });
export const arrayUnion = (...v) => ({ __fs: "arrayUnion", v });
export const arrayRemove = (...v) => ({ __fs: "arrayRemove", v });
export const Timestamp = {
  now: () => ({ seconds: Math.floor(Date.now() / 1000), nanoseconds: 0,
                toMillis() { return this.seconds * 1000; }, toDate() { return new Date(this.seconds * 1000); } }),
  fromMillis: (ms) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0,
                toMillis() { return this.seconds * 1000; }, toDate() { return new Date(this.seconds * 1000); } })
};

const lireChamp = (data, champ) => String(champ).split(".").reduce((o, k) => (o == null ? undefined : o[k]), data);
const cloner = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));

function instantaneDoc(chemin, existe, data) {
  return {
    id: chemin.split("/").pop(), ref: new DocumentReference(chemin),
    exists: () => !!existe,
    data: () => existe ? cloner(data) : undefined,
    get: (champ) => existe ? cloner(lireChamp(data, champDe(champ))) : undefined,
    metadata: { hasPendingWrites: false, fromCache: false }
  };
}
function instantaneRequete(docs, changements) {
  const liste = docs.map(d => instantaneDoc(d.chemin, true, d.data));
  return {
    docs: liste, size: liste.length, empty: liste.length === 0,
    forEach: (fn) => liste.forEach(fn),
    docChanges: () => (changements || []).map(c => ({
      type: c.type, doc: instantaneDoc(c.chemin, true, c.data), oldIndex: c.oldIndex, newIndex: c.newIndex
    })),
    metadata: { hasPendingWrites: false, fromCache: false }
  };
}
const cible = (ref) => ref instanceof Query
  ? { type: "query", path: ref.path, contraintes: ref.contraintes }
  : ref instanceof CollectionReference
    ? { type: "query", path: ref.path, contraintes: [] }
    : { type: "doc", path: ref.path };

function erreur(code, message) {
  const e = new Error(message || code);
  e.code = code; e.name = "FirebaseError";
  return e;
}
async function envoyer(op, charge) {
  const r = await appeler(op, charge);
  if (r && r.erreur) throw erreur(r.erreur, r.message);
  return r;
}

export async function getDoc(ref) {
  const r = await envoyer("lire", { path: ref.path });
  return instantaneDoc(ref.path, r.existe, r.data);
}
export const getDocFromServer = getDoc;
export async function getDocs(ref) {
  const c = cible(ref);
  const r = await envoyer("requete", c);
  return instantaneRequete(r.docs, r.docs.map((d, i) => ({ type: "added", chemin: d.chemin, data: d.data, oldIndex: -1, newIndex: i })));
}

// Une écriture = une liste d'opérations, appliquées d'un bloc par la base.
function opSet(ref, data, options) { return { type: "set", path: ref.path, data, merge: !!(options && (options.merge || options.mergeFields)) }; }
function opUpdate(ref, args) {
  let champs = [];
  if (args.length === 1 && args[0] && typeof args[0] === "object" && !(args[0] instanceof FieldPath)) {
    champs = Object.entries(args[0]).map(([k, v]) => [k.split("."), v]);
  } else {
    for (let i = 0; i < args.length; i += 2) {
      const cle = args[i];
      champs.push([cle instanceof FieldPath ? cle.segments : String(cle).split("."), args[i + 1]]);
    }
  }
  return { type: "update", path: ref.path, champs };
}
export async function setDoc(ref, data, options) { await envoyer("ecrire", { ops: [opSet(ref, data, options)] }); }
export async function updateDoc(ref, ...args) { await envoyer("ecrire", { ops: [opUpdate(ref, args)] }); }
export async function deleteDoc(ref) { await envoyer("ecrire", { ops: [{ type: "delete", path: ref.path }] }); }
export async function addDoc(coll, data) {
  const ref = doc(coll);
  await envoyer("ecrire", { ops: [opSet(ref, data)] });
  return ref;
}

export function writeBatch() {
  const ops = [];
  const lot = {
    set(ref, data, options) { ops.push(opSet(ref, data, options)); return lot; },
    update(ref, ...args) { ops.push(opUpdate(ref, args)); return lot; },
    delete(ref) { ops.push({ type: "delete", path: ref.path }); return lot; },
    async commit() { if (ops.length) await envoyer("ecrire", { ops }); }
  };
  return lot;
}

// Concurrence optimiste, comme le vrai SDK : on note la version de chaque
// document lu, et la base refuse l'engagement si l'un d'eux a bougé entre-temps.
export async function runTransaction(_base, fonction) {
  let derniere = null;
  for (let essai = 0; essai < 5; essai++) {
    const lus = {};
    const ops = [];
    const tx = {
      async get(ref) {
        const r = await envoyer("lire", { path: ref.path });
        lus[ref.path] = r.version;
        return instantaneDoc(ref.path, r.existe, r.data);
      },
      set(ref, data, options) { ops.push(opSet(ref, data, options)); return tx; },
      update(ref, ...args) { ops.push(opUpdate(ref, args)); return tx; },
      delete(ref) { ops.push({ type: "delete", path: ref.path }); return tx; }
    };
    const resultat = await fonction(tx);
    const r = await appeler("ecrire", { ops, lus });
    if (!r || !r.erreur) return resultat;
    derniere = erreur(r.erreur, r.message);
    if (r.erreur !== "aborted") throw derniere;
    await new Promise(res => setTimeout(res, 10 + Math.random() * 40));
  }
  throw erreur("failed-precondition", "transaction abandonnée après cinq essais (contention)");
}

const ECOUTES = new Map();
window.__fsLivrer = (id, charge) => {
  const e = ECOUTES.get(id);
  if (!e) return;
  try {
    if (charge.type === "doc") e.suivant(instantaneDoc(charge.path, charge.existe, charge.data));
    else e.suivant(instantaneRequete(charge.docs, charge.changements));
  } catch (err) {
    console.error("Écouteur Firestore (banc) :", err);
  }
};
export function onSnapshot(ref, ...args) {
  // onSnapshot(ref, options?, suivant, erreur?) ou onSnapshot(ref, { next, error })
  let i = 0;
  if (args[i] && typeof args[i] === "object" && typeof args[i].next !== "function") i++;
  let suivant = args[i], surErreur = args[i + 1];
  if (suivant && typeof suivant === "object") { surErreur = suivant.error; suivant = suivant.next; }
  const id = "ec_" + idAuto();
  ECOUTES.set(id, { suivant: suivant || (() => {}), erreur: surErreur });
  appeler("ecouter", { id, cible: cible(ref) });
  return () => { ECOUTES.delete(id); appeler("arreter", { id }); };
}
`;

export const SOURCE_FAUX_APP = `
export const initializeApp = () => ({ nom: "banc" });
export const getApp = () => ({ nom: "banc" });
export const getApps = () => [];
`;

// =========================================================================
//  LA BASE, CÔTÉ NODE
// =========================================================================
export function creerFirestorePartage(initial = {}, options = {}) {
  const latence = options.latence || ((nomPage) => 5 + Math.floor(Math.random() * 30));
  const docs = new Map();          // chemin -> { data, version }
  let horloge = 0;
  const ecoutes = new Map();       // id -> { page, nomPage, cible, dernier }
  const filesPages = new Map();    // page -> Promise (livraisons dans l'ordre)
  const trace = [];                // les écritures, pour relire ce qui s'est passé
  let enVol = 0;

  // LE COMPTEUR DE LA FACTURE. Firestore ne facture pas des appels, il facture
  // des DOCUMENTS : une lecture par document rendu (une requête vide en coûte
  // une quand même), une lecture par document ajouté ou modifié dans une écoute,
  // une écriture par document écrit. On compte ici exactement ça, par appareil
  // et par collection — c'est ce qui dit où part le quota gratuit du jour.
  const factures = { lectures: {}, ecritures: {}, suppressions: {} };
  const generique = (chemin) => chemin.split("/").map((s, i) => (i % 2 === 1 ? "*" : s)).join("/");
  function facturer(sorte, nomPage, chemin, n = 1) {
    if (!n) return;
    const f = factures[sorte];
    const cle = `${nomPage}|${generique(chemin)}`;
    f[cle] = (f[cle] || 0) + n;
  }

  Object.entries(initial).forEach(([chemin, data]) => docs.set(chemin, { data: clone(data), version: ++horloge }));

  const versionDe = (chemin) => (docs.get(chemin) || { version: 0 }).version;
  const existe = (chemin) => { const d = docs.get(chemin); return !!(d && d.data); };

  const lireChamp = (data, champ, chemin) => {
    if (champ === "__name__") return chemin.split("/").pop();
    return String(champ).split(".").reduce((o, k) => (o == null ? undefined : o[k]), data);
  };
  const comparer = (a, b) => {
    if (a === b) return 0;
    if (a === undefined || a === null) return -1;
    if (b === undefined || b === null) return 1;
    if (typeof a === "number" && typeof b === "number") return a < b ? -1 : 1;
    return String(a) < String(b) ? -1 : 1;
  };
  const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const testerWhere = (v, op, attendu) => {
    if (v === undefined) return false;
    switch (op) {
      case "==": return egal(v, attendu);
      case "!=": return !egal(v, attendu);
      case ">": return comparer(v, attendu) > 0;
      case ">=": return comparer(v, attendu) >= 0;
      case "<": return comparer(v, attendu) < 0;
      case "<=": return comparer(v, attendu) <= 0;
      case "in": return (attendu || []).some(x => egal(x, v));
      case "not-in": return !(attendu || []).some(x => egal(x, v));
      case "array-contains": return Array.isArray(v) && v.some(x => egal(x, attendu));
      case "array-contains-any": return Array.isArray(v) && v.some(x => (attendu || []).some(y => egal(x, y)));
      default: throw new Error("opérateur inconnu : " + op);
    }
  };

  function requete(cheminCollection, contraintes = []) {
    const prefixe = cheminCollection + "/";
    let liste = [];
    for (const [chemin, d] of docs) {
      if (!d.data || !chemin.startsWith(prefixe) || chemin.slice(prefixe.length).includes("/")) continue;
      liste.push({ chemin, data: d.data });
    }
    contraintes.filter(c => c.type === "where").forEach(c => {
      liste = liste.filter(x => testerWhere(lireChamp(x.data, c.champ, x.chemin), c.op, c.valeur));
    });
    const tris = contraintes.filter(c => c.type === "orderBy");
    if (tris.length) {
      liste = liste.filter(x => tris.every(t => lireChamp(x.data, t.champ, x.chemin) !== undefined));
      liste.sort((a, b) => {
        for (const t of tris) {
          const r = comparer(lireChamp(a.data, t.champ, a.chemin), lireChamp(b.data, t.champ, b.chemin));
          if (r) return t.sens === "desc" ? -r : r;
        }
        return a.chemin < b.chemin ? -1 : 1;
      });
    } else {
      liste.sort((a, b) => (a.chemin < b.chemin ? -1 : a.chemin > b.chemin ? 1 : 0));
    }
    const lim = contraintes.find(c => c.type === "limit");
    if (lim) liste = liste.slice(0, lim.n);
    return liste.map(x => ({ chemin: x.chemin, data: clone(x.data) }));
  }

  // --- Les écritures -------------------------------------------------------
  const estSentinelle = (v) => v && typeof v === "object" && !Array.isArray(v) && typeof v.__fs === "string";
  const estObjet = (v) => v && typeof v === "object" && !Array.isArray(v) && !estSentinelle(v);

  function resoudre(valeur, ancienne) {
    if (estSentinelle(valeur)) {
      if (valeur.__fs === "serverTimestamp") return Date.now();
      if (valeur.__fs === "increment") return (typeof ancienne === "number" ? ancienne : 0) + valeur.n;
      if (valeur.__fs === "arrayUnion") {
        const base = Array.isArray(ancienne) ? clone(ancienne) : [];
        valeur.v.forEach(x => { if (!base.some(y => egal(x, y))) base.push(clone(x)); });
        return base;
      }
      if (valeur.__fs === "arrayRemove") {
        return (Array.isArray(ancienne) ? ancienne : []).filter(y => !valeur.v.some(x => egal(x, y)));
      }
      return undefined;   // delete
    }
    if (Array.isArray(valeur)) return valeur.map(x => resoudre(x, undefined));
    if (estObjet(valeur)) {
      const sortie = {};
      Object.entries(valeur).forEach(([k, v]) => {
        if (estSentinelle(v) && v.__fs === "delete") return;
        sortie[k] = resoudre(v, undefined);
      });
      return sortie;
    }
    return valeur;
  }

  function fusionner(cibleObj, source) {
    Object.entries(source).forEach(([k, v]) => {
      if (estSentinelle(v) && v.__fs === "delete") { delete cibleObj[k]; return; }
      if (estObjet(v) && estObjet(cibleObj[k])) { fusionner(cibleObj[k], v); return; }
      if (estObjet(v)) { cibleObj[k] = {}; fusionner(cibleObj[k], v); return; }
      cibleObj[k] = resoudre(v, cibleObj[k]);
    });
  }

  // LE QUOTA ÉPUISÉ, À LA DEMANDE. Quand il est levé, toute écriture est
  // refusée avec le code de Firebase (« resource-exhausted »), exactement ce
  // que le vrai service renvoie quand le quota gratuit du jour est parti.
  let refus = null;

  function appliquer(ops, lus, nomPage = "node") {
    if (refus && nomPage !== "node") return { erreur: refus, message: "Quota exceeded." };
    // 1. La transaction a-t-elle été doublée ?
    for (const [chemin, version] of Object.entries(lus || {})) {
      if (versionDe(chemin) !== version) return { erreur: "aborted", message: "document modifié pendant la transaction : " + chemin };
    }
    // 2. Tout ou rien : on prépare sur une copie.
    const brouillon = new Map();
    const lireBrouillon = (chemin) => brouillon.has(chemin) ? brouillon.get(chemin) : (existe(chemin) ? clone(docs.get(chemin).data) : null);
    for (const op of ops) {
      const actuel = lireBrouillon(op.path);
      if (op.type === "delete") { brouillon.set(op.path, null); continue; }
      if (op.type === "set") {
        if (op.merge) {
          const base = actuel || {};
          fusionner(base, op.data);
          brouillon.set(op.path, base);
        } else {
          brouillon.set(op.path, resoudre(op.data, undefined));
        }
        continue;
      }
      if (op.type === "update") {
        if (!actuel) return { erreur: "not-found", message: "No document to update: " + op.path };
        for (const [segments, valeur] of op.champs) {
          let noeud = actuel;
          for (let i = 0; i < segments.length - 1; i++) {
            if (!estObjet(noeud[segments[i]])) noeud[segments[i]] = {};
            noeud = noeud[segments[i]];
          }
          const dernier = segments[segments.length - 1];
          if (estSentinelle(valeur) && valeur.__fs === "delete") delete noeud[dernier];
          else noeud[dernier] = resoudre(valeur, noeud[dernier]);
        }
        brouillon.set(op.path, actuel);
        continue;
      }
      return { erreur: "invalid-argument", message: "opération inconnue " + op.type };
    }
    // 3. On verse, et on prévient.
    const touches = [];
    for (const [chemin, data] of brouillon) {
      docs.set(chemin, { data, version: ++horloge });
      touches.push(chemin);
    }
    ops.forEach(op => facturer(op.type === "delete" ? "suppressions" : "ecritures", nomPage, op.path));
    trace.push({ t: Date.now(), ops: ops.map(o => o.type + ":" + o.path) });
    prevenir(touches);
    return { ok: true };
  }

  // --- Les écoutes ---------------------------------------------------------
  function evaluer(c) {
    if (c.type === "doc") {
      const d = docs.get(c.path);
      return { type: "doc", path: c.path, existe: !!(d && d.data), data: d && d.data ? clone(d.data) : null };
    }
    return { type: "query", path: c.path, docs: requete(c.path, c.contraintes) };
  }

  function livrer(page, nomPage, id, charge) {
    const precedente = filesPages.get(page) || Promise.resolve();
    enVol++;
    const suivante = precedente.then(async () => {
      await new Promise(r => setTimeout(r, latence(nomPage)));
      if (!ecoutes.has(id) || page.isClosed()) return;
      await page.evaluate(([i, c]) => window.__fsLivrer && window.__fsLivrer(i, c), [id, charge]).catch(() => {});
    }).finally(() => { enVol--; });
    filesPages.set(page, suivante);
  }

  function envoyerEcoute(id, e, premiere) {
    const charge = evaluer(e.cible);
    if (charge.type === "query") {
      const avant = e.dernier ? e.dernier.docs : [];
      if (!premiere && e.dernier && egal(avant, charge.docs)) return;
      const indexAvant = new Map(avant.map((d, i) => [d.chemin, i]));
      const indexApres = new Map(charge.docs.map((d, i) => [d.chemin, i]));
      const changements = [];
      avant.forEach((d, i) => { if (!indexApres.has(d.chemin)) changements.push({ type: "removed", chemin: d.chemin, data: d.data, oldIndex: i, newIndex: -1 }); });
      charge.docs.forEach((d, i) => {
        if (!indexAvant.has(d.chemin)) changements.push({ type: "added", chemin: d.chemin, data: d.data, oldIndex: -1, newIndex: i });
        else if (!egal(avant[indexAvant.get(d.chemin)].data, d.data)) changements.push({ type: "modified", chemin: d.chemin, data: d.data, oldIndex: indexAvant.get(d.chemin), newIndex: i });
      });
      charge.changements = changements;
      const payees = premiere ? Math.max(1, charge.docs.length)
                              : changements.filter(c => c.type !== "removed").length;
      facturer("lectures", e.nomPage, e.cible.path, payees);
    } else if (!premiere && e.dernier && egal(e.dernier, charge)) {
      return;
    } else {
      facturer("lectures", e.nomPage, e.cible.path, 1);
    }
    e.dernier = charge;
    livrer(e.page, e.nomPage, id, charge);
  }

  function prevenir(chemins) {
    for (const [id, e] of ecoutes) {
      const concerne = e.cible.type === "doc"
        ? chemins.includes(e.cible.path)
        : chemins.some(c => c.split("/").slice(0, -1).join("/") === e.cible.path);
      if (concerne) envoyerEcoute(id, e, false);
    }
  }

  // --- Le point d'entrée de chaque page ------------------------------------
  function traiter(page, nomPage, op, charge) {
    try {
      if (op === "lire") {
        const d = docs.get(charge.path);
        facturer("lectures", nomPage, charge.path, 1);
        return { existe: !!(d && d.data), data: d && d.data ? clone(d.data) : null, version: versionDe(charge.path) };
      }
      if (op === "requete") {
        const r = requete(charge.path, charge.contraintes || []);
        facturer("lectures", nomPage, charge.path, Math.max(1, r.length));
        return { docs: r };
      }
      if (op === "ecrire") return appliquer(charge.ops || [], charge.lus, nomPage);
      if (op === "ecouter") {
        const e = { page, nomPage, cible: charge.cible, dernier: null };
        ecoutes.set(charge.id, e);
        envoyerEcoute(charge.id, e, true);
        return { ok: true };
      }
      if (op === "arreter") { ecoutes.delete(charge.id); return { ok: true }; }
      return { erreur: "unimplemented", message: op };
    } catch (e) {
      return { erreur: "internal", message: String(e && e.stack || e) };
    }
  }

  return {
    async brancherPage(page, nomPage) {
      await page.exposeFunction("__fsRPC", (op, charge) => traiter(page, nomPage, op, charge));
    },
    oublierPage(page) {
      for (const [id, e] of ecoutes) if (e.page === page) ecoutes.delete(id);
    },
    refuserEcritures(code) { refus = code || null; },
    lire: (chemin) => { const d = docs.get(chemin); return d && d.data ? clone(d.data) : null; },
    lister: (cheminCollection) => requete(cheminCollection),
    ecrire: (ops) => appliquer(ops),
    chemins: () => [...docs.keys()].filter(c => docs.get(c).data),
    trace,
    // Une photo des compteurs, et l'écart entre deux photos : c'est ce qui
    // permet de mesurer UNE manche, ou une minute d'attente, isolément.
    factures: () => clone(factures),
    ecartFactures(avant, apres) {
      const sortie = {};
      for (const sorte of Object.keys(apres)) {
        sortie[sorte] = {};
        for (const [cle, n] of Object.entries(apres[sorte])) {
          const d = n - ((avant[sorte] || {})[cle] || 0);
          if (d) sortie[sorte][cle] = d;
        }
      }
      return sortie;
    },
    totalFactures(f, filtre = () => true) {
      const somme = (o) => Object.entries(o || {}).filter(([cle]) => filtre(cle)).reduce((s, [, n]) => s + n, 0);
      return { lectures: somme(f.lectures), ecritures: somme(f.ecritures), suppressions: somme(f.suppressions) };
    },
    async calme(ms = 150) {
      // Attend qu'aucune livraison ne soit plus en route.
      const fin = Date.now() + 10000;
      while (Date.now() < fin) {
        if (enVol === 0) { await new Promise(r => setTimeout(r, ms)); if (enVol === 0) return; }
        await new Promise(r => setTimeout(r, 20));
      }
    }
  };
}
