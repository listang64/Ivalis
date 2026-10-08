// =========================================================================
//  IVALIS — LA TABLE DES BLESSURES
// =========================================================================
//  La table de Nico (Table_des_blessures.xlsx). Un héros joueur encore à terre
//  quand le combat s'achève (victoire ou défaite) reçoit UNE blessure, avant
//  le butin. Un héros relevé pendant le combat n'en reçoit pas ; le
//  Profanateur debout grâce à son sursis non plus.
//
//  LE JET : 1d50. Les deux bouts de la table couvrent cinq faces chacun
//  (1-5 l'Égratignure, 46-50 la Mort) — ils tombent plus souvent que les
//  autres. Au jet, on RETRANCHE : le modificateur de Constitution (jamais
//  négatif), 5 pour le talent Chanceux, 7 pour un Veinard obtenu auparavant
//  (consommé). Le jet reste entre 1 et 50. Le 16 a deux blessures : une pièce
//  décide. La Commotion cérébrale sévère relance avec +4, l'Estropié total
//  relance : la seconde blessure s'AJOUTE à la première.
//
//  LES DURÉES : « combats » se décompte à chaque fin de combat (victoire,
//  défaite, ou réinitialisation d'un combat non terminé) ; « jours » quand le
//  MJ avance le temps ; « soins » attend des soins avancés dans une grande
//  ville (bouton Soigner, onglet DEV) ; « définitif » ne s'en va jamais. Une
//  blessure peut cumuler (l'Épaule démise : sa seconde main pour un combat,
//  ses deux mains jusqu'aux soins).
//
//  CE QU'ELLES FONT passe par les atouts, comme la race, la classe et les
//  talents : window.atoutBlessures, fusionné dans atoutRace (app.js). Les
//  clés propres aux blessures sont lues là où leur mécanique se joue (voir
//  BLESSURES dans tests_monstres/LISEZ_MOI.md).
//
//  La fiche porte `Blessures` : [{ uid, id, combats?, jours?, soins?,
//  definitif?, cartes? }], `Mort_Definitive` pour un héros tombé pour de bon.
//  Script simple (pas un module) : les bancs le chargent tel quel.
// =========================================================================

(function () {
    const FACES = 50;
    const RETRAIT_CHANCEUX = 5;
    const RETRAIT_VEINARD = 7;

    // UNE LIGNE DE LA TABLE. `duree` : ce qui la fait disparaître ; `effet(inst)`
    // : ce qu'elle donne (des atouts), tant qu'elle est là.
    const TABLE = [
        { min: 1, max: 5, id: "BLE_EGRATIGNURE", nom: "Égratignure", texte: "Une simple éraflure cutanée. Aucun effet mécanique.",
          duree: { instant: true } },
        { min: 6, max: 6, id: "BLE_COUPURE_FINE", nom: "Coupure fine", texte: "Saigne légèrement mais se résorbe vite. Laisse une petite cicatrice sur le visage.",
          duree: { definitif: true }, cosmetique: true },
        { min: 7, max: 7, id: "BLE_LEVRE_FENDUE", nom: "Lèvre fendue", texte: "Articulation douloureuse. Léger malus lors des interactions sociales verbales : −2 aux jets de Charisme pendant 3 jours.",
          duree: { jours: 3 }, effet: () => ({ testsCarac: { cha: -2 } }) },
        { min: 8, max: 8, id: "BLE_COURBATURES", nom: "Courbatures extrêmes", texte: "Ne peut faire que 3 déplacements par tour lors du prochain combat.",
          duree: { combats: 1 }, effet: () => ({ maxCasesParTour: 3 }) },
        { min: 9, max: 9, id: "BLE_ESSOUFFLEMENT", nom: "Essoufflement profond", texte: "Au tout prochain combat, le personnage commence exceptionnellement avec 10 de fatigue en moins.",
          duree: { combats: 1 }, effet: () => ({ fatigueDebutCombat: -10 }) },
        { min: 10, max: 10, id: "BLE_COUP_VISAGE", nom: "Coup au visage", texte: "Un œil au beurre noir ou un nez gonflé. Rien de grave, mais les PNJ civils le remarqueront : −3 aux jets de Charisme pendant 3 jours.",
          duree: { jours: 3 }, effet: () => ({ testsCarac: { cha: -3 } }) },
        { min: 11, max: 11, id: "BLE_ENTAILLE_MUSCULAIRE", nom: "Entaille musculaire", texte: "Les muscles tirent : −1 dégât brut sur toutes les compétences de mêlée lors du prochain combat.",
          duree: { combats: 1 }, effet: () => ({ degatsMelee: -1 }) },
        { min: 12, max: 12, id: "BLE_COMMOTION_LEGERE", nom: "Commotion légère", texte: "Malus de −10 à l'initiative de base lors du prochain combat.",
          duree: { combats: 1 }, effet: () => ({ initiative: -10 }) },
        { min: 13, max: 13, id: "BLE_CHEVILLE_TORDUE", nom: "Cheville tordue", texte: "Double le coût des déplacements lors du prochain combat.",
          duree: { combats: 1 }, effet: () => ({ coutDeplacementMult: 2 }) },
        { min: 14, max: 14, id: "BLE_MAIN_ENDOLORIE", nom: "Main endolorie", texte: "Les articulations des doigts sont raides : les compétences magiques ou à distance coûtent 5 de fatigue de plus lors du prochain combat.",
          duree: { combats: 1 }, effet: () => ({ coutCarteMagieDistance: 5 }) },
        { min: 15, max: 15, id: "BLE_COTES_FELEES", nom: "Côtes fêlées", texte: "La respiration est douloureuse : le repos long rend 10 de fatigue en moins lors du prochain combat.",
          duree: { combats: 1 }, effet: () => ({ reposLongMoins: 10 }) },
        { min: 16, max: 16, id: "BLE_PLAIE_INFECTEE", nom: "Plaie infectée", texte: "La fièvre s'installe : les soins et les potions qu'on lui applique rendent 50 % de PV en moins durant les deux prochains combats.",
          duree: { combats: 2 }, effet: () => ({ soinsRecus: -50 }) },
        { min: 16, max: 16, id: "BLE_EPAULE_DEMISE", nom: "Épaule démise", texte: "L'articulation a sauté : impossible d'utiliser une arme à deux mains tant qu'on ne l'a pas remise en place, et impossible d'utiliser la deuxième main durant le prochain combat.",
          duree: { soins: true, combats: 1 },
          effet: (inst) => ({ interditDeuxMains: true, ...((inst && inst.combats > 0) ? { interditMainGauche: true } : {}) }) },
        { min: 17, max: 17, id: "BLE_GENOU_AFFAIBLI", nom: "Genou affaibli", texte: "Ne peut faire que 3 déplacements par tour lors des deux prochains combats.",
          duree: { combats: 2 }, effet: () => ({ maxCasesParTour: 3 }) },
        { min: 18, max: 18, id: "BLE_SAIGNEMENT_PERSISTANT", nom: "Saignement persistant", texte: "La plaie se rouvre à l'effort : au début de chacun des deux prochains combats, il perd 2 PV par tour pendant 3 rounds.",
          duree: { combats: 2 }, effet: () => ({ saignementDebut: { pv: 2, tours: 3 } }) },
        { min: 19, max: 19, id: "BLE_TENDON_TOUCHE", nom: "Tendon touché", texte: "Perte de souplesse : −4 aux jets de Dextérité pendant 10 jours.",
          duree: { jours: 10 }, effet: () => ({ testsCarac: { dex: -4 } }) },
        { min: 20, max: 20, id: "BLE_DECHIRURE_MUSCULAIRE", nom: "Déchirure musculaire", texte: "Son maximum de PV est réduit de 20 % tant qu'il n'a pas reçu de soins médicaux avancés dans une grande ville.",
          duree: { soins: true }, effet: () => ({ pvMaxPct: -20 }) },
        { min: 21, max: 21, id: "BLE_TYMPAN_CREVE", nom: "Tympan crevé", texte: "Surdité partielle d'une oreille : −5 aux jets de Sagesse (perception), définitivement.",
          duree: { definitif: true }, effet: () => ({ testsCarac: { sag: -5 } }) },
        { min: 22, max: 22, id: "BLE_POIGNET_FRACTURE", nom: "Poignet fracturé", texte: "Impossible d'équiper un bouclier ou une arme à deux mains (l'Art de la parade se tait) tant qu'il n'a pas reçu de soins médicaux avancés dans une grande ville.",
          duree: { soins: true }, effet: () => ({ interditBouclier: true, interditDeuxMains: true }) },
        { min: 23, max: 23, id: "BLE_CHOC_CRANIEN", nom: "Choc crânien (Amnésie)", texte: "Le contrecoup a été violent : le personnage « oublie » comment utiliser deux de ses compétences durant les deux prochains combats.",
          duree: { combats: 2 }, oublieCartes: 2, effet: (inst) => ({ cartesOubliees: [...((inst && inst.cartes) || [])] }) },
        { min: 24, max: 24, id: "BLE_TRAUMATISME_OCULAIRE", nom: "Traumatisme oculaire", texte: "Vision floue : −20 % d'esquive durant les trois prochains combats.",
          duree: { combats: 3 }, effet: () => ({ esquive: -20 }) },
        { min: 25, max: 25, id: "BLE_BRULURE_ETENDUE", nom: "Brûlure superficielle étendue", texte: "Les cloques et les pansements interdisent le port d'une armure lourde ou moyenne tant qu'il n'a pas reçu de soins médicaux dans une grande ville.",
          duree: { soins: true }, effet: () => ({ interditArmureLourde: true }) },
        { min: 26, max: 26, id: "BLE_BRAS_FRACTURE", nom: "Bras fracturé", texte: "−2 dégâts au corps à corps durant les deux prochains combats.",
          duree: { combats: 2 }, effet: () => ({ degatsMelee: -2 }) },
        { min: 27, max: 27, id: "BLE_JAMBE_FRACTUREE", nom: "Jambe fracturée", texte: "Deux déplacements par tour au maximum durant les deux prochains combats.",
          duree: { combats: 2 }, effet: () => ({ maxCasesParTour: 2 }) },
        { min: 28, max: 28, id: "BLE_COMMOTION_SEVERE", nom: "Commotion cérébrale sévère", texte: "Relance sur la table des blessures avec +4 : la blessure qui suit s'ajoute.",
          duree: { instant: true }, relance: 4 },
        { min: 29, max: 29, id: "BLE_HEMORRAGIE_INTERNE", nom: "Hémorragie interne", texte: "Bouger aggrave la blessure : il perd 2 PV pour chaque hexagone traversé durant les deux prochains combats.",
          duree: { combats: 2 }, effet: () => ({ perteParCase: 2 }) },
        { min: 30, max: 30, id: "BLE_POUMON_PERFORE", nom: "Poumon perforé", texte: "Le souffle est court pour toujours : la jauge de fatigue est définitivement réduite de 10.",
          duree: { definitif: true }, effet: () => ({ fatigueMax: -10 }) },
        { min: 31, max: 31, id: "BLE_VEINARD", nom: "Veinard", texte: "Tu as eu de la chance : −7 sur ton prochain jet de blessure.",
          duree: { prochainJet: true } },
        { min: 32, max: 32, id: "BLE_MACHOIRE_FRACASSEE", nom: "Mâchoire fracassée", texte: "−5 aux jets de Charisme, définitivement.",
          duree: { definitif: true }, effet: () => ({ testsCarac: { cha: -5 } }) },
        { min: 33, max: 33, id: "BLE_AMPUTATION_DOIGTS", nom: "Amputation de doigt(s)", texte: "−1 de portée aux attaques à distance, définitivement.",
          duree: { definitif: true }, effet: () => ({ porteeDistance: -1 }) },
        { min: 34, max: 34, id: "BLE_OEIL_BORGNE", nom: "Œil borgne", texte: "Baisse l'esquive de 20 %, définitivement.",
          duree: { definitif: true }, effet: () => ({ esquive: -20 }) },
        { min: 35, max: 35, id: "BLE_DEFIGURATION", nom: "Défiguration", texte: "Cicatrices terrifiantes sur le visage : −7 aux jets de Charisme, définitivement.",
          duree: { definitif: true }, effet: () => ({ testsCarac: { cha: -7 } }) },
        { min: 36, max: 36, id: "BLE_LESION_ORGANE", nom: "Lésion d'un organe vital", texte: "Le métabolisme tourne au ralenti : le repos long en combat ne restaure plus que 15 % de fatigue.",
          duree: { definitif: true }, effet: () => ({ reposLongTaux: 15 }) },
        { min: 37, max: 37, id: "BLE_AMPUTATION_MAIN", nom: "Amputation d'une main", texte: "La main est perdue : le port d'équipements à deux mains devient impossible.",
          duree: { definitif: true }, effet: () => ({ interditDeuxMains: true }) },
        { min: 38, max: 38, id: "BLE_AMPUTATION_PIED", nom: "Amputation d'une partie du pied", texte: "Le personnage ne peut plus se déplacer de plus de 3 hexagones par tour, à vie.",
          duree: { definitif: true }, effet: () => ({ maxCasesParTour: 3 }) },
        { min: 39, max: 39, id: "BLE_AMPUTATION_BRAS", nom: "Amputation du bras entier", texte: "Impossible de tenir de l'équipement nécessitant deux mains.",
          duree: { definitif: true }, effet: () => ({ interditDeuxMains: true }) },
        { min: 40, max: 40, id: "BLE_CHOC_CARDIAQUE", nom: "Choc cardiaque (Fragilité)", texte: "Le personnage survit par miracle, mais sa jauge de fatigue est réduite de 50 % définitivement, et sa régénération est fixée à 30 de fatigue.",
          duree: { definitif: true }, effet: () => ({ fatigueMaxPct: -50, regenFixe: 30 }) },
        { min: 41, max: 41, id: "BLE_TRAUMATISME_CRANIEN", nom: "Traumatisme crânien profond", texte: "Le personnage survit mais reste inconscient pendant 3 mois. Le joueur doit utiliser un autre personnage en attendant.",
          duree: { jours: 90 }, indisponible: true },
        { min: 42, max: 42, id: "BLE_LESION_COLONNE", nom: "Lésion de la colonne vertébrale", texte: "Paralysie partielle : le mouvement sur la carte est strictement bloqué à 1 seul hexagone par round.",
          duree: { definitif: true }, effet: () => ({ maxCasesParTour: 1 }) },
        { min: 43, max: 43, id: "BLE_ESTROPIE_TOTAL", nom: "Estropié total", texte: "Combinaison de plusieurs fractures graves : 5 mois de convalescence absolue, incapable de combattre. Relance un jet de blessure.",
          duree: { jours: 150 }, indisponible: true, relance: 0 },
        { min: 44, max: 44, id: "BLE_MUTILATION_MULTIPLE", nom: "Mutilation multiple", texte: "Son maximum de PV est réduit de 40 % à vie.",
          duree: { definitif: true }, effet: () => ({ pvMaxPct: -40 }) },
        { min: 45, max: 45, id: "BLE_AGONIE_SURMONTEE", nom: "Agonie surmontée (Miraculé)", texte: "Le personnage frôle la mort de si près qu'il s'en sort avec une cicatrice interne : toutes ses caractéristiques de base perdent 3 points.",
          duree: { definitif: true }, effet: () => ({ caracs: { force: -3, dex: -3, con: -3, int: -3, sag: -3, cha: -3 } }) },
        { min: 46, max: 50, id: "BLE_MORT", nom: "Mort du personnage", texte: "La blessure est trop grave pour être refermée, le cœur s'arrête. Le héros succombe à ses blessures sur le champ de bataille.",
          duree: { mort: true } }
    ];

    window.TABLE_BLESSURES = TABLE;
    window.FACES_JET_BLESSURE = FACES;
    window.blessureParId = (id) => TABLE.find(b => b.id === id) || null;
    window.blessuresDuScore = (score) => TABLE.filter(b => score >= b.min && score <= b.max);

    const lireListe = (perso) => {
        const brut = perso && (perso.blessures || perso.Blessures);
        return Array.isArray(brut) ? brut.filter(b => b && window.blessureParId(b.id)) : [];
    };
    window.blessuresDuPerso = lireListe;
    window.estMortDefinitivement = (perso) => !!(perso && (perso.mortDefinitive || perso.Mort_Definitive));
    // Inconscient, en convalescence : il ne combat pas tant que les jours courent.
    window.estIndisponible = (perso) => lireListe(perso).some(b => (window.blessureParId(b.id) || {}).indisponible && (b.jours || 0) > 0);

    // --- LE JET ------------------------------------------------------------
    // Ce qu'on retranche : le modificateur de CON (jamais négatif), Chanceux,
    // un Veinard en attente.
    window.retraitsJetBlessure = function (perso) {
        const modCon = typeof window.modPourTalents === "function" ? window.modPourTalents(perso, "con")
            : Math.max(0, Math.floor(((parseInt(((perso || {}).caracs || {}).con) || 10) - 10) / 2));
        const chanceux = typeof window.talentsDuPerso === "function" && window.talentsDuPerso(perso).TAL_CHANCEUX ? RETRAIT_CHANCEUX : 0;
        const veinard = lireListe(perso).some(b => b.id === "BLE_VEINARD") ? RETRAIT_VEINARD : 0;
        return { modCon, chanceux, veinard, total: modCon + chanceux + veinard };
    };
    const borne = (n) => Math.max(1, Math.min(FACES, Math.round(n)));

    // Tirer les blessures d'un héros : la première, et celles des relances.
    // `alea()` rend un nombre dans [0, 1[ (Math.random en jeu, un dé fixé au
    // banc). Rend { tirages: [{ de, bonus, retraits, score, blessure }], veinardConsomme }.
    window.tirerBlessures = function (perso, alea) {
        const tirer = typeof alea === "function" ? alea : Math.random;
        const retraits = window.retraitsJetBlessure(perso);
        const tirages = [];
        let bonus = 0, garde = 0;
        // Le Veinard ne vaut que pour le prochain jet : le premier.
        let retrait = retraits.total;
        do {
            const de = 1 + Math.floor(tirer() * FACES);
            const score = borne(de + bonus - retrait);
            const possibles = window.blessuresDuScore(score);
            const blessure = possibles.length > 1 ? possibles[Math.floor(tirer() * possibles.length)] : possibles[0];
            tirages.push({ de, bonus, retraits: retrait, score, id: blessure.id });
            if (blessure.relance === undefined) break;
            bonus = blessure.relance;
            retrait = retraits.modCon + retraits.chanceux;
        } while (++garde < 4);
        return { tirages, veinardConsomme: retraits.veinard > 0 };
    };

    // Une blessure tirée devient une entrée de la fiche (ou rien : une
    // Égratignure, une Commotion sévère qui n'est qu'une relance).
    window.entreeBlessure = function (id, cartesDuDeck, alea) {
        const b = window.blessureParId(id);
        if (!b || b.duree.instant || b.duree.mort) return null;
        const tirer = typeof alea === "function" ? alea : Math.random;
        const e = { uid: "BL_" + Math.floor(tirer() * 1e9).toString(36) + "_" + Date.now().toString(36), id };
        if (b.duree.combats) e.combats = b.duree.combats;
        if (b.duree.jours) e.jours = b.duree.jours;
        if (b.duree.soins) e.soins = true;
        if (b.duree.definitif) e.definitif = true;
        if (b.duree.prochainJet) e.prochainJet = true;
        if (b.oublieCartes) {
            const pool = [...(cartesDuDeck || [])];
            const cartes = [];
            while (pool.length > 0 && cartes.length < b.oublieCartes) cartes.push(pool.splice(Math.floor(tirer() * pool.length), 1)[0]);
            e.cartes = cartes;
        }
        return e;
    };

    // --- LE TEMPS QUI PASSE -------------------------------------------------
    // Une blessure guérit quand plus rien ne la retient.
    const gueri = (e) => !e.definitif && !e.soins && !e.prochainJet && !((e.combats || 0) > 0) && !((e.jours || 0) > 0);
    window.blessuresApresCombat = (liste) => (liste || []).map(e => ({ ...e, ...((e.combats || 0) > 0 ? { combats: e.combats - 1 } : {}) }))
        .map(e => { if (e.combats === 0) delete e.combats; return e; }).filter(e => !gueri(e));
    window.blessuresApresJours = (liste, jours) => (liste || []).map(e => ({ ...e, ...((e.jours || 0) > 0 ? { jours: Math.max(0, e.jours - Math.max(0, jours || 0)) } : {}) }))
        .map(e => { if (e.jours === 0) delete e.jours; return e; }).filter(e => !gueri(e));
    window.blessuresApresSoins = (liste, uid) => (liste || []).map(e => (e.uid === uid ? (() => { const x = { ...e }; delete x.soins; return x; })() : e))
        .filter(e => !gueri(e));

    // Tout ce qu'une fin de combat écrit pour un héros : les blessures
    // anciennes décomptées, puis les nouvelles, le Veinard consommé, la mort.
    window.majBlessuresFinCombat = function (perso, tirage, cartesDuDeck, alea) {
        let liste = window.blessuresApresCombat(lireListe(perso));
        if (tirage && tirage.veinardConsomme) {
            const i = liste.findIndex(e => e.id === "BLE_VEINARD");
            if (i >= 0) liste.splice(i, 1);
        }
        let mort = false;
        ((tirage && tirage.tirages) || []).forEach(t => {
            const b = window.blessureParId(t.id);
            if (b && b.duree.mort) mort = true;
            const e = window.entreeBlessure(t.id, cartesDuDeck, alea);
            if (e) liste.push(e);
        });
        return { Blessures: liste, ...(mort ? { Mort_Definitive: true } : {}) };
    };

    // --- CE QU'ELLES FONT ----------------------------------------------------
    // Les nombres s'additionnent ; une limite de cases garde la plus stricte,
    // un coût multiplié le plus fort, un repos réduit le plus bas ; les listes
    // se rejoignent ; les drapeaux tiennent.
    window.atoutBlessures = function (perso) {
        if (!perso || perso.estMonstre || perso.estIllusion) return {};
        const r = {};
        lireListe(perso).forEach(inst => {
            const b = window.blessureParId(inst.id);
            const a = (b && typeof b.effet === "function") ? (b.effet(inst) || {}) : {};
            Object.keys(a).forEach(k => {
                const v = a[k];
                if (k === "maxCasesParTour" || k === "reposLongTaux") r[k] = r[k] === undefined ? v : Math.min(r[k], v);
                else if (k === "coutDeplacementMult" || k === "regenFixe") r[k] = Math.max(r[k] || 0, v);
                else if (k === "saignementDebut") {
                    const s = r[k] || { pv: 0, tours: 0 };
                    r[k] = { pv: Math.max(s.pv, v.pv), tours: Math.max(s.tours, v.tours) };
                }
                else if (typeof v === "number") r[k] = (r[k] || 0) + v;
                else if (Array.isArray(v)) r[k] = [...new Set([...(r[k] || []), ...v])];
                else if (v && typeof v === "object") {
                    r[k] = { ...(r[k] || {}) };
                    Object.keys(v).forEach(s => { r[k][s] = (r[k][s] || 0) + v[s]; });
                }
                else r[k] = v;
            });
        });
        return r;
    };

    // Le nom de la blessure qui pose ce drapeau (interditDeuxMains…), ou null :
    // l'inventaire dit pourquoi un objet ne sert plus (objets.js).
    window.blessureQuiInterdit = function (perso, cle) {
        if (!perso || perso.estMonstre || perso.estIllusion) return null;
        for (const inst of lireListe(perso)) {
            const b = window.blessureParId(inst.id);
            if (b && typeof b.effet === "function" && (b.effet(inst) || {})[cle]) return b.nom;
        }
        return null;
    };

    // Ce qui reste à une blessure, en toutes lettres (l'encart de l'Aperçu).
    window.resteBlessure = function (inst) {
        const b = window.blessureParId(inst && inst.id);
        if (!b) return "";
        const morceaux = [];
        if (inst.definitif) morceaux.push(b.cosmetique ? "cicatrice" : "définitif");
        if ((inst.jours || 0) > 0) morceaux.push(`${inst.jours} jour${inst.jours > 1 ? "s" : ""}${b.indisponible ? " d'inconscience" : ""}`);
        if ((inst.combats || 0) > 0) morceaux.push(`${inst.combats} combat${inst.combats > 1 ? "s" : ""}`);
        if (inst.soins) morceaux.push("jusqu'aux soins en ville");
        if (inst.prochainJet) morceaux.push("au prochain jet de blessure");
        return morceaux.join(" · ");
    };
    window.blessurePermanente = (inst) => !!(inst && inst.definitif);
})();
