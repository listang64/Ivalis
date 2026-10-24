// v262 — LA REFONTE DES CRÉATURES : STATURES, LEADER, APPARITIONS
//
// Nico :
//  · « Les types de monstres : Petits, Normaux, Boss (change les couleurs des
//    ronds de monstre dans la piste d'initiative : Petit en blanc, Normal en or,
//    Boss en rouge). Mets à jour le tableau dans Paramètres > Monstres et
//    enlève les lignes Élite. »
//  · « Le statut Leader : un Petit ou un Normal peut être leader. Une aura
//    rouge scintillante autour du token ; sur la piste, un contour rouge autour
//    de sa couleur. +15 % de dégâts et de soins, +15 % de résistances physique
//    et magique, +15 PV, +15 % de chance de faire un état — dans un encart de
//    Paramètres > Monstres, pour pouvoir changer. »
//  · « Plus de difficulté de rencontre : demande Apparition 1, 2, 3, 4 ou
//    aléatoire » — chacune avec ses compositions, ses renforts au bout de 1, 2
//    ou 4 tours, son leader, ses règles d'archetype ; l'Apparition 1 peut
//    garder une créature qui, mise KO, se relève en leader (PV et énergie au
//    plein) en appelant des renforts.
//  · « Les monstres ne spawnent qu'au hasard sur les hexagones de spawn (ou à
//    côté, s'ils sont tous encombrés). »
//
// PREMIÈRE PARTIE, DANS LE NOYAU (Node) :
//   1. le leader au combat : dégâts, soins, chances d'état (réglables) ;
//   2. la relève en leader, pas à pas : jamais à terre entre le coup et la
//      relève, une seule fois, avant les zombies ; sa mise en scène, sa fiche ;
//   3. apparitionsDuTour : la manche qui commence, les leaders relevés, le
//      terrain vide ;
//   4. LE VRAI CERVEAU (regime_cerveau.js) : la relève n'est pas une mort, elle
//      appelle ses renforts ; chaque manche appelle les renforts prévus ; le
//      terrain vidé le dit.
// SECONDE PARTIE, SUR LA VRAIE PAGE (faux Firestore) :
//   5. les statures : Petit / Normal / Boss dans le bestiaire et le tableau,
//      les réglages sans Élite ;
//   6. l'encart du leader ;
//   7. la piste (blanc / or / rouge, liseré rouge du leader) et l'aura du pion ;
//   8. le tirage des quatre apparitions, règle par règle, sur 400 tirages ;
//   9. la génération : tout le départ entre (plus de limite), sur les cases
//      peintes, avec son leader ; la réserve garde l'heure des renforts ;
//  10. les renforts à leur heure, plus tôt si le terrain s'est vidé, ceux de
//      la relève ; une réserve d'avant entre toujours à la place d'un mort ;
//  11. la fenêtre 💀 et la fenêtre des apparitions ;
//  12. les versions.
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
const PC = await import(path.join(RACINE, 'pont_combat.js'));

// Un combattant au format du cerveau.
const combattantPur = (id, extra = {}) => ({
  id, nom: id, camp: "Ennemi", estMonstre: true, estIllusion: false, joueur: "", race: "", couleur: "",
  personnalite: "brutal", palier: "Normal", pv: 70, pvMax: 70, bouclier: 0, bouclierMax: 0,
  fatigue: 40, fatigueMax: 120, q: 3, r: 0, etats: [], aTerre: false,
  def: { esquive: 0, parade: 0, physique: 20, magique: 15, critique: 0 },
  atouts: {}, equip: {}, mod: {}, stats: {}, ...extra
});
const etatPur = (combattants, extra = {}) => ({
  format: 1, version: 3, manche: 1, phase: "Resolution", graine: 7, file: [], ordre: Object.keys(combattants),
  combattants, zones: {}, ...extra
});

titre("1. LE LEADER AU COMBAT : DÉGÂTS, SOINS, CHANCES D'ÉTAT");
{
  const normal = { estMonstre: true, palier: "Normal" };
  const chef = { ...normal, leader: true };
  const b = (c) => essai(() => MP.bonusMonstreDe(c), null);
  verifier("un Normal : +10 % (sa stature) ; leader : +25 % (10 + 15)", b(normal) === 10 && b(chef) === 25, `${b(normal)} / ${b(chef)}`);
  verifier("un Petit leader : +25 % aussi", b({ estMonstre: true, palier: "Petit", leader: true }) === 25, `${b({ estMonstre: true, palier: "Petit", leader: true })}`);
  verifier("un héros n'est jamais leader de rien", b({ estMonstre: false, leader: true }) === 0, `${b({ estMonstre: false, leader: true })}`);
  verifier("le soin d'un leader : 20 brut → 25 (×1,25)", essai(() => MP.appliquerBonusMonstre(20, b(chef)), null) === 25);
  const ch = (lanceur, chance, nom = "Brûlé") => essai(() => MP.chanceEtatDe(lanceur, { nom, chance }, { atouts: {} }), null);
  verifier("chance d'état : 30 % → 45 % pour un leader (+15 points)", ch(normal, 30) === 30 && ch(chef, 30) === 45, `${ch(normal, 30)} / ${ch(chef, 30)}`);
  verifier("une carte qui ne pose pas l'état (0 %) n'en gagne pas", ch(chef, 0) === 0, `${ch(chef, 0)}`);
  verifier("plafond 100 : 95 % → 100 %", ch(chef, 95) === 100, `${ch(chef, 95)}`);
  verifier("contre une cible qui y résiste : 30 + 15 − 25 = 20 %",
           essai(() => MP.chanceEtatDe(chef, { nom: "Brûlé", chance: 30 }, { atouts: { resistances: ["Brûlé"] } }), null) === 20);
  // Réglable : le tableau des monstres le règle ici.
  essai(() => CE.reglerLeader({ degats: 30, chanceEtat: 5 }));
  verifier("réglé à +30 % / +5 points : le noyau suit", b(chef) === 40 && ch(chef, 30) === 35, `${b(chef)} / ${ch(chef, 30)}`);
  essai(() => CE.reglerLeader(null));
  verifier("sans réglage : les chiffres d'origine (15 / 15 / 15 / 15)",
           JSON.stringify(essai(() => CE.leaderActuel(), null)) === '{"degats":15,"resistances":15,"pv":15,"chanceEtat":15}',
           JSON.stringify(essai(() => CE.leaderActuel(), null)));
  // La fiche dit leader : le cerveau aussi.
  const fiche = { idPersonnage: "M1", estMonstre: true, camp: "Ennemi", leader: true, PV_Max: 85, PV_Actuels: 85, Fatigue_Max: 120 };
  const c = essai(() => CE.combattantDepuisFiche(fiche, { q: 1, r: 1 }), {});
  verifier("une fiche leader fait un combattant leader", c.leader === true);
  const c2 = essai(() => CE.combattantDepuisFiche({ ...fiche, leader: false, releveEnLeader: true }, { q: 1, r: 1 }), {});
  verifier("une fiche « se relèvera en leader » le porte au combat", c2.releveEnLeader === true && !c2.leader);
  const h = essai(() => CE.combattantDepuisFiche({ ...fiche, estMonstre: false, camp: "Allié", releveEnLeader: true }, { q: 1, r: 1 }), {});
  verifier("un héros ne porte ni l'un ni l'autre", !h.leader && !h.releveEnLeader);
}

titre("2. LA RELÈVE EN LEADER (Apparition 1, cas 2)");
{
  const etat = etatPur({
    H1: combattantPur("H1", { camp: "Allié", estMonstre: false, q: 0, r: 0, palier: "",
                              atouts: { critiqueSurKO: 15 } }),
    M1: combattantPur("M1", { releveEnLeader: true, pv: 6, etats: [{ nom: "Brûlé", duree: 2 }], q: 1, r: 0 })
  });
  etat.combattants.M1.pv = 0;
  const etapes = essai(() => CE.tomber(etat, "M1", "H1"), []) || [];
  const m = etat.combattants.M1;
  const releve = etapes.find(e => e.type === "releveLeader");
  verifier("mise KO, elle se relève : une étape « releveLeader », aucune chute", !!releve && !etapes.some(e => e.type === "chute"),
           etapes.map(e => e.type).join(","));
  verifier("debout, leader, plus « à relever »", m.aTerre === false && m.leader === true && !m.releveEnLeader);
  verifier("tous ses PV, et 15 de plus au maximum : 85 / 85", m.pv === 85 && m.pvMax === 85, `${m.pv} / ${m.pvMax}`);
  verifier("toute son énergie : 120 / 120", m.fatigue === 120, `${m.fatigue}`);
  verifier("ses défenses : 20 → 35 physique, 15 → 30 magique", m.def.physique === 35 && m.def.magique === 30, `${m.def.physique} / ${m.def.magique}`);
  verifier("ses états et son bouclier effacés", m.etats.length === 0 && m.bouclier === 0);
  verifier("son tueur reçoit ce qu'un KO rapporte (l'Instinct du tueur)",
           etapes.some(e => e.type === "etats" && e.cible === "H1" && e.pose === "Instinct du tueur"), etapes.map(e => e.type).join(","));
  verifier("l'état reste cohérent", essai(() => CE.verifierEtatCombat(etat).length === 0, false), essai(() => CE.verifierEtatCombat(etat).join(" | "), "?"));

  // Le rejeu, étape par étape, comme le spectateur : jamais « à terre » entre le
  // coup et la relève (sinon le poste qui tient le cerveau la déclarerait morte).
  const avant = etatPur({ M1: combattantPur("M1", { releveEnLeader: true, pv: 6 }) });
  const apresCoup = essai(() => CE.appliquerEtape(avant, { type: "degats", cible: "M1", acteur: "H1", montant: 6, pvApres: 0 }), null);
  verifier("rejoué : après le coup, à zéro PV mais pas à terre", !!apresCoup && apresCoup.combattants.M1.pv === 0 && apresCoup.combattants.M1.aTerre === false,
           apresCoup ? `${apresCoup.combattants.M1.pv} pv, à terre : ${apresCoup.combattants.M1.aTerre}` : "");
  const apresReleve = essai(() => CE.appliquerEtape(apresCoup, releve), null);
  verifier("rejoué : la relève donne le même combattant", !!apresReleve && apresReleve.combattants.M1.pv === 85 && apresReleve.combattants.M1.leader === true
           && apresReleve.combattants.M1.def.physique === 35 && apresReleve.combattants.M1.leaderReleve === true);

  // Une seule fois : la seconde mise KO est une vraie chute.
  m.pv = 0;
  const encore = essai(() => CE.tomber(etat, "M1", "H1"), []) || [];
  verifier("la seconde mise KO la met à terre pour de bon", encore.some(e => e.type === "chute") && m.aTerre === true,
           encore.map(e => e.type).join(","));

  // Près d'un Profanateur : la relève passe avant le zombie.
  const pres = etatPur({
    P1: combattantPur("P1", { camp: "Allié", estMonstre: false, q: 0, r: 0, palier: "", atouts: { zombies: true, rayonZombies: 2 } }),
    M2: combattantPur("M2", { releveEnLeader: true, pv: 0, q: 1, r: 0 })
  });
  const e2 = essai(() => CE.tomber(pres, "M2", "P1"), []) || [];
  verifier("près d'un Profanateur, elle se relève en leader, pas en zombie",
           e2.some(e => e.type === "releveLeader") && !e2.some(e => e.type === "zombie") && !pres.combattants.M2.zombie, e2.map(e => e.type).join(","));

  // Une créature ordinaire tombe comme avant.
  const ord = etatPur({ M3: combattantPur("M3", { pv: 0 }) });
  const e3 = essai(() => CE.tomber(ord, "M3", null), []) || [];
  verifier("une créature sans relève tombe comme avant", e3.some(e => e.type === "chute") && ord.combattants.M3.aTerre === true);

  // L'écran : le mot sur le pion, la fiche projetée.
  const sc = essai(() => PC.misEnScene(releve || { type: "releveLeader", cible: "M1" }, etat), {});
  verifier("la relève se voit : « 👑 Se relève en Leader ! »", sc.geste === "message" && /Leader/.test(sc.texte || ""), JSON.stringify(sc).slice(0, 80));
  verifier("toute étape du noyau a sa mise en scène", essai(() => Object.keys(CE.APPLICATEURS).every(t => PC.TYPES_MIS_EN_SCENE.includes(t)), false));
  const fiches = essai(() => PC.fichesDepuisEtat(apresReleve, [{ idPersonnage: "M1", estMonstre: true, PV_Max: 70 }]), []) || [];
  verifier("la fiche projetée dit leader, et sa nouvelle jauge (85)", fiches[0] && fiches[0].leader === true && fiches[0].PV_Max === 85,
           fiches[0] ? `${fiches[0].leader} ${fiches[0].PV_Max}` : "");
  const fusion = essai(() => PC.fusionnerFichesCombat([{ idPersonnage: "M1", PV_Max: 70 }], [{ idPersonnage: "M1", leader: true }], { M1: {} }), []) || [];
  verifier("une fiche fraîche de la base ne lui retire pas son statut", fusion[0] && fusion[0].leader === true);
}

titre("3. apparitionsDuTour : LA MANCHE, LES LEADERS RELEVÉS, LE TERRAIN VIDE");
{
  const f = PC.apparitionsDuTour;
  const memoire = { mancheVue: null, releves: new Set() };
  const e = (manche, combattants) => ({ manche, combattants });
  const r1 = essai(() => f(e(1, { M1: combattantPur("M1") }), memoire), {});
  const r2 = essai(() => f(e(1, { M1: combattantPur("M1") }), memoire), {});
  const r3 = essai(() => f(e(2, { M1: combattantPur("M1", { leaderReleve: true, leader: true }) }), memoire), {});
  const r4 = essai(() => f(e(2, { M1: combattantPur("M1", { leaderReleve: true, leader: true }) }), memoire), {});
  verifier("la manche qui commence, une fois : 1, puis rien, puis 2", r1.manche === 1 && r2.manche === null && r3.manche === 2 && r4.manche === null,
           [r1.manche, r2.manche, r3.manche, r4.manche].join(","));
  verifier("le leader relevé, une fois", JSON.stringify(r3.releves) === '["M1"]' && JSON.stringify(r4.releves) === "[]");
  verifier("une créature debout : le terrain n'est pas vide", r1.terrainVide === false);
  const r5 = essai(() => f(e(3, { M1: combattantPur("M1", { aTerre: true, pv: 0 }), Z: combattantPur("Z", { zombie: { tours: 2 }, camp: "Allié" }),
                                  C: combattantPur("C", { compagnon: { idMaitre: "H1" }, camp: "Allié" }), H1: combattantPur("H1", { estMonstre: false, camp: "Allié" }) }), memoire), {});
  verifier("à terre, zombie, compagnon : le terrain est vide d'ennemis", r5.terrainVide === true);
}

// =========================================================================
//  4. LE VRAI CERVEAU
// =========================================================================
titre("4. LE VRAI CERVEAU : LA RELÈVE N'EST PAS UNE MORT, LES RENFORTS ARRIVENT À LEUR HEURE");
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
  const PARTIE = "GAME_V262";
  const partieDoc = { ID_Rencontre: "renc_v262", Phase_Combat: "Preparation", Tour_Combat: 1, Ordre_Initiative: ["H1", "M1"],
                      File_Attente_Combat: [], Ont_Joue_Ce_Round: [], Combattants_Hors_Jeu: [] };
  const f = firestore();
  const traces = [], appels = { morts: [], releves: [], deReleve: 0, prevus: [] };
  const elements = { "fenetre-combat": { style: { display: "block" } } };
  global.document = { getElementById: (id) => elements[id] || (elements[id] = { style: {}, innerHTML: "", innerText: "" }), addEventListener: () => {} };
  global.localStorage = { getItem: (c) => (c === "ID_JOUEUR_COURANT" ? "P_01" : null), setItem: () => {} };
  const HEROS = fiche("H1", { idJoueur: "P_01", prenom: "Cybile", Regeneration: 20, PV_Max: 200, PV_Actuels: 200 });
  const CREATURE = fiche("M1", { estMonstre: true, camp: "Ennemi", nom: "Chef gobelin", Personnalite: "brutal",
                                 PV_Max: 10, PV_Actuels: 10, releveEnLeader: true });
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
    entrerRenfortsPrevus: async (manche, options) => { appels.prevus.push({ manche, vide: !!(options && options.terrainVide) }); return []; }
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
  const etat0 = window.regimeDuJeu().etatPublie();
  verifier("le combat s'ouvre, la créature porte sa relève", !!etat0 && etat0.combattants.M1.releveEnLeader === true && !etat0.combattants.M1.leader);

  // Le héros la met KO.
  await window.regimeDemande.carte("H1", { idCarte: "C_H1", coutFatigue: 10, alterations: [], persistanceTerrain: false, zoneHexes: [],
                                           attaques: [{ valeurBrute: 30, cibles: ["M1"] }] });
  await attendre(); await f.livrer(8);
  const etat1 = window.regimeDuJeu().etatPublie();
  const m1 = (etat1 || { combattants: {} }).combattants.M1 || {};
  verifier("MISE KO, ELLE SE RELÈVE EN LEADER : debout, leader, 25 / 25 PV", m1.aTerre === false && m1.leader === true && m1.pvMax === 25,
           `à terre ${m1.aTerre}, leader ${m1.leader}, ${m1.pv} / ${m1.pvMax}`);
  verifier("elle n'est pas déclarée morte (ni document, ni hors jeu)", !appels.morts.includes("M1") && !(partieDoc.Combattants_Hors_Jeu || []).includes("M1"),
           `morts : ${appels.morts.join(",") || "personne"}`);
  verifier("le poste du cerveau inscrit la relève dans son document", appels.releves.length === 1 && appels.releves[0].id === "M1" && appels.releves[0].pvMax === 25,
           JSON.stringify(appels.releves));
  verifier("et appelle les renforts de la relève, une fois", appels.deReleve === 1, `${appels.deReleve}`);
  verifier("la trace le dit", traces.some(t => t.includes("se relève en leader")), traces.filter(t => t.includes("leader")).join(" | "));

  // La manche se ferme : la suivante appelle les renforts prévus.
  await attendre(); await f.livrer(8);
  verifier("la manche 2 commence : les renforts prévus sont appelés (terrain occupé)",
           appels.prevus.some(a => a.manche === 2 && a.vide === false), JSON.stringify(appels.prevus));
  verifier("la manche 1 l'avait été aussi, à l'ouverture", appels.prevus.some(a => a.manche === 1), JSON.stringify(appels.prevus));

  // Manche 2 : le héros l'abat pour de bon ; la manche 3 trouve le terrain vide.
  await notifier();
  partieDoc.Tour_Combat = 2;
  partieDoc.File_Attente_Combat = [{ idPersonnage: "H1", idCarte: "C_H1", initiative: 50 }, { idPersonnage: "M1", idCarte: "C_M1", initiative: 10 }];
  partieDoc.Phase_Combat = "Resolution";
  await notifier();
  await window.regimeDemande.carte("H1", { idCarte: "C_H1", coutFatigue: 10, alterations: [], persistanceTerrain: false, zoneHexes: [],
                                           attaques: [{ valeurBrute: 200, cibles: ["M1"] }] });
  await attendre(); await f.livrer(8); await attendre(); await f.livrer(8);
  const etat2 = window.regimeDuJeu().etatPublie();
  verifier("la seconde mise KO la met à terre, et la déclare morte", !!etat2 && etat2.combattants.M1.aTerre === true && appels.morts.includes("M1"),
           `morts : ${appels.morts.join(",") || "personne"}`);
  verifier("pas de seconde relève", appels.releves.length === 1 && appels.deReleve === 1);
  verifier("LA MANCHE 3 TROUVE LE TERRAIN VIDE : les renforts prévus n'attendent pas",
           appels.prevus.some(a => a.manche === 3 && a.vide === true), JSON.stringify(appels.prevus));
  const src = lire('regime_cerveau.js');
  verifier("la mémoire des apparitions s'oublie au changement de partie", /MEMOIRE_APPARITIONS\.mancheVue = null/.test(src) && /MEMOIRE_APPARITIONS\.releves\.clear\(\)/.test(src));
}

// =========================================================================
//  SECONDE PARTIE : LA VRAIE PAGE
// =========================================================================
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
// Les écritures se gardent (__ecrits, __majs, __lots) ET se reportent dans
// __docs, que getDoc relit : la réserve va et vient comme en base.
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
const { chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1194, height: 834 } });
await p.route('**', r => r.request().url().startsWith(base) ? r.continue() : r.abort());
await p.route('**/firebase-app.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_APP }));
await p.route('**/firebase-firestore.js', r => r.fulfill({ contentType: 'text/javascript', headers: {'Access-Control-Allow-Origin':'*'}, body: FAUX_FIRESTORE }));
const erreurs = [];
p.on('pageerror', e => erreurs.push(e.message));
await p.goto(base + '/index.html');
await p.waitForTimeout(1500);
await p.evaluate(() => {
  window.__ou = (f, d) => { try { return f(); } catch (e) { return d; } };
  window.__ouAsync = async (f, d) => { try { return await f(); } catch (e) { return d; } };
  document.documentElement.style.setProperty('--app-h', window.innerHeight + 'px');
  document.querySelectorAll('body > div[id^="ecran-"]').forEach(e => { if (e.id !== 'ecran-jeu') e.style.display = 'none'; });
  document.getElementById('ecran-jeu').style.display = 'block';
  document.getElementById('fenetre-combat').style.display = 'block';
  window.initialiserPlateau();
  window.ID_PARTIE_COURANTE = "P1";
  window.PARTIE_DATA = { Tour_Combat: 1 };
  window.TOKENS_VTT_DATA = {};
  window.jouerSonClic = () => {};
  window.__docs = { "Systeme_Parties/P1": { Ordre_Initiative: ["H1", "H2"] } };
  window.__hex = (t) => t ? t.q + "," + t.r : null;
});

titre("5. LES STATURES : PETIT, NORMAL, BOSS — PLUS D'ÉLITE");
{
  const r = await p.evaluate(async () => {
    window.__collections = { Monstres_Modeles: [{ id: "dps_cac__elite", data: { Cle: "dps_cac__elite", Archetype: "DPS CAC", Palier: "Élite", Ordre_Archetype: 0, Ordre_Palier: 2, PV: 110 } }] };
    window.__lots = [];
    await window.__ouAsync(() => window.chargerGabaritsMonstres(), null);
    const g = window.GABARITS_MONSTRES || [];
    window.__ou(() => window.dessinerTableauMonstres(), null);
    const lignes = [...document.querySelectorAll("#tbody-monstres .cellule-palier-monstres")].map(td => td.textContent.trim());
    window.__ou(() => window.dessinerReglagesMonstres(), null);
    const entetes = [...document.querySelectorAll("#reglages-monstres > .table-reglages-monstres thead th")].map(th => th.textContent.trim());
    const cases = [...document.querySelectorAll("#tbody-reglages-monstres input")].map(i => i.dataset.palier);
    return { paliers: [...new Set(g.map(x => x.Palier))], nb: g.length, amorces: window.__lots.map(o => o.data && o.data.Palier),
             lignes, entetes, cases, soutienBoss: !!window.__ou(() => window.gabaritMonstre("SOUTIEN", "Boss"), null),
             eliteLue: !!window.__ou(() => window.gabaritMonstre("DPS CAC", "Élite"), null) };
  });
  verifier("le bestiaire amorcé : 17 lignes (six archetypes, pas de Boss Soutien), aucune Élite",
           r.amorces.length === 17 && !r.amorces.includes("Élite"), `${r.amorces.length} : ${[...new Set(r.amorces)].join("/")}`);
  verifier("le bestiaire en mémoire : Petit, Normal, Boss", JSON.stringify(r.paliers) === '["Petit","Normal","Boss"]' && r.nb === 17, `${JSON.stringify(r.paliers)} (${r.nb})`);
  verifier("une vieille ligne Élite en base ne revient pas", r.eliteLue === false);
  verifier("le tableau de Paramètres > Monstres : 17 lignes, aucune Élite", r.lignes.length === 17 && !r.lignes.includes("Élite"), `${r.lignes.length} : ${[...new Set(r.lignes)].join("/")}`);
  // (v263 : la triche a quitté ce tableau pour l'encart du niveau du groupe.)
  verifier("la marche : trois colonnes, Petit / Normal / Boss",
           JSON.stringify(r.entetes) === '["","Petit","Normal","Boss"]' && r.cases.length === 3 && !r.cases.includes("Élite"), `${JSON.stringify(r.entetes)} ${r.cases.length}`);
}

titre("6. L'ENCART DU LEADER (Paramètres > Monstres)");
{
  const r = await p.evaluate(async () => {
    window.__ou(() => window.appliquerReglagesMonstres(null), null);
    // L'encart se redessine à chaque réglage : on relit ses cases à chaque fois.
    const champsL = () => [...document.querySelectorAll("#corps-reglages-leader input")];
    const champs = champsL();
    const lireL = () => champsL().map(i => i.dataset.cle + "=" + i.value).join(" ");
    const avant = lireL();
    const dansLeBloc = !!document.querySelector("#reglages-monstres #corps-reglages-leader");
    window.__ecrits = [];
    const changer = (cle, v) => { const i = champsL().find(x => x.dataset.cle === cle); if (!i) return; i.value = String(v); i.dispatchEvent(new Event("change")); };
    changer("degats", 30);
    changer("pv", 999);
    await new Promise(res => setTimeout(res, 50));
    const MP = window.moteurPur || {};
    const apres = { noyau: window.__ou(() => MP.leaderActuel(), null),
                    bonus: window.__ou(() => MP.bonusMonstreDe({ estMonstre: true, palier: "Normal", leader: true }), null),
                    champPv: (champsL().find(x => x.dataset.cle === "pv") || {}).value,
                    ecrit: (window.__ecrits || []).filter(e => e.chemin === "Monstres_Modeles/_REGLAGES").map(e => JSON.stringify(e.data) + (e.options && e.options.merge ? "+merge" : "")) };
    // Un autre poste : la base apporte ses chiffres ici.
    window.__ou(() => window.appliquerReglagesMonstres({ Leader: { Degats_Soins_Pct: 15, Resistances: 20, PV: 25, Chance_Etat_Pct: 15 } }), null);
    const ailleurs = { champs: lireL(), stats: window.__ou(() => window.champsLeader({ PV: 70, Res_Physique: 20, Res_Magique: 15 }), null) };
    window.__ou(() => window.appliquerReglagesMonstres(null), null);
    return { n: champs.length, avant, dansLeBloc, apres, ailleurs, retour: window.__ou(() => MP.leaderActuel(), null) };
  });
  verifier("quatre réglages, 15 à l'origine", r.n === 4 && r.avant === "degats=15 resistances=15 pv=15 chanceEtat=15", r.avant);
  verifier("dans le bloc des réglages, en haut du tableau", r.dansLeBloc === true);
  // (v263 : la triche du niveau 1 du groupe, 8 %, au lieu des 10 % par stature.)
  verifier("dégâts du leader à 30 : le moteur frappe à +38 % (8 + 30) tout de suite",
           r.apres.noyau && r.apres.noyau.degats === 30 && r.apres.bonus === 38, JSON.stringify(r.apres.noyau) + " " + r.apres.bonus);
  verifier("une saisie folle est bornée (999 → 300 PV)", r.apres.champPv === "300", r.apres.champPv);
  verifier("chaque changement s'écrit (Monstres_Modeles/_REGLAGES, champ Leader, fusionné)",
           r.apres.ecrit.length === 2 && r.apres.ecrit.every(x => /"Leader":\{/.test(x) && x.endsWith("+merge")) && /"Degats_Soins_Pct":30/.test(r.apres.ecrit[0]),
           r.apres.ecrit.join(" | "));
  verifier("un autre poste les change : l'encart les montre", r.ailleurs.champs === "degats=15 resistances=20 pv=25 chanceEtat=15", r.ailleurs.champs);
  verifier("et le prochain leader posé les reçoit : 70 + 8 (triche, v263) + 25 PV, 20 + 20 / 15 + 20 de défenses",
           !!r.ailleurs.stats && r.ailleurs.stats.Leader === true && r.ailleurs.stats.PV_Max === 103 && r.ailleurs.stats.PV_Actuels === 103
           && r.ailleurs.stats.Def_Physique === 40 && r.ailleurs.stats.Def_Magique === 35, JSON.stringify(r.ailleurs.stats));
  verifier("sans réglage en base : les chiffres d'origine", !!r.retour && r.retour.degats === 15 && r.retour.pv === 15, JSON.stringify(r.retour));
}

titre("7. LA PISTE (BLANC, OR, ROUGE ; LISERÉ DU LEADER) ET L'AURA DU PION");
{
  const r = await p.evaluate(async () => {
    const fiche = (id, palier, extra = {}) => ({ idPersonnage: id, prenom: id, camp: "Ennemi", estMonstre: true, Palier: palier,
      PV_Max: 40, PV_Actuels: 40, Fatigue_Max: 100, fatigueActuelle: 100, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant", ...extra });
    window.PERSOS_PARTIE = [
      { idPersonnage: "H1", prenom: "Cybile", camp: "Allié", PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, fatigueActuelle: 100, Bouclier_Actuel: 0, Etats_Alteres: [], statut: "Vivant" },
      fiche("M_P", "Petit"), fiche("M_N", "Normal", { leader: true }), fiche("M_N2", "Normal"), fiche("M_B", "Boss")];
    window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, M_P: { q: 1, r: 0 }, M_N: { q: 2, r: 0 }, M_N2: { q: 3, r: 0 }, M_B: { q: 4, r: 0 } };
    window.PISTE_MANCHE = { manche: 0, ordre: [] };
    const file = ["H1", "M_P", "M_N", "M_N2", "M_B"].map((id, i) => ({ idPersonnage: id, idCarte: "X", initiative: 90 - i * 10 }));
    window.PARTIE_DATA.Tour_Combat = 40; window.PARTIE_DATA.File_Attente_Combat = file;
    window.__ou(() => window.appliquerTokensVTT(window.TOKENS_VTT_DATA), null);
    window.__ou(() => window.afficherPisteInitiative(file, "Resolution"), null);
    await new Promise(res => setTimeout(res, 300));
    const rond = (id) => { const t = document.querySelector(`#piste-initiative .piste-tuile[data-id="${id}"]`);
      const d = t && t.querySelector('div[style*="border-radius: 50%"][style*="z-index: 3"]'); return d ? getComputedStyle(d) : null; };
    const fond = (id) => (rond(id) || {}).backgroundColor, ombre = (id) => (rond(id) || {}).boxShadow || "";
    const pion = (id) => document.getElementById("token-" + id);
    const aura = (id) => pion(id) && pion(id).querySelector(".aura-leader");
    const a = aura("M_N");
    const ra = a && a.getBoundingClientRect(), rp = pion("M_N") && pion("M_N").getBoundingClientRect();
    const img = pion("M_N") && pion("M_N").querySelector(".token-img-main");
    return { petit: fond("M_P"), normal: fond("M_N2"), boss: fond("M_B"), heros: fond("H1"), leaderFond: fond("M_N"),
             ombreLeader: ombre("M_N"), ombreNormal: ombre("M_N2"),
             aura: !!a, sansAura: ["M_P", "M_N2", "M_B", "H1"].filter(id => !!aura(id)),
             // v265 : un anneau organique dessiné en SVG, qui ondule (formes animées).
             ondule: a ? a.querySelectorAll("svg animate[attributeName='d']").length : 0,
             plusGrande: !!(ra && rp && ra.width > rp.width * 1.3), dessous: !!(a && img && Number(getComputedStyle(a).zIndex) < Number(getComputedStyle(img).zIndex)) };
  });
  const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };
  verifier("Petit : rond blanc", r.petit === rgb("#ffffff"), r.petit);
  verifier("Normal : rond or", r.normal === rgb("#d4a72c"), r.normal);
  verifier("Boss : rond rouge", r.boss === rgb("#e63946"), r.boss);
  verifier("un héros garde le beige d'origine", r.heros === rgb("#e8d5a5"), r.heros);
  verifier("LE LEADER : sa couleur (or), cerclée de rouge", r.leaderFond === rgb("#d4a72c") && /rgb\(255, 31, 31\) 0px 0px 0px 2px/.test(r.ombreLeader), r.ombreLeader.slice(0, 120));
  verifier("un Normal ordinaire n'a pas de liseré rouge", !/rgb\(255, 31, 31\)/.test(r.ombreNormal));
  verifier("LE PION DU LEADER : une aura rouge, et lui seul", r.aura && r.sansAura.length === 0, r.sansAura.join(","));
  verifier("elle ondule (v265 : un anneau organique, plus d'éclats qui tournent)", r.ondule >= 3, `${r.ondule}`);
  verifier("elle déborde du pion, sous son image", r.plusGrande && r.dessous);
}

titre("8. LES QUATRE APPARITIONS, RÈGLE PAR RÈGLE (400 tirages chacune)");
{
  const r = await p.evaluate(() => {
    const tirer = window.tirerApparition;
    if (typeof tirer !== "function") return null;
    const CAC = ["TANK CAC", "DPS CAC", "DPS MAGE CAC"];
    const cle = (l) => { const n = l.filter(m => m.palier === "Normal").length, pe = l.filter(m => m.palier === "Petit").length; return `${n}N${pe}P`; };
    const stats = {};
    for (const n of [1, 2, 3, 4]) {
      const s = stats[n] = { departs: {}, renforts: {}, heures: {}, fautes: [], cas: {}, leaderRenfort: 0, soutienDepart: 0, soutiens: 0 };
      for (let i = 0; i < 400; i++) {
        const t = tirer(n);
        const tous = [...t.depart, ...t.renforts];
        s.cas[t.cas] = (s.cas[t.cas] || 0) + 1;
        s.departs[cle(t.depart)] = 1;
        const surReleve = t.renforts.filter(m => m.surReleve), prevus = t.renforts.filter(m => !m.surReleve);
        if (prevus.length) s.renforts[cle(prevus)] = 1;
        if (surReleve.length) s.renforts["relève " + cle(surReleve)] = 1;
        prevus.forEach(m => { s.heures[m.entreeManche] = 1; });
        const leaders = tous.filter(m => m.leader);
        const soutiens = (l) => l.filter(m => m.archetype === "SOUTIEN").length;
        if (tous.some(m => m.palier !== "Petit" && m.palier !== "Normal")) s.fautes.push("stature " + tous.map(m => m.palier).join(","));
        if (t.apparition !== n || t.aleatoire) s.fautes.push("numéro");
        if (soutiens(t.depart)) s.soutienDepart++;
        s.soutiens += soutiens(tous);
        if (n === 1) {
          if (cle(t.depart) !== "1N0P" || !CAC.includes(t.depart[0].archetype)) s.fautes.push("départ " + cle(t.depart) + " " + t.depart[0].archetype);
          if (t.cas === 1) {
            if (leaders.length !== 1 || !t.depart[0].leader) s.fautes.push("cas 1 : le Normal n'est pas leader");
            if (cle(prevus) !== "0N4P" || prevus.some(m => m.entreeManche !== 2) || soutiens(prevus) !== 1) s.fautes.push("cas 1 : renfort " + cle(prevus) + " soutiens " + soutiens(prevus));
          } else {
            if (leaders.length !== 0 || !t.depart[0].releveEnLeader) s.fautes.push("cas 2 : relève");
            if (prevus.length || !["1N2P", "0N3P", "2N1P"].includes(cle(surReleve)) || soutiens(surReleve) > 1) s.fautes.push("cas 2 : renfort " + cle(surReleve));
          }
        }
        if (n === 2) {
          if (!["2N0P", "1N1P"].includes(cle(t.depart))) s.fautes.push("départ " + cle(t.depart));
          if (!t.depart.some(m => m.archetype === "TANK CAC") || soutiens(t.depart)) s.fautes.push("départ sans tank ou avec soutien");
          if (!["1N2P", "0N3P", "2N1P"].includes(cle(prevus)) || prevus.some(m => m.entreeManche !== 3) || soutiens(prevus) > 1) s.fautes.push("renfort " + cle(prevus));
          if (leaders.length !== 1) s.fautes.push("leaders " + leaders.length);
          if (prevus.some(m => m.leader)) s.leaderRenfort++;
        }
        if (n === 3) {
          if (!["3N0P", "1N2P", "2N1P", "0N4P"].includes(cle(t.depart)) || soutiens(t.depart) > 1) s.fautes.push("départ " + cle(t.depart));
          if (!["1N1P", "0N3P", "2N0P"].includes(cle(prevus)) || prevus.some(m => m.entreeManche !== 5) || soutiens(prevus) > 1) s.fautes.push("renfort " + cle(prevus));
          if (leaders.length !== 1 || !t.depart.some(m => m.leader)) s.fautes.push("leader hors du départ");
        }
        if (n === 4) {
          if (!["4N0P", "3N1P", "2N2P", "0N5P"].includes(cle(t.depart)) || soutiens(t.depart) > 1) s.fautes.push("départ " + cle(t.depart));
          if (t.renforts.length) s.fautes.push("renfort");
          if (leaders.length !== 1 || !t.depart.some(m => m.leader)) s.fautes.push("leader");
        }
      }
      s.fautes = [...new Set(s.fautes)].slice(0, 4);
      s.departs = Object.keys(s.departs).sort(); s.renforts = Object.keys(s.renforts).sort(); s.heures = Object.keys(s.heures).sort();
    }
    const alea = {}; let marque = true;
    for (let i = 0; i < 200; i++) { const t = tirer("aleatoire"); alea[t.apparition] = 1; if (!t.aleatoire) marque = false; }
    const sansGabarit = (() => { const v = window.gabaritMonstre; window.gabaritMonstre = () => null; try { return tirer(4).depart.length; } finally { window.gabaritMonstre = v; } })();
    return { stats, alea: Object.keys(alea).sort().join(","), marque, sansGabarit };
  });
  const s = (n) => (r && r.stats[n]) || { fautes: ["absent"], departs: [], renforts: [], heures: [], cas: {} };
  verifier("APPARITION 1 : un Normal au départ — tank, combattant ou mage au contact", !!r && s(1).fautes.length === 0, s(1).fautes.join(" | "));
  verifier("  cas 1 (le chef) ≈ 40 %, cas 2 (la relève) ≈ 60 %", !!r && s(1).cas[1] > 120 && s(1).cas[1] < 200 && s(1).cas[2] > 200, JSON.stringify(s(1).cas));
  verifier("  cas 1 : quatre Petits au bout de 1 tour (manche 2), dont un soutien", JSON.stringify(s(1).heures) === '["2"]' && s(1).renforts.includes("0N4P"), s(1).renforts.join(" / "));
  verifier("  cas 2 : à la relève, 1N+2P ou 3P ou 2N+1P", ["relève 0N3P", "relève 1N2P", "relève 2N1P"].every(x => s(1).renforts.includes(x)), s(1).renforts.join(" / "));
  verifier("APPARITION 2 : 2 Normaux ou 1 Normal + 1 Petit, dont un tank, sans soutien", !!r && s(2).fautes.length === 0 && JSON.stringify(s(2).departs) === '["1N1P","2N0P"]',
           s(2).fautes.join(" | ") + " " + s(2).departs.join(","));
  verifier("  renfort au bout de 2 tours (manche 3) : 1N+2P, 3P ou 2N+1P, un soutien au plus", JSON.stringify(s(2).heures) === '["3"]' && s(2).renforts.length === 3, s(2).renforts.join(" / "));
  verifier("  un leader parmi TOUS : parfois un renfort", s(2).leaderRenfort > 100 && s(2).leaderRenfort < 340, `${s(2).leaderRenfort} / 400`);
  verifier("APPARITION 3 : 3N, 1N+2P, 2N+1P ou 4P, un soutien au plus, le leader au départ", !!r && s(3).fautes.length === 0 && s(3).departs.length === 4,
           s(3).fautes.join(" | ") + " " + s(3).departs.join(","));
  verifier("  renfort au bout de 4 tours (manche 5) : 1N+1P, 3P ou 2N", JSON.stringify(s(3).heures) === '["5"]' && JSON.stringify(s(3).renforts) === '["0N3P","1N1P","2N0P"]', s(3).renforts.join(" / "));
  verifier("  des soutiens tombent parfois au départ (un au plus)", s(3).soutienDepart > 20, `${s(3).soutienDepart} / 400`);
  verifier("APPARITION 4 : 4N, 3N+1P, 2N+2P ou 5P, un leader, pas de renfort", !!r && s(4).fautes.length === 0 && JSON.stringify(s(4).departs) === '["0N5P","2N2P","3N1P","4N0P"]',
           s(4).fautes.join(" | ") + " " + s(4).departs.join(","));
  verifier("ALÉATOIRE : les quatre sortent, et le tirage le dit", !!r && r.alea === "1,2,3,4" && r.marque === true, r ? r.alea : "");
  verifier("bestiaire pas encore lu : le tirage n'est pas vide (la pose relira)", !!r && r.sansGabarit >= 4, r ? `${r.sansGabarit}` : "");
}

titre("9. LA GÉNÉRATION : TOUT LE DÉPART ENTRE, SUR LES CASES PEINTES, AVEC SON LEADER");
{
  const r = await p.evaluate(async () => {
    const out = {};
    const CASES = ["10,0", "11,0", "12,0", "10,1", "11,1", "12,-1"];
    window.__ou(() => window.appliquerSpawnEnnemis(CASES), null);
    window.PERSOS_JOUEURS_PARTIE = [{ idPersonnage: "H1", camp: "Allié" }, { idPersonnage: "H2", camp: "Allié" }];
    window.enregistrerPionsVTT = async () => {};
    window.equiperCompetencesRencontre = async () => {};
    let maj = null;
    window.modifierPartie = async (fn) => { maj = fn({}).maj; return true; };
    const generer = async (choix) => {
      window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, H2: { q: 1, r: 0 } };
      window.__docs["Systeme_Parties/P1"] = { Ordre_Initiative: ["H1", "H2"] };
      window.__ecrits = []; window.__majs = []; maj = null;
      const res = await window.__ouAsync(() => window.genererRencontreMonstres(choix), null);
      const docs = window.__ecrits.filter(e => /^Monstres\/MONSTRE_/.test(e.chemin));
      const ids = docs.map(d => d.chemin.slice(9));
      return { res, docs: docs.map(d => d.data), cases: ids.map(id => window.__hex(window.TOKENS_VTT_DATA[id])),
               reserve: (window.__docs["Systeme_Parties/P1"] || {}).Reserve_Monstres, maj,
               ordre: (window.__docs["Systeme_Parties/P1"] || {}).Ordre_Initiative || [] };
    };
    const g4 = await generer(4);
    const gab = (d) => window.__ou(() => window.gabaritMonstre(d.Archetype, d.Palier), {}) || {};
    const chef = g4.docs.filter(d => d.Leader);
    out.a4 = { n: g4.docs.length, cases: g4.cases, surPeintes: g4.cases.every(c => CASES.includes(c)), distinctes: new Set(g4.cases).size === g4.cases.length,
               leaders: chef.length, pvChef: chef[0] ? chef[0].PV_Max - gab(chef[0]).PV : null, defChef: chef[0] ? chef[0].Def_Physique - gab(chef[0]).Res_Physique : null,
               reserve: g4.reserve, maj: g4.maj, ordre: g4.ordre.length, paliers: g4.docs.map(d => d.Palier),
               triche: window.__ou(() => window.tricheMonstresActuelle(), 0) };
    // L'Apparition 1, jusqu'à voir ses deux cas.
    out.a1 = {};
    for (let k = 0; k < 30 && !(out.a1.chef && out.a1.releve); k++) {
      const g = await generer(1);
      if (!g.res) break;
      if (g.res.cas === 1) out.a1.chef = { leader: g.docs.length === 1 && g.docs[0].Leader === true, reserve: (g.reserve || []).map(m => `${m.palier}@${m.entreeManche}${m.leader ? "*" : ""}`) };
      else out.a1.releve = { releve: g.docs.length === 1 && g.docs[0].Releve_En_Leader === true && !g.docs[0].Leader, pv: g.docs[0] && g.docs[0].PV_Max === gab(g.docs[0]).PV + window.__ou(() => window.tricheMonstresActuelle(), 0),
                             reserve: (g.reserve || []).map(m => (m.surReleve ? "relève" : "?") + (m.entreeManche ? "@" + m.entreeManche : "")) };
    }
    const g2 = await generer(2);
    out.a2 = { reserve: (g2.reserve || []).map(m => m.entreeManche), leaders: g2.docs.filter(d => d.Leader).length + (g2.reserve || []).filter(m => m.leader).length,
               noms: [...g2.docs.map(d => d.Prenom_Personnage), ...(g2.reserve || []).map(m => m.nom)] };
    return out;
  });
  verifier("Apparition 4 : 4 ou 5 créatures posées, au-delà des « joueurs + 1 » d'avant (3)", r.a4.n >= 4 && r.a4.n <= 5, `${r.a4.n} (${r.a4.paliers.join(",")})`);
  verifier("toutes sur les cases peintes, une par case", r.a4.surPeintes && r.a4.distinctes, r.a4.cases.join(" "));
  verifier("toutes dans l'ordre d'initiative", r.a4.ordre === 2 + r.a4.n, `${r.a4.ordre}`);
  // (v263 : sur les PV de la triche du niveau du groupe, 8 au niveau 1.)
  verifier("un leader, et un seul, avec ses +15 PV (sur la triche) et +15 de défense physique", r.a4.leaders === 1 && r.a4.triche === 8 && r.a4.pvChef === 15 + 8 && r.a4.defChef === 15,
           `${r.a4.leaders} leader(s), +${r.a4.pvChef} PV, +${r.a4.defChef} déf.`);
  verifier("pas de renfort en réserve", Array.isArray(r.a4.reserve) && r.a4.reserve.length === 0, JSON.stringify(r.a4.reserve));
  verifier("la partie retient l'apparition et la rencontre, plus de difficulté",
           !!r.a4.maj && r.a4.maj.Apparition_Rencontre === 4 && typeof r.a4.maj.ID_Rencontre === "string" && !("Difficulte_Rencontre" in r.a4.maj), JSON.stringify(r.a4.maj));
  verifier("Apparition 1, le chef : leader, quatre Petits en réserve pour la manche 2",
           !!r.a1.chef && r.a1.chef.leader && JSON.stringify(r.a1.chef.reserve) === '["Petit@2","Petit@2","Petit@2","Petit@2"]', JSON.stringify(r.a1.chef));
  verifier("Apparition 1, la relève : pas encore leader (PV du gabarit + triche), ses renforts attendent sa relève",
           !!r.a1.releve && r.a1.releve.releve && r.a1.releve.pv && r.a1.releve.reserve.length === 3 && r.a1.releve.reserve.every(x => x === "relève"), JSON.stringify(r.a1.releve));
  verifier("Apparition 2 : trois renforts pour la manche 3, un seul leader en tout", JSON.stringify(r.a2.reserve) === "[3,3,3]" && r.a2.leaders === 1,
           `${JSON.stringify(r.a2.reserve)} — ${r.a2.leaders} leader(s)`);
  verifier("toute la rencontre est nommée d'un coup, renforts compris, sans doublon", r.a2.noms.length === 5 && r.a2.noms.every(Boolean) && new Set(r.a2.noms).size === 5,
           r.a2.noms.join(", "));
}

titre("10. LES RENFORTS À LEUR HEURE");
{
  const r = await p.evaluate(async () => {
    const out = {};
    const CASES = ["10,0", "11,0", "12,0", "10,1", "11,1", "12,-1"];
    window.__ou(() => window.appliquerSpawnEnnemis(CASES), null);
    window.TOKENS_VTT_DATA = { H1: { q: 0, r: 0 }, H2: { q: 1, r: 0 } };
    window.MONSTRES_PARTIE = [];
    window.PERSOS_JOUEURS_PARTIE = [{ idPersonnage: "H1", camp: "Allié" }, { idPersonnage: "H2", camp: "Allié" }];
    const R = (nom, extra) => ({ archetype: "DPS CAC", palier: "Petit", nom, ...extra });
    window.__docs["Systeme_Parties/P1"] = { Ordre_Initiative: ["H1", "H2"], Reserve_Monstres: [
      R("A", { entreeManche: 3 }), R("B", { entreeManche: 3 }), R("C", { entreeManche: 5, leader: true, palier: "Normal" }), R("D", { surReleve: true }), R("E", {}) ] };
    const reserve = () => ((window.__docs["Systeme_Parties/P1"] || {}).Reserve_Monstres || []).map(m => m.nom).join("");
    const entres = async (f) => { const ids = await window.__ouAsync(f, null); return Array.isArray(ids) ? ids.length : (ids ? 1 : 0); };
    window.__ecrits = [];
    out.m2 = await entres(() => window.entrerRenfortsPrevus(2)); out.r2 = reserve();
    out.m3 = await entres(() => window.entrerRenfortsPrevus(3)); out.r3 = reserve();
    const posees = window.__ecrits.filter(e => /^Monstres\/MONSTRE_/.test(e.chemin)).map(e => e.chemin.slice(9));
    out.casesM3 = posees.map(id => window.__hex(window.TOKENS_VTT_DATA[id]));
    window.ennemisEncoreDebout = () => true;
    out.m4occupe = await entres(() => window.entrerRenfortsPrevus(4, { terrainVide: true })); out.r4occupe = reserve();
    window.ennemisEncoreDebout = () => false;
    out.m4vide = await entres(() => window.entrerRenfortsPrevus(4, { terrainVide: true })); out.r4vide = reserve();
    out.chefC = window.__ecrits.filter(e => /^Monstres\/MONSTRE_/.test(e.chemin) && e.data.Prenom_Personnage === "C").map(e => e.data.Leader === true && e.data.PV_Max > 70)[0];
    out.m4encore = await entres(() => window.entrerRenfortsPrevus(4, { terrainVide: true })); out.r4encore = reserve();
    // La mort d'une créature : seule la réserve d'avant (E) y répond.
    out.mort1 = await entres(() => window.entrerRenfortMonstre()); out.rMort1 = reserve();
    out.mort2 = await entres(() => window.entrerRenfortMonstre()); out.rMort2 = reserve();
    out.releve = await entres(() => window.entrerRenfortsDeReleve()); out.rReleve = reserve();
    out.releveVide = await entres(() => window.entrerRenfortsDeReleve());
    // La relève inscrite dans le document de la créature.
    const idChef = posees[0];
    window.SOURCE_COMBATTANTS[idChef] = "Monstres";
    window.__majs = [];
    await window.__ouAsync(() => window.enregistrerReleveLeader(idChef, { pvMax: 85, leader: true, def: { physique: 35, magique: 30 } }), null);
    out.inscrite = (window.__majs || []).filter(m => m.chemin === "Monstres/" + idChef).map(m => JSON.stringify(m.data))[0] || "";
    // La victoire attend les renforts ; la coupe de test les congédie.
    window.MONSTRES_PARTIE = [{ idPersonnage: "M9", estMonstre: true, statut: "Mort", PV_Actuels: 0 }];
    window.PARTIE_DATA.Reserve_Monstres = [R("Z", { entreeManche: 9 })];
    out.gagneAvecReserve = window.__ou(() => window.combatGagne(), null);
    window.PARTIE_DATA.Reserve_Monstres = [];
    out.gagneSans = window.__ou(() => window.combatGagne(), null);
    window.__docs["Systeme_Parties/P1"].Reserve_Monstres = [R("Z", { entreeManche: 9 })];
    window.PERSOS_PARTIE = [{ idPersonnage: "M8", camp: "Ennemi", estMonstre: true, statut: "Vivant", PV_Actuels: 10, PV_Max: 10 }];
    window.SOURCE_COMBATTANTS.M8 = "Monstres";
    await window.__ouAsync(() => window.declencherVictoireTest(), null);
    out.coupe = reserve();
    return out;
  });
  verifier("manche 2 : personne (A et B attendent la 3)", r.m2 === 0 && r.r2 === "ABCDE", `${r.m2} — réserve ${r.r2}`);
  verifier("MANCHE 3 : A et B entrent, sur des cases peintes", r.m3 === 2 && r.r3 === "CDE" && r.casesM3.length === 2 && r.casesM3.every(c => ["10,0", "11,0", "12,0", "10,1", "11,1", "12,-1"].includes(c)),
           `${r.m3} — réserve ${r.r3} — ${r.casesM3.join(" ")}`);
  verifier("manche 4, terrain vide selon le cerveau mais une créature debout : C attend", r.m4occupe === 0 && r.r4occupe === "CDE", `${r.m4occupe} — ${r.r4occupe}`);
  verifier("TERRAIN VIDÉ : C (prévue manche 5) entre dès la manche 4, en leader", r.m4vide === 1 && r.r4vide === "DE" && r.chefC === true, `${r.m4vide} — ${r.r4vide} — leader ${r.chefC}`);
  verifier("puis plus rien de prévu", r.m4encore === 0 && r.r4encore === "DE");
  verifier("une mort fait entrer la réserve d'avant (E), jamais celle de la relève", r.mort1 === 1 && r.rMort1 === "D" && r.mort2 === 0 && r.rMort2 === "D",
           `${r.mort1} → ${r.rMort1}, ${r.mort2} → ${r.rMort2}`);
  verifier("LA RELÈVE fait entrer ses renforts (D), une fois", r.releve === 1 && r.rReleve === "" && r.releveVide === 0, `${r.releve} — « ${r.rReleve} »`);
  verifier("la relève s'inscrit dans le document : leader, 85 PV, 35 / 30 de défenses",
           r.inscrite === '{"Leader":true,"Releve_En_Leader":false,"PV_Max":85,"Def_Physique":35,"Def_Magique":30}', r.inscrite);
  verifier("la victoire attend les renforts en réserve", r.gagneAvecReserve === false && r.gagneSans === true, `${r.gagneAvecReserve} / ${r.gagneSans}`);
  verifier("la coupe de victoire de test congédie les renforts", r.coupe === "", `« ${r.coupe} »`);
}

titre("11. LA FENÊTRE 💀 ET LA FENÊTRE DES APPARITIONS");
{
  const r = await p.evaluate(async () => {
    const out = {};
    window.__ou(() => window.ouvrirGenerationRencontre(), null);
    const voile = document.getElementById("etape-generation-rencontre");
    out.ouverte = !!voile && voile.style.display === "flex";
    const choix = [...document.querySelectorAll("#etape-generation-rencontre .choix-apparition-rencontre")];
    out.choix = choix.map(c => c.dataset.apparition).join(",");
    out.titres = choix.map(c => (c.querySelector(".choix-apparition-titre") || {}).textContent).join(" | ");
    out.actifDefaut = choix.filter(c => c.classList.contains("actif")).map(c => c.dataset.apparition).join(",");
    out.difficultes = document.querySelectorAll(".choix-difficulte-rencontre").length;
    const trois = choix.find(c => c.dataset.apparition === "3");
    if (trois) trois.click();
    out.actifApres = choix.filter(c => c.classList.contains("actif")).map(c => c.dataset.apparition).join(",");
    let recu = "rien";
    window.genererRencontreMonstres = async (x) => { recu = x; };
    await window.__ouAsync(() => window.validerGenerationRencontre(), null);
    out.recu = recu;
    out.fermee = !!voile && voile.style.display === "none";
    // Paramètres > Outils > Apparitions.
    window.naviguerFenetre = window.naviguerFenetre || (() => {});
    window.__ou(() => window.ouvrirTableRencontres(), null);
    const corps = document.getElementById("corps-rencontres-monstres");
    out.blocs = [...document.querySelectorAll(".bloc-apparition")].map(b => b.dataset.apparition).join(",");
    out.texte = corps ? corps.textContent : "";
    out.bouton = (document.getElementById("btn-table-rencontres") || {}).textContent;
    return out;
  });
  verifier("la fenêtre s'ouvre : Apparition 1, 2, 3, 4 et plus, Aléatoire", r.ouverte && r.choix === "1,2,3,4,aleatoire" && /Apparition 4 et plus/.test(r.titres), r.titres);
  verifier("plus aucune difficulté à choisir", r.difficultes === 0);
  verifier("Aléatoire est choisi d'office ; un clic choisit l'Apparition 3", r.actifDefaut === "aleatoire" && r.actifApres === "3", `${r.actifDefaut} → ${r.actifApres}`);
  verifier("Valider invoque l'apparition choisie, et ferme", r.recu === 3 && r.fermee, String(r.recu));
  verifier("Paramètres > Outils : « Apparitions », les quatre lues dans la table du tirage", (r.bouton || "").trim() === "Apparitions" && r.blocs === "1,2,3,4", `${(r.bouton || "").trim()} ${r.blocs}`);
  verifier("on y lit les renforts, leur heure, la relève, les chances des deux cas",
           ["Au bout de 1 tour", "Au bout de 2 tours", "Au bout de 4 tours", "À sa relève", "40 %", "60 %", "leader", "un soutien au plus"].every(m => r.texte.includes(m)),
           ["Au bout de 1 tour", "Au bout de 2 tours", "Au bout de 4 tours", "À sa relève", "40 %", "60 %", "leader", "un soutien au plus"].filter(m => !r.texte.includes(m)).join(", "));
  const src = lire('combat.js');
  verifier("la réinitialisation efface l'apparition de la partie", /Apparition_Rencontre: deleteField\(\)/.test(src) && /delete window\.PARTIE_DATA\.Apparition_Rencontre/.test(src));
  verifier("aucune erreur dans la page", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
}

titre("12. LES VERSIONS");
{
  const html = lire('index.html');
  const n = (re, txt) => Number((txt.match(re) || [])[1] || 0);
  const vTrace = n(/VERSION_IVALIS = (\d+);/, lire('trace_combat.js')), vJson = n(/"version": (\d+)/, lire('version.json'));
  verifier("version 262 ou plus (trace_combat.js, version.json)", vTrace >= 262 && vJson === vTrace, `${vTrace} / ${vJson}`);
  verifier("combat.js v147+, monstres.js v37+, style.css v94+, regime_cerveau.js v51+",
           n(/combat\.js\?v=(\d+)"/, html) >= 147 && n(/monstres\.js\?v=(\d+)"/, html) >= 37 && n(/style\.css\?v=(\d+)"/, html) >= 94
           && n(/regime_cerveau\.js\?v=(\d+)"/, html) >= 51);
  const carte = (m) => n(new RegExp(`"\\./${m}\\.js": "\\./${m}\\.js\\?v=(\\d+)"`), html), balise = (m) => n(new RegExp(`src="${m}\\.js\\?v=(\\d+)"`), html);
  verifier("combat_etat v41+, moteur_pur v66+, pont_combat v43+ — carte d'import et balises d'accord",
           carte("combat_etat") >= 41 && carte("moteur_pur") >= 66 && carte("pont_combat") >= 43
           && ["combat_etat", "moteur_pur", "pont_combat"].every(m => carte(m) === balise(m)),
           ["combat_etat", "moteur_pur", "pont_combat"].map(m => `${m} ${carte(m)}/${balise(m)}`).join(", "));
}

await b.close();
serveur.close();
console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
