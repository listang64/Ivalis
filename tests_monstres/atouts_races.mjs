// LES ATOUTS DES SEPT PEUPLES.
// Chaque race apporte son avantage. Comme les retouches de la fiche, ils ne sont
// pas recopiés dans les valeurs enregistrées : ils s'ajoutent à la lecture, donc
// un personnage créé avant leur arrivée en profite aussi. Ce banc joue le VRAI
// moteur pour chacun, et compare toujours à la même situation sans atout.
import fs from 'fs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';

const src = fs.readFileSync('/home/user/Ivalis/moteur_effets.js', 'utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');
const mouvement = fs.readFileSync('/home/user/Ivalis/mouvement.js', 'utf-8')
  .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '');
const combat = fs.readFileSync('/home/user/Ivalis/combat.js', 'utf-8');
const comp = fs.readFileSync('/home/user/Ivalis/competences.js', 'utf-8');

// Les trois fonctions de la Forge qui écrivent la portée sur la carte.
function extraireDeLaForge(marqueur, finLigne = '}') {
  const lignes = comp.split('\n');
  const d = lignes.findIndex(l => l.startsWith(marqueur));
  if (d < 0) throw new Error("introuvable dans competences.js : " + marqueur);
  let f = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === finLigne) { f = i; break; } }
  return lignes.slice(d, f + 1).join('\n');
}
const SRC_FORGE = [
  extraireDeLaForge('function parseFrenchFloat(val) {'),
  extraireDeLaForge('function bonusPorteeDeRace(action) {'),
  extraireDeLaForge('function formatterTexteEffet(effet, stacks, action) {')
].join('\n\n');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(58)} ${c ? "OK" : "ÉCHEC"} ${d}`); };

// Un navigateur complet : moteur d'effets, déplacement, atouts de race.
function poste({ des = [], domComplet = false } = {}) {
  const w = {};
  const ecritures = [], messages = [];
  const db = {}, doc = () => ({});
  const updateDoc = async (ref, data) => { ecritures.push({ ref: ref.id, data }); };
  const setDoc = async () => {}, deleteDoc = async () => {}, deleteField = () => ({});
  const getDoc = async () => ({ exists: () => false, data: () => ({}) });

  w.PERSOS_PARTIE = []; w.TOKENS_VTT_DATA = {};
  w.COMBAT_PERSOS_JOUEUR = []; w.COMBAT_INDEX_PERSO = 0;
  w.ID_PARTIE_COURANTE = "P1";
  w.refCombattant = (id) => ({ id });
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
  w.EFFETS_BDD_CACHE = {}; w.CACHE_COMPETENCES_GLOBAL = {};
  w.jouerSonClic = () => {}; w.RESOLUTIONS_LOCALES = [];
  w.removeEventListener = () => {}; w.surlignerEffetCarteActif = () => {};
  w.retirerAssombrissement = () => {}; w.actualiserBandeauAction = () => {};
  w.caseOccupeeParVivant = () => false;

  global.window = w;
  // Le ciblage va chercher des éléments de la carte affichée : pour ce test-là,
  // on lui rend des coquilles vides plutôt que rien, sinon il s'arrête en route.
  const coquille = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {} },
                            appendChild() {}, remove() {}, addEventListener() {},
                            querySelector: () => null, querySelectorAll: () => [],
                            getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
                            innerHTML: "", innerText: "" });
  global.document = { getElementById: (id) => id === "fenetre-combat" ? { style: { display: "block" } }
                                            : (domComplet ? coquille() : null),
                      querySelectorAll: () => [], querySelector: () => null,
                      addEventListener: () => {}, removeEventListener: () => {},
                      createElement: () => coquille(), body: coquille() };
  global.localStorage = { getItem: () => "P_01" };
  global.alert = (m) => { throw new Error("alerte inattendue : " + m); };

  const vraiHasard = Math.random;
  Math.random = () => (des.length ? des.shift() : 0.99);

  new Function('window', SRC_STATS_COMMUNES)(w);
  // Le module de déplacement écrase ses globales en se chargeant : d'abord lui.
  new Function('window', 'db', 'doc', 'getDoc', 'setDoc', 'updateDoc', mouvement)(
    w, db, doc, getDoc, setDoc, updateDoc);
  // Le message flottant du module de déplacement n'a pas de DOM ici.
  w.afficherMessageFlottantHex = (q, r, texte, couleur, options) =>
    messages.push({ texte, couleur, taille: (options || {}).taille || 18 });
  new Function('window', 'db', 'doc', 'updateDoc', 'setDoc', 'deleteDoc', 'deleteField', src)(
    w, db, doc, updateDoc, setDoc, deleteDoc, deleteField);
  return { w, ecritures, messages, rendreLeHasard: () => { Math.random = vraiHasard; } };
}

const combattant = (race, extra = {}) => Object.assign({
  idPersonnage: "H1", prenom: "Cobaye", race, camp: "Allié", idJoueur: "P_01",
  PV_Max: 100, PV_Actuels: 100, Fatigue_Max: 100, fatigueActuelle: 100,
  Regeneration: 30, Esquive: 15, Parade: 0, Critique: 10,
  Def_Physique: 0, Def_Magique: 0, Competences_Max: 6,
  Bouclier_Actuel: 0, Bouclier_Max: 0, Etats_Alteres: []
}, extra);

// ------------------------------------------------------------------
console.log("1. LES CHIFFRES DE LA FICHE");
{
  const p = poste();
  const lire = (race) => {
    const c = combattant(race);
    return { esquive: p.w.esquiveCombattant(c), defPhys: p.w.defPhysiqueCombattant(c),
             defMag: p.w.defMagiqueCombattant(c), energie: p.w.fatigueMaxCombattant(c),
             cartes: p.w.competencesMaxCombattant(c) };
  };
  const temoin = lire("Ophior");   // un peuple sans bonus d'esquive ni d'énergie
  const gob = lire("Gob"), anky = lire("Ankylar"), ophior = lire("Ophior"), humain = lire("Humain");
  console.log(`     Gob : esquive ${temoin.esquive} → ${gob.esquive} %, cartes ${temoin.cartes} → ${gob.cartes}`);
  console.log(`     Ankylar : rés. physique ${gob.defPhys} → ${anky.defPhys} %`);
  console.log(`     Ophior : rés. magique ${gob.defMag} → ${ophior.defMag} %`);
  console.log(`     Humain : énergie ${gob.energie} → ${humain.energie}`);

  verifier("Gob : +3 % d'esquive", gob.esquive === 18, `(${gob.esquive} %)`);
  verifier("Gob : une compétence de plus", gob.cartes === 7, `(${gob.cartes})`);
  verifier("Ankylar : +10 % de résistance physique", anky.defPhys === 10, `(${anky.defPhys} %)`);
  verifier("Ankylar : sa résistance magique ne bouge pas", anky.defMag === 0, `(${anky.defMag} %)`);
  verifier("Ophior : +10 % de résistance magique", ophior.defMag === 10, `(${ophior.defMag} %)`);
  verifier("Ophior : sa résistance physique ne bouge pas", ophior.defPhys === 0, `(${ophior.defPhys} %)`);
  verifier("Humain : 110 d'énergie de base", humain.energie === 110, `(${humain.energie})`);
  verifier("les autres peuples gardent 6 cartes", anky.cartes === 6, `(${anky.cartes})`);

  // Les atouts s'ajoutent aux retouches de la fiche, ils ne les remplacent pas.
  const gobRetouche = combattant("Gob", { Dev_Mod_Esquive: 25, Dev_Mod_Fatigue: 10 });
  verifier("l'atout s'ajoute à la retouche de la fiche",
           p.w.esquiveCombattant(gobRetouche) === 43, `(15 + 25 + 3 = ${p.w.esquiveCombattant(gobRetouche)})`);
  const humainRetouche = combattant("Humain", { Dev_Mod_Fatigue: 10 });
  verifier("énergie : base + retouche + atout",
           p.w.fatigueMaxCombattant(humainRetouche) === 120, `(${p.w.fatigueMaxCombattant(humainRetouche)})`);

  // Une créature n'a pas de race : rien ne doit déteindre sur elle.
  const bete = combattant("Gob", { idPersonnage: "M1", estMonstre: true });
  verifier("une créature ne tire aucun atout de race", p.w.esquiveCombattant(bete) === 15,
           `(${p.w.esquiveCombattant(bete)} %)`);
  p.rendreLeHasard();
}

// ------------------------------------------------------------------
console.log("\n2. LES RÉSISTANCES À L'ŒUVRE DANS UNE FRAPPE");
{
  const frapper = async (race) => {
    const p = poste({ des: [0.99, 0.99, 0.99, 0.99] });   // aucune esquive
    const cible = combattant(race, { idPersonnage: "J1", camp: "Ennemi" });
    p.w.PERSOS_PARTIE = [combattant("Ophior", { idPersonnage: "J2" }), cible];
    p.w.TOKENS_VTT_DATA = { J2: { q: 0, r: 0 }, J1: { q: 1, r: 0 } };
    const attaque = (magique) => ({ nom: magique ? "Mot de pouvoir" : "Attaque légère",
      typeRes: magique ? "Magique" : "Physique", valeurBrute: 20, isRanged: false, rangeMax: 1,
      isHeal: false, isShield: false, purifChance: 0, estEtalement: false, cibles: ["J1"] });
    const jouer = async (magique) => {
      cible.PV_Actuels = 100;
      await p.w.jouerAnimationMoteur({ type: "ATTAQUES", idLanceur: "J2", idCarte: "C1",
        attaques: [attaque(magique)], alterations: [], isZone: false, confusion: null,
        critique: false, timestamp: Date.now() });
      return 100 - cible.PV_Actuels;
    };
    const phys = await jouer(false), mag = await jouer(true);
    p.rendreLeHasard();
    return { phys, mag };
  };
  const humain = await frapper("Humain"), anky = await frapper("Ankylar"), ophior = await frapper("Ophior");
  console.log(`     Humain  : ${humain.phys} physique, ${humain.mag} magique`);
  console.log(`     Ankylar : ${anky.phys} physique, ${anky.mag} magique`);
  console.log(`     Ophior  : ${ophior.phys} physique, ${ophior.mag} magique`);
  verifier("l'Ankylar encaisse 10 % de moins en physique", anky.phys === 18 && humain.phys === 20,
           `(${humain.phys} → ${anky.phys})`);
  verifier("mais pas en magique", anky.mag === humain.mag, `(${anky.mag})`);
  verifier("l'Ophior encaisse 10 % de moins en magique", ophior.mag === 18, `(${ophior.mag})`);
  verifier("mais pas en physique", ophior.phys === humain.phys, `(${ophior.phys})`);
}

// ------------------------------------------------------------------
console.log("\n3. LES IMMUNITÉS");
{
  const empoisonner = async (race, nomEtat) => {
    const p = poste({ des: [0.99, 0.99, 0.99, 0.99, 0.99] });
    const cible = combattant(race, { idPersonnage: "J1", camp: "Ennemi" });
    p.w.PERSOS_PARTIE = [combattant("Ophior", { idPersonnage: "J2" }), cible];
    p.w.TOKENS_VTT_DATA = { J2: { q: 0, r: 0 }, J1: { q: 1, r: 0 } };
    await p.w.jouerAnimationMoteur({ type: "ATTAQUES", idLanceur: "J2", idCarte: "C1",
      attaques: [{ nom: "Attaque légère", typeRes: "Physique", valeurBrute: 5, isRanged: false,
                   rangeMax: 1, isHeal: false, isShield: false, purifChance: 0,
                   estEtalement: false, cibles: ["J1"] }],
      alterations: [{ nom: nomEtat, chance: 100, duree: 3, icone: "",
                      estPoison: nomEtat === "Empoisonnement" }],
      isZone: false, confusion: null, critique: true, timestamp: Date.now() });
    p.rendreLeHasard();
    return { etats: cible.Etats_Alteres.map(e => e.nom), messages: p.messages.map(m => m.texte) };
  };
  const ethere = await empoisonner("Ethéré", "Empoisonnement");
  const humainPoison = await empoisonner("Humain", "Empoisonnement");
  const ondari = await empoisonner("Ondari", "Brûlé");
  const humainFeu = await empoisonner("Humain", "Brûlé");
  console.log(`     Éthéré / poison : ${ethere.etats.join(",") || "aucun état"}`
            + ` — Humain : ${humainPoison.etats.join(",") || "aucun"}`);
  console.log(`     Ondari / brûlure : ${ondari.etats.join(",") || "aucun état"}`
            + ` — Humain : ${humainFeu.etats.join(",") || "aucun"}`);
  verifier("un Humain attrape bien le poison", humainPoison.etats.includes("Empoisonnement"));
  verifier("l'Éthéré est immunisé au poison, même sur un critique",
           !ethere.etats.includes("Empoisonnement"));
  verifier("et l'écran le dit", ethere.messages.includes("Immunisé"));
  verifier("un Humain attrape bien la brûlure", humainFeu.etats.includes("Brûlé"));
  verifier("l'Ondari est immunisé à la brûlure", !ondari.etats.includes("Brûlé"));
}

// ------------------------------------------------------------------
console.log("\n4. LES SOINS REÇUS");
{
  const soigner = async (race) => {
    const p = poste({ des: [0.99, 0.99] });
    const cible = combattant(race, { idPersonnage: "J1", PV_Actuels: 50 });
    p.w.PERSOS_PARTIE = [combattant("Ophior", { idPersonnage: "J2" }), cible];
    p.w.TOKENS_VTT_DATA = { J2: { q: 0, r: 0 }, J1: { q: 1, r: 0 } };
    await p.w.jouerAnimationMoteur({ type: "ATTAQUES", idLanceur: "J2", idCarte: "C1",
      attaques: [{ nom: "Soin", typeRes: "Magique", valeurBrute: 20, isRanged: false, rangeMax: 1,
                   isHeal: true, isShield: false, purifChance: 0, estEtalement: false, cibles: ["J1"] }],
      alterations: [], isZone: false, confusion: null, critique: false, timestamp: Date.now() });
    p.rendreLeHasard();
    return cible.PV_Actuels - 50;
  };
  const humain = await soigner("Humain"), ethere = await soigner("Ethéré");
  console.log(`     soin de 20 : +${humain} pour un Humain, +${ethere} pour un Éthéré`);
  verifier("un soin ordinaire rend sa valeur", humain === 20, `(+${humain})`);
  verifier("l'Éthéré reçoit 30 % de plus", ethere === 26, `(+${ethere})`);
}

// ------------------------------------------------------------------
console.log("\n5. LE VARGEN : DÉPLACEMENT ET DÉROBADE");
{
  const marcher = (race) => {
    const p = poste();
    const perso = combattant(race);
    p.w.PERSOS_PARTIE = [perso];
    p.w.COMBAT_PERSOS_JOUEUR = [perso];
    p.w.COMBAT_INDEX_PERSO = 0;
    p.w.TOKEN_SELECTIONNE = "H1";
    p.w.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 } };
    p.w.PARTIE_DATA = { Tour_Combat: 1, Phase_Combat: "Resolution",
                        File_Attente_Combat: [{ idPersonnage: "H1", idCarte: "C1" }] };
    p.w.CHEMIN_MOUVEMENT = []; p.w.CHEMIN_START_NODE = { q: 0, r: 0 };
    p.w.MOUVEMENT_COUT_TOTAL = 0; p.w.COUT_COMPETENCE_SELECTIONNEE = 0;
    p.w.PAS_PARCOURUS_TOUR = { id: null, tour: null, pas: 0 };
    for (let i = 1; i <= 8; i++) p.w.ajouterEtapeMouvement(i, 0);
    const couts = p.w.CHEMIN_MOUVEMENT.map(e => e.cost);
    p.rendreLeHasard();
    return { couts, total: p.w.MOUVEMENT_COUT_TOTAL };
  };
  const humain = marcher("Humain"), vargen = marcher("Vargen");
  console.log(`     Humain : ${humain.couts.join(" ")} = ${humain.total} ⚡`);
  console.log(`     Vargen : ${vargen.couts.join(" ")} = ${vargen.total} ⚡`);
  verifier("huit cases coûtent 30 ⚡ à tout le monde", humain.total === 30, `(${humain.total})`);
  verifier("le Vargen les paie moitié prix", vargen.total === 15, `(${vargen.total})`);
  verifier("aucune case n'est gratuite", vargen.couts.every(c => c >= 1), `(${vargen.couts.join(",")})`);

  // La dérobade : 30 % avant même le jet de défense.
  const opportunite = async (race, de) => {
    const p = poste({ des: [de, 0.99] });
    // Esquive et parade à zéro : seule la dérobade peut encore sauver le fuyard,
    // sinon le jet de défense ordinaire brouillerait la mesure.
    const fuyard = combattant(race, { idPersonnage: "J1", camp: "Allié", PV_Actuels: 100,
                                      Esquive: 0, Parade: 0 });
    p.w.PERSOS_PARTIE = [combattant("Ophior", { idPersonnage: "M1", camp: "Ennemi" }), fuyard];
    p.w.TOKENS_VTT_DATA = { M1: { q: 0, r: 0 }, J1: { q: 1, r: 0 } };
    const res = await p.w.resoudreAttaqueOpportunite("M1", "J1");
    p.rendreLeHasard();
    return { res, pv: fuyard.PV_Actuels };
  };
  const vargenChanceux = await opportunite("Vargen", 0.10);   // dé à 11 : sous 30 %
  const vargenMalchanceux = await opportunite("Vargen", 0.50); // dé à 51 : au-dessus
  const humainOpp = await opportunite("Humain", 0.10);
  console.log(`     Vargen (dé 11) : ${vargenChanceux.res.motDef}, ${vargenChanceux.pv} PV`);
  console.log(`     Vargen (dé 51) : ${vargenMalchanceux.res.motDef || "touché"}, ${vargenMalchanceux.pv} PV`);
  verifier("le Vargen se dérobe une fois sur trois", vargenChanceux.res.dodged
           && vargenChanceux.res.motDef === "Dérobade 🐾" && vargenChanceux.pv === 100);
  verifier("sinon il encaisse comme les autres", vargenMalchanceux.pv === 90,
           `(${vargenMalchanceux.pv} PV)`);
  verifier("un autre peuple n'a pas de dérobade", humainOpp.pv === 90, `(${humainOpp.pv} PV)`);
}

// ------------------------------------------------------------------
console.log("\n6. L'ONDARI : LA PORTÉE DE SES SORTS");
{
  const p = poste();
  const ondari = combattant("Ondari"), humain = combattant("Humain");
  const cas = [
    ["sort magique à distance", "Mot de pouvoir", true],
    ["soin lancé à distance", "Soin", true],
    ["attaque physique à distance", "Attaque légère", true],
    ["sort magique au corps à corps", "Mot de pouvoir", false]
  ];
  for (const [libelle, nom, aDistance] of cas) {
    const magique = p.w.actionEstMagique(nom);
    const bonusOndari = p.w.bonusPorteeMagique(ondari, magique, aDistance);
    const bonusHumain = p.w.bonusPorteeMagique(humain, magique, aDistance);
    const attendu = (magique && aDistance) ? 1 : 0;
    verifier(`Ondari, ${libelle} : +${attendu}`, bonusOndari === attendu, `(+${bonusOndari})`);
    if (attendu > 0) verifier(`  un autre peuple n'y gagne rien`, bonusHumain === 0, `(+${bonusHumain})`);
  }
  p.rendreLeHasard();
}

// ------------------------------------------------------------------
console.log("\n7. LE REPOS LONG DE L'HUMAIN");
{
  // La récupération est calculée dans finDeTourCombat : on rejoue sa formule
  // exacte, extraite du fichier, plutôt que de la réécrire ici.
  const lignes = combat.split('\n');
  const d = lignes.findIndex(l => l.includes("const bonusRace = (typeof window.atoutRace"));
  const formule = lignes.slice(d, d + 5).join('\n');
  const p = poste();
  const recuperer = (race) => {
    const persoAction = combattant(race);
    const fatigueMax = p.w.fatigueMaxCombattant(persoAction);
    let fatigueActuelle = 0;
    const tauxRepos = 0.35;
    const window_ = p.w;
    return eval(`(function(){ const window = window_; ${formule} return recup; })()`);
  };
  const humain = recuperer("Humain"), gob = recuperer("Gob");
  console.log(`     repos long : +${gob} pour un Gob, +${humain} pour un Humain`);
  verifier("un repos long ordinaire rend 35 % de la jauge", gob === 35, `(+${gob})`);
  verifier("l'Humain récupère 10 points de plus", humain === 48, `(+${humain} sur 110)`);
  p.rendreLeHasard();
}

// ------------------------------------------------------------------
console.log("\n8. LA FORGE ANNONCE LA PORTÉE RÉELLE");
{
  const p = poste();
  // L'effet Distance tel qu'il est en base : « Portée de 1 case » et Valeur 1.
  const effetDistance = { Nom: "Distance", Effet_Base: "Portée de 1 case", Valeur: "1",
                          Pourcent_Base: "0", Pourcent_Max: "0" };
  const action = (nomBase) => ({ baseEffet: { Nom: nomBase }, count: 1, mods: {} });

  const lire = (race, nomBase, crans) => {
    p.w.forgeState = { statsPerso: { Race: race } };
    const contexte = { window: p.w, parseFrenchFloat: null };
    return new Function('window', SRC_FORGE
      + `\n return formatterTexteEffet(${JSON.stringify(effetDistance)}, ${crans},`
      + ` ${JSON.stringify(action(nomBase))});`)(p.w);
  };

  const humainMagie = lire("Humain", "Mot de pouvoir", 1);
  const ondariMagie = lire("Ondari", "Mot de pouvoir", 1);
  const ondariPhysique = lire("Ondari", "Attaque légère", 1);
  const humainDeuxCrans = lire("Humain", "Mot de pouvoir", 2);
  const ondariDeuxCrans = lire("Ondari", "Mot de pouvoir", 2);
  console.log(`     1 cran : « ${humainMagie} » (Humain) contre « ${ondariMagie} » (Ondari)`);
  console.log(`     2 crans : « ${humainDeuxCrans} » (Humain) contre « ${ondariDeuxCrans} » (Ondari)`);

  verifier("la carte d'un Humain annonce 2 cases", /\b2\b/.test(humainMagie), `(${humainMagie})`);
  verifier("celle d'un Ondari en annonce 3", /\b3\b/.test(ondariMagie), `(${ondariMagie})`);
  verifier("mais pas sur une attaque physique", /\b2\b/.test(ondariPhysique), `(${ondariPhysique})`);
  verifier("le bonus ne compte qu'une fois, même à deux crans de Distance",
           /\b4\b/.test(ondariDeuxCrans) && /\b3\b/.test(humainDeuxCrans),
           `(${humainDeuxCrans} → ${ondariDeuxCrans})`);
  p.rendreLeHasard();

  // Et surtout : la carte annonce-t-elle la portée que le sort AURA vraiment ?
  // On fait passer la même carte par le vrai ciblage du moteur.
  const porteeReelle = async (race, nomBase) => {
    const q = poste({ domComplet: true });
    const lanceur = combattant(race, { idPersonnage: "J2" });
    q.w.PERSOS_PARTIE = [lanceur, combattant("Humain", { idPersonnage: "J1", camp: "Ennemi" })];
    q.w.COMBAT_PERSOS_JOUEUR = [lanceur];
    q.w.TOKENS_VTT_DATA = { J2: { q: 0, r: 0 }, J1: { q: 1, r: 0 } };
    q.w.EFFETS_BDD_CACHE = {
      BASE: { Nom: nomBase, Valeur: "12", Pourcent_Base: "0" },
      DIST: { Nom: "Distance", Valeur: "1", Pourcent_Base: "0" }
    };
    q.w.COMPETENCES_CACHE = { C1: { Nom: "Essai", Fatigue: 10, Initiative: 50, Effets_Compiles: [],
      Composants: { actions: [{ baseEffetId: "BASE", count: 1, mods: { DIST: 1 },
                                zoneHexes: [], baseDuree: 0, modsDuree: {} }] } } };
    q.w.dessinerAnneauxCiblage = () => {};
    q.w.assombrirCasesJouables = () => {};
    q.w.casesPosablesZone = () => [];
    q.w.addEventListener = () => {};
    await q.w.demarrerCiblage("C1");
    const portee = q.w.ETAT_CIBLAGE && q.w.ETAT_CIBLAGE.attaques[0]
      ? q.w.ETAT_CIBLAGE.attaques[0].rangeMax : null;
    q.rendreLeHasard();
    return portee;
  };
  const porteeHumain = await porteeReelle("Humain", "Mot de pouvoir");
  const porteeOndari = await porteeReelle("Ondari", "Mot de pouvoir");
  const porteeOndariPhys = await porteeReelle("Ondari", "Attaque légère");
  console.log(`     portée réelle en combat : ${porteeHumain} (Humain), ${porteeOndari} (Ondari),`
            + ` ${porteeOndariPhys} (Ondari en physique)`);
  verifier("le moteur donne la portée que la carte annonçait",
           porteeHumain === 2 && porteeOndari === 3,
           `(carte 2 et 3 → moteur ${porteeHumain} et ${porteeOndari})`);
  verifier("et rien de plus sur une attaque physique", porteeOndariPhys === 2, `(${porteeOndariPhys})`);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
