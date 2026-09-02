// LE COUP CRITIQUE.
// À chaque carte jouée par un héros, un jet invisible tombe selon sa statistique
// Critique. En cas de réussite : dégâts et soins doublés, et les effets de la
// carte s'appliquent d'office, sans leur jet habituel. Les créatures n'y ont
// jamais droit. Le jet est tiré UNE FOIS par le poste qui lance la carte, puis
// diffusé : si chaque navigateur relançait le sien, les joueurs ne verraient
// pas tous le même coup partir.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';

const src = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');
const mvt = fs.readFileSync('/home/user/Ivalis/mouvement.js', 'utf-8');

// Le VRAI message flottant, pour mesurer la taille du texte "Critique !".
const lignesMvt = mvt.split('\n');
const dMsg = lignesMvt.findIndex(l => l.startsWith('window.afficherMessageFlottantHex = function'));
let fMsg = dMsg; for (let i = dMsg + 1; i < lignesMvt.length; i++) { if (lignesMvt[i] === '};') { fMsg = i; break; } }
const srcMessage = lignesMvt.slice(dMsg, fMsg + 1).join('\n');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// Un navigateur : son moteur, ses écritures, ses messages flottants.
function poste({ des }) {
  const w = {};
  const ecritures = [], messages = [];
  const db = {}, doc = () => ({});
  const updateDoc = async (ref, data) => { ecritures.push({ ref: ref.id, data }); };
  const setDoc = async () => {}, deleteDoc = async () => {}, deleteField = () => ({});

  w.PERSOS_PARTIE = []; w.TOKENS_VTT_DATA = {};
  w.COMBAT_PERSOS_JOUEUR = []; w.COMBAT_INDEX_PERSO = 0;
  w.ID_PARTIE_COURANTE = "P1";
  w.refCombattant = (id) => ({ id });
  w.afficherMessageFlottantHex = (q, r, texte, couleur, options) =>
    messages.push({ texte, couleur, taille: (options || {}).taille || 18, eclat: !!(options || {}).eclat });
  w.afficherFlashDegatToken = () => {}; w.appliquerTokensVTT = () => {};
  w.afficherPisteInitiative = () => {}; w.afficherPersoCombatActuel = () => {};
  w.mettreAJourJaugePV = () => {}; w.mettreAJourJaugeFatigue = () => {};
  w.validerCarteCombat = () => {}; w.deduireFatigueCarte = () => {};
  w.estCombattantMort = (id) => { const p = w.PERSOS_PARTIE.find(x => x.idPersonnage === id); return !p || p.PV_Actuels <= 0; };
  w.estMonstre = (id) => String(id).startsWith("M");
  w.PLATEAU_VTT = { getCaseState: () => ({ isBlocked: false, isDeleted: false, isDifficult: false }),
                    hexToPixel: (q, r) => ({ x: q * 50, y: r * 50 }),
                    pixelToHex: (x, y) => ({ q: Math.round(x / 50), r: Math.round(y / 50) }) };
  w.VTT_POS_X = 0; w.VTT_POS_Y = 0; w.VTT_SCALE = 1;
  w.EFFETS_BDD_CACHE = { E1: {} }; w.CACHE_COMPETENCES_GLOBAL = {};
  w.jouerSonClic = () => {};
  w.RESOLUTIONS_LOCALES = [];
  // Le vrai nettoyage de ciblage démonte des écouteurs et des calques : hors
  // navigateur, on lui donne juste de quoi ne pas trébucher.
  w.removeEventListener = () => {};
  w.surlignerEffetCarteActif = () => {};
  w.retirerAssombrissement = () => {};
  w.actualiserBandeauAction = () => {};

  global.window = w;
  global.document = { getElementById: () => null, querySelectorAll: () => [],
                      createElement: () => ({ style: {}, appendChild() {}, remove() {} }) };
  global.localStorage = { getItem: () => "P_01" };
  global.alert = (m) => { throw new Error("alerte inattendue : " + m); };
  // Des dés pipés : c'est la seule façon d'observer à coup sûr les deux issues.
  const vraiHasard = Math.random;
  Math.random = () => (des.length ? des.shift() : 0.99);
  new Function('window', SRC_STATS_COMMUNES)(w);
  new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField', src)(
    w, db, doc, updateDoc, setDoc, deleteDoc, deleteField);
  return { w, ecritures, messages, rendreLeHasard: () => { Math.random = vraiHasard; } };
}

const heros = () => ({ idPersonnage: "J2", prenom: "Ben", camp: "Allié", idJoueur: "P_01",
  PV_Max: 42, PV_Actuels: 42, Fatigue_Max: 100, fatigueActuelle: 100,
  Critique: 10, Dev_Mod_Critique: 15, Etats_Alteres: [] });
const creature = () => ({ idPersonnage: "M1", prenom: "Gnoll", estMonstre: true, camp: "Ennemi",
  idJoueur: "MJ", PV_Max: 90, PV_Actuels: 90, Fatigue_Max: 120, fatigueActuelle: 120,
  Critique: 90, Etats_Alteres: [] });
const victime = () => ({ idPersonnage: "J1", prenom: "Pliors", camp: "Ennemi", idJoueur: "P_09",
  PV_Max: 100, PV_Actuels: 100, Def_Physique: 0, Esquive: 0, Parade: 0,
  Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: [] });

const carte = (extra = {}) => ({
  type: "ATTAQUES", idCarte: "C1",
  attaques: [{ nom: "Attaque légère", typeRes: "Physique", valeurBrute: 12, isRanged: false,
               rangeMax: 1, isHeal: false, isShield: false, purifChance: 0, estEtalement: false,
               cibles: ["J1"] }],
  alterations: [], isZone: false, zoneCenterHex: null, confusion: null,
  timestamp: Date.now(), ...extra
});

console.log("1. LE JET, TIRÉ PAR LE POSTE QUI LANCE LA CARTE");
{
  // Statistique Critique : 10 de base + 15 de retouche = 25 %.
  // Un dé à 0.10 donne 11 → réussite ; un dé à 0.80 donne 81 → échec.
  for (const [valeurDe, attendu, mot] of [[0.10, true, "réussite"], [0.80, false, "échec"]]) {
    const p = poste({ des: [valeurDe] });
    p.w.PERSOS_PARTIE = [heros(), victime()];
    p.w.COMBAT_PERSOS_JOUEUR = [p.w.PERSOS_PARTIE[0]];
    p.w.TOKENS_VTT_DATA = { J2: { q: 0, r: 0 }, J1: { q: 1, r: 0 } };
    p.w.ETAT_CIBLAGE = { idCarte: "C1", attaques: carte().attaques, alterations: [],
                         isZone: false, zoneCenterHex: null };
    await p.w.declencherResolution();
    const action = p.ecritures.find(e => e.data && e.data.Action_Moteur);
    p.rendreLeHasard();
    verifier(`un dé de ${valeurDe * 100 + 1} sur 25 % de critique : ${mot}`,
             !!action && action.data.Action_Moteur.critique === attendu,
             action ? `(critique = ${action.data.Action_Moteur.critique})` : "(pas d'action écrite)");
  }
}

{
  const p = poste({ des: [0.01] });   // dé à 2 : réussite garantie sur 90 %
  p.w.PERSOS_PARTIE = [creature(), victime()];
  p.w.COMBAT_PERSOS_JOUEUR = [p.w.PERSOS_PARTIE[0]];
  p.w.TOKENS_VTT_DATA = { M1: { q: 0, r: 0 }, J1: { q: 1, r: 0 } };
  p.w.ETAT_CIBLAGE = { idCarte: "C1", attaques: carte().attaques, alterations: [],
                       isZone: false, zoneCenterHex: null };
  await p.w.declencherResolution();
  const action = p.ecritures.find(e => e.data && e.data.Action_Moteur);
  p.rendreLeHasard();
  verifier("une créature ne fait jamais de critique, même à 90 %",
           !!action && action.data.Action_Moteur.critique === false,
           action ? `(critique = ${action.data.Action_Moteur.critique})` : "(rien)");
}

console.log("\n2. LE JET EST DIFFUSÉ, PAS REFAIT SUR CHAQUE POSTE");
{
  // Le poste spectateur n'a pas résolu la carte : il rejoue le critique reçu,
  // avec des dés qui, s'il relançait, donneraient l'inverse.
  const p = poste({ des: [0.99, 0.99, 0.99, 0.99] });
  p.w.PERSOS_PARTIE = [heros(), victime()];
  p.w.TOKENS_VTT_DATA = { J2: { q: 0, r: 0 }, J1: { q: 1, r: 0 } };
  await p.w.jouerAnimationMoteur(carte({ idLanceur: "J2", critique: true }));
  const pv = p.w.PERSOS_PARTIE.find(x => x.idPersonnage === "J1").PV_Actuels;
  p.rendreLeHasard();
  verifier("un spectateur rejoue le critique reçu, sans relancer le dé", pv === 76, `(${pv} PV)`);
}

console.log("\n3. CE QUE FAIT UN CRITIQUE");
{
  const frapper = async (critique, extraCarte = {}, extraCible = {}) => {
    const p = poste({ des: [0.99, 0.99, 0.99, 0.99, 0.99, 0.99] });
    const c = Object.assign(victime(), extraCible);
    p.w.PERSOS_PARTIE = [heros(), c];
    p.w.TOKENS_VTT_DATA = { J2: { q: 0, r: 0 }, J1: { q: 1, r: 0 } };
    await p.w.jouerAnimationMoteur(carte({ idLanceur: "J2", critique, ...extraCarte }));
    p.rendreLeHasard();
    return { cible: p.w.PERSOS_PARTIE.find(x => x.idPersonnage === "J1"), messages: p.messages };
  };

  const normal = await frapper(false);
  const crit = await frapper(true);
  console.log(`     dégâts : ${100 - normal.cible.PV_Actuels} sans critique,`
            + ` ${100 - crit.cible.PV_Actuels} avec`);
  verifier("les dégâts doublent", (100 - crit.cible.PV_Actuels) === 2 * (100 - normal.cible.PV_Actuels),
           `(${100 - normal.cible.PV_Actuels} → ${100 - crit.cible.PV_Actuels})`);

  // Les résistances s'appliquent ensuite : 24 dégâts moins 50 % = 12.
  const critResiste = await frapper(true, {}, { Def_Physique: 50 });
  verifier("la résistance de la cible s'applique après le doublement",
           (100 - critResiste.cible.PV_Actuels) === 12, `(${100 - critResiste.cible.PV_Actuels})`);

  // Soins : la carte soigne 12, le critique en rend 24.
  const soin = (critique) => frapper(critique, { attaques: [{ nom: "Soin", typeRes: "Magique",
    valeurBrute: 12, isRanged: false, rangeMax: 1, isHeal: true, isShield: false,
    purifChance: 0, estEtalement: false, cibles: ["J1"] }] }, { PV_Actuels: 50 });
  const soinNormal = await soin(false), soinCrit = await soin(true);
  console.log(`     soins : +${soinNormal.cible.PV_Actuels - 50} sans critique,`
            + ` +${soinCrit.cible.PV_Actuels - 50} avec`);
  verifier("les soins doublent aussi",
           (soinCrit.cible.PV_Actuels - 50) === 2 * (soinNormal.cible.PV_Actuels - 50),
           `(+${soinNormal.cible.PV_Actuels - 50} → +${soinCrit.cible.PV_Actuels - 50})`);

  // Effets de la carte : une chance d'application de 1 %, avec des dés maximaux.
  const alteration = [{ nom: "Saignement", chance: 1, duree: 3, icone: "", degats: 3 }];
  const etatNormal = await frapper(false, { alterations: alteration });
  const etatCrit = await frapper(true, { alterations: alteration });
  console.log(`     effet à 1 % de chance : ${etatNormal.cible.Etats_Alteres.length} sans critique,`
            + ` ${etatCrit.cible.Etats_Alteres.length} avec`);
  verifier("un effet à 1 % ne passe pas sans critique", etatNormal.cible.Etats_Alteres.length === 0);
  verifier("le critique l'impose sans jet", etatCrit.cible.Etats_Alteres.length === 1
           && etatCrit.cible.Etats_Alteres[0].nom === "Saignement");

  // Les déplacements forcés (Poussée, Traction, Peur) ont leur propre jet, sur
  // un autre chemin de code : le critique doit les imposer aussi.
  const fuir = async (critique) => {
    const p = poste({ des: [0.99, 0.99, 0.99, 0.99] });
    p.w.PERSOS_PARTIE = [heros(), victime()];
    p.w.TOKENS_VTT_DATA = { J2: { q: 0, r: 0 }, J1: { q: 1, r: 0 } };
    let fuites = 0;
    p.w.declencherPeurCible = async () => { fuites++; };
    p.w.diffuserEchecDeplacementForce = async () => {};
    const action = carte({ idLanceur: "J2", critique,
      alterations: [{ nom: "Peur", estPeur: true, chance: 1, duree: 1, icone: "" }] });
    p.w.RESOLUTIONS_LOCALES = [action.timestamp];   // c'est ce poste qui a résolu
    await p.w.jouerAnimationMoteur(action);
    p.rendreLeHasard();
    return fuites;
  };
  const fuitesNormal = await fuir(false), fuitesCrit = await fuir(true);
  console.log(`     peur à 1 % de chance : ${fuitesNormal} fuite sans critique, ${fuitesCrit} avec`);
  verifier("un déplacement forcé à 1 % échoue sans critique", fuitesNormal === 0, `(${fuitesNormal})`);
  verifier("le critique le déclenche d'office", fuitesCrit === 1, `(${fuitesCrit})`);

  console.log("\n4. L'ANNONCE À L'ÉCRAN");
  const annonce = crit.messages.find(m => m.texte === "Critique !");
  const ordinaire = crit.messages.find(m => m.texte !== "Critique !");
  console.log(`     « ${annonce ? annonce.texte : "—"} » en ${annonce ? annonce.taille : "?"}px,`
            + ` couleur ${annonce ? annonce.couleur : "?"}`);
  verifier("le message « Critique ! » s'affiche", !!annonce);
  verifier("il est en rouge", !!annonce && /^#ff/i.test(annonce.couleur), annonce ? annonce.couleur : "");
  verifier("plus gros que les autres textes flottants",
           !!annonce && !!ordinaire && annonce.taille > ordinaire.taille,
           annonce && ordinaire ? `(${annonce.taille}px contre ${ordinaire.taille}px)` : "");
  verifier("aucune annonce quand le coup est normal",
           !normal.messages.some(m => m.texte === "Critique !"));
}

console.log("\n5. LA TAILLE DEMANDÉE ARRIVE VRAIMENT AU PIXEL");
{
  // Le vrai message flottant, joué dans un DOM minimal.
  const styles = [];
  const w = { PLATEAU_VTT: { hexToPixel: () => ({ x: 0, y: 0 }) }, VTT_POS_X: 0, VTT_POS_Y: 0, VTT_SCALE: 1 };
  global.window = w;
  const conteneur = { appendChild: (e) => styles.push(e.style) };
  global.document = { getElementById: () => conteneur,
                      createElement: () => ({ style: {}, remove() {} }) };
  global.setTimeout = (fn) => fn && 0;
  new Function('window', srcMessage)(w);
  w.afficherMessageFlottantHex(0, 0, "-12", "#ff4c4c");
  w.afficherMessageFlottantHex(0, 0, "Critique !", "#ff2d2d", { taille: 30, eclat: true });
  verifier("un message ordinaire reste à 18px", styles[0].fontSize === "18px", `(${styles[0].fontSize})`);
  verifier("le critique sort à 30px", styles[1].fontSize === "30px", `(${styles[1].fontSize})`);
  verifier("avec un halo à sa couleur", (styles[1].textShadow || "").includes("#ff2d2d"));
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
