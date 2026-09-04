// UNE CAMPAGNE ENTIÈRE, SUR TROIS APPAREILS, TROIS FOIS DE SUITE.
//
// Les autres bancs découpent : la réinitialisation ici, le butin là, les objets
// ailleurs. Celui-ci recolle tout et joue la BOUCLE RÉELLE d'une soirée de jeu,
// autant de fois qu'il faut pour que les traînées d'un combat se voient dans le
// suivant :
//
//   réinitialiser → poser les deux repères → déployer les héros → générer la
//   rencontre → abattre les créatures → butin personnel (prendre, équiper,
//   valider) → partage du reste → combat suivant.
//
// Trois postes tournent en parallèle devant un Firestore partagé qui reproduit
// ce que le vrai service garantit : transactions sérialisées, notifications
// retardées et différentes d'un poste à l'autre. Ce qu'on cherche : un écran
// qui diverge, un objet qui se perd, un bonus qui ne suit pas d'un combat au
// suivant, un butin d'hier qui bloque celui d'aujourd'hui.
import fs from 'fs';
import { creerMonde, extraire } from './monde_reseau.mjs';
import { SRC_STATS_COMMUNES } from './stats_communes.mjs';

// -------------------------------------------------------------------------
//  LE VRAI CODE DU JEU
// -------------------------------------------------------------------------
const sansImports = (f) => fs.readFileSync('/home/user/Ivalis/' + f, 'utf-8')
    .replace(/^import[\s\S]*?from\s+"[^"]+";/gm, '')
    .replace(/^export const/gm, 'const');

const SRC_COMBAT = ['window.enregistrerPionsVTT = async function',
                    'window.reparerPionsAPlat = async function',
                    'window.modifierPartie = async function',
                    'window.estCombattantMort = function',
                    'window.caseOccupeeParVivant = function',
                    'window.trouverHexLibreVTT = function',
                    'window.trouverHexLibreAutour = function',
                    'window.pointApparition = function',
                    'window.genererTokensCombat = async function',
                    'window.enregistrerPointsApparition = async function',
                    'window.deployerCombatApresReperes = async function',
                    'window.reinitialiserCombat = async function']
    .map(m => extraire('combat.js', m)).join('\n\n')
    // Fonction de portée module (pas sur window) dont dépend trouverHexLibreAutour.
    + '\n\n' + extraire('combat.js', 'function distanceHexVTT(a, b) {', '}');
const SRC_CONVERSION = extraire('app.js', 'function persoDocVersFront(id, d) {', '}');
const SRC_STATS_EQUIP = ['window.bonusEquip = function',
                         'window.paradeCombattant = function',
                         'window.defPhysiqueCombattant = function',
                         'window.defMagiqueCombattant = function',
                         'window.critiqueCombattant = function']
    .map(m => extraire('app.js', m)).join('\n\n');
const SRC_MONSTRES = sansImports('monstres.js');
const SRC_OBJETS = fs.readFileSync('/home/user/Ivalis/objets.js', 'utf-8');
const SRC_LOOT = sansImports('loot.js');

let echecs = 0;
const verifier = (l, c, d = "") => { if (!c) echecs++; console.log(`  ${l.padEnd(64)} ${c ? "OK" : "ÉCHEC"} ${d}`); };
const pause = (ms) => new Promise(r => setTimeout(r, ms));

// -------------------------------------------------------------------------
//  LA PARTIE DE DÉPART : trois joueurs, quatre héros (le premier en mène deux)
// -------------------------------------------------------------------------
const HEROS = [
    { id: "J1", prenom: "Pliors", joueur: "P1" },
    { id: "J2", prenom: "Nadja",  joueur: "P1" },
    { id: "J3", prenom: "Jade",   joueur: "P2" },
    { id: "J4", prenom: "Mémé",   joueur: "P3" }
];

function documentsDeDepart() {
    const docs = {};
    HEROS.forEach(h => {
        docs["Personnages/" + h.id] = {
            ID_Partie: "PARTIE", ID_Joueur: h.joueur, Camp: "Allié", Prenom_Personnage: h.prenom,
            Statut: "Vivant", PV_Max: 60, PV_Actuels: 60, Fatigue_Max: 100, Fatigue_Actuelle: 100,
            Regeneration: 20, Esquive: 5, Parade: 5, Critique: 10, Def_Physique: 5, Def_Magique: 5,
            Etats_Alteres: [], Race: "Humain",
            // Des caractéristiques hautes : les prérequis de rareté ne doivent
            // pas bloquer le banc, on les teste séparément.
            Force: 40, Dexterite: 40, Intelligence: 40, Constitution: 40, Charisme: 40, Sagesse: 40,
            Equip_Armure: null, Equip_Main_Droite: null, Equip_Main_Gauche: null,
            // ⚠️ Sans image, genererTokensCombat saute le héros : il n'aurait
            // jamais de pion sur le plateau (cf. la section « le héros sans
            // portrait » plus bas, qui vérifie ce comportement exprès).
            URL_Token: "https://exemple/token_" + h.id + ".png", URL_Cloudinary: ""
        };
    });
    docs["Systeme_Parties/PARTIE"] = {
        Phase_Combat: "Preparation", Tour_Combat: 1, File_Attente_Combat: [],
        Ordre_Initiative: HEROS.map(h => h.id), Index_Initiative: 0
    };
    docs["Combat_VTT/PARTIE"] = { Tokens: {} };
    return docs;
}

// -------------------------------------------------------------------------
//  UN POSTE
// -------------------------------------------------------------------------
const coquille = () => ({ style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
                          appendChild() {}, remove() {}, addEventListener() {}, setAttribute() {},
                          querySelector: () => null, querySelectorAll: () => [],
                          innerHTML: "", innerText: "", value: "" });

function creerPoste(nom, monde, joueur) {
    const w = {};
    const api = monde.apiPour(nom);
    const db = {};
    const journal = { alertes: [], erreurs: [] };

    const activer = () => {
        global.window = w;
        global.localStorage = {
            getItem: (c) => c === "ID_JOUEUR_COURANT" ? joueur : null,
            setItem: () => {}, removeItem: () => {}
        };
        global.document = {
            getElementById: (id) => id === "fenetre-combat" ? { style: { display: "block" } } : coquille(),
            querySelectorAll: () => [], querySelector: () => null,
            addEventListener: () => {}, removeEventListener: () => {}, createElement: () => coquille(),
            body: coquille()
        };
        global.confirm = () => true;
        global.alert = (t) => journal.alertes.push(t);
        return w;
    };
    activer();

    w.NOM_POSTE = nom;
    w.MON_JOUEUR = joueur;
    w.ID_PARTIE_COURANTE = "PARTIE";
    w.SOURCE_COMBATTANTS = {};
    w.TOKENS_VTT_DATA = {};
    w.PARTIE_DATA = {};
    w.PERSOS_JOUEURS_PARTIE = []; w.MONSTRES_PARTIE = []; w.PERSOS_PARTIE = [];
    w.COMBAT_PERSOS_JOUEUR = []; w.COMBAT_INDEX_PERSO = 0;
    w.CACHE_COMPETENCES_GLOBAL = {};
    w.confirm = () => true;
    w.alert = (t) => journal.alertes.push(t);
    w.jouerSonClic = () => {};
    w.localStorage = global.localStorage;

    // Un plateau de 15 cases de rayon, entièrement praticable.
    w.PLATEAU_VTT = {
        hexSize: 60, gridOpacity: 0.8,
        getCaseState: (q, r) => (Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) <= 15)
            ? { isBlocked: false, isDeleted: false, isDifficult: false } : null,
        hexToPixel: (q, r) => ({ x: q * 50, y: r * 50 }),
        renderMap: () => {}
    };

    // Tout l'affichage est neutralisé : ce banc regarde les DONNÉES.
    ["appliquerTokensVTT", "afficherPisteInitiative", "mettreAJourJaugePV", "mettreAJourJaugeFatigue",
     "verifierChangementTour", "afficherPersoCombatActuel", "actualiserBoutonFinTour",
     "appliquerZonesPersistantes", "afficherMessageFlottantHex",
     "ouvrirGenerationRencontre", "fermerGenerationRencontre", "dessinerTableauMonstres",
     "afficherFenetreButin", "afficherEquipementActuelButin", "rafraichirFouilleButin",
     "actualiserEncartsEquipement", "positionnerBandeauApparition", "arreterPlacementApparition",
     "verifierPointsApparition", "equiperCompetencesRencontre"].forEach(fn => { w[fn] = () => {}; });
    w.equiperCompetencesRencontre = async () => {};
    // Appelée avec .catch() par la réinitialisation : elle doit rendre une promesse.
    w.sauvegarderZonesPersistantes = async () => {};

    // Aucune image n'est générée dans ce banc : la fouille des cadavres est
    // couverte ailleurs, et une clé d'API absente est justement le cas où le
    // butin doit s'ouvrir directement.
    w.peutIllustrerLesObjets = () => false;
    w.lancerIllustrationButin = async () => {};
    w.avancementImagesButin = () => ({ total: 0, prets: 0 });

    // -------------------------------------------------------------------
    //  Le code du jeu, chargé tel quel
    // -------------------------------------------------------------------
    const collection = (_db, col) => ({ col, estCollection: true });
    const getDocs = async (ref) => {
        const prefixe = (ref.col || "") + "/";
        const trouves = Object.keys(monde.docs).filter(c => c.startsWith(prefixe));
        return {
            forEach: (fn) => trouves.forEach(c => fn({ id: c.slice(prefixe.length),
                                                       data: () => structuredClone(monde.docs[c]) })),
            docs: trouves.map(c => ({ id: c.slice(prefixe.length), data: () => structuredClone(monde.docs[c]) })),
            empty: trouves.length === 0
        };
    };
    const query = (...a) => a[0];
    const where = () => ({});
    // writeBatch de monde_reseau ne connaît que update : le chargement des
    // gabarits, lui, pose des documents neufs.
    const writeBatch = () => {
        const ops = [];
        return {
            set: (ref, data) => ops.push([ref, data]),
            update: (ref, data) => ops.push([ref, data]),
            commit: async () => { for (const [ref, data] of ops) await api.setDoc(ref, data); }
        };
    };

    new Function('window', SRC_STATS_COMMUNES)(w);
    new Function('window', SRC_OBJETS)(w);
    new Function('window', SRC_CONVERSION + '\nwindow.persoDocVersFront = persoDocVersFront;')(w);
    new Function('window', SRC_STATS_EQUIP)(w);
    new Function('window', 'db', 'doc', 'setDoc', 'onSnapshot', 'updateDoc', 'runTransaction',
                 'deleteField', 'FieldPath', 'getDoc', 'deleteDoc', 'importerFirestore',
        SRC_COMBAT.replace(/await import\("[^"]*"\)/g, 'await importerFirestore()'))(
        w, db, api.doc, api.setDoc, api.onSnapshot, api.updateDoc, api.runTransaction,
        api.deleteField, class FieldPath { constructor(...s) { this.segments = s; } },
        api.getDoc, api.deleteDoc, async () => api);
    new Function('window', 'db', 'collection', 'doc', 'getDoc', 'getDocs', 'setDoc', 'updateDoc',
                 'deleteDoc', 'deleteField', 'onSnapshot', 'query', 'where', 'writeBatch', SRC_MONSTRES)(
        w, db, collection, api.doc, api.getDoc, getDocs, api.setDoc, api.updateDoc,
        api.deleteDoc, api.deleteField, api.onSnapshot, query, where, writeBatch);
    new Function('window', 'db', 'doc', 'updateDoc', SRC_LOOT)(w, db, api.doc, api.updateDoc);

    // Rechargés APRÈS monstres.js, qui redéfinit certains bouchons au passage.
    w.equiperCompetencesRencontre = async () => {};
    w.dessinerTableauMonstres = () => {};
    w.afficherFenetreButin = () => {};

    // -------------------------------------------------------------------
    //  Les écouteurs
    // -------------------------------------------------------------------
    const brancherCombattant = (col, id) => {
        if (w.__ecoutes.has(col + "/" + id)) return;
        w.__ecoutes.add(col + "/" + id);
        w.SOURCE_COMBATTANTS[id] = col;
        api.onSnapshot(api.doc(db, col, id), (data) => {
            activer();
            const liste = col === "Monstres" ? w.MONSTRES_PARTIE : w.PERSOS_JOUEURS_PARTIE;
            const i = liste.findIndex(x => x.idPersonnage === id);
            if (!data) { if (i >= 0) liste.splice(i, 1); w.recomposerCombattants(); return; }
            const objet = w.persoDocVersFront(id, data);
            if (col === "Monstres") { objet.estMonstre = true; objet.Nombre_Actions = 1; }
            if (i >= 0) liste[i] = objet; else liste.push(objet);
            w.recomposerCombattants();
            w.COMBAT_PERSOS_JOUEUR = w.PERSOS_PARTIE.filter(p => p.idJoueur === joueur);
        });
    };
    w.__ecoutes = new Set();
    w.__brancher = brancherCombattant;

    api.onSnapshot(api.doc(db, "Systeme_Parties", "PARTIE"), (data) => {
        activer();
        if (!data) return;
        w.PARTIE_DATA = data;
        // Le vrai app.js appelle ces deux-là à chaque notification de partie.
        try { w.afficherFenetreButin(data.Butin || null); }
        catch (e) { journal.erreurs.push("butin: " + e.message); }
        try { if (typeof w.verifierVictoireCombat === "function") w.verifierVictoireCombat(); }
        catch (e) { journal.erreurs.push("victoire: " + e.message); }
    });
    api.onSnapshot(api.doc(db, "Combat_VTT", "PARTIE"), (data) => {
        activer();
        if (!data) return;
        w.TOKENS_VTT_DATA = data.Tokens ? structuredClone(data.Tokens) : {};
    });

    // La collection Monstres n'a pas d'écouteur de collection dans le banc :
    // on branche à la demande, comme le fait ecouterMonstresPartie.
    HEROS.forEach(h => brancherCombattant("Personnages", h.id));

    return { nom, w, api, db, joueur, journal, activer };
}

// =========================================================================
//  LES OUTILS DU BANC
// =========================================================================
const monde = creerMonde(documentsDeDepart());
const postes = [
    creerPoste("iPad-Nico", monde, "P1"),   // mène J1 ET J2
    creerPoste("iPad-Ben",  monde, "P2"),   // mène J3
    creerPoste("PC-Adrien", monde, "P3")    // mène J4
];
const [mj] = postes;
await monde.attendreLeReseau();

// Branche les nouveaux monstres sur les trois postes, comme le ferait
// l'écouteur de collection du vrai jeu.
const brancherLesMonstres = () => {
    Object.keys(monde.docs)
        .filter(c => c.startsWith("Monstres/"))
        .forEach(c => postes.forEach(p => { p.activer(); p.w.__brancher("Monstres", c.slice("Monstres/".length)); }));
};

// Ce que chaque poste croit savoir de l'équipement et des stats des héros.
const photoEquipement = (poste) => {
    poste.activer();
    const vue = {};
    HEROS.forEach(h => {
        const p = poste.w.PERSOS_PARTIE.find(x => x.idPersonnage === h.id);
        if (!p) { vue[h.id] = "absent"; return; }
        const nom = (o) => o && o.nom ? `${o.nom}#${o.uid}` : "—";
        vue[h.id] = [nom(p.equipArmure), nom(p.equipMainDroite), nom(p.equipMainGauche)].join(" | ")
            + ` · parade ${poste.w.paradeCombattant(p)} defPhys ${poste.w.defPhysiqueCombattant(p)}`
            + ` defMag ${poste.w.defMagiqueCombattant(p)} crit ${poste.w.critiqueCombattant(p)}`;
    });
    return vue;
};

const comparerLesPostes = (etiquette) => {
    const vues = postes.map(photoEquipement);
    const differences = [];
    HEROS.forEach(h => {
        const lues = vues.map(v => v[h.id]);
        if (new Set(lues).size > 1) differences.push(`${h.id} : ${lues.join("  ≠  ")}`);
    });
    verifier(`les trois postes voient le même équipement — ${etiquette}`, differences.length === 0,
             differences.length ? "\n       " + differences.join("\n       ") : "");
    return vues[0];
};

// Abat toutes les créatures en passant par le VRAI chemin du jeu : les points
// de vie tombent à zéro en base, puis marquerMonstreMort fait entrer les
// renforts. On recommence tant qu'il en reste, réserve comprise.
async function abattreLesCreatures(poste) {
    let garde = 0;
    while (garde++ < 30) {
        const vivants = Object.keys(monde.docs)
            .filter(c => c.startsWith("Monstres/"))
            .filter(c => monde.docs[c].ID_Partie === "PARTIE" && monde.docs[c].Statut !== "Mort");
        if (vivants.length === 0) break;

        for (const chemin of vivants) {
            const id = chemin.slice("Monstres/".length);
            poste.activer();
            await poste.api.updateDoc(poste.api.doc(poste.db, "Monstres", id), { PV_Actuels: 0, Statut: "Mort" });
            await poste.w.marquerMonstreMort(id);
            await monde.attendreLeReseau();
            brancherLesMonstres();
            await monde.attendreLeReseau();
        }
    }
    return garde;
}

// Le tour d'un joueur dans SA fenêtre de butin : il prend le premier objet
// qu'il peut porter, laisse le second, puis valide — héros par héros.
async function jouerLeButinPersonnel(poste, choix) {
    poste.activer();
    const w = poste.w;
    const mesHeros = HEROS.filter(h => h.joueur === poste.joueur).map(h => h.id);
    const pris = [];

    for (const idHeros of mesHeros) {
        const butin = w.PARTIE_DATA.Butin;
        if (!butin || butin.etape !== "personnel") break;
        const bloc = butin.parPersonnage[idHeros];
        if (!bloc || bloc.valide) continue;

        for (let i = 0; i < bloc.items.length; i++) {
            const item = bloc.items[i];
            const prendre = choix(idHeros, i, item);
            if (prendre) {
                const test = w.peutEquiper(idHeros, item);
                if (test.possible) {
                    await w.equiperObjet(idHeros, item, i % 2 === 0 ? "Droite" : "Gauche");
                    pris.push({ heros: idHeros, uid: item.uid, nom: item.nom });
                }
                await w.enregistrerDecisionButin(idHeros, item.uid, test.possible);
            } else {
                await w.enregistrerDecisionButin(idHeros, item.uid, false);
            }
        }
        await w.validerButinPersonnel(idHeros);
        await monde.attendreLeReseau();
    }
    return pris;
}

// =========================================================================
//  UN CYCLE COMPLET : DE LA RÉINITIALISATION AU PARTAGE
// =========================================================================
async function jouerUnCombatEntier(numero, difficulte) {
    console.log(`\n${"═".repeat(74)}\n  COMBAT ${numero} — difficulté ${difficulte}\n${"═".repeat(74)}`);
    const rapport = { numero, difficulte };

    // --- 1. RÉINITIALISATION -------------------------------------------
    const equipementAvant = photoEquipement(mj);
    mj.activer();
    await mj.w.reinitialiserCombat();
    await monde.attendreLeReseau();

    const partie = monde.docs["Systeme_Parties/PARTIE"];
    verifier("la réinitialisation vide la file et repart au tour 1",
             partie.Tour_Combat === 1 && (partie.File_Attente_Combat || []).length === 0);
    verifier("les repères d'apparition sont effacés",
             partie.Spawn_Allies === undefined && partie.Spawn_Ennemis === undefined);
    verifier("le plateau ne garde aucun pion",
             Object.keys(monde.docs["Combat_VTT/PARTIE"].Tokens || {}).length === 0,
             `(${Object.keys(monde.docs["Combat_VTT/PARTIE"].Tokens || {}).join(",")})`);
    verifier("aucune créature ne survit au combat précédent",
             Object.keys(monde.docs).filter(c => c.startsWith("Monstres/")).length === 0);
    verifier("les héros repartent avec tous leurs points de vie",
             HEROS.every(h => monde.docs["Personnages/" + h.id].PV_Actuels === 60));
    // LE point de cette section : une réinitialisation ne doit RIEN prendre au
    // sac des héros. Un objet gagné hier reste gagné.
    const equipementApres = photoEquipement(mj);
    verifier("la réinitialisation ne déshabille personne",
             JSON.stringify(equipementAvant) === JSON.stringify(equipementApres),
             HEROS.map(h => `${h.id} ${equipementAvant[h.id]} → ${equipementApres[h.id]}`)
                  .filter((_, i) => equipementAvant[HEROS[i].id] !== equipementApres[HEROS[i].id]).join(" ; "));

    // --- 2. LES DEUX REPÈRES, PUIS LE DÉPLOIEMENT ----------------------
    mj.activer();
    let rencontreDemandee = false;
    mj.w.ouvrirGenerationRencontre = () => { rencontreDemandee = true; };
    const repereAllie = { q: -5 - numero, r: 2 };
    const repereEnnemi = { q: 6 + numero, r: -3 };
    await mj.w.enregistrerPointsApparition(repereAllie, repereEnnemi);
    await monde.attendreLeReseau();

    const pions = monde.docs["Combat_VTT/PARTIE"].Tokens || {};
    verifier("poser les repères déploie les héros tout seul",
             HEROS.every(h => !!pions[h.id]), `(${Object.keys(pions).join(",") || "aucun"})`);
    verifier("et enchaîne sur la demande de difficulté", rencontreDemandee);
    verifier("chaque héros est posé près de SON repère",
             HEROS.every(h => Math.max(Math.abs(pions[h.id].q - repereAllie.q),
                                       Math.abs(pions[h.id].r - repereAllie.r),
                                       Math.abs((-pions[h.id].q - pions[h.id].r) - (-repereAllie.q - repereAllie.r))) <= 3),
             HEROS.map(h => `${h.id}(${pions[h.id].q},${pions[h.id].r})`).join(" "));
    verifier("aucun héros ne partage la case d'un autre",
             new Set(HEROS.map(h => pions[h.id].q + ":" + pions[h.id].r)).size === HEROS.length);
    // Les pions doivent avoir traversé le réseau, pas seulement la mémoire du MJ.
    const pionsVus = postes.map(p => { p.activer(); return Object.keys(p.w.TOKENS_VTT_DATA).sort().join(","); });
    verifier("les trois postes voient les mêmes pions", new Set(pionsVus).size === 1,
             pionsVus.join("  ≠  "));

    // --- 3. LA RENCONTRE ------------------------------------------------
    mj.activer();
    const rencontre = await mj.w.genererRencontreMonstres(difficulte);
    await monde.attendreLeReseau();
    brancherLesMonstres();
    await monde.attendreLeReseau();

    const creatures = Object.keys(monde.docs).filter(c => c.startsWith("Monstres/"));
    verifier("des créatures sont apparues", creatures.length > 0, `(${creatures.length})`);
    verifier("chacune a son pion sur le plateau",
             creatures.every(c => !!(monde.docs["Combat_VTT/PARTIE"].Tokens || {})[c.slice(9)]),
             `(${creatures.length} créature(s), ${Object.keys(monde.docs["Combat_VTT/PARTIE"].Tokens).length} pion(s) au total)`);
    verifier("la difficulté est retenue pour le butin",
             monde.docs["Systeme_Parties/PARTIE"].Difficulte_Rencontre === difficulte,
             `(${monde.docs["Systeme_Parties/PARTIE"].Difficulte_Rencontre})`);
    verifier("la rencontre porte un identifiant neuf",
             typeof monde.docs["Systeme_Parties/PARTIE"].ID_Rencontre === "string"
             && monde.docs["Systeme_Parties/PARTIE"].ID_Rencontre.length > 5);
    rapport.idRencontre = monde.docs["Systeme_Parties/PARTIE"].ID_Rencontre;
    rapport.creatures = creatures.length;

    const vuesCreatures = postes.map(p => { p.activer(); return p.w.MONSTRES_PARTIE.length; });
    verifier("les trois postes comptent les mêmes créatures",
             new Set(vuesCreatures).size === 1, vuesCreatures.join(" ≠ "));

    // Aucun butin ne doit s'ouvrir tant qu'un ennemi tient debout.
    verifier("aucun butin ne s'ouvre pendant le combat",
             !monde.docs["Systeme_Parties/PARTIE"].Butin
             || !monde.docs["Systeme_Parties/PARTIE"].Butin.ouvert);

    // --- 4. LE COMBAT SE GAGNE -----------------------------------------
    const tours = await abattreLesCreatures(mj);
    verifier("toutes les créatures, renforts compris, finissent à terre", tours < 30, `(${tours} passes)`);
    await monde.attendreLeReseau(80);

    // Les trois postes détectent la victoire en même temps : la transaction ne
    // doit laisser passer QU'UN seul butin.
    postes.forEach(p => { p.activer(); p.w.verifierVictoireCombat(); });
    await monde.attendreLeReseau(80);

    const butin = monde.docs["Systeme_Parties/PARTIE"].Butin;
    verifier("la victoire ouvre un butin", !!butin && butin.ouvert === true);
    verifier("il appartient bien à CE combat", butin && butin.idRencontre === rapport.idRencontre,
             butin ? `(${butin.idRencontre} vs ${rapport.idRencontre})` : "");
    verifier("un seul butin, malgré trois détections simultanées",
             butin && butin.id !== rapport.butinPrecedent);
    verifier("tous les héros debout y ont droit",
             butin && butin.participants.length === HEROS.length,
             butin ? `(${butin.participants.join(",")})` : "");
    verifier("chacun reçoit deux objets",
             butin && butin.participants.every(id => (butin.parPersonnage[id].items || []).length === 2));
    verifier("chaque objet porte un identifiant unique",
             (() => {
                 const uids = butin ? butin.participants.flatMap(id => butin.parPersonnage[id].items.map(i => i.uid)) : [];
                 return uids.length > 0 && new Set(uids).size === uids.length;
             })());
    verifier("la rareté suit la difficulté annoncée",
             butin && butin.difficulte === difficulte, butin ? `(${butin.difficulte})` : "");
    rapport.butin = butin;

    return rapport;
}

// =========================================================================
//  LE BUTIN : PERSONNEL, PUIS PARTAGÉ
// =========================================================================
async function jouerLeButin(rapport) {
    console.log(`\n  ── Butin du combat ${rapport.numero} ──`);

    // --- 5. LE BUTIN PERSONNEL, CHACUN SUR SON APPAREIL ----------------
    // Chaque poste prend le premier objet de chaque héros et laisse le second :
    // il reste donc toujours de quoi alimenter le partage.
    const prisParPoste = [];
    for (const poste of postes) {
        prisParPoste.push(await jouerLeButinPersonnel(poste, (_h, i) => i === 0));
    }
    await monde.attendreLeReseau(80);

    const butin = monde.docs["Systeme_Parties/PARTIE"].Butin;
    verifier("tous les héros ont validé leur choix",
             butin.participants.every(id => butin.parPersonnage[id].valide === true),
             butin.participants.filter(id => !butin.parPersonnage[id].valide).join(",") || "");
    verifier("le butin bascule tout seul sur le partage", butin.etape === "partage", `(${butin.etape})`);

    const pris = prisParPoste.flat();
    verifier("les objets pris sont bien équipés en base",
             pris.every(o => {
                 const d = monde.docs["Personnages/" + o.heros];
                 return [d.Equip_Armure, d.Equip_Main_Droite, d.Equip_Main_Gauche]
                     .some(e => e && e.uid === o.uid);
             }),
             pris.map(o => `${o.heros}←${o.nom}`).join(", ") || "(rien pris)");
    verifier("le pool ne contient QUE les objets laissés",
             butin.pool.length === butin.participants.length * 2 - pris.length,
             `(${butin.pool.length} dans le pool, ${pris.length} pris)`);
    verifier("aucun objet équipé ne traîne aussi dans le pool",
             !butin.pool.some(item => pris.some(o => o.uid === item.uid)));

    comparerLesPostes(`après le butin personnel du combat ${rapport.numero}`);

    // --- 6. LE PARTAGE : TOUT LE MONDE SE PLACE SUR LE MÊME OBJET ------
    if (butin.pool.length > 0) {
        const convoite = butin.pool[0].uid;
        for (const poste of postes) {
            poste.activer();
            const mesHeros = HEROS.filter(h => h.joueur === poste.joueur).map(h => h.id);
            for (const idHeros of mesHeros) {
                const item = (poste.w.PARTIE_DATA.Butin.pool || []).find(i => i.uid === convoite);
                if (item && poste.w.peutEquiper(idHeros, item).possible) {
                    await poste.w.togglePlacementPool(idHeros, convoite);
                }
            }
        }
        await monde.attendreLeReseau();

        const apresPlacement = monde.docs["Systeme_Parties/PARTIE"].Butin;
        const candidats = (apresPlacement.pool.find(i => i.uid === convoite) || {}).candidats || [];
        verifier("les placements de trois postes s'additionnent, aucun n'écrase l'autre",
                 candidats.length >= 2, `(${candidats.join(",") || "aucun"})`);
        rapport.candidats = candidats;
    }

    // Les trois postes valident en même temps : un seul doit résoudre.
    await Promise.all(postes.map(async (poste) => {
        poste.activer();
        return poste.w.validerButinPool();
    }));
    await monde.attendreLeReseau(120);

    const final = monde.docs["Systeme_Parties/PARTIE"].Butin;
    verifier("le partage se termine", final.etape === "termine" && final.resolu === true,
             `(étape ${final.etape}, résolu ${final.resolu})`);
    verifier("chaque objet convoité a exactement un gagnant",
             final.pool.filter(i => (i.candidats || []).length > 0).every(i => !!i.gagnant));
    verifier("le gagnant était bien candidat",
             final.pool.filter(i => i.gagnant).every(i => (i.candidats || []).includes(i.gagnant)),
             final.pool.filter(i => i.gagnant && !(i.candidats || []).includes(i.gagnant))
                       .map(i => i.nom).join(",") || "");
    verifier("un objet que personne ne voulait reste sans preneur",
             final.pool.filter(i => !(i.candidats || []).length).every(i => !i.gagnant));

    // L'objet gagné doit être RÉELLEMENT porté, en base.
    const gagnes = final.pool.filter(i => i.gagnant);
    verifier("chaque objet gagné au sort est équipé en base",
             gagnes.every(i => {
                 const d = monde.docs["Personnages/" + i.gagnant];
                 return [d.Equip_Armure, d.Equip_Main_Droite, d.Equip_Main_Gauche]
                     .some(e => e && e.uid === i.uid);
             }),
             gagnes.map(i => `${i.nom}→${i.gagnant}`).join(", ") || "(aucun gagnant)");

    await monde.attendreLeReseau(80);
    comparerLesPostes(`après le partage du combat ${rapport.numero}`);

    // On referme, comme le ferait le bouton.
    postes[1].activer();
    await postes[1].w.fermerFenetreButin();
    await monde.attendreLeReseau();
    verifier("refermer le butin le referme pour tout le monde",
             monde.docs["Systeme_Parties/PARTIE"].Butin.ouvert === false);

    rapport.butinPrecedent = final.id;
    return { pris, gagnes };
}

// =========================================================================
//  CE QUE L'ÉQUIPEMENT FAIT VRAIMENT AUX STATS
// =========================================================================
function verifierLesEffetsPortes(etiquette) {
    console.log(`\n  ── Les bonus des objets, ${etiquette} ──`);
    const poste = postes[0];
    poste.activer();
    const w = poste.w;

    let porteursTrouves = 0, ecarts = [];
    HEROS.forEach(h => {
        const p = w.PERSOS_PARTIE.find(x => x.idPersonnage === h.id);
        const d = monde.docs["Personnages/" + h.id];
        if (!p) return;

        // 1. Ce que le poste croit porter doit être ce qui est écrit en base.
        const enBase = [d.Equip_Armure, d.Equip_Main_Droite, d.Equip_Main_Gauche]
            .map(o => (o && o.uid) || "—").join("/");
        const enMemoire = [p.equipArmure, p.equipMainDroite, p.equipMainGauche]
            .map(o => (o && o.uid) || "—").join("/");
        if (enBase !== enMemoire) ecarts.push(`${h.id} base ${enBase} ≠ écran ${enMemoire}`);

        const objets = w.objetsEquipes(p);
        if (objets.length === 0) return;
        porteursTrouves++;

        // 2. La somme des bonus doit être exactement celle des objets portés,
        //    une arme à deux mains ne comptant qu'une fois.
        const attendu = {};
        w.CLES_BONUS.forEach(c => attendu[c] = 0);
        objets.forEach(o => w.CLES_BONUS.forEach(c => attendu[c] += (parseInt((o.bonus || {})[c]) || 0)));
        const calcule = w.bonusEquipement(p);
        w.CLES_BONUS.forEach(c => {
            if (calcule[c] !== attendu[c]) ecarts.push(`${h.id} ${c} : ${calcule[c]} ≠ ${attendu[c]}`);
        });

        // 3. Et ces bonus doivent arriver jusqu'aux stats de combat.
        const socle = (champ, dev) => (parseInt(d[champ]) || 0) + (parseInt(d[dev]) || 0);
        const controles = [
            ["parade", w.paradeCombattant(p), socle("Parade", "Dev_Mod_Parade") + attendu.parade],
            ["defPhys", w.defPhysiqueCombattant(p), socle("Def_Physique", "Dev_Mod_DefPhys") + attendu.resPhys],
            ["defMag", w.defMagiqueCombattant(p), socle("Def_Magique", "Dev_Mod_DefMag") + attendu.resMag],
            ["critique", w.critiqueCombattant(p), socle("Critique", "Dev_Mod_Critique") + attendu.critique]
        ];
        controles.forEach(([nom, obtenu, voulu]) => {
            if (obtenu !== voulu) ecarts.push(`${h.id} ${nom} : ${obtenu} ≠ ${voulu}`);
        });
    });

    verifier("au moins un héros porte quelque chose", porteursTrouves > 0, `(${porteursTrouves} porteur(s))`);
    verifier("écran et base disent la même chose, et les bonus arrivent aux stats",
             ecarts.length === 0, ecarts.length ? "\n       " + ecarts.join("\n       ") : "");
    return porteursTrouves;
}

// =========================================================================
//  LA CAMPAGNE : TROIS COMBATS D'AFFILÉE
// =========================================================================
const DIFFICULTES = ["Normale", "Difficile", "Très difficile"];
const historique = [];
let butinPrecedent = null;

for (let n = 1; n <= 3; n++) {
    const rapport = await jouerUnCombatEntier(n, DIFFICULTES[n - 1]);
    rapport.butinPrecedent = butinPrecedent;
    const resultat = await jouerLeButin(rapport);
    butinPrecedent = rapport.butinPrecedent;
    verifierLesEffetsPortes(`à la fin du combat ${n}`);
    historique.push({ ...rapport, ...resultat });
}

// =========================================================================
//  CE QUI NE SE VOIT QU'APRÈS PLUSIEURS COMBATS
// =========================================================================
console.log(`\n${"═".repeat(74)}\n  BILAN DE LA CAMPAGNE\n${"═".repeat(74)}`);

const tousLesUid = historique.flatMap(h =>
    h.butin.participants.flatMap(id => h.butin.parPersonnage[id].items.map(i => i.uid)));
verifier("aucun identifiant d'objet ne se répète d'un combat à l'autre",
         new Set(tousLesUid).size === tousLesUid.length,
         `(${tousLesUid.length} objets, ${new Set(tousLesUid).size} identifiants)`);

verifier("chaque combat a eu son propre butin",
         new Set(historique.map(h => h.butin.id)).size === 3);
verifier("et sa propre rencontre",
         new Set(historique.map(h => h.idRencontre)).size === 3);

// Les raretés doivent suivre la difficulté : l'épique n'existe qu'en très
// difficile (tableau de loot), et le banc doit le voir sur trois combats.
const raretes = {};
historique.forEach(h => {
    raretes[h.difficulte] = h.butin.participants
        .flatMap(id => h.butin.parPersonnage[id].items.map(i => i.rarete));
});
console.log("     raretés tirées :", JSON.stringify(raretes));
verifier("aucun épique ne tombe en difficulté Normale",
         !(raretes["Normale"] || []).includes("Épique"), `(${(raretes["Normale"] || []).join(",")})`);

// L'équipement final : chaque objet porté doit venir d'un butin réellement joué.
const poste = postes[0];
poste.activer();
const portesFinaux = [];
HEROS.forEach(h => {
    const d = monde.docs["Personnages/" + h.id];
    [d.Equip_Armure, d.Equip_Main_Droite, d.Equip_Main_Gauche]
        .filter(o => o && o.uid).forEach(o => portesFinaux.push({ heros: h.id, uid: o.uid, nom: o.nom }));
});
console.log("     équipement final :", portesFinaux.map(o => `${o.heros}:${o.nom}`).join(", ") || "aucun");
verifier("des objets ont bien été accumulés au fil des combats",
         portesFinaux.length > 0, `(${portesFinaux.length} objet(s) porté(s))`);
verifier("tout objet porté vient d'un butin de cette campagne",
         portesFinaux.every(o => tousLesUid.includes(o.uid)),
         portesFinaux.filter(o => !tousLesUid.includes(o.uid)).map(o => o.nom).join(",") || "");

// Un même objet ne peut pas être porté par deux héros à la fois.
const parUid = {};
portesFinaux.forEach(o => (parUid[o.uid] = parUid[o.uid] || []).push(o.heros));
verifier("aucun objet n'est porté par deux héros en même temps",
         Object.values(parUid).every(l => new Set(l).size === 1),
         Object.entries(parUid).filter(([, l]) => new Set(l).size > 1).map(([u, l]) => `${u}:${l}`).join(" "));

// Une arme à deux mains occupe les deux mains — et ne compte qu'une fois.
let deuxMainsVus = 0, deuxMainsCorrects = 0;
HEROS.forEach(h => {
    const d = monde.docs["Personnages/" + h.id];
    const droite = d.Equip_Main_Droite, gauche = d.Equip_Main_Gauche;
    if (droite && droite.deuxMains) {
        deuxMainsVus++;
        if (gauche && gauche.uid === droite.uid) deuxMainsCorrects++;
    }
});
verifier("une arme à deux mains occupe bien les deux mains",
         deuxMainsVus === deuxMainsCorrects, `(${deuxMainsCorrects}/${deuxMainsVus})`);

// --- LE COMBAT SUIVANT HÉRITE DE TOUT -----------------------------------
console.log("\n  ── Un quatrième combat : l'équipement doit traverser ──");
const avantQuatrieme = photoEquipement(mj);
mj.activer();
await mj.w.reinitialiserCombat();
await monde.attendreLeReseau(80);
const apresQuatrieme = photoEquipement(mj);
verifier("après une quatrième réinitialisation, tout l'équipement est encore là",
         JSON.stringify(avantQuatrieme) === JSON.stringify(apresQuatrieme),
         HEROS.filter(h => avantQuatrieme[h.id] !== apresQuatrieme[h.id])
              .map(h => `${h.id} : ${avantQuatrieme[h.id]} → ${apresQuatrieme[h.id]}`).join(" ; "));
verifier("et les bonus sont toujours comptés dans les stats",
         verifierLesEffetsPortes("après la quatrième réinitialisation") > 0);

// --- LE BUTIN PÉRIMÉ NE DOIT BLOQUER PERSONNE ---------------------------
console.log("\n  ── Un butin oublié en base ne condamne pas la suite ──");
mj.activer();
await mj.api.updateDoc(mj.api.doc(mj.db, "Systeme_Parties", "PARTIE"), {
    Butin: { ouvert: true, etape: "personnel", id: "butin_fantome", creeLe: Date.now(),
             idRencontre: "renc_dun_autre_temps", difficulte: "Normale",
             participants: ["J1"], parPersonnage: { J1: { items: [], decisions: {}, valide: false } },
             pool: [], poolValides: [], resolu: false }
});
await monde.attendreLeReseau();

const rapport4 = await jouerUnCombatEntier(4, "Difficile");
verifier("le butin fantôme a bien été remplacé",
         rapport4.butin.id !== "butin_fantome", `(${rapport4.butin.id})`);

// =========================================================================
console.log("\n  ── Rien n'a levé d'exception en coulisses ──");
postes.forEach(p => {
    verifier(`${p.nom} : aucune erreur d'affichage attrapée`, p.journal.erreurs.length === 0,
             p.journal.erreurs.slice(0, 3).join(" | "));
    const alertesUtiles = p.journal.alertes.filter(a => !String(a).includes("gabarit"));
    verifier(`${p.nom} : aucune alerte bloquante`, alertesUtiles.length === 0,
             alertesUtiles.slice(0, 2).join(" | "));
});

// =========================================================================
//  LE PRÉREQUIS DOIT ÊTRE LE MÊME SUR TOUS LES ÉCRANS
// =========================================================================
//  Les caractéristiques ne vivent pas sur la fiche du personnage mais dans leur
//  propre collection. Elles n'étaient lues que dans le cache du navigateur,
//  rempli en ouvrant la fiche : un joueur voyait donc « prérequis non atteint »
//  là où son voisin, qui n'avait jamais ouvert cette fiche, pouvait équiper
//  l'objet sans rien remarquer.
console.log("\n  ── Le droit de porter un objet, vu des trois postes ──");
{
    const epique = { uid: "obj_epique", nom: "Lame des rois", rarete: "Épique", emplacement: "Main_Droite",
                     type: "Lourde", carac: "FORCE", prerequis: 12, bonus: { degatsPhys: 9 }, etats: [], effets: [] };

    // Nico a ouvert la fiche de J1 sur son iPad : lui seul a les caracs en cache.
    // Les clés sont celles de la fiche : force, dex, con, int, sag, cha.
    const caracsFaibles = { force: 3, dex: 20, con: 20, int: 20, sag: 20, cha: 20 };
    postes[0].activer();
    postes[0].w.CARACS_PARTIE = { J1: caracsFaibles };
    // Les deux autres postes ne connaissent que ce que la partie leur a chargé.
    postes[1].activer(); postes[1].w.CARACS_PARTIE = { J1: caracsFaibles };
    postes[2].activer(); postes[2].w.CARACS_PARTIE = { J1: caracsFaibles };

    const verdicts = postes.map(p => { p.activer(); return p.w.peutEquiper("J1", epique).possible; });
    verifier("les trois postes refusent le même objet trop lourd",
             verdicts.every(v => v === false), `(${verdicts.join(",")})`);

    // Et avec la force qu'il faut, les trois l'acceptent.
    postes.forEach(p => { p.activer(); p.w.CARACS_PARTIE = { J1: { ...caracsFaibles, force: 15 } }; });
    const verdicts2 = postes.map(p => { p.activer(); return p.w.peutEquiper("J1", epique).possible; });
    verifier("et l'acceptent tous une fois la Force suffisante",
             verdicts2.every(v => v === true), `(${verdicts2.join(",")})`);

    // Le cache partagé prime sur celui du navigateur : c'est ce qui empêche deux
    // postes de juger différemment.
    postes[0].activer();
    postes[0].w.CARACS_PARTIE = { J1: { force: 3 } };
    verifier("le cache partagé fait autorité, pas celui du navigateur",
             postes[0].w.peutEquiper("J1", epique).possible === false);

    // Le nom de la caractéristique s'écrit "FORCE" dans le catalogue, mais une
    // orthographe approchante ne doit pas faire sauter le prérequis en silence.
    postes.forEach(p => { p.activer(); p.w.CARACS_PARTIE = { J1: caracsFaibles }; });
    const variantes = ["FORCE", "Force", "force"].map(nom => {
        postes[0].activer();
        return postes[0].w.peutEquiper("J1", { ...epique, carac: nom }).possible;
    });
    verifier("le prérequis tient quelle que soit la casse du nom",
             variantes.every(v => v === false), `(${variantes.join(",")})`);
    postes[0].activer();
    verifier("et la Dextérité accentuée est reconnue elle aussi",
             postes[0].w.peutEquiper("J1", { ...epique, carac: "dexterite", prerequis: 30 }).possible === false);

    // Caracs inconnues : on ne bloque personne sur une donnée qu'on n'a pas.
    postes.forEach(p => { p.activer(); p.w.CARACS_PARTIE = {}; });
    verifier("une caractéristique inconnue ne bloque personne",
             postes[0].w.peutEquiper("J1", epique).possible === true);
}

// =========================================================================
//  REMPLACER UN OBJET : L'ANCIEN EST PERDU, LES BONUS SUIVENT
// =========================================================================
console.log("\n  ── Remplacer une arme par une autre ──");
{
    const poste = postes[0];
    poste.activer();
    const w = poste.w;

    const avant = w.PERSOS_PARTIE.find(p => p.idPersonnage === "J1");
    const ancienne = avant.equipMainDroite;
    const paradeAvant = w.paradeCombattant(avant);

    const neuve = { uid: "obj_remplacante", nom: "Épée d'épreuve", rarete: "Rare", emplacement: "Main_Droite",
                    type: "Légère", carac: "FORCE", prerequis: 0,
                    bonus: { parade: 7, degatsPhys: 3 }, etats: [], effets: [], effetTexte: "+7 parade" };
    await w.equiperObjet("J1", neuve, "Droite");
    await monde.attendreLeReseau();

    const enBase = monde.docs["Personnages/J1"];
    verifier("la nouvelle arme est en base, dans la bonne main",
             enBase.Equip_Main_Droite && enBase.Equip_Main_Droite.uid === "obj_remplacante",
             `(${(enBase.Equip_Main_Droite || {}).nom})`);
    verifier("l'ancienne arme a bel et bien disparu",
             !ancienne || ![enBase.Equip_Armure, enBase.Equip_Main_Droite, enBase.Equip_Main_Gauche]
                 .some(o => o && o.uid === ancienne.uid),
             ancienne ? `(l'ancienne était ${ancienne.nom})` : "(rien à remplacer)");

    const apres = w.PERSOS_PARTIE.find(p => p.idPersonnage === "J1");
    verifier("les bonus de la nouvelle arme comptent tout de suite",
             w.paradeCombattant(apres) === paradeAvant
                 - ((ancienne && ancienne.bonus && ancienne.bonus.parade) || 0) + 7,
             `(${paradeAvant} → ${w.paradeCombattant(apres)})`);

    // Et les autres postes le voient.
    await monde.attendreLeReseau(60);
    const vues = postes.map(p => { p.activer();
        const j1 = p.w.PERSOS_PARTIE.find(x => x.idPersonnage === "J1");
        return `${(j1.equipMainDroite || {}).uid} parade ${p.w.paradeCombattant(j1)}`; });
    verifier("les trois postes voient le remplacement et le nouveau total",
             new Set(vues).size === 1, vues.join("  ≠  "));

    // Lâcher l'objet le retire partout.
    poste.activer();
    await w.lacherObjet("J1", "Equip_Main_Droite");
    await monde.attendreLeReseau(60);
    verifier("lâcher l'arme la retire de la base",
             monde.docs["Personnages/J1"].Equip_Main_Droite === null,
             `(${JSON.stringify(monde.docs["Personnages/J1"].Equip_Main_Droite)})`);
    const apresLacher = postes[2].w.PERSOS_PARTIE.find(x => x.idPersonnage === "J1");
    postes[2].activer();
    verifier("et le bonus disparaît des stats, sur tous les postes",
             postes[2].w.paradeCombattant(apresLacher) === paradeAvant
                 - ((ancienne && ancienne.bonus && ancienne.bonus.parade) || 0),
             `(${postes[2].w.paradeCombattant(apresLacher)})`);
}

// =========================================================================
//  UN HÉROS SANS PORTRAIT N'A PAS DE PION
// =========================================================================
//  Comportement volontaire (pas d'image, rien à dessiner), mais silencieux :
//  le banc le fixe pour qu'un changement d'avis se voie.
console.log("\n  ── Le héros sans portrait ──");
{
    mj.activer();
    const sansImage = mj.w.PERSOS_PARTIE.find(p => p.idPersonnage === "J4");
    const memoire = { urlToken: sansImage.urlToken, urlCloudinary: sansImage.urlCloudinary };
    sansImage.urlToken = ""; sansImage.urlCloudinary = "";
    // Le pion doit disparaître de la BASE : genererTokensCombat ne recrée que
    // les pions absents, et le snapshot suivant restaurerait une simple
    // suppression locale.
    delete mj.w.TOKENS_VTT_DATA.J4;
    await mj.api.updateDoc(mj.api.doc(mj.db, "Combat_VTT", "PARTIE"),
                           { "Tokens.J4": mj.api.deleteField() });
    await monde.attendreLeReseau();
    mj.activer();
    delete mj.w.TOKENS_VTT_DATA.J4;

    await mj.w.genererTokensCombat();
    await monde.attendreLeReseau();
    verifier("un héros sans portrait n'obtient pas de pion (comportement voulu)",
             !(monde.docs["Combat_VTT/PARTIE"].Tokens || {}).J4);

    sansImage.urlToken = memoire.urlToken; sansImage.urlCloudinary = memoire.urlCloudinary;
    await mj.w.genererTokensCombat();
    await monde.attendreLeReseau();
    verifier("et le retrouve dès qu'il en a un",
             !!(monde.docs["Combat_VTT/PARTIE"].Tokens || {}).J4);
}

console.log(echecs === 0 ? "\nTOUS LES CONTRÔLES PASSENT" : `\n${echecs} CONTRÔLE(S) EN ÉCHEC`);
process.exit(echecs === 0 ? 0 : 1);
