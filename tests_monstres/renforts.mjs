// Vérifie la chaîne complète : un monstre meurt -> il est marqué Mort ->
// un renfort de la réserve entre en jeu, avec ses techniques.
import fs from 'fs';

const base = { Systeme_Parties: { P1: { Ordre_Initiative: ["J1","J2"], File_Attente_Combat: [], Reserve_Monstres: [] } },
               Monstres: {}, Combat_VTT: { P1: { Tokens: {} } } };
const w = {}; global.window = w;
global.localStorage = { getItem: () => null };
global.fetch = async () => { throw new Error("IA débranchée"); };
global.document = { getElementById: () => null };

const db = {};
const doc = (_d, col, id, sub, subId) => sub ? { col, id, sub, subId } : { col, id };
const getDoc = async (ref) => ({ exists: () => !!base[ref.col]?.[ref.id], data: () => structuredClone(base[ref.col][ref.id]) });
const setDoc = async (ref, data, opt) => { base[ref.col][ref.id] = opt?.merge ? { ...(base[ref.col][ref.id]||{}), ...data } : data; };
const updateDoc = async (ref, data) => { if (!base[ref.col]?.[ref.id]) throw new Error("absent"); Object.assign(base[ref.col][ref.id], data); };
const deleteDoc = async (ref) => { delete base[ref.col][ref.id]; };
const deleteField = () => "__SUPPR__";
const collection = () => ({}); const getDocs = async () => ({ forEach(){} });
const onSnapshot = () => () => {}; const query = () => ({}); const where = () => ({});
const writeBatch = () => ({ set(){}, update(){}, async commit(){} });
const COLLECTION_MONSTRES = "Monstres";

// Monde de jeu minimal
w.ID_PARTIE_COURANTE = "P1";
w.PLATEAU_VTT = { getCaseState: () => ({ isBlocked:false, isDeleted:false, isDifficult:false }) };
w.TOKENS_VTT_DATA = {};
w.SOURCE_COMBATTANTS = {};
w.MONSTRES_PARTIE = [];
w.CACHE_COMPETENCES_GLOBAL = {};
let hex = 0;
w.trouverHexLibreVTT = () => ({ q: hex++, r: 0 });
w.GABARITS_MONSTRES = [{}];
const GAB = { "Petit":80, "Normal":120 };
w.gabaritMonstre = (a,p) => ({ Cle:a+p, Archetype:a, Palier:p, PV:50, Fatigue_Max:GAB[p]||100,
  Res_Physique:10, Res_Magique:10, Parade_Esquive:10, Regeneration:30, Repos_Long:90, Nombre_Actions:1, XP_Groupe:100 });
w.creerMonstreDepuisGabarit = async (id, gab, extra) => {
  w.SOURCE_COMBATTANTS[id] = "Monstres";
  base.Monstres[id] = { ID_Partie:"P1", Camp:"Ennemi", Statut:"Vivant", Archetype:gab.Archetype, Palier:gab.Palier,
                        PV_Max:gab.PV, PV_Actuels:gab.PV, ...extra };
  w.MONSTRES_PARTIE.push({ idPersonnage:id, estMonstre:true, statut:"Vivant", PV_Actuels:gab.PV, PV_Max:gab.PV,
                           camp:"Ennemi", prenom:extra.Prenom_Personnage });
  return base.Monstres[id];
};
w.appliquerTokensVTT = () => {};

// L'écriture d'un pion vit dans combat.js, chargé avant monstres.js sur la
// vraie page : un banc qui isole monstres.js doit la poser aussi.
{
  const lignes = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8').split('\n');
  const d = lignes.findIndex(l => l.startsWith('window.enregistrerPionsVTT = async function'));
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === '};') { f = i; break; } }
  new Function('window', 'db', 'doc', 'setDoc', lignes.slice(d, f + 1).join('\n'))(
    w, {}, (_db, col, id) => ({ col, id }),
    // Les chemins pointés ("Tokens.M1") ne touchent qu'un pion, comme Firestore.
    async (ref, maj) => {
      base[ref.col] = base[ref.col] || {};
      const cible = base[ref.col][ref.id] = base[ref.col][ref.id] || { Tokens: {} };
      cible.Tokens = cible.Tokens || {};
      Object.keys(maj).forEach(cle => {
        const [, id] = cle.split(".");
        if (id) cible.Tokens[id] = maj[cle];
      });
    });
}

// On charge les VRAIES fonctions de monstres.js (création, réserve, renforts).
const src = fs.readFileSync('/home/user/Ivalis/monstres.js','utf-8').replace(/^import[\s\S]*?from\s+"[^"]+";/gm,'').replace(/^export const/gm, 'const');
eval(src);

// ⚠️ monstres.js réinitialise lui-même MONSTRES_PARTIE et PERSOS_JOUEURS_PARTIE :
// tout ce qu'il définit doit être posé APRÈS son chargement, sinon il l'écrase.
w.PERSOS_JOUEURS_PARTIE = [{ idPersonnage:"J1", camp:"Allié" }, { idPersonnage:"J2", camp:"Allié" }];
w.estMonstre = (id) => w.SOURCE_COMBATTANTS[id] === "Monstres";
w.equiperCompetencesMonstre = async (id) => { w.CACHE_COMPETENCES_GLOBAL[id] = { C1:{ Nom:"Coup" } }; return ["C1"]; };
w.equiperCompetencesRencontre = async (poses) => { for (const p of poses) await w.equiperCompetencesMonstre(p.id); };

// Simule l'écouteur Firestore : recopie la base dans la liste que lit le combat.
function synchroniser() {
  w.MONSTRES_PARTIE = Object.entries(base.Monstres).map(([id, d]) => ({
    idPersonnage:id, estMonstre:true, statut:d.Statut, PV_Actuels:d.PV_Actuels, PV_Max:d.PV_Max,
    camp:"Ennemi", prenom:d.Prenom_Personnage, Personnalite:d.Personnalite
  }));
  w.PERSOS_PARTIE = [...w.PERSOS_JOUEURS_PARTIE, ...w.MONSTRES_PARTIE];
}

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(52)} ${c?"OK":"ÉCHEC"} ${d}`); };

// --- Rencontre : 2 joueurs -> limite de 3 monstres sur le terrain ---
const res = await w.genererRencontreMonstres("Normale");
// Les techniques sont forgées en arrière-plan (volontairement : les pions
// apparaissent tout de suite). On laisse donc le temps à cette tâche de tourner.
await new Promise(r => setTimeout(r, 20));
synchroniser();
const surTerrain = Object.keys(base.Monstres).length;
const reserve = base.Systeme_Parties.P1.Reserve_Monstres.length;
console.log(`1. RENCONTRE : ${surTerrain} sur le terrain, ${reserve} en réserve (2 joueurs -> limite 3)`);
verifier("limite respectée (2 joueurs + 1 = 3)", surTerrain === 3, `(${surTerrain})`);
verifier("le surplus part en réserve", reserve === res.enReserve.length && reserve > 0, `(${reserve})`);
verifier("chaque monstre a reçu ses techniques", Object.keys(w.CACHE_COMPETENCES_GLOBAL).length === surTerrain);

// --- Mort d'un monstre : un renfort doit entrer ---
console.log("\n2. MORT D'UN MONSTRE -> RENFORT");
const victime = Object.keys(base.Monstres)[0];
const nomsAvant = new Set(Object.keys(base.Monstres));
base.Monstres[victime].Statut = "Mort"; base.Monstres[victime].PV_Actuels = 0;
synchroniser();
await w.marquerMonstreMort(victime);
synchroniser();

const apres = Object.keys(base.Monstres);
const nouveaux = apres.filter(id => !nomsAvant.has(id));
verifier("le mort est marqué Mort en base", base.Monstres[victime].Statut === "Mort");
verifier("son document est conservé", !!base.Monstres[victime]);
verifier("un renfort est entré en jeu", nouveaux.length === 1, `(${nouveaux.length})`);
verifier("la réserve a diminué de un", base.Systeme_Parties.P1.Reserve_Monstres.length === reserve - 1);
verifier("le renfort a un pion sur la carte", nouveaux.length === 1 && !!base.Combat_VTT.P1.Tokens[nouveaux[0]]);
verifier("le renfort est dans l'ordre d'initiative", nouveaux.length === 1 && base.Systeme_Parties.P1.Ordre_Initiative.includes(nouveaux[0]));
verifier("le renfort a reçu ses techniques", nouveaux.length === 1 && !!w.CACHE_COMPETENCES_GLOBAL[nouveaux[0]]);

// --- Terrain de nouveau plein : aucun renfort supplémentaire ---
console.log("\n3. TERRAIN PLEIN : PAS DE RENFORT EN TROP");
const avantReserve = base.Systeme_Parties.P1.Reserve_Monstres.length;
await w.entrerRenfortMonstre();
verifier("aucun renfort tant qu'une place ne se libère pas",
         base.Systeme_Parties.P1.Reserve_Monstres.length === avantReserve, `(${avantReserve})`);

// --- Réserve vidée : plus rien n'entre ---
console.log("\n4. RÉSERVE ÉPUISÉE");
base.Systeme_Parties.P1.Reserve_Monstres = [];
const v2 = apres.find(id => id !== victime);
base.Monstres[v2].Statut = "Mort"; base.Monstres[v2].PV_Actuels = 0;
synchroniser();
const nbAvant = Object.keys(base.Monstres).length;
await w.marquerMonstreMort(v2);
synchroniser();
verifier("réserve vide : aucun monstre créé", Object.keys(base.Monstres).length === nbAvant);

console.log(`\n${echecs === 0 ? "TOUS LES CONTRÔLES PASSENT" : echecs + " CONTRÔLE(S) EN ÉCHEC"}`);
