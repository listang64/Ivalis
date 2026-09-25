// UN CERVEAU DESTITUÉ N'ÉCRASE PLUS CE QUE LE NOUVEAU A PUBLIÉ.
//
// Désynchronisation vue à la table (trace du PC, P_01) : le PC perd le réseau
// (ERR_QUIC_PROTOCOL_ERROR sur les canaux Listen et Write), l'entrée n°29
// arrive avec 20 étapes… puis se rejoue avec 8. Deux postes avaient publié un
// n°29 différent.
//
// La mécanique : le dépôt publiait par un writeBatch « à l'aveugle ». Un poste
// qui perd le réseau continue de lire son CACHE — qui le dit toujours cerveau —,
// calcule son pas et publie ; Firestore MET LE LOT EN ATTENTE et l'applique à la
// reconnexion. Entre-temps, un autre poste a constaté le silence et repris la
// main, puis publié le même numéro. À la reconnexion, le lot en attente écrase
// l'entrée ET l'état (qui redit « le cerveau, c'est P_01 »). Chaque écran a
// rejoué un n°29 différent.
//
// Désormais la publication passe par une transaction (io.lotSousCondition) qui
// relit l'état au moment d'écrire : elle n'écrit que si ce poste tient ENCORE
// le cerveau et que la base est à la version dont le pas est parti. Une
// transaction ne se met jamais en attente hors ligne : elle échoue.
//
// Ce banc simule deux postes sur une même base, dont l'un peut perdre le réseau
// comme le vrai SDK : lectures servies par le cache, lots mis en attente puis
// appliqués à la reconnexion, transactions refusées.
import { construireEtatCombat } from '../combat_etat.js';
import { creerCerveau } from '../cerveau_combat.js';
import { creerDepot, ouvrirCombat, envoyerIntention, CHEMINS } from '../depot_firestore.js';

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(70)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const clone = (v) => v == null ? v : JSON.parse(JSON.stringify(v));
const cle = (chemin) => chemin.join("/");

// Une base, et un accès par poste — qui peut se couper du réseau.
function creerBase() {
  const base = new Map();
  const appliquer = (ops) => {
    const aVerser = ops.map(o => {
      const c = cle(o.chemin);
      if (o.op === "delete") return [c, null];
      if (o.op === "update") {
        const avant = base.get(c);
        if (!avant) throw new Error("update sur un document absent : " + c);
        return [c, { ...avant, ...clone(o.data) }];
      }
      return [c, clone(o.data)];
    });
    aVerser.forEach(([c, v]) => { if (v === null) base.delete(c); else base.set(c, v); });
  };
  const documentsDe = (source, chemin, requete) => {
    const prefixe = cle(chemin) + "/";
    let l = [...source.entries()].filter(([c]) => c.startsWith(prefixe) && !c.slice(prefixe.length).includes("/"))
      .map(([c, d]) => ({ ...clone(d), __chemin: c.split("/") }));
    if (requete && requete.egal) l = l.filter(d => d[requete.egal.champ] === requete.egal.valeur);
    if (requete && requete.sup !== undefined) l = l.filter(d => Number(d[requete.champ]) > Number(requete.sup));
    return l;
  };

  function poste({ conditionnel = true } = {}) {
    let cache = null;           // non nul = hors ligne
    const enAttente = [];       // lots mis en attente hors ligne
    const vue = () => cache || base;
    const io = {
      async lire(chemin) { return clone(vue().get(cle(chemin)) || null); },
      async lister(chemin, requete) { return documentsDe(vue(), chemin, requete); },
      // Le vrai SDK : hors ligne, le lot est retenu et son `commit` ne se
      // résout qu'à la reconnexion — il s'applique alors, tel quel.
      lot(ops) {
        if (!cache) { appliquer(ops); return Promise.resolve(); }
        appliquer.call(null, []);            // rien tout de suite
        ops.forEach(o => {                   // le cache local, lui, voit sa propre écriture
          const c = cle(o.chemin);
          if (o.op === "update") cache.set(c, { ...(cache.get(c) || {}), ...clone(o.data) });
          else if (o.op !== "delete") cache.set(c, clone(o.data));
        });
        return new Promise(res => enAttente.push(() => { appliquer(ops); res(); }));
      },
      async transaction(chemin, decider) {
        if (cache) { const e = new Error("client is offline"); e.code = "unavailable"; throw e; }
        const aEcrire = decider(clone(base.get(cle(chemin)) || null));
        if (!aEcrire) return false;
        base.set(cle(chemin), clone(aEcrire));
        return true;
      }
    };
    if (conditionnel) {
      io.lotSousCondition = async (chemin, decider) => {
        if (cache) { const e = new Error("client is offline"); e.code = "unavailable"; throw e; }
        const ops = decider(clone(base.get(cle(chemin)) || null));
        if (!ops) return false;
        appliquer(ops);
        return true;
      };
    }
    return {
      io,
      couper() { cache = new Map([...base.entries()].map(([k, v]) => [k, clone(v)])); },
      async rebrancher() { cache = null; while (enAttente.length) enAttente.shift()(); await new Promise(r => setTimeout(r, 0)); }
    };
  }
  return { base, poste, lire: (chemin) => clone(base.get(cle(chemin)) || null) };
}

const fiche = (id, extra = {}) => ({ idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100,
  Fatigue_Actuelle: 100, Esquive: 0, Parade: 0, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
const monde = () => construireEtatCombat({
  idPartie: "G", cerveau: "P_01", graine: 4242, combat: "renc_1",
  combattants: [fiche("H1", { idJoueur: "P_03", camp: "Allié" }), fiche("M1", { estMonstre: true, camp: "Ennemi" })],
  positions: { H1: { q: 0, r: 0 }, M1: { q: 3, r: 0 } },
  partie: { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"],
            File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C_H1" }, { idPersonnage: "M1", idCarte: "C_M1" }] }
});
const carteDe = () => null;
const P = "G";

// La scène de la table. Rend ce qu'il y a en base à la fin.
async function scene({ conditionnel }) {
  const b = creerBase();
  const pc = b.poste({ conditionnel }), ipad = b.poste({ conditionnel });
  await ouvrirCombat(ipad.io, P, monde());
  await envoyerIntention(ipad.io, P, { type: "mouvement", acteur: "H1", poste: "P_03", chemin: [{ q: 1, r: 0 }], id: "INT_1" });

  const cervPC = creerCerveau(creerDepot(pc.io, P, { maintenant: () => 111 }), { poste: "P_01", carteDe });
  const cervIpad = creerCerveau(creerDepot(ipad.io, P, { maintenant: () => 222 }), { poste: "P_03", carteDe });

  // 1. Le PC perd le réseau et calcule quand même son pas (son cache le dit cerveau).
  pc.couper();
  let erreurPC = null;
  const publicationPC = cervPC.unTour().catch(e => { erreurPC = e; });
  await new Promise(r => setTimeout(r, 0));

  // 2. L'iPad constate le silence, reprend la main, et publie le même numéro.
  const pris = await creerDepot(ipad.io, P).reprendre(a => ({ ...a, cerveau: "P_03", battement: 222 }));
  const rIpad = await cervIpad.unTour();

  // 3. Le PC revient.
  await pc.rebrancher();
  await publicationPC;
  return { b, pris, rIpad, erreurPC, etat: b.lire(CHEMINS.etat(P)), entree: b.lire(CHEMINS.entree(P, 1)) };
}

console.log("\n1. SANS LA CONDITION (l'ancien dépôt) : LE DÉFAUT DE LA TABLE");
{
  const r = await scene({ conditionnel: false });
  verifier("l'iPad a bien repris la main et publié le n°1", r.pris && r.rIpad.publie === 1, JSON.stringify(r.rIpad));
  verifier("à la reconnexion, le lot du PC écrase l'entrée n°1", r.entree && r.entree.horodatage === 111,
           `horodatage ${r.entree && r.entree.horodatage}`);
  verifier("et l'état redit « le cerveau, c'est le PC »", r.etat.cerveau === "P_01", r.etat.cerveau);
}

console.log("\n2. AVEC LA CONDITION : LE CERVEAU DESTITUÉ NE PUBLIE PLUS");
{
  const r = await scene({ conditionnel: true });
  verifier("l'iPad a repris la main et publié le n°1", r.pris && r.rIpad.publie === 1, JSON.stringify(r.rIpad));
  verifier("la publication du PC hors ligne a échoué, rien n'est en attente", !!r.erreurPC,
           String(r.erreurPC && r.erreurPC.message));
  verifier("l'entrée n°1 est celle de l'iPad, intacte", r.entree && r.entree.horodatage === 222,
           `horodatage ${r.entree && r.entree.horodatage}`);
  verifier("l'état reste à l'iPad", r.etat.cerveau === "P_03" && r.etat.version === 1, `${r.etat.cerveau} v${r.etat.version}`);
}

console.log("\n3. EN LIGNE MAIS EN RETARD : LA BASE TRANCHE AU MOMENT D'ÉCRIRE");
{
  // Le PC a lu l'état AVANT la reprise (lecture périmée), et publie après.
  const b = creerBase();
  const pc = b.poste(), ipad = b.poste();
  await ouvrirCombat(ipad.io, P, monde());
  await envoyerIntention(ipad.io, P, { type: "mouvement", acteur: "H1", poste: "P_03", chemin: [{ q: 1, r: 0 }], id: "INT_1" });
  const depotPC = creerDepot(pc.io, P, { maintenant: () => 111 });
  const perime = await pc.io.lire(CHEMINS.etat(P));
  await creerDepot(ipad.io, P).reprendre(a => ({ ...a, cerveau: "P_03", battement: 222 }));
  await creerCerveau(creerDepot(ipad.io, P, { maintenant: () => 222 }), { poste: "P_03", carteDe }).unTour();
  const suivant = { ...perime, version: 1 };
  let refus = null;
  try { await depotPC.publier(suivant, { v: 1, etapes: [], acteur: "H1" }, []); } catch (e) { refus = e; }
  verifier("publier depuis un état périmé est refusé (cerveau destitué)", refus && refus.code === "cerveau-destitue",
           String(refus && refus.message));
  verifier("l'entrée n°1 est toujours celle de l'iPad", b.lire(CHEMINS.entree(P, 1)).horodatage === 222);

  // Même cerveau, mais la base a déjà avancé : pas de doublon de numéro.
  let doublon = null;
  const etatIpad = b.lire(CHEMINS.etat(P));
  try { await creerDepot(ipad.io, P).publier({ ...etatIpad, version: 1 }, { v: 1, etapes: [] }, []); } catch (e) { doublon = e; }
  verifier("republier un numéro déjà publié est refusé", doublon && doublon.code === "cerveau-destitue");

  // Le battement de l'ancien cerveau ne touche plus l'état.
  const avant = b.lire(CHEMINS.etat(P)).battement;
  await depotPC.battre(999, "P_01");
  verifier("le battement de l'ancien cerveau n'écrit rien", b.lire(CHEMINS.etat(P)).battement === avant,
           `${avant} → ${b.lire(CHEMINS.etat(P)).battement}`);
}

console.log("\n4. LE VRAI ACCÈS FIRESTORE (app.js) SAIT FAIRE UN LOT SOUS CONDITION");
{
  const fs = await import('fs');
  const app = fs.readFileSync('/home/user/Ivalis/app.js', 'utf-8');
  const bloc = app.slice(app.indexOf('async lotSousCondition(chemin, decider)'), app.indexOf('ecouterDoc(chemin, rappel)'));
  verifier("lotSousCondition existe dans ioCombatFirestore", bloc.length > 0 && app.indexOf('async lotSousCondition') > 0);
  verifier("il passe par runTransaction (jamais mis en attente hors ligne)", /runTransaction\(db/.test(bloc));
  verifier("il relit le document dans la transaction avant d'écrire", /tx\.get\(ref\)/.test(bloc) && /tx\.set|tx\.update/.test(bloc));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
