// v267 — VINGT ET UNE DEMANDES : LE COMBAT, LE MENU, LES EFFETS, LES CRÉATURES
//
// Nico (extraits) :
//  · « Dans combat, mets le message “toucher pour voir le tour” en haut, au-dessus de OK. »
//  · « Cliquer sur les bulles de résistance des ennemis ne fait pas passer le tour, mais affiche le nom. »
//  · « Engagé : ne mets pas de symbole d'état, ni sur le token ni ailleurs. On est engagé quand un
//    ennemi nous a attaqué au tour d'avant au càc. »
//  · « Les renforts ennemis se font en fin de tour, après les animations de régénération. »
//  · « Refais les symboles d'état qui sont ronds : tous en losange. »
//  · « Quand mon perso fait un contre, l'ennemi ne prend pas les dégâts. »
//  · « Les spawns de monstres un à un, la caméra centrée sur eux, 2 secondes, puis le suivant ; à la
//    fin, la caméra revient sur le perso du joueur, sans toucher au zoom. »
//  · « Un leader : +40 % d'XP. » · « 60 % de chance d'un leader dans le combat. »
//  · « Le nom du joueur devient un bouton (Mon compte, Autorisation de création, Déconnexion), une
//    petite flèche beige, à droite, à gauche de la croix. » · « Sur la carte globale, le menu droit
//    est replié par défaut. »
//  · « Électrifié : 15 % (max 75 %), plus de baisse d'initiative. » · « Un nouvel élément : Arcane,
//    sans bonus, mais sans résistance. » · « Purification : 35 de fatigue, 2 états. »
//  · « DOT : pas de critique. » · « Leader : enlève la colonne des 15 pts. » · « Vérifie que les
//    monstres ne font pas de surpuissance. » · « Un clic sur un token : les PV et la fatigue sur ses
//    jauges. » · « Un même étalement d'une même compétence ne se cumule pas, mais repart à zéro. »
//    · « Le combat terminé vide la carte, comme Réinitialiser. » · « Traction magique sur un ennemi
//    à distance, même engagé au càc. »
//  Puis, en cours de route : « Le désengagement se fait si on quitte le càc du personnage auquel on
//  est engagé. » · « Pour la surpuissance des DOT, le cap de fatigue de 70 et de 100 doit être
//  atteint après la réduction due à l'étalement. »
//
// DANS LE NOYAU (Node) : 1. l'engagement ; 2. le Contre ; 3. l'étalement (non-cumul, pas de
// critique) ; 4. le leader (plus de chance d'état) ; 5. LE VRAI CERVEAU : les renforts entrent à la
// fin de la manche, avant les cartes.
// SUR LA VRAIE PAGE (faux Firestore) : 6 à 20, puis les versions.
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
const MP = await import(path.join(RACINE, 'moteur_pur.js'));
const CC = await import(path.join(RACINE, 'cerveau_combat.js'));

const combattant = (id, camp, q, extra = {}) => ({ id, nom: id, camp, estMonstre: camp === "Ennemi", estIllusion: false, joueur: "", race: "", couleur: "",
  personnalite: "brutal", palier: "Normal", pv: 100, pvMax: 100, bouclier: 0, bouclierMax: 0, fatigue: 100, fatigueMax: 100, q, r: 0, etats: [], aTerre: false,
  def: { esquive: 0, parade: 0, physique: 0, magique: 0, critique: 0 }, atouts: {}, equip: {}, mod: {}, stats: {}, ...extra });
const etatDe = (combattants, extra = {}) => ({ format: 1, version: 3, manche: 1, phase: "Resolution", graine: 3, file: [], ordre: Object.keys(combattants),
  zones: {}, combattants, ...extra });
const coup = (cibles, extra = {}) => ({ nom: "Attaque lourde", typeRes: "Physique", valeurBrute: 9, isRanged: false, rangeMax: 1, cibles, ...extra });
const resoudre = (etat, idLanceur, idCarte, attaques, extra = {}) =>
  essai(() => MP.resoudreCarte(etat, { idLanceur, idCarte, attaques, alterations: [], isZone: false, ...extra }), { etat, etapes: [] });

titre("1. ENGAGÉ : FRAPPÉ AU CONTACT, ENGAGÉ CETTE MANCHE ET LA SUIVANTE");
{
  const e0 = etatDe({ H1: combattant("H1", "Allié", 0), M1: combattant("M1", "Ennemi", 1) }, { manche: 3 });
  const r = resoudre(e0, "M1", "GRIFFE", [coup(["H1"])]);
  const h = r.etat.combattants.H1;
  const eng = (h.etats || []).find(x => x.nom === "Engagé") || {};
  verifier("le coup au contact engage, pour deux manches (celle-ci et la suivante)", eng.duree === 2 && JSON.stringify(eng.par) === '["M1"]', JSON.stringify(eng));
  verifier("…et retient la manche du coup", eng.depuis && eng.depuis.M1 === 3, JSON.stringify(eng.depuis));
  const a = (manche) => essai(() => MP.engageursDe({ ...r.etat, manche }, h), ["?"]);
  verifier("manche 3 (le coup) et manche 4 (la suivante) : engagé ; manche 5 : plus", a(3).length === 1 && a(4).length === 1 && a(5).length === 0,
           `${a(3)} / ${a(4)} / ${a(5)}`);
  const vieilli1 = JSON.parse(JSON.stringify(r.etat)); essai(() => CC.vieillirLesEtats(vieilli1));
  const vieilli2 = JSON.parse(JSON.stringify(vieilli1)); vieilli2.manche = 4; essai(() => CC.vieillirLesEtats(vieilli2));
  const reste = (e) => (e.combattants.H1.etats || []).some(x => x.nom === "Engagé");
  verifier("l'état survit à la fin de la manche du coup, tombe à la fin de la suivante", reste(vieilli1) && !reste(vieilli2));
  // Un second agresseur ne prolonge pas le premier.
  const e1 = JSON.parse(JSON.stringify(vieilli1)); e1.manche = 4;
  e1.combattants.M2 = combattant("M2", "Ennemi", 1, { r: -1 }); e1.combattants.M2.q = 0; e1.combattants.M2.r = 1; e1.ordre.push("M2");
  const r2 = resoudre(e1, "M2", "MORSURE", [coup(["H1"])]);
  const h2 = r2.etat.combattants.H1;
  const b = (manche) => essai(() => MP.engageursDe({ ...r2.etat, manche }, h2), ["?"]);
  verifier("un second agresseur (manche 4) : à la manche 5, seul lui engage encore", JSON.stringify(b(5)) === '["M2"]', `${b(4)} → ${b(5)}`);
  // LE DÉSENGAGEMENT (Nico, en cours de route : « le désengagement se fait si on quitte le càc du
  // personnage auquel on est engagé »).
  const loin = JSON.parse(JSON.stringify(r.etat)); loin.combattants.H1.q = -3;
  verifier("QUITTER LE CONTACT DE SON AGRESSEUR DÉSENGAGE", essai(() => MP.engageursDe(loin, loin.combattants.H1), ["?"]).length === 0);
  const pas = JSON.parse(JSON.stringify(r.etat));
  essai(() => CE.APPLICATEURS.pas(pas, { acteur: "H1", de: { q: 0, r: 0 }, vers: { q: -2, r: 0 }, cout: 0 }));
  verifier("…pour de bon : le pas qui s'éloigne retire l'état (revenir ne réengage pas sans un coup)",
           !(pas.combattants.H1.etats || []).some(x => x.nom === "Engagé"), JSON.stringify(pas.combattants.H1.etats));
  const colle = JSON.parse(JSON.stringify(r.etat));
  essai(() => CE.APPLICATEURS.pas(colle, { acteur: "H1", de: { q: 0, r: 0 }, vers: { q: 1, r: -1 }, cout: 0 }));
  verifier("…un pas qui reste au contact ne désengage pas", (colle.combattants.H1.etats || []).some(x => x.nom === "Engagé"));
  verifier("le malus des tirs vaut toujours engagé (−15 % au loin, −30 % au contact)",
           essai(() => MP.malusTirEngage({ isRanged: true }, 3, true, false)) === 15 && essai(() => MP.malusTirEngage({ isRanged: true }, 1, true, false)) === 30);
}

titre("2. LE CONTRE RENVOIE TOUJOURS QUELQUE CHOSE");
{
  const contre = { nom: "Contre", duree: 2, valeurContre: 20 };
  const e0 = etatDe({ H1: combattant("H1", "Allié", 0, { etats: [contre] }), M1: combattant("M1", "Ennemi", 1) });
  const r = resoudre(e0, "M1", "GRIFFE", [coup(["H1"], { valeurBrute: 9 })]);
  const renvoi = (r.etapes || []).find(x => x.type === "degats" && x.renvoi);
  verifier("un coup de 9 contre un Contre à 20 % : l'ennemi encaisse au moins 1", !!renvoi && renvoi.cible === "M1" && renvoi.montant >= 1 && r.etat.combattants.M1.pv < 100,
           renvoi ? `-${renvoi.montant} → ${r.etat.combattants.M1.pv} PV` : "aucun renvoi");
  const r2 = resoudre(e0, "M1", "GRIFFE", [coup(["H1"], { valeurBrute: 40 })]);
  const renvoi2 = (r2.etapes || []).find(x => x.type === "degats" && x.renvoi);
  verifier("un coup de 40 : 10 % (4) repartent", !!renvoi2 && renvoi2.montant === 4, renvoi2 ? `${renvoi2.montant}` : "aucun");
}

titre("3. L'ÉTALEMENT : UNE MÊME COMPÉTENCE NE SE CUMULE PAS, SON TEMPS REPART ; JAMAIS DE CRITIQUE");
{
  const dot = (valeur = 30) => coup(["M1"], { nom: "Attaque Magique", typeRes: "Magique", valeurBrute: valeur, isRanged: true, rangeMax: 5, estEtalement: true, toursEtalement: 3 });
  const e0 = etatDe({ H1: combattant("H1", "Allié", 0), M1: combattant("M1", "Ennemi", 4) });
  const tics = (e) => ((e.combattants.M1.etats || []).find(x => x.nom === "Étalement") || {}).tics || [];
  const r1 = resoudre(e0, "H1", "BRASIER", [dot()]);
  verifier("lancé : 30 en 3 parts", JSON.stringify(tics(r1.etat)) === "[10,10,10]", JSON.stringify(tics(r1.etat)));
  const apresTic = JSON.parse(JSON.stringify(r1.etat)); essai(() => CC.ticsDeFinDeManche(apresTic)); essai(() => CC.vieillirLesEtats(apresTic));
  verifier("une fin de manche : une part tombe", JSON.stringify(tics(apresTic)) === "[10,10]", JSON.stringify(tics(apresTic)));
  const r2 = resoudre(apresTic, "H1", "BRASIER", [dot()]);
  const et2 = (r2.etat.combattants.M1.etats || []).find(x => x.nom === "Étalement") || {};
  verifier("RELANCÉE : pas de cumul (10/10/10, pas 20/20/10) — son temps repart à 3 manches",
           JSON.stringify(et2.tics) === "[10,10,10]" && et2.duree === 3, `${JSON.stringify(et2.tics)} · ${et2.duree} manches`);
  const r3 = resoudre(r2.etat, "H1", "AUTRE_SORT", [dot(15)]);
  verifier("une AUTRE compétence, elle, s'ajoute", JSON.stringify(tics(r3.etat)) === "[15,15,15]", JSON.stringify(tics(r3.etat)));
  const r4 = resoudre(e0, "H1", "DOUBLE", [dot(), dot()]);
  verifier("deux coups étalés de la même carte, au même lancer : un seul sort, ils s'additionnent", JSON.stringify(tics(r4.etat)) === "[20,20,20]", JSON.stringify(tics(r4.etat)));
  const r5 = resoudre(r3.etat, "H1", "BRASIER", [dot()]);
  verifier("relancer la première ne touche pas la part de l'autre", JSON.stringify(tics(r5.etat)) === "[15,15,15]", JSON.stringify(tics(r5.etat)));
  // Le soin étalé.
  const soin = () => ({ nom: "Soin", typeRes: "Magique", valeurBrute: 30, isHeal: true, isRanged: true, rangeMax: 5, estEtalement: true, toursEtalement: 3, cibles: ["H2"] });
  const s0 = etatDe({ H1: combattant("H1", "Allié", 0), H2: combattant("H2", "Allié", 1, { pv: 20 }) });
  const ticsSoin = (e) => ((e.combattants.H2.etats || []).find(x => x.nom === "Soin étalé") || {}).tics || [];
  const s1 = resoudre(s0, "H1", "BAUME", [soin()]);
  const s2 = resoudre(s1.etat, "H1", "BAUME", [soin()]);
  verifier("un soin étalé relancé : pas de cumul non plus", JSON.stringify(ticsSoin(s1.etat)) === "[10,10,10]" && JSON.stringify(ticsSoin(s2.etat)) === "[10,10,10]",
           `${JSON.stringify(ticsSoin(s1.etat))} → ${JSON.stringify(ticsSoin(s2.etat))}`);
  // Pas de critique.
  const critique = etatDe({ H1: combattant("H1", "Allié", 0, { def: { esquive: 0, parade: 0, physique: 0, magique: 0, critique: 100 } }), M1: combattant("M1", "Ennemi", 4) });
  let doubles = 0, total = 0;
  for (let g = 1; g <= 20; g++) {
    const r = resoudre({ ...critique, graine: g }, "H1", "BRASIER", [dot()]);
    const somme = tics(r.etat).reduce((a, b) => a + b, 0);
    total++; if (somme !== 30) doubles++;
  }
  verifier("UN HÉROS À 100 % DE CRITIQUE : son sort étalé n'est jamais doublé (20 lancers)", total === 20 && doubles === 0, `${doubles} doublé(s)`);
  verifier("…une carte tout étalée ne critique pas (carteToutEtalee)", essai(() => MP.carteToutEtalee({ attaques: [dot()] }), false) === true);
}

titre("4. LE LEADER : PLUS DE CHANCE D'ÉTAT EN PLUS (LA COLONNE DES 15 PTS EST RETIRÉE)");
{
  verifier("ses réglages : dégâts, défenses, PV — plus de chance d'état", !("chanceEtat" in (CE.LEADER_DEFAUT || { chanceEtat: 1 })), JSON.stringify(CE.LEADER_DEFAUT));
  const ch = (lanceur) => essai(() => MP.chanceEtatDe(lanceur, { nom: "Brûlé", chance: 30 }, { atouts: {} }), null);
  verifier("un leader pose un état avec la même chance qu'un autre (30 %)", ch({ estMonstre: true, leader: true }) === 30 && ch({ estMonstre: true }) === 30,
           `${ch({ estMonstre: true, leader: true })} / ${ch({ estMonstre: true })}`);
}

titre("5. LE VRAI CERVEAU : LES RENFORTS ENTRENT À LA FIN DE LA MANCHE, APRÈS LA RÉGÉNÉRATION");
{
  // Un Firestore en mémoire, le même que chute_et_renfort.mjs.
  const firestore = () => {
    const base = new Map(); const ecoutes = []; const attente = [];
    const cle = (c) => c.join("/");
    const copie = (v) => (v === null || v === undefined ? v : JSON.parse(JSON.stringify(v)));
    const documentsDe = (chemin, r) => {
      const p = cle(chemin) + "/";
      let l = [...base.entries()].filter(([k]) => k.startsWith(p) && k.slice(p.length).indexOf("/") === -1).map(([k, d]) => ({ ...d, __chemin: k.split("/") }));
      if (r && r.champ !== undefined && r.sup !== undefined) l = l.filter(d => Number(d[r.champ]) > Number(r.sup));
      if (r && r.tri) l.sort((a, b) => (a[r.tri] > b[r.tri] ? 1 : a[r.tri] < b[r.tri] ? -1 : 0));
      return copie(l);
    };
    const empiler = () => ecoutes.forEach(e => attente.push({ e, charge: copie(e.estCollection ? documentsDe(e.chemin, e.requete) : (base.get(cle(e.chemin)) || null)) }));
    const io = {
      async lire(chemin) { return copie(base.get(cle(chemin)) || null); },
      async lister(chemin, requete) { return documentsDe(chemin, requete); },
      async lot(ops) { (ops || []).forEach(o => { const k = cle(o.chemin); if (o.op === "delete") base.delete(k); else if (o.op === "update") base.set(k, { ...(base.get(k) || {}), ...copie(o.data) }); else base.set(k, copie(o.data)); }); empiler(); },
      async transaction(chemin, decider) { const k = cle(chemin); const a = decider(copie(base.get(k) || null)); if (!a) return false; base.set(k, copie(a)); empiler(); return true; },
      ecouterDoc(chemin, rappel) { const e = { chemin, rappel, estCollection: false }; ecoutes.push(e); attente.push({ e, charge: copie(base.get(cle(chemin)) || null) }); return () => { const i = ecoutes.indexOf(e); if (i >= 0) ecoutes.splice(i, 1); }; },
      ecouterCollection(chemin, requete, rappel) { const e = { chemin, requete, rappel, estCollection: true }; ecoutes.push(e); attente.push({ e, charge: documentsDe(chemin, requete) }); return () => { const i = ecoutes.indexOf(e); if (i >= 0) ecoutes.splice(i, 1); }; }
    };
    const livrer = async (tours = 8) => { for (let t = 0; t < tours; t++) { const lot = attente.splice(0, attente.length); for (const { e, charge } of lot) await e.rappel(charge); await new Promise(r => setTimeout(r, 0)); if (attente.length === 0) break; } };
    return { io, livrer };
  };
  const fiche = (id, extra = {}) => ({ idPersonnage: id, PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, Fatigue_Actuelle: 100,
    Esquive: 0, Parade: 0, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", camp: "Allié", ...extra });
  const PARTIE = "GAME_V267";
  const partieDoc = { ID_Rencontre: "renc_v267", Phase_Combat: "Preparation", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"],
                      File_Attente_Combat: [], Ont_Joue_Ce_Round: [], Combattants_Hors_Jeu: [] };
  const f = firestore();
  const traces = [], appels = { morts: [], releves: [], deReleve: 0, prevus: [] };
  const elements = { "fenetre-combat": { style: { display: "block" } } };
  global.document = { getElementById: (id) => elements[id] || (elements[id] = { style: {}, innerHTML: "", innerText: "" }), addEventListener: () => {} };
  global.localStorage = { getItem: (c) => (c === "ID_JOUEUR_COURANT" ? "P_01" : null), setItem: () => {} };
  const HEROS = fiche("H1", { idJoueur: "P_01", prenom: "Cybile", Regeneration: 20, PV_Max: 200, PV_Actuels: 200 });
  const CREATURE = fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Chef gobelin", Personnalite: "brutal",
                                 PV_Max: 80, PV_Actuels: 80 });
  global.window = {
    REGIME_CERVEAU: true, ID_PARTIE_COURANTE: PARTIE, ioCombatFirestore: f.io,
    PARTIE_DATA: JSON.parse(JSON.stringify(partieDoc)),
    PERSOS_PARTIE: [JSON.parse(JSON.stringify(CREATURE)), JSON.parse(JSON.stringify(HEROS))],
    MONSTRES_PARTIE: [JSON.parse(JSON.stringify(CREATURE))],
    TOKENS_VTT_DATA: { H1: { q: 0, r: 0 }, M1: { q: 1, r: 0 } }, ZONES_PERSISTANTES: {},
    pvMaxCombattant: (p) => parseInt(p.PV_Max) || 0, fatigueMaxCombattant: (p) => parseInt(p.Fatigue_Max) || 100,
    esquiveCombattant: () => 0, paradeCombattant: () => 0, defPhysiqueCombattant: () => 0, defMagiqueCombattant: () => 0,
    critiqueCombattant: () => 0, atoutRace: () => ({}), bonusEquip: () => 0,
    estMonHerosCombat: (id) => id === "H1",
    tracerCombat: (i, q, d) => traces.push(`${i} ${q} ${d || ""}`),
    modifierPartie: async (modifier) => {
      const sortie = modifier(JSON.parse(JSON.stringify(partieDoc)));
      if (!sortie) return null;
      if (sortie.maj) Object.assign(partieDoc, JSON.parse(JSON.stringify(sortie.maj)));
      return sortie.resultat !== undefined ? sortie.resultat : true;
    },
    demarrerCiblage: async () => ({ attaques: [{ valeurBrute: 4 }], alterations: [], isZone: false, zoneHexesBase: [] }),
    analyserCarteMonstre: () => ({ portee: 1, fatigue: 10 }),
    afficherPisteInitiative: () => {}, actualiserBoutonFinTour: () => {}, actualiserEtatCarteCombat: () => {},
    rafraichirAffichageCombat: () => {}, redessinerPions: () => {}, rafraichirVoileTour: () => {},
    marquerMonstreMort: async (id) => {
      appels.morts.push(id);
      const fp = window.PERSOS_PARTIE.find(x => x.idPersonnage === id); if (fp) fp.statut = "Mort";
      const fm = window.MONSTRES_PARTIE.find(x => x.idPersonnage === id); if (fm) fm.statut = "Mort";
    },
    enregistrerReleveLeader: async (id, c) => { appels.releves.push({ id, pvMax: c && c.pvMax, leader: c && c.leader }); },
    entrerRenfortsDeReleve: async () => { appels.deReleve++; return []; },
    entrerRenfortsPrevus: async (manche, options) => {
      appels.prevus.push({ manche, vide: !!(options && options.terrainVide), phase: (window.regimeDuJeu().etatPublie() || {}).phase });
      if (manche !== 2) return [];
      // Le renfort de la manche 2 : sa fiche, son pion, sa place dans l'ordre (ce que fait monstres.js).
      const renfort = fiche("M2", { estMonstre: true, camp: "Ennemi", nom: "Loup", Personnalite: "brutal", PV_Max: 40, PV_Actuels: 40 });
      window.PERSOS_PARTIE.push(JSON.parse(JSON.stringify(renfort)));
      window.MONSTRES_PARTIE.push(JSON.parse(JSON.stringify(renfort)));
      window.TOKENS_VTT_DATA.M2 = { q: 3, r: 0 };
      partieDoc.Ordre_Initiative = [...partieDoc.Ordre_Initiative, "M2"];
      window.PARTIE_DATA = JSON.parse(JSON.stringify(partieDoc));
      return ["M2"];
    }
  };
  // Les fonctions de combat.js que la chute traverse pour de vrai.
  const lignes = lire('combat.js').split('\n');
  ["estCombattantMort", "combattantsAttendus", "toutLeMondeAJoue", "synchroniserCombattantsHorsJeu"].forEach(nom => {
    const d = lignes.findIndex(l => l.startsWith(`window.${nom} = `)); if (d < 0) return;
    let fin = d; for (let i = d + 1; i < lignes.length; i++) { if (lignes[i] === '};') { fin = i; break; } }
    new Function('window', 'db', 'doc', lignes.slice(d, fin + 1).join('\n'))(window, {}, (_db, col, id) => ({ col, id }));
  });
  await import(path.join(RACINE, 'regime_cerveau.js'));
  const attendre = async (limiteMs = 12000) => {
    const debut = Date.now();
    while (Date.now() - debut < limiteMs) {
      await f.livrer(4);
      const r = window.regimeDuJeu && window.regimeDuJeu();
      if (r) { r.ok(); const pub = r.etatPublie(); if (pub && r.vue() >= pub.version) { await f.livrer(4); await new Promise(x => setTimeout(x, 30)); if (r.vue() >= r.etatPublie().version) return; } }
      await new Promise(x => setTimeout(x, 40));
    }
  };
  const notifier = async () => { window.PARTIE_DATA = JSON.parse(JSON.stringify(partieDoc)); window.regimeSuivreLaPartie(window.PARTIE_DATA); await attendre(); };

  await notifier();
  partieDoc.File_Attente_Combat = [{ idPersonnage: "H1", idCarte: "C_H1", initiative: 50 }, { idPersonnage: "M1", idCarte: "C_M1", initiative: 10 }];
  partieDoc.Phase_Combat = "Resolution";
  await notifier();
  await window.regimeDemande.carte("H1", { idCarte: "C_H1", coutFatigue: 10, alterations: [], persistanceTerrain: false, zoneHexes: [],
                                           attaques: [{ valeurBrute: 5, cibles: ["M1"] }] });
  // La manche 1 se ferme (la créature joue, puis la régénération) ; on laisse au renfort le temps d'entrer.
  for (let i = 0; i < 6; i++) { await attendre(); await f.livrer(8); await new Promise(r => setTimeout(r, 150)); }
  const etat = window.regimeDuJeu().etatPublie() || { combattants: {} };
  verifier("la manche 2 a commencé : on choisit ses cartes (préparation)", etat.manche === 2 && etat.phase !== "Resolution", `manche ${etat.manche}, ${etat.phase}`);
  verifier("LE RENFORT EST DÉJÀ DANS LE COMBAT : avant les cartes de la manche 2", !!etat.combattants.M2 && (etat.ordre || []).includes("M2"),
           Object.keys(etat.combattants).join(","));
  verifier("…appelé quand la manche a changé (la régénération déjà écrite)", appels.prevus.some(a => a.manche === 2), JSON.stringify(appels.prevus));
  // Le journal : la fin de manche (régénération, « manche 2 »), PUIS l'arrivée.
  const journal = await f.io.lister(["Systeme_Parties", PARTIE, "Combat_Journal"]);
  verifier("la trace dit son entrée", traces.some(t => /Loup|M2/.test(t) && /entre dans le combat/.test(t)), traces.filter(t => /entre/.test(t)).join(" | "));
  const ordre = [];
  (journal || []).sort((a, b) => Number(a.v || 0) - Number(b.v || 0))
    .forEach(en => (en.etapes || []).forEach(e => ordre.push(e.type === "manche" ? "manche" + e.numero : e.type === "arrivee" ? "arrivee:" + ((e.combattant || {}).id) : e.regeneration ? "regen" : null)));
  const seq = ordre.filter(Boolean);
  const iManche = seq.indexOf("manche2"), iArrivee = seq.indexOf("arrivee:M2"), iRegen = seq.lastIndexOf("regen", iManche);
  verifier("DANS LE JOURNAL : la régénération, la manche 2, PUIS l'arrivée du renfort", (iManche >= 0 && iArrivee > iManche && (iRegen < 0 || iRegen < iManche)),
           seq.length ? seq.slice(-6).join(" → ") : "journal non lu (rien à comparer)");
  window.regimeDuJeu() && window.regimeDuJeu().debrancher && window.regimeDuJeu().debrancher();
  delete global.window; delete global.document; delete global.localStorage;
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
});

titre("6. LES EFFETS : ÉLECTRIFIÉ 15 % (MAX 75), PURIFICATION 35 ET 2 ÉTATS, L'ARCANE, LA SURPUISSANCE");
{
  const r = await p.evaluate(async () => {
    const res = {};
    const grimoire = {
      EFF_ATTAQUE_MAGIQUE: { Nom: "Attaque Magique", Valeur: 3, Cout_PT: "2", Modificateur: "INTELLIGENCE", Type_Mecanique: "Action/Global", Type_Mecanique_2: "Aucun" },
      EFF_ELECTRIFIE: { Nom: "Électrifié", Valeur: 35, Pourcent_Base: 10, Pourcent_Max: 60, Tours: 2, Cout_PT: "1", Modificateur: "INTELLIGENCE",
                        Type_Mecanique: "Magique", Effet_Base: "10% chance de baisser Initiative de 35 (max 60)" },
      EFF_BRULE: { Nom: "Brûlé", Valeur: 0, Pourcent_Base: 10, Pourcent_Max: 60, Tours: 2, Cout_PT: "1", Type_Mecanique: "Magique" },
      EFF_PURIFICATION: { Nom: "Purification", Valeur: 1, Pourcent_Base: 0, Pourcent_Max: 1, Cout_PT: "6", Modificateur: "SAGESSE",
                          Type_Mecanique: "Action/Global", Type_Mecanique_2: "Aucun", Cible_Etat: "purification", Tours: 0, Effet_Base: "Enlève un état aléatoire sur la cible." },
      EFF_SOIN: { Nom: "Soin", Valeur: 8, Cout_PT: "2", Type_Mecanique: "Action/Global" }
    };
    window.EFFETS_BDD_CACHE = window.__ou(() => window.completerEffetsDeSecours(JSON.parse(JSON.stringify(grimoire))), grimoire);
    const c = window.EFFETS_BDD_CACHE;
    res.cache = { elec: [c.EFF_ELECTRIFIE.Pourcent_Base, c.EFF_ELECTRIFIE.Pourcent_Max, c.EFF_ELECTRIFIE.Valeur], purif: [c.EFF_PURIFICATION.Cout_PT, c.EFF_PURIFICATION.Valeur],
                  texteElec: c.EFF_ELECTRIFIE.Effet_Base };
    window.initialiserPlateau();
    const h = { idPersonnage: "J1", camp: "Allié", statut: "Vivant", Etats_Alteres: [], PV_Max: 50, PV_Actuels: 50 };
    const m = { idPersonnage: "M1", camp: "Ennemi", estMonstre: true, statut: "Vivant", Etats_Alteres: [], PV_Max: 50, PV_Actuels: 50 };
    window.PERSOS_PARTIE = [h, m];
    window.TOKENS_VTT_DATA = { J1: { q: 0, r: 0 }, M1: { q: 0, r: 4 } };
    window.COMBAT_PERSOS_JOUEUR = [h]; window.COMBAT_INDEX_PERSO = 0;
    const extraire = async (actions, opts = {}) => {
      window.COMPETENCES_CACHE = { C: { Nom: "Banc", Arme: "Magie", Fatigue: opts.fatigue || 20, ...(opts.surp ? { Fatigue_Surpuissance: opts.surp } : {}), Composants: { actions } } };
      window.CACHE_COMPETENCES_GLOBAL = { M1: { C: window.COMPETENCES_CACHE.C } };
      const lanceur = opts.lanceur || "J1";
      if (lanceur === "M1") window.COMPETENCES_CACHE = {};
      return window.__ouAsync(() => window.demarrerCiblage("C", { extraire: true, idLanceur: lanceur }), null);
    };
    const alt = (x, nom) => ((x && x.alterations) || []).find(a => a.nom === nom) || null;
    const e2 = await extraire([{ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 1, element: "Foudre", mods: { EFF_ELECTRIFIE: 2 } }]);
    const e6 = await extraire([{ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 1, element: "Foudre", mods: { EFF_ELECTRIFIE: 6 } }]);
    res.elec = { deux: (alt(e2, "Électrifié") || {}).chance, six: (alt(e6, "Électrifié") || {}).chance, desc: (alt(e2, "Électrifié") || {}).desc };
    const pu = await extraire([{ baseEffetId: "EFF_PURIFICATION", count: 1, mods: {} }]);
    res.purif = ((pu && pu.attaques) || [])[0] ? pu.attaques[0].purifNombre : null;
    const arc = await extraire([{ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 1, element: "Arcane", mods: {} }]);
    const feu = await extraire([{ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 1, element: "Feu", mods: {} }]);
    const a0 = ((arc && arc.attaques) || [])[0] || {};
    res.arcane = { element: a0.element, etatElement: a0.etatElement || null, alterations: ((arc && arc.alterations) || []).map(x => x.nom),
                   feuBrule: (alt(feu, "Brûlé") || {}).chance,
                   dansLaListe: !!window.__ou(() => window.elementMagique("Arcane"), null) };
    // La surpuissance.
    const val = (x) => (((x && x.attaques) || [])[0] || {}).valeurBrute;
    const surp = (x) => (((x && x.attaques) || [])[0] || {}).surpuissance || 1;
    const heros75 = await extraire([{ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 10, element: "Feu", mods: {} }], { fatigue: 75 });
    const herosDot = await extraire([{ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 10, element: "Feu", mods: {} }], { fatigue: 62, surp: 80 });
    const monstre = await extraire([{ baseEffetId: "EFF_ATTAQUE_MAGIQUE", count: 10, element: "Feu", mods: {} }], { fatigue: 120, lanceur: "M1" });
    res.surp = { heros75: surp(heros75), herosDot: surp(herosDot), monstre: surp(monstre), vMonstre: val(monstre),
                 puissance: window.__ou(() => window.fatigueDeSurpuissance({ Fatigue: 62, Fatigue_Surpuissance: 80 }), null) };
    return res;
  });
  verifier("le grimoire de la base (10 % / 60 %, -35 initiative) cède aux règles du jeu : 15 % / 75 %",
           r.cache.elec[0] === 15 && r.cache.elec[1] === 75 && !/Initiative/i.test(r.cache.texteElec || ""), JSON.stringify(r.cache));
  verifier("ÉLECTRIFIÉ : deux crans = 30 % (+5 offerts par la Foudre) ; six crans plafonnent à 75 %", r.elec.deux === 35 && r.elec.six === 75, JSON.stringify(r.elec));
  verifier("…et l'état ne parle plus d'initiative", !!r.elec.desc && !/initiative/i.test(r.elec.desc), r.elec.desc);
  verifier("PURIFICATION : 35 de fatigue (7 pts) et deux états retirés", r.cache.purif[0] === "7" && r.cache.purif[1] === 2 && r.purif === 2, `${JSON.stringify(r.cache.purif)} → ${r.purif}`);
  verifier("L'ARCANE se choisit comme un élément", r.arcane.dansLaListe && r.arcane.element === "Arcane", JSON.stringify(r.arcane));
  verifier("…sans état offert ni état lié (rien à quoi résister) — le Feu, lui, offre 5 % de Brûlé",
           r.arcane.etatElement === null && r.arcane.alterations.length === 0 && r.arcane.feuBrule === 5, JSON.stringify(r.arcane));
  verifier("SURPUISSANCE : un héros à 75 de fatigue frappe plus fort", r.surp.heros75 > 1, JSON.stringify(r.surp));
  verifier("UN DOT À 62 APRÈS L'ÉTALEMENT (80 avant) : pas de surpuissance — le seuil se juge après", r.surp.herosDot === 1 && r.surp.puissance === 62, JSON.stringify(r.surp));
  verifier("UNE CRÉATURE à 120 de fatigue : jamais de surpuissance (30 tout rond)", r.surp.monstre === 1 && r.surp.vMonstre === 30, JSON.stringify(r.surp));
}

titre("7. TRACTION MAGIQUE : ENGAGÉ AU CONTACT, ON TIRE QUAND MÊME UN ENNEMI À DISTANCE");
{
  const r = await p.evaluate(() => {
    const f = window.contactInterditLaCible;
    if (typeof f !== "function") return null;
    const contact = { isRanged: false, rangeMax: 1 };
    return { traction3: f(contact, { porteeMinTraction: 3 }, true, 3), traction4: f(contact, { porteeMinTraction: 3 }, true, 4),
             sansTraction: f(contact, {}, true, 2), tir: f({ isRanged: true }, {}, true, 4), libre: f(contact, {}, false, 3) };
  });
  verifier("engagé, une Traction en tête vise à sa portée (3 cases)", !!r && r.traction3 === false, JSON.stringify(r));
  verifier("…pas au-delà ; et une technique de contact sans Traction reste au contact", !!r && r.traction4 === true && r.sansTraction === true);
  verifier("…un tir vise toujours loin ; non engagé, rien ne bloque", !!r && r.tir === false && r.libre === false);
}

titre("8. ENGAGÉ SANS SYMBOLE ; LES SYMBOLES D'ÉTAT EN LOSANGE");
{
  const r = await p.evaluate(() => {
    const points = window.__ou(() => window.construireIndicateursEtatsToken([{ nom: "Engagé", duree: 2 }, { nom: "Brûlé", duree: 2 }], 55), []) || [];
    const med = window.__ou(() => window.medaillonEtat({ nom: "Charmé" }, 30), "") || "";
    const div = document.createElement("div"); div.innerHTML = med; document.body.appendChild(div);
    const cadre = div.querySelector(".medaillon-etat-cadre");
    const clip = cadre ? (getComputedStyle(cadre).clipPath || cadre.style.clipPath || "") : "";
    const rond = div.querySelector(".medaillon-etat") ? getComputedStyle(div.querySelector(".medaillon-etat")).borderRadius : "?";
    div.remove();
    // La piste d'initiative.
    window.PERSOS_PARTIE = [{ idPersonnage: "M1", prenom: "Goule", camp: "Ennemi", estMonstre: true, Palier: "Normal", PV_Max: 40, PV_Actuels: 40,
                              Etats_Alteres: [{ nom: "Engagé", duree: 2 }], statut: "Vivant" }];
    const affiches = window.__ou(() => window.etatsAffiches([{ nom: "Engagé" }, { nom: "Glacé" }]).map(e => e.nom), ["?"]);
    return { points: points.map(p => p.dataset.etat), rotation: points[0] ? points[0].style.transform : "", clip, rond, affiches };
  });
  verifier("sur le pion : la goutte de Brûlé, aucune pour Engagé", JSON.stringify(r.points) === '["Brûlé"]', JSON.stringify(r.points));
  verifier("…et partout (etatsAffiches)", JSON.stringify(r.affiches) === '["Glacé"]', JSON.stringify(r.affiches));
  verifier("le médaillon d'un état sans image : un LOSANGE (cadre doré), plus un rond", /polygon\(50% 0(px)?,? 100% 50%/.test(r.clip) && (r.rond === "0px" || r.rond === ""),
           `${r.clip} · ${r.rond}`);
  verifier("la goutte sur le pion : un petit losange (carré tourné)", /rotate\(45deg\)/.test(r.rotation), r.rotation);
}

titre("9. LA CONSIGNE « TOUCHEZ L'ÉCRAN POUR VOIR CE TOUR » EN HAUT, AU-DESSUS DU OK");
{
  const r = await p.evaluate(async () => {
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
    document.getElementById('ecran-jeu').style.display = 'block';
    document.getElementById('fenetre-combat').style.display = 'block';
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Aldric", camp: "Allié", PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 100, fatigueActuelle: 80, Etats_Alteres: [], statut: "Vivant" },
      { idPersonnage: "M1", prenom: "Goule", camp: "Ennemi", estMonstre: true, Palier: "Normal", PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 100, fatigueActuelle: 80,
        Etats_Alteres: [{ nom: "Brûlé", duree: 2 }], resistancesEtats: ["Glacé", "Peur"], statut: "Vivant" }];
    window.CACHE_COMPETENCES_GLOBAL = { M1: { C1: { Nom: "Griffe", Arme: "Arme légère CAC", Fatigue: 10, Initiative: 50, Composants: { actions: [] },
      Effets_Compiles: [{ nom: "Attaque légère", desc: "5 dégats physique", isMod: false }] } } };
    window.PARTIE_DATA = { Phase_Combat: "Resolution", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"], File_Attente_Combat: [{ idPersonnage: "M1", idCarte: "C1", initiative: 50 }] };
    window.EVENEMENT_ATTENDU = { acteur: "M1", idCarte: "C1", manche: 1, v: 1 };
    window.SEQUENCE_TOUR = { ...(window.SEQUENCE_TOUR || {}), voile: true, monTour: false };
    window.etatSequenceTour = () => ({ message: "Touchez l'écran pour voir ce tour", okVisible: true, forcerVisible: false });
    window.__lances = 0; window.jouerSequenceTour = () => { window.__lances++; };
    window.__ou(() => window.rafraichirVoileTour(), null);
    await new Promise(r2 => setTimeout(r2, 700));
    window.__ou(() => window.appliquerReglagesEncart(), null);
    window.__ou(() => window.rafraichirVoileTour(), null);
    await new Promise(r2 => setTimeout(r2, 200));
    const consigne = document.getElementById("voile-tour-consigne");
    const ok = document.getElementById("voile-tour-ok");
    const attente = document.getElementById("voile-tour-attente");
    const bc = consigne ? consigne.getBoundingClientRect() : null, bo = ok.getBoundingClientRect();
    const piste = document.getElementById("piste-initiative");
    return { consigne: consigne ? consigne.textContent : null, visible: !!bc && bc.height > 0 && getComputedStyle(consigne).display !== "none",
             auDessus: !!bc && bc.bottom <= bo.top + 1, enHaut: !!bc && bc.top < window.innerHeight * 0.4,
             okVisible: getComputedStyle(ok).display !== "none", attente: attente.textContent };
  });
  verifier("la consigne se lit en haut de l'écran", r.visible && r.consigne === "Touchez l'écran pour voir ce tour" && r.enHaut, JSON.stringify(r));
  verifier("…juste au-dessus du OK", r.okVisible && r.auDessus, JSON.stringify(r));
  verifier("…et le bas de la plaque ne la répète plus", r.attente === "", `« ${r.attente} »`);
}

titre("10. TOUCHER UNE RÉSISTANCE D'UN ENNEMI DIT SON NOM, SANS LANCER LE TOUR");
{
  const r = await p.evaluate(async () => {
    const pastilles = [...document.querySelectorAll("#voile-tour-etats .pastille-resistance")];
    const etat = document.querySelector("#voile-tour-etats .icone-etat-encart");
    if (!pastilles.length) return { pastilles: 0 };
    window.__lances = 0;
    pastilles[0].click();
    await new Promise(r2 => setTimeout(r2, 100));
    const bulle = document.querySelector("#voile-tour-encart .bulle-nom-encart");
    const texte1 = bulle ? bulle.textContent : null;
    if (etat) etat.click();
    await new Promise(r2 => setTimeout(r2, 100));
    const bulle2 = document.querySelector("#voile-tour-encart .bulle-nom-encart");
    const lancesApres = window.__lances;
    document.getElementById("voile-tour-combat").click();
    return { pastilles: pastilles.length, texte1, texte2: bulle2 ? bulle2.textContent : null, lancesApres, lancesAilleurs: window.__lances,
             cliquable: getComputedStyle(pastilles[0]).pointerEvents };
  });
  verifier("ses deux résistances sont là, touchables", r.pastilles === 2 && r.cliquable === "auto", JSON.stringify(r));
  verifier("TOUCHÉE : « Résiste : Glacé » dans une bulle", r.texte1 === "Résiste : Glacé", r.texte1);
  verifier("un état touché dit son nom et ses tours", /^Brûlé — 2 tours$/.test(r.texte2 || ""), r.texte2);
  verifier("LE TOUR NE SE LANCE PAS ; ailleurs sur l'écran, si", r.lancesApres === 0 && r.lancesAilleurs === 1, `${r.lancesApres} / ${r.lancesAilleurs}`);
  await p.evaluate(() => { window.EVENEMENT_ATTENDU = null; window.etatSequenceTour = () => ({ message: "", okVisible: false, masquee: true });
    window.PARTIE_DATA = { Phase_Combat: "Preparation", Tour_Combat: 1, File_Attente_Combat: [] }; window.__ou(() => window.rafraichirVoileTour(), null); });
}

titre("11. UN CLIC SUR UN PION : SES PV ET SA FATIGUE EN CHIFFRES SUR SES JAUGES");
{
  const r = await p.evaluate(async () => {
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Aldric", camp: "Allié", PV_Max: 50, PV_Actuels: 34, Fatigue_Max: 120, fatigueActuelle: 80, Etats_Alteres: [], statut: "Vivant" }];
    window.TOKENS_VTT_DATA = { H1: { q: 2, r: 2, taille: 55 } };
    window.VTT_SCALE = 1.4; window.appliquerTransformPlateau();
    window.TOKEN_SELECTIONNE = "H1";
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    await new Promise(r2 => setTimeout(r2, 100));
    const chiffres = [...document.querySelectorAll(".jauges-selection-token .jauge-selection-chiffre")].map(e => e.textContent);
    const c = document.querySelector(".jauges-selection-token .jauge-selection-chiffre");
    return { chiffres, taille: c ? parseFloat(getComputedStyle(c).fontSize) : 0 };
  });
  verifier("« 34/50 » sur la vie, « 80/120 » sur la fatigue", JSON.stringify(r.chiffres) === '["34/50","80/120"]', JSON.stringify(r.chiffres));
  verifier("…lisibles (à la taille du pion)", r.taille >= 6, `${r.taille}px`);
}

titre("12. LE MENU PRINCIPAL : LE NOM DU JOUEUR EST UN BOUTON, À DROITE, À GAUCHE DE LA CROIX");
{
  const r = await p.evaluate(async () => {
    const menu = document.getElementById("ecran-menu");
    document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => e.style.display = "none");
    menu.style.display = "block";
    const barre = document.getElementById("barre-compte");
    barre.style.display = "flex";
    document.getElementById("barre-compte-nom").textContent = "Nico";
    const bouton = document.getElementById("btn-nom-compte");
    const sous = document.getElementById("menu-compte");
    const avant = sous ? getComputedStyle(sous).display : "?";
    if (bouton) bouton.click();
    await new Promise(r2 => setTimeout(r2, 50));
    const apres = sous ? getComputedStyle(sous).display : "?";
    const boutons = sous ? [...sous.querySelectorAll("button")].map(b => b.textContent.replace(/\s*\d+$/, "").trim()) : [];
    const croix = document.getElementById("btn-quitter-accueil").getBoundingClientRect();
    const b = (bouton || barre).getBoundingClientRect();
    const fleche = bouton && bouton.querySelector(".fleche-menu-compte");
    const couleurFleche = fleche ? (fleche.querySelector("path") || {}).getAttribute("stroke") : null;
    const bs = sous ? sous.getBoundingClientRect() : { top: 0 };
    document.body.click();
    await new Promise(r2 => setTimeout(r2, 50));
    const refermé = sous ? getComputedStyle(sous).display : "?";
    menu.style.display = "none";
    return { avant, apres, boutons, aDroite: b.left > window.innerWidth / 2, aGaucheDeLaCroix: b.right <= croix.left + 2, memeHauteur: Math.abs((b.top + b.bottom) / 2 - (croix.top + croix.bottom) / 2) < 30,
             dessous: bs.top >= b.bottom - 1, couleurFleche, refermé };
  });
  verifier("le nom est un bouton qui ouvre son menu", r.avant === "none" && r.apres === "flex", `${r.avant} → ${r.apres}`);
  verifier("dessous : Mon compte, Autorisation de création, Déconnexion", JSON.stringify(r.boutons) === '["Mon compte","Autorisation de création","Déconnexion"]', JSON.stringify(r.boutons));
  verifier("une petite flèche beige à droite du nom", !!r.couleurFleche && /^#e8d5a5$/i.test(r.couleurFleche), r.couleurFleche);
  verifier("EN HAUT À DROITE, juste à gauche de la croix", r.aDroite && r.aGaucheDeLaCroix && r.memeHauteur, JSON.stringify(r));
  verifier("le menu tombe dessous, et se referme d'un toucher ailleurs", r.dessous && r.refermé === "none", JSON.stringify({ d: r.dessous, f: r.refermé }));
}

titre("13. LA CARTE DU MONDE : LE MENU DROIT REPLIÉ À L'ARRIVÉE");
{
  const r = await p.evaluate(() => {
    const menu = document.getElementById("menu-lateral");
    try { localStorage.setItem("ivalis_MENU_REPLIE", "0"); } catch (e) {}
    menu.classList.remove("menu-replie");
    window.__ou(() => window.rangerMenuALArrivee(), null);
    return { replie: menu.classList.contains("menu-replie"), bouton: !!document.getElementById("btn-rouvrir-menu") };
  });
  const chargement = lire('app.js');
  verifier("une partie chargée ou créée : le menu se range (même si on l'avait laissé ouvert)", r.replie && (chargement.match(/rangerMenuALArrivee\(\)/g) || []).length >= 2, JSON.stringify(r));
  verifier("…au chargement de la page aussi (replié par défaut)", /REPLIÉ PAR DÉFAUT[\s\S]{0,400}menu\.classList\.add\('menu-replie'\)/.test(chargement));
}

titre("14. LE LEADER : +40 % D'XP ; UN LEADER DANS 60 % DES COMBATS ; PLUS QUE TROIS RÉGLAGES");
{
  const r = await p.evaluate(async () => {
    const xp = (m) => window.__ou(() => window.xpDeLaCreature(m), null);
    const res = { normal: xp({ XP_Groupe: 100 }), chef: xp({ XP_Groupe: 100, leader: true }), petitChef: xp({ XP_Groupe: 40, leader: true }) };
    // 3000 tirages : la part des rencontres avec un leader (ou une relève).
    if (typeof window.gabaritMonstre !== "function") window.gabaritMonstre = () => ({});
    let avec = 0, releveSansLeader = 0, n = 3000;
    for (let i = 0; i < n; i++) {
      const t = window.__ou(() => window.tirerApparition("aleatoire"), null);
      if (!t) continue;
      const tous = [...t.depart, ...t.renforts];
      const chef = tous.some(m => m.leader || m.releveEnLeader);
      if (chef) avec++;
      if (!chef && t.renforts.some(m => m.surReleve)) releveSansLeader++;
    }
    res.part = avec / n; res.releveSansLeader = releveSansLeader;
    // Les réglages du leader dans Paramètres > Monstres.
    window.__ou(() => window.dessinerReglagesMonstres(), null);
    const corps = document.getElementById("corps-reglages-leader");
    res.reglages = corps ? corps.querySelectorAll("input").length : -1;
    res.texte = corps ? corps.textContent : "";
    return res;
  });
  verifier("un leader rapporte 40 % d'XP de plus : 100 → 140, 40 → 56", r.normal === 100 && r.chef === 140 && r.petitChef === 56, JSON.stringify(r));
  verifier("SUR 3000 RENCONTRES, ~60 % ONT UN LEADER", Math.abs(r.part - 0.6) <= 0.04, `${Math.round(r.part * 1000) / 10} %`);
  verifier("…sans leader, aucune créature n'attend de relève (ses renforts ne viendraient jamais)", r.releveSansLeader === 0, `${r.releveSansLeader}`);
  verifier("les réglages du leader : trois (la « chance d'état », 15 pts, est retirée)", r.reglages === 3 && !/Chance de poser/.test(r.texte), `${r.reglages} : ${r.texte.replace(/\s+/g, " ").slice(0, 120)}`);
}

titre("15. LE COMBAT FINI VIDE LA CARTE, COMME « RÉINITIALISER »");
{
  const r = await p.evaluate(async () => {
    const t = window.combatTerminePourDeBon;
    if (typeof t !== "function") return null;
    const fin = (issue) => ({ idRencontre: "R1", issue });
    const res = {
      enCours: t({ ID_Rencontre: "R1" }),
      defaite: t({ ID_Rencontre: "R1", Fin_Combat: fin("defaite") }),
      victoireButinOuvert: t({ ID_Rencontre: "R1", Fin_Combat: fin("victoire"), Butin: { idRencontre: "R1", etape: "partage" } }),
      victoireButinReparti: t({ ID_Rencontre: "R1", Fin_Combat: fin("victoire"), Butin: { idRencontre: "R1", etape: "termine", resolu: true } }),
      dejaNettoye: t({ ID_Rencontre: "R1", Fin_Combat: fin("defaite"), Nettoyage_Fin_Combat: "R1" })
    };
    // Le nettoyage : réclamé une fois, puis la réinitialisation sans question.
    const vraiReinit = window.reinitialiserCombat, vraiModif = window.modifierPartie, vraiConfirm = window.confirm;
    const appels = [];
    let partie = { ID_Rencontre: "R2", Fin_Combat: fin("defaite") }; partie.Fin_Combat.idRencontre = "R2";
    window.modifierPartie = async (f) => { const s = f(JSON.parse(JSON.stringify(partie))); if (!s) return null; Object.assign(partie, s.maj || {}); return s.resultat; };
    window.reinitialiserCombat = async (o) => { appels.push(o || null); };
    window.DELAIS_NETTOYAGE_FIN_MS = { defaite: 50, victoire: 50 };
    window.verifierNettoyageFinCombat(partie);
    window.verifierNettoyageFinCombat(partie);
    await new Promise(r2 => setTimeout(r2, 250));
    window.verifierNettoyageFinCombat(partie);
    await new Promise(r2 => setTimeout(r2, 150));
    res.appels = appels; res.marque = partie.Nettoyage_Fin_Combat;
    window.reinitialiserCombat = vraiReinit; window.modifierPartie = vraiModif;
    // La vraie réinitialisation, en fin de combat : sans question, le butin réparti reste.
    let questions = 0; window.confirm = () => { questions++; return true; };
    window.__majs = [];
    window.PERSOS_PARTIE = []; window.TOKENS_VTT_DATA = {};
    window.PARTIE_DATA = { ID_Rencontre: "R3", Butin: { idRencontre: "R3", etape: "termine", resolu: true } };
    await window.__ouAsync(() => window.reinitialiserCombat({ finDeCombat: true }), null);
    window.confirm = vraiConfirm;
    const majPartie = (window.__majs || []).find(m => /Systeme_Parties\/P1$/.test(m.chemin) && m.data && m.data.Tour_Combat === 1) || {};
    res.reinit = { questions, butinEfface: !!(majPartie.data && "Butin" in majPartie.data), tour: (majPartie.data || {}).Tour_Combat,
                   pions: majPartie.data ? true : false };
    return res;
  });
  verifier("un combat en cours n'est pas terminé ; une défaite l'est ; une victoire, quand le butin est réparti",
           !!r && r.enCours === null && r.defaite === "defaite" && r.victoireButinOuvert === null && r.victoireButinReparti === "victoire" && r.dejaNettoye === null, JSON.stringify(r));
  verifier("LE NETTOYAGE SE FAIT, UNE FOIS (réclamé dans la partie), SANS QUESTION", !!r && r.appels.length === 1 && r.appels[0] && r.appels[0].finDeCombat === true && r.marque === "R2",
           r ? JSON.stringify({ a: r.appels, m: r.marque }) : "");
  verifier("…c'est la réinitialisation : la partie repasse au tour 1 sans rien demander, le butin réparti reste lisible",
           !!r && r.reinit.questions === 0 && r.reinit.tour === 1 && !r.reinit.butinEfface, r ? JSON.stringify(r.reinit) : "");
}

titre("16. UN RENFORT POSÉ RESTE CACHÉ JUSQU'À SON ARRIVÉE (APRÈS LA FIN DE MANCHE)");
{
  const r = await p.evaluate(() => {
    const f = window.pionAttendSonEntree;
    if (typeof f !== "function") return null;
    const vrai = window.regimeDuJeu;
    let etat = { manche: 2, phase: "Preparation", combattants: { H1: {}, M1: {} } };
    window.regimeDuJeu = () => ({ etatAffiche: () => etat });
    const m9 = { idPersonnage: "M9", estMonstre: true };
    const res = { attend: f("M9", m9), connu: f("M1", { idPersonnage: "M1", estMonstre: true }), heros: f("H7", { idPersonnage: "H7" }) };
    etat = { manche: 1, phase: "Preparation", combattants: { H1: {} } };
    res.debutDeCombat = f("M8", { idPersonnage: "M8", estMonstre: true });
    etat = { manche: 2, phase: "Preparation", combattants: { H1: {} } };
    window.ARRIVEES_ANNONCEES = { M9: Date.now() };
    res.annonce = f("M9", m9);
    window.regimeDuJeu = vrai;
    return res;
  });
  verifier("une créature posée que le combat ne connaît pas encore : cachée", !!r && r.attend === true, JSON.stringify(r));
  verifier("…une créature connue, un héros, le début du combat : jamais", !!r && !r.connu && !r.heros && !r.debutDeCombat);
  verifier("…son arrivée annoncée : elle paraît", !!r && r.annonce === false);
  const src = lire('regime_cerveau.js');
  verifier("le cerveau l'accueille dès sa pose (accueillirLesRenfortsMaintenant), sans attendre les cartes", /accueillirLesRenfortsMaintenant\(poses\)/.test(src));
}

titre("17. LES CRÉATURES APPARAISSENT UNE À UNE, LA CAMÉRA SUR ELLES, PUIS SUR LE HÉROS");
{
  const r = await p.evaluate(async () => {
    if (typeof window.apparaitreAuCentre !== "function") return null;
    window.PAUSE_APPARITION_MS = 300;
    window.PERSOS_PARTIE = [{ idPersonnage: "H1", prenom: "Aldric", camp: "Allié", PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant", idJoueur: "J1" },
      ...["M1", "M2", "M3"].map(id => ({ idPersonnage: id, prenom: id, camp: "Ennemi", estMonstre: true, Palier: "Normal", PV_Max: 40, PV_Actuels: 40, Etats_Alteres: [], statut: "Vivant" }))];
    window.TOKENS_VTT_DATA = { H1: { q: 1, r: 1, taille: 48 }, M1: { q: 6, r: 0, taille: 48 }, M2: { q: 8, r: 2, taille: 48 }, M3: { q: 5, r: 4, taille: 48 } };
    window.herosDuPoste = () => window.PERSOS_PARTIE[0];
    window.TOKEN_SELECTIONNE = null;
    window.appliquerTokensVTT(window.TOKENS_VTT_DATA);
    const echelle = window.VTT_SCALE;
    const vrai = window.centrerMapSurToken;
    const centres = [];
    window.centrerMapSurToken = (id) => { centres.push({ id, t: Date.now(), echelle: window.VTT_SCALE }); };
    const debut = Date.now();
    const cache = [];
    const tours = ["M1", "M2", "M3"].map(id => window.apparaitreAuCentre(id, "renfort"));
    await new Promise(r2 => setTimeout(r2, 60));
    cache.push(...["M2", "M3"].map(id => (document.getElementById("token-" + id) || { classList: { contains: () => false } }).classList.contains("pion-en-entree")));
    await Promise.all(tours);
    await new Promise(r2 => setTimeout(r2, 50));
    window.centrerMapSurToken = vrai;
    const visibles = ["M1", "M2", "M3"].every(id => { const el = document.getElementById("token-" + id); return el && !el.classList.contains("pion-en-entree"); });
    return { ordre: centres.map(c => c.id), ecarts: centres.slice(1).map((c, i) => c.t - centres[i].t), memeZoom: centres.every(c => c.echelle === echelle),
             cache, visibles, duree: Date.now() - debut };
  });
  verifier("la caméra va sur chacune, dans l'ordre, puis revient sur le héros", !!r && JSON.stringify(r.ordre) === '["M1","M2","M3","H1"]', r ? JSON.stringify(r.ordre) : "");
  verifier("…une à une : la suivante attend que la précédente soit entrée (+ la pause)", !!r && r.ecarts.slice(0, 2).every(e => e >= 300), r ? JSON.stringify(r.ecarts) : "");
  verifier("…les suivantes restent cachées en attendant leur tour", !!r && r.cache.every(Boolean), r ? JSON.stringify(r.cache) : "");
  verifier("…sans toucher au zoom ; à la fin, toutes sont là", !!r && r.memeZoom && r.visibles, r ? JSON.stringify({ z: r.memeZoom, v: r.visibles }) : "");
  const src = lire('animations_jeu.js');
  verifier("la pause réglée : 2 secondes entre deux apparitions", /PAUSE_APPARITION_MS === undefined \? 2000/.test(src));
}

titre("18. L'ARCANE A SON GESTE ; L'ÉLECTRIFIÉ NE TOUCHE PLUS À L'INITIATIVE");
{
  const r = await p.evaluate(() => ({ geste: window.__ou(() => window.gesteAttaqueCombat({ element: "Arcane", projectile: "magie", touches: [] }), null) }));
  verifier("un sort d'Arcane joue « jeu-attaque-arcane »", r.geste === "jeu-attaque-arcane", r.geste);
  verifier("…qui existe au catalogue", /id: "jeu-attaque-arcane"/.test(lire('animations_catalogue.js')));
  const combat = lire('combat.js'), ia = lire('monstres_ia.js');
  verifier("plus de « -35 » d'initiative à la carte jouée (héros, créatures)", !/initiativeCarte - 35/.test(combat) && !/initiative - 35/.test(ia));
}

titre("19. LES VERSIONS");
{
  const html = lire('index.html');
  const vTrace = Number((lire('trace_combat.js').match(/VERSION_IVALIS = (\d+)/) || [])[1]);
  const vJson = essai(() => JSON.parse(lire('version.json')).version, 0);
  verifier("version 267 ou plus (trace_combat.js, version.json)", vTrace >= 267 && vJson === vTrace, `${vTrace} / ${vJson}`);
  const v = (f) => [...html.matchAll(new RegExp('["/ ]' + f.replace(".", "\\.") + "\\?v=(\\d+)", "g"))].map(x => Number(x[1]));
  const ok = (f, min) => v(f).length > 0 && v(f).every(x => x >= min) && new Set(v(f)).size === 1;
  const attendus = [["combat.js", 152], ["moteur_pur.js", 68], ["cerveau_combat.js", 60], ["combat_etat.js", 43], ["moteur_effets.js", 101], ["app.js", 122],
                    ["monstres.js", 40], ["regime_cerveau.js", 52], ["animations_jeu.js", 10], ["animations_catalogue.js", 22], ["style.css", 98], ["comptes.js", 2]];
  verifier("les modules touchés ont monté (" + attendus.length + ")", attendus.every(([f, m]) => ok(f, m)), attendus.map(([f]) => `${f} ${v(f).join("/")}`).join(" · "));
}

verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
