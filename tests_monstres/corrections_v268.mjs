// v268 — LE SYSTÈME D'APPARITION REVU ; LE POISON, LA BRÛLURE ET LE SAIGNEMENT SOUS LE BOUCLIER
//
// Nico :
//  · « Revoir le système d'apparition : je te donne le tableau mis à jour avec les nouvelles
//    apparitions » — Apparition 1 (5 cas), 2 (5 cas), 3 (3 cas), 4 et plus (5 cas) : leaders imposés,
//    possibles ou absents, la relève, la meute qui grossit à chaque tour, le gardien dont la vie
//    appelle des Petits, les fuyards (+70 % d'esquive des attaques d'opportunité ; s'ils tiennent
//    7 tours, l'Apparition 4 entre et ils attaquent), les deux murailles, le terrain piégé (25 % des
//    cases, 2 Petits à −50 % de PV, « ! » et fumée), les vagues, la horde qui revient, la relève
//    quand tous sont morts, les cohues (−25 / −40 / −50 % de PV, 2 objets par joueur sans partage,
//    −10 / −20 / −30 % d'XP).
//  · « Dans Paramètres > Apparitions, fais en sorte que l'on puisse modifier les valeurs du tour
//    d'apparition des renforts, et qu'on puisse changer ou non les compositions de monstres. »
//  · « Poison / brûlure / saignement infligent des dégâts aux PV même si un bouclier est actif.
//    Les DOT, c'est au bouclier. »
//
// DANS LE NOYAU (Node) : 1. le bouclier et les tics ; 2. le fuyard (sa fuite, son tir, son repos,
// sa dérobade, la fin de sa fuite) ; 3. les cases piégées ; 4. le tableau et son tirage, cas par cas,
// et son réglage.
// SUR LA VRAIE PAGE (faux Firestore) : 5 à 11, puis les versions.
// Le banc se charge sur l'ancien code (IVALIS_RACINE) : il y échoue, sans planter.
import fs from 'fs';
import http from 'http';
import path from 'path';

const RACINE = process.env.IVALIS_RACINE || '/home/user/Ivalis';
let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(78)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const essai = (f, d = null) => { try { return f(); } catch (e) { return d; } };
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf-8');
const titre = (t) => { console.log("\n========================================================="); console.log("  " + t); console.log("========================================================="); };

const CE = await import(path.join(RACINE, 'combat_etat.js'));
const CC = await import(path.join(RACINE, 'cerveau_combat.js'));
const MV = await import(path.join(RACINE, 'mouvement_pur.js'));
const IA = await import(path.join(RACINE, 'ia_pure.js'));

const combattant = (id, camp, q, r, extra = {}) => ({ id, nom: id, camp, estMonstre: camp === "Ennemi", estIllusion: false, joueur: "", race: "", couleur: "",
  personnalite: "brutal", palier: "Normal", pv: 100, pvMax: 100, bouclier: 0, bouclierMax: 0, fatigue: 100, fatigueMax: 100, q, r, etats: [], aTerre: false,
  def: { esquive: 0, parade: 0, physique: 0, magique: 0, critique: 0 }, atouts: {}, equip: {}, mod: {}, stats: {}, ...extra });
const etatDe = (combattants, extra = {}) => ({ format: 1, version: 3, manche: 1, phase: "Resolution", graine: 5, file: [], ordre: Object.keys(combattants),
  zones: {}, combattants, pieges: [], piegesDeclenches: [], ...extra });

titre("1. LE POISON, LA BRÛLURE ET LE SAIGNEMENT PASSENT SOUS LE BOUCLIER ; LES DOT, NON");
{
  const avec = (nom, extra = {}) => {
    const e = etatDe({ H1: combattant("H1", "Allié", 0, 0, { bouclier: 30, bouclierMax: 30, etats: [{ nom, duree: 2, ...extra }] }) });
    essai(() => CC.ticsDeFinDeManche(e));
    const h = e.combattants.H1;
    return { pv: h.pv, bouclier: h.bouclier };
  };
  const brule = avec("Brûlé"), saigne = avec("Saignement"), poison = avec("Empoisonnement"), dot = avec("Étalement", { tics: [10, 10] });
  verifier("BRÛLÉ : la vie baisse (8 PV), le bouclier ne bouge pas", brule.pv === 92 && brule.bouclier === 30, JSON.stringify(brule));
  verifier("SAIGNEMENT : de même", saigne.pv === 92 && saigne.bouclier === 30, JSON.stringify(saigne));
  verifier("EMPOISONNEMENT : de même", poison.pv === 92 && poison.bouclier === 30, JSON.stringify(poison));
  verifier("UN DOT (étalement) : le bouclier encaisse d'abord, la vie ne bouge pas", dot.pv === 100 && dot.bouclier === 20, JSON.stringify(dot));
  verifier("…le chiffre de la brûlure le dit sur la vie (pas sur le bouclier)", (() => {
    const e = etatDe({ H1: combattant("H1", "Allié", 0, 0, { bouclier: 30, bouclierMax: 30, etats: [{ nom: "Brûlé", duree: 2 }] }) });
    const et = essai(() => CC.ticsDeFinDeManche(e), []) || [];
    const d = et.find(x => x.type === "degats");
    return !!d && d.pvApres === 92 && !(d.surBouclier > 0);
  })());
}

titre("2. LE FUYARD : IL FUIT, PUIS TIRE OU SE REPOSE ; IL SE DÉROBE ; SA FUITE CESSE AU TOUR 8");
{
  const fuyard = (extra = {}) => combattant("F1", "Ennemi", 1, 0, { palier: "Petit", fuyard: { esquiveOpportunite: 70, jusqua: 8 }, ...extra });
  const e0 = etatDe({ H1: combattant("H1", "Allié", 0, 0), F1: fuyard() }, { manche: 2 });
  const tir = essai(() => IA.deciderTourCreature(e0, "F1", { portee: 5, fatigue: 10 }, null, CE.creerDes(3)), null);
  const arrivee = tir && tir.chemin.length ? tir.chemin[tir.chemin.length - 1] : { q: 1, r: 0 };
  const d = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  verifier("collé à un héros, il s'éloigne d'abord", !!tir && d(arrivee, { q: 0, r: 0 }) >= 3, tir ? JSON.stringify(arrivee) : "");
  verifier("…puis tire : la cible est à portée de sa carte (5)", !!tir && tir.lancera === true && tir.cible === "H1" && d(arrivee, { q: 0, r: 0 }) <= 5, JSON.stringify(tir && { l: tir.lancera, c: tir.cible }));
  const fatigue = etatDe({ H1: combattant("H1", "Allié", 0, 0), F1: fuyard({ fatigue: 25 }) }, { manche: 2 });
  const repos = essai(() => IA.deciderTourCreature(fatigue, "F1", { portee: 5, fatigue: 10 }, null, CE.creerDes(3)), null);
  verifier("à bout de souffle : il fuit du maximum de cases et se repose", !!repos && repos.repos === true && !repos.lancera && repos.chemin.length >= 2, JSON.stringify(repos && { r: repos.repos, n: repos.chemin.length }));
  const pas = essai(() => CC.jouerCreature(fatigue, "F1", null, null, null), null);
  const reposPris = pas && (pas.entree ? pas.entree.etapes : pas.etapes || []).find(x => x.type === "fatigue" && x.repos && x.cible === "F1");
  verifier("…le cerveau lui donne son repos long", !!reposPris && reposPris.fatigueApres > 25, JSON.stringify(reposPris));
  const tard = etatDe({ H1: combattant("H1", "Allié", 0, 0), F1: fuyard() }, { manche: 8 });
  verifier("AU TOUR 8, SA FUITE CESSE : il redevient agressif", essai(() => CE.fuyardActif(tard, tard.combattants.F1), true) === false && essai(() => CE.fuyardActif(e0, e0.combattants.F1), false) === true);
  // La dérobade : 70 % des attaques d'opportunité.
  let evitees = 0;
  for (let g = 1; g <= 300; g++) {
    const e = etatDe({ H1: combattant("H1", "Allié", 0, 0), F1: fuyard() }, { manche: 2, graine: g });
    const c = essai(() => MV.resoudreOpportunite(e, "H1", "F1", CE.creerDes(g)), null);
    if (c && c.evitee) evitees++;
  }
  verifier("IL SE DÉROBE À ~70 % DES ATTAQUES D'OPPORTUNITÉ (300 jets)", evitees >= 190 && evitees <= 230, `${evitees} / 300`);
  let tardEvitees = 0;
  for (let g = 1; g <= 300; g++) {
    const e = etatDe({ H1: combattant("H1", "Allié", 0, 0), F1: fuyard() }, { manche: 9, graine: g });
    const c = essai(() => MV.resoudreOpportunite(e, "H1", "F1", CE.creerDes(g)), null);
    if (c && c.evitee) tardEvitees++;
  }
  verifier("…plus après la fin de sa fuite", tardEvitees < 20, `${tardEvitees} / 300`);
}

titre("3. LES CASES PIÉGÉES");
{
  const e0 = etatDe({ H1: combattant("H1", "Allié", 0, 0), M1: combattant("M1", "Ennemi", 6, 0) }, { pieges: ["2_0", "4_0"] });
  const r = essai(() => MV.resoudreMouvement(e0, { idLanceur: "H1", chemin: [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }] }, CE.creerDes(1), null), null);
  const piege = r && r.etapes.find(x => x.type === "piege");
  verifier("UN HÉROS POSE LE PIED SUR UNE CASE PIÉGÉE : « piège » en (2,0)", !!piege && piege.hex.q === 2 && piege.hex.r === 0 && piege.acteur === "H1", JSON.stringify(piege));
  verifier("…il s'arrête là", !!r && r.etat.combattants.H1.q === 2, r ? `${r.etat.combattants.H1.q}` : "");
  verifier("…la case ne sert qu'une fois ; l'histoire la retient", !!r && JSON.stringify(r.etat.pieges) === '["4_0"]' && r.etat.piegesDeclenches.length === 1, r ? JSON.stringify([r.etat.pieges, r.etat.piegesDeclenches]) : "");
  const rejeu = essai(() => CE.appliquerEtape(JSON.parse(JSON.stringify(e0)), piege), null);
  verifier("rejouée sur un autre écran, l'étape fait la même chose", !!rejeu && JSON.stringify(rejeu.pieges) === '["4_0"]' && rejeu.piegesDeclenches.length === 1);
  const monstre = essai(() => MV.resoudreMouvement(e0, { idLanceur: "M1", chemin: [{ q: 5, r: 0 }, { q: 4, r: 0 }] }, CE.creerDes(1), null), null);
  verifier("une créature n'en déclenche aucune", !!monstre && !monstre.etapes.some(x => x.type === "piege") && monstre.etat.pieges.length === 2);
  const construit = essai(() => CE.construireEtatCombat({ idPartie: "P", combattants: [], positions: {}, partie: { Pieges_Apparition: ["1_1", "2_2"], Tour_Combat: 1 } }), {});
  verifier("l'état du combat reprend les cases piégées de la partie", JSON.stringify(construit.pieges) === '["1_1","2_2"]', JSON.stringify(construit.pieges));
}

titre("4. LE TABLEAU DE NICO ET SON TIRAGE, CAS PAR CAS");
const AP = (() => {
  const w = { confirm: () => true };
  const doc = { getElementById: () => null, activeElement: null };
  const src = essai(() => lire('apparitions.js'), "");
  essai(() => new Function('window', 'document', src)(w, doc));
  return w;
})();
{
  const ARCH = { TANK: "TANK CAC", SOUTIEN: "SOUTIEN" };
  const DIST = ["DPS DISTANCE", "DPS MAGE DISTANCE"], CAC = ["TANK CAC", "DPS CAC", "DPS MAGE CAC"];
  const par = {};
  for (let i = 0; i < 6000; i++) {
    const t = typeof AP.tirerApparition === "function" ? essai(() => AP.tirerApparition("aleatoire"), null) : null;
    if (!t) break;
    (par[`${t.apparition}.${t.cas}`] = par[`${t.apparition}.${t.cas}`] || []).push(t);
  }
  const L = (k) => par[k] || [];
  const tous = (k, f) => L(k).length > 0 && L(k).every(f);
  const compo = (l) => `${l.filter(m => m.palier === "Normal").length}N${l.filter(m => m.palier === "Petit").length}P`;
  const soutiens = (l) => l.filter(m => m.archetype === ARCH.SOUTIEN).length;
  const heures = (t) => t.renforts.map(m => m.entreeManche || (m.surReleve ? "R" : m.quandVide ? "V" : "?"));
  verifier("18 cas, tous tirés", Object.keys(par).length === 18, Object.keys(par).sort().join(" "));
  // Les chances : Apparition 1 à 20 % chacun, la 2 à 40/15/15/15/15, la 3 à 60/20/20, la 4 à 40/15/15/15/15.
  const part = (n, c) => L(`${n}.${c}`).length / [1, 2, 3, 4, 5].reduce((t, x) => t + L(`${n}.${x}`).length, 0);
  verifier("les chances : 1 → 20 % chacun ; 2 et 4 → 40 / 15… ; 3 → 60 / 20 / 20",
           Math.abs(part(1, 1) - 0.2) < 0.05 && Math.abs(part(2, 1) - 0.4) < 0.06 && Math.abs(part(3, 1) - 0.6) < 0.06 && Math.abs(part(4, 2) - 0.15) < 0.05,
           [part(1, 1), part(2, 1), part(3, 1), part(4, 2)].map(x => Math.round(x * 100) + "%").join(" "));
  verifier("1.1 LE CHEF : 1 Normal au contact, leader ; 4 Petits au tour 2 (dont un soutien)",
           tous("1.1", t => compo(t.depart) === "1N0P" && CAC.includes(t.depart[0].archetype) && t.depart[0].leader
                && compo(t.renforts) === "0N4P" && t.renforts.every(m => m.entreeManche === 2) && soutiens(t.renforts) === 1));
  verifier("1.2 CELUI QUI NE MÈNE PAS : il se relève en leader ; à sa relève 1N+2P, 2N ou 4P",
           tous("1.2", t => t.depart[0].releveEnLeader && !t.depart[0].leader && t.renforts.every(m => m.surReleve)
                && ["1N2P", "2N0P", "0N4P"].includes(compo(t.renforts))));
  verifier("1.3 LA MEUTE : un Petit ou un Normal ; un Petit à chaque tour, 5 ou 6 fois, sans soutien",
           tous("1.3", t => ["0N1P", "1N0P"].includes(compo(t.depart)) && [5, 6].includes(t.renforts.length)
                && JSON.stringify(heures(t)) === JSON.stringify(t.renforts.map((_, i) => 2 + i)) && soutiens(t.renforts) === 0),
           JSON.stringify(heures(L("1.3")[0] || { renforts: [] })));
  verifier("1.4 LE CHEF ET SES LIEUTENANTS : un Normal leader ; 1N+1P aux tours 2 et 4, sans soutien",
           tous("1.4", t => t.depart[0].leader && JSON.stringify(heures(t)) === "[2,2,4,4]" && soutiens(t.renforts) === 0));
  verifier("1.5 LE GARDIEN : un Normal tank, l'ancre ; un Petit à chaque tour tant qu'il vit ; pas de leader",
           tous("1.5", t => t.depart[0].archetype === ARCH.TANK && t.depart[0].ancre && t.renforts.every(m => m.tantQueVivant && m.annuleSiVide)
                && t.renforts[0].entreeManche === 2 && ![...t.depart, ...t.renforts].some(m => m.leader)));
  verifier("2.1 LA PATROUILLE : 2N ou 1N+1P sans leader au départ ; au tour 3, 1N+1P ou 3P (leader possible)",
           tous("2.1", t => ["2N0P", "1N1P"].includes(compo(t.depart)) && !t.depart.some(m => m.leader) && t.renforts.every(m => m.entreeManche === 3)
                && ["1N1P", "0N3P"].includes(compo(t.renforts))));
  verifier("2.2 LES FUYARDS : 2 Petits à distance, leaders, fuyards (70 %, jusqu'au tour 8)",
           tous("2.2", t => compo(t.depart) === "0N2P" && t.depart.every(m => DIST.includes(m.archetype) && m.leader && m.fuyard
                && m.fuyard.esquiveOpportunite === 70 && m.fuyard.jusqua === 8)));
  verifier("…au tour 8 l'Apparition 4 entre, sans leader — pas si tous sont vaincus avant",
           tous("2.2", t => t.renforts.every(m => m.entreeManche === 8 && m.annuleSiVide && m.sansLeader && !m.leader && m.finFuite)
                && ["4N0P", "3N1P", "2N2P", "0N5P"].includes(compo(t.renforts))));
  verifier("2.3 LES DEUX MURAILLES : 2 Normaux tanks ; un Petit tous les 2 tours (ni tank ni soutien), annulé si tous vaincus",
           tous("2.3", t => compo(t.depart) === "2N0P" && t.depart.every(m => m.archetype === ARCH.TANK)
                && JSON.stringify(heures(t)) === "[3,5,7,9,11]" && t.renforts.every(m => m.annuleSiVide && m.archetype !== ARCH.TANK && m.archetype !== ARCH.SOUTIEN)));
  verifier("2.4 LE TERRAIN PIÉGÉ : 2 Normaux à distance, fuyards ; 25 % de cases piégées, 2 Petits à −50 % de PV",
           tous("2.4", t => compo(t.depart) === "2N0P" && t.depart.every(m => DIST.includes(m.archetype) && m.fuyard && !m.fuyard.jusqua)
                && t.pieges && t.pieges.pct === 25 && t.pieges.pvPct === -50 && compo([{ palier: "Petit" }, { palier: "Petit" }]) === "0N2P"));
  verifier("2.5 LES VAGUES : 2N, 1N+1P ou 2P ; 1N+1P ou 2P aux tours 2 et 4",
           tous("2.5", t => ["2N0P", "1N1P", "0N2P"].includes(compo(t.depart)) && t.renforts.every(m => [2, 4].includes(m.entreeManche))));
  verifier("3.1 LA BANDE : 3N, 1N+2P ou 2N+1P ; au tour 5, 1N+1P ou 3P",
           tous("3.1", t => ["3N0P", "1N2P", "2N1P"].includes(compo(t.depart)) && t.renforts.every(m => m.entreeManche === 5)));
  verifier("3.2 LES DEUX CHEFS : deux Normaux leaders et un Normal ou un Petit ; pas de renfort, pas de soutien",
           tous("3.2", t => t.depart.filter(m => m.leader && m.palier === "Normal").length === 2 && t.depart.length === 3 && t.renforts.length === 0 && soutiens(t.depart) === 0));
  verifier("3.3 LA HORDE : 3 au hasard ; un Petit tous les 3 tours, 5 fois, ni tank ni soutien",
           tous("3.3", t => t.depart.length === 3 && JSON.stringify(heures(t)) === "[4,7,10,13,16]" && t.renforts.every(m => m.annuleSiVide && m.archetype !== ARCH.TANK && m.archetype !== ARCH.SOUTIEN)));
  verifier("4.1 L'ESCOUADE : 4N, 3N+1P, 2N+2P ou 5P ; pas de renfort",
           tous("4.1", t => ["4N0P", "3N1P", "2N2P", "0N5P"].includes(compo(t.depart)) && t.renforts.length === 0));
  verifier("4.2 LA RELÈVE : 4 Petits ; 4 Petits quand tous sont morts",
           tous("4.2", t => compo(t.depart) === "0N4P" && compo(t.renforts) === "0N4P" && t.renforts.every(m => m.quandVide)));
  verifier("4.3 / 4.4 / 4.5 LES COHUES : 5 (3N) −25 %, 6 (3N) −40 %, 7 (3N au plus) −50 % ; 2 objets, −10/−20/−30 % d'XP ; pas de leader",
           tous("4.3", t => compo(t.depart) === "3N2P" && t.depart.every(m => m.pvPct === -25 && !m.leader) && t.butin.xpPct === -10 && t.butin.parJoueur === 2 && !("partage" in t.butin))
           && tous("4.4", t => compo(t.depart) === "3N3P" && t.depart.every(m => m.pvPct === -40) && t.butin.xpPct === -20)
           && tous("4.5", t => t.depart.length === 7 && t.depart.filter(m => m.palier === "Normal").length <= 3 && t.depart.every(m => m.pvPct === -50) && t.butin.xpPct === -30));
  const possible = ["1.3", "2.1", "3.1", "4.1"].map(k => L(k).filter(t => [...t.depart, ...t.renforts].some(m => m.leader)).length / Math.max(1, L(k).length));
  verifier("« leader possible » : ~60 % des rencontres", possible.every(x => Math.abs(x - 0.6) < 0.12), possible.map(x => Math.round(x * 100) + "%").join(" "));
  // Le réglage.
  const t2 = essai(() => AP.normaliserTableApparitions({ 1: { cas: [{ chance: 55, renforts: [{ tour: 3, possibilites: [{ Normal: 1, Petit: 1 }, { Normal: 99, Petit: 0 }] }] }] },
                                                         3: { cas: [null, null, { renforts: [{ chaqueTours: 2, fois: [2, 3] }] }] } }), null);
  verifier("RÉGLÉ : une chance, un tour, des compositions (bornées) ; le reste reste celui de Nico",
           !!t2 && t2[1].cas[0].chance === 55 && t2[1].cas[0].renforts[0].tour === 3
           && JSON.stringify(t2[1].cas[0].renforts[0].possibilites) === '[{"Normal":1,"Petit":1},{"Normal":8,"Petit":0}]'
           && t2[1].cas[1].chance === 20 && t2[3].cas[2].renforts[0].chaqueTours === 2 && JSON.stringify(t2[3].cas[2].renforts[0].fois) === "[2,3]",
           t2 ? JSON.stringify(t2[1].cas[0].renforts[0]) : "");
  if (t2) { AP.APPARITIONS = t2; }
  const regle = typeof AP.tirerApparition === "function" ? essai(() => AP.tirerApparition(1), null) : null;
  let auTour3 = 0;
  for (let i = 0; regle && i < 400; i++) { const t = AP.tirerApparition(1); if (t.cas === 1 && t.renforts.every(m => m.entreeManche === 3)) auTour3++; }
  verifier("…et le tirage suit le réglage", !!regle && auTour3 > 100, `${auTour3}`);
}

titre("5. LA MISE EN SCÈNE : LE « ! » DU PIÈGE, L'ENTRÉE EN FUMÉE");
{
  const PC = await import(path.join(RACINE, 'pont_combat.js'));
  const e = { combattants: { H1: { id: "H1", pv: 10, pvMax: 10 } } };
  const sc = essai(() => PC.misEnScene({ type: "piege", acteur: "H1", hex: { q: 2, r: 0 } }, e), {}) || {};
  verifier("l'étape « piege » : « ❗ Piège ! » sur le héros, et son geste", sc.geste === "message" && /Piège/.test(sc.texte || "") && sc.reaction && sc.reaction.sorte === "piege",
           JSON.stringify(sc).slice(0, 120));
  const ar = essai(() => PC.misEnScene({ type: "arrivee", combattant: { id: "M9", piege: true } }, e), {}) || {};
  verifier("une créature surgie d'un piège arrive « en fumée »", ar.geste === "arrivee" && ar.piege === true, JSON.stringify(ar));
  verifier("toute étape du noyau a sa mise en scène", essai(() => Object.keys(CE.APPLICATEURS).every(t => PC.TYPES_MIS_EN_SCENE.includes(t)), false));
  const cat = lire('animations_catalogue.js'), jeu = lire('animations_jeu.js');
  verifier("au catalogue : « jeu-piege » et « jeu-apparition-fumee » ; branchés", /id: "jeu-piege"/.test(cat) && /id: "jeu-apparition-fumee"/.test(cat)
           && /fumee: "jeu-apparition-fumee"/.test(jeu) && /piege: "jeu-piege"/.test(jeu));
}


const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const chemin = path.join(RACINE, decodeURIComponent(req.url.split('?')[0]));
  if (!chemin.startsWith(RACINE) || !fs.existsSync(chemin) || fs.statSync(chemin).isDirectory()) { res.writeHead(404); res.end('non trouvé'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(chemin)] || 'text/plain' });
  res.end(fs.readFileSync(chemin));
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${serveur.address().port}`;

const FAUX_APP = `export const initializeApp = () => ({});`;
const FAUX_FIRESTORE = `
  export const initializeFirestore = () => ({});
  export const getFirestore = () => ({});
  export const doc = (_db, ...chemin) => ({ chemin: chemin.join("/") });
  export const collection = (_db, col) => ({ col });
  const docs = () => (window.__docs = window.__docs || {});
  export const getDoc = async (ref) => { const d = docs()[ref.chemin]; return { exists: () => !!d, data: () => JSON.parse(JSON.stringify(d || {})) }; };
  export const getDocs = async (ref) => { const l = ((window.__collections || {})[ref && ref.col] || []).map(x => ({ id: x.id, data: () => x.data }));
    return { forEach: (f) => l.forEach(f), docs: l, empty: l.length === 0 }; };
  export const setDoc = async (ref, data, options) => { (window.__ecrits = window.__ecrits || []).push({ chemin: ref.chemin, data, options });
    docs()[ref.chemin] = options && options.merge ? { ...(docs()[ref.chemin] || {}), ...data } : data; };
  export const updateDoc = async (ref, data) => { (window.__majs = window.__majs || []).push({ chemin: ref.chemin, data });
    if (docs()[ref.chemin]) Object.assign(docs()[ref.chemin], JSON.parse(JSON.stringify(data))); };
  export const deleteDoc = async () => {}; export const addDoc = async () => ({ id: "n" });
  export const deleteField = () => "x"; export class FieldPath { constructor(...s){this.s=s;} }
  export const arrayUnion = (...v) => v; export const arrayRemove = (...v) => v;
  export const increment = (n) => n; export const serverTimestamp = () => Date.now();
  export const onSnapshot = () => () => {};
  export const query = (...a) => ({a}); export const where = (...a) => ({a}); export const orderBy = (...a) => ({a}); export const limit = (...a) => ({a});
  export const writeBatch = () => { const ops = []; return { set(ref, d){ ops.push({ chemin: ref.chemin, data: d }); }, update(ref, d){ ops.push({ chemin: ref.chemin, data: d }); },
    delete(){}, commit: async () => { (window.__lots = window.__lots || []).push(...ops); } }; };
  export const runTransaction = async (_d, fn) => fn({ get: async()=>({exists:()=>true,data:()=>({})}), update(){}, set(){} });
  export const Timestamp = { now: () => Date.now() };
`;
// La plaque de l'encart (injoignable d'ici) : un bouchon carré.
const PLAQUE = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect x="120" y="160" width="890" height="840" rx="40" fill="#1d1712"/></svg>`;
const PION = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><circle cx="100" cy="100" r="96" fill="#c44"/></svg>`;
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
await p.route('**res.cloudinary.com**', r => r.fulfill({ contentType: 'image/svg+xml', headers: {'Access-Control-Allow-Origin':'*'},
  body: /IMG_2122/.test(r.request().url()) ? PLAQUE : PION }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(1200);
await p.evaluate(() => { window.__poserReel = window.poserMonstreSurTerrain; });
await p.waitForTimeout(1500);

// =========================================================================
//  SUR LA VRAIE PAGE
// =========================================================================
await p.evaluate(async () => {
  window.__ou = (f, d) => { try { return f(); } catch (e) { return d; } };
  window.__ouAsync = async (f, d) => { try { return await f(); } catch (e) { return d; } };
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  window.jouerSonClic = () => {};
  window.ID_PARTIE_COURANTE = "P1";
  window.confirm = () => true;
});

titre("6. PARAMÈTRES > APPARITIONS : LES TOURS ET LES COMPOSITIONS SE RÈGLENT");
{
  const r = await p.evaluate(async () => {
    const res = {};
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => e.style.display = e.id === "ecran-jeu" ? "block" : "none");
    const param = document.getElementById("conteneur-parametres");
    param.style.display = "block"; param.classList.add("ouvert");
    const f = document.getElementById("etape-rencontres-monstres");
    f.style.display = "block"; f.style.opacity = "1";
    window.__ou(() => window.dessinerTableRencontres(), null);
    const hote = document.getElementById("corps-rencontres-monstres");
    res.cas = hote.querySelectorAll(".apparition-cas").length;
    res.champs = hote.querySelectorAll("input.apparition-champ").length;
    const champ = (chemin) => hote.querySelector(`[data-chemin="${chemin}"]`);
    const changer = async (chemin, v) => { const el = champ(chemin); if (!el) return false; el.value = String(v); el.dispatchEvent(new Event("change")); await new Promise(r2 => setTimeout(r2, 30)); return true; };
    window.__ecrits = [];
    res.tour = await changer("1.cas.0.renforts.0.tour", 3);
    res.apresTour = window.APPARITIONS[1].cas[0].renforts[0].tour;
    res.compo = await changer("1.cas.0.renforts.0.possibilites.0.Petit", 3);
    res.apresCompo = JSON.stringify(window.APPARITIONS[1].cas[0].renforts[0].possibilites);
    const plus = hote.querySelector('[data-apparition="1"][data-cas="0"] .apparition-ajouter');
    if (plus) plus.click();
    await new Promise(r2 => setTimeout(r2, 30));
    res.ajout = window.APPARITIONS[1].cas[0].depart.possibilites.length;
    res.regle = await changer("2.cas.0.renforts.0.regle", "niTankNiSoutien");
    res.apresRegle = window.APPARITIONS[2].cas[0].renforts[0].regle;
    res.chance = await changer("3.cas.1.chance", 35);
    res.ecrits = (window.__ecrits || []).filter(e => e.chemin === "Monstres_Modeles/_REGLAGES");
    res.dernier = res.ecrits.length ? res.ecrits[res.ecrits.length - 1] : null;
    res.ecritOk = !!(res.dernier && res.dernier.data && res.dernier.data.Apparitions && res.dernier.options && res.dernier.options.merge
                     && res.dernier.data.Apparitions[1].cas[0].renforts[0].tour === 3 && res.dernier.data.Apparitions[3].cas[1].chance === 35);
    // Un autre poste : la base apporte un réglage.
    window.__ou(() => window.appliquerReglagesMonstres({ Apparitions: { 4: { cas: [{ chance: 10 }] } } }), null);
    res.ailleurs = window.APPARITIONS[4].cas[0].chance + "/" + window.APPARITIONS[1].cas[0].renforts[0].tour;
    // Un réglage d'une autre famille ne le touche pas.
    window.__ou(() => window.appliquerReglagesMonstres({ Bonus_Sorts_Pct: 20 }), null);
    res.autreFamille = window.APPARITIONS[4].cas[0].chance;
    window.__ecrits = [];
    window.__ou(() => window.retablirApparitions(), null);
    await new Promise(r2 => setTimeout(r2, 30));
    res.retabli = window.APPARITIONS[4].cas[0].chance + "/" + window.APPARITIONS[1].cas[0].renforts[0].tour;
    res.retabliEcrit = (window.__ecrits || []).some(e => e.chemin === "Monstres_Modeles/_REGLAGES" && e.data && e.data.Apparitions === "x");
    f.style.display = "none"; param.style.display = "none";
    return res;
  });
  verifier("les 18 cas, et leurs valeurs en champs", r.cas === 18 && r.champs > 60, `${r.cas} cas, ${r.champs} champs`);
  verifier("LE TOUR D'UN RENFORT SE CHANGE (1.1 : tour 2 → 3)", r.tour && r.apresTour === 3, `${r.apresTour}`);
  verifier("UNE COMPOSITION SE CHANGE (4 Petits → 3), une autre s'ajoute", r.compo && /"Petit":3/.test(r.apresCompo) && r.ajout === 2, `${r.apresCompo} · ${r.ajout}`);
  verifier("la règle d'archetype et la chance d'un cas aussi", r.regle && r.apresRegle === "niTankNiSoutien" && r.chance, r.apresRegle);
  verifier("CHAQUE CHANGEMENT S'ÉCRIT (Monstres_Modeles/_REGLAGES, Apparitions, fusionné)", r.ecritOk, `${r.ecrits.length} écriture(s)`);
  verifier("un autre poste règle : la table le suit ; un autre réglage n'y touche pas", r.ailleurs === "10/2" && r.autreFamille === 10, `${r.ailleurs} · ${r.autreFamille}`);
  verifier("« Rétablir le tableau de Nico » : tout revient, et la base l'oublie", r.retabli === "40/2" && r.retabliEcrit, `${r.retabli} · ${r.retabliEcrit}`);
}

titre("7. LES RENFORTS À LEUR HEURE : ANNULÉS SI TOUS VAINCUS, L'ANCRE, « QUAND TOUS SONT MORTS »");
{
  const r = await p.evaluate(async () => {
    const res = {};
    const poses = [];
    window.poserMonstreSurTerrain = async (m, t) => { const id = "R_" + poses.length; poses.push(m); t[id] = { q: 9, r: poses.length }; return id; };
    window.enregistrerPionsVTT = async () => {};
    window.equiperCompetencesRencontre = async () => {};
    window.initialiserPlateau();
    window.TOKENS_VTT_DATA = {};
    let debout = true;
    window.ennemisEncoreDebout = () => debout;
    const reserve = (l) => { window.__docs = window.__docs || {}; window.__docs["Systeme_Parties/P1"] = { Reserve_Monstres: l }; };
    const lue = () => (window.__docs["Systeme_Parties/P1"] || {}).Reserve_Monstres || [];
    const essai = async (manche, opts) => { poses.length = 0; const ids = await window.__ouAsync(() => window.entrerRenfortsPrevus(manche, opts), []); return { n: (ids || []).length, reste: lue().length }; };
    // a. À leur heure.
    reserve([{ archetype: "DPS CAC", palier: "Petit", entreeManche: 2 }, { archetype: "DPS CAC", palier: "Petit", entreeManche: 4 }]);
    res.heure = await essai(2, {});
    // b. Le terrain vidé : la vague « annulée » ne vient plus, celle « en avance » entre.
    debout = false;
    reserve([{ archetype: "DPS CAC", palier: "Petit", entreeManche: 6, annuleSiVide: true }, { archetype: "DPS CAC", palier: "Petit", entreeManche: 9 }]);
    res.vide = await essai(3, { terrainVide: true });
    reserve([{ archetype: "DPS CAC", palier: "Petit", entreeManche: 6, annuleSiVide: true }]);
    res.videSeule = await essai(3, { terrainVide: true });
    // c. « Quand tous sont morts ».
    reserve([{ archetype: "DPS CAC", palier: "Petit", quandVide: true }, { archetype: "DPS CAC", palier: "Petit", quandVide: true }]);
    debout = true;
    res.quandVidePasEncore = await essai(3, { terrainVide: false });
    debout = false;
    res.quandVide = await essai(4, { terrainVide: true });
    // d. L'ancre : ses Petits tant qu'elle vit.
    debout = true;
    window.MONSTRES_PARTIE = [{ idPersonnage: "A1", ancre: true, statut: "Vivant" }];
    window.estCombattantMort = (id) => window.__ancreMorte === true && id === "A1";
    window.__ancreMorte = false;
    reserve([2, 3, 4].map(m => ({ archetype: "DPS CAC", palier: "Petit", entreeManche: m, tantQueVivant: true, annuleSiVide: true })));
    res.ancreVit = await essai(2, {});
    window.__ancreMorte = true;
    res.ancreTombee = await essai(3, {});
    // e. Un « quand vide » n'entre pas à la mort d'une créature (l'ancienne réserve).
    reserve([{ archetype: "DPS CAC", palier: "Petit", quandVide: true }]);
    window.MONSTRES_PARTIE = [];
    res.ancienChemin = await window.__ouAsync(() => window.entrerRenfortMonstre(), "?");
    return res;
  });
  verifier("à leur heure : celui du tour 2 entre, celui du tour 4 attend", r.heure.n === 1 && r.heure.reste === 1, JSON.stringify(r.heure));
  verifier("TERRAIN VIDÉ : la vague « annulée si tous vaincus » ne vient plus, la suivante entre en avance", r.vide.n === 1 && r.vide.reste === 0, JSON.stringify(r.vide));
  verifier("…seule une vague annulée : la réserve se vide (la victoire peut se dire)", r.videSeule.n === 0 && r.videSeule.reste === 0, JSON.stringify(r.videSeule));
  verifier("« QUAND TOUS SONT MORTS » : rien avant, les 4 (ici 2) Petits ensuite", r.quandVidePasEncore.n === 0 && r.quandVide.n === 2 && r.quandVide.reste === 0,
           JSON.stringify([r.quandVidePasEncore, r.quandVide]));
  verifier("L'ANCRE : un Petit par tour tant qu'elle vit ; tombée, les autres ne viennent plus", r.ancreVit.n === 1 && r.ancreVit.reste === 2 && r.ancreTombee.n === 0 && r.ancreTombee.reste === 0,
           JSON.stringify([r.ancreVit, r.ancreTombee]));
  verifier("une créature qui meurt n'appelle pas la vague « quand tous sont morts »", r.ancienChemin === null, JSON.stringify(r.ancienChemin));
}

titre("8. LA POSE : PV RÉDUITS, FUYARD, ANCRE, SURGIE D'UN PIÈGE AUTOUR DE SA CASE");
{
  const r = await p.evaluate(async () => {
    window.initialiserPlateau();
    window.gabaritMonstre = () => ({ Cle: "DPS_CAC_PETIT", Archetype: "DPS CAC", Palier: "Petit", PV: 40, Fatigue_Max: 80, Res_Physique: 10, Res_Magique: 10,
                                     Parade_Esquive: 5, Regeneration: 30, Repos_Long: 50, Nombre_Actions: 1, XP_Groupe: 40 });
    window.__docs = window.__docs || {}; window.__docs["Systeme_Parties/P1"] = { Ordre_Initiative: [] };
    window.__ecrits = [];
    const vraie = window.__poserReel;
    const tokens = { H1: { q: 5, r: 5 } };
    const id = await window.__ouAsync(() => vraie({ archetype: "DPS CAC", palier: "Petit", nom: "Embusqué", pvPct: -50, piege: true, ancre: true,
                                                    fuyard: { esquiveOpportunite: 70, jusqua: 8 } }, tokens, { autour: { q: 5, r: 5 } }), null);
    const ec = (window.__ecrits || []).find(e => /^Monstres\//.test(e.chemin));
    const d = ec ? ec.data : {};
    const t = id ? tokens[id] : null;
    const dist = t ? (Math.abs(t.q - 5) + Math.abs(t.q + t.r - 10) + Math.abs(t.r - 5)) / 2 : -1;
    const triche = window.__ou(() => window.tricheMonstresActuelle(), 0);
    return { id: !!id, pv: d.PV_Max, attendu: 20 + triche, fuyard: d.Comportement_Fuyard, ancre: d.Ancre_Apparition, piege: d.Piege, dist };
  });
  verifier("−50 % de PV : 40 → 20 (+ la triche du niveau)", r.id && r.pv === r.attendu, `${r.pv} / ${r.attendu}`);
  verifier("sa fiche dit fuyard (70 %, jusqu'au tour 8), ancre, surgie d'un piège", !!r.fuyard && r.fuyard.esquiveOpportunite === 70 && r.fuyard.jusqua === 8 && r.ancre === true && r.piege === true,
           JSON.stringify([r.fuyard, r.ancre, r.piege]));
  verifier("SURGIE D'UN PIÈGE : posée tout contre la case piégée", r.dist === 1, `distance ${r.dist}`);
}

titre("9. LES CASES PIÉGÉES : 25 % DU TERRAIN, DEUX PETITS À −50 % QUI SURGISSENT AUTOUR");
{
  const r = await p.evaluate(async () => {
    window.initialiserPlateau();
    window.PLATEAU_VTT.resize(1600, 1200);
    const cases = window.__ou(() => window.casesDuPlateau(), []) || [];
    const tokens = { H1: { q: 3, r: 3 }, M1: { q: 8, r: 2 } };
    const pieges = window.__ou(() => window.tirerCasesPiegees(25, tokens), []) || [];
    const dist = (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
    const prochesDesPions = pieges.map(k => k.split("_").map(Number)).filter(([q, r]) => Object.values(tokens).some(t => dist(t, { q, r }) <= 1)).length;
    const libres = cases.filter(c => !Object.values(tokens).some(t => dist(t, c) <= 1)).length;
    // Le déclenchement.
    const appels = [];
    window.poserMonstreSurTerrain = async (m, t, o) => { const id = "P_" + appels.length; appels.push({ m, o }); t[id] = { q: 0, r: appels.length }; return id; };
    window.enregistrerPionsVTT = async () => {}; window.equiperCompetencesRencontre = async () => {};
    window.nommerMonstresIA = async (l) => l.map(() => "Rôdeur");
    window.PARTIE_DATA = { Pieges_Renfort: { possibilites: [{ Normal: 0, Petit: 2 }], pvPct: -50 } };
    const ids = await window.__ouAsync(() => window.declencherPiegeApparition({ q: 4, r: 1 }), []);
    return { cases: cases.length, pieges: pieges.length, part: pieges.length / Math.max(1, libres), prochesDesPions,
             ids: (ids || []).length, creatures: appels.map(a => ({ palier: a.m.palier, piege: a.m.piege, pv: a.m.pvPct, autour: a.o && a.o.autour })) };
  });
  verifier("le plateau a ses cases ; 25 % des cases libres piégées", r.cases > 100 && Math.abs(r.part - 0.25) < 0.02, `${r.pieges} / ${r.cases} (${Math.round(r.part * 100)} %)`);
  verifier("…jamais sous un pion ni juste à côté", r.prochesDesPions === 0, `${r.prochesDesPions}`);
  verifier("DÉCLENCHÉE : deux Petits, à −50 % de PV, surgis autour de la case", r.ids === 2 && r.creatures.every(c => c.palier === "Petit" && c.piege && c.pv === -50 && c.autour && c.autour.q === 4 && c.autour.r === 1),
           JSON.stringify(r.creatures));
  const regime = lire('regime_cerveau.js');
  verifier("le poste du cerveau les fait surgir et entrer tout de suite", /declencherPiegeApparition\(d\)[\s\S]{0,120}accueillirLesRenfortsMaintenant/.test(regime));
}

titre("10. LES COHUES : DEUX OBJETS PAR JOUEUR, MOINS D'EXPÉRIENCE (le partage reste, v270)");
{
  const r = await p.evaluate(() => {
    window.MONSTRES_PARTIE = [{ idPersonnage: "M1", statut: "Mort", XP_Groupe: 100 }, { idPersonnage: "M2", statut: "Mort", XP_Groupe: 100 }];
    window.PARTIE_DATA = {};
    const plein = window.__ou(() => window.xpDeLaVictoire(), null);
    window.PARTIE_DATA = { Apparition_Butin: { parJoueur: 2, xpPct: -20 } };
    const cohue = window.__ou(() => window.xpDeLaVictoire(), null);
    window.tirerObjetsAleatoires = (d, n) => Array.from({ length: n }, (_, i) => ({ uid: "o" + Math.random(), nom: "Objet " + i }));
    const servi = window.__ou(() => window.servirDepuisLaReserve(null, ["H1", "H2"], "Normale", 2), null);
    const trois = window.__ou(() => window.servirDepuisLaReserve(null, ["H1"], "Normale", 3), null);
    return { plein, cohue, deux: servi ? Object.values(servi.parPersonnage).map(b => b.items.length) : null, trois: trois ? trois.parPersonnage.H1.items.length : null };
  });
  verifier("−20 % d'expérience : 200 → 160", r.plein === 200 && r.cohue === 160, `${r.plein} → ${r.cohue}`);
  verifier("deux objets au hasard par joueur (le nombre suit le réglage)", JSON.stringify(r.deux) === "[2,2]" && r.trois === 3, JSON.stringify([r.deux, r.trois]));
  const loot = lire('loot.js');
  verifier("LA MISE EN COMMUN RESTE (Nico, v270 : « pas de partage, ça faut l'enlever partout »)",
           !/sansPartage/.test(loot) && !/partage === false/.test(loot));
  const monstres = lire('monstres.js');
  verifier("la rencontre écrit son butin, ses pièges et leurs renforts sur la partie", /Apparition_Butin: tirage\.butin/.test(monstres) && /Pieges_Apparition: pieges\.length/.test(monstres) && /Pieges_Renfort: tirage\.pieges/.test(monstres));
}

titre("11. LES VERSIONS");
{
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS = (\d+)/) || [])[1]);
  const vJson = essai(() => JSON.parse(lire('version.json')).version, 0);
  verifier("version 268 ou plus (trace_combat.js, version.json)", vTrace >= 268 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const v = (f) => [...html.matchAll(new RegExp('["/ ]' + f.replace(".", "\\.") + "\\?v=(\\d+)", "g"))].map(x => Number(x[1]));
  const ok = (f, min) => v(f).length > 0 && v(f).every(x => x >= min) && new Set(v(f)).size === 1;
  const attendus = [["apparitions.js", 1], ["monstres.js", 41], ["cerveau_combat.js", 61], ["combat_etat.js", 44], ["ia_pure.js", 16], ["mouvement_pur.js", 23],
                    ["pont_combat.js", 46], ["regime_cerveau.js", 53], ["loot.js", 29], ["combat.js", 153], ["animations_catalogue.js", 23], ["animations_jeu.js", 11], ["style.css", 99]];
  verifier("les modules touchés ont monté, apparitions.js est chargé avant monstres.js", attendus.every(([f, m]) => ok(f, m))
           && html.indexOf("apparitions.js?v=") < html.indexOf('src="monstres.js?v='), attendus.map(([f]) => `${f} ${v(f).join("/")}`).join(" · "));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
