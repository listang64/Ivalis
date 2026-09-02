// QUI ÉCRIT LE RÉSULTAT D'UNE CARTE EN BASE ?
// Tous les navigateurs rejouent l'animation d'une carte (Action_Moteur), mais un
// seul doit écrire le résultat. La règle était "le propriétaire du lanceur" —
// or une créature n'appartient à personne (ID_Joueur = "MJ") : personne
// n'écrivait, les dégâts restaient locaux, et le premier snapshot les effaçait.
import fs from 'fs';

const src = fs.readFileSync('/home/user/Ivalis/moteur_effets.js','utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');

let echecs = 0;
const verifier = (l, c, d="") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c?"OK":"ÉCHEC"} ${d}`); };

// Un navigateur : sa fenêtre, ses écritures, son moteur.
function poste(nom, { monJoueur }) {
  const w = {};
  const ecritures = [];
  const db = {}, doc = () => ({});
  const updateDoc = async (ref, data) => { ecritures.push({ ref: ref.id, data }); };
  const setDoc = async () => {}, deleteDoc = async () => {}, deleteField = () => ({});

  w.PERSOS_PARTIE = [];
  w.TOKENS_VTT_DATA = {};
  w.COMBAT_PERSOS_JOUEUR = []; w.COMBAT_INDEX_PERSO = 0;
  w.ID_PARTIE_COURANTE = "P1";
  w.refCombattant = (id) => ({ id });
  w.afficherMessageFlottantHex = () => {};
  w.afficherFlashDegatToken = () => {};
  w.appliquerTokensVTT = () => {};
  w.afficherPisteInitiative = () => {};
  w.afficherPersoCombatActuel = () => {};
  w.mettreAJourJaugePV = () => {}; w.mettreAJourJaugeFatigue = () => {};
  w.validerCarteCombat = (idCarte) => ecritures.push({ ref: "FIN_DE_TOUR", data: idCarte });
  w.deduireFatigueCarte = (id, idCarte) => ecritures.push({ ref: "FATIGUE:" + id, data: idCarte });
  w.estCombattantMort = (id) => { const p = w.PERSOS_PARTIE.find(x => x.idPersonnage === id); return !p || p.PV_Actuels <= 0; };
  w.PLATEAU_VTT = { getCaseState: () => ({ isBlocked:false, isDeleted:false, isDifficult:false }),
                    hexToPixel: (q, r) => ({ x: q * 50, y: r * 50 }),
                    pixelToHex: (x, y) => ({ q: Math.round(x / 50), r: Math.round(y / 50) }) };
  w.VTT_POS_X = 0; w.VTT_POS_Y = 0; w.VTT_SCALE = 1;
  w.EFFETS_BDD_CACHE = {};
  w.CACHE_COMPETENCES_GLOBAL = {};

  global.window = w;
  global.document = { getElementById: () => null, querySelectorAll: () => [], createElement: () => ({ style:{}, appendChild(){}, remove(){} }) };
  global.localStorage = { getItem: () => monJoueur };
  new Function('window','db','doc','updateDoc','setDoc','deleteDoc','deleteField', src)(
    w, db, doc, updateDoc, setDoc, deleteDoc, deleteField);
  return { nom, w, ecritures };
}

function situation(p, { lanceurEstMonstre }) {
  const lanceur = lanceurEstMonstre
    ? { idPersonnage:"M1", prenom:"Gnoll", estMonstre:true, camp:"Ennemi", idJoueur:"MJ",
        PV_Max:90, PV_Actuels:90, Fatigue_Max:120, fatigueActuelle:120, Etats_Alteres:[] }
    : { idPersonnage:"J2", prenom:"Ben", camp:"Allié", idJoueur:"P_02",
        PV_Max:42, PV_Actuels:42, Fatigue_Max:100, fatigueActuelle:100, Etats_Alteres:[] };
  const cible = { idPersonnage:"J1", prenom:"Pliors", camp:"Allié", idJoueur:"P_01",
                  PV_Max:42, PV_Actuels:30, Def_Physique:0, Esquive:0, Parade:0,
                  Bouclier_Actuel:0, Bouclier_Max:0, Etats_Alteres:[] };
  p.w.PERSOS_PARTIE = [lanceur, cible];
  p.w.TOKENS_VTT_DATA = { [lanceur.idPersonnage]:{q:0,r:0}, J1:{q:1,r:0} };
  return {
    type:"ATTAQUES", idLanceur: lanceur.idPersonnage, idCarte:"C1",
    attaques:[{ nom:"Attaque légère", typeRes:"Physique", valeurBrute:12, isRanged:false,
                rangeMax:1, isHeal:false, isShield:false, purifChance:0, estEtalement:false,
                cibles:["J1"] }],
    alterations:[], isZone:false, zoneCenterHex:null, confusion:null,
    timestamp: 1234567
  };
}

console.log("1. CARTE D'UNE CRÉATURE : LE POSTE QUI L'A RÉSOLUE ÉCRIT");
{
  const auteur = poste("auteur", { monJoueur:"P_01" });
  const action = situation(auteur, { lanceurEstMonstre:true });
  auteur.w.RESOLUTIONS_LOCALES = [action.timestamp];   // c'est lui qui a résolu
  await auteur.w.jouerAnimationMoteur(action);
  const pv = auteur.ecritures.find(e => e.data && e.data.PV_Actuels !== undefined);
  console.log("     écritures :", auteur.ecritures.map(e => e.ref + (e.data && e.data.PV_Actuels !== undefined ? `(PV ${e.data.PV_Actuels})` : "")).join(", ") || "aucune");
  verifier("les dégâts de la créature sont écrits en base", !!pv, pv ? `(PV ${pv.data.PV_Actuels})` : "(rien)");
  verifier("la créature paie sa carte", auteur.ecritures.some(e => e.ref === "FATIGUE:M1"));
  verifier("elle ne déclenche pas la fin de tour du joueur",
    !auteur.ecritures.some(e => e.ref === "FIN_DE_TOUR"));
}

console.log("\n2. LES AUTRES POSTES REJOUENT SANS RIEN ÉCRIRE");
{
  const spectateur = poste("spectateur", { monJoueur:"P_03" });
  const action = situation(spectateur, { lanceurEstMonstre:true });
  spectateur.w.RESOLUTIONS_LOCALES = [];              // il n'a rien résolu
  await spectateur.w.jouerAnimationMoteur(action);
  console.log("     écritures :", spectateur.ecritures.map(e => e.ref).join(", ") || "aucune");
  verifier("aucune écriture depuis un poste spectateur", spectateur.ecritures.length === 0,
           `(${spectateur.ecritures.length})`);
  const cible = spectateur.w.PERSOS_PARTIE.find(p => p.idPersonnage === "J1");
  verifier("mais il voit quand même les dégâts localement", cible.PV_Actuels < 30, `(${cible.PV_Actuels})`);
}

console.log("\n3. CARTE D'UN JOUEUR : RIEN NE CHANGE POUR LUI");
{
  const auteur = poste("joueur", { monJoueur:"P_02" });
  const action = situation(auteur, { lanceurEstMonstre:false });
  auteur.w.RESOLUTIONS_LOCALES = [action.timestamp];
  await auteur.w.jouerAnimationMoteur(action);
  verifier("les dégâts sont écrits", auteur.ecritures.some(e => e.data && e.data.PV_Actuels !== undefined));
  verifier("et la carte est validée (fatigue + fin de tour)",
    auteur.ecritures.some(e => e.ref === "FIN_DE_TOUR"));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
